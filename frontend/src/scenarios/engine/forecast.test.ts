import { describe, expect, it } from "vitest";
import { ensembleUrl, forecastLayer, getForecast, parseMembers, pickCases, summarise, windowFrom } from "./forecast";

const NOW = new Date("2026-11-23T09:30:00Z");
function payload(nMembers = 10, hours = 96, suffix = "") {
  const t0 = Date.parse("2026-11-23T00:00:00Z");
  const time = Array.from({ length: hours }, (_, h) => new Date(t0 + h * 3600_000).toISOString().slice(0, 16));
  const hourly: Record<string, unknown> = { time, [`precipitation${suffix}`]: new Array(hours).fill(0.5) };
  for (let m = 1; m < nMembers; m++) hourly[`precipitation_member${String(m).padStart(2, "0")}${suffix}`] = Array.from({ length: hours }, (_, h) => (h >= 12 && h < 15 ? m : 0));
  return { hourly };
}

describe("live forecast parsing (mirrors backend/services/forecast.py)", () => {
  it("reads the control run and members in order, tolerating a model suffix", () => {
    const { times, members } = parseMembers(payload());
    expect(times).toHaveLength(96); expect(members).toHaveLength(10);
    expect(members[0][0]).toBe(0.5); expect(members[3][12]).toBe(3);
    expect(parseMembers(payload(10, 96, "_ecmwf_ifs025_ensemble")).members).toHaveLength(10);
  });
  it("windows from the current GMT hour and rejects short forecasts", () => {
    const { times, members } = parseMembers(payload());
    const { start, win } = windowFrom(times, members, NOW, 24);
    expect(start).toBe("2026-11-23T09:00"); expect(win[0]).toHaveLength(24);
    const short = parseMembers(payload(10, 20));
    expect(() => windowFrom(short.times, short.members, NOW, 24)).toThrow();
  });
  it("picks whole members at the 10th / 50th / 90th percentile of total rain", () => {
    const s = summarise(payload(21), NOW, 24);
    expect(s.cases.low.total_mm).toBeLessThanOrEqual(s.cases.likely.total_mm);
    expect(s.cases.likely.total_mm).toBeLessThanOrEqual(s.cases.high.total_mm);
    expect(s.members).toBe(21); expect(s.status).toBe("forecast_driven_scenario");
    const c = pickCases([[1, 1], [5, 5], [3, 3]]);
    expect(c.likely.hyetograph_mm).toEqual([3, 3]); expect(c.low.total_mm).toBe(2); expect(c.high.total_mm).toBe(10);
  });
  it("drops members with gaps", () => {
    const p = payload(); (p.hourly["precipitation_member02"] as (number | null)[])[10] = null;
    const { times, members } = parseMembers(p);
    expect(windowFrom(times, members, NOW, 24).win).toHaveLength(9);
  });
  it("builds the documented request", () => {
    const u = ensembleUrl(16.95, 82.24, 48);
    expect(u).toContain("models=ecmwf_ifs025_ensemble"); expect(u).toContain("hourly=precipitation"); expect(u).toContain("forecast_days=3");
  });
});

describe("getForecast fallbacks", () => {
  const ok = summarise(payload(), NOW, 24);
  it("uses the API when it answers", async () => {
    const r = await getForecast(16.95, 82.24, 24, { viaApi: async () => ok, direct: async () => { throw new Error("unused"); }, now: () => NOW });
    expect(r.origin).toBe("api");
  });
  it("falls back to Open-Meteo directly when the API is down", async () => {
    const r = await getForecast(16.95, 82.24, 24, { viaApi: async () => { throw new Error("asleep"); }, direct: async () => payload(), now: () => NOW });
    expect(r.origin).toBe("direct"); expect(r.data.cases.likely.hyetograph_mm).toHaveLength(24);
  });
  it("fails clearly when nothing is reachable", async () => {
    await expect(getForecast(16.95, 82.24, 24, { viaApi: async () => { throw new Error("x"); }, direct: async () => { throw new Error("y"); }, now: () => NOW })).rejects.toThrow();
  });
  it("produces a provenance card marked simulated", () => {
    const l = forecastLayer(ok);
    expect(l.data_status).toBe("simulated"); expect(l.known_limitations).toMatch(/not an observation or an official warning/);
  });
});
