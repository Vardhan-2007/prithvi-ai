import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { checkInput, exportJson, isInsidePilot, loadFieldReports, parseLatLon, saveFieldReports, toReport, type FieldInput } from "./fieldReports";
import { scoreReports } from "./replay";
import { BASELINE, evaluate } from "./risk";
import type { Dataset } from "./types";

const ds: Dataset = JSON.parse(readFileSync(new URL("../../../public/data/pilot_kakinada_01.json", import.meta.url), "utf8"));
const good: FieldInput = { date: "2026-11-03", place: "Main Road near clock tower", lat: 16.951, lon: 82.2341, depth: "knee", note: "1 h after rain", by: "Ravi" };

beforeEach(() => {
  const m = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
});

describe("field reports", () => {
  it("checks input", () => {
    expect(checkInput(good, "2026-11-24")).toEqual([]);
    expect(checkInput({ ...good, date: "2026-12-01" }, "2026-11-24")).toEqual(["future"]);
    expect(checkInput({ ...good, date: "x", place: "a", lat: Number.NaN }, "2026-11-24")).toEqual(["date", "place", "location"]);
  });
  it("parses typed coordinates", () => {
    expect(parseLatLon("16.9512, 82.2341")).toEqual({ lat: 16.9512, lon: 82.2341 });
    expect(parseLatLon("16.9512 82.2341")).toEqual({ lat: 16.9512, lon: 82.2341 });
    expect(parseLatLon("Main road")).toBeNull();
    expect(parseLatLon("120, 82")).toBeNull();
  });
  it("saves, loads and exports in the validation format", () => {
    const r = toReport(good, "2026-11-24", "a1");
    expect(r.source_type).toBe("team_visit");
    expect(saveFieldReports([r])).toBe(true);
    expect(loadFieldReports()).toEqual([r]);
    const j = JSON.parse(exportJson([r]));
    expect(j.schema_version).toBe(1); expect(j.reports[0].place_name).toBe("Main Road near clock tower");
    expect(isInsidePilot(ds, r.lat, r.lon)).toBe(true);
    expect(isInsidePilot(ds, 16.99, 82.3)).toBe(false);
  });
  it("is scored by the Replay check like any report", () => {
    const res = evaluate(ds, { ...BASELINE, rainfallMm: 100, durationH: 6 }, { water: ds.zones.zones.map(() => 1) });
    const v = scoreReports(ds, res, [toReport(good, "2026-11-24", "a1")], "2026-11-03");
    expect(v.checks).toHaveLength(1);
    expect(v.hits).toBe(1);
  });
  it("survives broken storage", () => {
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: () => "{bad", setItem: () => { throw new Error("full"); } };
    expect(loadFieldReports()).toEqual([]);
    expect(saveFieldReports([])).toBe(false);
  });
});
