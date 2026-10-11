// 0.8.0 N1 M5 (REQ-BFG-011, REQ-BFG-024): the six new captains (BRASSWICK, MASTER VOSS, GRIMHOLD, THANE KARSK, LOCKJAW,
// THISTLEMAIL) in the browser, from the single-file page loaded from file:// (scripts/inline.mjs, as singlefile.mjs,
// heroshots.mjs and wave3shots.mjs play it), on the desk (1920x1080, mouse) and the phone (390x844 @3, touch).
//  - road-<seed>-d<day>: a road stop (bb.openFork: the run's own fork, warlordOffer) offering new warlords; on the desk
//    every card shows portrait, name, tier tag, trick and blurb; on the phone each new warlord's card is inspected (the
//    fork screen's own tap-to-inspect state, sel: its blurb, trick and GO) -> road-...-<id>-phone;
//  - next-<id>: the NEXT BATTLE card at a dawn whose dusk stand-in (standInGhost, empty ghost pool) is LOCKJAW or
//    THISTLEMAIL (bb.openDawn);
//  - warlord-<id>: a road warlord fight against MASTER VOSS (FOUNDRY) and THANE KARSK (BASTION), picked at their fork
//    (bb.openWarlord: pickRoad + warlordFight), stepped on the game's own clock (window.bb.game.step) to mid-fight;
//    dusk-<id>: a dusk battle against the stand-in LOCKJAW (bb.openDusk, empty pool: the run's stand-in);
//  - run-<view>: a scripted run with real input (the repo's scripts/playthrough.mjs scriptedRun: hero select, dawn buys
//    and drags, the fork pick by click or tap, the warlord fight, the dusk battle, the result cards), on a pinned run seed
//    (Math.random, as singlefile.mjs pins it) that meets a new warlord at the day-1 road stop and a new stand-in at dusk.
// Every context logs console errors and warnings, page errors and failed requests; any one fails the run.
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node scripts/npcshots.mjs [outDir] [--dist <build dir>] (outDir default shots/npcs)
// Writes <outDir>/<shot>-<view>.png, <outDir>/npcshots.log and <outDir>/npcshots.json; exits non-zero on any failure.
import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { VIEWS as SHOT_VIEWS } from "./shots-list.mjs";
import { inlineBuild } from "./inline.mjs";
import { scriptedRun } from "./playthrough.mjs";
import { autoFight } from "./scouthook.mjs"; // SCOUT-1 (REQ-BFG-076): the FIGHT step (bb.fight(true): battles skip scouting)

const ROOT = new URL("..", import.meta.url).pathname;

const argv = process.argv.slice(2);
const di = argv.indexOf("--dist");
const DIST = resolve(di >= 0 ? argv[di + 1] : join(ROOT, "dist"));
const OUT = resolve(argv.filter((_, i) => di < 0 || (i !== di && i !== di + 1))[0] ?? join(ROOT, "shots", "npcs"));
const VIEWS = { desk: SHOT_VIEWS.desk, phone: SHOT_VIEWS.phone };
const NEW_ROAD = ["brasswick", "grimhold", "voss", "karsk"];
const NEW_ALL = [...NEW_ROAD, "lockjaw", "thistlemail"];
const NEW_NAMES = ["BRASSWICK", "GRIMHOLD", "MASTER VOSS", "THANE KARSK", "LOCKJAW", "THISTLEMAIL"];
const TIER_OF = { brasswick: "easy", grimhold: "medium", voss: "hard", karsk: "hard" };
const CARD = { easy: 1, medium: 2, hard: 3 }; // the fork's cards: 0 the event, then easy, medium, hard
const lines = [];
const record = { shots: [], runs: [], errors: {} };
const log = (s) => { lines.push(s); console.log(s); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function settle(page, screen, timeout = 20000) {
  await page.waitForFunction((s) => window.bb.screen() === s && !window.bb.game.transitioning, screen, { timeout });
}
async function shot(page, name, vname, note) {
  const file = `${name}-${vname}.png`;
  await page.screenshot({ path: join(OUT, file) });
  record.shots.push({ file, note });
  log(`  ${file}: ${note}`);
}

/** In-page: the first (day, seed) whose fork offers all of `want` (tier -> id), days `days`, seeds 1..max. */
async function findFork(page, want, days, max = 4000) {
  return page.evaluate(({ want, days, max }) => {
    for (const day of days) for (let seed = 1; seed <= max; seed++) {
      window.bb.setupRun({ hero: "furnace", day, seed });
      const f = window.bb.forkInfo();
      if (Object.entries(want).every(([tier, ids]) => ids.includes(f.warlords[tier]))) return { day, seed, warlords: f.warlords, event: f.event };
    }
    return null;
  }, { want, days, max });
}
/** In-page: the first (day, seed) whose dusk stand-in is `name` (standInSpend: the run's stand-in captain by day). */
async function findStandIn(page, name, days, max = 4000) {
  return page.evaluate(({ name, days, max }) => {
    for (const day of days) for (let seed = 1; seed <= max; seed++) {
      const s = window.bb.standInSpend(seed)[day - 1];
      if (s.name === name) return { day, seed, standIn: s };
    }
    return null;
  }, { name, days, max });
}
/** In-page: step the current battle screen (dusk or warlord) on the game's clock until the fight has run `secs`. */
async function stepFight(page, secs, maxFrames = 60 * 120) {
  return page.evaluate(({ secs, maxFrames }) => {
    const g = window.bb.game;
    let n = 0;
    for (; n < maxFrames; n++) {
      g.step(1 / 60);
      const a = g.screen.arena;
      if (a && g.screen.phase === "fight" && a.b.t >= secs) break;
    }
    g.render();
    const a = g.screen.arena;
    return {
      frames: n, t: a ? a.b.t : -1, phase: g.screen.phase, foe: g.screen.foeName ?? "",
      hull: a ? a.b.sides.map((s) => `${Math.round(s.hull.hp)}/${Math.round(s.hull.max)}`) : [], plate: a ? a.b.sides.map((s) => Math.round(s.plate.plate)) : [],
    };
  }, { secs, maxFrames });
}

async function shots(page, vname, touch) {
  // ---------------------------------------------------------------- the road stop: three new warlords on one fork
  const f3 = await findFork(page, { easy: ["brasswick"], medium: ["grimhold"], hard: ["voss", "karsk"] }, [3, 4, 2, 5]);
  if (!f3) throw new Error("no fork with BRASSWICK, GRIMHOLD and a new Hard captain");
  const other = f3.warlords.hard === "voss" ? "karsk" : "voss";
  const f1 = await findFork(page, { hard: [other] }, [3, 4, 2, 5]);
  if (!f1) throw new Error(`no fork with ${other}`);
  record.forks = { f3, f1 };
  for (const f of [f3, f1]) {
    await page.evaluate(({ day, seed }) => window.bb.openFork({ hero: "furnace", day, seed, wins: day - 1, gold: 12 }), f);
    await settle(page, "fork");
    await sleep(700);
    const ws = Object.entries(f.warlords).filter(([, id]) => NEW_ROAD.includes(id));
    const label = `road-s${f.seed}-d${f.day}`;
    log(`${label}: fork of run seed ${f.seed}, day ${f.day}: event ${f.event} | easy ${f.warlords.easy} | medium ${f.warlords.medium} | hard ${f.warlords.hard}`);
    if (!touch) {
      await shot(page, label, vname, `the road stop, day ${f.day}: ${ws.map(([t, id]) => `${id} (${t})`).join(", ")} with portrait, name, tag, trick and blurb on the card`);
      // the mouse over the new Hard captain's card (its hover frame)
      const p = await page.evaluate((id) => { const r = window.bb.regions().filter((q) => q.id === id).pop(); return r && { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }, `fork${CARD.hard}`);
      if (p) { await page.mouse.move(p.x, p.y); await sleep(300); await shot(page, `${label}-hover`, vname, `the mouse over ${f.warlords.hard}'s card`); await page.mouse.move(5, 5); await sleep(200); }
    } else {
      await shot(page, label, vname, `the road stop, day ${f.day} (compact cards: portrait, name, tag, trick)`);
      for (const [tier, id] of ws) {
        // the first tap's state (fork.ts: portrait, the first tap inspects): the card's blurb, trick and GO
        await page.evaluate((i) => { window.bb.game.screen.sel = i; }, CARD[tier]);
        await sleep(400);
        await shot(page, `${label}-${id}`, vname, `${id}'s card inspected (first tap): name, trick, blurb, reward, GO`);
      }
      await page.evaluate(() => { window.bb.game.screen.sel = -1; });
    }
  }
  // ---------------------------------------------------------------- the NEXT BATTLE card at dawn: a new stand-in tonight
  for (const name of ["LOCKJAW", "THISTLEMAIL"]) {
    const s = await findStandIn(page, name, [3, 4, 2, 5]);
    if (!s) throw new Error(`no run with ${name} standing in`);
    record[`standin-${name}`] = s;
    await page.evaluate(({ day, seed }) => window.bb.openDawn({ hero: "foundry", day, seed, wins: day - 1, gold: 9 }, []), s);
    await settle(page, "build");
    await page.waitForFunction(() => window.bb.game.screen.caravan?.ready, null, { timeout: 15000 });
    await sleep(500);
    const foe = await page.evaluate(() => { const f = window.bb.game.screen.foe; return { name: f.name, kind: f.kind, rival: f.rival, hero: f.hero, hull: f.build.hullBonus }; });
    if (foe.name !== name || foe.kind !== "standin") throw new Error(`the NEXT BATTLE card shows ${JSON.stringify(foe)}, not ${name}`);
    await shot(page, `next-${name.toLowerCase()}`, vname, `FOUNDRY's dawn, day ${s.day} of run ${s.seed}: NEXT BATTLE · DUSK ${foe.name} (stand-in, ${foe.hero}, hull bonus ${foe.hull})`);
  }
  // ---------------------------------------------------------------- warlord fights: FOUNDRY's and BASTION's captains
  for (const id of ["voss", "karsk", "brasswick", "grimhold"]) {
    const f = [f3, f1].find((x) => x.warlords[TIER_OF[id]] === id);
    await page.evaluate(({ tier, day, seed }) => window.bb.openWarlord(tier, { hero: "weaver", day, seed, wins: day - 1 }), { tier: TIER_OF[id], ...f });
    await settle(page, "warlord");
    const b = await stepFight(page, id === "voss" || id === "karsk" ? 9 : 7);
    if (!b.foe.includes(id === "voss" ? "VOSS" : id === "karsk" ? "KARSK" : id.toUpperCase())) throw new Error(`warlord fight vs ${b.foe}, not ${id}`);
    await shot(page, `warlord-${id}`, vname, `WEAVER vs the ${TIER_OF[id]} warlord ${b.foe} on day ${f.day} (run ${f.seed}), ${b.t.toFixed(1)} s in: hulls ${b.hull.join(" / ")}, plating ${b.plate.join(" / ")}`);
    await sleep(100);
  }
  // ---------------------------------------------------------------- a dusk battle against a new stand-in
  for (const name of ["LOCKJAW", "THISTLEMAIL"]) {
    const s = record[`standin-${name}`];
    await page.evaluate(({ day, seed }) => window.bb.openDusk({ hero: "bastion", day, seed, wins: day - 1 }, []), s);
    await settle(page, "battle");
    const b = await stepFight(page, 8);
    if (b.foe !== name) throw new Error(`dusk battle vs ${b.foe}, not ${name}`);
    await shot(page, `dusk-${name.toLowerCase()}`, vname, `BASTION's dusk vs the stand-in ${b.foe}, day ${s.day} (run ${s.seed}), ${b.t.toFixed(1)} s in: hulls ${b.hull.join(" / ")}, plating ${b.plate.join(" / ")}`);
  }
}

/** A Math.random pin whose new run (hero.ts: seed = (Math.random() * 0x7fffffff) | 0) meets a new warlord at the day-1 road
 *  stop and a stand-in-only captain at dusk on day 1 or 2 (else one of the six). */
async function findPin(page) {
  return page.evaluate(({ NEW_ROAD, NEW_NAMES }) => {
    let fallback = null;
    for (let k = 1; k < 20000; k++) {
      const r = k / 20000, seed = (r * 0x7fffffff) | 0;
      window.bb.setupRun({ hero: "furnace", day: 1, seed });
      const w = window.bb.forkInfo().warlords;
      const tier = ["hard", "medium", "easy"].find((t) => NEW_ROAD.includes(w[t]));
      if (!tier) continue;
      const si = window.bb.standInSpend(seed).slice(0, 2).map((s) => s.name);
      const pick = { r, seed, tier, warlord: w[tier], warlords: w, standIns: window.bb.standInSpend(seed).map((s) => s.name) };
      if (si.some((n) => n === "LOCKJAW" || n === "THISTLEMAIL")) return pick;
      if (!fallback && si.some((n) => NEW_NAMES.includes(n))) fallback = pick;
    }
    return fallback;
  }, { NEW_ROAD, NEW_NAMES });
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const { html } = await inlineBuild(DIST);
  const page0 = join(process.env.TMPDIR ?? tmpdir(), "bb-npcshots.html");
  await writeFile(page0, html);
  const url = pathToFileURL(page0).href;
  log(`page: ${page0} (${html.length} bytes, from ${DIST})`);
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"] });
  let failed = 0;
  const watch = (page, errors) => {
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
    page.on("requestfailed", (r) => errors.push(`requestfailed: ${r.url()}`));
  };
  let pin = null;
  for (const [vname, vopts] of Object.entries(VIEWS)) {
    const touch = !!vopts.hasTouch;
    // ------------------------------------------------ the shots
    {
      const ctx = await browser.newContext(vopts);
      await autoFight(ctx); // SCOUT-1: battles skip scouting, as before SCOUT-1
      const page = await ctx.newPage();
      await page.addInitScript(() => { Math.random = () => 0.3; });
      const errors = [];
      watch(page, errors);
      log(`\n== shots ${vname} (${vopts.viewport.width}x${vopts.viewport.height} @${vopts.deviceScaleFactor}, ${touch ? "touch" : "mouse"})`);
      try {
        await page.goto(url);
        await page.waitForFunction(() => !!window.bb && window.bb.screen() === "title", null, { timeout: 15000 });
        log(`version ${await page.evaluate(() => window.bb.version)}`);
        await shots(page, vname, touch);
        if (!pin) {
          pin = await findPin(page);
          log(`scripted-run pin: Math.random = ${pin && pin.r} -> run seed ${pin && pin.seed}: day-1 fork ${pin && JSON.stringify(pin.warlords)}, stand-ins ${pin && pin.standIns.join(", ")}`);
        }
      } catch (e) {
        failed++;
        log(`FAILED: ${e.stack || e.message}`);
      }
      log(errors.length ? `console errors (${errors.length}):\n  ${errors.join("\n  ")}` : "console errors: 0");
      record.errors[`shots-${vname}`] = errors;
      if (errors.length) failed++;
      await ctx.close();
    }
    // ------------------------------------------------ the scripted run (real input)
    if (!pin) { failed++; log("no pin for the scripted run"); continue; }
    {
      const ctx = await browser.newContext(vopts);
      await autoFight(ctx); // SCOUT-1: battles skip scouting, as before SCOUT-1
      const page = await ctx.newPage();
      await page.addInitScript((r) => { Math.random = () => r; }, pin.r);
      const errors = [];
      watch(page, errors);
      const hero = vname === "desk" ? "foundry" : "bastion";
      const letter = { easy: "e", medium: "m", hard: "h" }[pin.tier];
      const opts = { days: 3, roads: `${letter}vv`, check: "fresh", hero, buys: 8, pool: [] };
      log(`\n== run ${vname}: ${hero.toUpperCase()}, Math.random ${pin.r} (run seed ${pin.seed}), roads ${opts.roads} (day 1: the ${pin.tier} warlord ${pin.warlord}), empty ghost pool (every dusk a stand-in), ${opts.days} days`);
      try {
        await page.goto(url);
        await page.waitForFunction(() => !!window.bb && window.bb.screen() === "title", null, { timeout: 15000 });
        const end = await scriptedRun(page, touch, log, opts);
        const met = { warlords: end.state.dayLog.map((d) => d.road), foes: end.days };
        const newWarlord = end.state.dayLog.some((d) => NEW_NAMES.slice(0, 4).some((n) => d.road.includes(` ${n} `)));
        const newStandIn = end.days.some((d) => NEW_NAMES.some((n) => d.includes(` / ${n} / `)));
        record.runs.push({ view: vname, hero, pin: pin.r, seed: pin.seed, met, newWarlord, newStandIn });
        log(`run ${vname}: met a new warlord at the road stop: ${newWarlord}; met a new stand-in at dusk: ${newStandIn}`);
        if (!newWarlord || !newStandIn) throw new Error("the scripted run missed a new warlord or a new stand-in");
        await page.screenshot({ path: join(OUT, `run-end-${vname}.png`) });
        log(`  run-end-${vname}.png: the run's last result card`);
      } catch (e) {
        failed++;
        log(`FAILED: ${e.stack || e.message}`);
      }
      log(errors.length ? `console errors (${errors.length}):\n  ${errors.join("\n  ")}` : "console errors: 0");
      record.errors[`run-${vname}`] = errors;
      if (errors.length) failed++;
      await ctx.close();
    }
  }
  await browser.close();
  log(failed ? `\nRESULT: FAIL (${failed})` : "\nRESULT: PASS (road stops with the new warlords, NEXT BATTLE cards with the new stand-ins, warlord fights vs FOUNDRY's and BASTION's captains, dusk battles vs the new stand-ins, a scripted run on desk and phone meeting both; 0 console errors)");
  await writeFile(join(OUT, "npcshots.log"), lines.join("\n") + "\n");
  await writeFile(join(OUT, "npcshots.json"), JSON.stringify(record, null, 1) + "\n");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
