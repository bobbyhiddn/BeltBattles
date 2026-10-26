// IDENT-1 (REQ-BFG-122): the HTTP side of the identity layer, the way profileRoute.ts is for the profile: app.ts keeps the route
// cases, the CORS line and the wiring; the steps are here, the rules in links.ts. Every request is signed by a device key
// (x-bb-key, x-bb-sig) over its exact bytes, each kind in its OWN domain (src/net/identity.ts), so a signature made for one kind
// never passes for another. Every body is canonical JSON (fixed field order, no spaces) carrying the client's clock `at`: the
// server refuses one more than 10 minutes off its own (422), which bounds a replay. The steps, in order, as POST /v1/ghosts has them:
//   403  uploads are closed (the link, redeem and Steam routes only: reading the profile and deleting always work, so a player can
//        always take their data away; the body is not read)
//   401  a signing header is missing or malformed (the body is not read), or the signature does not match the exact bytes in the
//        route's domain
//   413  the body is over the route's limit (app.ts readBody)
//   400  the body is not UTF-8, or not exactly the route's canonical JSON
//   422  `at` is more than 10 minutes from the server's clock
//   then the route's own checks (below). StorageError is app.ts's 503.
//
//   POST   /v1/link/code    {"at"}                                  -> 200 { code: "XXXX-XXXX", expiresAt } | 410 the player was deleted
//   POST   /v1/link/redeem  {"at","code"}                           -> 200 { player, profile } | 403 "that code did not work" (a
//                                                                      wrong, expired or used code, or a code whose player has become
//                                                                      a device itself: one line, never which) | 409 the key is linked
//                                                                      elsewhere, or its player has other keys or a Steam account | 410
//                                                                      | 429 too many wrong codes from this address (a try is counted
//                                                                      when it arrives, before anything is awaited, and given back
//                                                                      unless it ends as a wrong code; per machine, in memory)
//   GET    /v1/profile?at=<ms>  (no body; the signed text is `at=<ms>`) -> 200 { player, profile | null } | 410
//   DELETE /v1/player       {"at"}                                  -> 200 { deleted: true }
//   POST   /v1/link/steam   {"at","ticket","identity","appid"}      -> 200 { player, profile } | 501 while off | 403 (the ticket, the
//                                                                      App ID, Steam's refusal, or "that Steam account could not be
//                                                                      linked": the account's player has become a device itself; the
//                                                                      ticket is not spent) | 409 | 410 | 502
// The request log is app.ts's, unchanged: time, method, path, status and duration. No player id, no address, no code, no ticket.

import {
  DELETE_PREFIX, LINK_CODE_PREFIX, LINK_REDEEM_PREFIX, LINK_STEAM_PREFIX, PROFILE_GET_PREFIX, uploadHeaderError, verifyDomain,
  type SignDomain,
} from "../src/net/identity";
import { AT_WINDOW_MS, type Links } from "./links";
import type { ProfileStore } from "./profileStore";
import type { SteamVerifier, TicketCache } from "./steamAuth";

export type RouteReply = { status: 200; body: Record<string, unknown> } | { status: number; error: string; retryAfter?: number };

/** How many wrong codes one client address may try, and in how long a time. */
export const REDEEM_FAILS = { windowMs: 10 * 60_000, max: 5 };

/** Failed redeems per client address (held in memory only, never logged), on top of the global limiter. The count lives in this
 *  machine's memory: with several machines each counts its own (docs/ASYNC.md says so). */
export class FailureLimiter {
  private readonly hits = new Map<string, number[]>();
  constructor(readonly windowMs: number = REDEEM_FAILS.windowMs, readonly max: number = REDEEM_FAILS.max) {}

  private live(ip: string, now: number): number[] {
    if (this.hits.size > 10_000) {
      for (const [k, l] of this.hits) if (!l.some((t) => now - t < this.windowMs)) this.hits.delete(k);
    }
    const l = (this.hits.get(ip) ?? []).filter((t) => now - t < this.windowMs);
    if (l.length) this.hits.set(ip, l);
    else this.hits.delete(ip);
    return l;
  }

  blocked(ip: string, now: number): boolean {
    return this.live(ip, now).length >= this.max;
  }

  /**
   * Count a try for this address, unless the address is over the limit already: the check and the count are ONE synchronous step, so
   * a burst of parallel tries cannot all pass the check before any of them is counted (IDENT-1 FIX, F2). False: over the limit,
   * nothing counted. The caller gives the count back (`giveBack`) unless the try ends as a wrong code.
   */
  tryCount(ip: string, now: number): boolean {
    const l = this.live(ip, now);
    if (l.length >= this.max) return false;
    l.push(now);
    this.hits.set(ip, l);
    return true;
  }

  /** Give back the one count `tryCount(ip, at)` took: the try did not end as a wrong code. Nothing if that count has left the window. */
  giveBack(ip: string, at: number): void {
    const l = this.hits.get(ip);
    const i = l ? l.lastIndexOf(at) : -1;
    if (!l || i < 0) return;
    l.splice(i, 1);
    if (l.length === 0) this.hits.delete(ip);
  }

  /** Seconds until the oldest counted failure leaves the window. */
  retryAfter(ip: string, now: number): number {
    const l = this.live(ip, now);
    return l.length ? Math.max(1, Math.ceil((l[0] + this.windowMs - now) / 1000)) : 1;
  }
}

export interface LinkRequest {
  uploads: "open" | "closed";
  /** The x-bb-key and x-bb-sig header values ("" when absent). */
  key: string;
  sig: string;
  /** The exact body bytes, at most `max` (app.ts readBody: 413 over it). Called only after the header checks. */
  readBody(max: number): Promise<Uint8Array>;
  links: Links;
  profiles: ProfileStore;
  now(): number;
  /** The client address (the rate limiter's key; never logged). */
  ip: string;
  failures: FailureLimiter;
  steam: SteamVerifier | null;
  tickets: TicketCache;
}

type Fail = { status: number; error: string; retryAfter?: number };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** Gate, headers, body, signature in `domain`, UTF-8: the signer's own key id and the body text. */
async function opened(r: LinkRequest, domain: SignDomain, max: number, gated: boolean): Promise<Fail | { signer: string; text: string }> {
  if (gated && r.uploads === "closed") return { status: 403, error: "uploads are not open yet" };
  const unsigned = uploadHeaderError(r.key, r.sig);
  if (unsigned) return { status: 401, error: unsigned };
  const body = await r.readBody(max);
  const v = await verifyDomain(domain, body, r.key, r.sig);
  if (!v.ok) return { status: 401, error: v.error };
  try {
    return { signer: v.playerId, text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(body) };
  } catch {
    return { status: 400, error: "request body is not UTF-8" };
  }
}

/** The body as exactly `fields`, in that order, in the canonical compact form: a field map, or the reason it is not. */
function fieldsOf(text: string, fields: readonly string[]): Record<string, unknown> | string {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return "body: not JSON";
  }
  if (!isObj(raw)) return "body: expected an object";
  const keys = Object.keys(raw);
  if (keys.length !== fields.length || keys.some((k, i) => k !== fields[i])) return `body: expected exactly ${fields.join(", ")}, in that order`;
  if (JSON.stringify(raw) !== text) return "body: not in the canonical form (compact JSON, fixed field order)";
  return raw;
}

/** `at` must be the client's clock reading, within the replay bound of the server's. */
function atProblem(at: unknown, now: number): string | null {
  if (typeof at !== "number" || !Number.isSafeInteger(at) || at < 0) return "at: expected the client's time in milliseconds";
  if (Math.abs(at - now) > AT_WINDOW_MS) return "at: more than 10 minutes from the server's clock";
  return null;
}

/** The common head of a body route: opened, fields, `at`. */
async function bodyRoute(r: LinkRequest, domain: SignDomain, max: number, gated: boolean, fields: readonly string[]): Promise<Fail | { signer: string; body: Record<string, unknown> }> {
  const o = await opened(r, domain, max, gated);
  if ("status" in o) return o;
  const b = fieldsOf(o.text, fields);
  if (typeof b === "string") return { status: 400, error: b };
  const late = atProblem(b.at, r.now());
  if (late) return { status: 422, error: late };
  return { signer: o.signer, body: b };
}

export async function linkCode(r: LinkRequest): Promise<RouteReply> {
  const o = await bodyRoute(r, LINK_CODE_PREFIX, 256, true, ["at"]);
  if ("status" in o) return o;
  await r.links.ensureFresh();
  const c = await r.links.issueCode(o.signer);
  return c.status === 200 ? { status: 200, body: { code: c.code, expiresAt: c.expiresAt } } : c;
}

export async function linkRedeem(r: LinkRequest): Promise<RouteReply> {
  // The failed-try limit first: an address that is over it learns nothing about any code, right or wrong. The check and the count of
  // this try are ONE synchronous step, before the first await: a burst of parallel tries from one address cannot all pass the check
  // before any is counted (IDENT-1 FIX, F2). A try that does not end as a wrong code (the redeem's own 403) gives its count back:
  // a success, a 401/400/422/413, a 409, a 410, the closed gate's 403 and an await that throws (503) never count.
  const at = r.now();
  if (!r.failures.tryCount(r.ip, at)) {
    return { status: 429, error: "too many wrong codes, try again later", retryAfter: r.failures.retryAfter(r.ip, r.now()) };
  }
  let wrong = false;
  try {
    const o = await bodyRoute(r, LINK_REDEEM_PREFIX, 512, true, ["at", "code"]);
    if ("status" in o) return o;
    if (typeof o.body.code !== "string") return { status: 400, error: "code: expected the typed code as text" };
    await r.links.ensureFresh();
    const j = await r.links.redeem(o.signer, o.body.code);
    wrong = j.status === 403;
    return j.status === 200 ? { status: 200, body: { player: j.player, profile: j.profile } } : j;
  } finally {
    if (!wrong) r.failures.giveBack(r.ip, at);
  }
}

/** GET /v1/profile?at=<ms>: `query` is the raw query text without the "?". The signature covers its exact bytes. */
export async function getProfile(r: LinkRequest, query: string): Promise<RouteReply> {
  const unsigned = uploadHeaderError(r.key, r.sig);
  if (unsigned) return { status: 401, error: unsigned };
  const v = await verifyDomain(PROFILE_GET_PREFIX, new TextEncoder().encode(query), r.key, r.sig);
  if (!v.ok) return { status: 401, error: v.error };
  const m = /^at=(\d{1,16})$/.exec(query);
  if (!m) return { status: 400, error: "query: expected exactly at=<milliseconds>" };
  const late = atProblem(Number(m[1]), r.now());
  if (late) return { status: 422, error: late };
  await r.links.ensureFresh();
  const player = await r.links.playerOfKey(v.playerId);
  if (r.links.isGone(v.playerId) || r.links.isGone(player)) return { status: 410, error: "this player was deleted" };
  const stored = await r.profiles.get(player);
  return { status: 200, body: { player, profile: stored?.profile ?? null } };
}

export async function deletePlayer(r: LinkRequest): Promise<RouteReply> {
  const o = await bodyRoute(r, DELETE_PREFIX, 256, false, ["at"]); // never gated: a player can always take their data away
  if ("status" in o) return o;
  await r.links.ensureFresh();
  await r.links.deletePlayer(o.signer);
  return { status: 200, body: { deleted: true } };
}

const TICKET = /^[0-9A-Fa-f]{2,4096}$/;
const STEAM_IDENTITY = /^[\x21-\x7e]{1,64}$/;

export async function linkSteam(r: LinkRequest): Promise<RouteReply> {
  const steam = r.steam;
  if (!steam) return { status: 501, error: "steam linking is not configured" };
  const o = await bodyRoute(r, LINK_STEAM_PREFIX, 8192, true, ["at", "ticket", "identity", "appid"]);
  if ("status" in o) return o;
  const { ticket, identity, appid } = o.body;
  if (typeof ticket !== "string" || !TICKET.test(ticket) || ticket.length % 2 !== 0) return { status: 400, error: "ticket: expected a hex session ticket" };
  if (typeof identity !== "string" || !STEAM_IDENTITY.test(identity)) return { status: 400, error: "identity: expected 1 to 64 printable characters, no spaces" };
  if (typeof appid !== "number" || !Number.isSafeInteger(appid) || appid < 1) return { status: 400, error: "appid: expected a Steam App ID" };
  if (!steam.appIds.includes(appid)) return { status: 403, error: "appid: not one of this game's App IDs" };
  if (!r.tickets.use(ticket, r.now())) return { status: 403, error: "that Steam ticket was used already" };
  const s = await steam.verify(ticket, identity, appid);
  if (!s.ok) {
    r.tickets.release(ticket);
    return s.unavailable ? { status: 502, error: "Steam could not be asked just now, try again shortly" } : { status: 403, error: s.error };
  }
  await r.links.ensureFresh();
  const j = await r.links.linkSteam(o.signer, s.steamId);
  if (j.status === 403) r.tickets.release(ticket); // the account's player is a device (damaged data): nothing was linked, the ticket is not spent
  return j.status === 200 ? { status: 200, body: { player: j.player, profile: j.profile } } : j;
}
