// IDENT-2 (REQ-BFG-122 clause 4): the client half of the run history. Each call signs with the device key, in the route's own domain
// (src/net/identity.ts), and never throws: every failure is a value, { ok: false, status?, error }, and `status` is the server's HTTP
// status (absent: no answer, a timeout or a refused connection). The server's words are in server/historyRoutes.ts; net/historySync.ts
// decides what each status means for the device's list.
//
//   putHistoryEntry   PUT /v1/history        {"at":<ms>,"entry":{...}} signed in "bb-history-1\n" over the exact bytes sent:
//                                            201 stored, 200 the same entry again (nothing written), 409 a different entry for that id
//   listHistory       GET /v1/history?at=    signed in "bb-history-get-1\n" over the exact text "/v1/history?at=<ms>": the player's
//                                            entries, newest first, ids and finishedAt only
//   getHistoryEntry   GET /v1/history?at=<ms>&id=<id>   the same domain over that exact text: one entry; it is shape-checked and held to
//                                            the same caps the server holds an upload to before the caller may keep it
// The entry id of a read is in the query, which the server's request log never prints.

import { HISTORY_GET_PREFIX, HISTORY_PREFIX, KEY_HEADER, SIG_HEADER, type Identity, type SignDomain } from "./identity";
import { HISTORY_BODY_MAX_BYTES, HistoryWireError, checkEntry, decodeEntryValue, encodeEntry, isEntryId, type HistoryEntry } from "./historyWire";

export type HistoryFailure = { ok: false; status?: number; error: string };

export interface HistoryNetDeps {
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

export type PutHistoryResult = { ok: true; created: boolean } | HistoryFailure;
export type ListHistoryResult = { ok: true; entries: { id: string; finishedAt: number }[] } | HistoryFailure;
export type GetHistoryResult = { ok: true; entry: HistoryEntry } | HistoryFailure;

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

function errText(e: unknown): string {
  const name = isObj(e) ? e.name : undefined;
  if (name === "AbortError" || name === "TimeoutError") return "timeout";
  return e instanceof Error ? e.message : String(e);
}

const nowMs = (deps: HistoryNetDeps): number => Math.floor((deps.now ?? (() => Date.now()))());

/** One request: the status and the JSON object of the answer ({} for anything else), or the failure when there was no answer. */
async function go(baseUrl: string, path: string, init: RequestInit, deps: HistoryNetDeps): Promise<{ status: number; json: Record<string, unknown> } | HistoryFailure> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), Math.max(1, deps.timeoutMs ?? 5000));
  try {
    const doFetch = deps.fetch ?? ((input: RequestInfo | URL, i?: RequestInit) => fetch(input, i));
    const res = await doFetch(baseUrl.replace(/\/+$/, "") + path, { ...init, signal: ctl.signal });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      const parsed: unknown = text ? JSON.parse(text) : {};
      if (isObj(parsed)) json = parsed;
    } catch {
      /* a non-JSON error page */
    }
    return { status: res.status, json };
  } catch (e) {
    return { ok: false, error: errText(e) };
  } finally {
    clearTimeout(timer);
  }
}

const failure = (status: number, json: Record<string, unknown>): HistoryFailure => ({ ok: false, status, error: typeof json.error === "string" ? json.error : `HTTP ${status}` });

/** Sign `bytes` in `domain` and return the two headers. */
async function signed(id: Identity, bytes: Uint8Array, domain: SignDomain): Promise<Record<string, string>> {
  const { key, sig } = await id.sign(bytes, domain);
  return { [KEY_HEADER]: key, [SIG_HEADER]: sig };
}

/** Send one entry. The body is the canonical {"at":<ms>,"entry":<the entry's canonical text>}; one over the size limit is not sent. */
export async function putHistoryEntry(baseUrl: string, id: Identity, entry: HistoryEntry, deps: HistoryNetDeps = {}): Promise<PutHistoryResult> {
  try {
    const body = new TextEncoder().encode(`{"at":${nowMs(deps)},"entry":${encodeEntry(entry)}}`);
    if (body.length > HISTORY_BODY_MAX_BYTES) return { ok: false, error: `the entry is over ${HISTORY_BODY_MAX_BYTES} bytes: not sent` };
    const r = await go(baseUrl, "/v1/history", { method: "PUT", headers: { "content-type": "application/json", ...(await signed(id, body, HISTORY_PREFIX)) }, body }, deps);
    if ("ok" in r) return r;
    if (r.status === 200 || r.status === 201) return { ok: true, created: r.status === 201 };
    return failure(r.status, r.json);
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}

/** GET with a signed path and query: `signedText` is exactly what is signed and what is requested. */
async function read(baseUrl: string, id: Identity, signedText: string, deps: HistoryNetDeps): Promise<{ status: number; json: Record<string, unknown> } | HistoryFailure> {
  return go(baseUrl, signedText, { method: "GET", headers: { accept: "application/json", ...(await signed(id, new TextEncoder().encode(signedText), HISTORY_GET_PREFIX)) } }, deps);
}

/** The player's entries, newest first (ids and finishedAt only); an item the answer holds that is not exactly an id and a time is left out. */
export async function listHistory(baseUrl: string, id: Identity, deps: HistoryNetDeps = {}): Promise<ListHistoryResult> {
  try {
    const r = await read(baseUrl, id, `/v1/history?at=${nowMs(deps)}`, deps);
    if ("ok" in r) return r;
    if (r.status !== 200) return failure(r.status, r.json);
    if (!Array.isArray(r.json.entries)) return { ok: false, status: 200, error: "the answer holds no list" };
    const entries: { id: string; finishedAt: number }[] = [];
    for (const e of r.json.entries) {
      if (isObj(e) && isEntryId(e.id) && typeof e.finishedAt === "number" && Number.isSafeInteger(e.finishedAt) && e.finishedAt >= 0) entries.push({ id: e.id, finishedAt: e.finishedAt });
    }
    return { ok: true, entries };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}

/** One entry by id. 404: unknown (it may have left the player's history since the list). The entry is decoded strictly and held to the caps. */
export async function getHistoryEntry(baseUrl: string, id: Identity, entryId: string, deps: HistoryNetDeps = {}): Promise<GetHistoryResult> {
  try {
    if (!isEntryId(entryId)) return { ok: false, error: "not an entry id" };
    const r = await read(baseUrl, id, `/v1/history?at=${nowMs(deps)}&id=${entryId}`, deps);
    if ("ok" in r) return r;
    if (r.status !== 200) return failure(r.status, r.json);
    try {
      const entry = decodeEntryValue(r.json.entry);
      checkEntry(entry, nowMs(deps));
      if (entry.id !== entryId) return { ok: false, status: 200, error: "the answer is another entry" };
      return { ok: true, entry };
    } catch (e) {
      return { ok: false, status: 200, error: e instanceof HistoryWireError ? e.message : "the entry could not be read" };
    }
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}
