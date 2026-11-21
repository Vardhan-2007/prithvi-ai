import json
from pathlib import Path

import numpy as np
from prithvi_hydro import VirtualPipeSolver, cumulative_rain_mm, rain_rate_mm_h
from prithvi_risk import evaluate

ROOT = Path(__file__).resolve().parents[3]
DS = json.loads((ROOT / "data" / "processed" / "pilot_kakinada_01.json").read_text())
G = DS["grid"]; NY, NX = G["ny"], G["nx"]


def make(mm=60, hrs=1.0, block=0.25, tail=0.5):
    res = evaluate(DS, {"rainfall_mm": mm, "duration_h": hrs, "blockage_fraction": block})
    inl = [(i["iy"], i["ix"], o) for i, o in zip(DS["inlets"], res["inlet_open"])]
    return VirtualPipeSolver(np.array(G["dem"]).reshape(NY, NX), np.array(G["building_mask"]).reshape(NY, NX), np.array(G["road_mask"]).reshape(NY, NX),
                             G["cell_m"], inl, [], mm, hrs, tail)


def test_hyetograph_integrates():
    assert abs(cumulative_rain_mm(6 * 3600, 100, 6) - 100) < 1e-9
    assert abs(rain_rate_mm_h(0.4 * 6 * 3600, 100, 6) - 100 / 3) < 1e-6


def test_mass_is_conserved():
    s = make()
    s.run()
    st = s.stats()
    err = abs(s.expected_rain_m3() - (st["stored_m3"] + st["drain_m3"] + st["outfall_m3"])) / s.expected_rain_m3()
    assert err < 1e-6


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
