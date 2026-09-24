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
import { maxGoldByDay } from "../../net/validate";
import { decodeStandIn, encodeStandIn } from "../standInPool";
import { fullPurseBuild, spendFloor } from "./gen";
import { heroRefBuild } from "./heroes";
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
}

export const STANDIN_DEFAULTS: StandInOpts = {
  seed: 1, pop: 64, band: [40, 60], per: 6, gauntlet: 20, seeds: 2, elites: 8, refSeeds: 10, heroes: ["furnace", "weaver"],
  parFloor: 0.5, widen: 10, grow: [128, 256],
};

export interface Cand {
  idx: number; build: Build; code: string; cost: number; tries: number; floorMet: boolean; score: number; pct: number;
  vsRef: Partial<Record<HeroId, number>>; // win rate vs heroRefBuild(hero, day) of each pool hero
  vsPar: number; // floor(b): the lowest of vsRef
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
}

export interface Selection { picks: Cand[]; par: number; window: [number, number]; widened: boolean }

const norm = (b: Build): Build => decodeStandIn(b.hero, encodeStandIn(b));
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

export async function genStandIns(o: StandInOpts, run: Runner, log?: (m: string) => void): Promise<{ days: HeroDay[]; battles: number }> {
  const out: HeroDay[] = [];
  let battles = 0;
  const per = o.seeds * 2;
  const seedsFor = (...parts: (string | number)[]) => Array.from({ length: o.seeds }, (_, k) => hashSeed("standin-battle", o.seed, ...parts, k));
  for (let day = 1; day <= 10; day++) {
    const gauntlet = o.heroes.flatMap((g) => Array.from({ length: o.gauntlet }, (_, i) => norm(fullPurseBuild(g, day, hashSeed("standin-gauntlet", o.seed, g, day, i)).build)));
    const refs = o.heroes.map((h) => heroRefBuild(h, day));
    const G = gauntlet.length, R = refs.length;
    const dayOut: HeroDay[] = [];
    for (const hero of o.heroes) {
      const refSeeds = refs.map((_, r) => Array.from({ length: o.refSeeds }, (_, k) => hashSeed("standin-ref", o.seed, hero, day, r, k)));
      // builds from..to-1 of this hero/day's population, scored vs the gauntlet and measured vs the references
      const grow = async (from: number, to: number): Promise<Cand[]> => {
        const c: Cand[] = Array.from({ length: to - from }, (_, k) => {
          const idx = from + k, f = fullPurseBuild(hero, day, hashSeed("standin-pop", o.seed, hero, day, idx));
          const build = norm(f.build);
          return { idx, build, code: encodeStandIn(build), cost: f.cost, tries: f.tries, floorMet: f.floorMet, score: 0, pct: 0, vsRef: {}, vsPar: 0 };
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
      let relax: Relax = "none";
      let sel = pickWindow(pop, eligibleOf(pop, o, false), o);
      if (sel?.widened) relax = "widen";
      for (const n of o.grow) {
        if (sel || n <= pop.length) continue;
        pop.push(...(await grow(pop.length, n)));
        rank(pop);
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
        elites, parVsRef: { ...picks[par].vsRef }, parVsElites: 0,
      });
      log?.(`${hero} day ${day}: ${relax}, window ${window.join("-")} of ${pop.length}; picks pct ${picks.map((p) => p.pct).join(", ")}; vsPar ${picks.map((p) => p.vsPar).join(", ")}`);
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

/** Canonical command for the header: every generation option explicit, no --workers/--out/--check. */
export function standInCommand(o: StandInOpts): string {
  const g = o.gauntlet !== STANDIN_DEFAULTS.gauntlet ? ` --gauntlet ${o.gauntlet}` : "";
  return `npm run standins -- --seed ${o.seed} --pop ${o.pop} --band ${o.band[0]},${o.band[1]} --per ${o.per} --par-floor ${round1(o.parFloor * 100)}${g}`;
}

const r4 = (x: number) => Number(x.toFixed(4));

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
    "// [par index, entries sorted by pct, window [lo, hi], population size, relaxation]. src/sim/standInPool.ts",
    "// decodes the build codes.",
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
