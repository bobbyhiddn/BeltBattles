// Ghost storage behind one async interface, GhostStore, so the same server runs on a local
// JSON-lines file (JsonlStore below: the default, local runs and most tests) or on Tigris over
// the S3 API (TigrisStore in tigrisStore.ts: one object per ghost, loaded lazily per bucket).
// Both are "durable first, then indexed": add() resolves only once the record is on disk or the
// PUT has succeeded, and only then does the ghost become matchable.
//
// JsonlStore: append-only <dataDir>/ghosts.jsonl, one {"id","at","snapshot"} object per line,
// loaded into memory at start and indexed by (rules, day). Nothing is ever rewritten in place; a
// torn or corrupt line is skipped on load. The stand-in pool written by `seed` lives apart, in
// <dataDir>/pool.jsonl, which a seed replaces atomically, so player uploads are never touched.

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkSnapshot, ghostId, type GhostSnapshot, type PoolEntry } from "../src/net/snapshot";

export const STORE_FILE = "ghosts.jsonl";
export const POOL_FILE = "pool.jsonl";

export type StoreKind = "jsonl" | "tigris";

/** 0.7.0a D2: what a bucket answers: every ghost, or only the seed pool (a new player's matches). */
export type BucketScope = "all" | "pool";

export interface AddResult {
  id: string;
  created: boolean; // false: the same snapshot was already stored (idempotent re-send)
}

export interface SeedCounts {
  written: number; // pool entries that were missing or differed, now stored
  unchanged: number; // pool entries already stored byte for byte
  removed: number; // stored pool entries of this rules version that are not in the bundle
}

/** The storage seam between app.ts and a backend. Every method that may do I/O is async. */
export interface GhostStore {
  /** Reported by /v1/health. */
  readonly kind: StoreKind;
  /** Where the ghosts live, for the startup log. Never a secret. */
  readonly where: string;
  /** Ghosts held in memory right now. Never touches storage (the health check reads it). */
  readonly size: number;
  /**
   * Store a snapshot that already passed validateBuild, as a player upload. Durable first, then
   * indexed. Idempotent: re-sending the same snapshot resolves { id, created: false }.
   */
  add(snapshot: GhostSnapshot, at?: number): Promise<AddResult>;
  /** Every ghost of one rules version and day: stand-in pool entries and player uploads. 0.7.0a D2: with scope
   *  "pool", only the seed pool (`seed`'s entries; a ghost stored both ways counts as a seed ghost). */
  bucket(rules: string, day: number, scope?: BucketScope): Promise<readonly PoolEntry[]>;
  /**
   * Make the stand-in pool of one rules version exactly `entries` (each already validated by
   * the caller). Pool entries of other rules versions and all player uploads are untouched.
   */
  replacePool(rules: string, entries: readonly PoolEntry[]): Promise<SeedCounts>;
}

/** Storage is down or refused a request: the server answers 503 rather than 500. */
export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}

/** One stored record: a ghosts.jsonl or pool.jsonl line, or a Tigris object body. */
export function encodeRecord(id: string, at: number, snapshot: GhostSnapshot): string {
  return JSON.stringify({ id, at, snapshot });
}

/** A pool record is fully determined by its snapshot (at = createdAt), so a re-seed is a no-op. */
export function poolRecord(e: PoolEntry): string {
  return encodeRecord(e.id, e.snapshot.createdAt, e.snapshot);
}

/** Decode a stored record. The snapshot must pass the strict check; its id is recomputed. */
export function decodeRecord(text: string): PoolEntry {
  const rec = JSON.parse(text) as { snapshot?: unknown };
  const snapshot = checkSnapshot(rec.snapshot);
  return { id: ghostId(snapshot), snapshot };
}

const bucketKey = (rules: string, day: number) => `${rules}|${day}`;

export class JsonlStore implements GhostStore {
  readonly kind = "jsonl" as const;
  readonly file: string;
  readonly poolFile: string;
  skipped = 0; // lines that failed to parse or check on load
  private players = new Map<string, PoolEntry>(); // player uploads by id (ghosts.jsonl)
  private pool = new Map<string, PoolEntry>(); // stand-in pool by id, all rules versions (pool.jsonl)
  private buckets = new Map<string, PoolEntry[]>(); // "rules|day" -> pool entries, then uploads
  private poolBuckets = new Map<string, PoolEntry[]>(); // "rules|day" -> pool entries only (0.7.0a D2)

  constructor(readonly dataDir: string) {
    this.file = join(dataDir, STORE_FILE);
    this.poolFile = join(dataDir, POOL_FILE);
  }

  get where(): string {
    return this.dataDir; // ghosts.jsonl (uploads) and pool.jsonl (stand-in pool)
  }

  /** Read both files into memory (creating the data directory). Returns the ghost count. */
  load(): number {
    mkdirSync(this.dataDir, { recursive: true });
    this.pool = this.readFile(this.poolFile);
    this.players = this.readFile(this.file);
    this.reindex();
    return this.size;
  }

  private readFile(file: string): Map<string, PoolEntry> {
    const out = new Map<string, PoolEntry>();
    if (!existsSync(file)) return out;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const e = decodeRecord(line);
        if (!out.has(e.id)) out.set(e.id, e);
      } catch {
        this.skipped++;
      }
    }
    return out;
  }

  private reindex(): void {
    this.buckets.clear();
    this.poolBuckets.clear();
    for (const e of this.pool.values()) {
      this.index(e);
      this.index(e, this.poolBuckets);
    }
    for (const e of this.players.values()) this.index(e);
  }

  private index(e: PoolEntry, into = this.buckets): void {
    const k = bucketKey(e.snapshot.rules, e.snapshot.day);
    const b = into.get(k);
    if (!b) into.set(k, [e]);
    else if (!b.some((x) => x.id === e.id)) b.push(e);
  }

  async add(snapshot: GhostSnapshot, at = Date.now()): Promise<AddResult> {
    const s = checkSnapshot(snapshot);
    const id = ghostId(s);
    if (this.players.has(id)) return { id, created: false };
    appendFileSync(this.file, encodeRecord(id, at, s) + "\n"); // durable first, then indexed
    const e = { id, snapshot: s };
    this.players.set(id, e);
    this.index(e);
    return { id, created: true };
  }

  async bucket(rules: string, day: number, scope: BucketScope = "all"): Promise<readonly PoolEntry[]> {
    return (scope === "pool" ? this.poolBuckets : this.buckets).get(bucketKey(rules, day)) ?? [];
  }

  get size(): number {
    let n = this.players.size;
    for (const id of this.pool.keys()) if (!this.players.has(id)) n++;
    return n;
  }

  async replacePool(rules: string, entries: readonly PoolEntry[]): Promise<SeedCounts> {
    const want = new Map<string, string>();
    for (const e of entries) {
      if (e.snapshot.rules !== rules) throw new Error(`pool entry ${e.id} has rules ${e.snapshot.rules}, not ${rules}`);
      want.set(e.id, poolRecord(e));
    }
    mkdirSync(this.dataDir, { recursive: true });
    const lines = existsSync(this.poolFile) ? readFileSync(this.poolFile, "utf8").split("\n").filter((l) => l.trim()) : [];
    const keep: string[] = [];
    const have = new Set<string>();
    let unchanged = 0, removed = 0, dirty = false;
    for (const line of lines) {
      let e: PoolEntry | null = null;
      try {
        e = decodeRecord(line);
      } catch {
        e = null;
      }
      if (!e) {
        keep.push(line); // BUMP-1E E.3 (REVIEW-STAGE0911): a line this build cannot decode is another build's (a newer format a rollback build does not know) or junk: kept, never dropped
      } else if (e.snapshot.rules !== rules) {
        keep.push(line); // another rules version's pool: not this seed's business
      } else if (want.get(e.id) === line && !have.has(e.id)) {
        keep.push(line);
        have.add(e.id);
        unchanged++;
      } else {
        dirty = true; // a stale entry, a duplicate, a differing copy or an unreadable line
        if (!e || !want.has(e.id)) removed++;
      }
    }
    let written = 0;
    for (const [id, line] of want) {
      if (have.has(id)) continue;
      keep.push(line);
      written++;
    }
    if (written || dirty) {
      const tmp = `${this.poolFile}.tmp`;
      writeFileSync(tmp, keep.length ? keep.join("\n") + "\n" : "");
      renameSync(tmp, this.poolFile); // atomic replace: readers see the old pool or the new one
    }
    this.pool = this.readFile(this.poolFile);
    this.reindex();
    return { written, unchanged, removed };
  }
}
