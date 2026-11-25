import { useState } from "react";
import { useStore } from "../../store";
import { useT } from "../../components/i18n/i18n";
import type { ObservedReport } from "../../scenarios/engine/replay";
import { checkInput, DEPTHS, exportJson, isInsidePilot, parseLatLon, saveFieldReports, toReport, type Depth } from "../../scenarios/engine/fieldReports";

const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);   // India date

/** Log waterlogging seen on the ground; saved on this device, counted by the Replay check, downloadable for review. */
export function FieldReportsCard({ list, setList }: { list: ObservedReport[]; setList: (l: ObservedReport[]) => void }) {
  const t = useT();
  const ds = useStore((s) => s.ds)!;
  const zoneId = useStore((s) => s.selectedZoneId);
  const [date, setDate] = useState(today);
  const [place, setPlace] = useState("");
  const [where, setWhere] = useState("");
  const [depth, setDepth] = useState<Depth>("unknown");
  const [note, setNote] = useState("");
  const [by, setBy] = useState("");
  const [msg, setMsg] = useState<string>("");

  const zone = zoneId ? ds.zones.zones.find((z) => z.id === zoneId) : undefined;
  const fromZone = () => {
    if (!zone) { setMsg(t("fr.pickZone")); return; }
    const { origin, m_per_deg } = ds.meta;
    setWhere(`${(origin.lat + zone.cy / m_per_deg.lat).toFixed(5)}, ${(origin.lon + zone.cx / m_per_deg.lon).toFixed(5)}`);
    setMsg("");
  };
  const save = () => {
    const ll = parseLatLon(where);
    const input = { date, place, lat: ll?.lat ?? Number.NaN, lon: ll?.lon ?? Number.NaN, depth, note, by };
    const errs = checkInput(input, today());
    if (errs.length) { setMsg(t("fr.fix", { what: errs.map((e) => t(`fr.err.${e}`)).join(", ") })); return; }
    const id = Date.now().toString(36);
    const next = [...list, toReport(input, today(), id)];
    setList(next);
    const ok = saveFieldReports(next);
    setMsg((ok ? t("fr.saved") : t("fr.notStored")) + (isInsidePilot(ds, input.lat, input.lon) ? "" : " " + t("fr.outside")));
    setPlace(""); setNote("");
  };
  const remove = (i: number) => { const next = list.filter((_, k) => k !== i); setList(next); saveFieldReports(next); };
  const download = () => {
    const url = URL.createObjectURL(new Blob([exportJson(list)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = `prithvi-field-reports-${today()}.json`; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section className="card">
      <div className="card-kicker">{t("fr.title")}</div>
      <p className="muted small">{t("fr.intro")}</p>
      <div className="form-grid">
        <label>{t("fr.date")}<input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></label>
        <label>{t("fr.depth")}
          <select value={depth} onChange={(e) => setDepth(e.target.value as Depth)}>
            {DEPTHS.map((d) => <option key={d} value={d}>{t(`fr.d.${d}`)}</option>)}
          </select>
        </label>
        <label className="wide">{t("fr.place")}<input value={place} maxLength={120} onChange={(e) => setPlace(e.target.value)} placeholder={t("fr.placeEg")} /></label>
        <label className="wide">{t("fr.where")}
          <span className="inline"><input value={where} onChange={(e) => setWhere(e.target.value)} placeholder="16.9510, 82.2341" />
            <button className="btn ghost" type="button" onClick={fromZone}>{t("fr.useZone")}</button></span>
        </label>
        <label className="wide">{t("fr.note")}<input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></label>
        <label className="wide">{t("fr.by")}<input value={by} maxLength={60} onChange={(e) => setBy(e.target.value)} /></label>
      </div>
      <button className="btn primary" onClick={save}>{t("fr.save")}</button>
      {msg ? <p className="hint">{msg}</p> : null}
      {list.length ? (
        <>
          <ul className="why">
            {list.map((r, i) => (
              <li key={r.source_url + i}>{r.event_date} · {r.place_name} · {t(`fr.d.${(r.depth_reported ?? "unknown") as Depth}`)}
                {" "}<button className="link" onClick={() => remove(i)}>{t("fr.delete")}</button></li>
            ))}
          </ul>
          <button className="btn" onClick={download}>{t("fr.download", { n: list.length })}</button>
        </>
      ) : null}
      <p className="fineprint">{t("fr.privacy")}</p>
    </section>
  );
}
