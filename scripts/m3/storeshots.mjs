// M3 (REQ-BFG-119) Goal 3: the store screenshots, from real play of the plain offline build (no ghost server, so every foe is the
// game's own stand-in captain). The build is served in the page at http://bb.test and EVERY other request is aborted (page.route), so
// nothing reaches a network. Each moment is reached through the game's own screens and hooks (window.bb: regions, open*, screen), by real
// taps where the game's own flow is short (the first-run name screen and hero select, then GO), and battles step the game's own
// fixed clock (window.bb.game.step(1 / 60)), so the frames are reproducible. The page's requestAnimationFrame is off and Math.random is
// a fixed-seed generator: the game moves only when this script steps it.
//   node scripts/m3/storeshots.mjs --dist <plain build dir> --out <dir> --orient portrait|landscape [--stores apple,apple-6.3,play] [--only a,b]
//   node scripts/m3/storeshots.mjs --dist <dir> --out <dir> --probe        every moment in all four shapes (to choose the orientation)
// Writes <out>/<store>/<NN>-<moment>.png (RGB, no alpha: Apple's and Google Play's rule) and <out>/shots.json (name, size, bytes, note, and
// the requests the page tried that were aborted). Apple 6.9-inch: 1320 x 2868 (440 x 956 at 3) or 2868 x 1320. Google Play: 1080 x 1920
// (360 x 640 at 3) or 1920 x 1080 (long side at most twice the short one, so 1320 x 2868 would not be valid there).
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { args, launch, servedContext, ORIGIN } from "./lib.mjs";
import { decodePng, encodePng } from "./img.mjs";

const a = args();
const NAME = "ASHWICK"; // the player's captain: made up, 2-10 of A-Z 0-9 space hyphen, no rival's or hero's name

const VIEWS = {
  "apple-portrait": { store: "apple", viewport: { width: 440, height: 956 }, px: [1320, 2868] },
  "apple-landscape": { store: "apple", viewport: { width: 956, height: 440 }, px: [2868, 1320] },
  // Apple's screenshot page (read 2026-10-27) lists the 6.3-inch class (iPhone with Dynamic Island, medium display) as the REQUIRED iPhone size,
  // and says larger sets are scaled down when the UI is the same: if App Store Connect asks for it, this set is ready (an extra, in its own folder)
  "apple63-portrait": { store: "apple-6.3", viewport: { width: 402, height: 874 }, px: [1206, 2622] },
  "apple63-landscape": { store: "apple-6.3", viewport: { width: 874, height: 402 }, px: [2622, 1206] },
  "play-portrait": { store: "play", viewport: { width: 360, height: 640 }, px: [1080, 1920] },
  "play-landscape": { store: "play", viewport: { width: 640, height: 360 }, px: [1920, 1080] },
};

// ------------------------------------------------------------------ driving the game

/** n steps of the game's own fixed clock, then one render (so the UI regions and the canvas are the last step's). */
const frames = (page, n) => page.evaluate((k) => { const g = window.bb.game; for (let i = 0; i < k; i++) g.step(1 / 60); g.render(); }, n);
const screen = (page) => page.evaluate(() => window.bb.screen());

async function tap(page, id) {
  await frames(page, 2);
  const p = await page.evaluate((i) => {
    const r = window.bb.regions().filter((q) => q.id === i).pop();
    return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : null;
  }, id);
  if (!p) throw new Error(`no tap target "${id}" on ${await screen(page)}`);
  await page.touchscreen.tap(p.x, p.y);
  await frames(page, 6);
}

/** Steps until `test` (a function body over `g` = the game) holds, at most `max` frames; returns the frames taken or -1. */
const until = (page, test, max = 900) => page.evaluate(({ test, max }) => {
  const g = window.bb.game, t = new Function("g", `return (${test});`);
  let n = 0;
  for (; n < max && !t(g); n++) g.step(1 / 60);
  g.render();
  return n < max ? n : -1;
}, { test, max });

// ------------------------------------------------------------------ the moments, in the order they appear in the store listing

/** [id, what it shows, how to reach it]. Each `run` starts from where the one before it left the page. */
const MOMENTS = [
  ["hero", "hero select: the captains on offer (a real tap on NEW RUN, the first-run name screen typed through, then hero select)", async (page) => {
    await tap(page, "new");
    await page.waitForSelector("#bb-name-input", { timeout: 10000 });
    await page.fill("#bb-name-input", NAME);
    await page.press("#bb-name-input", "Enter");
    if ((await until(page, 'window.bb.screen() === "hero" && !g.transitioning', 600)) < 0) throw new Error("hero select never came");
    await frames(page, 60);
  }],
  ["dawn", "the dawn caravan with its offers (a real tap on GO from hero select, then on a free rune)", async (page) => {
    await tap(page, "go");
    if ((await until(page, 'window.bb.screen() === "build" && !g.transitioning', 600)) < 0) throw new Error("the dawn never came");
    await frames(page, 60);
    await tap(page, "runepick-0"); // the first free rune opens its card, TAKE takes it
    await frames(page, 20);
    await tap(page, "runepick-take");
    await frames(page, 30);
    if ((await until(page, "g.screen.caravan && g.screen.caravan.ready", 900)) < 0) throw new Error("the caravan never arrived");
    await frames(page, 300); // the "RUNE TAKEN" line has faded
  }],
  ["deck", "a full deck: belts feeding three turrets, rigs beside the belts, cards in the shop (the game's own showcase deck, at the dawn of day 3)", async (page) => {
    await page.evaluate(() => window.bb.openShowcase("twobelts", "build"));
    await frames(page, 150);
  }],
  ["battle", "a battle in full swing: two cruisers trading fire, damage numbers over both (the dusk fight at 14 s of the game's own clock)", async (page) => {
    await page.evaluate(() => { window.bb.scene("sky"); window.bb.openShowcase("twobelts", "battle"); });
    await frames(page, 60);
    if ((await until(page, 'window.bb.screen(true) === "fight"', 1500)) < 0) throw new Error("the fight never started");
    if ((await until(page, "g.screen.arena.b.t >= 14", 4000)) < 0) throw new Error("the fight never reached 14 s");
  }],
  ["road", "the road choice: three warlords to fight, easy, medium or hard, with their decks (a stop selected)", async (page) => {
    await page.evaluate(() => { window.bb.scene(null); window.bb.openFork({ hero: "furnace", seed: 4242, day: 4, wins: 3, losses: 0, lives: 8 }); });
    await frames(page, 90);
    await page.evaluate(() => { window.bb.game.screen.sel = 1; });
    await frames(page, 20);
  }],
  ["won", "RUN WON: ten dusk fights won, flawless, with CONTINUE ENDLESS", async (page) => {
    await page.evaluate(() => window.bb.openEnd({ results: "WWWWWWWWWW", seed: 99 }));
    await frames(page, 150);
  }],
];

// ------------------------------------------------------------------ one view

async function shoot(browser, dist, vname, view, out, onlyIds) {
  const { ctx, stats } = await servedContext(browser, dist, { viewport: view.viewport, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    let s = 0x9e3779b9;
    Math.random = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    window.requestAnimationFrame = () => 0; // the game moves only when this script steps it
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  await page.goto(`${ORIGIN}/index.html`);
  await page.waitForFunction(() => !!window.bb, null, { timeout: 15000 });
  await page.evaluate(() => { window.bb.setReducedMotion(false); window.bb.clearPool(); window.bb.tips("done"); });
  await frames(page, 30);
  const done = [];
  for (const [i, [id, note, run]] of MOMENTS.entries()) {
    await run(page);
    if (a.debug) console.log(`${vname}/${id}: screen ${await screen(page)}; regions: ${await page.evaluate(() => window.bb.regions().map((r) => r.id).join(" "))}`);
    if (onlyIds && !onlyIds.includes(id)) continue;
    const buf = await page.screenshot({ type: "png" });
    const im = decodePng(buf);
    if (im.w !== view.px[0] || im.h !== view.px[1]) throw new Error(`${vname}/${id}: ${im.w}x${im.h}, wanted ${view.px.join("x")}`);
    for (let k = 3; k < im.data.length; k += 4) if (im.data[k] !== 255) throw new Error(`${vname}/${id}: a see-through pixel`);
    const dir = join(out, view.store);
    await mkdir(dir, { recursive: true });
    const file = `${String(i + 1).padStart(2, "0")}-${id}.png`;
    const png = encodePng(im, { alpha: false });
    await writeFile(join(dir, file), png);
    done.push({ store: view.store, file: `${view.store}/${file}`, moment: id, note, width: im.w, height: im.h, colorType: 2, bytes: png.length });
  }
  await ctx.close();
  return { done, errors, aborted: stats.aborted };
}

async function main() {
  const dist = resolve(a.dist ?? "dist");
  const out = resolve(a.out ?? "shots");
  const names = a.probe ? Object.keys(VIEWS) : Object.keys(VIEWS).filter((n) => n.endsWith(a.orient ?? "portrait") && (a.stores ?? "apple,play").split(",").includes(VIEWS[n].store));
  const onlyIds = typeof a.only === "string" ? a.only.split(",") : null;
  const browser = await launch();
  const all = [], errors = [], aborted = new Set();
  try {
    for (const n of names) {
      const o = a.probe ? join(out, n) : out;
      const r = await shoot(browser, dist, n, VIEWS[n], o, onlyIds);
      all.push(...r.done);
      errors.push(...r.errors.map((e) => `[${n}] ${e}`));
      r.aborted.forEach((u) => aborted.add(u));
      console.log(`${n}: ${r.done.map((d) => d.file).join(", ")}`);
    }
  } finally {
    await browser.close();
  }
  await mkdir(out, { recursive: true });
  await writeFile(join(out, "shots.json"), JSON.stringify({ name: NAME, shots: all, errors, abortedRequests: [...aborted] }, null, 1));
  console.log(`${all.length} shots; console errors: ${errors.length}; requests aborted: ${aborted.size}`);
  if (errors.length) { console.log(errors.join("\n")); process.exitCode = 1; }
}
main().catch((e) => { console.error(e); process.exit(1); });
