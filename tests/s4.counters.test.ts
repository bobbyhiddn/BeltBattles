// S4 (BRIEF-S4 SHOULD b): /v1/health gains an `errors` block: requests answered since boot, the 5xx among them (and by route), and storage errors (a storage request that failed
// after its retries). Every field /v1/health had stays, first and unchanged. The two rules that read them: 5xx over 1% of the last 5 minutes' requests (with at least 20 requests and
// 3 errors), and any storage error in 5 minutes. A 4xx and a 429 are requests but never a 5xx; the counter by route is bounded whatever path a client asks for.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ENDLESS, setEndless } from "../src/sim/endless";
import { setPlayerName } from "../src/game/ghostSnapshot";
import { KEY_HEADER, PROFILE_PREFIX, SIG_HEADER, type Identity } from "../src/net/identity";
import { encodeWire } from "../src/net/profileWire";
import type { GhostSnapshot } from "../src/net/snapshot";
import { RequestCounters } from "../server/alerts";
import { createGhostServer, type GhostServer } from "../server/app";
import { S3Error, S3_FAILURES } from "../server/s3";
import { StorageError } from "../server/store";
import type { Validator } from "../server/validator";
import type { FakeS3 } from "../tools/fakeS3";
import { playEndless } from "./endless1.honest";
import { startFake, tigrisFor } from "./netStores";
import { ownedBy, signedHeaders, testIdentity, TEST_NAME } from "./netIdentity";
import { NOW, freshWire } from "./profileupWire";

setPlayerName(TEST_NAME);
let me: Identity;
let snap: GhostSnapshot;
beforeAll(async () => {
  setEndless(true);
  me = await testIdentity(0);
  snap = playEndless("weaver", 42, me.playerId, { buys: 0, until: 4 }).runSnaps.find((s) => s.day === 3)!;
}, 300_000);
afterAll(() => setEndless(ENDLESS));

const apps: GhostServer[] = [];
const fakes: FakeS3[] = [];
afterEach(async () => {
  while (apps.length) await apps.pop()!.close();
  while (fakes.length) await fakes.pop()!.close();
});

const health = async (url: string): Promise<Record<string, any>> => (await fetch(`${url}/v1/health`)).json() as Promise<Record<string, any>>;
async function putProfile(url: string, who: Identity): Promise<number> {
  const text = encodeWire(freshWire());
  const { key, sig } = await who.sign(new TextEncoder().encode(text), PROFILE_PREFIX);
  return (await fetch(`${url}/v1/profile`, { method: "PUT", headers: { "content-type": "application/json", [KEY_HEADER]: key, [SIG_HEADER]: sig }, body: text })).status;
}

describe("S4 counters: RequestCounters", () => {
  it("counts every request, and the 5xx by route; any path it does not know is 'other', so the counter stays small", () => {
    const c = new RequestCounters();
    for (const [p, s] of [["/v1/health", 200], ["/v1/ghosts", 201], ["/v1/ghosts", 422], ["/v1/ghosts/match", 404], ["/v1/profile", 429], ["/", 304]] as const) c.record(p, s);
    expect(c).toMatchObject({ requests: 6, serverErrors: 0, byRoute: {} });
    for (const [p, s] of [["/v1/ghosts", 503], ["/v1/ghosts", 500], ["/v1/profile", 503], ["/v1/health", 500], ["/index.html", 500], ["/v1/health/alerts", 503]] as const) c.record(p, s);
    expect(c.serverErrors).toBe(6);
    expect(c.byRoute).toEqual({ "/v1/ghosts": 2, "/v1/profile": 1, "/v1/health": 1, "/index.html": 1, "/v1/health/alerts": 1 });
    for (let i = 0; i < 10_000; i++) c.record(`/probe/${i}/${"x".repeat(50)}`, 500);
    expect(c.byRoute.other).toBe(10_000);
    expect(Object.keys(c.byRoute).length).toBeLessThanOrEqual(8);
    expect(c.requests).toBe(10_012);
  });

  it("an S3Error counts itself where it is born (the S3 client's retried failures are not errors; only the ones that surface are), and a StorageError that wraps one does not count again", () => {
    const before = S3_FAILURES.count;
    new S3Error("GET x: HTTP 503 (3 attempts)", 503);
    new S3Error("PUT y: HTTP 403 AccessDenied", 403, "AccessDenied");
    new StorageError("profile read failed: HTTP 503"); // a store's own wrapper
    expect(S3_FAILURES.count).toBe(before + 2);
  });
});

describe("S4 counters: /v1/health `errors`", () => {
  it("is the last block; every older field is where it was; a fresh server has counted nothing but the request that asks", async () => {
    const fake = await startFake();
    fakes.push(fake);
    const app = createGhostServer({ store: tigrisFor(fake), uploads: "open", log: () => {}, matchSalt: () => 0 });
    apps.push(app);
    const url = `http://127.0.0.1:${await app.listen(0)}`;
    const h = await health(url);
    expect(Object.keys(h)).toEqual(["ok", "rules", "store", "ghosts", "uploads", "uptimeS", "validator", "memory", "cache", "limits", "errors"]);
    expect(h.errors).toEqual({ requests: 0, serverErrors: 0, byRoute: {}, storage: S3_FAILURES.count });
    expect((await health(url)).errors.requests).toBe(1); // the first answer was counted once it was sent
    await fetch(`${url}/nothing-here`);
    await fetch(`${url}/v1/ghosts/match?rules=x`);
    const after = (await health(url)).errors;
    expect(after).toMatchObject({ requests: 4, serverErrors: 0, byRoute: {} }); // 404 and 400 are requests, not 5xx
  });

  it("a storage failure is a 503 on its route and a storage error; an internal error is a 500 on its route; both are counted, by route", async () => {
    const fake = await startFake();
    fakes.push(fake);
    const throwing: Validator = { kind: "in-thread", validate: async () => { throw new Error("a bug in the deck check"); }, stats: () => ({ kind: "in-thread", state: "in-thread", queued: 0, running: 0, queueMax: 0, timeoutMs: 0, checks: 0, queueFull: 0, timeouts: 0, restarts: 0, errors: 0, warmMs: null, workerHeapLimitMb: null }), close: async () => {} };
    const app = createGhostServer({ store: tigrisFor(fake, "bb-test", {}, { backoffMs: 1 }), uploads: "open", log: () => {}, matchSalt: () => 0, now: () => NOW, validator: throwing, rateLimit: { windowMs: 60_000, max: 1_000_000 } });
    apps.push(app);
    const url = `http://127.0.0.1:${await app.listen(0)}`;
    const storage0 = S3_FAILURES.count;
    fake.failNext(3, 503, "GET"); // one profile read that fails after its two retries
    expect(await putProfile(url, me)).toBe(503);
    expect(await putProfile(url, me)).toBe(200);
    const body = JSON.stringify(ownedBy({ ...snap, runId: "s4-counters" }, me));
    const up = await fetch(`${url}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
    expect(up.status).toBe(500);
    const e = (await health(url)).errors;
    expect(e.serverErrors).toBe(2);
    expect(e.byRoute).toEqual({ "/v1/profile": 1, "/v1/ghosts": 1 });
    expect(e.requests).toBe(3);
    expect(e.storage - storage0).toBe(1); // one failed profile read: the S3 error counts once, the profile store's own StorageError around it does not
    expect(S3_FAILURES.count - storage0).toBe(1);
  });
});

describe("S4 counters: the two rules, from a real server's own counters", () => {
  it("5xx over 1% of 30 requests (4 of them) and a storage error alert; the alerts leave when the window has passed; one blip on a quiet server does not alert", async () => {
    const fake = await startFake();
    fakes.push(fake);
    let now = Date.parse("2026-11-01T00:00:00Z");
    const app = createGhostServer({
      store: tigrisFor(fake, "bb-test", {}, { backoffMs: 1 }), uploads: "open", log: () => {}, matchSalt: () => 0, now: () => NOW, rateLimit: { windowMs: 60_000, max: 1_000_000 },
      alerts: { now: () => now, cfg: { workerBootGraceS: 0 } },
    });
    apps.push(app);
    const url = `http://127.0.0.1:${await app.listen(0)}`;
    const tick = (n = 1) => {
      for (let i = 0; i < n; i++) {
        now += 10_000;
        app.alerts.sampleNow();
      }
    };
    app.alerts.sampleNow();
    // a quiet server with one blip: 1 failure among 10 requests is neither 20 requests nor 3 errors
    fake.failNext(3, 503, "GET");
    const first: number[] = [];
    for (let i = 0; i < 10; i++) first.push(await putProfile(url, me));
    expect(first.filter((s) => s === 503)).toHaveLength(1);
    tick(6);
    const quiet = app.alerts.evaluate().map((a) => a.rule);
    expect(quiet).toEqual(["storage-errors"]); // the storage error is an alert by itself ("any storage error in 5 minutes"); the 5xx rate is not
    // now 4 failures among 30 requests
    tick(40); // the blip leaves the 5-minute window
    expect(app.alerts.evaluate()).toEqual([]);
    tick(1);
    fake.failNext(12, 503, "GET");
    const statuses: number[] = [];
    for (let i = 0; i < 30; i++) statuses.push(await putProfile(url, me));
    expect(statuses.filter((s) => s === 503)).toHaveLength(4);
    tick(2);
    const bad = app.alerts.evaluate();
    expect(bad.map((a) => a.rule)).toEqual(["server-errors", "storage-errors"]);
    expect(bad[0].detail).toMatch(/^4 of the last 3\d requests \(1\d\.\d%\) in 5 min were answered with a 5xx, more than 1%$/);
    expect(bad[1].detail).toMatch(/^[4-9] storage errors in the last 5 min/);
    const route = await fetch(`${url}/v1/health/alerts`);
    expect(route.status).toBe(503);
    // 6 quiet minutes later
    for (let i = 0; i < 36; i++) {
      tick();
      await putProfile(url, me);
    }
    tick(2);
    expect(app.alerts.evaluate()).toEqual([]);
    expect((await fetch(`${url}/v1/health/alerts`)).status).toBe(200);
  });
});
