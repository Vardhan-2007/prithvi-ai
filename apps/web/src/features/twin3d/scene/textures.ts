// Procedural canvas textures (no image assets): building facades, lane-marked asphalt, ground grain.
import * as THREE from "three";

function mulberry(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const canvas = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };

export const FACADE_TILE_M = { w: 14, h: 12.8 }; // one texture tile = 4 x 4 windows (3.5 m x 3.2 m each)

/** Facade colour map (concrete + window grid) and a matching emissive map (some windows lit). */
export function facadeTextures(maxAniso: number) {
  const S = 256, rnd = mulberry(7);
  const map = canvas(S, S), em = canvas(S, S);
  const g = map.getContext("2d")!, e = em.getContext("2d")!;
  g.fillStyle = "#e8e4db"; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 3500; i++) { g.fillStyle = `rgba(${rnd() > 0.5 ? "255,255,255" : "70,60,50"},${0.03 + rnd() * 0.05})`; g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 3, 1 + rnd() * 2); }
  e.fillStyle = "#000"; e.fillRect(0, 0, S, S);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const x = c * 64 + 12, y = r * 64 + 10, w = 40, h = 40;
    g.fillStyle = "rgba(120,112,100,0.35)"; g.fillRect(0, r * 64 + 54, S, 7);            // slab / floor band
    g.fillStyle = "#a9a59b"; g.fillRect(x - 3, y - 3, w + 6, h + 6);                     // frame
    const grad = g.createLinearGradient(x, y, x + w, y + h); grad.addColorStop(0, "#2d3f57"); grad.addColorStop(1, "#111c2d");
    g.fillStyle = grad; g.fillRect(x, y, w, h);
    g.fillStyle = "rgba(160,190,230,0.22)"; g.beginPath(); g.moveTo(x, y + h); g.lineTo(x + w * 0.55, y); g.lineTo(x + w * 0.8, y); g.lineTo(x + w * 0.25, y + h); g.fill(); // glass glint
    g.fillStyle = "#6e6a62"; g.fillRect(x + w / 2 - 1, y, 2, h);                          // mullion
    g.fillStyle = "#cfcabf"; g.fillRect(x - 5, y + h + 3, w + 10, 3);                    // sill
    if (rnd() < 0.24) {
      const lit = e.createLinearGradient(x, y, x, y + h); lit.addColorStop(0, "#ffd9a0"); lit.addColorStop(1, "#ff9f43");
      e.fillStyle = lit; e.fillRect(x, y, w, h);
    }
  }
  const mk = (c: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
    t.flipY = false; t.repeat.set(1 / FACADE_TILE_M.w, 1 / FACADE_TILE_M.h); t.needsUpdate = true; return t;
  };
  return { map: mk(map), emissive: mk(em) };
}

/** Asphalt with edge lines and (for major roads) a dashed centre line. u across the road, v along (12 m per tile). */
export function roadTexture(major: boolean, maxAniso: number) {
  const W = 128, H = 256, rnd = mulberry(major ? 11 : 13);
  const c = canvas(W, H), g = c.getContext("2d")!;
  g.fillStyle = major ? "#33373e" : "#3b3f45"; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${rnd() > 0.5 ? "255,255,255" : "0,0,0"},${0.03 + rnd() * 0.06})`; g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2); }
  g.fillStyle = major ? "rgba(235,235,235,0.85)" : "rgba(220,220,220,0.28)";
  g.fillRect(9, 0, 3, H); g.fillRect(W - 12, 0, 3, H);
  if (major) { g.fillStyle = "rgba(246,214,80,0.9)"; g.fillRect(W / 2 - 2, 0, 4, 108); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; t.needsUpdate = true;
  return t;
}

/** Subtle tileable grain for the ground so it doesn't read as flat colour. */
export function groundTexture(maxAniso: number) {
  const S = 256, rnd = mulberry(23), c = canvas(S, S), g = c.getContext("2d")!;
  g.fillStyle = "#cfcfcf"; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * S, y = rnd() * S, r = 10 + rnd() * 40, v = 175 + rnd() * 80;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      gr.addColorStop(0, `rgba(${v},${v},${v},0.35)`); gr.addColorStop(1, "rgba(200,200,200,0)");
      g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  for (let i = 0; i < 6000; i++) { const v = 150 + rnd() * 105; g.fillStyle = `rgba(${v},${v},${v},0.25)`; g.fillRect(rnd() * S, rnd() * S, 2, 2); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; t.needsUpdate = true;
  return t;
}
