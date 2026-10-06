// 0.6.2 TUNE-M T1 (ref/BRIEF-final-062-tune.md; the Prime's final T1 decision, oracles 761dce816a8934a3 and
// b0284aa9721c00db): LONG HAUL was DOMINANT by CTRL (par field, sample 48: FULL - CTRL +28.2 over its holders, FURNACE d7
// whole CI above +10). Its damage per earlier hit is halved at every star, band-keeping: +1 / +2 / +3.5 (was +2 / +4 / +7;
// ★2/★1 = 2.0 and ★3/★1 = 3.5 as before, inside tests/arsenal.modules.test.ts's band). Price (5 g), rarity, shape (II)
// and the ★2/★3 cap (6 earlier hits) are unchanged. After: +16.0, no DOMINANT day.
// Y7b2 (the flip; release Y, DESIGN-Y row 24): priorCap is gone (★2/★3 counted at most 6 earlier hits); +10/+20/+35 for
// each rig hit before it, as before. The cap's data and words are re-pinned without it (switch-off only).
import { describe, expect, it } from "vitest";
import { ITEMS, rigShape } from "../src/sim/content";
import { walkRoute, type Build } from "../src/sim/deck";
import { overclocked } from "../src/sim/overclock";
import { effectAt } from "../src/sim/stars";
import { abilityText, cardText, gist, hitText, nextStarText } from "../src/ui/abilityText"; // 0.6.2rel3: REQ-BFG-032's glossary
import { wrap } from "../src/render/font";
import { bench, est, run } from "./arsenal.bench";

const STARS = [1, 2, 3];
// NUM-1 (REQ-BFG-047): the damage family x10: +10 / +20 / +35 per earlier hit, half of the old +20 / +40 / +70 (was
// PER_HIT 1/2/3.5, WAS 2/4/7); the ratios (the band) and the cap of 6 hits (a count) are unchanged
const PER_HIT = [10, 20, 35], WAS = [20, 40, 70];

/** The bench with a ★1 WHETSTONE on tile 1 (one earlier hit) and a LONG HAUL at `stars` on tile 3. */
const haul = (stars: number): Build => bench([["whetstone", 4, 4, 1], ["longhaul", 4, 2, stars]]);

describe("TUNE LONGHAUL: +1 / +2 / +3.5 damage per earlier hit (was +2 / +4 / +7)", () => {
  // Y7b2 (the flip): was "the rule at 1/2/3 stars; price, rarity, shape and the ★2/★3 cap of 6 hits unchanged; the band kept"
  it("the rule at 1/2/3 stars; price, rarity and shape unchanged, no cap; the band kept", () => {
    expect(STARS.map((s) => effectAt("longhaul", s).gate)).toEqual([ // NUM-1: x10 (was 1 / 2 / 3.5)
      // Y7b2 (the flip): no priorCap (was priorCap: 6 at ★2 and ★3)
      { perPriorGate: 10 }, { perPriorGate: 20 }, { perPriorGate: 35 },
    ]);
    expect([ITEMS.longhaul.price, ITEMS.longhaul.rarity, rigShape("longhaul")]).toEqual([5, "rare", "II"]);
    // band-keeping (REQ-BFG-019): every star halved, so ★2/★1 and ★3/★1 stay 2.0 and 3.5
    expect(STARS.map((s, i) => effectAt("longhaul", s).gate!.perPriorGate! / PER_HIT[0] - WAS[i] / WAS[0])).toEqual([0, 0, 0]);
  });

  it("each earlier hit adds exactly that star's value, half of the old one, in the estimate and in the battle", () => {
    const base = est(bench([["whetstone", 4, 4, 1]])).dmg;
    for (const [i, s] of STARS.entries()) {
      expect(PER_HIT[i], `★${s}`).toBe(WAS[i] / 2);
      expect(est(haul(s)).dmg - base, `★${s} estimate`).toBe(PER_HIT[i]); // NUM-1: whole (the walk rounds once, half up), so exact (was toBeCloseTo(.., 9))
      // every payload past the LONG HAUL's tile carries the ★1 WHETSTONE's +20 (NUM-1: x10, was +2) and one earlier hit's worth
      const past = run(haul(s), 8).sides[0].routes[0].ammo.filter((a) => a.processed >= 2);
      expect(past.length, `★${s}`).toBeGreaterThan(0);
      expect([...new Set(past.map((a) => a.p.flat))], `★${s} battle`).toEqual([effectAt("whetstone", 1).gate!.flat! + PER_HIT[i]]);
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

  it("player text: the description, each star's ability text, gist and next star, and the belt timeline state the new numbers", () => {
    // NUM-4 (REQ-BFG-047): the desc still names the per-hit damage, in words; its +1 left it because it was the x1 scale
    // (★1 is PER_HIT[0], 10, stated by the ability text below) (was ["+1 DAMAGE FOR EACH", "HIT THE PAYLOAD", "ALREADY TOOK."])
    expect(ITEMS.longhaul.desc).toEqual(["MORE DAMAGE FOR EACH", "HIT THE PAYLOAD", "ALREADY TOOK."]);
    // 0.6.2rel3: REQ-BFG-032's glossary (src/ui/abilityText.ts) replaced the star flavour and the level shorthand (and the star flavour's ★3 re-flow: the glossary wraps whole words)
    // NUM-1: the damage numbers x10 (was 1 / 2 / 3.5); the 6 hits are a count, unchanged
    // Y7b2 (the flip): no cap, so no ", UP TO 6 HITS" at ★2 / ★3 in the sentences, gists and NEXT STAR lines
    expect(STARS.map((s) => abilityText("longhaul", s).sentences[0])).toEqual([
      "ADDS 10 DAMAGE FOR EACH EARLIER RIG HIT.", "ADDS 20 DAMAGE FOR EACH EARLIER RIG HIT.", "ADDS 35 DAMAGE FOR EACH EARLIER RIG HIT.",
    ]);
    expect(STARS.map((s) => gist("longhaul", s))).toEqual(["10 DAMAGE FOR EACH EARLIER HIT", "20 DAMAGE FOR EACH EARLIER HIT", "35 DAMAGE FOR EACH EARLIER HIT"]);
    expect([nextStarText("longhaul", 1), nextStarText("longhaul", 2)]).toEqual(["NEXT STAR: 20 DAMAGE FOR EACH EARLIER HIT.", "NEXT STAR: 35 DAMAGE FOR EACH EARLIER HIT."]);
    for (const s of STARS) expect(wrap(gist("longhaul", s), 151, "3").length, `★${s} on a phone`).toBeLessThanOrEqual(2);
    const hit = (s: number) => walkRoute(haul(s), 0).timeline.flatMap((row) => row.hits).find((h) => h.def === "longhaul")!;
    expect(STARS.map((s) => hitText(hit(s), "free"))).toEqual(["LONG HAUL +10 DAMAGE (1 HIT BEFORE)", "LONG HAUL +20 DAMAGE (1 HIT BEFORE)", "LONG HAUL +35 DAMAGE (1 HIT BEFORE)"]);
  });
});
