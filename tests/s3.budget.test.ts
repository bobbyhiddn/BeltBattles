// S3 (BRIEF-S3 goal 2; LAUNCH-0 REPORT 1.4 item 4, 1.8; S2-REPORT section 9): THE DECK CHECK HAS A BUDGET. server/budget.ts sits in front of
// validator.validate (server/app.ts), after every cheap refusal and before the queue:
//   - at most 1 deck check in flight per key, and `checkIpInflight` (default 4) per client address: a second one is a 429 with Retry-After 2;
//   - a token bucket of CHECK MILLISECONDS per key and per address: the verdict's own running time is charged when it comes back (the validator
//     reports it through a CostReporter: the worker times validateUpload with performance.now()), the balance may go below zero, a balance at or
//     below zero is a 429 whose Retry-After is the seconds until it is positive again.
// A refusal is one line of JSON naming the limit, stores nothing, and never reaches the validator (so never the queue).
// Here: CheckBudget on its own with a clock the test moves; the same rules through createGhostServer with a validator the test controls (a job
// finishes when the test says, having cost what the test says); and the cost reporting of validator.ts on S2's test worker (tests/s2.fakeworker.mjs).
// The honest snapshots are played through the game's own code (tests/endless1.honest.ts), a lean deck. Nothing here builds the stand-in sample pool.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RULES_VERSION } from "../src/sim/content";
import { ENDLESS, setEndless } from "../src/sim/endless";
import { setPlayerName } from "../src/game/ghostSnapshot";
import { ghostId, type GhostSnapshot } from "../src/net/snapshot";
import type { Identity } from "../src/net/identity";
import type { Validation } from "../src/net/validate";
import { createGhostServer, type GhostServer, type ServerOptions } from "../server/app";
import { CheckBudget, INFLIGHT_RETRY_S, isRefusal, type BudgetConfig, type Refusal, type Ticket } from "../server/budget";
import { createInThreadValidator, createWorkerValidator, type ValidateJob, type Validator, type WorkerValidatorOptions } from "../server/validator";
import { jsonlBackend, type StoreBackend } from "./netStores";
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

// ------------------------------------------------------------------------------------------------ CheckBudget on its own

describe("S3 budget.ts: CheckBudget", () => {
  let t = 0;
  const clock = () => t;
  const CFG: BudgetConfig = { keyMs: 1000, keyRefill: 100, ipMs: 5000, ipRefill: 500, ipInflight: 2 };
  const mk = (over: Partial<BudgetConfig> = {}) => new CheckBudget({ ...CFG, ...over }, clock);
  const ticket = (x: Ticket | Refusal): Ticket => {
    if (isRefusal(x)) throw new Error(`refused: ${x.limit} (${x.message})`);
    return x;
  };
  const refusal = (x: Ticket | Refusal): Refusal => {
    if (!isRefusal(x)) throw new Error("admitted, expected a refusal");
    return x;
  };
  /** One whole check: admit, charge `ms`, release. */
  const check = (b: CheckBudget, ip: string, key: string, ms: number): Ticket | Refusal => {
    const x = b.admit(ip, key);
    if (!isRefusal(x)) {
      x.charge(ms);
      x.release();
    }
    return x;
  };

  it("at most 1 deck check in flight per key: the second is refused (key-inflight, Retry-After 2), another key is not, and a release frees the place", () => {
    t = 0;
    const b = mk();
    const first = ticket(b.admit("ip", "k1"));
    const second = refusal(b.admit("ip", "k1"));
    expect(second.limit).toBe("key-inflight");
    expect(second.retryAfterS).toBe(INFLIGHT_RETRY_S);
    expect(INFLIGHT_RETRY_S).toBe(2);
    expect(second.message).toMatch(/key already has a deck check in flight/);
    ticket(b.admit("ip", "k2")); // another key of the same address
    first.release();
    first.release(); // idempotent: a second release frees nothing more
    const again = ticket(b.admit("ip", "k1"));
    expect(refusal(b.admit("ip", "k1")).limit).toBe("key-inflight"); // still one in flight for k1, not two places
    again.release();
    expect(b.tracked.inflightKeys).toBe(1); // k2 is still in flight
  });

  it("the in-flight cap per key can be raised, and it counts waiting AND running (a place is held until release)", () => {
    const b = mk({ keyInflight: 2, ipInflight: 10 });
    const a = ticket(b.admit("ip", "k"));
    const c = ticket(b.admit("ip", "k"));
    expect(refusal(b.admit("ip", "k")).limit).toBe("key-inflight");
    a.release();
    ticket(b.admit("ip", "k"));
    c.release();
  });

  it("at most `ipInflight` checks in flight per client address (ip-inflight, Retry-After 2); another address is unaffected", () => {
    const b = mk();
    const a = ticket(b.admit("ipA", "k1"));
    ticket(b.admit("ipA", "k2"));
    const r = refusal(b.admit("ipA", "k3"));
    expect(r.limit).toBe("ip-inflight");
    expect(r.retryAfterS).toBe(2);
    expect(r.message).toMatch(/this address already has 2 deck checks in flight/);
    ticket(b.admit("ipB", "k3")).release(); // another address has its own places
    a.release();
    ticket(b.admit("ipA", "k3")); // a place freed
  });

  it("a key at or below zero is refused with Retry-After = the whole seconds until its balance is positive; a positive balance is admitted", () => {
    t = 0;
    const b = mk(); // key: 1000 ms, refilled 100 ms a second
    ticket(b.admit("ip", "k")).charge(1000); // exactly spent: the balance is exactly 0
    const x = b.admit("ip", "k"); // (still in flight: release first)
    expect(refusal(x).limit).toBe("key-inflight");
    const bb = mk();
    expect(check(bb, "ip", "k", 1000)).not.toHaveProperty("limit");
    const at0 = refusal(bb.admit("ip", "k"));
    expect([at0.limit, at0.retryAfterS]).toEqual(["key-budget", 1]); // exactly 0 is refused; the next whole second makes it positive
    expect(at0.message).toBe("deck check limit: this key has used its check time, try again in 1 s");
    t += 1; // 1 ms: +0.1 ms
    ticket(bb.admit("ip", "k")); // positive: admitted (the Retry-After is a ceiling in whole seconds, not a wait the balance needs)
  });

  it("the debt: balance -250 refuses with Retry-After 3, and the refill brings it positive exactly when the arithmetic says", () => {
    t = 10_000;
    const b = mk();
    expect(isRefusal(check(b, "ip", "k", 1250))).toBe(false); // 1000 - 1250 = -250
    const r = refusal(b.admit("ip", "k"));
    expect([r.limit, r.retryAfterS]).toEqual(["key-budget", 3]); // floor(250 / 100) + 1
    t += 2400; // -250 + 240 = -10
    expect(refusal(b.admit("ip", "k")).retryAfterS).toBe(1);
    t += 100; // -10 + 10 = exactly 0: still refused
    expect(refusal(b.admit("ip", "k")).limit).toBe("key-budget");
    t += 1; // +0.1: positive
    ticket(b.admit("ip", "k"));
  });

  it("the debt is floored at one capacity, and no Retry-After is over an hour", () => {
    t = 0;
    const b = mk();
    check(b, "ip", "k", 1_000_000); // a check that cost 1,000 s: the balance is -1000, not -999000
    const r = refusal(b.admit("ip", "k"));
    expect(r.retryAfterS).toBe(11); // floor(1000 / 100) + 1: 2 x capacity / refill at most
    t += 11_000;
    ticket(b.admit("ip", "k")); // 11 s later it is back above zero
    const slow = mk({ keyMs: 100_000, keyRefill: 1 });
    check(slow, "ip", "s", 1e9);
    expect(refusal(slow.admit("ip", "s")).retryAfterS).toBe(3600);
  });

  it("the balance refills but never above its capacity", () => {
    t = 0;
    const b = mk();
    check(b, "ip", "k", 500);
    t += 10_000_000; // a very long time: the refill is capped at 1000, not 1,000,000
    check(b, "ip", "k", 1500); // 1000 - 1500 = -500 only if the balance was capped at its capacity
    expect(refusal(b.admit("ip", "k")).limit).toBe("key-budget");
  });

  it("garbage costs are ignored: NaN, Infinity and negative numbers charge nothing", () => {
    t = 0;
    const b = mk();
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -5, 0]) expect(isRefusal(check(b, "ip", "k", bad))).toBe(false);
    ticket(b.admit("ip", "k")).release(); // still a full balance
  });

  it("the address has its own budget; the key's is checked first; another address is unaffected; the refill pays the debt", () => {
    t = 0;
    const b = mk({ keyMs: 100_000, keyRefill: 1000, ipMs: 5000, ipRefill: 500, ipInflight: 10 });
    check(b, "ipA", "k1", 3000);
    check(b, "ipA", "k2", 3000); // the address: 5000 - 6000 = -1000
    const r = refusal(b.admit("ipA", "k3")); // a fresh key from a spent address
    expect([r.limit, r.retryAfterS]).toEqual(["ip-budget", 3]); // floor(1000 / 500) + 1
    expect(r.message).toBe("deck check limit: this address has used its check time, try again in 3 s");
    ticket(b.admit("ipB", "k3")).release(); // another address
    t += 2000; // -1000 + 1000 = 0: still refused
    expect(refusal(b.admit("ipA", "k3")).limit).toBe("ip-budget");
    t += 1000; // 500
    ticket(b.admit("ipA", "k3"));
    // a key over its own budget is reported as the key's, even when the address is over too
    const both = mk({ keyMs: 100, keyRefill: 10, ipMs: 100, ipRefill: 10, ipInflight: 10 });
    check(both, "ip", "k", 500);
    expect(refusal(both.admit("ip", "k")).limit).toBe("key-budget");
    expect(refusal(both.admit("ip", "other")).limit).toBe("ip-budget");
  });

  it("is bounded: a flood of distinct keys and addresses never holds more than mapMax of each, and nothing stays in flight", () => {
    t = 0;
    const b = mk({ mapMax: 50, ipInflight: 1000 });
    for (let i = 0; i < 2000; i++) check(b, `ip-${i}`, `key-${i}`, 10);
    for (let i = 0; i < 2000; i++) check(b, `ip-${i % 7}`, `key-x-${i}`, 10);
    const n = b.tracked;
    expect(n.keys).toBeLessThanOrEqual(50);
    expect(n.ips).toBeLessThanOrEqual(50);
    expect(n.evictions).toBeGreaterThan(3000);
    expect([n.inflightKeys, n.inflightIps]).toEqual([0, 0]);
    // an evicted key starts full again: the bound only ever makes the limit more lenient
    ticket(b.admit("ip-0", "key-0")).release();
  });
});

// ------------------------------------------------------------------------------------------------ through the server, with a validator the test controls

interface Pending {
  job: ValidateJob;
  /** The check ends having cost `ms` (reported through the CostReporter, as the worker's timing is), with `verdict` (default: the deck is fine). */
  finish(ms?: number, verdict?: Validation): void;
}
function controlled() {
  const pending: Pending[] = [];
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

let ids: Identity[];
let runSnaps: GhostSnapshot[];
beforeAll(async () => {
  setEndless(true);
  ids = [await testIdentity(0), await testIdentity(1), await testIdentity(2), await testIdentity(3)];
  runSnaps = playEndless("weaver", 42, ids[0].playerId, { buys: 0, until: 10 }).runSnaps;
}, 300_000);
afterAll(() => setEndless(ENDLESS));

/** A distinct honest upload of `identity` (the same dusk under another runId: the id hashes it). */
const up = (identity: Identity, tag: string, day = 3): GhostSnapshot => ownedBy({ ...runSnaps.find((s) => s.day === day)!, runId: `s3b-${tag}` }, identity);

interface Rig {
  app: GhostServer;
  base: string;
  backend: StoreBackend;
  ctl: ReturnType<typeof controlled>;
  clock: { now: number };
}
const rigs: Rig[] = [];
async function rig(limits: NonNullable<ServerOptions["limits"]> = {}, extra: Partial<ServerOptions> = {}): Promise<Rig> {
  const backend = jsonlBackend();
  await backend.setup();
  const ctl = controlled();
  const clock = { now: 1_000_000 };
  const app = backend.server({
    uploads: "open", log: () => {}, rateLimit: { windowMs: 60_000, max: 1_000_000 }, matchSalt: () => 0, validator: ctl.validator,
    limits: { now: () => clock.now, ...limits }, ...extra,
  });
  const r: Rig = { app, base: `http://127.0.0.1:${await app.listen(0)}`, backend, ctl, clock };
  rigs.push(r);
  return r;
}
afterEach(async () => {
  while (rigs.length) {
    const r = rigs.pop()!;
    for (const p of r.ctl.pending.splice(0)) p.finish(1); // nothing is left hanging
    await sleep(5);
    await r.app.close();
    await r.backend.teardown();
  }
});

interface Reply {
  status: number;
  retryAfter: string | null;
  text: string;
  body: Record<string, unknown>;
}
async function post(r: Rig, who: Identity, s: GhostSnapshot, headers: Record<string, string> = {}): Promise<Reply> {
  const body = JSON.stringify(s);
  const res = await fetch(`${r.base}/v1/ghosts`, { method: "POST", headers: { ...(await signedHeaders(who, body)), ...headers }, body });
  const text = await res.text();
  return { status: res.status, retryAfter: res.headers.get("retry-after"), text, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
}
const health = async (r: Rig): Promise<Record<string, any>> => (await fetch(`${r.base}/v1/health`)).json() as Promise<Record<string, any>>;
const stored = async (r: Rig, s: GhostSnapshot): Promise<boolean> => (await r.app.store.bucket(RULES_VERSION, s.day)).some((e) => e.id === ghostId(s));
const FLY = (ip: string) => ({ "fly-client-ip": ip });

describe("S3 through the server: the in-flight caps", () => {
  it("a second upload from a key while its first is in flight is a 429 (key-inflight, Retry-After 2, one line of JSON naming the limit); nothing is stored and the validator never sees it", async () => {
    const r = await rig();
    const first = up(ids[0], "f1"), second = up(ids[0], "f2"), third = up(ids[0], "f3");
    const p1 = post(r, ids[0], first);
    await until(() => r.ctl.pending.length === 1, "the first check to start");
    const refused = await post(r, ids[0], second);
    expect(refused.status).toBe(429);
    expect(refused.retryAfter).toBe("2");
    expect(refused.text).not.toContain("\n");
    expect(Object.keys(refused.body)).toEqual(["error", "limit"]);
    expect(refused.body.limit).toBe("key-inflight");
    expect(refused.body.error).toBe("deck check limit: this key already has a deck check in flight (1 at a time), try again shortly");
    expect(r.ctl.seen).toHaveLength(1); // it never reached the validator, so never the queue
    expect(await stored(r, second)).toBe(false);
    r.ctl.pending.shift()!.finish(5);
    const done = await p1;
    expect([done.status, done.body]).toEqual([201, { id: ghostId(first) }]);
    // the slot is free again
    const p3 = post(r, ids[0], third);
    await until(() => r.ctl.pending.length === 1, "the third check to start");
    r.ctl.pending.shift()!.finish(5);
    expect((await p3).status).toBe(201);
    expect(await stored(r, third)).toBe(true);
    expect((await health(r)).limits).toMatchObject({ keyInflight: 1, total: 1 });
  });

  it("one key flooding never stops another key's honest upload from being checked", async () => {
    const r = await rig();
    const flood = Array.from({ length: 6 }, (_, i) => up(ids[0], `fl${i}`));
    const p0 = post(r, ids[0], flood[0]);
    await until(() => r.ctl.pending.length === 1, "the flooder's first check");
    const refusals = await Promise.all(flood.slice(1).map((s) => post(r, ids[0], s)));
    expect(refusals.map((x) => x.status)).toEqual([429, 429, 429, 429, 429]);
    const honest = up(ids[1], "honest");
    const pH = post(r, ids[1], honest); // another key, the same address: its check starts at once
    await until(() => r.ctl.pending.length === 2, "the honest key's check");
    expect(r.ctl.seen.map((j) => j.day)).toHaveLength(2);
    r.ctl.pending.forEach((p) => p.finish(5));
    expect((await Promise.all([p0, pH])).map((x) => x.status)).toEqual([201, 201]);
    expect(await stored(r, honest)).toBe(true);
    expect((await health(r)).limits).toMatchObject({ keyInflight: 5, total: 5 });
  });

  it("at most `checkIpInflight` checks in flight per client address (ip-inflight, Retry-After 2); another address and a later release are unaffected", async () => {
    const r = await rig({ checkIpInflight: 2 }, { trustProxy: "fly" });
    const A = FLY("203.0.113.7"), B = FLY("203.0.113.8");
    const p0 = post(r, ids[0], up(ids[0], "i0"), A);
    await until(() => r.ctl.pending.length === 1, "check 1");
    const p1 = post(r, ids[1], up(ids[1], "i1"), A);
    await until(() => r.ctl.pending.length === 2, "check 2");
    const third = up(ids[2], "i2");
    const refused = await post(r, ids[2], third, A);
    expect([refused.status, refused.retryAfter, refused.body.limit]).toEqual([429, "2", "ip-inflight"]);
    expect(refused.body.error).toBe("deck check limit: this address already has 2 deck checks in flight, try again shortly");
    expect(await stored(r, third)).toBe(false);
    const pB = post(r, ids[3], up(ids[3], "i3"), B); // another address
    await until(() => r.ctl.pending.length === 3, "the other address's check");
    expect(r.ctl.seen).toHaveLength(3);
    r.ctl.pending.shift()!.finish(5); // address A frees a place
    expect((await p0).status).toBe(201);
    const again = post(r, ids[2], third, A);
    await until(() => r.ctl.pending.length === 3, "the retried check");
    r.ctl.pending.forEach((p) => p.finish(5));
    expect((await Promise.all([p1, pB, again])).map((x) => x.status)).toEqual([201, 201, 201]);
    expect((await health(r)).limits).toMatchObject({ ipInflight: 1, total: 1 });
  });

  it("cheap refusals come first: with the key in flight a bad signature is 401, a foreign player id 403 and a bad name 422, never a 429; none of them is counted", async () => {
    const r = await rig();
    const p0 = post(r, ids[0], up(ids[0], "c0"));
    await until(() => r.ctl.pending.length === 1, "the first check");
    const mine = up(ids[0], "c1");
    const bad = JSON.stringify(mine);
    const tampered = await fetch(`${r.base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(ids[0], bad + " "), body: bad });
    expect(tampered.status).toBe(401);
    const stranger = await post(r, ids[0], up(ids[1], "c2")); // signed by key 0, but the snapshot is player 1's
    expect(stranger.status).toBe(403);
    const named = await post(r, ids[0], { ...mine, name: "X" });
    expect(named.status).toBe(422);
    expect(String(named.body.error)).toMatch(/^name: /);
    expect((await health(r)).limits).toMatchObject({ keyInflight: 0, ipInflight: 0, total: 0 });
    r.ctl.pending.shift()!.finish(5);
    expect((await p0).status).toBe(201);
  });
});

describe("S3 through the server: the check-time budget", () => {
  it("a key past its budget is a 429 (key-budget) with the right Retry-After, nothing stored, the validator never asked; it is accepted once the refill has paid the debt", async () => {
    const r = await rig({ checkKeyMs: 1000, checkKeyRefill: 100 });
    const a = up(ids[0], "b1"), b = up(ids[0], "b2"), c = up(ids[0], "b3");
    const pa = post(r, ids[0], a);
    await until(() => r.ctl.pending.length === 1, "the first check");
    r.ctl.pending.shift()!.finish(1250); // it cost 1,250 ms of a 1,000 ms balance: -250
    expect((await pa).status).toBe(201);
    const refused = await post(r, ids[0], b);
    expect([refused.status, refused.retryAfter]).toEqual([429, "3"]); // floor(250 / 100) + 1
    expect(refused.text).not.toContain("\n");
    expect(refused.body).toEqual({ error: "deck check limit: this key has used its check time, try again in 3 s", limit: "key-budget" });
    expect(r.ctl.seen).toHaveLength(1);
    expect(await stored(r, b)).toBe(false);
    r.clock.now += 2000; // -250 + 200 = -50: still in debt, one more second
    const still = await post(r, ids[0], b);
    expect([still.status, still.retryAfter]).toEqual([429, "1"]);
    r.clock.now += 1000; // +50
    const pb = post(r, ids[0], b);
    await until(() => r.ctl.pending.length === 1, "the check after the refill");
    r.ctl.pending.shift()!.finish(10);
    expect((await pb).status).toBe(201);
    expect(await stored(r, b)).toBe(true);
    expect(await stored(r, c)).toBe(false);
    expect((await health(r)).limits).toMatchObject({ keyBudget: 2, total: 2 });
  });

  it("a key's debt does not stop another key of the same address, and an address past its budget is a 429 (ip-budget) for every key until it has refilled", async () => {
    const r = await rig({ checkIpMs: 1000, checkIpRefill: 100 }, { trustProxy: "fly" });
    const A = FLY("198.51.100.1"), B = FLY("198.51.100.2");
    const p0 = post(r, ids[0], up(ids[0], "ib0"), A);
    await until(() => r.ctl.pending.length === 1, "the first check");
    r.ctl.pending.shift()!.finish(1500); // the address: 1000 - 1500 = -500
    expect((await p0).status).toBe(201);
    const refused = await post(r, ids[1], up(ids[1], "ib1"), A); // a fresh key, a spent address
    expect([refused.status, refused.retryAfter]).toEqual([429, "6"]); // floor(500 / 100) + 1
    expect(refused.body).toEqual({ error: "deck check limit: this address has used its check time, try again in 6 s", limit: "ip-budget" });
    expect(r.ctl.seen).toHaveLength(1);
    const pB = post(r, ids[2], up(ids[2], "ib2"), B); // another address is unaffected
    await until(() => r.ctl.pending.length === 1, "the other address's check");
    r.ctl.pending.shift()!.finish(5);
    expect((await pB).status).toBe(201);
    r.clock.now += 6000; // -500 + 600 = 100
    const pAgain = post(r, ids[1], up(ids[1], "ib1"), A);
    await until(() => r.ctl.pending.length === 1, "the check after the refill");
    r.ctl.pending.shift()!.finish(5);
    expect((await pAgain).status).toBe(201);
    expect((await health(r)).limits).toMatchObject({ ipBudget: 1, total: 1 });
  });

  it("a deck the check REFUSES (422) is charged too; the verdict and its body are exactly what they were", async () => {
    const r = await rig({ checkKeyMs: 1000, checkKeyRefill: 100 });
    const p = post(r, ids[0], up(ids[0], "v1"));
    await until(() => r.ctl.pending.length === 1, "the check");
    r.ctl.pending.shift()!.finish(1200, { ok: false, errors: ["fake: refused"] });
    const refused = await p;
    expect([refused.status, refused.body]).toEqual([422, { error: "deck failed validation", errors: ["fake: refused"] }]);
    expect((await post(r, ids[0], up(ids[0], "v2"))).status).toBe(429); // 1000 - 1200 < 0
  });

  it("a request the client abandoned still holds its place until the check is over, and is charged when it is", async () => {
    const r = await rig({ checkKeyMs: 1000, checkKeyRefill: 100 });
    const body = JSON.stringify(up(ids[0], "ab1"));
    const ctl = new AbortController();
    const sent = fetch(`${r.base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(ids[0], body), body, signal: ctl.signal }).catch(() => null);
    await until(() => r.ctl.pending.length === 1, "the check to start");
    ctl.abort();
    await sent;
    expect((await post(r, ids[0], up(ids[0], "ab2"))).body.limit).toBe("key-inflight"); // the check is still running
    r.ctl.pending.shift()!.finish(2000);
    await sleep(20);
    expect((await post(r, ids[0], up(ids[0], "ab3"))).body.limit).toBe("key-budget"); // and its cost was charged although nobody waited for the verdict
  });
});

// ------------------------------------------------------------------------------------------------ validator.ts: the cost reaches the budget

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "s2.fakeworker.mjs");
const job = (fake: Record<string, unknown> = {}): ValidateJob => ({ build: { fake } as unknown as ValidateJob["build"], day: 1, rules: "bb-test", opts: {} });
const made: Validator[] = [];
function make(over: Partial<WorkerValidatorOptions> = {}): ReturnType<typeof createWorkerValidator> {
  const v = createWorkerValidator({ script: SCRIPT, ...over });
  made.push(v);
  return v;
}
afterEach(async () => {
  while (made.length) await made.pop()!.close();
});
const settle = <T>(p: Promise<T>) => p.then((value) => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }));

describe("S3 validator.ts: the CostReporter", () => {
  it("a job that ran is reported once, with the time it ran (the main thread's own clock when the worker sends none)", async () => {
    const v = make({ workerData: { all: { sleepMs: 200 } } });
    await until(() => v.stats().state === "ready", "the worker");
    const costs: number[] = [];
    const t0 = performance.now();
    const verdict = await v.validate(job(), (ms) => costs.push(ms));
    expect(verdict).toMatchObject({ ok: true });
    expect(costs).toHaveLength(1);
    expect(costs[0]).toBeGreaterThanOrEqual(150);
    expect(costs[0]).toBeLessThanOrEqual(performance.now() - t0 + 5);
  });

  it("a job refused because the queue was full is never reported; the ones that ran each are, once", async () => {
    const v = make({ maxQueued: 1, workerData: { all: { sleepMs: 300 } } });
    await until(() => v.stats().state === "ready", "the worker");
    const costs: number[][] = [[], [], []];
    const a = settle(v.validate(job(), (ms) => costs[0].push(ms))); // running
    const b = settle(v.validate(job(), (ms) => costs[1].push(ms))); // waiting
    const c = await settle(v.validate(job(), (ms) => costs[2].push(ms))); // no place
    expect(c.ok).toBe(false);
    expect((c as { error: { kind: string } }).error.kind).toBe("queue-full");
    expect((await a).ok && (await b).ok).toBe(true);
    expect(costs[0]).toHaveLength(1);
    expect(costs[1]).toHaveLength(1);
    expect(costs[2]).toEqual([]);
    expect(costs[0][0]).toBeGreaterThanOrEqual(250);
    expect(costs[1][0]).toBeGreaterThanOrEqual(250);
    expect(costs[1][0]).toBeLessThan(450); // the second one's time starts when it STARTED (about 300 ms), not when it joined (about 600 ms): its wait is not its cost
  });

  it("a job dropped while it waited is never reported; the one that ran until its deadline stopped it is, with about the deadline", async () => {
    // every worker takes 500 ms to say ready, so the replacement of the stopped one is not there when the waiting job's own deadline passes
    const v = make({ timeoutMs: 300, workerData: { readyDelayMs: 500, byDay: { 1: { crash: "spin" } } } });
    await until(() => v.stats().state === "ready", "the worker");
    const runCosts: number[] = [], waitCosts: number[] = [];
    const running = settle(v.validate(job(), (ms) => runCosts.push(ms)));
    await sleep(20);
    const waiting = settle(v.validate({ ...job(), day: 2 }, (ms) => waitCosts.push(ms))); // behind the spinning check
    const [r1, r2] = await Promise.all([running, waiting]);
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
    expect(runCosts).toHaveLength(1);
    expect(runCosts[0]).toBeGreaterThanOrEqual(250);
    expect(runCosts[0]).toBeLessThan(3000);
    expect(waitCosts).toEqual([]); // it never ran
  });

  it("a job whose worker died, and a check that threw, are reported too (they ran)", async () => {
    const v = make({ workerData: { byDay: { 1: { sleepMs: 80, crash: "exit" }, 2: { sleepMs: 60, fail: "boom" } } } });
    await until(() => v.stats().state === "ready", "the worker");
    const died: number[] = [];
    expect((await settle(v.validate(job(), (ms) => died.push(ms)))).ok).toBe(false);
    expect(died).toHaveLength(1);
    expect(died[0]).toBeGreaterThanOrEqual(60);
    await until(() => v.stats().state === "ready", "the replacement worker");
    const threw: number[] = [];
    expect((await settle(v.validate({ ...job(), day: 2 }, (ms) => threw.push(ms)))).ok).toBe(false);
    expect(threw).toHaveLength(1);
    expect(threw[0]).toBeGreaterThanOrEqual(40);
  });

  it("the in-thread validator reports the time its check took, once, whether the check returned or threw", async () => {
    const v = createInThreadValidator();
    const costs: number[] = [];
    const r = await settle(v.validate(job(), (ms) => costs.push(ms))); // a build validateUpload cannot take: it throws or refuses, either way it ran
    expect(r.ok === true || r.ok === false).toBe(true);
    expect(costs).toHaveLength(1);
    expect(costs[0]).toBeGreaterThanOrEqual(0);
    expect(costs[0]).toBeLessThan(5000);
  });

  it("calling validate without a reporter works exactly as before", async () => {
    const v = make();
    expect(await v.validate(job())).toMatchObject({ ok: true, errors: [] });
  });
});
