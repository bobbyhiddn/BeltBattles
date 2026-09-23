// The road fork (0.6.0b, REQ-BFG-010, spec §19): every day 1-10 offers the day's road event and
// the three warlords of warlordOffer, all fixed by the run seed; the player picks one stop a day.
import { describe, expect, it } from "vitest";
import { BAG_IDS, type EventId } from "../src/game/eventDefs";
import { eventFor } from "../src/game/events";
import { ROAD_PICKS, forkFor, leaveCaravan, pickRoad, roadChosen } from "../src/game/road";
import { newRun, reroll, rollShop, type Run } from "../src/game/run";
import { DIFFICULTIES, rivalBuild, warlordOffer } from "../src/sim/rivals";

const SEEDS = Array.from({ length: 50 }, (_, i) => 3 + i * 104729);
const DAYS = Array.from({ length: 10 }, (_, i) => i + 1);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** A fresh run moved to the dawn of `day` (its caravan rolled for that day). */
function atDay(seed: number, day: number): Run {
  const run = newRun(seed % 2 ? "furnace" : "weaver", seed);
  run.day = day;
  rollShop(run);
  return run;
}

describe("the road fork: what each day offers", () => {
  it("every day 1-10: the day's bag event and warlordOffer's three warlords, from the run seed alone", () => {
    for (const seed of SEEDS) {
      for (const day of DAYS) {
        const run = atDay(seed, day);
        const f = forkFor(run);
        expect(f.day).toBe(day);
        expect(f.event).toBe(eventFor(seed, day));
        expect(BAG_IDS).toContain(f.event);
        expect(f.warlords).toEqual(warlordOffer(seed, day, undefined));
        expect(f.warlords).toEqual(warlordOffer(seed, day, run.matriarchBeatenOn ?? undefined));
        // another run on the same seed (another run id), with a rerolled caravan: the same fork
        const twin = atDay(seed, day);
        twin.gold = 99;
        expect(reroll(twin) && reroll(twin)).toBe(true);
        expect(twin.runId).not.toBe(run.runId);
        expect(forkFor(twin)).toEqual(f);
        expect(forkFor(run)).toEqual(f); // asking twice changes nothing
      }
    }
  });

  it("a run that beat the Matriarch passes matriarchBeatenOn on to the offer", () => {
    for (const seed of SEEDS) {
      for (const day of [9, 10]) {
        const run = atDay(seed, day);
        run.matriarchBeatenOn = 8;
        expect(forkFor(run).warlords).toEqual(warlordOffer(seed, day, 8));
        expect(forkFor(run).warlords.hard).not.toBe("matriarch");
      }
    }
  });

  it("day 1 has no special intro: it draws from the whole bag, and offers three warlords like any day", () => {
    const dayOne = new Set<EventId>();
    for (const seed of SEEDS) {
      const f = forkFor(atDay(seed, 1));
      dayOne.add(f.event);
      expect(new Set(Object.values(f.warlords)).size).toBe(3);
    }
    expect(dayOne.size).toBeGreaterThan(2);
  });
});

describe("the road fork: picking a stop", () => {
  it("before a pick, leaving the caravan goes to the fork", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      for (const day of DAYS) {
        const run = atDay(seed, day);
        expect(roadChosen(run)).toBe(false);
        expect(leaveCaravan(run)).toBe("fork");
        expect(run.stage).toBe("fork");
        expect(run.road).toBe(null);
        expect(run.event).toBe(null);
        expect(run.warlord).toBe(null);
      }
    }
  });

  it('pickRoad(run, "event") opens the day\'s event; a second pick the same day is refused and changes nothing', () => {
    for (const seed of SEEDS) {
      for (const day of DAYS) {
        const run = atDay(seed, day);
        leaveCaravan(run);
        expect(pickRoad(run, "event")).toEqual({ ok: true });
        expect(run.stage).toBe("event");
        expect(run.road).toEqual({ day, pick: "event" });
        expect(run.event!.day).toBe(day);
        expect(run.event!.id).toBe(forkFor(run).event);
        expect(run.event!.picked).toBe(-1);
        expect(run.warlord).toBe(null);
        const before = clone(run);
        for (const p of ROAD_PICKS) {
          expect(pickRoad(run, p).ok).toBe(false);
          expect(run).toEqual(before);
        }
        expect(leaveCaravan(run)).toBe("event"); // still open
      }
    }
  });

  it("picking a warlord stores exactly the offered captain with rivalBuild(id, day); a second pick is refused", () => {
    for (const seed of SEEDS) {
      for (const day of DAYS) {
        for (const tier of DIFFICULTIES) {
          const run = atDay(seed, day);
          const id = forkFor(run).warlords[tier];
          expect(pickRoad(run, tier)).toEqual({ ok: true });
          expect(run.stage).toBe("warlord");
          expect(run.road).toEqual({ day, pick: tier });
          const w = run.warlord!;
          expect(w.id).toBe(id);
          expect(w.tier).toBe(tier);
          expect(w.day).toBe(day);
          expect(w.build).toEqual(rivalBuild(id, day));
          expect(w.sabotaged).toBe(false);
          expect(w.bounty).toBe(0);
          expect(w.result).toBe(null);
          expect(run.event).toBe(null); // the event stays closed
          const before = clone(run);
          for (const p of ROAD_PICKS) {
            expect(pickRoad(run, p)).toEqual({ ok: false, reason: "THE ROAD IS CHOSEN" });
            expect(run).toEqual(before);
          }
          expect(leaveCaravan(run)).toBe("warlord");
        }
      }
    }
  });

  it("the fork opens again at the next dawn", () => {
    const run = atDay(SEEDS[0], 3);
    pickRoad(run, "hard");
    run.day = 4; // what finishDay does at the next dawn (it also clears road and warlord)
    expect(roadChosen(run)).toBe(false);
    expect(leaveCaravan(run)).toBe("fork");
    expect(pickRoad(run, "easy").ok).toBe(true);
    expect(run.warlord!.id).toBe(warlordOffer(SEEDS[0], 4).easy);
  });
});
