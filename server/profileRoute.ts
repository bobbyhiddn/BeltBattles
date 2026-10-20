// PROFILE-UP (REQ-BFG-074 clause 4, backlog #371): PUT /v1/profile, the steps in POST /v1/ghosts' order. app.ts keeps the
// case, the CORS line and the imports; the logic lives here and in the shared pure module src/net/profileWire.ts.
//
//   PUT /v1/profile   body: the canonical wire profile (src/net/profileWire.ts), signed in the PROFILE domain:
//                     x-bb-key and x-bb-sig over "bb-profile-1\n" + the exact body bytes (src/net/identity.ts verifyProfile).
//                     The body carries no player id: the record is the SIGNER's, so a key can only ever write its own.
//   Refusals, in the order they are checked:
//     403 { error }  while uploads are closed (the body is not read)
//     401 { error }  a signing header is missing or malformed (the body is not read), or the signature does not match the
//                    exact bytes in this domain (a ghost upload's signature does not)
//     413 { error }  the body is over MAX_PROFILE_BYTES (app.ts readBody)
//     400 { error }  not UTF-8, or not exactly the canonical wire profile (unknown field, wrong type, non-integer, negative,
//                    duplicate, unsorted, or any other text)
//     422 { error }  a `v` newer than this server reads, or a plausibility cap, naming the field
//     503            storage is down (app.ts maps StorageError)
//   200 { the merged wire profile }: read, merge (max / union / newer chosen), store.
//     410 { error }  IDENT-1: the signer's player was deleted (server/links.ts); checked once the signature has verified
// The request log is app.ts's, unchanged: time, method, path, status and duration. No player id, no address, no body.

import { uploadHeaderError, verifyProfile } from "../src/net/identity";
import { MAX_PROFILE_BYTES, ProfileWireError, checkWire, decodeWire, mergeWire, type WireProfile } from "../src/net/profileWire";
import type { ProfileStore } from "./profileStore";

export interface ProfileRequest {
  uploads: "open" | "closed";
  /** The x-bb-key and x-bb-sig header values ("" when absent). */
  key: string;
  sig: string;
  /** The exact body bytes, at most `max` (app.ts readBody: 413 over it). Called only after the header checks. */
  readBody(max: number): Promise<Uint8Array>;
  store: ProfileStore;
  /** The server's clock in ms: updatedAt's range and the record's receivedAt. */
  now(): number;
  /**
   * IDENT-1 (REQ-BFG-122): whose record the signer writes: its canonical player's (the player a linked key belongs to), or null
   * when that player was deleted (410). Absent: the signer's own id, exactly as before IDENT-1 (every 0.9.13 client, and any
   * caller that has no links).
   */
  owner?(signerId: string): Promise<string | null>;
}

export type ProfileReply = { status: 200; profile: WireProfile } | { status: 400 | 401 | 403 | 410 | 422; error: string };

export async function putProfile(r: ProfileRequest): Promise<ProfileReply> {
  // 1. before the body is read: nothing is parsed, validated or stored
  if (r.uploads === "closed") return { status: 403, error: "uploads are not open yet" };
  // 2. both signing headers present and well formed (syntax only), still before the body is read
  const unsigned = uploadHeaderError(r.key, r.sig);
  if (unsigned) return { status: 401, error: unsigned };
  // 3. the exact bytes received, within the limit (413); the signature must cover exactly them, in the profile domain
  const body = await r.readBody(MAX_PROFILE_BYTES);
  const signer = await verifyProfile(body, r.key, r.sig);
  if (!signer.ok) return { status: 401, error: signer.error };
  // IDENT-1: the record written is the signer's canonical player's; a deleted player's keys write nothing (410)
  const owner = r.owner ? await r.owner(signer.playerId) : signer.playerId;
  if (owner === null) return { status: 410, error: "this player was deleted" };
  // 4. strict UTF-8 (a byte order mark stays in the text and fails the parse), then the strict decode: 400 / 422 (a newer v)
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(body);
  } catch {
    return { status: 400, error: "request body is not UTF-8" };
  }
  let upload: WireProfile;
  try {
    upload = decodeWire(text);
    // 5. the plausibility caps (422, naming the field): garbage is refused, play is not proved
    checkWire(upload, r.now());
  } catch (e) {
    if (e instanceof ProfileWireError) return { status: e.status, error: e.message };
    throw e;
  }
  // 6. read, merge and store under the SIGNER's playerId (the body names none). A lost race between two writes of one key
  //    is accepted: each upload is a device's whole profile, so the next one merges again.
  const stored = await r.store.get(owner);
  const merged = mergeWire(stored?.profile ?? null, upload);
  await r.store.put(owner, { profile: merged, receivedAt: r.now() });
  return { status: 200, profile: merged };
}
