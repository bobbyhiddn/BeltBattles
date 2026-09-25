import { describe, expect, it } from "vitest";
import { Battle } from "../src/sim/battle";
import { spotForTile } from "../src/sim/beltside";
import { HEROES, ITEMS, buyableModules, type HeroId, type ItemDef } from "../src/sim/content";
import { estimateRoute, rigHits, routeInfo, type Build } from "../src/sim/deck";
import { HARNESS_HEROES } from "../src/sim/harness/heroes";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { validateBuild } from "../src/net/validate";
import { shots } from "./races.helpers";

const foe = (): Build => ({ ...heroStartBuild("furnace", 500), routes: [], hullBonus: 5000 });
const fire = (b: Build) => shots(new Battle(b, foe(), 20210924), 15);

/** Install a rig on the first live belt using the game's placement search, and verify its arrow lands. */
function rig(b: Build, id: string, uid: number): void {
  const r = b.routes[0];
  const order = [2, 3, 1, 4, 0, ...r.cells.map((_, i) => i)];
  for (const ti of order) {
    const spot = spotForTile(b, id, 0, ti);
    if (!spot) continue;
    b.items.push({ uid, def: id, x: spot.x, y: spot.y, rot: spot.rot });
    if ((rigHits(b)[0] ?? []).some((tile) => tile.some((hit) => hit.uid === uid))) return;
    b.items.pop();
  }
  throw new Error(`${b.hero}: no active spot for ${id}`);
}

function gateProof(hero: HeroId, d: ItemDef): string {
  const b = heroStartBuild(hero, 1);
  if (d.id === "longhaul") rig(b, "whetstone", 900);
  const before = estimateRoute(b, 0);
  rig(b, d.id, 901);
  const after = estimateRoute(b, 0);
  expect(validateBuild(b, 10).errors, `${hero} ${d.id}: purchasable deck`).toEqual([]);
  const hits = rigHits(b)[0].flat().filter((h) => h.uid === 901);
  expect(hits.length, `${hero} ${d.id}: active arrows`).toBeGreaterThan(0);
  if (d.gate?.burn) {
    expect(after.burn).toBeGreaterThan(before.burn);
    return `burn +${after.burn - before.burn}`;
  }
  if (d.gate?.shock) {
    expect(before.shock).toBe(false);
    expect(after.shock).toBe(true);
    return "shock on";
  }
  if (d.gate?.split) {
    expect(after.copies).toBeGreaterThan(before.copies);
    return `copies ${before.copies}>${after.copies}`;
  }
  if (d.gate?.speed) {
    if (hero === "metronome") {
      expect(after.ride).toBeCloseTo(before.ride, 9);
      expect(after.time).toBeCloseTo(before.time, 9);
      expect(after.dmg).toBeGreaterThan(before.dmg);
      return `locked damage +${(after.dmg - before.dmg).toFixed(2)}`;
    }
    expect(after.time).not.toBeCloseTo(before.time, 4);
    return `time ${before.time.toFixed(2)}>${after.time.toFixed(2)}`;
  }
  expect(after.dmg, `${hero} ${d.id}: route damage`).toBeGreaterThan(before.dmg);
  return `damage +${(after.dmg - before.dmg).toFixed(2)}`;
}

function factoryProof(hero: HeroId, d: ItemDef): string {
  const b = heroStartBuild(hero, 1);
  const signature = b.items.find((p) => p.def === HEROES[hero].factory)!;
  const at = { x: signature.x, y: signature.y };
  signature.x = 0;
  signature.y = 8; // still owned; the bought factory takes its productive location
  b.items.push({ uid: 901, def: d.id, ...at });
  b.routes = [{ ...b.routes[0], factory: 901 }]; // every factory has at least one output
  expect(validateBuild(b, 10).errors, `${hero} ${d.id}: purchasable deck`).toEqual([]);
  expect(routeInfo(b, 0).connected, `${hero} ${d.id}: connected route`).toBe(true);
  const battle = new Battle(b, foe(), 20210924);
  const fired = shots(battle, 15);
  expect(battle.sides[0].factories.find((f) => f.uid === 901)?.produced, `${hero} ${d.id}: produced`).toBeGreaterThan(0);
  expect(fired.length, `${hero} ${d.id}: fired`).toBeGreaterThan(0);
  expect(fired.some((s) => s.dmg > 0), `${hero} ${d.id}: dealt damage`).toBe(true);
  return `${d.factory!.ammo}: ${fired.length} shots`;
}

function modProof(hero: HeroId, d: ItemDef): string {
  const b = heroStartBuild(hero, 1);
  const base = new Battle(b, foe(), 20210924).sides[0].turrets[0];
  b.mods.push({ uid: 901, def: d.id, turret: 0 });
  expect(validateBuild(b, 10).errors, `${hero} ${d.id}: purchasable deck`).toEqual([]);
  const battle = new Battle(b, foe(), 20210924);
  const t = battle.sides[0].turrets[0];
  const fired = shots(battle, 15);
  expect(fired.length, `${hero} ${d.id}: fed turret fires`).toBeGreaterThan(0);
  switch (d.id) {
    case "chamber":
      expect(t.perShot).toBeGreaterThan(base.perShot);
      return `loads/shot ${base.perShot}>${t.perShot}`;
    case "calibrate":
      expect(t.interval).toBeLessThan(base.interval);
      return `interval ${base.interval.toFixed(2)}>${t.interval.toFixed(2)}`;
    case "hopper":
      expect(t.window).toBeGreaterThan(base.window);
      expect(t.windowTime).toBeGreaterThan(base.windowTime);
      return `window ${base.window}>${t.window}`;
    case "mantlet":
      expect(t.immune).toContain("shock");
      expect(base.immune).not.toContain("shock");
      return "shock immune";
    case "ram":
      expect(t.finisher).toBeGreaterThan(base.finisher);
      return `finisher +${t.finisher}`;
    default: throw new Error(`unproved mod ${d.id}`);
  }
}

function coreProof(hero: HeroId, d: ItemDef): string {
  const b = heroStartBuild(hero, 1);
  b.mods.push({ uid: 901, def: d.id, turret: 0 });
  expect(validateBuild(b, 10).errors, `${hero} ${d.id}: purchasable deck`).toEqual([]);
  const battle = new Battle(b, foe(), 20210924);
  const t = battle.sides[0].turrets[0];
  expect(t.core.def).toBe(d.id);
  expect(t.core.bought).toBe(true);
  const c = t.core.spec;
  switch (d.id) {
    case "scatter": expect(c.pellets).toBeGreaterThan(1); break;
    case "rotary":
      expect(c.order).toBe("FIFO");
      expect(t.windowTime).toBeLessThan(1.5);
      break;
    case "pressure": expect(c.perQueued).toBeGreaterThan(0); break;
    case "gatling": expect(c.floor).toBeLessThan(c.start); break;
    case "hullbreaker": expect(c.hullMul).toBeGreaterThan(1); break;
    case "drake": expect(c.addBurn).toBeGreaterThan(0); break;
    case "salvo": expect(c.volleyFlat).toBeGreaterThan(0); break;
    default: throw new Error(`unproved core ${d.id}`);
  }
  const fired = shots(battle, 15);
  expect(fired.length, `${hero} ${d.id}: bought core fires`).toBeGreaterThan(0);
  return `${t.core.routine}: ${fired.length} shots`;
}

const prove = (hero: HeroId, d: ItemDef): string => {
  if (d.kind === "gate") return gateProof(hero, d);
  if (d.kind === "factory") return factoryProof(hero, d);
  if (d.kind === "mod") return modProof(hero, d);
  if (d.kind === "core") return coreProof(hero, d);
  throw new Error(`unproved kind ${d.kind}`);
};

describe("REQ-BFG-021: every buyable module has a per-hero mechanic proof", () => {
  const rows = buyableModules();
  expect(rows.map((d) => d.id).sort()).toEqual(Object.values(ITEMS).filter((d) => !!d.merchant && d.price > 0 && d.kind !== "supply").map((d) => d.id).sort());
  for (const d of rows) for (const hero of HARNESS_HEROES) {
    it(`${d.id} works for ${hero}`, () => {
      const proof = prove(hero, d);
      expect(proof.length).toBeGreaterThan(0);
      if (process.env.BB_POOL_AUDIT) console.log(`AUDIT ${d.id} ${hero}: ${proof}`);
    });
  }
});
