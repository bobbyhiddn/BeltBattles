// S3 (BRIEF-S3 goal 3; LAUNCH-0 REPORT 1.4 item 4, 1.8): A PER-IP DAILY LIMIT ON NEW KEYS, and every per-IP limit keyed on the /64 of an IPv6 address.
//   server/ipLimits.ts   ipKey (IPv4 as it is, IPv4-mapped IPv6 as its IPv4, other IPv6 as its /64), BoundedMap, RateLimiter (the 120-a-minute limiter,
//                        keyed on ipKey and bounded), NewKeyLimiter (the daily allowance of keys the server has not seen).
//   server/app.ts       POST /v1/ghosts and PUT /v1/profile each count a key that is new to the server against the address that brings it, once its signature
//                        has verified; past the allowance a NEW key is a 429 (limit "new-keys") with Retry-After = the seconds to the end of that address's
//                        window. "Seen" = accepted since boot, or a stored profile (asked only when an address is over its allowance). A seen key keeps working
//                        from any address.
// Here: the pure pieces, then the same rules through createGhostServer (an instant validator: these tests are about keys, not decks; the clock is the test's).
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ENDLESS, setEndless } from "../src/sim/endless";
import { setPlayerName } from "../src/game/ghostSnapshot";
import { KEY_HEADER, PROFILE_PREFIX, SIG_HEADER, loadIdentity, memoryKeyStore, type Identity } from "../src/net/identity";
import { encodeWire } from "../src/net/profileWire";
import type { GhostSnapshot } from "../src/net/snapshot";
import type { Validation } from "../src/net/validate";
import { createGhostServer, type GhostServer, type ServerOptions } from "../server/app";
import { BoundedMap, NewKeyLimiter, RATE_MAP_MAX, RateLimiter, ipKey } from "../server/ipLimits";
import type { ValidateJob, Validator } from "../server/validator";
import { jsonlBackend, type StoreBackend } from "./netStores";
import { ownedBy, signedHeaders, testIdentity, TEST_NAME } from "./netIdentity";
import { playEndless } from "./endless1.honest";
import { NOW, freshWire } from "./profileupWire";

setPlayerName(TEST_NAME);

// ------------------------------------------------------------------------------------------------ ipKey

describe("S3 ipLimits.ts: ipKey", () => {
  it("an IPv4 address is its own key, and so is anything that is not an IP literal", () => {
    for (const s of ["203.0.113.7", "127.0.0.1", "unknown", "", "not an ip", "1.2.3"]) expect(ipKey(s)).toBe(s);
  });

  it("an IPv4-mapped IPv6 address (how a dual-stack socket shows an IPv4 client) is its IPv4 address, in either spelling", () => {
    expect(ipKey("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(ipKey("::FFFF:203.0.113.7")).toBe("203.0.113.7");
    expect(ipKey("::ffff:cb00:7107")).toBe("203.0.113.7");
    expect(ipKey("0:0:0:0:0:ffff:cb00:7107")).toBe("203.0.113.7");
  });

  it("any other IPv6 address is its /64 prefix: 2001:db8:1:2::/64", () => {
    expect(ipKey("2001:db8:1:2:3:4:5:6")).toBe("2001:db8:1:2::/64");
    expect(ipKey("2001:db8:1:2::1")).toBe("2001:db8:1:2::/64");
    expect(ipKey("2001:db8:1:2:ffff:ffff:ffff:ffff")).toBe("2001:db8:1:2::/64");
    expect(ipKey("2001:db8:1:2::")).toBe("2001:db8:1:2::/64");
  });

  it("every spelling of a /64 is one key: leading zeros, upper case, compression, a zone id", () => {
    const want = "2001:db8:1:2::/64";
    for (const s of ["2001:0db8:0001:0002:0000:0000:0000:0001", "2001:DB8:1:2::1", "2001:db8:1:2:0:0:0:1", "2001:db8:1:2::0:1", "2001:0DB8:0001:0002::beef%eth0"]) expect(ipKey(s)).toBe(want);
    expect(ipKey("::1")).toBe("0:0:0:0::/64");
    expect(ipKey("::")).toBe("0:0:0:0::/64");
    expect(ipKey("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
    expect(ipKey("2001:db8::")).toBe("2001:db8:0:0::/64");
    expect(ipKey("1::")).toBe("1:0:0:0::/64");
    expect(ipKey("64:ff9b::192.0.2.33")).toBe("64:ff9b:0:0::/64"); // an embedded IPv4 tail
    expect(ipKey("::1.2.3.4")).toBe("0:0:0:0::/64"); // IPv4-compatible is not IPv4-mapped
  });

  it("two addresses in one /64 share a key; two different /64s do not", () => {
    expect(ipKey("2001:db8:1:2::1")).toBe(ipKey("2001:db8:1:2:9:9:9:9"));
    expect(ipKey("2001:db8:1:2::1")).not.toBe(ipKey("2001:db8:1:3::1"));
    expect(ipKey("2001:db8:1:2::1")).not.toBe(ipKey("2001:db8:2:2::1"));
    expect(ipKey("2001:db8:1:2::1")).not.toBe(ipKey("203.0.113.7"));
  });

  it("text that is not an IPv6 literal is returned as it is, never thrown on", () => {
    for (const s of ["1:2:3", "1:2:3:4:5:6:7:8:9", "2001:db8::1::2", "12345::1", "gggg::1", "::ffff:999.1.1.1", ":::", "1:2:3:4:5:6:7::8:9", "::ffff:1.2.3"]) expect(ipKey(s)).toBe(s);
  });
});

// ------------------------------------------------------------------------------------------------ BoundedMap and RateLimiter

describe("S3 ipLimits.ts: BoundedMap", () => {
  it("drops the oldest entries first when it passes its bound, counts them, and refuses a bound that is not a positive integer", () => {
    const m = new BoundedMap<string, number>(3);
    for (const [i, k] of ["a", "b", "c", "d", "e"].entries()) m.set(k, i);
    expect(m.size).toBe(3);
    expect([...m.keys()]).toEqual(["c", "d", "e"]);
    expect(m.evictions).toBe(2);
    expect(m.get("a")).toBeUndefined();
    for (const bad of [0, -1, 1.5, Number.NaN]) expect(() => new BoundedMap(bad)).toThrow();
  });

  it("set moves a replaced key to the newest place; touch moves a used one; delete frees a place", () => {
    const m = new BoundedMap<string, number>(3);
    m.set("a", 1);
    m.set("b", 2);
    m.set("c", 3);
    m.set("a", 10); // a is now the newest
    m.set("d", 4); // b is the oldest and goes
    expect([...m.keys()]).toEqual(["c", "a", "d"]);
    m.touch("c"); // the order is now a, d, c
    m.set("e", 5); // a is the oldest and goes
    expect([...m.keys()]).toEqual(["d", "c", "e"]);
    expect(m.has("a")).toBe(false);
    expect(m.delete("c")).toBe(true);
    expect(m.size).toBe(2);
    m.touch("missing"); // no-op
    expect(m.size).toBe(2);
  });

  it("never holds more than its bound under a flood of 100,000 distinct keys", () => {
    const m = new BoundedMap<string, number>(500);
    for (let i = 0; i < 100_000; i++) m.set(`k${i}`, i);
    expect(m.size).toBe(500);
    expect(m.evictions).toBe(99_500);
    expect(m.has("k99999")).toBe(true);
    expect(m.has("k0")).toBe(false);
  });
});

describe("S3 ipLimits.ts: RateLimiter (the 120-a-minute limiter, keyed on ipKey, bounded)", () => {
  it("is a fixed window per key: `max` requests pass, the next is refused, a new window starts after windowMs", () => {
    const l = new RateLimiter(1000, 3);
    expect([1, 2, 3, 4, 5].map(() => l.allow("a", 0))).toEqual([true, true, true, false, false]);
    expect(l.allow("b", 0)).toBe(true); // another client
    expect(l.allow("a", 999)).toBe(false);
    expect(l.allow("a", 1000)).toBe(true); // the window is over
    expect(l.allow("a", 1000)).toBe(true);
    expect(l.allow("a", 1000)).toBe(true);
    expect(l.allow("a", 1000)).toBe(false);
  });

  it("never tracks more than its bound under a flood of 100,000 distinct addresses", () => {
    const l = new RateLimiter(60_000, 5, 100);
    for (let i = 0; i < 100_000; i++) l.allow(`10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`, 1000);
    expect(l.tracked).toBeLessThanOrEqual(100);
    expect(l.tracked).toBeGreaterThan(0);
  });

  it("the default bound is documented (50,000 clients) and expired windows are swept once the table is big", () => {
    expect(RATE_MAP_MAX).toBe(50_000);
    const l = new RateLimiter(60_000, 5, 10_000);
    for (let i = 0; i < 3000; i++) l.allow(`a${i}`, 0);
    expect(l.tracked).toBe(3000);
    l.allow("late", 61_000); // every older window has ended: the sweep removes them
    expect(l.tracked).toBe(1);
  });

  it("an IPv6 /64 is one client when the caller keys on ipKey: 1,000 addresses of one /64 take one place in the table", () => {
    const l = new RateLimiter(60_000, 3);
    const results: boolean[] = [];
    for (let i = 0; i < 6; i++) results.push(l.allow(ipKey(`2001:db8:1:2::${i.toString(16)}`), 0));
    expect(results).toEqual([true, true, true, false, false, false]);
    for (let i = 0; i < 1000; i++) l.allow(ipKey(`2001:db8:1:2:${i.toString(16)}::1`), 0);
    expect(l.tracked).toBe(1);
    expect(l.allow(ipKey("2001:db8:1:3::1"), 0)).toBe(true); // another /64
    expect(l.tracked).toBe(2);
  });
});

// ------------------------------------------------------------------------------------------------ NewKeyLimiter

describe("S3 ipLimits.ts: NewKeyLimiter", () => {
  const DAY = 86_400_000;
  const mk = (over: Partial<ConstructorParameters<typeof NewKeyLimiter>[0]> = {}) => new NewKeyLimiter({ perIp: 3, ...over });

  it("the first `perIp` new keys of an address pass; the next new key is refused with Retry-After = the seconds to the end of the window", async () => {
    const l = mk();
    const t0 = 5_000_000;
    expect(await l.admit("a", "k1", t0)).toBeNull();
    expect(await l.admit("a", "k2", t0 + 1000)).toBeNull();
    expect(await l.admit("a", "k3", t0 + 2000)).toBeNull();
    expect(await l.admit("a", "k4", t0 + 2000)).toBe(86_398); // the window started at the first new key (t0), 2 s ago
  });

  it("(the window is anchored at the address's FIRST new key, so the wait is counted from there)", async () => {
    const l = mk();
    const t0 = 5_000_000;
    for (const k of ["k1", "k2", "k3"]) expect(await l.admit("a", k, t0)).toBeNull();
    expect(await l.admit("a", "k4", t0 + 2000)).toBe(86_398);
    expect(await l.admit("a", "k4", t0 + 3_600_000)).toBe(86_400 - 3600);
    expect(await l.admit("a", "k4", t0 + DAY - 1)).toBe(1); // never 0: a retry needs at least a second
  });

  it("a key that has been seen keeps working: from the same address over its allowance and from another address; a different address is unaffected", async () => {
    const l = mk();
    for (const k of ["k1", "k2", "k3"]) expect(await l.admit("a", k, 0)).toBeNull();
    expect(await l.admit("a", "k4", 0)).not.toBeNull();
    expect(await l.admit("a", "k1", 0)).toBeNull(); // seen
    expect(await l.admit("b", "k1", 0)).toBeNull(); // seen, from another address: not counted against it
    expect(await l.admit("b", "k2", 0)).toBeNull();
    expect(await l.admit("b", "k3", 0)).toBeNull();
    for (const k of ["n1", "n2", "n3"]) expect(await l.admit("b", k, 0)).toBeNull(); // b's own allowance is untouched by what a brought
    expect(await l.admit("b", "n4", 0)).not.toBeNull();
    expect(await l.admit("c", "n4", 0)).toBeNull(); // a refused key was never remembered: it is new for c
  });

  it("the window ends and the allowance returns", async () => {
    const l = mk();
    for (const k of ["k1", "k2", "k3"]) expect(await l.admit("a", k, 1000)).toBeNull();
    expect(await l.admit("a", "k4", 1000 + DAY - 1)).not.toBeNull();
    expect(await l.admit("a", "k4", 1000 + DAY)).toBeNull(); // a new window
    expect(await l.admit("a", "k5", 1000 + DAY)).toBeNull();
    expect(await l.admit("a", "k6", 1000 + DAY)).toBeNull();
    expect(await l.admit("a", "k7", 1000 + DAY)).not.toBeNull();
  });

  it("a key storage knows (a stored profile) passes over the allowance, and is then seen: storage is asked only over the allowance, once per key", async () => {
    const asked: string[] = [];
    const known = new Set(["returning"]);
    const l = mk({ known: async (id) => (asked.push(id), known.has(id)) });
    for (const k of ["k1", "k2", "k3"]) expect(await l.admit("a", k, 0)).toBeNull();
    expect(asked).toEqual([]); // under the allowance storage is never asked
    expect(await l.admit("a", "stranger", 0)).not.toBeNull();
    expect(asked).toEqual(["stranger"]);
    expect(await l.admit("a", "returning", 0)).toBeNull();
    expect(await l.admit("a", "returning", 0)).toBeNull();
    expect(asked).toEqual(["stranger", "returning"]); // the second time it was already seen
    expect(await l.admit("a", "returning", 0)).toBeNull();
  });

  it("a storage that fails counts as 'not known': the new key is refused, nothing throws", async () => {
    const l = mk({ perIp: 1, known: async () => { throw new Error("storage down"); } });
    expect(await l.admit("a", "k1", 0)).toBeNull();
    expect(await l.admit("a", "k2", 0)).not.toBeNull();
  });

  it("two requests of one new key at once are counted once", async () => {
    const l = mk({ perIp: 2 });
    const both = await Promise.all([l.admit("a", "k1", 0), l.admit("a", "k1", 0)]);
    expect(both).toEqual([null, null]);
    expect(await l.admit("a", "k2", 0)).toBeNull(); // the allowance of 2 still has a place
    expect(await l.admit("a", "k3", 0)).not.toBeNull();
  });

  it("is bounded: a flood of distinct addresses and keys never holds more than ipMax addresses and seenMax keys, and one address's refused keys are not remembered", async () => {
    const l = mk({ ipMax: 50, seenMax: 100 });
    for (let i = 0; i < 20_000; i++) await l.admit(`ip-${i}`, `key-${i}`, i);
    expect(l.trackedIps).toBeLessThanOrEqual(50);
    expect(l.trackedKeys).toBeLessThanOrEqual(100);
    expect(l.evictions).toBeGreaterThan(30_000);
    const one = mk({ perIp: 3 });
    let refused = 0;
    for (let i = 0; i < 5000; i++) if ((await one.admit("attacker", `fake-${i}`, 0)) !== null) refused++;
    expect(refused).toBe(4997);
    expect(one.trackedKeys).toBe(3); // the memory an address can take is its allowance
    expect(one.trackedIps).toBe(1);
  });

  it("the least recently used seen keys are the ones forgotten (a key in use stays)", async () => {
    const l = mk({ perIp: 1000, seenMax: 3 });
    for (const k of ["k1", "k2", "k3"]) await l.admit("a", k, 0);
    await l.admit("a", "k1", 0); // used again: k2 is now the oldest
    await l.admit("a", "k4", 0);
    expect(l.trackedKeys).toBe(3);
    // k2 left: from an address over its allowance it would be new again, k1 and k3 still pass
    const tight = mk({ perIp: 1, seenMax: 2 });
    await tight.admit("a", "k1", 0);
    await tight.admit("b", "k2", 0);
    await tight.admit("a", "k1", 0); // k1 used again
    await tight.admit("c", "k3", 0); // k2 (the least recently used) leaves
    expect(await tight.admit("a", "k1", 0)).toBeNull();
    expect(await tight.admit("b", "k2", 0)).not.toBeNull(); // b has used its 1 and k2 is forgotten
  });
});

// ------------------------------------------------------------------------------------------------ through the server

function instant() {
  const seen: ValidateJob[] = [];
  const validator: Validator = {
    kind: "in-thread",
    validate: async (job, onCost) => {
      seen.push(job);
      onCost?.(1);
      return { ok: true, errors: [] } as Validation;
    },
    stats: () => ({ kind: "in-thread", state: "in-thread", queued: 0, running: 0, queueMax: 0, timeoutMs: 0, checks: 0, queueFull: 0, timeouts: 0, restarts: 0, errors: 0, warmMs: null, workerHeapLimitMb: null }),
    close: async () => {},
  };
  return { validator, seen };
}

let runSnaps: GhostSnapshot[];
beforeAll(async () => {
  setEndless(true);
  const me = await testIdentity(0);
  runSnaps = playEndless("weaver", 42, me.playerId, { buys: 0, until: 10 }).runSnaps;
}, 300_000);
afterAll(() => setEndless(ENDLESS));

const freshId = async (): Promise<Identity> => {
  const id = await loadIdentity(memoryKeyStore());
  if (!id) throw new Error("no WebCrypto in this Node");
  return id;
};
let runSeq = 0;
/** A distinct honest upload of `who` (a dusk of days 1-10 under a fresh runId). */
const upload = (who: Identity, day = 3): GhostSnapshot => ownedBy({ ...runSnaps.find((s) => s.day === day)!, runId: `s3k-${++runSeq}` }, who);

interface Rig {
  app: GhostServer;
  base: string;
  clock: { now: number };
  ctl: ReturnType<typeof instant>;
}
const open: { rig: Rig; backend: StoreBackend }[] = [];
const backends: StoreBackend[] = [];
async function newBackend(): Promise<StoreBackend> {
  const b = jsonlBackend();
  await b.setup();
  backends.push(b);
  return b;
}
async function rig(backend: StoreBackend, limits: NonNullable<ServerOptions["limits"]> = {}, extra: Partial<ServerOptions> = {}): Promise<Rig> {
  const ctl = instant();
  const clock = { now: 1_000_000 };
  const app = backend.server({
    uploads: "open", log: () => {}, rateLimit: { windowMs: 60_000, max: 1_000_000 }, matchSalt: () => 0, validator: ctl.validator, trustProxy: "fly",
    now: () => NOW, limits: { now: () => clock.now, ...limits }, ...extra,
  });
  const r: Rig = { app, base: `http://127.0.0.1:${await app.listen(0)}`, clock, ctl };
  open.push({ rig: r, backend });
  return r;
}
afterEach(async () => {
  while (open.length) await open.pop()!.rig.app.close();
  while (backends.length) await backends.pop()!.teardown();
});

interface Reply {
  status: number;
  retryAfter: string | null;
  text: string;
  body: Record<string, unknown>;
}
async function readReply(res: Response): Promise<Reply> {
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = {};
  }
  return { status: res.status, retryAfter: res.headers.get("retry-after"), text, body };
}
const FLY = (ip: string) => ({ "fly-client-ip": ip });
async function postGhost(r: Rig, who: Identity, ip: string, s: GhostSnapshot = upload(who)): Promise<Reply> {
  const body = JSON.stringify(s);
  return readReply(await fetch(`${r.base}/v1/ghosts`, { method: "POST", headers: { ...(await signedHeaders(who, body)), ...FLY(ip) }, body }));
}
async function putProfile(r: Rig, who: Identity, ip: string): Promise<Reply> {
  const text = encodeWire(freshWire());
  const { key, sig } = await who.sign(new TextEncoder().encode(text), PROFILE_PREFIX);
  return readReply(await fetch(`${r.base}/v1/profile`, { method: "PUT", headers: { "content-type": "application/json", [KEY_HEADER]: key, [SIG_HEADER]: sig, ...FLY(ip) }, body: text }));
}
const health = async (r: Rig): Promise<Record<string, any>> => (await fetch(`${r.base}/v1/health`)).json() as Promise<Record<string, any>>;
const NEW_KEYS_ERROR = (n: number) => `new key limit: this address has brought ${n} keys the server has not seen in 24 hours, try again later`;

describe("S3 through the server: new keys per address per day", () => {
  it("the first new key over the limit from one address is a 429 (new-keys) with Retry-After = the rest of the window; a key already seen still works, from the same address and another; another address is unaffected", async () => {
    const r = await rig(await newBackend(), { newKeysPerIpDay: 3 });
    const A = "203.0.113.7", B = "203.0.113.8";
    const keys = await Promise.all(Array.from({ length: 6 }, freshId));
    for (const k of keys.slice(0, 3)) expect((await postGhost(r, k, A)).status).toBe(201);
    const refused = await postGhost(r, keys[3], A);
    expect(refused.status).toBe(429);
    expect(refused.retryAfter).toBe("86400");
    expect(refused.text).not.toContain("\n");
    expect(refused.body).toEqual({ error: NEW_KEYS_ERROR(3), limit: "new-keys" });
    expect(r.ctl.seen).toHaveLength(3); // never reached the deck check
    r.clock.now += 3_600_000; // an hour later the wait is an hour shorter
    expect((await postGhost(r, keys[3], A)).retryAfter).toBe("82800");
    // a seen key keeps working from the same address, and from another one
    expect((await postGhost(r, keys[0], A)).status).toBe(201);
    expect((await postGhost(r, keys[1], B)).status).toBe(201);
    // another address has its own allowance (keys[3] was refused at A and never remembered: it is a new key at B)
    for (const k of [keys[3], keys[4], keys[5]]) expect((await postGhost(r, k, B)).status).toBe(201);
    expect((await postGhost(r, await freshId(), B)).status).toBe(429);
    expect((await health(r)).limits).toMatchObject({ newKeys: 3, total: 3 });
  });

  it("the window ends after 24 hours and the address has its allowance again", async () => {
    const r = await rig(await newBackend(), { newKeysPerIpDay: 2 });
    const A = "203.0.113.20";
    for (let i = 0; i < 2; i++) expect((await postGhost(r, await freshId(), A)).status).toBe(201);
    const late = await freshId();
    expect((await postGhost(r, late, A)).status).toBe(429);
    r.clock.now += 86_400_000;
    expect((await postGhost(r, late, A)).status).toBe(201);
  });

  it("PUT /v1/profile counts new keys the same way and shares the address's allowance with ghost uploads; either route makes a key seen for the other", async () => {
    const r = await rig(await newBackend(), { newKeysPerIpDay: 2 });
    const A = "203.0.113.30";
    const [k0, k1, k2] = await Promise.all([freshId(), freshId(), freshId()]);
    expect((await putProfile(r, k0, A)).status).toBe(200); // k0's first sight is a profile
    expect((await postGhost(r, k1, A)).status).toBe(201); // k1's is a ghost
    const refusedProfile = await putProfile(r, k2, A);
    expect(refusedProfile.status).toBe(429);
    expect(refusedProfile.body).toEqual({ error: NEW_KEYS_ERROR(2), limit: "new-keys" });
    expect(Number(refusedProfile.retryAfter)).toBeGreaterThan(0);
    const refusedGhost = await postGhost(r, k2, A);
    expect(refusedGhost.status).toBe(429);
    expect(refusedGhost.body.limit).toBe("new-keys");
    expect((await postGhost(r, k0, A)).status).toBe(201); // seen through its profile
    expect((await putProfile(r, k1, A)).status).toBe(200); // seen through its ghost
    expect((await health(r)).limits).toMatchObject({ newKeys: 2, total: 2 });
  });

  it("a refused new key stores nothing (no ghost, no profile) and the memory an address can take is its allowance", async () => {
    const backend = await newBackend();
    const r = await rig(backend, { newKeysPerIpDay: 2 });
    const A = "203.0.113.40";
    for (let i = 0; i < 2; i++) await postGhost(r, await freshId(), A);
    const before = r.app.store.size;
    for (let i = 0; i < 40; i++) {
      const k = await freshId();
      expect((await postGhost(r, k, A)).status).toBe(429);
      expect((await putProfile(r, k, A)).status).toBe(429);
    }
    expect(r.app.store.size).toBe(before);
    expect(r.ctl.seen).toHaveLength(2);
    expect(r.app.limits.newKeys.trackedKeys).toBe(2);
    expect(r.app.limits.newKeys.trackedIps).toBe(1);
    expect(backend.storedRecords()).toBe(2);
  });

  it("cheap refusals come first and do not use the allowance: a bad name from a new key is 422, not 429, and the key is not counted", async () => {
    const r = await rig(await newBackend(), { newKeysPerIpDay: 1 });
    const A = "203.0.113.50";
    expect((await postGhost(r, await freshId(), A)).status).toBe(201); // the allowance is spent
    const stranger = await freshId();
    const bad = await postGhost(r, stranger, A, { ...upload(stranger), name: "X" });
    expect(bad.status).toBe(422);
    expect(r.app.limits.newKeys.trackedKeys).toBe(1);
    expect((await postGhost(r, stranger, A)).status).toBe(429); // a good upload from the same new key is the one that is counted and refused
  });

  it("a returning player the server knows from storage (a stored profile) passes over the allowance after a restart; a stranger does not", async () => {
    const backend = await newBackend();
    const first = await rig(backend, { newKeysPerIpDay: 5 });
    const A = "203.0.113.60";
    const returning = await freshId();
    expect((await putProfile(first, returning, A)).status).toBe(200); // the profile is now stored
    await first.app.close();
    open.pop();
    const second = await rig(backend, { newKeysPerIpDay: 1 }); // a restart: the seen set is empty, the profile is on disk
    expect((await postGhost(second, await freshId(), A)).status).toBe(201); // the allowance of 1 is spent by a newcomer
    expect((await postGhost(second, await freshId(), A)).status).toBe(429); // a stranger is refused
    expect((await postGhost(second, returning, A)).status).toBe(201); // the returning player is not: storage knows its key
    expect((await postGhost(second, returning, A)).status).toBe(201);
  });
});

describe("S3 through the server: IPv6 addresses are keyed on their /64", () => {
  it("two IPv6 addresses in one /64 share the allowance; two different /64s do not; an IPv4-mapped address is its IPv4 address", async () => {
    const r = await rig(await newBackend(), { newKeysPerIpDay: 2 });
    const [k0, k1, k2, k3, k4, k5, k6] = await Promise.all(Array.from({ length: 7 }, freshId));
    expect((await postGhost(r, k0, "2001:db8:1:2::1")).status).toBe(201);
    expect((await postGhost(r, k1, "2001:db8:1:2:aaaa:bbbb:cccc:dddd")).status).toBe(201); // the same /64: the second place
    const refused = await postGhost(r, k2, "2001:db8:1:2::99");
    expect([refused.status, refused.body.limit]).toEqual([429, "new-keys"]);
    expect((await postGhost(r, k2, "2001:db8:1:3::1")).status).toBe(201); // another /64
    // IPv4 and its mapped form are one address
    expect((await postGhost(r, k3, "203.0.113.9")).status).toBe(201);
    expect((await postGhost(r, k4, "::ffff:203.0.113.9")).status).toBe(201);
    expect((await postGhost(r, k5, "203.0.113.9")).status).toBe(429);
    expect((await postGhost(r, k6, "::ffff:cb00:7109")).status).toBe(429); // the hex spelling of the same address
    expect(r.app.limits.newKeys.trackedIps).toBe(3); // 2001:db8:1:2::/64, 2001:db8:1:3::/64 and 203.0.113.9
  });

  it("the 120-a-minute limiter is keyed on the /64 too: addresses of one /64 share it, another /64 does not, and rotating addresses cannot grow its table", async () => {
    const r = await rig(await newBackend(), {}, { rateLimit: { windowMs: 60_000, max: 3 } });
    const get = async (ip: string) => (await fetch(`${r.base}/v1/health`, { headers: FLY(ip) })).status;
    expect([await get("2001:db8:5:6::1"), await get("2001:db8:5:6::2"), await get("2001:db8:5:6:1:2:3:4")]).toEqual([200, 200, 200]);
    expect(await get("2001:db8:5:6::ffff")).toBe(429);
    expect(await get("2001:db8:5:7::1")).toBe(200);
    expect(r.app.limits.requests.tracked).toBe(2);
    for (let i = 0; i < 30; i++) await get(`2001:db8:5:6:${i.toString(16)}::1`);
    expect(r.app.limits.requests.tracked).toBe(2); // thirty more addresses of the same /64: no new place
    const h = await health(r);
    expect(h.limits.rate).toBeGreaterThanOrEqual(31);
    expect(h.limits.total).toBe(h.limits.rate);
  });
});
