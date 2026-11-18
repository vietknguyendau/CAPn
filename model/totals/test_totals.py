"""Tests for the NBA totals model and simulator. Run: python -m pytest model/totals -q"""
import numpy as np
import pandas as pd
import pytest

import sim_totals as S
import totals_model as T

P = S.TotalsParams(pace_sd=4.5, env_sd=0.0, ot_adj=0.73)


def test_possession_distribution_is_valid_and_calibrates():
    r = S.TeamRates()
    d = S.possession_dist(r)
    assert d.sum() == pytest.approx(1.0)
    assert (d >= 0).all()
    for target in (1.05, 1.14, 1.22):
        assert S.calibrate(r, target) @ np.arange(4) == pytest.approx(target, abs=1e-4)


def test_more_turnovers_mean_fewer_points():
    low, high = S.TeamRates(tov=0.12), S.TeamRates(tov=0.16)
    assert S.possession_dist(low) @ np.arange(4) > S.possession_dist(high) @ np.arange(4)


def test_offensive_rebounds_add_points():
    assert S.possession_dist(S.TeamRates(orb=0.32)) @ np.arange(4) > S.possession_dist(S.TeamRates(orb=0.20)) @ np.arange(4)


def test_baseline_formula_matches_the_brief():
    g = pd.DataFrame({"PACE_SZN_H": [100.0], "PACE_SZN_A": [104.0], "LG_PACE": [101.0],
                      "ORTG_SZN_H": [118.0], "A_ORTG_SZN_A": [115.0], "ORTG_SZN_A": [112.0],
                      "A_ORTG_SZN_H": [110.0], "LG_ORTG": [114.0]})
    b = T.baseline(g).iloc[0]
    assert b.poss == pytest.approx(103.0)
    assert b.ortg_h == pytest.approx(119.0)
    assert b.ortg_a == pytest.approx(108.0)
    assert b.total == pytest.approx(103.0 * 227.0 / 100)


def test_simulated_mean_matches_projection():
    g = S.TotalsInputs("m", 101.0, 115.0, 112.0)
    b = S.simulate_game(g, 100_000, P)["blended"]
    assert b["mean"] == pytest.approx(101.0 * 227.0 / 100, abs=0.6)


def test_seeded_and_reproducible():
    g = S.TotalsInputs("r", 100.0, 114.0, 114.0)
    assert S.simulate_game(g, 10_000, P, line=227.5) == S.simulate_game(g, 10_000, P, line=227.5)


def test_whole_number_line_has_push_and_probabilities_add_up():
    g = S.TotalsInputs("p", 100.0, 114.0, 114.0)
    b = S.simulate_game(g, 100_000, P, line=228.0, over_price=-110, under_price=-110)["blended"]
    assert 0.005 < b["p_push"] < 0.04
    assert b["p_over"] + b["p_under"] == pytest.approx(1.0)
    assert b["p_over_raw"] + b["p_under_raw"] + b["p_push"] == pytest.approx(1.0)
    assert b["p10"] < b["median"] < b["p90"]


def test_ev_uses_offered_price():
    g = S.TotalsInputs("e", 100.0, 114.0, 114.0)
    b = S.simulate_game(g, 10_000, P, line=227.5, over_price=-110, under_price=-110)["blended"]
    assert b["ev_over"] == pytest.approx(S.E.expected_value(b["p_over"], -110))


def test_injury_scenario_lowers_total_and_is_weighted():
    star = S.E.Player("Star", "home", p_out=0.5, margin_impact=-4.0, total_impact=-5.0)
    g = S.TotalsInputs("i", 100.0, 114.0, 114.0, uncertain=[star])
    r = S.simulate_game(g, 10_000, P, line=227.5)
    plays, sits = r["scenarios"]
    assert sits["summary"]["mean"] < plays["summary"]["mean"] - 3
    assert sum(s["prob"] for s in r["scenarios"]) == pytest.approx(1.0)


def test_sampling_error_shrinks_but_model_band_does_not():
    g = S.TotalsInputs("u", 100.0, 114.0, 114.0, total_sd_model=4.0)
    small = S.simulate_game(g, 1_000, P, line=227.5)["blended"]
    big = S.simulate_game(g, 100_000, P, line=227.5)["blended"]
    assert big["mc_se"] < small["mc_se"]
    band = lambda b: b["over_band"][1] - b["over_band"][0]  # noqa: E731
    assert band(big) == pytest.approx(band(small), abs=0.05)
    assert band(big) > 0.1


def test_invalid_count_rejected():
    with pytest.raises(ValueError):
        S.simulate_game(S.TotalsInputs("x", 100.0, 114.0, 114.0), 2_500, P)
