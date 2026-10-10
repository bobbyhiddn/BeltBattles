// PLAIN-1 (REQ-BFG-084.6; BRIEF-PLAIN1 P5, step 3): the bots value the plain stat rigs. A plain rig has no hook, so the
// rating (deckRating.ts rateDeck, which the par player reads) values it through the walk's flat terms (deck.ts walkRoute:
// DMG and BURN, as WHETSTONE and TEMPER), plus the three terms the walk left out: SCALE GUARD's slug PLATE (rated as
// PLATE ROLLER's PLATE), SPARK GAP's STUN seconds (STUN_SEC_EQ, the shock's price a second) and BALLAST's max hull %
// (ballastHull, as Battle.makeSide adds it). The par player then buys them (the switch on).
import { describe, expect, it } from "vitest";
import { HEROES, type HeroId } from "../src/sim/content";
import { rigHits, type Build } from "../src/sim/deck";
import { EQ, STUN_SEC_EQ, ballastHull, rateDeck } from "../src/sim/deckRating";
import { playerRun } from "../src/sim/harness/player";
import { PLAIN_RIG_IDS, withPlainRigs } from "../src/sim/plainRigs";
import { furnaceBench, item, withItem } from "./wave3.helpers";

const on = <T>(fn: () => T): T => withPlainRigs(fn);
/** FURNACE's bench with `def` at (3,3): turned so one arrow points east at the belt's tile 2, (4,3). */
const benchWith = (def: string, stars = 1): Build => withItem(furnaceBench(), item(30, def, 3, 3, def === "grindstone" || def === "brandingiron" ? 0 : 1, stars));

describe("P5: the rating values each of the six", () => {
  it("each lands one arrow on the belt", () => on(() => {
    for (const id of PLAIN_RIG_IDS) expect(rigHits(benchWith(id)).flat(2).filter((h) => h.uid === 30).length, id).toBe(1);
  }));

  it("the slug-stat rigs add offense (the walk's DMG and BURN; SPARK GAP's STUN at STUN_SEC_EQ a second)", () => on(() => {
    const base = rateDeck(furnaceBench());
    for (const id of ["rasp", "sparkgap", "scaleguard", "grindstone", "brandingiron"]) {
      expect(rateDeck(benchWith(id)).offense, id).toBeGreaterThan(base.offense);
    }
    expect(STUN_SEC_EQ).toBe(EQ.shock / 2); // 15: the shock's 30 for DISRUPT_TIME's 2 s
    // a ★3 SPARK GAP's 3 s are worth more than a ★1's 1 s
    expect(rateDeck(benchWith("sparkgap", 3)).offense).toBeGreaterThan(rateDeck(benchWith("sparkgap", 1)).offense);
  }));

  it("SCALE GUARD's slug PLATE adds defense, as PLATE ROLLER's PLATE does", () => on(() => {
    const base = rateDeck(furnaceBench()).defense;
    expect(rateDeck(benchWith("scaleguard")).defense).toBeGreaterThan(base);
    expect(rateDeck(benchWith("rasp")).defense).toBe(base);
  }));

  it("BALLAST adds its % of the rating's hull to defense when it works, and nothing IDLE", () => on(() => {
    const b0 = furnaceBench(), base = rateDeck(b0);
    const hull = HEROES.furnace.hull + b0.hullBonus;
    const one = benchWith("ballast");
    expect(ballastHull(one)).toBe(Math.floor((hull * 8) / 100));
    expect(rateDeck(one).defense).toBe(base.defense + Math.floor((hull * 8) / 100));
    expect(rateDeck(one).offense).toBe(base.offense);
    const idle = withItem(b0, item(30, "ballast", 0, 9));
    expect(ballastHull(idle)).toBe(0);
    expect(rateDeck(idle).defense).toBe(base.defense);
    expect(ballastHull(benchWith("ballast", 3))).toBe(Math.floor((hull * 25) / 100));
  }));

  it("the par player buys plain rigs (the switch on): a few runs, days 1-6", () => on(() => {
    const bought = new Map<string, number>();
    for (const hero of ["furnace", "bastion"] as HeroId[]) {
      for (const seed of [1, 2, 3]) {
        for (const d of playerRun(hero, 6, seed)) for (const b of d.buys) if (PLAIN_RIG_IDS.includes(b.def)) bought.set(b.def, (bought.get(b.def) ?? 0) + 1);
      }
    }
    console.log(`PLAIN1 par buys (furnace, bastion; seeds 1-3; days 1-6): ${JSON.stringify(Object.fromEntries(bought))}`);
    expect([...bought.values()].reduce((s, n) => s + n, 0)).toBeGreaterThan(0);
  }));
});
