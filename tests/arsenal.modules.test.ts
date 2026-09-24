// 0.6.1p: per module, per star (ARSENAL.md §10 item 1; REQ-BFG-019). Every live module and every wave-1 turret mod
// gets a bench (a fixed deck and seed, tests/arsenal.bench.ts) that reads its catalogue.json headline metric at
// 1, 2 and 3 stars: 1 star < 2 < 3 strictly, and 2/1 and 3/1 within the headline's stated band (+-15%) where the
// catalogue states one. Named perks get their own asserts below. BB_TABLES=1 prints the numbers (REPORT.md).
import { describe, expect, it } from "vitest";
import { Battle } from "../src/sim/battle";
import { DISRUPT_TIME, GUARD_FREEZE, GUARD_SLOW } from "../src/sim/content";
import { key, type Build } from "../src/sim/deck";
import { barge, bench, busy, coilStall, est, pressDps, pressOnly, run, SEED } from "./arsenal.bench";

type Metric = number | number[];
export interface Row { id: string; headline: string; band?: [number, number]; at: (stars: number) => Metric }

const tu0 = (b: Build) => new Battle(b, barge(), SEED).sides[0].turrets[0];
const K = key;

/** The live modules (0.6.1a's 11). Tuple metrics (EXT. CHAMBER) rise when no part falls and one part rises. */
export const LIVE_ROWS: Row[] = [
  { id: "temper", headline: "Burn stacks per payload", band: [2.0, 3.5], at: (s) => est(bench([["temper", 4, 3, s]])).burn },
  { id: "whetstone", headline: "Flat damage", band: [2.0, 3.5], at: (s) => est(bench([["whetstone", 4, 3, s]])).dmg - est(bench()).dmg },
  { id: "grease", headline: "Speed above 1x", band: [2.2, 3.5], at: (s) => run(bench([["grease", 4, 4, s]]), 5).sides[0].routes[0].speedAt[3] - 1 },
  // 60 px (5 tiles) of belt follow the gate's centre on this route
  { id: "brake", headline: "Seconds added per tile vs 1x", band: [2.2, 3.5], at: (s) => (est(bench([["brake", 4, 4, s]])).time - est(bench()).time) / 5 },
  { id: "longhaul", headline: "Flat damage per prior gate", band: [2.0, 3.5], at: (s) => est(bench([["whetstone", 4, 4, 1], ["longhaul", 4, 2, s]])).dmg - est(bench([["whetstone", 4, 4, 1]])).dmg },
  { id: "coil", headline: "Machine-seconds stalled per shocked machine hit", band: [2.25, 3.5], at: (s) => coilStall(s).perHit },
  { id: "splitter", headline: "Total damage above 100%", band: [2.2, 3.5], at: (s) => { const e = est(bench([["splitter", 4, 3, s]])); return (e.copies * e.dmg) / est(bench()).dmg - 1; } },
  { id: "overdrive", headline: "Speed (perks carry the level)", at: (s) => run(bench([["overdrive", 4, 4, s]]), 5).sides[0].routes[0].speedAt[3] },
  { id: "press", headline: "Output dps (base / interval)", band: [2.1, 3.5], at: (s) => pressDps(s).dps },
  { id: "chamber", headline: "Payloads per shot; window slots", at: (s) => { const t = tu0(bench([], [["chamber", s]])); return [t.perShot, t.window]; } },
  { id: "calibrate", headline: "Fire-rate bonus", band: [2.2, 3.5], at: (s) => 1 / tu0(bench([], [["calibrate", s]])).interval - 1 },
];

/** a < b: a scalar strictly; a tuple when no part falls and at least one part rises. */
export function rises(a: Metric, b: Metric): boolean {
  if (typeof a === "number" && typeof b === "number") return a < b;
  const x = a as number[], y = b as number[];
  return x.every((v, i) => v <= y[i]) && x.some((v, i) => v < y[i]);
}

export function checkRow(r: Row): void {
  const m = [1, 2, 3].map((s) => r.at(s));
  if (process.env.BB_TABLES) console.log(`BENCH ${r.id} | ${r.headline} | ${m.map((v) => (typeof v === "number" ? +v.toFixed(3) : v.join("/"))).join(" | ")}`);
  expect(rises(m[0], m[1]) && rises(m[1], m[2]), `${r.id}: ${JSON.stringify(m)}`).toBe(true);
  if (!r.band) return;
  const [m1, m2, m3] = m as number[];
  const [b2, b3] = r.band;
  expect(m2 / m1, `${r.id} 2/1`).toBeGreaterThanOrEqual(b2 * 0.85);
  expect(m2 / m1, `${r.id} 2/1`).toBeLessThanOrEqual(b2 * 1.15);
  expect(m3 / m1, `${r.id} 3/1`).toBeGreaterThanOrEqual(b3 * 0.85);
  expect(m3 / m1, `${r.id} 3/1`).toBeLessThanOrEqual(b3 * 1.15);
}

describe("per-module benches: the headline metric rises 1 < 2 < 3 stars, within the catalogue's band", () => {
  for (const r of LIVE_ROWS) it(`${r.id}: ${r.headline}`, () => checkRow(r));
});

describe("0.6.1p: the six pending perks, each applied", () => {
  it("LONG HAUL: priorCap 6 at 2 and 3 stars (1 star counts all 8 prior gates), in estimateRoute and the sim", () => {
    // a 12-tile snake route: 8 WHETSTONES, then LONG HAUL on the 9th tile
    const snake = (s: number, haul = true): Build => {
      const b = bench();
      const cells = [K(4, 5), K(3, 5), K(2, 5), K(1, 5), K(1, 4), K(2, 4), K(3, 4), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
      b.routes = [{ factory: 1, cells }];
      cells.slice(0, 8).forEach((k, i) => b.items.push({ uid: 20 + i, def: "whetstone", x: k % 10, y: Math.floor(k / 10) }));
      if (haul) b.items.push({ uid: 40, def: "longhaul", x: 4, y: 3, ...(s > 1 ? { stars: s } : {}) });
      return b;
    };
    const d = [1, 2, 3].map((s) => est(snake(s)).dmg - est(snake(s, false)).dmg);
    expect(d[0]).toBeCloseTo(2 * 8);
    expect(d[1]).toBeCloseTo(4 * 6); // not 4 x 8
    expect(d[2]).toBeCloseTo(7 * 6);
    const bt = run(snake(2), 14);
    const past = bt.sides[0].routes[0].ammo.filter((a) => a.processed >= 8);
    expect(past.length).toBeGreaterThan(0);
    for (const a of past) expect(a.p.flat).toBeCloseTo(8 * 2 + 4 * 6);
  });

  it("GALVANIC COIL: 1 star stalls exactly DISRUPT_TIME as in 0.6.0; 1.8 s and 2.8 s; SPARK JUMP stalls a second machine", () => {
    const c = [1, 2, 3].map((s) => coilStall(s));
    expect(c[0].stalls).toEqual([DISRUPT_TIME]); // every 1-star stall is exactly 0.6.0's
    expect(DISRUPT_TIME).toBe(1.6); // catalogue star1
    expect(c.map((x) => x.stalls)).toEqual([[1.6], [1.8], [2.8]]);
    expect(c[0].perHit).toBeCloseTo(1.6);
    expect(c[1].perHit).toBeCloseTo(3.6); // 1.8 s on the struck machine + 1.8 s on the jump
    expect(c[2].perHit).toBeCloseTo(5.6);
    expect(c.map((x) => x.maxPerTick)).toEqual([1, 2, 2]); // the jump: a second disrupt in the same tick
    for (const x of c) expect(x.hits).toBeGreaterThan(3);
  });

  it("GALVANIC COIL: the jump picks the nearest other machine by distance, with no RNG (same seed, same stalls)", () => {
    const a = coilStall(2), b = coilStall(2);
    expect(a).toEqual(b);
  });

  it("SPLITTER: THREE-WAY makes 3 copies at 57% (applyGate returns two new copies)", () => {
    expect([1, 2, 3].map((s) => est(bench([["splitter", 4, 3, s]])).copies)).toEqual([2, 2, 3]);
    let seen = -1;
    run(bench([["splitter", 4, 3, 3]]), 4, barge(), SEED, (ev, bt) => {
      if (seen >= 0 || !ev.some((e) => e.type === "process" && e.side === 0 && e.def === "splitter")) return;
      const copies = bt.sides[0].routes[0].ammo.filter((a) => a.p.copy);
      seen = copies.length;
      for (const a of copies) expect(a.p.mult).toBeCloseTo(0.57);
      expect(new Set(copies.map((a) => a.p.id)).size).toBe(copies.length);
      const s = copies.map((a) => a.s);
      expect(s[0] > s[1] && s[1] > s[2]).toBe(true); // front first, the belt order kept
    });
    expect(seen).toBe(3);
  });

  it("OVERDRIVE: AFTERBURNER +3 flat at 3 stars; REDLINE/AFTERBURNER guard flags set downstream, with no effect in wave 1", () => {
    const flatAt = (s: number) => {
      const bt = run(bench([["overdrive", 4, 4, s]]), 6);
      const past = bt.sides[0].routes[0].ammo.filter((a) => a.processed >= 1);
      expect(past.length).toBeGreaterThan(0);
      return past[0].p.flat;
    };
    expect([1, 2, 3].map(flatAt)).toEqual([0, 0, 3]);
    const guard = (s: number) => new Battle(bench([["overdrive", 4, 4, s]]), barge(), SEED).sides[0].routes[0].guard;
    expect(guard(1)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(guard(2)).toEqual([0, GUARD_SLOW, GUARD_SLOW, GUARD_SLOW, GUARD_SLOW, GUARD_SLOW]);
    expect(guard(3)).toEqual([0, 3, 3, 3, 3, 3].map((v) => (v ? GUARD_SLOW | GUARD_FREEZE : 0)));
    // the flags do nothing yet: clearing them fights identically
    const a = new Battle(bench([["overdrive", 4, 4, 3]]), busy(), SEED);
    const b = new Battle(bench([["overdrive", 4, 4, 3]]), busy(), SEED);
    b.sides[0].routes[0].guard.fill(0);
    for (let i = 0; i < 60 * 30; i++) { a.step(); b.step(); }
    expect(a.sides[0].stats.damage).toBe(b.sides[0].stats.damage);
    expect(a.sides[1].stats.damage).toBe(b.sides[1].stats.damage);
  });

  it("STAMP PRESS: HARDENED DIES 5 and MASTER DIES 7.5 through Payload.base (estimate and every fired slug)", () => {
    expect([1, 2, 3].map((s) => pressDps(s).base)).toEqual([[3], [5], [7.5]]);
    expect([1, 2, 3].map((s) => est(pressOnly(s)).dmg)).toEqual([3, 5, 7.5]);
    for (const s of [1, 2, 3]) {
      const dmg = new Set<number>();
      run(pressOnly(s), 20, barge(), SEED, (ev) => { for (const e of ev) if (e.type === "fire" && e.side === 0) dmg.add(e.dmg); });
      expect([...dmg]).toEqual([[3], [5], [7.5]][s - 1]);
    }
  });

  it("EXT. CHAMBER: WIDE BREECH window +1 at 2 and 3 stars; a busy SALVO turret then fires volleys of 4", () => {
    expect([1, 2, 3].map((s) => tu0(bench([], [["chamber", s]])).window)).toEqual([3, 4, 4]);
    // SALVO RACK waits for a full window (or 2x the window time), so the window's size shows as the volley
    const most = (s: number) => { // the largest volley: shots turret 0 fires in one tick
      let m = 0;
      run(busy([["chamber", s], ["salvo", 1]]), 30, barge(), SEED, (ev) => {
        m = Math.max(m, ev.filter((e) => e.type === "fire" && e.side === 0 && e.turret === 0).length);
      });
      return m;
    };
    expect([1, 2, 3].map(most)).toEqual([3, 4, 4]);
  });
});
