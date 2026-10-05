// bb-0.8.3 (REQ-BFG-042, job BELTS D5): FURNACE keeps its long-belt identity. The KILN BREECH (battle.ts makeTurret,
// deckRating.ts) makes a gun fed by a belt of 8+ tiles fire at FURNACE_LONG_BELT (0.72) of its interval (NUM-2: a whole
// rate %, +39 on its speed, rounded half up once: 30 -> 42, 0.714 s), and cinder
// slugs gain AMMO.cinder.rideScale damage a second of ride. Both stay unchanged in kind with more KILN belts: the breech
// reads the longest belt into a gun, not how many slugs it carries, so one 8+ belt still sets the heavy gun's cadence;
// the KILN deals its slugs one belt at a time, so each extra short belt takes its share of them off the long ride. With
// belt 14, that is the player's trade. A level-1 KILN on two belts and a level-2 KILN (FURNACE's FACTORY upgrade, bb-0.8.3
// REQ-BFG-043 D10) on three, one of 8+ tiles into the heavy gun.
import { describe, expect, it } from "vitest";
import { AMMO, HEROES } from "../src/sim/content";
import { rateMul, secPer } from "../src/sim/content"; // NUM-2 (REQ-BFG-047): SPEED (K = 30), whole rate %s
import { routeInfo, walkRoute, type Build } from "../src/sim/deck";
import { Battle, FURNACE_LONG_BELT } from "../src/sim/battle";
import { rateDeck } from "../src/sim/deckRating";
import { routeProblems } from "../src/game/routeCheck";
import { validateBuild } from "../src/net/validate";
import { effectAt, outputsAt } from "../src/sim/stars";
import { roundHalfUp } from "../src/sim/pct";
import { barge, SEED } from "./arsenal.bench";
import { K, tally } from "./belts.helpers";

/** The KILN at (6,5) (cells (6..7, 5..6)). LONG: 10 tiles into column 4 (the heavy gun, slot 0); SHORT4: 7 tiles into
 *  column 4; SHORT5: 6 tiles into column 5 (the heavy gun's other intake); SHORT8: 6 tiles into column 8 (the BOMBARD in
 *  slot 1). */
const LONG = [K(5, 6), K(4, 6), K(3, 6), K(3, 5), K(3, 4), K(3, 3), K(3, 2), K(4, 2), K(4, 1), K(4, 0)];
const SHORT4 = [K(5, 5), K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const SHORT5 = [K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)];
const SHORT8 = [K(8, 5), K(8, 4), K(8, 3), K(8, 2), K(8, 1), K(8, 0)];

/** FURNACE with the KILN at FACTORY level `level` (bb-0.8.3 D10: build.upgrades.factory) and `belts` out of it. */
function furnace(level: number, belts: number[][]): Build {
  const tiles = belts.reduce((n, c) => n + c.length, 0), crates = Math.max(0, Math.ceil((tiles - HEROES.furnace.belt) / 4));
  return {
    hero: "furnace", items: [{ uid: 7, def: "kiln", x: 6, y: 5 }],
    routes: belts.map((cells) => ({ factory: 7, cells: [...cells] })), mods: [],
    beltCap: HEROES.furnace.belt + 4 * crates, hullBonus: 0,
    turrets: [{ slot: 0, def: "scrapcannon", uid: 90, free: true }, { slot: 1, def: "bombard", uid: 91 }],
    ...(level > 1 ? { upgrades: { factory: level } } : {}),
  };
}

const intervals = (b: Build): number[] => new Battle(b, barge(), SEED).sides[0].turrets.map((t) => t.interval);

describe("D5: the KILN BREECH and cinder ride scaling with more KILN belts", () => {
  const A = furnace(1, [LONG, SHORT8]); // level 1 KILN, its 2 slots: 10 tiles into the heavy gun, 6 into the BOMBARD
  const B = furnace(1, [SHORT4, SHORT8]); // the same with a 7-tile belt into the heavy gun (no breech)
  const C = furnace(2, [LONG, SHORT5, SHORT8]); // level 2 KILN, its 3 slots: the long belt, a short one into each gun

  it("the decks are legal: a level 1 KILN takes 2 belts, a level 2 KILN 3 (validate.ts, routeCheck.ts), every belt to a gun", () => {
    expect([outputsAt("kiln", 1), outputsAt("kiln", 2)]).toEqual([2, 3]);
    for (const [id, b] of [["A", A], ["B", B], ["C", C]] as const) {
      expect(routeProblems(b), id).toEqual([]);
      expect(validateBuild(b, 10).errors, id).toEqual([]);
      expect(b.routes.map((_, ri) => routeInfo(b, ri).turret), id).toEqual(id === "C" ? [0, 0, 1] : [0, 1]);
    }
    expect([LONG.length, SHORT4.length, SHORT5.length, SHORT8.length]).toEqual([10, 7, 6, 6]);
  });

  it("the breech: an 8+ belt into the heavy gun sets its cadence at 0.72 of its interval, at level 1 on 2 belts and level 2 on 3", () => {
    const [a, b, c] = [intervals(A), intervals(B), intervals(C)];
    // NUM-2 (REQ-BFG-047; was toBeCloseTo(b[0] x FURNACE_LONG_BELT, 9), the interval x0.72): the long belt is a whole rate %
    // (+39) on the gun's speed, rounded half up once: 30 / roundHalfUp(30 / b[0] x 1.39) (SCRAP CANNON 30 -> 41.7 -> 42: 0.714 s)
    expect(FURNACE_LONG_BELT).toBe(39); // NUM-2 (was 0.72, the interval x)
    const breeched = secPer(roundHalfUp(secPer(b[0]) * rateMul(FURNACE_LONG_BELT)));
    expect(a[0]).toBeCloseTo(breeched, 9); // level 1, 2 belts: the long belt's gun is breeched
    expect(c[0]).toBeCloseTo(breeched, 9); // level 2, 3 belts: still, with a short belt beside it into that gun
    expect([secPer(b[0]), secPer(a[0])].map(roundHalfUp)).toEqual([30, 42]); // NUM-2: the speeds, N1's example
    expect([a[1], c[1]]).toEqual([b[1], b[1]]); // the BOMBARD, fed by a short belt only, keeps its interval
    // the rating reads the same rule (deckRating.ts: the longest belt into a gun)
    expect(rateDeck(A).offense).toBeGreaterThan(rateDeck(B).offense);
    console.log(`D5 breech: heavy gun ${b[0].toFixed(3)} s -> ${a[0].toFixed(3)} s with the 10-tile belt (level 1, 2 belts) and ${c[0].toFixed(3)} s (level 2, 3 belts); BOMBARD ${b[1].toFixed(3)} s throughout`);
  });

  it("cinder ride scaling: the long belt's slugs arrive heavier; the KILN deals its slugs in turn, so the long belt carries 1/2 of them at level 1 on 2 belts and 1/3 at level 2 on 3", () => {
    const ta = tally(A, 7, 30), tc = tally(C, 7, 30);
    expect([ta.stalled, tc.stalled]).toEqual([0, 0]);
    // round-robin: each belt within one slug of an even share (bb-0.8.3 D4: a belt adds reach, not slugs)
    for (const c of ta.perRoute) expect(Math.abs(c - ta.produced / 2)).toBeLessThanOrEqual(1);
    for (const c of tc.perRoute) expect(Math.abs(c - tc.produced / 3)).toBeLessThanOrEqual(1);
    // the level 2 KILN's cycle (speed 30: 1 s) stamps more slugs than level 1's (speed 24: 1.25 s): its level, not its belts
    // NUM-2 (REQ-BFG-047): the cycle is 30 / speed (was the interval: 1.25 s and 0.98 s); the stamp timer carries its
    // remainder, so the stamps fall at 0.35 s + k cycles: 24 and 30 in 30 s (were 24 and 31: level 2's 1 s cycle is longer)
    const cycles = (s: number): number => Math.floor((30 - 0.35) / secPer(effectAt("kiln", s).factory!.speed)) + 1; // NUM-2 (was .interval)
    expect([ta.produced, tc.produced]).toEqual([cycles(1), cycles(2)]);
    // the build screen's estimate (walkRoute): base + rideScale x ride; the long ride is worth more on every slug
    const est = (b: Build, ri: number) => walkRoute(b, ri).estimate;
    const [long1, short1, long2, short2] = [est(A, 0), est(A, 1), est(C, 0), est(C, 2)];
    // NUM-1 (N1 2.1): each estimate is whole, base + rideScale x ride rounded half up once (deck.ts payloadDamage), so
    // the gap is the rounded long ride's less the rounded short's (was toBeCloseTo(rideScale x (long ride - short ride), 6))
    const cinder = (ride: number): number => roundHalfUp(AMMO.cinder.base + AMMO.cinder.rideScale * ride);
    expect([long1.dmg, short1.dmg]).toEqual([cinder(long1.ride), cinder(short1.ride)]);
    expect(long1.dmg - short1.dmg).toBe(cinder(long1.ride) - cinder(short1.ride));
    expect(long1.dmg).toBeGreaterThan(short1.dmg);
    // level 2 grows the KILN's cycle only (oracle 6c20deea1363d0bb): every slug on the same belt arrives as heavy as at level 1
    expect(effectAt("kiln", 2).factory!.base).toBeUndefined();
    expect([long2.dmg, short2.dmg]).toEqual([long1.dmg, short1.dmg]);
    console.log(`D5 ride: level 1 2 belts: ${ta.perRoute.join("/")} slugs (long/short), ${long1.dmg.toFixed(2)} vs ${short1.dmg.toFixed(2)} damage on arrival; level 2 3 belts: ${tc.perRoute.join("/")} slugs (long/short/short), ${long2.dmg.toFixed(2)} vs ${short2.dmg.toFixed(2)}`);
  });
});
