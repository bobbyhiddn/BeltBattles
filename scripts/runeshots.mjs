// RUNES-1 (REQ-BFG-058, M5): the dawn rune picker and the rune bar on the BUILT page, in Chromium with real input, on the
// operator's phone view (402x690 CSS px, DPR 3, isMobile, hasTouch; touch taps through CDP) and the desk (1280x800).
// Shots: picker3 (dawn of day 4, 3 cards, 3 runes held), picker-open (its middle card tapped once), taken (tapped again:
// the rune taken, the toast, the bar), picker2 (dawn of day 7, 2 cards, 6 held), bar6 (day 6, 6 runes), bar6-readout (a
// chip tapped: its read-out), bar10 (day 10, 10 runes) and bar10-list (the "+k" chip's full list where the row can't hold
// them). Checks: every UI region and the picker's cards on screen; each rune chip at least 44 CSS px; a reload and
// CONTINUE show the same cards; the picker takes every press (a tap on FIGHT's spot under it changes nothing).
// Usage: npx vite build --outDir <dir> && PLAYWRIGHT_BROWSERS_PATH=... BB_TOUCH=1 node scripts/runeshots.mjs <outDir> [--dist <dir>]
// Exit 1 if a check fails.

import { chromium } from "playwright-core";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const args = process.argv.slice(2);
const di = args.indexOf("--dist");
const DIST = resolve(di >= 0 ? args[di + 1] : join(ROOT, "dist"));
const OUT = resolve(args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1] === "--dist")) ?? join(ROOT, "shots", "runes"));
const ORIGIN = "http://bb.test";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
const VIEWS = {
  op: { viewport: { width: 402, height: 690 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  desk: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
};
const checks = [];
const check = (ok, what) => { checks.push({ ok, what }); console.log(`${ok ? "ok  " : "FAIL"} ${what}`); };

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

/** A run at the dawn of `day` holding `runes` (ids, pick order); `pick`: today's rune pick pending. */
async function openRun(page, day, runes, pick) {
  await page.evaluate(([d, list, p]) => {
    window.bb.openDawn({ hero: "furnace", day: d, gold: 12, seed: 12345 });
    const r = window.bb.game.run;
    r.build.runes = list.map((id) => ({ id }));
    if (p) r.runeDay = d;
    else delete r.runeDay;
  }, [day, runes, pick]);
  await page.waitForFunction(() => window.bb.screen() === "build" && !window.bb.game.transitioning, null, { timeout: 15000 });
  await frames(page, 90);
}
const frames = (page, n = 30) => page.evaluate((k) => { const g = window.bb.game; for (let i = 0; i < k; i++) g.step(1 / 60); g.render(); }, n);

async function tap(page, cdp, p) {
  if (cdp) {
    const pt = [{ x: Math.round(p.x), y: Math.round(p.y), id: 1, radiusX: 4, radiusY: 4, force: 1 }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else await page.mouse.click(p.x, p.y);
  await frames(page, 6);
}

const picker = (page) => page.evaluate(() => { const s = window.bb.game.screen; return s.runePicker ? s.runePicker.info(s) : null; });
const cardAt = (page, i) => page.evaluate((n) => { const s = window.bb.game.screen, c = s.runePicker.info(s).layout.cards[n]; return window.bb.toClient(c.x + c.w / 2, c.y + c.h / 2); }, i);
const regionC = (page, id) => page.evaluate((i) => { const r = window.bb.regions().filter((q) => q.id === i).pop(); return r ? { ...r, cx: r.x + r.w / 2, cy: r.y + r.h / 2 } : null; }, id);

/** Every region of the last frame inside the viewport (a full-screen one included), and the picker's cards. */
async function onScreen(page, vname, what) {
  const r = await page.evaluate(() => {
    const vw = window.innerWidth, vh = window.innerHeight, out = [];
    for (const q of window.bb.regions()) if (q.x < -0.5 || q.y < -0.5 || q.x + q.w > vw + 0.5 || q.y + q.h > vh + 0.5) out.push(`${q.id} ${[q.x, q.y, q.w, q.h].map((v) => v.toFixed(0)).join(",")}`);
    const s = window.bb.game.screen, info = s.runePicker?.info(s);
    if (info) {
      const { W, H } = window.bb.game;
      for (const c of [...info.layout.cards, ...(info.layout.tray ? [info.layout.tray] : [])]) if (c.x < 0 || c.y < 0 || c.x + c.w > W || c.y + c.h > H) out.push(`card ${JSON.stringify(c)}`);
      if (info.layout.bottom > H) out.push(`picker bottom ${info.layout.bottom} > ${H}`);
    }
    return out;
  });
  check(r.length === 0, `${vname} ${what}: everything on screen${r.length ? ` (off: ${r.join("; ")})` : ""}`);
}

async function shot(page, vname, name) {
  const file = join(OUT, `${name}-${vname}.png`);
  await page.screenshot({ path: file });
  console.log(`  -> ${file}`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
  const errors = [];
  for (const [vname, vopts] of Object.entries(VIEWS)) {
    const ctx = await browser.newContext(vopts);
    await ctx.route(`${ORIGIN}/**`, serve);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`[${vname}] pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`[${vname}] ${m.text()}`); });
    await page.goto(`${ORIGIN}/index.html`);
    await page.waitForFunction(() => !!window.bb, null, { timeout: 15000 });
    const cdp = vopts.hasTouch ? await ctx.newCDPSession(page) : null;
    const k = await page.evaluate(() => window.bb.game.view.scale / window.bb.game.view.dpr);

    // ---- picker3 (dawn of day 4: RARE in the mock; whatever the odds give seed 12345), 3 held
    await openRun(page, 4, ["coin_purse", "coal_chute", "tar_barrel"], true);
    let p = await picker(page);
    check(!!p && p.ids.length === 3 && p.day === 4, `${vname}: the picker is up at the dawn of day 4 with 3 cards (${p?.ids.join(", ")}, ${p?.tier})`);
    await onScreen(page, vname, "picker3");
    await shot(page, vname, "picker3");
    // the picker takes every press: a tap where FIGHT and the shop are changes nothing; F and Escape do nothing
    const before = await page.evaluate(() => JSON.stringify([window.bb.game.run.build, window.bb.game.run.gold, window.bb.screen()]));
    const fight = await page.evaluate(() => { const r = window.bb.game.screen.L.fight; return window.bb.toClient(r.x + r.w / 2, r.y + r.h / 2); });
    await tap(page, cdp, fight);
    await page.keyboard.press("f");
    await page.keyboard.press("Escape");
    await frames(page, 10);
    const after = await page.evaluate(() => JSON.stringify([window.bb.game.run.build, window.bb.game.run.gold, window.bb.screen()]));
    p = await picker(page);
    check(before === after && !!p && p.open === -1, `${vname}: under the picker a tap on FIGHT's spot, F and Escape change nothing; it stays up`);
    // a reload and CONTINUE show the same cards
    const ids0 = p.ids.join(",");
    await page.evaluate(() => { try { localStorage.setItem("beltbattles.name.v1", "RUNE TEST"); } catch {} });
    await page.reload();
    await page.waitForFunction(() => !!window.bb && window.bb.screen() === "title" && !window.bb.game.transitioning, null, { timeout: 15000 });
    await frames(page, 30);
    const cont = await regionC(page, "cont");
    if (cont) await tap(page, cdp, { x: cont.cx, y: cont.cy });
    const named = await page.evaluate(() => !!window.bb.nameEntry());
    if (named) { await page.fill("#bb-name-input", "RUNE TEST"); await page.keyboard.press("Enter"); }
    await page.waitForFunction(() => window.bb.screen() === "build" && !window.bb.game.transitioning, null, { timeout: 15000 }).catch(() => {});
    await frames(page, 90);
    p = await picker(page);
    check(!!cont && !!p && p.ids.join(",") === ids0, `${vname}: after a reload, CONTINUE shows the same cards (${p?.ids.join(", ")} vs ${ids0})`);

    // ---- picker-open: the middle card tapped once
    await tap(page, cdp, await cardAt(page, 1));
    p = await picker(page);
    check(!!p && p.open === 1, `${vname}: a tap on a card opens it (its reminder and TAP AGAIN TO TAKE IT)`);
    await onScreen(page, vname, "picker-open");
    await shot(page, vname, "picker-open");
    // ---- taken: tapped again
    const id = p.ids[1];
    await tap(page, cdp, await cardAt(page, 1));
    await frames(page, 4);
    const t = await page.evaluate(() => ({ runes: (window.bb.game.run.build.runes ?? []).map((q) => q.id), pick: window.bb.game.run.runeDay ?? null, toast: window.bb.game.toastLog.slice(-1)[0] ?? "", saved: localStorage.getItem("beltbattles.run.v7") ?? Object.keys(localStorage).filter((x) => x.includes("run")).map((x) => localStorage.getItem(x)).join("") }));
    p = await picker(page);
    check(!p && t.runes[t.runes.length - 1] === id && t.pick === null && /^RUNE TAKEN: /.test(t.toast) && t.saved.includes(`"${id}"`),
      `${vname}: a tap on the open card takes it (${t.runes.join(", ")}), saves the run and closes; toast "${t.toast}"`);
    await onScreen(page, vname, "taken");
    await shot(page, vname, "taken");

    // ---- picker2: dawn of day 7, 2 cards, 6 held
    await openRun(page, 7, ["coin_purse", "coal_chute", "tar_barrel", "spare_hull", "war_edge", "gun_oil"], true);
    p = await picker(page);
    check(!!p && p.ids.length === 2, `${vname}: from day 5 the picker has 2 cards (${p?.ids.join(", ")}, ${p?.tier})`);
    await onScreen(page, vname, "picker2");
    await shot(page, vname, "picker2");

    // ---- bar6: day 6, 6 runes held, no pick pending; then a chip's read-out
    await openRun(page, 6, ["coin_purse", "coal_chute", "tar_barrel", "spare_hull", "war_edge", "rivet_hoard"], false);
    const chips = await page.evaluate(() => window.bb.regions().filter((q) => /^rune-\d+$/.test(q.id) || q.id === "rune-more"));
    check(chips.length === 6 && chips.every((c) => c.w >= 44 && c.h >= 44), `${vname}: 6 runes, 6 chips, each at least 44 CSS px (${chips.map((c) => `${c.w.toFixed(1)}x${c.h.toFixed(1)}`).join(" ")}; ${k.toFixed(3)} CSS px an art px)`);
    await onScreen(page, vname, "bar6");
    await shot(page, vname, "bar6");
    const c3 = await regionC(page, "rune-3");
    await tap(page, cdp, { x: c3.cx, y: c3.cy });
    const ro = await page.evaluate(() => window.bb.game.screen.runeBar.open);
    check(ro === 3 && !!(await regionC(page, "rune-readout")), `${vname}: a tap on the 4th chip opens its read-out (TAKEN DAY 4)`);
    await onScreen(page, vname, "bar6-readout");
    await shot(page, vname, "bar6-readout");
    const shopCard = await page.evaluate(() => { const r = window.bb.game.screen.L.cards[4]; return window.bb.toClient(r.x + r.w / 2, r.y + r.h - 3); });
    await tap(page, cdp, shopCard);
    check((await page.evaluate(() => window.bb.game.screen.runeBar.open)) === -1, `${vname}: a tap elsewhere closes the read-out`);

    // ---- bar10: day 10, 10 runes ("+k" where the row can't hold them), then the full list
    await openRun(page, 10, ["coin_purse", "coal_chute", "tar_barrel", "spare_hull", "war_edge", "rivet_hoard", "gun_oil", "fat_purse", "twin_nails", "tangle_wire"], false);
    const chips10 = await page.evaluate(() => window.bb.regions().filter((q) => /^rune-\d+$/.test(q.id) || q.id === "rune-more"));
    const more = chips10.find((c) => c.id === "rune-more");
    check(chips10.every((c) => c.w >= 44 && c.h >= 44 && c.x >= 0 && c.x + c.w <= vopts.viewport.width), `${vname}: 10 runes: ${chips10.length} chips on screen${more ? " with a +k chip" : ""}, each at least 44 CSS px`);
    await onScreen(page, vname, "bar10");
    await shot(page, vname, "bar10");
    if (more) {
      await tap(page, cdp, { x: more.x + more.w / 2, y: more.y + more.h / 2 });
      check(await page.evaluate(() => window.bb.game.screen.runeBar.list), `${vname}: the +k chip opens the full list`);
      await onScreen(page, vname, "bar10-list");
      await shot(page, vname, "bar10-list");
    }
    await ctx.close();
  }
  await browser.close();
  check(errors.length === 0, `0 console errors${errors.length ? `: ${[...new Set(errors)].join(" | ")}` : ""}`);
  const failed = checks.filter((c) => !c.ok);
  console.log(failed.length ? `RUNE SHOTS: ${failed.length} of ${checks.length} checks FAILED` : `RUNE SHOTS: ${checks.length} checks passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
