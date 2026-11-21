// Browser fallback of engines/rag (same tokenizer, BM25 and abstain thresholds as the Python version).
import type { AssistantReply, Citation } from "../../shared/api/client";

interface Chunk { doc_id: string; chunk: number; title: string; publisher: string; url: string; kind: string; text: string }

const STOP = new Set(`a an and are as at be but by can do does for from how i if in is it its me my of on or our so that the their them
there these this to was we what when where which who why will with you your should would could about into than then also`.split(/\s+/));
const stem = (w: string) => (w.length > 4 && w.endsWith("ies") ? w.slice(0, -3) + "y" : w.length > 4 && w.endsWith("es") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);
const tokenize = (t: string) => (t.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => !STOP.has(w) && w.length > 1).map(stem);

const MIN_SCORE = 1.6, MIN_COVERAGE = 0.34;
export const ABSTAIN = "I can't answer that from the documents loaded in this prototype. Please check official sources (IMD, NDMA, CWC or your district administration) or ask about the index, drainage assumption, simulation, data sources, facilities or priority ranking.";

let chunksP: Promise<Chunk[]> | null = null;
let built: { chunks: Chunk[]; docs: string[][]; tf: Map<string, number>[]; idf: Map<string, number>; avg: number } | null = null;

async function index() {
  if (built) return built;
  chunksP ??= fetch(`${import.meta.env.BASE_URL}data/corpus.json`).then((r) => r.json());
  const chunks = await chunksP;
  const docs = chunks.map((c) => tokenize(`${c.title} ${c.text}`));
  const tf = docs.map((d) => { const m = new Map<string, number>(); d.forEach((t) => m.set(t, (m.get(t) ?? 0) + 1)); return m; });
  const df = new Map<string, number>(); docs.forEach((d) => new Set(d).forEach((t) => df.set(t, (df.get(t) ?? 0) + 1)));
  const n = docs.length, idf = new Map<string, number>();
  df.forEach((c, t) => idf.set(t, Math.log(1 + (n - c + 0.5) / (c + 0.5))));
  built = { chunks, docs, tf, idf, avg: docs.reduce((s, d) => s + d.length, 0) / n };
  return built;
}

const sentences = (t: string, n: number) => t.trim().split(/(?<=[.!?])\s+/).slice(0, n).join(" ");

export async function localAnswer(query: string, liveContext?: string): Promise<AssistantReply> {
  const ix = await index();
  const q = [...new Set(tokenize(query))];
  const k1 = 1.5, b = 0.75;
  const scored = ix.chunks.map((c, i) => {
    let score = 0, hit = 0;
    for (const t of q) {
      const f = ix.tf[i].get(t) ?? 0;
      if (f) { hit++; score += (ix.idf.get(t) ?? 0) * f * (k1 + 1) / (f + k1 * (1 - b + (b * ix.docs[i].length) / ix.avg)); }
    }
    return { score, cov: hit / Math.max(1, q.length), c };
  }).filter((r) => r.score >= MIN_SCORE && r.cov >= MIN_COVERAGE).sort((a, b2) => b2.score - a.score);
  if (!scored.length) return { answer: ABSTAIN, citations: [], abstained: true };
  const seen = new Map<string, number>(), cites: Citation[] = [], lines: string[] = [];
  for (const { c } of scored.slice(0, 2)) {
    if (!seen.has(c.doc_id)) { seen.set(c.doc_id, cites.length + 1); cites.push({ n: cites.length + 1, doc_id: c.doc_id, title: c.title, publisher: c.publisher, url: c.url, kind: c.kind }); }
    lines.push(`${sentences(c.text, 3)} [${seen.get(c.doc_id)}]`);
  }
  if (liveContext && /\b(this|current|now|selected)\b/i.test(query)) lines.push(`Current scenario (live from the app): ${liveContext}`);
  return { answer: lines.join("\n\n"), citations: cites, abstained: false };
}
