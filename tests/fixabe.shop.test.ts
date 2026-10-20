// FIX-ABE A/B (REQ-BFG-069; cap's ruling 207816b18a9fbfdb): a locked ware never holds a merchant's ware slot. With the
// sustain switch on and SIFTER dormant, a sustain piece (held to SUSTAIN_FIRST_DAY) drawn into a merchant's slot left that
// merchant's day 1-2 pool one short: seed 187's day-1 caravan (reroll 2) had 4 offers (SCRAPPER + ALCHEMIST, MENDING LOOM in
// an ALCHEMIST slot), and seed 17's TINKER (WARD BELL in a slot) echoed the owned GREASE on day 1. The slot now goes to the
// tier's next ware open with it (wares.ts drawWares), and the held piece still joins on its own day.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newRun, reroll, rollShop } from "../src/game/run";
import { ITEMS, OFFERS, SUSTAIN_FIRST_DAY, SUSTAIN_IDS, itemsSoldBy, sustainLive, type MerchantId } from "../src/sim/content";
import { DRAW, drawWares, heldPast, seatDay, unlockDay, unlocked } from "../src/game/wares";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { withShapes } from "../src/sim/shapes"; // SHAPES-1 flip: A's and B's release-X seeds with shapes off
import { withPlainRigs } from "../src/sim/plainRigs"; // BUMP-1D: ... and the plain rigs off
import { withShapes2 } from "../src/sim/shapes2"; // BUMP-1D: ... and the six more shaped rigs off
import { SCALE_RIGS, withScaleRigs } from "../src/sim/scale"; // BUMP-1E: ... and the scaling rules off (the seven new rigs, the five reworks), the outermost switch
import { GATES, setGates } from "../src/sim/gates"; // BUMP-1F (GATES default): this file's world is the one before the three converters
// BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), cause: GATES default): was no hook; this file's fixtures and pins are the world before the three converters, so every test runs with GATES off, as its pins were measured, and the afterEach puts the shipped value back (even if the test throws)
beforeEach(() => { setGates(false); });
afterEach(() => { setGates(GATES); });

/** BUMP-1D: release X's catalogue (88 modules) for a call: the three shaped rigs (SHAPES), the six plain rigs (PLAIN_RIGS) and the six
 *  more shaped rigs (SHAPES2) all off, `on` true: all on, the shipped world (was withShapes(fn, on)). The nesting puts the switches
 *  back in ITEMS order (the plain rigs, the three, the six more: each swap back appends), which the draws read.
 *  BUMP-1E: and the scaling rules off with them (the seven new rigs and the five reworks are no part of release X's catalogue: with them on the
 *  merchants' day-1 pools are larger), the scaling switch the OUTERMOST call: off first, back last, so the seven ids come back as the last keys
 *  of ITEMS after the twelve (ITEMS' key order is part of every seeded draw). `on` true: the shipped world, every switch on (a no-op). */
const world = <T>(fn: () => T, on: boolean): T => withScaleRigs(() => withShapes2(() => withShapes(() => withPlainRigs(fn, on), on), on), on);
const offersOf = (run: ReturnType<typeof newRun>): string[] => run.shop.wagons.flatMap((w) => w.offers.map((o) => o.def));
const poolOn = (run: ReturnType<typeof newRun>, m: MerchantId, day: number): string[] => itemsSoldBy(m).filter((d) => unlocked(run, d.id, day)).map((d) => d.id);

describe("FIX-ABE A/B: a locked ware never holds a merchant's ware slot", () => {
  it("release X's state: the switch on, the sustain pieces held past their slots' day, nothing else", () => {
    expect(sustainLive()).toBe(true);
    for (const id of SUSTAIN_IDS) {
      expect(heldPast(id), id).toBe(true);
      expect(unlockDay(id, undefined), id).toBe(Math.max(seatDay(id), SUSTAIN_FIRST_DAY));
    }
    for (const id of Object.keys(ITEMS)) if (ITEMS[id].merchant && !SUSTAIN_IDS.includes(id)) expect(heldPast(id), id).toBe(false);
  });

  // SHAPES-1 flip: seeds 187 and 17 x 65537 are release X's FIX-ABE A and B cases, which exist only in the catalogue without
  // the three shaped rigs, so each runs with shapes off (withShapes(fn, false)). With shapes on the per-run draw is drawn
  // from 91 modules (ALCHEMIST +2 commons, TINKER +1 rare) and neither seed is at the edge any more: seed 187's ALCHEMIST
  // opens 5 wares on day 1 and seed 17 x 65537's TINKER 6, and the same draw without its stand-ins (wares.ts drawWares'
  // FIX-ABE loop left out) still offers 5 and never the GREASE. Each case is then checked at a shipped-world seed that is at
  // the edge (without its stand-in the caravan is one short, or the TINKER echoes the GREASE); with shapes on no seed of
  // 1-6000 (days 1-2, rerolls 0-3) has a caravan one short without its stand-ins but for 1268 on day 1 at reroll 1, where
  // it is WARD BELL's TINKER slot, not MENDING LOOM's ALCHEMIST one: A's twin below
  // BUMP-1D: release X's catalogue has neither the six plain rigs nor the six more shaped ones, so the release-X seeds run with all
  // three switches off (world(fn, false)); the shipped world's twins are checked after, as SHAPES-1's flip did
  it("A: seed 187, day 1, reroll 2 offers 5 (ALCHEMIST's day-1 pool holds 3: MENDING LOOM's slot has a stand-in)", () => {
    world(() => {
      for (const hero of PLAYABLE_HEROES) {
        const run = newRun(hero, 187);
        run.day = 1;
        run.gold = 999;
        rollShop(run);
        expect(reroll(run)).toBe(true);
        expect(reroll(run)).toBe(true);
        expect(offersOf(run), hero).toHaveLength(OFFERS);
        expect(run.wares!.mendingloom, hero).toBe(SUSTAIN_FIRST_DAY); // MENDING LOOM is still the run's, from day 3
        expect(poolOn(run, "alchemist", 1).length, hero).toBe(3);
        expect(poolOn(run, "alchemist", 1), hero).not.toContain("mendingloom");
      }
    }, false);
    // SHAPES-1 flip: the shipped world's twin: seed 1268, day 1, reroll 1 offers 5 (TINKER's day-1 pool holds 3: WARD
    // BELL's slot has a stand-in; without it, 4 offers)
    // BUMP-1D: the shipped catalogue has 103 modules now (the six plain stat rigs and the six more shaped rigs, PLAIN_RIGS and
    // SHAPES2 on, and SHAPES2's offer lever), so seed 1268 is no edge any more; the twin is seed 203 (the first of a scan of seeds
    // 1-6000 for a run whose WARD BELL is a day-3 ware and whose day-1 caravan, with a TINKER wagon, offers 5 from a TINKER pool
    // of 3), day 1, no reroll: WARD BELL's slot has a stand-in
    // BUMP-1E: the shipped catalogue has the seven scaling rigs now (SCALE_RIGS on; CROWD PRESS and AEGIS SPIKE are TINKER's: 110 modules), so the
    // per-run draw is a different one and seed 203 is no edge any more (its runs hold no WARD BELL ware: wares.wardbell is undefined). The twin is
    // seed 147, the first of the same scan of seeds 1-6000 in the shipped world (every hero: a TINKER wagon on day 1, WARD BELL a day-3 ware, 5
    // offers from a TINKER pool of 3); the next are 2324 and 2414
    expect(SCALE_RIGS).toBe(true); // BUMP-1E: the shipped world has the scaling rules on (the release X half above runs them off)
    for (const hero of PLAYABLE_HEROES) {
      const run = newRun(hero, 147); // BUMP-1E: was 203
      run.day = 1;
      run.gold = 999;
      rollShop(run);
      expect(run.shop.wagons.some((w) => w.merchant === "tinker"), hero).toBe(true);
      expect(offersOf(run), hero).toHaveLength(OFFERS);
      expect(run.wares!.wardbell, hero).toBe(SUSTAIN_FIRST_DAY);
      expect(poolOn(run, "tinker", 1).length, hero).toBe(3);
      expect(poolOn(run, "tinker", 1), hero).not.toContain("wardbell");
    }
  });

  it("B: seed 17 (x 65537), day 1: TINKER never echoes the owned GREASE (WARD BELL's slot has a stand-in)", () => {
    // SHAPES-1 flip: seed 17 x 65537 with shapes off (why: above A), then the shipped world's twin, seed 3826 x 65537
    // BUMP-1D: the shipped world's twin is seed 14 x 65537 now (the first of a scan of seeds 1-6000 for a TINKER wagon on day 1,
    // WARD BELL a day-3 ware and a TINKER pool of 4 in the 103-module catalogue); 3826 is no edge there
    // BUMP-1E: with the seven scaling rigs in the shipped catalogue (110 modules) seed 14 is no edge either (TINKER's day-1 pool holds 7 there); the
    // twin is seed 43 x 65537, the first of the same scan of seeds 1-6000 in the shipped world (a TINKER wagon on day 1, WARD BELL a day-3 ware, a
    // TINKER pool of 4, no GREASE offered, 5 offers); the next are 67 and 422
    for (const [seed, on] of [[17, false], [43, true]] as const) world(() => { // BUMP-1E: was [14, true]
      const run = newRun("furnace", seed * 65537);
      run.inventory = [{ uid: 900, def: "grease" }];
      run.day = 1;
      rollShop(run);
      expect(offersOf(run), `${seed}`).not.toContain("grease");
      expect(offersOf(run), `${seed}`).toHaveLength(OFFERS);
      // WARD BELL is still the run's (a day-6 restock at 17; day 3 at 43, was 14 and 3826)
      expect(run.wares!.wardbell, `${seed}`).toBeGreaterThanOrEqual(SUSTAIN_FIRST_DAY);
      expect(poolOn(run, "tinker", 1).length, `${seed}`).toBe(4);
    }, on);
  });

  it("the stand-ins only add: each opens with its slot, never waits for a restock, and the restocks stay 12", () => {
    for (let s = 1; s <= 300; s++) {
      const w = drawWares(s);
      const held = Object.keys(w).filter((id) => heldPast(id));
      const late = Object.entries(w).filter(([id, u]) => u > unlockDay(id, undefined));
      expect(late.length, `seed ${s}`).toBe(DRAW.late);
      // at most one stand-in per held ware; a held ware never opens before its own day
      expect(Object.keys(w).length, `seed ${s}`).toBeGreaterThanOrEqual(DRAW.active);
      expect(Object.keys(w).length, `seed ${s}`).toBeLessThanOrEqual(DRAW.active + held.length);
      for (const id of held) expect(w[id], `seed ${s} ${id}`).toBeGreaterThanOrEqual(unlockDay(id, undefined));
    }
  });
});
