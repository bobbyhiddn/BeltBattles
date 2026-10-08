// MOTION-1 (REQ-BFG-071): the board-tap probe. scripts/touchcheck.mjs never taps during a battle, so this probe does, on
// a VITE_MOTION=1 page (the offline single-file page) in headless Chromium, phone portrait 390x844 at DPR 3 (isMobile,
// hasTouch), with real touch input (CDP Input.dispatchTouchEvent, as touchcheck taps). In a dusk battle on day 5, at
// several moments while the ships move, it taps known tiles on both boards (each tile's centre where it is drawn now,
// bb.motionTile) and checks each hit: the game's hit test (the screen point, through the inverse of carrier x board, to a
// board tile) must name the tile aimed at. It checks that the tiles did move between the moments, and that the HUD's
// buttons, fixed on screen, still hit as before (2X, then 1X; II, then resume). Runs: motion as built, ?sway=3 (both
// boards turned: the inverse is a real rotation) and reduce motion.
// MOTION-2 (REQ-BFG-071, REVIEW-MOTION1 Q4): a test-only probe. A tap draws nothing now; the hit test and bb.motion()'s
// lastTap stay for this probe. The page is the player build (the offline page); the ?sway=3 run needs a test build with
// the dev knobs (VITE_MOTION_KNOBS=1, --knobs <page>). A fourth run checks the player build ignores every knob in the URL.
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node scripts/motiontap.mjs <player page.html> <log.txt> [--knobs <test page.html>]
import { chromium } from "playwright-core";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const argv = process.argv.slice(2);
const ki = argv.indexOf("--knobs");
const KPAGE = ki >= 0 ? resolve(argv[ki + 1]) : null;
const [pageArg, logArg] = argv.filter((a, i) => a !== "--knobs" && (ki < 0 || i !== ki + 1));
const PAGE = resolve(pageArg ?? "dist/index.html");
const lines = [];
const log = (s) => { lines.push(s); console.log(s); };
let pass = 0, fail = 0;
const check = (ok, what) => { if (ok) pass++; else fail++; log(`${ok ? "PASS" : "FAIL"}  ${what}`); };
const TILES = [[0, 0, 0], [0, 9, 9], [0, 4, 5], [0, 7, 2], [1, 0, 0], [1, 9, 9], [1, 5, 4], [1, 2, 7]];
const MOMENTS = 4;

async function run(browser, name, query, reduced, page0 = PAGE) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(pathToFileURL(page0).href + query);
  await page.waitForFunction(() => !!window.bb && window.bb.screen() === "title");
  await page.evaluate((r) => { if (r) window.bb.setReducedMotion(true); window.bb.openDusk({ hero: "furnace", day: 5, seed: 7 }, []); }, reduced);
  await page.waitForFunction(() => window.bb.motion().phase === "fight", null, { timeout: 20000 });
  const cdp = await ctx.newCDPSession(page);
  const tap = async (x, y) => {
    const pt = [{ x, y, id: 1, radiusX: 1, radiusY: 1, force: 1 }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  const m0 = await page.evaluate(() => window.bb.motion());
  log(`\n== ${name} (${query || "no query"}${reduced ? ", reduce motion" : ""}) on ${page0}: knobs ${m0.knobs}, sea ${m0.sea}, sway ${m0.opts.sway}, reduced ${m0.reduced}`);
  if (query.includes("sway")) check(m0.knobs === true && m0.opts.sway === 3, `${name}: a test build reads ?sway=3: knobs ${m0.knobs}, sway ${m0.opts.sway}`);
  const seen = new Map();
  for (let k = 0; k < MOMENTS; k++) {
    if (k) await page.waitForTimeout(1800);
    for (const [side, cx, cy] of TILES) {
      const before = await page.evaluate(([s, x, y]) => ({ p: window.bb.motionTile(s, x, y), m: window.bb.motion() }), [side, cx, cy]);
      const p = before.p;
      await tap(p.x, p.y);
      await page.waitForTimeout(40);
      const m = await page.evaluate(() => window.bb.motion());
      const got = m.lastTap;
      const ok = !!got && m.taps === (before.m.taps ?? 0) + 1 && got.side === side && got.cx === cx && got.cy === cy;
      const pose = before.m.poses[side];
      check(ok, `${name} moment ${k + 1} (motion t ${before.m.t.toFixed(2)} s, ${before.m.phase}): tile side ${side} (${cx},${cy}) at client (${p.x.toFixed(1)}, ${p.y.toFixed(1)}), carrier offset (${pose.x.toFixed(2)}, ${pose.y.toFixed(2)}) bank ${pose.bank.toFixed(2)} board ${pose.board.toFixed(2)} deg, shake [${before.m.shake}]/[${m.shake}] -> hit ${got ? `side ${got.side} (${got.cx},${got.cy}), tap #${m.taps}` : "nothing"}`);
      const key = `${side}:${cx}:${cy}`;
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key).push(p);
    }
  }
  if (!reduced) {
    let moved = 0;
    for (const ps of seen.values()) if (Math.max(...ps.map((q) => Math.hypot(q.x - ps[0].x, q.y - ps[0].y))) >= 1) moved++;
    check(moved === seen.size, `${name}: every tapped tile moved on screen between the moments (at least 1 CSS px): ${moved} of ${seen.size}`);
  } else {
    let still = 0;
    for (const ps of seen.values()) if (ps.every((q) => Math.hypot(q.x - ps[0].x, q.y - ps[0].y) < 0.01)) still++;
    check(still === seen.size, `${name}: reduce motion: every tile stayed put (straight sailing): ${still} of ${seen.size}`);
  }
  // the HUD stays fixed and hits as before
  const region = (id) => page.evaluate((i) => window.bb.regions().find((r) => r.id === i) ?? null, id);
  const speed = () => page.evaluate(() => window.bb.game.screen.arena.speed);
  for (const [id, want] of [["sp2", 2], ["sp1", 1]]) {
    const r = await region(id);
    if (!r) { check(false, `${name}: HUD button ${id} not found`); continue; }
    await tap(r.x + r.w / 2, r.y + r.h / 2);
    await page.waitForTimeout(80);
    const sp = await speed();
    check(sp === want, `${name}: HUD ${id} at (${(r.x + r.w / 2).toFixed(1)}, ${(r.y + r.h / 2).toFixed(1)}) sets the playback to ${want}X: ${sp}X`);
  }
  for (const want of [true, false]) {
    const r = await region("pause");
    if (!r) { check(false, `${name}: HUD button pause not found`); continue; }
    await tap(r.x + r.w / 2, r.y + r.h / 2);
    await page.waitForTimeout(80);
    const pz = await page.evaluate(() => window.bb.game.screen.paused);
    check(pz === want, `${name}: HUD II ${want ? "pauses" : "resumes"}: paused ${pz}`);
  }
  const taps = (await page.evaluate(() => window.bb.motion())).taps;
  check(taps === MOMENTS * TILES.length, `${name}: the HUD taps never reached the boards: ${taps} board taps for ${MOMENTS * TILES.length} board tiles tapped`);
  check(errors.length === 0, `${name}: console errors ${errors.length}${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  await ctx.close();
}

/** MOTION-2: the player build ignores every dev knob in the URL: motion stays on, no sway, the day's sea, no overlay. */
async function ignored(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const q = "?motion=0&sway=3&sea=ember&perf=1";
  await page.goto(pathToFileURL(PAGE).href + q);
  await page.waitForFunction(() => !!window.bb && window.bb.screen() === "title");
  await page.evaluate(() => window.bb.openDusk({ hero: "furnace", day: 2, seed: 7 }, []));
  await page.waitForFunction(() => window.bb.motion().phase === "fight", null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => window.bb.motion());
  log(`\n== knobs ignored (${q}) on ${PAGE}: knobs ${m.knobs}, opts ${JSON.stringify(m.opts)}, on ${m.on}, sea ${m.sea}, perf ${JSON.stringify(m.perf)}, boards [${m.poses.map((p) => p.board)}]`);
  check(m.knobs === false, `knobs ignored: the player build has no knobs (MOTION_KNOBS false)`);
  // CUSTOM-2a (REVIEW-MOTION2 Q2): the options have no `on` (the ?motion=0 knob is gone from every build)
  check(JSON.stringify(m.opts) === JSON.stringify({ sway: 0, sea: null, perf: false }), `knobs ignored: the options are the defaults whatever the URL says: ${JSON.stringify(m.opts)}`);
  check(m.on === true && m.sea === "calm", `knobs ignored: ?motion=0 and ?sea=ember change nothing: motion on ${m.on}, day 2's sea ${m.sea}`);
  check(m.perf === null && m.poses.every((p) => p.board === 0), `knobs ignored: ?perf=1 and ?sway=3 change nothing: perf ${JSON.stringify(m.perf)}, board angles [${m.poses.map((p) => p.board)}]`);
  check(errors.length === 0, `knobs ignored: console errors ${errors.length}${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  await ctx.close();
}

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
log(`motiontap on ${PAGE}${KPAGE ? ` (the ?sway=3 run on the test page ${KPAGE})` : ""}, ${new Date().toISOString()}`);
await run(browser, "motion", "", false);
await run(browser, "sway3", "?sway=3", false, KPAGE ?? PAGE);
await run(browser, "reduced", "", true);
await ignored(browser);
await browser.close();
log(`\n${fail ? `MOTION TAPS FAILED: ${fail} of ${pass + fail}` : `MOTION TAPS PASSED: ${pass} of ${pass + fail}`}`);
if (logArg) await writeFile(resolve(logArg), lines.join("\n") + "\n");
process.exit(fail ? 1 : 0);
