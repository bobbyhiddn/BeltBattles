// IDENT-2 (REQ-BFG-122 clause 4): the device's list of finished runs, so the run history can follow the player. One localStorage key,
// beltbattles.history.v1. EVERY device writes it, online or not, linked or not: the runs played before a link must follow the player
// after it. It is the one new storage key a never-linked device gets, and that device still sends no request (net/historySync.ts).
//
//   {"v":1,"entries":[{"entry":{...},"sentTo":"<player>"?,"down":true?}, ...],"syncedAt":<ms>?}
//
//   entries    newest first (finishedAt, then id), at most HISTORY_LOCAL_MAX (50). Each `entry` is one finished run in its canonical wire form
//              (src/net/historyWire.ts): exactly the bytes a PUT sends. Each entry id is written ONCE: a second write of an id changes
//              nothing (a run's end is reached by the dusk and by the summary, a reload, CONTINUE). Written where profileChanged("end") is
//              called (styleFolds.ts): at a run's last win or last heart, at the summary, and at ABANDON (outcome "abandoned").
//              ENDLESS: the run's entry is written at its WIN_GOAL-th win and never changes; a run that took CONTINUE ENDLESS gets a
//              SECOND entry (id: the runId and "_endless") when the endless ends (ENDLESS OVER, or ABANDON in endless), holding only the
//              endless dusks, wins and score. So no entry is ever rewritten.
//   sentTo     the player this device has finished with the entry for: it was sent (200, 201), found stored already (200) or in conflict (409)
//              under that player, or the server refused its content for good (a 4xx). A device sends an entry to a player at most once.
//   down       the entry was DOWNLOADED from the player's history: it is never sent (it is another device's run, or this one's, already there).
//   syncedAt   when the history was last synced (the startup sync runs at most hourly: net/historySync.ts), the device clock.
// Size. An entry is at most 16 KB of canonical JSON (fitEntry drops the records, oldest dusk first). Locally the records of the whole key
// are kept under HISTORY_RECORD_BUDGET bytes: from the newest entry back, an entry keeps its records while they fit; older entries keep none
// (their dusk rows and their summary stay). A merge or a write never drops an entry this device has not sent to its player yet unless
// every entry is such (then the oldest goes: the cap is the cap).
// The key carries a version. A build never rewrites a newer version's store (it leaves it alone, as saveProfile does for the profile). A full
// localStorage (QuotaExceededError), a missing one or a broken value never breaks the save, the fold or the summary: every call here catches,
// and the first failure of a page load is logged once.

import { RULES_VERSION } from "../sim/content";
import type { Run } from "./run";
import {
  HISTORY_LOCAL_MAX, decodeEntryValue, encodeEntry, entryIdOf, fitEntry, isEntryId, newestFirst, runIdOk,
  type HistoryEntry, type HistoryKind, type HistoryOutcome,
} from "../net/historyWire";
import { LINK_KEY, parseLink } from "../net/linkState";

export const HISTORY_KEY = "beltbattles.history.v1";
export const HISTORY_V = 1;
/** The bytes of battle records the whole key may hold (about 256 KB): the newest entries keep theirs first. */
export const HISTORY_RECORD_BUDGET = 256 * 1024;

export type HistoryStorage = Pick<Storage, "getItem" | "setItem">;

/** One entry as the device holds it. */
export interface LocalEntry {
  entry: HistoryEntry;
  sentTo?: string;
  down?: true;
}

export interface HistoryState {
  entries: LocalEntry[];
  syncedAt?: number;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** localStorage, or null where a page has none or refuses it. */
export function browserHistoryStorage(): HistoryStorage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

let warned = false;
/** The first storage failure of a page load is logged, once; the rest are silent. */
function warnOnce(why: string): void {
  if (warned) return;
  warned = true;
  try {
    console.warn(`run history: ${why}`);
  } catch {
    /* no console */
  }
}
/** FOR TESTS: forget that a failure was logged. */
export function resetHistoryWarning(): void {
  warned = false;
}

// -------------------------------------------------------------------------------------------------------------- the store

/** The stored history. `newer`: the key holds a newer version's store, which this build leaves alone (no read of its entries, no write).
 *  A missing, unreadable or broken value reads as an empty history (the next write replaces it). Never throws. */
export function readHistory(store: HistoryStorage | null | undefined = browserHistoryStorage()): { state: HistoryState; newer: boolean } {
  const none = { state: { entries: [] as LocalEntry[] }, newer: false };
  let text: string | null = null;
  try {
    text = store ? store.getItem(HISTORY_KEY) : null;
  } catch {
    return none;
  }
  if (text === null || text === "") return none;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return none;
  }
  if (!isObj(raw)) return none;
  if (typeof raw.v === "number" && raw.v > HISTORY_V) return { state: { entries: [] }, newer: true };
  if (raw.v !== HISTORY_V || !Array.isArray(raw.entries)) return none;
  const entries: LocalEntry[] = [];
  const seen = new Set<string>();
  for (const item of raw.entries) {
    try {
      if (!isObj(item)) continue;
      const entry = decodeEntryValue(item.entry);
      if (!isEntryId(entry.id) || entry.id !== entryIdOf(entry.runId, entry.kind) || seen.has(entry.id)) continue;
      seen.add(entry.id);
      const local: LocalEntry = { entry };
      if (typeof item.sentTo === "string" && isEntryId(item.sentTo)) local.sentTo = item.sentTo;
      if (item.down === true) local.down = true;
      entries.push(local);
    } catch {
      /* an entry this build cannot read is dropped at the next write */
    }
  }
  entries.sort((a, b) => newestFirst(a.entry, b.entry));
  const syncedAt = typeof raw.syncedAt === "number" && Number.isSafeInteger(raw.syncedAt) && raw.syncedAt >= 0 ? raw.syncedAt : undefined;
  return { state: { entries, ...(syncedAt !== undefined ? { syncedAt } : {}) }, newer: false };
}

/** Store the history. False when storage refused it (full, or none): the failure is logged once. Never throws. */
export function writeHistory(state: HistoryState, store: HistoryStorage | null | undefined = browserHistoryStorage()): boolean {
  try {
    if (!store) return false;
    const items = state.entries.map((l) =>
      `{"entry":${encodeEntry(l.entry)}${l.sentTo ? `,"sentTo":${JSON.stringify(l.sentTo)}` : ""}${l.down ? ',"down":true' : ""}}`);
    store.setItem(HISTORY_KEY, `{"v":${HISTORY_V},"entries":[${items.join(",")}]${state.syncedAt !== undefined ? `,"syncedAt":${state.syncedAt}` : ""}}`);
    return true;
  } catch (e) {
    warnOnce(e instanceof Error ? e.name : "storage refused the write");
    return false;
  }
}

/** The bytes of battle records an entry holds (JSON text length: records are ASCII). */
function recordBytes(e: HistoryEntry): number {
  let n = 0;
  for (const d of e.dusks) if (d.record !== undefined) n += JSON.stringify(d.record).length;
  return n;
}

/** The entry without its records (the dusk rows and the summary stay). */
function withoutRecords(e: HistoryEntry): HistoryEntry {
  return e.dusks.some((d) => d.record !== undefined) ? { ...e, dusks: e.dusks.map((d) => ({ day: d.day, outcome: d.outcome })) } : e;
}

/** The records are kept from the newest entry back while they fit the budget; older entries keep none. */
function applyBudget(entries: LocalEntry[]): void {
  let used = 0;
  let spent = false;
  for (const l of entries) {
    const n = recordBytes(l.entry);
    if (!spent && used + n <= HISTORY_RECORD_BUDGET) used += n;
    else {
      spent = true;
      l.entry = withoutRecords(l.entry);
    }
  }
}

/** Is this entry one the device still has to send to `player`? (A local one not yet sent to that player; a downloaded one never.) */
const isUnsent = (l: LocalEntry, player: string | null): boolean => !l.down && (player === null || l.sentTo !== player);

/** Keep at most HISTORY_LOCAL_MAX entries (the list is newest first): the OLDEST that is not waiting to be sent goes first, and an entry
 *  not yet sent to `player` goes only when every entry is such. */
function trim(entries: LocalEntry[], player: string | null): LocalEntry[] {
  for (let i = entries.length - 1; i >= 0 && entries.length > HISTORY_LOCAL_MAX; i--) if (!isUnsent(entries[i], player)) entries.splice(i, 1);
  if (entries.length > HISTORY_LOCAL_MAX) entries.length = HISTORY_LOCAL_MAX;
  return entries;
}

/** The player this device's link record names for `store`, or null (never linked). */
function linkedTo(store: HistoryStorage): string | null {
  try {
    return parseLink(store.getItem(LINK_KEY))?.player ?? null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------------------------------------------ writing a run's end

/** A copy that shares nothing with the run (the run goes on being saved and changed). */
const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/**
 * The entry of a run: kind "run" (the run's own dusks), or "endless" (a run that took CONTINUE ENDLESS: its endless dusks, endless wins
 * and hearts). Null when the run cannot carry one (an id the wire refuses, or an endless of a run that never took it). Fitted to 16 KB.
 */
export function entryFromRun(run: Run, kind: HistoryKind, now: number): HistoryEntry | null {
  if (!runIdOk(run.runId)) return null;
  const endless = run.endlessRun;
  if (kind === "endless" && !endless) return null;
  const outcome: HistoryOutcome = kind === "endless"
    ? (run.over ? "over" : "abandoned")
    : run.over === "won" ? "won" : run.over === "complete" ? "complete" : run.over === "lost" ? "lost" : "abandoned";
  const dusks = run.history.filter((h) => (kind === "endless") === (h.endless === true))
    .map((h) => (h.record ? { day: h.day, outcome: h.outcome, record: copy(h.record) } : { day: h.day, outcome: h.outcome }));
  return fitEntry({
    id: entryIdOf(run.runId, kind), runId: run.runId, kind, rules: RULES_VERSION, hero: run.hero, outcome,
    wins: kind === "endless" ? endless!.wins : run.wins, days: Math.max(1, run.day), lives: Math.max(0, run.lives),
    hearts: run.hearts === true || kind === "endless", finishedAt: now, dusks,
  });
}

export interface HistoryDeps {
  store?: HistoryStorage | null;
  now?: () => number;
}

/**
 * A run ended (styleFolds.ts calls this beside profileChanged("end")): write its entry, once. The kind follows the run: a run that took
 * CONTINUE ENDLESS ends its ENDLESS here (its own entry was written at its WIN_GOAL-th win); every other run ends as itself. ABANDON (the
 * run is not over) writes outcome "abandoned". Returns the ids written (none when the id is known already, the store is a newer
 * version's, or storage refused). Never throws.
 */
export function recordRunEnd(run: Run, deps: HistoryDeps = {}): string[] {
  try {
    const store = deps.store === undefined ? browserHistoryStorage() : deps.store;
    if (!store) return [];
    const entry = entryFromRun(run, run.endlessRun ? "endless" : "run", (deps.now ?? (() => Date.now()))());
    if (!entry) return [];
    const { state, newer } = readHistory(store);
    if (newer || state.entries.some((l) => l.entry.id === entry.id)) return [];
    state.entries.push({ entry });
    state.entries.sort((a, b) => newestFirst(a.entry, b.entry));
    trim(state.entries, linkedTo(store));
    applyBudget(state.entries);
    return writeHistory(state, store) && state.entries.some((l) => l.entry.id === entry.id) ? [entry.id] : [];
  } catch {
    return [];
  }
}

// ------------------------------------------------------------------------------------------------------- the sync's half

/** The entries still to send to `player`, newest first: local ones (never a downloaded one) not yet sent to that player. */
export function unsentFor(player: string, store: HistoryStorage | null | undefined = browserHistoryStorage()): HistoryEntry[] {
  const { state, newer } = readHistory(store);
  return newer ? [] : state.entries.filter((l) => isUnsent(l, player)).map((l) => l.entry);
}

/** Mark these entries as finished with for `player` (sent, known to be stored, or refused for good). */
export function markSent(ids: readonly string[], player: string, store: HistoryStorage | null | undefined = browserHistoryStorage()): void {
  try {
    const { state, newer } = readHistory(store);
    if (newer) return;
    let changed = false;
    for (const l of state.entries) {
      if (ids.includes(l.entry.id) && !l.down && l.sentTo !== player) {
        l.sentTo = player;
        changed = true;
      }
    }
    if (changed) writeHistory(state, store);
  } catch {
    /* never breaks the caller */
  }
}

/** Merge downloaded entries by id: a union, an entry the device has stays as it is, the newest HISTORY_LOCAL_MAX are kept, and an entry not
 *  yet sent to `player` is never dropped for a downloaded one. Returns how many of them are held now. Never throws. */
export function mergeDownloaded(got: readonly HistoryEntry[], player: string | null, store: HistoryStorage | null | undefined = browserHistoryStorage()): number {
  try {
    const { state, newer } = readHistory(store);
    if (newer) return 0;
    const have = new Set(state.entries.map((l) => l.entry.id));
    const added: string[] = [];
    for (const e of got) {
      if (have.has(e.id)) continue;
      have.add(e.id);
      state.entries.push({ entry: e, down: true });
      added.push(e.id);
    }
    if (!added.length) return 0;
    state.entries.sort((a, b) => newestFirst(a.entry, b.entry));
    trim(state.entries, player);
    applyBudget(state.entries);
    if (!writeHistory(state, store)) return 0;
    return state.entries.filter((l) => added.includes(l.entry.id)).length;
  } catch {
    return 0;
  }
}

/** Stamp the time of a sync (the startup sync's hourly gate). */
export function stampSynced(at: number, store: HistoryStorage | null | undefined = browserHistoryStorage()): void {
  try {
    const { state, newer } = readHistory(store);
    if (newer) return;
    state.syncedAt = at;
    writeHistory(state, store);
  } catch {
    /* never breaks the caller */
  }
}
