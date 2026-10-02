// Runs tools/fw-digest.html in headless Chromium (0.8.0 H1): a Vite dev server and playwright-core in one process.
// Usage: PLAYWRIGHT_BROWSERS_PATH=<root>/ms-playwright node tools/fw-digest-run.mjs <out.json>
// Writes the page's { n, out } digest (sorted keys) and exits non-zero on a page error, a console error or warning, or
// a failed run.

import { createServer } from "vite";
import { chromium } from "playwright-core";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = resolve(process.argv[2] ?? "fw-digest.json");
const server = await createServer({ root: ROOT, configFile: false, logLevel: "error", server: { host: "127.0.0.1", port: 5198, strictPort: false } });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
const errors = [];
let result = null;
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  // Chromium's own hint that this page reads canvases back a lot ("willReadFrequently") is not a page problem
  page.on("console", (m) => {
    if ((m.type() === "error" || m.type() === "warning") && !/willReadFrequently/.test(m.text())) errors.push(`${m.type()}: ${m.text()}`);
  });
  await page.goto(`http://127.0.0.1:${port}/tools/fw-digest.html`);
  await page.waitForFunction(() => !!window.__digest, null, { timeout: 300000 });
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
  console.log(`${OUT}: ${result.n} entries`);
}
console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no console errors");
if (errors.length) process.exitCode = 1;
