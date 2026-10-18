// ART-1E (REQ-BFG-098; BRIEF-ART1E step 7) stills tooling, not shipped: tools/scale2c/scaleShots.mjs's way (a built page, window.bb,
// the page served from <dist> at http://bb.test), cut down to the pictures this job shows: PHONE only (402x690 @3, touch).
//   1. THE CARDS: the shop wagons that hold the seven new pieces, one wagon of offers at a time (each at its own price).
//   2. THE TAP PANEL: three new pieces' cards selected (their panel, its header icon), and one ⓘ view open.
//   3. THE DECK: each new piece placed beside the live rig it used to borrow (SCALE-2c's artFrom), on the build screen.
// The same script shoots both builds: BEFORE is the base (4a87691f0ce1) and AFTER the tip, each with only SCALE_RIGS set true
// (the seven ids are in ITEMS only then), so the pictures differ only where a new piece's art is drawn.
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node scripts/art1e/stills.mjs <dist dir> <out dir> <label: before|after>
import { chromium } from "playwright-core";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const DIST = resolve(process.argv[2] ?? "dist");
const OUT = resolve(process.argv[3] ?? "stills-art1e");
const LABEL = process.argv[4] ?? "after";
const ORIGIN = "http://bb.test";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml" };
const VIEW = { viewport: { width: 402, height: 690 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
/** [id, merchant, price] (sim/scale.ts SCALE_ITEMS), three wagons: the seven new pieces. */
const WAGONS = [
  [["cindermail", "ironmonger", 5], ["rotgauge", "alchemist", 5], ["leechcoil", "ironmonger", 5]],
  [["crowdpress", "tinker", 3], ["aegisspike", "tinker", 5], ["grudgerod", "scrapper", 3]],
  [["trophychain", "quartermaster", 7]],
];
/** The deck: [new piece, its former stand-in]: three pairs a row, the new piece left of the live rig it used to borrow. */
const PAIRS = [
  ["cindermail", "plateroller"], ["rotgauge", "heatjacket"], ["leechcoil", "riveter"],
  ["crowdpress", "pincer"], ["aegisspike", "braceframe"], ["grudgerod", "counterweight"],
  ["trophychain", "overclocker"],
];

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

const settle = (page, n = 20) => page.evaluate((k) => { const g = window.bb.game; for (let i = 0; i < k; i++) g.step(1 / 60); g.render(); }, n);

/** One wagon of offers on the showcase run's build screen (each at its own price). */
const wagon = (page, offers) => page.evaluate((offers) => {
  const s = window.bb.game.screen, run = window.bb.game.run;
  s.select?.({ kind: "none" });
  run.gold = 40;
  run.shop.wagons = [{ merchant: offers[0][1], offers: offers.map(([def, , price]) => ({ def, price, sold: false })) }];
  s.touched?.();
  return offers.map(([def]) => def);
}, offers);

/** The deck: the showcase run's loom and PAIRS placed three a row (x 0-1, 3-4, 6-7) on rows 0, 2 and 4, no belts; the screen made again. */
const deck = (page, pairs) => page.evaluate((pairs) => {
  const g = window.bb.game, run = g.run;
  const b = run.build;
  b.routes = [];
  b.items = b.items.filter((p) => p.uid === 1);
  let uid = 300;
  const at = [];
  pairs.forEach(([a, c], i) => {
    const x = (i % 3) * 3, y = Math.floor(i / 3) * 2;
    b.items.push({ uid: uid++, def: a, x, y }, { uid: uid++, def: c, x: x + 1, y });
    at.push(`${a}@${x},${y} ${c}@${x + 1},${y}`);
  });
  const Screen = g.screen.constructor;
  g.go(new Screen(g));
  let guard = 0;
  while (g.pending && guard++ < 600) g.step(1 / 60);
  return at;
}, pairs);

/** The new pieces turned: row 0 all seven at a quarter turn clockwise (rot 1), row 2 the three whose arrows allow it (CROWD PRESS,
 *  GRUDGE ROD, TROPHY CHAIN) at a half turn and row 4 at three quarters: the art is drawn for north and turns with the rig. */
const deckRot = (page) => page.evaluate(() => {
  const g = window.bb.game, b = g.run.build;
  b.routes = [];
  b.items = b.items.filter((p) => p.uid === 1);
  let uid = 400;
  const all = ["cindermail", "rotgauge", "leechcoil", "crowdpress", "aegisspike", "grudgerod", "trophychain"];
  const some = ["crowdpress", "grudgerod", "trophychain"];
  all.forEach((def, i) => b.items.push({ uid: uid++, def, x: i, y: 0, rot: 1 }));
  some.forEach((def, i) => b.items.push({ uid: uid++, def, x: i, y: 2, rot: 2 }));
  some.forEach((def, i) => b.items.push({ uid: uid++, def, x: i, y: 4, rot: 3 }));
  const Screen = g.screen.constructor;
  g.go(new Screen(g));
  let guard = 0;
  while (g.pending && guard++ < 600) g.step(1 / 60);
});

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
  const errors = [], report = { label: LABEL, shots: [] };
  const ctx = await browser.newContext(VIEW);
  await ctx.route(`${ORIGIN}/**`, serve);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console: ${msg.text()}`); });
  await page.goto(`${ORIGIN}/index.html`);
  try {
    await page.waitForFunction(() => !!window.bb, null, { timeout: 15000 });
  } catch (e) {
    console.log(`the page never set window.bb: ${e.message}\n${errors.join("\n")}`);
    throw e;
  }
  const shot = async (name, line) => {
    const file = join(OUT, `${name}-${LABEL}-phone.png`);
    await page.screenshot({ path: file });
    console.log(`${name}-${LABEL}-phone.png: ${line}`);
    report.shots.push({ name, file, line });
  };
  const scaleOn = await page.evaluate(() => window.bb.game.run ? null : null);
  await page.evaluate(() => window.bb.openShowcase("twobelts", "build"));
  await settle(page, 30);
  // 1. the cards
  for (let w = 0; w < WAGONS.length; w++) {
    const defs = await wagon(page, WAGONS[w]);
    await settle(page, 30);
    await shot(`cards${w + 1}`, `the shop: ${defs.join(", ")} in one wagon`);
  }
  // 2. the tap panel: the card selected (its panel), and one ⓘ view
  for (const [w, slot, def, notes] of [[0, 0, "cindermail", true], [1, 1, "aegisspike", false], [2, 0, "trophychain", false]]) {
    await wagon(page, WAGONS[w]);
    await settle(page, 20);
    await page.evaluate((slot) => window.bb.game.screen.select({ kind: "offer", wagon: 0, slot }), slot);
    await settle(page, 8);
    await shot(`panel-${def}`, `${def}'s card selected: its tap panel and header icon`);
    if (notes) {
      const opened = await page.evaluate(() => {
        const r = window.bb.game.ui.regions.filter((q) => q.id.endsWith("kw:?")).pop();
        if (r) r.onTap();
        return r ? r.id : null;
      });
      await settle(page, 8);
      if (opened) await shot(`notes-${def}`, `${def}'s card selected, its ⓘ view open (LEVELS, NOTES, KEYWORDS)`);
      else console.log(`notes-${def}-${LABEL}-phone.png: not taken (no ⓘ region)`);
    }
  }
  // 3. the deck
  await page.evaluate(() => { window.bb.game.screen.select?.({ kind: "none" }); });
  const at = await deck(page, PAIRS);
  await settle(page, 30);
  await shot("deck", `the build screen's deck: each new piece left of the live rig it used to borrow (${at.join("; ")})`);
  // the same deck, cropped to its rigs (CSS px 66,378 to 268,514), at the page's @3
  {
    const file = join(OUT, `deckzoom-${LABEL}-phone.png`);
    await page.screenshot({ path: file, clip: { x: 66, y: 378, width: 202, height: 136 } });
    console.log(`deckzoom-${LABEL}-phone.png: the deck cropped to its rigs`);
    report.shots.push({ name: "deckzoom", file, line: "the deck cropped to its rigs" });
  }
  // 4. the deck, turned
  await page.evaluate(() => window.bb.openShowcase("twobelts", "build"));
  await settle(page, 20);
  await deckRot(page);
  await settle(page, 30);
  {
    const file = join(OUT, `deckturn-${LABEL}-phone.png`);
    await page.screenshot({ path: file, clip: { x: 66, y: 378, width: 176, height: 152 } });
    console.log(`deckturn-${LABEL}-phone.png: the new pieces turned: all seven at rot 1 (top row), CROWD PRESS, GRUDGE ROD and TROPHY CHAIN at rot 2 and rot 3 (rows below)`);
    report.shots.push({ name: "deckturn", file, line: "the new pieces turned" });
  }
  void scaleOn;
  await ctx.close();
  await browser.close();
  await writeFile(join(OUT, `stills-${LABEL}.json`), JSON.stringify({ ...report, errors }, null, 1));
  console.log(`errors: ${errors.length}${errors.length ? "\n" + errors.join("\n") : ""}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
