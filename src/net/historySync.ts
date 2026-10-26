// IDENT-2 (REQ-BFG-122 clause 4): the run history follows the player. The device's list of finished runs (src/game/history.ts) goes up under
// the canonical player and the player's other devices' runs come down, with the profile sync's rules:
//   WHO       only a LINKED device: a beltbattles.link.v1 record for its own key, written by SHOW MY CODE or ENTER A CODE (linkClient.ts). A
//             device that was never linked sends and reads nothing, as in 0.9.13 and IDENT-1: no request, and no write but the history key.
//   UPLOAD    its entries not yet sent to its player, newest first, at most HISTORY_UPLOADS_PER_TRIGGER (10) a trigger, one PUT each. An
//             entry is marked with the player it was sent to on a 200, 201 or 409 (and when the server refuses its content for good: a 4xx
//             that is not about the clock), so a device sends an entry to a player at most once, and never one it downloaded: NO LOOP.
//   DOWNLOAD  the player's list (one request, newest first), then the entries this device lacks, newest first, at most
//             HISTORY_DOWNLOADS_PER_SYNC (10) a sync, one GET each; merged by id (a union: an entry the device has stays as it is), the
//             newest 50 kept, and no entry this device has not sent yet is ever dropped for them (src/game/history.ts). An entry that
//             would not be kept (older than every entry the device can drop) is not asked for.
//   WHEN      after a link (ENTER A CODE, a Steam link) and after SHOW MY CODE (so the player's first device sends the history the second
//             will want): upload and download. At startup, once a page load, at most hourly by history's own time in beltbattles.history.v1:
//             upload and download. At a run's end: the new entry is sent (upload only) when the device is linked and the session has an
//             identity; otherwise the next trigger sends it. Every send is fire and forget: it never blocks the summary or the title.
//   STOPS     a 404 or 405 (a server without these routes) stops the history requests to that server for the page load, and keeps the
//             entries; a 401, a 403 (uploads closed), a 429, a 5xx or no answer ends the trigger and keeps them; a 410 does what a 410 to a
//             ghost upload does (forgetDeletedPlayer: the device drops its dead key, mirror and link record).
// Nothing here throws. The device's profile counters and the personal best are not changed by this module (see REPORT section 10).

import type { Run } from "../game/run";
import { online, type Session } from "../game/session";
import {
  browserHistoryStorage, markSent, mergeDownloaded, readHistory, recordRunEnd, stampSynced, unsentFor, type HistoryStorage,
} from "../game/history";
import type { Identity } from "./identity";
import { forgetDeletedPlayer, type LinkDeps } from "./linkClient";
import { browserLinkStorage, readLink, type LinkStorage } from "./linkState";
import { getHistoryEntry, listHistory, putHistoryEntry, type HistoryNetDeps } from "./historyClient";
import { HISTORY_LOCAL_MAX, newestFirst, type HistoryEntry } from "./historyWire";

/** The most entries one trigger sends. */
export const HISTORY_UPLOADS_PER_TRIGGER = 10;
/** The most entries one sync downloads. */
export const HISTORY_DOWNLOADS_PER_SYNC = 10;
/** The startup sync runs at most this often per device (the profile sync's own interval). */
export const HISTORY_SYNC_INTERVAL_MS = 3_600_000;

export interface HistorySyncDeps extends HistoryNetDeps {
  /** Where the link record and the history live (default localStorage). */
  store?: (LinkStorage & HistoryStorage) | null;
  /** What to do when the server answers 410 (default: forgetDeletedPlayer with the mirror and key store below). */
  forget?: () => Promise<unknown>;
  mirror?: LinkDeps["mirror"];
  keyStore?: LinkDeps["keyStore"];
}

export type HistorySyncStatus = "skipped" | "ok" | "failed" | "stopped" | "gone";
export interface HistorySyncResult {
  status: HistorySyncStatus;
  /** Entries sent (200, 201 or 409). */
  sent: number;
  /** Entries the server refused for good (marked, never sent again). */
  refused: number;
  /** Entries downloaded and held now. */
  received: number;
}

const none = (status: HistorySyncStatus): HistorySyncResult => ({ status, sent: 0, refused: 0, received: 0 });

/** The servers that answered 404 or 405 to a history request: no more history requests to them in this page load. */
const stopped = new Set<string>();
/** FOR TESTS: forget which servers were stopped. */
export function resetHistorySync(): void {
  stopped.clear();
}
const urlKey = (baseUrl: string): string => baseUrl.replace(/\/+$/, "");

// Syncs run one after another (a run's end and the startup sync can meet), and the ones running are tracked so a test can wait for them.
let tail: Promise<unknown> = Promise.resolve();
const running = new Set<Promise<unknown>>();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn, fn);
  tail = run.catch(() => undefined);
  return run;
}
/** Let a background sync go on its own and remember it (so historyIdle can wait for it). Never rejects. */
export function trackHistory(p: Promise<unknown>): void {
  const q: Promise<unknown> = p.catch(() => undefined).finally(() => void running.delete(q));
  running.add(q);
}
/** Resolves when no background history sync is running. For tests, and for nothing else. */
export async function historyIdle(): Promise<void> {
  while (running.size) await Promise.all([...running]);
}

type Verdict = "done" | "stop" | "gone" | "absent";
/** What a status means for an entry just sent. */
function verdict(status: number | undefined, error: string): Verdict {
  // `error` is the server's own words, or "HTTP <status>" when the answer carried none (a proxy's page: not the server's, so never final)
  const theirs = !/^HTTP \d{3}$/.test(error);
  if (status === 409) return theirs ? "done" : "stop"; // a different entry holds the id
  if (status === 200 || status === 201) return "stop"; // reached only for an answer that was not the server's (the stored case is handled by the caller)
  if (status === 404 || status === 405) return "absent"; // a server without these routes
  if (status === 410) return "gone";
  // the server refused the entry's content: sending it again would be refused again, so it is finished with. A wrong clock is not that
  if (status === 400 || status === 413 || status === 422) return theirs && !/^at:/.test(error) ? "done" : "stop";
  return "stop"; // 401, 403 (uploads closed), 429, 5xx, no answer: keep the entries, try at the next trigger
}

async function doSync(baseUrl: string, id: Identity, deps: HistorySyncDeps, download: boolean): Promise<HistorySyncResult> {
  const linkStore = deps.store === undefined ? browserLinkStorage() : deps.store;
  const histStore = deps.store === undefined ? browserHistoryStorage() : deps.store;
  const rec = readLink(linkStore);
  const keyId = id.keyId ?? id.playerId;
  if (!rec || rec.key !== keyId) return none("skipped"); // never linked (or the record is another key's): no request at all
  if (stopped.has(urlKey(baseUrl))) return none("skipped");
  const { newer } = readHistory(histStore);
  if (newer) return none("skipped"); // a newer build's store is left alone
  const player = rec.player;
  const out = none("ok");
  const gone = async (): Promise<HistorySyncResult> => {
    try {
      await (deps.forget ?? (() => forgetDeletedPlayer({ store: linkStore, ...(deps.mirror !== undefined ? { mirror: deps.mirror } : {}), ...(deps.keyStore ? { keyStore: deps.keyStore } : {}) })))();
    } catch {
      /* the next use finds the same 410 */
    }
    return { ...out, status: "gone" };
  };
  const failed = (v: Verdict): HistorySyncResult => {
    if (v === "absent") stopped.add(urlKey(baseUrl));
    return { ...out, status: v === "absent" ? "stopped" : "failed" };
  };

  // 1. UPLOAD: its entries not yet sent to its player, newest first, a bounded number
  for (const e of unsentFor(player, histStore).slice(0, HISTORY_UPLOADS_PER_TRIGGER)) {
    const r = await putHistoryEntry(baseUrl, id, e, deps);
    const v = r.ok ? "done" : verdict(r.status, r.error);
    if (v === "gone") return gone();
    if (!r.ok && r.status === 403) break; // uploads are closed: the entries wait, but the reads below always work
    if (v !== "done") return failed(v);
    markSent([e.id], player, histStore);
    if (r.ok || r.status === 409) out.sent++;
    else out.refused++;
  }
  if (!download) return out;

  // 2. DOWNLOAD: the player's list, then the newest entries this device lacks and would keep
  const l = await listHistory(baseUrl, id, deps);
  if (!l.ok) {
    const v = verdict(l.status, l.error);
    return v === "gone" ? gone() : failed(v === "done" ? "stop" : v);
  }
  const { state } = readHistory(histStore);
  const have = new Set(state.entries.map((x) => x.entry.id));
  // a full list keeps a downloaded entry only if it is newer than an entry it may displace (one already sent or downloaded)
  let cutoff = -1;
  if (state.entries.length >= HISTORY_LOCAL_MAX) {
    const dropable = state.entries.filter((x) => x.down || x.sentTo === player);
    cutoff = dropable.length ? dropable[dropable.length - 1].entry.finishedAt : Infinity;
  }
  const want = l.entries.filter((x) => !have.has(x.id) && x.finishedAt > cutoff).sort(newestFirst).slice(0, HISTORY_DOWNLOADS_PER_SYNC);
  const got: HistoryEntry[] = [];
  let ended: Verdict | null = null;
  for (const w of want) {
    const g = await getHistoryEntry(baseUrl, id, w.id, deps);
    if (g.ok) {
      got.push(g.entry);
      continue;
    }
    if (g.status === 404) continue; // it left the player's history since the list
    const v = verdict(g.status, g.error);
    ended = v === "done" ? "stop" : v;
    break;
  }
  out.received = got.length ? mergeDownloaded(got, player, histStore) : 0;
  if (ended === "gone") return gone();
  if (ended) return failed(ended);
  stampSynced(Math.floor((deps.now ?? (() => Date.now()))()), histStore);
  return out;
}

/** Upload (and, with `download`, download) the history of a linked device. Never throws; { status: "skipped" } and no request for a device
 *  that was never linked. Syncs run one at a time. */
export function syncHistory(baseUrl: string, id: Identity, deps: HistorySyncDeps = {}, opts: { download?: boolean } = {}): Promise<HistorySyncResult> {
  return serial(async () => {
    try {
      return await doSync(baseUrl, id, deps, opts.download !== false);
    } catch {
      return none("failed");
    }
  });
}

/** The startup sync: once a page load (the title calls it), at most hourly by history's own time. Nothing for a device never linked. */
export async function startupHistorySync(baseUrl: string, id: Identity, deps: HistorySyncDeps = {}): Promise<HistorySyncResult> {
  try {
    const linkStore = deps.store === undefined ? browserLinkStorage() : deps.store;
    const rec = readLink(linkStore);
    if (!rec || rec.key !== (id.keyId ?? id.playerId)) return none("skipped");
    const { state, newer } = readHistory(deps.store === undefined ? browserHistoryStorage() : deps.store);
    if (newer) return none("skipped");
    const now = Math.floor((deps.now ?? (() => Date.now()))());
    if (state.syncedAt !== undefined && now >= state.syncedAt && now - state.syncedAt < HISTORY_SYNC_INTERVAL_MS) return none("skipped");
    return await syncHistory(baseUrl, id, deps);
  } catch {
    return none("failed");
  }
}

/** The link flow's trigger (linkClient.ts): after a link, and after SHOW MY CODE. Fire and forget. */
export function syncHistoryAfterLink(baseUrl: string, id: Identity, deps: LinkDeps): void {
  trackHistory(syncHistory(baseUrl, id, {
    ...(deps.fetch ? { fetch: deps.fetch } : {}), ...(deps.now ? { now: deps.now } : {}), ...(deps.timeoutMs !== undefined ? { timeoutMs: deps.timeoutMs } : {}),
    ...(deps.store !== undefined ? { store: deps.store } : {}), ...(deps.mirror !== undefined ? { mirror: deps.mirror } : {}), ...(deps.keyStore ? { keyStore: deps.keyStore } : {}),
  }));
}

/** A run ended (styleFolds.ts calls this beside profileChanged("end")): write its entry to the device's list, and send it when the device
 *  is linked and the page's session has an identity. Never throws, never waits. */
export function historyRunEnded(run: Run): void {
  try {
    if (!recordRunEnd(run).length) return;
    const s = online() as (Session & { identity?: Identity | null }) | null;
    const id = s?.identity;
    if (!s || !s.active || !id) return; // no session yet: the next trigger sends it
    trackHistory(syncHistory(s.url, id, {}, { download: false }));
  } catch {
    /* a run's end is never held back by the history */
  }
}
