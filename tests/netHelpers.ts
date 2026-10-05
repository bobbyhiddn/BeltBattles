// Shared fixtures for the async (src/net) tests. Not a test file itself.

import { startingBuild } from "../src/sim/ai";
import { RULES_VERSION, type HeroId } from "../src/sim/content";
import { key, type Build } from "../src/sim/deck";
import { SNAPSHOT_V3, type GhostSnapshot, type PoolEntry } from "../src/net/snapshot";
import { HEROES_RULES, heroesFor } from "../src/net/rulesGate";
import { validateBuild, validateUpload, type Validation } from "../src/net/validate";
import { withDawnRunes } from "./runeFill";

/**
 * 0.8.0 H1 (REQ-BFG-009): the first rules version whose upload check accepts `hero` (rulesGate.ts RULES_HEROES): this
 * build's RULES_VERSION (bb-0.8.3 since BELTS, after HEROES_RULES; bb-0.8.0, HEROES_RULES itself, from the 0.8.0 RC)
 * for all four playable heroes; null for METRONOME and SIPHON, which no rules version accepts yet.
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

/**
 * FLIP-X2 (cap's ruling 5d6d83ef57d1494c, item 5): snap() as an upload under this build's rules travels: its build (the
 * rune-less deck in `over.build`, or the starting deck) holding exactly its day's runes, neutral ones (tests/runeFill.ts:
 * no hull, belt or gold), in a v3 snapshot (build.runes is v3 only) with no seed (so the count and the catalogue are
 * checked, not the offers). validateUpload's exact count refuses snap()'s rune-less deck.
 */
export function upSnap(over: Partial<GhostSnapshot> = {}, hero: HeroId = "furnace"): GhostSnapshot {
  const s = snap(over, hero);
  return { ...s, v: SNAPSHOT_V3, build: withDawnRunes(s.build, s.day) };
}

export function entry(id: string, over: Partial<GhostSnapshot> = {}): PoolEntry {
  return { id, snapshot: snap(over) };
}

/** Furnace starting deck (Kiln at 4,6, straight route to connector 4) with overrides. */
export function furnaceDeck(over: Partial<Build> = {}): Build {
  return { ...startingBuild("furnace", 1), ...over };
}

export const STRAIGHT = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
