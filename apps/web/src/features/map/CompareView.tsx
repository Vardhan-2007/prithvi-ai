import { useEffect, useMemo, useRef } from "react";
import { useStore } from "../../app/store";
import { useT } from "../../shared/utils/i18n";
import { BAND_COLORS, exposureSummary, indexColor } from "../../shared/engine/risk";
import type { Band, Dataset, ScenarioResult } from "../../shared/engine/types";

type Kind = "baseline" | "scenario" | "delta";
const BANDS: Band[] = ["lower", "moderate", "higher", "highest"];

function Panel({ kind, ds, res, base, title }: { kind: Kind; ds: Dataset; res: ScenarioResult; base: ScenarioResult; title: string }) {
  const c = useRef<HTMLCanvasElement>(null); const sel = useStore((s) => s.selectedZoneId);
  const select = useStore((s) => s.selectZone);
  useEffect(() => {
    const cv = c.current!, p = cv.parentElement!;
    const draw = () => {
      const dpr = Math.min(devicePixelRatio, 2), w = p.clientWidth, h = p.clientHeight - 28;
      if (w < 10 || h < 10) return;
      cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + "px"; cv.style.height = h + "px";
      const g = cv.getContext("2d")!; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = "#0a0f1c"; g.fillRect(0, 0, w, h);
      const [W, H] = ds.meta.size_m, sc = Math.min(w / W, h / H), ox = (w - W * sc) / 2, oy = (h - H * sc) / 2;
      const X = (x: number) => ox + x * sc, Y = (y: number) => oy + (H - y) * sc, zs = ds.zones.size_m;
      ds.zones.zones.forEach((z, i) => {
        const v = kind === "baseline" ? base.zones[i].index : kind === "scenario" ? res.zones[i].index : res.zones[i].index - base.zones[i].index;
        let col: string;
        if (kind === "delta") { const m = Math.min(1, Math.abs(v) / 14); col = v >= 0 ? `rgba(244,63,94,${0.15 + m * 0.8})` : `rgba(45,212,191,${0.15 + m * 0.8})`; }
        else { const [r, gg, b] = indexColor(v); col = `rgb(${r * 255 | 0},${gg * 255 | 0},${b * 255 | 0})`; }
        g.fillStyle = col; g.fillRect(X(z.ix * zs), Y(Math.min(H, (z.iy + 1) * zs)), zs * sc + 0.6, Math.min(zs, H - z.iy * zs) * sc + 0.6);
      });
      g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 0.8;
      for (const r of ds.roads) { g.beginPath(); r.pts.forEach(([x, y], k) => (k ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.stroke(); }
      for (const f of ds.facilities) { g.fillStyle = f.category === "health" ? "#fff" : "#ffd166"; g.beginPath(); g.arc(X(f.x), Y(f.y), 2.6, 0, 7); g.fill(); }
      const z = ds.zones.zones.find((q) => q.id === sel);
      if (z) { g.strokeStyle = "#38bdf8"; g.lineWidth = 2; g.strokeRect(X(z.ix * zs), Y(Math.min(H, (z.iy + 1) * zs)), zs * sc, Math.min(zs, H - z.iy * zs) * sc); }
    };
    draw(); const ro = new ResizeObserver(draw); ro.observe(p); return () => ro.disconnect();
  }, [ds, res, base, kind, sel]);
  const onClick = (e: React.MouseEvent) => {
    const cv = c.current!, r = cv.getBoundingClientRect(), [W, H] = ds.meta.size_m, sc = Math.min(r.width / W, r.height / H);
    const ox = (r.width - W * sc) / 2, oy = (r.height - H * sc) / 2;
    const x = (e.clientX - r.left - ox) / sc, y = H - (e.clientY - r.top - oy) / sc;
    const ix = Math.floor(x / ds.zones.size_m), iy = Math.floor(y / ds.zones.size_m);
    if (ix >= 0 && iy >= 0 && ix < ds.zones.nx && iy < ds.zones.ny) select(`zone_${String(iy * ds.zones.nx + ix).padStart(3, "0")}`);
  };
  return <div className="cmp-panel"><div className="cmp-title">{title}</div><canvas ref={c} onClick={onClick} /></div>;
}

export function CompareView() {
  const t = useT();
  const ds = useStore((s) => s.ds)!; const res = useStore((s) => s.result)!; const base = useStore((s) => s.baseline)!; const sc = useStore((s) => s.scenario);
  const eb = useMemo(() => exposureSummary(ds, base), [ds, base]); const es = useMemo(() => exposureSummary(ds, res), [ds, res]);
  const rows: [string, string, string][] = [
    [t("ov.meanIndex"), base.meanIndex.toFixed(1), res.meanIndex.toFixed(1)],
    ...BANDS.map((b): [string, string, string] => [t(`band.${b}`), String(base.bandCounts[b]), String(res.bandCounts[b])]),
    [t("ov.roadsIn"), `${eb.roadKm.toFixed(1)} km`, `${es.roadKm.toFixed(1)} km`],
    [t("ov.facIn"), String(eb.facilities.length), String(es.facilities.length)],
  ];
  return (
    <div className="compare">
      <div className="cmp-grid">
        <Panel kind="baseline" ds={ds} res={res} base={base} title={t("cmp.baseline")} />
        <Panel kind="scenario" ds={ds} res={res} base={base} title={`${t("cmp.scenario")} · ${sc.rainfallMm} mm / ${sc.durationH} h · ${Math.round(sc.blockageFrac * 100)}%`} />
        <Panel kind="delta" ds={ds} res={res} base={base} title={t("cmp.delta")} />
      </div>
      <table className="cmp-table">
        <thead><tr><th /><th>{t("cmp.baseline")}</th><th>{t("cmp.scenario")}</th></tr></thead>
        <tbody>{rows.map(([k, a, b]) => <tr key={k}><td>{k}</td><td>{a}</td><td><b>{b}</b></td></tr>)}</tbody>
      </table>
      <div className="legend-inline">{BANDS.map((b) => <span key={b}><i style={{ background: BAND_COLORS[b] }} />{t(`band.${b}`)}</span>)}</div>
      <div className="muted small pad">{t("cmp.note")}</div>
    </div>
  );
}
