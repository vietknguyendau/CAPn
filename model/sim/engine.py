"""
Monte Carlo game simulation for CapNTheLines, v0.1 (NBA).

Design (start simple, add complexity only when out-of-sample tests improve):
  * The MEAN of each game (expected margin and total) comes from the existing, already-validated
    ridge model in nba_model.py. The simulator does not invent its own means.
  * The simulator supplies the SHAPE of the outcome: possessions, pace variance, a shared
    game-environment shock (both teams hot/cold together), team-specific shooting variance,
    possession-by-possession scoring, and overtime. Those spread settings are fitted to how
    far real results land from the model's means in earlier seasons.
  * Every run is seeded and reproducible.

Two kinds of uncertainty are reported separately:
  * Monte Carlo sampling error: shrinks with more simulations (sqrt(p(1-p)/n)).
  * Model uncertainty: how much the expected margin/total itself could be off. More simulations
    never fix this; it comes from refitting the mean model on resampled history (bootstrap).
"""
from __future__ import annotations

import hashlib
import itertools
from dataclasses import dataclass, field

import numpy as np

MODEL_VERSION = "nba-sim-0.1"
SIM_COUNTS = (1_000, 10_000, 100_000)

# League possession outcome shape (2023-24 and 2024-25 box scores): share of possessions ending in
# a made 3, a 2-point result (made 2 or a two-shot trip), or a single point (and-one / split trip).
BASE_P = {"p1": 0.043, "p2": 0.3424, "p3": 0.1317}  # PPP of about 1.123


# ---------------------------------------------------------------- odds math
def american_to_decimal(odds: float) -> float:
    if odds is None or odds == 0:
        raise ValueError("American odds must be non-zero")
    return 1 + (odds / 100 if odds > 0 else 100 / -odds)


def implied_prob(odds: float) -> float:
    """Break-even probability of an American price (includes the book's margin)."""
    return 1 / american_to_decimal(odds)


def no_vig(odds_a: float, odds_b: float) -> tuple[float, float]:
    """Two-way market with the margin removed by proportional normalisation."""
    a, b = implied_prob(odds_a), implied_prob(odds_b)
    return a / (a + b), b / (a + b)


def expected_value(p: float, odds: float) -> float:
    """EV per 1 unit staked: p x decimal odds - 1."""
    return p * american_to_decimal(odds) - 1


def mc_standard_error(p: float, n: int) -> float:
    return float(np.sqrt(max(p * (1 - p), 0) / n))


def seed_for(*parts) -> int:
    """Stable seed from game id, model version, scenario, etc."""
    h = hashlib.sha256("|".join(str(x) for x in parts).encode()).hexdigest()
    return int(h[:8], 16)


# ---------------------------------------------------------------- inputs
@dataclass
class Player:
    """A player whose availability is uncertain. Impacts come from nba_model.py player values."""
    name: str
    team: str            # "home" or "away"
    p_out: float         # chance he sits (out 1.0, doubtful 0.85, questionable 0.5)
    margin_impact: float  # change to HIS team's margin if he sits (negative)
    total_impact: float = 0.0


@dataclass
class GameInputs:
    game_id: str
    mean_margin: float   # home minus away, from the validated mean model
    mean_total: float
    pace: float          # expected possessions per team
    uncertain: list[Player] = field(default_factory=list)
    margin_sd_model: float = 0.0   # bootstrap SD of the mean margin (model uncertainty)
    total_sd_model: float = 0.0


@dataclass
class SimParams:
    """Spread settings, fitted on earlier seasons (see fit_params)."""
    pace_sd: float = 3.5     # possessions
    env_sd: float = 0.06     # shared efficiency shock (both teams)
    team_sd: float = 0.0     # each team's own shooting variance
    rubber: float = 0.3      # game-state feedback: leaders ease off, trailers push (per 100 pts of lead)
    amp: float = 1.0         # input margin multiplier so the simulated mean margin matches the model's
    ot_poss_frac: float = 5 / 48


# ---------------------------------------------------------------- core simulation
def _scoring_probs(ppp_target: np.ndarray) -> np.ndarray:
    """Possession outcome probabilities [0, 1, 2, 3 points] scaled to a target points-per-possession."""
    base = np.array([BASE_P["p1"], BASE_P["p2"], BASE_P["p3"]])
    base_ppp = base @ np.array([1, 2, 3])
    k = np.clip(ppp_target / base_ppp, 0.3, 1.6)[:, None]
    scoring = base[None, :] * k
    p0 = 1 - scoring.sum(axis=1, keepdims=True)
    return np.hstack([np.clip(p0, 0.01, None), scoring])


def _period(rng, poss: np.ndarray, ppp_h: np.ndarray, ppp_a: np.ndarray):
    vals = np.array([0, 1, 2, 3])
    h = rng.multinomial(poss, _scoring_probs(ppp_h)) @ vals
    a = rng.multinomial(poss, _scoring_probs(ppp_a)) @ vals
    return h, a


def simulate_scores(mean_margin: float, mean_total: float, pace: float, n: int,
                    params: SimParams, seed: int) -> tuple[np.ndarray, np.ndarray]:
    """Simulate n games. Returns (home points, away points)."""
    rng = np.random.default_rng(seed)
    m_in = mean_margin * params.amp   # rubber-band feedback shrinks margins; pre-scale so the mean comes out right
    exp_h, exp_a = (mean_total + m_in) / 2, (mean_total - m_in) / 2
    pace = max(pace, 80)
    poss = np.clip(np.rint(rng.normal(pace, params.pace_sd, n)), 70, 140).astype(np.int64)
    # Lognormal shocks with mean 1, so the expected score is unchanged.
    env = np.exp(rng.normal(0, params.env_sd, n) - params.env_sd ** 2 / 2)
    sh = np.exp(rng.normal(0, params.team_sd, n) - params.team_sd ** 2 / 2)
    sa = np.exp(rng.normal(0, params.team_sd, n) - params.team_sd ** 2 / 2)
    # Points per possession needed to hit the expected score at this game's actual possessions.
    ppp_h = exp_h / pace * env * sh
    ppp_a = exp_a / pace * env * sa
    # Four quarters; from the second on, the team ahead scores a bit less efficiently and the team
    # behind a bit more, in proportion to the lead (garbage time, effort, fouling, three-point chasing).
    q = [poss // 4] * 3 + [poss - 3 * (poss // 4)]
    h = np.zeros(n, np.int64)
    a = np.zeros(n, np.int64)
    for i, qp in enumerate(q):
        if i == 0 or params.rubber == 0:
            fh, fa = 1.0, 1.0
        else:
            lead = np.clip(h - a, -40, 40) / 100 * params.rubber
            fh, fa = 1 - lead, 1 + lead
        dh, da = _period(rng, qp, ppp_h * fh, ppp_a * fa)
        h += dh
        a += da
    # Overtime: replay a 5-minute period while tied.
    tied = h == a
    for _ in range(6):
        if not tied.any():
            break
        idx = np.flatnonzero(tied)
        ot_poss = np.maximum(1, np.rint(poss[idx] * params.ot_poss_frac)).astype(np.int64)
        oh, oa = _period(rng, ot_poss, ppp_h[idx], ppp_a[idx])
        h[idx] += oh
        a[idx] += oa
        tied = np.zeros(n, bool)
        tied[idx] = oh == oa
    return h.astype(np.int64), a.astype(np.int64)


@dataclass
class MarketProbs:
    p: float
    mc_se: float
    model_low: float
    model_high: float


def _prob_with_model_band(values: np.ndarray, threshold: float, sd_model: float, n: int,
                          above: bool = True) -> MarketProbs:
    """P(values > threshold), plus a 95% band from shifting the whole distribution by +/-1.96 model SDs."""
    def p_at(shift):
        x = values + shift
        hits = (x > threshold) if above else (x < threshold)
        pushes = x == threshold
        # Probability of winning the bet, with pushes removed (graded as no action).
        decided = n - pushes.sum()
        return float(hits.sum() / decided) if decided else 0.5
    p = p_at(0.0)
    lo, hi = sorted([p_at(-1.96 * sd_model), p_at(1.96 * sd_model)])
    return MarketProbs(p, mc_standard_error(p, n), lo, hi)


def scenario_list(players: list[Player]):
    """Every combination of in/out for up to 4 uncertain players, with its probability."""
    players = players[:4]
    for outs in itertools.product([False, True], repeat=len(players)):
        prob = 1.0
        for pl, out in zip(players, outs):
            prob *= pl.p_out if out else 1 - pl.p_out
        if prob > 0:
            yield prob, [pl for pl, out in zip(players, outs) if out]


def simulate_game(g: GameInputs, n: int = 10_000, params: SimParams | None = None,
                  spread_home: float | None = None, total_line: float | None = None) -> dict:
    """Full result for one game: probabilities, score distribution, uncertainty, injury scenarios.

    spread_home: the home team's line (-5.5 = home favored by 5.5). total_line: the posted total.
    Uncertain players are handled as separate conditional scenarios, then blended by their odds.
    """
    if n not in SIM_COUNTS:
        raise ValueError(f"n must be one of {SIM_COUNTS}")
    params = params or SimParams()
    scenarios = []
    mix_h, mix_a = [], []
    for prob, outs in scenario_list(g.uncertain):
        dm = sum(p.margin_impact * (1 if p.team == "home" else -1) for p in outs)
        dt = sum(p.total_impact for p in outs)
        seed = seed_for(g.game_id, MODEL_VERSION, n, ",".join(sorted(p.name for p in outs)))
        h, a = simulate_scores(g.mean_margin + dm, g.mean_total + dt, g.pace, n, params, seed)
        scenarios.append({"prob": prob, "out": [p.name for p in outs], "seed": seed,
                          "summary": summarize(h, a, spread_home, total_line, n, g)})
        take = int(round(prob * n))
        mix_h.append(h[:take])
        mix_a.append(a[:take])
    H, A = np.concatenate(mix_h), np.concatenate(mix_a)
    blended = summarize(H, A, spread_home, total_line, len(H), g)
    return {"model_version": MODEL_VERSION, "n": n, "blended": blended,
            "scenarios": scenarios if g.uncertain else []}


def summarize(h: np.ndarray, a: np.ndarray, spread_home, total_line, n: int, g: GameInputs) -> dict:
    margin, total = h - a, h + a
    out = {
        "exp_home": float(h.mean()), "exp_away": float(a.mean()),
        "exp_margin": float(margin.mean()), "exp_total": float(total.mean()),
        "margin_p05_p95": [float(np.percentile(margin, 5)), float(np.percentile(margin, 95))],
        "total_p05_p95": [float(np.percentile(total, 5)), float(np.percentile(total, 95))],
        "home_win": _prob_with_model_band(margin, 0, g.margin_sd_model, n).__dict__,
    }
    if spread_home is not None:
        out["home_cover"] = _prob_with_model_band(margin + spread_home, 0, g.margin_sd_model, n).__dict__
    if total_line is not None:
        out["over"] = _prob_with_model_band(total, total_line, g.total_sd_model, n).__dict__
    return out


# ---------------------------------------------------------------- fitting the spread settings
def calibrate_amp(params: SimParams, mean_total: float = 228.0, pace: float = 100.0, n: int = 40_000) -> float:
    """Input-margin multiplier that makes the simulated mean margin equal the requested one."""
    p = SimParams(**{**params.__dict__, "amp": 1.0})
    h, a = simulate_scores(10.0, mean_total, pace, n, p, seed=11)
    out = float((h - a).mean())
    return 10.0 / out if out > 0 else 1.0


def fit_params(margin_resid_sd: float, total_resid_sd: float, pace_sd: float,
               mean_total: float = 228.0, pace: float = 100.0, n: int = 20_000) -> SimParams:
    """Choose the rubber-band strength and shared-environment shock so the simulated spread of margins
    and totals matches how far real results landed from the model's means in earlier seasons."""
    best, best_err = None, np.inf
    for rubber in np.arange(0.0, 1.01, 0.1):
        for env_sd in np.arange(0.0, 0.081, 0.01):
            p = SimParams(pace_sd=pace_sd, env_sd=float(env_sd), rubber=float(rubber))
            h, a = simulate_scores(0.0, mean_total, pace, n, p, seed=7)
            err = ((h - a).std() - margin_resid_sd) ** 2 + ((h + a).std() - total_resid_sd) ** 2
            if err < best_err:
                best, best_err = p, err
    best.amp = calibrate_amp(best, mean_total, pace)
    return best
