// BUMP-1F P2 (found by tests/harness.saleloss.test.ts's sweep of the stand-in population in the shipped world): the par player's word buy
// threw out of a 16-day run, 1 of 96 runs (weaver, loose policy, seed 1007): buyEnchant refused "TAKE ITS EXTRA BELT OFF FIRST" because the bot
// had planned RISING onto the LOOM, which held WIDE with its extra belt in use (game/fuse.ts extraBeltInUse). The stand-in generator would have died
// on it. The bots (harness/enchantBot.ts bestWordFor and rankWords) now skip a WIDE factory whose belt is in use, as APPLY refuses it.
import { describe, expect, it } from "vitest";
import { CARAVAN_POLICY } from "../src/sim/harness/caravan";
import { playerRun } from "../src/sim/harness/player";
import { STANDIN_MAX_STARS } from "../src/sim/harness/standins";

// BUMP-1F P2 (found by this file's sweep, the shipped world): the par player's word buy threw out of a 16-day run, 1 of 96 stand-in runs.
describe("BUMP-1F: the bots never plan a word onto a WIDE factory whose extra belt is in use", () => {
  it("weaver, loose, seed 1007 (the run that threw 'TAKE ITS EXTRA BELT OFF FIRST') plays its 16 days", () => {
    const days = playerRun("weaver", 16, 1007, { ...CARAVAN_POLICY.loose, maxStars: STANDIN_MAX_STARS });
    expect(days).toHaveLength(16);
  }, 120_000);
});
