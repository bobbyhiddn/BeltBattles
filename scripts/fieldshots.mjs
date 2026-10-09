// FIELD-1 (REQ-BFG-075): the battle settings' stills, from the offline single-file page (the player build), in headless
// Chromium. The page's requestAnimationFrame never fires and Math.random is pinned: the script steps the game itself
// (bb.game.step(1/60), as customshots.mjs does), so a still repeats exactly. Each battle is FURNACE's dusk on day 5 (seed
// 7, the stand-in foe), its setting forced with the page tooling bb.scene(id), stepped into the fight until shots fly
// and a carrier banks, at WIDE (the battle's camera). Sets (--only picks stills by name):
//  - settings: each of the eight settings at 390x844 DPR 3 (scene-<id>), then one contact sheet of all eight (settings);
//  - styles:   the player's carrier in each of the five styles in OPEN SEA, DESERT and SKY (style-<scene>-<style>), and the
//              contact sheet of the player's ship cropped from those fifteen (styles);
//  - camera:   the same moment at today's framing (bb.camera("close"): close) and at WIDE (wide), and the two side by side
//              (before-after);
//  - land:     desk 1920x1080 and laptop 1366x768 at WIDE, one ground and one air setting, the clock set to the player's
//              surge at its outer reach (desk-<id>, laptop-<id>);
//  - reduced:  REDUCED MOTION in an air setting (reduced-clouds).
//  - video:    (not in the default sets) three takes, one battle each from its sail-in (BASTION's day-4 dusk, seed 11, a
//              fight that lasts the 20 s), the page on its own clock: OPEN SEA (water), FOREST (ground), STORM CLOUDS
//              (air). Recorded as MOTION-2's video was (scripts/motionshots.mjs): Playwright records the page's 390x844
//              CSS px at DPR 2, then ffmpeg trims each take to its battle (21 s), crops to the page and scales it 2x
//              nearest-neighbour (780x1688): a webm and an mp4 a take, then the three joined in one mp4, <prefix>-tour.mp4
//              (water, ground, air), into <outDir>/video.
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node scripts/fieldshots.mjs <page.html> <outDir> [--only a,b] [--prefix field1]
//        [--sets settings,styles,camera,land,reduced,video] [--crf 24 (the tour's)]
// Exit 1 on a console error. Writes <outDir>/stills/<prefix>-<name>.png and <outDir>/stills/<prefix>-shots.log.
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const pos = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--")));
const PAGE = resolve(pos[0] ?? "dist/index.html");
const OUT = resolve(pos[1] ?? "shots/field");
const ONLY = opt("only", "");
const PREFIX = opt("prefix", "field1");
const SETS = opt("sets", "settings,styles,camera,land,reduced").split(",");
const VIEWS = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  desk: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  laptop: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 },
};
const SCENES = ["calm", "storm", "ember", "forest", "desert", "badlands", "sky", "clouds"];
const SCENE_NAME = { calm: "OPEN SEA", storm: "STORM SEA", ember: "EMBER SEA", forest: "FOREST", desert: "DESERT", badlands: "BADLANDS", sky: "SKY", clouds: "STORM CLOUDS" };
const MEDIUM = { calm: "WATER", storm: "WATER", ember: "WATER", forest: "GROUND", desert: "GROUND", badlands: "GROUND", sky: "AIR", clouds: "AIR" };
const STYLES = ["war", "admiral", "ironclad", "storm", "gold"];
const STYLE_NAME = { war: "WAR COLOURS", admiral: "ADMIRAL'S BLUE", ironclad: "IRONCLAD", storm: "STORMCALLER", gold: "CHAMPION'S GOLD" };
const NAME = "beltbattles.name.v1";

/** Every style open and seen, the player wearing carrier `c` (CUSTOM-3's allOpen). */
function allOpen(c) {
  const ids = { floor: ["timber", "tread", "checker", "rune"], belt: ["verdigris", "blued", "timber", "rune"], panel: ["brass", "verdigris", "timber", "plum"], carrier: STYLES.slice(1) };
  const unlocked = Object.entries(ids).flatMap(([k, v]) => v.map((id) => `style:${k}.${id}`));
  return {
    v: 1, counters: { runs: 99, runsFinished: 9, flawless: 1, duskWins: 120, bestDay: 10, warlordWins: 9, matriarchWins: 9, mostBelts: 9 },
    heroesWon: ["furnace", "weaver", "foundry", "bastion"], heroesFinished: ["furnace", "weaver", "foundry"], unlocked,
    chosen: { floor: "plate", belt: "iron", panel: "slate", carrier: c }, seen: unlocked, folded: [], runNew: null, updatedAt: 1,
  };
}

const lines = [];
const log = (s) => { lines.push(s); console.log(s); };

/** One still: a fresh page, the battle in setting `scene`, stepped to the moment; `s.camera` "close" cuts to today's
 *  framing first; `s.reach` sets the clock to the player's surge at its outer reach; returns where the player's ship is. */
async function shot(browser, s) {
  const ctx = await browser.newContext(VIEWS[s.view ?? "phone"]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.addInitScript(({ prof, name }) => {
    window.requestAnimationFrame = () => 0;
    let r = 0x2f6b9a1d;
    Math.random = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; };
    localStorage.setItem(name, "SHOTS");
    if (prof) localStorage.setItem("beltbattles.profile.v1", JSON.stringify(prof));
  }, { prof: s.carrier ? allOpen(s.carrier) : null, name: NAME });
  await page.goto(pathToFileURL(PAGE).href);
  await page.waitForFunction(() => !!window.bb && !!window.bb.game);
  const info = await page.evaluate(async (s) => {
    const bb = window.bb, g = bb.game;
    const step = (n) => { for (let i = 0; i < n; i++) g.step(1 / 60); };
    if (s.reduced) bb.setReducedMotion(true);
    bb.scene(s.scene);
    bb.openDusk({ hero: "furnace", day: 5, seed: 7 }, []);
    step(40); // the wipe
    let tries = 0;
    for (; tries < 60 * 60; tries++) {
      step(1);
      if (tries % 6) continue;
      const m = bb.motion();
      if (m.phase === "fight" && m.t > (s.minT ?? 6) && g.screen.arena.b.projectiles.length >= 2 && (s.reduced || Math.max(...m.poses.map((p) => Math.abs(p.bank))) >= 3)) break;
    }
    const mo = g.screen.motion;
    if (s.camera === "close") bb.camera("close", 0);
    if (s.reach) {
      // the player's surge at its outer reach (its furthest left) in the next 30 s of the model's own curve
      const t0 = mo.model.t;
      let best = t0, bx = Infinity;
      for (let i = 0; i < 30 * 60; i++) { const t = t0 + i / 60; const x = mo.model.offset(0, t)[0]; if (x < bx) { bx = x; best = t; } }
      mo.model.t = best;
      mo.model.dist = best * mo.model.scrollFactor();
    }
    g.render();
    const m = bb.motion();
    const scr = { ...mo.scr }, k = g.view.scale;
    // the player's ship on screen (device px): its pivot through the camera, and the art's scale
    const px = scr.a * mo.pivot[0][0] + scr.e, py = scr.d * mo.pivot[0][1] + scr.f;
    return {
      screen: bb.screen(), view: { W: g.W, H: g.H, scale: k, dpr: g.view.dpr, sub: g.view.sub ?? 1 }, t: m.t, sea: m.sea, medium: m.medium,
      camera: m.camera, shots: g.screen.arena.b.projectiles.length, bank: m.drawnBank, tries, carrier: bb.profile().wears?.carrier ?? null,
      pivot: [Math.round(px * k), Math.round(py * k)], zoom: scr.a, offset0: mo.model.offset(0), offset1: mo.model.offset(1),
    };
  }, s);
  await mkdir(join(OUT, "stills"), { recursive: true });
  const file = join(OUT, "stills", `${PREFIX}-${s.name}.png`);
  await page.screenshot({ path: file });
  const bytes = (await stat(file)).size;
  log(`still ${s.name}: ${JSON.stringify(info)}; ${bytes} B -> ${file}; console errors ${errors.length}${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  await ctx.close();
  return { errors: errors.length, info, file };
}

/** A contact sheet composed in the page from PNGs: `cells` [{file, label, crop?}], `cols` across, each cell scaled by
 *  `k` (nearest neighbour), a title on top. */
async function sheet(browser, name, title, cells, cols, k) {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 300 } });
  const page = await ctx.newPage();
  const parts = [];
  for (const c of cells) parts.push({ ...c, url: `data:image/png;base64,${(await readFile(c.file)).toString("base64")}` });
  const data = await page.evaluate(async ({ parts, cols, k, title }) => {
    const imgs = await Promise.all(parts.map((p) => new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.src = p.url; })));
    const cw = Math.round((parts[0].crop ? parts[0].crop.w : imgs[0].width) * k), ch = Math.round((parts[0].crop ? parts[0].crop.h : imgs[0].height) * k);
    const gap = 24, head = 90, foot = 60, rows = Math.ceil(parts.length / cols);
    const cv = document.createElement("canvas");
    cv.width = gap + cols * (cw + gap);
    cv.height = head + rows * (ch + foot + gap);
    const g = cv.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.fillStyle = "#050B12";
    g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = "#F6CF48";
    let fs = 40;
    for (; fs > 16; fs -= 2) { g.font = `bold ${fs}px monospace`; if (g.measureText(title).width <= cv.width - 2 * gap) break; }
    g.fillText(title, gap, 58);
    parts.forEach((p, i) => {
      const x = gap + (i % cols) * (cw + gap), y = head + Math.floor(i / cols) * (ch + foot + gap);
      const c = p.crop ?? { x: 0, y: 0, w: imgs[i].width, h: imgs[i].height };
      g.drawImage(imgs[i], c.x, c.y, c.w, c.h, x, y, cw, ch);
      g.strokeStyle = "#7A8F9A";
      g.lineWidth = 3;
      g.strokeRect(x - 2, y - 2, cw + 4, ch + 4);
      g.fillStyle = "#E9F1E5";
      g.font = "bold 34px monospace";
      g.fillText(p.label, x, y + ch + 42);
    });
    return cv.toDataURL("image/png");
  }, { parts, cols, k, title });
  const file = join(OUT, "stills", `${PREFIX}-${name}.png`);
  await writeFile(file, Buffer.from(data.split(",")[1], "base64"));
  log(`sheet ${name}: ${cells.length} cells, ${cols} across, x${k}; ${(await stat(file)).size} B -> ${file}`);
  await ctx.close();
}

/** A video take: one battle in setting `scene` from its sail-in, recorded at 390x844 CSS px (DPR 2), then trimmed to the
 *  battle, cropped and scaled 2x nearest-neighbour (webm and mp4). Returns the raw take's path and the battle's start. */
async function videoTake(browser, scene, name) {
  const dir = join(OUT, "video", "raw");
  await mkdir(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, recordVideo: { dir, size: { width: 390, height: 844 } } });
  const t0 = Date.now();
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.addInitScript((name) => localStorage.setItem(name, "VIDEO"), NAME);
  await page.goto(pathToFileURL(PAGE).href);
  await page.waitForFunction(() => !!window.bb && window.bb.screen() === "title");
  const start = (Date.now() - t0) / 1000;
  await page.evaluate((scene) => { window.bb.scene(scene); window.bb.openDusk({ hero: "bastion", day: 4, seed: 11 }, []); }, scene);
  const samples = [];
  for (let i = 0; i < 22; i++) {
    await page.waitForTimeout(1000);
    samples.push(await page.evaluate(() => { const m = window.bb.motion(); return m.on ? { t: +m.t.toFixed(2), phase: m.phase, shots: m.shots, bank: m.drawnBank, sea: m.sea, zoom: m.camera ? +m.camera.zoom.toFixed(3) : null } : null; }));
  }
  const vpath = await page.video().path();
  await ctx.close();
  const raw = join(OUT, "video", `${PREFIX}-${name}-raw.webm`);
  await rename(vpath, raw);
  log(`video ${name} (${SCENE_NAME[scene]}): recorded ${((Date.now() - t0) / 1000).toFixed(1)} s at 390x844 CSS px (DPR 2); the battle opened at ${start.toFixed(2)} s; console errors ${errors.length}${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  log(`video ${name} samples (each second: clock/phase/shots/[bank]/setting/zoom): ${samples.map((s) => s && `${s.t}/${s.phase}/${s.shots}/[${s.bank}]/${s.sea}/${s.zoom}`).join(" ")}`);
  const VF = "crop=390:844:0:0,scale=780:1688:flags=neighbor";
  const webm = join(OUT, "video", `${PREFIX}-${name}.webm`), mp4 = join(OUT, "video", `${PREFIX}-${name}.mp4`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-threads", "2", "-ss", start.toFixed(2), "-i", raw, "-t", "21", "-vf", VF, "-c:v", "libvpx", "-b:v", "5M", "-auto-alt-ref", "0", webm]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-threads", "2", "-ss", start.toFixed(2), "-i", raw, "-t", "21", "-vf", VF, "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
  for (const f of [webm, mp4]) log(`ffmpeg: ${f}: ${(await stat(f)).size} B; ${probe(f)}`);
  return { raw, start, errors: errors.length };
}

const probe = (f) => execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=width,height,codec_name,avg_frame_rate,nb_frames", "-of", "compact", f]).toString().trim().replace(/\n/g, " ");

const want = (n) => !ONLY || ONLY.split(",").includes(n);
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
log(`# fieldshots (FIELD-1, REQ-BFG-075): ${PAGE}, Chromium ${browser.version()}; sets ${SETS.join(",")}; ${new Date().toISOString()}`);
let errs = 0;
if (SETS.includes("settings")) {
  const cells = [];
  for (const id of SCENES) {
    if (!want(`scene-${id}`) && !want("settings")) continue;
    const r = await shot(browser, { name: `scene-${id}`, scene: id });
    errs += r.errors;
    cells.push({ file: r.file, label: `${SCENE_NAME[id]} (${MEDIUM[id]})` });
  }
  if (cells.length === SCENES.length && want("settings")) await sheet(browser, "settings", "FIELD-1: THE EIGHT BATTLE SETTINGS AT WIDE, MID-FIGHT (390x844, FURNACE DAY 5)", cells, 4, 0.5);
}
if (SETS.includes("styles")) {
  const cells = [];
  for (const id of ["calm", "desert", "sky"]) {
    for (const c of STYLES) {
      if (!want(`style-${id}-${c}`) && !want("styles")) continue;
      const r = await shot(browser, { name: `style-${id}-${c}`, scene: id, carrier: c });
      errs += r.errors;
      // the player's ship: the rotation canvas (212 x 194 art px) around its pivot, at the camera's scale (device px)
      const z = r.info.zoom * r.info.view.scale, w = Math.round(212 * z), h = Math.round(194 * z);
      cells.push({ file: r.file, label: `${SCENE_NAME[id]}: ${STYLE_NAME[c]}`, crop: { x: Math.max(0, r.info.pivot[0] - Math.round(106 * z)), y: Math.max(0, r.info.pivot[1] - Math.round(97 * z)), w, h } });
    }
  }
  if (cells.length === 15 && want("styles")) await sheet(browser, "styles", "FIELD-1: THE FIVE CARRIER STYLES IN EACH MEDIUM (THE PLAYER'S SHIP, WIDE)", cells, 5, 1);
}
if (SETS.includes("camera")) {
  const a = want("close") ? await shot(browser, { name: "close", scene: "desert", camera: "close" }) : null;
  const b = want("wide") ? await shot(browser, { name: "wide", scene: "desert" }) : null;
  errs += (a?.errors ?? 0) + (b?.errors ?? 0);
  if (a && b && want("before-after")) await sheet(browser, "before-after", "FIELD-1: TODAY'S FRAMING (CLOSE) AND WIDE, THE SAME MOMENT (DESERT)", [{ file: a.file, label: "CLOSE (TODAY)" }, { file: b.file, label: "WIDE (THE FIGHT)" }], 2, 0.5);
}
if (SETS.includes("land")) {
  for (const v of ["desk", "laptop"]) {
    for (const id of ["desert", "sky"]) {
      if (!want(`${v}-${id}`)) continue;
      errs += (await shot(browser, { name: `${v}-${id}`, scene: id, view: v, reach: true })).errors;
    }
  }
}
if (SETS.includes("reduced") && want("reduced-clouds")) errs += (await shot(browser, { name: "reduced-clouds", scene: "clouds", reduced: true, minT: 4 })).errors;
if (SETS.includes("video")) {
  const takes = [];
  for (const [scene, name] of [["calm", "water"], ["forest", "ground"], ["clouds", "air"]]) {
    const r = await videoTake(browser, scene, name);
    errs += r.errors;
    takes.push(r);
  }
  // the tour: the three takes' battles joined (water, ground, air), one encode from the raw takes
  const tour = join(OUT, "video", `${PREFIX}-tour.mp4`);
  const args = ["-y", "-loglevel", "error", "-threads", "2"];
  for (const t of takes) args.push("-ss", t.start.toFixed(2), "-t", "21", "-i", t.raw);
  const crop = takes.map((_, i) => `[${i}:v]crop=390:844:0:0,scale=780:1688:flags=neighbor,setsar=1,fps=25[v${i}]`).join(";");
  args.push("-filter_complex", `${crop};${takes.map((_, i) => `[v${i}]`).join("")}concat=n=${takes.length}:v=1:a=0[out]`, "-map", "[out]", "-c:v", "libx264", "-crf", opt("crf", "24"), "-pix_fmt", "yuv420p", "-movflags", "+faststart", tour);
  execFileSync("ffmpeg", args);
  log(`tour: ${tour}: ${(await stat(tour)).size} B; ${probe(tour)}`);
}
await browser.close();
log(`FIELDSHOTS ${errs ? "FAILED" : "DONE"}: console errors ${errs}`);
await writeFile(join(OUT, "stills", `${PREFIX}-shots.log`), `${lines.join("\n")}\n`);
process.exit(errs ? 1 : 0);
