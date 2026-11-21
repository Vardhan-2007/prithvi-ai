"""Chunk the markdown corpus (front-matter + paragraphs) into a JSON index.

    python3 -m prithvi_rag.ingest.build     # from engines/rag  ->  writes data/processed/corpus.json
Drop additional .md/.txt documents (with the same front-matter) into engines/rag/corpus/ to extend it.
Replace the demo summaries with extracts of official PDFs once the team has the right to use them."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

CORPUS_DIR = Path(__file__).resolve().parents[2] / "corpus"
ROOT = Path(__file__).resolve().parents[4]


def parse(path: Path) -> tuple[dict, str]:
    raw = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", raw, re.S)
    meta: dict = {}
    body = raw
    if m:
        for line in m.group(1).splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip()] = v.strip()
        body = m.group(2)
    meta.setdefault("id", path.stem)
    meta.setdefault("title", path.stem.replace("_", " "))
    meta.setdefault("publisher", "unknown")
    meta.setdefault("url", "")
    meta.setdefault("kind", "document")
    return meta, body.strip()


def build_chunks(corpus_dir: Path = CORPUS_DIR) -> list[dict]:
    chunks: list[dict] = []
    for p in sorted(list(corpus_dir.glob("*.md")) + list(corpus_dir.glob("*.txt"))):
        meta, body = parse(p)
        for i, para in enumerate([x.strip() for x in re.split(r"\n\s*\n", body) if x.strip()]):
            chunks.append({"doc_id": meta["id"], "chunk": i, "title": meta["title"], "publisher": meta["publisher"],
                           "url": meta["url"], "kind": meta["kind"], "text": " ".join(para.split())})
    return chunks


def load_corpus() -> list[dict]:
    cached = ROOT / "data" / "processed" / "corpus.json"
    return json.loads(cached.read_text()) if cached.exists() else build_chunks()


if __name__ == "__main__":
    chunks = build_chunks()
    out = ROOT / "data" / "processed" / "corpus.json"
    out.write_text(json.dumps(chunks, indent=1, ensure_ascii=False))
    web = ROOT / "apps" / "web" / "public" / "data" / "corpus.json"
    web.parent.mkdir(parents=True, exist_ok=True)
    web.write_text(json.dumps(chunks, ensure_ascii=False))
    print(f"{len(chunks)} chunks from {len({c['doc_id'] for c in chunks})} documents -> {out}", file=sys.stderr)
