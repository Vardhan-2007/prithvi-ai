// node record.mjs <long|short> <sceneId,sceneId|all> [beatIds]   (env: PROBE=1, MANIFEST=file, FPS_MOTION, REST_EVERY, REST_MS)
import fs from "node:fs";
import { launch, sleep } from "./common.mjs";
import { build, M, applyTe, teClockFrom } from "./script.mjs";

const variant = process.argv[2], want = process.argv[3] || "all", only = process.argv[4] ? process.argv[4].split(",") : null;
const manifest = JSON.parse(fs.readFileSync(process.env.MANIFEST || "manifest.json"));
const PROBE = !!process.env.PROBE;
const scenes = build().filter((s) => want === "all" || want.split(",").includes(s.id));
const LEAD = 0.2, GAP = 0.14, TAIL = 0.5, FPS_MOTION = Number(process.env.FPS_MOTION || 12), FPS_HOLD = 3;
const REST_EVERY = Number(process.env.REST_EVERY || 500), REST_MS = Number(process.env.REST_MS || 20000);
const DEFAULT_LAYERS = { risk: "off", peak: false, trees: true, buildings: true, roads: true, drains: true, facilities: true, water: true, rain: true, pumps: true };
const FACS = [...(M.film?.flaggedFac || [])].sort((a, b) => (a.cat === "health" ? 0 : 1) - (b.cat === "health" ? 0 : 1));
const CAPFIX = [[/Prithvi A I/g, "Prithvi AI"], [/Hack With Aditya twenty twenty six/g, "HackWithAditya 2026"], [/Open Street Map/g, "OpenStreetMap"], [/three-D/g, "3D"], [/two-D/g, "2D"], [/C S V/g, "CSV"], [/J S O N/g, "JSON"], [/three J S/g, "Three.js"], [/Fast A P I/g, "FastAPI"]];
const cap = (s) => CAPFIX.reduce((t, [a, b]) => t.replace(a, b), s);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const CHL = variant === "te" ? 88 : 150;
const chunks = (text) => { if (text.length <= CHL) return [text]; const mid = text.length / 2; let best = -1, bd = 1e9; for (let i = 0; i < text.length; i++) if (",;:".includes(text[i]) || (text[i] === " " && /\b(and|but|so|then|or)\b/.test(text.slice(i, i + 6)))) { const d = Math.abs(i - mid); if (d < bd) { bd = d; best = i; } } if (best < 0) best = text.indexOf(" ", mid); const k = ",;:".includes(text[best]) ? 1 : 0; const a = text.slice(0, best + k).trim(), b = text.slice(best + k).trim(); return b ? [a, b] : [a]; };

const { browser, page } = await launch(1920, 1080);
await page.addScriptTag({ content: fs.readFileSync("overlay.js", "utf8") });
await page.evaluate(() => document.fonts.ready);
if (variant === "te") await page.evaluate(() => document.body.classList.add("tel"));
const outRoot = PROBE ? `probe/${variant}` : `frames/${variant}`; fs.mkdirSync(outRoot, { recursive: true });
let shots = 0;

for (const scene of scenes) {
  const has = (b) => (variant === "long" ? !!b.say : b[variant] !== undefined);
  const beats = scene.beats.filter((b) => has(b) && (!only || only.includes(b.id)));
  if (!beats.length) continue;
  console.log(`== scene ${scene.id} (${beats.length} beats)`);
  const dir = `${outRoot}/${scene.id}`; fs.mkdirSync(dir, { recursive: true });
  await scene.setup(page);
  const partialFile = `${outRoot}/${scene.id}.partial.json`;
  const tl = !PROBE && fs.existsSync(partialFile) ? JSON.parse(fs.readFileSync(partialFile)) : { scene: scene.id, beats: [] };
  const doneIds = new Set(tl.beats.map((b) => b.id)); if (doneIds.size) console.log("  resuming after", [...doneIds].pop());
  const ctx = {}; let sceneT = tl.beats.reduce((a, b) => a + b.dur, 0), prevCard = null, cardT0 = 0, prevDiag = null, diagT0 = 0;
  ctx.inletCentre = await page.evaluate(() => { const ds = window.__prithvi.getState().ds, sc = window.__scene, q = ds.inlets.map((i) => ({ i, d: Math.hypot(i.x - 800, i.y - 830) })).sort((a, b) => a.d - b.d)[0].i; return { x: q.x, y: q.y, w: [q.x, sc.gz(q.x, q.y) + 3, -q.y] }; });
  for (const beat0 of beats) {
    const beat = variant === "te" ? applyTe(beat0) : beat0;
    if (doneIds.has(beat.id)) continue;
    const sents = beat.silent ? [] : manifest[variant][beat.id]; if (!sents) throw new Error("no audio for " + beat.id);
    const speak = beat.silent ? beat.silent - LEAD - TAIL : sents.reduce((a, s) => a + s.dur, 0) + GAP * (sents.length - 1);
    const D = LEAD + speak + TAIL;
    if (beat.prep) await beat.prep(page, ctx);
    const a = beat.app || {};
    const world = (k) => { if (Array.isArray(k)) return k; const g = (x, y, dz = 12) => page.evaluate(([x, y, dz]) => [x, window.__scene.gz(x, y) + dz, -y], [x, y, dz]);
      const fm = /^fac(\d+)$/.exec(k); if (fm) return g(FACS[+fm[1]].x, FACS[+fm[1]].y, 14);
      const zm = /^zone_\d+$/.exec(k); if (zm) return page.evaluate((id) => { const z = window.__prithvi.getState().ds.zones.zones.find((q) => q.id === id); return [z.cx, window.__scene.gz(z.cx, z.cy), -z.cy]; }, k);
      return { deepest: () => ctx.deepest && g(ctx.deepest.x, ctx.deepest.y, 8), inlet: () => ctx.inletCentre.w, inletmid: () => ctx.inl?.mid, inletX: () => ctx.inl?.X.w, inletY: () => ctx.inl?.Y.w,
        red: () => ctx.deepest?.red && g(ctx.deepest.red.cx, ctx.deepest.red.cy, 14), amb: () => ctx.deepest?.amb && g(ctx.deepest.amb.cx, ctx.deepest.amb.cy, 14),
        zone: () => page.evaluate((id) => { const z = window.__prithvi.getState().ds.zones.zones.find((q) => q.id === id); return [z.cx, window.__scene.gz(z.cx, z.cy), -z.cy]; }, "zone_142") }[k]?.(); };
    const tgt = async (cam) => cam && typeof cam.tg === "string" ? { ...cam, tg: await world(cam.tg) } : cam;
    const callouts = beat.callouts ? await Promise.all(beat.callouts.map(async (c) => (typeof c.world === "string" ? { ...c, world: await world(c.world) } : c))) : null;
    await page.evaluate((a, L) => { const s = window.__prithvi.getState(); if (a.view) s.setView(a.view); if (a.tab) s.setTab(a.tab);
      s.setLayers({ ...L, ...(a.layers || {}) }); if (a.select !== undefined) { s.selectZone(a.select, false); if (a.tab) s.setTab(a.tab); } if (a.simAt !== undefined) window.SIM.seek(a.simAt); }, a, DEFAULT_LAYERS);
    if (a.bigInlets) await page.evaluate(() => { const sc = window.__scene, im = sc && sc.inletMesh; if (!im || im.__big) return; const M4 = im.matrix.constructor, V3 = sc.cur().tg.constructor, m = new M4(); for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m); m.scale(new V3(2.4, 2.4, 2.4)); im.setMatrixAt(i, m); } im.instanceMatrix.needsUpdate = true; im.__big = true; });
    await page.evaluate((f) => document.body.classList.toggle("film", f), !!(beat.film && !beat.film.keepUI));
    await sleep(900);
    await page.evaluate((a) => { const body = document.querySelector(".tab-body");
      if (a.details) document.querySelectorAll("details.layer").forEach((d, i) => { d.open = a.details.includes(i); });
      if (body && !a.keepScroll) { if (a.scrollTo !== undefined) document.querySelectorAll(".tab-body .stack > .card")[a.scrollTo]?.scrollIntoView({ block: "start" }); else if (a.scroll !== undefined) body.scrollTop = a.scroll; } }, a);
    await sleep(500);
    const cam0 = await page.evaluate(() => { const sc = window.__scene; if (!sc || !sc.cur) return null; const c = sc.cur(); return { th: c.th, ph: c.ph, r: c.r, tg: [c.tg.x, c.tg.y, c.tg.z] }; });
    const camEnd = a.cam ? await tgt(a.cam) : null;
    const path_ = a.path ? await Promise.all(a.path.map((k) => tgt(k))) : null;
    const lerp = (x, y, e) => x + (y - x) * e;
    const viewAt = (u) => { if (path_) { let i = 0; while (i < path_.length - 2 && u > path_[i + 1].u) i++; const k0 = path_[i], k1 = path_[i + 1], e = ease(clamp((u - k0.u) / (k1.u - k0.u))); return { th: lerp(k0.th, k1.th, e), ph: lerp(k0.ph, k1.ph, e), r: lerp(k0.r, k1.r, e), tg: k0.tg.map((v, j) => lerp(v, k1.tg[j], e)) }; }
      if (camEnd && cam0) { const e = ease(clamp(u / 0.85)); return { th: lerp(cam0.th, camEnd.th, e), ph: lerp(cam0.ph, camEnd.ph, e), r: lerp(cam0.r, camEnd.r, e), tg: cam0.tg.map((v, j) => lerp(v, camEnd.tg[j], e)) }; } return null; };
    const simAt = (u) => { if (!a.simKeys) return null; const K = a.simKeys; let i = 0; while (i < K.length - 2 && u > K[i + 1][0]) i++; const [u0, t0] = K[i], [u1, t1] = K[i + 1]; return lerp(t0, t1, clamp((u - u0) / (u1 - u0))); };
    const moving = !!(path_ || camEnd || a.simKeys || beat.frame || a.langAt);
    const animEnd = beat.kpi || callouts || beat.card || beat.diag ? 2.4 : 0.9;
    const times = PROBE ? [D * 0.42, D * 0.93] : []; if (!PROBE) for (let t = 0; t < D - 1e-6;) { times.push(t); t += moving || t < animEnd || beat.diag ? 1 / FPS_MOTION : 1 / FPS_HOLD; }
    const entries = [];
    for (let k = 0; k < times.length; k++) {
      const t = times[k], dur = (k + 1 < times.length ? times[k + 1] : D) - t, u = clamp((t - LEAD) / (D - LEAD - TAIL));
      const abs = sceneT + t;
      if (beat.card) { if (!prevCard || prevCard !== beat.card.id) { prevCard = beat.card.id; cardT0 = abs; } } else prevCard = null;
      if (beat.diag) { if (prevDiag !== beat.diag.name) { prevDiag = beat.diag.name; diagT0 = abs; } } else prevDiag = null;
      let cs = "", acc = LEAD;
      for (let si = 0; si < sents.length; si++) { const end = acc + sents[si].dur; if (t < end + GAP / 2 || si === sents.length - 1) { const ch = chunks(cap(sents[si].text)); const f = clamp((t - acc) / sents[si].dur); cs = ch[Math.min(ch.length - 1, Math.floor(f * ch.length * 0.999))]; break; } acc = end + GAP; }
      const v = viewAt(u), st = simAt(u), te = a.langAt ? (u >= a.langAt[0] && u < a.langAt[1] ? "te" : "en") : null;
      if (st !== null) ctx.sim = st; else if (a.simAt !== undefined && ctx.sim === undefined) ctx.sim = a.simAt;
      let film = null; if (beat.film) { const F = beat.film, simT = ctx.sim ?? 0, mins = Math.floor(simT / 60), hh = Math.floor(mins / 60) % 12 || 12, mm = String(mins % 60).padStart(2, "0");
        let flash = 0; (F.flash || []).forEach((fu) => { flash = Math.max(flash, Math.max(0, 1 - Math.abs(u - fu) / 0.012) * 0.55 + Math.max(0, 1 - Math.abs(u - fu - 0.02) / 0.02) * 0.25); });
        film = { tint: F.tint || null, tag: F.tag || "A FICTIONAL SCENARIO · NOT A REAL EVENT · NUMBERS FROM THE PROTOTYPE", clock: F.clockText || (F.clock === "sim" ? (variant === "te" ? teClockFrom(Math.floor(mins / 60) % 24, mm) : `${hh}:${mm} ${(mins / 60) % 24 < 12 ? "AM" : "PM"}`) : null), place: F.place, lines: (F.lines || []).map((l) => ({ text: l.text, alpha: Math.min(clamp((u - l.atu) / 0.07), l.until !== undefined ? 1 - clamp((u - l.until) / 0.05) : 1) })), flash, fade: Math.max(F.fadeIn ? 1 - clamp(t / F.fadeIn) : 0, F.fadeOut ? clamp((t - (D - F.fadeOut)) / F.fadeOut) : 0) }; }
      await page.evaluate(async (P) => { const sc = window.__scene;
        if (P.v && sc && sc.setViewNow) { sc.tw = null; const V = sc.cur().tg.constructor; sc.setViewNow({ th: P.v.th, ph: P.v.ph, r: P.v.r, tg: new V(...P.v.tg) }); }
        if (P.st !== null) window.SIM.seek(P.st); if (P.te) window.__prithvi.getState().setLang(P.te);
        window.VO.render(P.S); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); },
      { v, st, te, S: { part: scene.part, cap: cs, card: beat.card || null, ct: abs - cardT0, cu: u, diag: beat.diag || null, dt: abs - diagT0, du: beat.diag?.range ? beat.diag.range[0] + (beat.diag.range[1] - beat.diag.range[0]) * u : u, kpi: beat.kpi || null, callouts, u, t, dur: D - LEAD - TAIL, dim: 0, film } });
      if (beat.frame) { await beat.frame(page, u, ctx); await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); }
      if (k === 0 || (st !== null && k % 3 === 0)) await sleep(st !== null ? 120 : 260); // let the 4 Hz live-stats strip catch up
      const file = `${dir}/${beat.id}_${String(k).padStart(4, "0")}.jpg`;
      fs.writeFileSync(file, await page.screenshot({ type: "jpeg", quality: 90 }));
      entries.push({ file, dur });
      if (!PROBE && ++shots % REST_EVERY === 0) await sleep(REST_MS); // cool-down pause
    }
    tl.beats.push({ id: beat.id, start: sceneT, dur: D, bed: beat.bed || null, lead: LEAD, gap: GAP, sents: sents.map((s) => ({ file: s.file, dur: s.dur, text: cap(s.text) })), frames: entries });
    console.log(`  ${beat.id}  ${D.toFixed(1)}s  ${entries.length} frames`);
    sceneT += D; if (!PROBE) fs.writeFileSync(partialFile, JSON.stringify(tl));
  }
  tl.total = sceneT; fs.writeFileSync(`${outRoot}/${scene.id}.json`, JSON.stringify(tl)); fs.rmSync(partialFile, { force: true });
}
await browser.close();
console.log("RECORDED", variant, want);
