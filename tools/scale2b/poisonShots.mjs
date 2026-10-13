// SCALE-2b (REQ-BFG-108, REQ-BFG-100 C1, REQ-BFG-089; BRIEF-SCALE2b step 6) tooling, not shipped: POISON's stills on a built
// page through window.bb, phone (402x690 @3, touch) and desk (1920x1080). The same script shoots any build: AFTER is the tip
// built with only SCALE_RIGS set true, BEFORE is scale2b-base (VENOM DRIP lengthens BURN there; no POISON anywhere).
// 1. THE FIGHT: the moment tools/scale2b/poisonMoment.ts picked (`top[pick]`): bb.openFight(a, b, seed), stepped frame by
//    frame (1X) to the POISON tick's tick plus `extra` frames: the foe's status row (C1: POISON's chip beside BURN's) and
//    the tick's venom number on the foe's hull. Logged: bb.counters()'s status rows and the pops alive.
// 2. THE CARD: a showcase run's build screen with VENOM DRIP, TEMPER and WHETSTONE in an alchemist's wagon (their prices);
//    VENOM DRIP's card selected (its panel face); a tap on the word its face names (POISON after, BURN before: keywords.ts
//    region `kw:<i>:<word>`: the word's definition); its ⓘ view (region `kw:?`: LEVELS, NOTES, KEYWORDS).
// 3. THE SWATCH (label "after" only, desk): venom beside lime (HP, SWARM), HEAL's green and BURN's fire3, each with its 5x7
//    glyph (font.ts, x10) and a number, on the board's ink, the counter box's navy and a hull's slate.
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node tools/scale2b/poisonShots.mjs <dist dir> <out dir> <label> <moment.json> [pick] [extra]
import { chromium } from "playwright-core";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const DIST = resolve(process.argv[2] ?? "dist");
const OUT = resolve(process.argv[3] ?? "shots-scale2b");
const LABEL = process.argv[4] ?? "after";
const MOMENT = process.argv[5];
const PICK = Number(process.argv[6] ?? 0);
const EXTRA = Number(process.argv[7] ?? 8);
const ORIGIN = "http://bb.test";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml" };
const VIEWS = {
  phone: { viewport: { width: 402, height: 690 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  desk: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
};

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

const settle = (page, n = 20) => page.evaluate((k) => { const g = window.bb.game; for (let i = 0; i < k; i++) g.step(1 / 60); g.render(); }, n);

/** Open the fight and step it (1X, frame by frame) to `tick` (or its end), then `extra` frames; what the frame shows. */
const stepTo = (page, f, tick, extra) => page.evaluate(([f, tick, extra]) => {
  const bb = window.bb, g = bb.game, was = g.screen;
  if (!bb.openFight(f.a, f.b, f.seed, { day: f.day })) return { ok: false };
  let guard = 0;
  while ((g.screen === was || g.pending) && guard++ < 600) g.step(1 / 60); // game.go: the wipe, then the replay screen
  const a = g.screen.arena;
  guard = 0;
  while (a.b.ticks < tick && !a.b.over && guard++ < 30000) g.step(1 / 60);
  for (let i = 0; i < extra; i++) g.step(1 / 60);
  g.render();
  const c = bb.counters(), fx = a.fx, live = fx.popList.slice(0, fx.popCount);
  const foe = a.b.sides[1].hull;
  return {
    ok: a.b.record.seed === f.seed, ticks: a.b.ticks, t: +a.b.t.toFixed(3), scaleRigs: a.b.scaleRigs ?? null,
    foePoison: foe.poison ?? null, foeBurn: foe.burns.reduce((n, b) => n + b.dps, 0), foeHp: foe.hp,
    tabs: c ? c.tabs.map((t) => (t ? { side: t.side, chips: t.chips } : null)) : null,
    pops: live.map((p) => ({ text: p.text, color: p.color, side: p.side, age: +p.t.toFixed(2) })),
  };
}, [f, tick, extra]);

const SWATCH = (rows) => `<!doctype html><html><head><style>
body{margin:0;background:#050B12;font:16px monospace;color:#D0CEB7}
.wrap{display:flex;flex-direction:column;gap:18px;padding:24px}
.row{display:flex;gap:28px;padding:18px 24px;align-items:flex-end}
.cell{display:flex;flex-direction:column;align-items:center;gap:8px;width:190px}
.glyph{display:grid;grid-template-columns:repeat(5,10px);grid-auto-rows:10px}
.bar{width:150px;height:14px}
.chip{width:160px;height:56px}
.num{font:bold 28px monospace}
.cap{font-size:14px;color:#AFB1A3}
h1{font-size:18px;margin:0 0 4px 24px;color:#E9F1E5}
</style></head><body><div class="wrap"><h1>SCALE-2b: POISON's venom #C4F032 beside lime (HP bar, SWARM), HEAL's green and BURN's fire3: each glyph from font.ts (5x7, x10), on the board's ink, the counter box's navy and a hull's slate</h1>
${rows}</div></body></html>`;

function swatchRows() {
  const items = [
    { name: "lime (HP bar, SWARM)", hex: "#28FF64", glyph: null },
    { name: "HEAL green", hex: "#59DF67", glyph: ".###.|.#.#.|##.##|#...#|##.##|.#.#.|.###." },
    { name: "BURN fire3", hex: "#FF9B2A", glyph: "..#..|..##.|.###.|.####|#####|##.##|.###." },
    { name: "POISON venom (new)", hex: "#C4F032", glyph: "..#..|..#..|.#.#.|#...#|#...#|#...#|.###." },
  ];
  const cell = (it) => {
    const g = it.glyph
      ? `<div class="glyph">${it.glyph.split("|").flatMap((r) => [...r]).map((ch) => `<div style="background:${ch === "#" ? it.hex : "transparent"}"></div>`).join("")}</div>`
      : `<div style="height:70px;display:flex;align-items:center"><div class="bar" style="background:${it.hex}"></div></div>`;
    return `<div class="cell">${g}<div class="chip" style="background:${it.hex}"></div><div class="num" style="color:${it.hex}">30</div><div class="cap">${it.name}<br>${it.hex}</div></div>`;
  };
  return ["#050B12", "#101B27", "#263745"].map((bg) => `<div class="row" style="background:${bg}">${items.map(cell).join("")}<div class="cap">on ${bg}</div></div>`).join("\n");
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
  const errors = [], report = { label: LABEL, shots: [] };
  const m = MOMENT ? JSON.parse(await readFile(MOMENT, "utf8")).top[PICK] : null;
  for (const [view, opts] of Object.entries(VIEWS)) {
    const ctx = await browser.newContext(opts);
    await ctx.route(`${ORIGIN}/**`, serve);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`[${view}] pageerror: ${e.message}`));
    page.on("console", (msg) => { if (msg.type() === "error") errors.push(`[${view}] console: ${msg.text()}`); });
    await page.goto(`${ORIGIN}/index.html`);
    await page.waitForFunction(() => !!window.bb, null, { timeout: 15000 });
    const shot = async (name, line, extra = {}) => {
      const file = join(OUT, `${name}-${LABEL}-${view}.png`);
      await page.screenshot({ path: file });
      console.log(`${name}-${LABEL}-${view}.png: ${line}`);
      report.shots.push({ view, name, file, line, ...extra });
    };
    // 1. the fight
    if (m) {
      const r = await stepTo(page, m, m.moment.tick, EXTRA);
      const foeTab = r.tabs?.find((t) => t && t.side === 1);
      const venom = r.pops.filter((p) => p.color.toUpperCase() === "#C4F032");
      await shot("poison-fight", `d${m.day} ${m.ia} (yours, ${m.venoms} VENOM DRIP) v ${m.ib} s${m.seed}, POISON tick at tick ${m.moment.tick} (${m.moment.t} s; picked: foe POISON ${m.moment.poison}, BURN ${m.moment.burn}, the tick ${m.moment.dmg}); shot at tick ${r.ticks} (${r.t} s), scaleRigs ${r.scaleRigs}: foe POISON ${r.foePoison}, BURN ${r.foeBurn}; the foe's status row ${JSON.stringify(foeTab?.chips ?? null)}; venom pops ${JSON.stringify(venom)}`, { r });
    }
    // 2. the card
    await page.evaluate(() => window.bb.openShowcase("twobelts", "build"));
    await settle(page, 30);
    await page.evaluate(() => {
      const s = window.bb.game.screen, run = window.bb.game.run;
      s.select?.({ kind: "none" });
      run.gold = 30;
      run.shop.wagons = [{ merchant: "alchemist", offers: [["venom", 4], ["temper", 3], ["whetstone", 3]].map(([def, price]) => ({ def, price, sold: false })) }];
      s.touched?.();
    });
    await settle(page, 30);
    await shot("poison-shop", "the shop: VENOM DRIP (4 G), TEMPER and WHETSTONE in an alchemist's wagon");
    await page.evaluate(() => window.bb.game.screen.select({ kind: "offer", wagon: 0, slot: 0 }));
    await settle(page, 8);
    const regions = await page.evaluate(() => window.bb.game.ui.regions.map((q) => q.id).filter((id) => id.startsWith("kw:")));
    await shot("poison-card", `VENOM DRIP's card selected: its panel face (keyword regions: ${regions.join(", ")})`);
    const word = LABEL === "before" ? "BURN" : "POISON";
    const tapped = await page.evaluate((w) => {
      const r = window.bb.game.ui.regions.filter((q) => new RegExp(`^kw:\\d+:${w}$`).test(q.id)).pop();
      if (r) r.onTap();
      return r ? r.id : null;
    }, word);
    await settle(page, 8);
    if (tapped) await shot("poison-word", `a tap on ${word} (region ${tapped}): its definition`);
    else console.log(`poison-word-${LABEL}-${view}.png: not taken (no ${word} region)`);
    const opened = await page.evaluate(() => {
      const s = window.bb.game.screen;
      s.select({ kind: "offer", wagon: 0, slot: 0 });
      const r = window.bb.game.ui.regions.filter((q) => q.id.endsWith("kw:?")).pop();
      if (r) r.onTap();
      return !!r;
    });
    await settle(page, 8);
    if (opened) await shot("poison-notes", "VENOM DRIP's ⓘ view open (LEVELS, NOTES, KEYWORDS)");
    else console.log(`poison-notes-${LABEL}-${view}.png: not taken (no ⓘ region)`);
    // 3. the swatch
    if (LABEL === "after" && view === "desk") {
      const sw = await browser.newPage({ viewport: { width: 1100, height: 940 } });
      await sw.setContent(SWATCH(swatchRows()));
      const file = join(OUT, "poison-swatch-desk.png");
      await sw.screenshot({ path: file });
      console.log("poison-swatch-desk.png: venom beside lime, HEAL green and fire3, glyphs x10, on ink, navy and slate");
      report.shots.push({ view: "desk", name: "poison-swatch", file });
      await sw.close();
    }
    await ctx.close();
  }
  await browser.close();
  await writeFile(join(OUT, `poisonShots-${LABEL}.json`), JSON.stringify({ ...report, errors }, null, 1));
  console.log(`errors: ${errors.length}${errors.length ? "\n" + errors.join("\n") : ""}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
