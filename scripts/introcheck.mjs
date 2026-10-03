// intro (BeltBattles 0.8.0, job "intro", REQ-BFG-038): the title screen's demo battle on the BUILT page (dist/, served on
// 127.0.0.1; offline, no server URL), in Chromium. The operator, on his iPhone: "The intro screen's battle also has the
// two carriers too close." For each view, with no saved run ("new": NEW RUN, HOW TO PLAY, OPTIONS) and with one ("save":
// CONTINUE too, a taller panel), at three moments of the same demo battle (the title's first, n=0: FURNACE's starting
// deck against WEAVER's day-2 warlord deck, seed 1000):
//   start  0.5 s after the title has opened (the wipe done), the fight under way;
//   mid    halfway from the title opening to the KO;
//   end    1.5 s after the KO (the slow-mo, the loser dimmed; the title starts its next fight 3.2 s after the KO).
// What it measures (the game loop is held, so every frame is stepped at 1/60 s and the screenshot is the frame measured):
//   - the two carriers' hull boxes, as the title lays them out (TitleScreen.hulls), and their drawn boxes: the pixels
//     each carrier adds to the frame (the frame rendered again with that carrier hidden, Arena.show; the largest
//     8-connected blob of changed pixels: hull, machinery, turrets and barrels; its shells in flight are blobs of
//     their own and left out);
//   - the open gap between the two along the firing axis (portrait: up and down; landscape: across), in CSS px and as a
//     share of the screen's firing axis: between the hull boxes, and between the drawn boxes (barrel tip to barrel tip:
//     the open water a player sees).
// The checks (--measure: measure and shoot only, no verdict), on every frame:
//   - both carriers wholly on screen: both hull boxes and both drawn boxes inside the viewport;
//   - the drawn gap at least MIN_CSS CSS px and at least MIN_SHARE of the screen's firing axis, and the hull gap at least
//     GAP_SHARE (the real battle's own minimum, battleLayout.ts: 17% of the firing axis);
//   - nothing of the title over a carrier: neither carrier's hull box nor drawn box meets the logo band, the command
//     panel, a button (bb.regions()), the sound button or the version line;
//   - the title stays readable: at least one CSS px per logical px, the logo drawn whole, and its buttons at least as
//     tall in CSS px as 0350e5f drew them (NEW RUN 22 logical px, CONTINUE 28, HOW TO PLAY and OPTIONS 18, the sound
//     button 13, at its scale: io.ts defaultScale);
//   - with a saved run at mid-fight, the HOW TO PLAY card and the OPTIONS card opened over the frame: each wholly on
//     screen, the help card at least as wide in CSS px as 0350e5f's, the options card's buttons at least as tall;
//   - start and mid are before the KO, end after it; no console error or warning.
//   Where TitleScreen.layoutInfo() is missing (a build before this job) the logo band and the version line are not
//   known: those two overlap checks are skipped, and say so.
// battle (--only battle, or in the default run): the real dusk battle (bb.open("battle")) on the same views, 10 s into
// the fight: its gap measured the same way, for the report (the intro's fix does not touch it; nothing is asserted).
// Usage: npm run build && node scripts/introcheck.mjs <outDir> [--dist <dir>] [--tag after] [--only title,battle]
//        [--views phone,safari,land,desk,desk2,small] [--measure] [--shots] [--name introcheck]
// Exit 1 if a check fails. Writes <outDir>/<name>.log, <name>.json and (with --shots) <tag>-<view>-<save>-<moment>.png,
// <tag>-<view>-help.png, <tag>-<view>-options.png and <tag>-<view>-battle.png.

import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);
const DIST = resolve(opt("dist", join(ROOT, "dist")));
const OUT = resolve(args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--") && !["--measure", "--shots"].includes(args[i - 1]))) ?? join(ROOT, "shots", "introcheck"));
const TAG = opt("tag", "after");
const NAME = opt("name", "introcheck");
const ONLY = opt("only", "title,battle").split(",").map((s) => s.trim());
const MEASURE = flag("measure");
const SHOTS = flag("shots");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };

/** The views: the operator's iPhone (portrait), the part of it Safari shows (its bars take the rest), the iPhone on its
 *  side, the desk at 1x and 2x, and a small phone. */
const VIEW = {
  phone: { size: "390x844", ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
  safari: { size: "390x660", ctx: { viewport: { width: 390, height: 660 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
  land: { size: "844x390", ctx: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
  desk: { size: "1440x900", ctx: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
  desk2: { size: "1440x900@2", ctx: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 } },
  small: { size: "360x640", ctx: { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
};
const VIEWS = opt("views", "phone,safari,land,desk,desk2,small").split(",").map((s) => s.trim());
const SAVES = ["new", "save"];

// The thresholds (REPORT.md explains them). The title now keeps 20% of the firing axis between the hull boxes on every
// view here (titleLayout.ts TITLE_GAP_SHARE), which leaves 15.5-16.9% of open water between the barrel tips (the barrels
// take 13 px a side); 0350e5f left 2.6-10.3% (17-87 CSS px) on the portrait phones.
/** The open water between the drawn carriers (barrel tip to barrel tip), at least this many CSS px (one CSS inch)... */
const MIN_CSS = Number(opt("min-css", "96"));
/** ...and at least this share of the screen's firing axis. */
const MIN_SHARE = Number(opt("min-share", "0.14"));
/** The hull gap: at least the real battle's own minimum share of the firing axis (battleLayout.ts GAP_SHARE). */
const GAP_SHARE = 0.17;
/** 0350e5f's title buttons, logical px tall at its scale (title.ts: bh 22; CONTINUE bh + 6; HOW TO PLAY, OPTIONS bh - 4;
 *  the sound button 13), and its options card's (hud.ts optionsCard: 19). */
const OLD_BUTTON_H = { new: 22, cont: 28, help: 18, options: 18, sound: 13 };
const OLD_CARD_BUTTON_H = 19;

mkdirSync(OUT, { recursive: true });
const lines = [];
const t0 = Date.now();
const log = (s) => { lines.push(s); console.log(s); };
const checks = [];
const check = (ok, what) => {
  if (MEASURE) { log(`INFO  ${what}`); return; }
  checks.push({ ok: !!ok, what });
  log(`${ok ? "PASS" : "FAIL"}  ${what}`);
};
const rows = [];

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

/** In the page: the measuring kit (window.__intro). The game loop is parked (requestAnimationFrame holds its callback),
 *  so the frames are stepped here, 1/60 s each, and what a screenshot shows is the frame last measured. */
function installKit() {
  const hold = { cb: null };
  window.requestAnimationFrame = (cb) => { hold.cb = cb; return 0; };
  const DT = 1 / 60;
  const g = () => window.bb.game;
  const step = (n) => { for (let i = 0; i < n; i++) g().step(DT); };
  const css = (b, k, rc) => (b ? { x: rc.left + b.x * k, y: rc.top + b.y * k, w: b.w * k, h: b.h * k } : null);
  /** The open distance from a to b along the axis (positive: apart). */
  const sep = (a, b, vertical) => {
    if (!a || !b) return null;
    if (vertical) {
      const [u, d] = a.y <= b.y ? [a, b] : [b, a];
      return d.y - (u.y + u.h);
    }
    const [l, r] = a.x <= b.x ? [a, b] : [b, a];
    return r.x - (l.x + l.w);
  };
  /** The bounding box of the largest 8-connected blob of set cells in `mask` (W x H), or null. */
  const blob = (mask, W, H) => {
    const seen = new Uint8Array(W * H);
    const stack = new Int32Array(W * H);
    let best = null;
    for (let i0 = 0; i0 < W * H; i0++) {
      if (!mask[i0] || seen[i0]) continue;
      let sp = 0, n = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
      stack[sp++] = i0;
      seen[i0] = 1;
      while (sp) {
        const i = stack[--sp], x = i % W, y = (i - x) / W;
        n++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= H) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= W) continue;
            const j = yy * W + xx;
            if (mask[j] && !seen[j]) { seen[j] = 1; stack[sp++] = j; }
          }
        }
      }
      if (!best || n > best.n) best = { n, x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    }
    return best;
  };
  /** The game canvas's pixels, read through a copy made for reading (the game's own context is not, and Chromium warns
   *  on repeated readbacks from it). */
  const pixels = () => {
    const cv = g().canvas, W = cv.width, H = cv.height;
    const rd = document.createElement("canvas");
    rd.width = W;
    rd.height = H;
    const rc = rd.getContext("2d", { willReadFrequently: true });
    rc.drawImage(cv, 0, 0);
    return rc.getImageData(0, 0, W, H).data;
  };
  /** Each carrier's drawn box: the frame against the frame without that carrier (Arena.show). */
  const drawnBoxes = (a) => {
    const game = g(), cv = game.canvas, W = cv.width, H = cv.height;
    game.render();
    const full = pixels();
    const out = [];
    for (const side of [0, 1]) {
      const keep = a.show[side];
      a.show[side] = false;
      game.render();
      const part = pixels();
      a.show[side] = keep;
      const mask = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) {
        const o = i * 4;
        if (full[o] !== part[o] || full[o + 1] !== part[o + 1] || full[o + 2] !== part[o + 2]) mask[i] = 1;
      }
      out.push(blob(mask, W, H));
    }
    game.render(); // the whole frame again: the one the screenshot shows
    return out;
  };
  /** Finish any wipe, open screen `name` (bb.open) and step until it is up; returns the frames stepped. */
  const open = (name) => {
    const game = g();
    let guard = 0;
    while (game.transitioning && guard++ < 600) step(1);
    const before = game.screen;
    window.bb.open(name);
    let f = 0;
    while ((game.screen === before || game.transitioning) && f < 600) { step(1); f++; }
    return f;
  };
  const measure = (a, hulls, extra) => {
    const game = g(), v = game.view, k = v.scale / v.dpr, rc = game.canvas.getBoundingClientRect();
    const drawn = drawnBoxes(a);
    const vertical = v.portrait;
    const vw = window.innerWidth, vh = window.innerHeight, axis = vertical ? vh : vw;
    const hullGap = sep(hulls[0], hulls[1], vertical), drawnGap = sep(drawn[0], drawn[1], vertical);
    const layout = typeof game.screen.layoutInfo === "function" ? game.screen.layoutInfo() : null;
    return {
      W: v.W, H: v.H, scale: v.scale, dpr: v.dpr, k, portrait: v.portrait, vw, vh, axis,
      canvas: { x: rc.left, y: rc.top, w: rc.width, h: rc.height },
      hulls: hulls.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h })), drawn: drawn.map((b) => (b ? { x: b.x, y: b.y, w: b.w, h: b.h } : null)),
      hullsCss: hulls.map((b) => css(b, k, rc)), drawnCss: drawn.map((b) => css(b, k, rc)),
      hullGap, hullGapCss: hullGap * k, hullShare: (hullGap * k) / axis,
      drawnGap, drawnGapCss: drawnGap === null ? null : drawnGap * k, drawnShare: drawnGap === null ? null : (drawnGap * k) / axis,
      regions: window.bb.regions(),
      layout: layout ? Object.fromEntries(Object.entries(layout).map(([key, b]) => [key, b && typeof b === "object" && "w" in b ? css(b, k, rc) : b])) : null,
      over: a.b.over, clock: a.clock, hp: [a.b.sides[0].hull.hp, a.b.sides[1].hull.hp], ...extra,
    };
  };
  window.__intro = {
    hold, step, open, measure,
    /** The saved run: none ("new"), or a day-3 FURNACE run saved by its build screen ("save": CONTINUE shows). */
    setSave(kind) {
      const game = g();
      if (kind === "new") {
        localStorage.clear();
        game.run = null;
        return true;
      }
      window.bb.openDawn({ hero: "furnace", day: 3, wins: 2, losses: 0, gold: 9, seed: 12345 });
      let f = 0;
      while ((window.bb.screen() !== "build" || game.transitioning) && f < 600) { step(1); f++; }
      step(5);
      return Object.keys(localStorage).some((key) => key.startsWith("beltbattles.run."));
    },
    /** The title's demo battle: open the title, step until its fight ends; the frames from the opening to the KO. */
    titleLength() {
      const f0 = open("title");
      const a = g().screen.arena;
      let f = 0;
      while (!a.b.over && f < 60 * 240) { step(1); f++; }
      return { open: f0, over: a.b.over ? f : -1 };
    },
    title(frames) {
      open("title");
      step(frames);
      const s = g().screen;
      return measure(s.arena, s.hulls, { frames, screen: window.bb.screen() });
    },
    stepTitle(frames) {
      step(frames);
      const s = g().screen;
      return measure(s.arena, s.hulls, { screen: window.bb.screen() });
    },
    /** The title's HOW TO PLAY card or OPTIONS card open on this frame (no step): their regions in CSS px, and the
     *  menu scale's view (0350e5f's title scale: io.ts defaultScale) for the card's old width. */
    card(which) {
      const game = g(), s = game.screen;
      s.help = which === "help";
      s.menu = which === "options";
      game.render();
      const regions = window.bb.regions();
      const v = game.view, dpr = v.dpr, pw = Math.floor(innerWidth * dpr), ph = Math.floor(innerHeight * dpr);
      const menu = Math.max(1, Math.floor(Math.min(pw / (v.portrait ? 200 : 440), ph / (v.portrait ? 400 : 346))));
      return { regions, vw: innerWidth, vh: innerHeight, scale: v.scale, k: v.scale / dpr, menuW: Math.floor(pw / menu), menuK: menu / dpr };
    },
    closeCards() {
      const game = g(), s = game.screen;
      s.help = false;
      s.menu = false;
      game.render();
    },
    /** The real dusk battle (bb.open("battle")), `secs` into its fight. */
    battle(secs) {
      open("battle");
      const game = g();
      let f = 0;
      while (game.screen.phase !== "fight" && f < 60 * 30) { step(1); f++; }
      step(Math.round(secs * 60));
      const s = game.screen;
      return measure(s.arena, s.L.hulls, { phase: s.phase, screen: window.bb.screen() });
    },
  };
}

const r1 = (x) => (x === null || x === undefined ? "n/a" : Math.round(x * 10) / 10);
const pct = (x) => (x === null || x === undefined ? "n/a" : `${(x * 100).toFixed(1)}%`);
const meets = (a, b) => !!a && !!b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const insideView = (b, m) => !!b && b.x >= -0.01 && b.y >= -0.01 && b.x + b.w <= m.vw + 0.01 && b.y + b.h <= m.vh + 0.01;

function titleChecks(vname, save, moment, m) {
  const at = `${vname} ${VIEW[vname].size} ${save} ${moment}`;
  const ships = [...m.hullsCss, ...m.drawnCss];
  check(m.screen === "title" && m.hullsCss.every((b) => insideView(b, m)) && m.drawnCss.every((b) => insideView(b, m)),
    `${at}: both carriers wholly on screen (hull boxes ${m.hullsCss.map((b) => `${r1(b.x)},${r1(b.y)} ${r1(b.w)}x${r1(b.h)}`).join(" / ")}; drawn ${m.drawnCss.map((b) => (b ? `${r1(b.x)},${r1(b.y)} ${r1(b.w)}x${r1(b.h)}` : "none")).join(" / ")} CSS px; viewport ${m.vw}x${m.vh})`);
  check(m.drawnGapCss !== null && m.drawnGapCss >= MIN_CSS && m.drawnShare >= MIN_SHARE,
    `${at}: open water between the drawn carriers ${r1(m.drawnGapCss)} CSS px = ${pct(m.drawnShare)} of the ${m.portrait ? "height" : "width"} (at least ${MIN_CSS} CSS px and ${pct(MIN_SHARE)}); hull gap ${m.hullGap} px = ${r1(m.hullGapCss)} CSS px = ${pct(m.hullShare)} (at least ${pct(GAP_SHARE)}); scale ${m.scale} (${r1(m.k)} CSS px per px)`);
  check(m.hullShare >= GAP_SHARE - 1e-9, `${at}: hull gap ${pct(m.hullShare)} of the firing axis, at least the real battle's minimum ${pct(GAP_SHARE)}`);
  const ui = m.regions.filter((r) => ["new", "cont", "help", "options", "sound"].includes(r.id));
  const hitUi = ui.filter((r) => ships.some((b) => meets(b, r))).map((r) => r.id);
  const lay = m.layout;
  const named = lay ? [["logo band", lay.logo], ["command panel", lay.panel], ["version line", lay.version], ["sound button", lay.sound]] : [];
  const hitNamed = named.filter(([, b]) => b && ships.some((s) => meets(s, b))).map(([n]) => n);
  check(hitUi.length === 0 && hitNamed.length === 0,
    `${at}: nothing of the title over a carrier (buttons ${ui.map((r) => r.id).join(", ")}${lay ? ", the logo band, the command panel, the version line" : "; the logo band and version line not known on this build: skipped"})${hitUi.length || hitNamed.length ? `: ${[...hitUi, ...hitNamed].join(", ")} over a carrier` : ""}`);
  const hs = ui.filter((r) => OLD_BUTTON_H[r.id]).map((r) => ({ id: r.id, h: r.h, want: OLD_BUTTON_H[r.id] * m.oldK }));
  check(m.k >= 1 - 1e-9 && (!lay || lay.logoWhole !== false) && hs.every((b) => b.h >= b.want - 0.01) && hs.some((b) => b.id === "new") && (save === "new" || hs.some((b) => b.id === "cont")),
    `${at}: the title readable: ${r1(m.k)} CSS px per px (at least 1), ${lay ? `logo ${lay.logoWhole === false ? "NOT whole" : "whole"}, ` : ""}buttons ${hs.map((b) => `${b.id} ${r1(b.h)} CSS px (0350e5f ${r1(b.want)})`).join(", ")}`);
}

/** The HOW TO PLAY card and the OPTIONS card on the title: wholly on screen; the help card at least as wide in CSS px as
 *  0350e5f's (min(W - 16, 300) px at the menu scale); the options card's buttons at least as tall as 0350e5f's (19 px at
 *  the menu scale). */
function cardChecks(vname, which, c) {
  const at = `${vname} ${VIEW[vname].size} ${which} card`;
  const find = (id) => c.regions.filter((r) => r.id === id).pop();
  if (which === "help") {
    const r = find("helpcard"), want = Math.min(c.menuW - 16, 300) * c.menuK;
    check(!!r && insideView(r, c) && r.w >= want - 2.01,
      `${at}: on screen (${r ? `${r1(r.x)},${r1(r.y)} ${r1(r.w)}x${r1(r.h)}` : "missing"} CSS px; viewport ${c.vw}x${c.vh}), ${r ? r1(r.w) : "n/a"} CSS px wide (0350e5f ${r1(want)})`);
  } else {
    const card = find("optcard"), bs = ["optdone", "opt-rm", "opt-snd"].map((id) => ({ id, r: find(id) })), want = OLD_CARD_BUTTON_H * c.menuK;
    check(!!card && insideView(card, c) && bs.every((b) => b.r && insideView(b.r, c) && b.r.h >= want - 0.01),
      `${at}: on screen (${card ? `${r1(card.x)},${r1(card.y)} ${r1(card.w)}x${r1(card.h)}` : "missing"} CSS px), buttons ${bs.map((b) => `${b.id} ${b.r ? r1(b.r.h) : "n/a"} CSS px`).join(", ")} (0350e5f ${r1(want)})`);
  }
}

async function main() {
  const { srv, origin } = await pageServer();
  const browser = await chromium.launch();
  log(`# introcheck (${TAG}) on ${DIST} (${origin}); views ${VIEWS.join(", ")}; ${MEASURE ? "measure only" : `checks: drawn gap >= ${MIN_CSS} CSS px and >= ${pct(MIN_SHARE)} of the firing axis, hull gap >= ${pct(GAP_SHARE)}`}`);
  try {
    for (const vname of VIEWS) {
      const V = VIEW[vname];
      const ctx = await browser.newContext(V.ctx);
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      page.on("console", (msg) => { if (msg.type() === "error" || msg.type() === "warning") errors.push(`${msg.type()}: ${msg.text()}`); });
      await page.goto(`${origin}/index.html`);
      await page.waitForFunction(() => !!window.bb && window.bb.screen() === "title", null, { timeout: 15000 });
      await page.evaluate(installKit);
      await page.waitForTimeout(150); // the loop's next frame parks in the held requestAnimationFrame
      // 0350e5f's CSS px per logical px on this view (its title used the default menu scale; io.ts defaultScale)
      const oldK = await page.evaluate(() => {
        const dpr = window.devicePixelRatio || 1, pw = Math.floor(innerWidth * dpr), ph = Math.floor(innerHeight * dpr);
        const portrait = ph > pw * 1.05;
        const s = Math.max(1, Math.floor(Math.min(pw / (portrait ? 200 : 440), ph / (portrait ? 400 : 346))));
        return s / dpr;
      });
      if (ONLY.includes("title")) {
        for (const save of SAVES) {
          const okSave = await page.evaluate((s) => window.__intro.setSave(s), save);
          const len = await page.evaluate(() => window.__intro.titleLength());
          if (len.over < 0) { check(false, `${vname} ${save}: the title's demo battle ended within 240 s`); continue; }
          const startF = 30, midF = Math.round(len.over / 2), endF = len.over + 90;
          const moments = [["start", startF], ["mid", midF], ["end", endF]];
          let cur = -1;
          for (const [moment, f] of moments) {
            const m = cur < 0
              ? await page.evaluate((n) => window.__intro.title(n), f)
              : await page.evaluate((n) => window.__intro.stepTitle(n), f - cur);
            cur = f;
            m.oldK = oldK;
            const hasCont = m.regions.some((r) => r.id === "cont");
            if (save === "save" && (!okSave || !hasCont)) check(false, `${vname} ${save}: a saved run shows CONTINUE on the title`);
            if (save === "new" && hasCont) check(false, `${vname} ${save}: no saved run, no CONTINUE`);
            const row = { kind: "title", view: vname, size: V.size, save, moment, frame: f, battleFrames: len.over, ...m };
            rows.push(row);
            log(`${vname} ${V.size} ${save} ${moment} (frame ${f} of ${len.over} to the KO${m.over ? ", over" : ""}): scale ${m.scale}, ${m.W}x${m.H} px, ${r1(m.k)} CSS px per px; hull gap ${m.hullGap} px = ${r1(m.hullGapCss)} CSS px = ${pct(m.hullShare)}; drawn gap ${m.drawnGap} px = ${r1(m.drawnGapCss)} CSS px = ${pct(m.drawnShare)} of the ${m.portrait ? "height" : "width"} (${m.axis} CSS px)`);
            if (m.over !== (moment === "end")) check(false, `${vname} ${save} ${moment}: the frame is ${m.over ? "after" : "before"} the KO`);
            titleChecks(vname, save, moment, m);
            if (SHOTS) await page.screenshot({ path: join(OUT, `${TAG}-${vname}-${save}-${moment}.png`) });
            if (save === "save" && moment === "mid") {
              // the two cards over the same frame, then closed again (no step: the next moment is unchanged)
              for (const which of ["help", "options"]) {
                const c = await page.evaluate((w) => window.__intro.card(w), which);
                cardChecks(vname, which, c);
                if (SHOTS) await page.screenshot({ path: join(OUT, `${TAG}-${vname}-${which}.png`) });
              }
              await page.evaluate(() => window.__intro.closeCards());
            }
          }
        }
      }
      if (ONLY.includes("battle")) {
        await page.evaluate(() => window.__intro.setSave("new"));
        const m = await page.evaluate(() => window.__intro.battle(10));
        rows.push({ kind: "battle", view: vname, size: V.size, save: "-", moment: "fight+10s", ...m });
        log(`${vname} ${V.size} BATTLE (dusk, 10 s into the fight; phase ${m.phase}): scale ${m.scale}, ${m.W}x${m.H} px, ${r1(m.k)} CSS px per px; hull gap ${m.hullGap} px = ${r1(m.hullGapCss)} CSS px = ${pct(m.hullShare)}; drawn gap ${m.drawnGap} px = ${r1(m.drawnGapCss)} CSS px = ${pct(m.drawnShare)}; both hulls on screen: ${m.hullsCss.every((b) => insideView(b, m))}`);
        if (SHOTS) await page.screenshot({ path: join(OUT, `${TAG}-${vname}-battle.png`) });
      }
      check(errors.length === 0, `${vname}: 0 console errors or warnings${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`);
      await ctx.close();
    }
  } finally {
    await browser.close();
    srv.close();
  }
  const failed = checks.filter((c) => !c.ok);
  log(MEASURE ? `INTRO MEASURED (${rows.length} frames) in ${((Date.now() - t0) / 1000).toFixed(0)} s`
    : `${failed.length ? "INTRO CHECKS FAILED" : "INTRO CHECKS PASSED"}: ${checks.length - failed.length} of ${checks.length} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  writeFileSync(join(OUT, `${NAME}.log`), lines.join("\n") + "\n");
  writeFileSync(join(OUT, `${NAME}.json`), JSON.stringify({ tag: TAG, dist: DIST, minCss: MIN_CSS, minShare: MIN_SHARE, gapShare: GAP_SHARE, checks, rows }, null, 1) + "\n");
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
