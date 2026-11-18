"""
NBA totals Monte Carlo simulator, v0.2 (nba-totals-sim-0.2).

Each possession is a chain of chances. A chance ends in a turnover, a free-throw trip (two shots at the
team's FT%), or a field-goal attempt (three or two, at the team's shooting rates). A missed shot becomes an
offensive rebound at the team's rebound rate, which starts a new chance. These rates come from each team's
four factors against the opponent's allowed rates (team + opponent allowed - league), so a three-point-heavy
matchup produces a wider spread of totals than a paint-heavy one with the same average.

The average is pinned to the Phase 2 projection (possessions x points per possession): make rates are
scaled so expected points per possession match it exactly. On top of possession-level randomness, each
simulated game gets a shared pace swing and a shared scoring shock (both teams hot or cold together), a
fitted game-flow feedback, and overtime while tied. All of it reuses the seeded engine in model/sim.
"""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sim"))
import engine as E  # noqa: E402

MODEL_VERSION = "nba-totals-sim-0.2"


@dataclass
class TeamRates:
    """One team's offense against this opponent's defense, per the four factors."""
    tov: float = 0.142    # turnovers per possession
    ftr: float = 0.266    # free-throw attempts per field-goal attempt
    par3: float = 0.417   # share of field-goal attempts that are threes
    fg2: float = 0.545    # two-point make rate
    fg3: float = 0.360    # three-point make rate
    ftp: float = 0.780    # free-throw make rate
    orb: float = 0.257    # offensive rebound rate on misses


def chance_probs(r: TeamRates, k: float = 1.0):
    """Per-chance probabilities with make rates scaled by k. Returns (terminal points dist [0,1,2,3], q)
    where q = chance of a miss that the offense rebounds (another chance)."""
    fg2, fg3, ftp = min(r.fg2 * k, 0.95), min(r.fg3 * k, 0.95), min(r.ftp * k, 0.99)
    miss = 1 - (r.par3 * fg3 + (1 - r.par3) * fg2)
    # Solve for per-chance turnover and trip shares so per-POSSESSION turnovers match r.tov.
    p_to = r.tov
    for _ in range(4):
        p_fga = (1 - p_to) / (1 + 0.44 * r.ftr)
        q = p_fga * miss * r.orb
        p_to = r.tov * (1 - q)
    p_fga = (1 - p_to) / (1 + 0.44 * r.ftr)
    p_ft = 1 - p_to - p_fga
    q = p_fga * miss * r.orb
    t = np.array([
        p_to + p_fga * miss * (1 - r.orb) + p_ft * (1 - ftp) ** 2,   # 0 points
        p_ft * 2 * ftp * (1 - ftp),                                    # 1 point
        p_ft * ftp ** 2 + p_fga * (1 - r.par3) * fg2,                  # 2 points
        p_fga * r.par3 * fg3,                                          # 3 points
    ])
    return t, q


def possession_dist(r: TeamRates, k: float = 1.0) -> np.ndarray:
    """Points per possession distribution [P0, P1, P2, P3] including second chances."""
    t, q = chance_probs(r, k)
    return t / (1 - q)


def calibrate(r: TeamRates, target_ppp: float) -> np.ndarray:
    """Scale make rates so the expected points per possession equal the projection."""
    lo, hi = 0.3, 2.0
    for _ in range(40):
        mid = (lo + hi) / 2
        ev = possession_dist(r, mid) @ np.arange(4)
        lo, hi = (mid, hi) if ev < target_ppp else (lo, mid)
    return possession_dist(r, (lo + hi) / 2)


@dataclass
class TotalsParams:
    pace_sd: float = 4.6      # shared possessions swing (fitted from projection misses)
    env_sd: float = 0.04      # shared scoring shock
    team_sd: float = 0.0
    rubber: float = 0.2       # game-flow feedback, as in the v0.1 engine
    ot_poss_frac: float = 5 / 48
    ot_adj: float = 0.6       # expected overtime points, removed so the average matches the projection


@dataclass
class TotalsInputs:
    game_id: str
    poss: float
    ortg_h: float
    ortg_a: float
    rates_h: TeamRates = field(default_factory=TeamRates)
    rates_a: TeamRates = field(default_factory=TeamRates)
    total_sd_model: float = 0.0          # rating uncertainty (from totals_model.project)
    uncertain: list = field(default_factory=list)   # engine.Player entries; total_impact used


def _period(rng, poss, dist_h, dist_a, mult_h, mult_a):
    vals = np.arange(4)
    def draw(dist, mult):
        sc = dist[1:][None, :] * mult[:, None]
        p0 = np.clip(1 - sc.sum(axis=1, keepdims=True), 0.01, None)
        p = np.hstack([p0, sc])
        return rng.multinomial(poss, p / p.sum(axis=1, keepdims=True)) @ vals
    return draw(dist_h, mult_h), draw(dist_a, mult_a)


def simulate_totals(g: TotalsInputs, n: int, params: TotalsParams, seed: int, total_shift: float = 0.0):
    """Simulated (home points, away points). total_shift moves the expected total (for injury scenarios)."""
    rng = np.random.default_rng(seed)
    poss_mean = max(g.poss, 80)
    base_total = poss_mean * (g.ortg_h + g.ortg_a) / 100
    scale = (base_total + total_shift - params.ot_adj) / base_total
    dist_h = calibrate(g.rates_h, g.ortg_h * scale / 100)
    dist_a = calibrate(g.rates_a, g.ortg_a * scale / 100)
    poss = np.clip(np.rint(rng.normal(poss_mean, params.pace_sd, n)), 70, 140).astype(np.int64)
    env = np.exp(rng.normal(0, params.env_sd, n) - params.env_sd ** 2 / 2)
    sh = np.exp(rng.normal(0, params.team_sd, n) - params.team_sd ** 2 / 2)
    sa = np.exp(rng.normal(0, params.team_sd, n) - params.team_sd ** 2 / 2)
    q = [poss // 4] * 3 + [poss - 3 * (poss // 4)]
    h = np.zeros(n, np.int64)
    a = np.zeros(n, np.int64)
    for i, qp in enumerate(q):
        lead = 0 if i == 0 else np.clip(h - a, -40, 40) / 100 * params.rubber
        dh, da = _period(rng, qp, dist_h, dist_a, env * sh * (1 - lead), env * sa * (1 + lead))
        h += dh
        a += da
    tied = h == a
    for _ in range(6):
        if not tied.any():
            break
        idx = np.flatnonzero(tied)
        ot = np.maximum(1, np.rint(poss[idx] * params.ot_poss_frac)).astype(np.int64)
        oh, oa = _period(rng, ot, dist_h, dist_a, (env * sh)[idx], (env * sa)[idx])
        h[idx] += oh
        a[idx] += oa
        tied = np.zeros(n, bool)
        tied[idx] = oh == oa
    return h, a


def summarize(total: np.ndarray, line: float | None, over_price: int | None, under_price: int | None,
              sd_model: float) -> dict:
    n = len(total)
    out = {"mean": float(total.mean()), "median": float(np.median(total)), "sd": float(total.std()),
           "p10": float(np.percentile(total, 10)), "p90": float(np.percentile(total, 90))}
    if line is None:
        return out
    over, under, push = (total > line).mean(), (total < line).mean(), (total == line).mean()
    decided = 1 - push
    p_over = float(over / decided) if decided else 0.5
    # Model-uncertainty band: shift the whole distribution by +/-1.96 rating SDs.
    def p_at(s):
        x = total + s
        d = 1 - (x == line).mean()
        return float((x > line).mean() / d) if d else 0.5
    lo, hi = sorted([p_at(-1.96 * sd_model), p_at(1.96 * sd_model)])
    out.update({"p_over": p_over, "p_under": 1 - p_over, "p_push": float(push),
                "p_over_raw": float(over), "p_under_raw": float(under),
                "mc_se": E.mc_standard_error(p_over, n), "over_band": [lo, hi]})
    if over_price is not None:
        out["ev_over"] = E.expected_value(p_over, over_price)
    if under_price is not None:
        out["ev_under"] = E.expected_value(1 - p_over, under_price)
    return out


def simulate_game(g: TotalsInputs, n: int = 10_000, params: TotalsParams | None = None,
                  line: float | None = None, over_price: int | None = None, under_price: int | None = None) -> dict:
    """Full totals result: blended across injury scenarios, plus each scenario on its own."""
    if n not in E.SIM_COUNTS:
        raise ValueError(f"n must be one of {E.SIM_COUNTS}")
    params = params or TotalsParams()
    totals, scenarios = [], []
    for prob, outs in E.scenario_list(g.uncertain):
        shift = sum(p.total_impact for p in outs)
        seed = E.seed_for(g.game_id, MODEL_VERSION, n, ",".join(sorted(p.name for p in outs)))
        h, a = simulate_totals(g, n, params, seed, shift)
        t = h + a
        scenarios.append({"prob": prob, "out": [p.name for p in outs], "seed": seed,
                          "summary": summarize(t, line, over_price, under_price, g.total_sd_model)})
        totals.append(t[: int(round(prob * n))])
    blended = summarize(np.concatenate(totals), line, over_price, under_price, g.total_sd_model)
    return {"model_version": MODEL_VERSION, "n": n, "blended": blended,
            "scenarios": scenarios if g.uncertain else []}


def rates_from_row(row, side: str) -> TeamRates:
    """Team rates for one side of a game row: own offense + opponent's allowed - league average (clipped)."""
    o, d = side, ("A" if side == "H" else "H")
    lg = {"TOV": 0.142, "FTR": 0.266, "PAR3": 0.417, "FG2": 0.545, "FG3": 0.360, "ORB": 0.257}

    def mix(stat):
        return float(row[f"{stat}_SZN_{o}"] + row[f"A_{stat}_SZN_{d}"] - lg[stat])
    return TeamRates(tov=float(np.clip(mix("TOV"), 0.08, 0.22)), ftr=float(np.clip(mix("FTR"), 0.12, 0.45)),
                     par3=float(np.clip(mix("PAR3"), 0.25, 0.6)), fg2=float(np.clip(mix("FG2"), 0.42, 0.65)),
                     fg3=float(np.clip(mix("FG3"), 0.28, 0.45)), ftp=float(np.clip(row[f"FTP_SZN_{o}"], 0.6, 0.92)),
                     orb=float(np.clip(mix("ORB"), 0.15, 0.40)))


def fit_params(total_resid_sd: float, pace_sd: float, n: int = 20_000) -> TotalsParams:
    """Choose the pace swing and shared scoring shock so simulated totals spread as much as real ones did
    around the projection in the prior season."""
    best, err = None, np.inf
    g = TotalsInputs("fit", 100.0, 114.0, 114.0)
    # The pace swing measured from box scores includes noise in the possession estimate itself, so it is
    # allowed to come down; the shared scoring shock can go up. Both are chosen to match the real spread.
    for ps in np.arange(1.0, pace_sd + 0.01, 0.5):
        for env_sd in np.arange(0.0, 0.081, 0.01):
            p = TotalsParams(pace_sd=float(ps), env_sd=float(env_sd), ot_adj=0.0)
            h, a = simulate_totals(g, n, p, seed=7)
            e = ((h + a).std() - total_resid_sd) ** 2
            if e < err:
                best, err = p, e
    h, a = simulate_totals(g, 100_000, best, seed=8)
    best.ot_adj = float((h + a).mean() - 228.0)   # overtime points the projection already includes
    return best
