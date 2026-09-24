// Dusk ghosts (0.6.0, REQ-BFG-008): a ghost is a GhostSnapshot v1 (ghostSnapshot.ts, the async
// contract) of a player's deck exactly as it fought dusk on day N. After every dusk fight the
// player's own snapshot joins a local pool; at dusk the game picks a ghost from the same rules
// version and the same day, never one from the current run, ranked by |wins difference| then
// |lives difference| (ref async matchmaking), ties broken by a seeded hash. With no match the day's
// stand-in fights instead: a rival captain with a full-purse deck from the stand-in pool
// (standInFoe; 0.6.0d: standInPick from src/sim/standInPool.ts, pool v1.1).
// Kept small on purpose: async play (0.7.0, src/net/*) replaces the storage and the matchmaking.

import { hashSeed } from "../core/rng";
import type { HeroId } from "../sim/content";
import type { Build } from "../sim/deck";
import { RIVALS, standInBuild, standInGhost, type RivalId } from "../sim/rivals";
import { STAND_IN_POOL_HEROES, standInPick } from "../sim/standInPool";
import { migrateSnapshot, playerId, type GhostSnapshot } from "./ghostSnapshot";

export type { GhostSnapshot } from "./ghostSnapshot";

export const GHOST_KEY = "beltbattles.ghosts.v1";
export const POOL_MAX = 300;

type Store = Pick<Storage, "getItem" | "setItem">;

function storage(s?: Store): Store | null {
  if (s) return s;
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/** The local pool, oldest first. 0.6.0a entries migrate to v1 on load; malformed entries are
 *  skipped; storage errors give an empty pool. */
export function loadPool(s?: Store): GhostSnapshot[] {
  try {
    const st = storage(s);
    const raw = st?.getItem(GHOST_KEY);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    const me = playerId(s);
    const out: GhostSnapshot[] = [];
    for (const e of arr) {
      const g = migrateSnapshot(e, me);
      if (g) out.push(g);
    }
    return out;
  } catch {
    return [];
  }
}

/** Add a snapshot to the pool (the whole pool is written back as v1), dropping the oldest past
 *  POOL_MAX. Storage errors are ignored. */
export function saveGhost(g: GhostSnapshot, s?: Store): void {
  try {
    const st = storage(s);
    if (!st) return;
    const pool = loadPool(st);
    pool.push(JSON.parse(JSON.stringify(g)) as GhostSnapshot);
    while (pool.length > POOL_MAX) pool.shift();
    st.setItem(GHOST_KEY, JSON.stringify(pool));
  } catch {
    /* storage full or unavailable: the pool just doesn't grow */
  }
}

export interface GhostQuery {
  rules: string;
  day: number;
  runId: string;
  wins: number; // going into tonight's dusk
  lives: number; // going into tonight's dusk
  seed: number;
}

/**
 * Same rules version and day, never the current run; rank by |wins - q.wins|, then
 * |lives - q.lives| (as the async matchmaking does); ties by hashSeed(seed, "ghost", day) over the
 * best rank in pool order. (The local pool is this player's own earlier runs, so it excludes the
 * current run, not the player id; the async server excludes the player id.)
 */
export function pickGhost(pool: readonly GhostSnapshot[], q: GhostQuery): GhostSnapshot | null {
  let best: GhostSnapshot[] = [];
  let bw = Infinity, bl = Infinity;
  for (const g of pool) {
    if (g.rules !== q.rules || g.day !== q.day || g.runId === q.runId) continue;
    const dw = Math.abs(g.wins - q.wins), dl = Math.abs(g.lives - q.lives);
    if (dw < bw || (dw === bw && dl < bl)) {
      best = [g];
      bw = dw;
      bl = dl;
    } else if (dw === bw && dl === bl) best.push(g);
  }
  if (!best.length) return null;
  return best[hashSeed(q.seed, "ghost", q.day) % best.length];
}

/** A dusk stand-in: the day's rival captain and the deck it brings. */
export interface StandInFoe {
  id: RivalId;
  hero: HeroId;
  name: string;
  build: Build;
}

/** True when the stand-in pool has decks for this hero (standInFoe's deck source). */
export function inStandInPool(hero: HeroId): boolean {
  return STAND_IN_POOL_HEROES.includes(hero);
}

/**
 * No ghost for this day: the run's stand-in captain, standInGhost(runSeed, day) (its id, name,
 * hero, portrait and STAND-IN tag as before). 0.6.0d: its deck is standInPick(hero, day, runSeed),
 * a full-purse deck from the stand-in pool v1.1 for the captain's hero: it costs at least 90% of
 * maxGoldByDay(day), whole paid plating, and beats both factions' par decks at least half the
 * time. The pick hashes the seed, hero and day, so runSeed is the whole seed. A captain whose
 * hero has no pool decks falls back to its honest plan deck, standInBuild(id, day) (R1); no 0.6
 * captain needs it (tests/standInPool.test.ts). The one place the stand-in deck is chosen; the
 * dusk stores the result in run.dusk, so a reload or a scouted foe fights the same deck, and a
 * saved run keeps whatever deck its stored foe already had (no migration).
 */
export function standInFoe(runSeed: number, day: number): StandInFoe {
  const id = standInGhost(runSeed, day);
  const r = RIVALS[id];
  const build = inStandInPool(r.hero) ? standInPick(r.hero, day, runSeed) : standInBuild(id, day);
  return { id, hero: r.hero, name: r.name, build };
}
