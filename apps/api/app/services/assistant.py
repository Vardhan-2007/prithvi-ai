from __future__ import annotations

from functools import lru_cache

from prithvi_rag.answer.compose import answer_query
from prithvi_rag.ingest.build import load_corpus
from prithvi_rag.retrieval import BM25Index


@lru_cache(maxsize=1)
def index() -> BM25Index:
    return BM25Index(load_corpus())


def ask(query: str, live_context: str | None) -> dict:
    return answer_query(index(), query, live_context)
