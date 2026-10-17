// PROFILE-UP (REQ-BFG-074 clause 4, backlog #371; REVIEW-CUSTOM1 Q2): the wire form of the player's profile, the one
// pure module the client (profileClient.ts) and the server (server/profileRoute.ts) share. Pure code: no I/O, no clock
// (the caller passes `now`), no DOM, no sim value. It holds
//   - the canonical form: exactly v, counters (the 8, in profile.ts's order), heroesWon, heroesFinished, unlocked,
//     chosen (floor, belt, panel, carrier) and updatedAt, in that key order, no spaces, sets sorted and without
//     duplicates. `seen`, `folded` and `runNew` stay on the device (they are announcements, not progress);
//   - the strict decode (400: unknown fields, wrong types, non-integers, negatives, duplicates, anything that is not the
//     canonical text; 422: a `v` newer than this build reads: the server never stores a version it cannot read, which is
//     migrateProfile's rule for the device);
//   - the plausibility caps (422, naming the field). They block garbage; they do not prove play, and they must never
//     refuse an honest profile under 1D's rules (see PLAUSIBILITY below);
//   - the merge (one pure function): counters take the max, sets the union, `chosen` follows the newer updatedAt.
// Upload only (v1): the client never merges the server's answer back (REPORT-CUSTOM1 "The upload path").

import { HEROES } from "../sim/content";
import { emptyProfile, evaluateUnlocks, styleByKey, type Counters, type Profile } from "../game/profile";
import { DEFAULT_SKIN, SURFACES, isStyleId, styleKey, type Surface } from "../render/styles";

/** The wire version this build writes and fully reads. It is the wire's own number, not the device profile's PROFILE_V: a
 *  device-side bump (REQ-BFG-003's v2) must not make every client send "v":2 to a server that reads 1. Change it only with
 *  this module's decode (tests/profileup.wire.test.ts pins it). */
export const WIRE_V = 1;

/** The signed body's byte limit. The largest canonical profile today (every style, every hero, every counter at its
 *  ceiling) is measured in tests/profileup.wire.test.ts and is under 1 KB, so 2048 leaves room for more styles and heroes.
 *  REQ-BFG-003's namespaced unlocks ("hero:...", "parts:...") would need this module's id checks extended as well (toWire
 *  sends style keys only; checkWire refuses any other). */
export const MAX_PROFILE_BYTES = 2048;

/** The counters in the canonical order (profile.ts's own list; the test pins them equal). */
export const COUNTER_KEYS: readonly (keyof Counters)[] = ["runs", "runsFinished", "flawless", "duskWins", "bestDay", "warlordWins", "matriarchWins", "mostBelts"];

// ------------------------------------------------------------------------------------------------- PLAUSIBILITY
// RUN-1 (BRIEF-RUN1): a run ends only at its 10th dusk win or at 0 hearts, with no day cap, and REQ-BFG-059 adds an
// optional ENDLESS after a win. So bestDay can pass 10 and a run's wins can pass 10: the study's `bestDay <= RUN_DAYS`
// and `duskWins <= 10 x runs` would refuse honest profiles and are NOT used. What is used:
//   (a) an absolute ceiling per counter, far past anything a person plays;
//   (b) only the cross-field relations that profile.ts's fold code makes true for every honest profile (RELATIONS);
//   (c) known ids, and `unlocked` earned by the upload's own counters and hero lists;
//   (d) an updatedAt that is a plausible clock reading.

/** bestDay ceiling: a run has no day cap (RUN-1), so no tight bound is honest; 999 days is a data-safety bound only. */
export const MAX_BEST_DAY = 999;
/** mostBelts ceiling: belts on a deck at a run's end. A deck holds a few dozen at most; 999 is a data-safety bound. */
export const MAX_MOST_BELTS = 999;
/** Ceiling of every other counter (runs, runsFinished, flawless, duskWins, warlordWins, matriarchWins): a million is
 *  decades of play, and it keeps the canonical form under its byte limit. */
export const MAX_COUNT = 1_000_000;

export function counterCeiling(k: keyof Counters): number {
  return k === "bestDay" ? MAX_BEST_DAY : k === "mostBelts" ? MAX_MOST_BELTS : MAX_COUNT;
}

/** updatedAt may not be earlier than this (2026-01-01 UTC): no profile exists before the game has a profile. */
export const EARLIEST_UPDATED_AT = Date.UTC(2026, 0, 1);
/** updatedAt may be at most this far past the server's clock (a day covers any honest clock skew). */
export const UPDATED_AT_AHEAD_MS = 86_400_000;

/** The profile as it travels (PROFILE-UP P3). `chosen` is typed loosely: a decoded body is checked by checkWire. */
export interface WireProfile {
  v: number;
  counters: Counters;
  heroesWon: string[];
  heroesFinished: string[];
  unlocked: string[];
  chosen: Record<Surface, string>;
  updatedAt: number;
}

/** A refusal with the HTTP status it carries: 400 (not a valid wire profile) or 422 (a newer version, or a cap). */
export class ProfileWireError extends Error {
  constructor(readonly status: 400 | 422, message: string) {
    super(message);
    this.name = "ProfileWireError";
  }
}

const bad = (message: string): ProfileWireError => new ProfileWireError(400, message);
const cap = (message: string): ProfileWireError => new ProfileWireError(422, message);

const HERO_IDS: ReadonlySet<string> = new Set(Object.keys(HEROES));

const setOf = (xs: readonly string[]): string[] => [...new Set(xs)].sort(); // code-unit order: no locale

// ------------------------------------------------------------------------------------------------------ the device

/** The wire form of a device profile. It sends only what the server would accept as ids: heroes the game has, styles
 *  the catalogue has that the profile's own counters earn, and a pick that is its default or unlocked (the pick the
 *  game actually shows, profile.ts chosenSkin). seen, folded and runNew are left out. */
export function toWire(p: Profile): WireProfile {
  const counters = {} as Counters;
  for (const k of COUNTER_KEYS) counters[k] = p.counters[k];
  const heroesWon = setOf(p.heroesWon.filter((h) => HERO_IDS.has(h)));
  const heroesFinished = setOf(p.heroesFinished.filter((h) => HERO_IDS.has(h)));
  const earned = earnedIds(counters, heroesWon, heroesFinished);
  const unlocked = setOf(p.unlocked.filter((id) => earned.has(id)));
  const open = new Set(unlocked);
  const chosen = {} as Record<Surface, string>;
  for (const s of SURFACES) chosen[s] = usable(s, p.chosen[s], open) ? p.chosen[s] : DEFAULT_SKIN[s];
  return { v: WIRE_V, counters, heroesWon, heroesFinished, unlocked, chosen, updatedAt: p.updatedAt };
}

// ------------------------------------------------------------------------------------------------- the canonical form

/** The canonical JSON text: fixed key order, sorted sets without duplicates, no whitespace. The client signs exactly
 *  these bytes (UTF-8) and the server accepts no other text for the same profile. */
export function encodeWire(w: WireProfile): string {
  const counters: Record<string, number> = {};
  for (const k of COUNTER_KEYS) counters[k] = w.counters[k];
  const chosen: Record<string, string> = {};
  for (const s of SURFACES) chosen[s] = w.chosen[s];
  return JSON.stringify({
    v: w.v, counters, heroesWon: setOf(w.heroesWon), heroesFinished: setOf(w.heroesFinished), unlocked: setOf(w.unlocked),
    chosen, updatedAt: w.updatedAt,
  });
}

// --------------------------------------------------------------------------------------------------- the strict decode

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

function exactKeys(o: Record<string, unknown>, keys: readonly string[], path: string): void {
  for (const k of Object.keys(o)) if (!keys.includes(k)) throw bad(`${path}${k}: unknown field`);
  for (const k of keys) if (!Object.prototype.hasOwnProperty.call(o, k)) throw bad(`${path}${k}: missing`);
}

function natural(x: unknown, name: string): number {
  if (typeof x !== "number" || !Number.isSafeInteger(x) || x < 0) throw bad(`${name}: expected a non-negative integer`);
  return x;
}

function strings(x: unknown, name: string): string[] {
  if (!Array.isArray(x)) throw bad(`${name}: expected a list`);
  const out: string[] = [];
  for (const e of x) {
    if (typeof e !== "string") throw bad(`${name}: expected a list of strings`);
    out.push(e);
  }
  for (let i = 1; i < out.length; i++) {
    if (out[i] === out[i - 1]) throw bad(`${name}: duplicate entry`);
    if (out[i] < out[i - 1]) throw bad(`${name}: not sorted (the canonical form sorts every set)`);
  }
  return out;
}

/** A parsed wire profile, shape-checked: 422 for a newer `v`, else 400 for anything that is not exactly the form. It
 *  does not apply the caps (checkWire does) and does not look at the text (decodeWire does). */
export function decodeWireValue(raw: unknown): WireProfile {
  if (!isObj(raw)) throw bad("profile: expected an object");
  const v = raw.v;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1) throw bad("v: expected an integer from 1");
  if (v > WIRE_V) throw cap(`v: version ${v} is newer than this server reads (${WIRE_V})`); // never stored: it cannot be read
  exactKeys(raw, ["v", "counters", "heroesWon", "heroesFinished", "unlocked", "chosen", "updatedAt"], "");
  if (!isObj(raw.counters)) throw bad("counters: expected an object");
  exactKeys(raw.counters, COUNTER_KEYS, "counters.");
  const counters = {} as Counters;
  for (const k of COUNTER_KEYS) counters[k] = natural(raw.counters[k], `counters.${k}`);
  if (!isObj(raw.chosen)) throw bad("chosen: expected an object");
  exactKeys(raw.chosen, SURFACES, "chosen.");
  const chosen = {} as Record<Surface, string>;
  for (const s of SURFACES) {
    const id = raw.chosen[s];
    if (typeof id !== "string") throw bad(`chosen.${s}: expected a style id`);
    chosen[s] = id;
  }
  return {
    v, counters,
    heroesWon: strings(raw.heroesWon, "heroesWon"), heroesFinished: strings(raw.heroesFinished, "heroesFinished"),
    unlocked: strings(raw.unlocked, "unlocked"), chosen, updatedAt: natural(raw.updatedAt, "updatedAt"),
  };
}

/** The request body's text -> a wire profile, or a ProfileWireError. The text must be the canonical form exactly: the
 *  client signs those bytes, and one profile has one body. */
export function decodeWire(text: string): WireProfile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw bad("profile: not JSON");
  }
  const w = decodeWireValue(raw);
  if (encodeWire(w) !== text) throw bad("profile: not in the canonical form (fixed key order, sorted sets, no spaces)");
  return w;
}

// ---------------------------------------------------------------------------------------------- the plausibility caps

/** Every style the counters and hero lists earn (profile.ts evaluateUnlocks over an empty `unlocked`: it reads the
 *  counters, heroesWon and heroesFinished and nothing else, so the check is pure over the upload's own fields). */
function earnedIds(counters: Counters, heroesWon: readonly string[], heroesFinished: readonly string[]): Set<string> {
  const p = emptyProfile();
  p.counters = { ...counters };
  p.heroesWon = [...heroesWon];
  p.heroesFinished = [...heroesFinished];
  evaluateUnlocks(p); // pushes every earned style (a default is never "unlocked")
  return new Set(p.unlocked);
}

/** RELATIONS: each is made true by ONE fold function in profile.ts alone, for every honest profile (tests/profileup.wire.test.ts
 *  drives the real fold code at random to check them):
 *  - runsFinished <= runs: foldEnd adds one to runs on every end and one to runsFinished only on "complete", in the same
 *    fold (the seed leaves runsFinished at 0);
 *  - flawless <= runs: foldEnd adds one to runs on every end, and to flawless only when the end is flawless, in the same fold;
 *  - matriarchWins <= warlordWins: foldWarlord adds to matriarchWins only inside the win that adds to warlordWins.
 *  Not used, because the fold code alone does not make them true:
 *  - flawless <= runsFinished holds at r0910-repin only through day.ts:243 flawless(run), which needs run.over === "complete";
 *    RUN-1 redefines "complete" and flawless (won with 0 losses), and a wrong relation here would refuse every honest flawless
 *    player for good, so the server asks only flawless <= runs;
 *  - duskWins against runs (a run in progress has folded dusks before its end, and a run has no win cap), bestDay against runs. */
const RELATIONS: readonly (readonly [keyof Counters, keyof Counters])[] = [
  ["runsFinished", "runs"], ["flawless", "runs"], ["matriarchWins", "warlordWins"],
];

/** Whether `id` can be worn on `surface` given the open (unlocked) style keys: a known style that is the default or open. */
function usable(surface: Surface, id: string, open: ReadonlySet<string>): boolean {
  return isStyleId(surface, id) && (id === DEFAULT_SKIN[surface] || open.has(styleKey(surface, id)));
}

/** The caps (422, one reason naming the field). `now` is the server's clock in ms. A wire profile that decodes and passes
 *  is one an honest device can make; it is not proof of play. */
export function checkWire(w: WireProfile, now: number): void {
  for (const k of COUNTER_KEYS) {
    const max = counterCeiling(k);
    if (w.counters[k] > max) throw cap(`counters.${k}: ${w.counters[k]} is over the ceiling ${max}`);
  }
  for (const [small, big] of RELATIONS) {
    if (w.counters[small] > w.counters[big]) throw cap(`counters.${small}: ${w.counters[small]} is more than counters.${big} (${w.counters[big]})`);
  }
  for (const list of ["heroesWon", "heroesFinished"] as const) {
    for (const h of w[list]) if (!HERO_IDS.has(h)) throw cap(`${list}: ${JSON.stringify(h)} is not a hero`);
  }
  for (const id of w.unlocked) {
    const s = styleByKey(id);
    if (!s || !s.style.counter) throw cap(`unlocked: ${JSON.stringify(id)} is not an unlockable style`); // a default is never unlocked
  }
  const earned = earnedIds(w.counters, w.heroesWon, w.heroesFinished);
  for (const id of w.unlocked) if (!earned.has(id)) throw cap(`unlocked: ${JSON.stringify(id)} is not earned by these counters`);
  const open = new Set(w.unlocked);
  for (const s of SURFACES) {
    if (!isStyleId(s, w.chosen[s])) throw cap(`chosen.${s}: ${JSON.stringify(w.chosen[s])} is not a style`);
    if (!usable(s, w.chosen[s], open)) throw cap(`chosen.${s}: ${JSON.stringify(w.chosen[s])} is not unlocked`);
  }
  if (w.updatedAt < EARLIEST_UPDATED_AT || w.updatedAt > now + UPDATED_AT_AHEAD_MS) {
    throw cap("updatedAt: not between 2026-01-01 and a day from now");
  }
}

// -------------------------------------------------------------------------------------------------------- the merge

/** The merge of the stored profile (null: none yet) and an upload, as one pure function (PROFILE-UP P5):
 *  - counters: the max, field by field; heroesWon, heroesFinished and unlocked: the union, sorted;
 *  - updatedAt: the max;
 *  - chosen: surface by surface, from the profile with the newer updatedAt (a tie goes to the upload), and only if that
 *    pick is the default or in the merged unlocked; otherwise the other profile's pick under the same rule; otherwise the
 *    default. For profiles that passed checkWire the first pick always holds.
 *  Counters, sets and updatedAt are commutative, associative and idempotent; `chosen` follows the newer. The result of two
 *  profiles that pass checkWire passes it too (the maxima keep every relation; the earned styles only grow with the
 *  counters). */
export function mergeWire(stored: WireProfile | null, upload: WireProfile): WireProfile {
  const a = stored ?? upload;
  const counters = {} as Counters;
  for (const k of COUNTER_KEYS) counters[k] = Math.max(a.counters[k], upload.counters[k]);
  const unlocked = setOf([...a.unlocked, ...upload.unlocked]);
  const open = new Set(unlocked);
  const newer = upload.updatedAt >= a.updatedAt ? upload : a;
  const older = newer === upload ? a : upload;
  const chosen = {} as Record<Surface, string>;
  for (const s of SURFACES) chosen[s] = [newer.chosen[s], older.chosen[s]].find((id) => usable(s, id, open)) ?? DEFAULT_SKIN[s];
  return {
    v: WIRE_V, counters,
    heroesWon: setOf([...a.heroesWon, ...upload.heroesWon]), heroesFinished: setOf([...a.heroesFinished, ...upload.heroesFinished]),
    unlocked, chosen, updatedAt: Math.max(a.updatedAt, upload.updatedAt),
  };
}
