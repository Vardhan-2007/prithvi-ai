import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PLACE_RADIUS_M, zoneLabel, zonePlaces } from "./places";
import type { Dataset } from "./types";

const ds: Dataset = JSON.parse(readFileSync(new URL("../../../public/data/pilot_kakinada_01.json", import.meta.url), "utf8"));

describe("zone names", () => {
  const m = zonePlaces(ds);
  it("names every zone, most of them after a street", () => {
    expect(m.size).toBe(ds.zones.zones.length);
    const streets = [...m.values()].filter((p) => p.kind === "street").length;
    expect(streets / m.size).toBeGreaterThan(0.5);
    for (const p of m.values()) if (p.distM !== null) expect(p.distM).toBeLessThanOrEqual(PLACE_RADIUS_M);
  });
  it("is cached per dataset", () => { expect(zonePlaces(ds)).toBe(m); });
  it("labels: street, near a facility, or the id", () => {
    const st = [...m.entries()].find(([, p]) => p.kind === "street")!;
    const fac = [...m.entries()].find(([, p]) => p.kind === "facility");
    const none = [...m.entries()].find(([, p]) => p.kind === "none")!;
    expect(zoneLabel(ds, st[0])).toBe(st[1].name);
    if (fac) expect(zoneLabel(ds, fac[0], "సమీపంలో")).toBe(`సమీపంలో ${fac[1].name}`);
    expect(zoneLabel(ds, none[0])).toBe(none[0]);
    expect(zoneLabel(ds, "zone_does_not_exist")).toBe("zone_does_not_exist");
  });
});
