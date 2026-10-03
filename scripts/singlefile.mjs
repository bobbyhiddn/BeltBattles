// V4: inline the Vite build (JS + CSS) into one HTML file, then prove it loads from
// file:// in headless chromium and completes a scripted run with real input:
// buy -> place -> FIGHT -> battle end -> round summary -> ... -> run summary.
// Desk uses the mouse (drag and drop); phone uses touch taps and touch drags (shoptap: a touch tap reads, so parts are
// dragged into place as on the desk; playthrough.mjs touchDrag).
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node scripts/singlefile.mjs <out.html> [log.txt] [--dist <build dir>]
// 0.6.2j: BB_RUNS=join-desk,join-phone runs the belt-join scenario (scripts/joinrun.mjs) instead of the scripted runs;
// BB_SHOTS_DIR=<dir> saves its shots there.
// 0.7.0 (R1 M3): --dist names the Vite build to inline (default dist/): dist-online/ (npm run build:online) makes the
// online page. From file:// it has no origin of its own, so it plays offline there, as the offline page does.

import { chromium } from "playwright-core";
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { VIEWS as SHOT_VIEWS } from "./shots-list.mjs";
import { scriptedRun } from "./playthrough.mjs";
import { joinRun } from "./joinrun.mjs"; // 0.6.2j: the belt-join scenario (join-desk, join-phone)
import { inlineBuild } from "./inline.mjs"; // 0.7.0 R1: shared with asynccheck.mjs (check D)

// 0.8.0 H1 M5: the shot views, and a small landscape phone (an iPhone SE turned) for the FOUNDRY and BASTION runs; kept out
// of shots-list.mjs, whose every view the metrics pass measures
const LAND = { viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const VIEWS = { ...SHOT_VIEWS, land: LAND };

const ROOT = new URL("..", import.meta.url).pathname;
const argv = process.argv.slice(2);
const di = argv.indexOf("--dist");
const DIST = resolve(di >= 0 ? argv[di + 1] : join(ROOT, "dist"));
const pos = argv.filter((_, i) => di < 0 || (i !== di && i !== di + 1));
const OUT = resolve(pos[0] ?? join(ROOT, "BeltBattles-single.html"));
const LOG = pos[1] ? resolve(pos[1]) : null;
const lines = [];
const log = (s) => { lines.push(s); console.log(s); };

async function inline() {
  const { html, script, js } = await inlineBuild(DIST);
  await writeFile(OUT, html);
  const bytes = Buffer.byteLength(html);
  log(`inlined ${script} (${js.length} bytes) from ${DIST} -> ${OUT} (${html.length} bytes)`);
  log(`page: ${bytes} bytes, sha256 ${createHash("sha256").update(html).digest("hex")}`);
}

// 0.6.0: the local ghost pool each run starts with (as if this browser had played before). Desk
// plays all 10 days (reload on day 4, a pool ghost); phone plays 3 days (reload on day 2). The
// strong day-2 ghost makes sure a dusk is lost (5 -> 4 lives); day 3 has no ghost: a stand-in.
// Days 5-10 on desk are under-built decks (the honest deck of 2 days earlier), so this simple
// script (2 gates a day) plays all 10 days. M3b: every seeded ghost is an honest deck (tooling.ts
// makeGhost -> honest.ts: whole plating, deckCost within maxGoldByDay(day)); the log shows each
// dusk foe's hullBonus and deckCost and fails the run if one is not honest.
const G = (day, hero, wins, losses, power = 0) => ({ day, hero, wins, losses, power, runId: "earlier-run" });
// 0.6.0b road fork: `roads` is each day's fork pick (v event, e/m/h the warlord of that tier).
// Desk picks every tier at least twice and the event three times, and takes the Hard slot on day 8
// (the Iron Matriarch, R3); phone (touch) picks by tap (inspect, then go) and reloads in the middle
// of day 2's Medium warlord fight, which must resume as the same fight.
// 0.6.0c: this desk seed draws HERALD on day 2 and SCOUT on day 3: desk takes HERALD's STAKE 3
// (the bounty rides on day 4's Hard warlord, HIGHSPIRE) and SCOUT's SPY (dusk must fight the
// revealed deck), keeping that gold at dawn; day 1 tries the Hard OLD BULWARK (the deck that needs
// the 2-part fill). The run must lose a dusk from 5 to 4 lives and the day-4 dusk reload must meet
// the same ghost (playthrough.mjs throws otherwise). Trials: with day 1 Easy, every Hard warlord on
// days 4-7 beat the deck and the stake was lost; this road string wins day 4 and pays the bounty.
// 0.6.2 BELTSIDE (Decision 29): since 0.6.1 (merges) the desk deck beats the day-2 ghost (the run already failed its
// 5 -> 4 check at 8167743), and the day-4 Hard warlord now takes the bounty. The day-4 pool ghost was made the
// strong one instead (power 6): the desk run lost that dusk from 5 to 4 lives, then reloaded it mid-fight.
// 0.6.1r F2: the strong ghost alone no longer forced that loss (from 0.6.1d's shop on, this seed's
// desk deck won every dusk up to day 10). So on day 2 (`weakenDay`) the desk script stores every
// part it gained TO CARGO before FIGHT: the bare starting deck always loses to the day-2 ghost, and
// day 3's dawn puts the parts back (playthrough.mjs weakenDeck / restoreDeck).
// beltside-062 (the merge brief): both fixed the same failure; F2 WON and Decision 29 is reverted (the day-4 ghost
// is G(4, "weaver", 2, 1) again). F2 forces the loss by construction, whatever the shop rolls or the deck grows
// into, where Decision 29 only bet that one ghost outguns one seed's deck. F2 is rig-aware here: a rig's panel has
// TO CARGO, and the restore puts each rig back on its cell with its stars and its rot (the drop auto-aims).
const RUNS = {
  desk: {
    days: 10, reloadDay: 4, weakenDay: 2, roads: "hvvhmemhev", check: "desk", take: { herald: ["STAKE 3", 3], scout: ["SPY", 1] },
    pool: [G(1, "weaver", 0, 0), G(2, "furnace", 1, 0, 6), G(4, "weaver", 2, 1), G(5, "furnace", 3, 1, -2), G(6, "weaver", 3, 2, -2),
      G(7, "furnace", 4, 2, -2), G(8, "weaver", 5, 2, -2), G(9, "furnace", 5, 3, -2), G(10, "weaver", 6, 3, -2)],
  },
  phone: { days: 3, roads: "emv", reloadWarlordDay: 2, check: "phone", pool: [G(1, "weaver", 0, 0), G(2, "furnace", 1, 0, 6)] },
  // 0.6.0d item 9, the feel check (logged, never pass/fail on the outcome): a fresh player with an
  // empty ghost pool, so every dusk is a stand-in with its captain's named build (0.6.2 TUNE-C; before it, its
  // full-purse pool deck), from day 1 until the
  // run ends, once per hero on the same run seed (so both meet the same captains and decks). The
  // player spends like a new player would: up to 8 planned parts a dawn (not the desk run's 2).
  // Roads: an event on odd days, an Easy or Medium warlord on even days (never a life at stake).
  "fresh-furnace": { days: 10, roads: "vevmvevmve", check: "fresh", hero: "furnace", buys: 8, pool: [] },
  "fresh-weaver": { days: 10, roads: "vevmvevmve", check: "fresh", hero: "weaver", buys: 8, pool: [] },
  // 0.6.2j (REQ-BFG-027): the belt-join scenario (scripts/joinrun.mjs), desk mouse and phone touch; BB_SHOTS_DIR saves
  // its shots. Opt-in: only when BB_RUNS names it, so the default set of runs stays the 4 above.
  "join-desk": { scenario: "join" },
  "join-phone": { scenario: "join" },
  // 0.8.0 H1 M5 (REQ-BFG-011): FOUNDRY and BASTION played to the end by a fresh player (empty pool, every dusk a
  // stand-in; the fresh-furnace and fresh-weaver plan), on the desk (mouse), the phone and a small landscape phone
  // (touch). Opt-in: only when BB_RUNS names them.
  "fresh-foundry": { days: 10, roads: "vevmvevmve", check: "fresh", hero: "foundry", buys: 8, pool: [] },
  "fresh-bastion": { days: 10, roads: "vevmvevmve", check: "fresh", hero: "bastion", buys: 8, pool: [] },
  "phone-foundry": { days: 10, roads: "vevmvevmve", check: "fresh", hero: "foundry", buys: 8, pool: [] },
  "phone-bastion": { days: 10, roads: "vevmvevmve", check: "fresh", hero: "bastion", buys: 8, pool: [] },
  "land-foundry": { days: 10, roads: "vevmvevmve", check: "fresh", hero: "foundry", buys: 8, pool: [] },
  "land-bastion": { days: 10, roads: "vevmvevmve", check: "fresh", hero: "bastion", buys: 8, pool: [] },
};
// the view and Math.random pin of each run (fresh runs: desk, the desk run's seed). 0.6.1r (review
// patch 0006): BB_RUNS=desk,phone,... runs a subset (unset: all 4), so V3 can be split across calls.
// 0.6.2j: a 4th entry "opt-in" runs only when BB_RUNS names it.
const PLAN = [["desk", "desk", 0.3], ["phone", "phone", 0.5], ["fresh-furnace", "desk", 0.3], ["fresh-weaver", "desk", 0.3],
  ["join-desk", "desk", 0.3, "opt-in"], ["join-phone", "phone", 0.5, "opt-in"],
  // 0.8.0 H1 M5: the FOUNDRY and BASTION runs (opt-in)
  ["fresh-foundry", "desk", 0.3, "opt-in"], ["fresh-bastion", "desk", 0.3, "opt-in"], ["phone-foundry", "phone", 0.5, "opt-in"],
  ["phone-bastion", "phone", 0.5, "opt-in"], ["land-foundry", "land", 0.3, "opt-in"], ["land-bastion", "land", 0.3, "opt-in"]]
  .filter(([r, , , optIn]) => (process.env.BB_RUNS ?? (optIn ? "" : r)).split(",").includes(r));
if (!PLAN.length) throw new Error(`BB_RUNS="${process.env.BB_RUNS}" names none of desk, phone, fresh-furnace, fresh-weaver, join-desk, join-phone, fresh-foundry, fresh-bastion, phone-foundry, phone-bastion, land-foundry, land-bastion`);

async function main() {
  await inline();
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"] });
  const url = pathToFileURL(OUT).href;
  let failed = 0;
  for (const [rname, vname, pin] of PLAN) {
    const ctx = await browser.newContext(VIEWS[vname]);
    const page = await ctx.newPage();
    // pin the new-run seed (the hero screen seeds from Math.random) so the run is reproducible:
    // both pins give the WRECKED RAIDER salvage as round 1's intro event, so REFIT comes up
    await page.addInitScript((r) => { Math.random = () => r; }, pin);
    // 0.6.1a: echo every toast the game shows (re-hooked after each reload); MERGED ones are logged
    await page.addInitScript(() => {
      const hook = () => {
        const g = window.bb?.game;
        if (!g) return void setTimeout(hook, 20);
        const show = g.toast.bind(g);
        g.toast = (text, ...rest) => { console.info(`[toast] day ${g.run?.day ?? "-"}: ${text}`); return show(text, ...rest); };
      };
      hook();
    });
    const merges = [];
    page.on("console", (m) => { if (m.type() === "info" && m.text().startsWith("[toast]") && m.text().includes("MERGED")) merges.push(m.text().slice(8)); });
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
    page.on("requestfailed", (r) => errors.push(`requestfailed: ${r.url()}`));
    log(`\n== ${rname} (${VIEWS[vname].viewport.width}x${VIEWS[vname].viewport.height} @${VIEWS[vname].deviceScaleFactor}, ${VIEWS[vname].hasTouch ? "touch" : "mouse"}) ${url}`);
    try {
      await page.goto(url);
      await page.waitForFunction(() => !!window.bb && window.bb.screen() === "title", null, { timeout: 15000 });
      log(`loaded from file:// : title screen up, version ${await page.evaluate(() => window.bb.version)} (Math.random pinned to ${pin} -> run seed ${(pin * 0x7fffffff) | 0})`);
      if (RUNS[rname].scenario === "join") await joinRun(page, !!VIEWS[vname].hasTouch, log, { view: vname }); // 0.6.2j
      else await scriptedRun(page, !!VIEWS[vname].hasTouch, log, RUNS[rname]);
    } catch (e) {
      failed++;
      log(`FAILED: ${e.message}`);
    }
    log(merges.length ? `MERGED toasts (${merges.length}):\n  ${merges.join("\n  ")}` : "MERGED toasts: 0");
    log(errors.length ? `console errors (${errors.length}):\n  ${errors.join("\n  ")}` : "console errors: 0");
    if (errors.length) failed++;
    await ctx.close();
  }
  await browser.close();
  const ran = PLAN.map(([r]) => r).join(", ");
  // 0.6.2j: the join runs alone say what they checked; every other set of runs prints exactly the line it always did
  const what = PLAN.every(([r]) => RUNS[r].scenario === "join")
    ? "the belt-join scenario: a join drawn with real input, a looping join refused, a dusk fight with the join, the dead end left by REMOVE BELT blocking FIGHT, no console errors"
    : PLAN.every(([r]) => ["foundry", "bastion"].includes(RUNS[r].hero)) // 0.8.0 H1 M5
      ? "fresh-player FOUNDRY and BASTION runs to the end (desk mouse; phone and small landscape phone touch), honest dusk decks, no console errors"
      : "desk 10-day + phone 3+-day scripted runs, fresh-player FURNACE + WEAVER runs to the end, honest dusk decks, no console errors";
  log(failed ? `\nRESULT: FAIL (${failed}) [runs: ${ran}]` : `\nRESULT: PASS [runs: ${ran}] (${what})`);
  if (LOG) await writeFile(LOG, lines.join("\n") + "\n");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
