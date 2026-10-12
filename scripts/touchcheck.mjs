// shoptap (BeltBattles 0.8.0 phone controls; REQ-BFG-034, -035, -036, -037 and backlog 319): the build screen's touch
// and mouse rules on the BUILT page (dist/, served on 127.0.0.1; offline, no server URL), in Chromium with real input:
//  touch  (A1) phones 390x844 @3 and 844x390 @3 (isMobile, hasTouch), real touch events (CDP Input.dispatchTouchEvent),
//         each tap under 200 ms and made three times, its finger drifting 3, 5 and 8 CSS px before it lifts:
//         - a shop card, affordable and not, opens its description; gold, the shop and the build stay; nothing lifts (034);
//         - a tap on each carrier part opens its panel: the signature factory (it stays aboard), a factory, a rig, an X rig,
//           a turret with a bought core and gear, then its core and its gear (a tap again on the selected turret); a tap
//           alone changes nothing (a rig: its first tap doesn't turn it, a tap on the selected rig does); SELL from each
//           panel sells it (035); with a shop card selected, a tap on a part reads that part and buys nothing (034, 035);
//         - a tap on a belt puts up its X, at least 44 x 44 CSS px, on screen and clear of the panel; a tap on the X removes
//           the whole belt; a tap elsewhere takes it down (and selects what it lands on); a jittered tap never cuts (036);
//         - a drag from a multi-output factory with a free output (and from its first belt tile) adds a belt and keeps the
//           first; a factory with every output used warns (037). bb-0.8.3 (REQ-BFG-044 D6): no factory has one output, so
//           the KILN (2 belt slots at level 1) draws a second belt; full, it says so ("KILN'S 2 BELTS ARE IN USE · UPGRADE
//           FOR A 3RD"), draws nothing, and ended back on it leaves the build identical;
//         - bb-0.8.3 (REQ-BFG-043 D10, D11; was a KILN copy bought from the caravan, merging it to ★2): the hero's gold
//           upgrades by touch. A tap on the KILN, then on its UPGRADE 10G: the gold drops by 10, the build's FACTORY level
//           is 2 (nothing else in the build, cargo or the shop changes), the board marks the KILN with a 2 (read back off
//           the canvas), and a drag draws its third belt at once; the same on the full LOOM (3 slots at level 1), whose
//           fourth belt then drags out; a tap on the starting SCRAP CANNON (the free copy), then on its UPGRADE 10G: TURRET
//           SPEED level 2 for 10 gold, marked on the gun. With too little gold the KILN's UPGRADE 10G shows dim, and a tap
//           on it changes nothing;
//         - real drags of 40 px or more still work: a shop card bought and placed, a part moved, a belt drawn and rerouted;
//         - every button pressed is at least 44 CSS px tall (SELL, ROTATE, TO CARGO, REMOVE BELT, BUY, the X, UPGRADE).
//  mouse  (A2) the desk 1920x1080: a click selects, click-to-place buys and places, a click turns a rig, the drag
//         threshold is 4 logical px, a belt click puts up no X; bb-0.8.3: a drag out of the level-1 KILN draws a second
//         belt, the full KILN's notice, a click on the KILN and on its UPGRADE 10G buying FACTORY level 2, and its third
//         belt.
//         It writes <name>-mouse.json (what it saw, timings aside), so a run on 69fe689's build can be compared with it.
//  319    the run summary offline with a 20-row history (each day a warlord and a dusk) on the phones and the desk: the card
//         on the screen, NEW RUN and TITLE at least 44 CSS px tall on a phone (the desktop's as before).
// shoptap2 (the operator's iPhone: "tapping an item doesn't open its description"): a phone's browser never gives the page
//         its whole screen, and the portrait panel band shrank with it (40 px on Safari's 390x664, 8 px on 390x700), so a
//         tap selected and showed no description, or no panel. The touch section now runs on what an iPhone's browser
//         gives the page, at DPR 3: Chromium (isMobile, hasTouch) on 390x844, 390x660 and 844x390, and WebKit with
//         Playwright's iPhone descriptors (Safari's user agent, DPR 3, isMobile, hasTouch) on the same three and on the
//         descriptors' own viewports (iPhone 13 390x664, iPhone 15 Pro Max 430x739). Every tap that reads (a shop card,
//         each carrier part, a cargo part, a belt) asserts the panel is drawn, titled for what was tapped, shows its
//         description (at least one body line, its kept text whole) and lies fully inside the visible viewport
//         (visualViewport, innerWidth x innerHeight). WebKit's touch input: Playwright's own WebKit protocol,
//         Input.dispatchTouchEvent (touchStart / touchMove / touchEnd, integer CSS px) on the page proxy session that
//         page.touchscreen.tap uses (Playwright's API has a tap but no touch move for WebKit).
// PACKS M2 (REQ-BFG-063) names: the name screen on a fresh device (phone 390x844 in Chromium; the 402x690 and iPhone 13 views
//         in WebKit; the desk): the title's first tap opens it and it can't be skipped (Escape, taps beside it, an empty
//         OK); its input's keyboard attributes, upper case as typed; OK at least 44 x 44 CSS px and tappable, Enter
//         submits; the refusals on the screen; a reload keeps the name; the options card's NAME entry (title, build MENU).
// TAP-093b (backlog #340) bar: the top bar's checks alone (barChecks, no other touch check) on a DPR 2 phone, 375x667 @2 in
//         Chromium (isMobile, hasTouch; x3, a finger's target 30 px; every touch view is DPR 3), with 0, 1, 3 and 10 runes:
//         the corner MENU's target a full finger's square, 1 px clear of the rune chips, which start at tapPx + 1.
// TCH-360 (backlog #360) on a busy host: a drag's finger is down and past the touch slop at once (its touchStart and its
//         moves to the second point go back to back: sent one by one, a starved page met the first move after the game's
//         0.38 s hold, which lifts a factory, so the drag carried the KILN or the LOOM instead of drawing a belt); a check
//         reads the board once the game has registered the drag (each frame, up to about 1 s); a drag that registered
//         nothing at all is made once more (a RETRY line); after a failed check, the rest of that board's checks are SKIP
//         lines ("skipped after a failed drag"), not failures on a wrong board. The 200 ms tap rule: count, median, p95
//         and the longest; it fails when p95 is over 200 ms (or a tap was not one touch press), and each tap over 200 ms
//         is a WARN line with the 1-min load then. LOAD lines: the 1-min load at the start and end of the run and of each
//         view.
// CUSTOM-2b (REQ-BFG-072) customize, newstyle, roadfork: the styles' screens by real touch (a click on the desk), on every
//         phone above plus the 360x640 @2 and 375x667 @2 phones and the desk (--cviews), with the run's --profile
//         written before each page loads (none, or mixed: open and locked styles in every tab, two unlocks unseen):
//         customize: the title's CUSTOMIZE, the third button of the HOW TO PLAY / OPTIONS row (HOW TO PLAY and OPTIONS
//           keep their size and still open their cards; NEW RUN spans the wider row) and its NEW dot (read back off the
//           canvas: on exactly while an unlock is unseen, gone after the visit); CUSTOMIZE at its own scale
//           (customizeScale), BACK, the three tabs and the five rows a tab as the targets bb.profile().customize.L names,
//           44 CSS px tall on a phone; a tap on an open row wears and saves it, on a locked row previews it only (PREVIEW:
//           NOT YOURS YET. in its band), a tab brings back what you wear; BACK and ESC leave without wearing a preview;
//           a reload keeps the choice;
//         newstyle: a 10-0 summary with and without NEW STYLE lines: NEW RUN and TITLE the same targets either way;
//         roadfork: the road fork and event (over the sea since CUSTOM-2a): a tap through each, and every target's region
//           in <name>-roadfork.json for a comparison with 8fbba9d's build.
// CUSTOM-3 (REQ-BFG-074) customize: the fourth tab, CARRIER: its target with the other three (four tabs, each a finger's
//         target on a phone), its five rows by a tap (open ones worn and saved, locked ones previewed with PREVIEW: NOT YOURS
//         YET.; one screenshot of a locked carrier preview a view), BACK and ESC from a locked carrier preview leave without
//         wearing it, and the reload keeps the carrier choice. --profile mixed adds carrier styles: ADMIRAL'S BLUE open and
//         worn, IRONCLAD open and unseen, STORMCALLER and CHAMPION'S GOLD locked.
// Usage: npm run build && node scripts/touchcheck.mjs <outDir> [--dist <dir>] [--only touch,mouse,319,names,bar,customize,
//        newstyle,roadfork,scout,foecard,shaperotate] [--tag after] [--name touchcheck] [--profile none|mixed] [--cviews phone,...,desk]
//        [--views phone,phone-660,phone-land,wk-phone,wk-phone-660,wk-phone-land,wk-iphone13,wk-iphone15pm]
// Exit 1 if a check fails. Writes <outDir>/<name>.log, <name>.json, <name>-mouse.json and the screenshots.

import { chromium, devices, webkit } from "playwright-core";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { loadavg } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { VIEWS } from "./shots-list.mjs";
import { settle, sleep } from "./playthrough.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const DIST = resolve(opt("dist", join(ROOT, "dist")));
const OUT = resolve(args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--"))) ?? join(ROOT, "shots", "touchcheck"));
// PACKS M2: + names; TAP-093b: + bar; CUSTOM-2b (REQ-BFG-072): + customize, newstyle, roadfork; SCOUT-1 (REQ-BFG-076): + scout;
// SCOUT-1c (REQ-BFG-082): + foecard; SHAPES-1 (REQ-BFG-086 S3): + shaperotate
const ONLY = opt("only", "touch,mouse,319,names,bar,customize,newstyle,roadfork,scout,foecard,shaperotate").split(",").map((s) => s.trim());
const TAG = opt("tag", "after");
const NAME = opt("name", "touchcheck");
/** CUSTOM-2b (REQ-BFG-072): --profile: the player profile (beltbattles.profile.v1) every page of the run starts with,
 *  written before the page loads (as scripts/customshots.mjs profile() does): "none" (the default: no key, a fresh
 *  player, which the game seeds) or "mixed" (CUSTOM-1's mock player: open and locked styles in every tab, two unlocks not
 *  yet seen, so the title shows CUSTOMIZE's NEW dot; it wears TIMBER DECK, BLUED STEEL and BRASSBOUND). "allopen" (every
 *  style open and seen) is the newstyle check's own. */
const PROFILE_KEY = "beltbattles.profile.v1";
// CUSTOM-3: + ADMIRAL'S BLUE (3 finished runs; seen) and IRONCLAD (5 warlords; unseen) in the mixed player's unlocks
const MIXED_UNLOCKED = ["style:floor.timber", "style:floor.tread", "style:floor.checker", "style:belt.verdigris", "style:belt.blued", "style:carrier.admiral", "style:panel.brass", "style:panel.timber", "style:carrier.ironclad"];
const CATALOGUE = {
  floor: ["plate", "timber", "tread", "checker", "rune"], belt: ["iron", "verdigris", "blued", "timber", "rune"], panel: ["slate", "brass", "verdigris", "timber", "plum"],
  carrier: ["war", "admiral", "ironclad", "storm", "gold"], // CUSTOM-3 (REQ-BFG-074)
};
const ALL_STYLES = Object.entries(CATALOGUE).flatMap(([s, ids]) => ids.slice(1).map((id) => `style:${s}.${id}`));
const PROFILES = {
  none: null,
  mixed: {
    v: 1, counters: { runs: 4, runsFinished: 3, flawless: 0, duskWins: 9, bestDay: 10, warlordWins: 5, matriarchWins: 0, mostBelts: 3 },
    heroesWon: ["furnace"], heroesFinished: ["furnace"], unlocked: MIXED_UNLOCKED, chosen: { floor: "timber", belt: "blued", panel: "brass", carrier: "admiral" },
    seen: MIXED_UNLOCKED.slice(0, 6), folded: [], runNew: null, updatedAt: 1,
  },
  allopen: {
    v: 1, counters: { runs: 99, runsFinished: 9, flawless: 1, duskWins: 99, bestDay: 10, warlordWins: 9, matriarchWins: 9, mostBelts: 9 },
    heroesWon: ["furnace", "weaver", "foundry"], heroesFinished: ["furnace", "weaver", "foundry"], unlocked: ALL_STYLES,
    chosen: { floor: "plate", belt: "iron", panel: "slate", carrier: "war" }, seen: ALL_STYLES, folded: [], runNew: null, updatedAt: 1,
  },
};
const PROFILE = opt("profile", "none");
if (!(PROFILE in PROFILES)) throw new Error(`--profile ${PROFILE}: one of ${Object.keys(PROFILES).join(", ")}`);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };

/** shoptap2: Playwright's iPhone descriptors (Safari's user agent, DPR 3, isMobile, hasTouch; viewport: Safari's visible
 *  area), without their default browser. */
const IPHONE = (({ defaultBrowserType, ...d }) => d)(devices["iPhone 13"]);
const IPHONE_MAX = (({ defaultBrowserType, ...d }) => d)(devices["iPhone 15 Pro Max"]);
const VIEW = {
  phone: VIEWS.phone, // 390x844 @3: the operator's iPhone's screen (no browser gives a page all of it)
  "phone-660": { viewport: { width: 390, height: 660 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, // shoptap2: Safari's share of it
  "phone-land": { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  // shoptap2: WebKit with the iPhone descriptors, on the three views and on the descriptors' own (Safari's visible area)
  "wk-phone": { ...IPHONE, viewport: { width: 390, height: 844 } },
  "wk-phone-660": { ...IPHONE, viewport: { width: 390, height: 660 } },
  "wk-phone-land": { ...IPHONE, viewport: { width: 844, height: 390 } },
  "wk-iphone13": IPHONE, // 390x664
  "wk-iphone15pm": IPHONE_MAX, // 430x739
  // zoom (REQ-BFG-040): the operator's page area in Edge for iOS on his iPhone (his screenshot: 1206x2622 at DPR 3)
  "wk-op-690": { ...IPHONE, viewport: { width: 402, height: 690 } },
  small: VIEWS.small, // 360x640 @2
  desk: VIEWS.desk, // 1920x1080 @1, the mouse
  // TAP-093b (backlog #340): a DPR 2 phone (the iPhone SE class: x3, a finger's target 30 px) for the bar-only section
  "bar-667": { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  // SCOUT-1 (REQ-BFG-076): the scout section's other views (design call 4)
  "phone-430": { viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  laptop: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 },
  "laptop-720": { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
};
/** shoptap2: the browser a view runs in. */
const ENGINE = (vname) => (vname.startsWith("wk-") ? "webkit" : "chromium");
const TOUCH_VIEWS = opt("views", "phone,phone-660,phone-land,wk-phone,wk-phone-660,wk-phone-land,wk-iphone13,wk-iphone15pm,wk-op-690").split(",").map((s) => s.trim());
/** zoom (REQ-BFG-040, A1): the portrait phone views where every panel a tap opens must sit inside the band (not grown over
 *  the bow or the shop) with its full description (D3). */
const FIT_VIEWS = new Set(["wk-op-690", "wk-phone", "wk-phone-660", "wk-iphone13", "wk-iphone15pm", "phone", "phone-660"]);
/** Each tap three times: its finger drifts 3, 5 and 8 CSS px (at 0, 90 and 225 degrees) before it lifts. */
const DRIFTS = [[3, 0], [5, 90], [8, 225]];
const TAP_CSS = 44;

mkdirSync(OUT, { recursive: true });
const lines = [];
const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
const log = (s) => { lines.push(s); console.log(s); };
const checks = [];
const check = (ok, what) => { checks.push({ ok: !!ok, what }); log(`${ok ? "PASS" : "FAIL"}  ${what}`); };
const shots = [];
const tapMs = [];
const mouseSeen = [];
/** TCH-360: the host's 1-min load (os.loadavg), and a LOAD line at the run's and each view's start and end. */
const load1 = () => loadavg()[0].toFixed(2);
const loadLine = (what) => { const [a, b, c] = loadavg(); log(`LOAD  [${at()}] ${what}: 1-min load ${a.toFixed(2)} (5-min ${b.toFixed(2)}, 15-min ${c.toFixed(2)})`); };
/** TCH-360 (2d): the view whose taps are timed now (a WARN line names it). */
let viewNow = "";
/**
 * TCH-360 (2c): no cascade after a failed drag. Each board (openDeck) starts clean; once a check on it fails, the rest of
 * that board's checks (bcheck: the drag blocks and the upgrades between their drags) are SKIP lines, "skipped after a
 * failed drag", instead of failures read off a wrong board. The failed check still fails the run; a SKIP line is no
 * check (TOUCH CHECKS counts it apart), so the count of real failures stays honest.
 */
let boardFail = null;
const skips = [];
const retries = [];
const bcheck = (ok, what) => {
  if (boardFail !== null) {
    skips.push({ what, after: boardFail });
    log(`SKIP  ${what}: skipped after a failed drag on this board ("${boardFail.slice(0, 120)}")`);
    return;
  }
  check(ok, what);
  if (!ok) boardFail = what;
};

/** dist/ on 127.0.0.1. */
function pageServer() {
  const srv = createServer((req, res) => {
    let p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^\/+/, "");
    if (!p || p.endsWith("/")) p += "index.html";
    try {
      const body = readFileSync(join(DIST, p));
      res.writeHead(200, { "content-type": TYPES[extname(p)] ?? "application/octet-stream", "cache-control": "no-store" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok({ srv, origin: `http://127.0.0.1:${srv.address().port}` })));
}

/**
 * shoptap2: the touch input for a page, one interface for both engines: send("Input.dispatchTouchEvent", { type,
 * touchPoints }) and `page`. Chromium: its CDP session. WebKit: Playwright's own WebKit protocol, the same command on the
 * page proxy session page.touchscreen.tap sends Input.dispatchTapEvent on (reached through the in-process Playwright's
 * toImpl); its points are integer CSS px, and its touchEnd names the point that lifts.
 */
async function touchSession(ctx, page, engine) {
  if (engine === "chromium") {
    const cdp = await ctx.newCDPSession(page);
    cdp.page = page;
    return cdp;
  }
  const impl = page._connection?.toImpl?.(page);
  const sess = impl?.delegate?.rawTouchscreen?._pageProxySession;
  if (!sess) throw new Error("WebKit: Playwright's page proxy session is not reachable (playwright-core internals changed)");
  let last = { x: 0, y: 0, id: 1 };
  return {
    page,
    send(method, p) {
      if (method !== "Input.dispatchTouchEvent") throw new Error(`WebKit touch session: ${method} is not a touch event`);
      const pts = (p.touchPoints ?? []).map((t) => ({ x: Math.round(t.x), y: Math.round(t.y), id: t.id ?? 1 }));
      if (pts.length) last = pts[0];
      return sess.send("Input.dispatchTouchEvent", { type: p.type, touchPoints: p.type === "touchEnd" || p.type === "touchCancel" ? [last] : pts });
    },
  };
}

/** CUSTOM-2b (REQ-BFG-072): `init.profile`: the player profile the page starts with (undefined: the run's --profile;
 *  null: none), written before the game loads and only while the key is absent (a reload keeps what the game saved);
 *  `init.name`: a player name stored the same way (the title's buttons open the name screen first without one). */
async function openPage(browsers, origin, vname, init = {}) {
  const engine = ENGINE(vname), browser = browsers[engine];
  if (!browser) throw new Error(`${vname}: ${engine} is not running`);
  const ctx = await browser.newContext(VIEW[vname]);
  const page = await ctx.newPage();
  const prof = init.profile === undefined ? PROFILES[PROFILE] : init.profile;
  if (prof || init.name) {
    await page.addInitScript(([pk, p, nk, n]) => {
      if (p && localStorage.getItem(pk) === null) localStorage.setItem(pk, p);
      if (n && localStorage.getItem(nk) === null) localStorage.setItem(nk, n);
    }, [PROFILE_KEY, prof ? JSON.stringify(prof) : null, "beltbattles.name.v1", init.name ?? null]);
  }
  // each touch press's length as the page saw it: pointerdown to pointerup, timed in the page (performance.now)
  await page.addInitScript(() => {
    window.__taps = [];
    addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") window.__tapStart = performance.now(); }, true);
    addEventListener("pointerup", (e) => {
      if (e.pointerType !== "mouse" && window.__tapStart != null) window.__taps.push({ ms: performance.now() - window.__tapStart, type: e.pointerType });
      window.__tapStart = null;
    }, true);
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
  await page.goto(`${origin}/index.html`);
  await page.waitForFunction(() => !!window.bb, null, { timeout: 15000 });
  const cdp = VIEW[vname].hasTouch ? await touchSession(ctx, page, engine) : null;
  return { ctx, page, cdp, errors };
}

const K = (x, y) => y * 10 + x;
const KILN_BELT = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const PRESS_BELT = [K(6, 5), K(6, 4), K(6, 3), K(6, 2), K(6, 1), K(5, 1), K(5, 0)];
/** FURNACE at a day-3 dawn with 5 gold: the KILN (its signature factory, one output) and a STAMP PRESS (one output), each
 *  with its belt into the turret; a TEMPER working the KILN's belt; an OVERDRIVE (an X rig) between the belts; a bought
 *  BOMBARD in TURRET SLOT 2 with a PRESSURE BREECH core and a HOPPER; a GALVANIC COIL in cargo; the shop's first card a
 *  GREASE WORKS for 3 gold (affordable), its second a GANTRY PRESS for 7 (not). */
const FURNACE = {
  hero: "furnace", day: 3, gold: 5, beltCap: 40,
  items: [
    { uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "press", x: 6, y: 6 }, { uid: 3, def: "temper", x: 3, y: 3, rot: 1 },
    { uid: 4, def: "overdrive", x: 5, y: 3 },
  ],
  routes: [{ factory: 1, cells: KILN_BELT }, { factory: 2, cells: PRESS_BELT }],
  turrets: [{ slot: 0, def: "scrapcannon", uid: 90, free: true }, { slot: 1, def: "bombard", uid: 700 }],
  mods: [{ uid: 950, def: "pressure", turret: 1 }, { uid: 951, def: "hopper", turret: 1 }],
  inventory: [{ uid: 60, def: "coil" }],
  offers: [["grease", 3], ["gantry", 7]],
};
/** bb-0.8.3 (REQ-BFG-044 D6, REQ-BFG-043 D10): FURNACE at a day-3 dawn with 25 gold (two 10-gold upgrades and 5 over;
 *  day 3's most is 27): the KILN alone with its belt up column 4, the starting SCRAP CANNON (the free copy) in TURRET
 *  SLOT 1 and the BOMBARD in TURRET SLOT 2 (columns 8 and 9), no upgrade bought, the shop as rolled (D9 is void: no
 *  caravan sells a KILN; was 9 gold and a KILN copy for 3). KILN_SECOND: up column 5; KILN_THIRD: round into column 8. */
const KILN_DECK = {
  hero: "furnace", day: 3, gold: 25, beltCap: 40, items: [{ uid: 1, def: "kiln", x: 4, y: 6 }],
  routes: [{ factory: 1, cells: KILN_BELT }], turrets: [{ slot: 0, def: "scrapcannon", uid: 90, free: true }, { slot: 1, def: "bombard", uid: 700 }],
  mods: [], inventory: [], offers: [],
};
const KILN_SECOND = [K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)];
const KILN_THIRD = [K(6, 6), K(7, 6), K(8, 6), K(8, 5), K(8, 4), K(8, 3), K(8, 2), K(8, 1), K(8, 0)];
/** bb-0.8.3 (REQ-BFG-043 D11): edit.ts fullNotice for the hero's own factory below level 4 (was "· ★2 OPENS A 3RD"). */
const FULL_KILN = "KILN'S 2 BELTS ARE IN USE · UPGRADE FOR A 3RD";
/** WEAVER at a day-3 dawn: the LOOM (three outputs) with one belt up column 4. bb-0.8.3: 15 gold (was 5), for its
 *  FACTORY upgrade. LOOM_FOURTH: its fourth belt after the upgrade, out of its foot at (5, 7) to (7, 8). */
const WEAVER = {
  hero: "weaver", day: 3, gold: 15, beltCap: 40, items: [{ uid: 1, def: "loom", x: 4, y: 6 }],
  routes: [{ factory: 1, cells: KILN_BELT }], mods: [], inventory: [], offers: [],
};
const LOOM_FOURTH = [K(6, 7), K(7, 7), K(7, 8)];
/** bb-0.8.3 (REQ-BFG-043 D11): the board's level numerals in the 3x5 face (render/font.ts F3), row by row, and the two
 *  colours of a level mark (render/levelMark.ts: palette.ts C.yellow on C.ink). */
const GLYPH3 = { 2: "###|..#|###|#..|###", 3: "###|..#|###|..#|###", 4: "#.#|#.#|###|..#|..#" };
const YELLOW = [246, 207, 72], INK = [5, 11, 18];

/** Open the build screen on `deck` (bb.openDawn, then the deck set on the run in place and the screen told). */
async function openDeck(page, deck) {
  boardFail = null; // TCH-360 (2c): a fresh board
  await page.keyboard.press("Escape").catch(() => {});
  await page.evaluate((d) => window.bb.openDawn({ hero: d.hero, day: d.day, gold: d.gold, seed: 12345 }), deck);
  await settle(page, "build");
  await page.waitForFunction(() => window.bb.game.screen.caravan.ready, null, { timeout: 10000 });
  await page.evaluate((d) => {
    const g = window.bb.game, r = g.run, b = r.build, s = g.screen;
    b.items = JSON.parse(JSON.stringify(d.items));
    b.routes = JSON.parse(JSON.stringify(d.routes));
    b.mods = JSON.parse(JSON.stringify(d.mods));
    if (d.turrets) b.turrets = JSON.parse(JSON.stringify(d.turrets));
    // bb-0.8.3 (REQ-BFG-043 D10): the deck's upgrade levels (none: level 1 on both tracks, as a new run)
    if (d.upgrades) b.upgrades = { ...d.upgrades };
    else delete b.upgrades;
    b.beltCap = d.beltCap;
    r.inventory = JSON.parse(JSON.stringify(d.inventory));
    r.gold = d.gold;
    r.nextUid = Math.max(r.nextUid ?? 0, 300);
    const list = r.shop.wagons.flatMap((w) => w.offers);
    d.offers.forEach(([def, price], i) => { list[i].def = def; list[i].price = price; list[i].sold = false; });
    s.touched();
    s.select({ kind: "none" });
    for (let i = 0; i < 3; i++) g.step(1 / 60);
    g.render();
  }, deck);
  await sleep(120);
}

/** In-page client points: a deck cell's centre, a shop card's, a turret slot's, a cargo slot's, a UI region's. */
const cell = (page, x, y) => page.evaluate(([cx, cy]) => {
  // ZOOM-1 (REQ-BFG-080): through the carrier's own zoom where the build has it (BuildScreen.tileCentre)
  const s = window.bb.game.screen;
  if (typeof s.tileCentre === "function") { const p = s.tileCentre(cx, cy); return window.bb.toClient(p.x, p.y); }
  const f = s.L.frame, D = 120;
  const sx = f.facing === 0 || f.facing === 2 ? f.dx + cx * 12 : f.facing === 1 ? f.dx + D - (cy + 1) * 12 : f.dx + cy * 12;
  const sy = f.facing === 0 ? f.dy + cy * 12 : f.facing === 2 ? f.dy + D - (cy + 1) * 12 : f.dy + cx * 12;
  return window.bb.toClient(sx + 6, sy + 6);
}, [x, y]);
const card = (page, i) => page.evaluate((n) => { const r = window.bb.game.screen.L.cards[n]; return window.bb.toClient(r.x + r.w / 2, r.y + r.h / 2); }, i);
const turret = (page, i) => page.evaluate((n) => { const r = window.bb.game.screen.turretRect(n); return window.bb.toClient(r.x + r.w / 2, r.y + r.h / 2); }, i);
const slot = (page, i) => page.evaluate((n) => { const r = window.bb.game.screen.slotRect(n); return window.bb.toClient(r.x + r.w / 2, r.y + r.h / 2); }, i);
const region = (page, id) => page.evaluate((i) => window.bb.regions().filter((q) => q.id === i).pop() ?? null, id);
/** PACKS: a UI region once the screen has drawn it (after a page load or a reload the title lays its buttons out a frame
 *  later; reading at once could find none under load: touch-5bffd7d's names phone section). */
const regionDrawn = async (page, id) => {
  await page.waitForFunction((i) => window.bb.regions().some((q) => q.id === i), id, { timeout: 10000 }).catch(() => {});
  return region(page, id);
};
const centre = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** The run as it stands: gold, the build, cargo and the shop (serialized). */
const snap = (page) => page.evaluate(() => {
  const r = window.bb.game.run;
  return JSON.stringify({ gold: r.gold, build: r.build, inventory: r.inventory, offers: r.shop.wagons.map((w) => w.offers.map((o) => [o.def, o.price, !!o.sold])) });
});
/** bb-0.8.3 (run 4, U2): look waits for the game's next frame first (two animation frames), so the panel and the UI
 *  regions it reads are the ones the game's own loop drew after the last input: on a loaded machine the 150 ms a tap waits
 *  could pass without a frame, and the panel read as not drawn. What it checks is unchanged. */
const nextFrame = (page) => page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok(true)))));
const look = async (page) => (await nextFrame(page), lookNow(page));
const lookNow = (page) => page.evaluate(() => {
  const g = window.bb.game, s = g.screen;
  // shoptap2: the details panel as drawn last frame (its UI region, CSS px) and the visible viewport it must lie in
  const box = window.bb.regions().filter((q) => q.id === "details").pop() ?? null;
  const vv = window.visualViewport;
  const vis = { x: vv ? vv.offsetLeft : 0, y: vv ? vv.offsetTop : 0, w: vv ? vv.width : innerWidth, h: vv ? vv.height : innerHeight };
  const x0 = Math.max(0, vis.x), y0 = Math.max(0, vis.y), x1 = Math.min(innerWidth, vis.x + vis.w), y1 = Math.min(innerHeight, vis.y + vis.h);
  const inside = !!box && box.x >= x0 - 0.01 && box.y >= y0 - 0.01 && box.x + box.w <= x1 + 0.01 && box.y + box.h <= y1 + 0.01;
  // zoom (REQ-BFG-040): the portrait band (CSS px) and whether the panel as drawn lies in it (not grown past it)
  const a = s.L.info, p = window.bb.toClient(a.x, a.y), q = window.bb.toClient(a.x + a.w, a.y + a.h);
  const band = s.L.portrait ? { x: p.x, y: p.y, w: q.x - p.x, h: q.y - p.y } : null;
  const inBand = !!box && !!band && box.x >= band.x - 0.51 && box.y >= band.y - 0.51 && box.x + box.w <= band.x + band.w + 0.51 && box.y + box.h <= band.y + band.h + 0.51;
  // ZOOM-1 (REQ-BFG-080, call 5): a panel grown up over the shop rows from the band (its foot at the band's foot, never
  // over the carrier under it)
  const grownUp = !!box && !!band && !inBand && box.y + box.h <= band.y + band.h + 0.51 && box.y < band.y;
  return {
    sel: s.sel, carry: s.ed.carry ? s.ed.carry.def : null, draw: s.ed.draw ? { ...s.ed.draw, cells: [...s.ed.draw.cells] } : null,
    toasts: g.toastLog.length, panel: typeof window.bb.panel === "function" ? window.bb.panel() : null, gold: g.run.gold,
    box, inside, vis: { x: x0, y: y0, w: Math.round(x1 - x0), h: Math.round(y1 - y0) }, band, inBand, grownUp,
  };
});
/** zoom (REQ-BFG-040, A1): on a portrait phone view (FIT_VIEWS) the panel a tap opened sits inside the band, drawn no
 *  bigger than it (not grown over the bow or the shop), fully inside the visible viewport, with its full description
 *  (panelInfo's `full`: its kept text whole, the full body's text, every rule sentence, no phone cut; its flavour and hint
 *  may give way, and its form is reported). */
// ZOOM-1 (REQ-BFG-080, call 5): a phone's band is sized for 90% of the panels; the rest grow up over the shop rows, never
// over the carrier: in the band, or grown up from it (grownUp), with the full description (was: in the band only)
const fitted = (l) => !!l.panel && (l.inBand || l.grownUp) && l.inside && l.panel.full === true;
const fdesc = (l) => (!l.panel ? "no panel" : `${l.box ? `${l.box.w.toFixed(0)}x${l.box.h.toFixed(0)} CSS px at y ${l.box.y.toFixed(0)}` : "not drawn"} ${l.inBand ? "inside" : l.grownUp ? "grown up over the shop from" : "NOT inside"} the band${l.band ? ` (${l.band.h.toFixed(0)} CSS px at y ${l.band.y.toFixed(0)})` : ""}; ${l.panel.full === true ? "its full description" : l.panel.full === false ? "NOT its full description" : "full description unknown"}${l.panel.fullest ? ", every block (variant 0)" : l.panel.full ? ` (variant ${l.panel.variant}${l.panel.dropped.length ? `, ${l.panel.dropped.join("/")} gave way` : ""})` : ""}`);
function fitCheck(vname, V, what, l) {
  if (FIT_VIEWS.has(vname)) check(fitted(l), `${V}: A1 ${what}: its panel ${fdesc(l)}`);
}
/** shoptap2: a UI region (CSS px) lies fully inside the visible viewport `look` measured. */
const inView = (r, l) => !!r && r.x >= l.vis.x - 0.01 && r.y >= l.vis.y - 0.01 && r.x + r.w <= l.vis.x + l.vis.w + 0.51 && r.y + r.h <= l.vis.y + l.vis.h + 0.51;
/** shoptap2: the panel a tap opened shows its description: drawn, titled `title`, at least one body line, its kept text
 *  whole, fully inside the visible viewport. */
const shown = (l, title) => !!l.panel && (title === undefined || l.panel.title === title) && l.panel.lines.length > 0 && l.panel.whole && !!l.box && l.inside;
const pdesc = (l) => (!l.panel ? "no panel" : `"${l.panel.title}", ${l.panel.lines.length} body lines${l.panel.whole ? "" : " (its kept text cut)"}, ${l.box
  ? `drawn ${l.box.w.toFixed(0)}x${l.box.h.toFixed(0)} at (${l.box.x.toFixed(0)}, ${l.box.y.toFixed(0)}) ${l.inside ? "inside" : "NOT inside"} the visible ${l.vis.w}x${l.vis.h}`
  : "NOT DRAWN"}`);
const toastsSince = (page, n) => page.evaluate((i) => window.bb.game.toastLog.slice(i), n);
const rotOf = (page, uid) => page.evaluate((u) => window.bb.game.run.build.items.find((p) => p.uid === u)?.rot ?? 0, uid);
const kview = (page) => page.evaluate(() => { const v = window.bb.game.view; return { k: v.scale / v.dpr, W: v.W, H: v.H, scale: v.scale, dpr: v.dpr }; });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** bb-0.8.3 (REQ-BFG-043 D11): the board's level marks of `track` as drawn now: BuildScreen.levelMarks() (logical px,
 *  render/levelMark.ts), each read back off the canvas (logical px, one canvas px each) right after a fresh frame: `px`,
 *  how many of its 3x5 numeral's 15 pixels show its level's glyph, yellow on ink (15: the numeral drawn whole). The game's
 *  canvas is copied into a scratch canvas made for reading (willReadFrequently), so the game's own canvas is never read
 *  back by getImageData (Chromium warns on the console about repeated readbacks, and the console must stay clean). */
const marksOf = (page, track) => page.evaluate(([tr, glyphs, yellow, ink]) => {
  const g = window.bb.game, s = g.screen;
  g.step(1 / 60);
  g.render();
  const marks = (typeof s.levelMarks === "function" ? s.levelMarks() : []).filter((m) => m.track === tr);
  if (!marks.length) return [];
  const scratch = document.createElement("canvas");
  scratch.width = g.canvas.width;
  scratch.height = g.canvas.height;
  const cx = scratch.getContext("2d", { willReadFrequently: true });
  cx.drawImage(g.canvas, 0, 0);
  const near = (d, k, c) => Math.abs(d[k] - c[0]) <= 3 && Math.abs(d[k + 1] - c[1]) <= 3 && Math.abs(d[k + 2] - c[2]) <= 3;
  // ZOOM-1 (REQ-BFG-080): the marks are in the carrier's space (its own zoom, BuildScreen.carrierView) and the canvas runs on
  // its grid (sub canvas px per logical px): each numeral pixel is read at its centre through both (k 1, sub 1: as before)
  const cv = typeof s.carrierView === "function" ? s.carrierView() : { k: 1, x: 0, y: 0, sub: 1 };
  const at = (x, y) => [Math.floor((cv.x + cv.k * (x - cv.x)) * cv.sub), Math.floor((cv.y + cv.k * (y - cv.y)) * cv.sub)];
  return marks.map((m) => {
    const rows = (glyphs[m.text] ?? "").split("|");
    let px = 0;
    for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) {
      const [qx, qy] = at(m.x + 1 + i + 0.5, m.y + 1 + j + 0.5), d = cx.getImageData(qx, qy, 1, 1).data;
      if (rows[j] && near(d, 0, rows[j][i] === "#" ? yellow : ink)) px++;
    }
    return { ...m, px };
  });
}, [track, GLYPH3, YELLOW, INK]);
const mdesc = (ms) => (ms.length ? ms.map((m) => `"${m.text}" (level ${m.level}) at (${m.x}, ${m.y}) ${m.w}x${m.h} px, its numeral ${m.px}/15 px as drawn`).join("; ") : "none");

async function shot(page, name) {
  await page.evaluate(() => { const g = window.bb.game; g.step(1 / 60); g.render(); });
  await page.screenshot({ path: join(OUT, name) });
  shots.push(name);
}

// ---------------------------------------------------------------------------------------------------- real touch input
const tp = (p) => ({ x: p.x, y: p.y, id: 1, radiusX: 4, radiusY: 4, force: 1 });

/** A finger's tap at `p`: right after a frame, down and a drift of `css` CSS px at `deg` degrees in two moves (sent back
 *  to back: queued in order on one CDP session), held about 30 ms (the game's frames run meanwhile), then up; its length
 *  is what the page timed, pointerdown to pointerup. */
async function tap(cdp, p, css = 0, deg = 0) {
  const a = (deg * Math.PI) / 180, q = { x: p.x + css * Math.cos(a), y: p.y + css * Math.sin(a) };
  const n0 = await cdp.page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => ok(window.__taps.length))));
  const ev = [{ type: "touchStart", touchPoints: [tp(p)] }];
  if (css) ev.push({ type: "touchMove", touchPoints: [tp({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 })] }, { type: "touchMove", touchPoints: [tp(q)] });
  await Promise.all(ev.map((e) => cdp.send("Input.dispatchTouchEvent", e)));
  await sleep(30);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const seen = await cdp.page.evaluate((n) => window.__taps.slice(n), n0);
  tapMs.push(seen.length === 1 && seen[0].type === "touch" ? seen[0].ms : Infinity); // one touch press a tap, timed
  // TCH-360 (2d): a tap over 200 ms (or not one touch press) is a WARN line with the 1-min load now, so a real slow path
  // still shows under the p95 rule; 150-200 ms as before
  const ms = tapMs[tapMs.length - 1];
  if (!(ms <= 200)) log(`WARN  [${at()}] ${viewNow}: a tap ${Number.isFinite(ms) ? `of ${ms.toFixed(1)} ms, over 200 ms` : `that was not one touch press (${JSON.stringify(seen)})`}, at (${p.x.toFixed(0)}, ${p.y.toFixed(0)}), after "${(checks[checks.length - 1]?.what ?? "").slice(0, 140)}"; 1-min load ${load1()}`);
  else if (!(ms < 150)) log(`[${at()}] a slow tap: ${JSON.stringify(seen)} at (${p.x.toFixed(0)}, ${p.y.toFixed(0)}), after "${(checks[checks.length - 1]?.what ?? "").slice(0, 140)}"`);
  await sleep(150);
}

/** A finger's drag through `pts` (client points), a move every 6 CSS px; `release` false leaves it down (call up()).
 *  TCH-360: the finger is down and past the 10 CSS px touch slop at once: the touchStart and the moves up to the first one
 *  11 CSS px from it go back to back, queued in order on one CDP session as a tap's are; the rest as before, one by one.
 *  Sent one by one (each awaited), a starved page met the first move past the slop over 0.38 s after the press, the
 *  game's hold that lifts a factory (edit.ts Editor.update), so the drag carried the KILN or the LOOM instead of drawing
 *  a belt (TAP-093b runs 1 and 2). A release sends touchEnd alone: dragStep waits for the game to register the drag. */
async function drag(cdp, pts, release = true) {
  const moves = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 6));
    for (let k = 1; k <= n; k++) moves.push({ p: { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n }, end: k === n });
  }
  const j = moves.findIndex((m) => Math.hypot(m.p.x - pts[0].x, m.p.y - pts[0].y) >= 11);
  const lead = moves.slice(0, j < 0 ? 1 : j + 1);
  await Promise.all([{ type: "touchStart", touchPoints: [tp(pts[0])] }, ...lead.map((m) => ({ type: "touchMove", touchPoints: [tp(m.p)] }))].map((e) => cdp.send("Input.dispatchTouchEvent", e)));
  if (lead[lead.length - 1].end) await sleep(25);
  for (const m of moves.slice(lead.length)) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [tp(m.p)] });
    if (m.end) await sleep(25);
  }
  await sleep(120);
  if (release) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
const up = async (cdp) => { await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await sleep(150); };

/** TCH-360: what a drag can change, read in the page: the run (gold, the build, cargo, the shop, as snap), the toasts so
 *  far and the editor's gesture (a press, a draw, a carry); `frame`: read after the game's next animation frame. */
const dragState = (page, frame) => page.evaluate(async (fr) => {
  if (fr) await new Promise((ok) => requestAnimationFrame(() => ok()));
  const g = window.bb.game, r = g.run, e = g.screen.ed;
  return {
    run: JSON.stringify({ gold: r.gold, build: r.build, inventory: r.inventory, offers: r.shop.wagons.map((w) => w.offers.map((o) => [o.def, o.price, !!o.sold])) }),
    toasts: g.toastLog.length, press: !!e.press, draw: e.draw ? e.draw.cells.length : null, carry: e.carry ? e.carry.def : null,
  };
}, frame);

/**
 * TCH-360 (2a, 2b): a drag (drag()) the game must register before its check reads the board. After the finger lifts it
 * reads, each frame for up to about 1 s, until the editor is idle (no press, draw or carry) and the run or the toasts
 * changed; a drag left down (`release` false) until the press reads as a drag (a draw, a carry or a new toast). One that
 * registered nothing at all (the editor idle, the run and the toasts as before the drag) is made once more, with a RETRY
 * line naming the view and the step; a retry that registers nothing again fails its check as before. A drag that
 * registered anything, right or wrong, is never made again. A drag left down is waited for, never made again (the finger
 * is still down for its check).
 */
async function dragStep(page, cdp, V, step, pts, release = true) {
  for (let attempt = 1; ; attempt++) {
    const s0 = await dragState(page, false), t1 = Date.now();
    await drag(cdp, pts, release);
    const t2 = Date.now();
    let s = s0, frames = 0, ok = false;
    do {
      s = await dragState(page, true);
      frames++;
      const changed = s.run !== s0.run || s.toasts > s0.toasts;
      ok = release ? !s.press && s.draw === null && s.carry === null && changed : !s.press && (s.draw !== null || s.carry !== null || changed);
    } while (!ok && Date.now() - t2 < 1000);
    const nothing = !ok && !s.press && s.draw === null && s.carry === null && s.run === s0.run && s.toasts === s0.toasts;
    const how = `${Date.now() - t2} ms and ${frames} frames after the finger ${release ? "lifted" : "stopped"} (the drag took ${t2 - t1} ms); the editor ${s.press ? "still holds the press" : s.draw !== null ? `still draws (${s.draw} tiles)` : s.carry !== null ? `still carries the ${s.carry}` : "idle"}; 1-min load ${load1()}`;
    if (ok) {
      if (attempt > 1) log(`RETRY  ${V}: ${step}: the retry registered (${how})`);
      return true;
    }
    if (nothing && release && attempt > 1) {
      log(`RETRY  ${V}: ${step}: the retry registered nothing either (${how}); its check fails as before`);
      return false;
    }
    if (!nothing || !release) {
      log(`[${at()}] ${V}: ${step}: the drag wasn't registered as expected (${how}); its check reads the board as it is`);
      return false;
    }
    retries.push({ view: V, step });
    log(`RETRY  ${V}: ${step}: the drag registered nothing (the run and the toasts unchanged ${how}); once more`);
  }
}
const cells = (page, list) => Promise.all(list.map(([x, y]) => cell(page, x, y)));
const dist = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);

/**
 * bb-0.8.3 (REQ-BFG-043 D10, D11): buy level 2 of `track` by touch on `what`, at level 1 with at least 10 gold. A tap on
 * the part (`where`) opens its panel (titled `title`, its description in the visible viewport) led by UPGRADE 10G, a 44
 * CSS px target in the visible viewport, and the board marks nothing yet; a tap on the button: the gold drops by 10, the
 * build's level on `track` is 2 and nothing else in the build, cargo or the shop changes, the panel stays on the part
 * and offers the next level (UPGRADE 20G; a FACTORY panel says "LEVEL 2/4"), and the board marks it with a 2 (`key`:
 * the mark's uid or slot), drawn whole. Returns the run before and after.
 */
async function upgradeTouch(page, cdp, V, { what, where, track, title, key }) {
  await page.keyboard.press("Escape");
  await tap(cdp, await where(), 5, 90);
  const l0 = await look(page), r = await region(page, `upgrade-${track}`), s0 = JSON.parse(await snap(page)), m0 = await marksOf(page, track);
  const lead = l0.panel?.labels?.[0] ?? null;
  bcheck(!!r && shown(l0, title) && lead === "UPGRADE 10G" && r.h >= TAP_CSS && inView(r, l0) && m0.length === 0,
    `${V}: a tap on ${what} opens its panel (${pdesc(l0)}; buttons ${JSON.stringify(l0.panel?.labels ?? null)}), its UPGRADE 10G ${r ? `a ${r.w.toFixed(1)}x${r.h.toFixed(1)} CSS px target ${inView(r, l0) ? "inside" : "NOT inside"} the visible viewport` : "MISSING"}; level 1: no mark on the board (${mdesc(m0)})`);
  if (!r) return { s0, s1: s0 };
  await tap(cdp, centre(r), 3, 0);
  const l1 = await look(page), s1 = JSON.parse(await snap(page)), m1 = await marksOf(page, track);
  const { upgrades: u0, ...b0 } = s0.build, { upgrades: u1, ...b1 } = s1.build;
  const text = l1.panel ? l1.panel.lines.join(" ") : "";
  const marked = m1.length === 1 && m1[0].level === 2 && m1[0].text === "2" && m1[0].px === 15 && m1[0][track === "factory" ? "uid" : "slot"] === key;
  bcheck(s1.gold === s0.gold - 10 && !u0?.[track] && u1?.[track] === 2 && same(b1, b0) && same(s1.inventory, s0.inventory) && same(s1.offers, s0.offers)
    && l1.panel?.labels?.[0] === "UPGRADE 20G" && (track !== "factory" || /LEVEL 2\/4/.test(text)) && shown(l1, title) && marked,
    `${V}: its UPGRADE 10G buys ${track === "factory" ? "FACTORY" : "TURRET SPEED"} level 2: gold ${s0.gold} -> ${s1.gold}, upgrades ${JSON.stringify(u0 ?? {})} -> ${JSON.stringify(u1 ?? {})}, the rest of the build, cargo and the shop unchanged; the panel now offers ${JSON.stringify(l1.panel?.labels?.[0] ?? null)}${track === "factory" ? ` and says ${JSON.stringify(text.match(/[A-Z ]*LEVEL \d\/\d/)?.[0] ?? null)}` : ""}; the board's mark: ${mdesc(m1)}`);
  return { s0, s1 };
}

/**
 * bb-0.8.6 (REQ-BFG-051, PACKS P5): the two fixed pack slots beside REROLL. Each is a UI region (pack-belt, pack-armor)
 * fully inside the visible viewport, clear of every shop card, REROLL and the other slot; on a touch view at least 44x44
 * CSS px. A tap (a click on desk) buys one: the gold drops by its price (2, 5), the belt capacity or the hull bonus rises
 * by its amount (4, 250) and the shop, cargo and the rest of the build stay as they were. With 1 gold the slot buys nothing
 * and says why ("A BELT PACK COSTS 2G", "AN ARMOR PACK COSTS 5G"). The run is put back after, so later checks see their deck.
 */
async function packChecks(page, cdp, V, how) {
  const PACKS = [["belt", 2, "beltCap", 4, "A BELT PACK COSTS 2G"], ["armor", 5, "hullBonus", 250, "AN ARMOR PACK COSTS 5G"]]; // STAGE-090 (cap's ruling bc2ad14029210996): NUM-1's x10 hull, +250 (was 25)
  await page.keyboard.press("Escape").catch(() => {});
  const press = async (p) => { if (how === "touch") await tap(cdp, p, 3, 0); else { await page.mouse.click(p.x, p.y); await sleep(150); } };
  const regions = await Promise.all(PACKS.map(([id]) => region(page, `pack-${id}`)));
  const others = await page.evaluate(() => {
    const L = window.bb.game.screen.L, c = (r) => { const p = window.bb.toClient(r.x, r.y), q = window.bb.toClient(r.x + r.w, r.y + r.h); return { x: p.x, y: p.y, w: q.x - p.x, h: q.y - p.y }; };
    return [...L.cards, L.reroll].map(c);
  });
  const hitR = (a, b) => a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01;
  for (let i = 0; i < PACKS.length; i++) {
    const [id, price, key, amount, short] = PACKS[i], r = regions[i], NAME = `${id.toUpperCase()} PACK`;
    const l0 = await look(page), s0 = JSON.parse(await snap(page));
    const clear = !!r && others.every((o) => !hitR(r, o)) && regions.every((q, j) => j === i || !q || !hitR(r, q));
    const big = !!r && (how !== "touch" || (r.w >= TAP_CSS && r.h >= TAP_CSS));
    check(!!r && big && inView(r, l0) && clear, `${V}: the ${NAME} slot is ${r ? `a ${r.w.toFixed(1)}x${r.h.toFixed(1)} CSS px target${how === "touch" ? " (at least 44x44)" : ""} ${inView(r, l0) ? "inside" : "NOT inside"} the visible viewport, ${clear ? "clear of" : "OVERLAPPING"} the shop cards, REROLL and the other slot` : "MISSING"}`);
    if (!r) continue;
    await press(centre(r));
    const s1 = JSON.parse(await snap(page));
    const { [key]: v0, ...b0 } = s0.build, { [key]: v1, ...b1 } = s1.build;
    check(s1.gold === s0.gold - price && v1 === v0 + amount && same(b1, b0) && same(s1.offers, s0.offers) && same(s1.inventory, s0.inventory),
      `${V}: a ${how === "touch" ? "tap" : "click"} on the ${NAME} buys one: gold ${s0.gold} -> ${s1.gold}, ${key} ${v0} -> ${v1}; the shop, cargo and the rest of the build unchanged`);
    await page.evaluate(() => { window.bb.game.run.gold = 1; });
    const t0 = (await look(page)).toasts, s2 = await snap(page);
    await press(centre(r));
    const news = await toastsSince(page, t0), s3 = await snap(page);
    check(s3 === s2 && news.includes(short), `${V}: with 1 gold a ${how === "touch" ? "tap" : "click"} on the dimmed ${NAME} buys nothing and says "${short}" (toasts ${JSON.stringify(news)})`);
    await page.evaluate(([g, k, v]) => { const run = window.bb.game.run; run.gold = g; run.build[k] = v; }, [s0.gold, key, v0]);
  }
  await page.evaluate(() => { const g = window.bb.game; g.step(1 / 60); g.render(); });
}

// ------------------------------------------------------------------------------------------------------------ A1 touch
async function touchSection(browsers, origin, vname) {
  log("");
  const engine = ENGINE(vname);
  log(`## touch ${vname} (${engine} ${browsers[engine]?.version() ?? "not running"}, ${VIEW[vname].viewport.width}x${VIEW[vname].viewport.height} @${VIEW[vname].deviceScaleFactor}, isMobile, hasTouch): real touch events, taps drifting 3, 5 and 8 CSS px`);
  const V = `touch ${vname}`;
  viewNow = V;
  loadLine(`${V}: start`);
  const { ctx, page, cdp, errors } = await openPage(browsers, origin, vname);
  await openDeck(page, FURNACE);
  const kv = await kview(page);
  const env = await page.evaluate(() => ({ ua: navigator.userAgent, inner: `${innerWidth}x${innerHeight}`, vv: visualViewport ? `${visualViewport.width}x${visualViewport.height}` : "none", dpr: devicePixelRatio, band: window.bb.game.screen.L.portrait ? window.bb.game.screen.L.info.h : null }));
  log(`[${at()}] ${env.ua.slice(0, 80)}; innerWidth x innerHeight ${env.inner}, visualViewport ${env.vv}, devicePixelRatio ${env.dpr}`);
  log(`[${at()}] build screen ${kv.W}x${kv.H} at x${kv.scale} (dpr ${kv.dpr}): ${kv.k.toFixed(3)} CSS px per logical px; a deck cell is ${(12 * kv.k).toFixed(1)} CSS px; the touch slop 10 CSS px = ${(10 / kv.k).toFixed(2)} logical px (the mouse's 4 logical px = ${(4 * kv.k).toFixed(1)} CSS px); ${env.band === null ? "the landscape column" : `the portrait panel band ${env.band} px = ${(env.band * kv.k).toFixed(0)} CSS px`}`);

  // 034: shop cards, affordable and not. shoptap2: the panel is drawn, shows the card's description and lies inside the
  // visible viewport (0350e5f on a phone browser's viewport: a header with no description, or nothing)
  for (const [i, label, def] of [[0, "affordable", "GREASE WORKS"], [1, "unaffordable", "GANTRY PRESS"]]) {
    for (const [d, deg] of DRIFTS) {
      await page.keyboard.press("Escape");
      const s0 = await snap(page), l0 = await look(page);
      await tap(cdp, await card(page, i), d, deg);
      const l = await look(page), s1 = await snap(page), news = await toastsSince(page, l0.toasts);
      const ok = l.sel.kind === "offer" && l.sel.slot === i && !l.carry && s1 === s0 && !news.some((t) => /MORE GOLD/.test(t)) && shown(l, def);
      check(ok, `${V}: the ${label} shop card (${def}) tapped with a ${d} CSS px drift opens its description (${l.panel ? `panel ${pdesc(l)}, buttons ${JSON.stringify(l.panel.labels)}` : `${JSON.stringify(l.sel)}, no panel`}); gold ${l.gold}, the shop and the build unchanged; nothing lifted${news.length ? `; toasts ${JSON.stringify(news)}` : ""}`);
      fitCheck(vname, V, `the ${label} shop card (${def}), ${d} CSS px drift`, l);
    }
    await shot(page, `${TAG}-${vname}-shop-${label}.png`);
    const buy = await region(page, "buy");
    if (buy) check(buy.h >= TAP_CSS, `${V}: the ${label} card's ${i === 0 ? "BUY" : "BUY (disabled)"} button is a ${buy.w.toFixed(1)}x${buy.h.toFixed(1)} CSS px target (at least 44 tall)`);
  }

  await packChecks(page, cdp, V, "touch");

  // 035: each carrier part, three drifts each; a tap alone changes nothing. shoptap2: its panel shows its description,
  // inside the visible viewport
  const parts = [
    ["the signature KILN", () => cell(page, 4, 7), { kind: "item", uid: 1 }, "KILN", "kiln"],
    ["a STAMP PRESS (factory)", () => cell(page, 6, 7), { kind: "item", uid: 2 }, "STAMP PRESS", "factory"],
    ["an OVERDRIVE (X rig)", () => cell(page, 5, 3), { kind: "item", uid: 4 }, "OVERDRIVE", "xrig"],
    ["a BOMBARD (turret) with a core and gear", () => turret(page, 1), { kind: "turret", index: 1 }, "BOMBARD", null],
  ];
  for (const [what, where, want, title, name] of parts) {
    for (const [d, deg] of DRIFTS) {
      await page.keyboard.press("Escape");
      const s0 = await snap(page);
      await tap(cdp, await where(), d, deg);
      const l = await look(page), s1 = await snap(page);
      check(same(l.sel, want) && s1 === s0 && !l.carry && !l.draw && shown(l, title), `${V}: ${what} tapped with a ${d} CSS px drift opens its panel (${l.panel ? `${pdesc(l)} · ${l.panel.sub}; buttons ${JSON.stringify(l.panel.labels)}` : `${JSON.stringify(l.sel)}, no panel`}); gold, the build and cargo unchanged`);
      fitCheck(vname, V, `${what}, ${d} CSS px drift`, l);
    }
    if (name && name !== "kiln") await shot(page, `${TAG}-${vname}-${name}-panel.png`);
  }
  // shoptap2: a cargo part read by a tap: its panel with its description and SELL, nothing changed
  for (const [d, deg] of DRIFTS) {
    await page.keyboard.press("Escape");
    const s0 = await snap(page);
    await tap(cdp, await slot(page, 0), d, deg);
    const l = await look(page), s1 = await snap(page);
    check(same(l.sel, { kind: "cargo", uid: 60 }) && s1 === s0 && !l.carry && shown(l, "GALVANIC COIL") && l.panel.labels.some((t) => /^SELL \+\d+G$/.test(t)),
      `${V}: the GALVANIC COIL in cargo tapped with a ${d} CSS px drift opens its panel (${l.panel ? `${pdesc(l)}; buttons ${JSON.stringify(l.panel.labels)}` : `${JSON.stringify(l.sel)}, no panel`}); nothing changed`);
    fitCheck(vname, V, `the GALVANIC COIL in cargo, ${d} CSS px drift`, l);
  }
  await shot(page, `${TAG}-${vname}-cargo-panel.png`);
  // CARD-3 (REQ-BFG-087, D7; SPACE-1 open item 10): the phone panel checks with a rune held (the rune strip under the bar,
  // so a portrait band is shorter: 57 px on 402x690): the two shop cards, the carrier's parts and the cargo part, one tap
  // each (a 5 CSS px drift): each panel shown, and on a portrait phone (FIT_VIEWS) in the band or grown up from it with its
  // full description; a tap changes nothing. The rune is taken back after, so the later checks see their deck
  {
    await page.keyboard.press("Escape");
    await page.evaluate(() => { const g = window.bb.game; g.run.build.runes = [{ id: "many_hands" }]; g.resize(); g.step(1 / 60); g.render(); });
    const bandR = await page.evaluate(() => { const L = window.bb.game.screen.L; return L.portrait ? L.info.h : null; });
    log(`[${at()}] ${V}: D7, a rune held: ${bandR === null ? "the landscape column" : `the portrait panel band ${bandR} px`}`);
    const runeCases = [
      ["the affordable shop card (GREASE WORKS)", () => card(page, 0), (s) => s.kind === "offer" && s.slot === 0, "GREASE WORKS"],
      ["the unaffordable shop card (GANTRY PRESS)", () => card(page, 1), (s) => s.kind === "offer" && s.slot === 1, "GANTRY PRESS"],
      ...parts.map(([what, where, want, title]) => [what, where, (s) => same(s, want), title]),
      ["the GALVANIC COIL in cargo", () => slot(page, 0), (s) => same(s, { kind: "cargo", uid: 60 }), "GALVANIC COIL"],
    ];
    for (const [what, where, ok, title] of runeCases) {
      await page.keyboard.press("Escape");
      const s0 = await snap(page);
      await tap(cdp, await where(), 5, 90);
      const l = await look(page), s1 = await snap(page);
      check(ok(l.sel) && s1 === s0 && !l.carry && shown(l, title), `${V}: D7, a rune held: ${what} tapped with a 5 CSS px drift opens its panel (${l.panel ? pdesc(l) : `${JSON.stringify(l.sel)}, no panel`}); gold, the build and cargo unchanged`);
      fitCheck(vname, V, `D7, a rune held: ${what}`, l);
    }
    await shot(page, `${TAG}-${vname}-runeheld-panel.png`);
    await page.keyboard.press("Escape");
    await page.evaluate(() => { const g = window.bb.game; g.run.build.runes = []; g.resize(); g.step(1 / 60); g.render(); });
  }
  // the signature KILN's panel says it stays aboard, no SELL. bb-0.8.3 (REQ-BFG-043 D11): its one button is its FACTORY
  // UPGRADE 10G (it had none); with 5 gold it is dim, still showing its price, and a tap on it changes nothing. The note
  // is 0.8.0's again ("THE SIGNATURE FACTORY STAYS ABOARD. IT CAN'T BE SOLD."; run 3's was "IT STAYS ABOARD: NO COPY CAN
  // BE SOLD."), so the check reads "STAYS ABOARD"
  await page.keyboard.press("Escape");
  await tap(cdp, await cell(page, 4, 7), 5, 90);
  const kiln = await look(page);
  const kilnText = kiln.panel ? kiln.panel.lines.join(" ") : "";
  check(kiln.panel && same(kiln.panel.labels, ["UPGRADE 10G"]) && /STAYS ABOARD/.test(kilnText) && shown(kiln, "KILN"), `${V}: the KILN's panel offers no SELL and says why: ${kiln.panel ? `${JSON.stringify(kiln.panel.lines.filter((t) => /ABOARD|SOLD|SIGNATURE/.test(t)))}; buttons ${JSON.stringify(kiln.panel.labels)}; ${pdesc(kiln)}` : "no panel"}`);
  fitCheck(vname, V, "the KILN", kiln);
  await shot(page, `${TAG}-${vname}-kiln-panel.png`);
  {
    const r = await region(page, "upgrade-factory"), s0 = await snap(page);
    const dim = await page.evaluate(() => { const q = window.bb.game.ui.regions.filter((x) => x.id === "upgrade-factory").pop(); return !!q && typeof q.onTap !== "function"; });
    if (r) await tap(cdp, centre(r), 3, 0);
    const l = await look(page), s1 = await snap(page);
    check(r && dim && r.h >= TAP_CSS && inView(r, kiln) && s1 === s0 && same(l.sel, { kind: "item", uid: 1 }) && (await marksOf(page, "factory")).length === 0,
      `${V}: with 5 gold the KILN's UPGRADE 10G is dim (${dim ? "disabled" : "NOT disabled"}; ${r ? `a ${r.w.toFixed(1)}x${r.h.toFixed(1)} CSS px target` : "missing"}); a tap on it changes nothing (gold ${JSON.parse(s1).gold}, upgrades ${JSON.stringify(JSON.parse(s1).build.upgrades ?? {})})`);
  }
  // the rig: its first tap selects without turning (its panel shows); a tap on the selected rig turns it
  for (const [d, deg] of DRIFTS) {
    await page.keyboard.press("Escape");
    const r0 = await rotOf(page, 3), s0 = await snap(page);
    await tap(cdp, await cell(page, 3, 3), d, deg);
    const l = await look(page), r1 = await rotOf(page, 3), s1 = await snap(page);
    await tap(cdp, await cell(page, 3, 3), d, deg + 180);
    const r2 = await rotOf(page, 3);
    check(same(l.sel, { kind: "item", uid: 3 }) && r1 === r0 && s1 === s0 && r2 === (r0 + 1) % 4 && shown(l, "TEMPER"), `${V}: the TEMPER (rig), ${d} CSS px drift: the first tap selects it and doesn't turn it (rot ${r0} -> ${r1}; panel ${pdesc(l)}), a tap on the selected rig turns it a quarter (rot ${r2})`);
    fitCheck(vname, V, `the TEMPER (rig), ${d} CSS px drift`, l);
  }
  await shot(page, `${TAG}-${vname}-rig-panel.png`);
  for (const id of ["rotate", "store", "sellpart"]) {
    const r = await region(page, id);
    check(r && r.h >= TAP_CSS, `${V}: the rig panel's ${id === "rotate" ? "ROTATE" : id === "store" ? "TO CARGO" : "SELL"} is a ${r ? `${r.w.toFixed(1)}x${r.h.toFixed(1)}` : "missing"} CSS px target (at least 44 tall)`);
  }
  // ROTATE still works from the panel
  {
    const r0 = await rotOf(page, 3);
    await tap(cdp, centre(await region(page, "rotate")), 3, 0);
    check((await rotOf(page, 3)) === (r0 + 1) % 4, `${V}: the rig panel's ROTATE turns it a quarter turn`);
  }
  // the turret: a tap again steps through its core and its gear
  {
    await page.keyboard.press("Escape");
    const seen = [];
    let all = true;
    for (let i = 0; i < 4; i++) {
      await tap(cdp, await turret(page, 1), DRIFTS[i % 3][0], DRIFTS[i % 3][1]);
      const l = await look(page);
      all = all && shown(l) && (i > 0 && i < 3 ? l.panel.labels.some((t) => /^SELL \+\d+G$/.test(t)) : true);
      fitCheck(vname, V, ["the BOMBARD (turret) with a core and gear", "its core (PRESSURE BREECH)", "its gear (HOPPER)", "the BOMBARD again"][i], l);
      seen.push(`${l.sel.kind}${l.sel.uid ? ` ${l.sel.uid}` : ""}${l.panel ? ` ${pdesc(l)} ${JSON.stringify(l.panel.labels)}` : " no panel"}`);
      if (i === 0) await shot(page, `${TAG}-${vname}-turret-panel.png`);
      if (i === 1) await shot(page, `${TAG}-${vname}-core-panel.png`);
      if (i === 2) await shot(page, `${TAG}-${vname}-gear-panel.png`);
    }
    check(seen[0].startsWith("turret") && seen[1].startsWith("fitted 950") && seen[2].startsWith("fitted 951") && seen[3].startsWith("turret") && all,
      `${V}: the turret, then a tap again: its core, its gear (each with SELL), back to the turret, each panel with its description inside the visible viewport: ${seen.join(" | ")}`);
  }

  // 034 + 035: with a shop card selected, a tap on a part reads it and buys nothing (shoptap2: and its panel shows)
  for (const [what, where, want, title] of [["the TEMPER", () => cell(page, 3, 3), { kind: "item", uid: 3 }, "TEMPER"], ["the STAMP PRESS", () => cell(page, 6, 7), { kind: "item", uid: 2 }, "STAMP PRESS"], ["the BOMBARD", () => turret(page, 1), { kind: "turret", index: 1 }, "BOMBARD"], ["an empty cell", () => cell(page, 8, 8), { kind: "none" }, null]]) {
    await page.keyboard.press("Escape");
    await tap(cdp, await card(page, 0), 3, 0);
    const s0 = await snap(page), r0 = await rotOf(page, 3);
    await tap(cdp, await where(), 5, 90);
    const l = await look(page), s1 = await snap(page);
    check(same(l.sel, want) && s1 === s0 && (await rotOf(page, 3)) === r0 && (title === null || shown(l, title)), `${V}: with the GREASE WORKS card selected, a tap on ${what} ${want.kind === "none" ? "dismisses it" : `reads it (${pdesc(l)})`} (${JSON.stringify(l.sel)}) and buys or places nothing (gold ${l.gold})`);
    if (title !== null) fitCheck(vname, V, `${what} read with the GREASE WORKS card selected`, l);
  }

  // shoptap2: where a finger's panel grows past the band a press on what it covers goes through to what is under it; a
  // press on the band part of the panel changes nothing, as ever. ZOOM-1 (REQ-BFG-080, call 5): every panel grows up over
  // the shop rows (a shop card's grew down over the bow, which the zoomed carrier fills now): the BOMBARD's (a turret with
  // a core and gear: the tallest kind) and a shop card it covers, read through it
  {
    await page.keyboard.press("Escape");
    await tap(cdp, await turret(page, 1), 3, 0);
    const l0 = await look(page);
    const band = await page.evaluate(() => { const a = window.bb.game.screen.L.info, p = window.bb.toClient(a.x, a.y), q = window.bb.toClient(a.x + a.w, a.y + a.h); return { x: p.x, y: p.y, w: q.x - p.x, h: q.y - p.y }; });
    const under = (p, r) => !!r && p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
    // SPACE-1 (REQ-BFG-087, D4): a panel now grows until its gaps show (or to the top), so the BOMBARD's header row (its
    // buttons, each a finger's target) and its words (their tap targets) can lie over a shop card; a press there is the
    // panel's, as ever (UI.hit: the last region added wins). The card read through it is the first whose centre's top
    // region is the panel's press-through (`details-over`), the part of the panel a press goes through. Was: the first
    // card under the panel and not under the band
    const topRegion = (p) => page.evaluate((q) => window.bb.regions().filter((r) => q.x >= r.x && q.x < r.x + r.w && q.y >= r.y && q.y < r.y + r.h).pop()?.id ?? null, p);
    let ci = -1, cp = null;
    for (let i = 0; i < 5 && ci < 0; i++) { const p = await card(page, i); if (under(p, l0.box) && !under(p, band) && (await topRegion(p)) === "details-over") { ci = i; cp = p; } }
    if (cp && l0.grownUp) {
      const s0 = await snap(page);
      const want = await page.evaluate((i) => { const o = window.bb.game.screen.offers()[i]; return { kind: "offer", wagon: o.wagon, slot: o.slot }; }, ci);
      await tap(cdp, cp, 5, 90);
      const l = await look(page);
      check(same(l.sel, want) && shown(l) && (await snap(page)) === s0,
        `${V}: the BOMBARD's panel grown up over the shop covers card ${ci}; a tap there goes through and reads it (${pdesc(l)}); nothing changed`);
      if (band.h >= 6) {
        await tap(cdp, await turret(page, 1), 3, 0);
        await tap(cdp, { x: band.x + band.w / 2, y: band.y + band.h / 2 }, 3, 0);
        const lb = await look(page);
        check(same(lb.sel, { kind: "turret", index: 1 }) && shown(lb, "BOMBARD"), `${V}: a tap on the panel over the band changes nothing (${JSON.stringify(lb.sel)})`);
      }
    } else if (l0.grownUp) log(`[${at()}] ${V}: the BOMBARD's panel grown up over the shop covers no card's centre where a press goes through (each covered card's centre is under its buttons or words): no press goes through`); // SPACE-1
    else log(`[${at()}] ${V}: the BOMBARD's panel doesn't grow over a shop card here (the ${env.band === null ? "landscape column" : "band"}, ${band.h.toFixed(0)} CSS px tall, holds it): no press goes through`);
  }

  // 035: SELL from each panel (a fresh deck each)
  const sells = [
    ["the STAMP PRESS", () => cell(page, 6, 7), [], "sellpart", (b) => !b.items.some((p) => p.uid === 2) && !b.routes.some((r) => r.factory === 2), 4],
    ["the TEMPER", () => cell(page, 3, 3), [], "sellpart", (b) => !b.items.some((p) => p.uid === 3), 1],
    ["the OVERDRIVE", () => cell(page, 5, 3), [], "sellpart", (b) => !b.items.some((p) => p.uid === 4), null],
    ["the BOMBARD", () => turret(page, 1), [], "turretsell", (b) => !(b.turrets ?? []).some((t) => t.uid === 700), null],
    ["its core (PRESSURE BREECH)", () => turret(page, 1), [1], "sellfitted", (b) => !b.mods.some((m) => m.uid === 950), 2],
    ["its gear (HOPPER)", () => turret(page, 1), [1, 1], "sellfitted", (b) => !b.mods.some((m) => m.uid === 951), 2],
  ];
  for (const [what, where, again, id, gone, price] of sells) {
    await openDeck(page, FURNACE);
    await tap(cdp, await where(), 5, 0);
    for (const _ of again) await tap(cdp, await where(), 3, 90);
    const l = await look(page), r = await region(page, id), g0 = l.gold;
    if (!r) { check(false, `${V}: SELL on ${what}'s panel: no ${id} button (${JSON.stringify(l.panel?.labels ?? l.sel)})`); continue; }
    if (what === "the STAMP PRESS") await shot(page, `${TAG}-${vname}-sell-panel.png`);
    const label = l.panel ? l.panel.labels.find((t) => /^SELL/.test(t)) : null;
    await tap(cdp, centre(r), 3, 0);
    const b = JSON.parse(await snap(page)).build, g1 = (await look(page)).gold;
    check(gone(b) && g1 > g0 && (price === null || g1 - g0 === price) && r.h >= TAP_CSS && shown(l) && inView(r, l),
      `${V}: SELL on ${what}'s panel (${label ?? id}, a ${r.w.toFixed(1)}x${r.h.toFixed(1)} CSS px target ${inView(r, l) ? "inside" : "NOT inside"} the visible viewport; the panel ${pdesc(l)}) sells it: gold ${g0} -> ${g1}`);
  }

  // 036: the belt X
  await openDeck(page, FURNACE);
  for (const [d, deg] of DRIFTS) {
    await page.keyboard.press("Escape");
    const s0 = await snap(page);
    await tap(cdp, await cell(page, 4, 2), d, deg);
    const l = await look(page), x = await region(page, "beltx"), det = await region(page, "details"), s1 = await snap(page);
    const vp = VIEW[vname].viewport;
    const clear = x && det ? !(x.x < det.x + det.w && det.x < x.x + x.w && x.y < det.y + det.h && det.y < x.y + x.h) : !!x;
    check(same(l.sel, { kind: "route", index: 0 }) && x && x.w >= TAP_CSS && x.h >= TAP_CSS && x.x >= 0 && x.y >= 0 && x.x + x.w <= vp.width && x.y + x.h <= vp.height && clear && s1 === s0 && shown(l, "BELT ROUTE"),
      `${V}: a tap on the KILN's belt (${d} CSS px drift) selects it and puts up its X: ${x ? `${x.w.toFixed(1)}x${x.h.toFixed(1)} CSS px at (${x.x.toFixed(0)}, ${x.y.toFixed(0)})` : "none"}, on screen, clear of the panel (${pdesc(l)}); the belt uncut`);
    if (d === 3) await shot(page, `${TAG}-${vname}-belt-x.png`);
  }
  {
    const s0 = await snap(page);
    await tap(cdp, await cell(page, 8, 8), 5, 0); // elsewhere: an empty cell
    const x = await region(page, "beltx"), s1 = await snap(page);
    check(!x && s1 === s0, `${V}: a tap elsewhere takes the X down; the belt unchanged`);
    await tap(cdp, await cell(page, 4, 1), 8, 225);
    await tap(cdp, await cell(page, 3, 3), 3, 0); // the TEMPER, with the X up
    const l = await look(page);
    check(!(await region(page, "beltx")) && same(l.sel, { kind: "item", uid: 3 }) && (await snap(page)) === s0, `${V}: with the X up, a tap on the TEMPER takes the X down and selects the TEMPER (not turned)`);
    // each tap on a fresh selection (Escape: no X up, which a jittered tap could land on)
    for (const [d, deg] of DRIFTS) for (const c of [[4, 5], [4, 3], [4, 0], [6, 2], [5, 1]]) {
      await page.keyboard.press("Escape");
      await tap(cdp, await cell(page, ...c), d, deg);
    }
    check((await snap(page)) === s0, `${V}: jittered taps (3, 5 and 8 CSS px) on fifteen belt tiles never cut a belt`);
    await page.keyboard.press("Escape");
    await tap(cdp, await cell(page, 6, 3), 5, 90);
    const x2 = await region(page, "beltx");
    if (x2) await tap(cdp, centre(x2), 3, 0);
    const b = JSON.parse(await snap(page)).build;
    check(x2 && b.routes.length === 1 && b.routes[0].factory === 1 && same(b.routes[0].cells, KILN_BELT), `${V}: a tap on the X removes the whole STAMP PRESS belt (REMOVE BELT's path); the KILN's belt untouched`);
  }
  {
    await openDeck(page, FURNACE);
    await tap(cdp, await cell(page, 4, 3), 3, 0);
    const rm = await region(page, "rmroute");
    check(rm && rm.h >= TAP_CSS, `${V}: the belt panel's REMOVE BELT is a ${rm ? `${rm.w.toFixed(1)}x${rm.h.toFixed(1)}` : "missing"} CSS px target`);
  }

  // 037: factory drags. bb-0.8.3 (REQ-BFG-044 D6): the level-1 KILN (2 belt slots) draws a second belt and keeps the
  // first; full, it says so and draws nothing, and a drag ended back on it changes nothing. REQ-BFG-043 D10, D11 (was: a
  // KILN copy bought from the caravan merged it to ★2): its FACTORY UPGRADE buys level 2 for 10 gold, its belts kept, the
  // board marks it, and a drag draws its third belt at once; then the starting SCRAP CANNON's TURRET SPEED UPGRADE
  {
    // TCH-360: each drag through dragStep (registered before its check; one retry if it registered nothing), each check
    // here a bcheck (after a failed one, the rest of this board's are SKIP lines)
    await openDeck(page, KILN_DECK);
    const s0 = JSON.parse(await snap(page));
    const p1 = await cells(page, [[5, 6], [5, 5], [5, 4], [5, 3], [5, 2], [5, 1], [5, 0]]);
    await dragStep(page, cdp, V, "the KILN's second belt", p1);
    const b1 = JSON.parse(await snap(page)).build;
    await shot(page, `${TAG}-${vname}-kiln-second-belt.png`);
    bcheck(b1.routes.length === 2 && same(b1.routes[0], s0.build.routes[0]) && b1.routes[1].factory === 1 && same(b1.routes[1].cells, KILN_SECOND) && dist(p1) >= 40,
      `${V}: a ${dist(p1).toFixed(0)} CSS px drag out of the level-1 KILN (2 belt slots, 1 used) draws a second belt into column 5 (${JSON.stringify(b1.routes[1]?.cells)}) and keeps the first`);
    const s1 = await snap(page), n0 = (await look(page)).toasts;
    const pts = await cells(page, [[4, 7], [3, 7], [2, 7], [2, 6], [2, 5]]);
    await dragStep(page, cdp, V, "the full KILN's drag (held down)", pts, false);
    await page.evaluate(() => { const g = window.bb.game; g.step(1 / 60); g.render(); });
    const mid = await page.evaluate(() => { const s = window.bb.game.screen; return { draw: s.ed.draw && { ...s.ed.draw }, hide: s.view.hideRoute }; });
    const news = await toastsSince(page, n0);
    await shot(page, `${TAG}-${vname}-kiln-notice.png`);
    bcheck(news.includes(FULL_KILN) && !mid.draw && mid.hide === -1,
      `${V}: a drag out of the full level-1 KILN (2 of 2 belts) says "${FULL_KILN}" and draws nothing (draw ${JSON.stringify(mid.draw)}; hidden route ${mid.hide})`);
    const back = await cells(page, [[2, 5], [2, 6], [2, 7], [3, 7], [4, 7]]);
    for (let i = 1; i < back.length; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [tp(back[i])] });
    await sleep(80);
    await up(cdp);
    bcheck((await snap(page)) === s1, `${V}: that drag ended back on the KILN: the serialized build is identical`);
    await tap(cdp, await cell(page, 4, 7), 8, 45);
    bcheck((await snap(page)) === s1, `${V}: a tap on the KILN changes nothing`);
    // bb-0.8.3 (REQ-BFG-043 D10, D11): the KILN's FACTORY UPGRADE (25 gold -> 15), its two belts kept, then its third belt
    const { s1: r2 } = await upgradeTouch(page, cdp, V, { what: "the KILN", where: () => cell(page, 4, 7), track: "factory", title: "KILN", key: 1 });
    const b2 = r2.build;
    await shot(page, `${TAG}-${vname}-kiln-upgraded.png`);
    bcheck(same(b2.routes, b1.routes) && b2.items.filter((p) => p.def === "kiln").length === 1 && !b2.items.find((p) => p.uid === 1)?.stars,
      `${V}: the KILN at FACTORY level 2 keeps its two belts and stays one KILN, with no stars`);
    const p3 = await cells(page, [[5, 6], [6, 6], [7, 6], [8, 6], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0]]);
    await dragStep(page, cdp, V, "the KILN's third belt", p3);
    const b3 = JSON.parse(await snap(page)).build;
    await shot(page, `${TAG}-${vname}-kiln-third-belt.png`);
    bcheck(b3.routes.length === 3 && same(b3.routes.slice(0, 2), b2.routes) && b3.routes[2].factory === 1 && same(b3.routes[2].cells, KILN_THIRD),
      `${V}: a drag out of the level-2 KILN (3 belt slots, 2 used) draws its third belt into column 8 at once: ${JSON.stringify(b3.routes[2]?.cells)}`);
    // the starting SCRAP CANNON (TURRET SLOT 1, the free copy): its TURRET SPEED UPGRADE (15 gold -> 5)
    await upgradeTouch(page, cdp, V, { what: "the starting SCRAP CANNON (TURRET SLOT 1, the free copy)", where: () => turret(page, 0), track: "turret", title: "SCRAP CANNON", key: 0 });
    await shot(page, `${TAG}-${vname}-turret-upgraded.png`);
  }
  {
    await openDeck(page, WEAVER);
    const s0 = JSON.parse(await snap(page));
    const p1 = await cells(page, [[5, 6], [6, 6], [7, 6], [8, 6], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0]]);
    await dragStep(page, cdp, V, "the LOOM's second belt", p1);
    const b1 = JSON.parse(await snap(page)).build;
    await shot(page, `${TAG}-${vname}-loom-second-belt.png`);
    bcheck(b1.routes.length === 2 && same(b1.routes[0], s0.build.routes[0]) && b1.routes[1].factory === 1 && dist(p1) >= 40,
      `${V}: a ${dist(p1).toFixed(0)} CSS px drag out of the LOOM (three outputs, one used) adds a second belt (${b1.routes[1]?.cells.length} tiles) and keeps the first`);
    const p2 = await cells(page, [[4, 5], [3, 5], [2, 5], [1, 5], [1, 4], [1, 3], [1, 2], [1, 1], [1, 0]]);
    await dragStep(page, cdp, V, "the LOOM's third belt (from its first belt tile)", p2);
    const b2 = JSON.parse(await snap(page)).build;
    bcheck(b2.routes.length === 3 && same(b2.routes.slice(0, 2), b1.routes) && b2.routes[2].factory === 1 && !b2.routes[2].cells.includes(K(4, 5)),
      `${V}: a drag that starts on the LOOM's own first belt tile (ambiguous with the LOOM) draws a third belt and keeps both: ${JSON.stringify(b2.routes[2]?.cells)}`);
    const n0 = (await look(page)).toasts;
    const p4 = await cells(page, [[5, 7], [6, 7], [7, 7], [7, 8]]);
    await dragStep(page, cdp, V, "the full LOOM's drag (its warning)", p4);
    const news = await toastsSince(page, n0), b3 = JSON.parse(await snap(page)).build;
    // the warning tells the truth in fullNotice's words (0.8.0: "ALL 3 LOOM OUTPUTS USED - DRAG A BELT TO REROUTE"; bb-0.8.3
    // REQ-BFG-043 D11: the hero's own factory points at its FACTORY upgrade, was "· ★2 OPENS A 4TH")
    const FULL_LOOM = "LOOM'S 3 BELTS ARE IN USE · UPGRADE FOR A 4TH";
    bcheck(news.includes(FULL_LOOM) && same(b3, b2), `${V}: with every output used, a drag out of the LOOM warns ("${FULL_LOOM}") and changes nothing`);
    // bb-0.8.3 (REQ-BFG-043 D10, D11; REQ-BFG-044): the LOOM's FACTORY UPGRADE (15 gold -> 5) opens a fourth slot (3/4/5/6),
    // and the same drag now draws its fourth belt
    const { s1: r4 } = await upgradeTouch(page, cdp, V, { what: "the full LOOM", where: () => cell(page, 4, 7), track: "factory", title: "LOOM", key: 1 });
    await dragStep(page, cdp, V, "the LOOM's fourth belt", p4);
    const b4 = JSON.parse(await snap(page)).build;
    await shot(page, `${TAG}-${vname}-loom-fourth-belt.png`);
    bcheck(b4.routes.length === 4 && same(b4.routes.slice(0, 3), r4.build.routes) && b4.routes[3].factory === 1 && same(b4.routes[3].cells, LOOM_FOURTH) && dist(p4) >= 40,
      `${V}: a ${dist(p4).toFixed(0)} CSS px drag out of the level-2 LOOM (4 belt slots, 3 used) draws its fourth belt: ${JSON.stringify(b4.routes[3]?.cells)}`);
  }

  // real drags of 40 px or more still work on touch
  {
    await openDeck(page, FURNACE);
    const from = await card(page, 0), to = await cell(page, 3, 4);
    await dragStep(page, cdp, V, "the GREASE WORKS card dragged onto the deck", [from, to]);
    const r = JSON.parse(await snap(page));
    bcheck(r.gold === 2 && r.build.items.some((p) => p.def === "grease" && p.x === 3 && p.y === 4) && dist([from, to]) >= 40,
      `${V}: a ${dist([from, to]).toFixed(0)} CSS px drag buys the GREASE WORKS card and places it on (3,4) (gold 5 -> ${r.gold})`);
    const m = await cells(page, [[3, 3], [3, 2], [3, 1], [2, 1]]);
    await dragStep(page, cdp, V, "the TEMPER moved", m);
    const r2 = JSON.parse(await snap(page)).build;
    bcheck(r2.items.some((p) => p.uid === 3 && p.x === 2 && p.y === 1) && dist(m) >= 40, `${V}: a ${dist(m).toFixed(0)} CSS px drag moves the TEMPER from (3,3) to (2,1)`);
    const rr = await cells(page, [[6, 3], [7, 3], [7, 2], [7, 1], [7, 0]]);
    await dragStep(page, cdp, V, "the STAMP PRESS belt rerouted", rr);
    const r3 = JSON.parse(await snap(page)).build;
    const press = r3.routes.find((q) => q.factory === 2);
    bcheck(press && same(press.cells.slice(0, 3), [K(6, 5), K(6, 4), K(6, 3)]) && press.cells.includes(K(7, 3)) && dist(rr) >= 40,
      `${V}: a ${dist(rr).toFixed(0)} CSS px drag from the STAMP PRESS belt's tile 3 reroutes it: ${JSON.stringify(press?.cells)}`);
    const sl = await slot(page, 0), dc = await cell(page, 8, 7);
    await dragStep(page, cdp, V, "the GALVANIC COIL dragged from cargo", [sl, dc]);
    const r4 = JSON.parse(await snap(page));
    bcheck(r4.build.items.some((p) => p.uid === 60) && !r4.inventory.some((i) => i.uid === 60), `${V}: a drag from cargo places the GALVANIC COIL on the deck`);
  }

  await barChecks(page, cdp, V);

  check(errors.length === 0, `${V}: 0 console errors (${errors.length}${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""})`);
  await ctx.close();
  loadLine(`${V}: end`);
}

/**
 * TAP-093 (backlog #340, REQ-BFG-040): the top bar's SND and MENU as a finger meets them, with no rune held and with 3
 * held (the rune strip under the bar). Each one's target as the game routes a press (every logical px of the top rows
 * hit-tested: the last region wins), in CSS px. On a portrait phone view: MENU's target holds a 44 x 44 CSS px square and
 * touches no shop card, REROLL, pack or rune chip; SND's the same where the bar keeps it (a lifted bar), else MENU's card
 * has a SOUND toggle at least 44 CSS px tall. A real tap low in MENU's target opens the card; SOUND (or SND, low in its
 * target) cycles the setting, saved, and two more taps bring it back; RESUME closes the card. Landscape: both as drawn
 * (12 logical px tall), as in 0.9.2.
 * TAP-093b (backlog #340): where the corner MENU is up, its target holds a full finger's square (tapPx both ways: 45 CSS
 * px where tapPx gives 45), 1 px clear of every card, REROLL, pack and rune chip, the chips starting at tapPx + 1 (at
 * least 28). `counts`: the runes held, 0 and 3 on the touch views; the bar section's DPR 2 view adds 1 and 10.
 */
async function barChecks(page, cdp, V, counts = [0, 3]) {
  // furnace's ten (rivalBuilds.ts bulwark), in pick order (the first three as before)
  const ids = ["coal_chute", "quick_latch", "tar_barrel", "heat_sink", "warlords_due", "fat_purse", "searing", "pyre_heart", "ward_stone", "shatter_shot"];
  for (const n of counts) {
    await page.keyboard.press("Escape").catch(() => {});
    await page.evaluate((list) => {
      const g = window.bb.game, s = g.screen;
      window.bb.holdRunes(list);
      delete g.run.runeDay;
      s.select({ kind: "none" });
      s.menu = false;
      for (let i = 0; i < 3; i++) g.step(1 / 60);
      g.render();
    }, ids.slice(0, n));
    await nextFrame(page);
    const m = await page.evaluate(() => {
      const g = window.bb.game, s = g.screen, L = s.L, k = g.view.scale / g.view.dpr, W = g.W, H0 = Math.min(g.H, 80);
      const B = s.runeBar.layout(s);
      const others = [...L.cards, L.reroll, ...L.packs, ...(B ? [...B.chips, ...(B.more ? [B.more] : [])] : [])];
      const area = (id) => {
        const m = Array.from({ length: H0 }, () => new Uint8Array(W));
        let n = 0, best = 0, x0 = W, y0 = H0, x1 = -1, y1 = -1, over = 0, near = 0, bx = 0, by = 0;
        const dp = Array.from({ length: H0 }, () => new Uint16Array(W));
        for (let y = 0; y < H0; y++) for (let x = 0; x < W; x++) {
          if (g.ui.hit(x + 0.5, y + 0.5)?.id !== id) continue;
          m[y][x] = 1; n++;
          x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
          dp[y][x] = 1 + (x && y ? Math.min(dp[y - 1][x], dp[y][x - 1], dp[y - 1][x - 1]) : 0);
          if (dp[y][x] > best) { best = dp[y][x]; bx = x; by = y; }
          if (others.some((o) => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h)) over++;
          // TAP-093b: on or next to another target (no 1 px gap)
          if (others.some((o) => x >= o.x - 1 && x < o.x + o.w + 1 && y >= o.y - 1 && y < o.y + o.h + 1)) near++;
        }
        if (!n) return null;
        // the largest square's lowest point (a press there proves the grown part routes to the button), client px
        const low = window.bb.toClient(bx - best / 2 + 0.5, by - 1);
        return { w: (x1 - x0 + 1) * k, h: (y1 - y0 + 1) * k, square: best * k, squarePx: best, over, near, low };
      };
      // TAP-093b: a finger's target in logical px; the corner MENU (chrome.ts drawTopBar); the chips' x0 and count
      const first = B ? B.chips[0] ?? B.more : null;
      return { phone: !!L.phone, k, tap: Math.ceil(44 / k), corner: !!s.cornerMenu, x0: first ? first.x : null, shown: B ? B.shown : 0, more: B && B.more ? s.run.build.runes.length - B.shown : 0, bar: L.bar.h, band: L.portrait ? L.info.h : null, runes: B ? B.chips.length : 0, menu: area("menu"), sound: area("sound"), mode: g.audio.mode };
    });
    const tag = `${V}, ${n ? `${n} rune${n === 1 ? "" : "s"} held (the rune strip under the bar)` : "no rune held"}`;
    const d = (a) => (a ? `${a.w.toFixed(1)}x${a.h.toFixed(1)} CSS px (its largest square ${a.square.toFixed(1)})${a.over ? `, OVER ${a.over} px of a card, REROLL, pack or rune chip` : ", clear of every card, REROLL, pack and rune chip"}` : "none");
    if (!m.phone) {
      check(m.menu && m.sound && Math.abs(m.menu.h - 12 * m.k) < 0.01 && Math.abs(m.sound.h - 12 * m.k) < 0.01,
        `${tag}: TAP-093 landscape: MENU ${d(m.menu)} and SND ${d(m.sound)}, as drawn (12 px tall), as in 0.9.2`);
      continue;
    }
    check(m.menu && m.menu.square >= TAP_CSS && m.menu.over === 0, `${tag}: TAP-093: MENU's target is ${d(m.menu)}, at least 44x44 (bar ${m.bar} px, band ${m.band} px)`);
    if (m.corner) {
      check(m.menu && m.menu.squarePx >= m.tap && m.menu.near === 0 && (!n || m.x0 === Math.max(28, m.tap + 1)),
        `${tag}: TAP-093b: the corner MENU's target holds a full finger's square, ${m.menu ? m.menu.squarePx : 0} px of tapPx ${m.tap} (${m.menu ? m.menu.square.toFixed(1) : 0} CSS px), ${m.menu && m.menu.near === 0 ? "1 px clear of" : `${m.menu ? m.menu.near : 0} px ON OR NEXT TO`} every card, REROLL, pack and rune chip${n ? `; the rune chips from x ${m.x0} (max(28, tapPx + 1) = ${Math.max(28, m.tap + 1)}): ${m.shown} shown${m.more ? ` + a "+${m.more}" chip` : ""}` : ""}`);
    }
    if (m.sound) check(m.sound.square >= TAP_CSS && m.sound.over === 0, `${tag}: TAP-093: SND's target is ${d(m.sound)}, at least 44x44 (the lifted bar)`);
    if (!m.menu) continue;
    const mode0 = m.mode;
    const state = () => page.evaluate(() => ({ menu: window.bb.game.screen.menu, mode: window.bb.game.audio.mode, saved: localStorage.getItem("beltbattles.sound") }));
    await tap(cdp, m.menu.low);
    await nextFrame(page);
    const s1 = await state();
    const snd = await region(page, "opt-snd"), res = await region(page, "resume");
    check(s1.menu && (m.sound || (snd && snd.h >= TAP_CSS)), `${tag}: TAP-093: a tap low in MENU's target (${m.menu.low.x.toFixed(0)}, ${m.menu.low.y.toFixed(0)}) opens its card${m.sound ? "" : `, its SOUND toggle a ${snd ? `${snd.w.toFixed(1)}x${snd.h.toFixed(1)}` : "MISSING"} CSS px target (at least 44 tall)`}`);
    if (!s1.menu) continue;
    const cycle = async () => {
      if (m.sound) await tap(cdp, m.sound.low);
      else await tap(cdp, centre(await region(page, "opt-snd")));
      await nextFrame(page);
      return state();
    };
    if (m.sound) { await tap(cdp, centre(res)); await nextFrame(page); }
    const c1 = await cycle();
    check(c1.mode === (mode0 + 1) % 3 && c1.saved === String(c1.mode), `${tag}: TAP-093: a tap on ${m.sound ? "SND, low in its target," : "the card's SOUND"} cycles the sound ${mode0} -> ${c1.mode}, saved (${c1.saved})`);
    await cycle();
    const c3 = await cycle();
    check(c3.mode === mode0 && c3.saved === String(mode0), `${tag}: TAP-093: two more taps bring it back to ${c3.mode} (saved ${c3.saved})`);
    if (!m.sound) { await tap(cdp, centre(await region(page, "resume"))); await nextFrame(page); }
    const s4 = await state();
    check(!s4.menu, `${tag}: TAP-093: RESUME closes the card`);
  }
  await page.evaluate(() => { const g = window.bb.game; window.bb.holdRunes([]); g.step(1 / 60); g.render(); });
}

/**
 * TAP-093b (backlog #340): the bar's checks alone on a DPR 2 phone (375x667 @2, the iPhone SE class: x3, a finger's target
 * 30 px), where the corner MENU's target was an L with runes held (its column 27 px: 40.5 CSS px, the first rune chip 28 px
 * in) before the chips started at tapPx + 1. Cheap: FURNACE's deck, then barChecks with 0, 1, 3 and 10 runes.
 */
async function barSection(browsers, origin) {
  const vname = "bar-667";
  log("");
  log(`## bar ${vname} (chromium ${browsers.chromium.version()}, ${VIEW[vname].viewport.width}x${VIEW[vname].viewport.height} @${VIEW[vname].deviceScaleFactor}, isMobile, hasTouch): TAP-093b, the top bar's checks alone`);
  const V = `bar ${vname}`;
  viewNow = V;
  loadLine(`${V}: start`);
  const { ctx, page, cdp, errors } = await openPage(browsers, origin, vname);
  try {
    await openDeck(page, FURNACE);
    const kv = await kview(page);
    log(`[${at()}] build screen ${kv.W}x${kv.H} at x${kv.scale} (dpr ${kv.dpr}): ${kv.k.toFixed(3)} CSS px per logical px; a finger's target ${Math.ceil(TAP_CSS / kv.k)} px`);
    await barChecks(page, cdp, V, [0, 1, 3, 10]);
  } catch (e) {
    check(false, `${V}: the section stopped: ${String(e instanceof Error ? e.message : e).split("\n")[0]}`);
  }
  check(errors.length === 0, `${V}: 0 console errors (${errors.length}${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""})`);
  await ctx.close();
  loadLine(`${V}: end`);
}

// ------------------------------------------------------------------------------------------------------------ A2 mouse
async function mouseSection(browsers, origin) {
  log("");
  log("## mouse desk (1920x1080 @1): the mouse as 69fe689");
  loadLine("mouse desk: start");
  const { ctx, page, errors } = await openPage(browsers, origin, "desk");
  // what the mouse did, raw (the selection, gold, the build's parts and belts, what lifted): <name>-mouse.json, the same
  // on 69fe689's build but for "notice" (the one change for the mouse)
  const seen = async (what, extra = {}) => {
    const v = await page.evaluate(() => {
      const g = window.bb.game, r = g.run, s = g.screen;
      return { sel: s.sel, gold: r.gold, items: r.build.items, routes: r.build.routes, inventory: r.inventory, carry: s.ed.carry ? s.ed.carry.def : null, draw: s.ed.draw ? s.ed.draw.cells.length : null };
    });
    mouseSeen.push({ what, ...v, ...extra });
    return v;
  };
  const click = async (p) => { await page.mouse.click(p.x, p.y); await sleep(150); };
  await openDeck(page, FURNACE);
  await packChecks(page, null, "mouse", "mouse"); // bb-0.8.6 (REQ-BFG-051 P5): the pack slots by click
  const { k } = await kview(page);
  // a click selects (a card: no lift)
  await page.mouse.move(5, 5);
  await click(await card(page, 0));
  let v = await seen("a click on the GREASE WORKS card");
  check(same(v.sel, { kind: "offer", wagon: 0, slot: 0 }) && !v.carry, `mouse: a click on a shop card selects it (${JSON.stringify(v.sel)}), nothing lifts`);
  // click-to-place
  await click(await cell(page, 3, 4));
  v = await seen("then a click on (3,4)");
  check(v.gold === 2 && v.items.some((p) => p.def === "grease" && p.x === 3 && p.y === 4), `mouse: then a click on (3,4) buys and places it (gold ${v.gold})`);
  // a click turns a rig and selects it
  const r0 = await rotOf(page, 3);
  await click(await cell(page, 3, 3));
  v = await seen("a click on the TEMPER");
  check(same(v.sel, { kind: "item", uid: 3 }) && (await rotOf(page, 3)) === (r0 + 1) % 4, `mouse: a click on the TEMPER turns it (rot ${r0} -> ${await rotOf(page, 3)}) and selects it`);
  await click(await cell(page, 3, 3));
  v = await seen("a second click on the TEMPER");
  check((await rotOf(page, 3)) === (r0 + 2) % 4, `mouse: a second click turns it again (rot ${await rotOf(page, 3)})`);
  // a cargo part clicked, then a deck cell clicked: placed
  await page.keyboard.press("Escape");
  await click(await slot(page, 0));
  await click(await cell(page, 8, 7));
  v = await seen("a click on the COIL in cargo, then on (8,7)");
  check(v.items.some((p) => p.uid === 60 && p.x === 8 && p.y === 7), "mouse: a click on the GALVANIC COIL in cargo, then on (8,7): placed there");
  // a card selected, then a click on a placed part: tap-to-place there (refused: the cell is taken) as 69fe689
  await click(await card(page, 1));
  await click(await cell(page, 5, 3));
  v = await seen("the GANTRY PRESS card (unaffordable), then a click on the OVERDRIVE");
  check(v.gold === 2 && !v.items.some((p) => p.def === "gantry"), `mouse: with an unaffordable card selected a click on the deck tries to place it and is refused (gold ${v.gold})`);
  // the drag threshold: 4 logical px
  await openDeck(page, FURNACE);
  const c0 = await card(page, 0);
  await page.mouse.move(c0.x, c0.y);
  await page.mouse.down();
  await page.mouse.move(c0.x + 3.9 * k, c0.y);
  await sleep(60);
  const before = (await look(page)).carry;
  await page.mouse.move(c0.x + 4.1 * k, c0.y);
  await sleep(60);
  const after = (await look(page)).carry;
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await sleep(100);
  await seen("the drag threshold", { at3_9: before, at4_1: after });
  check(before === null && after === "grease", `mouse: the drag threshold is 4 logical px (${(4 * k).toFixed(0)} CSS px here): at 3.9 nothing lifts (${before}), at 4.1 the card lifts (${after})`);
  // a belt click: selected, no X (Escape first: the lifted card stayed selected, and a click on the deck with a card
  // selected tries to place it there, as 69fe689)
  await page.keyboard.press("Escape");
  await click(await cell(page, 4, 2));
  v = await seen("a click on the KILN's belt", { x: !!(await region(page, "beltx")) });
  check(same(v.sel, { kind: "route", index: 0 }) && !(await region(page, "beltx")), `mouse: a click on a belt selects it (${JSON.stringify(v.sel)}) and puts up no X`);
  // a mouse drag that lays a belt. bb-0.8.3 (REQ-BFG-044 D6): the level-1 KILN has 2 belt slots, so the drag draws a
  // second belt and keeps the first (69fe689's one-output KILN moved its belt and showed the notice)
  {
    const pts = await cells(page, [[4, 7], [3, 7], [2, 7], [2, 6]]);
    await page.mouse.move(pts[0].x, pts[0].y);
    await page.mouse.down();
    for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y, { steps: 4 });
    await page.evaluate(() => { const g = window.bb.game; g.step(1 / 60); g.render(); });
    const mid = await page.evaluate(() => { const s = window.bb.game.screen; return { cells: s.ed.draw?.cells.length ?? 0, hide: s.view.hideRoute }; });
    const n0 = (await look(page)).toasts;
    await shot(page, `${TAG}-desk-kiln-second-belt.png`);
    await page.mouse.up();
    await sleep(120);
    v = await seen("a mouse drag out of the KILN through (3,7) (2,7) (2,6), released", { mid });
    const kilnBelts = v.routes.filter((r) => r.factory === 1), said = await toastsSince(page, n0);
    check(mid.hide === -1 && kilnBelts.length === 2 && same(kilnBelts[0].cells, KILN_BELT) && same(kilnBelts[1].cells, [K(3, 7), K(2, 7), K(2, 6)]) && !said.some((t) => /BELTS ARE IN USE|OUTPUT/.test(t)),
      `mouse: a drag out of the level-1 KILN (2 belt slots, 1 used) draws a second belt and keeps the first, no notice (hidden route ${mid.hide}; KILN belts ${kilnBelts.length}; toasts ${JSON.stringify(said)})`);
  }
  // bb-0.8.3 (REQ-BFG-044 D6, REQ-BFG-043 D10, D11): the full KILN's notice; a click on the KILN, then on its UPGRADE 10G,
  // buys FACTORY level 2 (was: a KILN copy bought from the caravan merged it to ★2); its third belt
  {
    await openDeck(page, KILN_DECK);
    const mdrag = async (list) => {
      const pts = await cells(page, list);
      await page.mouse.move(pts[0].x, pts[0].y);
      await page.mouse.down();
      for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y, { steps: 4 });
      await sleep(60);
      await page.mouse.up();
      await sleep(120);
    };
    await mdrag([[5, 6], [5, 5], [5, 4], [5, 3], [5, 2], [5, 1], [5, 0]]);
    const b1 = JSON.parse(await snap(page)).build;
    check(b1.routes.length === 2 && same(b1.routes[1].cells, KILN_SECOND), `mouse: a drag out of the ★1 KILN draws its second belt into column 5`);
    const s1 = await snap(page), n0 = (await look(page)).toasts;
    await mdrag([[4, 7], [3, 7], [2, 7], [2, 6]]);
    const news = await toastsSince(page, n0);
    await shot(page, `${TAG}-desk-kiln-notice.png`);
    mouseSeen.push({ what: "notice", notice: news.includes(FULL_KILN) });
    check(news.includes(FULL_KILN) && (await snap(page)) === s1, `mouse: a drag out of the full level-1 KILN says "${FULL_KILN}" and changes nothing`);
    await page.keyboard.press("Escape");
    await click(await cell(page, 4, 7));
    const up = await region(page, "upgrade-factory"), r1 = JSON.parse(s1);
    if (up) await click(centre(up));
    const r2 = JSON.parse(await snap(page)), kiln = r2.build.items.find((p) => p.uid === 1), m2 = await marksOf(page, "factory");
    mouseSeen.push({ what: "a click on the KILN, then on its UPGRADE", gold: r2.gold, upgrades: r2.build.upgrades ?? null, marks: m2.map((m) => `${m.text}:${m.px}`) });
    check(up && r2.gold === r1.gold - 10 && r2.build.upgrades?.factory === 2 && kiln && !kiln.stars && same(r2.build.routes, b1.routes) && m2.length === 1 && m2[0].px === 15,
      `mouse: a click on the KILN, then on its ${up ? "UPGRADE 10G" : "MISSING UPGRADE button"}: FACTORY level 2 (upgrades ${JSON.stringify(r2.build.upgrades ?? {})}; gold ${r1.gold} -> ${r2.gold}), its belts kept, the board's mark ${mdesc(m2)}`);
    await page.keyboard.press("Escape");
    await mdrag([[5, 6], [6, 6], [7, 6], [8, 6], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0]]);
    const b3 = JSON.parse(await snap(page)).build;
    await shot(page, `${TAG}-desk-kiln-third-belt.png`);
    check(b3.routes.length === 3 && same(b3.routes[2].cells, KILN_THIRD), `mouse: a drag out of the level-2 KILN draws its third belt into column 8 at once: ${JSON.stringify(b3.routes[2]?.cells)}`);
  }
  check(errors.length === 0, `mouse: 0 console errors (${errors.length})`);
  await ctx.close();
  loadLine("mouse desk: end");
}

// ------------------------------------------------------------------------------------------------------------- 319
async function summarySection(browsers, origin) {
  log("");
  log("## 319: the run summary offline, 20 rows (a warlord and a dusk each day): the card on the screen, NEW RUN and TITLE");
  for (const vname of ["phone", "phone-land", "small", "desk"]) {
    loadLine(`319 ${vname}: start`);
    const { ctx, page, errors } = await openPage(browsers, origin, vname);
    await page.evaluate(() => window.bb.openEnd({ hero: "furnace", seed: 12345, results: "WWWWWWWWWW", roads: "EEEEEEEEEE" }));
    await settle(page, "summary");
    await sleep(300);
    const m = await page.evaluate(() => {
      const v = window.bb.game.view, k = v.scale / v.dpr, s = window.bb.game.screen;
      const reg = (id) => window.bb.regions().find((q) => q.id === id) ?? null;
      return { k, W: v.W, H: v.H, scale: v.scale, rows: s.fights().length, again: reg("again"), title: reg("title") };
    });
    const vp = VIEW[vname].viewport, touch = !!VIEW[vname].hasTouch;
    const bottom = m.again.y + m.again.h + 6 * m.k; // the card's bottom: 6 px under NEW RUN
    await page.screenshot({ path: join(OUT, `${TAG}-319-${vname}-summary.png`) });
    shots.push(`${TAG}-319-${vname}-summary.png`);
    log(`[${at()}] 319 ${vname}: summary ${m.W}x${m.H} at x${m.scale}, ${m.rows} rows; NEW RUN ${m.again.w.toFixed(1)}x${m.again.h.toFixed(1)} CSS px, TITLE ${m.title.w.toFixed(1)}x${m.title.h.toFixed(1)}; the card ends at ${bottom.toFixed(1)} of ${vp.height} CSS px`);
    check(m.rows === 20 && bottom <= vp.height, `319 ${vname}: the 20-row card ends on the screen (${bottom.toFixed(1)} <= ${vp.height} CSS px)`);
    if (touch) check(m.again.h >= TAP_CSS && m.title.h >= TAP_CSS, `319 ${vname}: NEW RUN and TITLE are at least 44 CSS px tall (${m.again.h.toFixed(1)}, ${m.title.h.toFixed(1)})`);
    else check(Math.abs(m.again.h - 21 * m.k) < 0.01 && Math.abs(m.title.h - 21 * m.k) < 0.01, `319 ${vname}: NEW RUN and TITLE are 0.8.0's 21 px (${m.again.h.toFixed(1)} CSS px)`);
    check(errors.length === 0, `319 ${vname}: 0 console errors (${errors.length})`);
    await ctx.close();
    loadLine(`319 ${vname}: end`);
  }
}

// ----------------------------------------------------------------------------------------------- PACKS M2: names
/** PACKS M2 (REQ-BFG-063): the name screen on a fresh device (offline, no server URL): the title's first tap opens it and
 *  nothing gets past it but a name; its <input> (phone keyboard attributes, upper case as typed) and OK (44 x 44 CSS px at
 *  least, tappable; Enter submits too); the refusals on the screen; the name kept over a reload; the options card's NAME
 *  entry (on the title and in a run) opens the same screen, CANCEL keeps the old name, OK changes it. */
async function namesSection(browsers, origin) {
  log("");
  log("## PACKS M2 (REQ-BFG-063): required player names: the name screen, its input and OK, the options card's NAME entry");
  for (const vname of ["phone", "wk-op-690", "wk-iphone13", "desk"]) {
    if (!browsers[ENGINE(vname)]) continue;
    loadLine(`names ${vname}: start`);
    const { ctx, page, errors } = await openPage(browsers, origin, vname);
    const touch = !!VIEW[vname].hasTouch, vp = page.viewportSize();
    const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
    const press = async (p) => {
      if (touch) await page.touchscreen.tap(p.x, p.y);
      else await page.mouse.click(p.x, p.y);
      await sleep(250);
    };
    const tapEl = async (sel) => {
      if (touch) await page.tap(sel);
      else await page.click(sel);
      await sleep(250);
    };
    const state = () => page.evaluate(() => ({
      entry: window.bb.nameEntry(), screen: window.bb.screen(), name: window.bb.playerName(), stored: localStorage.getItem("beltbattles.name.v1"),
      dom: !!document.getElementById("bb-name"), cancel: !!document.getElementById("bb-name-cancel"),
    }));
    const enter = async (text, how) => {
      await page.fill("#bb-name-input", "");
      await tapEl("#bb-name-input");
      await page.keyboard.type(text);
      if (how === "enter") await page.keyboard.press("Enter");
      else await tapEl("#bb-name-ok");
      await sleep(250);
    };
    try {
      await settle(page, "title");
      let s = await state();
      check(s.name === null && s.stored === null && s.entry === null && !s.dom, `names ${vname}: a fresh device has no name stored, and the title shows no name screen before a tap`);
      await press(center(await regionDrawn(page, "new")));
      s = await state();
      check(s.entry?.required === true && s.screen === "title" && s.dom && !s.cancel, `names ${vname}: the title's first tap (NEW RUN) opens the name screen, required (no CANCEL), before hero select (screen ${s.screen})`);
      const attrs = await page.evaluate(() => {
        const i = document.getElementById("bb-name-input");
        return { tag: i.tagName, type: i.type, cap: i.getAttribute("autocapitalize"), ac: i.getAttribute("autocomplete"), sp: i.getAttribute("spellcheck"), ekh: i.getAttribute("enterkeyhint") };
      });
      check(attrs.tag === "INPUT" && attrs.type === "text" && attrs.cap === "characters" && attrs.ac === "off" && attrs.sp === "false" && attrs.ekh === "done",
        `names ${vname}: a real <input type=text>, autocapitalize=characters, autocomplete=off, spellcheck=false, enterkeyhint=done (${JSON.stringify(attrs)})`);
      const ok = await page.locator("#bb-name-ok").boundingBox(), inp = await page.locator("#bb-name-input").boundingBox();
      const onScreen = (b) => !!b && b.x >= 0 && b.y >= 0 && b.x + b.width <= vp.width + 0.5 && b.y + b.height <= vp.height + 0.5;
      check(onScreen(ok) && onScreen(inp) && ok.width >= TAP_CSS && ok.height >= TAP_CSS && inp.height >= TAP_CSS,
        `names ${vname}: OK ${ok?.width.toFixed(1)}x${ok?.height.toFixed(1)} CSS px and the input ${inp?.width.toFixed(1)}x${inp?.height.toFixed(1)}, at least 44 CSS px, on the screen (${vp.width}x${vp.height})`);
      await page.screenshot({ path: join(OUT, `${TAG}-names-${vname}-screen.png`) });
      shots.push(`${TAG}-names-${vname}-screen.png`);
      // it can't be skipped: Escape, a tap beside the panel and on NEW RUN under it, an empty OK
      await page.keyboard.press("Escape");
      await press({ x: vp.width / 2, y: vp.height - 30 });
      await press(center(await regionDrawn(page, "new")));
      await tapEl("#bb-name-ok");
      s = await state();
      check(s.entry?.problem === "missing" && s.entry.refusal === "TYPE A NAME" && s.screen === "title" && s.name === null && s.dom,
        `names ${vname}: it can't be skipped: Escape, taps beside it and an empty OK leave it up, refusing with "${s.entry?.refusal}"; still the title, no name stored`);
      // upper case as typed; the reserved name and a too long one are refused on the screen
      await page.fill("#bb-name-input", "");
      await tapEl("#bb-name-input");
      await page.keyboard.type("wanderer");
      const typed = await page.inputValue("#bb-name-input");
      await tapEl("#bb-name-ok");
      s = await state();
      check(typed === "WANDERER" && s.entry?.problem === "not allowed" && s.entry.refusal === "PICK ANOTHER NAME" && s.name === null,
        `names ${vname}: letters show upper case as typed ("wanderer" shows ${typed}); OK refuses it with "${s.entry?.refusal}" on the screen`);
      await page.screenshot({ path: join(OUT, `${TAG}-names-${vname}-refused.png`) });
      shots.push(`${TAG}-names-${vname}-refused.png`);
      await enter("abcdefghijk", "ok");
      s = await state();
      check(s.entry?.refusal === "NAME TOO LONG" && s.name === null, `names ${vname}: 11 characters: "${s.entry?.refusal}"`);
      // a good name: Enter on the desk and the 402x690 phone, OK elsewhere; NEW RUN then goes on
      const how = vname === "desk" || vname === "wk-op-690" ? "enter" : "ok";
      await enter("  anna  b ", how);
      await settle(page, "hero");
      s = await state();
      check(s.name === "ANNA B" && s.stored === "ANNA B" && s.entry === null && !s.dom,
        `names ${vname}: ${how === "enter" ? "Enter" : "a tap on OK"} stores "${s.name}" (trimmed, one space, upper case); the screen goes and NEW RUN goes on to hero select`);
      // a reload keeps it: NEW RUN goes straight to hero select
      await page.reload();
      await page.waitForFunction(() => !!window.bb, null, { timeout: 15000 });
      await settle(page, "title");
      await press(center(await regionDrawn(page, "new")));
      await settle(page, "hero");
      s = await state();
      check(s.name === "ANNA B" && s.entry === null, `names ${vname}: after a reload the name is kept and NEW RUN goes straight to hero select`);
      // the options card's NAME entry, on the title: CANCEL keeps the old name; OK changes it
      await page.reload();
      await page.waitForFunction(() => !!window.bb, null, { timeout: 15000 });
      await settle(page, "title");
      // 0.8.6 staging: wait for OPTIONS to be drawn after the reload, as the NEW RUN press above does (a713df1); a
      // slow WebKit start left the region null here ("Cannot read properties of null (reading 'x')")
      await press(center(await regionDrawn(page, "options")));
      const opt = await region(page, "opt-name");
      check(!!opt, `names ${vname}: the options card has a NAME entry (${opt ? `${opt.w.toFixed(1)}x${opt.h.toFixed(1)} CSS px` : "missing"})`);
      if (opt) {
        await press(center(opt));
        s = await state();
        const prefill = await page.inputValue("#bb-name-input");
        check(s.entry?.required === false && s.cancel && prefill === "ANNA B", `names ${vname}: NAME opens the same screen with the name in it ("${prefill}") and a CANCEL`);
        await page.fill("#bb-name-input", "zed");
        await tapEl("#bb-name-cancel");
        s = await state();
        check(s.name === "ANNA B" && s.entry === null && !s.dom, `names ${vname}: CANCEL keeps the old name (${s.name})`);
        await press(center(await region(page, "opt-name")));
        await enter("bob-7", how);
        s = await state();
        check(s.name === "BOB-7" && s.stored === "BOB-7" && s.entry === null && s.screen === "title", `names ${vname}: NAME, then "bob-7" and ${how === "enter" ? "Enter" : "OK"}: the name is now ${s.name}`);
      }
      // in a run: the build screen's MENU card has it too, and the run stays as it was
      await page.evaluate(() => window.bb.openDawn({ hero: "furnace", day: 2, gold: 10, seed: 12345 }));
      await settle(page, "build");
      const before = await page.evaluate(() => JSON.stringify(window.bb.game.run.build));
      await press(center(await region(page, "menu")));
      const opt2 = await region(page, "opt-name");
      if (opt2) await press(center(opt2));
      s = await state();
      const pre2 = s.dom ? await page.inputValue("#bb-name-input") : null;
      if (s.dom) await tapEl("#bb-name-cancel");
      const after = await state();
      const same = before === (await page.evaluate(() => JSON.stringify(window.bb.game.run.build)));
      check(!!opt2 && s.entry?.required === false && pre2 === "BOB-7" && after.entry === null && after.screen === "build" && after.name === "BOB-7" && same,
        `names ${vname}: in a run, the build screen's MENU card has NAME: the same screen ("${pre2}"); CANCEL leaves the build screen and the run as they were`);
      // a player updating from 0.8.5: a saved run (the build screen saved it) and no name: CONTINUE meets the name screen first
      await page.evaluate(() => localStorage.removeItem("beltbattles.name.v1"));
      await page.reload();
      await page.waitForFunction(() => !!window.bb, null, { timeout: 15000 });
      await settle(page, "title");
      // 0.8.8 staging: wait for CONTINUE to be drawn after the reload, as OPTIONS above does (c57de36); read at once, the
      // region was null under load (touch-f80875e-run1, names phone), so nothing was pressed and the build wait timed out
      const cont = await regionDrawn(page, "cont");
      if (cont) await press(center(cont));
      const met = await state();
      if (met.dom) await enter("cap 7", how);
      await settle(page, "build");
      s = await state();
      check(!!cont && met.entry?.required === true && met.screen === "title" && s.name === "CAP 7" && s.screen === "build" && s.entry === null,
        `names ${vname}: updating from 0.8.5 (a saved run, no name): CONTINUE opens the name screen first (required), then the saved run (${s.screen}, ${s.name})`);
    } catch (e) {
      check(false, `names ${vname}: the section stopped: ${String(e instanceof Error ? e.message : e).split("\n")[0]}`);
    }
    check(errors.length === 0, `names ${vname}: 0 console errors (${errors.length}${errors.length ? `: ${errors[0]}` : ""})`);
    await ctx.close();
    loadLine(`names ${vname}: end`);
  }
}

// ------------------------------------------------------------------------------------ CUSTOM-2b: CUSTOMIZE and the title
/** CUSTOM-2b (REQ-BFG-072): the views the CUSTOMIZE, NEW STYLE and road/fork checks run on: every touchcheck phone (the
 *  touch views, the 360x640 @2 phone and the DPR 2 375x667 phone) and the desk (the mouse). --cviews narrows it. */
const CUSTOM_VIEWS = opt("cviews", "phone,phone-660,phone-land,wk-phone,wk-phone-660,wk-phone-land,wk-iphone13,wk-iphone15pm,wk-op-690,small,bar-667,desk").split(",").map((s) => s.trim());
/** customize.ts customizeScale (CUSTOM-2a), with core/io.ts defaultScale: the menu scale where the portrait layout has
 *  WANT_H (494) logical px, else the largest smaller scale that does, never under one CSS px per logical px; landscape
 *  keeps the menu scale. pw, ph: device px. */
const menuScale = (pw, ph, portrait) => Math.max(1, Math.floor(Math.min(pw / (portrait ? 200 : 440), ph / (portrait ? 400 : 346))));
function customizeScaleOf(pw, ph, portrait, dpr) {
  const menu = menuScale(pw, ph, portrait);
  if (!portrait) return menu;
  const least = Math.min(menu, Math.max(1, Math.ceil(dpr - 1e-6)));
  for (let s = menu; s > least; s--) if (Math.floor(ph / s) >= 494) return s;
  return least;
}
/** CUSTOM-2a REPORT section 11: customizeScale 5 at 390x844 @3, 4 at 390x660 @3, 2 at 360x640 @2. */
const SCALE_PINS = { phone: 5, "wk-phone": 5, "phone-660": 4, "wk-phone-660": 4, small: 2 };
const LIME = [40, 255, 100], AMBER = [243, 143, 50];
/** The game's canvas (one canvas px per logical px) read back in a scratch canvas, as marksOf does (the game's own canvas
 *  is never read back): how many pixels of the logical rect are within 3 of `rgb`, after a fresh frame. */
const countPx = (page, r, rgb) => page.evaluate(([q, c]) => {
  const g = window.bb.game;
  g.step(1 / 60);
  g.render();
  const sc = document.createElement("canvas");
  sc.width = g.canvas.width;
  sc.height = g.canvas.height;
  const cx = sc.getContext("2d", { willReadFrequently: true });
  cx.drawImage(g.canvas, 0, 0);
  const d = cx.getImageData(Math.round(q.x), Math.round(q.y), Math.max(1, Math.round(q.w)), Math.max(1, Math.round(q.h))).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - c[0]) <= 3 && Math.abs(d[i + 1] - c[1]) <= 3 && Math.abs(d[i + 2] - c[2]) <= 3) n++;
  return n;
}, [r, rgb]);
const stored = (page) => page.evaluate((k) => { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; }, PROFILE_KEY);
const cinfo = (page) => page.evaluate(() => window.bb.profile().customize);
const box = (r) => (r ? `${r.w.toFixed(1)}x${r.h.toFixed(1)} at (${r.x.toFixed(1)}, ${r.y.toFixed(1)})` : "MISSING");
const overlap = (a, b) => a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01;
const near = (a, b, e = 0.05) => Math.abs(a - b) <= e;

/**
 * CUSTOM-2b (REQ-BFG-072): the title's way in and the CUSTOMIZE screen, on one view, by real touch (a click on the desk):
 *  - the title (CUSTOM-2a REPORT section 11): CUSTOMIZE is the third button of the HOW TO PLAY / OPTIONS row (one row,
 *    4 px apart, at least 40 px wide); HOW TO PLAY and OPTIONS keep 0350e5f's halves; NEW RUN spans the wider row; the
 *    panel holds them all on the screen; a tap on HOW TO PLAY and on OPTIONS still opens its card; the NEW dot (a 3x3 lime
 *    dot, read back off the canvas) shows exactly while an unlocked style is unseen;
 *  - CUSTOMIZE: its scale (customizeScale), rows of 46 px in portrait above the footer, BACK, the three tabs and the five
 *    rows each a finger's target (44 CSS px tall on a phone) inside the visible viewport and apart, matching
 *    bb.profile().customize.L; the NEW tags; each tab by a tap; each of the five rows of each tab by a tap: an open style
 *    is worn and saved at once, a locked one previews only (PREVIEW: NOT YOURS YET. drawn in its band, nothing worn or
 *    saved) and a tab brings back what you wear; BACK and ESC leave without wearing a previewed style; the NEW dot is gone
 *    after the visit; a reload keeps what was worn.
 */
async function customizeView(browsers, origin, vname) {
  const V = `customize ${vname}`;
  viewNow = V;
  loadLine(`${V}: start`);
  const touch = !!VIEW[vname].hasTouch;
  const { ctx, page, cdp, errors } = await openPage(browsers, origin, vname, { name: "TOUCH" });
  let n = 0;
  const press = async (p) => {
    if (touch) { const [d, deg] = DRIFTS[n++ % DRIFTS.length]; await tap(cdp, p, d, deg); } else { await page.mouse.click(p.x, p.y); await sleep(150); }
  };
  const verb = touch ? "a tap" : "a click";
  try {
    await settle(page, "title");
    for (const id of ["new", "help", "options", "customize"]) await regionDrawn(page, id);
    await nextFrame(page);
    const T = await page.evaluate(() => {
      const s = window.bb.game.screen, v = window.bb.game.view, info = s.layoutInfo();
      return { k: info.k, panel: info.panel, b: s.L.buttons, newStyle: s.newStyle, W: v.W, H: v.H, scale: v.scale, dpr: v.dpr, unseen: window.bb.profile().unseen };
    });
    const c = T.scale / T.dpr; // CSS px per logical px
    const R = {};
    for (const id of ["new", "cont", "help", "options", "customize"]) R[id] = await region(page, id);
    const [h, o, cu, nw] = [R.help, R.options, R.customize, R.new];
    log(`[${at()}] ${V}: title ${T.W}x${T.H} at x${T.scale} (dpr ${T.dpr}, k ${T.k}); NEW RUN ${box(nw)}, HOW TO PLAY ${box(h)}, OPTIONS ${box(o)}, CUSTOMIZE ${box(cu)} CSS px; unseen ${JSON.stringify(T.unseen)}`);
    const row = !!(h && o && cu) && near(h.y, o.y) && near(o.y, cu.y) && near(h.h, o.h) && near(o.h, cu.h)
      && near(o.x, h.x + h.w + 4 * c) && near(cu.x, o.x + o.w + 4 * c) && cu.w >= 40 * c - 0.05 && !overlap(h, o) && !overlap(o, cu);
    check(row, `${V}: CUSTOMIZE is the third button of the HOW TO PLAY / OPTIONS row (one row ${h ? h.h.toFixed(1) : "?"} CSS px tall, 4 px apart, left to right), ${cu ? (cu.w / c).toFixed(0) : "?"} px wide (at least 40: its word and the NEW dot)`);
    const u = (x) => Math.ceil(x * T.k - 1e-9), bw0 = Math.min(T.W - 24, Math.max(u(132), 2 * u(64) + 4)), hw = Math.floor((bw0 - 4) / 2);
    const P = T.panel, inside = (b) => b.x >= P.x && b.y >= P.y && b.x + b.w <= P.x + P.w && b.y + b.h <= P.y + P.h;
    const wide = !!(h && o && cu && nw) && near(h.w, hw * c) && near(o.w, hw * c) && near(nw.x, h.x) && near(nw.x + nw.w, cu.x + cu.w)
      && ["new", "help", "options", "customize"].every((id) => inside(T.b[id])) && (!T.b.cont || inside(T.b.cont)) && P.x >= 0 && P.x + P.w <= T.W && P.y >= 0 && P.y + P.h <= T.H;
    check(wide, `${V}: HOW TO PLAY and OPTIONS keep 0350e5f's halves (${hw} px each: ${h ? (h.w / c).toFixed(1) : "?"}, ${o ? (o.w / c).toFixed(1) : "?"}); NEW RUN spans the wider row (${nw ? (nw.w / c).toFixed(1) : "?"} px = the halves + CUSTOMIZE's ${cu ? (cu.w / c).toFixed(1) : "?"} + 8); the panel (${P.w}x${P.h} px at ${P.x}, ${P.y}) holds every button, on the screen`);
    // the NEW dot: newDot draws a 3x3 lime dot at the button's top right, in a 5x5 ink rim
    const dotAt = (b) => ({ x: b.x + b.w - 6, y: b.y + 3, w: 3, h: 3 });
    const want = T.unseen.length > 0;
    const dot0 = await countPx(page, dotAt(T.b.customize), LIME);
    check(T.newStyle === want && dot0 === (want ? 9 : 0), `${V}: the NEW dot ${want ? "shows" : "is off"} with ${T.unseen.length} unlocked style(s) unseen (newStyle ${T.newStyle}; ${dot0}/9 lime px at its place as drawn)`);
    if (want) await shot(page, `${TAG}-customize-${vname}-title-newdot.png`);
    // HOW TO PLAY and OPTIONS moved left by none (the panel grew to the right and re-centred): each still opens its card
    if (h) await press(centre(h));
    const help = await page.evaluate(() => window.bb.game.screen.help === true);
    await page.keyboard.press("Escape");
    await sleep(100);
    if (o) await press(centre(o));
    const menu = await page.evaluate(() => window.bb.game.screen.menu === true);
    await page.keyboard.press("Escape");
    await sleep(100);
    const shut = await page.evaluate(() => !window.bb.game.screen.help && !window.bb.game.screen.menu);
    check(help && menu && shut, `${V}: ${verb} on HOW TO PLAY opens its card (${help}), on OPTIONS the options card (${menu}); ESC shuts each (${shut})`);

    // ---- CUSTOMIZE: in by the title's button
    if (cu) await press(centre(cu));
    await settle(page, "customize");
    await regionDrawn(page, "back");
    await nextFrame(page);
    const env = await page.evaluate(() => ({ iw: innerWidth, ih: innerHeight, dpr: devicePixelRatio, v: { ...window.bb.game.view } }));
    let ci = await cinfo(page);
    const L = ci.L, cc = env.v.scale / env.v.dpr;
    const pw = Math.floor(env.iw * env.dpr), ph = Math.floor(env.ih * env.dpr), portrait = ph > pw * 1.05;
    const wantScale = customizeScaleOf(pw, ph, portrait, env.dpr), pin = SCALE_PINS[vname];
    check(env.v.scale === wantScale && (pin === undefined || env.v.scale === pin),
      `${V}: ${verb} on CUSTOMIZE opens it at its own scale x${env.v.scale} (customizeScale for ${pw}x${ph} device px, ${portrait ? "portrait" : "landscape"}: x${wantScale}${pin !== undefined ? `; CUSTOM-2a's pin x${pin}` : ""}): ${L.W}x${L.H} logical px, ${cc.toFixed(3)} CSS px each`);
    const rowsOk = L.rows.length === 5 && L.rows.every((r, i) => (!L.portrait || r.h === 46) && (i === 0 || r.y >= L.rows[i - 1].y + L.rows[i - 1].h)) && L.rows[4].y + L.rows[4].h <= L.footY;
    check(rowsOk, `${V}: five rows ${L.portrait ? "of 46 px (a finger's height)" : `${L.rows[0].h} px tall (the landscape column)`}, top to bottom, above the footer (rows ${L.rows.map((r) => `${r.y}+${r.h}`).join(", ")}; footer at ${L.footY})`);
    const ids = ["back", "tab-floor", "tab-belt", "tab-panel", "tab-carrier", ...CATALOGUE[ci.tab].map((id) => `style-${ci.tab}-${id}`)];
    const regs = await page.evaluate((list) => list.map((i) => window.bb.regions().filter((q) => q.id === i).pop() ?? null), ids);
    const want2 = [L.backHit, ...L.tabHits, ...L.rows].map((r) => { const p = { x: r.x * cc, y: r.y * cc, w: r.w * cc, h: r.h * cc }; return p; });
    const canvasAt = await page.evaluate(() => { const r = window.bb.game.canvas.getBoundingClientRect(); return { x: r.left, y: r.top }; });
    const l0 = await lookVis(page);
    const match = regs.every((r, i) => !!r && near(r.x, canvasAt.x + want2[i].x, 0.02) && near(r.y, canvasAt.y + want2[i].y, 0.02) && near(r.w, want2[i].w, 0.02) && near(r.h, want2[i].h, 0.02));
    const big = regs.every((r) => !!r && (!touch || r.h >= TAP_CSS - 0.01)) && (!touch || (regs[0] && regs[0].w >= TAP_CSS - 0.01));
    const apart = regs.every((r, i) => regs.every((q, j) => j <= i || !r || !q || !overlap(r, q)));
    const vis = regs.every((r) => inView(r, l0));
    check(match && big && apart && vis && L.tabHits.length === 4, `${V}: BACK, the four tabs and the five rows are the targets bb.profile().customize.L names (${match ? "each drawn region matches" : "a region DIFFERS"}), ${touch ? `each at least 44 CSS px tall (BACK 44 wide too: ${box(regs[0])})` : "the desk's own sizes"}, ${apart ? "apart" : "OVERLAPPING"}, ${vis ? "inside" : "NOT inside"} the visible viewport (heights ${regs.map((r) => (r ? r.h.toFixed(1) : "-")).join(", ")} CSS px)`);
    // the NEW tags: the unlocks unseen when the screen opened show NEW, and the visit marks them seen (saved)
    const freshWant = T.unseen.slice().sort();
    const fresh = [];
    for (const s of ["floor", "belt", "panel", "carrier"]) {
      await page.evaluate((t) => window.bb.game.screen.state.tapTab(t), s);
      for (const r of (await cinfo(page)).rows) if (r.fresh) fresh.push(`style:${s}.${r.id}`);
    }
    await page.evaluate(() => window.bb.game.screen.state.tapTab("floor"));
    const unseenAfter = (await page.evaluate(() => window.bb.profile().unseen)).length;
    check(same(fresh.sort(), freshWant) && unseenAfter === 0, `${V}: the rows tagged NEW are the unlocks unseen at the title (${JSON.stringify(fresh)}); the visit marks them seen (${unseenAfter} unseen now, saved)`);
    // each tab, then each of its five rows, by a tap (a click on the desk)
    let lockedShot = false, carrierShot = false;
    const tabOrder = ["belt", "panel", "carrier", "floor"]; // CUSTOM-3: + CARRIER (the floor tab last: BACK and ESC below use it)
    for (const t of tabOrder) {
      await press(centre(await region(page, `tab-${t}`)));
      ci = await cinfo(page);
      const ok = ci.tab === t && same(ci.rows.map((r) => r.id), CATALOGUE[t]) && ci.pick === ci.worn[t] && !ci.locked;
      check(ok, `${V}: ${verb} on the ${t.toUpperCase()} tab opens it (tab ${ci.tab}; rows ${ci.rows.map((r) => `${r.id}${r.open ? "" : " (locked)"}`).join(", ")}); the preview shows what you wear (${ci.pick})`);
      for (const id of CATALOGUE[t]) {
        const before = await cinfo(page), st0 = await stored(page), rowSt = before.rows.find((r) => r.id === id);
        const rr = await region(page, `style-${t}-${id}`);
        if (!rr) { check(false, `${V}: the ${t} row ${id} has no target`); continue; }
        await press(centre(rr));
        const after = await cinfo(page), st1 = await stored(page);
        if (rowSt.open) {
          check(after.worn[t] === id && st1?.chosen?.[t] === id && after.pick === id && !after.locked,
            `${V}: ${verb} on the open ${t} row ${id} wears it and saves it at once (worn ${after.worn[t]}, stored ${st1?.chosen?.[t]}); no PREVIEW band`);
        } else {
          const band = await countPx(page, after.L.band, AMBER);
          check(after.pick === id && after.locked && after.worn[t] === before.worn[t] && st1?.chosen?.[t] === st0?.chosen?.[t] && band > 0,
            `${V}: ${verb} on the locked ${t} row ${id} (${rowSt.progress ? rowSt.progress.join("/") : "?"}) previews it only: PREVIEW: NOT YOURS YET. drawn in its band (${band} amber px), still wearing ${after.worn[t]} (stored ${st1?.chosen?.[t]})`);
          if (!lockedShot) { lockedShot = true; await shot(page, `${TAG}-customize-${vname}-locked-${t}-${id}.png`); }
          if (t === "carrier" && !carrierShot) { carrierShot = true; await shot(page, `${TAG}-customize-${vname}-locked-carrier-${id}.png`); }
          await press(centre(await region(page, `tab-${t}`)));
          const back = await cinfo(page);
          check(back.pick === back.worn[t] && !back.locked, `${V}: ${verb} on the ${t.toUpperCase()} tab after it brings back what you wear (${back.pick})`);
        }
      }
    }
    await shot(page, `${TAG}-customize-${vname}-floor.png`);
    // BACK leaves without wearing a previewed locked style; the NEW dot is gone
    const locked = (await cinfo(page)).rows.find((r) => !r.open);
    const st2 = await stored(page);
    if (locked) await press(centre(await region(page, `style-floor-${locked.id}`)));
    const pv = await cinfo(page);
    await press(centre(await region(page, "back")));
    await settle(page, "title");
    await regionDrawn(page, "customize");
    const st3 = await stored(page);
    const T2 = await page.evaluate(() => ({ b: window.bb.game.screen.L.buttons.customize, newStyle: window.bb.game.screen.newStyle }));
    const dot1 = await countPx(page, dotAt(T2.b), LIME);
    check(!!locked && pv.locked && same(st3?.chosen, st2?.chosen) && T2.newStyle === false && dot1 === 0,
      `${V}: BACK from a locked preview (${locked ? locked.id : "none"}) goes to the title wearing what was saved (${JSON.stringify(st3?.chosen)}); no NEW dot now (newStyle ${T2.newStyle}, ${dot1} lime px)`);
    // ESC leaves too, again without wearing a previewed style
    await press(centre(await region(page, "customize")));
    await settle(page, "customize");
    await regionDrawn(page, "back");
    const re = await cinfo(page);
    if (locked) await press(centre(await region(page, `style-floor-${locked.id}`)));
    const pv2 = await cinfo(page);
    await page.keyboard.press("Escape");
    await settle(page, "title");
    const st4 = await stored(page);
    check(re.pick === re.worn.floor && !re.locked && pv2.locked && same(st4?.chosen, st2?.chosen),
      `${V}: back in CUSTOMIZE the preview shows what you wear (${re.pick}); ESC from a locked preview goes to the title, nothing worn (${JSON.stringify(st4?.chosen)})`);
    // CUSTOM-3: BACK and ESC from a locked CARRIER preview leave without wearing it either
    for (const how of ["BACK", "ESC"]) {
      await press(centre(await region(page, "customize")));
      await settle(page, "customize");
      await regionDrawn(page, "back");
      await press(centre(await region(page, "tab-carrier")));
      const cc0 = await cinfo(page), stc0 = await stored(page);
      const lockedC = cc0.rows.find((r) => !r.open);
      if (lockedC) await press(centre(await region(page, `style-carrier-${lockedC.id}`)));
      const pvc = await cinfo(page);
      if (how === "BACK") await press(centre(await region(page, "back")));
      else await page.keyboard.press("Escape");
      await settle(page, "title");
      const stc1 = await stored(page);
      check(!!lockedC && pvc.tab === "carrier" && pvc.locked && pvc.preview.carrier === lockedC.id && same(stc1?.chosen, stc0?.chosen) && stc1?.chosen?.carrier === cc0.worn.carrier,
        `${V}: ${how} from a locked CARRIER preview (${lockedC ? lockedC.id : "none"}) goes to the title, the carrier worn still ${stc1?.chosen?.carrier} (${JSON.stringify(stc1?.chosen)})`);
    }
    // the choice persists over a reload
    await page.reload();
    await page.waitForFunction(() => !!window.bb, null, { timeout: 15000 });
    await settle(page, "title");
    const wears = await page.evaluate(() => window.bb.profile().wears);
    check(same(wears, st4?.chosen), `${V}: after a reload the player wears what was saved (${JSON.stringify(wears)})`);
  } catch (e) {
    check(false, `${V}: the section stopped: ${String(e instanceof Error ? e.message : e).split("\n")[0]}`);
  }
  check(errors.length === 0, `${V}: 0 console errors (${errors.length}${errors.length ? `: ${errors[0]}` : ""})`);
  await ctx.close();
  loadLine(`${V}: end`);
}
/** The visible viewport (CSS px) as lookNow measures it, for inView, on any screen. */
const lookVis = (page) => page.evaluate(() => {
  const vv = window.visualViewport;
  const vis = { x: vv ? vv.offsetLeft : 0, y: vv ? vv.offsetTop : 0, w: vv ? vv.width : innerWidth, h: vv ? vv.height : innerHeight };
  const x0 = Math.max(0, vis.x), y0 = Math.max(0, vis.y), x1 = Math.min(innerWidth, vis.x + vis.w), y1 = Math.min(innerHeight, vis.y + vis.h);
  return { vis: { x: x0, y: y0, w: Math.round(x1 - x0), h: Math.round(y1 - y0) } };
});

async function customizeSection(browsers, origin) {
  log("");
  log(`## CUSTOM-2b (REQ-BFG-072) and CUSTOM-3 (REQ-BFG-074): the title's way in and CUSTOMIZE (profile: ${PROFILE}): the third button, the NEW dot, customizeScale, BACK, the four tabs (CARRIER the fourth), the five rows a tab, a locked row's preview, BACK and ESC, a reload`);
  for (const v of CUSTOM_VIEWS) {
    if (!browsers[ENGINE(v)]) continue;
    await customizeView(browsers, origin, v);
  }
}

/**
 * CUSTOM-2b (REQ-BFG-072): the summary's NEW STYLE lines (CUSTOM-2a db7ead0): a 10-0 run's summary for a player with every
 * style open (no line) and for a new player (the run's end unlocks four: two lines). The lines sit in the card's own gap:
 * NEW RUN and TITLE are the same targets with and without them, on the screen, 44 CSS px tall on a phone.
 */
async function newStyleSection(browsers, origin) {
  log("");
  log("## CUSTOM-2b (REQ-BFG-072): the summary's NEW STYLE lines: the card doesn't move, its buttons are unchanged");
  for (const vname of CUSTOM_VIEWS) {
    if (!browsers[ENGINE(vname)]) continue;
    const V = `newstyle ${vname}`;
    loadLine(`${V}: start`);
    const seen = [];
    try {
      for (const [label, prof] of [["every style open", PROFILES.allopen], ["a new player", null]]) {
        const { ctx, page, errors } = await openPage(browsers, origin, vname, { profile: prof });
        try {
          await settle(page, "title");
          await page.evaluate(() => window.bb.openEnd({ hero: "furnace", seed: 12345, results: "WWWWWWWWWW" }));
          await settle(page, "summary");
          await regionDrawn(page, "again");
          await nextFrame(page);
          const m = await page.evaluate(() => {
            const s = window.bb.game.screen, v = window.bb.game.view, reg = (id) => window.bb.regions().filter((q) => q.id === id).pop() ?? null;
            return { lines: s.noteLines(), again: reg("again"), title: reg("title"), k: v.scale / v.dpr, ids: window.bb.regions().map((q) => q.id) };
          });
          seen.push({ label, ...m, errors: errors.length });
          if (m.lines.length) await shot(page, `${TAG}-newstyle-${vname}-summary.png`);
        } finally {
          await ctx.close();
        }
      }
      const [a, b] = seen, vp = VIEW[vname].viewport, touch = !!VIEW[vname].hasTouch;
      const sameBtn = !!(a.again && b.again && a.title && b.title) && ["x", "y", "w", "h"].every((q) => near(a.again[q], b.again[q], 0.01) && near(a.title[q], b.title[q], 0.01));
      const bottom = b.again ? b.again.y + b.again.h + 6 * b.k : Infinity;
      check(a.lines.length === 0 && b.lines.length === 2 && b.lines.every((t) => /^NEW STYLES?: /.test(t)) && sameBtn && bottom <= vp.height && (!touch || (b.again.h >= TAP_CSS && b.title.h >= TAP_CSS)) && same(a.ids, b.ids),
        `${V}: a 10-0 summary: ${JSON.stringify(a.lines)} for a player with every style open, ${JSON.stringify(b.lines)} for a new player; NEW RUN (${box(b.again)}) and TITLE (${box(b.title)}) are the same targets either way (${sameBtn ? "yes" : "NO"}), the card ends on the screen (${bottom.toFixed(1)} <= ${vp.height})${touch ? ", both at least 44 CSS px tall" : ""}`);
      check(a.errors + b.errors === 0, `${V}: 0 console errors (${a.errors + b.errors})`);
    } catch (e) {
      check(false, `${V}: the section stopped: ${String(e instanceof Error ? e.message : e).split("\n")[0]}`);
    }
    loadLine(`${V}: end`);
  }
}

/**
 * CUSTOM-2b (REQ-BFG-072): the road fork and the road event draw the day's sea (CUSTOM-2a P1); their targets stay. On each
 * view: the fork (day 3) and the day-1 event, every target's region (CSS px) written to <name>-roadfork.json, so a run
 * on 8fbba9d's build (no sea) can be compared with it; a tap (a click on the desk) on the fork's ROAD EVENT card picks
 * it (in portrait the first tap inspects, as 0.6.0b's touch rule) and the event opens; a tap on its first choice picks it.
 * TOUCH-099 (MERGE-099D; REVIEW-MERGE099C ruling 1): with NPC_DAY on (src/game/road.ts forkPicks: the fork offers the three
 * warlords only, and the day's event comes after the fight) the section plays the day as a player does: a tap on the
 * fork's first card (the EASY warlord) picks it, the fight runs (SKIP, as a player may), and the result's ON TO THE ROAD
 * opens the road event. The fork's targets, the event's and the tap on its first choice are checked as before.
 */
async function roadForkSection(browsers, origin) {
  log("");
  log("## CUSTOM-2b (REQ-BFG-072): the road fork and the road event over the sea: their targets, and a tap through each");
  const dump = {};
  for (const vname of CUSTOM_VIEWS) {
    if (!browsers[ENGINE(vname)]) continue;
    const V = `roadfork ${vname}`;
    viewNow = V;
    loadLine(`${V}: start`);
    const touch = !!VIEW[vname].hasTouch;
    const { ctx, page, cdp, errors } = await openPage(browsers, origin, vname, { name: "TOUCH" });
    const press = async (p) => { if (touch) await tap(cdp, p, 3, 0); else { await page.mouse.click(p.x, p.y); await sleep(150); } };
    const regsNow = () => page.evaluate(() => window.bb.regions().map((q) => ({ id: q.id, x: +q.x.toFixed(2), y: +q.y.toFixed(2), w: +q.w.toFixed(2), h: +q.h.toFixed(2) })));
    try {
      await settle(page, "title");
      await page.evaluate(() => window.bb.openFork({ hero: "furnace", day: 3, seed: 12345 }));
      await settle(page, "fork");
      await regionDrawn(page, "fork0");
      await nextFrame(page);
      const fork = await regsNow();
      const portrait = await page.evaluate(() => window.bb.game.portrait);
      // TOUCH-099: the fork's first card is the ROAD EVENT, or with NPC_DAY on the EASY warlord (ForkScreen.picks)
      const pick0 = await page.evaluate(() => window.bb.game.screen.picks?.[0] ?? null);
      const npcDay = pick0 !== "event";
      await press(centre(await region(page, "fork0")));
      const sel = await page.evaluate(() => ({ screen: window.bb.screen(), sel: window.bb.game.screen.sel ?? null }));
      if (portrait && sel.screen === "fork") await press(centre(await region(page, "fork0")));
      let fought = "";
      if (npcDay) {
        // TOUCH-099 (NPC_DAY on): the day's fight first (SKIP to its result), then the result card's ON TO THE ROAD
        await settle(page, "warlord");
        await page.waitForFunction(() => window.bb.screen(true) === "fight" && window.bb.regions().some((q) => q.id === "skip"), null, { timeout: 20000 });
        await press(centre(await regionOf(page, "skip")));
        await page.waitForFunction(() => window.bb.screen(true) === "result" && !window.bb.game.transitioning && window.bb.regions().some((q) => q.id === "toroad"), null, { timeout: 30000 });
        await sleep(300);
        const w = await page.evaluate(() => { const f = window.bb.game.screen.warlord; return f ? `the ${f.tier} warlord, a ${f.result?.outcome}` : "no warlord"; });
        await press(centre(await regionOf(page, "toroad")));
        fought = `the day's fight (${w}, by SKIP), then its result's ON TO THE ROAD: `;
      }
      await settle(page, "event");
      check(!portrait || sel.sel === 0, `${V}: ${touch ? "a tap" : "a click"} on the fork's ${npcDay ? `${String(pick0).toUpperCase()} warlord` : "ROAD EVENT"} card ${portrait ? `inspects it first (sel ${sel.sel}), a second picks it` : "picks it"}: ${fought}the road event opens (${await page.evaluate(() => window.bb.screen())})`);
      await page.evaluate(() => { window.bb.game.run = null; window.bb.open("event"); }); // a new run's day-1 event
      await settle(page, "event");
      await regionDrawn(page, "choice0");
      await nextFrame(page);
      const event = await regsNow();
      await press(centre(await region(page, "choice0")));
      const phase = await page.evaluate(() => window.bb.game.screen.phase);
      check(phase === "result", `${V}: ${touch ? "a tap" : "a click"} on the day-1 event's first choice picks it (phase ${phase}); fork targets ${fork.length}, event targets ${event.length} (in ${NAME}-roadfork.json)`);
      dump[vname] = { fork, event };
      await shot(page, `${TAG}-roadfork-${vname}-event.png`);
    } catch (e) {
      check(false, `${V}: the section stopped: ${String(e instanceof Error ? e.message : e).split("\n")[0]}`);
    }
    check(errors.length === 0, `${V}: 0 console errors (${errors.length}${errors.length ? `: ${errors[0]}` : ""})`);
    await ctx.close();
    loadLine(`${V}: end`);
  }
  writeFileSync(join(OUT, `${NAME}-roadfork.json`), JSON.stringify(dump, null, 1) + "\n");
}

// ----------------------------------------------------------------------------------- SCOUT-1: VIEW BATTLEFIELD; SCOUT-1b
/** SCOUT-1 (REQ-BFG-076): the views the scout section runs on: the phones 390x844 and 430x932 and phone landscape 844x390
 *  at DPR 3 (touch, Chromium), the desk 1920x1080 and the laptops 1366x768 and 1280x720 (the mouse). SCOUT-1b
 *  (REQ-BFG-082, REQ-BFG-083): no scouting pause (the sail-in runs into the count at WIDE, no FIGHT step), VIEW
 *  BATTLEFIELD as SCOUT-1 left it (its faces now tapped in the view), the cards whole and the warlord's VIEW BATTLEFIELD
 *  above its PICK line; and the speed picked holding for the run (SPEED_VIEWS). */
const SCOUT_VIEWS = ["phone", "phone-430", "phone-land", "desk", "laptop", "laptop-720"];
const SPEED_VIEWS = ["phone", "desk"];
const SPEED_KEY = "beltbattles.speed.v1"; // src/game/runSpeed.ts
const overlaps = (a, b) => !!a && !!b && a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
const inViewport = (r, vp) => !!r && r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= vp.width + 0.5 && r.y + r.h <= vp.height + 0.5;
// (box and centre: the customize section's and the panel checks', above)
/** Both boards' deck tiles (120 x 120 deck px each) on screen now, CSS px. */
const decks = (page) => page.evaluate(() => {
  const g = window.bb.game, s = g.screen, m = s.motion, a = s.arena, k = g.view.scale / g.view.dpr, c = g.canvas.getBoundingClientRect();
  return [0, 1].map((side) => {
    const p = [[0, 0], [120, 0], [0, 120], [120, 120]].map(([x, y]) => m.localToScreen(a, side, x, y));
    const xs = p.map((q) => c.left + q[0] * k), ys = p.map((q) => c.top + q[1] * k);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  });
});
const scoutState = (page) => page.evaluate(() => window.bb.scout());
const regionOf = (page, id) => page.evaluate((i) => window.bb.regions().filter((q) => q.id === i).pop() ?? null, id);
/** Wait for the battle's phase (bb.screen(true)) with its camera at rest. */
const phaseAtRest = (page, ph, timeout = 20000) => page.waitForFunction((p) => { const s = window.bb.scout(); return !!s && s.phase === p && !!s.camera && !s.camera.moving; }, ph, { timeout });
const SPEED_LABEL = ["0.5X", "1X", "2X", "4X"];

/** A real press at client point p: a finger's tap on a touch view, a click on a mouse one. */
async function press(page, cdp, p) {
  if (cdp) await tap(cdp, p);
  else {
    await page.mouse.click(p.x, p.y);
    await sleep(120);
  }
}

/** SCOUT-1b (REQ-BFG-082): from a battle's first frame to GO, every animation frame: its phase, the camera, the sim's
 *  ticks and whether a FIGHT button is drawn (in the page, so no frame is missed). */
const sailIn = (page) => page.evaluate(() => new Promise((ok) => {
  const out = [], t0 = performance.now();
  const tick = () => {
    const s = window.bb.scout();
    if (s) out.push({ ph: s.phase, shot: s.camera ? s.camera.shot : null, moving: !!s.camera?.moving, ticks: s.ticks, fight: window.bb.regions().some((q) => q.id === "fight"), t: performance.now() - t0 });
    if ((s && s.phase === "fight") || performance.now() - t0 > 20000) ok(out);
    else requestAnimationFrame(tick);
  };
  tick();
}));

async function scoutView(browsers, origin, vname) {
  const { ctx, page, cdp, errors } = await openPage(browsers, origin, vname);
  const V = `scout ${vname}`, vp = VIEW[vname].viewport, touch = !!cdp;
  viewNow = V;
  const big = (r) => !touch || (!!r && r.w >= TAP_CSS - 0.01 && r.h >= TAP_CSS - 0.01);
  await page.evaluate(() => window.bb.openDusk({ hero: "furnace", day: 6, seed: 7 }, []));
  // SCOUT-1b (REQ-BFG-082): the fight starts at once: the sail-in runs into the 3-2-1 count by itself, at WIDE and at rest
  const fr = await sailIn(page);
  const before = fr.filter((f) => f.ph !== "fight"), phases = [...new Set(fr.map((f) => f.ph))];
  const go = fr.find((f) => f.ph === "fight");
  check(!!go && phases.join(",") === "intro,count,fight", `${V}: the sail-in runs into the 3-2-1 count and GO by itself, no scouting (${phases.join(" -> ")}; GO ${go ? (go.t / 1000).toFixed(2) : "never"} s after the first frame, ${fr.length} frames)`);
  check(before.length > 0 && before.every((f) => f.shot === "wide" && !f.moving), `${V}: the camera is WIDE and at rest through the sail-in and the count (${before.length} frames: ${[...new Set(before.map((f) => `${f.shot}${f.moving ? " moving" : ""}`))].join(", ")})`);
  check(before.every((f) => !f.fight && f.ticks === 0), `${V}: no FIGHT button and no sim step before GO (FIGHT drawn on ${before.filter((f) => f.fight).length} frames; ticks ${Math.max(0, ...before.map((f) => f.ticks))})`);
  await shot(page, `${TAG}-scout-${vname}-go.png`);
  const skip = await regionOf(page, "skip");
  await press(page, cdp, centre(skip));
  await page.waitForFunction(() => window.bb.screen(true) === "result" && window.bb.regions().some((q) => q.id === "viewfield"), null, { timeout: 30000 });
  await sleep(300); // the card at rest (its rise is 0.25 s)
  const vf = await regionOf(page, "viewfield"), nx = await regionOf(page, "next");
  let s = await scoutState(page);
  check(!!vf && big(vf) && inViewport(vf, vp) && !!nx && !overlaps(vf, nx), `${V}: the result card's VIEW BATTLEFIELD is ${box(vf)} CSS px${touch ? ", at least 44 tall" : ""}, beside ON TO DAWN (${box(nx)}), never over it`);
  check(!!s.card && inViewport(s.card, vp) && s.card.y >= 1.5 && s.card.y + s.card.h <= vp.height - 1.5, `${V}: the dusk card is whole on the screen (${box(s.card)} in ${vp.width}x${vp.height})`);
  await shot(page, `${TAG}-scout-${vname}-card.png`);
  await press(page, cdp, centre(vf));
  await phaseAtRest(page, "view");
  await page.waitForFunction(() => window.bb.scout().summaries.length === 2, null, { timeout: 5000 });
  s = await scoutState(page);
  let d = await decks(page);
  const sumsOk = s.summaries.length === 2 && s.summaries.every((r) => inViewport(r, vp) && !overlaps(r, d[0]) && !overlaps(r, d[1]));
  check(s.phase === "view" && s.camera.shot === "close" && sumsOk, `${V}: VIEW BATTLEFIELD at CLOSE with both summaries (${s.summaries.map(box).join("; ")}) on the screen, over no board's tile`);
  check(big(s.back) && big(s.primary) && inViewport(s.back, vp) && inViewport(s.primary, vp) && !overlaps(s.back, s.primary) && !overlaps(s.back, d[0]) && !overlaps(s.back, d[1]) && !overlaps(s.primary, d[0]) && !overlaps(s.primary, d[1]),
    `${V}: BACK (${box(s.back)}) and ${s.viewPrimary} (${box(s.primary)})${touch ? " at least 44 x 44" : ""}, apart, on the screen, over no board's tile`);
  // a face by a real tap on a part of each board (a turret's with this fight's line); CLOSE first where the last face lies
  // over the next part (the 1366x768 laptop: a face there opens over the other carrier)
  const parts = await page.evaluate(() => [window.bb.parts(0), window.bb.parts(1)]);
  for (const [side, kind] of [[1, "turret"], [0, "item"], [0, "turret"], [1, "item"]]) {
    const p = parts[side].find((q) => q.kind === kind) ?? parts[side][0];
    const under = !!s.face && p.x >= s.face.r.x && p.x < s.face.r.x + s.face.r.w && p.y >= s.face.r.y && p.y < s.face.r.y + s.face.r.h;
    if (under) await press(page, cdp, centre(s.face.close));
    await press(page, cdp, p);
    s = await scoutState(page);
    const ok = !!s.face && s.face.side === side && s.face.sel.kind === p.kind && s.face.title.startsWith(p.name) && s.face.lines.length > 0 && (p.kind !== "turret" || /^THIS FIGHT: /.test(s.face.line ?? ""));
    check(ok && inViewport(s.face.r, vp) && big(s.face.close) && !overlaps(s.face.r, { x: p.x - 1, y: p.y - 1, w: 2, h: 2 }),
      `${V}: in VIEW BATTLEFIELD a ${touch ? "tap" : "click"} on ${side === 0 ? "your" : "the enemy's"} ${p.name} (${p.kind}) opens its face (${s.face?.title ?? "none"}, side ${s.face?.side}, ${s.face?.lines.length ?? 0} lines${p.kind === "turret" ? `, "${s.face?.line ?? "no fight line"}"` : ""})${under ? " (after CLOSE: the last face lay over it)" : ""}, on the screen, the part in sight; its CLOSE ${box(s.face?.close)}`);
  }
  await shot(page, `${TAG}-scout-${vname}-view.png`);
  await press(page, cdp, centre(s.face.close));
  s = await scoutState(page);
  check(!s.face && s.phase === "view", `${V}: the face's CLOSE closes it; still in the view (${s.phase})`);
  await press(page, cdp, parts[0][0]);
  d = await decks(page);
  const water = { x: 4, y: d[0].y + d[0].h / 2 }; // beside your board, no part there
  await press(page, cdp, water);
  s = await scoutState(page);
  check(!s.face && s.phase === "view", `${V}: a ${touch ? "tap" : "click"} on empty space closes a face; still in the view (${s.phase})`);
  await press(page, cdp, centre(s.back));
  s = await scoutState(page);
  check(s.phase === "result" && !!(await regionOf(page, "next")), `${V}: BACK returns to the result card (${s.phase})`);
  await sleep(150);
  await press(page, cdp, centre(await regionOf(page, "viewfield")));
  await phaseAtRest(page, "view");
  s = await scoutState(page);
  await press(page, cdp, centre(s.primary));
  await settle(page, "build", 15000);
  check(await page.evaluate(() => window.bb.screen() === "build"), `${V}: ${s.viewPrimary} from VIEW BATTLEFIELD goes on to the dawn's build screen`);
  check(errors.length === 0, `${V}: 0 console errors (${errors.length}${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""})`);
  await ctx.close();
}

/** SCOUT-1: a Hard warlord won on the phone: the card's VIEW BATTLEFIELD, the pick unchanged. SCOUT-1b (REQ-BFG-082):
 *  VIEW BATTLEFIELD above the line PICK 1 PART FROM THEIR DECK:, which sits right over the picks; the card whole.
 *  TOUCH-099 (MERGE-099D; REVIEW-MERGE099C ruling 1): with NPC_DAY on a Hard win gives no pick: it rolls a drop (road.ts
 *  warlordReward and finishWarlord: npcDay.ts DROP_CHANCE.hard, to cargo at DROP_STARS.hard, ★2) shown as the drop card
 *  (or NO DROP), and the card's one way on is ON TO THE ROAD (the day's event, then REFIT): scoutWarlordNpcDay checks that
 *  card the same way (VIEW BATTLEFIELD's place, the card whole, the view's BACK and way on, the drop, the way on). */
async function scoutWarlord(browsers, origin, vname) {
  const { ctx, page, cdp, errors } = await openPage(browsers, origin, vname);
  const V = `scout ${vname} warlord`, touch = !!cdp, vp = VIEW[vname].viewport;
  viewNow = V;
  await page.evaluate(() => window.bb.openWarlord("hard", { hero: "furnace", day: 4, seed: 9, outcome: 0 }));
  // the card is up at once (reloaded on its result), under the screen's wipe, which takes no tap: wait for the wipe too
  await page.waitForFunction(() => window.bb.screen(true) === "result" && !window.bb.game.transitioning && window.bb.regions().some((q) => q.id === "viewfield"), null, { timeout: 20000 });
  await sleep(300);
  // TOUCH-099: NPC_DAY's reward carries its drop chance (road.ts warlordReward); 0.9.7's has none
  if (await page.evaluate(() => window.bb.game.screen.warlord?.reward?.chance !== undefined)) {
    await scoutWarlordNpcDay(page, cdp, V, touch, vp);
    check(errors.length === 0, `${V}: 0 console errors (${errors.length})`);
    await ctx.close();
    return;
  }
  const vf = await regionOf(page, "viewfield"), t0 = await regionOf(page, "take0"), t1 = await regionOf(page, "take1");
  const k = await page.evaluate(() => window.bb.game.view.scale / window.bb.game.view.dpr); // CSS px a logical px
  // the PICK line (3x5, 9 logical px with its gap) lies between them: the view's target ends 10 px or more above the picks
  const gap = vf && t0 ? t0.y - (vf.y + vf.h) : -1;
  check(!!vf && (!touch || vf.h >= TAP_CSS - 0.01) && inViewport(vf, vp) && !!t0 && !!t1 && !overlaps(vf, t0) && !overlaps(vf, t1) && gap >= 10 * k - 0.5,
    `${V}: the card's VIEW BATTLEFIELD (${box(vf)}) sits above the PICK line, which sits right over its part pick (${box(t0)}, ${box(t1)}): ${(gap / k).toFixed(1)} logical px between them`);
  let s = await scoutState(page);
  check(!!s.card && inViewport(s.card, vp), `${V}: the warlord's card is whole on the screen (${box(s.card)})`);
  await shot(page, `${TAG}-scout-${vname}-warlord.png`);
  await press(page, cdp, centre(vf));
  await phaseAtRest(page, "view");
  s = await scoutState(page);
  check(s.phase === "view" && !!s.back && !s.primary, `${V}: a ${touch ? "tap" : "click"} on VIEW BATTLEFIELD at its new place opens the view; it offers BACK and no way on while the pick waits (${s.viewPrimary ?? "none"})`);
  await press(page, cdp, centre(s.back));
  await sleep(150);
  await press(page, cdp, centre(await regionOf(page, "take0")));
  const took = await page.evaluate(() => !!window.bb.game.screen.warlord.result.took);
  s = await scoutState(page);
  check(took && s.phase === "result", `${V}: BACK, then the pick takes its part as before (took: ${took})`);
  await press(page, cdp, centre(await regionOf(page, "viewfield")));
  await phaseAtRest(page, "view");
  s = await scoutState(page);
  check(s.viewPrimary === "REFIT" && !!s.primary, `${V}: with the part in cargo the view's bar offers REFIT (${s.viewPrimary})`);
  check(errors.length === 0, `${V}: 0 console errors (${errors.length})`);
  await ctx.close();
}

/** TOUCH-099 (MERGE-099D): SCOUT-1b's warlord card with NPC_DAY on, a Hard win on the phone: five checks, as the pick's five.
 *  The card (warlordHud.ts drawWarlordResult): the gold line at its y + 62 logical px (12 tall), the drop card under it
 *  (22 tall: its foot at y + 96), VIEW BATTLEFIELD's row (warlordRows, no pick) and ON TO THE ROAD at the foot; MERGE-099C's
 *  9079f79 makes the view's bar offer ON TO THE ROAD too. */
async function scoutWarlordNpcDay(page, cdp, V, touch, vp) {
  const vf = await regionOf(page, "viewfield"), road = await regionOf(page, "toroad");
  const k = await page.evaluate(() => window.bb.game.view.scale / window.bb.game.view.dpr); // CSS px a logical px
  let s = await scoutState(page);
  const gap = vf && s.card ? vf.y - (s.card.y + 96 * k) : -1;
  check(!!vf && (!touch || vf.h >= TAP_CSS - 0.01) && inViewport(vf, vp) && !!road && inViewport(road, vp) && !overlaps(vf, road) && vf.y + vf.h <= road.y + 0.5 && gap >= 10 * k - 0.5,
    `${V}: (NPC_DAY: a drop, no pick) the card's VIEW BATTLEFIELD (${box(vf)}) sits between the drop card and ON TO THE ROAD (${box(road)}): ${(gap / k).toFixed(1)} logical px under the drop card`);
  check(!!s.card && inViewport(s.card, vp), `${V}: the warlord's card is whole on the screen (${box(s.card)})`);
  await shot(page, `${TAG}-${V.replace(/ /g, "-")}.png`);
  await press(page, cdp, centre(vf));
  await phaseAtRest(page, "view");
  s = await scoutState(page);
  check(s.phase === "view" && !!s.back && !!s.primary && s.viewPrimary === "ON TO THE ROAD",
    `${V}: a ${touch ? "tap" : "click"} on VIEW BATTLEFIELD at its place opens the view; it offers BACK and the card's one way on, ON TO THE ROAD (${s.viewPrimary ?? "none"})`);
  await press(page, cdp, centre(s.back));
  await sleep(150);
  const d = await page.evaluate(() => {
    const g = window.bb.game, f = g.screen.warlord, run = g.run, took = f?.result?.took ?? null;
    const inv = took ? run.inventory.find((i) => i.def === took) : undefined;
    return {
      took, outcome: f?.result?.outcome ?? null, parts: f?.result?.parts?.length ?? -1, logged: run.warlords[run.warlords.length - 1]?.part ?? null,
      held: !!took && (!!inv || JSON.stringify(run.build).includes(`"${took}"`)), stars: inv ? (inv.stars ?? 1) : null,
    };
  });
  s = await scoutState(page);
  check(s.phase === "result" && d.outcome === "win" && d.parts === 0 && d.took === d.logged && (d.took === null || (d.held && (d.stars === null || d.stars >= 2))),
    `${V}: BACK, then the card: the Hard win's drop ${d.took ? `${d.took} is in the run (cargo ★${d.stars ?? "?"}; Hard drops at ★2)` : "is NO DROP"} and nothing to pick (parts ${d.parts})`);
  await press(page, cdp, centre(await regionOf(page, "viewfield")));
  await phaseAtRest(page, "view");
  s = await scoutState(page);
  await press(page, cdp, centre(s.primary));
  await settle(page, "event", 15000);
  check(await page.evaluate(() => window.bb.screen() === "event"), `${V}: ${s.viewPrimary} from VIEW BATTLEFIELD opens the day's road event`);
}

/** SCOUT-1b (REQ-BFG-083): the speed picked holds for the run. A dusk on a new run starts at 1X; 2X picked by a real tap
 *  mid-fight; SKIP, ON TO DAWN, the build screen's FIGHT!, the road fork's EASY warlord: the next battle's bar is on 2X
 *  before its first step and it runs at 2X; a reload and CONTINUE: the same fight at 2X; a new run at 1X. */
async function speedView(browsers, origin, vname) {
  const { ctx, page, cdp, errors } = await openPage(browsers, origin, vname, { name: "SPEED" }); // a name: CONTINUE opens no name screen
  const V = `speed ${vname}`, touch = !!cdp;
  viewNow = V;
  const sp = (s) => (s ? `bar ${SPEED_LABEL[s.speed]}, arena ${s.arenaSpeed}X, ${s.ticks} ticks, ${s.phase}` : "no battle");
  const kept = () => page.evaluate((key) => localStorage.getItem(key), SPEED_KEY);
  await page.evaluate(() => window.bb.openDusk({ hero: "furnace", day: 6, seed: 7 }, []));
  await page.waitForFunction(() => window.bb.screen(true) === "intro", null, { timeout: 15000 });
  let s = await scoutState(page);
  check(s.speed === 1 && s.arenaSpeed === 1, `${V}: a new run's dusk starts at 1X (${sp(s)})`);
  await page.waitForFunction(() => window.bb.screen(true) === "fight", null, { timeout: 15000 });
  await press(page, cdp, centre(await regionOf(page, "sp2")));
  s = await scoutState(page);
  const runId = await page.evaluate(() => window.bb.game.run.runId);
  let key = await kept();
  check(s.speed === 2 && s.arenaSpeed === 2 && key === JSON.stringify({ runId, speed: 2 }), `${V}: a ${touch ? "tap" : "click"} on 2X mid-fight plays at 2X and keeps it with the run (${sp(s)}; ${key})`);
  await press(page, cdp, centre(await regionOf(page, "skip")));
  await page.waitForFunction(() => window.bb.screen(true) === "result" && window.bb.regions().some((q) => q.id === "next"), null, { timeout: 30000 });
  await sleep(300);
  await press(page, cdp, centre(await regionOf(page, "next")));
  await settle(page, "build", 15000);
  // the dawn's rune pick (and LAST CHANCE) take every tap first: take the first card, as playthrough's takeDawnRune does
  for (let i = 0; i < 2 && (await regionOf(page, "runepick-0")); i++) await press(page, cdp, centre(await regionOf(page, "runepick-0")));
  await sleep(200);
  await press(page, cdp, centre(await regionOf(page, "fight")));
  await settle(page, "fork", 15000);
  await sleep(300);
  for (let i = 0; i < (touch ? 2 : 1); i++) {
    await press(page, cdp, centre(await regionOf(page, "fork1"))); // EASY: on touch a first tap inspects, a second picks
    await sleep(200);
  }
  await page.waitForFunction(() => window.bb.screen() === "warlord", null, { timeout: 15000 });
  s = await scoutState(page);
  check(s.phase === "intro" && s.ticks === 0 && s.speed === 2 && s.arenaSpeed === 2, `${V}: the next battle (the road's EASY warlord, by FIGHT! and the fork) shows 2X before its first step (${sp(s)})`);
  await page.waitForFunction(() => { const q = window.bb.scout(); return !!q && q.phase === "fight" && q.ticks > 0; }, null, { timeout: 15000 });
  s = await scoutState(page);
  check(s.speed === 2 && s.arenaSpeed === 2 && s.ticks > 0, `${V}: and it runs at 2X (${sp(s)})`);
  await shot(page, `${TAG}-speed-${vname}-next.png`);
  // a reload: the title's CONTINUE resumes the warlord fight (saved before it began), still at 2X
  await page.reload();
  await page.waitForFunction(() => !!window.bb, null, { timeout: 15000 });
  await settle(page, "title");
  await press(page, cdp, centre(await page.waitForFunction(() => window.bb.regions().find((q) => q.id === "cont") ?? null, null, { timeout: 15000 }).then((h) => h.jsonValue())));
  await page.waitForFunction(() => window.bb.screen() === "warlord", null, { timeout: 15000 });
  s = await scoutState(page);
  key = await kept();
  check(s.speed === 2 && s.arenaSpeed === 2 && s.ticks === 0 && key === JSON.stringify({ runId, speed: 2 }), `${V}: after a reload, CONTINUE opens the same fight at 2X (${sp(s)}; ${key})`);
  // a new run (a new runId): wait for its own battle (the old screen stays current through the screen's wipe, so a wait
  // on the phase alone can read the old fight, also in its sail-in)
  await page.evaluate(() => { window.bb.game.screen.oldScreen = true; window.bb.openDusk({ hero: "weaver", day: 2, seed: 11 }, []); });
  await page.waitForFunction(() => !window.bb.game.screen.oldScreen && window.bb.screen(true) === "intro", null, { timeout: 15000 });
  s = await scoutState(page);
  const fresh = await page.evaluate(() => window.bb.game.run.runId);
  check(fresh !== runId && s.speed === 1 && s.arenaSpeed === 1, `${V}: a new run starts at 1X (${sp(s)}; run ${fresh}; the key still holds the old run's: ${await kept()})`);
  check(errors.length === 0, `${V}: 0 console errors (${errors.length}${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""})`);
  await ctx.close();
}

async function scoutSection(browsers, origin) {
  log("");
  log("## SCOUT-1b (REQ-BFG-082, REQ-BFG-083): the fight starts at once and VIEW BATTLEFIELD after it, by real input on every view (the sail-in into the count at WIDE, the card whole, a face on each board, BACK, the primary action; the warlord's VIEW BATTLEFIELD above its PICK line); the speed picked holding for the run");
  for (const v of SCOUT_VIEWS) {
    loadLine(`scout ${v}: start`);
    try {
      await scoutView(browsers, origin, v);
    } catch (e) {
      check(false, `scout ${v}: the section stopped: ${String(e instanceof Error ? e.message : e).split("\n")[0]}`);
    }
    loadLine(`scout ${v}: end`);
  }
  try {
    await scoutWarlord(browsers, origin, "phone");
  } catch (e) {
    check(false, `scout phone warlord: the section stopped: ${String(e instanceof Error ? e.message : e).split("\n")[0]}`);
  }
  for (const v of SPEED_VIEWS) {
    loadLine(`speed ${v}: start`);
    try {
      await speedView(browsers, origin, v);
    } catch (e) {
      check(false, `speed ${v}: the section stopped: ${String(e instanceof Error ? e.message : e).split("\n")[0]}`);
    }
    loadLine(`speed ${v}: end`);
  }
}

// ------------------------------------------------------------- SCOUT-1c: a scouted foe from the NEXT BATTLE card
/** SCOUT-1c (REQ-BFG-082): after a SCOUT road stop's SPY and REFIT, the build screen's NEXT BATTLE card opens tonight's
 *  foe's carrier by a real tap: the card's target (44 CSS px on touch), a face on a turret and an item of the foe's
 *  carrier (read only: CLOSE, no hint), CLOSE, a tap off the carrier closing a face, BACK; the saved run's bytes the same
 *  before and after; 0 console errors. Without a reveal (a dawn's build screen) the card has no target and a tap on it
 *  changes nothing. On SCOUT_VIEWS, and the operator's 402x690 in WebKit where the run has WebKit. */
const RUN_KEY = "beltbattles.run.v7"; // src/game/save.ts SAVE_KEY
async function foeCardView(browsers, origin, vname) {
  const { ctx, page, cdp, errors } = await openPage(browsers, origin, vname);
  try {
    await foeCardSteps(page, cdp, errors, vname);
  } catch (e) {
    await shot(page, `${TAG}-foecard-${vname}-stopped.png`).catch(() => {});
    throw new Error(`at "${foeStep}": ${String(e instanceof Error ? e.message : e).split("\n")[0]} (screen ${await page.evaluate(() => window.bb.screen(true)).catch(() => "?")}; regions ${await page.evaluate(() => window.bb.regions().map((q) => q.id).join(" ")).catch(() => "?")})`);
  } finally {
    await ctx.close();
  }
}
let foeStep = "";
const regionWait = (page, id, timeout = 15000) => page.waitForFunction((i) => window.bb.regions().find((q) => q.id === i) ?? null, id, { timeout }).then((h) => h.jsonValue());
async function foeCardSteps(page, cdp, errors, vname) {
  const V = `foecard ${vname}`, vp = VIEW[vname].viewport, touch = !!cdp;
  viewNow = V;
  const big = (r) => !touch || (!!r && r.w >= TAP_CSS - 0.01 && r.h >= TAP_CSS - 0.01);
  const fv = () => page.evaluate(() => window.bb.foeView());
  const saved = () => page.evaluate((k) => localStorage.getItem(k), RUN_KEY);
  foeStep = "the SCOUT stop";
  await page.evaluate(() => window.bb.openEvent("scout", { hero: "furnace", day: 5, gold: 9, seed: 31 }));
  await settle(page, "event", 15000);
  await sleep(400);
  foeStep = "SPY";
  await press(page, cdp, centre(await regionWait(page, "choice2"))); // SPY
  foeStep = "REFIT";
  await regionWait(page, "refit");
  // the SPY result's beat first: under load a REFIT tap sent the moment its target appears can be lost (14b22b9's
  // gaming-mode run, phone-430 and phone-land: still on the event with REFIT up 15 s later); a lost tap is re-sent, logged
  await sleep(800);
  for (let i = 0; i < 3 && (await page.evaluate(() => window.bb.screen())) !== "build"; i++) {
    const r = await regionOf(page, "refit");
    if (!r) break;
    if (i > 0) log(`RETRY [${V}] REFIT tapped again: the screen was still the event's (${await page.evaluate(() => window.bb.screen())})`);
    await press(page, cdp, centre(r));
    await page.waitForFunction(() => window.bb.screen() === "build", null, { timeout: 8000 }).catch(() => {});
  }
  foeStep = "the build screen";
  await settle(page, "build", 15000);
  foeStep = "the card's target";
  await page.waitForFunction(() => { const f = window.bb.foeView(); return !!f && f.scouted && !!window.bb.regions().find((q) => q.id === "foecard"); }, null, { timeout: 10000 });
  foeStep = "the view";
  let f = await fv();
  const card = await regionOf(page, "foecard");
  check(f.scouted && !!card && big(card) && inViewport(card, vp), `${V}: after SCOUT's SPY and REFIT the NEXT BATTLE card is a target (${box(card)} CSS px${touch ? ", at least 44 x 44" : ""}) on the screen`);
  await shot(page, `${TAG}-foecard-${vname}-card.png`);
  const bytes0 = await saved();
  await press(page, cdp, centre(card));
  f = await fv();
  check(f.open && big(f.back) && inViewport(f.back, vp) && f.parts.length > 0, `${V}: a ${touch ? "tap" : "click"} on the card opens the foe's carrier (${f.parts.length} parts), BACK ${box(f.back)}`);
  for (const kind of ["turret", "item"]) {
    const p = f.parts.find((q) => q.kind === kind) ?? f.parts[0];
    const under = !!f.face && p.x >= f.face.r.x && p.x < f.face.r.x + f.face.r.w && p.y >= f.face.r.y && p.y < f.face.r.y + f.face.r.h;
    if (under) await press(page, cdp, centre(f.face.close));
    await press(page, cdp, p);
    f = await fv();
    const ok = !!f.face && f.face.sel.kind === p.kind && f.face.lines.length > 0 && !f.face.lines.some((l) => /^(DRAG|TAP|PRESS) /.test(l));
    check(ok && inViewport(f.face.r, vp) && big(f.face.close) && !overlaps(f.face.r, { x: p.x - 1, y: p.y - 1, w: 2, h: 2 }) && !overlaps(f.face.r, f.back),
      `${V}: a ${touch ? "tap" : "click"} on the foe's ${p.name} (${p.kind}) opens its face (${f.face?.title ?? "none"}, ${f.face?.lines.length ?? 0} lines), read only, on the screen, the part in sight; its CLOSE ${box(f.face?.close)}`);
  }
  await shot(page, `${TAG}-foecard-${vname}-face.png`);
  await press(page, cdp, centre(f.face.close));
  f = await fv();
  check(f.open && !f.face, `${V}: CLOSE closes the face; the view stays open`);
  await press(page, cdp, f.parts[0]);
  await press(page, cdp, centre(card)); // the card's place: off the foe's carrier
  f = await fv();
  check(f.open && !f.face, `${V}: a ${touch ? "tap" : "click"} off the carrier closes a face; the view stays open`);
  await press(page, cdp, centre(f.back));
  f = await fv();
  const bytes1 = await saved();
  check(!f.open && (await page.evaluate(() => window.bb.screen())) === "build" && !!(await regionOf(page, "fight")), `${V}: BACK returns to the build screen (FIGHT! back)`);
  check(!!bytes0 && bytes0 === bytes1, `${V}: the saved run's bytes are the same before the card and after BACK (${bytes0 ? bytes0.length : 0} B)`);
  check(errors.length === 0, `${V}: 0 console errors (${errors.length}${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""})`);
}

/** SCOUT-1c: without a reveal (a dawn's build screen) the card is as before: no target, and a tap on it changes nothing. */
async function foeCardPlain(browsers, origin, vname) {
  const { ctx, page, cdp, errors } = await openPage(browsers, origin, vname);
  const V = `foecard ${vname} unscouted`;
  viewNow = V;
  await page.evaluate(() => window.bb.openDawn({ hero: "furnace", day: 3, gold: 9, seed: 31 }));
  await settle(page, "build", 15000);
  for (let i = 0; i < 2 && (await regionOf(page, "runepick-0")); i++) await press(page, cdp, centre(await regionOf(page, "runepick-0")));
  await page.waitForFunction(() => window.bb.game.screen.caravan.ready, null, { timeout: 10000 });
  await sleep(300);
  let f = await page.evaluate(() => window.bb.foeView());
  const before = await page.evaluate((k) => localStorage.getItem(k), RUN_KEY);
  const run0 = await page.evaluate(() => JSON.stringify(window.bb.game.run));
  check(!f.scouted && !!f.card && !(await regionOf(page, "foecard")), `${V}: no reveal today: the NEXT BATTLE card (${box(f.card)}) has no target`);
  await press(page, cdp, centre(f.card));
  await sleep(200);
  f = await page.evaluate(() => window.bb.foeView());
  const after = await page.evaluate((k) => localStorage.getItem(k), RUN_KEY);
  const run1 = await page.evaluate(() => JSON.stringify(window.bb.game.run));
  check(!f.open && (await page.evaluate(() => window.bb.screen())) === "build" && before === after && run0 === run1, `${V}: a ${cdp ? "tap" : "click"} on the card changes nothing (no view; the run and its save the same)`);
  check(errors.length === 0, `${V}: 0 console errors (${errors.length})`);
  await ctx.close();
}

async function foeCardSection(browsers, origin) {
  log("");
  log("## SCOUT-1c (REQ-BFG-082): a SCOUT-revealed foe from the NEXT BATTLE card, by real input (the card's target, a face on the foe's carrier, CLOSE, BACK, the save unchanged); without a reveal the card is as before");
  const pick = opt("fviews", "");
  const views = pick ? pick.split(",").map((s) => s.trim()) : [...SCOUT_VIEWS, ...(browsers.webkit ? ["wk-op-690"] : [])];
  for (const v of views) {
    loadLine(`foecard ${v}: start`);
    try {
      await foeCardView(browsers, origin, v);
    } catch (e) {
      check(false, `foecard ${v}: the section stopped: ${String(e instanceof Error ? e.message : e).split("\n")[0]}`);
    }
    loadLine(`foecard ${v}: end`);
  }
  for (const v of ["phone", "desk"]) {
    try {
      await foeCardPlain(browsers, origin, v);
    } catch (e) {
      check(false, `foecard ${v} unscouted: the section stopped: ${String(e instanceof Error ? e.message : e).split("\n")[0]}`);
    }
  }
}

// ---------------------------------------------------------------------------------- SHAPES-1: the floating ROTATE button
/** SHAPES-1 (REQ-BFG-086 S3; RUN3-SHAPES1 5): FURNACE's day-3 deck (FURNACE above) with a NAIL STRIP (a 2-cell rig) in
 *  cargo in the GALVANIC COIL's place. */
const SHAPE_DECK = { ...FURNACE, inventory: [{ uid: 60, def: "nailstrip" }] };

/**
 * SHAPES-1 (REQ-BFG-086 S3, acceptance 4; RUN3-SHAPES1 5): a finger's carry of a shaped piece on a phone, by real touch
 * input. A drag from cargo lifts the NAIL STRIP; while that finger stays down the floating ROTATE button (chrome.ts
 * `carryrotate`) shows beside its ghost as a target at least 44 x 44 CSS px; a second finger's tap on it turns the carried
 * piece (edit.ts rotateCarry: a quarter turn, or the next turn that fits) while the first finger still holds it; the first
 * finger's lift drops it at the turned rot. Chromium's phone view only (its CDP session holds two touch points; the WebKit
 * session here holds one). A build without shaped pieces (before SHAPES-1, or SHAPES off) logs one line and checks nothing.
 */
async function shapeRotateView(browsers, origin, vname) {
  const { ctx, page, cdp, errors } = await openPage(browsers, origin, vname);
  const V = `shaperotate ${vname}`;
  viewNow = V;
  // bb.shapes() only reports the switch on a production page (its setter is dev-only since SHAPES-1's flip)
  const has = await page.evaluate(() => typeof window.bb.shapes === "function" && window.bb.shapes() === true);
  if (!has) {
    log(`${V}: this build has no shaped pieces (SHAPES off): nothing to check`);
    await ctx.close();
    return;
  }
  await openDeck(page, SHAPE_DECK);
  const from = await slot(page, 0), to = await cell(page, 1, 4);
  await drag(cdp, [from, to], false); // the finger stays down: the carry
  await page.waitForFunction(() => window.bb.game.screen.ed.carry?.def === "nailstrip", null, { timeout: 5000 }).catch(() => {});
  await nextFrame(page);
  const carried = () => page.evaluate(() => { const c = window.bb.game.screen.ed.carry; return c ? { def: c.def, rot: c.rot ?? 0, touch: !!c.touch } : null; });
  const c0 = await carried();
  check(!!c0 && c0.def === "nailstrip" && c0.touch, `${V}: a finger's drag from cargo carries the NAIL STRIP (${c0 ? `a ${c0.touch ? "finger's" : "mouse's"} carry at rot ${c0.rot}` : "no carry"})`);
  const rb = await region(page, "carryrotate");
  check(!!rb && rb.w >= TAP_CSS && rb.h >= TAP_CSS, `${V}: while the finger holds it, the floating ROTATE button shows: a ${rb ? `${rb.w.toFixed(1)}x${rb.h.toFixed(1)}` : "missing"} CSS px target (at least 44 x 44)`);
  if (rb) {
    // the second finger: down on ROTATE while the first stays down where the drag left it, about 40 ms, then up alone. CDP
    // takes the active points each time (a touchEnd may name none): a touchStart naming both presses the new one, and a
    // touchMove naming the first alone lifts the second (each changed point is one pointer event, in the page's order)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [tp(to), { ...tp(centre(rb)), id: 2 }] });
    await sleep(40);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [tp(to)] });
    await sleep(150);
    await nextFrame(page);
  }
  const c1 = await carried();
  check(!!c0 && !!c1 && c1.def === "nailstrip" && c1.rot !== c0.rot, `${V}: a second finger's tap on ROTATE turns the carried NAIL STRIP while the first finger holds it (rot ${c0 ? c0.rot : "?"} -> ${c1 ? c1.rot : "no carry"})`);
  await shot(page, `${vname}-shaperotate.png`);
  await up(cdp); // the first finger lifts: the drop
  await nextFrame(page);
  const placed = await page.evaluate(() => window.bb.game.run.build.items.find((p) => p.def === "nailstrip") ?? null);
  check(!!placed && !!c1 && (placed.rot ?? 0) === c1.rot, `${V}: the first finger's lift drops the NAIL STRIP at the turned rot (${placed ? `at (${placed.x},${placed.y}) rot ${placed.rot ?? 0}` : "not on the deck"})`);
  check(errors.length === 0, `${V}: 0 console errors (${errors.length}${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""})`);
  await ctx.close();
}

async function shapeRotateSection(browsers, origin) {
  log("");
  log("## SHAPES-1 (REQ-BFG-086 S3): a finger's carry of a shaped piece: the floating ROTATE button (at least 44 CSS px), a second finger's tap that turns the piece, the drop at the turned rot");
  for (const v of ["phone"]) {
    loadLine(`shaperotate ${v}: start`);
    try {
      await shapeRotateView(browsers, origin, v);
    } catch (e) {
      check(false, `shaperotate ${v}: the section stopped: ${String(e instanceof Error ? e.message : e).split("\n")[0]}`);
    }
    loadLine(`shaperotate ${v}: end`);
  }
}

async function main() {
  const browsers = { chromium: await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"] }) };
  const views = ONLY.includes("touch") ? TOUCH_VIEWS : [];
  for (const v of views) if (!VIEW[v]?.hasTouch) throw new Error(`--views: ${v} is not a touch view (${Object.keys(VIEW).join(", ")})`);
  for (const v of CUSTOM_VIEWS) if (!VIEW[v]) throw new Error(`--cviews: no view ${v} (${Object.keys(VIEW).join(", ")})`);
  const custom = ["customize", "newstyle", "roadfork"].some((s) => ONLY.includes(s)); // CUSTOM-2b (REQ-BFG-072)
  // shoptap2: WebKit (Playwright's build of it, with the iPhone descriptors) for the wk- views (PACKS M2: and the names
  // section's; CUSTOM-2b: and the CUSTOMIZE sections' wk- views)
  if (views.some((v) => ENGINE(v) === "webkit") || ONLY.includes("names") || (custom && CUSTOM_VIEWS.some((v) => ENGINE(v) === "webkit"))) {
    try {
      browsers.webkit = await webkit.launch();
    } catch (e) {
      check(false, `WebKit launches for the iPhone views: ${String(e instanceof Error ? e.message : e).split("\n")[0]}`);
    }
  }
  const site = await pageServer();
  log(`# touchcheck ${ONLY.join(", ")}: ${DIST} served at ${site.origin}; Chromium ${browsers.chromium.version()}${browsers.webkit ? `, WebKit ${browsers.webkit.version()}` : ""}; touch views ${views.join(", ") || "none"}; profile ${PROFILE}${custom ? `; CUSTOMIZE views ${CUSTOM_VIEWS.join(", ")}` : ""}; ${new Date().toISOString()}`);
  loadLine("the run: start");
  try {
    for (const v of views) {
      if (!browsers[ENGINE(v)]) continue; // its browser didn't launch (a FAIL above)
      try {
        await touchSection(browsers, site.origin, v);
      } catch (e) {
        check(false, `touch ${v}: the section stopped: ${String(e instanceof Error ? e.message : e).split("\n")[0]}`);
      }
    }
    if (ONLY.includes("mouse")) await mouseSection(browsers, site.origin);
    if (ONLY.includes("319")) await summarySection(browsers, site.origin);
    if (ONLY.includes("names")) await namesSection(browsers, site.origin); // PACKS M2 (REQ-BFG-063)
    if (ONLY.includes("bar")) await barSection(browsers, site.origin); // TAP-093b (backlog #340): the bar on a DPR 2 phone
    if (ONLY.includes("customize")) await customizeSection(browsers, site.origin); // CUSTOM-2b (REQ-BFG-072)
    if (ONLY.includes("newstyle")) await newStyleSection(browsers, site.origin);
    if (ONLY.includes("roadfork")) await roadForkSection(browsers, site.origin);
    if (ONLY.includes("scout")) await scoutSection(browsers, site.origin); // SCOUT-1 (REQ-BFG-076)
    if (ONLY.includes("foecard")) await foeCardSection(browsers, site.origin); // SCOUT-1c (REQ-BFG-082)
    if (ONLY.includes("shaperotate")) await shapeRotateSection(browsers, site.origin); // SHAPES-1 (REQ-BFG-086 S3)
  } finally {
    for (const b of Object.values(browsers)) await b.close();
    site.srv.close();
  }
  if (tapMs.length) {
    // TCH-360 (2d): the 200 ms rule on p95 (nearest rank), not the longest: a busy host stretches a few taps (TAP-093b
    // runs 1 and 2: 390.3 and 266.2 ms, each one tap); each tap over 200 ms is a WARN line above. Every tap must still be
    // one touch press
    const v = [...tapMs].sort((a, b) => a - b), q = (f) => v[Math.min(v.length - 1, Math.max(0, Math.ceil(f * v.length) - 1))];
    const one = tapMs.filter((t) => Number.isFinite(t)).length, over = tapMs.filter((t) => t > 200).length;
    const fin = v.filter((t) => Number.isFinite(t)), mean = fin.reduce((s, t) => s + t, 0) / Math.max(1, fin.length);
    check(one === tapMs.length && q(0.95) <= 200,
      `every touch tap was one touch press${one === tapMs.length ? "" : ` (NOT ${tapMs.length - one} of them)`}, their p95 at most 200 ms, pointerdown to pointerup as the page timed it (${tapMs.length} taps: median ${q(0.5).toFixed(1)} ms, p95 ${q(0.95).toFixed(1)} ms, the longest ${v[v.length - 1].toFixed(1)} ms, mean ${mean.toFixed(1)} ms; ${over} over 200 ms, each a WARN line; 1-min load now ${load1()})`);
  }
  loadLine("the run: end");
  const failed = checks.filter((c) => !c.ok);
  log("");
  // TCH-360 (2b, 2c): the retries and the skipped checks, counted apart (a SKIP line is no check)
  log(`drags made twice (RETRY lines): ${retries.length}${retries.length ? ` (${retries.map((r) => `${r.view}: ${r.step}`).join("; ")})` : ""}; checks skipped after a failed drag (SKIP lines): ${skips.length}`);
  log(failed.length ? `TOUCH CHECKS FAILED: ${failed.length} of ${checks.length}${skips.length ? `; ${skips.length} skipped after a failed drag` : ""}` : `TOUCH CHECKS PASSED: ${checks.length} of ${checks.length}`);
  log(`screenshots: ${shots.join(", ")}`);
  writeFileSync(join(OUT, `${NAME}.log`), lines.join("\n") + "\n");
  writeFileSync(join(OUT, `${NAME}.json`), JSON.stringify({ checks, skips, retries, tapMs }, null, 1) + "\n");
  if (mouseSeen.length) writeFileSync(join(OUT, `${NAME}-mouse.json`), JSON.stringify(mouseSeen, null, 1) + "\n");
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : String(e));
  writeFileSync(join(OUT, `${NAME}.log`), lines.join("\n") + `\nERROR ${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
