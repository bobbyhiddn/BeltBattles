import { describe, expect, it } from "vitest";
// ENCHANT-2 (REQ-BFG-085; BRIEF-ENCHANT2 T3): the bots at the ASH SHRINE. The harness players took no road event before this job (par's road stop is the Medium
// warlord alone), so the shrine is the first event they answer; they answer it only when it is the day's event under ENCHANT, and ENCHANT off nothing changes.
import { eventFor } from "../src/game/events";
import { SHRINE_ID } from "../src/game/shrine";
import { casualRun } from "../src/sim/harness/casual";
import { wordsHeld } from "../src/sim/harness/enchantBot";
import { parRunSeed, playerRun, type PlayerDay } from "../src/sim/harness/player";
import type { HeroId } from "../src/sim/content";
import { withEnchant } from "../src/sim/enchant";
import { longRunRules } from "../src/sim/longRun";

const HEROES: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
const DAYS = 16;

function visits(days: PlayerDay[]): { day: number; v: NonNullable<NonNullable<PlayerDay["road"]>["shrine"]> }[] {
  return days.flatMap((d) => (d.road?.shrine ? [{ day: d.day, v: d.road.shrine }] : []));
}

describe("the bots at the ASH SHRINE", () => {
  it("ENCHANT off: no visit, and the runs are what they were (a visit never appears in a road stop)", () => {
    // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), TRIAGE-R34 line 57): was a bare loop (ENCHANT off by default; par visits the shrine on day 9 under the new default); runs under withEnchant(fn, false)
    withEnchant(() => {
      for (const hero of HEROES.slice(0, 2)) for (const seed of [1, 2]) {
        expect(visits(playerRun(hero, 10, seed))).toEqual([]);
        expect(visits(casualRun(hero, 10, seed, "c5"))).toEqual([]);
      }
    }, false);
  });

  it("ENCHANT on: a visit exactly on the days the run's event is the shrine, by par and by the casual c5; the word goes where the bot says; deterministic", () => {
    withEnchant(() => {
      const tally: Record<string, number[]> = { par: [0, 0, 0], c5: [0, 0, 0] };
      let days = 0, visitsN = 0, placed = 0;
      for (const hero of HEROES) {
        for (const seed of [1, 2, 3]) {
          for (const [who, run] of [["par", playerRun(hero, DAYS, seed)], ["c5", casualRun(hero, DAYS, seed, "c5")]] as [string, PlayerDay[]][]) {
            const rs = parRunSeed(hero, seed);
            for (const d of run) {
              days++;
              const shrineDay = eventFor(rs, d.day, longRunRules()) === SHRINE_ID;
              expect(!!d.road?.shrine, `${who} ${hero} s${seed} d${d.day}`).toBe(shrineDay);
              if (!d.road?.shrine) continue;
              visitsN++;
              const v = d.road.shrine;
              tally[who][v.card]++;
              if (v.word && v.on && v.on !== "none") {
                placed++;
                expect(wordsHeld(d.build).some((h) => h.word === v.word), `${who} ${hero} s${seed} d${d.day}: ${v.word} on the deck`).toBe(true);
              }
              if (v.card === 2) expect(v.word).toBeUndefined();
            }
          }
        }
      }
      // determinism: the same arguments give the same visits
      expect(visits(playerRun("weaver", DAYS, 3))).toEqual(visits(playerRun("weaver", DAYS, 3)));
      expect(visitsN).toBeGreaterThan(5);
      expect(tally.par[0] + tally.c5[0], "no bot takes the hull card (BOTS_TAKE_HULL)").toBe(0);
      console.log(`SHRINE-BOTS days ${days} visits ${visitsN} placed ${placed} tally[hull,part,move on] ${JSON.stringify(tally)}`);
    });
  }, 240_000);
});
