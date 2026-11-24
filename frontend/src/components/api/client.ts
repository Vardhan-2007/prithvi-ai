// Optional FastAPI backend. The app is fully usable without it (local engine fallback), but when the API
// is reachable the assistant and exports go through it - matching the contract in docs/contracts/openapi.json.
// Dev: defaults to the local API. Production: no API unless VITE_API_URL is set at build time, so a deployed site never
// probes the visitor's own localhost.
const BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? (import.meta.env.DEV ? "http://127.0.0.1:8000" : "")).replace(/\/+$/, "");

async function j<T>(path: string, init?: RequestInit, timeout = 4000): Promise<T> {
  if (!BASE) throw new Error("API not configured");
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(`${BASE}${path}`, { ...init, signal: ctl.signal, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
    if (!r.ok) throw new Error(`${r.status}`);
    return (await r.json()) as T;
  } finally { clearTimeout(t); }
}

export interface Citation { n: number; doc_id: string; title: string; publisher: string; url: string; kind: string }
export interface AssistantReply { answer: string; citations: Citation[]; abstained: boolean }

export const api = {
  health: () => j<{ status: string; version: string }>("/health", undefined, 1500),
  assistant: (query: string, live_context?: string) =>
    j<AssistantReply>("/api/v1/assistant/query", { method: "POST", body: JSON.stringify({ query, live_context }) }),
  // Live mode forecast; generous timeout because the free backend may be waking up
  forecast: (hours: number) => j<unknown>(`/api/v1/areas/pilot_kakinada_01/forecast?hours=${hours}`, undefined, 20000),
  replay: (date: string) => j<unknown>(`/api/v1/areas/pilot_kakinada_01/replay?date=${date}`, undefined, 25000),
  scenario: (body: unknown) => j<{ scenario_id: string; summary: Record<string, number>; mean_index: number }>("/api/v1/scenarios", { method: "POST", body: JSON.stringify(body) }, 8000),
};
