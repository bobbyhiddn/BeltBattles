// Offline ghosts: the dusk fight must always have an opponent, even with no network or
// an empty pool (ROADMAP §3). Order of preference: a bundled pool ghost, then a stand-in
// drawn from the bundled full-purse stand-in pool (src/sim/standInPool.ts): a legal deck of
// another faction's hero for that day that spends at least 90% of the day's gold.

import { Rng } from "../core/rng";
import { HEROES, RULES_VERSION, START_LIVES, type HeroId } from "../sim/content";
import { PLAYABLE_HEROES } from "../sim/heroBuilds";
import { standInPick } from "../sim/standInPool";
import { pickGhost, type MatchRequest } from "./matchmaking";
import { checkSnapshot, MAX_DAY, MAX_LIVES, SnapshotError, ghostId, type GhostSnapshot, type PoolEntry } from "./snapshot";
import { validateBuild } from "./validate";

/**
 * Heroes a stand-in (or sample-pool) ghost may play: the heroes the game offers
 * (PLAYABLE_HEROES). Each needs decks in the stand-in pool (STAND_IN_POOL_HEROES), because
 * standInPick throws for a hero outside it; tests/net-fallback-standins.test.ts fails if a
 * playable hero has none. Any hero may still REQUEST a stand-in; it fights one of these.
 */
export const STAND_IN_HEROES: readonly HeroId[] = PLAYABLE_HEROES;

/** The hero a stand-in ghost plays: another faction's hero, chosen by seed. */
export function rivalHero(hero: HeroId, seed = 0): HeroId {
  const foes = STAND_IN_HEROES.filter((id) => HEROES[id].faction !== HEROES[hero].faction);
  return foes.length ? foes[(seed >>> 0) % foes.length] : hero;
}

/**
 * Stand-in ghost for (hero, day, seed): standInPick(foe, day, seed), a full-purse deck of
 * another faction's hero from the bundled stand-in pool. Every pool deck passes
 * validateBuild for its day (tests/standInPool.test.ts). Its record mirrors the requester's
 * so the pre-fight card reads sensibly. The playerId string is unchanged for compatibility.
 */
export function offlineGhost(hero: HeroId, day: number, seed: number, record?: { wins: number; lives: number }): PoolEntry {
  const d = Math.min(MAX_DAY, Math.max(1, Math.floor(day)));
  const foe = rivalHero(hero, seed);
  const wins = Math.min(d - 1, Math.max(0, Math.floor(record?.wins ?? 0)));
  const lives = Math.min(MAX_LIVES, Math.max(1, Math.floor(record?.lives ?? START_LIVES)));
  const build = standInPick(foe, d, seed);
  const snapshot = checkSnapshot({
    // 0.6.2 BELTSIDE: a stand-in deck's rigs may carry `rot`, which only v2 allows (DESIGN-beltside D1)
    v: build.items.some((p) => p.rot !== undefined) ? 2 : 1, rules: RULES_VERSION, hero: foe, day: d, wins, lives, build,
    runId: `offline-${(seed >>> 0).toString(16)}`, playerId: "offline-warlord", createdAt: 0,
  });
  return { id: `offline-${foe}-d${d}`, snapshot };
}

export interface PoolLoad {
  entries: PoolEntry[];
  rejected: { index: number; error: string }[];
}

/**
 * Load a bundled pool: a JSON array of snapshots (text or already parsed). Every entry
 * is strictly decoded, must carry the current RULES_VERSION and must pass validateBuild
 * for its day; bad entries are reported, never loaded. Duplicates collapse by id.
 */
export function loadGhostPool(json: string | unknown): PoolLoad {
  let raw: unknown = json;
  if (typeof json === "string") {
    try {
      raw = JSON.parse(json);
    } catch {
      throw new SnapshotError("ghost pool: not valid JSON");
    }
  }
  if (!Array.isArray(raw)) throw new SnapshotError("ghost pool: expected a JSON array of snapshots");
  const entries: PoolEntry[] = [];
  const rejected: PoolLoad["rejected"] = [];
  const ids = new Set<string>();
  raw.forEach((item, index) => {
    try {
      const snapshot = checkSnapshot(item);
      if (snapshot.rules !== RULES_VERSION) throw new SnapshotError(`rules ${snapshot.rules} is not ${RULES_VERSION}`);
      const v = validateBuild(snapshot.build, snapshot.day);
      if (!v.ok) throw new SnapshotError(v.errors.join("; "));
      const id = ghostId(snapshot);
      if (ids.has(id)) return;
      ids.add(id);
      entries.push({ id, snapshot });
    } catch (e) {
      rejected.push({ index, error: e instanceof Error ? e.message : String(e) });
    }
  });
  return { entries, rejected };
}

export interface FallbackRequest extends MatchRequest {
  hero: HeroId; // requester's hero (the stand-in plays another faction)
  seed: number; // e.g. the day's battle seed; picks within the pool and names the stand-in
}

/** Best offline opponent: a matching bundled-pool ghost, else the stand-in pool's deck (offlineGhost). */
export function fallbackGhost(req: FallbackRequest, pool: readonly PoolEntry[] = []): PoolEntry {
  const hit = pickGhost(pool, req, new Rng(req.seed));
  return hit ?? offlineGhost(req.hero, req.day, req.seed, { wins: req.wins, lives: req.lives });
}

export type { GhostSnapshot };
