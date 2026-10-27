// CUSTOM-2a (REQ-BFG-072; REVIEW-CUSTOM1 Q1, turn 9ecab1cc78e896d5): the profile store (src/game/profile.ts) and its
// folds (src/game/styleFolds.ts). Load, migrate and seed; folds count once across CONTINUE and reloads; each trigger;
// the never-downgrade rule; a corrupt key resets safely; the run save is unchanged.
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  FOLDED_MAX, PROFILE_KEY, PROFILE_V, SEED_GHOST_KEY, SEED_RUNS_KEY, SEED_SAVE_KEY, chosenSkin, commitFold, emptyProfile,
  evaluateUnlocks, foldDusk, foldEnd, foldWarlord, isOpen, loadProfile, markSeen, migrateProfile, playerSkin,
  runUnlockNames, saveProfile, seedProfile, unseen, wear, type RunFacts,
} from "../src/game/profile";
import { foldDuskResult, foldRunEnd, foldWarlordResult, runFacts } from "../src/game/styleFolds";
import { HISTORY_KEY } from "../src/game/history"; // IDENT-2: ABANDON writes the run's entry to the run history
import { GHOST_KEY } from "../src/game/ghosts";
import { RUNS_KEY } from "../src/game/online";
import { RUN_VERSION, SAVE_KEY, newRun } from "../src/game/run";
import { finishDay } from "../src/game/day";
import { BELTS, DEFAULT_SKIN, FLOORS, PANELS, styleKey } from "../src/render/styles";

function mem(): Storage & { keys(): string[] } {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; }, clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k), keys: () => [...m.keys()].sort(),
  };
}

const g = globalThis as { localStorage?: Storage };
afterEach(() => { delete g.localStorage; });

const facts = (o: Partial<RunFacts> = {}): RunFacts => ({ runId: "r1", hero: "furnace", day: 2, over: null, flawless: false, belts: 1, ...o });
const NOSTATS = { dealt: 0, taken: 0, shots: 0, fired: 0, shielded: 0, healed: 0 } as unknown as Parameters<typeof finishDay>[3];

describe("CUSTOM-2a profile store (beltbattles.profile.v1)", () => {
  it("one offline key; the seed reads the modules' own keys; the run save is unchanged (no version bump)", () => {
    expect(PROFILE_KEY).toBe("beltbattles.profile.v1");
    expect(PROFILE_V).toBe(1);
    expect(SEED_GHOST_KEY).toBe(GHOST_KEY);
    expect(SEED_RUNS_KEY).toBe(RUNS_KEY);
    expect(SEED_SAVE_KEY).toBe(SAVE_KEY);
    expect(SAVE_KEY).toBe("beltbattles.run.v7");
    expect(RUN_VERSION).toBe(8);
    const run = newRun("furnace", 7);
    expect(run).not.toHaveProperty("profile");
  });

  it("load: an absent key is seeded once from the ghost pool (and RUNS_KEY), written, then read back as stored", () => {
    const st = mem();
    const snap = (runId: string, hero: string, day: number, wins: number) => ({ v: 2, rules: "x", hero, day, wins, lives: 5, build: {}, runId, playerId: "p", createdAt: 0 });
    st.setItem(GHOST_KEY, JSON.stringify([
      snap("a", "furnace", 1, 0), snap("a", "furnace", 2, 1), snap("a", "furnace", 6, 4),
      snap("b", "weaver", 1, 0), snap("b", "weaver", 3, 2),
      snap("cur", "foundry", 2, 1), // the run in progress (the save's): its end is folded later, so not a run yet
      { junk: true },
    ]));
    st.setItem(SAVE_KEY, JSON.stringify({ runId: "cur", version: 8 }));
    const p = loadProfile(st);
    expect(p.counters.bestDay).toBe(6);
    expect(p.counters.duskWins).toBe(4 + 2 + 1); // per run, the last snapshot's wins going in
    expect(p.counters.runs).toBe(2); // a, b (not cur)
    expect(p.heroesWon.sort()).toEqual(["foundry", "furnace", "weaver"]);
    // seeded unlocks: TIMBER DECK (3 wins), TREAD PLATE (day 5), VERDIGRIS belts (2 runs), TIMBER ROLLERS (2 heroes won)
    expect(p.unlocked).toEqual(expect.arrayContaining([styleKey("floor", "timber"), styleKey("floor", "tread"), styleKey("belt", "verdigris"), styleKey("belt", "timber")]));
    expect(p.unlocked).not.toContain(styleKey("floor", "checker"));
    expect(JSON.parse(st.getItem(PROFILE_KEY)!).counters.duskWins).toBe(7); // written once
    // the pool grows, but the stored profile is read, never re-seeded
    st.setItem(GHOST_KEY, JSON.stringify([snap("z", "bastion", 9, 8)]));
    expect(loadProfile(st).counters.duskWins).toBe(7);
    // online: RUNS_KEY's finished runs raise the seeded count
    const s2 = mem();
    s2.setItem(RUNS_KEY, JSON.stringify({ runs: 5, last: "x" }));
    expect(seedProfile(s2).counters.runs).toBe(5);
    // nothing kept: an empty profile in today's look
    const s3 = mem();
    const e = loadProfile(s3);
    expect(e.counters).toEqual(emptyProfile().counters);
    expect(chosenSkin(e)).toEqual(DEFAULT_SKIN);
    expect(s3.keys()).toEqual([PROFILE_KEY]);
  });

  it("migrate: every missing or malformed field is defaulted; an unknown or locked choice is worn as the default", () => {
    const p = migrateProfile({ v: 1, counters: { duskWins: 4, runs: -3, bestDay: "x" }, unlocked: ["style:floor.timber", 7], chosen: { floor: "timber", belt: "nope", panel: "plum" } })!;
    expect(p.counters).toEqual({ ...emptyProfile().counters, duskWins: 4 });
    expect(p.heroesWon).toEqual([]);
    expect(p.seen).toEqual([]);
    expect(p.folded).toEqual([]);
    expect(p.runNew).toBeNull();
    expect(p.unlocked).toEqual(["style:floor.timber"]);
    expect(p.chosen).toEqual({ floor: "timber", belt: "iron", panel: "plum", carrier: "war" }); // CUSTOM-3: no carrier choice stored: WAR COLOURS
    expect(chosenSkin(p)).toEqual({ floor: "timber", belt: "iron", panel: "slate", carrier: "war" }); // plum is not unlocked: worn as SLATE
    expect(migrateProfile({})!.v).toBe(1);
    for (const bad of [null, 42, "x", [], [1]]) expect(migrateProfile(bad)).toBeNull();
  });

  it("never downgrades: a newer v is read but never written back, whatever folds or CUSTOMIZE do", () => {
    const st = mem();
    const newer = JSON.stringify({ v: 2, counters: { duskWins: 70 }, unlocked: ["style:belt.rune"], chosen: { floor: "plate", belt: "rune", panel: "slate" }, extra: { future: 1 } });
    st.setItem(PROFILE_KEY, newer);
    const p = loadProfile(st);
    expect(p.v).toBe(2);
    expect(chosenSkin(p).belt).toBe("rune"); // what it can read, it wears
    expect(saveProfile(p, st)).toBe(false);
    commitFold((q) => foldDusk(q, facts(), 2, "win"), st);
    expect(st.getItem(PROFILE_KEY)).toBe(newer); // untouched, its unknown fields included
    expect(playerSkin(st).belt).toBe("rune");
    // and a v1 profile is written as v1
    const s2 = mem();
    commitFold((q) => foldDusk(q, facts(), 2, "win"), s2);
    expect(JSON.parse(s2.getItem(PROFILE_KEY)!).v).toBe(1);
  });

  it("a corrupt key resets safely: seeded again and written as a valid profile", () => {
    for (const junk of ["{not json", "[]", "42", "null", "\"x\""]) {
      const st = mem();
      st.setItem(PROFILE_KEY, junk);
      const p = loadProfile(st);
      expect(p.v, junk).toBe(1);
      expect(chosenSkin(p), junk).toEqual(DEFAULT_SKIN);
      expect(migrateProfile(JSON.parse(st.getItem(PROFILE_KEY)!)), junk).not.toBeNull();
    }
    // a storage that throws is no crash: the defaults
    const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    expect(playerSkin(broken as unknown as Storage)).toEqual(DEFAULT_SKIN);
    expect(commitFold((q) => foldDusk(q, facts(), 1, "win"), broken as unknown as Storage)).toEqual([]);
  });

  it("folds count once per <runId>:<day>, across CONTINUE and reloads (a fresh load each time)", () => {
    const st = mem();
    for (let k = 0; k < 3; k++) commitFold((q) => foldDusk(q, facts(), 2, "win"), st); // the same dusk, three loads
    commitFold((q) => foldWarlord(q, facts(), 2, "win", false), st);
    commitFold((q) => foldWarlord(q, facts(), 2, "win", false), st);
    commitFold((q) => foldEnd(q, facts({ over: "lost", day: 4 })), st);
    commitFold((q) => foldEnd(q, facts({ over: "lost", day: 4 })), st);
    const p = loadProfile(st);
    expect(p.counters.duskWins).toBe(1);
    expect(p.counters.warlordWins).toBe(1);
    expect(p.counters.runs).toBe(1);
    expect(p.folded).toEqual(["r1:2", "r1:2:warlord", "r1:end"]);
    // another run's same day counts
    commitFold((q) => foldDusk(q, facts({ runId: "r2" }), 2, "win"), st);
    expect(loadProfile(st).counters.duskWins).toBe(2);
    // the remembered folds are capped
    const q = emptyProfile();
    for (let d = 0; d < FOLDED_MAX + 15; d++) foldDusk(q, facts({ runId: `x${d}` }), 1, "loss");
    expect(q.folded.length).toBe(FOLDED_MAX);
  });

  it("each trigger unlocks its style (the catalogue's counters and targets), and only then", () => {
    const has = (p: ReturnType<typeof emptyProfile>, s: "floor" | "belt" | "panel", id: string) => isOpen(p, s, id);
    const p = emptyProfile();
    foldDusk(p, facts({ runId: "a" }), 1, "win");
    foldDusk(p, facts({ runId: "a" }), 2, "win");
    expect(has(p, "floor", "timber")).toBe(false);
    foldDusk(p, facts({ runId: "a", day: 4 }), 3, "win"); // WIN 3 DUSK FIGHTS
    expect(has(p, "floor", "timber")).toBe(true);
    expect(has(p, "floor", "tread")).toBe(false);
    foldDusk(p, facts({ runId: "a", day: 5 }), 4, "loss"); // REACH DAY 5 (the dawn after day 4's dusk)
    expect(has(p, "floor", "tread")).toBe(true);
    expect(has(p, "floor", "checker")).toBe(false);
    foldWarlord(p, facts({ runId: "a" }), 5, "loss", false);
    expect(has(p, "floor", "checker")).toBe(false);
    foldWarlord(p, facts({ runId: "a" }), 6, "win", false); // BEAT A WARLORD
    expect(has(p, "floor", "checker")).toBe(true);
    expect(has(p, "panel", "verdigris")).toBe(false);
    foldWarlord(p, facts({ runId: "a" }), 8, "win", true); // BEAT THE IRON MATRIARCH
    expect(has(p, "panel", "verdigris")).toBe(true);
    expect(has(p, "belt", "verdigris")).toBe(false);
    expect(has(p, "belt", "blued")).toBe(false);
    foldEnd(p, facts({ runId: "a", over: "lost", day: 7, belts: 3 })); // a run; END A RUN WITH 3 BELTS
    expect(has(p, "belt", "blued")).toBe(true);
    expect(has(p, "belt", "verdigris")).toBe(false);
    foldEnd(p, facts({ runId: "b", over: null, day: 2, belts: 1 })); // ABANDON is a run too: PLAY 2 RUNS
    expect(has(p, "belt", "verdigris")).toBe(true);
    expect(has(p, "panel", "timber")).toBe(false);
    expect(has(p, "panel", "brass")).toBe(false);
    foldEnd(p, facts({ runId: "c", over: "complete", day: 10, hero: "weaver" })); // FINISH A RUN; REACH DAY 8
    expect(has(p, "panel", "brass")).toBe(true);
    expect(has(p, "panel", "timber")).toBe(true);
    expect(has(p, "belt", "timber")).toBe(false);
    foldDusk(p, facts({ runId: "d", hero: "weaver" }), 1, "win"); // WIN WITH 2 DIFFERENT HEROES (furnace, weaver)
    expect(has(p, "belt", "timber")).toBe(true);
    expect(has(p, "panel", "plum")).toBe(false);
    foldEnd(p, facts({ runId: "e", over: "complete", day: 10, hero: "foundry", flawless: true })); // WIN A RUN 10-0
    expect(has(p, "panel", "plum")).toBe(true);
    expect(has(p, "floor", "rune")).toBe(false);
    foldEnd(p, facts({ runId: "f", over: "complete", day: 10, hero: "foundry" })); // the same hero again: still 2
    expect(has(p, "floor", "rune")).toBe(false);
    foldEnd(p, facts({ runId: "g", over: "complete", day: 10, hero: "bastion" })); // FINISH WITH 3 DIFFERENT HEROES
    expect(has(p, "floor", "rune")).toBe(true);
    expect(has(p, "belt", "rune")).toBe(false);
    p.counters.duskWins = 59;
    expect(evaluateUnlocks(p)).toEqual([]);
    foldDusk(p, facts({ runId: "h" }), 1, "win"); // WIN 60 DUSK FIGHTS
    expect(has(p, "belt", "rune")).toBe(true);
    // every style of the catalogue is now open, and the defaults always were
    for (const [s, list] of [["floor", FLOORS], ["belt", BELTS], ["panel", PANELS]] as const) for (const x of list) expect(has(p, s, x.id), `${s}.${x.id}`).toBe(true);
  });

  it("CUSTOMIZE's calls: an open style is worn, a locked one refused; NEW until seen; the run's NEW STYLE names", () => {
    const p = emptyProfile();
    expect(wear(p, "floor", "timber")).toBe(false); // locked: preview only
    expect(p.chosen.floor).toBe("plate");
    foldDusk(p, facts({ runId: "a" }), 1, "win");
    foldDusk(p, facts({ runId: "a" }), 2, "win");
    foldDusk(p, facts({ runId: "a" }), 3, "win");
    expect(unseen(p)).toEqual([styleKey("floor", "timber")]);
    expect(runUnlockNames(p, "a")).toEqual(["TIMBER DECK"]);
    expect(runUnlockNames(p, "b")).toEqual([]);
    expect(wear(p, "floor", "timber")).toBe(true);
    expect(chosenSkin(p)).toEqual({ floor: "timber", belt: "iron", panel: "slate", carrier: "war" });
    expect(wear(p, "floor", "plate")).toBe(true); // the default is always open
    markSeen(p);
    expect(unseen(p)).toEqual([]);
    // a new run's unlocks replace the last run's list
    foldWarlord(p, facts({ runId: "b" }), 3, "win", false);
    expect(runUnlockNames(p, "b")).toEqual(["BRASS CHECKER"]);
    expect(runUnlockNames(p, "a")).toEqual([]);
  });

  it("the screens' folds read the run's own records: finishDay's dusk, the run's end, ABANDON", () => {
    const st = mem();
    g.localStorage = st;
    const run = newRun("furnace", 11);
    const res = finishDay(run, 0, 20, NOSTATS, NOSTATS);
    foldDuskResult(run, res);
    foldDuskResult(run, res); // the same dusk again (a reload): once
    expect(loadProfile(st).counters.duskWins).toBe(1);
    expect(loadProfile(st).counters.bestDay).toBe(2); // the dawn of day 2
    expect(runFacts(run)).toEqual({ runId: run.runId, hero: "furnace", day: 2, over: null, flawless: false, belts: run.build.routes.length });
    foldWarlordResult(run, run.day, "win", "matriarch");
    expect(loadProfile(st).counters.matriarchWins).toBe(1);
    foldRunEnd(run); // ABANDON
    foldRunEnd(run);
    expect(loadProfile(st).counters.runs).toBe(1);
    expect(loadProfile(st).counters.runsFinished).toBe(0);
    // the folds write the profile and, IDENT-2, the run history (ABANDON writes the run's entry); the run save is the screens'
    expect(st.keys()).toEqual([HISTORY_KEY, PROFILE_KEY]);
  });

  it("display only: profile.ts imports nothing from the sim but types, and no Math.random or sim RNG", () => {
    for (const f of ["../src/game/profile.ts", "../src/render/styles.ts"]) {
      const src = readFileSync(new URL(f, import.meta.url), "utf8");
      for (const m of src.matchAll(/^import\s+(type\s+)?[^;]*from\s+"([^"]+)"/gm)) {
        if (/\/sim\//.test(m[2])) expect(m[1], `${f}: ${m[2]}`).toBeTruthy();
        expect(m[2], f).not.toMatch(/\/(net|core)\//);
      }
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""); // the code, not its comments
      expect(code, f).not.toMatch(/Math\.random|\brng\b|displayRng/);
    }
  });
});
