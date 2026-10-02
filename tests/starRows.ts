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
// A wave-3 row's own measure (plating gained, stall seconds saved, stamps) is not read here: it stays on P1's fight, both
// sides +3000 hull for the full 120 s (tests/wave3.decks.test.ts ownRow; the Prime's call, oracle a102b9849dffd039).
import { Battle } from "../src/sim/battle";
import { BATTLE_CAP, HEROES } from "../src/sim/content";
import type { Build } from "../src/sim/deck";

/** The hull points that lift the opponent's KO: no deck deals this much in BATTLE_CAP (120 s). */
export const LIFT = 1_000_000;

export interface StarFight {
  dmg: number; // damage dealt before the deck's own KO (or BATTLE_CAP): the measure
  t: number; // when that fight ended (s)
  real: { dmg: number; win: boolean }; // the real fight: damage dealt when it ended, and whether the deck won it
}

const memo = new Map<string, StarFight>(); // identical inputs give identical fights (rows share their 1-star deck)

/** One fight of `deck` against `foe` (its KO lifted) on `seed`; see the header. */
export function starFight(deck: Build, foe: Build, seed: number): StarFight {
  const key = JSON.stringify([deck, foe, seed]);
  const hit = memo.get(key);
  if (hit) return hit;
  const foeHull = HEROES[foe.hero].hull + foe.hullBonus;
  const bt = new Battle(deck, { ...foe, hullBonus: foe.hullBonus + LIFT }, seed);
  const [me, them] = bt.sides;
  let real: StarFight["real"] | undefined;
  while (!bt.over) {
    bt.step();
    bt.events.length = 0;
    if (real) continue;
    // Battle.checkEnd's rule on the real hulls: the deck's points are its own; the opponent's are its lifted ones less LIFT
    const p = me.hull.hp, e = foeHull - (them.hull.max - them.hull.hp);
    if (p <= 0 || e <= 0) real = { dmg: me.stats.damage, win: e <= 0 && (p > 0 || p > e) };
    else if (bt.t >= BATTLE_CAP) real = { dmg: me.stats.damage, win: p / me.hull.max > e / foeHull };
  }
  const out: StarFight = { dmg: me.stats.damage, t: bt.t, real: real! };
  memo.set(key, out);
  return out;
}

export interface StarRow {
  dmg: number; // mean damage dealt before the deck falls: the measure the 3% rule reads
  t: number; // mean time the deck stood (s)
  real: number; // mean damage dealt in the real fight (the old measure where the opponent is the real deck)
  wins: number; // real fights won
  own: number; // a wave-3 row's own measure, filled in by tests/wave3.decks.test.ts (0 here)
}

/** The row at 1, 2 and 3 stars: `at(stars)` against `vs()`, one fight per seed. */
export function starRows(at: (stars: number) => Build, vs: () => Build, seeds: readonly number[]): StarRow[] {
  return [1, 2, 3].map((s) => {
    const deck = at(s), foe = vs();
    const fs = seeds.map((seed) => starFight(deck, foe, seed));
    const mean = (f: (x: StarFight) => number) => fs.reduce((a, x) => a + f(x), 0) / fs.length;
    return { dmg: mean((x) => x.dmg), t: mean((x) => x.t), real: mean((x) => x.real.dmg), wins: fs.filter((x) => x.real.win).length, own: 0 };
  });
}

/** One star's cell of the BB_TABLES print: the measure, then the real fights won, the real fight's damage and how long the
 *  deck stood. */
export const starCell = (x: StarRow): string => `${x.dmg.toFixed(1)} (${x.wins}W, real ${x.real.toFixed(1)}, ${x.t.toFixed(1)}s)`;
