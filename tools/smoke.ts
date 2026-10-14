// Local smoke run of the BUILT server bundle against the in-process fake S3. No network: everything
// listens on this machine. Run from the repo root after `node deploy/stage.mjs <game.html>`:
//   npm run smoke -- [--static deploy/public] [--out ../output/logs/smoke.txt]
// It starts the fake S3, shows two startup refusals, runs `seed` twice (fresh, then a no-op), starts
// the server (tigris store on the fake, uploads closed, Fly proxy IP, 0.0.0.0, the staged page) and
// prints its env against fly.toml's [env], naming every key that differs with both values (0.8.0 H2,
// envReport: true whatever fly.toml says, never a credential), times the first health answer, then curls
// health, /, HEAD /, a match and a closed POST. Then (0.7.0 prep, REQ-BFG-016) it starts a second
// server with uploads open and curls a ghost signed with a fresh device key (201, then 200 when
// repeated), the same ghost unsigned (401) and one signed over other bytes (401). The ghost is a
// v2 pool deck with turrets and a join (0.6.2). 0.7.0a (REQ-BFG-016): the match asks with a reachable
// record and runs (D1, D2), the game's own submitGhost meets 403 while closed, and section 6 runs the
// game's side against the open server: fetchGhost for a new player (a seed ghost) and an experienced one
// (the upload), the fight as the game makes it (onlineFoe, battleSeed) and its record's replay, 404 to
// 0.6.2's stand-in, and submitGhost's 201. 0.7.0 (R1 M2): section 7 runs the built admin tool (ghost-admin.mjs) on the same
// bucket from the same env: list, a refusal, revalidate finding a deck planted past POST (dry run, then --apply), and
// wipe-uploads keeping the seed pool. It writes the transcript. Exit 1 if a check fails.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { FakeS3 } from "./fakeS3";
import { generateSamplePool } from "./samplePool";
import { KEY_HEADER, SIG_HEADER, loadIdentity, memoryKeyStore } from "../src/net/identity";
import { encodeSnapshot, ghostId, SNAPSHOT_V3, type GhostSnapshot } from "../src/net/snapshot";
import { RULES_VERSION, START_LIVES } from "../src/sim/content";
// 0.7.0a: the game's side of the server (section 6, and the closed upload in section 3)
import { fetchGhost, submitGhost, type GhostRequest } from "../src/net/ghostClient";
// PACKS run 2 (REQ-BFG-063; oracle d44affbde25e285e, setup only): every upload below carries the tests' one player name,
// as the tests' uploads do (bb-0.8.6 refuses a nameless upload with 422 "name: missing"); each check's expectation and
// each refusal's reason are unchanged
import { TEST_NAME } from "../tests/netIdentity";
import { noBetterRecord } from "../src/net/matchmaking";
import { battleRecordFor, replay } from "../src/net/replay";
import { simulate } from "../src/sim/battle";
import { battleSeed, newRun } from "../src/game/run";
import { onlineFoe } from "../src/game/day";
import { standInFoe } from "../src/game/ghosts";
// 0.7.0 R1 M2: section 7 plants a bad upload straight into the bucket for the admin tool to find
import { encodeRecord } from "../server/store";
import { objectKey } from "../server/tigrisStore";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const lines: string[] = [];
let failures = 0;
const say = (s = "") => {
  lines.push(s);
  console.log(s);
};
const check = (ok: boolean, what: string) => {
  say(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failures++;
};

// STAGE-099C PREP F1 (release lane 4228a395, 2026-10-13): an upload never carries a grade. With PICK on,
// generateSamplePool() grades every seed ghost (tools/samplePool.ts:382-385), and POST /v1/ghosts refuses a graded
// upload with 422 (server/app.ts:330, RETUNE-1 T5: only the seed step grades a ghost). So each upload below sends its
// sample ghost without the grade; every other field is the sample's.
const ungraded = (s: GhostSnapshot): GhostSnapshot => {
  const { grade: _grade, ...upload } = s;
  return upload;
};

interface Run {
  code: number | null;
  out: string;
}

/** Run a command to completion without blocking the event loop (the fake S3 lives in this process). */
function run(cmd: string, args: string[], env?: Record<string, string | undefined>): Promise<Run> {
  return new Promise((done, fail) => {
    const p = spawn(cmd, args, env ? { env } : {});
    let out = "";
    const dec = new TextDecoder();
    p.stdout?.on("data", (c) => (out += dec.decode(c)));
    p.stderr?.on("data", (c) => (out += dec.decode(c)));
    p.on("error", fail);
    p.on("exit", (code) => done({ code, out: out.replace(/\r\n/g, "\n") }));
  });
}

async function shell(label: string, cmd: string, args: string[], env?: Record<string, string | undefined>, clip = 1200): Promise<Run> {
  say(`$ ${label}`);
  const r = await run(cmd, args, env);
  const text = r.out.length > clip ? `${r.out.slice(0, clip)}… [${r.out.length - clip} more characters]` : r.out;
  for (const l of text.replace(/\n$/, "").split("\n")) say(`  ${l}`);
  say(`  (exit ${r.code})`);
  return r;
}

function freePort(): Promise<number> {
  return new Promise((done) => {
    const s = createServer(() => {});
    s.listen(0, "127.0.0.1", () => {
      const a = s.address();
      const port = typeof a === "object" && a ? a.port : 0;
      s.close(() => done(port));
    });
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/** Spawn the bundle and wait for its first 200 from /v1/health; stop() sends SIGTERM and returns the output. */
async function startServer(bundle: string, env: Record<string, string | undefined>, port: number): Promise<{ healthMs: number; stop(): Promise<string> }> {
  const t0 = performance.now();
  const proc = spawn(process.execPath, [bundle], { env });
  const exited = new Promise<void>((r) => proc.on("exit", () => r()));
  let out = "";
  const dec = new TextDecoder();
  proc.stdout?.on("data", (c) => (out += dec.decode(c)));
  proc.stderr?.on("data", (c) => (out += dec.decode(c)));
  let healthMs = -1;
  for (let i = 0; i < 250 && healthMs < 0; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/v1/health`);
      if (r.status === 200) healthMs = Math.round(performance.now() - t0);
    } catch {
      await sleep(10);
    }
  }
  return {
    healthMs,
    async stop() {
      proc.kill("SIGTERM");
      await exited;
      return out;
    },
  };
}

// One request log line: time, method, path, status and duration. Nothing else: no client IP.
const REQUEST_LINE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z (GET|HEAD|POST|OPTIONS) \/\S* \d{3} \d+ms$/;

/** The env the smoke's server runs with in section 3: the built bundle on the fake S3, uploads closed. */
export function smokeEnv(o: { port: number; staticDir: string; endpoint: string }): Record<string, string | undefined> {
  return {
    PATH: process.env.PATH,
    BB_GHOST_STORE: "tigris",
    BB_GHOST_UPLOADS: "closed",
    BB_GHOST_TRUST_PROXY: "fly",
    BB_GHOST_HOST: "0.0.0.0",
    BB_GHOST_PORT: String(o.port),
    BB_GHOST_STATIC: o.staticDir,
    BB_GHOST_ORIGINS: `http://127.0.0.1:${o.port}`,
    BB_GHOST_S3_ADDRESSING: "path", // the fake is path-style only; production uses the virtual-hosted default
    AWS_ENDPOINT_URL_S3: o.endpoint,
    AWS_REGION: "auto",
    BUCKET_NAME: "bb-smoke",
    AWS_ACCESS_KEY_ID: "AKIDSMOKELOCALFAKE",
    AWS_SECRET_ACCESS_KEY: "smoke-fake-secret-not-real",
  };
}

/** 0.8.0 H2: fly.toml's [env] table as written: its `KEY = "value"` lines up to the next table (comments ignored), as
 *  tests/server-config.test.ts reads it. */
export function flyTomlEnv(toml: string): Record<string, string> {
  const env: Record<string, string> = {};
  let inEnv = false;
  for (const line of toml.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith("[")) {
      inEnv = t === "[env]";
      continue;
    }
    const m = inEnv ? /^([A-Za-z0-9_]+)\s*=\s*"([^"]*)"/.exec(t) : null;
    if (m) env[m[1]] = m[2];
  }
  return env;
}

/** Keys whose values are never printed, from the smoke's env or from fly.toml: credentials. */
const CREDENTIAL = /SECRET|ACCESS_KEY|TOKEN|PASSWORD|CREDENTIAL/i;
const shown = (key: string, value: string): string => (CREDENTIAL.test(key) ? "(set, not printed)" : value);

/**
 * 0.8.0 H2 (backlog 325): the transcript's env section, true whatever fly.toml says. It used to be the fixed line "env (as
 * fly.toml, except addressing and port)", which was already untrue (BB_GHOST_STATIC, BB_GHOST_ORIGINS, the cache TTL and
 * the fake S3's settings differ too) and stops being true about uploads once a deploy opens them in fly.toml, as 0.7.0's
 * uploads step did. Now every key is set against fly.toml's [env]: as fly.toml, different (both values named), unset by
 * the smoke (the server's default applies), or not in fly.toml (the Tigris settings are Fly app secrets there). The first
 * line names every key that differs. A credential's value is never printed, from either side.
 */
export function envReport(env: Record<string, string | undefined>, fly: Record<string, string>): string[] {
  const keys = [...Object.keys(env).filter((k) => k !== "PATH" && env[k] !== undefined), ...Object.keys(fly).filter((k) => env[k] === undefined)];
  const differ = keys.filter((k) => k in fly && env[k] !== fly[k]);
  const same = keys.filter((k) => k in fly && env[k] === fly[k]);
  const extra = keys.filter((k) => !(k in fly));
  const lines = [`env against fly.toml's [env] (read now): ${same.length} as fly.toml; ${differ.length} differ${differ.length ? ` (${differ.join(", ")})` : ""}; ${extra.length} not in fly.toml:`];
  for (const k of keys) {
    const v = env[k];
    if (!(k in fly)) lines.push(`  ${k}=${shown(k, v!)}   not in fly.toml's [env]`);
    else if (v === undefined) lines.push(`  ${k} unset (the server's default)   DIFFERS: fly.toml has ${shown(k, fly[k])}`);
    else if (v !== fly[k]) lines.push(`  ${k}=${shown(k, v)}   DIFFERS: fly.toml has ${shown(k, fly[k])}`);
    else lines.push(`  ${k}=${shown(k, v)}   as fly.toml`);
  }
  return lines;
}

async function main(): Promise<void> {
  const bundle = resolve("server/dist/ghost-server.mjs");
  const staticDir = resolve(flag("static") ?? "deploy/public");
  const out = resolve(flag("out") ?? "../output/logs/smoke.txt");
  if (!existsSync(bundle)) throw new Error(`${bundle} is missing: npm run build:server first`);
  if (!existsSync(join(staticDir, "index.html"))) throw new Error(`${staticDir}/index.html is missing: node deploy/stage.mjs <game.html> first`);
  const record = Object.fromEntries(readFileSync("deploy/GAME_BUILD.txt", "utf8").split("\n")
    .map((l) => /^([a-z0-9]+):\s*(.+)$/.exec(l)).filter((m): m is RegExpExecArray => m !== null).map((m) => [m[1], m[2]]));
  const head = await run("git", ["log", "-1", "--format=%h %s"]);

  say("# BeltBattles ghost server: local smoke run (no network)");
  say(`date: ${new Date().toISOString()}; node ${process.version}; commit ${head.out.trim()}`);
  say(`bundle: ${bundle}`);
  say(`static: ${staticDir}/index.html (GAME_BUILD.txt: ${record.source}, ${record.bytes} bytes)`);
  say();

  const fake = new FakeS3({ accessKeyId: "AKIDSMOKELOCALFAKE", secretAccessKey: "smoke-fake-secret-not-real", buckets: ["bb-smoke"] });
  const endpoint = await fake.listen(0);
  const port = await freePort();
  const env = smokeEnv({ port, staticDir, endpoint });
  say(`fake S3 (path-style, verifies SigV4 and payload hashes): ${endpoint}, bucket bb-smoke`);
  for (const l of envReport(env, flyTomlEnv(readFileSync("fly.toml", "utf8")))) say(l); // 0.8.0 H2: true whatever fly.toml says
  say();

  say("## 1. The start refuses a bad configuration");
  const noSecret = { ...env, AWS_SECRET_ACCESS_KEY: undefined };
  const r1 = await shell("node server/dist/ghost-server.mjs   # without AWS_SECRET_ACCESS_KEY", process.execPath, [bundle], noSecret);
  check(r1.code === 2 && r1.out.includes("AWS_SECRET_ACCESS_KEY") && !r1.out.includes("smoke-fake-secret"), "missing secret: exit 2, the variable named, no value printed");
  const empty = mkdtempSync(join(tmpdir(), "bb-smoke-empty-"));
  const r2 = await shell("node server/dist/ghost-server.mjs   # BB_GHOST_STATIC=<empty directory>", process.execPath, [bundle], { ...env, BB_GHOST_STATIC: empty });
  rmSync(empty, { recursive: true, force: true });
  check(r2.code === 2 && /static page: cannot read .*index\.html \(ENOENT\)/.test(r2.out), "missing index.html: exit 2 with a clear error");
  check(fake.requests.length === 0, "neither refused start touched storage");
  say();

  say("## 2. Seed (the release_command), twice");
  const s1 = await shell("node server/dist/ghost-server.mjs seed", process.execPath, [bundle, "seed"], env);
  const SEED_N = generateSamplePool().length; // 0.7.0a D5: 40 sample ghosts and 20 floor ghosts; 0.8.0 RC: + 60 race ghosts
  check(s1.code === 0 && new RegExp(`${SEED_N} written, 0 unchanged, 0 removed`).test(s1.out), `first seed writes the ${SEED_N}-ghost pool`);
  const ops = (from: number) => {
    const c: Record<string, number> = {};
    for (const r of fake.requests.slice(from)) c[r.op] = (c[r.op] ?? 0) + 1;
    return Object.entries(c).map(([k, v]) => `${k} ${v}`).join(", ") || "none";
  };
  say(`  fake S3 requests: ${ops(0)}`);
  const mark = fake.requests.length;
  const s2 = await shell("node server/dist/ghost-server.mjs seed", process.execPath, [bundle, "seed"], env);
  check(s2.code === 0 && new RegExp(`0 written, ${SEED_N} unchanged, 0 removed`).test(s2.out), "second seed changes nothing");
  say(`  fake S3 requests: ${ops(mark)}`);
  const pool = fake.keys("bb-smoke", `ghosts/${RULES_VERSION}/`);
  check(pool.length === SEED_N && pool.every((k) => k.includes("/pool/")), `bucket holds ${SEED_N} pool objects under ghosts/${RULES_VERSION}/dNN/pool/`);
  say();

  say("## 3. Serve");
  const before = fake.requests.length;
  const t0 = performance.now();
  const server = spawn(process.execPath, [bundle], { env });
  let log = "";
  const dec = new TextDecoder();
  server.stdout?.on("data", (c) => (log += dec.decode(c)));
  server.stderr?.on("data", (c) => (log += dec.decode(c)));
  let healthMs = -1;
  for (let i = 0; i < 250 && healthMs < 0; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/v1/health`);
      if (r.status === 200) healthMs = Math.round(performance.now() - t0);
    } catch {
      await sleep(10);
    }
  }
  say(`first 200 from /v1/health ${healthMs} ms after spawning the process`);
  check(healthMs >= 0 && healthMs < 1000, "health answers within about 1 s of process start");
  check(fake.requests.length === before, "start and health made no storage call");
  const base = `http://127.0.0.1:${port}`;
  const tmp = mkdtempSync(join(tmpdir(), "bb-smoke-"));

  const h = await shell(`curl -sS -i ${base}/v1/health`, "curl", ["-sS", "-i", `${base}/v1/health`]);
  check(/HTTP\/1\.1 200/.test(h.out) && /"store":"tigris"/.test(h.out) && /"uploads":"closed"/.test(h.out), "health: 200, store tigris, uploads closed");

  const page = join(tmp, "index.html");
  const g = await shell(`curl -sS -D - -o ${page} ${base}/`, "curl", ["-sS", "-D", "-", "-o", page, `${base}/`]);
  const got = readFileSync(page);
  say(`  downloaded ${got.length} bytes, sha256 ${sha256(got)}`);
  check(/HTTP\/1\.1 200/.test(g.out) && /content-type: text\/html; charset=utf-8/i.test(g.out) && /cache-control: no-cache/i.test(g.out)
    && /x-content-type-options: nosniff/i.test(g.out) && /referrer-policy: no-referrer/i.test(g.out), "GET /: 200 with the agreed headers");
  check(sha256(got) === record.sha256 && got.length === Number(record.bytes), "GET /: the body is the recorded game build (size and SHA-256 match GAME_BUILD.txt)");
  const hd = await shell(`curl -sS -I ${base}/index.html`, "curl", ["-sS", "-I", `${base}/index.html`]);
  check(/HTTP\/1\.1 200/.test(hd.out) && new RegExp(`content-length: ${record.bytes}`, "i").test(hd.out), "HEAD /index.html: 200, same length, no body");

  // 0.7.0a: a record a run can carry into dusk 3 (1 win, 5 lives) and a new player (runs 0: the seed pool only, D2)
  const matchUrl = `${base}/v1/ghosts/match?rules=${RULES_VERSION}&day=3&wins=1&lives=5&player=smoke-test&seen=&runs=0`;
  const beforeMatch = fake.requests.length;
  const m = await shell(`curl -sS -i -H 'Fly-Client-IP: 203.0.113.9' '${matchUrl}'`, "curl", ["-sS", "-i", "-H", "Fly-Client-IP: 203.0.113.9", matchUrl], undefined, 700);
  // STAGE-090 (cap's ruling bce92765e6026e9b): FLIP-X2 1517125 gave every pool deck its dawn runes, so a seed ghost travels as v3 (was SNAPSHOT_VERSION, 2)
  check(/HTTP\/1\.1 200/.test(m.out) && new RegExp(`"snapshot":\\{"v":${SNAPSHOT_V3},"rules":"${RULES_VERSION.replace(/\./g, "\\.")}","hero":"(furnace|weaver|foundry|bastion)","day":3`).test(m.out), "match day 3: 200 with a day-3 pool ghost"); // 0.8.0 RC: the four-hero seed pool
  const served = /"snapshot":\{"v":\d,"rules":"[^"]+","hero":"[a-z]+","day":3,"wins":(\d+),"lives":(\d+)/.exec(m.out);
  check(!!served && noBetterRecord({ wins: Number(served[1]), lives: Number(served[2]) }, { wins: 1, lives: 5 }),
    `0.7.0a D1: the match is no better a record than the request's 1W 5 lives (${served ? `${served[1]}W ${served[2]} lives` : "?"})`);
  say(`  fake S3 requests for that first match: ${ops(beforeMatch)}`);
  const beforeSecond = fake.requests.length;
  await run("curl", ["-sS", "-o", "/dev/null", matchUrl]);
  check(fake.requests.length === beforeSecond, "a second match within the cache TTL makes no storage call");

  const ghost = join(tmp, "ghost.json");
  writeFileSync(ghost, encodeSnapshot({ ...ungraded(generateSamplePool()[0]), playerId: "smoke-player", name: TEST_NAME }));
  const p = await shell(`curl -sS -i -X POST -H 'content-type: application/json' --data-binary @ghost.json ${base}/v1/ghosts`, "curl",
    ["-sS", "-i", "-X", "POST", "-H", "content-type: application/json", "--data-binary", `@${ghost}`, `${base}/v1/ghosts`]);
  check(/HTTP\/1\.1 403/.test(p.out) && p.out.includes('{"error":"uploads are not open yet"}'), "POST /v1/ghosts: 403, uploads are not open yet");
  // 0.7.0a: the game's own upload (submitGhost, signed by a fresh device key) meets the same 403 while closed
  const closedDevice = await loadIdentity(memoryKeyStore());
  const closedSub = closedDevice ? await submitGhost(base, { ...ungraded(generateSamplePool()[1]), runId: "smoke-closed", playerId: closedDevice.playerId, name: TEST_NAME }, closedDevice, 4000) : null;
  say(`  the game's submitGhost while closed: ${JSON.stringify(closedSub)}`);
  check(!!closedSub && !closedSub.ok && closedSub.status === 403, "0.7.0a: the game's signed upload (submitGhost) while closed: 403");
  check(fake.keys("bb-smoke").every((k) => !k.includes("/player/")), "no player object was written");
  rmSync(tmp, { recursive: true, force: true });

  server.kill("SIGTERM");
  await new Promise<void>((r) => server.on("exit", () => r()));
  say();
  say("## 4. Server log (stdout), after SIGTERM");
  for (const l of log.replace(/\n$/, "").split("\n")) say(`  ${l}`);
  check(/rate \d+\/min per client IP \(Fly-Client-IP\)/.test(log), "the rate limit keys on Fly-Client-IP (BB_GHOST_TRUST_PROXY=fly)");
  const requestLines = log.split("\n").filter((l) => / (GET|HEAD|POST|OPTIONS) \//.test(l));
  check(requestLines.some((l) => / GET \/v1\/ghosts\/match 200 \d+ms$/.test(l)), "the request log shows the match request");
  check(requestLines.length > 0 && !log.includes("203.0.113.9")
    && requestLines.every((l) => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z (GET|HEAD|POST|OPTIONS) \/\S* \d{3} \d+ms$/.test(l)),
    "the request log holds no client IP: time, method, path, status and duration only");
  check(/SIGTERM: shutting down/.test(log), "SIGTERM shuts down cleanly");
  check(!log.includes("smoke-fake-secret") && !log.includes("AKIDSMOKE"), "no credential in the log");
  say();

  say("## 5. Uploads open (0.7.0 prep, REQ-BFG-016): only a signed upload is stored");
  const openPort = await freePort();
  const openEnv = { ...env, BB_GHOST_UPLOADS: "open", BB_GHOST_PORT: String(openPort), BB_GHOST_ORIGINS: `http://127.0.0.1:${openPort}` };
  say(`env as in section 3, except BB_GHOST_UPLOADS=open, BB_GHOST_PORT=${openPort}, BB_GHOST_ORIGINS=http://127.0.0.1:${openPort}`);
  const device = await loadIdentity(memoryKeyStore()); // a fresh device key, as a new browser makes one
  check(device !== null, "WebCrypto (globalThis.crypto.subtle) makes a device key in this Node");
  if (device) {
    const players = () => fake.keys("bb-smoke").filter((k) => k.includes("/player/"));
    const open = await startServer(bundle, openEnv, openPort);
    say(`first 200 from /v1/health ${open.healthMs} ms after spawning the process`);
    const base2 = `http://127.0.0.1:${openPort}`;
    const h2 = await shell(`curl -sS ${base2}/v1/health`, "curl", ["-sS", `${base2}/v1/health`]);
    check(open.healthMs >= 0 && /"uploads":"open"/.test(h2.out), "health: 200, uploads open");

    const dir = mkdtempSync(join(tmpdir(), "bb-smoke-open-"));
    // 0.6.2's v2 snapshot: the first pool deck with turrets and a join, so the signature covers both
    const v2 = generateSamplePool().find((s) => s.build.turrets !== undefined && s.build.routes.some((r) => r.join !== undefined));
    if (!v2) throw new Error("the sample pool has no deck with turrets and a join");
    const mine = { ...ungraded(v2), runId: "smoke-run", playerId: device.playerId, name: TEST_NAME };
    const bytes = new TextEncoder().encode(encodeSnapshot(mine));
    say(`ghost.json: ${mine.hero} day ${mine.day}, snapshot v${mine.v}, ${bytes.length} bytes, ${mine.build.turrets?.length ?? 0} turret(s), `
      + `${mine.build.routes.filter((r) => r.join !== undefined).length} joining belt(s)`);
    const file = join(dir, "ghost.json");
    writeFileSync(file, bytes);
    const { key, sig } = await device.sign(bytes);
    const other = join(dir, "other.json"); // the same ghost one second later: other bytes, not signed
    writeFileSync(other, encodeSnapshot({ ...mine, createdAt: mine.createdAt + 1000 }));
    const id = ghostId(mine);
    const objectKey = `ghosts/${RULES_VERSION}/d${String(mine.day).padStart(2, "0")}/player/${id}.json`;
    say(`device key: playerId ${device.playerId} (base64url of SHA-256 of the raw public key)`);
    say(`  ${KEY_HEADER}: ${key}`);
    say(`  ${SIG_HEADER}: ${sig}   (ECDSA P-256 over "bb-ghost-upload-1\\n" + the bytes of ghost.json)`);
    const signed = ["-H", `${KEY_HEADER}: ${key}`, "-H", `${SIG_HEADER}: ${sig}`];
    const post = (label: string, headers: string[], body: string) => shell(
      `curl -sS -i -X POST -H 'content-type: application/json' ${label}--data-binary @${body === file ? "ghost.json" : "other.json"} ${base2}/v1/ghosts`,
      "curl", ["-sS", "-i", "-X", "POST", "-H", "content-type: application/json", ...headers, "--data-binary", `@${body}`, `${base2}/v1/ghosts`]);

    const p1 = await post("-H 'x-bb-key: <key>' -H 'x-bb-sig: <sig>' ", signed, file);
    check(/HTTP\/1\.1 201/.test(p1.out) && p1.out.includes(`{"id":"${id}"}`), `signed upload: 201 with the ghost's content id ${id}`);
    const stored = players().length === 1 && players()[0] === objectKey ? fake.getObject("bb-smoke", objectKey) ?? "" : "";
    let record: Record<string, unknown> = {};
    try {
      record = JSON.parse(stored) as Record<string, unknown>;
    } catch {
      /* checked below */
    }
    check(Object.keys(record).join() === "id,at,snapshot" && record.id === id && JSON.stringify(record.snapshot) === encodeSnapshot(mine)
      && !stored.includes(key) && !stored.includes(sig),
      `one player object, ${objectKey}: the {id, at, snapshot} record, the snapshot as signed (turrets and join included), no key and no signature`);
    const p2 = await post("-H 'x-bb-key: <key>' -H 'x-bb-sig: <sig>' ", signed, file);
    check(/HTTP\/1\.1 200/.test(p2.out) && p2.out.includes(`{"id":"${id}"}`) && players().length === 1, "the same signed upload again: 200, same id, nothing new stored");
    const p3 = await post("", [], file);
    check(/HTTP\/1\.1 401/.test(p3.out) && p3.out.includes('{"error":"unsigned upload: the x-bb-key and x-bb-sig headers are required"}') && players().length === 1,
      "the same ghost unsigned: 401, nothing stored");
    const p4 = await post("-H 'x-bb-key: <key>' -H 'x-bb-sig: <sig>' ", signed, other);
    check(/HTTP\/1\.1 401/.test(p4.out) && p4.out.includes('{"error":"x-bb-sig: the signature does not match this body and key"}') && players().length === 1,
      "other bytes under that signature: 401, nothing stored");
    rmSync(dir, { recursive: true, force: true });

    say();
    say("## 6. The game's side (0.7.0a): fetchGhost, a fight and submitGhost against this server (src/net, src/game)");
    const player2 = await loadIdentity(memoryKeyStore()); // another player's device
    if (!player2) throw new Error("no second device key");
    const day = mine.day;
    const poolIds = generateSamplePool().filter((s) => s.day === day).map((s) => ghostId(s));
    const reqOf = (runs: number, seen: string[], wins = day - 1, lives = START_LIVES): GhostRequest => ({
      rules: RULES_VERSION, day, wins, lives, playerId: player2.playerId, seen, hero: "furnace", seed: 7, runs,
    });
    const fresh = await fetchGhost(base2, reqOf(0, []), 4000);
    say(`  new player (runs 0): ${fresh.source} ${fresh.id} (${fresh.snapshot.hero}, ${fresh.snapshot.wins}W ${fresh.snapshot.lives} lives)`);
    check(fresh.source === "server" && poolIds.includes(fresh.id) && fresh.id !== id, "D2: a new player's fetchGhost (runs 0) gets a seed ghost, never the upload");
    const vet = await fetchGhost(base2, reqOf(3, poolIds), 4000);
    say(`  experienced player (runs 3), every seed ghost of day ${day} seen: ${vet.source} ${vet.id}`);
    check(vet.source === "server" && vet.id === id && noBetterRecord(vet.snapshot, reqOf(3, [])), "D2: from 3 finished runs, uploads are matched too (the signed upload, no better a record: D1)");
    const run = newRun("weaver", 4242, "smoke-client-run");
    run.day = day;
    const foe = onlineFoe(run, vet); // the game's DuskFoe: a kind "ghost", fought on battleSeed
    const seed = battleSeed(run);
    const fight = simulate(run.build, foe.build, seed, undefined, undefined, run.day); // HULL-1a (REQ-BFG-079): the run's day
    const again = replay(battleRecordFor(run.build, foe.build, seed, undefined, run.day));
    say(`  the fight: ${foe.name} (${foe.kind}, ${foe.source}) on battleSeed ${seed}: winner ${fight.winner}, ${fight.t.toFixed(1)}s; the stored record replays to winner ${again.winner}`);
    check(foe.kind === "ghost" && foe.source === "online" && fight.over && again.winner === fight.winner && again.ticks === fight.ticks
      && again.hulls[0] === fight.sides[0].hull.hp && again.hulls[1] === fight.sides[1].hull.hp, "the client fights the fetched ghost; its battle record replays to the same result");
    const none = await fetchGhost(base2, reqOf(3, [], 0, 0), 4000); // no ghost has fewer than one life: none eligible
    const fallback = onlineFoe(run, none);
    say(`  no eligible ghost: ${none.source} (${none.error}) -> ${fallback.kind} ${fallback.name}`);
    check(none.source === "fallback" && /no ghost/.test(none.error ?? "") && fallback.kind === "standin" && fallback.name === standInFoe(run.seed, day).name,
      "no eligible ghost: 404, and the game fights 0.6.2's own stand-in (standInFoe)");
    const up2 = await submitGhost(base2, { ...ungraded(generateSamplePool()[1]), runId: "smoke-run-2", playerId: player2.playerId, name: TEST_NAME }, player2, 4000);
    say(`  the game's submitGhost while open: ${JSON.stringify(up2)}`);
    check(up2.ok && players().length === 2, "the game's signed upload (submitGhost) while open: 201, stored");

    const log2 = await open.stop();
    say("server log (stdout), after SIGTERM:");
    for (const l of log2.replace(/\n$/, "").split("\n")) say(`  ${l}`);
    const lines2 = log2.split("\n").filter((l) => / (GET|HEAD|POST|OPTIONS) \//.test(l));
    const posts = lines2.map((l) => / POST \/v1\/ghosts (\d{3}) /.exec(l)?.[1]).filter((s) => s !== undefined);
    check(/uploads open\)/.test(log2) && posts.join(",") === "201,200,401,401,201", "the request log shows the five uploads: 201, 200, 401, 401, then the game's 201");
    check(lines2.length > 0 && lines2.every((l) => REQUEST_LINE.test(l)) && !log2.includes(device.playerId) && !log2.includes(player2.playerId) && !log2.includes(key) && !log2.includes(sig),
      "the request log holds no client IP, no key, no signature and no player id");
    check(/SIGTERM: shutting down/.test(log2), "SIGTERM shuts down cleanly");
  }

  say();
  say("## 7. The ghost admin tool (0.7.0 R1 M2): the built server/dist/ghost-admin.mjs on the same store, from the same env");
  const admin = resolve("server/dist/ghost-admin.mjs");
  const keys = () => fake.keys("bb-smoke", `ghosts/${RULES_VERSION}/`);
  const uploads = () => keys().filter((k) => k.includes("/player/"));
  const total = (o: string) => /^ +all +(\d+) +(\d+) +(\d+)$/m.exec(o)?.slice(1).map(Number).join("/") ?? "?";
  const a1 = await shell(`node server/dist/ghost-admin.mjs list --rules ${RULES_VERSION}`, process.execPath, [admin, "list", "--rules", RULES_VERSION], env);
  const ups0 = uploads().length;
  check(a1.code === 0 && total(a1.out) === `${SEED_N}/${ups0}/${ups0}`, `list: ${SEED_N} seed-pool ghosts, ${ups0} uploads by ${ups0} players (all: ${total(a1.out)})`);
  const markA = fake.requests.length;
  const a2 = await shell("node server/dist/ghost-admin.mjs list   # no --rules", process.execPath, [admin, "list"], env, 200);
  check(a2.code === 2 && /--rules <bb-x\.y\.z> is required/.test(a2.out) && fake.requests.length === markA, "no --rules: exit 2, nothing read");
  // a deck 20 plates over day 1's budget, written straight into the bucket (past POST and its validateUpload)
  const p0 = generateSamplePool().find((s) => s.day === 1)!;
  const cheat = { ...p0, playerId: "smoke-cheater", runId: "smoke-cheat", name: TEST_NAME, build: { ...p0.build, hullBonus: p0.build.hullBonus + 500 } };
  const cheatKey = objectKey("player", RULES_VERSION, 1, ghostId(cheat));
  fake.putObject("bb-smoke", cheatKey, encodeRecord(ghostId(cheat), 1, cheat));
  const keys0 = keys(), deletes0 = fake.count("DELETE");
  const a3 = await shell(`node server/dist/ghost-admin.mjs revalidate --rules ${RULES_VERSION}   # dry run`, process.execPath, [admin, "revalidate", "--rules", RULES_VERSION], env);
  check(a3.code === 0 && a3.out.includes(`delete ${cheatKey}`) && /validateUpload: budget/.test(a3.out) && /plan: delete 1 record/.test(a3.out)
    && /DRY RUN: nothing was deleted/.test(a3.out) && keys().join() === keys0.join() && fake.count("DELETE") === deletes0,
    "revalidate (dry run): finds the planted over-budget upload, and deletes nothing");
  const a4 = await shell(`node server/dist/ghost-admin.mjs revalidate --rules ${RULES_VERSION} --apply`, process.execPath, [admin, "revalidate", "--rules", RULES_VERSION, "--apply"], env);
  check(a4.code === 0 && /APPLIED: deleted 1 of 1/.test(a4.out) && keys().join() === keys0.filter((k) => k !== cheatKey).join(),
    "revalidate --apply: deletes exactly that object");
  const a5 = await shell(`node server/dist/ghost-admin.mjs wipe-uploads --rules ${RULES_VERSION} --apply`, process.execPath, [admin, "wipe-uploads", "--rules", RULES_VERSION, "--apply"], env);
  check(a5.code === 0 && new RegExp(`APPLIED: deleted ${ups0} of ${ups0}`).test(a5.out) && uploads().length === 0 && keys().length === SEED_N,
    `wipe-uploads --apply: every upload gone, the ${SEED_N} seed-pool ghosts kept (no --pool)`);
  const a6 = await shell(`node server/dist/ghost-admin.mjs list --rules ${RULES_VERSION}`, process.execPath, [admin, "list", "--rules", RULES_VERSION], env);
  check(a6.code === 0 && total(a6.out) === `${SEED_N}/0/0`, `a later list agrees: ${total(a6.out)}`);
  const adminOut = [a1, a2, a3, a4, a5, a6].map((r) => r.out).join("\n");
  check(!adminOut.includes("smoke-fake-secret") && !adminOut.includes("AKIDSMOKE"), "no credential in the tool's output");
  await fake.close();
  say();
  say(failures ? `SMOKE FAILED: ${failures} check(s)` : "SMOKE PASSED: every check");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, lines.join("\n") + "\n");
  console.log(`transcript written to ${out}`);
  if (failures) process.exitCode = 1;
}

// 0.8.0 H2: the smoke runs only as the CLI; under vitest, tests/h2.smoke.test.ts imports smokeEnv, flyTomlEnv and envReport
if (!process.env.VITEST) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.stack ?? e.message : String(e));
    process.exitCode = 1;
  });
}
