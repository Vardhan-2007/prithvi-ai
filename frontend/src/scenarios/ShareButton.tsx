import { useState } from "react";
import { useStore } from "../store";
import { useT } from "../components/i18n/i18n";
import { shareUrl } from "./engine/share";

/** Copies a link that opens this exact scenario (rain, storm, blockage, drains, pumps, ground and sea). */
export function ShareButton() {
  const t = useT();
  const sc = useStore((s) => s.scenario);
  const [state, setState] = useState<"idle" | "ok" | "manual">("idle");
  const [url, setUrl] = useState("");
  const copy = async () => {
    const u = shareUrl(sc, window.location.href);
    setUrl(u);
    try { window.history.replaceState(null, "", u); } catch { /* ignore */ }
    try { await navigator.clipboard.writeText(u); setState("ok"); } catch { setState("manual"); }
    window.setTimeout(() => setState((s) => (s === "ok" ? "idle" : s)), 2500);
  };
  return (
    <>
      <button className="btn ghost" onClick={() => { void copy(); }} title={t("share.hint")}>{state === "ok" ? t("share.copied") : t("share.copy")}</button>
      {state === "manual" ? <input className="share-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label={t("share.copy")} /> : null}
    </>
  );
}
