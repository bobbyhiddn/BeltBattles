// Tigris ghost store (the S3 API via s3.ts): one object per ghost, (rules, day) buckets loaded
// lazily and cached, so a start never reads the bucket and one machine sees another's writes
// within the cache TTL.
//
// Object layout. Keys only use [A-Za-z0-9._/-], so ListObjectsV2 XML never needs unescaping:
//   ghosts/<rules>/d<DD>/pool/<id>.json     stand-in pool, written only by `seed`
//   ghosts/<rules>/d<DD>/player/<id>.json   player uploads, written only by POST /v1/ghosts
// One (rules, day) bucket is the single LIST prefix ghosts/<rules>/d<DD>/; the pool has its own
// prefix below it, so a seed lists, rewrites and deletes pool keys without ever seeing a player
// key. <id> is the content hash (ghostId), so a key's body never changes. Each body is the same
// {"id","at","snapshot"} record as a ghosts.jsonl line (a pool record's `at` is its createdAt).
//
// Loading: a bucket is listed on its first match request and its objects fetched (16 at a time);
// after the TTL (60 s) the next request re-lists it, fetches only new keys and drops vanished
// ones. If a refresh fails the stale bucket is served and the refresh retried a few seconds later.
// Writes: HEAD (already stored? then 200, same id), then PUT; the ghost is indexed only after the
// PUT succeeded, so 201 always means durable.

import { endlessMaxDay, maxDayFor, type GhostSnapshot, type PoolEntry, checkSnapshot, ghostId } from "../src/net/snapshot"; // RUN-1 (D4, D6): the day buckets follow the rules' deepest day; ENDLESS-1: and an endless record's
import { DEFAULT_BUCKET_CAP, DEFAULT_CACHE_MAX, oldestKeys, overflowKeys, type CacheStats, type CapItem } from "./bucketCap"; // S3: the cache's size
import { S3Client } from "./s3";
import { decodeRecord, encodeRecord, poolRecord, StorageError, type AddResult, type BucketScope, type GhostStore, type SeedCounts } from "./store";

export type GhostKind = "pool" | "player";

/** Rules strings that can be a key segment: the snapshot pattern, minus "." and "..". */
const KEY_RULES = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,32}$/;
const KEY_PATTERN = /^ghosts\/([A-Za-z0-9._-]{1,32})\/d(\d\d)\/(pool|player)\/([A-Za-z0-9_-]{1,64})\.json$/;

export function storableRules(rules: string): boolean {
  return KEY_RULES.test(rules);
}

function checkDay(day: number): string {
  if (!Number.isInteger(day) || day < 1 || day > 99) throw new Error(`day ${day} cannot be a key segment`);
  return String(day).padStart(2, "0");
}

/** LIST prefix of one (rules, day) bucket: pool entries and player uploads. */
export function bucketPrefix(rules: string, day: number): string {
  if (!storableRules(rules)) throw new Error(`rules ${JSON.stringify(rules)} cannot be a key segment`);
  return `ghosts/${rules}/d${checkDay(day)}/`;
}

/** LIST prefix of one (rules, day) bucket's stand-in pool. */
export function poolPrefix(rules: string, day: number): string {
  return `${bucketPrefix(rules, day)}pool/`;
}

export function objectKey(kind: GhostKind, rules: string, day: number, id: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error(`ghost id ${JSON.stringify(id)} cannot be a key segment`);
  return `${bucketPrefix(rules, day)}${kind}/${id}.json`;
}

export function parseKey(key: string): { rules: string; day: number; kind: GhostKind; id: string } | null {
  const m = KEY_PATTERN.exec(key);
  if (!m || !storableRules(m[1])) return null;
  return { rules: m[1], day: Number(m[2]), kind: m[3] as GhostKind, id: m[4] };
}

/** Run `fn` over `items`, at most `limit` at a time. Rejects with the first error. */
async function mapLimit<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

interface Bucket {
  byKey: Map<string, PoolEntry>; // objects known to exist under this prefix
  at: Map<string, number>; // S3: the PLAYER objects held (key -> upload time, ms): what the bucket cap and the ceiling order by. Pool keys are never in it
  bad: Set<string>; // keys whose body failed to decode: not fetched again while they exist
  listedAt: number; // clock at the start of the last successful LIST; 0 = never listed
  retryAt: number; // after a failed LIST: no new attempt before this
  inflight: Promise<void> | null; // single flight: concurrent requests share one refresh
  usedAt: number;
  view: PoolEntry[] | null; // cached answer for bucket()
  poolView: PoolEntry[] | null; // cached answer for bucket(..., "pool"): pool/ keys only (0.7.0a D2)
}

export interface TigrisStoreOptions {
  ttlMs?: number; // bucket cache TTL; default 60 s
  maxBuckets?: number; // cached (rules, day) buckets before the least recently used is dropped; default 64
  concurrency?: number; // parallel GETs, PUTs and DELETEs; default 16
  retryMs?: number; // wait after a failed bucket LIST before trying again; default 5 s
  /** S3: player ghosts one bucket keeps in memory (the newest; seed ghosts never count); default 2,000 (bucketCap.ts). */
  bucketCap?: number;
  /** S3: player ghosts the whole cache keeps; past it the least recently used bucket loses its oldest first; default 12,000 (bucketCap.ts). */
  cacheMax?: number;
  now?: () => number;
  log?: (line: string) => void;
}

export class TigrisStore implements GhostStore {
  readonly kind = "tigris" as const;
  skipped = 0; // objects that failed to decode
  private readonly buckets = new Map<string, Bucket>();
  private readonly ttlMs: number;
  private readonly maxBuckets: number;
  private readonly concurrency: number;
  private readonly retryMs: number;
  private readonly bucketCap: number; // S3
  private readonly cacheMax: number; // S3
  private evictedByCap = 0; // S3: player ghosts dropped from memory since this store was made
  private evictedByCeiling = 0;
  private readonly adding = new Map<string, Promise<AddResult>>(); // S3: add() single flight: the stores in flight right now, by object key
  private readonly now: () => number;
  private readonly log: (line: string) => void;

  /** No I/O: a new store has not touched storage and will not until a request needs it. */
  constructor(readonly s3: S3Client, opts: TigrisStoreOptions = {}) {
    this.ttlMs = opts.ttlMs ?? 60_000;
    this.maxBuckets = opts.maxBuckets ?? 64;
    this.concurrency = opts.concurrency ?? 16;
    this.retryMs = opts.retryMs ?? 5_000;
    this.bucketCap = Math.max(1, opts.bucketCap ?? DEFAULT_BUCKET_CAP);
    this.cacheMax = Math.max(1, opts.cacheMax ?? DEFAULT_CACHE_MAX);
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? (() => {});
  }

  /** S3: what /v1/health reports about the cache. Reads memory only. */
  cacheStats(): CacheStats {
    return {
      buckets: this.buckets.size, playerGhosts: this.playerGhosts(), bucketCap: this.bucketCap, ceiling: this.cacheMax,
      evictedByCap: this.evictedByCap, evictedByCeiling: this.evictedByCeiling,
    };
  }

  /** Player ghosts held across all buckets. */
  private playerGhosts(): number {
    let n = 0;
    for (const b of this.buckets.values()) n += b.at.size;
    return n;
  }

  get where(): string {
    return this.s3.describe();
  }

  get size(): number {
    let n = 0;
    for (const b of this.buckets.values()) n += b.byKey.size;
    return n;
  }

  /** Cached (rules, day) buckets, listed or not. */
  get cachedBuckets(): number {
    return this.buckets.size;
  }

  /** The cache slot for a bucket (no I/O). Drops the least recently used idle slot when full. */
  private slot(rules: string, day: number): Bucket {
    const k = `${rules}|${day}`;
    let b = this.buckets.get(k);
    if (!b) {
      b = { byKey: new Map(), at: new Map(), bad: new Set(), listedAt: 0, retryAt: 0, inflight: null, usedAt: 0, view: null, poolView: null };
      this.buckets.set(k, b);
      if (this.buckets.size > this.maxBuckets) {
        let oldest: string | null = null, at = Infinity;
        for (const [key, c] of this.buckets) if (c !== b && !c.inflight && c.usedAt < at) [oldest, at] = [key, c.usedAt];
        if (oldest !== null) this.buckets.delete(oldest);
      }
    }
    b.usedAt = this.now();
    return b;
  }

  async add(snapshot: GhostSnapshot, at = this.now()): Promise<AddResult> {
    const s = checkSnapshot(snapshot);
    const id = ghostId(s);
    const key = objectKey("player", s.rules, s.day, id);
    const b = this.slot(s.rules, s.day);
    // S3 (S2-REPORT section 4): single flight per key. Two identical uploads in flight used to both pass the check below, both HEAD, both PUT the
    // same content-addressed key and both answer 201. Now the second waits for the first and then looks again: held -> 200 (created: false), as
    // a sequential re-send is; if the first failed (storage down) the second tries for itself.
    for (;;) {
      if (b.byKey.has(key)) return { id, created: false };
      const flying = this.adding.get(key);
      if (!flying) break;
      await flying.catch(() => {});
    }
    const run = this.store1(b, key, { id, snapshot: s }, at);
    this.adding.set(key, run);
    try {
      return await run;
    } finally {
      if (this.adding.get(key) === run) this.adding.delete(key);
    }
  }

  private async store1(b: Bucket, key: string, entry: PoolEntry, at: number): Promise<AddResult> {
    if (await this.s3.head(key)) {
      this.remember(b, key, entry, at); // stored by an earlier request or another machine
      return { id: entry.id, created: false };
    }
    await this.s3.put(key, encodeRecord(entry.id, at, entry.snapshot)); // durable first...
    this.remember(b, key, entry, at); // ...then indexed
    return { id: entry.id, created: true };
  }

  /** Index a player ghost this process just stored (or found stored). S3: it is the newest of its bucket; if the bucket is over its cap, the
   *  oldest ghost of the kind that holds more leaves memory (never storage), and if the cache is over its ceiling the least recently used
   *  bucket gives up its oldest ghosts. */
  private remember(b: Bucket, key: string, e: PoolEntry, at: number): void {
    b.byKey.set(key, e);
    b.at.set(key, at);
    b.view = null;
    b.poolView = null;
    this.capBucket(b);
    this.enforceCeiling(b);
  }

  private items(b: Bucket): CapItem[] {
    return [...b.at].map(([key, at]) => ({ key, at, endless: b.byKey.get(key)?.snapshot.mode === "endless" }));
  }

  /** Forget one player ghost in memory (the object stays in storage). */
  private drop(b: Bucket, key: string, why: "cap" | "ceiling"): void {
    b.byKey.delete(key);
    if (b.at.delete(key)) {
      if (why === "cap") this.evictedByCap++;
      else this.evictedByCeiling++;
    }
    b.view = null;
    b.poolView = null;
  }

  /** S3: at most bucketCap player ghosts in a bucket. */
  private capBucket(b: Bucket): void {
    if (b.at.size <= this.bucketCap) return;
    for (const key of overflowKeys(this.items(b), this.bucketCap)) this.drop(b, key, "cap");
  }

  /** S3: at most cacheMax player ghosts in the cache. The least recently used bucket loses its oldest ghosts first; the bucket in use (`current`)
   *  is the last resort (only when nothing else holds a ghost). */
  private enforceCeiling(current: Bucket): void {
    for (;;) {
      const excess = this.playerGhosts() - this.cacheMax;
      if (excess <= 0) return;
      let victim: Bucket | null = null;
      for (const c of this.buckets.values()) if (c !== current && c.at.size > 0 && (victim === null || c.usedAt < victim.usedAt)) victim = c;
      victim ??= current.at.size > 0 ? current : null;
      if (!victim) return;
      for (const key of oldestKeys(this.items(victim), excess)) this.drop(victim, key, "ceiling");
    }
  }

  /** S3: how many of its newest player objects a bucket's LIST may fetch. The first load takes the newest bucketCap (never more than the
   *  ceiling); a re-list keeps what the bucket holds and grows only into room the cache has free, so a bucket the ceiling trimmed is not
   *  refilled from storage at every TTL just to be trimmed again. */
  private windowFor(b: Bucket): number {
    if (b.listedAt === 0) return Math.min(this.bucketCap, this.cacheMax);
    let others = 0;
    for (const c of this.buckets.values()) if (c !== b) others += c.at.size;
    return Math.min(this.bucketCap, Math.max(b.at.size, this.cacheMax - others, 0));
  }

  async bucket(rules: string, day: number, scope: BucketScope = "all"): Promise<readonly PoolEntry[]> {
    // nothing can be stored there. RUN-1 (REQ-BFG-059, D4, D6): the buckets of a long run's rules run to LONG_RUN_MAX_DAY (data
    // safety: a thin late day widens to earlier ones, and a record is refused past it); the 10-day rules keep MAX_DAY
    // ENDLESS-1 (REQ-BFG-059, BRIEF-ENDLESS1 3.4, storage choice (A)): the same buckets and keys (dDD covers 99), the day bound for
    // endless records only raised to ENDLESS_LAST_DAY under rules with endless (snapshot.ts endlessMaxDay); a run record keeps maxDayFor
    if (!storableRules(rules) || !Number.isInteger(day) || day < 1 || day > endlessMaxDay(rules)) return [];
    const b = this.slot(rules, day);
    const now = this.now();
    if (b.listedAt === 0 || now - b.listedAt >= this.ttlMs) {
      if (now < b.retryAt) {
        if (b.listedAt === 0) throw new StorageError(`ghost bucket ${bucketPrefix(rules, day)} is unavailable (retrying shortly)`);
      } else {
        b.inflight ??= this.refresh(rules, day, b).finally(() => {
          b.inflight = null;
        });
        try {
          await b.inflight;
        } catch (e) {
          b.retryAt = this.now() + this.retryMs;
          if (b.listedAt === 0) throw e;
          this.log(`ghost store: refresh of ${bucketPrefix(rules, day)} failed, serving the cached copy: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
    return scope === "pool" ? this.poolView(b) : this.view(b);
  }

  private view(b: Bucket): PoolEntry[] {
    if (!b.view) {
      const seen = new Set<string>();
      b.view = [];
      for (const e of b.byKey.values()) {
        if (seen.has(e.id)) continue; // the same ghost as a pool entry and an upload
        seen.add(e.id);
        b.view.push(e);
      }
    }
    return b.view;
  }

  /** 0.7.0a D2: the bucket's seed pool only (keys under pool/, which only `seed` writes). */
  private poolView(b: Bucket): PoolEntry[] {
    if (!b.poolView) {
      const seen = new Set<string>();
      b.poolView = [];
      for (const [key, e] of b.byKey) {
        if (parseKey(key)?.kind !== "pool" || seen.has(e.id)) continue;
        seen.add(e.id);
        b.poolView.push(e);
      }
    }
    return b.poolView;
  }

  /** LIST the bucket, GET only the keys that are not held yet and that the bucket keeps, drop keys that vanished or aged out of the cap.
   *  S3: "keeps" = every seed (pool) key, and the newest `windowFor(b)` player keys by LastModified; older player objects are listed but never
   *  fetched. A LIST still reads every key of the prefix (1,000 a page): the S3 API cannot list by time. */
  private async refresh(rules: string, day: number, b: Bucket): Promise<void> {
    const started = this.now();
    const before = new Set(b.byKey.keys()); // keys written during this refresh are kept
    const listed = await this.s3.listAll(bucketPrefix(rules, day));
    const present = new Set<string>();
    const missing: string[] = []; // pool keys not held yet: always fetched
    const players: { key: string; at: number; listed: boolean }[] = []; // every player object listed, held or not
    for (const o of listed) {
      const k = parseKey(o.key);
      if (!k || k.rules !== rules || k.day !== day) {
        if (!b.bad.has(o.key)) {
          b.bad.add(o.key);
          this.skipped++;
          this.log(`ghost store: ignoring foreign key ${JSON.stringify(o.key)}`);
        }
        present.add(o.key);
        continue;
      }
      present.add(o.key);
      if (b.bad.has(o.key)) continue;
      if (k.kind === "pool") {
        if (!b.byKey.has(o.key)) missing.push(o.key);
        continue;
      }
      players.push({ key: o.key, at: o.modified ?? b.at.get(o.key) ?? 0, listed: o.modified !== undefined });
    }
    // S3: the newest first (a tie by key, so the cut is the same on every machine); only the first `window` of them are fetched (when not held yet).
    // Held ghosts are NOT dropped for being outside the window: the cap below decides who leaves, kind-aware (a ghost held from an upload that
    // this process took stays while its kind holds fewer than the other; only a bucket with nothing held yet is cut by time alone)
    players.sort((x, y) => y.at - x.at || (x.key < y.key ? 1 : x.key > y.key ? -1 : 0));
    const keep = players.slice(0, this.windowFor(b));
    const fetchAt = new Map<string, number>();
    for (const p of keep) {
      if (!b.byKey.has(p.key)) {
        missing.push(p.key);
        fetchAt.set(p.key, p.at);
      } else if (p.listed) b.at.set(p.key, p.at); // a held ghost takes the time storage gives it, so the order is one clock's
    }
    await mapLimit(missing, this.concurrency, async (key) => {
      const text = await this.s3.getText(key);
      if (text === null) return; // deleted between LIST and GET (a re-seed)
      try {
        const e = decodeRecord(text);
        const k = parseKey(key)!;
        if (e.id !== k.id || e.snapshot.rules !== rules || e.snapshot.day !== day) throw new Error("the record does not match its key");
        b.byKey.set(key, e);
        if (k.kind === "player") b.at.set(key, fetchAt.get(key) ?? 0);
      } catch (err) {
        b.bad.add(key);
        this.skipped++;
        this.log(`ghost store: skipping bad object ${key}: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
    for (const key of before) {
      if (!present.has(key)) {
        b.byKey.delete(key);
        b.at.delete(key);
      }
    }
    for (const key of b.bad) if (!present.has(key)) b.bad.delete(key);
    b.listedAt = started;
    b.retryAt = 0;
    b.view = null;
    b.poolView = null;
    this.capBucket(b); // ghosts stored during the refresh may have put it over
    this.enforceCeiling(b);
  }

  async replacePool(rules: string, entries: readonly PoolEntry[]): Promise<SeedCounts> {
    const want = new Map<string, string>();
    for (const e of entries) {
      if (e.snapshot.rules !== rules) throw new Error(`pool entry ${e.id} has rules ${e.snapshot.rules}, not ${rules}`);
      want.set(objectKey("pool", rules, e.snapshot.day, e.id), poolRecord(e));
    }
    const days = Array.from({ length: maxDayFor(rules) }, (_, i) => i + 1); // RUN-1: a long run's pool runs to its deepest day
    const listed = (await Promise.all(days.map((d) => this.s3.listAll(poolPrefix(rules, d))))).flat();
    const stored = new Set(listed.map((o) => o.key));
    let written = 0, unchanged = 0, removed = 0;
    await mapLimit([...want], this.concurrency, async ([key, body]) => {
      if (stored.has(key) && (await this.s3.getText(key)) === body) {
        unchanged++;
        return;
      }
      await this.s3.put(key, body);
      written++;
    });
    const stale = listed.map((o) => o.key).filter((key) => !want.has(key));
    await mapLimit(stale, this.concurrency, async (key) => {
      await this.s3.delete(key);
      removed++;
    });
    for (const k of [...this.buckets.keys()]) if (k.startsWith(`${rules}|`)) this.buckets.delete(k); // re-list on next use
    return { written, unchanged, removed };
  }
}
