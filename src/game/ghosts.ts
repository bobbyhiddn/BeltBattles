// Dusk ghosts (0.6.0, REQ-BFG-008): a ghost is a snapshot of a player's deck exactly as it fought
// dusk on day N. After every dusk fight the player's own snapshot joins a local pool; at dusk the
// game picks a ghost from the same rules version and the same day, never one from the current run,
// nearest in W-L record, ties broken by a seeded hash. With no match a stand-in fights instead.
// Kept small on purpose: async play (0.7.0, src/net/*) replaces the storage and the matchmaking.

import { hashSeed, Rng } from "../core/rng";
import { HEROES, type HeroId } from "../sim/content";
import { warlordName } from "../sim/ai";
import type { Build } from "../sim/deck";
import { honestStandInBuild } from "./honest";

export interface GhostSnapshot {
  v: 1;
  rulesVersion: string;
  hero: HeroId;
  day: number;
  wins: number; // the record entering that dusk
  losses: number;
  lives: number;
  build: Build; // the serialisable build the battle uses
  runId: string;
  savedAt: number;
}

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

function valid(g: unknown): g is GhostSnapshot {
  const q = g as GhostSnapshot | null;
  return !!q && q.v === 1 && typeof q.rulesVersion === "string" && typeof q.day === "number" && !!HEROES[q.hero]
    && typeof q.wins === "number" && typeof q.losses === "number" && typeof q.runId === "string"
    && !!q.build && Array.isArray(q.build.items) && Array.isArray(q.build.routes) && Array.isArray(q.build.mods);
}

/** The local pool, oldest first (malformed entries are skipped; storage errors give an empty pool). */
export function loadPool(s?: Store): GhostSnapshot[] {
  try {
    const raw = storage(s)?.getItem(GHOST_KEY);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(valid) : [];
  } catch {
    return [];
  }
}

/** Add a snapshot to the pool, dropping the oldest past POOL_MAX. Storage errors are ignored. */
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
  rulesVersion: string;
  day: number;
  runId: string;
  wins: number;
  losses: number;
  seed: number;
}

/** Same rules version and day, never the current run, nearest W-L record; ties by a seeded hash. */
export function pickGhost(pool: readonly GhostSnapshot[], q: GhostQuery): GhostSnapshot | null {
  let best: GhostSnapshot[] = [];
  let bestD = Infinity;
  for (const g of pool) {
    if (!valid(g) || g.rulesVersion !== q.rulesVersion || g.day !== q.day || g.runId === q.runId) continue;
    const d = Math.abs(g.wins - q.wins) + Math.abs(g.losses - q.losses);
    if (d < bestD) {
      bestD = d;
      best = [g];
    } else if (d === bestD) best.push(g);
  }
  if (!best.length) return null;
  return best[hashSeed(q.seed, "ghost", q.day) % best.length];
}

const STAND_IN_HEROES: HeroId[] = ["furnace", "weaver"];

/** No ghost for this day: an honest deck (honest.ts: today's warlord gates, hull only from plating
 *  a player could buy, within the day's gold) with a seeded hero, under today's warlord naming.
 *  0.6.0b swaps the rival captains' standInBuild in here. */
export function standIn(seed: number, day: number): { hero: HeroId; name: string; build: Build } {
  const hero = new Rng(hashSeed(seed, "standin", day)).pick(STAND_IN_HEROES);
  return { hero, name: warlordName(hero, day), build: honestStandInBuild(hero, day) };
}
