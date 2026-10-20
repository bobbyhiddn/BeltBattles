// IDENT-1 (REQ-BFG-122): the profile follows the player. The server holds ONE profile per canonical player (PUT /v1/profile writes
// the signer's player's record, merged by profileWire.mergeWire); this module brings it back to the device:
//   mergeRemoteProfile   merge a wire profile into the local one with the wire's own rules: counters take the max, the hero lists and
//                        unlocks the union, the picks (chosen) follow the newer updatedAt. seen, folded, runNew and bestEndless stay
//                        on the device, untouched. A newer build's profile (profile.v above PROFILE_V) is never overwritten by an
//                        older one, which is profile.ts's rule (saveProfile refuses it; so this returns "skipped").
//   startupProfileSync   for a device whose key is LINKED (a beltbattles.link.v1 record for this key): read the player's profile
//                        (getProfile) and merge it; at most once an hour (the time is kept in the link record). A device that was
//                        never linked does nothing at all: no request, no new storage key, exactly as 0.9.13. Never throws.
// The link flow merges the profile the redeem answered with (linkClient.ts); the title calls startupProfileSync once per page load,
// as soon as the online session has an identity.

import { PROFILE_V, evaluateUnlocks, loadProfile, saveProfile, type Profile } from "../game/profile";
import type { Identity } from "./identity";
import { browserLinkStorage, readLink, writeLink, type LinkStorage } from "./linkState";
import { getProfile } from "./profileClient";
import { WIRE_V, encodeWire, mergeWire, toWire, type WireProfile } from "./profileWire";

/** The server's profile is read at startup at most this often (per device). */
export const SYNC_INTERVAL_MS = 3_600_000;

export type MergeResult = "merged" | "unchanged" | "skipped";
export type SyncResult = MergeResult | "failed";

type Store = Pick<Storage, "getItem" | "setItem">;

/** Merge `remote` into the local profile and save it. "unchanged": the local profile already had everything. "skipped": the local
 *  profile is a newer build's (never written), the wire is a newer version than this build reads, or storage refused it. */
export function mergeRemoteProfile(remote: WireProfile, store?: Store | null): MergeResult {
  try {
    const local = loadProfile(store);
    if (local.v > PROFILE_V || remote.v > WIRE_V) return "skipped";
    const here = toWire(local);
    const merged = mergeWire(here, remote);
    if (encodeWire({ ...merged, updatedAt: 0 }) === encodeWire({ ...here, updatedAt: 0 })) return "unchanged";
    local.counters = { ...merged.counters };
    local.heroesWon = [...merged.heroesWon];
    local.heroesFinished = [...merged.heroesFinished];
    local.unlocked = [...new Set([...local.unlocked, ...merged.unlocked])];
    local.chosen = { ...merged.chosen } as Profile["chosen"];
    evaluateUnlocks(local); // the merged counters may earn more than either side had opened
    return saveProfile(local, store) ? "merged" : "skipped";
  } catch {
    return "skipped";
  }
}

export interface SyncDeps {
  /** Where the link record and the profile live (default localStorage). */
  store?: (LinkStorage & Store) | null;
  now?: () => number;
  get?: typeof getProfile;
  timeoutMs?: number;
}

export async function startupProfileSync(baseUrl: string, id: Identity, deps: SyncDeps = {}): Promise<SyncResult> {
  try {
    const store = deps.store === undefined ? browserLinkStorage() : deps.store;
    const rec = readLink(store);
    const keyId = id.keyId ?? id.playerId;
    if (!rec || rec.key !== keyId) return "skipped"; // never linked (or the record is another key's): no request at all
    const now = (deps.now ?? (() => Date.now()))();
    if (rec.readAt !== undefined && now >= rec.readAt && now - rec.readAt < SYNC_INTERVAL_MS) return "skipped";
    const r = await (deps.get ?? getProfile)(baseUrl, id, deps.timeoutMs ?? 4000, () => now);
    if (!r.ok) return "failed";
    const merged = r.profile ? mergeRemoteProfile(r.profile, store) : "unchanged";
    writeLink({ ...rec, player: r.player, readAt: now }, store); // the server's word on the player heals the record; the clock marks the read
    return merged;
  } catch {
    return "failed";
  }
}
