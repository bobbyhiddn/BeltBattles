// HITMARK-1E (REQ-BFG-100, C7; BRIEF-HITMARK1E step 6) picture tooling, not shipped: tools/scale2c/scaleShots.mjs's fight stills (its
// openLive and stepLive, word for word), the same four as SCALE-2c's round M: fight-badge (about 0:04: the keg's badge in the clear)
// and fight (the picked moment, about 0:14), each on the phone (402x690 @3, touch) and the desk (1920x1080). Changes from the copy:
//  - the label (before | after) only names the files: scaleShots.mjs takes the fight only for `after`, and here BEFORE (the base) and
//    AFTER (the tip) are both builds with SCALE_RIGS true, so both need the fight;
//  - no shop cards, no taps;
//  - each fight shot also logs where your status row (C2's tab) sits, in logical px and as a device-px box on the phone, so crop.mjs can
//    cut the row out of the still.
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node scripts/hitmark1e/hitShots.mjs <dist dir> <out dir> <before|after> <moment.json> [pick] [extra]
import { chromium } from "playwright-core";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const DIST = resolve(process.argv[2] ?? "dist");
const OUT = resolve(process.argv[3] ?? "shots-hitmark1e");
const LABEL = process.argv[4] ?? "after";
const MOMENT = process.argv[5];
const PICK = Number(process.argv[6] ?? 0);
const EXTRA = Number(process.argv[7] ?? 6);
const ORIGIN = "http://bb.test";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml" };
const VIEWS = {
  phone: { viewport: { width: 402, height: 690 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  desk: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
};

async function serve(route) {
  const url = new URL(route.request().url());
  let p = normalize(decodeURIComponent(url.pathname)).replace(/^\/+/, "");
  if (!p || p.endsWith("/")) p += "index.html";
  try {
    await route.fulfill({ status: 200, body: await readFile(join(DIST, p)), contentType: TYPES[extname(p)] ?? "application/octet-stream" });
  } catch {
    await route.fulfill({ status: 404, body: "not found" });
  }
}

/** The live dusk with the picked decks (bb.openDusk, then the run's deck and a stored stand-in foe, the screen made again). (scaleShots.mjs's) */
const openLive = (page, m) => page.evaluate((m) => {
  const bb = window.bb, g = bb.game;
  delete g.step; // un-freeze (stepLive's freeze below shadows Game.step on the instance)
  bb.openDusk({ hero: m.run.hero, day: m.run.day, seed: m.run.seed, wins: m.run.wins, lives: m.run.lives }, []);
  let guard = 0;
  while (g.pending && guard++ < 600) g.step(1 / 60);
  const Screen = g.screen.constructor;
  g.run.build = structuredClone(m.a);
  g.run.dusk = { day: m.run.day, kind: "standin", name: "STAND-IN", hero: m.b.hero, build: structuredClone(m.b) };
  g.go(new Screen(g));
  guard = 0;
  while (g.pending && guard++ < 600) g.step(1 / 60);
  return g.screen.arena.b.record.seed === m.seed;
}, m);

/** Step the live fight (1X, frame by frame): to `tick` plus `extra` frames ("moment"), or ("badge") until the keg has 6 or more hits and
 *  3 or more hits are on you, then on to a frame with 6 or fewer numbers alive (at most 240 frames past that, never past the fight's
 *  end); then what the frame shows. Each mode on a fresh live dusk (openLive). (scaleShots.mjs's, plus the status row's box.) */
const stepLive = (page, mode, tick, extra) => page.evaluate(([mode, tick, extra]) => {
  const bb = window.bb, g = bb.game, s = g.screen, a = s.arena;
  const keg = () => a.b.sides[0].gates.find((q) => q.def.id === "keg");
  const clear = () => !!s.counters.last.badges.find((q) => q.kind === "rig") && a.fx.popCount <= 6;
  let guard = 0;
  if (mode === "moment") {
    while (a.b.ticks < tick && !a.b.over && guard++ < 40000) g.step(1 / 60);
    for (let i = 0; i < extra; i++) g.step(1 / 60);
    g.render();
  } else {
    while (!a.b.over && guard++ < 40000 && !((keg()?.ownHits ?? 0) >= 6 && (a.b.sides[0].hitsTaken ?? 0) >= 3)) g.step(1 / 60);
    let more = 0;
    g.render();
    while (!a.b.over && more++ < 240 && !clear()) { g.step(1 / 60); g.render(); }
  }
  // HITMARK-1E: freeze the fight on this frame. The page's own loop (game.ts loop: step(dt) then render, on requestAnimationFrame)
  // would otherwise run the fight on in real time between this call and the screenshot, so the still would show a later frame than
  // the log describes (and phone and desk, BEFORE and AFTER, would differ by a few frames). Game.step becomes a no-op on this instance
  // until the next openLive; the loop still renders, so the still is this exact frame.
  g.step = () => {};
  g.render();
  const c = bb.counters(), fx = a.fx, live = fx.popList.slice(0, fx.popCount);
  const cv = document.querySelector("canvas"), cr = cv ? cv.getBoundingClientRect() : null, dpr = window.devicePixelRatio;
  const t0 = c && c.tabs[0] ? c.tabs[0].r : null;
  let box = null;
  if (t0 && cr) { // your status row (C2's tab) in device px: bb.counters()'s rects are in the canvas's CSS px (the tab is 11 art px tall), so the tab and 2 art px round it, times the device ratio
    const k = cr.width / g.W, m = 2 * k;
    box = { x: Math.round((cr.left + t0.x - m) * dpr), y: Math.round((cr.top + t0.y - m) * dpr), w: Math.round((t0.w + 2 * m) * dpr), h: Math.round((t0.h + 2 * m) * dpr) };
  }
  return {
    ticks: a.b.ticks, t: +a.b.t.toFixed(3), phase: s.phase, scaleRigs: a.b.scaleRigs ?? null,
    hitsTaken: a.b.sides[0].hitsTaken ?? null, kegHits: keg()?.ownHits ?? null,
    plateName: s.plateName ?? null, record: s.counters.record, badges: s.counters.last.badges,
    tabs: c ? c.tabs.map((t) => (t ? { side: t.side, r: t.r, below: t.below, chips: t.chips } : null)) : null,
    readerPops: live.filter((p) => p.reader).map((p) => ({ text: p.text, color: p.color, age: +p.t.toFixed(2) })),
    targets: c ? c.targets.map((q) => q.id) : [],
    geometry: { W: g.W, H: g.H, canvasCss: cr ? { left: cr.left, top: cr.top, width: cr.width, height: cr.height } : null, dpr, box },
  };
}, [mode, tick, extra]);

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
  const errors = [], report = { label: LABEL, shots: [] };
  const m = JSON.parse(await readFile(MOMENT, "utf8")).top[PICK];
  for (const [view, opts] of Object.entries(VIEWS)) {
    const ctx = await browser.newContext(opts);
    await ctx.route(`${ORIGIN}/**`, serve);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`[${view}] pageerror: ${e.message}`));
    page.on("console", (msg) => { if (msg.type() === "error") errors.push(`[${view}] console: ${msg.text()}`); });
    await page.goto(`${ORIGIN}/index.html`);
    try {
      await page.waitForFunction(() => !!window.bb, null, { timeout: 15000 });
    } catch (e) {
      console.log(`[${view}] the page never set window.bb: ${e.message}\n${errors.join("\n")}`);
      throw e;
    }
    const shot = async (name, line, extra = {}) => {
      const file = join(OUT, `${name}-${LABEL}-${view}.png`);
      await page.screenshot({ path: file });
      console.log(`${name}-${LABEL}-${view}.png: ${line}`);
      report.shots.push({ view, name, file, line, ...extra });
    };
    const ok = await openLive(page, m);
    const line = (r) => `phase ${r.phase} scaleRigs ${r.scaleRigs}, tick ${r.ticks} (${r.t} s): hits on you ${r.hitsTaken}, keg hits ${r.kegHits}; plate "${r.plateName}"; your row ${JSON.stringify(r.tabs?.find((t) => t && t.side === 0)?.chips ?? null)}; badges ${JSON.stringify(r.badges)}; reader pops ${JSON.stringify(r.readerPops)}`;
    const head = `d${m.day} FURNACE par deck ${m.i + 1} (${m.swaps}) v ${m.foe} s${m.seed} (the screen's seed: ${ok}), a live dusk, run 4W 6 hearts of 10`;
    const early = await stepLive(page, "badge", 0, 0);
    await shot("fight-badge", `${head}; the keg's badge early, few numbers alive: ${line(early)}`, { r: early });
    await openLive(page, m); // a fresh live dusk for the picked moment
    const r = await stepLive(page, "moment", m.moment.tick, EXTRA);
    await shot("fight", `${head}; the picked moment tick ${m.moment.tick} (${m.moment.t} s: hits on you ${m.moment.hits}, keg hits ${m.moment.keg}, pop ${m.moment.pop.def} +${m.moment.pop.amount}) + ${EXTRA} frames: ${line(r)}`, { r });
    await ctx.close();
  }
  await browser.close();
  await writeFile(join(OUT, `hitShots-${LABEL}.json`), JSON.stringify({ ...report, errors }, null, 1));
  console.log(`errors: ${errors.length}${errors.length ? "\n" + errors.join("\n") : ""}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
