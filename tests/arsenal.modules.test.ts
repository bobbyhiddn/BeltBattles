// 0.6.1p: per module, per star (ARSENAL.md §10 item 1; REQ-BFG-019). Every live module and every wave-1 turret mod
// gets a bench (a fixed deck and seed, tests/arsenal.bench.ts) that reads its catalogue.json headline metric at
// 1, 2 and 3 stars: 1 star < 2 < 3 strictly, and 2/1 and 3/1 within the headline's stated band (+-15%) where the
// catalogue states one. Named perks get their own asserts below. BB_TABLES=1 prints the numbers (REPORT.md).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Battle } from "../src/sim/battle";
import { DISRUPT_TIME, GUARD_SKIRT, STUN_CAUSES, WINDOW_TIME, type HarassCause } from "../src/sim/content"; // Y7b2 (the flip): GUARD_SLOW, GUARD_FREEZE dropped with OVERDRIVE's guard test
import { arrowCell, arrowsOf, hitsOfRig, key, kx, ky, rigHits, rotField, type Build } from "../src/sim/deck";
import { migrateInlineGates, rotFacing } from "../src/sim/beltside";
import { barge, bench, busy, coilStall, est, finishers, pressDps, pressOnly, rawDamage, run, SEED, turretStall } from "./arsenal.bench";
import { pct } from "../src/sim/pct"; // NUM-1 (REQ-BFG-047): the sim's one % rule (FINISHER RAM below)
import { batchGaps, factoryBench, factoryLight, factoryOut, gantryBench, gantryWeaver, stamps } from "./arsenal.bench"; // 0.6.1c
import type { Payload } from "../src/sim/battle";
import { AMMO_SPACING, BELT_SPEED, secPer } from "../src/sim/content"; // NUM-2 (REQ-BFG-047): secPer, a factory's cycle 30 / speed
import { TICK } from "../src/sim/content"; // AZ-BUMP (the flip, LADDER_FIX): the walk's stamp to chamber is whole ticks (P13)
import { withLadderFix } from "../src/sim/ladderFix"; // AZ-BUMP (the flip, LADDER_FIX): SLAG POT's walk with the switch off
import { effectAt, outputsAt, starsOf } from "../src/sim/stars";
import { overclocked } from "../src/sim/overclock";
import { SCALE_RIGS, flatOf } from "../src/sim/scale"; // BUMP-1E: the switch ships on; a payload's whole flat bonus (the stat rows' flat plus the FOR EACH each)
import { routeProblems } from "../src/game/routeCheck";
import { gainModule } from "../src/game/fuse";
import { newRun } from "../src/game/run";
// 0.6.2 BELTSIDE merge (ref/BRIEF-beltside-merge-061.md): the decks are native rigs. The benches go through
// arsenal.bench.ts's ported bench() (each rig beside the tile its gate stood on, one arrow on it); the LONG HAUL snake
// is placed by hand; the MANTLET dead-offer check migrates its par-deck foe at setup. No assertion changed.

type Metric = number | number[];
export interface Row { id: string; headline: string; band?: [number, number]; at: (stars: number) => Metric }

const tu0 = (b: Build) => new Battle(b, barge(), SEED).sides[0].turrets[0];
const K = key;

/** The live modules (0.6.1a's 11). Tuple metrics (EXT. CHAMBER) rise when no part falls and one part rises. */
export const LIVE_ROWS: Row[] = [
  { id: "temper", headline: "Burn stacks per payload", band: [2.0, 3.5], at: (s) => est(bench([["temper", 4, 3, s]])).burn },
  { id: "whetstone", headline: "Flat damage", band: [2.0, 3.5], at: (s) => est(bench([["whetstone", 4, 3, s]])).dmg - est(bench()).dmg },
  { id: "grease", headline: "Speed above 1x", band: [2.2, 3.5], at: (s) => run(bench([["grease", 4, 4, s]]), 5).sides[0].routes[0].speedAt[3] - 1 },
  // 60 px (5 tiles) of belt follow the gate's centre on this route. 0.6.1f: HALF SPEED at every star, so the seconds
  // are equal and the heat rises (a tuple: no part falls, the flat rises); no band, since 1 star adds no flat.
  // Y7b2 (the flip): HOT SHOE's and RED-HOT SHOE's flats are gone and the belt runs 50% / 40% / 30%, so the seconds rise
  // and the flat stays 0 (its exact checks, the "0.6.1f: BRAKE SHOE merges into heat" block below, are deleted)
  { id: "brake", headline: "Seconds added per tile vs 1x; flat damage per payload", at: (s) => [
    (est(bench([["brake", 4, 4, s]])).time - est(bench()).time) / 5,
    +(est(bench([["brake", 4, 4, s]])).dmg - est(bench([["brake", 4, 4, 1]])).dmg).toFixed(6),
  ] },
  { id: "longhaul", headline: "Flat damage per prior gate", band: [2.0, 3.5], at: (s) => est(bench([["whetstone", 4, 4, 1], ["longhaul", 4, 2, s]])).dmg - est(bench([["whetstone", 4, 4, 1]])).dmg },
  { id: "coil", headline: "Machine-seconds stalled per shocked machine hit", band: [2.25, 3.5], at: (s) => coilStall(s).perHit },
  { id: "splitter", headline: "Total damage above 100%", band: [2.2, 3.5], at: (s) => { const e = est(bench([["splitter", 4, 3, s]])); return (e.copies * e.dmg) / est(bench()).dmg - 1; } },
  { id: "overdrive", headline: "Speed (perks carry the level)", at: (s) => run(bench([["overdrive", 4, 4, s]]), 5).sides[0].routes[0].speedAt[3] },
  { id: "press", headline: "Output dps (base / interval)", band: [2.1, 3.5], at: (s) => pressDps(s).dps },
  { id: "chamber", headline: "Payloads per shot; window slots", at: (s) => { const t = tu0(bench([], [["chamber", s]])); return [t.perShot, t.window]; } },
  { id: "calibrate", headline: "Fire-rate bonus", band: [2.2, 3.5], at: (s) => 1 / tu0(bench([], [["calibrate", s]])).interval - 1 },
];

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** 0.6.1p's three wave-1 turret mods (catalogue.json hopper, mantlet, ram). */
export const WAVE1_ROWS: Row[] = [
  // slots, seconds, the store (0.6.2 FB-B: loads held while the gun fires; ★2/★3 keep ★1's slot and seconds) and
  // BOTTOMLESS (1 = never jams), read off the battle's turret on the heavy bench (window 3, 1.5 s)
  { id: "hopper", headline: "Window slots; loading window s; store; never jams", at: (s) => { const t = tu0(bench([], [["hopper", s]])); return [t.window - 3, +(t.windowTime - WINDOW_TIME).toFixed(3), t.storeMax, t.noJam ? 1 : 0]; } },
  // immunities listed plus intake tiles guarded (4 / 6 + 1 / 6 + 3; 0.6.2 FB-B: FULL PLATE also shields the intake tile)
  { id: "mantlet", headline: "Immunities by star (+ guarded intake tiles)", at: (s) => { const t = tu0(bench([], [["mantlet", s]])); return t.immune.length + t.intakeGuard; } },
  { id: "ram", headline: "Finisher bonus", band: [2.2, 3.5], at: (s) => mean(finishers(busy([["ram", s]])).bonus) },
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

/** 0.6.1c's six factories (catalogue.json headline and ratio; the output bench of tests/arsenal.bench.ts factoryOut). */
export const FACTORY_ROWS: Row[] = [
  { id: "doublestamp", headline: "Output dps (batch x base / interval)", band: [2.3, 3.5], at: (s) => factoryOut("doublestamp", s).dps },
  { id: "shottower", headline: "Output dps (3 shots x base / interval)", band: [2.2, 3.5], at: (s) => factoryOut("shottower", s).dps },
  // the headline's Burn 2 / 4 / 7 on each ember slug (interval and spark stall have their own asserts below)
  // Y7b2 (the flip): Y2's ember BURN 2 / 5 / 9 (content.ts hotswap), so 2/1 and 3/1 are 2.5 and 4.5: band [2.5, 4.5] (was [2.0, 3.5])
  { id: "hotswap", headline: "Burn per ember slug", band: [2.5, 4.5], at: (s) => est(factoryBench("hotswap", s, { only: true }), 0).burn },
  { id: "slagpot", headline: "Output dps (base / interval)", band: [2.2, 3.4], at: (s) => factoryOut("slagpot", s).dps },
  // x0.5 / x0.25 / x0: the share of commissioning time saved, read off the Kiln route's two gates
  { id: "assembly", headline: "Commissioning time saved (1 - factor)", band: [1.5, 2.0], at: (s) => commissionSaved(s) },
  { id: "gantry", headline: "Output dps, all outputs (base / interval)", band: [1.7, 3.4], at: (s) => factoryOut("gantry", s).dps },
];

const KILN_GATES: [string, number, number, number][] = [["whetstone", 4, 4, 1], ["whetstone", 4, 2, 1]];
function commissionSaved(stars: number): number {
  // 0.6.2 BELTSIDE merge (0.6.1c): the rigs working the Kiln's belt (column 4) stand west of it, at x 3 (bench()),
  // where the gates stood on it at x 4
  const at = (b: Build) => new Battle(b, barge(), SEED).sides[0].gates.filter((g) => g.x === 3).map((g) => g.commissionAt);
  const base = at(bench(KILN_GATES)), got = at(factoryBench("assembly", stars, { gates: KILN_GATES }));
  return 1 - got.reduce((a, b) => a + b, 0) / base.reduce((a, b) => a + b, 0);
}

describe("per-module benches: the headline metric rises 1 < 2 < 3 stars, within the catalogue's band", () => {
  for (const r of [...LIVE_ROWS, ...WAVE1_ROWS, ...FACTORY_ROWS]) it(`${r.id}: ${r.headline}`, () => checkRow(r));
  it("finishers() sees no finisher without FINISHER RAM", () => expect(finishers(busy()).fins).toBe(0));
});

describe("0.6.1p: the six pending perks, each applied", () => {
  // Y7b2 (the flip): LONG HAUL's priorCap is gone (★2/★3 counted at most 6 earlier hits), so every star counts all 8 (was
  // "LONG HAUL: priorCap 6 at 2 and 3 stars (1 star counts all 8 prior gates), in estimateRoute and the sim")
  it("LONG HAUL: every star counts all 8 prior gates (no priorCap), in estimateRoute and the sim", () => {
    // a 12-tile snake route: 8 WHETSTONES, then LONG HAUL on the 9th tile
    // 0.6.2 BELTSIDE merge: by hand, each rig beside its old tile with its one arrow on it: [x, y, facing] per tile
    // 0-7 (tile 0 from the east, 1-3 from below, 4 from the west, 5-6 from above, 7 from the east); the LONG HAUL
    // (II) east of tile 8, (5,3), whose west arrow works (4,3) and whose east arrow points at empty deck
    const WHET: [number, number, 0 | 1 | 2 | 3][] = [[5, 5, 3], [3, 6, 0], [2, 6, 0], [1, 6, 0], [0, 4, 1], [2, 3, 2], [3, 3, 2], [5, 4, 3]];
    const snake = (s: number, haul = true): Build => {
      const b = bench();
      const cells = [K(4, 5), K(3, 5), K(2, 5), K(1, 5), K(1, 4), K(2, 4), K(3, 4), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
      b.routes = [{ factory: 1, cells }];
      WHET.forEach(([x, y, dir], i) => b.items.push({ uid: 20 + i, def: "whetstone", x, y, ...rotField("whetstone", rotFacing("whetstone", dir)) }));
      if (haul) b.items.push({ uid: 40, def: "longhaul", x: 5, y: 3, ...(s > 1 ? { stars: s } : {}) });
      // the port keeps the gates' hits: one per rig, WHETSTONE i on tile i and the LONG HAUL on tile 8
      const hits = rigHits(b);
      WHET.forEach((_, i) => expect(hitsOfRig(b, 20 + i, hits).map((h) => h.tile), `whetstone ${i}`).toEqual([i]));
      if (haul) expect(hitsOfRig(b, 40, hits).map((h) => h.tile)).toEqual([8]);
      return b;
    };
    // NUM-1 (REQ-BFG-047): the damage is whole (payloadDamage rounds once), so the estimates and the flat are exact (toBe)
    const d = [1, 2, 3].map((s) => est(snake(s)).dmg - est(snake(s, false)).dmg);
    expect(d[0]).toBe(effectAt("longhaul", 1).gate!.perPriorGate! * 8);
    expect(d[1]).toBe(effectAt("longhaul", 2).gate!.perPriorGate! * 8); // Y7b2 (the flip): was x 6 (priorCap; "not ★2 x 8")
    expect(d[2]).toBe(effectAt("longhaul", 3).gate!.perPriorGate! * 8); // Y7b2 (the flip): was x 6 (priorCap)
    const bt = run(snake(2), 14);
    const past = bt.sides[0].routes[0].ammo.filter((a) => a.processed >= 8);
    expect(past.length).toBeGreaterThan(0);
    // NUM-1: 8 WHETSTONES at ★1's flat (x10: was the literal 8 * 2). Y7b2 (the flip): LONG HAUL ★2 x 8 (was x 6, priorCap)
    // BUMP-1E: with the scaling rules on (SCALE_RIGS, bb-0.12.0) LONG HAUL's FOR EACH damage rides p.each (battle.ts forEach, REQ-BFG-110
    // step 4) and the WHETSTONES' stat rows stay in p.flat (160 + 160), so the slug's whole flat bonus is flatOf(p), the same number the
    // shot reads and the same total as before (was a.p.flat; with the switch off `each` is never set and flatOf(p) is p.flat)
    for (const a of past) expect(flatOf(a.p)).toBe(8 * effectAt("whetstone", 1).gate!.flat! + effectAt("longhaul", 2).gate!.perPriorGate! * 8);
    expect(SCALE_RIGS).toBe(true); // BUMP-1E: the switch ships on (the reason the sum is read through flatOf)
  });

  // NUM-3 (N1 2.2): whole-second STUNs: DISRUPT_TIME 2 at ★1, shockTime 2 / 3 at ★2 / ★3 (was 1.6, 1.8 and 2.8 s). The
  // stalls and the seconds per hit are read from the data (DISRUPT_TIME, effectAt); each is a whole number of ticks
  it("GALVANIC COIL: 1 star stalls exactly DISRUPT_TIME as in 0.6.0; 2 s and 3 s; SPARK JUMP stalls a second machine", () => {
    const c = [1, 2, 3].map((s) => coilStall(s));
    const shockTime = (s: number) => effectAt("coil", s).gate!.shockTime!;
    expect(c[0].stalls).toEqual([DISRUPT_TIME]); // every 1-star stall is exactly DISRUPT_TIME, as in 0.6.0
    expect(DISRUPT_TIME).toBe(2); // catalogue star1. NUM-3 (N1 2.2): whole seconds (was 1.6)
    expect(c.map((x) => x.stalls)).toEqual([[DISRUPT_TIME], [shockTime(2)], [shockTime(3)]]); // NUM-3: was [[1.6], [1.8], [2.8]]
    expect(c[0].perHit).toBeCloseTo(DISRUPT_TIME); // NUM-3: was 1.6
    expect(c[1].perHit).toBeCloseTo(2 * shockTime(2)); // the stall on the struck machine + the same on the jump (NUM-3: was 3.6, 1.8 + 1.8)
    expect(c[2].perHit).toBeCloseTo(2 * shockTime(3)); // NUM-3: was 5.6 (2.8 + 2.8)
    expect(c.map((x) => x.maxPerTick)).toEqual([1, 2, 2]); // the jump: a second disrupt in the same tick
    for (const x of c) expect(x.hits).toBeGreaterThan(3);
  });

  it("GALVANIC COIL: the jump picks the nearest other machine by distance, with no RNG (same seed, same stalls)", () => {
    const a = coilStall(2), b = coilStall(2);
    expect(a).toEqual(b);
  });

  // 0.6.1f: PERFECT CUT replaced THREE-WAY (its third copy overfilled the chamber); the sim's generic copies loop stays
  it("SPLITTER: PERFECT CUT makes 2 copies at 85% (applyGate returns one new copy, as at 1-2 stars)", () => {
    expect([1, 2, 3].map((s) => est(bench([["splitter", 4, 3, s]])).copies)).toEqual([2, 2, 2]);
    /** The copies on the belt right after the splitter's first cut: [count, mults, positions]. */
    const firstCut = (b: Build, secs: number) => {
      let out: [number, number[], number[]] = [-1, [], []];
      run(b, secs, barge(), SEED, (ev, bt) => {
        if (out[0] >= 0 || !ev.some((e) => e.type === "process" && e.side === 0 && e.def === "splitter")) return;
        const copies = bt.sides[0].routes[0].ammo.filter((a) => a.p.copy);
        expect(new Set(copies.map((a) => a.p.id)).size).toBe(copies.length);
        out = [copies.length, copies.map((a) => a.p.mult), copies.map((a) => a.s)];
      });
      return out;
    };
    const [n, mults, s] = firstCut(bench([["splitter", 4, 3, 3]]), 4);
    expect(n).toBe(2);
    for (const m of mults) expect(m).toBeCloseTo(0.85);
    expect(s[0] > s[1]).toBe(true); // front first, the belt order kept
    // Y7b2 (the flip): ASSEMBLY LINE ★3 HOT START is gone, so its check is deleted (was: under HOT START's overclock a 1-star
    // splitter cuts 3, the generic loop's copies - 1: n 3, mults 0.6, front first)
  });

  // Y7b2 (the flip): the test "OVERDRIVE: REDLINE +1 and AFTERBURNER +3 flat at 2 and 3 stars; REDLINE/AFTERBURNER guard
  // flags set downstream, with no effect in wave 1" is deleted: OVERDRIVE ★2/★3's flats and guards are gone (Y2)

  it("STAMP PRESS: HARDENED DIES 5 and MASTER DIES 7.5 through Payload.base (estimate and every fired slug)", () => {
    const dies = [3, 5, 7.5].map((v) => 10 * v); // NUM-1: x10 (was 3 / 5 / 7.5)
    expect([1, 2, 3].map((s) => pressDps(s).base)).toEqual(dies.map((v) => [v]));
    expect([1, 2, 3].map((s) => est(pressOnly(s)).dmg)).toEqual(dies);
    for (const s of [1, 2, 3]) {
      const dmg = new Set<number>();
      run(pressOnly(s), 20, barge(), SEED, (ev) => { for (const e of ev) if (e.type === "fire" && e.side === 0) dmg.add(e.dmg); });
      expect([...dmg]).toEqual([dies[s - 1]]);
    }
  });

  // Y7b2 (the flip): the test "EXT. CHAMBER: WIDE BREECH window +1 at 2 and 3 stars; a busy SALVO turret then fires volleys
  // of 4" is deleted: EXT. CHAMBER's +1 slot is gone (Y4: it fires 2 / 3 / 4 loads a shot, at most the chamber)
});

// Y7b2 (the flip): the block "0.6.1f: BRAKE SHOE merges into heat, not a deeper slow (HOT SHOE, RED-HOT SHOE)" and its one
// test ("the seconds added per tile are equal at every star; the flat damage per payload is 0 / 2 / 5 exactly") are deleted:
// BRAKE SHOE ★2/★3's flats are gone and it slows the belt to 40% / 30% (Y3)

/** A private Battle.disrupt call on side 0 (the probe for MANTLET's immunities). */
type Disrupt = { disrupt(s: unknown, t: { kind: string; ref: number; cell: number; x: number; y: number; weight: number }, secs: number, cause: HarassCause): boolean };
const hit = (bt: Battle, kind: string, ref: number, cell: number, cause: HarassCause = "shock") =>
  (bt as unknown as Disrupt).disrupt(bt.sides[0], { kind, ref, cell, x: 0, y: 0, weight: 1 }, DISRUPT_TIME, cause);
/** The weaver's day-6 par deck (golden-060 fixture, read only): a Coil deck. 0.6.2 BELTSIDE merge: an inline deck, so
 *  it migrates at setup (D3, as any ghost or preset deck does at load); its COILs then work their old tiles as rigs. */
const coilDeck = (): Build => {
  const b = (JSON.parse(readFileSync(new URL("./fixtures/golden-060/par.json", import.meta.url), "utf8")) as { decks: Record<string, Build> }).decks["par/weaver/6"];
  migrateInlineGates(b);
  return b;
};

describe("0.6.1p: HOPPER, MANTLET and FINISHER RAM", () => {
  // 0.6.2 FB-B (tests/fb062.hopper.test.ts): every star keeps ★1's +1 slot and +0.5 s (was +1/+2/+3 and +0.5/+1.0/+1.5)
  // and ★2/★3 add a store of 1/2 loads taken while the gun fires
  // Y7b2 (the flip): HOPPER's +0.5 s load time, its ★2/★3 store and ★3 BOTTOMLESS's no-jam are gone, and its chamber holds
  // +1 / +2 / +3 (Y4). Its window is re-pinned; the checks of the three removed rules are deleted (windowTime [2, 2, 2],
  // storeMax [0, 1, 2], and the jamming busy deck: jams > 0 without it, 0 with a 3-star HOPPER). Was "HOPPER: window +1 slot
  // and +0.5 s at every star, a store of 0/1/2; BOTTOMLESS never jams on a jamming deck"
  it("HOPPER: window +1 / +2 / +3 slots", () => {
    expect([1, 2, 3].map((s) => tu0(bench([], [["hopper", s]])).window)).toEqual([4, 5, 6]); // Y7b2 (the flip): was [4, 4, 4]
  });

  // Y7b2 (the flip): HOPPER's +0.5 s is gone, so the checks that its seconds do nothing on a GATLING SPOOL (shots and damage
  // with windowTime set back to WINDOW_TIME) and that they change a fight on the identity routine are deleted; its slot still
  // counts there. Was "HOPPER on a GATLING SPOOL: its slot counts, its seconds do nothing (the Prime's call)"
  it("HOPPER on a GATLING SPOOL: its slot counts (the Prime's call)", () => {
    const a = new Battle(busy([["gatling", 1], ["hopper", 1]]), barge(), SEED);
    expect(a.sides[0].turrets[0].window).toBe(4);
  });

  // 0.6.2 FB-B (tests/fb062.mantlet.test.ts): FULL PLATE also shields the intake tile (intakeGuard 1; was 0)
  // NUM-3 (R1's STUN fold): immune to every STUN source from ★1 (content.ts STUN_CAUSES; was shock/static/arc/drag at ★1,
  // + freeze and sabot at ★2, and LIMPET's stall in no star's list); ★2's perk is FULL GUARD (was FULL PLATE), the same tile
  // Y7b2 (the flip): MANTLET guards the last 1 / 2 / 3 intake tiles from ★1 (Y2; was none, then FULL GUARD's 1 and BULWARK
  // SKIRT's 3), and a guarded tile's rigs no longer share its immunity (Y2: the shared rig guard is gone). Was "MANTLET: every
  // STUN cause (STUN_CAUSES) at 1 star, + the intake tile (FULL GUARD), + the last 3 intake tiles (BULWARK SKIRT)"
  it("MANTLET: every STUN cause (STUN_CAUSES) at every star, + the last 1 / 2 / 3 intake tiles", () => {
    const tu = (s: number) => tu0(bench([], [["mantlet", s]]));
    expect(tu(1).immune).toEqual([...STUN_CAUSES]); // NUM-3: was ["shock", "static", "arc", "drag"]
    expect(tu(2).immune).toEqual(tu(1).immune); // NUM-3: was ★1's + "freeze" and "sabot"
    expect(tu(3).immune).toEqual(tu(2).immune);
    expect([1, 2, 3].map((s) => tu(s).intakeGuard)).toEqual([1, 2, 3]); // Y7b2 (the flip): was [0, 1, 3]
    for (const s of [1, 2, 3]) {
      const bt = new Battle(bench([["whetstone", 4, 1, 1], ["whetstone", 4, 3, 1]], [["mantlet", s]]), barge(), SEED);
      expect(hit(bt, "turret", 0, -1), `${s} shock`).toBe(false);
      expect(bt.sides[0].turrets[0].disrupted).toBe(0);
      // NUM-3: was a freeze accepted at ★1 only (toBe(s === 1)); now every STUN cause is refused at every star
      for (const cause of STUN_CAUSES) expect(hit(bt, "turret", 0, -1, cause), `${s} ${cause}`).toBe(false);
      expect(bt.sides[0].turrets[0].disrupted).toBe(0);
      const skirt = bt.sides[0].routes[0].guard.map((g) => (g & GUARD_SKIRT ? 1 : 0));
      // Y7b2 (the flip): was s === 3 ? [0, 0, 0, 1, 1, 1] : s === 2 ? [0, 0, 0, 0, 0, 1] : [0, 0, 0, 0, 0, 0]
      expect(skirt).toEqual(s === 3 ? [0, 0, 0, 1, 1, 1] : s === 2 ? [0, 0, 0, 0, 1, 1] : [0, 0, 0, 0, 0, 1]);
      expect(hit(bt, "belt", 0, 5), `${s} belt 5`).toBe(false); // the intake tile, guarded from ★1 (Y7b2, the flip: was toBe(s === 1))
      // NUM-3: the intake tile (FULL GUARD, BULWARK SKIRT) shares the turret's immunity to every STUN cause
      for (const cause of STUN_CAUSES) expect(hit(bt, "belt", 0, 5, cause), `${s} belt 5 ${cause}`).toBe(false); // Y7b2 (the flip): was toBe(s === 1)
      expect(hit(bt, "belt", 0, 0), `${s} belt 0`).toBe(true); // outside the skirt
      // 0.6.2 BELTSIDE merge: the rigs stand at (3,1) and (3,3), each with its one arrow on its old tile (P6)
      // Y7b2 (the flip): was toBe(s !== 3): BULWARK SKIRT's tiles shared its immunity with their rigs; a rig stalls now at
      // every star, guarded tile or not (tile 4 is guarded at ★2 and ★3)
      expect(hit(bt, "gate", 10, -1), `${s} gate on tile 4`).toBe(true); // uid 10: the WHETSTONE working (4,1)
      expect(hit(bt, "gate", 11, -1), `${s} gate on tile 2`).toBe(true); // uid 11: the WHETSTONE working (4,3)
      expect(hit(bt, "factory", 1, -1)).toBe(true);
    }
    const plain = new Battle(bench(), barge(), SEED);
    expect(hit(plain, "turret", 0, -1)).toBe(true); // no MANTLET: stalled as in 0.6.0
  });

  it("MANTLET's dead-offer check: against a Coil deck its turret loses fewer stalled seconds (5 seeds x 60 s)", () => {
    const stalled = (mods: [string, number][]) => [1, 2, 3, 4, 5].reduce((sum, seed) => sum + turretStall(bench([], mods, 0), coilDeck(), seed), 0);
    const without = stalled([]), withIt = stalled([["mantlet", 1]]);
    if (process.env.BB_TABLES) console.log(`MANTLET turret stalled s vs par/weaver/6 (5 seeds x 60 s): without ${without.toFixed(2)}, with ${withIt.toFixed(2)}`);
    expect(without).toBeGreaterThan(0);
    expect(withIt).toBeLessThan(without);
    expect(withIt).toBe(0); // wave 1's only stall is shock
  });

  /** NUM-1 (REQ-BFG-047): each finisher's [raw, dmg] on turret 0, in the order finishers() reads them (raw: rawDamage). */
  const finisherShots = (b: Build): [number, number][] => {
    const seen = new Set<number>(), out: [number, number][] = [];
    run(b, 30, barge(), SEED, (_ev, bt) => {
      for (const pr of bt.projectiles) {
        if (pr.from !== 0 || pr.turret !== 0 || seen.has(pr.id)) continue;
        seen.add(pr.id);
        if (pr.finisher) out.push([rawDamage(pr.payload), pr.dmg]);
      }
    });
    return out;
  };

  it("FINISHER RAM: the payload that empties each window hits +40%/+88%/+140% harder; exactly one per emptied window", () => {
    for (const [s, bonus] of [[1, 0.4], [2, 0.88], [3, 1.4]] as const) {
      const f = finishers(busy([["ram", s]]));
      expect(f.fins).toBeGreaterThan(5);
      expect(f.fins).toBe(f.windows);
      expect(f.wrong).toBe(0);
      // NUM-1: the bonus is a % on whole damage, rounded half up once (pct), so dmg / raw - 1 is no longer exactly
      // `bonus` (was: each f.bonus toBeCloseTo(bonus, 9)). Each finisher (the same ones, in order) now hits exactly
      // raw x (1 + bonus) rounded half up.
      const shots = finisherShots(busy([["ram", s]]));
      expect(shots.map(([raw, dmg]) => dmg / raw - 1)).toEqual(f.bonus);
      for (const [raw, dmg] of shots) expect(dmg, `${s}: raw ${raw}`).toBe(pct(raw, 100 * (1 + bonus)));
    }
    expect(finishers(busy([["ram", 1]])).damage).toBeGreaterThan(finishers(busy()).damage);
  });

  it("FINISHER RAM on a GATLING SPOOL: none of its shots is a finisher, so it fights exactly as without the RAM", () => {
    for (const s of [1, 2, 3]) {
      const f = finishers(busy([["gatling", 1], ["ram", s]]));
      expect(f.shots).toBeGreaterThan(10);
      expect(f.fins).toBe(0);
      expect(f.damage).toBe(finishers(busy([["gatling", 1]])).damage);
    }
  });
});

// 0.6.1c: the six wave-1 factories' special rules (brief 0.6.1c "Tests"; catalogue.json mechanic and simHook)
const SPACING_S = AMMO_SPACING / BELT_SPEED; // a batch slug leaves the mouth once the one before has ridden 7 px

describe("0.6.1c: the six factories' special rules", () => {
  it("DOUBLE STAMP: the batch's other slugs wait in the mouth and leave AMMO_SPACING apart, right behind the first; TRIPLE DIES = 3", () => {
    for (const s of [1, 2, 3]) {
      const batch = s === 3 ? 3 : 2;
      const bt = new Battle(factoryLight("doublestamp", s), barge(), SEED);
      let first = false;
      while (bt.t < 1 && !first) { bt.step(); first = bt.drainEvents().some((e) => e.type === "produce" && e.side === 0); }
      expect(bt.sides[0].factories.find((f) => f.uid === 7)!.pending, `${s}: queued in the mouth`).toBe(batch - 1);
      const o = factoryOut("doublestamp", s);
      // NUM-2 (REQ-BFG-047): the cycle is secPer(speed) = 30 / speed (14 / 19 / 19: 2.14 / 1.58 / 1.58 s; was .interval 2.2 / 1.6 / 1.6)
      const gaps = batchGaps(o, secPer(effectAt("doublestamp", s).factory!.speed));
      const cycles = o.produced - gaps.length;
      expect(gaps.length, `${s} gaps`).toBeGreaterThanOrEqual((batch - 1) * (cycles - 1));
      for (const g of gaps) expect(Math.abs(g - SPACING_S), `${s} gap ${g}`).toBeLessThan(1.5 / 60);
      expect(o.bases).toEqual([10 * (s === 1 ? 3 : 5)]); // NUM-1: x10 (was 3 / 5)
    }
  });

  it("SHOT TOWER: 3 shots per cycle at 1 / 2 / 3 damage, and a per-payload gate (TEMPER) hits each shot", () => {
    expect([1, 2, 3].map((s) => factoryOut("shottower", s).bases)).toEqual([1, 2, 3].map((v) => [10 * v])); // NUM-1: x10 (was 1 / 2 / 3)
    for (const s of [1, 2, 3]) {
      const o = factoryOut("shottower", s);
      // NUM-2 (REQ-BFG-047): the cycle is secPer(speed) = 30 / speed (20 / 22 / 23; was .interval 1.5 / 1.35 / 1.3)
      expect(o.produced - batchGaps(o, secPer(effectAt("shottower", s).factory!.speed)).length, `${s}: cycles`).toBe(Math.ceil(o.produced / 3));
    }
    let processed = 0, fired = 0;
    const burns = new Set<number>(), seen = new Set<number>();
    const bt = run(factoryBench("shottower", 1, { only: true, gates: [["temper", 5, 3, 1]] }), 20, barge(), SEED, (ev, b) => {
      for (const e of ev) if (e.type === "process" && e.side === 0 && e.def === "temper") processed++;
      for (const pr of b.projectiles) if (pr.from === 0 && !seen.has(pr.id)) { seen.add(pr.id); fired++; burns.add(pr.payload.burn); }
    });
    expect(fired).toBeGreaterThan(8); // the heavy chamber (1 a second, jamming on 2 shots a second) fires 12 in 20 s
    expect([...burns]).toEqual([effectAt("temper", 1).gate!.burn]); // every shot fired carries TEMPER's ★1 Burn
    expect(processed).toBeGreaterThanOrEqual(fired);
    expect(processed).toBeLessThanOrEqual(bt.sides[0].stats.produced);
  });

  // NUM-3 (N1 2.2): the spark's STUN is 2 / 2 / 3 s (was 1.6 / 1.8 / 2.8): DISRUPT_TIME at ★1 (no shockTime), and the
  // ★2 / ★3 shockTime read from the data (was the literals 1.8 / 2.8)
  // Y7b2 (the flip): Y2's HOT SWAP: ember BURN 2 / 5 / 9 (was 2 / 4 / 7), spark STUN 2 / 3 / 4 s, and SPARK JUMP is gone (no
  // `jump` on any spark: was [undefined, 1, 1]). Was "...; Burn 2 / 4 / 7; Shock 2 s (DISRUPT_TIME), 2 s + jump, 3 s + jump"
  it("HOT SWAP: EMBER then SPARK in turn at 1.5 / 1.3 / 1.1 s; Burn 2 / 5 / 9; Shock 2 s (DISRUPT_TIME), 3 s, 4 s", () => {
    const spark = (s: number) => effectAt("hotswap", s).factory!.cycle!.find((c) => c.tint === "spark")!;
    const burn = [2, 5, 9], stall = [1, 2, 3].map((s) => spark(s).shockTime), jump = [undefined, undefined, undefined]; // Y7b2 (the flip): burn was [2, 4, 7], jump [undefined, 1, 1]
    expect(stall[0]).toBeUndefined(); // ★1: no shockTime, so DISRUPT_TIME applies
    for (const x of stall.slice(1)) expect(x).toBeGreaterThan(0); // ★2 / ★3 name their own
    for (const s of [1, 2, 3]) {
      const seen = new Map<number, Payload>();
      run(factoryLight("hotswap", s), 12, barge(), SEED, (_ev, bt) => {
        for (const r of bt.sides[0].routes) for (const a of r.ammo) if (!seen.has(a.p.id)) seen.set(a.p.id, { ...a.p });
      });
      const ps = [...seen.values()].sort((a, b) => a.id - b.id);
      expect(ps.length).toBeGreaterThan(6);
      ps.forEach((p, i) => {
        const ember = i % 2 === 0;
        expect(p.preset, `${s} #${i}`).toBe(ember ? "ember" : "spark");
        expect([p.burn, p.shock, p.shockTime, p.jump]).toEqual(ember ? [burn[s - 1], false, undefined, undefined] : [0, true, stall[s - 1], jump[s - 1]]);
      });
      // NUM-2 (REQ-BFG-047): the cycle is secPer(speed) = 30 / speed (20 / 23 / 27: 1.5 / 1.304 / 1.111 s; was .interval
      // 1.5 / 1.3 / 1.1). The stamp timer carries its remainder, so a gap is the whole ticks either side of it (within 1 tick)
      const t = factoryOut("hotswap", s).times, iv = secPer(effectAt("hotswap", s).factory!.speed);
      for (let i = 1; i < t.length; i++) expect(Math.abs(t[i] - t[i - 1] - iv)).toBeLessThan(1.5 / 60);
    }
    expect(DISRUPT_TIME).toBe(2); // NUM-3 (N1 2.2): whole seconds (was 1.6)
  });

  // NUM-3 (N1 2.2): 2 / 2 / 3 s (was 1.6 / 1.8 / 2.8), read from the data: the spark's shockTime, else DISRUPT_TIME
  // Y7b2 (the flip): Y2's spark STUN 2 / 3 / 4 s (read from the data as before); SPARK JUMP is gone, so its check (two
  // disrupts in one tick at 2-3 stars: maxPerTick >= 2 toBe(s > 1)) is deleted. Was "HOT SWAP: its sparks stall the machine
  // they hit for 2 / 2 / 3 s, and at 2-3 stars SPARK JUMP stalls a second one"
  it("HOT SWAP: its sparks stall the machine they hit for 2 / 3 / 4 s", () => {
    const sparkStall = (s: number) => effectAt("hotswap", s).factory!.cycle!.find((c) => c.tint === "spark")!.shockTime ?? DISRUPT_TIME;
    for (const s of [1, 2, 3]) {
      const stalls = new Set<number>();
      run(factoryLight("hotswap", s), 30, barge(), SEED, (ev, bt) => {
        for (const e of ev) {
          if (e.type !== "disrupt" || e.side !== 1) continue;
          const f = bt.sides[1];
          const secs = e.kind === "gate" ? f.gates.find((g) => g.uid === e.ref)?.disrupted : e.kind === "factory" ? f.factories.find((x) => x.uid === e.ref)?.disrupted
            : e.kind === "turret" ? f.turrets[e.ref]?.disrupted : f.routes[e.ref]?.cellDisrupt[e.cell];
          stalls.add(+(secs ?? 0).toFixed(3));
        }
      });
      expect([...stalls], `${s}`).toEqual([sparkStall(s)]); // NUM-3: was [[1.6, 1.8, 2.8][s - 1]]
    }
  });

  it("SLAG POT: slag rides at a fixed 0.75x under GREASE WORKS and BRAKE SHOE (estimate and sim), and the gates still process it", () => {
    const probe = (g: [string, number, number, number][]) => {
      const b = factoryBench("slagpot", 1, { only: true, gates: g });
      let first = -1, processed = 0;
      run(b, 12, barge(), SEED, (ev, bt) => {
        for (const e of ev) {
          if (e.type === "load" && e.side === 0 && first < 0) first = bt.t;
          if (e.type === "process" && e.side === 0) processed++;
        }
      });
      return { first, est: est(b, 0).time, processed };
    };
    const none = probe([]), grease = probe([["grease", 5, 4, 1]]), brake = probe([["brake", 5, 4, 1]]);
    expect(none.first).toBeGreaterThan(0);
    expect([grease.first, brake.first]).toEqual([none.first, none.first]);
    expect([grease.est, brake.est]).toEqual([none.est, none.est]);
    expect(grease.processed).toBeGreaterThan(0);
    expect(brake.processed).toBeGreaterThan(0);
    const press = (g: [string, number, number, number][]) => est(factoryBench("press", 1, { only: true, gates: g }), 0).time;
    expect(press([["grease", 5, 4, 1]])).toBeLessThan(press([])); // a plain slug on the same belt does feel them
    expect(press([["brake", 5, 4, 1]])).toBeGreaterThan(press([]));
    // AZ-BUMP (the flip, LADDER_FIX): P13, the walk rides tick by tick, so stamp to chamber is whole ticks and slag's 0.75x
    // holds within a tick: slag 239 ticks (3.983 s), the plain slug 179 (2.983 s; / 0.75 = 238.7 ticks); was exactly the
    // plain slug's / 0.75 (the half cells' seconds), as it still is with LADDER_FIX off
    expect([none.est, press([])]).toEqual([239 * TICK, 179 * TICK]);
    expect(Math.abs(none.est - press([]) / 0.75)).toBeLessThan(TICK);
    withLadderFix(() => expect(est(factoryBench("slagpot", 1, { only: true, gates: [] }), 0).time).toBeCloseTo(press([]) / 0.75, 9), false);
    expect([1, 2, 3].map((s) => factoryOut("slagpot", s).bases)).toEqual([7, 12, 15].map((v) => [10 * v])); // NUM-1: x10 (was 7 / 12 / 15)
  });

  const GATES: [string, number, number, number][] = [["whetstone", 4, 4, 1], ["whetstone", 4, 2, 1], ["whetstone", 5, 3, 1]];
  // 0.6.2 BELTSIDE merge (0.6.1c): each row names the tile the rig works (the cell its one arrow points at, where the
  // gate stood), not the rig's own cell beside it; factoryBench's benchRigsCheck holds each rig to exactly that tile
  const gatesOf = (b: Build) => new Battle(b, barge(), SEED).sides[0].gates.map((g) => {
    const p = b.items.find((q) => q.uid === g.uid)!;
    const k = arrowCell(p.x, p.y, arrowsOf(p)[0]);
    return [kx(k), ky(k), +g.commissionAt.toFixed(9), g.hotUntil];
  });

  // Y7b2 (the flip): Y3's ASSEMBLY LINE: its own belt's gates take the same factor as every gate (was online at 0 s) and ★3
  // HOT START is gone (no hotUntil: was 4 at ★3). Was "ASSEMBLY LINE: every gate's commissionAt x0.5 / x0.25 / x0, its own
  // belt's gates online at 0 s; without one, as before"
  it("ASSEMBLY LINE: every gate's commissionAt x0.5 / x0.25 / x0, its own belt's gates too; without one, as before", () => {
    expect(gatesOf(factoryBench("press", 1, { gates: GATES }))).toEqual([[4, 4, 1.2, undefined], [4, 2, 1.8, undefined], [5, 3, 1.2, undefined]]);
    [0.5, 0.25, 0].forEach((f, i) => {
      expect(gatesOf(factoryBench("assembly", i + 1, { gates: GATES }))).toEqual([
        // Y7b2 (the flip): the own belt's gate was [5, 3, 0, i === 2 ? 4 : undefined]
        [4, 4, +(1.2 * f).toFixed(9), undefined], [4, 2, +(1.8 * f).toFixed(9), undefined], [5, 3, +(1.2 * f).toFixed(9), undefined],
      ]);
    });
    // an Assembly Line off any belt runs nothing, so it changes nothing
    const idle = factoryBench("assembly", 3, { gates: GATES });
    idle.routes.pop();
    expect(gatesOf(idle)).toEqual([[4, 4, 1.2, undefined], [4, 2, 1.8, undefined], [5, 3, Infinity, undefined]]);
  });

  it("ASSEMBLY LINE: the best factor wins with two on one deck (a ★1 and a ★2 on a Weaver: the Loom's gate at x0.25)", () => {
    // 0.6.2 BELTSIDE merge (0.6.1c): the WHETSTONE is a rig beside the Loom's belt at (0,3), facing east, its one
    // arrow on (1,3) where the gate stood (checked below)
    const b: Build = {
      hero: "weaver", mods: [], beltCap: 30, hullBonus: 0,
      items: [
        { uid: 1, def: "loom", x: 0, y: 6 }, { uid: 7, def: "assembly", x: 4, y: 6 }, { uid: 8, def: "assembly", x: 7, y: 6, stars: 2 },
        { uid: 10, def: "whetstone", x: 0, y: 3, ...rotField("whetstone", rotFacing("whetstone", 1)) },
      ],
      routes: [
        { factory: 1, cells: [K(1, 5), K(1, 4), K(1, 3), K(1, 2), K(1, 1), K(1, 0)] },
        { factory: 7, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] },
        { factory: 8, cells: [K(8, 5), K(8, 4), K(8, 3), K(8, 2), K(8, 1), K(8, 0)] },
      ],
    };
    expect(routeProblems(b)).toEqual([]);
    expect(hitsOfRig(b, 10).map((h) => h.cell)).toEqual([K(1, 3)]); // 0.6.2 BELTSIDE merge (0.6.1c)
    expect(gatesOf(b)).toEqual([[1, 3, 0.3, undefined]]);
  });

  // Y7b2 (the flip): the test "ASSEMBLY LINE ★3 HOT START: its belt's gates apply twice for the first 4 s (WHETSTONE +4, then
  // +2); never at 1-2 stars" is deleted: ★3 HOT START is gone (Y3)

  it("overclock.ts (ARSENAL.md §3.4): Burn, flat and per-prior-gate double; a SPLITTER makes one extra copy; speed gates and Shock unchanged", () => {
    expect(overclocked({ burn: 2 })).toEqual({ burn: 4 });
    expect(overclocked({ flat: 2 })).toEqual({ flat: 4 });
    expect(overclocked({ perPriorGate: 4, priorCap: 6 })).toEqual({ perPriorGate: 8, priorCap: 6 });
    expect(overclocked({ split: { copies: 2, mult: 0.6 } })).toEqual({ split: { copies: 3, mult: 0.6 } });
    expect(overclocked({ speed: 5, flat: 3 })).toEqual({ speed: 5, flat: 3 }); // OVERDRIVE ★3 is a speed gate: skipped
    expect(overclocked({ shock: true, shockTime: 1.8, jump: 1 })).toEqual({ shock: true, shockTime: 1.8, jump: 1 });
  });

  // bb-0.8.3 (REQ-BFG-042 D3): GANTRY PRESS's lead of one belt over every bought factory: 3 / 4 (FOURTH ARM) / 5, so its
  // three routes on the WEAVER are legal at every star (tests/belts.slots.test.ts refuses the belt past its slots)
  it("GANTRY PRESS: outputs 3 / 4 (FOURTH ARM) / 5; its three routes are legal at every star; every route fed in turn", () => {
    // SHAPES-1 flip: GANTRY PRESS is 2x3, one slot more (foot.ts footSlots: every 2 cells beyond 4) on its lead: 4 / 5 / 6
    // (was [3, 4, 5]); gantryWeaver lays it 2 wide and 3 deep (rot 1), so its three belts start where they did
    expect([1, 2, 3].map((s) => outputsAt("gantry", s))).toEqual([4, 5, 6]);
    for (const s of [1, 2, 3]) {
      const b = gantryWeaver(s, 3);
      expect(routeProblems(b).map((p) => p.route), `${s}`).toEqual([]);
      const st = stamps(b);
      expect(Math.min(...st.perRoute), `${s}`).toBeGreaterThan(5);
      expect(Math.max(...st.perRoute) - Math.min(...st.perRoute)).toBeLessThanOrEqual(1);
      expect(st.bases).toEqual([10 * (s === 3 ? 6 : 3)]); // NUM-1: x10 (was 6 / 3)
    }
  });

  it("merging: a placed factory with belts survives a bought copy and keeps its routes; the ★2 Gantry keeps its three routes, one slot free", () => {
    for (const def of ["doublestamp", "shottower", "hotswap", "slagpot", "assembly", "gantry"]) {
      const r = newRun("furnace", 7, "fuse-061c");
      r.build = def === "gantry" ? gantryBench(1, [], 0) : factoryBench(def, 1, { hullBonus: 0 });
      const routes = JSON.stringify(r.build.routes);
      gainModule(r, def);
      const f = r.build.items.filter((p) => p.def === def);
      expect(f.map((p) => [p.uid, starsOf(p)]), def).toEqual([[7, 2]]);
      expect(JSON.stringify(r.build.routes), def).toBe(routes);
      expect(r.inventory.some((i) => i.def === def), def).toBe(false);
      expect(routeProblems(r.build), def).toEqual([]);
    }
    const w = newRun("weaver", 7, "fuse-061c-gantry");
    w.build = gantryWeaver(1, 3);
    expect(routeProblems(w.build).map((p) => p.route)).toEqual([]); // bb-0.8.3: 1 star, three outputs (was two)
    gainModule(w, "gantry");
    expect(starsOf(w.build.items.find((p) => p.def === "gantry"))).toBe(2);
    expect(routeProblems(w.build)).toEqual([]); // FOURTH ARM: four outputs, three used
    // SHAPES-1 flip: the 2x3 GANTRY PRESS has 5 outputs at ★2 (footSlots +1), three used, two free (was 1)
    expect(outputsAt("gantry", 2) - w.build.routes.filter((r) => r.factory === 7).length).toBe(2);
  });
});
