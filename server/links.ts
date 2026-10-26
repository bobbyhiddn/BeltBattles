// IDENT-1 (REQ-BFG-122): one canonical player that several device keys (and a Steam account) point at. This module is the
// identity layer's logic; server/linkStore.ts holds its records (see the key layout there), server/linkRoutes.ts the HTTP
// side, and app.ts only the route cases.
//
// The rules (LAUNCH-0 section 4.3, BRIEF-IDENT1):
//  - A key's own ID is base64url(SHA-256(raw public key)), as ever. A key LINKED to a player P uploads under P. P is always the
//    first key's own ID, never a new kind of string, so the pool, the match query, ghost-admin and the names code see nothing new.
//  - A key links to at most one player. A redeeming key whose player already has other keys or a Steam account is refused (409):
//    nothing is ever re-pointed silently. A lone key is allowed: its stored profile is merged into P's (mergeWire), then removed.
//  - A key that joins a player stops being one: `join` deletes its own live code and its own players/<key>.json in the same step that
//    writes its link. A code (or a Steam account) whose player has a links/keys/ record is refused (403), never followed.
//  - A player has room for MAX_LINKED keys besides its first, and MAX_LINKED Steam accounts. The link that would pass either is refused
//    (409) before anything is spent or written, and every reader takes what the writers can write (decodePlayer, decodeTombstone).
//  - A link code is 8 characters of a 31 symbol alphabet (no 0 O 1 I L), about 40 bits, live 10 minutes, single use, stored hashed.
//    A new code replaces the player's live one. Single use holds when two redeems race in one process: every change runs one at a
//    time (`locked`), and the code is consumed (deleted) before anything is linked. Across machines see the REPORT (section 6).
//  - Deleting a player removes its profile, its links (keys and Steam) and its live code, and writes tombstones/<P>.json naming P
//    and every key id that was linked to it. A Steam link is removed only if it names an id the delete tombstones (the player or one
//    of its keys): a record can list an account whose link names somebody else, and that link is theirs (IDENT-1 FIX2, N1). A
//    tombstoned id's ghosts are never served and its uploads answer 410: the set is held in memory, loaded at start and refreshed on a
//    timer (other machines), and updated at once on a delete. A refresh LISTs tombstones/ and reads only the keys it does not hold yet
//    (every TOMBSTONE_FULL_READ_MS it reads them all again, which is how a tombstone rewritten in place reaches every machine), at most
//    TOMBSTONE_READS_IN_FLIGHT reads at a time; a request waits at most TOMBSTONE_WAIT_MS for a refresh and goes on with the set it
//    holds. Only the first load is waited for in full (IDENT-1 FIX2, F4).
// Lookups are cached in memory (a key's player, a player's record). A positive entry lives 10 minutes, a "nothing there" entry 30
// seconds, so an upload costs at most one extra store read when the cache is cold, and a link another machine made shows within
// half a minute. The caches are this process's only state: the store is the truth.

import { ID_PATTERN } from "../src/net/snapshot";
import { mergeWire, type WireProfile } from "../src/net/profileWire";
import type { ProfileStore } from "./profileStore";
import type { LinkStore } from "./linkStore";
import { sha256Hex } from "./sigv4";
import { StorageError } from "./store";

/** The link code's symbols: A-Z without I L O, and 2-9 (no 0 or 1): 31 symbols, so 8 of them are 8 x log2(31) = 39.6 bits. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 8;
/** A link code lives this long. */
export const CODE_TTL_MS = 10 * 60_000;
/** A signed body's `at` may be this far from the server's clock (the replay bound). */
export const AT_WINDOW_MS = 10 * 60_000;
/**
 * The most keys that may be linked to one player (players/<P>.json `keys`), and the most Steam accounts (`steam`). The first key's own
 * id, P, is implicit and NOT counted: a full player is P and this many keys, so this many + 1 devices, and its tombstone names this
 * many + 1 ids. The writers (`join`, `linkSteam`) refuse the link that would pass it (409, nothing stored) and the readers (`idList`)
 * take exactly what the writers can write: ONE constant for both, so a record can never be written that reads back as nothing
 * (IDENT-1 FIX, F3). The tombstone is the one list read without a count limit (below).
 */
export const MAX_LINKED = 64;

const POSITIVE_TTL_MS = 10 * 60_000;
const NEGATIVE_TTL_MS = 30_000;
const TOMBSTONE_TTL_MS = 60_000;
/**
 * A request that holds a tombstone set waits at most this long (real time) for a reload of it, then goes on with the set it holds
 * (IDENT-1 FIX2, F4). The first load is not bounded: until it has succeeded no set is held, and the route answers 503.
 */
export const TOMBSTONE_WAIT_MS = 250;
/**
 * A reload reads only the tombstones it does not hold yet. Every this often it reads them all again, so a tombstone that was rewritten
 * in place (deletePlayer merges a prior one into it) reaches every machine within this time.
 */
export const TOMBSTONE_FULL_READ_MS = 6 * 60 * 60_000;
/** The most tombstone reads in flight at once: the first load, a refresh and a full read alike. */
export const TOMBSTONE_READS_IN_FLIGHT = 8;
const CACHE_MAX = 100_000;

export interface KeyLink {
  player: string;
  at: number;
}
export interface PlayerRecord {
  /** The keys linked to the player, besides its own (the first key's id is the player's id, and is not counted): at most MAX_LINKED. */
  keys: string[];
  /** The Steam ids linked to the player: at most MAX_LINKED. */
  steam: string[];
  at: number;
  /** The hash of the player's live link code, if any (so a new code can replace it). */
  code?: string;
}
export interface CodeRecord {
  player: string;
  expiresAt: number;
}
export interface Tombstone {
  at: number;
  ids: string[];
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isId = (x: unknown): x is string => typeof x === "string" && ID_PATTERN.test(x);
const isMs = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x) && x >= 0;
const idList = (x: unknown, max: number): string[] | null => (Array.isArray(x) && x.length <= max && x.every(isId) ? (x as string[]) : null);

function parse(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Run `fn` for every item with at most `limit` calls in flight. The first failure stops new calls from starting; the calls already in
 * flight finish (so the limit also holds across two runs that follow each other), and then the first failure is thrown.
 */
async function eachInFlight<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  let failed = false;
  let failure: unknown;
  const worker = async (): Promise<void> => {
    while (!failed && next < items.length) {
      const item = items[next++] as T;
      try {
        await fn(item);
      } catch (e) {
        if (!failed) failure = e;
        failed = true;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failed) throw failure;
}

export function decodeKeyLink(text: string | null): KeyLink | null {
  const o = parse(text);
  return isObj(o) && isId(o.player) && isMs(o.at) ? { player: o.player, at: o.at } : null;
}
export function decodePlayer(text: string | null): PlayerRecord | null {
  const o = parse(text);
  if (!isObj(o) || !isMs(o.at)) return null;
  const keys = idList(o.keys, MAX_LINKED), steam = idList(o.steam, MAX_LINKED);
  if (!keys || !steam) return null;
  if (o.code !== undefined && !(typeof o.code === "string" && /^[0-9a-f]{64}$/.test(o.code))) return null;
  return { keys, steam, at: o.at, ...(typeof o.code === "string" ? { code: o.code } : {}) };
}
export function decodeCode(text: string | null): CodeRecord | null {
  const o = parse(text);
  return isObj(o) && isId(o.player) && isMs(o.expiresAt) ? { player: o.player, expiresAt: o.expiresAt } : null;
}
export function decodeTombstone(text: string | null): Tombstone | null {
  const o = parse(text);
  if (!isObj(o) || !isMs(o.at)) return null;
  // No count limit: a tombstone is the deny list of a deleted player, and one that read back as nothing would serve that player's ghosts
  // again. A full player's names P and MAX_LINKED keys (MAX_LINKED + 1 ids); whatever more a delete merged in (a signer the record did
  // not list, an earlier tombstone's ids) still reads back whole.
  const ids = idList(o.ids, Infinity);
  return ids ? { at: o.at, ids } : null;
}

const keyOf = (id: string) => `links/keys/${id}.json`;
const playerOf = (id: string) => `players/${id}.json`;
const codeKey = (hash: string) => `linkcodes/${hash}.json`;
const steamKey = (id: string) => `links/steam/${id}.json`;
const tombKey = (id: string) => `tombstones/${id}.json`;

/** The hash a link code is stored under: SHA-256 over a domain tag and the 8 normalized characters (hex). */
export function hashCode(normalized: string): string {
  return sha256Hex(`bb-link-code-1\n${normalized}`);
}

/** The typed code as the 8 characters it stands for (case, spaces and dashes ignored), or null when it can't be a code. */
export function normalizeCode(typed: string): string | null {
  if (typeof typed !== "string" || typed.length > 32) return null;
  const c = typed.toUpperCase().replace(/[\s-]+/g, "");
  if (c.length !== CODE_LENGTH) return null;
  for (const ch of c) if (!CODE_ALPHABET.includes(ch)) return null;
  return c;
}

/** XXXX-XXXX. */
export function showCode(normalized: string): string {
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

/** A fresh code: 8 symbols, each drawn without modulo bias (a byte of 248 or more is dropped: 248 = 8 x 31). */
export function newCode(random: (n: number) => Uint8Array = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n))): string {
  let out = "";
  while (out.length < CODE_LENGTH) {
    for (const b of random(16)) {
      if (b >= 248) continue;
      out += CODE_ALPHABET[b % CODE_ALPHABET.length];
      if (out.length === CODE_LENGTH) break;
    }
  }
  return out;
}

export interface LinksOptions {
  now?: () => number;
  log?: (line: string) => void;
  /** Bytes for new link codes (tests pass fixed ones). */
  random?: (n: number) => Uint8Array;
  tombstoneTtlMs?: number;
}

/** The outcome of an operation: the HTTP status it maps to, and its data or its one plain reason. */
export type Outcome<T> = ({ status: 200 } & T) | { status: 403 | 409 | 410; error: string };

export interface Joined {
  player: string;
  profile: WireProfile | null;
}

export class Links {
  private readonly now: () => number;
  private readonly log: (line: string) => void;
  private readonly random: (n: number) => Uint8Array;
  private readonly tombstoneTtlMs: number;
  private chain: Promise<unknown> = Promise.resolve();
  private readonly gone = new Set<string>();
  /** The tombstones/ keys a finished reload has listed and read (an unreadable one included): their ids are in `gone`. */
  private goneHeld = new Set<string>();
  private goneLoadedAt = -1; // the clock reading at which the last good reload began; -1: never loaded
  private goneFullAt = -1; // the clock reading at which the last full read began; -1: none yet
  private goneLoading: Promise<void> | null = null;
  private readonly keyCache = new Map<string, { v: KeyLink | null; until: number }>();
  private readonly playerCache = new Map<string, { v: PlayerRecord | null; until: number }>();

  constructor(readonly store: LinkStore, readonly profiles: ProfileStore, opts: LinksOptions = {}) {
    this.now = opts.now ?? (() => Date.now());
    this.log = opts.log ?? (() => {});
    this.random = opts.random ?? ((n) => globalThis.crypto.getRandomValues(new Uint8Array(n)));
    this.tombstoneTtlMs = opts.tombstoneTtlMs ?? TOMBSTONE_TTL_MS;
  }

  /** One change at a time in this process, in the order asked (the single-use guarantee for a code). */
  private locked<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => {});
    return run;
  }

  // ------------------------------------------------------------------------------------------------------ tombstones

  /** Is this id (a player's or a key's) deleted? From memory only; ensureFresh() keeps the set current. */
  isGone(id: string): boolean {
    return this.gone.has(id);
  }

  get goneCount(): number {
    return this.gone.size;
  }

  /**
   * One reload of the tombstone set, in memory (at start, and by ensureFresh). One runs at a time: a call while one is in flight joins it.
   * It LISTs tombstones/ and reads the keys the set does not hold yet, at most TOMBSTONE_READS_IN_FLIGHT at a time; when nothing was ever
   * read, or the last full read began TOMBSTONE_FULL_READ_MS ago, it reads every key. A reload that fails part way (StorageError) changes
   * neither the set nor the held keys, so the next one reads the same keys again. The set only grows.
   * A failed reload is dealt with here, once, however many requests wait for it. With a set held it is kept: the failure is logged, the
   * next try is in 5 s, and this resolves. The first load rejects instead, and every request waiting for it gets the StorageError (503).
   */
  loadTombstones(): Promise<void> {
    if (this.goneLoading) return this.goneLoading;
    this.goneLoading = (async () => {
      try {
        await this.reload();
      } catch (e) {
        if (this.goneLoadedAt < 0) throw e;
        this.goneLoadedAt = this.now() - this.tombstoneTtlMs + 5_000; // retry in 5 s
        this.log(`identity store: tombstone refresh failed, keeping the set: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        this.goneLoading = null;
      }
    })();
    return this.goneLoading;
  }

  private async reload(): Promise<void> {
    const began = this.now();
    const full = this.goneFullAt < 0 || began - this.goneFullAt >= TOMBSTONE_FULL_READ_MS;
    const listed = await this.store.list("tombstones/");
    const toRead = full ? listed : listed.filter((k) => !this.goneHeld.has(k));
    const found = new Set<string>();
    let unreadable = 0;
    await eachInFlight(toRead, TOMBSTONE_READS_IN_FLIGHT, async (k) => {
      const t = decodeTombstone(await this.store.get(k));
      if (t) for (const id of t.ids) found.add(id);
      else unreadable++;
    });
    // Every read ended well: only now does the reload change anything. A tombstone that cannot be read is held all the same (it adds
    // no id), so it is logged once and not read again until the next full read.
    for (const id of found) this.gone.add(id);
    this.goneHeld = new Set(listed);
    if (full) this.goneFullAt = began;
    this.goneLoadedAt = began;
    for (let i = 0; i < unreadable; i++) this.log("identity store: skipping an unreadable tombstone");
  }

  /**
   * Before a route serves a ghost or takes an upload: the tombstone set has been loaded, and is not older than the refresh time.
   * The first load must succeed (StorageError otherwise: the route answers 503, so a deleted player's ghost is never served from
   * an incomplete set), and every request waits for it. Once a set is held, a request waits at most TOMBSTONE_WAIT_MS for a reload and
   * then goes on with the set it holds (IDENT-1 FIX2, F4): a refresh that is slow or stuck holds nobody up for longer. A refresh that
   * fails keeps the set and tries again in 5 s (loadTombstones).
   */
  async ensureFresh(): Promise<void> {
    if (this.goneLoadedAt >= 0 && this.now() - this.goneLoadedAt < this.tombstoneTtlMs) return;
    const reloading = this.loadTombstones();
    if (this.goneLoadedAt < 0) {
      await reloading;
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([reloading, new Promise<void>((resolve) => (timer = setTimeout(resolve, TOMBSTONE_WAIT_MS)))]);
    } finally {
      clearTimeout(timer); // the reload ended first: no timer is left behind
    }
  }

  /**
   * FOR TESTS ONLY (no route calls it). What ensureFresh does, except that it waits for the whole reload however long it takes, and
   * never rejects. A test that needs a reload's result before its next request awaits this instead of racing the TOMBSTONE_WAIT_MS bound.
   */
  async settleReload(): Promise<void> {
    const due = !(this.goneLoadedAt >= 0 && this.now() - this.goneLoadedAt < this.tombstoneTtlMs);
    await (due ? this.loadTombstones() : this.goneLoading)?.catch(() => {});
  }

  // ------------------------------------------------------------------------------------------------------ lookups

  private fresh<V>(cache: Map<string, { v: V; until: number }>, id: string): { v: V } | undefined {
    const c = cache.get(id);
    return c && c.until > this.now() ? c : undefined;
  }

  private remember<V>(cache: Map<string, { v: V; until: number }>, id: string, v: V | null): void {
    if (cache.size >= CACHE_MAX) cache.clear();
    (cache as Map<string, { v: V | null; until: number }>).set(id, { v, until: this.now() + (v === null ? NEGATIVE_TTL_MS : POSITIVE_TTL_MS) });
  }

  /** The key's link record (null: the key is not linked), cached. `fresh`: read the store, not the cache (inside a change). */
  async keyLink(keyId: string, bypass = false): Promise<KeyLink | null> {
    if (!bypass) {
      const c = this.fresh(this.keyCache, keyId);
      if (c) return c.v;
    }
    const v = decodeKeyLink(await this.store.get(keyOf(keyId)));
    this.remember(this.keyCache, keyId, v);
    return v;
  }

  async playerRecord(player: string, bypass = false): Promise<PlayerRecord | null> {
    if (!bypass) {
      const c = this.fresh(this.playerCache, player);
      if (c) return c.v;
    }
    const v = decodePlayer(await this.store.get(playerOf(player)));
    this.remember(this.playerCache, player, v);
    return v;
  }

  /** The canonical player of a signing key: the player it is linked to, else its own id. */
  async playerOfKey(keyId: string, bypass = false): Promise<string> {
    return (await this.keyLink(keyId, bypass))?.player ?? keyId;
  }

  /** A player's own id and the ids of every key linked to it: whose ghosts are the player's own. */
  async groupOf(player: string): Promise<string[]> {
    const rec = await this.playerRecord(player);
    return [player, ...(rec?.keys ?? [])];
  }

  /**
   * Every id that is the same player as `id` (a canonical player's, or a linked key's own): `id` itself, its player, and every
   * key linked to that player. The two lookups an unlinked id needs run together (two cached reads, one round trip).
   */
  async groupFor(id: string): Promise<string[]> {
    const [link, own] = await Promise.all([this.keyLink(id), this.playerRecord(id)]);
    const player = link?.player ?? id;
    const rec = player === id ? own : await this.playerRecord(player);
    return [...new Set([player, id, ...(rec?.keys ?? [])])];
  }

  private async putKeyLink(keyId: string, link: KeyLink): Promise<void> {
    await this.store.put(keyOf(keyId), JSON.stringify(link));
    this.remember(this.keyCache, keyId, link);
  }

  private async putPlayer(player: string, rec: PlayerRecord): Promise<void> {
    const text = JSON.stringify({ keys: rec.keys, steam: rec.steam, at: rec.at, ...(rec.code ? { code: rec.code } : {}) });
    await this.store.put(playerOf(player), text);
    this.remember(this.playerCache, player, rec);
  }

  // ------------------------------------------------------------------------------------------------------ link codes

  /**
   * A one-time link code for the player the signing key belongs to. A new code replaces the player's live one.
   * 410: the player (or the key) was deleted.
   */
  issueCode(signer: string): Promise<Outcome<{ code: string; expiresAt: number }>> {
    return this.locked(async () => {
      const player = await this.playerOfKey(signer, true);
      if (this.isGone(signer) || this.isGone(player)) return { status: 410, error: "this player was deleted" };
      const rec = (await this.playerRecord(player, true)) ?? { keys: [], steam: [], at: this.now() };
      let code = "";
      let hash = "";
      for (let tries = 0; ; tries++) {
        code = newCode(this.random);
        hash = hashCode(code);
        const clash = decodeCode(await this.store.get(codeKey(hash)));
        if (!clash || clash.expiresAt <= this.now() || clash.player === player) break;
        if (tries >= 8) throw new StorageError("identity: no free link code");
      }
      const expiresAt = this.now() + CODE_TTL_MS;
      if (rec.code && rec.code !== hash) await this.store.delete(codeKey(rec.code));
      await this.store.put(codeKey(hash), JSON.stringify({ player, expiresAt }));
      await this.putPlayer(player, { ...rec, code: hash, at: this.now() });
      return { status: 200, code: showCode(code), expiresAt };
    });
  }

  /**
   * The new device's key redeems a code. One refusal for a wrong, expired or used code, or one whose player is a device itself
   * (403: it never says which). 409: the key is linked to another player already, or its own player has other keys or a Steam
   * account (nothing is re-pointed silently), or the player it would join is full (MAX_LINKED keys).
   * 410: the key was deleted. A lone key's stored profile is merged into the player's (mergeWire) and removed.
   */
  redeem(signer: string, typed: string): Promise<Outcome<Joined>> {
    return this.locked(async () => {
      const refused = { status: 403 as const, error: "that code did not work" };
      const code = normalizeCode(typed);
      if (code === null) return refused;
      const hash = hashCode(code);
      const rec = decodeCode(await this.store.get(codeKey(hash)));
      if (!rec) return refused;
      if (rec.expiresAt <= this.now()) {
        await this.store.delete(codeKey(hash)); // an expired code is dropped when it is met
        return refused;
      }
      const player = rec.player;
      if (this.isGone(player)) return refused;
      if (this.isGone(signer)) return { status: 410, error: "this key was deleted" };
      // A code names a PLAYER. A key that is linked to another player is a device, and a device is never a player: `join` deletes the
      // live code of a key that joins, so no path leaves such a code, and this catches damaged data. It is the one plain refusal of a
      // used code (and counts as any refused code does); the code's record is left as it is and the link is not followed.
      if (await this.keyLink(player, true)) return refused;
      const decision = await this.canJoin(signer, player);
      if (decision.status !== 200) return decision;
      // the reads that can fail (the two profiles) happen first, with nothing changed; then the code is consumed (deleted) before
      // anything is linked, so whatever happens next the code is spent and no second redeem can use it
      return this.join(signer, player, decision.already, async () => {
        await this.store.delete(codeKey(hash));
        const prec = await this.playerRecord(player, true);
        if (prec?.code === hash) await this.putPlayer(player, { ...prec, code: undefined, at: this.now() });
      });
    });
  }

  /**
   * May `signer` join `player`? 200 with `already` when it belongs to it. 409 when it is linked elsewhere, or its own player has
   * other keys or a Steam account, or `player` already has MAX_LINKED keys. A lone key may.
   */
  private async canJoin(signer: string, player: string): Promise<{ status: 200; already: boolean } | { status: 409; error: string }> {
    if (signer === player) return { status: 200, already: true };
    const link = await this.keyLink(signer, true);
    if (link) {
      return link.player === player
        ? { status: 200, already: true }
        : { status: 409, error: "this device is already linked to another player" };
    }
    const own = await this.playerRecord(signer, true);
    if (own && (own.keys.length > 0 || own.steam.length > 0)) {
      return { status: 409, error: "this device already has linked devices or a Steam account" };
    }
    // the player has room for one more key (IDENT-1 FIX, F3): checked here, before the code is spent or anything is written, so the
    // refusal changes nothing. A key the record lists already (a crash left its link unwritten) takes no new place.
    const target = await this.playerRecord(player, true);
    if (target && target.keys.length >= MAX_LINKED && !target.keys.includes(signer)) {
      return { status: 409, error: "this player already has the most linked devices it can have" };
    }
    return { status: 200, already: false };
  }

  /** Link `signer` to `player`: its stored profile is merged into the player's and removed, then the records are written.
   *  Called inside a change, after canJoin said yes. `spend` runs after the reads that can fail and before the first write. */
  private async join(signer: string, player: string, already: boolean, spend?: () => Promise<void>): Promise<Outcome<Joined>> {
    // 1. the reads first (StorageError here changes nothing): the lone key's profile, the player's, and the lone key's own player
    //    record (canJoin saw to it that it holds no key and no Steam account: at most the hash of a live code of its own)
    const mine = already ? null : await this.profiles.get(signer);
    const theirs = await this.profiles.get(player);
    const merged = mine ? mergeWire(theirs?.profile ?? null, mine.profile) : null;
    const own = already ? null : await this.playerRecord(signer, true);
    await spend?.();
    if (!already) {
      // 2. the key stops being a player, so its own live code goes before anything points at the player: a live code of a key that is
      //    a device would let a stranger make a device of a "player" that is itself a device (IDENT-1 FIX, F1)
      if (own?.code) await this.store.delete(codeKey(own.code));
      // 3. the merged profile is the player's now
      if (merged) await this.profiles.put(player, { profile: merged, receivedAt: this.now() });
      // 4. the player's record names the key before the key's record points at the player: a crash between the two leaves a
      //    listed key that is not linked (harmless; the next redeem finishes it), never a link nobody can find to delete
      const prec = (await this.playerRecord(player, true)) ?? { keys: [], steam: [], at: this.now() };
      if (!prec.keys.includes(signer)) await this.putPlayer(player, { ...prec, keys: [...prec.keys, signer], at: this.now() });
      await this.putKeyLink(signer, { player, at: this.now() });
      // 5. the key's own player record goes in the same step (it is no player now; its ghosts stay as they are). Its code is dead
      //    already, so a failure here leaves an inert record at worst, never a live code: the join stands
      if (own) {
        try {
          await this.store.delete(playerOf(signer));
          this.playerCache.delete(signer);
        } catch (e) {
          this.log(`identity store: could not remove a joined key's own player record: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      // 6. the key's own profile record is gone now (its ghosts stay as they are)
      if (mine) {
        try {
          await this.profiles.delete?.(signer);
        } catch (e) {
          this.log(`identity store: could not remove a merged profile: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
    return { status: 200, player, profile: merged ?? theirs?.profile ?? null };
  }

  // ------------------------------------------------------------------------------------------------------ Steam

  /**
   * A verified Steam account for the signing key. A known Steam id links the key to that id's player (the redeem rules: 409 when
   * the key's player has other keys or a Steam account, or the account's player is full; 403 when the account's player is a device
   * itself); an unknown one maps the Steam id to the key's own canonical player (409 when that player has MAX_LINKED accounts).
   */
  linkSteam(signer: string, steamId: string): Promise<Outcome<Joined>> {
    return this.locked(async () => {
      if (this.isGone(signer)) return { status: 410, error: "this key was deleted" };
      const mine = await this.playerOfKey(signer, true);
      if (this.isGone(mine)) return { status: 410, error: "this player was deleted" };
      const known = decodeKeyLink(await this.store.get(steamKey(steamId)));
      if (known && !this.isGone(known.player)) {
        // The account's player must still be a player. A key that is linked to another player is a device (a Steam link left on a key
        // that later joined someone: join refuses that with 409, so this is damaged data): refused with 403, nothing is followed or
        // re-pointed, and the route gives the ticket back, as it does for Steam's own refusal.
        if (await this.keyLink(known.player, true)) return { status: 403, error: "that Steam account could not be linked" };
        if (known.player === mine) return { status: 200, player: mine, profile: (await this.profiles.get(mine))?.profile ?? null };
        const decision = await this.canJoin(signer, known.player);
        if (decision.status !== 200) return decision;
        return this.join(signer, known.player, decision.already);
      }
      const prec = (await this.playerRecord(mine, true)) ?? { keys: [], steam: [], at: this.now() };
      // room for one more account (IDENT-1 FIX, F3), checked before anything is written; an account the record lists already takes none
      if (!prec.steam.includes(steamId) && prec.steam.length >= MAX_LINKED) {
        return { status: 409, error: "this player already has the most Steam accounts it can have" };
      }
      // The player's record names the account before the account's link points at the player, as `join` orders its writes (IDENT-1 FIX2,
      // N1). A store failure between the two leaves a listed account with no link: that stops the key joining another player (the 409
      // rule reads the record), the retry writes the link, and a DELETE has no link to remove. The other order left a link that the
      // record did not list: the retry answered 200 and never repaired it, the key could then join another player, and a DELETE left
      // the link behind.
      if (!prec.steam.includes(steamId)) await this.putPlayer(mine, { ...prec, steam: [...prec.steam, steamId], at: this.now() });
      await this.store.put(steamKey(steamId), JSON.stringify({ player: mine, at: this.now() }));
      return { status: 200, player: mine, profile: (await this.profiles.get(mine))?.profile ?? null };
    });
  }

  // ------------------------------------------------------------------------------------------------------ deletion

  /**
   * Remove links/steam/<steamId>.json, an account the deleted player's record lists, only when the link names an id this delete tombstones
   * (the player or one of its keys). The record can list an account whose link is missing (linkSteam's second write failed: nothing to
   * remove), or whose link names somebody else (that player linked the account after the first write: the link is theirs and stays), so
   * the link is read first (IDENT-1 FIX2, N1). A link that cannot be read names no id, so it is left as it is and logged (with no id in
   * the line); to every reader it is no link, and the next link of that account overwrites it.
   */
  private async dropSteamLink(steamId: string, tombstoned: ReadonlySet<string>): Promise<void> {
    const text = await this.store.get(steamKey(steamId));
    if (text === null) return;
    const link = decodeKeyLink(text);
    if (!link) {
      this.log("identity store: left an unreadable Steam link in place");
      return;
    }
    if (tombstoned.has(link.player)) await this.store.delete(steamKey(steamId));
  }

  /**
   * Delete the player the signing key belongs to: its profile, every link to it (keys and Steam), its live code; and write the
   * tombstone naming the player and every key id linked to it. The tombstone goes first, so a crash half way leaves a deleted
   * player whose cleanup the next call finishes (a delete of a deleted player is a success). The ghosts stay in the store until
   * `ghost-admin purge-tombstoned`; none is served from this call on. A Steam link goes only if it names one of the tombstoned ids.
   */
  deletePlayer(signer: string): Promise<{ player: string; ids: number }> {
    return this.locked(async () => {
      const player = await this.playerOfKey(signer, true);
      const rec = await this.playerRecord(player, true);
      const prior = decodeTombstone(await this.store.get(tombKey(player)));
      const ids = [...new Set([player, signer, ...(rec?.keys ?? []), ...(prior?.ids ?? [])])];
      await this.store.put(tombKey(player), JSON.stringify({ at: prior?.at ?? this.now(), ids }));
      for (const id of ids) this.gone.add(id); // from this moment no ghost of these ids is served
      const removals: (() => Promise<void>)[] = [];
      const dropLink = (id: string) => async () => {
        await this.store.delete(keyOf(id));
        this.keyCache.delete(id);
      };
      for (const id of ids) {
        removals.push(() => this.profiles.delete?.(id) ?? Promise.resolve());
        if (id !== player && id !== signer) removals.push(dropLink(id));
      }
      const tombstoned = new Set(ids);
      for (const s of rec?.steam ?? []) removals.push(() => this.dropSteamLink(s, tombstoned));
      if (rec?.code) removals.push(() => this.store.delete(codeKey(rec.code!)));
      removals.push(async () => {
        await this.store.delete(playerOf(player));
        this.playerCache.delete(player);
      });
      // the asking key's own link goes last: until it does, a retry by this key still finds its player, and with it what is left
      if (signer !== player) removals.push(dropLink(signer));
      for (const rm of removals) await rm();
      return { player, ids: ids.length };
    });
  }
}
