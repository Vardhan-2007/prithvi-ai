import { useEffect, useRef } from "react";
import { useT } from "./i18n/i18n";

/** Camera/map navigation contract implemented by both the 3D scene and the 2D map. */
export interface NavApi {
  zoomIn(): void; zoomOut(): void;
  rotate(dir: -1 | 1): void; tilt(dir: -1 | 1): void;
  north(): void; reset(): void; top(): void;
  /** angle (radians, clockwise) at which geographic north appears on screen; called on every change */
  onBearing(cb: (northAngleRad: number) => void): () => void;
}

const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function useHold(fn: () => void) {
  const timer = useRef<number | undefined>(undefined);
  const stop = () => { window.clearInterval(timer.current); timer.current = undefined; };
  useEffect(() => stop, []);
  return {
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); fn(); stop(); timer.current = window.setInterval(fn, 130); },
    onPointerUp: stop, onPointerLeave: stop, onPointerCancel: stop,
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } },
  };
}

function HoldBtn({ fn, label, children }: { fn: () => void; label: string; children: React.ReactNode }) {
  const h = useHold(fn);
  return <button className="nav-btn" aria-label={label} title={label} {...h}>{children}</button>;
}

export function NavPad({ api, mode }: { api: NavApi; mode: "3d" | "2d" }) {
  const t = useT();
  const dial = useRef<SVGGElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  useEffect(() => api.onBearing((a) => {
    const deg = (a * 180) / Math.PI;
    dial.current?.setAttribute("transform", `rotate(${deg.toFixed(1)} 28 28)`);
    const heading = (((-deg % 360) + 360) % 360); // direction the view is facing
    if (label.current) label.current.textContent = `${Math.round(heading)}° ${DIRS[Math.round(heading / 45) % 8]}`;
  }), [api]);
  return (
    <div className="navpad" role="group" aria-label={t("nav.title")}>
      <button className="compass" onClick={() => api.north()} aria-label={t("nav.north")} title={t("nav.northHint")}>
        <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden>
          <circle cx="28" cy="28" r="26" fill="#0a1226ee" stroke="#2a3d68" strokeWidth="1.5" />
          <g ref={dial}>
            {Array.from({ length: 24 }, (_, i) => (
              <line key={i} x1="28" y1="3.5" x2="28" y2={i % 6 === 0 ? 8.5 : 6} stroke={i === 0 ? "#ef4444" : "#51668f"} strokeWidth={i % 6 === 0 ? 1.6 : 1} transform={`rotate(${i * 15} 28 28)`} />
            ))}
            <polygon points="28,10 33,28 23,28" fill="#ef4444" />
            <polygon points="28,46 33,28 23,28" fill="#cbd5e1" />
            <text x="28" y="21" textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff" stroke="#0a1226" strokeWidth="2" paintOrder="stroke">N</text>
          </g>
          <circle cx="28" cy="28" r="2.4" fill="#0a1226" stroke="#e2e8f0" strokeWidth="1" />
        </svg>
      </button>
      <span ref={label} className="compass-label">0° N</span>
      <div className="nav-grid">
        <HoldBtn fn={api.zoomIn} label={t("nav.zoomIn")}>＋</HoldBtn>
        <HoldBtn fn={api.zoomOut} label={t("nav.zoomOut")}>－</HoldBtn>
        <HoldBtn fn={() => api.rotate(-1)} label={t("nav.rotL")}>⟲</HoldBtn>
        <HoldBtn fn={() => api.rotate(1)} label={t("nav.rotR")}>⟳</HoldBtn>
        <HoldBtn fn={() => api.tilt(1)} label={t("nav.tiltUp")}>▲</HoldBtn>
        <HoldBtn fn={() => api.tilt(-1)} label={t("nav.tiltDown")}>▼</HoldBtn>
        <button className="nav-btn" onClick={api.top} aria-label={t("nav.top")} title={t("nav.top")}>⊞</button>
        <button className="nav-btn" onClick={api.reset} aria-label={t("nav.reset")} title={t("nav.reset")}>⌂</button>
      </div>
      <div className="nav-hint">{t(mode === "3d" ? "nav.hint3d" : "nav.hint2d")}</div>
    </div>
  );
}
