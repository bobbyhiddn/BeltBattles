// PLAIN-1 (REQ-BFG-084; BRIEF-PLAIN1 step 2, cap's rulings P1-P3): the six plain stat rigs behind PLAIN_RIGS (ON since bb-0.11.0:
// BUMP-1D turned it on with SHAPES2 and LONG_RUN; the off world is run explicitly, withPlainRigs(fn, false)).
// Off: nothing sees them, and the pools and offers are the base's (a digest measured at plain1-base 8e90083). On: the
// shared pool with the commons in day 1's; merging and selling as any rig; one hit per arrow on a belt tile; SPARK GAP's
// STUN seconds; BALLAST's max hull (and its IDLE case); SCALE GUARD's slug PLATE reaching the ship at the gun.
import { describe, expect, it } from "vitest";
import { HEROES, ITEMS, buyableModules, sellValue } from "../src/sim/content";
import { Battle, type Payload } from "../src/sim/battle";
import { rigArrows, rigHits, routeInfo, type Build } from "../src/sim/deck";
import { effectAt, fusible } from "../src/sim/stars";
import { plateFor } from "../src/sim/races/bastion";
import { dayMulTenths, scaleTenths, withHullScale } from "../src/sim/hullScale";
import { seatDay, drawWares } from "../src/game/wares";
import { newRun } from "../src/game/run";
import { gainModule } from "../src/game/fuse";
import { overclocked } from "../src/sim/overclock";
import { PLAIN_DEFS, PLAIN_RIGS, PLAIN_RIG_IDS, isPlainRig, plainRigsRules, setPlainRigs, withPlainRigs } from "../src/sim/plainRigs";
import { withShapes2 } from "../src/sim/shapes2";
import { SHAPES_IDS } from "../src/sim/shapes"; // BUMP-1F (F1): SHAPES' three sit behind PLAIN_RIGS' six in the canonical order
import { GATES_IDS, withGates } from "../src/sim/gates"; // BUMP-1F (GATES default): the base's world has none of the three converters either
import { SCALE_IDS, SCALE_RIGS, scaleRules, withScaleRigs } from "../src/sim/scale"; // BUMP-1E: the switch ships on; the base's digest has the seven out too
import { K, SEED, barge, furnaceBench, item, withItem } from "./wave3.helpers";
import { pastTilePlain, poolDigest } from "./plain1.helpers";

/** poolDigest() at plain1-base 8e90083 (tests/plain1.helpers.ts run on a git-archive export of the base, 2026-10-10) was
 *  c238f90eb95f479c. PLAIN-1F (M1): re-pinned by cause, the base moved to c099 (SHAPES-1's catalogue and every other
 *  c099 change to the catalogue, the pools and the first shops): poolDigest() at plain1f-base fe799f6 (c099-cntday2), the
 *  same helper run on a git-archive export of it, 2026-10-13. BUMP-1D: the digest of that world, which has neither PLAIN_RIGS'
 *  six nor SHAPES2's: read here with both off (`off` below), since the release ships both on. */
const BASE_POOL_DIGEST = "8fa1ab05b542bcd7";

const on = <T>(fn: () => T): T => withPlainRigs(fn);
/** BUMP-1D: both switches ship on; the world these tests measured as shipped (and the digest's world) has PLAIN_RIGS and SHAPES2 off.
 *  BUMP-1E: and SCALE_RIGS ships on (bb-0.12.0), its seven ids the LAST keys of ITEMS (scale.ts: after SHAPES2's six), so the scaling switch is the
 *  OUTERMOST of the nest: it goes off first and comes back last (the ITEMS key-order rule: a lone withShapes2 / withPlainRigs off-and-on puts their ids
 *  behind the seven, and every seeded draw after it differs). That is also the world the digest was measured in (the catalogue before the twelve AND the
 *  seven): was withShapes2(() => withPlainRigs(fn, false), false), which left the seven in ITEMS, the pool and every stock (digest be5e26108cbff73b). */
// BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), cause: GATES default; REQ-BFG-052): GATES ships on (bb-0.13.0), and the base's world (the digest's) has none of the three converters, so the gates
// switch is off too, the OUTERMOST of the nest (its three are the last keys of ITEMS: off first, back last). BASE_POOL_DIGEST is NOT moved: with the three out, the digest is the base's.
// Was: withScaleRigs(() => withShapes2(() => withPlainRigs(fn, false), false), false)
const off = <T>(fn: () => T): T => withGates(() => withScaleRigs(() => withShapes2(() => withPlainRigs(fn, false), false), false), false);
/** FURNACE's bench with one more belt-side item. */
const bench = (...more: ReturnType<typeof item>[]): Build => more.reduce((b, p) => withItem(b, p), furnaceBench());
// PLAIN-1F (M1): `wins` is Battle's readonly [number, number] (it was already at plain1-base); undefined reads as the 0
// PLAIN-1 passed (wins?.[side] ?? 0; no record), so the numbers are unchanged and typecheck:tests loses the error
const maxHull = (b: Build, day?: number): number => new Battle(b, barge(), SEED, undefined, day).sides[0].hull.max;

describe("PLAIN_RIGS off (P1): nothing sees the six", () => {
  // BUMP-1D: was "the switch is declared off, as the base declares NPC_DAY, HULL_SCALE and LADDER_FIX": it is declared ON now,
  // as those three are since the hull release; the off world is run explicitly
  it("the switch is declared ON since BUMP-1D (bb-0.11.0), as the base declares NPC_DAY, HULL_SCALE and LADDER_FIX", () => {
    expect(PLAIN_RIGS).toBe(true); // BUMP-1D: was false
    expect(plainRigsRules()).toBe(true); // BUMP-1D: was false
    expect(PLAIN_RIG_IDS).toEqual(["rasp", "sparkgap", "scaleguard", "ballast", "grindstone", "brandingiron"]);
    for (const id of PLAIN_RIG_IDS) {
      expect(Object.prototype.hasOwnProperty.call(ITEMS, id), id).toBe(true); // BUMP-1D: was false
      expect(isPlainRig(id)).toBe(true);
    }
    expect(buyableModules().some((d) => isPlainRig(d.id))).toBe(true); // BUMP-1D: was false
    // the old world, explicitly (PLAIN_RIGS off): nothing sees the six
    withPlainRigs(() => {
      expect(plainRigsRules()).toBe(false);
      for (const id of PLAIN_RIG_IDS) {
        expect(Object.prototype.hasOwnProperty.call(ITEMS, id), id).toBe(false);
        expect(isPlainRig(id)).toBe(true);
      }
      expect(buyableModules().some((d) => isPlainRig(d.id))).toBe(false);
    }, false);
  });

  it("the catalogue, the pool, every merchant's stock, the per-run draw and the first caravans equal the base's", () => {
    // BUMP-1D: with PLAIN_RIGS and SHAPES2 off (the base's world, which had neither); the shipped world's digest is another
    // BUMP-1E: and with the scaling switch off (the base's world had none of the seven: `off` takes it off first)
    expect(off(() => poolDigest())).toBe(BASE_POOL_DIGEST);
    expect(poolDigest()).not.toBe(BASE_POOL_DIGEST);
  });

  // BUMP-1E: SCALE_RIGS ships on (bb-0.12.0), so the digest's world is read with it off beside PLAIN_RIGS and SHAPES2; the switch alone moves the digest
  it("the scaling switch ships ON, so the base's digest is read with it off too: PLAIN_RIGS and SHAPES2 off alone would leave the seven in the pool", () => {
    expect(SCALE_RIGS).toBe(true); // BUMP-1E: the shipped value (the 0.9.11 world had it off)
    expect(scaleRules()).toBe(true);
    expect(SCALE_IDS.every((id) => id in ITEMS)).toBe(true);
    off(() => {
      expect(scaleRules()).toBe(false);
      expect(SCALE_IDS.some((id) => id in ITEMS)).toBe(false);
    });
    // the cause of the old red, kept as a guard: the same world with the seven back in (the scaling switch on inside the nest) is not the base's
    expect(off(() => withScaleRigs(() => poolDigest(), true))).not.toBe(BASE_POOL_DIGEST);
    expect(scaleRules()).toBe(true); // put back, and (outermost) the seven last in ITEMS again
    // BUMP-1F (cause: GATES default): the seven stand just before the three converters, which are the last keys (was `.slice(-SCALE_IDS.length)` equal to SCALE_IDS)
    expect(Object.keys(ITEMS).slice(-(SCALE_IDS.length + GATES_IDS.length), -GATES_IDS.length)).toEqual([...SCALE_IDS]);
    expect(Object.keys(ITEMS).slice(-GATES_IDS.length)).toEqual([...GATES_IDS]);
  });

  it("a switch put back after a throw (withPlainRigs) leaves the catalogue as it was", () => {
    // BUMP-1D: the shipped state is on, so the throw comes out of the other state (off), and the old direction (out of on, from off) is kept
    expect(() => withPlainRigs(() => { throw new Error("x"); }, false)).toThrow("x");
    expect(plainRigsRules()).toBe(true);
    expect(PLAIN_RIG_IDS.every((id) => id in ITEMS)).toBe(true);
    off(() => {
      expect(() => withPlainRigs(() => { throw new Error("x"); })).toThrow("x");
      expect(plainRigsRules()).toBe(false);
      expect(PLAIN_RIG_IDS.some((id) => id in ITEMS)).toBe(false);
      expect(poolDigest()).toBe(BASE_POOL_DIGEST);
    });
    expect(plainRigsRules()).toBe(true);
  });
});

describe("PLAIN_RIGS on (P1): the six join the shared pool like any rig of their rarity", () => {
  it("the defs: one cell, rigs, the table's rarity, price and arrows", () => on(() => {
    const want: Record<string, [string, number, number]> = {
      rasp: ["common", 4, 1], sparkgap: ["common", 3, 1], scaleguard: ["common", 3, 1], ballast: ["common", 3, 1], // BUMP-1D P3 (T4): RASP 3 -> 4 G
      grindstone: ["rare", 5, 2], brandingiron: ["rare", 5, 2],
    };
    for (const id of PLAIN_RIG_IDS) {
      const d = ITEMS[id];
      expect(d, id).toBe(PLAIN_DEFS[id]);
      expect([d.kind, d.size, d.rarity, d.price, rigArrows(id).length], id).toEqual(["gate", 1, ...want[id]]);
    }
    expect(rigArrows("grindstone")).toEqual([1, 3]); // II: left and right
    expect(rigArrows("brandingiron")).toEqual([0, 1]); // L: forward and right
    expect(rigArrows("rasp")).toEqual([0]); // I: forward
    // after every base def: the catalogue's order is the base's, then the six (BUMP-1D: the base is the world with the switch off, SHAPES2 too)
    const base = off(() => Object.keys(ITEMS));
    // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), cause: the canonical order, BUMP-1F P2 F1, src/sim/itemsKeep.ts ITEM_RANK: plain 1, shapes 2, shapes2 3, scale 4, gates 5): was
    // `[...base, ...PLAIN_RIG_IDS]`; a switch adds its ids at its rank, so the six go in before SHAPES' three (which `off` leaves on) and not behind them
    off(() => on(() => expect(Object.keys(ITEMS)).toEqual([...base.filter((id) => !SHAPES_IDS.includes(id)), ...PLAIN_RIG_IDS, ...base.filter((id) => SHAPES_IDS.includes(id))])));
  }));

  it("the pool holds the base's buyable parts plus the six, and every merchant still stocks its base parts", () => {
    // BUMP-1D: the base's buyable parts are the world with PLAIN_RIGS and SHAPES2 off (the release ships both on)
    const base = off(() => buyableModules().map((d) => d.id));
    const withSix = off(() => on(() => buyableModules().map((d) => d.id)));
    // BUMP-1F (cause: the canonical order, BUMP-1F P2 F1): was `[...base, ...PLAIN_RIG_IDS]`; the six come before SHAPES' three in ITEMS, so in the pool
    expect(withSix).toEqual([...base.filter((id) => !SHAPES_IDS.includes(id)), ...PLAIN_RIG_IDS, ...base.filter((id) => SHAPES_IDS.includes(id))]);
    for (const id of PLAIN_RIG_IDS) expect(buyableModules().map((d) => d.id), id).toContain(id); // and the shipped pool has them
  });

  it("day 1's pool: every one of the six opens on day 1, and day 1's caravan offers the plain commons", () => on(() => {
    // BUMP-1D: with SHAPES2 on (as shipped) and off (the world this was measured in, which had no SHAPES2)
    for (const six of [true, false]) withShapes2(() => {
      for (const id of PLAIN_RIG_IDS) expect(seatDay(id), id).toBe(1);
      const commons = PLAIN_RIG_IDS.filter((id) => ITEMS[id].rarity === "common");
      let drawn = 0, offered = 0;
      for (let s = 1; s <= 200; s++) {
        const w = drawWares(s);
        if (commons.some((id) => w[id] === 1)) drawn++;
        const run = newRun("furnace", s);
        if (run.shop.wagons.some((wg) => wg.offers.some((o) => commons.includes(o.def)))) offered++;
      }
      expect(drawn, `SHAPES2 ${six}`).toBeGreaterThan(150); // most runs draw at least one of the four for day 1
      expect(offered, `SHAPES2 ${six}`).toBeGreaterThan(20); // and day 1's first caravan offers one in a good share of runs
    }, six);
  }));

  it("the switch goes off again: the six leave ITEMS and the pool is the base's", () => {
    // BUMP-1D: the base's pool has SHAPES2 off too, and the switch ships on: `off` sets both off and puts them back, even on a throw
    off(() => {
      setPlainRigs(true);
      setPlainRigs(true); // the state it has: nothing
      expect(PLAIN_RIG_IDS.every((id) => id in ITEMS)).toBe(true);
      setPlainRigs(false);
      expect(PLAIN_RIG_IDS.some((id) => id in ITEMS)).toBe(false);
      expect(poolDigest()).toBe(BASE_POOL_DIGEST);
    });
    expect(plainRigsRules()).toBe(PLAIN_RIGS); // the shipped value (on) is back
  });
});

describe("merging and selling (P1, REQ-BFG-084.3): a star raises only the numbers", () => {
  it("each star's stat row is the table's, and nothing else changes", () => on(() => {
    const rows: Record<string, unknown[]> = {
      rasp: [{ flat: 8, burn: 1 }, { flat: 16, burn: 2 }, { flat: 28, burn: 3 }], // SHAPES-2 run 2: DMG 10/20/35 -> 8/16/28
      sparkgap: [{ stun: 1 }, { stun: 2 }, { stun: 3 }],
      scaleguard: [{ slugPlate: 5, flat: 10 }, { slugPlate: 12, flat: 20 }, { slugPlate: 18, flat: 35 }], // SHAPES-2 run 2: PLATE 3/7/11 -> 5/12/18
      ballast: [{ maxHullPct: 8 }, { maxHullPct: 16 }, { maxHullPct: 25 }],
      grindstone: [{ flat: 25 }, { flat: 55 }, { flat: 90 }],
      brandingiron: [{ flat: 15 }, { flat: 30, burn: 1 }, { flat: 50, burn: 2 }], // FIRSTDAY-1 F7: the burn comes with the first merge
    };
    for (const id of PLAIN_RIG_IDS) {
      expect(fusible(id), id).toBe(true);
      expect([1, 2, 3].map((s) => effectAt(id, s).gate), id).toEqual(rows[id]);
      for (const s of [2, 3]) {
        const { gate: _g, levels: _l, ...rest } = effectAt(id, s);
        const { gate: _g1, levels: _l1, ...rest1 } = ITEMS[id];
        expect(rest, `${id} ★${s}`).toEqual(rest1); // name, rarity, price, shape: the star's def differs only in its numbers
      }
    }
  }));

  it("two copies merge into ★2 and four into ★3, as any rig", () => on(() => {
    for (const id of PLAIN_RIG_IDS) {
      const run = newRun("furnace", 7);
      gainModule(run, id);
      const g2 = gainModule(run, id);
      expect(g2.stars, id).toBe(2);
      gainModule(run, id);
      const g3 = gainModule(run, id);
      expect(g3.stars, id).toBe(3);
      expect(run.inventory.filter((i) => i.def === id).length, id).toBe(1);
    }
  }));

  it("they sell at today's sellValue (half the price x 2^(stars - 1), at least 1)", () => on(() => {
    expect([1, 2, 3].map((s) => sellValue("rasp", s))).toEqual([2, 4, 8]); // BUMP-1D P3 (T4): RASP costs 4 G (was 3: [1, 3, 6])
    expect([1, 2, 3].map((s) => sellValue("grindstone", s))).toEqual([2, 5, 10]);
  }));
});

describe("a hit gives its stats once per arrow that points at a belt tile (P1, REQ-BFG-084.2)", () => {
  // FURNACE's bench: the Kiln at (4,6), its belt up column 4: tile 0 (4,5), 1 (4,4), 2 (4,3), 3 (4,2), 4 (4,1), 5 (4,0)
  it("RASP beside the belt: each slug past its tile carries +8 DMG and +1 BURN, once; an IDLE RASP gives nothing", () => on(() => { // SHAPES-2 run 2: DMG 10 -> 8
    const b = bench(item(30, "rasp", 3, 3, 1)); // its arrow points east at (4,3), tile 2
    expect(rigHits(b).flat(2).filter((h) => h.uid === 30).map((h) => h.tile)).toEqual([2]);
    const past = pastTilePlain(b, 0, 2);
    expect(past.length).toBeGreaterThan(3);
    for (const p of past) expect([p.flat, p.burn]).toEqual([8, 1]);
    const idle = bench(item(30, "rasp", 0, 9)); // its arrow points at (0,8): no belt
    expect(rigHits(idle).flat(2).some((h) => h.uid === 30)).toBe(false);
    for (const p of pastTilePlain(idle, 0, 5)) expect([p.flat, p.burn]).toEqual([0, 0]);
  }));

  it("GRINDSTONE between two belts: each belt's slugs take +25 once (one arrow, one hit)", () => on(() => {
    // two presses: belt A up column 3 (tile 2 at (3,3)), belt B up column 5 (tile 3 at (5,3)); (4,3) is free
    const b: Build = {
      hero: "furnace",
      items: [{ uid: 1, def: "kiln", x: 0, y: 8 }, { uid: 2, def: "press", x: 2, y: 6 }, { uid: 3, def: "press", x: 6, y: 6 }, item(40, "grindstone", 4, 3)],
      routes: [
        { factory: 2, cells: [K(3, 5), K(3, 4), K(3, 3), K(3, 2), K(3, 1), K(4, 1), K(4, 0)] },
        { factory: 3, cells: [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] },
      ],
      mods: [], beltCap: 30, hullBonus: 5000,
    };
    expect(rigHits(b).flat(2).filter((h) => h.uid === 40).map((h) => [h.route, h.tile])).toEqual([[0, 2], [1, 3]]);
    for (const [route, tile] of [[0, 2], [1, 3]]) {
      const past = pastTilePlain(b, route, tile);
      expect(past.length, `route ${route}`).toBeGreaterThan(2);
      for (const p of past) expect(p.flat, `route ${route}`).toBe(25);
    }
  }));

  it("BRANDING IRON at a bend: its two arrows hit both tiles of the bend, so a slug takes 2 x (+15 DMG) at ★1 and 2 x (+30 DMG, +1 BURN) at ★2", () => on(() => {
    // the Kiln's belt (4,5), (4,4), (4,3), then right to (5,3) and up column 5 to (5,0); the iron at (4,2), turned once:
    // its arrows point east at (5,2), tile 4, and back at (4,3), tile 2. FIRSTDAY-1 F7: no BURN at ★1; it comes at ★2
    const bend = (stars: number): Build => ({
      hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, item(50, "brandingiron", 4, 2, 1, stars)],
      routes: [{ factory: 1, cells: [K(4, 5), K(4, 4), K(4, 3), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] }],
      mods: [], beltCap: 30, hullBonus: 5000,
    });
    const b = bend(1);
    expect(routeInfo(b, 0).connected).toBe(true);
    expect(rigHits(b).flat(2).filter((h) => h.uid === 50).map((h) => h.tile)).toEqual([2, 4]);
    const mid = pastTilePlain(b, 0, 2), end = pastTilePlain(b, 0, 4);
    for (const p of mid) expect([p.flat, p.burn]).toEqual([15, 0]);
    expect(end.length).toBeGreaterThan(2);
    for (const p of end) expect([p.flat, p.burn]).toEqual([30, 0]);
    const end2 = pastTilePlain(bend(2), 0, 4);
    expect(end2.length).toBeGreaterThan(2);
    for (const p of end2) expect([p.flat, p.burn]).toEqual([60, 2]);
  }));

  it("SPARK GAP adds its STUN seconds to the slug: 1, two of them 2; after a coil 2 + 1; a coil after it at least 2", () => on(() => {
    const spark = (x: number, y: number, rot: number, uid: number) => item(uid, "sparkgap", x, y, rot);
    const t = (b: Build, tile: number) => pastTilePlain(b, 0, tile).map((p) => [p.shock, p.shockTime]);
    const one = t(bench(spark(3, 3, 1, 30)), 2);
    expect(one.length).toBeGreaterThan(3);
    for (const v of one) expect(v).toEqual([true, 1]);
    for (const v of t(bench(spark(3, 4, 1, 30), spark(3, 3, 1, 31)), 2)) expect(v).toEqual([true, 2]);
    // a GALVANIC COIL ★1 (L) at (3,4): its east arrow hits tile 1 (4,4); then the gap on tile 2
    for (const v of t(bench(item(32, "coil", 3, 4), spark(3, 3, 1, 30)), 2)) expect(v).toEqual([true, 3]);
    // the gap on tile 1, then the coil ★1 (L at (3,3): its east arrow on tile 2): the coil's own 2 s
    for (const v of t(bench(spark(3, 4, 1, 30), item(32, "coil", 3, 3)), 2)) expect(v).toEqual([true, 2]);
    // an OVERCLOCKER doubles its seconds, as it doubles a flat
    expect(overclocked(effectAt("sparkgap", 1).gate!).stun).toBe(2);
  }));
});

describe("BALLAST (P3): max hull x (1 + the working BALLASTs' %), on top of the base's max hull, rounded down", () => {
  const base = HEROES.furnace.hull + 5000; // the bench's max hull: the hero's + its hullBonus
  it("a working BALLAST adds 8%; a ★2 beside it 16% more; the result rounded down", () => on(() => {
    expect(maxHull(furnaceBench())).toBe(base);
    const one = bench(item(30, "ballast", 3, 3, 1));
    expect(maxHull(one)).toBe(Math.floor((base * 108) / 100));
    const bt = new Battle(one, barge(), SEED);
    expect(bt.sides[0].hull.hp).toBe(bt.sides[0].hull.max);
    const two = bench(item(30, "ballast", 3, 3, 1), item(31, "ballast", 5, 4, 3, 2)); // (5,4) west at (4,4), ★2
    expect(maxHull(two)).toBe(Math.floor((base * 124) / 100));
  }));

  it("an IDLE BALLAST (no arrow on a belt tile) adds nothing", () => on(() => {
    expect(maxHull(bench(item(30, "ballast", 0, 9)))).toBe(base);
    expect(maxHull(bench(item(30, "ballast", 3, 3)))).toBe(base); // its arrow points forward at (3,2): no belt
  }));

  it("with HULL_SCALE on, on top of M(d) x (base + hullBonus): day 5", () => on(() => withHullScale(() => {
    const m0 = scaleTenths(base, dayMulTenths(5));
    expect(maxHull(furnaceBench(), 5)).toBe(m0);
    expect(maxHull(bench(item(30, "ballast", 3, 3, 1, 3)), 5)).toBe(Math.floor((m0 * 125) / 100));
  })));
});

describe("SCALE GUARD (P2): its PLATE rides the slug and reaches your ship at the gun, by the bulwark rule", () => {
  it("each slug past it carries 5 PLATE and +10 DMG; the hull gains 5 for each slug that loads, none before", () => on(() => {
    // SHAPES-2 run 2 (BRIEF-SHAPES2 S6b, PLAIN-1F's section 10 call): the PLATE 3/7/11 -> 5/12/18
    const b = bench(item(30, "scaleguard", 3, 3, 1));
    for (const p of pastTilePlain(b, 0, 2)) expect([p.flat, p.plate]).toEqual([10, 5]);
    const bt = new Battle(b, barge(), SEED);
    let loads = 0, plated = 0;
    while (bt.t < 12 && !bt.over) {
      bt.step();
      for (const e of bt.drainEvents()) {
        if (e.type === "load" && e.side === 0) loads++;
        if (e.type === "plate" && e.side === 0) {
          expect((e as { amount: number }).amount).toBe(5);
          expect((e as { turret?: number }).turret).toBe(0);
          plated++;
        }
      }
      // the pool holds what landed (each load lands 5; firing spends none: the barge never shoots back)
      expect(bt.sides[0].plate.gained).toBe(5 * plated);
    }
    expect(loads).toBeGreaterThan(3);
    expect(plated).toBe(loads);
  }));

  it("the bulwark rule's amount: a bulwark slug's own 20 plus the PLATE it carries; any other slug its PLATE", () => {
    const p = (ammo: string, plate?: number, mult = 1): Payload =>
      ({ id: 1, ammo, ride: 0, mult, flat: 0, burn: 0, shock: false, prior: 0, factory: 0, copy: false, ...(plate ? { plate } : {}) }) as Payload;
    expect(plateFor(p("bulwark"))).toBe(20);
    expect(plateFor(p("bulwark", 3))).toBe(23);
    expect(plateFor(p("cinder", 7))).toBe(7);
    expect(plateFor(p("cinder"))).toBe(0);
    expect(on(() => overclocked(effectAt("scaleguard", 1).gate!))).toMatchObject({ slugPlate: 10, flat: 20 });
  });
});
