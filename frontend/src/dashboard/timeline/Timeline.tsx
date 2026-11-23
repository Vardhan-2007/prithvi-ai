import { useEffect, useRef } from "react";
import { useStore } from "../../store";
import { simData, seek, totalSeconds, frontierSeconds, onSimUpdate, scenarioStorm } from "../../maps/twin3d/sim/simController";
import { stormPeakMmH, stormRateMmH } from "../../maps/twin3d/sim/storm";
import { useT } from "../../components/i18n/i18n";

const SPEEDS = [150, 300, 600, 1200, 2400];
const fmt = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;

export function Timeline() {
  const t = useT();
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useStore((s) => s.live);
  const playing = useStore((s) => s.playing);
  const speed = useStore((s) => s.speed);
  const scenario = useStore((s) => s.scenario);
  const setPlaying = useStore((s) => s.setPlaying);
  const setSpeed = useStore((s) => s.setSpeed);
  const routeThreshold = useStore((s) => s.routeThreshold);

  const draw = () => {
    const c = canvas.current; if (!c) return;
    const dpr = Math.min(window.devicePixelRatio, 2), w = c.clientWidth, h = c.clientHeight;
    if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
    const g = c.getContext("2d")!; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const total = totalSeconds() || 1, front = frontierSeconds(), head = simData.playhead;
    const storm = scenarioStorm(scenario);
    const n = Math.floor(w / 5), peak = stormPeakMmH(storm);
    for (let i = 0; i < n; i++) {
      const ts = ((i + 0.5) / n) * total, r = stormRateMmH(storm, ts);
      const bh = 6 + (r / Math.max(peak, 1)) * (h - 26);
      g.fillStyle = ts <= head ? "#ef4444" : ts <= front ? "#566079" : "#2a3246";
      g.fillRect(i * 5, h - 14 - bh, 2.4, bh);
    }
    const x = (head / total) * w;
    g.fillStyle = "#fff"; g.fillRect(x - 1, 0, 2, h - 12);
    g.fillStyle = "#94a3b8"; g.font = "10px ui-sans-serif, system-ui"; g.textBaseline = "alphabetic";
    for (let hr = 0; hr * 3600 <= total; hr += Math.max(1, Math.round(total / 3600 / 8))) {
      const tx = (hr * 3600 / total) * w; g.fillText(`${hr}h`, Math.min(w - 16, tx + 2), h - 2);
    }
  };
  useEffect(() => { draw(); });
  useEffect(() => onSimUpdate(draw), [scenario]); // eslint-disable-line react-hooks/exhaustive-deps

  const pointerSeek = (e: React.PointerEvent) => {
    const c = canvas.current!, r = c.getBoundingClientRect();
    seek(((e.clientX - r.left) / r.width) * totalSeconds());
  };

  return (
    <footer className="timeline">
      <div className="tl-stats">
        <Stat v={live ? live.floodedHa.toFixed(1) : "–"} u="ha" l={t("stat.flooded")} />
        <Stat v={live ? live.maxDepth.toFixed(2) : "–"} u="m" l={t("stat.maxDepth")} />
        <Stat v={live ? String(live.floodedBuildings) : "–"} l={t("stat.buildings")} />
        <Stat v={live ? live.roadKmAffected.toFixed(1) : "–"} u="km" l={t("stat.roads", { thr: routeThreshold.toFixed(2) })} />
        <Stat v={live ? String(live.facilitiesAffected) : "–"} l={t("stat.facilities")} />
        <Stat v={live ? live.rainMmH.toFixed(0) : "–"} u="mm/h" l={t("stat.rain")} />
        <Stat v={live ? live.cumRainMm.toFixed(0) : "–"} u="mm" l={t("stat.cum")} />
        <Stat v={live ? (live.drainedM3 / 1000).toFixed(0) : "–"} u="k m³" l={t("stat.drained")} />
      </div>
      <div className="tl-main">
        <button className="play" aria-label={playing ? "Pause" : "Play"} onClick={() => {
          if (!playing && simData.playhead >= totalSeconds() - 1) seek(0);
          setPlaying(!playing);
        }}>{playing ? "❚❚" : "▶"}</button>
        <div className="tl-scrub">
          <canvas ref={canvas} onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); pointerSeek(e); }} onPointerMove={(e) => { if (e.buttons) pointerSeek(e); }} />
          <div className="tl-times"><span>{fmt(live?.t ?? 0)} / {fmt(totalSeconds())}</span>
            <span className="muted">{t("tl.computed", { p: Math.round((Math.min(1, frontierSeconds() / (totalSeconds() || 1))) * 100) })}</span></div>
        </div>
        <label className="speed">{t("tl.speed")}
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {SPEEDS.map((s) => <option key={s} value={s}>{s / 60 >= 1 ? `${s / 60} min/s` : `${s} s/s`}</option>)}
          </select>
        </label>
      </div>
    </footer>
  );
}

function Stat({ v, u, l }: { v: string; u?: string; l: string }) {
  return <div className="stat"><div className="stat-v">{v}{u ? <small>{u}</small> : null}</div><div className="stat-l">{l}</div></div>;
}
