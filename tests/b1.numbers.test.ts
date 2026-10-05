// 0.8.0 B1 M2 (REQ-BFG-022, REQ-BFG-032; ref/BRIEF-v080-B1.md section 3): the retuned numbers, each pinned by what it does
// in a battle or on the card. The before -> after and the measurements are in output-B1/REPORT.md (the number table).
import { describe, expect, it } from "vitest";
import { Battle } from "../src/sim/battle";
import { ITEMS, secPer } from "../src/sim/content"; // NUM-2 (REQ-BFG-047): secPer, a factory's cycle 30 / speed
import { key as K, walkRoute, type Build } from "../src/sim/deck";
import { effectAt } from "../src/sim/stars";
import { abilityText, gist, nextStarText } from "../src/ui/abilityText";
import { HEROES } from "../src/sim/content";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { FUSE_MULT } from "../src/sim/races/foundry";

const SEED = 4242;
/** A FURNACE deck: the Kiln at (4,6) on a straight 6-tile belt up column 4 into the heavy gun, hull lifted. */
const bench = (items: Build["items"] = []): Build => ({
  hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, ...items],
  routes: [{ factory: 1, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] }], mods: [], beltCap: 30, hullBonus: 5000,
});
const barge = (): Build => ({ hero: "weaver", items: [], routes: [], mods: [], beltCap: 0, hullBonus: 5000 });

describe("B1 M2: OVERDRIVE ★2 REDLINE (oracle 1cd5224fab866da2 (A))", () => {
  it("adds +1 to each payload past it (flat 0 / 1 / 3), and a locked belt still gains 6 in all at ★2 (1 + 5)", () => {
    expect([1, 2, 3].map((s) => effectAt("overdrive", s).gate!.flat ?? 0)).toEqual([0, 10, 30]); // NUM-1: x10 (was 0 / 1 / 3)
    expect([1, 2, 3].map((s) => effectAt("overdrive", s).gate!.speed)).toEqual([3, 4, 5]);
    // the locked-belt total (METRONOME: battle.ts adds lockedFlat on top of the rig's own flat): 30 / 60 / 140 (NUM-1: x10, was 3 / 6 / 14)
    expect([1, 2, 3].map((s) => (effectAt("overdrive", s).gate!.flat ?? 0) + effectAt("overdrive", s).gate!.lockedFlat!)).toEqual([30, 60, 140]);
    // in a battle: a cinder slug past the ★2 OVERDRIVE at (3,3) (X: it hits the belt at (4,3)) carries +10 flat (NUM-1: x10, was +1)
    const deck = bench([{ uid: 10, def: "overdrive", x: 3, y: 3, stars: 2 }]);
    const bt = new Battle(deck, barge(), SEED), flats = new Set<number>();
    for (let i = 0; i < 60 * 8; i++) {
      bt.step();
      for (const a of bt.sides[0].routes[0].ammo) if (a.processed >= 2) flats.add(a.p.flat); // past (4,3), the tile it works
    }
    expect([...flats]).toEqual([10]); // NUM-1: x10 (was [1])
    // and the build screen's walk shows it: the OVERDRIVE's hit adds 10 (NUM-1: x10, was 1)
    const od = walkRoute(deck, 0).timeline.flatMap((r) => r.hits).find((h) => h.uid === 10)!;
    expect([od.flat ?? 0, od.speed]).toEqual([10, 4]);
  });

  it("its card names its perk: the gist and the highlight follow REDLINE's chain guard, AFTERBURNER's damage", () => {
    expect(gist("overdrive", 2)).toBe("4 TIMES AS FAST, SAFE FROM CHAINS");
    expect(nextStarText("overdrive", 1)).toBe("NEXT STAR: 4 TIMES AS FAST, SAFE FROM CHAINS.");
    const t2 = abilityText("overdrive", 2);
    expect(t2.perk).toEqual({ name: "REDLINE", stars: 2, after: 1 });
    expect(t2.sentences[0]).toContain("AND ADDS 10 DAMAGE TO EACH PAYLOAD"); // NUM-1: x10 (was ADDS 1)
    expect(t2.sentences[1]).toContain("ENEMY CHAINS CAN'T SLOW");
    expect(gist("overdrive", 3)).toBe("5 TIMES AS FAST, ADDS 30 DAMAGE"); // NUM-1: x10 (was ADDS 3)
    expect(abilityText("overdrive", 3).perk).toEqual({ name: "AFTERBURNER", stars: 3, after: 0 });
  });
});

describe("B1 M2: ASSEMBLY LINE ★2/★3 pour heavier slugs at the 1-star pace (KNOWN_FALLS emptied)", () => {
  it("stamps every 1.8 s at every star, with base 3 / 4.5 / 6, so a busy gun's chamber never gets more loads than at ★1", () => {
    // NUM-2 (REQ-BFG-047): one speed at every star, roundHalfUp(30 / 1.8 = 16.67) = 17 (was interval [1.8, 1.8, 1.8])
    expect([1, 2, 3].map((s) => effectAt("assembly", s).factory!.speed)).toEqual([17, 17, 17]);
    // NUM-1: x10 (was ?? 3 and 3 / 4.5 / 6; the ★1 line pours plain slugs at AMMO.plain.base, 3 -> 30)
    expect([1, 2, 3].map((s) => effectAt("assembly", s).factory!.base ?? 30)).toEqual([30, 45, 60]);
    expect([1, 2, 3].map((s) => effectAt("assembly", s).factory!.commission)).toEqual([0.5, 0.25, 0]);
    // in a battle: the ★3 line's slugs are base 60 plain slugs (NUM-1: x10, was 6), one every 30 / 17 = 1.76 s once it runs
    // (NUM-2: was 1.8 s)
    const b: Build = { ...bench(), items: [{ uid: 1, def: "kiln", x: 0, y: 8 }, { uid: 2, def: "assembly", x: 4, y: 6, stars: 3 }], routes: [{ factory: 2, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] }] };
    const bt = new Battle(b, barge(), SEED);
    const t: number[] = [];
    for (let i = 0; i < 60 * 12; i++) {
      bt.step();
      for (const e of bt.drainEvents()) if (e.type === "produce" && e.side === 0 && e.factory === 2) t.push(bt.t);
    }
    expect(t.length).toBeGreaterThan(4);
    // NUM-2 (REQ-BFG-047): the cycle is secPer(17) = 1.765 s (was 1.8); the carried stamp timer stamps on the tick at or after
    // each 30 / 17 s, so a gap is 105 or 106 ticks (1.75 / 1.767 s), within the same 2 ticks
    const cycle = secPer(effectAt("assembly", 3).factory!.speed);
    t.slice(1).forEach((x, i) => expect(Math.abs(x - t[i] - cycle)).toBeLessThan(2 / 60));
    const slugs = bt.sides[0].routes[0].ammo.map((a) => a.p);
    expect(slugs.length).toBeGreaterThan(0);
    for (const p of slugs) expect(p.base).toBe(60); // NUM-1: x10 (was 6)
    expect(ITEMS.assembly.levels![3]!.perk).toBe("HOT START");
  });
});

describe("B1 M2: FOUNDRY and BASTION into band (the four-hero cross table, output-B1/m2/r24-bh215.md; oracle 2e5a00525c876f07)", () => {
  it("FOUNDRY fuses two blanks into 1.15 times their damage and starts with 225 hull; BASTION starts with 215", () => {
    expect(FUSE_MULT).toBe(1.15);
    expect([HEROES.foundry.hull, HEROES.bastion.hull]).toEqual([2250, 2150]); // NUM-1: x10 (was 225 / 215)
    // in a battle: each side's hull is its hero's (plus the deck's hull bonus)
    const f = heroStartBuild("foundry", 1), b = heroStartBuild("bastion", 1);
    const bt = new Battle(f, b, SEED);
    expect([bt.sides[0].hull.max, bt.sides[1].hull.max]).toEqual([2250 + f.hullBonus, 2150 + b.hullBonus]); // NUM-1: x10
    // and FOUNDRY's start deck fuses its twin pour: each shot is a fused alloy slug of 1.15 x (35 + 35) = 80.5, rounded
    // half up once to 81, or a lone blank of 35 (NUM-1: x10 and the integer pipeline, was 8.05 / 3.5 within 1e-9; the
    // shots are whole now, so the match is exact)
    const dmg: number[] = [];
    for (let i = 0; i < 60 * 20 && !bt.over; i++) {
      bt.step();
      for (const e of bt.drainEvents()) if (e.type === "fire" && e.side === 0) dmg.push(e.dmg);
    }
    expect(bt.sides[0].race!.foundry.fusions).toBeGreaterThan(2);
    expect(dmg.filter((d) => d === 81).length).toBeGreaterThan(2);
    for (const d of dmg) expect([81, 35].includes(d), `shot ${d}`).toBe(true);
  });
});
