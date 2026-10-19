// BUMP-1F P2 (F5, BUMP-1E REPORT section 11): the par player's road accounting never books a NEGATIVE sale loss (src/sim/harness/player.ts parNpcDay).
// The day's sale loss is what came in (the win's gold, the drop at its star as the road log counts it) minus what the deck, the purse and the cargo
// gained. It went negative when the placement GAINED value: the loose run of seed 1003 (furnace, candidate #3 of the stand-in generator) reads soldLoss
// -6 on days 4-6, -4 on day 7, -2 on days 8 and 9 in the bb-0.12.0 world, because its day-4 drop merged into a star worth 6 more than it came in at. The
// pick the regeneration stored from it (furnace d4 #2: cost 71, spent 48, drops 17) was 6 short of its deck, and tests/standin.caravan and
// standInPool.gen pinned it as SALE_GAIN. The fix books the gain as a gain: a part of the road's drops (PlayerDay.roadGain, in roadDrops), so
// spent + drops = value + rerolls + soldLoss + cargo holds with soldLoss >= 0 for every run. Proof: the known run in the bb-0.12.0 world (GATES and
// ENCHANT off), then every candidate of a sweep of the stand-in generator's population in that world and in the shipped one.
import { describe, expect, it } from "vitest";
import { CARAVAN_POLICY, caravanCandidate } from "../src/sim/harness/caravan";
import { PLAYER_DAYS, playerRoadLog, playerRun } from "../src/sim/harness/player";
import { STANDIN_MAX_STARS, boughtCost } from "../src/sim/harness/standins";
import { runeGrants } from "../src/sim/runes";
import { maxGoldByDay } from "../src/net/validate";
import { roadDropValue } from "../src/sim/npcDay";
import { withGates } from "../src/sim/gates";
import { withEnchant } from "../src/sim/enchant";

const HEROES = ["furnace", "weaver"] as const;
/** The bb-0.12.0 world: GATES and ENCHANT off (the 1E pools were made in it), everything else as shipped. */
const world12 = <T>(fn: () => T): T => withGates(() => withEnchant(fn, false), false);

describe("BUMP-1F F5: a road placement that gains value books a gain, never a negative sale loss", () => {
  it("the known run (furnace, loose, seed 1003) in the bb-0.12.0 world: soldLoss was -6/-6/-6/-4/-2/-2 on days 4-9; now >= 0, the 6 gained is roadGain", () => {
    world12(() => {
      const days = playerRun("furnace", PLAYER_DAYS, 1003, { ...CARAVAN_POLICY.loose, maxStars: STANDIN_MAX_STARS });
      const rows = days.slice(3, 9).map((d) => [d.soldLoss, d.roadGain ?? 0]);
      expect(rows).toEqual([[0, 6], [0, 6], [0, 6], [2, 6], [4, 6], [4, 6]]);
      for (const d of days) {
        expect(d.soldLoss, `d${d.day}`).toBeGreaterThanOrEqual(0);
        // the drops the road log counts, plus the gains the placements booked
        expect(d.roadDrops, `d${d.day}`).toBe(roadDropValue(playerRoadLog(days, d.day)) + (d.roadGain ?? 0));
        // the day's gold adds up with the cargo left over, as tests/harness.player's roadBudget and goldIn say (never a negative cargo)
        const budget = maxGoldByDay(d.day) + runeGrants(d.build.runes, d.day).gold + (d.roadGold ?? 0) + (d.roadDrops ?? 0);
        expect(boughtCost(d.build) + d.rerollGold + d.gold + d.soldLoss + (d.cargo ?? 0), `d${d.day}: the gold adds up`).toBe(budget);
        expect(d.cargo ?? 0, `d${d.day}`).toBeGreaterThanOrEqual(0);
      }
    });
  });

  it("the candidate's meta: furnace d4 #3 of generator seed 1 (the run above) has soldLoss 0, cargoGold >= 0 and spent + road >= its deck", () => {
    world12(() => {
      const d = caravanCandidate("furnace", 4, 1, 3, STANDIN_MAX_STARS);
      expect([d.meta.policy, d.meta.seed]).toEqual(["loose", 1003]);
      expect(d.meta.soldLoss).toBe(0);
      expect(d.meta.cargoGold).toBeGreaterThanOrEqual(0);
      expect(d.meta.spent + (d.meta.road ?? 0)).toBeGreaterThanOrEqual(d.value);
    });
  });

  for (const [name, wrap] of [["the bb-0.12.0 world", world12], ["the shipped world (GATES and ENCHANT on)", <T>(fn: () => T): T => fn()]] as const) {
    it(`a sweep of the stand-in population (${name}): no run books a negative sale loss; the cargo is never negative`, () => {
      wrap(() => {
        let runs = 0, gains = 0;
        for (const hero of HEROES) {
          for (let idx = 0; idx < 8; idx++) {
            for (const day of [1, 4, 7, 10, 13, 16]) {
              const d = caravanCandidate(hero, day, 1, idx, STANDIN_MAX_STARS);
              expect(d.meta.soldLoss, `${hero} d${day} #${idx}`).toBeGreaterThanOrEqual(0);
              expect(d.meta.cargoGold, `${hero} d${day} #${idx}`).toBeGreaterThanOrEqual(0);
              if (day === 4) runs++;
            }
            const full = playerRun(hero, 16, 1000 + idx, { ...CARAVAN_POLICY.typical, maxStars: STANDIN_MAX_STARS });
            for (const d of full) {
              expect(d.soldLoss, `${hero} s${1000 + idx} d${d.day}`).toBeGreaterThanOrEqual(0);
              if (d.roadGain) gains++;
            }
          }
        }
        expect(runs).toBe(16);
        expect(gains).toBeGreaterThanOrEqual(0);
      });
    }, 300_000);
  }
});

