// 0.6.2 TUNE-M T2 (ref/BRIEF-final-062-tune.md; the Prime's decision, as QUENCH TANK's oracle 16085a6430e4cc6a):
// LODESTONE gets a floor. Every payload it hits gains +1/+2/+3 at ★1/★2/★3, below WHETSTONE's 2/4/7, and its per-stalled
// bonus (+1/+2.2/+3.5 per enemy machine disrupted, frozen or wrecked, max 6/13/21) comes on top. Was the per-stalled bonus
// alone: a deck with no stall source got nothing from it at any star (NO EFFECT on FB-A and RB; CAND-A ablation -5.4).
// Y7b2 (the flip; release Y, DESIGN-Y row 15): the floor and the cap are gone: +10/+22/+35 for each STUN on the foe, no
// max read (battle.ts applyHit). The floor's tests ("with no stalled machine it adds its floor ...", "★2 and ★3 each
// change battles of a deck with no stall source ...") and asserts are deleted (switch-off only); the per-stun pay stays.
import { describe, expect, it } from "vitest";
import { Battle, type BeltAmmo, type Payload } from "../src/sim/battle";
import { ITEMS } from "../src/sim/content";
import { walkRoute } from "../src/sim/deck";
import { overclocked } from "../src/sim/overclock";
import { flatOf } from "../src/sim/scale"; // BUMP-1E: a slug's whole flat bonus (the stat rows' flat plus the FOR EACH each)
import { effectAt } from "../src/sim/stars";
import { abilityText, cardText, gist, hitText, nextStarText } from "../src/ui/abilityText"; // 0.6.2rel3: REQ-BFG-032's glossary
import { wrap } from "../src/render/font";
import { barge, bench } from "./arsenal.bench";

const STARS = [1, 2, 3];
// NUM-1 (REQ-BFG-047): the damage family x10 (was FLOOR 1/2/3, EACH 1/2.2/3.5, MAX 6/13/21, WHET 2/4/7); every one whole
// Y7b2 (the flip): FLOOR (10/20/30) and WHET (WHETSTONE's 20/40/70, the floor's yardstick) are gone with the floor; MAX
// stays in the data, unread by the battle
const EACH = [10, 22, 35], MAX = [60, 130, 210];

const payload = (flat = 0): Payload => ({ id: 91, ammo: "plain", ride: 0, mult: 1, flat, burn: 0, shock: false, prior: 0, factory: 1, copy: false });

/** One arrow of a LODESTONE at `stars` (the bench's tile 2) applied to a copy of `p`, with `stalled` of the barge's
 *  machines (the Loom and its three turrets) stalled, exactly as the battle applies it. */
function lodestoned(stars: number, stalled: number, p = payload()): Payload {
  const bt = new Battle(bench([["lodestone", 4, 3, stars]]), barge(), 7);
  const s = bt.sides[0], foe = bt.sides[1];
  s.gates[0].online = true;
  const machines = [...foe.factories, ...foe.turrets];
  expect(machines.length).toBeGreaterThanOrEqual(stalled);
  machines.slice(0, stalled).forEach((m, i) => { if (i % 2) m.frozen = 2; else m.disrupted = 2; });
  const a: BeltAmmo = { p: { ...p }, s: 30, processed: 2, blocked: false };
  (bt as unknown as { applyHit: (s: unknown, a: BeltAmmo, h: unknown) => BeltAmmo[] }).applyHit(s, a, s.routes[0].gateAt[2][0]);
  return a.p;
}

describe("TUNE-M T2: LODESTONE's floor", () => {
  // Y7b2 (the flip): was "the rule at 1/2/3 stars: +1/+2/+3 flat, and the per-stalled bonus as before"
  it("the rule at 1/2/3 stars: the per-stalled bonus as before, no floor", () => {
    // Y7b2 (the flip): no flat (was { flat: FLOOR[i], perStalled: ... }); the data keeps max, which the battle doesn't read
    expect(STARS.map((s) => effectAt("lodestone", s).gate)).toEqual(STARS.map((s, i) => ({ perStalled: { each: EACH[i], max: MAX[i] } })));
    expect(ITEMS.lodestone.price).toBe(5);
    expect(ITEMS.lodestone.rarity).toBe("rare");
  });

  // Y7b2 (the flip): "with no stalled machine it adds its floor, less per arrow than WHETSTONE at the same star (estimate
  // and battle)" is deleted: no floor (switch-off only; measured: a payload gains 0 with no machine stalled)

  // Y7b2 (the flip): was "with stalled machines it adds the floor plus the per-stalled bonus, up to its max"
  it("with stalled machines it adds the per-stalled bonus for each, no floor, no cap", () => {
    // BUMP-1E: the scaling rules ship on (SCALE_RIGS, bb-0.12.0), where a FOR EACH add (LODESTONE's EACH a STUN) rides the slug's own
    // `each` accumulator (battle.ts forEach, REQ-BFG-110 step 4) and p.flat stays the stat rows' alone (0, or the 50 the payload
    // carried in), so what the hit adds is read through flatOf(p), the sum the shot reads: the same numbers; was `.flat`
    for (const [i, s] of STARS.entries()) {
      // NUM-1: every amount is whole now, so each is exact (was toBeCloseTo(.., 9))
      // Y7b2 (the flip): no FLOOR[i] in any of these, and no Math.min(MAX[i], ...) (no cap; 4 stalls stay under it anyway)
      expect(flatOf(lodestoned(s, 1)), `★${s}, 1 stalled`).toBe(EACH[i]); // BUMP-1E: was lodestoned(s, 1).flat
      for (const n of [2, 3, 4]) expect(flatOf(lodestoned(s, n)), `★${s}, ${n} stalled`).toBe(n * EACH[i]); // BUMP-1E: was lodestoned(s, n).flat
      // on top of what the payload already carries (NUM-1: x10, was 5)
      expect(flatOf(lodestoned(s, 1, payload(50)))).toBe(50 + EACH[i]); // BUMP-1E: was lodestoned(s, 1, payload(50)).flat
    }
  });

  // Y7b2 (the flip): "★2 and ★3 each change battles of a deck with no stall source (★1 -> ★2 -> ★3, day-2 and day-3
  // foes)" is deleted: with no stall source LODESTONE adds nothing at any star now (it was the floor's; switch-off only)

  it("an overclocked LODESTONE doubles its floor and its per-stalled pay", () => {
    expect(overclocked({ flat: 1, perStalled: { each: 1, max: 6 } })).toEqual({ flat: 2, perStalled: { each: 2, max: 6 } });
  });

  // Y7b2 (the flip): was "... the shop card and the belt's timeline state the floor" (no floor; the desc is the data's as
  // it stands)
  it("player text: the description, each star's ability text and gist, the shop card and the belt's timeline state the per-stun damage", () => {
    // NUM-4 (REQ-BFG-047): the desc still states the floor and the per-stun damage, in words; its +1 / +1 left it because
    // they were the x1 scale (★1 is FLOOR[0] / EACH[0], stated by the ability text below); STALLED reads STUNNED (NUM-3
    // F2) (was ["+1 DAMAGE ALWAYS,", "+1 PER ENEMY", "MACHINE STALLED."])
    expect(ITEMS.lodestone.desc).toEqual(["MORE DAMAGE ALWAYS,", "MORE FOR EACH ENEMY", "MACHINE STUNNED."]);
    // 0.6.2rel3: REQ-BFG-032's glossary (src/ui/abilityText.ts) replaced the star flavour and the level shorthand; the floor leads the opening sentence
    // NUM-1: the numbers x10 (was 1, 1, 6 / 2, 2.2, 13 / 3, 3.5, 21)
    // NUM-4 (REQ-BFG-047, NUM-3 F2): STALL -> STUN in the sentences, gists, next star, card and hit text (was STALLED /
    // STALL); the numbers are FLOOR / EACH / MAX, unchanged
    // Y7b2 (the flip): no floor and no cap in the words (were "ADDS <FLOOR> DAMAGE, AND <EACH> FOR EACH ENEMY MACHINE
    // STUNNED, UP TO <MAX> DAMAGE.", gist "ADDS <FLOOR> DAMAGE, AND <EACH> FOR EACH STUNNED MACHINE", NEXT STAR the same
    // and the card "<FLOOR> DAMAGE, MORE FOR EACH STUN.")
    expect(STARS.map((s) => abilityText("lodestone", s).sentences[0])).toEqual(STARS.map((s) =>
      `ADDS ${EACH[s - 1]} DAMAGE FOR EACH ENEMY MACHINE STUNNED, BELT TILES TOO.`));
    expect(STARS.map((s) => gist("lodestone", s))).toEqual(STARS.map((s) => `ADDS ${EACH[s - 1]} DAMAGE FOR EACH STUN ON THE FOE`));
    expect([nextStarText("lodestone", 1), cardText("lodestone")]).toEqual([`NEXT STAR: ADDS ${EACH[1]} DAMAGE FOR EACH STUN ON THE FOE.`, `${EACH[0]} DAMAGE FOR EACH STUN.`]);
    for (const s of STARS) expect(wrap(gist("lodestone", s), 151, "3").length, `★${s} on a phone`).toBeLessThanOrEqual(2);
    const hit = walkRoute(bench([["lodestone", 4, 3, 2]]), 0).timeline.flatMap((row) => row.hits).find((h) => h.def === "lodestone")!;
    // Y7b2 (the flip): the timeline hit's flat (the ★2 floor, 20) is deleted: no floor, so the walk adds none (switch-off
    // only)
    // NUM-1: x10 (was +2, +2.2, 13); NUM-4 (NUM-3 F2): STUNNED (was STALLED)
    // Y7b2 (the flip): was "LODESTONE +<FLOOR> DAMAGE, +<EACH> DAMAGE FOR EACH STUNNED MACHINE, UP TO <MAX> DAMAGE"
    expect(hitText(hit, "free")).toBe(`LODESTONE +${EACH[1]} DAMAGE FOR EACH STUNNED MACHINE`);
  });
});
