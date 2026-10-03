// 0.8.0 B1 M5 (REQ-BFG-026, REQ-BFG-032, REQ-BFG-033; ref/BRIEF-v080-B1.md section 6, "Browser runs"): B1's rules and
// text in the browser, from the single-file page loaded from file:// (scripts/inline.mjs, as npcshots.mjs and
// wave3shots.mjs play it), on the desk (1920x1080, mouse) and the phone (390x844 @3, touch).
//  - stoker-kiln, stoker-press: STOKER's capped line (B1 M4, inspector.ts stokerAbility). A build screen whose STOKER works
//    a factory on a full gun, the STOKER selected (the build screen's own select: a real tap on a placed rig turns it, edit.ts
//    BELTSIDE B2): its panel opens with the capped line in amber ("THE KILN'S GUN IS FULL, SO IT WORKS ONLY N% FASTER.") in
//    place of the glossary's "EACH FACTORY ITS ARROWS POINT AT WORKS N% FASTER.", and G1's F2 variant for a plating factory
//    ("THE ARMOR PRESS'S GUN IS FULL, SO ONLY ITS PLATING WORKS 44% FASTER."). The decks are tests/b1.text.test.ts's:
//    FURNACE's start deck with a STOKER ★2 at (6,6) on the Kiln ("6-tile Kiln ★2"), and G1's C-E3-press deck with a STOKER
//    ★2 at (8,6) on the ARMOR PRESS (sharedPress(2)).
//  - breaker-bastion, breaker-furnace: PLATE BREAKER's DMG readout (B1 M2, G1's F1, inspector.ts beltPanel). A PLATE
//    BREAKER ★2 at (3,2) working the first belt (tests/wave3.gaps.test.ts C-walk-breaker), the belt selected: on BASTION's
//    deck (it plates its hull) DMG reads "lo-hi", the floor's total then the big number's; on FURNACE's (no plating source)
//    the floor alone.
//  - smuggler-d1, smuggler-d1-taken, smuggler-d2: the AMMO SMUGGLER offering contraband (B1 M4, eventDefs.ts smugglerStock).
//    Run seed 1 (tests/fixtures/beltside-062c/roadDraws-080.json "smuggler|none|1") has no SHOCK ware unlocked on days 1-2
//    but drew STATIC BRUSH and LODESTONE, so its SHOCK card offers STATIC BRUSH on day 1 and LODESTONE on day 2, ahead of
//    their day (checked against the run's wares); on day 1 a real click or tap buys it into cargo.
//  - warlord-grimhold: a road warlord fight against the regrown GRIMHOLD (BASTION, Medium; B1 M3, rivalBuilds.ts: ANVIL
//    BREECH from day 2, SPALL CATCHER from day 3), picked at a fork that offers him (bb.openWarlord: pickRoad +
//    warlordFight), stepped on the game's own clock to a frame with his plating on the hull.
//  - run-<hero>-*: a FOUNDRY run and a BASTION run with real input (scripts/playthrough.mjs's helpers, as scriptedRun plays
//    a day): the title's NEW RUN, hero select (the > button, COMMAND), dawn buys and drags (or tap-buy, tap-place), FIGHT,
//    the fork by click (on touch: a tap inspects, a second goes), on a pinned run seed (Math.random, as npcshots.mjs pins
//    it) whose day-1 fork offers the SMUGGLER with contraband (taken by a real tap, then REFIT) and whose day-2 fork offers
//    GRIMHOLD as the Medium warlord (fought in real time); dusk battles vs the day's stand-in (empty ghost pool), 3 days.
//    Shots: hero select, the day-1 dawn, the SMUGGLER's cards, the day-1 dusk mid-fight, GRIMHOLD mid-fight, the last
//    result card.
// Every context logs console errors and warnings, page errors and failed requests; any one fails the run.
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node scripts/b1shots.mjs [outDir] [--dist <build dir>] (outDir default shots/b1)
// Writes <outDir>/<shot>-<view>.png, <outDir>/b1shots.log and <outDir>/b1shots.json; exits non-zero on any failure.
import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { VIEWS as SHOT_VIEWS } from "./shots-list.mjs";
import { inlineBuild } from "./inline.mjs";
import { placePlanned, road, settle, sleep, tapRegion } from "./playthrough.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const argv = process.argv.slice(2);
const di = argv.indexOf("--dist");
const DIST = resolve(di >= 0 ? argv[di + 1] : join(ROOT, "dist"));
const OUT = resolve(argv.filter((_, i) => di < 0 || (i !== di && i !== di + 1))[0] ?? join(ROOT, "shots", "b1"));
const VIEWS = { desk: SHOT_VIEWS.desk, phone: SHOT_VIEWS.phone };
const PICKS = ["v", "e", "m", "h"]; // the fork's cards: 0 the event, then easy, medium, hard
const RUN_DAYS = 3;

/** The build-screen decks: the hero's own starting deck (newRun: heroStartBuild) with `add` placed and `routes` drawn
 *  ([x, y] cells), as the tests build them on heroStartBuild(hero, 1). */
const DECKS = {
  // tests/b1.text.test.ts ONE_CAPPED "6-tile Kiln ★2": the Kiln at (4,6) on its 6-tile belt into the heavy gun, a STOKER ★2
  // at (6,6) with its west arrow on the Kiln; the gun can't take the full stoke (stokeKeep < 1)
  stokerKiln: { hero: "furnace", day: 6, add: [{ uid: 970, def: "stoker", x: 6, y: 6, stars: 2 }], routes: [], sel: { kind: "item", uid: 970 } },
  // tests/b1.text.test.ts sharedPress(2), G1's C-E3-press deck: an ARMOR PRESS (uid 907) at (6,6) on (6,5), (5,5) and up
  // column 5 into connector 5, sharing the heavy gun with the Kiln; a STOKER ★2 at (8,6), its west arrow on the press
  stokerPress: {
    hero: "furnace", day: 6, add: [{ uid: 907, def: "armorpress", x: 6, y: 6 }, { uid: 970, def: "stoker", x: 8, y: 6, stars: 2 }],
    routes: [{ factory: 907, cells: [[6, 5], [5, 5], [5, 4], [5, 3], [5, 2], [5, 1], [5, 0]] }], sel: { kind: "item", uid: 970 },
  },
  // tests/wave3.gaps.test.ts C-walk-breaker: a PLATE BREAKER ★2 (uid 931, shape T) at (3,2), its east arrow on the first
  // belt's tile (4,2); BASTION plates its hull (platedDeck), FURNACE's start deck has no plating source
  breakerBastion: { hero: "bastion", day: 5, add: [{ uid: 931, def: "platebreaker", x: 3, y: 2, stars: 2 }], routes: [], sel: { kind: "route", index: 0 } },
  breakerFurnace: { hero: "furnace", day: 5, add: [{ uid: 931, def: "platebreaker", x: 3, y: 2, stars: 2 }], routes: [], sel: { kind: "route", index: 0 } },
};
const SMUGGLER_POOL = { BURN: ["temper", "bellows", "quench"], SHOCK: ["coil", "staticbrush", "lodestone"] }; // eventDefs.ts smugglerPool
const SMUGGLER_PRICE = { BURN: 2, SHOCK: 3 };

const lines = [];
const record = { shots: [], runs: [], checks: {}, errors: {}, failures: [] };
const log = (s) => { lines.push(s); console.log(s); };

async function settleAny(page, screens, timeout = 20000) {
  await page.waitForFunction((s) => s.includes(window.bb.screen()) && !window.bb.game.transitioning, screens, { timeout });
  return page.evaluate(() => window.bb.screen());
}
async function shot(page, name, vname, note) {
  const file = `${name}-${vname}.png`;
  await page.screenshot({ path: join(OUT, file) });
  record.shots.push({ file, note });
  log(`  ${file}: ${note}`);
}
/** Wait for the caravan to stand still. */
async function ready(page) {
  await page.waitForFunction(() => window.bb.game.screen.caravan?.ready, null, { timeout: 15000 });
  await sleep(400);
}
/** The mouse off every card and button (the desk), so the frame shows the selection's panel, not a hover. */
async function park(page, touch) {
  if (!touch) {
    await page.mouse.move(5, 5);
    await sleep(250);
  }
}
/** One item of the shot list: a failure is logged and counted, and the next item still runs. */
async function item(name, vname, fn) {
  try {
    await fn();
  } catch (e) {
    record.failures.push(`${name} ${vname}: ${e.message}`);
    log(`FAILED ${name} (${vname}): ${e.stack || e.message}`);
  }
}

// ------------------------------------------------------------------------------------------------- in-page searches

/** In-page: the first (day, seed) whose fork offers all of `want` (tier -> ids), days `days`, seeds 1..max (npcshots.mjs). */
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

/** In-page: a Math.random pin whose new run (hero.ts: seed = (Math.random() * 0x7fffffff) | 0) meets the SMUGGLER at the
 *  day-1 fork with contraband on offer (an effect with no ware unlocked on day 1 that the run drew: smugglerStock) and
 *  GRIMHOLD as the day-2 fork's Medium warlord (else the first pin with the SMUGGLER's contraband alone). */
async function findRunPin(page) {
  return page.evaluate(({ pool, price }) => {
    const contraband = (w, day) => Object.entries(pool).flatMap(([kind, ids]) => {
      const drawn = ids.filter((id) => Object.prototype.hasOwnProperty.call(w, id));
      return !drawn.some((id) => w[id] <= day) && drawn.length ? [{ kind, price: price[kind], drawn: drawn.map((id) => `${id} (day ${w[id]})`) }] : [];
    });
    let fallback = null;
    for (let k = 1; k < 20000; k++) {
      const r = k / 20000, seed = (r * 0x7fffffff) | 0;
      window.bb.setupRun({ hero: "foundry", day: 1, seed });
      const f1 = window.bb.forkInfo();
      if (f1.event !== "smuggler") continue;
      const c = contraband(window.bb.game.run.wares || {}, 1);
      if (!c.length) continue;
      window.bb.setupRun({ hero: "foundry", day: 2, seed });
      const f2 = window.bb.forkInfo();
      const pick = { r, seed, take: c.find((x) => x.kind === "SHOCK") ?? c[0], contraband: c, day1: { event: f1.event, warlords: f1.warlords }, day2: { event: f2.event, warlords: f2.warlords } };
      if (f2.warlords.medium === "grimhold") return pick;
      if (!fallback) fallback = pick;
    }
    return fallback;
  }, { pool: SMUGGLER_POOL, price: SMUGGLER_PRICE });
}

// ------------------------------------------------------------------------------------------------- in-page helpers

/** In-page: a run of `d.hero` at the dawn of `d.day` (run seed 4242, an empty ghost pool) with its own starting deck plus
 *  `d.add` and `d.routes`, on the build screen. Returns the deck as placed. */
async function openDeck(page, d) {
  const deck = await page.evaluate((d) => {
    const bb = window.bb;
    bb.clearPool();
    bb.setupRun({ hero: d.hero, day: d.day, seed: 4242, gold: 20 });
    const run = bb.game.run, b = run.build;
    for (const p of d.add) {
      if (b.items.some((q) => q.uid === p.uid)) throw new Error(`uid ${p.uid} is taken in ${d.hero}'s start deck`);
      b.items.push({ ...p });
    }
    for (const r of d.routes) b.routes.push({ factory: r.factory, cells: r.cells.map(([x, y]) => y * 10 + x) });
    run.nextUid = Math.max(run.nextUid ?? 0, 1000);
    bb.open("build");
    return JSON.parse(JSON.stringify(b));
  }, d);
  await settle(page, "build");
  await ready(page);
  return deck;
}
/** In-page: select `sel` with the build screen's own select (wave3shots.mjs selectItem; heroshots.mjs for a belt). */
async function select(page, sel) {
  await page.evaluate((sel) => {
    window.bb.game.screen.select(sel);
    for (let i = 0; i < 10; i++) window.bb.game.step(1 / 60);
    window.bb.game.render();
  }, sel);
  const st = await page.evaluate(() => window.bb.game.screen.sel);
  if (st.kind !== sel.kind || st.uid !== sel.uid || st.index !== sel.index) throw new Error(`selecting ${JSON.stringify(sel)} gave ${JSON.stringify(st)}`);
  await sleep(200);
}
/** In-page: step the current battle screen on the game's clock until `until` holds for its arena `a` (or `maxSecs`). */
async function stepUntil(page, until, maxSecs = 60) {
  return page.evaluate(({ until, maxSecs }) => {
    const g = window.bb.game;
    const test = new Function("a", `return (${until});`);
    let n = 0, found = false;
    for (; n < 60 * (maxSecs + 8); n++) {
      g.step(1 / 60);
      const a = g.screen.arena;
      if (a && g.screen.phase === "fight" && test(a)) { found = true; break; }
      if (a && a.b.t >= maxSecs) break;
    }
    g.render();
    const a = g.screen.arena;
    return {
      frames: n, found, t: a ? a.b.t : -1, phase: g.screen.phase, foe: g.screen.foeName ?? "",
      hull: a ? a.b.sides.map((s) => `${Math.round(s.hull.hp)}/${Math.round(s.hull.max)}`) : [], plate: a ? a.b.sides.map((s) => +s.plate.plate.toFixed(1)) : [],
    };
  }, { until, maxSecs });
}
/** In-page: the event screen's cards (label, blocked, the parts they grant, the cost) and the run's SMUGGLER wares. */
async function eventCards(page) {
  return page.evaluate((pool) => {
    const sc = window.bb.game.screen, run = window.bb.game.run, w = run.wares || {};
    return {
      id: run.event.id, day: run.day, seed: run.seed, gold: run.gold,
      choices: sc.choices.map((c) => ({
        label: c.label, blocked: c.blocked || "", items: c.gain.filter((x) => x.k === "item").map((x) => x.def),
        cost: c.cost.map((x) => (x.k === "gold" ? `${x.n} G` : x.k)).join(" + "),
      })),
      wares: Object.fromEntries(Object.entries(pool).map(([k, ids]) => [k, Object.fromEntries(ids.filter((id) => Object.prototype.hasOwnProperty.call(w, id)).map((id) => [id, w[id]]))])),
    };
  }, SMUGGLER_POOL);
}
/** The SMUGGLER's card of `kind` offers contraband: one of the run's own wares of that effect, none of which is unlocked
 *  today, so the part comes ahead of its day. Returns { def, unlocks }; throws if not. */
function contrabandOf(ev, kind) {
  const c = ev.choices.find((x) => x.label === kind);
  if (!c) throw new Error(`no ${kind} card at the ${ev.id}: ${JSON.stringify(ev.choices)}`);
  if (c.blocked || c.items.length !== 1) throw new Error(`the ${kind} card offers no part: ${JSON.stringify(c)}`);
  const ws = ev.wares[kind], def = c.items[0];
  if (!(def in ws)) throw new Error(`the ${kind} card offers ${def}, not one of the run's wares (${JSON.stringify(ws)})`);
  if (Object.values(ws).some((d) => d <= ev.day)) throw new Error(`${kind} has a ware unlocked on day ${ev.day} (${JSON.stringify(ws)}): no contraband`);
  return { def, unlocks: ws[def], cost: c.cost };
}

// ------------------------------------------------------------------------------------------------- the shot list

async function stokerShots(page, touch, vname) {
  // the capped line on the Kiln, then G1's F2 variant on an ARMOR PRESS
  for (const [name, key, what] of [
    ["stoker-kiln", "stokerKiln", "FURNACE's start deck, a STOKER ★2 at (6,6) on the Kiln (its 6-tile belt into the heavy gun, which can't take the full stoke)"],
    ["stoker-press", "stokerPress", "G1's C-E3-press deck: the Kiln and an ARMOR PRESS share the heavy gun, a STOKER ★2 at (8,6) on the press"],
  ]) {
    await item(name, vname, async () => {
      const d = DECKS[key];
      const deck = await openDeck(page, d);
      await select(page, d.sel);
      await park(page, touch);
      const kept = await page.evaluate(() => JSON.stringify(window.bb.game.run.build.items));
      if (kept !== JSON.stringify(deck.items)) throw new Error(`the deck moved: ${kept}`);
      await shot(page, name, vname, `${what}, day ${d.day}, the STOKER selected: its panel opens with the capped line in amber`);
      record.checks[`${name}-${vname}`] = { items: deck.items.map((p) => `${p.def}${p.stars > 1 ? ` ★${p.stars}` : ""} (${p.x},${p.y})`), routes: deck.routes.length };
    });
  }
}

async function breakerShots(page, touch, vname) {
  for (const [name, key, what] of [
    ["breaker-bastion", "breakerBastion", "BASTION's start deck (it plates its hull) with a PLATE BREAKER ★2 at (3,2) on belt 1, the belt selected: DMG reads lo-hi (the floor's total, then the big number's)"],
    ["breaker-furnace", "breakerFurnace", "FURNACE's start deck (no plating source) with a PLATE BREAKER ★2 at (3,2) on belt 1, the belt selected: DMG reads the floor alone"],
  ]) {
    await item(name, vname, async () => {
      const d = DECKS[key];
      const deck = await openDeck(page, d);
      await select(page, d.sel);
      await park(page, touch);
      await shot(page, name, vname, `${what}, day ${d.day}`);
      record.checks[`${name}-${vname}`] = { hero: deck.hero, items: deck.items.map((p) => `${p.def}${p.stars > 1 ? ` ★${p.stars}` : ""} (${p.x},${p.y})`) };
    });
  }
}

async function smugglerShots(page, touch, vname) {
  // run seed 1: no SHOCK ware unlocked on days 1-2, STATIC BRUSH and LODESTONE drawn (roadDraws-080.json "smuggler|none|1")
  for (const [day, hero, want] of [[1, "foundry", "staticbrush"], [2, "bastion", "lodestone"]]) {
    await item(`smuggler-d${day}`, vname, async () => {
      await page.evaluate(({ day, hero }) => { window.bb.clearPool(); window.bb.openEvent("smuggler", { hero, seed: 1, day, gold: 9, lives: 5 }); }, { day, hero });
      await settle(page, "event");
      await sleep(900);
      await park(page, touch);
      const ev = await eventCards(page);
      if (ev.id !== "smuggler") throw new Error(`the event is ${ev.id}`);
      const c = contrabandOf(ev, "SHOCK");
      if (c.def !== want) throw new Error(`run seed 1's day-${day} SHOCK card offers ${c.def}, not ${want}`);
      const burn = ev.choices.find((x) => x.label === "BURN");
      log(`smuggler run seed 1, day ${day} (${hero}): ${ev.choices.map((x) => `${x.label} ${x.items.join("+") || "-"}${x.cost ? ` for ${x.cost}` : ""}${x.blocked ? ` [${x.blocked}]` : ""}`).join(" | ")}; the run's wares: ${JSON.stringify(ev.wares)}`);
      record.checks[`smuggler-d${day}-${vname}`] = { ...ev, contraband: c };
      await shot(page, `smuggler-d${day}`, vname, `the AMMO SMUGGLER on day ${day} of run seed 1 (${hero.toUpperCase()}): BURN offers ${burn.items.join("+") || "nothing"} (unlocked), SHOCK offers ${c.def.toUpperCase()} for ${c.cost}, the run's own ware ahead of its day ${c.unlocks} (contraband: no SHOCK ware unlocked yet)`);
      if (day !== 1) return;
      // a real click (tap) on the SHOCK card buys the contraband into cargo
      const i = ev.choices.findIndex((x) => x.label === "SHOCK");
      await tapRegion(page, touch, `choice${i}`);
      await page.waitForFunction((i) => window.bb.game.run.event.picked === i && window.bb.game.screen.pt > 0.8, i, { timeout: 8000 });
      await park(page, touch);
      await sleep(300);
      const after = await page.evaluate(() => ({ gold: window.bb.game.run.gold, cargo: window.bb.game.run.inventory.map((p) => p.def), item: window.bb.game.screen.deckItem || "" }));
      if (!after.cargo.includes(want) || after.item !== want || after.gold !== ev.gold - 3) throw new Error(`the SHOCK pick gave ${JSON.stringify(after)}`);
      log(`smuggler run seed 1, day 1: SHOCK picked by a real ${touch ? "tap" : "click"}: gold ${ev.gold} -> ${after.gold}, cargo ${after.cargo.join(", ")}`);
      await shot(page, "smuggler-d1-taken", vname, `the SHOCK card taken by a real ${touch ? "tap" : "click"}: ${want.toUpperCase()} IS IN CARGO (gold ${ev.gold} -> ${after.gold}), REFIT / FIGHT NOW`);
    });
  }
}

async function grimholdShots(page, touch, vname, f) {
  await item("warlord-grimhold", vname, async () => {
    if (!f) throw new Error("no fork offers GRIMHOLD as the Medium warlord on days 5, 4, 6");
    await page.evaluate(({ day, seed }) => window.bb.openWarlord("medium", { hero: "foundry", day, seed, wins: day - 1 }), f);
    await settle(page, "warlord");
    const w = await page.evaluate(() => {
      const w = window.bb.game.run.warlord, st = (p) => `${p.def}${p.stars > 1 ? ` ★${p.stars}` : ""}`;
      return { id: w.id, name: w.name, tier: w.tier, day: w.day, hero: w.build.hero, hull: w.build.hullBonus, items: w.build.items.map(st), mods: w.build.mods.map(st), cost: window.bb.deckCost(w.build) };
    });
    if (w.id !== "grimhold" || w.hero !== "bastion") throw new Error(`the warlord is ${JSON.stringify(w)}`);
    if (!w.mods.some((m) => m.startsWith("anvil")) || !w.mods.some((m) => m.startsWith("spallcatcher"))) throw new Error(`GRIMHOLD's day-${w.day} deck has no ANVIL BREECH and SPALL CATCHER: ${w.mods.join(", ")}`);
    log(`GRIMHOLD on day ${w.day} (run seed ${f.seed}, fork ${JSON.stringify(f.warlords)}): BASTION, hull +${w.hull}, deckCost ${w.cost}; deck ${w.items.join(", ")}; turret ${w.mods.join(", ")}`);
    record.checks[`warlord-grimhold-${vname}`] = { fork: f, warlord: w };
    const b = await stepUntil(page, "a.b.t >= 8 && a.b.sides[1].plate.plate >= 2", 40);
    if (!b.foe.includes("GRIMHOLD")) throw new Error(`warlord fight vs ${b.foe}, not GRIMHOLD`);
    if (!b.found) log(`  (no frame after 8 s with GRIMHOLD holding 2 plating before ${b.t.toFixed(1)} s: shot at ${b.t.toFixed(1)} s)`);
    await park(page, touch);
    await shot(page, "warlord-grimhold", vname, `FOUNDRY vs the Medium warlord ${b.foe} (BASTION, regrown in B1 M3: ${w.mods.join(", ")} on the heavy gun) on day ${w.day} (run ${f.seed}), ${b.t.toFixed(1)} s in: hulls ${b.hull.join(" / ")}, plating ${b.plate.join(" / ")}`);
  });
}

// ------------------------------------------------------------------------------------------------- the runs (real input)

const foeOf = (page) => page.evaluate(() => {
  const d = window.bb.game.run.dusk;
  return d && { day: d.day, kind: d.kind, name: d.name, hero: d.hero, hull: d.build.hullBonus, cost: window.bb.deckCost(d.build), budget: window.bb.maxGoldByDay(d.day), mine: window.bb.deckCost(window.bb.game.run.build) };
});
const warlordNow = (page) => page.evaluate(() => {
  const run = window.bb.game.run, w = run.warlord;
  return w && { day: w.day, id: w.id, name: w.name, tier: w.tier, hull: w.build.hullBonus, cost: window.bb.deckCost(w.build), mods: w.build.mods.map((m) => m.def), lives: run.lives, gold: run.gold, reward: w.reward };
});

/** A run of `hero` from the title with real input, `RUN_DAYS` days (scriptedRun's day, with shots on the way). */
async function heroRun(page, touch, vname, hero, pin) {
  const t0 = Date.now();
  const at = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
  const roads = pin.day2.warlords.medium === "grimhold" ? "vmv" : "vvv";
  // playthrough.mjs road(): `take` names the card to take at an event (here the SMUGGLER's contraband card)
  const state = { refitDone: false, picks: 0, take: { smuggler: [pin.take.kind, pin.take.price] }, took: {}, tapPicks: 0, forkPicks: {} };
  const rec = { view: vname, hero, pin: pin.r, seed: pin.seed, roads, days: [], smuggler: null, grimhold: null };
  record.runs.push(rec);
  await page.evaluate(() => window.bb.clearPool());
  log(`[${at()}] ghost pool empty (a fresh player: every dusk is a stand-in)`);
  await tapRegion(page, touch, "new");
  await settle(page, "hero");
  for (let k = 0; k < 4 && (await page.evaluate(() => window.bb.game.screen.current)) !== hero; k++) await tapRegion(page, touch, "next");
  await sleep(700);
  await park(page, touch);
  const shown = await page.evaluate(() => window.bb.game.screen.current);
  if (shown !== hero) throw new Error(`hero select shows ${shown}, not ${hero}`);
  await shot(page, `run-${hero}-select`, vname, `hero select: ${hero.toUpperCase()} on show (reached with the > button), COMMAND ${hero.toUpperCase()}`);
  await tapRegion(page, touch, "go");
  await settle(page, "build");
  const got = await page.evaluate(() => ({ hero: window.bb.game.run.hero, seed: window.bb.game.run.seed }));
  if (got.hero !== hero || got.seed !== pin.seed) throw new Error(`hero select started ${JSON.stringify(got)}, wanted ${hero} on run seed ${pin.seed}`);
  log(`[${at()}] COMMAND ${hero.toUpperCase()} (picked on the hero screen): run seed ${got.seed}`);
  for (let day = 1; day <= RUN_DAYS; day++) {
    await settle(page, "build");
    await ready(page);
    const dawn = await page.evaluate(() => {
      const run = window.bb.game.run, s = window.bb.game.screen;
      return { day: run.day, gold: run.gold, lives: run.lives, wl: `${run.wins}-${run.losses}`, foe: s.foe.name, kind: s.foe.kind };
    });
    log(`[${at()}] DAWN · DAY ${dawn.day}/10: ${dawn.gold} gold, ${dawn.lives} lives, W-L ${dawn.wl}; NEXT BATTLE ${dawn.foe} (${dawn.kind})`);
    const letter = roads[day - 1];
    const today = await page.evaluate(() => window.bb.forkInfo().event);
    const want = letter === "v" ? state.take[today] : null;
    const reserve = want ? want[1] : 0;
    const parts = [];
    for (let k = 0; k < 8; k++) {
      const def = await placePlanned(page, touch, reserve);
      if (!def) break;
      parts.push(def);
    }
    log(`[${at()}] ${touch ? "tap-buy + tap-place" : "drag"}: ${parts.join(", ") || "nothing"}${reserve ? ` (keeping ${reserve} gold for today's ${today}: ${want[0]})` : ""}`);
    if (day === 1) {
      await park(page, touch);
      await sleep(1300); // the buy's "-N" popup over the gold counter lives 0.85 s (fx.ts popup): let it clear
      const deck = await page.evaluate(() => window.bb.game.run.build.items.map((p) => p.def));
      await shot(page, `run-${hero}-dawn`, vname, `${hero.toUpperCase()}'s day-1 dawn after the real buys (${parts.join(", ") || "none"}): deck ${deck.join(", ")}; NEXT BATTLE ${dawn.foe}`);
    }
    await tapRegion(page, touch, "fight");
    await settle(page, "fork");
    const f = await page.evaluate(() => window.bb.forkInfo());
    log(`[${at()}] FIGHT -> ROAD FORK · DAY ${f.day}: 1 EVENT ${f.event} | 2 EASY ${f.warlords.easy} | 3 MEDIUM ${f.warlords.medium} | 4 HARD ${f.warlords.hard}`);
    const i = PICKS.indexOf(letter);
    await tapRegion(page, touch, `fork${i}`);
    if (touch) {
      log(`[${at()}] tap card ${i + 1} -> inspect; tap again -> go`);
      await tapRegion(page, touch, `fork${i}`);
      state.tapPicks++;
    }
    state.forkPicks[letter] = (state.forkPicks[letter] || 0) + 1;
    if (letter === "v") {
      const s = await settleAny(page, ["event", "battle"]);
      if (s === "event" && f.event === "smuggler") {
        await sleep(900);
        await park(page, touch);
        const ev = await eventCards(page);
        const c = contrabandOf(ev, pin.take.kind);
        rec.smuggler = { day, contraband: c, cards: ev.choices, wares: ev.wares };
        await shot(page, `run-${hero}-smuggler`, vname, `the road stop, day ${day}: the AMMO SMUGGLER's ${pin.take.kind} card offers ${c.def.toUpperCase()} for ${c.cost}, the run's own ware ahead of its day ${c.unlocks} (contraband)`);
      }
      await road(page, touch, log, at, state); // the contraband card by a real tap (take), REFIT and FIGHT; else the event's own pick
      if (f.event === "smuggler") {
        const has = await page.evaluate((def) => [...window.bb.game.run.build.items, ...window.bb.game.run.inventory].some((p) => p.def === def), rec.smuggler.contraband.def);
        if (state.took.smuggler !== day || !has) throw new Error(`the run did not take the SMUGGLER's ${rec.smuggler.contraband.def} (took ${JSON.stringify(state.took)}, held ${has})`);
        rec.smuggler.taken = true;
        log(`[${at()}] the contraband ${rec.smuggler.contraband.def} is aboard (deck or cargo) on day ${day}, ahead of its day ${rec.smuggler.contraband.unlocks}`);
      }
    } else {
      // a warlord picked at the fork, fought in real time (shot mid-fight), then SKIP, its result card and on to dusk
      await settle(page, "warlord");
      const w = await warlordNow(page);
      log(`[${at()}] road choice: ${i + 1} WARLORD ${w.name} (${w.tier}; hull +${w.hull}, deckCost ${w.cost}; turret ${w.mods.join(", ")})`);
      await page.waitForFunction(() => window.bb.game.screen.phase === "fight" && window.bb.game.screen.arena.b.t >= 7, null, { timeout: 40000 });
      const b = await page.evaluate(() => { const a = window.bb.game.screen.arena; return { t: a.b.t, hull: a.b.sides.map((s) => `${Math.round(s.hull.hp)}/${Math.round(s.hull.max)}`), plate: a.b.sides.map((s) => +s.plate.plate.toFixed(1)) }; });
      await shot(page, `run-${hero}-${w.id}`, vname, `day ${day}: ${hero.toUpperCase()} vs the ${w.tier} warlord ${w.name} (picked at the fork by a real ${touch ? "tap" : "click"}), about ${b.t.toFixed(1)} s in: hulls ${b.hull.join(" / ")}, plating ${b.plate.join(" / ")}`);
      await tapRegion(page, touch, "skip");
      await page.waitForFunction(() => window.bb.game.screen.phase === "result", null, { timeout: 90000 });
      await sleep(450);
      const r = await page.evaluate(() => {
        const run = window.bb.game.run, x = run.warlord.result;
        return { outcome: x.outcome, time: x.time.toFixed(1), gold: x.gold, parts: x.parts, took: x.took, lives: run.lives, goldNow: run.gold };
      });
      log(`[${at()}] WARLORD RESULT: ${r.outcome.toUpperCase()} vs ${w.name} (${r.time}s sim), lives ${w.lives} -> ${r.lives}, reward ${r.outcome === "win" ? `+${r.gold}G` : "forfeit (0G)"}, gold ${w.gold} -> ${r.goldNow}`);
      if (r.lives !== w.lives) throw new Error(`the warlord fight changed lives (${w.lives} -> ${r.lives})`);
      if (w.id === "grimhold") rec.grimhold = { day, outcome: r.outcome, time: r.time, mods: w.mods };
      let part = r.took;
      if (r.outcome === "win" && r.parts.length && !r.took) {
        await tapRegion(page, touch, "take0");
        part = await page.evaluate(() => window.bb.game.run.warlord.result.took);
      }
      await tapRegion(page, touch, part ? "fightnow" : "next");
      await settle(page, "battle");
    }
    const foe = await foeOf(page);
    log(`[${at()}] DUSK · DAY ${foe.day}: vs ${foe.name} (${foe.kind} ${foe.hero}, hull +${foe.hull}, deckCost ${foe.cost} of ${foe.budget} gold; yours ${foe.mine}), same as the dawn preview: ${foe.name === dawn.foe}`);
    await page.waitForFunction(() => window.bb.game.screen.phase === "fight", null, { timeout: 15000 });
    if (day === 1) {
      await page.waitForFunction(() => window.bb.game.screen.arena.b.t >= 6, null, { timeout: 30000 });
      const b = await page.evaluate(() => { const a = window.bb.game.screen.arena; return { t: a.b.t, hull: a.b.sides.map((s) => `${Math.round(s.hull.hp)}/${Math.round(s.hull.max)}`), plate: a.b.sides.map((s) => +s.plate.plate.toFixed(1)) }; });
      await shot(page, `run-${hero}-dusk`, vname, `day-1 dusk: ${hero.toUpperCase()} vs the stand-in ${foe.name} (${foe.hero}), about ${b.t.toFixed(1)} s in (real time): hulls ${b.hull.join(" / ")}, plating ${b.plate.join(" / ")}`);
    }
    await tapRegion(page, touch, "skip");
    await page.waitForFunction(() => window.bb.game.screen.phase === "result", null, { timeout: 90000 });
    await page.waitForFunction(() => window.bb.regions().some((r) => r.id === "next"), null, { timeout: 5000 });
    const r = await page.evaluate(() => {
      const run = window.bb.game.run, h = run.history[run.history.length - 1];
      return { day: h.day, outcome: h.outcome, time: h.time.toFixed(1), income: h.income, lives: run.lives, wl: `${run.wins}-${run.losses}`, over: run.over };
    });
    log(`[${at()}] RESULT CARD: ${r.outcome === "win" ? "WIN" : r.outcome === "loss" ? "LOSS -1 LIFE" : "DRAW"} (${r.time}s sim), income +${r.income}G, lives ${r.lives}, W-L ${r.wl}${r.over ? `, run ${r.over}` : ""}`);
    rec.days.push({ day, road: letter === "v" ? `EVENT ${f.event}` : `${letter.toUpperCase()} ${f.warlords[{ e: "easy", m: "medium", h: "hard" }[letter]]}`, dusk: `${foe.name} (${foe.hero})`, outcome: r.outcome, time: r.time });
    if (r.over || day >= RUN_DAYS) {
      await sleep(400);
      await park(page, touch);
      await shot(page, `run-${hero}-end`, vname, `the run's last result card (day ${r.day}): ${r.outcome.toUpperCase()} vs ${foe.name}, W-L ${r.wl}, ${r.lives} lives`);
      break;
    }
    await tapRegion(page, touch, "next");
  }
  log(`[${at()}] days: ${rec.days.map((d) => `D${d.day} ${d.road} / dusk ${d.dusk} ${d.outcome}`).join(" | ")}`);
  if (rec.days.length < RUN_DAYS) throw new Error(`the run played ${rec.days.length} days`);
  if (!rec.smuggler?.taken) throw new Error("the run never took the SMUGGLER's contraband");
  if (roads.includes("m") && !rec.grimhold) throw new Error("the run never fought GRIMHOLD");
}

// ------------------------------------------------------------------------------------------------- main

async function main() {
  await mkdir(OUT, { recursive: true });
  const { html } = await inlineBuild(DIST);
  const page0 = join(process.env.TMPDIR ?? tmpdir(), "bb-b1shots.html");
  await writeFile(page0, html);
  const url = pathToFileURL(page0).href;
  log(`page: ${page0} (${html.length} bytes, from ${DIST})`);
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"] });
  let errored = 0;
  const watch = (page, errors) => {
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
    page.on("requestfailed", (r) => errors.push(`requestfailed: ${r.url()}`));
  };
  let pin = null, fork = null;
  for (const [vname, vopts] of Object.entries(VIEWS)) {
    const touch = !!vopts.hasTouch;
    // ------------------------------------------------ the shots (deterministic: in-page decks, events and fights)
    {
      const ctx = await browser.newContext(vopts);
      const page = await ctx.newPage();
      await page.addInitScript(() => { Math.random = () => 0.3; });
      const errors = [];
      watch(page, errors);
      log(`\n== shots ${vname} (${vopts.viewport.width}x${vopts.viewport.height} @${vopts.deviceScaleFactor}, ${touch ? "touch" : "mouse"})`);
      try {
        await page.goto(url);
        await page.waitForFunction(() => !!window.bb && window.bb.screen() === "title", null, { timeout: 15000 });
        log(`version ${await page.evaluate(() => window.bb.version)}`);
        // the searches first, on the title screen (setupRun replaces the run; no battle or build screen reads it meanwhile)
        if (!fork) {
          fork = await findFork(page, { medium: ["grimhold"] }, [5, 4, 6]);
          log(`GRIMHOLD fork: ${fork ? `run seed ${fork.seed}, day ${fork.day}: event ${fork.event} | easy ${fork.warlords.easy} | medium ${fork.warlords.medium} | hard ${fork.warlords.hard}` : "none"}`);
        }
        if (!pin) {
          pin = await findRunPin(page);
          log(pin ? `run pin: Math.random = ${pin.r} -> run seed ${pin.seed}: day-1 fork ${pin.day1.event} ${JSON.stringify(pin.day1.warlords)}, contraband ${JSON.stringify(pin.contraband)}; day-2 fork ${pin.day2.event} ${JSON.stringify(pin.day2.warlords)}` : "run pin: none");
          record.checks.pin = pin;
        }
      } catch (e) {
        record.failures.push(`setup ${vname}: ${e.message}`);
        log(`FAILED setup (${vname}): ${e.stack || e.message}`);
      }
      await stokerShots(page, touch, vname);
      await breakerShots(page, touch, vname);
      await smugglerShots(page, touch, vname);
      await grimholdShots(page, touch, vname, fork);
      log(errors.length ? `console errors (${errors.length}):\n  ${errors.join("\n  ")}` : "console errors: 0");
      record.errors[`shots-${vname}`] = errors;
      errored += errors.length;
      await ctx.close();
    }
    // ------------------------------------------------ the runs (real input): FOUNDRY, then BASTION
    for (const hero of ["foundry", "bastion"]) {
      if (!pin) {
        record.failures.push(`run-${hero} ${vname}: no pin`);
        log(`FAILED run-${hero} (${vname}): no run pin`);
        continue;
      }
      const ctx = await browser.newContext(vopts);
      const page = await ctx.newPage();
      await page.addInitScript((r) => { Math.random = () => r; }, pin.r);
      const errors = [];
      watch(page, errors);
      log(`\n== run ${vname}: ${hero.toUpperCase()}, Math.random ${pin.r} (run seed ${pin.seed}), ${RUN_DAYS} days, empty ghost pool (every dusk a stand-in)`);
      await item(`run-${hero}`, vname, async () => {
        await page.goto(url);
        await page.waitForFunction(() => !!window.bb && window.bb.screen() === "title", null, { timeout: 15000 });
        await heroRun(page, touch, vname, hero, pin);
      });
      log(errors.length ? `console errors (${errors.length}):\n  ${errors.join("\n  ")}` : "console errors: 0");
      record.errors[`run-${hero}-${vname}`] = errors;
      errored += errors.length;
      await ctx.close();
    }
  }
  await browser.close();
  const failed = record.failures.length + errored;
  log(`\nshots: ${record.shots.length}; failed items: ${record.failures.length}${record.failures.length ? ` (${record.failures.join("; ")})` : ""}; console errors: ${errored}`);
  log(failed ? `\nRESULT: FAIL (${record.failures.length} failed items, ${errored} console errors)` : "\nRESULT: PASS (STOKER's capped line on the Kiln and the ARMOR PRESS, PLATE BREAKER's DMG lo-hi on BASTION and the floor on FURNACE, the SMUGGLER's contraband on days 1-2 and bought, the regrown GRIMHOLD as a road warlord, a FOUNDRY run and a BASTION run with real input meeting the SMUGGLER's contraband and GRIMHOLD; desk and phone; 0 console errors)");
  await writeFile(join(OUT, "b1shots.log"), lines.join("\n") + "\n");
  await writeFile(join(OUT, "b1shots.json"), JSON.stringify(record, null, 1) + "\n");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
