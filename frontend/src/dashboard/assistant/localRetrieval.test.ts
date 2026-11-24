// The browser assistant must behave like ai-engine/rag (see ai-engine/rag/tests/test_rag.py).
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ABSTAIN, SAFETY, localAnswer } from "./localRetrieval";

beforeAll(() => {
  const corpus = JSON.parse(readFileSync(new URL("../../../public/data/corpus.json", import.meta.url), "utf8"));
  vi.stubGlobal("fetch", async () => ({ json: async () => corpus }));
});

describe("browser assistant", () => {
  it("sends personal-safety questions to official sources", async () => {
    for (const q of ["Should I evacuate now?", "Will my house flood tomorrow?", "Am I safe here?"]) {
      const r = await localAnswer(q);
      expect(r.abstained).toBe(true);
      expect(r.answer).toBe(SAFETY);
      expect(r.citations[0]?.doc_id).toBe("doc-official");
    }
  });

  it("still answers general preparedness questions", async () => {
    const r = await localAnswer("Is it safe to walk through floodwater?");
    expect(r.abstained).toBe(false);
    expect(r.citations[0].doc_id).toBe("doc-prep");
  });

  it("abstains when a question only shares a word or two", async () => {
    const r = await localAnswer("How many people live in zone_100?");
    expect(r.abstained).toBe(true);
    expect(r.answer).toBe(ABSTAIN);
  });

  it("answers every suggested question chip", async () => {
    for (const q of ["What does the risk index mean?", "What does drainage blockage mean here?", "Can I trust the water depth in the 3D view?", "Where do the data come from?"]) {
      expect((await localAnswer(q)).abstained, q).toBe(false);
    }
  });
});
