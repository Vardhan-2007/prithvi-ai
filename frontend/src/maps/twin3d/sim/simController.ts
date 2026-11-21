// Owns the flood Web Worker + the growing list of snapshots, and the playhead.
// Kept outside React state: snapshots are large and the playhead changes every frame.
import FloodWorker from "./floodWorker?worker";
import { buildSolverInit, SNAP_S, type SnapStats } from "./floodSolver";
import type { WorkerOut } from "./floodWorker";
import type { Dataset } from "../../../scenarios/engine/types";

export interface Snap { depth: Uint16Array; peak: Uint16Array; stats: SnapStats }

export const simData = {
  runId: 0,
  snaps: [] as Snap[],
  total: 0,           // number of snapshot intervals expected
  done: false,
  playhead: 0,        // simulated seconds
  playing: true,
  speed: 600,         // simulated seconds per real second
  rainMm: 0, durationH: 0, tailH: 3,
  version: 0,         // bumps when playhead jumps / new data (cheap change detection for the scene)
};

let worker: Worker | null = null;
let listeners = new Set<() => void>();
export const onSimUpdate = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const notify = () => listeners.forEach((l) => l());

export function totalSeconds() { return simData.total * SNAP_S; }
export function frontierSeconds() { return Math.max(0, (simData.snaps.length - 1) * SNAP_S); }

export function startSim(ds: Dataset, inletOpen: boolean[], pumpCells: number[], rainMm: number, durationH: number, opts?: { autoplay?: boolean }) {
  worker?.postMessage({ type: "stop" });
  worker?.terminate();
  worker = new FloodWorker();
  const runId = ++simData.runId;
  simData.snaps = []; simData.done = false; simData.playhead = 0;
  simData.rainMm = rainMm; simData.durationH = durationH;
  simData.total = Math.ceil(((durationH + simData.tailH) * 3600) / SNAP_S);
  if (opts?.autoplay !== false) simData.playing = true;
  simData.version++;
  worker.onmessage = (ev: MessageEvent<WorkerOut>) => {
    const m = ev.data;
    if (m.runId !== simData.runId) return;
    if (m.type === "snap") { simData.snaps[m.index] = { depth: m.depth, peak: m.peak, stats: m.stats }; simData.version++; }
    else if (m.type === "done") simData.done = true;
    notify();
  };
  const init = buildSolverInit(ds, inletOpen, pumpCells, rainMm, durationH, simData.tailH);
  worker.postMessage({ type: "init", runId, init });
  notify();
}

export function stopSim() { worker?.postMessage({ type: "stop" }); worker?.terminate(); worker = null; }

/** advance playback; returns true if the playhead moved */
export function advance(dtReal: number): boolean {
  if (!simData.playing || simData.snaps.length === 0) return false;
  const limit = Math.min(totalSeconds(), frontierSeconds());
  const next = Math.min(limit, simData.playhead + simData.speed * Math.min(dtReal, 0.1));
  const moved = next !== simData.playhead;
  simData.playhead = next;
  if (simData.done && next >= totalSeconds() - 1e-6) simData.playing = false;
  if (moved) simData.version++;
  return moved;
}

export function seek(t: number) {
  simData.playhead = Math.max(0, Math.min(t, Math.min(totalSeconds(), frontierSeconds())));
  simData.version++;
}

function bracket() {
  const f = simData.playhead / SNAP_S;
  const k = Math.min(simData.snaps.length - 1, Math.floor(f));
  const k2 = Math.min(simData.snaps.length - 1, k + 1);
  return { k, k2, a: f - k };
}

/** depth in metres at the playhead (linear blend between neighbouring snapshots) */
export function depthAtPlayhead(out: Float32Array): boolean {
  if (simData.snaps.length === 0) { out.fill(0); return false; }
  const { k, k2, a } = bracket();
  const A = simData.snaps[k]?.depth, B = simData.snaps[k2]?.depth ?? A;
  if (!A) { out.fill(0); return false; }
  for (let i = 0; i < out.length; i++) out[i] = (A[i] * (1 - a) + B[i] * a) / 1000;
  return true;
}

export function peakAtPlayhead(out: Float32Array, final = false): boolean {
  if (simData.snaps.length === 0) { out.fill(0); return false; }
  const idx = final ? simData.snaps.length - 1 : bracket().k;
  const P = simData.snaps[idx]?.peak;
  if (!P) { out.fill(0); return false; }
  for (let i = 0; i < out.length; i++) out[i] = P[i] / 1000;
  return true;
}

export function statsAtPlayhead(): SnapStats | null {
  if (simData.snaps.length === 0) return null;
  return simData.snaps[bracket().k]?.stats ?? null;
}
export function finalStats(): SnapStats | null {
  return simData.snaps[simData.snaps.length - 1]?.stats ?? null;
}
