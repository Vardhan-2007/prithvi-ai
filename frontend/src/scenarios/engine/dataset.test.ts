// Grid / coordinate helpers, checked on a tiny hand-made grid and against the real pilot dataset.
import { describe, expect, it } from "vitest";
import { cellIndex, demAt, demRange, xyToLonLat, zoneIdAt } from "./dataset";
import { loadTestDataset } from "./testUtils";
import type { Dataset } from "./types";

// 3 x 2 cells of 10 m; elevations: row 0 = 1,2,3  row 1 = 4,5,6
const small = {
  meta: { origin: { lon: 82, lat: 17 }, m_per_deg: { lon: 100000, lat: 110000 } },
  grid: { nx: 3, ny: 2, cell_m: 10, dem: [1, 2, 3, 4, 5, 6] },
  zones: { nx: 2, ny: 1, size_m: 20, wref: 1, zones: [] },
} as unknown as Dataset;

describe("cellIndex", () => {
  it("maps metres to the row-major cell index", () => {
    expect(cellIndex(small, 0, 0)).toBe(0);
    expect(cellIndex(small, 9.9, 9.9)).toBe(0);
    expect(cellIndex(small, 10, 0)).toBe(1);
    expect(cellIndex(small, 25, 15)).toBe(5);
  });

  it("clamps points outside the grid to the nearest edge cell", () => {
    expect(cellIndex(small, -50, -50)).toBe(0);
    expect(cellIndex(small, 999, 999)).toBe(5);
  });
});

describe("demAt", () => {
  it("returns the cell value at a cell centre", () => {
    expect(demAt(small, 5, 5)).toBeCloseTo(1, 9);
    expect(demAt(small, 15, 5)).toBeCloseTo(2, 9);
  });

  it("is accurate to about a millimetre per metre of slope even in the last row and column", () => {
    // demAt stops 0.001 of a cell short of the last row/column so that its neighbour stays inside the grid.
    // On this deliberately steep toy grid (1 m per cell) that costs 0.004 m; on the real terrain it is far smaller.
    expect(Math.abs(demAt(small, 25, 15) - 6)).toBeLessThan(0.005);
  });

  it("interpolates between cell centres", () => {
    expect(demAt(small, 10, 5)).toBeCloseTo(1.5, 9);   // halfway between 1 and 2
    expect(demAt(small, 5, 10)).toBeCloseTo(2.5, 9);   // halfway between 1 and 4
    expect(demAt(small, 10, 10)).toBeCloseTo(3, 9);    // middle of 1,2,4,5
  });

  it("stays within the data range and never fails outside the grid", () => {
    for (const [x, y] of [[-100, -100], [500, 500], [-5, 30], [31, -5]]) {
      const v = demAt(small, x, y);
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
    }
  });
});

describe("xyToLonLat", () => {
  it("is the origin at (0, 0) and linear in metres", () => {
    expect(xyToLonLat(small, 0, 0)).toEqual([82, 17]);
    const [lon, lat] = xyToLonLat(small, 1000, 2200);
    expect(lon).toBeCloseTo(82.01, 9);
    expect(lat).toBeCloseTo(17.02, 9);
  });
});

describe("zoneIdAt", () => {
  it("names zones row by row with three digits", () => {
    expect(zoneIdAt(small, 5, 5)).toBe("zone_000");
    expect(zoneIdAt(small, 25, 5)).toBe("zone_001");
  });

  it("returns null outside the zone grid", () => {
    expect(zoneIdAt(small, -1, 5)).toBeNull();
    expect(zoneIdAt(small, 5, -1)).toBeNull();
    expect(zoneIdAt(small, 41, 5)).toBeNull();
    expect(zoneIdAt(small, 5, 21)).toBeNull();
  });
});

describe("demRange", () => {
  it("finds the lowest and highest cell", () => {
    expect(demRange(small)).toEqual([1, 6]);
  });
});

describe("pilot dataset", () => {
  const ds = loadTestDataset();
  const { nx, ny, cell_m } = ds.grid;

  it("has grid arrays that match its declared size", () => {
    expect(ds.grid.dem).toHaveLength(nx * ny);
    expect(ds.grid.building_mask).toHaveLength(nx * ny);
    expect(ds.grid.road_mask).toHaveLength(nx * ny);
  });

  it("names each zone by the position of its centre", () => {
    for (const z of ds.zones.zones) expect(zoneIdAt(ds, z.cx, z.cy)).toBe(z.id);
    expect(ds.zones.zones).toHaveLength(ds.zones.nx * ds.zones.ny);
  });

  it("puts every drain inlet in the grid cell it says it is in", () => {
    for (const i of ds.inlets) {
      expect(cellIndex(ds, i.x, i.y), i.id).toBe(i.iy * nx + i.ix);
      expect(demAt(ds, i.x, i.y)).toBeGreaterThan(0);
    }
  });

  it("interpolates exactly at cell centres", () => {
    for (const [ix, iy] of [[10, 10], [60, 70], [100, 120]]) {
      expect(demAt(ds, (ix + 0.5) * cell_m, (iy + 0.5) * cell_m)).toBeCloseTo(ds.grid.dem[iy * nx + ix], 5);
    }
  });

  it("reports a sensible elevation range", () => {
    const [lo, hi] = demRange(ds);
    expect(lo).toBeLessThan(hi);
    expect(lo).toBeGreaterThan(-5);
    expect(hi).toBeLessThan(50);
  });
});
