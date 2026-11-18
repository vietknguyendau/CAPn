"""
NBA totals projection: possessions x points per possession, with candidates compared chronologically.

Candidates (all use only information from before each game):
  baseline   the brief's formula: poss = pace A + pace B - league; ORtg A = ORtg A + DRtg B - league
  baseline_r the baseline, recentered on its own misses over the previous 60 games
  fitted     ridge models for possessions and each team's points per 100 possessions (four factors,
             recent form, venue splits, rest, altitude, injuries), then recentered
The best by out-of-sample error is kept as the production model.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge

RECENTER = 60

PACE_FEATS = ["PACE_SZN_H", "PACE_SZN_A", "PACE_L10_H", "PACE_L10_A", "PACE_L5_H", "PACE_L5_A",
              "PACE_VEN_H", "PACE_VEN_A", "LG_PACE", "REST_H", "REST_A", "B2B_H", "B2B_A"]

# Offense of side X against the defense of side Y. Suffixes are filled in by eff_frame().
OFF = ["ORTG_SZN", "ORTG_L10", "ORTG_L5", "ORTG_VEN", "EFG_SZN", "TOV_SZN", "ORB_SZN", "FTR_SZN", "PAR3_SZN",
       "EFG_L10", "TOV_L10", "ORB_L10", "FTR_L10"]
DEF = ["A_ORTG_SZN", "A_ORTG_L10", "A_ORTG_VEN", "A_EFG_SZN", "A_TOV_SZN", "A_ORB_SZN", "A_FTR_SZN", "A_PAR3_SZN",
       "A_EFG_L10", "A_TOV_L10"]
EFF_FEATS = [f"O_{c}" for c in OFF] + [f"D_{c}" for c in DEF] + \
            ["IS_HOME", "REST_O", "REST_D", "B2B_O", "B2B_D", "ALT", "LG_ORTG", "MISS_O", "MISS_D"]


def baseline(g: pd.DataFrame) -> pd.DataFrame:
    poss = g.PACE_SZN_H + g.PACE_SZN_A - g.LG_PACE
    oh = g.ORTG_SZN_H + g.A_ORTG_SZN_A - g.LG_ORTG
    oa = g.ORTG_SZN_A + g.A_ORTG_SZN_H - g.LG_ORTG
    return pd.DataFrame({"poss": poss, "ortg_h": oh, "ortg_a": oa, "total": poss * (oh + oa) / 100}, index=g.index)


def eff_frame(g: pd.DataFrame, side: str) -> pd.DataFrame:
    """Rows for one team's offense ('H' or 'A') against the other team's defense."""
    o, d = side, ("A" if side == "H" else "H")
    f = pd.DataFrame(index=g.index)
    for c in OFF:
        f[f"O_{c}"] = g[f"{c}_{o}"]
    for c in DEF:
        f[f"D_{c}"] = g[f"{c}_{d}"]
    f["IS_HOME"] = 1 if side == "H" else 0
    f["REST_O"], f["REST_D"] = g[f"REST_{o}"], g[f"REST_{d}"]
    f["B2B_O"], f["B2B_D"] = g[f"B2B_{o}"], g[f"B2B_{d}"]
    f["ALT"] = g.ALT
    f["LG_ORTG"] = g.LG_ORTG
    f["MISS_O"], f["MISS_D"] = g[f"MISS_VAL_{o}"], g[f"MISS_VAL_{d}"]
    return f


class Fitted:
    """Possessions model + points-per-100 model (one row per team per game)."""

    def fit(self, g: pd.DataFrame):
        g = g.dropna(subset=["POSS", "ORTG_H", "ORTG_A"])
        self.pace = Ridge(alpha=1.0).fit(g[PACE_FEATS], g.POSS)
        X = pd.concat([eff_frame(g, "H"), eff_frame(g, "A")])
        y = pd.concat([g.ORTG_H, g.ORTG_A])
        self.eff = Ridge(alpha=1.0).fit(X[EFF_FEATS], y)
        return self

    def predict(self, g: pd.DataFrame) -> pd.DataFrame:
        poss = self.pace.predict(g[PACE_FEATS])
        oh = self.eff.predict(eff_frame(g, "H")[EFF_FEATS])
        oa = self.eff.predict(eff_frame(g, "A")[EFF_FEATS])
        return pd.DataFrame({"poss": poss, "ortg_h": oh, "ortg_a": oa, "total": poss * (oh + oa) / 100}, index=g.index)


def recenter(g: pd.DataFrame, pred_total: pd.Series, window: int = RECENTER) -> pd.Series:
    """Before each game: the average miss (actual - predicted) over the previous `window` games."""
    order = g.sort_values("DATE").index
    err = (g.TOTAL - pred_total).loc[order]
    return err.shift(1).rolling(window, min_periods=30).mean().fillna(0).reindex(g.index)


# ---------------------------------------------------------------- production projection
# Chosen in Phase 2: the brief's baseline with a half-strength 60-game drift correction. Out of sample it
# tied for the lowest error (MAE 15.08 over 1,183 games) while being the simplest; the four-factor fitted
# model did not improve on it.
PRODUCTION = {"name": "baseline-rc60-half", "window": 60, "strength": 0.5}
GAME_SD_ORTG = 11.0   # typical game-to-game swing in a team's points per 100 possessions


def project(g: pd.DataFrame) -> pd.DataFrame:
    """Projected possessions, each team's points per 100, the total, and a rating-uncertainty SD.

    The SD reflects how few games each team's ratings rest on (shrinks as the season goes);
    it is model uncertainty, separate from game-to-game randomness and from simulation error.
    """
    b = baseline(g)
    shift = PRODUCTION["strength"] * recenter(g, b.total, PRODUCTION["window"])
    total = b.total + shift
    scale = total / b.total
    n_h = g.GP_H.fillna(0) + 12   # games plus the prior's weight
    n_a = g.GP_A.fillna(0) + 12
    se_h = GAME_SD_ORTG * np.sqrt(1 / n_h + 1 / n_a)   # home offense rating + away defense rating
    se_a = GAME_SD_ORTG * np.sqrt(1 / n_a + 1 / n_h)
    total_sd = b.poss / 100 * np.sqrt(se_h ** 2 + se_a ** 2)
    return pd.DataFrame({"poss": b.poss, "ortg_h": b.ortg_h * scale, "ortg_a": b.ortg_a * scale,
                         "total": total, "total_sd_model": total_sd}, index=g.index)


def evaluate(pred: pd.Series, actual: pd.Series) -> dict:
    e = actual - pred
    return {"mae": float(e.abs().mean()), "rmse": float(np.sqrt((e ** 2).mean())), "bias": float((-e).mean())}
