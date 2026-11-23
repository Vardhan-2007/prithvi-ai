from __future__ import annotations

import re

from ..retrieval.bm25 import BM25Index

MIN_SCORE = 1.6
# A hit must match at least half of the query's content words. At 0.34 an off-topic question could pass on one or two
# shared words ("How many people live in zone_100?" matched the risk-index document through "live" and "zone").
MIN_COVERAGE = 0.5

# Personal-safety questions ("should I evacuate?", "will my house flood?") must never get an extracted document fragment.
# Mirrored in frontend/src/dashboard/assistant/localRetrieval.ts.
SAFETY_RE = re.compile(
    r"\b(evacuat\w*|trapped|rescue)\b"
    r"|\bshould (i|we) (leave|go|stay|move|flee|run)\b"
    r"|\b(am i|are we) (safe|in danger)\b"
    r"|\bis (my|our) (house|home|family|street|area|building) (safe|in danger)\b"
    r"|\bwill (my|our|the) (house|home|street|area|building|neighbou?rhood|city|town)\b.{0,25}\bflood",
    re.IGNORECASE,
)
SAFETY = ("This prototype cannot tell you whether a place is safe or whether to evacuate. "
          "Follow official warnings from the India Meteorological Department (mausam.imd.gov.in), NDMA (ndma.gov.in) and your "
          "district administration, and in an emergency contact the official emergency services.")

ABSTAIN = ("I can't answer that from the documents loaded in this prototype. "
           "Please check official sources (IMD, NDMA, CWC or your district administration) or ask about the index, "
           "drainage assumption, simulation, data sources, facilities or priority ranking.")


def _sentences(text: str, n: int) -> str:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return " ".join(parts[:n])


def answer_query(index: BM25Index, query: str, live_context: str | None = None, k: int = 3) -> dict:
    """Extractive, cited answer. Returns {answer, citations, abstained}."""
    if SAFETY_RE.search(query):
        official = next((c for c in index.chunks if c["doc_id"] == "doc-official"), None)
        cites = [{"n": 1, "doc_id": official["doc_id"], "title": official["title"], "publisher": official["publisher"],
                  "url": official["url"], "kind": official["kind"]}] if official else []
        return {"answer": SAFETY, "citations": cites, "abstained": True}
    hits = [h for h in index.search(query, k) if h[0] >= MIN_SCORE and h[1] >= MIN_COVERAGE]
    if not hits:
        return {"answer": ABSTAIN, "citations": [], "abstained": True}
    seen, cites, lines = {}, [], []
    for _score, _cov, ch in hits[:2]:
        if ch["doc_id"] not in seen:
            seen[ch["doc_id"]] = len(cites) + 1
            cites.append({"n": len(cites) + 1, "doc_id": ch["doc_id"], "title": ch["title"], "publisher": ch["publisher"], "url": ch["url"], "kind": ch["kind"]})
        lines.append(f"{_sentences(ch['text'], 3)} [{seen[ch['doc_id']]}]")
    if live_context and re.search(r"\b(this|current|now|selected)\b", query.lower()):
        lines.append(f"Current scenario (live from the app): {live_context}")
    return {"answer": "\n\n".join(lines), "citations": cites, "abstained": False}
