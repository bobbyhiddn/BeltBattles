// Y7b2 step 2 (release Y; REQ-BFG-070, REQ-BFG-046; REVIEW-Y6 section 4; BRIEF-Y7B2 step 2): FOUNDRY's fuse SUMS burnPlus.
// Before, races/foundry.ts fuse kept the first blank's burnPlus (the blank waiting in the chamber) and dropped the second's,
// so belt B's VENOM DRIP counted only when belt A's blank fused second. Summing makes the order irrelevant and equals the
// one-belt rule (Battle.applyHit: `p.burnPlus = (p.burnPlus ?? 0) + e.burnPlus`, two VENOMs on one slug add up): every VENOM
// that hit the slug counts.
import { describe, expect, it } from "vitest";
import { fuse } from "../src/sim/races/foundry";
import type { Payload } from "../src/sim/battle";

const blank = (burnPlus?: number, burn = 0): Payload =>
  ({ id: 1, ammo: "blank", ride: 2, mult: 1, flat: 0, burn, shock: false, prior: 0, factory: 0, copy: false, ...(burnPlus === undefined ? {} : { burnPlus }) }) as Payload;

describe("Y7b2: FOUNDRY's fuse sums burnPlus (REVIEW-Y6 section 4)", () => {
  it("both blanks' VENOM seconds count, in either order (+3 and +6: +9), beside BURN's own sum", () => {
    for (const [x, y] of [[3, 6], [6, 3]]) {
      const a = blank(x, 1), b = blank(y, 2);
      fuse(a, b);
      expect([a.ammo, a.burnPlus, a.burn]).toEqual(["alloy", 9, 3]);
    }
  });

  it("one VENOM'd blank counts whichever blank fuses first (the second's was dropped before)", () => {
    const a1 = blank(3), b1 = blank();
    fuse(a1, b1);
    expect(a1.burnPlus).toBe(3);
    const a2 = blank(), b2 = blank(3);
    fuse(a2, b2);
    expect(a2.burnPlus).toBe(3); // Y7b2: was undefined (the second blank's +3 dropped)
  });

  it("the sum equals the one-belt rule: two VENOM ★1 hits on one slug give +6, and so do two fused blanks with +3 each", () => {
    const oneBelt = blank();
    for (const plus of [3, 3]) oneBelt.burnPlus = (oneBelt.burnPlus ?? 0) + plus; // Battle.applyHit's line
    const a = blank(3), b = blank(3);
    fuse(a, b);
    expect(a.burnPlus).toBe(oneBelt.burnPlus);
  });

  it("no VENOM on either blank: the alloy slug carries no burnPlus (as before)", () => {
    const a = blank(), b = blank();
    fuse(a, b);
    expect("burnPlus" in a).toBe(false);
  });
});
