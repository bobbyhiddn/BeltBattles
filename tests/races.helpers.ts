// races: shared helpers for the races tests (not a test file itself).
import { expect } from "vitest";
import { Battle, simulate } from "../src/sim/battle";
import {
  BATTLE_CAP, GRID, HEROES, ITEMS, START_GOLD, incomeFor, type AmmoKind, type HeroId,
} from "../src/sim/content";
import { canPlaceItem, footprint, key as K, routeInfo, type Build } from "../src/sim/deck";
import { heroRefBuild, heroStartBuild } from "../src/sim/heroBuilds";

/** Most gold a player can have received before the dusk fight of `day` (mirrors ref/async/validate.ts). */
export function maxGoldByDay(day: number): number {
  let gold = START_GOLD;
  for (let d = 1; d < day; d++) gold += incomeFor(d, true);
  return gold;
}

/** Purchase cost of a deck (mirrors validate.ts buildCost): items + turret modules
 *  + belt crates above the hero's base belt + armor plating implied by hullBonus. */
export function buildCost(b: Build): number {
  const h = HEROES[b.hero];
  const crate = ITEMS.beltcrate, plate = ITEMS.plating;
  const items = b.items.reduce((s, p) => s + (ITEMS[p.def]?.price ?? 0), 0);
  const mods = b.mods.reduce((s, m) => s + (ITEMS[m.def]?.price ?? 0), 0);
  const crates = Math.max(0, Math.ceil((b.beltCap - h.belt) / crate.supply!.belt!));
  const plates = Math.max(0, Math.ceil(b.hullBonus / plate.supply!.hull!));
  return items + mods + crates * crate.price + plates * plate.price;
}

const SIGNATURES = new Set(Object.values(HEROES).map((h) => h.factory));

/** A deck a player could own on `day` (the validate.ts rules): known unique items, exactly one
 *  signature factory (its own), everything else sold; on the deck, no overlaps; every route well
 *  formed, connected and uncrossed; outputs and belt within limits; one module per real turret;
 *  whole crates and whole, non-negative plating; cost within maxGoldByDay(day). */
export function expectLegal(b: Build, day: number): void {
  const h = HEROES[b.hero];
  const tag = `${b.hero} day ${day}`;
  const uids = new Set<number>();
  for (const p of [...b.items, ...b.mods]) {
    expect(ITEMS[p.def], `${tag}: ${p.def}`).toBeTruthy();
    expect(uids.has(p.uid), `${tag}: uid ${p.uid} reused`).toBe(false);
    uids.add(p.uid);
  }
  let own = 0;
  for (const p of b.items) {
    const d = ITEMS[p.def];
    if (SIGNATURES.has(d.id)) {
      expect(d.id, `${tag}: foreign signature`).toBe(h.factory);
      own++;
    } else expect(d.merchant, `${tag}: ${d.id} must be sold`).toBeTruthy();
  }
  expect(own, `${tag}: signature factories`).toBe(1);
  const cells = new Set<number>();
  for (const p of b.items) {
    const d = ITEMS[p.def];
    expect(p.x >= 0 && p.y >= 0 && p.x + d.size <= GRID && p.y + d.size <= GRID, `${tag}: ${p.def} on deck`).toBe(true);
    const chk = canPlaceItem(b, p.def, p.x, p.y, p.uid);
    expect(chk.ok || chk.reason === "OCCUPIED", `${tag}: ${p.def} ${chk.reason}`).toBe(true);
    for (const k of footprint(d, p.x, p.y)) {
      expect(cells.has(k), `${tag}: overlap at ${k}`).toBe(false);
      cells.add(k);
    }
  }
  const belts = new Set<number>();
  const perFactory = new Map<number, number>();
  let belt = 0;
  b.routes.forEach((r, i) => {
    expect(routeInfo(b, i).connected, `${tag}: route ${i} connected`).toBe(true);
    perFactory.set(r.factory, (perFactory.get(r.factory) ?? 0) + 1);
    belt += r.cells.length;
    for (const k of r.cells) {
      expect(belts.has(k), `${tag}: routes cross at ${k}`).toBe(false);
      belts.add(k);
    }
  });
  for (const [uid, n] of perFactory) {
    const f = b.items.find((p) => p.uid === uid)!;
    expect(n, `${tag}: outputs of ${f.def}`).toBeLessThanOrEqual(ITEMS[f.def].factory!.outputs);
  }
  expect(belt, `${tag}: belt`).toBeLessThanOrEqual(b.beltCap);
  const mounted = new Set<number>();
  for (const m of b.mods) {
    expect(ITEMS[m.def].kind, `${tag}: ${m.def} is a module`).toBe("mod");
    expect(ITEMS[m.def].merchant, `${tag}: ${m.def} must be sold`).toBeTruthy();
    expect(m.turret >= 0 && m.turret < h.turrets.length, `${tag}: turret ${m.turret}`).toBe(true);
    expect(mounted.has(m.turret), `${tag}: one module per turret`).toBe(false);
    mounted.add(m.turret);
  }
  expect(b.beltCap >= h.belt && (b.beltCap - h.belt) % ITEMS.beltcrate.supply!.belt! === 0, `${tag}: whole crates`).toBe(true);
  expect(b.hullBonus >= 0 && b.hullBonus % ITEMS.plating.supply!.hull! === 0, `${tag}: whole plating`).toBe(true);
  expect(buildCost(b), `${tag}: cost`).toBeLessThanOrEqual(maxGoldByDay(day));
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

/** A finished battle: over before BATTLE_CAP, every number finite. */
export function expectSane(bt: Battle): void {
  expect(bt.over).toBe(true);
  expect(bt.t).toBeLessThan(BATTLE_CAP);
  for (const s of bt.sides) {
    expect(Number.isFinite(s.hull.hp)).toBe(true);
    expect(Number.isFinite(s.stats.damage)).toBe(true);
    expect(Number.isFinite(s.stats.payloadSum)).toBe(true);
  }
}

/** 10 seeds, both sides: start vs start, and reference builds on days 1, 5 and 10, against each foe. */
export function expectSaneBattles(hero: HeroId, foes: readonly HeroId[]): void {
  const pairs: [Build, Build][] = [];
  for (const f of foes) {
    pairs.push([heroStartBuild(hero, 1), heroStartBuild(f, 500)]);
    for (const d of [1, 5, 10]) pairs.push([heroRefBuild(hero, d), heroRefBuild(f, d)]);
  }
  for (const [p, e] of pairs) {
    for (let seed = 1; seed <= 10; seed++) {
      expectSane(simulate(p, e, seed * 7919));
      expectSane(simulate(e, p, seed * 7919));
    }
  }
}
