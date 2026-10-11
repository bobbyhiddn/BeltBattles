// 0.6.0d D3: no dud event on day 10. 0.6.0c blocks HERALD's STAKE 3 and SAPPERS' HIRE on day 10
// (NO WARLORD LEFT), which left those events with only DECLINE / MOVE ON as the last stop. Now a
// run's event order never puts HERALD or SAPPERS on day 10: such an order swaps day 10 with the
// latest earlier day whose event is neither; every other order is exactly 0.6.0c's.
import { describe, expect, it } from "vitest";
import { hashSeed, Rng } from "../src/core/rng";
import { BAG_IDS, WARLORD_EVENT_IDS, type EventId } from "../src/game/eventDefs";
import { choicesFor, eventFor, eventSequence, makeEvent } from "../src/game/events";
import { finishWarlord, forkFor, onToTheRoad, pickRoad } from "../src/game/road"; // AZ-BUMP: the event after the fight
import { newRun } from "../src/game/run";
import { RUN_DAYS } from "../src/sim/content";

const SEEDS = Array.from({ length: 1000 }, (_, n) => 11 + n * 7919);
const DUDS = new Set<EventId>(["herald", "sappers"]);

/** The 0.6.0c rule, kept as the test's reference: shuffled bags, never the same twice in a row. */
function order060c(seed: number, n: number): EventId[] {
  const out: EventId[] = [];
  for (let bag = 0; out.length < n; bag++) {
    const ids = new Rng(hashSeed(seed, "event-bag", bag)).shuffle([...BAG_IDS]);
    if (ids[0] === out[out.length - 1]) [ids[0], ids[1]] = [ids[1], ids[0]];
    out.push(...ids);
  }
  return out.slice(0, n);
}

const runOrder = (seed: number): EventId[] => Array.from({ length: RUN_DAYS }, (_, i) => eventFor(seed, i + 1));

describe("no dud last stop (0.6.0d): HERALD and SAPPERS never land on day 10", () => {
  it("the duds are HERALD and SAPPERS, and a run is one bag of all 10 events", () => {
    expect(WARLORD_EVENT_IDS).toEqual(["herald", "sappers"]);
    expect([RUN_DAYS, BAG_IDS.length]).toEqual([10, 10]);
  });

  it("1000 seeds: day 10 is never HERALD or SAPPERS, and no order repeats an event", () => {
    for (const seed of SEEDS) {
      const o = runOrder(seed);
      expect(DUDS.has(o[RUN_DAYS - 1]), `seed ${seed}: ${o.join(" ")}`).toBe(false);
      expect(new Set(o).size).toBe(RUN_DAYS);
      expect([...o].sort()).toEqual([...BAG_IDS].sort()); // every event exactly once
      expect(eventSequence(seed, RUN_DAYS)).toEqual(o);
    }
  });

  it("1000 seeds: an order whose 0.6.0c day 10 was neither is unchanged; the others swap day 10 with the latest earlier non-dud day", () => {
    let moved = 0, herald = 0, sappers = 0, back = 0;
    for (const seed of SEEDS) {
      const old = order060c(seed, RUN_DAYS), now = runOrder(seed);
      const last = old[RUN_DAYS - 1];
      if (!DUDS.has(last)) {
        expect(now, `seed ${seed}`).toEqual(old);
        continue;
      }
      moved++;
      if (last === "herald") herald++; else sappers++;
      let j = RUN_DAYS - 2;
      while (DUDS.has(old[j])) j--;
      if (j < RUN_DAYS - 2) back++;
      const want = [...old];
      [want[j], want[RUN_DAYS - 1]] = [want[RUN_DAYS - 1], want[j]];
      expect(now, `seed ${seed}`).toEqual(want);
      expect(now.filter((id, i) => id !== old[i]).length).toBe(2); // only day j and day 10 moved
    }
    // eslint-disable-next-line no-console
    console.log(`lastStop: 1000 seeds, ${moved} orders had a dud on day 10 in 0.6.0c (HERALD ${herald}, SAPPERS ${sappers}; ${back} swapped past a day-9 dud)`);
    expect(moved).toBeGreaterThan(100);
    expect(moved).toBeLessThan(350);
    expect(back).toBeGreaterThan(0);
  });

  it("longer sequences still never repeat an event on consecutive days, and days past 10 follow on", () => {
    for (const seed of SEEDS.slice(0, 300)) {
      const s = eventSequence(seed, 30);
      for (let i = 1; i < s.length; i++) expect(s[i], `seed ${seed} day ${i + 1}`).not.toBe(s[i - 1]);
      expect(s.slice(0, RUN_DAYS)).toEqual(runOrder(seed));
      for (let d = 1; d <= 12; d++) expect(eventFor(seed, d)).toBe(s[d - 1]);
    }
  });

  it("the day-10 fork and road event are never a dud, and the NO WARLORD LEFT block stays as the safety net", () => {
    for (const seed of SEEDS.slice(0, 200)) {
      const run = newRun("furnace", seed);
      run.day = RUN_DAYS;
      expect(DUDS.has(forkFor(run).event)).toBe(false);
      run.gold = 20;
      // AZ-BUMP (the flip, NPC_DAY): the day's event comes after the warlord fight (the fork offers no event stop, and
      // beginRoad opens nothing before a fight), so the day-10 event opens as the game opens it: a fight (lost here: no gold,
      // no drop), then ON TO THE ROAD (was beginRoad, 0.9.7's event stop)
      expect(pickRoad(run, "easy").ok).toBe(true);
      finishWarlord(run, 1, 30);
      expect(onToTheRoad(run)).toBe("event");
      expect(DUDS.has(run.event!.id)).toBe(false);
      expect(choicesFor(run).some((c) => !c.blocked)).toBe(true);
    }
    for (const id of ["herald", "sappers"] as EventId[]) {
      const run = newRun("furnace", 4242);
      run.day = RUN_DAYS;
      run.gold = 20;
      run.event = makeEvent(run.seed, RUN_DAYS, id); // e.g. a saved run that stored it before 0.6.0d
      expect(choicesFor(run)[0].blocked).toBe("NO WARLORD LEFT");
    }
  });
});
