// CACHE-1 (BRIEF-CACHE1 section 2): the key of tests/helpers/poolCache.ts makes a stale hit impossible. This file proves
//  - the closure it hashes is the real import graph (TypeScript's own module graph from tools/samplePool.ts, both ways; every
//    non-relative import is a node: built-in, none is unresolved);
//  - editing ANY file of that closure changes the key (one overlay per file), a file outside it does not;
//  - flipping ANY switch changes the key (the switch list is held equal to the `*Rules` / `*Live` functions the closure exports);
//  - permuting ITEMS (one id re-inserted at the end: what turning SHAPES, SHAPES2 or PLAIN_RIGS off and back on does while SCALE_RIGS
//    stays on, REPORT-BUMP1E 8.1 (d)) changes the key, and putting the order back puts the key back; so does a patched def;
//  - the environment (BB_*, and the content of BB_SOFT1_PICKS_FILE's files), the node version, the arguments and the builder move it;
//  - the store: a miss builds once, a hit returns a fresh deep-equal copy (undefined, NaN, -0, Infinity, Map, Set, Date, shared
//    references and key order kept), BB_POOL_CACHE=0 touches nothing, a bad file is a miss, a lock is honoured or stolen when stale.
import { afterEach, describe, expect, it } from "vitest";
import ts from "typescript";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ITEMS, withSustain, withWave3 } from "../src/sim/content";
import { withEndless } from "../src/sim/endless";
import { withFirstRun } from "../src/sim/firstRun";
import { withFreeJoins } from "../src/sim/freeJoins";
import { withGuard } from "../src/sim/guard";
import { withHearts } from "../src/sim/hearts";
import { withHullScale } from "../src/sim/hullScale";
import { withLadderFix } from "../src/sim/ladderFix";
import { withLongRun } from "../src/sim/longRun";
import { withNpcDay } from "../src/sim/npcDay";
import { withOpenRunes } from "../src/sim/openRunes";
import { withPlainRigs } from "../src/sim/plainRigs";
import { withScaleRigs } from "../src/sim/scale";
import { withShapes } from "../src/sim/shapes";
import { withShapes2 } from "../src/sim/shapes2";
import { withPick } from "../src/net/pick";
import {
  ENTRY, ROOT, SWITCHES, cachedCall, defaultCtx, fsReader, pureDeckOf, poolCacheStats, poolKey, raceGhosts, realClosure, scanClosure,
  type KeyCtx,
} from "./helpers/poolCache";

const BUILDER = "generateSamplePool";
const key = (ctx?: KeyCtx, args: readonly unknown[] = []) => poolKey(BUILDER, args, ctx);
const items = ITEMS as Record<string, unknown>;

/** Every switch, with the call that flips it for the length of a function (the withX of its module). */
const FLIP: Record<string, <T>(fn: () => T, on?: boolean) => T> = {
  hearts: withHearts, longRun: withLongRun, wave3: withWave3, sustain: withSustain, freeJoins: withFreeJoins, guard: withGuard,
  plainRigs: withPlainRigs, scaleRigs: withScaleRigs, firstRun: withFirstRun, endless: withEndless, shapes2: withShapes2,
  npcDay: withNpcDay, hullScale: withHullScale, shapes: withShapes, openRunes: withOpenRunes, ladderFix: withLadderFix, pick: withPick,
};

/** A reader that serves the closure from memory and edits one file. */
const editing = (rel: string, edit: (text: string) => string): ((abs: string) => string | undefined) => {
  const texts = realClosure().texts;
  return (abs) => {
    const r = abs.startsWith(ROOT + "/") ? abs.slice(ROOT.length + 1) : abs;
    const t = texts.get(r) ?? fsReader(abs);
    return r === rel && t !== undefined ? edit(t) : t;
  };
};

describe("the key's closure is the real import graph", () => {
  it("is TypeScript's own module graph from tools/samplePool.ts, both ways; every bare import is a node: built-in; none unresolved", () => {
    const closure = realClosure();
    expect(closure.missing).toEqual([]);
    expect(closure.bare.filter((b) => !b.startsWith("node:"))).toEqual([]);
    const cfg = ts.readConfigFile(join(ROOT, "tsconfig.json"), ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, ROOT);
    const program = ts.createProgram({ rootNames: [join(ROOT, ENTRY)], options: { ...parsed.options, noEmit: true, noLib: true, types: [], skipLibCheck: true } });
    const graph = program.getSourceFiles().map((f) => f.fileName).filter((f) => f.startsWith(ROOT + "/") && !f.includes("/node_modules/")).map((f) => f.slice(ROOT.length + 1)).sort();
    expect(closure.files).toEqual(graph);
    expect(closure.files.length).toBeGreaterThan(60);
    for (const f of [ENTRY, "src/sim/content.ts", "src/sim/standInPoolData.ts", "src/sim/harness/player.ts", "src/net/validate.ts", "src/sim/scale.ts"]) expect(closure.files).toContain(f);
  });

  it("the switch list is every `*Rules` / `*Live` switch function the closure exports (a switch added later fails here until SWITCHES and FLIP name it)", () => {
    const found = new Set<string>();
    for (const [rel, text] of realClosure().texts) {
      if (!rel.startsWith("src/sim/") && !rel.startsWith("src/net/")) continue;
      for (const m of text.matchAll(/export function (\w+(?:Rules|Live))\(\): boolean/g)) found.add(m[1]);
    }
    const listed = new Set(SWITCHES.map(([, on]) => on.name));
    expect([...found].sort()).toEqual([...listed].sort());
    expect(Object.keys(FLIP).sort()).toEqual(SWITCHES.map(([n]) => n).sort());
  });
});

describe("every test reaches the builders through the twins", () => {
  // The release lane merges branches that add test files (ENCHANT, GATES): a test that imports a builder from tools/samplePool itself
  // would build the 192-ghost pool for itself again. It fails here until it imports the twin from ./helpers/poolCache (same names).
  const BUILDERS = ["generateSamplePool", "sampleGhosts", "floorGhosts", "raceGhosts"];
  /** The ONLY direct readers, each with why: lc1.models builds a pool in a fresh module graph under vi.doMock of src/net/records, which the key cannot see. */
  const DIRECT: ReadonlyArray<readonly [string, string]> = [["tests/lc1.models.test.ts", "generateSamplePool"]];
  it("no test file imports generateSamplePool, sampleGhosts, floorGhosts or raceGhosts from tools/samplePool except the listed ones", () => {
    const found: string[][] = [];
    for (const f of readdirSync(join(ROOT, "tests")).filter((n) => n.endsWith(".ts") && !n.endsWith(".d.ts")).sort()) {
      const text = readFileSync(join(ROOT, "tests", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
      const named = [
        ...[...text.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']\.\.\/tools\/samplePool["']/g)].map((m) => m[1]),
        ...[...text.matchAll(/const\s*\{([^}]*)\}\s*=\s*await\s+import\(\s*["']\.\.\/tools\/samplePool["']\s*\)/g)].map((m) => m[1]),
        ...[...text.matchAll(/import\s+\*\s+as\s+\w+\s+from\s*["']\.\.\/tools\/samplePool["']/g)].map(() => BUILDERS.join(",")),
      ].flatMap((list) => list.split(",").map((s) => s.trim().split(/\s+as\s+/)[0])).filter((n) => BUILDERS.includes(n));
      for (const n of new Set(named)) found.push([`tests/${f}`, n]);
    }
    expect(found).toEqual(DIRECT.map(([f, n]) => [f, n]));
  });

  // samplePoolJson(pool = generateSamplePool()) builds for real when called with no argument; pass it the twin's pool instead.
  /** The ONLY test that calls it bare: net-pool's "reproducibly" check compares the cached pool with a pool built FRESH in this process, which doubles as a standing check that no stale entry is served. */
  const BARE: readonly string[] = ["tests/net-pool.test.ts"];
  it("no test file calls samplePoolJson() with no argument (it would build the pool for real) except the one listed", () => {
    const bare: string[] = [];
    for (const f of readdirSync(join(ROOT, "tests")).filter((n) => n.endsWith(".ts") && !n.endsWith(".d.ts") && n !== "poolCache.key.test.ts").sort()) {
      const text = readFileSync(join(ROOT, "tests", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
      if (/\bsamplePoolJson\(\s*\)/.test(text)) bare.push(`tests/${f}`);
    }
    expect(bare).toEqual([...BARE]);
  });
});

describe("the key moves with everything the builders read", () => {
  it("is stable: the same world, the same key", () => {
    expect(key().key).toBe(key().key);
    expect(key().key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("editing any file of the closure changes the key (and only the closure part)", () => {
    const base = key();
    const files = realClosure().files;
    for (const rel of files) {
      const k = key({ ...defaultCtx(), read: editing(rel, (t) => t + "\n// edit\n") });
      expect(k.key, rel).not.toBe(base.key);
      expect(k.parts.closure, rel).not.toBe(base.parts.closure);
      expect({ ...k.parts, closure: "" }).toEqual({ ...base.parts, closure: "" });
    }
    expect(files.length).toBeGreaterThan(60);
  });

  it("a file a closure file starts to import joins the closure; a file outside the closure does not move the key", () => {
    const base = key();
    // src/main.ts is outside the closure: editing it reads nothing
    expect(key({ ...defaultCtx(), read: editing("src/main.ts", (t) => t + "\n// edit\n") }).key).toBe(base.key);
    expect(realClosure().files).not.toContain("src/main.ts");
    // a closure file that imports it (an overlay) pulls it in: the closure is bigger and the key moves
    const grown = scanClosure(ROOT, ENTRY, editing("src/core/rng.ts", (t) => `import "../main";\n` + t));
    expect(grown.files).toContain("src/main.ts");
    expect(grown.digest).not.toBe(realClosure().digest);
  });

  it("the cache's own file and the vite config are part of the key", () => {
    const base = key();
    for (const [rel, part] of [["tests/helpers/poolCache.ts", "helper"], ["vite.config.ts", "config"]] as const) {
      const k = key({ ...defaultCtx(), read: editing(rel, (t) => t + "\n// edit\n") });
      expect(k.parts[part], rel).not.toBe(base.parts[part]);
      expect(k.key, rel).not.toBe(base.key);
    }
  });

  it("flipping any switch changes the key (and puts the switch back)", () => {
    for (const [name, on] of SWITCHES) {
      const was = on();
      const before = key();
      const flipped = FLIP[name](() => key(), !was);
      expect(flipped.key, name).not.toBe(before.key);
      expect(flipped.parts.switches, name).not.toBe(before.parts.switches);
      expect(on(), name).toBe(was);
      expect(key().parts.switches, name).toBe(before.parts.switches);
    }
  });

  it("turning SHAPES off and back on while other switches stay on re-orders ITEMS, and the key follows (REPORT-BUMP1E 8.1 (d))", () => {
    withPlainRigs(() => undefined, false); // off, then back on: the six plain ids are re-inserted, so they are the last keys of ITEMS now
    const before = key();
    withShapes(() => undefined, false); // off, then back on: the three shaped ids are re-inserted after them
    const after = key();
    expect(after.parts.switches).toBe(before.parts.switches);
    expect(after.parts.itemsOrder).not.toBe(before.parts.itemsOrder);
    expect(after.key).not.toBe(before.key);
  });

  it("permuting ITEMS changes the key, and putting the order back puts the key back; so does a patched def", () => {
    const ids = Object.getOwnPropertyNames(ITEMS);
    const base = key();
    try {
      const first = ids[0];
      const d = Object.getOwnPropertyDescriptor(ITEMS, first)!;
      delete items[first];
      Object.defineProperty(ITEMS, first, d); // the first id is now the last
      const moved = key();
      expect(moved.key).not.toBe(base.key);
      expect(moved.parts.itemsOrder).not.toBe(base.parts.itemsOrder);
    } finally {
      for (const id of ids) {
        const d = Object.getOwnPropertyDescriptor(ITEMS, id)!;
        delete items[id];
        Object.defineProperty(ITEMS, id, d);
      }
    }
    expect(key().key).toBe(base.key); // the order is back
    const id = ids.find((i) => Object.getOwnPropertyDescriptor(ITEMS, i)?.enumerable)!;
    const was = items[id];
    try {
      items[id] = { ...(was as object), price: 12345 };
      const patched = key();
      expect(patched.key).not.toBe(base.key);
      expect(patched.parts.itemsContent).not.toBe(base.parts.itemsContent);
      expect(patched.parts.itemsOrder).toBe(base.parts.itemsOrder);
    } finally {
      items[id] = was;
    }
    expect(key().key).toBe(base.key);
  });

  it("the environment: any BB_* variable, and the content of the files BB_SOFT1_PICKS_FILE names; the cache's own BB_POOL_* ones do not count", () => {
    const base = key();
    const ctx = defaultCtx();
    const env = (extra: Record<string, string>): KeyCtx => ({ ...ctx, env: { ...process.env, ...extra } });
    expect(key(env({ BB_ANYTHING: "1" })).key).not.toBe(base.key);
    expect(key(env({ BB_POOL_CACHE: "0", BB_POOL_CACHE_DIR: "/x", BB_POOL_CACHE_LOG: "/y" })).key).toBe(base.key);
    const f = "/virtual/picks.json";
    let content = "{\"world\":\"111111111111\"}";
    const read = (abs: string): string | undefined => (abs === f ? content : fsReader(abs));
    const withFile = (): KeyCtx => ({ ...ctx, read, env: { ...process.env, BB_SOFT1_PICKS_FILE: f } });
    const a = key(withFile());
    expect(a.key).not.toBe(base.key);
    expect(key(withFile()).key).toBe(a.key);
    content += " ";
    expect(key(withFile()).key).not.toBe(a.key);
  });

  it("the node version, the arguments and the builder", () => {
    const base = key();
    expect(key({ ...defaultCtx(), node: "v0.0.0|other" }).key).not.toBe(base.key);
    expect(poolKey("sampleGhosts", []).key).not.toBe(base.key);
    expect(key(undefined, [{ botRunes: true }]).key).not.toBe(base.key);
    expect(key(undefined, [{ botRunes: true }]).key).not.toBe(key(undefined, [{ botRunes: false }]).key);
    expect(key(undefined, [undefined]).key).toBe(base.key); // f(undefined) is f()
    expect(poolKey("floorGhosts", [96, { botRunes: true }]).key).not.toBe(poolKey("floorGhosts", [96]).key);
    expect(poolKey("raceGhosts", [undefined, "raceDeck"]).key).not.toBe(poolKey("raceGhosts", [undefined, "pure:() => 1"]).key);
  });
});

describe("the store", () => {
  const dirs: string[] = [];
  const tmp = (): string => {
    const d = mkdtempSync(join(tmpdir(), "bb-pool-test-"));
    dirs.push(d);
    return d;
  };
  afterEach(() => {
    delete process.env.BB_POOL_CACHE;
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  const files = (d: string): string[] => readdirSync(d).filter((f) => f.endsWith(".bin"));

  const shared = { n: 1 };
  const value = () => ({
    list: [{ a: 1, b: undefined, c: Number.NaN, d: -0, e: Infinity, shared }, { a: 2, shared }],
    map: new Map([["k", { v: [1, 2, 3] }]]), set: new Set([3, 1, 2]), date: new Date(1_700_000_000_000), order: { z: 1, a: 2, m: 3, 10: "x", 2: "y" },
    sparse: [1, , 3], nested: { deep: { deeper: ["ok", null, false] } },
  });

  it("a miss builds once and stores; a hit returns a fresh deep-equal copy and does not build; the entry is keyed by the world", () => {
    const d = tmp();
    let builds = 0;
    const build = () => { builds++; return value(); };
    const first = cachedCall("fake", [1], build, undefined, d);
    expect(builds).toBe(1);
    expect(first).toStrictEqual(value());
    expect(Object.is(first.list[0].d, -0)).toBe(true);
    expect(first.list[0].shared).toBe(first.list[1].shared); // shared references kept
    expect(Object.keys(first.order)).toEqual(Object.keys(value().order));
    expect(files(d)).toHaveLength(1);
    const before = poolCacheStats();
    const second = cachedCall("fake", [1], build, undefined, d);
    expect(builds).toBe(1);
    expect(second).toStrictEqual(first);
    expect(second).not.toBe(first);
    second.list.length = 0; // a test may mutate its copy
    expect(cachedCall("fake", [1], build, undefined, d).list).toHaveLength(2);
    expect(poolCacheStats().hits - before.hits).toBe(2);
    cachedCall("fake", [2], build, undefined, d); // other arguments: another entry
    expect(builds).toBe(2);
    const hearts = SWITCHES.find(([n]) => n === "hearts")![1];
    withHearts(() => cachedCall("fake", [1], build, undefined, d), !hearts()); // the same call in the other world: another entry
    expect(builds).toBe(3);
    withHearts(() => cachedCall("fake", [1], build, undefined, d), !hearts()); // ... which is a hit now
    expect(builds).toBe(3);
    expect(files(d)).toHaveLength(3);
  });

  it("BB_POOL_CACHE=0 builds every time and reads and writes nothing", () => {
    const d = tmp();
    let builds = 0;
    process.env.BB_POOL_CACHE = "0";
    cachedCall("fake", [], () => ++builds, undefined, d);
    cachedCall("fake", [], () => ++builds, undefined, d);
    expect(builds).toBe(2);
    expect(readdirSync(d)).toEqual([]);
  });

  it("a bad, a foreign or a truncated file is a miss, and is replaced; a build that throws caches nothing and leaves no lock", () => {
    const d = tmp();
    let builds = 0;
    const build = () => ({ n: ++builds });
    cachedCall("fake", [], build, undefined, d);
    const [name] = files(d);
    writeFileSync(join(d, name), "not a v8 value");
    expect(cachedCall("fake", [], build, undefined, d)).toEqual({ n: 2 });
    writeFileSync(join(d, name), readFileSync(join(d, name)).slice(0, 10));
    expect(cachedCall("fake", [], build, undefined, d)).toEqual({ n: 3 });
    expect(cachedCall("fake", [], build, undefined, d)).toEqual({ n: 3 }); // a good file again
    expect(() => cachedCall("boom", [], () => { throw new Error("builder failed"); }, undefined, d)).toThrow("builder failed");
    expect(readdirSync(d).filter((f) => f.startsWith("boom"))).toEqual([]);
  });

  it("another process's lock: its finished entry is taken without building; a stale lock (dead builder) is stolen", () => {
    const d = tmp();
    cachedCall("fake", [], () => ({ n: 1 }), undefined, d);
    const [name] = files(d);
    // a finished entry behind a held lock: taken, not rebuilt
    mkdirSync(join(d, name + ".lock"));
    writeFileSync(join(d, name + ".lock", "owner"), `1 ${Date.now()}`);
    let builds = 0;
    const waitedBefore = poolCacheStats().waited;
    expect(cachedCall("fake", [], () => ({ n: ++builds + 100 }), undefined, d)).toEqual({ n: 1 });
    expect(builds).toBe(0);
    // (the hit is served before the lock is looked at; remove the entry to test the lock itself)
    rmSync(join(d, name));
    writeFileSync(join(d, name + ".lock", "owner"), `1 ${Date.now() - 3 * 60 * 60 * 1000}`); // three hours old
    expect(cachedCall("fake", [], () => ({ n: ++builds + 100 }), undefined, d)).toEqual({ n: 101 });
    expect(existsSync(join(d, name + ".lock"))).toBe(false);
    expect(poolCacheStats().waited).toBeGreaterThanOrEqual(waitedBefore);
  });

  it("raceGhosts runs for real with a deckOf the key cannot see; a deckOf marked pure is keyed by its text", () => {
    const before = poolCacheStats();
    expect(() => raceGhosts(undefined, () => { throw new Error("deckOf ran"); })).toThrow("deckOf ran");
    expect(poolCacheStats().uncached - before.uncached).toBe(1);
    const pure = pureDeckOf((): never => { throw new Error("pure deckOf ran"); });
    expect(() => raceGhosts(undefined, pure)).toThrow("pure deckOf ran"); // keyed, a miss, built (it throws: nothing stored)
    expect(poolCacheStats().misses - before.misses).toBe(1);
  });
});
