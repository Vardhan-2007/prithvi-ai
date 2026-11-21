import { useMemo } from "react";
import { useStore } from "../../app/store";
import { useT, tr } from "../../shared/utils/i18n";
import { BAND_COLORS, WEIGHTS } from "../../shared/engine/risk";
import { explainZone } from "./explain";
import { depthAtPlayhead, peakAtPlayhead } from "../twin3d/sim/simController";

const KEYS = ["terrain", "rainfall", "drainage", "exposure"] as const;

export function ZoneTab() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const ds = useStore((s) => s.ds)!; const res = useStore((s) => s.result)!; const base = useStore((s) => s.baseline)!;
  const sc = useStore((s) => s.scenario); const id = useStore((s) => s.selectedZoneId);
  const live = useStore((s) => s.live);
  const idx = ds.zones.zones.findIndex((z) => z.id === id);

  const depths = useMemo(() => {
    if (idx < 0) return null;
    const z = ds.zones.zones[idx], { nx, ny, cell_m } = ds.grid, per = ds.zones.size_m / cell_m;
    const cur = new Float32Array(nx * ny), pk = new Float32Array(nx * ny);
    depthAtPlayhead(cur); peakAtPlayhead(pk);
    let c = 0, p = 0;
    for (let j = z.iy * per; j < Math.min(ny, (z.iy + 1) * per); j++) for (let i = z.ix * per; i < Math.min(nx, (z.ix + 1) * per); i++) {
      c = Math.max(c, cur[j * nx + i]); p = Math.max(p, pk[j * nx + i]);
    }
    return { cur: c, peak: p };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, ds, Math.floor((live?.t ?? 0) / 120), res]);

  if (idx < 0) return <div className="empty">{t("zone.pick")}</div>;
  const z = ds.zones.zones[idx], r = res.zones[idx], b = base.zones[idx];
  const sentences = explainZone(lang, z, r, b, sc, res.intensityMmH);
  const d = r.index - b.index;
  return (
    <div className="stack">
      <section className="card">
        <div className="zone-head">
          <div><div className="card-kicker">{t("zone.title")}</div><h3>{z.id}</h3></div>
          <span className="band-pill" style={{ background: BAND_COLORS[r.band] }}>{t(`band.${r.band}`)}</span>
        </div>
        <div className="big-row">
          <div><div className="big">{r.index.toFixed(1)}</div><div className="muted">{t("zone.index")}</div></div>
          <div><div className={"big " + (d > 0.05 ? "up" : d < -0.05 ? "down" : "")}>{d >= 0 ? "+" : ""}{d.toFixed(1)}</div><div className="muted">{t("ov.vsBaseline")} ({b.index.toFixed(1)})</div></div>
        </div>
        <div className="card-kicker mt">{t("zone.factors")}</div>
        {KEYS.map((k) => (
          <div className="factor" key={k}>
            <div className="factor-head"><span>{t(`factor.${k}`)} <small>× {WEIGHTS[k].toFixed(2)}</small></span><b>{r.factors[k].toFixed(2)} → {r.contrib[k].toFixed(1)} {t("zone.pts")}</b></div>
            <div className="bar"><i style={{ width: `${r.factors[k] * 100}%` }} /><u style={{ left: `${b.factors[k] * 100}%` }} title="baseline" /></div>
          </div>
        ))}
        <div className="muted small">{t("zone.sumCheck", { sum: KEYS.reduce((s, k) => s + r.contrib[k], 0).toFixed(1) })}</div>
      </section>

      <section className="card">
        <div className="card-kicker">{t("zone.why")}</div>
        <ul className="why">{sentences.map((s, i) => <li key={i}>{s}</li>)}</ul>
        <p className="fineprint">{tr(lang, "ov.notProb")}</p>
      </section>

      <section className="card">
        <div className="card-kicker">{t("zone.sim")}<span className="tag sim">{t("tag.uncal")}</span></div>
        <div className="kv"><span>{t("zone.depthNow")}</span><b>{depths ? depths.cur.toFixed(2) : "–"} m</b></div>
        <div className="kv"><span>{t("zone.depthPeak")}</span><b>{depths ? depths.peak.toFixed(2) : "–"} m</b></div>
        <div className="muted small">{t("zone.simNote")}</div>
      </section>

      <section className="card">
        <div className="card-kicker">{t("zone.assets")}</div>
        <div className="kv"><span>{t("zone.elev")}</span><b>{z.mean_elev.toFixed(1)} m</b></div>
        <div className="kv"><span>{t("zone.imperv")}</span><b>{Math.round(z.imperv * 100)} %</b></div>
        <div className="kv"><span>{t("zone.buildings")}</span><b>{z.n_buildings}</b></div>
        <div className="kv"><span>{t("zone.roadM")}</span><b>{Math.round(z.road_m)} m</b></div>
        <div className="kv"><span>{t("zone.fac")}</span><b>{z.facilities.health} · {z.facilities.emergency} · {z.facilities.shelter}</b></div>
        <div className="muted small">{t("zone.facKey")}</div>
      </section>
    </div>
  );
}
