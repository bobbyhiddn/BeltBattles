// IDENT-1 (REQ-BFG-122): what this device remembers of a link. One localStorage key, beltbattles.link.v1, written only when the
// device is linked (a link code redeemed, or a Steam account linked): a device that was never linked writes nothing and reads
// nothing more than this one key, so it behaves exactly as 0.9.13 did and the offline key lists stay as they were.
//
//   { "v":1, "player":"<P>", "key":"<this key's own id>", "at":<ms>, "readAt":<ms> }
//
//   player   the canonical player this device's key is linked to (the first key's own id); the id every request and snapshot of a
//            new run carries (src/net/identity.ts: Identity.playerId)
//   key      the key's own id at the time of the link. A record whose key is not the key in use belongs to another key (a key made
//            after a deletion, say) and is ignored
//   at       when the link was made; readAt: when the server's profile was last read (profileSync.ts: at most once an hour)
// The record holds no secret. The native builds mirror it (identityMirror.ts) beside the key, so a purged WebView keeps its link.

// the same 1-64 base64url characters as snapshot.ts ID_PATTERN (not imported: this file, like identity.ts, stays free of the sim)
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export const LINK_KEY = "beltbattles.link.v1";

export interface LinkRecord {
  v: 1;
  player: string;
  key: string;
  at: number;
  readAt?: number;
}

export type LinkStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const isMs = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x) && x >= 0;

/** A stored record -> a LinkRecord, or null for anything that is not exactly one (never throws). */
export function parseLink(text: string | null | undefined): LinkRecord | null {
  if (typeof text !== "string" || text === "") return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1 || typeof o.player !== "string" || !ID_PATTERN.test(o.player) || typeof o.key !== "string" || !ID_PATTERN.test(o.key) || !isMs(o.at)) return null;
  if (o.readAt !== undefined && !isMs(o.readAt)) return null;
  return { v: 1, player: o.player, key: o.key, at: o.at, ...(o.readAt !== undefined ? { readAt: o.readAt as number } : {}) };
}

export function encodeLink(r: LinkRecord): string {
  return JSON.stringify({ v: 1, player: r.player, key: r.key, at: r.at, ...(r.readAt !== undefined ? { readAt: r.readAt } : {}) });
}

/** localStorage, or null where a page has none or refuses it. */
export function browserLinkStorage(): LinkStorage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/** The stored link record, or null (none, unreadable, or storage unavailable). Reads only. */
export function readLink(s: LinkStorage | null | undefined = browserLinkStorage()): LinkRecord | null {
  try {
    return parseLink(s?.getItem(LINK_KEY));
  } catch {
    return null;
  }
}

/** Store the link record. False when storage refused it. */
export function writeLink(r: LinkRecord, s: LinkStorage | null | undefined = browserLinkStorage()): boolean {
  try {
    if (!s) return false;
    s.setItem(LINK_KEY, encodeLink(r));
    return true;
  } catch {
    return false;
  }
}

export function clearLink(s: LinkStorage | null | undefined = browserLinkStorage()): void {
  try {
    s?.removeItem(LINK_KEY);
  } catch {
    /* storage unavailable: nothing to clear */
  }
}

/** The player the key `keyId` is linked to by this device's record, or null (no record, or the record is another key's). */
export function linkedPlayer(keyId: string, s: LinkStorage | null | undefined = browserLinkStorage()): string | null {
  const r = readLink(s);
  return r && r.key === keyId ? r.player : null;
}
