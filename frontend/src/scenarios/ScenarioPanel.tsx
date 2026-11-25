import { useEffect, useRef } from "react";
import { useStore, PRESETS, DEFAULT_SCENARIO, type RiskLayer } from "../store";
import { useT } from "../components/i18n/i18n";
import { LivePanel } from "./LivePanel";
import { ConditionsBox } from "./ConditionsBox";

function Slider({ label, value, min, max, step, unit, onChange, hint }: {
  label: string; value: number; min: number; max: number; step: number; unit: string; hint?: string; onChange: (v: number) => void;
}) {
  return (
    <label className="slider">
      <span className="slider-head"><span>{label}</span><b>{value}{unit}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

export function ScenarioPanel() {
  const t = useT();
  const sc = useStore((s) => s.scenario);
  const layers = useStore((s) => s.layers);
  const result = useStore((s) => s.result)!;
  const patch = useStore((s) => s.patchScenario);
  const restart = useStore((s) => s.restart);
  const setLayers = useStore((s) => s.setLayers);
  const applyScenario = useStore((s) => s.applyScenario);
  const clear = useStore((s) => s.clearOverrides);
  const timer = useRef<number | undefined>(undefined);
  const live = useStore((s) => s.liveMode.on);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const change = (p: Partial<typeof sc>) => {
    patch(p);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => restart(), 450);
  };
  const nOverrides = Object.keys(sc.overrides).length;
  const nBlocked = result.inletOpen.filter((o) => !o).length;
  const isPreset = (p: (typeof PRESETS)[number]) => p.rainfallMm === sc.rainfallMm && p.durationH === sc.durationH && Math.abs(p.blockageFrac - sc.blockageFrac) < 1e-6 && nOverrides === 0;

  const risk: { id: RiskLayer; k: string }[] = [{ id: "off", k: "layer.riskOff" }, { id: "index", k: "layer.riskIndex" }, { id: "delta", k: "layer.riskDelta" }];
  const toggles: { k: keyof typeof layers; label: string }[] = [
    { k: "water", label: "layer.water" }, { k: "peak", label: "layer.peak" }, { k: "buildings", label: "layer.buildings" }, { k: "roads", label: "layer.roads" },
    { k: "drains", label: "layer.drains" }, { k: "trees", label: "layer.trees" }, { k: "facilities", label: "layer.facilities" }, { k: "pumps", label: "layer.pumps" }, { k: "rain", label: "layer.rain" },
  ];

  return (
    <aside className="panel left">
      <div className="panel-head"><h2>{t("sc.title")}</h2><span className="tag sim">{t("tag.simulated")}</span></div>
      <LivePanel />
      <div className={"chips" + (live ? " dim" : "")}>
        {PRESETS.map((p) => (
          <button key={p.id} className={"chip" + (isPreset(p) ? " on" : "")}
            onClick={() => { applyScenario({ rainfallMm: p.rainfallMm, durationH: p.durationH, blockageFrac: p.blockageFrac, overrides: {}, name: t(`preset.${p.id}`) }); }}>
            {t(`preset.${p.id}`)}
          </button>
        ))}
      </div>
      <Slider label={t("sc.rain")} value={sc.rainfallMm} min={10} max={350} step={5} unit=" mm" onChange={(v) => change({ rainfallMm: v })}
        hint={sc.storm
          ? t("sc.intensityStorm", { v: (sc.rainfallMm / sc.durationH).toFixed(1), peak: Math.max(...sc.storm.mm).toFixed(1), src: sc.storm.label ?? "" })
          : t("sc.intensity", { v: (sc.rainfallMm / sc.durationH).toFixed(0) })} />
      <Slider label={t("sc.duration")} value={sc.durationH} min={1} max={24} step={1} unit=" h" onChange={(v) => change({ durationH: v })} />
      <Slider label={t("sc.blockage")} value={Math.round(sc.blockageFrac * 100)} min={0} max={100} step={5} unit=" %" onChange={(v) => change({ blockageFrac: v / 100 })}
        hint={t("sc.blockedCount", { n: nBlocked, total: result.inletOpen.length })} />
      <ConditionsBox change={change} />
      <label className="check">
        <input type="checkbox" checked={sc.pumps} onChange={(e) => change({ pumps: e.target.checked })} />
        <span>{t("sc.pumps")}<small>{t("sc.pumpsHint")}</small></span>
      </label>
      <div className="row">
        <button className="btn primary" onClick={() => restart()}>{t("sc.run")}</button>
        <button className="btn" onClick={() => applyScenario({ ...DEFAULT_SCENARIO })}>{t("sc.reset")}</button>
      </div>
      {nOverrides > 0 || sc.blockageFrac > 0 ? <button className="btn ghost" onClick={clear}>{t("sc.clear")}</button> : null}
      <p className="hint">{t("sc.clickInlet")}</p>

      <div className="panel-head"><h2>{t("layer.title")}</h2></div>
      <div className="seg">
        {risk.map((r) => <button key={r.id} className={layers.risk === r.id ? "on" : ""} onClick={() => setLayers({ risk: r.id })}>{t(r.k)}</button>)}
      </div>
      <div className="toggles">
        {toggles.map((x) => (
          <label key={x.k} className="toggle">
            <input type="checkbox" checked={layers[x.k] as boolean} onChange={(e) => setLayers({ [x.k]: e.target.checked } as never)} /><span>{t(x.label)}</span>
          </label>
        ))}
      </div>
    </aside>
  );
}
