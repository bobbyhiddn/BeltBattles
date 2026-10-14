// Exact replay (spec §23): a battle record holds both builds, the rules version and the
// seed. The sim is fixed-step and every random decision flows through one seeded Rng,
// so replaying a record under the same RULES_VERSION reproduces the fight bit for bit.

import { RULES_VERSION } from "../sim/content";
import { cloneBuild, type Build } from "../sim/deck";
import { Battle, simulate, type BattleRecord, type Side } from "../sim/battle";
import { checkBuildShape, MAX_DAY } from "./snapshot";
import { runeMods } from "../sim/runes"; // RUNES-2a (REQ-BFG-058): WARLORD'S DUE's wins travel in the record
import { rulesGateProblem } from "./rulesGate"; // 0.7.0 (v070-rel M2): turrets and joins need bb-0.6.2 rules
import { freeJoinsFor } from "./rulesGate"; // JOINS-1 (REQ-BFG-091): free joins by the record's own rules
import { withFreeJoins } from "../sim/freeJoins"; // JOINS-1
import { dayScaled, hullScaleRules } from "../sim/hullScale"; // HULL-1a (REQ-BFG-079): the record's day
import { buildReads, scaleRules } from "../sim/scale"; // SCALE-2a (REQ-BFG-098): wins and hearts lost for `reads` pieces
// SCALE-2d (REQ-BFG-098, REQ-BFG-106; D5): the counts' bounds (readCountsProblem)
import { MAX_LIVES } from "./snapshot";
import { heartsFor, heartsLostCapFor } from "./rulesGate";
import { reachableRecords } from "./records";
import { START_LIVES } from "../sim/content";
import { HEARTS_START } from "../sim/hearts";

export interface BattleOutcome {
  winner: Side | -1 | null; // null only if the tick budget ran out first
  ticks: number; // end tick
  hulls: [number, number]; // final hull points, player then ghost
}

export class RulesMismatchError extends Error {
  /** `why` (0.7.0, v070-rel M2): the record's builds carry what its rules can't hold (rulesGate.ts). */
  constructor(readonly recordRules: string, why?: string) {
    super(why === undefined
      ? `battle record was made under rules "${recordRules}"; this build runs "${RULES_VERSION}" and cannot replay it`
      : `battle record under rules "${recordRules}" cannot replay: ${why}`);
    this.name = "RulesMismatchError";
  }
}

function checkSeed(seed: unknown): number {
  if (typeof seed !== "number" || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error("battle record: seed must be an integer in 0..2^32-1");
  }
  return seed;
}

/** The record the dusk fight should store: side 0 is the player, side 1 the ghost. RUNES-2a (REQ-BFG-058): `wins`, the
 *  wins each side carried in, kept only when a build holds WARLORD'S DUE (runes.ts winDmgPct), so a replay is exact and
 *  every other record is as before. HULL-1a (REQ-BFG-079): `day`, the fight's day, kept only when the fight plays the
 *  day's hull (HULL_SCALE on: hullScale.ts dayScaled), so every other record is as before. */
export function battleRecordFor(player: Build, ghost: Build, seed: number, wins?: readonly [number, number], day?: number, lost?: readonly [number, number]): BattleRecord {
  // SCALE-2a (REQ-BFG-098): with SCALE_RIGS on, a `reads` piece's wins (TROPHY CHAIN) and hearts lost (GRUDGE ROD) travel
  // too, as WARLORD'S DUE's wins do (the Battle keeps them on the same rule)
  const scale = scaleRules(), on = (count: "wins" | "heartsLost"): boolean => scale && (buildReads(player, count) || buildReads(ghost, count));
  const reads = !!(runeMods(player.runes)?.winDmgPct || runeMods(ghost.runes)?.winDmgPct) || on("wins");
  return {
    rules: RULES_VERSION, seed: checkSeed(seed), builds: [cloneBuild(player), cloneBuild(ghost)],
    ...(reads && wins ? { wins: [checkWins(wins[0]), checkWins(wins[1])] as [number, number] } : {}),
    ...(dayScaled(day) ? { day: checkDay(day) } : {}),
    ...(lost && on("heartsLost") ? { lost: [checkWins(lost[0]), checkWins(lost[1])] as [number, number] } : {}),
  };
}

/** HULL-1a (REQ-BFG-079): a record's day, a whole number 1..RECORD_DAY_MAX (days past MAX_DAY are for later modes). */
const RECORD_DAY_MAX = 99;
function checkDay(d: unknown): number {
  if (typeof d !== "number" || !Number.isInteger(d) || d < 1 || d > RECORD_DAY_MAX) throw new Error(`battle record: day must be an integer in 1..${RECORD_DAY_MAX}`);
  return d;
}

/** RUNES-2a: a record's wins, an integer 0..MAX_DAY - 1 (the snapshot's bound: wins going into a day's dusk). */
function checkWins(w: unknown): number {
  if (typeof w !== "number" || !Number.isInteger(w) || w < 0 || w >= MAX_DAY) throw new Error(`battle record: wins must be integers in 0..${MAX_DAY - 1}`);
  return w;
}

/** Refuse records from another rules version, then shape-check both builds. 0.7.0 (v070-rel M2): first, turret slots or
 *  belt joins under rules that predate bb-0.6.2 or can't be read (rulesGate.ts); the exact check still follows. */
export function checkRecord(record: BattleRecord): BattleRecord {
  if (typeof record !== "object" || record === null) throw new Error("battle record: expected an object");
  if (Array.isArray(record.builds)) {
    record.builds.forEach((b, i) => {
      const why = rulesGateProblem(record.rules, b);
      if (why) throw new RulesMismatchError(String(record.rules), `builds[${i}]: ${why}`);
    });
  }
  if (record.rules !== RULES_VERSION) throw new RulesMismatchError(String(record.rules));
  if (!Array.isArray(record.builds) || record.builds.length !== 2) throw new Error("battle record: expected two builds");
  const w = (record as { wins?: unknown }).wins; // RUNES-2a: WARLORD'S DUE's wins, when the record keeps them
  if (w !== undefined && (!Array.isArray(w) || w.length !== 2)) throw new Error("battle record: wins must be two integers");
  // HULL-1a (REQ-BFG-079): the record's day, read only with HULL_SCALE on (a record without one plays at M = 1); with the
  // switch off the key is passed over, as every unknown key was before
  const d = hullScaleRules() ? (record as { day?: unknown }).day : undefined;
  // SCALE-2a (REQ-BFG-098): the record's hearts lost, read only with SCALE_RIGS on (passed over otherwise, as `day` is)
  const l = scaleRules() ? (record as { lost?: unknown }).lost : undefined;
  if (l !== undefined && (!Array.isArray(l) || l.length !== 2)) throw new Error("battle record: lost must be two integers");
  const out: BattleRecord = {
    rules: record.rules,
    seed: checkSeed(record.seed),
    builds: [checkBuildShape(record.builds[0], "builds[0]"), checkBuildShape(record.builds[1], "builds[1]")],
    ...(w !== undefined ? { wins: [checkWins(w[0]), checkWins(w[1])] as [number, number] } : {}),
    ...(d !== undefined ? { day: checkDay(d) } : {}),
    ...(l !== undefined ? { lost: [checkWins(l[0]), checkWins(l[1])] as [number, number] } : {}),
  };
  // SCALE-2d (REQ-BFG-098, REQ-BFG-106; BRIEF-SCALE2d D5): with SCALE_RIGS on, the counts the record carries into the fight
  // are held to the run's own bounds (readCountsProblem); off, the record is read exactly as before
  if (scaleRules()) {
    const why = readCountsProblem(out.rules, out.day, out.wins, out.lost);
    if (why) throw new Error(why);
  }
  return out;
}

/**
 * SCALE-2d (REQ-BFG-098, REQ-BFG-106; BRIEF-SCALE2d D5): GRUDGE ROD reads a side's hearts lost and TROPHY CHAIN its wins, so a
 * forged count is a forged damage number. Why the counts a record (or a fight's inputs) under `rules` carries can't stand,
 * or null: hearts lost past heartsLostCapFor(rules, MAX_LIVES) (the run's start hearts less one); with the fight's day
 * (1..MAX_DAY; later modes' days are not bounded here) wins past day - 1, or more hearts lost than any run can have lost
 * before that day's fight (records.ts reachableRecords under `rules`: the start less its fewest hearts, LAST CHANCE
 * included). Read only while SCALE_RIGS is on.
 */
export function readCountsProblem(rules: unknown, day: number | undefined, wins?: readonly number[], lost?: readonly number[]): string | null {
  const cap = heartsLostCapFor(rules, MAX_LIVES);
  for (const n of lost ?? []) if (n > cap) return `battle record: hearts lost ${n} is past ${cap} (the run's start hearts less one)`;
  if (day === undefined || day > MAX_DAY) return null;
  for (const n of wins ?? []) if (n > day - 1) return `battle record: ${n} wins can't come before day ${day}'s fight`;
  if (lost?.length) {
    const start = heartsFor(rules) ? HEARTS_START : START_LIVES;
    const most = start - Math.min(...reachableRecords(day, { rules }).map((r) => r.lives));
    for (const n of lost) if (n > most) return `battle record: hearts lost ${n} is more than a run can lose before day ${day}'s fight (${most})`;
  }
  return null;
}

export function outcomeOf(b: Battle): BattleOutcome {
  return { winner: b.winner, ticks: b.ticks, hulls: [b.sides[0].hull.hp, b.sides[1].hull.hp] };
}

/** A fresh, unstepped Battle for animated playback of a stored record. */
export function replayBattle(record: BattleRecord): Battle {
  const r = checkRecord(record);
  // JOINS-1 (REQ-BFG-091): built under the record's own rules' answer to free joins (rulesGate.ts freeJoinsFor); the
  // battle reads the join pace and the joins once, where it starts (makeSide), so its playback keeps them
  // SCALE-2c M0 (REQ-BFG-098): both sides kept: JOINS-1's withFreeJoins around SCALE-2a's r.lost
  return withFreeJoins(() => new Battle(r.builds[0], r.builds[1], r.seed, r.wins, r.day, r.lost), freeJoinsFor(r.rules)); // RUNES-2a: r.wins for WARLORD'S DUE; HULL-1a: r.day; SCALE-2a: r.lost
}

/** Headless replay to the end; same result as the original simulate() call. */
export function replay(record: BattleRecord, maxTicks?: number): BattleOutcome {
  const r = checkRecord(record);
  // JOINS-1 (REQ-BFG-091): under the record's own rules' answer to free joins, as replayBattle
  // SCALE-2c M0 (REQ-BFG-098): both sides kept: JOINS-1's withFreeJoins around SCALE-2a's r.lost
  return outcomeOf(withFreeJoins(() => simulate(r.builds[0], r.builds[1], r.seed, maxTicks, r.wins, r.day, r.lost), freeJoinsFor(r.rules))); // HULL-1a: the record's day; SCALE-2a: its hearts lost
}
