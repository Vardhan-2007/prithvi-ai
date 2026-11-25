// Shareable scenario links: the scenario is packed into the URL hash (#s=...), so a link opens the same what-if on
// anyone's screen. Nothing is sent to a server. Everything read from a link is validated and clamped: a bad or
// hand-edited link falls back to the default scenario instead of breaking the app.
import { stepStorm } from "../../maps/twin3d/sim/storm";
import type { Dataset, InletOverride, Scenario } from "./types";

const VERSION = 1;
const OVR: InletOverride[] = ["cleared", "blocked"];

interface Packed {
  v: number; n: string; r: number; d: number; b: number; w?: number; s?: number; p?: 1;
  o?: Record<string, 0 | 1>;          // inlet id -> 0 cleared, 1 blocked
  st?: number[];                      // hourly storm (mm per hour), when the scenario has one
}

const b64url = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));
const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);
const r1 = (v: number) => Math.round(v * 10) / 10, r2 = (v: number) => Math.round(v * 100) / 100;

export function encodeScenario(sc: Scenario): string {
  const p: Packed = { v: VERSION, n: sc.name.slice(0, 80), r: r1(sc.rainfallMm), d: sc.durationH, b: r2(sc.blockageFrac) };
  if (sc.soilWetness) p.w = r2(sc.soilWetness);
  if (sc.seaLevelM) p.s = r2(sc.seaLevelM);
  if (sc.pumps) p.p = 1;
  const o = Object.entries(sc.overrides);
  if (o.length) p.o = Object.fromEntries(o.map(([k, v]) => [k, v === "blocked" ? 1 : 0]));
  if (sc.storm && sc.storm.stepH === 1) p.st = sc.storm.mm.map(r1);
  return b64url(JSON.stringify(p));
}

/** The scenario in a link, or null if the link is not a valid scenario for this dataset. */
export function decodeScenario(code: string, ds: Dataset): Partial<Scenario> | null {
  let p: Packed;
  try { p = JSON.parse(unb64url(code)) as Packed; } catch { return null; }
  if (!p || typeof p !== "object" || p.v !== VERSION) return null;
  const r = num(p.r, 0, 1000), d = num(p.d, 1, 168), b = num(p.b, 0, 1);
  if (r === null || d === null || b === null) return null;
  const ids = new Set(ds.inlets.map((i) => i.id));
  const overrides: Record<string, InletOverride> = {};
  if (p.o && typeof p.o === "object") for (const [k, v] of Object.entries(p.o)) if (ids.has(k) && (v === 0 || v === 1)) overrides[k] = OVR[v];
  const out: Partial<Scenario> = {
    name: typeof p.n === "string" && p.n.trim() ? p.n.slice(0, 80) : "Shared scenario",
    rainfallMm: r, durationH: Math.round(d), blockageFrac: b, overrides, pumps: p.p === 1,
    soilWetness: num(p.w ?? 0, 0, 1) ?? 0, seaLevelM: num(p.s ?? 0, 0, 3) ?? 0,
  };
  if (Array.isArray(p.st) && p.st.length >= 1 && p.st.length <= 168 && p.st.every((x) => num(x, 0, 300) !== null)) {
    try {
      out.storm = stepStorm(p.st.map(Number), 1, { label: "shared link" });
      out.rainfallMm = r1(p.st.reduce((a, x) => a + Number(x), 0)); out.durationH = p.st.length;
    } catch { /* storm rejected: keep the plain rain/duration */ }
  }
  return out;
}

export function scenarioFromHash(hash: string, ds: Dataset): Partial<Scenario> | null {
  const m = /[#&]s=([A-Za-z0-9_-]+)/.exec(hash);
  return m ? decodeScenario(m[1], ds) : null;
}

export function shareUrl(sc: Scenario, base: string): string {
  return `${base.split("#")[0]}#s=${encodeScenario(sc)}`;
}
