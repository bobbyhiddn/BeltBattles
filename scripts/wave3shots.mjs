// 0.8.0 I1 M5 (REQ-BFG-023 part 2, REQ-BFG-011, REQ-BFG-022): wave 3's screens in the browser, from the single-file page
// loaded from file:// (scripts/inline.mjs, as singlefile.mjs and heroshots.mjs play it), on the desk (1920x1080, mouse)
// and the phone (390x844 @3, touch):
//  - caravan-<hero>: for each of the four heroes, a real dawn caravan (the run's own roll, its per-run draw) that offers
//    wave-3 parts, each card with its family marks; offer-<hero>: a wave-3 card tapped, its panel naming the families in
//    its header; tooltip-<hero> (desk): the mouse over that card, the tooltip naming them;
//  - build-latch: FURNACE's deck with a TWIN LATCH working its two belts and a STOKER beside the KILN; -stoker and -latch:
//    each selected (its panel: "STOKES THE KILN", the capped stoke, its hits, its families); build-stoker-foundry and
//    build-crucible-stoked: FOUNDRY's deck with a STOKER beside the CRUCIBLE (a real tap on the CRUCIBLE);
//  - battle-pair: FOUNDRY's deck (STOKER, SHIELD WALL, TWIN TRIGGER) at dusk, caught where a pair has just lit TWIN TRIGGER's
//    lamp with plating on the hull's strip; battle-latch: the latch deck at dusk, caught while the latch holds a payload
//    and the STOKER works the Kiln.
// The decks (DECKS below) were placed and checked by the game's own code (deck.ts, beltside.ts stokeSpots and bestSpot,
// net/validate.ts: legal on day 6). Rigs are selected with the build screen's own select (a real tap on a placed rig turns
// it a quarter turn as it selects it, edit.ts BELTSIDE B2); battles step the game's own clock in the page
// (window.bb.game.step), as heroshots.mjs does, so the frames are reproducible.
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node scripts/wave3shots.mjs <outDir> [--dist <build dir>]
// Writes <outDir>/<shot>-<view>.png and <outDir>/wave3shots.log; exits non-zero on any console error or failed step.

import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { VIEWS as SHOT_VIEWS } from "./shots-list.mjs";
import { inlineBuild } from "./inline.mjs";
import { autoFight } from "./scouthook.mjs"; // SCOUT-1 (REQ-BFG-076): the FIGHT step (bb.fight(true): battles skip scouting)

const ROOT = new URL("..", import.meta.url).pathname;
const argv = process.argv.slice(2);
const di = argv.indexOf("--dist");
const DIST = resolve(di >= 0 ? argv[di + 1] : join(ROOT, "dist"));
const OUT = resolve(argv.filter((_, i) => di < 0 || (i !== di && i !== di + 1))[0] ?? join(ROOT, "shots-wave3"));
const VIEWS = { desk: SHOT_VIEWS.desk, phone: SHOT_VIEWS.phone };
const WAVE3 = ["plateroller", "twingauge", "pincer", "braceframe", "twinlatch", "stoker", "platebreaker", "shieldwall", "twinmould", "armorpress", "anvil", "steambreech", "twintrigger", "spallcatcher", "seamwelder"];
/** The two decks (day 6, legal): the latch deck (FURNACE: the KILN and a STAMP PRESS on two belts into the heavy gun, a
 *  TWIN LATCH at (4,3) between them, a STOKER beside the KILN, SEAM WELDER on the gun) and FOUNDRY's starting deck with a
 *  STOKER beside the CRUCIBLE, a 2-star SHIELD WALL on a belt and TWIN TRIGGER on gun 0. */
const DECKS = {
  latch: { hero: "furnace", items: [{ uid: 6, def: "kiln", x: 2, y: 6 }, { uid: 903, def: "press", x: 6, y: 6 }, { uid: 902, def: "twinlatch", x: 4, y: 3 }, { uid: 901, def: "stoker", x: 2, y: 5, rot: 1 }], routes: [{ factory: 6, cells: [53, 43, 33, 23, 13, 14, 4] }, { factory: 903, cells: [56, 55, 45, 35, 25, 15, 5] }], mods: [{ uid: 904, def: "seamwelder", turret: 0 }], beltCap: 14, hullBonus: 0 },
  foundry: { hero: "foundry", items: [{ uid: 6, def: "crucible", x: 2, y: 6 }, { uid: 901, def: "stoker", x: 1, y: 6 }, { uid: 903, def: "shieldwall", x: 1, y: 5, stars: 2 }], routes: [{ factory: 6, cells: [52, 42, 32, 22, 12, 2] }, { factory: 6, cells: [53, 43, 33, 23, 13, 3] }], mods: [{ uid: 904, def: "twintrigger", turret: 0 }], beltCap: 18, hullBonus: 0 },
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
  await sleep(200);
}
async function shot(page, name, vname) {
  await page.screenshot({ path: join(OUT, `${name}-${vname}.png`) });
  log(`  ${name}-${vname}.png`);
}
/** Wait for the caravan to stand still. */
async function ready(page) {
  await page.waitForFunction(() => window.bb.game.screen.caravan?.ready, null, { timeout: 15000 });
  await sleep(400);
}
/** In-page: the first run seed whose day-`day` caravan (setupRun: the run's own roll) offers at least `min` wave-3 parts. */
async function findCaravan(page, hero, day, min) {
  return page.evaluate(({ hero, day, min, wave3 }) => {
    for (let seed = 1; seed < 2000; seed++) {
      window.bb.setupRun({ hero, day, seed, gold: 30 });
      const offers = window.bb.game.run.shop.wagons.flatMap((w) => w.offers.map((o) => o.def));
      const w3 = offers.filter((d) => wave3.includes(d));
      if (new Set(w3).size >= min) return { seed, offers, w3 };
    }
    return null;
  }, { hero, day, min, wave3: WAVE3 });
}
/** The client point at the centre of the caravan card showing `def` (the build screen's own layout). */
async function cardAt(page, def) {
  return page.evaluate((def) => {
    const s = window.bb.game.screen, list = s.offers();
    const i = list.findIndex((q) => s.run.shop.wagons[q.wagon].offers[q.slot].def === def);
    const r = s.L.cards[i];
    return { i, ...window.bb.toClient(r.x + s.caravan.dx(i, s.L.W) + r.w / 2, r.y + r.h / 2) };
  }, def);
}
/** The client point at the centre of placed item `uid` on the deck (heroshots.mjs tapSignature's way). */
async function itemAt(page, uid) {
  return page.evaluate((uid) => {
    const c = window.bb.game.screen.fuseAnimPos({ where: "deck", survivor: uid });
    return window.bb.toClient(c.x, c.y);
  }, uid);
}
/** In-page: select placed item `uid` with the build screen's own select. */
async function selectItem(page, uid) {
  await page.evaluate((uid) => {
    window.bb.game.screen.select({ kind: "item", uid });
    for (let i = 0; i < 10; i++) window.bb.game.step(1 / 60);
    window.bb.game.render();
  }, uid);
  const st = await page.evaluate(() => window.bb.game.screen.sel);
  if (st.kind !== "item" || st.uid !== uid) throw new Error(`selecting ${uid} gave ${JSON.stringify(st)}`);
  await sleep(150);
}
/** In-page: a run of `hero` at the dawn of `day` with `build` as its deck, on the build screen. */
async function openDeck(page, hero, day, build) {
  await page.evaluate(({ hero, day, build }) => {
    window.bb.clearPool();
    window.bb.setupRun({ hero, day, seed: 4242, gold: 20 });
    window.bb.game.run.build = build;
    window.bb.open("build");
  }, { hero, day, build });
  await settle(page, "build");
  await ready(page);
}
/** In-page: the battle of the current run (its dusk vs the day's honest stand-in), stepped until `until` holds. */
async function battleUntil(page, until, maxFrames = 60 * 90) {
  return page.evaluate(({ until, maxFrames }) => {
    const bb = window.bb, g = bb.game;
    bb.open("battle");
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
    return { frames: n, t: a ? a.b.t : -1, found: n < maxFrames, plate: a ? a.b.sides[0].plate.plate : -1, foe: g.screen.foeName ?? "" };
  }, { until, maxFrames });
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const { html } = await inlineBuild(DIST);
  const page0 = join(process.env.TMPDIR ?? tmpdir(), "bb-wave3shots.html");
  await writeFile(page0, html);
  const url = pathToFileURL(page0).href;
  log(`page: ${page0} (${html.length} bytes, from ${DIST})`);
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"] });
  let failed = 0;
  for (const [vname, vopts] of Object.entries(VIEWS)) {
    const touch = !!vopts.hasTouch;
    const ctx = await browser.newContext(vopts);
    await autoFight(ctx); // SCOUT-1: battles skip scouting, as before SCOUT-1
    const page = await ctx.newPage();
    await page.addInitScript(() => { Math.random = () => 0.3; });
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
    page.on("requestfailed", (r) => errors.push(`requestfailed: ${r.url()}`));
    log(`\n== ${vname} (${vopts.viewport.width}x${vopts.viewport.height} @${vopts.deviceScaleFactor}, ${touch ? "touch" : "mouse"})`);
    try {
      await page.goto(url);
      await page.waitForFunction(() => !!window.bb && window.bb.screen() === "title", null, { timeout: 15000 });
      log(`version ${await page.evaluate(() => window.bb.version)}`);
      // the caravan, each hero (one shared pool: the same run seed gives every hero the same caravan)
      for (const hero of ["furnace", "weaver", "foundry", "bastion"]) {
        const c = await findCaravan(page, hero, 4, 2);
        if (!c) throw new Error(`no day-4 caravan with 2 wave-3 parts for ${hero}`);
        await page.evaluate(({ hero, seed }) => window.bb.openDawn({ hero, day: 4, seed, gold: 30 }), { hero, seed: c.seed });
        await settle(page, "build");
        await ready(page);
        log(`${hero}: day-4 caravan of run seed ${c.seed}: ${c.offers.join(", ")} (wave 3: ${c.w3.join(", ")})`);
        await shot(page, `caravan-${hero}`, vname);
        const p = await cardAt(page, c.w3[0]);
        if (!touch) {
          await page.mouse.move(p.x, p.y);
          await sleep(300);
          await shot(page, `tooltip-${hero}`, vname);
        }
        await tapAt(page, touch, p);
        const sel = await page.evaluate(() => window.bb.game.screen.sel);
        if (sel.kind !== "offer") throw new Error(`tapping ${c.w3[0]} selected ${JSON.stringify(sel)}`);
        if (!touch) { await page.mouse.move(5, 5); await sleep(200); } // the selection's panel, not the hover's
        await shot(page, `offer-${hero}`, vname);
      }
      // the build screen
      await openDeck(page, "furnace", 6, DECKS.latch);
      if (!touch) { await page.mouse.move(5, 5); await sleep(200); }
      await shot(page, "build-latch", vname);
      await selectItem(page, 901);
      await shot(page, "build-latch-stoker", vname);
      await selectItem(page, 902);
      await shot(page, "build-latch-latch", vname);
      const kept = await page.evaluate(() => JSON.stringify(window.bb.game.run.build.items));
      if (kept !== JSON.stringify(DECKS.latch.items)) throw new Error(`the deck moved: ${kept}`);
      await openDeck(page, "foundry", 6, DECKS.foundry);
      await selectItem(page, 901);
      await shot(page, "build-stoker-foundry", vname);
      await tapAt(page, touch, await itemAt(page, 6)); // the CRUCIBLE: a factory, so a real tap only selects it
      const cs = await page.evaluate(() => window.bb.game.screen.sel);
      if (cs.kind !== "item" || cs.uid !== 6) throw new Error(`the CRUCIBLE tap selected ${JSON.stringify(cs)}`);
      if (!touch) { await page.mouse.move(5, 5); await sleep(200); }
      await shot(page, "build-crucible-stoked", vname);
      // battles
      await openDeck(page, "foundry", 6, DECKS.foundry);
      const b = await battleUntil(page, "a.sfx[0].w3.pairAge[0] < 0.12 && a.b.sides[0].plate.plate >= 3");
      log(`foundry battle vs ${b.foe}: a pair with ${b.plate.toFixed(1)} plating at ${b.t.toFixed(2)} s (found ${b.found})`);
      if (!b.found) throw new Error("no pair-with-plating frame");
      await shot(page, "battle-pair", vname);
      await openDeck(page, "furnace", 6, DECKS.latch);
      const l = await battleUntil(page, "(() => { const g = a.b.sides[0].gates.find((q) => q.uid === 902); return g.latch.held.some((h) => h) && g.flash <= 0 && a.b.t > 3 && a.b.sides[0].factories.some((f) => f.stokers && f.stokers.some((x) => x.g.online)); })()");
      log(`latch battle vs ${l.foe}: the latch holds at ${l.t.toFixed(2)} s (found ${l.found})`);
      if (!l.found) throw new Error("no latch-hold frame");
      await shot(page, "battle-latch", vname);
    } catch (e) {
      failed++;
      log(`FAILED: ${e.message}`);
    }
    log(errors.length ? `console errors (${errors.length}):\n  ${errors.join("\n  ")}` : "console errors: 0");
    if (errors.length) failed++;
    await ctx.close();
  }
  await browser.close();
  log(failed ? `\nRESULT: FAIL (${failed})` : "\nRESULT: PASS (caravans with wave 3 and their tags for four heroes, the panels and tooltips, a STOKER beside a factory and a TWIN LATCH, battles with plating and a pair; desk and phone; no console errors)");
  await writeFile(join(OUT, "wave3shots.log"), lines.join("\n") + "\n");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
