// VERIFY-IDENT2 step 4 item i (REQ-BFG-122 clause 4): the local store, src/game/history.ts, attacked harder than tests/ident2.local.test.ts:
// a model-based property test with fixed seeds (random run ends, marks, merges, links and clock jumps against an oracle written from the
// documented rules), the cap of 50 case by case, the 16,000-byte entry in bytes and the 256 KB record budget at their boundaries, a storage
// that is nearly full (not just always full), a newer version's store in its classes, and the sizes of player-built day-10 decks. No server.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HISTORY_KEY, HISTORY_RECORD_BUDGET, entryFromRun, markSent, mergeDownloaded, readHistory, recordRunEnd, resetHistoryWarning, stampSynced, unsentFor, writeHistory,
  type HistoryState, type HistoryStorage, type LocalEntry,
} from "../src/game/history";
import { foldDuskResult, foldRunEnd } from "../src/game/styleFolds";
import type { Run } from "../src/game/run";
import { setSession } from "../src/game/session";
import { historyIdle, resetHistorySync, startupHistorySync, syncHistory } from "../src/net/historySync";
import {
  HISTORY_ENTRY_MAX_BYTES, HISTORY_LOCAL_MAX, byteLength, checkEntry, decodeEntry, encodeEntry, entryIdOf, fitEntry, newestFirst, type HistoryEntry,
} from "../src/net/historyWire";
import { LINK_KEY, encodeLink } from "../src/net/linkState";
import { battleRecordFor } from "../src/net/replay";
import type { BattleRecord } from "../src/sim/battle";
import { HEROES, RULES_VERSION, type HeroId } from "../src/sim/content";
import { playerBuild } from "../src/sim/harness/player";
import { standInPool } from "../src/sim/standInPool";
import { continueEndless, device, entryOf, mem, playedRun, type Mem } from "./ident2Local";
import { NOW, rng } from "./profileupWire";

let ls: Mem;
beforeEach(() => {
  ls = mem();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubGlobal("localStorage", ls);
  resetHistoryWarning();
  resetHistorySync();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setSession(null);
});

const at = (ms: number) => vi.setSystemTime(ms);
const P = "player-P-0000000000000000000000000000000000000";
const Q = "player-Q-0000000000000000000000000000000000000";
const link = (player: string | null, store: HistoryStorage & { removeItem?(k: string): void } = ls) => {
  if (player === null) store.removeItem?.(LINK_KEY);
  else store.setItem(LINK_KEY, encodeLink({ v: 1, player, key: "k".repeat(43), at: NOW }));
};

/** A battle record of a known size: the shape check's minimum (rules, seed, two builds) and `n` characters of padding. */
const syn = (n: number, ch = "x"): BattleRecord => ({ rules: RULES_VERSION, seed: 1, builds: [{ pad: ch.repeat(n) }, {}] }) as unknown as BattleRecord;
const SYN0 = JSON.stringify(syn(0)).length;
/** The JSON length of the records an entry holds (what the budget counts). */
const recBytes = (e: HistoryEntry): number => e.dusks.reduce((n, d) => n + (d.record ? JSON.stringify(d.record).length : 0), 0);
const stored = (store: HistoryStorage = ls): LocalEntry[] => readHistory(store).state.entries;

/** A finished run whose dusk i holds a record of sizes[i] bytes of padding (negative: no record). */
function runWith(id: string, sizes: number[], end: "won" | "complete" | "lost" | null = "complete", ch = "x"): Run {
  const run = playedRun({ pattern: "W".repeat(sizes.length), end, runId: id, records: false });
  sizes.forEach((n, i) => {
    if (n >= 0) run.history[i].record = syn(n, ch);
  });
  return run;
}

/** Write a state straight into the store (the sizes and flags a test needs), newest first. */
function put(list: { id: string; ts: number; sent?: string; down?: boolean; recs?: number[] }[]): void {
  const entries: LocalEntry[] = list.map((x) => {
    const e = entryOf(x.id, {}, x.ts);
    if (x.recs) e.dusks = x.recs.map((n, i) => (n >= 0 ? { day: i + 1, outcome: "win" as const, record: syn(n) } : { day: i + 1, outcome: "win" as const }));
    if (x.recs) e.wins = Math.min(e.wins, e.dusks.length);
    return { entry: e, ...(x.sent ? { sentTo: x.sent } : {}), ...(x.down ? { down: true as const } : {}) };
  });
  entries.sort((a, b) => newestFirst(a.entry, b.entry));
  expect(writeHistory({ entries }, ls)).toBe(true);
}
const ids = (store: HistoryStorage = ls): string[] => stored(store).map((l) => l.entry.id);

// ------------------------------------------------------------------------------------------------------ the model-based test

interface Snap { id: string; finishedAt: number; sentTo?: string; down?: boolean; rec: number; text: string }
const snapOf = (l: LocalEntry): Snap => ({ id: l.entry.id, finishedAt: l.entry.finishedAt, ...(l.sentTo ? { sentTo: l.sentTo } : {}), ...(l.down ? { down: true } : {}), rec: recBytes(l.entry), text: encodeEntry(l.entry) });
const newest = (a: Snap, b: Snap): number => b.finishedAt - a.finishedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
/** Is this entry still waiting to be sent to `p`? (the documented rule: a local entry not yet sent to that player; a downloaded one never) */
const waiting = (s: Snap, p: string | null): boolean => !s.down && (p === null || s.sentTo !== p);

/** The cap, as documented: the OLDEST entry that is not waiting goes first; the oldest overall only when every entry is waiting. */
function modelTrim(list: Snap[], p: string | null): Snap[] {
  const out = [...list];
  while (out.length > HISTORY_LOCAL_MAX) {
    let i = out.length - 1;
    while (i >= 0 && waiting(out[i], p)) i--;
    if (i < 0) {
      out.length = HISTORY_LOCAL_MAX;
      break;
    }
    out.splice(i, 1);
  }
  return out;
}
/** The record budget, as documented: from the newest back an entry keeps its records while they fit; from the first that does not, none do. */
function modelBudget(list: Snap[]): Snap[] {
  let used = 0, spent = false;
  return list.map((s) => {
    if (!spent && used + s.rec <= HISTORY_RECORD_BUDGET) {
      used += s.rec;
      return s;
    }
    spent = true;
    return { ...s, rec: 0 };
  });
}
const shape = (list: Snap[]): string => list.map((s) => `${s.id}|${s.sentTo ?? ""}|${s.down ? "d" : ""}|${s.rec}`).join(",");

describe("4i. model-based: random run ends, marks, merges, links and clock jumps against an oracle written from the documented rules", () => {
  it.each([101, 202, 303, 404, 505])("seed %i: ids unique, at most 50, newest first, no waiting entry dropped unless all 50 wait, records within the budget as a prefix, every entry canonical and within 16,000 bytes", (seed) => {
    const r = rng(seed);
    let t = NOW;
    let player: string | null = null;
    let counter = 0;
    const verified = new Set<string>();
    const stats = { end: 0, endKept: 0, endDropped: 0, repeat: 0, reattempt: 0, mark: 0, merge: 0, mergeKept: 0, unsentDropped: 0, budgetSpent: 0, backwards: 0, maxEntries: 0 };
    const sizesPool = [-1, -1, 0, 400, 2500, 6000, 12000];

    const checkState = (): Snap[] => {
      const { state, newer } = readHistory(ls);
      expect(newer).toBe(false);
      const list = state.entries.map(snapOf);
      expect(new Set(list.map((s) => s.id)).size, "ids are unique").toBe(list.length);
      expect(list.length).toBeLessThanOrEqual(HISTORY_LOCAL_MAX);
      expect([...list].sort(newest).map((s) => s.id), "newest first").toEqual(list.map((s) => s.id));
      expect(list.reduce((n, s) => n + s.rec, 0), "records within the budget").toBeLessThanOrEqual(HISTORY_RECORD_BUDGET);
      for (const l of state.entries) {
        const text = encodeEntry(l.entry);
        if (!verified.has(text)) {
          expect(byteLength(text), l.entry.id).toBeLessThanOrEqual(HISTORY_ENTRY_MAX_BYTES);
          expect(decodeEntry(text), l.entry.id).toEqual(l.entry);
          verified.add(text);
        }
        expect(l.down === true && l.sentTo !== undefined, "a downloaded entry is never marked sent").toBe(false);
      }
      stats.maxEntries = Math.max(stats.maxEntries, list.length);
      return list;
    };
    // the budget's prefix rule (an entry keeps its records only while every newer entry's fit) is checked exactly by the model below, which
    // compares the record bytes of every entry after every step

    const droppedWaitingOnlyIfAllWait = (before: Snap[], after: Snap[], pl: string | null, added: string[]): void => {
      const kept = new Set(after.map((s) => s.id));
      const dropped = [...before.filter((s) => !added.includes(s.id)), ...[]].filter((s) => !kept.has(s.id));
      for (const d of dropped) {
        if (waiting(d, pl)) {
          stats.unsentDropped++;
          expect(after.length, `${d.id} was waiting and was dropped, so the list must be full`).toBe(HISTORY_LOCAL_MAX);
          expect(after.every((s) => waiting(s, pl)), `${d.id} was waiting and was dropped, so every entry kept must be waiting too`).toBe(true);
        }
      }
    };

    let lastRun: Run | null = null;
    for (let step = 0; step < 220; step++) {
      const before = checkState();
      const x = r.next();
      if (x < 0.46 || (x < 0.5 && !lastRun)) {
        // ---- a run ends
        stats.end++;
        if (r.bool(0.08)) {
          t -= 1000 + r.int(400_000); // the device clock stepped back
          stats.backwards++;
        } else t += 1 + r.int(8000);
        at(t);
        const endlessToo = r.bool(0.12);
        const n = r.int(11);
        const sizes = Array.from({ length: n }, () => r.pick(sizesPool));
        const id = `s${seed}-${counter++}`;
        const run = runWith(id, sizes, r.pick(["won", "complete", "lost", null] as const));
        if (endlessToo) {
          // the run's own entry first (the 10th win), then CONTINUE ENDLESS and its end
          run.over = "won";
          recordRunEnd(run);
          continueEndless(run, { pattern: "WLW".slice(0, 1 + r.int(3)), end: r.pick(["hearts", "cap", "lastDay", null] as const) }, false);
          for (const h of run.history) if (h.endless && r.bool(0.5)) h.record = syn(r.pick([0, 400, 2500, 6000]));
          t += 1 + r.int(8000);
          at(t);
        }
        lastRun = run;
        const pl = player;
        const kind = run.endlessRun ? "endless" : "run";
        const N = entryFromRun(run, kind, t)!;
        const mid = checkState();
        const exists = mid.some((s) => s.id === N.id);
        const got = recordRunEnd(run);
        const after = checkState();
        if (exists) {
          stats.repeat++;
          expect(got, "an id known already writes nothing").toEqual([]);
          expect(shape(after)).toBe(shape(mid));
        } else {
          const merged = [...mid, { id: N.id, finishedAt: N.finishedAt, rec: recBytes(N), text: encodeEntry(N) }].sort(newest);
          const want = modelBudget(modelTrim(merged, pl));
          const hasN = want.some((s) => s.id === N.id);
          expect(got).toEqual(hasN ? [N.id] : []);
          expect(shape(after)).toBe(shape(hasN ? want : mid));
          if (hasN) {
            stats.endKept++;
            droppedWaitingOnlyIfAllWait(mid, after, pl, [N.id]);
          } else stats.endDropped++;
          const recBefore = new Map(merged.map((s) => [s.id, s.rec] as const));
          if (want.some((s) => s.rec !== recBefore.get(s.id))) stats.budgetSpent++;
        }
      } else if (x < 0.58 && lastRun) {
        // ---- the same run ends again (the summary, a reload): when its entry is in the store nothing may change. An entry that was dropped at its
        // birth (all 50 waiting and it the oldest) is simply a new write at this fold, with this fold's clock: the invariants above cover it.
        at(t + 1 + r.int(5000));
        const present = before.some((s) => s.id === entryIdOf(lastRun!.runId, lastRun!.endlessRun ? "endless" : "run"));
        const text = ls.getItem(HISTORY_KEY);
        const writes = ls.sets;
        if (present) {
          stats.repeat++;
          expect(recordRunEnd(lastRun)).toEqual([]);
          expect(ls.getItem(HISTORY_KEY)).toBe(text);
          expect(ls.sets).toBe(writes);
        } else {
          stats.reattempt++;
          recordRunEnd(lastRun);
        }
      } else if (x < 0.7) {
        // ---- the sync marks some entries sent (or ids that are not there)
        stats.mark++;
        const to = player ?? P;
        const pick = [...before.filter(() => r.bool(0.4)).map((s) => s.id), ...(r.bool(0.3) ? ["not-there-1"] : [])];
        markSent(pick, to, ls);
        const after = checkState();
        const want = before.map((s) => (pick.includes(s.id) && !s.down && s.sentTo !== to ? { ...s, sentTo: to } : s));
        expect(shape(after)).toBe(shape(want));
        expect(after.map((s) => s.text)).toEqual(before.map((s) => s.text)); // marking changes no byte of an entry
      } else if (x < 0.86) {
        // ---- a download is merged
        stats.merge++;
        const n = 1 + r.int(4);
        const got: HistoryEntry[] = [];
        for (let k = 0; k < n; k++) {
          const reuse = before.length && r.bool(0.25);
          const id = reuse ? r.pick(before).id : `d${seed}-${counter++}`;
          const ts = Math.max(HISTORY_RECORD_FLOOR, t - r.int(3_000_000) + r.int(2000));
          const e = entryOf(id.replace(/_endless$/, ""), { id, runId: id.replace(/_endless$/, ""), kind: "run" }, ts);
          const size = r.pick(sizesPool);
          if (size >= 0) e.dusks = [{ day: 1, outcome: "win", record: syn(size) }, ...e.dusks.slice(1)];
          got.push(e);
        }
        const pl = r.bool(0.8) ? (player ?? P) : null;
        const have = new Set(before.map((s) => s.id));
        const added: HistoryEntry[] = [];
        for (const e of got) if (!have.has(e.id)) (have.add(e.id), added.push(e));
        const ret = mergeDownloaded(got, pl, ls);
        const after = checkState();
        if (!added.length) {
          expect(ret).toBe(0);
          expect(shape(after)).toBe(shape(before));
        } else {
          const merged = [...before, ...added.map((e) => ({ id: e.id, finishedAt: e.finishedAt, down: true as const, rec: recBytes(e), text: encodeEntry(e) }))].sort(newest);
          const want = modelBudget(modelTrim(merged, pl));
          expect(shape(after)).toBe(shape(want));
          expect(ret).toBe(want.filter((s) => added.some((e) => e.id === s.id)).length);
          stats.mergeKept += ret;
          droppedWaitingOnlyIfAllWait(before, after, pl, added.map((e) => e.id));
        }
        // the entries the device had keep their bytes (a merge is a union; only the budget may strip records)
        for (const s of after) {
          const old = before.find((b) => b.id === s.id);
          if (old && !added.some((e) => e.id === s.id)) expect(s.text === old.text || s.rec < old.rec).toBe(true);
        }
      } else if (x < 0.93) {
        // ---- the device is linked, relinked to another player, or unlinked
        player = r.pick([null, P, Q, P] as const);
        link(player);
      } else {
        // ---- the sync is stamped
        stampSynced(t, ls);
        const after = checkState();
        expect(shape(after)).toBe(shape(before));
        expect(readHistory(ls).state.syncedAt).toBe(t);
      }
      // what the sync would send is exactly the entries that are not downloaded and not sent to this player
      const pl2 = player ?? P;
      expect(unsentFor(pl2, ls).map((e) => e.id)).toEqual(stored().filter((l) => !l.down && l.sentTo !== pl2).map((l) => l.entry.id));
    }
    console.log(`4i MODEL seed ${seed}: ${JSON.stringify(stats)}`);
    expect(stats.end).toBeGreaterThan(40);
    expect(stats.merge).toBeGreaterThan(15);
    expect(stats.maxEntries, "the cap was reached").toBe(HISTORY_LOCAL_MAX);
  });
});
const HISTORY_RECORD_FLOOR = Date.UTC(2026, 0, 1);

// ------------------------------------------------------------------------------------------------------------ the cap, case by case

describe("4i. the cap of 50 trims the oldest entry already sent first (and a downloaded one counts as sent)", () => {
  const ts = (i: number): number => NOW - i * 1000; // entry i is older than entry i-1
  const list = (n: number, f: (i: number) => { sent?: string; down?: boolean }) => Array.from({ length: n }, (_, i) => ({ id: `e${String(i).padStart(2, "0")}-1-1`, ts: ts(i), ...f(i) }));

  it("50 sent: the oldest goes, and a new run ENDED BEFORE all of them (a clock that stepped back) still gets in, in its place at the end", () => {
    link(P);
    put(list(50, () => ({ sent: P })));
    at(NOW - 99_000);
    expect(recordRunEnd(playedRun({ pattern: "WL", end: "lost", runId: "late-1-1", records: false }))).toEqual(["late-1-1"]);
    expect(ids()).toHaveLength(50);
    expect(ids().at(-1)).toBe("late-1-1"); // the oldest position
    expect(ids()).not.toContain("e49-1-1"); // the oldest SENT one went
    expect(ids()).toContain("e48-1-1");
  });

  it("the oldest 3 unsent and 47 sent: a new run drops the oldest SENT entry (the 4th from the end), the 3 unsent stay", () => {
    link(P);
    put(list(50, (i) => (i >= 47 ? {} : { sent: P })));
    at(NOW + 5000);
    expect(recordRunEnd(playedRun({ pattern: "WL", end: "lost", runId: "new-1-1", records: false }))).toEqual(["new-1-1"]);
    const got = ids();
    expect(got).toHaveLength(50);
    expect(got[0]).toBe("new-1-1");
    expect(got).not.toContain("e46-1-1"); // the oldest sent
    for (const keep of ["e47-1-1", "e48-1-1", "e49-1-1"]) expect(got).toContain(keep);
  });

  it("all 50 unsent: the OLDEST goes (the cap is the cap), and a new run older than all of them is the one that is not stored (nothing is written)", () => {
    link(P);
    put(list(50, () => ({})));
    at(NOW + 5000);
    expect(recordRunEnd(playedRun({ pattern: "WL", end: "lost", runId: "new-1-1", records: false }))).toEqual(["new-1-1"]);
    expect(ids()).not.toContain("e49-1-1");
    expect(ids()).toHaveLength(50);
    const text = ls.getItem(HISTORY_KEY);
    const writes = ls.sets;
    at(NOW - 500_000);
    expect(recordRunEnd(playedRun({ pattern: "WL", end: "lost", runId: "ancient-1-1", records: false }))).toEqual([]);
    expect(ls.getItem(HISTORY_KEY)).toBe(text);
    expect(ls.sets).toBe(writes);
  });

  it("downloaded entries are dropped like sent ones: the oldest of either kind goes first, whatever its kind", () => {
    link(P);
    put(list(50, (i) => (i % 2 ? { down: true } : { sent: P })));
    at(NOW + 5000);
    recordRunEnd(playedRun({ pattern: "WL", end: "lost", runId: "new-1-1", records: false }));
    expect(ids()).not.toContain("e49-1-1"); // a downloaded one, the oldest
    expect(ids()).toContain("e48-1-1");
    put(list(50, (i) => (i % 2 ? { sent: P } : { down: true })));
    recordRunEnd(playedRun({ pattern: "WL", end: "lost", runId: "new-2-1", records: false }));
    expect(ids()).not.toContain("e49-1-1"); // a sent one, the oldest
  });

  it("two entries with the same finishedAt: the larger id sits older (the server's list order too), so it is dropped first", () => {
    link(P);
    put(Array.from({ length: 50 }, (_, i) => ({ id: `t${String(i).padStart(2, "0")}-1-1`, ts: NOW - 10_000, sent: P })));
    expect(ids().slice(0, 3)).toEqual(["t00-1-1", "t01-1-1", "t02-1-1"]);
    at(NOW - 10_000);
    expect(recordRunEnd(playedRun({ pattern: "WL", end: "lost", runId: "t50-1-1", records: false }))).toEqual(["t50-1-1"]);
    expect(ids()).not.toContain("t49-1-1");
    expect(ids().at(-1)).toBe("t50-1-1"); // unsent, so kept; the oldest sent (t49) went
  });

  it("never linked: every local entry waits, so the oldest goes at the cap; a downloaded entry (it cannot exist unlinked, but a record can be cleared) goes first", () => {
    link(null);
    put([...list(46, () => ({})), ...[46, 47, 48, 49].map((i) => ({ id: `e${i}-1-1`, ts: ts(i), down: true }))]);
    at(NOW + 5000);
    recordRunEnd(playedRun({ pattern: "WL", end: "lost", runId: "new-1-1", records: false }));
    expect(ids()).not.toContain("e49-1-1");
    expect(ids().filter((i) => i.startsWith("e4")).length).toBeGreaterThan(0);
    // a device linked to ANOTHER player: entries sent to P are waiting for Q, so only the cap's last resort applies
    link(Q);
    put(list(50, () => ({ sent: P })));
    at(NOW + 6000);
    recordRunEnd(playedRun({ pattern: "WL", end: "lost", runId: "new-2-1", records: false }));
    expect(ids()).toHaveLength(50);
    expect(ids()).not.toContain("e49-1-1");
  });
});

// -------------------------------------------------------------------------------------------------------- the 256 KB record budget

describe("4i. the record budget at its boundary", () => {
  const rec = (bytes: number): number => bytes - SYN0; // the padding that makes one record exactly `bytes` of JSON
  const ts = (i: number): number => NOW - i * 1000;
  function downloads(sizes: number[]): HistoryEntry[] {
    return sizes.map((b, i) => {
      const e = entryOf(`b${String(i).padStart(2, "0")}-1-1`, {}, ts(i));
      e.dusks = [{ day: 1, outcome: "win", record: syn(rec(b)) }, e.dusks[1], e.dusks[2]];
      return e;
    });
  }
  const withRecords = (): string[] => stored().filter((l) => recBytes(l.entry) > 0).map((l) => l.entry.id);

  it("records that add up to exactly the budget all stay; one byte more and the last one loses its own", () => {
    const per = 10_000, n = 26;
    const sizes = Array.from({ length: n }, () => per);
    sizes[n - 1] = HISTORY_RECORD_BUDGET - per * (n - 1); // the sum is exactly the budget
    expect(mergeDownloaded(downloads(sizes), P, ls)).toBe(n);
    expect(withRecords()).toHaveLength(n);
    expect(stored().reduce((m, l) => m + recBytes(l.entry), 0)).toBe(HISTORY_RECORD_BUDGET);
    ls.removeItem(HISTORY_KEY);
    sizes[n - 1]++; // one byte over
    expect(mergeDownloaded(downloads(sizes), P, ls)).toBe(n);
    expect(withRecords()).toHaveLength(n - 1);
    expect(stored().at(-1)!.entry.dusks.every((d) => d.record === undefined)).toBe(true);
    expect(stored().at(-1)!.entry.dusks).toHaveLength(3); // its rows stay
  });

  it("NOTE: from the first entry that does not fit, EVERY older entry loses its records, even a small one that would have fit; the strip is permanent (a later merge of the same id restores nothing)", () => {
    // newest first: 200,000 B, then 100,000 B (200,000 + 100,000 is over), then 1,000 B (would fit by itself)
    const [a, b, c] = downloads([200_000 - 0, 100_000, 1_000]);
    // (a record this size is over a real entry's 16,000-byte limit; the budget is applied to whatever a merge brings)
    expect(mergeDownloaded([a, b, c], P, ls)).toBe(3);
    expect(withRecords()).toEqual([a.id]);
    expect(stored().map((l) => recBytes(l.entry))).toEqual([200_000, 0, 0]);
    // the server still holds the records; the device is offered them again and keeps what it has
    expect(mergeDownloaded([b, c], P, ls)).toBe(0);
    expect(stored().map((l) => recBytes(l.entry))).toEqual([200_000, 0, 0]);
  });

  it("with real run ends (16 KB entries): 50 runs of 3 records each keep records in a prefix of the newest entries and never more than the budget; an entry's rows and summary are never dropped", () => {
    for (let i = 0; i < 50; i++) {
      at(NOW + i * 1000);
      recordRunEnd(runWith(`rr${String(i).padStart(2, "0")}-1-1`, [5000, 5000, 5000, 5000]), { store: ls });
    }
    const list = stored();
    expect(list).toHaveLength(50);
    const per = list.map((l) => recBytes(l.entry));
    const firstBare = per.findIndex((n) => n === 0);
    expect(firstBare).toBeGreaterThan(0);
    expect(per.slice(firstBare).every((n) => n === 0)).toBe(true);
    expect(per.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(HISTORY_RECORD_BUDGET);
    // the newest entries are 16,000-byte fits: 3 records of ~5 KB survive fitEntry, the 4th (oldest dusk) went first
    expect(list[0].entry.dusks.map((d) => d.record !== undefined)).toEqual([false, true, true, true]);
    for (const l of list) expect(l.entry.dusks.map((d) => d.day)).toEqual([1, 2, 3, 4]);
    console.log(`4i BUDGET 50 runs x 4 records of 5 KB: entries with records ${firstBare}, bytes of records ${per.reduce((a, b) => a + b, 0)}, key ${ls.getItem(HISTORY_KEY)!.length} characters`);
  });
});

describe("4i. what the biggest store costs", () => {
  it("NOTE: with 50 entries and the whole 256 KB of records, a read, one mark (the sync writes one per entry sent: 10 a trigger) and a run end each parse and rewrite the whole key; measured in ms on this machine", () => {
    for (let i = 0; i < 50; i++) {
      at(NOW + i * 1000);
      recordRunEnd(runWith(`pf${String(i).padStart(2, "0")}-1-1`, [5000, 5000, 5000, 5000]), { store: ls });
    }
    const chars = ls.getItem(HISTORY_KEY)!.length;
    const each = (n: number, f: (i: number) => void): number => {
      const t0 = performance.now();
      for (let i = 0; i < n; i++) f(i);
      return Math.round(((performance.now() - t0) / n) * 100) / 100;
    };
    const readMs = each(10, () => readHistory(ls));
    const some = ids().slice(0, 10);
    const markMs = each(10, (i) => markSent([some[i]], P, ls));
    at(NOW + 99_000);
    const runEndMs = each(1, () => recordRunEnd(runWith("pf99-1-1", [5000, 5000, 5000, 5000]), { store: ls }));
    console.log(`4i COST key ${chars} characters: read ${readMs} ms, one mark ${markMs} ms (x10 a trigger), a run end ${runEndMs} ms`);
    expect(markMs, "a mark must stay far from a frame budget on a desktop").toBeLessThan(250);
    expect(unsentFor(P, ls).map((e) => e.id)).not.toContain(some[0]);
  });
});

// --------------------------------------------------------------------------------------------------------- the 16,000-byte entry

describe("4i. the 16,000-byte entry, in bytes", () => {
  /** The size of the entry of a run whose dusks hold records of `pads` characters, before any fit (all pads small enough that nothing is dropped). */
  const base = (n: number): number => byteLength(encodeEntry(entryFromRun(runWith("fit-1-1", Array.from({ length: n }, () => 0)), "run", NOW)!));

  it("an entry of exactly 16,000 bytes is kept whole; 16,001 loses the OLDEST dusk's record and only that one", () => {
    const n = 4, b0 = base(n);
    const total = 16_000 - b0; // padding to share between the records
    const pads = [Math.floor(total / n), Math.floor(total / n), Math.floor(total / n), total - 3 * Math.floor(total / n)];
    const exact = entryFromRun(runWith("fit-1-1", pads), "run", NOW)!;
    expect(byteLength(encodeEntry(exact))).toBe(16_000);
    expect(exact.dusks.every((d) => d.record !== undefined)).toBe(true);
    const over = entryFromRun(runWith("fit-1-1", [pads[0], pads[1], pads[2], pads[3] + 1]), "run", NOW)!;
    expect(byteLength(encodeEntry(over))).toBeLessThanOrEqual(16_000);
    expect(over.dusks.map((d) => d.record !== undefined)).toEqual([false, true, true, true]);
    expect(byteLength(encodeEntry(over))).toBe(16_001 - (10 + SYN0 + pads[0])); // the key `,"record":` and the record's own text are what left
  });

  it("the records go OLDEST first until it fits; when they all must go the rows and the summary stay (445-byte class)", () => {
    const e = entryFromRun(runWith("fit-2-1", [7000, 7000, 7000, 7000, 7000]), "run", NOW)!;
    expect(e.dusks.map((d) => d.record !== undefined)).toEqual([false, false, false, true, true]); // 35 KB -> 14.1 KB + rows
    const none = entryFromRun(runWith("fit-3-1", [20_000, 20_000]), "run", NOW)!; // each record alone is over the limit
    expect(none.dusks.every((d) => d.record === undefined)).toBe(true);
    expect(none.dusks.map((d) => d.day)).toEqual([1, 2]);
    expect(byteLength(encodeEntry(none))).toBeLessThan(600);
    expect(Object.keys(none)).toEqual(["id", "runId", "kind", "rules", "hero", "outcome", "wins", "days", "lives", "hearts", "finishedAt", "dusks"]);
  });

  it("sizes are BYTES: records of 2-byte characters (8,000 of them are 16,000 bytes) are dropped although the text is under 16,000 characters", () => {
    const run = runWith("fit-4-1", [4000, 4000, 4000], "complete", "é"); // 3 x 4,000 two-byte characters = 24,000 bytes of padding, 12,000 characters
    const e = entryFromRun(run, "run", NOW)!;
    const text = encodeEntry(e);
    expect(byteLength(text)).toBeLessThanOrEqual(16_000);
    expect(e.dusks.filter((d) => d.record !== undefined).length, "some records had to go").toBeLessThan(3);
    const unfit = encodeEntry({ ...e, dusks: run.history.map((h) => ({ day: h.day, outcome: h.outcome, record: h.record! })) });
    expect(unfit.length, "the text without any fit is under 16,000 characters ...").toBeLessThan(16_000);
    expect(byteLength(unfit), "... and over 16,000 bytes").toBeGreaterThan(16_000);
  });

  it("every entry the local store writes passes the server's caps (checkEntry) on every end path: nothing a normal flow writes is refused for good", () => {
    const now = NOW + 60_000;
    const cases: Run[] = [
      runWith("cp-won-1", [100, 100, 100, 100, 100, 100, 100, 100, 100, 100], "won"), runWith("cp-complete-1", [100, 100, 100, 100, 100, 100, 100, 100, 100, 100], "complete"),
      runWith("cp-lost-1", [100, 100, 100], "lost"), runWith("cp-abandon-1", [100, 100], null), runWith("cp-day1-1", [], null),
    ];
    const e1 = runWith("cp-e1-1", [100, 100, 100, 100, 100, 100, 100, 100, 100, 100], "won");
    continueEndless(e1, { pattern: "WWLWL", end: "hearts" }, false);
    const e2 = runWith("cp-e2-1", [100, 100, 100, 100, 100, 100, 100, 100, 100, 100], "won");
    continueEndless(e2, { pattern: "", end: null }, false); // CONTINUE then ABANDON at once: an endless of no dusks
    const e3 = runWith("cp-e3-1", [100, 100, 100, 100, 100, 100, 100, 100, 100, 100], "won");
    continueEndless(e3, { pattern: "W".repeat(54), end: "lastDay" }, false); // the longest endless: day 11 to 64
    const e4 = runWith("cp-e4-1", [], "lost");
    e4.hearts = true;
    e4.lives = 0;
    cases.push(e1, e2, e3, e4);
    for (const run of cases) {
      const entry = entryFromRun(run, run.endlessRun ? "endless" : "run", NOW)!;
      expect(() => checkEntry(entry, now), run.runId).not.toThrow();
      expect(entry.dusks.length).toBeLessThanOrEqual(99);
    }
  });
});

// --------------------------------------------------------------------------------------------------- a storage that is nearly full

/** A storage over `inner` that refuses (QuotaExceededError) a value over `max` characters; every attempt is logged. */
function limited(inner: Mem, max: number): HistoryStorage & { attempts: number[] } {
  const attempts: number[] = [];
  return {
    attempts,
    getItem: (k: string) => inner.getItem(k),
    setItem: (k: string, v: string) => {
      attempts.push(String(v).length);
      if (String(v).length > max) throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      inner.setItem(k, v);
    },
  };
}

describe("4i. a storage that is nearly full (not only one that is always full)", () => {
  it("the first write does not fit but the same list without records does: the new run is kept and EVERY entry's records are gone for good; two writes tried; logged once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (let i = 0; i < 12; i++) {
      at(NOW + i * 1000);
      recordRunEnd(runWith(`q${String(i).padStart(2, "0")}-1-1`, [-1, 3000, 3000, 3000]), { store: ls });
    }
    const whole = ls.getItem(HISTORY_KEY)!.length;
    const withRecs = stored().filter((l) => recBytes(l.entry) > 0).length;
    expect(withRecs).toBe(12);
    const tight = limited(ls, whole + 3000); // the new entry (with records, ~9 KB) will not fit; without any record it will
    at(NOW + 99_000);
    expect(recordRunEnd(runWith("q99-1-1", [-1, 3000, 3000, 3000]), { store: tight })).toEqual(["q99-1-1"]);
    expect(tight.attempts).toHaveLength(2);
    expect(tight.attempts[1]).toBeLessThan(tight.attempts[0] / 3);
    expect(ids()[0]).toBe("q99-1-1");
    expect(ids()).toHaveLength(13);
    expect(stored().filter((l) => recBytes(l.entry) > 0)).toHaveLength(0); // NOTE: the 12 older entries lost their records too
    expect(warn.mock.calls.filter((c) => String(c[0]).startsWith("run history: QuotaExceededError"))).toHaveLength(1);
    // and the records never come back: the next run's records are kept again while there is room
    at(NOW + 100_000);
    expect(recordRunEnd(runWith("q100-1-1", [-1, 3000, 3000, 3000]), { store: ls })).toEqual(["q100-1-1"]);
    expect(stored().filter((l) => recBytes(l.entry) > 0).map((l) => l.entry.id)).toEqual(["q100-1-1"]);
  });

  it("not even the list without records fits: the run is not stored, the old value stays byte for byte, nothing throws, one log line", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    put([{ id: "old-1-1", ts: NOW - 5000, recs: [2000] }]);
    const text = ls.getItem(HISTORY_KEY);
    const tight = limited(ls, 50); // smaller than the list without any record
    expect(recordRunEnd(runWith("new-1-1", [-1, 500]), { store: tight })).toEqual([]);
    expect(tight.attempts).toHaveLength(2);
    expect(ls.getItem(HISTORY_KEY)).toBe(text);
    expect(warn.mock.calls.filter((c) => String(c[0]).startsWith("run history"))).toHaveLength(1);
  });

  it("NOTE: a mark, a stamp or a merge that does not fit changes nothing and is not retried without records: the entries stay unsent (sent again at each trigger), the hourly gate never closes, the download is fetched again", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    put([{ id: "a-1-1", ts: NOW - 1000 }, { id: "b-1-1", ts: NOW - 2000 }]);
    const text = ls.getItem(HISTORY_KEY)!;
    const full = limited(ls, text.length); // exactly as much as is there now
    markSent(["a-1-1"], P, full);
    stampSynced(NOW, full);
    expect(mergeDownloaded([entryOf("d-1-1", {}, NOW - 3000)], P, full)).toBe(0);
    expect(full.attempts).toHaveLength(3);
    expect(ls.getItem(HISTORY_KEY)).toBe(text);
    expect(unsentFor(P, ls).map((e) => e.id)).toEqual(["a-1-1", "b-1-1"]); // "a" is still to be sent: the next trigger sends it again (the server answers 200)
    expect(readHistory(ls).state.syncedAt).toBeUndefined();
  });

  it("a storage whose read throws (access denied) is an empty history and a write that throws is not a crash: the folds, the summary and the sync's calls all return", async () => {
    const denied: HistoryStorage = { getItem: () => { throw new DOMException("denied", "SecurityError"); }, setItem: () => { throw new DOMException("denied", "SecurityError"); } };
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(readHistory(denied)).toEqual({ state: { entries: [] }, newer: false });
    expect(recordRunEnd(runWith("den-1-1", [100]), { store: denied })).toEqual([]);
    expect(unsentFor(P, denied)).toEqual([]);
    expect(() => markSent(["x"], P, denied)).not.toThrow();
    expect(() => stampSynced(1, denied)).not.toThrow();
    expect(mergeDownloaded([entryOf("d-1-1")], P, denied)).toBe(0);
    expect(writeHistory({ entries: [] }, denied)).toBe(false);
    expect(writeHistory({ entries: [] }, null)).toBe(false);
  });
});

// ------------------------------------------------------------------------------------------------------ a newer version's store

describe("4i. a newer version's store is left alone, in its classes", () => {
  const sync = async (): Promise<string[]> => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string, i?: RequestInit) => { calls.push(`${i?.method ?? "GET"} ${u}`); return new Response("{}", { status: 500 }); }));
    const d = await device(0, ls);
    ls.setItem(LINK_KEY, encodeLink({ v: 1, player: d.id.keyId ?? d.id.playerId, key: d.id.keyId ?? d.id.playerId, at: NOW }));
    await syncHistory("http://127.0.0.1:9", d.id, { store: ls });
    await startupHistorySync("http://127.0.0.1:9", d.id, { store: ls, now: () => NOW + 9e9 });
    await historyIdle();
    return calls;
  };

  it.each<[string, boolean]>([
    ['{"v":2,"entries":[{"entry":"future"}]}', true], ['{"v":3}', true], ['{"v":1.5,"entries":[]}', true], ['{"v":99999999999,"entries":"x"}', true], ['{"v":2}', true],
  ])("%s is a newer store: no read of its entries, no write by any call, no request by the sync", async (value, newer) => {
    ls.setItem(HISTORY_KEY, value);
    ls.log.length = 0;
    expect(readHistory(ls)).toEqual({ state: { entries: [] }, newer });
    const run = playedRun({ pattern: "WWWWWWWWWW", runId: "nw-1-1", records: false });
    foldDuskResult(run, run.history[9]);
    foldRunEnd(run);
    expect(recordRunEnd(run, { store: ls })).toEqual([]);
    markSent(["a"], P, ls);
    stampSynced(5, ls);
    expect(mergeDownloaded([entryOf("x-1-1")], P, ls)).toBe(0);
    expect(unsentFor(P, ls)).toEqual([]);
    expect(await sync()).toEqual([]);
    expect(ls.getItem(HISTORY_KEY)).toBe(value);
    expect(ls.log.filter((k) => k === HISTORY_KEY)).toHaveLength(0);
  });

  it.each([['{"v":"2","entries":[]}'], ['{"v":true}'], ['{"v":0,"entries":[]}'], ['{"v":-1,"entries":[]}'], ['{"v":null,"entries":[]}'], ['{"entries":[]}'], ['[2]'], ['"2"']])(
    "NOTE: %s is not a number above 1, so it reads as a broken value (empty) and the next write replaces it",
    (value) => {
      ls.setItem(HISTORY_KEY, value);
      expect(readHistory(ls)).toEqual({ state: { entries: [] }, newer: false });
      expect(recordRunEnd(playedRun({ pattern: "WL", end: "lost", runId: "bk-1-1", records: false }), { store: ls })).toEqual(["bk-1-1"]);
      expect(JSON.parse(ls.getItem(HISTORY_KEY)!).v).toBe(1);
    },
  );
});

// ------------------------------------------------------------------------------------------------------- the end paths, once more

describe("4i. end paths the existing tests do not walk", () => {
  it("a run reloaded from its saved JSON (every object new) folds to the same id: nothing is written again, at the dusk or at the summary", () => {
    const run = playedRun({ pattern: "WWWWWWWWWW", end: "won", runId: "rl-1-1", records: false });
    foldDuskResult(run, run.history[9]);
    const text = ls.getItem(HISTORY_KEY);
    const writes = ls.log.filter((k) => k === HISTORY_KEY).length;
    expect(writes).toBe(1);
    const reloaded = JSON.parse(JSON.stringify(run)) as Run;
    foldRunEnd(reloaded);
    foldDuskResult(reloaded, reloaded.history[9]);
    expect(ls.getItem(HISTORY_KEY)).toBe(text);
    expect(ls.log.filter((k) => k === HISTORY_KEY)).toHaveLength(writes);
  });

  it("every way an endless can end writes the same shape: outcome 'over' for hearts, cap and lastDay; 'abandoned' while the run is not over; one id each", () => {
    for (const end of ["hearts", "cap", "lastDay", null] as const) {
      const run = runWith(`ee-${end}-1`, [100, 100, 100, 100, 100, 100, 100, 100, 100, 100], "won");
      foldDuskResult(run, run.history[9]);
      continueEndless(run, { pattern: "WWL", end }, false);
      foldRunEnd(run);
      foldRunEnd(run);
    }
    const byId = new Map(stored().map((l) => [l.entry.id, l.entry]));
    expect([...byId.keys()].sort()).toEqual(["ee-cap-1", "ee-cap-1_endless", "ee-hearts-1", "ee-hearts-1_endless", "ee-lastDay-1", "ee-lastDay-1_endless", "ee-null-1", "ee-null-1_endless"]);
    for (const end of ["hearts", "cap", "lastDay"]) expect(byId.get(`ee-${end}-1_endless`)).toMatchObject({ kind: "endless", outcome: "over", hearts: true, wins: 2 });
    expect(byId.get("ee-null-1_endless")).toMatchObject({ kind: "endless", outcome: "abandoned" });
    for (const e of byId.values()) expect(e.kind === "endless" ? e.dusks.every((d) => d.day > 10) : e.dusks.every((d) => d.day <= 10)).toBe(true);
  });

  it("NOTE: a run already in endless when this build first sees it (CONTINUE was taken on a build without the history) writes only its endless entry: the run's own entry is never written", () => {
    const run = runWith("up-1-1", [100, 100, 100, 100, 100, 100, 100, 100, 100, 100], "won"); // won on the old build: no entry
    continueEndless(run, { pattern: "WW", end: "hearts" }, false);
    foldDuskResult(run, run.history.at(-1)!);
    foldRunEnd(run);
    expect(ids()).toEqual(["up-1-1_endless"]);
    // and no later fold can add it: the kind follows the run, and the run is an endless run now
    expect(recordRunEnd(run, { store: ls })).toEqual([]);
    expect(ids()).toEqual(["up-1-1_endless"]);
  });

  it("the stored text is the documented shape byte for byte: entries, then sentTo / down in that order, then syncedAt", () => {
    const a = entryOf("g-1-1", {}, NOW - 1000), b = entryOf("g-2-1", {}, NOW - 2000), c = entryOf("g-3-1", {}, NOW - 3000);
    const state: HistoryState = { entries: [{ entry: a, sentTo: P }, { entry: b, down: true }, { entry: c }], syncedAt: 123 };
    expect(writeHistory(state, ls)).toBe(true);
    expect(ls.getItem(HISTORY_KEY)).toBe(`{"v":1,"entries":[{"entry":${encodeEntry(a)},"sentTo":"${P}"},{"entry":${encodeEntry(b)},"down":true},{"entry":${encodeEntry(c)}}],"syncedAt":123}`);
    expect(readHistory(ls).state).toEqual(state);
    expect(JSON.parse(ls.getItem(HISTORY_KEY)!).entries[0].entry.playerId).toBeUndefined();
  });
});

// -------------------------------------------------------------------------------------------- player-built decks against the stand-ins

describe("4i. player-built day-10 decks against the stand-in sizes of IDENT2-REPORT section 1", () => {
  it("measured: a record of the par player's (typical, 3-star) day-1 and day-10 decks, a whole 10-dusk run, what fitEntry keeps, and how many entries the 256 KB budget keeps records for", () => {
    const heroes = Object.keys(HEROES) as HeroId[];
    const sizeOf = (a: HeroId, b: HeroId, day: number, seed: number): number => JSON.stringify(battleRecordFor(playerBuild(a, day, seed), playerBuild(b, day, seed + 7), seed)).length;
    const stat = (xs: number[]) => ({ n: xs.length, min: Math.min(...xs), max: Math.max(...xs), mean: Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) });
    const day1: number[] = [], day10: number[] = [], standIn10: number[] = [];
    const runs: { bytes: number; kept: number; fitted: number }[] = [];
    for (const [i, a] of heroes.entries()) {
      const b = heroes[(i + 1) % heroes.length];
      for (const seed of [1, 2, 3]) {
        day1.push(sizeOf(a, b, 1, seed));
        day10.push(sizeOf(a, b, 10, seed));
        // the whole 10-dusk run of that hero: the deck of each day against another hero's deck of that day
        const sizes = Array.from({ length: 10 }, (_, d) => sizeOf(a, b, d + 1, seed));
        const run = playedRun({ pattern: "WWWWWWWWWW", end: "won", runId: `pb-${a}-${seed}-1`, records: false, hero: a });
        run.history.forEach((h, d) => {
          h.record = battleRecordFor(playerBuild(a, d + 1, seed), playerBuild(b, d + 1, seed + 7), seed);
        });
        const entry = entryFromRun(run, "run", NOW)!;
        const fitted = byteLength(encodeEntry(entry));
        expect(fitted).toBeLessThanOrEqual(HISTORY_ENTRY_MAX_BYTES);
        expect(entry.dusks[9].record, "the newest dusk always keeps its record: one record is far under the limit").toBeDefined();
        expect(entry.dusks.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        runs.push({ bytes: sizes.reduce((x, y) => x + y, 0), kept: entry.dusks.filter((d) => d.record).length, fitted });
      }
    }
    for (const x of heroes) for (const y of heroes) {
      const foe = standInPool(y, 10)[0];
      if (foe) for (const s of standInPool(x, 10)) standIn10.push(JSON.stringify(battleRecordFor(s.build, foe.build, 1)).length);
    }
    const perBudget = runs.map((r) => Math.floor(HISTORY_RECORD_BUDGET / Math.max(1, r.fitted - 445)));
    const out = {
      playerDay1: stat(day1), playerDay10: stat(day10), standInDay10: stat(standIn10),
      run10Records: stat(runs.map((r) => r.bytes)), recordsKeptOf10: stat(runs.map((r) => r.kept)), fittedEntry: stat(runs.map((r) => r.fitted)),
      entriesWithRecordsAtBudget: stat(perBudget),
    };
    console.log(`4i SIZES player-built vs stand-in: ${JSON.stringify(out)}`);
    expect(Math.max(...day10), "a day-10 record of par-player decks fits an entry by far").toBeLessThan(HISTORY_ENTRY_MAX_BYTES / 2);
    expect(Math.min(...runs.map((r) => r.kept))).toBeGreaterThanOrEqual(1);
  });
});
