// S2 (BRIEF-S2 goals 4, 5): the deck-check worker's settings and where they live. The defaults (queue 16, deadline 10 s, worker heap 64 MB, young 8 MB), the
// environment that sets them, the refusal of nonsense; fly.toml's NODE_OPTIONS (the main thread's explicit heap limit); the bundle's second entry; and
// the warm-up having left the main thread (server/main.ts no longer calls warmRoadCap; the worker does).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ConfigError, readConfig, readValidatorConfig } from "../server/config";
import { DEFAULT_QUEUE, DEFAULT_TIMEOUT_MS, DEFAULT_WORKER_HEAP_MB, DEFAULT_WORKER_YOUNG_MB } from "../server/validator";

const text = (rel: string): string => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8");

function flyEnv(): Record<string, string> {
  const table = /^\[env\]\n([\s\S]*?)^\[/m.exec(text("fly.toml"));
  if (!table) throw new Error("fly.toml has no [env] table");
  const env: Record<string, string> = {};
  for (const m of table[1].matchAll(/^\s*([A-Z0-9_]+)\s*=\s*"([^"]*)"/gm)) env[m[1]] = m[2];
  return env;
}
function error(env: Record<string, string>): string {
  try {
    readValidatorConfig(env);
  } catch (e) {
    expect(e).toBeInstanceOf(ConfigError);
    return (e as Error).message;
  }
  throw new Error("expected a ConfigError");
}

describe("S2: the deck-check worker's configuration", () => {
  it("defaults: a queue of 16, a 10 s deadline, a 64 MB old space and an 8 MB young generation for the worker", () => {
    expect(readValidatorConfig({})).toEqual({ queue: 16, timeoutMs: 10_000, workerHeapMb: 64, workerYoungMb: 8 });
    expect([DEFAULT_QUEUE, DEFAULT_TIMEOUT_MS, DEFAULT_WORKER_HEAP_MB, DEFAULT_WORKER_YOUNG_MB]).toEqual([16, 10_000, 64, 8]);
    expect(readValidatorConfig({ BB_GHOST_VALIDATE_QUEUE: "", BB_GHOST_VALIDATE_HEAP_MB: "" })).toMatchObject({ queue: 16, workerHeapMb: 64 }); // empty: the default
  });

  it("BB_GHOST_VALIDATE_QUEUE, _TIMEOUT_MS, _HEAP_MB and _YOUNG_MB set them", () => {
    expect(readValidatorConfig({ BB_GHOST_VALIDATE_QUEUE: "4", BB_GHOST_VALIDATE_TIMEOUT_MS: "2500", BB_GHOST_VALIDATE_HEAP_MB: "300", BB_GHOST_VALIDATE_YOUNG_MB: "16" }))
      .toEqual({ queue: 4, timeoutMs: 2500, workerHeapMb: 300, workerYoungMb: 16 });
  });

  it("a bad value stops the start with a ConfigError that names the setting", () => {
    expect(error({ BB_GHOST_VALIDATE_QUEUE: "0" })).toMatch(/BB_GHOST_VALIDATE_QUEUE: expected an integer in 1\.\.1000, got "0"/);
    expect(error({ BB_GHOST_VALIDATE_QUEUE: "many" })).toMatch(/BB_GHOST_VALIDATE_QUEUE/);
    expect(error({ BB_GHOST_VALIDATE_TIMEOUT_MS: "5" })).toMatch(/BB_GHOST_VALIDATE_TIMEOUT_MS: expected an integer in 100\.\./);
    expect(error({ BB_GHOST_VALIDATE_HEAP_MB: "8" })).toMatch(/BB_GHOST_VALIDATE_HEAP_MB: expected an integer in 32\.\./);
    expect(error({ BB_GHOST_VALIDATE_YOUNG_MB: "-1" })).toMatch(/BB_GHOST_VALIDATE_YOUNG_MB/);
  });

  it("the server config itself is untouched: readConfig knows nothing of the worker (the seed command reads no BB_GHOST_VALIDATE_*)", () => {
    expect(Object.keys(readConfig([], {})).sort()).toEqual(["host", "origins", "port", "rate", "staticDir", "store", "trustProxy", "uploads"]);
    expect(() => readConfig([], { BB_GHOST_VALIDATE_QUEUE: "nope" })).not.toThrow();
  });
});

describe("S2: the main thread's explicit heap limit, and where the worker lives", () => {
  it("fly.toml's [env] sets NODE_OPTIONS to a --max-old-space-size that fits the 256 MB machine (under 60% of it)", () => {
    const m = /^--max-old-space-size=(\d+)$/.exec(flyEnv().NODE_OPTIONS ?? "");
    expect(m, `NODE_OPTIONS in fly.toml: ${flyEnv().NODE_OPTIONS}`).not.toBeNull();
    const mb = Number(m![1]);
    expect(mb).toBeGreaterThanOrEqual(64); // room for the ghost cache and the worker's cold day-25 check
    expect(mb).toBeLessThanOrEqual(0.6 * 256); // LAUNCH-0 REPORT 1.5: about 60% of the RAM
    expect(text("fly.toml")).toMatch(/memory = "256mb"/); // the machine this is sized for (S5 moves it to 512 MB and changes the number)
  });

  it("the bundle gets the worker as a second entry beside ghost-server.mjs, and the image copies the whole dist folder", () => {
    expect(text("vite.server.config.ts")).toMatch(/"validate-worker": "server\/validateWorker\.ts"/);
    expect(text("Dockerfile")).toMatch(/^COPY server\/dist\/ \.\/dist\/$/m);
    expect(text("server/main.ts")).toMatch(/new URL\("\.\/validate-worker\.mjs", import\.meta\.url\)/);
  });

  it("the road-cap warm-up left the main thread: main.ts neither imports server/warm.ts nor calls warmRoadCap; the worker does", () => {
    const main = text("server/main.ts");
    expect(main).not.toMatch(/from "\.\/warm"/);
    expect(main.replace(/\/\/.*$/gm, "")).not.toMatch(/warmRoadCap\s*\(/); // comments aside
    const worker = text("server/validateWorker.ts");
    expect(worker).toMatch(/import \{ warmRoadCap \} from "\.\/warm"/);
    expect(worker).toMatch(/await warmRoadCap\(/);
    expect(worker.replace(/\/\/.*$/gm, "")).not.toMatch(/process\.env|workerData|sleep|crash/); // no switch in production code that slows, skips or fakes a check
  });
});
