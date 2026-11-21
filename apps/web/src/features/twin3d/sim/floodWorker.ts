/// <reference lib="webworker" />
import { FloodSolver, SNAP_S, type SolverInit, type SnapStats } from "./floodSolver";

export type WorkerIn = { type: "init"; runId: number; init: SolverInit } | { type: "stop" };
export type WorkerOut =
  | { type: "snap"; runId: number; index: number; depth: Uint16Array; peak: Uint16Array; stats: SnapStats }
  | { type: "done"; runId: number; total: number };

let current = 0;
const ctx = self as unknown as DedicatedWorkerGlobalScope;
const toMm = (a: Float32Array) => {
  const o = new Uint16Array(a.length);
  for (let i = 0; i < a.length; i++) o[i] = Math.min(65535, Math.round(a[i] * 1000));
  return o;
};

ctx.onmessage = async (ev: MessageEvent<WorkerIn>) => {
  const m = ev.data;
  if (m.type === "stop") { current++; return; }
  const run = ++current;
  const solver = new FloodSolver(m.init);
  const total = Math.ceil(solver.totalSeconds / SNAP_S);
  // snapshot 0 = dry initial state
  ctx.postMessage({ type: "snap", runId: m.runId, index: 0, depth: toMm(solver.h), peak: toMm(solver.peak), stats: solver.stats() } satisfies WorkerOut);
  for (let s = 1; s <= total; s++) {
    if (run !== current) return;
    solver.advanceSnapshot();
    const d = toMm(solver.h), p = toMm(solver.peak);
    ctx.postMessage({ type: "snap", runId: m.runId, index: s, depth: d, peak: p, stats: solver.stats() } satisfies WorkerOut, [d.buffer, p.buffer]);
    await new Promise((r) => setTimeout(r, 0)); // yield so a new 'init'/'stop' can interrupt
  }
  if (run === current) ctx.postMessage({ type: "done", runId: m.runId, total } satisfies WorkerOut);
};
