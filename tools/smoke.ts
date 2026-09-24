// Local smoke run of the BUILT server bundle against the in-process fake S3. No network: everything
// listens on this machine. Run from the repo root after `node deploy/stage.mjs <game.html>`:
//   npm run smoke -- [--static deploy/public] [--out ../output/logs/smoke.txt]
// It starts the fake S3, shows two startup refusals, runs `seed` twice (fresh, then a no-op), starts
// the server with fly.toml's settings (tigris store, uploads closed, Fly proxy IP, 0.0.0.0, the staged
// page) except path-style addressing against the fake, times the first health answer, then curls
// health, /, HEAD /, a match and a closed POST, and writes the transcript. Exit 1 if a check fails.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { FakeS3 } from "./fakeS3";
import { generateSamplePool } from "./samplePool";
import { encodeSnapshot } from "../src/net/snapshot";
import { RULES_VERSION } from "../src/sim/content";

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
  const env: Record<string, string | undefined> = {
    PATH: process.env.PATH,
    BB_GHOST_STORE: "tigris",
    BB_GHOST_UPLOADS: "closed",
    BB_GHOST_TRUST_PROXY: "fly",
    BB_GHOST_HOST: "0.0.0.0",
    BB_GHOST_PORT: String(port),
    BB_GHOST_STATIC: staticDir,
    BB_GHOST_ORIGINS: `http://127.0.0.1:${port}`,
    BB_GHOST_S3_ADDRESSING: "path", // the fake is path-style only; production uses the virtual-hosted default
    AWS_ENDPOINT_URL_S3: endpoint,
    AWS_REGION: "auto",
    BUCKET_NAME: "bb-smoke",
    AWS_ACCESS_KEY_ID: "AKIDSMOKELOCALFAKE",
    AWS_SECRET_ACCESS_KEY: "smoke-fake-secret-not-real",
  };
  say(`fake S3 (path-style, verifies SigV4 and payload hashes): ${endpoint}, bucket bb-smoke`);
  say("env (as fly.toml, except addressing and port):");
  for (const [k, v] of Object.entries(env)) if (k !== "PATH") say(`  ${k}=${k.startsWith("AWS_ACCESS") || k.startsWith("AWS_SECRET") ? "(set: fake local value, not printed)" : v}`);
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
  check(s1.code === 0 && /40 written, 0 unchanged, 0 removed/.test(s1.out), "first seed writes the 40-ghost pool");
  const ops = (from: number) => {
    const c: Record<string, number> = {};
    for (const r of fake.requests.slice(from)) c[r.op] = (c[r.op] ?? 0) + 1;
    return Object.entries(c).map(([k, v]) => `${k} ${v}`).join(", ") || "none";
  };
  say(`  fake S3 requests: ${ops(0)}`);
  const mark = fake.requests.length;
  const s2 = await shell("node server/dist/ghost-server.mjs seed", process.execPath, [bundle, "seed"], env);
  check(s2.code === 0 && /0 written, 40 unchanged, 0 removed/.test(s2.out), "second seed changes nothing");
  say(`  fake S3 requests: ${ops(mark)}`);
  const pool = fake.keys("bb-smoke", `ghosts/${RULES_VERSION}/`);
  check(pool.length === 40 && pool.every((k) => k.includes("/pool/")), `bucket holds 40 pool objects under ghosts/${RULES_VERSION}/dNN/pool/`);
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

  const matchUrl = `${base}/v1/ghosts/match?rules=${RULES_VERSION}&day=3&wins=1&lives=3&player=smoke-test&seen=`;
  const beforeMatch = fake.requests.length;
  const m = await shell(`curl -sS -i -H 'Fly-Client-IP: 203.0.113.9' '${matchUrl}'`, "curl", ["-sS", "-i", "-H", "Fly-Client-IP: 203.0.113.9", matchUrl], undefined, 700);
  check(/HTTP\/1\.1 200/.test(m.out) && /"snapshot":\{"v":1,"rules":"bb-0\.4\.0","hero":"(furnace|weaver)","day":3/.test(m.out), "match day 3: 200 with a day-3 pool ghost");
  say(`  fake S3 requests for that first match: ${ops(beforeMatch)}`);
  const beforeSecond = fake.requests.length;
  await run("curl", ["-sS", "-o", "/dev/null", matchUrl]);
  check(fake.requests.length === beforeSecond, "a second match within the cache TTL makes no storage call");

  const ghost = join(tmp, "ghost.json");
  writeFileSync(ghost, encodeSnapshot({ ...generateSamplePool()[0], playerId: "smoke-player" }));
  const p = await shell(`curl -sS -i -X POST -H 'content-type: application/json' --data-binary @ghost.json ${base}/v1/ghosts`, "curl",
    ["-sS", "-i", "-X", "POST", "-H", "content-type: application/json", "--data-binary", `@${ghost}`, `${base}/v1/ghosts`]);
  check(/HTTP\/1\.1 403/.test(p.out) && p.out.includes('{"error":"uploads are not open yet"}'), "POST /v1/ghosts: 403, uploads are not open yet");
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
  await fake.close();
  say();
  say(failures ? `SMOKE FAILED: ${failures} check(s)` : "SMOKE PASSED: every check");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, lines.join("\n") + "\n");
  console.log(`transcript written to ${out}`);
  if (failures) process.exitCode = 1;
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.stack ?? e.message : String(e));
  process.exitCode = 1;
});
