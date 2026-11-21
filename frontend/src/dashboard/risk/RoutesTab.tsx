import { useStore } from "../../store";
import { useT } from "../../components/i18n/i18n";
import { useRoute } from "./useRoute";

export function RoutesTab() {
  const t = useT();
  const ds = useStore((s) => s.ds)!;
  const from = useStore((s) => s.routeFrom); const to = useStore((s) => s.routeTo);
  const thr = useStore((s) => s.routeThreshold); const setRoute = useStore((s) => s.setRoute);
  const r = useRoute();
  const opts = ds.facilities.filter((f) => f.category !== "other");
  const detour = r && r.base.found && r.scn.found ? ((r.scn.lengthM - r.base.lengthM) / r.base.lengthM) * 100 : null;
  return (
    <div className="stack">
      <section className="card">
        <div className="card-kicker">{t("rt.title")}<span className="tag sim">{t("tag.simulated")}</span></div>
        <label className="field">{t("rt.from")}
          <select value={from ?? ""} onChange={(e) => setRoute({ routeFrom: e.target.value })}>
            {opts.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select></label>
        <label className="field">{t("rt.to")}
          <select value={to ?? ""} onChange={(e) => setRoute({ routeTo: e.target.value })}>
            {opts.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select></label>
        <label className="slider"><span className="slider-head"><span>{t("rt.threshold")}</span><b>{thr.toFixed(2)} m</b></span>
          <input type="range" min={0.1} max={0.6} step={0.05} value={thr} onChange={(e) => setRoute({ routeThreshold: Number(e.target.value) })} />
          <span className="hint">{t("rt.thresholdHint")}</span></label>
      </section>
      <section className="card">
        {!r ? <div className="muted">{t("rt.pickTwo")}</div> : (
          <>
            <div className="kv"><span>{t("rt.baseline")}</span><b>{r.base.found ? `${(r.base.lengthM / 1000).toFixed(2)} km` : t("rt.noPath")}</b></div>
            <div className="kv"><span>{t("rt.scenario")}</span><b>{r.scn.found ? `${(r.scn.lengthM / 1000).toFixed(2)} km` : t("rt.cut")}</b></div>
            {detour !== null ? <div className="kv"><span>{t("rt.detour")}</span><b className={detour > 1 ? "up" : ""}>{detour >= 0 ? "+" : ""}{detour.toFixed(0)} %</b></div> : null}
            <div className="kv"><span>{t("rt.blockedKm")}</span><b>{r.blockedKm.toFixed(2)} km</b></div>
            <div className={"verdict " + (r.scn.found ? (detour && detour > 1 ? "warn" : "ok") : "bad")}>
              {!r.base.found ? t("rt.disconnected") : r.scn.found ? (detour && detour > 1 ? t("rt.detourFound") : t("rt.noChange")) : t("rt.cutText")}
            </div>
            <div className="muted small">{t("rt.drawn")}</div>
          </>
        )}
        <p className="fineprint">{t("rt.disclaimer")}</p>
      </section>
    </div>
  );
}
