import json
from pathlib import Path

import pytest
from prithvi_risk import BASELINE, WEIGHTS, band_of, evaluate, inlet_order, rainfall_factor

ROOT = Path(__file__).resolve().parents[3]
DS = json.loads((ROOT / "data" / "processed" / "pilot_kakinada_01.json").read_text())


def scn(**kw):
    return {**BASELINE, **kw}


def test_weights_sum_to_one():
    assert sum(WEIGHTS.values()) == pytest.approx(1.0)


def test_inputs_and_outputs_are_bounded():
    for z in DS["zones"]["zones"]:
        assert 0 <= z["terrain"] <= 1 and 0 <= z["exposure"] <= 1 and 0 <= z["imperv"] <= 1
    r = evaluate(DS, scn(rainfall_mm=600, duration_h=0.25, blockage_fraction=1.0))
    assert all(0 <= z["risk_index"] <= 100 for z in r["zones"])


def test_deterministic():
    a = evaluate(DS, scn(rainfall_mm=120, blockage_fraction=0.4))
    b = evaluate(DS, scn(rainfall_mm=120, blockage_fraction=0.4))
    assert [z["risk_index"] for z in a["zones"]] == [z["risk_index"] for z in b["zones"]]


def test_breakdown_reconstructs_index():
    for z in evaluate(DS, scn(rainfall_mm=150, blockage_fraction=0.3))["zones"]:
        assert sum(z["contributions"].values()) == pytest.approx(z["risk_index"])
        recon = 100 * sum(WEIGHTS[k] * z["factors"][k] for k in WEIGHTS)
        assert recon == pytest.approx(z["risk_index"])


def test_more_rain_never_lowers_index():
    prev = None
    for mm in (20, 60, 120, 200, 320):
        r = evaluate(DS, scn(rainfall_mm=mm))
        cur = [z["risk_index"] for z in r["zones"]]
        if prev:
            assert all(c >= p - 1e-9 for c, p in zip(cur, prev))
        prev = cur


def test_more_blockage_never_lowers_drainage_component():
    prev = None
    for b in (0, 0.2, 0.4, 0.6, 0.8, 1.0):
        r = evaluate(DS, scn(blockage_fraction=b))
        cur = [z["factors"]["drainage"] for z in r["zones"]]
        if prev:
            assert all(c >= p - 1e-9 for c, p in zip(cur, prev))
        prev = cur


def test_blocking_is_a_nested_deterministic_set():
    o = inlet_order(56)
    assert sorted(o) == list(range(56))
    assert o == inlet_order(56)


def test_pumps_never_raise_index():
    a = evaluate(DS, scn(rainfall_mm=200, blockage_fraction=0.5))
    b = evaluate(DS, scn(rainfall_mm=200, blockage_fraction=0.5, pumps=True))
    assert len(b["pump_sites"]) == 6
    assert all(y["risk_index"] <= x["risk_index"] + 1e-9 for x, y in zip(a["zones"], b["zones"]))


def test_bands():
    assert [band_of(v) for v in (0, 34.9, 35, 48, 60, 100)] == ["lower", "lower", "moderate", "higher", "highest", "highest"]
    r, i = rainfall_factor(100, 6)
    assert i == pytest.approx(100 / 6) and 0 < r < 1
