// MIRROR-1 (REQ-BFG-093; wave3-mock tooling, test only: nothing ships): the operator's mirror test in the real 0.9.8 page.
// Both carriers are the same hero with the same hull and the same kit, kept as empty as possible (bb.openMirror: the
// hero's starting deck with its belts cut, nothing fires), so only the dark wind moves a hull. The offline single-file
// page (scripts/inline.mjs) is loaded from file:// with its clock held as scripts/motionshots.mjs holds it (the page's
// requestAnimationFrame never fires, Math.random pinned; the script steps the game itself, bb.game.step(1/60)), so every
// frame repeats exactly. The replay is played to each named second (50 s and 68 s, the second before the end) plus
// --after s (default 0.3: the wind's number of that second is purple from 0.05 s and steady to 0.66 s, fx.ts drawPops),
// then on to the end, on the phone (390x844 @3, touch) and the desk (1920x1080).
// At each moment it prints both hulls (the battle object: hp, max, windTaken; the plate's text; the bar's shown hp) and
// bb.motion(), takes the screenshot, then measures (after the shot; display state put back, the frame redrawn):
//  - control: the frame drawn twice, pixels that differ (0: drawing is repeatable, so the diffs below are exact);
//  - each wind number: the frame drawn again with the live wind numbers in a marker colour; the pixels that change are
//    that number's pixels as they end up on screen (under the dark wind's veil; nothing drawn over them). Per carrier:
//    the count, their box, and the mean colour they have in the real frame;
//  - each hull bar: the frame drawn again with both bars' flash on (display only: Arena.sfx barFlash); the pixels that
//    change are the bar's filled and chipped cells. Per plate: the count and the box, relative to the plate.
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node scripts/mirror1shots.mjs <outDir> [--dist <build dir>] [--page <page.html>]
//          [--hero furnace] [--seed 7] [--day 1] [--after 0.3]
// Writes <outDir>/mirror-<50s|68s>-<phone|desk>.png, the 68 s close-ups (-zoom-you, -zoom-foe), the end card
// (mirror-end-<view>.png), mirror1shots.log and mirror1shots.json; exits non-zero on a console error or a failed check.

import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { VIEWS as SHOT_VIEWS } from "./shots-list.mjs";
import { inlineBuild } from "./inline.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const pos = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--")));
const OUT = resolve(pos[0] ?? join(ROOT, "shots-mirror1"));
const DIST = resolve(opt("dist", join(ROOT, "dist")));
const PAGE = resolve(opt("page", join(process.env.TMPDIR ?? ROOT, "bb-mirror1.html")));
const HERO = opt("hero", "furnace"), SEED = Number(opt("seed", "7")), DAY = Number(opt("day", "1"));
const AFTER = Number(opt("after", "0.3"));
const AT = [50, 68];
const VIEWS = { phone: SHOT_VIEWS.phone, desk: SHOT_VIEWS.desk };
const WIND_COLOUR = "#8A5CB0"; // C.plum4: arenaReact.ts case "wind"
const MARK = "#00FF00";
const lines = [];
const log = (s) => { lines.push(s); console.log(s); };

/** motionshots.mjs FREEZE: the page's own loop never runs and Math.random is pinned; the script steps the game. */
const FREEZE = () => {
  window.requestAnimationFrame = () => 0;
  let s = 0x2f6b9a1d;
  Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
};

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

/** In-page: draw the frame and read the state of both hulls, the wind numbers alive now and the layout. */
function readInPage(windColour) {
  const bb = window.bb, g = bb.game, s = g.screen, a = s.arena, b = a.b, m = s.motion;
  g.render();
  const sec = Math.floor(b.t);
  const side = (i) => ({
    hp: b.sides[i].hull.hp, max: b.sides[i].hull.max, windTaken: b.sides[i].stats.windTaken, plateText: s.hp[i],
    barShownHp: a.sfx[i].hpShown, barFlash: +a.sfx[i].barFlash.toFixed(3), chipHold: +a.sfx[i].chipHold.toFixed(3),
    hero: b.sides[i].build.hero, items: b.sides[i].build.items.map((q) => q.def), routes: b.sides[i].build.routes.length,
    turrets: b.sides[i].turrets.length, shots: b.sides[i].stats.shots, damage: b.sides[i].stats.damage,
  });
  const pops = [];
  for (let i = 0; i < a.fx.np; i++) {
    const p = a.fx.pops[i];
    const k = p.t / p.max, rise = (p.big ? 16 : 11) * Math.min(1, k * 2.2);
    const lx = Math.round(p.x), ly = Math.round(p.y - rise);
    const A = p.side === 0 || p.side === 1 ? m.aff[p.side] : { a: 1, b: 0, c: 0, d: 1, e: a.fx.shakeX, f: a.fx.shakeY };
    const x = A.a * lx + A.c * ly + A.e, y = A.b * lx + A.d * ly + A.f;
    pops.push({
      side: p.side, text: p.text, colour: p.color, wind: (p.color || "").toUpperCase() === windColour,
      age: +p.t.toFixed(3), life: p.max, drawnAs: p.t < 0.05 ? "white (first 0.05 s)" : k > 0.78 && Math.floor(p.t * 22) % 2 ? "hidden (blink)" : "its colour",
      at: { x: +x.toFixed(1), y: +y.toFixed(1) }, client: bb.toClient(x, y + 3),
    });
  }
  const r = (q) => ({ x: q.x, y: q.y, w: q.w, h: q.h });
  const mo = bb.motion();
  return {
    screen: bb.screen(), t: +b.t.toFixed(3), ticks: b.ticks, clock: `${Math.floor(sec / 60)}:${sec % 60 < 10 ? "0" : ""}${sec % 60}`,
    over: b.over, winner: b.winner, windDps: b.windDps(), windLevel: +b.windLevel().toFixed(3),
    you: side(0), foe: side(1), pops,
    view: { W: g.W, H: g.H, scale: g.view.scale, dpr: g.view.dpr, portrait: g.portrait, cssPerPx: g.view.scale / g.view.dpr },
    plates: s.L.plates.map(r), hulls: s.L.hulls.map(r), bar: r(s.L.bar),
    carriers: m.pivot.map((q) => ({ x: Math.round(q[0]), y: Math.round(q[1]), client: bb.toClient(q[0], q[1]) })),
    motion: mo.on ? { t: +mo.t.toFixed(3), sea: mo.sea, reduced: mo.reduced, drawnBank: mo.drawnBank, poses: mo.poses.map((p) => ({ x: +p.x.toFixed(1), y: +p.y.toFixed(1), bank: +p.bank.toFixed(2) })) } : null,
  };
}

/** In-page, after the screenshot: the control, the wind numbers' pixels and the bars' pixels (see the header). */
function measureInPage({ windColour, mark }) {
  const bb = window.bb, g = bb.game, s = g.screen, a = s.arena, m = s.motion, cv = g.canvas;
  const W = cv.width, H = cv.height;
  // read through a copy made for reading (willReadFrequently), so the game's own canvas is never read back
  const copy = document.createElement("canvas");
  copy.width = W;
  copy.height = H;
  const ctx = copy.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  const grab = () => { g.render(); ctx.clearRect(0, 0, W, H); ctx.drawImage(cv, 0, 0); return ctx.getImageData(0, 0, W, H).data; };
  const differ = (P, Q, i) => P[i] !== Q[i] || P[i + 1] !== Q[i + 1] || P[i + 2] !== Q[i + 2];
  const A0 = grab(), A1 = grab();
  let control = 0;
  for (let i = 0; i < A0.length; i += 4) if (differ(A0, A1, i)) control++;
  // the wind numbers in the marker colour
  const live = [];
  for (let i = 0; i < a.fx.np; i++) live.push(a.fx.pops[i]);
  const wind = live.filter((p) => (p.color || "").toUpperCase() === windColour);
  const saved = wind.map((p) => p.color);
  const where = wind.map((p) => {
    const k = p.t / p.max, rise = (p.big ? 16 : 11) * Math.min(1, k * 2.2);
    const A = m.aff[p.side], lx = Math.round(p.x), ly = Math.round(p.y - rise) + 3;
    return { side: p.side, text: p.text, x: A.a * lx + A.c * ly + A.e, y: A.b * lx + A.d * ly + A.f };
  });
  for (const p of wind) p.color = mark;
  const B = grab();
  wind.forEach((p, i) => { p.color = saved[i]; });
  const num = where.map((q) => ({ side: q.side, text: q.text, px: 0, box: null, sum: [0, 0, 0] }));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (!differ(A0, B, i)) continue;
    let best = -1, bd = 1e9;
    where.forEach((q, j) => { const d = (q.x - x) ** 2 + (q.y - y) ** 2; if (d < bd) { bd = d; best = j; } });
    if (best < 0) continue;
    const n = num[best];
    n.px++;
    n.sum[0] += A0[i]; n.sum[1] += A0[i + 1]; n.sum[2] += A0[i + 2];
    n.box = n.box ? { x0: Math.min(n.box.x0, x), y0: Math.min(n.box.y0, y), x1: Math.max(n.box.x1, x), y1: Math.max(n.box.y1, y) } : { x0: x, y0: y, x1: x, y1: y };
  }
  const hex = (v) => Math.round(v).toString(16).padStart(2, "0");
  for (const n of num) {
    n.meanColour = n.px ? `#${n.sum.map((v) => hex(v / n.px)).join("")}`.toUpperCase() : null;
    delete n.sum;
  }
  // the bars, flashed (display only), then put back
  const fl = [a.sfx[0].barFlash, a.sfx[1].barFlash];
  a.sfx[0].barFlash = a.sfx[1].barFlash = 1;
  const C2 = grab();
  a.sfx[0].barFlash = fl[0];
  a.sfx[1].barFlash = fl[1];
  const bars = s.L.plates.map((p, side) => {
    let px = 0, box = null;
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = (y * W + x) * 4;
      if (!differ(A0, C2, i)) continue;
      px++;
      const rx = x - p.x, ry = y - p.y;
      box = box ? { x0: Math.min(box.x0, rx), y0: Math.min(box.y0, ry), x1: Math.max(box.x1, rx), y1: Math.max(box.y1, ry) } : { x0: rx, y0: ry, x1: rx, y1: ry };
    }
    return { side, plate: { x: p.x, y: p.y, w: p.w, h: p.h }, px, boxInPlate: box };
  });
  // the plates themselves, pixel for pixel (same size: compare the two crops; names and bars differ in colour only)
  const [p0, p1] = s.L.plates;
  let plateSame = null;
  if (p0.w === p1.w && p0.h === p1.h) {
    let shapeDiff = 0;
    const lum = (P, i) => P[i] + P[i + 1] + P[i + 2] > 120; // lit or dark: colour aside, the same cells drawn?
    for (let y = 0; y < p0.h; y++) for (let x = 0; x < p0.w; x++) {
      const i0 = ((p0.y + y) * W + p0.x + x) * 4, i1 = ((p1.y + y) * W + p1.x + x) * 4;
      if (lum(A0, i0) !== lum(A0, i1)) shapeDiff++;
    }
    plateSame = { cells: p0.w * p0.h, litCellsThatDiffer: shapeDiff };
  }
  g.render(); // the real frame back on the canvas
  return { control, numbers: num, bars, plateSame };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const { html, script } = await inlineBuild(DIST);
  await writeFile(PAGE, html);
  const url = pathToFileURL(PAGE).href;
  log(`MIRROR-1 shots ${new Date().toISOString()}`);
  log(`page: ${PAGE} (${html.length} bytes, ${script}, from ${DIST})`);
  log(`mirror: bb.openMirror("${HERO}", ${SEED}, ${DAY}); moments ${AT.map((t) => `${t} s + ${AFTER} s`).join(", ")}, then the end`);
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"] });
  const json = { page: PAGE, hero: HERO, seed: SEED, day: DAY, after: AFTER, views: {} };
  let failed = 0;
  for (const [vname, vopts] of Object.entries(VIEWS)) {
    const ctx = await browser.newContext(vopts);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
    page.on("requestfailed", (r) => errors.push(`requestfailed: ${r.url()}`));
    await page.addInitScript(FREEZE);
    log(`\n== ${vname} (${vopts.viewport.width}x${vopts.viewport.height} @${vopts.deviceScaleFactor}${vopts.hasTouch ? ", touch" : ""})`);
    const V = (json.views[vname] = { moments: [] });
    try {
      await page.goto(url);
      await page.waitForFunction(() => !!window.bb && !!window.bb.game);
      V.version = await page.evaluate(() => window.bb.version);
      const opened = await page.evaluate(({ hero, seed, day }) => {
        const ok = window.bb.openMirror(hero, seed, day);
        for (let i = 0; i < 40; i++) window.bb.game.step(1 / 60); // the wipe
        const s = window.bb.game.screen;
        return { ok, screen: window.bb.screen(), wiping: window.bb.game.transitioning, t: s.arena ? s.arena.b.t : null, builds: s.arena ? s.arena.b.record.builds : null, seed: s.arena ? s.arena.b.record.seed : null, rules: s.arena ? s.arena.b.record.rules : null };
      }, { hero: HERO, seed: SEED, day: DAY });
      log(`version ${V.version}; openMirror -> ${opened.ok}, screen ${opened.screen}, wiping ${opened.wiping}, battle clock ${opened.t?.toFixed(3)} s; record rules ${opened.rules}, seed ${opened.seed}`);
      if (!opened.ok || opened.screen !== "replay" || opened.wiping) throw new Error("the mirror replay did not open");
      V.record = { rules: opened.rules, seed: opened.seed, builds: opened.builds };
      log(`record builds: you ${JSON.stringify(opened.builds[0])}`);
      log(`               foe ${JSON.stringify(opened.builds[1])}`);
      for (const at of AT) {
        const sk = await page.evaluate(seekInPage, at + AFTER);
        const st = await page.evaluate(readInPage, WIND_COLOUR);
        const file = `mirror-${at}s-${vname}.png`;
        await page.screenshot({ path: join(OUT, file) });
        const ms = await page.evaluate(measureInPage, { windColour: WIND_COLOUR, mark: MARK });
        V.moments.push({ at, file, frames: sk.frames, state: st, measure: ms });
        log(`\n-- ${at} s (battle clock ${st.t} s, tick ${st.ticks}, plate clock ${st.clock}; ${sk.frames} frames stepped) -> ${file}`);
        log(`   YOU: hp ${st.you.hp} / ${st.you.max} (plate "${st.you.plateText}"), bar shows ${st.you.barShownHp}, windTaken ${st.you.windTaken}, shots ${st.you.shots}, damage dealt ${st.you.damage}`);
        log(`   FOE: hp ${st.foe.hp} / ${st.foe.max} (plate "${st.foe.plateText}"), bar shows ${st.foe.barShownHp}, windTaken ${st.foe.windTaken}, shots ${st.foe.shots}, damage dealt ${st.foe.damage}`);
        log(`   wind ${st.windDps}/s now, level ${st.windLevel}; sea ${st.motion?.sea}; logical ${st.view.W}x${st.view.H} at scale ${st.view.scale} (${st.view.cssPerPx} CSS px a pixel)`);
        log(`   carriers on screen (logical): you ${JSON.stringify(st.carriers[0])}, foe ${JSON.stringify(st.carriers[1])}; plates you ${JSON.stringify(st.plates[0])}, foe ${JSON.stringify(st.plates[1])}`);
        for (const p of st.pops) log(`   number "${p.text}" on ${p.side === 0 ? "YOUR" : p.side === 1 ? "THE FOE'S" : "no"} carrier: ${p.wind ? "wind" : "other"} ${p.colour}, age ${p.age} s of ${p.life}, drawn ${p.drawnAs}, at (${p.at.x}, ${p.at.y}) logical, client (${p.client.x.toFixed(0)}, ${p.client.y.toFixed(0)})`);
        log(`   control redraw: ${ms.control} px differ`);
        for (const n of ms.numbers) log(`   wind number "${n.text}" on ${n.side === 0 ? "YOUR" : "THE FOE'S"} carrier: ${n.px} px on screen, box ${JSON.stringify(n.box)}, mean colour there ${n.meanColour}`);
        for (const b of ms.bars) log(`   ${b.side === 0 ? "YOUR" : "FOE'S"} bar: ${b.px} filled/chipped px, box in plate ${JSON.stringify(b.boxInPlate)} (plate ${JSON.stringify(b.plate)})`);
        if (ms.plateSame) log(`   the two plates cell for cell (lit vs dark): ${ms.plateSame.litCellsThatDiffer} of ${ms.plateSame.cells} differ`);
        // checks
        if (st.you.hp !== st.foe.hp || st.you.max !== st.foe.max || st.you.barShownHp !== st.foe.barShownHp) { failed++; log("   CHECK FAILED: the hulls differ"); }
        if (ms.control !== 0) { failed++; log("   CHECK FAILED: the frame does not redraw the same"); }
        const ws = st.pops.filter((p) => p.wind);
        if (ws.length !== 2 || new Set(ws.map((p) => p.side)).size !== 2) log(`   NOTE: ${ws.length} wind numbers alive (sides ${ws.map((p) => p.side).join(",")})`);
        // the close-ups at the second before the end: each carrier's number, from the screenshot's own pixels
        if (at === 68) {
          for (const p of ws) {
            const k = st.view.cssPerPx, vw = vopts.viewport.width, vh = vopts.viewport.height;
            const w = Math.min(vw, Math.round(110 * k)), h = Math.min(vh, Math.round(70 * k));
            const x = Math.max(0, Math.min(vw - w, Math.round(p.client.x - w / 2))), y = Math.max(0, Math.min(vh - h, Math.round(p.client.y - h / 2)));
            const zf = `mirror-68s-${vname}-zoom-${p.side === 0 ? "you" : "foe"}.png`;
            await page.screenshot({ path: join(OUT, zf), clip: { x, y, width: w, height: h } });
            log(`   close-up ${zf}: CSS box (${x}, ${y}, ${w}x${h}) around the ${p.side === 0 ? "player's" : "foe's"} number`);
          }
        }
      }
      // on to the end: the result card
      const end = await page.evaluate(() => {
        const bb = window.bb, g = bb.game, s = g.screen, b = s.arena.b;
        let n = 0;
        while (!s.over && n < 60 * 20) { g.step(1 / 60); n++; }
        const at = { t: +b.t.toFixed(3), tRaw: b.t, barClock: `${Math.floor(Math.floor(b.t) / 60)}:${String(Math.floor(b.t) % 60).padStart(2, "0")}`, ticks: b.ticks, you: b.sides[0].hull.hp, foe: b.sides[1].hull.hp, winner: b.winner, windTaken: [b.sides[0].stats.windTaken, b.sides[1].stats.windTaken] };
        for (let i = 0; i < 90; i++) g.step(1 / 60); // the KO and the card (shows from 0.6 s after the end)
        g.render();
        return { ...at, plates: [...s.hp], frames: n, watch: window.__mirror };
      });
      const endFile = `mirror-end-${vname}.png`;
      await page.screenshot({ path: join(OUT, endFile) });
      V.end = { ...end, watch: undefined, file: endFile };
      V.watch = { frames: end.watch.frames, unequalFrames: end.watch.unequal.length, firstUnequal: end.watch.unequal[0] ?? null, drops: end.watch.drops };
      log(`\n-- the end: battle clock ${end.t} s (tick ${end.ticks}): you ${end.you}, foe ${end.foe}, winner ${end.winner === -1 ? "none (DRAW)" : end.winner}; windTaken ${end.windTaken.join(" / ")}; plates "${end.plates.join('" / "')}" -> ${endFile}`);
      log(`   watched ${end.watch.frames} frames: ${end.watch.unequal.length} with the two hulls unequal; ${end.watch.drops.length} hull drops, each the same on both: ${end.watch.drops.every((d) => d.you === d.foe)}`);
      log(`   drops (battle clock: you/foe): ${end.watch.drops.map((d) => `${d.t}:${d.you}/${d.foe}`).join(" ")}`);
      if (end.watch.unequal.length || !end.watch.drops.every((d) => d.you === d.foe) || end.winner !== -1) { failed++; log("   CHECK FAILED: the mirror is not even"); }
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
  log(failed ? `\nRESULT: FAIL (${failed})` : "\nRESULT: PASS (both hulls equal on every frame, the shots taken, no console errors)");
  await writeFile(join(OUT, "mirror1shots.log"), lines.join("\n") + "\n");
  await writeFile(join(OUT, "mirror1shots.json"), JSON.stringify(json, null, 1) + "\n");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
