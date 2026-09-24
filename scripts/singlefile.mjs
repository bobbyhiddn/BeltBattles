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
// 0.6.0c: this desk seed draws HERALD on day 2 and SCOUT on day 3: desk takes HERALD's STAKE 3
// (the bounty rides on day 4's Hard warlord, HIGHSPIRE) and SCOUT's SPY (dusk must fight the
// revealed deck), keeping that gold at dawn; day 1 tries the Hard OLD BULWARK (the deck that needs
// the 2-part fill). The run must lose a dusk from 5 to 4 lives and the day-4 dusk reload must meet
// the same ghost (playthrough.mjs throws otherwise). Trials: with day 1 Easy, every Hard warlord on
// days 4-7 beat the deck and the stake was lost; this road string wins day 4 and pays the bounty.
const RUNS = {
  desk: {
    days: 10, reloadDay: 4, roads: "hvvhmemhev", check: "desk", take: { herald: ["STAKE 3", 3], scout: ["SPY", 1] },
    pool: [G(1, "weaver", 0, 0), G(2, "furnace", 1, 0, 6), G(4, "weaver", 2, 1), G(5, "furnace", 3, 1, -2), G(6, "weaver", 3, 2, -2),
      G(7, "furnace", 4, 2, -2), G(8, "weaver", 5, 2, -2), G(9, "furnace", 5, 3, -2), G(10, "weaver", 6, 3, -2)],
  },
  phone: { days: 3, roads: "emv", reloadWarlordDay: 2, check: "phone", pool: [G(1, "weaver", 0, 0), G(2, "furnace", 1, 0, 6)] },
  // 0.6.0d item 9, the feel check (logged, never pass/fail on the outcome): a fresh player with an
  // empty ghost pool, so every dusk is a stand-in with its full-purse pool deck, from day 1 until the
  // run ends, once per hero on the same run seed (so both meet the same captains and decks). The
  // player spends like a new player would: up to 8 planned parts a dawn (not the desk run's 2).
  // Roads: an event on odd days, an Easy or Medium warlord on even days (never a life at stake).
  "fresh-furnace": { days: 10, roads: "vevmvevmve", check: "fresh", hero: "furnace", buys: 8, pool: [] },
  "fresh-weaver": { days: 10, roads: "vevmvevmve", check: "fresh", hero: "weaver", buys: 8, pool: [] },
};
// the view and Math.random pin of each run (fresh runs: desk, the desk run's seed)
const PLAN = [["desk", "desk", 0.3], ["phone", "phone", 0.5], ["fresh-furnace", "desk", 0.3], ["fresh-weaver", "desk", 0.3]];

async function main() {
  await inline();
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"] });
  const url = pathToFileURL(OUT).href;
  let failed = 0;
  for (const [rname, vname, pin] of PLAN) {
    const ctx = await browser.newContext(VIEWS[vname]);
    const page = await ctx.newPage();
    // pin the new-run seed (the hero screen seeds from Math.random) so the run is reproducible:
    // both pins give the WRECKED RAIDER salvage as round 1's intro event, so REFIT comes up
    await page.addInitScript((r) => { Math.random = () => r; }, pin);
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
    page.on("requestfailed", (r) => errors.push(`requestfailed: ${r.url()}`));
    log(`\n== ${rname} (${VIEWS[vname].viewport.width}x${VIEWS[vname].viewport.height} @${VIEWS[vname].deviceScaleFactor}, ${VIEWS[vname].hasTouch ? "touch" : "mouse"}) ${url}`);
    try {
      await page.goto(url);
      await page.waitForFunction(() => !!window.bb && window.bb.screen() === "title", null, { timeout: 15000 });
      log(`loaded from file:// : title screen up, version ${await page.evaluate(() => window.bb.version)} (Math.random pinned to ${pin} -> run seed ${(pin * 0x7fffffff) | 0})`);
      await scriptedRun(page, !!VIEWS[vname].hasTouch, log, RUNS[rname]);
    } catch (e) {
      failed++;
      log(`FAILED: ${e.message}`);
    }
    log(errors.length ? `console errors (${errors.length}):\n  ${errors.join("\n  ")}` : "console errors: 0");
    if (errors.length) failed++;
    await ctx.close();
  }
  await browser.close();
  log(failed ? `\nRESULT: FAIL (${failed})` : "\nRESULT: PASS (desk 10-day + phone 3+-day scripted runs, fresh-player FURNACE + WEAVER runs to the end, honest dusk decks, no console errors)");
  if (LOG) await writeFile(LOG, lines.join("\n") + "\n");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
