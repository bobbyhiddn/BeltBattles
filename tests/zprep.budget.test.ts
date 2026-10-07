// Z-PREP (REQ-BFG-073; REVIEW-LC1, carried to the flip): the player mode's budget line (src/net/roadCap.ts
// playerSupplyBudget, fed by src/net/validate.ts) names a free LAST CHANCE part's price on its own ("+ free part M"); before,
// it sat inside "+ rune gold N". Without a LAST CHANCE part (every deck with no LAST CHANCE) the line is byte for byte
// today's. Z-BUMP (REQ-BFG-073, the flip): LAST CHANCE is the game's rule and its switch is gone, so these tests are plain.
import { describe, expect, it } from "vitest";
import { ITEMS, RULES_VERSION, type HeroId } from "../src/sim/content";
import { lastChanceOffer, type Boon } from "../src/sim/lastChance";
import { parRunSeed, playerRun } from "../src/sim/harness/player";
import { runeGrants } from "../src/sim/runes";
import { SNAPSHOT_V3, type GhostSnapshot } from "../src/net/snapshot";
import { buildCost, validateUpload } from "../src/net/validate";
import { playerSupplyBudget } from "../src/net/roadCap";
import type { Build } from "../src/sim/deck";

const D = 5;
const PLATE = ITEMS.plating.supply!.hull!;

/** An honest upload at dusk 6 after a LAST CHANCE on day D that took `boon` (the par player's own run). */
function honest(boon: Boon, hero: HeroId = "furnace", seed = 5): GhostSnapshot {
  const runSeed = parRunSeed(hero, seed);
  const before = playerRun(hero, D, seed)[D - 1].build;
  const offer = lastChanceOffer(runSeed, D, hero, (before.runes ?? []).map((q) => q.id));
  const build = playerRun(hero, D + 1, seed, { lastChance: { day: D, boon } })[D].build;
  const id = boon === "rune" ? offer.rune!.id : boon === "part" ? offer.part! : undefined;
  return {
    v: SNAPSHOT_V3, rules: RULES_VERSION, hero, day: D + 1, wins: 0, lives: 2, build, runId: `zprep-${hero}-${seed}`,
    playerId: "p-zprep", createdAt: 1_790_000_000_000, seed: runSeed, lastChance: { day: D, boon, ...(id ? { id } : {}) },
  };
}
const check = (s: GhostSnapshot) => validateUpload(s.build, s.day, s.rules, { seed: s.seed, ...(s.lastChance ? { lastChance: s.lastChance } : {}) });
const plates = (s: GhostSnapshot, n: number): GhostSnapshot => ({ ...s, build: { ...s.build, hullBonus: s.build.hullBonus + n * PLATE } as Build });
/** One plate past the budget's edge: the smallest over-budget deck, whose only error is the budget line. */
function overEdge(s: GhostSnapshot): GhostSnapshot {
  let k = 0;
  while (k < 60 && check(plates(s, k + 1)).ok) k++;
  return plates(s, k + 1);
}
const LINE = /^budget: build costs (\d+) gold \(.*\) but a player's day (\d+) allows at most (\d+) \(maxGoldByDay (\d+) \+ roadCap (\d+)( \+ rune gold (\d+))?( \+ free part (\d+))?\)$/;

describe("Z-PREP: the budget line names a free LAST CHANCE part", () => {
  it("with a LAST CHANCE part the allowance names it on its own: + rune gold N + free part M (M its price)", () => {
    for (const hero of ["furnace", "weaver", "foundry", "bastion"] as HeroId[]) {
      const s = honest("part", hero);
      const over = overEdge(s);
      const e = check(over).errors;
      expect(e, hero).toHaveLength(1);
      const m = LINE.exec(e[0]);
      expect(m, `${hero}: ${e[0]}`).not.toBeNull();
      const price = ITEMS[s.lastChance!.id!].price;
      const runeGold = runeGrants(s.build.runes, s.day).gold;
      expect([Number(m![9]), Number(m![7] ?? 0)], hero).toEqual([price, runeGold]); // the part apart; the rune gold its runes' alone
      expect(Number(m![3]), hero).toBe(Number(m![4]) + Number(m![5]) + runeGold + price); // the allowance adds up
      expect(e[0].endsWith(`${runeGold ? ` + rune gold ${runeGold}` : ""} + free part ${price})`), hero).toBe(true);
    }
  });

  it("without a LAST CHANCE part (the rune and hull cards, and every deck with no LAST CHANCE) the line is today's: no free part", () => {
    for (const boon of ["rune", "hull"] as Boon[]) {
      const e = check(overEdge(honest(boon))).errors;
      expect(e).toHaveLength(1);
      expect(LINE.test(e[0]), e[0]).toBe(true);
      expect(e[0]).not.toContain("free part");
    }
    // a deck with no LAST CHANCE (Z-BUMP, the flip; was: the switch off): a par deck one plate over, through
    // validateUpload's player mode (its seed, no LAST CHANCE)
    const b = playerRun("weaver", 6, 9)[5].build;
    const s: GhostSnapshot = { v: SNAPSHOT_V3, rules: RULES_VERSION, hero: "weaver", day: 6, wins: 3, lives: 4, build: b, runId: "z", playerId: "p", createdAt: 1, seed: parRunSeed("weaver", 9) };
    const e = check(overEdge(s)).errors;
    expect(e).toHaveLength(1);
    expect(e[0]).not.toContain("free part");
    const rg = runeGrants(b.runes, 6).gold;
    expect(e[0].endsWith(`${rg ? ` + rune gold ${rg}` : ""})`)).toBe(true);
    // playerSupplyBudget itself: freePart 0 (or absent) writes exactly the line it wrote before the argument existed
    const over = overEdge(s).build;
    const cost = buildCost(over);
    expect(playerSupplyBudget(over, 6, cost, rg, 0)).toEqual(playerSupplyBudget(over, 6, cost, rg));
    expect(playerSupplyBudget(over, 6, cost, rg, 0)).toEqual(e);
  });
});
