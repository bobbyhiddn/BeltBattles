// HULL-1d (REQ-BFG-079; BRIEF-HULL1D section 2 (h)1): THE READ-OUT'S DAY. With HULL_SCALE on, every number a player reads
// before or after a fight shows what lands on that day, so it agrees with the battle's pops: a damage amount x D(d) and a
// sustain amount (HEAL, REGEN, PLATE, the PLATE pool's cap and units) x S(d), each rounded down as it lands. The numbers
// themselves come from hullScale.ts's two read-out helpers (dmgShown, sustShown: no copied tables); this file only says
// WHICH day a text is being built for.
//
// The text builders (abilityText.ts, faces.ts, glossary.ts) keep their data-driven form ((e, x) entries, REMINDER rows): an
// entry point that knows the day (TextOpts.day, the run's) builds its text inside shownOn(day, ...), and the formatters
// below read that day. Outside one (the hero preview, the title's fight), with no day, or with the switch off, every
// number is n itself: 0.9.7's text, byte for byte. A nested entry point sets its own day (undefined: day 1's) and puts
// the outer one back.

import { dmgShown, sustShown } from "../sim/hullScale";

let day: number | undefined;

/** Build a text for the read-out's day `d` (the run's day; undefined: day 1's numbers), then put the day back as it was,
 *  even on a throw. */
export function shownOn<T>(d: number | undefined, fn: () => T): T {
  const was = day;
  day = d;
  try {
    return fn();
  } finally {
    day = was;
  }
}

/** The day the text being built is read on (undefined outside shownOn, or a text with no day). */
export const shownDay = (): number | undefined => day;

/** A damage amount (a hit, a slug, a + DAMAGE, BURN's damage a second, FRAY's bonus, a blast) on the read-out's day: n x D(d)
 *  rounded down (hullScale.ts dmgShown); the switch off or no day: n. */
export const dmgNow = (n: number): number => dmgShown(n, day);

/** A sustain amount (HEAL, REGEN, PLATE, PLATE_CAP, PLATE BREAKER's 10, SHIELD WALL's 120+) on the read-out's day: n x S(d)
 *  rounded down (hullScale.ts sustShown); the switch off or no day: n. */
export const sustNow = (n: number): number => sustShown(n, day);
