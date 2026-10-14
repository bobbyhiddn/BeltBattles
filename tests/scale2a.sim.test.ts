// SCALE-2a (REQ-BFG-110, REQ-BFG-098, REQ-BFG-050; BRIEF-SCALE2a step 8 (a)-(h)): the scaling release's sim hooks behind
// SCALE_RIGS (src/sim/scale.ts). Switch on through withScaleRigs; the shipped switch stays off. No shipped def holds
// `reads`: these tests register test-only defs (ids "s2a...") in ITEMS and take them out again.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AMMO, ITEMS, START_LIVES, type GateEffect, type ItemDef, type ReadSpec } from "../src/sim/content";
import { Battle, simulate, type Payload, type Projectile, type SideState, type SimEvent } from "../src/sim/battle";
import {
  SCALE_RIGS, burnStacks, buildReads, flatOf, heartsLost, scaleRules, startHearts, withScaleRigs,
} from "../src/sim/scale";
import { clearStarCache, effectAt } from "../src/sim/stars";
import { HEARTS_START } from "../src/sim/hearts"; // SCALE-2c M0 (REQ-BFG-098): the hearts swap
import { drakeConvert, pressureBonus } from "../src/sim/cores";
import { payloadDamage, type Build } from "../src/sim/deck";
import { boostable, overclocked } from "../src/sim/overclock";
import { pct } from "../src/sim/pct";
import { battleRecordFor } from "../src/net/replay";
import { Arena } from "../src/game/arena";
import { SEED, barge, furnaceBench, item, withItem, withMod } from "./wave3.helpers";

// ---------------------------------------------------------------------------------------------- test-only defs

/** A 1-arrow (common, shape I) test rig with a reader line; `stars`: its ★2 and ★3 `each`. */
function rig(id: string, reads: ReadSpec, stars?: [number, number], extra: GateEffect = {}): ItemDef {
  return {
    id, name: id.toUpperCase(), kind: "gate", rarity: "common", price: 3, size: 1, merchant: "alchemist", desc: [], tags: ["FORGE"],
    gate: { ...extra, reads },
    ...(stars ? { levels: { 2: { gate: { reads: { ...reads, each: stars[0] } } }, 3: { gate: { reads: { ...reads, each: stars[1] } } } } } : {}),
  };
}
/** A gun part (kind "mod") with a reader line, read at its gun's shot. */
function part(id: string, reads: ReadSpec): ItemDef {
  return { id, name: id.toUpperCase(), kind: "mod", rarity: "rare", price: 5, size: 1, merchant: "quartermaster", desc: [], tags: ["BURST"], mod: { reads } };
}
const TEST_DEFS: Record<string, ItemDef> = {
  s2akindling: rig("s2akindling", { count: "foeBurn", each: 3, give: "dmg" }, [5, 8]), // KINDLING-style: +3/+5/+8 DMG a foe BURN
  s2akeg: rig("s2akeg", { count: "ownHits", each: 3, give: "dmg" }), // POWDER KEG-style
  s2agrudge: rig("s2agrudge", { count: "heartsLost", each: 6, give: "dmg" }), // GRUDGE ROD-style
  s2atrophy: rig("s2atrophy", { count: "wins", each: 8, give: "dmg" }), // TROPHY CHAIN-style
  s2ascar: rig("s2ascar", { count: "hitsTaken", each: 2, give: "plate" }), // SCAR TISSUE-style
  s2aspall: part("s2aspall", { count: "hitsTaken", each: 3, give: "dmg" }), // SPALL CATCHER-style (a gun part, at the shot)
  s2apile: part("s2apile", { count: "waiting", each: 5, give: "dmg" }), // a waiting reader at the shot (PRESSURE's count)
  s2aswap: rig("s2aswap", { count: "foeBurn", each: 8, give: "dmg" }, undefined, { flat: 20 }), // (h): a stat row + a reader
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
 *  hits tile 5 - y; a II rig at (3, y) at rot 0 hits it with its east arrow (its west one lands on nothing). */
const east = (uid: number, def: string, y: number, stars = 1) => item(uid, def, 3, y, 1, stars);
const twin = (uid: number, def: string, y: number, stars = 1) => item(uid, def, 3, y, 0, stars);
/** Deck b with rig `def` at (3, y), turned so it works the bench's tile 5 - y (a T or X rig's arrows depend on its turn). */
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

interface Shot { dmg: number; burn: number; p: Payload; flat: number; each?: number }
/** Step a battle (made inside `make`, so the switch it was made under holds) for `secs`, handing each tick's events to
 *  `on`; returns the battle and every side-0 projectile once (its damage, its BURN and its payload as fired). */
function play(make: () => Battle, secs: number, on?: (ev: SimEvent[], bt: Battle) => void): { bt: Battle; shots: Shot[] } {
  const bt = make(), seen = new Set<number>(), shots: Shot[] = [];
  while (bt.t < secs && !bt.over) {
    bt.step();
    const ev = bt.drainEvents();
    for (const pr of bt.projectiles as Projectile[]) {
      if (pr.from !== 0 || seen.has(pr.id)) continue;
      seen.add(pr.id);
      shots.push({ dmg: pr.dmg, burn: pr.burn ?? pr.payload.burn, p: pr.payload, flat: pr.payload.flat, each: pr.payload.each });
    }
    on?.(ev, bt);
  }
  return { bt, shots };
}
/** The shots whose slug took all `n` rig hits (the first slugs pass before the rigs come online). */
const full = (shots: Shot[], n: number): Shot[] => shots.filter((s) => s.p.prior === n);
/** The shot damage a payload makes on the bench's gun before any core shape: payloadDamage of its slug with `flat`. */
const slugDmg = (p: Payload, flat: number): number =>
  payloadDamage(p.base ?? AMMO[p.ammo].base, AMMO[p.ammo].rideScale, p.ride, p.mult, flat + (p.heatBonus ?? 0), 10);
/** A process event of rig `uid` on side 0. */
const procOf = (ev: SimEvent[], uid: number) =>
  ev.filter((e): e is Extract<SimEvent, { type: "process" }> => e.type === "process" && e.side === 0 && e.gate === uid);
type Priv = {
  readCount(s: SideState, count: ReadSpec["count"], at: { route?: number; queued?: number }): number;
  giveRead(s: SideState, r: ReadSpec, count: number, p: Payload, gate?: number): { amount: number; kind: string } | undefined;
  forEach(p: Payload, n: number): void;
  impact(pr: Projectile): void;
};
const priv = (bt: Battle) => bt as unknown as Priv;
const slug = (id = 1): Payload => ({ id, ammo: "plain", ride: 0, mult: 1, flat: 0, burn: 0, shock: false, prior: 0, factory: 0, copy: false });
/** A projectile from side `from` that lands `dmg` on the other side's bare hull. */
const shot = (from: 0 | 1, dmg: number): Projectile => ({
  id: 999, from, turret: 0, payload: slug(998), dmg, t: 0, flight: 0,
  target: { kind: "hull", ref: -1, cell: -1, x: 60, y: 60, weight: 1 }, tx: 60, ty: 60, heavy: false,
});

// ---------------------------------------------------------------------------------------------- the switch

describe("SCALE-2a: the switch", () => {
  it("ships off; withScaleRigs turns it on and puts it back, even on a throw; a Battle reads it once", () => {
    expect(SCALE_RIGS).toBe(false);
    expect(scaleRules()).toBe(false);
    expect(withScaleRigs(() => scaleRules())).toBe(true);
    expect(() => withScaleRigs(() => { throw new Error("x"); })).toThrow("x");
    expect(scaleRules()).toBe(false);
    const on = withScaleRigs(() => new Battle(furnaceBench(), barge(), SEED));
    expect(on.scaleRigs).toBe(true);
    expect(new Battle(furnaceBench(), barge(), SEED).scaleRigs).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------- (a)

describe("SCALE-2a (a): burnStacks", () => {
  it("sums dps over the hull's entries: 3 + 5 = 8, not 2 (burns.length counts entries)", () => {
    const hull = { burns: [{ dps: 3, t: 3 }, { dps: 5, t: 2 }] };
    expect(burnStacks(hull)).toBe(8);
    expect(hull.burns.length).toBe(2);
    expect(burnStacks({ burns: [] })).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------- (b)

describe("SCALE-2a (b): the order of operations (REQ-BFG-110)", () => {
  // WHETSTONE (a stat row, +20) at tile 0, LONG HAUL ★1 (+10 for each earlier hit: 1 here) at tile 2
  const deck = (): Build => withItem(withItem(furnaceBench(), east(30, "whetstone", 5)), twin(31, "longhaul", 3));
  const W = effectAt("whetstone", 1).gate!.flat!, LH = effectAt("longhaul", 1).gate!.perPriorGate!;

  it("steps 2 and 4: a stat row goes to p.flat and a FOR EACH add to p.each (on); off, both add to p.flat as before", () => {
    const on = full(play(() => withScaleRigs(() => new Battle(deck(), barge(), SEED)), 10).shots, 2);
    const off = full(play(() => new Battle(deck(), barge(), SEED), 10).shots, 2);
    expect(on.length).toBeGreaterThan(3);
    for (const s of on) expect([s.flat, s.each]).toEqual([W, LH]);
    for (const s of off) expect([s.flat, s.each]).toEqual([W + LH, undefined]);
    // every reader but DRAKE reads the sum: the same shot damage either way (no core: the identity shot)
    expect(on.map((s) => s.dmg)).toEqual(off.map((s) => s.dmg));
    for (const s of on) expect(s.dmg).toBe(slugDmg(s.p, flatOf(s.p)));
  });

  it("step 3: DRAKE NOZZLE converts the stat rows' DMG only (on); off, it converts the FOR EACH DMG too, as today", () => {
    const withDrake = (): Build => withMod(deck(), 40, "drake", GUN, 1); // ★1: 25 DMG a BURN
    const c = effectAt("drake", 1).core!;
    const on = full(play(() => withScaleRigs(() => new Battle(withDrake(), barge(), SEED)), 10).shots, 2);
    const off = full(play(() => new Battle(withDrake(), barge(), SEED), 10).shots, 2);
    expect(off.length).toBeGreaterThan(3);
    expect(on.length).toBeGreaterThan(3);
    for (const s of on) {
      const conv = drakeConvert(c, s.flat); // 20 of stat DMG: no BURN
      expect(conv.stacks).toBe(0);
      expect(s.burn).toBe(s.p.burn + conv.stacks);
      expect(s.dmg).toBe(slugDmg(s.p, s.flat - conv.used + s.each!)); // stat - DRAKE's used + FOR EACH
    }
    for (const s of off) {
      const conv = drakeConvert(c, s.flat); // 30, the LONG HAUL's 10 with it: 1 BURN
      expect(conv.stacks).toBe(1);
      expect(s.burn).toBe(s.p.burn + 1);
      expect(s.dmg).toBe(slugDmg(s.p, s.flat - conv.used));
    }
  });

  it("step 5: a % at the shot (HULLBREAKER) applies once, to the total with the FOR EACH DMG in it", () => {
    expect(ITEMS.hullbreaker.core?.routine).toBe("hullbreaker");
    const mul = effectAt("hullbreaker", 1).core!.hullMul!;
    const on = full(play(() => withScaleRigs(() => new Battle(withMod(deck(), 40, "hullbreaker", GUN, 1), barge(), SEED)), 10).shots, 2);
    expect(on.length).toBeGreaterThan(3);
    for (const s of on) {
      expect(s.each).toBe(LH);
      expect(s.dmg).toBe(pct(slugDmg(s.p, flatOf(s.p)), 100 * mul));
      // the FOR EACH DMG is multiplied with the rest, not added after the %
      expect(s.dmg).not.toBe(pct(slugDmg(s.p, s.flat), 100 * mul) + s.each!);
    }
  });

  it("a split is a copy: SPLITTER scales both accumulators", () => {
    // LONG HAUL at tile 2, then a SPLITTER at tile 4: each copy keeps a share of both
    const b = aimed(withItem(withItem(furnaceBench(), east(30, "whetstone", 5)), twin(31, "longhaul", 3)), 32, "splitter", 1);
    const mult = effectAt("splitter", 1).gate!.split!.mult;
    const on = full(play(() => withScaleRigs(() => new Battle(b, barge(), SEED)), 20).shots, 3);
    expect(on.length).toBeGreaterThan(3);
    for (const s of on) expect([s.flat, s.each]).toEqual([pct(W, 100 * mult), pct(LH, 100 * mult)]);
  });
});

// ---------------------------------------------------------------------------------------------- (c)

describe("SCALE-2a (c): THE GUARD, DRAKE NOZZLE never turns FOR EACH DMG into BURN", () => {
  // TEMPER ★1 (1 BURN a slug) at tile 0, a ★3 KINDLING-style rig (+8 DMG for each BURN on the foe) at tile 2, a ★3 DRAKE
  // NOZZLE (13 DMG a BURN) on the gun. The kiln stamps 0.8 slugs a second, past the loop's 0.54 (REPORT-SCALE1 3.2)
  const deck = (kindling: boolean): Build => {
    let b = withItem(furnaceBench(), east(30, "temper", 5));
    if (kindling) b = withItem(b, east(31, "s2akindling", 3, 3));
    return withMod(b, 40, "drake", GUN, 3);
  };
  const maxBurn = (make: () => Battle, secs = 40): { max: number; bt: Battle } => {
    let max = 0;
    const { bt } = play(make, secs, (_ev, b) => { max = Math.max(max, burnStacks(b.sides[1].hull)); });
    return { max, bt };
  };

  it("★3 KINDLING before ★3 DRAKE doesn't compound: the foe's BURN stays as it is without KINDLING, over a long fight", () => {
    expect(effectAt("s2akindling", 3).gate!.reads!.each).toBe(8);
    expect(effectAt("drake", 3).core!.flatPerBurn).toBe(13);
    const without = maxBurn(() => withScaleRigs(() => new Battle(deck(false), barge(), SEED)));
    const guarded = maxBurn(() => withScaleRigs(() => new Battle(deck(true), barge(), SEED)));
    expect(without.max).toBeGreaterThan(0);
    expect(guarded.max).toBe(without.max); // KINDLING adds DMG only: no BURN comes of it
    expect(guarded.bt.sides[0].stats.burnDealt).toBe(without.bt.sides[0].stats.burnDealt);
    expect(guarded.bt.sides[0].stats.damage).toBeGreaterThan(without.bt.sides[0].stats.damage); // its DMG did land
    // the same fight with the guard taken out (FOR EACH DMG into p.flat, as one accumulator would): the loop compounds
    const unguarded = maxBurn(() => withScaleRigs(() => {
      const bt = new Battle(deck(true), barge(), SEED);
      priv(bt).forEach = (p: Payload, n: number) => { p.flat += n; };
      return bt;
    }));
    expect(unguarded.max).toBeGreaterThan(3 * guarded.max);
    if (process.env.BB_TABLES) console.log(`guard: max foe BURN without KINDLING ${without.max}, guarded ${guarded.max}, unguarded ${unguarded.max}; burnDealt ${without.bt.sides[0].stats.burnDealt} / ${guarded.bt.sides[0].stats.burnDealt} / ${unguarded.bt.sides[0].stats.burnDealt}; damage ${without.bt.sides[0].stats.damage} / ${guarded.bt.sides[0].stats.damage} / ${unguarded.bt.sides[0].stats.damage}; unguarded ended at ${unguarded.bt.t.toFixed(2)} s`);
  });

  it("the live pair QUENCH TANK ★3 + DRAKE NOZZLE ★3: off, DRAKE converts QUENCH's DMG as today; on, it doesn't", () => {
    // TEMPER ★3 (4 BURN) at tile 0, QUENCH TANK ★3 (each BURN on the slug becomes 70 DMG) at tile 2, DRAKE ★3 on the gun
    const b = withMod(withItem(withItem(furnaceBench(), east(30, "temper", 5, 3)), twin(31, "quench", 3, 3)), 40, "drake", GUN, 3);
    const c = effectAt("drake", 3).core!, q = 4 * effectAt("quench", 3).gate!.quench!.perBurn; // 280
    const off = full(play(() => new Battle(b, barge(), SEED), 12).shots, 2);
    const on = full(play(() => withScaleRigs(() => new Battle(b, barge(), SEED)), 12).shots, 2);
    expect(off.length).toBeGreaterThan(3);
    expect(on.length).toBe(off.length);
    for (const s of off) {
      expect([s.flat, s.each]).toEqual([q, undefined]);
      expect(s.burn).toBe(drakeConvert(c, q).stacks); // 21 BURN out of QUENCH's 280
      expect(s.burn).toBe(21);
    }
    for (const s of on) {
      expect([s.flat, s.each]).toEqual([0, q]);
      expect(s.burn).toBe(0); // DRAKE sees no stat DMG
      expect(s.dmg).toBe(slugDmg(s.p, q)); // QUENCH's 280 stays DMG on the shot
    }
  });
});

// ---------------------------------------------------------------------------------------------- (d), (e)

describe("SCALE-2a (d): a rig's own hits", () => {
  it("N after N hits, this hit included; reset the next battle; kept only with the switch on", () => {
    const b = withItem(furnaceBench(), east(30, "s2akeg", 3));
    const runOnce = (): { adds: number[]; bt: Battle } => {
      const adds: number[] = [];
      const { bt } = play(() => withScaleRigs(() => new Battle(b, barge(), SEED)), 12, (ev) => {
        for (const e of procOf(ev, 30)) adds.push(e.add?.amount ?? 0);
      });
      return { adds, bt };
    };
    const first = runOnce();
    expect(first.adds.length).toBeGreaterThan(4);
    first.adds.forEach((a, i) => expect(a).toBe(3 * (i + 1))); // the first hit counts itself: +3, then +6, +9...
    expect(first.bt.sides[0].gates.find((g) => g.uid === 30)!.ownHits).toBe(first.adds.length);
    const second = runOnce();
    expect(second.adds[0]).toBe(3); // a new battle starts at 0
    expect(second.adds).toEqual(first.adds);
    const off = play(() => new Battle(b, barge(), SEED), 12).bt;
    expect(off.sides[0].gates.find((g) => g.uid === 30)!.ownHits).toBeUndefined();
  });
});

describe("SCALE-2a (e): hits taken", () => {
  it("every enemy impact counts, a SHIELD-blocked one too; kept only with the switch on", () => {
    const bt = withScaleRigs(() => new Battle(furnaceBench(), barge(), SEED));
    const s = bt.sides[0];
    bt.gainShield(s, 1);
    priv(bt).impact(shot(1, 60)); // a WARD (the sim's shield) stops it
    expect(s.blocked).toBe(1);
    expect(s.hitsTaken).toBe(1);
    priv(bt).impact(shot(1, 60)); // this one lands
    expect(s.hitsTaken).toBe(2);
    expect(bt.sides[1].hitsTaken).toBeUndefined(); // nothing hit the barge
    const off = new Battle(furnaceBench(), barge(), SEED);
    off.gainShield(off.sides[0], 1);
    priv(off).impact(shot(1, 60));
    expect(off.sides[0].hitsTaken).toBeUndefined();
    expect(Object.keys(off.sides[0].stats)).not.toContain("hitsTaken"); // never a SideStats key (the pinned fp reads them all)
  });
});

// ---------------------------------------------------------------------------------------------- (f)

describe("SCALE-2a (f): hearts lost, passed in the way wins are", () => {
  it("reach the Battle for you and the ghost; default 0; whole and clamped at 0; off, not kept", () => {
    const a = furnaceBench(), b = barge();
    withScaleRigs(() => {
      const bt = new Battle(a, b, SEED, undefined, undefined, [3, 7]);
      expect([bt.sides[0].heartsLost, bt.sides[1].heartsLost]).toEqual([3, 7]);
      const none = new Battle(a, b, SEED);
      expect([none.sides[0].heartsLost, none.sides[1].heartsLost]).toEqual([0, 0]);
      const odd = new Battle(a, b, SEED, undefined, undefined, [-2, 2.7]);
      expect([odd.sides[0].heartsLost, odd.sides[1].heartsLost]).toEqual([0, 2]);
      const sim = simulate(a, b, SEED, 10, undefined, undefined, [1, 2]);
      expect([sim.sides[0].heartsLost, sim.sides[1].heartsLost]).toEqual([1, 2]);
      const ar = new Arena(a, b, SEED, null, undefined, undefined, undefined, [4, 1]); // the battle screen's path
      expect([ar.b.sides[0].heartsLost, ar.b.sides[1].heartsLost]).toEqual([4, 1]);
    });
    const off = new Battle(a, b, SEED, undefined, undefined, [3, 7]);
    expect(off.sides[0].heartsLost).toBeUndefined();
  });

  // SCALE-2c M0 (REQ-BFG-098): the RETUNE-1 hearts swap. Before live-099 this pinned START_LIVES (5) start hearts; with
  // HEARTS on (HULL-ON) a run starts on HEARTS_START (10), and a run started before the bump keeps its own 5 (livesCap).
  it("the start-hearts function and heartsLost: HEARTS_START with HEARTS on, a run's own scale, never below 0", () => {
    expect(startHearts()).toBe(HEARTS_START);
    expect(startHearts({ lives: 7, hearts: true })).toBe(HEARTS_START);
    expect(startHearts({ lives: 3 })).toBe(START_LIVES); // a run started before HEARTS: 5
    expect(heartsLost(HEARTS_START)).toBe(0);
    expect(heartsLost(HEARTS_START - 3)).toBe(3);
    expect(heartsLost(1)).toBe(HEARTS_START - 1);
    expect(heartsLost(12)).toBe(0); // never below 0
    expect(heartsLost(6, { lives: 6, hearts: true })).toBe(4);
    expect(heartsLost(3, { lives: 3 })).toBe(START_LIVES - 3);
  });

  it("the record keeps them (and wins) only when a side reads them, and a replay of it reads them back", () => {
    const grudge = withItem(furnaceBench(), east(30, "s2agrudge", 3));
    withScaleRigs(() => {
      expect(buildReads(grudge, "heartsLost")).toBe(true);
      expect(buildReads(furnaceBench(), "heartsLost")).toBe(false);
      const bt = new Battle(grudge, barge(), SEED, [2, 5], undefined, [3, 1]);
      expect(bt.record.lost).toEqual([3, 1]);
      expect(bt.record.wins).toBeUndefined(); // no wins reader aboard
      expect(new Battle(furnaceBench(), barge(), SEED, [2, 5], undefined, [3, 1]).record.lost).toBeUndefined();
      expect(battleRecordFor(grudge, barge(), SEED, [2, 5], undefined, [3, 1]).lost).toEqual([3, 1]);
      expect(battleRecordFor(furnaceBench(), barge(), SEED, [2, 5], undefined, [3, 1]).lost).toBeUndefined();
      const r = bt.record, again = new Battle(r.builds[0], r.builds[1], r.seed, r.wins, r.day, r.lost);
      expect(again.sides[0].heartsLost).toBe(3);
    });
    expect(new Battle(grudge, barge(), SEED, [2, 5], undefined, [3, 1]).record.lost).toBeUndefined(); // off
    expect(battleRecordFor(grudge, barge(), SEED, [2, 5], undefined, [3, 1]).lost).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------- (g)

describe("SCALE-2a (g): every ReadCount reads at its moment", () => {
  const fresh = (b: Build = furnaceBench(), wins?: [number, number], lost?: [number, number]) =>
    withScaleRigs(() => new Battle(b, barge(), SEED, wins, undefined, lost));

  it("foeBurn: the foe's BURN stacks (the sum of dps) at the hit", () => {
    const b = withItem(furnaceBench(), east(30, "s2akindling", 3)); // ★1: +3 a BURN
    let before = 0, checked = 0;
    const bt = fresh(b);
    bt.sides[1].hull.burns.push({ dps: 3, t: 1e9 }, { dps: 5, t: 1e9 }); // two entries, 8 stacks
    while (bt.t < 10) {
      before = burnStacks(bt.sides[1].hull); // a step's hits come before its impacts and its BURN ticks
      bt.step();
      for (const e of procOf(bt.drainEvents(), 30)) {
        expect(e.add).toEqual({ amount: 3 * before, kind: "dmg" });
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(3);
    expect(before).toBe(8);
  });

  it("beltSlugs: the slugs on the belt it hits, never below 1; a gun part reads 0", () => {
    const bt = fresh(), s = bt.sides[0], r = s.routes[0];
    r.ammo.length = 0;
    expect(priv(bt).readCount(s, "beltSlugs", { route: 0 })).toBe(1); // the hit slug is on it
    for (let i = 0; i < 4; i++) r.ammo.push({ p: slug(i + 1), s: 100 - 15 * i, processed: -1, blocked: i > 0 });
    expect(priv(bt).readCount(s, "beltSlugs", { route: 0 })).toBe(4); // those backed up at the gun too
    expect(priv(bt).readCount(s, "beltSlugs", {})).toBe(0);
  });

  it("ownPlate: your plate at the hit; with per 10, whole tens rounded down (239 is 23)", () => {
    const bt = fresh(), s = bt.sides[0], p = slug();
    bt.addPlate(s, 239);
    expect(priv(bt).readCount(s, "ownPlate", {})).toBe(239);
    expect(priv(bt).giveRead(s, { count: "ownPlate", each: 5, per: 10, give: "dmg" }, 239, p)).toEqual({ amount: 115, kind: "dmg" });
    expect(p.each).toBe(115);
  });

  it("ownShield: your shield pips, at most 3", () => {
    const bt = fresh(), s = bt.sides[0];
    expect(priv(bt).readCount(s, "ownShield", {})).toBe(0);
    bt.gainShield(s, 2);
    expect(priv(bt).readCount(s, "ownShield", {})).toBe(2);
    bt.gainShield(s, 5);
    expect(priv(bt).readCount(s, "ownShield", {})).toBe(3);
  });

  it("hitsTaken at the shot (a gun part): its gun's shots read the hits on your ship", () => {
    const b = withMod(furnaceBench(), 40, "s2aspall", GUN);
    let fires = 0;
    play(() => { const bt = fresh(b); bt.sides[0].hitsTaken = 7; return bt; }, 10, (ev) => {
      for (const e of ev) if (e.type === "fire" && e.side === 0) {
        expect(e.add).toEqual({ amount: 21, kind: "dmg" });
        fires++;
      }
    });
    expect(fires).toBeGreaterThan(3);
  });

  it("hitsTaken at the hit (a rig giving PLATE): onto your hull at once", () => {
    const b = withItem(furnaceBench(), east(30, "s2ascar", 3));
    let hits = 0;
    const { bt } = play(() => { const bt = fresh(b); bt.sides[0].hitsTaken = 5; return bt; }, 6, (ev) => {
      for (const e of procOf(ev, 30)) {
        expect(e.add).toEqual({ amount: 10, kind: "plate" });
        hits++;
      }
    });
    expect(hits).toBeGreaterThan(1);
    expect(bt.sides[0].plate.gained).toBe(10 * hits);
  });

  it("heartsLost and wins at the hit (wins read even without WARLORD'S DUE)", () => {
    const b = withItem(withItem(furnaceBench(), east(30, "s2agrudge", 3)), east(31, "s2atrophy", 1));
    let g = 0, t = 0;
    const { bt } = play(() => fresh(b, [3, 0], [4, 0]), 8, (ev) => {
      for (const e of procOf(ev, 30)) { expect(e.add).toEqual({ amount: 24, kind: "dmg" }); g++; }
      for (const e of procOf(ev, 31)) { expect(e.add?.amount).toBe(24 + 0); t++; }
    });
    expect(g).toBeGreaterThan(1);
    expect(t).toBeGreaterThan(1);
    expect(bt.sides[0].wins).toBe(3);
    expect(bt.record.wins).toEqual([3, 0]);
  });

  it("waiting at the shot: PRESSURE BREECH's own count (waiting + chamber + store); a rig reads 0", () => {
    const bt = fresh(), s = bt.sides[0];
    expect(priv(bt).readCount(s, "waiting", { queued: 4 })).toBe(4);
    expect(priv(bt).readCount(s, "waiting", { route: 0 })).toBe(0);
    // on a PRESSURE BREECH: each shot's add is perQueued x queued + 5 x queued, for the one `queued` both read
    const b = withMod(withMod(furnaceBench(), 40, "pressure", GUN), 41, "s2apile", GUN);
    let fires = 0;
    play(() => fresh(b), 12, (ev, bt2) => {
      const c = bt2.sides[0].turrets.find((tu) => tu.index === GUN)!.core.spec;
      for (const e of ev) if (e.type === "fire" && e.side === 0) {
        const q = [1, 2, 3, 4, 5, 6, 7, 8].find((n) => pressureBonus(c, n) + 5 * n === e.add?.amount);
        expect(q, `add ${e.add?.amount}`).toBeDefined();
        fires++;
      }
    });
    expect(fires).toBeGreaterThan(3);
  });

  it("ownHits reads its own count (see (d)); foePoison is reserved for SCALE-2b and reads 0", () => {
    const bt = fresh(), s = bt.sides[0];
    expect(priv(bt).readCount(s, "foePoison", {})).toBe(0);
    expect(priv(bt).readCount(s, "ownHits", {})).toBe(0); // a gun part has no hits of its own
  });

  it("give plate stops at 240; give heal heals through heal() (BURN halves it)", () => {
    const bt = fresh(), s = bt.sides[0];
    expect(priv(bt).giveRead(s, { count: "ownShield", each: 1, give: "plate" }, 300, slug())).toEqual({ amount: 240, kind: "plate" });
    expect(s.plate.plate).toBe(240);
    expect(priv(bt).giveRead(s, { count: "ownShield", each: 1, give: "plate" }, 5, slug())).toBeUndefined(); // full
    s.hull.hp -= 100;
    const hp = s.hull.hp;
    expect(priv(bt).giveRead(s, { count: "ownShield", each: 1, give: "heal" }, 40, slug(), 30)).toEqual({ amount: 40, kind: "heal" });
    expect(s.hull.hp).toBe(hp + 40);
    expect(bt.events.at(-1)).toEqual({ type: "heal", side: 0, amount: 40, source: "reads", gate: 30 });
    s.hull.burns.push({ dps: 1, t: 3 });
    expect(priv(bt).giveRead(s, { count: "ownShield", each: 1, give: "heal" }, 40, slug(), 30)).toEqual({ amount: 20, kind: "heal" });
    expect(priv(bt).giveRead(s, { count: "ownShield", each: 3, give: "dmg" }, 0, slug())).toBeUndefined(); // 0: nothing, no add
  });

  it("a star raises `each` through levels; an OVERCLOCKER doubles it, and only with the switch on", () => {
    expect([1, 2, 3].map((n) => effectAt("s2akindling", n).gate!.reads!.each)).toEqual([3, 5, 8]);
    const e = effectAt("s2akeg", 1).gate!;
    expect(boostable(e)).toBe(false); // off: `reads` is ignored, so nothing to double
    withScaleRigs(() => {
      expect(boostable(e)).toBe(true);
      expect(overclocked(e).reads!.each).toBe(6);
    });
  });
});

// ---------------------------------------------------------------------------------------------- (h)

describe("SCALE-2a (h): the switch off ignores `reads`", () => {
  it("a deck holding a `reads` test rig fights exactly as the same deck without the field", () => {
    const b = withItem(withItem(furnaceBench(), east(30, "s2aswap", 3)), east(31, "temper", 5));
    const fight = () => {
      const log: string[] = [];
      const { bt } = play(() => new Battle(b, barge(), SEED), 40, (ev) => { log.push(JSON.stringify(ev)); });
      return { log, over: [bt.winner, bt.ticks, bt.sides[0].hull.hp, bt.sides[1].hull.hp], stats: [bt.sides[0].stats, bt.sides[1].stats] };
    };
    const withReads = fight();
    const def = ITEMS_RW.s2aswap;
    ITEMS_RW.s2aswap = { ...def, gate: { flat: 20 } };
    clearStarCache();
    try {
      const without = fight();
      expect(withReads.over).toEqual(without.over);
      expect(withReads.stats).toEqual(without.stats);
      expect(withReads.log).toEqual(without.log);
    } finally {
      ITEMS_RW.s2aswap = def;
      clearStarCache();
    }
    // and the same deck with the switch on does read it (so the test above tested something)
    const on = play(() => withScaleRigs(() => new Battle(b, barge(), SEED)), 40).bt;
    expect(on.sides[0].stats.damage).not.toBe(withReads.stats[0].damage);
  });
});
