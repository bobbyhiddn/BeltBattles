// SCOUT-1 (REQ-BFG-076): the stills and the tour video of VIEW BATTLEFIELD, from the offline single-file page (the player
// build), in headless Chromium. Taps are real pointer taps at the points the page tooling reports (bb.parts: where each
// part is drawn; bb.regions: the buttons), so what is shown is what a finger does. SCOUT-1b (REQ-BFG-082, REQ-BFG-083):
// no scouting pause (the fight starts at once), and the speed picked holding for the run.
//  - stills (default): the page's requestAnimationFrame never fires and Math.random is pinned; the script steps the game
//    (bb.game.step(1/60)), so a still repeats exactly. FURNACE's day-6 dusk (seed 7, its stand-in foe) on a phone 390x844
//    at DPR 3: the fight's first second after GO at WIDE (go); the next battle (by ON TO DAWN, FIGHT! and the road fork's
//    EASY warlord) with the bar on 2X before its first step, 2X picked in the dusk (next-2x); VIEW BATTLEFIELD with both
//    summaries (view-summaries) and with a turret's face and its fight line (view-face: an open face takes the open floor
//    where the summaries sit, so one still can't show both); a Hard warlord's result card, VIEW BATTLEFIELD above its PICK
//    line (warlord-card); the 1366x768 laptop's dusk card, whole (laptop-card); the desk 1920x1080's VIEW BATTLEFIELD
//    (desk-view). Then one contact sheet of them all (sheet).
//  - video (--sets video): phone 390x844 at DPR 3, rendered frame by frame at the device's 1170x2532 (the page's clock
//    stepped 1/25 s a frame: real time at 25 fps): the build screen (day 4, after a Hard warlord's REFIT) and FIGHT!; the
//    sail-in straight into the 3-2-1 and the fight at WIDE; 1X, then 2X tapped; the fight's end and the card; VIEW
//    BATTLEFIELD (a part on each board, both summaries); ON TO DAWN and the next day's build screen; FIGHT!, the road
//    fork's EASY warlord, and that battle with the bar already on 2X, running at 2X; an mp4 and a webm, <prefix>-tour.
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node scripts/scoutshots.mjs <page.html> <outDir> [--only a,b] [--prefix scout1b]
//        [--sets stills|video] [--crf 30]
// Exit 1 on a console error or a step that didn't happen. Writes <outDir>/stills/<prefix>-<name>.png, <prefix>-shots.log.
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const pos = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--")));
const PAGE = resolve(pos[0] ?? "dist/index.html");
const OUT = resolve(pos[1] ?? "shots/scout");
const ONLY = opt("only", "");
const PREFIX = opt("prefix", "scout1b");
const SETS = opt("sets", "stills").split(",");
const CRF = opt("crf", "30");
const VIEWS = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  land: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  desk: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  laptop: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 },
};
const NAME = "beltbattles.name.v1";
const lines = [];
const log = (s) => { lines.push(s); console.log(s); };
let fails = 0;
const must = (ok, what) => { if (!ok) { fails++; log(`FAILED: ${what}`); } return ok; };

/** In the page: step n frames of 1/60 s. */
const steps = (page, n) => page.evaluate((n) => { for (let i = 0; i < n; i++) window.bb.game.step(1 / 60); window.bb.game.render(); }, n);
/** Step until the battle's phase is `ph` (or `max` frames). */
async function until(page, ph, max = 60 * 120) {
  return page.evaluate(({ ph, max }) => {
    const bb = window.bb;
    let f = 0;
    for (; f < max && bb.screen(true) !== ph; f++) bb.game.step(1 / 60);
    bb.game.render();
    return { frames: f, phase: bb.screen(true) };
  }, { ph, max });
}
/** A real tap (touch where the view has it, else a click) at CSS client (x, y), then a frame drawn. */
async function tap(page, x, y, touch) {
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  await page.evaluate(() => { window.bb.game.step(1 / 60); window.bb.game.render(); });
}
/** The centre of UI region `id` (CSS client px), or null. */
const region = (page, id) => page.evaluate((id) => { const r = window.bb.regions().find((q) => q.id === id); return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2, w: r.w, h: r.h } : null; }, id);
/** The first part on `side` whose kind is in `kinds` (in that order), with its point (CSS px). */
const part = (page, side, kinds, skip = 0) => page.evaluate(({ side, kinds, skip }) => {
  const ps = window.bb.parts(side);
  for (const k of kinds) { const q = ps.filter((p) => p.kind === k); if (q.length > skip) return q[skip]; }
  return ps[0] ?? null;
}, { side, kinds, skip });
const scout = (page) => page.evaluate(() => window.bb.scout());

async function newPage(browser, view, live = false, record = null) {
  const ctx = await browser.newContext({ ...VIEWS[view], ...(record ? { recordVideo: record } : {}) });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.addInitScript(({ live, name }) => {
    localStorage.setItem(name, "SCOUT");
    if (live) return;
    window.requestAnimationFrame = () => 0;
    let r = 0x2f6b9a1d;
    Math.random = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; };
  }, { live, name: NAME });
  await page.goto(pathToFileURL(PAGE).href);
  await page.waitForFunction(() => !!window.bb && !!window.bb.game);
  return { ctx, page, errors };
}

/** SCOUT-1b: FURNACE's day-6 dusk (seed 7) from its first frame to GO: the sail-in runs into the count by itself. */
async function toGo(page) {
  await page.evaluate(() => { window.bb.openDusk({ hero: "furnace", day: 6, seed: 7 }, []); });
  const seen = await page.evaluate(() => {
    const bb = window.bb, out = [];
    for (let f = 0; f < 600 && bb.screen(true) !== "fight"; f++) {
      bb.game.step(1 / 60);
      const s = bb.scout();
      if (s && out[out.length - 1] !== s.phase) out.push(s.phase);
    }
    bb.game.render();
    return out;
  });
  return { phases: seen, phase: await page.evaluate(() => window.bb.screen(true)) };
}

async function still(browser, name, view, fn) {
  if (ONLY && !ONLY.split(",").includes(name)) return null;
  const { ctx, page, errors } = await newPage(browser, view);
  const touch = !!VIEWS[view].hasTouch;
  let info = null;
  try {
    info = await fn(page, touch);
  } catch (e) {
    must(false, `${name}: ${e.message}`);
  }
  await mkdir(join(OUT, "stills"), { recursive: true });
  const file = join(OUT, "stills", `${PREFIX}-${name}.png`);
  await page.screenshot({ path: file });
  const s = await scout(page);
  log(`still ${name} (${view}): ${JSON.stringify(info)}; scout ${JSON.stringify(s && { phase: s.phase, camera: s.camera, face: s.face && { side: s.face.side, sel: s.face.sel, title: s.face.title, line: s.face.line, lines: s.face.lines.length }, back: s.back, primary: s.primary, card: s.card, speed: s.speed, arenaSpeed: s.arenaSpeed, ticks: s.ticks })}; ${(await stat(file)).size} B -> ${file}; console errors ${errors.length}${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  fails += errors.length;
  await ctx.close();
  return file;
}

/** SCOUT-1b (REQ-BFG-082): the fight's first second after GO, at WIDE: no SCOUT line, no FIGHT button. */
const fightGo = async (page) => {
  const r = await toGo(page);
  must(r.phase === "fight" && r.phases.join(",") === "intro,count,fight", `the sail-in runs into the count and GO (${r.phases.join(" -> ")})`);
  await steps(page, 30); // half a second after GO
  const s = await scout(page);
  must(s.camera.shot === "wide" && !s.camera.moving && !(await region(page, "fight")), `the fight at WIDE, at rest, no FIGHT button (${s.camera.shot})`);
  return { phases: r.phases, shot: s.camera.shot };
};

/** A tap on UI region `id` (real), then `n` frames; false when the region isn't there. */
async function tapRegion(page, id, touch, n = 20) {
  const q = await region(page, id);
  if (!must(!!q, `the region ${id} is there`)) return false;
  await tap(page, q.x, q.y, touch);
  await steps(page, n);
  return true;
}

/** SCOUT-1b (REQ-BFG-083): 2X tapped in the dusk's fight, SKIP, ON TO DAWN, the build screen's FIGHT! and the road fork's
 *  EASY warlord (on touch a first tap inspects, a second picks): the next battle, a few frames into its sail-in, its bar
 *  on 2X before its first step. */
const nextAt2x = async (page, touch) => {
  await toGo(page);
  await steps(page, 20);
  await tapRegion(page, "sp2", touch, 30);
  must((await scout(page)).speed === 2, "2X picked");
  await tapRegion(page, "skip", touch, 2);
  const r = await until(page, "result", 60 * 30);
  must(r.phase === "result", `the dusk's card (${r.phase})`);
  await steps(page, 40);
  await tapRegion(page, "next", touch, 60); // ON TO DAWN · DAY 7, the dawn's build screen (its wipe)
  for (let i = 0; i < 2 && (await region(page, "runepick-0")); i++) await tapRegion(page, "runepick-0", touch, 20); // a dawn rune pick, if up
  await tapRegion(page, "fight", touch, 60); // FIGHT!: the road fork
  must((await page.evaluate(() => window.bb.screen())) === "fork", "the road fork");
  for (let i = 0; i < (touch ? 2 : 1); i++) await tapRegion(page, "fork1", touch, 30); // EASY: the warlord's battle
  await page.evaluate(() => { const bb = window.bb; for (let f = 0; f < 120 && bb.screen() !== "warlord"; f++) bb.game.step(1 / 60); });
  await steps(page, 24);
  const s = await scout(page);
  must(s && s.speed === 2 && s.arenaSpeed === 2 && s.ticks === 0 && s.phase === "intro", `the next battle's bar on 2X before its first step (${s && `${s.phase}, speed ${s.speed}, arena ${s.arenaSpeed}, ticks ${s.ticks}`})`);
  return { screen: await page.evaluate(() => window.bb.screen()), phase: s?.phase, speed: s?.speed, ticks: s?.ticks };
};

/** VIEW BATTLEFIELD after the fight played at 4X: with `side` a turret's face open on that board (its fight line), else
 *  no face, both summaries in the open floor (an open face takes the floor, so one still can't show both). */
const viewFace = (side = null) => async (page, touch) => {
  await toGo(page);
  await page.evaluate(() => { window.bb.game.screen.setSpeed(3); });
  const r = await until(page, "result", 60 * 200);
  must(r.phase === "result", `the result card (${r.phase})`);
  await steps(page, 30);
  const v = await region(page, "viewfield");
  if (must(!!v, "the card shows VIEW BATTLEFIELD")) await tap(page, v.x, v.y, touch);
  await steps(page, 50);
  if (side === null) {
    const s = await scout(page);
    must(s.phase === "view" && s.summaries.length === 2 && !s.face, `the view with both summaries (${s.summaries.length})`);
    return { summaries: s.summaries.length };
  }
  const p = await part(page, side, ["turret"]);
  await tap(page, p.x, p.y, touch);
  const s = await scout(page);
  must(s.phase === "view" && !!s.face?.line, `the view with a turret's fight line (${s.face?.line})`);
  return { part: p, line: s.face?.line };
};

/** A Hard warlord won (its part pick waiting), the card with VIEW BATTLEFIELD above its PICK line (SCOUT-1b). */
const warlordCard = async (page) => {
  await page.evaluate(() => { window.bb.openWarlord("hard", { hero: "furnace", day: 4, seed: 9, outcome: 0 }); });
  await steps(page, 80);
  const v = await region(page, "viewfield"), t = await region(page, "take0");
  must(!!v && !!t && v.y + v.h / 2 < t.y - t.h / 2, "the warlord's card shows VIEW BATTLEFIELD above its picks");
  return { view: v, pick: t, phase: await page.evaluate(() => window.bb.screen(true)) };
};

/** SCOUT-1b (REQ-BFG-082): the dusk's result card on the 1366x768 laptop, whole (SCOUT-1's was 3 px too tall). */
const laptopCard = async (page) => {
  await toGo(page);
  await page.evaluate(() => { window.bb.game.screen.skip(); });
  const r = await until(page, "result", 60 * 30);
  await steps(page, 60);
  const s = await scout(page);
  const vp = VIEWS.laptop.viewport;
  must(r.phase === "result" && !!s.card && s.card.y >= 1.5 && s.card.y + s.card.h <= vp.height - 1.5, `the card whole on the 1366x768 screen (${JSON.stringify(s.card)})`);
  return { card: s.card };
};

/** A contact sheet composed in the page from PNGs: `rows` of cells [{file, label}], each cell scaled (smoothly, to a
 *  whole sheet) to the width `w` px its row gives it, a title on top. */
async function sheet(browser, name, title, rows) {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 300 } });
  const page = await ctx.newPage();
  const parts = [];
  for (const row of rows) {
    const out = [];
    for (const c of row.cells) out.push({ ...c, url: `data:image/png;base64,${(await readFile(c.file)).toString("base64")}` });
    parts.push({ w: row.w, cells: out });
  }
  const data = await page.evaluate(async ({ parts, title }) => {
    const load = (u) => new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.src = u; });
    const rows = [];
    for (const r of parts) rows.push({ w: r.w, cells: await Promise.all(r.cells.map(async (c) => ({ label: c.label, im: await load(c.url) }))) });
    const gap = 24, head = 90, foot = 56;
    const width = Math.max(...rows.map((r) => gap + r.cells.length * (r.w + gap)));
    const hOf = (c, w) => Math.round((c.im.height * w) / c.im.width);
    const rowH = rows.map((r) => Math.max(...r.cells.map((c) => hOf(c, r.w))));
    const cv = document.createElement("canvas");
    cv.width = width;
    cv.height = head + rowH.reduce((a, b) => a + b + foot + gap, 0);
    const g = cv.getContext("2d");
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.fillStyle = "#050B12";
    g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = "#F6CF48";
    let fs = 40;
    for (; fs > 16; fs -= 2) { g.font = `bold ${fs}px monospace`; if (g.measureText(title).width <= cv.width - 2 * gap) break; }
    g.fillText(title, gap, 58);
    let y = head;
    rows.forEach((r, ri) => {
      r.cells.forEach((c, i) => {
        const x = gap + i * (r.w + gap), h = hOf(c, r.w);
        g.drawImage(c.im, x, y, r.w, h);
        g.strokeStyle = "#7A8F9A";
        g.lineWidth = 3;
        g.strokeRect(x - 2, y - 2, r.w + 4, h + 4);
        g.fillStyle = "#E9F1E5";
        g.font = "bold 28px monospace";
        g.fillText(c.label, x, y + h + 38);
      });
      y += rowH[ri] + foot + gap;
    });
    return cv.toDataURL("image/png");
  }, { parts, title });
  const file = join(OUT, "stills", `${PREFIX}-${name}.png`);
  await writeFile(file, Buffer.from(data.split(",")[1], "base64"));
  log(`sheet ${name}: ${rows.map((r) => r.cells.length).join("+")} cells; ${(await stat(file)).size} B -> ${file}`);
  await ctx.close();
}

const probe = (f) => execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=width,height,codec_name,avg_frame_rate,nb_frames", "-of", "compact", f]).toString().trim().replace(/\n/g, " ");

/**
 * The tour: phone 390x844 at DPR 3, rendered frame by frame at the device's pixels (1170x2532). Playwright's recorder
 * takes a DPR-3 page's frames at its CSS size (390x844: a third of the device's pixels, its pixel art resampled), so here
 * the page's clock is held (as for the stills) and the script steps it 1/25 s a frame and takes each frame's screenshot:
 * 25 frames a second of the game's own time, so the video plays in real time. The taps are real pointer taps between
 * frames. ffmpeg joins the frames into an mp4 (H.264, CRF `CRF`) and a webm. SCOUT-1b (REQ-BFG-082, REQ-BFG-083), in
 * this order: the build screen (FURNACE day 4, after a Hard warlord's win and REFIT: set up before the first frame) and
 * FIGHT!; the sail-in straight into the 3-2-1 and the fight at WIDE; about 3 s at 1X, then 2X tapped and the fight at 2X;
 * its end and the card; VIEW BATTLEFIELD (a part on each board, both summaries); ON TO DAWN and the next day's build
 * screen; FIGHT!, the road fork's EASY warlord, and that battle with the bar on 2X from its first frame, running at 2X.
 */
async function tour(browser) {
  const FPS = 25, dir = join(OUT, "video", "frames");
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const { ctx, page, errors } = await newPage(browser, "phone", false);
  await page.evaluate(() => { for (let i = 0; i < 120; i++) window.bb.game.step(1 / 60); }); // the title's opening
  let n = 0;
  const frame = async () => {
    await page.evaluate((dt) => { window.bb.game.step(dt); window.bb.game.render(); }, 1 / FPS);
    await page.screenshot({ path: join(dir, `f${String(n).padStart(5, "0")}.png`) });
    n++;
  };
  const hold = async (secs) => { for (let i = Math.round(secs * FPS); i > 0; i--) await frame(); };
  const until = async (pred, max = 30) => { for (let i = 0; i < max * FPS && !(await page.evaluate(pred)); i++) await frame(); };
  const marks = [];
  const mark = async (what) => {
    const s = await scout(page);
    marks.push(`${(n / FPS).toFixed(1)}s ${what} [${s ? `${s.phase}, bar ${["0.5X", "1X", "2X", "4X"][s.speed]}, arena ${s.arenaSpeed}X, ${s.ticks} ticks` : await page.evaluate(() => window.bb.screen())}${s?.face ? `: ${s.face.title}` : ""}]`);
  };
  const tapAt = async (p) => { await page.touchscreen.tap(p.x, p.y); };
  const tapId = async (id, what) => { const q = await region(page, id); if (must(!!q, `${what} (${id}) shows`)) await tapAt(q); await frame(); return !!q; };
  const tapPart = async (side, kinds, secs) => {
    const p = await part(page, side, kinds, 0);
    await tapAt(p);
    await frame();
    await mark(`tap ${side === 0 ? "your" : "enemy"} ${p.name}`);
    await hold(secs);
  };
  // set up (no frames): a Hard warlord won on day 4, its part taken, REFIT: the build screen, FIGHT! on to the dusk
  await page.evaluate(() => window.bb.openWarlord("hard", { hero: "furnace", day: 4, seed: 9, outcome: 0 }));
  await steps(page, 80);
  for (const id of ["take0", "refit"]) {
    const q = await region(page, id);
    if (must(!!q, `the set-up's ${id}`)) await tap(page, q.x, q.y, true);
    await steps(page, 60);
  }
  must((await page.evaluate(() => window.bb.screen())) === "build", "the set-up ends on the build screen");
  await mark("the build screen (day 4, after REFIT)");
  await hold(2.4);
  await tapId("fight", "the build screen's FIGHT!");
  await mark("FIGHT!");
  await until(() => window.bb.screen(true) === "fight", 10); // the sail-in straight into the 3-2-1, no pause
  await mark("GO: the fight at WIDE");
  await hold(3.0);
  await mark("3 s at 1X");
  await tapId("sp2", "the bar's 2X");
  await mark("2X tapped");
  await hold(6.0);
  await until(() => window.bb.screen(true) !== "fight", 6); // its end, or SKIP after 6 s more
  if (await page.evaluate(() => window.bb.screen(true) === "fight")) { await tapId("skip", "SKIP"); await mark("SKIP"); }
  await until(() => window.bb.screen(true) === "result", 15);
  await hold(3.0);
  await mark("the card");
  await tapId("viewfield", "the card's VIEW BATTLEFIELD");
  await hold(1.4);
  await mark("VIEW BATTLEFIELD");
  await tapPart(0, ["turret"], 3.0);
  await tapPart(1, ["turret"], 3.0);
  await tapId("faceclose", "the face's CLOSE"); // both summaries in sight again
  await hold(3.4);
  await mark("the summaries");
  await tapId("viewnext", "ON TO DAWN in the view");
  await hold(3.0);
  await mark("ON TO DAWN: the next day's build screen");
  for (let i = 0; i < 2 && (await region(page, "runepick-0")); i++) { await tapId("runepick-0", "the dawn's rune"); await hold(0.8); }
  await tapId("fight", "the build screen's FIGHT!");
  await hold(1.8);
  await mark("the road fork");
  await tapId("fork1", "the fork's EASY warlord"); // a first tap inspects it
  await hold(1.2);
  await tapId("fork1", "the fork's EASY warlord"); // a second takes it
  await mark("the next battle: the bar on 2X from its first frame");
  await until(() => window.bb.screen(true) === "fight", 10);
  await mark("GO at 2X");
  await hold(7.0);
  await mark("7 s at 2X");
  await ctx.close();
  fails += errors.length;
  log(`video tour: ${n} frames (${(n / FPS).toFixed(1)} s at ${FPS} fps) rendered at 390x844 CSS px, DPR 3 (1170x2532 device px), the page's clock stepped 1/${FPS} s a frame; console errors ${errors.length}${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  log(`video tour marks: ${marks.join(" | ")}`);
  const mp4 = join(OUT, "video", `${PREFIX}-tour.mp4`), webm = join(OUT, "video", `${PREFIX}-tour.webm`), pat = join(dir, "f%05d.png");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-threads", "4", "-framerate", String(FPS), "-i", pat, "-c:v", "libx264", "-crf", CRF, "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-threads", "4", "-framerate", String(FPS), "-i", pat, "-c:v", "libvpx", "-b:v", "4M", "-auto-alt-ref", "0", webm]);
  for (const f2 of [mp4, webm]) log(`ffmpeg: ${f2}: ${(await stat(f2)).size} B; ${probe(f2)}`);
  await rm(dir, { recursive: true, force: true });
}

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
log(`# scoutshots (SCOUT-1b, REQ-BFG-082, REQ-BFG-083): ${PAGE}, Chromium ${browser.version()}; sets ${SETS.join(",")}; ${new Date().toISOString()}`);
if (SETS.includes("stills")) {
  const cells = [];
  const add = (file, label) => { if (file) cells.push({ file, label }); };
  add(await still(browser, "go", "phone", fightGo), "THE FIGHT, 0.5 S AFTER GO");
  add(await still(browser, "next-2x", "phone", nextAt2x), "NEXT BATTLE: 2X AT 0:00");
  add(await still(browser, "view-summaries", "phone", viewFace(null)), "VIEW BATTLEFIELD: SUMMARIES");
  add(await still(browser, "view-face", "phone", viewFace(0)), "VIEW BATTLEFIELD: A FIGHT LINE");
  add(await still(browser, "warlord-card", "phone", warlordCard), "WARLORD CARD");
  add(await still(browser, "laptop-card", "laptop", laptopCard), "LAPTOP 1366X768: THE DUSK CARD");
  add(await still(browser, "desk-view", "desk", viewFace(null)), "DESK: VIEW BATTLEFIELD");
  if (!ONLY && cells.length) {
    // one sheet of them all: the five phone stills (390x844 at DPR 3) across, then the laptop and the desk
    const phone = cells.filter((c) => !/LAPTOP|DESK/.test(c.label)), wide = cells.filter((c) => /LAPTOP|DESK/.test(c.label));
    await sheet(browser, "sheet", "SCOUT-1b: THE FIGHT AT ONCE, THE SPEED HELD, VIEW BATTLEFIELD. PHONE 390X844 DPR 3; LAPTOP 1366X768; DESK 1920X1080",
      [{ w: 585, cells: phone }, { w: 1460, cells: wide }].filter((r) => r.cells.length));
  }
}
if (SETS.includes("video")) await tour(browser);
await browser.close();

await mkdir(join(OUT, "stills"), { recursive: true });
await writeFile(join(OUT, "stills", `${PREFIX}-shots.log`), lines.join("\n") + "\n");
log(fails ? `SCOUTSHOTS: ${fails} FAILED` : "SCOUTSHOTS: OK");
process.exit(fails ? 1 : 0);
