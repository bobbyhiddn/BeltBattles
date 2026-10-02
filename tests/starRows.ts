// 0.8.0 T1 (backlog 315, REQ-BFG-022; ref/BRIEF-v080-T1.md): the fight and the measure of the star rows in
// tests/arsenal.decks.test.ts and tests/wave3.decks.test.ts. Not a test file itself (no .test suffix).
//
// A star row stars one copy of a module in a deck and checks that no merge step (1 -> 2 -> 3 stars) costs the deck more
// than 3% of its fighting output against a real opponent. Until T1 the rows read the mean damage dealt in the fight over
// 5 seeds, and that saturates. A deck that wins every fight deals about the opponent's hull plus overkill, whatever its
// stars, and a deck that loses every fight lives as long as the opponent lets it. Either way the row read noise and
// flipped when only the opponent's parts moved (0.6.2 TUNE-M: the longhaul, press and slagpot rows, two oracles).
//
// The fight: the row's deck at its own hull against its own opponent, whose KO is lifted by LIFT hull points (the
// hull-bonus argument tests/wave3.decks.test.ts already used, on the opponent's side only). Battle reads hull points only
// to end the fight (checkEnd) and for RIVETER's repair room (max - hp, which a bonus leaves unchanged), so this IS the
// real fight, tick for tick, up to its first KO. Past the opponent's KO it runs on, against the same opponent still
// firing, until the deck's own KO (or BATTLE_CAP).
// The measure: the damage the deck deals before it falls (Battle's stats.damage), mean over the seeds. The opponent's
// hull no longer ends the count, so it never saturates there, and it keeps survival: a part that keeps the deck standing
// longer (plating, a stall on the foe's machines) adds the damage dealt in the extra seconds. On a row the deck loses it
// is the old per-fight number exactly. The unit (damage dealt) and the 3% limit are unchanged.
// The real fight's own result (its winner, and the damage dealt when it ended) is read off the same fight for the print.
import { Battle, type SimEvent } from "../src/sim/battle";
import { BATTLE_CAP, HEROES } from "../src/sim/content";
import type { Build } from "../src/sim/deck";

/** The hull points that lift the opponent's KO: no deck deals this much in BATTLE_CAP (120 s). */
export const LIFT = 1_000_000;

/** A row's own measure (wave 3: plating gained, stall seconds saved, stamps), summed over the fight's ticks. */
export type OwnMeasure = (bt: Battle, ev: SimEvent[]) => number;

export interface StarFight {
  dmg: number; // damage dealt before the deck's own KO (or BATTLE_CAP): the measure
  t: number; // when that fight ended (s)
  own: number; // the row's own measure over that fight (0 without one)
  real: { dmg: number; win: boolean }; // the real fight: damage dealt when it ended, and whether the deck won it
}

const memo = new Map<string, StarFight>(); // identical inputs give identical fights (rows share their 1-star deck)

/** One fight of `deck` against `foe` (its KO lifted) on `seed`; see the header. */
export function starFight(deck: Build, foe: Build, seed: number, own?: OwnMeasure): StarFight {
  const key = own ? "" : JSON.stringify([deck, foe, seed]);
  const hit = key ? memo.get(key) : undefined;
  if (hit) return hit;
  const foeHull = HEROES[foe.hero].hull + foe.hullBonus;
  const bt = new Battle(deck, { ...foe, hullBonus: foe.hullBonus + LIFT }, seed);
  const [me, them] = bt.sides;
  let mine = 0;
  let real: StarFight["real"] | undefined;
  while (!bt.over) {
    bt.step();
    if (own) mine += own(bt, bt.events);
    bt.events.length = 0;
    if (real) continue;
    // Battle.checkEnd's rule on the real hulls: the deck's points are its own; the opponent's are its lifted ones less LIFT
    const p = me.hull.hp, e = foeHull - (them.hull.max - them.hull.hp);
    if (p <= 0 || e <= 0) real = { dmg: me.stats.damage, win: e <= 0 && (p > 0 || p > e) };
    else if (bt.t >= BATTLE_CAP) real = { dmg: me.stats.damage, win: p / me.hull.max > e / foeHull };
  }
  const out: StarFight = { dmg: me.stats.damage, t: bt.t, own: mine, real: real! };
  if (key) memo.set(key, out);
  return out;
}

export interface StarRow {
  dmg: number; // mean damage dealt before the deck falls: the measure the 3% rule reads
  own: number; // mean own measure
  t: number; // mean time the deck stood (s)
  real: number; // mean damage dealt in the real fight (the old measure where the opponent is the real deck)
  wins: number; // real fights won
}

/** The row at 1, 2 and 3 stars: `at(stars)` against `vs()`, one fight per seed. */
export function starRows(at: (stars: number) => Build, vs: () => Build, seeds: readonly number[], own?: OwnMeasure): StarRow[] {
  return [1, 2, 3].map((s) => {
    const deck = at(s), foe = vs();
    const fs = seeds.map((seed) => starFight(deck, foe, seed, own));
    const mean = (f: (x: StarFight) => number) => fs.reduce((a, x) => a + f(x), 0) / fs.length;
    return { dmg: mean((x) => x.dmg), own: mean((x) => x.own), t: mean((x) => x.t), real: mean((x) => x.real.dmg), wins: fs.filter((x) => x.real.win).length };
  });
}

/** One star's cell of the BB_TABLES print: the measure, then the real fights won, the real fight's damage and how long the
 *  deck stood. */
export const starCell = (x: StarRow, own = false): string =>
  `${x.dmg.toFixed(1)} (${x.wins}W, real ${x.real.toFixed(1)}, ${x.t.toFixed(1)}s${own ? `, own ${x.own.toFixed(1)}` : ""})`;
