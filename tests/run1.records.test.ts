// RUN-1 T3 (REQ-BFG-059, REQ-BFG-116; D4): the record check for a LONG run (src/net/records.ts longRunRecords). A long run is
// WON at its 10th dusk win and LOST at 0 hearts, with no day limit, so the server's record model has no last day either:
//  - wins <= WIN_GOAL - 1 into a dusk (a run ghost is a dusk BEFORE its win);
//  - hearts consistent with the losses by day (a loss costs 1/2/3 from days 1/4/7), LAST CHANCE on any day, PATCH UP;
//  - day - 1 = wins + losses + draws, with at most MAX_RUN_DRAWS draws (anti-forgery: draws are the only way a run could
//    last without end), and the snapshot's optional `losses`, when it has one, must match.
// LONG_RUN_DEEPEST_DAY (17) is pinned here against the model, as src/sim/longRun.ts says. The switch is put back after each test.
import { afterEach, describe, expect, it } from "vitest";
import { BAG_IDS } from "../src/game/eventDefs";
import { HEARTS_START, withHearts } from "../src/sim/hearts";
import { LONG_RUN_DEEPEST_DAY, LONG_RUN_MAX_DAY, MAX_RUN_DRAWS, WIN_GOAL, setLongRun, withLongRun } from "../src/sim/longRun";
import { BAG_DAYS, isReachable, reachableRecords, type DuskRecord } from "../src/net/records";

afterEach(() => setLongRun(false)); // the shipped value

const long = <T>(fn: () => T): T => withLongRun(fn);
type Opts = Parameters<typeof reachableRecords>[1];
const key = (r: DuskRecord) => `${r.wins}W${r.lives}`;
/** The deepest day with any reachable record (a run that reaches day d's dusk), by walking the days up. */
const deepest = (opts: Opts = {}): number => {
  let d = 1;
  while (reachableRecords(d + 1, opts).length) d++;
  return d;
};

describe("RUN-1 records: the long run's model (D4)", () => {
  it("the bounds and the bag: BAG_DAYS is the event bag (10), LONG_RUN_MAX_DAY = deepest + draws", () => {
    expect(BAG_DAYS).toBe(BAG_IDS.length);
    expect(BAG_DAYS).toBe(10);
    expect(LONG_RUN_MAX_DAY).toBe(LONG_RUN_DEEPEST_DAY + MAX_RUN_DRAWS);
    expect([WIN_GOAL, MAX_RUN_DRAWS, LONG_RUN_DEEPEST_DAY, LONG_RUN_MAX_DAY]).toEqual([10, 8, 17, 25]);
  });

  it("days 1-10 read as the hearts model does: the same (wins, lives) pairs, with every LAST CHANCE filter", () => {
    for (let day = 1; day <= 10; day++) {
      const variants: Opts[] = [{}, { draws: false }, { lastChance: null }, ...Array.from({ length: day - 1 }, (_, i): Opts => ({ lastChance: i + 1 }))];
      for (const o of variants) {
        const live = reachableRecords(day, o).map(key);
        const mine = long(() => reachableRecords(day, o).map(key));
        expect(mine, `day ${day} ${JSON.stringify(o)}`).toEqual(live);
      }
    }
    // the one place the draw bound shows on days 1-10: with no PATCH UP, 0 wins and every heart at day 10 is 9 draws
    const noDock = reachableRecords(10, { patchUp: false }).map(key);
    const noDockLong = long(() => reachableRecords(10, { patchUp: false }).map(key));
    expect(noDock.filter((k) => !noDockLong.includes(k))).toEqual(["0W10"]);
    expect(noDockLong.filter((k) => !noDock.includes(k))).toEqual([]);
    for (let day = 1; day < 10; day++) expect(long(() => reachableRecords(day, { patchUp: false }).map(key))).toEqual(reachableRecords(day, { patchUp: false }).map(key));
  });

  it("the deepest day without draws is 17 (16 without PATCH UP): LONG_RUN_DEEPEST_DAY is pinned against the model", () => {
    long(() => {
      expect(deepest({ draws: false })).toBe(LONG_RUN_DEEPEST_DAY); // 9 wins and the 7 losses 10 hearts, LAST CHANCE and PATCH UP survive
      expect(deepest({ draws: false, patchUp: false })).toBe(LONG_RUN_DEEPEST_DAY - 1); // 16: 6 losses
      // at the deepest dusk the run has its 9 wins and nothing else: every record there is 9 wins
      expect(reachableRecords(17, { draws: false }).every((r) => r.wins === WIN_GOAL - 1)).toBe(true);
      expect(reachableRecords(17, { draws: false, patchUp: false })).toEqual([]);
      expect(reachableRecords(16, { draws: false, patchUp: false }).map(key)).toEqual(["9W1"]);
      // PATCH UP comes once per event bag, and a second one (days 11-20) does not take a run deeper: still 17
      expect(reachableRecords(18, { draws: false })).toEqual([]);
      // 17 needs a LAST CHANCE and an early PATCH UP; with LAST CHANCE never fired no run gets there
      expect(reachableRecords(17, { draws: false, lastChance: null })).toEqual([]);
      expect(reachableRecords(17, { draws: false, lastChance: 7 }).length).toBeGreaterThan(0);
    });
  });

  it("with draws the model reaches LONG_RUN_MAX_DAY (25) and no further", () => {
    long(() => {
      expect(deepest()).toBe(LONG_RUN_MAX_DAY);
      expect(reachableRecords(LONG_RUN_MAX_DAY).length).toBeGreaterThan(0);
      expect(reachableRecords(LONG_RUN_MAX_DAY + 1)).toEqual([]);
      for (const d of [0, -1, 1.5, NaN, 99, 10_000_000]) expect(reachableRecords(d), `day ${d}`).toEqual([]); // data safety: no loop to run
    });
  });

  it("wins never pass 9 into a dusk, and hearts stay 1..10, on every day", () => {
    long(() => {
      for (let day = 1; day <= LONG_RUN_MAX_DAY; day++) {
        for (const r of reachableRecords(day)) {
          expect(r.wins, `day ${day}`).toBeLessThanOrEqual(WIN_GOAL - 1);
          expect(r.wins).toBeLessThanOrEqual(day - 1);
          expect(r.lives).toBeGreaterThanOrEqual(1);
          expect(r.lives).toBeLessThanOrEqual(HEARTS_START);
        }
      }
      expect(isReachable(14, 10, 5)).toBe(false); // 10 wins is the run's end, never a dusk's record
      expect(isReachable(14, 9, 10)).toBe(true);
    });
  });

  it("draws: at most MAX_RUN_DRAWS (8); the snapshot's losses make the count exact (day - 1 = wins + losses + draws)", () => {
    long(() => {
      expect(isReachable(18, 9, 10, { losses: 0 })).toBe(true); // 17 dusks: 9 wins and 8 draws
      expect(isReachable(19, 9, 10, { losses: 0 })).toBe(false); // 9 draws is past MAX_RUN_DRAWS
      expect(isReachable(19, 9, 10, { losses: 1 })).toBe(true); // 9 wins, 1 loss (PATCH UP put the heart back), 8 draws
      expect(isReachable(19, 9, 10)).toBe(true); // without `losses` the model finds that split itself
      expect(isReachable(19, 8, 10, { losses: 0 })).toBe(false); // wins + losses + draws = 8 + 0 + 10
      // with the draws off no run carries a draw: the dusks are wins and losses
      expect(isReachable(14, 9, 10, { draws: false })).toBe(false);
    });
  });

  it("hearts must match the losses: the same record under a count of losses its hearts cannot have", () => {
    long(() => {
      expect(isReachable(14, 5, 10)).toBe(true); // unknown losses: 8 draws
      expect(isReachable(14, 5, 10, { losses: 0 })).toBe(true);
      expect(isReachable(14, 5, 10, { losses: 4 })).toBe(false); // 4 losses cost at least 5 hearts, PATCH UP gives 1 back: 6 at most
      expect(isReachable(14, 5, 6, { losses: 4 })).toBe(true); // the days 1-3 losses (3), the day-4 loss (2), PATCH UP (1)
      expect(isReachable(14, 5, 6, { losses: 0 })).toBe(false); // 8 draws cost nothing: 10 hearts, not 6
      expect(isReachable(14, 5, 1, { losses: 8 })).toBe(false); // 8 losses: no run has hearts for 8 (7 is the most)
    });
  });

  it("a day its record cannot reach is refused (a dusk needs wins >= day - 16), the deepest honest one is not", () => {
    long(() => {
      // a run loses at most 7 dusks and draws at most 8, so a dusk's record has at least day - 1 - 15 wins
      expect(reachableRecords(16).some((r) => r.wins === 0)).toBe(true); // 15 dusks: 7 losses and 8 draws
      expect(reachableRecords(17).every((r) => r.wins >= 1)).toBe(true);
      expect(isReachable(17, 0, 1)).toBe(false);
      expect(isReachable(20, 3, 1)).toBe(false);
      expect(isReachable(20, 4, 1)).toBe(true);
      expect(isReachable(25, 8, 10)).toBe(false); // 24 dusks, 8 wins: 16 non-wins, more than 7 + 8
      expect(isReachable(25, 9, 1)).toBe(true); // 9 wins, 7 losses, 8 draws
      expect(isReachable(17, 9, 1, { losses: 7 })).toBe(true); // the deepest dusk without a draw
      expect(isReachable(17, 9, 1, { losses: 8 })).toBe(false); // 9 + 8 = 17 dusks are more than 16
    });
  });

  it("LAST CHANCE fires on ANY day (the 10-day model stops at day 10): days 11, 12 and 18 are reachable", () => {
    long(() => {
      for (const lcDay of [10, 11, 12, 18]) {
        expect(reachableRecords(lcDay + 2, { lastChance: lcDay }).length, `LAST CHANCE on day ${lcDay}`).toBeGreaterThan(0);
        expect(reachableRecords(lcDay, { lastChance: lcDay }), `not before day ${lcDay + 1}`).toEqual([]); // a record into day lcDay's dusk is before it
      }
      // the T1 test's run: days 1-3 lost (7 hearts), 7 wins, day 11 and day 12 lost (cost 3 each): LAST CHANCE on day 12, 1 heart at day 13
      expect(isReachable(13, 7, 1, { lastChance: 12, losses: 5 })).toBe(true);
      expect(isReachable(13, 7, 1, { lastChance: 12 })).toBe(true);
      // and a run at 1 heart that never had its LAST CHANCE is still no record
      expect(isReachable(13, 7, 1, { lastChance: null })).toBe(false);
    });
  });

  it("PATCH UP comes once per event bag, not once a run: a second one in days 11-20 is a reachable record", () => {
    long(() => {
      // 3 losses (days 1-3), 8 wins: one PATCH UP gives 8 hearts at most; 9 needs the second bag's dock (day 11 or 12)
      expect(isReachable(12, 8, 9, { losses: 3 })).toBe(true);
      expect(isReachable(12, 8, 10, { losses: 3 })).toBe(false);
      expect(isReachable(10, 6, 9, { losses: 3 })).toBe(false); // one bag by day 10: the 10-day rule's single PATCH UP
      expect(isReachable(10, 6, 8, { losses: 3 })).toBe(true);
      // dockDay (tests): PATCH UP only on that day's road, still once for that bag
      expect(isReachable(12, 8, 9, { losses: 3, ...({ dockDay: 11 } as object) })).toBe(false);
    });
  });

  it("the result is a fresh array each call (the model's memo is never handed out)", () => {
    long(() => {
      const a = reachableRecords(14);
      const n = a.length;
      a.length = 0;
      expect(reachableRecords(14)).toHaveLength(n);
      expect(n).toBeGreaterThan(10);
    });
  });

  it("on the lives scale (hearts off) a long run's model agrees with the 10-day lives model on days 1-10", () => {
    for (let day = 1; day <= 10; day++) {
      const live = withHearts(() => reachableRecords(day).map(key), false);
      const mine = withHearts(() => long(() => reachableRecords(day).map(key)), false);
      expect(mine, `lives scale day ${day}`).toEqual(live);
    }
  });

  it("with the switch off nothing changes: the long run's model is not read, `losses` is ignored", () => {
    expect(isReachable(14, 5, 10, { losses: 4 })).toBe(reachableRecords(14).some((r) => r.wins === 5 && r.lives === 10));
    expect(reachableRecords(11).some((r) => r.wins === 10)).toBe(true); // the 10-day model's bound is its own day, not the goal
  });
});
