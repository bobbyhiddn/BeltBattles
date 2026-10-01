// 0.6.2 TUNE-M T1 (ref/BRIEF-final-062-tune.md; the Prime's final T1 decision, oracles 761dce816a8934a3 and
// b0284aa9721c00db): LONG HAUL was DOMINANT by CTRL (par field, sample 48: FULL - CTRL +28.2 over its holders, FURNACE d7
// whole CI above +10). Its damage per earlier hit is halved at every star, band-keeping: +1 / +2 / +3.5 (was +2 / +4 / +7;
// ★2/★1 = 2.0 and ★3/★1 = 3.5 as before, inside tests/arsenal.modules.test.ts's band). Price (5 g), rarity, shape (II)
// and the ★2/★3 cap (6 earlier hits) are unchanged. After: +16.0, no DOMINANT day.
import { describe, expect, it } from "vitest";
import { ITEMS, rigShape } from "../src/sim/content";
import { walkRoute, type Build } from "../src/sim/deck";
import { overclocked } from "../src/sim/overclock";
import { effectAt } from "../src/sim/stars";
import { flavour } from "../src/screens/build/flavour";
import { hitLabel, levelLine, starEffectLine } from "../src/screens/build/inspector";
import { wrap } from "../src/render/font";
import { bench, est, run } from "./arsenal.bench";

const STARS = [1, 2, 3];
const PER_HIT = [1, 2, 3.5], WAS = [2, 4, 7];

/** The bench with a ★1 WHETSTONE on tile 1 (one earlier hit) and a LONG HAUL at `stars` on tile 3. */
const haul = (stars: number): Build => bench([["whetstone", 4, 4, 1], ["longhaul", 4, 2, stars]]);

describe("TUNE LONGHAUL: +1 / +2 / +3.5 damage per earlier hit (was +2 / +4 / +7)", () => {
  it("the rule at 1/2/3 stars; price, rarity, shape and the ★2/★3 cap of 6 hits unchanged; the band kept", () => {
    expect(STARS.map((s) => effectAt("longhaul", s).gate)).toEqual([
      { perPriorGate: 1 }, { perPriorGate: 2, priorCap: 6 }, { perPriorGate: 3.5, priorCap: 6 },
    ]);
    expect([ITEMS.longhaul.price, ITEMS.longhaul.rarity, rigShape("longhaul")]).toEqual([5, "rare", "II"]);
    // band-keeping (REQ-BFG-019): every star halved, so ★2/★1 and ★3/★1 stay 2.0 and 3.5
    expect(STARS.map((s, i) => effectAt("longhaul", s).gate!.perPriorGate! / PER_HIT[0] - WAS[i] / WAS[0])).toEqual([0, 0, 0]);
  });

  it("each earlier hit adds exactly that star's value, half of the old one, in the estimate and in the battle", () => {
    const base = est(bench([["whetstone", 4, 4, 1]])).dmg;
    for (const [i, s] of STARS.entries()) {
      expect(PER_HIT[i], `★${s}`).toBe(WAS[i] / 2);
      expect(est(haul(s)).dmg - base, `★${s} estimate`).toBeCloseTo(PER_HIT[i], 9);
      // every payload past the LONG HAUL's tile carries the WHETSTONE's +2 and one earlier hit's worth
      const past = run(haul(s), 8).sides[0].routes[0].ammo.filter((a) => a.processed >= 2);
      expect(past.length, `★${s}`).toBeGreaterThan(0);
      expect([...new Set(past.map((a) => a.p.flat))], `★${s} battle`).toEqual([2 + PER_HIT[i]]);
    }
  });

  it("every merge is still an upgrade: the estimate and the damage fired in 30 s rise from ★1 to ★2 to ★3", () => {
    const dmg = STARS.map((s) => est(haul(s)).dmg);
    expect(dmg[0]).toBeLessThan(dmg[1]);
    expect(dmg[1]).toBeLessThan(dmg[2]);
    const fired = STARS.map((s) => run(haul(s), 30).sides[0].stats.payloadSum);
    expect(fired[0]).toBeLessThan(fired[1]);
    expect(fired[1]).toBeLessThan(fired[2]);
  });

  it("an overclocked LONG HAUL doubles its per-hit value", () => {
    expect(overclocked({ perPriorGate: 1 })).toEqual({ perPriorGate: 2 });
  });

  it("player text: the description, each star's flavour and level line, and the belt timeline state the new numbers", () => {
    expect(ITEMS.longhaul.desc).toEqual(["+1 DAMAGE FOR EACH", "HIT THE PAYLOAD", "ALREADY TOOK."]);
    expect(STARS.map((s) => flavour("longhaul", s).join(" / "))).toEqual([
      "+1 DAMAGE FOR EACH / HIT THE PAYLOAD / ALREADY TOOK.",
      "+2 DAMAGE FOR EACH / EARLIER HIT, UP TO / 6 HITS.",
      "+3.5 DAMAGE PER / EARLIER HIT, UP TO / 6 HITS.", // the re-flow: "+3.5 DAMAGE FOR EACH" wraps on the narrowest panel
    ]);
    expect(STARS.map((s) => starEffectLine("longhaul", s))).toEqual(["+1/HIT", "+2/HIT · MAX 6 HITS", "+3.5/HIT · MAX 6 HITS"]);
    expect(levelLine("longhaul", 3)).toBe("★3: +3.5/HIT · MAX 6 HITS");
    for (const s of STARS) expect(wrap(starEffectLine("longhaul", s), 151, "3").length, `★${s} on a phone`).toBe(1);
    const hit = (s: number) => walkRoute(haul(s), 0).timeline.flatMap((row) => row.hits).find((h) => h.def === "longhaul")!;
    expect(STARS.map((s) => hitLabel(hit(s), false))).toEqual(["LONG HAUL +1 (1 HIT BEFORE)", "LONG HAUL +2 (1 HIT BEFORE)", "LONG HAUL +3.5 (1 HIT BEFORE)"]);
  });
});
