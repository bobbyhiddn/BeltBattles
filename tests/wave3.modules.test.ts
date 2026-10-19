// 0.8.0 P1 (BRIEF-wave3-P1 M3; DESIGN-wave3.md 3.3; REQ-BFG-022, REQ-BFG-019): the 15 wave-3 modules at 1, 2 and 3 stars,
// in the tests/arsenal.modules.test.ts style. Each module has a bench (a fixed deck and seed) that reads its headline
// number at each star: 1 star < 2 < 3 strictly, and 2/1 and 3/1 inside the design's band (+-15%) where it states one
// ("each star is about 2.2x and 3.5x of the 1-star effect, or adds a named perk"). The named rules (caps, thresholds,
// floors, the perk) have their own asserts. Each number is read off a battle (events, payloads, turret state), never off
// the spec alone. BB_TABLES=1 prints the table (REPORT.md). The deck-level merge check is tests/wave3.decks.test.ts.
import { describe, expect, it } from "vitest";
import { Battle, type Payload, type Projectile, type SimEvent } from "../src/sim/battle"; // Y7b2 (the flip): LOAD_FLOOR's check is gone
import { AMMO, ITEMS } from "../src/sim/content"; // Y7b2 (the flip): WINDOW_TIME's check (TWIN TRIGGER's cut) is gone
import { DISRUPT_TIME, TICK } from "../src/sim/content"; // NUM-3 (REQ-BFG-047): the ★1 STUN (2 s, was 1.6 s) and the tick a STUN is counted in
import { rateMul, secPer } from "../src/sim/content"; // NUM-2 (REQ-BFG-047): SPEED, whole rate %s
import { ROUTINES } from "../src/sim/cores";
import { pct, roundHalfUp } from "../src/sim/pct";
import { overclocked, boostable } from "../src/sim/overclock";
import { effectAt, outputsAt, perkAt } from "../src/sim/stars";
import { walkRoute, type Build } from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { K, SEED, barge, furnaceBench, item, latchDeck, pastTile, run, twoPress, withItem, withMod } from "./wave3.helpers";
import { withLadderFix } from "../src/sim/ladderFix"; // AZ-BUMP (the flip, LADDER_FIX): STOKER ★3's off check
import { withGuard } from "../src/sim/guard"; // HULL-ON (the flip, GUARD): PLATE ROLLER's off check
import { SCALE_RIGS, flatOf, withScaleRigs } from "../src/sim/scale"; // BUMP-1E: the switch ships on; a slug's whole flat bonus; the 0.9.11 world

type Metric = number | number[];
// BUMP-1E: `off` marks a row of a piece the scaling rules changed (IRON WALL, SPALL CATCHER: SCALE_DEFS): its headline is the
// 0.9.11 piece's, so the row is read with the switch off (withScaleRigs(fn, false), synchronously); the shipped pieces are readers
interface Row { id: string; headline: string; band?: [number, number]; at: (stars: number) => Metric; off?: boolean }

/** a < b: a scalar strictly; a tuple when no part falls and at least one part rises. */
function rises(a: Metric, b: Metric): boolean {
  if (typeof a === "number" && typeof b === "number") return a < b;
  const x = a as number[], y = b as number[];
  return x.every((v, i) => v <= y[i]) && x.some((v, i) => v < y[i]);
}

function checkRow(r: Row): number[] | number[][] {
  const m = [1, 2, 3].map((s) => (r.off ? withScaleRigs(() => r.at(s), false) : r.at(s))); // BUMP-1E: was `r.at(s)` for every row
  if (process.env.BB_TABLES) console.log(`BENCH ${r.id} | ${r.headline}${r.off ? " (0.9.11, scaling switch off)" : ""} | ${m.map((v) => (typeof v === "number" ? +v.toFixed(3) : v.map((x) => +x.toFixed(3)).join("/"))).join(" | ")}`);
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
/** NUM-1 (REQ-BFG-047): the plain slug's damage, 30 (was 3). */
const PLAIN = AMMO.plain.base;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const hull = (): { kind: "hull"; ref: number; cell: number; x: number; y: number; weight: number } => ({ kind: "hull", ref: -1, cell: -1, x: 60, y: 60, weight: 1 });
const belt = (route: number, cell: number) => ({ kind: "belt" as const, ref: route, cell, x: 0, y: 0, weight: 1 });
// NUM-3 (R1's STUN fold): Battle.freeze and Battle.slowSegment are gone (FROSTBITE's and DRAG CHAIN's rounds STUN through
// disrupt), so they left this interface
const priv = (bt: Battle) => bt as unknown as {
  impact(p: Projectile): void; disrupt(s: unknown, t: unknown, secs: number, cause: string): boolean;
};
/** NUM-3 (REQ-BFG-047): a STUN of `secs` as Battle.disrupt sets it, a whole number of ticks (after BRACE FRAME's cut). */
const stun = (secs: number) => Math.round(secs / TICK) * TICK;
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

/** BUMP-1E: wave3.helpers' pastTile, with each payload's whole flat bonus, flatOf(p) = flat + each (its `flat` alone is the stat
 *  rows' DMG; with the scaling rules on a FOR EACH add, PINCER's, rides `each`, battle.ts forEach); off, `each` is never set. */
function pastTileDmg(b: Build, route: number, tile: number, secs = 10, from = 4): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  run(b, secs, barge(), SEED, (_ev, bt) => {
    if (bt.t <= from) return;
    for (const a of bt.sides[0].routes[route].ammo) {
      if (a.processed < tile || seen.has(a.p.id)) continue;
      seen.add(a.p.id);
      out.push(flatOf(a.p));
    }
  });
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
    // less the WHETSTONE's own flat (NUM-1: 20, was 2)
    // BUMP-1E: the whole flat bonus, pastTileDmg (was pastTile(...).map((x) => x.flat)): with the scaling rules on PINCER's FOR EACH
    // DMG rides the slug's `each`, not `flat` (REQ-BFG-110 step 4), so `flat` alone read 0 here ([0,0,0]); the sum is the same 20 / 44 / 70
    at: (s) => mean(pastTileDmg(withItem(withItem(furnaceBench(), item(30, "pincer", 3, 3, 1, s)), item(31, "whetstone", 5, 3, 3)), 0, 3)) - ITEMS.whetstone.gate!.flat! },
  { id: "braceframe", headline: "Share of an enemy stall it takes off its tile (bare; plated)",
    at: (s) => braceCut(s) },
  // Y7b2 (the flip): was "Damage on each payload it lets go" (its flat, 0 at every star now: no damage); the live rule's
  // number is its hold, 1 / 2 / 3 s, read off the battle's hold and release events
  { id: "twinlatch", headline: "Seconds it holds a lone payload for its other belt", band: BAND,
    at: (s) => latchHold(s) },
  // AZ-BUMP (the flip, LADDER_FIX): band [2.2, 3.5] -> [2.2, 4.25], STOKER ★3's stoke 0.7 -> 0.85 (the star-ladder pass), so
  // ★3 is 0.85 / 0.2 = 4.25x ★1 in the data (was 0.7 / 0.2 = 3.5x, the BAND); measured 4.26
  { id: "stoker", headline: "How much faster the factory it points at stamps", band: [2.2, 4.25],
    at: (s) => PRESS_EVERY / mean(stampGaps(withItem(pressBench(), item(30, "stoker", 6, 6, 0, s)))) - 1 }, // NUM-2: 30 / 21 (was 1.4)
  { id: "platebreaker", headline: "Damage a payload gains for 1 plating (20 plating on the hull)", band: BAND,
    at: (s) => flatsPast(onTile3("platebreaker", s), 3, 20)[0] },
  // BUMP-1E: IRON WALL (the id shieldwall) is a reader in the shipped world (+3 / +6 / +17 DMG for each whole 10 PLATE you have, no plating of
  // its own: SCALE_DEFS), so the plating it rolled per payload is the 0.9.11 piece's: `off`, read with the scaling switch off
  { id: "shieldwall", headline: "Plating per payload it hits", band: BAND, off: true,
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
  // BUMP-1E: SPALL CATCHER is a reader in the shipped world (+1 / +2 / +7 DMG at its gun's shot for each enemy hit on your ship, no charge:
  // SCALE_DEFS), so the charge from damage taken is the 0.9.11 piece's: `off`, read with the scaling switch off
  { id: "spallcatcher", headline: "Charge from 8 damage taken on bare hull", band: BAND, off: true,
    at: (s) => spall(s, 8, 0) },
  { id: "seamwelder", headline: "Plating for each pair this turret takes", band: BAND,
    at: (s) => Math.max(...plates(seamDeck(s), 12).map((p) => p.amount)) },
];

// ------------------------------------------------------------------------------------------------- bench helpers

/** BRACE FRAME (shape L) at (3,4): its east arrow on the Kiln belt's tile 1 (4,4); its north arrow at empty deck. The
 *  share of a ★1 shock (DISRUPT_TIME) it takes off that tile, bare and with 5 plating on the hull: [bare, plated].
 *  NUM-3 (N1 2.2): was a 1.6 s shock (DISRUPT_TIME's old value, a literal); now DISRUPT_TIME, 2 s. A STUN is a whole number
 *  of ticks after the cut (Battle.disrupt), and every cut of 2 s is whole (60 / 30, 36 / 18, 18 / 6 ticks), so the share
 *  reads exactly; 1.6 s x 30% = 0.48 s would run 29 ticks. */
function braceCut(stars: number): number[] {
  const out: number[] = [];
  for (const plated of [false, true]) {
    const bt = stepped(withItem(furnaceBench(), item(30, "braceframe", 3, 4, 0, stars)));
    const s = bt.sides[0];
    if (plated) bt.addPlate(s, 5);
    priv(bt).disrupt(s, belt(0, 1), DISRUPT_TIME, "shock");
    out.push(1 - s.routes[0].cellDisrupt[1] / DISRUPT_TIME);
  }
  return out;
}

/** Y7b2 (the flip): TWIN LATCH (uid 40, II) at (4,3) on the latch deck, press B (uid 3) held stalled from the first tick
 *  (as tests/wave3.engine.test.ts's quietB), so nothing reaches its other arrow: the seconds from each payload's hold on
 *  belt A to its release, alone (its hold; measured 1 / 2 / 3 s, 20 / 13 / 8 releases in 30 s). */
function latchHold(stars: number): number {
  const held: number[] = [], gone: number[] = [];
  run(withItem(latchDeck(), item(40, "twinlatch", 4, 3, 0, stars)), 30, barge(), SEED, (ev, bt) => {
    bt.sides[0].factories.find((f) => f.uid === 3)!.disrupted = 1;
    for (const e of ev) {
      if (e.type === "hold" && e.gate === 40) held.push(bt.t);
      else if (e.type === "release" && e.gate === 40) gone.push(bt.t);
    }
  });
  expect(gone.length).toBeGreaterThan(3);
  return mean(gone.map((t, i) => t - held[i]));
}

/** NUM-2 (REQ-BFG-047): the STAMP PRESS's ★1 stamp, 30 / its whole speed (21: 1.4286 s; was the literal 1.4 s). */
const PRESS_EVERY = secPer(effectAt("press", 1).factory!.speed);

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

/** TWIN MOULD (uid 7) on a WEAVER at (4,6), the Loom parked: a belt into each of its outputs, up to the three light guns
 *  (columns 4 and 1 at 1 star; and 8 at 2-3 stars). bb-0.8.3 (REQ-BFG-042): its slots are 2 / 3 / 4 (were 2 / 2 / 3), so
 *  ★2 feeds 3 belts with its pour of 2 (rule R: each cast takes the next 2 in turn) and ★3 3 belts with its pour of 3. */
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
  return (f.produced * (effectAt("twinmould", stars).factory!.base ?? PLAIN)) / 30;
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

/** STEAM BREECH on FURNACE's heavy gun: the fire rate against its interval (1 / the cooldown after a shot), plated or bare.
 *  NUM-2 (REQ-BFG-047): the shot timer carries its remainder now (fireCd += cadence), so the cooldown after a shot is the
 *  cadence less up to a tick; this reads the cadence the shot adds (ROUTINES.steam.cadence, on the battle's turret as it
 *  fired: its plated flag and speed), exactly (was tu.fireCd / tu.interval, which the old reset made the cadence). */
function steamRate(stars: number, plated: boolean): number {
  const cds: number[] = [];
  run(withMod(furnaceBench(), 50, "steambreech", 0, stars), 10, barge(), SEED, (ev, bt) => {
    if (bt.ticks === 1 && plated) bt.addPlate(bt.sides[0], 20);
    const tu = bt.sides[0].turrets[0];
    for (const e of ev) if (e.type === "fire" && e.side === 0) cds.push(ROUTINES.steam.cadence(tu, bt.t) / tu.interval);
  });
  return 1 / mean(cds);
}

/** TWIN TRIGGER on FURNACE's heavy gun fed by two equal press belts (CALIBRATION ★3: nothing waits): the share more
 *  damage its paired shots deal than the plain slug's PLAIN (NUM-1: 30, was 3). */
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
  return mean(dmg) / PLAIN - 1;
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
    // HULL-ON (the flip, GUARD): 5 / 11 / 17 -> 15 / 33 / 51 a payload (x3, REQ-BFG-097's plate patch, guard.ts GUARD_PLATE);
    // the cap stays 240. With GUARD off, 5 at 1 star, as before (below)
    for (const [s, want] of [[1, 15], [2, 33], [3, 51]] as const) { // NUM-1: x10 (was 0.5 / 1.1 / 1.7)
      const ps = plates(onTile3("plateroller", s), 100); // a Kiln slug every 1.25 s: 240 plating within 61 s even at 1 star
      expect(ps[0].amount).toBe(want);
      expect(ps.reduce((a, p) => a + p.amount, 0)).toBe(240); // it filled the 240 cap, and no more (NUM-1: whole, x10 of 24)
      expect(ps.at(-1)!.amount).toBeLessThanOrEqual(want); // the last roll only topped it up
    }
    expect(withGuard(() => plates(onTile3("plateroller", 1), 100)[0].amount, false)).toBe(5); // HULL-ON (GUARD): off, as before
  });

  // NUM-3 (R1's STUN fold): the title's "stalls, freezes and chain slows" is every STUN now (FROSTBITE's and DRAG CHAIN's
  // rounds STUN through Battle.disrupt, so the brace cuts them as it cuts a shock)
  // Y7b2 (the flip; DESIGN-Y row 16, battle.ts braceCut / bracesAt): the plated multiplier is gone (its mul whatever the
  // hull holds) and a frame no longer braces itself. Was "...; 75/85/95% while plated; on itself too"
  it("BRACE FRAME: 50/70/85% shorter STUNs on its tiles, from every source (frost and chain rounds too), plated or not; not on itself", () => {
    for (const [s, bare] of [[1, 0.5], [2, 0.7], [3, 0.85]] as const) {
      // Y7b2 (the flip): was [bare, plated] (plated 0.75 / 0.85 / 0.95)
      expect(braceCut(s).map((x) => +x.toFixed(9))).toEqual([bare, bare]);
      const bt = stepped(withItem(furnaceBench(), item(30, "braceframe", 3, 4, 0, s)));
      const side = bt.sides[0];
      // NUM-3 (R1's STUN fold): was priv(bt).freeze(side, belt(0, 1), 2.5) -> cellFrozen[1] = 2.5 x (1 - bare), and
      // priv(bt).slowSegment(side, belt(0, 1), 0.6, 3) -> cellSlow[1].t = 3 x (1 - bare) (FROSTBITE's and DRAG CHAIN's ★1
      // freeze and chain slow); now their ★1 rounds' STUNs (round.seconds from ITEMS: 2 s and 1 s) on the tile, through
      // disrupt with their causes ("freeze", "drag"), cut the same and then a whole number of ticks (NUM-3 step 2). One
      // timer now (cellDisrupt; was cellFrozen and cellSlow), so it is cleared before each round.
      for (const [id, cause] of [["frostbite", "freeze"], ["dragchain", "drag"]] as const) {
        const secs = (ITEMS[id].factory!.round as { seconds: number }).seconds;
        side.routes[0].cellDisrupt[1] = 0;
        expect(priv(bt).disrupt(side, belt(0, 1), secs, cause), `★${s} ${id}`).toBe(true);
        expect(side.routes[0].cellDisrupt[1], `★${s} ${id}`).toBe(stun(secs * (1 - bare)));
      }
      // NUM-3 (N1 2.2): was a 1.6 s shock and toBeCloseTo(1.6 x (1 - bare), 9) / toBe(1.6) below; now DISRUPT_TIME (2 s),
      // the cut STUN in whole ticks
      priv(bt).disrupt(side, { kind: "gate", ref: 30, cell: -1, x: 0, y: 0, weight: 2 }, DISRUPT_TIME, "shock"); // on itself
      // Y7b2 (the flip): the whole STUN (was stun(DISRUPT_TIME * (1 - bare)): a frame braced itself)
      expect(side.gates.find((g) => g.uid === 30)!.disrupted).toBe(stun(DISRUPT_TIME));
      // a tile it doesn't hit, and a stall on it while it is itself stalled, are untouched
      priv(bt).disrupt(side, belt(0, 3), DISRUPT_TIME, "shock");
      expect(side.routes[0].cellDisrupt[3]).toBe(stun(DISRUPT_TIME));
      priv(bt).disrupt(side, belt(0, 1), DISRUPT_TIME, "shock");
      expect(side.routes[0].cellDisrupt[1]).toBe(stun(DISRUPT_TIME)); // the brace is stalled now: no cut
    }
  });

  // Y7b2 (the flip; DESIGN-Y row 30): the hold grows to 1 / 2 / 3 s and the flat goes (0). Was "TWIN LATCH: its hold is
  // 1 s at every star; its damage doubles under an OVERCLOCKER (the hold doesn't)"
  it("TWIN LATCH: its hold is 1 / 2 / 3 s; under an OVERCLOCKER the hold doesn't double (its damage is 0)", () => {
    for (const s of [1, 2, 3]) expect(effectAt("twinlatch", s).gate!.latch!.hold).toBe(s); // Y7b2 (the flip): was 1
    const e = effectAt("twinlatch", 2).gate!;
    expect(boostable(e)).toBe(true);
    expect(overclocked(e).latch).toEqual({ hold: 2, flat: 0 }); // NUM-1: x10 (was 4.4). Y7b2 (the flip): was { hold: 1, flat: 44 }
  });

  it("STOKER: 20% / 44% / 70% faster; OVERCLOCKER can't boost it or BRACE FRAME (they act on no payload)", () => {
    // AZ-BUMP (the flip, LADDER_FIX): ★3 0.7 -> 0.85, STOKER ★3's stoke (the star-ladder pass); with LADDER_FIX off ★3
    // stamps 70% faster, as before (below)
    for (const [s, k] of [[1, 0.2], [2, 0.44], [3, 0.85]] as const) {
      // NUM-2 (REQ-BFG-047; was the literal 1.4 s, the press's ★1 interval): 30 / its whole speed (21: 1.4286 s)
      for (const g of stampGaps(withItem(pressBench(), item(30, "stoker", 6, 6, 0, s)))) expect(Math.abs(g - PRESS_EVERY / (1 + k))).toBeLessThan(2 / 60);
    }
    withLadderFix(() => {
      for (const g of stampGaps(withItem(pressBench(), item(30, "stoker", 6, 6, 0, 3)))) expect(Math.abs(g - PRESS_EVERY / 1.7)).toBeLessThan(2 / 60);
    }, false);
    for (const id of ["stoker", "braceframe"]) for (const s of [1, 2, 3]) expect(boostable(effectAt(id, s).gate!), id).toBe(false);
  });

  // Y7b2 (the flip; DESIGN-Y row 26): the ELSE floor goes (floor 0). Was "...; with no plating to take, 1 / 2.2 / 3.5"
  it("PLATE BREAKER: 1 plating for 4 / 8.8 / 14 at every star; with no plating to take, nothing", () => {
    // NUM-1: x10 (was 4 / 8.8 / 14 and 1 / 2.2 / 3.5)
    for (const [s, big] of [[1, 40], [2, 88], [3, 140]] as const) {
      // a bare FURNACE: the floor on every payload, no plate event
      // Y7b2 (the flip): no floor, so 0 on every payload (was the floor, 10 / 22 / 35)
      const bare = pastTile(onTile3("platebreaker", s), 0, 3).map((x) => x.flat);
      expect(new Set(bare)).toEqual(new Set([0]));
      // 100 plating: each payload takes 10 (a -10 plate event) and gains the big number until the plating is gone
      // (NUM-1: plating x10, was 10 plating and 1 a payload)
      const spent: number[] = [];
      const flats: number[] = [];
      const seen = new Set<number>();
      run(onTile3("platebreaker", s), 30, barge(), SEED, (ev, bt) => {
        if (bt.ticks === 1) bt.addPlate(bt.sides[0], 100);
        for (const e of ev) if (e.type === "plate" && e.side === 0 && e.amount < 0) spent.push(e.amount);
        for (const a of bt.sides[0].routes[0].ammo) if (a.processed >= 3 && !seen.has(a.p.id)) { seen.add(a.p.id); flats.push(a.p.flat); }
      });
      expect(spent).toEqual(Array(10).fill(-10));
      const hit = flats.filter((f) => f > 0); // payloads that passed before it came online carry nothing
      expect(hit.slice(0, 10)).toEqual(Array(10).fill(big));
      // Y7b2 (the flip): "more than 12 payloads gain something" and "after the plating, each gains the floor" are deleted:
      // with no floor the payloads after the plating gain 0 (measured 10 x big, then 13 x 0; switch-off only)
    }
  });

  // BUMP-1E: the scaling rules ship on (SCALE_RIGS, bb-0.12.0), where IRON WALL (the id shieldwall) is a reader (+3 / +6 / +17 DMG for
  // each whole 10 PLATE you have; its own plating and the 120 step are gone: scale.ts SCALE_DEFS), so this rule, the 0.9.11 piece's
  // plating and 12-plating bonus, is read with the switch off, synchronously (withScaleRigs(fn, false)); the shipped reader's numbers
  // are pinned in tests/scale2c.sim.test.ts
  it("SHIELD WALL: 1 / 2.2 / 3.5 plating a payload, and 3 / 6.6 / 10.5 damage on it while the hull holds 12 plating", () => {
    expect(SCALE_RIGS).toBe(true); // BUMP-1E: the switch ships on
    const shipped = ITEMS.shieldwall.gate!; // BUMP-1E: as shipped the def is a reader: no plating of its own, no 120 step
    expect([shipped.plate, shipped.plated, shipped.reads?.count]).toEqual([undefined, undefined, "ownPlate"]);
    withScaleRigs(() => {
      expect([ITEMS.shieldwall.gate!.plate, ITEMS.shieldwall.gate!.reads]).toEqual([10, undefined]); // the 0.9.11 piece: ★1 plates 10 a payload
      // NUM-1: x10 (was 1 / 2.2 / 3.5 and 3 / 6.6 / 10.5)
      for (const [s, plate, dmg] of [[1, 10, 30], [2, 22, 66], [3, 35, 105]] as const) {
        expect(plates(onTile3("shieldwall", s), 6)[0].amount).toBe(plate);
        const below = pastTile(onTile3("shieldwall", s), 0, 3, 4, 1).map((x) => x.flat); // 0 plating at first: no bonus
        expect(below[0]).toBe(0);
        const flats: number[] = [];
        const seen = new Set<number>();
        run(onTile3("shieldwall", s), 10, barge(), SEED, (_ev, bt) => {
          if (bt.ticks === 1) bt.addPlate(bt.sides[0], 120); // NUM-1: its threshold, 120 plating (x10 of 12)
          for (const a of bt.sides[0].routes[0].ammo) if (a.processed >= 3 && !seen.has(a.p.id)) { seen.add(a.p.id); flats.push(a.p.flat); }
        });
        expect(flats.length).toBeGreaterThan(3);
        for (const f of flats) expect(f).toBe(dmg);
      }
    }, false);
  });

  it("TWIN MOULD: one plain slug onto each belt on the same tick; 3 / 5 / 6 damage every 1.8 / 1.6 / 1.4 s; ★3 THIRD SPRUE casts 3", () => {
    // bb-0.8.3 (REQ-BFG-042 D1, D3): slots 2 / 3 / 4 (were 2 / 2 / 3); the pour 2 / 2 / 3 casts as many as 0.8.0's outputs
    expect([1, 2, 3].map((s) => outputsAt("twinmould", s))).toEqual([2, 3, 4]);
    expect([1, 2, 3].map((s) => effectAt("twinmould", s).factory!.pour)).toEqual([2, 2, 3]);
    expect(perkAt("twinmould", 3)).toBe("THIRD SPRUE");
    for (const [s, base, was, n] of [[1, 30, 1.8, 2], [2, 50, 1.6, 2], [3, 60, 1.4, 3]] as const) { // NUM-1: base x10 (was 3 / 5 / 6)
      // NUM-2 (REQ-BFG-047): the speed is the title's interval converted as scripts/num2-speed.mjs does, roundHalfUp(30 /
      // interval): 17 / 19 / 21 (was `interval` 1.8 / 1.6 / 1.4); a cast every 30 / speed s (1.76 / 1.58 / 1.43)
      expect(effectAt("twinmould", s).factory!.speed).toBe(roundHalfUp(30 / was));
      const every = secPer(effectAt("twinmould", s).factory!.speed);
      // NUM-1: the dps is x10 (same slug count), so the same +-0.5 a second of the old units is +-5 now (digits -1)
      expect(mouldDps(s)).toBeCloseTo((n * base) / every, -1); // NUM-2: every = 30 / speed (was the interval)
      // every cast lands on every belt on one tick, plain slugs of its base
      const perTick = new Map<number, number>(), seen = new Set<number>(), bases = new Set<number>();
      run(mouldDeck(s), 8, barge(), SEED, (_ev, bt) => {
        for (const r of bt.sides[0].routes) for (const a of r.ammo) {
          if (seen.has(a.p.id)) continue;
          seen.add(a.p.id);
          perTick.set(bt.ticks, (perTick.get(bt.ticks) ?? 0) + 1);
          bases.add(a.p.base ?? PLAIN);
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
    for (const [s, amount, was] of [[1, 30, 1.6], [2, 66, 1.4], [3, 105, 1.2]] as const) { // NUM-1: x10 (was 3 / 6.6 / 10.5)
      const ps = plates(pressFurnace("armorpress", s), 7); // two pressings under the 240 cap at every star
      expect(ps.map((p) => p.amount)).toEqual([amount, amount]);
      expect(ps.map((p) => +p.t.toFixed(4))).toEqual([3, 6]);
      // NUM-2 (REQ-BFG-047): the speed is the title's interval converted as scripts/num2-speed.mjs does, roundHalfUp(30 /
      // interval): 19 / 21 / 25 (was `interval` 1.6 / 1.4 / 1.2); its slugs every 30 / speed s (1.58 / 1.43 / 1.2)
      expect(effectAt("armorpress", s).factory!.speed).toBe(roundHalfUp(30 / was));
      const every = secPer(effectAt("armorpress", s).factory!.speed);
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
    // NUM-1: the flat x10 (was 2.5 / 5.5 / 8.75; ★3's 87.5 rounds half up to 88); the per-plating ratio is unchanged
    // (damage and plating both x10); the gain is whole, so exact
    for (const [s, flat, per] of [[1, 25, 1], [2, 55, 2.2], [3, 88, 3.5]] as const) {
      expect(anvilGain(s, 0)).toBe(flat);
      expect(anvilGain(s, 240)).toBe(flat + 240 * per); // NUM-1: 240 plating, the cap (x10 of 24)
    }
  });

  // 0.8.0 B1 M2 (brief 3.2, VERIFIED-P1 H1: its weak bare rate): 20 / 44 / 70% plated, 5 / 10 / 15% bare -> 35 / 70 / 110%
  // plated, 10 / 20 / 30% bare
  // Y7b2 (the flip; DESIGN-Y row 39): steamBare goes (no plating, no speed-up) and steamPlated is 40 / 80 / 120. Was
  // "STEAM BREECH: 35 / 70 / 110% faster while plated, 10 / 20 / 30% faster without"
  it("STEAM BREECH: 40 / 80 / 120% faster while plated", () => {
    // NUM-2 (REQ-BFG-047): the stored whole rate %s are the title's; the battle rounds the gun's speed x (100 + X) / 100
    // half up once, so the rate is that whole speed over the gun's (SCRAP CANNON 30): ★1 plated 40.5 -> 41, 41 / 30 =
    // 1.3667 (was 1.35, the interval x 1 / 1.35); the rest land whole (33, 51, 36, 63, 39 / 30)
    // Y7b2 (the flip): 40 / 80 / 120% land whole (42, 54, 66 / 30); the bare rate checks (10 / 20 / 30%) and the stored
    // steamBare are deleted (switch-off only)
    const gun = effectAt("scrapcannon", 1).turret!.speed;
    for (const [s, plated] of [[1, 40], [2, 80], [3, 120]] as const) {
      const core = effectAt("steambreech", s).core!;
      expect(core.steamPlated).toBe(plated); // NUM-2: the stored rate % (was 1 / 1.35 ... the interval x). Y7b2: was [35 / 70 / 110, steamBare]
      expect(steamRate(s, true)).toBeCloseTo(roundHalfUp(gun * rateMul(plated)) / gun, 6); // NUM-2 (was 1.35 / 1.7 / 2.1)
    }
    // NUM-2: the cadence is 30 / the whole speed (speedRaw x (100 + steamPlated) / 100); was interval 1 x steamPlated 0.5
    // Y7b2 (the flip): the core spec holds no steamBare (was steamBare: 11 here)
    const tu = { speedRaw: 30, speed: 30, interval: 1, plated: true, core: { spec: { steamPlated: 100 } } } as unknown as Parameters<typeof ROUTINES.steam.cadence>[0];
    expect(ROUTINES.steam.cadence(tu, 0)).toBe(0.5);
  });

  // Y7b2 (the flip; DESIGN-Y row 34): the shorter load time goes (no windowTime, so no LOAD_FLOOR) and pairBonus is 30 / 60
  // / 95%. Was "TWIN TRIGGER: paired loads deal 25 / 55 / 88% more; its load time is 0.25 / 0.4 / 0.55 s shorter, never
  // below 0.3 s"
  it("TWIN TRIGGER: paired loads deal 30 / 60 / 95% more", () => {
    for (const [s, bonus] of [[1, 0.3], [2, 0.6], [3, 0.95]] as const) {
      // NUM-1: the % rounds half up once on the 30 slug (pct): a paired load deals 38 / 47 / 56, not 37.5 / 46.5 / 56.4
      // Y7b2 (the flip): 39 / 48 / 59 (was bonus 0.25 / 0.55 / 0.88)
      expect(pairedShare(s)).toBeCloseTo(pct(PLAIN, 100 * (1 + bonus)) / PLAIN - 1, 6);
      // Y7b2 (the flip): the load-time cut checks (WINDOW_TIME - cut; on a ROTARY BREECH, never below LOAD_FLOOR) are
      // deleted: no cut (switch-off only; measured 1.5 s, and 0.75 s on a ROTARY)
    }
    // an unpaired load gets nothing: one belt only
    const one = twoPress();
    one.routes.pop();
    const dmg: number[] = [];
    run(withMod(one, 50, "twintrigger", 0, 3), 10, barge(), SEED, (ev) => { for (const e of ev) if (e.type === "fire" && e.side === 0) dmg.push(e.dmg); });
    expect(new Set(dmg)).toEqual(new Set([PLAIN])); // NUM-1: the plain slug's 30 (was 3)
  });

  // Y7b2 (the flip; DESIGN-Y row 47, battle.ts spallCharge): the cap goes and a PLATE soak counts once. Was "SPALL
  // CATCHER: 1 / 2.2 / 3.5 damage for every 4 taken, up to 8 / 17.6 / 28; plating soaked counts twice; ..."
  // BUMP-1E: the scaling rules ship on (SCALE_RIGS, bb-0.12.0), where SPALL CATCHER is a reader (+1 / +2 / +7 DMG at its gun's shot for each
  // enemy hit on your ship; no charge: scale.ts SCALE_DEFS), so this rule, the 0.9.11 piece's charge, is read with the switch off,
  // synchronously (withScaleRigs(fn, false)); the shipped reader's numbers are pinned in tests/scale2c.sim.test.ts
  it("SPALL CATCHER: 1 / 2.2 / 3.5 damage for every 4 taken, no cap; plating soaked counts once; the next shot spends it", () => {
    expect(SCALE_RIGS).toBe(true); // BUMP-1E: the switch ships on
    const shipped = ITEMS.spallcatcher.mod!; // BUMP-1E: as shipped the def is a reader: it stores no charge
    expect([shipped.spall, shipped.reads?.count]).toEqual([undefined, "hitsTaken"]);
    withScaleRigs(() => {
      expect([ITEMS.spallcatcher.mod!.spall !== undefined, ITEMS.spallcatcher.mod!.reads]).toEqual([true, undefined]); // the 0.9.11 piece: a charge
      // NUM-1: x10 (was 1 / 2.2 / 3.5 for every 4, up to 8 / 17.6 / 28); the damage taken x10 too (80, was 8; 4000, was
      // 400), so each charge is whole and exact
      for (const [s, add] of [[1, 10], [2, 22], [3, 35]] as const) {
        expect(spall(s, 80, 0)).toBe(add * 2);
        expect(spall(s, 80, 80)).toBe(add * 2); // all 80 soaked: once (Y7b2, the flip: was add * 4, twice)
        expect(spall(s, 4000, 0)).toBe(add * 100); // Y7b2 (the flip): 4000 / 40 x add, no cap (was max: 80 / 176 / 280)
        // the next shot carries it, and the charge is gone
        const bt = new Battle(withMod(furnaceBench(), 50, "spallcatcher", 0, s), barge(), SEED);
        priv(bt).impact(shot(1, 80));
        const fired: number[] = [];
        while (!fired.length && bt.t < 10) { bt.step(); for (const e of bt.drainEvents()) if (e.type === "fire" && e.side === 0) fired.push(e.dmg); }
        const plainShot = new Battle(furnaceBench(), barge(), SEED);
        const base: number[] = [];
        while (!base.length && plainShot.t < 10) { plainShot.step(); for (const e of plainShot.drainEvents()) if (e.type === "fire" && e.side === 0) base.push(e.dmg); }
        expect(fired[0] - base[0]).toBe(add * 2);
        expect(bt.sides[0].turrets[0].spallCharge).toBe(0);
      }
      // the dark wind doesn't count
      const bt = new Battle(withMod(furnaceBench(), 50, "spallcatcher", 0, 1), barge(), SEED);
      bt.t = 30;
      for (let i = 0; i < 60; i++) bt.step();
      expect(bt.sides[0].stats.windTaken).toBeGreaterThan(1);
      expect(bt.sides[0].turrets[0].spallCharge).toBe(0);
    }, false);
  });

  // Y7b2 (the flip; DESIGN-Y row 35): a lone load's plating goes (lone 0: no plate event). Was "SEAM WELDER: each pair
  // rolls 1 / 2.2 / 3.5 plating and every other load 0.2 / 0.4 / 0.7; ..."
  it("SEAM WELDER: each pair rolls 1 / 2.2 / 3.5 plating and every other load none; a FOUNDRY fusion is a pair", () => {
    for (const [s, pair] of [[1, 10], [2, 22], [3, 35]] as const) { // NUM-1: x10 (was 1 / 2.2 / 3.5 and 0.2 / 0.4 / 0.7)
      const ps = plates(seamDeck(s), 10).map((p) => p.amount);
      expect(new Set(ps)).toEqual(new Set([pair])); // Y7b2 (the flip): was new Set([lone, pair]) (lone 2 / 4 / 7)
      const f = plates(withMod(heroStartBuild("foundry", 1), 50, "seamwelder", 0, s), 10).map((p) => p.amount);
      expect(f).toContain(pair);
    }
  });
});

// keep imports used in helpers only
export type { SimEvent };
