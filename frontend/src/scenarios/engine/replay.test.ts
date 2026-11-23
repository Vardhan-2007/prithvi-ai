import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { checkDate, getReplay, scoreReports, seriesFor, type ObservedReport } from "./replay";
import { BASELINE, evaluate } from "./risk";
import type { Dataset } from "./types";

const ds: Dataset = JSON.parse(readFileSync(new URL("../../../public/data/pilot_kakinada_01.json", import.meta.url), "utf8"));
const hourly = (key: string, day: string, v: (number | null)[]) => ({ hourly: { time: Array.from({ length: 24 }, (_, h) => `${day}T${String(h).padStart(2, "0")}:00`), [key]: v } });

describe("replay rain", () => {
  it("applies the archive date rules", () => {
    expect(checkDate("2026-09-01", "2026-11-23")).toEqual({ forecast_day_ahead: true, actual: true });
    expect(checkDate("2023-12-05", "2026-11-23").forecast_day_ahead).toBe(false);
    expect(checkDate("2026-11-21", "2026-11-23").actual).toBe(false);
    expect(() => checkDate("2026-11-23", "2026-11-23")).toThrow();
    expect(() => checkDate("23-11-2026", "2026-11-24")).toThrow();
  });
  it("reads exactly 24 hours and rejects gaps", () => {
    expect(seriesFor(hourly("precipitation", "2026-09-01", new Array(24).fill(1.234)), "precipitation", "2026-09-01")[0]).toBe(1.23);
    const gap = new Array<number | null>(24).fill(1); gap[3] = null;
    expect(() => seriesFor(hourly("precipitation", "2026-09-01", gap), "precipitation", "2026-09-01")).toThrow();
  });
  it("falls back to Open-Meteo directly and keeps notes for missing series", async () => {
    const r = await getReplay(16.95, 82.24, "2023-12-05", {
      viaApi: async () => { throw new Error("asleep"); },
      direct: async (u: string) => hourly("precipitation", "2023-12-05", new Array(24).fill(2)),
      today: () => "2026-11-23",
    });
    expect(Object.keys(r.series)).toEqual(["actual"]);
    expect(r.totals_mm.actual).toBe(48);
    expect(r.notes.join(" ")).toMatch(/2024-01-01/);
  });
});

describe("scoring against observed reports", () => {
  const sc = { ...BASELINE, rainfallMm: 200, durationH: 4, blockageFrac: 0.5 };
  const water = ds.zones.zones.map((_, i) => (i === 100 ? 1 : 0));
  const res = evaluate(ds, sc, { water });
  const z = ds.zones.zones[100];
  const at = (x: number, y: number, extra: Partial<ObservedReport> = {}): ObservedReport => ({
    event_date: "2026-09-01", place_name: "test", lat: ds.meta.origin.lat + y / ds.meta.m_per_deg.lat, lon: ds.meta.origin.lon + x / ds.meta.m_per_deg.lon,
    source_url: "https://example.org", source_type: "news", ...extra,
  });
  it("counts hits, misses, out-of-area and other dates", () => {
    expect(res.zones[100].band === "higher" || res.zones[100].band === "highest").toBe(true);
    const flaggedN = res.zones.filter((r) => r.band === "higher" || r.band === "highest").length;
    const v = scoreReports(ds, res, [
      at(z.cx + 20, z.cy), at(z.cx + 60, z.cy + 60),            // hits (within 150 m of the flagged centre)
      at(z.cx + 900 > 1600 ? 50 : z.cx + 900, 1600),              // far away: miss
      at(-500, -500),                                             // outside the pilot
      at(z.cx, z.cy, { event_date: "2026-09-02" }),               // another day: ignored
    ], "2026-09-01");
    expect(v.hits).toBe(2); expect(v.outside).toBe(1); expect(v.checks).toHaveLength(3);
    expect(v.flaggedWithoutReport).toBe(flaggedN - 1);
  });
  it("the shipped observed-reports file is a valid (empty) template", () => {
    const j = JSON.parse(readFileSync(new URL("../../../public/data/observed_waterlogging.json", import.meta.url), "utf8"));
    expect(Array.isArray(j.reports)).toBe(true);
    expect(scoreReports(ds, res, j.reports, "2026-09-01").checks.length).toBe(j.reports.filter((r: ObservedReport) => r.event_date === "2026-09-01").length);
  });
});
