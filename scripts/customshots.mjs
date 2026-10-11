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
// CUSTOM-3 (REQ-BFG-074), --set custom3: the carrier styles' stills (every style open, so each can be worn):
//  - battle-<style> x5: the same dusk moment (FURNACE, day 5, seed 7, shots in flight) with the player's carrier in WAR
//                      COLOURS, then each style; the foe in today's look (the carrier is display only: the moment repeats);
//  - contact:          the contact sheet: the player's ship cropped from those five, side by side, named;
//  - damage50, damage25: a styled carrier in a losing fight (a hard warlord on day 3) below 50% hull (smoke and sparks)
//                      and below 25% (fire and heavy smoke);
//  - customize-carrier: the CARRIER tab with a locked row's preview (PREVIEW: NOT YOURS YET.);
//  - build-carrier:    the build screen with a styled carrier.
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node scripts/customshots.mjs <page.html> <outDir> [--only a,b] [--prefix custom2a]
//        [--set custom2|custom3]
//        (CUSTOM-2b: --prefix names the files, <prefix>-<still>.png; custom2a by default, as CUSTOM-2a's)
import { chromium } from "playwright-core";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { autoFight } from "./scouthook.mjs"; // SCOUT-1 (REQ-BFG-076): the FIGHT step (bb.fight(true): battles skip scouting)

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const pos = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--")));
const PAGE = resolve(pos[0] ?? "dist/index.html");
const OUT = resolve(pos[1] ?? "shots/custom");
const ONLY = opt("only", "");
const PREFIX = opt("prefix", "custom2a");
const SET = opt("set", "custom2");
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

/** CUSTOM-3: a player with every style open and seen, wearing `chosen` (each carrier style can be worn). */
const CARRIER_IDS = ["war", "admiral", "ironclad", "storm", "gold"];
const CARRIER_NAMES = { war: "WAR COLOURS", admiral: "ADMIRAL'S BLUE", ironclad: "IRONCLAD", storm: "STORMCALLER", gold: "CHAMPION'S GOLD" };
function allOpen(chosen) {
  const ids = { floor: ["timber", "tread", "checker", "rune"], belt: ["verdigris", "blued", "timber", "rune"], panel: ["brass", "verdigris", "timber", "plum"], carrier: CARRIER_IDS.slice(1) };
  const unlocked = Object.entries(ids).flatMap(([k, v]) => v.map((id) => `style:${k}.${id}`));
  return {
    v: 1, counters: { runs: 99, runsFinished: 9, flawless: 1, duskWins: 120, bestDay: 10, warlordWins: 9, matriarchWins: 9, mostBelts: 9 },
    heroesWon: ["furnace", "weaver", "foundry", "bastion"], heroesFinished: ["furnace", "weaver", "foundry"], unlocked, chosen, seen: unlocked, folded: [], runNew: null, updatedAt: 1,
  };
}
const DEF = { floor: "plate", belt: "iron", panel: "slate" };
/** CUSTOM-3: the mock player some runs on: 3 finished runs and 5 warlords (ADMIRAL'S BLUE and IRONCLAD open), wearing
 *  ADMIRAL'S BLUE; STORMCALLER and CHAMPION'S GOLD locked. */
function carrierPlayer() {
  const p = profile({ floor: "timber", belt: "blued", panel: "brass", carrier: "admiral" }, true);
  p.counters.runsFinished = 3;
  p.counters.warlordWins = 5;
  p.unlocked = [...p.unlocked, "style:carrier.admiral", "style:carrier.ironclad"];
  p.seen = [...p.seen, "style:carrier.admiral", "style:carrier.ironclad"];
  return p;
}
const SHOTS3 = [
  ...CARRIER_IDS.map((c) => ({ name: `battle-${c}`, prof: allOpen({ ...DEF, carrier: c }), scene: "dusk", hero: "furnace", day: 5, seed: 7, carrier: c })),
  { name: "damage50", prof: allOpen({ ...DEF, carrier: "admiral" }), scene: "damage", hero: "furnace", day: 3, seed: 7, below: 0.5 },
  { name: "damage25", prof: allOpen({ ...DEF, carrier: "gold" }), scene: "damage", hero: "furnace", day: 3, seed: 7, below: 0.25 },
  { name: "customize-carrier", prof: carrierPlayer(), scene: "customize", tab: "carrier", pick: "storm", secs: 1.2 },
  { name: "build-carrier", prof: allOpen({ ...DEF, carrier: "ironclad" }), scene: "dawn", hero: "furnace", day: 5, seed: 7, secs: 1.2 },
];

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

async function shot(browser, s, crops = {}) {
  const ctx = await browser.newContext(VIEWS[s.view ?? "phone"]);
  await autoFight(ctx); // SCOUT-1: battles skip scouting, as before SCOUT-1
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
    else if (s.scene === "damage") bb.openWarlord("hard", { hero: s.hero, day: s.day, seed: s.seed });
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
      // CUSTOM-3: where the player's ship is (the contact sheet's crop): its pivot and the scale, device px
      if (g.screen.motion) { g.render(); extra.pivot = [g.screen.motion.pivot[0][0], g.screen.motion.pivot[0][1]]; } // drawn: the pivot is this frame's
    } else if (s.scene === "damage") {
      // CUSTOM-3: on until the player's hull is below `below` of its max (still afloat), then 0.7 s more (the smoke, fire)
      const hull = () => { const h = g.screen.arena.b.sides[0].hull; return Math.max(0, h.hp) / h.max; };
      let tries = 0;
      for (; tries < 60 * 120 && !(hull() < s.below && hull() > 0); tries++) step(1);
      step(42);
      extra.tries = tries;
      extra.hull = Math.round(1000 * hull()) / 1000;
      extra.over = g.screen.arena.b.over;
      extra.particles = g.screen.arena.fx.parts.n;
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
  // CUSTOM-3: the player's ship's box on this still (device px) for the contact sheet: the rotation canvas (212 x 194
  // logical) around the pivot, cut to the screen
  if (s.carrier && info.pivot) {
    const k = info.view.scale, W = info.view.W * k, H = info.view.H * k;
    const x = Math.max(0, Math.round((info.pivot[0] - 106) * k)), y = Math.max(0, Math.round((info.pivot[1] - 97) * k));
    crops[s.carrier] = { x, y, w: Math.min(W - x, 212 * k), h: Math.min(H - y, 194 * k) };
  }
  const bytes = (await stat(file)).size;
  log(`still ${s.name}: ${JSON.stringify(info)}; ${bytes} B -> ${file}; console errors ${errors.length}${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  await ctx.close();
  return errors.length;
}

/** CUSTOM-3: the contact sheet: the player's ship cropped from each battle-<style> still (around its pivot), side by side,
 *  each named, composed in a blank page's canvas (no game code). */
async function contact(browser, crops) {
  const parts = [];
  for (const c of CARRIER_IDS) {
    const f = join(OUT, "stills", `${PREFIX}-battle-${c}.png`);
    parts.push({ c, name: CARRIER_NAMES[c], url: `data:image/png;base64,${(await readFile(f)).toString("base64")}`, crop: crops[c] });
  }
  const ctx = await browser.newContext({ viewport: { width: 400, height: 300 }, deviceScaleFactor: 1 });
  await autoFight(ctx); // SCOUT-1: battles skip scouting, as before SCOUT-1
  const page = await ctx.newPage();
  await page.setContent("<html><body style='margin:0;background:#050B12'></body></html>");
  const data = await page.evaluate(async (ps) => {
    const imgs = await Promise.all(ps.map((p) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = p.url; })));
    const cw = ps[0].crop.w, ch = ps[0].crop.h, gap = 24, head = 96, foot = 64;
    const cv = document.createElement("canvas");
    cv.width = ps.length * cw + (ps.length + 1) * gap;
    cv.height = head + ch + foot;
    const g = cv.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.fillStyle = "#050B12";
    g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = "#F6CF48";
    g.font = "bold 44px monospace";
    g.fillText("CARRIER STYLES: YOUR SHIP IN THE MOVING BATTLE (FURNACE, DAY 5, THE SAME MOMENT)", gap, 62);
    ps.forEach((p, i) => {
      const x = gap + i * (cw + gap);
      g.drawImage(imgs[i], p.crop.x, p.crop.y, cw, ch, x, head, cw, ch);
      g.strokeStyle = i === 0 ? "#7A8F9A" : "#F6CF48";
      g.lineWidth = 4;
      g.strokeRect(x - 2, head - 2, cw + 4, ch + 4);
      g.fillStyle = "#E9F1E5";
      g.font = "bold 40px monospace";
      g.fillText(i === 0 ? `${p.name} (TODAY)` : p.name, x, head + ch + 48);
    });
    return cv.toDataURL("image/png");
  }, parts);
  const file = join(OUT, "stills", `${PREFIX}-contact.png`);
  await writeFile(file, Buffer.from(data.split(",")[1], "base64"));
  log(`still contact: ${CARRIER_IDS.length} crops ${JSON.stringify(crops.war)} device px each; ${(await stat(file)).size} B -> ${file}`);
  await ctx.close();
}

await mkdir(join(OUT, "stills"), { recursive: true });
log(`customshots on ${PAGE} -> ${OUT}, set ${SET}, ${new Date().toISOString()}`);
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
let errs = 0;
const crops = {};
for (const s of SET === "custom3" ? SHOTS3 : SHOTS) if (!ONLY || ONLY.split(",").includes(s.name)) errs += await shot(browser, s, crops);
if (SET === "custom3" && (!ONLY || ONLY.split(",").includes("contact")) && CARRIER_IDS.every((c) => crops[c])) await contact(browser, crops);
await browser.close();
log(`customshots: ${errs} console errors`);
process.exit(errs ? 1 : 0);
