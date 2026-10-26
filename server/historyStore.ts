// IDENT-2 (REQ-BFG-122 clause 4): where the run history lives. One object per finished run, under the CANONICAL player (the signer's
// player, links.ts playerOfKey), in the same backing store as the profiles and the links, behind one small interface with three
// implementations, the way LinkStore has them:
//   file store (dev, tests, a jsonl deployment)   <dataDir>/history/<P>/<name>, replaced atomically (tmp + rename)
//   Tigris                                        the object history/<P>/<name> in the ghosts' own bucket (outside ghosts/ and profiles/, so a
//                                                 ghost bucket LIST never sees it; masked in the S3 client's log text as history/*, s3.ts)
//   memory                                        tests, and a GhostStore this file does not know
// <name> is "<ts>-<id>.json": <id> is the entry's id (a runId, or a runId and "_endless") and <ts> its finishedAt, written as
// 9999999999999 - finishedAt in 13 digits, so a plain LIST (which every store returns in name order) is NEWEST FIRST and carries each
// entry's finishedAt. That is how one LIST orders a player's history without reading one entry (the brief's layout history/<P>/<id>.json
// could not: the object name must hold the time, and the fake S3 answers every LastModified alike). An entry's name is fixed by the entry
// (the first write wins, so its finishedAt never changes).
// The list filters by this store's own name pattern (IDENT-1 re-check finding B: a store must not answer names its own check refuses).
// A record names no address, no signature and no public key; the object is the entry's canonical text and nothing else.

import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { S3Client, S3Error } from "./s3";
import { JsonlStore, StorageError, type GhostStore } from "./store";
import { TigrisStore } from "./tigrisStore";
import { newestFirst } from "../src/net/historyWire";

export const HISTORY_DIR = "history";

/** <ts> is TS_BASE - finishedAt in 13 digits: a finishedAt from 0 to TS_BASE (the year 2286) has a name. */
const TS_BASE = 9_999_999_999_999;

/** A player id or a key id: a path segment, the id pattern only (ID_PATTERN: 1-64 base64url characters). */
const PLAYER = /^[A-Za-z0-9_-]{1,64}$/;
/** An entry's object name under its player's prefix. */
const NAME = /^(\d{13})-([A-Za-z0-9_-]{1,64})\.json$/;
/** Every key this store may hold. */
export const HISTORY_KEY = /^history\/[A-Za-z0-9_-]{1,64}\/\d{13}-[A-Za-z0-9_-]{1,64}\.json$/;

export interface HistoryName {
  finishedAt: number;
  id: string;
}

/** The object name of an entry: "<ts>-<id>.json". */
export function nameOf(n: HistoryName): string {
  if (!Number.isSafeInteger(n.finishedAt) || n.finishedAt < 0 || n.finishedAt > TS_BASE) throw new Error("history store: not a finishedAt");
  return `${String(TS_BASE - n.finishedAt).padStart(13, "0")}-${n.id}.json`;
}

/** An object name -> the entry it names, or null (a name this store does not write). */
export function parseName(name: string): HistoryName | null {
  const m = NAME.exec(name);
  return m ? { finishedAt: TS_BASE - Number(m[1]), id: m[2] } : null;
}

function player(p: string): string {
  if (!PLAYER.test(p)) throw new Error("history store: not a player id");
  return p;
}
function entryName(n: HistoryName): string {
  if (!PLAYER.test(n.id)) throw new Error("history store: not an entry id");
  return nameOf(n);
}

export interface HistoryStore {
  /** The player's entries, newest first: names only, one LIST (never a read per entry). StorageError: storage is down. */
  list(player: string): Promise<HistoryName[]>;
  /** The entry's canonical text, or null when there is none. StorageError: storage is down. */
  get(player: string, n: HistoryName): Promise<string | null>;
  /** Write the entry. Durable when it resolves. StorageError: storage is down. */
  put(player: string, n: HistoryName, text: string): Promise<void>;
  /** Delete the entry; a missing one is fine. StorageError: storage is down. */
  delete(player: string, n: HistoryName): Promise<void>;
}

const codeOf = (e: unknown): string | undefined => {
  const code = typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined;
  return typeof code === "string" ? code : undefined;
};
const errCode = (e: unknown): string => (codeOf(e) ? ` (${codeOf(e)})` : "");

const sorted = (names: HistoryName[]): HistoryName[] => names.sort(newestFirst);

/** The file store: one file per entry under <dataDir>/history/<player>/. Writes are tmp + rename, so a reader sees the old record or
 *  the new one. Messages carry the operation only, never an id or a path. */
export class FileHistoryStore implements HistoryStore {
  constructor(readonly dir: string) {}

  private file(p: string, n: HistoryName): string {
    return join(this.dir, player(p), entryName(n));
  }

  async list(p: string): Promise<HistoryName[]> {
    const dir = join(this.dir, player(p));
    try {
      return sorted(readdirSync(dir).map(parseName).filter((n): n is HistoryName => n !== null));
    } catch (e) {
      if (codeOf(e) === "ENOENT" || codeOf(e) === "ENOTDIR") return [];
      throw new StorageError(`history list failed${errCode(e)}`);
    }
  }

  async get(p: string, n: HistoryName): Promise<string | null> {
    const file = this.file(p, n);
    try {
      return readFileSync(file, "utf8");
    } catch (e) {
      if (codeOf(e) === "ENOENT" || codeOf(e) === "ENOTDIR") return null;
      throw new StorageError(`history read failed${errCode(e)}`);
    }
  }

  async put(p: string, n: HistoryName, text: string): Promise<void> {
    const file = this.file(p, n);
    try {
      mkdirSync(join(this.dir, player(p)), { recursive: true });
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, text);
      renameSync(tmp, file);
    } catch (e) {
      throw new StorageError(`history write failed${errCode(e)}`);
    }
  }

  async delete(p: string, n: HistoryName): Promise<void> {
    const file = this.file(p, n);
    try {
      rmSync(file, { force: true });
    } catch (e) {
      throw new StorageError(`history delete failed${errCode(e)}`);
    }
  }
}

/** The Tigris store: the object history/<player>/<name> through the ghosts' own S3 client (same bucket, same credentials). A StorageError
 *  names the operation and the HTTP status, never the key (it holds an id). */
export class TigrisHistoryStore implements HistoryStore {
  constructor(readonly s3: S3Client) {}

  private fail(op: string, e: unknown): StorageError {
    const status = e instanceof S3Error && e.status ? `HTTP ${e.status}${e.code ? ` ${e.code}` : ""}` : "no answer";
    return new StorageError(`history ${op} failed: ${status}`);
  }

  private key(p: string, n: HistoryName): string {
    return `${HISTORY_DIR}/${player(p)}/${entryName(n)}`;
  }

  async list(p: string): Promise<HistoryName[]> {
    const prefix = `${HISTORY_DIR}/${player(p)}/`;
    try {
      const names: HistoryName[] = [];
      for (const o of await this.s3.listAll(prefix)) {
        if (!HISTORY_KEY.test(o.key)) continue; // this store's own check, as the link store's list has it
        const n = parseName(o.key.slice(prefix.length));
        if (n) names.push(n);
      }
      return sorted(names);
    } catch (e) {
      throw this.fail("list", e);
    }
  }

  async get(p: string, n: HistoryName): Promise<string | null> {
    const key = this.key(p, n);
    try {
      return await this.s3.getText(key);
    } catch (e) {
      throw this.fail("read", e);
    }
  }

  async put(p: string, n: HistoryName, text: string): Promise<void> {
    const key = this.key(p, n);
    try {
      await this.s3.put(key, text);
    } catch (e) {
      throw this.fail("write", e);
    }
  }

  async delete(p: string, n: HistoryName): Promise<void> {
    const key = this.key(p, n);
    try {
      await this.s3.delete(key);
    } catch (e) {
      throw this.fail("delete", e);
    }
  }
}

/** In memory: the default for a GhostStore this file does not know (a test double), and for tests of the layer itself. */
export class MemoryHistoryStore implements HistoryStore {
  readonly records = new Map<string, string>();
  private key(p: string, n: HistoryName): string {
    return `${HISTORY_DIR}/${player(p)}/${entryName(n)}`;
  }
  async list(p: string): Promise<HistoryName[]> {
    const prefix = `${HISTORY_DIR}/${player(p)}/`;
    return sorted([...this.records.keys()].filter((k) => k.startsWith(prefix) && HISTORY_KEY.test(k)).map((k) => parseName(k.slice(prefix.length))).filter((n): n is HistoryName => n !== null));
  }
  async get(p: string, n: HistoryName): Promise<string | null> {
    return this.records.get(this.key(p, n)) ?? null;
  }
  async put(p: string, n: HistoryName, text: string): Promise<void> {
    this.records.set(this.key(p, n), text);
  }
  async delete(p: string, n: HistoryName): Promise<void> {
    this.records.delete(this.key(p, n));
  }
}

/** The history store beside a ghost store: the same directory (jsonl) or the same bucket (Tigris), as linkStoreFor. */
export function historyStoreFor(ghosts: GhostStore, log: (line: string) => void = () => {}): HistoryStore {
  if (ghosts instanceof JsonlStore) return new FileHistoryStore(join(ghosts.dataDir, HISTORY_DIR));
  if (ghosts instanceof TigrisStore) return new TigrisHistoryStore(ghosts.s3);
  log("history store: this ghost store is neither the file nor the Tigris store; run history is kept in memory only");
  return new MemoryHistoryStore();
}
