// IDENT-1 (REQ-BFG-122): the client half of the identity layer. Each call signs a small canonical body with the device key, in the
// route's own domain (src/net/identity.ts), and POSTs it; the body carries the client's clock `at`, which the server holds to 10
// minutes of its own. Never throws: every failure is a value, { ok: false, status?, error }, and `status` is the server's HTTP status
// (absent: no answer, a timeout or a refused connection). The server's words are in server/linkRoutes.ts; the cards map a status to
// their own plain line.
//
//   requestLinkCode   POST /v1/link/code      SHOW MY CODE: 200 -> { code: "XXXX-XXXX", expiresAt }. IDENT-2: and the device that shows a code
//                                             counts as linked too (a link record naming its own key), so its run history reaches the device
//                                             that enters the code (net/historySync.ts)
//   redeemLinkCode    POST /v1/link/redeem    ENTER A CODE (this device's key is the NEW one): 200 -> the link is written to this device
//                                             (localStorage beltbattles.link.v1 and the native mirror) and the server's profile is merged
//                                             into the local one. 403: the code did not work (wrong, expired or used), 409: this device
//                                             is linked elsewhere or has other devices, 410: deleted, 429: too many wrong codes
//   deleteOnlineData  DELETE /v1/player       DELETE MY ONLINE DATA: 200 -> the key, its mirror and the link record are dropped here
//                                             (local progress stays), so the next online use makes a new player
//   linkSteam         POST /v1/link/steam     a Steam web-API ticket links a Steam account (no UI yet); 501 while the server has it off
//
// A link takes effect at the next NEW RUN: the live session's Identity keeps the playerId it has until the title calls its refresh()
// (identity.ts), and the server takes both the key's own id and the player's from a linked key meanwhile.

import { DELETE_PREFIX, KEY_HEADER, LINK_CODE_PREFIX, LINK_REDEEM_PREFIX, LINK_STEAM_PREFIX, SIG_HEADER, indexedDbKeyStore, type Identity, type KeyStore, type SignDomain } from "./identity";
import { MIRROR_JWK, MIRROR_LINK, capacitorMirror, type IdentityMirror } from "./identityMirror";
import { browserLinkStorage, clearLink, encodeLink, readLink, writeLink, type LinkStorage } from "./linkState";
import { mergeRemoteProfile } from "./profileSync";
import { syncHistoryAfterLink } from "./historySync"; // IDENT-2 (REQ-BFG-122 clause 4): the run history follows the player (a module cycle: historySync.ts imports forgetDeletedPlayer; both only call each other at run time)
import { decodeWireValue, type WireProfile } from "./profileWire";

export type LinkFailure = { ok: false; status?: number; error: string };

/** Everything a call may be handed in a test; the defaults are the browser's (or the phone's). */
export interface LinkDeps {
  fetch?: typeof fetch;
  now?: () => number;
  /** Where beltbattles.link.v1 and the profile live (default: localStorage). */
  store?: LinkStorage | null;
  timeoutMs?: number;
  /** The native key mirror (default: capacitorMirror(), null on the web). */
  mirror?: IdentityMirror | null;
  /** Where the device key lives, for deleteOnlineData (default: IndexedDB). */
  keyStore?: KeyStore;
}

export type CodeResult = { ok: true; code: string; expiresAt: number } | LinkFailure;
export type RedeemResult = { ok: true; player: string } | LinkFailure;
export type DeleteResult = { ok: true } | LinkFailure;

const PLAYER_ID = /^[A-Za-z0-9_-]{1,64}$/;

function errText(e: unknown): string {
  const name = typeof e === "object" && e !== null ? (e as { name?: unknown }).name : undefined;
  if (name === "AbortError" || name === "TimeoutError") return "timeout";
  return e instanceof Error ? e.message : String(e);
}

type Answer = { ok: true; json: Record<string, unknown> } | LinkFailure;

/** One signed call: the canonical body {"at":<ms>,...fields}, signed in `domain`; a 200 answer, or the failure with the server's words. */
async function call(baseUrl: string, method: "POST" | "DELETE", path: string, domain: SignDomain, id: Identity, fields: Record<string, unknown>, deps: LinkDeps): Promise<Answer> {
  try {
    const body = new TextEncoder().encode(JSON.stringify({ at: Math.floor((deps.now ?? (() => Date.now()))()), ...fields }));
    const { key, sig } = await id.sign(body, domain);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), Math.max(1, deps.timeoutMs ?? 5000));
    try {
      const doFetch = deps.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
      const res = await doFetch(baseUrl.replace(/\/+$/, "") + path, {
        method, headers: { "content-type": "application/json", [KEY_HEADER]: key, [SIG_HEADER]: sig }, body, signal: ctl.signal,
      });
      const text = await res.text();
      let json: Record<string, unknown> = {};
      try {
        const parsed: unknown = text ? JSON.parse(text) : {};
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) json = parsed as Record<string, unknown>;
      } catch {
        /* a non-JSON error page */
      }
      if (res.status === 200) return { ok: true, json };
      return { ok: false, status: res.status, error: typeof json.error === "string" ? json.error : `HTTP ${res.status}` };
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}

/** SHOW MY CODE. */
export async function requestLinkCode(baseUrl: string, id: Identity, deps: LinkDeps = {}): Promise<CodeResult> {
  const a = await call(baseUrl, "POST", "/v1/link/code", LINK_CODE_PREFIX, id, {}, deps);
  if (!a.ok) return a;
  const { code, expiresAt } = a.json;
  if (typeof code !== "string" || typeof expiresAt !== "number") return { ok: false, status: 200, error: "the answer holds no code" };
  await noteShowing(baseUrl, id, deps);
  return { ok: true, code, expiresAt };
}

/**
 * IDENT-2 (REQ-BFG-122 clause 4): the device that SHOWS a code counts as linked too. It is the player's first device, and its run history
 * must reach the device that enters the code, so it gets the link record of a device whose player is its own key (here and in the native
 * mirror, as `adopt` writes one); a device that has a record for this key already keeps it. Then its history goes up in the background
 * (net/historySync.ts), so the entries are there by the time the other device enters the code. Never throws, never delays the code card.
 */
async function noteShowing(baseUrl: string, id: Identity, deps: LinkDeps): Promise<void> {
  try {
    await selfLink(id, deps);
    syncHistoryAfterLink(baseUrl, id, deps);
  } catch {
    /* showing a code is never held back by the history */
  }
}

/** The link record of a device whose player is its own key (the player's first device): written, here and in the native mirror, unless the
 *  device has a record for this key already. Used by SHOW MY CODE and by a Steam link that names the key's own player. Never throws. */
async function selfLink(id: Identity, deps: LinkDeps): Promise<void> {
  try {
    const store = deps.store === undefined ? browserLinkStorage() : deps.store;
    const keyId = id.keyId ?? id.playerId;
    const have = readLink(store);
    if (!store || (have && have.key === keyId)) return;
    const rec = { v: 1 as const, player: keyId, key: keyId, at: Math.floor((deps.now ?? (() => Date.now()))()) };
    if (!writeLink(rec, store)) return;
    const mirror = deps.mirror === undefined ? capacitorMirror() : deps.mirror;
    try {
      await mirror?.set(MIRROR_LINK, encodeLink(rec));
    } catch {
      /* the mirror is a safety net: the link holds without it */
    }
  } catch {
    /* a record that cannot be written leaves the device unlinked, as it was */
  }
}

/** The server named the player this key now belongs to: write the link (here and in the mirror) and merge the profile it sent. */
async function adopt(baseUrl: string, json: Record<string, unknown>, id: Identity, deps: LinkDeps): Promise<RedeemResult> {
  const player = json.player;
  if (typeof player !== "string" || !PLAYER_ID.test(player)) return { ok: false, status: 200, error: "the answer names no player" };
  const store = deps.store === undefined ? browserLinkStorage() : deps.store;
  const mirror = deps.mirror === undefined ? capacitorMirror() : deps.mirror;
  const keyId = id.keyId ?? id.playerId;
  const now = Math.floor((deps.now ?? (() => Date.now()))());
  if (player !== keyId) {
    const rec = { v: 1 as const, player, key: keyId, at: now, readAt: now };
    writeLink(rec, store);
    try {
      await mirror?.set(MIRROR_LINK, encodeLink(rec));
    } catch {
      /* the mirror is a safety net: the link holds without it */
    }
  } else {
    await selfLink(id, deps); // IDENT-2: a Steam link on the player's first key names that key's own player: the device counts as linked, as one that shows a code does
  }
  let profile: WireProfile | null = null;
  if (json.profile !== null && json.profile !== undefined) {
    try {
      profile = decodeWireValue(json.profile); // strict; a newer wire version is refused here and never merged
    } catch {
      profile = null;
    }
  }
  if (profile) mergeRemoteProfile(profile, store);
  syncHistoryAfterLink(baseUrl, id, deps); // IDENT-2: the device's runs go up under the player, the player's come down (background; a device with no link record does nothing)
  return { ok: true, player };
}

/** ENTER A CODE: this device's key joins the player that made the code. */
export async function redeemLinkCode(baseUrl: string, id: Identity, typed: string, deps: LinkDeps = {}): Promise<RedeemResult> {
  const a = await call(baseUrl, "POST", "/v1/link/redeem", LINK_REDEEM_PREFIX, id, { code: String(typed).slice(0, 32) }, deps);
  return a.ok ? adopt(baseUrl, a.json, id, deps) : a;
}

/** The device's half of a deletion: the link record, the mirror's copies and the key itself are dropped (the next online use makes a
 *  new player); local progress stays. Safe to repeat. { ok: false } when the mirror or the key store would not let go. */
async function dropLocalIdentity(deps: LinkDeps): Promise<DeleteResult> {
  const store = deps.store === undefined ? browserLinkStorage() : deps.store;
  const mirror = deps.mirror === undefined ? capacitorMirror() : deps.mirror;
  clearLink(store);
  try {
    await mirror?.remove(MIRROR_LINK);
    await mirror?.remove(MIRROR_JWK);
  } catch {
    return { ok: false, error: "your online data was deleted, but this device could not clear its saved key" };
  }
  try {
    await (deps.keyStore ?? indexedDbKeyStore()).clear?.();
  } catch {
    return { ok: false, error: "your online data was deleted, but this device could not forget its key" };
  }
  return { ok: true };
}

/** DELETE MY ONLINE DATA: the server forgets the player; this device drops its link record, the mirror's copies and its key (the
 *  next online use makes a new player). Local progress stays. A repeat after a half-done cleanup is safe: the server's answer is 200. */
export async function deleteOnlineData(baseUrl: string, id: Identity, deps: LinkDeps = {}): Promise<DeleteResult> {
  const a = await call(baseUrl, "DELETE", "/v1/player", DELETE_PREFIX, id, {}, deps);
  return a.ok ? dropLocalIdentity(deps) : a;
}

/** The server answered 410 to this device's key: its player was deleted (from another device). The key is dead, so this device
 *  drops it the way the device that asked does: the next online use makes a new player, and local progress stays. ghostClient.ts
 *  calls it on a 410 to an upload. Never throws. */
export async function forgetDeletedPlayer(deps: LinkDeps = {}): Promise<DeleteResult> {
  try {
    return await dropLocalIdentity(deps);
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}

/** A Steam web-API ticket (hex, from ISteamUser::GetAuthTicketForWebApi made for `steamIdentity`) links the Steam account to this
 *  player. No UI and no Steam SDK here: the desktop build will call it. 501 while the server has Steam linking off. */
export async function linkSteam(baseUrl: string, id: Identity, ticketHex: string, steamIdentity: string, appid: number, deps: LinkDeps = {}): Promise<RedeemResult> {
  const a = await call(baseUrl, "POST", "/v1/link/steam", LINK_STEAM_PREFIX, id, { ticket: ticketHex, identity: steamIdentity, appid }, deps);
  return a.ok ? adopt(baseUrl, a.json, id, deps) : a;
}
