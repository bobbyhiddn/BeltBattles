// MIRROR-1 follow-up (REQ-BFG-093; wave3-mock tooling, test only: nothing ships): in busy fights, does each carrier get
// its dark-wind number? Every damage number shares one pool of 48 (render/fx.ts: popup() makes nothing when all 48 are
// alive), and the wind makes the player's number first, then the foe's (game/arenaReact.ts case "wind"), so when one
// slot is left the foe's is the one not made. This plays real dusk battles in the offline page (the same page and frozen
// clock as scripts/mirror1shots.mjs; the game's own battle screen and stand-in decks, nothing changed): the player's
// deck is the day's honest stand-in deck (the classic foe of a first run, pinClassicFoe), the foe the classic foe of
// that deck's hero (honestStandInBuild). At every wind tick it reads which carriers got a fresh wind number and how many
// numbers were alive just before.
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node scripts/mirror1pool.mjs <outDir> [--page <page.html>] [--days 4-10] [--seeds 1-4]
// Writes <outDir>/mirror1pool.log and mirror1pool.json.

import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { VIEWS as SHOT_VIEWS } from "./shots-list.mjs";

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const pos = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--")));
const OUT = resolve(pos[0] ?? "shots-mirror1");
const PAGE = resolve(opt("page", join(process.env.TMPDIR ?? ".", "bb-mirror1.html")));
const range = (s) => { const [a, b] = s.split("-").map(Number); return Array.from({ length: (b ?? a) - a + 1 }, (_, i) => a + i); };
const DAYS = range(opt("days", "4-10")), SEEDS = range(opt("seeds", "1-4"));
const lines = [];
const log = (s) => { lines.push(s); console.log(s); };

const FREEZE = () => {
  window.requestAnimationFrame = () => 0;
  let s = 0x2f6b9a1d;
  Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
};

/** In-page: one dusk (see the header), stepped to its end, watching the wind's numbers. */
function fightInPage({ day, seed }) {
  const bb = window.bb, g = bb.game;
  const settle = () => { for (let i = 0; i < 40; i++) g.step(1 / 60); };
  bb.clearPool();
  bb.setupRun({ hero: "furnace", day, seed });
  bb.open("battle"); // pinClassicFoe: the day's honest stand-in deck
  const first = g.run.dusk;
  const deck = JSON.parse(JSON.stringify(first.build)), hero = first.hero;
  settle();
  bb.clearPool();
  bb.setupRun({ hero, day, seed: seed + 1000 });
  g.run.build = deck;
  bb.open("battle");
  settle();
  const s = g.screen, a = s.arena, b = a.b, fx = a.fx;
  const WIND = "#8A5CB0", CAP = fx.pops.length;
  const out = {
    day, seed, you: `${hero} (${first.name})`, foe: `${s.foe.hero} (${s.foe.name})`, cap: CAP,
    ticks: 0, made: [0, 0], missing: [0, 0], onlyYours: 0, neither: 0, maxAlive: 0, fullTicks: 0, aliveAtTicks: [],
  };
  let n = 0;
  while (!b.over && n < 60 * 150) {
    const alive = fx.np, wt = b.sides[0].stats.windTaken;
    let mine = 0, theirs = 0;
    for (let i = 0; i < alive; i++) { const p = fx.pops[i]; if (p.side === 0) mine++; else if (p.side === 1) theirs++; }
    g.step(1 / 60);
    n++;
    out.maxAlive = Math.max(out.maxAlive, fx.np);
    if (b.sides[0].stats.windTaken === wt) continue;
    out.ticks++;
    const fresh = [false, false];
    for (let i = 0; i < fx.np; i++) {
      const p = fx.pops[i];
      if ((p.color || "").toUpperCase() === WIND && p.t < 0.03 && (p.side === 0 || p.side === 1)) fresh[p.side] = true;
    }
    for (const k of [0, 1]) fresh[k] ? out.made[k]++ : out.missing[k]++;
    if (fresh[0] && !fresh[1]) out.onlyYours++;
    if (!fresh[0] && !fresh[1]) out.neither++;
    if (alive >= CAP - 1) out.fullTicks++;
    out.aliveAtTicks.push({ t: Math.round(b.t), alive, onYours: mine, onTheirs: theirs, made: fresh.map(Number).join("") });
  }
  out.end = { t: +b.t.toFixed(2), winner: b.winner, hp: [b.sides[0].hull.hp, b.sides[1].hull.hp], windTaken: [b.sides[0].stats.windTaken, b.sides[1].stats.windTaken], shots: [b.sides[0].stats.shots, b.sides[1].stats.shots] };
  return out;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  log(`MIRROR-1 pool probe ${new Date().toISOString()}; page ${PAGE}; days ${DAYS.join(",")}, seeds ${SEEDS.join(",")}`);
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"] });
  const ctx = await browser.newContext(SHOT_VIEWS.phone);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
  await page.addInitScript(FREEZE);
  await page.goto(pathToFileURL(PAGE).href);
  await page.waitForFunction(() => !!window.bb && !!window.bb.game);
  log(`version ${await page.evaluate(() => window.bb.version)} (phone 390x844 @3)`);
  const all = [];
  for (const day of DAYS) for (const seed of SEEDS) {
    const r = await page.evaluate(fightInPage, { day, seed });
    all.push(r);
    log(`day ${day} seed ${seed}: ${r.you} vs ${r.foe}; ends ${r.end.t} s, winner ${r.end.winner}, hulls ${r.end.hp.join("/")}; wind ticks ${r.ticks}: your number made ${r.made[0]}, missing ${r.missing[0]}; foe's made ${r.made[1]}, missing ${r.missing[1]} (only yours ${r.onlyYours}, neither ${r.neither}); most numbers alive ${r.maxAlive} of ${r.cap}; ticks with the pool full or one short ${r.fullTicks}`);
  }
  const sum = (f) => all.reduce((s, r) => s + f(r), 0);
  const windy = all.filter((r) => r.ticks > 0);
  log(`\nTOTAL: ${all.length} fights, ${windy.length} reached the wind; ${sum((r) => r.ticks)} wind ticks: your number missing ${sum((r) => r.missing[0])}, the foe's missing ${sum((r) => r.missing[1])} (only yours shown ${sum((r) => r.onlyYours)}, neither ${sum((r) => r.neither)}); most numbers alive in any fight ${Math.max(...all.map((r) => r.maxAlive))} of ${all[0]?.cap}`);
  log(errors.length ? `console errors (${errors.length}):\n  ${errors.join("\n  ")}` : "console errors: 0");
  await browser.close();
  await writeFile(join(OUT, "mirror1pool.log"), lines.join("\n") + "\n");
  await writeFile(join(OUT, "mirror1pool.json"), JSON.stringify(all, null, 1) + "\n");
  process.exit(errors.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
