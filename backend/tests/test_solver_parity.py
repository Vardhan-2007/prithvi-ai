"""The browser (TypeScript, float32) and reference (NumPy, float64) flood solvers must agree on the same storm.
Fixture written by: cd frontend && npx vite-node scripts/export-solver-reference.ts"""
import json
from pathlib import Path

import numpy as np
from risk_scoring import evaluate
from simulation import VirtualPipeSolver, step_storm

ROOT = Path(__file__).resolve().parents[2]
DS = json.loads((ROOT / "data" / "processed" / "pilot_kakinada_01.json").read_text())
REF = json.loads((Path(__file__).parent / "ts_solver_reference.json").read_text())


def test_numpy_solver_matches_browser_solver_on_an_irregular_hyetograph():
    g = DS["grid"]; ny, nx = g["ny"], g["nx"]
    storm = step_storm(REF["hyetograph_mm"], REF["step_h"])
    res = evaluate(DS, {"rainfall_mm": sum(REF["hyetograph_mm"]), "duration_h": 1.0, "blockage_fraction": REF["blockage_fraction"]})
    inl = [(i["iy"], i["ix"], o) for i, o in zip(DS["inlets"], res["inlet_open"])]
    s = VirtualPipeSolver(np.array(g["dem"]).reshape(ny, nx), np.array(g["building_mask"]).reshape(ny, nx), np.array(g["road_mask"]).reshape(ny, nx),
                          g["cell_m"], inl, [], 0, 1, REF["tail_h"], storm=storm)
    out = s.run()
    rel = lambda a, b: abs(a - b) / max(abs(b), 1.0)  # noqa: E731
    assert rel(s.expected_rain_m3(), REF["expected_rain_m3"]) < 1e-4
    for k in ("stored_m3", "drain_m3", "outfall_m3"):
        assert rel(out[k], REF[k]) < 0.01, (k, out[k], REF[k])          # float32 vs float64: within 1 %
    assert abs(out["peak_flooded_cells"] - REF["peak_flooded_cells"]) <= 0.01 * REF["peak_flooded_cells"] + 2
    assert abs(out["peak_max_depth"] - REF["peak_max_depth"]) < 0.01
