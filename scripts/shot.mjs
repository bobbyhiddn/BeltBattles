// Headless screenshot harness: serves dist/ through a routed fake origin, opens screens
// via window.bb and fast-forwards the game deterministically with game.step().
// Usage: node scripts/shot.mjs [filter]   (writes shots/<name>.png, prints console errors)

import { chromium } from "playwright-core";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = join(ROOT, "dist");
const OUT = join(ROOT, "shots");
const ORIGIN = "http://bb.test";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml" };

const VIEWS = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  small: { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desk: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  laptop: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 },
};

// [name, view, screen, seconds to fast-forward after the wipe, optional page script]
const SHOTS = [
  ["title", "phone", "title", 1.5], ["title", "desk", "title", 1.5],
  ["hero", "phone", "hero", 0.8], ["hero", "desk", "hero", 0.8],
  ["build", "phone", "build", 0.8], ["build", "desk", "build", 0.8],
  ["build", "small", "build", 0.8], ["build", "laptop", "build", 0.8],
  ["build-offer", "desk", "build", 1.5, "bb.game.screen.select({kind:'offer',wagon:0,slot:0}); bb.game.render()"],
  ["build-offer", "phone", "build", 1.5, "bb.game.screen.select({kind:'offer',wagon:0,slot:0}); bb.game.render()"],
  ["title-help", "phone", "title", 1, "bb.game.screen.help = true; bb.game.render()"],
  ["title", "small", "title", 1.5], ["hero", "small", "hero", 0.8],
  ["battle-intro", "desk", "battle", 1.2],
  ["battle-mid", "phone", "battle", 7], ["battle-mid", "desk", "battle", 7],
  ["battle-late", "desk", "battle", 16],
  ["battle-end", "desk", "battle", 60], ["battle-end", "phone", "battle", 60],
  ["summary", "desk", "summary", 1], ["summary", "phone", "summary", 1],
];

const filter = process.argv[2] ?? "";

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

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"],
  });
  const errors = [];
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
    for (const [name, , screen, secs, script] of shots) {
      const info = await page.evaluate(({ screen, secs }) => {
        const g = window.bb.game;
        g.run = null;
        window.bb.open(screen, "furnace", 12345);
        const frames = Math.round((0.6 + secs) * 60);
        for (let i = 0; i < frames; i++) g.step(1 / 60);
        g.render();
        return { W: g.W, H: g.H, scale: g.view.scale, screen: g.screen.constructor.name };
      }, { screen, secs });
      if (script) await page.evaluate(script);
      const file = join(OUT, `${name}-${vname}.png`);
      await page.screenshot({ path: file });
      console.log(`${name}-${vname}: ${info.screen} logical ${info.W}x${info.H} @${info.scale} -> ${file}`);
    }
    await ctx.close();
  }
  await browser.close();
  if (errors.length) console.log("ERRORS:\n" + [...new Set(errors)].join("\n"));
  else console.log("no console errors");
}

main().catch((e) => { console.error(e); process.exit(1); });
