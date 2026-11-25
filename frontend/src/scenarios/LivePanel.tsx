import { useEffect } from "react";
import { useStore } from "../store";
import { useT } from "../components/i18n/i18n";
import { LiveAlert } from "./LiveAlert";
import { ALLOWED_HOURS, CACHE_TTL_MS, ageMs, type CaseKey } from "./engine/forecast";

const CASES: CaseKey[] = ["low", "likely", "high"];
const localTime = (isoUtc: string) => new Date(isoUtc.endsWith("Z") ? isoUtc : isoUtc + "Z").toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });

/** Live mode: drive the scenario from the latest ensemble rain forecast (low / likely / high). */
export function LivePanel() {
  const t = useT();
  const lm = useStore((s) => s.liveMode);
  const setOn = useStore((s) => s.setLiveOn), setHours = useStore((s) => s.setLiveHours), setCase = useStore((s) => s.setLiveCase);
  const refresh = useStore((s) => s.refreshForecast);

  // refresh hourly while Live mode is on and the tab is open
  useEffect(() => {
    if (!lm.on) return;
    const id = window.setInterval(() => { void refresh(); }, CACHE_TTL_MS);
    return () => window.clearInterval(id);
  }, [lm.on, refresh]);

  const f = lm.forecast?.data;
  return (
    <div className={"live-box" + (lm.on ? " on" : "")}>
      <label className="check">
        <input type="checkbox" checked={lm.on} onChange={(e) => setOn(e.target.checked)} />
        <span>{t("live.toggle")}<small>{t("live.toggleHint")}</small></span>
      </label>
      {lm.on ? (
        <>
          <div className="seg">
            {ALLOWED_HOURS.map((h) => <button key={h} className={lm.hours === h ? "on" : ""} onClick={() => setHours(h)}>{t("live.next", { h })}</button>)}
          </div>
          {lm.status === "loading" ? <p className="hint">{t("live.loading")}</p> : null}
          {lm.status === "error" ? <p className="hint warn-text">{t("live.error")}</p> : null}
          {f ? (
            <>
              <div className="live-range">{t("live.range", { h: f.hours, min: f.range_mm.min, max: f.range_mm.max, likely: f.cases.likely.total_mm })}</div>
              <div className="seg">
                {CASES.map((c) => (
                  <button key={c} className={lm.caseKey === c ? "on" : ""} onClick={() => setCase(c)} title={t("live.caseHint")}>
                    {t(`live.case.${c}`)}<br /><small>{f.cases[c].total_mm} mm</small>
                  </button>
                ))}
              </div>
              <p className="hint">
                {t("live.from", { start: localTime(f.start_utc), n: f.members })}
                {" · "}{t(`live.origin.${lm.forecast!.origin}`)}{lm.forecast!.stale ? ` · ${t("live.stale", { m: Math.round(ageMs(f) / 60000) })}` : ""}
              </p>
              <p className="fineprint">{t("live.oneCell")}</p>
              <LiveAlert hours={lm.hours} />
            </>
          ) : null}
          <button className="btn ghost" onClick={() => { void refresh(); }} disabled={lm.status === "loading"}>{t("live.refresh")}</button>
        </>
      ) : null}
    </div>
  );
}
