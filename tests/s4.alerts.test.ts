// S4 (BRIEF-S4 goal 3): server/alerts.ts. The rules are pure functions over a ring of health samples, so each one is tested on a crafted series: it FIRES on the series that
// is the trouble it names, stays QUIET one step short of it, and stays quiet on an idle server and on the numbers S2 and S3 measured on an honest day (idle RSS 104 MB, heap 7 MB,
// a bucket load's 50-70 MB RSS jump for a few seconds, the ceiling's 64 MB heap, an honest NAT's few refusals). Also: the settings (names, defaults, bad values), the bounded ring,
// the sampler (its timer is unref()ed and stops) and the answer (200 when quiet, 503 with the reasons). The route over a real server is tests/s4.health.test.ts.
import { afterEach, describe, expect, it, vi } from "vitest";
import { totalmem } from "node:os";
import {
  Alerts, AlertsConfigError, DEFAULT_ALERTS, RULE_NAMES, RULES, SampleRing, evaluateRules, longestWindowS, readAlertsConfig, ringCapacity, toSample,
  type AlertsConfig, type HealthInputs, type Sample,
} from "../server/alerts";
import { zeroCounts } from "../server/limits";

const MB = 1_048_576;
const MEM = 215; // the 256 MB machine as the OS reports it (S3's bench: "the ~215 MB the machine has")
const T0 = 1_800_000_000_000;

/** An idle server's sample (S2/S3 numbers: RSS 104 MB, heap 7.4 of 144 MB, a worker ready, nothing refused), `i` intervals after T0. */
function at(i: number, over: Partial<Sample> = {}, step = 10): Sample {
  return {
    t: T0 + i * step * 1000, uptimeS: 3600 + i * step, kind: "worker", state: "ready", queueDepth: 0, restarts: 0, timeouts: 0, queueFull: 0,
    rssMb: 104, heapUsedMb: 7.4, heapLimitMb: 144, playerGhosts: 0, ceiling: 6000, evictedByCeiling: 0, abuse: 0, requests: 0, serverErrors: 0, storageErrors: 0, ...over,
  };
}
/** `seconds` of samples every 10 s, ending at index `n - 1` (so the newest is at T0 + (n - 1) * 10 s); `f(i, n)` gives sample i's changes. */
function series(seconds: number, f: (i: number, n: number) => Partial<Sample> = () => ({})): Sample[] {
  const n = seconds / 10 + 1;
  return Array.from({ length: n }, (_, i) => at(i, f(i, n)));
}
const fire = (ring: readonly Sample[], cfg: Partial<AlertsConfig> = {}, mem = MEM) => evaluateRules(ring, { ...DEFAULT_ALERTS, ...cfg }, mem);
const rules = (ring: readonly Sample[], cfg: Partial<AlertsConfig> = {}, mem = MEM) => fire(ring, cfg, mem).map((a) => a.rule);
const HOUR = 3600;

describe("S4 alerts: quiet when nothing is wrong", () => {
  it("an idle server for an hour, and the first seconds of a boot, fire nothing", () => {
    expect(fire(series(HOUR))).toEqual([]);
    expect(fire([])).toEqual([]);
    expect(fire([at(0, { uptimeS: 2, state: "warming", playerGhosts: null, ceiling: null, evictedByCeiling: null })])).toEqual([]);
    // a boot: the worker warms for the first 3 intervals (30 s), the process is 40 s old: inside the boot grace
    const boot = Array.from({ length: 5 }, (_, i) => at(i, { uptimeS: i * 10, state: i < 3 ? "warming" : "ready" }));
    expect(fire(boot)).toEqual([]);
  });

  it("an honest day on the 256 MB machine: the numbers S2 and S3 measured stay under every rule", () => {
    // RSS settles at 123-157 MB with a full cache and jumps to 193-198 MB for a few seconds during a bucket load (S3 report, section 6); heap 61-64 MB after a load at the
    // ceiling; the cache full at its 6,000 and dropping ghosts as uploads arrive (Tier A: a busy hour is about 600 uploads); a few honest 429s on a big NAT (S3, section 7)
    const day = series(24 * HOUR, (i) => {
      const h = i / 360; // hours
      const load = i % 90 === 0; // a bucket load every 15 minutes: two samples of a 198 MB peak
      return {
        rssMb: load ? 198 : i % 90 === 1 ? 175 : 150 + 7 * Math.sin(i / 20), heapUsedMb: load ? 64 : 45 + 10 * Math.sin(i / 17),
        playerGhosts: h < 2 ? Math.min(6000, Math.floor(h * 3000)) : 6000, evictedByCeiling: Math.max(0, Math.floor((h - 2) * 600)),
        abuse: Math.floor(h / 6), queueDepth: i % 700 === 0 ? 3 : 0, requests: i * 40, serverErrors: Math.floor(i / 5000), storageErrors: 0,
      };
    });
    expect(day.length).toBeGreaterThan(8000);
    for (let end = 400; end <= day.length; end += 37) {
      const ring = day.slice(Math.max(0, end - ringCapacity(DEFAULT_ALERTS)), end); // what the ring holds at that moment
      expect(rules(ring), `at sample ${end}`).toEqual([]);
    }
    expect(rules(day.slice(-ringCapacity(DEFAULT_ALERTS)))).toEqual([]);
  });

  it("every rule has a name in RULE_NAMES and a check; the names are unique", () => {
    expect(RULES.map((r) => r.name)).toEqual([...RULE_NAMES]);
    expect(new Set(RULE_NAMES).size).toBe(RULE_NAMES.length);
  });
});

describe("S4 alerts: worker-not-ready (validator.state)", () => {
  const warming = (secondsNotReady: number, uptime = 3600) => series(120, (i, n) => (i >= n - 1 - secondsNotReady / 10 ? { state: "warming", uptimeS: uptime + i * 10 } : { uptimeS: uptime + i * 10 }));
  it("fires when the worker has not been ready for 30 s, after the boot grace", () => {
    expect(rules(warming(30))).toEqual(["worker-not-ready"]);
    expect(fire(warming(60))[0].detail).toMatch(/has not been ready for 60 s \(state warming/);
    for (const state of ["restarting", "warming"]) {
      expect(rules(series(60, (i) => (i >= 3 ? { state } : {})))).toEqual(["worker-not-ready"]);
    }
  });
  it("is quiet at 20 s, inside the boot grace (uptime under 60 s), for the in-thread validator, for a stopped one, and once it is ready again", () => {
    expect(rules(warming(20))).toEqual([]);
    expect(rules(series(60, (i) => ({ state: "warming", uptimeS: i * 10 - 10 })))).toEqual([]); // 50 s old at the newest sample
    expect(rules(series(60, () => ({ state: "in-thread", kind: "in-thread" })))).toEqual([]);
    expect(rules(series(60, () => ({ state: "stopped" })))).toEqual([]);
    expect(rules(series(60, (i) => (i < 4 ? { state: "restarting" } : {})))).toEqual([]);
  });
  it("counts the streak from its start, so a flapping worker that is ready between spells is not 'down for 30 s'", () => {
    expect(rules(series(120, (i) => (i % 3 === 2 ? {} : { state: "warming" })))).toEqual([]);
  });
});

describe("S4 alerts: worker-restarts, check-timeouts (validator.restarts, .timeouts, .queueFull)", () => {
  it("a restart in the last 15 minutes fires; one 16 minutes ago does not", () => {
    expect(rules(series(900, (i, n) => (i === n - 1 ? { restarts: 1 } : {})))).toEqual(["worker-restarts"]);
    expect(rules(series(900, (i) => (i >= 20 ? { restarts: 1 } : {})))).toEqual(["worker-restarts"]); // rose 70 samples ago, inside 900 s
    expect(rules(series(1200, (i) => (i >= 2 ? { restarts: 1 } : {})))).toEqual([]); // it rose 1,180 s ago
    expect(rules(series(1200, () => ({ restarts: 3 })))).toEqual([]); // a count that is simply high is not a rise
    expect(fire(series(900, (i, n) => (i === n - 1 ? { restarts: 2 } : {})))[0].detail).toBe("the deck-check worker was restarted 2 times in the last 15 min");
  });
  it("a timeout or a queue-full refusal in the last 5 minutes fires; one 6 minutes ago does not", () => {
    expect(rules(series(300, (i, n) => (i === n - 1 ? { timeouts: 1 } : {})))).toEqual(["check-timeouts"]);
    expect(rules(series(300, (i) => (i >= 10 ? { queueFull: 4 } : {})))).toEqual(["check-timeouts"]);
    expect(rules(series(600, (i) => (i >= 3 ? { timeouts: 1 } : {})))).toEqual([]);
    expect(fire(series(300, (i, n) => (i === n - 1 ? { timeouts: 1, queueFull: 2 } : {})))[0].detail).toBe("1 deck check timeout and 2 queue-full refusals in the last 5 min");
  });
});

describe("S4 alerts: queue-depth (validator.queueDepth)", () => {
  it("fires when the queue is over 8 in EVERY sample for 2 minutes", () => {
    expect(rules(series(120, () => ({ queueDepth: 9 })))).toEqual(["queue-depth"]);
    expect(rules(series(300, (i) => (i > 17 ? { queueDepth: 16 } : {})))).toEqual(["queue-depth"]); // 13 samples, exactly 2 minutes
    expect(rules(series(300, (i) => (i > 18 ? { queueDepth: 16 } : {})))).toEqual([]); // 12 samples: 110 s
    expect(fire(series(120, () => ({ queueDepth: 12 })))[0].detail).toBe("the deck-check queue has held over 8 checks for 2 min (now 12)");
  });
  it("is quiet at exactly 8, for 110 s, with one dip, or before the ring holds 2 minutes", () => {
    expect(rules(series(120, () => ({ queueDepth: 8 })))).toEqual([]);
    expect(rules(series(110, () => ({ queueDepth: 12 })))).toEqual([]);
    expect(rules(series(120, (i) => ({ queueDepth: i === 6 ? 8 : 12 })))).toEqual([]);
    expect(rules(series(60, () => ({ queueDepth: 16 })))).toEqual([]);
    expect(rules(series(300, (i, n) => (i < n - 6 ? { queueDepth: 16 } : {})))).toEqual([]); // it was full, and drained a minute ago
  });
});

describe("S4 alerts: rss-high and heap-high (memory.rssMb, memory.heapUsedMb, memory.heapLimitMb)", () => {
  it("RSS over 80% of the machine's memory (172 MB of 215) in every sample for a minute fires", () => {
    expect(rules(series(60, () => ({ rssMb: 180 })))).toEqual(["rss-high"]);
    expect(fire(series(60, () => ({ rssMb: 180 })))[0].detail).toBe("memory use (RSS) has been over 80% of the machine's 215 MB for 1 min (now 180 MB)");
    expect(rules(series(60, () => ({ rssMb: 180 })), {}, 1024)).toEqual([]); // the same RSS on a 1 GB machine is fine
  });
  it("is quiet for a bucket load's 198 MB peak that lasts a few seconds, for the settled 157 MB, and below a minute", () => {
    expect(rules(series(120, (i, n) => (i >= n - 3 ? { rssMb: 198 } : {})))).toEqual([]); // two samples of a spike
    expect(rules(series(60, () => ({ rssMb: 157 })))).toEqual([]);
    expect(rules(series(50, () => ({ rssMb: 190 })))).toEqual([]); // 50 s
    expect(rules(series(60, () => ({ rssMb: 172 })))).toEqual([]); // not over
  });
  it("heap over 60% of its limit for a minute fires (the limit is read from the sample: 144 MB under S2's flag, so 86.4 MB)", () => {
    expect(rules(series(60, () => ({ heapUsedMb: 90 })))).toEqual(["heap-high"]);
    expect(fire(series(60, () => ({ heapUsedMb: 90 })))[0].detail).toBe("the heap has been over 60% of its 144 MB limit for 1 min (now 90 MB)");
    expect(rules(series(60, () => ({ heapUsedMb: 90, heapLimitMb: 348 })))).toEqual([]); // the 512 MB machine's limit
    expect(rules(series(60, () => ({ heapUsedMb: 64 })))).toEqual([]); // S3's honest peak, 44%
    expect(rules(series(60, () => ({ heapUsedMb: 86 })))).toEqual([]);
    expect(rules(series(40, () => ({ heapUsedMb: 120 })))).toEqual([]);
  });
});

describe("S4 alerts: cache-too-small (cache.evictedByCeiling, cache.playerGhosts, cache.ceiling)", () => {
  it("more ghosts dropped by the ceiling in an hour than the ceiling holds fires", () => {
    const flood = series(HOUR, (i, n) => ({ playerGhosts: 5000, evictedByCeiling: Math.floor((i * 7000) / (n - 1)) })); // not full: only the first arm applies
    expect(rules(flood)).toEqual(["cache-too-small"]);
    expect(fire(flood)[0].detail).toMatch(/^7000 ghosts were dropped from memory by the ceiling \(6000\) in the last 60 min, more than 6000/);
    // the limit follows the cache: 30,000 on the 512 MB machine
    expect(rules(series(HOUR, (i, n) => ({ playerGhosts: 6000 - 1, ceiling: 30_000, evictedByCeiling: Math.floor((i * 7000) / (n - 1)) })))).toEqual([]);
    expect(rules(flood, { evictPerHour: 8000 })).toEqual([]);
    expect(rules(series(HOUR, (i, n) => ({ playerGhosts: 100, evictedByCeiling: Math.floor((i * 600) / (n - 1)) })), { evictPerHour: 500 })).toEqual(["cache-too-small"]);
  });
  it("a cache held at its ceiling for an hour while ghosts are dropped fires; held full without churn does not", () => {
    const pinned = (dropped: number) => series(HOUR, (i, n) => ({ playerGhosts: 6000, evictedByCeiling: Math.floor((i * dropped) / (n - 1)) }));
    expect(rules(pinned(1500))).toEqual(["cache-too-small"]);
    expect(fire(pinned(1500))[0].detail).toMatch(/has been full \(6000\) for 60 min while 1500 ghosts were dropped, more than 1000/);
    expect(rules(pinned(600))).toEqual([]); // Tier A's busiest hour
    expect(rules(pinned(0))).toEqual([]); // full and still: nothing to do
    expect(rules(pinned(1500).slice(40))).toEqual([]); // the ring holds 55 minutes of it: "for an hour" is not yet true... and 1,500 in 55 min is not over the hour rule
    expect(rules(series(HOUR, (i, n) => ({ playerGhosts: i === 100 ? 5999 : 6000, evictedByCeiling: Math.floor((i * 1500) / (n - 1)) })))).toEqual([]); // not full for the whole hour
    expect(rules(pinned(1500), { ceilingHoldEvict: 2000 })).toEqual([]);
  });
  it("a store with no cache (cache: null) cannot fire it", () => {
    expect(rules(series(HOUR, () => ({ playerGhosts: null, ceiling: null, evictedByCeiling: null })))).toEqual([]);
  });
});

describe("S4 alerts: abuse-refusals (limits.keyInflight, .ipInflight, .keyBudget, .ipBudget, .newKeys)", () => {
  it("more than 30 refusals in 15 minutes fires; 30, or 31 over 16 minutes, does not", () => {
    expect(rules(series(900, (i, n) => ({ abuse: Math.floor((i * 31) / (n - 1)) })))).toEqual(["abuse-refusals"]);
    expect(fire(series(900, (i, n) => ({ abuse: Math.floor((i * 31) / (n - 1)) })))[0].detail).toBe("the abuse limits refused 31 requests in the last 15 min (more than 30): a client is asking for too much");
    expect(rules(series(900, (i, n) => ({ abuse: Math.floor((i * 30) / (n - 1)) })))).toEqual([]);
    expect(rules(series(1200, (i) => ({ abuse: i >= 2 ? 31 : 0 })))).toEqual([]); // all of it 19 minutes ago
    expect(rules(series(900, (i, n) => ({ abuse: Math.floor((i * 31) / (n - 1)) })), { abuseRise: 50 })).toEqual([]);
  });
  it("counts the abuse limits only: the old per-address limiter (limits.rate) is a big NAT's honest 429, not abuse", () => {
    const refused = zeroCounts();
    refused.rate = 50_000;
    const s = toSample(T0, { uptimeMs: 1000, validator: { kind: "worker", state: "ready", queued: 0, restarts: 0, timeouts: 0, queueFull: 0 }, rssBytes: 100 * MB, heapUsedBytes: 10 * MB, heapLimitBytes: 144 * MB, cache: null, refused });
    expect(s.abuse).toBe(0);
    refused.keyInflight = 1; refused.ipInflight = 2; refused.keyBudget = 3; refused.ipBudget = 4; refused.newKeys = 5;
    expect(toSample(T0, { uptimeMs: 1000, validator: { kind: "worker", state: "ready", queued: 0, restarts: 0, timeouts: 0, queueFull: 0 }, rssBytes: 0, heapUsedBytes: 0, heapLimitBytes: 0, cache: null, refused }).abuse).toBe(15);
  });
});

describe("S4 alerts: server-errors and storage-errors (errors.requests, .serverErrors, .storage)", () => {
  const five = (requests: number, errors: number) => series(300, (i, n) => ({ requests: Math.floor((i * requests) / (n - 1)), serverErrors: Math.floor((i * errors) / (n - 1)) }));
  it("5xx answers over 1% of the last 5 minutes' requests fire, with at least 20 requests and 3 errors", () => {
    expect(rules(five(1000, 11))).toEqual(["server-errors"]);
    expect(fire(five(1000, 11))[0].detail).toBe("11 of the last 1000 requests (1.1%) in 5 min were answered with a 5xx, more than 1%");
    expect(rules(five(1000, 10))).toEqual([]);
    expect(rules(five(10, 5))).toEqual([]); // too few requests
    expect(rules(five(100, 2))).toEqual([]); // two errors are not three
    expect(rules(five(100, 3))).toEqual(["server-errors"]);
    expect(rules(series(300, () => ({ requests: null, serverErrors: null })))).toEqual([]); // a server that counts none
  });
  it("one storage error in the last 5 minutes fires", () => {
    expect(rules(series(300, (i, n) => (i === n - 1 ? { storageErrors: 1 } : {})))).toEqual(["storage-errors"]);
    expect(rules(series(600, (i) => (i >= 3 ? { storageErrors: 2 } : {})))).toEqual([]);
    expect(fire(series(300, (i) => (i >= 10 ? { storageErrors: 2 } : {})))[0].detail).toMatch(/^2 storage errors in the last 5 min/);
  });
});

describe("S4 alerts: the settings", () => {
  it("every default is DEFAULT_ALERTS; each setting changes its own field; BB_ALERT_DISABLE switches a rule off", () => {
    expect(readAlertsConfig({})).toEqual(DEFAULT_ALERTS);
    expect(readAlertsConfig({ BB_ALERT_SAMPLE_S: "5", BB_ALERT_MEM_MB: "512", BB_ALERT_BOOT_GRACE_S: "0", BB_ALERT_WORKER_DOWN_S: "45", BB_ALERT_RESTARTS_WINDOW_S: "600",
      BB_ALERT_CHECK_FAIL_WINDOW_S: "120", BB_ALERT_QUEUE_DEPTH: "12", BB_ALERT_QUEUE_FOR_S: "180", BB_ALERT_RSS_PCT: "90", BB_ALERT_RSS_FOR_S: "30", BB_ALERT_HEAP_PCT: "70",
      BB_ALERT_HEAP_FOR_S: "90", BB_ALERT_EVICT_PER_HOUR: "9000", BB_ALERT_EVICT_WINDOW_S: "1800", BB_ALERT_CEILING_HOLD_S: "7200", BB_ALERT_CEILING_HOLD_EVICT: "2500",
      BB_ALERT_ABUSE_RISE: "100", BB_ALERT_ABUSE_WINDOW_S: "300", BB_ALERT_5XX_PCT: "5", BB_ALERT_5XX_WINDOW_S: "600", BB_ALERT_5XX_MIN_REQUESTS: "50", BB_ALERT_5XX_MIN_ERRORS: "5",
      BB_ALERT_STORAGE_WINDOW_S: "900", BB_ALERT_DISABLE: "rss-high, heap-high" })).toEqual({
      intervalS: 5, disable: ["rss-high", "heap-high"], memMb: 512, workerBootGraceS: 0, workerDownS: 45, restartsWindowS: 600, checkFailWindowS: 120, queueDepth: 12, queueForS: 180,
      rssPct: 90, rssForS: 30, heapPct: 70, heapForS: 90, evictPerHour: 9000, evictWindowS: 1800, ceilingHoldS: 7200, ceilingHoldEvict: 2500, abuseRise: 100, abuseWindowS: 300,
      serverErrorPct: 5, serverErrorWindowS: 600, serverErrorMinRequests: 50, serverErrorMinErrors: 5, storageErrorWindowS: 900,
    });
    expect(rules(series(60, () => ({ rssMb: 190, heapUsedMb: 100 })))).toEqual(["rss-high", "heap-high"]);
    expect(rules(series(60, () => ({ rssMb: 190, heapUsedMb: 100 })), { disable: ["rss-high"] })).toEqual(["heap-high"]);
  });
  it("a bad value stops the start naming the setting, config.ts's way", () => {
    const bad: [Record<string, string>, string][] = [
      [{ BB_ALERT_QUEUE_DEPTH: "many" }, 'BB_ALERT_QUEUE_DEPTH: expected an integer in 1..1000, got "many"'],
      [{ BB_ALERT_RSS_PCT: "0" }, "BB_ALERT_RSS_PCT: expected an integer in 1..100"],
      [{ BB_ALERT_RSS_PCT: "101" }, "BB_ALERT_RSS_PCT: expected an integer in 1..100"],
      [{ BB_ALERT_SAMPLE_S: "0" }, "BB_ALERT_SAMPLE_S: expected an integer in 1..300"],
      [{ BB_ALERT_MEM_MB: "1.5" }, "BB_ALERT_MEM_MB"],
      [{ BB_ALERT_DISABLE: "rss-high,nonsense" }, 'BB_ALERT_DISABLE: unknown rule "nonsense"'],
      [{ BB_ALERT_ABUSE_RISE: "-3" }, "BB_ALERT_ABUSE_RISE"],
    ];
    for (const [env, text] of bad) {
      expect(() => readAlertsConfig(env), text).toThrow(AlertsConfigError);
      expect(() => readAlertsConfig(env), text).toThrow(text);
    }
    expect(new AlertsConfigError("x").name).toBe("ConfigError");
  });
});

describe("S4 alerts: the ring is bounded, and big enough for the longest window", () => {
  it("holds 362 samples at the defaults (an hour every 10 s, plus one for each end), and grows with the longest window and shrinks with the interval", () => {
    expect(longestWindowS(DEFAULT_ALERTS)).toBe(3600);
    expect(ringCapacity(DEFAULT_ALERTS)).toBe(362);
    expect(ringCapacity({ ...DEFAULT_ALERTS, ceilingHoldS: 7200 })).toBe(722);
    expect(ringCapacity({ ...DEFAULT_ALERTS, intervalS: 5 })).toBe(722);
    expect(ringCapacity({ ...DEFAULT_ALERTS, evictWindowS: 600, ceilingHoldS: 600, restartsWindowS: 600, abuseWindowS: 600 })).toBe(62);
  });
  it("never grows past its capacity, drops the oldest first, and keeps order", () => {
    const ring = new SampleRing(5);
    for (let i = 0; i < 12; i++) {
      ring.push(at(i));
      expect(ring.length).toBe(Math.min(i + 1, 5));
    }
    expect(ring.toArray().map((s) => (s.t - T0) / 10_000)).toEqual([7, 8, 9, 10, 11]);
    const big = new SampleRing(ringCapacity(DEFAULT_ALERTS));
    for (let i = 0; i < 100_000; i++) big.push(at(i));
    expect(big.length).toBe(362);
    expect(big.toArray()[0].t).toBe(T0 + (100_000 - 362) * 10_000);
  });
  it("a window of the longest length is fully covered by the ring (the hour rules see a whole hour)", () => {
    const full = series(HOUR).slice(-ringCapacity(DEFAULT_ALERTS));
    expect(full.length).toBe(361); // 361 samples span an hour; the ring holds 362
    const ring = new SampleRing(ringCapacity(DEFAULT_ALERTS));
    for (let i = 0; i < 2000; i++) ring.push(at(i, { playerGhosts: 6000, evictedByCeiling: i * 3 }));
    expect(rules(ring.toArray(), { ceilingHoldEvict: 100 })).toEqual(["cache-too-small"]); // pinned for an hour, 1,080 dropped
  });
});

describe("S4 alerts: the sampler and the answer", () => {
  afterEach(() => vi.useRealTimers());
  const inputs = (over: Partial<HealthInputs> = {}): HealthInputs => ({
    uptimeMs: 3_600_000, validator: { kind: "worker", state: "ready", queued: 0, restarts: 0, timeouts: 0, queueFull: 0 }, rssBytes: 104 * MB, heapUsedBytes: 7 * MB, heapLimitBytes: 144 * MB,
    cache: { playerGhosts: 0, ceiling: 6000, evictedByCeiling: 0 }, refused: zeroCounts(), ...over,
  });

  it("toSample maps /v1/health's fields: validator, memory, cache, limits", () => {
    const refused = { ...zeroCounts(), keyBudget: 2, newKeys: 1, rate: 9 };
    const s = toSample(T0, inputs({ uptimeMs: 123_456, validator: { kind: "worker", state: "warming", queued: 4, restarts: 2, timeouts: 3, queueFull: 5 }, rssBytes: 150.5 * MB, refused,
      cache: { playerGhosts: 17, ceiling: 6000, evictedByCeiling: 40 }, errors: { requests: 90, serverErrors: 4, storage: 1 } }));
    expect(s).toEqual({ t: T0, uptimeS: 123, kind: "worker", state: "warming", queueDepth: 4, restarts: 2, timeouts: 3, queueFull: 5, rssMb: 150.5, heapUsedMb: 7, heapLimitMb: 144,
      playerGhosts: 17, ceiling: 6000, evictedByCeiling: 40, abuse: 3, requests: 90, serverErrors: 4, storageErrors: 1 });
    expect(toSample(T0, inputs({ cache: null }))).toMatchObject({ playerGhosts: null, ceiling: null, evictedByCeiling: null, requests: null, serverErrors: null, storageErrors: null });
  });

  it("answers 200 {status: ok} when quiet and 503 {status: alert, alerts: [{rule, detail}]} with the reasons, then 200 again once the trouble has left the window", () => {
    let now = T0;
    let v: HealthInputs = inputs();
    const a = new Alerts(() => v, { now: () => now, memMb: MEM });
    a.sampleNow();
    expect(a.answer()).toEqual({ status: 200, body: { status: "ok", alerts: [], uptimeS: 3600, samples: 1 } });
    for (let i = 0; i < 13; i++) {
      now += 10_000;
      v = inputs({ validator: { kind: "worker", state: "ready", queued: 10, restarts: i >= 5 ? 1 : 0, timeouts: 0, queueFull: 0 } });
      a.sampleNow();
    }
    const bad = a.answer();
    expect(bad.status).toBe(503);
    expect(bad.body.status).toBe("alert");
    expect(bad.body.alerts.map((x) => x.rule)).toEqual(["worker-restarts", "queue-depth"]);
    expect(Object.keys(bad.body.alerts[0]).sort()).toEqual(["detail", "rule"]);
    expect(JSON.stringify(bad.body)).not.toMatch(/\d+\.\d+\.\d+\.\d+|[A-Za-z0-9_-]{40}/); // no address, no key, no player id
    // the queue drains and the restart leaves the 15-minute window
    v = inputs({ validator: { kind: "worker", state: "ready", queued: 0, restarts: 1, timeouts: 0, queueFull: 0 } });
    for (let i = 0; i < 100; i++) {
      now += 10_000;
      a.sampleNow();
    }
    expect(a.answer().status).toBe(200);
  });

  it("an answer takes a fresh sample only when the newest is a whole interval old: a flood of requests cannot flush the ring", () => {
    let now = T0;
    let reads = 0;
    const a = new Alerts(() => (reads++, inputs()), { now: () => now, memMb: MEM });
    a.sampleNow();
    for (let i = 0; i < 5000; i++) a.answer();
    expect(a.ring.length).toBe(1);
    now += 10_000;
    a.answer();
    a.answer();
    expect(a.ring.length).toBe(2);
    expect(reads).toBe(2);
  });

  it("its timer ticks every interval, is unref()ed and stops", () => {
    vi.useFakeTimers();
    const unref = vi.fn();
    const real = globalThis.setInterval;
    const spy = vi.spyOn(globalThis, "setInterval").mockImplementation(((fn: () => void, ms: number) => {
      const h = real(fn, ms) as unknown as { unref?: () => void };
      const original = h.unref?.bind(h);
      h.unref = () => { unref(); return original?.(); };
      return h as never;
    }) as unknown as typeof setInterval);
    let reads = 0;
    const a = new Alerts(() => (reads++, inputs()), { cfg: { intervalS: 10 } });
    expect(a.running).toBe(false);
    a.start();
    a.start(); // twice is once
    expect(a.running).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][1]).toBe(10_000);
    expect(unref).toHaveBeenCalledTimes(1);
    expect(reads).toBe(1); // one sample at the start
    vi.advanceTimersByTime(35_000);
    expect(reads).toBe(4);
    a.stop();
    expect(a.running).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(reads).toBe(4);
    spy.mockRestore();
  });

  it("the machine's memory is the setting, else what the OS reports", () => {
    expect(new Alerts(() => inputs(), { memMb: 215 }).memMb).toBe(215);
    expect(new Alerts(() => inputs(), { cfg: { memMb: 512 } }).memMb).toBe(512);
    expect(new Alerts(() => inputs()).memMb).toBeCloseTo(totalmem() / MB, 0);
  });
});
