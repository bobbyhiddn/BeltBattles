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
import { withLadderFix } from "../src/sim/ladderFix"; // AZ-BUMP (the flip, LADDER_FIX): the off checks beside the ride-keep words

const SEED = 4242;
/** A FURNACE deck: the Kiln at (4,6) on a straight 6-tile belt up column 4 into the heavy gun, hull lifted. */
const bench = (items: Build["items"] = []): Build => ({
  hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, ...items],
  routes: [{ factory: 1, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] }], mods: [], beltCap: 30, hullBonus: 5000,
});
const barge = (): Build => ({ hero: "weaver", items: [], routes: [], mods: [], beltCap: 0, hullBonus: 5000 });

describe("B1 M2: OVERDRIVE ★2 REDLINE (oracle 1cd5224fab866da2 (A))", () => {
  // Y7b2 (the flip): retitled, was "adds +1 to each payload past it (flat 0 / 1 / 3), and a locked belt still gains 6 in all
  // at ★2 (1 + 5)". OVERDRIVE ★2/★3's flats and REDLINE's chain guard left with the flip (Y2, DESIGN-Y row 18), so no star
  // adds a flat (data, battle and walk agree) and a locked belt gains its lockedFlat alone
  it("adds no flat at any star (flat 0 / 0 / 0), and a locked belt gains its lockedFlat alone (30 / 50 / 110)", () => {
    // NUM-1: x10 (was 0 / 1 / 3). Y7b2 (the flip): was [0, 10, 30]
    expect([1, 2, 3].map((s) => effectAt("overdrive", s).gate!.flat ?? 0)).toEqual([0, 0, 0]);
    expect([1, 2, 3].map((s) => effectAt("overdrive", s).gate!.speed)).toEqual([3, 4, 5]);
    // the locked-belt total (METRONOME: battle.ts adds lockedFlat on top of the rig's own flat): 30 / 60 / 140 (NUM-1: x10, was 3 / 6 / 14)
    // Y7b2 (the flip): 30 / 50 / 110, the lockedFlat alone (was [30, 60, 140])
    expect([1, 2, 3].map((s) => (effectAt("overdrive", s).gate!.flat ?? 0) + effectAt("overdrive", s).gate!.lockedFlat!)).toEqual([30, 50, 110]);
    // in a battle: a cinder slug past the ★2 OVERDRIVE at (3,3) (X: it hits the belt at (4,3)) carries +10 flat (NUM-1: x10, was +1)
    // Y7b2 (the flip): carries none (was [10])
    const deck = bench([{ uid: 10, def: "overdrive", x: 3, y: 3, stars: 2 }]);
    const bt = new Battle(deck, barge(), SEED), flats = new Set<number>();
    for (let i = 0; i < 60 * 8; i++) {
      bt.step();
      for (const a of bt.sides[0].routes[0].ammo) if (a.processed >= 2) flats.add(a.p.flat); // past (4,3), the tile it works
    }
    expect([...flats]).toEqual([0]);
    // and the build screen's walk shows it: the OVERDRIVE's hit adds 10 (NUM-1: x10, was 1). Y7b2 (the flip): adds none,
    // 4 TIMES AS FAST (was [10, 4])
    const od = walkRoute(deck, 0).timeline.flatMap((r) => r.hits).find((h) => h.uid === 10)!;
    expect([od.flat ?? 0, od.speed]).toEqual([0, 4]);
  });

  // Y7b2 (the words): retitled, was "its card names its perk: the gist and the highlight follow REDLINE's chain guard,
  // AFTERBURNER's damage". The guard and both flats left with the flip, so the gist reads the data (its speed) and both
  // perks name the opening sentence
  it("its card reads the data: the gist and the highlight name the speed at ★2 and ★3 (no chain guard, no flat)", () => {
    // Y7b2 (the words): from the data (was "4 TIMES AS FAST, SAFE FROM CHAINS" and "NEXT STAR: 4 TIMES AS FAST, SAFE FROM
    // CHAINS.")
    // AZ-BUMP (the flip, LADDER_FIX): "4 TIMES AS FAST" -> "4 TIMES AS FAST, KEEPS 50% OF THE RIDE" (and the next star's line
    // with it), OVERDRIVE ★2's ride-keep (ladderFix.ts RIDE_KEEP, AZ-PREP (g)); with LADDER_FIX off the words as before
    expect(gist("overdrive", 2)).toBe("4 TIMES AS FAST, KEEPS 50% OF THE RIDE");
    expect(nextStarText("overdrive", 1)).toBe("NEXT STAR: 4 TIMES AS FAST, KEEPS 50% OF THE RIDE.");
    expect(withLadderFix(() => [gist("overdrive", 2), nextStarText("overdrive", 1)], false)).toEqual(["4 TIMES AS FAST", "NEXT STAR: 4 TIMES AS FAST."]);
    const t2 = abilityText("overdrive", 2);
    // Y7b2 (the words): REDLINE names the opening sentence (was after 1, the chain guard's)
    expect(t2.perk).toEqual({ name: "REDLINE", stars: 2, after: 0 });
    // NUM-1: x10 (was ADDS 1). Y7b2 (the flip): no flat and no chain guard, so the sentences are its speed and its locked
    // bonus (were toContain("AND ADDS 10 DAMAGE TO EACH PAYLOAD") and, NUM-3 step 1b, sentences[1] toContain("ENEMY CHAIN
    // ROUNDS CAN'T STUN"))
    // NUM-3 (R1's STUN fold): was toContain("ENEMY CHAINS CAN'T SLOW") (a chain round slowed a belt stretch); now REDLINE's
    // chain guard keeps enemy CHAIN rounds' STUNs off its belts, and abilityText's sentence says so (step 1b: "ENEMY CHAIN
    // [AND FROST] ROUNDS CAN'T STUN ..."); at ★2 the chain alone, as before (★3 AFTERBURNER adds AND FROST)
    // AZ-BUMP (the flip, LADDER_FIX): + the ride-keep sentence after the speed (★2 keeps 50% of the ride it cuts, AZ-PREP
    // (g)); with LADDER_FIX off the two sentences as before
    expect(t2.sentences).toEqual(["MAKES THE BELTS PAST IT 4 TIMES AS FAST.", "A PAYLOAD KEEPS 50% OF THE RIDE THAT SPEED CUTS, FOR ITS RIDE BONUSES (HEAT, LONG RIDES).", "ON METRONOME'S LOCKED BELTS IT ADDS 50 DAMAGE INSTEAD."]);
    expect(withLadderFix(() => abilityText("overdrive", 2).sentences, false)).toEqual(["MAKES THE BELTS PAST IT 4 TIMES AS FAST.", "ON METRONOME'S LOCKED BELTS IT ADDS 50 DAMAGE INSTEAD."]);
    // AZ-BUMP (the flip, LADDER_FIX): "5 TIMES AS FAST" -> "5 TIMES AS FAST, KEEPS 100% OF THE RIDE", ★3's ride-keep; off as before
    expect(gist("overdrive", 3)).toBe("5 TIMES AS FAST, KEEPS 100% OF THE RIDE"); // NUM-1: x10 (was ADDS 3). Y7b2 (the flip): was "5 TIMES AS FAST, ADDS 30 DAMAGE"
    expect(withLadderFix(() => gist("overdrive", 3), false)).toBe("5 TIMES AS FAST");
    expect(abilityText("overdrive", 3).perk).toEqual({ name: "AFTERBURNER", stars: 3, after: 0 });
  });
});

describe("B1 M2: ASSEMBLY LINE ★2/★3 pour heavier slugs at the 1-star pace (KNOWN_FALLS emptied)", () => {
  it("stamps at SPEED 17 at every star, with base 30 / 45 / 60, so a busy gun's chamber never gets more loads than at ★1", () => {
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
    // Y7b2 (the words): ★3's perk name left with its rule (HOT START, folded away at the flip), with no rename (was
    // toBe("HOT START"))
    expect(ITEMS.assembly.levels![3]!.perk).toBeUndefined();
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
