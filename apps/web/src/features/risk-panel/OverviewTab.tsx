import { useMemo } from "react";
import { useStore } from "../../app/store";
import { useT } from "../../shared/utils/i18n";
import { BAND_COLORS, evaluate, exposureSummary, BASELINE } from "../../shared/engine/risk";
import type { Band, Scenario } from "../../shared/engine/types";
import { exportCsv, exportJson } from "../../shared/utils/export";

const BANDS: Band[] = ["lower", "moderate", "higher", "highest"];

function BandBar({ counts, total }: { counts: Record<Band, number>; total: number }) {
  return (
    <div className="bandbar">
      {BANDS.map((b) => <i key={b} style={{ width: `${(counts[b] / total) * 100}%`, background: BAND_COLORS[b] }} title={`${b}: ${counts[b]}`} />)}
    </div>
  );
}

const RAIN_LEVELS: [number, number][] = [[40, 6], [100, 6], [180, 6], [300, 4]];
const BLOCK_LEVELS = [0, 0.25, 0.5, 0.75];

export function OverviewTab() {
  const t = useT();
  const ds = useStore((s) => s.ds)!; const res = useStore((s) => s.result)!; const base = useStore((s) => s.baseline)!;
  const sc = useStore((s) => s.scenario); const apply = useStore((s) => s.applyScenario);
  const live = useStore((s) => s.live);
  const total = res.zones.length;
  const exp = useMemo(() => exposureSummary(ds, res), [ds, res]);
  const moved = res.zones.filter((z, i) => BANDS.indexOf(z.band) > BANDS.indexOf(base.zones[i].band)).length;
  const lib = useMemo(() => RAIN_LEVELS.flatMap(([mm, h]) => BLOCK_LEVELS.map((b) => {
    const s: Scenario = { ...BASELINE, rainfallMm: mm, durationH: h, blockageFrac: b, name: `${mm} mm / ${b * 100}%` };
    const r = evaluate(ds, s);
    return { s, mean: r.meanIndex, high: r.bandCounts.higher + r.bandCounts.highest };
  })), [ds]);
  const dMean = res.meanIndex - base.meanIndex;

  return (
    <div className="stack">
      <section className="card advisory">
        <div className="card-kicker">{t("ov.advisory")}<span className="tag sim">{t("tag.simulated")}</span></div>
        <h3>{sc.name}</h3>
        <div className="kv"><span>{t("sc.rain")}</span><b>{sc.rainfallMm} mm / {sc.durationH} h</b></div>
        <div className="kv"><span>{t("sc.blockage")}</span><b>{Math.round(sc.blockageFrac * 100)} %{Object.keys(sc.overrides).length ? ` (+${Object.keys(sc.overrides).length} manual)` : ""}{sc.pumps ? " · pumps" : ""}</b></div>
        <div className="big-row">
          <div><div className="big">{res.meanIndex.toFixed(1)}</div><div className="muted">{t("ov.meanIndex")}</div></div>
          <div><div className={"big " + (dMean > 0.05 ? "up" : dMean < -0.05 ? "down" : "")}>{dMean >= 0 ? "+" : ""}{dMean.toFixed(1)}</div><div className="muted">{t("ov.vsBaseline")}</div></div>
          <div><div className="big">{moved}</div><div className="muted">{t("ov.zonesMoved")}</div></div>
        </div>
        <div className="muted small">{t("ov.baseline")}</div><BandBar counts={base.bandCounts} total={total} />
        <div className="muted small">{t("ov.scenario")}</div><BandBar counts={res.bandCounts} total={total} />
        <div className="legend-inline">{BANDS.map((b) => <span key={b}><i style={{ background: BAND_COLORS[b] }} />{t(`band.${b}`)} {res.bandCounts[b]}</span>)}</div>
        <p className="fineprint">{t("ov.notProb")}</p>
      </section>

      <section className="card">
        <div className="card-kicker">{t("ov.exposure")}</div>
        <div className="big-row">
          <div><div className="big">{exp.flaggedZoneIds.length}</div><div className="muted">{t("ov.flaggedZones")}</div></div>
          <div><div className="big">{exp.roadKm.toFixed(1)}<small> km</small></div><div className="muted">{t("ov.roadsIn")}</div></div>
          <div><div className="big">{exp.facilities.length}</div><div className="muted">{t("ov.facIn")}</div></div>
        </div>
        {exp.facilities.length ? <ul className="list">{exp.facilities.slice(0, 6).map((f) => <li key={f.id}><i className={`dot ${f.category}`} />{f.name}<span className="muted"> · {f.amenity.replace(/_/g, " ")}</span></li>)}</ul> : <div className="muted small">{t("ov.noneFlagged")}</div>}
        <div className="muted small">{t("ov.flaggedDef")}</div>
      </section>

      {live ? (
        <section className="card">
          <div className="card-kicker">{t("ov.simNow")}</div>
          <div className="kv"><span>{t("stat.flooded")}</span><b>{live.floodedHa.toFixed(1)} ha</b></div>
          <div className="kv"><span>{t("stat.maxDepth")}</span><b>{live.maxDepth.toFixed(2)} m</b></div>
          <div className="kv"><span>{t("stat.buildings")}</span><b>{live.floodedBuildings}</b></div>
          <div className="kv"><span>{t("ov.water")}</span><b>{(live.storedM3 / 1000).toFixed(0)}k / {(live.drainedM3 / 1000).toFixed(0)}k / {(live.outfallM3 / 1000).toFixed(0)}k m³</b></div>
          <div className="muted small">{t("ov.waterKey")}</div>
        </section>
      ) : null}

      <section className="card">
        <div className="card-kicker">{t("ov.library", { n: lib.length })}</div>
        <div className="lib-head"><span /> {BLOCK_LEVELS.map((b) => <span key={b}>{b * 100}%</span>)}</div>
        {RAIN_LEVELS.map(([mm, h], r) => (
          <div className="lib-row" key={mm}>
            <span className="lib-rain">{mm} mm<small>/{h} h</small></span>
            {BLOCK_LEVELS.map((b, c) => {
              const x = lib[r * 4 + c]; const hot = x.mean >= 48 ? "hot" : x.mean >= 35 ? "warm" : "cool";
              const active = sc.rainfallMm === mm && sc.durationH === h && Math.abs(sc.blockageFrac - b) < 1e-6;
              return <button key={c} className={`lib-cell ${hot}${active ? " active" : ""}`} onClick={() => apply({ rainfallMm: mm, durationH: h, blockageFrac: b, overrides: {}, name: `${mm} mm / ${h} h, ${b * 100}% blocked` })} title={`${x.high} zones Higher/Highest`}>
                <b>{x.mean.toFixed(0)}</b><small>{x.high}</small>
              </button>;
            })}
          </div>
        ))}
        <div className="muted small">{t("ov.libKey")}</div>
      </section>

      <div className="row">
        <button className="btn" onClick={() => exportCsv(ds, res, base)}>{t("ov.exportCsv")}</button>
        <button className="btn" onClick={() => exportJson(ds, res, base)}>{t("ov.exportJson")}</button>
      </div>
    </div>
  );
}
