// SCALE-2b (REQ-BFG-108, REQ-BFG-098; BRIEF-SCALE2b step 2 (a)-(g)): POISON behind SCALE_RIGS (src/sim/scale.ts). Switch on
// through withScaleRigs; the shipped switch stays off. VENOM DRIP is POISON's one source with the switch on (scale.ts
// SCALE_DEFS); the readers here are test-only defs (ids "s2b...", REPORT-SCALE2a section 10's forms), registered in ITEMS
// and taken out again. The real ROT GAUGE and LEECH COIL are SCALE-2c's.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BURN_DPS, BURN_TIME, ITEMS, POISON_DPS, type ItemDef, type ReadSpec } from "../src/sim/content";
import { Battle, type Payload, type Projectile, type SideState, type SimEvent, type Target, type TurretState } from "../src/sim/battle";
import { SCALE_DEFS, SCALE_RIGS, scaleRules, withScaleRigs } from "../src/sim/scale";
import { clearStarCache, effectAt } from "../src/sim/stars";
import { dmgMulTenths } from "../src/sim/hullScale";
import { boostable, overclocked } from "../src/sim/overclock";
import { fuse } from "../src/sim/races/foundry";
import { ECHO_CAP, echoOf, echoOnLoad, newEchoState } from "../src/sim/races/siphon";
import { drakeConvert } from "../src/sim/cores";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { type Build } from "../src/sim/deck";
import { readerStyle } from "../src/game/arenaReact";
import { SEED, barge, furnaceBench, item, withItem, withMod } from "./wave3.helpers";

// ---------------------------------------------------------------------------------------------- test-only defs

/** A 1-arrow (common) test rig with a reader line (REPORT-SCALE2a section 10's form). */
function rig(id: string, reads: ReadSpec): ItemDef {
  return { id, name: id.toUpperCase(), kind: "gate", rarity: "common", price: 3, size: 1, merchant: "alchemist", desc: [], tags: ["FORGE"], gate: { reads } };
}
const TEST_DEFS: Record<string, ItemDef> = {
  s2brot: rig("s2brot", { count: "foePoison", each: 3, give: "dmg" }), // ROT GAUGE-style: +3 DMG for each POISON on the foe
  s2bleech: rig("s2bleech", { count: "foePoison", each: 4, give: "heal" }), // LEECH COIL-style: HEAL 4 for each POISON on the foe
};
const ITEMS_RW = ITEMS as Record<string, ItemDef>;
beforeAll(() => {
  for (const [id, d] of Object.entries(TEST_DEFS)) ITEMS_RW[id] = d;
  clearStarCache();
});
afterAll(() => {
  for (const id of Object.keys(TEST_DEFS)) delete ITEMS_RW[id];
  clearStarCache();
});

// ---------------------------------------------------------------------------------------------- helpers

/** The furnace bench's belt (column 4, tiles 0-5 from (4,5) up to (4,0)): a 1-arrow rig at (3, y) facing east (rot 1)
 *  hits tile 5 - y. */
const east = (uid: number, def: string, y: number, stars = 1) => item(uid, def, 3, y, 1, stars);
/** Deck b with rig `def` at (3, y), turned so it works the bench's tile 5 - y. */
function aimed(b: Build, uid: number, def: string, y: number): Build {
  for (let rot = 0; rot < 4; rot++) {
    const t = withItem(b, item(uid, def, 3, y, rot));
    const g = new Battle(t, barge(), SEED).sides[0].gates.find((q) => q.uid === uid)!;
    if (g.hits.some((h) => h.route === 0 && h.tile === 5 - y)) return t;
  }
  throw new Error(`no turn aims ${def} at tile ${5 - y}`);
}
/** The slot the bench's belt feeds (the heavy gun). */
const GUN = new Battle(furnaceBench(), barge(), SEED).sides[0].routes[0].turret;

type Priv = {
  impact(pr: Projectile): void;
  readCount(s: SideState, count: ReadSpec["count"], at: { route?: number; queued?: number }): number;
  fireCore(s: SideState, tu: TurretState, p: Payload, k: number, queued: number): void;
};
const priv = (bt: Battle) => bt as unknown as Priv;
const slug = (id = 1, extra: Partial<Payload> = {}): Payload =>
  ({ id, ammo: "plain", ride: 0, mult: 1, flat: 0, burn: 0, shock: false, prior: 0, factory: 0, copy: false, ...extra });
const HULL: Target = { kind: "hull", ref: -1, cell: -1, x: 60, y: 60, weight: 1 };
/** A projectile from side `from` carrying POISON `poison` (and BURN `burn`) onto `target` (the bare hull by default). */
const pshot = (from: 0 | 1, dmg: number, poison: number, target: Target = HULL, burn = 0): Projectile => ({
  id: 999, from, turret: 0, payload: slug(998, { burn, ...(poison ? { poison } : {}) }), dmg, t: 0, flight: 0,
  target, tx: target.x, ty: target.y, heavy: false,
});
/** Two barges (neither fires): only what a test puts on a hull touches it. `day` makes the battle the day's (D, S). */
const quiet = (on = true, day?: number): Battle => {
  const make = () => new Battle(barge(), barge(), SEED, undefined, day);
  return on ? withScaleRigs(make) : make();
};
type PoisonEv = Extract<SimEvent, { type: "poison" }>;
/** Step `bt` until `secs`, collecting its poison events with the tick count each came on. */
function ticks(bt: Battle, secs: number): { at: number; e: PoisonEv }[] {
  const out: { at: number; e: PoisonEv }[] = [];
  while (bt.t < secs - 1e-9 && !bt.over) {
    bt.step();
    for (const e of bt.drainEvents()) if (e.type === "poison") out.push({ at: bt.ticks, e });
  }
  return out;
}
interface Shot { p: Payload; poison?: number }
/** Step a battle made by `make` for `secs`; every side-0 projectile once, with its payload and the POISON it carries. */
function play(make: () => Battle, secs: number, on?: (ev: SimEvent[], bt: Battle) => void): { bt: Battle; shots: Shot[] } {
  const bt = make(), seen = new Set<number>(), shots: Shot[] = [];
  while (bt.t < secs && !bt.over) {
    bt.step();
    const ev = bt.drainEvents();
    for (const pr of bt.projectiles as Projectile[]) {
      if (pr.from !== 0 || seen.has(pr.id)) continue;
      seen.add(pr.id);
      shots.push({ p: pr.payload, poison: pr.poison });
    }
    on?.(ev, bt);
  }
  return { bt, shots };
}
const procOf = (ev: SimEvent[], uid: number) =>
  ev.filter((e): e is Extract<SimEvent, { type: "process" }> => e.type === "process" && e.side === 0 && e.gate === uid);

// ---------------------------------------------------------------------------------------------- (a) landing

describe("SCALE-2b (a): POISON lands at impact, beside the hit's BURN", () => {
  it("a hull hit and a part hit add the slug's POISON to the foe's hull; it adds up; 0 adds nothing", () => {
    const bt = quiet(), foe = bt.sides[1];
    priv(bt).impact(pshot(0, 40, 2));
    expect(foe.hull.poison).toBe(2);
    const part = foe.targets.find((t) => t.kind !== "hull")!;
    expect(part).toBeDefined();
    priv(bt).impact(pshot(0, 40, 3, part)); // a part hit: the POISON goes on the hull, as a part hit's BURN does
    expect(foe.hull.poison).toBe(5);
    priv(bt).impact(pshot(0, 40, 0)); // poison 0 (absent): nothing
    expect(foe.hull.poison).toBe(5);
    expect(bt.sides[0].hull.poison).toBeUndefined(); // only the struck side
  });

  it("a WARD (the sim's shield) that blocks the hit's damage doesn't stop its POISON (nor its BURN)", () => {
    const bt = quiet(), foe = bt.sides[1];
    bt.gainShield(foe, 1);
    const hp = foe.hull.hp;
    priv(bt).impact(pshot(0, 60, 4, HULL, 1));
    expect(foe.blocked).toBe(1); // the WARD took the hit
    expect(foe.hull.hp).toBe(hp); // no damage
    expect(foe.hull.poison).toBe(4); // its POISON landed
    expect(foe.hull.burns.length).toBe(1); // as its BURN did
  });

  it("off: a slug carrying POISON lands none (no hull holds POISON with SCALE_RIGS off)", () => {
    const bt = quiet(false);
    priv(bt).impact(pshot(0, 40, 2));
    expect(bt.sides[1].hull.poison).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------- (b) the tick

describe("SCALE-2b (b): the tick, once a second", () => {
  it("3 x the stacks at each whole second, one poison event a tick, SideStats.damage and poisonDealt take it", () => {
    expect(POISON_DPS).toBe(3);
    const bt = quiet(), foe = bt.sides[1];
    foe.hull.poison = 4;
    const hp = foe.hull.hp;
    const got = ticks(bt, 5);
    expect(got.map((g) => g.at)).toEqual([60, 120, 180, 240, 300]); // whole seconds on the integer tick count
    for (const g of got) expect(g.e).toEqual({ type: "poison", side: 1, dmg: 12 });
    expect(foe.hull.hp).toBe(hp - 60);
    expect(bt.sides[0].stats.damage).toBe(60); // the POISON's owner (side 0) dealt it, as BURN's tick counts
    expect(bt.sides[0].stats.burnDealt).toBe(0); // not BURN's
    expect(bt.sides[0].poisonDealt).toBe(60); // the tally lives off SideStats
    expect(Object.keys(bt.sides[0].stats).some((k) => /poison/i.test(k))).toBe(false); // never a SideStats key
  });

  it("D(day) applies to the tick as to BURN's (whole numbers, the remainder carried)", () => {
    const day = 9, tenths = dmgMulTenths(day);
    expect(tenths).toBeGreaterThan(10);
    const bt = quiet(true, day), foe = bt.sides[1];
    foe.hull.poison = 4;
    const got = ticks(bt, 10);
    expect(got.length).toBe(10);
    for (const g of got) expect(Number.isInteger(g.e.dmg)).toBe(true);
    expect(got.reduce((n, g) => n + g.e.dmg, 0)).toBe(Math.floor((10 * 12 * tenths) / 10)); // 120 x D, rounded down once
    expect(got[0].e.dmg).toBe(Math.floor((12 * tenths) / 10));
  });

  it("no decay through a long fight; the next battle starts at 0", () => {
    const bt = quiet(), foe = bt.sides[1];
    foe.hull.poison = 2;
    const got = ticks(bt, 60);
    expect(got.length).toBe(60);
    for (const g of got) expect(g.e.dmg).toBe(6); // 2 x 3 every second, the 25 s wind or not
    expect(foe.hull.poison).toBe(2);
    expect(quiet().sides[1].hull.poison).toBeUndefined(); // a new Battle's hull: 0
  });

  it("off: a hull given POISON by hand takes no tick (the tick reads the switch through its Battle)", () => {
    const bt = quiet(false);
    bt.sides[1].hull.poison = 4;
    const hp = bt.sides[1].hull.hp;
    expect(ticks(bt, 3)).toEqual([]);
    expect(bt.sides[1].hull.hp).toBe(hp);
  });
});

// ---------------------------------------------------------------------------------------------- (c) the soak layer, WARD

describe("SCALE-2b (c): past the soak layer, and WARD never blocks a tick", () => {
  it("a plated hull loses hp to the tick and keeps its plate (the dark wind's path); a BURN tick is soaked", () => {
    const bt = quiet(), foe = bt.sides[1];
    bt.addPlate(foe, 100);
    expect(foe.plate.plate).toBe(100);
    foe.hull.poison = 5;
    const hp = foe.hull.hp;
    ticks(bt, 1);
    expect(foe.hull.hp).toBe(hp - 15);
    expect(foe.plate.plate).toBe(100); // untouched
    expect(foe.plate.absorbed).toBe(0);
    foe.hull.burns.push({ dps: 1, t: 3 }); // the contrast: BURN's tick goes through the plate
    ticks(bt, 2);
    expect(foe.plate.plate).toBe(100 - BURN_DPS);
    expect(foe.hull.hp).toBe(hp - 30);
  });

  it("a SHIELD (WARD) is never spent on a tick; SPALL CATCHER takes no charge from it (as the wind)", () => {
    const bt = quiet(), foe = bt.sides[1];
    bt.gainShield(foe, 2);
    foe.hull.poison = 3;
    const hp = foe.hull.hp;
    ticks(bt, 3);
    expect(foe.shield).toBe(2);
    expect(foe.blocked).toBeUndefined();
    expect(foe.hull.hp).toBe(hp - 27);
    // a SPALL CATCHER side: POISON on its hull charges nothing; a BURN tick does
    const sp = withScaleRigs(() => new Battle(barge(), withMod(furnaceBench(), 40, "spallcatcher", GUN), SEED));
    const tu = sp.sides[1].turrets.find((t) => t.index === GUN)!;
    expect(tu.spall).toBeDefined();
    sp.sides[1].hull.poison = 5;
    ticks(sp, 1);
    expect(tu.spallCharge ?? 0).toBe(0);
    sp.sides[1].hull.burns.push({ dps: 1, t: 3 });
    ticks(sp, 2);
    expect(tu.spallCharge ?? 0).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------- (d) HEAL, the % runes

describe("SCALE-2b (d): HEAL and the % runes", () => {
  it("a poisoned hull heals normally; a burning one still heals half", () => {
    const bt = quiet(), s = bt.sides[1];
    s.hull.poison = 6;
    s.hull.hp -= 200;
    expect(bt.heal(s, 40, "riveter")).toBe(40);
    s.hull.burns.push({ dps: 1, t: 3 });
    expect(bt.heal(s, 40, "riveter")).toBe(20);
  });

  it("no % rune scales a tick: PYRE HEART (the foe's burnPct) and ASH CLOAK (burnCut) stay BURN's", () => {
    const bt = quiet();
    (bt.sides[0] as { rune?: unknown }).rune = { burnPct: 100 }; // the POISON's owner: BURN on the foe deals 100% more
    (bt.sides[1] as { rune?: unknown }).rune = { burnCut: 50 }; // the poisoned hull: its BURN 50% less
    bt.sides[1].hull.poison = 6;
    bt.sides[1].hull.burns.push({ dps: 1, t: 3 });
    let burn = 0, poison = 0;
    while (bt.ticks < 60) {
      bt.step();
      for (const e of bt.drainEvents()) {
        if (e.type === "burn") burn += e.dmg;
        if (e.type === "poison") poison += e.dmg;
      }
    }
    expect(burn).toBe(BURN_DPS); // x2 x0.5: the runes are live on BURN's tick
    expect(poison).toBe(18); // 6 x 3, untouched
  });
});

// ---------------------------------------------------------------------------------------------- (e) VENOM DRIP

describe("SCALE-2b (e): VENOM DRIP, switch-aware through one lookup", () => {
  it("on: POISON +1/+2/+3 and no burnPlus; off: burnPlus 3/6/9, the very content.ts def; the rest of the def unchanged", () => {
    expect(SCALE_RIGS).toBe(false);
    const base = ITEMS.venom;
    expect([1, 2, 3].map((n) => effectAt("venom", n).gate)).toEqual([{ burnPlus: 3 }, { burnPlus: 6 }, { burnPlus: 9 }]);
    withScaleRigs(() => {
      expect(scaleRules()).toBe(true);
      const on = ITEMS.venom;
      expect(on).not.toBe(base);
      expect(on).toEqual(SCALE_DEFS.venom(base)); // built from the base def by the one table
      expect([1, 2, 3].map((n) => effectAt("venom", n).gate)).toEqual([{ poison: 1 }, { poison: 2 }, { poison: 3 }]);
      const { gate: _g, levels: _l, ...rest } = on;
      const { gate: _bg, levels: _bl, ...baseRest } = base;
      expect(rest).toEqual(baseRest); // rarity, price, merchant, size, desc, tags...
      expect([on.rarity, on.price, on.merchant, on.tags]).toEqual(["rare", 4, "alchemist", ["SWARM", "FORGE"]]);
    });
    expect(ITEMS.venom).toBe(base); // put back: the very object
    expect(effectAt("venom", 3).gate).toEqual({ burnPlus: 9 }); // the star cache was cleared both ways
  });

  // TEMPER ★1 (1 BURN a slug) at tile 0, VENOM DRIP ★1 at tile 2
  const deck = (): Build => aimed(withItem(furnaceBench(), east(30, "temper", 5)), 31, "venom", 3); // VENOM DRIP's II: aimed

  it("on, a VENOM DRIP deck lands POISON and its BURN lasts BURN_TIME; off, its BURN lasts BURN_TIME + 3 and no POISON", () => {
    const longest = (on: boolean) => {
      let maxT = 0, poisonEv = 0;
      const { bt } = play(() => (on ? withScaleRigs(() => new Battle(deck(), barge(), SEED)) : new Battle(deck(), barge(), SEED)), 15, (ev, b) => {
        for (const x of b.sides[1].hull.burns) maxT = Math.max(maxT, x.t);
        poisonEv += ev.filter((e) => e.type === "poison").length;
      });
      return { maxT, poisonEv, poison: bt.sides[1].hull.poison };
    };
    const on = longest(true), off = longest(false);
    expect(off.maxT).toBeGreaterThan(BURN_TIME + 2.9); // 6 s less the tick it landed on
    expect(off.poisonEv).toBe(0);
    expect(off.poison).toBeUndefined();
    expect(on.maxT).toBeLessThanOrEqual(BURN_TIME);
    expect(on.poisonEv).toBeGreaterThan(5);
    expect(on.poison).toBeGreaterThan(3);
  });

  it("off, a deck holding VENOM DRIP fights exactly as before any switch flip (winner, ticks, hulls, SideStats, every event)", () => {
    const fight = () => {
      const log: string[] = [];
      const { bt } = play(() => new Battle(deck(), barge(), SEED), 40, (ev) => { log.push(JSON.stringify(ev)); });
      return { log, over: [bt.winner, bt.ticks, bt.sides[0].hull.hp, bt.sides[1].hull.hp], stats: [bt.sides[0].stats, bt.sides[1].stats] };
    };
    const before = fight();
    const on = withScaleRigs(() => fight()); // a fight made with the switch on (inside) differs ...
    const after = fight(); // ... and the switch put back gives the very same fight as before
    expect(after.over).toEqual(before.over);
    expect(after.stats).toEqual(before.stats);
    expect(after.log).toEqual(before.log);
    expect(before.log.join("")).not.toContain("\"poison\"");
    expect(on.log).not.toEqual(before.log);
  });
});

// ---------------------------------------------------------------------------------------------- (f) the payload sites

describe("SCALE-2b (f): every payload site carries POISON as it carries BURN", () => {
  it("FOUNDRY's fuse sums both blanks' POISON (and BURN)", () => {
    const a = slug(1, { ammo: "blank", poison: 1, burn: 1 }), b = slug(2, { ammo: "blank", poison: 2, burn: 2 });
    fuse(a, b);
    expect(a.ammo).toBe("alloy");
    expect([a.poison, a.burn]).toEqual([3, 3]);
    const c = slug(3, { ammo: "blank" }), d = slug(4, { ammo: "blank", poison: 2 });
    fuse(c, d);
    expect(c.poison).toBe(2);
    const e = slug(5, { ammo: "blank" }), f = slug(6, { ammo: "blank" });
    fuse(e, f);
    expect(e.poison).toBeUndefined(); // none: none (the off world's alloys are as before)
  });

  it("a SPLITTER copy carries it (the copy keeps the slug's POISON whole, as its BURN)", () => {
    // VENOM DRIP at tile 0, a SPLITTER at tile 4: every slug through both, original and copy, carries 1 POISON
    const b = aimed(aimed(furnaceBench(), 31, "venom", 5), 32, "splitter", 1);
    const { shots } = play(() => withScaleRigs(() => new Battle(b, barge(), SEED)), 20);
    const both = shots.filter((s) => s.p.prior === 2);
    expect(both.length).toBeGreaterThan(5);
    expect(new Set(both.map((s) => s.p.id)).size).toBe(both.length); // distinct slugs: originals and their copies
    for (const s of both) expect([s.p.poison, s.p.copy]).toEqual([1, true]);
  });

  it("COMPOUND BREECH keeps both loads' POISON on the shell", () => {
    const bt = withScaleRigs(() => new Battle(withMod(furnaceBench(), 40, "compound", GUN), barge(), SEED));
    const s = bt.sides[0], tu = s.turrets.find((t) => t.index === GUN)!;
    expect(tu.core.routine).toBe("compound");
    const p = slug(1, { poison: 1, burn: 1 }), q = slug(2, { poison: 2, burn: 2 });
    p.compound = q;
    priv(bt).fireCore(s, tu, p, 0, 0);
    const pr = bt.projectiles.at(-1) as Projectile;
    expect([pr.poison, p.poison, pr.burn]).toEqual([3, 3, 3]);
  });

  it("SCATTER splits it between its pellets as BURN (rounded up)", () => {
    const bt = withScaleRigs(() => new Battle(withMod(furnaceBench(), 40, "scatter", GUN), barge(), SEED));
    const s = bt.sides[0], tu = s.turrets.find((t) => t.index === GUN)!;
    expect(tu.core.routine).toBe("scatter");
    for (const n of [4, 3]) {
      const from = bt.projectiles.length;
      priv(bt).fireCore(s, tu, slug(n, { poison: n, burn: n }), 0, 0);
      const pellets = (bt.projectiles as Projectile[]).slice(from);
      expect(pellets.length).toBe(3);
      for (const pr of pellets) expect([pr.poison, pr.burn]).toEqual([Math.ceil(n / 3), Math.ceil(n / 3)]);
    }
  });

  it("an OVERCLOCKER doubles VENOM DRIP's POISON with the switch on; off, its burnPlus doubles as today", () => {
    withScaleRigs(() => {
      const e = effectAt("venom", 2).gate!;
      expect(boostable(e)).toBe(true);
      expect(overclocked(e)).toEqual({ poison: 4 });
    });
    const off = effectAt("venom", 2).gate!;
    expect(overclocked(off)).toEqual({ burnPlus: 12 });
    expect(boostable({ poison: 1 })).toBe(false); // a POISON line counts only with the switch on (as `reads`)
  });
});

// ---------------------------------------------------------------------------------------------- (g) foePoison

describe("SCALE-2b (g): the reader foePoison", () => {
  it("reads the foe hull's POISON at the hit (0 until one lands)", () => {
    const bt = quiet();
    expect(priv(bt).readCount(bt.sides[0], "foePoison", {})).toBe(0);
    bt.sides[1].hull.poison = 7;
    expect(priv(bt).readCount(bt.sides[0], "foePoison", {})).toBe(7);
    expect(priv(bt).readCount(bt.sides[1], "foePoison", {})).toBe(0);
  });

  it("a ROT GAUGE-style rig: its DMG goes to the slug's FOR EACH accumulator and pops +n (C11)", () => {
    const b = withItem(furnaceBench(), east(30, "s2brot", 3));
    let hits = 0;
    const { shots } = play(() => { const bt = withScaleRigs(() => new Battle(b, barge(), SEED)); bt.sides[1].hull.poison = 5; return bt; }, 8, (ev) => {
      for (const e of procOf(ev, 30)) {
        expect(e.add).toEqual({ amount: 15, kind: "dmg" });
        expect(readerStyle(e.add!)?.text).toBe("+15");
        hits++;
      }
    });
    expect(hits).toBeGreaterThan(2);
    const read = shots.filter((s) => s.p.prior === 1);
    expect(read.length).toBeGreaterThan(2);
    for (const s of read) expect([s.p.each, s.p.flat]).toEqual([15, 0]);
  });

  it("with VENOM DRIP aboard the reader climbs with the foe's POISON as it lands", () => {
    const b = withItem(aimed(furnaceBench(), 31, "venom", 5), east(30, "s2brot", 3));
    const adds: number[] = [];
    play(() => withScaleRigs(() => new Battle(b, barge(), SEED)), 20, (ev) => { for (const e of procOf(ev, 30)) adds.push(e.add?.amount ?? 0); });
    expect(adds.length).toBeGreaterThan(5);
    for (const a of adds) expect(a % 3).toBe(0);
    for (let i = 1; i < adds.length; i++) expect(adds[i]).toBeGreaterThanOrEqual(adds[i - 1]);
    expect(adds.at(-1)!).toBeGreaterThan(adds[0]);
  });

  it("a LEECH COIL-style rig heals through heal(): 4 a POISON, half on a burning hull", () => {
    const b = withItem(furnaceBench(), east(30, "s2bleech", 3));
    const heals: number[] = [];
    let burning = false;
    play(() => {
      const bt = withScaleRigs(() => new Battle(b, barge(), SEED));
      bt.sides[0].hull.hp -= 2000;
      bt.sides[1].hull.poison = 5;
      return bt;
    }, 12, (ev, bt) => {
      for (const e of procOf(ev, 30)) heals.push(e.add?.kind === "heal" ? e.add.amount : -1);
      for (const e of ev) if (e.type === "heal" && e.side === 0) expect([e.source, e.gate]).toEqual(["reads", 30]);
      if (!burning && heals.length >= 2) { bt.sides[0].hull.burns.push({ dps: 1, t: 1e9 }); burning = true; }
    });
    expect(heals.length).toBeGreaterThan(3);
    expect(heals.slice(0, 2)).toEqual([20, 20]);
    expect(heals.slice(2).every((h) => h === 10)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------- step 3 (F2)

describe("SCALE-2b step 3 (REPORT-SCALE2a F2): SIPHON's ECHO keeps stat DMG and FOR EACH DMG apart", () => {
  it("echoOf: stat part first, FOR EACH part filling the rest of the cap; echoOnLoad: stat to p.flat, FOR EACH to p.each, so DRAKE converts the stat part only; without `each` (the switch off) exactly as today", () => {
    expect(ECHO_CAP.flat).toBe(30);
    // a slug without FOR EACH DMG (every slug with SCALE_RIGS off): as today, no `each` in the memory
    expect(echoOf(slug(1, { flat: 20 }), false)).toEqual({ flat: 20, burn: 0, shock: false, fray: 0 });
    expect(echoOf(slug(1, { flat: 100, burn: 7 }), false)).toEqual({ flat: 30, burn: 2, shock: false, fray: 0 });
    // with it (SCALE_RIGS on): stat first, then FOR EACH up to the one cap of 30
    expect(echoOf(slug(1, { flat: 20, each: 25 }), false)).toEqual({ flat: 20, burn: 0, shock: false, fray: 0, each: 10 });
    expect(echoOf(slug(1, { flat: 40, each: 5 }), false)).toMatchObject({ flat: 30, each: 0 });
    expect(echoOf(slug(1, { flat: 5, each: 8 }), false)).toMatchObject({ flat: 5, each: 8 });
    expect(echoOf(slug(1, { ammo: "alloy", flat: 91, each: 30 }), false)).toMatchObject({ flat: 10, each: 20 }); // an alloy's fused 81 is no DMG added
    // the leech: stat to flat, FOR EACH to each (x its split share)
    const st = newEchoState();
    st.mem = echoOf(slug(1, { flat: 20, each: 25 }), false);
    const leech = slug(2, { ammo: "leechEcho" }), half = slug(3, { ammo: "leechEcho", mult: 0.5 });
    echoOnLoad(st, leech);
    echoOnLoad(st, half);
    expect([leech.flat, leech.each]).toEqual([20, 10]);
    expect([half.flat, half.each]).toEqual([10, 5]);
    // DRAKE NOZZLE ★1 (25 DMG a BURN) on the SIPHON gun: the stat 20 makes no BURN; the old memory (30, all stat) made 1
    const c = effectAt("drake", 1).core!;
    expect(drakeConvert(c, leech.flat).stacks).toBe(0);
    expect(drakeConvert(c, 30).stacks).toBe(1);
    // a memory without `each` loads as today: the leech's FOR EACH accumulator is never set
    st.mem = echoOf(slug(1, { flat: 20 }), false);
    const plain = slug(4, { ammo: "leechEcho" });
    echoOnLoad(st, plain);
    expect([plain.flat, plain.each]).toEqual([20, undefined]);
    // live: a WHETSTONE + LONG HAUL slug (20 stat, 10 FOR EACH) striking a SIPHON hull, switch on, is remembered in parts
    const lh = withItem(withItem(furnaceBench(), east(30, "whetstone", 5)), item(31, "longhaul", 3, 3, 0));
    const bt = withScaleRigs(() => new Battle(lh, heroStartBuild("siphon"), SEED));
    let mem: ReturnType<typeof echoOf> | null = null;
    while (bt.t < 20 && !bt.over && !mem?.each) { bt.step(); bt.drainEvents(); mem = bt.sides[1].race?.echo.mem ?? null; }
    expect(mem).toMatchObject({ flat: 20, each: 10 });
    const off = new Battle(lh, heroStartBuild("siphon"), SEED);
    let offMem: ReturnType<typeof echoOf> | null = null;
    while (off.t < 20 && !off.over && !(offMem && offMem.flat >= 30)) { off.step(); off.drainEvents(); offMem = off.sides[1].race?.echo.mem ?? null; }
    expect(offMem).toEqual({ flat: 30, burn: 0, shock: false, fray: 0 }); // off: the 20 + 10 as one stat flat, as today
  });
});
