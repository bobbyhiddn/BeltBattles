// beltside-062-on-061 (ref/BRIEF-beltside-merge-061rel.md, "New tests"): how the rest of 0.6.1 meets rigs
// (ref/DESIGN-beltside.md §13): P12 (SPLITTER after the retune), P13 (BRAKE SHOE ★2/★3, a mixed effect), P14 (every
// merge step is still an upgrade on rigs), P15 (pool v2 loads through D3), P16 (one harness), P17 (offline ghosts carry
// stars and rotation) and P18 (RULES_VERSION). Every expected number is written out from the catalogue (content.ts
// levels), never recomputed with the code under test.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Rng, hashSeed } from "../src/core/rng";
import { Battle, type Payload } from "../src/sim/battle";
import { AMMO, BELT_SPEED, ITEMS, RULES_VERSION, TICK } from "../src/sim/content";
import { hitsOfRig, key as K, occupancy, payloadDamage, rigHits, rotField, walkRoute, type Build, type Placed } from "../src/sim/deck";
import { migrateInlineGates, rotFacing } from "../src/sim/beltside";
import { hitLabel } from "../src/screens/build/inspector";
import { validateBuild } from "../src/net/validate";
import { decodeSnapshot, encodeSnapshot, checkSnapshot, SNAPSHOT_VERSION } from "../src/net/snapshot";
import { offlineGhost } from "../src/net/fallback";
import { decodeStarred, decodeStarredRaw, encodeStarred, STAND_IN_POOL_HEROES } from "../src/sim/standInPool";
import { STAND_IN_DATA } from "../src/sim/standInPoolData";
import { decodeStarred as harnessDecode, encodeStarred as harnessEncode } from "../src/sim/harness/standinCode";
import { fullPurseBuild, randomBuild } from "../src/sim/harness/gen";
import { HARNESS_HEROES, heroStartBuild } from "../src/sim/harness/heroes";
import { Shopper } from "../src/sim/harness/shopper";
import { starsOf } from "../src/sim/stars";
import { barge, bench, factoryBench, SEED } from "./arsenal.bench";
import { POOL_NATIVE } from "./beltside.helpers";

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

// ---------------------------------------------------------------- P15: pool v2 loads through D3

describe("P15: stand-in pool v2 loads through the loader's D3 boundary (decodeStarred)", () => {
  it("all 120 pool v2 decks load into a legal build for their day with nothing on a belt; migrated rigs keep their stars; the drops are counted and listed", () => {
    let decks = 0, migrated = 0, moved = 0, starredMoved = 0;
    const drops: string[] = [];
    for (const hero of STAND_IN_POOL_HEROES) {
      for (let day = 1; day <= 10; day++) {
        STAND_IN_DATA.pools[hero]![day - 1][1].forEach((t, i) => {
          const raw = decodeStarredRaw(hero, t[3]); // as generated: gates may stand on belt tiles
          const mig = JSON.parse(JSON.stringify(raw)) as Build;
          const m = migrateInlineGates(mig); // what the loader does, before renumbering
          const loaded = decodeStarred(hero, t[3]);
          decks++;
          expect(validateBuild(loaded, day).errors, `${hero} d${day} #${i}`).toEqual([]);
          const belt = new Set(loaded.routes.flatMap((r) => r.cells)), occ = occupancy(loaded);
          expect([...belt].filter((k) => occ[k].item >= 0), `${hero} d${day} #${i}: machinery on a belt tile`).toEqual([]);
          expect(encodeStarred(loaded), `${hero} d${day} #${i}`).toBe(encodeStarred(mig)); // the loader = raw + D3 (+ renumber)
          if (m.moved.length || m.stranded.length) migrated++;
          moved += m.moved.length;
          for (const mv of m.moved) {
            const before = raw.items.find((p) => p.uid === mv.uid)!, after = mig.items.find((p) => p.uid === mv.uid)!;
            expect(starsOf(after), `${hero} d${day} #${i} uid ${mv.uid}`).toBe(starsOf(before));
            if (starsOf(before) > 1) starredMoved++;
          }
          for (const p of m.stranded) drops.push(`${hero} d${day} #${i}: ${ITEMS[p.def].name}${starsOf(p) > 1 ? ` ★${starsOf(p)}` : ""} from (${p.x},${p.y})`);
        });
      }
    }
    console.log(`P15 pool v2 through D3: ${decks} decks, ${migrated} migrated, ${moved} rigs moved (${starredMoved} of them 2-star), ${drops.length} dropped:\n${drops.join("\n")}`);
    expect(decks).toBe(120);
    expect(starredMoved).toBeGreaterThan(0); // stars really travel with migrated rigs
    // measured on this branch (the D4 native re-bake empties it): 94 decks migrate, 230 rigs move, 63 are dropped
    expect([migrated, moved, drops.length]).toEqual(POOL_NATIVE ? [0, 0, 0] : [94, 230, 63]);
  });

  it("a deck with 2-star rigs and rotations round-trips through encodeStarred / decodeStarred; the loader and the harness codec agree on it", () => {
    // the Furnace's Kiln belt up column 4; each rig works one tile of it: TEMPER 2-star (4,4) from the west, SPLITTER
    // 2-star (4,3) from the east (T, rot 3), BRAKE (4,2) from the west, GALVANIC COIL 2-star (4,5) from the east (L, rot 2)
    const b: Build = {
      hero: "furnace",
      items: [
        { uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "temper", x: 3, y: 4, rot: 1, stars: 2 },
        { uid: 3, def: "splitter", x: 5, y: 3, rot: 3, stars: 2 }, { uid: 4, def: "brake", x: 3, y: 2, rot: 1 },
        { uid: 5, def: "coil", x: 5, y: 5, rot: 2, stars: 2 },
      ],
      routes: [{ factory: 1, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] }],
      mods: [{ uid: 6, def: "calibrate", turret: 0, stars: 2 }], beltCap: 14, hullBonus: 0,
    };
    expect([2, 3, 4, 5].map((u) => hitsOfRig(b, u).map((h) => h.tile))).toEqual([[1], [2], [3], [0]]);
    expect(validateBuild(b, 10).errors).toEqual([]);
    const code = "14 0/kiln64 temper43r1*2 splitter35r3*2 brake23r1 coil55r2*2/1:544434241404/calibrate0*2"; // rotation, then stars
    expect(encodeStarred(b)).toBe(code);
    expect(harnessEncode(b)).toBe(code);
    for (const back of [decodeStarred("furnace", code), decodeStarredRaw("furnace", code), harnessDecode("furnace", code)]) {
      expect(back).toEqual(b);
      expect(JSON.stringify(back)).toBe(JSON.stringify(b)); // same objects, same key order
    }
    // stars before the rotation, or a rotation on a non-rig, is no code (both codecs)
    for (const dec of [decodeStarred, harnessDecode]) {
      expect(() => dec("furnace", code.replace("temper43r1*2", "temper43*2r1"))).toThrow(/bad item/);
      expect(() => dec("furnace", code.replace("kiln64", "kiln64r1"))).toThrow(/not a rig/);
    }
  });
});

// ---------------------------------------------------------------- P16: one harness

describe("P16: one harness (harness v2's buying and merging, H2's placement)", () => {
  it("stars-on harness builds put no machinery on a belt tile and no rig idle; some carry merged rigs", () => {
    let rigs = 0, starred = 0;
    const check = (b: Build, at: string) => {
      const occ = occupancy(b), hits = rigHits(b);
      expect(b.routes.flatMap((r) => r.cells).filter((k) => occ[k].item >= 0), `${at}: machinery on a belt tile`).toEqual([]);
      for (const p of b.items.filter((q) => ITEMS[q.def].kind === "gate")) {
        rigs++;
        if (starsOf(p) > 1) starred++;
        expect(hitsOfRig(b, p.uid, hits).length, `${at}: ${p.def} ${p.uid} idle`).toBeGreaterThan(0);
      }
    };
    for (const hero of HARNESS_HEROES) for (const day of [3, 7, 10]) for (let i = 0; i < 4; i++) {
      check(randomBuild(hero, day, new Rng(hashSeed("p16", hero, day, i)), "on"), `${hero} d${day} #${i}`);
    }
    for (const hero of ["furnace", "weaver"] as const) for (const day of [4, 8]) check(fullPurseBuild(hero, day, hashSeed("p16-fp", hero, day), undefined, 60, "on").build, `full purse ${hero} d${day}`);
    expect(rigs).toBeGreaterThan(100);
    expect(starred).toBeGreaterThan(0);
  });

  it("a merge keeps the surviving rig's cell and rotation (Shopper.placeRig, stars on, through the game's gainModule)", () => {
    const b = heroStartBuild("furnace", 1); // the Kiln's belt up column 4
    const s = new Shopper(b, 60, 10, new Rng(7), "on");
    const first = s.placeRig("temper", 0, 1)!; // H2: west of (4,4), facing it
    const spot = [first.uid, first.x, first.y, first.rot];
    expect(spot).toEqual([first.uid, 3, 4, 1]);
    const second = s.placeRig("temper", 0, 4)!; // put to work on tile 4, but a placed 1-star twin absorbs it
    expect([second.uid, second.x, second.y, second.rot, starsOf(second)]).toEqual([...spot, 2]);
    expect(b.items.filter((p) => p.def === "temper")).toHaveLength(1);
    const third = s.placeRig("temper", 0, 3)!; // no 1-star twin: a new rig beside tile 3
    expect([third.x, third.y, starsOf(third)]).toEqual([3, 2, 1]);
    const fourth = s.placeRig("temper", 0, 5)!; // merges with the third, whose 2-star chains into the first
    expect([fourth.uid, fourth.x, fourth.y, fourth.rot, starsOf(fourth)]).toEqual([...spot, 3]);
    expect(b.items.filter((p) => p.def === "temper")).toHaveLength(1);
    expect(validateBuild(b, 10).errors).toEqual([]);
  });
});

// ---------------------------------------------------------------- P17: offline ghosts carry stars and rotation

describe("P17: offline ghosts carry stars and rotation (v2 snapshots)", () => {
  it("offline ghosts built from 2-star rig decks round-trip through encodeSnapshot, validateBuild and decodeSnapshot unchanged", () => {
    let starRigs = 0;
    for (const hero of ["furnace", "weaver"] as const) for (let day = 1; day <= 10; day++) for (let seed = 0; seed < 6; seed++) {
      const s = offlineGhost(hero, day, seed).snapshot;
      expect(s.v).toBe(SNAPSHOT_VERSION);
      expect(validateBuild(s.build, s.day).errors, `${hero} d${day} #${seed}`).toEqual([]);
      const back = decodeSnapshot(encodeSnapshot(s));
      expect(back).toEqual(s);
      expect(JSON.stringify(back)).toBe(JSON.stringify(s));
      if (s.build.items.some((p) => ITEMS[p.def].kind === "gate" && starsOf(p) === 2 && p.rot !== undefined)) starRigs++;
    }
    expect(starRigs).toBeGreaterThan(0); // pool v2's merged rigs, migrated with their rotation, travel as they are
    // and a hand 2-star rig deck as an offline ghost (the P15 deck: rotations and stars on rigs and a mod)
    const build = decodeStarred("furnace", "14 0/kiln64 temper43r1*2 splitter35r3*2 brake23r1 coil55r2*2/1:544434241404/calibrate0*2");
    const g = checkSnapshot({ v: SNAPSHOT_VERSION, rules: RULES_VERSION, hero: "furnace", day: 10, wins: 3, lives: 2, build, runId: "offline-p17", playerId: "offline-warlord", createdAt: 0 });
    expect(validateBuild(g.build, g.day).errors).toEqual([]);
    expect(decodeSnapshot(encodeSnapshot(g))).toEqual(g);
    expect(decodeSnapshot(encodeSnapshot(g)).build).toEqual(build);
  });
});

// ---------------------------------------------------------------- P18: RULES_VERSION

describe("P18: RULES_VERSION", () => {
  it("is the 0.6.1 release's bb-0.6.1 (BELTSIDE's own bump comes at the 0.6.2 release), and pool v2 was scored under it", () => {
    expect(RULES_VERSION).toBe("bb-0.6.1");
    expect(STAND_IN_DATA.rules).toBe(RULES_VERSION);
  });
});
