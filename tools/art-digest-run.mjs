// Runs tools/art-digest.html (0.8.0 A1 M0: the all-existing-art digest) in headless Chromium: a Vite dev server and
// playwright-core in one process (after H1's tools/fw-digest-run.mjs).
// Usage: PLAYWRIGHT_BROWSERS_PATH=<root>/ms-playwright node tools/art-digest-run.mjs <out.json>
// Writes the page's { n, out } digest (sorted keys) and exits non-zero on a page error, a console error or warning, or a
// failed run.

import { createServer } from "vite";
import { chromium } from "playwright-core";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = resolve(process.argv[2] ?? "art-digest.json");
const server = await createServer({ root: ROOT, configFile: false, logLevel: "error", server: { host: "127.0.0.1", port: 5197, strictPort: false } });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
const errors = [];
let result = null;
const t0 = Date.now();
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  // Chromium's own hint that this page reads canvases back a lot ("willReadFrequently") is not a page problem
  page.on("console", (m) => {
    if ((m.type() === "error" || m.type() === "warning") && !/willReadFrequently/.test(m.text())) errors.push(`${m.type()}: ${m.text()}`);
  });
  await page.goto(`http://127.0.0.1:${port}/tools/art-digest.html`);
  await page.waitForFunction(() => !!window.__digest, null, { timeout: 900000, polling: 500 });
  result = await page.evaluate(() => window.__digest);
  await page.close();
} finally {
  await browser.close();
  await server.close();
}
if (!result?.ok) errors.push(`digest failed: ${result?.error}`);
else {
  const sorted = Object.fromEntries(Object.keys(result.out).sort().map((k) => [k, result.out[k]]));
  await writeFile(OUT, JSON.stringify({ n: result.n, out: sorted }, null, 1) + "\n");
  console.log(`${OUT}: ${result.n} entries (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no console errors");
if (errors.length) process.exitCode = 1;
