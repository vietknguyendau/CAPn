"""
NFL spread & total model: trains on nflverse play-by-play, then uploads to your board site.

Runs automatically on GitHub (see .github/workflows/nfl-model.yml).
To run it by hand:  pip install nflreadpy pandas pyarrow scikit-learn requests
                    python model/nfl_model.py
"""
import json
import os
import re
import unicodedata
from datetime import date, timedelta

import nflreadpy as nfl
import numpy as np
import pandas as pd
import requests
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error

BOARD_URL = os.environ.get("BOARD_URL", "").strip().rstrip("/")
MODEL_SECRET = os.environ.get("MODEL_SECRET", "").strip()

FIRST_SEASON = 2019
PRIOR_GAMES = 4    # last season counts like this many games; fades as games pile up
REGRESS = 1 / 3    # pull last season toward league average (roster and coaching turnover)
RATINGS = ["OFF_EPA", "DEF_EPA", "OFF_SR", "DEF_SR", "PF", "PA", "PLAYS"]
DOMES = {"dome", "closed"}


def current_season():
    t = date.today()
    return t.year if t.month >= 8 else t.year - 1


# ---------- 1. Data ----------
def load(seasons):
    sched = nfl.load_schedules(seasons).to_pandas()
    cols = ["game_id", "posteam", "defteam", "play_type", "epa", "success", "wp"]
    pbp = pd.concat([nfl.load_pbp([s]).select(cols).to_pandas() for s in seasons])
    return sched, pbp


def team_games(sched, pbp):
    """One row per team per completed game, with that game's efficiency."""
    plays = pbp[pbp.play_type.isin(["pass", "run"]) & pbp.epa.notna() & pbp.posteam.notna()]
    plays = plays[plays.wp.between(0.05, 0.95)]  # skip garbage time
    off = plays.groupby(["game_id", "posteam"]).agg(
        OFF_EPA=("epa", "mean"), OFF_SR=("success", "mean"), PLAYS=("epa", "size")).reset_index()
    off = off.rename(columns={"posteam": "team"})
    dfn = plays.groupby(["game_id", "defteam"]).agg(
        DEF_EPA=("epa", "mean"), DEF_SR=("success", "mean")).reset_index()
    dfn = dfn.rename(columns={"defteam": "team"})

    done = sched[sched.home_score.notna()]
    rows = []
    for side, other in [("home", "away"), ("away", "home")]:
        r = pd.DataFrame({
            "game_id": done.game_id, "season": done.season, "gameday": done.gameday,
            "team": done[f"{side}_team"], "PF": done[f"{side}_score"], "PA": done[f"{other}_score"],
        })
        rows.append(r)
    tg = pd.concat(rows).merge(off, on=["game_id", "team"], how="left") \
                        .merge(dfn, on=["game_id", "team"], how="left")
    tg["gameday"] = pd.to_datetime(tg.gameday)
    return add_priors(tg.sort_values(["team", "gameday"]).reset_index(drop=True))


def add_priors(tg):
    """Season-to-date ratings blended with last season's, using only earlier games."""
    seasons = sorted(tg.season.unique())
    team_szn = tg.groupby(["team", "season"])[RATINGS].mean()
    league = tg.groupby("season")[RATINGS].mean()
    pri = {}
    for (team, szn) in team_szn.index:
        base = league.loc[szn]
        i = seasons.index(szn)
        if i > 0 and (team, seasons[i - 1]) in team_szn.index:
            base = (1 - REGRESS) * team_szn.loc[(team, seasons[i - 1])] + REGRESS * league.loc[seasons[i - 1]]
        pri[(team, szn)] = base
    pri = pd.DataFrame.from_dict(pri, orient="index")
    pri.index = pd.MultiIndex.from_tuples(pri.index, names=["team", "season"])
    pri.columns = [f"PRIOR_{c}" for c in pri.columns]
    tg = tg.join(pri, on=["team", "season"])

    g = tg.groupby(["team", "season"])
    n = g.cumcount()
    for c in RATINGS:
        cur = g[c].transform(lambda s: s.shift(1).expanding(min_periods=1).mean()).fillna(0)
        tg[f"{c}_PRE"] = (n * cur + PRIOR_GAMES * tg[f"PRIOR_{c}"]) / (n + PRIOR_GAMES)
    return tg


def current_ratings(tg, season):
    out = {}
    for team, t in tg[tg.season == season].groupby("team"):
        n = len(t)
        last = t.iloc[-1]
        out[team] = {c: (n * t[c].mean() + PRIOR_GAMES * last[f"PRIOR_{c}"]) / (n + PRIOR_GAMES)
                     for c in RATINGS}
        out[team]["games"] = n
    return out


# ---------- 2. Game features ----------
MARGIN_FEATS = ["D_NET_EPA", "D_NET_SR", "D_PD", "HOME", "D_REST"]
TOTAL_FEATS = ["S_OFF_EPA", "S_DEF_EPA", "S_PLAYS", "S_PF", "S_PA", "DOME"]


def features(h, a, row):
    """h, a: rating dicts (keys like OFF_EPA). row: schedule row."""
    return {
        "D_NET_EPA": (h["OFF_EPA"] - h["DEF_EPA"]) - (a["OFF_EPA"] - a["DEF_EPA"]),
        "D_NET_SR": (h["OFF_SR"] - h["DEF_SR"]) - (a["OFF_SR"] - a["DEF_SR"]),
        "D_PD": (h["PF"] - h["PA"]) - (a["PF"] - a["PA"]),
        "HOME": 0 if row["location"] == "Neutral" else 1,
        "D_REST": float(np.clip((row["home_rest"] or 7) - (row["away_rest"] or 7), -7, 7)),
        "S_OFF_EPA": h["OFF_EPA"] + a["OFF_EPA"],
        "S_DEF_EPA": h["DEF_EPA"] + a["DEF_EPA"],
        "S_PLAYS": h["PLAYS"] + a["PLAYS"],
        "S_PF": h["PF"] + a["PF"],
        "S_PA": h["PA"] + a["PA"],
        "DOME": 1 if str(row["roof"]).lower() in DOMES else 0,
    }


def training_rows(sched, tg):
    pre = tg.set_index(["game_id", "team"])[[f"{c}_PRE" for c in RATINGS]]
    pre.columns = RATINGS
    pre = pre.to_dict("index")
    out = []
    for row in sched[sched.home_score.notna()].to_dict("records"):
        h = pre.get((row["game_id"], row["home_team"]))
        a = pre.get((row["game_id"], row["away_team"]))
        if not h or not a or any(pd.isna(v) for v in list(h.values()) + list(a.values())):
            continue
        f = features(h, a, row)
        f.update(season=row["season"], MARGIN=row["result"], TOTAL=row["total"],
                 spread_line=row["spread_line"], total_line=row["total_line"])
        out.append(f)
    return pd.DataFrame(out)


# ---------- 3. Backtest against the closing line ----------
def ats(pred, line, result, min_edge):
    """Win rate betting the model's side when it disagrees with the close by min_edge+."""
    edge = pred - line
    pick = np.sign(edge)
    cover = np.sign(result - line)
    m = (np.abs(edge) >= min_edge) & (cover != 0) & ~np.isnan(line)
    if m.sum() == 0:
        return None, 0
    return float((pick[m] == cover[m]).mean()), int(m.sum())


# ---------- 4. Key players (from recent snap counts) ----------
def norm_name(name):
    s = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z ]", "", s)
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", s)
    return " ".join(s.split())


def key_players(season):
    try:
        sc = nfl.load_snap_counts([season]).to_pandas()
    except Exception as e:
        print("Couldn't get snap counts (injury flags will be less precise):", e)
        return []
    out = []
    for team, t in sc.groupby("team"):
        recent = t.sort_values("week").game_id.drop_duplicates().tail(4).tolist()
        r = t[t.game_id.isin(recent)]
        for (player, pos), p in r.groupby(["player", "position"]):
            off = p.offense_pct.sum() / len(recent)
            dfn = p.defense_pct.sum() / len(recent)
            share = max(off, dfn)
            role = "QB1" if pos == "QB" and off >= 0.6 else "starter" if share >= 0.7 else None
            if role:
                out.append({"n": norm_name(player), "name": player, "t": team, "pos": pos,
                            "pct": round(float(share), 2), "role": role})
    return out


def clean(x):
    if isinstance(x, dict):
        return {k: clean(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [clean(v) for v in x]
    if isinstance(x, (float, np.floating)):
        return None if np.isnan(x) else round(float(x), 4)
    if isinstance(x, (np.integer, np.bool_)):
        return int(x)
    return x


# ---------- 5. Train, backtest, predict, upload ----------
def main():
    season = current_season()
    seasons = list(range(FIRST_SEASON, season + 1))
    print(f"Loading NFL data {seasons[0]}-{season}...")
    sched, pbp = load(seasons)
    tg = team_games(sched, pbp)
    rows = training_rows(sched, tg)

    test_szn = season - 1
    train, test = rows[rows.season < test_szn], rows[rows.season == test_szn]
    payload = {"sport": "nfl", "trained_through": str(tg.gameday.max().date()), "test": {}}

    for target, feats, line_col in [("MARGIN", MARGIN_FEATS, "spread_line"),
                                    ("TOTAL", TOTAL_FEATS, "total_line")]:
        m = Ridge(alpha=1.0).fit(train[feats], train[target])
        pred = m.predict(test[feats])
        mae = mean_absolute_error(test[target], pred)
        base = mean_absolute_error(test[target], [train[target].mean()] * len(test))
        ok = test[line_col].notna()
        market = mean_absolute_error(test[target][ok], test[line_col][ok])
        res = {"season": int(test_szn), "games": int(len(test)), "mae": mae,
               "baseline_mae": base, "market_mae": market, "ats": {}}
        print(f"\n{target} ({test_szn}, {len(test)} games): model MAE {mae:.2f}, "
              f"closing line {market:.2f}, no-skill {base:.2f}")
        for e in [1, 2, 3, 4]:
            rate, n = ats(pred, test[line_col].to_numpy(), test[target].to_numpy(), e)
            if rate is not None:
                res["ats"][str(e)] = {"win": rate, "n": n}
                print(f"  edge {e}+ vs close: {rate:.1%} over {n} bets (need 52.4% to profit at -110)")
        payload["test"][target.lower()] = res

        final = Ridge(alpha=1.0).fit(rows[feats], rows[target])
        payload[target.lower()] = {"intercept": final.intercept_, "features": feats,
                                   "coefs": list(final.coef_)}

    # Predict the next 10 days of games from current ratings.
    ratings = current_ratings(tg, season)
    models = {k: payload[k] for k in ["margin", "total"]}
    lin = lambda md, f: md["intercept"] + sum(c * f[k] for k, c in zip(md["features"], md["coefs"]))
    today = date.today()
    upcoming = sched[sched.home_score.isna()].copy()
    upcoming["d"] = pd.to_datetime(upcoming.gameday).dt.date
    upcoming = upcoming[(upcoming.d >= today - timedelta(days=1)) & (upcoming.d <= today + timedelta(days=10))]
    preds = []
    for row in upcoming.to_dict("records"):
        h, a = ratings.get(row["home_team"]), ratings.get(row["away_team"])
        if not h or not a:
            continue
        f = features(h, a, row)
        preds.append({"home": row["home_team"], "away": row["away_team"], "gameday": row["gameday"],
                      "week": row["week"], "margin": lin(models["margin"], f), "total": lin(models["total"], f),
                      "home_rest": row["home_rest"], "away_rest": row["away_rest"],
                      "home_qb": row.get("home_qb_name"), "away_qb": row.get("away_qb_name")})
    payload["predictions"] = preds
    payload["teams"] = ratings
    payload["players"] = key_players(season)
    payload = clean(payload)

    with open("nfl_model.json", "w") as fh:
        json.dump(payload, fh, indent=2)
    print(f"\nSaved nfl_model.json: {len(preds)} upcoming games, {len(payload['players'])} key players.")

    if not BOARD_URL or not MODEL_SECRET:
        print("BOARD_URL or MODEL_SECRET not set, so nothing was uploaded.")
        if os.environ.get("GITHUB_ACTIONS"):
            raise SystemExit("Add BOARD_URL and MODEL_SECRET under your repo's Settings > Secrets and variables > Actions.")
        return
    r = requests.post(f"{BOARD_URL}/api/model?sport=nfl", json=payload,
                      headers={"Authorization": f"Bearer {MODEL_SECRET}"}, timeout=60)
    print("Upload:", r.status_code, r.text)
    r.raise_for_status()


if __name__ == "__main__":
    main()
