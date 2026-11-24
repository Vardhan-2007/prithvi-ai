// Road-graph routing. Small hand-made graphs check the algorithm exactly; the real dataset checks that the graph is usable.
import { describe, expect, it } from "vitest";
import { buildGraph, edgeDepths, facilityNode, nearestNode, shortestPath } from "./routing";
import { loadTestDataset } from "./testUtils";
import type { Dataset } from "./types";

/*   D (100,100)
 *  /           \          Z (500,500) is on no road.
 * A ---- B ---- C         "bad" refers to a missing node and "loop" starts and ends at B: both must be ignored.
 * (0,0) (100,0) (200,0)
 */
function toy(): Dataset {
  const road = (id: string, nodes: string[]) => ({ id, cls: "residential", name: null, width: 5.5, oneway: false, nodes, pts: [] });
  return {
    road_nodes: { A: [0, 0], B: [100, 0], C: [200, 0], D: [100, 100], Z: [500, 500] },
    roads: [road("r1", ["A", "B", "C"]), road("r2", ["A", "D", "C"]), road("bad", ["A", "missing"]), road("loop", ["B", "B"])],
  } as unknown as Dataset;
}

describe("buildGraph", () => {
  const g = buildGraph(toy());

  it("creates one edge per valid road segment and skips broken ones", () => {
    expect(g.edges).toHaveLength(4);
    expect(g.edges.map((e) => e.roadId)).toEqual(["r1", "r1", "r2", "r2"]);
    expect(g.edges[0].len).toBeCloseTo(100, 9);
    expect(g.edges[2].len).toBeCloseTo(Math.hypot(100, 100), 9);
  });

  it("is undirected and leaves unconnected nodes out of the adjacency map", () => {
    expect(g.adj.get("A")!.map((x) => x.to).sort()).toEqual(["B", "D"]);
    expect(g.adj.get("B")!.map((x) => x.to).sort()).toEqual(["A", "C"]);
    expect(g.adj.has("Z")).toBe(false);
  });
});

describe("shortestPath", () => {
  const g = buildGraph(toy());

  it("takes the shortest route", () => {
    const r = shortestPath(g, "A", "C");
    expect(r.found).toBe(true);
    expect(r.lengthM).toBeCloseTo(200, 9);
    expect(r.path).toEqual([[0, 0], [100, 0], [200, 0]]);
    expect(r.blockedEdges).toBe(0);
  });

  it("is symmetric and zero length from a node to itself", () => {
    expect(shortestPath(g, "C", "A").lengthM).toBeCloseTo(200, 9);
    const same = shortestPath(g, "B", "B");
    expect(same.found).toBe(true);
    expect(same.lengthM).toBe(0);
    expect(same.path).toEqual([[100, 0]]);
  });

  it("detours around a blocked edge and counts the blocked edges", () => {
    const r = shortestPath(g, "A", "C", (e) => e === 0);
    expect(r.found).toBe(true);
    expect(r.lengthM).toBeCloseTo(2 * Math.hypot(100, 100), 9);
    expect(r.path).toEqual([[0, 0], [100, 100], [200, 0]]);
    expect(r.blockedEdges).toBe(1);
  });

  it("reports no route when every way is blocked, or the target is unreachable", () => {
    const cut = shortestPath(g, "A", "C", (e) => e === 0 || e === 2);
    expect(cut).toEqual({ found: false, lengthM: 0, path: [], blockedEdges: 2 });
    expect(shortestPath(g, "A", "Z").found).toBe(false);
  });
});

describe("nearestNode", () => {
  const g = buildGraph(toy());

  it("returns the closest node that is on a road", () => {
    expect(nearestNode(g, 10, 5)).toBe("A");
    expect(nearestNode(g, 190, -5)).toBe("C");
  });

  it("ignores nodes that are on no road, and respects the search radius", () => {
    expect(nearestNode(g, 500, 500)).toBeNull();
    expect(nearestNode(g, 0, 0, 0)).toBeNull();
    expect(nearestNode(g, 150, 60, 20)).toBeNull();
  });
});

describe("edgeDepths", () => {
  it("takes the deepest water sampled along each edge", () => {
    const g = buildGraph(toy());
    const nx = 30, ny = 30, cell = 10;
    const depth = new Float32Array(nx * ny);
    depth[0 * nx + 5] = 0.3; // cell x 50..60, y 0..10: lies on edge A-B only
    const d = edgeDepths(g, depth, nx, ny, cell);
    expect(d[0]).toBeCloseTo(0.3, 6);
    expect(d[1]).toBe(0);
    expect(d[2]).toBe(0);
    expect(d[3]).toBe(0);
  });

  it("clamps samples that fall outside the grid instead of failing", () => {
    const g = buildGraph(toy());
    const d = edgeDepths(g, new Float32Array(4), 2, 2, 10);
    expect(d).toHaveLength(g.edges.length);
  });
});

describe("pilot road network", () => {
  const ds = loadTestDataset();
  const g = buildGraph(ds);

  it("references only nodes that exist", () => {
    for (const r of ds.roads) for (const n of r.nodes) expect(ds.road_nodes[n], `${r.id} -> ${n}`).toBeDefined();
  });

  it("is mostly one connected network", () => {
    const seen = new Set<string>();
    let largest = 0;
    for (const start of g.adj.keys()) {
      if (seen.has(start)) continue;
      const stack = [start];
      seen.add(start);
      let size = 0;
      while (stack.length) {
        const u = stack.pop()!;
        size++;
        for (const { to } of g.adj.get(u)!) if (!seen.has(to)) { seen.add(to); stack.push(to); }
      }
      largest = Math.max(largest, size);
    }
    expect(g.edges.length).toBeGreaterThan(500);
    expect(largest / g.adj.size).toBeGreaterThan(0.95);
  });

  it("puts every mapped facility within 200 m of a road node", () => {
    for (const f of ds.facilities) expect(facilityNode(g, f), f.name).not.toBeNull();
  });
});
