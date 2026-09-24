// Zero-dependency ghost build server on node:http (ROADMAP §3). Local-first: main.ts
// binds 127.0.0.1. Every uploaded deck is re-validated with the game's own deck rules
// and gold budget; the server never trusts a client's claim that its build is legal.
// Storage sits behind the async GhostStore interface (store.ts): JSON lines or Tigris.
//
//   GET  /v1/health                 never touches storage; reports the store kind
//   POST /v1/ghosts                 body: canonical GhostSnapshot JSON  -> 201 { id } (200 if already stored)
//                                   403 { error } while uploads are closed (the body is not read)
//   GET  /v1/ghosts/match?rules=&day=&wins=&lives=&player=&seen=id1,id2 -> 200 { id, snapshot } | 404
//   GET|HEAD / and /index.html      the game page, when staticDir (BB_GHOST_STATIC) is set

import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import { Rng } from "../src/core/rng";
import { RULES_VERSION } from "../src/sim/content";
import { matchSeed, pickGhost, type MatchRequest } from "../src/net/matchmaking";
import { decodeSnapshot, ID_PATTERN, MAX_DAY, MAX_LIVES, MAX_SNAPSHOT_BYTES, SnapshotError } from "../src/net/snapshot";
import { validateBuild } from "../src/net/validate";
import { sha256Hex } from "./sigv4";
import { JsonlStore, StorageError, type GhostStore } from "./store";

export const DEFAULT_ORIGINS = ["http://127.0.0.1:7778"]; // the local Shore
export const MAX_BODY_BYTES = MAX_SNAPSHOT_BYTES;
const MAX_SEEN = 64;

export interface ServerOptions {
  /** The ghost store. Default: a JsonlStore over dataDir, loaded right away. */
  store?: GhostStore;
  dataDir?: string;
  origins?: string[]; // CORS allow-list (exact origins)
  rateLimit?: { windowMs: number; max: number }; // per client IP, all endpoints
  log?: (line: string) => void;
  /** Mixed into the match seed. Default: the current minute, so a retry gets the same ghost. */
  matchSalt?: () => number | string;
  /**
   * "closed": POST /v1/ghosts answers 403 without reading the body (seeding still works).
   * Production runs closed until signed writes and the player budget ceiling land (0.7.0).
   */
  uploads?: "open" | "closed";
  /**
   * Whose address the rate limit and the request log use. "fly" (behind Fly's proxy): the
   * Fly-Client-IP header, then the first X-Forwarded-For hop, then the socket address.
   * Default "none": the socket address only; both headers are ignored, so nobody can spoof them.
   */
  trustProxy?: "fly" | "none";
  /**
   * Serve <staticDir>/index.html (the single-file game) at GET and HEAD / and /index.html, from
   * the same HTTPS origin as the API. Read once, now; a missing file throws. Other paths outside
   * /v1 stay 404.
   */
  staticDir?: string;
}

export interface GhostServer {
  server: Server;
  store: GhostStore;
  listen(port: number, host?: string): Promise<number>;
  close(): Promise<void>;
}

class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly extra: Record<string, unknown> = {}) {
    super(message);
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-content-type-options", "nosniff");
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage, max: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const tooBig = () => new HttpError(413, `request body over ${max} bytes`);
    if (Number(req.headers["content-length"] ?? 0) > max) {
      req.resume();
      reject(tooBig());
      return;
    }
    const chunks: Uint8Array[] = [];
    let total = 0, done = false;
    req.on("data", (c) => {
      if (done) return;
      total += c.length;
      if (total > max) {
        done = true;
        reject(tooBig());
      } else chunks.push(c);
    });
    req.on("end", () => {
      if (done) return;
      done = true;
      const all = new Uint8Array(total);
      let o = 0;
      for (const c of chunks) {
        all.set(c, o);
        o += c.length;
      }
      try {
        resolve(new TextDecoder("utf-8", { fatal: true }).decode(all));
      } catch {
        reject(new HttpError(400, "request body is not UTF-8"));
      }
    });
    req.on("error", (e) => {
      if (!done) {
        done = true;
        reject(e);
      }
    });
  });
}

class RateLimiter {
  private hits = new Map<string, { start: number; n: number }>();
  constructor(readonly windowMs: number, readonly max: number) {}

  allow(ip: string, now: number): boolean {
    if (this.hits.size > 10_000) {
      for (const [k, h] of this.hits) if (now - h.start >= this.windowMs) this.hits.delete(k);
    }
    let h = this.hits.get(ip);
    if (!h || now - h.start >= this.windowMs) {
      h = { start: now, n: 0 };
      this.hits.set(ip, h);
    }
    return ++h.n <= this.max;
  }
}

const IP_TEXT = /^[0-9A-Fa-f:.]{2,45}$/; // an IPv4 or IPv6 literal; anything else is ignored

function firstHeader(req: IncomingMessage, name: string): string {
  const v = req.headers[name];
  return (Array.isArray(v) ? v[0] ?? "" : v ?? "").trim();
}

/** The client address for the rate limit and the request log (see ServerOptions.trustProxy). */
export function clientIp(req: IncomingMessage, trust: "fly" | "none" = "none"): string {
  const socket = req.socket.remoteAddress ?? "unknown";
  if (trust !== "fly") return socket;
  const fly = firstHeader(req, "fly-client-ip");
  if (IP_TEXT.test(fly)) return fly;
  const hop = firstHeader(req, "x-forwarded-for").split(",")[0].trim();
  if (IP_TEXT.test(hop)) return hop;
  return socket;
}

function intParam(q: URLSearchParams, name: string, min: number, max: number): number {
  const v = q.get(name);
  if (v === null || !/^\d{1,4}$/.test(v) || Number(v) < min || Number(v) > max) {
    throw new HttpError(400, `${name}: expected an integer in ${min}..${max}`);
  }
  return Number(v);
}

export function parseMatchQuery(q: URLSearchParams): MatchRequest {
  const rules = q.get("rules") ?? "";
  if (!/^[A-Za-z0-9._-]{1,32}$/.test(rules)) throw new HttpError(400, "rules: expected a rules version");
  const player = q.get("player") ?? "";
  if (!ID_PATTERN.test(player)) throw new HttpError(400, "player: expected an anonymous player id");
  const seenRaw = q.get("seen") ?? "";
  const seen = seenRaw ? seenRaw.split(",") : [];
  if (seen.length > MAX_SEEN || seen.some((s) => !ID_PATTERN.test(s))) {
    throw new HttpError(400, `seen: expected up to ${MAX_SEEN} comma-separated ghost ids`);
  }
  return {
    rules, day: intParam(q, "day", 1, MAX_DAY), wins: intParam(q, "wins", 0, MAX_DAY),
    lives: intParam(q, "lives", 0, MAX_LIVES), playerId: player, seen,
  };
}

interface Page {
  file: string;
  body: Uint8Array;
  etag: string;
}

/** Read the game page once. The error names the file and what is expected, nothing else. */
export function loadPage(dir: string): Page {
  const file = join(dir, "index.html");
  let body: Uint8Array;
  try {
    body = readFileSync(file);
  } catch (e) {
    const code = (e as { code?: unknown }).code;
    throw new Error(`static page: cannot read ${file}${typeof code === "string" ? ` (${code})` : ""}; BB_GHOST_STATIC must be a directory holding index.html`);
  }
  return { file, body, etag: `"${sha256Hex(body).slice(0, 32)}"` };
}

function sendPage(req: IncomingMessage, res: ServerResponse, page: Page, head: boolean): void {
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "no-cache"); // revalidate every time: a deploy is seen at once
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("etag", page.etag);
  const inm = firstHeader(req, "if-none-match").split(",").map((t) => t.trim().replace(/^W\//, ""));
  if (inm.includes(page.etag)) {
    res.statusCode = 304;
    res.end();
    return;
  }
  res.statusCode = 200;
  res.setHeader("content-length", page.body.length);
  res.end(head ? undefined : page.body);
}

function openJsonl(dataDir: string | undefined, log: (line: string) => void): JsonlStore {
  if (dataDir === undefined) throw new Error("createGhostServer: pass a store or a dataDir");
  const store = new JsonlStore(dataDir);
  const loaded = store.load();
  log(`ghost store ${store.file}: ${loaded} ghosts loaded, ${store.skipped} bad lines skipped`);
  return store;
}

export function createGhostServer(opts: ServerOptions): GhostServer {
  const log = opts.log ?? ((line: string) => console.log(line));
  const origins = new Set(opts.origins ?? DEFAULT_ORIGINS);
  const limiter = new RateLimiter(opts.rateLimit?.windowMs ?? 60_000, opts.rateLimit?.max ?? 120);
  const salt = opts.matchSalt ?? (() => Math.floor(Date.now() / 60_000));
  const store = opts.store ?? openJsonl(opts.dataDir, log);
  const uploads = opts.uploads ?? "open";
  const trustProxy = opts.trustProxy ?? "none";
  const page = opts.staticDir === undefined ? null : loadPage(opts.staticDir);
  if (page) log(`serving the game page ${page.file} (${page.body.length} bytes) at / and /index.html`);
  const started = Date.now();

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const method = req.method ?? "GET";
    const only = (m: string) => {
      if (method !== m) throw new HttpError(405, `use ${m}`);
    };
    switch (url.pathname) {
      case "/v1/health":
        only("GET");
        // never touches storage: `ghosts` counts what this process holds in memory
        return send(res, 200, {
          ok: true, rules: RULES_VERSION, store: store.kind, ghosts: store.size, uploads,
          uptimeS: Math.round((Date.now() - started) / 1000),
        });
      case "/v1/ghosts": {
        only("POST");
        // before the body is read: nothing is parsed, validated or stored (Node discards the rest)
        if (uploads === "closed") throw new HttpError(403, "uploads are not open yet");
        const snap = decodeSnapshot(await readBody(req, MAX_BODY_BYTES));
        if (snap.rules !== RULES_VERSION) {
          throw new HttpError(422, `rules ${snap.rules} not accepted: this server validates ${RULES_VERSION}`);
        }
        const v = validateBuild(snap.build, snap.day);
        if (!v.ok) throw new HttpError(422, "deck failed validation", { errors: v.errors });
        const { id, created } = await store.add(snap); // 201 only once the write is durable
        return send(res, created ? 201 : 200, { id });
      }
      case "/v1/ghosts/match": {
        only("GET");
        const m = parseMatchQuery(url.searchParams);
        const hit = pickGhost(await store.bucket(m.rules, m.day), m, new Rng(matchSeed(m, salt())));
        if (!hit) throw new HttpError(404, "no ghost for this rules version and day yet");
        return send(res, 200, { id: hit.id, snapshot: hit.snapshot });
      }
      case "/":
      case "/index.html":
        if (!page) throw new HttpError(404, "not found");
        if (method !== "GET" && method !== "HEAD") throw new HttpError(405, "use GET or HEAD");
        return sendPage(req, res, page, method === "HEAD");
      default:
        throw new HttpError(404, "not found");
    }
  }

  const server = createServer((req, res) => {
    const t0 = Date.now();
    const ip = clientIp(req, trustProxy); // the rate limit's key and the log's address
    const url = new URL(req.url ?? "/", "http://ghost.local");
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
    const allowed = origin !== "" && origins.has(origin);
    if (allowed) {
      res.setHeader("access-control-allow-origin", origin);
      res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
      res.setHeader("access-control-allow-headers", "content-type");
      res.setHeader("access-control-max-age", 600);
    }
    res.setHeader("vary", "Origin");
    const finish = (e?: unknown) => {
      if (e instanceof HttpError) {
        if (e.status === 429) res.setHeader("retry-after", Math.ceil(limiter.windowMs / 1000));
        if (e.status === 413) res.setHeader("connection", "close");
        send(res, e.status, { error: e.message, ...e.extra });
      } else if (e instanceof SnapshotError) {
        send(res, 400, { error: e.message });
      } else if (e instanceof StorageError) {
        log(`storage error: ${e.message}`); // op, key and status only: never credentials
        res.setHeader("retry-after", 5);
        send(res, 503, { error: "ghost storage unavailable, try again shortly" });
      } else if (e !== undefined) {
        log(`error: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
        if (!res.headersSent) send(res, 500, { error: "internal error" });
      }
      // path only: queries carry the anonymous player id, which the log does not need
      log(`${new Date().toISOString()} ${ip} ${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - t0}ms`);
    };
    if (req.method === "OPTIONS") {
      if (allowed) {
        res.statusCode = 204;
        res.end();
        return finish();
      }
      return finish(new HttpError(403, "origin not allowed"));
    }
    if (!limiter.allow(ip, t0)) return finish(new HttpError(429, "rate limit exceeded, slow down"));
    route(req, res, url).then(() => finish(), finish);
  });
  server.requestTimeout = 10_000; // slow-body guard
  server.headersTimeout = 5_000;

  return {
    server,
    store,
    listen: (port, host = "127.0.0.1") => new Promise<number>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => {
        const a = server.address();
        resolve(typeof a === "object" && a ? a.port : port);
      });
    }),
    close: () => new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    }),
  };
}
