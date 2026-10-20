// IDENT-1 step 7 (REQ-BFG-122): the native key mirror. With a mirror (Capacitor's Preferences plugin on the phone builds) a NEW key is
// made extractable ONCE, its private JWK goes to the mirror, and a non-extractable re-import goes to IndexedDB (the KeyStore) as
// before; at load an empty IndexedDB plus a mirrored JWK re-imports it, so a purged WebView keeps its playerId (and its link).
// Without a mirror (the web) nothing changes: non-extractable, IndexedDB only, no mirror touched.
import { describe, expect, it } from "vitest";
import { loadIdentity, memoryKeyStore, playerIdFromKey, toBase64Url, verifyUpload } from "../src/net/identity";
import { MIRROR_JWK, MIRROR_LINK, capacitorMirror, memoryMirror, type IdentityMirror } from "../src/net/identityMirror";
import { LINK_KEY, readLink, writeLink } from "../src/net/linkState";

type Mem = Storage & { keys(): string[] };
function mem(): Mem {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; }, clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k), keys: () => [...m.keys()].sort(),
  };
}

const body = new TextEncoder().encode("hello");

describe("capacitorMirror: Capacitor's Preferences, or nothing", () => {
  it("null without the plugin (the web, the Steam wrapper); an adapter over get/set/remove with it", async () => {
    expect(capacitorMirror({})).toBeNull();
    expect(capacitorMirror({ Capacitor: {} })).toBeNull();
    expect(capacitorMirror({ Capacitor: { Plugins: {} } })).toBeNull();
    expect(capacitorMirror({ Capacitor: { Plugins: { Preferences: { get: () => 1 } } } })).toBeNull(); // a plugin missing set/remove
    const store = new Map<string, string>();
    const calls: string[] = [];
    const Preferences = {
      get: async (o: { key: string }) => (calls.push(`get ${o.key}`), { value: store.get(o.key) ?? null }),
      set: async (o: { key: string; value: string }) => (calls.push(`set ${o.key}`), void store.set(o.key, o.value)),
      remove: async (o: { key: string }) => (calls.push(`remove ${o.key}`), void store.delete(o.key)),
    };
    const m = capacitorMirror({ Capacitor: { Plugins: { Preferences } } })!;
    expect(m).not.toBeNull();
    expect(await m.get("a")).toBeNull();
    await m.set("a", "1");
    expect(await m.get("a")).toBe("1");
    await m.remove("a");
    expect(await m.get("a")).toBeNull();
    expect(calls).toEqual(["get a", "set a", "get a", "remove a", "get a"]);
    // in this Node there is no Capacitor: the default adapter is null, so loadIdentity takes the web path
    expect(capacitorMirror()).toBeNull();
  });
});

describe("with a mirror", () => {
  it("a NEW key is made extractable once and mirrored; IndexedDB's copy is the non-extractable re-import; both are the same key", async () => {
    const mirror = memoryMirror();
    const keys = memoryKeyStore();
    const id = (await loadIdentity(keys, undefined, { mirror, links: null }))!;
    expect(id).not.toBeNull();
    const jwkText = mirror.values.get(MIRROR_JWK);
    expect(jwkText).toBeDefined();
    const jwk = JSON.parse(jwkText!) as JsonWebKey;
    expect(jwk).toMatchObject({ kty: "EC", crv: "P-256" });
    expect(typeof jwk.d).toBe("string"); // the private key
    // the pair in the KeyStore is non-extractable: its private bytes cannot be read back
    const stored = (await keys.get())!;
    expect(stored.privateKey.extractable).toBe(false);
    await expect(globalThis.crypto.subtle.exportKey("jwk", stored.privateKey)).rejects.toThrow();
    // ... and it is the mirrored key: the public halves agree, and the playerId is the hash of that public key
    const raw = new Uint8Array(await globalThis.crypto.subtle.exportKey("raw", stored.publicKey));
    expect(id.keyId).toBe(await playerIdFromKey(raw));
    const fromJwk = await globalThis.crypto.subtle.importKey("jwk", { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]);
    expect(toBase64Url(new Uint8Array(await globalThis.crypto.subtle.exportKey("raw", fromJwk)))).toBe(toBase64Url(raw));
    // it signs, and the signature verifies under the public key the server sees
    const signed = await id.sign(body);
    expect(await verifyUpload(body, signed.key, signed.sig)).toEqual({ ok: true, playerId: id.keyId });
    // loading again changes nothing: the same key, the same mirror text
    const again = (await loadIdentity(keys, undefined, { mirror, links: null }))!;
    expect(again.keyId).toBe(id.keyId);
    expect(mirror.values.get(MIRROR_JWK)).toBe(jwkText);
  });

  it("a purged IndexedDB keeps the playerId: the empty store is refilled from the mirrored key", async () => {
    const mirror = memoryMirror();
    const first = (await loadIdentity(memoryKeyStore(), undefined, { mirror, links: null }))!;
    const purged = memoryKeyStore(); // a new, empty IndexedDB: the WebView was purged
    const second = (await loadIdentity(purged, undefined, { mirror, links: null }))!;
    expect(second.keyId).toBe(first.keyId);
    expect(second.playerId).toBe(first.playerId);
    expect((await purged.get())!.privateKey.extractable).toBe(false); // the restored copy is non-extractable too
    const s = await second.sign(body);
    expect(s.key).toBe(toBase64Url(first.publicKey)); // the same key signs
    expect(await verifyUpload(body, s.key, s.sig)).toEqual({ ok: true, playerId: first.keyId });
    // without the mirror the same purge is a new player (the problem this fixes)
    const lost = (await loadIdentity(memoryKeyStore(), undefined, { mirror: null, links: null }))!;
    expect(lost.keyId).not.toBe(first.keyId);
  });

  it("the link record is mirrored too: a purged WebView keeps its link, and a link made before the mirror is written in", async () => {
    const mirror = memoryMirror();
    const keys = memoryKeyStore();
    const local = mem();
    const id = (await loadIdentity(keys, undefined, { mirror, links: local }))!;
    const P = "p".repeat(43);
    writeLink({ v: 1, player: P, key: id.keyId!, at: 1 }, local);
    await mirror.set(MIRROR_LINK, local.getItem(LINK_KEY)!); // what linkClient does when a link is made
    // the WebView is purged: both IndexedDB and localStorage are empty, the mirror is not
    const fresh = mem();
    const back = (await loadIdentity(memoryKeyStore(), undefined, { mirror, links: fresh }))!;
    expect(back.keyId).toBe(id.keyId);
    expect(readLink(fresh)).toMatchObject({ player: P, key: id.keyId });
    expect(back.playerId).toBe(P); // the restored link is the player
    // a record the device has and the mirror lacks goes into the mirror at load
    const m2 = memoryMirror();
    const k2 = memoryKeyStore();
    const l2 = mem();
    const a = (await loadIdentity(k2, undefined, { mirror: m2, links: l2 }))!;
    writeLink({ v: 1, player: P, key: a.keyId!, at: 2 }, l2);
    await loadIdentity(k2, undefined, { mirror: m2, links: l2 });
    expect(m2.values.get(MIRROR_LINK)).toContain(P);
    // a mirrored record that belongs to another key is not restored
    const m3 = memoryMirror();
    await m3.set(MIRROR_LINK, JSON.stringify({ v: 1, player: P, key: "x".repeat(43), at: 3 }));
    const l3 = mem();
    const c = (await loadIdentity(memoryKeyStore(), undefined, { mirror: m3, links: l3 }))!;
    expect(c.playerId).toBe(c.keyId);
    expect(l3.keys()).toEqual([]);
  });

  it("a mirrored value that is not a P-256 private key is replaced by a new key; a mirror that refuses a write still gives a working key", async () => {
    const m = memoryMirror();
    await m.set(MIRROR_JWK, "not json");
    const id = (await loadIdentity(memoryKeyStore(), undefined, { mirror: m, links: null }))!;
    expect(id).not.toBeNull();
    expect(JSON.parse(m.values.get(MIRROR_JWK)!)).toMatchObject({ kty: "EC", crv: "P-256" }); // the new key replaced the junk
    const broken: IdentityMirror = {
      get: async () => { throw new Error("preferences are down"); },
      set: async () => { throw new Error("preferences are down"); },
      remove: async () => {},
    };
    const works = (await loadIdentity(memoryKeyStore(), undefined, { mirror: broken, links: null }))!;
    expect(works).not.toBeNull();
    const s = await works.sign(body);
    expect(await verifyUpload(body, s.key, s.sig)).toEqual({ ok: true, playerId: works.keyId });
  });
});

describe("without a mirror: the web path is exactly as before", () => {
  it("the key is non-extractable, nothing is mirrored, no storage key is written, and the playerId is the key's own", async () => {
    const keys = memoryKeyStore();
    const local = mem();
    const id = (await loadIdentity(keys, undefined, { mirror: null, links: local }))!;
    expect(id.playerId).toBe(id.keyId);
    expect((await keys.get())!.privateKey.extractable).toBe(false);
    expect(local.keys()).toEqual([]); // loading an identity writes nothing to localStorage
    // the defaults: no Capacitor in this Node, so the default options take the same path
    const plain = (await loadIdentity(memoryKeyStore()))!;
    expect(plain.playerId).toBe(plain.keyId);
    const s = await id.sign(body);
    expect(await verifyUpload(body, s.key, s.sig)).toEqual({ ok: true, playerId: id.playerId });
  });

  it("a refresh() without a link record changes nothing; a record for another key is ignored", async () => {
    const local = mem();
    const id = (await loadIdentity(memoryKeyStore(), undefined, { mirror: null, links: local }))!;
    id.refresh?.();
    expect(id.playerId).toBe(id.keyId);
    writeLink({ v: 1, player: "q".repeat(43), key: "z".repeat(43), at: 1 }, local);
    id.refresh?.();
    expect(id.playerId).toBe(id.keyId);
    local.setItem(LINK_KEY, "{broken");
    id.refresh?.();
    expect(id.playerId).toBe(id.keyId);
  });
});
