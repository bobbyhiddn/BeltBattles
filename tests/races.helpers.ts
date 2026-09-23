// races: shared helpers for the races tests (not a test file itself).
import { expect } from "vitest";
import { Battle, simulate } from "../src/sim/battle";
import { startingBuild, warlordBuild } from "../src/sim/ai";
import { BATTLE_CAP, GRID, HEROES, ITEMS, START_GOLD, incomeFor, type AmmoKind } from "../src/sim/content";
import { beltUsed, footprint, key as K, routeInfo, type Build } from "../src/sim/deck";

/** Gold a build represents: items + turret gear + belt crates above the hero's base belt. */
export function buildCost(b: Build): number {
  let g = 0;
  for (const p of b.items) g += ITEMS[p.def].price;
  for (const m of b.mods) g += ITEMS[m.def].price;
  g += 2 * Math.ceil(Math.max(0, b.beltCap - HEROES[b.hero].belt) / 4);
  return g;
}

/** Legal deck: on-grid, no overlaps, every route connected, belt within cap, one gear per turret, affordable. */
export function expectLegal(b: Build, round: number): void {
  const seen = new Set<number>();
  for (const p of b.items) {
    const d = ITEMS[p.def];
    expect(d, p.def).toBeTruthy();
    expect(p.x >= 0 && p.y >= 0 && p.x + d.size <= GRID && p.y + d.size <= GRID).toBe(true);
    for (const k of footprint(d, p.x, p.y)) {
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  }
  b.routes.forEach((_, i) => expect(routeInfo(b, i).connected).toBe(true));
  expect(beltUsed(b)).toBeLessThanOrEqual(b.beltCap);
  const turrets = HEROES[b.hero].turrets.length;
  for (const m of b.mods) expect(m.turret >= 0 && m.turret < turrets).toBe(true);
  expect(new Set(b.mods.map((m) => m.turret)).size).toBe(b.mods.length);
  let budget = START_GOLD;
  for (let r = 1; r < round; r++) budget += incomeFor(r, false);
  expect(buildCost(b)).toBeLessThanOrEqual(budget);
}

/** A foe that never fires: a Kiln whose route stops short of the turret. */
export function dummyFoe(): Build {
  return {
    hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }],
    routes: [{ factory: 1, cells: [K(4, 5), K(4, 4)] }], mods: [], beltCap: 14, hullBonus: 0,
  };
}

/** Step a battle for `secs` and collect side-0 shots (ammo kind and damage) in firing order. */
export function shots(b: Battle, secs: number): { ammo: AmmoKind; dmg: number }[] {
  const seen = new Set<number>();
  const out: { ammo: AmmoKind; dmg: number }[] = [];
  while (!b.over && b.t < secs) {
    b.step();
    b.events.length = 0;
    for (const pr of b.projectiles) {
      if (pr.from !== 0 || seen.has(pr.id)) continue;
      seen.add(pr.id);
      out.push({ ammo: pr.payload.ammo, dmg: pr.dmg });
    }
  }
  return out;
}

/** >=10 seeds against both existing heroes' starting builds and warlords: ends before the cap, no NaN. */
export function expectSaneBattles(start: Build, warlord: (r: number) => Build): void {
  const foes: [Build, Build][] = [];
  for (const h of ["furnace", "weaver"] as const) {
    foes.push([start, startingBuild(h, 500)]);
    for (const r of [1, 5, 10]) foes.push([warlord(r), warlordBuild(h, r)]);
  }
  for (const [p, e] of foes) {
    for (let seed = 1; seed <= 10; seed++) {
      for (const bt of [simulate(p, e, seed * 7919), simulate(e, p, seed * 7919)]) {
        expect(bt.over).toBe(true);
        expect(bt.t).toBeLessThan(BATTLE_CAP);
        for (const s of bt.sides) {
          expect(Number.isFinite(s.hull.hp)).toBe(true);
          expect(Number.isFinite(s.stats.damage)).toBe(true);
          expect(Number.isFinite(s.stats.payloadSum)).toBe(true);
        }
      }
    }
  }
}
