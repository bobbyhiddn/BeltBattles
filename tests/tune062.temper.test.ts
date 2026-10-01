// 0.6.2 TUNE-M T1 (ref/BRIEF-final-062-tune.md; the Prime's final T1 decision, oracles 761dce816a8934a3,
// e76aa32637c904ce and b0284aa9721c00db): TEMPER was DOMINANT by CTRL (par field, sample 48: FULL - CTRL +21.5 over its
// holders; FURNACE d5 and WEAVER d5/d7/d10 whole CI above +10). Its Burn is cut at every star, band-keeping: 1 / 2 / 4
// stacks (was 2 / 4 / 7; ★2/★1 = 2.0 and ★3/★1 = 4.0, inside tests/arsenal.modules.test.ts's band, ceiling 3.5 x 1.15).
// Price (3 g), rarity, shape (I) and Burn's own rule (1 dmg/s for 3 s a stack) are unchanged. After: +12.5; still
// DOMINANT on FURNACE (d5 +19.7, d7 +15.9): a residual for 0.6.3 (TUNE-REPORT.md).
import { describe, expect, it } from "vitest";
import { BURN_TIME, ITEMS, rigShape } from "../src/sim/content";
import { walkRoute, type Build } from "../src/sim/deck";
import { overclocked } from "../src/sim/overclock";
import { effectAt } from "../src/sim/stars";
import { flavour } from "../src/screens/build/flavour";
import { hitLabel, levelLine, starEffectLine } from "../src/screens/build/inspector";
import { wrap } from "../src/render/font";
import { bench, est, run } from "./arsenal.bench";

const STARS = [1, 2, 3];
const BURN = [1, 2, 4], WAS = [2, 4, 7];

/** The bench with a TEMPER at `stars` on tile 2. */
const tempered = (stars: number): Build => bench([["temper", 4, 3, stars]]);

describe("TUNE TEMPER: Burn 1 / 2 / 4 at 1 / 2 / 3 stars (was 2 / 4 / 7)", () => {
  it("the rule at 1/2/3 stars; price, rarity, shape and Burn's own rule unchanged; the band kept", () => {
    expect(STARS.map((s) => effectAt("temper", s).gate)).toEqual(BURN.map((burn) => ({ burn })));
    expect([ITEMS.temper.price, ITEMS.temper.rarity, rigShape("temper")]).toEqual([3, "common", "I"]);
    expect(BURN_TIME).toBe(3);
    // band-keeping (REQ-BFG-019): ★2/★1 = 2.0 and ★3/★1 = 4.0, within the band [2.0, 3.5] x [0.85, 1.15]
    const r = [BURN[1] / BURN[0], BURN[2] / BURN[0]];
    for (const x of r) expect(x).toBeGreaterThanOrEqual(2.0 * 0.85);
    for (const x of r) expect(x).toBeLessThanOrEqual(3.5 * 1.15);
    // every star is below its old value: the step weakens ★1, ★2 and ★3 together
    for (const [i] of STARS.entries()) expect(BURN[i]).toBeLessThan(WAS[i]);
  });

  it("each payload it hits gains exactly that star's Burn, in the estimate and in the battle", () => {
    for (const [i, s] of STARS.entries()) {
      expect(est(tempered(s)).burn, `★${s} estimate`).toBe(BURN[i]);
      const past = run(tempered(s), 8).sides[0].routes[0].ammo.filter((a) => a.processed >= 1);
      expect(past.length, `★${s}`).toBeGreaterThan(0);
      expect([...new Set(past.map((a) => a.p.burn))], `★${s} battle`).toEqual([BURN[i]]);
    }
  });

  it("every merge is still an upgrade: the Burn dealt and the damage in 30 s rise from ★1 to ★2 to ★3", () => {
    const fights = STARS.map((s) => run(tempered(s), 30).sides[0].stats);
    expect(fights[0].burnDealt).toBeGreaterThan(0);
    expect(fights[0].burnDealt).toBeLessThan(fights[1].burnDealt);
    expect(fights[1].burnDealt).toBeLessThan(fights[2].burnDealt);
    expect(fights[0].damage).toBeLessThan(fights[1].damage);
    expect(fights[1].damage).toBeLessThan(fights[2].damage);
  });

  it("an overclocked TEMPER doubles its Burn", () => {
    expect(overclocked({ burn: 1 })).toEqual({ burn: 2 });
  });

  it("player text: the description, each star's flavour and level line, and the belt timeline state the new Burn", () => {
    expect(ITEMS.temper.desc).toEqual(["ADDS 1 BURN.", "BURN: 1 DMG/S FOR 3S", "PER STACK ON HIT."]);
    expect(STARS.map((s) => flavour("temper", s)[0])).toEqual(["ADDS 1 BURN.", "ADDS 2 BURN.", "ADDS 4 BURN."]);
    expect(STARS.map((s) => starEffectLine("temper", s))).toEqual(["+1 BURN", "+2 BURN", "+4 BURN"]);
    expect([levelLine("temper", 2), levelLine("temper", 3)]).toEqual(["★2: +2 BURN", "★3: +4 BURN"]);
    for (const s of STARS) expect(wrap(starEffectLine("temper", s), 151, "3").length, `★${s} on a phone`).toBe(1);
    const hit = (s: number) => walkRoute(tempered(s), 0).timeline.flatMap((row) => row.hits).find((h) => h.def === "temper")!;
    expect(STARS.map((s) => hitLabel(hit(s), false))).toEqual(["TEMPER BURN +1", "TEMPER BURN +2", "TEMPER BURN +4"]);
  });
});
