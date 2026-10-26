// IDENT-1 FIX2 (REQ-BFG-122), finding F4 of VERIFY-IDENT1-FIX1: every identity-aware request waited for the WHOLE tombstone reload, and a reload read
// every tombstone one after another (1 LIST + N HEAD + N GET on Tigris), while any signing key can add a tombstone with one DELETE. Now (server/links.ts):
//  - once a set is held, a request waits at most 250 ms for a reload and goes on with the set it holds; the first load is still waited for in full (503
//    until it succeeds); a reload that fails is dealt with once, not once per waiting request; the 250 ms timer is cleared when the reload ends first;
//  - a reload LISTs tombstones/ and reads only the keys it does not hold yet; every 6 hours it reads them all again; at most 8 reads are in flight;
//  - a key counts as held only once its ids are in the set: a reload that fails part way changes neither, an unreadable tombstone is logged once and not
//    read again until the next full read; the set only grows.
// The cases that can be timed exactly run on a bare Links with fake timers; the rest run over the routes on both backing stores (JSON lines, and Tigris
// on the fake S3, where the requests are counted). A reload's result is awaited with `settleReload()` (test-only), never with a sleep.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Links, TOMBSTONE_FULL_READ_MS, TOMBSTONE_READS_IN_FLIGHT, TOMBSTONE_WAIT_MS } from "../server/links";
import { MemoryLinkStore, type LinkStore } from "../server/linkStore";
import { MemoryProfileStore } from "../server/profileStore";
import { StorageError } from "../server/store";
import { testIdentity } from "./netIdentity";
import { closeRigs, deleteMe, freshIdentity, linkVia, matchAs, openRig, openSibling, postGhost, requestCode, theFake, uploadFor, type Kind, type Opts, type Reply, type Rig } from "./identRig";

afterAll(closeRigs);

const KINDS: Kind[] = ["jsonl", "tigris"];
const open = (kind: Kind, over: Opts = {}) => openRig(kind, { rateLimit: { windowMs: 60_000, max: 1_000_000 }, redeemLimit: { windowMs: 600_000, max: 1_000_000 }, ...over });
const TTL = 60_000; // the refresh time (server/links.ts TOMBSTONE_TTL_MS)
const idN = (n: number, tag: string): string => `${tag}${String(n).padStart(5, "0")}${"x".repeat(30)}`;
const tomb = (ids: string[], at = 1): string => JSON.stringify({ at, ids });
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const REFRESH_FAILED = "tombstone refresh failed, keeping the set";
const UNREADABLE = "skipping an unreadable tombstone";
const lines = (log: string[], what: string): number => log.filter((l) => l.includes(what)).length;

/** The promise's value, or `timedOut`: a failing run says so in a second or two instead of hanging until the test timeout. */
async function within<T>(ms: number, p: Promise<T>): Promise<{ timedOut: false; value: T } | { timedOut: true }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p.then((value) => ({ timedOut: false as const, value })), new Promise<{ timedOut: true }>((resolve) => (timer = setTimeout(() => resolve({ timedOut: true }), ms)))]);
  } finally {
    clearTimeout(timer);
  }
}

/** Tombstones made by ANOTHER machine: written straight into the store, so this machine's set does not know them until a reload reads them. */
async function otherMachineDeletes(rig: Rig, count: number, tag: string, first = 0): Promise<string[]> {
  const ids: string[] = [];
  for (let n = first; n < first + count; n++) {
    const id = idN(n, tag);
    await rig.app.links.store.put(`tombstones/${id}.json`, tomb([id]));
    ids.push(id);
  }
  return ids;
}

/** A spy on the tombstone reads of `rig`'s current server (take it after a restart). `gate` holds every read until it resolves; `failOn` fails the n-th;
 *  `absent` makes the store answer "nothing there" for those keys (a key the listing showed and the read then did not find). */
interface Spy {
  reads: string[];
  lists: number;
  inFlight: number;
  max: number;
  gate: Promise<void> | null;
  failOn: ((n: number) => boolean) | null;
  absent: Set<string>;
  restore(): void;
}
function spy(rig: Rig): Spy {
  const store = rig.app.links.store as { get: LinkStore["get"]; list: LinkStore["list"] };
  const get = store.get.bind(store), list = store.list.bind(store);
  const s: Spy = { reads: [], lists: 0, inFlight: 0, max: 0, gate: null, failOn: null, absent: new Set(), restore: () => ((store.get = get), (store.list = list)) };
  store.get = async (k: string) => {
    if (!k.startsWith("tombstones/")) return get(k);
    const n = s.reads.push(k);
    s.inFlight++;
    s.max = Math.max(s.max, s.inFlight);
    try {
      await sleep(1); // an await boundary, so that reads that run side by side overlap
      if (s.gate) await s.gate;
      if (s.failOn?.(n)) throw new StorageError("identity read failed: HTTP 500");
      if (s.absent.has(k)) return null;
      return await get(k);
    } finally {
      s.inFlight--;
    }
  };
  store.list = async (p: string) => {
    if (p === "tombstones/") s.lists++;
    return list(p);
  };
  return s;
}
const closedGate = (): { gate: Promise<void>; release: () => void } => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  return { gate, release };
};

/** What the Tigris fake saw of the tombstones since request number `from`. */
function fakeCounts(rig: Rig, from: number): { list: number; head: number; get: number } {
  const mine = theFake().requests.slice(from).filter((r) => r.bucket === rig.bucket && r.key.startsWith("tombstones/"));
  const n = (op: string) => mine.filter((r) => r.op === op).length;
  return { list: n("LIST"), head: n("HEAD"), get: n("GET") };
}

// ------------------------------------------------------------------------------------------------------ the bounded wait, exactly timed

describe("the bounded wait, on a bare Links with fake timers", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function bare() {
    const inner = new MemoryLinkStore();
    const log: string[] = [];
    const clock = { now: 1_000_000 };
    const hold = { gate: null as Promise<void> | null, fail: false, lists: 0, reads: 0 };
    const store: LinkStore = {
      get: async (k) => {
        if (k.startsWith("tombstones/")) {
          hold.reads++;
          if (hold.gate) await hold.gate;
          if (hold.fail) throw new StorageError("identity read failed: HTTP 500");
        }
        return inner.get(k);
      },
      put: (k, t) => inner.put(k, t),
      delete: (k) => inner.delete(k),
      list: async (p) => {
        hold.lists++;
        return inner.list(p);
      },
    };
    const links = new Links(store, new MemoryProfileStore(), { now: () => clock.now, log: (l) => log.push(l) });
    return { links, inner, log, clock, hold };
  }
  const Q = idN(7, "q");
  const putQ = (inner: MemoryLinkStore) => inner.put(`tombstones/${Q}.json`, tomb([Q]));

  it("with a set held, a stuck reload lets a request go on after TOMBSTONE_WAIT_MS and not before, with the set it holds; the reload's result applies when it ends", async () => {
    expect(TOMBSTONE_WAIT_MS).toBe(250);
    const { links, inner, clock, hold } = bare();
    await links.ensureFresh(); // the first load: nothing to read
    await putQ(inner);
    clock.now += TTL + 1;
    const g = closedGate();
    hold.gate = g.gate;
    let done = false;
    const p = links.ensureFresh().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(TOMBSTONE_WAIT_MS - 1);
    expect(done, "249 ms: still waiting").toBe(false);
    expect(vi.getTimerCount(), "one timer, for the one request").toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(done, "250 ms: it goes on").toBe(true);
    expect(vi.getTimerCount(), "and the timer is gone").toBe(0);
    expect(links.isGone(Q), "with the set it holds: the reload has not ended").toBe(false);
    g.release();
    await links.settleReload();
    expect(links.isGone(Q), "the reload's result applies once it ends").toBe(true);
  });

  it("a reload that ends first leaves no timer behind, and its result is there for the request that waited", async () => {
    const { links, inner, clock, hold } = bare();
    await links.ensureFresh();
    await putQ(inner);
    clock.now += TTL + 1;
    await links.ensureFresh(); // nothing holds the reload: it ends at once
    expect(links.isGone(Q), "a small reload finishes inside the wait").toBe(true);
    expect(vi.getTimerCount(), "no timer is left behind").toBe(0);
    // and one that ends after 100 ms
    const Q2 = idN(8, "q");
    await inner.put(`tombstones/${Q2}.json`, tomb([Q2]));
    clock.now += TTL + 1;
    const g = closedGate();
    hold.gate = g.gate;
    let done = false;
    const p = links.ensureFresh().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(100);
    expect(done).toBe(false);
    expect(vi.getTimerCount()).toBe(1);
    g.release();
    await p;
    expect(links.isGone(Q2), "the request waited for the reload, which ended inside the bound").toBe(true);
    expect(vi.getTimerCount(), "the timer was cleared when the reload ended first").toBe(0);
  });

  it("100 requests waiting on one stuck reload: one reload (one LIST), 100 timers, all released at 250 ms, none left", async () => {
    const { links, inner, clock, hold } = bare();
    await links.ensureFresh();
    await putQ(inner);
    clock.now += TTL + 1;
    const g = closedGate();
    hold.gate = g.gate;
    hold.lists = 0;
    let released = 0;
    const ps = Array.from({ length: 100 }, () => links.ensureFresh().then(() => released++));
    await vi.advanceTimersByTimeAsync(TOMBSTONE_WAIT_MS - 1);
    expect([released, vi.getTimerCount(), hold.lists]).toEqual([0, 100, 1]);
    await vi.advanceTimersByTimeAsync(1);
    await Promise.all(ps);
    expect([released, vi.getTimerCount()]).toEqual([100, 0]);
    g.release();
    await links.settleReload();
    expect(hold.lists, "still the one reload").toBe(1);
  });

  it("a refresh that fails is dealt with once, however many requests wait for it: one log line, and the waiters are released when it fails, not at 250 ms", async () => {
    const { links, inner, log, clock, hold } = bare();
    await links.ensureFresh();
    await putQ(inner);
    clock.now += TTL + 1;
    const g = closedGate();
    hold.gate = g.gate;
    hold.fail = true;
    let released = 0;
    const ps = Array.from({ length: 50 }, () => links.ensureFresh().then(() => released++));
    await vi.advanceTimersByTimeAsync(10);
    expect([released, vi.getTimerCount()]).toEqual([0, 50]);
    g.release(); // the read fails now
    await Promise.all(ps);
    expect(released, "all 50 go on, with no time passing").toBe(50);
    expect(vi.getTimerCount()).toBe(0);
    expect(lines(log, REFRESH_FAILED), "one line for the one reload, not one per request").toBe(1);
    expect(links.isGone(Q)).toBe(false);
    // and the retry is 5 s on, not at once, not later
    hold.fail = false;
    hold.gate = null;
    hold.lists = 0;
    clock.now += 4_999;
    await links.ensureFresh();
    expect(hold.lists, "4.999 s on: no new reload").toBe(0);
    clock.now += 1;
    await links.ensureFresh();
    expect([hold.lists, links.isGone(Q)], "5 s on: it reads again and the result applies").toEqual([1, true]);
  });

  it("the full read comes 6 hours after the last one began: a refresh 1 ms short of that reads only what is new, one at 6 hours reads every tombstone", async () => {
    expect(TOMBSTONE_FULL_READ_MS).toBe(6 * 60 * 60_000);
    for (const [at, reads] of [[TOMBSTONE_FULL_READ_MS - 1, 1], [TOMBSTONE_FULL_READ_MS, 4]] as const) {
      const { links, inner, clock, hold } = bare();
      const c0 = clock.now;
      for (let n = 0; n < 3; n++) await inner.put(`tombstones/${idN(n, "f")}.json`, tomb([idN(n, "f")]));
      await links.ensureFresh(); // the first load is a full read: 3 reads
      await putQ(inner); // one new
      hold.reads = 0;
      clock.now = c0 + at;
      await links.settleReload();
      expect(hold.reads, `a refresh ${at === TOMBSTONE_FULL_READ_MS ? "at" : "1 ms short of"} 6 hours`).toBe(reads);
      expect(links.goneCount).toBe(4);
    }
  });

  it("the first load is not bounded: a request waits for it however long it takes, no timer is made, and a failure is every waiter's own (503)", async () => {
    const { links, inner, log, hold } = bare();
    await putQ(inner);
    const g = closedGate();
    hold.gate = g.gate;
    hold.fail = true;
    const outcomes: string[] = [];
    const ps = Array.from({ length: 5 }, () => links.ensureFresh().then(() => outcomes.push("ok"), (e: unknown) => outcomes.push(e instanceof StorageError ? "StorageError" : "other")));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(outcomes, "a minute on, still waiting").toEqual([]);
    expect(vi.getTimerCount(), "no timer for a first load").toBe(0);
    g.release(); // the read fails: this was the first load
    await Promise.all(ps);
    expect(outcomes, "every waiter gets the failure").toEqual(Array(5).fill("StorageError"));
    expect(links.goneCount, "and nothing was applied").toBe(0);
    expect(lines(log, REFRESH_FAILED), "(the 'keeping the set' line is for a held set)").toBe(0);
    // the next request starts the first load again, and it succeeds
    hold.fail = false;
    hold.gate = null;
    await links.ensureFresh();
    expect([links.goneCount, links.isGone(Q)]).toEqual([1, true]);
  });
});

// ------------------------------------------------------------------------------------------------------ over the routes

describe.each(KINDS)("a stuck reload over the routes, on %s", (kind) => {
  it("with a set held, a match, an upload and a code request are answered while EVERY new tombstone read hangs, with the set held; the pool stops at 8 reads; the result applies once the reload ends", async () => {
    const rig = await open(kind);
    const [dev, X] = [await freshIdentity(), await freshIdentity()];
    const B = await testIdentity(1);
    await otherMachineDeletes(rig, 5, "o");
    await rig.restart();
    await rig.app.links.ensureFresh(); // the first load: 5 tombstones
    expect(rig.app.links.goneCount).toBe(5);
    // another machine deletes X, and 19 others
    await rig.app.links.store.put(`tombstones/${X.playerId}.json`, tomb([X.playerId]));
    await otherMachineDeletes(rig, 19, "n");
    rig.clock.now += TTL + 1;
    const s = spy(rig);
    const g = closedGate();
    s.gate = g.gate;
    try {
      const got = await within(10_000, Promise.all([
        matchAs(rig, B.playerId),
        postGhost(rig, dev, uploadFor(dev, dev.playerId, { runId: "held" })),
        requestCode(rig, dev),
        postGhost(rig, X, uploadFor(X, X.playerId, { runId: "x-meanwhile" })),
      ]));
      expect(got.timedOut, "all four were answered while the reload was stuck").toBe(false);
      if (got.timedOut) return;
      const rs: Reply[] = got.value;
      expect([200, 404], "the match").toContain(rs[0].status);
      expect(rs.slice(1).map((r) => r.status), "the upload, the code, and X's upload (the held set does not know X yet: the price of not waiting)").toEqual([201, 200, 201]);
      expect(s.reads.length, "the reload is stuck with the pool full: 8 reads started, no more").toBe(TOMBSTONE_READS_IN_FLIGHT);
      expect(s.max).toBe(TOMBSTONE_READS_IN_FLIGHT);
    } finally {
      g.release();
    }
    await rig.app.links.settleReload();
    expect(s.reads.length, "it finished once released, and read the 20 new keys only (the 5 it held were not read again)").toBe(20);
    expect(rig.app.links.goneCount).toBe(5 + 20);
    expect((await postGhost(rig, X, uploadFor(X, X.playerId, { runId: "x-after" }))).status, "the reload's result applies from the next request").toBe(410);
    s.restore();
  });

  it("the first load is waited for in full: an upload that arrives during a slow first load is held beyond 250 ms, and an incomplete set serves nobody", async () => {
    const rig = await open(kind);
    const dev = await freshIdentity();
    await otherMachineDeletes(rig, 6, "o");
    await rig.restart();
    const s = spy(rig);
    const g = closedGate();
    s.gate = g.gate;
    let answered = false;
    const up = postGhost(rig, dev, uploadFor(dev, dev.playerId, { runId: "first" })).then((r) => ((answered = true), r));
    await sleep(TOMBSTONE_WAIT_MS * 2);
    expect(answered, "twice the bound on, with no set held, it is still waiting").toBe(false);
    g.release();
    expect((await up).status).toBe(201);
    expect(rig.app.links.goneCount).toBe(6);
    s.restore();
  });

  it("a small reload finishes inside the wait: a tombstone another machine wrote applies to the first request after the refresh time", async () => {
    const rig = await open(kind);
    const X = await freshIdentity();
    expect((await postGhost(rig, X, uploadFor(X, X.playerId, { runId: "x-1" }))).status).toBe(201);
    await rig.app.links.store.put(`tombstones/${X.playerId}.json`, tomb([X.playerId]));
    rig.clock.now += TTL + 1;
    // on JSON lines the whole reload runs inside one turn of the event loop, so this is exact; on Tigris it is network I/O and the bound could pass on a
    // loaded host, so the request is made after the reload has ended (the bound itself is tested above)
    if (kind === "tigris") await rig.app.links.settleReload();
    expect((await postGhost(rig, X, uploadFor(X, X.playerId, { runId: "x-2" }))).status).toBe(410);
  });
});

// ------------------------------------------------------------------------------------------------------ the incremental read

describe("the incremental read, counted at the Tigris fake", () => {
  it("the first load is 1 LIST + N HEAD + N GET; a refresh with nothing new is the LIST alone; k new tombstones are the LIST plus their reads; after 6 hours every tombstone is read again", async () => {
    const rig = await open("tigris");
    const N = 12;
    await otherMachineDeletes(rig, N, "a");
    await rig.restart();
    const mark = () => theFake().requests.length;
    let m = mark();
    await rig.app.links.settleReload();
    expect(fakeCounts(rig, m), "the first load").toEqual({ list: 1, head: N, get: N });
    expect(rig.app.links.goneCount).toBe(N);
    rig.clock.now += TTL + 1;
    m = mark();
    await rig.app.links.settleReload();
    expect(fakeCounts(rig, m), "a refresh with nothing new: the LIST alone").toEqual({ list: 1, head: 0, get: 0 });
    // 3 new ones from another machine
    const fresh = await otherMachineDeletes(rig, 3, "b");
    rig.clock.now += TTL + 1;
    m = mark();
    await rig.app.links.settleReload();
    expect(fakeCounts(rig, m), "3 new tombstones: the LIST plus 3 reads").toEqual({ list: 1, head: 3, get: 3 });
    for (const id of fresh) expect(rig.app.links.isGone(id)).toBe(true);
    // a DELETE through this machine: its ids are gone at once, and its tombstone is read once by the next refresh
    const K = await freshIdentity();
    expect((await deleteMe(rig, K)).status).toBe(200);
    expect(rig.app.links.isGone(K.playerId), "gone at once").toBe(true);
    rig.clock.now += TTL + 1;
    m = mark();
    await rig.app.links.settleReload();
    expect(fakeCounts(rig, m), "this machine's own tombstone is not held until a refresh has read it: 1 read").toEqual({ list: 1, head: 1, get: 1 });
    rig.clock.now += TTL + 1;
    m = mark();
    await rig.app.links.settleReload();
    expect(fakeCounts(rig, m), "and then nothing is new again").toEqual({ list: 1, head: 0, get: 0 });
    // 6 hours after the first load: every tombstone, once
    rig.clock.now += TOMBSTONE_FULL_READ_MS;
    m = mark();
    await rig.app.links.settleReload();
    const all = N + 3 + 1;
    expect(fakeCounts(rig, m), "after 6 hours: the full read").toEqual({ list: 1, head: all, get: all });
    rig.clock.now += TTL + 1;
    m = mark();
    await rig.app.links.settleReload();
    expect(fakeCounts(rig, m), "and incremental again").toEqual({ list: 1, head: 0, get: 0 });
    expect(rig.app.links.goneCount).toBe(all);
  });

  it.each(KINDS)("never more than 8 tombstone reads are in flight: the first load, a refresh and a full read alike (%s)", async (kind) => {
    const rig = await open(kind);
    await otherMachineDeletes(rig, 40, "a");
    await rig.restart();
    const s = spy(rig);
    const phase = async (what: string, expectedReads: number) => {
      s.reads.length = 0;
      s.max = 0;
      await rig.app.links.settleReload();
      expect(s.reads.length, `${what}: reads`).toBe(expectedReads);
      expect(s.max, `${what}: the most in flight`).toBe(Math.min(TOMBSTONE_READS_IN_FLIGHT, expectedReads));
      expect(s.inFlight, `${what}: none left`).toBe(0);
    };
    await phase("first load", 40);
    await otherMachineDeletes(rig, 30, "b");
    rig.clock.now += TTL + 1;
    await phase("refresh", 30);
    await otherMachineDeletes(rig, 3, "c");
    rig.clock.now += TTL + 1;
    await phase("refresh of 3", 3);
    rig.clock.now += TOMBSTONE_FULL_READ_MS;
    await phase("full read", 73);
    expect(TOMBSTONE_READS_IN_FLIGHT).toBe(8);
    expect(rig.app.links.goneCount).toBe(73);
    s.restore();
  });
});

// ------------------------------------------------------------------------------------------------------ a reload that fails part way

describe.each(KINDS)("a reload that fails part way, on %s", (kind) => {
  it("the first load: 503, nothing applied; the next request reads the same tombstones again", async () => {
    const rig = await open(kind);
    await otherMachineDeletes(rig, 10, "a");
    await rig.restart();
    const dev = await freshIdentity();
    const s = spy(rig);
    s.failOn = (n) => n === 6;
    const up = await postGhost(rig, dev, uploadFor(dev, dev.playerId, { runId: "a" }));
    expect(up.status, up.text).toBe(503);
    expect(rig.app.links.goneCount, "none of the ids it had read is in the set").toBe(0);
    s.failOn = null;
    s.reads.length = 0;
    expect((await postGhost(rig, dev, uploadFor(dev, dev.playerId, { runId: "a" }))).status).toBe(201);
    expect(s.reads.length, "the next request reads all 10 again: no key was held").toBe(10);
    expect(rig.app.links.goneCount).toBe(10);
    s.restore();
  });

  it("a refresh: the set and the held keys stay as they were (not one id it had read is applied), the failure is logged once for the requests that waited, and the refresh 5 s on reads the same keys again", async () => {
    const rig = await open(kind);
    await otherMachineDeletes(rig, 5, "o");
    await rig.restart();
    await rig.app.links.ensureFresh();
    expect(rig.app.links.goneCount).toBe(5);
    const fresh = await otherMachineDeletes(rig, 10, "n");
    rig.clock.now += TTL + 1;
    const s = spy(rig);
    s.failOn = (n) => n === 4;
    const devs = await Promise.all(Array.from({ length: 6 }, () => freshIdentity()));
    const rs = await Promise.all(devs.map((d, i) => postGhost(rig, d, uploadFor(d, d.playerId, { runId: `w${i}` }))));
    expect(rs.map((r) => r.status), "answered with the set that is held").toEqual(Array(6).fill(201));
    await rig.app.links.settleReload();
    expect(rig.app.links.goneCount, "the set did not change").toBe(5);
    for (const id of fresh) expect(rig.app.links.isGone(id), "not one id of the keys it had read was applied").toBe(false);
    expect(lines(rig.log, REFRESH_FAILED), "one line for the one failed reload").toBe(1);
    // 5 s on it reads again: exactly the 10 keys (the 5 held ones are not read; the 10 were not held by the failed one)
    s.failOn = null;
    s.reads.length = 0;
    rig.clock.now += 4_999;
    await rig.app.links.settleReload();
    expect(s.reads.length, "4.999 s on: not yet").toBe(0);
    rig.clock.now += 1;
    await rig.app.links.settleReload();
    expect(s.reads.length, "5 s on: the same 10 keys").toBe(10);
    expect(s.reads.slice().sort()).toEqual(fresh.map((id) => `tombstones/${id}.json`).sort());
    expect(rig.app.links.goneCount).toBe(15);
    rig.clock.now += TTL + 1;
    s.reads.length = 0;
    await rig.app.links.settleReload();
    expect(s.reads.length, "and then nothing is new").toBe(0);
    s.restore();
  });

  it("a failed LIST fails the same way: the set is kept and the refresh is tried again 5 s on", async () => {
    const rig = await open(kind);
    await otherMachineDeletes(rig, 3, "o");
    await rig.restart();
    await rig.app.links.ensureFresh();
    const fresh = await otherMachineDeletes(rig, 2, "n");
    rig.clock.now += TTL + 1;
    const store = rig.app.links.store as { list: LinkStore["list"] };
    const list = store.list.bind(store);
    store.list = async () => {
      throw new StorageError("identity list failed: HTTP 500");
    };
    try {
      await rig.app.links.settleReload();
    } finally {
      store.list = list;
    }
    expect(lines(rig.log, REFRESH_FAILED)).toBe(1);
    expect(rig.app.links.goneCount).toBe(3);
    rig.clock.now += 5_000;
    await rig.app.links.settleReload();
    expect(fresh.every((id) => rig.app.links.isGone(id))).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------------------ an unreadable tombstone, a rewrite, the set only grows

describe.each(KINDS)("what a full read is for, on %s", (kind) => {
  it("an unreadable tombstone is logged once and not read again until the next full read", async () => {
    const rig = await open(kind);
    await otherMachineDeletes(rig, 2, "a");
    await rig.app.links.store.put("tombstones/junk.json", "{this is not a tombstone");
    await rig.restart();
    const s = spy(rig);
    await rig.app.links.settleReload();
    expect([s.reads.length, lines(rig.log, UNREADABLE)], "the first load reads all three and logs the junk once").toEqual([3, 1]);
    rig.clock.now += TTL + 1;
    await rig.app.links.settleReload();
    rig.clock.now += TTL + 1;
    await rig.app.links.settleReload();
    expect([s.reads.length, lines(rig.log, UNREADABLE)], "two refreshes on: not read again, not logged again").toEqual([3, 1]);
    rig.clock.now += TOMBSTONE_FULL_READ_MS;
    await rig.app.links.settleReload();
    expect([s.reads.length, lines(rig.log, UNREADABLE)], "the full read reads it again and logs it once more").toEqual([6, 2]);
    expect(rig.app.links.goneCount).toBe(2);
    s.restore();
  });

  it("a tombstone the store lists but returns nothing for is not held (its ids are not in the set): the next refresh reads it again, and an unreadable text is the other case", async () => {
    const rig = await open(kind);
    const [a, b, c] = await otherMachineDeletes(rig, 3, "a");
    await rig.restart();
    const s = spy(rig);
    s.absent = new Set([`tombstones/${b}.json`]); // the listing shows it, the read finds nothing
    await rig.app.links.settleReload();
    expect([s.reads.length, rig.app.links.goneCount, rig.app.links.isGone(b)], "the first load read three, and two ids are in the set").toEqual([3, 2, false]);
    expect(lines(rig.log, "1 listed tombstone(s) not found"), "said once, with a count and no id").toBe(1);
    expect(lines(rig.log, UNREADABLE), "and it is not 'unreadable'").toBe(0);
    s.absent.clear();
    s.reads.length = 0;
    rig.clock.now += TTL + 1;
    await rig.app.links.settleReload();
    expect(s.reads, "the next refresh reads that key again, and only that one").toEqual([`tombstones/${b}.json`]);
    expect([rig.app.links.goneCount, rig.app.links.isGone(a), rig.app.links.isGone(b), rig.app.links.isGone(c)]).toEqual([3, true, true, true]);
    s.reads.length = 0;
    rig.clock.now += TTL + 1;
    await rig.app.links.settleReload();
    expect(s.reads, "and then it is held").toEqual([]);
    s.restore();
  });

  it("a tombstone rewritten in place reaches another machine only at its next full read: a key linked to the player after the first DELETE is added by a repeat DELETE", async () => {
    const rig = await open(kind);
    const sib = await openSibling(rig);
    const [P, K1, K2] = [await freshIdentity(), await freshIdentity(), await freshIdentity()];
    expect((await linkVia(rig, P, K1)).joined.status).toBe(200);
    expect((await deleteMe(rig, P)).status).toBe(200);
    expect(JSON.parse(await rig.app.links.store.get(`tombstones/${P.playerId}.json`) ?? "{}").ids.slice().sort()).toEqual([P.playerId, K1.playerId].sort());
    await sib.app.links.settleReload(); // the other machine loads the tombstone: P and K1 are gone there
    expect([sib.app.links.isGone(P.playerId), sib.app.links.isGone(K1.playerId), sib.app.links.isGone(K2.playerId)]).toEqual([true, true, false]);
    // a machine that did not know the tombstone yet links K2 to P (P's record and K2's link are written), then P deletes again on the first machine
    const store = rig.app.links.store;
    await store.put(`players/${P.playerId}.json`, JSON.stringify({ keys: [K2.playerId], steam: [], at: rig.clock.now }));
    await store.put(`links/keys/${K2.playerId}.json`, JSON.stringify({ player: P.playerId, at: rig.clock.now }));
    rig.clock.now += TTL + 1;
    await rig.app.links.settleReload();
    expect((await deleteMe(rig, P)).status).toBe(200);
    expect(JSON.parse(await store.get(`tombstones/${P.playerId}.json`) ?? "{}").ids.slice().sort(), "the same tombstone, rewritten with the key that was added").toEqual([P.playerId, K1.playerId, K2.playerId].sort());
    expect(rig.app.links.isGone(K2.playerId), "this machine adds the DELETE's ids at once").toBe(true);
    // the other machine: a refresh does not read a tombstone it holds, so K2 is not gone there; K2's own-id upload is taken; a full read fixes it
    rig.clock.now += TTL + 1;
    await sib.app.links.settleReload();
    expect(sib.app.links.isGone(K2.playerId), "a refresh does not re-read the held tombstone").toBe(false);
    expect((await postGhost(sib, K2, uploadFor(K2, K2.playerId, { runId: "k2-stale" }))).status, "so the other machine still takes K2's upload under its own id").toBe(201);
    rig.clock.now += TOMBSTONE_FULL_READ_MS;
    await sib.app.links.settleReload();
    expect(sib.app.links.isGone(K2.playerId), "the full read reads it again").toBe(true);
    expect((await postGhost(sib, K2, uploadFor(K2, K2.playerId, { runId: "k2-late" }))).status).toBe(410);
  });

  it("the set only grows: a tombstone that leaves the store stays in the set, through a refresh and through a full read", async () => {
    const rig = await open(kind);
    const [a, b] = await otherMachineDeletes(rig, 2, "a");
    await rig.restart();
    await rig.app.links.settleReload();
    expect(rig.app.links.goneCount).toBe(2);
    await rig.app.links.store.delete(`tombstones/${a}.json`);
    rig.clock.now += TTL + 1;
    await rig.app.links.settleReload();
    rig.clock.now += TOMBSTONE_FULL_READ_MS;
    await rig.app.links.settleReload();
    expect([rig.app.links.goneCount, rig.app.links.isGone(a), rig.app.links.isGone(b)]).toEqual([2, true, true]);
  });
});
