// S4 (REQ-BFG-120; BRIEF-S4 goal 3; LAUNCH-0 REPORT 1.7): THE SERVER SAYS WHEN IT IS IN TROUBLE.
//
// Fly's own check (GET /v1/health every 30 s) only routes traffic away from a failing machine: it never restarts it and never tells anyone, and it cannot see a dead
// deck-check worker, a queue that keeps growing or a cache that is too big for the machine. S2 and S3 put those signals into /v1/health; this file reads them.
//   - A SAMPLER takes a small sample of the numbers /v1/health reports every `intervalS` (10 s) into a BOUNDED RING: `capacity` samples, enough for the longest window
//     (an hour at the defaults: 362 samples, about 60 KB). Its timer is unref()ed and stops when the server closes. It reads memory only: no storage, no worker.
//   - RULES are pure functions over the ring: "for 2 minutes" is a run of samples, "rose in the last 15 minutes" is the newest sample minus the one that old.
//   - GET /v1/health/alerts (app.ts) answers 200 {"status":"ok",...} when every rule is quiet and 503 {"status":"alert","alerts":[{"rule","detail"}]} when one is not. It is
//     for a free outside monitor (UptimeRobot, `ghost-ops check-health`). Fly's check stays on /v1/health: a failing Fly check takes the only machine out of routing.
//     The text holds numbers and rule names, never an address, a key or a player id.
//
// The rules, the /v1/health field each reads, their defaults and the setting that changes each (all BB_ALERT_*, read by readAlertsConfig; a bad value stops the start
// naming the setting, as config.ts does). NO RULE MAY FIRE ON AN HONEST DAY: the reason for each default is in the S4 report and in deploy/OPERATIONS.md.
//   worker-not-ready  validator.state (kind "worker") not "ready" for 30 s (BB_ALERT_WORKER_DOWN_S), once the process is 60 s old (BB_ALERT_BOOT_GRACE_S)
//   worker-restarts   validator.restarts rose in the last 15 min (BB_ALERT_RESTARTS_WINDOW_S)
//   check-timeouts    validator.timeouts or validator.queueFull rose in the last 5 min (BB_ALERT_CHECK_FAIL_WINDOW_S)
//   queue-depth       validator.queueDepth over 8 (BB_ALERT_QUEUE_DEPTH) in every sample for 2 min (BB_ALERT_QUEUE_FOR_S)
//   rss-high          memory.rssMb over 80% (BB_ALERT_RSS_PCT) of the machine's memory (BB_ALERT_MEM_MB, else os.totalmem()) in every sample for 1 min (BB_ALERT_RSS_FOR_S)
//   heap-high         memory.heapUsedMb over 60% (BB_ALERT_HEAP_PCT) of memory.heapLimitMb in every sample for 1 min (BB_ALERT_HEAP_FOR_S)
//   cache-too-small   cache.evictedByCeiling rose by over one ceiling of ghosts (BB_ALERT_EVICT_PER_HOUR) in the last hour (BB_ALERT_EVICT_WINDOW_S); or cache.playerGhosts held
//                     at cache.ceiling for an hour (BB_ALERT_CEILING_HOLD_S) while more than a sixth of a ceiling (BB_ALERT_CEILING_HOLD_EVICT) was dropped in it
//   abuse-refusals    limits.{keyInflight, ipInflight, keyBudget, ipBudget, newKeys} rose by over 30 (BB_ALERT_ABUSE_RISE) in the last 15 min (BB_ALERT_ABUSE_WINDOW_S)
//   server-errors     errors.serverErrors over 1% (BB_ALERT_5XX_PCT) of errors.requests in the last 5 min (BB_ALERT_5XX_WINDOW_S), with at least 20 requests and 3 errors
//   storage-errors    errors.storage rose in the last 5 min (BB_ALERT_STORAGE_WINDOW_S)
// BB_ALERT_DISABLE takes a comma-separated list of rule names to switch off (a rule that cries wolf, until a fix is deployed).

import { totalmem } from "node:os";
import type { CacheStats } from "./bucketCap";
import type { Counts429 } from "./limits";
import type { ValidatorStats } from "./validator";

type Env = Record<string, string | undefined>;

const MB = 1_048_576;

export const RULE_NAMES = [
  "worker-not-ready", "worker-restarts", "check-timeouts", "queue-depth", "rss-high", "heap-high", "cache-too-small", "abuse-refusals", "server-errors", "storage-errors",
] as const;
export type RuleName = (typeof RULE_NAMES)[number];

export interface AlertsConfig {
  /** Seconds between samples. */
  intervalS: number;
  /** Rules switched off. */
  disable: readonly RuleName[];
  /** The machine's memory in MB; null = os.totalmem() (a Fly VM reports its own size). */
  memMb: number | null;
  workerBootGraceS: number;
  workerDownS: number;
  restartsWindowS: number;
  checkFailWindowS: number;
  queueDepth: number;
  queueForS: number;
  rssPct: number;
  rssForS: number;
  heapPct: number;
  heapForS: number;
  /** Ghosts dropped by the ceiling in `evictWindowS` that count as "too small"; null = one ceiling's worth (cache.ceiling). */
  evictPerHour: number | null;
  evictWindowS: number;
  ceilingHoldS: number;
  /** Ghosts dropped in `ceilingHoldS` that make a cache held at its ceiling "too small"; null = a sixth of the ceiling. */
  ceilingHoldEvict: number | null;
  abuseRise: number;
  abuseWindowS: number;
  serverErrorPct: number;
  serverErrorWindowS: number;
  serverErrorMinRequests: number;
  serverErrorMinErrors: number;
  storageErrorWindowS: number;
}

export const DEFAULT_ALERTS: AlertsConfig = {
  intervalS: 10,
  disable: [],
  memMb: null,
  workerBootGraceS: 60, // S2 measured the worker's warm-up at 0.55-0.7 s of CPU (about 1.5 s on a shared CPU's start balance); even throttled to 1/16 speed it is over within 25 s
  workerDownS: 30,
  restartsWindowS: 900,
  checkFailWindowS: 300,
  queueDepth: 8,
  queueForS: 120,
  rssPct: 80,
  rssForS: 60,
  heapPct: 60, // V8 aborts at the old-space limit, 96 MB under S2's flag = 67% of the 144 MB heapLimitMb: 70% could only fire at the crash; the honest peak is 64 MB (44%)
  heapForS: 60,
  evictPerHour: null,
  evictWindowS: 3600,
  ceilingHoldS: 3600,
  ceilingHoldEvict: null,
  abuseRise: 30,
  abuseWindowS: 900,
  serverErrorPct: 1,
  serverErrorWindowS: 300,
  serverErrorMinRequests: 20,
  serverErrorMinErrors: 3,
  storageErrorWindowS: 300,
};

/** A bad BB_ALERT_* setting: config.ts's error style (the setting's name, what was expected, what was got). main.ts maps any start-up error to exit 2. */
export class AlertsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function int(v: string, name: string, min: number, max: number): number {
  const n = Number(v);
  if (!/^\d+$/.test(v) || !Number.isInteger(n) || n < min || n > max) throw new AlertsConfigError(`${name}: expected an integer in ${min}..${max}, got "${v}"`);
  return n;
}

/** The alert thresholds from the environment; every one optional, with the default above. Read for `serve` only. */
export function readAlertsConfig(env: Env): AlertsConfig {
  const d = DEFAULT_ALERTS;
  const n = (name: string, fallback: number, min: number, max: number) => int(env[name] || String(fallback), name, min, max);
  const opt = (name: string, min: number, max: number): number | null => (env[name] ? int(env[name]!, name, min, max) : null);
  const disable = (env.BB_ALERT_DISABLE ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const r of disable) {
    if (!(RULE_NAMES as readonly string[]).includes(r)) throw new AlertsConfigError(`BB_ALERT_DISABLE: unknown rule "${r}" (the rules are ${RULE_NAMES.join(", ")})`);
  }
  return {
    intervalS: n("BB_ALERT_SAMPLE_S", d.intervalS, 1, 300),
    disable: disable as RuleName[],
    memMb: opt("BB_ALERT_MEM_MB", 64, 1_048_576),
    workerBootGraceS: n("BB_ALERT_BOOT_GRACE_S", d.workerBootGraceS, 0, 3600),
    workerDownS: n("BB_ALERT_WORKER_DOWN_S", d.workerDownS, 10, 3600),
    restartsWindowS: n("BB_ALERT_RESTARTS_WINDOW_S", d.restartsWindowS, 60, 86_400),
    checkFailWindowS: n("BB_ALERT_CHECK_FAIL_WINDOW_S", d.checkFailWindowS, 60, 86_400),
    queueDepth: n("BB_ALERT_QUEUE_DEPTH", d.queueDepth, 1, 1000),
    queueForS: n("BB_ALERT_QUEUE_FOR_S", d.queueForS, 10, 3600),
    rssPct: n("BB_ALERT_RSS_PCT", d.rssPct, 1, 100),
    rssForS: n("BB_ALERT_RSS_FOR_S", d.rssForS, 10, 3600),
    heapPct: n("BB_ALERT_HEAP_PCT", d.heapPct, 1, 100),
    heapForS: n("BB_ALERT_HEAP_FOR_S", d.heapForS, 10, 3600),
    evictPerHour: opt("BB_ALERT_EVICT_PER_HOUR", 1, 100_000_000),
    evictWindowS: n("BB_ALERT_EVICT_WINDOW_S", d.evictWindowS, 60, 86_400),
    ceilingHoldS: n("BB_ALERT_CEILING_HOLD_S", d.ceilingHoldS, 60, 86_400),
    ceilingHoldEvict: opt("BB_ALERT_CEILING_HOLD_EVICT", 1, 100_000_000),
    abuseRise: n("BB_ALERT_ABUSE_RISE", d.abuseRise, 1, 1_000_000_000),
    abuseWindowS: n("BB_ALERT_ABUSE_WINDOW_S", d.abuseWindowS, 60, 86_400),
    serverErrorPct: n("BB_ALERT_5XX_PCT", d.serverErrorPct, 1, 100),
    serverErrorWindowS: n("BB_ALERT_5XX_WINDOW_S", d.serverErrorWindowS, 60, 86_400),
    serverErrorMinRequests: n("BB_ALERT_5XX_MIN_REQUESTS", d.serverErrorMinRequests, 1, 1_000_000),
    serverErrorMinErrors: n("BB_ALERT_5XX_MIN_ERRORS", d.serverErrorMinErrors, 1, 1_000_000),
    storageErrorWindowS: n("BB_ALERT_STORAGE_WINDOW_S", d.storageErrorWindowS, 60, 86_400),
  };
}

/** The longest window any rule asks about, seconds: the ring has to reach back this far. */
export function longestWindowS(cfg: AlertsConfig): number {
  return Math.max(
    cfg.workerDownS, cfg.restartsWindowS, cfg.checkFailWindowS, cfg.queueForS, cfg.rssForS, cfg.heapForS, cfg.evictWindowS, cfg.ceilingHoldS, cfg.abuseWindowS,
    cfg.serverErrorWindowS, cfg.storageErrorWindowS,
  );
}

/** The ring's size: samples for the longest window, plus one for each end. 362 at the defaults (3,600 s every 10 s). */
export function ringCapacity(cfg: AlertsConfig): number {
  return Math.ceil(longestWindowS(cfg) / cfg.intervalS) + 2;
}

/** What /v1/health reads, handed to the sampler by app.ts (the same sources, read synchronously: no storage, no wait on the worker). */
export interface HealthInputs {
  uptimeMs: number;
  validator: Pick<ValidatorStats, "kind" | "state" | "queued" | "restarts" | "timeouts" | "queueFull">;
  rssBytes: number;
  heapUsedBytes: number;
  heapLimitBytes: number;
  cache: Pick<CacheStats, "playerGhosts" | "ceiling" | "evictedByCeiling"> | null;
  refused: Counts429;
  /** SHOULD (b): requests answered, 5xx answers and storage errors since boot (absent: the server counts none). */
  errors?: { requests: number; serverErrors: number; storage: number };
}

/** One sample: the numbers the rules read, at a time. */
export interface Sample {
  t: number;
  uptimeS: number;
  kind: string;
  state: string;
  queueDepth: number;
  restarts: number;
  timeouts: number;
  queueFull: number;
  rssMb: number;
  heapUsedMb: number;
  heapLimitMb: number;
  playerGhosts: number | null;
  ceiling: number | null;
  evictedByCeiling: number | null;
  /** keyInflight + ipInflight + keyBudget + ipBudget + newKeys: the refusals that mean one client asked for too much (not `rate`, which a big NAT trips honestly). */
  abuse: number;
  requests: number | null;
  serverErrors: number | null;
  storageErrors: number | null;
}

export function toSample(t: number, h: HealthInputs): Sample {
  const r = h.refused;
  return {
    t, uptimeS: Math.round(h.uptimeMs / 1000), kind: h.validator.kind, state: h.validator.state, queueDepth: h.validator.queued,
    restarts: h.validator.restarts, timeouts: h.validator.timeouts, queueFull: h.validator.queueFull,
    rssMb: h.rssBytes / MB, heapUsedMb: h.heapUsedBytes / MB, heapLimitMb: h.heapLimitBytes / MB,
    playerGhosts: h.cache?.playerGhosts ?? null, ceiling: h.cache?.ceiling ?? null, evictedByCeiling: h.cache?.evictedByCeiling ?? null,
    abuse: r.keyInflight + r.ipInflight + r.keyBudget + r.ipBudget + r.newKeys,
    requests: h.errors?.requests ?? null, serverErrors: h.errors?.serverErrors ?? null, storageErrors: h.errors?.storage ?? null,
  };
}

/** A fixed-size ring: the newest `capacity` samples, oldest first. Pushing never allocates past the capacity. */
export class SampleRing {
  private readonly buf: Sample[] = [];
  private head = 0;
  constructor(readonly capacity: number) {}
  get length(): number {
    return this.buf.length;
  }
  push(s: Sample): void {
    if (this.buf.length < this.capacity) this.buf.push(s);
    else {
      this.buf[this.head] = s;
      this.head = (this.head + 1) % this.capacity;
    }
  }
  /** Oldest first. */
  toArray(): Sample[] {
    return this.buf.length < this.capacity ? [...this.buf] : [...this.buf.slice(this.head), ...this.buf.slice(0, this.head)];
  }
}

/** Paths whose 5xx answers are counted under their own name; any other path is "other", so the counter stays small whatever a client asks for. */
const COUNTED_PATHS = new Set(["/v1/health", "/v1/health/alerts", "/v1/ghosts", "/v1/ghosts/match", "/v1/profile", "/", "/index.html"]);

/** Requests answered since boot and the 5xx among them, by route (the `errors` block of /v1/health and the server-errors rule). Memory only. */
export class RequestCounters {
  requests = 0;
  serverErrors = 0;
  readonly byRoute: Record<string, number> = {};
  record(pathname: string, status: number): void {
    this.requests++;
    if (status < 500) return;
    this.serverErrors++;
    const route = COUNTED_PATHS.has(pathname) ? pathname : "other";
    this.byRoute[route] = (this.byRoute[route] ?? 0) + 1;
  }
}

export interface Alert {
  rule: RuleName;
  detail: string;
}

interface Ctx {
  cfg: AlertsConfig;
  memMb: number;
}

const sec = (s: number) => s * 1000;

/** The newest sample minus the one that old (or the oldest sample, when the ring does not reach back that far): how far a counter rose in the window. Null when it has no value. */
function rose(ring: readonly Sample[], windowMs: number, pick: (s: Sample) => number | null): number | null {
  const last = ring[ring.length - 1];
  if (!last) return null;
  const now = pick(last);
  if (now === null) return null;
  let anchor = ring[0];
  for (let i = ring.length - 1; i >= 0; i--) {
    if (ring[i].t <= last.t - windowMs) {
      anchor = ring[i];
      break;
    }
  }
  const then = pick(anchor);
  return then === null ? null : now - then;
}

/** The samples of the last `forMs`, when the ring reaches back that far (within half a sample interval); null when it does not (a rule that asks "for 2 minutes" is quiet until it has seen 2 minutes). */
function heldWindow(ring: readonly Sample[], forMs: number, intervalMs: number): Sample[] | null {
  const last = ring[ring.length - 1];
  if (!last) return null;
  const tol = intervalMs / 2;
  if (ring[0].t > last.t - forMs + tol) return null;
  return ring.filter((s) => s.t >= last.t - forMs - tol);
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const mins = (s: number) => (s % 60 === 0 ? `${s / 60} min` : `${s} s`);

interface Rule {
  name: RuleName;
  check(ring: readonly Sample[], c: Ctx): string | null;
}

export const RULES: readonly Rule[] = [
  {
    // validator.state: the deck-check worker is warming, restarting or stopped for over 30 s, after the process is 60 s old (its start-up is a second or two)
    name: "worker-not-ready",
    check(ring, { cfg }) {
      const last = ring[ring.length - 1];
      if (!last || last.kind !== "worker" || last.uptimeS < cfg.workerBootGraceS || last.state === "ready" || last.state === "stopped") return null;
      let first = last;
      for (let i = ring.length - 1; i >= 0; i--) {
        const s = ring[i];
        if (s.kind !== "worker" || s.state === "ready" || s.state === "stopped") break;
        first = s;
      }
      const span = last.t - first.t;
      return span >= sec(cfg.workerDownS) ? `the deck-check worker has not been ready for ${Math.round(span / 1000)} s (state ${last.state}, ${last.restarts} restarts since boot); uploads get 503` : null;
    },
  },
  {
    // validator.restarts: a worker was replaced (a crash, an out-of-memory stop, a 10 s deadline)
    name: "worker-restarts",
    check(ring, { cfg }) {
      const d = rose(ring, sec(cfg.restartsWindowS), (s) => s.restarts);
      return d !== null && d > 0 ? `the deck-check worker was restarted ${d} time${d === 1 ? "" : "s"} in the last ${mins(cfg.restartsWindowS)}` : null;
    },
  },
  {
    // validator.timeouts and validator.queueFull: checks that passed their 10 s deadline, or uploads refused because the queue was full
    name: "check-timeouts",
    check(ring, { cfg }) {
      const t = rose(ring, sec(cfg.checkFailWindowS), (s) => s.timeouts) ?? 0;
      const q = rose(ring, sec(cfg.checkFailWindowS), (s) => s.queueFull) ?? 0;
      return t > 0 || q > 0 ? `${t} deck check timeout${t === 1 ? "" : "s"} and ${q} queue-full refusal${q === 1 ? "" : "s"} in the last ${mins(cfg.checkFailWindowS)}` : null;
    },
  },
  {
    // validator.queueDepth over 8 in EVERY sample for 2 minutes: the worker is not keeping up
    name: "queue-depth",
    check(ring, { cfg }) {
      const w = heldWindow(ring, sec(cfg.queueForS), sec(cfg.intervalS));
      return w && w.every((s) => s.queueDepth > cfg.queueDepth)
        ? `the deck-check queue has held over ${cfg.queueDepth} checks for ${mins(cfg.queueForS)} (now ${w[w.length - 1].queueDepth})` : null;
    },
  },
  {
    // memory.rssMb over 80% of the machine's memory for a minute (a bucket load makes RSS jump 50-70 MB for a few seconds: that is not this)
    name: "rss-high",
    check(ring, { cfg, memMb }) {
      const limit = (memMb * cfg.rssPct) / 100;
      const w = heldWindow(ring, sec(cfg.rssForS), sec(cfg.intervalS));
      return w && w.every((s) => s.rssMb > limit)
        ? `memory use (RSS) has been over ${cfg.rssPct}% of the machine's ${fmt(memMb)} MB for ${mins(cfg.rssForS)} (now ${fmt(w[w.length - 1].rssMb)} MB)` : null;
    },
  },
  {
    // memory.heapUsedMb over 60% of memory.heapLimitMb for a minute
    name: "heap-high",
    check(ring, { cfg }) {
      const w = heldWindow(ring, sec(cfg.heapForS), sec(cfg.intervalS));
      return w && w.every((s) => s.heapLimitMb > 0 && s.heapUsedMb > (s.heapLimitMb * cfg.heapPct) / 100)
        ? `the heap has been over ${cfg.heapPct}% of its ${fmt(w[w.length - 1].heapLimitMb)} MB limit for ${mins(cfg.heapForS)} (now ${fmt(w[w.length - 1].heapUsedMb)} MB)` : null;
    },
  },
  {
    // cache.evictedByCeiling and cache.playerGhosts/ceiling: the ghost cache is too big for the machine (more than it holds was dropped in an hour, or it sat full while ghosts were dropped)
    name: "cache-too-small",
    check(ring, { cfg }) {
      const last = ring[ring.length - 1];
      if (!last || last.ceiling === null || last.ceiling <= 0) return null;
      const limit = cfg.evictPerHour ?? last.ceiling;
      const dropped = rose(ring, sec(cfg.evictWindowS), (s) => s.evictedByCeiling);
      if (dropped !== null && dropped > limit) return `${dropped} ghosts were dropped from memory by the ceiling (${last.ceiling}) in the last ${mins(cfg.evictWindowS)}, more than ${limit}: the machine is too small for this traffic`;
      const w = heldWindow(ring, sec(cfg.ceilingHoldS), sec(cfg.intervalS));
      if (w && w.every((s) => s.ceiling !== null && s.ceiling > 0 && s.playerGhosts !== null && s.playerGhosts >= s.ceiling)) {
        const floor = cfg.ceilingHoldEvict ?? Math.max(1, Math.floor(last.ceiling / 6));
        const lost = rose(w, sec(cfg.ceilingHoldS), (s) => s.evictedByCeiling);
        if (lost !== null && lost > floor) return `the ghost cache has been full (${last.ceiling}) for ${mins(cfg.ceilingHoldS)} while ${lost} ghosts were dropped, more than ${floor}: the machine is too small for this traffic`;
      }
      return null;
    },
  },
  {
    // limits.keyInflight, ipInflight, keyBudget, ipBudget, newKeys: S3's abuse limits refused more than 30 requests in 15 minutes
    name: "abuse-refusals",
    check(ring, { cfg }) {
      const d = rose(ring, sec(cfg.abuseWindowS), (s) => s.abuse);
      return d !== null && d > cfg.abuseRise ? `the abuse limits refused ${d} requests in the last ${mins(cfg.abuseWindowS)} (more than ${cfg.abuseRise}): a client is asking for too much` : null;
    },
  },
  {
    // errors.serverErrors over 1% of errors.requests in 5 minutes (with at least 20 requests and 3 errors, so one blip on a quiet server is not an alert)
    name: "server-errors",
    check(ring, { cfg }) {
      const req = rose(ring, sec(cfg.serverErrorWindowS), (s) => s.requests);
      const err = rose(ring, sec(cfg.serverErrorWindowS), (s) => s.serverErrors);
      if (req === null || err === null || req < cfg.serverErrorMinRequests || err < cfg.serverErrorMinErrors) return null;
      return (err * 100) / req > cfg.serverErrorPct ? `${err} of the last ${req} requests (${fmt((err * 100) / req)}%) in ${mins(cfg.serverErrorWindowS)} were answered with a 5xx, more than ${cfg.serverErrorPct}%` : null;
    },
  },
  {
    // errors.storage: a storage request failed after its retries (Tigris down, or the credentials wrong)
    name: "storage-errors",
    check(ring, { cfg }) {
      const d = rose(ring, sec(cfg.storageErrorWindowS), (s) => s.storageErrors);
      return d !== null && d > 0 ? `${d} storage error${d === 1 ? "" : "s"} in the last ${mins(cfg.storageErrorWindowS)}: the bucket did not answer, or refused the request` : null;
    },
  },
];

/** Every rule over a ring (oldest sample first), minus the switched-off ones. Pure. */
export function evaluateRules(ring: readonly Sample[], cfg: AlertsConfig, memMb: number): Alert[] {
  const out: Alert[] = [];
  for (const r of RULES) {
    if (cfg.disable.includes(r.name)) continue;
    const detail = r.check(ring, { cfg, memMb });
    if (detail !== null) out.push({ rule: r.name, detail });
  }
  return out;
}

export interface AlertsOptions {
  /** Thresholds (any field); the defaults are DEFAULT_ALERTS. main.ts passes readAlertsConfig(process.env). */
  cfg?: Partial<AlertsConfig>;
  /** The sampler's clock, ms (default Date.now): tests move it to make minutes pass. */
  now?: () => number;
  /** The machine's memory, MB (default: cfg.memMb, else os.totalmem()). */
  memMb?: number;
}

export interface AlertsAnswer {
  status: 200 | 503;
  body: { status: "ok" | "alert"; alerts: Alert[]; uptimeS: number; samples: number };
}

/** The sampler and the answer behind GET /v1/health/alerts. */
export class Alerts {
  readonly cfg: AlertsConfig;
  readonly ring: SampleRing;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastAt = -Infinity;
  private readonly now: () => number;
  private readonly memOverride: number | undefined;

  constructor(private readonly read: () => HealthInputs, opts: AlertsOptions = {}) {
    this.cfg = { ...DEFAULT_ALERTS, ...(opts.cfg ?? {}) };
    this.ring = new SampleRing(ringCapacity(this.cfg));
    this.now = opts.now ?? (() => Date.now());
    this.memOverride = opts.memMb;
  }

  /** The machine's memory, MB: the setting, else what the OS reports (a Fly VM reports its own size). */
  get memMb(): number {
    return this.memOverride ?? this.cfg.memMb ?? totalmem() / MB;
  }

  /** Take a sample now. */
  sampleNow(): Sample {
    const s = toSample(this.now(), this.read());
    this.lastAt = s.t;
    this.ring.push(s);
    return s;
  }

  /** Start the timer: a sample every `intervalS`. unref()ed, so it never keeps the process alive; stop() on close. */
  start(): void {
    if (this.timer) return;
    this.sampleNow();
    this.timer = setInterval(() => this.sampleNow(), this.cfg.intervalS * 1000);
    (this.timer as unknown as { unref?: () => void }).unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Whether the timer is running. */
  get running(): boolean {
    return this.timer !== null;
  }

  /** The alerts now. A sample is taken first when the newest is a whole interval old (an answer is never staler than that, and a flood of requests cannot flush the ring). */
  evaluate(): Alert[] {
    if (this.now() - this.lastAt >= this.cfg.intervalS * 1000) this.sampleNow();
    return evaluateRules(this.ring.toArray(), this.cfg, this.memMb);
  }

  answer(): AlertsAnswer {
    const alerts = this.evaluate();
    const last = this.ring.toArray().pop();
    const body = { alerts, uptimeS: last?.uptimeS ?? 0, samples: this.ring.length };
    return alerts.length ? { status: 503, body: { status: "alert", ...body } } : { status: 200, body: { status: "ok", ...body } };
  }
}
