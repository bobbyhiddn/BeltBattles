// PROFILE-UP (REQ-BFG-074 clause 4, backlog #371): the client half of the signed profile upload. putProfile builds the wire
// form of the device's profile (src/net/profileWire.ts: the counters, hero lists, unlocks, picks and stamp; never seen,
// folded or runNew), signs its exact UTF-8 bytes in the PROFILE domain ("bb-profile-1\n" + body, identity.ts) with the
// device key, and PUTs it to /v1/profile. Like submitGhost it never throws: any failure is { ok: false } and the caller
// stays silent. There is no retry here: putProfile is upload-only (the 200 body, the server's merged profile, is not merged into
// the device). Called by game/online.ts only, in its online state.
// IDENT-1 (REQ-BFG-122): getProfile is the read (GET /v1/profile?at=<ms>, signed in the profile-read domain over the exact query
// text). It answers the signer's canonical player and that player's profile; src/net/profileSync.ts merges it into the device.

import type { Profile } from "../game/profile";
import { KEY_HEADER, PROFILE_GET_PREFIX, PROFILE_PREFIX, SIG_HEADER, type Identity } from "./identity";
import { MAX_PROFILE_BYTES, decodeWireValue, encodeWire, toWire, type WireProfile } from "./profileWire";

export type PutProfileResult = { ok: true } | { ok: false; status?: number; error: string };

function errText(e: unknown): string {
  const name = typeof e === "object" && e !== null ? (e as { name?: unknown }).name : undefined;
  if (name === "AbortError" || name === "TimeoutError") return "timeout"; // DOMException in some runtimes
  return e instanceof Error ? e.message : String(e);
}

/** Upload the profile, signed by this device's key. The signature covers exactly the bytes sent. A deadline covers the
 *  headers and the body of the answer. 200 is the only success. */
export async function putProfile(baseUrl: string, identity: Identity, profile: Profile, timeoutMs = 4000): Promise<PutProfileResult> {
  try {
    const body = new TextEncoder().encode(encodeWire(toWire(profile)));
    if (body.length > MAX_PROFILE_BYTES) return { ok: false, error: `the profile is over ${MAX_PROFILE_BYTES} bytes: not uploaded` };
    const { key, sig } = await identity.sign(body, PROFILE_PREFIX);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), Math.max(1, timeoutMs));
    try {
      const res = await fetch(baseUrl.replace(/\/+$/, "") + "/v1/profile", {
        method: "PUT", headers: { "content-type": "application/json", [KEY_HEADER]: key, [SIG_HEADER]: sig }, body, signal: ctl.signal,
      });
      const text = await res.text();
      if (res.status === 200) return { ok: true };
      let error = `HTTP ${res.status}`;
      try {
        const parsed = text ? (JSON.parse(text) as { error?: unknown }) : {};
        if (typeof parsed.error === "string") error = parsed.error;
      } catch {
        /* a non-JSON error page */
      }
      return { ok: false, status: res.status, error };
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}

export type GetProfileResult = { ok: true; player: string; profile: WireProfile | null } | { ok: false; status?: number; error: string };

const PLAYER_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** IDENT-1: read the signer's canonical player and its profile (null: the server holds none). The query `at=<ms>` is the client's
 *  clock, which the server holds to 10 minutes of its own; the signature covers exactly that text. Never throws. */
export async function getProfile(baseUrl: string, identity: Identity, timeoutMs = 4000, now: () => number = () => Date.now()): Promise<GetProfileResult> {
  try {
    const query = `at=${Math.floor(now())}`;
    const { key, sig } = await identity.sign(new TextEncoder().encode(query), PROFILE_GET_PREFIX);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), Math.max(1, timeoutMs));
    try {
      const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/profile?${query}`, {
        method: "GET", headers: { accept: "application/json", [KEY_HEADER]: key, [SIG_HEADER]: sig }, signal: ctl.signal,
      });
      const text = await res.text();
      let parsed: { player?: unknown; profile?: unknown; error?: unknown } = {};
      try {
        parsed = text ? (JSON.parse(text) as typeof parsed) : {};
      } catch {
        /* a non-JSON error page */
      }
      if (res.status !== 200) return { ok: false, status: res.status, error: typeof parsed.error === "string" ? parsed.error : `HTTP ${res.status}` };
      if (typeof parsed.player !== "string" || !PLAYER_ID.test(parsed.player)) return { ok: false, status: 200, error: "the answer names no player" };
      let profile: WireProfile | null = null;
      if (parsed.profile !== null && parsed.profile !== undefined) {
        try {
          profile = decodeWireValue(parsed.profile); // the strict shape check; a profile of a newer wire version is refused here (never merged)
        } catch (e) {
          return { ok: false, status: 200, error: e instanceof Error ? e.message : "the profile could not be read" };
        }
      }
      return { ok: true, player: parsed.player, profile };
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}
