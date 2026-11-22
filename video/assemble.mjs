// node assemble.mjs <long|short|story> <out.mp4>   — frames + narration + generated soundtrack -> final video
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { build } from "./script.mjs";
const require = createRequire(import.meta.url);
const FF = require("@ffmpeg-installer/ffmpeg").path;
const variant = process.argv[2], out = path.resolve(process.argv[3]);
const SR = 24000;
const order = build().map((s) => s.id).filter((id) => fs.existsSync(`frames/${variant}/${id}.json`));
const tls = order.map((id) => JSON.parse(fs.readFileSync(`frames/${variant}/${id}.json`)));
const total = tls.reduce((a, t) => a + t.total, 0);
console.log(variant, "scenes:", order.length, "| total", total.toFixed(1), "s =", (total / 60).toFixed(2), "min");

// ---- soundtrack (original, synthesized here). Kept deliberately quiet and out of the speech band.
const BED = { rain: 0.5, wind: 2.2, drone: 0.1, thunder: 0.3, master: 0.7, duck: 0.75, below: 16 };
function makeBed(tls, N) {
  const env = { rain: new Float32Array(N), wind: new Float32Array(N), drone: new Float32Array(N), maj: new Float32Array(N) }, events = [];
  let off = 0; const lerp = (a, b, u) => a + (b - a) * u;
  for (const tl of tls) { for (const b of tl.beats) { const bd = b.bed; if (bd) { const i0 = Math.round((off + b.start) * SR), i1 = Math.min(N, Math.round((off + b.start + b.dur) * SR));
      for (let i = i0; i < i1; i++) { const u = (i - i0) / (i1 - i0); for (const k of ["rain", "wind", "drone", "maj"]) { const r = bd[k]; env[k][i] = r ? lerp(r[0], r[1], u) : 0; } }
      (bd.thunder || []).forEach((tu) => events.push({ t: off + b.start + 0.2 + tu * (b.dur - 0.7), kind: "thunder" })); if (bd.hit !== undefined) events.push({ t: off + b.start + bd.hit, kind: "hit" }); } } off += tl.total; }
  for (const k of Object.keys(env)) { let y = env[k][0]; const a = 1 / (1.2 * SR); for (let i = 0; i < N; i++) { y += (env[k][i] - y) * a * 3; env[k][i] = y; } }
  let seed = 123456789; const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) / 4294967296) * 2 - 1; };
  const outA = new Float32Array(N); let hpY = 0, hpX = 0, lp1 = 0, lp2 = 0, br = 0, wl = 0, wl2 = 0;
  // rain: band-passed to roughly 350 Hz - 2.4 kHz (soft hiss and patter, nothing in the consonant band above that)
  const aHp = 1 / (1 + (2 * Math.PI * 350) / SR), aLp = 1 - Math.exp((-2 * Math.PI * 2400) / SR), aW = 1 - Math.exp((-2 * Math.PI * 260) / SR);
  const chord = [[55, 0.5], [110, 0.42], [164.81, 0.26], [329.63, 0.07]];
  for (let i = 0; i < N; i++) {
    const t = i / SR, w = rnd();
    hpY = aHp * (hpY + w - hpX); hpX = w; lp1 += (hpY - lp1) * aLp; lp2 += (lp1 - lp2) * aLp;
    let s = lp2 * env.rain[i] * BED.rain * (0.75 + 0.25 * Math.sin(t * 61) * Math.sin(t * 23.7));
    br = br * 0.995 + w * 0.06; wl += (br - wl) * aW; wl2 += (wl - wl2) * aW;
    s += wl2 * env.wind[i] * BED.wind * (0.7 + 0.3 * Math.sin(t * 0.43));
    let d = 0; for (const [f, g] of chord) d += g * Math.sin(2 * Math.PI * f * t + 0.6 * Math.sin(2 * Math.PI * 0.11 * t));
    const third = (1 - env.maj[i]) * 0.18 * Math.sin(2 * Math.PI * 261.63 * t) + env.maj[i] * 0.22 * Math.sin(2 * Math.PI * 277.18 * t);
    s += (d + third) * env.drone[i] * (0.8 + 0.2 * Math.sin(2 * Math.PI * 0.09 * t)) * BED.drone;
    outA[i] = s * BED.master;
  }
  for (const e of events) { const i0 = Math.round(e.t * SR); let lp = 0, b2 = 0; const a2 = 1 - Math.exp((-2 * Math.PI * (e.kind === "hit" ? 120 : 95)) / SR);
    for (let k = 0; k < SR * 5 && i0 + k < N; k++) { const x = k / SR; let v;
      if (e.kind === "hit") v = Math.sin(2 * Math.PI * (44 + 40 * Math.exp(-x * 6)) * x) * Math.exp(-x * 1.6) * 0.5;
      else { b2 = b2 * 0.996 + rnd() * 0.08; lp += (b2 - lp) * a2; v = lp * 7 * (1 - Math.exp(-x / 0.1)) * Math.exp(-x / 1.5) * (0.8 + 0.2 * Math.sin(x * 19)); }
      outA[i0 + k] += v * BED.thunder * BED.master; } }
  return outA;
}

// ---- narration track + subtitles
const N = Math.ceil((total + 1) * SR), voice = new Float32Array(N);
const srt = [], speech = []; let off = 0, n = 0;
const fmt = (t) => { const ms = Math.round(t * 1000), h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000); return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`; };
for (const tl of tls) { for (const b of tl.beats) { let t = off + b.start + b.lead; for (const s of b.sents) {
  const buf = fs.readFileSync(s.file), len = buf.length / 2, base = Math.round(t * SR);
  for (let i = 0; i < len && base + i < N; i++) voice[base + i] += buf.readInt16LE(i * 2) / 32768;
  speech.push([base, base + len]); srt.push(`${++n}\n${fmt(t)} --> ${fmt(t + s.dur)}\n${s.text}\n`); t += s.dur + b.gap; } } off += tl.total; }

// ---- calibrate the soundtrack against the voice, duck it under speech, and measure the result
const bed = makeBed(tls, N);
const rms = (arr, i0, i1) => { let q = 0; for (let i = i0; i < i1; i++) q += arr[i] * arr[i]; return Math.sqrt(q / Math.max(1, i1 - i0)); };
{ let vs = 0, bs = 0, cnt = 0; for (const [i0, i1] of speech) { for (let i = i0; i < i1; i++) { vs += voice[i] * voice[i]; bs += bed[i] * bed[i]; } cnt += i1 - i0; }
  const vR = Math.sqrt(vs / cnt), bR = Math.sqrt(bs / cnt), k = (vR * Math.pow(10, -BED.below / 20)) / bR;     // soundtrack sits BED.below dB under the voice
  for (let i = 0; i < N; i++) bed[i] *= k;
  console.log(`soundtrack calibrated: voice RMS ${(20 * Math.log10(vR)).toFixed(1)} dBFS, soundtrack scaled by ${(20 * Math.log10(k)).toFixed(1)} dB`); }
{ let env = 0; const att = 1 / (0.03 * SR), rel = 1 / (0.7 * SR);
  for (let i = 0; i < N; i++) { const x = Math.min(1, Math.abs(voice[i]) * 4); env += (x - env) * (x > env ? att : rel); bed[i] *= 1 - BED.duck * Math.min(1, env * 1.8); } }
{ const diffs = [];
  for (const [i0, i1] of speech) { const v = rms(voice, i0, i1), b = rms(bed, i0, i1); if (v > 1e-4 && b > 1e-9) diffs.push(20 * Math.log10(v / b)); }
  diffs.sort((a, b) => a - b); const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  console.log(`voice vs soundtrack during speech: mean ${mean.toFixed(1)} dB, worst ${diffs[0].toFixed(1)} dB (target: 20 dB or more; speech-clear mixes are usually 15+)`); }
const wavOf = (arr) => { const w = Buffer.alloc(44 + arr.length * 2); w.write("RIFF", 0); w.writeUInt32LE(36 + arr.length * 2, 4); w.write("WAVEfmt ", 8); w.writeUInt32LE(16, 16); w.writeUInt16LE(1, 20); w.writeUInt16LE(1, 22); w.writeUInt32LE(SR, 24); w.writeUInt32LE(SR * 2, 28); w.writeUInt16LE(2, 32); w.writeUInt16LE(16, 34); w.write("data", 36); w.writeUInt32LE(arr.length * 2, 40);
  for (let i = 0; i < arr.length; i++) w.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(arr[i] * 32767))), 44 + i * 2); return w; };
fs.mkdirSync("out", { recursive: true });
fs.writeFileSync(`out/${variant}_voice.wav`, wavOf(voice)); fs.writeFileSync(`out/${variant}_bed.wav`, wavOf(bed)); fs.writeFileSync(out.replace(/\.mp4$/, ".srt"), srt.join("\n"));

// ---- video
const lines = []; let lastFile = null;
for (const tl of tls) for (const b of tl.beats) for (const f of b.frames) { lines.push(`file '${path.resolve(f.file)}'`, `duration ${f.dur.toFixed(4)}`); lastFile = f.file; }
lines.push(`file '${path.resolve(lastFile)}'`);
fs.writeFileSync(`out/${variant}_frames.txt`, lines.join("\n"));
const vf = `fps=30,scale=1920:1080:flags=lanczos,format=yuv420p,fade=t=in:st=0:d=0.8,fade=t=out:st=${(total - 1.2).toFixed(2)}:d=1.2`;
// voice: clean-up, presence, gentle compression  |  soundtrack: low-passed so it can never fight consonants  |  then loudness-normalise the mix
const fc = [
  "[1:a]aformat=channel_layouts=mono,highpass=f=85,equalizer=f=220:t=q:w=1.1:g=-2.5,equalizer=f=2800:t=q:w=1.1:g=4,equalizer=f=7000:t=q:w=1.5:g=-2.5,acompressor=threshold=-22dB:ratio=3:attack=4:release=90:makeup=3[v]",
  "[2:a]aformat=channel_layouts=mono,lowpass=f=4500,volume=0.9[b]",
  `[v][b]amix=inputs=2:normalize=0:duration=longest,loudnorm=I=-16:TP=-1.5:LRA=9,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=mono,afade=t=in:st=0:d=0.6,afade=t=out:st=${(total - 1.2).toFixed(2)}:d=1.2[a]`,
].join(";");
execFileSync(FF, ["-y", "-hide_banner", "-loglevel", "error", "-threads", "3", "-f", "concat", "-safe", "0", "-i", `out/${variant}_frames.txt`, "-i", `out/${variant}_voice.wav`, "-i", `out/${variant}_bed.wav`,
  "-filter_complex", fc, "-vf", vf, "-map", "0:v", "-map", "[a]", "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-profile:v", "high", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-t", total.toFixed(2), "-movflags", "+faststart", out], { stdio: "inherit" });
console.log("wrote", out, (fs.statSync(out).size / 1e6).toFixed(1), "MB");
