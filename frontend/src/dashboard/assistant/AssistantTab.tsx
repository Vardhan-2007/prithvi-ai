import { useRef, useState } from "react";
import { useStore } from "../../store";
import { useT } from "../../components/i18n/i18n";
import { api, type AssistantReply } from "../../components/api/client";
import { localAnswer } from "./localRetrieval";

interface Turn { q: string; a: AssistantReply; via: "api" | "local" }
const SUGGEST = ["q1", "q2", "q3", "q4", "q5"];

export function AssistantTab() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const sc = useStore((s) => s.scenario); const res = useStore((s) => s.result)!; const base = useStore((s) => s.baseline)!;
  const live = useStore((s) => s.live);
  const [q, setQ] = useState(""); const [turns, setTurns] = useState<Turn[]>([]); const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const ctx = `${sc.rainfallMm} mm over ${sc.durationH} h, ${Math.round(sc.blockageFrac * 100)}% of proxy drain inlets blocked; mean risk index ${res.meanIndex.toFixed(1)} (baseline ${base.meanIndex.toFixed(1)}); ${res.bandCounts.higher + res.bandCounts.highest} zones in the Higher/Highest band${live ? `; simulated flooded area ${live.floodedHa.toFixed(1)} ha at the current time` : ""}.`;

  const ask = async (text: string) => {
    const query = text.trim(); if (!query || busy) return;
    setBusy(true); setQ("");
    let reply: AssistantReply, via: "api" | "local" = "api";
    try { reply = await api.assistant(query, ctx); } catch { via = "local"; reply = await localAnswer(query, ctx); }
    setTurns((p) => [...p, { q: query, a: reply, via }]); setBusy(false);
    setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  return (
    <div className="stack assistant">
      <section className="card">
        <div className="card-kicker">{t("as.title")}</div>
        <p className="muted small">{t("as.note")}</p>
        {lang === "te" ? <p className="fineprint">{t("as.teNote")}</p> : null}
        <div className="chips">{SUGGEST.map((k) => <button key={k} className="chip" onClick={() => ask(t(`as.${k}`))}>{t(`as.${k}`)}</button>)}</div>
      </section>
      {turns.map((x, i) => (
        <section className="card chat" key={i}>
          <div className="q">{x.q}</div>
          {x.a.answer.split("\n\n").map((p, j) => <p key={j} className={x.a.abstained ? "abstain" : ""}>{p}</p>)}
          {x.a.citations.length ? (
            <div className="cites">{x.a.citations.map((c) => (
              <div key={c.doc_id}>[{c.n}] {c.url.startsWith("http") ? <a href={c.url} target="_blank" rel="noreferrer">{c.title}</a> : <span>{c.title}</span>}<small> — {c.publisher}</small></div>
            ))}</div>
          ) : null}
          <div className="muted small">{x.a.abstained ? t("as.abstained") : t("as.extractive")} · {x.via === "api" ? t("as.viaApi") : t("as.viaLocal")}</div>
        </section>
      ))}
      <div ref={end} />
      <form className="ask" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("as.placeholder")} aria-label={t("as.placeholder")} />
        <button className="btn primary" disabled={busy || !q.trim()}>{t("as.ask")}</button>
      </form>
    </div>
  );
}
