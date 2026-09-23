// Offline ghosts: the dusk fight must always have an opponent, even with no network or
// an empty pool (ROADMAP §3). Order of preference: a bundled pool ghost, then a
// stand-in built from the other faction's warlord for that day. 0.6.0 swaps the
// warlord stand-in for the rival captains.

import { Rng } from "../core/rng";
import { HEROES, RULES_VERSION, RUN_LIVES, type HeroId } from "../sim/content";
import { warlordBuild } from "../sim/ai";
import { pickGhost, type MatchRequest } from "./matchmaking";
import { checkSnapshot, MAX_DAY, MAX_LIVES, SnapshotError, ghostId, type GhostSnapshot, type PoolEntry } from "./snapshot";
import { validateBuild } from "./validate";

/** The hero a stand-in ghost plays: another faction's hero, chosen by seed. */
export function rivalHero(hero: HeroId, seed = 0): HeroId {
  const foes = (Object.keys(HEROES) as HeroId[]).filter((id) => HEROES[id].faction !== HEROES[hero].faction);
  return foes.length ? foes[(seed >>> 0) % foes.length] : hero;
}

/**
 * Stand-in ghost for (hero, day, seed): warlordBuild of the other faction at that day.
 * Its record mirrors the requester's so the pre-fight card reads sensibly. Warlord
 * builds are trusted local content and are NOT budget-validated (see REPORT findings).
 */
export function offlineGhost(hero: HeroId, day: number, seed: number, record?: { wins: number; lives: number }): PoolEntry {
  const d = Math.min(MAX_DAY, Math.max(1, Math.floor(day)));
  const foe = rivalHero(hero, seed);
  const wins = Math.min(d - 1, Math.max(0, Math.floor(record?.wins ?? 0)));
  const lives = Math.min(MAX_LIVES, Math.max(1, Math.floor(record?.lives ?? RUN_LIVES)));
  const snapshot = checkSnapshot({
    v: 1, rules: RULES_VERSION, hero: foe, day: d, wins, lives, build: warlordBuild(foe, d),
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

/** Best offline opponent: a matching bundled-pool ghost, else the warlord stand-in. */
export function fallbackGhost(req: FallbackRequest, pool: readonly PoolEntry[] = []): PoolEntry {
  const hit = pickGhost(pool, req, new Rng(req.seed));
  return hit ?? offlineGhost(req.hero, req.day, req.seed, { wins: req.wins, lives: req.lives });
}

export type { GhostSnapshot };
