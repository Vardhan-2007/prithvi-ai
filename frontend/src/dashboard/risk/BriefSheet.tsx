import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "../../store";
import { useT } from "../../components/i18n/i18n";
import { BAND_COLORS } from "../../scenarios/engine/risk";
import { actionText, briefText, buildBrief, rangeCases, type Brief } from "../../scenarios/engine/brief";

/** The brief for the current scenario (shared by the Priority tab chips and the printable sheet). */
export function useBrief(): Brief | null {
  const ds = useStore((s) => s.ds), res = useStore((s) => s.result), lm = useStore((s) => s.liveMode);
  return useMemo(() => {
    if (!ds || !res) return null;
    const f = lm.on && lm.forecast ? { low: lm.forecast.data.cases.low, high: lm.forecast.data.cases.high } : null;
    return buildBrief(ds, res, rangeCases(res.scenario, f));
  }, [ds, res, lm.on, lm.forecast]);
}

export function CertaintyChip({ c }: { c: "sure" | "maybe" | "no" }) {
  const t = useT();
  if (c === "no") return null;
  return <span className={`cert ${c}`} title={t(`br.certHint.${c}`)}>{t(`br.cert.${c}`)}</span>;
}

/** Printable one-page officer brief (English or Telugu, follows the app language). */
export function BriefSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const b = useBrief();
  const sc = useStore((s) => s.scenario);
  const [copied, setCopied] = useState(false);
  const when = useMemo(() => new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST", []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    document.body.classList.add("printing-brief");
    return () => { window.removeEventListener("keydown", k); document.body.classList.remove("printing-brief"); };
  }, [onClose]);
  if (!b) return null;
  const copy = async () => {
    try { await navigator.clipboard.writeText(briefText(b, t, when)); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
  };
  return createPortal(
    <div className="brief-overlay" role="dialog" aria-modal="true" aria-label={t("br.title")} onClick={onClose}>
      <div className="brief-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="brief-tools">
          <button className="btn primary" onClick={() => window.print()}>{t("br.print")}</button>
          <button className="btn" onClick={() => { void copy(); }}>{copied ? t("br.copied") : t("br.copy")}</button>
          <button className="btn ghost" onClick={onClose}>{t("br.close")}</button>
        </div>
        <h2>{t("br.title")}</h2>
        <p className="brief-meta">{when} · {t("br.area")}</p>
        <p>{t("br.scenario", { name: sc.name, mm: sc.rainfallMm, h: sc.durationH, b: Math.round(sc.blockageFrac * 100) })}
          {(sc.soilWetness ?? 0) > 0 || (sc.seaLevelM ?? 0) > 0 ? " " + t("br.cond", { w: Math.round((sc.soilWetness ?? 0) * 100), s: (sc.seaLevelM ?? 0).toFixed(1) }) : ""}</p>
        <p>{t(b.stage === "final" ? "br.stageFinal" : "br.stageProv")} {t(b.basis === "forecast" ? "br.basisForecast" : "br.basisAssumed")}</p>
        <p><b>{t("br.counts", { sure: b.counts.sure, maybe: b.counts.maybe })}</b></p>
        <table className="brief-table">
          <thead><tr><th>#</th><th>{t("br.where")}</th><th>{t("br.how")}</th><th>{t("br.todo")}</th></tr></thead>
          <tbody>
            {b.items.map((it) => (
              <tr key={it.zoneId}>
                <td>{it.rank}</td>
                <td><b>{it.street ?? it.zoneId}</b><br /><small>{it.zoneId} · {it.lat}, {it.lon}</small></td>
                <td><span style={{ color: BAND_COLORS[it.band as keyof typeof BAND_COLORS] }}>{it.index}</span> · {t(`br.cert.${it.certainty}`)}</td>
                <td><ul>{it.actions.map((a, i) => <li key={i}>{actionText(a, t)}</li>)}</ul></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="fineprint">{t("br.footer")}</p>
      </div>
    </div>,
    document.body,
  );
}
