// VERIFY-IDENT2 (REQ-BFG-122) step 4, item g (the fixes A, B, D and K of IDENT-2), written by the independent re-checker H-F. ATTACKS that tests/ident2.fixes*.test.ts
// do not make; nothing in them is repeated. Tests that pass pin what was observed; "FINDING:" names behaviour that breaks the brief, "NOTE:" is worth knowing.
//   4g-A  server/links.ts :77-84, reload, rereadAbsent
//         - the time of a failed first load by SIZE (the doc's 0.4 s holds for up to 8 tombstones; every failed load reads ALL the tombstones again)
//         - the client's timeline (503 at 0.4, 5.8, 11.2 s; the first success at 16.6 s), simulated with fake timers and a 5 s retry-after
//         - the per-key counter: keys absent in turn (a chain), keys that flap, a LIST error between two absent loads, a key that is not listed any more,
//           a key that appears at the third re-read, one that is found but unreadable, the found key's ids when another key stays absent
//         - the refresh that keeps re-reading, the log lines (a count, no id) with several keys, on both stores
//   4g-B  linkStore.ts :104 and ghost-admin's tombstoned(): name variants, a stray DIRECTORY with a valid name, the history store's own list
//   4g-D  ensureFresh and settleReload decide alike: a seeded differential run over random clock jumps and LIST failures, with several refresh times
//   4g-K  docs/ASYNC.md :719-742: every number in the tombstone-set paragraph against the code
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JsonlAdmin, runAdmin } from "../server/ghostAdmin";
import { FileHistoryStore } from "../server/historyStore";
import {
  Links, TOMBSTONE_ABSENT_LOADS, TOMBSTONE_FULL_READ_MS, TOMBSTONE_READS_IN_FLIGHT, TOMBSTONE_REREADS, TOMBSTONE_REREAD_PAUSE_MS, TOMBSTONE_WAIT_MS,
} from "../server/links";
import { FileLinkStore, MemoryLinkStore, type LinkStore } from "../server/linkStore";
import { MemoryProfileStore } from "../server/profileStore";
import { StorageError } from "../server/store";
import { closeRigs, freshIdentity, linkSteamCall, linkVia, openRig, postGhost, requestCode, theFake, uploadFor, fakeSteam, deleteMe, type Kind, type Opts, type Rig } from "./identRig";
import { FINISHED, entryFor, historyObjects, markRequests, opsSince, putEntry } from "./ident2Rig";
import { encodeEntry } from "../src/net/historyWire";
import { nameOf } from "../server/historyStore";

afterAll(closeRigs);

const KINDS: Kind[] = ["jsonl", "tigris"];
const TTL = 60_000; // the refresh time (server/links.ts TOMBSTONE_TTL_MS, not exported)
const tomb = (ids: string[], at = 1): string => JSON.stringify({ at, ids });
const lines = (log: string[], what: string): number => log.filter((l) => l.includes(what)).length;
const FAILED = "the first tombstone load failed";
const WENT_ON = "went on WITHOUT";
const REFRESH_NOT_FOUND = "listed tombstone(s) not found, to be read again at the next refresh";
const UNREADABLE = "skipping an unreadable tombstone";
const open = (kind: Kind, over: Opts = {}) =>
  openRig(kind, { rateLimit: { windowMs: 60_000, max: 1_000_000 }, redeemLimit: { windowMs: 600_000, max: 1_000_000 }, ...over });

// ================================================================================================================ a bare Links, scripted per load

type Verdict = "ok" | "503" | "other";
interface Bare {
  links: Links;
  inner: MemoryLinkStore;
  log: string[];
  s: {
    clock: number;
    /** The number of tombstones/ LISTs so far (a first load is one LIST, so this is the load's number). */
    listNo: number;
    reads: string[];
    latency: number;
    failList: (load: number) => boolean;
    /** A key the LIST leaves out in this load. */
    hide: (key: string, load: number) => boolean;
    /** What a read answers instead of the stored text: null = nothing there, a string = that text, undefined = the stored text. nth: the n-th read of this key in this load (1 = the read, 2..4 = the re-reads). */
    override: (key: string, load: number, nth: number) => string | null | undefined;
    readError: (key: string, load: number, nth: number) => boolean;
  };
}
function bare(opts: { latency?: number; ttl?: number } = {}): Bare {
  const inner = new MemoryLinkStore();
  const log: string[] = [];
  const perKey = new Map<string, number>();
  const s: Bare["s"] = {
    clock: 1_000_000, listNo: 0, reads: [], latency: opts.latency ?? 0,
    failList: () => false, hide: () => false, override: () => undefined, readError: () => false,
  };
  const nap = (): Promise<void> => (s.latency ? new Promise<void>((resolve) => setTimeout(resolve, s.latency)) : Promise.resolve());
  const store: LinkStore = {
    async get(k) {
      if (k.startsWith("tombstones/")) {
        s.reads.push(k);
        const nth = (perKey.get(k) ?? 0) + 1;
        perKey.set(k, nth);
        await nap();
        if (s.readError(k, s.listNo, nth)) throw new StorageError("identity read failed: HTTP 500");
        const o = s.override(k, s.listNo, nth);
        if (o !== undefined) return o;
      }
      return inner.get(k);
    },
    put: (k, t) => inner.put(k, t),
    delete: (k) => inner.delete(k),
    async list(p) {
      if (p === "tombstones/") {
        s.listNo++;
        perKey.clear();
        await nap();
        if (s.failList(s.listNo)) throw new StorageError("identity list failed: HTTP 500");
        return (await inner.list(p)).filter((k) => !s.hide(k, s.listNo));
      }
      return inner.list(p);
    },
  };
  const links = new Links(store, new MemoryProfileStore(), { now: () => s.clock, log: (l) => log.push(l), ...(opts.ttl !== undefined ? { tombstoneTtlMs: opts.ttl } : {}) });
  return { links, inner, log, s };
}
const keyOf = (id: string): string => `tombstones/${id}.json`;
const ids = (n: number, tag = "k"): string[] => Array.from({ length: n }, (_, i) => `${tag}${String(i + 1).padStart(4, "0")}`);
const fill = async (b: Bare, list: readonly string[]): Promise<void> => {
  for (const id of list) await b.inner.put(keyOf(id), tomb([id]));
};
const peekCounts = (l: Links): Record<string, number> => Object.fromEntries((l as unknown as { firstAbsent: Map<string, number> }).firstAbsent);

/** One ensureFresh under fake timers, stepped 10 ms at a time: its verdict and how many ms it took. */
async function timed(links: Links, cap = 600_000): Promise<{ v: Verdict; ms: number }> {
  const done: { v: Verdict | null } = { v: null };
  const p = links.ensureFresh().then(() => void (done.v = "ok"), (e: unknown) => void (done.v = e instanceof StorageError ? "503" : "other"));
  let ms = 0;
  await vi.advanceTimersByTimeAsync(0); // (a call that needs no wait is answered without the clock moving: 0 ms)
  while (done.v === null && ms < cap) {
    await vi.advanceTimersByTimeAsync(10);
    ms += 10;
  }
  await p;
  return { v: done.v ?? "other", ms };
}

describe("4g-A. the first load, exactly timed, on a bare Links with fake timers (20 ms a store request)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // [tombstones listed, of them absent for good, ms of ONE failed load]: LIST 20 + ceil(listed/8) read rounds of 20 + 3 x (100 pause + ceil(absent/8) rounds of 20)
  const SIZES: [number, number, number][] = [[1, 1, 400], [8, 8, 400], [9, 9, 480], [16, 16, 480], [17, 17, 560], [100, 1, 640], [1000, 1, 2880]];
  it.each(SIZES)("NOTE: a failed first load with %i tombstones listed, %i of them absent, takes %i ms: the doc's 0.4 s holds for up to 8 tombstones only (every failed load reads ALL of them again)", async (listed, absent, ms) => {
    const b = bare({ latency: 20 });
    await fill(b, ids(listed));
    const missing = new Set(ids(listed).slice(0, absent).map(keyOf));
    b.s.override = (k) => (missing.has(k) ? null : undefined);
    const first = await timed(b.links);
    expect(first, `${listed} listed, ${absent} absent`).toEqual({ v: "503", ms });
    // the SECOND failed load costs the same again: nothing was held after the first, so every key is read once more
    b.s.reads.length = 0;
    const second = await timed(b.links);
    expect(second.ms).toBe(ms);
    expect(b.s.reads.length, "reads of the second load: every listed key once, and 3 re-reads of each absent one").toBe(listed + 3 * absent);
  });

  it("NOTE: IDENT2-REPORT section 5 says 'each 8 more absent keys add 60 ms to a load'; it is 80 ms (the 3 re-read rounds add 60 and the first read round adds 20 more)", async () => {
    const ms: number[] = [];
    for (const n of [8, 16, 24]) {
      const b = bare({ latency: 20 });
      await fill(b, ids(n));
      b.s.override = () => null;
      ms.push((await timed(b.links)).ms);
    }
    expect(ms).toEqual([400, 480, 560]);
    expect([ms[1] - ms[0], ms[2] - ms[1]]).toEqual([80, 80]);
  });

  it("the client's timeline: 503 at 0.4 s, 5.8 s and 11.2 s, the first success at 16.6 s (a 5 s retry-after between tries; one absent key, 20 ms a request)", async () => {
    const b = bare({ latency: 20 });
    await fill(b, ["Kk"]);
    b.s.override = () => null;
    const timeline: [Verdict, number][] = [];
    let elapsed = 0;
    for (let n = 0; n < 4; n++) {
      const r = await timed(b.links);
      elapsed += r.ms;
      timeline.push([r.v, elapsed]);
      if (r.v === "ok") break;
      await vi.advanceTimersByTimeAsync(5_000); // the client waits the retry-after
      elapsed += 5_000;
    }
    expect(timeline).toEqual([["503", 400], ["503", 5_800], ["503", 11_200], ["ok", 16_600]]);
    expect(lines(b.log, WENT_ON), "the fourth load went on without the key, loudly").toBe(1);
  });

  it("the same timeline at 1,000 tombstones with one absent: 503 at 2.9 s, 8.8 s and 14.6 s and the first success at 26.5 s, not 17 s (the doc's figure is for a handful of tombstones)", async () => {
    const b = bare({ latency: 20 });
    await fill(b, ids(1000));
    b.s.override = (k) => (k === keyOf("k0001") ? null : undefined);
    const timeline: [Verdict, number][] = [];
    let elapsed = 0;
    for (let n = 0; n < 4; n++) {
      const r = await timed(b.links);
      elapsed += r.ms;
      timeline.push([r.v, elapsed]);
      if (r.v === "ok") break;
      await vi.advanceTimersByTimeAsync(5_000);
      elapsed += 5_000;
    }
    // load = 20 + 125 x 20 + 3 x 120 = 2880 ms; the 4th load reads all 1,000 once and the absent key 3 times more, then goes on
    expect(timeline).toEqual([["503", 2_880], ["503", 10_760], ["503", 18_640], ["ok", 26_520]]);
    expect(b.links.goneCount, "999 tombstones applied by the load that went on").toBe(999);
  });

  it("a key that is there at the THIRD re-read is read in time: the load takes the full 400 ms and succeeds with the key applied; a key that comes at the fourth is too late", async () => {
    const early = bare({ latency: 20 });
    await fill(early, ["Kk"]);
    early.s.override = (_k, _load, nth) => (nth <= 3 ? null : undefined); // reads 1 (the read), 2 and 3 (re-reads 1 and 2) find nothing; read 4 (re-read 3) finds it
    expect(await timed(early.links)).toEqual({ v: "ok", ms: 400 });
    expect([early.links.isGone("Kk"), early.log]).toEqual([true, []]);
    const late = bare({ latency: 20 });
    await fill(late, ["Kk"]);
    late.s.override = (_k, load, nth) => (load === 1 && nth <= 4 ? null : undefined); // the first load makes 4 reads of the key, all empty; the key is there in the next
    expect(await timed(late.links)).toEqual({ v: "503", ms: 400 });
    expect(late.links.isGone("Kk")).toBe(false);
    expect(await timed(late.links), "and the very next load reads it at once").toEqual({ v: "ok", ms: 40 });
    expect(late.links.isGone("Kk")).toBe(true);
  });

  it("a key found at a re-read whose text is no tombstone is held and logged once, and the load succeeds at the re-read (160 ms); a refresh then reads it no more", async () => {
    const b = bare({ latency: 20 });
    await fill(b, ["Aa", "Kk"]);
    b.s.override = (k, _l, nth) => (k === keyOf("Kk") ? (nth === 1 ? null : "{this is not a tombstone") : undefined);
    expect(await timed(b.links)).toEqual({ v: "ok", ms: 20 + 20 + 100 + 20 });
    expect([b.links.isGone("Aa"), b.links.isGone("Kk"), b.links.goneCount]).toEqual([true, false, 1]);
    expect(lines(b.log, UNREADABLE)).toBe(1);
    b.s.reads.length = 0;
    b.s.clock += TTL;
    expect((await timed(b.links)).v).toBe("ok");
    expect(b.s.reads, "held: not read by the refresh").toEqual([]);
  });

  it("a key found at the third re-read while ANOTHER key stays absent: the load fails, and the found key's ids are NOT applied (nothing is applied by a failed load); the next load applies them", async () => {
    const b = bare({ latency: 20 });
    await fill(b, ["Found", "Stuck"]);
    b.s.override = (k, load, nth) => (k === keyOf("Stuck") ? null : k === keyOf("Found") && load === 1 && nth <= 3 ? null : undefined);
    expect((await timed(b.links)).v).toBe("503");
    expect([b.links.isGone("Found"), b.links.goneCount], "nothing applied").toEqual([false, 0]);
    expect(peekCounts(b.links), "only the key that stayed absent is counted").toEqual({ [keyOf("Stuck")]: 1 });
    expect((await timed(b.links)).v).toBe("503");
    expect(peekCounts(b.links)).toEqual({ [keyOf("Stuck")]: 2 });
    expect((await timed(b.links)).v).toBe("503");
    const last = await timed(b.links);
    expect(last.v, "the fourth load goes on without Stuck").toBe("ok");
    expect([b.links.isGone("Found"), b.links.isGone("Stuck")]).toEqual([true, false]);
    expect(peekCounts(b.links), "emptied by the load that succeeded").toEqual({});
  });
});

describe("4g-A. the per-key counter (firstAbsent): keys absent in turn, keys that flap, a LIST error, a key that is not listed any more", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const run = async (b: Bare, loads: number): Promise<Verdict[]> => {
    const out: Verdict[] = [];
    for (let n = 0; n < loads; n++) {
      const v = (await timed(b.links)).v;
      out.push(v);
      if (v === "ok") break;
    }
    return out;
  };

  it("NOTE: keys that turn absent IN TURN (k1 from load 1, k2 from load 4, k3 from load 7, ... and each stays absent) keep the first load at 503 for 3 loads per key: 4 keys = 12 failed loads, the 13th goes on; a client that waits 5 s sees 503 for about a minute", async () => {
    // A key that stays absent through 3 failed loads in a row no longer FAILS the load, but a key that has just turned absent has a count of 0 and does: the first
    // load goes on only when no absent key is still within its 3 failed loads. So the bound 'at most 3 failed loads' holds for a STATIC absent set (4 loads in all);
    // for a set that grows by one persistent key every third load there is no bound. BRIEF-IDENT2 A: 'a key that stays listed but absent through 3 consecutive failed
    // first loads ... no longer fails the load'; 'so the first load never holds 503 forever' -- true for any fixed store state, not for a store that keeps producing new ones.
    const b = bare({ latency: 20 });
    const list = ids(4);
    await fill(b, list);
    b.s.override = (k, load) => {
      const i = list.findIndex((id) => keyOf(id) === k); // 0-based
      return load >= 3 * i + 1 ? null : undefined; // k(i+1) is absent from load 3i+1 on
    };
    const verdicts: Verdict[] = [];
    let work = 0;
    for (let n = 0; n < 40; n++) {
      const r = await timed(b.links);
      verdicts.push(r.v);
      work += r.ms;
      if (r.v === "ok") break;
    }
    expect(verdicts.filter((v) => v === "503")).toHaveLength(12);
    expect(verdicts[12]).toBe("ok");
    expect(verdicts).toHaveLength(13);
    expect(lines(b.log, FAILED)).toBe(12);
    expect(lines(b.log, "WITHOUT 4 listed tombstone(s)"), "the loud line counts all four").toBe(1);
    // the time: 13 loads of 400 ms (4 keys fit one read round) = 5.2 s of work, and 12 waits of the 5 s retry-after: the first success at 65.2 s, against the doc's 17 s
    expect(work).toBe(5_200);
    expect(work + 12 * 5_000).toBe(65_200);
  });

  it("a key that turns absent only AFTER the first load has succeeded changes nothing: the first load went on without k1 at load 4, k2 turns absent at load 5 (a refresh's business)", async () => {
    const b = bare({ latency: 20 });
    const list = ids(2);
    await fill(b, list);
    b.s.override = (k, load) => (k === keyOf(list[0]) ? null : load >= 5 ? null : undefined); // k2 turns absent at load 5; the first load succeeded at load 4
    const verdicts = await run(b, 10);
    expect(verdicts).toEqual(["503", "503", "503", "ok"]);
    expect(b.links.goneCount, "k2 was found, k1 was gone on without").toBe(1);
    expect(peekCounts(b.links)).toEqual({});
  });

  it("NOTE: two keys that FLAP (k1 absent on odd loads, k2 on even loads) never reach 3 in a row: the first load stays 503 for as long as it goes on (30 loads here), and succeeds at once when it stops", async () => {
    const b = bare({ latency: 0 });
    await fill(b, ["Aa", "Bb"]);
    b.s.override = (k, load) => (k === keyOf("Aa") ? (load % 2 === 1 ? null : undefined) : load % 2 === 0 ? null : undefined);
    const verdicts = await run(b, 30);
    expect(verdicts).toEqual(Array(30).fill("503"));
    expect(peekCounts(b.links), "each count is forgotten by the next load: 1 and never more").toEqual({ [keyOf("Bb")]: 1 });
    expect(b.links.goneCount).toBe(0);
    b.s.override = () => undefined; // the listing catches up
    expect((await timed(b.links)).v).toBe("ok");
    expect(b.links.goneCount).toBe(2);
  });

  it("a LIST error between two absent loads CARRIES the count: absent (1), LIST error, absent (2), LIST error, absent (3), then the load goes on: six loads, and the errors count as no failed load", async () => {
    const b = bare();
    await fill(b, ["Kk"]);
    b.s.override = () => null;
    b.s.failList = (load) => load === 2 || load === 4;
    const verdicts = await run(b, 10);
    expect(verdicts).toEqual(["503", "503", "503", "503", "503", "ok"]);
    expect(lines(b.log, FAILED), "three absent-key failures; the LIST errors are the route's 503 only").toBe(3);
    expect(lines(b.log, WENT_ON)).toBe(1);
    expect(b.s.reads, "reads: 4 in each of the 3 absent loads and 4 in the one that went on").toHaveLength(16);
  });

  it("a read error in a RE-READ fails the load and CARRIES the count as well (the count is untouched until the load has its answers)", async () => {
    const b = bare();
    await fill(b, ["Kk"]);
    b.s.override = () => null;
    b.s.readError = (_k, load, nth) => load === 2 && nth === 3; // the second re-read of the second load
    const verdicts = await run(b, 10);
    expect(verdicts).toEqual(["503", "503", "503", "503", "ok"]);
    expect(lines(b.log, FAILED), "loads 1, 3 and 4 count; load 2 died of the read error").toBe(3);
  });

  it("a key that is no longer LISTED is forgotten: absent in loads 1 and 2, gone from the listing at load 3 (the load succeeds), the counter is emptied", async () => {
    const b = bare();
    await fill(b, ["Aa", "Kk"]);
    b.s.override = (k) => (k === keyOf("Kk") ? null : undefined);
    b.s.hide = (k, load) => k === keyOf("Kk") && load === 3;
    expect(await run(b, 2)).toEqual(["503", "503"]);
    expect(peekCounts(b.links)).toEqual({ [keyOf("Kk")]: 2 });
    expect((await timed(b.links)).v, "not listed, nothing absent: the load succeeds").toBe("ok");
    expect(peekCounts(b.links)).toEqual({});
    expect([b.links.isGone("Aa"), b.links.goneCount]).toEqual([true, 1]);
  });

  it("a key that was found in between starts again at 0: absent 1, 2; found at 3 while ANOTHER key is absent; absent again from 4: it needs three more failed loads", async () => {
    const b = bare();
    await fill(b, ["Kk", "Mm"]);
    b.s.override = (k, load) => {
      if (k === keyOf("Kk")) return load <= 2 || load >= 4 ? null : undefined;
      return load === 3 ? null : undefined; // Mm is the one that is absent at load 3
    };
    const seen: Record<string, number>[] = [];
    const verdicts: Verdict[] = [];
    for (let n = 0; n < 10; n++) {
      const v = (await timed(b.links)).v;
      verdicts.push(v);
      seen.push(peekCounts(b.links));
      if (v === "ok") break;
    }
    expect(verdicts).toEqual(["503", "503", "503", "503", "503", "503", "ok"]);
    expect(seen.slice(0, 6)).toEqual([
      { [keyOf("Kk")]: 1 }, { [keyOf("Kk")]: 2 }, { [keyOf("Mm")]: 1 }, { [keyOf("Kk")]: 1 }, { [keyOf("Kk")]: 2 }, { [keyOf("Kk")]: 3 },
    ]);
  });

  it("nothing changes after the first load, however long a key stays absent: 20 refreshes, one LIST and ONE read each (no re-read, no pause), one log line each, never held (NOTE: a permanent absent key logs a line a minute for ever)", async () => {
    const b = bare({ latency: 20 });
    await fill(b, ["Aa", "Kk"]);
    b.s.override = (k) => (k === keyOf("Kk") ? null : undefined);
    expect((await run(b, 10)).at(-1), "the first load gets through after 3 failed ones").toBe("ok");
    const afterFirst = { lists: b.s.listNo, reads: b.s.reads.length, log: b.log.length };
    for (let n = 0; n < 20; n++) {
      b.s.clock += TTL;
      const r = await timed(b.links);
      expect(r, `refresh ${n + 1}: LIST 20 ms + ONE read 20 ms, no pause`).toEqual({ v: "ok", ms: 40 });
    }
    expect(b.s.listNo - afterFirst.lists, "one LIST each").toBe(20);
    expect(b.s.reads.length - afterFirst.reads, "one read each").toBe(20);
    expect(lines(b.log, REFRESH_NOT_FOUND), "one line each").toBe(20);
    expect(b.log.length - afterFirst.log).toBe(20);
    expect(vi.getTimerCount(), "no timer left").toBe(0);
  });
});

// ================================================================================================================ the log lines, on both stores

describe.each(KINDS)("4g-A. the log lines of the first load carry a count and no id, with several keys, a stray, a read error (%s)", (kind) => {
  it("3 absent keys, an unreadable one, a read error: every line (the load's and the route's own 'storage error') is free of ids, keys and paths; the 503 carries retry-after 5; the count is right", async () => {
    const rig = await open(kind);
    const [X, Y, Z] = [await freshIdentity(), await freshIdentity(), await freshIdentity()];
    const all = [X.playerId, Y.playerId, Z.playerId, "JunkJunk1234", "ReadFail1234"];
    for (const id of [X.playerId, Y.playerId, Z.playerId]) await rig.app.links.store.put(keyOf(id), tomb([id]));
    await rig.app.links.store.put(keyOf("JunkJunk1234"), "{not a tombstone");
    await rig.app.links.store.put(keyOf("ReadFail1234"), tomb(["ReadFail1234"]));
    await rig.restart();
    const store = rig.app.links.store as { get: LinkStore["get"] };
    const real = store.get.bind(store);
    let failRead = true;
    store.get = async (k: string) => {
      if (k === keyOf(X.playerId) || k === keyOf(Y.playerId) || k === keyOf(Z.playerId)) return null; // listed but absent, for good
      if (k === keyOf("ReadFail1234") && failRead) throw new StorageError("identity read failed: HTTP 500");
      return real(k);
    };
    const bystander = await freshIdentity();
    const r1 = await postGhost(rig, bystander, uploadFor(bystander, bystander.playerId, { runId: "b-1" }));
    expect([r1.status, r1.headers.get("retry-after")], "a read error: the plain 503").toEqual([503, "5"]);
    failRead = false;
    const results: number[] = [];
    for (let n = 0; n < 4; n++) results.push((await postGhost(rig, bystander, uploadFor(bystander, bystander.playerId, { runId: `b-${n + 2}` }))).status);
    expect(results, "three failed loads (3 absent keys each), then the one that goes on").toEqual([503, 503, 503, 201]);
    expect(lines(rig.log, "the first tombstone load failed: 3 listed tombstone(s) not found after 3 re-reads"), "a count of 3").toBe(3);
    expect(lines(rig.log, "went on WITHOUT 3 listed tombstone(s)")).toBe(1);
    expect(lines(rig.log, UNREADABLE), "the unreadable one is logged once, by the load that succeeded").toBe(1);
    const text = rig.log.join("\n");
    for (const id of all) expect(text, "no id in any line").not.toContain(id);
    expect(text).not.toContain("tombstones/");
    expect(lines(rig.log, "storage error:"), "the route's own lines: one for the read error, three for the failed loads").toBe(4);
    store.get = real;
  });
});

describe.each(KINDS)("4g-A. the re-reads of a first load run 8 at a time, like every other tombstone read (%s)", (kind) => {
  it("40 listed tombstones all absent: 40 reads and 3 x 40 re-reads, never more than 8 in flight (at the store), and the load fails (503)", async () => {
    const rig = await open(kind);
    const list = Array.from({ length: 40 }, (_, i) => `rr${String(i).padStart(3, "0")}${"x".repeat(30)}`);
    for (const id of list) await rig.app.links.store.put(keyOf(id), tomb([id]));
    await rig.restart();
    const store = rig.app.links.store as { get: LinkStore["get"] };
    const real = store.get.bind(store);
    let inFlight = 0, max = 0, reads = 0;
    store.get = async () => {
      reads++;
      inFlight++;
      max = Math.max(max, inFlight);
      try {
        await new Promise<void>((resolve) => setTimeout(resolve, 1));
        return null;
      } finally {
        inFlight--;
      }
    };
    const X = await freshIdentity();
    const r = await postGhost(rig, X, uploadFor(X, X.playerId, { runId: "a" }));
    store.get = real;
    expect(r.status).toBe(503);
    expect(reads, "the read and 3 re-reads of each of the 40").toBe(160);
    expect(max).toBe(8);
    expect(inFlight).toBe(0);
  });
});

describe.each(KINDS)("4g-A. a DELETE meets the first load like every other route (%s)", (kind) => {
  it("NOTE: with one listed tombstone absent for good, a player's DELETE is a 503 three times (no tombstone written, the history stays) and a 200 the fourth time, which removes the history: a player cannot delete on such a machine for the first three tries", async () => {
    const rig = await open(kind);
    const P = await freshIdentity();
    expect((await putEntry(rig, P, entryFor("p-1"))).status).toBe(201);
    await rig.app.links.store.put(keyOf("StuckOne"), tomb(["StuckOne"]));
    await rig.restart();
    const store = rig.app.links.store as { get: LinkStore["get"] };
    const real = store.get.bind(store);
    store.get = async (k: string) => (k === keyOf("StuckOne") ? null : real(k));
    const codes: number[] = [];
    const tombs: number[] = [];
    for (let n = 0; n < 4; n++) {
      codes.push((await deleteMe(rig, P)).status);
      tombs.push((await rig.app.links.store.list("tombstones/")).filter((k) => k !== keyOf("StuckOne")).length);
    }
    store.get = real;
    expect(codes).toEqual([503, 503, 503, 200]);
    expect(tombs, "no tombstone of P's is written until the load has got through").toEqual([0, 0, 0, 1]);
    expect(historyObjects(rig, P.playerId)).toEqual([]);
    expect(lines(rig.log, FAILED)).toBe(3);
    expect(lines(rig.log, WENT_ON)).toBe(1);
  });
});

// ================================================================================================================ B

describe("4g-B. FileLinkStore.list (linkStore.ts :104), ghost-admin's tombstoned() and the history store's own list: more names, and a stray DIRECTORY", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  const tmp = (): string => {
    const d = mkdtempSync(join(tmpdir(), "bb-v3-b-"));
    dirs.push(d);
    return d;
  };

  it("names a file system accepts but the key pattern refuses are not listed: a trailing newline or space, a leading space, a tab, an upper-case extension, a double extension, a 65-character id, a hidden file", async () => {
    const root = tmp();
    const store = new FileLinkStore(root);
    const dir = join(root, "tombstones");
    mkdirSync(dir, { recursive: true });
    const strays = ["abc.json\n", "abc.json ", " abc.json", "a\tb.json", "abc.JSON", "abc.json.json", `${"x".repeat(65)}.json`, ".hidden.json", "abc.json~", "abc.json.swp", "аbc.json"];
    for (const n of [...strays, "good.json", "Good_1-x.json"]) writeFileSync(join(dir, n), "{}");
    expect((await store.list("tombstones/")).sort()).toEqual(["tombstones/Good_1-x.json", "tombstones/good.json"]);
  });

  it("NOTE: a stray DIRECTORY with a valid record name (identity/tombstones/zz.json/) passes the name filter; `get` throws EISDIR -> StorageError, so the JSON-lines first load is a 503 for ever (retry-after 5), for every identity-aware route and the history routes alike, and ghost-admin purge-tombstoned exits 1", async () => {
    const rig = await open("jsonl");
    const X = await freshIdentity();
    expect((await putEntry(rig, X, entryFor("x-1"))).status).toBe(201);
    mkdirSync(join(rig.dir, "identity", "tombstones", "zz.json"), { recursive: true });
    await rig.restart();
    for (let n = 0; n < 3; n++) {
      const r = await putEntry(rig, X, entryFor("x-1"));
      expect([r.status, r.headers.get("retry-after")], `attempt ${n + 1}`).toEqual([503, "5"]);
    }
    expect((await postGhost(rig, X, uploadFor(X, X.playerId, { runId: "u-1" }))).status).toBe(503);
    expect((await requestCode(rig, X)).status).toBe(503);
    expect(lines(rig.log, "storage error: identity read failed (EISDIR)"), "the plain StorageError each time, never the 500 the stray FILE gave before the fix").toBeGreaterThanOrEqual(3);
    expect(rig.log.filter((l) => l.startsWith("error:"))).toEqual([]);
    const out: string[] = [];
    const code = await runAdmin(["purge-tombstoned", "--data", rig.dir], { BB_GHOST_STORE: "jsonl" }, (l) => out.push(l));
    expect([code, out.some((l) => l.includes("ghosts:admin failed: identity read failed (EISDIR)"))]).toEqual([1, true]);
    expect(await new JsonlAdmin(rig.dir).tombstoned().then(() => "read", (e: unknown) => (e instanceof StorageError ? "StorageError" : "other"))).toBe("StorageError");
    rmSync(join(rig.dir, "identity", "tombstones", "zz.json"), { recursive: true, force: true });
    expect((await putEntry(rig, X, entryFor("x-1"))).status, "the operator removes it: the next request starts a fresh load").toBe(200);
  });

  it("the history store's own list: a stray name (a .tmp of an interrupted write, a foreign file, a folder, a lookalike) is ignored; a folder NAMED like an entry is listed and breaks its DELETE (EISDIR) for good (NOTE)", async () => {
    const root = tmp();
    const store = new FileHistoryStore(root);
    const dir = join(root, "someplayer");
    mkdirSync(dir, { recursive: true });
    const e = { finishedAt: FINISHED, id: "run-1" };
    await store.put("someplayer", e, encodeEntry(entryFor("run-1")));
    const name = nameOf(e);
    for (const n of [`${name}.tmp`, "notes.txt", ".DS_Store", `0000000000001-x.JSON`, `00000000001-x.json`, `0000000000001-${"x".repeat(65)}.json`, "0000000000001-.json"]) writeFileSync(join(dir, n), "x");
    mkdirSync(join(dir, "folder"), { recursive: true });
    expect(await store.list("someplayer")).toEqual([e]);
    // a folder whose name IS an entry's name
    mkdirSync(join(dir, "0000000000001-folder.json"), { recursive: true });
    const listed = await store.list("someplayer");
    expect(listed.map((n) => n.id).sort(), "listed: the name parses").toEqual(["folder", "run-1"]);
    await expect(store.get("someplayer", { finishedAt: 9_999_999_999_998, id: "folder" })).rejects.toBeInstanceOf(StorageError);
    await expect(store.delete("someplayer", { finishedAt: 9_999_999_999_998, id: "folder" }), "rmSync refuses a directory even with force").rejects.toBeInstanceOf(StorageError);
  });
});

// ================================================================================================================ D

/** A small seeded generator (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("4g-D. ensureFresh and settleReload decide 'is a reload due?' alike: a seeded differential run", () => {
  const JUMPS = [0, 1, 999, 1_000, 1_001, 4_999, 5_000, 5_001, 59_999, 60_000, 60_001, 120_000, 21_600_000];
  async function drive(fn: "ensureFresh" | "settleReload", seed: number, ttl: number | undefined): Promise<{ lists: number[]; gone: number[]; clock: number[] }> {
    const b = bare(ttl === undefined ? {} : { ttl });
    const rand = rng(seed);
    let failing = false;
    b.s.failList = () => failing;
    const out = { lists: [] as number[], gone: [] as number[], clock: [] as number[] };
    let n = 0;
    for (let step = 0; step < 150; step++) {
      const r = rand();
      if (r < 0.2) failing = !failing;
      else if (r < 0.4) {
        n++;
        await b.inner.put(keyOf(`t${n}`), tomb([`t${n}`]));
      }
      b.s.clock += JUMPS[Math.floor(rand() * JUMPS.length)];
      await b.links[fn]().catch(() => undefined);
      out.lists.push(b.s.listNo);
      out.gone.push(b.links.goneCount);
      out.clock.push(b.s.clock);
    }
    return out;
  }

  const TTLS: (number | undefined)[] = [undefined, 0, 1_000, 5_000, 7_000, 60_000];
  it.each(TTLS)("refresh time %s ms: 5 seeds x 150 steps (random clock jumps at and around every boundary, LIST failures on and off, new tombstones): the same LISTs and the same set at every step", async (ttl) => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const a = await drive("ensureFresh", seed, ttl);
      const s = await drive("settleReload", seed, ttl);
      expect(s.lists, `seed ${seed}`).toEqual(a.lists);
      expect(s.gone, `seed ${seed}`).toEqual(a.gone);
      expect(a.lists.at(-1), "the run really reloads").toBeGreaterThan(10);
    }
  });

  it("the retry after a failed refresh is 5 s after the failure whatever the refresh time is (1 s, 60 s, 3 hours), for both: due at 5.000 s and not at 4.999 s", async () => {
    for (const ttl of [1_000, 60_000, 10_800_000]) {
      for (const fn of ["ensureFresh", "settleReload"] as const) {
        const b = bare({ ttl });
        await fill(b, ["Aa"]);
        await b.links[fn]();
        b.s.clock += ttl;
        b.s.failList = () => true;
        await b.links[fn]().catch(() => undefined);
        const lists = b.s.listNo;
        b.s.failList = () => false;
        b.s.clock += 4_999;
        await b.links[fn]();
        expect(b.s.listNo, `${fn} ttl ${ttl}: 4.999 s after the failure`).toBe(lists);
        b.s.clock += 1;
        await b.links[fn]();
        expect(b.s.listNo, `${fn} ttl ${ttl}: 5 s after the failure`).toBe(lists + 1);
      }
    }
  });
});

// ================================================================================================================ K

describe("4g-K. docs/ASYNC.md :719-742: every number of the tombstone-set paragraph against the code", () => {
  const doc = readFileSync("docs/ASYNC.md", "utf8");
  const start = doc.indexOf("**The tombstone set**");
  const para = doc.slice(start, doc.indexOf("\n\n", start)).replace(/\s+/g, " ");

  it("the paragraph is found, and every number in it is one this test checks (a new or changed number in the doc fails here)", () => {
    expect(start).toBeGreaterThan(0);
    const numbers = [...para.matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]).filter((n) => n !== "503"); // (503 is the HTTP status, not a figure)
    // IDENT-1 FIX2; 8 reads; IDENT-2; 3 times; 100 ms; 3 failed loads; 3 failed loads; 0.4 s; 3 pauses; 100 ms; 20 ms; 1.6 s; 17 s; 5 s; 60 s; 6 hours; 250 ms; 5 s; 6 hours (best effort)
    expect(numbers).toEqual(["1", "2", "8", "2", "3", "100", "3", "3", "0.4", "3", "100", "20", "1.6", "17", "5", "60", "6", "250", "5", "6"]);
  });

  it("the constants the paragraph quotes: 8 reads at a time, 3 re-reads 100 ms apart, 3 failed first loads, the 250 ms bound, the 6-hour full read", () => {
    expect(para).toContain("reads every tombstone, 8 reads at a time");
    expect(TOMBSTONE_READS_IN_FLIGHT).toBe(8);
    expect(para).toContain("is read again inside the first load, 3 times, 100 ms apart");
    expect([TOMBSTONE_REREADS, TOMBSTONE_REREAD_PAUSE_MS]).toEqual([3, 100]);
    expect(para).toContain("absent through 3 failed first loads in a row");
    expect(TOMBSTONE_ABSENT_LOADS).toBe(3);
    expect(para).toContain("A request waits at most 250 ms for a refresh");
    expect(TOMBSTONE_WAIT_MS).toBe(250);
    expect(para).toContain("Every 6 hours a refresh reads all of them again");
    expect(TOMBSTONE_FULL_READ_MS).toBe(6 * 60 * 60_000);
  });

  it("'about 0.4 s each', 'about 1.6 s when requests keep coming', 'about 17 s for a client that waits the 5 s of retry-after': the figures hold for up to 8 tombstones (and the doc does not say so)", () => {
    expect(para).toContain("3 failed loads of about 0.4 s each (3 pauses of 100 ms, and the store's own time at an assumed 20 ms a request)");
    expect(para).toContain("about 1.6 s when requests keep coming, and about 17 s for a client that waits the 5 s of `retry-after` between its tries");
    const load = 20 + 20 + TOMBSTONE_REREADS * (TOMBSTONE_REREAD_PAUSE_MS + 20);
    expect(load, "LIST 20 + one read round 20 + 3 x (100 + a re-read round 20)").toBe(400);
    expect((TOMBSTONE_ABSENT_LOADS + 1) * load).toBe(1_600);
    expect((TOMBSTONE_ABSENT_LOADS + 1) * load + TOMBSTONE_ABSENT_LOADS * 5_000, "the first success at 16.6 s: 'about 17 s'").toBe(16_600);
    expect(para, "the doc names no limit on the number of tombstones for these figures").not.toMatch(/tombstones? (at most|or fewer|up to)|few tombstones|8 tombstones/);
  });

  it("'a refresh every 60 s ... a request waits at most 250 ms ... tried again 5 s later': the behaviour, through a route on a bare Links", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const b = bare({ latency: 20 });
      await fill(b, ["Aa"]);
      expect(await timed(b.links)).toEqual({ v: "ok", ms: 40 }); // the first load: LIST 20 + the read 20
      const lists = b.s.listNo;
      b.s.clock += 59_999;
      expect(await timed(b.links), "59.999 s: no refresh").toEqual({ v: "ok", ms: 0 });
      expect(b.s.listNo).toBe(lists);
      b.s.clock += 1;
      expect(await timed(b.links), "60 s: a refresh (the list alone: nothing new to read)").toEqual({ v: "ok", ms: 20 });
      expect(b.s.listNo).toBe(lists + 1);
      // a stuck refresh: a request waits 250 ms and goes on with the set it holds
      b.s.latency = 1_000_000;
      b.s.clock += 60_000;
      expect(await timed(b.links), "waited the bound, then went on with the set it holds").toEqual({ v: "ok", ms: 250 });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("4g-K. 'a DELETE reads each Steam link before it removes it (two more requests on Tigris for each account)'", () => {
  it("one Steam account: HEAD 1 + GET 1 + DELETE 1 on links/steam/ (the read is the two more)", async () => {
    const rig = await open("tigris", { steam: fakeSteam({ ab12: "76561198000000077" }) });
    const [P, D] = [await freshIdentity(), await freshIdentity()];
    expect((await linkVia(rig, P, D)).joined.status).toBe(200);
    const linked = await linkSteamCall(rig, P, "ab12", "myidentity", 480);
    expect(linked.status, linked.text).toBe(200);
    await rig.restart();
    await rig.app.links.settleReload();
    const mark = markRequests(rig);
    expect((await deleteMe(rig, P)).status).toBe(200);
    expect(opsSince(rig, mark, "links/steam/")).toEqual({ HEAD: 1, GET: 1, DELETE: 1 });
    expect(theFake().keys(rig.bucket, "links/steam/")).toEqual([]);
  });
});
