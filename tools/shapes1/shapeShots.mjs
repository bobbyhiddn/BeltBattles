// SHAPES-1 (REQ-BFG-086; BRIEF-SHAPES1 step 6's quick pictures, step 9's picture set): the shaped pieces on a built page,
// through window.bb's SHAPES-1 tooling (bb.shapesDemo, bb.shapeSpot, bb.carryShape): SHAPES on, a showcase deck with a
// SPIKE RAIL, a NAIL STRIP, an EMBER TROUGH, a 2x3 GANTRY PRESS and an I3 ASSEMBLY LINE placed where the bots put them;
// a carried EMBER TROUGH ghost making hits (a finger's carry on the phone: the floating ROTATE button); a NAIL STRIP
// refused over a belt; the panel faces of a placed NAIL STRIP and GANTRY PRESS; the shop's cards of the three rigs and
// GANTRY PRESS, one selected. Phone 402x690 @3 (touch) and desk 1280x800.
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node tools/shapes1/shapeShots.mjs <dist dir> <out dir> [showcase]
import { chromium } from "playwright-core";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const DIST = resolve(process.argv[2] ?? "dist");
const OUT = resolve(process.argv[3] ?? "shots-shapes1");
const SHOWCASE = process.argv[4] ?? "twobelts";
const ORIGIN = "http://bb.test";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml" };
const VIEWS = {
  phone: { viewport: { width: 402, height: 690 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  desk: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
};

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

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
  const errors = [];
  for (const [view, opts] of Object.entries(VIEWS)) {
    const ctx = await browser.newContext(opts);
    await ctx.route(`${ORIGIN}/**`, serve);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`[${view}] pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`[${view}] console: ${m.text()}`); });
    await page.goto(`${ORIGIN}/index.html`);
    await page.waitForFunction(() => !!window.bb, null, { timeout: 15000 });
    const shot = async (name, line) => {
      const file = join(OUT, `${name}-${view}.png`);
      await page.screenshot({ path: file });
      console.log(`${name}-${view}.png: ${line}`);
    };
    const placed = await page.evaluate((s) => window.bb.shapesDemo(s), SHOWCASE);
    await settle(page, 30);
    await shot("board", `showcase ${SHOWCASE} with SHAPES on: ${placed.join(", ")}`);
    const spot = await page.evaluate(() => window.bb.shapeSpot("embertrough"));
    if (spot) {
      await page.evaluate(([s, touch]) => window.bb.carryShape("embertrough", s.x, s.y, s.rot, touch), [spot, !!opts.hasTouch]);
      await settle(page, 6);
      await shot("ghost", `an EMBER TROUGH carried over (${spot.x},${spot.y}) rot ${spot.rot} (${spot.hits} hits)${opts.hasTouch ? ", a finger's carry" : ""}`);
    }
    const belt = await page.evaluate(() => { const r = window.bb.game.run.build.routes[0]; const k = r.cells[Math.min(2, r.cells.length - 1)]; return { x: k % 10, y: Math.floor(k / 10) }; });
    // a mouse's carry on both views: a finger's drop snaps to the nearest legal anchor within 1 cell (S3), so it isn't refused there
    await page.evaluate((b) => { window.bb.game.screen.ed.carry = null; window.bb.carryShape("nailstrip", b.x, b.y, 0, false); }, belt);
    await settle(page, 6);
    await shot("refused", `a NAIL STRIP carried over belt tile (${belt.x},${belt.y}): refused`);
    for (const def of ["nailstrip", "gantry"]) {
      const uid = await page.evaluate((d) => {
        const s = window.bb.game.screen;
        s.ed.carry = null;
        const p = window.bb.game.run.build.items.find((q) => q.def === d);
        if (p) s.select({ kind: "item", uid: p.uid });
        return p ? p.uid : -1;
      }, def);
      await settle(page, 6);
      if (uid >= 0) await shot(`panel-${def}`, `the placed ${def}'s panel face`);
    }
    await page.evaluate(() => {
      const s = window.bb.game.screen, run = window.bb.game.run;
      s.select({ kind: "none" });
      run.gold = 30;
      // the shop's prices as the game sets them (EMBER TROUGH 5 G since cap's ruling RUN5-SHAPES1 1.1)
      run.shop.wagons = [{ merchant: "alchemist", offers: ["nailstrip", "embertrough", "spikerail", "gantry"].map((def) => ({ def, price: { nailstrip: 4, embertrough: 5, spikerail: 6, gantry: 7 }[def], sold: false })) }];
      s.touched?.();
    });
    await settle(page, 30);
    await shot("shop", "the shop's cards: NAIL STRIP, EMBER TROUGH, SPIKE RAIL, GANTRY PRESS");
    await page.evaluate(() => window.bb.game.screen.select({ kind: "offer", wagon: 0, slot: 0 }));
    await settle(page, 6);
    await shot("offer-nailstrip", "NAIL STRIP's card selected: its panel face");
    // the battle world (FIELD-1) with the same deck: bb.open("battle") keeps the run (its classic foe), a few seconds in
    await page.evaluate(() => window.bb.open("battle"));
    await settle(page, 240);
    await shot("battle", "the battle world, 4 s in, the deck with its shaped pieces");
    await ctx.close();
  }
  await browser.close();
  console.log(errors.length ? `ERRORS:\n${[...new Set(errors)].join("\n")}` : "no console errors");
}

main().catch((e) => { console.error(e); process.exit(1); });
