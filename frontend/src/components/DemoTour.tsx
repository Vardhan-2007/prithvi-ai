import { useEffect, useState } from "react";
import { DEFAULT_SCENARIO, PRESETS, useStore, type RightTab } from "../store";
import { useT } from "./i18n/i18n";

/** A one-minute guided demo: each step sets the app up (scenario, tab) and says in one or two lines what to look at. */
interface Step { key: string; tab?: RightTab; run?: () => void }

function steps(t: (k: string) => string): Step[] {
  const st = useStore.getState;
  const preset = (id: string, extra: object = {}) => {
    const p = PRESETS.find((x) => x.id === id)!;
    st().applyScenario({ ...DEFAULT_SCENARIO, rainfallMm: p.rainfallMm, durationH: p.durationH, blockageFrac: p.blockageFrac, name: `${t("demo.title")}: ${t(`preset.${id}`)}`, ...extra });
  };
  return [
    { key: "twin", tab: "overview", run: () => { st().setView("3d"); preset("heavy"); } },
    { key: "storm", tab: "overview", run: () => preset("veryHeavy") },
    { key: "priority", tab: "priority" },
    { key: "sea", tab: "priority", run: () => preset("veryHeavy", { seaLevelM: 1.5, soilWetness: 0.8 }) },
    { key: "money", tab: "drains" },
    { key: "replay", tab: "replay" },
    { key: "end", tab: "overview" },
  ];
}

export function DemoTour({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [i, setI] = useState(0);
  const list = steps(t);
  useEffect(() => {
    const s = list[i];
    s.run?.();
    if (s.tab) useStore.getState().setTab(s.tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const last = i === list.length - 1;
  return (
    <div className="demo-card" role="dialog" aria-label={t("demo.title")}>
      <div className="demo-head"><span className="card-kicker">{t("demo.title")} · {i + 1}/{list.length}</span>
        <button className="btn ghost" onClick={onClose} aria-label={t("br.close")}>×</button></div>
      <h3>{t(`demo.${list[i].key}.h`)}</h3>
      <p>{t(`demo.${list[i].key}.p`)}</p>
      <div className="demo-nav">
        <button className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>{t("demo.back")}</button>
        {last ? <button className="btn primary" onClick={() => { useStore.getState().applyScenario({ ...DEFAULT_SCENARIO }); onClose(); }}>{t("demo.finish")}</button>
          : <button className="btn primary" onClick={() => setI(i + 1)}>{t("demo.next")}</button>}
      </div>
    </div>
  );
}
