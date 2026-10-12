// FIX-ABE A/B (REQ-BFG-069; cap's ruling 207816b18a9fbfdb): a locked ware never holds a merchant's ware slot. With the
// sustain switch on and SIFTER dormant, a sustain piece (held to SUSTAIN_FIRST_DAY) drawn into a merchant's slot left that
// merchant's day 1-2 pool one short: seed 187's day-1 caravan (reroll 2) had 4 offers (SCRAPPER + ALCHEMIST, MENDING LOOM in
// an ALCHEMIST slot), and seed 17's TINKER (WARD BELL in a slot) echoed the owned GREASE on day 1. The slot now goes to the
// tier's next ware open with it (wares.ts drawWares), and the held piece still joins on its own day.
import { describe, expect, it } from "vitest";
import { newRun, reroll, rollShop } from "../src/game/run";
import { ITEMS, OFFERS, SUSTAIN_FIRST_DAY, SUSTAIN_IDS, itemsSoldBy, sustainLive, type MerchantId } from "../src/sim/content";
import { DRAW, drawWares, heldPast, seatDay, unlockDay, unlocked } from "../src/game/wares";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { withShapes } from "../src/sim/shapes"; // SHAPES-1 flip: A's and B's release-X seeds with shapes off

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
  it("A: seed 187, day 1, reroll 2 offers 5 (ALCHEMIST's day-1 pool holds 3: MENDING LOOM's slot has a stand-in)", () => {
    withShapes(() => {
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
    for (const hero of PLAYABLE_HEROES) {
      const run = newRun(hero, 1268);
      run.day = 1;
      run.gold = 999;
      rollShop(run);
      expect(reroll(run)).toBe(true);
      expect(offersOf(run), hero).toHaveLength(OFFERS);
      expect(run.wares!.wardbell, hero).toBe(SUSTAIN_FIRST_DAY);
      expect(poolOn(run, "tinker", 1).length, hero).toBe(3);
      expect(poolOn(run, "tinker", 1), hero).not.toContain("wardbell");
    }
  });

  it("B: seed 17 (x 65537), day 1: TINKER never echoes the owned GREASE (WARD BELL's slot has a stand-in)", () => {
    // SHAPES-1 flip: seed 17 x 65537 with shapes off (why: above A), then the shipped world's twin, seed 3826 x 65537
    for (const [seed, on] of [[17, false], [3826, true]] as const) withShapes(() => {
      const run = newRun("furnace", seed * 65537);
      run.inventory = [{ uid: 900, def: "grease" }];
      run.day = 1;
      rollShop(run);
      expect(offersOf(run), `${seed}`).not.toContain("grease");
      expect(offersOf(run), `${seed}`).toHaveLength(OFFERS);
      // WARD BELL is still the run's (a day-6 restock at 17; day 3 at 3826)
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
