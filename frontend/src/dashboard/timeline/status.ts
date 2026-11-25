// The one plain sentence under the timeline: what is happening right now. Pure function, so it can be tested.
// It follows the actual rain curve, so it is right for the symmetric what-if storm and for hourly forecast / replay storms.
import type { LiveStats } from "../../maps/twin3d/sim/liveStats";
import { PEAK_FRACTION, stormDurationH, stormPeakMmH, type Storm } from "../../maps/twin3d/sim/storm";

type T = (k: string, p?: Record<string, string | number>) => string;
/** the rain counts as "at its peak" while it is within this share of the storm's peak rate */
export const PEAK_SHARE = 0.9;

/** when the rain peaks, seconds from the start (middle of the strongest step for a step storm) */
export function stormPeakAtS(s: Storm): number {
  if (s.kind === "triangle") return PEAK_FRACTION * s.durationH * 3600;
  let k = 0; s.mm.forEach((v, i) => { if (v > s.mm[k]) k = i; });
  return (k + 0.5) * s.stepH * 3600;
}

export function statusSentence(t: T, live: LiveStats | null, storm: Storm): string {
  if (!live) return "";
  const D = stormDurationH(storm) * 3600, peak = stormPeakMmH(storm), parts: string[] = [];
  if (live.cumRainMm < 0.3) return t("st.dry");
  if (live.t < D) {
    const r = Math.round(live.rainMmH);
    if (live.rainMmH < 0.5) parts.push(t("st.lull"));                                   // a dry hour inside a forecast or replayed storm
    else if (peak > 0 && live.rainMmH >= PEAK_SHARE * peak) parts.push(t("st.peak", { r }));
    else parts.push(t(live.t < stormPeakAtS(storm) ? "st.rising" : "st.easing", { r }));
  } else if (live.floodedHa < 0.05) return t("st.done");   // nothing is ankle-deep any more
  else parts.push(t("st.after"));
  parts.push(live.floodedHa >= 0.05 ? t("st.water", { ha: live.floodedHa.toFixed(1), d: live.maxDepth.toFixed(1) }) : live.t < D ? t("st.none") : "");
  if (live.facilitiesAffected > 0) parts.push(t("st.fac", { n: live.facilitiesAffected }));
  return parts.filter(Boolean).join(" ");
}
