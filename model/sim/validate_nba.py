"""
Chronological validation of the NBA simulator against DraftKings no-vig closing prices.

For each test season S, everything is fitted only on earlier data:
  * mean models (margin, total, pace): seasons before S
  * simulator spread settings: residuals in season S-1 from models trained before S-1
  * model uncertainty: bootstrap refits of the mean models on seasons before S
Then each game with a closing price is simulated (10,000 runs, seeded) and scored.

Usage: python model/sim/validate_nba.py <box-score dir> <prices.json> [out.json]
  prices.json: {game_id: {spread, total, ml_h, ml_a, sp_h, sp_a, ov, un}} from ESPN game files.
"""
import json
import os
import sys

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)
os.environ.setdefault("NBA_DATA_DIR", sys.argv[1] if len(sys.argv) > 1 else "")

import nba_model as M  # noqa: E402
import engine as E  # noqa: E402

PACE_FEATS = ["PACE_SZN_H", "PACE_SZN_A", "PACE_L10_H", "PACE_L10_A"]
N_SIMS = 10_000
BOOT = 30


def load():
    tg, p, games, repl = M.build(list(range(2021, 2028)))
    pace = tg[tg.HOME == 1].set_index("GAME_ID")["PACE"]
    games = games.join(pace.rename("PACE_ACT"))
    return games[games.SEASON_H > 2021].sort_values("GAME_DATE_H")


def fit_means(train):
    mm = Ridge(alpha=1.0).fit(train[M.MARGIN_FEATS], train.MARGIN)
    tm = Ridge(alpha=1.0).fit(train[M.TOTAL_FEATS], train.TOTAL)
    pt = train[train.PACE_ACT.notna()]
    pm = Ridge(alpha=1.0).fit(pt[PACE_FEATS], pt.PACE_ACT)
    return mm, tm, pm


def predict(games, models, rows):
    mm, tm, pm = models
    margin = mm.predict(rows[M.MARGIN_FEATS])
    total = tm.predict(rows[M.TOTAL_FEATS]) + M.recenter(games, tm).loc[rows.index].to_numpy()
    pace = pm.predict(rows[PACE_FEATS])
    return margin, total, pace


def sim_params_for(games, S):
    """Spread settings from season S-1 residuals of models trained before S-1."""
    tr, va = games[games.SEASON_H < S - 1], games[games.SEASON_H == S - 1]
    margin, total, pace = predict(games, fit_means(tr), va)
    m_sd = float(np.std(va.MARGIN - margin))
    t_sd = float(np.std(va.TOTAL - total))
    ok = va.PACE_ACT.notna().to_numpy()
    p_sd = float(np.std(va.PACE_ACT.to_numpy()[ok] - pace[ok]))
    params = E.fit_params(m_sd, t_sd, p_sd, mean_total=float(va.TOTAL.mean()), pace=float(va.PACE_ACT.mean()))
    return params, {"margin_resid_sd": m_sd, "total_resid_sd": t_sd, "pace_resid_sd": p_sd}


def bootstrap_sd(games, train, rows):
    rng = np.random.default_rng(2026)
    ms, ts = [], []
    for _ in range(BOOT):
        b = train.iloc[rng.integers(0, len(train), len(train))]
        m, t, _ = predict(games, fit_means(b), rows)
        ms.append(m)
        ts.append(t)
    return np.std(ms, axis=0), np.std(ts, axis=0)


def two_way(a, b):
    try:
        return E.no_vig(a, b)[0]
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def score(p, y):
    p = np.clip(np.asarray(p, float), 1e-6, 1 - 1e-6)
    y = np.asarray(y, float)
    return float(np.mean((p - y) ** 2)), float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def calibration(p, y, bins=(0, .3, .4, .45, .5, .55, .6, .7, 1.0)):
    p, y = np.asarray(p), np.asarray(y)
    out = []
    for lo, hi in zip(bins[:-1], bins[1:]):
        m = (p >= lo) & (p < hi)
        if m.sum() >= 15:
            out.append({"bin": f"{lo:.2f}-{hi:.2f}", "n": int(m.sum()), "predicted": float(p[m].mean()),
                        "actual": float(y[m].mean())})
    return out


def ev_backtest(p, odds, y, min_ev=0.03):
    """Paper-trade every bet whose simulated EV at the closing price is at least min_ev."""
    p, odds, y = np.asarray(p), np.asarray(odds, float), np.asarray(y)
    ev = np.array([E.expected_value(pp, o) for pp, o in zip(p, odds)])
    m = ev >= min_ev
    if not m.any():
        return {"bets": 0}
    dec = np.array([E.american_to_decimal(o) for o in odds[m]])
    profit = np.where(y[m] == 1, dec - 1, -1.0)
    return {"bets": int(m.sum()), "win_rate": float(y[m].mean()), "avg_est_ev": float(ev[m].mean()),
            "realized_roi": float(profit.mean())}


def main():
    prices = json.load(open(sys.argv[2]))
    games = load()
    report = {"model_version": E.MODEL_VERSION, "n_sims": N_SIMS, "seasons": {}}
    for S in [2026, 2027]:
        train, test = games[games.SEASON_H < S], games[games.SEASON_H == S]
        test = test[[bool(prices.get(str(g))) and prices[str(g)].get("spread") is not None for g in test.index]]
        params, resid = sim_params_for(games, S)
        margin, total, pace = predict(games, fit_means(train), test)
        msd, tsd = bootstrap_sd(games, train, test)
        rows = []
        for i, (gid, r) in enumerate(test.iterrows()):
            pr = prices[str(gid)]
            g = E.GameInputs(str(gid), float(margin[i]), float(total[i]), float(pace[i]),
                             margin_sd_model=float(msd[i]), total_sd_model=float(tsd[i]))
            res = E.simulate_game(g, N_SIMS, params, spread_home=pr["spread"], total_line=pr.get("total"))["blended"]
            rows.append({
                "gid": str(gid), "date": r.GAME_DATE_H.strftime("%Y-%m-%d"), "margin": r.MARGIN, "total": r.TOTAL,
                "spread": pr["spread"], "tline": pr.get("total"),
                "p_win": res["home_win"]["p"], "p_cover": res["home_cover"]["p"],
                "p_over": res.get("over", {}).get("p"),
                "band_cover": res["home_cover"]["model_high"] - res["home_cover"]["model_low"],
                "mc_se_cover": res["home_cover"]["mc_se"],
                "mkt_win": two_way(pr.get("ml_h"), pr.get("ml_a")),
                "mkt_cover": two_way(pr.get("sp_h"), pr.get("sp_a")),
                "mkt_over": two_way(pr.get("ov"), pr.get("un")),
                "ml_h": pr.get("ml_h"), "ml_a": pr.get("ml_a"), "sp_h": pr.get("sp_h"), "sp_a": pr.get("sp_a"),
                "ov": pr.get("ov"), "un": pr.get("un"),
            })
        d = pd.DataFrame(rows)
        label = f"{S - 1}-{S - 2000:02d}"
        out = {"games": len(d), "first": d.date.min(), "last": d.date.max(),
               "sim_params": params.__dict__, "fit_on": resid, "markets": {}}

        # Home win (moneyline)
        w = d[d.mkt_win.notna() & d.ml_h.notna()]
        y = (w.margin > 0).astype(int)
        out["markets"]["moneyline"] = _market(w.p_win, w.mkt_win, y, w, "ml_h", "ml_a")
        # Home cover (spread), pushes removed
        c = d[d.mkt_cover.notna() & (d.margin + d.spread != 0)]
        y = (c.margin + c.spread > 0).astype(int)
        out["markets"]["spread"] = _market(c.p_cover, c.mkt_cover, y, c, "sp_h", "sp_a")
        # Over (totals), pushes removed
        t = d[d.mkt_over.notna() & d.p_over.notna() & (d.total != d.tline)]
        y = (t.total > t.tline).astype(int)
        out["markets"]["total"] = _market(t.p_over, t.mkt_over, y, t, "ov", "un")
        out["uncertainty"] = {"median_mc_se_cover": float(d.mc_se_cover.median()),
                              "median_model_band_cover": float(d.band_cover.median())}
        report["seasons"][label] = out
        if len(sys.argv) > 4:
            d.to_csv(os.path.join(sys.argv[4], f"sim_rows_{S}.csv"), index=False)
        print_season(label, out)
    if len(sys.argv) > 3:
        json.dump(report, open(sys.argv[3], "w"), indent=1, default=float)


def _market(p_sim, p_mkt, y, d, odds_a, odds_b):
    p_sim, p_mkt, y = p_sim.to_numpy(), p_mkt.to_numpy(), y.to_numpy()
    bs, ls = score(p_sim, y)
    bm, lm = score(p_mkt, y)
    # EV paper trade on both sides, at the closing price.
    side_a = ev_backtest(p_sim, d[odds_a].to_numpy(), y)
    side_b = ev_backtest(1 - p_sim, d[odds_b].to_numpy(), 1 - y)
    bets = side_a.get("bets", 0) + side_b.get("bets", 0)
    roi = None
    if bets:
        roi = ((side_a.get("realized_roi", 0) * side_a.get("bets", 0)) +
               (side_b.get("realized_roi", 0) * side_b.get("bets", 0))) / bets
        est = ((side_a.get("avg_est_ev", 0) * side_a.get("bets", 0)) +
               (side_b.get("avg_est_ev", 0) * side_b.get("bets", 0))) / bets
    return {"n": int(len(y)), "brier_sim": bs, "brier_market": bm, "logloss_sim": ls, "logloss_market": lm,
            "calibration": calibration(p_sim, y),
            "ev_3pct": {"bets": bets, "avg_est_ev": est if bets else None, "realized_roi": roi}}


def print_season(label, out):
    print(f"\n=== {label}: {out['games']} games ({out['first']} to {out['last']}) ===")
    print("settings:", {k: round(v, 3) for k, v in out["sim_params"].items()}, "| fit on:",
          {k: round(v, 2) for k, v in out["fit_on"].items()})
    for k, m in out["markets"].items():
        e = m["ev_3pct"]
        print(f"{k:9s} n={m['n']:4d}  Brier sim {m['brier_sim']:.4f} vs market {m['brier_market']:.4f} | "
              f"log loss {m['logloss_sim']:.4f} vs {m['logloss_market']:.4f} | EV>=3% bets {e['bets']}"
              + (f", est EV {e['avg_est_ev']:+.1%}, realized ROI {e['realized_roi']:+.1%}" if e["bets"] else ""))
        print("          calibration:", ", ".join(f"{c['bin']}: {c['predicted']:.2f}->{c['actual']:.2f} (n={c['n']})"
                                                for c in m["calibration"]))
    u = out["uncertainty"]
    print(f"cover probability: typical Monte Carlo error +/-{u['median_mc_se_cover']:.3f}, "
          f"typical model-uncertainty band {u['median_model_band_cover']:.3f} wide")


if __name__ == "__main__":
    main()
