// Balance harness tournament. For each day: a population of random builds per hero, each
// build plays the same gauntlet (the first `gauntlet` builds of EVERY hero's population, a
// random sample since builds are iid) with `seeds` seeds per pairing, from both sides. The top
// `elites` builds per hero by win rate are that day's elites; elites of different heroes then
// play each other. Battles run through a Runner, so the CLI can fan out to worker threads;
// results are keyed by job, so the tables never depend on how the work was split.

import { Rng, hashSeed } from "../../core/rng";
import { simulate } from "../battle";
import type { HeroId } from "../content";
import type { Build } from "../deck";
import { buildCost, maxGoldByDay } from "../../net/validate";
import { randomBuild } from "./gen";
import { HARNESS_HEROES, heroRefBuild, heroStartBuild } from "./heroes";
import { buildTraits, type Traits } from "./levers";
import { rigValues, type RigValue } from "./rigs";
import { wilson, type Rate } from "./stats";

export interface TourneyOpts {
  seed: number;
  days: number[];
  heroes: readonly HeroId[];
  pop: number; // builds per hero and day
  gauntlet: number; // gauntlet members per hero (<= pop)
  seeds: number; // seeds per pairing; each seed is played from both sides
  elites: number;
  calibrationDays: number[]; // days that also rank the reference build
}

export const DEFAULT_OPTS: TourneyOpts = {
  seed: 1, days: [1, 3, 5, 7, 10], heroes: HARNESS_HEROES, pop: 40, gauntlet: 20, seeds: 2, elites: 8,
  calibrationDays: [1, 3, 5, 7, 10],
};

export interface Job { a: number; b: number; seeds: number[] } // field indices
/** Plays jobs over a field; returns, per job, a's points (win 1, draw 0.5) over 2 x seeds battles. */
export type Runner = (field: Build[], jobs: Job[]) => Promise<number[]>;

/** One pairing: every seed from both sides (A as player, then A as enemy). */
export function playJob(field: Build[], j: Job): number {
  let pts = 0;
  for (const s of j.seeds) {
    const x = simulate(field[j.a], field[j.b], s).winner;
    const y = simulate(field[j.b], field[j.a], s).winner;
    pts += (x === 0 ? 1 : x === -1 ? 0.5 : 0) + (y === 1 ? 1 : y === -1 ? 0.5 : 0);
  }
  return pts;
}

export const localRunner: Runner = async (field, jobs) => jobs.map((j) => playJob(field, j));

export interface Spend { median: number; min: number; max: number }
export interface Entry { hero: HeroId; idx: number; ref: boolean; build: Build; cost: number; score: Rate }
export interface EliteInfo { idx: number; score: Rate; cost: number; build: Build }
export type TraitKey = keyof Traits;
/** Per trait: builds with it (n) and their mean gauntlet score, beside those without it. */
export type TraitStats = Record<TraitKey, { n: number; mean: number; restN: number; restMean: number }>;
export interface Calibration { rank: number; of: number; score: Rate; build: Build; cost: number; popCost: Spend }
export interface DayResult {
  day: number;
  budget: number;
  battles: number;
  pop: Record<string, Rate>; // "a|b": a's win rate vs b, population vs population; "a|a" = mirror
  elite: Record<string, Rate>; // "a|b": elites vs elites
  elites: Record<string, EliteInfo[]>;
  calibration?: Record<string, Calibration>;
  popScores: Record<string, number[]>; // each hero's population win rates vs the gauntlet, by idx
  spend: Record<string, Spend>; // each hero's population spend (gold)
  traits: Record<string, TraitStats>;
  rigs: Record<string, RigValue>; // 0.6.2 BELTSIDE H1: landed arrows and their value, every population rig, by def
}

export interface TourneyResult { opts: TourneyOpts; days: DayResult[]; battles: number }

const pk = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);

export function spendOf(costs: number[]): Spend {
  const s = [...costs].sort((a, b) => a - b), n = s.length;
  if (!n) return { median: 0, min: 0, max: 0 };
  return { median: n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2, min: s[0], max: s[n - 1] };
}

export async function runTournament(o: TourneyOpts, run: Runner = localRunner, log?: (m: string) => void): Promise<TourneyResult> {
  const days: DayResult[] = [];
  let battles = 0;
  for (const day of o.days) {
    const r = await runDay(o, day, run);
    battles += r.battles;
    log?.(`day ${day}: ${r.battles} battles`);
    days.push(r);
  }
  return { opts: o, days, battles };
}

export async function runDay(o: TourneyOpts, day: number, run: Runner): Promise<DayResult> {
  const field: Entry[] = [];
  const blank: Rate = { p: 0, lo: 0, hi: 0, n: 0, pts: 0 };
  for (const hero of o.heroes) {
    for (let i = 0; i < o.pop; i++) {
      const build = randomBuild(hero, day, new Rng(hashSeed("bb-pop", o.seed, hero, day, i)));
      field.push({ hero, idx: i, ref: false, build, cost: buildCost(build).total, score: blank });
    }
    if (o.calibrationDays.includes(day)) {
      const build = heroRefBuild(hero, day);
      field.push({ hero, idx: -1, ref: true, build, cost: buildCost(build).total, score: blank });
    }
  }
  const builds = field.map((e) => e.build);
  const gauntlet = field.map((e, i) => (!e.ref && e.idx < o.gauntlet ? i : -1)).filter((i) => i >= 0);
  const inGauntlet = new Set(gauntlet);
  const results = new Map<string, number>(); // pair key -> points of the lower field index
  const seedsFor = (a: number, b: number) => Array.from({ length: o.seeds }, (_, k) => hashSeed("bb-battle", o.seed, day, a, b, k));
  const play = async (pairs: [number, number][]) => {
    const jobs: Job[] = [];
    const seen = new Set<string>();
    for (const [x, y] of pairs) {
      const a = Math.min(x, y), b = Math.max(x, y), k = pk(a, b);
      if (a === b || results.has(k) || seen.has(k)) continue;
      seen.add(k);
      jobs.push({ a, b, seeds: seedsFor(a, b) });
    }
    const pts = await run(builds, jobs);
    jobs.forEach((j, i) => results.set(pk(j.a, j.b), pts[i]));
    return jobs.length * o.seeds * 2;
  };
  const per = o.seeds * 2;
  const ptsOf = (x: number, y: number) => (x < y ? results.get(pk(x, y))! : per - results.get(pk(x, y))!);

  // 1. every build (and reference) against the gauntlet
  let battles = await play(field.flatMap((_, x) => gauntlet.map((g) => [x, g] as [number, number])));
  const phase1 = new Set(results.keys()); // the population matrix uses gauntlet games only
  field.forEach((e, x) => {
    let pts = 0, n = 0;
    for (const g of gauntlet) if (g !== x) { pts += ptsOf(x, g); n += per; }
    e.score = wilson(pts, n);
  });

  // 2. elites: top `elites` of each hero's population by gauntlet win rate (ties: lower idx)
  const eliteIdx: Record<string, number[]> = {};
  for (const h of o.heroes) {
    eliteIdx[h] = field.map((e, i) => i).filter((i) => field[i].hero === h && !field[i].ref)
      .sort((a, b) => field[b].score.p - field[a].score.p || field[a].idx - field[b].idx).slice(0, o.elites);
  }
  const elitePairs: [number, number][] = [];
  for (const a of o.heroes) for (const b of o.heroes) if (a < b) for (const x of eliteIdx[a]) for (const y of eliteIdx[b]) elitePairs.push([x, y]);
  battles += await play(elitePairs);

  // 3. matrices: every played pairing between the two groups, from the row hero's side
  const cross = (ga: number[], gb: number[], only?: Set<string>): Rate => {
    let pts = 0, n = 0;
    for (const x of ga) for (const y of gb) {
      const k = pk(x, y);
      if (x !== y && results.has(k) && (!only || only.has(k))) { pts += ptsOf(x, y); n += per; }
    }
    return wilson(pts, n);
  };
  const popOf = (h: HeroId) => field.map((e, i) => (e.hero === h && !e.ref ? i : -1)).filter((i) => i >= 0);
  const pop: Record<string, Rate> = {}, elite: Record<string, Rate> = {};
  for (const a of o.heroes) for (const b of o.heroes) {
    if (a !== b) {
      pop[`${a}|${b}`] = cross(popOf(a), popOf(b), phase1);
      elite[`${a}|${b}`] = cross(eliteIdx[a], eliteIdx[b]);
    } else {
      // mirror: the hero's builds outside the gauntlet against its gauntlet builds (pairs inside
      // the gauntlet are left out: counted from both sides they are exactly 50% by construction)
      const all = popOf(a);
      pop[`${a}|${a}`] = cross(all.filter((i) => !inGauntlet.has(i)), all.filter((i) => inGauntlet.has(i)), phase1);
    }
  }

  const elites: DayResult["elites"] = {}, popScores: DayResult["popScores"] = {};
  const spend: DayResult["spend"] = {}, traits: DayResult["traits"] = {};
  for (const h of o.heroes) {
    elites[h] = eliteIdx[h].map((i) => ({ idx: field[i].idx, score: field[i].score, cost: field[i].cost, build: field[i].build }));
    popScores[h] = popOf(h).map((i) => field[i].score.p);
    spend[h] = spendOf(popOf(h).map((i) => field[i].cost));
    traits[h] = traitStats(popOf(h).map((i) => field[i]), heroStartBuild(h, 1).routes.length);
  }
  let calibration: DayResult["calibration"];
  if (o.calibrationDays.includes(day)) {
    calibration = {};
    for (const h of o.heroes) {
      const ref = field.find((e) => e.hero === h && e.ref)!;
      const better = popScores[h].filter((p) => p > ref.score.p).length;
      calibration[h] = { rank: better + 1, of: popScores[h].length + 1, score: ref.score, build: ref.build, cost: ref.cost, popCost: spend[h] };
    }
  }
  const rigs = rigValues(field.filter((e) => !e.ref).map((e) => e.build));
  return { day, budget: maxGoldByDay(day), battles, pop, elite, elites, calibration, popScores, spend, traits, rigs };
}

function traitStats(entries: Entry[], startRoutes: number): TraitStats {
  const tr = entries.map((e) => buildTraits(e.build, startRoutes));
  const out = {} as TraitStats;
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  for (const k of Object.keys(tr[0] ?? {}) as TraitKey[]) {
    const yes = entries.filter((_, i) => tr[i][k]).map((e) => e.score.p);
    const no = entries.filter((_, i) => !tr[i][k]).map((e) => e.score.p);
    out[k] = { n: yes.length, mean: mean(yes), restN: no.length, restMean: mean(no) };
  }
  return out;
}
