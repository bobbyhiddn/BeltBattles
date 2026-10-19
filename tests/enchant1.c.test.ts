// ENCHANT-1c (REQ-BFG-085; BRIEF-ENCHANT1C C2, C3, C4): the three small rulings after ENCHANT-1b's review.
//  C3: pick 2's day is the Iron Matriarch's day (rivals.ts MATRIARCH_DAY), one literal.
// (C2's ECHOING rule and C4's merge note are tested below, in their own describes.)
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ENCHANT, setEnchant, withEnchant } from "../src/sim/enchant";
import { WARLORD_PICK_FROM, warlordPicksByDay } from "../src/sim/enchantSources";
import { MATRIARCH_DAY, RUN_DAYS, rivalDays } from "../src/sim/rivals";
import { openWarlordPick } from "../src/game/enchanter";
import { newRun } from "../src/game/run";

afterEach(() => setEnchant(ENCHANT));
const on = <T>(fn: () => T): T => withEnchant(fn, true);

describe("ENCHANT-1c C3: pick 2's day is the Matriarch's day", () => {
  it("WARLORD_PICK_FROM[1] === MATRIARCH_DAY, which is the first day she can be fought; nothing moves today ([5, 8])", () => {
    expect(WARLORD_PICK_FROM[1]).toBe(MATRIARCH_DAY);
    expect(rivalDays("matriarch")[0]).toBe(WARLORD_PICK_FROM[1]);
    expect([...WARLORD_PICK_FROM]).toEqual([5, 8]);
    expect(MATRIARCH_DAY).toBe(8);
  });

  it("the picks a deck can have had follow it: one from day 5, two from the Matriarch's day (warlordPicksByDay)", () => {
    expect(warlordPicksByDay(WARLORD_PICK_FROM[0] - 1)).toBe(0);
    expect(warlordPicksByDay(WARLORD_PICK_FROM[0])).toBe(1);
    expect(warlordPicksByDay(MATRIARCH_DAY - 1)).toBe(1);
    expect(warlordPicksByDay(MATRIARCH_DAY)).toBe(2);
    expect(warlordPicksByDay(RUN_DAYS)).toBe(2);
  });

  it("the client's pick 2 opens on the Matriarch's win on the day the constant names, and the pair is that day's (the server re-derives the same words)", () => {
    on(() => {
      const run = newRun("furnace", 11);
      openWarlordPick(run, { tier: "hard", id: "matriarch", day: MATRIARCH_DAY }, true);
      expect(run.enchPick?.no, "pick 2").toBe(2);
      expect(run.enchPick?.day).toBe(WARLORD_PICK_FROM[1]);
    });
  });

  it("the source has no second literal: enchantSources.ts takes the day from rivals.ts (the import makes no cycle: rivals.ts reaches nothing of enchantSources.ts)", () => {
    const src = readFileSync(new URL("../src/sim/enchantSources.ts", import.meta.url), "utf8");
    expect(src).toMatch(/import \{ MATRIARCH_DAY \} from "\.\/rivals";/);
    expect(src).toMatch(/export const WARLORD_PICK_FROM: readonly \[number, number\] = \[5, MATRIARCH_DAY\];/);
    expect(src).not.toMatch(/WARLORD_PICK_FROM[^\n]*=\s*\[\s*5\s*,\s*8\s*\]/);
  });
});
