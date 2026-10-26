// IDENT-2 (REQ-BFG-122 clause 4): fixtures for the run-history tests. Not a test file itself. Builds on tests/identRig.ts (a server in process
// over the JSON-lines directory or Tigris on the in-process fake S3, a fixed clock, signed requests): a valid entry, the signed PUT and the signed
// reads of /v1/history, and a look at the stored objects of either store, so a test can count what a request wrote without asking the server.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HISTORY_GET_PREFIX, HISTORY_PREFIX, type Identity, type SignDomain } from "../src/net/identity";
import { byteLength, encodeEntry, entryIdOf, type HistoryEntry, type HistoryKind } from "../src/net/historyWire";
import { battleRecordFor } from "../src/net/replay";
import { startingBuild } from "../src/sim/ai";
import type { BattleRecord } from "../src/sim/battle";
import { RULES_VERSION } from "../src/sim/content";
import { parseName, type HistoryStore } from "../server/historyStore";
import type { FakeRequest } from "../tools/fakeS3";
import { fakeKeys, openRig, send, signedBy, theFake, type Kind, type Opts, type Reply, type Rig } from "./identRig";
import { NOW } from "./profileupWire";

export { NOW };
export type { Kind, Opts, Reply, Rig };

/** No rate limit and no wrong-code limit: a history test makes hundreds of requests from one address. */
export const OPEN: Opts = { rateLimit: { windowMs: 60_000, max: 10_000_000 }, redeemLimit: { windowMs: 600_000, max: 10_000_000 } };
export const openHistoryRig = (kind: Kind, over: Opts = {}): Promise<Rig> => openRig(kind, { ...OPEN, ...over });

/** The default finishedAt of a test entry: a minute before the rig's clock. */
export const FINISHED = NOW - 60_000;

/** A battle record the server's own rules accept (checkRecord): two real starting builds. */
export function recordOf(seed = 7): BattleRecord {
  return JSON.parse(JSON.stringify(battleRecordFor(startingBuild("furnace", 1), startingBuild("weaver", 1), seed))) as BattleRecord;
}

/** A valid entry for `runId`: kind "run" (or `over.kind`), three dusks, finished a minute before the rig's clock. `over` overrides any field. */
export function entryFor(runId: string, over: Partial<HistoryEntry> = {}): HistoryEntry {
  const kind: HistoryKind = over.kind ?? "run";
  return {
    id: entryIdOf(runId, kind), runId, kind, rules: RULES_VERSION, hero: "furnace", outcome: kind === "run" ? "won" : "over", wins: 2, days: 3, lives: 4,
    hearts: true, finishedAt: FINISHED, dusks: [{ day: 1, outcome: "win" }, { day: 2, outcome: "loss" }, { day: 3, outcome: "win" }], ...over,
  };
}

/** An entry whose canonical text is exactly `bytes` long (one record of another rules version carries the padding). */
export function entrySized(runId: string, bytes: number, over: Partial<HistoryEntry> = {}): HistoryEntry {
  const mk = (n: number): HistoryEntry =>
    entryFor(runId, { wins: 1, days: 1, dusks: [{ day: 1, outcome: "win", record: { rules: "bb-0.1.0", seed: 1, builds: [{ pad: "x".repeat(n) }, {}] } as unknown as BattleRecord }], ...over });
  const e = mk(bytes - byteLength(encodeEntry(mk(0))));
  if (byteLength(encodeEntry(e)) !== bytes) throw new Error(`entrySized: made ${byteLength(encodeEntry(e))} bytes, wanted ${bytes}`);
  return e;
}

/** The body PUT /v1/history takes: {"at":<ms>,"entry":{...}} in the canonical form. */
export const bodyOfEntry = (e: HistoryEntry, at: number): string => `{"at":${at},"entry":${encodeEntry(e)}}`;

/** PUT /v1/history of `body` signed by `id` in `domain` (the history domain unless a test says otherwise). */
export async function putBody(r: Pick<Rig, "base">, id: Identity, body: string | Uint8Array<ArrayBuffer>, domain: SignDomain = HISTORY_PREFIX): Promise<Reply> {
  return send(r, "PUT", "/v1/history", body, await signedBy(id, body, domain));
}

/** PUT /v1/history of one entry, signed by `id`, `at` the rig's clock unless given. */
export const putEntry = (r: Rig, id: Identity, entry: HistoryEntry, at: number = r.clock.now, domain?: SignDomain): Promise<Reply> =>
  putBody(r, id, bodyOfEntry(entry, at), domain);

/** GET `url` (path and query) signed by `id` over `signText` (the url itself unless given) in `domain` (the history read domain unless given). */
export async function getSigned(r: Pick<Rig, "base">, id: Identity, url: string, signText: string = url, domain: SignDomain = HISTORY_GET_PREFIX): Promise<Reply> {
  return send(r, "GET", url, undefined, await signedBy(id, signText, domain));
}
/** GET /v1/history?at=<ms>: the player's entries, newest first. */
export const listEntries = (r: Rig, id: Identity, at: number = r.clock.now): Promise<Reply> => getSigned(r, id, `/v1/history?at=${at}`);
/** GET /v1/history?at=<ms>&id=<entry id>: one entry. */
export const getEntry = (r: Rig, id: Identity, entryId: string, at: number = r.clock.now): Promise<Reply> => getSigned(r, id, `/v1/history?at=${at}&id=${entryId}`);

/** The list reply's entries: [{ id, finishedAt }], as the server sent them. */
export const listed = (r: Reply): { id: string; finishedAt: number }[] => ((r.json?.entries ?? []) as { id: string; finishedAt: number }[]);
/** Just the ids of the list reply. */
export const listedIds = (r: Reply): string[] => listed(r).map((e) => e.id);

// ------------------------------------------------------------------------------------------------------ the stored objects

/** The history store the routes and a DELETE use right now (patch its methods to count or break them; restore them after). */
export function historyOf(rig: Rig): HistoryStore {
  return (rig.app.links as unknown as { history: HistoryStore }).history;
}

/** Every file or object name under history/<id>/ (no prefix), strays included, sorted. */
export function historyRaw(rig: Rig, id: string): string[] {
  if (rig.kind === "tigris") return fakeKeys(rig, `history/${id}/`).map((k) => k.slice(`history/${id}/`.length));
  const dir = join(rig.dir, "history", id);
  return existsSync(dir) ? readdirSync(dir).sort() : [];
}

/** The entries stored under history/<id>/: the names that are entry names. */
export const historyObjects = (rig: Rig, id: string): string[] => historyRaw(rig, id).filter((n) => parseName(n) !== null);

/** Every entry object of every player, as "history/<id>/<name>". */
export function allHistory(rig: Rig): string[] {
  if (rig.kind === "tigris") return fakeKeys(rig, "history/");
  const root = join(rig.dir, "history");
  if (!existsSync(root)) return [];
  return readdirSync(root).sort().flatMap((id) => readdirSync(join(root, id)).sort().map((n) => `history/${id}/${n}`));
}

/** The text of an object under history/<id>/, or null. */
export function readObject(rig: Rig, id: string, name: string): string | null {
  if (rig.kind === "tigris") return theFake().getObject(rig.bucket, `history/${id}/${name}`) ?? null;
  const file = join(rig.dir, "history", id, name);
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

/** Write an object straight into the store, as another machine (or a stray tool) would. */
export function writeObject(rig: Rig, id: string, name: string, text: string): void {
  if (rig.kind === "tigris") return theFake().putObject(rig.bucket, `history/${id}/${name}`, text);
  const dir = join(rig.dir, "history", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), text);
}

/** Remove an object straight from the store. */
export function removeObject(rig: Rig, id: string, name: string): void {
  if (rig.kind === "tigris") return theFake().deleteObject(rig.bucket, `history/${id}/${name}`);
  rmSync(join(rig.dir, "history", id, name), { force: true });
}

// ------------------------------------------------------------------------------------------------------ requests at the fake S3

/** A mark in the fake S3's request log (tigris); 0 for the file store, which has no request log. */
export const markRequests = (rig: Rig): number => (rig.kind === "tigris" ? theFake().requests.length : 0);

/** The requests the fake saw since `from` for this rig's bucket whose key (for a LIST, the prefix) starts with `prefix`. */
export function requestsSince(rig: Rig, from: number, prefix = ""): FakeRequest[] {
  if (rig.kind !== "tigris") return [];
  return theFake().requests.slice(from).filter((r) => r.bucket === rig.bucket && r.key.startsWith(prefix));
}

/** Those requests counted by operation, e.g. { LIST: 1, PUT: 1 }. */
export function opsSince(rig: Rig, from: number, prefix = ""): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of requestsSince(rig, from, prefix)) out[r.op] = (out[r.op] ?? 0) + 1;
  return out;
}
