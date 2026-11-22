// node tts.mjs [short|long]   — synthesizes narration sentence by sentence (offline Kokoro voice), cached by text.
import { KokoroTTS } from "kokoro-js";
import { env } from "@huggingface/transformers";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { build } from "./script.mjs";
env.cacheDir = path.resolve("cache");
const VOICE = process.env.VOICE || "af_heart", SPEED = Number(process.env.SPEED || 1.0), DTYPE = process.env.DTYPE || "q8";
const want = process.argv[2] ? [process.argv[2]] : ["short", "long", "story", "cine"];
const split = (t) => t.split(/(?<=[.?!])\s+(?=[A-Z0-9])/).map((s) => s.trim()).filter(Boolean);
const hash = (s) => crypto.createHash("md5").update(VOICE + SPEED + DTYPE + s).digest("hex");
fs.mkdirSync("audio/cache", { recursive: true });
const scenes = build(); const jobs = { long: {}, short: {}, story: {}, cine: {} };
for (const sc of scenes) for (const b of sc.beats) { if (b.say) jobs.long[b.id] = split(b.say); if (b.short) jobs.short[b.id] = split(b.short); if (b.story) jobs.story[b.id] = split(b.story); if (b.cine) jobs.cine[b.id] = split(b.cine); }
const uniq = new Map();
for (const v of want) for (const arr of Object.values(jobs[v])) for (const s of arr) uniq.set(hash(s), s);
const todo = [...uniq].filter(([h]) => !fs.existsSync(`audio/cache/${h}.pcm`));
console.log("sentences:", uniq.size, "| to synthesize:", todo.length);
if (todo.length) {
  const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: DTYPE, device: "cpu" });
  let n = 0; const t0 = Date.now();
  for (const [h, text] of todo) {
    const a = await tts.generate(text, { voice: VOICE, speed: SPEED });
    const pcm = Buffer.alloc(a.audio.length * 2);
    for (let i = 0; i < a.audio.length; i++) pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(a.audio[i] * 32767))), i * 2);
    fs.writeFileSync(`audio/cache/${h}.pcm`, pcm);
    if (++n % 10 === 0) console.log(`${n}/${todo.length}  ${Math.round((Date.now() - t0) / 1000)}s`);
    if (n % 40 === 0) await new Promise((r) => setTimeout(r, 15000)); // short rest so the machine can cool
  }
}
const manifest = fs.existsSync("manifest.json") ? JSON.parse(fs.readFileSync("manifest.json")) : { sr: 24000, long: {}, short: {}, story: {}, cine: {} };
manifest.voice = VOICE; manifest.speed = SPEED; manifest.story ||= {}; manifest.cine ||= {};
for (const v of want) { manifest[v] = {}; for (const [id, arr] of Object.entries(jobs[v])) manifest[v][id] = arr.map((s) => { const h = hash(s); return { text: s, file: `audio/cache/${h}.pcm`, dur: fs.statSync(`audio/cache/${h}.pcm`).size / 2 / 24000 }; }); }
fs.writeFileSync("manifest.json", JSON.stringify(manifest, null, 1));
const tot = (v) => Object.values(manifest[v] || {}).reduce((a, arr) => a + arr.reduce((x, s) => x + s.dur + 0.14, 0) + 0.7, 0);
console.log("DONE", want.join(","), "| narration seconds:", want.map((v) => `${v} ${Math.round(tot(v))}s (${(tot(v) / 60).toFixed(1)} min)`).join("  "));
