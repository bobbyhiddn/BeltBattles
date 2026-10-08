// HULL-1b (REQ-BFG-070; backlog #370 and #356): the star-ladder pass behind LADDER_FIX (src/sim/ladderFix.ts, off). With the
// switch off every piece is bb-0.9.7's (the tripwire tests keep their bb-0.9.7 pins; AZ-BUMP re-rules them at the bump).
// With it on, each fixed piece's ladder rises at every star on its tripwire's own bench, pinned here by order. BB_TABLES=1
// prints each bench's numbers, off and on (the REPORT's before/after).
import { describe, expect, it } from "vitest";
import { Battle, type BeltAmmo, type Payload } from "../src/sim/battle";
import { AMMO, BURN_DPS, BURN_TIME, ITEMS, TICK } from "../src/sim/content";
import { payloadDamage, walkRoute, type Build } from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { PLAYER_DAYS, playerRun } from "../src/sim/harness/player";
import { LADDER_DEFS, LADDER_FIX, ladderFixRules, setLadderFix, withLadderFix } from "../src/sim/ladderFix";
import { effectAt } from "../src/sim/stars";
import { barge, bench, SEED } from "./arsenal.bench";
import { K, item, withItem, withMod } from "./wave3.helpers";

const log = (s: string) => { if (process.env.BB_TABLES) console.log(s); };

describe("HULL-1b the switch (REQ-BFG-070)", () => {
  it("LADDER_FIX is off in this rules version; withLadderFix puts it back even on a throw; off, every fixed def is content.ts's own object", () => {
    expect(LADDER_FIX).toBe(false);
    expect(ladderFixRules()).toBe(false);
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
  });

  it("the fixed numbers, on; bb-0.9.7's, off (the star cache follows the switch both ways)", () => {
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
  });
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
    const b1 = bench([["brake", 4, 3, 1]]);
    expect([firstLoad(b1, 1).dmg, walkRoute(b1, 0).estimate.dmg, +walkRoute(b1, 0).estimate.time.toFixed(4)]).toEqual([94, 95, 4.2]);
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
    const off = withLadderFix(buys, false), on = withLadderFix(buys);
    log(`BUYS FURNACE s1-s3, WEAVER s1-s3: off ${off.join(" / ")}; on ${on.join(" / ")}`);
    expect(off).toEqual([12, 15, 13, 14, 10, 16]); // bb-0.9.7's, as tests/harness.player pins them
    for (const n of on) expect(n).toBeGreaterThan(0);
  });
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
const ROWS: { id: string; base: () => Build; x: number; y: number; rises: boolean }[] = [
  { id: "FURNACE start, 6-tile Kiln", base: furnaceStart, x: 6, y: 6, rises: false },
  { id: "FURNACE, 8-tile Kiln", base: longKiln, x: 6, y: 6, rises: true },
  { id: "shared gun, STOKER on the Kiln", base: lockjaw, x: 1, y: 6, rises: false },
  { id: "shared gun, STOKER on the mould", base: lockjaw, x: 8, y: 6, rises: false },
  { id: "shared gun with room, STOKER on the mould", base: () => withMod(lockjaw(), 60, "calibrate", 0, 3), x: 8, y: 6, rises: true },
];
/** wave3.decks's capRows: mean damage and jams over seeds 1-5, both sides +3000 hull: no stoker, then ★1-★3. */
function capRows(r: (typeof ROWS)[number]): { dmg: number; jams: number }[] {
  return [0, 1, 2, 3].map((s) => {
    let dmg = 0, jams = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const b = s ? withItem(r.base(), item(70, "stoker", r.x, r.y, 0, s)) : r.base();
      const bt = new Battle(sturdy(b), sturdy(weaverStart()), seed);
      while (!bt.over && bt.ticks < 60 * 200) { bt.step(); bt.events.length = 0; }
      dmg += bt.sides[0].stats.damage;
      jams += bt.sides[0].stats.jams;
    }
    return { dmg: dmg / 5, jams: jams / 5 };
  });
}

describe("HULL-1b STOKER (backlog #356; tests/wave3.decks STOKER_ROWS): the shared gun with room rises at every star", () => {
  it("on: the tripwire row rises none < ★1 < ★2 < ★3; every row keeps none <= ★1 <= ★2 <= ★3 and no more jams than none", () => {
    for (const r of ROWS) {
      const off = withLadderFix(() => capRows(r), false), on = withLadderFix(() => capRows(r));
      log(`STOKER ${r.id} | off ${off.map((x) => x.dmg.toFixed(1)).join(" / ")} | on ${on.map((x) => x.dmg.toFixed(1)).join(" / ")} (jams ${on.map((x) => x.jams).join("/")})`);
      for (let s = 1; s <= 3; s++) {
        expect(on[s].dmg, `${r.id} ★${s}`).toBeGreaterThanOrEqual(on[s - 1].dmg * 0.999);
        expect(on[s].jams, `${r.id} ★${s} jams`).toBeLessThanOrEqual(on[0].jams);
        if (r.rises) expect(on[s].dmg, `${r.id} ★${s} rises`).toBeGreaterThan(on[s - 1].dmg);
      }
      // ★1 and ★2 are bb-0.9.7's numbers: only ★3 moves
      expect(on.slice(0, 3)).toEqual(off.slice(0, 3));
    }
  });
});
