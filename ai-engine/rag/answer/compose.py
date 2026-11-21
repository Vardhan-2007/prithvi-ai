from __future__ import annotations

import re

from ..retrieval.bm25 import BM25Index

MIN_SCORE = 1.6
MIN_COVERAGE = 0.34

ABSTAIN = ("I can't answer that from the documents loaded in this prototype. "
           "Please check official sources (IMD, NDMA, CWC or your district administration) or ask about the index, "
           "drainage assumption, simulation, data sources, facilities or priority ranking.")


def _sentences(text: str, n: int) -> str:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return " ".join(parts[:n])


def answer_query(index: BM25Index, query: str, live_context: str | None = None, k: int = 3) -> dict:
    """Extractive, cited answer. Returns {answer, citations, abstained}."""
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
