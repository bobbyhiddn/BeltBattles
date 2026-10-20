// HULL-1b (REQ-BFG-070; backlog #370 and #356): the star-ladder pass behind LADDER_FIX (src/sim/ladderFix.ts, off). With the
// switch off every piece is bb-0.9.7's (the tripwire tests keep their bb-0.9.7 pins; AZ-BUMP re-rules them at the bump).
// With it on, each fixed piece's ladder rises at every star on its tripwire's own bench, pinned here by order. BB_TABLES=1
// prints each bench's numbers, off and on (the REPORT's before/after).
// AZ-BUMP (the flip, LADDER_FIX): the switch ships on now; each off half below sets it off itself (they read the default).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Battle, type BeltAmmo, type Payload } from "../src/sim/battle";
import { AMMO, BURN_DPS, BURN_TIME, HEROES, ITEMS, TICK } from "../src/sim/content";
import { payloadDamage, rotField, walkRoute, type Build, type Placed } from "../src/sim/deck";
import { migrateInlineGates } from "../src/sim/beltside";
import { PLANS, planBuild } from "../src/sim/rivalBuilds";
import { LIFT } from "./starRows";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { PLAYER_DAYS, playerRun } from "../src/sim/harness/player";
import { LADDER_DEFS, LADDER_FIX, ladderFixRules, setLadderFix, withLadderFix } from "../src/sim/ladderFix";
import { withNpcDay } from "../src/sim/npcDay"; // AZ-BUMP (the flip, NPC_DAY): the par player's bb-0.9.7 runs, the NPC day off
import { withHullScale } from "../src/sim/hullScale"; // AZ-BUMP (the flip, HULL_SCALE): the same runs, 0.9.7's gold table
import { withShapes } from "../src/sim/shapes"; // SHAPES-1 flip: the same runs, SHAPES off
import { withPlainRigs } from "../src/sim/plainRigs"; // BUMP-1D: the same runs, PLAIN_RIGS off
import { withShapes2 } from "../src/sim/shapes2"; // BUMP-1D: the same runs, SHAPES2 off
import { withGuard } from "../src/sim/guard"; // HULL-ON (the flip): the same runs, all eight switches off (bb-0.9.7's)
import { withOpenRunes } from "../src/sim/openRunes"; // HULL-ON (the flip)
import { withFreeJoins } from "../src/sim/freeJoins"; // HULL-ON (the flip)
import { withHearts } from "../src/sim/hearts"; // HULL-ON (the flip)
import { withPick } from "../src/net/pick"; // HULL-ON (the flip)
import { effectAt } from "../src/sim/stars";
import { GATES_IDS, withGates } from "../src/sim/gates"; // BUMP-1F (GATES on by default): the off half and the key-order pin
import { withEnchant } from "../src/sim/enchant"; // BUMP-1F (ENCHANT on by default): the off half
import { SCALE_IDS, SCALE_RIGS, scaleRules, setScaleRigs, withScaleRigs } from "../src/sim/scale"; // BUMP-1E: the scaling rules ship on; the ladder pass's pins are read with them off (oldWorld below)
import { barge, bench, SEED } from "./arsenal.bench";
import { K, item, withItem, withMod } from "./wave3.helpers";

const log = (s: string) => { if (process.env.BB_TABLES) console.log(s); };

// BUMP-1E (the scaling rules ship on: SCALE_RIGS, bb-0.12.0; this file was written when they shipped off, 0.9.11): the HULL-1b pins are bb-0.9.7's star-ladder pass on the BASE pieces,
// QUENCH TANK's ★1 30 -> 40 a BURN among them (a piece the scaling rules rework into KINDLING: a reader of the foe's BURN, no `quench`), so each describe that toggles the ladder switch runs
// with the scaling switch OFF (oldWorld: beforeEach/afterEach, the shipped value put back; the Battles here are made inside each test). THE LADDER TOGGLE HAZARD: ladderFix.ts swaps
// ITEMS.quench to its fixed or base def whatever the scaling switch says, so setLadderFix(false) then (true) with the scaling rules ON leaves the ladder-fixed QUENCH TANK where KINDLING stands
// (measured: ITEMS.quench QUENCH TANK ★1 40 a BURN, scaleRules() true, until the scaling switch is flipped off and on again), and every seeded draw after it, the par player's buys among them,
// reads that half-world. With the scaling switch off first and back last, its own swap back writes KINDLING last: the same rule as the ITEMS key-order hazard (the seven ids are the last keys in ITEMS)
function oldWorld(): void {
  beforeEach(() => setScaleRigs(false));
  afterEach(() => setScaleRigs(SCALE_RIGS));
}

describe("HULL-1b the switch (REQ-BFG-070)", () => {
  oldWorld();
  it("LADDER_FIX is off in this rules version; withLadderFix puts it back even on a throw; off, every fixed def is content.ts's own object", () => {
    // AZ-BUMP (the flip, LADDER_FIX): ships on (was toBe(false) twice: "off in this rules version")
    expect(LADDER_FIX).toBe(true);
    expect(ladderFixRules()).toBe(true);
    // AZ-BUMP (the flip, LADDER_FIX): the off half (content.ts's own objects; withLadderFix puts the switch back off, even on
    // a throw) runs from the switch set off here, as it ran from the default before the flip; the shipped value is put back
    // at the end
    setLadderFix(false);
    const base = Object.fromEntries(Object.keys(LADDER_DEFS).map((id) => [id, ITEMS[id]]));
    expect(withLadderFix(() => ladderFixRules())).toBe(true);
    expect(ladderFixRules()).toBe(false);
    expect(() => withLadderFix(() => { throw new Error("x"); })).toThrow("x");
    expect(ladderFixRules()).toBe(false);
    for (const id of Object.keys(LADDER_DEFS)) expect(ITEMS[id], `${id} back to its own object`).toBe(base[id]);
    setLadderFix(true);
    expect(withLadderFix(() => ladderFixRules(), false)).toBe(false);
    expect(ladderFixRules()).toBe(true);
    setLadderFix(false);
    for (const id of Object.keys(LADDER_DEFS)) expect(ITEMS[id]).toBe(base[id]);
    setLadderFix(true); // AZ-BUMP (the flip, LADDER_FIX): the shipped value (AZ-BUMP's flip) for the later tests (was left off)
  });

  // AZ-BUMP (the flip, LADDER_FIX): the off halves (bb-0.9.7's numbers; bq / bk, the base defs) read the default, which ships
  // on now, so the test runs with the switch set off (withLadderFix(fn, false), put back even on a throw); its on halves are
  // withLadderFix's, as before
  it("the fixed numbers, on; bb-0.9.7's, off (the star cache follows the switch both ways)", () => withLadderFix(() => {
    const q = (s: number) => effectAt("quench", s).gate!.quench!.perBurn;
    const k = (s: number) => effectAt("stoker", s).gate!.stoke;
    const off = () => [[1, 2, 3].map(q), [1, 2, 3].map(k)];
    expect(off()).toEqual([[30, 50, 70], [0.2, 0.44, 0.7]]);
    expect(withLadderFix(off)).toEqual([[40, 50, 70], [0.2, 0.44, 0.85]]);
    expect(off()).toEqual([[30, 50, 70], [0.2, 0.44, 0.7]]);
    // nothing else of the fixed defs moves
    const bq = ITEMS.quench, bk = ITEMS.stoker;
    const [fq, fk] = withLadderFix(() => [ITEMS.quench, ITEMS.stoker]);
    expect({ ...fq, gate: null }).toEqual({ ...bq, gate: null });
    expect(fq.gate).toEqual({ ...bq.gate, quench: { ...bq.gate!.quench!, perBurn: 40 } });
    expect({ ...fk, levels: null }).toEqual({ ...bk, levels: null });
    expect(fk.levels).toEqual({ ...bk.levels, 3: { ...bk.levels![3], gate: { ...bk.levels![3]!.gate, stoke: 0.85 } } });
  }, false));
});

// ------------------------------------------------------------------ QUENCH TANK (tests/fb062.quench's own bench)

const payload = (burn: number): Payload => ({ id: 91, ammo: "plain", ride: 0, mult: 1, flat: 0, burn, shock: false, prior: 0, factory: 1, copy: false });
/** fb062.quench's quenched(): one arrow of a QUENCH at `stars` (the bench's tile 2) applied to a copy of `p`. */
function quenched(stars: number, p: Payload): Payload {
  const bt = new Battle(bench([["quench", 4, 3, stars]]), barge(), 7);
  const s = bt.sides[0];
  s.gates[0].online = true;
  const a: BeltAmmo = { p: { ...p }, s: 30, processed: 2, blocked: false };
  (bt as unknown as { applyHit: (s: unknown, a: BeltAmmo, h: unknown) => BeltAmmo[] }).applyHit(s, a, s.routes[0].gateAt[2][0]);
  return a.p;
}
/** fb062.quench's dealt(): the hull damage one fired payload deals to the barge, its Burn ticks included. */
function dealt(p: Payload): number {
  const bt = new Battle(bench(), barge(), 7);
  bt.sides[0].factories[0].timer = 1000;
  const hull = bt.sides[1].hull, hp0 = hull.hp;
  const tu = bt.sides[0].turrets[0];
  tu.stack.push({ ...p });
  tu.phase = "fire";
  bt.step();
  const shot = bt.projectiles[0];
  bt.projectiles = [];
  shot.target = { kind: "hull", ref: -1, cell: -1, x: 60, y: 60, weight: 1 };
  const sim = bt as unknown as { impact: (pr: unknown) => void; hullEffects: (dt: number) => void };
  sim.impact(shot);
  for (let t = 0; t < BURN_TIME + 1; t += TICK) sim.hullEffects(TICK);
  return hp0 - hull.hp;
}

describe("HULL-1b QUENCH TANK (backlog #370; tests/fb062.quench): ★1 pays more than the BURN it spends", () => {
  oldWorld(); // BUMP-1E: QUENCH TANK's old effect (the BURN it spends): the 0.9.11 piece, the shipped one is KINDLING
  it("on: no QUENCH < ★1 < ★2 < ★3 at every Burn count, and each spent BURN is worth at least its own damage", () => {
    const rows = (on: boolean) => withLadderFix(() => [1, 2, 3, 4, 5, 6, 7, 8, 10].map((k) => ({ k, none: dealt(payload(k)), d: [1, 2, 3].map((s) => dealt(quenched(s, payload(k)))) })), on);
    const off = rows(false), on = rows(true);
    for (const [name, r] of [["off", off], ["on", on]] as const) log(`QUENCH ${name}: ${r.map((x) => `${x.k} Burn none ${x.none} / ${x.d.join(" / ")}`).join("; ")}`);
    for (const r of on) {
      expect(r.d[0], `${r.k} Burn: no QUENCH < ★1`).toBeGreaterThan(r.none);
      expect(r.d[1], `${r.k} Burn: ★1 < ★2`).toBeGreaterThan(r.d[0]);
      expect(r.d[2], `${r.k} Burn: ★2 < ★3`).toBeGreaterThan(r.d[1]);
      // the step it gives: +10 / +20 / +40 a BURN over a BURN's own BURN_DPS x BURN_TIME
      expect([r.d[0] - r.none, r.d[1] - r.none, r.d[2] - r.none]).toEqual([10 * r.k, 20 * r.k, 40 * r.k]);
    }
    // off: bb-0.9.7's tripwire, unchanged (★1 = no QUENCH)
    for (const r of off) expect(r.d[0]).toBe(r.none);
    const own = BURN_DPS * BURN_TIME;
    withLadderFix(() => { for (const s of [1, 2, 3]) for (const k of [1, 4, 10]) expect((dealt(quenched(s, payload(k))) - dealt(payload(0))) / k, `★${s} ${k} Burn`).toBeGreaterThanOrEqual(own); });
  });
});

// ------------------------------------------------------------------ OVERDRIVE (tests/arsenal.decks; cap's oracle 37b12cb17a536589)

const ROOT = new URL("..", import.meta.url).pathname;
const PAR = JSON.parse(readFileSync(join(ROOT, "tests", "fixtures", "golden-060", "par.json"), "utf8")) as { decks: Record<string, Build> };
const HAND: Record<string, Placed[]> = { "par/furnace/6": [{ uid: 9011, def: "brake", x: 3, y: 3 }, { uid: 9012, def: "longhaul", x: 3, y: 1 }] };
/** arsenal.decks's native(): a golden-060 par deck migrated to rigs beside their tiles (the BRAKE / LONG HAUL port by hand). */
const native = (key: string) => (): Build => {
  const b = JSON.parse(JSON.stringify(PAR.decks[key])) as Build;
  migrateInlineGates(b);
  for (const h of HAND[key] ?? []) { b.items = b.items.filter((p) => p.uid !== h.uid); b.items.push({ ...h }); }
  return b;
};
const rig = (uid: number, def: string, x: number, y: number, rot = 0): Placed => ({ uid, def, x, y, ...rotField(def, rot) });
/** src/tooling.ts SHOWCASE.junction and .sides, copied (tooling pulls in the game's browser modules). */
const junction = (): Build => ({
  hero: "weaver", mods: [], beltCap: 28, hullBonus: 0,
  items: [{ uid: 1, def: "loom", x: 4, y: 6 }, rig(10, "overdrive", 5, 3), rig(11, "brake", 0, 4, 1), rig(12, "temper", 3, 3, 1)],
  routes: [
    { factory: 1, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(5, 2), K(5, 1), K(4, 1), K(4, 0)] },
    { factory: 1, cells: [K(5, 5), K(5, 4), K(6, 4), K(6, 3), K(6, 2), K(6, 1), K(7, 1), K(8, 1), K(8, 0)] },
    { factory: 1, cells: [K(3, 6), K(2, 6), K(1, 6), K(1, 5), K(1, 4), K(1, 3), K(1, 2), K(1, 1), K(1, 0)] },
  ],
});
const sides = (): Build => ({
  hero: "furnace", mods: [], beltCap: 18, hullBonus: 0,
  items: [
    { uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "press", x: 6, y: 6 },
    rig(10, "temper", 1, 3, 1), rig(11, "whetstone", 3, 3, 3), rig(12, "grease", 1, 4, 1), rig(13, "brake", 3, 2, 3),
    rig(14, "overdrive", 5, 3), rig(15, "coil", 7, 4, 3), rig(16, "splitter", 1, 2, 1),
  ],
  routes: [
    { factory: 1, cells: [K(4, 5), K(3, 5), K(2, 5), K(2, 4), K(2, 3), K(2, 2), K(2, 1), K(3, 1), K(4, 1), K(4, 0)] },
    { factory: 2, cells: [K(6, 5), K(6, 4), K(6, 3), K(6, 2), K(6, 1), K(5, 1), K(5, 0)] },
  ],
});
/** A deck's one OVERDRIVE at `s` stars. */
const starIt = (b: Build, s: number): Build => {
  const c = JSON.parse(JSON.stringify(b)) as Build;
  const od = c.items.filter((p) => p.def === "overdrive");
  if (od.length !== 1) throw new Error(`deck holds ${od.length} OVERDRIVE`);
  if (s > 1) od[0].stars = s; else delete od[0].stars;
  return c;
};
const OD_DECKS: { id: string; at: (s: number) => Build; foe: () => Build }[] = [
  { id: "bench (the tripwire's)", at: (s) => bench([["overdrive", 4, 4, s]], [], 0), foe: native("par/weaver/6") },
  { id: "longtooth8", at: (s) => starIt(planBuild(PLANS.longtooth, 8).build, s), foe: native("par/weaver/6") },
  { id: "ratchet8", at: (s) => starIt(planBuild(PLANS.ratchet, 8).build, s), foe: native("par/weaver/6") },
  { id: "sides", at: (s) => starIt(sides(), s), foe: native("par/weaver/6") },
  { id: "junction", at: (s) => starIt(junction(), s), foe: native("par/furnace/6") },
];
const OD_SEEDS = Array.from({ length: 20 }, (_, i) => i + 1); // arsenal.decks's 20 seeds
/** tests/starRows.ts's measure (the damage the deck deals before its own KO, the foe's KO lifted by LIFT; mean over the
 *  seeds), without its memo: starFight's memo keys on the decks and the seed, not on the switch, so an off row would answer
 *  the on row. */
function starDmg(at: (s: number) => Build, vs: () => Build, seeds: readonly number[]): number[] {
  return [1, 2, 3].map((s) => {
    const deck = at(s), foe = vs();
    let sum = 0;
    for (const seed of seeds) {
      const bt = new Battle(deck, { ...foe, hullBonus: foe.hullBonus + LIFT }, seed);
      while (!bt.over) { bt.step(); bt.events.length = 0; }
      sum += bt.sides[0].stats.damage;
    }
    return sum / seeds.length;
  });
}

describe("HULL-1b OVERDRIVE (backlog #370; tests/arsenal.decks; cap's oracle 37b12cb17a536589): the ride-keep ladder", () => {
  oldWorld(); // BUMP-1E: the ladder toggles below run with the scaling rules off (see oldWorld)
  it("on: the bench rises ★1 < ★2 < ★3; on five decks no step falls more than 3% (the arsenal.decks measure, 20 seeds)", () => {
    for (const d of OD_DECKS) {
      const off = withLadderFix(() => starDmg(d.at, d.foe, OD_SEEDS), false);
      const on = withLadderFix(() => starDmg(d.at, d.foe, OD_SEEDS));
      log(`OVERDRIVE ${d.id} | off ${off.map((x) => x.toFixed(2)).join(" / ")} | on ${on.map((x) => x.toFixed(2)).join(" / ")} | steps on x${(on[1] / on[0]).toFixed(3)} x${(on[2] / on[1]).toFixed(3)}`);
      expect(on[1], `${d.id} 1->2`).toBeGreaterThanOrEqual(on[0] * 0.97);
      expect(on[2], `${d.id} 2->3`).toBeGreaterThanOrEqual(on[1] * 0.97);
      if (d.id.startsWith("bench")) {
        expect(off).toEqual([941.4, 882, 856.05]); // the tripwire's bb-0.9.7 means
        expect(on[0], "bench: ★1 keeps no ride (bb-0.9.7's; a deck holding another fixed piece moves with it)").toBe(off[0]);
        expect(on[1], "bench ★1 < ★2").toBeGreaterThan(on[0]);
        expect(on[2], "bench ★2 < ★3").toBeGreaterThan(on[1]);
      }
    }
    // AZ-BUMP (the 1.5-CPU quota, the GATE RULE; no switch): 600 s (was the 30 s default), a host timeout, not the rule. 4.7 s
    // in S1's whole suite, 11.0 s in AZ-BUMP run 4's switch-on shard, 34.3 s and 35.8 s in run 7 (shard s3-1, then alone).
    // The test sets LADDER_FIX itself (off, then on). Run 7's variants (the tree with ONE switch off, the four at once) read
    // 49.5-51.9 s each: no switch makes it slower
  }, 600_000);

  it("the keep is OVERDRIVE ★2/★3's alone, on only: 0.5 / 1 (★1 none), and the walk rides it tick for tick with the battle", () => {
    const keep = (s: number) => (effectAt("overdrive", s).gate as { rideKeep?: number }).rideKeep;
    // AZ-BUMP (the flip, LADDER_FIX): the off half reads the switch set off (it read the default, which ships on)
    expect(withLadderFix(() => [1, 2, 3].map(keep), false)).toEqual([undefined, undefined, undefined]);
    expect(withLadderFix(() => [1, 2, 3].map(keep))).toEqual([undefined, 0.5, 1]);
    for (const s of [1, 2, 3]) {
      const b = bench([["overdrive", 4, 4, s]], [], 0);
      const on = withLadderFix(() => ({ f: firstLoad(b, 1), w: walkRoute(b, 0).estimate }));
      log(`OVERDRIVE ★${s} first load: battle ${on.f.dmg} ${on.f.time.toFixed(4)} s, walk ${on.w.dmg} ${on.w.time.toFixed(4)} s`);
      expect(on.w.dmg, `★${s}`).toBe(on.f.dmg);
      expect(on.w.time, `★${s}`).toBeCloseTo(on.f.time, 9);
    }
  });
});

// ------------------------------------------------------------------ P13, the walk's ride gap (tests/beltside.merge061rel)

/** beltside.merge061rel's firstLoad(): the battle's first load at turret 0 from factory `uid`: stamp-to-chamber seconds,
 *  its damage at load and its flat. */
function firstLoad(b: Build, uid: number): { time: number; dmg: number; flat: number } {
  const bt = new Battle(b, barge(), SEED);
  const side = bt.sides[0];
  const f = side.factories.find((x) => x.uid === uid)!;
  f.timer = 1e9;
  while (!side.gates.every((g) => g.online || !g.hits.length)) { bt.step(); bt.drainEvents(); }
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

describe("HULL-1b P13 (cap's oracle d306b1b196dbab38): the walk agrees with the battle, tick for tick", () => {
  oldWorld(); // BUMP-1E: the ladder toggles below run with the scaling rules off (see oldWorld)
  it("on: BRAKE SHOE ★1-★3 (the tripwire's bench), GREASE and a bare belt: the walk's damage at load and stamp-to-chamber time are the battle's", () => {
    const decks: [string, Build][] = [
      ...[1, 2, 3].map((s): [string, Build] => [`BRAKE ★${s}`, bench([["brake", 4, 3, s]])]),
      ...[1, 2, 3].map((s): [string, Build] => [`GREASE ★${s}`, bench([["grease", 4, 3, s]])]),
      ["bare", bench()],
    ];
    for (const [name, b] of decks) {
      const off = withLadderFix(() => ({ f: firstLoad(b, 1), w: walkRoute(b, 0).estimate }), false);
      const on = withLadderFix(() => ({ f: firstLoad(b, 1), w: walkRoute(b, 0).estimate }));
      log(`P13 ${name}: battle ${on.f.dmg} dmg ${on.f.time.toFixed(4)} s | walk off ${off.w.dmg} ${off.w.time.toFixed(4)} s, on ${on.w.dmg} ${on.w.time.toFixed(4)} s`);
      expect(on.f).toEqual(off.f); // the battle itself never reads the switch
      expect(on.w.dmg, `${name}: damage at load`).toBe(on.f.dmg);
      expect(on.w.time, `${name}: stamp to chamber`).toBeCloseTo(on.f.time, 9);
    }
    // off: bb-0.9.7's walk (the tripwire's pairs: ★1 94 / 95, 4.1667 / 4.2 s)
    // AZ-BUMP (the flip, LADDER_FIX): read with the switch set off (it read the default, which ships on: there the walk is
    // the battle's, 94 / 4.1667, as the loop above checks)
    const b1 = bench([["brake", 4, 3, 1]]);
    expect(withLadderFix(() => [firstLoad(b1, 1).dmg, walkRoute(b1, 0).estimate.dmg, +walkRoute(b1, 0).estimate.time.toFixed(4)], false)).toEqual([94, 95, 4.2]);
  });
});

// ------------------------------------------------------------------ the par player's buy floor (tests/harness.player)

describe("HULL-1b the par player's six runs (tests/harness.player's buy floor: no code change, cap's ruling)", () => {
  it("off and on: FURNACE and WEAVER s1-s3's caravan buys (the REPORT's numbers; AZ-BUMP's floor is at least 10)", () => {
    const buys = () => (["furnace", "weaver"] as const).flatMap((hero) => [1, 2, 3].map((seed) => {
      let n = 0;
      playerRun(hero, PLAYER_DAYS, seed, { trace: () => { n++; } });
      return n;
    }));
    // AZ-BUMP (the flip, NPC_DAY, HULL_SCALE, LADDER_FIX): bb-0.9.7's six are the all-off world's: with NPC_DAY on the par
    // player fights the Medium warlord every day (road gold and drops in its deck) and HULL_SCALE moves its gold table
    // (maxGoldByDay), so the off half sets all three off (LADDER_FIX off alone read 13 / 15 / 16 / 17 / 14 / 16, the other
    // two on); the on half is the shipped game, every switch on
    // SHAPES-1 flip: SHAPES ships on too, so the off half sets it off as well (the tripwire kept at its old point, as AZ-BUMP's
    // flip kept it; with SHAPES on in the off half the shaped pieces are in the caravan and it read 16 / 15 / 15 / 15 / 11 / 14)
    // HULL-ON (the flip, GUARD, OPEN_RUNES, FREE_JOINS): the all-off world has five more switches now, so the off half sets
    // them off too (all eight off). One at a time, each off alone beside the three: GUARD 14 / 15 / 13 / 15 / 12 / 15 (its
    // plate and shield numbers), OPEN_RUNES 14 / 16 / 13 / 15 / 9 / 16 (the open dawn runes), FREE_JOINS 12 / 15 / 13 / 13 /
    // 12 / 18 (no join limit in its plans), HEARTS and PICK none (14 / 14 / 13 / 15 / 12 / 16, as the five on); all five
    // off: bb-0.9.7's six
    const allOff = <T>(f: () => T): T => withGuard(() => withOpenRunes(() => withFreeJoins(() => withHearts(() => withPick(f, false), false), false), false), false);
    // BUMP-1D (PLAIN_RIGS and SHAPES2 on): the off half sets the twelve plain stat rigs off as well (the par player buys them
    // now; the all-off world is bb-0.9.7's, which has none), the nesting putting the switches back in ITEMS order (plain rigs,
    // the three, the six more: each swap back appends). The on half is the shipped game, every switch on
    // BUMP-1E (the scaling rules ship on): bb-0.9.7's six have none of the seven scaling rigs and none of the five reworks either, and the seven are the LAST keys in ITEMS, so the scaling switch is the
    // OUTERMOST call of the nest (off first, back last: the ITEMS key-order hazard; without it the off half read 11 / 13 / 15 / 14 / 14 / 11, the catalogue with the seven in it and the three toggles inside
    // leaving SHAPES-1's three and the twelve BEHIND them), which also puts KINDLING back over the ladder toggle's QUENCH TANK (see oldWorld). The on half is the shipped game: every switch on, the scaling rules too
    // BUMP-1F (GATES and ENCHANT on by default, RULING-BUMP1F-R5 R5.2): bb-0.9.7's six have no converters and no words either, so the off half sets GATES and ENCHANT off too: GATES is the outermost of the nest with ENCHANT outside it
    // (the three converters are the last keys of ITEMS after the seven, so GATES goes off before the scaling switch and comes back after it); the off half read 15 / 12 / 16 / 15 / 13 / 15 without; was withScaleRigs outermost
    const off = withEnchant(() => withGates(() => withScaleRigs(() => withShapes2(() => withShapes(() => withPlainRigs(() => allOff(() => withNpcDay(() => withHullScale(() => withLadderFix(buys, false), false), false)), false), false), false), false), false), false), on = withLadderFix(buys);
    log(`BUYS FURNACE s1-s3, WEAVER s1-s3: off ${off.join(" / ")}; on ${on.join(" / ")}`);
    expect(off).toEqual([12, 15, 13, 14, 10, 16]); // bb-0.9.7's, as tests/harness.player pins them
    for (const n of on) expect(n).toBeGreaterThan(0);
    // MERGE-099F (REQ-BFG-079, -086): SHAPES and HULL-ON's five on together; was 14 / 14 / 13 / 15 / 12 / 16 (HULL-ON's
    // world, no shapes: the comment above; neither side checked the on half exactly, BRIEF-MERGE-099F 1g pins it here)
    // BUMP-1D (the flip: PLAIN_RIGS, SHAPES2, LONG_RUN, the rules bump), measured: the on half is the shipped game, so the par
    // player buys the twelve plain stat rigs and the catalogue's draw has 103 modules: 13 / 14 / 15 / 20 / 15 / 15 (was 15 / 14 /
    // 17 / 14 / 16 / 17); the off half above is bb-0.9.7's six, unchanged
    // BUMP-1E (the flip: the scaling rules, ENDLESS, the regenerated catalogue draw): the shipped game's par player buys the seven scaling rigs now and the catalogue's draw has 110
    // modules (was 103): 12 / 15 / 15 / 16 / 17 / 17 (was 13 / 14 / 15 / 20 / 15 / 15); the off half above is bb-0.9.7's six, read with the scaling switch off, unchanged
    expect(SCALE_RIGS).toBe(true); // BUMP-1E: the shipped game has the scaling rules on (was false)
    expect(scaleRules()).toBe(true);
    // BUMP-1F (GATES and ENCHANT on by default, RULING-BUMP1F-R5 R5.2): the shipped game's par player buys converters and words (each a buy the trace counts): 12 / 20 / 15 / 15 / 16 / 17, measured at this tree (was 12 / 15 / 15 / 16 / 17 / 17)
    expect(on).toEqual([12, 20, 15, 15, 16, 17]); // BUMP-1F: was [12, 15, 15, 16, 17, 17]. BUMP-1E: was [13, 14, 15, 20, 15, 15]
    // AZ-BUMP (the flip): 300 s, the on half's six runs fight a warlord every day; a host timeout under the 1.5-CPU quota
    // (30 s hit in run 5's group check), not the rule
  }, 300_000);
});

// ------------------------------------------------------------------ STOKER (tests/wave3.decks STOKER_ROWS, backlog #356)

const furnaceStart = () => heroStartBuild("furnace", 1);
const weaverStart = () => heroStartBuild("weaver", 101);
/** wave3.decks's LOCKJAW layout: an 8-tile Kiln belt into connector 4 and a TWIN MOULD belt of 8 into 5. */
function lockjaw(): Build {
  return {
    hero: "furnace", items: [{ uid: 1, def: "kiln", x: 2, y: 6 }, { uid: 2, def: "twinmould", x: 6, y: 6 }],
    routes: [
      { factory: 1, cells: [K(2, 5), K(3, 5), K(3, 4), K(3, 3), K(3, 2), K(3, 1), K(4, 1), K(4, 0)] },
      { factory: 2, cells: [K(7, 5), K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] },
    ], mods: [], beltCap: 30, hullBonus: 0,
  };
}
function longKiln(): Build {
  const b = furnaceStart();
  b.routes[0].cells = [K(4, 5), K(3, 5), K(3, 4), K(3, 3), K(3, 2), K(3, 1), K(4, 1), K(4, 0)];
  return b;
}
const sturdy = (b: Build): Build => ({ ...b, hullBonus: b.hullBonus + 3000 });
/** HULL-ON (bb-0.10.0, FREE_JOINS; FREE_JOINS_HULL, cap's rulings 84ad10254e1855c8 = RULING-HULLON-R9 and 0bbcee55b6ba281a
 *  = RULING-HULLON-R10 (c)): capRows' foe stays the one this test measured, WEAVER's start deck at 4,700 hull in all
 *  (content.ts's base 1700 + 3000). Its bonus is 3000 plus what the free-joins swap takes off that base (the base read
 *  with the switch off), so the foe holds for any FREE_JOINS_HULL value (3000 + 200 at 1500). The player's side keeps
 *  sturdy's +3000. */
const sturdyFoe = (b: Build): Build => ({ ...b, hullBonus: b.hullBonus + 3000 + withFreeJoins(() => HEROES.weaver.hull, false) - HEROES.weaver.hull });
const ROWS: { id: string; base: () => Build; x: number; y: number; rises: boolean }[] = [
  { id: "FURNACE start, 6-tile Kiln", base: furnaceStart, x: 6, y: 6, rises: false },
  { id: "FURNACE, 8-tile Kiln", base: longKiln, x: 6, y: 6, rises: true },
  { id: "shared gun, STOKER on the Kiln", base: lockjaw, x: 1, y: 6, rises: false },
  { id: "shared gun, STOKER on the mould", base: lockjaw, x: 8, y: 6, rises: false },
  { id: "shared gun with room, STOKER on the mould", base: () => withMod(lockjaw(), 60, "calibrate", 0, 3), x: 8, y: 6, rises: true },
];
/** wave3.decks's capRows: mean damage and jams over seeds 1-5, both sides +3000 hull (the foe at the measured 4,700:
 *  sturdyFoe): no stoker, then ★1-★3. */
function capRows(r: (typeof ROWS)[number]): { dmg: number; jams: number }[] {
  return [0, 1, 2, 3].map((s) => {
    let dmg = 0, jams = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const b = s ? withItem(r.base(), item(70, "stoker", r.x, r.y, 0, s)) : r.base();
      const bt = new Battle(sturdy(b), sturdyFoe(weaverStart()), seed);
      while (!bt.over && bt.ticks < 60 * 200) { bt.step(); bt.events.length = 0; }
      dmg += bt.sides[0].stats.damage;
      jams += bt.sides[0].stats.jams;
    }
    return { dmg: dmg / 5, jams: jams / 5 };
  });
}

describe("HULL-1b STOKER (backlog #356; tests/wave3.decks STOKER_ROWS): the shared gun with room rises at every star", () => {
  oldWorld(); // BUMP-1E: the ladder toggles below run with the scaling rules off (see oldWorld)
  it("on: the tripwire row rises none < ★1 < ★2 < ★3; every row keeps none <= ★1 <= ★2 <= ★3 and no more jams than none", () => {
    for (const r of ROWS) {
      const off = withLadderFix(() => capRows(r), false), on = withLadderFix(() => capRows(r));
      log(`STOKER ${r.id} | off ${off.map((x) => x.dmg.toFixed(1)).join(" / ")} (jams ${off.map((x) => x.jams).join("/")}) | on ${on.map((x) => x.dmg.toFixed(1)).join(" / ")} (jams ${on.map((x) => x.jams).join("/")})`);
      for (let s = 1; s <= 3; s++) {
        expect(on[s].dmg, `${r.id} ★${s}`).toBeGreaterThanOrEqual(on[s - 1].dmg * 0.999);
        expect(on[s].jams, `${r.id} ★${s} jams`).toBeLessThanOrEqual(on[0].jams);
        if (r.rises) expect(on[s].dmg, `${r.id} ★${s} rises`).toBeGreaterThan(on[s - 1].dmg);
      }
      // ★1 and ★2 are bb-0.9.7's numbers: only ★3 moves
      expect(on.slice(0, 3)).toEqual(off.slice(0, 3));
    }
  });

  it("the tripwire row, KO-lifted (the deck +3000, the foe's KO lifted, 120 s; AZ-BUMP's re-key): rises at every star, off and on", () => {
    const r = ROWS[4];
    const lifted = () => [0, 1, 2, 3].map((s) => {
      let dmg = 0;
      for (const seed of [1, 2, 3, 4, 5]) {
        const b = s ? withItem(r.base(), item(70, "stoker", r.x, r.y, 0, s)) : r.base();
        const foe = weaverStart();
        const bt = new Battle(sturdy(b), { ...foe, hullBonus: foe.hullBonus + LIFT }, seed);
        while (!bt.over && bt.ticks < 60 * 200) { bt.step(); bt.events.length = 0; }
        dmg += bt.sides[0].stats.damage;
      }
      return dmg / 5;
    });
    const off = withLadderFix(lifted, false), on = withLadderFix(lifted);
    log(`STOKER ${r.id}, KO-lifted | off ${off.map((x) => x.toFixed(1)).join(" / ")} | on ${on.map((x) => x.toFixed(1)).join(" / ")}`);
    for (const x of [off, on]) for (let s = 1; s <= 3; s++) expect(x[s], `★${s}`).toBeGreaterThan(x[s - 1]);
  });
});

// ------------------------------------------------------------------ BUMP-1E: the world this file leaves
describe("BUMP-1E: the scaling rules ship on, and every ladder toggle above leaves the shipped world", () => {
  it("SCALE_RIGS and LADDER_FIX are on, ITEMS.quench is KINDLING (not the ladder-fixed QUENCH TANK a toggle with the scaling rules on would leave) and the seven ids are the last keys in ITEMS", () => {
    expect(SCALE_RIGS).toBe(true); // BUMP-1E: was false (0.9.11)
    expect(scaleRules()).toBe(true);
    expect(ladderFixRules()).toBe(true);
    expect(ITEMS.quench.name).toBe("KINDLING");
    expect(ITEMS.quench.gate?.reads).toBeDefined();
    expect(ITEMS.quench.gate?.quench).toBeUndefined();
    // BUMP-1F (GATES on by default, RULING-BUMP1F-R5 R5.2; BUMP-1F F1): the three converters are the LAST keys of ITEMS now, the seven scaling ids just before them; was Object.keys(ITEMS).slice(-SCALE_IDS.length) alone
    // (the last seven were crowdpress, aegisspike ... then: 3 of them the converters)
    const keys = Object.keys(ITEMS);
    expect(keys.slice(-GATES_IDS.length)).toEqual([...GATES_IDS]);
    expect(keys.slice(-(GATES_IDS.length + SCALE_IDS.length), -GATES_IDS.length)).toEqual([...SCALE_IDS]);
  });
});
