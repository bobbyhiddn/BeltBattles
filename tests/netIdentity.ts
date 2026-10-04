// Signing fixtures for the ghost upload tests (0.7.0: every upload is signed with a device key,
// src/net/identity.ts). Not a test file itself.
//
// Four fixed P-256 keys as JWK. TEST KEYS ONLY: published here on purpose, never used anywhere
// else. Fixed keys give fixed player ids, so ghost ids (content hashes that include the playerId)
// and match picks are the same on every run.

import { KEY_HEADER, SIG_HEADER, loadIdentity, memoryKeyStore, type Identity, type KeyStore } from "../src/net/identity";
import type { GhostSnapshot } from "../src/net/snapshot";

export const TEST_JWKS: readonly JsonWebKey[] = [
  { kty: "EC", crv: "P-256", x: "e5hcOCTXIlujNRYsdySwYpqnZstj4ZEgxg8bZjKvpE0", y: "IKvjoYRVUF0eSbgEMjWsfunEA-hKsOi1HVKw-rlQsXs", d: "8lAVfvdiSIsvmxT2QP8slWixwPmoRdCer1S-8l9VG3M" },
  { kty: "EC", crv: "P-256", x: "hynfjUuL3sIg0ljW9Sna2xwW1zhm5vPmxKy9Adhdd04", y: "ho_YrWbCfZaJrSTqWU58fy1IT6AyxGHNemAH9BHb6sM", d: "d4eaJ8Nr_GACaNWWEKl_br-Jjay9DWvoME_HEfjFiSg" },
  { kty: "EC", crv: "P-256", x: "qpbFDuOR4t97lnooCo2OlLCIWiURlk3vLoorXklCcMo", y: "gTO3gF3GeSfOpi7Zr-h9YesOT6B5DX1kW4Ttxn5FzAw", d: "EDD7OO860nlD3WPzj51UfBUITt7DYG3pP5eRjN60snM" },
  { kty: "EC", crv: "P-256", x: "VlsPD2GHRcCfyVDs2YmejbHc1vkj-GWKuutvNad121Q", y: "3PGMWOki_UPB8IOzXWifUtKmDgxVv4BUYlrj5Jw5jFE", d: "oWsaWw6bEK2u-7hahRUIWF81vA6yjGF3-RiNffxiKyk" },
];

const ALG = { name: "ECDSA", namedCurve: "P-256" };

/** Fixed test key n as a device holds its pair: the private key non-extractable, sign only. */
export async function testKeyPair(n = 0): Promise<CryptoKeyPair> {
  const jwk = TEST_JWKS[n];
  if (!jwk) throw new Error(`there are ${TEST_JWKS.length} fixed test keys, not ${n + 1}`);
  const { kty, crv, x, y } = jwk;
  const subtle = globalThis.crypto.subtle;
  return {
    privateKey: await subtle.importKey("jwk", jwk, ALG, false, ["sign"]),
    publicKey: await subtle.importKey("jwk", { kty, crv, x, y }, ALG, true, ["verify"]),
  };
}

/** A memory KeyStore holding fixed test key n. */
export async function testKeyStore(n = 0): Promise<KeyStore> {
  const store = memoryKeyStore();
  await store.addIfAbsent(await testKeyPair(n));
  return store;
}

/** The identity of fixed test key n, through loadIdentity like a device's. */
export async function testIdentity(n = 0): Promise<Identity> {
  const id = await loadIdentity(await testKeyStore(n));
  if (!id) throw new Error("loadIdentity returned null: no WebCrypto in this Node?");
  return id;
}

/** One fixed test identity per distinct playerId, in order of appearance (the sample pool has four players). */
export async function identitiesFor(snapshots: readonly GhostSnapshot[]): Promise<Map<string, Identity>> {
  const out = new Map<string, Identity>();
  for (const s of snapshots) if (!out.has(s.playerId)) out.set(s.playerId, await testIdentity(out.size));
  return out;
}

/** PACKS M2 (REQ-BFG-063): the player name a test upload carries when its snapshot has none (POST /v1/ghosts requires
 *  one on every upload under RULES_VERSION). */
export const TEST_NAME = "TESTER";

/** `snapshot` as `identity` uploads it: the playerId is the key's; PACKS M2: and a player name (TEST_NAME when the
 *  snapshot has none). */
export function ownedBy(snapshot: GhostSnapshot, identity: Identity): GhostSnapshot {
  return { ...snapshot, playerId: identity.playerId, ...(snapshot.name === undefined ? { name: TEST_NAME } : {}) };
}

/** Headers for POST /v1/ghosts with `body` signed by `identity`: content-type, x-bb-key, x-bb-sig. */
export async function signedHeaders(identity: Identity, body: string | Uint8Array): Promise<Record<string, string>> {
  const { key, sig } = await identity.sign(typeof body === "string" ? new TextEncoder().encode(body) : body);
  return { "content-type": "application/json", [KEY_HEADER]: key, [SIG_HEADER]: sig };
}
