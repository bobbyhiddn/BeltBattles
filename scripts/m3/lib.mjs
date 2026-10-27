// M3 (REQ-BFG-119): what the store scripts share: the paths, the page build, the headless browser and the way a built page is
// served at http://bb.test with EVERY other request aborted (scripts/art1e/stills.mjs serves a build the same way), so nothing
// the scripts open can reach a network. The scripts lower their own priority (nice 19), as every heavy command here must.
//   PLAYWRIGHT_BROWSERS_PATH defaults to WS/ms-playwright (the chromium that playwright-core 1.63 wants); no browser is downloaded.
import { spawnSync } from "node:child_process";
import { setPriority } from "node:os";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

try { setPriority(19); } catch { /* the caller's nice stays */ }

export const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url))); // the repo
export const WS = resolve(ROOT, ".."); // the workspace: the repo's parent (WS/tmp is scratch, WS/output-m3 is the delivery)
export const TMP = join(WS, "tmp");
export const ORIGIN = "http://bb.test";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml" };

/** `--name value` and `--flag` arguments. */
export function args(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) out[argv[i].slice(2)] = true;
      else { out[argv[i].slice(2)] = next; i++; }
    } else out._.push(argv[i]);
  }
  return out;
}

/** Runs the game's own build with the given environment into `outDir` (scratch, outside the repo). */
export function viteBuild(outDir, { config, env = {}, label = "build" } = {}) {
  const vite = join(ROOT, "node_modules", ".bin", "vite");
  const a = ["build", ...(config ? ["--config", config] : []), "--outDir", outDir, "--emptyOutDir", "--logLevel", "warn"];
  const r = spawnSync(vite, a, { cwd: ROOT, encoding: "utf8", env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`${label} failed (${r.status}):\n${r.stdout}\n${r.stderr}`);
  return outDir;
}

/** Builds the art page (scripts/m3/page, from the game's src/render) into WS/tmp/m3-page, unless it is there already. */
export function buildPage(outDir = join(TMP, "m3-page"), force = false) {
  if (force || !existsSync(join(outDir, "index.html"))) viteBuild(outDir, { config: join(ROOT, "scripts", "m3", "vite.m3.config.mjs"), label: "the art page build" });
  return outDir;
}

/** Launches headless Chromium the way heroshots.mjs does. */
export async function launch() {
  process.env.PLAYWRIGHT_BROWSERS_PATH ??= join(WS, "ms-playwright");
  const { chromium } = await import("playwright-core");
  return chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
}

/** A browser context that serves `dist` at ORIGIN and aborts every other request. `stats.aborted` lists what was refused. */
export async function servedContext(browser, dist, options = {}) {
  const ctx = await browser.newContext(options);
  const stats = { served: 0, aborted: [] };
  await ctx.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) {
      stats.aborted.push(route.request().url());
      return route.abort();
    }
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^\/+/, "");
    if (!p || p.endsWith("/")) p += "index.html";
    try {
      const body = await readFile(join(dist, p));
      stats.served++;
      await route.fulfill({ status: 200, body, contentType: TYPES[extname(p)] ?? "application/octet-stream" });
    } catch {
      await route.fulfill({ status: 404, body: "not found" });
    }
  });
  return { ctx, stats };
}

/** Opens the art page (built) in a fresh browser and returns { page, close }. */
export async function openArtPage() {
  const dist = buildPage();
  const browser = await launch();
  const { ctx, stats } = await servedContext(browser, dist, { viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  await page.goto(`${ORIGIN}/index.html`);
  await page.waitForFunction(() => !!window.m3, null, { timeout: 15000 });
  return {
    page, stats, errors,
    close: async () => { await ctx.close(); await browser.close(); if (errors.length) throw new Error(errors.join("\n")); },
  };
}

export { mkdir };
