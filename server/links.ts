// IDENT-1 (REQ-BFG-122): one canonical player that several device keys (and a Steam account) point at. This module is the
// identity layer's logic; server/linkStore.ts holds its records (see the key layout there), server/linkRoutes.ts the HTTP
// side, and app.ts only the route cases.
//
// The rules (LAUNCH-0 section 4.3, BRIEF-IDENT1):
//  - A key's own ID is base64url(SHA-256(raw public key)), as ever. A key LINKED to a player P uploads under P. P is always the
//    first key's own ID, never a new kind of string, so the pool, the match query, ghost-admin and the names code see nothing new.
//  - A key links to at most one player. A redeeming key whose player already has other keys or a Steam account is refused (409):
//    nothing is ever re-pointed silently. A lone key is allowed: its stored profile is merged into P's (mergeWire), then removed.
//  - A link code is 8 characters of a 31 symbol alphabet (no 0 O 1 I L), about 40 bits, live 10 minutes, single use, stored hashed.
//    A new code replaces the player's live one. Single use holds when two redeems race in one process: every change runs one at a
//    time (`locked`), and the code is consumed (deleted) before anything is linked. Across machines see the REPORT (section 6).
//  - Deleting a player removes its profile, its links (keys and Steam) and its live code, and writes tombstones/<P>.json naming P
//    and every key id that was linked to it. A tombstoned id's ghosts are never served and its uploads answer 410: the set is held
//    in memory, loaded at start and refreshed on a timer (other machines), and updated at once on a delete.
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

const POSITIVE_TTL_MS = 10 * 60_000;
const NEGATIVE_TTL_MS = 30_000;
const TOMBSTONE_TTL_MS = 60_000;
const CACHE_MAX = 100_000;

export interface KeyLink {
  player: string;
  at: number;
}
export interface PlayerRecord {
  /** The keys linked to the player, besides its own (the first key's id is the player's id). */
  keys: string[];
  /** The Steam ids linked to the player. */
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
const idList = (x: unknown): string[] | null => (Array.isArray(x) && x.length <= 64 && x.every(isId) ? (x as string[]) : null);

function parse(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function decodeKeyLink(text: string | null): KeyLink | null {
  const o = parse(text);
  return isObj(o) && isId(o.player) && isMs(o.at) ? { player: o.player, at: o.at } : null;
}
export function decodePlayer(text: string | null): PlayerRecord | null {
  const o = parse(text);
  if (!isObj(o) || !isMs(o.at)) return null;
  const keys = idList(o.keys), steam = idList(o.steam);
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
  const ids = idList(o.ids);
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
  private goneLoadedAt = -1; // -1: never loaded
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

  /** Read every tombstone from the store into memory (at start). StorageError: the store is down; the set is left as it was. */
  async loadTombstones(): Promise<void> {
    const keys = await this.store.list("tombstones/");
    const ids = new Set<string>();
    for (const k of keys) {
      const t = decodeTombstone(await this.store.get(k));
      if (t) for (const id of t.ids) ids.add(id);
      else this.log("identity store: skipping an unreadable tombstone");
    }
    for (const id of ids) this.gone.add(id);
    this.goneLoadedAt = this.now();
  }

  /**
   * Before a route serves a ghost or takes an upload: the tombstone set has been loaded, and is not older than the refresh time.
   * The first load must succeed (StorageError otherwise: the route answers 503, so a deleted player's ghost is never served from
   * an incomplete set); a later refresh that fails keeps the set and tries again on the next request.
   */
  async ensureFresh(): Promise<void> {
    const t = this.now();
    if (this.goneLoadedAt >= 0 && t - this.goneLoadedAt < this.tombstoneTtlMs) return;
    this.goneLoading ??= this.loadTombstones().finally(() => {
      this.goneLoading = null;
    });
    try {
      await this.goneLoading;
    } catch (e) {
      if (this.goneLoadedAt < 0) throw e;
      this.goneLoadedAt = t - this.tombstoneTtlMs + 5_000; // retry in 5 s
      this.log(`identity store: tombstone refresh failed, keeping the set: ${e instanceof Error ? e.message : String(e)}`);
    }
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
   * The new device's key redeems a code. One refusal for a wrong, expired or used code (403: it never says which). 409: the key
   * is linked to another player already, or its own player has other keys or a Steam account (nothing is re-pointed silently).
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
   * other keys or a Steam account. A lone key may.
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
    return { status: 200, already: false };
  }

  /** Link `signer` to `player`: its stored profile is merged into the player's and removed, then the records are written.
   *  Called inside a change, after canJoin said yes. `spend` runs after the reads that can fail and before the first write. */
  private async join(signer: string, player: string, already: boolean, spend?: () => Promise<void>): Promise<Outcome<Joined>> {
    // 1. the reads first (StorageError here changes nothing): the lone key's profile and the player's
    const mine = already ? null : await this.profiles.get(signer);
    const theirs = await this.profiles.get(player);
    const merged = mine ? mergeWire(theirs?.profile ?? null, mine.profile) : null;
    await spend?.();
    if (!already) {
      // 2. the merged profile is the player's now
      if (merged) await this.profiles.put(player, { profile: merged, receivedAt: this.now() });
      // 3. the player's record names the key before the key's record points at the player: a crash between the two leaves a
      //    listed key that is not linked (harmless; the next redeem finishes it), never a link nobody can find to delete
      const prec = (await this.playerRecord(player, true)) ?? { keys: [], steam: [], at: this.now() };
      if (!prec.keys.includes(signer)) await this.putPlayer(player, { ...prec, keys: [...prec.keys, signer], at: this.now() });
      await this.putKeyLink(signer, { player, at: this.now() });
      // 4. the key's own record is gone now (its ghosts stay as they are)
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
   * the key's player has other keys or a Steam account); an unknown one maps the Steam id to the key's own canonical player.
   */
  linkSteam(signer: string, steamId: string): Promise<Outcome<Joined>> {
    return this.locked(async () => {
      if (this.isGone(signer)) return { status: 410, error: "this key was deleted" };
      const mine = await this.playerOfKey(signer, true);
      if (this.isGone(mine)) return { status: 410, error: "this player was deleted" };
      const known = decodeKeyLink(await this.store.get(steamKey(steamId)));
      if (known && !this.isGone(known.player)) {
        if (known.player === mine) return { status: 200, player: mine, profile: (await this.profiles.get(mine))?.profile ?? null };
        const decision = await this.canJoin(signer, known.player);
        if (decision.status !== 200) return decision;
        return this.join(signer, known.player, decision.already);
      }
      const prec = (await this.playerRecord(mine, true)) ?? { keys: [], steam: [], at: this.now() };
      await this.store.put(steamKey(steamId), JSON.stringify({ player: mine, at: this.now() }));
      if (!prec.steam.includes(steamId)) await this.putPlayer(mine, { ...prec, steam: [...prec.steam, steamId], at: this.now() });
      return { status: 200, player: mine, profile: (await this.profiles.get(mine))?.profile ?? null };
    });
  }

  // ------------------------------------------------------------------------------------------------------ deletion

  /**
   * Delete the player the signing key belongs to: its profile, every link to it (keys and Steam), its live code; and write the
   * tombstone naming the player and every key id linked to it. The tombstone goes first, so a crash half way leaves a deleted
   * player whose cleanup the next call finishes (a delete of a deleted player is a success). The ghosts stay in the store until
   * `ghost-admin purge-tombstoned`; none is served from this call on.
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
      for (const id of ids) {
        removals.push(() => this.profiles.delete?.(id) ?? Promise.resolve());
        if (id !== player) removals.push(async () => {
          await this.store.delete(keyOf(id));
          this.keyCache.delete(id);
        });
      }
      for (const s of rec?.steam ?? []) removals.push(() => this.store.delete(steamKey(s)));
      if (rec?.code) removals.push(() => this.store.delete(codeKey(rec.code!)));
      removals.push(async () => {
        await this.store.delete(playerOf(player));
        this.playerCache.delete(player);
      });
      for (const rm of removals) await rm();
      return { player, ids: ids.length };
    });
  }
}
