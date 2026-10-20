// PROFILE-UP (REQ-BFG-074 clause 4, backlog #371): where PUT /v1/profile keeps each player's merged profile. One record
// per playerId, in the backing store the ghosts use, behind a two-method interface. GhostStore is not widened and no ghost
// file or object is touched:
//   file store (dev, tests, a jsonl deployment)   <dataDir>/profiles/<playerId>.json, replaced atomically (tmp + rename)
//   Tigris                                        object profiles/<playerId>.json (outside every ghosts/ prefix, so a
//                                                 ghost bucket LIST never sees it)
// A record is {"receivedAt":<ms>,"profile":<the merged canonical wire profile>} and nothing else: no key, no signature, no
// address. The route does read-merge-write; a lost race between two writes of one key (two uploads in flight, or two
// machines) is accepted, because every upload is a device's whole profile and the next one merges again.

import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ID_PATTERN } from "../src/net/snapshot";
import { ProfileWireError, decodeWireValue, encodeWire, type WireProfile } from "../src/net/profileWire";
import { S3Client, S3Error } from "./s3";
import { JsonlStore, StorageError, type GhostStore } from "./store";
import { TigrisStore } from "./tigrisStore";

/** What is kept for a player: the merged wire profile and when the last upload arrived. Nothing else. */
export interface StoredProfile {
  profile: WireProfile;
  receivedAt: number;
}

export interface ProfileStore {
  /** The player's record, or null when there is none (or it cannot be read: see the stores). StorageError: storage is down. */
  get(playerId: string): Promise<StoredProfile | null>;
  /** Replace the player's record. Durable when it resolves. StorageError: storage is down. */
  put(playerId: string, record: StoredProfile): Promise<void>;
  /** IDENT-1 (REQ-BFG-122): remove the player's record; a missing one is fine. StorageError: storage is down. The three stores
   *  below have it. Optional only so a test double with get and put still fits the type; the identity layer skips a store without it. */
  delete?(playerId: string): Promise<void>;
}

export const PROFILE_DIR = "profiles";

/** The record as stored: receivedAt, then the canonical profile. */
export function encodeStored(r: StoredProfile): string {
  return `{"receivedAt":${r.receivedAt},"profile":${encodeWire(r.profile)}}`;
}

/** A stored record -> a StoredProfile. Throws ProfileWireError: status 422 = a profile version this server cannot read (it
 *  was written by a newer one), 400 = anything else that is not a record. */
export function decodeStored(text: string): StoredProfile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProfileWireError(400, "stored profile: not JSON");
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new ProfileWireError(400, "stored profile: not an object");
  const o = raw as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length !== 2 || !keys.includes("receivedAt") || !keys.includes("profile")) throw new ProfileWireError(400, "stored profile: wrong fields");
  const at = o.receivedAt;
  if (typeof at !== "number" || !Number.isSafeInteger(at) || at < 0) throw new ProfileWireError(400, "stored profile: bad receivedAt");
  return { receivedAt: at, profile: decodeWireValue(o.profile) };
}

/** playerId is a key or file name segment: the id pattern only (the signer's id is always 43 base64url characters). */
function segment(playerId: string): string {
  if (!ID_PATTERN.test(playerId)) throw new Error("profile store: not a player id");
  return playerId;
}

/** What a record on disk or in a bucket reads as: the record; null for one that is not a record (the player's next upload
 *  replaces it); a StorageError for one written by a NEWER profile version, which this server must not overwrite (the
 *  device's migrateProfile rule: an older build never wipes a newer one's progress). */
function readable(text: string, onSkip: () => void): StoredProfile | null {
  try {
    return decodeStored(text);
  } catch (e) {
    if (e instanceof ProfileWireError && e.status === 422) throw new StorageError("profile store: the stored profile is a newer version than this server reads; not overwritten");
    onSkip();
    return null;
  }
}

const codeOf = (e: unknown): string | undefined => {
  const code = typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined;
  return typeof code === "string" ? code : undefined;
};
const errCode = (e: unknown): string => (codeOf(e) ? ` (${codeOf(e)})` : "");

/** The file store: one file per player under <dataDir>/profiles. Writes are tmp + rename, so a reader sees the old record or
 *  the new one. Messages carry the operation only, never the player id or a path. */
export class FileProfileStore implements ProfileStore {
  skipped = 0; // records that were not records, on read
  constructor(readonly dir: string) {}

  private file(playerId: string): string {
    return join(this.dir, `${segment(playerId)}.json`);
  }

  async get(playerId: string): Promise<StoredProfile | null> {
    const file = this.file(playerId);
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch (e) {
      // no file (or no directory) means no record; any other failure (EACCES, EMFILE, EISDIR...) is storage trouble, never "none":
      // a record that merely could not be read must not be overwritten by the next upload
      if (codeOf(e) === "ENOENT" || codeOf(e) === "ENOTDIR") return null;
      throw new StorageError(`profile read failed${errCode(e)}`);
    }
    return readable(text, () => this.skipped++);
  }

  async put(playerId: string, record: StoredProfile): Promise<void> {
    const file = this.file(playerId);
    try {
      mkdirSync(this.dir, { recursive: true });
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, encodeStored(record));
      renameSync(tmp, file);
    } catch (e) {
      throw new StorageError(`profile write failed${errCode(e)}`);
    }
  }

  async delete(playerId: string): Promise<void> {
    const file = this.file(playerId);
    try {
      rmSync(file, { force: true });
    } catch (e) {
      throw new StorageError(`profile delete failed${errCode(e)}`);
    }
  }
}

/** The Tigris store: object profiles/<playerId>.json through the ghosts' own S3 client (same bucket, same credentials). A
 *  StorageError names the operation and the HTTP status, never the key (it holds the player id). */
export class TigrisProfileStore implements ProfileStore {
  skipped = 0;
  constructor(readonly s3: S3Client, private readonly log: (line: string) => void = () => {}) {}

  private key(playerId: string): string {
    return `profiles/${segment(playerId)}.json`;
  }

  private fail(op: string, e: unknown): StorageError {
    const status = e instanceof S3Error && e.status ? `HTTP ${e.status}${e.code ? ` ${e.code}` : ""}` : "no answer";
    return new StorageError(`profile ${op} failed: ${status}`);
  }

  async get(playerId: string): Promise<StoredProfile | null> {
    const key = this.key(playerId); // a bad id is a programming error, not a storage outage: outside the try
    let text: string | null;
    try {
      text = await this.s3.getText(key);
    } catch (e) {
      throw this.fail("read", e);
    }
    if (text === null) return null;
    return readable(text, () => {
      this.skipped++;
      this.log("profile store: skipping an unreadable profile object");
    });
  }

  async put(playerId: string, record: StoredProfile): Promise<void> {
    const key = this.key(playerId);
    try {
      await this.s3.put(key, encodeStored(record));
    } catch (e) {
      throw this.fail("write", e);
    }
  }

  async delete(playerId: string): Promise<void> {
    const key = this.key(playerId);
    try {
      await this.s3.delete(key);
    } catch (e) {
      throw this.fail("delete", e);
    }
  }
}

/** In memory: the default for a GhostStore this file does not know (a test double), and for tests of the route. */
export class MemoryProfileStore implements ProfileStore {
  readonly records = new Map<string, string>();
  async get(playerId: string): Promise<StoredProfile | null> {
    const text = this.records.get(segment(playerId));
    return text === undefined ? null : readable(text, () => {});
  }
  async put(playerId: string, record: StoredProfile): Promise<void> {
    this.records.set(segment(playerId), encodeStored(record));
  }
  async delete(playerId: string): Promise<void> {
    this.records.delete(segment(playerId));
  }
}

/** The profile store beside a ghost store: the same directory (jsonl) or the same bucket (Tigris). */
export function profileStoreFor(ghosts: GhostStore, log: (line: string) => void = () => {}): ProfileStore {
  if (ghosts instanceof JsonlStore) return new FileProfileStore(join(ghosts.dataDir, PROFILE_DIR));
  if (ghosts instanceof TigrisStore) return new TigrisProfileStore(ghosts.s3, log);
  log("profile store: this ghost store is neither the file nor the Tigris store; profiles are kept in memory only");
  return new MemoryProfileStore();
}
