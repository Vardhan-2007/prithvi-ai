import { useStore } from "../store";
import { useT } from "../components/i18n/i18n";
import { drainFactor } from "../maps/twin3d/sim/floodSolver";
import type { Scenario } from "./engine/types";

/** Ground wetness and sea level (tide + storm surge): two sliders, and a button that fills them from Open-Meteo. */
export function ConditionsBox({ change }: { change: (p: Partial<Scenario>) => void }) {
  const t = useT();
  const sc = useStore((s) => s.scenario);
  const cond = useStore((s) => s.conditions);
  const load = useStore((s) => s.loadConditions);
  const wet = sc.soilWetness ?? 0, sea = sc.seaLevelM ?? 0;
  const wetWord = wet < 0.34 ? t("cond.dry") : wet < 0.67 ? t("cond.damp") : t("cond.soaked");
  const d = cond.data;
  return (
    <section className="cond-box">
      <div className="card-kicker">{t("cond.title")}</div>
      <label className="slider">
        <span className="slider-head"><span>{t("cond.wet")}</span><b>{Math.round(wet * 100)} %</b></span>
        <input type="range" min={0} max={100} step={5} value={Math.round(wet * 100)} onChange={(e) => change({ soilWetness: Number(e.target.value) / 100 })} />
        <span className="hint">{t("cond.wetHint", { v: wetWord })}</span>
      </label>
      <label className="slider">
        <span className="slider-head"><span>{t("cond.sea")}</span><b>{sea.toFixed(1)} m</b></span>
        <input type="range" min={0} max={3} step={0.1} value={sea} onChange={(e) => change({ seaLevelM: Number(e.target.value) })} />
        <span className="hint">{t("cond.seaHint", { p: Math.round(drainFactor(sea) * 100) })}</span>
      </label>
      <button className="btn ghost" disabled={cond.status === "loading"} onClick={() => { void load(); }}>{t("cond.load")}</button>
      {cond.status === "loading" ? <p className="hint">{t("cond.loading")}</p> : null}
      {cond.status === "error" ? <p className="hint warn-text">{t("cond.failed")}</p> : null}
      {cond.status === "ok" && d ? (
        <p className="hint">
          {t("cond.loaded", { d: cond.date ? ` (${cond.date})` : "", m: d.soilMoisture ?? "–", s: d.seaLevelM ?? "–" })}
          {d.notes.length ? " " + t("cond.missing", { x: d.notes.join(", ") }) : ""}
        </p>
      ) : null}
    </section>
  );
}
