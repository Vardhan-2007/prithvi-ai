// Injected into the PRITHVI AI page while recording. Renders captions, callouts, KPI panels, cards, diagrams and the
// cinematic film layer deterministically from a state object (no wall-clock animation), so every frame is reproducible.
(() => {
  const BAND = 136, SW = 1920, SH = 1080 - BAND;
  const C = { ink: "#e6edf8", mute: "#8fa0be", blue: "#3b82f6", cyan: "#38bdf8", teal: "#2dd4bf", amber: "#fbbf24", orange: "#fb923c", red: "#ef4444", green: "#22c55e", purple: "#a78bfa" };
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const seg = (u, a, b) => clamp((u - a) / (b - a));
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const eo = (x) => 1 - Math.pow(1 - x, 3);
  const f1 = (v, d = 1) => Number(v).toFixed(d);

  const style = document.createElement("style");
  style.textContent = `
  body{overflow:hidden}
  #root{height:calc(100vh - ${BAND}px)!important}
  #vo{position:fixed;inset:0;z-index:2147483000;pointer-events:none;font-family:-apple-system,"SF Pro Display","Helvetica Neue",Arial,"Noto Sans Telugu",sans-serif;color:${C.ink}}
  .vo-stage{position:absolute;left:0;top:0;width:${SW}px;height:${SH}px;overflow:hidden}
  .vo-band{position:absolute;left:0;right:0;bottom:0;height:${BAND}px;background:linear-gradient(#0b1224,#060a13);border-top:2px solid #1d2a45;display:flex;align-items:center;gap:34px;padding:0 44px}
  .vo-part{flex:none;width:300px}
  .vo-part small{display:block;font-size:17px;letter-spacing:.16em;color:${C.cyan};font-weight:700}
  .vo-part b{display:block;font-size:25px;line-height:1.2;margin-top:6px;font-weight:650}
  .vo-cap{flex:1;font-size:31px;line-height:1.27;font-weight:500;color:#fff;min-height:118px;display:flex;align-items:center}
  .vo-card{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:56px 120px;background:radial-gradient(ellipse at 25% 15%,#13294f 0%,#08101f 55%,#05080f 100%)}
  .vo-card h1{font-size:132px;line-height:1.02;margin:0;font-weight:800;letter-spacing:-.02em;background:linear-gradient(90deg,#fff,#7dd3fc 60%,#3b82f6);-webkit-background-clip:text;color:transparent}
  .vo-card h2{font-size:64px;margin:0 0 10px;font-weight:750;letter-spacing:-.01em}
  .vo-card .sub{font-size:46px;color:#bcd0f0;margin-top:18px;font-weight:450}
  .vo-card .kick{font-size:24px;letter-spacing:.2em;color:${C.cyan};font-weight:700;margin-bottom:14px}
  .vo-card .foot{font-size:28px;color:${C.mute};margin-top:44px}
  .vo-item{display:flex;gap:30px;align-items:flex-start;margin:20px 0}
  .vo-item .ic{flex:none;width:78px;height:78px;border-radius:20px;display:grid;place-items:center;font-size:40px;font-weight:800;background:#102244;border:2px solid #2a4a86;color:${C.cyan}}
  .vo-item h3{margin:0;font-size:44px;font-weight:700}
  .vo-item p{margin:6px 0 0;font-size:31px;line-height:1.3;color:#bcd0f0}
  .vo-cols{display:grid;grid-template-columns:1fr 1fr;gap:56px;margin-top:20px}
  .vo-col{border-radius:28px;padding:40px 46px;background:#0d1a33;border:2px solid #1f3a6e}
  .vo-col h3{margin:0 0 20px;font-size:46px;font-weight:800}
  .vo-col li{list-style:none;font-size:35px;line-height:1.28;margin:14px 0;padding-left:56px;position:relative}
  .vo-grid{display:grid;gap:34px;margin-top:20px}
  .vo-tile{border-radius:26px;padding:34px 38px;background:#0d1a33;border:2px solid #1f3a6e}
  .vo-tile h3{margin:0 0 12px;font-size:40px;font-weight:750}
  .vo-tile p{margin:8px 0;font-size:29px;line-height:1.3;color:#bcd0f0}
  .vo-tile .tag{display:inline-block;font-size:22px;letter-spacing:.14em;font-weight:800;padding:5px 14px;border-radius:999px;margin-bottom:12px}
  .vo-diag{position:absolute;inset:0;background:radial-gradient(ellipse at 30% 10%,#10234a 0%,#070d1c 60%,#050810 100%)}
  .vo-diag svg{width:100%;height:100%;display:block}
  .vo-kpi{position:absolute;width:560px;border-radius:24px;background:#08101ff2;border:2px solid #2a4a86;box-shadow:0 18px 60px #000a;padding:22px 28px}
  .vo-kpi h4{margin:0 0 12px;font-size:21px;letter-spacing:.14em;color:${C.cyan};font-weight:800}
  .vo-kpi .r{display:flex;justify-content:space-between;align-items:baseline;gap:18px;padding:9px 0;border-top:1px solid #1d2f57;font-size:26px}
  .vo-kpi .r span{color:#bcd0f0}
  .vo-kpi .r b{font-size:38px;font-weight:800;font-variant-numeric:tabular-nums}
  .vo-kpi .r b small{font-size:21px;font-weight:600;color:${C.mute};margin-left:6px}
  .vo-kpi .n{margin-top:10px;font-size:22px;color:${C.mute};line-height:1.3}
  .vo-call{position:absolute;border:4px solid ${C.amber};border-radius:14px;box-shadow:0 0 0 3px #0008,0 0 26px ${C.amber}aa}
  .vo-lab{position:absolute;max-width:520px;background:#0b1224;border:3px solid ${C.amber};color:#fff;border-radius:14px;padding:9px 18px;font-size:28px;font-weight:650;line-height:1.22;box-shadow:0 10px 30px #000a}
  .vo-lab i{display:inline-grid;place-items:center;width:38px;height:38px;border-radius:50%;background:${C.amber};color:#111;font-style:normal;font-weight:800;margin-right:12px;font-size:24px}
  body.tel #vo *{letter-spacing:normal!important}
  body.tel .vo-film-card{font-family:'Telugu MN','Noto Sans Telugu','Helvetica Neue',sans-serif}
  body.film .header,body.film aside.panel,body.film footer.timeline,body.film .disclaimer,body.film .hud,body.film .legend,body.film .tooltip,body.film .depth-pin{display:none!important}
  body.film .app{display:block!important;position:relative;height:100%}
  body.film .main,body.film .center{display:block!important;height:100%}
  body.film .stage{position:absolute!important;inset:0!important}
  .vo-film-card{position:absolute;inset:0;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font-family:"Iowan Old Style","Palatino","Georgia",serif}
  .vo-film-card .big{font-size:150px;font-weight:400;letter-spacing:.08em;color:#f3efe6}
  .vo-film-card .small{font-size:30px;letter-spacing:.42em;color:#9fb4de;margin-top:26px;font-family:-apple-system,Helvetica,Arial,sans-serif;font-weight:500}
  `;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.id = "vo";
  root.innerHTML = `<div class="vo-stage"><div id="vo-dim"></div><div id="vo-film"></div><div id="vo-card"></div><div id="vo-diag"></div><div id="vo-kpi"></div><div id="vo-call"></div></div>
    <div class="vo-band"><div class="vo-part" id="vo-part"></div><div class="vo-cap" id="vo-cap"></div></div>`;
  const tintEl = document.createElement("div"); tintEl.id = "vo-tint"; tintEl.style.cssText = "display:none"; document.body.appendChild(tintEl);
  document.body.appendChild(root);
  const $ = (id) => document.getElementById(id);

  // ------------------------------------------------------------------ SVG helpers
  const T = (x, y, txt, o = {}) => `<text x="${x}" y="${y}" font-size="${o.s || 30}" fill="${o.f || C.ink}" font-weight="${o.w || 500}" text-anchor="${o.a || "start"}" opacity="${o.o ?? 1}">${txt}</text>`;
  const R = (x, y, w, h, o = {}) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.r ?? 14}" fill="${o.f || "none"}" stroke="${o.s || "none"}" stroke-width="${o.sw || 0}" opacity="${o.o ?? 1}"/>`;
  const L = (x1, y1, x2, y2, o = {}) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${o.s || C.mute}" stroke-width="${o.w || 3}" ${o.d ? `stroke-dasharray="${o.d}"` : ""} opacity="${o.o ?? 1}" ${o.m ? `marker-end="url(#${o.m === "g" ? "ahg" : "ah"})"` : ""}/>`;
  const svg = (inner) => `<svg viewBox="0 0 ${SW} ${SH}" xmlns="http://www.w3.org/2000/svg"><defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${C.mute}"/></marker><marker id="ahg" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${C.green}"/></marker></defs>${inner}</svg>`;
  const heading = (t, sub) => T(110, 92, t, { s: 52, w: 800 }) + (sub ? T(110, 140, sub, { s: 29, f: C.mute }) : "");

  // ------------------------------------------------------------------ diagrams
  const D = {};

  D.concept = (u) => {
    const boxes = [
      { x: 110, t: "REAL DATA", s: ["Buildings, roads, hospitals", "Ground height", "Drain stand-ins"], c: C.teal },
      { x: 560, t: "FLOOD SIMULATOR", s: ["Rain falls on the map", "Water flows downhill", "Pools, drains, leaves"], c: C.cyan },
      { x: 1010, t: "RISK SCORE", s: ["Every 100 m block", "0 to 100, explained", "Compare with a baseline"], c: C.amber },
      { x: 1460, t: "PLANNING TOOLS", s: ["Priority list", "Road routes", "Exports, assistant"], c: C.green },
    ];
    let o = heading("How the pieces fit together", "One virtual copy of the neighbourhood, four working parts");
    boxes.forEach((b, i) => {
      const a = eo(seg(u, 0.08 + i * 0.2, 0.28 + i * 0.2));
      o += `<g opacity="${a}" transform="translate(0 ${(1 - a) * 30})">` + R(b.x, 250, 350, 430, { f: "#0d1a33", s: b.c, sw: 4, r: 28 }) +
        R(b.x, 250, 350, 86, { f: b.c, r: 28 }) + R(b.x, 300, 350, 36, { f: b.c, r: 0 }) + T(b.x + 175, 306, b.t, { s: 30, w: 800, a: "middle", f: "#06101f" }) +
        b.s.map((s, k) => T(b.x + 175, 410 + k * 76, s, { s: 29, a: "middle", f: "#dbe7ff" })).join("") + `</g>`;
      if (i < 3) o += L(b.x + 360, 465, b.x + 440, 465, { s: C.mute, w: 6, m: 1, o: a });
    });
    o += T(960, 790, "Every part is shown on screen, and every number can be traced back to its source.", { s: 34, a: "middle", f: "#bcd0f0", o: eo(seg(u, 0.8, 1)) });
    return svg(o);
  };

  D.raincurve = (u, p) => {
    const { total, dur } = p, peak = (2 * total) / dur, X0 = 260, X1 = 1700, Y0 = 760, YT = 250, ymax = peak * 1.18;
    const rate = (f) => (f < 0.4 ? peak * (f / 0.4) : peak * (1 - (f - 0.4) / 0.6));
    const px = (f) => X0 + f * (X1 - X0), py = (v) => Y0 - (v / ymax) * (Y0 - YT);
    const r = ease(seg(u, 0.04, 0.62));
    const pts = [];
    for (let i = 0; i <= 120; i++) { const f = (i / 120) * r; pts.push(`${f1(px(f), 1)},${f1(py(rate(f)), 1)}`); }
    const area = `M${px(0)},${Y0} L${pts.join(" L")} L${px(r)},${Y0} Z`;
    let o = heading("How the storm is shaped", "Rain builds up, peaks 40% of the way through, then eases off");
    o += L(X0, Y0, X1 + 20, Y0, { s: "#4a5d85", w: 3 }) + L(X0, Y0, X0, YT - 20, { s: "#4a5d85", w: 3 });
    for (let h = 0; h <= dur; h += dur > 8 ? 2 : 1) o += L(px(h / dur), Y0, px(h / dur), Y0 + 12, { s: "#4a5d85" }) + T(px(h / dur), Y0 + 46, `${h} h`, { s: 25, a: "middle", f: C.mute });
    for (const v of [0, peak / 2, peak]) o += T(X0 - 18, py(v) + 9, `${f1(v, 0)}`, { s: 25, a: "end", f: C.mute }) + (v ? L(X0, py(v), X1, py(v), { s: "#1c2a4a", w: 2, d: "6 8" }) : "");
    o += T(X0 - 18, YT - 36, "mm per hour", { s: 25, a: "end", f: C.cyan, w: 650 });
    o += `<path d="${area}" fill="${C.cyan}" opacity=".30"/><polyline points="${pts.join(" ")}" fill="none" stroke="${C.cyan}" stroke-width="7" stroke-linejoin="round"/>`;
    const a1 = eo(seg(u, 0.5, 0.66));
    o += `<g opacity="${a1}"><circle cx="${px(0.4)}" cy="${py(peak)}" r="13" fill="${C.amber}"/>${L(px(0.4), py(peak) + 16, px(0.4), Y0, { s: C.amber, w: 3, d: "8 8" })}` +
      R(px(0.4) + 34, py(peak) - 78, 560, 100, { f: "#0b1224", s: C.amber, sw: 3 }) + T(px(0.4) + 56, py(peak) - 32, `Peak: ${f1(peak, 0)} mm/h`, { s: 38, w: 800, f: C.amber }) +
      T(px(0.4) + 56, py(peak) + 8, `after ${Math.floor(dur * 0.4)} h ${Math.round((dur * 0.4 % 1) * 60)} min`, { s: 29, f: "#dbe7ff" }) + `</g>`;
    const a2 = eo(seg(u, 0.66, 0.82));
    o += T(px(0.7), py(peak * 0.27) - 20, `The area under the curve`, { s: 33, w: 750, a: "middle", o: a2 }) + T(px(0.7), py(peak * 0.27) + 22, `= the total rain: ${total} mm`, { s: 33, w: 750, a: "middle", f: "#fff", o: a2 });
    const a3 = eo(seg(u, 0.82, 0.98));
    o += `<g opacity="${a3}">` + R(260, 828, 1440, 76, { f: "#0b1224", s: "#2a4a86", sw: 3 }) + T(980, 878, `Peak rate = 2 × total ÷ duration = 2 × ${total} ÷ ${dur} = ${f1(peak, 0)} mm/h`, { s: 36, a: "middle", w: 650 }) + `</g>`;
    return svg(o);
  };

  D.watercycle = (u) => {
    const gp = [[0, 470], [330, 520], [640, 640], [940, 735], [1230, 690], [1480, 620], [1660, 612], [1790, 700], [1920, 780]];
    const gy = (x) => { for (let i = 0; i < gp.length - 1; i++) if (x <= gp[i + 1][0]) { const [a, b] = [gp[i], gp[i + 1]]; return a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]); } return gp[gp.length - 1][1]; };
    const lvl = 742 - 112 * ease(seg(u, 0.36, 0.72));
    const ground = `M0,${SH} L` + gp.map((q) => q.join(",")).join(" L") + ` L${SW},${SH} Z`;
    const air = `M0,0 L${SW},0 L${SW},${gp[gp.length - 1][1]} L` + gp.slice().reverse().map((q) => q.join(",")).join(" L") + ` Z`;
    let o = heading("How the flood simulator works", "A grid of 12.5 m squares, stepped forward two seconds at a time");
    o += `<defs><clipPath id="airc"><path d="${air}"/></clipPath></defs>`;
    const ra = seg(u, 0.02, 0.1) * (1 - seg(u, 0.72, 0.8) * 0.8);
    for (let i = 0; i < 46; i++) { const x = 60 + ((i * 97) % 1800), y0 = ((u * 4000 + i * 61) % 360) + 170; o += L(x, y0, x - 6, y0 + 28, { s: "#9cc9ff", w: 3, o: ra * 0.9 }); }
    o += `<rect x="0" y="${lvl}" width="1560" height="${SH}" fill="${C.blue}" opacity=".62" clip-path="url(#airc)"/>`;
    o += `<path d="${ground}" fill="#1a2336"/><polyline points="${gp.map((q) => q.join(",")).join(" ")}" fill="none" stroke="#5d6e92" stroke-width="5"/>`;
    [[250, 96, 120], [420, 80, 150], [1560, 100, 110]].forEach(([x, w, h]) => { const y = gy(x + w / 2); o += R(x, y - h, w, h, { f: "#8ea0c4", r: 6 }) + R(x + 12, y - h + 16, 18, 18, { f: "#243553", r: 3 }) + R(x + w - 30, y - h + 16, 18, 18, { f: "#243553", r: 3 }); });
    const a1 = eo(seg(u, 0.1, 0.22)) * (1 - seg(u, 0.4, 0.46));
    o += `<g opacity="${a1}">` + R(110, 205, 560, 110, { f: "#0b1224", s: C.cyan, sw: 3 }) + T(140, 252, "1  Rain lands on every square", { s: 33, w: 750 }) + T(140, 294, "Roofs and roads shed about 90% of it", { s: 28, f: "#bcd0f0" }) + `</g>`;
    const a1b = eo(seg(u, 0.2, 0.32)) * (1 - seg(u, 0.4, 0.46));
    o += `<g opacity="${a1b}">` + R(700, 205, 560, 70, { f: "#0b1224", s: C.teal, sw: 3 }) + T(730, 252, "Open ground: about 55% runs off", { s: 30, w: 650, f: C.teal }) + `</g>`;
    const a2 = eo(seg(u, 0.34, 0.46)) * (1 - seg(u, 0.74, 0.8));
    if (a2 > 0) for (let i = 0; i < 7; i++) { const x = 360 + ((i * 160 + u * 1400) % 1100), y = gy(x) - 24; o += L(x, y, x + 54, gy(x + 54) - 24, { s: C.cyan, w: 6, m: 1, o: a2 }); }
    const a2t = eo(seg(u, 0.44, 0.52)) * (1 - seg(u, 0.74, 0.8));
    o += `<g opacity="${a2t}">` + R(110, 205, 720, 110, { f: "#0b1224", s: C.cyan, sw: 3 }) + T(140, 252, "2  Water flows downhill, round buildings", { s: 33, w: 750 }) + T(140, 294, "3  and pools in the low ground", { s: 33, w: 750 }) + `</g>`;
    const a3 = eo(seg(u, 0.72, 0.84)), dx = 940, dy = gy(dx);
    o += `<g opacity="${a3}">` + R(dx - 26, dy - 4, 52, 14, { f: C.cyan, r: 4 }) + R(dx + 110, gy(dx + 110) - 4, 52, 14, { f: C.red, r: 4 }) + `<path d="M${dx + 118},${gy(dx + 110) - 12} l36,22 M${dx + 154},${gy(dx + 110) - 12} l-36,22" stroke="#fff" stroke-width="4"/>` +
      `<path d="M${dx - 160},${gy(dx - 160) - 40} l20,-24 l20,24 l-20,24z" fill="${C.amber}"/>` +
      R(dx - 420, 470, 560, 64, { f: "#0b1224", s: C.cyan, sw: 3 }) + T(dx - 400, 514, "4  Open drains and pumps remove it", { s: 29, w: 650 }) +
      R(1400, 770, 500, 100, { f: "#0b1224", s: C.green, sw: 3 }) + T(1425, 812, "5  Over the lowest edge of", { s: 28, w: 650 }) + T(1425, 848, "the map: it leaves the area", { s: 28, w: 650 }) + L(1700, 760, 1820, 790, { s: C.green, w: 6, m: "g" }) +
      T(dx + 150, dy + 62, "blocked drain", { s: 25, a: "start", f: C.red, w: 700 }) + T(dx - 20, dy + 62, "open drain", { s: 25, a: "end", f: C.cyan, w: 700 }) + `</g>`;
    const a4 = eo(seg(u, 0.88, 1));
    o += `<g opacity="${a4}">` + R(110, 800, 1100, 96, { f: "#0b1224", s: "#2a4a86", sw: 3 }) + T(660, 860, `Rain that enters = still standing + drained + left the map`, { s: 34, w: 700, a: "middle" }) + `</g>`;
    return svg(o);
  };

  D.formula = (u, z) => {
    let o = heading("How the risk score is built", "RiskIndex = 100 × ( 0.30·Terrain + 0.25·Rainfall + 0.25·Drainage + 0.20·Exposure )");
    const items = [
      { k: "TERRAIN", w: 30, q: "Is the block low, or lower than its neighbours?", c: C.blue, v: z.f.terrain, pts: z.c.terrain },
      { k: "RAINFALL", w: 25, q: "How severe is the storm you chose?", c: C.cyan, v: z.f.rainfall, pts: z.c.rainfall },
      { k: "DRAINAGE", w: 25, q: "How much drain capacity is left? How much is paved?", c: C.purple, v: z.f.drainage, pts: z.c.drainage },
      { k: "EXPOSURE", w: 20, q: "How many buildings, roads and critical facilities?", c: C.amber, v: z.f.exposure, pts: z.c.exposure },
    ];
    items.forEach((it, i) => {
      const x = 110 + i * 440, a = eo(seg(u, 0.05 + i * 0.1, 0.2 + i * 0.1)), fill = ease(seg(u, 0.55 + i * 0.05, 0.78 + i * 0.05));
      o += `<g opacity="${a}" transform="translate(0 ${(1 - a) * 26})">` + R(x, 200, 400, 360, { f: "#0d1a33", s: it.c, sw: 4, r: 26 }) + T(x + 24, 252, it.k, { s: 30, w: 850, f: it.c }) + T(x + 24, 338, `${it.w}%`, { s: 78, w: 850 }) + T(x + 24, 372, "of the score", { s: 25, f: C.mute });
      const words = it.q.split(" "), lines = []; let cur = "";
      words.forEach((w) => { if ((cur + " " + w).length > 27) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim(); }); lines.push(cur);
      o += lines.map((s, k) => T(x + 24, 432 + k * 36, s, { s: 27, f: "#dbe7ff" })).join("") + `</g>`;
      if (u > 0.5) {
        o += `<g opacity="${eo(seg(u, 0.5 + i * 0.05, 0.62 + i * 0.05))}">` + R(x, 590, 400, 26, { f: "#101c36", r: 13 }) + R(x, 590, 400 * it.v * fill, 26, { f: it.c, r: 13 }) +
          T(x, 660, `${f1(it.v, 2)}`, { s: 44, w: 800 }) + T(x + 110, 660, "out of 1", { s: 25, f: C.mute }) + T(x + 400, 660, `${f1(it.pts * fill, 1)} pts`, { s: 44, w: 850, a: "end", f: it.c }) + `</g>`;
      }
    });
    const a = eo(seg(u, 0.88, 1));
    o += `<g opacity="${a}">` + R(110, 710, 1730, 170, { f: "#0b1224", s: "#2a4a86", sw: 3 }) + T(150, 780, `Example block: ${z.id.replace("zone_", "block ")}`, { s: 33, w: 750, f: C.mute }) +
      T(150, 850, `${f1(z.c.terrain, 1)} + ${f1(z.c.rainfall, 1)} + ${f1(z.c.drainage, 1)} + ${f1(z.c.exposure, 1)}`, { s: 58, w: 800 }) + T(870, 850, `=  ${f1(z.idx, 1)}`, { s: 78, w: 850, f: C.red }) + T(1130, 848, "Highest relative index", { s: 44, w: 750, f: C.red }) + `</g>`;
    return svg(o);
  };

  D.bands = (u, p) => {
    const X0 = 160, X1 = 1760, W = X1 - X0, px = (v) => X0 + (v / 100) * W, Y = 470, H = 90;
    const bands = [[0, 35, C.teal, "LOWER", "below 35"], [35, 48, C.amber, "MODERATE", "35 to 48"], [48, 60, C.orange, "HIGHER", "48 to 60"], [60, 100, C.red, "HIGHEST", "60 and above"]];
    let o = heading("Reading the score", "Bands are display choices to help you read the ranking. They are not hazard thresholds.");
    bands.forEach(([a, b, c, n, r], i) => { const k = eo(seg(u, 0.05 + i * 0.1, 0.22 + i * 0.1)); o += R(px(a), Y, (px(b) - px(a)) * k, H, { f: c, r: 0 }) + `<g opacity="${k}">` + T((px(a) + px(b)) / 2, Y + 58, n, { s: 29, w: 850, a: "middle", f: "#06101f" }) + T((px(a) + px(b)) / 2, Y + H + 44, r, { s: 29, a: "middle", f: "#dbe7ff" }) + `</g>`; });
    [[p.base, "Baseline average", C.teal, 0.55], [p.scn, "This scenario's average", C.amber, 0.7], [p.zone, "Block " + p.zid + " (example)", C.red, 0.85]].forEach(([v, lab, c, t0], i) => { const a = eo(seg(u, t0, t0 + 0.12)), yy = 190 + i * 70; o += `<g opacity="${a}">` + L(px(v), yy + 20, px(v), Y, { s: c, w: 4 }) + `<circle cx="${px(v)}" cy="${yy + 8}" r="12" fill="${c}"/>` + T(px(v) + 28, yy + 18, `${lab}: ${f1(v, 1)}`, { s: 34, w: 750, f: c }) + `</g>`; });
    return svg(o);
  };

  D.capacity = (u, p) => {
    const blocked = eo(seg(u, 0.42, 0.6)), cap = p.baseCap * (1 - blocked);
    let o = heading("Why this block's drainage score jumped", "The score counts open drains nearby: closer drains count more");
    o += R(190, 250, 440, 440, { f: "#0d1a33", s: "#4a6aa6", sw: 4, r: 8 }) + T(210, 292, "one 100 m block", { s: 26, f: C.mute });
    o += `<circle cx="410" cy="470" r="300" fill="none" stroke="#2a4a86" stroke-width="3" stroke-dasharray="10 12"/>` + T(410, 196, "drains within 250 m count", { s: 26, a: "middle", f: C.mute });
    [[330, 410], [510, 540]].forEach(([x, y]) => { const c = blocked > 0.5 ? C.red : C.cyan; o += L(410, 470, x, y, { s: "#4a6aa6", w: 2, d: "6 8" }) + `<circle cx="${x}" cy="${y}" r="26" fill="${c}"/>` + (blocked > 0.5 ? `<path d="M${x - 14},${y - 14} l28,28 M${x + 14},${y - 14} l-28,28" stroke="#fff" stroke-width="6"/>` : ""); });
    o += T(190, 836, `Drain capacity nearby: ${f1(cap, 0)}%`, { s: 30, w: 750 }) + `<rect x="190" y="854" width="440" height="22" rx="11" fill="#101c36"/><rect x="190" y="854" width="${440 * (cap / 100)}" height="22" rx="11" fill="${blocked > 0.5 ? C.red : C.cyan}"/>`;
    const col = (x, title, sub, c, capv, d, pts, a) => `<g opacity="${a}">` + R(x, 230, 500, 560, { f: "#0d1a33", s: c, sw: 4, r: 26 }) + T(x + 30, 290, title, { s: 34, w: 850, f: c }) + T(x + 30, 330, sub, { s: 26, f: C.mute }) +
      T(x + 30, 400, "Drainage score", { s: 28, f: C.mute }) + T(x + 30, 456, `0.6 × (1 − ${f1(capv / 100, 2)})`, { s: 38, w: 650 }) + T(x + 30, 508, `+ 0.4 × ${f1(p.imperv / 100, 2)} paved`, { s: 38, w: 650 }) + L(x + 30, 532, x + 470, 532, { s: "#2a4a86", w: 2 }) +
      T(x + 30, 596, `= ${f1(d, 2)}`, { s: 64, w: 850 }) + T(x + 30, 700, `${f1(pts, 1)} points`, { s: 76, w: 850, f: c }) + T(x + 30, 748, "of the 100-point score", { s: 26, f: C.mute }) + `</g>`;
    o += col(740, "NORMAL STORM", "both drains open", C.teal, p.baseCap, 0.6 * (1 - p.baseCap / 100) + 0.4 * (p.imperv / 100), p.baseDrainPts, eo(seg(u, 0.1, 0.24)));
    o += col(1320, "THIS SCENARIO", "both drains blocked", C.red, 0, 0.6 + 0.4 * (p.imperv / 100), p.drainPts, eo(seg(u, 0.55, 0.72)));
    o += L(1250, 510, 1306, 510, { s: C.mute, w: 6, m: 1, o: eo(seg(u, 0.55, 0.7)) });
    return svg(o);
  };

  D.architecture = (u) => {
    const B = (x, y, w, h, t, s, c, a) => `<g opacity="${a}">` + R(x, y, w, h, { f: "#0d1a33", s: c, sw: 4, r: 24 }) + T(x + w / 2, y + 54, t, { s: 31, w: 850, a: "middle", f: c }) + s.map((l, i) => T(x + w / 2, y + 108 + i * 42, l, { s: 26, a: "middle", f: "#dbe7ff" })).join("") + `</g>`;
    let o = heading("What is inside", "Open, documented and testable");
    const a = (i) => eo(seg(u, 0.05 + i * 0.12, 0.2 + i * 0.12));
    o += B(110, 230, 400, 230, "OPEN DATA", ["OpenStreetMap", "Copernicus elevation"], C.teal, a(0));
    o += B(110, 560, 400, 230, "DATA PIPELINE", ["Python: grid, zones,", "provenance labels"], C.purple, a(1));
    o += B(660, 230, 620, 560, "WEB APP IN THE BROWSER", ["3D twin (Three.js)", "Flood solver (Web Worker)", "Risk engine and routing", "Dashboard, timeline, 2D map", "Works with no server"], C.cyan, a(2));
    o += B(1430, 230, 400, 230, "OPTIONAL API", ["FastAPI: scenarios,", "explanations, assistant"], C.amber, a(3));
    o += B(1430, 560, 400, 230, "AI ENGINE", ["Risk scoring (Python)", "Cited evidence retrieval"], C.green, a(4));
    o += L(520, 345, 650, 450, { m: 1, w: 5, o: a(2) }) + L(310, 555, 310, 470, { m: 1, w: 5, o: a(1) }) + L(1290, 400, 1420, 345, { m: 1, w: 5, o: a(3) }) + L(1630, 555, 1630, 470, { m: 1, w: 5, o: a(4) });
    o += T(960, 880, "34 automated tests  ·  the browser and server versions of the score must agree exactly", { s: 30, a: "middle", f: "#bcd0f0", o: eo(seg(u, 0.8, 1)) });
    return svg(o);
  };

  // ------------------------------------------------------------------ cards
  const DECOR = `<svg style="position:absolute;right:-60px;top:20px" width="1000" height="860" viewBox="0 0 1000 860">${[420, 330, 240, 150, 70].map((r, i) => `<circle cx="560" cy="430" r="${r}" fill="none" stroke="${i % 2 ? "#2a4a86" : "#38bdf8"}" stroke-width="${i % 2 ? 2 : 3}" opacity="${0.18 + i * 0.07}"/>`).join("")}<path d="M120 560 C 260 500, 340 620, 480 560 S 700 500, 860 570" fill="none" stroke="#38bdf8" stroke-width="5" opacity=".55"/><path d="M120 610 C 260 550, 340 670, 480 610 S 700 550, 860 620" fill="none" stroke="#3b82f6" stroke-width="5" opacity=".4"/><path d="M120 660 C 260 600, 340 720, 480 660 S 700 600, 860 670" fill="none" stroke="#a78bfa" stroke-width="4" opacity=".3"/></svg>`;
  const reveal = (u, i, n) => eo(seg(u, 0.04 + (i / n) * 0.82, 0.04 + (i / n) * 0.82 + 0.14));
  const CARD = {
    title: (c, u, t) => `<div class="vo-card" style="opacity:${eo(seg(t, 0, 0.7))}">${DECOR}<div class="kick">${c.kick || ""}</div><h1>${c.title}</h1><div class="sub">${c.sub || ""}</div><div class="foot">${c.foot || ""}</div></div>`,
    film: (c, u, t) => `<div class="vo-film-card" style="opacity:${eo(seg(t, 0, 1.1))}"><div class="big" style="font-size:${c.size || 150}px;transform:scale(${1 + 0.05 * u});letter-spacing:${0.08 + 0.02 * u}em">${c.big}</div><div class="small">${c.small || ""}</div></div>`,
    list: (c, u, t) => `<div class="vo-card" style="opacity:${eo(seg(t, 0, 0.5))}"><div class="kick">${c.kick || ""}</div><h2>${c.title}</h2>` +
      c.items.map((it, i) => { const a = c.all ? 1 : reveal(u, i, c.items.length); return `<div class="vo-item" style="opacity:${a};transform:translateX(${(1 - a) * 40}px)"><div class="ic" style="${it.c ? `color:${it.c};border-color:${it.c}` : ""}">${it.ic || i + 1}</div><div><h3>${it.h}</h3>${it.p ? `<p>${it.p}</p>` : ""}</div></div>`; }).join("") + `</div>`,
    compare: (c, u, t) => `<div class="vo-card" style="opacity:${eo(seg(t, 0, 0.5))}"><div class="kick">${c.kick || ""}</div><h2>${c.title}</h2><div class="vo-cols">` +
      [c.left, c.right].map((col, k) => `<div class="vo-col" style="border-color:${col.c};opacity:${eo(seg(u, k * 0.12, k * 0.12 + 0.2))}"><h3 style="color:${col.c}">${col.h}</h3><ul style="margin:0;padding:0">` +
        col.items.map((s, i) => `<li style="opacity:${reveal(u, i + k * 0.5, col.items.length + 1)};color:#e6edf8"><span style="position:absolute;left:0;color:${col.c}">${col.m}</span>${s}</li>`).join("") + `</ul></div>`).join("") + `</div></div>`,
    tiles: (c, u, t) => `<div class="vo-card" style="opacity:${eo(seg(t, 0, 0.5))}"><div class="kick">${c.kick || ""}</div><h2>${c.title}</h2><div class="vo-grid" style="grid-template-columns:repeat(${c.cols || 2},1fr)">` +
      c.tiles.map((x, i) => { const a = c.all ? 1 : reveal(u, i, c.tiles.length); return `<div class="vo-tile" style="border-color:${x.c};opacity:${a};transform:translateY(${(1 - a) * 24}px)">${x.tag ? `<span class="tag" style="background:${x.c};color:#06101f">${x.tag}</span>` : ""}<h3 style="color:${x.c}">${x.h}</h3>${(x.p || []).map((s) => `<p>${s}</p>`).join("")}</div>`; }).join("") + `</div></div>`,
  };

  // ------------------------------------------------------------------ renderer
  function kpiHTML(k, u, t) {
    const pos = k.pos || "tr", st = pos === "sl" ? "left:330px;top:230px" : pos === "tr" ? "right:30px;top:96px" : pos === "tl" ? "left:30px;top:96px" : pos === "br" ? "right:30px;bottom:40px" : "left:30px;bottom:40px";
    const a = eo(seg(t, 0, 0.5)), tw = ease(seg(t, 0.3, 1.8));
    return `<div class="vo-kpi" style="${st};opacity:${a};transform:translateY(${(1 - a) * 18}px)"><h4>${k.title}</h4>` +
      k.rows.map((r) => { const v = r.from === undefined ? r.to : r.from + (r.to - r.from) * tw; const shown = r.text !== undefined ? r.text : f1(v, r.d ?? 0); return `<div class="r"><span>${r.label}</span><b style="color:${r.c || "#fff"}">${shown}<small>${r.unit || ""}</small></b></div>`; }).join("") + (k.note ? `<div class="n">${k.note}</div>` : "") + `</div>`;
  }
  function place(sel) {
    if (sel.world) {
      const sc = window.__scene; if (!sc) return null;
      const v = sc.cur().tg.clone().set(sel.world[0], sel.world[1], sel.world[2]).project(sc.camera);
      const el = document.querySelector(".twin-canvas canvas"), r = el.getBoundingClientRect();
      const x = r.left + ((v.x + 1) / 2) * r.width, y = r.top + ((1 - v.y) / 2) * r.height, s = sel.size || 60;
      return { x: x - s / 2, y: y - s / 2, w: s, h: s, round: true };
    }
    let s = sel.sel, idx = 0; const m = /^(.*)@(\d+)$/.exec(s); if (m) { s = m[1]; idx = +m[2]; }
    const el = document.querySelectorAll(s)[idx]; if (!el) return null;
    const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height };
  }
  function callHTML(cs, u, t, dur) {
    return cs.map((c) => {
      const at = c.atu !== undefined ? c.atu * dur : c.at || 0;
      const a = eo(seg(t, at + 0.1, at + 0.5)); if (a <= 0) return "";
      const b = place(c); if (!b) return "";
      const pad = c.pad ?? 8, x = b.x - pad, y = b.y - pad, w = b.w + pad * 2, h = b.h + pad * 2, side = c.side || "bottom";
      let lx = x, ly = y + h + 14;
      if (side === "top") ly = y - 14 - 56; if (side === "left") { lx = x - 540; ly = y + h / 2 - 28; } if (side === "right") { lx = x + w + 16; ly = y + h / 2 - 28; }
      if (c.row) ly -= c.row * 64; if (c.lx !== undefined) lx = c.lx; if (c.ly !== undefined) ly = c.ly;
      lx = clamp(lx, 14, 1920 - 500); ly = clamp(ly, 14, SH - 70);
      const pulse = 1 + 0.025 * Math.sin(t * 5);
      if (c.style === "film") return `<div style="opacity:${a}"><div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border:2px solid #f3efe6cc;border-radius:50%;box-shadow:0 0 18px #0009;transform:scale(${pulse})"></div>` +
        (c.label ? `<div style="position:absolute;left:${lx}px;top:${ly + 8}px;font:italic 400 40px 'Iowan Old Style',Georgia,serif;color:#f3efe6;text-shadow:0 2px 16px #000,0 0 30px #000;letter-spacing:.03em">${c.label}</div>` : "") + `</div>`;
      return `<div style="opacity:${a}"><div class="vo-call" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;${b.round ? "border-radius:50%;" : ""}transform:scale(${pulse})"></div>` +
        (c.label && !(c.untilu !== undefined && t > c.untilu * dur) ? `<div class="vo-lab" style="left:${lx}px;top:${ly}px">${c.n ? `<i>${c.n}</i>` : ""}${c.label}</div>` : "") + `</div>`;
    }).join("");
  }
  function filmHTML(f) {
    if (!f) return "";
    const vig = `<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 55%,rgba(0,0,0,0) 40%,rgba(0,0,0,.74) 100%)"></div>`;
    const bar = `<div style="position:absolute;left:0;right:0;top:0;height:92px;background:#000;display:flex;align-items:center;justify-content:center;letter-spacing:.34em;font-size:20px;color:#7d8fb2;font-weight:600">${f.tag || ""}</div>`;
    const clock = f.clock ? `<div style="position:absolute;left:70px;bottom:40px;color:#f3efe6;font-family:'Iowan Old Style',Georgia,serif;font-size:74px;font-weight:400;letter-spacing:.04em;text-shadow:0 2px 24px #000">${f.clock}<div style="font:600 21px -apple-system,Helvetica,sans-serif;letter-spacing:.34em;color:#aebfdf;margin-top:2px">${f.place || "KAKINADA"}</div></div>` : "";
    const lines = (f.lines || []).filter((l) => l.alpha > 0.01).map((l, i) => `<div style="opacity:${l.alpha};font:400 62px 'Iowan Old Style',Georgia,serif;letter-spacing:.05em;color:#f3efe6;text-shadow:0 2px 28px #000,0 0 40px #000;margin-top:14px">${l.text}</div>`).join("");
    const linesBox = lines ? `<div style="position:absolute;left:0;right:0;bottom:150px;text-align:center">${lines}</div>` : "";
    const flash = f.flash > 0.01 ? `<div style="position:absolute;inset:0;background:#dfe9ff;opacity:${f.flash}"></div>` : "";
    const fade = f.fade > 0.01 ? `<div style="position:absolute;inset:0;background:#000;opacity:${f.fade}"></div>` : "";
    return vig + bar + clock + linesBox + flash + fade;
  }

  window.VO = {
    render(S) {
      $("vo-part").innerHTML = S.part ? `<small>${S.part.kick}</small><b>${S.part.title}</b>` : "";
      $("vo-cap").textContent = S.cap || "";
      $("vo-dim").style.cssText = S.dim ? `position:absolute;inset:0;background:rgba(3,6,14,${S.dim})` : "";
      $("vo-film").innerHTML = filmHTML(S.film);
      const te = $("vo-tint"), tt = S.film && S.film.tint; te.style.cssText = tt ? `position:fixed;left:0;top:0;width:${SW}px;height:${SH}px;z-index:2147482999;pointer-events:none;background:${tt.c};mix-blend-mode:${tt.mode || "multiply"};opacity:${tt.a ?? 1}` : "display:none";
      $("vo-card").innerHTML = S.card ? CARD[S.card.type](S.card, S.cu ?? S.u, S.ct ?? S.t) : "";
      $("vo-diag").innerHTML = S.diag ? `<div class="vo-diag" style="opacity:${eo(seg(S.dt ?? S.t, 0, 0.5))}">${D[S.diag.name](S.du ?? S.u, S.diag.params || {})}</div>` : "";
      $("vo-kpi").innerHTML = S.kpi ? kpiHTML(S.kpi, S.u, S.t) : "";
      $("vo-call").innerHTML = S.callouts ? callHTML(S.callouts, S.u, S.t, S.dur || 10) : "";
    },
  };
})();
