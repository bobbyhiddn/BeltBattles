// SCALE-2c (REQ-BFG-098, REQ-BFG-089, REQ-BFG-087, REQ-BFG-100 C7-C9 and C11; BRIEF-SCALE2c section 8) tooling, not shipped:
// the stills on a built page through window.bb, phone (402x690 @3, touch) and desk (1920x1080). The same script shoots any
// build: AFTER is the tip built with only SCALE_RIGS set true; BEFORE is live-099 (0.9.9 as live).
// 1. THE CARDS: a showcase run's build screen, one wagon of three offers at a time (after: the 12 in four wagons; before:
//    QUENCH TANK, IRON WALL and POWDER KEG), then (after only) KINDLING's and CINDER MAIL's cards selected and their ⓘ view
//    open (LEVELS, NOTES, KEYWORDS): a rework and a new piece.
// 2. THE FIGHT (after only): the live dusk tools/scale2c/scaleMoment.ts picked (`top[pick]`): bb.openDusk(run spec), then
//    the run's deck and a stored stand-in foe set from moment.json and the battle screen made again (its own constructor:
//    screens/battle.ts reads run.build and the stored foe), stepped frame by frame (1X) to the moment's tick plus `extra`
//    frames: C7 on your row, C8 on the keg (and SPALL CATCHER's gun), C9 after your name, a reader's +n pop. Then C7's
//    and the keg badge's taps. Logged: the counters drawn, the plate's name, the pops alive.
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node tools/scale2c/scaleShots.mjs <dist dir> <out dir> <label> [moment.json] [pick] [extra]
import { chromium } from "playwright-core";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const DIST = resolve(process.argv[2] ?? "dist");
const OUT = resolve(process.argv[3] ?? "shots-scale2c");
const LABEL = process.argv[4] ?? "after";
const MOMENT = process.argv[5];
const PICK = Number(process.argv[6] ?? 0);
const EXTRA = Number(process.argv[7] ?? 6);
const ORIGIN = "http://bb.test";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml" };
const VIEWS = {
  phone: { viewport: { width: 402, height: 690 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  desk: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
};
/** [id, merchant, price] (the brief's table; the reworks keep the live prices) */
const WAGONS = LABEL === "before"
  ? [[["quench", "alchemist", 4], ["shieldwall", "ironmonger", 10], ["keg", "scrapper", 4]]]
  : [
    [["quench", "alchemist", 4], ["pressure", "gunsmith", 4], ["shieldwall", "ironmonger", 10]],
    [["spallcatcher", "quartermaster", 5], ["keg", "scrapper", 4], ["cindermail", "ironmonger", 5]],
    [["rotgauge", "alchemist", 5], ["leechcoil", "ironmonger", 5], ["crowdpress", "tinker", 3]],
    [["aegisspike", "tinker", 5], ["grudgerod", "scrapper", 3], ["trophychain", "quartermaster", 7]],
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

/** The live dusk with the picked decks (bb.openDusk, then the run's deck and a stored stand-in foe, the screen made again). */
const openLive = (page, m) => page.evaluate((m) => {
  const bb = window.bb, g = bb.game;
  bb.openDusk({ hero: m.run.hero, day: m.run.day, seed: m.run.seed, wins: m.run.wins, lives: m.run.lives }, []);
  let guard = 0;
  while (g.pending && guard++ < 600) g.step(1 / 60);
  const Screen = g.screen.constructor;
  g.run.build = structuredClone(m.a);
  g.run.dusk = { day: m.run.day, kind: "standin", name: "STAND-IN", hero: m.b.hero, build: structuredClone(m.b) };
  g.go(new Screen(g));
  guard = 0;
  while (g.pending && guard++ < 600) g.step(1 / 60);
  return g.screen.arena.b.record.seed === m.seed;
}, m);

/** Step the live fight (1X, frame by frame): to `tick` plus `extra` frames ("moment"), or ("badge") until the keg has 6 or
 *  more hits and 3 or more hits are on you, then on to a frame with 6 or fewer numbers alive (at most 240 frames past
 *  that, never past the fight's end); then what the frame shows. Each mode on a fresh live dusk (openLive). */
const stepLive = (page, mode, tick, extra) => page.evaluate(([mode, tick, extra]) => {
  const bb = window.bb, g = bb.game, s = g.screen, a = s.arena;
  const keg = () => a.b.sides[0].gates.find((q) => q.def.id === "keg");
  // the re-pick (one, as the brief allows): pops live in the board's rest frame and are drawn through its transform, so a
  // screen-box test against the badge can't be made from here; the frame with the fewest numbers alive (3 or fewer) is
  // the clear one
  const clear = () => !!s.counters.last.badges.find((q) => q.kind === "rig") && a.fx.popCount <= 6;
  let guard = 0;
  if (mode === "moment") {
    while (a.b.ticks < tick && !a.b.over && guard++ < 40000) g.step(1 / 60);
    for (let i = 0; i < extra; i++) g.step(1 / 60);
    g.render();
  } else {
    while (!a.b.over && guard++ < 40000 && !((keg()?.ownHits ?? 0) >= 6 && (a.b.sides[0].hitsTaken ?? 0) >= 3)) g.step(1 / 60);
    let more = 0;
    g.render();
    while (!a.b.over && more++ < 240 && !clear()) { g.step(1 / 60); g.render(); }
  }
  const c = bb.counters(), fx = a.fx, live = fx.popList.slice(0, fx.popCount);
  return {
    ticks: a.b.ticks, t: +a.b.t.toFixed(3), phase: s.phase, scaleRigs: a.b.scaleRigs ?? null,
    hitsTaken: a.b.sides[0].hitsTaken ?? null, kegHits: keg()?.ownHits ?? null,
    plateName: s.plateName ?? null, record: s.counters.record, badges: s.counters.last.badges,
    tabs: c ? c.tabs.map((t) => (t ? { side: t.side, chips: t.chips } : null)) : null,
    readerPops: live.filter((p) => p.reader).map((p) => ({ text: p.text, color: p.color, age: +p.t.toFixed(2) })),
    targets: c ? c.targets.map((q) => q.id) : [],
  };
}, [mode, tick, extra]);

/** Tap a counter group (its region's onTap) and draw a frame: the panel's heads and lines. */
const tapGroup = (page, id) => page.evaluate((id) => {
  const g = window.bb.game, r = g.ui.regions.filter((q) => q.id === id).pop();
  if (!r) return null;
  r.onTap();
  g.render();
  g.render();
  const c = window.bb.counters();
  return c?.panel ? { id: c.panel.id, heads: c.panel.heads, lines: c.panel.lines } : { id, panel: null };
}, id);

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
  const errors = [], report = { label: LABEL, shots: [] };
  const m = MOMENT && LABEL !== "before" ? JSON.parse(await readFile(MOMENT, "utf8")).top[PICK] : null;
  for (const [view, opts] of Object.entries(VIEWS)) {
    const ctx = await browser.newContext(opts);
    await ctx.route(`${ORIGIN}/**`, serve);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`[${view}] pageerror: ${e.message}`));
    page.on("console", (msg) => { if (msg.type() === "error") errors.push(`[${view}] console: ${msg.text()}`); });
    await page.goto(`${ORIGIN}/index.html`);
    try {
      await page.waitForFunction(() => !!window.bb, null, { timeout: 15000 });
    } catch (e) {
      console.log(`[${view}] the page never set window.bb: ${e.message}\n${errors.join("\n")}`);
      throw e;
    }
    const shot = async (name, line, extra = {}) => {
      const file = join(OUT, `${name}-${LABEL}-${view}.png`);
      await page.screenshot({ path: file });
      console.log(`${name}-${LABEL}-${view}.png: ${line}`);
      report.shots.push({ view, name, file, line, ...extra });
    };
    // 1. the cards
    await page.evaluate(() => window.bb.openShowcase("twobelts", "build"));
    await settle(page, 30);
    for (let w = 0; w < WAGONS.length; w++) {
      const defs = await wagon(page, WAGONS[w]);
      await settle(page, 30);
      await shot(`cards${w + 1}`, `the shop: ${defs.join(", ")} in one wagon`);
    }
    if (LABEL !== "before") {
      for (const [w, slot, def] of [[0, 0, "quench"], [1, 2, "cindermail"]]) {
        await wagon(page, WAGONS[w]);
        await settle(page, 20);
        // select the card and draw a frame first: its panel's regions (the ⓘ's `kw:?` among them) exist only once drawn
        await page.evaluate((slot) => window.bb.game.screen.select({ kind: "offer", wagon: 0, slot }), slot);
        await settle(page, 8);
        const opened = await page.evaluate(() => {
          const r = window.bb.game.ui.regions.filter((q) => q.id.endsWith("kw:?")).pop();
          if (r) r.onTap();
          return r ? r.id : null;
        });
        await settle(page, 8);
        if (opened) await shot(`notes-${def}`, `${def}'s card selected, its ⓘ view open (LEVELS, NOTES, KEYWORDS)`);
        else console.log(`notes-${def}-${LABEL}-${view}.png: not taken (no ⓘ region)`);
      }
    }
    // 2. the fight: a frame with the keg's badge in the clear, then the picked moment, then the taps
    if (m) {
      const ok = await openLive(page, m);
      const line = (r) => `phase ${r.phase} scaleRigs ${r.scaleRigs}, tick ${r.ticks} (${r.t} s): hits on you ${r.hitsTaken}, keg hits ${r.kegHits}; plate "${r.plateName}"; your row ${JSON.stringify(r.tabs?.find((t) => t && t.side === 0)?.chips ?? null)}; badges ${JSON.stringify(r.badges)}; reader pops ${JSON.stringify(r.readerPops)}`;
      const head = `d${m.day} FURNACE par deck ${m.i + 1} (${m.swaps}) v ${m.foe} s${m.seed} (the screen's seed: ${ok}), a live dusk, run 4W 6 hearts of 10`;
      const early = await stepLive(page, "badge", 0, 0);
      await shot("fight-badge", `${head}; the keg's badge early, few numbers alive: ${line(early)}`, { r: early });
      await openLive(page, m); // a fresh live dusk for the picked moment
      const r = await stepLive(page, "moment", m.moment.tick, EXTRA);
      await shot("fight", `${head}; the picked moment tick ${m.moment.tick} (${m.moment.t} s: hits on you ${m.moment.hits}, keg hits ${m.moment.keg}, pop ${m.moment.pop.def} +${m.moment.pop.amount}) + ${EXTRA} frames: ${line(r)}`, { r });
      const plateTap = await tapGroup(page, "cnt:plate0");
      await shot("fight-plate-tap", `your plate's tap (C7's line, C9's line): ${JSON.stringify(plateTap)}`);
      const kegId = r.targets.find((id) => id.startsWith("cnt:piece0:") && Number(id.split(":")[2]) < 1000);
      const kegTap = kegId ? await tapGroup(page, kegId) : null;
      if (kegTap) await shot("fight-badge-tap", `the keg badge's tap (${kegId}): ${JSON.stringify(kegTap)}`);
      else console.log(`fight-badge-tap-${LABEL}-${view}.png: not taken (no keg badge target: ${r.targets.join(", ")})`);
    }
    await ctx.close();
  }
  await browser.close();
  await writeFile(join(OUT, `scaleShots-${LABEL}.json`), JSON.stringify({ ...report, errors }, null, 1));
  console.log(`errors: ${errors.length}${errors.length ? "\n" + errors.join("\n") : ""}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
