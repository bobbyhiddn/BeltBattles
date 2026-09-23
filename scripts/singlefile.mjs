// V4: inline the Vite build (JS + CSS) into one HTML file, then prove it loads from
// file:// in headless chromium and completes a scripted run with real input:
// buy -> place -> FIGHT -> battle end -> round summary -> ... -> run summary.
// Desk uses the mouse (drag and drop); phone uses touch taps (tap-to-select, tap-to-place).
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node scripts/singlefile.mjs <out.html> [log.txt]

import { chromium } from "playwright-core";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { VIEWS } from "./shots-list.mjs";
import { scriptedRun } from "./playthrough.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = join(ROOT, "dist");
const OUT = resolve(process.argv[2] ?? join(ROOT, "BeltBattles-single.html"));
const LOG = process.argv[3] ? resolve(process.argv[3]) : null;
const lines = [];
const log = (s) => { lines.push(s); console.log(s); };

async function inline() {
  let html = await readFile(join(DIST, "index.html"), "utf8");
  const assets = await readdir(join(DIST, "assets"));
  for (const f of assets.filter((a) => a.endsWith(".css"))) {
    const css = await readFile(join(DIST, "assets", f), "utf8");
    html = html.replace(new RegExp(`<link[^>]*href="\\./assets/${f}"[^>]*>`), () => `<style>${css}</style>`);
  }
  const scripts = assets.filter((a) => a.endsWith(".js"));
  if (scripts.length !== 1) throw new Error(`expected one JS chunk, found ${scripts.length}`);
  const js = (await readFile(join(DIST, "assets", scripts[0]), "utf8")).replace(/<\/script/gi, "<\\/script");
  const tag = new RegExp(`<script[^>]*src="\\./assets/${scripts[0]}"[^>]*></script>`);
  if (!tag.test(html)) throw new Error("module script tag not found in dist/index.html");
  html = html.replace(tag, () => `<script type="module">${js}</script>`);
  if (/src="\.\/assets\//.test(html) || /href="\.\/assets\//.test(html)) throw new Error("external asset reference left");
  await writeFile(OUT, html);
  log(`inlined ${scripts[0]} (${js.length} bytes) -> ${OUT} (${html.length} bytes)`);
}

// 0.6.0: the local ghost pool each run starts with (as if this browser had played before). Desk
// plays all 10 days (reload on day 4, a pool ghost); phone plays 3 days (reload on day 2). The
// strong day-2 ghost makes sure a dusk is lost (5 -> 4 lives); day 3 has no ghost: a stand-in.
// Days 5-10 on desk are under-built decks (the honest deck of 2 days earlier), so this simple
// script (2 gates a day) plays all 10 days. M3b: every seeded ghost is an honest deck (tooling.ts
// makeGhost -> honest.ts: whole plating, deckCost within maxGoldByDay(day)); the log shows each
// dusk foe's hullBonus and deckCost and fails the run if one is not honest.
const G = (day, hero, wins, losses, power = 0) => ({ day, hero, wins, losses, power, runId: "earlier-run" });
// 0.6.0b road fork: `roads` is each day's fork pick (v event, e/m/h the warlord of that tier).
// Desk picks every tier at least twice and the event three times, and takes the Hard slot on day 8
// (the Iron Matriarch, R3); phone (touch) picks by tap (inspect, then go) and reloads in the middle
// of day 2's Medium warlord fight, which must resume as the same fight.
const RUNS = {
  desk: {
    days: 10, reloadDay: 4, roads: "emhvemvhhv", check: "desk",
    pool: [G(1, "weaver", 0, 0), G(2, "furnace", 1, 0, 6), G(4, "weaver", 2, 1), G(5, "furnace", 3, 1, -2), G(6, "weaver", 3, 2, -2),
      G(7, "furnace", 4, 2, -2), G(8, "weaver", 5, 2, -2), G(9, "furnace", 5, 3, -2), G(10, "weaver", 6, 3, -2)],
  },
  phone: { days: 3, roads: "emv", reloadWarlordDay: 2, check: "phone", pool: [G(1, "weaver", 0, 0), G(2, "furnace", 1, 0, 6)] },
};

async function main() {
  await inline();
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"] });
  const url = pathToFileURL(OUT).href;
  let failed = 0;
  for (const vname of ["desk", "phone"]) {
    const ctx = await browser.newContext(VIEWS[vname]);
    const page = await ctx.newPage();
    // pin the new-run seed (the hero screen seeds from Math.random) so the run is reproducible:
    // both pins give the WRECKED RAIDER salvage as round 1's intro event, so REFIT comes up
    const pin = vname === "desk" ? 0.3 : 0.5;
    await page.addInitScript((r) => { Math.random = () => r; }, pin);
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
    page.on("requestfailed", (r) => errors.push(`requestfailed: ${r.url()}`));
    log(`\n== ${vname} (${VIEWS[vname].viewport.width}x${VIEWS[vname].viewport.height} @${VIEWS[vname].deviceScaleFactor}, ${VIEWS[vname].hasTouch ? "touch" : "mouse"}) ${url}`);
    try {
      await page.goto(url);
      await page.waitForFunction(() => !!window.bb && window.bb.screen() === "title", null, { timeout: 15000 });
      log(`loaded from file:// : title screen up, version ${await page.evaluate(() => window.bb.version)} (Math.random pinned to ${pin} -> run seed ${(pin * 0x7fffffff) | 0})`);
      await scriptedRun(page, !!VIEWS[vname].hasTouch, log, RUNS[vname]);
    } catch (e) {
      failed++;
      log(`FAILED: ${e.message}`);
    }
    log(errors.length ? `console errors (${errors.length}):\n  ${errors.join("\n  ")}` : "console errors: 0");
    if (errors.length) failed++;
    await ctx.close();
  }
  await browser.close();
  log(failed ? `\nRESULT: FAIL (${failed})` : "\nRESULT: PASS (desk 10-day + phone 3+-day scripted runs, honest dusk decks, no console errors)");
  if (LOG) await writeFile(LOG, lines.join("\n") + "\n");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
