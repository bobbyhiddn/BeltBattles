// HULL-1d (REQ-BFG-073; BRIEF-HULL1D 2 (e)2 step 2; cap's ruling 4ddf5fc9ce4faf8f): LAST CHANCE's PART card at ★2 behind
// HULL_SCALE. lastChance.ts lastChancePartStars() is the one reader (the offer's partStars, run.ts takeLastChance's cargo
// copy, validate.ts's free value, the bots' placement, the picker's words); with the switch off every one reads ★1, as
// 0.9.7. The offer stays deck-independent: the same seed, day and hero give the same part, switch on or off (no draw added).
// Each switch through its own setter, put back after each test.
import { afterEach, describe, expect, it } from "vitest";
import type { SideStats } from "../src/sim/battle";
import { ITEMS, type HeroId } from "../src/sim/content";
import { LAST_CHANCE_PART_STARS, lastChanceOffer, lastChancePartStars } from "../src/sim/lastChance";
import { setHullScale } from "../src/sim/hullScale";
import { valueOf } from "../src/sim/stars";
import { finishDay } from "../src/game/day";
import { newRun, pendingLastChance, pendingRune, takeLastChance, takeRune, type Run } from "../src/game/run";
import { lcPartSub, lcToast } from "../src/screens/lastChancePicker";

afterEach(() => setHullScale(true)); // the shipped value (AZ-BUMP's flip; was false): a test that reads the switch off sets it off itself

const Z: SideStats = { shots: 0, damage: 0, firstShot: 0, idle: 0, turretTime: 0, maxQueue: 0, jams: 0, disrupted: 0, windTaken: 0, burnDealt: 0, payloadSum: 0, produced: 0, stalled: 0 };

/** Five lost dusks (lc1.rule's play("LLLLL")): LAST CHANCE fires at the dusk of day 5 and its pick is pending. */
function fired(hero: HeroId, seed: number): Run {
  const run = newRun(hero, seed, `hull1d-${hero}-${seed}`);
  for (let i = 0; i < 5; i++) {
    const o = pendingRune(run);
    if (o) expect(takeRune(run, o.ids[0]).ok).toBe(true);
    finishDay(run, 1, 20, { ...Z }, { ...Z });
  }
  return run;
}

const copies = (run: Run, def: string): number[] => [...run.inventory, ...run.build.items, ...run.build.mods, ...(run.build.turrets ?? [])].filter((p) => p.def === def).map((p) => p.stars ?? 1).sort();

describe("HULL-1d: LAST CHANCE's PART card at ★2 (HULL_SCALE on only)", () => {
  it("the star: 1 with the switch off, LAST_CHANCE_PART_STARS (2) on; the offer names the same part either way, partStars only on", () => {
    setHullScale(false); // AZ-BUMP (the flip, HULL_SCALE): the switch-off star first (it ships on; the afterEach puts it back)
    expect(LAST_CHANCE_PART_STARS).toBe(2);
    expect(lastChancePartStars()).toBe(1);
    for (const hero of ["furnace", "weaver", "foundry", "bastion"] as HeroId[]) {
      for (let seed = 1; seed <= 20; seed++) {
        setHullScale(false);
        const off = lastChanceOffer(seed, 6, hero, []);
        expect("partStars" in off).toBe(false);
        setHullScale(true);
        expect(lastChancePartStars()).toBe(2);
        const on = lastChanceOffer(seed, 6, hero, []);
        expect(on).toEqual({ ...off, partStars: 2 });
      }
    }
  });

  it("takeLastChance's PART: off, the copy goes to cargo at ★1 (as 0.9.7); on, at ★2; the free value is valueOf at that star", () => {
    for (const [hero, seed] of [["foundry", 5], ["weaver", 12], ["bastion", 3], ["furnace", 8]] as [HeroId, number][]) {
      for (const on of [false, true]) {
        setHullScale(on);
        const run = fired(hero, seed);
        const offer = pendingLastChance(run)!;
        const def = offer.part!;
        const before = copies(run, def);
        expect(takeLastChance(run, "part").ok).toBe(true);
        const after = copies(run, def);
        // one copy more at the card's star, or (a twin of that star held) a merge one star up
        const star = on ? 2 : 1;
        if (after.length === before.length + 1) expect(after.filter((s) => s === star).length).toBe(before.filter((s) => s === star).length + 1);
        else expect(after.length).toBe(before.length);
        expect(run.lastChance).toEqual({ day: 5, boon: "part", id: def });
        expect(valueOf(def, lastChancePartStars())).toBe(ITEMS[def].price * (on ? 2 : 1));
      }
    }
  });

  it("the picker's words: off as before; on, the card's star in its sub-line and toast", () => {
    setHullScale(false); // AZ-BUMP (the flip, HULL_SCALE): the switch-off offer first (it ships on; the afterEach puts it back)
    expect(lcPartSub("epic")).toBe("EPIC PART · TO CARGO · FREE");
    expect(lcPartSub("epic", 1)).toBe("EPIC PART · TO CARGO · FREE");
    expect(lcPartSub("epic", 2)).toBe("EPIC PART ★2 · TO CARGO · FREE");
    const off = lastChanceOffer(7, 6, "furnace", []);
    expect(lcToast("part", off)).toBe(`TO CARGO: ${ITEMS[off.part!].name}`);
    setHullScale(true);
    const on = lastChanceOffer(7, 6, "furnace", []);
    expect(lcToast("part", on)).toBe(`TO CARGO: ${ITEMS[on.part!].name} ★2`);
  });
});
