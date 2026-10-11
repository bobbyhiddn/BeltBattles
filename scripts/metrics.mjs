// V3 metrics per view: deck-area rectangle and its share of the short viewport axis, the
// camera shake offset on a recorded hit (with Reduced Motion off and on), and the average
// frame time over 10 s of live battle in the real requestAnimationFrame loop.

import { readFileSync } from "node:fs";
import { VIEWS } from "./shots-list.mjs";
import { autoFight } from "./scouthook.mjs"; // SCOUT-1 (REQ-BFG-076): the FIGHT step (bb.fight(true): battles skip scouting)

const VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

function openBattle({ rm }) {
  const g = window.bb.game;
  g.run = null;
  window.bb.setReducedMotion(rm);
  window.bb.open("battle", "furnace", 12345);
  for (let i = 0; i < 60 * 3; i++) g.step(1 / 60); // wipe + intro
  return window.bb.screen();
}

// Step until an impact lands on `side` (-1 = either hull), then watch 8 frames of shake.
// Side 1 is the enemy Weaver, hit only by the player's heavy cinder shells.
function shakeOnHit(side = -1) {
  const g = window.bb.game;
  const s = g.screen;
  const a = s.arena;
  const hp0 = a.b.sides.map((x) => x.hull.hp);
  let hitAt = -1, frames = 0;
  for (let i = 0; i < 60 * 30; i++) {
    a.shakePeak = 0; // so the recorded peak starts with the frame the hit lands on
    g.step(1 / 60);
    frames++;
    if (a.b.sides.some((x, k) => (side < 0 || side === k) && x.hull.hp < hp0[k])) { hitAt = a.b.t; break; }
  }
  let maxX = Math.abs(a.fx.shakeX), maxY = Math.abs(a.fx.shakeY);
  for (let i = 0; i < 8; i++) {
    g.step(1 / 60);
    maxX = Math.max(maxX, Math.abs(a.fx.shakeX));
    maxY = Math.max(maxY, Math.abs(a.fx.shakeY));
  }
  const k = g.view.scale / g.view.dpr;
  const damage = +a.b.sides.reduce((m, x, i) => Math.max(m, hp0[i] - x.hull.hp), 0).toFixed(1);
  return { hitAtSimSeconds: hitAt, framesToHit: frames, damage, peakLogicalPx: a.shakePeak, maxX, maxY, peakCssPx: a.shakePeak * k, trauma: a.fx.trauma };
}

// Step to the KO (the peak includes the KO frame itself), then watch 30 frames of shake.
function shakeOnKO() {
  const g = window.bb.game;
  const a = g.screen.arena;
  for (let i = 0; i < 60 * 150 && !a.b.over; i++) {
    a.shakePeak = 0;
    g.step(1 / 60);
  }
  for (let i = 0; i < 30; i++) g.step(1 / 60);
  const k = g.view.scale / g.view.dpr;
  return { koAtSimSeconds: +a.b.t.toFixed(2), peakLogicalPx: a.shakePeak, peakCssPx: a.shakePeak * k };
}

// 0.6.0c: each shake reading opens the battle, seeds its effects RNG and measures in ONE
// evaluate, so the page's live rAF loop cannot step the battle (drawing on the effects RNG)
// in between: every run of one build reads the same shake. bb.seedFx restarts only the
// cosmetic effects RNG, never the simulation's.
const FX_SEED = 1;
function shake(page, rm, fn, arg) {
  return page.evaluate(`(() => {
    if ((${openBattle})(${JSON.stringify({ rm })}) !== "battle") throw new Error("metrics: the battle did not open");
    if (!window.bb.seedFx(${FX_SEED})) throw new Error("metrics: bb.seedFx found no arena");
    return (${fn})(${arg === undefined ? "" : JSON.stringify(arg)});
  })()`);
}

// 0.5.0 targets: open floor between the bows >= 17 % of the firing axis (20 % on desk and
// phone), deck share of the short axis >= 0.60 (replaces 0.4.x's 0.80), and the 0.4.1 shake
// checks (light bolt exactly 1 px, heavy shell >= 2 px, 0 with Reduced Motion).
const GAP_TARGET = { desk: 0.2, phone: 0.2, laptop: 0.17, small: 0.17 };
const DECK_TARGET = 0.6;

function checks(vname, v) {
  const c = {
    gap: v.gap.share >= GAP_TARGET[vname],
    deckShare: v.shortAxisShare >= DECK_TARGET,
    shakeLight: v.shakeOnHit.peakLogicalPx === 1,
    shakeHeavy: v.shakeOnHeavyHit.peakLogicalPx >= 2,
    reducedMotion: v.shakeOnHitReducedMotion.peakLogicalPx === 0 && v.shakeOnHeavyHitReducedMotion.peakLogicalPx === 0 && v.shakeOnKOReducedMotion.peakLogicalPx === 0,
  };
  return { ...c, all: Object.values(c).every(Boolean) };
}

export async function measure(browser, origin, serve, errors) {
  const out = {
    version: VERSION, generated: new Date().toISOString(),
    target: { gapShare: GAP_TARGET, deckShare: DECK_TARGET, shake: { lightPx: 1, heavyMinPx: 2, reducedMotionPx: 0, fxSeed: FX_SEED } },
    views: {},
  };
  for (const [vname, vopts] of Object.entries(VIEWS)) {
    const ctx = await browser.newContext(vopts);
    await autoFight(ctx); // SCOUT-1: battles skip scouting, as before SCOUT-1
    await ctx.route(`${origin}/**`, serve);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`[metrics ${vname}] pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`[metrics ${vname}] ${m.type()}: ${m.text()}`); });
    await page.goto(`${origin}/index.html`);
    await page.waitForFunction(() => !!window.bb, null, { timeout: 10000 });
    const v = { viewport: vopts.viewport, dpr: vopts.deviceScaleFactor };
    await page.evaluate(openBattle, { rm: false });
    Object.assign(v, await page.evaluate(() => {
      const g = window.bb.game;
      const d = g.screen.deckMetrics();
      return {
        scale: g.view.scale, logical: { W: g.W, H: g.H }, deckAreaCss: d.rect,
        shortAxisShare: +d.share.toFixed(4), deckShare: +d.share.toFixed(4), longAxisShare: +d.longShare.toFixed(4), gap: d.gap,
      };
    }));
    v.shakeOnHit = await shake(page, false, shakeOnHit, -1);
    v.shakeOnHeavyHit = await shake(page, false, shakeOnHit, 1);
    v.shakeOnHitReducedMotion = await shake(page, true, shakeOnHit, -1);
    v.shakeOnHeavyHitReducedMotion = await shake(page, true, shakeOnHit, 1);
    v.shakeOnKO = await shake(page, false, shakeOnKO);
    v.shakeOnKOReducedMotion = await shake(page, true, shakeOnKO);
    // live frame timing: real rAF loop, 10 s of battle at 1x after the intro
    await page.evaluate(() => { window.bb.setReducedMotion(false); window.bb.game.run = null; window.bb.open("battle", "furnace", 777); });
    await page.waitForTimeout(3200);
    await page.evaluate(() => { window.bb.game.perfN = 0; });
    await page.waitForTimeout(10000);
    v.frameTime = await page.evaluate(() => {
      const s = window.bb.game.perfStats(600);
      const a = window.bb.game.screen.arena;
      return { ...s, fps: s.frameMs ? +(1000 / s.frameMs).toFixed(1) : 0, battleSeconds: a ? +a.b.t.toFixed(1) : null, particles: a ? a.fx.stats().parts : null };
    });
    // 0.5.0: the road-event screen's frame time (10 s, real rAF loop, animated vignette)
    await page.evaluate(() => { window.bb.openEvent("wreck", { round: 1, gold: 8 }); });
    await page.waitForTimeout(1200);
    await page.evaluate(() => { window.bb.game.perfN = 0; });
    await page.waitForTimeout(10000);
    v.eventFrameTime = await page.evaluate(() => {
      const s = window.bb.game.perfStats(600);
      return { ...s, fps: s.frameMs ? +(1000 / s.frameMs).toFixed(1) : 0, screen: window.bb.screen() };
    });
    v.checks = checks(vname, v);
    v.passes = v.checks.all;
    out.views[vname] = v;
    console.log(`metrics ${vname}: scale ${v.scale} gap ${v.gap.logical}px (${v.gap.css} css, ${v.gap.share}) deck ${v.shortAxisShare} checks ${v.passes ? "PASS" : "FAIL " + JSON.stringify(v.checks)} shake ${v.shakeOnHit.peakLogicalPx}/${v.shakeOnHeavyHit.peakLogicalPx} rm ${v.shakeOnHitReducedMotion.peakLogicalPx}/${v.shakeOnHeavyHitReducedMotion.peakLogicalPx} ko ${v.shakeOnKO.peakLogicalPx} (rm ${v.shakeOnKOReducedMotion.peakLogicalPx}) work ${v.frameTime.workMs.toFixed(2)}ms (event screen ${v.eventFrameTime.workMs.toFixed(2)}ms, ${v.eventFrameTime.fps} fps)`);
    await ctx.close();
  }
  out.allPass = Object.values(out.views).every((v) => v.passes);
  console.log(`metrics checks: ${out.allPass ? "ALL PASS" : "FAIL"}`);
  return out;
}
