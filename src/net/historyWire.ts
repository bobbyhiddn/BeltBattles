// IDENT-2 (REQ-BFG-122 clause 4): run history follows the player. The wire form of ONE finished run, the pure module the device's
// store (src/game/history.ts), the client (historyClient.ts, historySync.ts) and the server (server/historyRoutes.ts) share, as
// profileWire.ts is for the profile. Pure code: no I/O, no clock (the caller passes `now`), no DOM, no sim value. It holds
//   - the entry and its canonical form: exactly the fields below, in this order, no spaces; the device signs the exact bytes and
//     the server accepts no other text for the same entry (one entry, one body);
//   - the strict decode (400: unknown or missing fields, wrong types, anything that is not the canonical text);
//   - the plausibility caps (422, naming the field): garbage is refused, play is not proved. A cap never refuses an honest entry
//     from any rules version a phone app may still run, so it names no hero and no rules version, only shapes and ranges;
//   - fitEntry: an entry is at most HISTORY_ENTRY_MAX_BYTES of canonical JSON; above that the records go, oldest dusk first.
// An entry is DISPLAY DATA. A dusk's battle record is kept as it was made: a device replays a record only under its own rules, the
// server runs no fight, and nothing here is read by matchmaking or ranking.
//
//   {"id","runId","kind","rules","hero","outcome","wins","days","lives","hearts","finishedAt","dusks":[{"day","outcome","record"?}]}
//
//   id          the entry's id: the runId of a finished run (kind "run"), or the runId plus END_SUFFIX (kind "endless": the second entry
//               of a run that took CONTINUE ENDLESS). END_SUFFIX is a character no runId can hold (run.ts newRunId is base 36 and "-")
//   kind        "run" | "endless";  outcome  won | complete | lost | abandoned (a run) | over | abandoned (an endless)
//   wins        the run's wins (a run), or the endless wins, the score (an endless);  days  the last day reached
//   lives       the hearts or lives left (hearts: true when they are hearts);  finishedAt  the device clock, ms
//   dusks       one row per dusk of the run (or of its endless), with the battle record when the device made one (online play)
// No player id, no name, no key and no address is in an entry: a deleted player's id must not live on in someone else's history.

import type { BattleRecord } from "../sim/battle";

/** An entry is at most this many bytes of canonical JSON (UTF-8). */
export const HISTORY_ENTRY_MAX_BYTES = 16_000;
/** The signed body {at, entry} is at most this many bytes (the entry plus a few dozen for `at`). */
export const HISTORY_BODY_MAX_BYTES = 16_384;
/** The most entries the server keeps for one player; at the cap the oldest (by finishedAt) goes. */
export const HISTORY_PLAYER_MAX = 200;
/** The most entries a device keeps. */
export const HISTORY_LOCAL_MAX = 50;
/** The id suffix of an endless entry. No runId can end in it: newRunId writes base 36 digits and "-" only. */
export const HISTORY_END_SUFFIX = "_endless";

/** Plausibility ceilings (data safety, not game rules): a run has no day cap (RUN-1) and an endless has its own, so these are far past play. */
export const HISTORY_MAX_WINS = 99;
export const HISTORY_MAX_DAYS = 99;
export const HISTORY_MAX_DUSKS = 99;
export const HISTORY_MAX_LIVES = 99;
/** finishedAt may not be earlier than this (2026-01-01 UTC): the game has no history before it has a history. */
export const HISTORY_EARLIEST_AT = Date.UTC(2026, 0, 1);
/** finishedAt may be at most this far past the server's clock: the replay bound of the signed requests (server/links.ts AT_WINDOW_MS). */
export const HISTORY_AHEAD_MS = 10 * 60_000;

export const HISTORY_KINDS = ["run", "endless"] as const;
export type HistoryKind = (typeof HISTORY_KINDS)[number];
export const HISTORY_OUTCOMES: Record<HistoryKind, readonly string[]> = {
  run: ["won", "complete", "lost", "abandoned"],
  endless: ["over", "abandoned"],
};
export type HistoryOutcome = "won" | "complete" | "lost" | "abandoned" | "over";
export const DUSK_OUTCOMES = ["win", "loss", "draw"] as const;
export type DuskOutcome = (typeof DUSK_OUTCOMES)[number];

export interface HistoryDusk {
  day: number;
  outcome: DuskOutcome;
  /** The dusk's battle record (src/sim/battle.ts BattleRecord), or absent: offline play, or dropped to fit. Display data. */
  record?: BattleRecord;
}

export interface HistoryEntry {
  id: string;
  runId: string;
  kind: HistoryKind;
  rules: string;
  hero: string;
  outcome: HistoryOutcome;
  wins: number;
  days: number;
  lives: number;
  hearts: boolean;
  finishedAt: number;
  dusks: HistoryDusk[];
}

/** A refusal with the HTTP status it carries: 400 (not exactly an entry) or 422 (a cap). */
export class HistoryWireError extends Error {
  constructor(readonly status: 400 | 422, message: string) {
    super(message);
    this.name = "HistoryWireError";
  }
}
const bad = (m: string): HistoryWireError => new HistoryWireError(400, m);
const cap = (m: string): HistoryWireError => new HistoryWireError(422, m);

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const HERO = /^[a-z][a-z0-9_-]{0,23}$/;
const RULES = /^[A-Za-z0-9._-]{1,32}$/;

/** The entry id of a run's entry of this kind. */
export const entryIdOf = (runId: string, kind: HistoryKind): string => (kind === "run" ? runId : runId + HISTORY_END_SUFFIX);
/** Can this run id carry an entry? (a base 36 id never does not; a hand-made one might: then the run has no entry). */
export const runIdOk = (runId: string): boolean => ID.test(runId) && !runId.endsWith(HISTORY_END_SUFFIX) && ID.test(runId + HISTORY_END_SUFFIX);
export const isEntryId = (x: unknown): x is string => typeof x === "string" && ID.test(x);

const ENTRY_KEYS = ["id", "runId", "kind", "rules", "hero", "outcome", "wins", "days", "lives", "hearts", "finishedAt", "dusks"] as const;

/** The canonical JSON text of an entry: the fixed field order, no spaces. */
export function encodeEntry(e: HistoryEntry): string {
  return JSON.stringify({
    id: e.id, runId: e.runId, kind: e.kind, rules: e.rules, hero: e.hero, outcome: e.outcome, wins: e.wins, days: e.days, lives: e.lives,
    hearts: e.hearts, finishedAt: e.finishedAt,
    dusks: e.dusks.map((d) => (d.record === undefined ? { day: d.day, outcome: d.outcome } : { day: d.day, outcome: d.outcome, record: d.record })),
  });
}

/** The UTF-8 length of a text. */
export const byteLength = (s: string): number => new TextEncoder().encode(s).length;

/**
 * The entry as it travels: at most `max` bytes of canonical JSON. Above that the records go, the OLDEST dusk's first, until it fits; the
 * summary (every field but the records) and the dusk rows are never dropped. Returns the same object when nothing needs to go.
 */
export function fitEntry(e: HistoryEntry, max: number = HISTORY_ENTRY_MAX_BYTES): HistoryEntry {
  if (byteLength(encodeEntry(e)) <= max) return e;
  const dusks = e.dusks.map((d) => ({ ...d }));
  const out = { ...e, dusks };
  for (const d of dusks) {
    if (d.record === undefined) continue;
    delete d.record;
    if (byteLength(encodeEntry(out)) <= max) return out;
  }
  return out; // no record left: the summary alone (a few KB at the most, under the caps below)
}

// ---------------------------------------------------------------------------------------------------- the strict decode

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

function natural(x: unknown, name: string): number {
  if (typeof x !== "number" || !Number.isSafeInteger(x) || x < 0) throw bad(`${name}: expected a non-negative integer`);
  return x;
}
function text(x: unknown, name: string): string {
  if (typeof x !== "string") throw bad(`${name}: expected text`);
  return x;
}

/**
 * The rules-free shape of a battle record, or the reason it has none: an object with a short `rules` text, an integer `seed` and two
 * build objects. Everything else in it is kept as it is: it may be a record of rules this build does not know.
 */
export function recordShapeProblem(r: unknown): string | null {
  if (!isObj(r)) return "expected an object";
  if (typeof r.rules !== "string" || !RULES.test(r.rules)) return "rules: expected a rules version";
  if (typeof r.seed !== "number" || !Number.isInteger(r.seed) || r.seed < 0 || r.seed > 0xffffffff) return "seed: expected an integer in 0..2^32-1";
  if (!Array.isArray(r.builds) || r.builds.length !== 2 || !r.builds.every(isObj)) return "builds: expected two builds";
  return null;
}

/** A parsed entry, shape-checked: 400 for anything that is not exactly the form. It applies no cap (checkEntry does) and does not look
 *  at the text (decodeEntry does). */
export function decodeEntryValue(raw: unknown): HistoryEntry {
  if (!isObj(raw)) throw bad("entry: expected an object");
  for (const k of Object.keys(raw)) if (!(ENTRY_KEYS as readonly string[]).includes(k)) throw bad(`entry.${k}: unknown field`);
  for (const k of ENTRY_KEYS) if (!Object.prototype.hasOwnProperty.call(raw, k)) throw bad(`entry.${k}: missing`);
  if (typeof raw.hearts !== "boolean") throw bad("entry.hearts: expected true or false");
  if (!Array.isArray(raw.dusks)) throw bad("entry.dusks: expected a list");
  if (raw.dusks.length > HISTORY_MAX_DUSKS) throw cap(`entry.dusks: ${raw.dusks.length} rows is over the ceiling ${HISTORY_MAX_DUSKS}`);
  const dusks: HistoryDusk[] = raw.dusks.map((d, i) => {
    const where = `entry.dusks[${i}]`;
    if (!isObj(d)) throw bad(`${where}: expected an object`);
    for (const k of Object.keys(d)) if (k !== "day" && k !== "outcome" && k !== "record") throw bad(`${where}.${k}: unknown field`);
    if (!Object.prototype.hasOwnProperty.call(d, "day") || !Object.prototype.hasOwnProperty.call(d, "outcome")) throw bad(`${where}: expected day and outcome`);
    const out: HistoryDusk = { day: natural(d.day, `${where}.day`), outcome: text(d.outcome, `${where}.outcome`) as DuskOutcome };
    if (Object.prototype.hasOwnProperty.call(d, "record")) {
      const why = recordShapeProblem(d.record);
      if (why) throw bad(`${where}.record: ${why}`);
      out.record = d.record as BattleRecord;
    }
    return out;
  });
  return {
    id: text(raw.id, "entry.id"), runId: text(raw.runId, "entry.runId"), kind: text(raw.kind, "entry.kind") as HistoryKind,
    rules: text(raw.rules, "entry.rules"), hero: text(raw.hero, "entry.hero"), outcome: text(raw.outcome, "entry.outcome") as HistoryOutcome,
    wins: natural(raw.wins, "entry.wins"), days: natural(raw.days, "entry.days"), lives: natural(raw.lives, "entry.lives"), hearts: raw.hearts,
    finishedAt: natural(raw.finishedAt, "entry.finishedAt"), dusks,
  };
}

/** The entry's text -> an entry, or a HistoryWireError. The text must be the canonical form exactly: one entry, one body. */
export function decodeEntry(t: string): HistoryEntry {
  let raw: unknown;
  try {
    raw = JSON.parse(t);
  } catch {
    throw bad("entry: not JSON");
  }
  const e = decodeEntryValue(raw);
  if (encodeEntry(e) !== t) throw bad("entry: not in the canonical form (fixed field order, no spaces)");
  return e;
}

// ---------------------------------------------------------------------------------------------- the plausibility caps

/**
 * The caps (422, one reason naming the field). `now` is the server's clock in ms. An entry that decodes and passes is one an honest
 * device can make; it is not proof of play. The records are not looked at here (the server runs checkRecord on its own rules').
 */
export function checkEntry(e: HistoryEntry, now: number, aheadMs: number = HISTORY_AHEAD_MS): void {
  if (!HISTORY_KINDS.includes(e.kind)) throw cap(`entry.kind: ${JSON.stringify(e.kind)} is not one of ${HISTORY_KINDS.join(", ")}`);
  if (!HISTORY_OUTCOMES[e.kind].includes(e.outcome)) throw cap(`entry.outcome: ${JSON.stringify(e.outcome)} is not an outcome of a ${e.kind} (${HISTORY_OUTCOMES[e.kind].join(", ")})`);
  if (!ID.test(e.runId)) throw cap("entry.runId: expected 1 to 64 letters, digits, - or _");
  if (e.kind === "run" && e.runId.endsWith(HISTORY_END_SUFFIX)) throw cap(`entry.runId: a run's id cannot end in ${HISTORY_END_SUFFIX}`);
  if (e.id !== entryIdOf(e.runId, e.kind)) throw cap(`entry.id: expected ${e.kind === "run" ? "the runId" : `the runId and ${HISTORY_END_SUFFIX}`}`);
  if (!ID.test(e.id)) throw cap("entry.id: expected 1 to 64 letters, digits, - or _");
  if (!RULES.test(e.rules)) throw cap("entry.rules: expected a rules version (1 to 32 letters, digits, . - or _)");
  if (!HERO.test(e.hero)) throw cap("entry.hero: expected a hero id (a lowercase word of at most 24 characters)");
  if (e.wins > HISTORY_MAX_WINS) throw cap(`entry.wins: ${e.wins} is over the ceiling ${HISTORY_MAX_WINS}`);
  if (e.days < 1 || e.days > HISTORY_MAX_DAYS) throw cap(`entry.days: ${e.days} is not in 1..${HISTORY_MAX_DAYS}`);
  if (e.lives > HISTORY_MAX_LIVES) throw cap(`entry.lives: ${e.lives} is over the ceiling ${HISTORY_MAX_LIVES}`);
  if (e.dusks.length > HISTORY_MAX_DUSKS) throw cap(`entry.dusks: ${e.dusks.length} rows is over the ceiling ${HISTORY_MAX_DUSKS}`);
  if (e.wins > e.dusks.length) throw cap(`entry.wins: ${e.wins} is more than the ${e.dusks.length} dusk rows`);
  let prev = 0;
  e.dusks.forEach((d, i) => {
    if (!DUSK_OUTCOMES.includes(d.outcome)) throw cap(`entry.dusks[${i}].outcome: ${JSON.stringify(d.outcome)} is not win, loss or draw`);
    if (d.day < 1 || d.day > e.days) throw cap(`entry.dusks[${i}].day: ${d.day} is not in 1..${e.days}`);
    if (d.day <= prev) throw cap(`entry.dusks[${i}].day: ${d.day} does not follow day ${prev}`);
    prev = d.day;
  });
  if (e.finishedAt < HISTORY_EARLIEST_AT || e.finishedAt > now + aheadMs) throw cap("entry.finishedAt: not between 2026-01-01 and the server's clock");
  const size = byteLength(encodeEntry(e));
  if (size > HISTORY_ENTRY_MAX_BYTES) throw cap(`entry: ${size} bytes is over ${HISTORY_ENTRY_MAX_BYTES}`);
}

/** Newest first: by finishedAt, then by id (the order of the server's list and of the object names). */
export function newestFirst(a: { finishedAt: number; id: string }, b: { finishedAt: number; id: string }): number {
  return b.finishedAt - a.finishedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
