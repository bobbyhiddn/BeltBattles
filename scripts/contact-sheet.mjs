// 0.6.2t (REQ-BFG-032): the ability-text CONTACT SHEET for review. Every buyable module at ★1, ★2 and ★3 (each supply
// once), each as its inspect panel, its shop card and the card's inspect text (the tap preview; on desk the hover
// tooltip too), on desktop and on phone. Driven only through the window.bb hooks (bb.catalogue lists the modules, so a
// module the catalogue adds later, such as the turret task's, appears without editing this file) and real input.
//   PLAYWRIGHT_BROWSERS_PATH=... [BB_DIST=dist] node scripts/contact-sheet.mjs <outDir> [family filter]
// Writes <outDir>/<family>-<view>-<n>.png (several modules a sheet, one row a module: per star its panel, its card and
// the card's inspect panel) and <outDir>/index.html (a static page, relative links, every module listed by family).
// 0b.3: each shop capture waits until the caravan has parked (the cards slide in for about 0.8 s); the script checks
// caravan.ready at every capture and fails otherwise.

import { chromium } from "playwright-core";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { VIEWS } from "./shots-list.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = process.env.BB_DIST ? resolve(process.env.BB_DIST) : join(ROOT, "dist");
const OUT = resolve(process.argv[2] ?? join(ROOT, "contact-sheet"));
const FAMILY = process.argv[3] ?? "";
const ORIGIN = "http://bb.test";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
const PLATFORMS = { desk: VIEWS.desk, phone: VIEWS.phone };
/** Families in catalogue kind order, with their sheet names (0.6.2rel: the 13 buyable turrets, REQ-BFG-031; a turret's
 *  panel is the copy in cargo, like a core's or a piece of gear's). */
const FAMILIES = [
  ["gate", "rigs", "RIGS"], ["factory", "factories", "FACTORIES"], ["core", "cores", "TURRET CORES"], ["mod", "gear", "TURRET GEAR"],
  ["turret", "turrets", "TURRETS"], ["supply", "supplies", "SUPPLIES"],
];
const PER_SHEET = 6; // modules (rows) a sheet
const SCALE = 2; // logical px -> sheet px

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------------------------------------ in-page scenes

/** In page: a fresh FURNACE run in the build screen (seed 12345), stepped until the caravan parks; `setup(g, run)`. */
async function fresh(page, setup, arg) {
  await page.evaluate(({ setup, arg }) => {
    const g = window.bb.game;
    g.run = null;
    window.bb.clearPool();
    window.bb.setReducedMotion(false);
    window.bb.open("build", "furnace", 12345);
    for (let i = 0; i < 20; i++) g.step(1 / 60);
    for (let i = 0; i < 120 && !g.screen.caravan.ready; i++) g.step(1 / 60);
    new Function("g", "run", "arg", setup)(g, g.run, arg);
    g.screen.touched();
    for (let i = 0; i < 12; i++) g.step(1 / 60);
    g.render();
  }, { setup, arg });
}

/** In page: step until parked, render, and check the caravan parked (0b.3); returns the UI regions of the frame. */
async function settle(page) {
  return page.evaluate(() => {
    const g = window.bb.game;
    for (let i = 0; i < 120 && !g.screen.caravan.ready; i++) g.step(1 / 60);
    g.render();
    if (!g.screen.caravan.ready) throw new Error("contact sheet: captured before the caravan parked (0b.3)");
    return g.ui.regions.map((q) => ({ id: q.id, ...q.r }));
  });
}

/** A rig placed through real input: moved from cargo onto the build screen's own suggested cell (BuildScreen.dragPlan),
 *  so it lands at the rotation a player's drop gives it (actions.ts rigRotAt); then selected. */
async function placeRig(page, touch, def, stars) {
  await fresh(page, "run.gold = 0; run.inventory = [{ uid: 9401, def: arg.def, ...(arg.stars > 1 ? { stars: arg.stars } : {}) }];", { def, stars });
  const plan = await page.evaluate(() => {
    const p = window.bb.game.screen.dragPlan();
    return p ? { a: window.bb.toClient(p.from.x, p.from.y), b: window.bb.toClient(p.to.x, p.to.y) } : null;
  });
  if (!plan) throw new Error(`contact sheet: no cell to place ${def}`);
  if (touch) {
    await page.touchscreen.tap(plan.a.x, plan.a.y);
    await sleep(80);
    await page.touchscreen.tap(plan.b.x, plan.b.y);
  } else {
    await page.mouse.move(plan.a.x, plan.a.y);
    await page.mouse.down();
    await page.mouse.move(plan.b.x, plan.b.y, { steps: 8 });
    await sleep(60);
    await page.mouse.up();
  }
  await sleep(80);
  const placed = await page.evaluate(() => {
    const g = window.bb.game;
    const ok = g.run.build.items.some((p) => p.uid === 9401);
    if (ok) g.screen.select({ kind: "item", uid: 9401 });
    for (let i = 0; i < 12; i++) g.step(1 / 60);
    g.render();
    return ok;
  });
  if (!placed) throw new Error(`contact sheet: ${def} ★${stars} wasn't placed`);
}

/** The scene for a module's inspect panel at a star: a placed rig or factory, else the part in cargo. */
async function panelScene(page, touch, m, stars) {
  if (m.kind === "gate") return placeRig(page, touch, m.id, stars);
  if (m.kind === "factory") {
    return fresh(page, `run.build.items.push({ uid: 9101, def: arg.def, x: 6, y: 6, ...(arg.stars > 1 ? { stars: arg.stars } : {}) });
      run.build.routes.push({ factory: 9101, cells: [56, 55, 45, 35, 25, 15, 5] });
      g.screen.select({ kind: "item", uid: 9101 });`, { def: m.id, stars });
  }
  return fresh(page, `run.inventory = [{ uid: 9401, def: arg.def, ...(arg.stars > 1 ? { stars: arg.stars } : {}) }];
    g.screen.select({ kind: "cargo", uid: 9401 });`, { def: m.id, stars });
}

/** The shop scene for a module's card at a star: one wagon offering it; ★2 holds one ★1 copy (MERGE ★2), ★3 a ★2 and a
 *  ★1 (MERGE ★3). `mode`: "select" (the card selected: its inspect panel, the tap preview) or "hover" (desk: the hover
 *  panel and the tooltip under the card). */
async function shopScene(page, m, stars, mode) {
  await fresh(page, `run.gold = 99;
    run.inventory = arg.stars === 3 ? [{ uid: 9501, def: arg.def, stars: 2 }, { uid: 9502, def: arg.def }] : arg.stars === 2 ? [{ uid: 9501, def: arg.def }] : [];
    run.shop.wagons = [{ merchant: arg.merchant, offers: [{ def: arg.def, price: arg.price, sold: false }] }];
    g.screen.boughtOnce = true;
    if (arg.mode === "hover") g.screen.hover = { wagon: 0, slot: 0 };
    else g.screen.select({ kind: "offer", wagon: 0, slot: 0 });`, { def: m.id, stars, merchant: m.merchant, price: m.price, mode });
}
// ---------------------------------------------------------------------------------------------------------- captures

/** In page: copy a logical rect of the game canvas (its backing store is the logical resolution) under `key`. */
async function crop(page, key, pick) {
  return page.evaluate(({ key, pick }) => {
    const g = window.bb.game, s = g.screen;
    const regions = g.ui.regions.map((q) => ({ id: q.id, ...q.r }));
    const card = s.L.cards[0];
    const r = pick === "panel" ? regions.find((q) => q.id === "details")
      : pick === "card" ? { x: card.x - 3, y: card.y - (s.L.tags ? 10 : 3), w: card.w + 6, h: card.h + (s.L.tags ? 13 : 6) }
      : { x: Math.max(0, card.x - 50), y: card.y - 10, w: card.w + 100, h: card.h + 74 }; // the card and its tooltip
    if (!r) throw new Error(`contact sheet: no ${pick} region for ${key}`);
    const x = Math.max(0, Math.round(r.x)), y = Math.max(0, Math.round(r.y));
    const w = Math.min(g.canvas.width - x, Math.round(r.w)), h = Math.min(g.canvas.height - y, Math.round(r.h));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d").drawImage(g.canvas, x, y, w, h, 0, 0, w, h);
    (window.__cs ??= {})[key] = c;
    return { w, h, parked: g.screen.caravan.ready };
  }, { key, pick });
}

/** Capture every module's tiles on one platform: per star its panel, its card and the card's inspect panel. */
async function captureAll(page, touch, view, modules) {
  let n = 0, parked = 0;
  const count = (c) => { n++; if (c.parked) parked++; };
  for (const m of modules) {
    for (let s = 1; s <= m.stars; s++) {
      if (m.kind !== "supply") {
        await panelScene(page, touch, m, s);
        await settle(page);
        count(await crop(page, `${m.id}|${s}|panel`, "panel"));
      }
      if (view === "desk") {
        await shopScene(page, m, s, "hover");
        await settle(page);
        count(await crop(page, `${m.id}|${s}|card`, "hover"));
        await shopScene(page, m, s, "select");
        await settle(page);
        count(await crop(page, `${m.id}|${s}|offer`, "panel"));
      } else {
        await shopScene(page, m, s, "select");
        await settle(page);
        count(await crop(page, `${m.id}|${s}|card`, "card"));
        count(await crop(page, `${m.id}|${s}|offer`, "panel"));
      }
    }
    console.log(`  ${view} ${m.id}: ${m.stars} star(s)`);
  }
  return { n, parked };
}

/** In page: tile the captured crops of `rows` into one sheet; returns its PNG data URL. */
async function sheet(page, title, rows, scale) {
  return page.evaluate(({ title, rows, scale }) => {
    const cs = window.__cs, KINDS = ["panel", "card", "offer"], GAP = 10, STAR_GAP = 28, LABEL = 190, HEAD = 56, ROW_GAP = 26;
    const size = (k) => (cs[k] ? { w: cs[k].width * scale, h: cs[k].height * scale } : { w: 0, h: 0 });
    const top = Math.max(...rows.map((r) => r.stars));
    // each (star, kind) column as wide as its widest tile on the sheet
    const colW = [];
    for (let s = 1; s <= top; s++) for (const k of KINDS) colW.push(Math.max(0, ...rows.map((r) => size(`${r.id}|${s}|${k}`).w)));
    const starX = [];
    let x = LABEL;
    for (let s = 0; s < top; s++) {
      starX.push(x);
      for (let k = 0; k < 3; k++) x += colW[s * 3 + k] + (colW[s * 3 + k] ? GAP : 0);
      x += STAR_GAP;
    }
    const rowH = rows.map((r) => 22 + Math.max(0, ...[1, 2, 3].flatMap((s) => KINDS.map((k) => size(`${r.id}|${s}|${k}`).h))));
    const c = document.createElement("canvas");
    c.width = x;
    c.height = HEAD + rowH.reduce((a, b) => a + b + ROW_GAP, 0);
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.fillStyle = "#101419";
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#e8e2d0";
    g.font = "bold 22px monospace";
    g.fillText(title, 16, 34);
    let y = HEAD;
    rows.forEach((r, i) => {
      g.fillStyle = "#e8e2d0";
      g.font = "bold 16px monospace";
      g.fillText(r.name, 16, y + 20);
      g.fillStyle = "#8a93a0";
      g.font = "13px monospace";
      g.fillText(`${r.id} (${r.kind})`, 16, y + 40);
      for (let s = 1; s <= r.stars; s++) {
        g.fillStyle = "#e0b040";
        g.font = "bold 15px monospace";
        g.fillText(r.kind === "supply" ? "★1: CARD / CARD'S PANEL" : `★${s}: PANEL / CARD / CARD'S PANEL`, starX[s - 1], y + 14);
        let tx = starX[s - 1];
        KINDS.forEach((k, j) => {
          const t = cs[`${r.id}|${s}|${k}`];
          if (t) g.drawImage(t, tx, y + 22, t.width * scale, t.height * scale);
          const w = colW[(s - 1) * 3 + j];
          tx += w + (w ? GAP : 0);
        });
      }
      g.fillStyle = "#2a323c";
      g.fillRect(8, y + rowH[i] + ROW_GAP / 2, c.width - 16, 1);
      y += rowH[i] + ROW_GAP;
    });
    return c.toDataURL("image/png");
  }, { title, rows, scale });
}
// -------------------------------------------------------------------------------------------------------------- main

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function indexHtml(families, stamp) {
  const nav = families.map((f) => `<a href="#${f.slug}">${esc(f.title)}</a> (${f.modules.length})`).join(" · ");
  const body = families.map((f) => {
    const rows = f.modules.map((m) => `<tr><td>${esc(m.name)}</td><td>${esc(m.id)}</td><td>${m.stars === 1 ? "★1" : "★1-★3"}</td>`
      + `<td>${f.sheets.filter((s) => s.ids.includes(m.id)).map((s) => `<a href="${s.file}">${s.view} ${s.n}</a>`).join(" · ")}</td></tr>`).join("\n");
    const imgs = f.sheets.map((s) => `<figure><figcaption><a href="${s.file}">${esc(s.file)}</a>: ${esc(s.ids.join(", "))}</figcaption>`
      + `<a href="${s.file}"><img loading="lazy" src="${s.file}" alt="${esc(`${f.title} ${s.view} ${s.n}`)}"></a></figure>`).join("\n");
    return `<section id="${f.slug}"><h2>${esc(f.title)}</h2>\n<table><tr><th>MODULE</th><th>ID</th><th>STARS</th><th>SHEETS</th></tr>\n${rows}\n</table>\n${imgs}</section>`;
  }).join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>BeltBattles 0.6.2t: ability text contact sheet</title>
<style>body{background:#101419;color:#e8e2d0;font:14px/1.45 monospace;margin:24px}a{color:#e0b040}table{border-collapse:collapse;margin:8px 0 18px}
td,th{border:1px solid #2a323c;padding:3px 8px;text-align:left}figure{margin:14px 0}img{max-width:100%;border:1px solid #2a323c}h2{margin-top:36px}</style></head>
<body><h1>BeltBattles 0.6.2t: readable ability text (REQ-BFG-032)</h1>
<p>Every buyable module at ★1, ★2 and ★3 (each supply once), on desktop (1920x1080) and phone (390x844). For each star, one row
shows three tiles: the module's inspect panel (a placed rig or factory, else the part in cargo), its shop card (on desktop with
the hover tooltip under it; at ★2 and ★3 the card carries the MERGE badge of an offer that merges on purchase), and the card's
inspect panel (the phone's tap preview; at ★2 and ★3 its MERGES WITH line). Generated by <code>scripts/contact-sheet.mjs</code>
through the window.bb hooks; every shop capture waited for the caravan to park. ${esc(stamp)}</p>
<p>${nav}</p>
${body}
</body></html>
`;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
  const errors = [];
  const families = [];
  let total = 0, parkedAll = 0, files = 0;
  for (const [view, vopts] of Object.entries(PLATFORMS)) {
    const ctx = await browser.newContext(vopts);
    await ctx.route(`${ORIGIN}/**`, serve);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`[${view}] pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`[${view}] ${m.type()}: ${m.text()}`); });
    await page.goto(`${ORIGIN}/index.html`);
    await page.waitForFunction(() => !!window.bb, null, { timeout: 10000 });
    const catalogue = await page.evaluate(() => window.bb.catalogue());
    for (const [kind, slug, title] of FAMILIES) {
      if (FAMILY && !slug.includes(FAMILY)) continue;
      const modules = catalogue.filter((m) => m.kind === kind);
      if (!modules.length) continue;
      let fam = families.find((f) => f.slug === slug);
      if (!fam) families.push((fam = { slug, title, modules, sheets: [] }));
      const { n, parked } = await captureAll(page, !!vopts.hasTouch, view, modules);
      total += n;
      parkedAll += parked;
      for (let i = 0; i < modules.length; i += PER_SHEET) {
        const rows = modules.slice(i, i + PER_SHEET), k = i / PER_SHEET + 1, pages = Math.ceil(modules.length / PER_SHEET);
        const url = await sheet(page, `${title}: ${view.toUpperCase()} (${k}/${pages})`, rows, SCALE);
        const file = `${slug}-${view}-${k}.png`;
        await writeFile(join(OUT, file), Buffer.from(url.split(",")[1], "base64"));
        fam.sheets.push({ file, view, n: k, ids: rows.map((m) => m.id) });
        files++;
        console.log(`${file}: ${rows.map((m) => m.id).join(", ")}`);
      }
      await page.evaluate(() => { window.__cs = {}; });
    }
    await ctx.close();
  }
  await browser.close();
  for (const f of families) f.sheets.sort((a, b) => a.view.localeCompare(b.view) || a.n - b.n);
  await writeFile(join(OUT, "index.html"), indexHtml(families, `${total} captures, ${files} sheets.`));
  console.log(`${total} captures (${parkedAll} with the caravan parked), ${files} sheets, index.html -> ${OUT}`);
  if (parkedAll !== total) throw new Error("contact sheet: a capture was taken before the caravan parked");
  if (errors.length) console.log("ERRORS:\n" + [...new Set(errors)].join("\n"));
  else console.log("no console errors");
}

main().catch((e) => { console.error(e); process.exit(1); });
