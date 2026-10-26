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
import { DEFAULT_BUCKET_CAP, DEFAULT_CACHE_MAX, oldestKeys, overflowKeys, type CacheStats, type CapItem } from "./bucketCap"; // S3: the cache's size

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
  /** S3: the cache's size (buckets, player ghosts held, the cap and the ceiling, what was dropped). Reads memory only; /v1/health reports it. */
  cacheStats?(): CacheStats;
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
  // S3 (the same cap as the Tigris store's, bucketCap.ts): player ghosts in memory are the newest `bucketCap` of a bucket and `cacheMax` in all; the
  // file keeps every line. `known` holds the id of every upload ever loaded or added (strings only), so a re-sent ghost that left memory is still 200.
  private readonly bucketCap: number;
  private readonly cacheMax: number;
  private known = new Set<string>();
  private order = new Map<string, number>(); // player id -> arrival number (file order, then adds): older = smaller
  private seq = 0;
  private used = new Map<string, number>(); // bucket key -> the last time a match read it (a counter): the least recently used loses first
  private tick = 0;
  private evictedByCap = 0;
  private evictedByCeiling = 0;

  constructor(readonly dataDir: string, opts: { bucketCap?: number; cacheMax?: number } = {}) {
    this.file = join(dataDir, STORE_FILE);
    this.poolFile = join(dataDir, POOL_FILE);
    this.bucketCap = Math.max(1, opts.bucketCap ?? DEFAULT_BUCKET_CAP);
    this.cacheMax = Math.max(1, opts.cacheMax ?? DEFAULT_CACHE_MAX);
  }

  /** S3: what /v1/health reports about the cache. */
  cacheStats(): CacheStats {
    return {
      buckets: this.buckets.size, playerGhosts: this.players.size, bucketCap: this.bucketCap, ceiling: this.cacheMax,
      evictedByCap: this.evictedByCap, evictedByCeiling: this.evictedByCeiling,
    };
  }

  /** The player ghosts of one bucket that may be dropped (an upload that is also a seed ghost counts as a seed ghost: never dropped). */
  private droppable(k: string): CapItem[] {
    const out: CapItem[] = [];
    for (const e of this.buckets.get(k) ?? []) if (this.players.has(e.id) && !this.pool.has(e.id)) out.push({ key: e.id, at: this.order.get(e.id) ?? 0, endless: e.snapshot.mode === "endless" });
    return out;
  }

  private forget(k: string, id: string, why: "cap" | "ceiling"): void {
    const b = this.buckets.get(k);
    const i = b ? b.findIndex((x) => x.id === id) : -1;
    if (b && i >= 0) b.splice(i, 1);
    this.players.delete(id);
    this.order.delete(id);
    if (why === "cap") this.evictedByCap++;
    else this.evictedByCeiling++;
  }

  private capBucket(k: string): void {
    const items = this.droppable(k);
    if (items.length <= this.bucketCap) return;
    for (const id of overflowKeys(items, this.bucketCap)) this.forget(k, id, "cap");
  }

  /** Past cacheMax player ghosts the least recently read bucket that holds more than its fair share (cacheMax over the buckets holding ghosts) loses
   *  its oldest first, down to the share and no further (as the Tigris store does: a bucket in use is not emptied). */
  private enforceCeiling(): void {
    for (;;) {
      const excess = this.players.size - this.cacheMax;
      if (excess <= 0) return;
      const sizes = new Map<string, number>();
      for (const k of this.buckets.keys()) {
        const n = this.droppable(k).length;
        if (n > 0) sizes.set(k, n);
      }
      const share = Math.max(1, Math.floor(this.cacheMax / Math.max(1, sizes.size)));
      const lru = (over: number): string | null => {
        let victim: string | null = null;
        for (const [k, n] of sizes) if (n > over && (victim === null || (this.used.get(k) ?? 0) < (this.used.get(victim) ?? 0))) victim = k;
        return victim;
      };
      let victim = lru(share);
      let n = victim === null ? 0 : Math.min(excess, sizes.get(victim)! - share);
      if (victim === null) {
        victim = lru(0);
        if (victim === null) return;
        n = Math.min(excess, sizes.get(victim)!);
      }
      for (const id of oldestKeys(this.droppable(victim), n)) this.forget(victim, id, "ceiling");
    }
  }

  get where(): string {
    return this.dataDir; // ghosts.jsonl (uploads) and pool.jsonl (stand-in pool)
  }

  /** Read both files into memory (creating the data directory). Returns the ghost count. */
  load(): number {
    mkdirSync(this.dataDir, { recursive: true });
    this.pool = this.readFile(this.poolFile);
    this.players = this.readFile(this.file);
    for (const id of this.players.keys()) {
      this.known.add(id);
      this.order.set(id, ++this.seq); // file order = arrival order
    }
    this.reindex();
    for (const k of [...this.buckets.keys()]) this.capBucket(k); // S3: only the newest of each bucket stay in memory (the file keeps every line)
    this.enforceCeiling();
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
    if (this.known.has(id)) return { id, created: false }; // S3: known, not players: an upload that left memory is still stored
    appendFileSync(this.file, encodeRecord(id, at, s) + "\n"); // durable first, then indexed
    const e = { id, snapshot: s };
    this.known.add(id);
    this.players.set(id, e);
    this.order.set(id, ++this.seq);
    this.index(e);
    const k = bucketKey(s.rules, s.day);
    this.capBucket(k); // S3: the newest of the bucket stay in memory; the oldest of the kind that holds more leaves it
    this.enforceCeiling();
    return { id, created: true };
  }

  async bucket(rules: string, day: number, scope: BucketScope = "all"): Promise<readonly PoolEntry[]> {
    const k = bucketKey(rules, day);
    if (this.buckets.has(k)) this.used.set(k, ++this.tick); // only buckets that exist: a request cannot grow this map
    return (scope === "pool" ? this.poolBuckets : this.buckets).get(k) ?? [];
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
