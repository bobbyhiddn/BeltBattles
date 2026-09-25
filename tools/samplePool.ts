// Deterministic sample ghost pool: 2 heroes x 10 days x 2 variants = 40 snapshots, drawn from
// the bundled full-purse stand-in pool (src/sim/standInPool.ts), because the bundled pool is the
// client's first offline choice, ahead of the stand-in: variant 0 is the day's par, variant 1 a
// seeded pick that is never the same deck as the par. Every snapshot passes validateBuild, so
// the pool doubles as validator coverage. Heroes come from STAND_IN_HEROES (PLAYABLE_HEROES).
// Records (wins, lives) are drawn exactly as before the switch: variant 1's rng first replays
// the retired shopper's draws, so only the decks changed. Since the 0.6.0 merge lives count
// down from START_LIVES (5; RUN_LIVES, 3, is gone): the same draws, lives 1..START_LIVES.

import { Rng, hashSeed } from "../src/core/rng";
import { GRID, HEROES, ITEMS, RULES_VERSION, START_LIVES, type HeroId } from "../src/sim/content";
import { startingBuild } from "../src/sim/ai";
import { occupancy, type Build } from "../src/sim/deck";
import { STAND_IN_HEROES } from "../src/net/fallback";
import { buildCost, maxGoldByDay, validateBuild } from "../src/net/validate";
import { checkSnapshot, encodeSnapshot, MAX_DAY, SNAPSHOT_VERSION, type GhostSnapshot } from "../src/net/snapshot";
import { encodeStarred, standInParIndex, standInPickIndex, standInPool } from "../src/sim/standInPool";

const EPOCH = Date.UTC(2026, 8, 23, 19, 22); // fixed, so the generated file is reproducible
const PLATE = ITEMS.plating.supply!.hull!;
const GATES = Object.values(ITEMS).filter((d) => d.kind === "gate" && d.merchant);
const MODS = Object.values(ITEMS).filter((d) => d.kind === "mod" && d.merchant);

/** The sample deck: variant 0 = the par; variant 1 = standInPick's entry for `seed`, stepped
 *  deterministically to the next entry while it is the same deck as the par. */
export function sampleDeck(hero: HeroId, day: number, v: number, seed: number): Build {
  const pool = standInPool(hero, day), par = standInParIndex(hero, day);
  if (v === 0) return pool[par].build;
  const parCode = encodeStarred(pool[par].build); // star-aware: since the 0.6.1 flip two picks may differ only in stars
  let i = standInPickIndex(hero, day, seed);
  for (let step = 0; step < pool.length && encodeStarred(pool[i].build) === parCode; step++) i = (i + 1) % pool.length;
  return pool[i].build;
}

/** Retired variant-1 shopper (gates, a module, plating on the starting layout). Its deck is no
 *  longer used; it only replays its rng draws so each snapshot keeps its record. */
function shopper(hero: HeroId, day: number, rng: Rng): Build {
  const b = startingBuild(hero, 1);
  const budget = maxGoldByDay(day);
  let uid = 100;
  for (let tries = 0; tries < 40; tries++) {
    const left = budget - buildCost(b).total;
    const roll = rng.next();
    if (roll < 0.15) {
      const free = HEROES[hero].turrets.map((_, i) => i).filter((t) => !b.mods.some((m) => m.turret === t));
      const d = rng.pick(MODS);
      if (free.length && d.price <= left) b.mods.push({ uid: uid++, def: d.id, turret: rng.pick(free) });
    } else if (roll < 0.3) {
      if (ITEMS.plating.price <= left) b.hullBonus += PLATE;
    } else {
      const occ = occupancy(b);
      const free = b.routes.flatMap((r) => r.cells).filter((k) => occ[k].item < 0);
      const d = rng.pick(GATES.filter((g) => g.rarity !== "legendary" || day >= 4));
      if (free.length && d.price <= left) {
        const k = rng.pick(free);
        b.items.push({ uid: uid++, def: d.id, x: k % GRID, y: Math.floor(k / GRID) });
      }
    }
  }
  return b;
}

export function generateSamplePool(): GhostSnapshot[] {
  const out: GhostSnapshot[] = [];
  for (const hero of STAND_IN_HEROES) {
    for (let v = 0; v < 2; v++) {
      for (let day = 1; day <= MAX_DAY; day++) {
        const seed = hashSeed("sample-pool", hero, v, day);
        const rng = new Rng(seed);
        if (v === 1) shopper(hero, day, rng); // replay the retired shopper's draws: records unchanged
        const build = sampleDeck(hero, day, v, seed);
        const wins = rng.int(day);
        const losses = Math.min(START_LIVES - 1, rng.int(day - wins));
        const snap = checkSnapshot({
          v: SNAPSHOT_VERSION, rules: RULES_VERSION, hero, day, wins, lives: START_LIVES - losses, build, // v2: pool decks carry stars
          runId: `sample-run-${hero}-${v}`, playerId: `sample-${hero}-${v}`, createdAt: EPOCH + out.length * 1000,
        });
        const val = validateBuild(snap.build, day);
        if (!val.ok) throw new Error(`sample ghost ${hero} v${v} day ${day} is invalid: ${val.errors.join("; ")}`);
        out.push(snap);
      }
    }
  }
  return out;
}

/** One canonical snapshot per line inside a JSON array (diff-friendly). */
export function samplePoolJson(pool: GhostSnapshot[] = generateSamplePool()): string {
  return "[\n" + pool.map((s) => encodeSnapshot(s)).join(",\n") + "\n]\n";
}
