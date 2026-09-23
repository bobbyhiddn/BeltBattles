// Deterministic sample ghost pool: 2 heroes x 10 days x 2 variants = 40 snapshots.
// Variant 0 is the day's warlord made purchasable (whole plating, within the day's
// budget); variant 1 is a seeded shopper spending that budget on the starting layout.
// Every snapshot passes validateBuild, so the pool doubles as validator coverage.

import { Rng, hashSeed } from "../src/core/rng";
import { GRID, HEROES, ITEMS, RULES_VERSION, RUN_LIVES, type HeroId } from "../src/sim/content";
import { startingBuild, warlordBuild, warlordHull } from "../src/sim/ai";
import { occupancy, type Build } from "../src/sim/deck";
import { buildCost, maxGoldByDay, validateBuild } from "../src/net/validate";
import { checkSnapshot, encodeSnapshot, MAX_DAY, type GhostSnapshot } from "../src/net/snapshot";

const EPOCH = Date.UTC(2026, 8, 23, 19, 22); // fixed, so the generated file is reproducible
const PLATE = ITEMS.plating.supply!.hull!;
const GATES = Object.values(ITEMS).filter((d) => d.kind === "gate" && d.merchant);
const MODS = Object.values(ITEMS).filter((d) => d.kind === "mod" && d.merchant);

/** Variant 0: the warlord deck with its hull bonus rounded to whole plating that fits the budget. */
function legalWarlord(hero: HeroId, day: number): Build {
  const b = warlordBuild(hero, day);
  b.hullBonus = Math.max(0, Math.round(warlordHull(day) / PLATE)) * PLATE;
  while (b.hullBonus > 0 && buildCost(b).total > maxGoldByDay(day)) b.hullBonus -= PLATE;
  return b;
}

/** Variant 1: gates on free belt tiles, a turret module, plating; never over budget. */
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
  for (const hero of Object.keys(HEROES) as HeroId[]) {
    for (let v = 0; v < 2; v++) {
      for (let day = 1; day <= MAX_DAY; day++) {
        const rng = new Rng(hashSeed("sample-pool", hero, v, day));
        const build = v === 0 ? legalWarlord(hero, day) : shopper(hero, day, rng);
        const wins = rng.int(day);
        const losses = Math.min(RUN_LIVES - 1, rng.int(day - wins));
        const snap = checkSnapshot({
          v: 1, rules: RULES_VERSION, hero, day, wins, lives: RUN_LIVES - losses, build,
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
