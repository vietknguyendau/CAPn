"""
Phase 3 validation: the totals simulator's P(Over) against DraftKings no-vig closing Over/Under prices.
Chronological: projections use only earlier games; simulator settings are fitted on the prior season.

Usage: python model/totals/validate_totals.py <box-score dir> <prices.json> [v0.1 rows dir] [out.json]
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
os.environ.setdefault("NBA_DATA_DIR", sys.argv[1] if len(sys.argv) > 1 else "")

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import features as F  # noqa: E402
import sim_totals as S  # noqa: E402
import totals_model as T  # noqa: E402

E = S.E
N = 10_000


def score(p, y):
    p = np.clip(np.asarray(p, float), 1e-6, 1 - 1e-6)
    y = np.asarray(y, float)
    return float(np.mean((p - y) ** 2)), float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def calibration(p, y, bins=(0, .4, .45, .5, .55, .6, 1.0)):
    p, y = np.asarray(p), np.asarray(y)
    return [{"bin": f"{lo:.2f}-{hi:.2f}", "n": int(m.sum()), "predicted": float(p[m].mean()), "actual": float(y[m].mean())}
            for lo, hi in zip(bins[:-1], bins[1:]) if (m := (p >= lo) & (p < hi)).sum() >= 15]


def ev_bets(d, p_col, min_ev=0.03):
    """Paper-trade every side whose simulated EV at the closing price is at least min_ev."""
    rows = []
    for _, r in d.iterrows():
        for side, p, price, won in [("over", r[p_col], r.ov, r.total > r.tline), ("under", 1 - r[p_col], r.un, r.total < r.tline)]:
            if price is None or np.isnan(price):
                continue
            ev = E.expected_value(p, price)
            if ev >= min_ev:
                rows.append((ev, E.american_to_decimal(price) - 1 if won else -1.0))
    if not rows:
        return {"bets": 0}
    ev, pl = np.array(rows).T
    return {"bets": len(rows), "avg_est_ev": float(ev.mean()), "realized_roi": float(pl.mean())}


def logit(p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return np.log(p / (1 - p))


def main():
    prices = json.load(open(sys.argv[2]))
    v01_dir = sys.argv[3] if len(sys.argv) > 3 else None
    g = F.build(list(range(2021, 2028)))
    g = g[g.SEASON > 2021].copy()
    proj = T.project(g)
    report = {"model_version": S.MODEL_VERSION, "n_sims": N, "seasons": {}}
    frames = {}
    for season in [2026, 2027]:
        prev = g[g.SEASON == season - 1].index
        resid_sd = float((g.TOTAL - proj.total).loc[prev].std())
        pace_sd = float((g.POSS - proj.poss).loc[prev].dropna().std())
        params = S.fit_params(resid_sd, pace_sd)
        rows = []
        for gid, r in g[g.SEASON == season].iterrows():
            pr = prices.get(str(gid)) or {}
            if pr.get("total") is None or r.TOTAL == pr["total"]:
                continue
            p = proj.loc[gid]
            inp = S.TotalsInputs(str(gid), float(p.poss), float(p.ortg_h), float(p.ortg_a),
                                 S.rates_from_row(r, "H"), S.rates_from_row(r, "A"), float(p.total_sd_model))
            b = S.simulate_game(inp, N, params, line=pr["total"], over_price=pr.get("ov"), under_price=pr.get("un"))["blended"]
            try:
                mkt = E.no_vig(pr["ov"], pr["un"])[0]
            except (TypeError, ValueError, ZeroDivisionError):
                mkt = None
            rows.append({"gid": str(gid), "date": r.DATE.strftime("%Y-%m-%d"), "total": r.TOTAL, "tline": pr["total"],
                         "proj": float(p.total), "sim_mean": b["mean"], "sim_sd": b["sd"], "p_over": b["p_over"],
                         "band": b["over_band"][1] - b["over_band"][0], "mc_se": b["mc_se"], "mkt_over": mkt,
                         "ov": pr.get("ov"), "un": pr.get("un")})
        d = pd.DataFrame(rows)
        if v01_dir:
            v1 = pd.read_csv(os.path.join(v01_dir, f"sim_rows_{season}.csv"), dtype={"gid": str})[["gid", "p_over"]]
            d = d.merge(v1.rename(columns={"p_over": "p_over_v01"}), on="gid", how="left")
        d = d[d.mkt_over.notna()]
        y = (d.total > d.tline).astype(int)
        label = f"{season - 1}-{season - 2000:02d}"
        out = {"games": len(d), "params": params.__dict__, "fit_on": {"total_resid_sd": resid_sd, "pace_sd": pace_sd},
               "sim_mean_mae": float((d.total - d.sim_mean).abs().mean()),
               "sim_sd_avg": float(d.sim_sd.mean()), "actual_resid_sd": float((d.total - d.proj).std()),
               "brier": {}, "log_loss": {}, "calibration": calibration(d.p_over, y),
               "ev_3pct": ev_bets(d, "p_over"), "median_mc_se": float(d.mc_se.median()),
               "median_model_band": float(d.band.median())}
        both = d.p_over_v01.notna() if "p_over_v01" in d else pd.Series(False, index=d.index)
        out["compare_games"] = int(both.sum())
        for name, col in [("sim v0.2", "p_over"), ("sim v0.1", "p_over_v01"), ("market no-vig", "mkt_over")]:
            if col in d and both.any():
                out["brier"][name], out["log_loss"][name] = score(d[col][both], y[both])
        report["seasons"][label] = out
        frames[season] = (d, y)
        print(f"\n=== {label}: {len(d)} games ===  settings {({k: round(v, 3) for k, v in params.__dict__.items()})}")
        print(f"  simulated mean vs final total: MAE {out['sim_mean_mae']:.2f}; simulated spread SD {out['sim_sd_avg']:.1f} "
              f"vs real {out['actual_resid_sd']:.1f}")
        print(f"  scored on {out['compare_games']} games both simulators cover:")
        for k in out["brier"]:
            print(f"  {k:14s} Brier {out['brier'][k]:.4f}  log loss {out['log_loss'][k]:.4f}")
        e = out["ev_3pct"]
        print(f"  bets rated 3%+ EV: {e['bets']}" + (f", estimated {e['avg_est_ev']:+.1%}, realized {e['realized_roi']:+.1%}" if e["bets"] else ""))
        print("  calibration:", ", ".join(f"{c['bin']}: {c['predicted']:.2f}->{c['actual']:.2f} (n={c['n']})" for c in out["calibration"]))
        print(f"  P(Over) sampling error +/-{out['median_mc_se']:.3f}; model band {out['median_model_band']:.3f} wide")
    # Trust weight: how far to move from the market toward the simulator, fitted on 2025-26, tested on 2026-27.
    (d1, y1), (d2, y2) = frames[2026], frames[2027]
    def ll(d, y, w):
        p = 1 / (1 + np.exp(-(logit(d.mkt_over) + w * (logit(d.p_over) - logit(d.mkt_over)))))
        return score(p, y)[1]
    grid = np.round(np.arange(-0.3, 1.01, 0.05), 2)
    w = float(grid[int(np.argmin([ll(d1, y1, x) for x in grid]))])
    report["trust_weight"] = {"fitted_on": "2025-26", "weight": w, "used": max(0.0, w),
                              "test_2026_27_log_loss": {"market": ll(d2, y2, 0), "blended": ll(d2, y2, max(0.0, w)),
                                                        "sim": ll(d2, y2, 1)}}
    t = report["trust_weight"]["test_2026_27_log_loss"]
    print(f"\ntrust weight fitted on 2025-26: {w:+.2f} (used {max(0.0, w):.2f}); 2026-27 log loss market {t['market']:.4f}, "
          f"blended {t['blended']:.4f}, sim alone {t['sim']:.4f}")
    if len(sys.argv) > 4:
        json.dump(report, open(sys.argv[4], "w"), indent=1)


if __name__ == "__main__":
    main()
