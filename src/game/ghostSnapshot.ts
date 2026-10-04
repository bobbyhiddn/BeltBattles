// Ghost snapshot v1 (0.6.0b): a mirror of the async groundwork's GhostSnapshot contract
// (ref/async-snapshot.ts; src/net/snapshot.ts arrives with 0.7.0 and replaces this file's role).
// A ghost is a player's deck exactly as it fought dusk on day N, with the record carried INTO that
// fight. The local pool stores exactly this shape; 0.6.0a pool entries migrate on load.

import { GRID, HEROES, UPGRADE_MAX, UPGRADE_TRACKS, type HeroId } from "../sim/content";
import type { Build } from "../sim/deck";
import { migrateDeck } from "../sim/beltside";
import { NAME_KEY, nameProblem } from "../net/names"; // PACKS M2 (REQ-BFG-063): the one set of name rules

// 0.6.1a: v2 = v1 plus an optional `stars` (an integer 1..3; absent = 1) on any build.items[i] and
// build.mods[i]; src/net/snapshot.ts changes in the same commit (tests/snapshot.contract.test.ts).
// isSnapshot accepts v1 (no stars anywhere, loads as 1 star) and v2; day.ts ghostOf writes v2.
// 0.6.2 BELTSIDE (D1): v2 items may also carry `rot` (an integer 0..3, a rig's rotation; absent = 0; never
// on a mod), with src/net/snapshot.ts. v2 is not live yet, so no v3. Every snapshot loaded into the pool
// is a load boundary (D3): migrateSnapshot moves gates standing on belt tiles beside them.
// 0.6.2s TURRET SLOTS (REQ-BFG-031 S8): a v2 build may also carry `turrets` (absent = the hero's starting
// layout), exactly as src/net/snapshot.ts checkBuildShape takes it: at most MAX_TURRETS strict entries
// { slot 0..15, def, uid, stars? 1..3, free? (exactly true) }. Written only when present. No v3.
// 0.6.2j (REQ-BFG-027, J12): v2 routes may also carry `join` (a cell key 0..99, a joining belt's join tile; absent =
// an ordinary belt), with src/net/snapshot.ts; still v2.
export const SNAPSHOT_VERSION = 2;
const MAX_STARS = 3; // = stars.ts FUSE_MAX
const MAX_ROT = 3; // 0.6.2: a rig's rotation, 0..3 quarter turns
const MAX_TURRETS = 8; // 0.6.2s: = src/net/snapshot.ts MAX_TURRETS
const MAX_SLOT = 15; // 0.6.2s: = src/net/snapshot.ts MAX_SLOT
const DEF_PATTERN = /^[a-z0-9_]{1,32}$/; // = src/net/snapshot.ts DEF_PATTERN
const MAX_UID = 2 ** 31 - 1; // = src/net/snapshot.ts MAX_UID
const TURRET_KEYS = ["slot", "def", "uid", "stars", "free"];
/** runId, playerId: anonymous, no personal data (same pattern as the async contract). */
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
/** Where the anonymous player id lives (made once per device). */
export const PLAYER_KEY = "beltbattles.player.v1";
/** The async contract's bounds (ref/async-snapshot.ts): a run is 10 days; lives cap generously. */
export const MAX_DAY = 10;
export const MAX_LIVES = 9;

export interface GhostSnapshot {
  v: 1 | 2; // 0.6.1a: 2 carries stars; 1 still loads
  rules: string; // RULES_VERSION the build fought under
  hero: HeroId;
  day: number; // 1-10
  wins: number; // wins going into this day's dusk fight
  lives: number; // lives left going into the fight
  build: Build;
  runId: string;
  playerId: string; // anonymous random id, never an account name or e-mail
  createdAt: number; // ms since epoch, client clock (informational only)
  name?: string; // PACKS M2 (REQ-BFG-063): the player's name, as src/net/snapshot.ts takes it (names.ts); absent on pool entries
}

export const SNAPSHOT_KEYS = ["v", "rules", "hero", "day", "wins", "lives", "build", "runId", "playerId", "createdAt"] as const;
/** PACKS M2 (REQ-BFG-063): the optional key after SNAPSHOT_KEYS, written only when present. */
export const NAME_FIELD = "name";

type Store = Pick<Storage, "getItem" | "setItem">;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/** 0.6.1a: every item's and mod's `stars`: absent, or (v2 only) an integer 1..MAX_STARS. */
function starsOk(list: unknown[], v: number): boolean {
  return list.every((p) => {
    if (!p || typeof p !== "object" || !("stars" in p)) return true;
    const s = (p as { stars?: unknown }).stars;
    return v >= 2 && isInt(s) && s >= 1 && s <= MAX_STARS;
  });
}

/** 0.6.2 BELTSIDE: every item's `rot`: absent, or (v2 only) an integer 0..MAX_ROT; a mod never has one. */
function rotOk(items: unknown[], mods: unknown[], v: number): boolean {
  const has = (p: unknown) => !!p && typeof p === "object" && "rot" in p;
  return !mods.some(has) && items.every((p) => {
    if (!has(p)) return true;
    const r = (p as { rot?: unknown }).rot;
    return v >= 2 && isInt(r) && r >= 0 && r <= MAX_ROT;
  });
}

/** 0.6.2s TURRET SLOTS (S8): the build's `turrets`: absent, or (v2 only) an array of at most MAX_TURRETS strict
 *  entries: slot (0..MAX_SLOT), def (DEF_PATTERN), uid (0..MAX_UID), optional stars (1..MAX_STARS) and free (exactly
 *  true: false is never written); no other keys. */
function turretsOk(q: object, v: number): boolean {
  const list = (q as { turrets?: unknown }).turrets;
  if (list === undefined) return true; // absent (an in-memory `turrets: undefined` too: JSON drops it)
  if (v < 2 || !Array.isArray(list) || list.length > MAX_TURRETS) return false;
  return list.every((t) => {
    if (!t || typeof t !== "object" || Array.isArray(t)) return false;
    const e = t as Raw;
    return Object.keys(e).every((k) => TURRET_KEYS.includes(k)) && inRange(e.slot, 0, MAX_SLOT)
      && typeof e.def === "string" && DEF_PATTERN.test(e.def) && inRange(e.uid, 0, MAX_UID)
      && (!("stars" in e) || inRange(e.stars, 1, MAX_STARS)) && (!("free" in e) || e.free === true);
  });
}

/** 0.6.2j (J12): every route's `join`: absent, or (v2 only) a cell key 0..GRID*GRID-1 (a joining belt's join tile). */
function joinOk(routes: unknown[], v: number): boolean {
  return routes.every((r) => {
    if (!r || typeof r !== "object" || !("join" in r)) return true;
    const j = (r as { join?: unknown }).join;
    return v >= 2 && isInt(j) && j >= 0 && j < GRID * GRID;
  });
}

/** bb-0.8.3 (REQ-BFG-043 D10): the build's `upgrades`: absent, or (v2 only) a strict object { turret?, factory? }, each
 *  an integer 1..UPGRADE_MAX, exactly as src/net/snapshot.ts checkBuildShape takes it (BELTS run 5: this side had not
 *  learned the field, so it took a v1 copy holding levels, and level 5, that the strict decoder refuses). */
function upgradesOk(q: object, v: number): boolean {
  if (!("upgrades" in q)) return true;
  const u = (q as { upgrades?: unknown }).upgrades;
  if (u === undefined) return true; // an in-memory `upgrades: undefined` is absent (JSON drops it)
  if (v < 2 || !u || typeof u !== "object" || Array.isArray(u)) return false;
  return Object.keys(u).every((k) => (UPGRADE_TRACKS as readonly string[]).includes(k) && inRange((u as Raw)[k], 1, UPGRADE_MAX));
}

function buildOk(b: unknown, v = SNAPSHOT_VERSION): b is Build {
  const q = b as Build | null;
  return !!q && typeof q === "object" && !!HEROES[q.hero] && Array.isArray(q.items) && Array.isArray(q.routes)
    && Array.isArray(q.mods) && typeof q.beltCap === "number" && typeof q.hullBonus === "number"
    && starsOk(q.items, v) && starsOk(q.mods, v) && rotOk(q.items, q.mods, v) && turretsOk(q, v) && joinOk(q.routes, v)
    && upgradesOk(q, v);
}

/** An integer in min..max (the async contract's int(): ref/async-snapshot.ts checkSnapshot). */
const inRange = (v: unknown, min: number, max: number): boolean => isInt(v) && v >= min && v <= max;

/** Shape check of a v1 or (0.6.1a) v2 snapshot: exactly the contract's fields, ids matching ID_PATTERN, and
 *  (0.6.0c) checkSnapshot's numeric bounds exactly: day 1..MAX_DAY, wins 0..day - 1, lives
 *  1..MAX_LIVES, createdAt 0..Number.MAX_SAFE_INTEGER. */
export function isSnapshot(v: unknown): v is GhostSnapshot {
  const q = v as Raw | null;
  if (!q || typeof q !== "object" || Array.isArray(q)) return false;
  const keys = Object.keys(q);
  // PACKS M2 (REQ-BFG-063): `name` may follow, absent or a name names.ts accepts (an in-memory `name: undefined` is
  // absent), exactly as src/net/snapshot.ts checkSnapshot takes it, so this side refuses what the server refuses
  if (!SNAPSHOT_KEYS.every((k) => keys.includes(k)) || keys.some((k) => k !== NAME_FIELD && !(SNAPSHOT_KEYS as readonly string[]).includes(k))) return false;
  if (q.name !== undefined && nameProblem(q.name) !== null) return false;
  return (q.v === 1 || q.v === 2) && typeof q.rules === "string" && !!HEROES[q.hero as HeroId] && inRange(q.day, 1, MAX_DAY)
    && inRange(q.wins, 0, q.day - 1) && inRange(q.lives, 1, MAX_LIVES) && buildOk(q.build, q.v) && q.build.hero === q.hero
    && typeof q.runId === "string" && ID_PATTERN.test(q.runId) && typeof q.playerId === "string"
    && ID_PATTERN.test(q.playerId) && inRange(q.createdAt, 0, Number.MAX_SAFE_INTEGER);
}

/** Any string made safe for ID_PATTERN (invalid characters become "_", at most 64 long). */
export function toId(s: unknown, fallback = "anon"): string {
  const t = String(s ?? "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
  return t.length ? t : fallback;
}

/**
 * One pool entry up to v1 or v2, or null. A v1 or v2 entry is kept as it is (0.6.1a: v1 is NOT
 * rewritten to v2; its copies load as 1 star); a 0.6.0a entry ({ v: 1,
 * rulesVersion, losses, savedAt, ... }) becomes { rules, createdAt, playerId } with this device's
 * player id (the local pool holds this player's own earlier runs) and loses its `losses` field.
 */
export function migrateSnapshot(raw: unknown, playerId: string): GhostSnapshot | null {
  const g = shapeSnapshot(raw, playerId);
  if (!g) return null;
  migrateDeck(g.build, "ghost"); // 0.6.2 BELTSIDE (D3): gates off the belts; a stranded one drops (logged)
  // v1 can't carry `rot`: a v1 ghost whose rigs turned to face their old tiles is v2 now (v2 = v1 + stars + rot)
  if (g.v === 1 && g.build.items.some((p) => p.rot !== undefined)) return { ...g, v: 2 };
  return g;
}

function shapeSnapshot(raw: unknown, playerId: string): GhostSnapshot | null {
  if (isSnapshot(raw)) return raw;
  const q = raw as Raw | null;
  if (!q || typeof q !== "object" || q.v !== 1 || typeof q.rulesVersion !== "string") return null;
  const lives = Math.max(1, Math.floor(Number(q.lives) || 1));
  const day = Math.max(1, Math.floor(Number(q.day) || 1));
  const s: GhostSnapshot = {
    v: 1, rules: q.rulesVersion, hero: q.hero, day, wins: Math.min(day - 1, Math.max(0, Math.floor(Number(q.wins) || 0))),
    lives, build: q.build, runId: toId(q.runId), playerId: toId(playerId),
    createdAt: Math.max(0, Math.floor(Number(q.savedAt) || 0)),
  };
  return isSnapshot(s) ? s : null;
}

/** A fresh anonymous player id: "p" + 20 base-36 characters (matches ID_PATTERN). Uses crypto
 *  when available; never the sim's RNG. */
export function newPlayerId(): string {
  let out = "p";
  const c = (globalThis as { crypto?: Crypto }).crypto;
  const bytes = new Uint8Array(20);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  for (const b of bytes) out += (b % 36).toString(36);
  return out;
}

let sessionId: string | null = null;

function storage(s?: Store): Store | null {
  if (s) return s;
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/** PACKS M2 (REQ-BFG-063): this device's player name, beside the player id (localStorage NAME_KEY,
 *  beltbattles.name.v1, plain text in names.ts's canonical form), or null: none stored, storage unavailable, or a stored
 *  value names.ts refuses (the name screen then asks again). Offline, on plain http and from file:// alike. */
export function playerName(s?: Store): string | null {
  try {
    const cur = storage(s)?.getItem(NAME_KEY) ?? null;
    return cur !== null && nameProblem(cur) === null ? cur : null;
  } catch {
    return null;
  }
}

/** PACKS M2: store this device's player name (the name screen, after nameProblem accepted it). False when storage
 *  refused it (the name then lasts this page load: sessionName). */
export function setPlayerName(name: string, s?: Store): boolean {
  if (nameProblem(name) !== null) return false;
  if (!s) sessionName = name;
  try {
    const st = storage(s);
    if (!st) return false;
    st.setItem(NAME_KEY, name);
    return true;
  } catch {
    return false;
  }
}

let sessionName: string | null = null;

/** PACKS M2: the name uploads and the local pool carry: the stored one, else (storage refused it) this page load's. */
export function currentName(s?: Store): string | null {
  return playerName(s) ?? (s ? null : sessionName);
}

/** This device's player id: read from beltbattles.player.v1, made (and stored) on first use. */
export function playerId(s?: Store): string {
  const st = storage(s);
  try {
    const cur = st?.getItem(PLAYER_KEY);
    if (cur && ID_PATTERN.test(cur)) return cur;
  } catch {
    /* storage unavailable: a session id */
  }
  const id = !s && sessionId ? sessionId : newPlayerId();
  if (!s) sessionId = id;
  try {
    st?.setItem(PLAYER_KEY, id);
  } catch {
    /* ignore */
  }
  return id;
}
