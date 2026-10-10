// ZOOM-1 (REQ-BFG-080): the build screen's stills, before and after, from a player build (dist/), deterministically (as
// shots-det.mjs: the page's requestAnimationFrame never fires, Math.random is a fixed-seed generator, a fresh page per
// still). The same seed and state on both sides: FURNACE, seed 12345, day 1 with the dawn's first rune taken. Views: desk
// 1920x1080, laptop 1280x720, phones 402x690 @3 (the operator's), 390x844 @3 and 430x932 @3, phone landscape 844x390 @3.
// States: idle; a shop card tapped; a placed part tapped (the KILN); a part dragged over the deck (held, not dropped); a
// belt being drawn out of the KILN (held); on the 402x690 phone the tallest panel (a THUNDERER ★3 with a core and gear).
// A phone taps and drags with real touch events (CDP), the desk and laptop with the mouse. Each still also logs the view,
// the canvas grid and the carrier's zoom (BuildScreen.carrierView; a build without it: the UI's scale), the board's and
// the ship's size in device px, the band and the details panel's rect. Works on a build before ZOOM-1 too (k 1).
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node scripts/zoom1shots.mjs <build dir> <out dir> --prefix <before|after> [--only <view>]
import { chromium } from "playwright-core";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const [distArg, outArg] = args;
if (!distArg || !outArg) throw new Error("usage: node scripts/zoom1shots.mjs <build dir> <out dir> --prefix <name> [--only <view>]");
const DIST = resolve(distArg), OUT = resolve(outArg), PREFIX = opt("prefix", "after"), ONLY = opt("only", "");
const ORIGIN = "http://bb.test";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml" };
const touchView = (w, h, s = 3) => ({ viewport: { width: w, height: h }, deviceScaleFactor: s, isMobile: true, hasTouch: true });
const VIEWS = {
  desk: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  laptop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  op690: touchView(402, 690),
  phone: touchView(390, 844),
  max932: touchView(430, 932),
  land: touchView(844, 390),
};
const STATES = ["idle", "card", "part", "drag", "belt", "tallest"];

async function serve(route) {
  const url = new URL(route.request().url());
  let p = normalize(decodeURIComponent(url.pathname)).replace(/^\/+/, "");
  if (!p || p.endsWith("/")) p += "index.html";
  try {
    await route.fulfill({ status: 200, body: await readFile(join(DIST, p)), contentType: TYPES[extname(p)] ?? "application/octet-stream" });
  } catch {
    await route.fulfill({ status: 404, body: "not found" });
  }
}

/** In-page: a fresh run at day 1 on the build screen, the dawn's first rune taken (shots-list.mjs prep's way). */
function prep() {
  const g = window.bb.game;
  g.run = null;
  window.bb.clearPool();
  window.bb.setReducedMotion(false);
  window.bb.open("build", "furnace", 12345);
  const s = g.pending || g.screen, o = g.run && s && s.run === g.run && s.runePicker && s.runePicker.offer(s);
  if (o) { window.bb.holdRunes([o.ids[0]]); delete g.run.runeDay; }
  for (let i = 0; i < 96; i++) g.step(1 / 60);
  g.render();
}

const step = (page, n = 12) => page.evaluate((k) => { const g = window.bb.game; for (let i = 0; i < k; i++) g.step(1 / 60); g.render(); }, n);

/** In-page client points (CSS px) of the build screen's parts; a deck cell through the carrier's zoom where the build has
 *  it (BuildScreen.tileCentre), else from its deck frame (k 1). */
const points = (page) => page.evaluate(() => {
  const s = window.bb.game.screen, L = s.L, c = (x, y) => window.bb.toClient(x, y);
  const tile = (cx, cy) => {
    if (typeof s.tileCentre === "function") { const p = s.tileCentre(cx, cy); return c(p.x, p.y); }
    const f = L.frame, D = 120;
    const sx = f.facing === 0 || f.facing === 2 ? f.dx + cx * 12 : f.facing === 1 ? f.dx + D - (cy + 1) * 12 : f.dx + cy * 12;
    const sy = f.facing === 0 ? f.dy + cy * 12 : f.facing === 2 ? f.dy + D - (cy + 1) * 12 : f.dy + cx * 12;
    return c(sx + 6, sy + 6);
  };
  const kiln = s.run.build.items.find((p) => p.def === "kiln") ?? s.run.build.items[0];
  const card = L.cards[0];
  return { card: c(card.x + card.w / 2, card.y + card.h / 2), kiln: tile(kiln.x, kiln.y), kilnAt: [kiln.x, kiln.y], tile: null, tileFn: null };
});
const tileAt = (page, cx, cy) => page.evaluate(([x, y]) => {
  const s = window.bb.game.screen, L = s.L, c = (a, b) => window.bb.toClient(a, b);
  if (typeof s.tileCentre === "function") { const p = s.tileCentre(x, y); return c(p.x, p.y); }
  const f = L.frame, D = 120;
  const sx = f.facing === 0 || f.facing === 2 ? f.dx + x * 12 : f.facing === 1 ? f.dx + D - (y + 1) * 12 : f.dx + y * 12;
  const sy = f.facing === 0 ? f.dy + y * 12 : f.facing === 2 ? f.dy + D - (y + 1) * 12 : f.dy + x * 12;
  return c(sx + 6, sy + 6);
}, [cx, cy]);

const tp = (p) => [{ x: p.x, y: p.y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
async function tap(page, cdp, p, touch) {
  if (touch) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: tp(p) });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else await page.mouse.click(p.x, p.y);
  await step(page, 6);
}
async function press(page, cdp, path, touch) {
  if (touch) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: tp(path[0]) });
    for (const q of path.slice(1)) {
      for (let i = 1; i <= 8; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: tp(q) });
      await step(page, 2);
    }
  } else {
    await page.mouse.move(path[0].x, path[0].y);
    await page.mouse.down();
    for (const q of path.slice(1)) { await page.mouse.move(q.x, q.y, { steps: 8 }); await step(page, 2); }
  }
  await step(page, 10);
}

/** In-page: what the still shows (the view, the grid, the carrier's zoom; device px sizes; the band and the panel). */
const measure = (page) => page.evaluate(() => {
  const g = window.bb.game, s = g.screen, v = g.view, L = s.L;
  const cam = typeof s.carrierView === "function" ? s.carrierView() : { k: 1, z: v.scale, sub: v.sub ?? 1, scale: v.scale };
  const p = typeof s.panelInfo === "function" ? s.panelInfo() : null;
  const r = (q) => (q ? [q.x, q.y, q.w, q.h].map((n) => Math.round(n * 10) / 10) : null);
  return {
    css: [window.innerWidth, window.innerHeight], dpr: v.dpr, W: v.W, H: v.H, scale: v.scale, sub: v.sub ?? 1, z: cam.z || v.scale, k: cam.k,
    boardPx: (cam.z || v.scale) * 120, shipPx: (cam.z || v.scale) * 187, hull: r(L.hull), band: r(L.info), cargo: r(L.cargo), fight: r(L.fight),
    panel: p ? { title: p.title, inBand: p.inBand, area: r(p.area), full: p.full } : null,
    runes: (s.run.build.runes ?? []).length, canvas: [g.canvas.width, g.canvas.height],
  };
});

await mkdir(join(OUT, "stills"), { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"] });
const errors = [], rows = [];
for (const [vname, vopts] of Object.entries(VIEWS)) {
  if (ONLY && !ONLY.split(",").includes(vname)) continue;
  const ctx = await browser.newContext(vopts);
  await ctx.route(`${ORIGIN}/**`, serve);
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    let s = 0x9e3779b9;
    Math.random = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    window.requestAnimationFrame = () => 0;
  });
  page.on("pageerror", (e) => errors.push(`[${vname}] pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`[${vname}] ${m.type()}: ${m.text()}`); });
  const touch = !!vopts.hasTouch;
  for (const state of STATES) {
    if (state === "tallest" && vname !== "op690") continue;
    await page.goto(`${ORIGIN}/index.html`);
    await page.waitForFunction(() => !!window.bb, null, { timeout: 10000 });
    await page.evaluate(prep);
    const cdp = await ctx.newCDPSession(page);
    const pts = await points(page);
    if (state === "card") await tap(page, cdp, pts.card, touch);
    if (state === "part") await tap(page, cdp, pts.kiln, touch);
    if (state === "drag") {
      const plan = await page.evaluate(() => { const p = window.bb.game.screen.dragPlan(); return p ? { a: window.bb.toClient(p.from.x, p.from.y), b: window.bb.toClient(p.to.x, p.to.y) } : null; });
      if (plan) await press(page, cdp, [plan.a, { x: (plan.a.x + plan.b.x) / 2, y: (plan.a.y + plan.b.y) / 2 }, plan.b], touch);
      else errors.push(`[${vname}] no drag plan`);
    }
    if (state === "belt") {
      // out of the KILN (2x2 at kilnAt): left along its row, then up, held
      const [kx, ky] = pts.kilnAt;
      const path = [pts.kiln, await tileAt(page, kx - 1, ky), await tileAt(page, kx - 2, ky), await tileAt(page, kx - 3, ky), await tileAt(page, kx - 3, ky - 1), await tileAt(page, kx - 3, ky - 2)];
      await press(page, cdp, path, touch);
    }
    if (state === "tallest") {
      await page.evaluate(() => {
        const s = window.bb.game.screen, b = s.run.build;
        b.turrets = [{ slot: 0, def: "scrapcannon", uid: 90 }, { slot: 1, def: "thunderer", uid: 700, stars: 3 }];
        b.mods = [{ uid: 950, def: "pressure", turret: 1 }, { uid: 951, def: "hopper", turret: 1 }];
        s.touched();
        window.bb.game.step(1 / 60);
      });
      const t1 = await page.evaluate(() => { const r = window.bb.game.screen.turretRect(1); return window.bb.toClient(r.x + r.w / 2, r.y + r.h / 2); });
      await tap(page, cdp, t1, touch);
    }
    await step(page, 4);
    const name = `${PREFIX}-${vname}-${state}.png`;
    await page.screenshot({ path: join(OUT, "stills", name) });
    const m = await measure(page);
    rows.push({ name, view: vname, state, ...m });
    console.log(`${name}: ${JSON.stringify(m)}`);
  }
  await ctx.close();
}
await browser.close();
await writeFile(join(OUT, `${PREFIX}-measure.json`), JSON.stringify(rows, null, 1));
console.log(`${rows.length} stills`);
console.log(errors.length ? "ERRORS:\n" + [...new Set(errors)].join("\n") : "no console errors");
if (errors.length) process.exitCode = 1;
