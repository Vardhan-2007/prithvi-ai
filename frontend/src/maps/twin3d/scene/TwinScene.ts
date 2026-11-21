// Imperative Three.js digital-twin scene: terrain, OSM buildings (facades, roofs, shadows), lane-marked roads,
// proxy drain inlets, facilities, shaded live flood water (flow-aligned ripples, rain rings, foam), rain, sky,
// risk heat-map, route overlay and a camera with tweened navigation. React only talks to it via the setters.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { Dataset, ScenarioResult, Zone } from "../../../scenarios/engine/types";
import { demAt, demRange } from "../../../scenarios/engine/dataset";
import { indexColor } from "../../../scenarios/engine/risk";
import type { Layers } from "../../../store";
import type { NavApi } from "../../../components/NavPad";
import { facadeTextures, groundTexture, roadTexture } from "./textures";

export const VERT_EXAGGERATION = 3; // applied to terrain relief only - buildings, trees and water depth stay true size
const EX = VERT_EXAGGERATION;
const FAC_COLORS: Record<string, number> = { health: 0xef4444, emergency: 0xf59e0b, shelter: 0x22c55e, other: 0x94a3b8 };
const WALL_PALETTE: [number, number, number][] = [[0.95, 0.93, 0.88], [0.86, 0.88, 0.92], [0.97, 0.88, 0.78], [0.84, 0.87, 0.8], [0.93, 0.82, 0.78], [0.9, 0.9, 0.9]];
const ROOF_PALETTE: [number, number, number][] = [[0.2, 0.2, 0.22], [0.42, 0.21, 0.16], [0.14, 0.14, 0.15], [0.32, 0.3, 0.28], [0.5, 0.26, 0.2]];
const ROAD_RANK: Record<string, number> = { primary: 0.17, secondary: 0.16, tertiary: 0.15, unclassified: 0.14, residential: 0.13, service: 0.12, living_street: 0.12 };
const MIN_DIST = 50, MAX_DIST = 3600, MAX_POLAR = 1.5, MIN_POLAR = 0.06;

export interface HoverInfo { kind: "facility" | "inlet" | "zone"; id: string; title: string; lines: string[] }
export interface SceneCallbacks {
  onZone(id: string | null): void;
  onInlet(id: string): void;
  onHover(info: HoverInfo | null, x: number, y: number): void;
}

const rnd = (s: number) => { const x = Math.sin(s * 12.9898 + 4.1414) * 43758.5453; return x - Math.floor(x); };

function sliceGeo(g: THREE.BufferGeometry, start: number, count: number, attrs: string[]) {
  const out = new THREE.BufferGeometry();
  for (const a of attrs) {
    const at = g.getAttribute(a); const sz = at.itemSize;
    out.setAttribute(a, new THREE.BufferAttribute((at.array as Float32Array).slice(start * sz, (start + count) * sz), sz));
  }
  return out;
}

const WATER_VERT = /* glsl */ `
attribute float aDepth; attribute vec2 aFlow;
varying float vDepth; varying vec2 vFlow; varying vec3 vWorld;
void main(){ vDepth = aDepth; vFlow = aFlow; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;

const WATER_FRAG = /* glsl */ `
uniform float uTime; uniform float uRain; uniform vec3 uSun;
varying float vDepth; varying vec2 vFlow; varying vec3 vWorld;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
float hgt(vec2 p){ return vnoise(p)*0.6 + vnoise(p*2.3+7.1)*0.3 + vnoise(p*5.1-3.3)*0.1; }
vec3 ramp(float d){
  vec3 c0 = vec3(0.36,0.74,0.86), c1 = vec3(0.16,0.45,0.92), c2 = vec3(0.20,0.22,0.74), c3 = vec3(0.65,0.12,0.45), c4 = vec3(0.92,0.22,0.15);
  if (d < 0.15) return mix(c0*0.9, c0, d/0.15);
  if (d < 0.45) return mix(c0, c1, (d-0.15)/0.30);
  if (d < 0.85) return mix(c1, c2, (d-0.45)/0.40);
  if (d < 1.15) return mix(c2, c3, (d-0.85)/0.30);
  return mix(c3, c4, clamp((d-1.15)/0.3, 0.0, 1.0));
}
void main(){
  float d = vDepth;
  float a = smoothstep(0.003, 0.09, d);
  if (a < 0.02) discard;
  float sp = length(vFlow);
  vec2 p = vWorld.xz * 0.16 - vFlow * uTime * 0.9 + vec2(uTime * 0.03, 0.0);
  float e = 0.06, h0 = hgt(p), hx = hgt(p + vec2(e,0.0)), hz = hgt(p + vec2(0.0,e));
  vec2 g = vec2(hx - h0, hz - h0) / e;
  float amp = 0.16 + 0.55 * sp + 0.45 * uRain;
  vec3 n = normalize(vec3(-g.x * amp, 1.0, -g.y * amp));
  float ring = 0.0;
  if (uRain > 0.02) {
    vec2 q = vWorld.xz / 2.4; vec2 cell = floor(q); vec2 f = fract(q);
    float hs = hash(cell); vec2 c = vec2(hash(cell + 3.1), hash(cell + 7.7));
    float ph = fract(uTime * 0.85 + hs); float dist = length(f - c); float rr = ph * 0.55;
    ring = smoothstep(0.07, 0.0, abs(dist - rr)) * (1.0 - ph) * step(hs, uRain * 0.85 + 0.12);
  }
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 3.0);
  vec3 base = pow(ramp(d), vec3(2.2));
  vec3 L = normalize(uSun);
  float diff = clamp(dot(n, L), 0.0, 1.0) * 0.55 + 0.45;
  vec3 sky = pow(vec3(0.50, 0.60, 0.76), vec3(2.2));
  vec3 col = base * diff;
  col = mix(col, sky, fres * 0.55);
  float spec = pow(clamp(dot(reflect(-L, n), V), 0.0, 1.0), 90.0) * 1.1;
  col += vec3(spec) + vec3(ring * 0.55);
  float foam = smoothstep(0.07, 0.0, d) * (0.45 + 0.55 * vnoise(vWorld.xz * 0.8 + uTime * 0.25));
  col = mix(col, vec3(0.85, 0.9, 0.93), foam * 0.7);
  float alpha = a * (0.62 + 0.3 * clamp(d * 1.2, 0.0, 1.0)) + foam * 0.18 + ring * 0.2;
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.93));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const SKY_VERT = /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_FRAG = /* glsl */ `
varying vec3 vDir; uniform vec3 uSun;
void main(){
  float h = clamp(vDir.y, -0.2, 1.0);
  vec3 horizon = vec3(0.36, 0.42, 0.52), mid = vec3(0.16, 0.22, 0.36), zenith = vec3(0.05, 0.08, 0.17);
  vec3 c = mix(horizon, mid, smoothstep(0.0, 0.35, h)); c = mix(c, zenith, smoothstep(0.3, 1.0, h));
  c = mix(c, vec3(0.12,0.14,0.18), smoothstep(0.0, -0.2, vDir.y));
  float s = max(dot(normalize(vDir), normalize(uSun)), 0.0); c += vec3(1.0, 0.8, 0.55) * (pow(s, 24.0) * 0.35 + pow(s, 6.0) * 0.12);
  gl_FragColor = vec4(pow(c, vec3(2.2)), 1.0);
  #include <colorspace_fragment>
}`;

export class TwinScene {
  private ds: Dataset;
  private cb: SceneCallbacks;
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private labels: CSS2DRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private world = new THREE.Group();
  private raf = 0;
  private last = performance.now();
  private ro: ResizeObserver;
  private W: number; private H: number; private nx: number; private ny: number; private cell: number;
  private demMin: number;
  private aniso: number;

  private terrain!: THREE.Mesh; private terrainMat!: THREE.MeshStandardMaterial; private terrainColors!: Float32Array; private baseColors!: Float32Array;
  private water!: THREE.Mesh; private waterMat!: THREE.ShaderMaterial; private waterPos!: Float32Array; private waterDepth!: Float32Array; private waterFlow!: Float32Array;
  private H2!: Float32Array;
  private walls!: THREE.Mesh; private roofs!: THREE.Mesh; private bColors!: Float32Array;
  private bRanges: { start: number; count: number; cells: number[]; base: [number, number, number] }[] = [];
  private roadSets: { mesh: THREE.Mesh; colors: Float32Array; cells: number[] }[] = [];
  private walkMesh!: THREE.Mesh; private roadMats: THREE.MeshStandardMaterial[] = [];
  private inletMesh!: THREE.InstancedMesh;
  private trees = new THREE.Group();
  private facGroup = new THREE.Group();
  private pumpGroup = new THREE.Group();
  private rain!: THREE.LineSegments; private rainPos!: Float32Array; private rainIntensity = 0;
  private selBox!: THREE.LineSegments;
  private routeMesh: THREE.Mesh | null = null;
  private hotspots: CSS2DObject[] = [];
  private sun!: THREE.DirectionalLight;
  private wet = 0;
  private lastColor = 0; private lastHot = 0;
  private downPos = { x: 0, y: 0, t: 0 };
  private ray = new THREE.Raycaster();
  private hoverT = 0;
  private roadThreshold = 0.25;
  private demGrid: Float32Array; private demY: Float32Array;
  private gz(x: number, y: number) { return demAt(this.ds, x, y) * EX; }
  private layerRain = true;
  private tw: null | { t0: number; dur: number; from: View; to: View } = null;
  private bearingCbs = new Set<(a: number) => void>();
  private lastTheta = NaN;
  onFrame?: (dt: number) => void;
  hoverFormatter: (kind: "facility" | "inlet" | "zone", id: string) => HoverInfo | null = () => null;

  constructor(container: HTMLElement, ds: Dataset, cb: SceneCallbacks) {
    this.ds = ds; this.cb = cb; this.container = container;
    this.W = ds.meta.size_m[0]; this.H = ds.meta.size_m[1]; this.nx = ds.grid.nx; this.ny = ds.grid.ny; this.cell = ds.grid.cell_m;
    this.demMin = demRange(ds)[0];
    this.demGrid = Float32Array.from(ds.grid.dem); this.demY = this.demGrid.map((v) => v * EX);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.aniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    container.appendChild(this.renderer.domElement);
    container.tabIndex = 0; container.style.outline = "none";
    this.labels = new CSS2DRenderer(); this.labels.domElement.className = "labels-layer"; container.appendChild(this.labels.domElement);

    this.scene.fog = new THREE.FogExp2(0x3a4558, 0.00016);
    this.buildSky(); this.buildLights();
    this.scene.add(this.world);

    this.camera = new THREE.PerspectiveCamera(42, 1, 4, 12000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    const c = this.controls;
    c.enableDamping = true; c.dampingFactor = 0.09; c.rotateSpeed = 0.8; c.zoomSpeed = 1.1; c.panSpeed = 1.0;
    c.screenSpacePanning = false; c.zoomToCursor = false;
    c.minDistance = MIN_DIST; c.maxDistance = MAX_DIST; c.minPolarAngle = MIN_POLAR; c.maxPolarAngle = MAX_POLAR;
    c.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.setViewNow({ th: 0.26, ph: 1.0, r: 1850, tg: new THREE.Vector3(this.W / 2 + 120, 20, -this.H / 2) });

    this.buildTerrain(); this.buildSkirt(); this.buildBuildings(); this.buildRoads(); this.buildTrees(); this.buildWater();
    this.buildInlets(); this.buildFacilities(); this.buildRain(); this.buildSelection();
    this.world.add(this.facGroup, this.pumpGroup);

    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.onDown); el.addEventListener("pointerup", this.onUp); el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerleave", () => this.cb.onHover(null, 0, 0)); el.addEventListener("dblclick", this.onDbl);
    el.addEventListener("wheel", () => { this.tw = null; }, { passive: true });
    container.addEventListener("keydown", this.onKey);
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(container); this.resize();
    this.loop();
  }

  // ------------------------------------------------------------------ sky + light
  private buildSky() {
    const sunDir = new THREE.Vector3(-0.55, 0.62, 0.56).normalize();
    const mat = new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { uSun: { value: sunDir } } });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(8000, 32, 16), mat);
    dome.renderOrder = -10; dome.frustumCulled = false; this.scene.add(dome);
    // image-based lighting from the same sky: gives wet roads, glass and water believable reflections
    const pm = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), mat));
    this.scene.environment = pm.fromScene(envScene, 0.02).texture; this.scene.environmentIntensity = 0.55;
    pm.dispose();
  }

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight(0x9db4d6, 0x2a2f3a, 0.55));
    const sun = new THREE.DirectionalLight(0xffe9cf, 2.1);
    sun.position.set(this.W / 2 - 900, 1250, -this.H / 2 + 850); sun.target.position.set(this.W / 2, 0, -this.H / 2);
    sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
    const s = sun.shadow.camera; s.left = -1250; s.right = 1250; s.top = 1250; s.bottom = -1250; s.near = 100; s.far = 4000;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.8; sun.shadow.radius = 3;
    this.scene.add(sun, sun.target); this.sun = sun;
    const rim = new THREE.DirectionalLight(0x6f8fff, 0.5); rim.position.set(1200, 500, -900); this.scene.add(rim);
  }

  // ------------------------------------------------------------------ construction
  private buildTerrain() {
    const { nx, ny, cell } = this;
    const n = nx * ny;
    const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    this.baseColors = new Float32Array(n * 3); this.terrainColors = new Float32Array(n * 3);
    const [lo, hi] = demRange(this.ds);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, z = this.demGrid[k];
      pos[k * 3] = (i + 0.5) * cell; pos[k * 3 + 1] = z * EX; pos[k * 3 + 2] = -(j + 0.5) * cell;
      uv[k * 2] = ((i + 0.5) * cell) / 46; uv[k * 2 + 1] = ((j + 0.5) * cell) / 46;
      const t = (z - lo) / (hi - lo + 1e-6), v = (rnd(k) - 0.5) * 0.05;
      // dusty urban ground: olive-grey in the low parts, lighter dry earth on the high parts
      this.baseColors.set([0.3 + 0.11 * t + v, 0.31 + 0.09 * t + v, 0.26 + 0.07 * t + v * 0.6], k * 3);
    }
    this.terrainColors.set(this.baseColors);
    const idx: number[] = [];
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(this.terrainColors, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    this.terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: groundTexture(this.aniso), roughness: 0.96, metalness: 0 });
    this.terrain = new THREE.Mesh(g, this.terrainMat); this.terrain.receiveShadow = true;
    this.world.add(this.terrain);
  }

  private buildSkirt() {
    const { nx, ny, cell } = this;
    const base = this.demMin * EX - 6;
    const mk = (pts: [number, number, number][]) => {
      const pos: number[] = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, y0, z0] = pts[i], [x1, y1, z1] = pts[i + 1];
        pos.push(x0, y0, z0, x0, base, z0, x1, y1, z1, x1, y1, z1, x0, base, z0, x1, base, z1);
      }
      return pos;
    };
    const edge: [number, number, number][][] = [[], [], [], []];
    for (let i = 0; i < nx; i++) {
      edge[0].push([(i + 0.5) * cell, this.demY[i], -0.5 * cell]);
      edge[1].push([(i + 0.5) * cell, this.demY[(ny - 1) * nx + i], -(ny - 0.5) * cell]);
    }
    for (let j = 0; j < ny; j++) {
      edge[2].push([0.5 * cell, this.demY[j * nx], -(j + 0.5) * cell]);
      edge[3].push([(nx - 0.5) * cell, this.demY[j * nx + nx - 1], -(j + 0.5) * cell]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(edge.flatMap(mk)), 3)); g.computeVertexNormals();
    this.world.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x1b222e, roughness: 1, side: THREE.DoubleSide })));
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(this.W * 4, this.H * 4), new THREE.MeshStandardMaterial({ color: 0x151a24, roughness: 1 }));
    plate.rotation.x = -Math.PI / 2; plate.position.set(this.W / 2, base - 0.2, -this.H / 2); plate.receiveShadow = true; this.world.add(plate);
    const grid = new THREE.GridHelper(Math.max(this.W, this.H) * 2.4, 48, 0x26334f, 0x1a2338);
    grid.position.set(this.W / 2, base, -this.H / 2); this.world.add(grid);
  }

  private buildBuildings() {
    const wallGeos: THREE.BufferGeometry[] = [], roofGeos: THREE.BufferGeometry[] = [];
    let vcount = 0;
    this.ds.buildings.forEach((b, bi) => {
      try {
        const shape = new THREE.Shape(b.ring.map(([x, y]) => new THREE.Vector2(x, y)));
        let lo = Infinity, hi = -Infinity;
        for (const [x, y] of b.ring) { const z = this.gz(x, y); lo = Math.min(lo, z); hi = Math.max(hi, z); }
        const bottom = lo - 1.2, top = hi + b.h * 1.08;
        const g = new THREE.ExtrudeGeometry(shape, { depth: top - bottom, bevelEnabled: false });
        const sideG = g.groups.find((q) => q.materialIndex === 1), capG = g.groups.find((q) => q.materialIndex === 0);
        if (!sideG || !capG) return;
        const side = sliceGeo(g, sideG.start, sideG.count, ["position", "normal", "uv"]);
        const cap = sliceGeo(g, capG.start, capG.count, ["position", "normal"]);
        for (const q of [side, cap]) { q.translate(0, 0, bottom); q.rotateX(-Math.PI / 2); }
        const wall = WALL_PALETTE[Math.floor(rnd(bi + 1) * WALL_PALETTE.length)];
        const sh = 0.9 + rnd(bi + 50) * 0.15; const base: [number, number, number] = [wall[0] * sh, wall[1] * sh, wall[2] * sh];
        const wc = new Float32Array(side.getAttribute("position").count * 3); for (let i = 0; i < wc.length; i += 3) wc.set(base, i);
        side.setAttribute("color", new THREE.BufferAttribute(wc, 3));
        const roof = ROOF_PALETTE[Math.floor(rnd(bi + 9) * ROOF_PALETTE.length)];
        const rc = new Float32Array(cap.getAttribute("position").count * 3); for (let i = 0; i < rc.length; i += 3) rc.set(roof, i);
        cap.setAttribute("color", new THREE.BufferAttribute(rc, 3));
        const cx = b.ring.reduce((s, p) => s + p[0], 0) / b.ring.length, cy = b.ring.reduce((s, p) => s + p[1], 0) / b.ring.length;
        const ci = Math.floor(cx / this.cell), cj = Math.floor(cy / this.cell), cells: number[] = [];
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const i = ci + di, j = cj + dj; if (i >= 0 && j >= 0 && i < this.nx && j < this.ny) cells.push(j * this.nx + i); }
        this.bRanges.push({ start: vcount, count: wc.length / 3, cells, base });
        vcount += wc.length / 3; wallGeos.push(side); roofGeos.push(cap);
      } catch { /* degenerate footprint: skip */ }
    });
    const wallsG = mergeGeometries(wallGeos, false)!, roofsG = mergeGeometries(roofGeos, false)!;
    this.bColors = wallsG.getAttribute("color").array as Float32Array;
    const tex = facadeTextures(this.aniso);
    this.walls = new THREE.Mesh(wallsG, new THREE.MeshStandardMaterial({
      vertexColors: true, map: tex.map, emissiveMap: tex.emissive, emissive: new THREE.Color(1, 0.82, 0.55), emissiveIntensity: 1.35, roughness: 0.72, metalness: 0.05, envMapIntensity: 0.6,
    }));
    this.roofs = new THREE.Mesh(roofsG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.02 }));
    for (const m of [this.walls, this.roofs]) { m.castShadow = true; m.receiveShadow = true; this.world.add(m); }
  }

  private buildRoads() {
    const asphaltMajor = roadTexture(true, this.aniso), asphaltMinor = roadTexture(false, this.aniso);
    const build = (filter: (cls: string) => boolean) => {
      const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [], cells: number[] = [];
      let v = 0;
      for (const r of this.ds.roads) {
        if (!filter(r.cls)) continue;
        const pts: [number, number][] = [];
        for (let i = 0; i < r.pts.length - 1; i++) {
          const [x0, y0] = r.pts[i], [x1, y1] = r.pts[i + 1];
          const k = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 7));
          for (let s = 0; s < k; s++) pts.push([x0 + ((x1 - x0) * s) / k, y0 + ((y1 - y0) * s) / k]);
        }
        pts.push(r.pts[r.pts.length - 1]);
        const hw = Math.max(r.width * 0.55, 3), lift = 0.32 + (ROAD_RANK[r.cls] ?? 0.13);
        let along = 0;
        for (let i = 0; i < pts.length; i++) {
          const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
          let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
          if (i > 0) along += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
          const [px, py] = pts[i], nxv = -dy * hw, nyv = dx * hw, z = this.gz(px, py) + lift;
          pos.push(px + nxv, z, -(py + nyv), px - nxv, z, -(py - nyv));
          uv.push(0, along / 12, 1, along / 12); col.push(1, 1, 1, 1, 1, 1);
          const cx = Math.min(this.nx - 1, Math.max(0, Math.floor(px / this.cell))), cy = Math.min(this.ny - 1, Math.max(0, Math.floor(py / this.cell)));
          cells.push(cy * this.nx + cx);
          if (i > 0) { const a0 = v - 2, a1 = v - 1, b0 = v, b1 = v + 1; idx.push(a0, b0, a1, a1, b0, b1); }
          v += 2;
        }
        v += 0;
      }
      const g = new THREE.BufferGeometry(); const colors = new Float32Array(col);
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
      g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uv), 2));
      g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      g.setIndex(idx); g.computeVertexNormals();
      return { g, colors, cells };
    };
    const sets: [ (c: string) => boolean, THREE.Texture ][] = [
      [(c) => c === "primary" || c === "secondary" || c === "tertiary", asphaltMajor],
      [(c) => !(c === "primary" || c === "secondary" || c === "tertiary"), asphaltMinor],
    ];
    for (const [f, map] of sets) {
      const { g, colors, cells } = build(f);
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = true; this.world.add(mesh);
      this.roadSets.push({ mesh, colors, cells }); this.roadMats.push(mat);
    }
    // pavements: slightly wider, lighter ribbons just under the asphalt
    const pos: number[] = [], idx: number[] = [], col: number[] = []; let v = 0;
    for (const r of this.ds.roads) {
      if (r.cls === "service") continue;
      const hw = Math.max(r.width * 0.55, 3) + 2.4;
      const pts: [number, number][] = [];
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [x0, y0] = r.pts[i], [x1, y1] = r.pts[i + 1]; const k = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 7));
        for (let s = 0; s < k; s++) pts.push([x0 + ((x1 - x0) * s) / k, y0 + ((y1 - y0) * s) / k]);
      }
      pts.push(r.pts[r.pts.length - 1]);
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
        const [px, py] = pts[i], z = this.gz(px, py) + 0.2;
        pos.push(px - dy * hw, z, -(py + dx * hw), px + dy * hw, z, -(py - dx * hw)); col.push(0.55, 0.56, 0.58, 0.55, 0.56, 0.58);
        if (i > 0) idx.push(v - 2, v, v - 1, v - 1, v, v + 1);
        v += 2;
      }
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3)); wg.setAttribute("color", new THREE.BufferAttribute(new Float32Array(col), 3));
    wg.setIndex(idx); wg.computeVertexNormals();
    this.walkMesh = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    this.walkMesh.receiveShadow = true; this.world.add(this.walkMesh);
  }

  /** Decorative vegetation on unmapped open ground. NOT data - there is no tree layer in the dataset. */
  private buildTrees() {
    const { nx, ny } = this, bm = this.ds.grid.building_mask, rm = this.ds.grid.road_mask;
    const spots: [number, number, number, number][] = [];
    const near = (arr: number[], i: number, j: number) => { for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < nx && b < ny && arr[b * nx + a]) return true; } return false; };
    for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const k = j * nx + i;
      if (bm[k] || rm[k] || near(rm, i, j) || rnd(k * 3 + 1) > 0.085) continue;
      const x = (i + 0.2 + rnd(k + 5) * 0.6) * this.cell, y = (j + 0.2 + rnd(k + 9) * 0.6) * this.cell;
      spots.push([x, y, 2.3 + rnd(k + 2) * 2.0, rnd(k + 4)]);
    }
    const n = Math.min(spots.length, 900);
    const canopy = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 0.9 }), n);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 1, 6), new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1 }), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const [x, y, r, t] = spots[i], z = this.gz(x, y), trunkH = 1.8 + r * 0.45;
      m.compose(new THREE.Vector3(x, z + trunkH + r * 0.55, -y), q, new THREE.Vector3(r, r * 0.8, r)); canopy.setMatrixAt(i, m);
      c.setRGB(0.1 + t * 0.12, 0.26 + t * 0.16, 0.1 + t * 0.05); canopy.setColorAt(i, c);
      m.compose(new THREE.Vector3(x, z + trunkH / 2, -y), q, new THREE.Vector3(1, trunkH, 1)); trunk.setMatrixAt(i, m);
    }
    for (const mesh of [canopy, trunk]) { mesh.castShadow = true; mesh.receiveShadow = true; this.trees.add(mesh); }
    this.world.add(this.trees);
  }

  private buildWater() {
    const { nx, ny, cell } = this, n = nx * ny;
    this.waterPos = new Float32Array(n * 3); this.waterDepth = new Float32Array(n); this.waterFlow = new Float32Array(n * 2); this.H2 = new Float32Array(n);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      this.waterPos[k * 3] = (i + 0.5) * cell; this.waterPos[k * 3 + 1] = this.demY[k] - 1; this.waterPos[k * 3 + 2] = -(j + 0.5) * cell;
    }
    const idx: number[] = [];
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.waterPos, 3));
    g.setAttribute("aDepth", new THREE.BufferAttribute(this.waterDepth, 1));
    g.setAttribute("aFlow", new THREE.BufferAttribute(this.waterFlow, 2));
    g.setIndex(idx);
    this.waterMat = new THREE.ShaderMaterial({
      vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uRain: { value: 0 }, uSun: { value: this.sun.position.clone().sub(this.sun.target.position).normalize() } },
    });
    this.water = new THREE.Mesh(g, this.waterMat); this.water.renderOrder = 5; this.water.frustumCulled = false;
    this.world.add(this.water);
  }

  private buildInlets() {
    const n = this.ds.inlets.length;
    this.inletMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(4.6, 4.6, 2.2, 18), new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.3, emissive: 0x1a1a1a }), n);
    const m = new THREE.Matrix4();
    this.ds.inlets.forEach((inl, i) => {
      m.makeTranslation(inl.x, this.gz(inl.x, inl.y) + 0.9, -inl.y); this.inletMesh.setMatrixAt(i, m);
      this.inletMesh.setColorAt(i, new THREE.Color(0x22d3ee));
    });
    this.inletMesh.renderOrder = 6; this.world.add(this.inletMesh);
  }

  private buildFacilities() {
    for (const f of this.ds.facilities) {
      const g = new THREE.Group();
      const color = FAC_COLORS[f.category] ?? FAC_COLORS.other;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 20, 8), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3 }));
      stem.position.y = 10;
      const head = new THREE.Mesh(new THREE.SphereGeometry(f.category === "health" ? 5.2 : 4.2, 18, 14), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.75, roughness: 0.4 }));
      head.position.y = 22;
      g.add(stem, head);
      g.position.set(f.x, this.gz(f.x, f.y), -f.y);
      g.userData = { kind: "facility", id: f.id }; stem.userData = head.userData = g.userData;
      this.facGroup.add(g);
    }
  }

  private buildRain() {
    const N = 3200;
    this.rainPos = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) {
      const x = Math.random() * this.W, z = -Math.random() * this.H, y = Math.random() * 520;
      this.rainPos.set([x, y, z, x - 1.5, y + 17, z + 1], i * 6);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xb4d4ff, transparent: true, opacity: 0, fog: false }));
    this.rain.visible = false; this.rain.frustumCulled = false; this.scene.add(this.rain);
  }

  private buildSelection() {
    const zs = this.ds.zones.size_m;
    this.selBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(zs, 60, zs)), new THREE.LineBasicMaterial({ color: 0x38bdf8 }));
    this.selBox.visible = false; this.world.add(this.selBox);
  }

  // ------------------------------------------------------------------ public setters
  setLayers(l: Layers) {
    this.walls.visible = l.buildings; this.roofs.visible = l.buildings;
    for (const r of this.roadSets) r.mesh.visible = l.roads; this.walkMesh.visible = l.roads;
    this.inletMesh.visible = l.drains; this.facGroup.visible = l.facilities; this.water.visible = l.water; this.pumpGroup.visible = l.pumps;
    this.trees.visible = l.trees;
    this.layerRain = l.rain; this.rain.visible = l.rain && this.rainIntensity > 0.02;
  }

  setRisk(mode: "off" | "index" | "delta", res: ScenarioResult, base: ScenarioResult) {
    const { nx, ny, cell } = this, zs = this.ds.zones.size_m, nzx = this.ds.zones.nx, nzy = this.ds.zones.ny;
    const vals = new Float32Array(nzx * nzy);
    res.zones.forEach((z, i) => { vals[i] = mode === "delta" ? z.index - base.zones[i].index : z.index; });
    const sample = (x: number, y: number) => {
      const gx = Math.min(nzx - 1.0001, Math.max(0, x / zs - 0.5)), gy = Math.min(nzy - 1.0001, Math.max(0, y / zs - 0.5));
      const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
      const v = (i: number, j: number) => vals[j * nzx + i];
      return v(x0, y0) * (1 - fx) * (1 - fy) + v(x0 + 1, y0) * fx * (1 - fy) + v(x0, y0 + 1) * (1 - fx) * fy + v(x0 + 1, y0 + 1) * fx * fy;
    };
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      let r = this.baseColors[k * 3], g = this.baseColors[k * 3 + 1], b = this.baseColors[k * 3 + 2];
      if (mode !== "off") {
        const v = sample((i + 0.5) * cell, (j + 0.5) * cell);
        if (mode === "index") {
          const [hr, hg, hb] = indexColor(v); const m = 0.74; r = r * (1 - m) + hr * m; g = g * (1 - m) + hg * m; b = b * (1 - m) + hb * m;
        } else {
          const m = Math.min(0.8, Math.abs(v) / 14); const [hr, hg, hb] = v >= 0 ? [0.95, 0.25, 0.2] : [0.15, 0.8, 0.7];
          r = r * (1 - m) + hr * m; g = g * (1 - m) + hg * m; b = b * (1 - m) + hb * m;
        }
      }
      this.terrainColors[k * 3] = r; this.terrainColors[k * 3 + 1] = g; this.terrainColors[k * 3 + 2] = b;
    }
    (this.terrain.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
  }

  setInlets(open: boolean[], overrides: Record<string, string>) {
    const c = new THREE.Color();
    this.ds.inlets.forEach((inl, i) => {
      if (!open[i]) c.set(0xef4444); else if (overrides[inl.id] === "cleared") c.set(0x4ade80); else c.set(0x22d3ee);
      this.inletMesh.setColorAt(i, c);
    });
    if (this.inletMesh.instanceColor) this.inletMesh.instanceColor.needsUpdate = true;
  }

  setPumps(sites: { x: number; y: number }[]) {
    this.pumpGroup.clear();
    for (const s of sites) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(7), new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xfacc15, emissiveIntensity: 0.7 }));
      m.position.set(s.x, this.gz(s.x, s.y) + 14, -s.y); this.pumpGroup.add(m);
    }
  }

  setRainIntensity(norm: number) {
    this.rainIntensity = norm;
    (this.rain.material as THREE.LineBasicMaterial).opacity = Math.min(0.55, 0.1 + norm * 0.5);
    this.rain.visible = this.layerRain && norm > 0.02;
    this.waterMat.uniforms.uRain.value = norm;
  }

  setRoadThreshold(t: number) { this.roadThreshold = t; }

  /** depth in metres per cell */
  setDepth(depth: Float32Array, now = performance.now()) {
    const { nx, ny, cell } = this, n = nx * ny, wp = this.waterPos, wd = this.waterDepth, wf = this.waterFlow, H = this.H2;
    for (let k = 0; k < n; k++) H[k] = this.demGrid[k] + depth[k];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, d = depth[k];
      if (d < 0.004) { wp[k * 3 + 1] = this.demY[k] - 1; wd[k] = 0; wf[k * 2] = wf[k * 2 + 1] = 0; continue; }
      wp[k * 3 + 1] = this.demY[k] + d + 0.35; wd[k] = d;
      const xm = i > 0 ? k - 1 : k, xp = i < nx - 1 ? k + 1 : k, ym = j > 0 ? k - nx : k, yp = j < ny - 1 ? k + nx : k;
      const gx = (H[xp] - H[xm]) / (2 * cell), gy = (H[yp] - H[ym]) / (2 * cell); // gy: per +y (north) = -z
      const mag = Math.hypot(gx, gy);
      const speed = Math.min(1, mag * 70);
      if (mag < 1e-6) { wf[k * 2] = wf[k * 2 + 1] = 0; } else { wf[k * 2] = (-gx / mag) * speed; wf[k * 2 + 1] = (gy / mag) * speed; } // world z = -y
    }
    (this.water.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.water.geometry.getAttribute("aDepth") as THREE.BufferAttribute).needsUpdate = true;
    (this.water.geometry.getAttribute("aFlow") as THREE.BufferAttribute).needsUpdate = true;
    if (now - this.lastColor > 220) { this.lastColor = now; this.tintByDepth(depth); }
    if (now - this.lastHot > 500) { this.lastHot = now; this.updateHotspots(depth); }
  }

  private tintByDepth(depth: Float32Array) {
    const thr = this.roadThreshold;
    for (const b of this.bRanges) {
      let m = 0; for (const c of b.cells) if (depth[c] > m) m = depth[c];
      let [r, g, bl] = b.base;
      if (m >= 0.5) { r = 1.0; g = 0.28; bl = 0.25; } else if (m >= 0.15) { r = 1.0; g = 0.66; bl = 0.25; }
      for (let i = 0; i < b.count; i++) { const o = (b.start + i) * 3; this.bColors[o] = r; this.bColors[o + 1] = g; this.bColors[o + 2] = bl; }
    }
    (this.walls.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
    for (const set of this.roadSets) {
      for (let s = 0; s < set.cells.length; s++) {
        const d = depth[set.cells[s]];
        let r = 1, g = 1, b = 1;
        if (d >= thr) { r = 1; g = 0.3; b = 0.3; } else if (d >= 0.1) { r = 1; g = 0.72; b = 0.35; }
        for (let q = 0; q < 2; q++) { const o = (s * 2 + q) * 3; set.colors[o] = r; set.colors[o + 1] = g; set.colors[o + 2] = b; }
      }
      (set.mesh.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  private updateHotspots(depth: Float32Array) {
    for (const h of this.hotspots) h.removeFromParent();
    this.hotspots = [];
    const picks: { k: number; d: number }[] = [];
    const order = Array.from({ length: depth.length }, (_, i) => i).filter((i) => depth[i] > 0.3).sort((a, b) => depth[b] - depth[a]);
    for (const k of order) {
      const x = (k % this.nx) * this.cell, y = Math.floor(k / this.nx) * this.cell;
      if (picks.every((p) => Math.hypot(((p.k % this.nx) * this.cell) - x, Math.floor(p.k / this.nx) * this.cell - y) > 160)) picks.push({ k, d: depth[k] });
      if (picks.length >= 3) break;
    }
    for (const p of picks) {
      const el = document.createElement("div"); el.className = "depth-pin"; el.innerHTML = `<b>${p.d.toFixed(1)}</b><span>m</span>`;
      const o = new CSS2DObject(el);
      o.position.set(((p.k % this.nx) + 0.5) * this.cell, this.demY[p.k] + p.d + 14, -(Math.floor(p.k / this.nx) + 0.5) * this.cell);
      this.world.add(o); this.hotspots.push(o);
    }
  }

  setRoute(path: [number, number][] | null, ok: boolean) {
    if (this.routeMesh) { this.routeMesh.removeFromParent(); this.routeMesh.geometry.dispose(); this.routeMesh = null; }
    if (!path || path.length < 2) return;
    const pts = path.map(([x, y]) => new THREE.Vector3(x, this.gz(x, y) + 3.5, -y));
    const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.05);
    this.routeMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.min(600, pts.length * 3), 2.6, 6, false), new THREE.MeshBasicMaterial({ color: ok ? 0x4ade80 : 0xfacc15, fog: false }));
    this.routeMesh.renderOrder = 8; this.world.add(this.routeMesh);
  }

  setSelected(z: Zone | null) {
    if (!z) { this.selBox.visible = false; return; }
    this.selBox.visible = true; this.selBox.position.set(z.cx, z.mean_elev * EX + 28, -z.cy);
  }

  // ------------------------------------------------------------------ camera
  private cur(): View {
    const s = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target));
    return { th: s.theta, ph: s.phi, r: s.radius, tg: this.controls.target.clone() };
  }
  private setViewNow(v: View) {
    this.controls.target.copy(v.tg);
    this.camera.position.copy(v.tg).add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(v.r, v.ph, v.th)));
    this.camera.lookAt(v.tg); this.controls.update();
  }
  private animateTo(p: Partial<View>, ms = 520) {
    const from = this.cur(); const base = this.goal(); const to: View = { ...base, ...p, tg: (p.tg ?? base.tg).clone() };
    let d = to.th - from.th; d = ((((d + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI; to.th = from.th + d;
    to.ph = Math.min(MAX_POLAR, Math.max(MIN_POLAR, to.ph)); to.r = Math.min(MAX_DIST, Math.max(MIN_DIST, to.r));
    this.tw = { t0: performance.now(), dur: ms, from, to };
  }
  private stepTween(now: number) {
    if (!this.tw) return;
    const { t0, dur, from, to } = this.tw; const k = Math.min(1, (now - t0) / dur), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    const L = (a: number, b: number) => a + (b - a) * e;
    this.setViewNow({ th: L(from.th, to.th), ph: L(from.ph, to.ph), r: L(from.r, to.r), tg: from.tg.clone().lerp(to.tg, e) });
    if (k >= 1) this.tw = null;
  }

  /** where the camera is heading (so repeated/held clicks accumulate instead of cancelling each other) */
  private goal(): View { return this.tw ? this.tw.to : this.cur(); }

  nav: NavApi = {
    zoomIn: () => this.animateTo({ r: this.goal().r * 0.78 }, 180),
    zoomOut: () => this.animateTo({ r: this.goal().r * 1.28 }, 180),
    rotate: (d) => this.animateTo({ th: this.goal().th + d * (Math.PI / 10) }, 170),
    tilt: (d) => this.animateTo({ ph: this.goal().ph - d * 0.12 }, 170),
    north: () => this.animateTo({ th: 0 }, 500),
    reset: () => this.resetView("persp"),
    top: () => this.resetView("top"),
    onBearing: (cb) => { this.bearingCbs.add(cb); cb(this.controls.getAzimuthalAngle()); return () => { this.bearingCbs.delete(cb); }; },
  };

  resetView(mode: "persp" | "top") {
    const tg = new THREE.Vector3(this.W / 2 + 120, 20, -this.H / 2);
    if (mode === "top") this.animateTo({ tg, th: 0, ph: MIN_POLAR, r: 2300 }, 700);
    else this.animateTo({ tg, th: 0.26, ph: 1.0, r: 1850 }, 700);
  }
  setAutoRotate(b: boolean) { this.controls.autoRotate = b; this.controls.autoRotateSpeed = 0.5; }

  // ------------------------------------------------------------------ interaction
  private onDown = (e: PointerEvent) => { this.tw = null; this.container.focus({ preventScroll: true }); this.downPos = { x: e.clientX, y: e.clientY, t: performance.now() }; };
  private onUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - this.downPos.x, e.clientY - this.downPos.y) > 5 || performance.now() - this.downPos.t > 500) return;
    const hit = this.pick(e);
    if (!hit) return;
    if (hit.kind === "inlet") this.cb.onInlet(hit.id);
    else if (hit.kind === "facility") { const f = this.ds.facilities.find((q) => q.id === hit.id); if (f) this.cb.onZone(this.zoneAt(f.x, f.y)); }
    else this.cb.onZone(hit.id);
  };
  private onMove = (e: PointerEvent) => {
    const now = performance.now(); if (now - this.hoverT < 50) return; this.hoverT = now;
    if (e.buttons) { this.cb.onHover(null, 0, 0); return; }
    const hit = this.pick(e); const r = this.container.getBoundingClientRect();
    this.cb.onHover(hit ? hit.info : null, e.clientX - r.left, e.clientY - r.top);
  };
  /** double-click: fly the camera to look at that spot, closer */
  private onDbl = (e: MouseEvent) => {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    const t = this.ray.intersectObject(this.terrain)[0];
    if (t) this.animateTo({ tg: new THREE.Vector3(t.point.x, Math.max(0, t.point.y), t.point.z), r: Math.max(260, this.cur().r * 0.5) }, 650);
  };
  private onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === "INPUT") return;
    const k = e.key.toLowerCase(), c = this.goal();
    const pan = (fx: number, fz: number) => {
      const step = c.r * 0.12, f = new THREE.Vector2(-Math.sin(c.th), -Math.cos(c.th)), rt = new THREE.Vector2(Math.cos(c.th), -Math.sin(c.th));
      const tg = c.tg.clone(); tg.x += (f.x * fz + rt.x * fx) * step; tg.z += (f.y * fz + rt.y * fx) * step; this.animateTo({ tg }, 160);
    };
    const map: Record<string, () => void> = {
      arrowleft: () => this.nav.rotate(-1), arrowright: () => this.nav.rotate(1), arrowup: () => this.nav.tilt(1), arrowdown: () => this.nav.tilt(-1),
      q: () => this.nav.rotate(-1), e: () => this.nav.rotate(1), "+": () => this.nav.zoomIn(), "=": () => this.nav.zoomIn(), "-": () => this.nav.zoomOut(), _: () => this.nav.zoomOut(),
      w: () => pan(0, 1), s: () => pan(0, -1), a: () => pan(-1, 0), d: () => pan(1, 0), n: () => this.nav.north(), "0": () => this.nav.reset(), t: () => this.nav.top(),
    };
    if (map[k]) { e.preventDefault(); map[k](); }
  };
  zoneAt(x: number, y: number): string | null {
    const zs = this.ds.zones.size_m, ix = Math.floor(x / zs), iy = Math.floor(y / zs);
    if (ix < 0 || iy < 0 || ix >= this.ds.zones.nx || iy >= this.ds.zones.ny) return null;
    return `zone_${String(iy * this.ds.zones.nx + ix).padStart(3, "0")}`;
  }

  private pick(e: PointerEvent): { kind: "facility" | "inlet" | "zone"; id: string; info: HoverInfo | null } | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    if (this.inletMesh.visible) {
      const h = this.ray.intersectObject(this.inletMesh)[0];
      if (h && h.instanceId != null) { const id = this.ds.inlets[h.instanceId].id; return { kind: "inlet", id, info: this.hoverFormatter("inlet", id) }; }
    }
    if (this.facGroup.visible) {
      const h = this.ray.intersectObjects(this.facGroup.children, true)[0];
      if (h) { const id = (h.object.userData.id ?? h.object.parent?.userData.id) as string; return { kind: "facility", id, info: this.hoverFormatter("facility", id) }; }
    }
    const t = this.ray.intersectObject(this.terrain)[0];
    if (t) { const id = this.zoneAt(t.point.x, -t.point.z); if (id) return { kind: "zone", id, info: this.hoverFormatter("zone", id) }; }
    return null;
  }

  // ------------------------------------------------------------------ loop
  private resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h); this.labels.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now(), dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    this.stepTween(now);
    this.controls.update();
    // keep the focus point over the model so panning can never lose the city
    const tg = this.controls.target, cl = new THREE.Vector3(Math.min(this.W, Math.max(0, tg.x)), Math.min(160, Math.max(0, tg.y)), Math.min(0, Math.max(-this.H, tg.z)));
    if (!cl.equals(tg)) { const d = cl.clone().sub(tg); tg.copy(cl); this.camera.position.add(d); }
    const th = this.controls.getAzimuthalAngle();
    if (!(Math.abs(th - this.lastTheta) < 1e-4)) { this.lastTheta = th; this.bearingCbs.forEach((f) => f(th)); }
    this.onFrame?.(dt);
    this.waterMat.uniforms.uTime.value = now / 1000;
    this.wet += ((this.rainIntensity > 0.05 ? 1 : 0) - this.wet) * Math.min(1, dt * 0.25);
    for (const m of this.roadMats) { m.roughness = 0.9 - 0.5 * this.wet; m.color.setScalar(1 - 0.3 * this.wet); }
    this.terrainMat.color.setScalar(1 - 0.22 * this.wet);
    if (this.rain.visible) {
      const a = this.rainPos, sp = 380 + this.rainIntensity * 260;
      for (let i = 0; i < a.length; i += 6) { let y = a[i + 1] - sp * dt; if (y < -5) y += 520; a[i + 1] = y; a[i + 4] = y + 17; }
      (this.rain.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    }
    this.pumpGroup.children.forEach((m) => { m.rotation.y += dt * 1.6; });
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf); this.ro.disconnect(); this.controls.dispose();
    this.container.removeEventListener("keydown", this.onKey);
    this.renderer.dispose();
    this.renderer.domElement.remove(); this.labels.domElement.remove();
    this.scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); });
  }
}

interface View { th: number; ph: number; r: number; tg: THREE.Vector3 }
