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
//           first; a drag from a one-output factory with a belt shows the notice, keeps the old belt in sight, and ended
//           back on the factory leaves the build identical (serialized); a factory with every output used warns (037);
//         - real drags of 40 px or more still work: a shop card bought and placed, a part moved, a belt drawn and rerouted;
//         - every button pressed is at least 44 CSS px tall (SELL, ROTATE, TO CARGO, REMOVE BELT, BUY, the X).
//  mouse  (A2) the desk 1920x1080: a click selects, click-to-place buys and places, a click turns a rig, the drag
//         threshold is 4 logical px, a belt click puts up no X; the one-output notice (the one change for the mouse).
//         It writes <name>-mouse.json (what it saw, timings aside), so a run on 69fe689's build can be compared with it.
//  319    the run summary offline with a 20-row history (each day a warlord and a dusk) on the phones and the desk: the card
//         on the screen, NEW RUN and TITLE at least 44 CSS px tall on a phone (the desktop's as before).
// Usage: npm run build && node scripts/touchcheck.mjs <outDir> [--dist <dir>] [--only touch,mouse,319] [--tag after]
//        [--name touchcheck]
// Exit 1 if a check fails. Writes <outDir>/<name>.log, <name>.json, <name>-mouse.json and the screenshots.

import { chromium } from "playwright-core";
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

const VIEW = {
  phone: VIEWS.phone, // 390x844 @3, the operator's iPhone
  "phone-land": { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  small: VIEWS.small, // 360x640 @2
  desk: VIEWS.desk, // 1920x1080 @1, the mouse
};
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

async function openPage(browser, origin, vname) {
  const ctx = await browser.newContext(VIEW[vname]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
  await page.goto(`${origin}/index.html`);
  await page.waitForFunction(() => !!window.bb, null, { timeout: 15000 });
  const cdp = await ctx.newCDPSession(page);
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
/** WEAVER at a day-3 dawn: the LOOM (three outputs) with one belt up column 4. */
const WEAVER = {
  hero: "weaver", day: 3, gold: 5, beltCap: 40, items: [{ uid: 1, def: "loom", x: 4, y: 6 }],
  routes: [{ factory: 1, cells: KILN_BELT }], mods: [], inventory: [], offers: [],
};

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
const look = (page) => page.evaluate(() => {
  const g = window.bb.game, s = g.screen;
  return {
    sel: s.sel, carry: s.ed.carry ? s.ed.carry.def : null, draw: s.ed.draw ? { ...s.ed.draw, cells: [...s.ed.draw.cells] } : null,
    toasts: g.toastLog.length, panel: typeof window.bb.panel === "function" ? window.bb.panel() : null, gold: g.run.gold,
  };
});
const toastsSince = (page, n) => page.evaluate((i) => window.bb.game.toastLog.slice(i), n);
const rotOf = (page, uid) => page.evaluate((u) => window.bb.game.run.build.items.find((p) => p.uid === u)?.rot ?? 0, uid);
const kview = (page) => page.evaluate(() => { const v = window.bb.game.view; return { k: v.scale / v.dpr, W: v.W, H: v.H, scale: v.scale, dpr: v.dpr }; });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function shot(page, name) {
  await page.evaluate(() => { const g = window.bb.game; g.step(1 / 60); g.render(); });
  await page.screenshot({ path: join(OUT, name) });
  shots.push(name);
}

// ---------------------------------------------------------------------------------------------------- real touch input
const tp = (p) => ({ x: p.x, y: p.y, id: 1, radiusX: 4, radiusY: 4, force: 1 });

/** A finger's tap at `p`: down, a drift of `css` CSS px at `deg` degrees in two moves, up; under 200 ms. */
async function tap(cdp, p, css = 0, deg = 0) {
  const a = (deg * Math.PI) / 180, q = { x: p.x + css * Math.cos(a), y: p.y + css * Math.sin(a) };
  const t = Date.now();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [tp(p)] });
  if (css) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [tp({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 })] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [tp(q)] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  tapMs.push(Date.now() - t);
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

// ------------------------------------------------------------------------------------------------------------ A1 touch
async function touchSection(browser, origin, vname) {
  log("");
  log(`## touch ${vname} (${VIEW[vname].viewport.width}x${VIEW[vname].viewport.height} @${VIEW[vname].deviceScaleFactor}): real touch events, taps drifting 3, 5 and 8 CSS px`);
  const { ctx, page, cdp, errors } = await openPage(browser, origin, vname);
  const V = `touch ${vname}`;
  await openDeck(page, FURNACE);
  const kv = await kview(page);
  log(`[${at()}] build screen ${kv.W}x${kv.H} at x${kv.scale} (dpr ${kv.dpr}): ${kv.k.toFixed(3)} CSS px per logical px; a deck cell is ${(12 * kv.k).toFixed(1)} CSS px; the touch slop 10 CSS px = ${(10 / kv.k).toFixed(2)} logical px (the mouse's 4 logical px = ${(4 * kv.k).toFixed(1)} CSS px)`);

  // 034: shop cards, affordable and not
  for (const [i, label, def] of [[0, "affordable", "GREASE WORKS"], [1, "unaffordable", "GANTRY PRESS"]]) {
    for (const [d, deg] of DRIFTS) {
      await page.keyboard.press("Escape");
      const s0 = await snap(page), l0 = await look(page);
      await tap(cdp, await card(page, i), d, deg);
      const l = await look(page), s1 = await snap(page), news = await toastsSince(page, l0.toasts);
      const ok = l.sel.kind === "offer" && l.sel.slot === i && !l.carry && s1 === s0 && !news.some((t) => /MORE GOLD/.test(t)) && (!l.panel || l.panel.title === def);
      check(ok, `${V}: the ${label} shop card (${def}) tapped with a ${d} CSS px drift opens its description (${l.panel ? `panel "${l.panel.title}", ${l.panel.lines.length} lines, buttons ${JSON.stringify(l.panel.labels)}` : JSON.stringify(l.sel)}); gold ${l.gold}, the shop and the build unchanged; nothing lifted${news.length ? `; toasts ${JSON.stringify(news)}` : ""}`);
    }
    await shot(page, `${TAG}-${vname}-shop-${label}.png`);
    const buy = await region(page, "buy");
    if (buy) check(buy.h >= TAP_CSS, `${V}: the ${label} card's ${i === 0 ? "BUY" : "BUY (disabled)"} button is a ${buy.w.toFixed(1)}x${buy.h.toFixed(1)} CSS px target (at least 44 tall)`);
  }

  // 035: each carrier part, three drifts each; a tap alone changes nothing
  const parts = [
    ["the signature KILN", () => cell(page, 4, 7), { kind: "item", uid: 1 }],
    ["a STAMP PRESS (factory)", () => cell(page, 6, 7), { kind: "item", uid: 2 }],
    ["an OVERDRIVE (X rig)", () => cell(page, 5, 3), { kind: "item", uid: 4 }],
    ["a BOMBARD (turret) with a core and gear", () => turret(page, 1), { kind: "turret", index: 1 }],
  ];
  for (const [what, where, want] of parts) {
    for (const [d, deg] of DRIFTS) {
      await page.keyboard.press("Escape");
      const s0 = await snap(page);
      await tap(cdp, await where(), d, deg);
      const l = await look(page), s1 = await snap(page);
      check(same(l.sel, want) && s1 === s0 && !l.carry && !l.draw, `${V}: ${what} tapped with a ${d} CSS px drift opens its panel (${l.panel ? `"${l.panel.title}" · ${l.panel.sub}; buttons ${JSON.stringify(l.panel.labels)}` : JSON.stringify(l.sel)}); gold, the build and cargo unchanged`);
    }
  }
  // the signature KILN's panel says it stays aboard, no SELL
  await page.keyboard.press("Escape");
  await tap(cdp, await cell(page, 4, 7), 5, 90);
  const kiln = await look(page);
  const kilnText = kiln.panel ? kiln.panel.lines.join(" ") : "";
  check(kiln.panel && kiln.panel.labels.length === 0 && kilnText.includes("THE SIGNATURE FACTORY STAYS ABOARD. IT CAN'T BE SOLD."), `${V}: the KILN's panel offers no SELL and says why: ${kiln.panel ? JSON.stringify(kiln.panel.lines.filter((t) => /ABOARD|SOLD|SIGNATURE/.test(t))) : "no panel"}`);
  await shot(page, `${TAG}-${vname}-kiln-panel.png`);
  // the rig: its first tap selects without turning; a tap on the selected rig turns it
  for (const [d, deg] of DRIFTS) {
    await page.keyboard.press("Escape");
    const r0 = await rotOf(page, 3), s0 = await snap(page);
    await tap(cdp, await cell(page, 3, 3), d, deg);
    const l = await look(page), r1 = await rotOf(page, 3), s1 = await snap(page);
    await tap(cdp, await cell(page, 3, 3), d, deg + 180);
    const r2 = await rotOf(page, 3);
    check(same(l.sel, { kind: "item", uid: 3 }) && r1 === r0 && s1 === s0 && r2 === (r0 + 1) % 4, `${V}: the TEMPER (rig), ${d} CSS px drift: the first tap selects it and doesn't turn it (rot ${r0} -> ${r1}), a tap on the selected rig turns it a quarter (rot ${r2})`);
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
    for (let i = 0; i < 4; i++) {
      await tap(cdp, await turret(page, 1), DRIFTS[i % 3][0], DRIFTS[i % 3][1]);
      const l = await look(page);
      seen.push(`${l.sel.kind}${l.sel.uid ? ` ${l.sel.uid}` : ""}${l.panel ? ` "${l.panel.title}" ${JSON.stringify(l.panel.labels)}` : ""}`);
      if (i === 0) await shot(page, `${TAG}-${vname}-turret-panel.png`);
      if (i === 2) await shot(page, `${TAG}-${vname}-gear-panel.png`);
    }
    check(seen[0].startsWith("turret") && seen[1].startsWith("fitted 950") && seen[2].startsWith("fitted 951") && seen[3].startsWith("turret"),
      `${V}: the turret, then a tap again: its core, its gear, back to the turret: ${seen.join(" | ")}`);
  }

  // 034 + 035: with a shop card selected, a tap on a part reads it and buys nothing
  for (const [what, where, want] of [["the TEMPER", () => cell(page, 3, 3), { kind: "item", uid: 3 }], ["the STAMP PRESS", () => cell(page, 6, 7), { kind: "item", uid: 2 }], ["the BOMBARD", () => turret(page, 1), { kind: "turret", index: 1 }], ["an empty cell", () => cell(page, 8, 8), { kind: "none" }]]) {
    await page.keyboard.press("Escape");
    await tap(cdp, await card(page, 0), 3, 0);
    const s0 = await snap(page), r0 = await rotOf(page, 3);
    await tap(cdp, await where(), 5, 90);
    const l = await look(page), s1 = await snap(page);
    check(same(l.sel, want) && s1 === s0 && (await rotOf(page, 3)) === r0, `${V}: with the GREASE WORKS card selected, a tap on ${what} ${want.kind === "none" ? "dismisses it" : "reads it"} (${JSON.stringify(l.sel)}) and buys or places nothing (gold ${l.gold})`);
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
    check(gone(b) && g1 > g0 && (price === null || g1 - g0 === price) && r.h >= TAP_CSS,
      `${V}: SELL on ${what}'s panel (${label ?? id}, a ${r.w.toFixed(1)}x${r.h.toFixed(1)} CSS px target) sells it: gold ${g0} -> ${g1}`);
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
    check(same(l.sel, { kind: "route", index: 0 }) && x && x.w >= TAP_CSS && x.h >= TAP_CSS && x.x >= 0 && x.y >= 0 && x.x + x.w <= vp.width && x.y + x.h <= vp.height && clear && s1 === s0,
      `${V}: a tap on the KILN's belt (${d} CSS px drift) selects it and puts up its X: ${x ? `${x.w.toFixed(1)}x${x.h.toFixed(1)} CSS px at (${x.x.toFixed(0)}, ${x.y.toFixed(0)})` : "none"}, on screen, clear of the panel; the belt uncut`);
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

  // 037: factory drags
  {
    await openDeck(page, FURNACE);
    const s0 = await snap(page), n0 = (await look(page)).toasts;
    const pts = await cells(page, [[4, 7], [3, 7], [2, 7], [2, 6], [2, 5]]);
    await drag(cdp, pts, false);
    await page.evaluate(() => { const g = window.bb.game; g.step(1 / 60); g.render(); });
    const mid = await page.evaluate(() => { const s = window.bb.game.screen; return { draw: s.ed.draw && { ...s.ed.draw }, hide: s.view.hideRoute }; });
    const news = await toastsSince(page, n0);
    await shot(page, `${TAG}-${vname}-kiln-notice.png`);
    check(news.includes("KILN HAS 1 OUTPUT · THIS MOVES ITS BELT") && mid.draw?.moves === true && mid.draw.cells.length > 0 && mid.hide === -1,
      `${V}: a drag out of the KILN (one output, with a belt) shows "KILN HAS 1 OUTPUT · THIS MOVES ITS BELT" and keeps the old belt in sight while it draws (drawn: ${mid.draw?.cells.length} tiles; hidden route ${mid.hide})`);
    const back = await cells(page, [[2, 5], [2, 6], [2, 7], [3, 7], [4, 7]]);
    for (let i = 1; i < back.length; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [tp(back[i])] });
    await sleep(80);
    await up(cdp);
    check((await snap(page)) === s0, `${V}: that drag ended back on the KILN with no new tile: the serialized build is identical`);
    await tap(cdp, await cell(page, 4, 7), 8, 45);
    check((await snap(page)) === s0, `${V}: a tap on the KILN changes nothing`);
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
    await drag(cdp, await cells(page, [[5, 7], [6, 7], [7, 7], [7, 8]]));
    const news = await toastsSince(page, n0), b3 = JSON.parse(await snap(page)).build;
    check(news.includes("ALL 3 LOOM OUTPUTS USED - DRAG A BELT TO REROUTE") && same(b3, b2), `${V}: with every output used, a drag out of the LOOM keeps today's warning ("ALL 3 LOOM OUTPUTS USED - DRAG A BELT TO REROUTE") and changes nothing`);
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
async function mouseSection(browser, origin) {
  log("");
  log("## mouse desk (1920x1080 @1): the mouse as 69fe689");
  const { ctx, page, errors } = await openPage(browser, origin, "desk");
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
  // a mouse drag that lays a belt: the KILN's belt moved, as 69fe689
  {
    const pts = await cells(page, [[4, 7], [3, 7], [2, 7], [2, 6]]);
    await page.mouse.move(pts[0].x, pts[0].y);
    await page.mouse.down();
    for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y, { steps: 4 });
    await page.evaluate(() => { const g = window.bb.game; g.step(1 / 60); g.render(); });
    const mid = await page.evaluate(() => { const s = window.bb.game.screen; return { cells: s.ed.draw?.cells.length ?? 0, moves: s.ed.draw?.moves ?? null, hide: s.view.hideRoute }; });
    const news = await page.evaluate(() => window.bb.game.toastLog.slice(-3));
    await shot(page, `${TAG}-desk-kiln-notice.png`);
    await page.mouse.up();
    await sleep(120);
    v = await seen("a mouse drag out of the KILN through (3,7) (2,7) (2,6), released", { mid });
    mouseSeen.push({ what: "notice", notice: news.includes("KILN HAS 1 OUTPUT · THIS MOVES ITS BELT") });
    check(news.includes("KILN HAS 1 OUTPUT · THIS MOVES ITS BELT"), "mouse: a drag out of the KILN shows the notice too (the one change for the mouse)");
    check(mid.moves === null && mid.hide === 0 && v.routes.some((r) => r.factory === 1 && same(r.cells, [K(3, 7), K(2, 7), K(2, 6)])),
      `mouse: as 69fe689 the old belt is hidden while the new one draws (hidden route ${mid.hide}) and the released draw replaces it`);
  }
  check(errors.length === 0, `mouse: 0 console errors (${errors.length})`);
  await ctx.close();
}

// ------------------------------------------------------------------------------------------------------------- 319
async function summarySection(browser, origin) {
  log("");
  log("## 319: the run summary offline, 20 rows (a warlord and a dusk each day): the card on the screen, NEW RUN and TITLE");
  for (const vname of ["phone", "phone-land", "small", "desk"]) {
    const { ctx, page, errors } = await openPage(browser, origin, vname);
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
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"] });
  const site = await pageServer();
  log(`# touchcheck ${ONLY.join(", ")}: ${DIST} served at ${site.origin}; Chromium ${browser.version()}; ${new Date().toISOString()}`);
  try {
    if (ONLY.includes("touch")) for (const v of ["phone", "phone-land"]) await touchSection(browser, site.origin, v);
    if (ONLY.includes("mouse")) await mouseSection(browser, site.origin);
    if (ONLY.includes("319")) await summarySection(browser, site.origin);
  } finally {
    await browser.close();
    site.srv.close();
  }
  if (tapMs.length) {
    const max = Math.max(...tapMs);
    check(max < 200, `every touch tap took under 200 ms from touchstart to touchend (${tapMs.length} taps, the longest ${max} ms)`);
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
