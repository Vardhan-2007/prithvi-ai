import fs from "node:fs";
import { build, M } from "./script.mjs";
const scenes = build();
const hasShort = (b) => !!b.short;
const onScreen = (b) => {
  const o = [];
  if (b.card) o.push(`card: ${b.card.title || b.card.big || b.card.kick}${b.card.sub ? " — " + b.card.sub : ""}`);
  if (b.diag) o.push(`animated diagram: ${b.diag.name}`);
  if (b.kpi) o.push(`number panel: ${b.kpi.title}`);
  if (b.callouts) o.push("callouts: " + b.callouts.filter((c) => c.label).map((c) => c.label).join(" · "));
  if (b.film) o.push("cinematic film shot (letterbox, night/storm/dawn grade, live clock)");
  if (b.app?.tab) o.push(`right panel tab: ${b.app.tab}`);
  if (b.app?.view && b.app.view !== "3d") o.push(`view: ${b.app.view}`);
  if (b.app?.simKeys || b.app?.simAt !== undefined) o.push("flood simulation on screen");
  if (b.app?.path || b.app?.cam) o.push("camera move");
  return o.join("; ") || "the live app";
};
let md = `# PRITHVI AI — explainer video script and shot list

Two cuts from one script:
* **Full video** — a cinematic fictional story (about 3 minutes), then the full walkthrough of every feature, value and calculation.
* **Short cut (under 5 minutes)** — the story in brief, then the key features. Lines marked **[short]** are the words used in the short cut; beats without one are skipped there.

Narrated by an offline neural voice. Every number is measured from the running prototype (see \`video/measures.json\`). The story is **fictional**: Meera is an invented engineer; nothing in it happened.

`;
for (const s of scenes) {
  md += `\n## ${s.part ? s.part.kick.replace("PART", "Part") + " — " + s.part.title : s.id === "film" ? "The story (fictional night in Kakinada)" : s.id === "intro" ? "Title and who this is for" : "Closing"}\n`;
  for (const b of s.beats) {
    md += `\n**${b.id}** — _on screen:_ ${onScreen(b)}\n\n> ${b.say.replace(/\n/g, " ")}\n`;
    if (hasShort(b)) md += `\n> **[short]** ${b.short}\n`;
  }
}
md += `\n---\n_AI-tool disclosure: this video and its script were produced with an AI assistant; the team is responsible for its content._\n`;
fs.mkdirSync("../docs/demo", { recursive: true });
fs.writeFileSync("../docs/demo/video-script.md", md);
const words = (k) => scenes.flatMap((s) => s.beats).map((b) => (k === "long" ? b.say : b.short || "")).join(" ").split(/\s+/).filter(Boolean).length;
console.log("beats:", scenes.reduce((a, s) => a + s.beats.length, 0), "| words long:", words("long"), "short:", words("short"));
