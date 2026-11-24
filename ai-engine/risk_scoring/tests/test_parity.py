"""The browser (TypeScript) and Python engines must agree - regenerate the fixture with
`cd frontend && npx vite-node scripts/export-reference.ts` after changing either implementation."""
import json
from pathlib import Path

import pytest
from risk_scoring import evaluate, zone_water

ROOT = Path(__file__).resolve().parents[3]
DS = json.loads((ROOT / "data" / "processed" / "pilot_kakinada_01.json").read_text())
REF = json.loads((Path(__file__).parent / "ts_reference.json").read_text())


def test_zone_water_matches_typescript():
    w = zone_water(DS, REF["synthetic_peak_m"])
    assert len(w) == len(REF["water"])
    for a, b in zip(w, REF["water"]):
        assert a == pytest.approx(b, abs=1e-12)
    assert any(v > 0.5 for v in w) and any(v == 0 for v in w)   # the fixture exercises both ends


@pytest.mark.parametrize("case", REF["cases"], ids=[c["scenario"]["name"] for c in REF["cases"]])
def test_python_matches_typescript(case):
    r = evaluate(DS, case["scenario"], water=REF["water"] if case["final"] else None)
    assert r["stage"] == case["stage"]
    assert r["inlet_open"] == case["inlet_open"]
    assert r["band_counts"] == case["band_counts"]
    for z, ref in zip(r["zones"], case["indices"]):
        assert z["risk_index"] == pytest.approx(ref, abs=1e-9)
    assert r["mean_index"] == pytest.approx(case["mean_index"], abs=1e-9)
