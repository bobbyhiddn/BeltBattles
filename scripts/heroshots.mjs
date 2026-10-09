// 0.8.0 H1 M5 (REQ-BFG-011, REQ-BFG-032): FOUNDRY's and BASTION's screens in the browser, on the desk (1920x1080, mouse),
// the phone (390x844, touch) and a small landscape phone (667x375, touch), from the single-file page loaded from file://
// (scripts/inline.mjs), as singlefile.mjs plays it:
//  - hero select with each of the four heroes on show (real taps on >);
//  - a FOUNDRY and a BASTION dawn (GO by a real tap), their signature's inspect panel (a real tap on the CRUCIBLE or the
//    WARDWORKS), and FOUNDRY's belt panel with its SYNC line and mark;
//  - a dusk battle of each, caught on the frame where the weld flash (FUSE) or the CLANK plays, and where a hit has just
//    taken plating (the strip's white segments, a rune-blue number), with the SYNC mark on FOUNDRY's gun; then each result
//    card with its rows (FUSED SLUGS; PLATING GAINED and SPENT).
// Battles step the game's own fixed clock in the page (window.bb.game.step), so the frames are reproducible.
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node scripts/heroshots.mjs <outDir> [--dist <build dir>]
// Writes <outDir>/<shot>-<view>.png and <outDir>/heroshots.log; exits non-zero on any console error or failed step.

import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { VIEWS as SHOT_VIEWS } from "./shots-list.mjs";
import { inlineBuild } from "./inline.mjs";
import { autoFight } from "./scouthook.mjs"; // SCOUT-1 (REQ-BFG-076): the FIGHT step (bb.fight(true): battles skip scouting)

const ROOT = new URL("..", import.meta.url).pathname;
const argv = process.argv.slice(2);
const di = argv.indexOf("--dist");
const DIST = resolve(di >= 0 ? argv[di + 1] : join(ROOT, "dist"));
const OUT = resolve(argv.filter((_, i) => di < 0 || (i !== di && i !== di + 1))[0] ?? join(ROOT, "shots-h1"));
const VIEWS = {
  desk: SHOT_VIEWS.desk,
  phone: SHOT_VIEWS.phone,
  land: { viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const lines = [];
const log = (s) => { lines.push(s); console.log(s); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function settle(page, screen, timeout = 20000) {
  await page.waitForFunction((s) => window.bb.screen() === s && !window.bb.game.transitioning, screen, { timeout });
}

async function tapAt(page, touch, p) {
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  await sleep(150);
}

async function tapRegion(page, touch, id) {
  await page.waitForFunction((i) => window.bb.regions().some((r) => r.id === i), id, { timeout: 15000 });
  const p = await page.evaluate((i) => {
    const r = window.bb.regions().filter((q) => q.id === i).pop();
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }, id);
  await tapAt(page, touch, p);
}

async function shot(page, name, vname) {
  const file = join(OUT, `${name}-${vname}.png`);
  await page.screenshot({ path: file });
  log(`  ${name}-${vname}.png`);
}

/** Hero select: tap > until `hero` is on show (the roster loops). */
async function showHero(page, touch, hero) {
  for (let k = 0; k < 4 && (await page.evaluate(() => window.bb.game.screen.current)) !== hero; k++) await tapRegion(page, touch, "next");
  await page.waitForFunction((h) => window.bb.game.screen.current === h, hero, { timeout: 5000 });
  await sleep(700); // the carousel's slide-in
}

/** A real tap on the deck's signature factory; its inspect panel opens. */
async function tapSignature(page, touch, def) {
  const at = await page.evaluate((d) => {
    const s = window.bb.game.screen, p = window.bb.game.run.build.items.find((q) => q.def === d);
    const c = s.fuseAnimPos({ where: "deck", survivor: p.uid });
    return { uid: p.uid, ...window.bb.toClient(c.x, c.y) };
  }, def);
  await tapAt(page, touch, at);
  await page.waitForFunction((u) => { const s = window.bb.game.screen.sel; return s && s.kind === "item" && s.uid === u; }, at.uid, { timeout: 5000 });
  await sleep(200);
}

/** In-page: open a dusk of `hero` (its starting deck, a stand-in foe) and step until `until` holds; render. */
async function duskUntil(page, hero, until, maxFrames = 60 * 60) {
  return page.evaluate(({ hero, until, maxFrames }) => {
    const bb = window.bb, g = bb.game;
    bb.openDusk({ hero, day: 3, seed: 4242, wins: 1, losses: 1, lives: 5 });
    for (let i = 0; i < 30; i++) g.step(1 / 60); // the wipe into the battle
    const test = new Function("a", `return (${until});`);
    let n = 0;
    for (; n < maxFrames; n++) {
      g.step(1 / 60);
      const a = g.screen.arena;
      if (a && g.screen.phase === "fight" && test(a)) break;
    }
    g.render();
    const a = g.screen.arena;
    return { frames: n, t: a ? a.b.t : -1, found: n < maxFrames, foe: g.screen.foeName ?? "" };
  }, { hero, until, maxFrames });
}

/** In-page: step on from the current frame until `until` holds; render. */
async function stepUntil(page, until, maxFrames = 60 * 60) {
  return page.evaluate(({ until, maxFrames }) => {
    const g = window.bb.game;
    const test = new Function("a", `return (${until});`);
    let n = 0;
    for (; n < maxFrames; n++) {
      g.step(1 / 60);
      const a = g.screen.arena;
      if (a && g.screen.phase === "fight" && test(a)) break;
    }
    g.render();
    return { frames: n, t: g.screen.arena?.b.t ?? -1, found: n < maxFrames };
  }, { until, maxFrames });
}

/** In-page: SKIP to the result card; render. Returns the card's rows. */
async function toResult(page) {
  return page.evaluate(() => {
    const g = window.bb.game;
    g.screen.skip();
    for (let i = 0; i < 900 && g.screen.phase !== "result"; i++) g.step(1 / 60);
    for (let i = 0; i < 40; i++) g.step(1 / 60);
    g.render();
    const r = g.run.history[g.run.history.length - 1];
    return { phase: g.screen.phase, outcome: r?.outcome, race: r?.race ?? null };
  });
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const { html } = await inlineBuild(DIST);
  const page0 = join(ROOT, "..", "tmp", "h1-heroshots.html");
  await writeFile(page0, html);
  const url = pathToFileURL(page0).href;
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"] });
  let failed = 0;
  for (const [vname, vopts] of Object.entries(VIEWS)) {
    const touch = !!vopts.hasTouch;
    const ctx = await browser.newContext(vopts);
    await autoFight(ctx); // SCOUT-1: battles skip scouting, as before SCOUT-1
    const page = await ctx.newPage();
    await page.addInitScript(() => { Math.random = () => 0.3; }); // the run seed, as singlefile.mjs pins it
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
    page.on("requestfailed", (r) => errors.push(`requestfailed: ${r.url()}`));
    log(`\n== ${vname} (${vopts.viewport.width}x${vopts.viewport.height} @${vopts.deviceScaleFactor}, ${touch ? "touch" : "mouse"})`);
    try {
      await page.goto(url);
      await page.waitForFunction(() => !!window.bb && window.bb.screen() === "title", null, { timeout: 15000 });
      // hero select: the four heroes, by real taps on >
      await tapRegion(page, touch, "new");
      await settle(page, "hero");
      const order = await page.evaluate(() => window.bb.heroSelect().order);
      log(`hero select roster: ${order.join(", ")}`);
      for (const h of order) {
        await showHero(page, touch, h);
        await shot(page, `hero-${h}`, vname);
      }
      for (const [hero, sig] of [["foundry", "crucible"], ["bastion", "wardworks"]]) {
        // the dawn, by a real tap on GO
        await page.evaluate(() => { window.bb.clearPool(); window.bb.open("hero"); }); // GO starts a new run
        await settle(page, "hero");
        await showHero(page, touch, hero);
        await tapRegion(page, touch, "go");
        await settle(page, "build");
        await page.waitForFunction(() => window.bb.game.screen.caravan.ready, null, { timeout: 10000 });
        const runHero = await page.evaluate(() => window.bb.game.run.hero);
        if (runHero !== hero) throw new Error(`GO started a ${runHero} run, wanted ${hero}`);
        log(`${hero}: GO -> dawn of day 1`);
        await shot(page, `dawn-${hero}`, vname);
        await tapSignature(page, touch, sig);
        await shot(page, `inspect-${sig}`, vname);
        if (hero === "foundry") {
          await page.evaluate(() => { const s = window.bb.game.screen; s.select({ kind: "route", index: 0 }); for (let i = 0; i < 10; i++) window.bb.game.step(1 / 60); window.bb.game.render(); });
          await shot(page, "inspect-sync", vname);
        }
        // the dusk battle, caught on its frames
        if (hero === "foundry") {
          const f = await duskUntil(page, "foundry", "a.sfx[0].fuse.some((t) => t > 0.22 && t < 0.29)");
          log(`foundry dusk: the weld flash at ${f.t.toFixed(2)}s (found ${f.found})`);
          if (!f.found) throw new Error("no FUSE frame");
          await shot(page, "battle-fuse", vname);
        } else {
          const c = await duskUntil(page, "bastion", "a.sfx[0].clank.some((t) => t > 0.2)");
          log(`bastion dusk: a CLANK at ${c.t.toFixed(2)}s (found ${c.found})`);
          if (!c.found) throw new Error("no CLANK frame");
          await shot(page, "battle-clank", vname);
          const p = await stepUntil(page, "a.sfx[0].plateShown > a.b.sides[0].race.plating.plate + 1.5 && a.b.sides[0].race.plating.plate > 0");
          log(`bastion dusk: plating just taken by a hit at ${p.t.toFixed(2)}s (found ${p.found})`);
          if (!p.found) throw new Error("no plating-soak frame");
          await shot(page, "battle-plating", vname);
        }
        const r = await toResult(page);
        log(`${hero} dusk: ${r.outcome}, result rows ${JSON.stringify(r.race)}`);
        if (r.phase !== "result" || !r.race) throw new Error(`no result card with ${hero}'s rows`);
        await shot(page, `result-${hero}`, vname);
      }
    } catch (e) {
      failed++;
      log(`FAILED: ${e.message}`);
    }
    log(errors.length ? `console errors (${errors.length}):\n  ${errors.join("\n  ")}` : "console errors: 0");
    if (errors.length) failed++;
    await ctx.close();
  }
  await browser.close();
  log(failed ? `\nRESULT: FAIL (${failed})` : "\nRESULT: PASS (hero select, FOUNDRY and BASTION dawns, inspect panels, SYNC, FUSE, CLANK, plating, result cards; 3 views; no console errors)");
  await writeFile(join(OUT, "heroshots.log"), lines.join("\n") + "\n");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
