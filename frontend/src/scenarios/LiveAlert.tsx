import { useState } from "react";
import { useStore } from "../store";
import { useT } from "../components/i18n/i18n";
import { BriefSheet, useBrief } from "../dashboard/risk/BriefSheet";

/** One-line answer to "do we need to act?" for the live forecast, with the officer brief one click away. */
export function LiveAlert({ hours }: { hours: number }) {
  const t = useT();
  const brief = useBrief();
  const stage = useStore((s) => s.result?.stage);
  const [open, setOpen] = useState(false);
  if (!brief) return null;
  const { sure, maybe } = brief.counts;
  const level = sure > 0 ? "act" : maybe > 0 ? "watch" : "calm";
  return (
    <div className={`live-alert ${level}`} role="status">
      <b>{t(`alert.${level}`, { h: hours, sure, maybe })}</b>
      {stage !== "final" ? <small>{t("alert.prov")}</small> : null}
      {level !== "calm" ? <button className="btn" onClick={() => setOpen(true)}>{t("br.open")}</button> : null}
      {open ? <BriefSheet onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
