"""
NBA totals features: pace and four-factor efficiency, all computed from games played BEFORE each game.

One row per team-game (`team_game_features`) and one row per game (`game_rows`), built from the same
ESPN box scores the board's NBA model uses. Nothing here looks at the game being predicted.
"""
from __future__ import annotations

import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import nba_model as M  # noqa: E402

# Per-game stats, for a team's offense. The same stat for its opponent in that game is what it "allowed".
STATS = ["PACE", "ORTG", "EFG", "TOV", "ORB", "FTR", "PAR3", "FG2", "FG3", "FTP"]
WINDOWS = {"SZN": None, "L10": 10, "L5": 5}
PRIOR_GAMES = 12     # last season counts like this many games early in a season (as in nba_model.py)
REGRESS = 0.25       # pull last season's numbers this far toward league average


def box_rows(tb: pd.DataFrame) -> pd.DataFrame:
    """Team-game box stats, with possessions and the four factors."""
    d = pd.DataFrame({
        "GAME_ID": tb.game_id, "SEASON": tb.season, "GAME_DATE": pd.to_datetime(tb.game_date),
        "TEAM": tb.team_abbreviation.map(M.site), "OPP": tb.opponent_team_abbreviation.map(M.site),
        "HOME": (tb.team_home_away == "home").astype(int), "PTS": tb.team_score.astype(float),
        "FGM": tb.field_goals_made, "FGA": tb.field_goals_attempted,
        "FG3M": tb.three_point_field_goals_made, "FG3A": tb.three_point_field_goals_attempted,
        "FTM": tb.free_throws_made, "FTA": tb.free_throws_attempted,
        "OREB": tb.offensive_rebounds, "DREB": tb.defensive_rebounds, "TOVN": tb.total_turnovers,
    })
    d["POSS"] = d.FGA + 0.44 * d.FTA - d.OREB + d.TOVN
    opp = d[["GAME_ID", "TEAM", "POSS", "DREB"]].rename(columns={"TEAM": "OPP", "POSS": "OPP_POSS", "DREB": "OPP_DREB"})
    d = d.merge(opp, on=["GAME_ID", "OPP"])
    d["PACE"] = (d.POSS + d.OPP_POSS) / 2                   # shared by both teams
    d["ORTG"] = 100 * d.PTS / d.PACE
    d["EFG"] = (d.FGM + 0.5 * d.FG3M) / d.FGA
    d["TOV"] = d.TOVN / d.PACE
    d["ORB"] = d.OREB / (d.OREB + d.OPP_DREB)
    d["FTR"] = d.FTA / d.FGA
    d["PAR3"] = d.FG3A / d.FGA
    d["FG2"] = (d.FGM - d.FG3M) / (d.FGA - d.FG3A).clip(lower=1)
    d["FG3"] = d.FG3M / d.FG3A.clip(lower=1)
    d["FTP"] = d.FTM / d.FTA.clip(lower=1)
    allowed = d[["GAME_ID", "TEAM"] + STATS].rename(columns={"TEAM": "OPP", **{s: f"A_{s}" for s in STATS}})
    d = d.merge(allowed, on=["GAME_ID", "OPP"])
    d["ARENA"] = np.where(d.HOME == 1, d.TEAM, d.OPP)
    return d.sort_values(["TEAM", "GAME_DATE"]).reset_index(drop=True)


def _priors(d: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    """Last season's average, pulled toward league average; league average for a team's first season."""
    seasons = sorted(d.SEASON.unique())
    team = d.groupby(["TEAM", "SEASON"])[cols].mean()
    league = d.groupby("SEASON")[cols].mean()
    rows = {}
    for (t, s) in team.index:
        i = seasons.index(s)
        base = league.loc[s]
        if i > 0 and (t, seasons[i - 1]) in team.index:
            base = (1 - REGRESS) * team.loc[(t, seasons[i - 1])] + REGRESS * league.loc[seasons[i - 1]]
        rows[(t, s)] = base
    out = pd.DataFrame.from_dict(rows, orient="index")
    out.index = pd.MultiIndex.from_tuples(out.index, names=["TEAM", "SEASON"])
    return out


def team_game_features(d: pd.DataFrame) -> pd.DataFrame:
    """Season-to-date (blended with last season early on), last-10, last-5 and venue splits, before each game."""
    cols = STATS + [f"A_{s}" for s in STATS]
    pri = _priors(d, cols).add_prefix("PRI_")
    d = d.join(pri, on=["TEAM", "SEASON"])
    g = d.groupby(["TEAM", "SEASON"])
    n = g.cumcount()
    for c in cols:
        prev = g[c].transform(lambda s: s.shift(1).expanding(min_periods=1).mean())
        szn = np.where(n == 0, d[f"PRI_{c}"], (n * prev.fillna(0) + PRIOR_GAMES * d[f"PRI_{c}"]) / (n + PRIOR_GAMES))
        d[f"{c}_SZN"] = szn
        for w, k in [("L10", 10), ("L5", 5)]:
            d[f"{c}_{w}"] = g[c].transform(lambda s, k=k: s.shift(1).rolling(k, min_periods=3).mean()).fillna(d[f"{c}_SZN"])
    # Venue split: the team's home games (or road games) so far this season, blended like the season numbers.
    gv = d.groupby(["TEAM", "SEASON", "HOME"])
    nv = gv.cumcount()
    for c in ["PACE", "ORTG", "A_ORTG"]:
        prev = gv[c].transform(lambda s: s.shift(1).expanding(min_periods=1).mean())
        d[f"{c}_VEN"] = np.where(nv == 0, d[f"{c}_SZN"],
                                 (nv * prev.fillna(0) + PRIOR_GAMES * d[f"{c}_SZN"]) / (nv + PRIOR_GAMES))
    d["GP"] = n                                              # games already played this season
    # Rest and schedule
    d["REST"] = g["GAME_DATE"].diff().dt.days.clip(upper=4).fillna(4)
    d["B2B"] = (d.REST == 1).astype(int)
    return d


def league_to_date(d: pd.DataFrame) -> pd.DataFrame:
    """League average pace and ORtg from games before each date (first night of a season: last season's)."""
    day = d.groupby(["SEASON", "GAME_DATE"])[["PACE", "ORTG"]].agg(["sum", "count"])
    out = []
    for s, x in day.groupby(level=0):
        sums = x.xs("sum", axis=1, level=1).cumsum().shift(1)
        cnts = x.xs("count", axis=1, level=1).cumsum().shift(1)
        avg = (sums / cnts).reset_index()
        out.append(avg)
    lg = pd.concat(out).rename(columns={"PACE": "LG_PACE", "ORTG": "LG_ORTG"})
    season_avg = d.groupby("SEASON")[["PACE", "ORTG"]].mean().shift(1)
    lg = lg.merge(season_avg.rename(columns={"PACE": "PREV_PACE", "ORTG": "PREV_ORTG"}), left_on="SEASON", right_index=True)
    lg["LG_PACE"] = lg.LG_PACE.fillna(lg.PREV_PACE)
    lg["LG_ORTG"] = lg.LG_ORTG.fillna(lg.PREV_ORTG)
    return lg[["SEASON", "GAME_DATE", "LG_PACE", "LG_ORTG"]]


TEAM_COLS = [f"{c}_{w}" for c in STATS + [f"A_{s}" for s in STATS] for w in WINDOWS] + \
            ["PACE_VEN", "ORTG_VEN", "A_ORTG_VEN", "REST", "B2B", "GP"]


def game_rows(d: pd.DataFrame, miss: pd.DataFrame | None = None) -> pd.DataFrame:
    """One row per game: home features `_H`, away `_A`, league averages, actual possessions and points."""
    d = d.merge(league_to_date(d), on=["SEASON", "GAME_DATE"], how="left")
    if miss is not None:
        d = d.merge(miss.rename(columns={"GAME_ID": "GAME_ID"}), on=["GAME_ID", "TEAM"], how="left")
        d["MISS_VAL"] = d.MISS_VAL.fillna(0)
    else:
        d["MISS_VAL"] = 0.0
    keep = TEAM_COLS + ["TEAM", "PTS", "PACE", "ORTG", "MISS_VAL", "GAME_DATE", "SEASON", "LG_PACE", "LG_ORTG"]
    h = d[d.HOME == 1].set_index("GAME_ID")[keep].add_suffix("_H")
    a = d[d.HOME == 0].set_index("GAME_ID")[keep].add_suffix("_A")
    gm = h.join(a, how="inner")
    gm = gm.rename(columns={"GAME_DATE_H": "DATE", "SEASON_H": "SEASON", "LG_PACE_H": "LG_PACE",
                            "LG_ORTG_H": "LG_ORTG", "PACE_H": "POSS"})
    gm = gm.copy()
    gm["TOTAL"] = gm.PTS_H + gm.PTS_A
    gm["ALT"] = gm.TEAM_H.isin(M.ALTITUDE).astype(int)
    return gm.drop(columns=["GAME_DATE_A", "SEASON_A", "LG_PACE_A", "LG_ORTG_A", "PACE_A"]).sort_values("DATE")


def build(seasons):
    tb, pb = M.load(seasons)
    d = team_game_features(box_rows(tb))
    miss, _ = M.player_features(M.player_rows(pb))
    return game_rows(d, miss)
