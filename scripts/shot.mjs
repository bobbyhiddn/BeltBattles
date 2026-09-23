// Headless screenshot + metrics harness: serves dist/ through a routed fake origin, opens
// screens via window.bb and fast-forwards the game deterministically with game.step().
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node scripts/shot.mjs [outDir] [filter]
// Writes <outDir>/<name>-<view>.png and <outDir>/../metrics.json; prints console errors.

import { chromium } from "playwright-core";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { SHOTS, VIEWS, prep } from "./shots-list.mjs";
import { measure } from "./metrics.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = join(ROOT, "dist");
const OUT = resolve(process.argv[2] ?? join(ROOT, "shots"));
const filter = process.argv[3] ?? "";
const ORIGIN = "http://bb.test";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml" };

async function serve(route) {
  const url = new URL(route.request().url());
  let p = normalize(decodeURIComponent(url.pathname)).replace(/^\/+/, "");
  if (!p || p.endsWith("/")) p += "index.html";
  try {
    const body = await readFile(join(DIST, p));
    await route.fulfill({ status: 200, body, contentType: TYPES[extname(p)] ?? "application/octet-stream" });
  } catch {
    await route.fulfill({ status: 404, body: "not found" });
  }
}

/** Pick up the first affordable gate card and hold it over its suggested belt cell. */
async function dragInProgress(page, touch) {
  const plan = await page.evaluate(() => {
    const p = window.bb.game.screen.dragPlan();
    if (!p) return null;
    return { a: window.bb.toClient(p.from.x, p.from.y), b: window.bb.toClient(p.to.x, p.to.y), def: p.def };
  });
  if (!plan) throw new Error("no drag plan (no affordable gate card)");
  const steps = 10;
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    const pt = (x, y) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(plan.a.x, plan.a.y) });
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(plan.a.x + (plan.b.x - plan.a.x) * k, plan.a.y + (plan.b.y - plan.a.y) * k) });
    }
  } else {
    await page.mouse.move(plan.a.x, plan.a.y);
    await page.mouse.down();
    await page.mouse.move(plan.b.x, plan.b.y, { steps });
  }
  await page.evaluate(() => { const g = window.bb.game; for (let i = 0; i < 12; i++) g.step(1 / 60); g.render(); });
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"] });
  const errors = [];
  let count = 0;
  for (const [vname, vopts] of Object.entries(VIEWS)) {
    const shots = SHOTS.filter(([n, v]) => v === vname && `${n}-${v}`.includes(filter));
    if (!shots.length) continue;
    const ctx = await browser.newContext(vopts);
    await ctx.route(`${ORIGIN}/**`, serve);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`[${vname}] pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`[${vname}] ${m.type()}: ${m.text()}`); });
    await page.goto(`${ORIGIN}/index.html`);
    await page.waitForFunction(() => !!window.bb, null, { timeout: 10000 });
    for (const [name, , screen, secs, script, special] of shots) {
      const info = await page.evaluate(prep, { screen, secs });
      if (script) await page.evaluate(script);
      if (special === "drag") await dragInProgress(page, !!vopts.hasTouch);
      const file = join(OUT, `${name}-${vname}.png`);
      await page.screenshot({ path: file });
      count++;
      console.log(`${name}-${vname}: ${info.screen} logical ${info.W}x${info.H} @${info.scale} -> ${file}`);
    }
    await ctx.close();
  }
  if (!filter || filter === "metrics") {
    const metrics = await measure(browser, ORIGIN, serve, errors);
    const mfile = join(dirname(OUT), "metrics.json");
    await writeFile(mfile, JSON.stringify(metrics, null, 2));
    console.log(`metrics -> ${mfile}`);
  }
  await browser.close();
  console.log(`${count} shots`);
  if (errors.length) console.log("ERRORS:\n" + [...new Set(errors)].join("\n"));
  else console.log("no console errors");
}

main().catch((e) => { console.error(e); process.exit(1); });
