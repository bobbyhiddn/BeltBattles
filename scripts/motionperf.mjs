// MOTION-1 (REQ-BFG-071) made this for the prototype; MOTION-2 for the shipping build: frame times in headless Chromium
// at phone portrait 390x844, DPR 3, with 4x CPU throttling (CDP Emulation.setCPUThrottlingRate, standing in for a
// mid-range phone) and unthrottled. Four scenes, 20 s each: a battle in motion (a STORM dusk), the same battle with
// REDUCED MOTION, the build screen (the day's sea held still under the player's ship) and the title (the attract fight
// in motion). Each run opens its scene, waits (a battle: for the fight), then samples requestAnimationFrame intervals
// with its own rAF callback, and reads the per-layer ms split the page's ?perf=1 keeps (a test build's dev knob,
// VITE_MOTION_KNOBS=1: render/motion.ts MotionPerf totals; battle and title: backdrop, hulls, boards, shots, effects;
// build screen: backdrop, hulls = the ship and plate, boards = machinery, turrets and marks, effects = the chrome and the
// rest, world = the whole draw) and the game's own CPU ms per frame (Game.perfStats, in every build).
// --base <page> also times the build screen on another page (BASE's player build: 0.9.4's floor and tracked hull), with
// no split, to compare the build screen's cost. Headless has no GPU: the canvas is rasterised in software, so these are
// CPU-side numbers, not a phone's.
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node scripts/motionperf.mjs <test page.html> <out.json> [--secs 20] [--base <page>]
//          [--hero H --day D --seed N (the battle)]
import { chromium } from "playwright-core";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadavg } from "node:os";

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const pos = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--")));
const PAGE = resolve(pos[0] ?? "dist-knobs/index.html");
const OUT = resolve(pos[1] ?? "motionperf.json");
const SECS = Number(opt("secs", "20"));
const BASE = opt("base", "");
// the battle (scripts/motionpick.mjs finds a STORM fight that lasts the 20 s)
const HERO = opt("hero", "bastion"), DAY = Number(opt("day", "4")), SEED = Number(opt("seed", "11"));

const SCENES = [["battle", false], ["battle-reduced", true], ["build", false], ["title", false]];
const pct = (a, p) => a[Math.min(a.length - 1, Math.max(0, Math.ceil(p * a.length) - 1))];

async function one(browser, page0, scene, reduced, rate, query) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  await page.goto(pathToFileURL(page0).href + query);
  await page.waitForFunction(() => !!window.bb && window.bb.screen() === "title");
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  await page.evaluate(([scene, r, hero, day, seed]) => {
    const bb = window.bb;
    if (r) bb.setReducedMotion(true);
    if (scene.startsWith("battle")) bb.openDusk({ hero, day, seed }, []);
    else if (scene === "build") bb.openDawn({ hero: "furnace", day: 5, seed: 7 }, []);
    else bb.open("title");
  }, [scene, reduced, HERO, DAY, SEED]);
  if (scene.startsWith("battle")) await page.waitForFunction(() => window.bb.motion().phase === "fight", null, { timeout: 60000, polling: 100 });
  else await page.waitForTimeout(1500); // the wipe, the caches
  const load0 = loadavg()[0];
  const res = await page.evaluate(async (secs) => {
    const bb = window.bb;
    const tot = () => { const m = bb.motion(); return m.perfTotals ?? null; }; // CUSTOM-2a: no ?motion=0 split any more
    const a = tot();
    const gaps = [];
    let last = performance.now(), stop = false;
    const tick = (now) => { gaps.push(now - last); last = now; if (!stop) requestAnimationFrame(tick); };
    requestAnimationFrame((now) => { last = now; requestAnimationFrame(tick); });
    await new Promise((r) => setTimeout(r, secs * 1000));
    stop = true;
    const b = tot();
    // the title starts a new attract round (and a new split) now and then: then the split covers the frames since
    const reset = !!(a && b && b.frames < a.frames);
    const frames = b ? (a && !reset ? b.frames - a.frames : b.frames) : 0;
    const split = {};
    if (b) for (const k of Object.keys(b.ms)) split[k] = frames ? (b.ms[k] - (a && !reset ? a.ms[k] : 0)) / frames : 0;
    const m = bb.motion();
    return { gaps, frames, split, reset, work: bb.game.perfStats(Math.min(600, gaps.length)), screen: bb.screen(), phase: m.phase, over: !!m.over, sea: m.sea ?? null, reduced: bb.settings.reducedMotion };
  }, SECS);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await ctx.close();
  const g = res.gaps.slice(1).sort((x, y) => x - y);
  const over = (ms) => (100 * g.filter((x) => x > ms).length) / g.length;
  return {
    scene, page: page0, rate, query, reduced: res.reduced, sea: res.sea, frames: g.length, fps: +(1000 / (g.reduce((s, x) => s + x, 0) / g.length)).toFixed(1),
    p50: +pct(g, 0.5).toFixed(2), p95: +pct(g, 0.95).toFixed(2), p99: +pct(g, 0.99).toFixed(2), max: +g[g.length - 1].toFixed(2),
    // the brief's two thresholds; a 60 Hz interval reads 16.6-16.8 ms in headless, so > 20 ms says a frame really slipped
    over16: +over(16.7).toFixed(2), over20: +over(20).toFixed(2), over33: +over(33.4).toFixed(2),
    split: Object.fromEntries(Object.entries(res.split).map(([k, v]) => [k, +v.toFixed(3)])), splitFrames: res.frames, splitReset: res.reset,
    workMs: +res.work.workMs.toFixed(3), maxWorkMs: +res.work.maxWorkMs.toFixed(2), endScreen: res.screen, endPhase: res.phase, over: res.over,
    load: +load0.toFixed(2), errors,
  };
}

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
const rows = [];
console.log(`motionperf on ${PAGE}${BASE ? ` (and the build screen on ${BASE})` : ""}, ${SECS} s per run, battle ${HERO} dusk day ${DAY} seed ${SEED}, ${new Date().toISOString()}, load ${loadavg()[0].toFixed(2)}`);
const say = (r) => console.log(`${r.scene.padEnd(14)} ${r.page === PAGE ? "" : "BASE "}cpu x${r.rate}: ${r.frames} frames (${r.fps} fps) p50 ${r.p50} p95 ${r.p95} p99 ${r.p99} max ${r.max} ms; >16.7 ${r.over16}% >20 ${r.over20}% >33.4 ${r.over33}%; split ${JSON.stringify(r.split)} over ${r.splitFrames} frames${r.splitReset ? " (a new attract round mid-run: split since)" : ""}; game work ${r.workMs} ms/frame (max ${r.maxWorkMs}); end ${r.endScreen}/${r.endPhase}; sea ${r.sea}; load ${r.load}; errors ${r.errors.length}`);
for (const rate of [4, 1]) {
  for (const [scene, reduced] of SCENES) {
    const r = await one(browser, PAGE, scene, reduced, rate, "?perf=1");
    rows.push(r);
    say(r);
  }
  if (BASE) {
    const r = await one(browser, resolve(BASE), "build", false, rate, "");
    rows.push(r);
    say(r);
  }
}
await browser.close();
await writeFile(OUT, JSON.stringify({ page: PAGE, base: BASE || null, secs: SECS, battle: { hero: HERO, day: DAY, seed: SEED }, date: new Date().toISOString(), rows }, null, 1) + "\n");
