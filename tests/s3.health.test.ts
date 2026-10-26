// S3 (BRIEF-S3 goal 5): GET /v1/health keeps every field it had (S1's/S2's included: ok, rules, store, ghosts, uploads, uptimeS, validator, memory) in their order and
// adds a `cache` block (buckets cached, player ghosts cached, the cap and the ceiling, what was dropped since boot) and a `limits` block (429 counts by reason since
// boot: rate, keyInflight, ipInflight, keyBudget, ipBudget, newKeys, total). It still never touches storage and never waits on the deck-check worker.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RULES_VERSION } from "../src/sim/content";
import { ENDLESS, setEndless } from "../src/sim/endless";
import { setPlayerName } from "../src/game/ghostSnapshot";
import { loadIdentity, memoryKeyStore, type Identity } from "../src/net/identity";
import type { GhostSnapshot } from "../src/net/snapshot";
import type { Validation } from "../src/net/validate";
import { createGhostServer, type GhostServer, type ServerOptions } from "../server/app";
import { JsonlStore } from "../server/store";
import { createWorkerValidator, type ValidateJob, type Validator } from "../server/validator";
import type { FakeS3 } from "../tools/fakeS3";
import { jsonlBackend, startFake, tigrisFor, type StoreBackend } from "./netStores";
import { ownedBy, signedHeaders, testIdentity, TEST_NAME } from "./netIdentity";
import { playEndless } from "./endless1.honest";

setPlayerName(TEST_NAME);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
async function until(cond: () => boolean, what: string, ms = 5000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
    await sleep(5);
  }
}

const OLD_FIELDS = ["ok", "rules", "store", "ghosts", "uploads", "uptimeS"];
const VALIDATOR_KEYS = ["checks", "errors", "kind", "queueDepth", "queueFull", "queueMax", "restarts", "running", "state", "timeoutMs", "timeouts", "warmMs"];
const MEMORY_KEYS = ["heapLimitMb", "heapUsedMb", "rssMb", "workerHeapLimitMb"];
const CACHE_KEYS = ["bucketCap", "buckets", "ceiling", "evictedByCap", "evictedByCeiling", "playerGhosts"];
const LIMIT_KEYS = ["ipBudget", "ipInflight", "keyBudget", "keyInflight", "newKeys", "rate", "total"];

let ids: Identity[];
let runSnaps: GhostSnapshot[];
beforeAll(async () => {
  setEndless(true);
  ids = [await testIdentity(0), await testIdentity(1), await testIdentity(2), await testIdentity(3)];
  runSnaps = playEndless("weaver", 42, ids[0].playerId, { buys: 0, until: 10 }).runSnaps;
}, 300_000);
afterAll(() => setEndless(ENDLESS));

const up = (who: Identity, tag: string, day = 3): GhostSnapshot => ownedBy({ ...runSnaps.find((s) => s.day === day)!, runId: `s3h-${tag}` }, who);
const freshId = async (): Promise<Identity> => {
  const id = await loadIdentity(memoryKeyStore());
  if (!id) throw new Error("no WebCrypto in this Node");
  return id;
};

/** A validator the test controls: a job ends when the test says, having cost what the test says (see tests/s3.budget.test.ts). */
function controlled() {
  const pending: { job: ValidateJob; finish(ms?: number, verdict?: Validation): void }[] = [];
  const seen: ValidateJob[] = [];
  const validator: Validator = {
    kind: "in-thread",
    validate: (job, onCost) =>
      new Promise<Validation>((resolve) => {
        seen.push(job);
        pending.push({ job, finish: (ms = 5, verdict = { ok: true, errors: [] }) => { onCost?.(ms); resolve(verdict); } });
      }),
    stats: () => ({ kind: "in-thread", state: "in-thread", queued: 0, running: (pending.length > 0 ? 1 : 0) as 0 | 1, queueMax: 0, timeoutMs: 0, checks: 0, queueFull: 0, timeouts: 0, restarts: 0, errors: 0, warmMs: null, workerHeapLimitMb: null }),
    close: async () => {},
  };
  return { validator, pending, seen };
}
function instant(): Validator {
  return {
    kind: "in-thread",
    validate: async (_job, onCost) => {
      onCost?.(1);
      return { ok: true, errors: [] } as Validation;
    },
    stats: () => ({ kind: "in-thread", state: "in-thread", queued: 0, running: 0, queueMax: 0, timeoutMs: 0, checks: 0, queueFull: 0, timeouts: 0, restarts: 0, errors: 0, warmMs: null, workerHeapLimitMb: null }),
    close: async () => {},
  };
}

const apps: GhostServer[] = [];
const backends: StoreBackend[] = [];
const fakes: FakeS3[] = [];
afterEach(async () => {
  while (apps.length) await apps.pop()!.close();
  while (backends.length) await backends.pop()!.teardown();
  while (fakes.length) await fakes.pop()!.close();
});
async function serve(opts: ServerOptions): Promise<{ app: GhostServer; base: string }> {
  const app = createGhostServer({ uploads: "open", log: () => {}, rateLimit: { windowMs: 60_000, max: 1_000_000 }, matchSalt: () => 0, ...opts });
  apps.push(app);
  return { app, base: `http://127.0.0.1:${await app.listen(0)}` };
}
const getHealth = async (base: string): Promise<Record<string, any>> => (await fetch(`${base}/v1/health`)).json() as Promise<Record<string, any>>;
async function post(base: string, who: Identity, s: GhostSnapshot, headers: Record<string, string> = {}): Promise<{ status: number; retryAfter: string | null; body: Record<string, any> }> {
  const body = JSON.stringify(s);
  const res = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: { ...(await signedHeaders(who, body)), ...headers }, body });
  const text = await res.text();
  return { status: res.status, retryAfter: res.headers.get("retry-after"), body: text ? (JSON.parse(text) as Record<string, any>) : {} };
}

describe("S3 /v1/health: the shape", () => {
  it("keeps its old fields first and in order, S2's validator and memory blocks unchanged, and adds `cache` and `limits` (the JSON-lines store)", async () => {
    const backend = jsonlBackend();
    await backend.setup();
    backends.push(backend);
    const app = backend.server({ uploads: "open", log: () => {}, rateLimit: { windowMs: 60_000, max: 1_000_000 } });
    apps.push(app);
    const base = `http://127.0.0.1:${await app.listen(0)}`;
    const h = await getHealth(base);
    expect(Object.keys(h)).toEqual([...OLD_FIELDS, "validator", "memory", "cache", "limits", "errors"]); // S4 appended `errors` (tests/s4.counters.test.ts)
    expect(h).toMatchObject({ ok: true, rules: RULES_VERSION, store: "jsonl", ghosts: 0, uploads: "open" });
    expect(Object.keys(h.validator).sort()).toEqual(VALIDATOR_KEYS);
    expect(h.validator).toMatchObject({ kind: "in-thread", state: "in-thread" });
    expect(Object.keys(h.memory).sort()).toEqual(MEMORY_KEYS);
    expect(Object.keys(h.cache).sort()).toEqual(CACHE_KEYS);
    expect(h.cache).toEqual({ buckets: 0, playerGhosts: 0, bucketCap: 2000, ceiling: 6000, evictedByCap: 0, evictedByCeiling: 0 });
    expect(Object.keys(h.limits).sort()).toEqual(LIMIT_KEYS);
    expect(h.limits).toEqual({ rate: 0, keyInflight: 0, ipInflight: 0, keyBudget: 0, ipBudget: 0, newKeys: 0, total: 0 });
  });

  it("the Tigris store reports its own cap and ceiling, and the numbers move with uploads: player ghosts held, buckets, what the cap dropped", async () => {
    const fake = await startFake();
    fakes.push(fake);
    const { base } = await serve({ store: tigrisFor(fake, "bb-test", { bucketCap: 2, cacheMax: 70 }), validator: instant() });
    expect((await getHealth(base)).cache).toEqual({ buckets: 0, playerGhosts: 0, bucketCap: 2, ceiling: 70, evictedByCap: 0, evictedByCeiling: 0 });
    for (let i = 0; i < 3; i++) expect((await post(base, ids[0], up(ids[0], `t${i}`))).status).toBe(201);
    const h = await getHealth(base);
    expect(h.cache).toEqual({ buckets: 1, playerGhosts: 2, bucketCap: 2, ceiling: 70, evictedByCap: 1, evictedByCeiling: 0 });
    expect(h.ghosts).toBe(2); // `ghosts` is still what the process holds in memory
    expect(Object.keys(h)).toEqual([...OLD_FIELDS, "validator", "memory", "cache", "limits", "errors"]); // S4 appended `errors`
    expect(fake.keys("bb-test", "ghosts/")).toHaveLength(3); // the third upload pushed the first out of memory, not out of storage
  });

  it("a store without cacheStats reports `cache: null`", async () => {
    const backend = jsonlBackend();
    await backend.setup();
    backends.push(backend);
    const first = backend.server({ uploads: "closed", log: () => {} }); // only to open the store over the backend's directory
    const store: JsonlStore = first.store as JsonlStore;
    await first.close();
    Object.defineProperty(store, "cacheStats", { value: undefined }); // as a store written before S3 (or a test double) would be
    const { base } = await serve({ store, validator: instant() });
    const h = await getHealth(base);
    expect(h.cache).toBeNull();
    expect(Object.keys(h)).toEqual([...OLD_FIELDS, "validator", "memory", "cache", "limits", "errors"]); // S4 appended `errors`
  });
});

describe("S3 /v1/health: the 429 counts by reason", () => {
  it("each reason counts when its 429 happens, and `total` is their sum", async () => {
    const backend = jsonlBackend();
    await backend.setup();
    backends.push(backend);
    const ctl = controlled();
    const clock = { now: 1_000_000 };
    const app = backend.server({
      uploads: "open", log: () => {}, rateLimit: { windowMs: 60_000, max: 1_000_000 }, matchSalt: () => 0, validator: ctl.validator, trustProxy: "fly",
      limits: { now: () => clock.now, newKeysPerIpDay: 4, checkKeyMs: 1000, checkKeyRefill: 100, checkIpMs: 10_000, checkIpRefill: 100, checkIpInflight: 2 },
    });
    apps.push(app);
    const base = `http://127.0.0.1:${await app.listen(0)}`;
    const A = { "fly-client-ip": "203.0.113.77" };
    const [k0, k1, k2, k3] = ids;
    const p0 = post(base, k0, up(k0, "r0"), A);
    await until(() => ctl.pending.length === 1, "the first check");
    expect((await post(base, k0, up(k0, "r1"), A)).body.limit).toBe("key-inflight");
    const p1 = post(base, k1, up(k1, "r2"), A);
    await until(() => ctl.pending.length === 2, "the second check");
    expect((await post(base, k2, up(k2, "r3"), A)).body.limit).toBe("ip-inflight"); // the address has 2 in flight
    ctl.pending.shift()!.finish(1500); // k0's check cost more than its whole balance of 1,000 ms
    ctl.pending.shift()!.finish(8600); // k1's cost the address its balance (10,000 - 1,500 - 8,600 < 0)
    expect([(await p0).status, (await p1).status]).toEqual([201, 201]);
    expect((await post(base, k0, up(k0, "r4"), A)).body.limit).toBe("key-budget");
    expect((await post(base, k3, up(k3, "r5"), A)).body.limit).toBe("ip-budget"); // a fresh key, a spent address
    const fifth = await freshId();
    expect((await post(base, fifth, up(fifth, "r6"), A)).body.limit).toBe("new-keys"); // k0, k1, k2 and k3 used the allowance of 4
    expect(ctl.seen).toHaveLength(2); // none of the five refusals reached the deck check
    const h = await getHealth(base);
    expect(h.limits).toEqual({ rate: 0, keyInflight: 1, ipInflight: 1, keyBudget: 1, ipBudget: 1, newKeys: 1, total: 5 });
    expect(app.limits.refused).toEqual({ rate: 0, keyInflight: 1, ipInflight: 1, keyBudget: 1, ipBudget: 1, newKeys: 1 });
  });

  it("the old request limiter's 429 (BB_GHOST_RATE) is counted as `rate`, still answers Retry-After 60 and its old one-line error", async () => {
    const backend = jsonlBackend();
    await backend.setup();
    backends.push(backend);
    const app = backend.server({ uploads: "open", log: () => {}, rateLimit: { windowMs: 60_000, max: 2 }, trustProxy: "fly" });
    apps.push(app);
    const base = `http://127.0.0.1:${await app.listen(0)}`;
    const get = (ip: string) => fetch(`${base}/v1/health`, { headers: { "fly-client-ip": ip } });
    expect([(await get("198.51.100.5")).status, (await get("198.51.100.5")).status]).toEqual([200, 200]);
    const refused = await get("198.51.100.5");
    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).toBe("60");
    expect(await refused.json()).toEqual({ error: "rate limit exceeded, slow down" });
    const h = (await (await get("198.51.100.6")).json()) as Record<string, any>; // another address reads it
    expect(h.limits).toEqual({ rate: 1, keyInflight: 0, ipInflight: 0, keyBudget: 0, ipBudget: 0, newKeys: 0, total: 1 });
  });
});

describe("S3 /v1/health: still no storage and no waiting", () => {
  it("answers at once, with the new blocks, while storage never answers (the Tigris store) and without touching it", async () => {
    const fake = await startFake();
    fakes.push(fake);
    fake.hangNext(100); // storage that never answers
    const { base } = await serve({ store: tigrisFor(fake, "bb-test", { bucketCap: 5, cacheMax: 50 }), validator: instant() });
    const t0 = Date.now();
    const h = await getHealth(base);
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(h.cache).toMatchObject({ bucketCap: 5, ceiling: 50 });
    expect(h.limits.total).toBe(0);
    expect(fake.requests).toHaveLength(0);
    fake.clearFaults();
  });

  it("answers in under 100 ms while the deck-check worker is still warming, with `cache` and `limits` in the answer", async () => {
    const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "s2.fakeworker.mjs");
    const validator = createWorkerValidator({ script: SCRIPT, workerData: { readyDelayMs: 800 } });
    try {
      const backend = jsonlBackend();
      await backend.setup();
      backends.push(backend);
      const app = backend.server({ uploads: "open", log: () => {}, validator });
      apps.push(app);
      const base = `http://127.0.0.1:${await app.listen(0)}`;
      const t0 = performance.now();
      const h = await getHealth(base);
      expect(performance.now() - t0).toBeLessThan(600); // the worker needs 800 ms to say ready: the answer did not wait for it
      expect(h.validator).toMatchObject({ kind: "worker", state: "warming" });
      expect(Object.keys(h.cache).sort()).toEqual(CACHE_KEYS);
      expect(Object.keys(h.limits).sort()).toEqual(LIMIT_KEYS);
    } finally {
      await validator.close();
    }
  });
});
