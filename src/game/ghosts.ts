// Dusk ghosts (0.6.0, REQ-BFG-008): a ghost is a GhostSnapshot v1 (ghostSnapshot.ts, the async
// contract) of a player's deck exactly as it fought dusk on day N. After every dusk fight the
// player's own snapshot joins a local pool; at dusk the game picks a ghost from the same rules
// version and the same day, never one from the current run, ranked by |wins difference| then
// |lives difference| (ref async matchmaking), ties broken by a seeded hash. With no match the day's
// stand-in fights instead: a rival captain with its honest deck (standInFoe).
// Kept small on purpose: async play (0.7.0, src/net/*) replaces the storage and the matchmaking.

import { hashSeed } from "../core/rng";
import type { HeroId } from "../sim/content";
import type { Build } from "../sim/deck";
import { RIVALS, standInBuild, standInGhost, type RivalId } from "../sim/rivals";
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

/**
 * No ghost for this day: the run's stand-in captain, standInGhost(runSeed, day), with its honest
 * deck standInBuild(id, day) (R1: whole paid plating, within maxGoldByDay(day)). The one place the
 * stand-in deck is chosen, so 0.6.0c can swap the deck source (e.g. full-purse stand-ins).
 */
export function standInFoe(runSeed: number, day: number): StandInFoe {
  const id = standInGhost(runSeed, day);
  const r = RIVALS[id];
  return { id, hero: r.hero, name: r.name, build: standInBuild(id, day) };
}
