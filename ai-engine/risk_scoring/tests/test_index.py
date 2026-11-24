import json
from pathlib import Path

import pytest
from risk_scoring import BASELINE, WEIGHTS, band_of, evaluate, inlet_order, rainfall_factor

ROOT = Path(__file__).resolve().parents[3]
DS = json.loads((ROOT / "data" / "processed" / "pilot_kakinada_01.json").read_text(encoding="utf-8"))


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


# ---- final stage: simulated-water factor W ----
from risk_scoring import WEIGHTS_FINAL, zone_water  # noqa: E402


def _ds():
    import json
    from pathlib import Path
    return json.loads((Path(__file__).resolve().parents[3] / "data" / "processed" / "pilot_kakinada_01.json").read_text(encoding="utf-8"))


def test_final_weights_sum_to_one_and_drop_uniform_rain():
    assert abs(sum(WEIGHTS_FINAL.values()) - 1) < 1e-12
    assert WEIGHTS_FINAL["rainfall"] == 0 and WEIGHTS_FINAL["water"] == max(WEIGHTS_FINAL.values())


def test_zone_water_bounds_and_extremes():
    ds = _ds()
    n = ds["grid"]["nx"] * ds["grid"]["ny"]
    assert zone_water(ds, [0.0] * n) == [0.0] * len(ds["zones"]["zones"])
    full = zone_water(ds, [2.0] * n)
    assert all(v == 1.0 or v == 0.0 for v in full)            # 0 only where a zone has no open cells
    assert sum(full) > 0.9 * len(full)


def test_final_stage_cannot_flag_a_dry_zone_and_more_water_never_lowers_the_index():
    ds = _ds()
    sc = {"rainfall_mm": 200, "duration_h": 4, "blockage_fraction": 0.5}
    dry = evaluate(ds, sc, water=[0.0] * 272)
    assert dry["stage"] == "final"
    assert dry["band_counts"]["highest"] == 0            # without water the final index tops out at 55
    wet = evaluate(ds, sc, water=[0.8] * 272)
    for a, b in zip(dry["zones"], wet["zones"]):
        assert b["risk_index"] >= a["risk_index"]
        assert abs(sum(b["contributions"].values()) - b["risk_index"]) < 1e-9


def test_provisional_is_unchanged_by_default():
    ds = _ds()
    r = evaluate(ds, {"rainfall_mm": 100, "duration_h": 6, "blockage_fraction": 0.25})
    assert r["stage"] == "provisional" and all(z["factors"]["water"] == 0 for z in r["zones"])
