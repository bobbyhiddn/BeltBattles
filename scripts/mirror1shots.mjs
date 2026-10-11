// MIRROR-1 (REQ-BFG-093; tooling, test only: nothing ships): the operator's mirror test in the real page. Both carriers
// are the same hero with the same hull and the same kit, kept as empty as possible (bb.openMirror: the hero's starting
// deck with its belts cut, nothing fires), so only the dark wind moves a hull. The offline single-file page
// (scripts/inline.mjs) is loaded from file:// with its clock held as scripts/motionshots.mjs holds it (the page's
// requestAnimationFrame never fires, Math.random pinned; the script steps the game itself, bb.game.step(1/60)), so every
// frame repeats exactly. The replay is played to each named second (--at, default 50 and 68, the second before the end)
// plus --after s (default 0.3: that second's wind numbers are in their colour, steady), then on to the end.
// WIND-2 (REQ-BFG-093): the mirror is the check of the wind's fairness on screen. What changed from MIRROR-1's script:
//  - the wind's numbers are found by `p.wind` (WIND-1's flag: Fx.windPop; ArenaMotion.drawWindPops draws them in
//    C.windHit), not by a pinned colour (0.9.8's C.plum4, "#8A5CB0", kept only as the fallback for a page without the
//    flag); each number's pixels are those inside its drawn box (ArenaMotion.windDrawn), and the check compares the two
//    sides (equal pixel counts AND equal mean colour) instead of pinning a colour;
//  - views phone 390x844 @3, p402 402x690 @3, l844 844x390 @3 and desk 1920x1080 (--views), cameras WIDE and CLOSE
//    (--cams; bb.camera cuts), Reduce Motion runs (--reduced <views>), file names <tag>-<at>s-<view>[-rm]-<cam>.png;
//  - call 1's measure: the band redrawn alone in a marker colour (ArenaMotion.windMark, display only) with every number
//    blanked, and each board's on-screen pixels (its hull box, L.hulls[side], through its board's map and the camera, on
//    the canvas and outside the HUD: both plates, the bar and every tap region) counted under it: the share per side;
//  - call 2's measure (--nums <views>, at CLOSE): a hit, a big hit, a BURN tick, a heal, a plating BLOCKED and a SHIELD
//    BLOCKED number put on each board (display only: Fx.popup with the board as anchor, 0.3 s old; removed after), each
//    number's pixels (the frame with the numbers against the frame without them, the wind's level at 0), and how many
//    of them the storm changes (the frame against the same frame with the wind's level at 0): 0 is "seen as drawn";
//    their pixel boxes at --pre s (before the wind) for the size check;
//  - the replay's BACK (its tap region) against both plates and their hull numbers, and the hull numbers' white pixels;
//  - the frame cost (--cost <view>, at the last moment): g.render() timed with the wind on and with its level at 0,
//    and with the six numbers a board on top;
//  - the end: the bar's clock and the card's clock as drawn (ReplayScreen.clockText and cardClock where the page keeps
//    them; on an older page, computed with that page's formulas: Math.floor(b.t) and Math.floor(b.t + 1e-9)).
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node scripts/mirror1shots.mjs <outDir> [--dist <build dir> | --page <page.html>]
//          [--tag after] [--views phone,desk] [--cams wide,close] [--at 50,68] [--reduced phone,desk] [--nums desk,l844]
//          [--pre 10] [--cost desk] [--hero furnace] [--seed 7] [--day 1] [--after 0.3]
// With --dist it inlines that build into --page first (scripts/inline.mjs); with --page alone it loads that page.
// Writes <outDir>/<tag>-*.png, <tag>-mirror.log and <tag>-mirror.json; exits non-zero on a console error or a failed check.

import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { inlineBuild } from "./inline.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const pos = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--")));
const OUT = resolve(pos[0] ?? join(ROOT, "shots-mirror1"));
const DIST = opt("dist", "");
const PAGE = resolve(opt("page", join(process.env.TMPDIR ?? ROOT, "bb-mirror1.html")));
const TAG = opt("tag", "mirror");
const HERO = opt("hero", "furnace"), SEED = Number(opt("seed", "7")), DAY = Number(opt("day", "1"));
const AFTER = Number(opt("after", "0.3"));
const AT = opt("at", "50,68").split(",").filter(Boolean).map(Number);
const VIEW_NAMES = opt("views", "phone,desk").split(",").filter(Boolean);
const CAMS = opt("cams", "wide").split(",").filter(Boolean);
const REDUCED = opt("reduced", "").split(",").filter(Boolean);
const NUMS = opt("nums", "").split(",").filter(Boolean);
const PRE = Number(opt("pre", "10"));
const COST = opt("cost", "");
const ALL_VIEWS = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  p402: { viewport: { width: 402, height: 690 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  l844: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  desk: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
};
const OLD_WIND = "#8A5CB0"; // 0.9.8's wind number (C.plum4): only for a page without WIND-1's p.wind flag
const MARK = "#00FF00", BAND = "#FF00FF";
/** Call 2's numbers (arenaReact's colours: a hit white, a big hit yellow x2, BURN fire3, a heal green, plating's BLOCKED
 *  plate3, SHIELD's BLOCKED rune3), each at a fraction of its board's hull box (rest px). */
const KINDS = [
  { kind: "hit", text: "40", colour: "#E9F1E5", big: false, at: [0.25, 0.2] },
  { kind: "big hit", text: "120", colour: "#F6CF48", big: true, at: [0.75, 0.2] },
  { kind: "BURN", text: "30", colour: "#FF9B2A", big: false, at: [0.25, 0.5] },
  { kind: "heal", text: "+20", colour: "#59DF67", big: false, at: [0.75, 0.5] },
  { kind: "BLOCKED n", text: "BLOCKED 40", colour: "#C6D0EA", big: false, at: [0.25, 0.8] },
  { kind: "BLOCKED", text: "BLOCKED", colour: "#9DB0FF", big: false, at: [0.75, 0.8] },
];
const lines = [];
const log = (s) => { lines.push(s); console.log(s); };

/** motionshots.mjs FREEZE: the page's own loop never runs and Math.random is pinned; the script steps the game. */
const FREEZE = () => {
  window.requestAnimationFrame = () => 0;
  let s = 0x2f6b9a1d;
  Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
};

/** In-page: open the mirror replay (Reduce Motion as asked) and let the wipe finish. */
function openInPage({ hero, seed, day, reduced }) {
  const bb = window.bb;
  bb.setReducedMotion(!!reduced);
  const ok = bb.openMirror(hero, seed, day);
  for (let i = 0; i < 40; i++) bb.game.step(1 / 60); // the wipe
  const s = bb.game.screen;
  return { ok, screen: bb.screen(), wiping: bb.game.transitioning, t: s.arena ? s.arena.b.t : null, builds: s.arena ? s.arena.b.record.builds : null, seed: s.arena ? s.arena.b.record.seed : null, rules: s.arena ? s.arena.b.record.rules : null };
}

/** In-page: step the replay until its battle clock reaches `target` (or the fight ends), watching both hulls every frame. */
function seekInPage(target) {
  const bb = window.bb, g = bb.game, s = g.screen, b = s.arena.b;
  const w = (window.__mirror ??= { frames: 0, unequal: [], drops: [] });
  while (b.t < target && !s.over && w.frames < 60 * 300) {
    const before = [b.sides[0].hull.hp, b.sides[1].hull.hp];
    g.step(1 / 60);
    w.frames++;
    const now = [b.sides[0].hull.hp, b.sides[1].hull.hp];
    if (now[0] !== now[1]) w.unequal.push({ t: +b.t.toFixed(3), you: now[0], foe: now[1] });
    if (now[0] !== before[0] || now[1] !== before[1]) w.drops.push({ t: +b.t.toFixed(3), you: before[0] - now[0], foe: before[1] - now[1], hp: now });
  }
  return { t: b.t, frames: w.frames };
}

/** In-page: cut the camera to `shot` and draw. */
function camInPage(shot) {
  const bb = window.bb;
  const c = bb.camera(shot, 0);
  bb.game.render();
  return c ? { shot: c.shot, zoom: +c.zoom.toFixed(3) } : null;
}

/** In-page: draw the frame and read both hulls, the wind numbers alive now and the layout. */
function readInPage(old) {
  const bb = window.bb, g = bb.game, s = g.screen, a = s.arena, b = a.b, m = s.motion;
  g.render();
  const side = (i) => ({
    hp: b.sides[i].hull.hp, max: b.sides[i].hull.max, windTaken: b.sides[i].stats.windTaken, plateText: s.hp[i],
    barShownHp: a.sfx[i].hpShown, barFlash: +a.sfx[i].barFlash.toFixed(3),
    shots: b.sides[i].stats.shots, damage: b.sides[i].stats.damage,
  });
  const pops = [];
  for (let i = 0; i < a.fx.np; i++) {
    const p = a.fx.pops[i];
    const wind = p.wind === true || (p.wind === undefined && (p.color || "").toUpperCase() === old);
    pops.push({ side: p.side, text: p.text, colour: p.color, wind, age: +p.t.toFixed(3), life: p.max });
  }
  const r = (q) => ({ x: q.x, y: q.y, w: q.w, h: q.h });
  const sec = Math.floor(b.t);
  return {
    t: +b.t.toFixed(3), ticks: b.ticks, over: b.over, winner: b.winner, windDps: b.windDps(), windLevel: +b.windLevel().toFixed(3),
    barClock: typeof s.clockText === "string" ? s.clockText : `${Math.floor(sec / 60)}:${sec % 60 < 10 ? "0" : ""}${sec % 60}`,
    you: side(0), foe: side(1), pops,
    view: { W: g.W, H: g.H, scale: g.view.scale, dpr: g.view.dpr, sub: g.view.sub ?? 1, portrait: g.portrait, cssPerPx: g.view.scale / g.view.dpr },
    plates: s.L.plates.map(r), hulls: s.L.hulls.map(r), bar: r(s.L.bar),
    carriers: m.pivot.map((q) => ({ x: Math.round(q[0]), y: Math.round(q[1]) })),
  };
}

/** In-page, after the screenshot: the control, the wind numbers, the bars, the band over each board, the hull numbers and
 *  BACK (see the header). Display state is put back and the real frame redrawn. */
function measureInPage({ mark, band, old }) {
  const bb = window.bb, g = bb.game, s = g.screen, a = s.arena, m = s.motion, cv = g.canvas;
  const W = cv.width, H = cv.height, kx = W / g.W, ky = H / g.H;
  // read through a copy made for reading (willReadFrequently), so the game's own canvas is never read back
  const copy = document.createElement("canvas");
  copy.width = W;
  copy.height = H;
  const ctx = copy.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  const grab = () => { g.render(); ctx.clearRect(0, 0, W, H); ctx.drawImage(cv, 0, 0); return ctx.getImageData(0, 0, W, H).data; };
  const differ = (P, Q, i) => P[i] !== Q[i] || P[i + 1] !== Q[i + 1] || P[i + 2] !== Q[i + 2];
  const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const is = (P, i, c) => P[i] === c[0] && P[i + 1] === c[1] && P[i + 2] === c[2];
  const hex = (v) => Math.round(v).toString(16).padStart(2, "0");
  const A0 = grab(), A1 = grab();
  let control = 0;
  for (let i = 0; i < A0.length; i += 4) if (differ(A0, A1, i)) control++;
  // the wind numbers, by p.wind, in the marker colour; each number's pixels are the changed ones inside its drawn box
  const live = [];
  for (let i = 0; i < a.fx.np; i++) live.push(a.fx.pops[i]);
  const isWind = (p) => p.wind === true || (p.wind === undefined && (p.color || "").toUpperCase() === old);
  const wind = live.filter(isWind);
  const saved = wind.map((p) => p.color);
  for (const p of wind) p.color = mark;
  const B = grab();
  wind.forEach((p, i) => { p.color = saved[i]; });
  const drawn = (m.windDrawn || []).map((n) => ({ side: n.side, text: n.text, beside: n.beside, r: { x: n.x, y: n.y, w: n.w, h: n.h }, x0: n.x * kx, y0: n.y * ky, x1: (n.x + n.w) * kx, y1: (n.y + n.h) * ky, px: 0, box: null, sum: [0, 0, 0] }));
  let stray = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (!differ(A0, B, i)) continue;
    const n = drawn.find((d) => x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1);
    if (!n) { stray++; continue; }
    n.px++;
    n.sum[0] += A0[i]; n.sum[1] += A0[i + 1]; n.sum[2] += A0[i + 2];
    n.box = n.box ? { x0: Math.min(n.box.x0, x), y0: Math.min(n.box.y0, y), x1: Math.max(n.box.x1, x), y1: Math.max(n.box.y1, y) } : { x0: x, y0: y, x1: x, y1: y };
  }
  const numbers = drawn.map((n) => ({ side: n.side, text: n.text, beside: n.beside, r: n.r, px: n.px, box: n.box, meanColour: n.px ? `#${n.sum.map((v) => hex(v / n.px)).join("")}`.toUpperCase() : null }));
  // the bars, flashed (display only), then put back
  const fl = [a.sfx[0].barFlash, a.sfx[1].barFlash];
  a.sfx[0].barFlash = a.sfx[1].barFlash = 1;
  const C2 = grab();
  a.sfx[0].barFlash = fl[0];
  a.sfx[1].barFlash = fl[1];
  const bars = s.L.plates.map((p, side) => {
    let px = 0;
    for (let y = Math.round(p.y * ky); y < Math.round((p.y + p.h) * ky); y++) for (let x = Math.round(p.x * kx); x < Math.round((p.x + p.w) * kx); x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if (differ(A0, C2, (y * W + x) * 4)) px++;
    }
    return { side, px };
  });
  // the band alone in its marker colour, every number blanked
  const texts = live.map((p) => p.text);
  live.forEach((p) => { p.text = ""; });
  m.windMark = band;
  const Bd = grab();
  m.windMark = "";
  live.forEach((p, i) => { p.text = texts[i]; });
  const bc = rgb(band);
  let bandPx = 0;
  for (let i = 0; i < Bd.length; i += 4) if (is(Bd, i, bc)) bandPx++;
  const hud = [...s.L.plates, s.L.bar, ...g.ui.regions.map((q) => q.r)].map((r) => ({ x0: r.x * kx, y0: r.y * ky, x1: (r.x + r.w) * kx, y1: (r.y + r.h) * ky }));
  const inHud = (x, y) => hud.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);
  const fwd = (A, x, y) => [A.a * x + A.c * y + A.e, A.b * x + A.d * y + A.f];
  const inv = (A, x, y) => { const det = A.a * A.d - A.b * A.c, u = x - A.e, v = y - A.f; return [(A.d * u - A.c * v) / det, (-A.b * u + A.a * v) / det]; };
  const cam = m.camera ? m.scr : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const boards = [0, 1].map((side) => {
    const hb = s.L.hulls[side], A = m.aff[side];
    const cs = [[hb.x, hb.y], [hb.x + hb.w, hb.y], [hb.x, hb.y + hb.h], [hb.x + hb.w, hb.y + hb.h]].map(([x, y]) => { const p = fwd(A, x, y), q = fwd(cam, p[0], p[1]); return [q[0] * kx, q[1] * ky]; });
    const X0 = Math.max(0, Math.floor(Math.min(...cs.map((c) => c[0])))), X1 = Math.min(W, Math.ceil(Math.max(...cs.map((c) => c[0]))));
    const Y0 = Math.max(0, Math.floor(Math.min(...cs.map((c) => c[1])))), Y1 = Math.min(H, Math.ceil(Math.max(...cs.map((c) => c[1]))));
    let n = 0, under = 0, hudPx = 0;
    for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
      const r = inv(cam, (x + 0.5) / kx, (y + 0.5) / ky), q = inv(A, r[0], r[1]);
      if (q[0] < hb.x || q[0] >= hb.x + hb.w || q[1] < hb.y || q[1] >= hb.y + hb.h) continue;
      if (inHud(x, y)) { hudPx++; continue; }
      n++;
      if (is(Bd, (y * W + x) * 4, bc)) under++;
    }
    const full = Math.abs((A.a * A.d - A.b * A.c) * (cam.a * cam.d - cam.b * cam.c)) * hb.w * hb.h * kx * ky;
    return { side, px: n, under, share: n ? +(under / n).toFixed(4) : null, hudPx, full: Math.round(full), visible: full ? +(n / full).toFixed(3) : 0 };
  });
  // the hull numbers (white px in each plate's hull box) and BACK against the plates
  const WH = rgb("#E9F1E5");
  const hits = (p, q) => p && q && p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
  const back = g.ui.regions.find((q) => q.id === "replayleave");
  const backR = back ? { x: back.r.x, y: back.r.y, w: back.r.w, h: back.r.h } : null;
  const plates = (s.plateRows || [null, null]).map((p, side) => {
    const pr = s.L.plates[side];
    if (!p) return { side, plate: pr, backOverPlate: hits(backR, pr) };
    let white = 0;
    const r = p.hullBox;
    for (let y = Math.floor(r.y * ky); y < Math.ceil((r.y + r.h) * ky); y++) for (let x = Math.floor(r.x * kx); x < Math.ceil((r.x + r.w) * kx); x++) {
      if (x >= 0 && y >= 0 && x < W && y < H && is(A0, (y * W + x) * 4, WH)) white++;
    }
    return { side, plate: pr, hull: p.hull, hullBox: { ...p.hullBox }, white, backOverPlate: hits(backR, pr), backOverHull: hits(backR, p.hullBox) };
  });
  g.render(); // the real frame back on the canvas
  return { control, numbers, stray, bars, band: { px: bandPx, boards }, plates, back: backR };
}

/** In-page: call 2's numbers (KINDS) on each board, 0.3 s old (display only), measured (see the header), then removed. */
function numbersInPage({ kinds, band }) {
  const bb = window.bb, g = bb.game, s = g.screen, a = s.arena, m = s.motion, fx = a.fx, b = a.b, cv = g.canvas;
  const W = cv.width, H = cv.height, kx = W / g.W, ky = H / g.H;
  const copy = document.createElement("canvas");
  copy.width = W;
  copy.height = H;
  const ctx = copy.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  const grab = () => { g.render(); ctx.clearRect(0, 0, W, H); ctx.drawImage(cv, 0, 0); return ctx.getImageData(0, 0, W, H).data; };
  const differ = (P, Q, i) => P[i] !== Q[i] || P[i + 1] !== Q[i + 1] || P[i + 2] !== Q[i + 2];
  const fwd = (A, x, y) => [A.a * x + A.c * y + A.e, A.b * x + A.d * y + A.f];
  const cam = m.camera ? m.scr : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const np0 = fx.np, anchor0 = fx.anchor;
  const made = [];
  for (const side of [0, 1]) {
    const hb = s.L.hulls[side];
    for (const k of kinds) {
      fx.anchor = side;
      const n0 = fx.np;
      fx.popup(hb.x + hb.w * k.at[0], hb.y + hb.h * k.at[1], k.text, k.colour, k.big);
      if (fx.np === n0) continue;
      const p = fx.pops[fx.np - 1];
      p.t = 0.3;
      const rise = (p.big ? 16 : 11) * Math.min(1, (p.t / p.max) * 2.2);
      const q0 = fwd(m.aff[side], p.x, p.y - rise + 3), q = fwd(cam, q0[0], q0[1]);
      made.push({ side, kind: k.kind, text: k.text, p, cx: q[0] * kx, cy: q[1] * ky, px: 0, dimmed: 0, inBand: 0, box: null });
    }
  }
  fx.anchor = anchor0;
  const others = [];
  for (let i = 0; i < np0; i++) others.push(fx.pops[i]);
  const otherTexts = others.map((p) => p.text);
  others.forEach((p) => { p.text = ""; });
  const madeTexts = made.map((q) => q.p.text);
  const blank = () => made.forEach((q) => { q.p.text = ""; });
  const unblank = () => made.forEach((q, i) => { q.p.text = madeTexts[i]; });
  b.windLevel = () => 0; // an own property over the class's method, for these frames only (display only)
  const Z1 = grab();
  blank();
  const Z0 = grab();
  unblank();
  delete b.windLevel;
  const W1 = grab();
  blank();
  m.windMark = band;
  const Bd = grab();
  m.windMark = "";
  unblank();
  others.forEach((p, i) => { p.text = otherTexts[i]; });
  const bc = [parseInt(band.slice(1, 3), 16), parseInt(band.slice(3, 5), 16), parseInt(band.slice(5, 7), 16)];
  let stray = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (!differ(Z1, Z0, i)) continue;
    let best = null, bd = 1e18;
    for (const q of made) { const d = (q.cx - x) ** 2 + (q.cy - y) ** 2; if (d < bd) { bd = d; best = q; } }
    if (!best) { stray++; continue; }
    best.px++;
    if (differ(W1, Z1, i)) best.dimmed++;
    if (Bd[i] === bc[0] && Bd[i + 1] === bc[1] && Bd[i + 2] === bc[2]) best.inBand++;
    best.box = best.box ? { x0: Math.min(best.box.x0, x), y0: Math.min(best.box.y0, y), x1: Math.max(best.box.x1, x), y1: Math.max(best.box.y1, y) } : { x0: x, y0: y, x1: x, y1: y };
  }
  fx.np = np0; // the numbers put on are gone again
  g.render();
  return { level: +(b.windLevel() * Math.max(0, 1 - a.overT / 1.2)).toFixed(3), stray, nums: made.map((q) => ({ side: q.side, kind: q.kind, text: q.text, px: q.px, dimmed: q.dimmed, inBand: q.inBand, box: q.box })) };
}

/** In-page: the frame's cost (ms): g.render() and its raster (the canvas drawn into a 1x1 reading copy forces Chrome's
 *  deferred canvas to raster the frame, so each sample holds the frame's real drawing; the copy's own cost is in every
 *  sample alike), sampled frame by frame in turn: the frame as it is, with the wind's level at 0, and with KINDS on both
 *  boards. Medians (and means) over n samples each. */
function costInPage({ n, kinds }) {
  const bb = window.bb, g = bb.game, s = g.screen, a = s.arena, b = a.b, fx = a.fx, cv = g.canvas;
  const copy = document.createElement("canvas");
  copy.width = copy.height = 1;
  const cx = copy.getContext("2d", { willReadFrequently: true });
  const frame = () => { const t0 = performance.now(); g.render(); cx.drawImage(cv, 0, 0, 1, 1, 0, 0, 1, 1); cx.getImageData(0, 0, 1, 1); return performance.now() - t0; };
  const np0 = fx.np, anchor0 = fx.anchor;
  const put = () => {
    for (const side of [0, 1]) {
      const hb = s.L.hulls[side];
      fx.anchor = side;
      for (const k of kinds) { fx.popup(hb.x + hb.w * k.at[0], hb.y + hb.h * k.at[1], k.text, k.colour, k.big); fx.pops[fx.np - 1].t = 0.3; }
    }
    fx.anchor = anchor0;
  };
  for (let i = 0; i < 5; i++) frame();
  const on = [], off = [], nums = [];
  for (let i = 0; i < n; i++) {
    on.push(frame());
    b.windLevel = () => 0;
    off.push(frame());
    delete b.windLevel;
    put();
    nums.push(frame());
    fx.np = np0;
  }
  g.render();
  const med = (xs) => { const q = [...xs].sort((x, y) => x - y); return +q[Math.floor(q.length / 2)].toFixed(2); };
  const mean = (xs) => +(xs.reduce((t, x) => t + x, 0) / xs.length).toFixed(2);
  return { frames: 3 * n, on: med(on), off: med(off), wind: +(med(on) - med(off)).toFixed(2), withNumbers: med(nums), numbers: +(med(nums) - med(on)).toFixed(2), means: { on: mean(on), off: mean(off), withNumbers: mean(nums) } };
}

const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);

async function main() {
  await mkdir(OUT, { recursive: true });
  if (DIST) {
    const { html, script } = await inlineBuild(resolve(DIST));
    await writeFile(PAGE, html);
    log(`page: ${PAGE} (${html.length} bytes, ${script}, from ${DIST})`);
  } else log(`page: ${PAGE} (as it is)`);
  const url = pathToFileURL(PAGE).href;
  log(`MIRROR shots (${TAG}) ${new Date().toISOString()}`);
  log(`mirror: bb.openMirror("${HERO}", ${SEED}, ${DAY}); moments ${AT.map((t) => `${t} s + ${AFTER} s`).join(", ")}, then the end; views ${VIEW_NAMES.join(",")}; cams ${CAMS.join(",")}; reduced ${REDUCED.join(",") || "-"}; numbers ${NUMS.join(",") || "-"} (pre ${PRE} s); cost ${COST || "-"}`);
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"] });
  const json = { page: PAGE, tag: TAG, hero: HERO, seed: SEED, day: DAY, after: AFTER, runs: {} };
  const table = [];
  let failed = 0;
  const fail = (s) => { failed++; log(`   CHECK FAILED: ${s}`); };
  const runs = [...VIEW_NAMES.map((v) => [v, false]), ...REDUCED.map((v) => [v, true])];
  for (const [vname, reduced] of runs) {
    const vopts = ALL_VIEWS[vname];
    const rname = `${vname}${reduced ? "-rm" : ""}`;
    const ctx = await browser.newContext(vopts);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
    page.on("requestfailed", (r) => errors.push(`requestfailed: ${r.url()}`));
    await page.addInitScript(FREEZE);
    log(`\n== ${rname} (${vopts.viewport.width}x${vopts.viewport.height} @${vopts.deviceScaleFactor}${vopts.hasTouch ? ", touch" : ""}${reduced ? ", Reduce Motion on" : ""})`);
    const V = (json.runs[rname] = { moments: [] });
    try {
      await page.goto(url);
      await page.waitForFunction(() => !!window.bb && !!window.bb.game);
      V.version = await page.evaluate(() => window.bb.version);
      const opened = await page.evaluate(openInPage, { hero: HERO, seed: SEED, day: DAY, reduced });
      log(`version ${V.version}; openMirror -> ${opened.ok}, screen ${opened.screen}, wiping ${opened.wiping}, battle clock ${opened.t?.toFixed(3)} s; record rules ${opened.rules}, seed ${opened.seed}`);
      if (!opened.ok || opened.screen !== "replay" || opened.wiping) throw new Error("the mirror replay did not open");
      V.record = { rules: opened.rules, seed: opened.seed };
      const numsHere = NUMS.includes(vname) && !reduced;
      if (numsHere) {
        await page.evaluate(seekInPage, PRE);
        V.pre = {};
        for (const cam of ["close", "wide"]) {
          await page.evaluate(camInPage, cam);
          const nm = await page.evaluate(numbersInPage, { kinds: KINDS, band: BAND });
          V.pre[cam] = nm;
          log(`-- ${PRE} s (before the wind, level ${nm.level}), ${cam}: the numbers' pixel boxes (canvas px): ${nm.nums.map((q) => `${q.side}:${q.kind} ${q.px}px ${q.box ? `${q.box.x1 - q.box.x0 + 1}x${q.box.y1 - q.box.y0 + 1}` : "-"}`).join("; ")}; stray ${nm.stray}`);
        }
        await page.evaluate(camInPage, "wide");
      }
      for (const at of AT) {
        const sk = await page.evaluate(seekInPage, at + AFTER);
        const st = await page.evaluate(readInPage, OLD_WIND);
        log(`\n-- ${at} s (battle clock ${st.t} s, tick ${st.ticks}, bar clock ${st.barClock}; ${sk.frames} frames stepped; wind level ${st.windLevel}, ${st.windDps}/s)`);
        log(`   YOU: hp ${st.you.hp} / ${st.you.max} (plate "${st.you.plateText}"), bar shows ${st.you.barShownHp}, windTaken ${st.you.windTaken}, shots ${st.you.shots}`);
        log(`   FOE: hp ${st.foe.hp} / ${st.foe.max} (plate "${st.foe.plateText}"), bar shows ${st.foe.barShownHp}, windTaken ${st.foe.windTaken}, shots ${st.foe.shots}`);
        log(`   logical ${st.view.W}x${st.view.H} at scale ${st.view.scale} (sub ${st.view.sub}); carriers ${JSON.stringify(st.carriers)}; plates ${JSON.stringify(st.plates)}; hulls ${JSON.stringify(st.hulls)}`);
        if (st.you.hp !== st.foe.hp || st.you.max !== st.foe.max || st.you.barShownHp !== st.foe.barShownHp) fail("the hulls differ");
        const M = { at, state: st, cams: {} };
        V.moments.push(M);
        for (const cam of CAMS) {
          const c = await page.evaluate(camInPage, cam);
          const file = `${TAG}-${at}s-${rname}-${cam}.png`;
          await page.screenshot({ path: join(OUT, file) });
          const ms = await page.evaluate(measureInPage, { mark: MARK, band: BAND, old: OLD_WIND });
          const C = (M.cams[cam] = { camera: c, file, measure: ms });
          log(`   [${cam}${c ? ` zoom ${c.zoom}` : ""}] -> ${file}; control redraw ${ms.control} px differ`);
          for (const n of ms.numbers) log(`     wind number "${n.text}" on ${n.side === 0 ? "YOUR" : "THE FOE'S"} carrier: ${n.px} px, box ${JSON.stringify(n.box)}, mean colour ${n.meanColour}${n.beside ? " (beside its plate)" : ""}`);
          if (ms.stray) log(`     ${ms.stray} marker px outside every drawn wind box`);
          log(`     bars lit by the flash: you ${ms.bars[0].px}, foe ${ms.bars[1].px}`);
          const [b0, b1] = ms.band.boards;
          log(`     band: ${ms.band.px} canvas px; under it: YOUR board ${b0.under}/${b0.px} (${b0.share}; visible ${b0.visible} of its ${b0.full}), THE FOE'S ${b1.under}/${b1.px} (${b1.share}; visible ${b1.visible} of its ${b1.full})`);
          for (const p of ms.plates) log(`     plate ${p.side}: hull "${p.hull ?? "?"}" ${p.white ?? "?"} white px in its box ${JSON.stringify(p.hullBox ?? null)}; BACK ${JSON.stringify(ms.back)} over the plate ${p.backOverPlate}, over its hull number ${p.backOverHull ?? "?"}`);
          if (ms.control !== 0) fail("the frame does not redraw the same");
          // the wind numbers: one on each carrier, equal pixel counts and equal colour
          const ws = ms.numbers;
          const n0 = ws.filter((n) => n.side === 0), n1 = ws.filter((n) => n.side === 1);
          let windOk = n0.length === 1 && n1.length === 1;
          if (windOk) windOk = n0[0].px > 0 && n0[0].px === n1[0].px && n0[0].meanColour === n1[0].meanColour;
          C.windEqual = windOk;
          if (!windOk) fail(`the two wind numbers differ or are missing (you ${JSON.stringify(n0.map((n) => [n.px, n.meanColour]))}, foe ${JSON.stringify(n1.map((n) => [n.px, n.meanColour]))})`);
          // the enemy's hull number fully visible: BACK clear of both plates, and the two hull numbers' white px equal
          const hullOk = ms.plates.every((p) => !p.backOverPlate) && ms.plates[0].white === ms.plates[1].white && ms.plates[0].white > 0;
          C.hullVisible = hullOk;
          if (!hullOk) fail("BACK is over a plate, or the two hull numbers differ on screen");
          table.push({ run: rname, cam, at, share: [b0.share, b1.share], visible: [b0.visible, b1.visible], px: [b0.px, b1.px] });
          if (numsHere && cam === "close") {
            const nm = await page.evaluate(numbersInPage, { kinds: KINDS, band: BAND });
            C.numbers = nm;
            const inBand = nm.nums.filter((q) => q.inBand > 0);
            log(`     call 2 numbers (level ${nm.level}): ${nm.nums.map((q) => `${q.side}:${q.kind} ${q.px}px dimmed ${q.dimmed} in band ${q.inBand}`).join("; ")}; stray ${nm.stray}`);
            log(`     call 2: ${inBand.length} of ${nm.nums.length} numbers reach into the band; dimmed px in them: ${inBand.reduce((t, q) => t + q.dimmed, 0)} of ${inBand.reduce((t, q) => t + q.px, 0)}; in all numbers: ${nm.nums.reduce((t, q) => t + q.dimmed, 0)} of ${nm.nums.reduce((t, q) => t + q.px, 0)}`);
            C.numbersSeenAsDrawn = nm.nums.every((q) => q.dimmed === 0);
          }
          if (COST === vname && !reduced && at === AT[AT.length - 1] && cam === CAMS[0]) {
            const co = await page.evaluate(costInPage, { n: 60, kinds: KINDS });
            V.cost = co;
            log(`     frame cost (${co.frames} frames, medians, raster included): ${co.on} ms a frame with the wind, ${co.off} with its level at 0 (the storm: ${co.wind} ms), ${co.withNumbers} with the 12 numbers on (the numbers: ${co.numbers} ms); means ${JSON.stringify(co.means)}`);
          }
        }
        await page.evaluate(camInPage, "wide");
        if (at === AT[AT.length - 1] && vname === "desk" && !reduced) {
          const st2 = await page.evaluate(readInPage, OLD_WIND);
          const p0 = st2.plates[0], p1 = st2.plates[1], k = st2.view.cssPerPx;
          const x0 = Math.min(p0.x, p1.x), y0 = Math.min(p0.y, p1.y), x1 = Math.max(p0.x + p0.w, p1.x + p1.w), y1 = Math.max(p0.y + p0.h, p1.y + p1.h);
          const clip = { x: Math.max(0, x0 * k - 6), y: Math.max(0, y0 * k - 6), width: Math.min(vopts.viewport.width, (x1 - x0) * k + 12), height: (y1 - y0) * k + 12 };
          const pf = `${TAG}-${at}s-desk-plates.png`;
          await page.screenshot({ path: join(OUT, pf), clip });
          const tr = { x: vopts.viewport.width - 420, y: 0, width: 420, height: 120 };
          const tf = `${TAG}-${at}s-desk-topright.png`;
          await page.screenshot({ path: join(OUT, tf), clip: tr });
          log(`   the plates -> ${pf}; the replay's top right -> ${tf}`);
        }
      }
      // on to the end: the result card
      const end = await page.evaluate(() => {
        const bb = window.bb, g = bb.game, s = g.screen, b = s.arena.b;
        let n = 0;
        while (!s.over && n < 60 * 20) { g.step(1 / 60); n++; }
        g.render();
        const sec = Math.floor(b.t);
        const at = {
          t: +b.t.toFixed(3), tRaw: b.t, ticks: b.ticks, you: b.sides[0].hull.hp, foe: b.sides[1].hull.hp, winner: b.winner,
          windTaken: [b.sides[0].stats.windTaken, b.sides[1].stats.windTaken],
          barClock: typeof s.clockText === "string" ? s.clockText : `${Math.floor(sec / 60)}:${sec % 60 < 10 ? "0" : ""}${sec % 60}`,
          barFrom: typeof s.clockText === "string" ? "drawn" : "computed (Math.floor(b.t))",
        };
        for (let i = 0; i < 90; i++) g.step(1 / 60); // the KO and the card (shows from 0.6 s after the end)
        g.render();
        const card = typeof s.cardClock === "string" && s.cardClock ? s.cardClock : String(Math.max(0, Math.floor(b.t + 1e-9)));
        const rb = g.ui.regions.find((q) => q.id === "replayback");
        return { ...at, card, cardFrom: typeof s.cardClock === "string" && s.cardClock ? "drawn" : "computed (fmtClock: Math.floor(b.t + 1e-9))", cardBack: rb ? { x: rb.r.x, y: rb.r.y, w: rb.r.w, h: rb.r.h } : null, plates: [...s.hp], frames: n, watch: window.__mirror };
      });
      const endFile = `${TAG}-end-${rname}.png`;
      await page.screenshot({ path: join(OUT, endFile) });
      V.end = { ...end, watch: undefined, file: endFile };
      V.watch = { frames: end.watch.frames, unequalFrames: end.watch.unequal.length, drops: end.watch.drops.length };
      log(`\n-- the end: battle clock ${end.tRaw} s (tick ${end.ticks}): you ${end.you}, foe ${end.foe}, winner ${end.winner === -1 ? "none (DRAW)" : end.winner}; windTaken ${end.windTaken.join(" / ")}; plates "${end.plates.join('" / "')}" -> ${endFile}`);
      log(`   the bar's clock "${end.barClock}" (${end.barFrom}); the card's "${end.card} S" (${end.cardFrom}): ${end.barClock === `${Math.floor(Number(end.card) / 60)}:${String(Number(end.card) % 60).padStart(2, "0")}` ? "they agree" : "THEY DISAGREE"}`);
      V.clocksAgree = end.barClock === `${Math.floor(Number(end.card) / 60)}:${String(Number(end.card) % 60).padStart(2, "0")}`;
      log(`   watched ${end.watch.frames} frames: ${end.watch.unequal.length} with the two hulls unequal; ${end.watch.drops.length} hull drops, each the same on both: ${end.watch.drops.every((d) => d.you === d.foe)}`);
      log(`   the result card's BACK (replayback): ${JSON.stringify(end.cardBack)} (logical px)`);
      if (end.watch.unequal.length || !end.watch.drops.every((d) => d.you === d.foe) || end.winner !== -1) fail("the mirror is not even");
      // BACK while it plays still leaves the replay: the mirror again, 2 s in, a real tap (or click) on its region
      const tb = await page.evaluate(({ hero, seed, day, reduced }) => {
        const bb = window.bb;
        bb.setReducedMotion(!!reduced);
        bb.openMirror(hero, seed, day);
        for (let i = 0; i < 160; i++) bb.game.step(1 / 60);
        bb.game.render();
        const r = bb.regions().find((q) => q.id === "replayleave");
        const lr = bb.game.ui.regions.find((q) => q.id === "replayleave");
        return { screen: bb.screen(), css: r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : null, rect: lr ? { x: lr.r.x, y: lr.r.y, w: lr.r.w, h: lr.r.h } : null };
      }, { hero: HERO, seed: SEED, day: DAY, reduced });
      if (tb.css) {
        if (vopts.hasTouch) await page.touchscreen.tap(tb.css.x, tb.css.y);
        else await page.mouse.click(tb.css.x, tb.css.y);
      }
      const after = await page.evaluate(() => { for (let i = 0; i < 60; i++) window.bb.game.step(1 / 60); return window.bb.screen(); });
      V.back = { rect: tb.rect, before: tb.screen, after };
      log(`   BACK while it plays: ${JSON.stringify(tb.rect)} (logical px); a ${vopts.hasTouch ? "tap" : "click"} at its centre: ${tb.screen} -> ${after}`);
      if (after !== "title") fail("BACK did not leave the replay");
    } catch (e) {
      failed++;
      log(`FAILED: ${e.message}`);
    }
    log(errors.length ? `console errors (${errors.length}):\n  ${errors.join("\n  ")}` : "console errors: 0");
    if (errors.length) failed++;
    V.errors = errors;
    await ctx.close();
  }
  await browser.close();
  // call 1's table: the share of each board under the band; PASS where both boards are in view (half or more of each on
  // screen): the shares differ by 10 points at most; where only one is (CLOSE): its share is no higher than at WIDE then
  log(`\nCALL 1 TABLE (${TAG}): the share of each board's on-screen pixels under the band`);
  log("| view | camera | at | your board | the foe's board | difference | visible (you, foe) | verdict |");
  log("|---|---|---|---|---|---|---|---|");
  let c1fail = 0;
  for (const r of table) {
    const [s0, s1] = r.share, [v0, v1] = r.visible;
    const both = v0 >= 0.5 && v1 >= 0.5;
    let ok;
    if (both) ok = s0 !== null && s1 !== null && Math.abs(s0 - s1) <= 0.1;
    else {
      const wide = table.find((q) => q.run === r.run && q.at === r.at && q.cam === "wide");
      const one = v0 >= 0.5 ? 0 : v1 >= 0.5 ? 1 : -1;
      ok = one < 0 || !wide || (r.share[one] ?? 0) <= (wide.share[one] ?? 0) + 1e-9;
    }
    if (!ok) c1fail++;
    const pc = (x) => (x === null ? "-" : `${(x * 100).toFixed(1)}%`);
    log(`| ${r.run} | ${r.cam} | ${r.at} s | ${pc(s0)} | ${pc(s1)} | ${s0 !== null && s1 !== null ? `${(Math.abs(s0 - s1) * 100).toFixed(1)} pts` : "-"} | ${v0}, ${v1} | ${ok ? "PASS" : "FAIL"}${both ? "" : " (one board in view)"} |`);
  }
  json.call1 = { rows: table, failed: c1fail };
  log(`call 1: ${c1fail ? `FAIL (${c1fail} rows)` : "PASS"}`);
  if (c1fail) failed++;
  log(failed ? `\nRESULT: FAIL (${failed})` : "\nRESULT: PASS (equal hulls and a DRAW; both wind numbers equal; BACK clear and both hull numbers shown; call 1's table; no console errors)");
  await writeFile(join(OUT, `${TAG}-mirror.log`), lines.join("\n") + "\n");
  await writeFile(join(OUT, `${TAG}-mirror.json`), JSON.stringify(json, null, 1) + "\n");
  void same;
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
