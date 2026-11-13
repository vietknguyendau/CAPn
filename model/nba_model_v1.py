"""
NBA spread & total model, v1: trains, then uploads to your board site.

Run this on your own computer (stats.nba.com blocks cloud servers):
    pip install nba_api pandas numpy scikit-learn requests
    python model/nba_model_v1.py

Re-run it every day or two so team ratings stay current.
"""
import json
import os
import time
from getpass import getpass

import numpy as np
import pandas as pd
import requests
from nba_api.stats.endpoints import leaguegamefinder
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error

# Change this to your Vercel URL after you deploy.
BOARD_URL = "https://YOUR-PROJECT.vercel.app"

SEASONS = ["2021-22", "2022-23", "2023-24", "2024-25", "2025-26", "2026-27"]
CURRENT_SEASON = SEASONS[-1]
ROLL = 10  # keep at 10: the website expects L10 feature names


# ---------- 1. Pull team-game logs ----------
def fetch_season(season):
    df = leaguegamefinder.LeagueGameFinder(
        season_nullable=season,
        league_id_nullable="00",
        season_type_nullable="Regular Season",
    ).get_data_frames()[0]
    df["SEASON"] = season
    time.sleep(1.5)
    return df


# ---------- 2. Team efficiency + rolling features ----------
def team_games(raw):
    df = raw.copy()
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"])
    df["HOME"] = df["MATCHUP"].str.contains("vs.").astype(int)
    df["POSS"] = df["FGA"] + 0.44 * df["FTA"] - df["OREB"] + df["TOV"]

    opp = df[["GAME_ID", "TEAM_ID", "PTS", "POSS"]].rename(
        columns={"TEAM_ID": "OPP_ID", "PTS": "OPP_PTS", "POSS": "OPP_POSS"})
    df = df.merge(opp, on="GAME_ID")
    df = df[df.TEAM_ID != df.OPP_ID]

    df["PACE"] = (df.POSS + df.OPP_POSS) / 2
    df["ORTG"] = 100 * df.PTS / df.PACE
    df["DRTG"] = 100 * df.OPP_PTS / df.PACE
    df["NET"] = df.ORTG - df.DRTG

    df = df.sort_values(["TEAM_ID", "GAME_DATE"])
    g = df.groupby(["TEAM_ID", "SEASON"])
    for col in ["ORTG", "DRTG", "NET", "PACE"]:
        df[f"{col}_L{ROLL}"] = g[col].transform(
            lambda s: s.shift(1).rolling(ROLL, min_periods=3).mean())
        df[f"{col}_SZN"] = g[col].transform(
            lambda s: s.shift(1).expanding(min_periods=3).mean())

    df["REST"] = g["GAME_DATE"].diff().dt.days.clip(upper=4).fillna(4)
    df["B2B"] = (df.REST == 1).astype(int)
    return df


# ---------- 3. One row per game ----------
TEAM_FEATS = [f"{c}_{w}" for c in ["ORTG", "DRTG", "NET", "PACE"]
              for w in [f"L{ROLL}", "SZN"]] + ["REST", "B2B"]
MARGIN_FEATS = [f"D_NET_L{ROLL}", "D_NET_SZN", "D_REST", "D_B2B"]
TOTAL_FEATS = ["PACE_SZN_H", "PACE_SZN_A", f"PACE_L{ROLL}_H", f"PACE_L{ROLL}_A",
               "ORTG_SZN_H", "DRTG_SZN_H", "ORTG_SZN_A", "DRTG_SZN_A"]


def game_rows(tg):
    cols = TEAM_FEATS + ["PTS", "TEAM_ABBREVIATION", "GAME_DATE", "SEASON"]
    h = tg[tg.HOME == 1].set_index("GAME_ID")[cols]
    a = tg[tg.HOME == 0].set_index("GAME_ID")[cols]
    g = h.join(a, lsuffix="_H", rsuffix="_A", how="inner")
    g["MARGIN"] = g.PTS_H - g.PTS_A
    g["TOTAL"] = g.PTS_H + g.PTS_A
    for f in TEAM_FEATS:
        g[f"D_{f}"] = g[f"{f}_H"] - g[f"{f}_A"]
    return g


# ---------- 4. Current team ratings (through each team's latest game) ----------
def current_ratings(tg):
    cur = tg[tg.SEASON == CURRENT_SEASON].sort_values("GAME_DATE")
    out = {}
    for team, t in cur.groupby("TEAM_ABBREVIATION"):
        if len(t) < 3:
            continue
        recent = t.tail(ROLL)
        r = {"games": len(t), "last_game": t.GAME_DATE.max().strftime("%Y-%m-%d")}
        for col in ["ORTG", "DRTG", "NET", "PACE"]:
            r[f"{col}_L{ROLL}"] = recent[col].mean()
            r[f"{col}_SZN"] = t[col].mean()
        out[team] = r
    return out


def clean(x):
    if isinstance(x, dict):
        return {k: clean(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [clean(v) for v in x]
    if isinstance(x, (float, np.floating)):
        return None if np.isnan(x) else round(float(x), 4)
    if isinstance(x, np.integer):
        return int(x)
    return x


def push(payload):
    if "YOUR-PROJECT" in BOARD_URL:
        print("\nSet BOARD_URL at the top of this file to upload. Saved model.json locally only.")
        return
    secret = os.environ.get("MODEL_SECRET") or getpass("Paste your MODEL_SECRET: ")
    r = requests.post(f"{BOARD_URL.rstrip('/')}/api/model", json=payload,
                      headers={"Authorization": f"Bearer {secret}"}, timeout=30)
    print("\nUpload:", r.status_code, r.text)


# ---------- 5. Train, test, export ----------
if __name__ == "__main__":
    raw = pd.concat([fetch_season(s) for s in SEASONS])
    tg = team_games(raw)
    games = game_rows(tg).dropna(subset=MARGIN_FEATS + TOTAL_FEATS)

    # Honest test: train on older seasons, score the last completed season.
    test_szn = SEASONS[-2]
    train = games[games.SEASON_H < test_szn]
    test = games[games.SEASON_H == test_szn]

    payload = {"trained_through": str(games.GAME_DATE_H.max().date()), "test": {},
               "teams": current_ratings(tg)}

    for target, feats in [("MARGIN", MARGIN_FEATS), ("TOTAL", TOTAL_FEATS)]:
        m = Ridge(alpha=1.0).fit(train[feats], train[target])
        mae = mean_absolute_error(test[target], m.predict(test[feats]))
        base = mean_absolute_error(test[target], [train[target].mean()] * len(test))
        print(f"{target}: model MAE {mae:.2f}, baseline MAE {base:.2f} ({test_szn})")
        payload["test"][target.lower()] = {"season": test_szn, "mae": mae, "baseline_mae": base}

        # Production fit: all games, including this season so far.
        final = Ridge(alpha=1.0).fit(games[feats], games[target])
        payload[target.lower()] = {"intercept": final.intercept_,
                                   "features": feats, "coefs": list(final.coef_)}

    payload = clean(payload)
    with open("model.json", "w") as fh:
        json.dump(payload, fh, indent=2)
    print(f"Saved model.json with {len(payload['teams'])} teams.")
    push(payload)
