// 0.6.2 TUNE-M T3b (ref/BRIEF-final-062-tune.md): HOPPER lost points wherever the par player put it (flag 3: -2 to -9;
// its control -12 to -32 on days 5/7, CIs below 0), and the par player kept buying it. The cause was a rating bug
// (deckRating.ts rateDeck): HOPPER's window and window time are modeled (the loading window before a turret's first
// shot), yet it also took the NOMINAL credit meant for gear the model can't see: +12% / +24% / +48% of the turret's
// damage at 1/2/3 stars. The harness fix: no NOMINAL credit for window, window-time or store gear. No game change.
import { describe, expect, it } from "vitest";
import { NOMINAL, rateDeck } from "../src/sim/deckRating";
import { valueOf } from "../src/sim/stars";
import type { Build } from "../src/sim/deck";
import { bench } from "./arsenal.bench";

const withMod = (def: string, stars: number): Build => {
  const b = bench([["whetstone", 4, 3, 1]]);
  b.mods.push({ uid: 60, def, turret: 0, ...(stars > 1 ? { stars } : {}) });
  return b;
};

describe("TUNE-M T3b: the rating gives HOPPER no nominal credit", () => {
  it("adding HOPPER to a fed turret: ★1/★2 never raise its rating; ★3 only by its modeled noJam, never the old credit", () => {
    const bare = rateDeck(bench([["whetstone", 4, 3, 1]])).offense;
    expect(bare).toBeGreaterThan(0);
    for (const s of [1, 2]) expect(rateDeck(withMod("hopper", s)).offense, `HOPPER ★${s}`).toBeLessThanOrEqual(bare + 1e-9);
    // ★3 BOTTOMLESS never jams (firedShare reads noJam): a small modeled gain, far below the old +48% (0.03 x 16 g)
    const r3 = rateDeck(withMod("hopper", 3)).offense / bare;
    expect(r3, "HOPPER ★3").toBeLessThan(1 + (NOMINAL * valueOf("hopper", 3)) / 10);
  });

  it("gear the model can't see still takes its NOMINAL credit (FLAK, MANTLET)", () => {
    const bare = rateDeck(bench([["whetstone", 4, 3, 1]])).offense;
    for (const def of ["flak", "mantlet"]) for (const s of [1, 2]) {
      expect(rateDeck(withMod(def, s)).offense / bare, `${def} ★${s}`).toBeCloseTo(1 + NOMINAL * valueOf(def, s), 9);
    }
  });
});
