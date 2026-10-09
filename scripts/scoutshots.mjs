// SCOUT-1 (REQ-BFG-076): the stills and the tour video of scouting and VIEW BATTLEFIELD, from the offline single-file page
// (the player build), in headless Chromium. Taps are real pointer taps at the points the page tooling reports (bb.parts:
// where each part is drawn; bb.regions: the buttons), so what is shown is what a finger does.
//  - stills (default): the page's requestAnimationFrame never fires and Math.random is pinned; the script steps the game
//    (bb.game.step(1/60)), so a still repeats exactly. FURNACE's day-6 dusk (seed 7, its stand-in foe) on a phone 390x844
//    at DPR 3: scouting with an enemy part's face open (scout-enemy); with your part's face and its ⓘ view open
//    (scout-info); VIEW BATTLEFIELD with both summaries and a turret's fight line (view); a Hard warlord's result card with
//    its VIEW BATTLEFIELD button (warlord-card); desk 1920x1080 and phone landscape 844x390, scouting and the view
//    (desk-scout, desk-view, land-scout, land-view). Then one contact sheet of them all (sheet).
//  - video (--sets video): one dusk battle from its sail-in, phone 390x844 at DPR 3, rendered frame by frame at the
//    device's 1170x2532 (the page's clock stepped 1/25 s a frame: real time at 25 fps): scouting (two of your parts, two
//    enemy parts and one ⓘ view), FIGHT and the ease to WIDE, about 15 s of the fight, the result card, VIEW BATTLEFIELD
//    (a part on each board, both summaries), ON TO DAWN; an mp4 and a webm, <prefix>-tour.
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node scripts/scoutshots.mjs <page.html> <outDir> [--only a,b] [--prefix scout1]
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
const PREFIX = opt("prefix", "scout1");
const SETS = opt("sets", "stills").split(",");
const CRF = opt("crf", "30");
const VIEWS = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  land: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  desk: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
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

/** Into scouting on FURNACE's day-6 dusk (seed 7), the camera at rest at CLOSE. */
async function toScouting(page) {
  await page.evaluate(() => { window.bb.openDusk({ hero: "furnace", day: 6, seed: 7 }, []); });
  const r = await until(page, "scout", 60 * 10);
  await steps(page, 50); // the ease to CLOSE (0.6 s) and the calm (0.5 s)
  return r;
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
  log(`still ${name} (${view}): ${JSON.stringify(info)}; scout ${JSON.stringify(s && { phase: s.phase, camera: s.camera, face: s.face && { side: s.face.side, sel: s.face.sel, title: s.face.title, line: s.face.line, lines: s.face.lines.length }, fight: s.fight, back: s.back, primary: s.primary })}; ${(await stat(file)).size} B -> ${file}; console errors ${errors.length}${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  fails += errors.length;
  await ctx.close();
  return file;
}

/** Scouting with a face open: an enemy part (side 1) or yours (side 0) with its ⓘ view. */
const scoutFace = (side, info) => async (page, touch) => {
  const r = await toScouting(page);
  must(r.phase === "scout", `scouting reached (${r.phase})`);
  const p = await part(page, side, side === 1 ? ["turret", "item"] : ["item", "turret"]);
  await tap(page, p.x, p.y, touch);
  let s = await scout(page);
  must(!!s.face && s.face.side === side, `a tap on ${p.name} opens its face (${s.face?.title})`);
  if (info) {
    const q = await region(page, "kw:?");
    if (must(!!q, "the face has its ⓘ button")) await tap(page, q.x, q.y, touch);
    s = await scout(page);
  }
  return { part: p, face: s.face?.title, frames: r.frames };
};

/** VIEW BATTLEFIELD after the fight played at 4X, a turret's face open (its fight line). */
const viewFace = (side = 0) => async (page, touch) => {
  await toScouting(page);
  await page.evaluate(() => { window.bb.fight(); window.bb.game.screen.setSpeed(3); });
  const r = await until(page, "result", 60 * 200);
  must(r.phase === "result", `the result card (${r.phase})`);
  await steps(page, 30);
  const v = await region(page, "viewfield");
  if (must(!!v, "the card shows VIEW BATTLEFIELD")) await tap(page, v.x, v.y, touch);
  await steps(page, 50);
  const p = await part(page, side, ["turret"]);
  await tap(page, p.x, p.y, touch);
  const s = await scout(page);
  must(s.phase === "view" && !!s.face?.line, `the view with a turret's fight line (${s.face?.line})`);
  return { part: p, line: s.face?.line, summaries: s.summaries.length };
};

/** A Hard warlord won (its part pick waiting), the card with VIEW BATTLEFIELD. */
const warlordCard = async (page) => {
  await page.evaluate(() => { window.bb.openWarlord("hard", { hero: "furnace", day: 4, seed: 9, outcome: 0 }); });
  await steps(page, 80);
  const v = await region(page, "viewfield");
  must(!!v, "the warlord's card shows VIEW BATTLEFIELD");
  return { view: v, phase: await page.evaluate(() => window.bb.screen(true)) };
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
 * The tour: one dusk battle from the sail-in on the phone 390x844 at DPR 3, rendered frame by frame at the device's
 * pixels (1170x2532). Playwright's recorder takes a DPR-3 page's frames at its CSS size (390x844: a third of the device's
 * pixels, its pixel art resampled), so here the page's clock is held (as for the stills) and the script steps it 1/25 s a
 * frame and takes each frame's screenshot: 25 frames a second of the game's own time, so the video plays in real time.
 * The taps are real pointer taps between frames. ffmpeg joins the frames into an mp4 (H.264, CRF `CRF`) and a webm.
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
  const mark = async (what) => { const s = await scout(page); marks.push(`${(n / FPS).toFixed(1)}s ${what} [${s ? s.phase : await page.evaluate(() => window.bb.screen())}${s?.face ? `: ${s.face.title}` : ""}]`); };
  const tapAt = async (p) => { await page.touchscreen.tap(p.x, p.y); };
  const tapPart = async (side, kinds, secs) => {
    const p = await part(page, side, kinds, 0);
    await tapAt(p);
    await frame();
    await mark(`tap ${side === 0 ? "your" : "enemy"} ${p.name}`);
    await hold(secs);
  };
  await page.evaluate(() => window.bb.openDusk({ hero: "furnace", day: 6, seed: 7 }, []));
  await until(() => { const s = window.bb.scout(); return !!s && s.phase === "scout" && !s.camera.moving; });
  await mark("scouting");
  await hold(1.2);
  await tapPart(0, ["item"], 2.0);
  await tapPart(0, ["turret"], 1.6);
  const q = await region(page, "kw:?");
  if (must(!!q, "the tour's face has its ⓘ button")) { await tapAt(q); await frame(); await mark("ⓘ"); await hold(2.8); }
  await tapPart(1, ["turret"], 2.0);
  await tapPart(1, ["item"], 2.0);
  const f = await region(page, "fight");
  if (must(!!f, "FIGHT shows")) await tapAt(f);
  await frame();
  await mark("FIGHT");
  await hold(16.4); // the count, the ease to WIDE and about 15 s of the fight
  await mark("15 s in");
  await page.evaluate(() => { const s = window.bb.game.screen; if (s.phase === "fight") s.skip(); });
  await until(() => window.bb.screen(true) === "result", 20);
  await hold(2.2);
  await mark("the card");
  const v = await region(page, "viewfield");
  if (must(!!v, "the card's VIEW BATTLEFIELD")) await tapAt(v);
  await hold(1.4);
  await mark("VIEW BATTLEFIELD");
  await tapPart(0, ["turret"], 2.6);
  await tapPart(1, ["turret"], 2.6);
  const cl = await region(page, "faceclose"); // the face's CLOSE: both summaries in sight again
  if (must(!!cl, "the view's face has CLOSE")) await tapAt(cl);
  await hold(2.4);
  await mark("summaries");
  const nx = await region(page, "viewnext");
  if (must(!!nx, "ON TO DAWN in the view")) await tapAt(nx);
  await hold(2.0);
  await mark("ON TO DAWN");
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
log(`# scoutshots (SCOUT-1, REQ-BFG-076): ${PAGE}, Chromium ${browser.version()}; sets ${SETS.join(",")}; ${new Date().toISOString()}`);
if (SETS.includes("stills")) {
  const cells = [];
  const add = (file, label) => { if (file) cells.push({ file, label }); };
  add(await still(browser, "scout-enemy", "phone", scoutFace(1, false)), "SCOUTING: AN ENEMY PART");
  add(await still(browser, "scout-info", "phone", scoutFace(0, true)), "SCOUTING: YOUR PART, ITS ⓘ");
  add(await still(browser, "view", "phone", viewFace(0)), "VIEW BATTLEFIELD");
  add(await still(browser, "warlord-card", "phone", warlordCard), "WARLORD CARD");
  add(await still(browser, "land-scout", "land", scoutFace(1, false)), "LANDSCAPE: SCOUTING");
  add(await still(browser, "land-view", "land", viewFace(1)), "LANDSCAPE: VIEW BATTLEFIELD");
  add(await still(browser, "desk-scout", "desk", scoutFace(0, false)), "DESK: SCOUTING");
  add(await still(browser, "desk-view", "desk", viewFace(0)), "DESK: VIEW BATTLEFIELD");
  if (!ONLY && cells.length) {
    // one sheet of them all: the four phone stills (390x844 at DPR 3) across, then landscape and desk two a row
    const phone = cells.filter((c) => !/LANDSCAPE|DESK/.test(c.label));
    const land = cells.filter((c) => /LANDSCAPE/.test(c.label)), desk = cells.filter((c) => /DESK/.test(c.label));
    await sheet(browser, "sheet", "SCOUT-1: SCOUTING AND VIEW BATTLEFIELD. PHONE 390X844 DPR 3; PHONE LANDSCAPE 844X390 DPR 3; DESK 1920X1080",
      [{ w: 585, cells: phone }, { w: 1206, cells: land }, { w: 1206, cells: desk }].filter((r) => r.cells.length));
  }
}
if (SETS.includes("video")) await tour(browser);
await browser.close();
await mkdir(join(OUT, "stills"), { recursive: true });
await writeFile(join(OUT, "stills", `${PREFIX}-shots.log`), lines.join("\n") + "\n");
log(fails ? `SCOUTSHOTS: ${fails} FAILED` : "SCOUTSHOTS: OK");
process.exit(fails ? 1 : 0);
