// RUN-1 T1 (REQ-BFG-059, REQ-BFG-116): LONG_RUN, the rule in the game (src/sim/longRun.ts; day.ts finishDay, run.ts newRun,
// save.ts migrateRun). A long run is WON at its 10th dusk win and LOST at 0 hearts; nothing else ends it. The switch is set
// through its setter and put back after each test (BUMP-1D: it ships on, since bb-0.11.0; it shipped off). A run plays on the rule it
// STARTED on (Run.longRun). BUMP-1D: a loss costs 1 on days 1-3 and 2 from day 4 (HEART_COSTS [1, 2, 2]; was [1, 2, 3]), so the scripts
// that reached LAST CHANCE with the cost 3 are re-scripted to reach it with the cost 2.
import { afterEach, describe, expect, it } from "vitest";
import { RUN_DAYS } from "../src/sim/content";
import {
  LONG_RUN, LONG_RUN_DEEPEST_DAY, LONG_RUN_MAX_DAY, MAX_RUN_DRAWS, WIN_GOAL, lcLastDay, longRun, longRunEnd, longRunRules,
  setLongRun, withLongRun,
} from "../src/sim/longRun";
import { HEARTS_START, withHearts } from "../src/sim/hearts";
import { finishDay, flawless, runWon } from "../src/game/day";
import { newRun, type Run } from "../src/game/run";
import { migrateRun } from "../src/game/save";
import { lastChanceFires, lastChanceShapeOk } from "../src/sim/lastChance";
import { LONG_RUN_RULES, longRunFor, rulesAtLeast } from "../src/net/rulesGate";
import { RULES_VERSION } from "../src/sim/content";
import type { SideStats } from "../src/sim/battle";

const S = {} as SideStats;
afterEach(() => setLongRun(true)); // the shipped value (BUMP-1D: on; was false)

type O = "W" | "L" | "D";
/** A fresh hearts run, long with the switch on (newRun's mark), else the 10-day run. */
const runOf = (long: boolean, seed = 11): Run => withHearts(() => withLongRun(() => newRun("furnace", seed, `run1-${seed}`), long));
/** Play the dusks in `seq` (W win, L loss, D draw), one a day, stopping when the run ends. */
function play(run: Run, seq: string): Run {
  for (const c of seq as unknown as O[]) {
    if (run.over) break;
    finishDay(run, c === "W" ? 0 : c === "L" ? 1 : -1, 30, S, S);
  }
  return run;
}

describe("RUN-1: the switch, its mark and its rules literal", () => {
  it("ships on; the setter and withLongRun put it back, even on a throw", () => {
    // BUMP-1D: LONG_RUN ships on (was off: LONG_RUN false, withLongRun(fn) on and back to off); the off forms are the 10-day run's
    expect(LONG_RUN).toBe(true);
    expect(longRunRules()).toBe(true);
    expect(withLongRun(() => longRunRules(), false)).toBe(false);
    expect(longRunRules()).toBe(true);
    expect(withLongRun(() => longRunRules())).toBe(true);
    expect(() => withLongRun(() => { throw new Error("x"); }, false)).toThrow("x");
    expect(longRunRules()).toBe(true);
    setLongRun(false);
    expect(longRunRules()).toBe(false);
    expect(withLongRun(() => longRunRules())).toBe(true);
    expect(longRunRules()).toBe(false);
    expect(() => withLongRun(() => { throw new Error("x"); })).toThrow("x");
    expect(longRunRules()).toBe(false);
    setLongRun(true);
    expect(longRunRules()).toBe(true);
  });

  it("newRun marks a run long only while the switch is on; off, the run is byte for byte as before", () => {
    const off = runOf(false, 5), on = runOf(true, 5);
    expect(off.longRun).toBeUndefined();
    expect(on.longRun).toBe(true);
    expect(longRun(on)).toBe(true);
    expect(longRun(off)).toBe(false);
    const { longRun: _mark, ...rest } = on;
    expect(JSON.stringify(rest)).toBe(JSON.stringify(off));
  });

  it("LONG_RUN_RULES is the literal bb-0.11.0 (it read RULES_VERSION until the bump); longRunFor needs the switch AND the rules", () => {
    // BUMP-1D: the bump wrote the literal (the first rules version with the long run); this build's rules are at or after it
    expect(LONG_RUN_RULES).toBe("bb-0.11.0");
    expect(rulesAtLeast(RULES_VERSION, LONG_RUN_RULES)).toBe(true);
    expect(longRunFor(RULES_VERSION)).toBe(true); // the switch ships on: this build's records read the long run
    expect(longRunFor(LONG_RUN_RULES)).toBe(true);
    expect(longRunFor("bb-0.10.0")).toBe(false); // the rules just before it keep the 10-day run
    withLongRun(() => {
      expect(longRunFor(RULES_VERSION)).toBe(false); // the switch off: every record reads the 10-day run
      expect(longRunFor(LONG_RUN_RULES)).toBe(false);
    }, false);
    withLongRun(() => {
      expect(longRunFor(RULES_VERSION)).toBe(true);
      expect(longRunFor("bb-0.9.7")).toBe(false); // older rules keep the 10-day run
      expect(longRunFor("nonsense")).toBe(false);
    });
  });

  it("the goal and the bounds: WIN_GOAL 10, at most 8 draws, deepest dusk without draws 17, a record's day <= 25", () => {
    expect(WIN_GOAL).toBe(10);
    expect(MAX_RUN_DRAWS).toBe(8);
    expect(LONG_RUN_DEEPEST_DAY).toBe(17);
    expect(LONG_RUN_MAX_DAY).toBe(25);
    expect(longRunEnd({ wins: 10, lives: 3 })).toBe("won");
    expect(longRunEnd({ wins: 9, lives: 0 })).toBe("lost");
    expect(longRunEnd({ wins: 9, lives: 1 })).toBeNull();
    expect(lcLastDay({ longRun: true })).toBe(Infinity);
    expect(lcLastDay({})).toBe(RUN_DAYS);
  });
});

describe("RUN-1: a long run ends only at 10 wins or 0 hearts", () => {
  it("plays past day 10 (switch off: the same dusks complete the run on day 10)", () => {
    const seq = "WLWDWLWDWW" + "LWD"; // 6 wins, 2 losses and 2 draws by day 10
    const long = play(runOf(true), seq);
    expect(long.over).toBeNull();
    expect(long.day).toBe(14); // the dawn of day 14
    expect(long.wins).toBe(7);
    const ten = play(runOf(false), seq);
    expect(ten.over).toBe("complete");
    expect(ten.day).toBe(RUN_DAYS);
  });

  it("is WON on day 13 at its 10th dusk win: 3 losses, then 10 wins", () => {
    const run = play(runOf(true), "LLL" + "WWWWWWWWWW" + "WWW");
    expect(run.over).toBe("won");
    expect(run.day).toBe(13);
    expect(run.wins).toBe(10);
    expect(run.losses).toBe(3);
    expect(run.history.length).toBe(13);
    expect(runWon(run)).toBe(true);
    expect(flawless(run)).toBe(false);
  });

  it("a 10-0 long run is WON on day 10 and FLAWLESS; draws don't spoil it", () => {
    const run = play(runOf(true), "WWWWWWWWWW");
    expect(run.over).toBe("won");
    expect(run.day).toBe(10);
    expect(flawless(run)).toBe(true);
    const drawn = play(runOf(true), "WDWWWWWWWDWW");
    expect(drawn.over).toBe("won");
    expect(drawn.day).toBe(12);
    expect(flawless(drawn)).toBe(true);
  });

  it("is LOST on day 12 at 0 hearts (LAST CHANCE spent on day 6)", () => {
    // days 1-6 lost: 10 -> 9 -> 8 -> 7 -> 5 -> 3 -> 1 (LAST CHANCE on day 6, leaving exactly 1); 5 wins; day 12 lost: 0
    const run = play(runOf(true), "LLLLLL" + "WWWWW" + "L" + "WWW");
    expect(run.over).toBe("lost");
    expect(run.day).toBe(12);
    expect(run.lives).toBe(0);
    expect([run.wins, run.losses]).toEqual([5, 7]);
    expect(run.lastChance?.day).toBe(6);
    expect(runWon(run)).toBe(false);
  });

  it("LAST CHANCE fires on day 12 (on a 10-day run it could only come before day 10)", () => {
    // BUMP-1D: a loss from day 4 costs 2 (HEART_COSTS [1, 2, 2]; was 3 from day 7), so the script loses one more dusk on the way:
    // days 1-3 lost (7 hearts), days 4-9 won (6 wins), day 10 lost (cost 2: 5), day 11 lost (3), day 12 lost (1): LAST CHANCE
    // (was days 4-10 won, day 11 lost (cost 3: 4), day 12 lost (cost 3: 1))
    const run = play(runOf(true), "LLL" + "WWWWWW" + "LLL");
    expect(run.over).toBeNull();
    expect(run.day).toBe(13);
    expect(run.lives).toBe(1);
    expect(run.lastChance).toEqual({ day: 12 });
    expect(run.history[11].lastChance).toEqual({ lives: 0 });
    expect(run.history[11].heartsLost).toBe(2);
    // a loss that would leave 0 is saved the same way, once a run (day 13: 2 hearts - 2 = 0: LAST CHANCE sets 1, it adds one)
    // days 1-2 lost (8), days 3-8 won, days 9-11 lost (6, 4, 2), day 12 won, day 13 lost (0 -> 1)
    const deep = play(runOf(true), "LL" + "WWWWWW" + "LLL" + "W" + "L");
    expect(deep.lastChance).toEqual({ day: 13 });
    expect(deep.history[12].lastChance).toEqual({ lives: 1 });
    expect(deep.lives).toBe(1);
    const after = play(deep, "L");
    expect(after.over).toBe("lost");
    expect(after.day).toBe(14);
    // the lives rule's own check, re-pointed the same way
    expect(lastChanceFires(12, "loss", 1, false)).toBe(false);
    expect(lastChanceFires(12, "loss", 1, false, Infinity)).toBe(true);
  });

  it("a draw costs nothing and the day goes on; the hearts cost stays 2 past day 10", () => {
    // BUMP-1D: the cost from day 7 on is 2 (HEART_COSTS [1, 2, 2]); was 3 (HEARTS_START - 3, heartsLost 3)
    const run = play(runOf(true), "WWWWWWWWW" + "DDD" + "L");
    expect(run.over).toBeNull();
    expect(run.day).toBe(14);
    expect(run.lives).toBe(HEARTS_START - 2);
    expect(run.history[12].heartsLost).toBe(2);
  });
});

describe("RUN-1: saves (D8)", () => {
  it("a long run saves and loads on day 14 without clamping (its LAST CHANCE of day 12 kept)", () => {
    // BUMP-1D: a loss from day 4 costs 2 (was 3 from day 7), so LAST CHANCE on day 12 takes six losses now (was five): 7 wins and 6 losses
    // at the dawn of day 14 (was 8 and 5): days 1-3 lost, 4-9 won, 10-12 lost (LAST CHANCE on 12), 13 won
    const run = play(runOf(true), "LLL" + "WWWWWW" + "LLL" + "W"); // the dawn of day 14
    expect(run.day).toBe(14);
    const back = migrateRun(JSON.parse(JSON.stringify(run)))!;
    expect(back.day).toBe(14);
    expect(back.longRun).toBe(true);
    expect(back.lastChance).toEqual({ day: 12 });
    expect(back.lives).toBe(1);
    expect([back.wins, back.losses]).toEqual([7, 6]);
    // and plays on: the next win is the 8th, the next the 9th, the one after it the 10th (WON on day 16; was the 9th and 10th, day 15)
    const done = play(back, "WWW");
    expect(done.over).toBe("won");
    expect(done.day).toBe(16);
    expect(lastChanceShapeOk({ day: 12 })).toBe(false); // the 10-day bound
    expect(lastChanceShapeOk({ day: 12 }, false, Infinity)).toBe(true);
  });

  it("a 0.9.10 (switch-off) save loads and finishes on its own 10 days, even with the switch on", () => {
    const old = play(runOf(false), "WLWLWWWWW"); // the dawn of day 10 (7 hearts)
    const back = withLongRun(() => migrateRun(JSON.parse(JSON.stringify(old)))!);
    expect(back.longRun).toBeUndefined();
    expect(back.day).toBe(10);
    withLongRun(() => play(back, "L"));
    expect(back.over).toBe("complete");
  });

  it("a bad mark is dropped (a 10-day run); a 10-day save's day still clamps to 10", () => {
    const run = play(runOf(true), "WWWWWWWWW" + "DD");
    expect(run.day).toBe(12);
    const bad = migrateRun(JSON.parse(JSON.stringify({ ...run, longRun: "yes" })))!;
    expect(bad.longRun).toBeUndefined();
    expect(bad.day).toBe(RUN_DAYS);
    const won = migrateRun(JSON.parse(JSON.stringify(play(runOf(true), "WWWWWWWWWW"))))!;
    expect(won.over).toBe("won");
  });
});
