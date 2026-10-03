// 0.8.0 P1 (BRIEF-wave3-P1 M3; DESIGN-wave3.md 3.3; REQ-BFG-022, REQ-BFG-019): the 15 wave-3 modules at 1, 2 and 3 stars,
// in the tests/arsenal.modules.test.ts style. Each module has a bench (a fixed deck and seed) that reads its headline
// number at each star: 1 star < 2 < 3 strictly, and 2/1 and 3/1 inside the design's band (+-15%) where it states one
// ("each star is about 2.2x and 3.5x of the 1-star effect, or adds a named perk"). The named rules (caps, thresholds,
// floors, the perk) have their own asserts. Each number is read off a battle (events, payloads, turret state), never off
// the spec alone. BB_TABLES=1 prints the table (REPORT.md). The deck-level merge check is tests/wave3.decks.test.ts.
import { describe, expect, it } from "vitest";
import { Battle, LOAD_FLOOR, type Payload, type Projectile, type SimEvent } from "../src/sim/battle";
import { WINDOW_TIME } from "../src/sim/content";
import { ROUTINES } from "../src/sim/cores";
import { overclocked, boostable } from "../src/sim/overclock";
import { effectAt, outputsAt, perkAt } from "../src/sim/stars";
import { walkRoute, type Build } from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { K, SEED, barge, furnaceBench, item, latchDeck, pastTile, run, twoPress, withItem, withMod } from "./wave3.helpers";

type Metric = number | number[];
interface Row { id: string; headline: string; band?: [number, number]; at: (stars: number) => Metric }

/** a < b: a scalar strictly; a tuple when no part falls and at least one part rises. */
function rises(a: Metric, b: Metric): boolean {
  if (typeof a === "number" && typeof b === "number") return a < b;
  const x = a as number[], y = b as number[];
  return x.every((v, i) => v <= y[i]) && x.some((v, i) => v < y[i]);
}

function checkRow(r: Row): number[] | number[][] {
  const m = [1, 2, 3].map((s) => r.at(s));
  if (process.env.BB_TABLES) console.log(`BENCH ${r.id} | ${r.headline} | ${m.map((v) => (typeof v === "number" ? +v.toFixed(3) : v.map((x) => +x.toFixed(3)).join("/"))).join(" | ")}`);
  expect(rises(m[0], m[1]) && rises(m[1], m[2]), `${r.id}: ${JSON.stringify(m)}`).toBe(true);
  if (r.band) {
    const [m1, m2, m3] = m as number[];
    const [b2, b3] = r.band;
    expect(m2 / m1, `${r.id} 2/1`).toBeGreaterThanOrEqual(b2 * 0.85);
    expect(m2 / m1, `${r.id} 2/1`).toBeLessThanOrEqual(b2 * 1.15);
    expect(m3 / m1, `${r.id} 3/1`).toBeGreaterThanOrEqual(b3 * 0.85);
    expect(m3 / m1, `${r.id} 3/1`).toBeLessThanOrEqual(b3 * 1.15);
  }
  return m as number[];
}

const BAND: [number, number] = [2.2, 3.5];
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const hull = (): { kind: "hull"; ref: number; cell: number; x: number; y: number; weight: number } => ({ kind: "hull", ref: -1, cell: -1, x: 60, y: 60, weight: 1 });
const belt = (route: number, cell: number) => ({ kind: "belt" as const, ref: route, cell, x: 0, y: 0, weight: 1 });
const priv = (bt: Battle) => bt as unknown as {
  impact(p: Projectile): void; disrupt(s: unknown, t: unknown, secs: number, cause: string): boolean;
  freeze(s: unknown, t: unknown, secs: number): boolean; slowSegment(s: unknown, t: unknown, mul: number, secs: number): boolean;
};
const plain = (id: number): Payload => ({ id, ammo: "plain", ride: 0, mult: 1, flat: 0, burn: 0, shock: false, prior: 0, factory: 0, copy: false });
const shot = (from: 0 | 1, dmg: number): Projectile => ({ id: 999, from, turret: 0, payload: plain(998), dmg, t: 0, flight: 0, target: hull(), tx: 60, ty: 60, heavy: false });

/** The plating events of side 0 over `secs` (amount, battle time). */
function plates(b: Build, secs = 12, pre?: (bt: Battle) => void): { amount: number; t: number }[] {
  const out: { amount: number; t: number }[] = [];
  const bt = new Battle(b, barge(), SEED);
  pre?.(bt);
  while (bt.t < secs && !bt.over) {
    bt.step();
    for (const e of bt.drainEvents()) if (e.type === "plate" && e.side === 0) out.push({ amount: e.amount, t: bt.t });
  }
  return out;
}

/** Steps a fresh battle `ticks` ticks (rigs commission at 1.2 s). */
function stepped(b: Build, ticks = 90): Battle {
  const bt = new Battle(b, barge(), SEED);
  for (let i = 0; i < ticks; i++) bt.step();
  bt.drainEvents();
  return bt;
}

/** The FURNACE bench with a rig of `def` at `stars` west of the Kiln belt's tile 3, (4,3), facing it. */
const onTile3 = (def: string, stars: number) => withItem(furnaceBench(), item(30, def, 3, 3, def === "platebreaker" || def === "shieldwall" ? 0 : 1, stars));

// ------------------------------------------------------------------------------------------------- the bench rows

export const ROWS: Row[] = [
  { id: "plateroller", headline: "Plating per payload it hits", band: [2.2, 3.4],
    at: (s) => mean(plates(onTile3("plateroller", s), 8).map((p) => p.amount).slice(0, 3)) },
  { id: "twingauge", headline: "Damage on a matched belt (FOUNDRY's mirrored belts)", band: BAND,
    at: (s) => walkRoute(withItem(heroStartBuild("foundry", 1), item(60, "twingauge", 1, 3, 1, s)), 0).timeline.flatMap((r) => r.hits).find((h) => h.uid === 60)!.flat! },
  { id: "pincer", headline: "Damage with one other rig on its tile (battle)", band: BAND,
    at: (s) => mean(pastTile(withItem(withItem(furnaceBench(), item(30, "pincer", 3, 3, 1, s)), item(31, "whetstone", 5, 3, 3)), 0, 3).map((x) => x.flat)) - 2 },
  { id: "braceframe", headline: "Share of an enemy stall it takes off its tile (bare; plated)",
    at: (s) => braceCut(s) },
  { id: "twinlatch", headline: "Damage on each payload it lets go", band: BAND,
    at: (s) => mean(pastTile(withItem(latchDeck(), item(40, "twinlatch", 4, 3, 0, s)), 0, 2).map((x) => x.flat)) },
  { id: "stoker", headline: "How much faster the factory it points at stamps", band: BAND,
    at: (s) => 1.4 / mean(stampGaps(withItem(pressBench(), item(30, "stoker", 6, 6, 0, s)))) - 1 },
  { id: "platebreaker", headline: "Damage a payload gains for 1 plating (20 plating on the hull)", band: BAND,
    at: (s) => flatsPast(onTile3("platebreaker", s), 3, 20)[0] },
  { id: "shieldwall", headline: "Plating per payload it hits", band: BAND,
    at: (s) => plates(onTile3("shieldwall", s), 6)[0].amount },
  { id: "twinmould", headline: "Output damage a second (slugs a cast x damage / interval)",
    at: (s) => mouldDps(s) },
  { id: "armorpress", headline: "Plating it presses every 4 s", band: BAND,
    at: (s) => plates(pressFurnace("armorpress", s), 9)[0].amount },
  { id: "anvil", headline: "Damage a heavy shot gains at 24 plating", band: [2.03, 3.5],
    at: (s) => anvilGain(s, 24) },
  { id: "steambreech", headline: "Fire-rate bonus while plated (bare)", band: BAND,
    at: (s) => steamRate(s, true) - 1 },
  { id: "twintrigger", headline: "Share more damage a paired load deals", band: BAND,
    at: (s) => pairedShare(s) },
  { id: "spallcatcher", headline: "Charge from 8 damage taken on bare hull", band: BAND,
    at: (s) => spall(s, 8, 0) },
  { id: "seamwelder", headline: "Plating for each pair this turret takes", band: BAND,
    at: (s) => Math.max(...plates(seamDeck(s), 12).map((p) => p.amount)) },
];

// ------------------------------------------------------------------------------------------------- bench helpers

/** BRACE FRAME (shape L) at (3,4): its east arrow on the Kiln belt's tile 1 (4,4); its north arrow at empty deck. The
 *  share of a 1.6 s shock it takes off that tile, bare and with 5 plating on the hull: [bare, plated]. */
function braceCut(stars: number): number[] {
  const out: number[] = [];
  for (const plated of [false, true]) {
    const bt = stepped(withItem(furnaceBench(), item(30, "braceframe", 3, 4, 0, stars)));
    const s = bt.sides[0];
    if (plated) bt.addPlate(s, 5);
    priv(bt).disrupt(s, belt(0, 1), 1.6, "shock");
    out.push(1 - s.routes[0].cellDisrupt[1] / 1.6);
  }
  return out;
}

/** The STOKER bench: a WEAVER whose STAMP PRESS (uid 7, (4,6)) feeds light turret 1 (EXT. CHAMBER ★3: never full). */
function pressBench(): Build {
  return {
    hero: "weaver", items: [{ uid: 1, def: "loom", x: 0, y: 8 }, { uid: 7, def: "press", x: 4, y: 6 }],
    routes: [{ factory: 7, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] }],
    mods: [{ uid: 20, def: "chamber", turret: 1, stars: 3 }], beltCap: 30, hullBonus: 5000,
  };
}

/** The gaps between the press's stamps after 3 s (its STOKER is online from 1.2 s). */
function stampGaps(b: Build): number[] {
  const t: number[] = [];
  run(b, 20, barge(), SEED, (ev, bt) => { for (const e of ev) if (e.type === "produce" && e.side === 0 && e.factory === 7 && bt.t > 3) t.push(bt.t); });
  return t.slice(1).map((x, i) => x - t[i]);
}

/** FURNACE's bench with factory `def` (uid 7) at (6,6) on a second belt into connector 5 (the arsenal busy bench). */
function pressFurnace(def: string, stars: number): Build {
  const b = furnaceBench();
  b.items.push(item(7, def, 6, 6, 0, stars));
  b.routes.push({ factory: 7, cells: [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] });
  return b;
}

/** TWIN MOULD (uid 7) on a WEAVER at (4,6), the Loom parked: a belt into each of its outputs (columns 4 and 1 at 1-2
 *  stars; and 8 at 3, THIRD SPRUE), each into its own light gun. */
function mouldDeck(stars: number): Build {
  const cols = [
    [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)],
    [K(3, 6), K(2, 6), K(1, 6), K(1, 5), K(1, 4), K(1, 3), K(1, 2), K(1, 1), K(1, 0)],
    [K(6, 6), K(7, 6), K(8, 6), K(8, 5), K(8, 4), K(8, 3), K(8, 2), K(8, 1), K(8, 0)],
  ];
  return {
    hero: "weaver", items: [{ uid: 1, def: "loom", x: 0, y: 8 }, item(7, "twinmould", 4, 6, 0, stars)],
    routes: cols.slice(0, outputsAt("twinmould", stars)).map((cells) => ({ factory: 7, cells })), mods: [], beltCap: 40, hullBonus: 5000,
  };
}

/** TWIN MOULD's output: the damage a second it casts over 30 s (its slugs' base, from the factory's own count). */
function mouldDps(stars: number): number {
  const bt = run(mouldDeck(stars), 30);
  const f = bt.sides[0].factories.find((x) => x.uid === 7)!;
  return (f.produced * (effectAt("twinmould", stars).factory!.base ?? 3)) / 30;
}

/** Each payload's flat once past tile `tile` of route 0, with `plate` plating put on the hull on the first tick. */
function flatsPast(b: Build, tile: number, plate: number, secs = 10): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  run(b, secs, barge(), SEED, (_ev, bt) => {
    if (bt.ticks === 1 && plate) bt.addPlate(bt.sides[0], plate);
    for (const a of bt.sides[0].routes[0].ammo) if (a.processed >= tile && !seen.has(a.p.id)) { seen.add(a.p.id); out.push(a.p.flat); }
  });
  return out;
}

/** ANVIL BREECH on FURNACE's heavy gun (k 1): what a shot gains over the same deck without it, at `plate` plating. */
function anvilGain(stars: number, plate: number): number {
  const fired = (b: Build) => {
    const out: number[] = [];
    run(b, 10, barge(), SEED, (ev, bt) => {
      if (bt.ticks === 1) bt.addPlate(bt.sides[0], plate);
      for (const e of ev) if (e.type === "fire" && e.side === 0) out.push(e.dmg);
    });
    return out;
  };
  const base = fired(furnaceBench()), with_ = fired(withMod(furnaceBench(), 50, "anvil", 0, stars));
  return mean(with_.map((d, i) => d - base[i]));
}

/** STEAM BREECH on FURNACE's heavy gun: the fire rate against its interval (1 / the cooldown after a shot), plated or bare. */
function steamRate(stars: number, plated: boolean): number {
  const cds: number[] = [];
  run(withMod(furnaceBench(), 50, "steambreech", 0, stars), 10, barge(), SEED, (ev, bt) => {
    if (bt.ticks === 1 && plated) bt.addPlate(bt.sides[0], 20);
    const tu = bt.sides[0].turrets[0];
    for (const e of ev) if (e.type === "fire" && e.side === 0) cds.push(tu.fireCd / tu.interval);
  });
  return 1 / mean(cds);
}

/** TWIN TRIGGER on FURNACE's heavy gun fed by two equal press belts (CALIBRATION ★3: nothing waits): the share more
 *  damage its paired shots deal than the plain slug's 3. */
function pairedShare(stars: number): number {
  const b = withMod(withMod(twoPress(), 50, "twintrigger", 0, stars), 51, "calibrate", 0, 3);
  const dmg: number[] = [];
  run(b, 12, barge(), SEED, (ev, bt) => {
    for (const e of ev) if (e.type === "fire" && e.side === 0) {
      const pr = bt.projectiles.find((p) => p.id === e.proj)!;
      if (pr.payload.paired) dmg.push(e.dmg);
    }
  });
  expect(dmg.length).toBeGreaterThan(3);
  return mean(dmg) / 3 - 1;
}

/** SPALL CATCHER on FURNACE's heavy gun: the charge `taken` damage on the hull leaves (with `plate` plating first). */
function spall(stars: number, taken: number, plate: number): number {
  const bt = new Battle(withMod(furnaceBench(), 50, "spallcatcher", 0, stars), barge(), SEED);
  if (plate) bt.addPlate(bt.sides[0], plate);
  priv(bt).impact(shot(1, taken));
  return bt.sides[0].turrets[0].spallCharge ?? 0;
}

/** SEAM WELDER on FURNACE's heavy gun fed by two equal press belts (CALIBRATION ★3: nothing waits). */
const seamDeck = (stars: number) => withMod(withMod(twoPress(), 50, "seamwelder", 0, stars), 51, "calibrate", 0, 3);

// ------------------------------------------------------------------------------------------------------ the tests

describe("wave 3 at 1, 2 and 3 stars: each module's headline number rises (REQ-BFG-019)", () => {
  for (const r of ROWS) it(`${r.id}: ${r.headline}`, () => { checkRow(r); });
});

describe("wave 3's named rules", () => {
  it("PLATE ROLLER: 0.5 / 1.1 / 1.7 plating for each payload it hits, never past 24", () => {
    for (const [s, want] of [[1, 0.5], [2, 1.1], [3, 1.7]] as const) {
      const ps = plates(onTile3("plateroller", s), 100); // a Kiln slug every 1.25 s: 24 plating within 61 s even at 1 star
      expect(ps[0].amount).toBe(want);
      expect(ps.reduce((a, p) => a + p.amount, 0)).toBeCloseTo(24, 9); // it filled the 24 cap, and no more
      expect(ps.at(-1)!.amount).toBeLessThanOrEqual(want); // the last roll only topped it up
    }
  });

  it("BRACE FRAME: 50/70/85% shorter stalls, freezes and chain slows on its tiles; 75/85/95% while plated; on itself too", () => {
    for (const [s, bare, plated] of [[1, 0.5, 0.75], [2, 0.7, 0.85], [3, 0.85, 0.95]] as const) {
      expect(braceCut(s).map((x) => +x.toFixed(9))).toEqual([bare, plated]);
      const bt = stepped(withItem(furnaceBench(), item(30, "braceframe", 3, 4, 0, s)));
      const side = bt.sides[0];
      priv(bt).freeze(side, belt(0, 1), 2.5);
      expect(side.routes[0].cellFrozen[1]).toBeCloseTo(2.5 * (1 - bare), 9);
      priv(bt).slowSegment(side, belt(0, 1), 0.6, 3);
      expect(side.routes[0].cellSlow[1].t).toBeCloseTo(3 * (1 - bare), 9);
      priv(bt).disrupt(side, { kind: "gate", ref: 30, cell: -1, x: 0, y: 0, weight: 2 }, 1.6, "shock"); // on itself
      expect(side.gates.find((g) => g.uid === 30)!.disrupted).toBeCloseTo(1.6 * (1 - bare), 9);
      // a tile it doesn't hit, and a stall on it while it is itself stalled, are untouched
      priv(bt).disrupt(side, belt(0, 3), 1.6, "shock");
      expect(side.routes[0].cellDisrupt[3]).toBe(1.6);
      priv(bt).disrupt(side, belt(0, 1), 1.6, "shock");
      expect(side.routes[0].cellDisrupt[1]).toBe(1.6); // the brace is stalled now: no cut
    }
  });

  it("TWIN LATCH: its hold is 1 s at every star; its damage doubles under an OVERCLOCKER (the hold doesn't)", () => {
    for (const s of [1, 2, 3]) expect(effectAt("twinlatch", s).gate!.latch!.hold).toBe(1);
    const e = effectAt("twinlatch", 2).gate!;
    expect(boostable(e)).toBe(true);
    expect(overclocked(e).latch).toEqual({ hold: 1, flat: 4.4 });
  });

  it("STOKER: 20% / 44% / 70% faster; OVERCLOCKER can't boost it or BRACE FRAME (they act on no payload)", () => {
    for (const [s, k] of [[1, 0.2], [2, 0.44], [3, 0.7]] as const) {
      for (const g of stampGaps(withItem(pressBench(), item(30, "stoker", 6, 6, 0, s)))) expect(Math.abs(g - 1.4 / (1 + k))).toBeLessThan(2 / 60);
    }
    for (const id of ["stoker", "braceframe"]) for (const s of [1, 2, 3]) expect(boostable(effectAt(id, s).gate!), id).toBe(false);
  });

  it("PLATE BREAKER: 1 plating for 4 / 8.8 / 14 at every star; with no plating to take, 1 / 2.2 / 3.5", () => {
    for (const [s, big, floor] of [[1, 4, 1], [2, 8.8, 2.2], [3, 14, 3.5]] as const) {
      // a bare FURNACE: the floor on every payload, no plate event
      const bare = pastTile(onTile3("platebreaker", s), 0, 3).map((x) => x.flat);
      expect(new Set(bare)).toEqual(new Set([floor]));
      // 10 plating: each payload takes 1 (a -1 plate event) and gains the big number until the plating is gone
      const spent: number[] = [];
      const flats: number[] = [];
      const seen = new Set<number>();
      run(onTile3("platebreaker", s), 30, barge(), SEED, (ev, bt) => {
        if (bt.ticks === 1) bt.addPlate(bt.sides[0], 10);
        for (const e of ev) if (e.type === "plate" && e.side === 0 && e.amount < 0) spent.push(e.amount);
        for (const a of bt.sides[0].routes[0].ammo) if (a.processed >= 3 && !seen.has(a.p.id)) { seen.add(a.p.id); flats.push(a.p.flat); }
      });
      expect(spent).toEqual(Array(10).fill(-1));
      const hit = flats.filter((f) => f > 0); // payloads that passed before it came online carry nothing
      expect(hit.slice(0, 10)).toEqual(Array(10).fill(big));
      expect(hit.length).toBeGreaterThan(12);
      expect(hit.slice(10).every((f) => f === floor)).toBe(true);
    }
  });

  it("SHIELD WALL: 1 / 2.2 / 3.5 plating a payload, and 3 / 6.6 / 10.5 damage on it while the hull holds 12 plating", () => {
    for (const [s, plate, dmg] of [[1, 1, 3], [2, 2.2, 6.6], [3, 3.5, 10.5]] as const) {
      expect(plates(onTile3("shieldwall", s), 6)[0].amount).toBe(plate);
      const below = pastTile(onTile3("shieldwall", s), 0, 3, 4, 1).map((x) => x.flat); // 0 plating at first: no bonus
      expect(below[0]).toBe(0);
      const flats: number[] = [];
      const seen = new Set<number>();
      run(onTile3("shieldwall", s), 10, barge(), SEED, (_ev, bt) => {
        if (bt.ticks === 1) bt.addPlate(bt.sides[0], 12);
        for (const a of bt.sides[0].routes[0].ammo) if (a.processed >= 3 && !seen.has(a.p.id)) { seen.add(a.p.id); flats.push(a.p.flat); }
      });
      expect(flats.length).toBeGreaterThan(3);
      for (const f of flats) expect(f).toBe(dmg);
    }
  });

  it("TWIN MOULD: one plain slug onto each belt on the same tick; 3 / 5 / 6 damage every 1.8 / 1.6 / 1.4 s; ★3 THIRD SPRUE casts 3", () => {
    expect([1, 2, 3].map((s) => outputsAt("twinmould", s))).toEqual([2, 2, 3]);
    expect(perkAt("twinmould", 3)).toBe("THIRD SPRUE");
    for (const [s, base, every, n] of [[1, 3, 1.8, 2], [2, 5, 1.6, 2], [3, 6, 1.4, 3]] as const) {
      expect(mouldDps(s)).toBeCloseTo((n * base) / every, 0);
      expect(effectAt("twinmould", s).factory!.interval).toBe(every);
      // every cast lands on every belt on one tick, plain slugs of its base
      const perTick = new Map<number, number>(), seen = new Set<number>(), bases = new Set<number>();
      run(mouldDeck(s), 8, barge(), SEED, (_ev, bt) => {
        for (const r of bt.sides[0].routes) for (const a of r.ammo) {
          if (seen.has(a.p.id)) continue;
          seen.add(a.p.id);
          perTick.set(bt.ticks, (perTick.get(bt.ticks) ?? 0) + 1);
          bases.add(a.p.base ?? 3);
          expect(a.p.ammo).toBe("plain");
        }
      });
      expect(perTick.size).toBeGreaterThan(3);
      for (const [, c] of perTick) expect(c).toBe(n);
      expect([...bases]).toEqual([base]);
    }
  });

  // 0.8.0 B1 M2 (brief 3.3): ARMOR PRESS 2 / 4.4 / 7 plating every 4 s -> 3 / 6.6 / 10.5 every 3 s (its stamping unchanged)
  it("ARMOR PRESS: 3 / 6.6 / 10.5 plating every 3 s; its plain slugs every 1.6 / 1.4 / 1.2 s; no belt to a turret: no plating", () => {
    for (const [s, amount, every] of [[1, 3, 1.6], [2, 6.6, 1.4], [3, 10.5, 1.2]] as const) {
      const ps = plates(pressFurnace("armorpress", s), 7); // two pressings under the 24 cap at every star
      expect(ps.map((p) => p.amount)).toEqual([amount, amount]);
      expect(ps.map((p) => +p.t.toFixed(4))).toEqual([3, 6]);
      expect(effectAt("armorpress", s).factory!.interval).toBe(every);
      const t: number[] = [];
      run(pressFurnace("armorpress", s), 10, barge(), SEED, (ev, bt) => { for (const e of ev) if (e.type === "produce" && e.factory === 7) t.push(bt.t); });
      const gaps = t.slice(1).map((x, i) => x - t[i]); // its slugs: every `every` s while its belt has room (the gun gets busy)
      expect(Math.abs(Math.min(...gaps) - every)).toBeLessThan(2 / 60);
      expect(Math.abs(gaps[0] - every)).toBeLessThan(2 / 60);
      const open = pressFurnace("armorpress", s);
      open.routes[1].cells.pop(); // its belt ends short of the gun
      expect(plates(open, 13)).toEqual([]);
    }
  });

  // 0.8.0 B1 M2 (brief 3.3): ANVIL BREECH +1 / 2.2 / 3.5 and 0.2 / 0.4 / 0.7 a plating -> +2.5 / 5.5 / 8.75 and 1 / 2.2 / 3.5
  it("ANVIL BREECH: +2.5 / 5.5 / 8.75 a shot and 1 / 2.2 / 3.5 for each plating (x the class factor)", () => {
    for (const [s, flat, per] of [[1, 2.5, 1], [2, 5.5, 2.2], [3, 8.75, 3.5]] as const) {
      expect(anvilGain(s, 0)).toBeCloseTo(flat, 6);
      expect(anvilGain(s, 24)).toBeCloseTo(flat + 24 * per, 6);
    }
  });

  // 0.8.0 B1 M2 (brief 3.2, VERIFIED-P1 H1: its weak bare rate): 20 / 44 / 70% plated, 5 / 10 / 15% bare -> 35 / 70 / 110%
  // plated, 10 / 20 / 30% bare
  it("STEAM BREECH: 35 / 70 / 110% faster while plated, 10 / 20 / 30% faster without", () => {
    for (const [s, plated, bare] of [[1, 1.35, 1.1], [2, 1.7, 1.2], [3, 2.1, 1.3]] as const) {
      expect(steamRate(s, true)).toBeCloseTo(plated, 6);
      expect(steamRate(s, false)).toBeCloseTo(bare, 6);
    }
    const tu = { interval: 1, plated: true, core: { spec: { steamPlated: 0.5, steamBare: 0.9 } } } as unknown as Parameters<typeof ROUTINES.steam.cadence>[0];
    expect(ROUTINES.steam.cadence(tu, 0)).toBe(0.5);
  });

  it("TWIN TRIGGER: paired loads deal 25 / 55 / 88% more; its load time is 0.25 / 0.4 / 0.55 s shorter, never below 0.3 s", () => {
    for (const [s, bonus, cut] of [[1, 0.25, 0.25], [2, 0.55, 0.4], [3, 0.88, 0.55]] as const) {
      expect(pairedShare(s)).toBeCloseTo(bonus, 6);
      const tu = new Battle(withMod(furnaceBench(), 50, "twintrigger", 0, s), barge(), SEED).sides[0].turrets[0];
      expect(tu.windowTime).toBeCloseTo(WINDOW_TIME - cut, 9);
      // on a ROTARY BREECH (0.8 s) the floor holds: 0.8 - 0.55 = 0.25 -> 0.3
      const rot = new Battle(withMod(withMod(furnaceBench(), 50, "twintrigger", 0, s), 51, "rotary", 0), barge(), SEED).sides[0].turrets[0];
      expect(rot.windowTime).toBeCloseTo(Math.max(LOAD_FLOOR, 0.8 - cut), 9);
    }
    // an unpaired load gets nothing: one belt only
    const one = twoPress();
    one.routes.pop();
    const dmg: number[] = [];
    run(withMod(one, 50, "twintrigger", 0, 3), 10, barge(), SEED, (ev) => { for (const e of ev) if (e.type === "fire" && e.side === 0) dmg.push(e.dmg); });
    expect(new Set(dmg)).toEqual(new Set([3]));
  });

  it("SPALL CATCHER: 1 / 2.2 / 3.5 damage for every 4 taken, up to 8 / 17.6 / 28; plating soaked counts twice; the next shot spends it", () => {
    for (const [s, add, max] of [[1, 1, 8], [2, 2.2, 17.6], [3, 3.5, 28]] as const) {
      expect(spall(s, 8, 0)).toBeCloseTo(add * 2, 9);
      expect(spall(s, 8, 8)).toBeCloseTo(add * 4, 9); // all 8 soaked: twice
      expect(spall(s, 400, 0)).toBe(max);
      // the next shot carries it, and the charge is gone
      const bt = new Battle(withMod(furnaceBench(), 50, "spallcatcher", 0, s), barge(), SEED);
      priv(bt).impact(shot(1, 8));
      const fired: number[] = [];
      while (!fired.length && bt.t < 10) { bt.step(); for (const e of bt.drainEvents()) if (e.type === "fire" && e.side === 0) fired.push(e.dmg); }
      const plainShot = new Battle(furnaceBench(), barge(), SEED);
      const base: number[] = [];
      while (!base.length && plainShot.t < 10) { plainShot.step(); for (const e of plainShot.drainEvents()) if (e.type === "fire" && e.side === 0) base.push(e.dmg); }
      expect(fired[0] - base[0]).toBeCloseTo(add * 2, 9);
      expect(bt.sides[0].turrets[0].spallCharge).toBe(0);
    }
    // the dark wind doesn't count
    const bt = new Battle(withMod(furnaceBench(), 50, "spallcatcher", 0, 1), barge(), SEED);
    bt.t = 30;
    for (let i = 0; i < 60; i++) bt.step();
    expect(bt.sides[0].stats.windTaken).toBeGreaterThan(1);
    expect(bt.sides[0].turrets[0].spallCharge).toBe(0);
  });

  it("SEAM WELDER: each pair rolls 1 / 2.2 / 3.5 plating and every other load 0.2 / 0.4 / 0.7; a FOUNDRY fusion is a pair", () => {
    for (const [s, pair, lone] of [[1, 1, 0.2], [2, 2.2, 0.4], [3, 3.5, 0.7]] as const) {
      const ps = plates(seamDeck(s), 10).map((p) => p.amount);
      expect(new Set(ps)).toEqual(new Set([lone, pair]));
      const f = plates(withMod(heroStartBuild("foundry", 1), 50, "seamwelder", 0, s), 10).map((p) => p.amount);
      expect(f).toContain(pair);
    }
  });
});

// keep imports used in helpers only
export type { SimEvent };
