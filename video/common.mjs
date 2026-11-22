import puppeteer from "puppeteer-core";
import path from "node:path";
import fs from "node:fs";
export const CHROME = fs.readdirSync("browsers/chrome").filter((d) => d.startsWith("mac_arm")).map((d) => `browsers/chrome/${d}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`)[0];
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function launch(w = 1920, h = 1080) {
  const browser = await puppeteer.launch({ executablePath: path.resolve(CHROME), headless: "new",
    args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--no-sandbox", "--hide-scrollbars", "--force-color-profile=srgb"],
    defaultViewport: { width: w, height: h, deviceScaleFactor: 1 } });
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle2", timeout: 90000 });
  await page.waitForFunction(() => window.__prithvi?.getState().ds && window.__scene, { timeout: 90000 });
  await page.evaluate(async () => {
    window.SIM = await import("/src/maps/twin3d/sim/simController.ts");
    window.RISK = await import("/src/scenarios/engine/risk.ts");
    window.ROUTE = await import("/src/scenarios/engine/routing.ts");
    window.LIVE = await import("/src/maps/twin3d/sim/liveStats.ts");
    window.SIM.simData.playing = false; window.__prithvi.getState().setPlaying(false);
  });
  return { browser, page };
}
/** apply a scenario and wait until the worker has computed every snapshot */
export async function runScenario(page, sc) {
  await page.evaluate((sc) => { const s = window.__prithvi.getState(); s.applyScenario({ overrides: {}, pumps: false, ...sc }); window.SIM.simData.playing = false; s.setPlaying(false); }, sc);
  await page.waitForFunction(() => window.SIM.simData.done && window.SIM.simData.snaps.length === window.SIM.simData.total + 1, { timeout: 300000, polling: 400 });
  await page.evaluate(() => { window.SIM.simData.playing = false; window.__prithvi.getState().setPlaying(false); });
}
