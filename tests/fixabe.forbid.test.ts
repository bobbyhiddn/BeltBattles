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

/** The first day index the run without the knob takes `def` (PLAYER_DAYS: never), and the first day the two decks differ. */
function alignment(hero: "furnace" | "weaver", def: string, seed: number): { first: number; drift: number } {
  const base = playerRun(hero, PLAYER_DAYS, seed), ctrl = playerRun(hero, PLAYER_DAYS, seed, { tune: { forbid: def } });
  const at = base.findIndex((d) => d.buys.some((x) => x.def === def));
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
  it("FURNACE, TEMPER forbidden, seed 6: the run without the knob never takes TEMPER, so all 10 decks are identical (drifted on day 9)", () => {
    const { first, drift } = alignment("furnace", "temper", 6);
    expect(first).toBe(PLAYER_DAYS);
    expect(drift).toBe(PLAYER_DAYS);
  }, 120_000);

  it("forbid.test's four cases on seeds 7-10: identical decks up to the day the run without the knob first takes the part", () => {
    for (const [hero, def] of CASES) for (const seed of [7, 8, 9, 10]) {
      const { first, drift } = alignment(hero, def, seed);
      expect(drift, `${hero} ${def} s${seed}: drifts before the first take (day ${first + 1})`).toBeGreaterThanOrEqual(first);
    }
  }, 240_000);

  it("an empty forbid marks nothing: the run is the par run", () => {
    for (const hero of ["furnace", "weaver"] as const) for (const seed of [1, 2]) {
      const par = playerRun(hero, PLAYER_DAYS, seed), empty = playerRun(hero, PLAYER_DAYS, seed, { tune: { forbid: "" } });
      expect(empty.map((d) => JSON.stringify([d.build, d.buys])), `${hero} s${seed}`).toEqual(par.map((d) => JSON.stringify([d.build, d.buys])));
    }
  }, 120_000);
});
