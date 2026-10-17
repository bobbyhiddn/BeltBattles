// RETUNE-1 (REQ-BFG-096): HEARTS, the rule and the game (src/sim/hearts.ts; day.ts finishDay, run.ts newRun, events.ts
// PATCH UP, save.ts). The switch is set through its setter and put back after each test. HULL-ON (the flip, HEARTS): put
// back on, the shipped value; a test (or half) about a 5-lives run makes it with HEARTS off itself.
import { afterEach, describe, expect, it } from "vitest";
import { RUN_DAYS, START_LIVES } from "../src/sim/content";
import {
  HEARTS, HEARTS_START, HEART_COSTS, HEART_COST_FROM, heartCost, heartsAfterLosses, heartsDusk, heartsLastChanceFires, heartsRules, heartsRun,
  livesCap, setHearts, startLives, withHearts, type HeartsRule,
} from "../src/sim/hearts";
import { withLongRun } from "../src/sim/longRun";
import { finishDay, lastChanceCardLine } from "../src/game/day";
import { newRun, type Run } from "../src/game/run";
import { blockReason } from "../src/game/events";
import { EVENTS } from "../src/game/eventDefs";
import { migrateRun } from "../src/game/save";
import { finishWarlord, pickRoad } from "../src/game/road";
import type { SideStats } from "../src/sim/battle";

const S = {} as SideStats;
afterEach(() => setHearts(true)); // HULL-ON (the flip, HEARTS): the shipped value (HULL-ON's flip; was setHearts(false))

/** A fresh run with HEARTS on (the run's mark set by newRun). */
const heartsRunAt = (seed = 11): Run => withHearts(() => newRun("furnace", seed));
/** Lose (or win, draw) the dusk of the run's current day. */
const dusk = (run: Run, o: "win" | "loss" | "draw") => finishDay(run, o === "win" ? 0 : o === "loss" ? 1 : -1, 30, S, S);

describe("RETUNE-1 HEARTS: the switch and the rule", () => {
  it("is off by default; the setter and withHearts put it back", () => {
    // HULL-ON (the flip, HEARTS): ships on now (was off): HEARTS and heartsRules() true; withHearts(fn, false) runs fn off
    // and puts it back on, even on a throw; startLives() is HEARTS_START on, START_LIVES off
    expect(HEARTS).toBe(true);
    expect(heartsRules()).toBe(true);
    expect(withHearts(() => heartsRules(), false)).toBe(false);
    expect(heartsRules()).toBe(true);
    expect(() => withHearts(() => { throw new Error("x"); }, false)).toThrow("x");
    expect(heartsRules()).toBe(true);
    expect(withHearts(() => heartsRules())).toBe(true);
    setHearts(false);
    expect(heartsRules()).toBe(false);
    setHearts(true);
    expect(startLives()).toBe(HEARTS_START);
    expect(withHearts(() => startLives(), false)).toBe(START_LIVES);
  });

  it("a loss costs 1 heart on days 1-3 and 2 from day 4", () => {
    // BUMP-1D (RULING-BANDS1-R1 B1.1; BANDS-1 H1): HEART_COSTS [1, 2, 2] — days 7+ cost 2 (was [1, 2, 3]: 1 on days 1-3, 2 on days 4-6,
    // 3 from day 7; the old costs stay covered below as an explicit rule); the bands' first days are unchanged
    expect(HEARTS_START).toBe(10);
    expect(HEART_COSTS).toEqual([1, 2, 2]);
    expect(HEART_COST_FROM).toEqual([1, 4, 7]);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 20].map((d) => heartCost(d))).toEqual([1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
    // a draw or a win costs none
    expect(heartsDusk(7, 5, "draw", false)).toEqual({ hearts: 7, cost: 0, lastChance: false });
    expect(heartsDusk(7, 5, "win", false)).toEqual({ hearts: 7, cost: 0, lastChance: false });
  });

  it("LAST CHANCE: from 3 hearts on a day-7 loss the player stays on 1; at exactly 1 left it adds none; never twice; never on the last day", () => {
    // BUMP-1D: a day-7 loss costs 2 (was 3), so the lines that scripted the cost 3 start from one heart fewer: 3 -> 1 (adds none),
    // 2 -> 0 (adds one), 4 -> 2 (no LAST CHANCE); the logic (the first loss leaving 1 heart or fewer, once, before the last day) is the same
    expect(heartsDusk(3, 7, "loss", false)).toEqual({ hearts: 1, cost: 2, lastChance: true }); // was (3, 7): cost 3, 3 - 3 = 0, set to 1
    expect(heartsDusk(2, 7, "loss", false)).toEqual({ hearts: 1, cost: 2, lastChance: true }); // 2 - 2 = 0: set to 1 (adds one)
    expect(heartsDusk(2, 3, "loss", false)).toEqual({ hearts: 1, cost: 1, lastChance: true }); // left 1: set to 1
    expect(heartsDusk(4, 7, "loss", false)).toEqual({ hearts: 2, cost: 2, lastChance: false }); // leaves 2: no LAST CHANCE (was (5, 7): cost 3)
    expect(heartsDusk(2, 7, "loss", true)).toEqual({ hearts: 0, cost: 2, lastChance: false }); // used: out of hearts (was (3, 7): cost 3)
    expect(heartsDusk(2, 4, "loss", true)).toEqual({ hearts: 0, cost: 2, lastChance: false });
    expect(heartsDusk(2, RUN_DAYS, "loss", false)).toEqual({ hearts: 0, cost: 2, lastChance: false }); // the last day (was (3, RUN_DAYS): cost 3)
    expect(heartsLastChanceFires(RUN_DAYS - 1, "loss", 0, false)).toBe(true);
    expect(heartsLastChanceFires(RUN_DAYS, "loss", 0, false)).toBe(false);
    // the run's last day is a parameter (RUN-1 re-points it): before a day-20 backstop, day 10 fires it
    expect(heartsDusk(2, 10, "loss", false, { lastDay: 20 })).toEqual({ hearts: 1, cost: 2, lastChance: true });
    expect(heartsDusk(2, 20, "loss", false, { lastDay: 20 })).toEqual({ hearts: 0, cost: 2, lastChance: false });
  });

  it("an explicit rule of the old costs [1, 2, 3] still costs 1, 2 and 3 by band, with the same LAST CHANCE logic (the benches pass a rule)", () => {
    // BUMP-1D: HEARTS_RULE is {10, [1, 2, 2]} now; a HeartsRule argument still carries the 3 of the bands before it (the assertions of the
    // two tests above as they were at bb-0.10.0)
    const OLD: HeartsRule = { start: HEARTS_START, cost: [1, 2, 3] };
    const old = { rule: OLD };
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 20].map((d) => heartCost(d, OLD))).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3, 3, 3, 3]);
    expect(heartsDusk(7, 5, "draw", false, old)).toEqual({ hearts: 7, cost: 0, lastChance: false });
    expect(heartsDusk(3, 7, "loss", false, old)).toEqual({ hearts: 1, cost: 3, lastChance: true });
    expect(heartsDusk(2, 3, "loss", false, old)).toEqual({ hearts: 1, cost: 1, lastChance: true }); // left 1: set to 1
    expect(heartsDusk(4, 7, "loss", false, old)).toEqual({ hearts: 1, cost: 3, lastChance: true });
    expect(heartsDusk(5, 7, "loss", false, old)).toEqual({ hearts: 2, cost: 3, lastChance: false }); // leaves 2: no LAST CHANCE
    expect(heartsDusk(3, 7, "loss", true, old)).toEqual({ hearts: 0, cost: 3, lastChance: false }); // used: out of hearts
    expect(heartsDusk(2, 4, "loss", true, old)).toEqual({ hearts: 0, cost: 2, lastChance: false });
    expect(heartsDusk(3, RUN_DAYS, "loss", false, old)).toEqual({ hearts: 0, cost: 3, lastChance: false }); // the last day
    expect(heartsDusk(3, 10, "loss", false, { rule: OLD, lastDay: 20 })).toEqual({ hearts: 1, cost: 3, lastChance: true });
    expect(heartsDusk(3, 20, "loss", false, { rule: OLD, lastDay: 20 })).toEqual({ hearts: 0, cost: 3, lastChance: false });
    // the shipped rule does not move with it: no rule argument is HEARTS_RULE, [1, 2, 2]
    expect(heartCost(7)).toBe(2);
    expect(heartCost(7, OLD)).toBe(3);
  });

  it("a run that loses every dusk: 9, 8, 7, 5, 3, LAST CHANCE on 1 (day 6), then out on day 7", () => {
    // BUMP-1D: the same numbers under [1, 2, 2]: no loss before day 7 costs differently, and day 7's is the one after LAST CHANCE (1 - 2 or 1 - 3: out)
    let h = HEARTS_START, lc = false;
    const seen: number[] = [];
    for (let d = 1; d <= 7; d++) {
      const r = heartsDusk(h, d, "loss", lc);
      h = r.hearts;
      lc = lc || r.lastChance;
      seen.push(h);
      if (r.lastChance) expect(d).toBe(6);
    }
    expect(seen).toEqual([9, 8, 7, 5, 3, 1, 0]);
    expect([heartsAfterLosses(0), heartsAfterLosses(3), heartsAfterLosses(5), heartsAfterLosses(6), heartsAfterLosses(7)]).toEqual([10, 7, 3, 1, 1]);
  });
});

describe("RETUNE-1 HEARTS: the game (finishDay, newRun, PATCH UP, the save)", () => {
  it("switch off: a new run has 5 lives, no mark, and a loss costs 1 with the early-loss refund at dawn 3 (as today)", () => {
    withHearts(() => { // HULL-ON (the flip, HEARTS): it ships on, so the off test sets it off itself
      const run = newRun("furnace", 11);
      expect(run.lives).toBe(START_LIVES);
      expect("hearts" in run).toBe(false);
      expect(heartsRun(run)).toBe(false);
      dusk(run, "loss");
      dusk(run, "loss");
      expect(run.lives).toBe(START_LIVES - 2 + 1); // the refund at dawn 3
      expect(run.refund).toEqual({ day: 3, lives: 1 });
    }, false);
  });

  it("switch on: a new run starts with 10 hearts and its mark; the mark, not the switch, rules the run", () => {
    const run = heartsRunAt();
    expect(run.lives).toBe(10);
    expect(run.hearts).toBe(true);
    expect(livesCap(run)).toBe(HEARTS_START);
    // a lives run started before the switch keeps its scale with the switch on (a save from before the bump)
    const old = withHearts(() => newRun("furnace", 11), false); // HULL-ON (the flip, HEARTS): started off (was the default)
    withHearts(() => {
      dusk(old, "loss");
      expect(old.lives).toBe(START_LIVES - 1);
    });
  });

  it("each loss costs heartCost(day); draws cost none; no day-3 refund", () => {
    const run = heartsRunAt();
    dusk(run, "loss"); // d1: 9
    const r2 = dusk(run, "loss"); // d2: 8
    expect(r2.heartsLost).toBe(1);
    expect(run.lives).toBe(8);
    expect(run.refund).toBeUndefined(); // no refund at dawn 3
    expect(run.day).toBe(3);
    dusk(run, "draw"); // d3: 8
    expect(run.lives).toBe(8);
    const r4 = dusk(run, "loss"); // d4: 6
    expect(r4.heartsLost).toBe(2);
    dusk(run, "win"); // d5
    dusk(run, "loss"); // d6: 4
    expect(run.lives).toBe(4);
    // BUMP-1D: a day-7 loss costs 2 (was 3): 4 - 2 = 2, no LAST CHANCE (was 4 - 3 = 1: LAST CHANCE, stays on 1, adds none)
    const r7 = dusk(run, "loss"); // d7: 4 - 2 = 2
    expect(r7.heartsLost).toBe(2);
    expect(r7.lastChance).toBeUndefined();
    expect(run.lastChance).toBeUndefined();
    expect(run.lives).toBe(2);
    expect(run.over).toBeNull();
    const r8 = dusk(run, "loss"); // d8: 2 - 2 = 0: LAST CHANCE sets the hearts to 1 (adds one)
    expect(r8.heartsLost).toBe(2);
    expect(r8.lastChance).toEqual({ lives: 1 });
    expect(run.lastChance).toEqual({ day: 8 });
    expect(run.lives).toBe(1);
    expect(run.over).toBeNull();
  });

  it("LAST CHANCE from 3 hearts on a day-7 loss: stays on 1; never twice; a day-8 loss then ends the run", () => {
    // BUMP-1D: a loss from day 7 costs 2 (was 3), so the first run is re-scripted to arrive on day 8 with 4 hearts (was 5: 5 - 3 = 2) and
    // the second keeps its 3 hearts on day 7 (3 - 2 = 1: stays on 1, adds none; was 3 - 3 = 0: adds one)
    const run = heartsRunAt();
    for (let d = 1; d <= 6; d++) dusk(run, d <= 2 || d === 4 || d === 5 ? "loss" : "draw"); // days 1, 2, 4, 5 lost (9 8 6 4), days 3, 6 drawn (4)
    dusk(run, "win"); // day 7 won: now day 8 with 4 hearts
    expect([run.day, run.lives]).toEqual([8, 4]);
    const r8 = dusk(run, "loss"); // 4 - 2 = 2: no LAST CHANCE
    expect([r8.lastChance, run.lives]).toEqual([undefined, 2]);
    const r9 = dusk(run, "loss"); // 2 - 2 = 0: LAST CHANCE on day 9: 1
    expect([r9.lastChance, run.lives, run.lastChance]).toEqual([{ lives: 1 }, 1, { day: 9 }]);
    const r10 = dusk(run, "loss"); // day 10 loss: out of hearts, the run is lost (no second LAST CHANCE)
    expect([r10.lastChance, run.lives, run.over]).toEqual([undefined, 0, "lost"]);

    const b = heartsRunAt(12);
    for (let d = 1; d <= 5; d++) dusk(b, "loss"); // 9 8 7 5 3
    dusk(b, "draw"); // d6: 3
    expect([b.day, b.lives]).toEqual([7, 3]);
    const r = dusk(b, "loss"); // d7: 3 - 2 = 1 -> LAST CHANCE: stays on 1 (adds none)
    expect([r.lastChance, b.lives, b.lastChance]).toEqual([{ lives: 0 }, 1, { day: 7 }]);
    expect(lastChanceCardLine(r)).not.toBeNull();
    dusk(b, "loss"); // d8: out
    expect(b.over).toBe("lost");
  });

  it("never on the last day: a day-10 loss that empties the hearts loses the run; one that leaves some completes it", () => {
    // BUMP-1D: this is the 10-day run's rule (LONG_RUN ships on: a run has no last day, tests/run1.rule.test.ts), so the runs are made with
    // the long run off (a run plays on the rule it started on); the day-10 loss costs 2 (was 3), so the emptying run arrives with 2 hearts
    // (was 3: the path 9 8 6 4 2 with draws, since a loss leaving 1 would be LAST CHANCE's), the other leaves 6 (was 5)
    const tenDay = (seed: number) => withLongRun(() => heartsRunAt(seed), false);
    const run = tenDay(11);
    for (let d = 1; d <= 9; d++) dusk(run, d <= 2 ? "loss" : "win"); // 9 8, then wins
    expect([run.day, run.lives]).toEqual([10, 8]);
    dusk(run, "loss");
    expect([run.lives, run.over, run.lastChance]).toEqual([6, "complete", undefined]);
    const b = tenDay(13);
    for (let d = 1; d <= 9; d++) dusk(b, d <= 2 || (d >= 4 && d <= 6) ? "loss" : "draw"); // days 1, 2, 4, 5, 6 lost (9 8 6 4 2), then draws: 2
    expect([b.day, b.lives]).toEqual([10, 2]);
    const r = dusk(b, "loss");
    expect([r.lastChance, b.lives, b.over]).toEqual([undefined, 0, "lost"]);
    // the long run has no last day: the same loss fires LAST CHANCE on day 10 (tests/run1.rule.test.ts: any day), and the run goes on
    const l = withLongRun(() => heartsRunAt(13), true);
    for (let d = 1; d <= 9; d++) dusk(l, d <= 2 || (d >= 4 && d <= 6) ? "loss" : "draw");
    expect([l.day, l.lives, l.longRun]).toEqual([10, 2, true]);
    const rl = dusk(l, "loss");
    expect([rl.lastChance, l.lives, l.lastChance, l.over]).toEqual([{ lives: 1 }, 1, { day: 10 }, null]);
  });

  it("road (warlord) fights never cost hearts", () => {
    const run = heartsRunAt(7930);
    run.day = 5;
    run.stage = "fork";
    run.lives = 6;
    expect(pickRoad(run, "easy").ok).toBe(true);
    finishWarlord(run, 1, 30);
    expect(run.lives).toBe(6);
  });

  it("PATCH UP: +1 heart, never above HEARTS_START (HEARTS FULL at 10); a lives run as today", () => {
    const patch = EVENTS.dock.choices(newRun("furnace", 1), { id: "dock", picked: -1 } as never).find((c) => c.label === "PATCH UP")!;
    const run = heartsRunAt();
    run.gold = 20;
    expect(blockReason(run, patch)).toBe("HEARTS FULL");
    run.lives = 9;
    expect(blockReason(run, patch)).toBeUndefined();
    const lives = withHearts(() => newRun("furnace", 1), false); // HULL-ON (the flip, HEARTS): a lives run starts off
    lives.gold = 20;
    expect(blockReason(lives, patch)).toBe("LIVES FULL");
    lives.lives = 4;
    expect(blockReason(lives, patch)).toBeUndefined();
  });

  it("the save keeps a hearts run's 10 hearts and mark; a lives run clamps at 5 as before", () => {
    const run = heartsRunAt();
    const back = migrateRun(JSON.parse(JSON.stringify(run)))!;
    expect([back.lives, back.hearts]).toEqual([10, true]);
    // HULL-ON (the flip, HEARTS): the forged save is a lives run's (no mark), so it starts with HEARTS off
    const forged = migrateRun(JSON.parse(JSON.stringify({ ...withHearts(() => newRun("furnace", 1), false), lives: 10 })))!;
    expect([forged.lives, forged.hearts]).toEqual([START_LIVES, undefined]);
    const bad = migrateRun(JSON.parse(JSON.stringify({ ...run, hearts: "yes" })))!;
    expect([bad.lives, bad.hearts]).toEqual([START_LIVES, undefined]);
  });
});
