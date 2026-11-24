import { useEffect, useMemo, useState } from "react";
import { useStore } from "../../store";
import { useT } from "../../components/i18n/i18n";
import { drainWatchList, type DrainInfo, type Level } from "../../scenarios/engine/drains";

const LEVEL_COLOR: Record<Level, string> = { high: "#f97316", medium: "#fbbf24", low: "#22d3ee" };
type Sort = "likely" | "inspect";

/** Which drains are most likely to block (indicative, from terrain and surroundings) and what a blockage would do. */
export function DrainsTab() {
  const t = useT();
  const ds = useStore((s) => s.ds)!; const sc = useStore((s) => s.scenario); const res = useStore((s) => s.result)!;
  const sel = useStore((s) => s.selectedInletId); const setSel = useStore((s) => s.setSelectedInlet);
  const drainRisk = useStore((s) => s.layers.drainRisk); const setLayers = useStore((s) => s.setLayers);
  const assume = useStore((s) => s.assumeLikeliestBlocked); const toggle = useStore((s) => s.toggleInlet);
  const [sort, setSort] = useState<Sort>("likely");

  // colour the drains on the maps while this tab is open
  useEffect(() => { setLayers({ drainRisk: true }); return () => { setLayers({ drainRisk: false }); setSel(null); }; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => drainWatchList(ds, sc, res), [ds, sc, res]);
  const rows = useMemo(() => [...list].sort((a, b) => (sort === "likely" ? b.susceptibility - a.susceptibility : b.inspectScore - a.inspectScore)).slice(0, 12), [list, sort]);
  const counts = useMemo(() => ({ high: list.filter((d) => d.level === "high").length, medium: list.filter((d) => d.level === "medium").length, low: list.filter((d) => d.level === "low").length }), [list]);
  const blockedNow = res.inletOpen.filter((o) => !o).length;
  const k = blockedNow > 0 ? blockedNow : Math.round(0.25 * ds.inlets.length);
  const name = (d: DrainInfo) => `${t("dr.drain")} ${d.id.replace(/^inlet_/, "")}`;
  const why = (d: DrainInfo) => [d.factors.lowLying >= 0.6 && t("dr.f.low"), d.factors.builtUp >= 0.6 && t("dr.f.built"), d.factors.spacing >= 0.6 && t("dr.f.space")].filter(Boolean).join(" · ") || t("dr.f.none");

  return (
    <div className="stack">
      <section className="card">
        <div className="card-kicker">{t("dr.title")}</div>
        <p className="muted small">{t("dr.note")}</p>
        <div className="dr-legend">
          {(["high", "medium", "low"] as Level[]).map((l) => <span key={l}><i style={{ background: LEVEL_COLOR[l] }} />{t(`dr.lvl.${l}`)} ({counts[l]})</span>)}
          <span><i style={{ background: "#ef4444" }} />{t("dr.blockedNow")} ({blockedNow})</span>
        </div>
        <label className="check small"><input type="checkbox" checked={drainRisk} onChange={(e) => setLayers({ drainRisk: e.target.checked })} /> {t("dr.show")}</label>
        <div className="dr-sort" role="tablist">
          <button className={sort === "likely" ? "on" : ""} onClick={() => setSort("likely")}>{t("dr.sortLikely")}</button>
          <button className={sort === "inspect" ? "on" : ""} onClick={() => setSort("inspect")}>{t("dr.sortInspect")}</button>
        </div>
        <ol className="prio dr-list">
          {rows.map((d, i) => (
            <li key={d.id}>
              <button className={sel === d.id ? "on" : ""} onClick={() => setSel(sel === d.id ? null : d.id)}>
                <span className="rank">{i + 1}</span>
                <span className="prio-main"><b>{name(d)}</b>
                  <small>{why(d)}</small>
                  <small>{t("dr.impact", { r: d.impact.maxZoneRise.toFixed(1), z: d.impact.zoneId.replace("zone_", "") })}{d.impact.newlyFlagged > 0 ? ` · ${t("dr.flag", { n: d.impact.newlyFlagged })}` : ""}</small>
                </span>
                <span className="dr-chip" style={{ color: LEVEL_COLOR[d.level], borderColor: LEVEL_COLOR[d.level] }}>{t(`dr.lvl.${d.level}`)}<small>{d.open ? "" : ` · ${t("dr.blockedShort")}`}</small></span>
              </button>
              {sel === d.id ? (
                <div className="dr-detail">
                  <div className="dr-bars">
                    {([["lowLying", "dr.b.low"], ["builtUp", "dr.b.built"], ["spacing", "dr.b.space"]] as const).map(([key, lab]) => (
                      <div key={key} className="dr-bar"><span>{t(lab)}</span><div><i style={{ width: `${Math.round(d.factors[key] * 100)}%` }} /></div></div>
                    ))}
                  </div>
                  <button className="btn small" onClick={() => toggle(d.id)}>{d.open ? t("dr.markBlocked") : t("dr.clear")}</button>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
        <div className="dr-apply">
          <button className="btn primary" onClick={() => assume(k)}>{t("dr.apply", { k })}</button>
          <p className="muted small">{t("dr.applyHint")}</p>
        </div>
        <p className="fineprint">{t("dr.disclaimer")}</p>
      </section>
    </div>
  );
}
