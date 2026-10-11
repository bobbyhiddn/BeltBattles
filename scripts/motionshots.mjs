// MOTION-1 (REQ-BFG-071) made this for the prototype; MOTION-2 for the shipping build: the stills and the battle video of
// battles in motion, from the offline single-file page (the player build: no dev knobs are needed), in headless Chromium.
//  stills: phone portrait 390x844 at DPR 3 unless named otherwise: a battle in each sea (CALM day 2, STORM day 5, EMBER
//          day 9), each mid-battle with shots in flight and a carrier banked at least 4 degrees; a REDUCED MOTION battle;
//          the title's attract fight; the build screen on the day's sea; the run summary; a replay frame; the longer bow
//          and taller stern before (--before <MOTION-1's page>) and after; and a 1280x720 landscape battle and build
//          screen. The page's requestAnimationFrame never fires: the script steps the game itself (bb.game.step(1/60), as
//          scripts/shots-det.mjs does) with Math.random pinned, so a still repeats exactly.
//  video:  Playwright's recordVideo of one battle from its start (about 20 s), the page running on its own clock. MOTION-2
//          (brief 2.6) folds kit-motion/videofix.sh in: Playwright captures CSS px (390x844 whatever the DPR) and only
//          scales down, so the script records at 390x844 and ffmpeg trims it to the battle and scales it 2x nearest-
//          neighbour (the pixel art stays crisp) to its final 780x1688, VP8 webm and H.264 mp4, in one step.
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node scripts/motionshots.mjs <page.html> <outDir> [stills|video|all]
//          [--hero H --day D --seed N (the video's battle)] [--before <MOTION-1 page.html>]
import { chromium } from "playwright-core";
import { mkdir, writeFile, rename, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { autoFight } from "./scouthook.mjs"; // SCOUT-1 (REQ-BFG-076): the FIGHT step (bb.fight(true): battles skip scouting)

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const pos = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--")));
const PAGE = resolve(pos[0] ?? "dist/index.html");
const OUT = resolve(pos[1] ?? "shots/motion");
const MODE = pos[2] ?? "all";
const STILL_SEED = 7, STILL_HERO = "furnace";
const SEED = Number(opt("seed", "11"));
const HERO = opt("hero", "bastion");
const DAY = Number(opt("day", "4")); // the video's day (STORM: 4-7); scripts/motionpick.mjs finds a long fight with early shots
const BEFORE = opt("before", "");
const lines = [];
const log = (s) => { lines.push(s); console.log(s); };

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const LAND = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 };

/** Freeze the page's own loop and pin Math.random: the script steps the game, so the pixels repeat. */
const FREEZE = () => {
  window.requestAnimationFrame = () => 0;
  let s = 0x2f6b9a1d;
  Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
};

/** One still. `scene`: dusk | title | dawn | end | replay; `fight`: step on until the fight shows shots (and a bank). */
async function still(browser, name, view, scene, o = {}) {
  const page0 = o.page ?? PAGE;
  const ctx = await browser.newContext(view);
  await autoFight(ctx); // SCOUT-1: battles skip scouting, as before SCOUT-1
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.addInitScript(FREEZE);
  await page.goto(pathToFileURL(page0).href);
  await page.waitForFunction(() => !!window.bb && !!window.bb.game);
  const info = await page.evaluate(async ({ scene, day, seed, hero, reduced, secs }) => {
    const bb = window.bb, g = bb.game;
    if (reduced) bb.setReducedMotion(true);
    const step = (n) => { for (let i = 0; i < n; i++) g.step(1 / 60); };
    if (scene === "dusk") bb.openDusk({ hero, day, seed }, []);
    else if (scene === "title") bb.open("title");
    else if (scene === "dawn") bb.openDawn({ hero, day, seed }, []);
    else if (scene === "end") bb.openEnd({ hero, seed, results: "WWWWWWWWWW" }, []);
    else if (scene === "replay") bb.openReplay({ hero, day, seed });
    step(40); // the wipe
    let tries = 0, m = bb.motion();
    if (scene === "dusk" || scene === "replay") {
      // into the fight, then on until shots fly and a carrier is banked (reduce motion: shots only)
      for (; tries < 60 * 60; tries++) {
        step(1);
        if (tries % 6) continue;
        m = bb.motion();
        const shots = g.screen.arena.b.projectiles.length;
        if (!m.poses) { if (tries > 60 * 8 && shots >= 2) break; continue; }
        const banked = reduced || Math.max(...m.poses.map((p) => Math.abs(p.bank))) >= 4;
        const fight = scene === "replay" ? !g.screen.over : m.phase === "fight";
        if (fight && m.t > 6 && shots >= 2 && banked) break;
      }
    } else step(Math.round(60 * secs));
    g.render();
    m = bb.motion();
    const a = g.screen.arena;
    return {
      tries, t: m.t ?? null, sea: m.sea ?? null, phase: m.phase ?? bb.screen(), screen: bb.screen(), shots: a ? a.b.projectiles.length : 0,
      bank: m.drawnBank ?? [], gap: m.gap ?? "-", reduced: bb.settings.reducedMotion, day: g.run ? g.run.day : null,
      view: { W: g.W, H: g.H, scale: g.view.scale, dpr: g.view.dpr },
    };
  }, { scene, day: o.day ?? 5, seed: o.seed ?? STILL_SEED, hero: o.hero ?? STILL_HERO, reduced: !!o.reduced, secs: o.secs ?? 2 });
  const file = join(OUT, "stills", `${name}.png`);
  await page.screenshot({ path: file });
  const bytes = (await stat(file)).size;
  log(`still ${name}: ${info.screen} (${scene}${info.day ? `, run day ${info.day}` : ""}), sea ${info.sea ?? "-"}, ${info.phase} at motion t ${info.t === null ? "-" : info.t.toFixed(2)} s, ${info.shots} shots in flight, drawn bank [${info.bank.join(", ")}] deg, gap ${info.gap} px, reduced ${info.reduced}; logical ${info.view.W}x${info.view.H} at scale ${info.view.scale} (DPR ${info.view.dpr}); ${bytes} B -> ${file}${page0 !== PAGE ? ` (page ${page0})` : ""}; console errors ${errors.length}${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  await ctx.close();
  return errors.length;
}

async function video(browser) {
  const dir = join(OUT, "video", "raw");
  await mkdir(dir, { recursive: true });
  // record what Playwright can: the page's 390x844 CSS px (at DPR 2), then scale it in this script (below)
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, recordVideo: { dir, size: { width: 390, height: 844 } } });
  await autoFight(ctx); // SCOUT-1: battles skip scouting, as before SCOUT-1
  const t0 = Date.now();
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(pathToFileURL(PAGE).href);
  await page.waitForFunction(() => !!window.bb && window.bb.screen() === "title");
  const start = (Date.now() - t0) / 1000;
  await page.evaluate(({ seed, hero, day }) => window.bb.openDusk({ hero, day, seed }, []), { seed: SEED, hero: HERO, day: DAY });
  log(`video battle: ${HERO} dusk, day ${DAY}, seed ${SEED}`);
  const samples = [];
  for (let i = 0; i < 22; i++) {
    await page.waitForTimeout(1000);
    samples.push(await page.evaluate(() => { const m = window.bb.motion(); return m.on ? { t: +m.t.toFixed(2), phase: m.phase, shots: m.shots, bank: m.drawnBank, sea: m.sea } : null; }));
  }
  const vpath = await page.video().path();
  await ctx.close();
  const raw = join(OUT, "video", "motion2-battle-raw.webm");
  await rename(vpath, raw);
  log(`video: recorded ${((Date.now() - t0) / 1000).toFixed(1)} s at 390x844 CSS px (DPR 2); the battle opened at ${start.toFixed(2)} s; page errors ${errors.length}`);
  log(`video samples (each second: motion clock, phase, shots in flight, drawn bank, sea): ${samples.map((s) => s && `${s.t}/${s.phase}/${s.shots}/[${s.bank}]/${s.sea}`).join(" ")}`);
  // MOTION-2: kit-motion/videofix.sh folded in: trim to the battle, crop to the page, scale 2x nearest-neighbour
  const VF = "crop=390:844:0:0,scale=780:1688:flags=neighbor";
  const webm = join(OUT, "video", "motion2-battle.webm"), mp4 = join(OUT, "video", "motion2-battle.mp4");
  try {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-threads", "2", "-ss", start.toFixed(2), "-i", raw, "-t", "21", "-vf", VF, "-c:v", "libvpx", "-b:v", "5M", "-auto-alt-ref", "0", webm]);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-threads", "2", "-ss", start.toFixed(2), "-i", raw, "-t", "21", "-vf", VF, "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
    for (const f of [webm, mp4]) {
      const probe = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=width,height,codec_name,avg_frame_rate,nb_frames", "-of", "compact", f]).toString().trim().replace(/\n/g, " ");
      log(`ffmpeg: ${f}: ${(await stat(f)).size} B; ${probe}`);
    }
  } catch (e) {
    log(`ffmpeg failed or missing (${e.message.split("\n")[0]}): the raw recording stays at ${raw}`);
    return errors.length + 1;
  }
  return errors.length;
}

/** Side by side (ffmpeg hstack), for the before-and-after pair. */
function pair(a, b, out) {
  try {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", a, "-i", b, "-filter_complex", "hstack", out]);
    log(`pair: ${out} = ${a} | ${b}`);
  } catch (e) {
    log(`pair failed: ${e.message.split("\n")[0]}`);
  }
}

await mkdir(join(OUT, "stills"), { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
let bad = 0;
log(`motionshots ${MODE} on ${PAGE}, ${new Date().toISOString()}`);
if (MODE === "stills" || MODE === "all") {
  bad += await still(browser, "calm-day2", PHONE, "dusk", { day: 2 });
  bad += await still(browser, "storm-day5", PHONE, "dusk", { day: 5 });
  bad += await still(browser, "ember-day9", PHONE, "dusk", { day: 9 });
  bad += await still(browser, "storm-day5-reduced-motion", PHONE, "dusk", { day: 5, reduced: true });
  bad += await still(browser, "title", PHONE, "title", { secs: 5 });
  bad += await still(browser, "build-day5", PHONE, "dawn", { day: 5, secs: 1 });
  bad += await still(browser, "summary", PHONE, "end", { secs: 1 });
  bad += await still(browser, "replay-day5", PHONE, "replay", { day: 5 });
  bad += await still(browser, "storm-day5-landscape-1280x720", LAND, "dusk", { day: 5 });
  bad += await still(browser, "build-day5-landscape-1280x720", LAND, "dawn", { day: 5, secs: 1 });
  if (BEFORE) {
    // the longer bow and taller stern (REVIEW-MOTION1 Q2): the same battle at the same moment, MOTION-1's ship then this one
    bad += await still(browser, "bowstern-before-motion1", PHONE, "dusk", { day: 5, page: resolve(BEFORE) });
    bad += await still(browser, "bowstern-after-motion2", PHONE, "dusk", { day: 5 });
    pair(join(OUT, "stills", "bowstern-before-motion1.png"), join(OUT, "stills", "bowstern-after-motion2.png"), join(OUT, "stills", "bowstern-before-after.png"));
  }
}
if (MODE === "video" || MODE === "all") bad += await video(browser);
await browser.close();
await writeFile(join(OUT, `motionshots-${MODE}.log`), lines.join("\n") + "\n");
process.exit(bad ? 1 : 0);
