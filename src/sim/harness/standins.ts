// Stand-in pool generation (tools/genStandInPool.ts is the CLI). Per hero and day: a population
// of full-purse builds (fullPurseBuild: legal, at least 90% of maxGoldByDay), each scored against
// a fixed gauntlet of that day's full-purse builds of every pool hero (another seed; `seeds` seeds
// per pairing, both sides). Strength percentile (pct) = share of the population scoring lower
// (ties half). FB-C: the par comes from par.ts parRefs (o.par: "field" = the par player's field, the CLI default;
// absent or "heroref" = the legacy par deck, as below). Par floor: every build also plays heroRefBuild(h, day) of each pool hero (the
// game's par decks), `refSeeds` seeds x both sides; vsPar = floor(b) = its lowest win rate there.
// Eligible: pct >= band[0], vsPar >= parFloor, spend floor met, and not among the population's
// top eighth (the elites). Window: band[1] - band[0] points wide, starting at p0, the lowest
// eligible pct (at band[0] when no build lies between band[0] and p0, so a band that already
// clears the floor keeps its picks). Picks: `per` eligible builds nearest to evenly spaced
// targets across the window; par: the pick nearest the window's middle. When the window holds
// fewer than `per`: (a) widen it upward by `widen` points at a time; (b) grow the population to
// each size in `grow` (same gauntlet, deterministic); (c) allow elites; (d) take the `per`
// builds with the highest vsPar (recorded in the data's short list). Every build is normalised
// through the stand-in code first, so what is stored is exactly what was scored.
// 0.6.2 step 5 (REQ-BFG-033): o.source "caravan" (the CLI default) draws the population and the gauntlet from
// par-player runs through the game's caravan (./caravan.ts: policies typical/typical/sharp/loose by index, run seeds
// disjoint from the par field's); absent or "fullpurse" is standInCandidate exactly, as above. A caravan candidate's
// stored cost is its deck value; its spend floor counts the gold it spent (deck + rerolls + sale losses). The selection
// rules are the same for both sources. o.parBand [lo, hi] (off when absent) also requires lo <= vsPar <= hi, and (d) then
// takes the builds nearest that band. The stand-in code carries Build.turrets and route joins (./standinCode.ts), so a
// caravan deck keeps them. genStandIns' optional hooks save and load finished days (the CLI's --resume).
// Step 5 M5 (REQ-BFG-033: honesty is gold spent): a caravan pool's data module stores each pick's gold spent (spentOf:
// deck value + rerolls + sale losses, the spend floor's number) as a sixth tuple element; a full-purse pool is written
// exactly as before (five elements; its gold spent is its cost).

import { hashSeed } from "../../core/rng";
// backlog #350 (0.8.9, CATCHUP-089): the data module is tagged with the rules its pool was generated under, POOL_RULES
// (content.ts: RULES_VERSION's entry in POOL_RULES_CARRIED, else RULES_VERSION), not RULES_VERSION itself: under a
// release that carries the pool the two differ, and the generator then wrote a tag the committed data doesn't carry.
// The header keeps its label "RULES_VERSION" so a pool regenerated under its own rules is written byte for byte as before.
import { POOL_RULES, type HeroId } from "../content";
import type { Build } from "../deck";
import { buildCost, maxGoldByDay, unfusedPairs, validateBuild } from "../../net/validate";
import { decodeStandIn, encodeStandIn, standInPool } from "../standInPool";
import { FUSE_MAX, starsOf } from "../stars";
import {
  CARAVAN_MIX, CARAVAN_POLICY, caravanCandidate, caravanGauntlet, caravanGauntletSeedOf, caravanSeedOf, type CaravanMeta, type StandInSource,
} from "./caravan";
import { BOT_RUNES } from "../runes"; // RUNES-2a (REQ-BFG-058): THE switch (standInCommand prints a departure from it)
import { runeGrants } from "../runes"; // BOTS-X (REQ-BFG-058): the runes' HULL and BELT, out of a candidate's value
import { npcDayRules } from "../npcDay"; // PAR-AZ (REQ-BFG-078): the road's gold and drops in the budget check
import { fullPurseBuild, spendFloor, type FullPurse } from "./gen";
import { parRefs, type ParSource } from "./par";
import type { Cores, Factories, Stars } from "./shopper";
import { decodeStarred, encodeStarred } from "./standinCode";
import type { Job, Runner } from "./tournament";

/** Relaxation a hero/day needed: none, (a) widen, (b) grow, (c) elites, (d) best. */
export type Relax = "none" | "widen" | "grow" | "elites" | "best";

export interface StandInOpts {
  seed: number;
  pop: number; // builds per hero and day (the base population)
  band: [number, number]; // band[0]: lowest pct a pick may have; band[1] - band[0]: window width
  per: number; // picks per hero and day
  gauntlet: number; // gauntlet builds per pool hero and day
  seeds: number; // seeds per pairing (each played from both sides)
  elites: number; // report: top builds per hero of the base population ("that day's elites")
  refSeeds: number; // seeds per reference deck (heroRefBuild of each pool hero), both sides
  heroes: HeroId[];
  parFloor: number; // lowest vsPar (0-1) a pick may have
  widen: number; // (a) window widening step, pct points
  grow: number[]; // (b) population sizes tried in turn
  stars: Stars; // 0.6.1a harness v2: merge-aware candidates when "on" (the product default)
  robust: number; // (multiplier) the re-play band and sample: within robustBand of parFloor gets
  // re-played at robust x refSeeds fresh seeds (ARSENAL.md: robustBand 0.10, robust 4)
  cores?: Cores; // 0.6.1b (part 2): candidates and gauntlet buy and fit turret cores; only with stars on (absent = "off"; the CLI sets it)
  factories?: Factories; // 0.6.1c (part 3): candidates and gauntlet buy any factory the hero can buy; only with stars on (absent = "off"; the CLI sets it)
  // FB-C (REQ-BFG-026): the par the floor measures against, through par.ts parRefs. "field": the par player's field
  // (K caravan-bound decks per pool hero; vsRef = the mean win rate over the members). Absent or "heroref": the legacy
  // par deck heroRefBuild, exactly as before (pool v2.1 was generated with it). The CLI's --par defaults to "field".
  par?: ParSource;
  // step 5 (REQ-BFG-033): the population's source (./caravan.ts). Absent or "fullpurse": standInCandidate, exactly as
  // before; the CLI's --source defaults to "caravan".
  source?: StandInSource;
  // step 5 (REQ-BFG-026): off when absent. [lo, hi]: a pick also needs lo <= vsPar <= hi (CLI --par-band lo,hi).
  parBand?: [number, number];
  // RUNES-2a (REQ-BFG-058): the par player's dawn runes (player.ts PlayerOpts.botRunes) for the caravan candidates, the
  // caravan gauntlet and the par field. Absent: runes.ts BOT_RUNES, THE switch (off). CLI --bot-runes on|off.
  botRunes?: boolean;
}

/** RUNES-2a: the par player's options for o.botRunes (none when absent, so BOT_RUNES decides). */
const botOpts = (o: { botRunes?: boolean }): { botRunes?: boolean } => (o.botRunes !== undefined ? { botRunes: o.botRunes } : {});

/** FB-C: the par source of a generation (absent: the legacy heroref, so every pre-existing caller is unchanged). */
export const parSourceOf = (o: { par?: ParSource }): ParSource => o.par ?? "heroref";
/** Step 5: the population source of a generation (absent: the legacy full-purse builds). */
export const sourceOf = (o: { source?: StandInSource }): StandInSource => o.source ?? "fullpurse";

/** FB-C: the par decks of `day` for the pool heroes (parRefs), flattened, with each deck's pool-hero index. With
 *  heroref that is one deck per hero, in hero order: the legacy refs exactly. */
export function standInRefs(o: StandInOpts, day: number): { refs: Build[]; refHero: number[] } {
  const by = o.heroes.map((h) => parRefs(h, day, parSourceOf(o), undefined, botOpts(o))); // RUNES-2a: botOpts
  return { refs: by.flat(), refHero: by.flatMap((r, hi) => r.map(() => hi)) };
}

/** 0.6.1b: cores are bought only with stars on and cores on. */
const coresOf = (o: { stars: Stars; cores?: Cores }): Cores => (o.stars === "on" && o.cores === "on" ? "on" : "off");
/** 0.6.1c: factories are bought only with stars on and factories on. */
export const factoriesOf = (o: { stars: Stars; factories?: Factories }): Factories => (o.stars === "on" && o.factories === "on" ? "on" : "off");

export const ROBUST_BAND = 0.1;
export const ROBUST_MULT = 4;

/** F8 (decision D4, ARSENAL.md §9.2 "the Matriarch alone may carry a 3★"): with stars on, a stand-in
 *  candidate holds no module above 2 stars. */
export const STANDIN_MAX_STARS = 2;

/** A stand-in candidate: a full-purse build. With stars on it is merge-aware and capped: the shopper
 *  never buys a copy whose merge would go above STANDIN_MAX_STARS. Stars off: exactly v1. 0.6.1b: with
 *  cores on the cap covers cores too (Shopper.canGain previews every gain, cargo included; D4). 0.6.1c: and with
 *  factories on it covers factories (the press/drop draw and the merge lever ask canGain for each factory copy). */
export function standInCandidate(hero: HeroId, day: number, seed: number, stars: Stars, cores: Cores = "off", factories: Factories = "off"): FullPurse {
  return fullPurseBuild(hero, day, seed, spendFloor(day), 60, stars, stars === "on" ? STANDIN_MAX_STARS : FUSE_MAX, stars === "on" ? cores : "off", stars === "on" ? factories : "off");
}

/** The highest star level on a deck (1 when nothing is merged). Step 5: installed turrets count too (Build.turrets). */
export const maxStarsOf = (b: Build): number => Math.max(1, ...[...b.items, ...b.mods, ...(b.turrets ?? [])].map((p) => starsOf(p)));

export const STANDIN_DEFAULTS: StandInOpts = {
  seed: 1, pop: 64, band: [40, 60], per: 6, gauntlet: 20, seeds: 2, elites: 8, refSeeds: 10, heroes: ["furnace", "weaver"],
  parFloor: 0.5, widen: 10, grow: [128, 256], stars: "on", robust: ROBUST_MULT,
  // 0.6.1b: `cores` absent = "off" here (part 1's exact path for every pre-existing caller); the CLI's --cores
  // defaults to the --stars value (tools/genStandInPool.ts)
};

export interface Cand {
  idx: number; build: Build; code: string; cost: number; tries: number; floorMet: boolean; score: number; pct: number;
  vsRef: Partial<Record<HeroId, number>>; // win rate vs heroRefBuild(hero, day) of each pool hero
  vsPar: number; // floor(b): the lowest of vsRef
  replayed?: boolean; // 0.6.1a: the robust re-play already ran on it (F12: never twice)
  cargoGold?: number; // fix pass: fullPurseBuild's cargoGold (only when > 0, so cores on): gold in cargo, not in the deck
  caravan?: CaravanMeta; // step 5: a caravan candidate's run (policy, seed) and gold; absent for a full-purse build
}

/** Step 5: the gold a candidate spent, for the spend floor: a caravan deck's spent gold (deck value + rerolls + sale
 *  losses), else its cost. */
export const spentOf = (c: Cand): number => c.caravan?.spent ?? c.cost;

export interface HeroDay {
  hero: HeroId;
  day: number;
  budget: number;
  floor: number;
  pop: Cand[]; // the final population: the base plus any growth
  picks: Cand[]; // sorted by pct
  par: number; // index into picks
  window: [number, number]; // the final window
  relax: Relax;
  widened: boolean; // the window is wider than the band
  short: boolean; // a pick costs less than the spend floor
  elites: Cand[]; // report: the top `elites` builds of the base population
  parVsRef: Partial<Record<HeroId, number>>; // par's win rate vs heroRefBuild(hero, day)
  parVsElites: number; // par's win rate vs that day's elites of every pool hero
  robustRemoved: number; // 0.6.1a: candidates the robust re-play dropped below parFloor
  robustReplayed: number; // 0.6.1a: candidates the robust re-play took (each once)
  capAffected: number; // F8 (stars on): candidates the 2-star cap changed (the uncapped build of the same seed differs)
  capWould3: number; // F8 (stars on): candidates whose uncapped build would hold a module above 2 stars
}

export interface Selection { picks: Cand[]; par: number; window: [number, number]; widened: boolean }

/**
 * Every build is normalised through the code it is stored as, before scoring, so what is stored is
 * exactly what was scored. "off" keeps the exact v1 round trip (src/sim/standInPool.ts, untouched;
 * needed for --check byte-identity). "on" (F2) round-trips through the star-aware code of
 * ./standinCode.ts: the v1 format has no star field, and would flatten every merge to 1 star.
 */
const norm = (b: Build, stars: Stars): Build => (stars === "off" ? decodeStandIn(b.hero, encodeStandIn(b)) : decodeStarred(b.hero, encodeStarred(b)));
/** The code a candidate is stored as: v1 when "off" (all 1-star anyway), star-aware when "on". */
export const standInCodeOf = (b: Build, stars: Stars): string => (stars === "off" ? encodeStandIn(b) : encodeStarred(b));
/** The decoder that matches standInCodeOf. */
export const decodeStandInCode = (hero: HeroId, code: string, stars: Stars): Build => (stars === "off" ? decodeStandIn(hero, code) : decodeStarred(hero, code));
const round1 = (x: number) => Math.round(x * 10) / 10;
const byScore = (c: Cand[]) => [...c].sort((a, b) => b.score - a.score || a.idx - b.idx);
const winRate = (pts: number[], battles: number) => pts.reduce((s, p) => s + p, 0) / battles;

/** Strength percentile of each score within its population: lower scores + half the ties. */
export function percentiles(scores: number[]): number[] {
  const n = scores.length;
  return scores.map((s, i) => {
    let below = 0, ties = 0;
    scores.forEach((t, j) => {
      if (j !== i) {
        if (t < s) below++;
        else if (t === s) ties++;
      }
    });
    return n > 1 ? (100 * (below + ties / 2)) / (n - 1) : 50;
  });
}

/** Index of the pick nearest `mid` (the first on a tie). */
export function nearest(picks: Cand[], mid: number): number {
  let par = 0;
  picks.forEach((x, i) => {
    if (Math.abs(x.pct - mid) < Math.abs(picks[par].pct - mid)) par = i;
  });
  return par;
}

/** `per` picks spread across the band [lo, hi]; the par is the pick nearest the band's middle. */
export function pickBand(c: Cand[], band: [number, number], per: number): { picks: Cand[]; par: number; widened: boolean } {
  const [lo, hi] = band;
  const dist = (x: Cand) => (x.pct < lo ? lo - x.pct : x.pct > hi ? x.pct - hi : 0);
  let pool = c.filter((x) => dist(x) === 0);
  const widened = pool.length < per;
  if (widened) pool = [...c].sort((a, b) => dist(a) - dist(b) || a.pct - b.pct || a.idx - b.idx).slice(0, per);
  const used = new Set<number>(), picks: Cand[] = [];
  for (let k = 0; k < Math.min(per, pool.length); k++) {
    const t = lo + ((hi - lo) * (k + 0.5)) / per;
    const best = pool.filter((x) => !used.has(x.idx))
      .sort((a, b) => Math.abs(a.pct - t) - Math.abs(b.pct - t) || a.pct - b.pct || a.idx - b.idx)[0];
    used.add(best.idx);
    picks.push(best);
  }
  picks.sort((a, b) => a.pct - b.pct || a.idx - b.idx);
  return { picks, par: nearest(picks, (lo + hi) / 2), widened };
}

/** Step 5: how far vsPar lies outside o.parBand (0 inside it, and always 0 when the option is off). */
export const parBandGap = (o: Pick<StandInOpts, "parBand">, vsPar: number): number =>
  (o.parBand ? Math.max(0, o.parBand[0] - vsPar, vsPar - o.parBand[1]) : 0);

/** Builds a pick may be: pct >= band[0], vsPar >= parFloor, spend floor met, not an elite (the
 *  population's top eighth by score) unless `allowElites`. Step 5: with o.parBand, also inside the band. */
export function eligibleOf(pop: Cand[], o: StandInOpts, allowElites: boolean): Cand[] {
  const top = new Set(allowElites ? [] : byScore(pop).slice(0, Math.ceil(pop.length / 8)).map((c) => c.idx));
  return pop.filter((c) => c.floorMet && c.pct >= o.band[0] && c.vsPar >= o.parFloor && parBandGap(o, c.vsPar) === 0 && !top.has(c.idx));
}

/** The window from p0 (see the header), widened upward by `widen` until it holds `per` eligible
 *  builds; undefined when fewer than `per` builds are eligible at all. */
export function pickWindow(pop: Cand[], eligible: Cand[], o: StandInOpts): Selection | undefined {
  if (eligible.length < o.per) return undefined;
  const lo = o.band[0], w0 = o.band[1] - o.band[0];
  const p0 = Math.min(...eligible.map((c) => c.pct));
  const start = pop.some((c) => c.pct >= lo && c.pct < p0) ? p0 : lo;
  for (let w = w0; ; w += o.widen) {
    const hi = round1(Math.min(100, start + w));
    const inside = eligible.filter((c) => c.pct <= hi);
    if (inside.length >= o.per || hi >= 100) {
      const { picks, par } = pickBand(inside, [start, hi], o.per);
      return { picks, par, window: [start, hi], widened: w > w0 };
    }
  }
}

/** (d): the `per` builds (pct >= band[0], spend floor met when enough do) with the highest vsPar,
 *  lower pct first on ties; the window is the picks' pct span. Step 5: with o.parBand, the builds nearest the band
 *  first (then the highest vsPar); without it the order is exactly as before. */
export function pickBest(pop: Cand[], o: StandInOpts): Selection {
  const high = pop.filter((c) => c.pct >= o.band[0]), met = high.filter((c) => c.floorMet);
  const src = met.length >= o.per ? met : high.length >= o.per ? high : pop;
  const picks = [...src].sort((a, b) => parBandGap(o, a.vsPar) - parBandGap(o, b.vsPar) || b.vsPar - a.vsPar || a.pct - b.pct || a.idx - b.idx).slice(0, o.per)
    .sort((a, b) => a.pct - b.pct || a.idx - b.idx);
  const window: [number, number] = [picks[0].pct, picks[picks.length - 1].pct];
  return { picks, par: nearest(picks, (window[0] + window[1]) / 2), window, widened: window[1] - window[0] > o.band[1] - o.band[0] };
}

/** A candidate the robust re-play takes: it clears the floor now, by at most ROBUST_BAND (F7: a
 *  candidate below the floor was never eligible, so re-playing it could only promote it), and it
 *  was not re-played before (F12: a grow step re-ranks the population, it doesn't re-play it). */
export const robustBorderline = (c: Cand, o: StandInOpts): boolean => {
  const d = c.vsPar - o.parFloor;
  return !c.replayed && d >= 0 && d <= ROBUST_BAND;
};

/**
 * Robust floor (0.6.1a, ARSENAL.md §9.2): a candidate whose vsPar clears parFloor by at most
 * ROBUST_BAND (0.10) is re-played against both par decks at `o.robust` x refSeeds fresh seeds (a
 * different seed stream from the original refSeeds sample), once. Its vsPar is recomputed over ALL
 * its par battles (the original refSeeds sample plus this re-play, combined per reference hero, then
 * the minimum across references) and stays there; it is "removed" (no longer eligible) when that
 * combined vsPar falls below parFloor. Mutates `pop`'s candidates in place so the caller's normal
 * eligibleOf/pickWindow picks up the change.
 */
export async function robustReplay(o: StandInOpts, hero: HeroId, day: number, pop: Cand[], refs: Build[], run: Runner, refHero: number[] = refs.map((_, r) => r)): Promise<{ removed: number; battles: number; replayed: number }> {
  const borderline = pop.filter((c) => robustBorderline(c, o));
  if (!borderline.length) return { removed: 0, battles: 0, replayed: 0 };
  const n = Math.max(1, Math.round(o.robust)) * o.refSeeds;
  const field = [...refs, ...borderline.map((c) => c.build)];
  const jobs: Job[] = borderline.flatMap((c, i) =>
    refs.map((_, r): Job => ({ a: refs.length + i, b: r, seeds: Array.from({ length: n }, (_, k) => hashSeed("standin-robust", o.seed, hero, day, c.idx, r, k)), day }))); // HULL-1a: the day
  const pts = await run(field, jobs);
  // FB-C: a hero's par may be several decks (the par field): its battles are summed over its members; one deck per
  // hero (heroref, refHero = [0, 1]) is the legacy arithmetic exactly
  const members = o.heroes.map((_, hi) => refHero.filter((x) => x === hi).length);
  let removed = 0;
  borderline.forEach((c, i) => {
    const combined = o.heroes.map((h, hi) => {
      const origBattles = o.refSeeds * 2 * members[hi], replayBattles = n * 2 * members[hi];
      const origWins = (c.vsRef[h] ?? 0) * origBattles;
      let replayWins = 0;
      refs.forEach((_, r) => { if (refHero[r] === hi) replayWins += pts[i * refs.length + r]; });
      return (origWins + replayWins) / (origBattles + replayBattles);
    });
    c.vsPar = Math.min(...combined);
    c.replayed = true;
    if (c.vsPar < o.parFloor) removed++; // it cleared the floor before the re-play (robustBorderline)
  });
  return { removed, battles: jobs.length * n * 2, replayed: borderline.length }; // every job: n seeds x both sides
}

/** Step 5: one finished day of a generation (every pool hero's HeroDay) and the battles it played. */
export interface DayResult { days: HeroDay[]; battles: number }
/** Step 5: save and load finished days (the CLI's --resume). A day's work depends on nothing but the options and the
 *  day, so a loaded day is exactly the day the generation would compute. */
export interface GenHooks {
  load?: (day: number) => DayResult | undefined;
  save?: (day: number, r: DayResult) => void;
}

/** BOTS-X (REQ-BFG-058; RUNES-2a 3 step 2): the bought deck's value, as ./caravan.ts caravanDeck values a candidate and
 *  validate.ts budgets a deck: buildCost with the HULL and BELT its runes gave taken out of hullBonus / beltCap (they
 *  don't depend on the day). Without runes (or without a HULL or BELT rune) exactly buildCost(b).total. */
export function boughtCost(b: Build): number {
  const grant = runeGrants(b.runes, 0);
  return (grant.hull || grant.belt ? buildCost({ ...b, hullBonus: b.hullBonus - grant.hull, beltCap: b.beltCap - grant.belt }) : buildCost(b)).total;
}

/** Step 5: a caravan candidate as the generator scores it: its deck normalised through the stored code (Build.turrets,
 *  joins and, BOTS-X, Build.runes pass through), its value as the cost, its run's gold (spend floor) and meta. BOTS-X:
 *  the value is the bought deck's (boughtCost), as caravanDeck's, so a rune's HULL or BELT is not charged as plating
 *  or crates; a rune-less deck costs buildCost exactly as before. */
export function caravanCand(idx: number, d: { build: Build; floorMet: boolean; meta: CaravanMeta }, stars: Stars = "on"): Cand {
  if (stars !== "on") throw new Error("the caravan source needs stars on: the par player merges its copies");
  const build = norm(d.build, stars);
  return { idx, build, code: standInCodeOf(build, stars), cost: boughtCost(build), tries: 1, floorMet: d.floorMet, score: 0, pct: 0, vsRef: {}, vsPar: 0, caravan: { ...d.meta } };
}

export async function genStandIns(o: StandInOpts, run: Runner, log?: (m: string) => void, hooks?: GenHooks): Promise<{ days: HeroDay[]; battles: number }> {
  const out: HeroDay[] = [];
  let battles = 0;
  const per = o.seeds * 2;
  const seedsFor = (...parts: (string | number)[]) => Array.from({ length: o.seeds }, (_, k) => hashSeed("standin-battle", o.seed, ...parts, k));
  const caravan = sourceOf(o) === "caravan";
  if (caravan && o.stars !== "on") throw new Error("the caravan source needs stars on: the par player merges its copies");
  for (let day = 1; day <= 10; day++) {
    const saved = hooks?.load?.(day);
    if (saved) {
      out.push(...saved.days);
      battles += saved.battles;
      log?.(`day ${day}: loaded (${saved.battles} battles)`);
      continue;
    }
    const before = battles;
    // step 5: the caravan gauntlet is typical par-player decks of its own seeds (./caravan.ts)
    const gauntlet = o.heroes.flatMap((g) => Array.from({ length: o.gauntlet }, (_, i) => norm(caravan ? caravanGauntlet(g, day, o.seed, i, o.botRunes)
      : fullPurseBuild(g, day, hashSeed("standin-gauntlet", o.seed, g, day, i), spendFloor(day), 60, o.stars, FUSE_MAX, coresOf(o), factoriesOf(o)).build, o.stars)));
    // FB-C: the par decks through par.ts parRefs (heroref: heroRefBuild of each pool hero, as before)
    const { refs, refHero } = standInRefs(o, day);
    const G = gauntlet.length, R = refs.length;
    const dayOut: HeroDay[] = [];
    for (const hero of o.heroes) {
      const refSeeds = refs.map((_, r) => Array.from({ length: o.refSeeds }, (_, k) => hashSeed("standin-ref", o.seed, hero, day, r, k)));
      let capAffected = 0, capWould3 = 0;
      // builds from..to-1 of this hero/day's population, scored vs the gauntlet and measured vs the references
      const grow = async (from: number, to: number): Promise<Cand[]> => {
        const c: Cand[] = Array.from({ length: to - from }, (_, k) => {
          if (caravan) {
            // step 5: candidate idx is its policy's run (./caravan.ts), capped at 2 stars; F8 report: the same player's
            // run without the cap
            const idx = from + k, d = caravanCandidate(hero, day, o.seed, idx, STANDIN_MAX_STARS, o.botRunes);
            const free = caravanCandidate(hero, day, o.seed, idx, FUSE_MAX, o.botRunes).build;
            if (encodeStarred(free) !== encodeStarred(d.build)) capAffected++;
            if (maxStarsOf(free) > STANDIN_MAX_STARS) capWould3++;
            return caravanCand(idx, d, o.stars);
          }
          const idx = from + k, seed = hashSeed("standin-pop", o.seed, hero, day, idx), f = standInCandidate(hero, day, seed, o.stars, coresOf(o), factoriesOf(o));
          if (o.stars === "on") {
            // F8 report: the same candidate without the 2-star cap; did the cap change it?
            const free = fullPurseBuild(hero, day, seed, spendFloor(day), 60, o.stars, FUSE_MAX, coresOf(o), factoriesOf(o)).build;
            if (encodeStarred(free) !== encodeStarred(f.build)) capAffected++;
            if (maxStarsOf(free) > STANDIN_MAX_STARS) capWould3++;
          }
          const build = norm(f.build, o.stars);
          return { idx, build, code: standInCodeOf(build, o.stars), cost: f.cost, tries: f.tries, floorMet: f.floorMet, score: 0, pct: 0, vsRef: {}, vsPar: 0, ...(f.cargoGold ? { cargoGold: f.cargoGold } : {}) };
        });
        const field = [...gauntlet, ...refs, ...c.map((x) => x.build)];
        const jobs: Job[] = c.flatMap((x, i) => [
          ...gauntlet.map((_, j): Job => ({ a: G + R + i, b: j, seeds: seedsFor(hero, day, x.idx, j), day })), // HULL-1a: the day
          ...refs.map((_, r): Job => ({ a: G + R + i, b: G + r, seeds: refSeeds[r], day })),
        ]);
        const pts = await run(field, jobs);
        battles += c.length * (G * per + R * o.refSeeds * 2);
        c.forEach((x, i) => {
          const at = i * (G + R);
          x.score = winRate(pts.slice(at, at + G), G * per);
          // vsRef[h]: the win rate over every par deck of hero h (one deck with heroref: exactly the legacy rate)
          o.heroes.forEach((h, hi) => {
            let sum = 0, m = 0;
            refs.forEach((_, r) => { if (refHero[r] === hi) { sum += pts[at + G + r]; m++; } });
            x.vsRef[h] = sum / (m * o.refSeeds * 2);
          });
          x.vsPar = Math.min(...o.heroes.map((h) => x.vsRef[h]!));
        });
        return c;
      };
      const rank = (pop: Cand[]) => percentiles(pop.map((c) => c.score)).forEach((p, i) => (pop[i].pct = round1(p)));
      const pop = await grow(0, o.pop);
      rank(pop);
      // 0.6.1a robust floor: a candidate whose vsPar clears parFloor by at most ROBUST_BAND is
      // re-played (once) at o.robust x refSeeds fresh seeds; only "on" (off must stay v1-exact for --check).
      let robustRemoved = 0, robustReplayed = 0;
      if (o.stars === "on") {
        const r = await robustReplay(o, hero, day, pop, refs, run, refHero);
        robustRemoved = r.removed;
        robustReplayed = r.replayed;
        battles += r.battles;
      }
      let relax: Relax = "none";
      let sel = pickWindow(pop, eligibleOf(pop, o, false), o);
      if (sel?.widened) relax = "widen";
      for (const n of o.grow) {
        if (sel || n <= pop.length) continue;
        pop.push(...(await grow(pop.length, n)));
        rank(pop);
        if (o.stars === "on") {
          const r = await robustReplay(o, hero, day, pop, refs, run, refHero); // only the grown candidates (F12)
          robustRemoved += r.removed;
          robustReplayed += r.replayed;
          battles += r.battles;
        }
        sel = pickWindow(pop, eligibleOf(pop, o, false), o);
        relax = "grow";
      }
      if (!sel) {
        sel = pickWindow(pop, eligibleOf(pop, o, true), o);
        relax = "elites";
      }
      if (!sel) {
        sel = pickBest(pop, o);
        relax = "best";
      }
      const { picks, par, window, widened } = sel;
      const elites = byScore(pop.slice(0, o.pop)).slice(0, o.elites);
      const floor = spendFloor(day);
      dayOut.push({
        hero, day, budget: maxGoldByDay(day), floor, pop, picks, par, window, relax, widened, short: picks.some((p) => spentOf(p) < floor),
        elites, parVsRef: { ...picks[par].vsRef }, parVsElites: 0, robustRemoved, robustReplayed, capAffected, capWould3,
      });
      log?.(`${hero} day ${day}: ${relax}, window ${window.join("-")} of ${pop.length}; picks pct ${picks.map((p) => p.pct).join(", ")}; vsPar ${picks.map((p) => p.vsPar).join(", ")}${robustRemoved ? `; robust re-play removed ${robustRemoved}` : ""}`);
    }
    // the par against that day's elites of every pool hero (report only)
    for (const hd of dayOut) {
      const elites = dayOut.flatMap((x) => x.elites.map((e) => e.build));
      const jobs: Job[] = elites.map((_, e) => ({ a: 0, b: 1 + e, seeds: seedsFor("elite", hd.hero, day, e), day })); // HULL-1a: the day
      const pts = await run([hd.picks[hd.par].build, ...elites], jobs);
      battles += jobs.length * per;
      hd.parVsElites = winRate(pts, jobs.length * per);
    }
    out.push(...dayOut);
    hooks?.save?.(day, { days: dayOut, battles: battles - before });
  }
  return { days: out, battles };
}

/** A pool's decks for (hero, day). */
export type PicksOf = (hero: HeroId, day: number) => Build[];
export interface VersusRow { day: number; rate: number; battles: number }

/** Report only: for each day, every deck of `a.picks(a.hero, day)` against every deck of
 *  `b.picks(b.hero, day)`, `seeds` seeds x both sides; A's win rate. Two getters (F3): A and B may
 *  come from different pools, and A and B may be the same hero. */
export async function versus(o: StandInOpts, a: { hero: HeroId; picks: PicksOf }, b: { hero: HeroId; picks: PicksOf }, run: Runner): Promise<VersusRow[]> {
  const out: VersusRow[] = [];
  for (let day = 1; day <= 10; day++) {
    const A = a.picks(a.hero, day), B = b.picks(b.hero, day);
    const jobs: Job[] = A.flatMap((_, i) => B.map((_, j): Job => ({
      a: i, b: A.length + j, seeds: Array.from({ length: o.seeds }, (_, k) => hashSeed("standin-pvp", o.seed, day, i, j, k)), day, // HULL-1a
    })));
    const pts = await run([...A, ...B], jobs);
    out.push({ day, rate: winRate(pts, jobs.length * o.seeds * 2), battles: jobs.length * o.seeds * 2 });
  }
  return out;
}

/** Report only: for each day, every pick of heroes[0] against every pick of heroes[1], `seeds`
 *  seeds x both sides; heroes[0]'s win rate. `picks(hero, day)` supplies the decks (one pool). */
export async function poolVsPool(o: StandInOpts, picks: PicksOf, run: Runner): Promise<VersusRow[]> {
  const [h0, h1] = o.heroes;
  return versus(o, { hero: h0, picks }, { hero: h1, picks }, run);
}

export interface VersusTable { a: HeroId; aPool: "v2" | "v1.1"; b: HeroId; bPool: "v2" | "v1.1"; rows: VersusRow[] }

/** The shipped pool v1.1's decks (src/sim/standInPoolData.ts, untouched). */
export const shippedPicks: PicksOf = (h, d) => standInPool(h, d).map((e) => e.build);

/**
 * F3: the stars-on dry pool v2 (`days`) against the shipped pool v1.1, per day: heroes[0] v2 vs
 * heroes[0] v1.1, heroes[1] v2 vs heroes[1] v1.1, heroes[0] v2 vs heroes[1] v1.1 and heroes[1] v2
 * vs heroes[0] v1.1 (A = v2, B = v1.1), then the reference heroes[0] v1.1 vs heroes[1] v1.1 (the
 * shipped pool against itself, as --versus prints it). Plus v2 vs v2 (poolVsPool on the dry picks).
 */
export async function dryVersus(o: StandInOpts, days: HeroDay[], run: Runner, shipped: PicksOf = shippedPicks): Promise<{ v2v2: VersusRow[]; tables: VersusTable[] }> {
  const v2: PicksOf = (h, d) => days.find((x) => x.hero === h && x.day === d)?.picks.map((p) => p.build) ?? [];
  const [h0, h1] = o.heroes;
  const v2v2 = await poolVsPool(o, v2, run);
  const tables: VersusTable[] = [];
  for (const [a, b] of [[h0, h0], [h1, h1], [h0, h1], [h1, h0]] as const) {
    tables.push({ a, aPool: "v2", b, bPool: "v1.1", rows: await versus(o, { hero: a, picks: v2 }, { hero: b, picks: shipped }, run) });
  }
  tables.push({ a: h0, aPool: "v1.1", b: h1, bPool: "v1.1", rows: await versus(o, { hero: h0, picks: shipped }, { hero: h1, picks: shipped }, run) });
  return { v2v2, tables };
}

/** Canonical command for the header: every generation option explicit, no --workers/--out/--check. */
export function standInCommand(o: StandInOpts): string {
  const g = o.gauntlet !== STANDIN_DEFAULTS.gauntlet ? ` --gauntlet ${o.gauntlet}` : "";
  // 0.6.1b: --cores is printed only when it departs from its default (on with stars on); stars off never
  // prints it, so the committed v1.1 module's header (--check) is unchanged.
  const c = o.stars === "on" && coresOf(o) === "off" ? " --cores off" : "";
  // 0.6.1c, on the 0.6.1 release: --factories is printed when it is ON (stars on + factories on), and never with
  // factories off or stars off. The shipped pool v2 (the flip) was generated before --factories existed, so its
  // header has no --factories: `--check --factories off` regenerates exactly that header, and a factories-on
  // pool's header says --factories on, whatever the default is.
  const f = factoriesOf(o) === "on" ? " --factories on" : "";
  // FB-C: --par is printed for the par field and never for the legacy heroref par, so pool v2.1's header (generated
  // before --par existed, against heroRefBuild) is regenerated exactly by `--check --par heroref`
  // step 5: ... except with the caravan source, whose header must replay on its own: it prints --par heroref too
  const legacy = sourceOf(o) === "fullpurse" && parSourceOf(o) === "heroref";
  const p = parSourceOf(o) === "field" ? " --par field" : legacy ? "" : " --par heroref";
  // step 5: --source is printed for every pool but the legacy one (full purse against heroRefBuild: pool v2.1, whose
  // header predates the flag and is regenerated by `--check --par heroref --source fullpurse`); --par-band when set
  const s = legacy ? "" : ` --source ${sourceOf(o)}`;
  const band = o.parBand ? ` --par-band ${o.parBand[0]},${o.parBand[1]}` : "";
  // RUNES-2a: --bot-runes only when it departs from runes.ts BOT_RUNES, so every header written so far stays as it is
  const br = o.botRunes !== undefined && o.botRunes !== BOT_RUNES ? ` --bot-runes ${o.botRunes ? "on" : "off"}` : "";
  return `npm run standins -- --seed ${o.seed} --pop ${o.pop} --band ${o.band[0]},${o.band[1]} --per ${o.per} --par-floor ${round1(o.parFloor * 100)}${g}${c}${f}${p}${s}${band}${br}`;
}

const r4 = (x: number) => Number(x.toFixed(4));

/** One tuple as written in a data module: hero, day, position, cost and build code. Step 5 M5: `spent`, the sixth
 *  element, when the tuple has one (a caravan pool). */
export interface WrittenPick { hero: HeroId; day: number; i: number; cost: number; code: string; spent?: number }

/** Parse the picks back out of dataModuleText's output (what is WRITTEN, not what is in memory). */
export function writtenPicks(text: string): WrittenPick[] {
  const out: WrittenPick[] = [];
  let hero: HeroId | undefined, day = 0, i = 0;
  for (const line of text.split("\n")) {
    const h = /^ {4}([a-z]+): \[$/.exec(line);
    if (h) { hero = h[1] as HeroId; continue; }
    const d = /^ {6}\[\d+, \[ \/\/ day (\d+):/.exec(line);
    if (d) { day = Number(d[1]); i = 0; continue; }
    const t = /^ {8}\[(\d+), [-\d.]+, [-\d.]+, ("(?:[^"\\]|\\.)*"), [-\d.]+(?:, (\d+))?\],$/.exec(line);
    if (t && hero) out.push({ hero, day, i: i++, cost: Number(t[1]), code: JSON.parse(t[2]) as string, ...(t[3] !== undefined ? { spent: Number(t[3]) } : {}) });
  }
  return out;
}

/**
 * The stars-on invariant on what is WRITTEN (patch 0006's guard, F2): every tuple of `text` decodes
 * (the star-aware decoder) to exactly the deck that was scored (same JSON), its stored cost is
 * buildCost of that deck, and the deck passes validateBuild, has no unfused pair and fits the day's
 * gold. Step 5 M5: a caravan pool's tuple stores the scored candidate's gold spent (spentOf), a
 * full-purse pool's stores none. Returns one message per problem (empty: the module is what was scored).
 * BOTS-X (REQ-BFG-058): the cost and the day's gold are the bought deck's, as caravanCand stores it (boughtCost: its
 * runes' HULL and BELT out) against maxGoldByDay + its runes' dawn gold (runeGrants), as validate.ts budgets a deck;
 * without runes both are exactly as before.
 */
export function writtenProblems(o: StandInOpts, days: HeroDay[], text: string): string[] {
  const got = writtenPicks(text), problems: string[] = [];
  const want = days.flatMap((hd) => hd.picks.map((p, i) => ({ hd, p, i })));
  if (got.length !== want.length) problems.push(`the module holds ${got.length} picks, the run made ${want.length}`);
  for (const { hd, p, i } of want) {
    const w = got.find((x) => x.hero === hd.hero && x.day === hd.day && x.i === i);
    const at = `stand-in ${hd.hero} d${hd.day} #${p.idx}`;
    if (!w) { problems.push(`${at}: not in the written module`); continue; }
    let back: Build;
    try { back = decodeStandInCode(hd.hero, w.code, o.stars); } catch (e) { problems.push(`${at}: stored code does not decode (${String(e)})`); continue; }
    if (JSON.stringify(back) !== JSON.stringify(p.build)) problems.push(`${at}: stored code decodes to a different deck than the one scored (cost ${buildCost(back).total} vs ${buildCost(p.build).total})`);
    if (boughtCost(back) !== w.cost) problems.push(`${at}: stored cost ${w.cost} != boughtCost of the stored deck ${boughtCost(back)}`); // BOTS-X: boughtCost
    // step 5 M5: a caravan pool stores the gold spent the spend floor counted; a full-purse pool stores no sixth element
    const spent = sourceOf(o) === "caravan" ? spentOf(p) : undefined;
    if (w.spent !== spent) problems.push(`${at}: stored spent ${w.spent ?? "(none)"} != the scored candidate's gold spent ${spent ?? "(none: a full-purse pool stores five elements)"}`);
    const v = validateBuild(back, hd.day);
    if (!v.ok) problems.push(`${at}: stored deck is invalid: ${v.errors.join("; ")}`);
    if (o.stars === "on") for (const u of unfusedPairs(back)) problems.push(`${at}: stored deck has an ${u}`);
    if (o.stars === "on" && maxStarsOf(back) > STANDIN_MAX_STARS) problems.push(`${at}: stored deck holds a ${maxStarsOf(back)}-star module (stand-ins stop at ${STANDIN_MAX_STARS})`);
    // fix pass: the deck + the candidate's cargo (a stored code holds the deck only; cargoGold is 0 unless cores on)
    // BOTS-X: the bought deck against the day's gold plus its runes' dawn gold
    // PAR-AZ (REQ-BFG-078; BRIEF-PARAZ 1 (a)7): with NPC_DAY on, plus the road's warlord gold and drops (caravan.ts
    // CaravanMeta.road), as validate.ts counts an upload's road; off, exactly as before
    if (boughtCost(back) + (p.cargoGold ?? 0) > maxGoldByDay(hd.day) + runeGrants(back.runes, hd.day).gold + (npcDayRules() ? p.caravan?.road ?? 0 : 0)) problems.push(`${at}: stored deck${p.cargoGold ? ` + cargo ${p.cargoGold} g` : ""} costs more than maxGoldByDay`);
  }
  return problems;
}

/** Step 5: the population lines of a caravan pool's header (./caravan.ts). */
function caravanHeader(o: StandInOpts): string[] {
  const top = Math.max(o.pop, ...o.grow) - 1;
  const loose = Object.entries(CARAVAN_POLICY.loose.tune ?? {}).map(([k, v]) => `${k} ${v}`).join(", ");
  return [
    `// Seed ${o.seed}; RULES_VERSION ${POOL_RULES}; ${o.per} picks per hero and day. Population: ${o.pop} caravan-bound decks per`,
    "// hero and day (REQ-BFG-033, src/sim/harness/caravan.ts): the day's dusk deck of a par-player run through the game's",
    "// caravan (player.ts playerRun: offered parts at the offer price, paid rerolls; stand-ins stop at 2 stars), one run",
    `// per candidate for every day; policies ${CARAVAN_MIX.join(", ")} by index (loose: typical with ${loose}); run seeds`,
    `// ${caravanSeedOf(o.seed, 0)}-${caravanSeedOf(o.seed, top)}. Spend floor: the gold spent (deck + rerolls + sale losses) is at least 90% of maxGoldByDay.`,
    `// Scored against a gauntlet of ${o.gauntlet} typical par-player decks per pool hero (run seeds ${caravanGauntletSeedOf(o.seed, 0)}-${caravanGauntletSeedOf(o.seed, Math.max(0, o.gauntlet - 1))}), ${o.seeds} seeds`,
    "// x both sides per pairing; pct = strength percentile inside the population.",
  ];
}

/** The generated data module (src/sim/standInPoolData.ts), byte-stable for the same options. Step 5 M5: a caravan
 *  pool's tuples carry a sixth element, spent (spentOf: the gold the pick's run spent on it), and its header and its
 *  StandInTuple say so; a full-purse pool is written exactly as before. */
export function dataModuleText(o: StandInOpts, days: HeroDay[]): string {
  const caravan = sourceOf(o) === "caravan";
  const L = [
    "// GENERATED by tools/genStandInPool.ts; do not edit by hand. Regenerate, or verify with --check:",
    `//   ${standInCommand(o)}`,
    ...(sourceOf(o) === "caravan" ? caravanHeader(o) : [
      `// Seed ${o.seed}; RULES_VERSION ${POOL_RULES}; ${o.per} picks per hero and day. Population: ${o.pop} full-purse builds per`,
      `// hero and day (each costing at least 90% of maxGoldByDay), scored against a gauntlet of ${o.gauntlet} builds per pool`,
      `// hero, ${o.seeds} seeds x both sides per pairing; pct = strength percentile inside the population.`,
    ]),
    ...(parSourceOf(o) === "field" ? [
      `// Par floor: vsPar = the build's lowest mean win rate against the par field of each pool hero h (par.ts parRefs:`,
      `// the par player's decks of seeds 1-12), ${o.refSeeds} seeds x both sides per member. A pick needs vsPar >= ${o.parFloor}, pct >= ${o.band[0]}, and must not be among`,
    ] : [
      `// Par floor: vsPar = the build's lowest win rate against heroRefBuild(h, day) of each pool hero h (the`,
      `// par decks), ${o.refSeeds} seeds x both sides. A pick needs vsPar >= ${o.parFloor}, pct >= ${o.band[0]}, and must not be among`,
    ]),
    `// the population's top eighth (the elites). Picks spread across a ${o.band[1] - o.band[0]}-point window that starts at the`,
    `// lowest eligible pct (at ${o.band[0]} when no build lies below it); par = the pick nearest the window's middle.`,
    `// Fewer than ${o.per} eligible in the window: (a) widen it upward by ${o.widen} points at a time, (b) grow the population`,
    `// to ${o.grow.join(", then ")} (same gauntlet), (c) allow elites, (d) take the ${o.per} builds with the highest vsPar (in short).`,
    ...(o.parBand ? [`// Par band (--par-band): a pick also needs ${o.parBand[0]} <= vsPar <= ${o.parBand[1]}; (d) then takes the builds nearest the band.`] : []),
    `// Tuples are [cost (gold), pct, score (win rate vs the gauntlet), build code, vsPar (0-1)${caravan ? ", spent (gold)" : ""}]; each day is`,
    ...(o.stars === "off" ? [
      "// [par index, entries sorted by pct, window [lo, hi], population size, relaxation]. src/sim/standInPool.ts",
      "// decodes the build codes.",
    ] : [
      "// [par index, entries sorted by pct, window [lo, hi], population size, relaxation]. The build codes are",
      "// star-aware (src/sim/harness/standinCode.ts: the v1 format plus *2 or *3 on an item or module word; no",
      "// suffix is 1 star); src/sim/standInPool.ts decodes them with decodeStarred (since the 0.6.1 flip).",
      ...(caravan ? [
        "// Step 5: a code also carries the deck's turrets (a fifth section, <id><slot>[*stars][!free]) and belt joins",
        "// (\">yx\" on a route word) when it has them; cost is the deck's value (rerolls and sale losses are gold spent).",
        "// spent is the gold the pick's run had spent by that dusk (maxGoldByDay less the gold it kept): the deck's value",
        "// + reroll gold + sale losses (REQ-BFG-033). The spend floor counts it; a pick below the floor is listed in short.",
      ] : []),
    ]),
    "",
    'import type { HeroId } from "./content";',
    "",
    `export type StandInTuple = readonly [cost: number, pct: number, score: number, build: string, vsPar: number${caravan ? ", spent: number" : ""}];`,
    'export type StandInRelax = "none" | "widen" | "grow" | "elites" | "best";',
    "export type StandInDay = readonly [par: number, entries: readonly StandInTuple[], window: readonly [lo: number, hi: number], pop: number, relax: StandInRelax];",
    "/** A floor a hero/day missed: a pick under the spend floor (cost < floor, in gold); or, with vsPar, a day",
    " *  that took the best-vsPar builds (relaxation \"best\"): their vsPar values, sorted like the entries",
    " *  (cost is then its cheapest pick). */",
    "export interface StandInShort { hero: HeroId; day: number; cost: number; floor: number; vsPar?: readonly number[] }",
    "export interface StandInData {",
    "  rules: string;",
    "  seed: number;",
    "  pop: number; // base population per hero and day (each day's own size is in its StandInDay)",
    "  band: readonly [number, number]; // lowest pct a pick may have, and the window width (hi - lo)",
    "  per: number;",
    "  floor: number; // spend floor as a share of maxGoldByDay, rounded up to whole gold",
    "  parFloor: number; // lowest vsPar a pick may have, unless its hero/day is listed in short",
    "  pools: Partial<Record<HeroId, readonly StandInDay[]>>;",
    "  short: readonly StandInShort[]; // floors missed (empty when every hero and day met both)",
    "}",
    "",
    "export const STAND_IN_DATA: StandInData = {",
    `  rules: ${JSON.stringify(POOL_RULES)}, seed: ${o.seed}, pop: ${o.pop}, band: [${o.band[0]}, ${o.band[1]}], per: ${o.per}, floor: 0.9, parFloor: ${o.parFloor},`,
    "  pools: {",
  ];
  for (const hero of o.heroes) {
    L.push(`    ${hero}: [`);
    for (const hd of days.filter((x) => x.hero === hero).sort((a, b) => a.day - b.day)) {
      L.push(`      [${hd.par}, [ // day ${hd.day}: floor ${hd.floor} of ${hd.budget} g; ${hd.relax}, window ${hd.window[0]}-${hd.window[1]} of ${hd.pop.length}`);
      for (const p of hd.picks) L.push(`        [${p.cost}, ${p.pct}, ${r4(p.score)}, ${JSON.stringify(p.code)}, ${r4(p.vsPar)}${caravan ? `, ${spentOf(p)}` : ""}],`);
      L.push(`      ], [${hd.window[0]}, ${hd.window[1]}], ${hd.pop.length}, "${hd.relax}"],`);
    }
    L.push("    ],");
  }
  L.push("  },");
  const short = [
    ...days.flatMap((hd) => hd.picks.filter((p) => spentOf(p) < hd.floor).map((p) => `{ hero: "${hd.hero}", day: ${hd.day}, cost: ${p.cost}, floor: ${hd.floor} }`)),
    ...days.filter((hd) => hd.relax === "best").map((hd) =>
      `{ hero: "${hd.hero}", day: ${hd.day}, cost: ${Math.min(...hd.picks.map((p) => p.cost))}, floor: ${hd.floor}, vsPar: [${hd.picks.map((p) => r4(p.vsPar)).join(", ")}] }`),
  ];
  L.push(`  short: [${short.join(", ")}],`);
  L.push("};", "");
  return L.join("\n");
}
