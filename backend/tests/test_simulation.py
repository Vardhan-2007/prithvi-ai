import json
from pathlib import Path

import numpy as np
from simulation import VirtualPipeSolver, cumulative_rain_mm, rain_rate_mm_h
from risk_scoring import evaluate

ROOT = Path(__file__).resolve().parents[2]
DS = json.loads((ROOT / "data" / "processed" / "pilot_kakinada_01.json").read_text(encoding="utf-8"))
G = DS["grid"]; NY, NX = G["ny"], G["nx"]


def make(mm=60, hrs=1.0, block=0.25, tail=0.5):
    res = evaluate(DS, {"rainfall_mm": mm, "duration_h": hrs, "blockage_fraction": block})
    inl = [(i["iy"], i["ix"], o) for i, o in zip(DS["inlets"], res["inlet_open"])]
    return VirtualPipeSolver(np.array(G["dem"]).reshape(NY, NX), np.array(G["building_mask"]).reshape(NY, NX), np.array(G["road_mask"]).reshape(NY, NX),
                             G["cell_m"], inl, [], mm, hrs, tail)


def test_hyetograph_integrates():
    assert abs(cumulative_rain_mm(6 * 3600, 100, 6) - 100) < 1e-9
    assert abs(rain_rate_mm_h(0.5 * 6 * 3600, 100, 6) - 100 / 3) < 1e-6      # peak at the midpoint
    assert abs(rain_rate_mm_h(0.25 * 6 * 3600, 100, 6) - rain_rate_mm_h(0.75 * 6 * 3600, 100, 6)) < 1e-9  # symmetric


def test_mass_is_conserved():
    s = make()
    s.run()
    st = s.stats()
    err = abs(s.expected_rain_m3() - (st["stored_m3"] + st["drain_m3"] + st["outfall_m3"])) / s.expected_rain_m3()
    assert err < 1e-6


def test_water_recedes_after_the_rain_stops():
    s = make(mm=60, hrs=1.0, tail=3.0)
    peak_stored = 0.0
    while s.t < s.total_seconds - 1e-9:
        s.step()
        if s.t % 120 == 0:
            peak_stored = max(peak_stored, s.stats()["stored_m3"])
    end = s.stats()
    assert peak_stored > 0
    assert end["stored_m3"] < 0.1 * peak_stored          # most of the water has gone
    peak_cells = int((s.peak >= 0.15).sum())
    assert peak_cells > 100 and end["flooded_cells"] <= 0.01 * peak_cells     # the flooded area has all but vanished
    assert end["max_depth"] < 0.3 * float(s.peak.max())
    # mass still closes with the recession counted as drained volume
    assert abs(s.expected_rain_m3() - (end["stored_m3"] + end["drain_m3"] + end["outfall_m3"])) / s.expected_rain_m3() < 1e-6


def test_depth_non_negative_and_buildings_dry():
    s = make(); s.run()
    assert s.h.min() >= 0 and float(s.h[s.wall].max()) == 0.0


def test_deterministic():
    a, b = make(), make(); a.run(); b.run()
    assert np.array_equal(a.h, b.h)


def test_blocked_drains_do_not_reduce_peak_flooding():
    open_ = make(block=0.0); open_.run()
    blocked = make(block=0.75); blocked.run()
    assert (blocked.peak >= 0.15).sum() >= (open_.peak >= 0.15).sum()


def make_pumped(mm=60, hrs=1.0, block=0.25, tail=0.5, pumps=True):
    res = evaluate(DS, {"rainfall_mm": mm, "duration_h": hrs, "blockage_fraction": block, "pumps": pumps})
    inl = [(i["iy"], i["ix"], o) for i, o in zip(DS["inlets"], res["inlet_open"])]
    cell = G["cell_m"]
    pc = [(min(NY - 1, int(p["y"] // cell)), min(NX - 1, int(p["x"] // cell))) for p in res["pump_sites"]]
    assert bool(pc) == pumps
    return VirtualPipeSolver(np.array(G["dem"]).reshape(NY, NX), np.array(G["building_mask"]).reshape(NY, NX), np.array(G["road_mask"]).reshape(NY, NX),
                             cell, inl, pc, mm, hrs, tail)


def test_pumps_do_not_produce_nan():
    """Regression: a pump that drained a cell completely left a depth of about -1e-23, which made the outflow scale factor
    -inf and then NaN (0 * -inf). The NaNs spread to ~94% of the grid and the API answered 500."""
    import warnings
    s = make_pumped()
    with warnings.catch_warnings():
        warnings.simplefilter("error", RuntimeWarning)
        s.run()
    assert np.isfinite(s.h).all() and np.isfinite(s.peak).all()
    assert all(np.isfinite(v) for v in s.stats().values())


def test_mass_is_conserved_with_pumps():
    s = make_pumped()
    s.run()
    st = s.stats()
    assert abs(s.expected_rain_m3() - (st["stored_m3"] + st["drain_m3"] + st["outfall_m3"])) / s.expected_rain_m3() < 1e-6


def test_pumps_never_increase_peak_flooding():
    with_p, without = make_pumped(pumps=True), make_pumped(pumps=False)
    with_p.run(); without.run()
    assert int((with_p.peak >= 0.15).sum()) <= int((without.peak >= 0.15).sum())
    assert float(with_p.peak.max()) <= float(without.peak.max()) + 1e-9


# ---- step hyetographs (forecast / replay storms) ----
from simulation import StepStorm, TriangleStorm, step_storm  # noqa: E402
from simulation.storm import cumulative_mm, rate_mm_h, total_mm, duration_h  # noqa: E402

IRREGULAR = [0, 4, 18, 35, 9, 0, 12, 2]  # mm per hour: two bursts with a lull


def make_storm(storm, block=0.25, tail=0.5):
    res = evaluate(DS, {"rainfall_mm": total_mm(storm), "duration_h": duration_h(storm), "blockage_fraction": block})
    inl = [(i["iy"], i["ix"], o) for i, o in zip(DS["inlets"], res["inlet_open"])]
    return VirtualPipeSolver(np.array(G["dem"]).reshape(NY, NX), np.array(G["building_mask"]).reshape(NY, NX), np.array(G["road_mask"]).reshape(NY, NX),
                             G["cell_m"], inl, [], 0, 1, tail, storm=storm)


def test_step_storm_integrates_and_is_piecewise_constant():
    s = step_storm(IRREGULAR)
    assert duration_h(s) == len(IRREGULAR) and total_mm(s) == sum(IRREGULAR)
    assert abs(cumulative_mm(s, len(IRREGULAR) * 3600) - sum(IRREGULAR)) < 1e-9
    assert rate_mm_h(s, 3 * 3600 + 10) == 35 and rate_mm_h(s, 5 * 3600) == 0
    assert abs(cumulative_mm(s, 3.5 * 3600) - (0 + 4 + 18 + 17.5)) < 1e-9
    half = step_storm([10, 20], step_h=0.5)
    assert rate_mm_h(half, 0.6 * 3600) == 40 and duration_h(half) == 1.0


def test_step_storm_validation():
    import pytest
    for bad in ([], [-1], [400], [float("nan")]):
        with pytest.raises(ValueError):
            step_storm(bad)


def test_triangle_storm_reproduces_the_old_solver_exactly():
    a = make(mm=60, hrs=1.0)
    b = make_storm(TriangleStorm(60, 1.0))
    a.run(); b.run()
    assert np.array_equal(a.h, b.h) and np.array_equal(a.peak, b.peak)


def test_mass_is_conserved_for_an_irregular_hyetograph():
    s = make_storm(step_storm(IRREGULAR))
    s.run()
    st = s.stats()
    err = abs(s.expected_rain_m3() - (st["stored_m3"] + st["drain_m3"] + st["outfall_m3"])) / s.expected_rain_m3()
    assert err < 1e-6


def test_lull_lets_water_drain_between_bursts():
    s = make_storm(step_storm(IRREGULAR), tail=0.0)
    stored = {}
    while s.t < s.total_seconds - 1e-9:
        s.step()
        if s.t % 3600 == 0:
            stored[int(s.t // 3600)] = s.stats()["stored_m3"]
    assert stored[6] < stored[4]          # two dry-ish hours after the 35 mm burst: less water standing
