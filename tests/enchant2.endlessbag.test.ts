// BUMP-1F (RULING-BUMP1F-R3.3): ENCHANT-2 puts the ASH SHRINE in the event bag, so with ENCHANT on a bag is 11 days; ENDLESS-1's record model
// (src/net/records.ts endlessWalk) took a bag as BAG_DAYS = 10 and opened the DOCK's next PATCH UP on the wrong day. It reads bagIds().length now,
// as longStates does. This file proves the model opens its bags where the GAME's bags open (src/game/events.ts eventSequence, a long run), in both
// worlds, and pins what the walk derives in each.
import { describe, expect, it } from "vitest";
import { BAG_DAYS, endlessLastDay, endlessRecords } from "../src/net/records";
import { bagIds } from "../src/game/eventDefs";
import { eventSequence } from "../src/game/events";
import { withEnchant } from "../src/sim/enchant";
import { ENDLESS_LAST_DAY } from "../src/sim/endless";

const has = (vd: number, day: number, wins: number, lives: number, opts?: { patchUp?: boolean }): boolean => endlessRecords(vd, day, opts).some((r) => r.wins === wins && r.lives === lives);

/** The days one bag covers in the GAME: the index at which a long run's events first repeat (each bag holds every event once). */
function gameBag(): number {
  for (const seed of [1, 2, 3, 4, 5]) {
    const seq = eventSequence(seed, 40, true), seen = new Set<string>();
    const rep = seq.findIndex((e) => (seen.has(e) ? true : (seen.add(e), false)));
    expect(rep, `seed ${seed}`).toBe(bagIds().length);
  }
  return bagIds().length;
}

describe("endlessWalk opens its event bags where the game's bags open (RULING-BUMP1F-R3.3)", () => {
  it("OFF: the game's bag is 10 events (BAG_DAYS); the second dock of a victory on day 25 opens on the road of day 31", () => {
    withEnchant(() => {
      expect(gameBag()).toBe(10);
      expect(BAG_DAYS).toBe(10);
      expect(has(25, 30, 0, 2)).toBe(true); // L PATCH UP L draw: the rest of the bag the victory fell in (days 26-30) holds one dock
      expect(has(25, 31, 0, 2)).toBe(true); // five dusks, no win: three losses and two draws; hearts 2 need the second dock, the next bag's, on the road of day 31
      expect(has(25, 31, 0, 3)).toBe(false);
      expect(endlessLastDay()).toBe(64); // ENDLESS_LAST_DAY, derived (tests/endless1.records pins it)
    }, false);
  });

  it("ON: the game's bag is 11 events (the ASH SHRINE joins); the same victory's bag is days 23-33, so the second dock opens only on the road of day 34", () => {
    withEnchant(() => {
      expect(gameBag()).toBe(11);
      expect(has(25, 30, 0, 2)).toBe(true); // the first dock is the same
      // BUMP-1F: the model said true here with BAG_DAYS 10 (the next bag opened on day 31): a record no honest 11-day-bag run can have
      expect(has(25, 31, 0, 2)).toBe(false);
      expect(has(25, 31, 0, 1)).toBe(true); // three losses, two draws and the one dock: 3 - 3 + 1 hearts
      expect(has(25, 31, 0, 3)).toBe(false);
      // the deepest dusk the walk derives is one day earlier than the 10-event bag's, inside the pinned bound
      expect(endlessLastDay()).toBe(63);
      expect(endlessLastDay()).toBeLessThanOrEqual(ENDLESS_LAST_DAY);
    }, true);
  });

  it("the walk's last day follows the world's bag for any victory day: never later with the longer bag", () => {
    const off = withEnchant(() => [10, 15, 20, 25].map((vd) => deepest(vd)), false);
    const on = withEnchant(() => [10, 15, 20, 25].map((vd) => deepest(vd)), true);
    for (let i = 0; i < off.length; i++) expect(on[i], `victory day ${[10, 15, 20, 25][i]}`).toBeLessThanOrEqual(off[i] + 1);
    expect(Math.max(...on)).toBeLessThanOrEqual(ENDLESS_LAST_DAY);
  });
});

/** The deepest day with a record for a victory on `vd` (a scan to the pinned bound + 2). */
function deepest(vd: number): number {
  let d = 0;
  for (let day = vd + 1; day <= ENDLESS_LAST_DAY + 2; day++) if (endlessRecords(vd, day).length) d = day;
  return d;
}
