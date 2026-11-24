import { useEffect, useRef } from "react";
import { useStore } from "../../store";
import { simData, seek, totalSeconds, frontierSeconds, onSimUpdate } from "../../maps/twin3d/sim/simController";
import { rainRateMmH } from "../../maps/twin3d/sim/floodSolver";
import { useT } from "../../components/i18n/i18n";
import type { LiveStats } from "../../maps/twin3d/sim/liveStats";

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

  const draw = () => {
    const c = canvas.current; if (!c) return;
    const dpr = Math.min(window.devicePixelRatio, 2), w = c.clientWidth, h = c.clientHeight;
    if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
    const g = c.getContext("2d")!; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const total = totalSeconds() || 1, front = frontierSeconds(), head = simData.playhead;
    const n = Math.floor(w / 5), peak = (2 * scenario.rainfallMm) / scenario.durationH;
    for (let i = 0; i < n; i++) {
      const ts = ((i + 0.5) / n) * total, r = rainRateMmH(ts, scenario.rainfallMm, scenario.durationH);
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
      <div className="tl-status" aria-live="polite">{status(t, live, scenario)}</div>
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

/** One plain sentence about what is happening right now (replaces the row of number boxes). */
function status(t: (k: string, p?: Record<string, string | number>) => string, live: LiveStats | null, sc: { durationH: number }): string {
  if (!live) return "";
  const D = sc.durationH * 3600, parts: string[] = [];
  if (live.cumRainMm < 0.3) return t("st.dry");
  if (live.t < D) parts.push(t(live.t < D / 2 ? "st.rising" : "st.easing", { r: Math.round(live.rainMmH) }));
  else if (live.floodedHa < 0.05) return t("st.done");   // nothing is ankle-deep any more
  else parts.push(t("st.after"));
  parts.push(live.floodedHa >= 0.05 ? t("st.water", { ha: live.floodedHa.toFixed(1), d: live.maxDepth.toFixed(1) }) : live.t < D ? t("st.none") : "");
  if (live.facilitiesAffected > 0) parts.push(t("st.fac", { n: live.facilitiesAffected }));
  return parts.filter(Boolean).join(" ");
}
