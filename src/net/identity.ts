// Device identity and signed ghost uploads (REQ-BFG-016, 0.7.0; ROADMAP §3: each device makes its
// own private key and a public player ID from it, and signs every upload, so nobody can post as
// you). Browser and Node alike, through WebCrypto only (globalThis.crypto.subtle): no Buffer and
// no node:crypto, so the ghost server verifies uploads with this same file (verifyUpload).
//
//   key       ECDSA P-256 with SHA-256. The private key is generated non-extractable and stays a
//             CryptoKey. In the browser it lives in IndexedDB (database "beltbattles-identity"),
//             never in localStorage, which every page on the shared Shore origin can read.
//   create    once: add-if-absent, then read back, so two tabs racing on a fresh browser both end
//             up with whichever pair was stored first.
//   playerId  base64url without padding of SHA-256(raw public key): 43 characters (ID_PATTERN).
//   message   the UTF-8 bytes of UPLOAD_PREFIX ("bb-ghost-upload-1\n"), then the exact body bytes.
//   headers   x-bb-key: base64url(raw public key: 65 bytes, uncompressed 0x04 || x || y)
//             x-bb-sig: base64url(the 64-byte signature in WebCrypto's r || s form)
//
// Without crypto.subtle (a page on plain http is not a secure context) loadIdentity returns null
// and the caller must not upload: on a plain-http link the game plays offline.

export const UPLOAD_PREFIX = "bb-ghost-upload-1\n";
export const KEY_HEADER = "x-bb-key";
export const SIG_HEADER = "x-bb-sig";
export const IDENTITY_DB = "beltbattles-identity";
export const PUBLIC_KEY_BYTES = 65; // raw export of a P-256 public key: 0x04 || x (32) || y (32)
export const SIGNATURE_BYTES = 64; // ECDSA P-256 signature as WebCrypto makes it: r (32) || s (32)

const KEY_ALG: EcKeyGenParams & EcKeyImportParams = { name: "ECDSA", namedCurve: "P-256" };
const SIG_ALG: EcdsaParams = { name: "ECDSA", hash: "SHA-256" };
const IDB_STORE = "keys"; // one object store, one record: the device's key pair
const IDB_KEY = "device";

/** Where the device key pair is kept. */
export interface KeyStore {
  /** The stored pair, or null while there is none. */
  get(): Promise<CryptoKeyPair | null>;
  /** Store `pair` unless a pair is stored already; a stored pair is never replaced. */
  addIfAbsent(pair: CryptoKeyPair): Promise<void>;
}

/** The two header values of one signed upload. */
export interface SignedUpload {
  key: string; // x-bb-key: base64url(raw public key)
  sig: string; // x-bb-sig: base64url(64-byte r || s signature over UPLOAD_PREFIX + body)
}

export interface Identity {
  /** base64url(SHA-256(raw public key)), no padding: 43 characters. */
  readonly playerId: string;
  /** The raw public key: 65 bytes, uncompressed. */
  readonly publicKey: Uint8Array;
  /** Sign UPLOAD_PREFIX + these exact body bytes; returns the x-bb-key and x-bb-sig values. */
  sign(body: Uint8Array): Promise<SignedUpload>;
}

export type VerifyResult = { ok: true; playerId: string } | { ok: false; error: string };

type MaybeSubtle = SubtleCrypto | null | undefined;

/** WebCrypto, or undefined where a page has none (plain http is not a secure context). */
function webSubtle(): SubtleCrypto | undefined {
  return (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle ?? undefined;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** base64url without padding (RFC 4648 §5). */
export function toBase64Url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const left = bytes.length - i;
    const n = (bytes[i] << 16) | ((left > 1 ? bytes[i + 1] : 0) << 8) | (left > 2 ? bytes[i + 2] : 0);
    out += B64[(n >>> 18) & 63] + B64[(n >>> 12) & 63];
    if (left > 1) out += B64[(n >>> 6) & 63];
    if (left > 2) out += B64[n & 63];
  }
  return out;
}

/**
 * Strict base64url without padding: only the canonical encoding of some bytes decodes (no
 * padding, whitespace, "+" or "/", and unused trailing bits must be zero); anything else is null.
 */
export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((text.length * 3) / 4));
  let acc = 0, bits = 0, o = 0;
  for (let i = 0; i < text.length; i++) {
    acc = ((acc << 6) | B64.indexOf(text[i])) & 0xffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >>> bits) & 0xff;
    }
  }
  return (acc & ((1 << bits) - 1)) === 0 ? out : null;
}

function isRawKey(raw: Uint8Array): boolean {
  return raw.length === PUBLIC_KEY_BYTES && raw[0] === 0x04;
}

const PREFIX_BYTES = new TextEncoder().encode(UPLOAD_PREFIX);

/** The bytes a signature covers: UPLOAD_PREFIX in UTF-8, then the exact body bytes. */
export function uploadMessage(body: Uint8Array): Uint8Array<ArrayBuffer> {
  const m = new Uint8Array(PREFIX_BYTES.length + body.length);
  m.set(PREFIX_BYTES, 0);
  m.set(body, PREFIX_BYTES.length);
  return m;
}

/** playerId = base64url(SHA-256(raw public key)), no padding. Only a 65-byte uncompressed key. */
export async function playerIdFromKey(raw: Uint8Array, subtle: MaybeSubtle = webSubtle()): Promise<string> {
  if (!subtle) throw new Error("playerIdFromKey: no WebCrypto (crypto.subtle) here");
  if (!isRawKey(raw)) throw new Error(`playerIdFromKey: expected a raw uncompressed P-256 public key (${PUBLIC_KEY_BYTES} bytes, 0x04 first)`);
  return toBase64Url(new Uint8Array(await subtle.digest("SHA-256", new Uint8Array(raw))));
}

/**
 * This device's identity: the stored key pair, or a new one (generated non-extractable, stored
 * add-if-absent, then read back, so racing tabs share one key). null when there is no WebCrypto
 * (a plain-http page) or the key cannot be made, stored or read (for example no IndexedDB): the
 * caller must not upload then. Never throws.
 */
export async function loadIdentity(store: KeyStore, subtle: MaybeSubtle = webSubtle()): Promise<Identity | null> {
  if (!subtle) return null;
  const crypto = subtle;
  try {
    let pair = await store.get();
    if (!pair) {
      await store.addIfAbsent(await crypto.generateKey(KEY_ALG, false, ["sign", "verify"]));
      pair = await store.get(); // another tab may have stored its pair first: use the stored one
    }
    if (!pair) return null;
    const publicKey = new Uint8Array(await crypto.exportKey("raw", pair.publicKey));
    const playerId = await playerIdFromKey(publicKey, crypto);
    const key = toBase64Url(publicKey);
    const privateKey = pair.privateKey;
    return {
      playerId,
      publicKey,
      async sign(body: Uint8Array): Promise<SignedUpload> {
        const sig = new Uint8Array(await crypto.sign(SIG_ALG, privateKey, uploadMessage(body)));
        return { key, sig: toBase64Url(sig) };
      },
    };
  } catch {
    return null;
  }
}

/**
 * Syntax only, no crypto: why the x-bb-key / x-bb-sig values are missing or malformed, or null
 * when both are well formed. The server answers 401 on an error before it reads the body;
 * verifyUpload repeats this check.
 */
export function uploadHeaderError(key: string | null | undefined, sig: string | null | undefined): string | null {
  if (!key || !sig) return `unsigned upload: the ${KEY_HEADER} and ${SIG_HEADER} headers are required`;
  const raw = fromBase64Url(key);
  if (!raw || !isRawKey(raw)) return `${KEY_HEADER}: expected base64url of a raw P-256 public key (${PUBLIC_KEY_BYTES} bytes, uncompressed)`;
  const s = fromBase64Url(sig);
  if (!s || s.length !== SIGNATURE_BYTES) return `${SIG_HEADER}: expected base64url of a ${SIGNATURE_BYTES}-byte P-256 signature`;
  return null;
}

/**
 * Check one upload: `sig` must be the signature of `key` over UPLOAD_PREFIX + these exact body
 * bytes. On success, the key's playerId. Never throws; every failure is { ok: false }.
 */
export async function verifyUpload(
  body: Uint8Array, key: string | null | undefined, sig: string | null | undefined, subtle: MaybeSubtle = webSubtle(),
): Promise<VerifyResult> {
  const malformed = uploadHeaderError(key, sig);
  if (malformed) return { ok: false, error: malformed };
  if (!subtle) return { ok: false, error: "cannot verify: no WebCrypto (crypto.subtle) here" };
  const raw = fromBase64Url(key as string) as Uint8Array<ArrayBuffer>;
  const signature = fromBase64Url(sig as string) as Uint8Array<ArrayBuffer>;
  let publicKey: CryptoKey;
  try {
    publicKey = await subtle.importKey("raw", raw, KEY_ALG, false, ["verify"]);
  } catch {
    return { ok: false, error: `${KEY_HEADER}: not a public key on the P-256 curve` };
  }
  try {
    if (!(await subtle.verify(SIG_ALG, publicKey, signature, uploadMessage(body)))) {
      return { ok: false, error: `${SIG_HEADER}: the signature does not match this body and key` };
    }
    return { ok: true, playerId: await playerIdFromKey(raw, subtle) };
  } catch {
    return { ok: false, error: `${SIG_HEADER}: the signature could not be checked` };
  }
}

/** A KeyStore in memory, for tests and tools: the key lives as long as the process. */
export function memoryKeyStore(): KeyStore {
  let stored: CryptoKeyPair | null = null;
  return {
    async get() {
      return stored;
    },
    async addIfAbsent(pair) {
      if (stored === null) stored = pair;
    },
  };
}

function asPair(v: unknown): CryptoKeyPair | null {
  if (typeof v !== "object" || v === null) return null;
  const { publicKey, privateKey } = v as Partial<CryptoKeyPair>;
  return publicKey && privateKey ? { publicKey, privateKey } : null;
}

/**
 * The browser's KeyStore: IndexedDB database "beltbattles-identity", one record. Structured clone
 * keeps a non-extractable CryptoKey usable without exposing its bytes. addIfAbsent uses add(): a
 * ConstraintError means another tab stored its pair first, and that pair is kept. Every call
 * opens and closes its own connection. Without IndexedDB (Node, some locked-down browsers) both
 * methods reject, and loadIdentity returns null.
 */
export function indexedDbKeyStore(factory: IDBFactory | undefined = (globalThis as { indexedDB?: IDBFactory }).indexedDB): KeyStore {
  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    if (!factory) {
      reject(new Error("no IndexedDB here"));
      return;
    }
    const req = factory.open(IDENTITY_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close(); // never block a later upgrade from another tab
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error(`cannot open IndexedDB "${IDENTITY_DB}"`));
  });
  return {
    async get() {
      const db = await open();
      try {
        return await new Promise<CryptoKeyPair | null>((resolve, reject) => {
          const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(IDB_KEY);
          req.onsuccess = () => resolve(asPair(req.result));
          req.onerror = () => reject(req.error ?? new Error("IndexedDB read failed"));
        });
      } finally {
        db.close();
      }
    },
    async addIfAbsent(pair) {
      const db = await open();
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(IDB_STORE, "readwrite");
          const req = tx.objectStore(IDB_STORE).add({ publicKey: pair.publicKey, privateKey: pair.privateKey }, IDB_KEY);
          req.onerror = (ev) => {
            if (req.error?.name === "ConstraintError") ev.preventDefault(); // already stored: keep that pair
          };
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error ?? new Error("IndexedDB write aborted"));
        });
      } finally {
        db.close();
      }
    },
  };
}
