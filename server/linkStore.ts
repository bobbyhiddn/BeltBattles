// IDENT-1 (REQ-BFG-122): where the identity layer keeps its records. Links, link codes, Steam links, player records and
// tombstones sit in the same backing store as the profiles (profileStore.ts profileStoreFor's choice), behind one small
// key/value interface with three implementations, the way ProfileStore has them:
//   file store (dev, tests, a jsonl deployment)   <dataDir>/identity/<key>, replaced atomically (tmp + rename)
//   Tigris                                        the object <key> in the ghosts' own bucket (outside ghosts/ and profiles/, so
//                                                 a ghost bucket LIST never sees it)
//   memory                                        tests, and a GhostStore this file does not know
// The keys (server/links.ts is the only writer; every id in them is a 1-64 character base64url id, ID_PATTERN):
//   links/keys/<keyId>.json         { player, at }                  a key linked to the player (a player's own first key has none)
//   players/<P>.json                { keys[], steam[], at, code? }  the keys and Steam ids linked to P (its own key is implicit);
//                                                                   code: the hash of its live link code
//   linkcodes/<sha256(code)>.json   { player, expiresAt }           a live link code, stored hashed (never the code itself)
//   links/steam/<steamId>.json      { player, at }                  a Steam account linked to a player
//   tombstones/<P>.json             { at, ids[] }                   a deleted player: P and every key id that was linked to it
// A record names no address, no signature, no ticket and no public key.

import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { S3Client, S3Error } from "./s3";
import { JsonlStore, StorageError, type GhostStore } from "./store";
import { TigrisStore } from "./tigrisStore";

export const IDENTITY_DIR = "identity";

/** A key this store may hold: one of the five prefixes, then an id (a hex hash, a base64url id or a Steam id) and ".json". */
const KEY_PATTERN = /^(?:links\/keys|links\/steam|players|linkcodes|tombstones)\/[A-Za-z0-9_-]{1,64}\.json$/;
const PREFIX_PATTERN = /^(?:links\/keys|links\/steam|players|linkcodes|tombstones)\/$/;

export interface LinkStore {
  /** The record's text, or null when there is none. StorageError: storage is down. */
  get(key: string): Promise<string | null>;
  /** Replace the record. Durable when it resolves. StorageError: storage is down. */
  put(key: string, text: string): Promise<void>;
  /** Delete the record; a missing one is fine. StorageError: storage is down. */
  delete(key: string): Promise<void>;
  /** Every key under one of the prefixes above (for example "tombstones/"), in no particular order. */
  list(prefix: string): Promise<string[]>;
}

function checkKey(key: string): string {
  if (!KEY_PATTERN.test(key)) throw new Error("link store: not a record key");
  return key;
}

function checkPrefix(prefix: string): string {
  if (!PREFIX_PATTERN.test(prefix)) throw new Error("link store: not a record prefix");
  return prefix;
}

const codeOf = (e: unknown): string | undefined => {
  const code = typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined;
  return typeof code === "string" ? code : undefined;
};
const errCode = (e: unknown): string => (codeOf(e) ? ` (${codeOf(e)})` : "");

/** The file store: one file per record under <dataDir>/identity. Writes are tmp + rename, so a reader sees the old record or
 *  the new one. Messages carry the operation only, never an id or a path. */
export class FileLinkStore implements LinkStore {
  constructor(readonly dir: string) {}

  private file(key: string): string {
    return join(this.dir, ...checkKey(key).split("/"));
  }

  async get(key: string): Promise<string | null> {
    const file = this.file(key);
    try {
      return readFileSync(file, "utf8");
    } catch (e) {
      // no file (or no directory) means no record; any other failure is storage trouble, never "none": a record that merely
      // could not be read must not be overwritten
      if (codeOf(e) === "ENOENT" || codeOf(e) === "ENOTDIR") return null;
      throw new StorageError(`identity read failed${errCode(e)}`);
    }
  }

  async put(key: string, text: string): Promise<void> {
    const file = this.file(key);
    try {
      mkdirSync(dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, text);
      renameSync(tmp, file);
    } catch (e) {
      throw new StorageError(`identity write failed${errCode(e)}`);
    }
  }

  async delete(key: string): Promise<void> {
    const file = this.file(key);
    try {
      rmSync(file, { force: true });
    } catch (e) {
      throw new StorageError(`identity delete failed${errCode(e)}`);
    }
  }

  async list(prefix: string): Promise<string[]> {
    const dir = join(this.dir, ...checkPrefix(prefix).split("/").filter(Boolean));
    try {
      return readdirSync(dir).filter((n) => n.endsWith(".json")).map((n) => `${prefix}${n}`);
    } catch (e) {
      if (codeOf(e) === "ENOENT" || codeOf(e) === "ENOTDIR") return [];
      throw new StorageError(`identity list failed${errCode(e)}`);
    }
  }
}

/** The Tigris store: the object <key> through the ghosts' own S3 client (same bucket, same credentials). A StorageError names
 *  the operation and the HTTP status, never the key (it holds an id). */
export class TigrisLinkStore implements LinkStore {
  constructor(readonly s3: S3Client) {}

  private fail(op: string, e: unknown): StorageError {
    const status = e instanceof S3Error && e.status ? `HTTP ${e.status}${e.code ? ` ${e.code}` : ""}` : "no answer";
    return new StorageError(`identity ${op} failed: ${status}`);
  }

  /** A lookup is HEAD first, and a GET only for a record that exists: nearly every lookup is a miss (a key that was never linked, a
   *  player with no record), and a miss costs one HEAD, as a GET 404 would, while the records worth reading are cached for minutes. */
  async get(key: string): Promise<string | null> {
    checkKey(key);
    try {
      if (!(await this.s3.head(key))) return null;
      return await this.s3.getText(key);
    } catch (e) {
      throw this.fail("read", e);
    }
  }

  async put(key: string, text: string): Promise<void> {
    checkKey(key);
    try {
      await this.s3.put(key, text);
    } catch (e) {
      throw this.fail("write", e);
    }
  }

  async delete(key: string): Promise<void> {
    checkKey(key);
    try {
      await this.s3.delete(key);
    } catch (e) {
      throw this.fail("delete", e);
    }
  }

  async list(prefix: string): Promise<string[]> {
    checkPrefix(prefix);
    try {
      return (await this.s3.listAll(prefix)).map((o) => o.key).filter((k) => KEY_PATTERN.test(k));
    } catch (e) {
      throw this.fail("list", e);
    }
  }
}

/** In memory: the default for a GhostStore this file does not know (a test double), and for tests of the layer itself. */
export class MemoryLinkStore implements LinkStore {
  readonly records = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.records.get(checkKey(key)) ?? null;
  }
  async put(key: string, text: string): Promise<void> {
    this.records.set(checkKey(key), text);
  }
  async delete(key: string): Promise<void> {
    this.records.delete(checkKey(key));
  }
  async list(prefix: string): Promise<string[]> {
    checkPrefix(prefix);
    return [...this.records.keys()].filter((k) => k.startsWith(prefix));
  }
}

/** The identity store beside a ghost store: the same directory (jsonl) or the same bucket (Tigris), as profileStoreFor. */
export function linkStoreFor(ghosts: GhostStore, log: (line: string) => void = () => {}): LinkStore {
  if (ghosts instanceof JsonlStore) return new FileLinkStore(join(ghosts.dataDir, IDENTITY_DIR));
  if (ghosts instanceof TigrisStore) return new TigrisLinkStore(ghosts.s3);
  log("identity store: this ghost store is neither the file nor the Tigris store; links are kept in memory only");
  return new MemoryLinkStore();
}
