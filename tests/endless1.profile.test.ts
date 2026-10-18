// ENDLESS-1 3.5 (REQ-BFG-059; run 2): the profile parts of 3.2. The personal best ("BEST 9") is kept in the profile and never lowered; it
// stays on the device (the wire form has exactly the 8 counters, PUT /v1/profile is unchanged); an endless run folds it at every endless
// dusk and at its end; and the END of endless is not the run's end for the counters: the run was folded at its 10th win, and the fold
// key that says so ("<runId>:end") is forgotten after FOLDED_MAX folds, which an endless of 20 days makes, so a second end fold would
// count the run (and its FLAWLESS) twice.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BEST_ENDLESS_MAX, FOLDED_MAX, PROFILE_KEY, emptyProfile, foldEnd, foldEndless, loadProfile, migrateProfile, saveProfile, type Profile,
} from "../src/game/profile";
import { foldDuskResult, foldRunEnd, foldWarlordResult, runFacts } from "../src/game/styleFolds";
import { finishDay, startEndless } from "../src/game/day";
import { newRun, type Run } from "../src/game/run";
import { COUNTER_KEYS, decodeWire, encodeWire, toWire } from "../src/net/profileWire";
import { withEndless } from "../src/sim/endless";
import { withLongRun } from "../src/sim/longRun";
import { withHearts } from "../src/sim/hearts";
import type { DayResult } from "../src/game/run";
import type { SideStats } from "../src/sim/battle";

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); },
  key: () => null, length: 0, clear: () => store.clear(),
});
beforeEach(() => store.clear());

const S = {} as SideStats;
const marked = (seed = 31): Run => withHearts(() => withLongRun(() => withEndless(() => newRun("furnace", seed, `e1p-${seed}`))));
const facts = (id: string, wins?: number) => ({ runId: id, ...(wins !== undefined ? { endlessWins: wins } : {}) });

describe("ENDLESS-1 3.5: the personal best in the profile", () => {
  it("a new profile has none; an old profile (no such field) reads as none; a stored best is kept", () => {
    const p = emptyProfile();
    expect(p.bestEndless).toBe(0);
    expect(p.bestEndlessRun).toBe("");
    const old = migrateProfile({ v: 1, counters: { runs: 3 } })!;
    expect(old.bestEndless).toBe(0);
    expect(old.bestEndlessRun).toBe("");
    const kept = migrateProfile({ v: 1, bestEndless: 9, bestEndlessRun: "s-old" })!;
    expect(kept.bestEndless).toBe(9);
    expect(kept.bestEndlessRun).toBe("s-old");
    // malformed values read as none; a run id with no best is dropped; a huge best is clamped
    for (const bad of [-3, "9", null, NaN, {}, [], Infinity]) expect(migrateProfile({ v: 1, bestEndless: bad, bestEndlessRun: "x" })!.bestEndless).toBe(0);
    expect(migrateProfile({ v: 1, bestEndless: 0, bestEndlessRun: "x" })!.bestEndlessRun).toBe("");
    expect(migrateProfile({ v: 1, bestEndless: 5, bestEndlessRun: 7 })!.bestEndlessRun).toBe("");
    expect(migrateProfile({ v: 1, bestEndless: 1e9, bestEndlessRun: "x" })!.bestEndless).toBe(BEST_ENDLESS_MAX);
    expect(migrateProfile({ v: 1, bestEndless: 4.9, bestEndlessRun: "x" })!.bestEndless).toBe(4); // whole numbers
  });

  it("foldEndless keeps the most endless wins any one run reached: a higher score takes it (and its run), a tie or less changes nothing, never lowered", () => {
    const p = emptyProfile();
    expect(foldEndless(p, facts("a"))).toEqual([]); // a run that never played endless
    expect(p.bestEndless).toBe(0);
    foldEndless(p, facts("a", 5));
    expect([p.bestEndless, p.bestEndlessRun]).toEqual([5, "a"]);
    foldEndless(p, facts("b", 3));
    expect([p.bestEndless, p.bestEndlessRun]).toEqual([5, "a"]); // lower: no change
    foldEndless(p, facts("c", 5));
    expect([p.bestEndless, p.bestEndlessRun]).toEqual([5, "a"]); // a tie keeps the earlier run
    foldEndless(p, facts("d", 9));
    expect([p.bestEndless, p.bestEndlessRun]).toEqual([9, "d"]);
    foldEndless(p, facts("e", 0));
    foldEndless(p, facts("f", 8));
    expect([p.bestEndless, p.bestEndlessRun]).toEqual([9, "d"]); // never lowered
    foldEndless(p, facts("d", 9)); // the same run again (each dusk, the end, the summary): nothing changes
    expect([p.bestEndless, p.bestEndlessRun]).toEqual([9, "d"]);
    foldEndless(p, { runId: "g", endlessWins: Number.NaN });
    foldEndless(p, { runId: "g", endlessWins: -4 });
    expect(p.bestEndless).toBe(9);
    foldEndless(p, facts("h", 1e6));
    expect(p.bestEndless).toBe(BEST_ENDLESS_MAX);
  });

  it("it is display only: the wire form has exactly the 8 counters and no best, and two profiles that differ only in their best encode alike", () => {
    const a = emptyProfile(), b = emptyProfile();
    b.bestEndless = 12;
    b.bestEndlessRun = "r";
    a.updatedAt = b.updatedAt = Date.UTC(2026, 9, 18);
    expect(encodeWire(toWire(a))).toBe(encodeWire(toWire(b)));
    expect(JSON.stringify(Object.keys(toWire(b).counters))).toBe(JSON.stringify([...COUNTER_KEYS]));
    expect(encodeWire(toWire(b))).not.toMatch(/endless/i); // (bestDay is a counter of its own)
    expect(decodeWire(encodeWire(toWire(b)))).toEqual(toWire(a));
    expect(Object.keys(toWire(b)).sort()).toEqual(["chosen", "counters", "heroesFinished", "heroesWon", "unlocked", "updatedAt", "v"]);
  });

  it("a newer profile (v2) keeps its best on read and is never written back (profile.ts's rule for every field)", () => {
    store.set(PROFILE_KEY, JSON.stringify({ v: 2, bestEndless: 11, bestEndlessRun: "z" }));
    const p = loadProfile();
    expect(p.bestEndless).toBe(11);
    expect(saveProfile(p)).toBe(false);
  });
});

describe("ENDLESS-1 3.5: the folds of a run that plays endless", () => {
  /** What the battle screen does after a dusk and a warlord: finishDay, then the folds (styleFolds.ts). */
  function day(run: Run, outcome: 0 | 1 | -1, warlord = true): DayResult {
    const d = run.day;
    if (warlord) foldWarlordResult(run, d, "win", "easy");
    const res = finishDay(run, outcome, 30, S, S);
    foldDuskResult(run, { day: d, outcome: outcome === 0 ? "win" : outcome === 1 ? "loss" : "draw" });
    return res;
  }

  it("the run's end is folded once, at its 10th win; every endless dusk folds the best; the end of a LONG endless folds no second run", () => {
    const run = marked();
    for (let i = 0; i < 10; i++) day(run, 0);
    expect(run.over).toBe("won");
    let p = loadProfile();
    expect([p.counters.runs, p.counters.runsFinished, p.counters.flawless]).toEqual([1, 1, 1]);
    expect(p.bestEndless).toBe(0);
    expect(startEndless(run)).toBe(true);
    // 26 endless days with a warlord fold and a dusk fold each: far more than FOLDED_MAX keys after "<runId>:end"
    for (let i = 0; i < 26; i++) {
      day(run, 0);
      expect(loadProfile().bestEndless, `after endless win ${i + 1}`).toBe(i + 1);
    }
    p = loadProfile();
    expect(p.folded.length).toBeLessThanOrEqual(FOLDED_MAX);
    expect(p.folded, "precondition: the run's end key has been forgotten").not.toContain(`${run.runId}:end`);
    expect(run.endlessRun!.wins).toBe(26);
    for (let i = 0; i < 3; i++) day(run, 1); // 3 hearts lost
    expect(run.over).toBe("won");
    expect(run.endlessRun!.end).toBe("hearts");
    p = loadProfile();
    expect([p.counters.runs, p.counters.runsFinished, p.counters.flawless], "the end of endless is not a second run").toEqual([1, 1, 1]);
    expect([p.bestEndless, p.bestEndlessRun]).toEqual([26, run.runId]);
    // the summary's own fold (and an ABANDON) change nothing either
    foldRunEnd(run);
    foldRunEnd(run);
    p = loadProfile();
    expect([p.counters.runs, p.counters.runsFinished, p.counters.flawless]).toEqual([1, 1, 1]);
    expect(p.bestEndless).toBe(26);
    // endless wins count as dusk wins (display counters: nothing earned is taken away)
    expect(p.counters.duskWins).toBe(10 + 26);
  });

  it("the old double count is real without the guard: foldEnd on the profile whose end key was forgotten counts the run again", () => {
    const run = marked(32);
    for (let i = 0; i < 10; i++) day(run, 0);
    const p = loadProfile();
    p.folded = Array.from({ length: FOLDED_MAX }, (_, i) => `x${i}:1`); // the key is gone
    foldEnd(p, runFacts(run));
    expect(p.counters.runs).toBe(2); // what foldRunEnd / foldDuskResult would have done at the end of endless: the guard is the endlessRun test there
  });

  it("ABANDON during endless folds the best and not the run again; a run that never took endless folds its end as ever", () => {
    const run = marked(33);
    for (let i = 0; i < 10; i++) day(run, 0, false);
    startEndless(run);
    for (let i = 0; i < 4; i++) day(run, 0, false);
    foldRunEnd(run); // chrome.ts's ABANDON RUN
    const p = loadProfile();
    expect([p.counters.runs, p.counters.runsFinished]).toEqual([1, 1]);
    expect(p.bestEndless).toBe(4);
    const plain = marked(34);
    for (let i = 0; i < 10; i++) day(plain, 0, false);
    const before = loadProfile().counters.runs;
    foldRunEnd(plain); // the summary of a won run that ends here: already folded by its 10th dusk: no change
    expect(loadProfile().counters.runs).toBe(before);
    const lost = marked(35);
    for (let i = 0; i < 40 && !lost.over; i++) day(lost, 1, false);
    expect(lost.over).toBe("lost");
    expect(loadProfile().counters.runs).toBe(before + 1); // a lost run folds its end once
    expect(loadProfile().bestEndless).toBe(4); // and no endless best
  });

  it("runFacts carries the endless wins of a run that took endless, and nothing of a run that did not", () => {
    const run = marked(36);
    for (let i = 0; i < 10; i++) day(run, 0, false);
    expect(runFacts(run)).not.toHaveProperty("endlessWins");
    startEndless(run);
    day(run, 0, false);
    day(run, 0, false);
    expect(runFacts(run).endlessWins).toBe(2);
  });

  it("a save of the profile round-trips the best", () => {
    const p: Profile = emptyProfile();
    p.bestEndless = 7;
    p.bestEndlessRun = "rr";
    expect(saveProfile(p)).toBe(true);
    const q = loadProfile();
    expect([q.bestEndless, q.bestEndlessRun]).toEqual([7, "rr"]);
  });
});
