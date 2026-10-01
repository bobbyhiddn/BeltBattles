// 0.7.0a browser checks (REQ-BFG-016, decisions D3-D6): the built page (dist/) in Chromium through playwright-core,
// with real input (scripts/playthrough.mjs's taps and drags), on 127.0.0.1 only:
//  A. offline: no server URL. Day 1 from NEW RUN to the dusk result card: 0 console errors, no request beyond the page
//     (index.html and its script), no IndexedDB database, only 0.6.2's storage keys, window.bb.online() null.
//  B. online: ?server=<the local built ghost server> (seeded, BB_GHOST_UPLOADS=open, CORS for the page's origin). Day 1's
//     dusk fetches a ghost (the NEXT BATTLE card and the enemy plate say ONLINE GHOST), the signed upload is accepted
//     (201), the result stores the dusk's record; the summary's REPLAY plays it read-only (the same winner, time and
//     hulls; the run unchanged) and BACK returns. 0 console errors.
//  C. online, a ghost server too slow to answer (D4): the fetch gives up at 4 s and the dusk fights 0.6.2's stand-in.
//  phone. online on a phone: the NEXT BATTLE strip and the dusk plate say ONLINE GHOST.
// 0.7.0 (R1, REQ-BFG-016):
//  M1. phone polish, on an iPhone portrait (390x844), an iPhone landscape (844x390), a small landscape phone (640x360) and
//      desktop 1920x1080: where the enemy plate's source line is drawn (BattleScreen.sourceLine: the free row above the
//      plate, else inside the plate's strip; never on the hull), and the summary's REPLAY target (regions(): at least 44
//      CSS px tall and wide on a phone, 0.7.0a's cell on the desktop), tapped.
// Usage: npm run build && npm run build:server && node scripts/asynccheck.mjs <outDir> [options]
//   --only A,B,C,phone,M1   run these sections only (default: all of them)
//   --dist <dir>            the build to serve (default dist/; e.g. a 0.7.0a build for M1's before shots)
//   --tag <prefix>          the M1 screenshots' prefix (default "after")
//   --name <base>           the log and json file names (default asynccheck)
// Exit 1 if a check fails. Writes <outDir>/<name>.log, <name>.json and the screenshots.

import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { placePlanned, settle, sleep, tapRegion } from "./playthrough.mjs";
import { roadStop } from "./roadstop.mjs";
import { VIEWS } from "./shots-list.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const DIST = resolve(opt("dist", join(ROOT, "dist")));
const BUNDLE = join(ROOT, "server", "dist", "ghost-server.mjs");
const OUT = resolve(args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--"))) ?? join(ROOT, "shots", "asynccheck"));
const ONLY = opt("only", "A,B,C,phone,M1").split(",").map((s) => s.trim());
const want = (section) => ONLY.includes(section);
const TAG = opt("tag", "after");
const NAME = opt("name", "asynccheck");
const children = new Set(); // the ghost server processes this run started
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
const OLD_KEYS = ["beltbattles.run.v7", "beltbattles.ghosts.v1", "beltbattles.player.v1"]; // what 0.6.2 writes

mkdirSync(OUT, { recursive: true });
const lines = [];
const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
const log = (s) => {
  lines.push(s);
  console.log(s);
};
const checks = [];
const check = (ok, what) => {
  checks.push({ ok: !!ok, what });
  log(`${ok ? "PASS" : "FAIL"}  ${what}`);
};

/** dist/ on 127.0.0.1 (a secure context, so the online scenario has WebCrypto), logging every request. */
function pageServer() {
  const hits = [];
  const srv = createServer(async (req, res) => {
    hits.push(`${req.method} ${req.url}`);
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
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok({ srv, hits, origin: `http://127.0.0.1:${srv.address().port}` })));
}

function run(cmd, args, env) {
  return new Promise((ok) => {
    const p = spawn(cmd, args, { env });
    let out = "";
    p.stdout.on("data", (c) => (out += c));
    p.stderr.on("data", (c) => (out += c));
    p.on("exit", (code) => ok({ code, out }));
  });
}

async function freePort() {
  const s = createServer();
  await new Promise((ok) => s.listen(0, "127.0.0.1", ok));
  const port = s.address().port;
  await new Promise((ok) => s.close(ok));
  return port;
}

/** The built ghost server (server/dist), JSON-lines store in a temp directory: seeded, uploads open, CORS for `origin`. */
async function ghostServer(origin, uploads = "open") {
  const data = mkdtempSync(join(tmpdir(), "bb-asynccheck-"));
  const port = await freePort();
  const env = { PATH: process.env.PATH, BB_GHOST_DATA: data, BB_GHOST_UPLOADS: uploads, BB_GHOST_HOST: "127.0.0.1", BB_GHOST_PORT: String(port), BB_GHOST_ORIGINS: origin };
  const seed = await run(process.execPath, [BUNDLE, "seed"], env);
  const proc = spawn(process.execPath, [BUNDLE], { env });
  children.add(proc);
  proc.on("exit", () => children.delete(proc));
  let out = "";
  proc.stdout.on("data", (c) => (out += c));
  proc.stderr.on("data", (c) => (out += c));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 300; i++) {
    try {
      if ((await fetch(`${base}/v1/health`)).status === 200) break;
    } catch {
      await sleep(20);
    }
  }
  return {
    base, seed, health: await (await fetch(`${base}/v1/health`)).json(), log: () => out,
    async stop() {
      proc.kill("SIGTERM");
      await new Promise((ok) => proc.on("exit", ok));
      rmSync(data, { recursive: true, force: true });
    },
  };
}

function newState() {
  return {
    refitDone: false, picks: 0, reloadSame: false, losses: [], ghosts: 0, standins: 0, placed: 0, foes: 0, dishonest: [], forkPicks: {}, tapPicks: 0,
    warlordLosses: [], livesChanged: [], matriarchDays: [], reloadWarlordSame: false, warlordRefit: false, dayLog: [], spend: [], take: {}, took: {},
    bountyLog: null, scoutFought: false, feel: [],
  };
}

/** A page with its console errors, page errors and every request it makes. `view`: a VIEWS name, or context options. */
async function openPage(browser, view, url) {
  const ctx = await browser.newContext(typeof view === "string" ? VIEWS[view] : view);
  const page = await ctx.newPage();
  const errors = [];
  const requests = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`);
  });
  page.on("request", (r) => requests.push(`${r.method()} ${r.url()}`));
  await page.goto(url);
  await page.waitForFunction(() => !!window.bb, null, { timeout: 15000 });
  return { ctx, page, errors, requests };
}

/** Day 1 with real input: NEW RUN, COMMAND (the first hero), buy and place a part, FIGHT, the road event, the dusk. */
async function dayOne(page, shots, tag) {
  await tapRegion(page, false, "new");
  await settle(page, "hero");
  await tapRegion(page, false, "go");
  await settle(page, "build");
  await page.waitForFunction(() => window.bb.game.screen.caravan.ready, null, { timeout: 10000 });
  return async () => {
    const def = await placePlanned(page, false);
    log(`[${at()}] ${tag}: day 1 dawn: placed ${def ?? "nothing"}`);
    await tapRegion(page, false, "fight");
    await roadStop(page, false, (s) => log(`  ${s}`), at, newState(), "v");
    await settle(page, "battle");
    await page.waitForFunction(() => window.bb.game.screen.phase === "fight", null, { timeout: 20000 });
    await sleep(700);
    await page.screenshot({ path: join(OUT, `${tag}-2-dusk.png`) });
    shots.push(`${tag}-2-dusk.png`);
    await tapRegion(page, false, "skip");
    await page.waitForFunction(() => window.bb.game.screen.phase === "result", null, { timeout: 90000 });
    await page.waitForFunction(() => window.bb.regions().some((r) => r.id === "next"), null, { timeout: 5000 });
    await page.screenshot({ path: join(OUT, `${tag}-3-result.png`) });
    shots.push(`${tag}-3-result.png`);
    return page.evaluate(() => {
      const run = window.bb.game.run, h = run.history[run.history.length - 1];
      return { day: h.day, outcome: h.outcome, time: h.time, foe: h.foe, ghost: h.ghost, record: !!h.record, hulls: h.hulls ?? null };
    });
  };
}

async function main() {
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"] });
  const site = await pageServer();
  const shots = [];
  const result = {};
  log(`# browser checks ${ONLY.join(", ")}: ${DIST} served at ${site.origin}; Chromium ${browser.version()}; ${new Date().toISOString()}`);

  // ---------------------------------------------------------------- A. offline (no server URL)
  if (want("A")) {
    log("");
    log("## A. offline: no server URL (decision D3)");
    const { ctx, page, errors, requests } = await openPage(browser, "desk", `${site.origin}/index.html`);
    const finish = await dayOne(page, shots, "offline");
    await page.screenshot({ path: join(OUT, "offline-1-build.png") });
    shots.push("offline-1-build.png");
    const card = await page.evaluate(() => ({ foe: window.bb.game.screen.foe.name, kind: window.bb.game.screen.foe.kind, note: window.bb.game.screen.note() }));
    log(`[${at()}] offline: NEXT BATTLE ${card.foe} (${card.kind}), source line: ${card.note ?? "none (0.6.2's card)"}`);
    const r = await finish();
    log(`[${at()}] offline: dusk result ${r.outcome} vs ${r.foe} (${r.time.toFixed(1)}s), record stored: ${r.record}`);
    const after = await page.evaluate(async () => ({
      online: window.bb.online(), keys: Object.keys(localStorage).sort(),
      dbs: indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : ["(databases() unsupported)"],
    }));
    const foreign = requests.filter((u) => !u.includes(` ${site.origin}/`));
    check(errors.length === 0, `offline: day 1 to the dusk result with 0 console errors (${errors.length}${errors.length ? `: ${errors.join(" | ")}` : ""})`);
    check(foreign.length === 0 && requests.length > 0, `offline: no request beyond the page: ${requests.length} requests, all to ${site.origin} (${requests.map((u) => u.replace(site.origin, "")).join(", ")})`);
    check(after.online === null, "offline: no online session (window.bb.online() is null)");
    check(after.dbs.length === 0, `offline: no IndexedDB database (${JSON.stringify(after.dbs)})`);
    check(after.keys.every((k) => OLD_KEYS.includes(k)), `offline: only 0.6.2's storage keys: ${after.keys.join(", ")}`);
    check(card.note === null && !r.record, "offline: no source line on the card and no battle record (0.6.2's card and save)");
    result.offline = { errors, requests, ...after, card, dusk: r };
    await ctx.close();
  }

  // ---------------------------------------------------------------- B. online (?server= the local ghost server)
  if (want("B")) {
    log("");
    log("## B. online: ?server= the local built ghost server (seeded, uploads open)");
    const gs = await ghostServer(site.origin);
    log(`[${at()}] ghost server ${gs.base}: seed exit ${gs.seed.code} (${(gs.seed.out.match(/\d+ written, \d+ unchanged, \d+ removed/) || ["?"])[0]}); health ${JSON.stringify(gs.health)}`);
    const url = `${site.origin}/index.html?server=${encodeURIComponent(gs.base)}`;
    const { ctx, page, errors, requests } = await openPage(browser, "desk", url);
    await page.waitForFunction(() => window.bb.online()?.active, null, { timeout: 15000 });
    const s0 = await page.evaluate(() => window.bb.online());
    log(`[${at()}] online: session ${s0.url}, playerId ${s0.playerId}, runs ${s0.runs}`);
    const finish = await dayOne(page, shots, "online");
    await page.waitForFunction(() => window.bb.online().dusk?.source, null, { timeout: 10000 });
    await page.evaluate(() => { const g = window.bb.game; for (let i = 0; i < 6; i++) g.step(1 / 60); g.render(); });
    await page.screenshot({ path: join(OUT, "online-1-build.png") });
    shots.push("online-1-build.png");
    const card = await page.evaluate(() => ({ foe: window.bb.game.screen.foe.name, kind: window.bb.game.screen.foe.kind, note: window.bb.game.screen.note(), s: window.bb.online() }));
    log(`[${at()}] online: NEXT BATTLE ${card.foe} (${card.kind}), source line: ${card.note}; fetched ${JSON.stringify(card.s.lastFetch)}`);
    check(card.s.lastFetch?.source === "server" && card.kind === "ghost" && card.note === "ONLINE GHOST", "online: the dusk ghost is fetched from the server; the NEXT BATTLE card says ONLINE GHOST");
    // the phone strip too (its narrower card)
    const plateNote = { note: null };
    const r = await (async () => {
      const res = await finish();
      plateNote.note = await page.evaluate(() => window.bb.game.screen.note ?? null);
      return res;
    })();
    log(`[${at()}] online: dusk result ${r.outcome} vs ${r.foe} (${r.time.toFixed(1)}s), record stored: ${r.record}, hulls ${JSON.stringify(r.hulls)}; plate note ${plateNote.note}`);
    check(plateNote.note === "ONLINE GHOST" && r.ghost, "online: the dusk fights the fetched ghost; the enemy plate's source line says ONLINE GHOST");
    await page.waitForFunction(() => window.bb.online().lastUpload !== null, null, { timeout: 10000 });
    const up = await page.evaluate(() => window.bb.online().lastUpload);
    const posts = gs.log().split("\n").filter((l) => / POST \/v1\/ghosts /.test(l));
    log(`[${at()}] online: upload ${JSON.stringify(up)}; server log: ${posts.join(" | ")}`);
    check(up?.ok === true && posts.some((l) => / POST \/v1\/ghosts 201 /.test(l)), "online: tonight's signed upload is accepted (201)");
    check(r.record && Array.isArray(r.hulls), "online: the dusk result stores its battle record and both hulls");
    // the summary's REPLAY
    const runBefore = await page.evaluate(() => { window.bb.endRun(); return null; });
    void runBefore;
    await settle(page, "summary");
    await page.waitForFunction(() => window.bb.regions().some((q) => q.id.startsWith("replay")), null, { timeout: 5000 });
    await page.screenshot({ path: join(OUT, "online-4-summary.png") });
    shots.push("online-4-summary.png");
    const before = await page.evaluate(() => JSON.stringify(window.bb.game.run));
    const id = await page.evaluate(() => window.bb.regions().find((q) => q.id.startsWith("replay")).id);
    await tapRegion(page, false, id);
    await settle(page, "replay");
    await sleep(900);
    await page.screenshot({ path: join(OUT, "online-5-replay.png") });
    shots.push("online-5-replay.png");
    await page.keyboard.press("4"); // 4X
    await page.waitForFunction(() => window.bb.game.screen.over, null, { timeout: 90000 });
    await sleep(900);
    await page.screenshot({ path: join(OUT, "online-6-replay-end.png") });
    shots.push("online-6-replay-end.png");
    const rep = await page.evaluate(() => {
      const b = window.bb.game.screen.arena.b, h = window.bb.game.run.history[0];
      return { winner: b.winner, t: b.t, hulls: [b.sides[0].hull.hp, b.sides[1].hull.hp], stored: { outcome: h.outcome, time: h.time, hulls: h.hulls } };
    });
    const same = (rep.winner === 0 ? "win" : rep.winner === 1 ? "loss" : "draw") === rep.stored.outcome && rep.t === rep.stored.time && JSON.stringify(rep.hulls) === JSON.stringify(rep.stored.hulls);
    log(`[${at()}] online: REPLAY ended ${JSON.stringify(rep)}`);
    check(same, "online: REPLAY plays the stored dusk: the same winner, time and both hulls");
    await tapRegion(page, false, "replayback");
    await settle(page, "summary");
    const afterRun = await page.evaluate(() => JSON.stringify(window.bb.game.run));
    check(afterRun === before, "online: REPLAY is read-only: the run is byte for byte the same after it (D6)");
    const meta = await page.evaluate(async () => ({ keys: Object.keys(localStorage).sort(), dbs: indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : [] }));
    const hosts = [...new Set(requests.map((u) => new URL(u.split(" ")[1]).origin))];
    check(errors.length === 0, `online: 0 console errors (${errors.length}${errors.length ? `: ${errors.join(" | ")}` : ""})`);
    check(hosts.every((o) => o === site.origin || o === gs.base), `online: requests only to the page and the ghost server: ${hosts.join(", ")}`);
    log(`[${at()}] online: storage keys ${meta.keys.join(", ")}; IndexedDB ${meta.dbs.join(", ")}; API requests: ${requests.filter((u) => u.includes(gs.base)).map((u) => u.replace(gs.base, "").replace(/player=[^&]+/, "player=<id>")).join(", ")}`);
    result.online = { errors, card, dusk: r, upload: up, posts, replay: rep, keys: meta.keys, dbs: meta.dbs, hosts };
    await ctx.close();
    await gs.stop();
  }

  // ---------------------------------------------------------------- C. a ghost server too slow to answer (D4)
  if (want("C")) {
    log("");
    log("## C. online, the ghost server answers too slowly: the dusk falls back to 0.6.2's stand-in after the 4 s fetch (D4)");
    const gs = await ghostServer(site.origin);
    const { ctx, page, errors } = await openPage(browser, "desk", `${site.origin}/index.html?server=${encodeURIComponent(gs.base)}`);
    // every match answer is held back 9 s, past the client's 4 s deadline (the page's own fetch aborts first)
    await page.route(`${gs.base}/v1/ghosts/match**`, async (route) => {
      await sleep(9000);
      try {
        await route.continue();
      } catch {
        /* the page gave up (aborted) */
      }
    });
    await page.waitForFunction(() => window.bb.online()?.active, null, { timeout: 15000 });
    await tapRegion(page, false, "new");
    await settle(page, "hero");
    await tapRegion(page, false, "go");
    await settle(page, "build");
    const t1 = Date.now();
    const searching = await page.evaluate(() => window.bb.game.screen.note());
    await page.evaluate(() => { const g = window.bb.game; for (let i = 0; i < 4; i++) g.step(1 / 60); g.render(); });
    await page.screenshot({ path: join(OUT, "slow-1-finding.png") });
    shots.push("slow-1-finding.png");
    await tapRegion(page, false, "fight"); // straight on to the road and the dusk, while the fetch is still out
    let waited = false;
    const state = newState();
    const roadDone = roadStop(page, false, (s) => log(`  ${s}`), at, state, "v").catch((e) => e);
    for (let i = 0; i < 400 && !waited; i++) {
      // the wait card, once the screen wipe has opened on it
      waited = await page.evaluate(() => window.bb.screen() === "duskwait" && !window.bb.game.transitioning);
      if (waited) {
        await page.screenshot({ path: join(OUT, "slow-2-duskwait.png") });
        shots.push("slow-2-duskwait.png");
      }
      await sleep(20);
    }
    await roadDone;
    await settle(page, "battle", 30000);
    const tBattle = (Date.now() - t1) / 1000;
    const foe = await page.evaluate(() => ({ dusk: window.bb.online().dusk, last: window.bb.online().lastFetch, note: window.bb.game.screen.note, standin: window.bb.standInSpend(window.bb.game.run.seed)[0].name }));
    log(`[${at()}] slow: card first said ${searching}; the dusk wait card showed: ${waited}; the battle began ${tBattle.toFixed(1)}s after the dawn; dusk ${JSON.stringify(foe.dusk)}; fetch ${JSON.stringify(foe.last)}`);
    check(searching === "FINDING A GHOST..." && foe.last?.source === "fallback" && /timeout/.test(foe.last?.error ?? "")
      && foe.dusk?.kind === "standin" && foe.dusk?.source === "offline" && foe.dusk?.name === foe.standin && foe.note === "OFFLINE STAND-IN",
      "slow server: the fetch times out and the dusk fights 0.6.2's own stand-in (standInFoe), labelled OFFLINE STAND-IN");
    check(tBattle < 12, `slow server: the game never waited past the fetch deadline (the battle began ${tBattle.toFixed(1)}s after the dawn, with the road in between)`);
    check(errors.length === 0, `slow server: 0 console errors (${errors.length}${errors.length ? `: ${errors.join(" | ")}` : ""})`);
    result.slow = { searching, waited, tBattle, foe, errors };
    await ctx.close();
    await gs.stop();
  }

  // ---------------------------------------------------------------- the phone card (the NEXT BATTLE strip's source line)
  if (want("phone")) {
    const gs = await ghostServer(site.origin);
    const { ctx, page, errors } = await openPage(browser, "phone", `${site.origin}/index.html?server=${encodeURIComponent(gs.base)}`);
    await page.waitForFunction(() => window.bb.online()?.active, null, { timeout: 15000 });
    await tapRegion(page, true, "new");
    await settle(page, "hero");
    await tapRegion(page, true, "go");
    await settle(page, "build");
    await page.waitForFunction(() => window.bb.online().dusk?.source, null, { timeout: 10000 });
    await page.evaluate(() => { const g = window.bb.game; for (let i = 0; i < 6; i++) g.step(1 / 60); g.render(); });
    await page.screenshot({ path: join(OUT, "online-phone-build.png") });
    shots.push("online-phone-build.png");
    const note = await page.evaluate(() => window.bb.game.screen.note());
    await tapRegion(page, true, "fight");
    await roadStop(page, true, (s) => log(`  ${s}`), at, newState(), "v");
    await settle(page, "battle");
    await page.waitForFunction(() => window.bb.game.screen.phase === "fight", null, { timeout: 20000 });
    await sleep(700);
    await page.screenshot({ path: join(OUT, "online-phone-dusk.png") });
    shots.push("online-phone-dusk.png");
    const plate = await page.evaluate(() => window.bb.game.screen.note);
    check(errors.length === 0 && note === "ONLINE GHOST" && plate === "ONLINE GHOST", `online phone: the NEXT BATTLE strip and the dusk plate say ONLINE GHOST, 0 console errors (${errors.length})`);
    await ctx.close();
    await gs.stop();
  }

  // ---------------------------------------------------------------- M1. phone polish (0.7.0 R1)
  if (want("M1")) {
    log("");
    log(`## M1. phone polish (0.7.0 R1): the enemy plate's source line and the summary's REPLAY target [${TAG} build: ${DIST}]`);
    const gs = await ghostServer(site.origin);
    result.m1 = [];
    for (const [name, view, touch, place] of M1_VIEWS) {
      const url = `${site.origin}/index.html?server=${encodeURIComponent(gs.base)}`;
      const { ctx, page, errors } = await openPage(browser, view, url);
      const vp = `${view.viewport.width}x${view.viewport.height}@${view.deviceScaleFactor}`;
      await page.waitForFunction(() => window.bb.online()?.active, null, { timeout: 15000 });
      await tapRegion(page, touch, "new");
      await settle(page, "hero");
      await tapRegion(page, touch, "go");
      await settle(page, "build");
      await page.waitForFunction(() => window.bb.online().dusk?.source, null, { timeout: 10000 });
      await tapRegion(page, touch, "fight");
      await roadStop(page, touch, (s) => log(`  ${s}`), at, newState(), "v");
      await settle(page, "battle");
      await page.waitForFunction(() => window.bb.game.screen.phase === "fight", null, { timeout: 20000 });
      await sleep(700);
      const dusk = `${TAG}-m1-${name}-dusk.png`;
      await page.screenshot({ path: join(OUT, dusk) });
      shots.push(dusk);
      const g = await page.evaluate(() => {
        const s = window.bb.game.screen, v = window.bb.game.view;
        const src = typeof s.sourceLine === "function" ? s.sourceLine() : "n/a (no sourceLine: a 0.7.0a build)";
        return { note: s.note, foe: s.foeName, src, plate: s.L.plates[1], hull: s.L.hulls[1], k: v.scale / v.dpr, W: v.W, H: v.H, scale: v.scale };
      });
      // a close-up of the enemy plate and the top of its hull
      const p = g.plate, top = Math.max(0, p.y - 10);
      const c0 = await page.evaluate(([x, y]) => window.bb.toClient(x, y), [p.x - 8, top]);
      const close = `${TAG}-m1-${name}-plate.png`;
      await page.screenshot({ path: join(OUT, close), clip: { x: c0.x, y: c0.y, width: (p.w + 16) * g.k, height: (p.y - top + p.h + 24) * g.k } });
      shots.push(close);
      // where 0.7.0a drew the line: above the plate with a free row (p.y >= 8), else just under it (3x5 text, 4 px a glyph)
      const oy = p.y >= 8 ? p.y - 7 : p.y + p.h + 2;
      const old = { x: p.x + 2, y: oy - 1, w: 4 * (g.note ?? "").length + 1, h: 7 };
      const onHull = old.x < g.hull.x + g.hull.w && g.hull.x < old.x + old.w && old.y < g.hull.y + g.hull.h && g.hull.y < old.y + old.h;
      log(`[${at()}] M1 ${name} ${vp}: battle ${g.W}x${g.H} at x${g.scale}; enemy plate y ${p.y}; note ${g.note}; 0.7.0a's line at y ${oy}${onHull ? " (on the enemy hull)" : ""}; drawn: ${JSON.stringify(g.src)}`);
      const src = g.src;
      if (typeof src === "string") {
        check(false, `M1 ${name}: the source line has a clean place (${src}; 0.7.0a's line ${onHull ? "sits on the enemy hull" : "is clear"})`);
      } else if (place === "above") {
        const b = src?.box;
        const clear = !!b && b.y >= 0 && !(b.x < g.hull.x + g.hull.w && g.hull.x < b.x + b.w && b.y < g.hull.y + g.hull.h && g.hull.y < b.y + b.h) && b.y + b.h < p.y;
        check(src?.place === "above" && src.text === g.note && clear, `M1 ${name} ${vp}: the source line ${g.note} is in the free row above the plate (y ${b?.y}..${b ? b.y + b.h - 1 : "?"}, the plate at ${p.y}), clear of the hull`);
      } else {
        const name0 = g.foe.startsWith("GHOST · ") ? g.foe.slice(8) : g.foe;
        check(src?.place === "plate" && src.tag === "ONLINE" && src.name === name0 && onHull,
          `M1 ${name} ${vp}: no row above the plate (0.7.0a's line fell on the hull's top rail); the plate itself reads ${src?.tag} · ${src?.name}`);
      }
      // the summary's REPLAY target, and a tap on it
      await tapRegion(page, touch, "skip");
      await page.waitForFunction(() => window.bb.game.screen.phase === "result", null, { timeout: 90000 });
      await page.waitForFunction(() => window.bb.regions().some((r) => r.id === "next"), null, { timeout: 5000 });
      await page.evaluate(() => window.bb.endRun());
      await settle(page, "summary");
      await page.waitForFunction(() => window.bb.regions().some((q) => /^replay\d+$/.test(q.id)), null, { timeout: 5000 });
      const sum = `${TAG}-m1-${name}-summary.png`;
      await page.screenshot({ path: join(OUT, sum) });
      shots.push(sum);
      const reg = await page.evaluate(() => {
        const v = window.bb.game.view, k = v.scale / v.dpr;
        return { r: window.bb.regions().find((q) => /^replay\d+$/.test(q.id)), k, W: v.W, H: v.H, scale: v.scale };
      });
      const r = reg.r;
      const size = `${r.w.toFixed(1)}x${r.h.toFixed(1)} CSS px (summary ${reg.W}x${reg.H} at x${reg.scale})`;
      if (touch) check(r.h >= 44 && r.w >= 44, `M1 ${name} ${vp}: the summary's REPLAY target ${r.id} is at least 44x44 CSS px: ${size}`);
      else check(Math.abs(r.h - 8 * reg.k) < 0.01, `M1 ${name} ${vp}: the summary's REPLAY is 0.7.0a's cell in the round-history row (one 8 px row): ${size}`);
      await tapRegion(page, touch, r.id);
      await settle(page, "replay");
      await sleep(600);
      const rep = `${TAG}-m1-${name}-replay.png`;
      await page.screenshot({ path: join(OUT, rep) });
      shots.push(rep);
      await tapRegion(page, touch, "skip"); // BACK shows once the replay has ended
      await page.waitForFunction(() => window.bb.game.screen.over, null, { timeout: 90000 });
      await tapRegion(page, touch, "replayback");
      await settle(page, "summary");
      check(errors.length === 0, `M1 ${name} ${vp}: tapping REPLAY plays the dusk and BACK returns to the summary, 0 console errors (${errors.length}${errors.length ? `: ${errors.join(" | ")}` : ""})`);
      result.m1.push({ name, viewport: vp, battle: { W: g.W, H: g.H, scale: g.scale, plate: p, note: g.note, src: g.src, line070a: { y: oy, onHull } }, replay: { id: r.id, css: { x: r.x, y: r.y, w: r.w, h: r.h } }, errors });
      await ctx.close();
    }
    await gs.stop();
  }

  await browser.close();
  site.srv.close();
  const failed = checks.filter((c) => !c.ok);
  log("");
  log(failed.length ? `BROWSER CHECKS FAILED: ${failed.length} of ${checks.length}` : `BROWSER CHECKS PASSED: ${checks.length} of ${checks.length}`);
  log(`screenshots: ${shots.join(", ")}`);
  writeFileSync(join(OUT, `${NAME}.log`), lines.join("\n") + "\n");
  writeFileSync(join(OUT, `${NAME}.json`), JSON.stringify({ checks, result }, null, 2) + "\n");
  if (failed.length) process.exitCode = 1;
}

/** M1's views: [name, context, touch, where the plate's source line goes (BattleScreen.sourceLine)]. */
const M1_VIEWS = [
  ["phone", VIEWS.phone, true, "plate"], // 390x844 @3, the browser check's iPhone: the plate at the top edge
  ["phone-land", { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, true, "plate"],
  ["small-land", { viewport: { width: 640, height: 360 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, true, "above"],
  ["desk", VIEWS.desk, false, "above"], // 1920x1080
];

main().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : String(e));
  writeFileSync(join(OUT, `${NAME}.log`), lines.join("\n") + `\nERROR ${e instanceof Error ? e.stack : String(e)}\n`);
  for (const p of children) p.kill("SIGKILL"); // the ghost servers would keep the process (and its caller) alive
  process.exit(1);
});
