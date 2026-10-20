// VERIFY-IDENT1 (REQ-BFG-122) step 4e, written by the independent checker (cap_zeta): A 0.9.13 CLIENT AGAINST THE NEW SERVER.
//
// HOW THE OLD MODULES ARE LOADED. `git archive ident1-base` is exported to a directory (default <repo>/../tmp/base, or $VIDENT1_BASE; made
// here if missing) and the client modules are imported FROM THERE by absolute path with a dynamic import(): src/net/identity.ts,
// src/net/ghostClient.ts, src/net/profileClient.ts, src/game/profile.ts, and with them everything they import (the export's own src/).
// The first test proves they are the old ones: byte-equal to `git show ident1-base:<path>`, different from the tip's, with no IDENT-1
// export. The NEW server is the tip's own server/app.ts in process; the OLD server (the export's server/app.ts) runs beside it for
// byte-for-byte comparisons of the replies and the stored records. JSON-lines stores; the Tigris fake adds nothing for these checks.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as childProcess from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as tipIdentity from "../src/net/identity";
import * as tipGhost from "../src/net/ghostClient";
import { RULES_VERSION } from "../src/sim/content";
import { HEARTS_START } from "../src/sim/hearts";
import { testIdentity, testKeyStore } from "./netIdentity";
import { NOW } from "./profileupWire";
import { closeRigs, deleteMe, openRig, postGhost, send, uploadFor, type Rig } from "./identRig";

// tsconfig.tests.json carries a small shim for node:child_process and process (the ratchet counts type errors): these go through any
const execFileSync = (childProcess as unknown as { execFileSync(file: string, args: string[], opts?: Record<string, unknown>): string }).execFileSync;
const R2 = (process as unknown as { cwd(): string }).cwd();
const BASE = process.env.VIDENT1_BASE ?? join(R2, "..", "tmp", "base");
const abs = (rel: string) => join(BASE, rel);
const blob = (rel: string) => execFileSync("git", ["show", `ident1-base:${rel}`], { cwd: R2, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

/* eslint-disable @typescript-eslint/no-explicit-any */
let oldIdentity: any, oldGhost: any, oldProfileClient: any, oldProfile: any, oldApp: any;
const dirs: string[] = [];
const closers: (() => Promise<void>)[] = [];
const ORIGINS = ["http://127.0.0.1:7778", "https://play.example"];
const quiet = { windowMs: 60_000, max: 1_000_000 };

beforeAll(async () => {
  if (!existsSync(abs("src/net/identity.ts"))) {
    mkdirSync(BASE, { recursive: true });
    execFileSync("sh", ["-c", `git archive ident1-base | tar -x -C "${BASE}"`], { cwd: R2 });
  }
  oldIdentity = await import(/* @vite-ignore */ abs("src/net/identity.ts"));
  oldGhost = await import(/* @vite-ignore */ abs("src/net/ghostClient.ts"));
  oldProfileClient = await import(/* @vite-ignore */ abs("src/net/profileClient.ts"));
  oldProfile = await import(/* @vite-ignore */ abs("src/game/profile.ts"));
  oldApp = await import(/* @vite-ignore */ abs("server/app.ts"));
}, 300_000);
afterAll(async () => {
  for (const c of closers.splice(0)) await c().catch(() => {});
  await closeRigs();
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

interface OldServer {
  base: string;
  dir: string;
  log: string[];
}
/** The OLD server (the export's server/app.ts) over a fresh directory, with the same clock and options as the tip's rig. */
async function openOld(): Promise<OldServer> {
  const dir = mkdtempSync(join(tmpdir(), "bb-vold-"));
  dirs.push(dir);
  const log: string[] = [];
  const app = oldApp.createGhostServer({ dataDir: dir, log: (l: string) => log.push(l), now: () => NOW, rateLimit: quiet, origins: ORIGINS });
  closers.push(() => app.close());
  return { base: `http://127.0.0.1:${await app.listen(0)}`, dir, log };
}
const openNew = (): Promise<Rig> => openRig("jsonl", { rateLimit: quiet, origins: ORIGINS });

/** Run `fn` with global fetch recording (method, path, status) of every request: the old client modules call the global fetch. */
async function recording(fn: () => Promise<any>): Promise<{ out: any; seen: { method: string; path: string; status: number }[] }> {
  const real = globalThis.fetch;
  const seen: { method: string; path: string; status: number }[] = [];
  globalThis.fetch = (async (input: any, init?: any) => {
    const res = await real(input, init);
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    seen.push({ method: String(init?.method ?? "GET").toUpperCase(), path: url.pathname, status: res.status });
    return res;
  }) as typeof fetch;
  try {
    return { out: await fn(), seen };
  } finally {
    globalThis.fetch = real;
  }
}

const readLines = (dir: string, file: string): any[] =>
  existsSync(join(dir, file)) ? readFileSync(join(dir, file), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)) : [];
const untimed = (o: any): any => {
  const { at, receivedAt, ...rest } = o ?? {};
  void at;
  void receivedAt;
  return rest;
};

describe("the old modules are the old ones", () => {
  it("byte-equal to ident1-base, different from the tip's, and with nothing of IDENT-1 in them", () => {
    for (const rel of ["src/net/identity.ts", "src/net/ghostClient.ts", "src/net/profileClient.ts", "src/game/profile.ts", "server/app.ts"]) {
      expect(readFileSync(abs(rel), "utf8"), `${rel} is ident1-base's`).toBe(blob(rel));
    }
    for (const rel of ["src/net/identity.ts", "src/net/ghostClient.ts", "src/net/profileClient.ts", "server/app.ts"]) {
      expect(readFileSync(abs(rel), "utf8"), `${rel} differs from the tip's`).not.toBe(readFileSync(join(R2, rel), "utf8"));
    }
    expect(oldIdentity.LINK_CODE_PREFIX).toBeUndefined();
    expect(oldIdentity.DELETE_PREFIX).toBeUndefined();
    expect(oldIdentity.verifyDomain).toBeUndefined();
    expect(tipIdentity.LINK_CODE_PREFIX).toBeDefined();
    expect(oldProfileClient.getProfile).toBeUndefined();
  });

  it("the old Identity has exactly its 0.9.13 shape: playerId, publicKey, sign", async () => {
    const id = await oldIdentity.loadIdentity(await testKeyStore(0));
    expect(Object.keys(id).sort()).toEqual(["playerId", "publicKey", "sign"]);
    expect(id.keyId).toBeUndefined();
    expect(id.refresh).toBeUndefined();
    const tip = await testIdentity(0);
    expect(id.playerId).toBe(tip.playerId); // the same key, the same id
  });
});

describe("the two existing signing domains sign the same bytes", () => {
  it("uploadMessage is byte-for-byte equal in both domains for assorted bodies; a signature made by one side verifies on the other, both ways, in both domains", async () => {
    expect(oldIdentity.UPLOAD_PREFIX).toBe(tipIdentity.UPLOAD_PREFIX);
    expect(oldIdentity.PROFILE_PREFIX).toBe(tipIdentity.PROFILE_PREFIX);
    expect(tipIdentity.UPLOAD_PREFIX).toBe("bb-ghost-upload-1\n");
    expect(tipIdentity.PROFILE_PREFIX).toBe("bb-profile-1\n");
    const enc = (s: string) => new TextEncoder().encode(s);
    const bodies = [enc(""), enc("{}"), enc('{"v":1,"playerId":"x"}'), Uint8Array.from([0, 1, 2, 255, 254]), enc("é\n\u0000end"), new Uint8Array(70_000).fill(7)];
    const same = (x: Uint8Array, y: Uint8Array): boolean => x.length === y.length && x.every((v, i) => v === y[i]);
    for (const b of bodies) {
      expect(same(tipIdentity.uploadMessage(b, tipIdentity.UPLOAD_PREFIX), oldIdentity.uploadMessage(b, oldIdentity.UPLOAD_PREFIX))).toBe(true);
      expect(same(tipIdentity.uploadMessage(b, tipIdentity.PROFILE_PREFIX), oldIdentity.uploadMessage(b, oldIdentity.PROFILE_PREFIX))).toBe(true);
      expect(same(tipIdentity.uploadMessage(b), oldIdentity.uploadMessage(b))).toBe(true); // the default domain is the upload's
    }
    const body = enc('{"hello":"world"}');
    const oldId = await oldIdentity.loadIdentity(await testKeyStore(1));
    const tipId = await testIdentity(1);
    for (const [prefix, verifyTip, verifyOld] of [
      [tipIdentity.UPLOAD_PREFIX, tipIdentity.verifyUpload, oldIdentity.verifyUpload], [tipIdentity.PROFILE_PREFIX, tipIdentity.verifyProfile, oldIdentity.verifyProfile],
    ] as const) {
      const s1 = await oldId.sign(body, prefix);
      expect(await verifyTip(body, s1.key, s1.sig), "the old client's signature on the new verifier").toEqual({ ok: true, playerId: oldId.playerId });
      const s2 = await tipId.sign(body, prefix as never);
      expect(await verifyOld(body, s2.key, s2.sig), "the new client's signature on the old verifier").toEqual({ ok: true, playerId: tipId.playerId });
      const other = prefix === tipIdentity.UPLOAD_PREFIX ? tipIdentity.PROFILE_PREFIX : tipIdentity.UPLOAD_PREFIX;
      const s3 = await oldId.sign(body, other);
      expect((await verifyTip(body, s3.key, s3.sig)).ok, "and the two old domains still do not pass for each other").toBe(false);
    }
  });
});

describe("a 0.9.13 device against the new server, and the same device against the old server", () => {
  it("its ghost upload: the same status, the same reply, the same stored record (and an upload again is the same 200 on both)", async () => {
    const nu = await openNew();
    const old = await openOld();
    const id = await oldIdentity.loadIdentity(await testKeyStore(0));
    const tipId = await testIdentity(0);
    const snap = uploadFor(tipId, tipId.playerId, { runId: "old-1" });
    const a = await recording(() => oldGhost.submitGhost(nu.base, snap, id));
    const b = await recording(() => oldGhost.submitGhost(old.base, snap, id));
    expect(a.out).toEqual({ ok: true, id: expect.any(String) });
    expect(a.out).toEqual(b.out);
    expect(a.seen).toEqual([{ method: "POST", path: "/v1/ghosts", status: 201 }]);
    expect(a.seen).toEqual(b.seen);
    const again = await recording(() => oldGhost.submitGhost(nu.base, snap, id));
    const againOld = await recording(() => oldGhost.submitGhost(old.base, snap, id));
    expect(again.seen).toEqual([{ method: "POST", path: "/v1/ghosts", status: 200 }]);
    expect(again.seen).toEqual(againOld.seen);
    expect(readLines(nu.dir, "ghosts.jsonl").map(untimed)).toEqual(readLines(old.dir, "ghosts.jsonl").map(untimed));
    expect(readLines(nu.dir, "ghosts.jsonl")).toHaveLength(1);
    // a snapshot under another player's id is still refused by the old client itself, with no request, and by the server with 403
    const forged = { ...snap, playerId: "somebody-else" };
    const refusedLocally = await recording(() => oldGhost.submitGhost(nu.base, forged, id));
    expect(refusedLocally.seen).toEqual([]);
    expect(refusedLocally.out.ok).toBe(false);
    const forgedBody = JSON.stringify(forged);
    const direct = await send(nu, "POST", "/v1/ghosts", forgedBody, await (async () => {
      const s = await id.sign(new TextEncoder().encode(forgedBody), oldIdentity.UPLOAD_PREFIX);
      return { "content-type": "application/json", "x-bb-key": s.key, "x-bb-sig": s.sig };
    })());
    const directOld = await send({ base: old.base }, "POST", "/v1/ghosts", forgedBody, await (async () => {
      const s = await id.sign(new TextEncoder().encode(forgedBody), oldIdentity.UPLOAD_PREFIX);
      return { "content-type": "application/json", "x-bb-key": s.key, "x-bb-sig": s.sig };
    })());
    expect([direct.status, direct.text]).toEqual([directOld.status, directOld.text]);
  });

  it("its profile PUT: 200 on both, the same stored record", async () => {
    const nu = await openNew();
    const old = await openOld();
    const id = await oldIdentity.loadIdentity(await testKeyStore(2));
    const p = oldProfile.emptyProfile();
    p.counters = { ...p.counters, runs: 6, bestDay: 5 };
    p.updatedAt = NOW;
    oldProfile.evaluateUnlocks(p);
    const a = await recording(() => oldProfileClient.putProfile(nu.base, id, p));
    const b = await recording(() => oldProfileClient.putProfile(old.base, id, p));
    expect(a.out).toEqual({ ok: true });
    expect(a.out).toEqual(b.out);
    expect(a.seen).toEqual([{ method: "PUT", path: "/v1/profile", status: 200 }]);
    expect(a.seen).toEqual(b.seen);
    const tipId = await testIdentity(2);
    const file = (dir: string) => readFileSync(join(dir, "profiles", `${tipId.playerId}.json`), "utf8");
    expect(file(nu.dir)).toBe(file(old.dir));
    // and a second PUT merges the same way
    p.counters = { ...p.counters, runs: 9 };
    expect((await oldProfileClient.putProfile(nu.base, id, p)).ok).toBe(true);
    expect((await oldProfileClient.putProfile(old.base, id, p)).ok).toBe(true);
    expect(file(nu.dir)).toBe(file(old.dir));
  });

  it("its match request: the same URL, and the same answer (another player's ghost, served as a server ghost) on both", async () => {
    const nu = await openNew();
    const old = await openOld();
    const me = await oldIdentity.loadIdentity(await testKeyStore(0));
    const other = await testIdentity(3);
    const snap = uploadFor(other, other.playerId, { runId: "other-1" });
    expect((await postGhost(nu, other, snap)).status).toBe(201);
    const otherOld = await oldIdentity.loadIdentity(await testKeyStore(3));
    expect((await oldGhost.submitGhost(old.base, snap, otherOld)).ok).toBe(true);
    const req = { rules: RULES_VERSION, day: 1, wins: 0, lives: HEARTS_START, playerId: me.playerId, seen: [] as string[], runs: 9, hero: "furnace", seed: 11 };
    expect(oldGhost.matchUrl("http://x", req)).toBe(tipGhost.matchUrl("http://x", req as never));
    const a = await recording(() => oldGhost.fetchGhost(nu.base, req, 4000, { pool: [] }));
    const b = await recording(() => oldGhost.fetchGhost(old.base, req, 4000, { pool: [] }));
    expect(a.seen).toHaveLength(1);
    expect(a.seen[0]).toMatchObject({ method: "GET", path: "/v1/ghosts/match", status: 200 });
    expect(a.seen).toEqual(b.seen);
    expect(a.out.source).toBe("server");
    expect(a.out.snapshot.playerId).toBe(other.playerId);
    expect(a.out).toEqual(b.out);
  });

  it("a bare GET /v1/profile is the 405 it was, byte for byte, and so are the other replies a 0.9.13 build can meet", async () => {
    const nu = await openNew();
    const old = await openOld();
    const same = async (method: string, path: string, headers: Record<string, string> = {}, body?: string) => {
      const x = await fetch(nu.base + path, { method, headers, ...(body === undefined ? {} : { body }) });
      const y = await fetch(old.base + path, { method, headers, ...(body === undefined ? {} : { body }) });
      const hx = Object.fromEntries([...x.headers.entries()].filter(([k]) => k !== "date"));
      const hy = Object.fromEntries([...y.headers.entries()].filter(([k]) => k !== "date"));
      expect([x.status, hx, await x.text()], `${method} ${path}`).toEqual([y.status, hy, await y.text()]);
      return x.status;
    };
    expect(await same("GET", "/v1/profile")).toBe(405);
    expect(await same("GET", "/v1/profile", { origin: ORIGINS[0] })).toBe(405);
    expect(await same("POST", "/v1/profile", {}, "{}")).toBe(405);
    expect(await same("DELETE", "/v1/profile")).toBe(405);
    expect(await same("PUT", "/v1/profile", { "content-type": "application/json" }, "{}")).toBe(401);
    expect(await same("POST", "/v1/ghosts", { "content-type": "application/json" }, "{}")).toBe(401);
    expect(await same("GET", "/v1/ghosts")).toBe(405);
    expect(await same("GET", "/v1/ghosts/match")).toBe(400);
    expect(await same("GET", "/v1/ghosts/match?rules=x&day=1&wins=0&lives=3&player=p&seen=")).toBe(await same("GET", "/v1/ghosts/match?rules=x&day=1&wins=0&lives=3&player=p&seen="));
    expect(await same("GET", "/nothing-here")).toBe(404);
    expect(await same("GET", "/v1/nothing")).toBe(404);
    expect(await same("POST", "/v1/health")).toBe(405);
  });

  it("the CORS preflight of every URL that existed at base is byte for byte what it was: 7 URLs x 3 origins x 4 requested methods x 2 header sets", async () => {
    const nu = await openNew();
    const old = await openOld();
    const urls = ["/v1/health", "/v1/ghosts", "/v1/ghosts/match", "/v1/profile", "/", "/index.html", "/v1/ghosts/", "/v1/profile?x=1", "/v1/nothing"];
    const origins = [ORIGINS[0], ORIGINS[1], "https://evil.example", ""];
    const methods = ["GET", "POST", "PUT", "DELETE"];
    const headerSets = ["content-type, x-bb-key, x-bb-sig", ""];
    let compared = 0;
    for (const path of urls) {
      for (const origin of origins) {
        for (const method of methods) {
          for (const reqHeaders of headerSets) {
            const headers: Record<string, string> = { ...(origin ? { origin } : {}), "access-control-request-method": method, ...(reqHeaders ? { "access-control-request-headers": reqHeaders } : {}) };
            const x = await fetch(nu.base + path, { method: "OPTIONS", headers });
            const y = await fetch(old.base + path, { method: "OPTIONS", headers });
            const hx = [...x.headers.entries()].filter(([k]) => k !== "date").sort();
            const hy = [...y.headers.entries()].filter(([k]) => k !== "date").sort();
            expect([x.status, hx, await x.text()], `OPTIONS ${path} origin=${origin || "none"} for ${method} [${reqHeaders}]`).toEqual([y.status, hy, await y.text()]);
            compared++;
          }
        }
      }
    }
    expect(compared).toBe(urls.length * origins.length * methods.length * headerSets.length);
    // the allowed-origin preflight really is the old one: the methods line is exactly the old string
    const sample = await fetch(nu.base + "/v1/ghosts", { method: "OPTIONS", headers: { origin: ORIGINS[0], "access-control-request-method": "POST" } });
    expect(sample.headers.get("access-control-allow-methods")).toBe("GET, POST, PUT, OPTIONS");
    expect(sample.headers.get("access-control-allow-headers")).toBe("content-type, x-bb-key, x-bb-sig");
    // and the one new URL says DELETE, as the report says
    const del = await fetch(nu.base + "/v1/player", { method: "OPTIONS", headers: { origin: ORIGINS[0], "access-control-request-method": "DELETE" } });
    expect(del.headers.get("access-control-allow-methods")).toBe("DELETE, OPTIONS");
  });

  it("the replies to ordinary requests carry the same CORS headers as before (an allowed origin, a refused one, none)", async () => {
    const nu = await openNew();
    const old = await openOld();
    for (const origin of [ORIGINS[0], "https://evil.example", ""]) {
      for (const path of ["/v1/health", "/v1/ghosts/match?rules=x", "/v1/profile", "/nothing"]) {
        const headers: Record<string, string> = origin ? { origin } : {};
        const x = await fetch(nu.base + path, { headers });
        const y = await fetch(old.base + path, { headers });
        const pick = (r: Response) => [...r.headers.entries()].filter(([k]) => k.startsWith("access-control") || k === "vary").sort();
        expect([x.status, pick(x)], `GET ${path} origin=${origin || "none"}`).toEqual([y.status, pick(y)]);
      }
    }
  });
});

describe("a 0.9.13 device whose player was deleted from another device", () => {
  it("its upload and its profile PUT come back as plain failures (410), no exception, nothing stored", async () => {
    const nu = await openNew();
    const id = await oldIdentity.loadIdentity(await testKeyStore(0));
    const tipId = await testIdentity(0);
    expect((await oldGhost.submitGhost(nu.base, uploadFor(tipId, tipId.playerId, { runId: "gone-1" }), id)).ok).toBe(true);
    expect((await deleteMe(nu, tipId)).status).toBe(200);
    const up = await oldGhost.submitGhost(nu.base, uploadFor(tipId, tipId.playerId, { runId: "gone-2" }), id);
    expect(up).toMatchObject({ ok: false, status: 410 });
    const p = oldProfile.emptyProfile();
    p.counters = { ...p.counters, runs: 2 };
    const put = await oldProfileClient.putProfile(nu.base, id, p);
    expect(put).toMatchObject({ ok: false, status: 410 });
    expect(existsSync(join(nu.dir, "profiles", `${tipId.playerId}.json`))).toBe(false);
  });
});
