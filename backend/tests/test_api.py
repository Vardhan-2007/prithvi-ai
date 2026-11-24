from fastapi.testclient import TestClient

from main import app

c = TestClient(app)
BODY = {"area_id": "pilot_kakinada_01", "name": "High rainfall + partial drainage blockage",
        "rainfall_scenario": {"kind": "user_defined", "value": 100, "unit": "mm", "duration_hours": 6}, "drainage_blockage_fraction": 0.25}


def test_health_and_areas():
    assert c.get("/health").json()["status"] == "ok"
    a = c.get("/api/v1/areas").json()
    assert a[0]["id"] == "pilot_kakinada_01" and a[0]["zones"] == 272


def test_layers_carry_provenance():
    layers = c.get("/api/v1/areas/pilot_kakinada_01/layers").json()
    for L in layers:
        for k in ("source_name", "licence_or_terms", "native_resolution_or_scale", "processing_method", "data_status", "known_limitations"):
            assert k in L
    assert {L["data_status"] for L in layers} >= {"observed", "derived", "proxy", "simulated"}


def test_scenario_round_trip_is_reproducible():
    a = c.post("/api/v1/scenarios", json=BODY); b = c.post("/api/v1/scenarios", json=BODY)
    assert a.status_code == 201
    ja, jb = a.json(), b.json()
    assert ja["data_status"] == "simulated_scenario" and ja["scenario_id"] != jb["scenario_id"]
    assert ja["mean_index"] == jb["mean_index"] and ja["mean_index"] > ja["baseline_mean_index"]
    assert any("not a flood probability" in s for s in ja["assumptions"])
    g = c.get(ja["results_geojson_url"]).json()
    assert len(g["features"]) == 272 and "delta_from_baseline" in g["features"][0]["properties"]
    cmp_ = c.get(f"/api/v1/scenarios/{ja['scenario_id']}/compare").json()
    assert cmp_["zones_moved_up"] >= 0 and cmp_["scenario"]["mean_index"] == ja["mean_index"]


def test_explanation_reconstructs_score():
    sid = c.post("/api/v1/scenarios", json=BODY).json()["scenario_id"]
    e = c.get("/api/v1/zones/zone_075/explanation", params={"scenario_id": sid}).json()
    assert abs(sum(e["contributions"].values()) - e["risk_index"]) < 0.05
    assert "not a validated flood probability" in e["status"]


def test_validation_rejects_bad_inputs():
    assert c.post("/api/v1/scenarios", json={**BODY, "drainage_blockage_fraction": 1.5}).status_code == 422
    assert c.post("/api/v1/scenarios", json={**BODY, "rainfall_scenario": {**BODY["rainfall_scenario"], "value": -5}}).status_code == 422
    assert c.get("/api/v1/zones/nope/explanation").status_code == 404
    assert c.get("/api/v1/scenarios/scn_missing").status_code == 404


def test_assistant_cites_or_abstains():
    ok = c.post("/api/v1/assistant/query", json={"query": "What does the risk index mean?"}).json()
    assert not ok["abstained"] and ok["citations"]
    assert c.post("/api/v1/assistant/query", json={"query": "who won the cricket world cup"}).json()["abstained"]


def test_simulate_option_returns_uncalibrated_label():
    body = {**BODY, "rainfall_scenario": {**BODY["rainfall_scenario"], "duration_hours": 1, "value": 40}, "simulate": True}
    r = c.post("/api/v1/scenarios", json=body, timeout=120)
    assert r.status_code == 201 and r.json()["simulation"]["status"] == "uncalibrated_scenario_output"


def test_solver_endpoint_is_single_flight(monkeypatch):
    """A second simulate=true request while the solver is busy gets 429 instead of piling onto a small host."""
    from api import routes

    class Busy:
        def locked(self):
            return True

    monkeypatch.setattr(routes, "_SIM_LOCK", Busy())
    r = c.post("/api/v1/scenarios", json={**BODY, "simulate": True})
    assert r.status_code == 429 and r.headers["retry-after"] == "10"
    assert c.post("/api/v1/scenarios", json=BODY).status_code == 201  # plain scenarios are unaffected


def test_simulation_with_pumps_returns_finite_numbers():
    """Regression: pumps + simulate=true used to return 500 because the solver produced NaN."""
    body = {**BODY, "rainfall_scenario": {**BODY["rainfall_scenario"], "duration_hours": 1, "value": 40}, "pumps": True, "simulate": True}
    r = c.post("/api/v1/scenarios", json=body, timeout=120)
    assert r.status_code == 201
    sim = r.json()["simulation"]
    for k in ("peak_flooded_ha", "peak_max_depth_m", "rain_m3", "drained_m3", "outfall_m3", "stored_m3"):
        assert isinstance(sim[k], (int, float)) and sim[k] == sim[k] and sim[k] >= 0, k


def test_unknown_inlet_overrides_are_rejected():
    r = c.post("/api/v1/scenarios", json={**BODY, "overrides": {"inlet_does_not_exist": "blocked"}})
    assert r.status_code == 422 and "inlet_does_not_exist" in r.json()["detail"]
    assert c.post("/api/v1/scenarios", json={**BODY, "overrides": {"inlet_01": "blocked"}}).status_code == 201


def test_hyetograph_scenario_derives_total_and_duration():
    hy = {"kind": "hyetograph", "hyetograph_mm": [0, 5, 20, 40, 10, 0], "step_hours": 1}
    r = c.post("/api/v1/scenarios", json={**BODY, "rainfall_scenario": hy})
    assert r.status_code == 201
    req = c.get(f"/api/v1/scenarios/{r.json()['scenario_id']}").json()["request"]["rainfall_scenario"]
    assert req["value"] == 75 and req["duration_hours"] == 6
    # same total/duration as a triangle storm -> same risk index (the index uses totals; the solver uses the shape)
    tri = c.post("/api/v1/scenarios", json={**BODY, "rainfall_scenario": {"kind": "user_defined", "value": 75, "duration_hours": 6}}).json()
    assert r.json()["mean_index"] == tri["mean_index"]


def test_hyetograph_validation():
    bad = [{"kind": "hyetograph"}, {"kind": "hyetograph", "hyetograph_mm": [500]}, {"kind": "hyetograph", "hyetograph_mm": [-1]},
           {"kind": "user_defined", "value": 50, "duration_hours": 2, "hyetograph_mm": [5]}, {"kind": "user_defined", "value": 50},
           {"kind": "hyetograph", "hyetograph_mm": [1] * 169}]
    for rs in bad:
        assert c.post("/api/v1/scenarios", json={**BODY, "rainfall_scenario": rs}).status_code == 422, rs


def test_simulate_accepts_a_hyetograph():
    hy = {"kind": "hyetograph", "hyetograph_mm": [5, 25, 10], "step_hours": 0.25}
    r = c.post("/api/v1/scenarios", json={**BODY, "rainfall_scenario": hy, "simulate": True}, timeout=120)
    assert r.status_code == 201
    sim = r.json()["simulation"]
    assert sim["status"] == "uncalibrated_scenario_output" and sim["rain_m3"] > 0


def test_simulate_returns_final_scores_that_follow_the_water():
    body = {**BODY, "rainfall_scenario": {"kind": "user_defined", "value": 120, "duration_hours": 2}, "drainage_blockage_fraction": 0.5, "simulate": True}
    r = c.post("/api/v1/scenarios", json=body, timeout=180)
    assert r.status_code == 201
    j = r.json()
    assert j["score_stage"] == "final" and len(j["zones"]) == 272
    assert "_zone_water" not in j["simulation"]
    flagged = [z for z in j["zones"] if z["band"] in ("higher", "highest")]
    assert all(z["water"] > 0 for z in flagged if z["band"] == "highest")
    stored = c.get(f"/api/v1/scenarios/{j['scenario_id']}").json()
    assert stored["score_stage"] == "final" and stored["mean_index"] == j["mean_index"]
    cmp_ = c.get(f"/api/v1/scenarios/{j['scenario_id']}/compare").json()
    assert cmp_["score_stage"] == "final"
    zid = max(j["zones"], key=lambda z: z["risk_index"])["zone_id"]
    e = c.get(f"/api/v1/zones/{zid}/explanation", params={"scenario_id": j["scenario_id"]}).json()
    assert e["score_stage"] == "final" and "water" in e["contributions"]
    assert abs(sum(e["contributions"].values()) - e["risk_index"]) < 0.05
    assert any("Simulated water factor" in s for s in e["explanation"])


def test_without_simulate_the_score_is_provisional():
    j = c.post("/api/v1/scenarios", json=BODY).json()
    assert j["score_stage"] == "provisional"


def test_high_sea_level_raises_the_index_and_bad_conditions_are_rejected():
    calm = c.post("/api/v1/scenarios", json=BODY).json()
    tide = c.post("/api/v1/scenarios", json={**BODY, "sea_level_m": 2.0, "soil_wetness": 0.8}).json()
    assert tide["mean_index"] > calm["mean_index"]
    assert c.post("/api/v1/scenarios", json={**BODY, "soil_wetness": 1.5}).status_code == 422
    assert c.post("/api/v1/scenarios", json={**BODY, "sea_level_m": 9}).status_code == 422
