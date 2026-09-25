// beltside-062-on-061 (ref/BRIEF-beltside-merge-061rel.md, "New tests"): how the rest of 0.6.1 meets rigs
// (ref/DESIGN-beltside.md §13): P12 (SPLITTER after the retune), P13 (BRAKE SHOE ★2/★3, a mixed effect) and P14 (every
// merge step is still an upgrade on rigs). Every expected number is written out from the catalogue (content.ts levels),
// never recomputed with the code under test.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Battle, type Payload } from "../src/sim/battle";
import { AMMO, BELT_SPEED, ITEMS, TICK } from "../src/sim/content";
import { hitsOfRig, key as K, payloadDamage, rigHits, rotField, walkRoute, type Build, type Placed } from "../src/sim/deck";
import { migrateInlineGates, rotFacing } from "../src/sim/beltside";
import { hitLabel } from "../src/screens/build/inspector";
import { barge, bench, factoryBench, SEED } from "./arsenal.bench";

const st = (s: number) => (s > 1 ? { stars: s } : {});
/** A rig at (x, y) whose FIRST arrow points in absolute direction `dir` (0 up, 1 east, 2 down, 3 west). */
const rig = (uid: number, def: string, x: number, y: number, dir: 0 | 1 | 2 | 3, stars = 1): Placed =>
  ({ uid, def, x, y, ...rotField(def, rotFacing(def, dir)), ...st(stars) });

/**
 * The payloads ONE stamp of factory `uid` becomes in the battle (tests/beltside.merge061.test.ts's family): the factory
 * is held until every rig with a hit is online, stamps once, and every payload crossing the centre of tile `last` of
 * route 0 is recorded once. Nothing acts after `last`, so each payload's mult and flat are final.
 */
function family(b: Build, last: number, uid = 1, secs = 110): Payload[] {
  const bt = new Battle(b, barge(), SEED);
  const side = bt.sides[0];
  const seen = new Map<number, Payload>();
  const f = side.factories.find((x) => x.uid === uid)!;
  f.timer = 1e9;
  while (!side.gates.every((g) => g.online || !g.hits.length) && bt.t < secs) {
    bt.step();
    bt.drainEvents();
  }
  f.timer = 0;
  while (bt.t < secs && !bt.over) {
    bt.step();
    bt.drainEvents();
    if (f.produced > 0) f.timer = 1e9;
    for (const a of side.routes[0].ammo) if (a.processed >= last && !seen.has(a.p.id)) seen.set(a.p.id, a.p);
  }
  expect(f.produced, "exactly one stamp").toBe(1);
  return [...seen.values()];
}

/** The first payload of factory `uid` to reach turret 0, one stamp on an empty belt with every rig online: its
 *  stamp-to-chamber seconds, damage at load and flat (the walk's single payload, measured in the battle). */
function firstLoad(b: Build, uid: number): { time: number; dmg: number; flat: number } {
  const bt = new Battle(b, barge(), SEED);
  const side = bt.sides[0];
  const f = side.factories.find((x) => x.uid === uid)!;
  f.timer = 1e9;
  while (!side.gates.every((g) => g.online || !g.hits.length)) {
    bt.step();
    bt.drainEvents();
  }
  f.timer = 0;
  const born = new Map<number, number>();
  while (bt.t < 60 && !bt.over) {
    bt.step();
    bt.drainEvents();
    if (f.produced > 0) f.timer = 1e9;
    for (const r of side.routes) for (const a of r.ammo) if (!born.has(a.p.id)) born.set(a.p.id, bt.t);
    const p = side.turrets[0].stack[0];
    if (p) {
      const ad = AMMO[p.ammo];
      return { time: bt.t - born.get(p.id)!, dmg: payloadDamage(p.base ?? ad.base, ad.rideScale, p.ride, p.mult, p.flat), flat: p.flat };
    }
  }
  throw new Error("no payload reached turret 0 within 60 s");
}

// ---------------------------------------------------------------- P12: SPLITTER after the retune

const MULT: Record<number, number> = { 1: 0.6, 2: 0.72, 3: 0.85 }; // SPLITTER ★1 / ★2 CLEAN CUT / ★3 PERFECT CUT

/** tests/beltside.merge061.test.ts's P2 wrap: the Kiln (bench(), fed at (6,6)) on one belt wrapped round a T SPLITTER at
 *  (5,3), rot 0, whose forward, +x and -x arrows land on tiles 5, 3 and 7; a WHETSTONE works tile 1. */
const WRAP = [K(6, 6), K(6, 5), K(6, 4), K(6, 3), K(6, 2), K(5, 2), K(4, 2), K(4, 3), K(3, 3), K(3, 2), K(3, 1), K(4, 1), K(4, 0)];
function wrap(s: number): Build {
  const b = bench();
  b.routes = [{ factory: 1, cells: WRAP }];
  b.items.push(rig(12, "whetstone", 7, 5, 3), { uid: 10, def: "splitter", x: 5, y: 3, ...st(s) });
  return b;
}

describe("P12: SPLITTER after the retune (PERFECT CUT): one split, one extra copy, at every star", () => {
  it("one SPLITTER hit makes 2 payloads at 60% / 72% / 85% (★1-★3), in the walk and in the battle", () => {
    for (const s of [1, 2, 3]) {
      const b = bench([["splitter", 4, 3, s]]); // the rig at (3,3), facing east: tile 2, (4,3)
      expect(hitsOfRig(b, 10).map((h) => h.tile), `★${s}`).toEqual([2]);
      const w = walkRoute(b, 0);
      expect(w.timeline.map((r) => r.tile)).toEqual([2]);
      expect(w.timeline[0].hits.map((h) => [h.uid, h.tier, h.split])).toEqual([[10, 3, { copies: 2, mult: MULT[s] }]]);
      expect(hitLabel(w.timeline[0].hits[0], false)).toBe(`SPLITTER X2 AT ${Math.round(MULT[s] * 100)}%`);
      expect(w.estimate.copies, `★${s} walk`).toBe(2);
      const fam = family(b, 2);
      expect(fam, `★${s} battle`).toHaveLength(2);
      for (const p of fam) {
        expect(p.mult, `★${s}`).toBeCloseTo(MULT[s], 12);
        expect(p.copy).toBe(true);
      }
    }
  });

  it("a belt wrapped around a T SPLITTER makes 8 payloads at every star (2 x 2 x 2), in the battle and in the walk", () => {
    for (const s of [1, 2, 3]) {
      const b = wrap(s);
      expect(hitsOfRig(b, 10).map((h) => h.tile)).toEqual([3, 5, 7]);
      const w = walkRoute(b, 0);
      const splits = w.timeline.flatMap((r) => r.hits.filter((h) => h.uid === 10).map((h) => [r.tile, h.split]));
      expect(splits, `★${s} walk`).toEqual([3, 5, 7].map((t) => [t, { copies: 2, mult: MULT[s] }]));
      expect(w.estimate.copies, `★${s} walk`).toBe(8);
      const fam = family(b, 7);
      expect(fam, `★${s} battle`).toHaveLength(8);
      expect(new Set(fam.map((p) => p.id)).size).toBe(8);
      for (const p of fam) {
        expect(p.mult, `★${s} mult`).toBeCloseTo(MULT[s] ** 3, 12);
        expect(p.flat, `★${s} flat`).toBeCloseTo(2 * MULT[s] ** 3, 12); // the WHETSTONE's 2, scaled by each split
      }
    }
  });
});

// ---------------------------------------------------------------- P13: BRAKE SHOE ★2/★3 is a mixed effect

const HEAT: Record<number, number> = { 1: 0, 2: 2, 3: 5 }; // BRAKE ★1 / ★2 HOT SHOE / ★3 RED-HOT SHOE flat

describe("P13: BRAKE SHOE ★2/★3 (HOT SHOE, RED-HOT SHOE): the flat at tier 1, the half speed through speedWinner", () => {
  it("★2 and ★3 add +2 and +5 flat at tier 1 (a SPLITTER on the same tile scales it) and run the belt at 0.5x; the label names the flat", () => {
    for (const s of [1, 2, 3]) {
      // the BRAKE from the west and a ★1 SPLITTER from the east, both on the bench's tile 2 (4,3)
      const b = bench([["brake", 4, 3, s]]);
      b.items.push(rig(11, "splitter", 5, 3, 3));
      expect([hitsOfRig(b, 10), hitsOfRig(b, 11)].map((hs) => hs.map((h) => h.tile))).toEqual([[2], [2]]);
      const w = walkRoute(b, 0);
      const row = w.timeline[0];
      const brake = row.hits.find((h) => h.uid === 10)!;
      // R7: ★1 is a pure speed hit (tier 4, after the split); ★2/★3's flat puts the whole hit at tier 1 (P1)
      expect(row.hits.map((h) => h.uid), `★${s}`).toEqual(s === 1 ? [11, 10] : [10, 11]);
      expect([brake.tier, brake.flat ?? 0, brake.speed, brake.won], `★${s}`).toEqual([s === 1 ? 4 : 1, HEAT[s], 0.5, true]);
      expect([row.speed, w.speedEnd]).toEqual([0.5, 0.5]);
      expect(hitLabel(brake, false), `★${s}`).toBe(s === 1 ? "BRAKE SHOE 0.5X" : `BRAKE SHOE +${HEAT[s]}`);
      // the battle: both payloads of the split carry the heat scaled by the SPLITTER (60%), and the tile runs at 0.5x
      const fam = family(b, 2);
      expect(fam).toHaveLength(2);
      for (const p of fam) expect([+p.flat.toFixed(12), +p.mult.toFixed(12)], `★${s}`).toEqual([+(HEAT[s] * 0.6).toFixed(12), 0.6]);
      const bt = new Battle(b, barge(), SEED);
      for (let i = 0; i < 60 * 5; i++) bt.step();
      expect(bt.sides[0].routes[0].speedAt.slice(2), `★${s}`).toEqual([0.5, 0.5, 0.5, 0.5]);
    }
    // the half speed is the same at every star: the same seconds from stamp to chamber
    const t = [1, 2, 3].map((s) => walkRoute(bench([["brake", 4, 3, s]]), 0).estimate.time);
    expect([t[1], t[2]]).toEqual([t[0], t[0]]);
  });

  it("the walk and the battle agree: stamp-to-chamber time and damage at load, ★1-★3", () => {
    for (const s of [1, 2, 3]) {
      const b = bench([["brake", 4, 3, s]]);
      const w = walkRoute(b, 0).estimate;
      const f = firstLoad(b, 1);
      expect(f.flat, `★${s}`).toBe(HEAT[s]);
      expect(f.time, `★${s}: stamp to chamber`).toBeCloseTo(w.time, 1);
      expect(f.dmg, `★${s}: damage`).toBeCloseTo(w.dmg, 1);
    }
  });

  it("on a slag belt the flat still applies and the speed does not (P8): the walk, the battle and the label agree", () => {
    /** SLAG POT alone on the factory bench's second intake; the BRAKE at (4,3) works tile 3, (5,3), from the west. */
    const slag = (s: number | null): Build => {
      const b = factoryBench("slagpot", 1, { only: true });
      if (s) b.items.push(rig(20, "brake", 4, 3, 1, s));
      return b;
    };
    const none = walkRoute(slag(null), 0);
    const bare = firstLoad(slag(null), 7);
    for (const s of [1, 2, 3]) {
      const b = slag(s);
      expect(hitsOfRig(b, 20).map((h) => h.tile)).toEqual([3]);
      const w = walkRoute(b, 0);
      const h = w.timeline[0].hits[0];
      expect([w.fixed, w.speedEnd, w.timeline[0].speed], `★${s}`).toEqual([0.75, 0.75, 0.75]);
      expect([h.tier, h.flat ?? 0, h.speed, h.won], `★${s}`).toEqual([s === 1 ? 4 : 1, HEAT[s], 0.5, false]);
      expect(hitLabel(h, w.locked || w.fixed !== undefined), `★${s}`).toBe(s === 1 ? "BRAKE SHOE 0.5X (LOCKED)" : `BRAKE SHOE +${HEAT[s]}`);
      expect(w.estimate.time, `★${s}: no slower`).toBeCloseTo(none.estimate.time, 12);
      expect(w.estimate.dmg, `★${s}: + the heat`).toBeCloseTo(none.estimate.dmg + HEAT[s], 9);
      const f = firstLoad(b, 7);
      expect(f.flat, `★${s}`).toBe(HEAT[s]);
      expect(f.time, `★${s}: slag's time, in the battle`).toBeCloseTo(bare.time, 9);
      expect(f.time, `★${s}: the walk agrees`).toBeCloseTo(w.estimate.time, 1);
      expect(f.dmg, `★${s}: damage at load`).toBeCloseTo(w.estimate.dmg, 1);
      // slag rides at exactly 0.75 x BELT_SPEED on every tick in the battle
      const bt = new Battle(b, barge(), SEED);
      const r = bt.sides[0].routes[0];
      const last = new Map<number, number>(), v = new Set<number>();
      while (bt.t < 15 && !bt.over) {
        bt.step();
        bt.drainEvents();
        for (const a of r.ammo) {
          const prev = last.get(a.p.id);
          if (prev !== undefined && !a.blocked && a.s > prev) v.add(+((a.s - prev) / TICK).toFixed(6));
          last.set(a.p.id, a.s);
        }
      }
      expect([...v], `★${s}`).toEqual([BELT_SPEED * 0.75]);
    }
  });
});

// ---------------------------------------------------------------- P14: every merge step is still an upgrade on rigs

describe("P14: the retuned rows fight on native rigs, each rig working exactly its old tile", () => {
  // tests/arsenal.decks.test.ts's guard (KNOWN_FALLS stays empty) and its 3% rule pass on this branch unchanged, so no
  // BELTSIDE_FALLS list was needed. This pins the premise P14 rests on for the two rows 0.6.1f retuned: BRAKE SHOE in
  // par/furnace/6 (native: D3 plus arsenal.decks.test.ts's hand port) and SPLITTER on its bench. Only R9 targeting can
  // move those rows, never R7/R8 multi-hits.
  const par = JSON.parse(readFileSync(new URL("./fixtures/golden-060/par.json", import.meta.url), "utf8")) as { decks: Record<string, Build> };
  it("BRAKE SHOE ★1-★3 in par/furnace/6 and SPLITTER ★1-★3 on its bench: one hit each, on the gate's old tile", () => {
    const inline = par.decks["par/furnace/6"];
    const brake = inline.items.find((p) => p.def === "brake")!;
    for (const s of [1, 2, 3]) {
      const b = JSON.parse(JSON.stringify(inline)) as Build;
      migrateInlineGates(b);
      // arsenal.decks.test.ts's HAND port: the BRAKE takes (3,3) facing up, the LONG HAUL (3,1)
      b.items = b.items.filter((p) => p.uid !== 9011 && p.uid !== 9012);
      b.items.push({ uid: 9011, def: "brake", x: 3, y: 3, ...st(s) }, { uid: 9012, def: "longhaul", x: 3, y: 1 });
      const hits = rigHits(b);
      expect(hitsOfRig(b, brake.uid, hits).map((h) => b.routes[h.route].cells[h.tile]), `brake ★${s}`).toEqual([K(brake.x, brake.y)]);
      for (const g of inline.items.filter((p) => ITEMS[p.def].kind === "gate")) {
        expect(hitsOfRig(b, g.uid, hits).map((h) => b.routes[h.route].cells[h.tile]), `${g.def} ${g.uid}`).toEqual([K(g.x, g.y)]);
      }
      const sp = bench([["splitter", 4, 3, s]], [], 0);
      expect(hitsOfRig(sp, 10).map((h) => h.cell), `splitter ★${s}`).toEqual([K(4, 3)]);
    }
  });
});
