// Shared fixtures for the async (src/net) tests. Not a test file itself.

import { startingBuild } from "../src/sim/ai";
import { RULES_VERSION, type HeroId } from "../src/sim/content";
import { key, type Build } from "../src/sim/deck";
import type { GhostSnapshot, PoolEntry } from "../src/net/snapshot";
import { HEROES_RULES, heroesFor } from "../src/net/rulesGate";
import { validateBuild, validateUpload, type Validation } from "../src/net/validate";

/**
 * 0.8.0 H1 (REQ-BFG-009): the first rules version whose upload check accepts `hero` (rulesGate.ts RULES_HEROES): this
 * build's RULES_VERSION (bb-0.8.0 since the 0.8.0 RC, which is HEROES_RULES) for all four playable heroes; null for
 * METRONOME and SIPHON, which no rules version accepts yet.
 */
export function uploadRulesFor(hero: HeroId): string | null {
  for (const r of [RULES_VERSION, HEROES_RULES]) if (heroesFor(r).includes(hero)) return r;
  return null;
}

/**
 * The player-mode check of a deck from any hero (the superset tests): validateUpload under the first rules version that
 * accepts its hero (uploadRulesFor), so the rules gates still run; for a hero no rules version accepts yet, the player
 * mode itself (validateBuild "player"), which is what validateUpload checked for every hero before 0.8.0 H1.
 */
export function playerCheck(b: Build, day: number): Validation {
  const rules = uploadRulesFor(b.hero);
  return rules ? validateUpload(b, day, rules) : validateBuild(b, day, "player");
}

export const K = key;

export function snap(over: Partial<GhostSnapshot> = {}, hero: HeroId = "furnace"): GhostSnapshot {
  return {
    v: 1, rules: RULES_VERSION, hero, day: 1, wins: 0, lives: 3, build: startingBuild(hero, 1),
    runId: "run-test-1", playerId: "player-a", createdAt: 1_790_000_000_000, ...over,
  };
}

export function entry(id: string, over: Partial<GhostSnapshot> = {}): PoolEntry {
  return { id, snapshot: snap(over) };
}

/** Furnace starting deck (Kiln at 4,6, straight route to connector 4) with overrides. */
export function furnaceDeck(over: Partial<Build> = {}): Build {
  return { ...startingBuild("furnace", 1), ...over };
}

export const STRAIGHT = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
