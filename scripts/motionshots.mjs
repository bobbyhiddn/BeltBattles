// MOTION-1 (REQ-BFG-071): the battles-in-motion prototype's stills and battle video, from a VITE_MOTION=1 page (the
// offline single-file page, or a build's index.html), in headless Chromium.
//  stills: phone portrait 390x844 at DPR 3, one PNG per sea (CALM day 2, STORM day 5, EMBER day 9), each mid-battle
//          with shots in flight and a carrier banked at least 4 degrees; then reduce motion (STORM) and a 1280x720
//          landscape still. The page's requestAnimationFrame never fires: the script steps the game itself
//          (bb.game.step(1/60), as scripts/shots-det.mjs does) with Math.random pinned, so a still repeats exactly.
//  video:  Playwright's recordVideo of one battle from its start (about 20 s), the page running on its own clock, at
//          780x1688 (390x844 at DPR 2), then trimmed to the battle by ffmpeg (and an H.264 mp4) when ffmpeg exists.
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node scripts/motionshots.mjs <page.html> <outDir> [stills|video|all] [--seed N]
import { chromium } from "playwright-core";
import { mkdir, writeFile, rename, readdir, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const pos = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--")));
const PAGE = resolve(pos[0] ?? "dist-motion/index.html");
const OUT = resolve(pos[1] ?? "shots/motion");
const MODE = pos[2] ?? "all";
const SEED = Number(opt("seed", "7"));
const HERO = opt("hero", "furnace");
const lines = [];
const log = (s) => { lines.push(s); console.log(s); };
const url = (q = "") => pathToFileURL(PAGE).href + q;

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const LAND = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 };

/** Freeze the page's own loop and pin Math.random: the script steps the game, so the pixels repeat. */
const FREEZE = () => {
  window.requestAnimationFrame = () => 0;
  let s = 0x2f6b9a1d;
  Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
};

async function still(browser, name, view, day, q, setup) {
  const ctx = await browser.newContext(view);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.addInitScript(FREEZE);
  await page.goto(url(q));
  await page.waitForFunction(() => !!window.bb && !!window.bb.game);
  const info = await page.evaluate(async ({ day, seed, hero, setup }) => {
    const bb = window.bb, g = bb.game;
    if (setup === "reduced") bb.setReducedMotion(true);
    bb.openDusk({ hero, day, seed }, []);
    const step = (n) => { for (let i = 0; i < n; i++) g.step(1 / 60); };
    step(40); // the wipe
    let tries = 0, m = bb.motion();
    // into the fight, then on until shots fly and a carrier is banked (reduce motion: shots only)
    for (; tries < 60 * 60; tries++) {
      step(1);
      if (tries % 6) continue;
      m = bb.motion();
      const shots = g.screen.arena.b.projectiles.length;
      if (!m.on) { if (tries > 60 * 8 && shots >= 2) break; continue; } // ?motion=0: the motion-base look, same moment
      // the model's pose (drawnBank is set when a frame is drawn, and this loop steps without drawing)
      const banked = setup === "reduced" || Math.max(...m.poses.map((p) => Math.abs(p.bank))) >= 4;
      if (m.phase === "fight" && m.t > 6 && m.shots >= 2 && banked) break;
    }
    g.render();
    m = bb.motion();
    const shots = g.screen.arena.b.projectiles.length;
    return { tries, t: m.t ?? tries / 60, sea: m.sea ?? "(floor)", phase: m.phase ?? g.screen.phase, shots, bank: m.drawnBank ?? [], gap: m.gap ?? "-", reduced: m.reduced ?? bb.settings.reducedMotion, view: { W: g.W, H: g.H, scale: g.view.scale, dpr: g.view.dpr } };
  }, { day, seed: SEED, hero: HERO, setup });
  const file = join(OUT, "stills", `${name}.png`);
  await page.screenshot({ path: file });
  const bytes = (await stat(file)).size;
  log(`still ${name}: day ${day}${q ? ` ${q}` : ""}, sea ${info.sea}, ${info.phase} at motion t ${info.t.toFixed(2)} s, ${info.shots} shots in flight, drawn bank [${info.bank.join(", ")}] deg, gap ${info.gap} px, reduced ${info.reduced}; logical ${info.view.W}x${info.view.H} at scale ${info.view.scale} (DPR ${info.view.dpr}); ${bytes} B -> ${file}; console errors ${errors.length}${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  await ctx.close();
  return errors.length;
}

async function video(browser) {
  const dir = join(OUT, "video", "raw");
  await mkdir(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, recordVideo: { dir, size: { width: 780, height: 1688 } } });
  const t0 = Date.now();
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url());
  await page.waitForFunction(() => !!window.bb && window.bb.screen() === "title");
  const start = (Date.now() - t0) / 1000;
  await page.evaluate(({ seed, hero }) => window.bb.openDusk({ hero, day: 5, seed }, []), { seed: SEED, hero: HERO });
  const samples = [];
  for (let i = 0; i < 22; i++) {
    await page.waitForTimeout(1000);
    samples.push(await page.evaluate(() => { const m = window.bb.motion(); return m.on ? { t: +m.t.toFixed(2), phase: m.phase, shots: m.shots, bank: m.drawnBank } : null; }));
  }
  const vpath = await page.video().path();
  await ctx.close();
  const raw = join(OUT, "video", "motion1-battle-raw.webm");
  await rename(vpath, raw);
  log(`video: recorded ${((Date.now() - t0) / 1000).toFixed(1)} s at 780x1688 (390x844 @2); the battle opened at ${start.toFixed(2)} s; page errors ${errors.length}`);
  log(`video samples (each second: motion clock, phase, shots in flight, drawn bank): ${samples.map((s) => s && `${s.t}/${s.phase}/${s.shots}/[${s.bank}]`).join(" ")}`);
  const webm = join(OUT, "video", "motion1-battle.webm"), mp4 = join(OUT, "video", "motion1-battle.mp4");
  try {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", start.toFixed(2), "-i", raw, "-t", "21", "-c:v", "libvpx", "-b:v", "3M", webm]);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", webm, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", mp4]);
    log(`ffmpeg: trimmed from ${start.toFixed(2)} s to ${webm} and made ${mp4} (H.264)`);
  } catch (e) {
    await rename(raw, webm);
    log(`ffmpeg failed or missing (${e.message.split("\n")[0]}): kept the untrimmed recording as ${webm}`);
  }
  return errors.length;
}

await mkdir(join(OUT, "stills"), { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
let bad = 0;
log(`motionshots ${MODE} on ${PAGE}, seed ${SEED}, hero ${HERO}, ${new Date().toISOString()}`);
if (MODE === "stills" || MODE === "all") {
  bad += await still(browser, "calm-day2", PHONE, 2, "", "");
  bad += await still(browser, "storm-day5", PHONE, 5, "", "");
  bad += await still(browser, "ember-day9", PHONE, 9, "", "");
  bad += await still(browser, "storm-day5-reduced-motion", PHONE, 5, "", "reduced");
  bad += await still(browser, "storm-day5-landscape-1280x720", LAND, 5, "", "");
  bad += await still(browser, "storm-day5-motion-off", PHONE, 5, "?motion=0", "off");
}
if (MODE === "video" || MODE === "all") bad += await video(browser);
await browser.close();
await writeFile(join(OUT, `motionshots-${MODE}.log`), lines.join("\n") + "\n");
process.exit(bad ? 1 : 0);
