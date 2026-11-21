-- Optional PostGIS schema for the next iteration (Level 1 runs from data/processed; see docs/architecture.md).
-- Local projected CRS for the pilot: EPSG:32644 (WGS 84 / UTM 44N); web output is transformed to EPSG:4326.
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE pilot_areas (id text PRIMARY KEY, name text NOT NULL, boundary geometry(MultiPolygon, 32644) NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE data_layers (
  id text PRIMARY KEY, pilot_area_id text REFERENCES pilot_areas(id), layer_type text, source_name text, source_url text, licence text,
  native_resolution text, data_status text CHECK (data_status IN ('observed','derived','proxy','simulated')), retrieved_at timestamptz, limitations text);
CREATE TABLE analysis_zones (
  id text PRIMARY KEY, pilot_area_id text REFERENCES pilot_areas(id), geom geometry(Polygon, 32644),
  terrain_score numeric CHECK (terrain_score BETWEEN 0 AND 1), drainage_proxy numeric, exposure_score numeric, baseline_index numeric CHECK (baseline_index BETWEEN 0 AND 100));
CREATE TABLE roads (id text PRIMARY KEY, pilot_area_id text, name text, road_class text, geom geometry(LineString, 32644), source_layer_id text REFERENCES data_layers(id));
CREATE TABLE facilities (id text PRIMARY KEY, pilot_area_id text, name text, facility_type text, geom geometry(Point, 32644), source_layer_id text REFERENCES data_layers(id));
CREATE TABLE drain_inlets_proxy (id text PRIMARY KEY, pilot_area_id text, geom geometry(Point, 32644), status text DEFAULT 'proxy');
CREATE TABLE scenarios (
  id text PRIMARY KEY, pilot_area_id text, name text, rainfall_input numeric, rainfall_unit text DEFAULT 'mm', duration_hours numeric,
  drainage_blockage_fraction numeric CHECK (drainage_blockage_fraction BETWEEN 0 AND 1), assumptions jsonb, created_at timestamptz DEFAULT now());
CREATE TABLE scenario_zone_results (
  scenario_id text REFERENCES scenarios(id), zone_id text REFERENCES analysis_zones(id), risk_index numeric, delta_from_baseline numeric, factor_breakdown jsonb,
  PRIMARY KEY (scenario_id, zone_id));
CREATE INDEX ON analysis_zones USING gist (geom); CREATE INDEX ON roads USING gist (geom); CREATE INDEX ON facilities USING gist (geom);
