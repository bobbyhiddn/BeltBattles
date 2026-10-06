// CUSTOM-2a (REQ-BFG-072; REVIEW-CUSTOM1 Q1, turn 9ecab1cc78e896d5): the player's profile, the one cross-run store.
// One offline key, `beltbattles.profile.v1`, holds the lifetime counters folded from each run's own records, the heroes
// that won and finished, the unlocked styles (namespaced ids: "style:floor.timber"; REQ-BFG-003 grows into the same list
// with "hero:..." and "parts:..."), the chosen styles, the unlocks already announced (`seen`: the title's NEW dot) and
// the folds already counted (`folded`: each counts once per "<runId>:<day>", across CONTINUE and reloads).
// - migrateProfile defaults every missing field. A profile with a newer `v` than this build knows is read (what it can)
//   but never written back: an older build can't wipe a newer one's progress (the trap settings.v1 has).
// - When the key is absent (or unreadable) it is seeded once from what the game kept: the local ghost pool (GHOST_KEY:
//   best day, heroes with a win, dusk wins per run, distinct runs) and, online, RUNS_KEY's finished runs. An undercount.
// - The run save is unchanged (no save version bump). Nothing here is uploaded (REVIEW-CUSTOM1 Q2: the upload is a later
//   server job). Display only: the sim never reads it, and it imports nothing from the sim but types; callers pass the
//   run's facts (RunFacts), so it reads no sim value, no sim RNG and no Math.random.

import type { HeroId } from "../sim/content";
import {
  DEFAULT_SKIN, SURFACES, earned, isStyleId, styleKey, stylesOf, type AnyStyle, type BeltId, type FloorId, type PanelId,
  type Skin, type Surface,
} from "../render/styles";

export const PROFILE_KEY = "beltbattles.profile.v1";
/** The profile version this build writes and fully knows. */
export const PROFILE_V = 1;
/** The folds remembered (each run makes at most ~16: its dusks, its warlords and its end). */
export const FOLDED_MAX = 40;
/** The keys the seed reads, as their modules name them (tests/profile.test.ts pins them equal: ghosts.ts GHOST_KEY,
 *  online.ts RUNS_KEY, save.ts SAVE_KEY). Read only. */
export const SEED_GHOST_KEY = "beltbattles.ghosts.v1";
export const SEED_RUNS_KEY = "beltbattles.runs.v1";
export const SEED_SAVE_KEY = "beltbattles.run.v7";

export interface Counters {
  runs: number;
  runsFinished: number;
  flawless: number;
  duskWins: number;
  bestDay: number;
  warlordWins: number;
  matriarchWins: number;
  mostBelts: number;
}

export interface Profile {
  v: number;
  counters: Counters;
  /** Heroes with a dusk win; heroes that finished a run. */
  heroesWon: string[];
  heroesFinished: string[];
  /** Namespaced unlock ids ("style:floor.timber"). */
  unlocked: string[];
  chosen: Skin;
  /** Unlocks already announced (the title's NEW dot). */
  seen: string[];
  /** The last FOLDED_MAX fold keys ("<runId>:<day>", "<runId>:<day>:warlord", "<runId>:end"). */
  folded: string[];
  /** The unlocks the latest run earned (the summary's NEW STYLE line). */
  runNew: { runId: string; ids: string[] } | null;
  updatedAt: number;
}

type Store = Pick<Storage, "getItem" | "setItem">;

function storage(s?: Store | null): Store | null {
  if (s) return s;
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

const COUNTERS: readonly (keyof Counters)[] = ["runs", "runsFinished", "flawless", "duskWins", "bestDay", "warlordWins", "matriarchWins", "mostBelts"];

export function emptyProfile(): Profile {
  return {
    v: PROFILE_V,
    counters: { runs: 0, runsFinished: 0, flawless: 0, duskWins: 0, bestDay: 0, warlordWins: 0, matriarchWins: 0, mostBelts: 0 },
    heroesWon: [], heroesFinished: [], unlocked: [], chosen: { ...DEFAULT_SKIN }, seen: [], folded: [], runNew: null, updatedAt: 0,
  };
}

const count = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
const strings = (x: unknown): string[] => (Array.isArray(x) ? [...new Set(x.filter((e): e is string => typeof e === "string"))] : []);
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** A stored profile, every missing or malformed field defaulted. null: not a profile at all (corrupt: the caller resets).
 *  A newer `v` keeps its number, so saveProfile knows never to write it back. */
export function migrateProfile(raw: unknown): Profile | null {
  if (!isObj(raw)) return null;
  const v = typeof raw.v === "number" && Number.isInteger(raw.v) && raw.v >= 1 ? raw.v : PROFILE_V;
  const p = emptyProfile();
  p.v = v;
  const c = isObj(raw.counters) ? raw.counters : {};
  for (const k of COUNTERS) p.counters[k] = count(c[k]);
  p.heroesWon = strings(raw.heroesWon);
  p.heroesFinished = strings(raw.heroesFinished);
  p.unlocked = strings(raw.unlocked);
  p.seen = strings(raw.seen);
  p.folded = strings(raw.folded).slice(-FOLDED_MAX);
  const ch = isObj(raw.chosen) ? raw.chosen : {};
  p.chosen = {
    floor: (isStyleId("floor", ch.floor) ? ch.floor : DEFAULT_SKIN.floor) as FloorId,
    belt: (isStyleId("belt", ch.belt) ? ch.belt : DEFAULT_SKIN.belt) as BeltId,
    panel: (isStyleId("panel", ch.panel) ? ch.panel : DEFAULT_SKIN.panel) as PanelId,
  };
  const rn = isObj(raw.runNew) ? raw.runNew : null;
  p.runNew = rn && typeof rn.runId === "string" ? { runId: rn.runId, ids: strings(rn.ids) } : null;
  p.updatedAt = count(raw.updatedAt);
  return p;
}

/** The counter a style's unlock reads: a lifetime count, or how many different heroes won or finished. */
export function counterValue(p: Profile, counter: string): number {
  if (counter === "heroesWon") return p.heroesWon.length;
  if (counter === "heroesFinished") return p.heroesFinished.length;
  return (p.counters as unknown as Record<string, number>)[counter] ?? 0;
}

/** Unlock every style the counters now earn; returns the ids newly unlocked (in catalogue order). */
export function evaluateUnlocks(p: Profile): string[] {
  const fresh: string[] = [];
  for (const surface of SURFACES) {
    for (const s of stylesOf(surface)) {
      if (!s.counter) continue; // a default is always open, never "unlocked"
      const id = styleKey(surface, s.id);
      if (!p.unlocked.includes(id) && earned(s, (c) => counterValue(p, c))) {
        p.unlocked.push(id);
        fresh.push(id);
      }
    }
  }
  return fresh;
}

/** Is this style open to the player (the default, or unlocked)? */
export function isOpen(p: Profile, surface: Surface, id: string): boolean {
  const s = stylesOf(surface).find((x) => x.id === id);
  return !!s && (!s.counter || p.unlocked.includes(styleKey(surface, id)));
}

/** What the player wears: the chosen styles where they are open, else the defaults. */
export function chosenSkin(p: Profile): Skin {
  return {
    floor: isOpen(p, "floor", p.chosen.floor) ? p.chosen.floor : DEFAULT_SKIN.floor,
    belt: isOpen(p, "belt", p.chosen.belt) ? p.chosen.belt : DEFAULT_SKIN.belt,
    panel: isOpen(p, "panel", p.chosen.panel) ? p.chosen.panel : DEFAULT_SKIN.panel,
  };
}

/** Unlocked styles not yet announced (the title's NEW dot). */
export function unseen(p: Profile): string[] {
  return p.unlocked.filter((id) => id.startsWith("style:") && !p.seen.includes(id));
}

/** A style id ("style:floor.timber") -> its catalogue entry. */
export function styleByKey(key: string): { surface: Surface; style: AnyStyle } | null {
  const m = /^style:(floor|belt|panel)\.(.+)$/.exec(key);
  if (!m) return null;
  const surface = m[1] as Surface;
  const style = stylesOf(surface).find((s) => s.id === m[2]);
  return style ? { surface, style } : null;
}

// ------------------------------------------------------------------------------------------------------- the seed

/** The seed: a fresh profile from what the game kept before profiles existed (an undercount, which errs safe). The
 *  pool's snapshots hold the hero, the day and the wins going into each dusk, per runId. The run in progress (the save's
 *  runId) is left out of `runs`: its end is folded when it ends. */
export function seedProfile(s?: Store | null): Profile {
  const p = emptyProfile();
  const st = storage(s);
  let pool: unknown = [];
  try {
    pool = JSON.parse(st?.getItem(SEED_GHOST_KEY) ?? "[]");
  } catch {
    pool = [];
  }
  let current = "";
  try {
    const save: unknown = JSON.parse(st?.getItem(SEED_SAVE_KEY) ?? "null");
    if (isObj(save) && typeof save.runId === "string") current = save.runId;
  } catch {
    current = "";
  }
  const wins = new Map<string, number>();
  if (Array.isArray(pool)) {
    for (const g of pool) {
      if (!isObj(g) || typeof g.runId !== "string" || typeof g.hero !== "string") continue;
      const w = count(g.wins), d = count(g.day);
      wins.set(g.runId, Math.max(wins.get(g.runId) ?? 0, w));
      p.counters.bestDay = Math.max(p.counters.bestDay, d);
      if (w > 0 && !p.heroesWon.includes(g.hero)) p.heroesWon.push(g.hero);
    }
  }
  for (const w of wins.values()) p.counters.duskWins += w;
  p.counters.runs = [...wins.keys()].filter((id) => id !== current).length;
  try {
    const r: unknown = JSON.parse(st?.getItem(SEED_RUNS_KEY) ?? "null");
    if (isObj(r)) p.counters.runs = Math.max(p.counters.runs, count(r.runs));
  } catch {
    /* no online count */
  }
  evaluateUnlocks(p);
  return p;
}

// ------------------------------------------------------------------------------------------------ load and save

/** Whether this build may write the profile it holds (false for a newer version's profile). */
let frozen = false;

/** The stored profile; seeded (and written) once when the key is absent or unreadable. */
export function loadProfile(s?: Store | null): Profile {
  const st = storage(s);
  let raw: string | null = null;
  try {
    raw = st?.getItem(PROFILE_KEY) ?? null;
  } catch {
    raw = null;
  }
  let p: Profile | null = null;
  if (raw !== null) {
    try {
      p = migrateProfile(JSON.parse(raw));
    } catch {
      p = null; // corrupt: reset safely (seeded below, then written)
    }
  }
  if (p) {
    frozen = p.v > PROFILE_V;
    return p;
  }
  frozen = false;
  const seeded = seedProfile(st);
  saveProfile(seeded, st);
  return seeded;
}

/** Write the profile (never a profile whose `v` is newer than this build knows). Storage errors are ignored. */
export function saveProfile(p: Profile, s?: Store | null, now = Date.now()): boolean {
  if (p.v > PROFILE_V || frozen) return false;
  const st = storage(s);
  if (!st) return false;
  try {
    p.updatedAt = now;
    st.setItem(PROFILE_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------------------------------------------ the folds

/** What a fold reads from the run (the caller passes the run's own records; nothing here reads the sim). */
export interface RunFacts {
  runId: string;
  hero: HeroId | string;
  /** The run's day now (after finishDay: the next day's, unless the run is over). */
  day: number;
  over: "complete" | "lost" | null;
  /** 10-0. */
  flawless: boolean;
  /** Belts on the deck (run.build.routes.length). */
  belts: number;
}

function fold(p: Profile, key: string, runId: string, apply: () => void): string[] {
  if (p.folded.includes(key)) return [];
  apply();
  p.folded.push(key);
  if (p.folded.length > FOLDED_MAX) p.folded.splice(0, p.folded.length - FOLDED_MAX);
  const fresh = evaluateUnlocks(p);
  if (fresh.length) {
    if (!p.runNew || p.runNew.runId !== runId) p.runNew = { runId, ids: [] };
    p.runNew.ids.push(...fresh);
  }
  return fresh;
}

/** A dusk's result (finishDay): dusk wins, the heroes with a win, the best day reached. Once per "<runId>:<day>". */
export function foldDusk(p: Profile, r: RunFacts, day: number, outcome: "win" | "loss" | "draw"): string[] {
  return fold(p, `${r.runId}:${day}`, r.runId, () => {
    if (outcome === "win") {
      p.counters.duskWins++;
      if (!p.heroesWon.includes(r.hero)) p.heroesWon.push(r.hero);
    }
    p.counters.bestDay = Math.max(p.counters.bestDay, day, r.day);
  });
}

/** A warlord's result: warlord wins and the Iron Matriarch. Once per "<runId>:<day>:warlord". */
export function foldWarlord(p: Profile, r: RunFacts, day: number, outcome: "win" | "loss" | "draw", matriarch: boolean): string[] {
  return fold(p, `${r.runId}:${day}:warlord`, r.runId, () => {
    if (outcome === "win") {
      p.counters.warlordWins++;
      if (matriarch) p.counters.matriarchWins++;
    }
  });
}

/** The run's end (complete, lost or ABANDON): runs, finished runs, 10-0, the heroes that finished, the best day and the
 *  most belts a run ended with. Once per "<runId>:end". */
export function foldEnd(p: Profile, r: RunFacts): string[] {
  return fold(p, `${r.runId}:end`, r.runId, () => {
    p.counters.runs++;
    if (r.over === "complete") {
      p.counters.runsFinished++;
      if (!p.heroesFinished.includes(r.hero)) p.heroesFinished.push(r.hero);
    }
    if (r.flawless) p.counters.flawless++;
    p.counters.bestDay = Math.max(p.counters.bestDay, r.day);
    p.counters.mostBelts = Math.max(p.counters.mostBelts, r.belts);
  });
}

/** Load, fold, save: the screens' one call. Returns the ids the fold unlocked. Never throws. */
export function commitFold(f: (p: Profile) => string[], s?: Store | null): string[] {
  try {
    const p = loadProfile(s);
    const fresh = f(p);
    saveProfile(p, s);
    return fresh;
  } catch {
    return [];
  }
}

// --------------------------------------------------------------------------------------------- CUSTOMIZE's calls

/** Wear an open style (CUSTOMIZE's tap). A locked one is refused (it can only be previewed). */
export function wear(p: Profile, surface: Surface, id: string): boolean {
  if (!isOpen(p, surface, id)) return false;
  p.chosen = { ...p.chosen, [surface]: id } as Skin;
  return true;
}

/** Every unlock is announced (CUSTOMIZE opened). */
export function markSeen(p: Profile): void {
  for (const id of unseen(p)) p.seen.push(id);
}

/** The player's styles now (the views' skin for the player's side). */
export function playerSkin(s?: Store | null): Skin {
  try {
    return chosenSkin(loadProfile(s));
  } catch {
    return { ...DEFAULT_SKIN };
  }
}

/** The styles a run unlocked (the summary's NEW STYLE lines), by name. */
export function runUnlockNames(p: Profile, runId: string): string[] {
  if (!p.runNew || p.runNew.runId !== runId) return [];
  return p.runNew.ids.map((k) => styleByKey(k)?.style.name).filter((n): n is string => !!n);
}
