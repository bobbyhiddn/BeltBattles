// S4 (REQ-BFG-120; BRIEF-S4): the raw object client of ghost-ops (ops.ts). server/s3.ts reads and writes TEXT, which is what the ghost server needs; a backup
// must carry the exact bytes and the content type, and the Tigris snapshot request needs a header the server's client never sends. So this client is for the
// tool only. It lists through S3Client (the same paging and parsing as the server), GETs and PUTs bytes, and takes a Tigris snapshot. It has no delete: a
// backup tool that cannot delete cannot delete by mistake. Same SigV4 (sigv4.ts), the same 5 s deadline per call and the same two retries (a network error,
// a timeout or a 5xx), the same rule that errors name the operation, the key and the status and never a header, so they are safe to print.

import { amzDate, EMPTY_SHA256, sha256Hex, signV4 } from "./sigv4";
import { S3Client, S3Error, type S3Options } from "./s3";

/** One object as a LIST shows it. `modified`: LastModified as ms since the epoch, null when the answer has none. */
export interface OpsObject {
  key: string;
  size: number;
  modified: number | null;
}

/** One object as a GET returns it: the exact bytes and the content type it was stored with. */
export interface FetchedObject {
  bytes: Uint8Array<ArrayBuffer>;
  contentType: string | null;
}

/** What ops.ts needs of a bucket. Read and write only; nothing here deletes. */
export interface OpsStore {
  /** For output: bucket and endpoint host. No credentials. */
  readonly where: string;
  readonly bucket: string;
  /** The endpoint's host (AWS_ENDPOINT_URL_S3), for the manifest. */
  readonly host: string;
  /** Every object under the prefix ("" = the whole bucket), following continuation tokens. */
  list(prefix: string): Promise<OpsObject[]>;
  /** The object's bytes and content type, or null when there is no such key. */
  get(key: string): Promise<FetchedObject | null>;
  put(key: string, bytes: Uint8Array<ArrayBuffer>, contentType: string): Promise<void>;
  /** Tigris: take a snapshot of the bucket (CreateBucket with the X-Tigris-Snapshot header). Resolves the version Tigris names, or null. */
  takeSnapshot?(name: string | null): Promise<{ version: string | null }>;
}

interface RawReply {
  status: number;
  headers: { get(name: string): string | null };
  bytes: Uint8Array<ArrayBuffer>;
  text: string;
}

function errorCode(text: string): string | null {
  const m = /<Code>([^<]{1,64})<\/Code>/.exec(text);
  return m ? m[1] : null;
}

function errText(e: unknown): string {
  if (e instanceof Error) {
    const cause = (e as { cause?: unknown }).cause;
    const code = typeof cause === "object" && cause !== null ? (cause as { code?: unknown }).code : undefined;
    return typeof code === "string" ? `${e.message} (${code})` : e.message;
  }
  return String(e);
}

export class RawS3 implements OpsStore {
  readonly bucket: string;
  readonly host: string;
  readonly where: string;
  private readonly client: S3Client;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly backoffMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => Date;
  private readonly log: (line: string) => void;

  constructor(private readonly o: S3Options) {
    this.client = new S3Client(o); // validates the endpoint, the bucket name and the credentials' presence
    this.bucket = o.bucket;
    this.host = new URL(o.endpoint).host;
    this.where = this.client.describe();
    this.timeoutMs = o.timeoutMs ?? 5000;
    this.retries = o.retries ?? 2;
    this.backoffMs = o.backoffMs ?? 200;
    this.fetchFn = o.fetch ?? ((input, init) => fetch(input, init));
    this.now = o.now ?? (() => new Date());
    this.log = o.log ?? (() => {});
  }

  async list(prefix: string): Promise<OpsObject[]> {
    const all = await this.client.listAll(prefix);
    return all.map((x) => ({ key: x.key, size: x.size, modified: x.modified ?? null }));
  }

  async get(key: string): Promise<FetchedObject | null> {
    const r = await this.send("GET", "GET", key, {});
    if (r.status === 404) return null;
    if (r.status !== 200) throw this.fail("GET", key, r);
    return { bytes: r.bytes, contentType: r.headers.get("content-type") };
  }

  async put(key: string, bytes: Uint8Array<ArrayBuffer>, contentType: string): Promise<void> {
    const r = await this.send("PUT", "PUT", key, { "content-type": contentType }, bytes);
    if (r.status !== 200) throw this.fail("PUT", key, r);
  }

  /**
   * Tigris's documented request (https://www.tigrisdata.com/docs/buckets/snapshots-and-forks/, read 2026-10-26): S3 CreateBucket on the bucket with the header
   * `X-Tigris-Snapshot: true`, and a name after a semicolon (`true; name=<name>`); the version comes back in `X-Tigris-Snapshot-Version`. The header is SIGNED
   * (it is one of the SignedHeaders), as the doc's own SDK example does by adding it before signing. Never called by the tests against Tigris.
   */
  async takeSnapshot(name: string | null): Promise<{ version: string | null }> {
    const r = await this.send("CreateBucket", "PUT", "", { "x-tigris-snapshot": name ? `true; name=${name}` : "true" });
    if (r.status !== 200) throw this.fail("CreateBucket (snapshot)", "", r);
    return { version: r.headers.get("x-tigris-snapshot-version") };
  }

  private fail(op: string, key: string, r: RawReply): S3Error {
    const code = errorCode(r.text);
    return new S3Error(`${op} ${key ? key : `${this.bucket}/`}: HTTP ${r.status}${code ? ` ${code}` : ""}`, r.status, code);
  }

  /** One exchange with a hard deadline over headers and body. */
  private async once(url: string, method: string, headers: Record<string, string>, body?: Uint8Array<ArrayBuffer>): Promise<RawReply> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchFn(url, { method, headers, body, signal: ctl.signal, redirect: "manual" });
      const bytes = method === "HEAD" ? new Uint8Array(0) : new Uint8Array(await res.arrayBuffer());
      // an error answer is XML text; read it as text only to find its <Code> (a 200 object body is never decoded)
      const text = res.status === 200 ? "" : new TextDecoder().decode(bytes.subarray(0, 4096));
      return { status: res.status, headers: res.headers, bytes, text };
    } finally {
      clearTimeout(timer);
    }
  }

  /** A signed request with retries: any answer below 500 is returned; a network error, a timeout or a 5xx is retried, then thrown as an S3Error. */
  private async send(op: string, method: string, key: string, extra: Record<string, string>, body?: Uint8Array<ArrayBuffer>): Promise<RawReply> {
    const { url, host, path } = this.client.target(key, []);
    const payloadHash = body ? sha256Hex(body) : EMPTY_SHA256;
    const what = `${op} ${key ? key : `${this.bucket}/`}`;
    for (let attempt = 0; ; attempt++) {
      const signed: Record<string, string> = { host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate(this.now()), ...extra };
      const auth = signV4({
        method, path, query: [], headers: signed, payloadHash,
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
      if (attempt >= this.retries) throw new S3Error(`${what}: ${failure} (${attempt + 1} attempt${attempt ? "s" : ""})`, status);
      const wait = Math.round(this.backoffMs * 4 ** attempt * (1 + Math.random() / 2));
      this.log(`s3 ${what}: ${failure}; retry ${attempt + 1}/${this.retries} in ${wait} ms`);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}
