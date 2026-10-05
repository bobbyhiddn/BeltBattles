// SUS-A (REQ-BFG-069; SUSTAIN-1 4.3 and 5.8): the stall guard. The heavy mirror, the acceptance bench's heavy2r
// (tools/sustainBench.ts transform: both sides hold WARD BELL ★3, MENDING LOOM ★3, MEND PRESS ★3 and RIVETER ★3, plus
// WARD STONE's 3 SHIELD at the start), ends before the 120-s hard stop on every day 1-10, on fixed seeds: the dark wind's
// rule (nothing heals from 25 s, the wind goes past SHIELD and PLATE) and BURN's rule end it.
import { describe, expect, it } from "vitest";
import { simulate } from "../src/sim/battle";
import { BATTLE_CAP, type HeroId } from "../src/sim/content";
import { hashSeed } from "../src/core/rng";
import { parField } from "../src/sim/harness/par";
import { transform } from "../tools/sustainBench";

const HEROES4: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];

describe("SUS-A: the heavy mirror ends before 120 s", () => {
  it("heavy2r on days 1-10: 2 par decks of each playable hero, every pair (mirrors too), one fixed seed each", () => {
    const long: string[] = [];
    let n = 0, longest = 0, sustained = 0;
    for (let day = 1; day <= 10; day++) {
      const decks = HEROES4.flatMap((h) => parField(h, day, 2)).map((d, i) => transform("heavy2r", day, d, hashSeed("susa-place", day, i)).b);
      for (let i = 0; i < decks.length; i++) for (let j = i; j < decks.length; j++) {
        const bt = simulate(decks[i], decks[j], hashSeed("susa-stall", day, i, j));
        n++;
        longest = Math.max(longest, bt.t);
        if ((bt.sides[0].heals?.healed ?? 0) > 0 && (bt.sides[0].heals?.gained ?? 0) > 0) sustained++;
        if (!bt.over || !(bt.t < BATTLE_CAP)) long.push(`day ${day} ${decks[i].hero}#${i} v ${decks[j].hero}#${j}: ${bt.t.toFixed(2)} s, winner ${bt.winner}`);
      }
    }
    expect(long).toEqual([]);
    expect(n).toBe(10 * 36);
    expect(sustained).toBeGreaterThan(n / 2); // the stacks did work: most battles healed and gained SHIELD
    expect(longest).toBeLessThan(BATTLE_CAP);
  });
});
