// PROFILE-UP step 2 (REQ-BFG-074 clause 4, backlog #371; BRIEF-PROFILEUP P1): the profile upload signs in its own domain,
// "bb-profile-1\n" + the exact body bytes. Both cross-domain refusals (a ghost signature fails verifyProfile, a profile
// signature fails verifyUpload), and the ghost path unchanged: UPLOAD_PREFIX, the message bytes, the headers, and an
// Identity that knows nothing of domains.
import { describe, expect, it } from "vitest";
import {
  KEY_HEADER, PROFILE_PREFIX, SIG_HEADER, UPLOAD_PREFIX, loadIdentity, toBase64Url, uploadMessage, verifyProfile, verifyUpload,
  type Identity, type SignDomain,
} from "../src/net/identity";
import { TEST_JWKS, testIdentity, testKeyStore } from "./netIdentity";

const enc = (s: string) => new TextEncoder().encode(s);
const BODY = enc('{"v":1,"counters":{"runs":3},"note":"Förderband ⚙"}');
const PINNED = "_VBDAye10iu-y8OZiY0HMGQkuRTxbjGwKKSn13JsZZE"; // fixed test key 0's playerId (tests/net-identity.test.ts)

/** Plain WebCrypto verifies `sig` by fixed test key 0 over exactly `message` (r || s): independent of identity.ts, which
 *  decodes and verifies by its own code. (atob for the base64url; no Buffer, no node:crypto: tests/ has no Node types.) */
async function rawVerifies(message: Uint8Array<ArrayBuffer>, sig: string): Promise<boolean> {
  const { kty, crv, x, y } = TEST_JWKS[0];
  const subtle = globalThis.crypto.subtle;
  const pub = await subtle.importKey("jwk", { kty, crv, x, y }, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const bin = atob(sig.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, bytes, message);
}

describe("the two domains", () => {
  it("name the prefixes: the ghost's is what it always was, the profile's is bb-profile-1", () => {
    expect(UPLOAD_PREFIX).toBe("bb-ghost-upload-1\n");
    expect(PROFILE_PREFIX).toBe("bb-profile-1\n");
    expect(KEY_HEADER).toBe("x-bb-key");
    expect(SIG_HEADER).toBe("x-bb-sig");
  });

  it("neither prefix starts with the other, so no body makes the two domains' messages equal", () => {
    expect(UPLOAD_PREFIX.startsWith(PROFILE_PREFIX)).toBe(false);
    expect(PROFILE_PREFIX.startsWith(UPLOAD_PREFIX)).toBe(false);
    expect(uploadMessage(BODY, PROFILE_PREFIX)).not.toEqual(uploadMessage(BODY, UPLOAD_PREFIX));
  });

  it("the signed message: the ghost's is unchanged with no domain; the profile's is its prefix then the exact body", () => {
    expect(uploadMessage(enc("{}"))).toEqual(enc("bb-ghost-upload-1\n{}")); // tests/net-identity.test.ts:41, as ever
    expect(uploadMessage(enc("{}"), UPLOAD_PREFIX)).toEqual(enc("bb-ghost-upload-1\n{}"));
    expect(uploadMessage(enc("{}"), PROFILE_PREFIX)).toEqual(enc("bb-profile-1\n{}"));
    expect(uploadMessage(new Uint8Array(0), PROFILE_PREFIX)).toEqual(enc("bb-profile-1\n"));
    expect(() => uploadMessage(BODY, "bb-other-1\n" as SignDomain)).toThrow(/not a signature domain/);
  });
});

describe("signing and verifying in a domain", () => {
  it("sign(body) is the ghost's signature, as it always was: plain WebCrypto verifies it over UPLOAD_PREFIX + body", async () => {
    const id = await testIdentity(0);
    for (const s of [await id.sign(BODY), await id.sign(BODY, UPLOAD_PREFIX)]) {
      expect(await rawVerifies(uploadMessage(BODY), s.sig)).toBe(true);
      expect(await rawVerifies(enc("bb-ghost-upload-1\n" + new TextDecoder().decode(BODY)), s.sig)).toBe(true);
      expect(await rawVerifies(uploadMessage(BODY, PROFILE_PREFIX), s.sig)).toBe(false);
      expect(await verifyUpload(BODY, s.key, s.sig)).toEqual({ ok: true, playerId: PINNED });
    }
  });

  it("sign(body, PROFILE_PREFIX) is a signature over bb-profile-1 + body: plain WebCrypto verifies it, verifyProfile accepts it", async () => {
    const id = await testIdentity(0);
    const s = await id.sign(BODY, PROFILE_PREFIX);
    expect(s.key).toHaveLength(87);
    expect(s.sig).toHaveLength(86);
    expect(await rawVerifies(enc("bb-profile-1\n" + new TextDecoder().decode(BODY)), s.sig)).toBe(true);
    expect(await rawVerifies(uploadMessage(BODY), s.sig)).toBe(false);
    expect(await verifyProfile(BODY, s.key, s.sig)).toEqual({ ok: true, playerId: PINNED });
    expect(PINNED).toBe(id.playerId); // the same key, so the same player, in either domain
    const empty = await id.sign(new Uint8Array(0), PROFILE_PREFIX);
    expect(await verifyProfile(new Uint8Array(0), empty.key, empty.sig)).toEqual({ ok: true, playerId: PINNED });
  });

  it("cross-domain refusal 1: a ghost-domain signature fails verifyProfile, with the signature error and no other", async () => {
    const s = await (await testIdentity(0)).sign(BODY);
    const r = await verifyProfile(BODY, s.key, s.sig);
    expect(r).toEqual({ ok: false, error: "x-bb-sig: the signature does not match this body and key" });
  });

  it("cross-domain refusal 2: a profile-domain signature fails verifyUpload, with the signature error and no other", async () => {
    const s = await (await testIdentity(0)).sign(BODY, PROFILE_PREFIX);
    const r = await verifyUpload(BODY, s.key, s.sig);
    expect(r).toEqual({ ok: false, error: "x-bb-sig: the signature does not match this body and key" });
  });

  it("a one-byte change to the body, another key, and a changed or missing prefix all fail verifyProfile", async () => {
    const id = await testIdentity(0), other = await testIdentity(1);
    const s = await id.sign(BODY, PROFILE_PREFIX);
    for (const i of [0, 9, BODY.length - 1]) {
      const changed = new Uint8Array(BODY);
      changed[i] ^= 0x01;
      expect((await verifyProfile(changed, s.key, s.sig)).ok, `byte ${i}`).toBe(false);
    }
    expect((await verifyProfile(new Uint8Array([...BODY, 0x20]), s.key, s.sig)).ok).toBe(false);
    const theirs = await other.sign(BODY, PROFILE_PREFIX);
    expect((await verifyProfile(BODY, s.key, theirs.sig)).ok).toBe(false); // their signature, my key
    const key = s.key;
    const { privateKey } = (await testKeyStore(0).then((k) => k.get()))!;
    for (const prefix of ["", "bb-profile-2\n", "bb-profile-1", "bb-profile-1\r\n", "BB-PROFILE-1\n"]) {
      const msg = new Uint8Array([...enc(prefix), ...BODY]);
      const sig = toBase64Url(new Uint8Array(await globalThis.crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, msg)));
      expect((await verifyProfile(BODY, key, sig)).ok, JSON.stringify(prefix)).toBe(false);
    }
    // the control: the right prefix, signed by hand, passes
    const sig = toBase64Url(new Uint8Array(await globalThis.crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, uploadMessage(BODY, PROFILE_PREFIX))));
    expect((await verifyProfile(BODY, key, sig)).ok).toBe(true);
  });

  it("verifyProfile shares the header syntax with verifyUpload: the same errors for a missing, padded or short key or signature, and it never throws", async () => {
    const s = await (await testIdentity(0)).sign(BODY, PROFILE_PREFIX);
    const cases: [string | null | undefined, string | null | undefined][] = [
      [undefined, s.sig], [s.key, undefined], ["", s.sig], [s.key, ""], [s.key + "=", s.sig], [s.key, s.sig.slice(1)], ["AAAA", s.sig], [null, null],
    ];
    for (const [k, g] of cases) {
      const a = await verifyProfile(BODY, k, g), b = await verifyUpload(BODY, k, g);
      expect(a.ok).toBe(false);
      expect(a).toEqual(b);
    }
    // a key that is not a point on the curve: the same error, no throw
    const notAPoint = toBase64Url(new Uint8Array([4, ...new Uint8Array(64).fill(7)]));
    expect(await verifyProfile(BODY, notAPoint, s.sig)).toEqual(await verifyUpload(BODY, notAPoint, s.sig));
    // with no WebCrypto at all, the same answer as the ghost's
    expect(await verifyProfile(BODY, s.key, s.sig, null)).toEqual(await verifyUpload(BODY, s.key, s.sig, null));
  });
});

describe("the ghost path is unchanged", () => {
  it("an Identity written before domains (sign takes only the body) is still an Identity, and signs in the ghost domain", async () => {
    const real = await testIdentity(0);
    const legacy: Identity = { playerId: real.playerId, publicKey: real.publicKey, sign: (body) => real.sign(body) };
    const s = await legacy.sign(BODY);
    expect(await verifyUpload(BODY, s.key, s.sig)).toEqual({ ok: true, playerId: PINNED });
    expect((await verifyProfile(BODY, s.key, s.sig)).ok).toBe(false);
  });

  it("loadIdentity's identity signs in the default domain with one argument and in either with two", async () => {
    const id = await loadIdentity(await testKeyStore(2));
    expect(id).not.toBeNull();
    const a = await id!.sign(BODY), b = await id!.sign(BODY, UPLOAD_PREFIX), c = await id!.sign(BODY, PROFILE_PREFIX);
    expect(a.key).toBe(b.key);
    expect(b.key).toBe(c.key);
    for (const s of [a, b]) {
      expect((await verifyUpload(BODY, s.key, s.sig)).ok).toBe(true);
      expect((await verifyProfile(BODY, s.key, s.sig)).ok).toBe(false);
    }
    expect((await verifyProfile(BODY, c.key, c.sig)).ok).toBe(true);
    expect((await verifyUpload(BODY, c.key, c.sig)).ok).toBe(false);
  });
});
