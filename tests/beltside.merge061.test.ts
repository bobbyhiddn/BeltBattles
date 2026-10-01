// beltside-062 (ref/BRIEF-beltside-merge-061.md, "New tests"): how the 0.6.1 star perks read once gates are rigs
// (ref/DESIGN-beltside.md §11, P1-P6), and the save-load order of the merged save.ts. Every expected number is written
// out from the catalogue (content.ts levels), never recomputed with the code under test.
import { describe, expect, it } from "vitest";
import { Battle, type Payload } from "../src/sim/battle";
import {
  DISRUPT_TIME, GUARD_FREEZE, GUARD_SKIRT, GUARD_SLOW, ITEMS, RARITY_ARROWS, rigShape, type HarassCause, type ItemDef,
} from "../src/sim/content";
import {
  estimateRoute, hitTier, hitsOfRig, key as K, rigArrows, rigHits, rotField, walkRoute, type Build, type Placed,
} from "../src/sim/deck";
import { rotFacing } from "../src/sim/beltside";
import { effectAt } from "../src/sim/stars";
import { hitLabel } from "../src/screens/build/inspector";
import { abilityText, gist } from "../src/ui/abilityText"; // 0.6.2t: the glossary (it replaced levelLine's shorthand)
import { migrateRun, newRun, type Run } from "../src/game/run";
import { BELTSIDE_TOAST, MIGRATE_CARGO_CAP, MIGRATE_TOAST } from "../src/game/save";
import { SHOWCASE } from "../src/tooling";
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
    expect(rigs).toHaveLength(23);
    for (const d of rigs) {
      for (const s of [1, 2, 3]) {
        const e = effectAt(d.id, s);
        expect(e.shape, `${d.id} ${s}`).toBe(d.shape);
        expect(rigShape(e), `${d.id} ${s}`).toBe(rigShape(d.id));
        expect(rigArrows(e).length, `${d.id} ${s}`).toBe(RARITY_ARROWS[d.rarity]);
      }
    }
  });

  it("the R7 tier comes from the star-resolved effect: OVERDRIVE ★3 (AFTERBURNER's +3 flat) is tier 1, ★1/★2 tier 4", () => {
    expect([1, 2, 3].map((s) => hitTier(effectAt("overdrive", s).gate))).toEqual([4, 4, 1]);
    // on a deck: an X OVERDRIVE and a BRAKE on one tile (the straight bench's tile 2, (4,3)). At ★3 the OVERDRIVE
    // applies at tier 1 (its flat before anything else on the tile) and its speed still resolves by speedWinner:
    // 5x beats the BRAKE's 0.5x (|ln 5| > |ln 0.5|), in the walk and in the battle
    const deck = (s: number): Build => {
      const b = bench();
      b.items.push({ uid: 10, def: "overdrive", x: 3, y: 3, ...st(s) }, rigAt(11, "brake", 5, 3, 3));
      return b;
    };
    for (const [s, tier, flat, speed] of [[1, 4, 0, 3], [3, 1, 3, 5]] as const) {
      const b = deck(s);
      const tile = rigHits(b)[0][2];
      expect(tile.map((h) => [h.uid, h.tier]), `★${s}`).toEqual(tier === 1 ? [[10, 1], [11, 4]] : [[10, 4], [11, 4]]);
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
    for (const [s, copies, mult] of [[1, 8, 0.6], [2, 8, 0.72], [3, 8, 0.85]] as const) {
      const e = estimateRoute(wrap(s), 0);
      expect(e.copies, `★${s}`).toBe(copies);
      const fam = family(wrap(s), 7);
      expect(fam, `★${s} battle`).toHaveLength(copies);
      // estimateRoute and applyHit agree on the split's mult and on the flat it scaled (WHETSTONE's 2 before 3 splits)
      for (const p of fam) {
        expect(p.mult, `★${s} mult`).toBeCloseTo(mult ** 3, 12);
        expect(p.flat, `★${s} flat`).toBeCloseTo(2 * mult ** 3, 12);
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

describe("P3: LONG HAUL priorCap counts prior HITS; the inspector says UP TO 6 HITS", () => {
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

  it("★2 after 8 prior hits counts 6, and the timeline marks the cap (★1 counts all 8, unmarked)", () => {
    const row = (s: number) => walkRoute(snake(s), 0).timeline.find((r) => r.tile === 8)!.hits[0];
    const one = row(1), two = row(2), three = row(3);
    expect([one.prior, one.flat, one.capped]).toEqual([8, 8 * perHit(1), undefined]);
    expect([two.prior, two.flat, two.capped]).toEqual([6, 6 * perHit(2), 6]);
    expect([three.prior, three.flat, three.capped]).toEqual([6, 6 * perHit(3), 6]);
    // 0.6.2t (REQ-BFG-032): the glossary's words; the stat row keeps its + and adds the unit, the cap reads UP TO
    expect(hitLabel(one, "free")).toBe("LONG HAUL +8 DAMAGE (8 HITS BEFORE)");
    expect(hitLabel(two, "free")).toBe("LONG HAUL +12 DAMAGE (UP TO 6 HITS)");
    expect(gist("longhaul", 1)).toBe("1 DAMAGE FOR EACH EARLIER HIT");
    expect(gist("longhaul", 2)).toBe("2 DAMAGE FOR EACH EARLIER HIT, UP TO 6 HITS");
    expect(abilityText("longhaul", 3).sentences[0]).toBe("ADDS 3.5 DAMAGE FOR EACH EARLIER RIG HIT, UP TO 6 HITS.");
    // the battle agrees: every payload past tile 8 carries 8 x 2 (the WHETSTONES) + LONG HAUL ★2 x 6
    for (const p of family(snake(2), 8)) expect(p.flat).toBeCloseTo(8 * 2 + perHit(2) * 6, 9);
  });

  it("a hit counts even from the same tile's tier 1 (R7), and each arrow of one rig counts once (R8)", () => {
    // the straight bench's tile 2: a WHETSTONE (tier 1) from the west, the LONG HAUL (tier 2) from the east
    const same = bench();
    same.items.push(rigAt(10, "whetstone", 3, 3, 1), { uid: 11, def: "longhaul", x: 5, y: 3 });
    const h = walkRoute(same, 0).timeline[0].hits;
    expect(h.map((x) => [x.uid, x.tier])).toEqual([[10, 1], [11, 2]]);
    expect([h[1].prior, h[1].flat]).toEqual([1, perHit(1)]);
    expect(estimateRoute(same, 0).dmg - estimateRoute(bench(), 0).dmg).toBeCloseTo(2 + perHit(1) * 1, 9);
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
    for (const [s, shockTime, jump] of [[1, undefined, undefined], [2, 1.8, 1], [3, 2.8, 1]] as const) {
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
    expect([p.shockTime, p.jump, p.prior]).toEqual([2.8, 1, 2]);
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

describe("P5: OVERDRIVE ★2/★3 guard flags from every hit tile downstream, on every belt hit", () => {
  it("an X OVERDRIVE ★2 at the junction flags both belts it hits, from its first hit tile on", () => {
    const b = SHOWCASE.junction.build();
    const od = b.items.find((p) => p.def === "overdrive")!;
    expect(hitsOfRig(b, od.uid).map((h) => [h.route, h.tile])).toEqual([[0, 2], [0, 4], [1, 1], [1, 3]]);
    for (const [s, flag] of [[1, 0], [2, GUARD_SLOW], [3, GUARD_SLOW | GUARD_FREEZE]] as const) {
      if (s > 1) od.stars = s;
      const bt = new Battle(b, barge(), SEED);
      const g = bt.sides[0].routes.map((r) => r.guard);
      expect(g[0], `★${s} belt 1`).toEqual([0, 0, flag, flag, flag, flag, flag, flag]);
      expect(g[1], `★${s} belt 2`).toEqual([0, flag, flag, flag, flag, flag, flag, flag, flag]);
      expect(g[2], `★${s} belt 3 (not hit)`).toEqual(g[2].map(() => 0));
    }
  });

  // beltside-062-on-061 (DESIGN §13 P13): 0.6.1f keeps BRAKE SHOE at 0.5x at every star, so no catalogue slow out-changes
  // an OVERDRIVE ★2 (4x) any more (only OVERDRIVE ★3's 5x does, and it sets the same flag). The rule is kept with a
  // test-only stub rig at the retired BRAKE ★3's 0.22x (as F5 stubs modules in tests/inspectorLines.test.ts); the
  // numbers are unchanged. The real BRAKE ★3 now loses the tile, and the flag is set all the same.
  it("the flag is set whichever speed wins the tile: a 0.22x slow (the retired BRAKE ★3) out-changes an OVERDRIVE ★2 (4x) there", () => {
    const items = ITEMS as Record<string, ItemDef>;
    items.__slow22 = { id: "__slow22", name: "STUB SLOW", kind: "gate", rarity: "common", price: 3, size: 1, desc: ["A TEST RIG."], gate: { speed: 0.22 } };
    try {
      const b = bench();
      b.items.push({ uid: 10, def: "overdrive", x: 3, y: 3, stars: 2 }, rigAt(11, "__slow22", 5, 3, 3));
      const bt = new Battle(b, barge(), SEED);
      for (let i = 0; i < 60 * 5; i++) bt.step();
      const r = bt.sides[0].routes[0];
      expect(r.speedAt.slice(2)).toEqual([0.22, 0.22, 0.22, 0.22]); // |ln 0.22| > |ln 4|: the slow holds the tile
      expect(r.guard).toEqual([0, 0, GUARD_SLOW, GUARD_SLOW, GUARD_SLOW, GUARD_SLOW]);
    } finally {
      delete items.__slow22;
    }
    expect(Object.keys(ITEMS)).not.toContain("__slow22");
  });

  it("P13: a real BRAKE ★3 (RED-HOT SHOE, 0.5x) now loses that tile to the OVERDRIVE ★2; the flag is set, the +5 flat applies", () => {
    const b = bench();
    b.items.push({ uid: 10, def: "overdrive", x: 3, y: 3, stars: 2 }, rigAt(11, "brake", 5, 3, 3, 3));
    const bt = new Battle(b, barge(), SEED);
    for (let i = 0; i < 60 * 5; i++) bt.step();
    const r = bt.sides[0].routes[0];
    expect(r.speedAt.slice(2)).toEqual([4, 4, 4, 4]); // |ln 4| > |ln 0.5|: the OVERDRIVE holds the tile
    expect(r.guard).toEqual([0, 0, GUARD_SLOW, GUARD_SLOW, GUARD_SLOW, GUARD_SLOW]);
    const hits = walkRoute(b, 0).timeline[0].hits;
    expect(hits.map((h) => [h.uid, h.tier, h.flat ?? 0, h.speed, h.won])).toEqual([[11, 1, 5, 0.5, false], [10, 4, 0, 4, true]]);
  });
});

describe("P6: MANTLET ★3 BULWARK SKIRT guards every rig with a hit on a guarded tile", () => {
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

  it("a rig whose first hit is on another route but which has a hit on a skirt tile is not stalled by shock", () => {
    const b = deck(3, { x: 5, y: 1 });
    expect(hitsOfRig(b, 10).map((h) => [h.route, h.tile])).toEqual([[0, 4], [1, 4]]);
    expect(hitsOfRig(b, 11)).toEqual([]);
    const bt = new Battle(b, barge(), SEED);
    const g = bt.sides[0].gates.find((x) => x.uid === 10)!;
    expect([g.route, g.cellIdx]).toEqual([0, 4]); // the first hit: route 0 has no skirt
    expect(bt.sides[0].routes[0].guard.map((f) => f & GUARD_SKIRT)).toEqual([0, 0, 0, 0, 0]);
    expect(bt.sides[1 - 1].routes[1].guard.map((f) => (f & GUARD_SKIRT ? 1 : 0))).toEqual([0, 0, 0, 1, 1, 1]);
    expect(hit(bt, "gate", 10, -1)).toBe(false);
    expect(g.disrupted).toBe(0);
    expect(hit(bt, "gate", 10, -1, "freeze")).toBe(false); // FULL PLATE's immunities carry to ★3
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
    expect(r.version).toBe(7);
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
