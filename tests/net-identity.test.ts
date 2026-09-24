import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash, createPublicKey, verify } from "node:crypto";
import {
  IDENTITY_DB, KEY_HEADER, SIG_HEADER, UPLOAD_PREFIX, fromBase64Url, indexedDbKeyStore, loadIdentity, memoryKeyStore,
  playerIdFromKey, toBase64Url, uploadHeaderError, uploadMessage, verifyUpload, type KeyStore,
} from "../src/net/identity";
import { ID_PATTERN } from "../src/net/snapshot";
import { TEST_JWKS, testIdentity, testKeyPair, testKeyStore } from "./netIdentity";

// Fixed test key 0's playerId: base64url, no padding, of SHA-256(0x04 || x || y).
const PINNED = "_VBDAye10iu-y8OZiY0HMGQkuRTxbjGwKKSn13JsZZE";

const subtle = globalThis.crypto.subtle;
const enc = (s: string) => new TextEncoder().encode(s);
// The signature covers bytes, not JSON: any body works, including a multi-byte character.
const BODY = enc('{"v":1,"rules":"bb-0.4.0","hero":"furnace","note":"Förderband ⚙"}');

/** The raw public key rebuilt from a JWK's x and y with Buffer (independent of identity.ts). */
function rawFromJwk(jwk: JsonWebKey): Uint8Array {
  return new Uint8Array(Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, "base64url"), Buffer.from(jwk.y!, "base64url")]));
}

/** A base64url signature by fixed test key n over exactly `message` (no prefix added). */
async function signBytes(n: number, message: Uint8Array): Promise<string> {
  const { privateKey } = await testKeyPair(n);
  return toBase64Url(new Uint8Array(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, message)));
}

const concat = (a: Uint8Array, b: Uint8Array) => new Uint8Array([...a, ...b]);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("identity: the contract", () => {
  it("names the prefix, the headers and the browser database", () => {
    expect(UPLOAD_PREFIX).toBe("bb-ghost-upload-1\n");
    expect(KEY_HEADER).toBe("x-bb-key");
    expect(SIG_HEADER).toBe("x-bb-sig");
    expect(IDENTITY_DB).toBe("beltbattles-identity");
    expect(uploadMessage(enc("{}"))).toEqual(enc("bb-ghost-upload-1\n{}"));
  });

  it("pins the fixed test key's playerId, cross-checked with node:crypto's SHA-256 over the raw key from the JWK's x and y", async () => {
    const raw = rawFromJwk(TEST_JWKS[0]);
    expect(raw).toHaveLength(65);
    expect(createHash("sha256").update(raw).digest("base64url")).toBe(PINNED);
    expect(await playerIdFromKey(raw)).toBe(PINNED);
    const id = await testIdentity(0);
    expect(id.playerId).toBe(PINNED);
    expect(id.publicKey).toEqual(raw);
    expect(PINNED).toHaveLength(43);
    expect(ID_PATTERN.test(PINNED)).toBe(true);
    for (let n = 1; n < TEST_JWKS.length; n++) {
      const other = rawFromJwk(TEST_JWKS[n]);
      expect((await testIdentity(n)).playerId).toBe(createHash("sha256").update(other).digest("base64url"));
    }
  });

  it("playerIdFromKey takes only a raw uncompressed 65-byte key", async () => {
    const raw = rawFromJwk(TEST_JWKS[0]);
    await expect(playerIdFromKey(raw.subarray(0, 64))).rejects.toThrow(/65 bytes/);
    await expect(playerIdFromKey(new Uint8Array([2, ...raw.subarray(1)]))).rejects.toThrow(/uncompressed/);
    await expect(playerIdFromKey(raw, null)).rejects.toThrow(/WebCrypto/);
  });
});

describe("identity: sign and verify", () => {
  it("a sign/verify round trip passes, and node:crypto agrees on the message and the r||s form", async () => {
    const id = await testIdentity(0);
    const { key, sig } = await id.sign(BODY);
    expect(key).toBe(toBase64Url(rawFromJwk(TEST_JWKS[0])));
    expect(key).toHaveLength(87); // 65 bytes
    expect(sig).toHaveLength(86); // 64 bytes
    expect(fromBase64Url(sig)).toHaveLength(64);
    expect(await verifyUpload(BODY, key, sig)).toEqual({ ok: true, playerId: PINNED });
    // independent check: node:crypto verifies the same signature over "bb-ghost-upload-1\n" + body, IEEE P1363 (r || s)
    const { kty, crv, x, y } = TEST_JWKS[0];
    const pub = createPublicKey({ key: { kty, crv, x, y }, format: "jwk" });
    const message = Buffer.concat([Buffer.from("bb-ghost-upload-1\n", "utf8"), Buffer.from(BODY)]);
    expect(verify("sha256", message, { key: pub, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url"))).toBe(true);
    expect(verify("sha256", Buffer.from(BODY), { key: pub, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url"))).toBe(false);
    // ECDSA signatures are randomized; every one of them verifies
    const again = await id.sign(BODY);
    expect(again.key).toBe(key);
    expect(await verifyUpload(BODY, again.key, again.sig)).toEqual({ ok: true, playerId: PINNED });
    // an empty body is still a body
    const empty = await id.sign(new Uint8Array(0));
    expect(await verifyUpload(new Uint8Array(0), empty.key, empty.sig)).toEqual({ ok: true, playerId: PINNED });
  });

  it("fails after a one-byte change to the body (and a byte added or cut)", async () => {
    const { key, sig } = await (await testIdentity(0)).sign(BODY);
    for (const i of [0, 17, BODY.length - 1]) {
      const changed = new Uint8Array(BODY);
      changed[i] ^= 0x01;
      const r = await verifyUpload(changed, key, sig);
      expect(r.ok, `byte ${i}`).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/x-bb-sig: the signature does not match/);
    }
    expect((await verifyUpload(concat(BODY, enc(" ")), key, sig)).ok).toBe(false);
    expect((await verifyUpload(BODY.subarray(0, BODY.length - 1), key, sig)).ok).toBe(false);
  });

  it("fails when the prefix is missing or changed", async () => {
    const key = toBase64Url(rawFromJwk(TEST_JWKS[0]));
    expect((await verifyUpload(BODY, key, await signBytes(0, uploadMessage(BODY)))).ok).toBe(true); // the control
    for (const prefix of ["", "bb-ghost-upload-2\n", "bb-ghost-upload-1", "bb-ghost-upload-1\r\n", "BB-GHOST-UPLOAD-1\n"]) {
      const r = await verifyUpload(BODY, key, await signBytes(0, concat(enc(prefix), BODY)));
      expect(r.ok, JSON.stringify(prefix)).toBe(false);
    }
  });

  it("fails on a truncated signature", async () => {
    const { key, sig } = await (await testIdentity(0)).sign(BODY);
    const bytes = fromBase64Url(sig)!;
    for (const cut of [toBase64Url(bytes.subarray(0, 63)), toBase64Url(bytes.subarray(0, 32)), sig.slice(0, -1), sig.slice(0, -2), ""]) {
      const r = await verifyUpload(BODY, key, cut);
      expect(r.ok, cut).toBe(false);
    }
    expect(await verifyUpload(BODY, key, toBase64Url(bytes.subarray(0, 63)))).toEqual({
      ok: false, error: "x-bb-sig: expected base64url of a 64-byte P-256 signature",
    });
  });

  it("fails on a signature from another key", async () => {
    const a = await testIdentity(0), b = await testIdentity(1);
    const byA = await a.sign(BODY), byB = await b.sign(BODY);
    expect((await verifyUpload(BODY, byA.key, byB.sig)).ok).toBe(false);
    expect((await verifyUpload(BODY, byB.key, byA.sig)).ok).toBe(false);
    expect(await verifyUpload(BODY, byB.key, byB.sig)).toEqual({ ok: true, playerId: b.playerId });
    expect(b.playerId).not.toBe(a.playerId);
  });

  it("fails on a key that is not a valid P-256 point", async () => {
    const raw = rawFromJwk(TEST_JWKS[0]);
    const { sig } = await (await testIdentity(0)).sign(BODY);
    const offCurve = new Uint8Array(raw);
    offCurve[64] ^= 0x01; // same x, wrong y: not on the curve
    const zeros = new Uint8Array(65);
    zeros[0] = 4;
    const bigX = new Uint8Array(raw);
    bigX.fill(0xff, 1, 33); // x >= p
    for (const bad of [offCurve, zeros, bigX]) {
      expect(await verifyUpload(BODY, toBase64Url(bad), sig)).toEqual({ ok: false, error: "x-bb-key: not a public key on the P-256 curve" });
    }
    // well-formed base64url, wrong shape: compressed, cut short, or SPKI-sized
    for (const bad of [new Uint8Array([2, ...raw.subarray(1)]), raw.subarray(0, 33), raw.subarray(0, 64), new Uint8Array(91)]) {
      const r = await verifyUpload(BODY, toBase64Url(bad), sig);
      expect(r).toEqual({ ok: false, error: "x-bb-key: expected base64url of a raw P-256 public key (65 bytes, uncompressed)" });
    }
  });

  it("header syntax: missing, padded, standard base64, whitespace or non-canonical values are refused before any crypto", async () => {
    const { key, sig } = await (await testIdentity(0)).sign(BODY);
    expect(uploadHeaderError(key, sig)).toBeNull();
    for (const [k, s] of [[undefined, sig], [key, undefined], [null, null], ["", sig], [key, ""]] as const) {
      expect(uploadHeaderError(k, s)).toBe("unsigned upload: the x-bb-key and x-bb-sig headers are required");
      expect((await verifyUpload(BODY, k, s)).ok).toBe(false);
    }
    const std = (t: string) => t.replace(/-/g, "+").replace(/_/g, "/");
    const badKeys = [key + "=", ` ${key}`, key.slice(0, -1), key + "A", `${key.slice(0, 40)}.${key.slice(41)}`];
    if (std(key) !== key) badKeys.push(std(key));
    // the last character of an 87-character value carries 2 unused bits: they must be zero
    const last = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".indexOf(key[86]);
    badKeys.push(key.slice(0, 86) + "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"[last ^ 1]);
    for (const k of badKeys) {
      expect(uploadHeaderError(k, sig), k).toMatch(/^x-bb-key: /);
      expect((await verifyUpload(BODY, k, sig)).ok).toBe(false);
    }
    for (const s of [sig + "=", `${sig}\n`, sig.slice(0, -1), `${sig},${sig}`]) {
      expect(uploadHeaderError(key, s), s).toMatch(/^x-bb-sig: /);
      expect((await verifyUpload(BODY, key, s)).ok).toBe(false);
    }
  });

  it("base64url: no padding, the URL alphabet, and the same bytes as Buffer's", () => {
    for (let n = 0; n <= 67; n++) {
      const bytes = new Uint8Array(n).map((_, i) => (i * 97 + n * 31 + 7) & 0xff);
      const text = toBase64Url(bytes);
      expect(text).toBe(Buffer.from(bytes).toString("base64url"));
      expect(fromBase64Url(text)).toEqual(bytes);
    }
    expect(toBase64Url(new Uint8Array([0xfb, 0xff, 0xbf]))).toBe("-_-_");
    expect(fromBase64Url("+/+/")).toBeNull();
    expect(fromBase64Url("AAA=")).toBeNull();
    expect(fromBase64Url("A")).toBeNull();
    expect(fromBase64Url("AB")).toBeNull(); // 12 bits for 1 byte: the 4 unused bits are not zero
    expect(fromBase64Url("AA")).toEqual(new Uint8Array([0]));
  });
});

describe("identity: the device key", () => {
  it("the private key can't be exported, and the identity carries no private material", async () => {
    const store = memoryKeyStore();
    const id = await loadIdentity(store);
    const pair = await store.get();
    expect(id).not.toBeNull();
    expect(pair).not.toBeNull();
    const priv = pair!.privateKey;
    expect(priv.type).toBe("private");
    expect(priv.extractable).toBe(false);
    expect(priv.algorithm).toMatchObject({ name: "ECDSA", namedCurve: "P-256" });
    expect(priv.usages).toEqual(["sign"]);
    await expect(subtle.exportKey("pkcs8", priv)).rejects.toThrow();
    await expect(subtle.exportKey("jwk", priv)).rejects.toThrow();
    expect(Object.keys(id!).sort()).toEqual(["playerId", "publicKey", "sign"]);
    expect(id!.publicKey).toHaveLength(65);
    expect(id!.publicKey[0]).toBe(4);
    expect(ID_PATTERN.test(id!.playerId) && id!.playerId.length === 43).toBe(true);
    expect(id!.playerId).toBe(await playerIdFromKey(id!.publicKey));
    // what a fresh device signs, the server accepts as its playerId
    const { key, sig } = await id!.sign(BODY);
    expect(await verifyUpload(BODY, key, sig)).toEqual({ ok: true, playerId: id!.playerId });
  });

  it("the same store gives the same identity twice; two tabs racing on a fresh store end up with one key", async () => {
    const store = memoryKeyStore();
    const a = (await loadIdentity(store))!;
    const b = (await loadIdentity(store))!;
    expect(b.playerId).toBe(a.playerId);
    expect(b.publicKey).toEqual(a.publicKey);
    const signed = await b.sign(BODY);
    expect(await verifyUpload(BODY, signed.key, signed.sig)).toEqual({ ok: true, playerId: a.playerId });
    expect((await loadIdentity(memoryKeyStore()))!.playerId).not.toBe(a.playerId); // another device, another id

    const inner = memoryKeyStore();
    let adds = 0;
    const shared: KeyStore = { get: () => inner.get(), addIfAbsent: (p) => (adds++, inner.addIfAbsent(p)) };
    const [t1, t2] = await Promise.all([loadIdentity(shared), loadIdentity(shared)]);
    expect(adds).toBe(2); // both tabs generated a pair...
    expect(t1!.playerId).toBe(t2!.playerId); // ...and both read back the one stored first
    expect(t1!.playerId).toBe(await playerIdFromKey(new Uint8Array(await subtle.exportKey("raw", (await inner.get())!.publicKey))));

    expect((await loadIdentity(await testKeyStore(2)))!.playerId).toBe((await testIdentity(2)).playerId);
  });

  it("memoryKeyStore's add-if-absent keeps the first pair", async () => {
    const store = memoryKeyStore();
    expect(await store.get()).toBeNull();
    const first = await testKeyPair(0), second = await testKeyPair(1);
    await store.addIfAbsent(first);
    await store.addIfAbsent(second);
    expect(await store.get()).toBe(first);
    expect((await loadIdentity(store))!.playerId).toBe(PINNED);
  });

  it("with no subtle, loadIdentity returns null (a plain-http page: crypto without crypto.subtle)", async () => {
    const store = memoryKeyStore();
    expect(await loadIdentity(store, null)).toBeNull();
    expect(await store.get()).toBeNull(); // nothing was made or stored
    vi.stubGlobal("crypto", { getRandomValues: <T>(a: T) => a }); // insecure context: no subtle
    expect(globalThis.crypto.subtle).toBeUndefined();
    expect(await loadIdentity(store)).toBeNull();
    expect(await verifyUpload(BODY, "a", "b")).toMatchObject({ ok: false });
    vi.unstubAllGlobals();
    expect(await loadIdentity(store)).not.toBeNull(); // the real WebCrypto again
  });

  it("returns null when the key store fails, e.g. indexedDbKeyStore where there is no IndexedDB (Node)", async () => {
    expect(typeof (globalThis as { indexedDB?: unknown }).indexedDB).toBe("undefined");
    await expect(indexedDbKeyStore().get()).rejects.toThrow(/no IndexedDB/);
    expect(await loadIdentity(indexedDbKeyStore())).toBeNull();
    const broken: KeyStore = { get: () => Promise.reject(new Error("quota")), addIfAbsent: () => Promise.resolve() };
    expect(await loadIdentity(broken)).toBeNull();
    const refusing: KeyStore = { get: () => Promise.resolve(null), addIfAbsent: () => Promise.resolve() }; // stores nothing
    expect(await loadIdentity(refusing)).toBeNull();
  });
});
