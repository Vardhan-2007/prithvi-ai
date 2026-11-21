// Graph-based road-network scenario analysis. NOT a navigation product and NOT a certified safe route:
// edges are simply dropped when the simulated peak depth along them exceeds a user-set threshold.
import type { Dataset, Facility } from "./types";

export interface Edge { a: string; b: string; len: number; roadId: string; pts: [number, number][] }
export interface Graph { nodes: Map<string, [number, number]>; adj: Map<string, { to: string; e: number }[]>; edges: Edge[] }

export function buildGraph(ds: Dataset): Graph {
  const nodes = new Map<string, [number, number]>(Object.entries(ds.road_nodes).map(([k, v]) => [k, v as [number, number]]));
  const adj = new Map<string, { to: string; e: number }[]>();
  const edges: Edge[] = [];
  for (const r of ds.roads) {
    for (let i = 0; i < r.nodes.length - 1; i++) {
      const a = r.nodes[i], b = r.nodes[i + 1];
      const pa = nodes.get(a), pb = nodes.get(b);
      if (!pa || !pb || a === b) continue;
      const e = edges.length;
      edges.push({ a, b, len: Math.hypot(pb[0] - pa[0], pb[1] - pa[1]), roadId: r.id, pts: [pa, pb] });
      (adj.get(a) ?? adj.set(a, []).get(a)!).push({ to: b, e });
      (adj.get(b) ?? adj.set(b, []).get(b)!).push({ to: a, e });
    }
  }
  return { nodes, adj, edges };
}

export function nearestNode(g: Graph, x: number, y: number, maxM = 200): string | null {
  let best: string | null = null, bd = maxM;
  for (const [id, p] of g.nodes) {
    if (!g.adj.has(id)) continue;
    const d = Math.hypot(p[0] - x, p[1] - y);
    if (d < bd) { bd = d; best = id; }
  }
  return best;
}

/** max simulated depth (m) along each edge, sampled every ~5 m */
export function edgeDepths(g: Graph, depthM: ArrayLike<number>, nx: number, ny: number, cell: number): Float32Array {
  const out = new Float32Array(g.edges.length);
  g.edges.forEach((e, i) => {
    const [a, b] = e.pts; const n = Math.max(1, Math.ceil(e.len / 5));
    let m = 0;
    for (let s = 0; s <= n; s++) {
      const x = a[0] + ((b[0] - a[0]) * s) / n, y = a[1] + ((b[1] - a[1]) * s) / n;
      const ix = Math.min(nx - 1, Math.max(0, Math.floor(x / cell))), iy = Math.min(ny - 1, Math.max(0, Math.floor(y / cell)));
      const d = depthM[iy * nx + ix]; if (d > m) m = d;
    }
    out[i] = m;
  });
  return out;
}

export interface RouteResult { found: boolean; lengthM: number; path: [number, number][]; blockedEdges: number }

export function shortestPath(g: Graph, from: string, to: string, blocked?: (e: number) => boolean): RouteResult {
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, { node: string; e: number }>();
  const open: [number, string][] = [[0, from]];
  const done = new Set<string>();
  while (open.length) {
    open.sort((p, q) => p[0] - q[0]);
    const [d, u] = open.shift()!;
    if (done.has(u)) continue;
    done.add(u);
    if (u === to) break;
    for (const { to: v, e } of g.adj.get(u) ?? []) {
      if (blocked?.(e)) continue;
      const nd = d + g.edges[e].len;
      if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, { node: u, e }); open.push([nd, v]); }
    }
  }
  const blockedEdges = blocked ? g.edges.reduce((s, _e, i) => s + (blocked(i) ? 1 : 0), 0) : 0;
  if (!dist.has(to)) return { found: false, lengthM: 0, path: [], blockedEdges };
  const path: [number, number][] = [];
  for (let cur: string | undefined = to; cur; cur = prev.get(cur)?.node) path.unshift(g.nodes.get(cur)!);
  return { found: true, lengthM: dist.get(to)!, path, blockedEdges };
}

export function facilityNode(g: Graph, f: Facility) { return nearestNode(g, f.x, f.y); }
