// RUNES-1 (REQ-BFG-058, M5): the dawn rune picker and the rune bar on the BUILT page, in Chromium with real input, on the
// operator's phone view (402x690 CSS px, DPR 3, isMobile, hasTouch; touch taps through CDP) and the desk (1280x800).
// Shots: picker3 (dawn of day 4, 3 cards, 3 runes held), picker-open (its middle card tapped once), taken (tapped again:
// the rune taken, the toast, the bar), picker2 (dawn of day 7, 2 cards, 6 held), bar6 (day 6, 6 runes), bar6-readout (a
// chip tapped: its read-out), bar10 (day 10, 10 runes) and bar10-list (the "+k" chip's full list where the row can't hold
// them). Checks: every UI region and the picker's cards on screen; each rune chip at least 44 CSS px; a reload and
// CONTINUE show the same cards; the picker takes every press (a tap on FIGHT's spot under it changes nothing).
// RUNES-2a (the epics and legendaries): one seed whose walk of dawns 1-10 (findTiers: each dawn's offer through the
// page's own run.ts pendingRune, a card taken at each, so every rune held was offered at its dawn) has an EPIC dawn on day
// 3 or 4 and a LEGENDARY one from day 5. Shots: epic3 (that epic dawn, 3 cards), epic3-open (a card tapped once),
// legend2 (the legendary dawn, 2 cards), legend2-open, bar10-tiers (day 10, the walk's 10 runes), bar10-tiers-readout (an
// epic or legendary chip's read-out) and bar10-tiers-list (the "+k" list, where the row can't hold them). Checks, read off
// the canvas: each card's frame and each chip's edge in its tier's colour (palette.ts RARITY_COLOR), the dawn line's tier
// word in it, every card's effect on one line (its height), no name or tag running into a card's right edge.
// Usage: npx vite build --outDir <dir> && PLAYWRIGHT_BROWSERS_PATH=... BB_TOUCH=1 node scripts/runeshots.mjs <outDir> [--dist <dir>]
// Exit 1 if a check fails.

import { chromium } from "playwright-core";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { autoFight } from "./scouthook.mjs"; // SCOUT-1 (REQ-BFG-076): the FIGHT step (bb.fight(true): battles skip scouting)

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

/** A run (seed `seed`) at the dawn of `day` holding `runes` (ids, pick order); `pick`: today's rune pick pending. */
async function openRun(page, day, runes, pick, seed = 12345) {
  await page.evaluate(([d, list, p, sd]) => {
    window.bb.openDawn({ hero: "furnace", day: d, gold: 12, seed: sd });
    const r = window.bb.game.run;
    window.bb.holdRunes(list); // as taken: a HULL or BELT rune's amount on the build (run.ts takeRune)
    if (p) r.runeDay = d;
    else delete r.runeDay;
  }, [day, runes, pick, seed]);
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

// ---- RUNES-2a: the epic and legendary dawns ---------------------------------------------------------------------------

/** palette.ts RARITY_COLOR (steel3, cyan, plum4, yellow): a card's frame and a chip's edge in its tier's colour. */
const RARITY = { common: "#AFB1A3", rare: "#40E0DA", epic: "#8A5CB0", legendary: "#F6CF48" };
const SLATE4 = "#7A8F9A"; // the card's tag line
/** The walk takes these when offered (the long names and texts, so the shots show they fit), else the first card. */
const PREFER = ["long_road", "first_blood", "last_stand"];

/**
 * A seed (hero furnace) whose walk of dawns 1-10 has an EPIC dawn of 3 cards on day 3 or 4 (`de`) and a LEGENDARY one of
 * 2 from day 5 (`dl`; day 5 or 6 preferred, so the phone's row shows its chip). Each dawn's offer is the page's own
 * (run.ts pendingRune through the picker's offer(), on a stand-in run, so no tooling hook), and the walk takes a card at
 * each (PREFER, else the first): `picks` are legal for the seed by construction (runeProblem: each offered at its dawn,
 * given the ones before). The build screen must be up.
 */
const findTiers = (page) => page.evaluate(({ prefer }) => {
  const s = window.bb.game.screen;
  const offer = (seed, day, held) => s.runePicker.offer({
    refit: false, run: { seed, day, hero: "furnace", build: { runes: held.map((id) => ({ id })) }, runeDay: day, over: null, stage: "caravan" },
  });
  let best = null;
  for (let seed = 1; seed <= 30000; seed++) {
    const picks = [], offers = [];
    for (let d = 1; d <= 10; d++) {
      const o = offer(seed, d, picks);
      if (!o) break;
      offers.push({ tier: o.tier, ids: [...o.ids] });
      picks.push(prefer.find((id) => o.ids.includes(id)) ?? o.ids[0]);
    }
    if (picks.length < 10) continue;
    const de = [3, 4].find((d) => offers[d - 1].tier === "epic" && offers[d - 1].ids.length === 3);
    const dl = [5, 6, 7, 8, 9, 10].find((d) => offers[d - 1].tier === "legendary" && offers[d - 1].ids.length === 2);
    if (!de || !dl) continue;
    const E = offers[de - 1].ids, L = offers[dl - 1].ids;
    const score = (dl <= 6 ? 8 : 0) + (E.includes("last_stand") ? 4 : 0) + (L.includes("long_road") ? 4 : 0) + (L.includes("first_blood") ? 2 : 0);
    if (!best || score > best.score) best = { seed, de, dl, picks, offers, score };
    if (score >= 18) break;
  }
  return best;
}, { prefer: PREFER });

/** What the last frame shows, read off the canvas (art px): the picker's card frames (a card's top edge), heights, the
 *  pixels of its head's right margin in the frame's or the tag's colour, and the dawn line's pixels in each tier colour;
 *  the rune bar's chip edges (a chip's bottom edge); the read-out's frame and height. */
const look = (page) => page.evaluate(({ RAR, SL4 }) => {
  const game = window.bb.game, s = game.screen, g = game.g;
  const hex = (d, i) => "#" + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
  const px = (x, y) => hex(g.getImageData(Math.floor(x), Math.floor(y), 1, 1).data, 0);
  const out = {};
  const info = s.runePicker?.info(s);
  if (info) {
    const L = info.layout;
    out.edges = L.cards.map((c) => px(c.x + c.w / 2, c.y + 1));
    out.heights = L.cards.map((c) => c.h);
    out.heads = L.cards.map((c, i) => {
      const d = g.getImageData(c.x + c.w - 5, c.y + 6, 3, 19).data;
      let n = 0;
      for (let j = 0; j < d.length; j += 4) if (hex(d, j) === out.edges[i] || hex(d, j) === SL4) n++;
      return n;
    });
    const band = g.getImageData(0, L.top + 11, game.W, 7).data;
    out.word = {};
    for (const [t, col] of Object.entries(RAR)) {
      let n = 0;
      for (let j = 0; j < band.length; j += 4) if (hex(band, j) === col) n++;
      out.word[t] = n;
    }
  }
  const B = s.runeBar?.layout(s);
  if (B) out.chips = B.chips.map((c) => px(c.x + c.w / 2, c.y + c.h - 3));
  const ro = game.ui.regions.filter((q) => q.id === "rune-readout").pop();
  if (ro) out.readout = { ...ro.r, edge: px(ro.r.x + ro.r.w / 2, ro.r.y + 1) };
  return out;
}, { RAR: RARITY, SL4: SLATE4 });

/** The picker's tier checks: every card framed in `tier`'s colour, the dawn line's tier word in it, every card's effect
 *  on one line (runeBar.ts runeCardH: 31 + 9 a line + 4, so 44 closed; open, + 1 + 7 a reminder line + the hint's 13),
 *  and no name or tag running into a card's right margin. `open`: the opened card (-1 none). */
async function tierLook(page, vname, name, tier, open) {
  const lk = await look(page), col = RARITY[tier], T = tier.toUpperCase();
  check(!!lk.edges?.length && lk.edges.every((e) => e === col), `${vname} ${name}: every card framed in the ${T} colour ${col} (${lk.edges?.join(" ")})`);
  check((lk.word?.[tier] ?? 0) >= 30, `${vname} ${name}: the dawn line's "${T} RUNES" in that colour (${lk.word?.[tier]} px)`);
  check(!!lk.heights && lk.heights.every((h, i) => (i === open ? h >= 58 && (h - 58) % 7 === 0 : h === 44)),
    `${vname} ${name}: every card's effect on one line (card heights ${lk.heights?.join(" ")} art px)`);
  check(!!lk.heads && lk.heads.every((n) => n === 0), `${vname} ${name}: no card's name or tag runs into its right edge (${lk.heads?.join(" ")} px there)`);
}

/** A reload, then CONTINUE on the title (the name asked for if it is): true when the build screen is back. */
async function reloadContinue(page, cdp) {
  await page.reload();
  await page.waitForFunction(() => !!window.bb && window.bb.screen() === "title" && !window.bb.game.transitioning, null, { timeout: 15000 });
  await frames(page, 30);
  const cont = await regionC(page, "cont");
  if (!cont) return false;
  await tap(page, cdp, { x: cont.cx, y: cont.cy });
  if (await page.evaluate(() => !!window.bb.nameEntry())) { await page.fill("#bb-name-input", "RUNE TEST"); await page.keyboard.press("Enter"); }
  const ok = await page.waitForFunction(() => window.bb.screen() === "build" && !window.bb.game.transitioning, null, { timeout: 15000 }).then(() => true, () => false);
  await frames(page, 90);
  return ok;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
  const errors = [];
  let T = null; // RUNES-2a: the seed and its walk (findTiers), found once
  for (const [vname, vopts] of Object.entries(VIEWS)) {
    const ctx = await browser.newContext(vopts);
    await autoFight(ctx); // SCOUT-1: battles skip scouting, as before SCOUT-1
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

    // ---- RUNES-2a: an EPIC dawn, a LEGENDARY dawn and a bar of 10 holding both, on one seed's walk (findTiers)
    T = T ?? await findTiers(page);
    const tiers = T ? T.offers.map((o) => o.tier[0].toUpperCase()).join("") : "";
    check(!!T, `${vname}: a seed with an EPIC dawn on day 3 or 4 and a LEGENDARY one from day 5${T ? ` (seed ${T.seed}; tiers by day ${tiers}; day ${T.de}: ${T.offers[T.de - 1].ids.join(", ")}; day ${T.dl}: ${T.offers[T.dl - 1].ids.join(", ")}; held ${T.picks.join(", ")})` : ""}`);
    if (T) {
      // ---- epic3: the epic dawn, 3 cards, the walk's runes before it held; a reload and CONTINUE show the same cards
      await openRun(page, T.de, T.picks.slice(0, T.de - 1), true, T.seed);
      p = await picker(page);
      check(!!p && p.day === T.de && p.tier === "epic" && p.ids.length === 3 && p.ids.join() === T.offers[T.de - 1].ids.join(),
        `${vname}: an EPIC dawn (day ${T.de}, seed ${T.seed}) with 3 cards (${p?.ids.join(", ")}, ${p?.tier})`);
      await tierLook(page, vname, "epic3", "epic", -1);
      await onScreen(page, vname, "epic3");
      await shot(page, vname, "epic3");
      const e0 = p?.ids.join(",");
      const back = await reloadContinue(page, cdp);
      p = await picker(page);
      check(back && p?.ids.join(",") === e0 && p?.tier === "epic", `${vname}: after a reload, CONTINUE shows the same EPIC cards (${p?.ids.join(", ")})`);
      // ---- epic3-open: one card tapped once (LAST STAND's when offered: the longest epic text)
      const ie = p?.ids.includes("last_stand") ? p.ids.indexOf("last_stand") : 1;
      await tap(page, cdp, await cardAt(page, ie));
      p = await picker(page);
      check(!!p && p.open === ie, `${vname}: a tap on the epic card ${p?.ids[ie]} opens it (its reminder and TAP AGAIN TO TAKE IT)`);
      await tierLook(page, vname, "epic3-open", "epic", ie);
      await onScreen(page, vname, "epic3-open");
      await shot(page, vname, "epic3-open");

      // ---- legend2: the legendary dawn, 2 cards
      await openRun(page, T.dl, T.picks.slice(0, T.dl - 1), true, T.seed);
      p = await picker(page);
      check(!!p && p.day === T.dl && p.tier === "legendary" && p.ids.length === 2 && p.ids.join() === T.offers[T.dl - 1].ids.join(),
        `${vname}: a LEGENDARY dawn (day ${T.dl}) with 2 cards (${p?.ids.join(", ")}, ${p?.tier})`);
      await tierLook(page, vname, "legend2", "legendary", -1);
      await onScreen(page, vname, "legend2");
      await shot(page, vname, "legend2");
      // ---- legend2-open (THE LONG ROAD's card when offered, else FIRST BLOOD's, else the first)
      const il = Math.max(0, ["long_road", "first_blood"].map((id) => p?.ids.indexOf(id) ?? -1).find((i) => i >= 0) ?? 0);
      await tap(page, cdp, await cardAt(page, il));
      p = await picker(page);
      check(!!p && p.open === il, `${vname}: a tap on the legendary card ${p?.ids[il]} opens it`);
      await tierLook(page, vname, "legend2-open", "legendary", il);
      await onScreen(page, vname, "legend2-open");
      await shot(page, vname, "legend2-open");

      // ---- bar10-tiers: day 10, the walk's 10 runes (epics and legendaries among them), no pick pending
      await openRun(page, 10, T.picks, false, T.seed);
      const ch = await page.evaluate(() => window.bb.regions().filter((q) => /^rune-\d+$/.test(q.id) || q.id === "rune-more"));
      const mo = ch.find((c) => c.id === "rune-more");
      check(ch.length > 1 && ch.every((c) => c.w >= 44 && c.h >= 44 && c.x >= 0 && c.x + c.w <= vopts.viewport.width),
        `${vname}: 10 runes (tiers ${tiers}): ${ch.length} chips${mo ? " with a +k chip" : ""}, each at least 44 CSS px (${ch.map((c) => `${c.w.toFixed(1)}x${c.h.toFixed(1)}`).join(" ")})`);
      let lk = await look(page);
      check(!!lk.chips?.length && lk.chips.every((e, i) => e === RARITY[T.offers[i].tier]), `${vname} bar10-tiers: each chip's edge in its tier's colour (${lk.chips?.join(" ")})`);
      await onScreen(page, vname, "bar10-tiers");
      await shot(page, vname, "bar10-tiers");
      // a chip's read-out: the legendary's where the row shows its chip, else the epic's
      const ri = T.dl - 1 < (lk.chips?.length ?? 0) ? T.dl - 1 : T.de - 1, rt = T.offers[ri].tier;
      const rc = await regionC(page, `rune-${ri}`);
      if (rc) await tap(page, cdp, { x: rc.cx, y: rc.cy });
      lk = await look(page);
      check(!!rc && (await page.evaluate(() => window.bb.game.screen.runeBar.open)) === ri && !!lk.readout && lk.readout.edge === RARITY[rt] && (lk.readout.h - 45) % 7 === 0,
        `${vname}: a tap on chip ${ri + 1} (${T.picks[ri]}) opens its ${rt.toUpperCase()} read-out (TAKEN DAY ${ri + 1}), framed ${lk.readout?.edge}, its effect on one line (${lk.readout?.h} art px)`);
      await onScreen(page, vname, "bar10-tiers-readout");
      await shot(page, vname, "bar10-tiers-readout");
      const rr = await regionC(page, "rune-readout");
      if (rr) await tap(page, cdp, { x: rr.cx, y: rr.cy });
      check((await page.evaluate(() => window.bb.game.screen.runeBar.open)) === -1, `${vname}: a tap on the read-out closes it`);
      if (mo) {
        await tap(page, cdp, { x: mo.x + mo.w / 2, y: mo.y + mo.h / 2 });
        check(await page.evaluate(() => window.bb.game.screen.runeBar.list), `${vname}: the +k chip opens the full list of 10`);
        await onScreen(page, vname, "bar10-tiers-list");
        await shot(page, vname, "bar10-tiers-list");
      }
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
