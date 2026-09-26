// Ghost snapshots (spec §20, §23; ROADMAP §3). A ghost is a player's deck exactly as it
// fought dusk on day N, stamped with the rules version, hero, day and the record the
// player carried INTO that fight. The wire form is canonical JSON: fixed key order, no
// whitespace, arrays in build order (item and route order matter to the sim). Decoding
// is strict: unknown fields, wrong types, out-of-range values and oversize input throw.

import { GRID, HEROES, type HeroId } from "../sim/content";
import type { Build, BuildTurret, ModPlacement, Placed, RouteDef } from "../sim/deck";

// 0.6.1a: v2 = v1 plus an optional `stars` (an integer 1..MAX_STARS; absent = 1) on any
// build.items[i] and build.mods[i]. v1 snapshots still decode (as 1 star); in v1 `stars` is absent.
// 0.6.2 BELTSIDE (DESIGN-beltside D1): v2 items may also carry `rot` (an integer 0..MAX_ROT, a rig's
// rotation; absent = 0), never a mod. v2 is not live yet, so `rot` joins v2 and no v3 is needed.
// 0.6.2s TURRET SLOTS (REQ-BFG-031 S8): a v2 build may also carry `turrets` (at most MAX_TURRETS entries
// { slot, def, uid, stars?, free? }; absent = the hero's starting layout). The encoder writes it only when
// present, after the other build keys, so a build without it encodes byte-for-byte as before. No v3.
export const SNAPSHOT_VERSION = 2;
export const SNAPSHOT_VERSIONS: readonly number[] = [1, 2];
export const MAX_STARS = 3; // = stars.ts FUSE_MAX
export const MAX_ROT = 3; // 0.6.2: a rig's rotation in quarter turns
export const MAX_SNAPSHOT_BYTES = 16 * 1024; // encoded UTF-8 size cap (client, server, pool)
export const MAX_DAY = 10; // a run is 10 days (ROADMAP §1)
export const MAX_LIVES = 9; // generous cap: 0.4.1 starts with 3 lives, the 10-day run with 5
export const MAX_ITEMS = 64;
export const MAX_ROUTES = 16;
export const MAX_MODS = 16;
export const MAX_TURRETS = 8; // 0.6.2s: build.turrets entries (a hull has at most 4 slots today)
export const MAX_SLOT = 15; // 0.6.2s: a turret slot index (= the bound of ModPlacement.turret)
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/; // runId, playerId: anonymous, no personal data
const RULES_PATTERN = /^[A-Za-z0-9._-]{1,32}$/;
const DEF_PATTERN = /^[a-z0-9_]{1,32}$/;
const MAX_UID = 2 ** 31 - 1;

export interface GhostSnapshot {
  v: 1 | 2; // 0.6.1a: 2 carries stars; 1 still loads
  rules: string; // RULES_VERSION the build fought under
  hero: HeroId;
  day: number; // 1-10
  wins: number; // wins going into this day's dusk fight (0..day-1)
  lives: number; // lives left going into the fight (1..MAX_LIVES)
  build: Build;
  runId: string;
  playerId: string; // anonymous random id, never an account name or e-mail
  createdAt: number; // ms since epoch, client clock (informational only)
}

/** A snapshot with its pool id (content hash for stored ghosts, "offline-..." for stand-ins). */
export interface PoolEntry {
  id: string;
  snapshot: GhostSnapshot;
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotError";
  }
}

type Obj = Record<string, unknown>;
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

function obj(v: unknown, path: string, keys: readonly string[], optional: readonly string[] = []): Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new SnapshotError(`${path}: expected an object`);
  const o = v as Obj;
  for (const k of Object.keys(o)) if (!keys.includes(k) && !optional.includes(k)) throw new SnapshotError(`${path}.${k}: unknown field`);
  for (const k of keys) if (!has(o, k)) throw new SnapshotError(`${path}.${k}: missing`);
  return o;
}

/** 0.6.1a: the optional `stars` of an item or mod: v2 only, an integer 1..MAX_STARS; kept as given. */
function stars(o: Obj, path: string, version: number): { stars?: number } {
  if (!has(o, "stars")) return {};
  if (version < 2) throw new SnapshotError(`${path}.stars: not allowed in a v${version} snapshot`);
  return { stars: int(o.stars, `${path}.stars`, 1, MAX_STARS) };
}

/** 0.6.2 BELTSIDE: the optional `rot` of an item: v2 only, an integer 0..MAX_ROT; kept as given. */
function rot(o: Obj, path: string, version: number): { rot?: number } {
  if (!has(o, "rot")) return {};
  if (version < 2) throw new SnapshotError(`${path}.rot: not allowed in a v${version} snapshot`);
  return { rot: int(o.rot, `${path}.rot`, 0, MAX_ROT) };
}

/** 0.6.2s TURRET SLOTS (S8): the optional `turrets` of a build: v2 only, at most MAX_TURRETS strict entries
 *  { slot, def, uid, stars?, free? }. `free` is exactly true when present (false is never written). The canonical
 *  copy keeps the key order slot, def, uid, stars, free. */
function turrets(o: Obj, path: string, version: number): { turrets?: BuildTurret[] } {
  if (!has(o, "turrets") || o.turrets === undefined) return {}; // an in-memory `turrets: undefined` is absent (JSON drops it)
  if (version < 2) throw new SnapshotError(`${path}.turrets: not allowed in a v${version} snapshot`);
  return {
    turrets: arr(o.turrets, `${path}.turrets`, MAX_TURRETS).map((tv, i): BuildTurret => {
      const at = `${path}.turrets[${i}]`;
      const t = obj(tv, at, ["slot", "def", "uid"], ["stars", "free"]);
      if (has(t, "free") && t.free !== true) throw new SnapshotError(`${at}.free: expected true (absent = false)`);
      return {
        slot: int(t.slot, `${at}.slot`, 0, MAX_SLOT),
        def: str(t.def, `${at}.def`, DEF_PATTERN),
        uid: int(t.uid, `${at}.uid`, 0, MAX_UID),
        ...stars(t, at, version),
        ...(t.free === true ? { free: true } : {}),
      };
    }),
  };
}

function int(v: unknown, path: string, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
    throw new SnapshotError(`${path}: expected an integer in ${min}..${max}`);
  }
  return v;
}

function str(v: unknown, path: string, re: RegExp): string {
  if (typeof v !== "string" || !re.test(v)) throw new SnapshotError(`${path}: expected a string matching ${re}`);
  return v;
}

function arr(v: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(v)) throw new SnapshotError(`${path}: expected an array`);
  if (v.length > max) throw new SnapshotError(`${path}: more than ${max} entries`);
  return v;
}

export function isHeroId(v: unknown): v is HeroId {
  return typeof v === "string" && has(HEROES, v);
}

/**
 * Shape check for a Build: exact fields, integer types, grid ranges. Returns a canonical
 * copy. Legality (placement, routes, budget) is validate.ts's job. 0.6.1a: `version` is the
 * snapshot version the build travels in (default SNAPSHOT_VERSION): from v2 an item or mod may
 * carry `stars` (1..MAX_STARS); in v1 it must be absent. 0.6.2s: from v2 the build may carry `turrets`
 * (see turrets()); the copy has the key only when the input has it, last.
 */
export function checkBuildShape(v: unknown, path = "build", version: number = SNAPSHOT_VERSION): Build {
  const o = obj(v, path, ["hero", "items", "routes", "mods", "beltCap", "hullBonus"], ["turrets"]);
  if (!isHeroId(o.hero)) throw new SnapshotError(`${path}.hero: unknown hero`);
  const items = arr(o.items, `${path}.items`, MAX_ITEMS).map((it, i): Placed => {
    const p = obj(it, `${path}.items[${i}]`, ["uid", "def", "x", "y"], ["stars", "rot"]);
    return {
      uid: int(p.uid, `${path}.items[${i}].uid`, 0, MAX_UID),
      def: str(p.def, `${path}.items[${i}].def`, DEF_PATTERN),
      x: int(p.x, `${path}.items[${i}].x`, 0, GRID - 1),
      y: int(p.y, `${path}.items[${i}].y`, 0, GRID - 1),
      ...stars(p, `${path}.items[${i}]`, version),
      ...rot(p, `${path}.items[${i}]`, version),
    };
  });
  const routes = arr(o.routes, `${path}.routes`, MAX_ROUTES).map((rv, i): RouteDef => {
    const r = obj(rv, `${path}.routes[${i}]`, ["factory", "cells"]);
    return {
      factory: int(r.factory, `${path}.routes[${i}].factory`, 0, MAX_UID),
      cells: arr(r.cells, `${path}.routes[${i}].cells`, GRID * GRID).map((c, j) =>
        int(c, `${path}.routes[${i}].cells[${j}]`, 0, GRID * GRID - 1)),
    };
  });
  const mods = arr(o.mods, `${path}.mods`, MAX_MODS).map((mv, i): ModPlacement => {
    const m = obj(mv, `${path}.mods[${i}]`, ["uid", "def", "turret"], ["stars"]);
    return {
      uid: int(m.uid, `${path}.mods[${i}].uid`, 0, MAX_UID),
      def: str(m.def, `${path}.mods[${i}].def`, DEF_PATTERN),
      turret: int(m.turret, `${path}.mods[${i}].turret`, 0, 15),
      ...stars(m, `${path}.mods[${i}]`, version),
    };
  });
  return {
    hero: o.hero,
    items,
    routes,
    mods,
    beltCap: int(o.beltCap, `${path}.beltCap`, 0, 1000),
    // negative values are shape-legal so stored battle records holding warlord stand-ins
    // (warlordHull is negative on days 1-3) still decode; validateBuild rejects them.
    hullBonus: int(o.hullBonus, `${path}.hullBonus`, -1000, 10000),
    ...turrets(o, path, version),
  };
}

/** Full strict check of a decoded value. Returns a canonical copy. */
export function checkSnapshot(v: unknown): GhostSnapshot {
  const o = obj(v, "snapshot", ["v", "rules", "hero", "day", "wins", "lives", "build", "runId", "playerId", "createdAt"]);
  if (o.v !== 1 && o.v !== 2) throw new SnapshotError(`snapshot.v: expected 1 or ${SNAPSHOT_VERSION}`);
  const ver: 1 | 2 = o.v;
  const rules = str(o.rules, "snapshot.rules", RULES_PATTERN);
  if (!isHeroId(o.hero)) throw new SnapshotError("snapshot.hero: unknown hero");
  const day = int(o.day, "snapshot.day", 1, MAX_DAY);
  const wins = int(o.wins, "snapshot.wins", 0, day - 1);
  const lives = int(o.lives, "snapshot.lives", 1, MAX_LIVES);
  const build = checkBuildShape(o.build, "snapshot.build", ver);
  if (build.hero !== o.hero) throw new SnapshotError("snapshot.build.hero: must equal snapshot.hero");
  return {
    v: ver, rules, hero: o.hero, day, wins, lives, build,
    runId: str(o.runId, "snapshot.runId", ID_PATTERN),
    playerId: str(o.playerId, "snapshot.playerId", ID_PATTERN),
    createdAt: int(o.createdAt, "snapshot.createdAt", 0, Number.MAX_SAFE_INTEGER),
  };
}

export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Canonical JSON. Throws SnapshotError if the snapshot is malformed or over 16 KB. */
export function encodeSnapshot(s: GhostSnapshot): string {
  const text = JSON.stringify(checkSnapshot(s));
  if (utf8Bytes(text) > MAX_SNAPSHOT_BYTES) throw new SnapshotError(`snapshot: over ${MAX_SNAPSHOT_BYTES} bytes`);
  return text;
}

/** Strict decode of canonical or non-canonical JSON text. */
export function decodeSnapshot(text: string): GhostSnapshot {
  if (typeof text !== "string") throw new SnapshotError("snapshot: expected JSON text");
  if (utf8Bytes(text) > MAX_SNAPSHOT_BYTES) throw new SnapshotError(`snapshot: over ${MAX_SNAPSHOT_BYTES} bytes`);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError("snapshot: not valid JSON");
  }
  return checkSnapshot(raw);
}

/** cyrb53: fast 53-bit string hash (not cryptographic). */
function hash53(text: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Content-addressed ghost id: the same snapshot always gets the same id (idempotent submit). */
export function ghostId(s: GhostSnapshot): string {
  return "g" + hash53(encodeSnapshot(s)).toString(16).padStart(14, "0");
}
