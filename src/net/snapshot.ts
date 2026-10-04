// Ghost snapshots (spec §20, §23; ROADMAP §3). A ghost is a player's deck exactly as it
// fought dusk on day N, stamped with the rules version, hero, day and the record the
// player carried INTO that fight. The wire form is canonical JSON: fixed key order, no
// whitespace, arrays in build order (item and route order matter to the sim). Decoding
// is strict: unknown fields, wrong types, out-of-range values and oversize input throw.

import { GRID, HEROES, UPGRADE_MAX, UPGRADE_TRACKS, type HeroId, type Upgrades } from "../sim/content";
import type { Build, BuildTurret, ModPlacement, Placed, RouteDef } from "../sim/deck";
import { heroGateProblem, rulesGateProblem } from "./rulesGate"; // 0.7.0 (v070-rel M2): turrets and joins need bb-0.6.2 rules; 0.8.0 H1: heroes by rules
import { nameProblem, type NameProblem } from "./names"; // PACKS M2 (REQ-BFG-063): the one set of name rules

// 0.6.1a: v2 = v1 plus an optional `stars` (an integer 1..MAX_STARS; absent = 1) on any
// build.items[i] and build.mods[i]. v1 snapshots still decode (as 1 star); in v1 `stars` is absent.
// 0.6.2 BELTSIDE (DESIGN-beltside D1): v2 items may also carry `rot` (an integer 0..MAX_ROT, a rig's
// rotation; absent = 0), never a mod. v2 is not live yet, so `rot` joins v2 and no v3 is needed.
// 0.6.2s TURRET SLOTS (REQ-BFG-031 S8): a v2 build may also carry `turrets` (at most MAX_TURRETS entries
// { slot, def, uid, stars?, free? }; absent = the hero's starting layout). The encoder writes it only when
// present, after the other build keys, so a build without it encodes byte-for-byte as before. No v3.
// 0.6.2j (REQ-BFG-027, J12): v2 routes may also carry `join` (a cell key 0..GRID*GRID-1: a joining belt's join
// tile; absent = an ordinary belt). The encoder writes it only when present, so a snapshot without joins encodes
// byte for byte as before and every older snapshot decodes identically. Its legality is validateBuild's.
// 0.7.0 (v070-rel M2): turrets and joins are bb-0.6.2 rules. checkSnapshot refuses a build that carries them under rules
// that predate bb-0.6.2 or can't be read as bb-MAJOR.MINOR.PATCH (rulesGate.ts), on every path that decodes or encodes.
// RUNES-1 (REQ-BFG-058; FIX-3 of REVIEW-R1-ALL.md): snapshot v3, the ONE ghost-format change of the redesign, with every
// field it adds: R1b-2's `seed` (the run seed), Build `runes` and Build `gold` (held at dusk) and a piece's `grow`; R1d's
// `battleGold` (its battle receipts travel beside the snapshot, not inside); R1e's `losses`, `mode`, `endlessWins`,
// `endlessLives` and `victoryDay`. Every field is optional, written last (after `name`, in V3_SNAPSHOT_FIELDS order; a
// build's after `upgrades`) and left out when zero, so a snapshot without them encodes byte for byte as v2 did. Only a
// v3 snapshot may carry them. This rules version writes and takes `seed` and `runes` only (V3_LIVE); both this decoder
// and the client's check (src/game/ghostSnapshot.ts) refuse every other v3 field when present, until the stage that owns
// it switches it on. SNAPSHOT_VERSION stays the version a snapshot WITHOUT any v3 field travels as (the pools, the
// stand-ins and the probe: unchanged bytes and ids); the player's own snapshot (day.ts ghostOf) carries its seed and so
// travels as SNAPSHOT_V3.
export const SNAPSHOT_VERSION = 2;
export const SNAPSHOT_V3 = 3;
export const SNAPSHOT_VERSIONS: readonly number[] = [1, 2, 3];
/** RUNES-1: the v3 snapshot-level fields, in their canonical (written) order after `name`. */
export const V3_SNAPSHOT_FIELDS = ["seed", "losses", "mode", "endlessWins", "endlessLives", "victoryDay", "battleGold"] as const;
/** RUNES-1: the v3 build-level fields, after `upgrades`; and the piece-level field (items, mods, turrets). */
export const V3_BUILD_FIELDS = ["runes", "gold"] as const;
export const V3_PIECE_FIELD = "grow";
/** RUNES-1: a rune entry's optional counter (GROW-1's growing runes). */
export const V3_RUNE_COUNTER = "n";
/** RUNES-1: which v3 fields this rules version takes. Each later stage switches its own on deliberately (R1d's gold
 *  fields, R1e's losses/mode/endless fields, GROW-1's grow and rune counter); both checks refuse an off field. */
export const V3_LIVE: Readonly<Record<string, boolean>> = {
  seed: true, runes: true,
  losses: false, mode: false, endlessWins: false, endlessLives: false, victoryDay: false, battleGold: false,
  gold: false, grow: false, n: false,
};
export const MAX_SEED = 2 ** 32 - 1; // RUNES-1: a run seed (run.ts newRun), 1..2^32-1 (0 is left out)
export const MAX_RUNES = 10; // RUNES-1: one a dawn (= MAX_DAY; runes.ts runeProblem holds the day's own bound)
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
  v: 1 | 2 | 3; // 0.6.1a: 2 carries stars; 1 still loads. RUNES-1: 3 may carry the v3 fields below
  rules: string; // RULES_VERSION the build fought under
  hero: HeroId;
  day: number; // 1-10
  wins: number; // wins going into this day's dusk fight (0..day-1)
  lives: number; // lives left going into the fight (1..MAX_LIVES)
  build: Build;
  runId: string;
  playerId: string; // anonymous random id, never an account name or e-mail
  createdAt: number; // ms since epoch, client clock (informational only)
  /** PACKS M2 (REQ-BFG-063): the player's name (names.ts), optional and last: absent on pool entries and older uploads;
   *  POST /v1/ghosts requires it under RULES_VERSION. Never the tag (readers derive it from playerId). */
  name?: string;
  /** RUNES-1 (snapshot v3): the run seed (run.ts newRun), so the server re-derives the rune offers (runes.ts
   *  runeProblem). Private: served ghosts strip it (FIX-6; server/app.ts). */
  seed?: number;
  // RUNES-1 (snapshot v3), refused in this rules version (V3_LIVE): R1e's record and endless fields, R1d's gold
  losses?: number;
  mode?: "run" | "endless";
  endlessWins?: number;
  endlessLives?: number;
  victoryDay?: number;
  battleGold?: number;
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

/** PACKS M2 (REQ-BFG-063): a present `name` that names.ts nameProblem refuses. Its message, "name: <reason>", is POST
 *  /v1/ghosts's 422 error (server/app.ts); everywhere else it is a SnapshotError like any other. */
export class NameError extends SnapshotError {
  constructor(readonly problem: NameProblem) {
    super(`name: ${problem}`);
    this.name = "NameError";
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
      const t = obj(tv, at, ["slot", "def", "uid"], ["stars", "free", V3_PIECE_FIELD]);
      grow(t, at, version); // RUNES-1: refused while off
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

/**
 * bb-0.8.3 (REQ-BFG-043 D10): the optional `upgrades` of a build: v2 only, a strict object { turret?, factory? }, each an
 * integer 1..UPGRADE_MAX (absent = level 1); kept as given, in the canonical key order turret, factory, after every other
 * build key, so a build without it encodes byte for byte as before (no SNAPSHOT_VERSION bump: the rules bump to bb-0.8.3
 * keeps older servers and pools apart). Level 5 or more is refused here; what the levels cost is validate.ts's budget.
 */
function upgrades(o: Obj, path: string, version: number): { upgrades?: Upgrades } {
  if (!has(o, "upgrades") || o.upgrades === undefined) return {}; // an in-memory `upgrades: undefined` is absent
  if (version < 2) throw new SnapshotError(`${path}.upgrades: not allowed in a v${version} snapshot`);
  const u = obj(o.upgrades, `${path}.upgrades`, [], UPGRADE_TRACKS);
  return {
    upgrades: {
      ...(has(u, "turret") ? { turret: int(u.turret, `${path}.upgrades.turret`, 1, UPGRADE_MAX) } : {}),
      ...(has(u, "factory") ? { factory: int(u.factory, `${path}.upgrades.factory`, 1, UPGRADE_MAX) } : {}),
    },
  };
}

/** 0.6.2j (J12): the optional `join` of a route: v2 only, a cell key 0..GRID*GRID-1; kept as given. */
function join(o: Obj, path: string, version: number): { join?: number } {
  if (!has(o, "join")) return {};
  if (version < 2) throw new SnapshotError(`${path}.join: not allowed in a v${version} snapshot`);
  return { join: int(o.join, `${path}.join`, 0, GRID * GRID - 1) };
}

/** RUNES-1 (snapshot v3): a present v3 field is allowed only in a v3 snapshot, and only while V3_LIVE switches it on. */
function v3Gate(path: string, field: string, version: number): void {
  if (version < SNAPSHOT_V3) throw new SnapshotError(`${path}: not allowed in a v${version} snapshot`);
  if (!V3_LIVE[field]) throw new SnapshotError(`${path}: not in this rules version yet`);
}

/** RUNES-1: a piece's `grow` (GROW-1's counter): refused while off (v3Gate throws when present). */
function grow(o: Obj, path: string, version: number): void {
  if (has(o, V3_PIECE_FIELD) && o[V3_PIECE_FIELD] !== undefined) v3Gate(`${path}.${V3_PIECE_FIELD}`, V3_PIECE_FIELD, version);
}

/** RUNES-1 (snapshot v3): the build's optional `runes`, v3 only: at most MAX_RUNES strict entries { id } in pick order
 *  (GROW-1's counter `n` refused while off); kept as given, last. Which ids are legal is runes.ts runeProblem's. */
function runes(o: Obj, path: string, version: number): { runes?: { id: string }[] } {
  if (!has(o, "runes") || o.runes === undefined) return {};
  v3Gate(`${path}.runes`, "runes", version);
  return {
    runes: arr(o.runes, `${path}.runes`, MAX_RUNES).map((rv, i) => {
      const at = `${path}.runes[${i}]`;
      const e = obj(rv, at, ["id"], [V3_RUNE_COUNTER]);
      if (has(e, V3_RUNE_COUNTER) && e[V3_RUNE_COUNTER] !== undefined) v3Gate(`${at}.${V3_RUNE_COUNTER}`, V3_RUNE_COUNTER, version);
      return { id: str(e.id, `${at}.id`, DEF_PATTERN) };
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
export function checkBuildShape(v: unknown, path = "build", version: number = SNAPSHOT_V3): Build {
  // RUNES-1: the default is the newest version (a build outside a snapshot: validateBuild, a battle record's builds), so
  // a build with runes is shape-legal there; checkSnapshot passes its own snapshot's version
  const o = obj(v, path, ["hero", "items", "routes", "mods", "beltCap", "hullBonus"], ["turrets", "upgrades", ...V3_BUILD_FIELDS]);
  if (has(o, "gold") && o.gold !== undefined) v3Gate(`${path}.gold`, "gold", version); // RUNES-1: R1b-2/R1d's held gold, off
  if (!isHeroId(o.hero)) throw new SnapshotError(`${path}.hero: unknown hero`);
  const items = arr(o.items, `${path}.items`, MAX_ITEMS).map((it, i): Placed => {
    const p = obj(it, `${path}.items[${i}]`, ["uid", "def", "x", "y"], ["stars", "rot", V3_PIECE_FIELD]);
    grow(p, `${path}.items[${i}]`, version); // RUNES-1: refused while off
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
    const r = obj(rv, `${path}.routes[${i}]`, ["factory", "cells"], ["join"]);
    return {
      factory: int(r.factory, `${path}.routes[${i}].factory`, 0, MAX_UID),
      cells: arr(r.cells, `${path}.routes[${i}].cells`, GRID * GRID).map((c, j) =>
        int(c, `${path}.routes[${i}].cells[${j}]`, 0, GRID * GRID - 1)),
      ...join(r, `${path}.routes[${i}]`, version), // 0.6.2j (J12)
    };
  });
  const mods = arr(o.mods, `${path}.mods`, MAX_MODS).map((mv, i): ModPlacement => {
    const m = obj(mv, `${path}.mods[${i}]`, ["uid", "def", "turret"], ["stars", V3_PIECE_FIELD]);
    grow(m, `${path}.mods[${i}]`, version); // RUNES-1: refused while off
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
    ...upgrades(o, path, version), // bb-0.8.3 (REQ-BFG-043 D10)
    ...runes(o, path, version), // RUNES-1 (snapshot v3): last, only when present
  };
}

/** RUNES-1 (snapshot v3): the snapshot-level v3 fields, in V3_SNAPSHOT_FIELDS order, each only when present. `seed` (on):
 *  an integer 1..MAX_SEED (a zero seed is left out). Every other field is refused while off (v3Gate). */
function v3Fields(o: Obj, version: number): { seed?: number } {
  const out: { seed?: number } = {};
  for (const k of V3_SNAPSHOT_FIELDS) {
    if (!has(o, k) || o[k] === undefined) continue;
    v3Gate(`snapshot.${k}`, k, version);
    if (k === "seed") out.seed = int(o.seed, "snapshot.seed", 1, MAX_SEED);
  }
  return out;
}

/**
 * PACKS M2 (REQ-BFG-063): the optional `name`, as BELTS added the build's `upgrades`: absent (pool entries, older uploads),
 * or a name names.ts accepts, in its canonical form only; kept as given, written last, so a snapshot without it encodes
 * byte for byte as before (no SNAPSHOT_VERSION bump). A non-string is a shape error (400 on the server); any other name
 * nameProblem refuses throws a NameError ("name: too long", ...), the server's 422. Whether an upload must carry one is
 * the server's rule (server/app.ts: every upload under RULES_VERSION), not the decoder's.
 */
function nameField(o: Obj): { name?: string } {
  if (!has(o, "name") || o.name === undefined) return {}; // an in-memory `name: undefined` is absent (JSON drops it)
  if (typeof o.name !== "string") throw new SnapshotError("snapshot.name: expected a string");
  const problem = nameProblem(o.name);
  if (problem) throw new NameError(problem);
  return { name: o.name };
}

/** Full strict check of a decoded value. Returns a canonical copy. */
export function checkSnapshot(v: unknown): GhostSnapshot {
  const o = obj(v, "snapshot", ["v", "rules", "hero", "day", "wins", "lives", "build", "runId", "playerId", "createdAt"], ["name", ...V3_SNAPSHOT_FIELDS]);
  if (o.v !== 1 && o.v !== 2 && o.v !== 3) throw new SnapshotError(`snapshot.v: expected 1, 2 or ${SNAPSHOT_V3}`);
  const ver: 1 | 2 | 3 = o.v;
  const rules = str(o.rules, "snapshot.rules", RULES_PATTERN);
  if (!isHeroId(o.hero)) throw new SnapshotError("snapshot.hero: unknown hero");
  const day = int(o.day, "snapshot.day", 1, MAX_DAY);
  const wins = int(o.wins, "snapshot.wins", 0, day - 1);
  const lives = int(o.lives, "snapshot.lives", 1, MAX_LIVES);
  const build = checkBuildShape(o.build, "snapshot.build", ver);
  if (build.hero !== o.hero) throw new SnapshotError("snapshot.build.hero: must equal snapshot.hero");
  const gate = rulesGateProblem(rules, build); // 0.7.0 (v070-rel M2): before any exact RULES_VERSION check of a caller
  if (gate) throw new SnapshotError(`snapshot.rules: ${gate}`);
  // 0.8.0 H1 (REQ-BFG-009): the hero must be one its rules accept (rulesGate.ts RULES_HEROES): under bb-0.6.2 only
  // FURNACE and WEAVER, so no 0.7.0 client is ever served a FOUNDRY or BASTION ghost
  const heroGate = heroGateProblem(rules, o.hero);
  if (heroGate) throw new SnapshotError(`snapshot.hero: ${heroGate}`);
  return {
    v: ver, rules, hero: o.hero, day, wins, lives, build,
    runId: str(o.runId, "snapshot.runId", ID_PATTERN),
    playerId: str(o.playerId, "snapshot.playerId", ID_PATTERN),
    createdAt: int(o.createdAt, "snapshot.createdAt", 0, Number.MAX_SAFE_INTEGER),
    ...nameField(o), // PACKS M2 (REQ-BFG-063): last, only when present
    ...v3Fields(o, ver), // RUNES-1 (snapshot v3): after the name, only when present
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
