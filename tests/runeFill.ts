// FLIP-X2 (cap's ruling 5d6d83ef57d1494c, item 5): an upload holds exactly `day` runes (validateUpload's player mode: one
// rune a dawn, `runes.length === day`, an absent field counting as 0). A test deck that is posted, or checked in the
// player mode, about something else (hull, belts, budget, joins, turrets, names, records) takes its day's runes from here.
// Not a test file itself.
// - Neutral runes only: the first `day` runes of RUNE_LIST, in catalogue order, that give the build and the purse nothing
//   (runes.ts runeGrants adds no hull, belt or gold for one on any day, and pickGold pays nothing at its dawn: that leaves
//   out the run's kinds, hull, belt, dawnGold, runeTithe and victorGold). validateBuild takes a HULL or BELT rune's amount
//   back out of hullBonus / beltCap and adds dawn gold to the budget; with neutral runes there is nothing to take out or
//   add, so every hull, belt and budget assertion means what it meant.
// - Never a sustain rune (isSustainRune: refused before the dawn of day 3 when the snapshot carries no seed) and never a
//   dormant one (DORMANT_RUNES: no dawn offers one, refused at any day).
// - They follow no offer: a snapshot carrying them must not carry a run `seed` (with a seed the server re-derives each
//   dawn's offer and refuses a rune that was not offered; without one only the count and the catalogue are checked).
// - Runes travel only in a v3 snapshot (src/net/snapshot.ts SNAPSHOT_V3); a v2 snapshot holding build.runes is refused.
import { DORMANT_RUNES, RUNE_LIST, isSustainRune, pickGold, runeGrants, type RuneDef } from "../src/sim/runes";
import { MAX_DAY } from "../src/net/snapshot";

/** A rune that gives the build and the purse nothing, on any day up to MAX_DAY (runeGrants, pickGold). */
const grantsNothing = (d: RuneDef): boolean => {
  const g = runeGrants([{ id: d.id }], MAX_DAY);
  return g.hull === 0 && g.belt === 0 && g.gold === 0 && pickGold(d, 1, true) === 0;
};

/** The neutral runes, in RUNE_LIST (catalogue) order. */
export const NEUTRAL_RUNES: readonly string[] = RUNE_LIST
  .filter((d) => grantsNothing(d) && !isSustainRune(d.id) && !DORMANT_RUNES.has(d.id))
  .map((d) => d.id);

/** The runes an upload of `day` holds in these tests: the first `day` neutral runes, as Build.runes entries. */
export function dawnRunes(day: number): { id: string }[] {
  if (!Number.isInteger(day) || day < 0 || day > NEUTRAL_RUNES.length) throw new Error(`dawnRunes: no ${day} neutral runes (${NEUTRAL_RUNES.length})`);
  return NEUTRAL_RUNES.slice(0, day).map((id) => ({ id }));
}

/** `b` holding exactly its day's runes (dawnRunes(day)). Meant for a rune-less deck: a list `b` held is replaced, but a
 *  HULL or BELT rune's amount would stay in its hullBonus / beltCap. */
export function withDawnRunes<T extends { runes?: unknown }>(b: T, day: number): T {
  return { ...b, runes: dawnRunes(day) };
}
