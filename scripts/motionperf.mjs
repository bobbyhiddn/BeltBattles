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
// CUSTOM-3 (REQ-BFG-074): --carrier <id> writes a player profile before each page loads (every style open, wearing that
// carrier style and the default floor, belts and panels), so the player's carrier is styled in every scene; --seas
// calm,storm,ember runs the battle once per sea (the test build's ?sea= knob) in place of the one STORM battle.
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node scripts/motionperf.mjs <test page.html> <out.json> [--secs 20] [--base <page>]
//          [--hero H --day D --seed N (the battle)] [--carrier <id>] [--seas calm,storm,ember]
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

const CARRIER = opt("carrier", "");
const SEAS = opt("seas", "") ? opt("seas", "").split(",") : [];
/** [scene, reduced, sea knob]: one STORM battle (the day's sea), or one battle per sea with --seas. */
const ALL = [...(SEAS.length ? SEAS.map((sea) => [`battle-${sea}`, false, sea]) : [["battle", false, ""]]), ["battle-reduced", true, ""], ["build", false, ""], ["title", false, ""]];
// SCOUT-1 (REQ-BFG-076): --scenes picks scenes by name, and adds one at CLOSE: "view" (VIEW BATTLEFIELD after the fight,
// at CLOSE, the carriers sailing steady); --vw/--vh the viewport (default the 390x844 phone, DPR 3), so the CLOSE timings
// also run on the 430x932 phone (CLOSE x7: the battle's canvas at device resolution, FIELD-1 known gap 3). SCOUT-1b
// (REQ-BFG-082): no "scout" scene (no battle scouts; the fight runs at WIDE from its sail-in, the "battle" scenes)
const PICK = opt("scenes", "") ? opt("scenes", "").split(",") : null;
const SCENES = PICK ? PICK.map((n) => ALL.find(([s]) => s === n) ?? [n, false, ""]) : ALL;
const VW = Number(opt("vw", "390")), VH = Number(opt("vh", "844"));
// PERF-1 (REQ-BFG-080, BRIEF-PERF1 2.1): --dpr (default 3) and --desk (no touch, not mobile: a desk browser, e.g.
// --vw 1920 --vh 1080 --dpr 1 --desk); and one more scene, "build-drag" (--scenes build-drag): the build screen while
// something changes every frame, a scripted drag of the first affordable gate card (BuildScreen.dragPlan) back and forth
// between its card and its suggested cell, held for the whole run (never dropped), one move a frame through the game's
// own input (bb.game.pointerMove); with --base it is timed on the base page too ("build-drag" BASE). Each row also
// reads the build screen's draw split where the page has one (game/retain.ts stats: frames drawn whole, in boxes, not
// drawn; absent before PERF-1).
const DPR = Number(opt("dpr", "3")), DESK = argv.includes("--desk");
/** CUSTOM-3: every style open and seen, the player wearing carrier `c`. */
const carrierProfile = (c) => {
  const ids = { floor: ["timber", "tread", "checker", "rune"], belt: ["verdigris", "blued", "timber", "rune"], panel: ["brass", "verdigris", "timber", "plum"], carrier: ["admiral", "ironclad", "storm", "gold"] };
  const unlocked = Object.entries(ids).flatMap(([k, v]) => v.map((id) => `style:${k}.${id}`));
  return { v: 1, counters: { runs: 99, runsFinished: 9, flawless: 1, duskWins: 120, bestDay: 10, warlordWins: 9, matriarchWins: 9, mostBelts: 9 }, heroesWon: ["furnace", "weaver", "foundry", "bastion"], heroesFinished: ["furnace"], unlocked, chosen: { floor: "plate", belt: "iron", panel: "slate", carrier: c }, seen: unlocked, folded: [], runNew: null, updatedAt: 1 };
};
const pct = (a, p) => a[Math.min(a.length - 1, Math.max(0, Math.ceil(p * a.length) - 1))];

async function one(browser, page0, scene, reduced, rate, query) {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR, isMobile: !DESK, hasTouch: !DESK });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  if (CARRIER) await page.addInitScript((prof) => localStorage.setItem("beltbattles.profile.v1", prof), JSON.stringify(carrierProfile(CARRIER)));
  await page.goto(pathToFileURL(page0).href + query);
  await page.waitForFunction(() => !!window.bb && window.bb.screen() === "title");
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  await page.evaluate(([scene, r, hero, day, seed]) => {
    const bb = window.bb;
    if (r) bb.setReducedMotion(true);
    // SCOUT-1 (REQ-BFG-076): a fight's timing runs with the harness's FIGHT step (bb.fight(true): on a SCOUT-1 page no
    // scouting; SCOUT-1b: none to skip); "view" fights, then opens VIEW BATTLEFIELD (below)
    bb.fight?.(true);
    if (scene.startsWith("battle") || scene === "view") bb.openDusk({ hero, day, seed }, []);
    else if (scene === "build" || scene === "build-drag") bb.openDawn({ hero: "furnace", day: 5, seed: 7 }, []);
    else bb.open("title");
  }, [scene, reduced, HERO, DAY, SEED]);
  const atRest = (ph) => page.waitForFunction((p) => { const s = window.bb.scout(); return !!s && s.phase === p && !!s.camera && !s.camera.moving; }, ph, { timeout: 60000, polling: 100 });
  if (scene.startsWith("battle")) await page.waitForFunction(() => window.bb.motion().phase === "fight", null, { timeout: 60000, polling: 100 });
  else if (scene === "view") {
    await page.waitForFunction(() => window.bb.motion().phase === "fight", null, { timeout: 60000, polling: 100 });
    await page.evaluate(() => window.bb.game.screen.skip());
    await page.waitForFunction(() => window.bb.screen(true) === "result" && window.bb.scout().canView, null, { timeout: 60000, polling: 100 });
    await page.evaluate(() => window.bb.viewBattlefield(true));
    await atRest("view");
  } else await page.waitForTimeout(1500); // the wipe, the caches
  const load0 = loadavg()[0];
  const res = await page.evaluate(async ([secs, scene, DESK_RUN]) => {
    const bb = window.bb;
    const tot = () => { const m = bb.motion(); return m.perfTotals ?? null; }; // CUSTOM-2a: no ?motion=0 split any more
    const a = tot();
    // PERF-1: the moving scene's drag (held the whole run) and the build screen's draw split at the start
    const game = bb.game, plan = scene === "build-drag" && game.screen.dragPlan ? game.screen.dragPlan() : null;
    if (plan) game.pointerDown(plan.from.x, plan.from.y, 0, DESK_RUN ? "mouse" : "touch");
    const r0 = game.retained ? { ...game.retained.stats } : null;
    const gaps = [];
    let last = performance.now(), stop = false, k = 0;
    const tick = (now) => {
      gaps.push(now - last); last = now;
      if (plan) { k++; const f = (Math.sin(k / 20) + 1) / 2; game.pointerMove(plan.from.x + (plan.to.x - plan.from.x) * f, plan.from.y + (plan.to.y - plan.from.y) * f, true); }
      if (!stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame((now) => { last = now; requestAnimationFrame(tick); });
    await new Promise((r) => setTimeout(r, secs * 1000));
    stop = true;
    if (plan) game.pointerCancel();
    const r1 = game.retained ? game.retained.stats : null;
    const drawn = r0 && r1 ? { whole: r1.whole - r0.whole, part: r1.part - r0.part, still: r1.still - r0.still, direct: r1.direct - r0.direct } : null;
    const b = tot();
    // the title starts a new attract round (and a new split) now and then: then the split covers the frames since
    const reset = !!(a && b && b.frames < a.frames);
    const frames = b ? (a && !reset ? b.frames - a.frames : b.frames) : 0;
    const split = {};
    if (b) for (const k of Object.keys(b.ms)) split[k] = frames ? (b.ms[k] - (a && !reset ? a.ms[k] : 0)) / frames : 0;
    const m = bb.motion();
    // REVIEW-STAGE098 R2: bb.profile only where the page has it (a --base run against a page from before CUSTOM-2a);
    // SCOUT-1: the camera's shot at the end (CLOSE in scouting and the view)
    return {
      gaps, frames, split, reset, work: bb.game.perfStats(Math.min(600, gaps.length)), screen: bb.screen(), phase: m.phase, over: !!m.over, sea: m.sea ?? null,
      reduced: bb.settings.reducedMotion, wears: bb.profile ? bb.profile().wears.carrier : null, shot: m.camera ? m.camera.shot : null,
      drawn, dragged: !!plan,
    };
  }, [SECS, scene, DESK]);
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
    workMs: +res.work.workMs.toFixed(3), maxWorkMs: +res.work.maxWorkMs.toFixed(2), endScreen: res.screen, endPhase: res.phase, over: res.over, carrier: res.wears, shot: res.shot, view: `${VW}x${VH}`,
    load: +load0.toFixed(2), errors, drawn: res.drawn, dragged: res.dragged, dpr: DPR, desk: DESK,
  };
}

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
const rows = [];
console.log(`motionperf on ${PAGE}${BASE ? ` (and the build screen on ${BASE})` : ""}, ${SECS} s per run, battle ${HERO} dusk day ${DAY} seed ${SEED}${SEAS.length ? ` in the seas ${SEAS.join(", ")}` : ""}, the player's carrier ${CARRIER || "as stored (none: the default)"}, ${new Date().toISOString()}, load ${loadavg()[0].toFixed(2)}`);
const say = (r) => console.log(`${r.scene.padEnd(14)} ${r.page === PAGE ? "" : "BASE "}${r.view} cpu x${r.rate}: ${r.frames} frames (${r.fps} fps) p50 ${r.p50} p95 ${r.p95} p99 ${r.p99} max ${r.max} ms; >16.7 ${r.over16}% >20 ${r.over20}% >33.4 ${r.over33}%; split ${JSON.stringify(r.split)} over ${r.splitFrames} frames${r.splitReset ? " (a new attract round mid-run: split since)" : ""}; game work ${r.workMs} ms/frame (max ${r.maxWorkMs}); end ${r.endScreen}/${r.endPhase}${r.shot ? ` at ${r.shot.toUpperCase()}` : ""}; sea ${r.sea}; carrier ${r.carrier}; load ${r.load}; errors ${r.errors.length}${r.drawn ? `; drawn whole ${r.drawn.whole}, in boxes ${r.drawn.part}, not drawn ${r.drawn.still}, direct ${r.drawn.direct}` : ""}${r.dragged ? "; dragged" : ""}${r.desk || r.dpr !== 3 ? `; dpr ${r.dpr}${r.desk ? " desk" : ""}` : ""}`);
for (const rate of [4, 1]) {
  for (const [scene, reduced, sea] of SCENES) {
    const r = await one(browser, PAGE, scene.startsWith("battle-") && !reduced ? "battle" : scene, reduced, rate, sea ? `?perf=1&sea=${sea}` : "?perf=1");
    r.scene = scene;
    rows.push(r);
    say(r);
  }
  // PERF-1: the base page times each build scene picked (build, build-drag), else the build screen, as before
  const baseScenes = SCENES.map(([s]) => s).filter((s) => s === "build" || s === "build-drag");
  if (BASE) for (const scene of baseScenes.length ? baseScenes : ["build"]) {
    const r = await one(browser, resolve(BASE), scene, false, rate, "");
    r.scene = scene;
    rows.push(r);
    say(r);
  }
}
await browser.close();
await writeFile(OUT, JSON.stringify({ page: PAGE, base: BASE || null, secs: SECS, battle: { hero: HERO, day: DAY, seed: SEED }, seas: SEAS, carrier: CARRIER || null, date: new Date().toISOString(), rows }, null, 1) + "\n");
