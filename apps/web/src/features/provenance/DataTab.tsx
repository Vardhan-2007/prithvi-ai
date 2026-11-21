import { useStore } from "../../app/store";
import { useT } from "../../shared/utils/i18n";

export function DataTab() {
  const t = useT();
  const ds = useStore((s) => s.ds)!;
  return (
    <div className="stack">
      <section className="card warn-card">
        <div className="card-kicker">{t("dt.limits")}</div>
        <ul className="why">
          {["l1", "l2", "l3", "l4", "l5", "l6"].map((k) => <li key={k}>{t(`dt.${k}`)}</li>)}
        </ul>
        <p className="fineprint">{t("disclaimer")}</p>
      </section>
      <section className="card">
        <div className="card-kicker">{t("dt.layers")} — {ds.meta.name}</div>
        {ds.layers.map((l) => (
          <details key={l.id} className="layer">
            <summary><b>{l.title}</b><span className={`tag st-${l.data_status}`}>{t(`status.${l.data_status}`)}</span></summary>
            <dl>
              <dt>{t("dt.source")}</dt><dd>{l.source_url ? <a href={l.source_url} target="_blank" rel="noreferrer">{l.source_name}</a> : l.source_name}</dd>
              <dt>{t("dt.retrieved")}</dt><dd>{l.retrieved_at || "–"}</dd>
              <dt>{t("dt.licence")}</dt><dd>{l.licence_or_terms}</dd>
              <dt>{t("dt.resolution")}</dt><dd>{l.native_resolution_or_scale}</dd>
              <dt>{t("dt.method")}</dt><dd>{l.processing_method}</dd>
              <dt>{t("dt.limits1")}</dt><dd>{l.known_limitations}</dd>
            </dl>
          </details>
        ))}
        <p className="fineprint">{t("dt.attribution")}</p>
      </section>
      <section className="card">
        <div className="card-kicker">{t("dt.method.title")}</div>
        <code className="formula">RiskIndex = 100 × (0.30·T + 0.25·R + 0.25·D + 0.20·E)</code>
        <ul className="why">{["m1", "m2", "m3", "m4"].map((k) => <li key={k}>{t(`dt.${k}`)}</li>)}</ul>
        <p className="fineprint">{t("dt.ai")}</p>
      </section>
    </div>
  );
}
