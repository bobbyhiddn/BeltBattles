// Renders tools/wave3-art.html headless (0.8.0 A1 M3), after H1's tools/heroes-art-shot.mjs: a Vite dev server and
// playwright-core in ONE process. Usage:
//   PLAYWRIGHT_BROWSERS_PATH=<root>/ms-playwright node tools/wave3-art-shot.mjs <outDir> <name> <tag> [crop:x,y,w,h ...]
// Writes <outDir>/<name>.png (the sheet at 1x), <name>-3x.png (3x) and <name>-phone.png (the phone view, device pixels);
// crops are cut from the 3x render (3x pixel units). Exits non-zero on any page error or console error or warning.

import { createServer } from "vite";
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const [outArg, name = "wave3-art", tag = ""] = process.argv.slice(2, 5);
const OUT = resolve(outArg ?? join(ROOT, "shots"));
const crops = process.argv.slice(5).map((a) => {
  const [crop, box] = a.split(":");
  const [x, y, width, height] = box.split(",").map(Number);
  return { crop, clip: { x, y, width, height } };
});

await mkdir(OUT, { recursive: true });
const server = await createServer({ root: ROOT, configFile: false, logLevel: "error", server: { host: "127.0.0.1", port: 5196, strictPort: false } });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
const errors = [];
try {
  for (const [view, s, file] of [["sheet", 1, `${name}.png`], ["sheet", 3, `${name}-3x.png`], ["phone", 1, `${name}-phone.png`]]) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
    await page.goto(`http://127.0.0.1:${port}/tools/wave3-art.html?view=${view}&s=${s}&tag=${encodeURIComponent(tag)}`);
    await page.waitForFunction(() => window.__sheetDone === true, null, { timeout: 120000 });
    const [w, h] = await page.evaluate(() => { const c = document.getElementById("sheet"); return [c.width, c.height]; });
    await page.setViewportSize({ width: w, height: h });
    await page.screenshot({ path: join(OUT, file), clip: { x: 0, y: 0, width: w, height: h } });
    console.log(`${join(OUT, file)}: ${w}x${h}`);
    if (view === "sheet" && s === 3) {
      for (const c of crops) {
        await page.screenshot({ path: join(OUT, `${c.crop}.png`), clip: c.clip });
        console.log(`crop ${c.crop}: ${JSON.stringify(c.clip)}`);
      }
    }
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no console errors");
if (errors.length) process.exitCode = 1;
