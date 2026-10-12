// FIX-ABE E (REQ-BFG-069; cap's ruling 207816b18a9fbfdb): pickOffer refuses a forbidden part (TUNE-M's pol.forbid) only at
// the moment it would be taken. It used to drop the forbidden parts from the spendable-change set (the offers the change
// may still go on), so with both switches on FURNACE with TEMPER forbidden drifted on day 9 of seed 6 although the run
// without the knob never takes TEMPER. The knob now has its own mark (Cand.forbid), apart from the sustain rule's `banned`:
// the pick is made as the player without the knob makes it, and only a forbidden pick is refused and made again.
import { describe, expect, it } from "vitest";
import { PLAYER_DAYS, playerRun } from "../src/sim/harness/player";
import type { Build } from "../src/sim/deck";

const holds = (b: Build, def: string): boolean => b.items.some((p) => p.def === def) || b.mods.some((m) => m.def === def);
const CASES: [("furnace" | "weaver"), string][] = [["furnace", "temper"], ["weaver", "temper"], ["weaver", "dragchain"], ["furnace", "flak"]];

/** The first day index the run without the knob takes `def` (PLAYER_DAYS: never), and the first day the two decks differ.
 *  AZ-BUMP (the flip, NPC_DAY; cap's ruling on run 4's Q5a): with NPC_DAY on a run takes a part by a buy or as a warlord's
 *  drop (PlayerDay.road.drop), and the knob now declines a forbidden drop as it refuses a forbidden buy (player.ts
 *  parNpcDay, only with tune.forbid set), so the first take is the first day of either. Was the first buy (furnace TEMPER
 *  s7: the run with the knob got TEMPER as day 6's drop, "holds" on d6, before the knob declined drops). */
function alignment(hero: "furnace" | "weaver", def: string, seed: number): { first: number; drift: number } {
  const base = playerRun(hero, PLAYER_DAYS, seed), ctrl = playerRun(hero, PLAYER_DAYS, seed, { tune: { forbid: def } });
  const at = base.findIndex((d) => d.buys.some((x) => x.def === def) || d.road?.drop === def);
  const first = at < 0 ? PLAYER_DAYS : at;
  let drift = 0;
  while (drift < PLAYER_DAYS && JSON.stringify(ctrl[drift].build) === JSON.stringify(base[drift].build)) drift++;
  for (const d of ctrl) {
    expect(d.buys.some((x) => x.def === def), `${hero} ${def} s${seed} d${d.day}: bought`).toBe(false);
    expect(holds(d.build, def), `${hero} ${def} s${seed} d${d.day}: holds`).toBe(false);
  }
  return { first, drift };
}

describe("FIX-ABE E: a forbidden part is refused only when it would be taken", () => {
  // BAL-2 (cap's oracle 42da94243f43feef, item 3): seed 6 -> 3. With FURNACE's four runes revived (0.9.1's lines) seed 6's
  // dawns change its picks, so its run now takes TEMPER on day 5 (first 4, not 10). Seed 3 is the first FURNACE seed,
  // counting up from 1, whose run never takes TEMPER (seed 1 takes it on day 1, seed 2 on day 6); both checks exact.
  // (Seed 6 is the one that drifted on day 9 before FIX-ABE E.)
  // SHAPES-1 flip: seed 3 -> 12, by the same rule. With the shaped pieces in the caravan (SHAPES on) seed 3's run takes
  // TEMPER on day 9 (first 8); seeds 1-11 all take it (first 3 1 8 1 1 1 5 1 4 0 0), and seed 12 is the first whose run never
  // does, its 10 decks identical with the knob (measured on the flip's src); with SHAPES off seed 3 reads as before
  it("FURNACE, TEMPER forbidden, seed 12 (SHAPES-1 flip; was seed 3): the run without the knob never takes TEMPER, so all 10 decks are identical (seed 6 drifted on day 9)", () => {
    const { first, drift } = alignment("furnace", "temper", 12);
    expect(first).toBe(PLAYER_DAYS);
    expect(drift).toBe(PLAYER_DAYS);
  }, 120_000);

  it("forbid.test's four cases on seeds 7-10: identical decks up to the day the run without the knob first takes the part", () => {
    for (const [hero, def] of CASES) for (const seed of [7, 8, 9, 10]) {
      const { first, drift } = alignment(hero, def, seed);
      expect(drift, `${hero} ${def} s${seed}: drifts before the first take (day ${first + 1})`).toBeGreaterThanOrEqual(first);
    }
    // AZ-BUMP (the flip): 600 s (was 240 s), a host timeout under the 1.5-CPU quota (the GATE RULE; 240 s hit in run 5's
    // group check: 32 par runs, each fighting a warlord every day), not the rule
  }, 600_000);

  it("an empty forbid marks nothing: the run is the par run", () => {
    for (const hero of ["furnace", "weaver"] as const) for (const seed of [1, 2]) {
      const par = playerRun(hero, PLAYER_DAYS, seed), empty = playerRun(hero, PLAYER_DAYS, seed, { tune: { forbid: "" } });
      expect(empty.map((d) => JSON.stringify([d.build, d.buys])), `${hero} s${seed}`).toEqual(par.map((d) => JSON.stringify([d.build, d.buys])));
    }
  }, 120_000);
});
