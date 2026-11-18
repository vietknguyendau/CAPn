"""
Phase 2 comparison: brief's baseline vs. the board's current model vs. the fitted model vs. the closing total.
Chronological: every model is trained only on seasons before the test season.

Usage: python model/totals/compare_models.py <box-score dir> <prices.json> [out.json]
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))
os.environ.setdefault("NBA_DATA_DIR", sys.argv[1] if len(sys.argv) > 1 else "")

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from sklearn.linear_model import Ridge  # noqa: E402

import features as F  # noqa: E402
import nba_model as M  # noqa: E402
import totals_model as T  # noqa: E402

SEASONS = list(range(2021, 2028))


def main():
    prices = json.load(open(sys.argv[2]))
    g = F.build(SEASONS)
    g = g[g.SEASON > 2021].copy()
    # The board's current model, for comparison (its own feature set).
    _, _, mg, _ = M.build(SEASONS)
    mg = mg[mg.SEASON_H > 2021]
    g["CLOSE"] = [(prices.get(str(i)) or {}).get("total") for i in g.index]

    base = T.baseline(g)
    g["BASE"] = base.total
    g["BASE_R"] = base.total + T.recenter(g, base.total)
    report = {}
    for S in [2026, 2027]:
        tr = g[g.SEASON < S]
        fit = T.Fitted().fit(tr)
        pf = fit.predict(g)                                   # applied to every game; only season S is scored
        fitted_r = pf.total + T.recenter(g, pf.total)
        tm = Ridge(alpha=1.0).fit(mg[mg.SEASON_H < S][M.TOTAL_FEATS], mg[mg.SEASON_H < S].TOTAL)
        board = pd.Series(tm.predict(mg[M.TOTAL_FEATS]), index=mg.index) + M.recenter(mg, tm)

        te = g[(g.SEASON == S) & g.CLOSE.notna()].copy()
        te["FIT"] = pf.total.loc[te.index]
        te["FIT_R"] = fitted_r.loc[te.index]
        te["BOARD"] = board.reindex(te.index)
        te["POSS_BASE"] = base.poss.loc[te.index]
        te["POSS_FIT"] = pf.poss.loc[te.index]
        te = te.dropna(subset=["BOARD", "POSS"])
        label = f"{S - 1}-{S - 2000:02d}"
        rows = {name: T.evaluate(te[col], te.TOTAL) for name, col in [
            ("Brief's baseline", "BASE"), ("Baseline, recentered", "BASE_R"), ("Board model (current)", "BOARD"),
            ("Fitted, not recentered", "FIT"), ("Fitted, recentered", "FIT_R"), ("Closing total", "CLOSE")]}
        pace = {"Baseline possessions": T.evaluate(te.POSS_BASE, te.POSS),
                "Fitted possessions": T.evaluate(te.POSS_FIT, te.POSS)}
        # How close each model is to the market (a model that just copies the close scores well here)
        dist = {k: float((te[c] - te.CLOSE).abs().mean()) for k, c in [("Baseline, recentered", "BASE_R"),
                                                                       ("Fitted, recentered", "FIT_R")]}
        report[label] = {"games": len(te), "totals": rows, "possessions": pace, "avg_gap_to_close": dist}
        print(f"\n=== {label}: {len(te)} games with closing totals ===")
        for k, v in rows.items():
            print(f"  {k:26s} MAE {v['mae']:.2f}  RMSE {v['rmse']:.2f}  bias {v['bias']:+.2f}")
        for k, v in pace.items():
            print(f"  {k:26s} MAE {v['mae']:.2f}  bias {v['bias']:+.2f}")
        print("  average gap from the closing total:", {k: round(v, 2) for k, v in dist.items()})
    if len(sys.argv) > 3:
        json.dump(report, open(sys.argv[3], "w"), indent=1)


if __name__ == "__main__":
    main()
