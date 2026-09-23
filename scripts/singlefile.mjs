// V4: inline the Vite build (JS + CSS) into one HTML file, then prove it loads from
// file:// in headless chromium and completes a scripted run with real input:
// buy -> place -> FIGHT -> battle end -> round summary -> ... -> run summary.
// Desk uses the mouse (drag and drop); phone uses touch taps (tap-to-select, tap-to-place).
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node scripts/singlefile.mjs <out.html> [log.txt]

import { chromium } from "playwright-core";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { VIEWS } from "./shots-list.mjs";
import { scriptedRun } from "./playthrough.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = join(ROOT, "dist");
const OUT = resolve(process.argv[2] ?? join(ROOT, "BeltBattles-single.html"));
const LOG = process.argv[3] ? resolve(process.argv[3]) : null;
const lines = [];
const log = (s) => { lines.push(s); console.log(s); };

async function inline() {
  let html = await readFile(join(DIST, "index.html"), "utf8");
  const assets = await readdir(join(DIST, "assets"));
  for (const f of assets.filter((a) => a.endsWith(".css"))) {
    const css = await readFile(join(DIST, "assets", f), "utf8");
    html = html.replace(new RegExp(`<link[^>]*href="\\./assets/${f}"[^>]*>`), () => `<style>${css}</style>`);
  }
  const scripts = assets.filter((a) => a.endsWith(".js"));
  if (scripts.length !== 1) throw new Error(`expected one JS chunk, found ${scripts.length}`);
  const js = (await readFile(join(DIST, "assets", scripts[0]), "utf8")).replace(/<\/script/gi, "<\\/script");
  const tag = new RegExp(`<script[^>]*src="\\./assets/${scripts[0]}"[^>]*></script>`);
  if (!tag.test(html)) throw new Error("module script tag not found in dist/index.html");
  html = html.replace(tag, () => `<script type="module">${js}</script>`);
  if (/src="\.\/assets\//.test(html) || /href="\.\/assets\//.test(html)) throw new Error("external asset reference left");
  await writeFile(OUT, html);
  log(`inlined ${scripts[0]} (${js.length} bytes) -> ${OUT} (${html.length} bytes)`);
}

async function main() {
  await inline();
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"] });
  const url = pathToFileURL(OUT).href;
  let failed = 0;
  for (const vname of ["desk", "phone"]) {
    const ctx = await browser.newContext(VIEWS[vname]);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
    page.on("requestfailed", (r) => errors.push(`requestfailed: ${r.url()}`));
    log(`\n== ${vname} (${VIEWS[vname].viewport.width}x${VIEWS[vname].viewport.height} @${VIEWS[vname].deviceScaleFactor}, ${VIEWS[vname].hasTouch ? "touch" : "mouse"}) ${url}`);
    try {
      await page.goto(url);
      await page.waitForFunction(() => !!window.bb && window.bb.screen() === "title", null, { timeout: 15000 });
      log(`loaded from file:// : title screen up, version ${await page.evaluate(() => window.bb.version)}`);
      await scriptedRun(page, !!VIEWS[vname].hasTouch, log);
    } catch (e) {
      failed++;
      log(`FAILED: ${e.message}`);
    }
    log(errors.length ? `console errors (${errors.length}):\n  ${errors.join("\n  ")}` : "console errors: 0");
    if (errors.length) failed++;
    await ctx.close();
  }
  await browser.close();
  log(failed ? `\nRESULT: FAIL (${failed})` : "\nRESULT: PASS (desk + phone scripted runs, no console errors)");
  if (LOG) await writeFile(LOG, lines.join("\n") + "\n");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
