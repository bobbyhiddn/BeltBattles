// 0.6.2 final balance pass, FB-B (ref/BRIEF-fb-B-mods.md item 4; design: oracle 16085a6430e4cc6a): SURGE VALVE.
// Each pulse a payload rides past the valve adds +1/+2/+3 flat (was 0/1/2). At ★1 the pulse cut the ride time of
// ride-scaled ammo and, when the turret was the bottleneck, added no shots, so ★1 could lower damage (Furnace's audit
// cell: 78.3 -> 71.5). +1 clears that cell, so the "no ride cut while the intake is saturated" fallback isn't needed.
// Metronome's lockedFlat 3/6/10 was reviewed against the star bench and stays (MODS-REPORT.md).
import { describe, expect, it } from "vitest";
import { Battle, type BeltAmmo, type Payload } from "../src/sim/battle";
import { spotForTile } from "../src/sim/beltside";
import { CELL, ITEMS, type HeroId } from "../src/sim/content";
import { cloneBuild, key, rigHits, walkRoute, type Build } from "../src/sim/deck";
import { HARNESS_HEROES } from "../src/sim/harness/heroes";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { effectAt } from "../src/sim/stars";
import { levelLine, starEffectLine } from "../src/screens/build/inspector";
import { barge, bench } from "./arsenal.bench";

const STARS = [1, 2, 3];
const FLAT = [1, 2, 3];

const payload = (): Payload => ({ id: 900, ammo: "plain", ride: 0, mult: 1, flat: 0, burn: 0, shock: false, prior: 0, factory: 1, copy: false });
function until(bt: Battle, seconds: number): void {
  while (bt.t < seconds - 1e-9 && !bt.over) bt.step();
}

/** A payload just before the valve's tile (the bench's tile 2) with the valve online; the Kiln stamps nothing. */
function valve(stars: number): { bt: Battle; a: BeltAmmo } {
  const bt = new Battle(bench([["surge", 4, 3, stars]]), barge(), 17);
  bt.sides[0].factories[0].timer = 1000;
  bt.sides[0].gates[0].online = true;
  const a: BeltAmmo = { p: payload(), s: 2 * CELL + 5, processed: 1, blocked: false };
  bt.sides[0].routes[0].ammo.push(a);
  return { bt, a };
}

describe("FB-B SURGE VALVE: every star pays for a pulse ridden", () => {
  it("the rule: per-pulse flat 1/2/3 (was 0/1/2); speed, timing and the locked-belt flat unchanged", () => {
    expect(STARS.map((s) => effectAt("surge", s).gate?.pulse)).toEqual([
      { speed: 3, on: 1, period: 3, flat: 1 }, { speed: 4, on: 1, period: 2.5, flat: 2 }, { speed: 5, on: 1, period: 2, flat: 3 },
    ]);
    expect(STARS.map((s) => effectAt("surge", s).gate?.lockedFlat)).toEqual([3, 6, 10]);
  });

  it("a payload riding one pulse past the valve gains exactly +1/+2/+3, and rides it at 3x/4x/5x", () => {
    for (const s of STARS) {
      const { bt, a } = valve(s);
      until(bt, 0.12);
      expect(bt.sides[0].routes[0].speedAt[3], `★${s} pulse`).toBe([3, 4, 5][s - 1]);
      until(bt, 1.3); // the first pulse is over at every star (on for 1 s of each 3 / 2.5 / 2 s)
      expect(bt.sides[0].routes[0].speedAt[3], `★${s} between pulses`).toBe(1);
      expect(a.p.flat, `★${s}`).toBe(FLAT[s - 1]);
    }
  });

  it("each pulse pays once: a payload riding a long belt past the valve through two pulses gains the flat twice", () => {
    // a 12-tile snake (the LONG HAUL test's route) with the valve on its first tile: 11 tiles still to ride after it
    const cells = [key(4, 5), key(3, 5), key(2, 5), key(1, 5), key(1, 4), key(2, 4), key(3, 4), key(4, 4), key(4, 3), key(4, 2), key(4, 1), key(4, 0)];
    for (const s of STARS) {
      const b: Build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }], routes: [{ factory: 1, cells }], mods: [], beltCap: 30, hullBonus: 5000 };
      const spot = spotForTile(b, "surge", 0, 0)!;
      b.items.push({ uid: 10, def: "surge", x: spot.x, y: spot.y, rot: spot.rot, ...(s > 1 ? { stars: s } : {}) });
      expect(rigHits(b)[0].map((hs) => hs.length), `★${s}: one hit, on tile 0`).toEqual([1, ...cells.slice(1).map(() => 0)]);
      const bt = new Battle(b, barge(), 17);
      bt.sides[0].factories[0].timer = 1000;
      bt.sides[0].gates[0].online = true;
      until(bt, 0.9); // late in the first pulse (every star's pulse is on for the first second of its period)
      const a: BeltAmmo = { p: payload(), s: CELL, processed: 0, blocked: false }; // just past the valve's tile
      bt.sides[0].routes[0].ammo.push(a);
      until(bt, 0.99);
      expect(a.p.flat, `★${s}: the first pulse`).toBe(FLAT[s - 1]);
      const period = effectAt("surge", s).gate!.pulse!.period;
      until(bt, period - 0.05); // between pulses: still riding, no pay
      expect(a.p.flat, `★${s}: between pulses`).toBe(FLAT[s - 1]);
      expect(bt.sides[0].routes[0].ammo, `★${s}: still on the belt`).toContain(a);
      until(bt, period + 0.3);
      expect(a.p.flat, `★${s}: the second pulse`).toBe(2 * FLAT[s - 1]);
      until(bt, period + 0.95); // the same (second) pulse: paid once
      expect(a.p.flat, `★${s}: once per pulse`).toBe(2 * FLAT[s - 1]);
    }
  });

  it("the walk (inspector estimate) counts one pulse's flat off a locked belt, and the timeline shows it", () => {
    for (const s of STARS) {
      const hit = walkRoute(bench([["surge", 4, 3, s]]), 0).timeline[0].hits[0];
      expect([hit.def, hit.flat], `★${s}`).toEqual(["surge", FLAT[s - 1]]);
    }
  });

  it("player text: the description and the star lines name the per-pulse damage", () => {
    const d = ITEMS.surge;
    expect(d.desc.join(" ")).toBe("PULSES 3X SPEED FOR 1S EVERY 3S, +1 DMG PER PULSE RIDDEN. LOCKED BELTS +3 DMG.");
    expect(d.desc.every((l) => l.length <= 20)).toBe(true);
    expect(STARS.map((s) => starEffectLine("surge", s))).toEqual(["3X FOR 1S / 3S · +1/PULSE", "4X FOR 1S / 2.5S · +2/PULSE", "5X FOR 1S / 2S · +3/PULSE"]);
    expect(levelLine("surge", 2)).toBe("★2 OVERPRESSURE: 4X FOR 1S / 2.5S · +2/PULSE");
  });
});

// The shared-pool audit's SURGE cells (tests/sharedPool.effects.test.ts decks(), rebuilt here): each hero's starting
// deck against the same deck plus a SURGE placed by the audit's rig() order; an unarmed foe, 18 s, seed 20210924.
const AUDIT_SEED = 20210924;
function rig(b: Build, id: string, uid: number): void {
  const r = b.routes[0];
  for (const ti of [2, 3, 1, 4, 0, ...r.cells.map((_, i) => i)]) {
    const spot = spotForTile(b, id, 0, ti);
    if (!spot) continue;
    b.items.push({ uid, def: id, x: spot.x, y: spot.y, rot: spot.rot });
    if ((rigHits(b)[0] ?? []).some((tile) => tile.some((h) => h.uid === uid))) return;
    b.items.pop();
  }
  throw new Error(`${b.hero}: no spot for ${id}`);
}
function quietFoe(): Build {
  const b = heroStartBuild("bastion", 500);
  b.routes = [];
  return b;
}
function damage(b: Build): number {
  const bt = new Battle(b, quietFoe(), AUDIT_SEED);
  while (!bt.over && bt.t < 18) {
    bt.step();
    bt.events.length = 0;
  }
  return bt.sides[0].stats.damage;
}
function cell(hero: HeroId): number[] {
  const before = heroStartBuild(hero, 1), after = cloneBuild(before);
  rig(after, "surge", 901);
  return [damage(before), ...STARS.map((s) => {
    const b = cloneBuild(after);
    if (s > 1) b.items.find((p) => p.uid === 901)!.stars = s;
    return damage(b);
  })];
}

describe("FB-B SURGE VALVE: the shared-pool audit cells", () => {
  it("Furnace (ride-scaled cinder, turret-bound): ★1 no longer lowers total damage (was 78.3 -> 71.5)", () => {
    const [none, one] = cell("furnace");
    expect(none).toBeCloseTo(78.32, 2);
    expect(one).toBeGreaterThan(none);
  });
  for (const hero of HARNESS_HEROES) {
    it(`${hero}: each merge step raises total damage (★1 < ★2 < ★3)`, () => {
      const [, one, two, three] = cell(hero);
      expect(two, `${hero} ★1 -> ★2`).toBeGreaterThan(one);
      expect(three, `${hero} ★2 -> ★3`).toBeGreaterThan(two);
    });
  }
});
