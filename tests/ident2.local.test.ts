// IDENT-2 step 2 (REQ-BFG-122 clause 4): the device's list of finished runs, src/game/history.ts, written by the two folds in
// src/game/styleFolds.ts. No network: one write per id from either end path, a reload, the endless second entry, ABANDON, the cap and the
// record budget, a newer version's store left alone, a full storage that breaks nothing, and a never-linked offline device that writes only
// the one new key and sends nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HISTORY_KEY, HISTORY_RECORD_BUDGET, entryFromRun, markSent, mergeDownloaded, readHistory, recordRunEnd, resetHistoryWarning, unsentFor,
} from "../src/game/history";
import { foldDuskResult, foldRunEnd } from "../src/game/styleFolds";
import { newRunId, type Run } from "../src/game/run";
import { setSession } from "../src/game/session";
import { historyIdle, resetHistorySync } from "../src/net/historySync";
import {
  HISTORY_AHEAD_MS, HISTORY_BODY_MAX_BYTES, HISTORY_END_SUFFIX, HISTORY_ENTRY_MAX_BYTES, HISTORY_LOCAL_MAX, HISTORY_PLAYER_MAX, byteLength, decodeEntry, encodeEntry, fitEntry,
} from "../src/net/historyWire";
import {
  DELETE_PREFIX, HISTORY_GET_PREFIX, HISTORY_PREFIX, LINK_CODE_PREFIX, LINK_REDEEM_PREFIX, LINK_STEAM_PREFIX, PROFILE_GET_PREFIX, PROFILE_PREFIX, UPLOAD_PREFIX,
} from "../src/net/identity";
import { AT_WINDOW_MS } from "../server/links";
import { readFileSync } from "node:fs";
import { HEROES, RULES_VERSION, type HeroId } from "../src/sim/content";
import { standInPool } from "../src/sim/standInPool";
import { battleRecordFor } from "../src/net/replay";
import { PROFILE_KEY } from "../src/game/profile";
import { LINK_KEY } from "../src/net/linkState";
import { continueEndless, device, entryOf, mem, playedRun, type Mem } from "./ident2Local";
import { NOW } from "./profileupWire";

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
const entries = () => readHistory(ls).state.entries.map((l) => l.entry);
const lastRow = (run: Run) => run.history[run.history.length - 1];
const historyWrites = () => ls.log.filter((k) => k === HISTORY_KEY).length;
const storedText = (id: string): string => {
  const raw = JSON.parse(ls.getItem(HISTORY_KEY)!) as { entries: { entry: { id: string } }[] };
  return JSON.stringify(raw.entries.find((x) => x.entry.id === id)!.entry);
};

describe("the entry of a finished run", () => {
  it("is the run's canonical wire form: the summary, a row per dusk with its record, no player id", () => {
    const run = playedRun({ pattern: "WWLWWWDWWW", end: "complete", runId: "abc-def-1" });
    foldDuskResult(run, lastRow(run));
    const [e] = entries();
    expect(entries()).toHaveLength(1);
    expect(e).toMatchObject({ id: "abc-def-1", runId: "abc-def-1", kind: "run", rules: RULES_VERSION, hero: "furnace", outcome: "complete", wins: 8, days: 10, hearts: run.hearts === true, lives: run.lives, finishedAt: NOW });
    expect(e.dusks).toHaveLength(10);
    expect(e.dusks.map((d) => d.outcome).join(",")).toBe("win,win,loss,win,win,win,draw,win,win,win");
    expect(e.dusks.every((d, i) => d.day === i + 1)).toBe(true);
    // ten records are over 16 KB: the OLDEST dusks' records went to fit, the newest dusk keeps its record, every record kept is this build's
    expect(e.dusks[9].record?.rules).toBe(RULES_VERSION);
    expect(e.dusks.some((d) => d.record === undefined)).toBe(true);
    expect(e.dusks.filter((d) => d.record).every((d) => d.record!.rules === RULES_VERSION)).toBe(true);
    expect(Object.keys(e)).toEqual(["id", "runId", "kind", "rules", "hero", "outcome", "wins", "days", "lives", "hearts", "finishedAt", "dusks"]);
    // the stored text of the entry IS its canonical form, and decodes back to it
    const stored = JSON.parse(ls.getItem(HISTORY_KEY)!) as { v: number; entries: { entry: unknown }[] };
    expect(stored.v).toBe(1);
    expect(storedText("abc-def-1")).toBe(encodeEntry(e));
    expect(decodeEntry(encodeEntry(e))).toEqual(e);
    expect(byteLength(encodeEntry(e))).toBeLessThanOrEqual(HISTORY_ENTRY_MAX_BYTES);
    // nothing about a player, a name or a key is in it
    expect(encodeEntry(e)).not.toMatch(/playerId|"name"|publicKey|"key"/);
  });

  it("a lost hearts run keeps its hearts left, a won run its outcome; an offline run has rows without records; newest first", () => {
    const lost = playedRun({ pattern: "WLLLLLLLLL", end: "lost", hearts: true, records: false, runId: "lost-1-1" });
    foldDuskResult(lost, lastRow(lost));
    at(NOW + 1000);
    const won = playedRun({ pattern: "WWWWWWWWWW", end: "won", runId: "won-1-1" });
    foldDuskResult(won, lastRow(won));
    const [w, l] = entries();
    expect(w).toMatchObject({ id: "won-1-1", outcome: "won", wins: 10, hearts: won.hearts === true });
    expect(l).toMatchObject({ id: "lost-1-1", outcome: "lost", wins: 1, hearts: true, lives: 1 });
    expect(l.dusks.every((d) => d.record === undefined)).toBe(true);
    expect(entries().map((e) => e.id)).toEqual(["won-1-1", "lost-1-1"]);
  });

  it("measured sizes: a dusk's record, a whole run's entry with and without records, and what fitEntry keeps", () => {
    const run = playedRun({ pattern: "WWWWWWWWWW", end: "won", runId: "size-1-1" });
    const rec = run.history.map((d) => JSON.stringify(d.record).length);
    const full = entryFromRunFor(run);
    const bare = fitEntry({ ...full, dusks: full.dusks.map((d) => ({ day: d.day, outcome: d.outcome })) }, 1e9);
    // and the heaviest day-10 pairing of the stand-in pool, over every hero against every hero
    let poolRecord = 0;
    for (const x of Object.keys(HEROES) as HeroId[]) {
      for (const y of Object.keys(HEROES) as HeroId[]) {
        const foe = standInPool(y, 10)[0];
        if (foe) for (const a of standInPool(x, 10)) poolRecord = Math.max(poolRecord, JSON.stringify(battleRecordFor(a.build, foe.build, 1)).length);
      }
    }
    const sizes = {
      recordDay1: rec[0], recordDay10: rec[9], recordsTotal: rec.reduce((a2, b2) => a2 + b2, 0), poolRecordDay10: poolRecord,
      entryWithRecords: byteLength(encodeEntry(full)), entryWithoutRecords: byteLength(encodeEntry(bare)),
      recordsKept: full.dusks.filter((d) => d.record).length,
    };
    console.log(`SIZES ${JSON.stringify(sizes)}`);
    expect(sizes.entryWithRecords).toBeLessThanOrEqual(HISTORY_ENTRY_MAX_BYTES);
    expect(sizes.entryWithoutRecords).toBeLessThan(1500);
    // the oldest dusk's record goes first
    const heavy = playedRun({ pattern: "WWWWWWWWWW", end: "won" });
    const unfitted = { ...entryFromRunFor(heavy), dusks: heavy.history.map((d) => ({ day: d.day, outcome: d.outcome, record: d.record! })) };
    const fitted = fitEntry(unfitted, Math.floor(byteLength(encodeEntry(unfitted)) * 0.6));
    const kept = fitted.dusks.map((d) => d.record !== undefined);
    expect(kept.indexOf(true)).toBeGreaterThan(0); // the first dusks lost theirs
    expect(kept.slice(kept.indexOf(true)).every(Boolean)).toBe(true); // the newest keep theirs
    expect(fitted.dusks.map((d) => d.day)).toEqual(unfitted.dusks.map((d) => d.day)); // no dusk row and no summary field is dropped
    expect({ ...fitted, dusks: 0 }).toEqual({ ...unfitted, dusks: 0 });
  });
});

function entryFromRunFor(run: Run) {
  const e = entryFromRun(run, "run", NOW);
  if (!e) throw new Error("no entry");
  return e;
}

describe("each entry id is written ONCE", () => {
  it("the dusk's fold and then the summary's, twice, and a reload: one entry, and the key is written once", () => {
    const run = playedRun({ pattern: "WWWWWWWWWW", end: "complete", runId: "once-1-1" });
    foldDuskResult(run, lastRow(run)); // battle.ts: the dusk that ended the run
    expect(historyWrites()).toBe(1);
    const first = ls.getItem(HISTORY_KEY);
    at(NOW + 5000);
    foldRunEnd(run); // summary.ts enter()
    foldRunEnd(run); // a second visit, a reload of the saved run
    foldDuskResult(run, lastRow(run));
    expect(entries()).toHaveLength(1);
    expect(historyWrites()).toBe(1); // a second write of an id changes nothing: not even a rewrite of the same bytes
    expect(ls.getItem(HISTORY_KEY)).toBe(first);
    expect(readHistory(ls).state.entries[0].entry.finishedAt).toBe(NOW); // the first write's clock, not the later folds'
  });

  it("the summary alone writes it too (a finished run loaded after the dusk's write failed), and then the dusk's fold changes nothing", () => {
    const run = playedRun({ pattern: "WWLLLLLLLL", end: "lost", runId: "sum-1-1" });
    foldRunEnd(run);
    expect(entries().map((e) => e.id)).toEqual(["sum-1-1"]);
    foldDuskResult(run, lastRow(run));
    expect(entries()).toHaveLength(1);
    expect(historyWrites()).toBe(1);
  });

  it("a dusk that does not end the run writes nothing; two runs write two entries", () => {
    const run = playedRun({ pattern: "WWW", end: null, runId: "mid-1-1" });
    foldDuskResult(run, lastRow(run));
    expect(ls.getItem(HISTORY_KEY)).toBeNull();
    const a = playedRun({ pattern: "WWWWWWWWWW", runId: "a-1-1" }), b = playedRun({ pattern: "L", end: "lost", runId: "b-1-1" });
    foldRunEnd(a);
    foldRunEnd(b);
    expect(entries().map((e) => e.id).sort()).toEqual(["a-1-1", "b-1-1"]);
  });

  it("a run id the wire cannot carry gets no entry (and breaks nothing): one with a space, one ending in the endless suffix, one too long", () => {
    for (const bad of ["has space-1-1", `x-1-1${HISTORY_END_SUFFIX}`, "a".repeat(60)]) {
      const run = playedRun({ pattern: "WWWWWWWWWW", runId: bad, records: false });
      expect(() => foldRunEnd(run)).not.toThrow();
    }
    expect(entries()).toHaveLength(0);
  });

  it("no runId the game makes can end in the endless suffix: base 36 digits and '-' only", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 3000; i++) seen.add(newRunId(i * 7919));
    expect(seen.size).toBe(3000);
    for (const id of seen) {
      expect(id).toMatch(/^[0-9a-z]+-[0-9a-z]+-[0-9a-z]+$/);
      expect(id.endsWith(HISTORY_END_SUFFIX)).toBe(false);
      expect((id + HISTORY_END_SUFFIX).length).toBeLessThanOrEqual(64);
    }
  });
});

describe("ENDLESS: the run's entry is written at its WIN_GOAL-th win and never changes; the endless gets a second entry", () => {
  it("run entry at the win, CONTINUE, endless dusks, ENDLESS OVER: a second entry with the endless dusks and the score only", () => {
    const run = playedRun({ pattern: "WWWWWWWWWW", end: "won", runId: "end-1-1" });
    foldDuskResult(run, lastRow(run)); // the 10th win: the run is won (endless is OFFERED, not taken)
    const first = storedText("end-1-1");
    at(NOW + 60_000);
    foldRunEnd(run); // the RUN WON summary: nothing new
    expect(entries().map((e) => e.id)).toEqual(["end-1-1"]);

    continueEndless(run, { pattern: "WWLWWLL", end: "hearts" }); // CONTINUE ENDLESS: three hearts; the third lost ends it
    expect(historyWrites()).toBe(1); // CONTINUE itself writes nothing
    at(NOW + 120_000);
    foldDuskResult(run, lastRow(run)); // the endless dusk that ended it
    const [endless, base] = entries(); // newest first
    expect(endless).toMatchObject({ id: `end-1-1${HISTORY_END_SUFFIX}`, runId: "end-1-1", kind: "endless", outcome: "over", wins: 4, days: 17, hearts: true, lives: 0, finishedAt: NOW + 120_000 });
    expect(endless.dusks.map((d) => d.day)).toEqual([11, 12, 13, 14, 15, 16, 17]); // the endless dusks only
    expect(endless.dusks.map((d) => d.outcome).join(",")).toBe("win,win,loss,win,win,loss,loss");
    expect(base).toMatchObject({ id: "end-1-1", kind: "run", outcome: "won", wins: 10, days: 10 });
    expect(base.dusks.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]); // the run's own dusks only
    expect(storedText("end-1-1")).toBe(first); // the run's entry never changes
    foldRunEnd(run); // the ENDLESS OVER summary
    foldDuskResult(run, lastRow(run));
    expect(entries()).toHaveLength(2);
    expect(historyWrites()).toBe(2);
    expect(storedText("end-1-1")).toBe(first);
  });

  it("ABANDON in endless writes the endless entry as 'abandoned' (the run's own entry is already there), once", () => {
    const run = playedRun({ pattern: "WWWWWWWWWW", end: "won", runId: "eab-1-1" });
    foldDuskResult(run, lastRow(run));
    continueEndless(run, { pattern: "WW", end: null }); // still playing: run.over is null
    expect(run.over).toBeNull();
    at(NOW + 1000);
    foldRunEnd(run); // chrome.ts ABANDON RUN
    foldRunEnd(run);
    const [endless, base] = entries();
    expect(endless).toMatchObject({ id: `eab-1-1${HISTORY_END_SUFFIX}`, kind: "endless", outcome: "abandoned", wins: 2, days: 12 });
    expect(endless.dusks).toHaveLength(2);
    expect(base).toMatchObject({ id: "eab-1-1", kind: "run", outcome: "won" });
    expect(entries()).toHaveLength(2);
  });
});

describe("ABANDON: outcome 'abandoned' while run.over is null", () => {
  it("a run in progress is written once, with the dusks it fought; a second ABANDON or summary changes nothing", () => {
    const run = playedRun({ pattern: "WL", end: null, runId: "ab-1-1" });
    run.day = 3; // the dawn of day 3 was reached before the player abandoned
    foldRunEnd(run);
    foldRunEnd(run);
    expect(entries()).toHaveLength(1);
    expect(entries()[0]).toMatchObject({ id: "ab-1-1", kind: "run", outcome: "abandoned", wins: 1, days: 3 });
    expect(entries()[0].dusks.map((d) => d.day)).toEqual([1, 2]);
    expect(historyWrites()).toBe(1);
  });

  it("an ABANDON on day 1, before any dusk, is an entry with no rows", () => {
    const run = playedRun({ pattern: "", end: null, runId: "ab0-1-1", records: false });
    foldRunEnd(run);
    expect(entries()[0]).toMatchObject({ id: "ab0-1-1", outcome: "abandoned", wins: 0, days: 1, dusks: [] });
  });
});

describe("the cap and the record budget", () => {
  it("at most 50 entries, newest first; the oldest go", () => {
    for (let i = 0; i < 60; i++) {
      at(NOW + i * 1000);
      foldRunEnd(playedRun({ pattern: "WL", end: "lost", runId: `cap-${i}-1`, records: false }));
    }
    const es = entries();
    expect(HISTORY_LOCAL_MAX).toBe(50);
    expect(es).toHaveLength(50);
    expect(es[0].id).toBe("cap-59-1");
    expect(es[49].id).toBe("cap-10-1");
    expect(es.map((e) => e.finishedAt)).toEqual([...es.map((e) => e.finishedAt)].sort((a, b) => b - a));
  });

  it("the records of the whole key stay under the budget; the newest entries keep theirs first, the older ones keep their rows and summary", () => {
    for (let i = 0; i < 50; i++) {
      at(NOW + i * 1000);
      foldRunEnd(playedRun({ pattern: "WWWWWWWWWW", end: "won", runId: `bud-${i}-1` }));
    }
    const es = entries();
    const has = es.map((e) => e.dusks.some((d) => d.record !== undefined));
    const firstBare = has.indexOf(false);
    console.log(`BUDGET entries with records: ${has.filter(Boolean).length} of ${es.length}; key ${ls.getItem(HISTORY_KEY)!.length} bytes`);
    expect(has[0]).toBe(true);
    expect(firstBare).toBeGreaterThan(0);
    expect(has.slice(firstBare).every((x) => !x)).toBe(true); // a prefix of the newest
    const recordBytes = es.reduce((n, e) => n + e.dusks.reduce((m, d) => m + (d.record ? JSON.stringify(d.record).length : 0), 0), 0);
    expect(recordBytes).toBeLessThanOrEqual(HISTORY_RECORD_BUDGET);
    for (const e of es) {
      expect(e.dusks).toHaveLength(10); // no dusk row is ever dropped
      expect(e.outcome).toBe("won");
      expect(byteLength(encodeEntry(e))).toBeLessThanOrEqual(HISTORY_ENTRY_MAX_BYTES);
    }
  });
});

describe("a newer version's store is left alone; a broken value or a full storage breaks nothing", () => {
  it("a store written by a newer build is not read, not rewritten and not appended to", () => {
    const future = JSON.stringify({ v: 2, entries: [{ entry: "from the future" }], extra: true });
    ls.setItem(HISTORY_KEY, future);
    ls.log.length = 0;
    const run = playedRun({ pattern: "WWWWWWWWWW", runId: "new-1-1" });
    expect(() => foldDuskResult(run, lastRow(run))).not.toThrow();
    foldRunEnd(run);
    expect(ls.getItem(HISTORY_KEY)).toBe(future);
    expect(historyWrites()).toBe(0);
    expect(readHistory(ls).newer).toBe(true);
    expect(recordRunEnd(run, { store: ls })).toEqual([]);
    // and the sync's halves leave it alone too
    expect(unsentFor("P", ls)).toEqual([]);
    expect(mergeDownloaded([entryOf("x-1-1")], "P", ls)).toBe(0);
    markSent(["x-1-1"], "P", ls);
    expect(ls.getItem(HISTORY_KEY)).toBe(future);
  });

  it("a broken value reads as empty and the next write replaces it", () => {
    for (const broken of ["{not json", "[]", JSON.stringify({ v: 1, entries: "x" }), JSON.stringify({ v: 0, entries: [] }), ""]) {
      ls.setItem(HISTORY_KEY, broken);
      const run = playedRun({ pattern: "WWWWWWWWWW", runId: "brk-1-1", records: false });
      expect(() => foldRunEnd(run)).not.toThrow();
      expect(entries().map((e) => e.id), JSON.stringify(broken)).toEqual(["brk-1-1"]);
      ls.removeItem(HISTORY_KEY);
    }
  });

  it("an entry in the store that this build cannot read is dropped at the next write; the others stay", () => {
    const good = entryOf("good-1-1");
    ls.setItem(HISTORY_KEY, `{"v":1,"entries":[{"entry":${encodeEntry(good)}},{"entry":{"id":"bad"}},{"entry":null},7]}`);
    expect(entries().map((e) => e.id)).toEqual(["good-1-1"]);
    foldRunEnd(playedRun({ pattern: "WWWWWWWWWW", runId: "nw-1-1", records: false }));
    expect(entries().map((e) => e.id).sort()).toEqual(["good-1-1", "nw-1-1"]);
  });

  it("a full localStorage (QuotaExceededError) never breaks the fold or the summary, and is logged once a page load", () => {
    const full = mem({ full: true });
    vi.stubGlobal("localStorage", full);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const r1 = playedRun({ pattern: "WWWWWWWWWW", end: "complete", runId: "full-1-1" });
    const r2 = playedRun({ pattern: "WL", end: null, runId: "full-2-1" });
    expect(() => foldDuskResult(r1, lastRow(r1))).not.toThrow();
    expect(() => foldRunEnd(r1)).not.toThrow();
    expect(() => foldRunEnd(r2)).not.toThrow();
    expect(Array.isArray(foldRunEnd(r2))).toBe(true);
    expect(recordRunEnd(r1, { store: full })).toEqual([]);
    const history = warn.mock.calls.filter((c) => String(c[0]).startsWith("run history"));
    expect(history).toHaveLength(1);
    expect(readHistory(full).state.entries).toEqual([]);
    resetHistoryWarning(); // a new page load logs again
    recordRunEnd(r2, { store: full });
    expect(warn.mock.calls.filter((c) => String(c[0]).startsWith("run history"))).toHaveLength(2);
  });

  it("no storage at all (a page without localStorage) breaks nothing", () => {
    vi.stubGlobal("localStorage", undefined);
    const run = playedRun({ pattern: "WWWWWWWWWW", runId: "nols-1-1" });
    expect(() => foldDuskResult(run, lastRow(run))).not.toThrow();
    expect(() => foldRunEnd(run)).not.toThrow();
    expect(readHistory(null).state.entries).toEqual([]);
  });
});

describe("the wire module and the signing domains", () => {
  it("the two new domains are additive: their bytes are fixed, and no domain's bytes begin another's", () => {
    expect(HISTORY_PREFIX).toBe("bb-history-1\n");
    expect(HISTORY_GET_PREFIX).toBe("bb-history-get-1\n");
    const all = [UPLOAD_PREFIX, PROFILE_PREFIX, LINK_CODE_PREFIX, LINK_REDEEM_PREFIX, LINK_STEAM_PREFIX, PROFILE_GET_PREFIX, DELETE_PREFIX, HISTORY_PREFIX, HISTORY_GET_PREFIX];
    expect(new Set(all).size).toBe(9);
    for (const a of all) {
      expect(a.endsWith("\n") && a.indexOf("\n") === a.length - 1).toBe(true);
      for (const b of all) if (a !== b) expect(b.startsWith(a)).toBe(false);
    }
    // the seven IDENT-1 domains are byte for byte what they were
    expect(all.slice(0, 7)).toEqual(["bb-ghost-upload-1\n", "bb-profile-1\n", "bb-link-code-1\n", "bb-link-redeem-1\n", "bb-link-steam-1\n", "bb-profile-get-1\n", "bb-delete-1\n"]);
  });

  it("src/net/historyWire.ts is pure: it imports types only, so the device, the client and the server share it without sharing a runtime", () => {
    const src = readFileSync("src/net/historyWire.ts", "utf8");
    const imports = src.split("\n").filter((l) => /^import\b/.test(l));
    expect(imports.length).toBeGreaterThan(0);
    for (const l of imports) expect(l).toMatch(/^import type /);
  });

  it("the finishedAt bound is the signed requests' replay bound (server/links.ts AT_WINDOW_MS)", () => {
    expect(HISTORY_AHEAD_MS).toBe(AT_WINDOW_MS);
    expect(HISTORY_LOCAL_MAX).toBe(50);
    expect(HISTORY_PLAYER_MAX).toBe(200);
    expect(HISTORY_ENTRY_MAX_BYTES).toBe(16_000);
    expect(HISTORY_BODY_MAX_BYTES).toBe(16_384);
    expect(HISTORY_RECORD_BUDGET).toBe(256 * 1024);
  });
});

describe("a device that was never linked", () => {
  it("offline: the fold writes the one new key (history) beside the profile's, no link record, and sends nothing", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const run = playedRun({ pattern: "WWWWWWWWWW", end: "complete", runId: "off-1-1" });
    foldDuskResult(run, lastRow(run));
    foldRunEnd(run);
    await historyIdle();
    expect(ls.keys()).toEqual([HISTORY_KEY, PROFILE_KEY].sort());
    expect(ls.getItem(LINK_KEY)).toBeNull();
    expect(entries().map((e) => e.id)).toEqual(["off-1-1"]);
    expect(entries()[0].dusks).toHaveLength(10);
    expect(entries()[0].dusks[9].record?.rules).toBe(RULES_VERSION); // the newest dusk keeps its record (the 16 KB fit drops the oldest first)
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(unsentFor("anyone", ls).map((e) => e.id)).toEqual(["off-1-1"]); // waiting for a link
  });

  it("online but never linked (the session has an identity, no link record): still no request, and nothing but the history key is new", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const d = await device(0, ls);
    const profileChanged = vi.fn();
    setSession({ url: "http://127.0.0.1:9", active: true, failed: false, identity: d.id, tick() {}, settle() {}, submitDusk() {}, countRun() {}, profileChanged } as never);
    const run = playedRun({ pattern: "WWWWWWWWWW", end: "complete", runId: "on-1-1" });
    foldDuskResult(run, lastRow(run));
    foldRunEnd(run);
    await historyIdle();
    expect(profileChanged).toHaveBeenCalledTimes(2); // the profile upload's own trigger is untouched
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(ls.keys()).toEqual([HISTORY_KEY, PROFILE_KEY].sort());
  });
});

describe("the local list's sync half: unsent, sent, downloaded", () => {
  it("unsentFor lists local entries not yet sent to THAT player, newest first; markSent marks them; a downloaded entry is never listed", () => {
    for (let i = 0; i < 3; i++) {
      at(NOW + i * 1000);
      foldRunEnd(playedRun({ pattern: "WL", end: "lost", runId: `u${i}-1-1`, records: false }));
    }
    expect(mergeDownloaded([entryOf("dl-1-1", {}, NOW - 5000)], "P", ls)).toBe(1);
    expect(unsentFor("P", ls).map((e) => e.id)).toEqual(["u2-1-1", "u1-1-1", "u0-1-1"]);
    markSent(["u2-1-1", "dl-1-1"], "P", ls);
    expect(unsentFor("P", ls).map((e) => e.id)).toEqual(["u1-1-1", "u0-1-1"]);
    expect(unsentFor("Q", ls).map((e) => e.id)).toEqual(["u2-1-1", "u1-1-1", "u0-1-1"]); // sent to P, not to Q (a new player after a deletion)
    const stored = JSON.parse(ls.getItem(HISTORY_KEY)!) as { entries: { entry: { id: string }; sentTo?: string; down?: boolean }[] };
    expect(stored.entries.find((x) => x.entry.id === "dl-1-1")).toMatchObject({ down: true });
    expect(stored.entries.find((x) => x.entry.id === "dl-1-1")!.sentTo).toBeUndefined(); // a downloaded entry is not marked as sent
  });

  it("a merge is a union by id: an entry the device has stays as it is", () => {
    foldRunEnd(playedRun({ pattern: "WL", end: "lost", runId: "same-1-1", records: false }));
    const mine = storedText("same-1-1");
    expect(mergeDownloaded([entryOf("same-1-1", { outcome: "won", wins: 3 }), entryOf("other-1-1", {}, NOW - 9000)], "P", ls)).toBe(1);
    expect(storedText("same-1-1")).toBe(mine);
    expect(entries().map((e) => e.id).sort()).toEqual(["other-1-1", "same-1-1"]);
  });

  it("a merge never drops an entry this device has not sent yet: 50 unsent entries keep their places against newer downloads", () => {
    for (let i = 0; i < 50; i++) {
      at(NOW + i * 1000);
      foldRunEnd(playedRun({ pattern: "WL", end: "lost", runId: `m${i}-1-1`, records: false }));
    }
    const before = entries().map((e) => e.id);
    expect(mergeDownloaded([1, 2, 3].map((k) => entryOf(`new${k}-1-1`, {}, NOW + 900_000 + k)), "P", ls)).toBe(0);
    expect(entries().map((e) => e.id)).toEqual(before);
    // once they are sent, a newer download displaces the OLDEST sent entry
    markSent(before, "P", ls);
    expect(mergeDownloaded([entryOf("new9-1-1", {}, NOW + 900_000)], "P", ls)).toBe(1);
    const after = entries().map((e) => e.id);
    expect(after).toHaveLength(50);
    expect(after[0]).toBe("new9-1-1");
    expect(after).not.toContain("m0-1-1"); // the oldest
    expect(after).toContain("m1-1-1");
    // an older download than everything the device holds is not kept either
    expect(mergeDownloaded([entryOf("old-1-1", {}, NOW - 99_999)], "P", ls)).toBe(0);
    expect(entries().map((e) => e.id)).toEqual(after);
  });
});
