from __future__ import annotations

import math
import re
from collections import Counter

STOP = set("""a an and are as at be but by can do does for from how i if in is it its me my of on or our so that the their them
there these this to was we what when where which who why will with you your should would could about into than then also""".split())


def stem(w: str) -> str:
    # deliberately tiny, and mirrored exactly in frontend/src/dashboard/assistant/localRetrieval.ts
    if len(w) > 4 and w.endswith("ies"):
        return w[:-3] + "y"
    if len(w) > 4 and w.endswith("es"):
        return w[:-2]
    if len(w) > 3 and w.endswith("s"):
        return w[:-1]
    return w


def tokenize(text: str) -> list[str]:
    return [stem(w) for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in STOP and len(w) > 1]


class BM25Index:
    def __init__(self, chunks: list[dict], k1: float = 1.5, b: float = 0.75):
        self.chunks, self.k1, self.b = chunks, k1, b
        self.docs = [tokenize(c["title"] + " " + c["text"]) for c in chunks]
        self.tf = [Counter(d) for d in self.docs]
        self.avg = sum(len(d) for d in self.docs) / max(1, len(self.docs))
        df: Counter = Counter()
        for d in self.docs:
            df.update(set(d))
        n = len(self.docs)
        self.idf = {t: math.log(1 + (n - c + 0.5) / (c + 0.5)) for t, c in df.items()}

    def search(self, query: str, k: int = 3) -> list[tuple[float, float, dict]]:
        q = [t for t in dict.fromkeys(tokenize(query))]
        out = []
        for i, tf in enumerate(self.tf):
            score, hit = 0.0, 0
            for t in q:
                f = tf.get(t, 0)
                if f:
                    hit += 1
                    score += self.idf.get(t, 0) * f * (self.k1 + 1) / (f + self.k1 * (1 - self.b + self.b * len(self.docs[i]) / self.avg))
            if score > 0:
                out.append((score, hit / max(1, len(q)), self.chunks[i]))
        out.sort(key=lambda r: -r[0])
        return out[:k]
