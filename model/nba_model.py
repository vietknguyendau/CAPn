"""
NBA spread & total model, v3: trains on ESPN box scores (hosted on GitHub), then uploads to your board.

v3 adds:
  - Travel spots: distance flown, time zones crossed, altitude, road-trip length, 4 games in 6 nights.
  - Player values: learned from real games, how many points each player's absence costs his team
    (points of game score above a replacement player, per game).
    The board subtracts that when ESPN lists him out (half when questionable).

Runs automatically on GitHub (see .github/workflows/nba-model.yml).
To run it by hand:  pip install pandas numpy pyarrow scikit-learn requests
                    python model/nba_model.py
"""
import concurrent.futures as cf
import io
import json
import math
import os
import re
import unicodedata
from datetime import date

import numpy as np
import pandas as pd
import requests
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error

BOARD_URL = os.environ.get("BOARD_URL", "https://YOUR-PROJECT.vercel.app").strip().rstrip("/")
MODEL_SECRET = os.environ.get("MODEL_SECRET", "").strip()
DATA_DIR = os.environ.get("NBA_DATA_DIR")  # optional local cache of the parquet files

DATA_URL = ("https://github.com/sportsdataverse/sportsdataverse-data/releases/download/"
            "espn_nba_{kind}_boxscores/{kind}_box_{season}.parquet")

N_SEASONS = 6      # ESPN labels a season by its end year: 2027 = 2026-27
ROLL = 10          # keep at 10: the website expects L10 feature names
PRIOR_GAMES = 12   # last season counts like this many games; fades as games pile up
REGRESS = 0.25     # pull last season toward league average (roster turnover)
RATINGS = ["ORTG", "DRTG", "NET", "PACE"]
K_MIN = 300        # a player's last season counts like this many minutes of this season
K_GP = 5           # ...and like this many games for minutes per game
AVAIL_WINDOW = 10  # "recently available" = share of the team's last 10 games he played
TOTAL_RECENTER = 60  # shift totals by the model's average miss over the last 60 games (scoring levels drift)

# Closing lines: DraftKings, as saved in ESPN's game files (hosted on GitHub by sportsdataverse).
GAME_JSON = "https://raw.githubusercontent.com/sportsdataverse/hoopR-nba-raw/main/nba/json/final/{}.json"
LINES_CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "nba_lines.json")

# ESPN abbreviations -> the ones the website uses.
SITE = {"GS": "GSW", "SA": "SAS", "NY": "NYK", "NO": "NOP", "UTAH": "UTA", "WSH": "WAS"}

# Arena latitude, longitude, standard-time UTC offset. DEN and UTA play at altitude.
ARENAS = {
    "ATL": (33.757, -84.396, -5), "BOS": (42.366, -71.062, -5), "BKN": (40.683, -73.976, -5),
    "CHA": (35.225, -80.839, -5), "CHI": (41.881, -87.674, -6), "CLE": (41.496, -81.688, -5),
    "DAL": (32.790, -96.810, -6), "DEN": (39.749, -105.008, -7), "DET": (42.341, -83.055, -5),
    "GSW": (37.768, -122.388, -8), "HOU": (29.751, -95.362, -6), "IND": (39.764, -86.155, -5),
    "LAC": (33.945, -118.341, -8), "LAL": (34.043, -118.267, -8), "MEM": (35.138, -90.051, -6),
    "MIA": (25.781, -80.188, -5), "MIL": (43.045, -87.917, -6), "MIN": (44.979, -93.276, -6),
    "NOP": (29.949, -90.082, -6), "NYK": (40.751, -73.993, -5), "OKC": (35.463, -97.515, -6),
    "ORL": (28.539, -81.384, -5), "PHI": (39.901, -75.172, -5), "PHX": (33.446, -112.071, -7),
    "POR": (45.532, -122.667, -8), "SAC": (38.580, -121.500, -8), "SAS": (29.427, -98.438, -6),
    "TOR": (43.643, -79.379, -5), "UTA": (40.768, -111.901, -7), "WAS": (38.898, -77.021, -5),
}
ALTITUDE = {"DEN", "UTA"}


def current_season():
    t = date.today()
    return t.year + 1 if t.month >= 9 else t.year


def site(ab):
    return SITE.get(ab, ab)


def km(a, b):
    """Great-circle distance between two arenas, in kilometers."""
    if a not in ARENAS or b not in ARENAS:
        return 0.0
    la1, lo1, _ = ARENAS[a]
    la2, lo2, _ = ARENAS[b]
    p1, p2 = math.radians(la1), math.radians(la2)
    dp, dl = p2 - p1, math.radians(lo2 - lo1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def tz(a):
    return ARENAS[a][2] if a in ARENAS else 0


# ---------- 1. Data ----------
def read(kind, season):
    if DATA_DIR:
        path = os.path.join(DATA_DIR, f"{kind}_box_{season}.parquet")
        if os.path.exists(path):
            return pd.read_parquet(path)
    r = requests.get(DATA_URL.format(kind=kind, season=season), timeout=120)
    r.raise_for_status()
    return pd.read_parquet(io.BytesIO(r.content))


def load(seasons):
    teams, players = [], []
    for s in seasons:
        t = read("team", s)
        p = read("player", s)
        teams.append(t[t.season_type == 2])
        players.append(p[p.season_type == 2])
    return pd.concat(teams, ignore_index=True), pd.concat(players, ignore_index=True)


# ---------- 2. Team ratings, rest and travel ----------
def team_games(tb):
    df = pd.DataFrame({
        "GAME_ID": tb.game_id, "SEASON": tb.season, "GAME_DATE": pd.to_datetime(tb.game_date),
        "TEAM": tb.team_abbreviation.map(site), "OPP": tb.opponent_team_abbreviation.map(site),
        "HOME": (tb.team_home_away == "home").astype(int), "PTS": tb.team_score.astype(float),
        "POSS": tb.field_goals_attempted + 0.44 * tb.free_throws_attempted
                - tb.offensive_rebounds + tb.total_turnovers,
    })
    opp = df[["GAME_ID", "TEAM", "PTS", "POSS"]].rename(
        columns={"TEAM": "OPP", "PTS": "OPP_PTS", "POSS": "OPP_POSS"})
    df = df.merge(opp, on=["GAME_ID", "OPP"])
    df["PACE"] = (df.POSS + df.OPP_POSS) / 2
    df["ORTG"] = 100 * df.PTS / df.PACE
    df["DRTG"] = 100 * df.OPP_PTS / df.PACE
    df["NET"] = df.ORTG - df.DRTG
    df["ARENA"] = np.where(df.HOME == 1, df.TEAM, df.OPP)
    df = df.sort_values(["TEAM", "GAME_DATE"]).reset_index(drop=True)

    # Prior: last season's average pulled toward league average.
    seasons = sorted(df.SEASON.unique())
    team_szn = df.groupby(["TEAM", "SEASON"])[RATINGS].mean()
    league = df.groupby("SEASON")[RATINGS].mean()
    pri = {}
    for (team, szn) in team_szn.index:
        i = seasons.index(szn)
        base = league.loc[szn]
        if i > 0 and (team, seasons[i - 1]) in team_szn.index:
            base = (1 - REGRESS) * team_szn.loc[(team, seasons[i - 1])] + REGRESS * league.loc[seasons[i - 1]]
        pri[(team, szn)] = base
    pri = pd.DataFrame.from_dict(pri, orient="index")
    pri.index = pd.MultiIndex.from_tuples(pri.index, names=["TEAM", "SEASON"])
    pri.columns = [f"PRIOR_{c}" for c in pri.columns]
    df = df.join(pri, on=["TEAM", "SEASON"])

    g = df.groupby(["TEAM", "SEASON"])
    n = g.cumcount()
    for col in RATINGS:
        cur = g[col].transform(lambda s: s.shift(1).expanding(min_periods=1).mean())
        df[f"{col}_SZN"] = np.where(n == 0, df[f"PRIOR_{col}"],
                                    (n * cur.fillna(0) + PRIOR_GAMES * df[f"PRIOR_{col}"]) / (n + PRIOR_GAMES))
        df[f"{col}_L{ROLL}"] = g[col].transform(
            lambda s: s.shift(1).rolling(ROLL, min_periods=3).mean()).fillna(df[f"{col}_SZN"])

    # Rest
    df["REST"] = g["GAME_DATE"].diff().dt.days.clip(upper=4).fillna(4)
    df["B2B"] = (df.REST == 1).astype(int)
    df["G3IN4"] = (g["GAME_DATE"].diff(2).dt.days <= 3).astype(int)
    df["G4IN6"] = (g["GAME_DATE"].diff(3).dt.days <= 5).astype(int)

    # Travel since the previous game
    prev = g["ARENA"].shift(1)
    df["TRAVEL"] = [km(p, a) / 1000 if isinstance(p, str) else 0.0 for p, a in zip(prev, df.ARENA)]
    df["TZ_EAST"] = [tz(a) - tz(p) if isinstance(p, str) else 0 for p, a in zip(prev, df.ARENA)]
    # Road-trip length: consecutive away games including this one (0 at home)
    df["_chg"] = (df.HOME != g["HOME"].shift(1)).astype(int)
    df["_blk"] = df.groupby(["TEAM", "SEASON"])["_chg"].cumsum()
    run = df.groupby(["TEAM", "SEASON", "_blk"]).cumcount() + 1
    df["TRIP"] = np.where(df.HOME == 0, run, 0).clip(max=7)
    return df.drop(columns=["_chg", "_blk"])


# ---------- 3. Player values ----------
def game_score(p):
    return (p.points + 0.4 * p.field_goals_made - 0.7 * p.field_goals_attempted
            - 0.4 * (p.free_throws_attempted - p.free_throws_made)
            + 0.7 * p.offensive_rebounds + 0.3 * p.defensive_rebounds + p.steals
            + 0.7 * p.assists + 0.7 * p.blocks - 0.4 * p.fouls - p.turnovers)


def player_rows(pb):
    p = pb.copy()
    p["GAME_DATE"] = pd.to_datetime(p.game_date)
    p["TEAM"] = p.team_abbreviation.map(site)
    p["MIN"] = p.minutes.fillna(0).astype(float)
    p["PLAYED"] = ((p.MIN > 0) & (p.did_not_play != True)).astype(int)
    reason = p.reason.fillna("").str.upper()
    # Missing = listed but sat for injury, illness, rest, suspension, personal reasons. Not coach's decision.
    p["MISS"] = ((p.PLAYED == 0) & (p.did_not_play == True) & ~reason.str.contains("COACH")).astype(int)
    stats = ["points", "field_goals_made", "field_goals_attempted", "free_throws_attempted", "free_throws_made",
             "offensive_rebounds", "defensive_rebounds", "steals", "assists", "blocks", "fouls", "turnovers"]
    p[stats] = p[stats].fillna(0).astype(float)
    p["GS"] = np.where(p.PLAYED == 1, game_score(p), 0.0)
    return p.sort_values(["athlete_id", "GAME_DATE"]).reset_index(drop=True)


def last_season_stats(p):
    """Each player's per-minute game score and minutes per game, by season."""
    s = p[p.PLAYED == 1].groupby(["athlete_id", "season"]).agg(MIN=("MIN", "sum"), GS=("GS", "sum"),
                                                                GP=("PLAYED", "sum")).reset_index()
    s["GSPM"] = s.GS / s.MIN.clip(lower=1)
    s["MPG"] = s.MIN / s.GP.clip(lower=1)
    s["season"] = s.season + 1  # becomes the prior for the next season
    return s.rename(columns={"GSPM": "LAST_GSPM", "MPG": "LAST_MPG", "MIN": "LAST_MIN"})[
        ["athlete_id", "season", "LAST_GSPM", "LAST_MPG", "LAST_MIN"]]


def blend_values(p, cum_min, cum_gs, cum_gp, repl_gspm):
    last_gspm = p.LAST_GSPM.where(p.LAST_MIN >= 100, repl_gspm)
    last_mpg = p.LAST_MPG.fillna(0)
    gspm = (cum_gs + K_MIN * last_gspm) / (cum_min + K_MIN)
    has_last = p.LAST_MPG.notna()
    mpg = np.where(has_last, (cum_min + K_GP * last_mpg) / (cum_gp + K_GP),
                   np.where(cum_gp > 0, cum_min / cum_gp.clip(lower=1), 0.0))
    return gspm, mpg


def player_features(p):
    """Per player-game, using only earlier games: value inputs and how often he's been available lately."""
    p = p.merge(last_season_stats(p), on=["athlete_id", "season"], how="left")
    pool = p[p.PLAYED == 1].groupby(["athlete_id", "season"]).agg(MIN=("MIN", "sum"), GS=("GS", "sum"))
    pool = pool[pool.MIN >= 300]
    repl = float((pool.GS / pool.MIN).quantile(0.25))

    g = p.groupby(["athlete_id", "season"])
    cum_min = g.MIN.cumsum() - p.MIN
    cum_gs = g.GS.cumsum() - p.GS
    cum_gp = g.PLAYED.cumsum() - p.PLAYED
    p["GSPM"], p["MPG"] = blend_values(p, cum_min, cum_gs, cum_gp, repl)

    gt = p.groupby(["athlete_id", "season", "TEAM"])
    p["FRAC"] = gt.PLAYED.transform(
        lambda s: s.shift(1).rolling(AVAIL_WINDOW, min_periods=3).mean()).fillna(1.0)
    # Value = points of game score above a replacement player, per game. Weighted by recent availability,
    # so a player who has been out for weeks is already reflected in the team's ratings.
    p["M_VAL"] = p.MISS * p.FRAC * (p.GSPM - repl) * p.MPG
    team = p.groupby(["game_id", "TEAM"])["M_VAL"].sum().reset_index()
    team = team.rename(columns={"game_id": "GAME_ID", "M_VAL": "MISS_VAL"})
    return team, repl


def current_players(p, season, repl, coefs):
    """Values as of the latest game, for the website."""
    cur = p[p.season == season].merge(last_season_stats(p), on=["athlete_id", "season"], how="left")
    if cur.empty:
        return []
    agg = cur.groupby("athlete_id").agg(
        name=("athlete_display_name", "last"), TEAM=("TEAM", "last"), last=("GAME_DATE", "max"),
        MIN=("MIN", "sum"), GS=("GS", "sum"), GP=("PLAYED", "sum"),
        LAST_GSPM=("LAST_GSPM", "first"), LAST_MPG=("LAST_MPG", "first"), LAST_MIN=("LAST_MIN", "first"))
    gspm, mpg = blend_values(agg, agg.MIN, agg.GS, agg.GP, repl)
    agg["GSPM"], agg["MPG"] = gspm, mpg
    # Recent availability with his current team
    recent = cur.sort_values("GAME_DATE").groupby(["athlete_id", "TEAM"]).tail(AVAIL_WINDOW)
    frac = recent.groupby(["athlete_id", "TEAM"]).PLAYED.mean()
    newest = cur.GAME_DATE.max()
    out = []
    for aid, r in agg.iterrows():
        if (newest - r["last"]).days > 21 or r.MPG < 8:
            continue  # no longer on a roster, or not in the rotation
        fr = float(frac.get((aid, r.TEAM), 1.0))
        val = (r.GSPM - repl) * r.MPG
        out.append({"n": norm_name(r["name"]), "name": r["name"], "t": r.TEAM, "m": round(float(r.MPG), 1),
                    "gp": int(r.GP), "fr": round(fr, 2), "v": round(float(val), 2),
                    # Never let a player's absence help his team: box scores undersell defense-first players.
                    "mg": round(min(0.0, float(coefs["margin"] * val)), 2),
                    "tt": round(min(0.0, float(coefs["total"] * val)), 2)})
    return out


# ---------- 4. One row per game ----------
TEAM_FEATS = [f"{c}_{w}" for c in RATINGS for w in [f"L{ROLL}", "SZN"]] + \
             ["REST", "B2B", "G3IN4", "G4IN6", "TRAVEL", "TZ_EAST", "TRIP", "MISS_VAL"]

BASE_MARGIN = [f"D_NET_L{ROLL}", "D_NET_SZN", "D_REST", "D_B2B", "D_G3IN4"]
TRAVEL_MARGIN = ["D_G4IN6", "D_TRAVEL", "D_TZ_EAST", "TRIP_A", "HOME_ALT"]
PLAYER_MARGIN = ["D_MISS_VAL"]
BASE_TOTAL = ["PACE_SZN_H", "PACE_SZN_A", f"PACE_L{ROLL}_H", f"PACE_L{ROLL}_A",
              "ORTG_SZN_H", "DRTG_SZN_H", "ORTG_SZN_A", "DRTG_SZN_A"]
TRAVEL_TOTAL = ["HOME_ALT"]
PLAYER_TOTAL = ["S_MISS_VAL"]

MARGIN_FEATS = BASE_MARGIN + TRAVEL_MARGIN + PLAYER_MARGIN
TOTAL_FEATS = BASE_TOTAL + TRAVEL_TOTAL + PLAYER_TOTAL


def game_rows(tg, miss):
    tg = tg.merge(miss, on=["GAME_ID", "TEAM"], how="left")
    tg["MISS_VAL"] = tg["MISS_VAL"].fillna(0)
    cols = TEAM_FEATS + ["PTS", "TEAM", "GAME_DATE", "SEASON"]
    h = tg[tg.HOME == 1].set_index("GAME_ID")[cols]
    a = tg[tg.HOME == 0].set_index("GAME_ID")[cols]
    g = h.add_suffix("_H").join(a.add_suffix("_A"), how="inner")
    g["MARGIN"] = g.PTS_H - g.PTS_A
    g["TOTAL"] = g.PTS_H + g.PTS_A
    for f in TEAM_FEATS:
        g[f"D_{f}"] = g[f"{f}_H"] - g[f"{f}_A"]
    g["TRIP_A"] = g.TRIP_A
    g["HOME_ALT"] = g.TEAM_H.isin(ALTITUDE).astype(int)
    g["S_MISS_VAL"] = g.MISS_VAL_H + g.MISS_VAL_A
    return g


# ---------- 5. Current team state for the website ----------
def current_teams(tg, season):
    cur = tg[tg.SEASON == season].sort_values("GAME_DATE")
    out = {}
    for team, t in cur.groupby("TEAM"):
        n = len(t)
        last = t.iloc[-1]
        recent = t.tail(ROLL)
        streak = 0
        for h in reversed(t.HOME.tolist()):
            if h == 1:
                break
            streak += 1
        r = {"games": n, "last_game": last.GAME_DATE.strftime("%Y-%m-%d"),
             "recent_dates": t.GAME_DATE.dt.strftime("%Y-%m-%d").tolist()[-3:],
             "last_loc": last.ARENA, "away_streak": streak}
        for col in RATINGS:
            prior = last[f"PRIOR_{col}"]
            szn = (n * t[col].mean() + PRIOR_GAMES * prior) / (n + PRIOR_GAMES)
            r[f"{col}_SZN"] = szn
            r[f"{col}_L{ROLL}"] = recent[col].mean() if n >= 3 else szn
        out[team] = r
    return out


# ---------- 6. History: replay the model against closing lines ----------
def fetch_line(gid):
    """Returns [home spread, total], [] if the game has no line, or None on a network error."""
    try:
        r = requests.get(GAME_JSON.format(gid), timeout=60)
        if r.status_code == 404:
            return gid, []
        r.raise_for_status()
        pc = r.json().get("pickcenter") or []
        for x in sorted(pc, key=lambda x: (x.get("provider") or {}).get("priority", 99)):
            if x.get("spread") is not None or x.get("overUnder") is not None:
                return gid, [x.get("spread"), x.get("overUnder")]
        return gid, []
    except Exception:
        return gid, None


def closing_lines(game_ids):
    try:
        with open(LINES_CACHE) as fh:
            cache = json.load(fh)
    except Exception:
        cache = {}
    todo = [str(g) for g in game_ids if str(g) not in cache]
    if todo:
        print(f"Fetching closing lines for {len(todo)} games...")
        with cf.ThreadPoolExecutor(16) as ex:
            for gid, v in ex.map(fetch_line, todo):
                if v is not None:
                    cache[gid] = v
        os.makedirs(os.path.dirname(LINES_CACHE), exist_ok=True)
        with open(LINES_CACHE, "w") as fh:
            json.dump(cache, fh, separators=(",", ":"))
    return cache


HIST_COLS = ["date", "away", "home", "spread", "total", "pm", "pt", "away_pts", "home_pts"]


def history(games, season, first):
    """For last season and this one: the model's pre-game number for every game, trained only on
    earlier seasons, next to the closing line and the final score."""
    out = []
    want = games[games.SEASON_H >= season - 1]
    lines = closing_lines(want.index.tolist())
    for S in [season - 1, season]:
        tr, te = games[(games.SEASON_H < S) & (games.SEASON_H > first)], games[games.SEASON_H == S]
        if tr.empty or te.empty:
            continue
        pm = Ridge(alpha=1.0).fit(tr[MARGIN_FEATS], tr.MARGIN).predict(te[MARGIN_FEATS])
        tm = Ridge(alpha=1.0).fit(tr[TOTAL_FEATS], tr.TOTAL)
        pt = tm.predict(te[TOTAL_FEATS]) + recenter(games, tm).loc[te.index].to_numpy()
        rows = []
        for (gid, r), m, t in zip(te.iterrows(), pm, pt):
            ln = lines.get(str(gid)) or []
            if not ln or ln[0] is None:
                continue
            rows.append([r.GAME_DATE_H.strftime("%Y-%m-%d"), r.TEAM_A, r.TEAM_H, ln[0], ln[1],
                         round(float(m), 2), round(float(t), 2), int(r.PTS_A), int(r.PTS_H)])
        rows.sort(key=lambda x: x[0])
        out.append({"label": f"{S - 1}-{S - 2000:02d}", "rows": rows})
        print(f"History {S - 1}-{S - 2000:02d}: {len(rows)} games with closing lines.")
    return {"source": "DraftKings closing lines, via ESPN", "cols": HIST_COLS, "seasons": out}


def recenter(games, model):
    """Before each game: the total model's average miss over the previous TOTAL_RECENTER games."""
    g = games.sort_values("GAME_DATE_H")
    err = pd.Series(g.TOTAL.to_numpy() - model.predict(g[TOTAL_FEATS]), index=g.index)
    return err.shift(1).rolling(TOTAL_RECENTER, min_periods=30).mean().fillna(0)


def recent_results(games, days=30):
    newest = games.GAME_DATE_H.max()
    r = games[games.GAME_DATE_H >= newest - pd.Timedelta(days=days)]
    return [[d.strftime("%Y-%m-%d"), a, h, int(pa), int(ph)]
            for d, a, h, pa, ph in zip(r.GAME_DATE_H, r.TEAM_A, r.TEAM_H, r.PTS_A, r.PTS_H)]


# ---------- Helpers ----------
def norm_name(name):
    s = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z ]", "", s)
    s = re.sub(r"\b(jr|sr|ii|iii|iv)\b", "", s)
    return " ".join(s.split())


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


def build(seasons):
    tb, pb = load(seasons)
    tg = team_games(tb)
    p = player_rows(pb)
    miss, repl = player_features(p)
    games = game_rows(tg, miss)
    return tg, p, games, repl


# ---------- 7. Train, test, upload ----------
def main():
    season = current_season()
    seasons = list(range(season - N_SEASONS, season + 1))
    print(f"Loading NBA box scores, {seasons[0] - 1}-{seasons[0] - 2000:02d} through "
          f"{season - 1}-{season - 2000:02d}...")
    tg, p, games, repl = build(seasons)
    newest = tg.GAME_DATE.max().date()
    print(f"Latest game in the data: {newest}")
    if season in set(tg.SEASON) and (date.today() - newest).days > 4 and date.today().month not in (7, 8, 9):
        print("WARNING: the box-score data hasn't updated in over 4 days. Ratings may be stale.")

    games = games[games.SEASON_H > seasons[0]]  # first season only supplies priors
    test_szn = season - 1
    train, test = games[games.SEASON_H < test_szn], games[games.SEASON_H == test_szn]
    payload = {"trained_through": str(newest), "test": {}, "arenas": ARENAS, "altitude": sorted(ALTITUDE)}
    coefs = {}

    for target, feats, base in [("MARGIN", MARGIN_FEATS, BASE_MARGIN), ("TOTAL", TOTAL_FEATS, BASE_TOTAL)]:
        m = Ridge(alpha=1.0).fit(train[feats], train[target])
        mae = mean_absolute_error(test[target], m.predict(test[feats]))
        old = mean_absolute_error(test[target], Ridge(alpha=1.0).fit(train[base], train[target]).predict(test[base]))
        nos = mean_absolute_error(test[target], [train[target].mean()] * len(test))
        label = f"{test_szn - 1}-{test_szn - 2000}"
        print(f"{target}: model MAE {mae:.2f} (v2 features {old:.2f}), no-skill {nos:.2f} ({label})")
        payload["test"][target.lower()] = {"season": label, "mae": mae, "baseline_mae": nos, "v2_mae": old}

        final = Ridge(alpha=1.0).fit(games[feats], games[target])
        c = dict(zip(feats, final.coef_))
        intercept = final.intercept_
        if target == "TOTAL":
            # Recenter on recent scoring so the model doesn't lean Over (or Under) when the league shifts.
            g = games.sort_values("GAME_DATE_H").tail(TOTAL_RECENTER)
            shift = float(np.mean(g.TOTAL - final.predict(g[feats])))
            intercept += shift
            payload["total_shift"] = shift
            print(f"Totals recentered by {shift:+.2f} points to match the last {TOTAL_RECENTER} games.")
        payload[target.lower()] = {"intercept": intercept, "features": feats, "coefs": list(final.coef_)}
        coefs["margin" if target == "MARGIN" else "total"] = c["D_MISS_VAL" if target == "MARGIN" else "S_MISS_VAL"]

    payload["history"] = history(games, season, seasons[0])
    payload["results"] = recent_results(games)
    payload["teams"] = current_teams(tg, season)
    payload["players"] = current_players(p, season, repl, coefs)
    payload = clean(payload)
    with open("model.json", "w") as fh:
        json.dump(payload, fh, indent=2)
    top = sorted(payload["players"], key=lambda x: x["mg"])[:5]
    print(f"Saved model.json: {len(payload['teams'])} teams, {len(payload['players'])} players.")
    print("Most valuable right now (points of margin lost if out):",
          ", ".join(f"{x['name']} {x['mg']:+.1f}" for x in top))

    if "YOUR-PROJECT" in BOARD_URL or not MODEL_SECRET:
        print("BOARD_URL or MODEL_SECRET not set, so nothing was uploaded.")
        if os.environ.get("GITHUB_ACTIONS"):
            raise SystemExit("Add BOARD_URL and MODEL_SECRET under your repo's Settings > Secrets and variables > Actions.")
        return
    r = requests.post(f"{BOARD_URL}/api/model", json=payload,
                      headers={"Authorization": f"Bearer {MODEL_SECRET}"}, timeout=60)
    print("\nUpload:", r.status_code, r.text)
    r.raise_for_status()


if __name__ == "__main__":
    main()
