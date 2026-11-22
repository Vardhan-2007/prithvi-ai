import fs from "node:fs";
import { build } from "./script.mjs";
const split = (t) => t.split(/(?<=[.?!])\s+/).map((s) => s.trim()).filter(Boolean);
const out = []; for (const sc of build()) for (const b of sc.beats) if (b.te) out.push({ id: b.id, sentences: split(b.te) });
fs.writeFileSync("te_sentences.json", JSON.stringify(out, null, 1)); console.log("beats:", out.length, "sentences:", out.reduce((a, b) => a + b.sentences.length, 0));
