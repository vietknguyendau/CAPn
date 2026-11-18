"""Tests for the simulation engine. Run: python -m pytest model/sim -q"""
import numpy as np
import pytest

import engine as E

P = E.SimParams(pace_sd=5.7, env_sd=0.0, team_sd=0.0, rubber=0.2, amp=1.18)


def test_odds_math_matches_the_brief_example():
    assert E.american_to_decimal(-110) == pytest.approx(1.9091, abs=1e-4)
    assert E.implied_prob(-110) == pytest.approx(0.5238, abs=1e-4)
    assert E.expected_value(0.57, -110) == pytest.approx(0.0882, abs=1e-3)
    assert E.american_to_decimal(150) == pytest.approx(2.5)


def test_no_vig_sums_to_one():
    a, b = E.no_vig(-120, 100)
    assert a + b == pytest.approx(1.0)
    assert a > 0.5


def test_seeded_runs_are_reproducible():
    g = E.GameInputs("g1", 4.0, 226.0, 100.0)
    r1 = E.simulate_game(g, 10_000, P, spread_home=-3.5, total_line=225.5)
    r2 = E.simulate_game(g, 10_000, P, spread_home=-3.5, total_line=225.5)
    assert r1 == r2


def test_mean_matches_model_inputs():
    h, a = E.simulate_scores(6.0, 228.0, 100.0, 100_000, P, seed=1)
    assert (h - a).mean() == pytest.approx(6.0, abs=0.3)
    assert (h + a).mean() == pytest.approx(228.0, abs=1.0)


def test_monte_carlo_error_shrinks_with_more_runs():
    g = E.GameInputs("g2", 2.0, 224.0, 99.0)
    se = [E.simulate_game(g, n, P, spread_home=-2.0)["blended"]["home_cover"]["mc_se"] for n in E.SIM_COUNTS]
    assert se[0] > se[1] > se[2]


def test_model_uncertainty_band_does_not_shrink_with_more_runs():
    g = E.GameInputs("g3", 2.0, 224.0, 99.0, margin_sd_model=1.5)
    bands = []
    for n in (10_000, 100_000):
        c = E.simulate_game(g, n, P, spread_home=-2.0)["blended"]["home_cover"]
        bands.append(c["model_high"] - c["model_low"])
    assert bands[1] == pytest.approx(bands[0], abs=0.02)
    assert bands[1] > 0.05


def test_pushes_are_removed_from_cover_probability():
    g = E.GameInputs("g4", 0.0, 220.0, 98.0)
    c = E.simulate_game(g, 100_000, P, spread_home=0.0)["blended"]["home_cover"]
    assert c["p"] == pytest.approx(0.5, abs=0.01)


def test_injury_scenarios_are_weighted_and_move_the_number():
    curry = E.Player("Curry", "away", p_out=0.5, margin_impact=-4.5, total_impact=-3.0)
    g = E.GameInputs("g5", 8.0, 229.0, 100.0, uncertain=[curry])
    r = E.simulate_game(g, 10_000, P, spread_home=-10.0, total_line=231.5)
    probs = [s["prob"] for s in r["scenarios"]]
    assert sum(probs) == pytest.approx(1.0)
    plays, sits = r["scenarios"]
    assert sits["out"] == ["Curry"]
    # Away star out -> home covers more often
    assert sits["summary"]["home_cover"]["p"] > plays["summary"]["home_cover"]["p"]


def test_invalid_sim_count_rejected():
    with pytest.raises(ValueError):
        E.simulate_game(E.GameInputs("g6", 0, 220, 100), 5_000, P)
