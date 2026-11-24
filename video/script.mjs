// Narration + on-screen actions for the PRITHVI AI explainer video (cinematic story, then the walkthrough).
// `say` = full video; `short` = text for the under-5-minute cut (beats not in SHORT_KEEP are skipped there).
import fs from "node:fs";
import { runScenario } from "./common.mjs";

export const M = JSON.parse(fs.readFileSync(new URL("./measures.json", import.meta.url)));
const S = M.scenarios, A = S.A, Z = M.zone;
const f1 = (v) => Number(v).toFixed(1);

export const SC = {
  A: { name: "200 mm in 4 hours, half the drains blocked", rainfallMm: 200, durationH: 4, blockageFrac: 0.5 },
  A0: { name: "Same storm, every drain open", rainfallMm: 200, durationH: 4, blockageFrac: 0 },
  A100: { name: "Same storm, every drain blocked", rainfallMm: 200, durationH: 4, blockageFrac: 1 },
  Ap: { name: "Same storm with six pumps", rainfallMm: 200, durationH: 4, blockageFrac: 0.5, pumps: true },
};
export const END = (4 + 3) * 3600; // 25200 s
export const OV = { th: 0.26, ph: 1.0, r: 1850, tg: [920, 20, -831] };
export const OV2 = { th: 0.55, ph: 0.98, r: 1500, tg: [1000, 15, -820] };
export const TOP = { th: 0, ph: 0.06, r: 2300, tg: [920, 20, -831] };
const Q = {
  left: "aside.panel.left", right: "aside.panel.right", stage: ".stage", timeline: "footer.timeline", views: ".header .views", lang: ".header .seg.lang",
  navpad: ".navpad", compass: ".navpad .compass", presets: "aside.left .chips", slRain: "aside.left label.slider:nth-of-type(1)", slDur: "aside.left label.slider:nth-of-type(2)",
  slBlock: "aside.left label.slider:nth-of-type(3)", pumps: "aside.left label.check", run: "aside.left .row .btn.primary", reset: "aside.left .row .btn:not(.primary)",
  heat: "aside.left .seg", clock: ".hud-clock", play: ".tl-main .play", speed: ".tl-main .speed", scrub: ".tl-scrub",
  legendDepth: ".hud-bl .legend@1", stat: (n) => `.tl-stats .stat@${n}`, card: (n) => `.tab-body .stack > .card@${n}`,
};

export async function setup(page, o = {}) {
  const { view = "3d", tab = "overview", layers = {}, sc = SC.A, simAt = 0, cam = OV, lang = "en", select = null, speed = 600, route = null } = o;
  if (sc) await runScenario(page, sc);
  await page.evaluate((a) => {
    const s = window.__prithvi.getState();
    s.setLang(a.lang); s.setView(a.view); s.setTab(a.tab); s.setSpeed(a.speed);
    s.setLayers({ risk: "off", peak: false, trees: true, buildings: true, roads: true, drains: true, facilities: true, water: true, rain: true, pumps: true, ...a.layers });
    s.selectZone(a.select, false); if (a.select) s.setTab(a.tab);
    if (a.route) s.setRoute(a.route);
    window.SIM.seek(a.simAt); window.SIM.simData.playing = false; s.setPlaying(false);
    const sc = window.__scene; if (sc) { sc.tw = null; const V = sc.cur().tg.constructor; sc.setViewNow({ th: a.cam.th, ph: a.cam.ph, r: a.cam.r, tg: new V(...a.cam.tg) }); }
  }, { view, tab, layers, simAt, cam, lang, select, speed, route });
}
const patch = (page, p) => page.evaluate((p) => window.__prithvi.getState().patchScenario(p), p);
const layers = (page, l) => page.evaluate((l) => window.__prithvi.getState().setLayers(l), l);


// ================================================================ Telugu version of the story film (narration + on-screen text)
export const teClockFrom = (h24, mm) => { const h12 = h24 % 12 || 12, p = h24 < 6 ? "రాత్రి" : h24 < 12 ? "ఉదయం" : h24 < 16 ? "మధ్యాహ్నం" : h24 < 20 ? "సాయంత్రం" : "రాత్రి"; return `${p} ${h12}:${mm}`; };
const teClockStr = (s) => { const m = /^(\d+):(\d+) (AM|PM)$/.exec(s); if (!m) return s; let h = +m[1] % 12; if (m[3] === "PM") h += 12; return teClockFrom(h, m[2]); };
export const TE = {
  f0: { say: "", card: { big: "వర్షానికి ముందు రాత్రి", size: 88, small: "ఒక లఘు చిత్రం · కల్పితం" } },
  f1: { say: "రాత్రి పదకొండు నలభై. కాకినాడ ప్రశాంతంగా ఉంది. కానీ వాతావరణ సూచన మాత్రం ప్రశాంతంగా లేదు.", card: { big: "రాత్రి 11:40", small: "కాకినాడ · ఒక కల్పిత రాత్రి" } },
  f2: { say: "ఉదయానికల్లా భారీ వర్షం రానుంది. మున్సిపల్ కంట్రోల్ రూమ్‌లో, మీరా అనే ఇంజనీర్ ప్రతి ఏటా మునిగిపోయే వీధులను చూస్తోంది. అవి ఆమెకు కంఠతా తెలిసిన వీధులు, అయినా వాటి గతిని ఆమె ముందుగా అంచనా వేయలేకపోతోంది." },
  f3: { say: "ప్రతి వర్షాకాలంలో ఆమెను అవే ప్రశ్నలు అడుగుతారు. ఏ వీధుల్లో నీళ్లు నిలుస్తాయి? గత సీజన్ నుంచి కాలువలు ఇంకా మూసుకుపోయే ఉంటే ఏమవుతుంది? సిబ్బందిని ముందు ఎక్కడికి పంపాలి? ప్రతిసారీ సమాధానాలు జ్ఞాపకశక్తి నుంచి, కాగితం మ్యాపుల నుంచే వస్తాయి." },
  f4: { say: "ఈ రాత్రి ఆమె దగ్గర ఒక కొత్త సాధనం ఉంది. ఆమె పృథ్వి ఏఐ తెరిచి, సూచనను నమోదు చేస్తుంది: నాలుగు గంటల్లో రెండువందల మిల్లీమీటర్ల వర్షం. గత సంవత్సరంలాగే సగం కాలువలు మూసుకుపోయాయని ఆమె గుర్తిస్తుంది.", lines: ["200 మి.మీ. వర్షం", "నాలుగు గంటల్లో", "సగం కాలువలు మూసుకుపోయాయి"] },
  f5: { say: "అర్ధరాత్రి. వర్షం మొదలవుతుంది.", card: { big: "అర్ధరాత్రి 12:00", small: "వర్షం మొదలవుతుంది" } },
  f6: { say: "మెల్లగా మొదలవుతుంది. ఇరవై నిమిషాల వరకు ఏమీ తప్పుగా అనిపించదు. తర్వాత, పట్టణంలోని లోతట్టు మూలల్లో మొదటి నీరు చేరుతుంది." },
  f7: { say: "ఒంటి గంటకల్లా ఆరు హెక్టార్లు నీటిలో మునిగిపోతాయి. రెండు గంటలకు వర్షం గరిష్ఠానికి చేరుతుంది, ఇరవై మూడు హెక్టార్లు నీటిలో ఉంటాయి. కొద్దిసేపటికే ఇరవై నాలుగు హెక్టార్లు. ఈ వరద చేరే గరిష్ఠ విస్తీర్ణం ఇదే." },
  f8: { say: "అప్పుడు మీరాకు, కాగితం మ్యాపులు ఎప్పుడూ చూపించనిది కనిపిస్తుంది. మోడల్ అధిక ప్రమాదంగా చూపించిన బ్లాక్‌లలో ఎనిమిది ముఖ్యమైన ప్రదేశాలు ఉన్నాయి. ఐదు ఆసుపత్రులు లేదా క్లినిక్‌లు. అగ్నిమాపక కేంద్రం. మరియు ఆశ్రయాలుగా ఉపయోగపడే రెండు స్థలాలు.", labels: ["ఆసుపత్రి", "ఆసుపత్రి", "అగ్నిమాపక కేంద్రం"] },
  f9: { say: "మహావీర్ ఆసుపత్రి, రెండు పాయింట్ నాలుగు కిలోమీటర్ల దూరంలోని ఆశ్రయానికి ఇంకా అనుసంధానమై ఉందా అని ఆమె పరిశీలిస్తుంది. ఇరవై ఐదు సెంటీమీటర్ల నీటిలో, అవును. పది సెంటీమీటర్లలో, పద్నాలుగు కిలోమీటర్ల రోడ్లు పనికిరాకుండా పోతాయి, అనుసంధానం తెగిపోతుంది. అది అనుసరించాల్సిన మార్గం కాదు. ప్రణాళిక వేసుకోవాల్సిన హెచ్చరిక.", lines: ["25 సెం.మీ. నీరు: అనుసంధానం ఉంది", "10 సెం.మీ. నీరు: తెగిపోయింది"] },
  f10: { say: "ఆమె అందరినీ అన్నిచోట్లకూ పంపాల్సిన అవసరం లేదు. ఒక బ్లాక్ మొదటి స్థానంలో ఉంది: బ్లాక్ నూట నలభై రెండు. స్కోరు అరవై తొమ్మిది, పట్టణంలోనే అత్యధికం. దాని రెండు కాలువలూ మూసుకుపోయాయి.", labels: ["బ్లాక్ 142 · 69"] },
  f11: { say: "కాబట్టి ఆమె ఒకే ఒక్కటి ప్రయత్నిస్తుంది: ఆ రెండు కాలువలను శుభ్రం చేసి, మళ్లీ నడిపి చూడటం. బ్లాక్ స్కోరు అరవై తొమ్మిది నుంచి అరవై ఒకటి పాయింట్ ఏడుకు తగ్గుతుంది. పట్టణమంతటా అధిక ప్రమాద బ్లాక్‌లు ఎనభై నుంచి డెబ్బై రెండుకు తగ్గుతాయి. వర్షానికి ముందే రెండు కాలువలు శుభ్రం.", lines: ["బ్లాక్ 142:  69 → 61.7", "అధిక ప్రమాద బ్లాక్‌లు:  80 → 72"] },
  f12: { say: "ఆరు గంటలకల్లా వర్షం ఆగింది, నీరు దాదాపు పూర్తిగా తగ్గిపోయింది. ఈ కథలో నిజంగా ఏదీ జరగలేదు. ఇది ఒక రిహార్సల్. అలాంటి రిహార్సల్ కోసమే పృథ్వి ఏఐ రూపొందింది." },
  f13: { say: "", card: { big: "తదుపరి తుఫానుకు ఒక రిహార్సల్", size: 70, small: "పృథ్వి ఏఐ · పరిసర ప్రమాద డిజిటల్ ట్విన్" } },
};
export function applyTe(b) {
  const t = TE[b.id]; if (!t) return b; const o = { ...b };
  if (t.card) o.card = { ...b.card, ...t.card };
  if (b.film) { o.film = { ...b.film, place: "కాకినాడ", tag: "కల్పిత కథ · నిజమైన సంఘటన కాదు · సంఖ్యలు ప్రోటోటైప్ నుండి" };
    if (b.film.clockText) o.film.clockText = teClockStr(b.film.clockText);
    if (t.lines && b.film.lines) o.film.lines = b.film.lines.map((l, i) => ({ ...l, text: t.lines[i] ?? l.text })); }
  if (b.callouts && t.labels) o.callouts = b.callouts.map((c, i) => ({ ...c, label: t.labels[i] ?? c.label }));
  return o;
}

export function build() {
  const scenes = [];
  const add = (id, title, setupFn, beats) => scenes.push({ id, title, setup: setupFn, beats });

  // ================================================================ the story (cinematic opening)
  const NIGHT = { c: "rgb(105,128,190)", mode: "multiply", a: 1 }, STORM = { c: "rgb(92,112,160)", mode: "multiply", a: 1 }, DAWN = { c: "rgb(130,76,44)", mode: "screen", a: 0.55 };
  const FZ = M.film;
  const SH = {
    aerial: [{ u: 0, th: 0.95, ph: 1.12, r: 2200, tg: [800, 0, -830] }, { u: 1, th: 0.55, ph: 1.18, r: 1500, tg: [750, 5, -760] }],
    roof1: [{ u: 0, th: 2.4, ph: 1.3, r: 330, tg: [420, 8, -420] }, { u: 1, th: 2.1, ph: 1.28, r: 380, tg: [560, 8, -560] }],
    roof2: [{ u: 0, th: 2.1, ph: 1.28, r: 380, tg: [560, 8, -560] }, { u: 1, th: 1.8, ph: 1.22, r: 600, tg: [760, 8, -640] }],
    flood: [{ u: 0, th: -0.5, ph: 1.2, r: 1000, tg: [1200, 5, -950] }, { u: 1, th: -1.0, ph: 1.22, r: 560, tg: [1330, 5, -1130] }],
    crane: [{ u: 0, th: 0.4, ph: 1.25, r: 500, tg: [1300, 5, -1100] }, { u: 1, th: -0.3, ph: 0.8, r: 2300, tg: [900, 5, -830] }],
  };
  add("film", null, (p) => setup(p, { sc: SC.A, cam: OV, simAt: 0, layers: { rain: false } }), [
    { id: "f1", say: "Eleven forty at night, in Kakinada. The city is quiet. The forecast is not.", short: "Eleven forty at night, in Kakinada. The city is quiet. The forecast is not.",
      film: { tint: NIGHT }, bed: { drone: [0.25, 0.45], wind: [0.3, 0.4] }, card: { id: "fc1", type: "film", big: "11:40 PM", small: "KAKINADA  ·  A FICTIONAL NIGHT" } },
    { id: "f2", say: "Heavy rain will arrive by morning. In the municipal control room, an engineer named Meera is looking at the streets that flood every year. Streets she knows by heart, and still cannot predict.",
      short: "Heavy rain will arrive by morning. In the municipal control room, an engineer named Meera looks at the streets that flood every year, and cannot predict them.",
      film: { tint: NIGHT, clockText: "11:40 PM", fadeIn: 1.2 }, app: { path: SH.aerial, simAt: 0, layers: { rain: false } }, bed: { drone: [0.45, 0.55], wind: [0.4, 0.5] } },
    { id: "f3", say: "Every monsoon, she is asked the same questions. Which streets will hold water? What if the drains are still blocked from last season? Where should the crews go first? And every monsoon, the answers come from memory, and paper maps.",
      film: { tint: NIGHT, clockText: "11:52 PM" }, app: { path: SH.roof1, simAt: 0, layers: { rain: false } }, bed: { drone: [0.55, 0.6], wind: [0.5, 0.5] } },
    { id: "f4", say: "Tonight, she has something different. She opens Prithvi A I, and enters the forecast: two hundred millimetres of rain, over four hours. She marks half the drains as blocked, the way they were last year.",
      short: "She opens Prithvi A I and enters the forecast: two hundred millimetres of rain over four hours, with half the drains blocked.",
      film: { tint: NIGHT, clockText: "11:58 PM", fadeIn: 0.8, lines: [{ text: "200 mm of rain", atu: 0.38 }, { text: "over four hours", atu: 0.56 }, { text: "half the drains blocked", atu: 0.76 }] },
      app: { path: [{ u: 0, th: 0.4, ph: 1.15, r: 1700, tg: [800, 0, -800] }, { u: 1, th: 0.75, ph: 1.2, r: 1150, tg: [760, 5, -740] }], simAt: 0, layers: { rain: false } }, bed: { drone: [0.55, 0.5], wind: [0.4, 0.3] } },
    { id: "f5", say: "Midnight. The rain begins.", film: { tint: NIGHT }, bed: { drone: [0.5, 0.6], rain: [0, 0.25], wind: [0.3, 0.45] }, card: { id: "fc5", type: "film", big: "12:00 AM", small: "THE RAIN BEGINS" } },
    { id: "f6", say: "It starts softly. For twenty minutes, nothing seems wrong. Then, in the low corners of the town, the first water gathers.", short: "The rain begins softly. Twenty minutes in, the first water gathers in the low corners of the town.",
      film: { tint: STORM, clock: "sim", fadeIn: 0.9 }, app: { path: SH.roof2, simKeys: [[0, 0], [1, 1500]], layers: { rain: true } }, bed: { rain: [0.25, 0.55], drone: [0.6, 0.7], wind: [0.45, 0.55] } },
    { id: "f7", say: "By one o'clock, six hectares lie under water. At two, the rain peaks, and twenty three hectares are flooded. Soon after, twenty four: the widest the flood will ever be.", short: "By one o'clock, six hectares lie under water. At two, the rain peaks, and the flood is nearly at its widest.",
      film: { tint: STORM, clock: "sim", flash: [0.58, 0.84] }, app: { path: SH.flood, simKeys: [[0, 1500], [0.3, 3600], [0.62, 5400], [1, 7200]], layers: { rain: true } }, bed: { rain: [0.55, 1], drone: [0.7, 0.85], wind: [0.55, 0.7], thunder: [0.58, 0.84] } },
    { id: "f8", say: "Then Meera sees what the paper maps never showed her. Eight places that matter sit inside blocks the model ranks as higher risk. Five hospitals or clinics. The fire station. And two places that could serve as shelters.",
      short: "Eight places that matter sit inside blocks ranked as higher risk: five hospitals or clinics, the fire station, and two shelter candidates.",
      film: { tint: STORM, clock: "sim" }, app: { path: [{ u: 0, th: 0.6, ph: 1.1, r: 1200, tg: [900, 10, -830] }, { u: 1, th: 0.95, ph: 1.12, r: 760, tg: "fac0" }], simAt: 7200, layers: { risk: "index", rain: true } },
      callouts: [{ world: "fac0", label: "Hospital", style: "film", side: "left", atu: 0.35, size: 110 }, { world: "fac1", label: "Hospital", style: "film", side: "bottom", atu: 0.5, size: 110 }, { world: "fac5", label: "Fire station", style: "film", side: "top", atu: 0.68, size: 110 }], bed: { rain: [0.9, 0.7], drone: [0.85, 0.8], wind: [0.6, 0.5] } },
    { id: "f9", say: "She checks whether Mahaveer Hospital stays connected to a shelter two point four kilometres away. At twenty five centimetres of water, it does. At ten centimetres, fourteen kilometres of road drop out, and the connection is cut. Not a route to follow. A warning to plan around.",
      short: "She checks whether Mahaveer Hospital stays connected to a shelter. At ten centimetres of water the connection is cut: a warning to plan around, not a route to follow.",
      film: { tint: STORM, clockText: "2:06 AM", fadeIn: 0.8, lines: [{ text: "25 cm of water: connected", atu: 0.34, until: 0.56 }, { text: "10 cm of water: cut", atu: 0.62 }] },
      app: { tab: "routes", simAt: 7200, path: [{ u: 0, th: 0.35, ph: 1.0, r: 1500, tg: [920, 15, -830] }, { u: 1, th: 0.7, ph: 1.12, r: 1000, tg: [900, 10, -800] }], layers: { rain: true } },
      frame: async (p, u) => p.evaluate((a) => window.__prithvi.getState().setRoute({ routeFrom: "n7790467455", routeTo: "w1193917413", routeThreshold: a }), u < 0.5 ? 0.25 : Math.max(0.1, Math.round((0.25 - 0.15 * Math.min(1, (u - 0.5) / 0.3)) * 20) / 20)),
      bed: { rain: [0.3, 0.2], drone: [0.8, 0.7], wind: [0.4, 0.3] } },
    { id: "f10", say: "She does not need to send crews everywhere. One block comes first: block one four two. A score of sixty nine, the highest in the town. Both of its drains are blocked.", short: "One block comes first: block one four two, with a score of sixty nine. Both of its drains are blocked.",
      film: { tint: STORM, clock: "sim" }, prep: async (p) => { await p.evaluate(() => window.__prithvi.getState().setTab("overview")); await patch(p, { overrides: {} }); },
      app: { cam: { th: 0.5, ph: 1.12, r: 430, tg: "zone" }, simAt: 7200, select: Z.id, layers: { risk: "index", rain: true } }, callouts: [{ world: "zone", label: `Block 142  ·  ${Math.round(Z.idx)}`, style: "film", side: "right", atu: 0.35, size: 130 }], bed: { rain: [0.6, 0.5], drone: [0.8, 0.9], wind: [0.4, 0.4] } },
    { id: "f11", say: `So she tries one thing: clear just those two drains, and run it again. The block's score falls from sixty nine to ${f1(FZ.after.zone)}, and the number of higher risk blocks across the town falls from ${FZ.before.flagged} to ${FZ.after.flagged}. Two drains, cleared before the rain.`,
      short: `Clear just those two drains, and the block's score falls from sixty nine to ${f1(FZ.after.zone)}, and higher risk blocks across town fall from ${FZ.before.flagged} to ${FZ.after.flagged}.`,
      film: { tint: STORM, clock: "sim", lines: [{ text: `Block 142:  ${Math.round(FZ.before.zone)}  →  ${f1(FZ.after.zone)}`, atu: 0.55 }, { text: `Higher-risk blocks:  ${FZ.before.flagged}  →  ${FZ.after.flagged}`, atu: 0.75 }] }, app: { bigInlets: true, cam: { th: 0.8, ph: 1.1, r: 380, tg: "zone" }, simAt: 7200, select: Z.id, layers: { risk: "index", rain: false } },
      frame: async (p, u) => { if (u > 0.3) await patch(p, { overrides: { [FZ.ids[0]]: "cleared", [FZ.ids[1]]: "cleared" } }); },
      bed: { rain: [0.45, 0.3], drone: [0.9, 0.7], maj: [0, 0.4], wind: [0.4, 0.4] } },
    { id: "f12", say: "By six, the rain has stopped, and the water has almost all drained away. Nothing in this story really happened. It was a rehearsal. And a rehearsal is exactly what Prithvi A I is for.", short: "Nothing in this story really happened. It was a rehearsal. And a rehearsal is exactly what Prithvi A I is for.",
      film: { tint: DAWN, clock: "sim", fadeOut: 1.3 }, prep: async (p) => patch(p, { overrides: {} }), app: { path: SH.crane, simKeys: [[0, 14400], [1, 21600]], layers: { risk: "off", rain: true } }, bed: { rain: [0.4, 0], drone: [0.7, 0.55], maj: [0.4, 1], wind: [0.4, 0.3] } },
  ]);

  { const fsc = scenes[scenes.length - 1];   // story-only cut: title card first, closing card last, narration = the story lines
    fsc.beats.forEach((b) => { b.story = b.say; });
    fsc.beats.unshift({ id: "f0", silent: 5.5, story: "", film: { tint: NIGHT }, bed: { drone: [0.2, 0.4], wind: [0.25, 0.35] }, card: { id: "fc0", type: "film", big: "THE NIGHT BEFORE THE RAIN", size: 96, small: "A SHORT FILM  ·  FICTIONAL" } });
    fsc.beats.push({ id: "f13", silent: 7, story: "", film: { tint: DAWN }, bed: { hit: 0.0, drone: [0.6, 0.2], maj: [1, 1], wind: [0.25, 0.1] }, card: { id: "fc13", type: "film", big: "A REHEARSAL FOR THE NEXT STORM", size: 78, small: "PRITHVI AI  ·  NEIGHBOURHOOD RISK DIGITAL TWIN" } }); }

  { // ---- extended cinematic cut ("cine"): extra scenes woven between the story beats; the 2:45 cut ignores them
    const fsc = scenes[scenes.length - 1]; const byId = (id) => fsc.beats.find((b) => b.id === id);
    const DUSK = { c: "rgb(205,160,125)", mode: "multiply", a: 1 };
    const SHX = {
      dusk: [{ u: 0, th: 1.3, ph: 1.1, r: 2400, tg: [800, 0, -830] }, { u: 1, th: 0.9, ph: 1.14, r: 1900, tg: [800, 0, -830] }],
      push: [{ u: 0, th: 0.9, ph: 1.14, r: 1900, tg: [800, 0, -830] }, { u: 1, th: 0.6, ph: 1.18, r: 1500, tg: [760, 5, -760] }],
      roof0: [{ u: 0, th: 2.1, ph: 1.28, r: 380, tg: [560, 8, -560] }, { u: 1, th: 2.45, ph: 1.3, r: 330, tg: [420, 8, -420] }],
      orbit: [{ u: 0, th: 0.55, ph: 1.2, r: 1500, tg: [750, 5, -760] }, { u: 1, th: 0.1, ph: 1.15, r: 1250, tg: [760, 5, -740] }],
      low: [{ u: 0, th: -0.9, ph: 1.3, r: 420, tg: [1250, 3, -1050] }, { u: 1, th: -1.3, ph: 1.28, r: 520, tg: [1330, 3, -1130] }],
      peak: [{ u: 0, th: 0.2, ph: 1.15, r: 1400, tg: [1000, 5, -900] }, { u: 1, th: 0.0, ph: 0.85, r: 2200, tg: [900, 5, -830] }],
      hosp: [{ u: 0, th: 1.2, ph: 1.25, r: 520, tg: "fac0" }, { u: 1, th: 1.7, ph: 1.25, r: 420, tg: "fac0" }],
      choose: [{ u: 0, th: 0.5, ph: 1.0, r: 1700, tg: [920, 15, -830] }, { u: 1, th: 0.3, ph: 1.05, r: 1400, tg: [920, 15, -830] }],
      list: [{ u: 0, th: 0.5, ph: 1.15, r: 600, tg: "zone_142" }, { u: 0.5, th: 0.6, ph: 1.15, r: 600, tg: "zone_176" }, { u: 1, th: 0.7, ph: 1.15, r: 600, tg: "zone_209" }],
      drain: [{ u: 0, th: 0.4, ph: 1.25, r: 500, tg: [1300, 5, -1100] }, { u: 1, th: -0.1, ph: 1.0, r: 1100, tg: [1150, 5, -1000] }],
      dawn: [{ u: 0, th: 0.9, ph: 1.1, r: 1700, tg: [800, 0, -830] }, { u: 1, th: 0.6, ph: 1.0, r: 2100, tg: [800, 0, -830] }],
    };
    const at = (id, nb) => { const i = fsc.beats.findIndex((b) => b.id === id); fsc.beats.splice(i + 1, 0, ...nb); };
    ["f0", "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10", "f11", "f13"].forEach((id) => { byId(id).cine = byId(id).story; });
    at("f1", [
      { id: "g1", cine: "Earlier that evening, the town did what towns do when rain is forecast. Shutters came down early. Sacks were lifted onto high shelves. Somewhere, a radio repeated the warning, and nobody quite believed it would be as bad as last time.", film: { tint: DUSK, clockText: "7:45 PM", fadeIn: 1.2 }, app: { path: SHX.dusk, simAt: 0, layers: { rain: false } }, bed: { drone: [0.35, 0.45], wind: [0.35, 0.4] } },
      { id: "s1", silent: 7, cine: "", film: { tint: NIGHT, clockText: "10:15 PM", fadeIn: 1.5 }, app: { path: SHX.push, simAt: 0, layers: { rain: false } }, bed: { drone: [0.45, 0.5], wind: [0.4, 0.45] } },
    ]);
    at("f2", [{ id: "g2", cine: "Meera has worked on these streets for eleven years. She knows which lanes drown first, and which drain covers lift in the first heavy rain. What she has never known is how much water, how fast, and where it will go next.", film: { tint: NIGHT, clockText: "11:46 PM" }, app: { path: SHX.roof0, simAt: 0, layers: { rain: false } }, bed: { drone: [0.55, 0.6], wind: [0.5, 0.5] } }]);
    at("f3", [{ id: "g3", cine: "This time, she has a way to ask. Not to predict the rain; nobody can promise that. But to rehearse it, and ask what if, before the first drop falls.", film: { tint: NIGHT, clockText: "11:57 PM" }, app: { path: SHX.orbit, simAt: 0, layers: { rain: false } }, bed: { drone: [0.6, 0.55], wind: [0.5, 0.4] } }]);
    at("f6", [{ id: "g4", cine: "The water finds the old paths first. The low lanes. The field behind the school. The road that has always been the first to go.", film: { tint: STORM, clock: "sim" }, app: { path: SHX.low, simKeys: [[0, 1500], [1, 3000]], layers: { rain: true } }, bed: { rain: [0.55, 0.65], drone: [0.7, 0.75], wind: [0.55, 0.6] } }]);
    at("f7", [
      { id: "g5", cine: "From above, it looks almost calm. A dark sheet, laid gently over the town. It is not calm.", film: { tint: STORM, clock: "sim", flash: [0.3] }, app: { path: SHX.peak, simAt: 7200, layers: { rain: true } }, bed: { rain: [0.9, 0.8], drone: [0.85, 0.8], wind: [0.7, 0.6], thunder: [0.3] } },
      { id: "s2", silent: 8, cine: "", film: { tint: STORM, clock: "sim", flash: [0.25, 0.62] }, app: { path: SH.flood.slice().reverse().map((k, i) => ({ ...k, u: i })), simAt: 7200, layers: { rain: true } }, bed: { rain: [0.8, 0.7], drone: [0.8, 0.8], wind: [0.7, 0.6], thunder: [0.27, 0.64] } },
    ]);
    at("f8", [{ id: "g6", cine: "A hospital does not close for rain. Its patients still need one road in, and one road out.", film: { tint: STORM, clock: "sim" }, app: { path: SHX.hosp, simAt: 7200, layers: { rain: true } }, callouts: [{ world: "fac0", label: "Hospital", style: "film", side: "right", atu: 0.4, size: 110 }], bed: { rain: [0.8, 0.6], drone: [0.8, 0.8], wind: [0.55, 0.5] } }]);
    at("f9", [{ id: "g7", cine: "Meera looks at the screen for a long time. There are two hundred and seventy two blocks on the map. She cannot fix them all. She has to choose.", film: { tint: STORM, clockText: "2:20 AM", lines: [{ text: "272 blocks", atu: 0.5 }] }, app: { path: SHX.choose, simAt: 7200, layers: { risk: "index", rain: true } }, bed: { rain: [0.5, 0.45], drone: [0.8, 0.85], wind: [0.45, 0.4] } }]);
    at("f11", [
      { id: "g8", cine: "She writes it down. Block one four two. Then the next, and the next, by score, until the list runs out of people. A crew of four, a truck, a long pole, and a plan.", film: { tint: STORM, clockText: "2:40 AM", lines: [{ text: "1   Block 142", atu: 0.3 }, { text: "2   Block 176", atu: 0.5 }, { text: "3   Block 209", atu: 0.7 }] }, app: { path: SHX.list, simAt: 7200, layers: { risk: "index", rain: false } },
        callouts: [{ world: "zone_142", label: "1", style: "film", side: "right", atu: 0.3, size: 100 }, { world: "zone_176", label: "2", style: "film", side: "right", atu: 0.5, size: 100 }, { world: "zone_209", label: "3", style: "film", side: "right", atu: 0.7, size: 100 }], bed: { rain: [0.3, 0.2], drone: [0.85, 0.7], wind: [0.4, 0.4] } },
      { id: "h1", cine: "By six, the rain has stopped, and the water has drained away, hectare by hectare, until the town is almost dry again.", film: { tint: DAWN, clock: "sim" }, app: { path: SHX.drain, simKeys: [[0, 14400], [1, 21600]], layers: { rain: true } }, bed: { rain: [0.35, 0.05], drone: [0.7, 0.6], maj: [0.3, 0.7], wind: [0.4, 0.3] } },
      { id: "g10", cine: "Meera closes the laptop. The real rain is still hours away. She does not know whether her list will be enough. Nobody does. But tonight, for the first time, she knows where to look first.", film: { tint: DAWN, clockText: "6:20 AM", fadeIn: 1.2 }, app: { path: SHX.dawn, simAt: 0, layers: { rain: false } }, bed: { drone: [0.6, 0.55], maj: [0.8, 1], wind: [0.3, 0.25] } },
      { id: "s3", silent: 7, cine: "", film: { tint: { c: "rgb(150,95,55)", mode: "screen", a: 0.6 }, clockText: "6:40 AM" }, app: { path: SHX.dawn.map((k) => ({ ...k, th: k.th - 0.3, r: k.r + 200 })), simAt: 0, layers: { rain: false } }, bed: { drone: [0.55, 0.5], maj: [1, 1], wind: [0.25, 0.2] } },
      { id: "h2", cine: "Nothing in this story really happened. It was a rehearsal. And a rehearsal is exactly what Prithvi A I is for.", film: { tint: { c: "rgb(150,95,55)", mode: "screen", a: 0.6 }, clockText: "6:45 AM", fadeOut: 1.3 }, app: { path: SHX.dawn.map((k) => ({ ...k, th: k.th - 0.5, r: k.r + 300 })), simAt: 0, layers: { rain: false } }, bed: { drone: [0.5, 0.4], maj: [1, 1], wind: [0.2, 0.15] } },
    ]);
  }

  // ================================================================ intro
  add("intro", null, (p) => setup(p, { sc: SC.A }), [
    { id: "b1", bed: { hit: 0.0, drone: [0.55, 0.15] }, say: "Prithvi A I. A neighbourhood risk digital twin. Built for Hack With Aditya twenty twenty six, in the theme Smart Infrastructure and Water.",
      short: "Prithvi A I. A neighbourhood risk digital twin, built for Hack With Aditya twenty twenty six.",
      card: { id: "t1", type: "title", kick: "A NEIGHBOURHOOD RISK DIGITAL TWIN", title: "PRITHVI AI", sub: "See the water. Test the what-ifs. Understand the why.", foot: "HackWithAditya 2026  ·  Smart Infrastructure &amp; Water" } },
    { id: "b2", say: "This video is for the people who plan for heavy rain: district disaster management teams, district heads, municipal officers and infrastructure engineers. No technical background is needed. We will show every feature and explain every number.",
      card: { id: "t2", type: "list", kick: "WHO THIS VIDEO IS FOR", title: "People who plan for heavy rain", items: [
        { ic: "🛡️", h: "District disaster management teams", p: "Rehearse a storm before it arrives" }, { ic: "🏛️", h: "District heads", p: "See what is exposed, and why, on one screen" },
        { ic: "🔧", h: "Municipal officers", p: "Decide which drains and roads to check first" }, { ic: "📐", h: "Infrastructure engineers", p: "Test drainage assumptions and see every number" }] } },
  ]);

  // ================================================================ 1 problem
  add("problem", "The problem", (p) => setup(p, { sc: SC.A }), [
    { id: "b4", say: "Prithvi A I brings the answers into one place that you can see, change and question. Now let us see how it works, step by step.",
      card: { id: "s", type: "tiles", cols: 3, kick: "ONE PLACE FOR THE ANSWERS", title: "See it. Try it. Explain it.", tiles: [
        { h: "SEE", c: "#38bdf8", p: ["Watch water move through real streets"] }, { h: "TRY", c: "#fbbf24", p: ["Change rain, drains and pumps, then compare"] }, { h: "EXPLAIN", c: "#2dd4bf", p: ["Understand why every block scores as it does"] }] } },
  ]);

  // ================================================================ 2 twin
  add("twin", "What Prithvi AI is", (p) => setup(p, { sc: SC.A, simAt: 7200, cam: OV2 }), [
    { id: "b5", say: "A digital twin is a virtual copy of a real place. Here, the place is the centre of Kakinada, an area about one point six kilometres by one point seven kilometres. Every building, road, hospital and fire station you see is placed where it really is.",
      app: { cam: { th: 1.45, ph: 0.9, r: 1500, tg: [900, 15, -820] }, simAt: 7200 },
      kpi: { title: "PILOT AREA  ·  CENTRAL KAKINADA", pos: "sl", rows: [{ label: "Size", text: "1.6 × 1.7 km" }, { label: "Buildings", to: 472, c: "#fff" }, { label: "Road segments", to: 250 }, { label: "Facilities", to: 23 }] } },
    { id: "b6", say: "Around this copy, three things work together. A flood simulator, which shows water moving through the streets. A risk score, which ranks every hundred metre block of the area. And planning tools, which turn those results into decisions.",
      short: "Three things work together: a flood simulator, a risk score for every block, and planning tools that turn results into decisions.",
      diag: { name: "concept" } },
  ]);

  // ================================================================ 3 data
  add("data", "Where the data comes from", (p) => setup(p, { sc: SC.A, cam: TOP, layers: { buildings: false, roads: false, facilities: false, drains: false, trees: false, rain: false, water: false } }), [
    { id: "b7", say: `Nothing on screen is invented. Buildings, roads, hospitals, and fire and police stations come from Open Street Map, the open map built by volunteers: ${472} buildings, ${250} road segments and ${23} facilities here, fourteen of them hospitals or clinics. The ground height comes from the Copernicus satellite elevation model. It is coarse, about ninety metres between points, so we smooth it to a grid of twelve and a half metre squares.`,
      app: { cam: { th: 0.2, ph: 0.8, r: 1750, tg: [900, 15, -820] } },
      frame: async (p, u) => { await layers(p, { buildings: u > 0.12, roads: u > 0.26, facilities: u > 0.4 }); if (u > 0.6) await p.evaluate(() => { const s = window.__prithvi.getState(); if (s.tab !== "data") s.setTab("data"); setTimeout(() => document.querySelectorAll("details.layer").forEach((d, i) => { d.open = i < 4; }), 120); }); },
      callouts: [{ sel: ".toggles .toggle@2", label: "Buildings: OpenStreetMap", side: "right", atu: 0.14, untilu: 0.26, pad: 6 }, { sel: ".toggles .toggle@3", label: "Roads: OpenStreetMap", side: "right", atu: 0.28, untilu: 0.4, pad: 6 }, { sel: ".toggles .toggle@6", label: "Hospitals, fire and police", side: "right", atu: 0.42, untilu: 0.58, pad: 6 }, { sel: "details.layer@0", label: "Terrain: ~90 m points → 12.5 m grid", side: "left", atu: 0.75, pad: 6 }] },
    { id: "b9", say: "One thing is missing, and we say so openly: there is no drainage map for this area. So the drain inlets you see in cyan are stand-ins, spread evenly along the roads. We call them proxy data. They let you test what-if questions, but they do not show where real drains are.",
      app: { tab: "data", bigInlets: true, layers: { buildings: true, roads: true, facilities: false, drains: true, trees: false, rain: false, water: false }, cam: { th: 0.35, ph: 1.05, r: 520, tg: "inlet" }, details: [5] },
      callouts: [{ world: "inlet", label: "Stand-in drain inlet, not a real drain", side: "right", atu: 0.3, size: 90 }, { sel: "details.layer@5", label: "Status: proxy", side: "left", atu: 0.6, pad: 6 }] },
    { id: "b10", say: "Every layer carries one of four labels. Observed means mapped or measured. Derived means calculated from observed data. Proxy means a stand-in. Simulated means produced by a what-if. The Data and limits tab shows the source and limits of each.",
      card: { id: "st", type: "tiles", cols: 2, kick: "FOUR LABELS ON EVERY LAYER", title: "How much to believe each layer", tiles: [
        { tag: "OBSERVED", c: "#22c55e", h: "Mapped or measured", p: ["Buildings, roads, hospitals, fire and police stations"] }, { tag: "DERIVED", c: "#3b82f6", h: "Calculated from observed data", p: ["Ground height on the grid, risk scores"] },
        { tag: "PROXY", c: "#fbbf24", h: "A stand-in", p: ["Drain inlets, because no drainage map exists"] }, { tag: "SIMULATED", c: "#f472b6", h: "Produced by a what-if", p: ["Rainfall you choose, flood water"] }] } },
  ]);

  // ================================================================ 4 tour
  add("tour", "Getting around", (p) => setup(p, { sc: SC.A, simAt: 7200, cam: OV2 }), [
    { id: "b11", say: "Here is the screen. On the left, the scenario controls and layers. In the centre, the three-D twin. On the right, six tabs of results. Along the bottom, a timeline with live numbers. At the top, you can switch between the three-D twin, a two-D map and a side by side comparison, and change the language to Telugu.",
      short: "On the left are the scenario controls, in the centre the three-D twin, on the right the results, and along the bottom a timeline with live numbers.",
      callouts: [{ sel: Q.left, label: "Scenario controls and layers", n: 1, side: "right", atu: 0.1, pad: -6, ly: 300 }, { sel: Q.stage, label: "The 3D twin", n: 2, lx: 760, ly: 230, atu: 0.28, pad: -10 },
        { sel: Q.right, label: "Results: six tabs", n: 3, side: "left", atu: 0.42, pad: -6, ly: 300 }, { sel: Q.timeline, label: "Timeline and live numbers", n: 4, side: "top", atu: 0.58, pad: 0 },
        { sel: Q.views, label: "3D, 2D map, compare", n: 5, side: "bottom", atu: 0.74 }, { sel: Q.lang, label: "English / Telugu", n: 6, side: "bottom", atu: 0.88 }] },
    { id: "b12", say: "To move around, drag to rotate, scroll to zoom, and hold the right button to slide. The control pad does the same with buttons. The dial is a compass: it turns as you rotate, and one click returns you to north. Double-click the ground and the camera flies there, and the top-view and home buttons reset the view.",
      app: { path: [{ u: 0, ...OV2 }, { u: 0.18, th: 1.9, ph: 0.98, r: 1500, tg: [1000, 15, -820] }, { u: 0.34, th: 1.9, ph: 0.98, r: 900, tg: [1000, 15, -820] }, { u: 0.5, th: 2.4, ph: 0.62, r: 900, tg: [1000, 15, -820] }, { u: 0.64, th: 2.4, ph: 0.9, r: 480, tg: [1250, 8, -1100] }, { u: 0.8, ...TOP }, { u: 0.9, ...TOP }, { u: 1, ...OV }] },
      callouts: [{ sel: Q.navpad, label: "Zoom, rotate, tilt buttons", side: "left", atu: 0.2, pad: 6 }, { sel: Q.compass, label: "Compass: click to face north", side: "left", atu: 0.42, pad: 4, ly: 280 }, { sel: ".navpad .nav-grid .nav-btn@6", label: "Top view, north up", side: "left", atu: 0.78, pad: 5 }, { sel: ".navpad .nav-grid .nav-btn@7", label: "Home: reset the view", side: "left", atu: 0.9, pad: 5 }] },
    { id: "b14", say: "The two-D map shows the same area on a street map. Tilt it, and the buildings stand up in three dimensions.",
      prep: async (p) => { await p.evaluate(() => window.__prithvi.getState().setView("map")); await new Promise((r) => setTimeout(r, 4500)); },
      frame: async (p, u) => p.evaluate((u) => { const m = window.__map; if (m) m.jumpTo({ pitch: Math.min(60, u * 90), bearing: -30 * Math.min(1, u * 1.3), zoom: 15 + Math.min(1, u * 1.5) * 0.6 }); }, u),
      callouts: [{ sel: ".map-nav .navpad", label: "Same compass and pad in 2D", side: "left", atu: 0.3, pad: 5 }] },
  ]);

  // ================================================================ 5 setup
  add("setup", "Setting up a what-if", (p) => setup(p, { sc: { name: "Heavy", rainfallMm: 100, durationH: 6, blockageFrac: 0.25 }, cam: OV }), [
    { id: "b15", say: "A scenario is three numbers. First, how much rain falls in total, from ten to three hundred and fifty millimetres. Second, how long it lasts, from one to twenty four hours. Third, what share of the drains are blocked, from zero to one hundred percent.",
      short: "A scenario is three numbers: total rain, how long it lasts, and what share of the drains are blocked.",
      frame: async (p, u) => patch(p, { rainfallMm: Math.round((100 + 100 * Math.min(1, u * 1.2)) / 5) * 5, durationH: u > 0.45 ? Math.max(4, Math.round(6 - 2 * Math.min(1, (u - 0.45) * 3))) : 6, blockageFrac: u > 0.7 ? 0.25 + 0.25 * Math.min(1, (u - 0.7) * 4) : 0.25 }),
      callouts: [{ sel: Q.slRain, label: "Total rain: 10 to 350 mm", n: 1, side: "right", atu: 0.05 }, { sel: Q.slDur, label: "Duration: 1 to 24 hours", n: 2, side: "right", atu: 0.38 }, { sel: Q.slBlock, label: "Drains blocked: 0 to 100%", n: 3, side: "right", atu: 0.66 }] },
    { id: "b16", say: "Rain does not fall at a steady rate. The simulator uses a storm that builds, peaks exactly halfway through, then eases off the same way. For two hundred millimetres over four hours, the peak is one hundred millimetres an hour, reached after two hours. The area under the curve is the total rain.",
      diag: { name: "raincurve", params: { total: 200, dur: 4 } } },
    { id: "b17", say: "Four presets save time: light rain, heavy rain with a quarter of the drains blocked, very heavy rain, and an extreme burst of three hundred millimetres in four hours.",
      frame: async (p, u) => { const P = u < 0.2 ? [40, 6, 0] : u < 0.45 ? [100, 6, 0.25] : u < 0.7 ? [180, 6, 0.4] : [300, 4, 0.6]; await patch(p, { rainfallMm: P[0], durationH: P[1], blockageFrac: P[2], overrides: {} }); },
      callouts: [{ sel: Q.presets, label: "Four presets", side: "right", atu: 0.03, pad: 6 }, { sel: Q.slRain, atu: 0.1 }, { sel: Q.slDur, atu: 0.1 }, { sel: Q.slBlock, atu: 0.1 }] },
    { id: "b18", say: "Drain blockage needs a careful explanation. There is no real drain data, so the app places fifty six stand-in inlets along the roads. Setting fifty percent blocks twenty eight of them, always the same twenty eight, so a result can be repeated exactly. It is a test of sensitivity, not an inspection record.",
      short: "There is no real drain data, so blockage is a sensitivity test on fifty six stand-in inlets: fifty percent blocks twenty eight of them, always the same ones.",
      prep: async (p) => patch(p, { rainfallMm: 200, durationH: 4, blockageFrac: 0, overrides: {} }),
      app: { bigInlets: true, cam: { th: 0.1, ph: 0.55, r: 1500, tg: [800, 15, -830] }, layers: { trees: false, rain: false, water: false } },
      frame: async (p, u) => patch(p, { blockageFrac: Math.round((0.5 * Math.min(1, Math.max(0, (u - 0.35) * 2.2))) * 20) / 20 }),
      callouts: [{ sel: Q.slBlock, label: "Blocked inlets turn red", side: "right", atu: 0.3 }] },
    { id: "b19", say: "Switch on temporary pumps and six pumps are placed at the highest priority blocks. Press Run simulation to start, or Reset to return to the starting scenario.",
      app: { cam: { th: 0.3, ph: 0.8, r: 1700, tg: [900, 15, -820] }, layers: { trees: false, rain: false, water: false } },
      frame: async (p, u) => patch(p, { blockageFrac: 0.5, pumps: u > 0.25 && u < 0.92 }),
      callouts: [{ sel: Q.pumps, label: "Six temporary pumps (yellow)", side: "right", atu: 0.25 }, { sel: Q.run, label: "Run", side: "right", atu: 0.6 }, { sel: Q.reset, label: "Reset", side: "right", atu: 0.8 }] },
  ]);

  // ================================================================ 6 flood
  add("flood", "Watching the flood", (p) => setup(p, { sc: SC.A, cam: OV2 }), [
    { id: "b20", say: "We have set two hundred millimetres of rain over four hours, with half the drains blocked. The twin starts dry. The clock shows simulated time, and the speed menu lets you slow it down or speed it up.",
      short: "Two hundred millimetres of rain over four hours, with half the drains blocked. The twin starts dry.",
      app: { cam: { th: 0.7, ph: 0.98, r: 1450, tg: [1000, 15, -820] }, simAt: 0 },
      callouts: [{ sel: Q.clock, label: "Simulated clock", side: "right", atu: 0.35, pad: 6 }, { sel: Q.speed, label: "Speed menu", side: "top", atu: 0.62 }, { sel: Q.play, label: "Play / pause", side: "top", atu: 0.8 }] },
    { id: "b21", say: "Here is how the simulator works, in plain words. Rain lands on every square of a grid of twelve and a half metres. Roofs and roads shed about ninety percent of it. Open ground soaks up some, so about fifty five percent runs off.",
      diag: { name: "watercycle", range: [0, 0.34] } },
    { id: "b22", say: "The water then flows downhill from square to square, goes around buildings, and collects in low ground. It leaves through open drains, through pumps, and over the lowest edge of the map. The simulator keeps strict account of every cubic metre.",
      diag: { name: "watercycle", params: {}, range: [0.34, 1] } },
    { id: "b23", say: "Press play and watch. Water first appears in the low corners about twenty minutes in. After one hour, it covers six hectares. At the rain peak, two hours in, it is twenty three hectares, and it is widest a little after that, at twenty four. When the rain stops, the water drains away, and by seven hours the town is dry.",
      short: "Press play. Water appears in the low corners within half an hour, covers six hectares after one hour, and is widest a little after two hours, at twenty four hectares. After the rain, it drains away.",
      app: { path: [{ u: 0, th: 0.7, ph: 0.98, r: 1450, tg: [1000, 15, -820] }, { u: 1, th: 0.9, ph: 0.95, r: 1350, tg: [1050, 15, -850] }], simKeys: [[0, 0], [0.12, 400], [0.3, 1500], [0.5, 3600], [0.78, 5760], [1, 7200]] },
      callouts: [{ sel: Q.stat(0), label: "Flooded area, live", side: "top", atu: 0.5 }] },
    { id: "b24", say: "The colours tell the story. Blue is shallow water, and darker purple is deeper. A building turns amber when water of fifteen centimetres or more reaches it, and red at fifty centimetres. Roads turn amber from ten centimetres. The small tags mark the deepest spots.",
      prep: async (p, ctx) => { ctx.deepest = await p.evaluate(() => { const S = window.SIM, ds = window.__prithvi.getState().ds, last = S.simData.snaps[60].depth, nx = ds.grid.nx; let k = 0, m = 0; last.forEach((v, i) => { if (v > m) { m = v; k = i; } }); const x = ((k % nx) + 0.5) * ds.grid.cell_m, y = (Math.floor(k / nx) + 0.5) * ds.grid.cell_m;
        let red = null, amb = null; for (const b of ds.buildings) { const cx = b.ring.reduce((s, q) => s + q[0], 0) / b.ring.length, cy = b.ring.reduce((s, q) => s + q[1], 0) / b.ring.length, ci = Math.floor(cx / ds.grid.cell_m), cj = Math.floor(cy / ds.grid.cell_m); let d = 0; for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) d = Math.max(d, last[(cj + c) * nx + ci + a] / 1000); const dist = Math.hypot(cx - x, cy - y); if (dist < 500) { if (d >= 0.5 && (!red || dist < red.dist)) red = { cx, cy, dist }; if (d >= 0.15 && d < 0.5 && (!amb || dist < amb.dist)) amb = { cx, cy, dist }; } }
        return { x, y, red, amb }; }); },
      app: { cam: { th: 0.5, ph: 1.0, r: 560, tg: "deepest" }, simAt: 7200 },
      callouts: [{ sel: Q.legendDepth, label: "Water depth: 0 to 1.2 m and more", side: "top", atu: 0.12, pad: 6 }, { world: "deepest", label: "Deepest spot: depth tag in metres", side: "right", atu: 0.45, size: 120 }, { world: "red", label: "Red: 50 cm or more", side: "right", atu: 0.62, size: 110 }, { world: "amb", label: "Amber: 15 cm or more", side: "right", atu: 0.8, size: 110 }] },
    { id: "b25", say: "The strip along the bottom counts what is happening, live. Flooded area in hectares. The deepest water in metres. Buildings reached. Kilometres of road under water. Facilities reached. The rain rate now, the rain so far, and the water the drains have removed.",
      app: { cam: { th: 0.6, ph: 0.98, r: 1450, tg: [1000, 15, -820] }, simAt: 7200 },
      callouts: [["Flooded area", 0], ["Deepest water", 1], ["Buildings reached", 2], ["Road under water", 3], ["Facilities reached", 4], ["Rain rate now", 5], ["Rain so far", 6], ["Drained", 7]].map(([l, i]) => ({ sel: Q.stat(i), label: l, n: i + 1, side: "top", atu: 0.06 + i * 0.115, untilu: 0.06 + (i + 1) * 0.115, pad: 5 })) },
    { id: "b26", say: `The graph above it is the rain itself. You can pause, or drag to jump to any moment. After the rain stops at four hours, the water drains away. By seven hours, the flooded area has fallen to ${f1(A.timeline[7].ha)} hectares.`,
      app: { cam: { th: 0.6, ph: 0.98, r: 1450, tg: [1000, 15, -820] }, simKeys: [[0, 7200], [0.22, 7200], [0.38, 3600], [0.5, 3600], [0.78, 14400], [1, 25200]] },
      callouts: [{ sel: Q.scrub, label: "The rain itself. Drag to jump to any moment", side: "top", atu: 0.05, pad: 4 }] },
    { id: "b28", say: `Switch on peak depth, and the map shows the highest water level each spot ever reached, even after the water has gone. That is the full footprint of the event: ${f1(A.peakHa)} hectares in this scenario.`,
      app: { tab: "overview", scroll: 0, cam: { th: 0.1, ph: 0.55, r: 1900, tg: [920, 15, -830] }, simAt: END, layers: { peak: true, trees: false, rain: false } },
      kpi: { title: "FOOTPRINT OF THE EVENT", pos: "tr", rows: [{ label: "Water ≥ 15 cm at some point", to: A.peakHa, d: 1, unit: "ha", c: "#38bdf8" }, { label: "Deepest water", to: A.peakDepth, d: 2, unit: "m" }, { label: "Buildings reached", to: A.peakBuildings }, { label: "Facilities reached", to: A.peakFacilities }] },
      callouts: [{ sel: ".toggles .toggle@1", label: "Show peak depth", side: "right", atu: 0.1, pad: 6 }] },
  ]);

  // ================================================================ 7 drains
  add("drains", "Drains, blockage and pumps", (p) => setup(p, { sc: SC.A, simAt: 7200, cam: OV2 }), [
    { id: "b29", say: "Now we test the drains. Click any cyan inlet to block it, and it turns red. Click a red one, and it turns green, which means cleared by hand. The simulation restarts straight away.",
      short: "Click any drain inlet to block it, and the simulation restarts.",
      prep: async (p, ctx) => { ctx.inl = await p.evaluate(() => { const st = window.__prithvi.getState(), ds = st.ds, open = st.result.inletOpen, z = ds.zones.zones.find((q) => q.id === "zone_142"), sc = window.__scene;
        const near = (want) => ds.inlets.map((q, i) => ({ q, i, d: Math.hypot(q.x - z.cx, q.y - z.cy) })).filter((o) => open[o.i] === want).sort((a, b) => a.d - b.d)[0];
        const X = near(true), Y = ds.inlets.map((q, i) => ({ q, i, d: Math.hypot(q.x - X.q.x, q.y - X.q.y) })).filter((o) => !open[o.i]).sort((a, b) => a.d - b.d)[0];
        const w = (q) => [q.x, sc.gz(q.x, q.y) + 3, -q.y]; return { X: { id: X.q.id, w: w(X.q) }, Y: { id: Y.q.id, w: w(Y.q) }, mid: [(X.q.x + Y.q.x) / 2, 8, -(X.q.y + Y.q.y) / 2] }; }); },
      app: { bigInlets: true, cam: { th: 0.4, ph: 1.05, r: 380, tg: "inletmid" }, simAt: 7200, layers: { trees: false, rain: false } },
      frame: async (p, u, ctx) => { await p.evaluate((a) => { const st = window.__prithvi.getState(), R = window.RISK, ds = st.ds, sc = st.scenario;
          const flip = (id) => { const idx = ds.inlets.findIndex((i) => i.id === id), open = st.result.inletOpen[idx], ov = { ...sc.overrides }; delete ov[id]; const auto = R.resolveInletOpen(ds, { ...sc, overrides: ov })[idx]; const want = !open; if (want !== auto) ov[id] = want ? "cleared" : "blocked"; st.patchScenario({ overrides: ov }); };
          const ov = sc.overrides; if (a.u > 0.3 && !ov[a.X] && st.result.inletOpen[ds.inlets.findIndex((i) => i.id === a.X)]) flip(a.X);
          const s2 = window.__prithvi.getState(); if (a.u > 0.62 && !s2.scenario.overrides[a.Y]) flip(a.Y); }, { u, X: ctx.inl.X.id, Y: ctx.inl.Y.id }); },
      callouts: [{ world: "inletX", label: "Click: blocked (red)", side: "left", atu: 0.38, size: 100 }, { world: "inletY", label: "Click again: cleared by hand (green)", side: "right", atu: 0.7, size: 100 }] },
    { id: "b30a", say: `Here is the same storm three times. With every drain open, the flooded footprint is ${f1(S.A0.peakHa)} hectares, ${S.A0.flaggedZones} blocks are flagged as higher risk, and no mapped facility is in a flagged block.`,
      short: `The same storm, with every drain open, flags ${S.A0.flaggedZones} blocks and no facility.`,
      prep: async (p) => runScenario(p, SC.A0), app: { cam: { th: 0.1, ph: 0.55, r: 1900, tg: [920, 15, -830] }, simAt: END, layers: { peak: true, trees: false, rain: false } },
      kpi: { title: "EVERY DRAIN OPEN  ·  0% BLOCKED", pos: "tr", rows: [{ label: "Flooded footprint", to: S.A0.peakHa, d: 1, unit: "ha", c: "#38bdf8" }, { label: "Blocks flagged higher risk", to: S.A0.flaggedZones }, { label: "Road in flagged blocks", to: S.A0.flaggedRoadKm, d: 1, unit: "km" }, { label: "Facilities in flagged blocks", to: S.A0.flaggedFacilities.length }, { label: "Average risk score", to: S.A0.meanIndex, d: 1 }] } },
    { id: "b30b", say: `With half the drains blocked, the footprint is ${f1(A.peakHa)} hectares. ${A.flaggedZones} blocks are flagged, with ${f1(A.flaggedRoadKm)} kilometres of road and ${A.flaggedFacilities.length} facilities inside them.`,
      short: `With half the drains blocked, it flags ${A.flaggedZones} blocks, ${f1(A.flaggedRoadKm)} kilometres of road and ${A.flaggedFacilities.length} facilities.`,
      prep: async (p) => runScenario(p, SC.A), app: { cam: { th: 0.1, ph: 0.55, r: 1900, tg: [920, 15, -830] }, simAt: END, layers: { peak: true, trees: false, rain: false } },
      kpi: { title: "HALF THE DRAINS BLOCKED  ·  50%", pos: "tr", rows: [{ label: "Flooded footprint", from: S.A0.peakHa, to: A.peakHa, d: 1, unit: "ha", c: "#38bdf8" }, { label: "Blocks flagged higher risk", from: S.A0.flaggedZones, to: A.flaggedZones }, { label: "Road in flagged blocks", from: S.A0.flaggedRoadKm, to: A.flaggedRoadKm, d: 1, unit: "km" }, { label: "Facilities in flagged blocks", from: 0, to: A.flaggedFacilities.length }, { label: "Average risk score", from: S.A0.meanIndex, to: A.meanIndex, d: 1 }] } },
    { id: "b30c", say: `With every drain blocked, the footprint is ${f1(S.A100.peakHa)} hectares. ${S.A100.flaggedZones} blocks are flagged, and ${S.A100.flaggedFacilities.length} facilities.`,
      short: `With every drain blocked: ${S.A100.flaggedZones} blocks and ${S.A100.flaggedFacilities.length} facilities.`,
      prep: async (p) => runScenario(p, SC.A100), app: { cam: { th: 0.1, ph: 0.55, r: 1900, tg: [920, 15, -830] }, simAt: END, layers: { peak: true, trees: false, rain: false } },
      kpi: { title: "EVERY DRAIN BLOCKED  ·  100%", pos: "tr", rows: [{ label: "Flooded footprint", from: A.peakHa, to: S.A100.peakHa, d: 1, unit: "ha", c: "#38bdf8" }, { label: "Blocks flagged higher risk", from: A.flaggedZones, to: S.A100.flaggedZones }, { label: "Road in flagged blocks", from: A.flaggedRoadKm, to: S.A100.flaggedRoadKm, d: 1, unit: "km" }, { label: "Facilities in flagged blocks", from: A.flaggedFacilities.length, to: S.A100.flaggedFacilities.length }, { label: "Average risk score", from: A.meanIndex, to: S.A100.meanIndex, d: 1 }] } },
    { id: "b31", say: "Notice the pattern. In this model, blocking drains enlarges the flood only modestly, because most of the water leaves over the low edge of the map. But it changes the risk score and the exposure a great deal, because the score counts drainage capacity directly. We report this plainly: it is what the model says.",
      short: "Blockage enlarges the flood only modestly in this model, but it changes the risk score and exposure a great deal. We report that plainly.",
      app: { cam: { th: 0.1, ph: 0.55, r: 1900, tg: [920, 15, -830] }, simAt: END, layers: { peak: true, trees: false, rain: false } },
      kpi: { title: "0%  →  50%  →  100% BLOCKED", pos: "tr", rows: [{ label: "Flooded footprint (ha)", text: `${f1(S.A0.peakHa)} → ${f1(A.peakHa)} → ${f1(S.A100.peakHa)}`, c: "#38bdf8" }, { label: "Blocks flagged", text: `${S.A0.flaggedZones} → ${A.flaggedZones} → ${S.A100.flaggedZones}`, c: "#fb923c" }, { label: "Facilities flagged", text: `${S.A0.flaggedFacilities.length} → ${A.flaggedFacilities.length} → ${S.A100.flaggedFacilities.length}`, c: "#ef4444" }], note: "Small change in water. Large change in score and exposure." } },
    { id: "b32", say: `Pumps next. With six pumps switched on, the flooded footprint is unchanged: ${f1(S.Ap.peakHa)} hectares either way. But the score improves by one point, and the flagged blocks fall from ${A.flaggedZones} to ${S.Ap.flaggedZones}. In this prototype six small pumps are a modest help, and the numbers show it.`,
      prep: async (p) => runScenario(p, SC.Ap), app: { cam: { th: 0.3, ph: 0.8, r: 1700, tg: [920, 15, -830] }, simAt: END, layers: { peak: true, trees: false, rain: false, pumps: true } },
      kpi: { title: "SIX PUMPS SWITCHED ON", pos: "tr", rows: [{ label: "Flooded footprint", from: A.peakHa, to: S.Ap.peakHa, d: 1, unit: "ha", c: "#38bdf8" }, { label: "Blocks flagged higher risk", from: A.flaggedZones, to: S.Ap.flaggedZones }, { label: "Facilities flagged", from: A.flaggedFacilities.length, to: S.Ap.flaggedFacilities.length }, { label: "Average risk score", from: A.meanIndex, to: S.Ap.meanIndex, d: 1 }] },
      callouts: [{ sel: Q.pumps, label: "Pumps on", side: "right", atu: 0.1 }] },
  ]);

  // ================================================================ 8 risk
  const zp = { id: Z.id, idx: Z.idx, f: Z.factors, c: Z.contrib, baseCap: Z.baseCap, imperv: Z.imperv, drainPts: Z.contrib.drainage, baseDrainPts: Z.baseContrib.drainage };
  add("risk", "The risk score", (p) => setup(p, { sc: SC.A, simAt: 7200, cam: OV2 }), [
    { id: "b33", say: "Water depth is only part of the picture. Prithvi A I also gives every hundred metre block a risk score from zero to one hundred. It is an index: a way to rank blocks against each other under the chosen assumptions. It is not a chance of flooding, and it is not a depth.",
      short: "Prithvi A I also scores every hundred metre block from zero to one hundred. It is a ranking index, not a chance of flooding and not a depth.",
      card: { id: "idx", type: "compare", kick: "THE RISK SCORE", title: "A number from 0 to 100 for every 100 m block", left: { h: "It is", c: "#22c55e", m: "✓", items: ["A ranking of blocks under your assumptions", "A way to see what is driving risk", "Repeatable: same input, same score"] }, right: { h: "It is not", c: "#ef4444", m: "✕", items: ["A chance of flooding", "A water depth", "A forecast, warning or evacuation order"] } } },
    { id: "b34", say: "The score blends four ingredients. Terrain, thirty percent: is the block low, or lower than its neighbours? Rainfall, twenty five percent: how severe is the storm you chose? Drainage, twenty five percent: how much drain capacity is left nearby, and how much of the ground is paved? And exposure, twenty percent: how many buildings, roads and critical facilities are there?",
      short: "It blends terrain, rainfall, drainage and exposure, with weights of thirty, twenty five, twenty five and twenty percent.",
      diag: { name: "formula", params: zp, range: [0, 0.5] } },
    { id: "b35", say: `Take the block with the highest score in this scenario, block one four two. Terrain gives it ${f1(Z.contrib.terrain)} points, rainfall ${f1(Z.contrib.rainfall)}, drainage ${f1(Z.contrib.drainage)}, and exposure ${f1(Z.contrib.exposure)}. Together, ${Math.round(Z.idx)}: the highest relative index in this scenario. The weights are our own design choices, written down, and they can be changed.`,
      short: `For block one four two: terrain ${f1(Z.contrib.terrain)} points, rainfall ${f1(Z.contrib.rainfall)}, drainage ${f1(Z.contrib.drainage)}, exposure ${f1(Z.contrib.exposure)}, together ${Math.round(Z.idx)}.`,
      diag: { name: "formula", params: zp, range: [0.5, 1] } },
    { id: "b36a", say: "Switch on the risk heat-map and the ground is coloured by score: teal is lower, yellow moderate, orange higher, and red highest.",
      short: "Switch on the heat-map: teal is lower, yellow moderate, orange higher and red highest.",
      app: { cam: { th: 0.1, ph: 0.62, r: 1850, tg: [920, 15, -830] }, layers: { risk: "index", trees: false, rain: false, water: false } },
      kpi: { title: "BLOCKS BY BAND  ·  THIS SCENARIO", pos: "tr", rows: [{ label: "Lower", to: A.bands.lower, c: "#2dd4bf" }, { label: "Moderate", to: A.bands.moderate, c: "#facc15" }, { label: "Higher", to: A.bands.higher, c: "#fb923c" }, { label: "Highest", to: A.bands.highest, c: "#ef4444" }], note: "272 blocks in total" },
      callouts: [{ sel: Q.heat, label: "Heat-map: off / risk score / change", side: "right", atu: 0.15, pad: 5 }] },
    { id: "b36b", say: `The bands are: below thirty five is lower, thirty five to forty eight is moderate, forty eight to sixty is higher, and sixty and above is highest. In the baseline, the average is ${f1(A.baseMean)}. In this scenario, it is ${f1(A.meanIndex)}.`,
      diag: { name: "bands", params: { base: A.baseMean, scn: A.meanIndex, zone: Z.idx, zid: "142" } } },
    { id: "b37", say: "Click any block to see exactly why. The panel shows the score, how far it moved from the baseline, and each ingredient's points, with a marker for the baseline value. The four parts add up to the score exactly.",
      app: { tab: "zone", select: Z.id, cam: { th: 0.5, ph: 1.0, r: 520, tg: "zone" }, layers: { risk: "index", trees: false, rain: false } },
      callouts: [{ sel: ".tab-body .big-row@0", label: "Score, and change from the baseline", side: "left", atu: 0.15, pad: 6 }, { sel: ".tab-body .factor@0", label: "Each ingredient: its value and points", side: "left", atu: 0.45, pad: 6 }, { sel: ".tab-body .muted.small@0", label: "They add up to the score exactly", side: "left", atu: 0.8, pad: 4 }] },
    { id: "b38", say: `Drainage is why this block jumped. Normally, two drains serve it, giving ${Z.baseCap} percent of the typical capacity. In this scenario, both are blocked, so capacity falls to zero, and the drainage points rise from ${f1(Z.baseContrib.drainage)} to ${f1(Z.contrib.drainage)}.`,
      diag: { name: "capacity", params: zp } },
    { id: "b39", say: "Below the score, the panel explains it in plain sentences, generated from the numbers. Switch to Telugu and the same explanation appears in Telugu. That translation is a first draft, and a Telugu speaker should review it before wider use.",
      app: { tab: "zone", select: Z.id, scroll: 500, cam: { th: 0.5, ph: 1.0, r: 520, tg: "zone" }, layers: { risk: "index", trees: false, rain: false }, langAt: [0.45, 0.9] },
      callouts: [{ sel: ".tab-body .why@0", label: "Plain-language reasons", side: "left", atu: 0.05, pad: 6 }, { sel: Q.lang, label: "English / Telugu", side: "bottom", atu: 0.4 }] },
  ]);

  // ================================================================ 9 compare
  add("compare", "Comparing and prioritising", (p) => setup(p, { sc: SC.A, simAt: 7200, cam: OV2 }), [
    { id: "b40", say: `The Overview tab summarises the scenario. The mean score is ${f1(A.meanIndex)}, up ${f1(A.meanIndex - A.baseMean)} from the baseline, which is thirty millimetres over six hours with every drain open. ${A.zonesMovedUp} blocks moved up at least one band. The two bars show the bands before and after.`,
      short: `The Overview shows the mean score up ${f1(A.meanIndex - A.baseMean)} from the baseline, with ${A.zonesMovedUp} blocks moving up a band.`,
      app: { tab: "overview", scroll: 0 },
      callouts: [{ sel: ".tab-body .big-row@0", label: "Average score, change, blocks moved up", side: "left", atu: 0.1, pad: 6 }, { sel: ".tab-body .bandbar@0", label: "Baseline", side: "left", atu: 0.55, pad: 4 }, { sel: ".tab-body .bandbar@1", label: "This scenario", side: "left", atu: 0.7, pad: 4 }] },
    { id: "b41", say: `Below that, the exposure overlay lists what sits inside the higher risk blocks: ${A.flaggedZones} blocks, ${f1(A.flaggedRoadKm)} kilometres of road, and ${A.flaggedFacilities.length} facilities, including five hospitals or clinics and the fire station. This says what is inside the block. It does not say that it is flooded.`,
      app: { tab: "overview", scroll: 0, scrollTo: 1 },
      callouts: [{ sel: Q.card(1), label: "What sits inside higher risk blocks", side: "left", atu: 0.1, pad: 6 }] },
    { id: "b42", say: "The Compare view puts the baseline, the scenario and the change side by side. Teal shows scores that fell and red shows scores that rose, and the table lists the counts. Click a block in any panel and it is selected everywhere.",
      app: { view: "compare" },
      callouts: [{ sel: ".cmp-panel@0", label: "Baseline", side: "bottom", atu: 0.1, pad: 4 }, { sel: ".cmp-panel@1", label: "Scenario", side: "bottom", atu: 0.3, pad: 4 }, { sel: ".cmp-panel@2", label: "Change: red up, teal down", side: "bottom", atu: 0.5, pad: 4 }, { sel: ".cmp-table", label: "Counts side by side", side: "right", atu: 0.75, pad: 4 }] },
    { id: "b43", say: "The scenario library is a grid of sixteen storms: four rainfall levels across four levels of blockage. Each square shows the mean score and the number of higher risk blocks. Click one to run it.",
      app: { view: "3d", tab: "overview", scrollTo: 3 },
      callouts: [{ sel: Q.card(3), label: "16 storms, one click each", side: "left", atu: 0.1, pad: 6 }] },
    { id: "b44", say: "The Priority tab ranks twelve blocks to inspect first. It multiplies each score by how exposed the block is, and adds a bonus for mapped hospitals or emergency services. Each line names the main driver, such as terrain or drainage. It is a planning aid for where to look first. It is not an evacuation order.",
      short: "The Priority tab ranks the blocks to inspect first, with the main driver for each. It is a planning aid, not an evacuation order.",
      app: { tab: "priority", scroll: 0 },
      callouts: [{ sel: ".prio li@0", label: "Inspect first, and why", side: "left", atu: 0.2, pad: 4 }, { sel: ".prio li@1", atu: 0.35, pad: 4 }, { sel: ".prio li@2", atu: 0.5, pad: 4 }] },
    { id: "b45", say: "Everything can be exported as C S V or J S O N, with the scenario settings and the disclaimer included, for reports or further analysis.",
      app: { tab: "overview", scroll: 99999 },
      callouts: [{ sel: ".tab-body .stack > .row", label: "Export for reports", side: "left", atu: 0.2, pad: 6 }] },
  ]);

  // ================================================================ 10 routes
  add("routes", "Roads and hospitals", (p) => setup(p, { sc: SC.A, simAt: END, cam: OV, tab: "routes", route: { routeFrom: "n7790467455", routeTo: "w1193917413", routeThreshold: 0.25 } }), [
    { id: "b46", say: "The Routes tab asks: can this hospital still reach that place by road? It builds a road network from the map, finds the shortest path when the roads are dry, then removes every road segment where the simulated water is deeper than a limit you choose, and searches again.",
      app: { tab: "routes", cam: { th: 0.35, ph: 0.9, r: 1700, tg: [920, 15, -830] } },
      callouts: [{ sel: ".tab-body .field@0", label: "From a facility", side: "left", atu: 0.3, pad: 4 }, { sel: ".tab-body .field@1", label: "To a facility", side: "left", atu: 0.5, pad: 4 }, { sel: ".tab-body label.slider", label: "Roads deeper than this are unusable", side: "left", atu: 0.72, pad: 4 }] },
    { id: "b47", say: `With a limit of twenty five centimetres, the path from Mahaveer Hospital to a place of worship, two point four kilometres away, is unaffected. Lower the limit to ten centimetres, and ${Math.round(M.route.blockedKm["0.1"])} kilometres of road drop out of the network, and the route is cut.`,
      short: `At twenty five centimetres the path from Mahaveer Hospital is unaffected. At ten centimetres, ${Math.round(M.route.blockedKm["0.1"])} kilometres of road drop out and the route is cut.`,
      app: { tab: "routes", cam: { th: 0.35, ph: 0.9, r: 1700, tg: [920, 15, -830] } },
      frame: async (p, u) => p.evaluate((thr) => window.__prithvi.getState().setRoute({ routeThreshold: thr }), u < 0.45 ? 0.25 : Math.max(0.1, Math.round((0.25 - 0.15 * Math.min(1, (u - 0.45) / 0.3)) * 20) / 20)),
      callouts: [{ sel: ".tab-body .verdict", label: "The verdict updates as the limit changes", side: "left", atu: 0.2, pad: 4 }, { sel: ".tab-body label.slider", atu: 0.1, pad: 4 }] },
    { id: "b48", say: "This is a what-if on the road network, not a safe route. Kerbs, bridges and real drainage are not modelled in that detail, so it must never be used for navigation or dispatch.",
      app: { tab: "routes", cam: { th: 0.35, ph: 0.9, r: 1700, tg: [920, 15, -830] } },
      callouts: [{ sel: ".tab-body .fineprint@0", label: "Not a safe route. Never for navigation or dispatch", side: "left", atu: 0.15, pad: 6 }] },
  ]);

  // ================================================================ 11 assistant
  add("assistant", "The assistant", (p) => setup(p, { sc: SC.A, simAt: 7200, cam: OV2, tab: "assistant" }), [
    { id: "b49", say: "The assistant answers questions about the method, the data and general flood preparedness. It quotes only from eight short documents loaded into the system, and shows which document each sentence came from.",
      prep: async (p) => { await p.evaluate(() => { [...document.querySelectorAll(".chips .chip")].find((b) => b.textContent.includes("drainage blockage"))?.click(); }); await new Promise((r) => setTimeout(r, 2500)); },
      app: { tab: "assistant" },
      callouts: [{ sel: ".chat@0", label: "An answer, quoted from a document", side: "left", atu: 0.2, pad: 6 }, { sel: ".chat .cites@0", label: "The source", side: "left", atu: 0.6, pad: 4 }] },
    { id: "b50", say: "If the documents do not cover a question, it says so instead of guessing. Ask something unrelated, and it declines and points you to official sources: the India Meteorological Department, the National Disaster Management Authority, and your district administration.",
      prep: async (p) => { await p.evaluate(async () => { const el = document.querySelector(".ask input"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "Who will win the cricket world cup?"); el.dispatchEvent(new Event("input", { bubbles: true })); await new Promise((r) => setTimeout(r, 200)); document.querySelector(".ask button").click(); }); await new Promise((r) => setTimeout(r, 2500)); await p.evaluate(() => { document.querySelector(".tab-body").scrollTop = 99999; }); },
      app: { tab: "assistant", keepScroll: true },
      callouts: [{ sel: ".chat@1", label: "No supporting document: it declines", side: "left", atu: 0.3, pad: 6 }] },
  ]);

  // ================================================================ 12 trust
  add("trust", "How far to trust it", (p) => setup(p, { sc: SC.A, simAt: 7200, cam: OV2 }), [
    { id: "b51", say: "Now, how far can you trust it? We want to be exact. This is a what-if tool, not a forecast. The rainfall is a number you choose. The drains are stand-ins. The terrain is coarse. And the water model has not yet been checked against a real flood, so we make no claim of accuracy.",
      short: "How far can you trust it? This is a what-if tool, not a forecast. Rainfall is a number you choose, the drains are stand-ins, the terrain is coarse, and the water model has not been checked against a real flood, so we claim no accuracy.",
      card: { id: "tr", type: "compare", kick: "BEING EXACT", title: "What this prototype is, and is not", left: { h: "It is", c: "#22c55e", m: "✓", items: ["A what-if tool for comparing scenarios", "A planning aid, with every number explained", "Honest about what is assumed"] }, right: { h: "It is not", c: "#ef4444", m: "✕", items: ["A forecast: rainfall is a number you choose", "A measured depth: drains are stand-ins, terrain is coarse", "Checked against a real flood: no accuracy is claimed"] } } },
    { id: "b52", say: "What we test automatically: the same input always gives the same result. More rain, or more blocked drains, never lowers a score. The water model conserves every cubic metre. And the browser and server versions of the score agree exactly. Thirty four tests check these.",
      card: { id: "ck", type: "list", kick: "WHAT IS CHECKED AUTOMATICALLY", title: "34 automated tests", items: [{ ic: "✓", c: "#22c55e", h: "Repeatable", p: "The same input always gives the same result" }, { ic: "✓", c: "#22c55e", h: "Sensible", p: "More rain, or more blocked drains, never lowers the score" },
        { ic: "✓", c: "#22c55e", h: "Water is conserved", p: "Rain = standing + drained + left the map" }, { ic: "✓", c: "#22c55e", h: "Two engines agree", p: "Browser and server scores match exactly" }] } },
    { id: "b53", say: "The next step is calibration: take a documented past flood in this area, hold it back, and compare the simulated flooded area with what really happened. Add surveyed drains and real rainfall. Until then, use Prithvi A I to compare scenarios, plan drills, prioritise inspections and explain decisions. Do not use it to issue alerts.",
      short: "Next is calibration against a real past flood, with surveyed drains and real rainfall. Until then, use it to compare scenarios, plan drills and prioritise inspections, not to issue alerts.",
      card: { id: "nx", type: "list", kick: "WHAT COMES NEXT", title: "From prototype to operational tool", items: [{ ic: "1", h: "Calibrate", p: "Compare simulated flooding with a documented past flood" }, { ic: "2", h: "Add real inputs", p: "Surveyed drains and measured rainfall" }, { ic: "3", h: "Until then", p: "Compare scenarios, plan drills, prioritise inspections. Do not issue alerts." }] } },
  ]);

  // ================================================================ 13 users
  add("users", "Who can use it", (p) => setup(p, { sc: SC.A, simAt: 7200, cam: OV2 }), [
    { id: "b54", say: "For district disaster management teams: rehearse a storm before the season, and brief response teams on which blocks and roads need attention. For district heads: one screen that shows what is exposed and why, to support a decision. For municipal officers: which drains to inspect and clear first. For infrastructure engineers: how sensitive the area is to drainage assumptions, with every number traceable.",
      card: { id: "us", type: "tiles", cols: 2, kick: "WHO CAN USE IT", title: "Built for the people who plan", tiles: [
        { h: "District disaster management", c: "#38bdf8", p: ["Rehearse a storm before the season", "Brief response teams on blocks and roads"] }, { h: "District heads", c: "#fbbf24", p: ["One screen: what is exposed, and why", "Evidence to support a decision"] },
        { h: "Municipal officers", c: "#2dd4bf", p: ["Which drains to inspect and clear first", "Priority list with the main driver"] }, { h: "Infrastructure engineers", c: "#a78bfa", p: ["Sensitivity to drainage assumptions", "Every number traceable to its source"] }] } },
    { id: "b55", say: "It runs in an ordinary web browser, with no special hardware. The code and data are open and documented: a React and three J S front end, a Python Fast A P I back end, and a data pipeline that can be pointed at another neighbourhood.",
      diag: { name: "architecture" } },
  ]);

  // ================================================================ close
  add("close", null, (p) => setup(p, { sc: SC.A }), [
    { id: "b56", say: "Prithvi A I. See the water. Test the what-ifs. Understand the why. Thank you.", short: "Prithvi A I. See the water. Test the what-ifs. Understand the why. Thank you.",
      card: { id: "end", type: "title", kick: "THANK YOU", title: "PRITHVI AI", sub: "See the water. Test the what-ifs. Understand the why.", foot: "An experimental planning tool. Scenarios are indicative, not forecasts." } },
  ]);

  { const fsc = scenes.find((x) => x.id === "film"); fsc.beats.forEach((b) => { if (TE[b.id] !== undefined) b.te = TE[b.id].say; }); }

  // ---- short-cut selection (under 5 minutes)
  const SHORT_KEEP = new Set(["f1", "f2", "f4", "f6", "f7", "f8", "f10", "f11", "f12", "b1", "b6", "b11", "b15", "b20", "b23", "b29", "b30a", "b30b", "b30c", "b31", "b33", "b35", "b36a", "b40", "b44", "b47", "b51", "b53", "b56"]);
  scenes.forEach((sc) => sc.beats.forEach((b) => { if (!SHORT_KEEP.has(b.id)) delete b.short; }));

  // ---- number the parts
  let n = 0; const total = scenes.filter((s) => s.title).length;
  scenes.forEach((s) => { if (s.title) { n++; s.part = { kick: `PART ${n} OF ${total}`, title: s.title }; } else s.part = null; });
  return scenes;
}
