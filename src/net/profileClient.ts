// PROFILE-UP (REQ-BFG-074 clause 4, backlog #371): the client half of the signed profile upload. putProfile builds the wire
// form of the device's profile (src/net/profileWire.ts: the counters, hero lists, unlocks, picks and stamp; never seen,
// folded or runNew), signs its exact UTF-8 bytes in the PROFILE domain ("bb-profile-1\n" + body, identity.ts) with the
// device key, and PUTs it to /v1/profile. Like submitGhost it never throws: any failure is { ok: false } and the caller
// stays silent. There is no retry here and no read-back: v1 is upload-only (the 200 body, the server's merged profile, is
// not merged into the device). Called by game/online.ts only, in its online state.

import type { Profile } from "../game/profile";
import { KEY_HEADER, PROFILE_PREFIX, SIG_HEADER, type Identity } from "./identity";
import { MAX_PROFILE_BYTES, encodeWire, toWire } from "./profileWire";

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
