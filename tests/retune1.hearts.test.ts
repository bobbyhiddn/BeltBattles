// RETUNE-1 (REQ-BFG-096): HEARTS, the rule and the game (src/sim/hearts.ts; day.ts finishDay, run.ts newRun, events.ts
// PATCH UP, save.ts). The switch is set through its setter and put back after each test. HULL-ON (the flip, HEARTS): put
// back on, the shipped value; a test (or half) about a 5-lives run makes it with HEARTS off itself.
import { afterEach, describe, expect, it } from "vitest";
import { RUN_DAYS, START_LIVES } from "../src/sim/content";
import {
  HEARTS, HEARTS_START, heartCost, heartsAfterLosses, heartsDusk, heartsLastChanceFires, heartsRules, heartsRun, livesCap,
  setHearts, startLives, withHearts,
} from "../src/sim/hearts";
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

  it("a loss costs 1 heart on days 1-3, 2 on days 4-6, 3 from day 7", () => {
    expect(HEARTS_START).toBe(10);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 20].map((d) => heartCost(d))).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3, 3, 3, 3]);
    // a draw or a win costs none
    expect(heartsDusk(7, 5, "draw", false)).toEqual({ hearts: 7, cost: 0, lastChance: false });
    expect(heartsDusk(7, 5, "win", false)).toEqual({ hearts: 7, cost: 0, lastChance: false });
  });

  it("LAST CHANCE: from 3 hearts on a day-7 loss the player stays on 1; at exactly 1 left it adds none; never twice; never on the last day", () => {
    expect(heartsDusk(3, 7, "loss", false)).toEqual({ hearts: 1, cost: 3, lastChance: true });
    expect(heartsDusk(2, 3, "loss", false)).toEqual({ hearts: 1, cost: 1, lastChance: true }); // left 1: set to 1
    expect(heartsDusk(4, 7, "loss", false)).toEqual({ hearts: 1, cost: 3, lastChance: true });
    expect(heartsDusk(5, 7, "loss", false)).toEqual({ hearts: 2, cost: 3, lastChance: false }); // leaves 2: no LAST CHANCE
    expect(heartsDusk(3, 7, "loss", true)).toEqual({ hearts: 0, cost: 3, lastChance: false }); // used: out of hearts
    expect(heartsDusk(2, 4, "loss", true)).toEqual({ hearts: 0, cost: 2, lastChance: false });
    expect(heartsDusk(3, RUN_DAYS, "loss", false)).toEqual({ hearts: 0, cost: 3, lastChance: false }); // the last day
    expect(heartsLastChanceFires(RUN_DAYS - 1, "loss", 0, false)).toBe(true);
    expect(heartsLastChanceFires(RUN_DAYS, "loss", 0, false)).toBe(false);
    // the run's last day is a parameter (RUN-1 re-points it): before a day-20 backstop, day 10 fires it
    expect(heartsDusk(3, 10, "loss", false, { lastDay: 20 })).toEqual({ hearts: 1, cost: 3, lastChance: true });
    expect(heartsDusk(3, 20, "loss", false, { lastDay: 20 })).toEqual({ hearts: 0, cost: 3, lastChance: false });
  });

  it("a run that loses every dusk: 9, 8, 7, 5, 3, LAST CHANCE on 1 (day 6), then out on day 7", () => {
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
    const r7 = dusk(run, "loss"); // d7: 4 - 3 = 1: LAST CHANCE, stays on 1 (adds none)
    expect(r7.heartsLost).toBe(3);
    expect(r7.lastChance).toEqual({ lives: 0 });
    expect(run.lastChance).toEqual({ day: 7 });
    expect(run.lives).toBe(1);
    expect(run.over).toBeNull();
  });

  it("LAST CHANCE from 3 hearts on a day-7 loss: stays on 1; never twice; a day-8 loss then ends the run", () => {
    const run = heartsRunAt();
    for (let d = 1; d <= 6; d++) dusk(run, d <= 4 ? "loss" : "draw"); // days 1-4 lost (9 8 7 5), days 5-6 drawn (5)
    dusk(run, "win"); // day 7 won: now day 8 with 5 hearts
    expect([run.day, run.lives]).toEqual([8, 5]);
    const r8 = dusk(run, "loss"); // 5 - 3 = 2: no LAST CHANCE
    expect([r8.lastChance, run.lives]).toEqual([undefined, 2]);
    const r9 = dusk(run, "loss"); // 2 - 3 < 0: LAST CHANCE on day 9 (before RUN_DAYS): 1
    expect([r9.lastChance, run.lives, run.lastChance]).toEqual([{ lives: 1 }, 1, { day: 9 }]);
    const r10 = dusk(run, "loss"); // day 10 loss: out of hearts, the run is lost (no second LAST CHANCE)
    expect([r10.lastChance, run.lives, run.over]).toEqual([undefined, 0, "lost"]);

    const b = heartsRunAt(12);
    for (let d = 1; d <= 5; d++) dusk(b, "loss"); // 9 8 7 5 3
    dusk(b, "draw"); // d6: 3
    expect([b.day, b.lives]).toEqual([7, 3]);
    const r = dusk(b, "loss"); // d7: 3 - 3 = 0 -> LAST CHANCE: 1
    expect([r.lastChance, b.lives, b.lastChance]).toEqual([{ lives: 1 }, 1, { day: 7 }]);
    expect(lastChanceCardLine(r)).not.toBeNull();
    dusk(b, "loss"); // d8: out
    expect(b.over).toBe("lost");
  });

  it("never on the last day: a day-10 loss that empties the hearts loses the run; one that leaves some completes it", () => {
    const run = heartsRunAt();
    for (let d = 1; d <= 9; d++) dusk(run, d <= 2 ? "loss" : "win"); // 9 8, then wins
    expect([run.day, run.lives]).toEqual([10, 8]);
    dusk(run, "loss");
    expect([run.lives, run.over, run.lastChance]).toEqual([5, "complete", undefined]);
    const b = heartsRunAt(13);
    for (let d = 1; d <= 9; d++) dusk(b, d <= 5 ? "loss" : "draw"); // 9 8 7 5 3, then draws: 3
    expect([b.day, b.lives]).toEqual([10, 3]);
    const r = dusk(b, "loss");
    expect([r.lastChance, b.lives, b.over]).toEqual([undefined, 0, "lost"]);
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
