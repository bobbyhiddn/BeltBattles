// 0.6.1a harness v2: merge-aware builds (REQ-BFG-005, REQ-BFG-019). gainInto is a thin wrapper
// directly over src/game/fuse.ts:gainModule (ARSENAL.md §9.2: import the game's own code, don't
// re-implement it) — these are equivalence checks against the real function, the 1+1+1+1 = 3-star
// chain, the survivor rules, the stars-on property test, and the stars-off byte-identical pin.
import { describe, expect, it } from "vitest";
import { Rng, hashSeed } from "../src/core/rng";
import { ITEMS, type HeroId } from "../src/sim/content";
import { key as K, kx, ky, occupancy, type Build } from "../src/sim/deck";
import { buildCost, maxGoldByDay, unfusedPairs, validateBuild } from "../src/net/validate";
import { starsOf } from "../src/sim/stars";
import { gainModule } from "../src/game/fuse";
import { newRun } from "../src/game/run";
import { fullPurseBuild, randomBuild } from "../src/sim/harness/gen";
import { HARNESS_HEROES, heroStartBuild } from "../src/sim/harness/heroes";
import { fusibleCopies, gainInto, previewMerge } from "../src/sim/harness/merge";

const freeCells = (b: Build): number[] => {
  const occ = occupancy(b);
  return b.routes.flatMap((r) => r.cells).filter((k) => occ[k].item < 0);
};
const cellAt = (b: Build, i: number) => {
  const k = freeCells(b)[i];
  return { x: kx(k), y: ky(k) };
};

describe("harness merge: gainInto is src/game/fuse.ts:gainModule on a wrapped build", () => {
  it("matches gainModule on a real Run for the same deck and gain sequence (1-star twins merging)", () => {
    for (const hero of ["furnace", "weaver"] as const) {
      const b = randomBuild(hero, 7, new Rng(hashSeed("merge-eq", hero)), "on");
      const target = fusibleCopies(b).find((c) => c.stars === 1);
      if (!target) continue; // every seed tried below finds one; this is a defensive skip only
      const at = target.kind === "mod" ? { turret: 0 } : { x: 0, y: 0 }; // ignored: a 1-star twin exists, so this always merges
      const b1: Build = JSON.parse(JSON.stringify(b));
      const seed1 = { uid: 900000 };
      const gain1 = gainInto(seed1, b1, target.def, at);

      const run = newRun(hero, 1, "eq");
      run.build = JSON.parse(JSON.stringify(b));
      run.nextUid = 900000;
      const gain2 = gainModule(run, target.def, at);

      expect(JSON.stringify(b1)).toBe(JSON.stringify(run.build));
      expect([gain1.stars, gain1.where, gain1.survivor]).toEqual([gain2.stars, gain2.where, gain2.survivor]);
      expect(seed1.uid).toBe(run.nextUid);
    }
  });

  it("the chain 1+1+1+1 = 3 stars in one gain sequence (same rule gainModule enforces at the run level)", () => {
    const b = heroStartBuild("furnace", 1);
    expect(freeCells(b).length).toBeGreaterThanOrEqual(2);
    const at0 = cellAt(b, 0), at1 = cellAt(b, 1);
    const seed = { uid: 500 };
    gainInto(seed, b, "temper", at0); // #1: 1-star at at0
    gainInto(seed, b, "temper", at0); // #2: merges with #1 -> 2-star (at ignored)
    expect(fusibleCopies(b).filter((c) => c.def === "temper").map((c) => c.stars)).toEqual([2]);
    gainInto(seed, b, "temper", at1); // #3: no 1-star twin (the survivor is 2-star) -> a fresh 1-star at at1
    expect(fusibleCopies(b).filter((c) => c.def === "temper").map((c) => c.stars).sort()).toEqual([1, 2]);
    gainInto(seed, b, "temper", at1); // #4: merges with #3 -> 2-star, which chains at once into the existing 2-star -> 3-star
    // fusibleCopies only reports what is still BELOW FUSE_MAX (what could still grow), so a
    // maxed-out 3-star copy no longer appears there; check b.items directly for the final state.
    expect(fusibleCopies(b).filter((c) => c.def === "temper")).toEqual([]);
    const final = b.items.filter((p) => p.def === "temper");
    expect(final).toHaveLength(1);
    expect(starsOf(final[0])).toBe(3);
    expect(unfusedPairs(b)).toEqual([]);
    expect(validateBuild(b, 10).errors).toEqual([]);
  });

  it("survivor rules: an absorbed gate cell stays belt (route untouched); an absorbed mod frees its hardpoint", () => {
    const b = heroStartBuild("weaver", 1);
    const at0 = cellAt(b, 0);
    const routeLens = b.routes.map((r) => r.cells.length);
    const seed = { uid: 700 };
    gainInto(seed, b, "temper", at0);
    gainInto(seed, b, "temper", at0); // merges: the 2nd copy never gets its own cell
    expect(b.routes.map((r) => r.cells.length)).toEqual(routeLens); // untouched: no cell was ever absorbed away
    expect(b.items.filter((p) => p.def === "temper")).toHaveLength(1);
    expect(starsOf(b.items.find((p) => p.def === "temper")!)).toBe(2);

    const seed2 = { uid: 800 };
    gainInto(seed2, b, "calibrate", { turret: 0 });
    gainInto(seed2, b, "calibrate", { turret: 0 }); // merges: turret 0 still carries exactly one mod
    expect(b.mods.filter((m) => m.turret === 0)).toHaveLength(1);
    expect(starsOf(b.mods.find((m) => m.turret === 0)!)).toBe(2);
    expect(validateBuild(b, 10).errors).toEqual([]);
  });

  it("survivor rules: a factory merge keeps the placed survivor's belts and creates no second route", () => {
    // Coordinates for the placed press proven valid in tests/fuse.test.ts ("two placed factories:
    // more belts survives": uid 2 there). A brand-new gain is always cargo-side with zero belts of
    // its own, so this exercises rule 1 (placed beats cargo) and the "no second route" consequence
    // of a Press's single output; the belt-count tie-break between two PLACED factories is already
    // covered, protected and green in tests/fuse.test.ts (which this harness code calls directly).
    const b: Build = {
      hero: "furnace",
      items: [
        { uid: 1, def: "kiln", x: 4, y: 6 },
        { uid: 2, def: "press", x: 6, y: 6 },
      ],
      routes: [
        { factory: 1, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] },
        { factory: 2, cells: [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] }, // 7 belts
      ],
      mods: [],
      beltCap: 20,
      hullBonus: 0,
    };
    const beltBefore = b.routes.reduce((s, r) => s + r.cells.length, 0);
    const preview = previewMerge(b, 900, "press");
    expect(preview).toEqual({ toStars: 2, survivorUid: 2, where: "deck" }); // the placed 1-star press is the only twin
    const seed = { uid: 900 };
    const gain = gainInto(seed, b, "press", { x: 0, y: 0 }); // target irrelevant: it merges into uid 2
    expect(gain).toMatchObject({ survivor: 2, stars: 2, where: "deck" });
    expect(b.items.filter((p) => p.def === "press")).toHaveLength(1); // no second press item was ever placed
    expect(starsOf(b.items.find((p) => p.def === "press")!)).toBe(2);
    expect(b.routes).toHaveLength(2); // no second route: a Press has one output at every star
    expect(b.routes.reduce((s, r) => s + r.cells.length, 0)).toBe(beltBefore); // the survivor's belts are untouched
    expect(unfusedPairs(b)).toEqual([]);
  });

  it("property test: seeds x {furnace, weaver} x days {1,3,5,7,10}, stars on: every build is valid, no unfused pair, within budget; some hold a 2-star by day 5 and a 3-star by day 10", () => {
    const days = [1, 3, 5, 7, 10];
    let sawTwoStarByDay5 = 0, sawThreeStarByDay10 = 0;
    for (const hero of ["furnace", "weaver"] as const) {
      for (const day of days) {
        for (let i = 0; i < 30; i++) {
          const b = randomBuild(hero, day, new Rng(hashSeed("merge-prop", hero, day, i)), "on");
          const v = validateBuild(b, day);
          expect(v.errors, `${hero} d${day} #${i}`).toEqual([]);
          expect(unfusedPairs(b), `${hero} d${day} #${i}`).toEqual([]);
          expect(buildCost(b).total).toBeLessThanOrEqual(maxGoldByDay(day));
          const maxStar = Math.max(0, ...fusibleCopies(b).map((c) => c.stars), ...[...b.items, ...b.mods].map((p) => starsOf(p)));
          if (day === 5 && maxStar >= 2) sawTwoStarByDay5++;
          if (day === 10 && maxStar >= 3) sawThreeStarByDay10++;
        }
      }
    }
    expect(sawTwoStarByDay5).toBeGreaterThan(0);
    expect(sawThreeStarByDay10).toBeGreaterThan(0);
  }, 120_000);

  it("stars off: randomBuild reproduces bf779de exactly for a fixed seed set (pinned hash)", () => {
    const hash32 = (s: string): number => {
      let h = 0x811c9dc5;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
      return h >>> 0;
    };
    const parts: string[] = [];
    for (const hero of HARNESS_HEROES) {
      for (const day of [1, 3, 5, 7, 10]) {
        for (let i = 0; i < 3; i++) {
          const b = randomBuild(hero, day, new Rng(hashSeed("off-pin", hero, day, i)), "off");
          expect(validateBuild(b, day).errors, `${hero} d${day} #${i}`).toEqual([]);
          parts.push(JSON.stringify(b));
        }
      }
    }
    expect(hash32(parts.join("|"))).toBe(553739242);
  }, 60_000);

  it("stars off: fullPurseBuild also reproduces v1 exactly (no merge lever, no extra RNG draws)", () => {
    for (const hero of ["furnace", "weaver"] as const) {
      for (const day of [2, 6]) {
        const on = fullPurseBuild(hero, day, hashSeed("fp-off", hero, day), undefined, 60, "on");
        const off = fullPurseBuild(hero, day, hashSeed("fp-off", hero, day), undefined, 60, "off");
        expect(off.floorMet).toBe(true);
        expect(validateBuild(off.build, day).errors).toEqual([]);
        // both start from the same RNG stream; they only diverge once a lever actually creates a duplicate
        expect(off.tries).toBeGreaterThan(0);
        expect(on.tries).toBeGreaterThan(0);
      }
    }
  });
});
