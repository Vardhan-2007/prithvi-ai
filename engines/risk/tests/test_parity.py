"""The browser (TypeScript) and Python engines must agree - regenerate the fixture with
`cd apps/web && npx vite-node scripts/export-reference.ts` after changing either implementation."""
import json
from pathlib import Path

import pytest
from prithvi_risk import evaluate

ROOT = Path(__file__).resolve().parents[3]
DS = json.loads((ROOT / "data" / "processed" / "pilot_kakinada_01.json").read_text())
REF = json.loads((Path(__file__).parent / "ts_reference.json").read_text())


@pytest.mark.parametrize("case", REF, ids=[c["scenario"]["name"] for c in REF])
def test_python_matches_typescript(case):
    r = evaluate(DS, case["scenario"])
    assert r["inlet_open"] == case["inlet_open"]
    assert r["band_counts"] == case["band_counts"]
    for z, ref in zip(r["zones"], case["indices"]):
        assert z["risk_index"] == pytest.approx(ref, abs=1e-9)
    assert r["mean_index"] == pytest.approx(case["mean_index"], abs=1e-9)
