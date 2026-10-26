// Server configuration from flags and environment, checked before anything starts. A bad or
// missing setting throws ConfigError naming the setting; secret values are never echoed.
//
//   BB_GHOST_STORE    jsonl | tigris (default jsonl)
//   BB_GHOST_DATA     JSON-lines directory (jsonl store; default ./ghost-data)       --data
//   BB_GHOST_HOST     listen address (default 127.0.0.1)                              --host
//   BB_GHOST_PORT     listen port (default 7790)                                      --port
//   BB_GHOST_ORIGINS  CORS allow-list, comma-separated (default the local Shore)      --origins
//   BB_GHOST_RATE     requests per minute per client IP (default 120)                 --rate
//   BB_GHOST_UPLOADS  open | closed (default closed): closed answers POST /v1/ghosts and PUT /v1/profile with 403;
//                     only an explicit open takes uploads
//   BB_GHOST_TRUST_PROXY  fly | none (default none): fly takes the client IP from Fly-Client-IP,
//                     else the socket (X-Forwarded-For is never trusted); none ignores both headers
//   BB_GHOST_STATIC   directory whose index.html is served at / and /index.html (default: none) --static
//   tigris store: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL_S3 and BUCKET_NAME
//   (the secrets `fly storage create` sets on the app), AWS_REGION (default auto, Tigris' signing
//   region; only newer flyctl versions set it), plus
//   BB_GHOST_S3_ADDRESSING virtual | path (default virtual) and
//   BB_GHOST_CACHE_TTL_S   seconds a loaded (rules, day) bucket is served before a re-list (default 60)
//   S2, the deck-check worker (validator.ts; read by main.ts through readValidatorConfig, only when uploads are open):
//   BB_GHOST_VALIDATE_QUEUE       places to wait in besides the one check running (default 16)
//   BB_GHOST_VALIDATE_TIMEOUT_MS  ms from joining the queue to the 503 + Retry-After deadline (default 10000)
//   BB_GHOST_VALIDATE_HEAP_MB     the worker's resourceLimits.maxOldGenerationSizeMb (default 64). A process-wide
//                                 NODE_OPTIONS=--max-old-space-size=N overrides it (Node 20 and 22 give every thread the flag's
//                                 limit); /v1/health reports the limit the worker really has
//                                 a few more scavenges (about 15% more CPU for a deck check) for a lower peak RSS during a deep check
//   S3, the memory cap and the abuse limits (limits.ts has the defaults and the reasons; read by main.ts through readLimitsConfig, for `serve` only):
//   BB_GHOST_BUCKET_CAP           player ghosts one (rules, day) bucket keeps in memory: the newest (default 2000); seed ghosts never count
//   BB_GHOST_CACHE_MAX            player ghosts the whole cache keeps (default 12000, sized for 256 MB under --max-old-space-size=96; 40000 for
//                                 512 MB under 300); past it the least recently used bucket loses its oldest ghosts first
//   BB_GHOST_NEW_KEYS_PER_IP_DAY  keys the server has not seen that one client address (an IPv6 /64) may bring in 24 hours (default 500)
//   BB_GHOST_CHECK_KEY_MS         check time one key may use: a full balance, ms of deck check (default 60000)
//   BB_GHOST_CHECK_KEY_REFILL     what a key earns back, ms of check time per second (default 50)
//   BB_GHOST_CHECK_IP_MS          the same for one client address (default 60000) and
//   BB_GHOST_CHECK_IP_REFILL      its refill, ms per second (default 100)
//   BB_GHOST_CHECK_IP_INFLIGHT    deck checks one address may have waiting or running at once (default 4)
//   BB_GHOST_CHECK_KEY_INFLIGHT   deck checks one key may have waiting or running at once (default 1)

import { resolve } from "node:path";
import { DEFAULT_ORIGINS } from "./app";
import { DEFAULT_LIMITS, type Limits } from "./limits";
import { S3Client, type Addressing, type S3Options } from "./s3";
import { JsonlStore, type GhostStore } from "./store";
import { TigrisStore } from "./tigrisStore";
import { DEFAULT_QUEUE, DEFAULT_TIMEOUT_MS, DEFAULT_WORKER_HEAP_MB, DEFAULT_WORKER_YOUNG_MB } from "./validator";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * The variables the tigris store requires: the app secrets every `fly storage create` sets.
 * AWS_REGION is optional (default "auto", Tigris' signing region): Fly's documented output sets
 * only these four, and newer flyctl versions add AWS_REGION=auto.
 */
export const TIGRIS_ENV = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_ENDPOINT_URL_S3", "BUCKET_NAME"] as const;

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
    region: env.AWS_REGION || "auto",
    bucket: env.BUCKET_NAME!,
    accessKeyId: env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
    addressing: oneOf<Addressing>(env, "BB_GHOST_S3_ADDRESSING", ["virtual", "path"], "virtual"),
  };
}

/** The store settings alone: BB_GHOST_STORE and the jsonl directory (--data) or the Tigris variables. The server
 *  (readConfig) and the admin tool (ghostAdmin.ts, 0.7.0 R1) read the store the same way. */
export function readStoreConfig(argv: readonly string[], env: Env): StoreConfig {
  const kind = oneOf(env, "BB_GHOST_STORE", ["jsonl", "tigris"] as const, "jsonl");
  return kind === "tigris"
    ? { kind, s3: tigrisOptions(env), ttlMs: 1000 * int(env.BB_GHOST_CACHE_TTL_S || "60", "BB_GHOST_CACHE_TTL_S", 1, 86_400) }
    : { kind, dataDir: resolve(flag(argv, "data") ?? env.BB_GHOST_DATA ?? "ghost-data") };
}

export function readConfig(argv: readonly string[], env: Env): Config {
  const store = readStoreConfig(argv, env);
  const staticDir = flag(argv, "static") ?? env.BB_GHOST_STATIC;
  return {
    host: flag(argv, "host") ?? env.BB_GHOST_HOST ?? "127.0.0.1",
    port: int(flag(argv, "port") ?? env.BB_GHOST_PORT ?? "7790", "port (--port, BB_GHOST_PORT)", 0, 65535),
    origins: (flag(argv, "origins") ?? env.BB_GHOST_ORIGINS ?? DEFAULT_ORIGINS.join(","))
      .split(",").map((s) => s.trim()).filter(Boolean),
    rate: int(flag(argv, "rate") ?? env.BB_GHOST_RATE ?? "120", "rate (--rate, BB_GHOST_RATE)", 1, 1_000_000),
    uploads: oneOf(env, "BB_GHOST_UPLOADS", ["open", "closed"] as const, "closed"),
    trustProxy: oneOf(env, "BB_GHOST_TRUST_PROXY", ["fly", "none"] as const, "none"),
    staticDir: staticDir ? resolve(staticDir) : undefined,
    store,
  };
}

/** S2: the deck-check worker's settings (BB_GHOST_VALIDATE_*), with the defaults BRIEF-S2 sets: queue 16, deadline 10 s. */
export interface ValidatorConfig {
  queue: number;
  timeoutMs: number;
  workerHeapMb: number;
  /** The worker's young generation cap (resourceLimits.maxYoungGenerationSizeMb). */
  workerYoungMb: number;
}

export function readValidatorConfig(env: Env): ValidatorConfig {
  return {
    queue: int(env.BB_GHOST_VALIDATE_QUEUE || String(DEFAULT_QUEUE), "BB_GHOST_VALIDATE_QUEUE", 1, 1000),
    timeoutMs: int(env.BB_GHOST_VALIDATE_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS), "BB_GHOST_VALIDATE_TIMEOUT_MS", 100, 600_000),
    workerHeapMb: int(env.BB_GHOST_VALIDATE_HEAP_MB || String(DEFAULT_WORKER_HEAP_MB), "BB_GHOST_VALIDATE_HEAP_MB", 32, 8192),
    workerYoungMb: int(env.BB_GHOST_VALIDATE_YOUNG_MB || String(DEFAULT_WORKER_YOUNG_MB), "BB_GHOST_VALIDATE_YOUNG_MB", 3, 1024),
  };
}

/** S3: the memory cap and the abuse limits (BB_GHOST_BUCKET_CAP ... BB_GHOST_CHECK_IP_INFLIGHT), each with its default from limits.ts; a bad value names the setting. */
export function readLimitsConfig(env: Env): Limits {
  const d = DEFAULT_LIMITS;
  const n = (name: string, fallback: number, min: number, max: number) => int(env[name] || String(fallback), name, min, max);
  return {
    bucketCap: n("BB_GHOST_BUCKET_CAP", d.bucketCap, 10, 1_000_000),
    cacheMax: n("BB_GHOST_CACHE_MAX", d.cacheMax, 100, 10_000_000),
    newKeysPerIpDay: n("BB_GHOST_NEW_KEYS_PER_IP_DAY", d.newKeysPerIpDay, 1, 1_000_000),
    checkKeyMs: n("BB_GHOST_CHECK_KEY_MS", d.checkKeyMs, 100, 3_600_000),
    checkKeyRefill: n("BB_GHOST_CHECK_KEY_REFILL", d.checkKeyRefill, 1, 1_000_000),
    checkIpMs: n("BB_GHOST_CHECK_IP_MS", d.checkIpMs, 100, 3_600_000),
    checkIpRefill: n("BB_GHOST_CHECK_IP_REFILL", d.checkIpRefill, 1, 1_000_000),
    checkIpInflight: n("BB_GHOST_CHECK_IP_INFLIGHT", d.checkIpInflight, 1, 1000),
    checkKeyInflight: n("BB_GHOST_CHECK_KEY_INFLIGHT", d.checkKeyInflight, 1, 1000),
  };
}

/** Open the configured store. JSON lines: read the files now. Tigris: no I/O until a request needs it. S3: `caps` is the memory cap (bucketCap, cacheMax). */
export function openStore(cfg: StoreConfig, log: (line: string) => void, caps: Pick<Limits, "bucketCap" | "cacheMax"> = DEFAULT_LIMITS): GhostStore {
  if (cfg.kind === "jsonl") {
    const store = new JsonlStore(cfg.dataDir, caps);
    const loaded = store.load();
    log(`ghost store jsonl ${store.file}: ${loaded} ghosts loaded, ${store.skipped} bad lines skipped`);
    return store;
  }
  const store = new TigrisStore(new S3Client({ ...cfg.s3, log }), { ttlMs: cfg.ttlMs, log, bucketCap: caps.bucketCap, cacheMax: caps.cacheMax });
  log(`ghost store tigris, ${store.where}: buckets load on their first match request, cached ${cfg.ttlMs / 1000} s; at most ${caps.bucketCap} player ghosts a bucket and ${caps.cacheMax} in all`);
  return store;
}
