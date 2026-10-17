// PROFILE-UP (REQ-BFG-074 clause 4): fixtures shared by the profile-upload tests. Not a test file itself.
// A seeded PRNG (no Math.random: a failing property case replays), honest wire profiles, and a random-profile generator
// whose every output passes checkWire.

import { emptyProfile, evaluateUnlocks, type Profile } from "../src/game/profile";
import { DEFAULT_SKIN, SURFACES, stylesOf, styleKey, type Surface } from "../src/render/styles";
import { HEROES } from "../src/sim/content";
import { COUNTER_KEYS, EARLIEST_UPDATED_AT, WIRE_V, encodeWire, toWire, type WireProfile } from "../src/net/profileWire";

/** A fixed "server now" for the cap checks and the stamps of the fixtures: 2026-09-21T02:13:20Z. */
export const NOW = 1_790_000_000_000;

export const HERO_LIST: readonly string[] = Object.keys(HEROES).sort();

export interface Rng {
  next(): number; // [0, 1)
  int(n: number): number; // [0, n)
  bool(p?: number): boolean;
  pick<T>(xs: readonly T[]): T;
  subset<T>(xs: readonly T[], p?: number): T[];
}

/** mulberry32: small, fast, seedable. */
export function rng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  return {
    next, int, bool: (p = 0.5) => next() < p, pick: (xs) => xs[int(xs.length)],
    subset: (xs, p = 0.5) => xs.filter(() => next() < p),
  };
}

/** The fresh profile, as the wire form: valid once it carries a plausible updatedAt. */
export function freshWire(over: Partial<WireProfile> = {}): WireProfile {
  const p = emptyProfile();
  p.updatedAt = NOW;
  return { ...toWire(p), ...over };
}

/** A wire profile with the given counters (the rest default to 0), the unlocks those counters earn and the default
 *  picks: what a device that played this much holds. */
export function earnedWire(counters: Partial<WireProfile["counters"]> = {}, heroes: { won?: string[]; finished?: string[] } = {}, over: Partial<WireProfile> = {}): WireProfile {
  const p: Profile = emptyProfile();
  p.counters = { ...p.counters, ...counters };
  p.heroesWon = [...(heroes.won ?? [])];
  p.heroesFinished = [...(heroes.finished ?? [])];
  p.updatedAt = NOW;
  evaluateUnlocks(p);
  return { ...toWire(p), ...over };
}

/** The canonical body bytes of a wire profile. */
export const bodyOf = (w: WireProfile): Uint8Array => new TextEncoder().encode(encodeWire(w));

/** Every style unlocked (all 16), every hero in both lists, every counter at 7 digits, the longest picks: the biggest
 *  canonical form the catalogue and the hero list can make today. */
export function maximalWire(): WireProfile {
  const unlocked: string[] = [];
  const chosen = {} as Record<Surface, string>;
  for (const s of SURFACES) {
    const open = stylesOf(s).filter((x) => x.counter);
    for (const x of open) unlocked.push(styleKey(s, x.id));
    chosen[s] = open.reduce((a, b) => (b.id.length > a.id.length ? b : a)).id;
  }
  const counters = {} as WireProfile["counters"];
  for (const k of COUNTER_KEYS) counters[k] = k === "bestDay" || k === "mostBelts" ? 999 : 1_000_000;
  return { v: WIRE_V, counters, heroesWon: [...HERO_LIST], heroesFinished: [...HERO_LIST], unlocked: unlocked.sort(), chosen, updatedAt: NOW };
}

/** A random honest wire profile: counters that keep the fold relations, the unlocks they earn (a random part of them),
 *  picks that are a default or unlocked, and a stamp between 2026-01-01 and NOW. */
export function randomWire(r: Rng): WireProfile {
  const runs = r.int(61), runsFinished = r.int(runs + 1), warlordWins = r.int(31);
  const counters = {
    runs, runsFinished, flawless: r.int(runsFinished + 1), duskWins: r.bool(0.2) ? r.int(500) : r.int(70),
    bestDay: r.bool(0.2) ? r.int(40) : r.int(12), warlordWins, matriarchWins: r.int(warlordWins + 1), mostBelts: r.int(14),
  };
  const won = r.subset(HERO_LIST, r.next()), finished = r.subset(HERO_LIST, r.next());
  const full = earnedWire(counters, { won, finished });
  const unlocked = r.subset(full.unlocked, 0.5 + r.next() / 2);
  const chosen = {} as Record<Surface, string>;
  for (const s of SURFACES) {
    const mine = unlocked.filter((k) => k.startsWith(`style:${s}.`)).map((k) => k.slice(`style:${s}.`.length));
    chosen[s] = r.pick([DEFAULT_SKIN[s], ...mine]);
  }
  return { ...full, unlocked, chosen, updatedAt: EARLIEST_UPDATED_AT + r.int(NOW - EARLIEST_UPDATED_AT) };
}
