import { useMemo, useState } from "react";
import { BriefSheet, CertaintyChip, useBrief } from "./BriefSheet";
import { useStore } from "../../store";
import { useT } from "../../components/i18n/i18n";
import { BAND_COLORS, rankPriority } from "../../scenarios/engine/risk";

export function PriorityTab() {
  const t = useT();
  const ds = useStore((s) => s.ds)!; const res = useStore((s) => s.result)!;
  const select = useStore((s) => s.selectZone); const sel = useStore((s) => s.selectedZoneId);
  const items = useMemo(() => rankPriority(ds, res, 12), [ds, res]);
  const brief = useBrief();
  const [open, setOpen] = useState(false);
  return (
    <div className="stack">
      <section className="card">
        <div className="card-kicker">{t("pr.title")}</div>
        <p className="muted small">{t("pr.note")}</p>
        {brief ? <p className="small">{t("br.counts", { sure: brief.counts.sure, maybe: brief.counts.maybe })} <span className="muted">{t("br.countsHint")}</span></p> : null}
        <button className="btn primary" onClick={() => setOpen(true)}>{t("br.open")}</button>
        <ol className="prio">
          {items.map((it, i) => (
            <li key={it.zone.id}>
              <button className={sel === it.zone.id ? "on" : ""} onClick={() => select(it.zone.id, false)}>
                <span className="rank">{i + 1}</span>
                <span className="prio-main"><b>{it.zone.id}</b>
                  <small>{t("pr.driver", { f: t(`factor.${it.topFactor}`) })}{it.facilities ? ` · ${t("pr.fac", { n: it.facilities })}` : ""} · {Math.round(it.zone.road_m)} m {t("pr.road")}</small></span>
                {brief?.byZone[it.zone.id] ? <CertaintyChip c={brief.byZone[it.zone.id]} /> : null}
                <span className="prio-idx" style={{ color: BAND_COLORS[it.result.band] }}>{it.result.index.toFixed(0)}</span>
              </button>
            </li>
          ))}
        </ol>
        <p className="fineprint">{t("pr.disclaimer")}</p>
      </section>
      {open ? <BriefSheet onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
