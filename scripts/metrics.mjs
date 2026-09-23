// V3 metrics per view: deck-area rectangle and its share of the short viewport axis, the
// camera shake offset on a recorded hit (with Reduced Motion off and on), and the average
// frame time over 10 s of live battle in the real requestAnimationFrame loop.

import { readFileSync } from "node:fs";
import { VIEWS } from "./shots-list.mjs";

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

export async function measure(browser, origin, serve, errors) {
  const out = { version: VERSION, generated: new Date().toISOString(), target: { shortAxisShare: 0.8 }, views: {} };
  for (const [vname, vopts] of Object.entries(VIEWS)) {
    const ctx = await browser.newContext(vopts);
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
      return { scale: g.view.scale, logical: { W: g.W, H: g.H }, deckAreaCss: d.rect, shortAxisShare: +d.share.toFixed(4), longAxisShare: +d.longShare.toFixed(4) };
    }));
    v.passes = v.shortAxisShare >= 0.8;
    v.shakeOnHit = await page.evaluate(shakeOnHit, -1);
    await page.evaluate(openBattle, { rm: false });
    v.shakeOnHeavyHit = await page.evaluate(shakeOnHit, 1);
    await page.evaluate(openBattle, { rm: true });
    v.shakeOnHitReducedMotion = await page.evaluate(shakeOnHit, -1);
    await page.evaluate(openBattle, { rm: true });
    v.shakeOnHeavyHitReducedMotion = await page.evaluate(shakeOnHit, 1);
    await page.evaluate(openBattle, { rm: false });
    v.shakeOnKO = await page.evaluate(shakeOnKO);
    await page.evaluate(openBattle, { rm: true });
    v.shakeOnKOReducedMotion = await page.evaluate(shakeOnKO);
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
    out.views[vname] = v;
    console.log(`metrics ${vname}: share ${v.shortAxisShare} shake ${v.shakeOnHit.peakLogicalPx}/${v.shakeOnHeavyHit.peakLogicalPx} rm ${v.shakeOnHitReducedMotion.peakLogicalPx}/${v.shakeOnHeavyHitReducedMotion.peakLogicalPx} ko ${v.shakeOnKO.peakLogicalPx} (rm ${v.shakeOnKOReducedMotion.peakLogicalPx}) work ${v.frameTime.workMs.toFixed(2)}ms`);
    await ctx.close();
  }
  return out;
}
