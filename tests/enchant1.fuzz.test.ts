// ENCHANT-1 (REQ-BFG-085 (4); BRIEF-ENCHANT1 E3, E4; run 3): the words in whole fights. Par decks of every hero at day 5 and day 10, dressed
// with random LEGAL words on random pieces (a seeded stream; WIDE takes a free side, GROWING a counter), fight a second par deck. With
// ENCHANT on every fight ends, every number it reports is finite, and the same fight played twice is the same fight (nothing rolls);
// with it off a dressed deck fights tick for tick as the plain deck (the words are inert).
import { afterEach, describe, expect, it, vi } from "vitest";
import { simulate } from "../src/sim/battle";
import { cloneBuild, setTurretList, turretList, type Build } from "../src/sim/deck";
import { ENCHANT, ENCHANT_IDS, enchantProblem, freeSides, setEnchant, withEnchant } from "../src/sim/enchant";
import { ITEMS, type HeroId } from "../src/sim/content";
import { playerBuild } from "../src/sim/harness/player";
import { Rng } from "../src/core/rng";

vi.setConfig({ testTimeout: 240_000 }); // ENCHANT-1 (run 3): these sweeps play many seeded runs; under a loaded host (24 cores shared with other lanes) the 30 s default is a time-only red

afterEach(() => setEnchant(ENCHANT));

/** A copy of `b` with a seeded random legal word on about half of its rigs, factories and turrets. */
function dress(b: Build, day: number, rng: Rng): { dressed: Build; words: number } {
  const d = cloneBuild(b);
  let words = 0;
  const pick = (def: string): { ench: string; enchDir?: number; grow?: number } | null => {
    if (!rng.chance(0.55)) return null;
    const legal = ENCHANT_IDS.filter((id) => enchantProblem(def, id) === null);
    if (!legal.length) return null;
    const ench = legal[rng.int(legal.length)];
    const free = freeSides(def);
    return { ench, ...(ench === "wide" && ITEMS[def].kind === "gate" ? { enchDir: free[rng.int(free.length)] } : {}), ...(ench === "growing" ? { grow: 1 + rng.int(Math.max(1, day - 1)) } : {}) };
  };
  d.items = d.items.map((p) => {
    const w = pick(p.def);
    if (!w) return p;
    words++;
    return { ...p, ...w };
  });
  setTurretList(d, turretList(d).map((t) => {
    const w = pick(t.def);
    if (!w) return t;
    words++;
    return { ...t, ench: w.ench, ...(w.grow !== undefined ? { grow: w.grow } : {}) };
  }));
  return { dressed: d, words };
}

const digest = (a: Build, b: Build, seed: number, day: number): string => {
  const bt = simulate(a, b, seed, 60 * 200, undefined, day);
  const h0 = bt.sides[0].hull.hp, h1 = bt.sides[1].hull.hp;
  for (const v of [h0, h1, bt.t]) if (!Number.isFinite(v)) throw new Error(`non-finite result: hulls ${h0} ${h1} t ${bt.t}`);
  for (const s of bt.sides) for (const v of Object.values(s.stats)) if (typeof v === "number" && !Number.isFinite(v)) throw new Error("non-finite stat");
  return `${bt.winner}|${bt.t.toFixed(3)}|${h0}|${h1}|${bt.sides[0].stats.shots}|${bt.sides[1].stats.shots}|${bt.sides[0].stats.payloadSum}`;
};

const HEROES: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];

describe("ENCHANT-1: words in whole fights (seeded par decks of every hero, day 5 and day 10)", () => {
  const cases: { hero: HeroId; day: number; seed: number }[] = [];
  for (const hero of HEROES) for (const day of [5, 10]) for (const seed of [1, 2, 3]) cases.push({ hero, day, seed });

  it("with ENCHANT on every dressed fight ends, is finite, and replays identically; words change at least some fights", () => {
    let changed = 0, total = 0, withWords = 0;
    for (const c of cases) {
      const me = playerBuild(c.hero, c.day, c.seed), foe = playerBuild(c.hero === "furnace" ? "weaver" : "furnace", c.day, c.seed + 100);
      const { dressed, words } = dress(me, c.day, new Rng(c.seed * 7919 + c.day));
      withWords += words ? 1 : 0;
      const plain = withEnchant(() => digest(me, foe, 9000 + c.seed, c.day));
      const a = withEnchant(() => digest(dressed, foe, 9000 + c.seed, c.day));
      const b = withEnchant(() => digest(dressed, foe, 9000 + c.seed, c.day));
      expect(b, `${c.hero} day ${c.day} seed ${c.seed}: the same fight twice`).toBe(a);
      // dressed on both sides too (the foe's words fight as well)
      const foeDressed = dress(foe, c.day, new Rng(c.seed * 104729 + c.day)).dressed;
      const x = withEnchant(() => digest(dressed, foeDressed, 9100 + c.seed, c.day));
      expect(withEnchant(() => digest(dressed, foeDressed, 9100 + c.seed, c.day))).toBe(x);
      total++;
      if (a !== plain) changed++;
    }
    expect(withWords).toBeGreaterThan(cases.length - 4); // the dressing really put words on (almost) every deck
    expect(changed, "the words changed the fights").toBeGreaterThan(total / 2);
  });
  it("with ENCHANT off a dressed deck fights tick for tick as the plain deck (every case)", () => {
    withEnchant(() => { // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), TRIAGE-R34 line 43): was bare (the switch shipped off); ENCHANT is on by default now, so the par decks held real words and the two digests differed. Whole body under ENCHANT off
      for (const c of cases) {
        const me = playerBuild(c.hero, c.day, c.seed), foe = playerBuild(c.hero === "furnace" ? "weaver" : "furnace", c.day, c.seed + 100);
        const { dressed } = dress(me, c.day, new Rng(c.seed * 7919 + c.day));
        expect(digest(dressed, foe, 9000 + c.seed, c.day), `${c.hero} day ${c.day} seed ${c.seed}`).toBe(digest(me, foe, 9000 + c.seed, c.day));
      }
    }, false);
  });
});
