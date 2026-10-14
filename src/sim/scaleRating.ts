// SCALE-2d (REQ-BFG-098 098.6, REQ-BFG-108, REQ-BFG-106, REQ-BFG-110; BRIEF-SCALE2d D1): the bots' prices for the 12
// scaling pieces and VENOM DRIP's POISON. deckRating.ts rateDeck reads this file only while SCALE_RIGS is on (scale.ts
// scaleRules()); off, nothing here is called, so every rating, route summary and deck is byte for byte the base's.
//
// A reader's value at a hit (or its gun's shot) is its star number x the typical count at its hits on that day; the rating
// multiplies by the payloads it works a second and the fight, so x its hits per fight. The counts are SCALE-1's measured
// table (ref/scale1/data/COUNTS.md: par vs par, days 3 / 6 / 9 / 10, "hull rel." where it gives one, as 0.9.9 plays the
// hull release's ~20 s fights), WITH a feeder when the deck holds one of the reader's feeders (READER_FEEDERS: REPORT-SCALE2c
// section 6's table, from REPORT-SCALE1 3.3) and the par count without. Three counts are read off the deck instead, as the
// brief asks: your WARD (SHIELD) from your WARD BELLs, your PLATE from your PLATE sources, and the foe's POISON from your
// VENOM DRIPs (POISON's one source). Days between the anchors are read on a straight line; days before the first anchor
// read the first, days after the last read the last (the par player plays days 1-10).
// Shared, pure and dependency-light (no DOM).

import { ITEMS, POISON_DPS, SHIELD_CAP, type ReadCount, type ReadSpec } from "./content";
import { PLATE_CAP } from "./races/bastion";
import type { Build } from "./deck";
import { effectAt, starsOf } from "./stars";

/** SCALE-2d: each reader's feeders (module ids), REPORT-SCALE2c section 6 (from REPORT-SCALE1 3.3). The two POISON
 *  readers count VENOM DRIP alone: it is POISON's only source (REPORT-SCALE1 3.2), so SHOT TOWER (ROT GAUGE) and MENDING
 *  LOOM (LEECH COIL) feed nothing without it. GRUDGE ROD and TROPHY CHAIN need none (their feeders are runes, or none). */
export const READER_FEEDERS: Readonly<Record<string, readonly string[]>> = {
  quench: ["temper", "bellows", "hotswap", "embertrough"], // KINDLING
  pressure: ["splitter", "shottower"], // PRESSURE BREECH
  shieldwall: ["plateroller", "cindermail", "armorpress", "seamwelder"], // IRON WALL
  spallcatcher: ["plateroller", "wardbell", "armorpress"], // SPALL CATCHER
  keg: ["overclocker", "shottower", "splitter"], // POWDER KEG
  cindermail: ["temper", "bellows", "hotswap", "embertrough"],
  rotgauge: ["venom"],
  leechcoil: ["venom"],
  crowdpress: ["shottower", "splitter", "sorting", "doublestamp", "twinlatch", "brake"],
  aegisspike: ["wardbell"],
  grudgerod: [],
  trophychain: [],
};

/** SCALE-2d: is `id` a reader that wants a feeder (READER_FEEDERS lists one or more)? */
export function needsFeeder(id: string): boolean {
  return (READER_FEEDERS[id]?.length ?? 0) > 0;
}

/** SCALE-2d: does build b hold one of `id`'s feeders (a rig, factory or gun part in ITEMS)? A reader with no feeder list
 *  is always fed. */
export function hasFeeder(b: Pick<Build, "items" | "mods">, id: string): boolean {
  const fs = READER_FEEDERS[id];
  if (!fs || !fs.length) return true;
  const has = (def: string): boolean => fs.includes(def) && Object.prototype.hasOwnProperty.call(ITEMS, def);
  return b.items.some((p) => has(p.def)) || b.mods.some((m) => has(m.def));
}

/** A count by day: [day, value] anchors, read on a straight line between them, clamped at both ends. */
type Curve = readonly (readonly [number, number])[];
export function onCurve(c: Curve, day: number): number {
  if (day <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) {
    const [d1, v1] = c[i];
    if (day === d1) return v1;
    if (day < d1) {
      const [d0, v0] = c[i - 1];
      return v0 + ((v1 - v0) * (day - d0)) / (d1 - d0);
    }
  }
  return c[c.length - 1][1];
}

/**
 * SCALE-2d: COUNTS.md's typical counts at a reader's hit, by day, with (fed) and without (par) a feeder.
 * - foeBurn (KINDLING, CINDER MAIL), section 2 (mean at all hits; a 3 s window, so no hull-rel. figure): par 2.2 / 3.1 /
 *   4.3 / 5.9; the BURN deck (+2 TEMPER) at the lower stars where it gives two (the alt run, nearer the par field's ★1.2):
 *   6.6 / 8.0 / 15.0, day 10 as 15.0 x day 10 / day 9's main run (23.5 / 20.9). The par count needs some BURN of the
 *   deck's own: a deck that carries none reads 0 (readerCount).
 * - beltSlugs (CROWD PRESS), section 3: par 5.3 / 5.8 / 8.0 / 6.9; the slug deck 8.5 / 9.0 / 12.9 / 10.7.
 * - waiting (PRESSURE BREECH, at its gun's shot: waiting + chamber + store), REPORT-SCALE1 4 row 7: par 0.95 / 1.0 / 1.4;
 *   the slug deck 1.6 / 1.6 / 2.4 (days 3 / 6 / 9).
 * - hitsTaken (SPALL CATCHER, at its gun's shot), section 5: flat across days, hull rel. ~15 at an average hit; fed ("being
 *   hit and living": PLATE and WARD keep a deck firing into the fight's last third, ~26 hull rel.) the mean of the two,
 *   20.5. COUNTS.md has no feeder variant for this count: the fed figure is SCALE-2d's call (REPORT Findings).
 * - ownHits (POWDER KEG, this hit included), section 1: hull rel. ~24 rig hits a fight, so (24 + 1) / 2 = 12.5 at an
 *   average hit; fed (OVERCLOCKER, SHOT TOWER, SPLITTER: more hits) x1.3, the slug deck's 38-42 slugs a fight against
 *   29-32 (section 1's method).
 * - heartsLost (GRUDGE ROD) and wins (TROPHY CHAIN), section 8's run model, a 50% player at the start of the day, LAST
 *   CHANCE on: hearts 0 / 1.0 / 3.5 / 6.8 / 8.0 and wins 0 / 1.0 / 2.5 / 4.2 / 6.8 on days 1 / 3 / 6 / 9 / 12.
 * - ownShield (AEGIS SPIKE) and ownPlate (IRON WALL): par below; fed, read off the deck (shieldAtHit, plateAtHit).
 */
export const READ_PAR: Readonly<Record<ReadCount, Curve>> = {
  foeBurn: [[3, 2.2], [6, 3.1], [9, 4.3], [10, 5.9]],
  beltSlugs: [[3, 5.3], [6, 5.8], [9, 8.0], [10, 6.9]],
  waiting: [[3, 0.95], [6, 1.0], [9, 1.4]],
  hitsTaken: [[3, 15]],
  ownHits: [[3, 12.5]],
  heartsLost: [[1, 0], [3, 1.0], [6, 3.5], [9, 6.8], [12, 8.0]],
  wins: [[1, 0], [3, 1.0], [6, 2.5], [9, 4.2], [12, 6.8]],
  ownShield: [[3, 0.02], [6, 0.04], [9, 0.15], [10, 0.22]], // section 4, par SHIELD at a hit
  ownPlate: [[3, 0.4], [6, 4.6], [9, 13.2], [10, 11.5]], // section 4, par PLATE at a hit
  foePoison: [[3, 0]], // POISON's only source is VENOM DRIP (poisonAtHit)
};
export const READ_FED: Readonly<Partial<Record<ReadCount, Curve>>> = {
  foeBurn: [[3, 6.6], [6, 8.0], [9, 15.0], [10, 16.9]],
  beltSlugs: [[3, 8.5], [6, 9.0], [9, 12.9], [10, 10.7]],
  waiting: [[3, 1.6], [6, 1.6], [9, 2.4]],
  hitsTaken: [[3, 20.5]],
  ownHits: [[3, 16.25]],
};

/** SCALE-2d: SHIELD at a hit for each SHIELD a second your WARD BELLs ring (COUNTS.md 4's bell deck: every 4 s 0.28-0.31,
 *  every 2.5 s 0.49-0.60, every 2 s 0.59-0.65 at a hit: about 1.2 x the rate), at most SHIELD_CAP. */
export const SHIELD_PER_RATE = 1.2;
/** SCALE-2d: PLATE at a hit for each PLATE gained in a fight (COUNTS.md 4's PLATE deck: 296 -> 26, 745 -> 75, 1,287 -> 98,
 *  the alt run's 393 -> 38 and 913 -> 71: about 0.09), at most PLATE_CAP. */
export const PLATE_AT_HIT = 0.09;
/** SCALE-2d: the foe's POISON at a hit for each POISON a VENOM DRIP hit lands: COUNTS.md 6, ~13 hull rel. at another rig's
 *  hit for a ★1 (+1) rig, x0.64 because the sim's POISON rides the slug and lands at impact (COUNTS.md 6: 0.25-0.3 x N x T
 *  stack-seconds instead of 0.43 applied at the hit). */
export const POISON_AT_HIT = 13 * 0.64;
/** SCALE-2d: the day a rating without one reads (rateDeck with no `day`: the build screen's estimate, stokeKeep). */
export const READ_DAY_DEFAULT = 6;

/** SCALE-2d: what the deck itself brings to the counts it feeds (rateDeck builds it once per rating, switch on). */
export interface ReadCtx {
  day: number;
  /** does any of the deck's slugs carry BURN (the walk's estimate), or a DRAKE NOZZLE make it? */
  burnAny: boolean;
  /** the POISON one hit of each of the deck's VENOM DRIPs lands, summed over them at their stars */
  venom: number;
  /** SHIELD a second from the deck's WARD BELLs (and any SHIELD gear) */
  shieldRate: number;
  /** PLATE gained in a fight (rateDeck's own plating estimate; set after the route loop) */
  plateFight: number;
  fed: Map<string, boolean>;
}

/** SCALE-2d: the deck's own feeds for the counts, before the route loop (plateFight is filled after it). */
export function readCtx(b: Build, day: number, burnAny: boolean): ReadCtx {
  let venom = 0, shieldRate = 0;
  for (const p of b.items) {
    if (!Object.prototype.hasOwnProperty.call(ITEMS, p.def)) continue;
    const g = effectAt(p.def, starsOf(p)).gate;
    if (g?.poison) venom += g.poison;
  }
  for (const m of b.mods) {
    if (!Object.prototype.hasOwnProperty.call(ITEMS, m.def)) continue;
    const md = effectAt(m.def, starsOf(m)).mod;
    if (md?.shield) shieldRate += md.shield.amount / md.shield.every;
  }
  return { day, burnAny, venom, shieldRate, plateFight: 0, fed: new Map() };
}

const fedOf = (b: Build, ctx: ReadCtx, id: string): boolean => {
  let f = ctx.fed.get(id);
  if (f === undefined) ctx.fed.set(id, (f = hasFeeder(b, id)));
  return f;
};

/** SCALE-2d: the typical count reader `id` meets at its hit on ctx's day, fed or not (READ_PAR, READ_FED, and the deck's
 *  own WARD, PLATE and POISON). */
export function readerCount(b: Build, id: string, count: ReadCount, ctx: ReadCtx): number {
  const fed = fedOf(b, ctx, id), par = onCurve(READ_PAR[count], ctx.day);
  switch (count) {
    case "foeBurn": return fed ? onCurve(READ_FED.foeBurn!, ctx.day) : ctx.burnAny ? par : 0;
    case "foePoison": return POISON_AT_HIT * ctx.venom;
    case "ownShield": return fed ? Math.max(par, Math.min(SHIELD_CAP, SHIELD_PER_RATE * ctx.shieldRate)) : par;
    case "ownPlate": return fed ? Math.max(par, Math.min(PLATE_CAP, PLATE_AT_HIT * ctx.plateFight)) : par;
    default: {
      const c = READ_FED[count];
      return fed && c ? onCurve(c, ctx.day) : par;
    }
  }
}

/** SCALE-2d: a reader line's value at one hit for count `n`: `each` for every one counted (every `per`, as the expected
 *  count / per: the battle rounds down, the typical count is a mean). PLATE stops at PLATE_CAP. */
export function readValue(r: ReadSpec, n: number): number {
  const v = r.each * (r.per ? n / r.per : n);
  return r.give === "plate" ? Math.min(PLATE_CAP, v) : v;
}

/** SCALE-2d (REQ-BFG-108; COUNTS.md 6, POISON_DPS 3 a second a stack): what a VENOM DRIP hit of `poison` adds to each
 *  payload of a route whose first payload rides `time` s, in a fight of `fight` s: each stack lands and deals POISON_DPS
 *  a second to the fight's end, never decaying; over payloads landing evenly from `time` on, that is half of what is left
 *  of the fight after `time` (the rating's left() share weighs it again by the belt's start, as it does every payload). */
export function poisonGain(poison: number, fight: number, time: number): number {
  return (POISON_DPS * poison * Math.max(0, fight - time)) / 2;
}
