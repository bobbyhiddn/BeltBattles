// beltside-062 (ref/BRIEF-beltside-merge-061.md, "New tests"): how the 0.6.1 star perks read once gates are rigs
// (ref/DESIGN-beltside.md §11, P1-P6), and the save-load order of the merged save.ts. Every expected number is written
// out from the catalogue (content.ts levels), never recomputed with the code under test.
import { describe, expect, it } from "vitest";
import { Battle, type Payload } from "../src/sim/battle";
// Y7b2 (the flip): GUARD_FREEZE, GUARD_SKIRT, GUARD_SLOW and ItemDef dropped with the deleted P5 and P6 tests
import { DISRUPT_TIME, ITEMS, RARITY_ARROWS, rigShape, type HarassCause } from "../src/sim/content";
import {
  estimateRoute, hitTier, hitsOfRig, key as K, rigArrows, rigHits, rotField, walkRoute, type Build, type Placed,
} from "../src/sim/deck";
import { rotFacing } from "../src/sim/beltside";
import { effectAt } from "../src/sim/stars";
import { withPlainRigs } from "../src/sim/plainRigs"; // BUMP-1D: the base's rigs with the six plain ones off
import { withShapes2 } from "../src/sim/shapes2"; // BUMP-1D: and the six more shaped ones off
import { hitLabel } from "../src/screens/build/inspector";
import { abilityText, gist } from "../src/ui/abilityText"; // 0.6.2t: the glossary (it replaced levelLine's shorthand)
import { migrateRun, newRun, type Run } from "../src/game/run";
import { BELTSIDE_TOAST, MIGRATE_CARGO_CAP, MIGRATE_TOAST } from "../src/game/save";
import { barge, bench, SEED } from "./arsenal.bench";

const J = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const st = (s: number) => (s > 1 ? { stars: s } : {});
/** A rig at (x, y) whose FIRST arrow points in absolute direction `dir`. */
const rigAt = (uid: number, def: string, x: number, y: number, dir: 0 | 1 | 2 | 3, stars = 1): Placed =>
  ({ uid, def, x, y, ...rotField(def, rotFacing(def, dir)), ...st(stars) });

/** A private Battle.disrupt call on side 0 (as tests/arsenal.modules.test.ts probes MANTLET). */
type Disrupt = { disrupt(s: unknown, t: { kind: string; ref: number; cell: number; x: number; y: number; weight: number }, secs: number, cause: HarassCause): boolean };
const hit = (bt: Battle, kind: string, ref: number, cell: number, cause: HarassCause = "shock") =>
  (bt as unknown as Disrupt).disrupt(bt.sides[0], { kind, ref, cell, x: 0, y: 0, weight: 1 }, DISRUPT_TIME, cause);

/**
 * The payloads ONE stamp becomes in the battle, with every rig online: the factory is held until each rig that
 * hits a belt has commissioned (COMMISSION_BASE + COMMISSION_STEP x its rank on a route, so a deck with 9 rigs waits
 * 6 s), then it stamps once and is frozen again. Every payload that crosses the centre of tile `last` (the route's
 * last hit tile) is recorded once. Nothing acts after `last`, so each recorded payload's mult, flat, burn and shock
 * are final.
 */
function family(b: Build, last: number, route = 0, secs = 110): Payload[] {
  const bt = new Battle(b, barge(), SEED);
  const side = bt.sides[0];
  const seen = new Map<number, Payload>();
  const f = side.factories.find((x) => x.routes.includes(route))!;
  f.timer = 1e9; // held: no stamp before every rig is online
  while (!side.gates.every((g) => g.online || !g.hits.length) && bt.t < secs) {
    bt.step();
    bt.drainEvents();
  }
  expect(side.routes[route].ammo, "nothing stamped while the rigs commission").toHaveLength(0);
  f.timer = 0; // one stamp, now
  while (bt.t < secs && !bt.over) {
    bt.step();
    bt.drainEvents();
    if (f.produced > 0) f.timer = 1e9; // one stamp only
    for (const a of side.routes[route].ammo) if (a.processed >= last && !seen.has(a.p.id)) seen.set(a.p.id, a.p);
  }
  expect(f.produced, "exactly one stamp").toBe(1);
  return [...seen.values()];
}

describe("P1: stars resolve first; shape is kept at every star (R10)", () => {
  it("effectAt keeps `shape` at 1-3 stars for every rig def, so a merge never adds arrows", () => {
    const rigs = Object.values(ITEMS).filter((d) => d.kind === "gate");
    // 0.8.0 I1 M2 (REPORT-P1 section 13): + wave 3's 8 rigs (was 23)
    // BUMP-1D (PLAIN_RIGS and SHAPES2 ship on): + the six plain stat rigs (RASP, SPARK GAP, SCALE GUARD, BALLAST, GRINDSTONE,
    // BRANDING IRON) and the six more shaped rigs (ELBOW GUARD, SAW BAR, SPARK COMB, CINDER HOOK, JAW CRUSHER, PICKAXE): 46 (was 34)
    expect(rigs).toHaveLength(46);
    // the base's 34 are the catalogue with both switches off, as before
    const base = withPlainRigs(() => withShapes2(() => Object.values(ITEMS).filter((d) => d.kind === "gate"), false), false);
    expect(base).toHaveLength(34); // SHAPES-1 flip: + NAIL STRIP, EMBER TROUGH and SPIKE RAIL, the three shaped rigs (was 31)
    for (const d of rigs) {
      for (const s of [1, 2, 3]) {
        const e = effectAt(d.id, s);
        expect(e.shape, `${d.id} ${s}`).toBe(d.shape);
        expect(rigShape(e), `${d.id} ${s}`).toBe(rigShape(d.id));
        expect(rigArrows(e).length, `${d.id} ${s}`).toBe(RARITY_ARROWS[d.rarity]);
      }
    }
  });

  // 0.8.0 B1 M2 (oracle 1cd5224fab866da2 (A)): REDLINE (★2) carries +1 flat, so it is tier 1 like AFTERBURNER
  // Y7b2 (the flip): OVERDRIVE ★2/★3's flats are gone (Y2), so it is tier 4 at every star (was [4, 1, 1]); its speed still
  // resolves the tile by speedWinner at each star. Was "the R7 tier comes from the star-resolved effect: OVERDRIVE ★2
  // (REDLINE's +1) and ★3 (AFTERBURNER's +3 flat) are tier 1, ★1 tier 4"
  it("the R7 tier comes from the star-resolved effect: OVERDRIVE is tier 4 at every star (no flat)", () => {
    expect([1, 2, 3].map((s) => hitTier(effectAt("overdrive", s).gate))).toEqual([4, 4, 4]); // Y7b2 (the flip): was [4, 1, 1]
    // on a deck: an X OVERDRIVE and a BRAKE on one tile (the straight bench's tile 2, (4,3)). At ★3 the OVERDRIVE
    // applies at tier 1 (its flat before anything else on the tile) and its speed still resolves by speedWinner:
    // 5x beats the BRAKE's 0.5x (|ln 5| > |ln 0.5|), in the walk and in the battle. Y7b2 (the flip): tier 4 with no flat at
    // every star; the speeds resolve as before
    const deck = (s: number): Build => {
      const b = bench();
      b.items.push({ uid: 10, def: "overdrive", x: 3, y: 3, ...st(s) }, rigAt(11, "brake", 5, 3, 3));
      return b;
    };
    // NUM-1 (REQ-BFG-047): the flats x10, REDLINE +10 and AFTERBURNER +30 (were +1 and +3)
    // Y7b2 (the flip): ★2 and ★3 were [2, 1, 10, 4] and [3, 1, 30, 5]
    for (const [s, tier, flat, speed] of [[1, 4, 0, 3], [2, 4, 0, 4], [3, 4, 0, 5]] as const) {
      const b = deck(s);
      const tile = rigHits(b)[0][2];
      // Y7b2 (the flip): was tier === 1 ? [[10, 1], [11, 4]] : [[10, 4], [11, 4]] (the same rows; every tier is 4 now)
      expect(tile.map((h) => [h.uid, h.tier]), `★${s}`).toEqual([[10, tier], [11, 4]]);
      const w = walkRoute(b, 0);
      expect(w.timeline).toHaveLength(1);
      const [od, br] = w.timeline[0].hits;
      expect([od.uid, od.flat ?? 0, od.speed, od.won, br.speed, br.won], `★${s}`).toEqual([10, flat, speed, true, 0.5, false]);
      expect(w.speedEnd).toBe(speed);
      const bt = new Battle(b, barge(), SEED);
      for (let i = 0; i < 60 * 5; i++) bt.step();
      expect(bt.sides[0].routes[0].speedAt.slice(2), `★${s}`).toEqual([speed, speed, speed, speed]);
    }
  });
});

// beltside-062-on-061 (DESIGN §13 P12): 0.6.1f retired THREE-WAY (copies 3, 57%) for PERFECT CUT (copies 2, 85%), so a
// split makes one extra copy at every star. The ★3 rows below are measurements the retune moved: the wrap 27 -> 8, the
// 1-hit control 3 -> 2, Decision 3's two ★3 SPLITTERs 9 -> 4 (mult 0.57 -> 0.85). No other number here changed.
describe("P2: SPLITTER, each hit one split; a split makes one extra copy at every star (P12: PERFECT CUT)", () => {
  // A belt wrapped around a T SPLITTER at (5,3), rot 0: its forward, +x and -x arrows land on tiles 5, 3 and 7 of one
  // route (the Kiln's, fed at (6,6), into column 4). A WHETSTONE works tile 1, so the split scales a flat bonus too.
  const WRAP = [K(6, 6), K(6, 5), K(6, 4), K(6, 3), K(6, 2), K(5, 2), K(4, 2), K(4, 3), K(3, 3), K(3, 2), K(3, 1), K(4, 1), K(4, 0)];
  const wrap = (s: number, hits3 = true): Build => {
    const b = bench();
    b.routes = [{ factory: 1, cells: WRAP }];
    b.items.push(rigAt(12, "whetstone", 7, 5, 3));
    // the 1-hit control: the same SPLITTER two cells north, at (5,1), turned (rot 1: +x, back, forward) so only its
    // back arrow lands, on tile 5 ((5,2)). At (5,3) the wrap holds three of its four sides, so every rotation of a T
    // would land at least two arrows there.
    b.items.push(hits3 ? { uid: 10, def: "splitter", x: 5, y: 3, ...st(s) } : { uid: 10, def: "splitter", x: 5, y: 1, rot: 1, ...st(s) });
    return b;
  };

  it("the wrap: three hits on one belt; up to 8 payloads at every star (P12), and the battle makes exactly that many", () => {
    expect(hitsOfRig(wrap(1), 10).map((h) => h.tile)).toEqual([3, 5, 7]);
    expect(hitsOfRig(wrap(1, false), 10).map((h) => h.tile)).toEqual([5]);
    // NUM-1 (REQ-BFG-047): `flat` is the WHETSTONE's 20 (was 2) after the three splits, each taking its whole % of the flat
    // so far, rounded half up once (Battle.applyHit's pct): 20 -> 12 -> 7 -> 4 at 60%, 20 -> 14 -> 10 -> 7 at 72%, 20 -> 17
    // -> 14 -> 12 at 85% (was the fraction 2 x mult^3)
    for (const [s, copies, mult, flat] of [[1, 8, 0.6, 4], [2, 8, 0.72, 7], [3, 8, 0.85, 12]] as const) {
      const e = estimateRoute(wrap(s), 0);
      expect(e.copies, `★${s}`).toBe(copies);
      const fam = family(wrap(s), 7);
      expect(fam, `★${s} battle`).toHaveLength(copies);
      // estimateRoute and applyHit agree on the split's mult, and the flat it scaled (WHETSTONE's 20 before 3 splits) is
      // whole (NUM-1: was toBeCloseTo(2 * mult ** 3, 12))
      for (const p of fam) {
        expect(p.mult, `★${s} mult`).toBeCloseTo(mult ** 3, 12);
        expect(p.flat, `★${s} flat`).toBe(flat);
        expect(p.prior, `★${s} prior`).toBe(4); // the WHETSTONE and three SPLITTER hits
      }
      expect(new Set(fam.map((p) => p.id)).size).toBe(copies);
      // the 1-hit control splits once: 2 payloads at every star (P12)
      expect(estimateRoute(wrap(s, false), 0).copies).toBe(2);
      expect(family(wrap(s, false), 5)).toHaveLength(2);
    }
  });

  it("Decision 3: a second ★3 SPLITTER on the same tile also splits the first one's copies (2 x 2 = 4, P12)", () => {
    // the straight bench's tile 2, (4,3), from the west (rot 1) and from the east (rot 3); each T's other arrows are idle
    const b = (s: number): Build => {
      const d = bench();
      d.items.push({ uid: 10, def: "splitter", x: 3, y: 3, rot: 1, ...st(s) }, { uid: 11, def: "splitter", x: 5, y: 3, rot: 3, ...st(s) });
      return d;
    };
    expect(rigHits(b(3))[0][2].map((h) => h.uid)).toEqual([10, 11]);
    expect([1, 2, 3].map((s) => estimateRoute(b(s), 0).copies)).toEqual([4, 4, 4]);
    const fam = family(b(3), 2);
    expect(fam).toHaveLength(4);
    for (const p of fam) expect(p.mult).toBeCloseTo(0.85 * 0.85, 12);
    const w = walkRoute(b(3), 0);
    expect(w.timeline[0].hits.map((h) => [h.uid, h.split?.copies])).toEqual([[10, 2], [11, 2]]);
  });
});

// Y7b2 (the flip): LONG HAUL's priorCap is gone (Y3), so every star counts all its prior hits and nothing says UP TO. Was
// "P3: LONG HAUL priorCap counts prior HITS; the inspector says UP TO 6 HITS"
describe("P3: LONG HAUL counts prior HITS (no priorCap)", () => {
  // tests/arsenal.modules.test.ts's snake, native: 8 WHETSTONE rigs on tiles 0-7, the LONG HAUL on tile 8
  const WHET: [number, number, 0 | 1 | 2 | 3][] = [[5, 5, 3], [3, 6, 0], [2, 6, 0], [1, 6, 0], [0, 4, 1], [2, 3, 2], [3, 3, 2], [5, 4, 3]];
  const snake = (s: number): Build => {
    const b = bench();
    b.routes = [{ factory: 1, cells: [K(4, 5), K(3, 5), K(2, 5), K(1, 5), K(1, 4), K(2, 4), K(3, 4), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] }];
    WHET.forEach(([x, y, dir], i) => b.items.push(rigAt(20 + i, "whetstone", x, y, dir)));
    b.items.push({ uid: 40, def: "longhaul", x: 5, y: 3, ...st(s) });
    return b;
  };
  /** LONG HAUL's damage per earlier hit at a star (0.6.2 TUNE LONGHAUL: 1 / 2 / 3.5). */
  const perHit = (s: number): number => effectAt("longhaul", s).gate!.perPriorGate!;

  // Y7b2 (the flip): no priorCap, so ★2 and ★3 count all 8 too and nothing marks a cap (rows were [6, 6 x perHit, 6]); the
  // ★2 label and texts lose UP TO 6 HITS; the battle's ★2 flat is x 8. Was "★2 after 8 prior hits counts 6, and the timeline
  // marks the cap (★1 counts all 8, unmarked)"
  it("every star after 8 prior hits counts all 8, and the timeline marks no cap", () => {
    const row = (s: number) => walkRoute(snake(s), 0).timeline.find((r) => r.tile === 8)!.hits[0];
    const one = row(1), two = row(2), three = row(3);
    expect([one.prior, one.flat, one.capped]).toEqual([8, 8 * perHit(1), undefined]);
    expect([two.prior, two.flat, two.capped]).toEqual([8, 8 * perHit(2), undefined]); // Y7b2 (the flip): was [6, 6 * perHit(2), 6]
    expect([three.prior, three.flat, three.capped]).toEqual([8, 8 * perHit(3), undefined]); // Y7b2 (the flip): was [6, 6 * perHit(3), 6]
    // 0.6.2t (REQ-BFG-032): the glossary's words; the stat row keeps its + and adds the unit, the cap reads UP TO
    // NUM-1 (REQ-BFG-047): the numbers x10 (were +8, +12, 1, 2 and 3.5)
    expect(hitLabel(one, "free")).toBe("LONG HAUL +80 DAMAGE (8 HITS BEFORE)");
    expect(hitLabel(two, "free")).toBe("LONG HAUL +160 DAMAGE (8 HITS BEFORE)"); // Y7b2 (the flip): was "LONG HAUL +120 DAMAGE (UP TO 6 HITS)"
    expect(gist("longhaul", 1)).toBe("10 DAMAGE FOR EACH EARLIER HIT");
    expect(gist("longhaul", 2)).toBe("20 DAMAGE FOR EACH EARLIER HIT"); // Y7b2 (the flip): was "20 DAMAGE FOR EACH EARLIER HIT, UP TO 6 HITS"
    // Y7b2 (the flip): was "ADDS 35 DAMAGE FOR EACH EARLIER RIG HIT, UP TO 6 HITS."
    expect(abilityText("longhaul", 3).sentences[0]).toBe("ADDS 35 DAMAGE FOR EACH EARLIER RIG HIT.");
    // the battle agrees: every payload past tile 8 carries 8 x 20 (the WHETSTONES; NUM-1: was 8 x 2) + LONG HAUL ★2 x 6,
    // whole (NUM-1: was toBeCloseTo(..., 9)). Y7b2 (the flip): LONG HAUL ★2 x 8 (was x 6)
    for (const p of family(snake(2), 8)) expect(p.flat).toBe(8 * 20 + perHit(2) * 8);
  });

  it("a hit counts even from the same tile's tier 1 (R7), and each arrow of one rig counts once (R8)", () => {
    // the straight bench's tile 2: a WHETSTONE (tier 1) from the west, the LONG HAUL (tier 2) from the east
    const same = bench();
    same.items.push(rigAt(10, "whetstone", 3, 3, 1), { uid: 11, def: "longhaul", x: 5, y: 3 });
    const h = walkRoute(same, 0).timeline[0].hits;
    expect(h.map((x) => [x.uid, x.tier])).toEqual([[10, 1], [11, 2]]);
    expect([h[1].prior, h[1].flat]).toEqual([1, perHit(1)]);
    // NUM-1 (REQ-BFG-047): the WHETSTONE's 20 (was 2); both estimates are whole, so the difference is exact (was toBeCloseTo(..., 9))
    expect(estimateRoute(same, 0).dmg - estimateRoute(bench(), 0).dmg).toBe(20 + perHit(1) * 1);
    // an L COIL on a corner lands both arrows on one belt: two prior hits for a later LONG HAUL. The belt turns at
    // (3,4); the COIL at (4,3), rot 2 (back and -x), works (4,4) (tile 1) and (3,3) (tile 3) from inside the bend
    const corner = bench();
    corner.routes = [{ factory: 1, cells: [K(4, 5), K(4, 4), K(3, 4), K(3, 3), K(3, 2), K(3, 1), K(4, 1), K(4, 0)] }];
    corner.items.push({ uid: 10, def: "coil", x: 4, y: 3, rot: 2 }, { uid: 11, def: "longhaul", x: 2, y: 1 });
    expect(hitsOfRig(corner, 10).map((x) => x.tile)).toEqual([1, 3]);
    expect(hitsOfRig(corner, 11).map((x) => x.tile)).toEqual([5]); // the II's east arrow; its west one is idle
    const lh = walkRoute(corner, 0).timeline.find((r) => r.hits.some((x) => x.uid === 11))!.hits.find((x) => x.uid === 11)!;
    expect(lh.prior).toBe(2);
  });
});

describe("P4: GALVANIC COIL ★2/★3: shockTime and jump ride on each rig hit", () => {
  it("a payload past the COIL rig carries its stall and SPARK JUMP (★1: neither, so DISRUPT_TIME applies)", () => {
    // NUM-3 (N1 2.2): the stall 2 / 3 s (was the literals 1.8 / 2.8), written out from the catalogue (content.ts levels)
    const lv = (s: 2 | 3) => ITEMS.coil.levels![s]!.gate!;
    for (const s of [2, 3] as const) expect(lv(s).shockTime, `★${s} names a stall`).toBeGreaterThan(0);
    for (const [s, shockTime, jump] of [[1, undefined, undefined], [2, lv(2).shockTime, 1], [3, lv(3).shockTime, 1]] as const) {
      const fam = family(bench([["coil", 4, 3, s]]), 2);
      expect(fam.length).toBe(1);
      expect([fam[0].shock, fam[0].shockTime, fam[0].jump], `★${s}`).toEqual([true, shockTime, jump]);
    }
    // an L COIL working a corner lands both arrows: the longest stall and jump passed still win (no stacking)
    const corner = bench();
    corner.routes = [{ factory: 1, cells: [K(4, 5), K(4, 4), K(3, 4), K(3, 3), K(3, 2), K(3, 1), K(4, 1), K(4, 0)] }];
    corner.items.push({ uid: 10, def: "coil", x: 4, y: 3, rot: 2, stars: 3 }); // P3's corner: tiles 1 and 3
    expect(hitsOfRig(corner, 10).map((x) => x.tile)).toEqual([1, 3]);
    const p = family(corner, 3)[0];
    expect([p.shockTime, p.jump, p.prior]).toEqual([lv(3).shockTime, 1, 2]); // NUM-3: 3 s (was 2.8)
  });

  it("SPARK JUMP picks the nearest targets by centre distance: a struck rig's nearest target is the belt tile it works", () => {
    // the foe (side 0 here) holds one rig beside the straight bench's tile 2; strike that rig with a jump of 1
    const b = bench([["temper", 4, 3, 1]]);
    const bt = new Battle(b, barge(), SEED);
    const side = bt.sides[0];
    const rigT = side.targets.find((t) => t.kind === "gate" && t.ref === 10)!;
    expect([rigT.x, rigT.y]).toEqual([3 * 12 + 6, 3 * 12 + 6]); // the rig is a target at its own cell (R9)
    (bt as unknown as { sparkJump(s: unknown, f: unknown, secs: number, n: number): void }).sparkJump(side, rigT, 1.8, 1);
    expect(side.routes[0].cellDisrupt).toEqual([0, 0, 1.8, 0, 0, 0]); // tile 2, 12 px east, before anything else
  });
});

// Y7b2 (the flip): OVERDRIVE ★2/★3's guard flags are gone (Y2), and BRAKE SHOE ★2/★3 lost their flats and slow to 40% / 30%
// (Y3). The tests "an X OVERDRIVE ★2 at the junction flags both belts it hits, from its first hit tile on" and "the flag is
// set whichever speed wins the tile: a 0.22x slow (the retired BRAKE ★3) out-changes an OVERDRIVE ★2 (4x) there" are deleted
// (each checked the guard flags only); P13's two keep their speed and walk checks, re-pinned. Was "P5: OVERDRIVE ★2/★3 guard
// flags from every hit tile downstream, on every belt hit"
describe("P5: OVERDRIVE and a BRAKE ★3 on one tile (P13): the bigger speed change wins; no guard flags", () => {
  // Y7b2 (the flip): BRAKE ★3 is 0.3x with no flat (was RED-HOT SHOE, 0.5x, +50), OVERDRIVE ★2 sets no flag and adds no flat
  // (was GUARD_SLOW from tile 2 and REDLINE's +10, tier 1). Was "P13: a real BRAKE ★3 (RED-HOT SHOE, 0.5x) now loses that tile
  // to the OVERDRIVE ★2; the flag is set, the +5 flat applies"
  it("P13: a real BRAKE ★3 (0.3x) loses that tile to the OVERDRIVE ★2 (4x); no flag, no flat", () => {
    const b = bench();
    b.items.push({ uid: 10, def: "overdrive", x: 3, y: 3, stars: 2 }, rigAt(11, "brake", 5, 3, 3, 3));
    const bt = new Battle(b, barge(), SEED);
    for (let i = 0; i < 60 * 5; i++) bt.step();
    const r = bt.sides[0].routes[0];
    expect(r.speedAt.slice(2)).toEqual([4, 4, 4, 4]); // |ln 4| > |ln 0.3| (Y7b2: was 0.5): the OVERDRIVE holds the tile
    expect(r.guard).toEqual([0, 0, 0, 0, 0, 0]); // Y7b2 (the flip): was [0, 0, GUARD_SLOW, GUARD_SLOW, GUARD_SLOW, GUARD_SLOW]
    const hits = walkRoute(b, 0).timeline[0].hits;
    // 0.8.0 B1 M2 (oracle 1cd5224fab866da2 (A)): REDLINE's +1 makes it tier 1, so it comes first; speeds and flags as before
    // NUM-1 (REQ-BFG-047): the flats x10, REDLINE +10 and RED-HOT SHOE +50 (were +1 and +5)
    // Y7b2 (the flip): was [[10, 1, 10, 4, true], [11, 1, 50, 0.5, false]]
    expect(hits.map((h) => [h.uid, h.tier, h.flat ?? 0, h.speed, h.won])).toEqual([[10, 4, 0, 4, true], [11, 4, 0, 0.3, false]]);
  });

  // 0.8.0 B1 M2 (oracle 1cd5224fab866da2 (A)): the case P13 was written for, kept at ★1 (a tier-4 OVERDRIVE with no flat)
  // Y7b2 (the flip): BRAKE ★3's 0.3x now out-changes OVERDRIVE ★1's 3x (|ln 0.3| > |ln 3|; at 0.5x it lost), and it adds no
  // flat (was RED-HOT SHOE's +50). Was "P13 at ★1: a BRAKE ★3 (RED-HOT SHOE, 0.5x) loses that tile to the OVERDRIVE ★1 (3x); no
  // flag, the +5 flat applies"
  it("P13 at ★1: a BRAKE ★3 (0.3x) wins that tile from the OVERDRIVE ★1 (3x); no flag, no flat", () => {
    const b = bench();
    b.items.push({ uid: 10, def: "overdrive", x: 3, y: 3 }, rigAt(11, "brake", 5, 3, 3, 3));
    const bt = new Battle(b, barge(), SEED);
    for (let i = 0; i < 60 * 5; i++) bt.step();
    const r = bt.sides[0].routes[0];
    expect(r.speedAt.slice(2)).toEqual([0.3, 0.3, 0.3, 0.3]); // Y7b2 (the flip): was [3, 3, 3, 3] (|ln 3| > |ln 0.5|)
    expect(r.guard).toEqual([0, 0, 0, 0, 0, 0]);
    const hits = walkRoute(b, 0).timeline[0].hits;
    // NUM-1 (REQ-BFG-047): RED-HOT SHOE's flat x10, +50 (was +5)
    // Y7b2 (the flip): was [[11, 1, 50, 0.5, false], [10, 4, 0, 3, true]]
    expect(hits.map((h) => [h.uid, h.tier, h.flat ?? 0, h.speed, h.won])).toEqual([[10, 4, 0, 3, false], [11, 4, 0, 0.3, true]]);
  });
});

// Y7b2 (the flip): a guarded tile's rigs no longer share MANTLET's immunity (Y2), so the test "a rig whose first hit is on
// another route but which has a hit on a skirt tile is not stalled by shock" is deleted (it checked that sharing). Was "P6:
// MANTLET ★3 BULWARK SKIRT guards every rig with a hit on a guarded tile"
describe("P6: MANTLET's guarded tiles and the rigs that work them", () => {
  // Two routes: 0 is the STAMP PRESS's belt, which ends short of any intake (no skirt), and 1 is the Kiln's belt into
  // turret 0 (MANTLET ★3 there: its last 3 tiles, 3-5, are the skirt). A LONG HAUL (II) at (5,1) works route 0's tile
  // 4 with its east arrow and route 1's tile 4 with its west one: its FIRST hit (route, then tile order) is off the
  // skirt, on the other route.
  const deck = (mantlet: number, at: { x: number; y: number }): Build => ({
    hero: "furnace", mods: [{ uid: 30, def: "mantlet", turret: 0, ...st(mantlet) }], beltCap: 30, hullBonus: 5000,
    items: [
      { uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "press", x: 6, y: 6 },
      { uid: 10, def: "longhaul", x: at.x, y: at.y }, { uid: 11, def: "temper", x: 8, y: 9 }, // uid 11: IDLE
    ],
    routes: [
      { factory: 2, cells: [K(6, 5), K(6, 4), K(6, 3), K(6, 2), K(6, 1)] },
      { factory: 1, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] },
    ],
  });

  // 0.6.2 FB-B: a ★2 MANTLET (FULL PLATE) now shields the intake tile (5) only, so this rig (tile 4) still stalls below ★3
  it("the same rig moved off the skirt is stalled; an IDLE rig is stalled; below ★3 a rig on tile 4 is not skirted", () => {
    const off = new Battle(deck(3, { x: 5, y: 3 }), barge(), SEED); // route 0's tile 2 and route 1's tile 2
    expect(off.sides[0].gates.find((x) => x.uid === 10)!.hits.map((h) => [h.route, h.tile])).toEqual([[0, 2], [1, 2]]);
    expect(hit(off, "gate", 10, -1)).toBe(true);
    expect(off.sides[0].gates.find((x) => x.uid === 10)!.disrupted).toBe(DISRUPT_TIME);
    const on = new Battle(deck(3, { x: 5, y: 1 }), barge(), SEED);
    expect(hit(on, "gate", 11, -1)).toBe(true); // IDLE: never skirted
    for (const s of [1, 2]) expect(hit(new Battle(deck(s, { x: 5, y: 1 }), barge(), SEED), "gate", 10, -1), `★${s}`).toBe(true);
  });
});

describe("save.ts: 0.6.1r's migrateRun (the schema) runs first, then BELTSIDE's beltsideRun (D3)", () => {
  it("a v6 save: fuseAll merges its cargo twins and N6 mends lastMerchants BEFORE the boxed inline gate is migrated", () => {
    const run = newRun("furnace", 42, "me");
    run.build = {
      hero: "furnace", mods: [], beltCap: 30, hullBonus: 0,
      items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 200, def: "whetstone", x: 4, y: 4 }, { uid: 201, def: "coil", x: 3, y: 4 }, { uid: 202, def: "brake", x: 5, y: 4 }],
      routes: [{ factory: 1, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] }],
    };
    // cargo is full (4 = MIGRATE_CARGO_CAP) until the schema's fuseAll merges the two TEMPERs
    run.inventory = [{ uid: 300, def: "temper" }, { uid: 301, def: "temper" }, { uid: 302, def: "grease" }, { uid: 303, def: "longhaul" }];
    expect(run.inventory).toHaveLength(MIGRATE_CARGO_CAP);
    const raw = J(run) as unknown as Record<string, unknown>;
    raw.version = 6;
    raw.fuseFx = [];
    raw.lastMerchants = "tinker"; // not an array: 0.6.1r N6 reads it as none
    const gold = run.gold;
    const r = migrateRun(raw) as Run;
    expect(r.version).toBe(8); // NUM-1: save v8 (save.ts v7to8)
    expect(r.lastMerchants).toEqual([]);
    // the schema ran first: the TEMPERs merged (cargo 3), so the stranded WHETSTONE (boxed in by belt, COIL and BRAKE)
    // went to cargo. The other order would have refunded it (cargo still at the cap) and then merged the TEMPERs.
    expect(r.inventory.map((i) => [i.def, i.stars ?? 1]).sort()).toEqual([["grease", 1], ["longhaul", 1], ["temper", 2], ["whetstone", 1]]);
    expect(r.gold).toBe(gold);
    expect(r.build.items.map((p) => p.uid)).toEqual([1, 201, 202]);
    expect(r.fuseFx).toEqual([MIGRATE_TOAST, BELTSIDE_TOAST]); // the schema's toast, then BELTSIDE's
    // and the loaded run is stable: a second load changes nothing
    const again = migrateRun(J({ ...r, fuseFx: [] })) as Run;
    expect(again.build).toEqual(r.build);
    expect(again.inventory).toEqual(r.inventory);
  });
});
