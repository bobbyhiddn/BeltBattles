// S3: the memory cap's and the abuse limits' settings (server/config.ts readLimitsConfig, server/limits.ts): the defaults the report names, the env
// names, nonsense refused with the setting named, and the `seed` command's config path (readConfig) untouched by them. Nothing here starts a server.
import { describe, expect, it } from "vitest";
import { ConfigError, openStore, readConfig, readLimitsConfig } from "../server/config";
import { DEFAULT_LIMITS } from "../server/limits";
import { DEFAULT_BUCKET_CAP, DEFAULT_CACHE_MAX } from "../server/bucketCap";
import { JsonlStore } from "../server/store";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function refused(f: () => unknown): ConfigError {
  try {
    f();
  } catch (e) {
    if (e instanceof ConfigError) return e;
    throw e;
  }
  throw new Error("expected a ConfigError");
}

describe("S3 limits config", () => {
  it("the defaults are the ones the report states", () => {
    expect(readLimitsConfig({})).toEqual({
      bucketCap: 2000, cacheMax: 6000, newKeysPerIpDay: 500, checkKeyMs: 60_000, checkKeyRefill: 50, checkIpMs: 60_000, checkIpRefill: 100, checkIpInflight: 4, checkKeyInflight: 1,
    });
    expect(DEFAULT_LIMITS).toEqual(readLimitsConfig({}));
    expect(DEFAULT_BUCKET_CAP).toBe(2000);
    expect(DEFAULT_CACHE_MAX).toBe(6000);
  });

  it("every setting has its own env name, and an empty one is the default", () => {
    const c = readLimitsConfig({
      BB_GHOST_BUCKET_CAP: "500", BB_GHOST_CACHE_MAX: "30000", BB_GHOST_NEW_KEYS_PER_IP_DAY: "50", BB_GHOST_CHECK_KEY_MS: "1000", BB_GHOST_CHECK_KEY_REFILL: "7",
      BB_GHOST_CHECK_IP_MS: "2000", BB_GHOST_CHECK_IP_REFILL: "9", BB_GHOST_CHECK_IP_INFLIGHT: "8", BB_GHOST_CHECK_KEY_INFLIGHT: "2",
    });
    expect(c).toEqual({ bucketCap: 500, cacheMax: 30000, newKeysPerIpDay: 50, checkKeyMs: 1000, checkKeyRefill: 7, checkIpMs: 2000, checkIpRefill: 9, checkIpInflight: 8, checkKeyInflight: 2 });
    expect(readLimitsConfig({ BB_GHOST_CACHE_MAX: "" })).toEqual(DEFAULT_LIMITS);
  });

  it("nonsense stops the start and names the setting (never a silent default)", () => {
    for (const [name, bad] of [
      ["BB_GHOST_BUCKET_CAP", "abc"], ["BB_GHOST_BUCKET_CAP", "0"], ["BB_GHOST_CACHE_MAX", "-1"], ["BB_GHOST_CACHE_MAX", "1.5"], ["BB_GHOST_NEW_KEYS_PER_IP_DAY", "0"],
      ["BB_GHOST_CHECK_KEY_MS", "10"], ["BB_GHOST_CHECK_KEY_REFILL", "0"], ["BB_GHOST_CHECK_IP_MS", "x"], ["BB_GHOST_CHECK_IP_REFILL", "0"], ["BB_GHOST_CHECK_IP_INFLIGHT", "0"],
      ["BB_GHOST_CHECK_IP_INFLIGHT", "5000"], ["BB_GHOST_CHECK_KEY_INFLIGHT", "0"],
    ] as const) {
      expect(refused(() => readLimitsConfig({ [name]: bad })).message, `${name}=${bad}`).toContain(name);
    }
  });

  it("readConfig, which the seed command uses, knows nothing of them: a bad S3 setting does not stop a seed", () => {
    expect(() => readConfig([], { BB_GHOST_CACHE_MAX: "abc", BB_GHOST_CHECK_IP_INFLIGHT: "0" })).not.toThrow();
    expect(readConfig([], {}).rate).toBe(120); // the old limiter's default is as it was
  });

  it("openStore hands the cap and the ceiling to the JSON-lines store (and the defaults when none are given)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bb-s3-cfg-"));
    try {
      const store = openStore({ kind: "jsonl", dataDir: dir }, () => {}, { bucketCap: 11, cacheMax: 111 }) as JsonlStore;
      expect(store.cacheStats()).toMatchObject({ bucketCap: 11, ceiling: 111 });
      const dflt = openStore({ kind: "jsonl", dataDir: dir }, () => {}) as JsonlStore;
      expect(dflt.cacheStats()).toMatchObject({ bucketCap: 2000, ceiling: 6000 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
