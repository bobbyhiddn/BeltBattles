// Exact replay (spec §23): a battle record holds both builds, the rules version and the
// seed. The sim is fixed-step and every random decision flows through one seeded Rng,
// so replaying a record under the same RULES_VERSION reproduces the fight bit for bit.

import { RULES_VERSION } from "../sim/content";
import { cloneBuild, type Build } from "../sim/deck";
import { Battle, simulate, type BattleRecord, type Side } from "../sim/battle";
import { checkBuildShape } from "./snapshot";

export interface BattleOutcome {
  winner: Side | -1 | null; // null only if the tick budget ran out first
  ticks: number; // end tick
  hulls: [number, number]; // final hull points, player then ghost
}

export class RulesMismatchError extends Error {
  constructor(readonly recordRules: string) {
    super(`battle record was made under rules "${recordRules}"; this build runs "${RULES_VERSION}" and cannot replay it`);
    this.name = "RulesMismatchError";
  }
}

function checkSeed(seed: unknown): number {
  if (typeof seed !== "number" || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error("battle record: seed must be an integer in 0..2^32-1");
  }
  return seed;
}

/** The record the dusk fight should store: side 0 is the player, side 1 the ghost. */
export function battleRecordFor(player: Build, ghost: Build, seed: number): BattleRecord {
  return { rules: RULES_VERSION, seed: checkSeed(seed), builds: [cloneBuild(player), cloneBuild(ghost)] };
}

/** Refuse records from another rules version, then shape-check both builds. */
export function checkRecord(record: BattleRecord): BattleRecord {
  if (typeof record !== "object" || record === null) throw new Error("battle record: expected an object");
  if (record.rules !== RULES_VERSION) throw new RulesMismatchError(String(record.rules));
  if (!Array.isArray(record.builds) || record.builds.length !== 2) throw new Error("battle record: expected two builds");
  return {
    rules: record.rules,
    seed: checkSeed(record.seed),
    builds: [checkBuildShape(record.builds[0], "builds[0]"), checkBuildShape(record.builds[1], "builds[1]")],
  };
}

export function outcomeOf(b: Battle): BattleOutcome {
  return { winner: b.winner, ticks: b.ticks, hulls: [b.sides[0].hull.hp, b.sides[1].hull.hp] };
}

/** A fresh, unstepped Battle for animated playback of a stored record. */
export function replayBattle(record: BattleRecord): Battle {
  const r = checkRecord(record);
  return new Battle(r.builds[0], r.builds[1], r.seed);
}

/** Headless replay to the end; same result as the original simulate() call. */
export function replay(record: BattleRecord, maxTicks?: number): BattleOutcome {
  const r = checkRecord(record);
  return outcomeOf(simulate(r.builds[0], r.builds[1], r.seed, maxTicks));
}
