// In-process fake S3 on node:http, path-style only, for the tests and the local smoke run (never
// shipped: server/dist does not include it). It implements the five operations the Tigris store
// uses: PUT, GET, HEAD and DELETE object and ListObjectsV2 with continuation tokens (pageSize
// forces pagination). It is as strict as the real service about authentication:
//   - the Authorization header must be well-formed SigV4 (AWS4-HMAC-SHA256, credential scope
//     <key>/<yyyymmdd>/<region>/s3/aws4_request, sorted signed headers that include host,
//     x-amz-content-sha256 and x-amz-date, a 64-hex signature),
//   - x-amz-content-sha256 must equal the SHA-256 of the body actually received,
//   - and the signature must verify with the configured secret. The canonical request is rebuilt
//     from the raw request line here, with code written separately from server/sigv4.ts, so a
//     canonicalisation bug in the client shows up as SignatureDoesNotMatch.
// Fault injection (a status, a hang, a dropped connection) and a request log serve the retry,
// timeout and laziness tests.

import { createHash, createHmac } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export interface FakeS3Options {
  accessKeyId: string;
  secretAccessKey: string;
  region?: string; // default "auto", as on Tigris
  buckets?: string[]; // created up front
  pageSize?: number; // most keys per LIST page, whatever max-keys asks; default 1000
  /** S3: the time (ms) a PUT stamps on its object as LastModified. Default: none, so the object lists with the old constant time. */
  clock?: () => number;
}

export type FakeOp = "PUT" | "GET" | "HEAD" | "DELETE" | "LIST" | "OTHER";

export interface FakeRequest {
  op: FakeOp;
  bucket: string;
  key: string; // "" for bucket-level requests; the prefix for LIST
  status: number; // 0 = hung or dropped
}

type Fault = ({ kind: "status"; status: number } | { kind: "hang" } | { kind: "drop" }) & { op?: FakeOp };

interface Stored {
  body: Uint8Array;
  type: string;
  etag: string;
  modified?: number; // S3: LastModified, ms since the epoch; absent = DEFAULT_MODIFIED
}

const DEFAULT_MODIFIED = Date.parse("2026-09-24T00:00:00.000Z"); // what every object listed as before S3 gave the fake a clock

const TOKEN_MARK = "c+/="; // continuation tokens carry + / = so the client must encode them

function hex(data: string | Uint8Array, alg = "sha256"): string {
  return createHash(alg).update(data).digest("hex");
}

/** RFC 3986 strict encoding via encodeURIComponent (which leaves !'()* alone). */
function enc(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

function xmlEscape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function header(req: IncomingMessage, name: string): string {
  const v = req.headers[name];
  return Array.isArray(v) ? v.join(",") : v ?? "";
}

export class FakeS3 {
  readonly buckets = new Map<string, Map<string, Stored>>();
  readonly requests: FakeRequest[] = [];
  readonly region: string;
  endpoint = "";
  private faults: Fault[] = [];
  private server: Server | null = null;

  constructor(readonly opts: FakeS3Options) {
    this.region = opts.region ?? "auto";
    for (const b of opts.buckets ?? []) this.createBucket(b);
  }

  createBucket(name: string): void {
    if (!this.buckets.has(name)) this.buckets.set(name, new Map());
  }

  /** The next n requests (of operation `op`, if given) answer `status` without being processed. */
  failNext(n = 1, status = 503, op?: FakeOp): void {
    for (let i = 0; i < n; i++) this.faults.push({ kind: "status", status, op });
  }

  /** The next n requests (of operation `op`, if given) never get an answer. */
  hangNext(n = 1, op?: FakeOp): void {
    for (let i = 0; i < n; i++) this.faults.push({ kind: "hang", op });
  }

  /** The next n requests (of `op`, if given) have their connection destroyed: a network error. */
  dropNext(n = 1, op?: FakeOp): void {
    for (let i = 0; i < n; i++) this.faults.push({ kind: "drop", op });
  }

  /** Forget faults that were never triggered. */
  clearFaults(): void {
    this.faults = [];
  }

  /** Write an object directly, as another machine (or a stray tool) would. */
  putObject(bucket: string, key: string, body: string, modified?: number): void {
    this.createBucket(bucket);
    const bytes = new TextEncoder().encode(body);
    this.buckets.get(bucket)!.set(key, { body: bytes, type: "application/json", etag: `"${hex(bytes, "md5")}"`, ...(modified !== undefined ? { modified } : {}) });
  }

  getObject(bucket: string, key: string): string | undefined {
    const o = this.buckets.get(bucket)?.get(key);
    return o ? new TextDecoder().decode(o.body) : undefined;
  }

  deleteObject(bucket: string, key: string): void {
    this.buckets.get(bucket)?.delete(key);
  }

  keys(bucket: string, prefix = ""): string[] {
    return [...(this.buckets.get(bucket)?.keys() ?? [])].filter((k) => k.startsWith(prefix)).sort();
  }

  /** How many logged requests had this operation (optionally only for one bucket). */
  count(op: FakeOp, bucket?: string): number {
    return this.requests.filter((r) => r.op === op && (bucket === undefined || r.bucket === bucket)).length;
  }

  listen(port = 0, host = "127.0.0.1"): Promise<string> {
    const server = createServer((req, res) => {
      const chunks: Uint8Array[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        let n = 0;
        for (const c of chunks) n += c.length;
        const body = new Uint8Array(n);
        let o = 0;
        for (const c of chunks) {
          body.set(c, o);
          o += c.length;
        }
        this.handle(req, res, body);
      });
    });
    this.server = server;
    return new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => {
        const a = server.address();
        this.endpoint = `http://${host}:${typeof a === "object" && a ? a.port : port}`;
        resolve(this.endpoint);
      });
    });
  }

  close(): Promise<void> {
    const server = this.server;
    if (!server) return Promise.resolve();
    this.server = null;
    return new Promise((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  }

  private handle(req: IncomingMessage, res: ServerResponse, body: Uint8Array): void {
    const raw = req.url ?? "/";
    const qi = raw.indexOf("?");
    const rawPath = qi >= 0 ? raw.slice(0, qi) : raw;
    const rawQuery = qi >= 0 ? raw.slice(qi + 1) : "";
    const method = req.method ?? "GET";
    const seg = rawPath.split("/");
    let bucket = "", key = "", query: [string, string][] = [];
    try {
      bucket = decodeURIComponent(seg[1] ?? "");
      key = decodeURIComponent(seg.slice(2).join("/"));
      query = rawQuery.split("&").filter(Boolean).map((p) => {
        const eq = p.indexOf("=");
        return eq >= 0 ? [decodeURIComponent(p.slice(0, eq)), decodeURIComponent(p.slice(eq + 1))] : [decodeURIComponent(p), ""];
      });
    } catch {
      return this.answer(res, { op: "OTHER", bucket, key, status: 400 }, "InvalidURI", "cannot decode the request URI");
    }
    const q = new Map(query);
    const op: FakeOp = key === "" ? (method === "GET" && q.get("list-type") === "2" ? "LIST" : "OTHER")
      : method === "PUT" || method === "GET" || method === "HEAD" || method === "DELETE" ? method : "OTHER";
    const entry: FakeRequest = { op, bucket, key: op === "LIST" ? q.get("prefix") ?? "" : key, status: 0 };
    this.requests.push(entry);

    const fi = this.faults.findIndex((f) => f.op === undefined || f.op === op);
    const fault = fi >= 0 ? this.faults.splice(fi, 1)[0] : undefined;
    if (fault?.kind === "hang") return; // never answered; close() tears it down
    if (fault?.kind === "drop") {
      req.socket.destroy();
      return;
    }
    if (fault?.kind === "status") return this.answer(res, entry, "InternalError", "injected fault", fault.status);

    const authError = this.verify(req, method, rawPath, query, body);
    if (authError) return this.answer(res, entry, authError[1], authError[2], authError[0]);

    const objects = this.buckets.get(bucket);
    if (!objects) return this.answer(res, entry, "NoSuchBucket", "the bucket does not exist", 404);
    if (op === "LIST") return this.list(res, entry, bucket, objects, q);
    if (op === "PUT") {
      objects.set(key, { body, type: header(req, "content-type") || "application/octet-stream", etag: `"${hex(body, "md5")}"`, ...(this.opts.clock ? { modified: this.opts.clock() } : {}) });
      entry.status = 200;
      res.statusCode = 200;
      res.setHeader("etag", objects.get(key)!.etag);
      res.end();
      return;
    }
    if (op === "GET" || op === "HEAD") {
      const o = objects.get(key);
      if (!o) {
        if (op === "HEAD") {
          entry.status = 404;
          res.statusCode = 404;
          res.end();
          return;
        }
        return this.answer(res, entry, "NoSuchKey", "the specified key does not exist", 404);
      }
      entry.status = 200;
      res.statusCode = 200;
      res.setHeader("content-type", o.type);
      res.setHeader("content-length", o.body.length);
      res.setHeader("etag", o.etag);
      res.end(op === "GET" ? o.body : undefined);
      return;
    }
    if (op === "DELETE") {
      objects.delete(key);
      entry.status = 204;
      res.statusCode = 204;
      res.end();
      return;
    }
    return this.answer(res, entry, "NotImplemented", `${method} is not supported here`, 501);
  }

  /** [status, code, message] when the request is not properly signed; null when it is. */
  private verify(req: IncomingMessage, method: string, rawPath: string, query: [string, string][], body: Uint8Array): [number, string, string] | null {
    const m = /^AWS4-HMAC-SHA256 Credential=([^/, ]+)\/(\d{8})\/([^/, ]+)\/s3\/aws4_request, ?SignedHeaders=([a-z0-9-]+(?:;[a-z0-9-]+)*), ?Signature=([0-9a-f]{64})$/
      .exec(header(req, "authorization"));
    if (!m) return [403, "AccessDenied", "the Authorization header is not well-formed SigV4"];
    const [, keyId, date, region, signedList, signature] = m;
    if (keyId !== this.opts.accessKeyId) return [403, "InvalidAccessKeyId", "unknown access key"];
    if (region !== this.region) return [400, "AuthorizationHeaderMalformed", `the region must be ${this.region}`];
    const signed = signedList.split(";");
    if (signed.join(";") !== [...new Set(signed)].sort().join(";")) return [403, "AccessDenied", "signed headers must be sorted and unique"];
    for (const need of ["host", "x-amz-content-sha256", "x-amz-date"]) {
      if (!signed.includes(need)) return [403, "AccessDenied", `${need} must be signed`];
    }
    const amz = header(req, "x-amz-date");
    if (!/^\d{8}T\d{6}Z$/.test(amz) || amz.slice(0, 8) !== date) return [403, "AccessDenied", "x-amz-date is malformed or outside the credential date"];
    const claimed = header(req, "x-amz-content-sha256");
    if (!/^[0-9a-f]{64}$/.test(claimed)) return [400, "InvalidArgument", "x-amz-content-sha256 must be the hex SHA-256 of the payload"];
    if (claimed !== hex(body)) return [400, "XAmzContentSHA256Mismatch", "x-amz-content-sha256 does not match the body"];
    let path: string;
    try {
      path = rawPath.split("/").map((s) => enc(decodeURIComponent(s))).join("/");
    } catch {
      return [400, "InvalidURI", "cannot decode the path"];
    }
    const canonicalQuery = query.map(([k, v]) => [enc(k), enc(v)])
      .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) : a[0] < b[0] ? -1 : 1))
      .map(([k, v]) => `${k}=${v}`).join("&");
    const canonicalHeaders = signed.map((n) => `${n}:${header(req, n).trim().replace(/\s+/g, " ")}\n`).join("");
    const canonical = `${method}\n${path}\n${canonicalQuery}\n${canonicalHeaders}\n${signedList}\n${claimed}`;
    const scope = `${date}/${region}/s3/aws4_request`;
    const toSign = `AWS4-HMAC-SHA256\n${amz}\n${scope}\n${hex(canonical)}`;
    let k: Uint8Array = createHmac("sha256", `AWS4${this.opts.secretAccessKey}`).update(date).digest();
    for (const part of [region, "s3", "aws4_request"]) k = createHmac("sha256", k).update(part).digest();
    if (createHmac("sha256", k).update(toSign).digest("hex") !== signature) {
      return [403, "SignatureDoesNotMatch", "the request signature does not match"];
    }
    return null;
  }

  private list(res: ServerResponse, entry: FakeRequest, bucket: string, objects: Map<string, Stored>, q: Map<string, string>): void {
    const prefix = q.get("prefix") ?? "";
    const maxKeys = Math.max(1, Math.min(Number(q.get("max-keys") ?? "1000") || 1000, this.opts.pageSize ?? 1000));
    const token = q.get("continuation-token");
    let after = "";
    if (token !== undefined) {
      if (!token.startsWith(TOKEN_MARK)) return this.answer(res, entry, "InvalidArgument", "bad continuation token", 400);
      after = atob(token.slice(TOKEN_MARK.length));
    }
    const all = [...objects.keys()].filter((k) => k.startsWith(prefix) && k > after).sort();
    const page = all.slice(0, maxKeys);
    const truncated = all.length > page.length;
    const contents = page.map((k) => {
      const o = objects.get(k)!;
      return `<Contents><Key>${xmlEscape(k)}</Key><LastModified>${new Date(o.modified ?? DEFAULT_MODIFIED).toISOString()}</LastModified><ETag>${xmlEscape(o.etag)}</ETag><Size>${o.body.length}</Size><StorageClass>STANDARD</StorageClass></Contents>`;
    }).join("");
    const next = truncated ? `<NextContinuationToken>${xmlEscape(TOKEN_MARK + btoa(page[page.length - 1]))}</NextContinuationToken>` : "";
    const cont = token !== undefined ? `<ContinuationToken>${xmlEscape(token)}</ContinuationToken>` : "";
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>${xmlEscape(bucket)}</Name><Prefix>${xmlEscape(prefix)}</Prefix><KeyCount>${page.length}</KeyCount><MaxKeys>${maxKeys}</MaxKeys>${cont}<IsTruncated>${truncated}</IsTruncated>${next}${contents}</ListBucketResult>`;
    entry.status = 200;
    res.statusCode = 200;
    res.setHeader("content-type", "application/xml");
    res.end(xml);
  }

  private answer(res: ServerResponse, entry: FakeRequest, code: string, message: string, status = 400): void {
    entry.status = status;
    res.statusCode = status;
    res.setHeader("content-type", "application/xml");
    res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<Error><Code>${code}</Code><Message>${xmlEscape(message)}</Message></Error>`);
  }
}
