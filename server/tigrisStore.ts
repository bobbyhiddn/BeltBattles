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

import { MAX_DAY, type GhostSnapshot, type PoolEntry, checkSnapshot, ghostId } from "../src/net/snapshot";
import { S3Client } from "./s3";
import { decodeRecord, encodeRecord, poolRecord, StorageError, type AddResult, type GhostStore, type SeedCounts } from "./store";

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
  bad: Set<string>; // keys whose body failed to decode: not fetched again while they exist
  listedAt: number; // clock at the start of the last successful LIST; 0 = never listed
  retryAt: number; // after a failed LIST: no new attempt before this
  inflight: Promise<void> | null; // single flight: concurrent requests share one refresh
  usedAt: number;
  view: PoolEntry[] | null; // cached answer for bucket()
}

export interface TigrisStoreOptions {
  ttlMs?: number; // bucket cache TTL; default 60 s
  maxBuckets?: number; // cached (rules, day) buckets before the least recently used is dropped; default 64
  concurrency?: number; // parallel GETs, PUTs and DELETEs; default 16
  retryMs?: number; // wait after a failed bucket LIST before trying again; default 5 s
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
  private readonly now: () => number;
  private readonly log: (line: string) => void;

  /** No I/O: a new store has not touched storage and will not until a request needs it. */
  constructor(readonly s3: S3Client, opts: TigrisStoreOptions = {}) {
    this.ttlMs = opts.ttlMs ?? 60_000;
    this.maxBuckets = opts.maxBuckets ?? 64;
    this.concurrency = opts.concurrency ?? 16;
    this.retryMs = opts.retryMs ?? 5_000;
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? (() => {});
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
      b = { byKey: new Map(), bad: new Set(), listedAt: 0, retryAt: 0, inflight: null, usedAt: 0, view: null };
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
    if (b.byKey.has(key)) return { id, created: false };
    const entry = { id, snapshot: s };
    if (await this.s3.head(key)) {
      this.remember(b, key, entry); // stored by an earlier request or another machine
      return { id, created: false };
    }
    await this.s3.put(key, encodeRecord(id, at, s)); // durable first...
    this.remember(b, key, entry); // ...then indexed
    return { id, created: true };
  }

  private remember(b: Bucket, key: string, e: PoolEntry): void {
    b.byKey.set(key, e);
    b.view = null;
  }

  async bucket(rules: string, day: number): Promise<readonly PoolEntry[]> {
    if (!storableRules(rules) || !Number.isInteger(day) || day < 1 || day > MAX_DAY) return []; // nothing can be stored there
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
    return this.view(b);
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

  /** LIST the bucket, GET only keys not held yet, drop keys that vanished. */
  private async refresh(rules: string, day: number, b: Bucket): Promise<void> {
    const started = this.now();
    const before = new Set(b.byKey.keys()); // keys written during this refresh are kept
    const listed = await this.s3.listAll(bucketPrefix(rules, day));
    const present = new Set<string>();
    const missing: string[] = [];
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
      if (!b.byKey.has(o.key) && !b.bad.has(o.key)) missing.push(o.key);
    }
    await mapLimit(missing, this.concurrency, async (key) => {
      const text = await this.s3.getText(key);
      if (text === null) return; // deleted between LIST and GET (a re-seed)
      try {
        const e = decodeRecord(text);
        const k = parseKey(key)!;
        if (e.id !== k.id || e.snapshot.rules !== rules || e.snapshot.day !== day) throw new Error("the record does not match its key");
        b.byKey.set(key, e);
      } catch (err) {
        b.bad.add(key);
        this.skipped++;
        this.log(`ghost store: skipping bad object ${key}: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
    for (const key of before) if (!present.has(key)) b.byKey.delete(key);
    for (const key of b.bad) if (!present.has(key)) b.bad.delete(key);
    b.listedAt = started;
    b.retryAt = 0;
    b.view = null;
  }

  async replacePool(rules: string, entries: readonly PoolEntry[]): Promise<SeedCounts> {
    const want = new Map<string, string>();
    for (const e of entries) {
      if (e.snapshot.rules !== rules) throw new Error(`pool entry ${e.id} has rules ${e.snapshot.rules}, not ${rules}`);
      want.set(objectKey("pool", rules, e.snapshot.day, e.id), poolRecord(e));
    }
    const days = Array.from({ length: MAX_DAY }, (_, i) => i + 1);
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
