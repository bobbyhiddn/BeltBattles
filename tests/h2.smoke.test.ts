// 0.8.0 H2 M2 (REQ-BFG-009, REQ-BFG-016; backlog 325): the smoke's env line is true whatever fly.toml says. tools/smoke.ts
// printed "env (as fly.toml, except addressing and port):", which was untrue (BB_GHOST_STATIC, BB_GHOST_ORIGINS, the cache
// TTL and the fake S3's settings differ too) and would become untrue about uploads once a deploy opens them in fly.toml
// (0.7.0's uploads step did, on uploads-070). Now the smoke sets its env (smokeEnv) against fly.toml's [env] (flyTomlEnv)
// and prints envReport: every key the same, different (both values), unset, or not in fly.toml; never a credential.
// Checked with fly.toml at HEAD and with a fixture fly.toml each way (uploads open, uploads closed): the uploads difference
// is named only when fly.toml says open, as HEAD does from 0.8.0 U2 M1 on (the uploads step; oracle 9f153fecb7b1b642).
// The smoke itself (npm run smoke) prints exactly these lines (its transcript: output-H2/logs).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { smokeRequest, smokeUpload } from "../tools/smoke"; // BUMP-1H T2: the smoke's upload choice and request
import { noBetterRecord } from "../src/net/matchmaking";
import { HEARTS_START } from "../src/sim/hearts";
import { generateSamplePool } from "./helpers/poolCache"; // BUMP-1H T2: the cached twin of the pool builder (tests reach the builders through it)
import { envReport, flyTomlEnv, smokeEnv } from "../tools/smoke";

const HEAD_TOML = readFileSync(new URL("../fly.toml", import.meta.url), "utf8");
// 0.8.0 U2 M1: each fixture sets the uploads switch itself, whatever HEAD's fly.toml says (HEAD opens uploads from U2 on)
const setUploads = (toml: string, v: "open" | "closed") => toml.replace(/^(\s*BB_GHOST_UPLOADS\s*=\s*)"(open|closed)"/m, `$1"${v}"`);
const OPEN_TOML = setUploads(HEAD_TOML, "open");
const CLOSED_TOML = setUploads(HEAD_TOML, "closed");
const ENV = smokeEnv({ port: 41234, staticDir: "/tmp/bb-smoke-static", endpoint: "http://127.0.0.1:39999" });
const SECRETS = ["AKIDSMOKELOCALFAKE", "smoke-fake-secret-not-real"];

// BUMP-1H T2 (BUMP-1G question 2; the tools/ line is approved in BRIEF-BUMP1H P2): the smoke's section 6 asks the open server, as a player with 3 finished runs, for the ghost
// section 5 uploaded and checks D1 (noBetterRecord) on what it gets back. A regenerated pool can turn that check red (BUMP-1G P7 met it on the 0.9.14 pool: the upload's record
// held 10 hearts, the request asked with 5), and only the smoke's own run showed it. So the smoke exports its upload choice (smokeUpload) and its request (smokeRequest), and this
// test asserts noBetterRecord(upload, request) for the pool as generated now (the cached twin: a pool build is shared with the other files). The smoke's source must use both.
describe("BUMP-1H T2: the smoke's upload and its request (tools/smoke.ts smokeUpload, smokeRequest)", () => {
  it("the upload section 5 sends is no better a record than the request section 6 asks with (D1), and the request holds the game's start hearts", () => {
    const upload = smokeUpload(generateSamplePool());
    expect(upload, "the pool holds a deck with turrets and a join that POST accepts (a day of the 10-day span, a record without a LAST CHANCE)").toBeDefined();
    const req = smokeRequest(upload!.day, 3, [], "smoke-player-2");
    expect(req.lives).toBe(HEARTS_START);
    expect(req.wins).toBe(upload!.day - 1);
    expect(noBetterRecord(upload!, req), `${upload!.hero} day ${upload!.day}: the upload's ${upload!.wins}W ${upload!.lives} lives against the request's ${req.wins}W ${req.lives} lives`).toBe(true);
  }, 900_000);

  it("the smoke makes its choice and its request with those two functions, so this test and the smoke cannot drift apart", () => {
    const src = readFileSync("tools/smoke.ts", "utf8"); // from the repo root (vitest's cwd); the URL form is a baseline type error (tsc-tests-baseline.json)
    expect(src).toMatch(/const v2 = smokeUpload\(generateSamplePool\(\)\);/);
    expect(src).toMatch(/=> smokeRequest\(day, runs, seen, player2\.playerId, wins, lives\);/);
  });
});

/** A report's line for `key`, and the keys its first line says differ. */
const lineOf = (lines: string[], key: string) => lines.filter((l) => l.startsWith(`  ${key}=`) || l.startsWith(`  ${key} `));
const differList = (lines: string[]) => /differ \(([^)]*)\)/.exec(lines[0])?.[1].split(", ") ?? [];

/** What every report must hold, whatever fly.toml says: each key once, each value as it is, no credential printed. */
function checkTrue(lines: string[], fly: Record<string, string>): void {
  const keys = new Set([...Object.keys(ENV).filter((k) => k !== "PATH"), ...Object.keys(fly)]);
  expect(lines.length).toBe(keys.size + 1);
  for (const k of keys) {
    const [l, ...more] = lineOf(lines, k);
    expect(more, k).toEqual([]);
    const secret = /SECRET|ACCESS_KEY/.test(k);
    const v = ENV[k];
    if (!(k in fly)) expect(l, k).toBe(`  ${k}=${secret ? "(set, not printed)" : v}   not in fly.toml's [env]`);
    else if (v === undefined) expect(l, k).toBe(`  ${k} unset (the server's default)   DIFFERS: fly.toml has ${secret ? "(set, not printed)" : fly[k]}`);
    else if (v !== fly[k]) expect(l, k).toBe(`  ${k}=${secret ? "(set, not printed)" : v}   DIFFERS: fly.toml has ${secret ? "(set, not printed)" : fly[k]}`);
    else expect(l, k).toBe(`  ${k}=${secret ? "(set, not printed)" : v}   as fly.toml`);
  }
  const differ = [...keys].filter((k) => k in fly && ENV[k] !== fly[k]);
  expect(differList(lines).sort()).toEqual(differ.sort());
  for (const l of lines) {
    for (const s of SECRETS) expect(l).not.toContain(s);
    expect(l).not.toMatch(/as fly\.toml, except/); // the old claim
  }
}

describe("H2 M2: the smoke's env line (tools/smoke.ts envReport)", () => {
  it("reads fly.toml's [env] table as written (the same table tests/server-config.test.ts reads)", () => {
    const fly = flyTomlEnv(HEAD_TOML);
    expect(fly).toEqual({
      BB_GHOST_STORE: "tigris", BB_GHOST_UPLOADS: "open", BB_GHOST_TRUST_PROXY: "fly", BB_GHOST_HOST: "0.0.0.0",
      BB_GHOST_PORT: "8080", BB_GHOST_STATIC: "/app/public", BB_GHOST_ORIGINS: "https://beltbattles.fly.dev", BB_GHOST_CACHE_TTL_S: "600",
    });
    expect(flyTomlEnv(OPEN_TOML)).toEqual({ ...fly, BB_GHOST_UPLOADS: "open" });
    expect(flyTomlEnv(CLOSED_TOML)).toEqual({ ...fly, BB_GHOST_UPLOADS: "closed" });
    expect(flyTomlEnv('[env]\n  A = "1" # note\n[[vm]]\n  B = "2"\n[env.x]\n  C = "3"\n')).toEqual({ A: "1" });
  });

  it("fly.toml at HEAD (uploads open, as tests/server-config.test.ts pins): uploads, port, page, origins and cache TTL named as differing", () => {
    const fly = flyTomlEnv(HEAD_TOML);
    expect(fly.BB_GHOST_UPLOADS).toBe("open");
    const lines = envReport(ENV, fly);
    checkTrue(lines, fly);
    expect(lineOf(lines, "BB_GHOST_UPLOADS")).toEqual(["  BB_GHOST_UPLOADS=closed   DIFFERS: fly.toml has open"]); // the smoke runs its own server closed
    expect(differList(lines)).toContain("BB_GHOST_UPLOADS");
    expect(differList(lines)).toEqual(["BB_GHOST_UPLOADS", "BB_GHOST_PORT", "BB_GHOST_STATIC", "BB_GHOST_ORIGINS", "BB_GHOST_CACHE_TTL_S"]);
    expect(lines[0]).toBe("env against fly.toml's [env] (read now): 3 as fly.toml; 5 differ (BB_GHOST_UPLOADS, BB_GHOST_PORT, BB_GHOST_STATIC, BB_GHOST_ORIGINS, BB_GHOST_CACHE_TTL_S); 6 not in fly.toml:");
    expect(lineOf(lines, "BB_GHOST_CACHE_TTL_S")).toEqual(["  BB_GHOST_CACHE_TTL_S unset (the server's default)   DIFFERS: fly.toml has 600"]);
  });

  it("a fixture fly.toml with BB_GHOST_UPLOADS = \"open\": the uploads difference is named, with both values", () => {
    expect(OPEN_TOML).not.toBe(CLOSED_TOML);
    const fly = flyTomlEnv(OPEN_TOML);
    const lines = envReport(ENV, fly);
    checkTrue(lines, fly);
    expect(lineOf(lines, "BB_GHOST_UPLOADS")).toEqual(["  BB_GHOST_UPLOADS=closed   DIFFERS: fly.toml has open"]);
    expect(differList(lines)).toEqual(["BB_GHOST_UPLOADS", "BB_GHOST_PORT", "BB_GHOST_STATIC", "BB_GHOST_ORIGINS", "BB_GHOST_CACHE_TTL_S"]);
  });

  // 0.8.0 U2 M1 (oracle 9f153fecb7b1b642): the HEAD case's former checks, kept on a closed fixture
  it("a fixture fly.toml with BB_GHOST_UPLOADS = \"closed\" (the code's default, and the rollback's switch: deploy-080 with -e BB_GHOST_UPLOADS=closed): uploads as fly.toml; port, page, origins and cache TTL named as differing", () => {
    expect(CLOSED_TOML).not.toBe(OPEN_TOML);
    const fly = flyTomlEnv(CLOSED_TOML);
    expect(fly.BB_GHOST_UPLOADS).toBe("closed");
    const lines = envReport(ENV, fly);
    checkTrue(lines, fly);
    expect(lineOf(lines, "BB_GHOST_UPLOADS")).toEqual(["  BB_GHOST_UPLOADS=closed   as fly.toml"]);
    expect(differList(lines)).not.toContain("BB_GHOST_UPLOADS");
    expect(differList(lines)).toEqual(["BB_GHOST_PORT", "BB_GHOST_STATIC", "BB_GHOST_ORIGINS", "BB_GHOST_CACHE_TTL_S"]);
    expect(lines[0]).toBe("env against fly.toml's [env] (read now): 4 as fly.toml; 4 differ (BB_GHOST_PORT, BB_GHOST_STATIC, BB_GHOST_ORIGINS, BB_GHOST_CACHE_TTL_S); 6 not in fly.toml:");
    expect(lineOf(lines, "BB_GHOST_CACHE_TTL_S")).toEqual(["  BB_GHOST_CACHE_TTL_S unset (the server's default)   DIFFERS: fly.toml has 600"]);
  });

  it("never prints a credential, from the smoke's env or from fly.toml's [env]", () => {
    const fly = { ...flyTomlEnv(HEAD_TOML), AWS_SECRET_ACCESS_KEY: "a-secret-in-fly-toml", API_TOKEN: "a-token-in-fly-toml" };
    const lines = envReport(ENV, fly);
    const text = lines.join("\n");
    for (const s of [...SECRETS, "a-secret-in-fly-toml", "a-token-in-fly-toml"]) expect(text).not.toContain(s);
    expect(lineOf(lines, "AWS_SECRET_ACCESS_KEY")).toEqual(["  AWS_SECRET_ACCESS_KEY=(set, not printed)   DIFFERS: fly.toml has (set, not printed)"]);
    expect(lineOf(lines, "API_TOKEN")).toEqual(["  API_TOKEN unset (the server's default)   DIFFERS: fly.toml has (set, not printed)"]);
  });

  it("the smoke prints this report from fly.toml as it is when it runs, and no fixed label any more", () => {
    const src = readFileSync(new URL("../tools/smoke.ts", import.meta.url), "utf8");
    expect(src).toMatch(/for \(const l of envReport\(env, flyTomlEnv\(readFileSync\("fly\.toml", "utf8"\)\)\)\) say\(l\);/);
    expect(src).toMatch(/const env = smokeEnv\(\{ port, staticDir, endpoint \}\);/);
    expect(src).not.toMatch(/say\([^;]*as fly\.toml/); // no say() prints a fixed "as fly.toml" label
  });
});
