import { describe, expect, it } from "vitest";
import { HEROES, ITEMS, RUN_DAYS } from "../src/sim/content";
import { startingTurrets, turretsCost, type Build, type BuildTurret } from "../src/sim/deck";
import { playerFits } from "../src/net/roadCap";
import { buildCost, maxHonestSpend, validateBuild, validateUpload } from "../src/net/validate";
import { furnaceDeck } from "./netHelpers";

// v070-validate-062m (M5, brief 0c): the player mode on the 0.6.2 mechanics head 7bcde98 (turret slots REQ-BFG-031,
// belt joins REQ-BFG-027, the REQ-BFG-033 offer mix). Recheck 1: the player mode costs turrets exactly as the strict
// mode's buildCost does: bought copies at their value, a free starting copy at 0 (turretValue), only installed ones.

const FREE = startingTurrets("furnace"); // slot 0: the free SCRAP CANNON; slot 1 (columns 9-10) is the empty extra slot

/** The FURNACE starting deck with this turret list, plates and crates (its belt feeds slot 0's intake). */
function turreted(turrets: BuildTurret[], plates = 0, crates = 0): Build {
  return { ...furnaceDeck({ hullBonus: 25 * plates, beltCap: HEROES.furnace.belt + 4 * crates }), turrets };
}

/** Turret layouts and what the strict mode's buildCost says they cost. */
const LAYOUTS: [string, BuildTurret[], number][] = [
  ["the starting layout, written out (free copy: 0)", [...FREE], 0],
  ["an epic HAIL GUN bought into the extra slot", [...FREE, { slot: 1, def: "hailgun", uid: 60 }], ITEMS.hailgun.price],
  ["the free SCRAP CANNON merged with a bought copy (2 stars, free)", [{ ...FREE[0], stars: 2 }], ITEMS.scrapcannon.price],
  ["the free copy at 3 stars (three bought copies inside)", [{ ...FREE[0], stars: 3 }], 3 * ITEMS.scrapcannon.price],
  ["the free copy swapped out for a bought 2-star TWIN NEEDLE; THUNDERER in the extra slot",
    [{ slot: 0, def: "twinneedle", uid: 61, stars: 2 }, { slot: 1, def: "thunderer", uid: 62 }], 2 * ITEMS.twinneedle.price + ITEMS.thunderer.price],
];

describe("062m recheck 1: turrets in the player budget", () => {
  it("buildCost counts installed turrets with the S7 values (the strict mode's cost)", () => {
    for (const [what, list, value] of LAYOUTS) {
      const b = turreted(list);
      expect(turretsCost(b), what).toBe(value);
      expect(buildCost(b).total - buildCost(furnaceDeck()).total, what).toBe(value);
    }
  });

  it("the player mode costs every turret layout exactly as buildCost does, on every day", () => {
    for (const [what, list] of LAYOUTS) {
      for (let plates = 0; plates <= 12; plates += 3) {
        const b = turreted(list, plates, 1);
        const cost = buildCost(b);
        for (let d = 1; d <= RUN_DAYS; d++) {
          const plain = playerFits(b, d, cost).fits.find((f) => f.mix.key === "")!;
          expect(plain.cost, `${what}, ${plates} plates, day ${d}`).toBe(cost.total);
          expect(validateUpload(b, d).ok, `${what}, ${plates} plates, day ${d}`).toBe(cost.total <= maxHonestSpend(d));
        }
      }
    }
  });

  it("a deck one gold over the player ceiling because of its turrets is refused on budget, naming the turrets", () => {
    // day 1 allows 15: HAIL GUN (10) + a plate (5) passes; with a crate (2) more it is over
    const at = turreted([...FREE, { slot: 1, def: "hailgun", uid: 60 }], 1, 0);
    expect(buildCost(at).total).toBe(maxHonestSpend(1));
    expect(validateUpload(at, 1)).toEqual({ ok: true, errors: [] });
    const one = turreted([...FREE, { slot: 1, def: "hailgun", uid: 60 }], 0, 3); // 10 + 3 crates: 16, one gold over
    const over = turreted([{ slot: 0, def: "twinneedle", uid: 61 }, { slot: 1, def: "thunderer", uid: 62 }], 0, 1); // 8 + 13 + 2
    for (const [b, turrets, crates] of [[one, 10, 3], [over, 21, 1]] as const) {
      expect(buildCost(b).total).toBe(turrets + 2 * crates);
      const e = validateUpload(b, 1).errors;
      expect(e).toHaveLength(1);
      expect(e[0]).toBe(`budget: build costs ${turrets + 2 * crates} gold (items 0, mods 0, ${crates} crates, 0 plating, turrets ${turrets}) but a player's day 1 allows at most 15 (maxGoldByDay 8 + roadCap 7)`);
      expect(validateBuild(b, 1).errors.some((x) => x.startsWith("budget:"))).toBe(true);
    }
  });
});
