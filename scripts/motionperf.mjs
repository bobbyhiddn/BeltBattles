// MOTION-1 (REQ-BFG-071): frame times of the battles-in-motion prototype, in headless Chromium at phone portrait 390x844,
// DPR 3, on a VITE_MOTION=1 page (the offline single-file page). Three modes: motion off (?motion=0: the motion-base
// look), motion on, and reduce motion; each with 4x CPU throttling (CDP Emulation.setCPUThrottlingRate, standing in for a
// mid-range phone) and unthrottled. Each run opens the same dusk battle (day 5, STORM), waits for the fight, then samples
// requestAnimationFrame intervals for 20 s with its own rAF callback, and reads the per-layer ms split the page's ?perf=1
// keeps (render/motion.ts MotionPerf totals: backdrop, hulls, boards, shots, effects; with motion off, the floor and the
// whole of drawArena) and the game's own CPU ms per frame (Game.perfStats). Headless has no GPU: the canvas is rasterised
// in software, so these are CPU-side numbers, not a phone's.
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node scripts/motionperf.mjs <page.html> <out.json> [--secs 20]
import { chromium } from "playwright-core";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadavg } from "node:os";

const argv = process.argv.slice(2);
const PAGE = resolve(argv[0] ?? "dist-motion/index.html");
const OUT = resolve(argv[1] ?? "motionperf.json");
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const SECS = Number(opt("secs", "20"));
// the battle (scripts/motionpick.mjs finds a STORM fight that lasts the 20 s)
const HERO = opt("hero", "furnace"), DAY = Number(opt("day", "5")), SEED = Number(opt("seed", "7"));

const MODES = [["off", "?motion=0&perf=1", false], ["on", "?perf=1", false], ["reduced", "?perf=1", true]];
const pct = (a, p) => a[Math.min(a.length - 1, Math.max(0, Math.ceil(p * a.length) - 1))];

async function one(browser, mode, query, reduced, rate) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  await page.goto(pathToFileURL(PAGE).href + query);
  await page.waitForFunction(() => !!window.bb && window.bb.screen() === "title");
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  await page.evaluate(([r, hero, day, seed]) => { if (r) window.bb.setReducedMotion(true); window.bb.openDusk({ hero, day, seed }, []); }, [reduced, HERO, DAY, SEED]);
  await page.waitForFunction(() => window.bb.motion().phase === "fight", null, { timeout: 60000, polling: 100 });
  const load0 = loadavg()[0];
  const res = await page.evaluate(async (secs) => {
    const bb = window.bb;
    const tot = () => { const m = bb.motion(); return m.perfTotals ?? m.offPerf; };
    const a = tot();
    const gaps = [];
    let last = performance.now(), stop = false;
    const tick = (now) => { gaps.push(now - last); last = now; if (!stop) requestAnimationFrame(tick); };
    requestAnimationFrame((now) => { last = now; requestAnimationFrame(tick); });
    await new Promise((r) => setTimeout(r, secs * 1000));
    stop = true;
    const b = tot();
    const frames = b.frames - a.frames;
    const split = {};
    for (const k of Object.keys(b.ms)) split[k] = frames ? (b.ms[k] - a.ms[k]) / frames : 0;
    const m = bb.motion();
    return { gaps, frames, split, work: bb.game.perfStats(Math.min(600, frames)), phase: m.phase, over: !!m.over, sea: m.sea ?? null, reduced: bb.settings.reducedMotion };
  }, SECS);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await ctx.close();
  const g = res.gaps.slice(1).sort((x, y) => x - y);
  const over = (ms) => (100 * g.filter((x) => x > ms).length) / g.length;
  return {
    mode, rate, query, reduced: res.reduced, sea: res.sea, frames: g.length, fps: +(1000 / (g.reduce((s, x) => s + x, 0) / g.length)).toFixed(1),
    p50: +pct(g, 0.5).toFixed(2), p95: +pct(g, 0.95).toFixed(2), p99: +pct(g, 0.99).toFixed(2), max: +g[g.length - 1].toFixed(2),
    // the brief's two thresholds; a 60 Hz interval reads 16.6-16.8 ms in headless, so > 20 ms says a frame really slipped
    over16: +over(16.7).toFixed(2), over20: +over(20).toFixed(2), over33: +over(33.4).toFixed(2),
    split: Object.fromEntries(Object.entries(res.split).map(([k, v]) => [k, +v.toFixed(3)])), splitFrames: res.frames,
    workMs: +res.work.workMs.toFixed(3), maxWorkMs: +res.work.maxWorkMs.toFixed(2), endPhase: res.phase, over: res.over,
    load: +load0.toFixed(2), errors,
  };
}

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
const rows = [];
console.log(`motionperf on ${PAGE}, ${SECS} s per run, battle ${HERO} dusk day ${DAY} seed ${SEED}, ${new Date().toISOString()}, load ${loadavg()[0].toFixed(2)}`);
for (const rate of [4, 1]) for (const [mode, query, reduced] of MODES) {
  const r = await one(browser, mode, query, reduced, rate);
  rows.push(r);
  console.log(`${mode.padEnd(8)} cpu x${rate}: ${r.frames} frames (${r.fps} fps) p50 ${r.p50} p95 ${r.p95} p99 ${r.p99} max ${r.max} ms; >16.7 ${r.over16}% >20 ${r.over20}% >33.4 ${r.over33}%; split ${JSON.stringify(r.split)} over ${r.splitFrames} frames; game work ${r.workMs} ms/frame (max ${r.maxWorkMs}); end ${r.endPhase}; load ${r.load}; errors ${r.errors.length}`);
}
await browser.close();
await writeFile(OUT, JSON.stringify({ page: PAGE, secs: SECS, battle: { hero: HERO, day: DAY, seed: SEED }, date: new Date().toISOString(), rows }, null, 1) + "\n");
