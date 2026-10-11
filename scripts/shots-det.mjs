// 0.8.0 H1 M5: the game's own shot list (shots-list.mjs: SHOTS, VIEWS, prep) rendered DETERMINISTICALLY from a build
// directory, so two builds can be compared pixel for pixel ("Furnace and Weaver screens stay unchanged"). scripts/shot.mjs
// leaves the game's requestAnimationFrame loop running between its in-page stepping and the screenshot, and Math.random
// unpinned, so two of its runs of one build differ. Here the page's requestAnimationFrame never fires (the game moves only
// when prep and a shot's script step it, and its clock stays put), Math.random is a fixed-seed generator, and every shot
// gets a fresh page: two runs of one build are identical, pixel for pixel.
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node scripts/shots-det.mjs <build dir> <outDir>
import { chromium } from "playwright-core";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { SHOTS, VIEWS, prep } from "./shots-list.mjs";
import { autoFight } from "./scouthook.mjs"; // SCOUT-1 (REQ-BFG-076): the FIGHT step (bb.fight(true): battles skip scouting)

const [distArg, outArg] = process.argv.slice(2);
if (!distArg || !outArg) throw new Error("usage: node scripts/shots-det.mjs <build dir> <outDir>");
const DIST = resolve(distArg), OUT = resolve(outArg);
const ORIGIN = "http://bb.test";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml" };

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

/** Pick up the first affordable gate card and hold it over its suggested belt cell (shot.mjs's dragInProgress). */
async function dragInProgress(page, touch) {
  const plan = await page.evaluate(() => {
    const p = window.bb.game.screen.dragPlan();
    return p ? { a: window.bb.toClient(p.from.x, p.from.y), b: window.bb.toClient(p.to.x, p.to.y) } : null;
  });
  if (!plan) throw new Error("no drag plan");
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    const pt = (x, y) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(plan.a.x, plan.a.y) });
    for (let i = 1; i <= 10; i++) {
      const k = i / 10;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(plan.a.x + (plan.b.x - plan.a.x) * k, plan.a.y + (plan.b.y - plan.a.y) * k) });
    }
  } else {
    await page.mouse.move(plan.a.x, plan.a.y);
    await page.mouse.down();
    await page.mouse.move(plan.b.x, plan.b.y, { steps: 10 });
  }
  await page.evaluate(() => { const g = window.bb.game; for (let i = 0; i < 12; i++) g.step(1 / 60); g.render(); });
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"] });
const errors = [];
let count = 0;
for (const [vname, vopts] of Object.entries(VIEWS)) {
  const shots = SHOTS.filter(([, v]) => v === vname);
  if (!shots.length) continue;
  const ctx = await browser.newContext(vopts);
  await autoFight(ctx); // SCOUT-1: battles skip scouting, as before SCOUT-1
  await ctx.route(`${ORIGIN}/**`, serve);
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    let s = 0x9e3779b9;
    Math.random = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    window.requestAnimationFrame = () => 0; // the game moves only when a shot steps it
  });
  page.on("pageerror", (e) => errors.push(`[${vname}] pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`[${vname}] ${m.type()}: ${m.text()}`); });
  for (const [name, , screen, secs, script, special] of shots) {
    await page.goto(`${ORIGIN}/index.html`); // a fresh page for every shot: nothing carries over from the one before
    await page.waitForFunction(() => !!window.bb, null, { timeout: 10000 });
    await page.evaluate(prep, { screen, secs });
    if (script) await page.evaluate(script);
    if (special === "drag") await dragInProgress(page, !!vopts.hasTouch);
    await page.screenshot({ path: join(OUT, `${name}-${vname}.png`) });
    count++;
  }
  await ctx.close();
}
await browser.close();
console.log(`${count} shots`);
console.log(errors.length ? "ERRORS:\n" + [...new Set(errors)].join("\n") : "no console errors");
if (errors.length) process.exitCode = 1;
