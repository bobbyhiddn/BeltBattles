// 0.6.2j BELT JOINS (REQ-BFG-027, REQ-BFG-030): the scripted join scenario. scripts/singlefile.mjs runs it as
// "join-desk" (mouse) and "join-phone" (touch) when BB_RUNS names them. On the tooling deck "joinsopen" (src/tooling.ts
// SHOWCASE, opened with window.bb.openShowcase: FURNACE, the KILN's belt up column 4, a STAMP PRESS west of it with no
// belt yet), with real input on the real build screen, it:
//   1. drags a belt out of the STAMP PRESS into the KILN's belt, which joins it (J3), and checks FIGHT is open;
//   2. redraws the KILN's belt into the new belt's end: refused, WOULD LOOP (J3, J11), then cancels (nothing changes);
//   3. FIGHTs with the join: the road fork (the road event), then the dusk battle to its result card;
//   4. on the next dawn removes the KILN's belt (REMOVE BELT): the joining belt is left a dead end and FIGHT is
//      blocked with BELT GOES NOWHERE (J8, J14 (c)).
// With BB_SHOTS_DIR set it saves the 0.6.2j shots there: join-<shot>-<view>.png (pending, readout, done, illegal,
// cross, crowded, deadend). The battle frames are stepped deterministically in the page (as scripts/shots-list.mjs does).

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { settle, sleep, tapRegion } from "./playthrough.mjs";
import { roadStop } from "./roadstop.mjs";

const K = (x, y) => y * 10 + x;

/** Client point at the centre of deck cell (x, y) of the build screen's deck (any facing). */
const cellPoint = (page, x, y) => page.evaluate(([cx, cy]) => {
  const f = window.bb.game.screen.L.frame, D = 120;
  const sx = f.facing === 0 || f.facing === 2 ? f.dx + cx * 12 : f.facing === 1 ? f.dx + D - (cy + 1) * 12 : f.dx + cy * 12;
  const sy = f.facing === 0 ? f.dy + cy * 12 : f.facing === 2 ? f.dy + D - (cy + 1) * 12 : f.dy + cx * 12;
  return window.bb.toClient(sx + 6, sy + 6);
}, [x, y]);

/**
 * Press on the first cell of `path` and drag through the others, cell by cell, with real input: the mouse on desk,
 * CDP touch events on phones. Returns release({ cancel }): lift the pointer (cancel: Escape first on desk, a touch
 * cancel on phones, so the drag commits nothing).
 */
async function drag(page, touch, path) {
  const pts = [];
  for (const [x, y] of path) pts.push(await cellPoint(page, x, y));
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    const tp = (p) => [{ x: p.x, y: p.y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: tp(pts[0]) });
    for (let i = 1; i < pts.length; i++) {
      for (let k = 1; k <= 4; k++) {
        const a = pts[i - 1], b = pts[i];
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: tp({ x: a.x + (b.x - a.x) * k / 4, y: a.y + (b.y - a.y) * k / 4 }) });
      }
      await sleep(40);
    }
    await sleep(120);
    return async ({ cancel = false } = {}) => {
      await cdp.send("Input.dispatchTouchEvent", { type: cancel ? "touchCancel" : "touchEnd", touchPoints: [] });
      await sleep(150);
    };
  }
  await page.mouse.move(pts[0].x, pts[0].y);
  await page.mouse.down();
  for (let i = 1; i < pts.length; i++) {
    await page.mouse.move(pts[i].x, pts[i].y, { steps: 4 });
    await sleep(40);
  }
  await sleep(120);
  return async ({ cancel = false } = {}) => {
    if (cancel) await page.keyboard.press("Escape");
    await page.mouse.up();
    await sleep(150);
  };
}

/** A tap (touch) or click (mouse) on deck cell (x, y). */
async function tapCell(page, touch, x, y) {
  const p = await cellPoint(page, x, y);
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  await sleep(150);
}

const routesNow = (page) => page.evaluate(() => JSON.stringify(window.bb.game.run.build.routes));

/** In-page: step the battle (at most `max` ticks) until `cond(s, g)` holds for the player's side, then render. */
const stepUntil = (page, cond, max) => page.evaluate(([c, n]) => {
  const g = window.bb.game;
  const test = new Function("s", "b", `return (${c});`);
  let ok = false;
  for (let i = 0; i < n; i++) {
    g.step(1 / 60);
    const a = g.screen.arena;
    if (!a) break;
    if (test(a.b.sides[0], a.b)) { ok = true; break; }
  }
  g.render();
  const b = g.screen.arena?.b;
  return { ok, t: b ? +b.t.toFixed(2) : -1 };
}, [cond, max]);

export async function joinRun(page, touch, log, opts = {}) {
  const t0 = Date.now();
  const at = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
  const view = opts.view ?? (touch ? "phone" : "desk");
  const dir = process.env.BB_SHOTS_DIR;
  if (dir) await mkdir(dir, { recursive: true });
  const shots = [];
  const shot = async (name) => {
    if (!dir) return;
    await sleep(160);
    const file = join(dir, `join-${name}-${view}.png`);
    await page.screenshot({ path: file });
    shots.push(`join-${name}-${view}.png`);
  };

  // 1. the tooling deck before the join, and a belt dragged out of the STAMP PRESS into the KILN's belt
  await page.evaluate(() => { window.bb.clearPool(); window.bb.openShowcase("joinsopen", "build"); });
  await settle(page, "build");
  await page.waitForFunction(() => window.bb.game.screen.caravan.ready, null, { timeout: 10000 });
  const d0 = await page.evaluate(() => ({ day: window.bb.game.run.day, hero: window.bb.game.run.hero, routes: window.bb.game.run.build.routes.length }));
  log(`[${at()}] BUILD · DAY ${d0.day} (${d0.hero.toUpperCase()}, tooling deck joinsopen): the KILN's belt runs up column 4 into the turret; the STAMP PRESS at (0,6) has no belt (${d0.routes} route)`);
  const release = await drag(page, touch, [[1, 6], [2, 6], [2, 5], [2, 4], [3, 4], [4, 4]]);
  const pending = await page.evaluate(() => { const d = window.bb.game.screen.ed.draw; return d && { cells: d.cells, join: d.join ?? null }; });
  log(`[${at()}] ${touch ? "touch" : "mouse"} drag out of the STAMP PRESS through (2,6) (2,5) (2,4) (3,4) into the KILN's belt tile (4,4): pending belt ${JSON.stringify(pending?.cells)}, joins cell ${pending?.join}`);
  if (!pending || pending.join !== K(4, 4)) throw new Error("the drag into the KILN's belt did not join it");
  await shot("pending");
  await release();
  const made = await page.evaluate(() => {
    const s = window.bb.game.screen, b = window.bb.game.run.build, i = b.routes.findIndex((q) => q.factory === 2);
    return { i, route: b.routes[i], sel: s.sel, block: s.block ?? null };
  });
  log(`[${at()}] released: route ${made.i} ${JSON.stringify(made.route)}; selected ${JSON.stringify(made.sel)}; FIGHT ${made.block ? `blocked (${made.block})` : "open"}`);
  if (!made.route || made.route.join !== K(4, 4) || made.route.cells.includes(K(4, 4))) throw new Error("the committed belt does not join (4,4)");
  if (made.block) throw new Error(`FIGHT is blocked with a legal join: ${made.block}`);
  await shot("readout"); // the new belt is selected: its readout runs through the join
  await page.keyboard.press("Escape");
  await sleep(100);
  await shot("done");

  // 2. an illegal join: the KILN's belt redrawn from its tile (4,3) west and into the new belt's end: WOULD LOOP
  const before = await routesNow(page);
  const release2 = await drag(page, touch, [[4, 3], [3, 3], [3, 4]]);
  const refused = await page.evaluate(() => window.bb.game.screen.ed.draw?.refused ?? null);
  log(`[${at()}] redraw the KILN's belt from (4,3) through (3,3) into the press belt's end (3,4): refused ${JSON.stringify(refused)}`);
  if (!refused || refused.reason !== "WOULD LOOP") throw new Error("the looping join was not refused with WOULD LOOP");
  await shot("illegal");
  await release2({ cancel: true });
  const after = await routesNow(page);
  log(`[${at()}] drag cancelled: the deck is unchanged: ${after === before}`);
  if (after !== before) throw new Error("the cancelled redraw changed the deck");

  // 3. FIGHT with the join: the road fork (the event), then the dusk battle
  const state = {
    take: {}, took: {}, picks: 0, refitDone: false, forkPicks: {}, tapPicks: 0, dayLog: [], warlordLosses: [],
    livesChanged: [], matriarchDays: [],
  };
  await tapRegion(page, touch, "fight");
  await roadStop(page, touch, log, at, state, "v");
  const deck = await page.evaluate(() => window.bb.game.run.build.routes.find((q) => q.factory === 2));
  log(`[${at()}] DUSK with the join: the press belt ${JSON.stringify(deck)}`);
  if (!deck || deck.join !== K(4, 4)) throw new Error("the dusk deck lost its join");
  await page.waitForFunction(() => window.bb.game.screen.phase === "fight", null, { timeout: 15000 });
  const j = await page.evaluate(() => {
    const s = window.bb.game.screen.arena.b.sides[0];
    const r = s.routes.find((q) => q.join);
    return r ? { index: r.index, join: r.join, joiners: (s.joiners || []).length } : null;
  });
  log(`[${at()}] battle: joining belt ${JSON.stringify(j)}`);
  if (!j) throw new Error("the battle has no joining belt");
  const cross = await stepUntil(page, `s.routes[${j.join.route}].ammo.some((a) => a.via === ${j.index} && a.s > ${j.join.enter + 2} && a.s < ${j.join.enter + 5})`, 60 * 30);
  log(`[${at()}] a payload crossing the join at ${cross.t}s: ${cross.ok}`);
  if (!cross.ok) throw new Error("no payload crossed the join");
  await shot("cross");
  const crowd = await stepUntil(page, `s.routes[${j.index}].ammo.filter((a) => a.blocked).length >= 2 && s.routes[${j.join.route}].ammo.some((a) => Math.abs(a.s - ${j.join.enter}) < 7)`, 60 * 40);
  log(`[${at()}] the join crowded (2+ payloads waiting on the joining belt, the main belt at the join) at ${crowd.t}s: ${crowd.ok}`);
  await shot("crowded");
  const tally = await page.evaluate((ji) => {
    const s = window.bb.game.screen.arena.b.sides[0];
    const m = s.routes[ji.join.route];
    return { onMain: m.ammo.filter((a) => a.via === ji.index).length, jams: s.stats.jams, maxQueue: s.stats.maxQueue };
  }, j);
  log(`[${at()}] so far: ${tally.onMain} joined payloads on the main belt now, jams ${tally.jams}, max queue ${tally.maxQueue}`);
  await tapRegion(page, touch, "skip");
  await page.waitForFunction(() => window.bb.game.screen.phase === "result", null, { timeout: 90000 });
  await page.waitForFunction(() => window.bb.regions().some((r) => r.id === "next"), null, { timeout: 5000 });
  const r = await page.evaluate(() => {
    const run = window.bb.game.run, h = run.history[run.history.length - 1];
    return { day: h.day, outcome: h.outcome, time: h.time.toFixed(1), lives: run.lives, wl: `${run.wins}-${run.losses}`, shots: h.player.shots, dmg: h.player.damage.toFixed(1), over: run.over };
  });
  log(`[${at()}] JOIN RESULT CARD: ${r.outcome.toUpperCase()} (${r.time}s sim), ${r.shots} shots, ${r.dmg} damage, lives ${r.lives}, W-L ${r.wl}`);

  // 4. the next dawn: REMOVE BELT on the KILN's belt; the press belt is left a dead end and FIGHT is blocked
  if (r.over) throw new Error("the run ended before the dead-end check");
  await tapRegion(page, touch, "next");
  await settle(page, "build");
  await page.waitForFunction(() => window.bb.game.screen.caravan.ready, null, { timeout: 10000 });
  await tapCell(page, touch, 4, 2);
  const sel = await page.evaluate(() => window.bb.game.screen.sel);
  if (sel.kind !== "route") throw new Error(`a tap on the KILN's belt selected ${JSON.stringify(sel)}`);
  await tapRegion(page, touch, "rmroute");
  const left = await page.evaluate(() => ({ routes: window.bb.game.run.build.routes, block: window.bb.game.screen.block ?? null }));
  log(`[${at()}] DAWN · DAY ${r.day + 1}: REMOVE BELT on the KILN's belt -> routes ${JSON.stringify(left.routes)}`);
  if (left.routes.some((q) => q.join !== undefined)) throw new Error("the join outlived its main belt");
  await tapRegion(page, touch, "fight");
  const blocked = await page.evaluate(() => ({ screen: window.bb.screen(), block: window.bb.game.screen.block ?? null, broken: window.bb.game.screen.broken }));
  log(`[${at()}] FIGHT -> ${blocked.screen === "build" ? `blocked: ${blocked.block}` : `went on to ${blocked.screen}`}; belts marked broken: ${JSON.stringify(blocked.broken)}`);
  if (blocked.screen !== "build" || blocked.block !== "BELT GOES NOWHERE") throw new Error("the dead end did not block FIGHT with BELT GOES NOWHERE");
  await shot("deadend");
  log(`[${at()}] join scenario done${shots.length ? `; shots: ${shots.join(", ")}` : ""}`);
  return { shots };
}
