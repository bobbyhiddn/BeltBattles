// AWS Signature Version 4 for S3 requests, header-based, over the SHA-256 of the payload
// (never UNSIGNED-PAYLOAD). node:crypto only, no SDK. The algorithm is the one in "Signature
// Calculations for the Authorization Header: Transferring Payload in a Single Chunk (AWS
// Signature Version 4)" in the Amazon S3 API Reference; tests/sigv4.test.ts replays that
// section's published examples through signV4.

import { createHash, createHmac } from "node:crypto";

/** SHA-256 of the empty payload (GET, HEAD, DELETE, LIST). */
export const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: string | Uint8Array, data: string): Uint8Array {
  return createHmac("sha256", key).update(data).digest();
}

const UNRESERVED = /^[A-Za-z0-9\-._~]$/;

/**
 * URI-encode as SigV4 wants it: unreserved characters (A-Z a-z 0-9 - . _ ~) stay, every other
 * UTF-8 byte becomes %XX with upper-case hex. "/" stays only with keepSlash (object key paths).
 */
export function uriEncode(text: string, keepSlash = false): string {
  let out = "";
  for (const byte of new TextEncoder().encode(text)) {
    const c = String.fromCharCode(byte);
    out += UNRESERVED.test(c) || (keepSlash && c === "/") ? c : "%" + byte.toString(16).toUpperCase().padStart(2, "0");
  }
  return out;
}

/** The x-amz-date form of a time: 20130524T000000Z. */
export function amzDate(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "");
}

export type QueryParams = readonly (readonly [string, string])[];

/** Canonical query string: names and values encoded, sorted by name, then value. */
export function canonicalQuery(query: QueryParams): string {
  return query
    .map(([k, v]) => [uriEncode(k), uriEncode(v)] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

export interface SignRequest {
  method: string;
  /** Absolute path exactly as sent, already URI-encoded once: "/test%24file.text". */
  path: string;
  /** Query parameters, not encoded. "?lifecycle" is [["lifecycle", ""]]. */
  query?: QueryParams;
  /** Every header to sign, any case. Must include host and x-amz-date. */
  headers: Readonly<Record<string, string>>;
  /** Hex SHA-256 of the payload: the x-amz-content-sha256 value. */
  payloadHash: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string; // "auto" on Tigris
  service?: string; // default "s3"
}

export interface SignedRequest {
  canonicalRequest: string;
  stringToSign: string;
  signedHeaders: string;
  signature: string;
  authorization: string;
}

export function signV4(r: SignRequest): SignedRequest {
  const service = r.service ?? "s3";
  const headers = new Map<string, string>();
  for (const [name, value] of Object.entries(r.headers)) {
    headers.set(name.toLowerCase(), value.trim().replace(/\s+/g, " "));
  }
  const amz = headers.get("x-amz-date") ?? "";
  if (!/^\d{8}T\d{6}Z$/.test(amz)) throw new Error("signV4: the x-amz-date header is missing or malformed");
  if (!headers.get("host")) throw new Error("signV4: the host header is missing");
  if (!/^[0-9a-f]{64}$/.test(r.payloadHash)) throw new Error("signV4: payloadHash must be a hex SHA-256");
  const names = [...headers.keys()].sort();
  const signedHeaders = names.join(";");
  const canonicalRequest = [
    r.method.toUpperCase(),
    r.path,
    canonicalQuery(r.query ?? []),
    names.map((n) => `${n}:${headers.get(n)}\n`).join(""),
    signedHeaders,
    r.payloadHash,
  ].join("\n");
  const date = amz.slice(0, 8);
  const scope = `${date}/${r.region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amz, scope, sha256Hex(canonicalRequest)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${r.secretAccessKey}`, date), r.region), service), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  return {
    canonicalRequest,
    stringToSign,
    signedHeaders,
    signature,
    authorization: `AWS4-HMAC-SHA256 Credential=${r.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}
