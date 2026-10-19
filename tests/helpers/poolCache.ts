// CACHE-1 (BRIEF-CACHE1; tests and test config only): ONE POOL BUILD PER TEST RUN.
//
// 41 test files call a seed-pool builder (tools/samplePool.ts: generateSamplePool, sampleGhosts, floorGhosts, raceGhosts), 120-270 s a
// call, and vitest gives every file its own process, so a whole-suite run built the same 192-ghost pool 35 times. This file holds a
// cached twin of each builder. A test imports the twin where it imported the builder (same name, same signature); the twin
// returns exactly what the builder returns (deep-equal, the same order, fresh objects) from a disk cache, and runs the builder
// only on a miss.
//
// THE KEY (poolKey) makes a stale hit impossible. It hashes
//   (a) every file of the builders' import closure, found by scanning the real import graph from tools/samplePool.ts (scanClosure;
//       tests/poolCache.key.test.ts holds the scan equal to TypeScript's own module graph and every non-relative import a node: built-in);
//   (b) every switch the builders read, through the switch functions (SWITCHES), never the constants;
//   (c) the arguments (a function argument is keyed only for raceGhosts' default deckOf and for a deckOf a test marks pureDeckOf);
//   (d) every BB_* environment variable but the cache's own BB_POOL_* ones, and the content of the files BB_SOFT1_PICKS_FILE names;
//   (e) the node version (and V8, platform, vite and vitest);
//   (f) the live catalogue: the key ORDER of ITEMS (turning SHAPES, SHAPES2 or PLAIN_RIGS off and back on while SCALE_RIGS stays on
//       re-inserts their ids at the end, and every seeded draw after that moves: REPORT-BUMP1E 8.1 (d)), whether each entry is
//       enumerable (WAVE3 off), and the whole content of ITEMS and HEROES (a test that patches a def).
//
// The cache lives outside the repository (node_modules/.cache/bb-pool/, or BB_POOL_CACHE_DIR). A write is atomic (a temp file,
// then rename), and one process builds a given key at a time (a lock directory; the others wait for the file, up to 25 minutes,
// then build themselves). BB_POOL_CACHE=0 turns the cache off: every twin calls its builder for real. BB_POOL_CACHE_LOG=<file> appends
// one JSON line a hit, miss, build or wait.
//
// MODULE LOAD ORDER (Q1's lesson, ruling 12a42239093fb6ec): the first import below is the builders' own module, so a test that swaps
// `from "../tools/samplePool"` for `from "./helpers/poolCache"` at the same place loads the same modules in the same order. Every
// other src import is a module that closure already loads.
import * as real from "../../tools/samplePool";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { deserialize, serialize } from "node:v8";
import { HEROES, ITEMS, sustainLive, wave3Live } from "../../src/sim/content";
import { BOT_RUNES } from "../../src/sim/runes";
import { endlessRules } from "../../src/sim/endless";
import { firstRunRules } from "../../src/sim/firstRun";
import { freeJoinsRules } from "../../src/sim/freeJoins";
import { guardRules } from "../../src/sim/guard";
import { heartsRules } from "../../src/sim/hearts";
import { hullScaleRules } from "../../src/sim/hullScale";
import { ladderFixRules } from "../../src/sim/ladderFix";
import { longRunRules } from "../../src/sim/longRun";
import { npcDayRules } from "../../src/sim/npcDay";
import { openRunesRules } from "../../src/sim/openRunes";
import { plainRigsRules } from "../../src/sim/plainRigs";
import { scaleRules } from "../../src/sim/scale";
import { shapesRules } from "../../src/sim/shapes";
import { shapes2Rules } from "../../src/sim/shapes2";
import { pickRules } from "../../src/net/pick";
import type { HeroId } from "../../src/sim/content";
import type { GhostSnapshot } from "../../src/net/snapshot";

// ------------------------------------------------------------------------------------------------ the key

/** Reads a file as text (undefined: no such file). The key test hands in overlays that edit one file. */
export type Reader = (abs: string) => string | undefined;

export const fsReader: Reader = (abs) => (existsSync(abs) && statSync(abs).isFile() ? readFileSync(abs, "utf8") : undefined);

const sha = (s: string): string => createHash("sha256").update(s).digest("hex");

/** A canonical text of any value: key order kept (ITEMS' order is part of the key), `undefined`, functions, NaN and Infinity named. */
export function canon(v: unknown): string {
  return (
    JSON.stringify(v, (_k: string, x: unknown): unknown => {
      if (x === undefined) return "\u0000undefined";
      if (typeof x === "function") return "\u0000fn:" + String(x);
      if (typeof x === "number" && !Number.isFinite(x)) return "\u0000num:" + String(x);
      if (typeof x === "bigint") return "\u0000big:" + String(x);
      if (x instanceof Map) return { "\u0000map": [...x.entries()] };
      if (x instanceof Set) return { "\u0000set": [...x.values()] };
      return x;
    }) ?? "\u0000undefined"
  );
}

/** The repository root (this file is tests/helpers/poolCache.ts). */
export const ROOT: string = resolve(decodeURIComponent(new URL("../../", import.meta.url).pathname));
/** The builders' module, relative to ROOT: the entry of the import closure. */
export const ENTRY = "tools/samplePool.ts";
/** This file, relative to ROOT (its text is part of the key). */
const HELPER = "tests/helpers/poolCache.ts";

const IMPORT_RE = /(?:^|[\s;{}])(?:import|export)\s+(?:type\s+)?(?:[^'"`;]*?\sfrom\s*)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)/g;
const EXTENSIONS = ["", ".ts", ".tsx", ".js", ".mjs", ".json", "/index.ts", "/index.tsx", "/index.js"];

/** Source text without its comments (an import named in a comment is no edge). */
const stripComments = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

export interface ClosureScan {
  /** Every file of the closure, relative to the root, sorted. */
  files: string[];
  /** Each file's text. */
  texts: Map<string, string>;
  /** Every non-relative import specifier (a package or a node: built-in), sorted, once. */
  bare: string[];
  /** Relative imports that resolve to no file ("<from> -> <spec>"). */
  missing: string[];
  /** sha256 over (path, sha256 of text) of every file, and the missing imports. */
  digest: string;
}

/** The import closure of `entry` (relative to `root`) from the real files: every relative `import`, `export ... from`, `import()` and `require()`. */
export function scanClosure(root: string, entry: string, read: Reader): ClosureScan {
  const texts = new Map<string, string>();
  const bare = new Set<string>();
  const missing: string[] = [];
  const stack: string[] = [resolve(root, entry)];
  const seen = new Set<string>();
  while (stack.length) {
    const abs = stack.pop()!;
    if (seen.has(abs)) continue;
    seen.add(abs);
    const rel = abs.slice(root.length + 1);
    const text = read(abs);
    if (text === undefined) {
      missing.push(`${rel} -> (the file itself)`);
      continue;
    }
    texts.set(rel, text);
    for (const m of stripComments(text).matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2] ?? m[3];
      if (!spec) continue;
      if (!spec.startsWith(".")) {
        bare.add(spec);
        continue;
      }
      const base = resolve(dirname(abs), spec);
      const hit = EXTENSIONS.map((e) => base + e).find((p) => read(p) !== undefined);
      if (hit === undefined) missing.push(`${rel} -> ${spec}`);
      else stack.push(hit);
    }
  }
  const files = [...texts.keys()].sort();
  const digest = sha(files.map((f) => `${f}\u0000${sha(texts.get(f)!)}`).join("\n") + "\n" + [...missing].sort().join("\n"));
  return { files, texts, bare: [...bare].sort(), missing: missing.sort(), digest };
}

const scanMemo = new Map<string, ClosureScan>();
/** The closure of the real files, scanned once a process (the files do not change during a run). */
export function realClosure(): ClosureScan {
  let c = scanMemo.get(ROOT);
  if (!c) {
    c = scanClosure(ROOT, ENTRY, fsReader);
    scanMemo.set(ROOT, c);
  }
  return c;
}

/** Every switch the builders read, each through its function: [name, is it on now]. The key test flips each with its withX and holds this list equal to the `*Rules`/`*Live` switch functions the closure exports. */
export const SWITCHES: ReadonlyArray<readonly [string, () => boolean]> = [
  ["hearts", heartsRules],
  ["longRun", longRunRules],
  ["wave3", wave3Live],
  ["sustain", sustainLive],
  ["freeJoins", freeJoinsRules],
  ["guard", guardRules],
  ["plainRigs", plainRigsRules],
  ["scaleRigs", scaleRules],
  ["firstRun", firstRunRules],
  ["endless", endlessRules],
  ["shapes2", shapes2Rules],
  ["npcDay", npcDayRules],
  ["hullScale", hullScaleRules],
  ["shapes", shapesRules],
  ["openRunes", openRunesRules],
  ["ladderFix", ladderFixRules],
  ["pick", pickRules],
];

interface ProcessInfo { pid: number; arch: string; platform: string; versions: Record<string, string> }
const proc = process as unknown as ProcessInfo;

/** What the key reads besides the live modules: the files, the environment, the node version. The key test overrides these. */
export interface KeyCtx {
  root: string;
  read: Reader;
  env: Record<string, string | undefined>;
  node: string;
}

let nodeMemo: string | undefined;
function nodePart(root: string, read: Reader): string {
  const ver = (pkg: string): string => {
    const t = read(join(root, "node_modules", pkg, "package.json"));
    try {
      return t === undefined ? "none" : String((JSON.parse(t) as { version?: string }).version);
    } catch {
      return "unreadable";
    }
  };
  return `${process.version}|v8 ${proc.versions.v8}|${proc.platform}|${proc.arch}|vite ${ver("vite")}|vitest ${ver("vitest")}`;
}

/** The key's context for this process. */
export function defaultCtx(): KeyCtx {
  nodeMemo ??= nodePart(ROOT, fsReader);
  return { root: ROOT, read: fsReader, env: process.env, node: nodeMemo };
}

/** The BB_* environment the builders may read (BB_SOFT1_PICKS_FILE: its value and the content of each file it names). */
function envPart(env: Record<string, string | undefined>, read: Reader): string {
  const names = Object.keys(env).filter((k) => k.startsWith("BB_") && !k.startsWith("BB_POOL_")).sort();
  const lines = names.map((k) => `${k}=${env[k]}`);
  for (const f of (env[real.SOFT1_PICKS_FILE_ENV] ?? "").split(",").filter(Boolean)) lines.push(`file ${f} ${sha(read(f) ?? "\u0000missing")}`);
  return lines.join("\n");
}

export interface PoolKey {
  /** sha256 over the parts. */
  key: string;
  /** Each part's digest or text, so a test (and a log line) can say what moved. */
  parts: Record<string, string>;
}

/** The key of one builder call `builder(...args)` in the world as it is now. */
export function poolKey(builder: string, args: readonly unknown[], ctx: KeyCtx = defaultCtx()): PoolKey {
  const a = [...args];
  while (a.length && a[a.length - 1] === undefined) a.pop(); // f(), f(undefined) and f({}) 's default alike
  const closure = ctx.read === fsReader && ctx.root === ROOT ? realClosure().digest : scanClosure(ctx.root, ENTRY, ctx.read).digest;
  const names = Object.getOwnPropertyNames(ITEMS);
  const parts: Record<string, string> = {
    builder,
    args: canon(a),
    helper: sha(ctx.read(join(ctx.root, HELPER)) ?? "\u0000no helper"), // this file: a change to the cache's own logic starts a new cache
    closure,
    switches: SWITCHES.map(([n, on]) => `${n}=${on() ? 1 : 0}`).join(","),
    botRunes: String(BOT_RUNES),
    itemsOrder: sha(names.map((k) => k + (Object.getOwnPropertyDescriptor(ITEMS, k)?.enumerable ? "+" : "-")).join("|")),
    itemsContent: sha(canon(ITEMS)),
    heroes: sha(canon(HEROES)),
    env: sha(envPart(ctx.env, ctx.read)),
    node: ctx.node,
  };
  return { key: sha(canon(parts)), parts };
}

// ------------------------------------------------------------------------------------------------ the store

export interface PoolCacheStats { hits: number; misses: number; builds: number; waited: number; uncached: number }
const stats: PoolCacheStats = { hits: 0, misses: 0, builds: 0, waited: 0, uncached: 0 };
/** This process's counters (a test reads them). */
export const poolCacheStats = (): Readonly<PoolCacheStats> => ({ ...stats });

/** Is the cache on (BB_POOL_CACHE=0 turns it off; read at call time)? */
export const cacheOn = (): boolean => process.env.BB_POOL_CACHE !== "0";

/** The cache directory (BB_POOL_CACHE_DIR, else node_modules/.cache/bb-pool under the repository). */
export const poolCacheDir = (): string => process.env.BB_POOL_CACHE_DIR || join(ROOT, "node_modules", ".cache", "bb-pool");

const FORMAT = 1;
const LOCK_POLL_MS = 500;
const LOCK_MAX_POLLS = 3000; // 25 minutes of waiting for another process's build, then build here
const LOCK_STALE_MS = 20 * 60 * 1000;
const sleepCell = new Int32Array(new SharedArrayBuffer(4));
const sleep = (ms: number): void => {
  Atomics.wait(sleepCell, 0, 0, ms);
};

function log(ev: Record<string, unknown>): void {
  const file = process.env.BB_POOL_CACHE_LOG;
  if (!file) return;
  try {
    const w = (globalThis as unknown as { __vitest_worker__?: { filepath?: string } }).__vitest_worker__;
    appendFileSync(file, JSON.stringify({ t: new Date().toISOString(), pid: proc.pid, file: w?.filepath?.slice(ROOT.length + 1), ...ev }) + "\n");
  } catch {
    /* logging never fails a test */
  }
}

interface Entry { format: number; builder: string; key: string; value: unknown }

/** The stored value for `key`, a fresh copy, or undefined (no file, a bad file, another key). */
function load(file: string, builder: string, key: string): { value: unknown; bytes: number } | undefined {
  try {
    if (!existsSync(file)) return undefined;
    const bytes = readFileSync(file);
    const e = deserialize(bytes) as Entry;
    if (e && e.format === FORMAT && e.builder === builder && e.key === key) return { value: e.value, bytes: bytes.length };
  } catch {
    /* a half-written or foreign file is a miss */
  }
  return undefined;
}

let seq = 0;
/** Writes the entry atomically (temp file, rename); returns the stored copy of `value`, or undefined when it cannot be serialized. */
function store(file: string, builder: string, key: string, value: unknown): { value: unknown; bytes: number } | undefined {
  try {
    mkdirSync(dirname(file), { recursive: true });
    const bytes = serialize({ format: FORMAT, builder, key, value } satisfies Entry);
    const tmp = `${file}.tmp-${proc.pid}-${seq++}-${Math.random().toString(36).slice(2)}`;
    writeFileSync(tmp, bytes);
    renameSync(tmp, file);
    return { value: (deserialize(bytes) as Entry).value, bytes: bytes.length };
  } catch {
    return undefined;
  }
}

/**
 * `build()`'s result for `builder(...args)`: from the cache when the key is there, else built (one process at a time per key), stored
 * and returned. Always a fresh copy, hit or miss, so a cold run and a warm one hand the test the same kind of value.
 * BB_POOL_CACHE=0: `build()` itself, nothing read or written. A builder that throws caches nothing and throws here.
 */
export function cachedCall<T>(builder: string, args: readonly unknown[], build: () => T, ctx?: KeyCtx, dir: string = poolCacheDir()): T {
  if (!cacheOn()) {
    stats.uncached++;
    return build();
  }
  let pk: PoolKey;
  try {
    pk = poolKey(builder, args, ctx);
  } catch (e) {
    log({ ev: "keyerror", builder, error: String(e) });
    stats.uncached++;
    return build();
  }
  const file = join(dir, `${builder}-${pk.key.slice(0, 40)}.bin`);
  const t0 = performance.now();
  const hit = load(file, builder, pk.key);
  if (hit) {
    stats.hits++;
    log({ ev: "hit", builder, key: pk.key.slice(0, 12), ms: Math.round(performance.now() - t0), bytes: hit.bytes });
    return hit.value as T;
  }
  stats.misses++;
  const lock = file + ".lock";
  let held = false;
  try {
    for (let polls = 0; ; polls++) {
      let code = "";
      try {
        mkdirSync(dir, { recursive: true });
        mkdirSync(lock);
        held = true;
      } catch (e) {
        code = String((e as { code?: string }).code ?? "");
      }
      if (held) {
        try {
          writeFileSync(join(lock, "owner"), `${proc.pid} ${Date.now()}`);
        } catch {
          /* a lock with no owner file counts as fresh */
        }
        break;
      }
      if (code !== "EEXIST") break; // the directory cannot be locked here (read-only?): build without a lock
      // the lock exists: another process is building this key
      const again = load(file, builder, pk.key);
      if (again) {
        stats.waited++;
        log({ ev: "waited", builder, key: pk.key.slice(0, 12), ms: Math.round(performance.now() - t0), bytes: again.bytes });
        return again.value as T;
      }
      const owner = existsSync(join(lock, "owner")) ? readFileSync(join(lock, "owner"), "utf8").split(" ") : [];
      if (owner.length === 2 && Date.now() - Number(owner[1]) > LOCK_STALE_MS) {
        rmSync(lock, { recursive: true, force: true }); // its builder died
        continue;
      }
      if (polls >= LOCK_MAX_POLLS) break; // give up waiting: build here, without the lock
      sleep(LOCK_POLL_MS);
    }
    if (held) {
      const again = load(file, builder, pk.key); // built while this process waited for the lock
      if (again) {
        stats.waited++;
        log({ ev: "waited", builder, key: pk.key.slice(0, 12), ms: Math.round(performance.now() - t0), bytes: again.bytes });
        return again.value as T;
      }
    }
    const b0 = performance.now();
    const built = build();
    stats.builds++;
    const kept = store(file, builder, pk.key, built);
    log({ ev: "build", builder, key: pk.key.slice(0, 12), buildMs: Math.round(performance.now() - b0), bytes: kept?.bytes ?? 0, parts: pk.parts.switches });
    return (kept ? kept.value : built) as T;
  } finally {
    if (held) rmSync(lock, { recursive: true, force: true });
  }
}

/** Removes a stored entry (the key test). */
export function dropEntry(builder: string, key: string, dir: string = poolCacheDir()): void {
  const file = join(dir, `${builder}-${key.slice(0, 40)}.bin`);
  if (existsSync(file)) unlinkSync(file);
}

// ------------------------------------------------------------------------------------------------ the twins

const PURE = new WeakSet<object>();
/**
 * Marks a raceGhosts deckOf as PURE: its result depends only on its arguments, the modules of the closure and the world, and the
 * function has no side effect a test reads. Its source text then joins the key and raceGhosts(first, deckOf, o) is cached. An
 * unmarked deckOf (a test's recording or throwing one) is never cached: raceGhosts runs for real.
 */
export function pureDeckOf<F extends (...a: never[]) => unknown>(fn: F): F {
  PURE.add(fn);
  return fn;
}

/**
 * generateSamplePool's own deckOf in the shipped world, as four test files had copied it: a variant 0 or 1 deck is SOFT1_PICKS' pick
 * (softPicked), the floor variant raceDeck's. Pure, so raceGhosts(undefined, softDeckOf) is cached, and one entry serves the four files.
 */
export const softDeckOf = pureDeckOf((h: HeroId, d: number, v: number): real.RaceDeck => {
  const c = v < real.SAMPLE_VARIANTS ? real.softPicked(h, d)?.[v] : undefined;
  return c ? { build: c.build, seed: c.seed!, ...(c.road ? { road: c.road } : {}) } : real.raceDeck(h, d, v);
});

export const generateSamplePool: typeof real.generateSamplePool = (o) => cachedCall<GhostSnapshot[]>("generateSamplePool", [o], () => real.generateSamplePool(o));

export const sampleGhosts: typeof real.sampleGhosts = (o) => cachedCall<GhostSnapshot[]>("sampleGhosts", [o], () => real.sampleGhosts(o));

export const floorGhosts: typeof real.floorGhosts = (first, o) => cachedCall<GhostSnapshot[]>("floorGhosts", [first, o], () => real.floorGhosts(first, o));

export const raceGhosts: typeof real.raceGhosts = (first, deckOf, o) => {
  const tag = deckOf === undefined || deckOf === real.raceDeck ? "raceDeck" : PURE.has(deckOf) ? "pure:" + String(deckOf) : undefined;
  if (tag === undefined) {
    stats.uncached++;
    return real.raceGhosts(first, deckOf, o); // a deckOf the key cannot see
  }
  return cachedCall<GhostSnapshot[]>("raceGhosts", [first, tag, o], () => real.raceGhosts(first, deckOf, o));
};
