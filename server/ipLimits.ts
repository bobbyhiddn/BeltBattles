// S3 (REQ-BFG-120; BRIEF-S3 goal 3; LAUNCH-0 REPORT 1.4 item 4, 1.8): the per-IP limits, in one place.
//
//   ipKey(ip)         what every per-IP limit keys on: an IPv4 address as it is, an IPv6 address as its /64 prefix (a client can rotate
//                     the low 64 bits of its address at will, so the address itself is no identity). Pure text, never logged or stored.
//   BoundedMap        an insertion-ordered map with a hard size bound: the oldest entries leave first, so no attack with many IPs or keys
//                     can grow a map without limit.
//   RateLimiter       the 120-requests-a-minute limiter app.ts always had (a fixed window per client IP), now keyed on ipKey and bounded.
//   NewKeyLimiter     the per-IP daily limit on keys the server has not seen before (ghost uploads and PUT /v1/profile).
//
// Everything here lives in memory only: a restart forgets it (which only ever makes a limit more lenient, never stricter), and no address
// or key is written anywhere. The proxy trust (whose address counts) stays app.ts's clientIp.

/** Parse an IPv6 literal into its 8 groups, or null if it is not one. Accepts "::" compression, an embedded IPv4 tail and a %zone. */
function parseV6(text: string): number[] | null {
  let t = text.split("%")[0].toLowerCase();
  const tail4 = /^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(t);
  if (tail4) {
    const p = [tail4[2], tail4[3], tail4[4], tail4[5]].map(Number);
    if (p.some((n) => n > 255)) return null;
    t = `${tail4[1]}${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`;
  }
  const halves = t.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1 ? head.length !== 8 : head.length + rest.length > 7) return null;
  const all = halves.length === 2 ? [...head, ...Array<string>(8 - head.length - rest.length).fill("0"), ...rest] : head;
  const groups = all.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return groups.length === 8 && groups.every((g) => !Number.isNaN(g)) ? groups : null;
}

/**
 * The key every per-IP limit uses for a client address (app.ts clientIp).
 * IPv4: the address. IPv4-mapped IPv6 (::ffff:a.b.c.d, how a dual-stack socket shows an IPv4 client): that IPv4 address.
 * Other IPv6: the /64 prefix, "2001:db8:1:2::/64" (the first four groups, lower case, no leading zeros). Anything that is not an IP
 * literal (the socket had no address: "unknown") is returned as it is.
 */
export function ipKey(ip: string): string {
  if (!ip.includes(":")) return ip;
  const g = parseV6(ip);
  if (!g) return ip;
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0xffff) return `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
  return `${g[0].toString(16)}:${g[1].toString(16)}:${g[2].toString(16)}:${g[3].toString(16)}::/64`;
}

/**
 * A Map that never holds more than `max` entries: set() puts the key in the newest position (a replaced key moves there too) and drops
 * the oldest entries past the bound. `evictions` counts what was dropped since the map was made. touch() is the LRU use.
 */
export class BoundedMap<K, V> {
  private readonly m = new Map<K, V>();
  evictions = 0;
  constructor(readonly max: number) {
    if (!Number.isInteger(max) || max < 1) throw new Error("BoundedMap: max must be a positive integer");
  }
  get size(): number {
    return this.m.size;
  }
  get(k: K): V | undefined {
    return this.m.get(k);
  }
  has(k: K): boolean {
    return this.m.has(k);
  }
  set(k: K, v: V): void {
    this.m.delete(k);
    this.m.set(k, v);
    while (this.m.size > this.max) {
      this.m.delete(this.m.keys().next().value as K);
      this.evictions++;
    }
  }
  /** Mark `k` as used just now (the newest position). */
  touch(k: K): void {
    const v = this.m.get(k);
    if (v !== undefined || this.m.has(k)) {
      this.m.delete(k);
      this.m.set(k, v as V);
    }
  }
  delete(k: K): boolean {
    return this.m.delete(k);
  }
  entries(): IterableIterator<[K, V]> {
    return this.m.entries();
  }
  keys(): IterableIterator<K> {
    return this.m.keys();
  }
}

/** Most client addresses the request limiter remembers at once (a /64 or an IPv4 address each, about 100 bytes: 5 MB at the bound). */
export const RATE_MAP_MAX = 50_000;

/** The per-IP request limiter (BB_GHOST_RATE a minute, all routes): a fixed window per client key. Bounded: past RATE_MAP_MAX clients
 *  the oldest windows are forgotten (which can only let an address through again, never refuse one it should not). */
export class RateLimiter {
  private readonly hits: BoundedMap<string, { start: number; n: number }>;
  private swept = 0;
  constructor(readonly windowMs: number, readonly max: number, mapMax = RATE_MAP_MAX) {
    this.hits = new BoundedMap(mapMax);
  }

  allow(ip: string, now: number): boolean {
    if (this.hits.size > 1000 && now - this.swept >= this.windowMs) {
      this.swept = now;
      for (const [k, h] of this.hits.entries()) if (now - h.start >= this.windowMs) this.hits.delete(k);
    }
    let h = this.hits.get(ip);
    if (!h || now - h.start >= this.windowMs) {
      h = { start: now, n: 0 };
      this.hits.set(ip, h);
    }
    return ++h.n <= this.max;
  }

  get tracked(): number {
    return this.hits.size;
  }
}

export interface NewKeyOptions {
  /** New keys one client address may bring in one window (BB_GHOST_NEW_KEYS_PER_IP_DAY). */
  perIp: number;
  /** The window, ms (default 24 h): it starts at the address's first new key. */
  windowMs?: number;
  /** Most client addresses tracked at once (default 50,000). */
  ipMax?: number;
  /** Most keys remembered as seen at once, least recently used out first (default 20,000). */
  seenMax?: number;
  /** Asked only for a key this process has not seen from an address that is already past its allowance: does storage know this key
   *  (a stored profile)? A key it knows is a returning player, not a new key, and passes. Errors count as "unknown". */
  known?: (playerId: string) => Promise<boolean>;
}

/**
 * The per-IP daily limit on NEW keys. "Seen" means: this process has accepted the key since it started (an LRU of seenMax keys), or
 * storage holds a profile for it (`known`, asked only when an address is over its allowance). A key that has been seen keeps working
 * from any address, forever; only a key nobody knows is counted, against the address that brings it, and only once. The first
 * `perIp` new keys of an address in a window pass; the next one is refused until the window ends. A restart forgets the counts and the
 * seen set together, so after one every address has its allowance again: the limit can only get more lenient, never refuse a
 * returning player that storage knows.
 * Memory: at most ipMax address entries ({start, n}) and seenMax key strings; both evict the oldest entry first.
 */
export class NewKeyLimiter {
  private readonly ips: BoundedMap<string, { start: number; n: number }>;
  private readonly seen: BoundedMap<string, true>;
  private readonly perIp: number;
  private readonly windowMs: number;
  private readonly known: (playerId: string) => Promise<boolean>;

  constructor(o: NewKeyOptions) {
    this.perIp = o.perIp;
    this.windowMs = o.windowMs ?? 86_400_000;
    this.ips = new BoundedMap(o.ipMax ?? 50_000);
    this.seen = new BoundedMap(o.seenMax ?? 20_000);
    this.known = o.known ?? (async () => false);
  }

  /** null: the key may go on. A number: refused; the seconds until its address's window ends (Retry-After). */
  async admit(ip: string, playerId: string, now: number): Promise<number | null> {
    if (this.seen.has(playerId)) {
      this.seen.touch(playerId);
      return null;
    }
    let d = this.ips.get(ip);
    if (!d || now - d.start >= this.windowMs) {
      d = { start: now, n: 0 };
      this.ips.set(ip, d);
    }
    if (d.n < this.perIp) {
      d.n++;
      this.seen.set(playerId, true);
      return null;
    }
    let returning = false;
    try {
      returning = await this.known(playerId);
    } catch {
      returning = false;
    }
    if (returning) {
      this.seen.set(playerId, true);
      return null;
    }
    return Math.max(1, Math.ceil((d.start + this.windowMs - now) / 1000));
  }

  get trackedIps(): number {
    return this.ips.size;
  }
  get trackedKeys(): number {
    return this.seen.size;
  }
  get evictions(): number {
    return this.ips.evictions + this.seen.evictions;
  }
}
