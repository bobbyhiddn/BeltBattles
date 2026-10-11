// RETUNE-1 T3 (REQ-BFG-096): the run models follow the hearts rule. tools/samplePool.ts drawnLabel draws the seed pool's
// records on the hearts scale with HEARTS on (from the hearts record model) and exactly as before with it off; tools/
// loss1.ts's hearts ledger (heartsLoss) is the game's own step (hearts.ts heartsDusk), so the bench and the game can't
// drift. (tools/retune1.ts's ledgers take the same step; generateSamplePool() with every switch off stays byte-identical:
// tests/p2.floor.test.ts pins it.) HEARTS is set through its setter and put back off after each test.
import { afterEach, describe, expect, it } from "vitest";
import { START_LIVES } from "../src/sim/content";
import { HEARTS_START, heartsDusk, setHearts, withHearts } from "../src/sim/hearts";
import { isReachable, reachableRecords } from "../src/net/records";
import { drawnLabel, reachableLabel } from "../tools/samplePool";
import { heartCost as benchCost, heartsLoss } from "../tools/loss1";
import { heartCost } from "../src/sim/hearts";

afterEach(() => setHearts(false));

describe("RETUNE-1 T3: the seed pool's drawn labels", () => {
  it("HEARTS off: exactly the 5-life label as before (START_LIVES - min(START_LIVES - 1, lost), snapped)", () => {
    for (let day = 1; day <= 10; day++) {
      for (let wins = 0; wins < day; wins++) {
        for (let lost = 0; lost < day - wins; lost++) {
          expect(drawnLabel(day, wins, lost)).toEqual(reachableLabel(day, wins, START_LIVES - Math.min(START_LIVES - 1, lost)));
        }
      }
    }
  });

  it("HEARTS on: the hearts after losing the dusks just before the day, a record the hearts model reaches", () => {
    withHearts(() => {
      for (let day = 1; day <= 10; day++) {
        for (let wins = 0; wins < day; wins++) {
          for (let lost = 0; lost < day - wins; lost++) {
            const r = drawnLabel(day, wins, lost);
            expect(r.wins).toBe(wins);
            expect(isReachable(day, r.wins, r.lives)).toBe(true);
            expect(r.lives).toBeGreaterThanOrEqual(1);
            expect(r.lives).toBeLessThanOrEqual(HEARTS_START);
          }
        }
      }
      // hand-checked: day 8, 2 wins, the 3 dusks before it lost (days 5, 6, 7: 2 + 2 + 3) -> 3 hearts
      expect(drawnLabel(8, 2, 3)).toEqual({ wins: 2, lives: 3 });
      // day 4, 0 wins, 3 lost (days 1-3) -> 7; none lost -> 10
      expect(drawnLabel(4, 0, 3)).toEqual({ wins: 0, lives: 7 });
      expect(drawnLabel(4, 0, 0)).toEqual({ wins: 0, lives: 10 });
      // the scale reaches 10 hearts at every dusk
      for (let day = 1; day <= 10; day++) expect(reachableRecords(day).some((r) => r.lives === HEARTS_START)).toBe(true);
    });
  });
});

describe("RETUNE-1 T3: tools/loss1.ts's hearts ledger is the game's step", () => {
  it("heartCost and heartsLoss equal hearts.ts heartCost and heartsDusk (no flags: the operator's rule)", () => {
    for (let day = 1; day <= 12; day++) expect(benchCost(day)).toBe(heartCost(day));
    for (let h = 1; h <= HEARTS_START; h++) {
      for (let day = 1; day <= 10; day++) {
        for (const r of [0, 1, -1]) {
          for (const used of [false, true]) {
            const s = heartsDusk(h, day, r === 0 ? "win" : r === 1 ? "loss" : "draw", used);
            expect(heartsLoss(h, day, r, used)).toEqual({ hearts: s.hearts, lastChance: s.lastChance });
          }
        }
      }
    }
  });
});
