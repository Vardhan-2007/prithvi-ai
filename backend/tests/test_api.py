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
