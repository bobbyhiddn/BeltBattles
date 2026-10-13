// SCALE-2a (REQ-BFG-100, C11; BRIEF-SCALE2a step 7) tooling, not shipped: the reader pop's stills and the pool probe on a
// built page, through window.bb (bb.openFight replays two decks exactly, as a stored record).
// STILLS: the moment tools/scale2a/readerMoment.ts picked (`top[pick]` of its JSON): the fight opened, stepped frame by
// frame (g.step(1/60), 1X) to the pop's tick plus `extra` frames, rendered, shot on the phone (402x690 @3, touch) and the
// desk (1920x1080). The same script shoots any build's page (the BEFORE set at scale2a-base has no reader pop).
// POOL: COUNT-1's probe (REPORT-COUNT1 section 5): the live pops (bb.game.screen.arena.fx.popCount) sampled every frame
// through whole fights, 12 fights: the top fight of each of days 9, 10 and 8 in COUNT-1's fights.json
// (tools/count1/pickFights.ts), seeds 1-4; the high water, the reader pops alive at most, and the frames with a full pool.
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node tools/scale2a/readerShots.mjs <dist dir> <out dir> <label> <moment.json> [pick]
//        [fights.json] [extra]
import { chromium } from "playwright-core";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const DIST = resolve(process.argv[2] ?? "dist");
const OUT = resolve(process.argv[3] ?? "shots-scale2a");
const LABEL = process.argv[4] ?? "after";
const MOMENT = process.argv[5];
const PICK = Number(process.argv[6] ?? 0);
const FIGHTS = process.argv[7];
const EXTRA = Number(process.argv[8] ?? 9);
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

/** Open a fight and step it (1X, frame by frame) until its battle reaches `tick` (or ends), then `extra` frames more. */
const stepTo = (page, f, tick, extra) => page.evaluate(([f, tick, extra]) => {
  const bb = window.bb, g = bb.game;
  if (!bb.openFight(f.a, f.b, f.seed, { day: f.day })) return { ok: false };
  const a = g.screen.arena;
  let guard = 0;
  while (a.b.ticks < tick && !a.b.over && guard++ < 30000) g.step(1 / 60);
  for (let i = 0; i < extra; i++) g.step(1 / 60);
  g.render();
  const fx = a.fx, live = fx.popList.slice(0, fx.popCount);
  return {
    ok: true, ticks: a.b.ticks, t: +a.b.t.toFixed(3), popCount: fx.popCount, readerCount: fx.readerCount ?? null,
    readers: live.filter((p) => p.reader).map((p) => ({ text: p.text, x: Math.round(p.x), y: Math.round(p.y), age: +p.t.toFixed(3), side: p.side, big: p.big, color: p.color })),
  };
}, [f, tick, extra]);

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
  const errors = [], report = { label: LABEL, stills: [], pool: null };
  const m = MOMENT ? JSON.parse(await readFile(MOMENT, "utf8")).top[PICK] : null;
  for (const [view, opts] of Object.entries(VIEWS)) {
    const ctx = await browser.newContext(opts);
    await ctx.route(`${ORIGIN}/**`, serve);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`[${view}] pageerror: ${e.message}`));
    page.on("console", (msg) => { if (msg.type() === "error") errors.push(`[${view}] console: ${msg.text()}`); });
    await page.goto(`${ORIGIN}/index.html`);
    await page.waitForFunction(() => !!window.bb, null, { timeout: 15000 });
    if (m) {
      const r = await stepTo(page, m, m.moment.tick, EXTRA);
      const file = join(OUT, `reader-${LABEL}-${view}.png`);
      await page.screenshot({ path: file });
      const line = `reader-${LABEL}-${view}.png: d${m.day} ${m.ia} v ${m.ib} s${m.seed}, ${m.moment.def} +${m.moment.amount} at tick ${m.moment.tick} (route ${m.moment.route} tile ${m.moment.tile}), shot at tick ${r.ticks} (${r.t} s): pops ${r.popCount}, reader pops ${JSON.stringify(r.readers)}`;
      console.log(line);
      report.stills.push({ view, file, ...r });
    }
    if (FIGHTS && view === "desk") {
      const top = JSON.parse(await readFile(FIGHTS, "utf8")).top;
      const fights = [];
      for (const day of [9, 10, 8]) {
        const f = top.find((x) => x.day === day);
        if (!f) { console.log(`pool: no fight of day ${day} in fights.json`); continue; }
        for (const seed of [1, 2, 3, 4]) fights.push({ ...f, seed });
      }
      const rows = [];
      for (const f of fights) {
        const r = await page.evaluate((f) => {
          const bb = window.bb, g = bb.game;
          if (!bb.openFight(f.a, f.b, f.seed, { day: f.day })) return { ok: false };
          const a = g.screen.arena, fx = a.fx;
          let high = 0, readers = 0, full = 0, frames = 0, after = 0, guard = 0;
          while (after < 90 && guard++ < 40000) {
            g.step(1 / 60);
            frames++;
            if (a.b.over) after++;
            const n = fx.popCount, k = fx.readerCount ?? 0;
            if (n > high) high = n;
            if (k > readers) readers = k;
            if (n >= 48) full++;
          }
          return { ok: true, high, readers, full, frames, secs: +a.b.t.toFixed(1) };
        }, f);
        const row = { day: f.day, ia: f.ia, ib: f.ib, seed: f.seed, ...r };
        console.log(`pool d${f.day} ${f.ia} v ${f.ib} s${f.seed}: high water ${r.high} of 48, reader pops alive at most ${r.readers}, full frames ${r.full}, ${r.frames} frames, ${r.secs} s`);
        rows.push(row);
      }
      report.pool = { rows, high: Math.max(...rows.map((x) => x.high ?? 0)), readers: Math.max(...rows.map((x) => x.readers ?? 0)), full: rows.reduce((s, x) => s + (x.full ?? 0), 0) };
      console.log(`pool ${LABEL}: high water ${report.pool.high} of 48 over ${rows.length} fights; reader pops alive at most ${report.pool.readers}; frames with a full pool ${report.pool.full}`);
    }
    await ctx.close();
  }
  await browser.close();
  await writeFile(join(OUT, `readerShots-${LABEL}.json`), JSON.stringify({ ...report, errors }, null, 1));
  console.log(`errors: ${errors.length}${errors.length ? "\n" + errors.join("\n") : ""}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
