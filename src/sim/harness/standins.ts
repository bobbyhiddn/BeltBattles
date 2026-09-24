// Stand-in pool generation (tools/genStandInPool.ts is the CLI). Per hero and day: a population
// of full-purse builds (fullPurseBuild: legal, at least 90% of maxGoldByDay), each scored against
// a fixed gauntlet of that day's full-purse builds of every pool hero (another seed; `seeds` seeds
// per pairing, both sides). Strength percentile (pct) = share of the population scoring lower
// (ties half). Par floor: every build also plays heroRefBuild(h, day) of each pool hero (the
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

import { hashSeed } from "../../core/rng";
import { RULES_VERSION, type HeroId } from "../content";
import type { Build } from "../deck";
import { buildCost, maxGoldByDay, unfusedPairs, validateBuild } from "../../net/validate";
import { decodeStandIn, encodeStandIn, standInPool } from "../standInPool";
import { FUSE_MAX, starsOf } from "../stars";
import { fullPurseBuild, spendFloor, type FullPurse } from "./gen";
import { heroRefBuild } from "./heroes";
import type { Stars } from "./shopper";
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
}

export const ROBUST_BAND = 0.1;
export const ROBUST_MULT = 4;

/** F8 (decision D4, ARSENAL.md §9.2 "the Matriarch alone may carry a 3★"): with stars on, a stand-in
 *  candidate holds no module above 2 stars. */
export const STANDIN_MAX_STARS = 2;

/** A stand-in candidate: a full-purse build. With stars on it is merge-aware and capped: the shopper
 *  never buys a copy whose merge would go above STANDIN_MAX_STARS. Stars off: exactly v1. */
export function standInCandidate(hero: HeroId, day: number, seed: number, stars: Stars): FullPurse {
  return fullPurseBuild(hero, day, seed, spendFloor(day), 60, stars, stars === "on" ? STANDIN_MAX_STARS : FUSE_MAX);
}

/** The highest star level on a deck (1 when nothing is merged). */
export const maxStarsOf = (b: Build): number => Math.max(1, ...[...b.items, ...b.mods].map((p) => starsOf(p)));

export const STANDIN_DEFAULTS: StandInOpts = {
  seed: 1, pop: 64, band: [40, 60], per: 6, gauntlet: 20, seeds: 2, elites: 8, refSeeds: 10, heroes: ["furnace", "weaver"],
  parFloor: 0.5, widen: 10, grow: [128, 256], stars: "on", robust: ROBUST_MULT,
};

export interface Cand {
  idx: number; build: Build; code: string; cost: number; tries: number; floorMet: boolean; score: number; pct: number;
  vsRef: Partial<Record<HeroId, number>>; // win rate vs heroRefBuild(hero, day) of each pool hero
  vsPar: number; // floor(b): the lowest of vsRef
  replayed?: boolean; // 0.6.1a: the robust re-play already ran on it (F12: never twice)
}

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

/** Builds a pick may be: pct >= band[0], vsPar >= parFloor, spend floor met, not an elite (the
 *  population's top eighth by score) unless `allowElites`. */
export function eligibleOf(pop: Cand[], o: StandInOpts, allowElites: boolean): Cand[] {
  const top = new Set(allowElites ? [] : byScore(pop).slice(0, Math.ceil(pop.length / 8)).map((c) => c.idx));
  return pop.filter((c) => c.floorMet && c.pct >= o.band[0] && c.vsPar >= o.parFloor && !top.has(c.idx));
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
 *  lower pct first on ties; the window is the picks' pct span. */
export function pickBest(pop: Cand[], o: StandInOpts): Selection {
  const high = pop.filter((c) => c.pct >= o.band[0]), met = high.filter((c) => c.floorMet);
  const src = met.length >= o.per ? met : high.length >= o.per ? high : pop;
  const picks = [...src].sort((a, b) => b.vsPar - a.vsPar || a.pct - b.pct || a.idx - b.idx).slice(0, o.per)
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
export async function robustReplay(o: StandInOpts, hero: HeroId, day: number, pop: Cand[], refs: Build[], run: Runner): Promise<{ removed: number; battles: number; replayed: number }> {
  const borderline = pop.filter((c) => robustBorderline(c, o));
  if (!borderline.length) return { removed: 0, battles: 0, replayed: 0 };
  const n = Math.max(1, Math.round(o.robust)) * o.refSeeds;
  const field = [...refs, ...borderline.map((c) => c.build)];
  const jobs: Job[] = borderline.flatMap((c, i) =>
    refs.map((_, r): Job => ({ a: refs.length + i, b: r, seeds: Array.from({ length: n }, (_, k) => hashSeed("standin-robust", o.seed, hero, day, c.idx, r, k)) })));
  const pts = await run(field, jobs);
  const origBattles = o.refSeeds * 2, replayBattles = n * 2;
  let removed = 0;
  borderline.forEach((c, i) => {
    const combined = o.heroes.map((h, r) => {
      const origWins = (c.vsRef[h] ?? 0) * origBattles;
      const replayWins = pts[i * refs.length + r];
      return (origWins + replayWins) / (origBattles + replayBattles);
    });
    c.vsPar = Math.min(...combined);
    c.replayed = true;
    if (c.vsPar < o.parFloor) removed++; // it cleared the floor before the re-play (robustBorderline)
  });
  return { removed, battles: jobs.length * replayBattles, replayed: borderline.length };
}

export async function genStandIns(o: StandInOpts, run: Runner, log?: (m: string) => void): Promise<{ days: HeroDay[]; battles: number }> {
  const out: HeroDay[] = [];
  let battles = 0;
  const per = o.seeds * 2;
  const seedsFor = (...parts: (string | number)[]) => Array.from({ length: o.seeds }, (_, k) => hashSeed("standin-battle", o.seed, ...parts, k));
  for (let day = 1; day <= 10; day++) {
    const gauntlet = o.heroes.flatMap((g) => Array.from({ length: o.gauntlet }, (_, i) => norm(fullPurseBuild(g, day, hashSeed("standin-gauntlet", o.seed, g, day, i), spendFloor(day), 60, o.stars).build, o.stars)));
    const refs = o.heroes.map((h) => heroRefBuild(h, day));
    const G = gauntlet.length, R = refs.length;
    const dayOut: HeroDay[] = [];
    for (const hero of o.heroes) {
      const refSeeds = refs.map((_, r) => Array.from({ length: o.refSeeds }, (_, k) => hashSeed("standin-ref", o.seed, hero, day, r, k)));
      let capAffected = 0, capWould3 = 0;
      // builds from..to-1 of this hero/day's population, scored vs the gauntlet and measured vs the references
      const grow = async (from: number, to: number): Promise<Cand[]> => {
        const c: Cand[] = Array.from({ length: to - from }, (_, k) => {
          const idx = from + k, seed = hashSeed("standin-pop", o.seed, hero, day, idx), f = standInCandidate(hero, day, seed, o.stars);
          if (o.stars === "on") {
            // F8 report: the same candidate without the 2-star cap; did the cap change it?
            const free = fullPurseBuild(hero, day, seed, spendFloor(day), 60, o.stars, FUSE_MAX).build;
            if (encodeStarred(free) !== encodeStarred(f.build)) capAffected++;
            if (maxStarsOf(free) > STANDIN_MAX_STARS) capWould3++;
          }
          const build = norm(f.build, o.stars);
          return { idx, build, code: standInCodeOf(build, o.stars), cost: f.cost, tries: f.tries, floorMet: f.floorMet, score: 0, pct: 0, vsRef: {}, vsPar: 0 };
        });
        const field = [...gauntlet, ...refs, ...c.map((x) => x.build)];
        const jobs: Job[] = c.flatMap((x, i) => [
          ...gauntlet.map((_, j): Job => ({ a: G + R + i, b: j, seeds: seedsFor(hero, day, x.idx, j) })),
          ...refs.map((_, r): Job => ({ a: G + R + i, b: G + r, seeds: refSeeds[r] })),
        ]);
        const pts = await run(field, jobs);
        battles += c.length * (G * per + R * o.refSeeds * 2);
        c.forEach((x, i) => {
          const at = i * (G + R);
          x.score = winRate(pts.slice(at, at + G), G * per);
          o.heroes.forEach((h, r) => (x.vsRef[h] = pts[at + G + r] / (o.refSeeds * 2)));
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
        const r = await robustReplay(o, hero, day, pop, refs, run);
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
          const r = await robustReplay(o, hero, day, pop, refs, run); // only the grown candidates (F12)
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
        hero, day, budget: maxGoldByDay(day), floor, pop, picks, par, window, relax, widened, short: picks.some((p) => p.cost < floor),
        elites, parVsRef: { ...picks[par].vsRef }, parVsElites: 0, robustRemoved, robustReplayed, capAffected, capWould3,
      });
      log?.(`${hero} day ${day}: ${relax}, window ${window.join("-")} of ${pop.length}; picks pct ${picks.map((p) => p.pct).join(", ")}; vsPar ${picks.map((p) => p.vsPar).join(", ")}${robustRemoved ? `; robust re-play removed ${robustRemoved}` : ""}`);
    }
    // the par against that day's elites of every pool hero (report only)
    for (const hd of dayOut) {
      const elites = dayOut.flatMap((x) => x.elites.map((e) => e.build));
      const jobs: Job[] = elites.map((_, e) => ({ a: 0, b: 1 + e, seeds: seedsFor("elite", hd.hero, day, e) }));
      const pts = await run([hd.picks[hd.par].build, ...elites], jobs);
      battles += jobs.length * per;
      hd.parVsElites = winRate(pts, jobs.length * per);
    }
    out.push(...dayOut);
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
      a: i, b: A.length + j, seeds: Array.from({ length: o.seeds }, (_, k) => hashSeed("standin-pvp", o.seed, day, i, j, k)),
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
  return `npm run standins -- --seed ${o.seed} --pop ${o.pop} --band ${o.band[0]},${o.band[1]} --per ${o.per} --par-floor ${round1(o.parFloor * 100)}${g}`;
}

const r4 = (x: number) => Number(x.toFixed(4));

/** One tuple as written in a data module: hero, day, position, cost and build code. */
export interface WrittenPick { hero: HeroId; day: number; i: number; cost: number; code: string }

/** Parse the picks back out of dataModuleText's output (what is WRITTEN, not what is in memory). */
export function writtenPicks(text: string): WrittenPick[] {
  const out: WrittenPick[] = [];
  let hero: HeroId | undefined, day = 0, i = 0;
  for (const line of text.split("\n")) {
    const h = /^ {4}([a-z]+): \[$/.exec(line);
    if (h) { hero = h[1] as HeroId; continue; }
    const d = /^ {6}\[\d+, \[ \/\/ day (\d+):/.exec(line);
    if (d) { day = Number(d[1]); i = 0; continue; }
    const t = /^ {8}\[(\d+), [-\d.]+, [-\d.]+, ("(?:[^"\\]|\\.)*"), [-\d.]+\],$/.exec(line);
    if (t && hero) out.push({ hero, day, i: i++, cost: Number(t[1]), code: JSON.parse(t[2]) as string });
  }
  return out;
}

/**
 * The stars-on invariant on what is WRITTEN (patch 0006's guard, F2): every tuple of `text` decodes
 * (the star-aware decoder) to exactly the deck that was scored (same JSON), its stored cost is
 * buildCost of that deck, and the deck passes validateBuild, has no unfused pair and fits the day's
 * gold. Returns one message per problem (empty: the module is what was scored).
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
    if (buildCost(back).total !== w.cost) problems.push(`${at}: stored cost ${w.cost} != buildCost of the stored deck ${buildCost(back).total}`);
    const v = validateBuild(back, hd.day);
    if (!v.ok) problems.push(`${at}: stored deck is invalid: ${v.errors.join("; ")}`);
    if (o.stars === "on") for (const u of unfusedPairs(back)) problems.push(`${at}: stored deck has an ${u}`);
    if (o.stars === "on" && maxStarsOf(back) > STANDIN_MAX_STARS) problems.push(`${at}: stored deck holds a ${maxStarsOf(back)}-star module (stand-ins stop at ${STANDIN_MAX_STARS})`);
    if (buildCost(back).total > maxGoldByDay(hd.day)) problems.push(`${at}: stored deck costs more than maxGoldByDay`);
  }
  return problems;
}

/** The generated data module (src/sim/standInPoolData.ts), byte-stable for the same options. */
export function dataModuleText(o: StandInOpts, days: HeroDay[]): string {
  const L = [
    "// GENERATED by tools/genStandInPool.ts; do not edit by hand. Regenerate, or verify with --check:",
    `//   ${standInCommand(o)}`,
    `// Seed ${o.seed}; RULES_VERSION ${RULES_VERSION}; ${o.per} picks per hero and day. Population: ${o.pop} full-purse builds per`,
    `// hero and day (each costing at least 90% of maxGoldByDay), scored against a gauntlet of ${o.gauntlet} builds per pool`,
    `// hero, ${o.seeds} seeds x both sides per pairing; pct = strength percentile inside the population.`,
    `// Par floor: vsPar = the build's lowest win rate against heroRefBuild(h, day) of each pool hero h (the`,
    `// par decks), ${o.refSeeds} seeds x both sides. A pick needs vsPar >= ${o.parFloor}, pct >= ${o.band[0]}, and must not be among`,
    `// the population's top eighth (the elites). Picks spread across a ${o.band[1] - o.band[0]}-point window that starts at the`,
    `// lowest eligible pct (at ${o.band[0]} when no build lies below it); par = the pick nearest the window's middle.`,
    `// Fewer than ${o.per} eligible in the window: (a) widen it upward by ${o.widen} points at a time, (b) grow the population`,
    `// to ${o.grow.join(", then ")} (same gauntlet), (c) allow elites, (d) take the ${o.per} builds with the highest vsPar (in short).`,
    "// Tuples are [cost (gold), pct, score (win rate vs the gauntlet), build code, vsPar (0-1)]; each day is",
    ...(o.stars === "off" ? [
      "// [par index, entries sorted by pct, window [lo, hi], population size, relaxation]. src/sim/standInPool.ts",
      "// decodes the build codes.",
    ] : [
      "// [par index, entries sorted by pct, window [lo, hi], population size, relaxation]. The build codes are",
      "// star-aware (src/sim/harness/standinCode.ts: the v1 format plus *2 or *3 on an item or module word; no",
      "// suffix is 1 star); src/sim/standInPool.ts decodes them once the flip ports that codec.",
    ]),
    "",
    'import type { HeroId } from "./content";',
    "",
    "export type StandInTuple = readonly [cost: number, pct: number, score: number, build: string, vsPar: number];",
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
    `  rules: ${JSON.stringify(RULES_VERSION)}, seed: ${o.seed}, pop: ${o.pop}, band: [${o.band[0]}, ${o.band[1]}], per: ${o.per}, floor: 0.9, parFloor: ${o.parFloor},`,
    "  pools: {",
  ];
  for (const hero of o.heroes) {
    L.push(`    ${hero}: [`);
    for (const hd of days.filter((x) => x.hero === hero).sort((a, b) => a.day - b.day)) {
      L.push(`      [${hd.par}, [ // day ${hd.day}: floor ${hd.floor} of ${hd.budget} g; ${hd.relax}, window ${hd.window[0]}-${hd.window[1]} of ${hd.pop.length}`);
      for (const p of hd.picks) L.push(`        [${p.cost}, ${p.pct}, ${r4(p.score)}, ${JSON.stringify(p.code)}, ${r4(p.vsPar)}],`);
      L.push(`      ], [${hd.window[0]}, ${hd.window[1]}], ${hd.pop.length}, "${hd.relax}"],`);
    }
    L.push("    ],");
  }
  L.push("  },");
  const short = [
    ...days.flatMap((hd) => hd.picks.filter((p) => p.cost < hd.floor).map((p) => `{ hero: "${hd.hero}", day: ${hd.day}, cost: ${p.cost}, floor: ${hd.floor} }`)),
    ...days.filter((hd) => hd.relax === "best").map((hd) =>
      `{ hero: "${hd.hero}", day: ${hd.day}, cost: ${Math.min(...hd.picks.map((p) => p.cost))}, floor: ${hd.floor}, vsPar: [${hd.picks.map((p) => r4(p.vsPar)).join(", ")}] }`),
  ];
  L.push(`  short: [${short.join(", ")}],`);
  L.push("};", "");
  return L.join("\n");
}
