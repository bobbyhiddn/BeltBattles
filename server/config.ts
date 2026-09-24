// Server configuration from flags and environment, checked before anything starts. A bad or
// missing setting throws ConfigError naming the setting; secret values are never echoed.
//
//   BB_GHOST_STORE    jsonl | tigris (default jsonl)
//   BB_GHOST_DATA     JSON-lines directory (jsonl store; default ./ghost-data)       --data
//   BB_GHOST_HOST     listen address (default 127.0.0.1)                              --host
//   BB_GHOST_PORT     listen port (default 7790)                                      --port
//   BB_GHOST_ORIGINS  CORS allow-list, comma-separated (default the local Shore)      --origins
//   BB_GHOST_RATE     requests per minute per client IP (default 120)                 --rate
//   BB_GHOST_UPLOADS  open | closed (default open): closed answers POST /v1/ghosts with 403
//   BB_GHOST_TRUST_PROXY  fly | none (default none): fly takes the client IP from Fly-Client-IP,
//                     else the socket (X-Forwarded-For is never trusted); none ignores both headers
//   BB_GHOST_STATIC   directory whose index.html is served at / and /index.html (default: none) --static
//   tigris store: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL_S3, AWS_REGION and
//   BUCKET_NAME (the secrets `fly storage create` sets on the app), plus
//   BB_GHOST_S3_ADDRESSING virtual | path (default virtual) and
//   BB_GHOST_CACHE_TTL_S   seconds a loaded (rules, day) bucket is served before a re-list (default 60)

import { resolve } from "node:path";
import { DEFAULT_ORIGINS } from "./app";
import { S3Client, type Addressing, type S3Options } from "./s3";
import { JsonlStore, type GhostStore } from "./store";
import { TigrisStore } from "./tigrisStore";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/** The variables `fly storage create` sets as app secrets; all are required for the tigris store. */
export const TIGRIS_ENV = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_ENDPOINT_URL_S3", "AWS_REGION", "BUCKET_NAME"] as const;

export type StoreConfig =
  | { kind: "jsonl"; dataDir: string }
  | { kind: "tigris"; s3: S3Options; ttlMs: number };

export interface Config {
  host: string;
  port: number;
  origins: string[];
  rate: number;
  uploads: "open" | "closed";
  trustProxy: "fly" | "none";
  staticDir?: string;
  store: StoreConfig;
}

type Env = Record<string, string | undefined>;

function flag(argv: readonly string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

function int(v: string, name: string, min: number, max: number): number {
  const n = Number(v);
  if (!/^\d+$/.test(v) || !Number.isInteger(n) || n < min || n > max) {
    throw new ConfigError(`${name}: expected an integer in ${min}..${max}, got "${v}"`);
  }
  return n;
}

function oneOf<T extends string>(env: Env, name: string, allowed: readonly T[], fallback: T): T {
  const v = env[name];
  if (v === undefined || v === "") return fallback;
  if (!(allowed as readonly string[]).includes(v)) throw new ConfigError(`${name} must be one of ${allowed.join(", ")} (got "${v}")`);
  return v as T;
}

export function tigrisOptions(env: Env): S3Options {
  const missing = TIGRIS_ENV.filter((k) => !env[k]);
  if (missing.length) {
    throw new ConfigError(
      `BB_GHOST_STORE=tigris needs ${missing.join(", ")}: not set. \`fly storage create\` sets them as app secrets; locally, export them.`,
    );
  }
  const endpoint = env.AWS_ENDPOINT_URL_S3!;
  let u: URL | null = null;
  try {
    u = new URL(endpoint);
  } catch {
    u = null;
  }
  if (!u || (u.protocol !== "https:" && u.protocol !== "http:") || u.pathname !== "/" || u.search || u.username) {
    throw new ConfigError("AWS_ENDPOINT_URL_S3 must be a bare http(s) origin, such as https://fly.storage.tigris.dev");
  }
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(env.BUCKET_NAME!)) {
    throw new ConfigError("BUCKET_NAME must be a bucket name: 3-63 characters of a-z, 0-9, dot and hyphen");
  }
  return {
    endpoint,
    region: env.AWS_REGION!,
    bucket: env.BUCKET_NAME!,
    accessKeyId: env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
    addressing: oneOf<Addressing>(env, "BB_GHOST_S3_ADDRESSING", ["virtual", "path"], "virtual"),
  };
}

export function readConfig(argv: readonly string[], env: Env): Config {
  const kind = oneOf(env, "BB_GHOST_STORE", ["jsonl", "tigris"] as const, "jsonl");
  const store: StoreConfig = kind === "tigris"
    ? { kind, s3: tigrisOptions(env), ttlMs: 1000 * int(env.BB_GHOST_CACHE_TTL_S || "60", "BB_GHOST_CACHE_TTL_S", 1, 86_400) }
    : { kind, dataDir: resolve(flag(argv, "data") ?? env.BB_GHOST_DATA ?? "ghost-data") };
  const staticDir = flag(argv, "static") ?? env.BB_GHOST_STATIC;
  return {
    host: flag(argv, "host") ?? env.BB_GHOST_HOST ?? "127.0.0.1",
    port: int(flag(argv, "port") ?? env.BB_GHOST_PORT ?? "7790", "port (--port, BB_GHOST_PORT)", 0, 65535),
    origins: (flag(argv, "origins") ?? env.BB_GHOST_ORIGINS ?? DEFAULT_ORIGINS.join(","))
      .split(",").map((s) => s.trim()).filter(Boolean),
    rate: int(flag(argv, "rate") ?? env.BB_GHOST_RATE ?? "120", "rate (--rate, BB_GHOST_RATE)", 1, 1_000_000),
    uploads: oneOf(env, "BB_GHOST_UPLOADS", ["open", "closed"] as const, "open"),
    trustProxy: oneOf(env, "BB_GHOST_TRUST_PROXY", ["fly", "none"] as const, "none"),
    staticDir: staticDir ? resolve(staticDir) : undefined,
    store,
  };
}

/** Open the configured store. JSON lines: read the files now. Tigris: no I/O until a request needs it. */
export function openStore(cfg: StoreConfig, log: (line: string) => void): GhostStore {
  if (cfg.kind === "jsonl") {
    const store = new JsonlStore(cfg.dataDir);
    const loaded = store.load();
    log(`ghost store jsonl ${store.file}: ${loaded} ghosts loaded, ${store.skipped} bad lines skipped`);
    return store;
  }
  const store = new TigrisStore(new S3Client({ ...cfg.s3, log }), { ttlMs: cfg.ttlMs, log });
  log(`ghost store tigris, ${store.where}: buckets load on their first match request, cached ${cfg.ttlMs / 1000} s`);
  return store;
}
