// CUSTOM-2b (REQ-BFG-072): the readability test's RENDERED half (the logic half, on palette pairs, is
// tests/styles.readability.test.ts). One check over every style of the three surfaces (the default and the four to earn),
// on the swatches the CUSTOMIZE screen draws (src/screens/customize.ts: styledTiles floors, beltLoop belts, statsPanel
// panels) in the BUILT player page, in headless Chromium at 390x844 DPR 3 (the game's canvas holds one pixel per logical
// px). The page's requestAnimationFrame never fires and Math.random is pinned; the script steps the game itself, as
// scripts/customshots.mjs does. The player profile (beltbattles.profile.v1, written before the page loads) has every
// style open and seen, so no swatch is dimmed by a lock. For each style the drawn pixels are read back off the canvas
// (copied into a scratch canvas; the game's own canvas is never read back) and measured against
// src/render/styleContrast.ts THRESHOLDS with its own WCAG 2 contrast (tools/styleRefs.ts, built here for Node with
// vite build --ssr, so both halves read one source):
//  - tile edges (floors): every drawn seam, a tile's shadow edge pixel beside the next tile's light edge pixel (each
//    tone pair the style can show: the checker's two tones; the default's faction tones), in the FLOOR tab's swatch
//    (outside the belt drawn across it): the weakest seam >= THRESHOLDS.edge;
//  - belt direction (belts): the normal chevron's crest pixels beside the belt's bed pixels, in the BELTS tab's swatch
//    (a 3x3 belt loop) and on the preview carrier's deck in that belt style: >= THRESHOLDS.chevron;
//  - stat numbers (panels): the digits (white "147" in the part-panel strip, bone "132" on the battle plate, bone "147"
//    in the PANELS tab's swatch) beside the panel's fill, in that panel style: >= THRESHOLDS.number;
//  - keyword colours (panels): each of the nine keywords as the strip draws it, beside the panel's fill: >= its
//    keywordMin (today's contrast on navy, capped at 4.5, at least THRESHOLDS.keyword).
// A measurement is the least WCAG contrast over every pair of 4-neighbour pixels (figure, ground) found, from the RGB
// values drawn; a check with no such pair drawn fails (the figure isn't drawn on its ground). One row per style and check:
// the measured value, the palette value the logic half computes, and the threshold. Exit 1 on any miss.
// CUSTOM-3 (REQ-BFG-074) adds the carrier styles, read off CUSTOMIZE's preview carrier on the CARRIER tab for each of the
// four playable heroes (FURNACE with no saved run, then a saved run of WEAVER, FOUNDRY and BASTION), each style worn:
//  - smoke at 50% and fire at 25%: CUSTOMIZE's tooling-only damage probe (CustomizeScreen.probe) draws the battle's own
//    damage particles (render/fx.ts, as arenaReact.ts damageFx spawns them) over the stern band and the bow; the light
//    puff's slate3 and slate4, and the fire's fire4, yellow and white, beside the hull's fill: >= THRESHOLDS.carrierSmoke,
//    carrierFire (today's weakest carrier, WEAVER's verdigris);
//  - the board plate's edge: its ink rim beside the hull's fill (the rim columns and the hull just outside them):
//    >= THRESHOLDS.plateEdge (today's weakest, BASTION's granite);
//  - "yours": the colour the visible hull shows most (the stern band and the bow), CIE76 delta E against the same colour
//    on each faction's default carrier as drawn: >= THRESHOLDS.yours (20; today's closest two defaults are 19.8 apart).
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node scripts/stylecheck.mjs <outDir> [--dist dist]
//        Writes <outDir>/stylecheck.log, stylecheck.json and one PNG per tab.
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { autoFight } from "./scouthook.mjs"; // SCOUT-1 (REQ-BFG-076): the FIGHT step (bb.fight(true): battles skip scouting)

const ROOT = new URL("..", import.meta.url).pathname;
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const OUT = resolve(args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--"))) ?? join(ROOT, "shots", "stylecheck"));
const DIST = resolve(opt("dist", join(ROOT, "dist")));
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
mkdirSync(OUT, { recursive: true });
const lines = [];
const log = (s) => { lines.push(s); console.log(s); };

// ---- the references: the catalogue and the metric, built from src/ (tools/styleRefs.ts)
const REFS = join(OUT, "refs");
execFileSync(process.execPath, [join(ROOT, "node_modules/vite/bin/vite.js"), "build", "--ssr", "tools/styleRefs.ts", "--outDir", REFS, "--emptyOutDir", "--logLevel", "warn"], { cwd: ROOT, stdio: "inherit" });
const mod = await import(pathToFileURL(join(REFS, "styleRefs.js")).href);
const R = mod.THRESHOLDS ? mod : mod.default;
const { BELTS, FLOORS, PANELS, THRESHOLDS: T, contrast, floorTones, keywordMin, KEYWORD_COLOURS, C } = R;
const { CARRIERS, CARRIER_FACTIONS, carrierFill, carrierContrasts, yoursDistance, separation, SMOKE_50, FIRE_25, TODAY_CLOSEST_DEFAULTS } = R; // CUSTOM-3
const KEYWORDS9 = KEYWORD_COLOURS.slice(0, 9); // the nine keywords (the strip draws these; RATE, the bars and tags elsewhere)

/** Every style open and seen (no lock dims a swatch), the defaults worn. */
const ALL = [...FLOORS.slice(1).map((s) => `style:floor.${s.id}`), ...BELTS.slice(1).map((s) => `style:belt.${s.id}`), ...PANELS.slice(1).map((s) => `style:panel.${s.id}`), ...CARRIERS.slice(1).map((s) => `style:carrier.${s.id}`)];
const PROFILE = {
  v: 1, counters: { runs: 99, runsFinished: 9, flawless: 1, duskWins: 99, bestDay: 10, warlordWins: 9, matriarchWins: 9, mostBelts: 9 },
  heroesWon: ["furnace", "weaver", "foundry"], heroesFinished: ["furnace", "weaver", "foundry"], unlocked: ALL,
  chosen: { floor: "plate", belt: "iron", panel: "slate", carrier: "war" }, seen: ALL, folded: [], runNew: null, updatedAt: 1,
};

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

/** In the page: the 4-neighbour pairs (figure px, ground px) inside the windows (logical rects), each colour matched
 *  within `tol` per channel; the pairs' drawn colours as "#rrggbb|#rrggbb" with their counts, and how many figure pixels
 *  have a ground neighbour. Read off a scratch copy of the game's canvas after a fresh frame. */
const measure = (page, windows, fig, ground, tol = 2) => page.evaluate(([wins, f, gr, t]) => {
  const g = window.bb.game;
  g.render();
  const sc = document.createElement("canvas");
  sc.width = g.canvas.width;
  sc.height = g.canvas.height;
  const cx = sc.getContext("2d", { willReadFrequently: true });
  cx.drawImage(g.canvas, 0, 0);
  const W = sc.width, H = sc.height, d = cx.getImageData(0, 0, W, H).data;
  const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const F = rgb(f), G = rgb(gr);
  const is = (k, c) => Math.abs(d[k] - c[0]) <= t && Math.abs(d[k + 1] - c[1]) <= t && Math.abs(d[k + 2] - c[2]) <= t;
  const hex = (k) => `#${[d[k], d[k + 1], d[k + 2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  const pairs = {};
  let figs = 0, any = 0;
  for (const w of wins) {
    for (let y = Math.max(0, w.y); y < Math.min(H, w.y + w.h); y++) {
      for (let x = Math.max(0, w.x); x < Math.min(W, w.x + w.w); x++) {
        const k = 4 * (y * W + x);
        if (!is(k, F)) continue;
        any++;
        let hit = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const q = 4 * (yy * W + xx);
          if (!is(q, G)) continue;
          hit = true;
          const key = `${hex(k)}|${hex(q)}`;
          pairs[key] = (pairs[key] ?? 0) + 1;
        }
        if (hit) figs++;
      }
    }
  }
  return { figs, any, pairs };
}, [windows, fig, ground, tol]);

/** The least contrast over the drawn pairs (null: none drawn). */
const least = (m) => {
  const ks = Object.keys(m.pairs);
  if (!ks.length) return null;
  return Math.min(...ks.map((k) => { const [a, b] = k.split("|"); return contrast(a, b); }));
};
const r2 = (v) => (v === null ? "none" : (Math.round(v * 100) / 100).toFixed(2));
const rows = [];
const row = (surface, id, name, check, value, palette, min, how) => {
  const pass = value !== null && value >= min - 1e-9;
  rows.push({ surface, id, name, check, value, palette, min, pass, how });
  log(`${pass ? "PASS" : "FAIL"}  ${surface.padEnd(5)} ${id.padEnd(9)} ${name.padEnd(16)} ${check.padEnd(22)} measured ${r2(value).padStart(5)} (palette ${r2(palette)}) >= ${r2(min)}  ${how}`);
};

const site = await pageServer();
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
const ctx = await browser.newContext(PHONE);
await autoFight(ctx); // SCOUT-1: battles skip scouting, as before SCOUT-1
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.addInitScript(([prof]) => {
  window.requestAnimationFrame = () => 0;
  let r = 0x2f6b9a1d;
  Math.random = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; };
  localStorage.setItem("beltbattles.name.v1", "STYLES");
  localStorage.setItem("beltbattles.profile.v1", prof);
}, [JSON.stringify(PROFILE)]);
await page.goto(`${site.origin}/index.html`);
await page.waitForFunction(() => !!window.bb && !!window.bb.game);
log(`# stylecheck (CUSTOM-2b, REQ-BFG-072): the rendered half of the readability test, ${DIST} at ${site.origin}, Chromium ${browser.version()}, 390x844 DPR 3; ${new Date().toISOString()}`);
log(`THRESHOLDS ${JSON.stringify(Object.fromEntries(Object.entries(T).map(([k, v]) => [k, Math.round(v * 1000) / 1000])))}`);
const ui = (fn, a) => page.evaluate(([f, x]) => {
  const bb = window.bb, g = bb.game, step = (n) => { for (let i = 0; i < n; i++) g.step(1 / 60); };
  if (f === "open") { bb.open("customize"); step(40); }
  if (f === "tab") { g.screen.state.tapTab(x); step(2); }
  if (f === "row") { g.screen.state.tapRow(x); step(2); }
  g.render();
  const c = bb.profile().customize;
  return { screen: bb.screen(), scale: g.view.scale, W: g.W, H: g.H, tab: c?.tab, pick: c?.pick, worn: c?.worn, preview: c?.preview, locked: c?.locked, L: c?.L, rows: c?.rows, ship: c?.ship, plate: c?.plate };
}, [fn, a]);
const swatch = (r) => { const side = Math.min(r.h - 6, 40); return { x: r.x + 3, y: r.y + 3, w: side, h: side }; };

let s = await ui("open");
log(`CUSTOMIZE ${s.W}x${s.H} at x${s.scale}; worn ${JSON.stringify(s.worn)}; rows ${s.L.rows.map((r) => `${r.x},${r.y} ${r.w}x${r.h}`).join("; ")}`);
if (s.screen !== "customize") throw new Error(`not on CUSTOMIZE (${s.screen})`);

// ---- floors: tile edges in the FLOOR tab's swatches (styledTiles 4x4 from the swatch's corner less 4 px, 12 px tiles;
// the worn belt drawn across at the swatch's y + 20 to + 31 is left out)
/** The drawn seams of floor row `i` on the open FLOOR tab: every (shadow edge, light edge) tone pair the style can show
 *  (the default: every faction's, as the logic half's floorTones), measured where it is drawn. */
async function seams(s, i) {
  const f = FLOORS[i], sw = swatch(s.L.rows[i]);
  if (s.rows[i].id !== f.id || !s.rows[i].open) throw new Error(`floor row ${i}: ${JSON.stringify(s.rows[i])}`);
  const wins = [{ x: sw.x, y: sw.y, w: sw.w, h: 20 }, { x: sw.x, y: sw.y + 32, w: sw.w, h: sw.h - 32 }];
  const tones = floorTones(f), done = new Set(), seen = [];
  let best = null, n = 0, pal = Infinity;
  for (const a of tones) for (const b of tones) {
    pal = Math.min(pal, contrast(a[0], b[2]));
    const key = `${a[0]} by ${b[2]}`;
    if (a[0] === b[2] || done.has(key)) continue;
    done.add(key);
    const m = await measure(page, wins, a[0], b[2]);
    const v = least(m);
    if (v === null) continue;
    n += m.figs;
    seen.push(`${key} ${r2(v)}`);
    best = best === null ? v : Math.min(best, v);
  }
  return { best, n, pal, seen };
}
s = await ui("tab", "floor");
const plate = [], others = [];
for (let i = 0; i < FLOORS.length; i++) {
  const m = await seams(s, i);
  if (i === 0) plate.push({ hero: "furnace", ...m });
  else others.push([FLOORS[i], m]);
}
await page.screenshot({ path: join(OUT, "stylecheck-floor.png") });
// the default floor is the hero's faction deck: the swatch shows the preview's hero (the saved run's; FURNACE without
// one), so a saved run of each other playable hero shows the other three factions' seams
for (const hero of ["weaver", "foundry", "bastion"]) {
  await page.evaluate((h) => {
    const bb = window.bb, g = bb.game, step = (n) => { for (let i = 0; i < n; i++) g.step(1 / 60); };
    bb.openDawn({ hero: h, day: 1, seed: 12345 });
    step(60);
    if (g.screen.touched) g.screen.touched(); // the build screen saves the run (CONTINUE's), as a tap would
  }, hero);
  s = await ui("open");
  s = await ui("tab", "floor");
  plate.push({ hero, ...(await seams(s, 0)) });
}
{
  const f = FLOORS[0], found = plate.filter((p) => p.best !== null);
  const best = found.length === plate.length ? Math.min(...found.map((p) => p.best)) : null;
  row("floor", f.id, f.name, "tile edges (seam)", best, plate[0].pal, T.edge, `the four playable heroes' factions: ${plate.map((p) => `${p.hero} ${r2(p.best)} (${p.n} px; ${p.seen.join(", ")})`).join("; ")}`);
}
for (const [f, m] of others) row("floor", f.id, f.name, "tile edges (seam)", m.best, m.pal, T.edge, `${m.n} shadow-edge px beside a light edge (tone pairs drawn: ${m.seen.join(", ")})`);
// back to no saved run: the preview carrier is FURNACE's starting deck again (one belt) for the belts' deck check
await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("beltbattles.run.")) localStorage.removeItem(k); });
s = await ui("open");

// ---- belts: the normal chevron's crest beside the bed, in the BELTS tab's swatch (a 3x3 loop, 36 px, centred in the
// swatch) and on the preview carrier's deck (the hull box) in that belt style
s = await ui("tab", "belt");
for (let i = 0; i < BELTS.length; i++) {
  const b = BELTS[i], sw = swatch(s.L.rows[i]);
  const loop = { x: sw.x + Math.floor((sw.w - 36) / 2), y: sw.y + Math.floor((sw.h - 36) / 2), w: 36, h: 36 };
  const m = await measure(page, [loop], b.chev[1], b.bed);
  const pal = contrast(b.chev[1], b.bed);
  row("belt", b.id, b.name, "belt direction (swatch)", least(m), pal, T.chevron, `${m.figs} crest px beside the bed (${m.any} crest px drawn)`);
  s = await ui("row", b.id);
  const d = await measure(page, [s.L.hull], b.chev[1], b.bed);
  row("belt", b.id, b.name, "belt direction (deck)", least(d), pal, T.chevron, `on the preview carrier's deck (previewing ${s.preview.belt}): ${d.figs} crest px beside the bed`);
}
s = await ui("row", "iron");
await page.screenshot({ path: join(OUT, "stylecheck-belt.png") });

// ---- panels: the stat digits and the nine keyword colours beside the fill, in the preview's battle plate and part-panel
// strip (drawn in the previewed panel style) and the PANELS tab's swatch
s = await ui("tab", "panel");
for (let i = 0; i < PANELS.length; i++) {
  const p = PANELS[i], sw = swatch(s.L.rows[i]);
  s = await ui("row", p.id);
  const K = s.L.keys, P = s.L.plate;
  const strip = { x: K.x + 4, y: K.y + 4, w: K.w - 8, h: K.h - 8 }, plate = { x: P.x + 3, y: P.y + 2, w: P.w - 6, h: P.h - 4 };
  const nums = [
    ["white 147, strip", strip, C.white], ["bone 132, plate", plate, C.bone], ["bone 147, swatch", { x: sw.x + 4, y: sw.y + 4, w: sw.w - 4, h: 10 }, C.bone],
  ];
  const parts = [], vals = [];
  for (const [what, w, col] of nums) {
    const m = await measure(page, [w], col, p.fill);
    const v = least(m);
    parts.push(`${what} ${r2(v)} (${m.figs} px)`);
    vals.push(v);
  }
  const nv = vals.includes(null) ? null : Math.min(...vals); // one set of digits not drawn on the fill: the check fails
  const npal = Math.min(contrast(C.white, p.fill), contrast(C.bone, p.fill));
  row("panel", p.id, p.name, "stat numbers", nv, npal, T.number, parts.join("; "));
  for (const [kw, col] of KEYWORDS9) {
    const m = await measure(page, [strip], col, p.fill);
    row("panel", p.id, p.name, `keyword ${kw}`, least(m), contrast(col, p.fill), keywordMin(col), `${m.figs} px of ${kw} (${col}) beside the fill ${p.fill}`);
  }
  if (p.id === "plum") await page.screenshot({ path: join(OUT, "stylecheck-panel.png") });
}

// ---- CUSTOM-3 (REQ-BFG-074): carriers, on the CARRIER tab's preview carrier, per playable hero
/** The most common colour in the windows (logical rects), its share and the pixels counted. */
const modeColour = (page, wins) => page.evaluate((ws) => {
  const g = window.bb.game;
  g.render();
  const sc = document.createElement("canvas");
  sc.width = g.canvas.width;
  sc.height = g.canvas.height;
  const cx = sc.getContext("2d", { willReadFrequently: true });
  cx.drawImage(g.canvas, 0, 0);
  const d = cx.getImageData(0, 0, sc.width, sc.height).data, counts = {};
  let n = 0;
  for (const w of ws) for (let y = w.y; y < w.y + w.h; y++) for (let x = w.x; x < w.x + w.w; x++) {
    const k = 4 * (y * sc.width + x);
    const hex = `#${[d[k], d[k + 1], d[k + 2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    counts[hex] = (counts[hex] ?? 0) + 1;
    n++;
  }
  const [hex, c] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return { hex, share: c / n, n };
}, wins);
/** The visible ship (logical rects from the ship's origin): the stern band (ship x 0..21, y 16..135: hull all through)
 *  and the bow (ship x 154..169, y 56..95). */
const shipWins = (s) => [{ x: s.ship.x, y: s.ship.y + 16, w: 22, h: 120 }, { x: s.ship.x + 154, y: s.ship.y + 56, w: 16, h: 40 }];
/** The plate's left and right rim columns and the hull's column just outside each. */
const rimWins = (s) => [{ x: s.plate.x - 1, y: s.plate.y, w: 2, h: s.plate.h }, { x: s.plate.x + s.plate.w - 1, y: s.plate.y, w: 2, h: s.plate.h }];
const leastOf = async (wins, figs, ground) => {
  let v = null, figsN = 0;
  for (const f of figs) {
    const m = await measure(page, wins, f, ground);
    const x = least(m);
    figsN += m.figs;
    if (x !== null) v = v === null ? x : Math.min(v, x);
  }
  return { v, n: figsN };
};
const HERO4 = [["furnace", "orc"], ["weaver", "elf"], ["foundry", "human"], ["bastion", "dwarf"]];
const cm = {}; // cm[style][hero] = { fill, mode, share, edge, smoke, fire, nEdge, nSmoke, nFire }
await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("beltbattles.run.")) localStorage.removeItem(k); });
for (const [hero, faction] of HERO4) {
  if (hero !== "furnace") {
    await page.evaluate((h) => {
      const bb = window.bb, g = bb.game, step = (n) => { for (let i = 0; i < n; i++) g.step(1 / 60); };
      bb.openDawn({ hero: h, day: 1, seed: 12345 });
      step(60);
      if (g.screen.touched) g.screen.touched(); // the build screen saves the run (CONTINUE's), as a tap would
    }, hero);
  }
  s = await ui("open");
  s = await ui("tab", "carrier");
  if (s.tab !== "carrier" || s.rows.length !== 5) throw new Error(`no CARRIER tab: ${JSON.stringify(s.rows)}`);
  for (const st of CARRIERS) {
    s = await ui("row", st.id);
    if (s.worn.carrier !== st.id) throw new Error(`${hero}: ${st.id} not worn (${JSON.stringify(s.worn)})`);
    const fill = carrierFill(st, faction);
    const e = await leastOf(rimWins(s), [C.ink], fill);
    const md = await modeColour(page, shipWins(s));
    await page.evaluate(() => { window.bb.game.screen.probe = 50; });
    const sm = await leastOf(shipWins(s), SMOKE_50, fill);
    if (hero === "furnace" && st.id === "storm") await page.screenshot({ path: join(OUT, "stylecheck-carrier-smoke50.png") });
    await page.evaluate(() => { window.bb.game.screen.probe = 25; });
    const fi = await leastOf(shipWins(s), FIRE_25, fill);
    if (hero === "furnace" && st.id === "storm") await page.screenshot({ path: join(OUT, "stylecheck-carrier-fire25.png") });
    await page.evaluate(() => { window.bb.game.screen.probe = 0; });
    (cm[st.id] ??= {})[hero] = { fill, mode: md.hex, share: md.share, edge: e.v, smoke: sm.v, fire: fi.v, nEdge: e.n, nSmoke: sm.n, nFire: fi.n };
  }
  if (hero === "furnace") { s = await ui("row", "admiral"); await page.screenshot({ path: join(OUT, "stylecheck-carrier.png") }); }
}
const defaults = HERO4.map(([h]) => cm.war[h].mode); // each faction's default carrier as drawn
let closest = Infinity;
for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) closest = Math.min(closest, separation(defaults[i], defaults[j]));
log(`carrier: the four default carriers' drawn fills ${HERO4.map(([h], i) => `${h} ${defaults[i]}`).join(", ")}; closest pair delta E ${r2(closest)} (palette ${r2(TODAY_CLOSEST_DEFAULTS)})`);
const per = (st, k) => HERO4.map(([h]) => `${h} ${r2(cm[st.id][h][k])}`).join(", ");
const lowest = (st, k) => { const v = HERO4.map(([h]) => cm[st.id][h][k]); return v.includes(null) ? null : Math.min(...v); };
for (const st of CARRIERS) {
  const pal = CARRIER_FACTIONS.map((f) => carrierContrasts(carrierFill(st, f)));
  row("carrier", st.id, st.name, "smoke at 50% (probe)", lowest(st, "smoke"), Math.min(...pal.map((x) => x.smoke)), T.carrierSmoke, `slate3/slate4 beside the fill: ${per(st, "smoke")} (${HERO4.map(([h]) => cm[st.id][h].nSmoke).join("/")} px)`);
  row("carrier", st.id, st.name, "fire at 25% (probe)", lowest(st, "fire"), Math.min(...pal.map((x) => x.fire)), T.carrierFire, `fire4/yellow/white beside the fill: ${per(st, "fire")} (${HERO4.map(([h]) => cm[st.id][h].nFire).join("/")} px)`);
  row("carrier", st.id, st.name, "plate edge", lowest(st, "edge"), Math.min(...pal.map((x) => x.edge)), T.plateEdge, `the plate's ink rim beside the fill: ${per(st, "edge")} (${HERO4.map(([h]) => cm[st.id][h].nEdge).join("/")} px)`);
  if (st.paint) {
    const modes = HERO4.map(([h]) => cm[st.id][h]);
    const bad = modes.filter((m) => m.mode.toLowerCase() !== m.fill.toLowerCase()); // the canvas reads lower-case hex
    let d = Infinity, near = "";
    for (const m of modes) defaults.forEach((dm, i) => { const x = separation(m.mode, dm); if (x < d) { d = x; near = HERO4[i][0]; } });
    row("carrier", st.id, st.name, "yours (delta E)", bad.length ? null : d, yoursDistance(st).value, T.yours, `the visible hull's most common colour ${modes[0].mode} (${Math.round(100 * modes[0].share)}% of FURNACE's stern band and bow; the fill on all four heroes) against each faction's default as drawn; nearest ${near}${bad.length ? `; MODE IS NOT THE FILL for ${bad.length}` : ""}`);
  }
}

// ---- FIELD-1 (REQ-BFG-075): the battle settings, on the battle as drawn at WIDE (the world layer: one px per art px).
// For each setting (bb.scene), FURNACE's day-5 dusk (seed 7) stepped into the fight, the world layer read twice: as drawn
// (A), and the same frame with both carriers hidden and the effects left out (B). A pixel is the backdrop where A and B
// agree. Measured (a check with nothing drawn to measure fails):
//  - plate edge: the board plates' ink rim beside the backdrop just outside it (WCAG; the least over the 4-neighbour
//    pairs, in the five battles);
//  - hull: the player's hull (the most common colour of its stern band as drawn) against each backdrop colour within
//    6 px of the hull (CIE76 delta E, the least over colours covering at least 2% of that ring), in each of the five
//    carrier styles on FURNACE and in WAR COLOURS on FURNACE, WEAVER, FOUNDRY and BASTION (each faction's default: the
//    foes);
//  - smoke at 50% and fire at 25%: the player's hull set below 50% and below 25% (this page only, as customshots' damage
//    stills do), stepped 1 s; the particles alone (the frame with the carriers hidden and the particles drawn, against
//    B): each smoke colour (slate3, slate4) or fire colour (fire4, yellow, white) they draw against each backdrop colour
//    covering at least 2% of the backdrop within 6 px of them (WCAG; the least).
// The thresholds are today's weakest over the three seas: the lower of the seas as measured here and the seas' palette
// pairs (src/render/sceneContrast.ts SCENE_THRESHOLDS; the logic half is tests/styles.readability.test.ts), since where
// one frame's particles land on today's water varies. The water settings' rows meet it by construction (they set it).
const { SCENE_THRESHOLDS: ST, sceneChecks, SCENE_IDS: SIDS, SCENE_NAME } = R;
const sceneRead = (page, args) => page.evaluate(([scene, hero, below]) => {
  const bb = window.bb, g = bb.game, step = (n) => { for (let i = 0; i < n; i++) g.step(1 / 60); };
  bb.scene(scene);
  bb.openDusk({ hero, day: 5, seed: 7 }, []);
  step(40);
  for (let i = 0; i < 60 * 60; i++) {
    step(1);
    if (i % 6) continue;
    const m = bb.motion();
    if (m.phase === "fight" && m.t > 6 && g.screen.arena.b.projectiles.length >= 1) break;
  }
  const s = g.screen, a = s.arena, mo = s.motion;
  if (below) { const h = a.b.sides[0].hull; h.hp = Math.floor(h.max * below); step(60); }
  const read = () => {
    g.render();
    const L = mo.layer, sc = document.createElement("canvas");
    sc.width = L.width; sc.height = L.height;
    const cx = sc.getContext("2d", { willReadFrequently: true });
    cx.drawImage(L, 0, 0);
    return cx.getImageData(0, 0, sc.width, sc.height).data;
  };
  const A = read();
  const show = [...a.show], fx = a.fx, keep = [fx.draw, fx.drawPops, fx.drawDecals];
  a.show = [false, false];
  fx.drawPops = fx.drawDecals = () => {}; // the damage numbers and decals left out: the particles alone
  const Cfx = below ? read() : null; // the carriers hidden, the particles drawn: the damage particles over the backdrop
  fx.draw = () => {};
  const B = read();
  a.show = show; [fx.draw, fx.drawPops, fx.drawDecals] = keep;
  const W = mo.layer.width, H = mo.layer.height;
  const hex = (d, k) => `#${[d[k], d[k + 1], d[k + 2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  const same = (k) => A[k] === B[k] && A[k + 1] === B[k + 1] && A[k + 2] === B[k + 2];
  const cam = mo.cam;
  // each board's plate rect in layer px (portrait plates: the hull box cut to x 13..142; sway 0: pure translations)
  const plates = [0, 1].map((side) => {
    const f = a.drawn[side], aff = mo.aff[side];
    const x = f.dx - 18 + 13, y = f.facing === 0 ? f.dy - 14 : f.dy - 6;
    return { x: Math.round(cam.a * (x + aff.e) + cam.e), y: Math.round(cam.d * (y + aff.f) + cam.f), w: Math.round(130 * cam.a), h: Math.round(140 * cam.d) };
  });
  const pairs = {}; // "fig|ground": count
  const add = (k, q) => { const key = `${hex(A, k)}|${hex(A, q)}`; pairs[key] = (pairs[key] ?? 0) + 1; };
  const rim = {};
  for (const p of plates) {
    for (let x = p.x; x < p.x + p.w; x++) for (const [y, oy] of [[p.y, p.y - 1], [p.y + p.h - 1, p.y + p.h]]) {
      if (oy < 0 || oy >= H || x < 0 || x >= W) continue;
      const k = 4 * (y * W + x), q = 4 * (oy * W + x);
      if (!same(q)) continue;
      const key = `${hex(A, k)}|${hex(A, q)}`; rim[key] = (rim[key] ?? 0) + 1;
    }
    for (let y = p.y; y < p.y + p.h; y++) for (const [x, ox] of [[p.x, p.x - 1], [p.x + p.w - 1, p.x + p.w]]) {
      if (ox < 0 || ox >= W || y < 0 || y >= H) continue;
      const k = 4 * (y * W + x), q = 4 * (y * W + ox);
      if (!same(q)) continue;
      const key = `${hex(A, k)}|${hex(A, q)}`; rim[key] = (rim[key] ?? 0) + 1;
    }
  }
  // the player's ship: its stern band's most common colour as drawn; the backdrop within 6 px of the ship's outline
  const pv = [cam.a * mo.pivot[0][0] + cam.e, cam.d * mo.pivot[0][1] + cam.f];
  const counts = {};
  for (let y = Math.round(pv[1] - 60); y < Math.round(pv[1] + 60); y++) for (let x = Math.round(pv[0] - 86); x < Math.round(pv[0] - 68); x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const k = 4 * (y * W + x);
    if (same(k)) continue;
    const c = hex(A, k); counts[c] = (counts[c] ?? 0) + 1;
  }
  const mode = Object.entries(counts).sort((p, q) => q[1] - p[1])[0] ?? null;
  const ring = {};
  let ringN = 0;
  for (let y = Math.round(pv[1] - 100); y < Math.round(pv[1] + 100); y++) for (let x = Math.round(pv[0] - 110); x < Math.round(pv[0] + 110); x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const k = 4 * (y * W + x);
    if (!same(k)) continue;
    let near = false;
    for (let dy = -6; dy <= 6 && !near; dy += 2) for (let dx = -6; dx <= 6 && !near; dx += 2) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const q = 4 * (yy * W + xx);
      if (!same(q) && Math.abs(xx - pv[0]) < 104 && Math.abs(yy - pv[1]) < 80) near = true;
    }
    if (!near) continue;
    const c = hex(A, k); ring[c] = (ring[c] ?? 0) + 1; ringN++;
  }
  // the damage particles (with `below`): the pixels the effects add (Cfx against B, both with the carriers hidden) beside
  // the backdrop's own pixels
  const fxPairs = {}, fxCols = {}, fxRing = {};
  let fxRingN = 0;
  if (Cfx) {
    const fxSame = (k) => Cfx[k] === B[k] && Cfx[k + 1] === B[k + 1] && Cfx[k + 2] === B[k + 2];
    const mark = new Uint8Array(W * H);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const k = 4 * (y * W + x);
      if (fxSame(k)) continue;
      const c = hex(Cfx, k); fxCols[c] = (fxCols[c] ?? 0) + 1;
      // the backdrop around the particles (what they are seen against): within 6 px, from the frame without them
      for (let yy = Math.max(0, y - 6); yy <= Math.min(H - 1, y + 6); yy++) for (let xx = Math.max(0, x - 6); xx <= Math.min(W - 1, x + 6); xx++) mark[yy * W + xx] = 1;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const q = 4 * ((y + dy) * W + x + dx);
        if (!fxSame(q)) continue;
        const key = `${hex(Cfx, k)}|${hex(Cfx, q)}`; fxPairs[key] = (fxPairs[key] ?? 0) + 1;
      }
    }
    for (let i = 0; i < W * H; i++) {
      if (!mark[i] || !fxSame(4 * i) || !same(4 * i)) continue; // the backdrop's own pixel (no carrier, no particle)
      const c = hex(B, 4 * i); fxRing[c] = (fxRing[c] ?? 0) + 1; fxRingN++;
    }
  }
  void add; void pairs;
  return { scene: mo.kind, zoom: cam.a, layer: [W, H], plates, rim, mode, ring, ringN, fxPairs, fxCols, fxRing, fxRingN, wears: bb.profile().wears?.carrier ?? null, hp: a.b.sides[0].hull.hp / a.b.sides[0].hull.max };
}, args);
const wear = async (id) => { await ui("open"); await ui("tab", "carrier"); const s = await ui("row", id); if (s.worn.carrier !== id) throw new Error(`${id} not worn`); };
const near = (a, b, t = 2) => { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const x = p(a), y = p(b); return x.every((v, i) => Math.abs(v - y[i]) <= t); };
const leastPairs = (obj, figs) => {
  let v = null, n = 0;
  for (const [key, cnt] of Object.entries(obj)) {
    const [f, gr] = key.split("|");
    if (figs && !figs.some((c) => near(f, c.toLowerCase()))) continue;
    n += cnt;
    const x = contrast(f, gr);
    v = v === null ? x : Math.min(v, x);
  }
  return { v, n };
};
/** The damage effects against the backdrop: each of `figs` the particles draw (at least 5 px of it) against each backdrop
 *  colour covering at least 2% of the area around them (WCAG; the least), and the count of particle px of those colours. */
const fxVs = (r, figs) => {
  const drawn = Object.entries(r.fxCols).filter(([c, n]) => n >= 5 && figs.some((f) => near(c, f.toLowerCase()))).map(([c]) => c);
  const cols = Object.entries(r.fxRing).filter(([, n]) => n >= 0.02 * r.fxRingN).map(([c]) => c);
  const px = Object.entries(r.fxCols).filter(([c]) => figs.some((f) => near(c, f.toLowerCase()))).reduce((s, [, n]) => s + n, 0);
  return { v: drawn.length && cols.length ? Math.min(...drawn.flatMap((d) => cols.map((c) => contrast(d, c)))) : null, n: px, drawn, cols };
};
const hullVs = (r) => {
  if (!r.mode) return { v: null, cols: [] };
  const cols = Object.entries(r.ring).filter(([, n]) => n >= 0.02 * r.ringN).map(([c]) => c);
  return { v: cols.length ? Math.min(...cols.map((c) => separation(r.mode[0], c))) : null, cols };
};
log(`FIELD-1 SCENE THRESHOLDS (the logic half's, on the ground colours) ${JSON.stringify(Object.fromEntries(Object.entries(ST).map(([k, v]) => [k, Math.round(v * 1000) / 1000])))}`);
await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("beltbattles.run.")) localStorage.removeItem(k); });
// measure every setting first: each check's rendered value, then the rendered thresholds from today's three seas
const SM = {}; // SM[id] = { edge, edgeN, styles: {id: {v, how}}, foes: {faction: {v, how}}, smoke, fire }
for (const id of SIDS) {
  const m = (SM[id] = { edge: null, edgeN: 0, styles: {}, foes: {} });
  for (const st of CARRIERS) {
    await wear(st.id);
    const r = await sceneRead(page, [id, "furnace", 0]);
    if (r.scene !== id) throw new Error(`setting ${r.scene}, not ${id}`);
    const e = leastPairs(r.rim, [C.ink]);
    if (e.v !== null) { m.edge = m.edge === null ? e.v : Math.min(m.edge, e.v); m.edgeN += e.n; }
    const h = hullVs(r);
    m.styles[st.id] = { v: h.v, how: `the stern band's ${r.mode ? r.mode[0] : "none"} against the backdrop within 6 px (${h.cols.join(" ")}; ${r.ringN} px)` };
    if (st.id === "war") await page.screenshot({ path: join(OUT, `stylecheck-scene-${id}.png`) });
  }
  await wear("war");
  for (const [hero, faction] of HERO4) {
    const r = await sceneRead(page, [id, hero, 0]);
    const h = hullVs(r);
    m.foes[faction] = { v: h.v, how: `${hero}'s default hull ${r.mode ? r.mode[0] : "none"} against the backdrop within 6 px (${h.cols.join(" ")})` };
  }
  m.smoke = fxVs(await sceneRead(page, [id, "furnace", 0.45]), SMOKE_50);
  m.fire = fxVs(await sceneRead(page, [id, "furnace", 0.2]), FIRE_25);
}
await page.evaluate(() => window.bb.scene(null));
// the thresholds: today's weakest over the three seas (as CUSTOM-3's: today's default sets the bar), the lower of the
// seas as drawn here and the seas' palette pairs (the logic half): where the particles land in one frame varies, the
// palette is the worst the sea's ground can show
const SEAS3 = ["calm", "storm", "ember"];
const minOf = (xs) => (xs.some((x) => x === null || x === undefined) ? null : Math.min(...xs));
const drawnT = {
  edge: minOf(SEAS3.map((s) => SM[s].edge)),
  hull: minOf(SEAS3.flatMap((s) => HERO4.map(([, f]) => SM[s].foes[f].v))),
  smoke: minOf(SEAS3.map((s) => SM[s].smoke.v)),
  fire: minOf(SEAS3.map((s) => SM[s].fire.v)),
};
const RT = Object.fromEntries(Object.entries(drawnT).map(([k, v]) => [k, v === null ? null : Math.min(v, ST[k])]));
log(`FIELD-1 THRESHOLDS: today's seas as drawn ${JSON.stringify(Object.fromEntries(Object.entries(drawnT).map(([k, v]) => [k, v === null ? null : Math.round(v * 1000) / 1000])))}; as palette pairs ${JSON.stringify(Object.fromEntries(Object.entries(ST).map(([k, v]) => [k, Math.round(v * 1000) / 1000])))}; the bar (the lower) ${JSON.stringify(Object.fromEntries(Object.entries(RT).map(([k, v]) => [k, v === null ? null : Math.round(v * 1000) / 1000])))}`);
for (const id of SIDS) {
  const pal = sceneChecks(id), nm = SCENE_NAME[id], m = SM[id];
  row("scene", id, nm, "plate edge", m.edge, pal.edge, RT.edge ?? Infinity, `the plates' ink rim beside the backdrop just outside (${m.edgeN} pairs, five battles)`);
  for (const st of CARRIERS) row("scene", id, nm, `hull ${st.name}`, m.styles[st.id].v, pal.styles[st.id], RT.hull ?? Infinity, m.styles[st.id].how);
  for (const [, faction] of HERO4) row("scene", id, nm, `foe ${faction} default`, m.foes[faction].v, pal.factions[faction], RT.hull ?? Infinity, m.foes[faction].how);
  row("scene", id, nm, "smoke at 50%", m.smoke.v, pal.smoke, RT.smoke ?? Infinity, `the damage particles (hull at 45%) ${m.smoke.drawn.join(" ")} (${m.smoke.n} px) against the backdrop around them (${m.smoke.cols.join(" ")})`);
  row("scene", id, nm, "fire at 25%", m.fire.v, pal.fire, RT.fire ?? Infinity, `the damage particles (hull at 20%) ${m.fire.drawn.join(" ")} (${m.fire.n} px) against the backdrop around them (${m.fire.cols.join(" ")})`);
}

await browser.close();
site.srv.close();
const failed = rows.filter((r) => !r.pass);
log("");
log(`console errors: ${errors.length}${errors.length ? ` (${errors.join(" | ")})` : ""}`);
log(failed.length ? `STYLECHECK FAILED: ${failed.length} of ${rows.length} rows` : `STYLECHECK PASSED: ${rows.length} of ${rows.length} rows (${FLOORS.length + BELTS.length + PANELS.length + CARRIERS.length} styles)`);
writeFileSync(join(OUT, "stylecheck.log"), lines.join("\n") + "\n");
writeFileSync(join(OUT, "stylecheck.json"), JSON.stringify({ thresholds: T, rows, errors }, null, 1) + "\n");
process.exit(failed.length || errors.length ? 1 : 0);
