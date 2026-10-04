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
// Usage: npm run build && node scripts/touchcheck.mjs <outDir> [--dist <dir>] [--only touch,mouse,319] [--tag after]
//        [--name touchcheck] [--views phone,phone-660,phone-land,wk-phone,wk-phone-660,wk-phone-land,wk-iphone13,wk-iphone15pm]
// Exit 1 if a check fails. Writes <outDir>/<name>.log, <name>.json, <name>-mouse.json and the screenshots.

import { chromium, devices, webkit } from "playwright-core";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const ONLY = opt("only", "touch,mouse,319").split(",").map((s) => s.trim());
const TAG = opt("tag", "after");
const NAME = opt("name", "touchcheck");
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

async function openPage(browsers, origin, vname) {
  const engine = ENGINE(vname), browser = browsers[engine];
  if (!browser) throw new Error(`${vname}: ${engine} is not running`);
  const ctx = await browser.newContext(VIEW[vname]);
  const page = await ctx.newPage();
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
  const f = window.bb.game.screen.L.frame, D = 120;
  const sx = f.facing === 0 || f.facing === 2 ? f.dx + cx * 12 : f.facing === 1 ? f.dx + D - (cy + 1) * 12 : f.dx + cy * 12;
  const sy = f.facing === 0 ? f.dy + cy * 12 : f.facing === 2 ? f.dy + D - (cy + 1) * 12 : f.dy + cx * 12;
  return window.bb.toClient(sx + 6, sy + 6);
}, [x, y]);
const card = (page, i) => page.evaluate((n) => { const r = window.bb.game.screen.L.cards[n]; return window.bb.toClient(r.x + r.w / 2, r.y + r.h / 2); }, i);
const turret = (page, i) => page.evaluate((n) => { const r = window.bb.game.screen.turretRect(n); return window.bb.toClient(r.x + r.w / 2, r.y + r.h / 2); }, i);
const slot = (page, i) => page.evaluate((n) => { const r = window.bb.game.screen.slotRect(n); return window.bb.toClient(r.x + r.w / 2, r.y + r.h / 2); }, i);
const region = (page, id) => page.evaluate((i) => window.bb.regions().filter((q) => q.id === i).pop() ?? null, id);
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
  return {
    sel: s.sel, carry: s.ed.carry ? s.ed.carry.def : null, draw: s.ed.draw ? { ...s.ed.draw, cells: [...s.ed.draw.cells] } : null,
    toasts: g.toastLog.length, panel: typeof window.bb.panel === "function" ? window.bb.panel() : null, gold: g.run.gold,
    box, inside, vis: { x: x0, y: y0, w: Math.round(x1 - x0), h: Math.round(y1 - y0) }, band, inBand,
  };
});
/** zoom (REQ-BFG-040, A1): on a portrait phone view (FIT_VIEWS) the panel a tap opened sits inside the band, drawn no
 *  bigger than it (not grown over the bow or the shop), fully inside the visible viewport, with its full description
 *  (panelInfo's `full`: its kept text whole, the full body's text, every rule sentence, no phone cut; its flavour and hint
 *  may give way, and its form is reported). */
const fitted = (l) => !!l.panel && l.inBand && l.inside && l.panel.full === true;
const fdesc = (l) => (!l.panel ? "no panel" : `${l.box ? `${l.box.w.toFixed(0)}x${l.box.h.toFixed(0)} CSS px at y ${l.box.y.toFixed(0)}` : "not drawn"} ${l.inBand ? "inside" : "NOT inside"} the band${l.band ? ` (${l.band.h.toFixed(0)} CSS px at y ${l.band.y.toFixed(0)})` : ""}; ${l.panel.full === true ? "its full description" : l.panel.full === false ? "NOT its full description" : "full description unknown"}${l.panel.fullest ? ", every block (variant 0)" : l.panel.full ? ` (variant ${l.panel.variant}${l.panel.dropped.length ? `, ${l.panel.dropped.join("/")} gave way` : ""})` : ""}`);
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
  return marks.map((m) => {
    const rows = (glyphs[m.text] ?? "").split("|"), d = cx.getImageData(m.x + 1, m.y + 1, 3, 5).data;
    let px = 0;
    for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (rows[j] && near(d, 4 * (j * 3 + i), rows[j][i] === "#" ? yellow : ink)) px++;
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
  if (!(tapMs[tapMs.length - 1] < 150)) log(`[${at()}] a slow tap: ${JSON.stringify(seen)} at (${p.x.toFixed(0)}, ${p.y.toFixed(0)}), after "${(checks[checks.length - 1]?.what ?? "").slice(0, 140)}"`);
  await sleep(150);
}

/** A finger's drag through `pts` (client points), a move every 6 CSS px; `release` false leaves it down (call up()). */
async function drag(cdp, pts, release = true) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [tp(pts[0])] });
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 6));
    for (let k = 1; k <= n; k++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [tp({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n })] });
    await sleep(25);
  }
  await sleep(120);
  if (release) await up(cdp);
}
const up = async (cdp) => { await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await sleep(150); };
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
  check(!!r && shown(l0, title) && lead === "UPGRADE 10G" && r.h >= TAP_CSS && inView(r, l0) && m0.length === 0,
    `${V}: a tap on ${what} opens its panel (${pdesc(l0)}; buttons ${JSON.stringify(l0.panel?.labels ?? null)}), its UPGRADE 10G ${r ? `a ${r.w.toFixed(1)}x${r.h.toFixed(1)} CSS px target ${inView(r, l0) ? "inside" : "NOT inside"} the visible viewport` : "MISSING"}; level 1: no mark on the board (${mdesc(m0)})`);
  if (!r) return { s0, s1: s0 };
  await tap(cdp, centre(r), 3, 0);
  const l1 = await look(page), s1 = JSON.parse(await snap(page)), m1 = await marksOf(page, track);
  const { upgrades: u0, ...b0 } = s0.build, { upgrades: u1, ...b1 } = s1.build;
  const text = l1.panel ? l1.panel.lines.join(" ") : "";
  const marked = m1.length === 1 && m1[0].level === 2 && m1[0].text === "2" && m1[0].px === 15 && m1[0][track === "factory" ? "uid" : "slot"] === key;
  check(s1.gold === s0.gold - 10 && !u0?.[track] && u1?.[track] === 2 && same(b1, b0) && same(s1.inventory, s0.inventory) && same(s1.offers, s0.offers)
    && l1.panel?.labels?.[0] === "UPGRADE 20G" && (track !== "factory" || /LEVEL 2\/4/.test(text)) && shown(l1, title) && marked,
    `${V}: its UPGRADE 10G buys ${track === "factory" ? "FACTORY" : "TURRET SPEED"} level 2: gold ${s0.gold} -> ${s1.gold}, upgrades ${JSON.stringify(u0 ?? {})} -> ${JSON.stringify(u1 ?? {})}, the rest of the build, cargo and the shop unchanged; the panel now offers ${JSON.stringify(l1.panel?.labels?.[0] ?? null)}${track === "factory" ? ` and says ${JSON.stringify(text.match(/[A-Z ]*LEVEL \d\/\d/)?.[0] ?? null)}` : ""}; the board's mark: ${mdesc(m1)}`);
  return { s0, s1 };
}

// ------------------------------------------------------------------------------------------------------------ A1 touch
async function touchSection(browsers, origin, vname) {
  log("");
  const engine = ENGINE(vname);
  log(`## touch ${vname} (${engine} ${browsers[engine]?.version() ?? "not running"}, ${VIEW[vname].viewport.width}x${VIEW[vname].viewport.height} @${VIEW[vname].deviceScaleFactor}, isMobile, hasTouch): real touch events, taps drifting 3, 5 and 8 CSS px`);
  const { ctx, page, cdp, errors } = await openPage(browsers, origin, vname);
  const V = `touch ${vname}`;
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

  // shoptap2: where a finger's panel grows past the band it covers part of the bow (a shop card's) or the shop (a part's):
  // a press there goes through to what is under it; a press on the band part of the panel changes nothing, as ever
  {
    await page.keyboard.press("Escape");
    await tap(cdp, await card(page, 0), 3, 0);
    const l0 = await look(page), t = await turret(page, 1);
    const band = await page.evaluate(() => { const a = window.bb.game.screen.L.info, p = window.bb.toClient(a.x, a.y), q = window.bb.toClient(a.x + a.w, a.y + a.h); return { x: p.x, y: p.y, w: q.x - p.x, h: q.y - p.y }; });
    const under = (p, r) => !!r && p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
    if (under(t, l0.box) && !under(t, band)) {
      const s0 = await snap(page);
      await tap(cdp, t, 5, 90);
      const l = await look(page);
      check(same(l.sel, { kind: "turret", index: 1 }) && shown(l, "BOMBARD") && (await snap(page)) === s0,
        `${V}: the GREASE WORKS panel grown over the bow covers the BOMBARD; a tap there goes through and reads it (${pdesc(l)}); nothing changed`);
      if (band.h >= 6) {
        await tap(cdp, await card(page, 0), 3, 0);
        await tap(cdp, { x: band.x + band.w / 2, y: band.y + band.h / 2 }, 3, 0);
        const lb = await look(page);
        check(same(lb.sel, { kind: "offer", wagon: 0, slot: 0 }) && shown(lb, "GREASE WORKS"), `${V}: a tap on the panel over the band changes nothing (${JSON.stringify(lb.sel)})`);
      }
    } else log(`[${at()}] ${V}: the shop card's panel doesn't cover the BOMBARD here (the ${env.band === null ? "landscape column" : "band"}, ${band.h.toFixed(0)} CSS px tall, holds it): no press goes through`);
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
    await openDeck(page, KILN_DECK);
    const s0 = JSON.parse(await snap(page));
    const p1 = await cells(page, [[5, 6], [5, 5], [5, 4], [5, 3], [5, 2], [5, 1], [5, 0]]);
    await drag(cdp, p1);
    const b1 = JSON.parse(await snap(page)).build;
    await shot(page, `${TAG}-${vname}-kiln-second-belt.png`);
    check(b1.routes.length === 2 && same(b1.routes[0], s0.build.routes[0]) && b1.routes[1].factory === 1 && same(b1.routes[1].cells, KILN_SECOND) && dist(p1) >= 40,
      `${V}: a ${dist(p1).toFixed(0)} CSS px drag out of the level-1 KILN (2 belt slots, 1 used) draws a second belt into column 5 (${JSON.stringify(b1.routes[1]?.cells)}) and keeps the first`);
    const s1 = await snap(page), n0 = (await look(page)).toasts;
    const pts = await cells(page, [[4, 7], [3, 7], [2, 7], [2, 6], [2, 5]]);
    await drag(cdp, pts, false);
    await page.evaluate(() => { const g = window.bb.game; g.step(1 / 60); g.render(); });
    const mid = await page.evaluate(() => { const s = window.bb.game.screen; return { draw: s.ed.draw && { ...s.ed.draw }, hide: s.view.hideRoute }; });
    const news = await toastsSince(page, n0);
    await shot(page, `${TAG}-${vname}-kiln-notice.png`);
    check(news.includes(FULL_KILN) && !mid.draw && mid.hide === -1,
      `${V}: a drag out of the full level-1 KILN (2 of 2 belts) says "${FULL_KILN}" and draws nothing (draw ${JSON.stringify(mid.draw)}; hidden route ${mid.hide})`);
    const back = await cells(page, [[2, 5], [2, 6], [2, 7], [3, 7], [4, 7]]);
    for (let i = 1; i < back.length; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [tp(back[i])] });
    await sleep(80);
    await up(cdp);
    check((await snap(page)) === s1, `${V}: that drag ended back on the KILN: the serialized build is identical`);
    await tap(cdp, await cell(page, 4, 7), 8, 45);
    check((await snap(page)) === s1, `${V}: a tap on the KILN changes nothing`);
    // bb-0.8.3 (REQ-BFG-043 D10, D11): the KILN's FACTORY UPGRADE (25 gold -> 15), its two belts kept, then its third belt
    const { s1: r2 } = await upgradeTouch(page, cdp, V, { what: "the KILN", where: () => cell(page, 4, 7), track: "factory", title: "KILN", key: 1 });
    const b2 = r2.build;
    await shot(page, `${TAG}-${vname}-kiln-upgraded.png`);
    check(same(b2.routes, b1.routes) && b2.items.filter((p) => p.def === "kiln").length === 1 && !b2.items.find((p) => p.uid === 1)?.stars,
      `${V}: the KILN at FACTORY level 2 keeps its two belts and stays one KILN, with no stars`);
    const p3 = await cells(page, [[5, 6], [6, 6], [7, 6], [8, 6], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0]]);
    await drag(cdp, p3);
    const b3 = JSON.parse(await snap(page)).build;
    await shot(page, `${TAG}-${vname}-kiln-third-belt.png`);
    check(b3.routes.length === 3 && same(b3.routes.slice(0, 2), b2.routes) && b3.routes[2].factory === 1 && same(b3.routes[2].cells, KILN_THIRD),
      `${V}: a drag out of the level-2 KILN (3 belt slots, 2 used) draws its third belt into column 8 at once: ${JSON.stringify(b3.routes[2]?.cells)}`);
    // the starting SCRAP CANNON (TURRET SLOT 1, the free copy): its TURRET SPEED UPGRADE (15 gold -> 5)
    await upgradeTouch(page, cdp, V, { what: "the starting SCRAP CANNON (TURRET SLOT 1, the free copy)", where: () => turret(page, 0), track: "turret", title: "SCRAP CANNON", key: 0 });
    await shot(page, `${TAG}-${vname}-turret-upgraded.png`);
  }
  {
    await openDeck(page, WEAVER);
    const s0 = JSON.parse(await snap(page));
    const p1 = await cells(page, [[5, 6], [6, 6], [7, 6], [8, 6], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0]]);
    await drag(cdp, p1);
    const b1 = JSON.parse(await snap(page)).build;
    await shot(page, `${TAG}-${vname}-loom-second-belt.png`);
    check(b1.routes.length === 2 && same(b1.routes[0], s0.build.routes[0]) && b1.routes[1].factory === 1 && dist(p1) >= 40,
      `${V}: a ${dist(p1).toFixed(0)} CSS px drag out of the LOOM (three outputs, one used) adds a second belt (${b1.routes[1]?.cells.length} tiles) and keeps the first`);
    const p2 = await cells(page, [[4, 5], [3, 5], [2, 5], [1, 5], [1, 4], [1, 3], [1, 2], [1, 1], [1, 0]]);
    await drag(cdp, p2);
    const b2 = JSON.parse(await snap(page)).build;
    check(b2.routes.length === 3 && same(b2.routes.slice(0, 2), b1.routes) && b2.routes[2].factory === 1 && !b2.routes[2].cells.includes(K(4, 5)),
      `${V}: a drag that starts on the LOOM's own first belt tile (ambiguous with the LOOM) draws a third belt and keeps both: ${JSON.stringify(b2.routes[2]?.cells)}`);
    const n0 = (await look(page)).toasts;
    const p4 = await cells(page, [[5, 7], [6, 7], [7, 7], [7, 8]]);
    await drag(cdp, p4);
    const news = await toastsSince(page, n0), b3 = JSON.parse(await snap(page)).build;
    // the warning tells the truth in fullNotice's words (0.8.0: "ALL 3 LOOM OUTPUTS USED - DRAG A BELT TO REROUTE"; bb-0.8.3
    // REQ-BFG-043 D11: the hero's own factory points at its FACTORY upgrade, was "· ★2 OPENS A 4TH")
    const FULL_LOOM = "LOOM'S 3 BELTS ARE IN USE · UPGRADE FOR A 4TH";
    check(news.includes(FULL_LOOM) && same(b3, b2), `${V}: with every output used, a drag out of the LOOM warns ("${FULL_LOOM}") and changes nothing`);
    // bb-0.8.3 (REQ-BFG-043 D10, D11; REQ-BFG-044): the LOOM's FACTORY UPGRADE (15 gold -> 5) opens a fourth slot (3/4/5/6),
    // and the same drag now draws its fourth belt
    const { s1: r4 } = await upgradeTouch(page, cdp, V, { what: "the full LOOM", where: () => cell(page, 4, 7), track: "factory", title: "LOOM", key: 1 });
    await drag(cdp, p4);
    const b4 = JSON.parse(await snap(page)).build;
    await shot(page, `${TAG}-${vname}-loom-fourth-belt.png`);
    check(b4.routes.length === 4 && same(b4.routes.slice(0, 3), r4.build.routes) && b4.routes[3].factory === 1 && same(b4.routes[3].cells, LOOM_FOURTH) && dist(p4) >= 40,
      `${V}: a ${dist(p4).toFixed(0)} CSS px drag out of the level-2 LOOM (4 belt slots, 3 used) draws its fourth belt: ${JSON.stringify(b4.routes[3]?.cells)}`);
  }

  // real drags of 40 px or more still work on touch
  {
    await openDeck(page, FURNACE);
    const from = await card(page, 0), to = await cell(page, 3, 4);
    await drag(cdp, [from, to]);
    const r = JSON.parse(await snap(page));
    check(r.gold === 2 && r.build.items.some((p) => p.def === "grease" && p.x === 3 && p.y === 4) && dist([from, to]) >= 40,
      `${V}: a ${dist([from, to]).toFixed(0)} CSS px drag buys the GREASE WORKS card and places it on (3,4) (gold 5 -> ${r.gold})`);
    const m = await cells(page, [[3, 3], [3, 2], [3, 1], [2, 1]]);
    await drag(cdp, m);
    const r2 = JSON.parse(await snap(page)).build;
    check(r2.items.some((p) => p.uid === 3 && p.x === 2 && p.y === 1) && dist(m) >= 40, `${V}: a ${dist(m).toFixed(0)} CSS px drag moves the TEMPER from (3,3) to (2,1)`);
    const rr = await cells(page, [[6, 3], [7, 3], [7, 2], [7, 1], [7, 0]]);
    await drag(cdp, rr);
    const r3 = JSON.parse(await snap(page)).build;
    const press = r3.routes.find((q) => q.factory === 2);
    check(press && same(press.cells.slice(0, 3), [K(6, 5), K(6, 4), K(6, 3)]) && press.cells.includes(K(7, 3)) && dist(rr) >= 40,
      `${V}: a ${dist(rr).toFixed(0)} CSS px drag from the STAMP PRESS belt's tile 3 reroutes it: ${JSON.stringify(press?.cells)}`);
    const sl = await slot(page, 0), dc = await cell(page, 8, 7);
    await drag(cdp, [sl, dc]);
    const r4 = JSON.parse(await snap(page));
    check(r4.build.items.some((p) => p.uid === 60) && !r4.inventory.some((i) => i.uid === 60), `${V}: a drag from cargo places the GALVANIC COIL on the deck`);
  }

  check(errors.length === 0, `${V}: 0 console errors (${errors.length}${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""})`);
  await ctx.close();
}

// ------------------------------------------------------------------------------------------------------------ A2 mouse
async function mouseSection(browsers, origin) {
  log("");
  log("## mouse desk (1920x1080 @1): the mouse as 69fe689");
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
}

// ------------------------------------------------------------------------------------------------------------- 319
async function summarySection(browsers, origin) {
  log("");
  log("## 319: the run summary offline, 20 rows (a warlord and a dusk each day): the card on the screen, NEW RUN and TITLE");
  for (const vname of ["phone", "phone-land", "small", "desk"]) {
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
  }
}

async function main() {
  const browsers = { chromium: await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"] }) };
  const views = ONLY.includes("touch") ? TOUCH_VIEWS : [];
  for (const v of views) if (!VIEW[v]?.hasTouch) throw new Error(`--views: ${v} is not a touch view (${Object.keys(VIEW).join(", ")})`);
  // shoptap2: WebKit (Playwright's build of it, with the iPhone descriptors) for the wk- views
  if (views.some((v) => ENGINE(v) === "webkit")) {
    try {
      browsers.webkit = await webkit.launch();
    } catch (e) {
      check(false, `WebKit launches for the iPhone views: ${String(e instanceof Error ? e.message : e).split("\n")[0]}`);
    }
  }
  const site = await pageServer();
  log(`# touchcheck ${ONLY.join(", ")}: ${DIST} served at ${site.origin}; Chromium ${browsers.chromium.version()}${browsers.webkit ? `, WebKit ${browsers.webkit.version()}` : ""}; touch views ${views.join(", ") || "none"}; ${new Date().toISOString()}`);
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
  } finally {
    for (const b of Object.values(browsers)) await b.close();
    site.srv.close();
  }
  if (tapMs.length) {
    const max = Math.max(...tapMs), mean = tapMs.reduce((s, v) => s + v, 0) / tapMs.length;
    check(max < 200, `every touch tap was one touch press under 200 ms, pointerdown to pointerup as the page timed it (${tapMs.length} taps; the longest ${max.toFixed(1)} ms, mean ${mean.toFixed(1)} ms)`);
  }
  const failed = checks.filter((c) => !c.ok);
  log("");
  log(failed.length ? `TOUCH CHECKS FAILED: ${failed.length} of ${checks.length}` : `TOUCH CHECKS PASSED: ${checks.length} of ${checks.length}`);
  log(`screenshots: ${shots.join(", ")}`);
  writeFileSync(join(OUT, `${NAME}.log`), lines.join("\n") + "\n");
  writeFileSync(join(OUT, `${NAME}.json`), JSON.stringify({ checks, tapMs }, null, 1) + "\n");
  if (mouseSeen.length) writeFileSync(join(OUT, `${NAME}-mouse.json`), JSON.stringify(mouseSeen, null, 1) + "\n");
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : String(e));
  writeFileSync(join(OUT, `${NAME}.log`), lines.join("\n") + `\nERROR ${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
