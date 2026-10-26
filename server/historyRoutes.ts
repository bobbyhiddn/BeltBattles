// IDENT-2 (REQ-BFG-122 clause 4): the HTTP side of the run history, the way linkRoutes.ts is for the identity layer: app.ts keeps the
// route case and the wiring; the steps are here, the entry's form and caps in src/net/historyWire.ts, the objects in historyStore.ts.
// Every request is signed by a device key (x-bb-key, x-bb-sig) in its OWN domain (src/net/identity.ts), and the entry lands under the
// signer's CANONICAL player (links.ts playerOfKey): a linked key's history is its player's, a lone key's is its own. The steps, in the
// order of IDENT-1's routes (docs/ASYNC.md):
//   403  uploads are closed (the PUT only: the reads always work, so a player can always take their history away)
//   401  a signing header is missing or malformed (the body is not read), or the signature does not match in this route's domain
//   413  the body is over HISTORY_BODY_MAX_BYTES
//   400  the body is not UTF-8, or not exactly {"at","entry"} with the entry in its canonical form
//   422  `at` is more than 10 minutes from the server's clock
//   503  the tombstones are not loaded yet / storage is down (app.ts maps StorageError)
//   410  the signer or its player was deleted
//   422  a cap (checkEntry, naming the field), or a record that fails checkRecord (the server's own rules' only; no fight is run)
//
//   PUT /v1/history                        {"at":<ms>,"entry":{...}}  signed in "bb-history-1\n" over the exact body
//        -> 201 { id }  a new entry is stored (the first write wins)
//        -> 200 { id }  the same entry again (same canonical bytes): nothing is written
//        -> 409         a different entry for a known id: nothing is written
//        -> 422         ... also: the player already holds HISTORY_PLAYER_MAX entries and this one is older than all of them
//   GET /v1/history?at=<ms>                signed in "bb-history-get-1\n" over the exact text "/v1/history?at=<ms>"
//        -> 200 { entries: [{ id, finishedAt }] }   the player's entries, newest first, from ONE store LIST (no entry is read)
//   GET /v1/history?at=<ms>&id=<entry id>  signed in the same domain over "/v1/history?at=<ms>&id=<id>"
//        -> 200 { entry }  |  404 no such entry
// The request log prints the path only, so an entry id (in the query of a read) is never logged. A record under another rules version
// than the server's gets the rules-free shape check only (historyWire.ts) and is kept as it is: it is display data, a device replays a
// record under its own rules only, and no record is ever read by matchmaking or ranking.

import { HISTORY_GET_PREFIX, HISTORY_PREFIX, uploadHeaderError, verifyDomain } from "../src/net/identity";
import {
  HISTORY_BODY_MAX_BYTES, HISTORY_PLAYER_MAX, HistoryWireError, checkEntry, decodeEntryValue, encodeEntry, newestFirst, type HistoryEntry,
} from "../src/net/historyWire";
import { checkRecord } from "../src/net/replay";
import { RULES_VERSION } from "../src/sim/content";
import type { HistoryName, HistoryStore } from "./historyStore";
import { atProblem, fieldsOf, opened, type LinkRequest, type RouteReply } from "./linkRoutes";

export interface HistoryRequest extends LinkRequest {
  history: HistoryStore;
  log: (line: string) => void;
}

/** One write at a time for one player in this process, so two requests for one id cannot both pass the "known id" check. */
const busy = new Map<string, Promise<unknown>>();
async function exclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const run = (busy.get(key) ?? Promise.resolve()).then(fn, fn);
  const tail = run.catch(() => undefined);
  busy.set(key, tail);
  try {
    return await run;
  } finally {
    if (busy.get(key) === tail) busy.delete(key);
  }
}

/** A record of the server's own rules must pass checkRecord (the shape of both builds; no fight runs here). Another rules version's was
 *  shape-checked by the strict decode and is kept as it is. */
function recordProblem(e: HistoryEntry): string | null {
  for (let i = 0; i < e.dusks.length; i++) {
    const rec = e.dusks[i].record;
    if (rec === undefined || rec.rules !== RULES_VERSION) continue;
    try {
      checkRecord(rec);
    } catch (err) {
      return `entry.dusks[${i}].record: ${err instanceof Error ? err.message : "not a battle record"}`;
    }
  }
  return null;
}

export async function putHistory(r: HistoryRequest): Promise<RouteReply> {
  const o = await opened(r, HISTORY_PREFIX, HISTORY_BODY_MAX_BYTES, true); // 403, 401, 413, 400 (UTF-8)
  if ("status" in o) return o;
  const b = fieldsOf(o.text, ["at", "entry"]);
  if (typeof b === "string") return { status: 400, error: b };
  let entry: HistoryEntry;
  try {
    entry = decodeEntryValue(b.entry);
  } catch (e) {
    if (e instanceof HistoryWireError) return { status: e.status, error: e.message };
    throw e;
  }
  if (JSON.stringify(b.entry) !== encodeEntry(entry)) return { status: 400, error: "entry: not in the canonical form (fixed field order, no spaces)" };
  const late = atProblem(b.at, r.now());
  if (late) return { status: 422, error: late };
  await r.links.ensureFresh();
  const player = await r.links.playerOfKey(o.signer);
  if (r.links.isGone(o.signer) || r.links.isGone(player)) return { status: 410, error: "this player was deleted" };
  try {
    checkEntry(entry, r.now());
  } catch (e) {
    if (e instanceof HistoryWireError) return { status: e.status, error: e.message };
    throw e;
  }
  const why = recordProblem(entry);
  if (why) return { status: 422, error: why };
  return exclusive(player, () => store(r, player, entry));
}

/**
 * Store the entry under the player. The cost in store requests: one LIST of the player's names; a repeat or a conflict then reads the one
 * object (a GET); a new entry writes it (a PUT) and, when that passes the cap, deletes the oldest (a DELETE). So 2 requests for any PUT
 * and 3 for a new entry at the cap, besides the identity lookups (a cached key link; one HEAD when it is cold).
 */
async function store(r: HistoryRequest, player: string, entry: HistoryEntry): Promise<RouteReply> {
  const text = encodeEntry(entry);
  const names = await r.history.list(player);
  const known = names.find((n) => n.id === entry.id);
  if (known) {
    const stored = await r.history.get(player, known);
    if (stored !== null) {
      if (stored === text) return { status: 200, body: { id: entry.id } };
      return { status: 409, error: "a different entry is stored under this id" };
    }
    // listed but gone since the LIST (a delete on another machine): it is written below as a new one
  }
  const name: HistoryName = { finishedAt: entry.finishedAt, id: entry.id };
  if (!known && names.length >= HISTORY_PLAYER_MAX && newestFirst(name, names[names.length - 1]) >= 0) {
    return { status: 422, error: `history: this player already holds ${HISTORY_PLAYER_MAX} entries, all newer than this one` };
  }
  await r.history.put(player, name, text);
  // over the cap, the OLDEST go, after the write (a failed write loses nothing); the new entry always gets in
  const over = names.length + (known ? 0 : 1) - HISTORY_PLAYER_MAX;
  if (over > 0) {
    for (const old of names.slice(names.length - over)) if (old !== known) await r.history.delete(player, old);
  }
  return { status: 201, body: { id: entry.id } };
}

/** GET /v1/history: `signed` is the exact text the signature covers, the path and the query (`/v1/history?at=<ms>[&id=<entry id>]`). */
export async function getHistory(r: HistoryRequest, signed: string): Promise<RouteReply> {
  const unsigned = uploadHeaderError(r.key, r.sig);
  if (unsigned) return { status: 401, error: unsigned };
  const v = await verifyDomain(HISTORY_GET_PREFIX, new TextEncoder().encode(signed), r.key, r.sig);
  if (!v.ok) return { status: 401, error: v.error };
  const m = /^\/v1\/history\?at=(\d{1,16})(?:&id=([A-Za-z0-9_-]{1,64}))?$/.exec(signed);
  if (!m) return { status: 400, error: "query: expected exactly at=<milliseconds>, and optionally &id=<entry id>" };
  const late = atProblem(Number(m[1]), r.now());
  if (late) return { status: 422, error: late };
  await r.links.ensureFresh();
  const player = await r.links.playerOfKey(v.playerId);
  if (r.links.isGone(v.playerId) || r.links.isGone(player)) return { status: 410, error: "this player was deleted" };
  const names = await r.history.list(player);
  if (m[2] === undefined) return { status: 200, body: { entries: names.map((n) => ({ id: n.id, finishedAt: n.finishedAt })) } };
  const name = names.find((n) => n.id === m[2]);
  const text = name ? await r.history.get(player, name) : null;
  if (text === null) return { status: 404, error: "no such entry" };
  try {
    return { status: 200, body: { entry: JSON.parse(text) as Record<string, unknown> } };
  } catch {
    r.log("history store: skipping an unreadable entry");
    return { status: 404, error: "no such entry" };
  }
}
