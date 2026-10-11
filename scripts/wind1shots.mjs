// WIND-1 (REQ-BFG-093; REQ-BFG-097 display half): tooling only. The dark wind's numbers on both carriers, measured and
// photographed from the offline single-file page in headless Chromium. The page's requestAnimationFrame never fires: the
// script steps the game itself (bb.game.step(1/60), as scripts/motionshots.mjs does) with Math.random pinned, so a still
// repeats exactly.
//  probe: per view and camera, a seeded dusk (bb.openDusk) played at 1X to its wind ticks; at each named tick, 6 frames
//         (0.1 s) after it, for each side: whether its wind number is in the pool, where it is drawn (the pixels the number
//         alone changes: the frame drawn with it against the frame drawn without it), the colour seen there against the
//         colour drawn (the frame drawn again with the wind's level at 0), and its contrast against what is behind it
//         (WCAG ratio) and against its own outline; whether it sits under a plate, the bar, or in the wind's band; the
//         pool's size before the tick. A still of the whole page at the shot tick.
//  extra: the after page's own checks (bb.windInfo, tooling): both bars' wind flash (their pixels), the hull numbers drawn
//         on the plates, the DARK WIND callout; BLOCKED pops (plating, SHIELD) and VIEW BATTLEFIELD stills.
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node scripts/wind1shots.mjs <page.html> <outDir> <tag> [--views p390,p402,l844,d1920]
//          [--cams wide,close] [--ticks 1,3,6] [--shot 3] [--reduced p390,d1920] [--fight furnace,1,12345] [--wind #hex]
//          [--extra 1]
import { chromium } from "playwright-core";
import { mkdir, writeFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const pos = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--")));
const PAGE = resolve(pos[0] ?? "dist/index.html");
const OUT = resolve(pos[1] ?? "shots/wind1");
const TAG = pos[2] ?? "after";
const VIEWS = opt("views", "p390,p402,l844,d1920").split(",").filter(Boolean);
const CAMS = opt("cams", "wide,close").split(",").filter(Boolean);
const TICKS = opt("ticks", "1,3,6").split(",").map(Number);
const SHOT = Number(opt("shot", "3"));
const REDUCED = opt("reduced", "").split(",").filter(Boolean);
const [FH, FD, FS] = opt("fight", "furnace,1,12345").split(",");
const FIGHT = { hero: FH, day: Number(FD), seed: Number(FS) };
const WIND = opt("wind", ""); // the wind number's colour; default: the page's (bb.windInfo) or 0.9.8's C.plum4
const EXTRA = opt("extra", "0") === "1";
const lines = [];
const log = (s) => { lines.push(s); console.log(s); };
const results = [];

const V = {
  p390: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  p402: { viewport: { width: 402, height: 690 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  l844: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  d1920: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
};

/** Freeze the page's own loop and pin Math.random: the script steps the game, so the pixels repeat. */
const FREEZE = () => {
  window.requestAnimationFrame = () => 0;
  let s = 0x2f6b9a1d;
  Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
};

/** In the page: open the fight (or another scene) and set the camera and Reduce Motion. */
function openScene({ fight, cam, reduced, scene }) {
  const bb = window.bb, g = bb.game;
  bb.setReducedMotion(!!reduced);
  if (scene === "shield") {
    // a fight with SHIELD: the set-up run holds WARD STONE (START: +3 SHIELD), against the classic foe (bb.open)
    bb.setupRun(fight);
    bb.holdRunes(["ward_stone"]);
    bb.open("battle");
  } else bb.openDusk(fight, []);
  for (let i = 0; i < 40; i++) g.step(1 / 60);
  if (cam === "close") bb.camera("close", 0);
  g.render();
  return { screen: bb.screen(true), W: g.W, H: g.H, scale: g.view.scale, dpr: g.view.dpr, sub: g.view.sub ?? 1 };
}

/** In the page: step to the wind tick number `tick` (1 = the first, at 25 s), then `after` frames more; measure each side's
 *  wind number(s) spawned at that tick. */
function stepAndMeasure({ tick, after, wind, measure }) {
  const bb = window.bb, g = bb.game, s = g.screen, a = s.arena, b = a.b, m = s.motion, fx = a.fx;
  const info = typeof bb.windInfo === "function" ? bb.windInfo() : null;
  const WINDC = (wind || (info && info.colour) || "#8A5CB0").toUpperCase();
  const isWind = (p) => (p.color || "").toUpperCase() === WINDC;
  let seenTicks = b._w1ticks || 0;
  // step frame by frame; count wind ticks by windTaken's growth
  let guard = 0, poolBefore = -1, spawnedAt = -1;
  const fresh = [];
  while (guard++ < 60 * 90 && !b.over) {
    const w0 = b.sides[0].stats.windTaken, np0 = fx.np;
    const live = new Set();
    for (let i = 0; i < fx.np; i++) live.add(fx.pops[i]);
    g.step(1 / 60);
    if (b.sides[0].stats.windTaken > w0) {
      b._w1ticks = (b._w1ticks || 0) + 1;
      seenTicks = b._w1ticks;
      if (seenTicks === tick) {
        poolBefore = np0;
        spawnedAt = b.t;
        for (let i = 0; i < fx.np; i++) if (!live.has(fx.pops[i]) && isWind(fx.pops[i])) fresh.push(fx.pops[i]);
        break;
      }
    }
  }
  if (spawnedAt < 0) return { tick, missed: true, t: b.t, over: b.over };
  const dmg = b.sides[0].stats.windTaken; // running total (both sides equal)
  const counts = [0, 0];
  for (const p of fresh) counts[p.side]++;
  for (let i = 0; i < after; i++) g.step(1 / 60);
  const cv = g.canvas, cx = cv.getContext("2d", { willReadFrequently: true });
  const kx = cv.width / g.W, ky = cv.height / g.H; // canvas px per logical px
  const rectCss = cv.getBoundingClientRect(), css = rectCss.width / cv.width; // CSS px per canvas px
  const out = { tick, t: +spawnedAt.toFixed(3), tNow: +b.t.toFixed(3), poolBefore, poolSize: fx.pops.length, spawned: counts, windTaken: [b.sides[0].stats.windTaken, b.sides[1].stats.windTaken], hp: [b.sides[0].hull.hp, b.sides[1].hull.hp], max: [b.sides[0].hull.max, b.sides[1].hull.max], level: +b.windLevel().toFixed(3), cam: m.camera ? m.camera.shot : null, zoom: m.camera ? +m.camera.zoom.toFixed(3) : null, nums: [] };
  void dmg;
  if (!measure) { g.render(); return out; }
  const grab = () => { g.render(); return cx.getImageData(0, 0, cv.width, cv.height).data; };
  const lum = (r, gg, bl) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(bl); };
  const cr = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  const hex = (c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
  const plates = (s.plateR || s.L.plates).map((r) => ({ x: r.x * kx, y: r.y * ky, w: r.w * kx, h: r.h * ky }));
  const bar = s.L.bar ? { x: s.L.bar.x * kx, y: s.L.bar.y * ky, w: s.L.bar.w * kx, h: s.L.bar.h * ky } : null;
  const inR = (x, y, r) => r && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  const level = b.windLevel() * Math.max(0, 1 - a.overT / 1.2);
  const all = [];
  for (let i = 0; i < fx.np; i++) all.push(fx.pops[i]);
  const texts = all.map((p) => p.text);
  for (const p of fresh) {
    if (!all.includes(p)) { out.nums.push({ side: p.side, text: p.text, gone: true }); continue; }
    // the frame with this number alone (A), without it (B), and with it alone but no wind (C)
    for (const q of all) q.text = q === p ? texts[all.indexOf(q)] : "";
    const A = grab();
    b.windLevel = () => 0; // an own property over the class's method, for one frame
    const Cw = grab();
    delete b.windLevel;
    p.text = "";
    const B = grab();
    all.forEach((q, i) => { q.text = texts[i]; });
    const pc = [parseInt(WINDC.slice(1, 3), 16), parseInt(WINDC.slice(3, 5), 16), parseInt(WINDC.slice(5, 7), 16)];
    let n = 0, nb = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    const body = [0, 0, 0], bodyBg = [0, 0, 0], outl = [0, 0, 0];
    let no = 0, underPlate = 0, inBar = 0;
    for (let k = 0; k < A.length; k += 4) {
      if (A[k] === B[k] && A[k + 1] === B[k + 1] && A[k + 2] === B[k + 2]) continue;
      n++;
      const px = (k / 4) % cv.width, py = Math.floor(k / 4 / cv.width);
      if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
      const isBody = Math.abs(Cw[k] - pc[0]) <= 10 && Math.abs(Cw[k + 1] - pc[1]) <= 10 && Math.abs(Cw[k + 2] - pc[2]) <= 10;
      if (isBody) { nb++; body[0] += A[k]; body[1] += A[k + 1]; body[2] += A[k + 2]; bodyBg[0] += B[k]; bodyBg[1] += B[k + 1]; bodyBg[2] += B[k + 2]; }
      else { no++; outl[0] += A[k]; outl[1] += A[k + 1]; outl[2] += A[k + 2]; }
    }
    // where the number would be drawn, from its board's map and the camera (the expected spot, also when nothing shows)
    const kk = p.t / p.max, rise = (p.big ? 16 : 11) * Math.min(1, kk * 2.2);
    let ex = null;
    if (m && m.aff && m.cam && p.side >= 0) {
      const Af = m.aff[p.side], X = Af.a * p.x + Af.c * (p.y - rise) + Af.e, Y = Af.b * p.x + Af.d * (p.y - rise) + Af.f;
      const lf = m.lf || 1, c = m.cam;
      ex = { x: (c.a * X + c.c * Y + c.e) * lf, y: (c.b * X + c.d * Y + c.f + 3.5 * c.d) * lf };
    }
    const cxp = n ? (x0 + x1) / 2 : ex ? ex.x : -1, cyp = n ? (y0 + y1) / 2 : ex ? ex.y : -1;
    underPlate = plates.findIndex((r) => inR(ex ? ex.x : cxp, ex ? ex.y : cyp, r));
    inBar = inR(ex ? ex.x : cxp, ex ? ex.y : cyp, bar) ? 1 : 0;
    const bandFront = level * g.W * 0.42 * kx; // the band's front at this row (no wobble), canvas px
    const mb = nb ? body.map((v) => v / nb) : null, mbg = nb ? bodyBg.map((v) => v / nb) : null, mo = no ? outl.map((v) => v / no) : null;
    const lb = mb ? lum(...mb) : 0, lbg = mbg ? lum(...mbg) : 0, lo = mo ? lum(...mo) : 0, lp = lum(...pc);
    out.nums.push({
      side: p.side, text: texts[all.indexOf(p)], t: +p.t.toFixed(3), px: n, bodyPx: nb,
      at: { x: +(cxp * css).toFixed(1), y: +(cyp * css).toFixed(1) }, expected: ex ? { x: +(ex.x * css).toFixed(1), y: +(ex.y * css).toFixed(1) } : null,
      onScreen: (ex ? ex.x : cxp) >= 0 && (ex ? ex.x : cxp) < cv.width && (ex ? ex.y : cyp) >= 0 && (ex ? ex.y : cyp) < cv.height,
      hCss: n ? +((y1 - y0 + 1) * css).toFixed(1) : 0, underPlate, inBar: !!inBar, inBand: (ex ? ex.x : cxp) < bandFront + 10 * kx,
      drawn: WINDC, seen: mb ? hex(mb) : null, behind: mbg ? hex(mbg) : null, outline: mo ? hex(mo) : null,
      dim: mb ? +(lb / lp).toFixed(3) : 0, crBehind: mb ? +cr(lb, lbg).toFixed(2) : 0, crOutline: mb && mo ? +cr(lb, lo).toFixed(2) : 0,
      crDrawn: mbg ? +cr(lp, lbg).toFixed(2) : 0,
    });
  }
  g.render();
  return out;
}

/** In the page (after build): the tooling read of the plates, the bars' flash and the callout; null on the old page. */
function hudInfo() {
  const bb = window.bb;
  return typeof bb.windInfo === "function" ? bb.windInfo() : null;
}

async function runView(browser, vname, cam, reduced) {
  const ctx = await browser.newContext(V[vname]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.addInitScript(FREEZE);
  await page.goto(pathToFileURL(PAGE).href);
  await page.waitForFunction(() => !!window.bb && !!window.bb.game);
  const t0 = Date.now();
  const o = await page.evaluate(openScene, { fight: FIGHT, cam, reduced });
  const name = `${TAG}-${vname}-${cam}${reduced ? "-reduced" : ""}`;
  log(`${name}: ${o.screen}, logical ${o.W}x${o.H} at scale ${o.scale} (DPR ${o.dpr}, sub ${o.sub}); fight ${FIGHT.hero} day ${FIGHT.day} seed ${FIGHT.seed}`);
  for (const tick of TICKS) {
    const r = await page.evaluate(stepAndMeasure, { tick, after: 6, wind: WIND, measure: true });
    r.view = vname; r.camName = cam; r.reduced = !!reduced; r.tag = TAG;
    results.push(r);
    if (r.missed) { log(`  tick ${tick}: missed (fight over at ${r.t} s)`); continue; }
    log(`  tick ${tick} at ${r.t} s (level ${r.level}, ${r.cam} zoom ${r.zoom}): pool ${r.poolBefore}/${r.poolSize} before; spawned you ${r.spawned[0]} foe ${r.spawned[1]}; hull ${r.hp[0]}/${r.max[0]} v ${r.hp[1]}/${r.max[1]}; windTaken ${r.windTaken.join("/")}`);
    for (const n of r.nums) {
      if (n.gone) { log(`    side ${n.side} "${n.text}": gone before the measure`); continue; }
      log(`    side ${n.side} "${n.text}": ${n.px} px (${n.bodyPx} body) at CSS (${n.at.x}, ${n.at.y}) [expected ${n.expected ? `${n.expected.x}, ${n.expected.y}` : "-"}], ${n.hCss} CSS px tall; on screen ${n.onScreen}; under plate ${n.underPlate}; in bar ${n.inBar}; in band ${n.inBand}; drawn ${n.drawn} seen ${n.seen} behind ${n.behind} outline ${n.outline}; dim ${n.dim}; contrast to behind ${n.crBehind} (drawn colour ${n.crDrawn}), to outline ${n.crOutline}`);
    }
    if (tick === SHOT) {
      const hi = await page.evaluate(hudInfo);
      if (hi) { r.hud = hi; log(`    hud: ${JSON.stringify(hi)}`); }
      const file = join(OUT, "stills", `${name}-tick${tick}.png`);
      await page.screenshot({ path: file });
      log(`    still ${file} (${(await stat(file)).size} B)`);
    }
  }
  log(`  ${name}: ${((Date.now() - t0) / 1000).toFixed(1)} s; console errors ${errors.length}${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`);
  await ctx.close();
  return errors.length;
}

await mkdir(join(OUT, "stills"), { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
let bad = 0;
log(`wind1shots ${TAG} on ${PAGE}, ${new Date().toISOString()}; views ${VIEWS.join(",")}; cams ${CAMS.join(",")}; ticks ${TICKS.join(",")}; shot tick ${SHOT}; reduced ${REDUCED.join(",") || "-"}`);
for (const v of VIEWS) for (const c of CAMS) bad += await runView(browser, v, c, false);
for (const v of REDUCED) bad += await runView(browser, v, "wide", true);
await browser.close();
await writeFile(join(OUT, `wind1shots-${TAG}.log`), lines.join("\n") + "\n");
await writeFile(join(OUT, `wind1shots-${TAG}.json`), JSON.stringify(results, null, 1) + "\n");
process.exit(bad ? 1 : 0);
