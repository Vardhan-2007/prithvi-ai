// node runall.mjs <long|short> <nProcs>  — records all scenes in parallel (balanced by narration length)
import fs from "node:fs";
import { spawn } from "node:child_process";
import { build } from "./script.mjs";
const variant = process.argv[2], N = Number(process.argv[3] || 2);
const m = JSON.parse(fs.readFileSync("manifest.json"));
const has = (b) => (variant === "long" ? !!b.say : b[variant] !== undefined);
const w = build().map((s) => ({ id: s.id, w: s.beats.filter(has).reduce((a, b) => a + (b.silent || (m[variant][b.id] || []).reduce((x, t) => x + t.dur + 0.14, 0.7)), 0) })).filter((s) => s.w > 0);
const bins = Array.from({ length: N }, () => ({ w: 0, ids: [] }));
[...w].sort((a, b) => b.w - a.w).forEach((s) => { const b = bins.sort((x, y) => x.w - y.w)[0]; b.w += s.w; b.ids.push(s.id); });
console.log(bins.map((b) => `${b.ids.join(",")} (${b.w.toFixed(0)}s)`).join("\n"));
fs.rmSync(`frames/${variant}`, { recursive: true, force: true });
let done = 0;
bins.forEach((b, i) => { const log = `rec_${variant}_${i}.log`; const p = spawn("node", ["record.mjs", variant, b.ids.join(",")], { env: { ...process.env, REST_EVERY: "600", REST_MS: "8000" }, stdio: ["ignore", fs.openSync(log, "w"), fs.openSync(log, "a")] }); p.on("exit", (c) => { console.log(`worker ${i} exited ${c}`); if (++done === N) console.log("ALL DONE"); }); });
