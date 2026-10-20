// ENDLESS-1 3.4 (REQ-BFG-059): THE LAST ENDLESS DAY AND THE RECORD MODEL. ENDLESS_LAST_DAY is DERIVED from the endless record model
// (records.ts endlessRecords / endlessLastDay) and pinned here, as tests/run1.records.test.ts pins LONG_RUN_DEEPEST_DAY. The model:
// ENDLESS_LIVES hearts, a win adds an endless win (the ENDLESS_WIN_CAP-th ends endless), a loss costs one heart (the last ends it),
// at most ENDLESS_MAX_DRAWS draws an upload carries, PATCH UP once per event bag, no LAST CHANCE, no refund.
import { describe, expect, it } from "vitest";
import { BAG_DAYS, endlessLastDay, endlessRecordProblem, endlessRecords, isReachable, reachableRecords } from "../src/net/records";
import { ENDLESS_LAST_DAY, ENDLESS_LIVES, ENDLESS_MAX_DRAWS, ENDLESS_WIN_CAP, endlessDusk } from "../src/sim/endless";
import { LONG_RUN_MAX_DAY, WIN_GOAL } from "../src/sim/longRun";
import { RULES_VERSION } from "../src/sim/content";
import { bagIds } from "../src/game/eventDefs"; // BUMP-1F (RULING-BUMP1F-R3.3, R5.4): the rules world's bag (10 events with ENCHANT off, 11 with it on)
import { withEnchant } from "../src/sim/enchant"; // BUMP-1F (RULING-BUMP1F-R3.3, R5.4): the two worlds

const has = (vd: number, day: number, wins: number, lives: number, opts?: { patchUp?: boolean }) => endlessRecords(vd, day, opts).some((r) => r.wins === wins && r.lives === lives);

// BUMP-1F (RULING-BUMP1F-R3.3 and RULING-BUMP1F-R5 R5.4, TRIAGE-R34 lines 69-72): ENCHANT ships on, so the ASH SHRINE is the 11th event of the bag and the endless record model (records.ts endlessWalk reads bagIds().length)
// opens its event bags every 11 days: the DOCK (PATCH UP) windows move with it, the walk derives the last dusk 63 (was 64 in the OFF world's 10-day bag), and the pinned ENDLESS_LAST_DAY STAYS 64 (R5.4: bb-0.12.0
// records, judged in the OFF world, reach 64). The four red tests below are pinned to BOTH worlds: the body as it was runs under withEnchant(fn, false), and an ON twin pins the 11-day bag's numbers
// (tests/enchant2.endlessbag.test.ts shows the same two worlds). Every other test of this file runs in the shipped (ON) world, as it passes.
const off = <T>(fn: () => T): T => withEnchant(fn, false);
const on = <T>(fn: () => T): T => withEnchant(fn, true);

describe("ENDLESS-1 3.4: ENDLESS_LAST_DAY is derived from the record model and pinned", () => {
  it("the model's deepest dusk day is ENDLESS_LAST_DAY (64); without PATCH UP it is cap's count, 59", () => {
    // BUMP-1F (RULING-BUMP1F-R3.3, R5.4; TRIAGE-R34 line 69): was a bare `expect(endlessLastDay()).toBe(ENDLESS_LAST_DAY)` (ENCHANT off by default: a bag is 10 days). OFF: 64 = ENDLESS_LAST_DAY; ON (a bag is 11 days): 63, under the pinned 64
    expect(off(() => endlessLastDay())).toBe(ENDLESS_LAST_DAY);
    expect(on(() => endlessLastDay())).toBe(63);
    expect(on(() => bagIds().length)).toBe(11);
    expect(ENDLESS_LAST_DAY).toBe(64);
    expect(off(() => endlessLastDay({ patchUp: false }))).toBe(59);
    expect(on(() => endlessLastDay({ patchUp: false }))).toBe(59); // no dock, no bag: the same in both worlds
    // cap's count: the latest victory day + the wins into the last dusk + the losses before it + the last dusk + the draws an upload may carry
    expect(LONG_RUN_MAX_DAY + (ENDLESS_WIN_CAP - 1) + (ENDLESS_LIVES - 1) + 1 + ENDLESS_MAX_DRAWS).toBe(59);
  });

  it("the extra 5 days are the dock's PATCH UP: once per event bag (bags 3-7 are in reach of a victory on day 25), one more loss each", () => {
    // BUMP-1F (RULING-BUMP1F-R3.3, R5.4; TRIAGE-R34 line 70): the body as it was (BAG_DAYS 10, bags 3-7) runs under off(); the ON twin below is the 11-day bag's: bags 3-6 (days 23-66), 4 docks, the deepest dusk 59 + 4 = 63
    off(() => {
      const bags = Math.ceil(ENDLESS_LAST_DAY / BAG_DAYS) - Math.floor(LONG_RUN_MAX_DAY / BAG_DAYS); // bags 3, 4, 5, 6 and 7 = 5
      expect(bags).toBe(5);
      expect(ENDLESS_LAST_DAY).toBe(59 + bags);
      // the deepest record: day 64, 29 wins, 2 draws, and 9 losses cut by 5 PATCH UPs (hearts 3 into the last dusk is possible)
      expect(has(25, ENDLESS_LAST_DAY, ENDLESS_WIN_CAP - 1, 1)).toBe(true);
      expect(endlessRecords(25, ENDLESS_LAST_DAY + 1)).toEqual([]);
    });
    on(() => {
      const bag = bagIds().length, last = endlessLastDay(); // 11 and 63
      const bags = Math.ceil(last / bag) - Math.floor(LONG_RUN_MAX_DAY / bag); // bags 3, 4, 5 and 6 = 4
      expect(bag).toBe(11);
      expect(bags).toBe(4);
      expect(last).toBe(59 + bags);
      expect(last).toBeLessThanOrEqual(ENDLESS_LAST_DAY); // the pinned bound (64) holds the ON world's deepest dusk too
      // the deepest record: day 63, 29 wins, 2 draws, and 8 losses cut by 4 PATCH UPs
      expect(has(25, last, ENDLESS_WIN_CAP - 1, 1)).toBe(true);
      expect(endlessRecords(25, last + 1)).toEqual([]);
    });
  });

  it("per victory day the deepest dusk grows with the victory day (and never passes the pinned bound)", () => {
    // BUMP-1F (RULING-BUMP1F-R3.3, R5.4; TRIAGE-R34 line 71): was one bare loop ending `expect(prev).toBe(ENDLESS_LAST_DAY)` (64 in the OFF world's 10-day bag; 63 with the 11-day bag, prev 63 vs 64); the loop runs in both worlds
    const deepestByVictoryDay = (): number => {
      let prev = 0;
      for (let vd = WIN_GOAL; vd <= LONG_RUN_MAX_DAY; vd++) {
        let deepest = 0;
        for (let d = vd + 1; d <= ENDLESS_LAST_DAY + 2; d++) if (endlessRecords(vd, d).length) deepest = d;
        expect(deepest, `victory day ${vd}`).toBeLessThanOrEqual(ENDLESS_LAST_DAY);
        expect(deepest, `victory day ${vd}`).toBeGreaterThanOrEqual(prev - 1); // the bag alignment can give or take a day, never more
        prev = deepest;
      }
      return prev;
    };
    expect(off(deepestByVictoryDay)).toBe(ENDLESS_LAST_DAY);
    expect(on(deepestByVictoryDay)).toBe(63);
  });

  it("the stores' dDD keys hold it (data safety: two digits), and the game ends endless there (endlessDusk)", () => {
    expect(ENDLESS_LAST_DAY).toBeLessThanOrEqual(99);
    expect(endlessDusk(3, 1, ENDLESS_LAST_DAY, "draw").end).toBe("lastDay");
  });
});

describe("ENDLESS-1 3.4: the endless record model (records.ts endlessRecords)", () => {
  it("the first endless dusk (victory day + 1) is entered with no endless win and all 3 hearts, and only that", () => {
    expect(endlessRecords(12, 13)).toEqual([{ wins: 0, lives: ENDLESS_LIVES }]);
  });

  it("three dusks fought (day 16, victory day 12): the records the dusks lead to, and none they cannot", () => {
    expect(has(12, 16, 3, 3)).toBe(true); // W W W
    expect(has(12, 16, 2, 3)).toBe(true); // W W draw
    expect(has(12, 16, 2, 2)).toBe(true); // W W L
    expect(has(12, 16, 1, 1)).toBe(true); // W L L
    expect(has(12, 16, 1, 3)).toBe(true); // W draw draw
    expect(has(12, 16, 0, 2)).toBe(true); // L draw draw
    expect(has(12, 16, 0, 1)).toBe(true); // L L draw
    expect(has(12, 16, 0, 3, { patchUp: false })).toBe(false); // three draws: an upload carries at most ENDLESS_MAX_DRAWS (2)
    expect(has(12, 16, 0, 3)).toBe(true); // ...but draw, loss, PATCH UP, draw is a record: the dock gives the heart back
    expect(has(12, 16, 3, 2)).toBe(false); // three wins cost no heart
    expect(has(12, 16, 4, 3)).toBe(false); // more wins than dusks
    expect(has(12, 16, 0, 0)).toBe(false); // 0 hearts ends endless: it is no dusk's record
    expect(has(12, 16, 3, 1)).toBe(false);
  });

  it("hearts never pass ENDLESS_LIVES, and wins never pass ENDLESS_WIN_CAP - 1 into a dusk", () => {
    for (const d of [14, 20, 30, 45, 64]) for (const r of endlessRecords(25, d)) {
      expect(r.lives).toBeGreaterThanOrEqual(1);
      expect(r.lives).toBeLessThanOrEqual(ENDLESS_LIVES);
      expect(r.wins).toBeLessThanOrEqual(ENDLESS_WIN_CAP - 1);
      expect(r.wins).toBeLessThanOrEqual(d - 1 - 25);
    }
    expect(endlessRecords(10, 10 + ENDLESS_WIN_CAP + 1, { patchUp: false }).every((r) => r.wins <= ENDLESS_WIN_CAP - 1)).toBe(true);
  });

  it("PATCH UP is what lets a run lose more than ENDLESS_LIVES - 1 dusks and still be alive", () => {
    // victory day 10, four dusks fought (days 11-14, entering day 15): L L, PATCH UP at the road of day 13 (hearts 1 -> 2), draw draw
    expect(has(10, 15, 0, 2)).toBe(true);
    expect(has(10, 15, 0, 2, { patchUp: false })).toBe(false); // without it: one loss and three draws, and an upload carries two
    expect(has(10, 14, 0, 1, { patchUp: false })).toBe(true); // L L draw: no PATCH UP needed
  });

  it("PATCH UP comes once per event bag: one dock in the rest of the bag the victory fell in (days 26-30), a second only from day 31", () => {
    // BUMP-1F (RULING-BUMP1F-R3.3, R5.4; TRIAGE-R34 line 72): the body as it was (the 10-day bag: the victory on day 25 falls in days 21-30, the second dock opens on the road of day 31) runs under off();
    // the ON twin below is the 11-day bag's (the victory falls in days 23-33; the first dock is the rest of that bag, the second opens only on the road of day 34): has(25, 31, 0, 2) is false there
    off(() => {
      // victory day 25, dusks 26-29 (four, entering day 30), no win: at most 2 draws, so at least 2 losses
      expect(has(25, 30, 0, 1, { patchUp: false })).toBe(true); // L L draw draw: two losses, no dock
      expect(has(25, 30, 0, 2, { patchUp: false })).toBe(false);
      expect(has(25, 30, 0, 2)).toBe(true); // L PATCH UP L draw: the dock undoes one loss
      expect(has(25, 30, 0, 3)).toBe(false); // hearts back at 3 after two losses need two docks, and days 26-30 hold one
      // five dusks (entering day 31), no win: at least 3 losses; hearts 2 take two docks, and the second is the next bag's, on the road of
      // day 31 (before that dusk); hearts 3 would take three
      expect(has(25, 31, 0, 2)).toBe(true);
      expect(has(25, 31, 0, 2, { patchUp: false })).toBe(false);
      expect(has(25, 31, 0, 3)).toBe(false);
    });
    on(() => {
      expect(has(25, 30, 0, 1, { patchUp: false })).toBe(true); // the same four dusks: L L draw draw, no dock
      expect(has(25, 30, 0, 2, { patchUp: false })).toBe(false);
      expect(has(25, 30, 0, 2)).toBe(true); // the first dock is the same: L PATCH UP L draw (days 26-33 hold it)
      expect(has(25, 30, 0, 3)).toBe(false); // hearts back at 3 after two losses need two docks, and the rest of the victory's bag holds one
      // five dusks (entering day 31), no win: at least 3 losses and the one dock: 3 - 3 + 1 hearts; the second dock is the next bag's, on the road of day 34, not of day 31
      expect(has(25, 31, 0, 2)).toBe(false); // BUMP-1F: true with the 10-day bag (the OFF half above)
      expect(has(25, 31, 0, 1)).toBe(true);
      expect(has(25, 31, 0, 2, { patchUp: false })).toBe(false);
      expect(has(25, 31, 0, 3)).toBe(false);
    });
  });

  it("a day with no dusk since the victory (or before it) has no records", () => {
    expect(endlessRecords(12, 12)).toEqual([]);
    expect(endlessRecords(12, 3)).toEqual([]);
    expect(endlessRecords(9, 14)).toEqual([]); // no run is won before WIN_GOAL
    expect(endlessRecords(26, 30)).toEqual([]); // nor after LONG_RUN_MAX_DAY
  });
});

describe("ENDLESS-1 3.4: endlessRecordProblem, the server's record check for an endless snapshot", () => {
  // victory day 12 with 1 loss (9 wins + 1 loss + 1 draw before it), then 3 endless dusks W W L: 2 endless wins, 2 hearts, day 16
  const ok = { rules: RULES_VERSION, day: 16, victoryDay: 12, endlessWins: 2, endlessLives: 2, losses: 1 };

  it("an honest endless record passes", () => {
    expect(endlessRecordProblem(ok)).toBeNull();
    expect(endlessRecordProblem({ ...ok, losses: 2, victoryDay: 13, day: 17 })).toBeNull(); // 9 wins + 2 losses + 1 draw before day 13
    const { losses: _l, ...unstated } = ok;
    expect(endlessRecordProblem(unstated)).toBeNull(); // a snapshot without `losses` asks no more of the run's model than it can tell
  });

  it("the run was not won on that day: its losses and its victory day disagree", () => {
    expect(endlessRecordProblem({ ...ok, victoryDay: 10, losses: 3 })).toMatch(/^record: no run wins its 10th on day 10 with 3 losses/); // 9 wins fill the 9 dusks before day 10
    expect(endlessRecordProblem({ ...ok, victoryDay: 25, losses: 0 })).toMatch(/^record: no run wins its 10th on day 25 with 0 losses/); // 15 draws: a run carries at most MAX_RUN_DRAWS (8)
    expect(endlessRecordProblem({ ...ok, victoryDay: 11, losses: 0 })).toBeNull(); // one draw before the 10th win is a record
  });

  it("the endless counts cannot follow from the dusks fought", () => {
    expect(endlessRecordProblem({ ...ok, endlessWins: 3, endlessLives: 2 })).toMatch(/^record: 3 endless wins and 2 hearts is no record a run won on day 12 carries into endless dusk 16/);
    expect(endlessRecordProblem({ ...ok, endlessWins: 3, endlessLives: 1 })).toMatch(/^record: 3 endless wins and 1 hearts/); // three wins cost no heart
  });

  it("LAST CHANCE belongs to the run: judged by the run's model (it fires only at a loss leaving 1 heart), the endless part asks nothing of it", () => {
    expect(endlessRecordProblem({ ...ok, lastChance: { day: 4 } })).toMatch(/after a LAST CHANCE on day 4/); // 1 loss at 10 hearts never fires it
  });
});

describe("ENDLESS-1 3.4: the run's own record model is untouched (RUN-1's, bb-0.11.0)", () => {
  it("reachableRecords / isReachable for a run: wins never reach WIN_GOAL into a dusk; the deepest day is still 17 without a draw", () => {
    for (const d of [3, 10, 14, 20, 25]) for (const r of reachableRecords(d)) expect(r.wins).toBeLessThanOrEqual(WIN_GOAL - 1);
    expect(isReachable(14, 10, 5)).toBe(false);
    expect(reachableRecords(LONG_RUN_MAX_DAY + 1)).toEqual([]);
  });
});
