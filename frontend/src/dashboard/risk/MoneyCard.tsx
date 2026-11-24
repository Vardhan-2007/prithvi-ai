import { useMemo, useState } from "react";
import { useStore } from "../../store";
import { useT } from "../../components/i18n/i18n";
import { DEFAULT_COSTS, formatInr, moneyCurve, planPatch, type BudgetPoint } from "../../scenarios/engine/budget";

const W = 300, H = 140, PAD = { l: 34, r: 8, t: 10, b: 26 };

/** Step chart: money spent (x) against zones still flagged (y), for the greedy plan of the current scenario. */
function Chart({ pts, pick, onPick }: { pts: BudgetPoint[]; pick: number; onPick: (i: number) => void }) {
  const t = useT();
  const maxX = Math.max(1, pts.at(-1)!.cost), maxY = Math.max(1, ...pts.map((p) => p.flagged));
  const x = (v: number) => PAD.l + (v / maxX) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / maxY) * (H - PAD.t - PAD.b);
  let d = `M${x(0)},${y(pts[0].flagged)}`;
  for (let i = 1; i < pts.length; i++) d += ` H${x(pts[i].cost)} V${y(pts[i].flagged)}`;
  const ticks = [0, maxX / 2, maxX];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="money-chart" role="img" aria-label={t("mo.chartLabel")}>
      <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} className="axis" />
      <line x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={y(0)} className="axis" />
      {ticks.map((v, i) => <text key={i} x={x(v)} y={H - 8} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} className="tick">{formatInr(v)}</text>)}
      <text x={PAD.l - 4} y={y(maxY) + 4} textAnchor="end" className="tick">{maxY}</text>
      <text x={PAD.l - 4} y={y(0)} textAnchor="end" className="tick">0</text>
      <path d={d} className="line" />
      {pts.map((p, i) => (
        <circle key={i} cx={x(p.cost)} cy={y(p.flagged)} r={i === pick ? 5 : 3} className={i === pick ? "pt on" : "pt"} onClick={() => onPick(i)}>
          <title>{formatInr(p.cost)} → {p.flagged}</title>
        </circle>
      ))}
    </svg>
  );
}

export function MoneyCard() {
  const t = useT();
  const ds = useStore((s) => s.ds)!; const sc = useStore((s) => s.scenario);
  const apply = useStore((s) => s.applyScenario);
  const [costs, setCosts] = useState(DEFAULT_COSTS);
  const pts = useMemo(() => moneyCurve(ds, sc, costs), [ds, sc, costs]);
  const [pick, setPick] = useState(0);
  const p = Math.min(pick, pts.length - 1);
  const steps = pts.slice(1, p + 1);
  const drains = steps.filter((s) => s.action?.kind === "clear").length, pumps = steps.some((s) => s.action?.kind === "pumps");
  return (
    <section className="card">
      <div className="card-kicker">{t("mo.title")}</div>
      <p className="muted small">{t("mo.intro")}</p>
      <div className="money-costs">
        <label>{t("mo.costClear")}<input type="number" min={0} step={1000} value={costs.clearInr} onChange={(e) => setCosts({ ...costs, clearInr: Math.max(1, Number(e.target.value) || 1) })} /></label>
        <label>{t("mo.costPump")}<input type="number" min={0} step={1000} value={costs.pumpInr} onChange={(e) => setCosts({ ...costs, pumpInr: Math.max(1, Number(e.target.value) || 1) })} /></label>
      </div>
      {pts.length < 2 ? <p className="hint">{t("mo.nothing")}</p> : (
        <>
          <Chart pts={pts} pick={p} onPick={setPick} />
          <p className="small">{t("mo.axis")}</p>
          <p className="small"><b>{t("mo.pick", { cost: formatInr(pts[p].cost), from: pts[0].flagged, to: pts[p].flagged })}</b>
            {p > 0 ? " " + t("mo.what", { n: drains, pumps: pumps ? t("mo.withPumps") : "" }) : ""}</p>
          <input type="range" min={0} max={pts.length - 1} value={p} onChange={(e) => setPick(Number(e.target.value))} aria-label={t("mo.slider")} />
          <button className="btn" disabled={p === 0} onClick={() => { apply(planPatch(sc, pts, p)); setPick(0); }}>{t("mo.apply")}</button>
        </>
      )}
      <p className="fineprint">{t("mo.disclaimer")}</p>
    </section>
  );
}
