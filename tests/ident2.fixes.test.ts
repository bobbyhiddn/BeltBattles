// IDENT-2 (REQ-BFG-122) step 6, fixes A, D and K of the final IDENT-1 re-check (VERIFY-IDENT1-FIX2 REPORT :62, :65, :72); fix B is tests/ident2.fixes2.test.ts.
//   A  server/links.ts reload: in the FIRST load, a tombstone the store lists but returns nothing for is read again TOMBSTONE_REREADS (3) times,
//      TOMBSTONE_REREAD_PAUSE_MS (100) apart; still absent, the load FAILS (503, nothing applied, one log line with a count and no id) and the next
//      request starts a fresh load; a key absent through TOMBSTONE_ABSENT_LOADS (3) failed first loads in a row no longer fails it (the 4th goes on
//      without it, loud log), and every refresh reads it again as it always did. Nothing changes after the first load.
//   D  ONE private due() for ensureFresh and settleReload.
//   K  docs/ASYNC.md says what a slow first load does, what a failed one does, and A's bound.
// Route cases run on both backing stores (JSON lines, and Tigris on the fake S3); the exactly timed cases run on a bare Links with fake timers.
// LITERALS (3, 100, 60_000, ...) rather than the exported constants wherever a probe could follow a mutated constant; one test pins the constants.
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ghostId } from "../src/net/snapshot";
import { Links, TOMBSTONE_ABSENT_LOADS, TOMBSTONE_REREADS, TOMBSTONE_REREAD_PAUSE_MS } from "../server/links";
import { MemoryLinkStore, type LinkStore } from "../server/linkStore";
import { MemoryProfileStore } from "../server/profileStore";
import { StorageError } from "../server/store";
import { closeRigs, deleteMe, freshIdentity, matchAs, openRig, postGhost, readProfile, requestCode, uploadFor, type Kind, type Opts, type Rig } from "./identRig";

afterAll(closeRigs);

const KINDS: Kind[] = ["jsonl", "tigris"];
const TTL = 60_000; // the refresh time (server/links.ts TOMBSTONE_TTL_MS)
const salter = (): (() => number) => {
  let n = 0;
  return () => n++;
};
const open = (kind: Kind, over: Opts = {}) =>
  openRig(kind, { rateLimit: { windowMs: 60_000, max: 1_000_000 }, redeemLimit: { windowMs: 600_000, max: 1_000_000 }, matchSalt: salter(), ...over });
const tomb = (ids: string[], at = 1): string => JSON.stringify({ at, ids });
const lines = (log: string[], what: string): number => log.filter((l) => l.includes(what)).length;
const FAILED = "the first tombstone load failed: 1 listed tombstone(s) not found after 3 re-reads";
const WENT_ON = "went on WITHOUT";
const REFRESH_NOT_FOUND = "listed tombstone(s) not found, to be read again at the next refresh";
const UNREADABLE = "skipping an unreadable tombstone";
const REFRESH_FAILED = "tombstone refresh failed, keeping the set";

/** A spy on the tombstone reads of `rig`'s current server (take it after a restart). The first n reads of a key (counted over the spy's life) answer "nothing there". */
interface Hold {
  reads: Record<string, number>;
  total: number;
  lists: number;
  absentUntil: Map<string, number>;
  restore(): void;
}
function hold(rig: Rig): Hold {
  const store = rig.app.links.store as { get: LinkStore["get"]; list: LinkStore["list"] };
  const get = store.get.bind(store), list = store.list.bind(store);
  const h: Hold = { reads: {}, total: 0, lists: 0, absentUntil: new Map(), restore: () => { store.get = get; store.list = list; } };
  store.get = async (k: string) => {
    if (!k.startsWith("tombstones/")) return get(k);
    h.reads[k] = (h.reads[k] ?? 0) + 1;
    h.total++;
    const until = h.absentUntil.get(k);
    if (until !== undefined && h.reads[k] <= until) return null;
    return get(k);
  };
  store.list = async (p: string) => {
    if (p === "tombstones/") h.lists++;
    return list(p);
  };
  return h;
}

/** X and Y are deleted (their tombstones are in the store, as another machine's DELETEs wrote them), X has a ghost in the pool, and the server has restarted:
 *  its set is empty until a first load reads both keys. */
async function world(kind: Kind) {
  const rig = await open(kind);
  const [X, Y, Z] = [await freshIdentity(), await freshIdentity(), await freshIdentity()];
  const gX = uploadFor(X, X.playerId, { runId: "x-0" });
  expect((await postGhost(rig, X, gX)).status).toBe(201);
  for (const id of [X.playerId, Y.playerId]) await rig.app.links.store.put(`tombstones/${id}.json`, tomb([id]));
  await rig.restart();
  const h = hold(rig);
  return { rig, X, Y, Z, gX, h, kx: `tombstones/${X.playerId}.json`, ky: `tombstones/${Y.playerId}.json` };
}

/** The ghost ids a series of match requests served as `player` (a 503 serves nothing). */
async function served(rig: Rig, player: string, times: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < times; i++) {
    const r = await matchAs(rig, player);
    if (r.status === 200) ids.push(String(r.json?.id));
  }
  return ids;
}

// ============================================================================================================== A. over the routes

describe.each(KINDS)("A. the first load reads a tombstone the store lists but returns nothing for again, on %s", (kind) => {
  it("still absent after the read and its 3 re-reads, the first load FAILS: every route that needs the set answers 503 at once (one load), nothing is applied, one log line with a count and no id", async () => {
    const { rig, X, Y, Z, gX, h, kx, ky } = await world(kind);
    h.absentUntil.set(kx, Number.POSITIVE_INFINITY);
    const t0 = Date.now();
    const rs = await Promise.all([
      postGhost(rig, X, uploadFor(X, X.playerId, { runId: "x-1" })), // would be 410 if the set had X's id, 201 if it went on without it
      matchAs(rig, Z.playerId), // would serve X's ghost if the set lacked X
      requestCode(rig, Z),
      readProfile(rig, Z),
      deleteMe(rig, Z),
    ]);
    const took = Date.now() - t0;
    expect(rs.map((r) => r.status), "upload, match, code, profile read, DELETE").toEqual([503, 503, 503, 503, 503]);
    expect([h.reads[kx], h.reads[ky], h.lists], "ONE load for all five: X's key read once and re-read 3 times, Y's read once, one LIST").toEqual([4, 1, 1]);
    expect(took, "the 3 pauses of 100 ms were waited").toBeGreaterThanOrEqual(290);
    expect([rig.app.links.goneCount, rig.app.links.isGone(Y.playerId), rig.app.links.isGone(X.playerId)], "nothing applied, not even Y's, which was read well").toEqual([0, false, false]);
    expect(lines(rig.log, FAILED), "one log line for the load, not one for each request").toBe(1);
    expect(lines(rig.log, WENT_ON), "and the load did not go on").toBe(0);
    const text = rig.log.join("\n");
    for (const id of [X.playerId, Y.playerId, Z.playerId]) expect(text, "no id in the log").not.toContain(id);
    expect(text).not.toContain("tombstones/");
    // the next request starts a fresh load (the key is there now)
    h.absentUntil.clear();
    expect((await postGhost(rig, X, uploadFor(X, X.playerId, { runId: "x-2" }))).status).toBe(410);
    expect(h.lists, "a fresh load").toBe(2);
    expect(rig.app.links.goneCount).toBe(2);
    expect(await served(rig, Z.playerId, 10), "X's ghost is never served").not.toContain(ghostId(gX));
    h.restore();
  });

  it("the key is there at the third re-read: the load SUCCEEDS with it applied (X's upload is 410, its ghost is not served), and logs nothing", async () => {
    const { rig, X, Z, gX, h, kx } = await world(kind);
    h.absentUntil.set(kx, 3); // reads 1 (the read), 2 and 3 (re-reads 1 and 2) find nothing; read 4 (re-read 3) finds it
    expect((await postGhost(rig, X, uploadFor(X, X.playerId, { runId: "x-1" }))).status).toBe(410);
    expect([h.reads[kx], h.lists]).toEqual([4, 1]);
    expect(rig.app.links.goneCount, "X's and Y's ids").toBe(2);
    expect(lines(rig.log, "listed tombstone"), "a load that found everything logs nothing").toBe(0);
    expect(await served(rig, Z.playerId, 10)).not.toContain(ghostId(gX));
    h.restore();
  });

  it("the key is there at the first re-read: 2 reads, the load succeeds; it is absent at the third too: the load fails and the very next request reads it (5 reads in all) and succeeds", async () => {
    const first = await world(kind);
    first.h.absentUntil.set(first.kx, 1);
    expect((await postGhost(first.rig, first.X, uploadFor(first.X, first.X.playerId, { runId: "x-1" }))).status).toBe(410);
    expect(first.h.reads[first.kx], "the read and one re-read").toBe(2);
    first.h.restore();
    const last = await world(kind);
    last.h.absentUntil.set(last.kx, 4); // reads 1 to 4 find nothing: the read and all 3 re-reads
    expect((await postGhost(last.rig, last.X, uploadFor(last.X, last.X.playerId, { runId: "x-1" }))).status, "absent through the last re-read").toBe(503);
    expect(last.h.reads[last.kx]).toBe(4);
    expect((await postGhost(last.rig, last.X, uploadFor(last.X, last.X.playerId, { runId: "x-2" }))).status, "the fresh load reads it at once").toBe(410);
    expect([last.h.reads[last.kx], last.h.lists]).toEqual([5, 2]);
    expect(lines(last.rig.log, FAILED), "one failed load, one line").toBe(1);
    last.h.restore();
  });

  it("absent through 3 failed first loads in a row, the 4th goes on WITHOUT it (X's upload is taken, a loud line with a count and no id); the refresh reads it again, once; when it appears it is applied", async () => {
    const { rig, X, Y, Z, h, kx } = await world(kind);
    h.absentUntil.set(kx, Number.POSITIVE_INFINITY);
    for (let n = 1; n <= 3; n++) {
      expect((await postGhost(rig, X, uploadFor(X, X.playerId, { runId: `x-${n}` }))).status, `failed first load ${n}`).toBe(503);
      expect(rig.app.links.goneCount, "and nothing applied").toBe(0);
    }
    expect(h.reads[kx], "4 reads (the read and 3 re-reads) in each of the 3 loads").toBe(12);
    const up = await postGhost(rig, X, uploadFor(X, X.playerId, { runId: "x-4" }));
    expect(up.status, "the 4th load went on without X's key: the load that fails closed no longer holds 503 for good").toBe(201);
    expect([h.reads[kx], h.lists], "it read and re-read the key once more (4 reads), 4 loads").toEqual([16, 4]);
    expect(rig.app.links.isGone(Y.playerId), "Y's, which was read well, is in").toBe(true);
    expect(rig.app.links.isGone(X.playerId)).toBe(false);
    expect([lines(rig.log, FAILED), lines(rig.log, WENT_ON), lines(rig.log, REFRESH_NOT_FOUND)], "3 failed loads, one loud line, and not the refresh line").toEqual([3, 1, 0]);
    const loud = rig.log.find((l) => l.includes(WENT_ON)) ?? "";
    expect(loud, "a count").toContain("WITHOUT 1 listed tombstone(s)");
    for (const id of [X.playerId, Y.playerId, Z.playerId]) expect(rig.log.join("\n"), "no id in any line").not.toContain(id);
    // a refresh: the key is read again (once, no re-reads: nothing changes after the first load), still absent, not held
    rig.clock.now += TTL + 1;
    await rig.app.links.settleReload();
    expect(h.reads[kx], "one read by the refresh").toBe(17);
    expect(lines(rig.log, REFRESH_NOT_FOUND)).toBe(1);
    // the key appears: the next refresh reads it again and applies it
    h.absentUntil.clear();
    rig.clock.now += TTL + 1;
    await rig.app.links.settleReload();
    expect(h.reads[kx]).toBe(18);
    expect((await postGhost(rig, X, uploadFor(X, X.playerId, { runId: "x-5" }))).status, "applied at last").toBe(410);
    h.restore();
  });

  it("the old first-load expectations, as they read under the fix (adapts ident1.tombstones 'a tombstone the store lists but returns nothing for is not held'): the 4th load goes on without it, a refresh reads only that key, and then it is held", async () => {
    const rig = await open(kind);
    const ids = ["Aa", "Bb", "Cc"].map((t, n) => `${t}${n}${"x".repeat(30)}`);
    for (const id of ids) await rig.app.links.store.put(`tombstones/${id}.json`, tomb([id]));
    await rig.restart();
    const h = hold(rig);
    const kb = `tombstones/${ids[1]}.json`;
    h.absentUntil.set(kb, Number.POSITIVE_INFINITY);
    for (let n = 0; n < 3; n++) {
      await rig.app.links.settleReload();
      expect(rig.app.links.goneCount, `failed first load ${n + 1}: nothing applied`).toBe(0);
    }
    await rig.app.links.settleReload();
    expect([h.total, rig.app.links.goneCount, rig.app.links.isGone(ids[1])], "4 loads of 3 reads and 3 re-reads, two ids in the set").toEqual([24, 2, false]);
    h.absentUntil.clear();
    h.total = 0;
    rig.clock.now += TTL + 1;
    await rig.app.links.settleReload();
    expect([h.total, h.reads[kb], rig.app.links.goneCount], "the refresh reads that key again and only that one (16 reads before, 17 now), and all three are in the set").toEqual([1, 17, 3]);
    h.total = 0;
    rig.clock.now += TTL + 1;
    await rig.app.links.settleReload();
    expect(h.total, "and then it is held").toBe(0);
    h.restore();
  });

  it("the old log expectations, as they read under the fix (adapts vident2.tombstones 'the reload's log lines carry no id and no key'): the unreadable one is logged once by the load that succeeds, no line carries an id", async () => {
    const rig = await open(kind);
    const ids = ["Pa", "Pb", "Pc", "Pd"].map((t, n) => `${t}${n}${"x".repeat(30)}`);
    for (const id of ids) await rig.app.links.store.put(`tombstones/${id}.json`, tomb([id]));
    await rig.app.links.store.put("tombstones/junk.json", "{this is not a tombstone");
    await rig.restart();
    const h = hold(rig);
    h.absentUntil.set(`tombstones/${ids[1]}.json`, Number.POSITIVE_INFINITY);
    for (let n = 0; n < 4; n++) await rig.app.links.settleReload(); // 3 failed first loads, then the one that goes on
    h.absentUntil.clear();
    rig.clock.now += TTL + 1;
    (rig.app.links.store as { list: LinkStore["list"] }).list = async () => {
      throw new StorageError("identity list failed: HTTP 500");
    };
    await rig.app.links.settleReload(); // a failed refresh
    h.restore();
    const text = rig.log.join("\n");
    expect([lines(rig.log, UNREADABLE), lines(rig.log, "1 listed tombstone(s) not found"), lines(rig.log, REFRESH_FAILED)], "the failed loads log only their count; the loud line has one too").toEqual([1, 4, 1]);
    for (const id of ids) expect(text, "no tombstone id in the log").not.toContain(id);
    expect(text).not.toContain("tombstones/");
    expect(text).not.toContain("junk");
  });
});

// ============================================================================================================== A. exactly timed, on a bare Links

interface Bare {
  links: Links;
  inner: MemoryLinkStore;
  log: string[];
  s: {
    clock: number;
    listNo: number;
    getsThisLoad: number;
    gets: string[];
    latency: number;
    failList: boolean;
    absent: (key: string, load: number) => boolean;
    readError: (key: string, nthInLoad: number, load: number) => boolean;
  };
}
function bare(): Bare {
  const inner = new MemoryLinkStore();
  const log: string[] = [];
  const s: Bare["s"] = { clock: 1_000_000, listNo: 0, getsThisLoad: 0, gets: [], latency: 0, failList: false, absent: () => false, readError: () => false };
  const nap = (): Promise<void> => (s.latency ? new Promise<void>((resolve) => setTimeout(resolve, s.latency)) : Promise.resolve());
  const store: LinkStore = {
    async get(k) {
      if (k.startsWith("tombstones/")) {
        s.gets.push(k);
        s.getsThisLoad++;
        await nap();
        if (s.readError(k, s.getsThisLoad, s.listNo)) throw new StorageError("identity read failed: HTTP 500");
        if (s.absent(k, s.listNo)) return null;
      }
      return inner.get(k);
    },
    put: (k, t) => inner.put(k, t),
    delete: (k) => inner.delete(k),
    async list(p) {
      if (p === "tombstones/") {
        s.listNo++;
        s.getsThisLoad = 0;
        await nap();
        if (s.failList) throw new StorageError("identity list failed: HTTP 500");
      }
      return inner.list(p);
    },
  };
  const links = new Links(store, new MemoryProfileStore(), { now: () => s.clock, log: (l) => log.push(l) });
  return { links, inner, log, s };
}

type Verdict = "ok" | "503" | "other";
/** One ensureFresh, with the fake timers moved `ms` on: what it ended as. */
async function attempt(links: Links, ms = 300): Promise<Verdict> {
  const p = links.ensureFresh().then((): Verdict => "ok", (e: unknown): Verdict => (e instanceof StorageError ? "503" : "other"));
  await vi.advanceTimersByTimeAsync(ms);
  return p;
}

describe("A. exactly timed, on a bare Links with fake timers", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("the constants: 3 re-reads, 100 ms apart, 3 failed loads in a row (the other tests follow these literals)", () => {
    expect([TOMBSTONE_REREADS, TOMBSTONE_REREAD_PAUSE_MS, TOMBSTONE_ABSENT_LOADS]).toEqual([3, 100, 3]);
  });

  it("the first re-read comes at 100 ms and not at 99, the second at 200, the third at 300; then the load fails", async () => {
    const b = bare();
    await b.inner.put("tombstones/Kk.json", tomb(["Kk"]));
    b.s.absent = () => true;
    const p = b.links.ensureFresh().then((): Verdict => "ok", (e: unknown): Verdict => (e instanceof StorageError ? "503" : "other"));
    const steps: [number, number][] = [[0, 1], [99, 1], [1, 2], [99, 2], [1, 3], [99, 3], [1, 4]]; // [ms to move on, reads so far]
    for (const [ms, reads] of steps) {
      await vi.advanceTimersByTimeAsync(ms);
      expect(b.s.gets.length, `after ${ms} ms more`).toBe(reads);
    }
    expect(await p).toBe("503");
    expect(vi.getTimerCount(), "no timer is left behind").toBe(0);
    expect(b.links.goneCount).toBe(0);
  });

  it("two requests that wait for the same failing first load get the same StorageError, from one LIST; the message and the log carry no id", async () => {
    const b = bare();
    await b.inner.put("tombstones/Kk.json", tomb(["Kk"]));
    b.s.absent = () => true;
    const both = Promise.all([b.links.ensureFresh().catch((e: unknown) => e), b.links.ensureFresh().catch((e: unknown) => e)]);
    await vi.advanceTimersByTimeAsync(300);
    const [a, c] = await both;
    expect(a).toBeInstanceOf(StorageError);
    expect(c).toBe(a);
    expect((a as StorageError).message).not.toContain("Kk");
    expect(b.s.listNo).toBe(1);
    expect(b.log).toHaveLength(1);
    expect(b.log[0]).not.toContain("Kk");
  });

  it("the failed loads are counted per key and IN A ROW: a key found in between starts over, and the load goes on only when every absent key is past its 3 failed loads", async () => {
    const b = bare();
    for (const id of ["Kk", "Mm"]) await b.inner.put(`tombstones/${id}.json`, tomb([id]));
    const plan: Record<number, string[]> = { 1: ["Kk"], 2: ["Kk"], 3: ["Mm"], 4: ["Kk", "Mm"], 5: ["Kk", "Mm"], 6: ["Kk", "Mm"], 7: ["Kk", "Mm"] };
    b.s.absent = (k, load) => (plan[load] ?? []).some((id) => k === `tombstones/${id}.json`);
    const results: Verdict[] = [];
    for (let n = 1; n <= 7; n++) results.push(await attempt(b.links));
    // Kk: absent in loads 1 and 2, found in 3 (forgotten), absent from 4 on: past its 3 failed loads at the 7th. Mm: first absent in 3, then in a row
    expect(results).toEqual(["503", "503", "503", "503", "503", "503", "ok"]);
    expect(b.links.goneCount, "neither tombstone was readable").toBe(0);
    expect([lines(b.log, "the first tombstone load failed"), lines(b.log, WENT_ON)]).toEqual([6, 1]);
    expect(lines(b.log, "WITHOUT 2 listed tombstone(s)"), "the loud line counts both").toBe(1);
    // a refresh now finds both: held after the next successful read
    b.s.absent = () => false;
    b.s.clock += TTL;
    await b.links.settleReload();
    expect([b.links.isGone("Kk"), b.links.isGone("Mm")]).toEqual([true, true]);
  });

  it("a load that fails for another reason (a read error) neither counts as a failed load for the key nor resets its count", async () => {
    const b = bare();
    await b.inner.put("tombstones/Kk.json", tomb(["Kk"]));
    b.s.absent = () => true;
    b.s.readError = (_k, nth, load) => load === 2 && nth === 1; // the 2nd load's first read fails
    const results: Verdict[] = [];
    for (let n = 1; n <= 5; n++) results.push(await attempt(b.links));
    // load 1 counts (1), load 2 is the read error (no count), loads 3 and 4 count (2, 3), load 5 is past its 3 failed loads
    expect(results).toEqual(["503", "503", "503", "503", "ok"]);
    expect([lines(b.log, "the first tombstone load failed"), lines(b.log, WENT_ON)], "3 absent-key failures, the read error is the route's 503 only").toEqual([3, 1]);
  });

  it("a re-read that fails fails the load with that error (503), nothing applied", async () => {
    const b = bare();
    await b.inner.put("tombstones/Kk.json", tomb(["Kk"]));
    await b.inner.put("tombstones/Ok.json", tomb(["Ok"]));
    b.s.absent = (k) => k === "tombstones/Kk.json";
    b.s.readError = (k, _nth, load) => load === 1 && k === "tombstones/Kk.json" && b.s.getsThisLoad === 3; // the first re-read (the 3rd read of the load: Ok, Kk, then Kk again)
    expect(await attempt(b.links)).toBe("503");
    expect(b.links.goneCount, "the readable tombstone of the same load is not applied either").toBe(0);
    expect(lines(b.log, "the first tombstone load failed"), "not an absent-key failure").toBe(0);
  });

  it("the worst-case 503 time: one absent key at 20 ms a store request is 400 ms a failed load (LIST 20 + read 20 + 3 x (100 + 20)); 4 loads are 1.6 s, and 16.6 s with the 5 s a client waits between tries", async () => {
    const b = bare();
    await b.inner.put("tombstones/Kk.json", tomb(["Kk"]));
    b.s.absent = () => true;
    b.s.latency = 20;
    const timed = async (): Promise<{ v: Verdict; ms: number }> => {
      const done: { v: Verdict | null } = { v: null };
      const p = b.links.ensureFresh().then(() => void (done.v = "ok"), () => void (done.v = "503"));
      let ms = 0;
      while (done.v === null && ms < 60_000) {
        await vi.advanceTimersByTimeAsync(10);
        ms += 10;
      }
      await p;
      return { v: done.v ?? "other", ms };
    };
    const loads: { v: Verdict; ms: number }[] = [];
    for (let n = 0; n < 4; n++) loads.push(await timed());
    expect(loads, "3 failed loads and the one that goes on, 400 ms each").toEqual([{ v: "503", ms: 400 }, { v: "503", ms: 400 }, { v: "503", ms: 400 }, { v: "ok", ms: 400 }]);
    expect(loads.reduce((s, l) => s + l.ms, 0), "requests that keep coming").toBe(1_600);
    expect(loads.reduce((s, l) => s + l.ms, 0) + 3 * 5_000, "a client that waits retry-after (5 s) between tries").toBe(16_600);
  });

  it("nothing changes after the first load: a refresh finds a listed key absent and reads it ONCE (no re-read, no pause, no failure), logs the refresh line, and does not hold it", async () => {
    const b = bare();
    await b.inner.put("tombstones/Aa.json", tomb(["Aa"]));
    expect(await attempt(b.links)).toBe("ok");
    await b.inner.put("tombstones/Kk.json", tomb(["Kk"]));
    b.s.absent = (k) => k === "tombstones/Kk.json";
    b.s.gets.length = 0;
    b.s.clock += 60_000;
    expect(await attempt(b.links, 0), "the refresh resolves").toBe("ok");
    await b.links.settleReload();
    expect(b.s.gets, "one read of the new key").toEqual(["tombstones/Kk.json"]);
    expect(vi.getTimerCount(), "no pause timer").toBe(0);
    expect(lines(b.log, REFRESH_NOT_FOUND)).toBe(1);
    expect(lines(b.log, "the first tombstone load failed") + lines(b.log, WENT_ON)).toBe(0);
    b.s.gets.length = 0;
    b.s.clock += 60_000;
    await b.links.settleReload();
    expect(b.s.gets, "not held: read again at the next refresh").toEqual(["tombstones/Kk.json"]);
  });
});

// ============================================================================================================== D. one due()

describe("D. ensureFresh and settleReload decide 'is a reload due?' with ONE predicate", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(["ensureFresh", "settleReload"] as const)("%s: a reload is due at exactly the refresh time (60 s after the last good one BEGAN), not 1 ms before; 5 s after a failed one, not 1 ms before; and always before the first has succeeded", async (fn) => {
    const b = bare();
    await b.inner.put("tombstones/Aa.json", tomb(["Aa"]));
    const t0 = b.s.clock;
    const call = async (at: number): Promise<number> => {
      b.s.clock = at;
      await b.links[fn]();
      return b.s.listNo;
    };
    // never loaded: due, and a first load that fails leaves it due (ensureFresh rejects, settleReload does not)
    b.s.failList = true;
    await b.links[fn]().catch(() => undefined);
    expect(b.s.listNo, "a failed first load").toBe(1);
    b.s.failList = false;
    expect(await call(t0), "due again at once: no set was ever loaded").toBe(2);
    for (const [at, lists] of [[59_999, 2], [60_000, 3], [60_001, 3], [119_999, 3], [120_000, 4]] as const) {
      expect(await call(t0 + at), `at +${at} ms`).toBe(lists);
    }
    // a failed refresh at +180 s: the retry is due 5 s later, to the millisecond
    b.s.failList = true;
    expect(await call(t0 + 180_000), "the refresh is due and fails").toBe(5);
    expect(b.log.some((l) => l.includes(REFRESH_FAILED))).toBe(true);
    b.s.failList = false;
    expect(await call(t0 + 184_999), "4.999 s on").toBe(5);
    expect(await call(t0 + 185_000), "5 s on").toBe(6);
    expect(await call(t0 + 185_001), "and then a refresh time is waited again").toBe(6);
  });

  it("through a route, ensureFresh alone (no settleReload): a tombstone another machine wrote is seen at exactly the refresh time, not 1 ms before", async () => {
    vi.useRealTimers();
    const rig = await open("jsonl");
    const X = await freshIdentity();
    expect((await postGhost(rig, X, uploadFor(X, X.playerId, { runId: "x-0" }))).status, "the first load, at t0").toBe(201);
    const t0 = rig.clock.now;
    await rig.app.links.store.put(`tombstones/${X.playerId}.json`, tomb([X.playerId]));
    rig.clock.now = t0 + 59_999;
    expect((await postGhost(rig, X, uploadFor(X, X.playerId, { runId: "x-1" }))).status, "1 ms before the refresh time").toBe(201);
    rig.clock.now = t0 + 60_000;
    expect((await postGhost(rig, X, uploadFor(X, X.playerId, { runId: "x-2" }))).status, "at the refresh time: this request's ensureFresh reloaded").toBe(410);
  });

  it("structure: links.ts has ONE due() and both functions call it (the predicate is written once)", () => {
    const src = readFileSync("server/links.ts", "utf8"); // (vitest runs from the repository root)
    expect(src.match(/private due\(\): boolean/g)?.length, "one definition").toBe(1);
    expect(src.match(/this\.goneLoadedAt >= 0 && this\.now\(\) - this\.goneLoadedAt/g)?.length, "the comparison is written once").toBe(1);
    const body = (name: string): string => {
      const from = src.indexOf(`async ${name}(): Promise<void> {`);
      return src.slice(from, src.indexOf("\n  }\n", from));
    };
    expect(body("ensureFresh")).toContain("this.due()");
    expect(body("settleReload")).toContain("this.due()");
  });
});

// ============================================================================================================== K. the docs

describe("K. docs/ASYNC.md says what a slow, a failed and a bounded first load do", () => {
  it("the tombstone-set paragraph", () => {
    const doc = readFileSync("docs/ASYNC.md", "utf8").replace(/\s+/g, " ");
    const at = doc.indexOf("**The tombstone set**");
    expect(at).toBeGreaterThan(0);
    const para = doc.slice(at, doc.indexOf("**", at + 30));
    expect(para, "a slow first load: waited for in full, unbounded by design, then succeeds").toContain("A slow first load is waited for in full");
    expect(para).toContain("however long it takes (unbounded by design), and then goes on");
    expect(para, "a failed one: 503, nothing applied, a fresh load").toContain("A first load that fails");
    expect(para).toContain("answers 503 to every request that waited for it, applies nothing, and the next request starts a fresh load");
    expect(para, "A's bound: the numbers are the constants'").toContain(`is read again inside the first load, ${TOMBSTONE_REREADS} times, ${TOMBSTONE_REREAD_PAUSE_MS} ms apart`);
    expect(para).toContain(`absent through ${TOMBSTONE_ABSENT_LOADS} failed first loads in a row no longer fails the load`);
    expect(para).toContain("with a loud log line (a count, no id), and every refresh reads it again");
    expect(para, "the worst case").toContain("about 1.6 s when requests keep coming, and about 17 s for a client that waits the 5 s of `retry-after`");
  });
});
