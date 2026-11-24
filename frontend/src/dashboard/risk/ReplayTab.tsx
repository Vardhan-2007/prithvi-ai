import { useEffect, useMemo, useState } from "react";
import { useStore } from "../../store";
import { useT } from "../../components/i18n/i18n";
import { stepStorm } from "../../maps/twin3d/sim/storm";
import { FieldReportsCard } from "./FieldReportsCard";
import { loadFieldReports } from "../../scenarios/engine/fieldReports";
import { getReplay, loadObserved, scoreReports, type ObservedReport, type ReplayRain, type ReplaySeriesKey } from "../../scenarios/engine/replay";

const KEYS: ReplaySeriesKey[] = ["forecast_day_ahead", "actual"];
const yesterday = () => new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

/** Replay a past day's storm and check the final score against reported waterlogging. */
export function ReplayTab() {
  const t = useT();
  const ds = useStore((s) => s.ds)!; const res = useStore((s) => s.result)!; const sc = useStore((s) => s.scenario);
  const runStorm = useStore((s) => s.runStorm);
  const loadConditions = useStore((s) => s.loadConditions);
  const [day, setDay] = useState(() => new Date(Date.now() - 10 * 86400_000).toISOString().slice(0, 10));
  const [rain, setRain] = useState<ReplayRain | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [err, setErr] = useState<string>("");
  const [reports, setReports] = useState<ObservedReport[]>([]);
  useEffect(() => { void loadObserved().then(setReports); }, []);
  const [field, setField] = useState<ObservedReport[]>(() => loadFieldReports());

  const load = async () => {
    setStatus("loading"); setErr("");
    const [w, s, e, n] = ds.meta.bbox;
    try { setRain(await getReplay((s + n) / 2, (w + e) / 2, day)); setStatus("idle"); }
    catch (x) { setRain(null); setStatus("error"); setErr(x instanceof Error ? x.message : String(x)); }
  };
  const nameFor = (k: ReplaySeriesKey) => `Replay ${rain!.date} · ${t(`rp.series.${k}`)}`;
  const replaying = rain && KEYS.some((k) => sc.name === nameFor(k));
  const check = useMemo(() => (replaying && res.stage === "final" ? scoreReports(ds, res, [...reports, ...field], rain!.date) : null), [replaying, res, reports, field, rain, ds]);

  return (
    <div className="stack">
      <section className="card">
        <div className="card-kicker">{t("rp.title")}</div>
        <p className="muted small">{t("rp.intro")}</p>
        <label className="slider"><span className="slider-head"><span>{t("rp.date")}</span></span>
          <input type="date" value={day} max={yesterday()} onChange={(e) => setDay(e.target.value)} />
        </label>
        <button className="btn primary" onClick={() => { void load(); }} disabled={status === "loading"}>{status === "loading" ? t("rp.loading") : t("rp.load")}</button>
        {status === "error" ? <p className="hint warn-text">{t("rp.error")} {err}</p> : null}
        {rain ? (
          <>
            {KEYS.map((k) => rain.series[k] ? (
              <div className="kv" key={k}>
                <span>{t(`rp.series.${k}`)}: <b>{rain.totals_mm[k]} mm</b></span>
                <button className="btn" onClick={() => { runStorm(stepStorm(rain.series[k]!, 1, { startIso: `${rain.date}T00:00+05:30`, label: t(`rp.series.${k}`) }), nameFor(k)); void loadConditions(rain.date); }}>{t("rp.run")}</button>
              </div>
            ) : null)}
            {rain.notes.map((n, i) => <p key={i} className="hint">{n}</p>)}
            <p className="fineprint">{t("rp.notGauge")}</p>
          </>
        ) : null}
      </section>

      {rain ? (
        <section className="card">
          <div className="card-kicker">{t("rp.check")}</div>
          {!replaying ? <p className="muted small">{t("rp.notThis")}</p>
            : res.stage !== "final" ? <p className="muted small">{t("rp.waiting")}</p>
            : !check || check.checks.length === 0 ? (
              <>
                <p className="muted small">{t("rp.none")}</p>
                {check && check.outside ? <p className="hint">{t("rp.outside", { n: check.outside })}</p> : null}
              </>
            ) : (
              <>
                <div className="live-range">{t("rp.score", { hits: check.hits, n: check.checks.length, r: check.radiusM })}</div>
                <ul className="why">
                  {check.checks.map((c, i) => (
                    <li key={i}>
                      <b className={c.hit ? "ok-text" : "warn-text"}>{t(c.hit ? "rp.hit" : "rp.miss")}</b> · {c.report.place_name}{c.street ? ` (${t("rp.street")})` : ""}
                      {" · "}{c.nearestFlaggedM === null ? t("rp.noFlag") : t("rp.nearest", { d: c.nearestFlaggedM })}
                      {" · "}{c.report.source_url.startsWith("field-report:") ? t("fr.tag") : <a href={c.report.source_url} target="_blank" rel="noreferrer">{c.report.source_type}</a>}
                    </li>
                  ))}
                </ul>
                {check.outside ? <p className="hint">{t("rp.outside", { n: check.outside })}</p> : null}
                <p className="fineprint">{t("rp.unreported", { n: check.flaggedWithoutReport })}</p>
              </>
            )}
        </section>
      ) : null}
      <FieldReportsCard list={field} setList={setField} />
    </div>
  );
}
