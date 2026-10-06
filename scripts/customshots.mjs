// CUSTOM-2a (REQ-BFG-072): the styles' stills, from the offline single-file page (the player build), in headless
// Chromium at 390x844 DPR 3. The page's requestAnimationFrame never fires and Math.random is pinned: the script steps the
// game itself (bb.game.step(1/60), as scripts/motionshots.mjs and shots-det.mjs do), so a still repeats exactly. Each
// still starts on a fresh page whose profile (beltbattles.profile.v1) is set before the game loads:
//  - title:            the title with CUSTOMIZE and its NEW dot (styles unlocked, not yet seen);
//  - customize-floor:  CUSTOMIZE, the FLOOR tab, TIMBER DECK worn;
//  - customize-belts:  the BELTS tab with a locked style tapped: its preview and the PREVIEW band (R7), progress (R8);
//  - customize-panels: the PANELS tab;
//  - battle:           a dusk in motion with the player's deck in BRASS CHECKER, VERDIGRIS belts and the BRASSBOUND plate,
//                      shots in flight (R10), the foe in today's look;
//  - build:            the build screen in TIMBER DECK, BLUED STEEL and BRASSBOUND, a factory's part panel open;
//  - summary:          a 10-0 run's summary with its NEW STYLE line (an empty profile: the run's end unlocks four);
//  - customize-land, customize-desk: the two-column CUSTOMIZE at 844x390 DPR 3 and 1280x720 DPR 1.
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node scripts/customshots.mjs <page.html> <outDir> [--only a,b] [--prefix custom2a]
//        (CUSTOM-2b: --prefix names the files, <prefix>-<still>.png; custom2a by default, as CUSTOM-2a's)
import { chromium } from "playwright-core";
import { mkdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const pos = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--")));
const PAGE = resolve(pos[0] ?? "dist/index.html");
const OUT = resolve(pos[1] ?? "shots/custom");
const ONLY = opt("only", "");
const PREFIX = opt("prefix", "custom2a");
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

/** A player some runs in (CUSTOM-1's mock player): 4 runs, 1 finished, 9 dusk wins, best day 10, 2 warlord wins, 3 belts,
 *  FURNACE with a win and a finish. Open: TIMBER DECK, TREAD PLATE, BRASS CHECKER; VERDIGRIS, BLUED STEEL; BRASSBOUND,
 *  CAPTAIN'S DESK. Locked: RUNE STONE, TIMBER ROLLERS, RUNE CHAIN, VERDIGRIS panels, WARLORD'S PLUM. */
function profile(chosen, seen) {
  const unlocked = ["style:floor.timber", "style:floor.tread", "style:floor.checker", "style:belt.verdigris", "style:belt.blued", "style:panel.brass", "style:panel.timber"];
  return {
    v: 1, counters: { runs: 4, runsFinished: 1, flawless: 0, duskWins: 9, bestDay: 10, warlordWins: 2, matriarchWins: 0, mostBelts: 3 },
    heroesWon: ["furnace"], heroesFinished: ["furnace"], unlocked, chosen, seen: seen ? unlocked : unlocked.slice(0, 5), folded: [], runNew: null, updatedAt: 1,
  };
}
const NAME = "beltbattles.name.v1";

const SHOTS = [
  { name: "title", prof: profile({ floor: "plate", belt: "iron", panel: "slate" }, false), scene: "title", secs: 1.5 },
  { name: "customize-floor", prof: profile({ floor: "timber", belt: "blued", panel: "brass" }, true), scene: "customize", tab: "floor", secs: 1.2 },
  { name: "customize-belts", prof: profile({ floor: "timber", belt: "blued", panel: "brass" }, true), scene: "customize", tab: "belt", pick: "timber", secs: 1.2 },
  { name: "customize-panels", prof: profile({ floor: "timber", belt: "blued", panel: "brass" }, true), scene: "customize", tab: "panel", secs: 1.2 },
  { name: "battle", prof: profile({ floor: "checker", belt: "verdigris", panel: "brass" }, true), scene: "dusk", hero: "furnace", day: 5, seed: 7 },
  { name: "build", prof: profile({ floor: "timber", belt: "blued", panel: "brass" }, true), scene: "dawn", hero: "furnace", day: 5, seed: 7, secs: 1.2 },
  { name: "summary", prof: null, scene: "end", hero: "furnace", seed: 7, secs: 1.2 },
  // landscape and desktop: the two-column CUSTOMIZE (not in the brief's list; for the frame's check)
  { name: "customize-land", view: "land", prof: profile({ floor: "timber", belt: "blued", panel: "brass" }, true), scene: "customize", tab: "belt", pick: "rune", secs: 1.2 },
  { name: "customize-desk", view: "desk", prof: profile({ floor: "timber", belt: "blued", panel: "brass" }, true), scene: "customize", tab: "floor", secs: 1.2 },
];
const VIEWS = { phone: PHONE, land: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, desk: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 } };

const lines = [];
const log = (s) => { lines.push(s); console.log(s); };

async function shot(browser, s) {
  const ctx = await browser.newContext(VIEWS[s.view ?? "phone"]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.addInitScript(({ prof, name }) => {
    window.requestAnimationFrame = () => 0;
    let r = 0x2f6b9a1d;
    Math.random = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; };
    localStorage.setItem(name, "SHOTS");
    if (prof) localStorage.setItem("beltbattles.profile.v1", JSON.stringify(prof));
  }, { prof: s.prof, name: NAME });
  await page.goto(pathToFileURL(PAGE).href);
  await page.waitForFunction(() => !!window.bb && !!window.bb.game);
  const info = await page.evaluate(async (s) => {
    const bb = window.bb, g = bb.game;
    const step = (n) => { for (let i = 0; i < n; i++) g.step(1 / 60); };
    if (s.scene === "title") bb.open("title");
    else if (s.scene === "customize") bb.open("customize");
    else if (s.scene === "dusk") bb.openDusk({ hero: s.hero, day: s.day, seed: s.seed }, []);
    else if (s.scene === "dawn") bb.openDawn({ hero: s.hero, day: s.day, seed: s.seed }, []);
    else if (s.scene === "end") bb.openEnd({ hero: s.hero, seed: s.seed, results: "WWWWWWWWWW" }, []);
    step(40); // the wipe
    const extra = {};
    if (s.scene === "customize") {
      const c = g.screen.state;
      c.tapTab(s.tab);
      if (s.pick) extra.tap = c.tapRow(s.pick);
      step(Math.round(60 * s.secs));
    } else if (s.scene === "dusk") {
      // into the fight, on until shots fly over the moving boards (R10: they must stand out over styled belts)
      let tries = 0;
      for (; tries < 60 * 60; tries++) {
        step(1);
        if (tries % 6) continue;
        const m = bb.motion();
        if (m.phase === "fight" && m.t > 6 && g.screen.arena.b.projectiles.length >= 2 && Math.max(...m.poses.map((p) => Math.abs(p.bank))) >= 3) break;
      }
      extra.tries = tries;
    } else if (s.scene === "dawn") {
      step(Math.round(60 * s.secs));
      const items = g.run.build.items.filter((p) => p.def !== undefined);
      const f = items.find((p) => p.uid === 2) ?? items[0];
      if (f) { g.screen.select({ kind: "item", uid: f.uid }); extra.selected = f.def; }
      step(10);
    } else step(Math.round(60 * (s.secs ?? 1)));
    g.render();
    const m = bb.motion();
    const p = bb.profile();
    return {
      screen: bb.screen(), view: { W: g.W, H: g.H, scale: g.view.scale, dpr: g.view.dpr }, t: m.t ?? null, sea: m.sea ?? null,
      shots: g.screen.arena ? g.screen.arena.b.projectiles.length : 0, bank: m.drawnBank ?? [], wears: p.wears, unseen: p.unseen.length,
      customize: p.customize ? { tab: p.customize.tab, pick: p.customize.pick, locked: p.customize.locked } : null,
      notes: g.screen.noteLines ? g.screen.noteLines() : null, ...extra,
    };
  }, s);
  const file = join(OUT, "stills", `${PREFIX}-${s.name}.png`);
  await page.screenshot({ path: file });
  const bytes = (await stat(file)).size;
  log(`still ${s.name}: ${JSON.stringify(info)}; ${bytes} B -> ${file}; console errors ${errors.length}${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  await ctx.close();
  return errors.length;
}

await mkdir(join(OUT, "stills"), { recursive: true });
log(`customshots on ${PAGE} -> ${OUT}, ${new Date().toISOString()}`);
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
let errs = 0;
for (const s of SHOTS) if (!ONLY || ONLY.split(",").includes(s.name)) errs += await shot(browser, s);
await browser.close();
log(`customshots: ${errs} console errors`);
process.exit(errs ? 1 : 0);
