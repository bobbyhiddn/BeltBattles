// 0.8.0 RC M5 (REQ-BFG-011, REQ-BFG-016, REQ-BFG-009): a scripted run for each playable hero through day 3, on the desk
// (1920x1080, mouse) and the phone (390x844, touch), with real input (scripts/playthrough.mjs scriptedRun):
//  - offline: the offline page from file://. No request but the page itself, no online session.
//  - online: the online page at / of the BUILT ghost server (server/dist/ghost-server.mjs, BB_GHOST_STATIC), seeded, uploads
//    open. Each dusk fights an online ghost (the session's seen list grows by one a day, the server serves no stand-in),
//    and each dusk's signed upload gets 201 (the server's own log line, POST /v1/ghosts 201).
//  - later: a new player (another browser profile, so another device key; beltbattles.runs.v1 = 3, so not a new player)
//    on a second server over those uploads alone (the store's ghosts.jsonl without the seed pool; uploads open) meets one
//    of them at dusk 1: an online ghost whose id is one the runs uploaded. The one console line allowed there is Chromium's
//    own network line for the server's designed none-yet answer (404 on GET /v1/ghosts/match: day 2's prefetch, when no
//    uploaded ghost matches the player's record yet; server/app.ts; the client falls back to the stand-in). It is counted: the
//    count must equal the server's own `GET /v1/ghosts/match 404` log lines for that player, and a fallback fetch must show.
//  - old (with --old <dir>): the 0.7.0 online page (built from branch v070-rc), and 0.7.0's own playthrough.mjs to drive
//    it, served at / of the 0.8.0 server with uploads open. Its dusk-1 fetch asks for bb-0.6.2 and falls back to the
//    stand-in (404), its upload is refused (422), and NEXT goes on to day 2. The only console lines allowed are
//    Chromium's own network lines for those two refused requests.
// Any other page error, console error or warning, or failed request fails a run.
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node scripts/rcruns.mjs <outDir> --pages <dir> [--old <v070 export dir>]
//        [--only offline,online,later,old] [--heroes furnace,weaver,foundry,bastion]
// <dir> holds the two pages (BeltBattles-*-online.html and the other BeltBattles-*.html, as asynccheck --pages).

import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { VIEWS } from "./shots-list.mjs";
import { scriptedRun } from "./playthrough.mjs";
import { autoFight } from "./scouthook.mjs"; // SCOUT-1 (REQ-BFG-076): the FIGHT step (bb.fight(true): battles skip scouting)

const ROOT = new URL("..", import.meta.url).pathname;
const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const OUT = resolve(argv[0] && !argv[0].startsWith("--") ? argv[0] : join(ROOT, "shots", "rcruns"));
const PAGES = resolve(opt("pages") ?? "");
const OLD = opt("old") ? resolve(opt("old")) : null;
const ONLY = (opt("only") ?? "offline,online,later,old").split(",");
const SERVER = join(ROOT, "server", "dist", "ghost-server.mjs");
const HEROES = (opt("heroes") ?? "furnace,weaver,foundry,bastion").split(","); // the four playable heroes
const RUNVIEWS = { desk: [VIEWS.desk, 0.3], phone: [VIEWS.phone, 0.5] };
mkdirSync(OUT, { recursive: true });

const lines = [];
const log = (s) => { lines.push(s); console.log(s); };
const checks = [];
const check = (ok, what) => { checks.push({ ok: !!ok, what }); log(`${ok ? "PASS" : "FAIL"}  ${what}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pages() {
  const files = readdirSync(PAGES).filter((f) => /^BeltBattles-.*\.html$/.test(f));
  const online = files.filter((f) => f.endsWith("-online.html")), offline = files.filter((f) => !f.endsWith("-online.html"));
  if (online.length !== 1 || offline.length !== 1) throw new Error(`--pages ${PAGES}: want one online and one offline page, got ${files.join(", ")}`);
  return { online: join(PAGES, online[0]), offline: join(PAGES, offline[0]) };
}

/** The built ghost server over `data`, serving `page` at /; resolves with its base URL, its log lines and a stop(). */
async function startServer(page, data, uploads, seed = true) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const stat = mkdtempSync(join(tmpdir(), "bb-rcruns-static-"));
  copyFileSync(page, join(stat, "index.html"));
  const env = {
    PATH: process.env.PATH, BB_GHOST_DATA: data, BB_GHOST_UPLOADS: uploads, BB_GHOST_HOST: "127.0.0.1", BB_GHOST_PORT: String(port),
    BB_GHOST_ORIGINS: `http://127.0.0.1:${port}`, BB_GHOST_STATIC: stat,
  };
  if (seed) {
    const s = spawn(process.execPath, [SERVER, "seed"], { env });
    let out = "";
    s.stdout.on("data", (d) => (out += d));
    s.stderr.on("data", (d) => (out += d));
    const code = await new Promise((r) => s.on("exit", r));
    log(`  seed: exit ${code}; ${out.trim().split("\n").at(-1)}`);
    if (code !== 0) throw new Error("seed failed");
  }
  const srv = spawn(process.execPath, [SERVER], { env });
  const out = [];
  const take = (d) => out.push(...String(d).split("\n").filter(Boolean));
  srv.stdout.on("data", take);
  srv.stderr.on("data", take);
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(`${base}/v1/health`); if (r.ok) { log(`  health: ${await r.text()}`); break; } } catch { /* not yet */ }
    await sleep(100);
  }
  return { base, out, stop: async () => { srv.kill(); await new Promise((r) => srv.on("exit", r)); rmSync(stat, { recursive: true, force: true }); } };
}

/** A fresh browser profile on `view`, with the console policy; `allow(text, location)` lets a known line through. */
async function context(browser, view, pin, allow = () => false, init) {
  const ctx = await browser.newContext(view);
  await autoFight(ctx); // SCOUT-1: battles skip scouting, as before SCOUT-1
  const page = await ctx.newPage();
  await page.addInitScript((r) => { Math.random = () => r; }, pin);
  if (init) await page.addInitScript(init);
  const errors = [], allowed = [], requests = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error" && m.type() !== "warning") return;
    const loc = m.location()?.url ?? "";
    (allow(m.text(), loc) ? allowed : errors).push(`${m.type()}: ${m.text()} @ ${loc}`);
  });
  page.on("requestfailed", (r) => errors.push(`requestfailed: ${r.url()}`));
  page.on("request", (r) => requests.push(`${r.method()} ${r.url()}`));
  return { ctx, page, errors, allowed, requests };
}

const posts201 = (out) => out.filter((l) => / POST \/v1\/ghosts 201 /.test(l)).length;

async function offlineRuns(browser, offline) {
  log(`\n## offline: ${offline} from file://`);
  const url = pathToFileURL(offline).href;
  for (const hero of HEROES) for (const [vname, [view, pin]] of Object.entries(RUNVIEWS)) {
    const c = await context(browser, view, pin);
    log(`\n== offline ${hero} ${vname}`);
    try {
      await c.page.goto(url);
      await c.page.waitForFunction(() => !!window.bb && window.bb.screen() === "title", null, { timeout: 15000 });
      const version = await c.page.evaluate(() => window.bb.version);
      const r = await scriptedRun(c.page, !!view.hasTouch, (s) => log(`  ${s}`), { days: 3, roads: "vev", check: "fresh", hero, buys: 8, pool: [] });
      await c.page.screenshot({ path: join(OUT, `offline-${hero}-${vname}-day3.png`) });
      const online = await c.page.evaluate(() => window.bb.online());
      check(version === "0.9.19" && r.days.length >= 3, `offline ${hero} ${vname}: version ${version}, three days played (${r.days.join(" | ")})`);
      check(online === null, `offline ${hero} ${vname}: no online session`);
      const other = c.requests.filter((q) => !/^GET (file|data|blob):/.test(q));
      check(other.length === 0, `offline ${hero} ${vname}: no request but the page (${c.requests.length} file:// requests, ${other.length} others${other.length ? `: ${other.slice(0, 3).join(", ")}` : ""})`);
    } catch (e) {
      check(false, `offline ${hero} ${vname}: ${e.message}`);
    }
    check(c.errors.length === 0, `offline ${hero} ${vname}: 0 console errors${c.errors.length ? `: ${c.errors.slice(0, 3).join(" | ")}` : ""}`);
    await c.ctx.close();
  }
}

async function onlineRuns(browser, online, data) {
  log(`\n## online: ${online} at / of the built server (uploads open), store ${data}`);
  const srv = await startServer(online, data, "open");
  try {
    for (const hero of HEROES) for (const [vname, [view, pin]] of Object.entries(RUNVIEWS)) {
      const c = await context(browser, view, pin);
      log(`\n== online ${hero} ${vname}`);
      const before = posts201(srv.out);
      try {
        await c.page.goto(`${srv.base}/`);
        await c.page.waitForFunction(() => !!window.bb && window.bb.screen() === "title", null, { timeout: 15000 });
        await c.page.waitForFunction(() => window.bb.online()?.active === true, null, { timeout: 15000 });
        // STAGE-0910 F10: store = the server's data dir, so a served ghost is judged by the server's own check with its seed
        const r = await scriptedRun(c.page, !!view.hasTouch, (s) => log(`  ${s}`), { days: 3, roads: "vev", check: "fresh", hero, buys: 8, pool: [], store: data });
        await c.page.screenshot({ path: join(OUT, `online-${hero}-${vname}-day3.png`) });
        await c.page.waitForFunction(() => (window.bb.online()?.uploads ?? 0) >= 3 && window.bb.online()?.lastUpload, null, { timeout: 15000 });
        for (let i = 0; i < 100 && posts201(srv.out) - before < 3; i++) await sleep(100); // the third upload is fire and forget
        const o = await c.page.evaluate(() => window.bb.online());
        const mine = posts201(srv.out) - before;
        log(`  session: url ${o.url}, fetches ${o.fetches}, uploads ${o.uploads}, seen ${o.seen.length} (${o.seen.join(", ")}), lastFetch ${o.lastFetch?.source} ${o.lastFetch?.hero ?? ""}, lastUpload ${JSON.stringify(o.lastUpload)}`);
        check(o.url === srv.base && o.active, `online ${hero} ${vname}: the session's server is the page's own origin`);
        // the session may already have stored tomorrow's ghost (it fetches from the result card on): seen counts it too
        check(r.state.ghosts === 3 && r.state.standins === 0 && o.seen.length >= 3 && o.lastFetch?.source === "server", `online ${hero} ${vname}: three dusks, three online ghosts (state ghosts ${r.state.ghosts}, stand-ins ${r.state.standins}, seen ${o.seen.length})`);
        check(o.uploads === 3 && mine === 3 && o.lastUpload?.ok === true, `online ${hero} ${vname}: three signed uploads, each POST /v1/ghosts 201 in the server's log (${mine})`);
        const hosts = new Set(c.requests.map((q) => new URL(q.split(" ")[1]).host));
        check(hosts.size === 1 && hosts.has(new URL(srv.base).host), `online ${hero} ${vname}: every request to the page's own origin (${[...hosts].join(", ")})`);
      } catch (e) {
        check(false, `online ${hero} ${vname}: ${e.message}`);
      }
      check(c.errors.length === 0, `online ${hero} ${vname}: 0 console errors${c.errors.length ? `: ${c.errors.slice(0, 3).join(" | ")}` : ""}`);
      await c.ctx.close();
    }
  } finally {
    await srv.stop();
  }
  writeFileSync(join(OUT, "rcruns-online-server.log"), srv.out.join("\n") + "\n");
}

async function laterRun(browser, online, data) {
  log(`\n## later: a new player (runs 3) on a server over the uploads alone`);
  const only = mkdtempSync(join(tmpdir(), "bb-rcruns-later-"));
  copyFileSync(join(data, "ghosts.jsonl"), join(only, "ghosts.jsonl"));
  // STAGE-091, backlog 337: the store's day-1 upload ids, read again after each later run. Uploads are open here, so an
  // earlier later player's own dusk-1 upload joins the store, and the next one (3 runs, so matched with uploads) can meet
  // it: a list read once, before the runs, missed that id (H2 saw 85 of 86, then 44 of 44 on a rerun).
  const dayOneIds = () => readFileSync(join(only, "ghosts.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.snapshot.day === 1).map((r) => r.id);
  const ids0 = dayOneIds();
  log(`  the store's day-1 uploads: ${ids0.length} (${ids0.join(", ")})`);
  const srv = await startServer(online, only, "open", false); // open: the later player's own upload gets 201, not a 403 line
  try {
    for (const [vname, [view, pin]] of Object.entries(RUNVIEWS)) {
      // r0913 (ruling 8, cap's RULING B): which uploads are in the store depends on the runs before (the seeded shop moves them), so day 2's
      // prefetch can meet the server's designed none-yet 404 (server/app.ts: "no ghost for this rules version, day and record yet"), and
      // Chromium prints every 404 as a console error. Only that line gets through: the 404 network line for GET /v1/ghosts/match on this
      // server (no 422, no POST /v1/ghosts, no other path, no page or JS error); it is counted below.
      const noneYet = (text, loc) => /^Failed to load resource: the server responded with a status of 404/.test(text) && (loc === `${srv.base}/v1/ghosts/match` || loc.startsWith(`${srv.base}/v1/ghosts/match?`));
      const before = srv.out.length; // this player's lines of the server's log start here (the views run one after the other)
      let lastSource;
      const c = await context(browser, view, pin, noneYet, () => localStorage.setItem("beltbattles.runs.v1", JSON.stringify({ runs: 3, last: "rc-earlier-run" })));
      log(`\n== later ${vname}`);
      try {
        await c.page.goto(`${srv.base}/`);
        await c.page.waitForFunction(() => window.bb?.online()?.active === true, null, { timeout: 15000 });
        await scriptedRun(c.page, !!view.hasTouch, (s) => log(`  ${s}`), { days: 1, roads: "v", check: "fresh", hero: "weaver", buys: 8, pool: [], store: only }).catch((e) => { // F10: store = this server's data dir
          if (!/fewer than 3 days/.test(e.message)) throw e; // one dusk is the point here
        });
        const o = await c.page.evaluate(() => window.bb.online());
        lastSource = o.lastFetch?.source;
        await c.page.screenshot({ path: join(OUT, `later-${vname}-day1.png`) });
        log(`  session: runs ${o.runs}, seen ${o.seen.join(", ")}, lastFetch ${o.lastFetch?.source} ${o.lastFetch?.hero ?? ""} ${o.lastFetch?.id ?? ""}`);
        const ids = dayOneIds(); // backlog 337: after this run, with any earlier later player's own upload in it
        if (ids.length !== ids0.length) log(`  the store's day-1 uploads now: ${ids.length} (${ids.filter((id) => !ids0.includes(id)).join(", ")} joined)`);
        // seen[0] is dusk 1's foe; the session may already have stored tomorrow's (it fetches from the result card on)
        check(o.runs >= 3 && o.seen.length >= 1 && ids.includes(o.seen[0]), `later ${vname}: dusk 1 fought an uploaded ghost (${o.seen[0]}), served by the server`);
      } catch (e) {
        check(false, `later ${vname}: ${e.message}`);
      }
      await sleep(300); // the server's log line for the last request
      // every allowed line is accounted for: as many as the server logged `GET /v1/ghosts/match 404` for this player, and (when there is one) the session shows the fallback fetch
      const n404 = c.allowed.length, server404 = srv.out.slice(before).filter((l) => / GET \/v1\/ghosts\/match 404 /.test(l)).length;
      const accounted = n404 === server404 && (n404 === 0 || lastSource === "fallback");
      if (n404) log(`  allowed (none-yet 404 on /v1/ghosts/match): ${c.allowed.join(" | ")}`);
      check(c.errors.length === 0 && accounted, `later ${vname}: 0 console errors (${n404} none-yet 404 on /v1/ghosts/match allowed; the server logged ${server404}${n404 ? `, the session's last fetch ${lastSource}` : ""})${c.errors.length ? `: ${c.errors.slice(0, 3).join(" | ")}` : ""}${accounted ? "" : " -- the allowed lines are NOT accounted for"}`);
      await c.ctx.close();
    }
  } finally {
    await srv.stop();
    rmSync(only, { recursive: true, force: true });
  }
}

async function oldRun(browser) {
  const page070 = join(OLD, "BeltBattles-0.7.0-online.html");
  log(`\n## old: the 0.7.0 online page (${page070}) at / of the 0.8.0 server, uploads open`);
  const old = await import(pathToFileURL(join(OLD, "scripts", "playthrough.mjs")).href); // 0.7.0's own driver
  const data = mkdtempSync(join(tmpdir(), "bb-rcruns-old-"));
  const srv = await startServer(page070, data, "open");
  try {
    for (const [vname, [view, pin]] of Object.entries(RUNVIEWS)) {
      const network = (text, loc) => /^Failed to load resource: the server responded with a status of (404|422)/.test(text) && loc.startsWith(`${srv.base}/v1/ghosts`);
      const c = await context(browser, view, pin, network);
      log(`\n== old ${vname}`);
      const before = srv.out.length;
      try {
        await c.page.goto(`${srv.base}/`);
        await c.page.waitForFunction(() => !!window.bb && window.bb.screen() === "title", null, { timeout: 15000 });
        const version = await c.page.evaluate(() => window.bb.version);
        await c.page.waitForFunction(() => window.bb.online()?.active === true, null, { timeout: 15000 });
        await old.scriptedRun(c.page, !!view.hasTouch, (s) => log(`  ${s}`), { days: 1, roads: "v", check: "fresh", hero: "furnace", buys: 8, pool: [] }).catch((e) => {
          if (!/fewer than 3 days/.test(e.message)) throw e;
        });
        await c.page.waitForFunction(() => window.bb.online()?.lastUpload, null, { timeout: 15000 });
        const o = await c.page.evaluate(() => ({ ...window.bb.online(), day: window.bb.game.run?.day, over: window.bb.game.run?.over, screen: window.bb.screen() }));
        await c.page.screenshot({ path: join(OUT, `old070-${vname}-after-dusk1.png`) });
        const mine = srv.out.slice(before);
        log(`  0.7.0 session: version ${version}, lastFetch ${o.lastFetch?.source} (${o.lastFetch?.error ?? ""}), dusk ${JSON.stringify(o.dusk)}, lastUpload ${JSON.stringify(o.lastUpload)}, run day ${o.day}, screen ${o.screen}`);
        log(`  server: ${mine.filter((l) => /\/v1\/ghosts/.test(l)).join(" | ")}`);
        check(version === "0.7.0", `old ${vname}: the page is 0.7.0 (bb.version ${version})`);
        check(o.lastFetch?.source === "fallback" && mine.some((l) => / GET \/v1\/ghosts\/match 404 /.test(l)) && o.dusk?.source === "offline", `old ${vname}: its bb-0.6.2 match gets 404 and the dusk fights the stand-in (OFFLINE STAND-IN)`);
        check(o.lastUpload?.ok === false && o.lastUpload?.status === 422 && mine.some((l) => / POST \/v1\/ghosts 422 /.test(l)), `old ${vname}: its upload is refused with 422, quietly`);
        check(o.day === 2 && !o.over, `old ${vname}: the run plays on to day 2`);
        const n404 = c.allowed.filter((l) => / 404 /.test(l)).length, n422 = c.allowed.filter((l) => / 422 /.test(l)).length;
        check(c.errors.length === 0 && n422 === 1 && n404 === o.fetches && n404 + n422 === c.allowed.length, `old ${vname}: only Chromium's network lines for the refused requests: ${n404} x 404 (one a fetch, ${o.fetches} fetches) and ${n422} x 422; no other console line`);
      } catch (e) {
        check(false, `old ${vname}: ${e.message}`);
      }
      if (c.errors.length) log(`  errors: ${c.errors.join(" | ")}`);
      await c.ctx.close();
    }
  } finally {
    await srv.stop();
    rmSync(data, { recursive: true, force: true });
  }
}

async function main() {
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"] });
  const { online, offline } = pages();
  const data = mkdtempSync(join(tmpdir(), "bb-rcruns-data-"));
  try {
    if (ONLY.includes("offline")) await offlineRuns(browser, offline);
    if (ONLY.includes("online")) await onlineRuns(browser, online, data);
    if (ONLY.includes("later") && ONLY.includes("online")) await laterRun(browser, online, data);
    if (ONLY.includes("old") && OLD) await oldRun(browser);
  } finally {
    await browser.close();
    rmSync(data, { recursive: true, force: true });
  }
  const failed = checks.filter((c) => !c.ok).length;
  log(`\nRC RUNS ${failed ? "FAILED" : "PASSED"}: ${checks.length - failed} of ${checks.length}`);
  writeFileSync(join(OUT, "rcruns.log"), lines.join("\n") + "\n");
  writeFileSync(join(OUT, "rcruns.json"), JSON.stringify({ checks, result: failed ? "FAIL" : "PASS" }, null, 1) + "\n");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
