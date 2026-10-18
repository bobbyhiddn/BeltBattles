// Dusk ghosts (0.6.0, REQ-BFG-008): a ghost is a GhostSnapshot v1 (ghostSnapshot.ts, the async
// contract) of a player's deck exactly as it fought dusk on day N. After every dusk fight the
// player's own snapshot joins a local pool; at dusk the game picks a ghost from the same rules
// version and the same day, never one from the current run, ranked by |wins difference| then
// |lives difference| (ref async matchmaking), ties broken by a seeded hash. With no match the day's
// stand-in fights instead: a rival captain with its named build, standInBuild(id, day) (standInFoe;
// 0.6.2 TUNE-C; from 0.6.0d until then a full-purse deck from the stand-in pool, standInPick).
// Kept small on purpose: async play (0.7.0, src/net/*) replaces the storage and the matchmaking.

import { hashSeed } from "../core/rng";
import type { HeroId } from "../sim/content";
import type { Build } from "../sim/deck";
import { RIVALS, standInBuild, standInGhost, type RivalId } from "../sim/rivals";
import { STAND_IN_POOL_HEROES } from "../sim/standInPool";
import { migrateSnapshot, playerId, type GhostSnapshot } from "./ghostSnapshot";
import { longRunFor } from "../net/rulesGate"; // RUN-1 (REQ-BFG-059, D6): the long run's widening follows its rules
import { endlessMatchDays } from "../sim/endless"; // ENDLESS-1 (REQ-BFG-059): the days an endless query reads

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
  /** RUN-1 (REQ-BFG-059, D6): does the query widen a thin day to the nearest earlier one? Absent: the long run's rules decide
   *  (rulesGate.ts longRunFor(q.rules): the switch on AND rules at or after LONG_RUN_RULES). A caller that knows its run's own
   *  mark passes it (sim/longRun.ts longRun(run)), so a 10-day run saved before the bump keeps its exact-day pick. */
  long?: boolean;
  /** ENDLESS-1 (REQ-BFG-059): an endless dusk's query. `wins` and `lives` are then the player's ENDLESS wins and hearts going in. It
   *  reads ONLY endless ghosts (snapshot mode "endless"), nearest endless wins first (then nearest hearts; no D1: endless is a
   *  score attack among run winners), widening to the nearest earlier day within ENDLESS_WIDEN_DAYS (never before the first
   *  endless day, WIN_GOAL + 1). A run's query (no `endless`) never reads one. */
  endless?: true;
}

/**
 * Same rules version and day, never the current run; rank by |wins - q.wins|, then
 * |lives - q.lives| (as the async matchmaking does); ties by hashSeed(seed, "ghost", day) over the
 * best rank in pool order. (The local pool is this player's own earlier runs, so it excludes the
 * current run, not the player id; the async server excludes the player id.)
 * RUN-1 (REQ-BFG-059, D6): the client's pick mirrors the server's (src/net/matchmaking.ts matchDays): on a long run a thin day
 * (no ghost of its own rules, day and not this run) widens to the nearest EARLIER day with one, never a later one; with none
 * at all the caller's stand-in captain is built for the exact day. The tie-break hash keeps q.day, so an exact-day pick is
 * the pick it always was.
 */
export function pickGhost(pool: readonly GhostSnapshot[], q: GhostQuery): GhostSnapshot | null {
  // ENDLESS-1: an endless dusk reads its own days (endlessMatchDays: its day, then the nearest earlier ones within the window)
  if (q.endless) {
    for (const day of endlessMatchDays(q.day)) {
      const g = pickGhostOn(pool, q, day);
      if (g) return g;
    }
    return null;
  }
  const widen = q.long ?? longRunFor(q.rules);
  for (let day = q.day; day >= 1; day--) {
    const g = pickGhostOn(pool, q, day);
    if (g || !widen) return g;
  }
  return null;
}

/** The nearest-record pick among the pool's ghosts of day `day` (the whole of the old pickGhost, for one day). */
function pickGhostOn(pool: readonly GhostSnapshot[], q: GhostQuery, day: number): GhostSnapshot | null {
  let best: GhostSnapshot[] = [];
  let bw = Infinity, bl = Infinity;
  const endless = q.endless === true;
  for (const g of pool) {
    if (g.rules !== q.rules || g.day !== day || g.runId === q.runId) continue;
    if ((g.mode === "endless") !== endless) continue; // ENDLESS-1: an endless query reads only endless ghosts; a run's never reads one
    const dw = Math.abs((endless ? g.endlessWins ?? 0 : g.wins) - q.wins), dl = Math.abs(g.lives - q.lives);
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

/** True when the stand-in pool has decks for this hero. 0.6.2 TUNE-C: the pool is no longer the dusk
 *  stand-in's deck source (standInFoe); it stays as the harness's average-deck reference field and the
 *  async fallback's source (src/net/fallback.ts). */
export function inStandInPool(hero: HeroId): boolean {
  return STAND_IN_POOL_HEROES.includes(hero);
}

/**
 * No ghost for this day: the run's stand-in captain, standInGhost(runSeed, day) (its id, name,
 * hero, portrait and STAND-IN tag as before). 0.6.2 TUNE-C (REQ-BFG-024, REQ-BFG-026): it fights
 * with its named build, standInBuild(id, day): the captain's plan as it stands on that day at
 * ordinary shop luck, with whole paid plating, legal and costing at most maxGoldByDay(day) (R1).
 * The same plan grows from day 1 to day 10 and is also the captain's warlord deck (rivalBuild), so
 * a player can learn a build, spot it and plan a counter. Every stand-in is a captain with a plan,
 * so no hero falls back to the stand-in pool here (from 0.6.0d until TUNE-C the deck was the
 * pool's full-purse standInPick(hero, day, runSeed)). The one place the stand-in deck is chosen;
 * the dusk stores the result in run.dusk, so a reload or a scouted foe fights the same deck, and a
 * saved run keeps whatever deck its stored foe already had (no migration).
 */
export function standInFoe(runSeed: number, day: number): StandInFoe {
  const id = standInGhost(runSeed, day);
  const r = RIVALS[id];
  return { id, hero: r.hero, name: r.name, build: standInBuild(id, day) };
}
