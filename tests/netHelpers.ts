// Shared fixtures for the async (src/net) tests. Not a test file itself.

import { startingBuild } from "../src/sim/ai";
import { RULES_VERSION, type HeroId } from "../src/sim/content";
import { key, type Build } from "../src/sim/deck";
import type { GhostSnapshot, PoolEntry } from "../src/net/snapshot";

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
