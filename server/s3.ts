// Minimal S3 client over the global fetch, for Tigris (Fly's object storage), zero dependencies:
// PUT, GET, HEAD and DELETE object and ListObjectsV2 with continuation. Every request is SigV4
// signed over the SHA-256 of its payload (sigv4.ts) and gets its own timeout (5 s). Network
// errors, timeouts and 5xx answers are retried at most twice, with growing, jittered backoff;
// anything else is final. Errors carry the operation, the key and the status, never a header,
// so they are safe to log.
//
// Addressing: virtual-hosted (https://<bucket>.<endpoint host>/<key>, what Tigris documents; the
// default) or path-style (https://<endpoint host>/<bucket>/<key>; the tests' local fake).

import { amzDate, canonicalQuery, EMPTY_SHA256, sha256Hex, signV4, uriEncode, type QueryParams } from "./sigv4";
import { StorageError } from "./store";

export type Addressing = "virtual" | "path";

export interface S3Options {
  endpoint: string; // AWS_ENDPOINT_URL_S3, a bare origin: https://fly.storage.tigris.dev
  region: string; // AWS_REGION: "auto" on Tigris
  bucket: string; // BUCKET_NAME
  accessKeyId: string; // AWS_ACCESS_KEY_ID
  secretAccessKey: string; // AWS_SECRET_ACCESS_KEY
  addressing?: Addressing; // default "virtual"
  timeoutMs?: number; // per HTTP call; default 5000
  retries?: number; // extra attempts after a network error, timeout or 5xx; default 2
  backoffMs?: number; // delay before the first retry (x4 for the next), plus up to 50% jitter; default 200
  fetch?: typeof fetch; // injectable for tests
  now?: () => Date; // signing clock
  log?: (line: string) => void; // retries are logged here
}

/** S4: S3 requests that failed after their retries (or were refused) since this process started: /v1/health `errors.storage`. Counted where the failure is born, so a
 *  store that wraps it in a StorageError of its own does not count it twice. One server process serves one bucket, so the count is the process's. */
export const S3_FAILURES = { count: 0 };

export class S3Error extends StorageError {
  constructor(message: string, readonly status: number | null = null, readonly code: string | null = null) {
    super(message);
    this.name = "S3Error";
    S3_FAILURES.count++; // S4
  }
}

export interface ListedObject {
  key: string;
  size: number;
  /** S3: the object's LastModified as ms since the epoch (absent when the answer has none or it does not parse): the bucket cap keeps the newest. */
  modified?: number;
}

export interface ListPage {
  objects: ListedObject[];
  truncated: boolean;
  next: string | null; // NextContinuationToken
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Undo XML escaping. Our own keys never need it (safe charset); foreign keys and tokens might. */
export function xmlText(s: string): string {
  return s.replace(/&(#x[0-9A-Fa-f]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (_, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e]);
}

/** Parse a ListObjectsV2 answer (ListBucketResult). */
export function parseListV2(xml: string): ListPage {
  if (!/<ListBucketResult[\s>]/.test(xml)) throw new S3Error("LIST: the answer is not a ListBucketResult");
  const objects: ListedObject[] = [];
  for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const key = /<Key>([^<]*)<\/Key>/.exec(m[1]);
    const size = /<Size>(\d+)<\/Size>/.exec(m[1]);
    const lm = /<LastModified>([^<]*)<\/LastModified>/.exec(m[1]); // S3: kept, so a bucket load can fetch only the newest
    const at = lm ? Date.parse(lm[1]) : NaN;
    if (key) objects.push({ key: xmlText(key[1]), size: size ? Number(size[1]) : -1, ...(Number.isFinite(at) ? { modified: at } : {}) });
  }
  const truncated = /<IsTruncated>\s*true\s*<\/IsTruncated>/.test(xml);
  const token = /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml);
  return { objects, truncated, next: token ? xmlText(token[1]) : null };
}

function errorCode(text: string): string | null {
  const m = /<Code>([^<]{1,64})<\/Code>/.exec(text);
  return m ? m[1] : null;
}

/** The key as a log line or an error message names it. PROFILE-UP: a profile object is profiles/<playerId>.json, and no log
 *  line carries a player id, so its name is shown as profiles/*; every other key (ghosts/...) is shown as it is. */
function shownKey(key: string): string {
  return key.startsWith("profiles/") ? "profiles/*" : key;
}

function errText(e: unknown): string {
  if (e instanceof Error) {
    const cause = (e as { cause?: unknown }).cause;
    const code = typeof cause === "object" && cause !== null ? (cause as { code?: unknown }).code : undefined;
    return typeof code === "string" ? `${e.message} (${code})` : e.message;
  }
  return String(e);
}

interface Reply {
  status: number;
  text: string;
}

export class S3Client {
  readonly bucket: string;
  readonly addressing: Addressing;
  private readonly origin: URL;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly backoffMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => Date;
  private readonly log: (line: string) => void;

  constructor(private readonly o: S3Options) {
    let u: URL;
    try {
      u = new URL(o.endpoint);
    } catch {
      throw new Error("S3 endpoint is not a URL");
    }
    if ((u.protocol !== "https:" && u.protocol !== "http:") || u.pathname !== "/" || u.search || u.hash || u.username || u.password) {
      throw new Error("S3 endpoint must be a bare http(s) origin, such as https://fly.storage.tigris.dev");
    }
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(o.bucket)) throw new Error("S3 bucket name must be 3-63 of a-z 0-9 . -");
    if (!o.accessKeyId || !o.secretAccessKey || !o.region) throw new Error("S3 credentials and region are required");
    this.origin = u;
    this.bucket = o.bucket;
    this.addressing = o.addressing ?? "virtual";
    this.timeoutMs = o.timeoutMs ?? 5000;
    this.retries = o.retries ?? 2;
    this.backoffMs = o.backoffMs ?? 200;
    this.fetchFn = o.fetch ?? ((input, init) => fetch(input, init));
    this.now = o.now ?? (() => new Date());
    this.log = o.log ?? (() => {});
  }

  /** For logs: bucket, endpoint host and addressing. No credentials. */
  describe(): string {
    return `bucket ${this.bucket} at ${this.origin.host} (${this.addressing === "virtual" ? "virtual-hosted" : "path-style"})`;
  }

  /** Where a request for `key` goes ("" = the bucket itself, for LIST). */
  target(key: string, query: QueryParams = []): { url: string; host: string; path: string } {
    if (key && (key.startsWith("/") || key.split("/").some((s) => s === "." || s === ".."))) {
      throw new S3Error(`bad object key ${JSON.stringify(key)}: no leading slash or dot segments`);
    }
    const host = this.addressing === "virtual" ? `${this.bucket}.${this.origin.host}` : this.origin.host;
    const encoded = uriEncode(key, true);
    const path = this.addressing === "virtual" ? `/${encoded}` : `/${this.bucket}${key ? `/${encoded}` : ""}`;
    const qs = canonicalQuery(query); // sent exactly as signed
    return { url: `${this.origin.protocol}//${host}${path}${qs ? `?${qs}` : ""}`, host, path };
  }

  private backoff(attempt: number): number {
    return Math.round(this.backoffMs * 4 ** attempt * (1 + Math.random() / 2));
  }

  /** One HTTP exchange with a hard deadline over headers and body. */
  private async once(url: string, method: string, headers: Record<string, string>, body?: Uint8Array<ArrayBuffer>): Promise<Reply> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchFn(url, { method, headers, body, signal: ctl.signal, redirect: "manual" });
      const text = method === "HEAD" ? "" : await res.text();
      return { status: res.status, text };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Signed request with retries. Returns any answer below 500; throws S3Error otherwise. */
  private async call(op: string, method: string, key: string, query: QueryParams, body?: Uint8Array<ArrayBuffer>, contentType?: string): Promise<Reply> {
    const { url, host, path } = this.target(key, query);
    const payloadHash = body ? sha256Hex(body) : EMPTY_SHA256;
    const what = `${op} ${key ? shownKey(key) : `${this.bucket}/`}`;
    for (let attempt = 0; ; attempt++) {
      const signed: Record<string, string> = { host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate(this.now()) };
      if (contentType) signed["content-type"] = contentType;
      const auth = signV4({
        method, path, query, headers: signed, payloadHash,
        accessKeyId: this.o.accessKeyId, secretAccessKey: this.o.secretAccessKey, region: this.o.region,
      });
      const { host: _host, ...sent } = signed; // fetch sets Host from the URL: the same value
      let failure: string;
      let status: number | null = null;
      try {
        const r = await this.once(url, method, { ...sent, authorization: auth.authorization }, body);
        if (r.status < 500) return r;
        status = r.status;
        const code = errorCode(r.text);
        failure = `HTTP ${r.status}${code ? ` ${code}` : ""}`;
      } catch (e) {
        failure = (e as { name?: string }).name === "AbortError" ? `no answer within ${this.timeoutMs} ms` : `network error: ${errText(e)}`;
      }
      if (attempt >= this.retries) {
        throw new S3Error(`${what}: ${failure} (${attempt + 1} attempt${attempt ? "s" : ""})`, status);
      }
      const wait = this.backoff(attempt);
      this.log(`s3 ${what}: ${failure}; retry ${attempt + 1}/${this.retries} in ${wait} ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  private fail(op: string, key: string, r: Reply): S3Error {
    const code = errorCode(r.text);
    return new S3Error(`${op} ${key ? shownKey(key) : `${this.bucket}/`}: HTTP ${r.status}${code ? ` ${code}` : ""}`, r.status, code);
  }

  async put(key: string, body: string, contentType = "application/json"): Promise<void> {
    const r = await this.call("PUT", "PUT", key, [], new TextEncoder().encode(body), contentType);
    if (r.status !== 200) throw this.fail("PUT", key, r);
  }

  /** The object's text, or null when there is no such key. */
  async getText(key: string): Promise<string | null> {
    const r = await this.call("GET", "GET", key, []);
    if (r.status === 404) return null;
    if (r.status !== 200) throw this.fail("GET", key, r);
    return r.text;
  }

  async head(key: string): Promise<boolean> {
    const r = await this.call("HEAD", "HEAD", key, []);
    if (r.status === 404) return false;
    if (r.status !== 200) throw this.fail("HEAD", key, r);
    return true;
  }

  /** Delete a key. Deleting a missing key succeeds, as on S3. */
  async delete(key: string): Promise<void> {
    const r = await this.call("DELETE", "DELETE", key, []);
    if (r.status !== 204 && r.status !== 200 && r.status !== 404) throw this.fail("DELETE", key, r);
  }

  /** One ListObjectsV2 page. */
  async listPage(prefix: string, token?: string, maxKeys = 1000): Promise<ListPage> {
    const q: [string, string][] = [["list-type", "2"], ["max-keys", String(maxKeys)], ["prefix", prefix]];
    if (token) q.push(["continuation-token", token]);
    const r = await this.call("LIST", "GET", "", q);
    if (r.status !== 200) throw this.fail("LIST", `${prefix}*`, r);
    return parseListV2(r.text);
  }

  /** Every key under a prefix, following continuation tokens. */
  async listAll(prefix: string): Promise<ListedObject[]> {
    const out: ListedObject[] = [];
    const tokens = new Set<string>();
    let token: string | undefined;
    for (;;) {
      const page = await this.listPage(prefix, token);
      for (const o of page.objects) if (o.key.startsWith(prefix)) out.push(o);
      if (!page.truncated) return out;
      if (!page.next || tokens.has(page.next)) throw new S3Error(`LIST ${prefix}*: truncated page without a new continuation token`);
      tokens.add(page.next);
      token = page.next;
    }
  }
}
