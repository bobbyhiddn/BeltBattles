// ENDLESS-1 (REQ-BFG-059, 3.5): the endless screens' shots, rendered DETERMINISTICALLY from a build directory, on shots-det.mjs's page
// (requestAnimationFrame never fires, so the game moves only when a shot's script steps it; Math.random is a fixed-seed generator;
// every shot gets a fresh browser context, so no save or profile carries over). Two kinds of shot:
//  - the `-off` shots never turn ENDLESS on: run on the build at endless1-base and on the tip, a RUN WON must match byte for byte
//    (cmp the PNGs): an unmarked run's RUN WON is as it was;
//  - the others turn it on with bb.endless() (main.ts; ENDLESS ships off) and play a run out (bb.openEnd / bb.openPlayed,
//    tooling.ts playOut's `endless` results): the RUN WON offer, END RUN's card, the endless build bar on day 15, the battle's and the
//    replay's banner, ENDLESS OVER, YOUR RUNES at 50 runes (the picker's tray and the rune bar's list, paged) and the title's CONTINUE.
// Views: op690 = the operator's phone (402x690 at DPR 3), desk = the desktop frame (1920x1080).
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node scripts/shots-endless.mjs <build dir> <outDir> [name filter]
import { chromium } from "playwright-core";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { autoFight } from "./scouthook.mjs";

const [distArg, outArg, filter = ""] = process.argv.slice(2);
if (!distArg || !outArg) throw new Error("usage: node scripts/shots-endless.mjs <build dir> <outDir> [name filter]");
const DIST = resolve(distArg), OUT = resolve(outArg);
const ORIGIN = "http://bb.test";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml" };

const VIEWS = {
  op690: { viewport: { width: 402, height: 690 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  desk: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  // the smallest phone the other scripts use (shots-list.mjs VIEWS.small): where the picker's 50-rune tray must go compact
  small: { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

const J = JSON.stringify;
const STEP = (n) => `for (let i = 0; i < ${n}; i++) bb.game.step(1 / 60);`;
const POOL = [
  { day: 2, hero: "weaver", wins: 1, losses: 0 }, { day: 3, hero: "furnace", wins: 1, losses: 1 },
  { day: 5, hero: "weaver", wins: 3, losses: 1 }, { day: 8, hero: "furnace", wins: 4, losses: 3 },
];
// the runs: A a flawless 10-0 (won on day 10), B won on day 13 with 2 losses and a draw, C = A then 4 endless wins (the dawn of
// day 15: ENDLESS 4 · DAY 15, 3 hearts), D = won on day 13 then 7 endless wins and 3 losses (ENDLESS OVER: 7 ENDLESS WINS, WON ON DAY 13)
const A = { results: "WWWWWWWWWW", seed: 99 };
const B = { results: "WWLWDWLWWWWWW", seed: 777 };
const C = { results: "WWWWWWWWWW", seed: 99, endless: "WWWW" };
const D = { results: "WWWLWWLWWLWWW", seed: 777, endless: "WWWWWWWLLL" };
const E = { results: "WWWWWWWWWW", seed: 99, endless: "W".repeat(30) }; // a perfect endless (the 30th endless win ends it)
// prep's dawn-rune step (shots-list.mjs TAKE_DAWN), for a run that already holds runes: the pick taken as held, the pick cleared
const TAKE_DAWN = `{ const g = bb.game, s = g.pending || g.screen, o = g.run && s && s.run === g.run && s.runePicker && s.runePicker.offer(s); if (o) { bb.holdRunes([...(g.run.build.runes || []).map((q) => q.id), o.ids[0]]); delete g.run.runeDay; } }`;
// `pre` runs right after the summary is queued (game.pending: step swaps it in), before the 60 frames, so END RUN's card steps the
// same frames as the off shot's and the two can be compared byte for byte
const END = (o, extra = "", on = false, pre = "") => `(() => { ${on ? "bb.endless(true);" : ""} bb.openEnd(${J(o)}, ${J(POOL)}); ${pre} ${STEP(60)} ${extra} bb.game.render(); })()`;
const PLAYED = (o, screen, frames, extra = "") => `(() => { bb.endless(true); bb.openPlayed(${J(o)}, ${J(screen)}); ${STEP(frames)} ${extra} bb.game.render(); })()`;
const BUILD = (o, extra = "") => PLAYED(o, "build", 90, `${TAKE_DAWN} ${STEP(30)} ${extra}`);
const RUNES50 = `bb.holdRunes(bb.runeIds().slice(0, 50)); ${STEP(10)}`;
const LIST = (page = 0) => `${RUNES50} bb.game.screen.runeBar.list = true; bb.game.screen.runeBar.page = ${page}; ${STEP(4)}`;
// a profile that already holds a personal best of 9 (set by another run), written before the run is played out
const BEST9 = `localStorage.setItem("beltbattles.profile.v1", ${J(JSON.stringify({ v: 1, bestEndless: 9, bestEndlessRun: "s-old" }))});`;

// [name, view, in-page script]
const SHOTS = [];
for (const v of ["op690", "desk", "small"]) {
  SHOTS.push(
    [`runwon-flawless-off`, v, END(A)],
    [`runwon-off`, v, END(B)],
    [`runwon-flawless-on`, v, END(A, "", true)],
    [`runwon-on`, v, END(B, "", true)],
    [`runwon-on-endrun`, v, END(B, "", true, `(bb.game.pending || bb.game.screen).endRun();`)],
    [`endless-build-d15`, v, BUILD(C)],
    [`endless-battle-d15`, v, PLAYED(C, "battle", 40)],
    [`endless-replay-d15`, v, PLAYED(C, "replay", 60)],
    [`endless-over`, v, PLAYED(D, "summary", 60)],
    [`endless-over-best9`, v, `(() => { ${BEST9} bb.endless(true); bb.openPlayed(${J(D)}, "summary"); ${STEP(60)} bb.game.render(); })()`],
    [`endless-over-cap`, v, PLAYED(E, "summary", 220)], // 220 frames: the merge toast of the 30 played days is gone
    [`yourrunes-list-50`, v, BUILD(C, LIST(0))],
    [`yourrunes-list-50-last`, v, BUILD(C, LIST(99))],
    [`yourrunes-picker-12`, v, PLAYED(C, "build", 90, `bb.holdRunes(bb.runeIds().slice(0, 12)); ${STEP(20)}`)],
    [`yourrunes-picker-50`, v, PLAYED(C, "build", 90, `bb.holdRunes(bb.runeIds().slice(0, 50)); ${STEP(20)}`)],
    [`yourrunes-picker-63`, v, PLAYED(C, "build", 90, `bb.holdRunes(bb.runeIds().slice(0, 63)); ${STEP(20)}`)], // the deepest dawn (day 64) holds 63
    [`title-continue-endless`, v, PLAYED(C, "title", 120)],
    [`title-continue-won`, v, PLAYED(B, "title", 120)], // a won run whose RUN WON offer was open when the page closed (it stays saved)
  );
}

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

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"] });
const errors = [];
let count = 0;
for (const [name, vname, script] of SHOTS) {
  if (filter && !`${name}-${vname}`.includes(filter)) continue;
  const ctx = await browser.newContext(VIEWS[vname]); // a fresh context per shot: no save, profile or pool carries over
  await autoFight(ctx); // SCOUT-1: battles skip scouting, as the other shot scripts
  await ctx.route(`${ORIGIN}/**`, serve);
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    let s = 0x9e3779b9;
    Math.random = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    window.requestAnimationFrame = () => 0; // the game moves only when a shot steps it
  });
  page.on("pageerror", (e) => errors.push(`[${name}-${vname}] pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`[${name}-${vname}] ${m.type()}: ${m.text()}`); });
  await page.goto(`${ORIGIN}/index.html`);
  await page.waitForFunction(() => !!window.bb, null, { timeout: 10000 });
  await page.evaluate(() => { window.bb.setReducedMotion(false); window.bb.clearPool(); });
  await page.evaluate(script);
  await page.screenshot({ path: join(OUT, `${name}-${vname}.png`) });
  count++;
  await ctx.close();
}
await browser.close();
console.log(`${count} shots`);
console.log(errors.length ? "ERRORS:\n" + [...new Set(errors)].join("\n") : "no console errors");
if (errors.length) process.exitCode = 1;
