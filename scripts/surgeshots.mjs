// CUSTOM-3 (REVIEW-STAGE096 R5 b): the landscape surge's shot check. On the built player page in headless Chromium, on
// the desk (1920x1080 @1) and the laptop (1280x720 @1): a battle in motion (no profile, today's look), its display clock
// set to each board's surge's outer reach (the player's furthest left, the enemy's furthest right, found on the motion
// model's own curves), one frame drawn and shot, and every tile of each board's outer column read back where it is
// drawn (bb.motionTile: the tile's centre through the board's transform, without the camera shake): each tile's outer
// edge must sit inside the canvas and the window. The page's requestAnimationFrame never fires and Math.random is
// pinned; the script steps the game itself. Exit 1 on any spill or console error.
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node scripts/surgeshots.mjs <outDir> [--dist dist]
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { autoFight } from "./scouthook.mjs"; // SCOUT-1 (REQ-BFG-076): the FIGHT step (bb.fight(true): battles skip scouting)

const ROOT = new URL("..", import.meta.url).pathname;
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const OUT = resolve(args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--"))) ?? join(ROOT, "shots", "surge"));
const DIST = resolve(opt("dist", join(ROOT, "dist")));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
const VIEWS = [["desk", 1920, 1080], ["laptop", 1280, 720]];
mkdirSync(OUT, { recursive: true });
const lines = [];
const log = (s) => { lines.push(s); console.log(s); };

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
await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${srv.address().port}`;
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
log(`# surgeshots (CUSTOM-3, REVIEW-STAGE096 R5 b): ${DIST} at ${origin}, Chromium ${browser.version()}; ${new Date().toISOString()}`);
let bad = 0, errorsAll = 0;
for (const [name, w, h] of VIEWS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await autoFight(ctx); // SCOUT-1: battles skip scouting, as before SCOUT-1
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.addInitScript(() => {
    window.requestAnimationFrame = () => 0;
    let r = 0x2f6b9a1d;
    Math.random = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; };
    localStorage.setItem("beltbattles.name.v1", "SURGE");
  });
  await page.goto(`${origin}/index.html`);
  await page.waitForFunction(() => !!window.bb && !!window.bb.game);
  const info = await page.evaluate(() => {
    const bb = window.bb, g = bb.game;
    bb.open("battle");
    for (let i = 0; i < 300; i++) g.step(1 / 60); // past the sail-in: the boards at their lanes
    const m = g.screen.motion.model;
    // each board's outer reach on its own curve: the player's least x offset, the enemy's greatest, from now on
    let tp = m.t, te = m.t, xp = Infinity, xe = -Infinity;
    for (let i = 0; i < 60 * 40; i++) {
      const t = m.t + i / 60, op = m.offset(0, t)[0], oe = m.offset(1, t)[0];
      if (op < xp) { xp = op; tp = t; }
      if (oe > xe) { xe = oe; te = t; }
    }
    return { W: g.W, H: g.H, scale: g.view.scale, spec: m.spec, t0: m.t, tp, xp, te, xe, phase: g.screen.phase };
  });
  log(`${name} ${w}x${h}: battle ${info.W}x${info.H} at x${info.scale}, phase ${info.phase}; lanes ${JSON.stringify(info.spec)}; the player's outer reach ${info.xp} px at t ${info.tp.toFixed(2)} s, the enemy's +${info.xe} px at t ${info.te.toFixed(2)} s`);
  for (const [who, t, side] of [["player", info.tp, 0], ["enemy", info.te, 1]]) {
    const r = await page.evaluate(([tt, sd]) => {
      const bb = window.bb, g = bb.game, m = g.screen.motion.model;
      m.t = tt;
      g.render();
      const k = g.view.scale / g.view.dpr, cv = g.canvas.getBoundingClientRect();
      // the outer column: deck row cy 9 on both boards (the player faces east: its row 9 is leftmost; the enemy's rightmost)
      const tiles = [];
      for (let c = 0; c < 10; c++) tiles.push(bb.motionTile(sd, c, 9));
      const half = 6 * k;
      const outer = sd === 0 ? Math.min(...tiles.map((p) => p.x - half)) : Math.max(...tiles.map((p) => p.x + half));
      const pose = m.offset(sd, tt);
      return { outer, cvL: cv.left, cvR: cv.right, vw: innerWidth, k, pose, shake: [g.screen.arena.fx.shakeX, g.screen.arena.fx.shakeY] };
    }, [t, side]);
    const room = side === 0 ? r.outer - Math.max(0, r.cvL) : Math.min(r.vw, r.cvR) - r.outer;
    const ok = room >= -1e-6;
    if (!ok) bad++;
    const file = `surge-${name}-${who}.png`;
    await page.screenshot({ path: join(OUT, file) });
    log(`${ok ? "PASS" : "FAIL"}  ${name} ${who} at its outer reach (offset ${r.pose[0]} px): the outer tile column's ${side === 0 ? "left" : "right"} edge at ${r.outer.toFixed(1)} CSS px, ${room.toFixed(1)} CSS px inside the ${side === 0 ? "left" : "right"} edge (canvas ${r.cvL.toFixed(0)}..${r.cvR.toFixed(0)}, window ${r.vw}); ${file}`);
  }
  log(`${name}: console errors ${errors.length}${errors.length ? ` (${errors.join(" | ")})` : ""}`);
  errorsAll += errors.length;
  await ctx.close();
}
await browser.close();
srv.close();
log(bad || errorsAll ? `SURGESHOTS FAILED: ${bad} spills, ${errorsAll} console errors` : `SURGESHOTS PASSED: ${VIEWS.length * 2} of ${VIEWS.length * 2} outer reaches inside the screen`);
writeFileSync(join(OUT, "surgeshots.log"), lines.join("\n") + "\n");
process.exit(bad || errorsAll ? 1 : 0);
