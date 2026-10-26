// S2 (BRIEF-S2 step 5): POST /v1/ghosts with the deck check in a worker thread, end to end through server/app.ts. The worker is the TEST-ONLY script
// tests/s2.fakeworker.mjs (it fakes the verdict and can be told to sleep or crash by the snapshot's day), so these tests are about the QUEUE, the
// DEADLINE and the RESPAWN as a client sees them: while a slow check runs the other routes answer in milliseconds; the 18th concurrent upload is
// refused with 503 + Retry-After and nothing is stored; an upload past its deadline gets 503, the worker is replaced and the next upload is checked
// normally; a crashed worker's job gets 503 and the counters show it; /v1/health has the new fields and its old ones unchanged.
// The real worker and the real verdicts are tests/s2.bundle.test.ts's, on the built bundle. The honest snapshots are played through the game's own code
// (tests/endless1.honest.ts), a lean deck. Nothing here builds the stand-in sample pool.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RULES_VERSION } from "../src/sim/content";
import { ENDLESS, setEndless } from "../src/sim/endless";
import { setPlayerName } from "../src/game/ghostSnapshot";
import { ghostId, type GhostSnapshot } from "../src/net/snapshot";
import type { Identity } from "../src/net/identity";
import type { GhostServer } from "../server/app";
import { createWorkerValidator, type Validator, type WorkerValidatorOptions } from "../server/validator";
import { jsonlBackend, type StoreBackend } from "./netStores";
import { signedHeaders, testIdentity, TEST_NAME } from "./netIdentity";
import { playEndless } from "./endless1.honest";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "s2.fakeworker.mjs");
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
setPlayerName(TEST_NAME);

let me: Identity;
let runSnaps: GhostSnapshot[]; // an honest lean run, dusks of days 1-10
const dusk = (day: number, i = 0): GhostSnapshot => ({ ...runSnaps.find((s) => s.day === day)!, runId: `s2-${day}-${i}` }); // a distinct honest upload per i (the id hashes the runId)

beforeAll(async () => {
  setEndless(true);
  me = await testIdentity(0);
  runSnaps = playEndless("weaver", 42, me.playerId, { buys: 0, until: 10 }).runSnaps;
}, 300_000);
afterAll(() => setEndless(ENDLESS));

interface Rig { app: GhostServer; base: string; backend: StoreBackend; validator: Validator }
const rigs: Rig[] = [];
async function rig(validatorOpts: Partial<WorkerValidatorOptions>, staticDir?: string): Promise<Rig> {
  const backend = jsonlBackend();
  await backend.setup();
  const validator = createWorkerValidator({ script: SCRIPT, ...validatorOpts });
  // S3: these tests are about the QUEUE, which sits behind S3's in-flight caps (budget.ts: 1 deck check per key, 4 per address). They send one key's
  // uploads at once on purpose (18 to fill the queue, a stuck one and one behind it), so the caps are raised out of the way here; tests/s3.budget.test.ts
  // has the caps themselves
  const app = backend.server({ uploads: "open", log: () => {}, rateLimit: { windowMs: 60_000, max: 1_000_000 }, matchSalt: () => 0, validator, limits: { checkKeyInflight: 1000, checkIpInflight: 1000 }, ...(staticDir ? { staticDir } : {}) });
  const base = `http://127.0.0.1:${await app.listen(0)}`;
  const r = { app, base, backend, validator };
  rigs.push(r);
  return r;
}
afterEach(async () => {
  while (rigs.length) {
    const r = rigs.pop()!;
    await r.app.close();
    await r.validator.close();
    await r.backend.teardown();
  }
});

async function post(r: Rig, s: GhostSnapshot): Promise<{ status: number; retryAfter: string | null; body: Record<string, unknown>; ms: number }> {
  const body = JSON.stringify(s);
  const t0 = performance.now();
  const res = await fetch(`${r.base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
  const ms = performance.now() - t0;
  return { status: res.status, retryAfter: res.headers.get("retry-after"), body: (await res.json()) as Record<string, unknown>, ms };
}
const health = async (r: Rig): Promise<Record<string, any>> => (await fetch(`${r.base}/v1/health`)).json() as Promise<Record<string, any>>;
async function ready(r: Rig): Promise<void> {
  for (let i = 0; i < 500 && r.validator.stats().state !== "ready"; i++) await sleep(10);
  expect(r.validator.stats().state).toBe("ready");
}
const matchUrl = (r: Rig) => `${r.base}/v1/ghosts/match?rules=${RULES_VERSION}&day=3&wins=0&lives=3&player=probe-player&seen=&runs=5`;
const stored = async (r: Rig, s: GhostSnapshot): Promise<boolean> => (await r.app.store.bucket(RULES_VERSION, s.day)).some((e) => e.id === ghostId(s));

describe("S2: while a slow check runs, the request thread is free", () => {
  it("/v1/health, /v1/ghosts/match and the page answer in under 100 ms during a 1.2 s check, which then completes with its 201", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bb-s2-page-"));
    writeFileSync(join(dir, "index.html"), "<!doctype html><title>BeltBattles</title>");
    try {
      const r = await rig({ workerData: { all: { sleepMs: 1200 } } }, dir);
      await ready(r);
      const upload = post(r, dusk(5));
      await sleep(150); // the check is running in the worker now
      expect(r.validator.stats()).toMatchObject({ running: 1, queued: 0 });
      const waits: number[] = [];
      for (let i = 0; i < 4; i++) {
        for (const url of [`${r.base}/v1/health`, matchUrl(r), `${r.base}/`]) {
          const t0 = performance.now();
          const res = await fetch(url);
          await res.text();
          waits.push(performance.now() - t0);
          expect([200, 404]).toContain(res.status); // match: 404 (no ghost for this day yet) is an answer too
        }
      }
      expect(Math.max(...waits)).toBeLessThan(100);
      const up = await upload;
      expect([up.status, up.body]).toEqual([201, { id: ghostId(dusk(5)) }]);
      expect(up.ms).toBeGreaterThan(1100); // it really waited for the check
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("S2: the queue is bounded", () => {
  it("the 18th concurrent upload gets 503 + Retry-After 5 and a one-line error; nothing of it is stored; the other 17 are checked and stored; the queue drains", async () => {
    const r = await rig({ workerData: { firstJobSleepMs: 900 } }); // the first check to start holds the worker for 900 ms, the rest are instant
    await ready(r);
    const ups = Array.from({ length: 18 }, (_, i) => dusk(1 + (i % 10), i)); // 18 distinct honest uploads
    const all = Promise.all(ups.map((u) => post(r, u)));
    for (let i = 0; i < 400 && r.validator.stats().queueFull < 1; i++) await sleep(5); // the 18th has reached the validator: all 18 have
    const h = await health(r);
    expect(h.validator).toMatchObject({ kind: "worker", state: "ready", queueDepth: 16, running: 1, queueMax: 16, queueFull: 1 });
    const res = await all;
    const refused = res.map((x, i) => ({ x, i })).filter(({ x }) => x.status === 503);
    expect(refused).toHaveLength(1);
    const { x: r503, i: refusedAt } = refused[0];
    expect(r503.retryAfter).toBe("5");
    expect(r503.body).toEqual({ error: "deck check queue is full (16 waiting), try again shortly" });
    expect(await stored(r, ups[refusedAt])).toBe(false); // nothing of the refused upload is stored
    const ok = res.filter((_, i) => i !== refusedAt);
    expect(ok.every((x) => x.status === 201)).toBe(true);
    for (const [i, u] of ups.entries()) expect(await stored(r, u)).toBe(i !== refusedAt);
    expect(r.backend.storedRecords()).toBe(17);
    const after = await health(r);
    expect(after.validator).toMatchObject({ queueDepth: 0, running: 0, queueFull: 1, checks: 17, timeouts: 0, restarts: 0 });
    // the queue drained: the refused upload, sent again, is checked and stored
    const again = await post(r, ups[refusedAt]);
    expect(again.status).toBe(201);
    expect(await stored(r, ups[refusedAt])).toBe(true);
  }, 60_000);

  it("cheap refusals stay cheap and first: a bad signature is 401 even with the queue full", async () => {
    const r = await rig({ workerData: { all: { sleepMs: 600 } }, maxQueued: 1 });
    await ready(r);
    const busy = [post(r, dusk(1, 90)), post(r, dusk(2, 91))]; // 1 running + 1 waiting: full
    for (let i = 0; i < 200 && r.validator.stats().queued < 1; i++) await sleep(5);
    const body = JSON.stringify(dusk(3, 92));
    const badSig = await fetch(`${r.base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body + " "), body });
    expect(badSig.status).toBe(401);
    const third = await post(r, dusk(4, 93));
    expect([third.status, third.retryAfter]).toEqual([503, "5"]);
    expect((await Promise.all(busy)).map((x) => x.status)).toEqual([201, 201]);
  }, 30_000);
});

describe("S2: the 10 s deadline (a small one here)", () => {
  it("an upload whose check passes the deadline gets 503 + Retry-After 30, nothing stored; the worker is replaced; the next upload is checked normally", async () => {
    const r = await rig({ timeoutMs: 400, workerData: { byDay: { 4: { crash: "spin" } } } }); // day 4's check never returns
    await ready(r);
    const first = await post(r, dusk(2)); // a normal check, before
    expect(first.status).toBe(201);
    const stuck = dusk(4);
    const t0 = performance.now();
    const res = await post(r, stuck);
    const ms = performance.now() - t0;
    expect([res.status, res.retryAfter]).toEqual([503, "30"]);
    expect(res.body).toEqual({ error: "deck check timed out after 0.4 s, try again later" });
    expect(ms).toBeGreaterThan(350);
    expect(ms).toBeLessThan(3000);
    expect(await stored(r, stuck)).toBe(false);
    expect(r.validator.stats()).toMatchObject({ timeouts: 1, restarts: 1 });
    const next = await post(r, dusk(6)); // joins while the replacement warms, then is checked on it
    expect([next.status, next.body]).toEqual([201, { id: ghostId(dusk(6)) }]);
    const h = await health(r);
    expect(h.validator).toMatchObject({ state: "ready", queueDepth: 0, running: 0, checks: 2, timeouts: 1, restarts: 1 });
  }, 60_000);

  it("an upload that waits behind a stuck check goes on to the fresh worker and is stored", async () => {
    const r = await rig({ timeoutMs: 600, workerData: { byDay: { 3: { crash: "spin" } } } });
    await ready(r);
    const stuck = post(r, dusk(3));
    await sleep(400);
    const behind = dusk(7);
    const b = await post(r, behind); // joined at 400 ms: its deadline (1,000 ms) is after the stuck check's (600 ms), when the worker is replaced
    expect((await stuck).status).toBe(503);
    expect([b.status, b.body]).toEqual([201, { id: ghostId(behind) }]);
    expect(r.validator.stats()).toMatchObject({ timeouts: 1, restarts: 1 });
  }, 30_000);

  it("an upload still waiting at its own deadline (the replacement is slow to warm) is dropped with 503, never reaches a worker, and is not stored", async () => {
    const r = await rig({ timeoutMs: 500, workerData: { readyDelayMs: 700, byDay: { 3: { crash: "spin" } } } }); // every worker takes 700 ms to be ready
    await ready(r);
    const stuck = post(r, dusk(3));
    await sleep(100);
    const waiting = dusk(7);
    const w = await post(r, waiting); // joined at 100 ms, deadline 600 ms: the stuck check is stopped at 500 ms and the replacement is not ready until 1,200 ms
    expect((await stuck).status).toBe(503);
    expect([w.status, w.retryAfter]).toEqual([503, "30"]);
    expect(await stored(r, waiting)).toBe(false);
    expect(r.validator.stats()).toMatchObject({ timeouts: 2, restarts: 1, running: 0, queued: 0 });
    await ready(r);
    expect((await post(r, dusk(8))).status).toBe(201); // and the replacement then checks normally
  }, 30_000);
});

describe("S2: a worker that dies is replaced", () => {
  it.each([["exit"], ["throw"]] as const)("a worker that %s mid-check: that upload gets 503 + Retry-After 10, nothing stored; a new worker takes the next one; /v1/health shows the restart", async (crash) => {
    const r = await rig({ workerData: { byDay: { 6: { crash } } } });
    await ready(r);
    expect((await post(r, dusk(2))).status).toBe(201);
    const dying = dusk(6);
    const res = await post(r, dying);
    expect([res.status, res.retryAfter]).toEqual([503, "10"]);
    expect(res.body).toEqual({ error: "deck check worker restarted, try again shortly" });
    expect(await stored(r, dying)).toBe(false);
    const next = await post(r, dusk(8));
    expect(next.status).toBe(201);
    const h = await health(r);
    expect(h.validator).toMatchObject({ kind: "worker", state: "ready", restarts: 1, timeouts: 0, checks: 2, queueDepth: 0, running: 0 });
  }, 60_000);

  it("a check that throws is the usual 500 'internal error', as an in-thread throw always was; the worker lives on", async () => {
    const r = await rig({ workerData: { byDay: { 9: { fail: "boom" } } } });
    await ready(r);
    const res = await post(r, dusk(9));
    expect([res.status, res.body]).toEqual([500, { error: "internal error" }]);
    expect((await post(r, dusk(2))).status).toBe(201);
    expect(r.validator.stats()).toMatchObject({ restarts: 0, errors: 1 });
  }, 30_000);

  it("a refusal by the deck check is the same 422 as in-thread, from the worker's verdict", async () => {
    const r = await rig({ workerData: { byDay: { 5: { verdict: "bad" } } } });
    await ready(r);
    const res = await post(r, dusk(5));
    expect([res.status, res.body]).toEqual([422, { error: "deck failed validation", errors: ["fake: refused"] }]);
    expect(await stored(r, dusk(5))).toBe(false);
  }, 30_000);
});

describe("S2: /v1/health", () => {
  it("keeps its six old fields and adds the validator and memory blocks, read without waiting on the worker", async () => {
    const r = await rig({ workerData: { readyDelayMs: 800, all: { sleepMs: 50 } } });
    // while the worker is still warming: the answer comes at once, the state says so
    const t0 = performance.now();
    const warming = await health(r);
    expect(performance.now() - t0).toBeLessThan(100);
    expect(warming.validator).toMatchObject({ kind: "worker", state: "warming", queueDepth: 0, running: 0, queueMax: 16, timeoutMs: 10_000, checks: 0, queueFull: 0, timeouts: 0, restarts: 0 });
    expect(warming.memory.workerHeapLimitMb).toBeNull(); // not known until the worker says ready
    await ready(r);
    const h = await health(r);
    expect(Object.keys(h).slice(0, 6)).toEqual(["ok", "rules", "store", "ghosts", "uploads", "uptimeS"]); // the old fields, first, in their old order
    expect(h).toMatchObject({ ok: true, rules: RULES_VERSION, store: "jsonl", ghosts: 0, uploads: "open" });
    expect(h.uptimeS).toBeGreaterThanOrEqual(0);
    expect(Object.keys(h.validator).sort()).toEqual(["checks", "errors", "kind", "queueDepth", "queueFull", "queueMax", "restarts", "running", "state", "timeoutMs", "timeouts", "warmMs"]);
    expect(h.validator).toMatchObject({ kind: "worker", state: "ready", warmMs: 800 });
    expect(Object.keys(h.memory).sort()).toEqual(["heapLimitMb", "heapUsedMb", "rssMb", "workerHeapLimitMb"]);
    expect(h.memory.rssMb).toBeGreaterThan(20);
    expect(h.memory.heapUsedMb).toBeGreaterThan(0);
    expect(h.memory.heapLimitMb).toBeGreaterThan(h.memory.heapUsedMb);
    expect(h.memory.workerHeapLimitMb).toBe(1); // what the (fake) worker reported from inside
  }, 30_000);

  it("an app made without a validator (the in-process default) is in-thread, and its answer has the same shape", async () => {
    const backend = jsonlBackend();
    await backend.setup();
    const app = backend.server({ uploads: "open", log: () => {} });
    const base = `http://127.0.0.1:${await app.listen(0)}`;
    try {
      const h = (await (await fetch(`${base}/v1/health`)).json()) as Record<string, any>;
      expect(h).toMatchObject({ ok: true, rules: RULES_VERSION, store: "jsonl", uploads: "open", validator: { kind: "in-thread", state: "in-thread", queueDepth: 0, running: 0, checks: 0 } });
      expect(h.memory.workerHeapLimitMb).toBeNull();
      expect(app.validator.kind).toBe("in-thread");
    } finally {
      await app.close();
      await backend.teardown();
    }
  });
});
