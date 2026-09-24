// Ghost snapshot v1 (0.6.0b): a mirror of the async groundwork's GhostSnapshot contract
// (ref/async-snapshot.ts; src/net/snapshot.ts arrives with 0.7.0 and replaces this file's role).
// A ghost is a player's deck exactly as it fought dusk on day N, with the record carried INTO that
// fight. The local pool stores exactly this shape; 0.6.0a pool entries migrate on load.

import { HEROES, type HeroId } from "../sim/content";
import type { Build } from "../sim/deck";

export const SNAPSHOT_VERSION = 1;
/** runId, playerId: anonymous, no personal data (same pattern as the async contract). */
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
/** Where the anonymous player id lives (made once per device). */
export const PLAYER_KEY = "beltbattles.player.v1";
/** The async contract's bounds (ref/async-snapshot.ts): a run is 10 days; lives cap generously. */
export const MAX_DAY = 10;
export const MAX_LIVES = 9;

export interface GhostSnapshot {
  v: 1;
  rules: string; // RULES_VERSION the build fought under
  hero: HeroId;
  day: number; // 1-10
  wins: number; // wins going into this day's dusk fight
  lives: number; // lives left going into the fight
  build: Build;
  runId: string;
  playerId: string; // anonymous random id, never an account name or e-mail
  createdAt: number; // ms since epoch, client clock (informational only)
}

export const SNAPSHOT_KEYS = ["v", "rules", "hero", "day", "wins", "lives", "build", "runId", "playerId", "createdAt"] as const;

type Store = Pick<Storage, "getItem" | "setItem">;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

function buildOk(b: unknown): b is Build {
  const q = b as Build | null;
  return !!q && typeof q === "object" && !!HEROES[q.hero] && Array.isArray(q.items) && Array.isArray(q.routes)
    && Array.isArray(q.mods) && typeof q.beltCap === "number" && typeof q.hullBonus === "number";
}

/** An integer in min..max (the async contract's int(): ref/async-snapshot.ts checkSnapshot). */
const inRange = (v: unknown, min: number, max: number): boolean => isInt(v) && v >= min && v <= max;

/** Shape check of a v1 snapshot: exactly the contract's fields, ids matching ID_PATTERN, and
 *  (0.6.0c) checkSnapshot's numeric bounds exactly: day 1..MAX_DAY, wins 0..day - 1, lives
 *  1..MAX_LIVES, createdAt 0..Number.MAX_SAFE_INTEGER. */
export function isSnapshot(v: unknown): v is GhostSnapshot {
  const q = v as Raw | null;
  if (!q || typeof q !== "object" || Array.isArray(q)) return false;
  const keys = Object.keys(q);
  if (keys.length !== SNAPSHOT_KEYS.length || !SNAPSHOT_KEYS.every((k) => keys.includes(k))) return false;
  return q.v === 1 && typeof q.rules === "string" && !!HEROES[q.hero as HeroId] && inRange(q.day, 1, MAX_DAY)
    && inRange(q.wins, 0, q.day - 1) && inRange(q.lives, 1, MAX_LIVES) && buildOk(q.build) && q.build.hero === q.hero
    && typeof q.runId === "string" && ID_PATTERN.test(q.runId) && typeof q.playerId === "string"
    && ID_PATTERN.test(q.playerId) && inRange(q.createdAt, 0, Number.MAX_SAFE_INTEGER);
}

/** Any string made safe for ID_PATTERN (invalid characters become "_", at most 64 long). */
export function toId(s: unknown, fallback = "anon"): string {
  const t = String(s ?? "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
  return t.length ? t : fallback;
}

/**
 * One pool entry up to v1, or null. A v1 entry is kept as it is; a 0.6.0a entry ({ v: 1,
 * rulesVersion, losses, savedAt, ... }) becomes { rules, createdAt, playerId } with this device's
 * player id (the local pool holds this player's own earlier runs) and loses its `losses` field.
 */
export function migrateSnapshot(raw: unknown, playerId: string): GhostSnapshot | null {
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
