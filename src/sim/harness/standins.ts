// Stand-in pool generation (tools/genStandInPool.ts is the CLI). Per hero and day: a population
// of full-purse builds (fullPurseBuild: legal, at least 90% of maxGoldByDay), each scored against
// a fixed gauntlet of that day's full-purse builds of every pool hero (another seed; `seeds` seeds
// per pairing, both sides). Strength percentile = share of the population scoring lower (ties
// half). Picks: `per` builds inside the band, nearest to evenly spaced targets across it. Par:
// the pick nearest the 50th percentile. Every build is normalised through the stand-in code
// first, so what is stored is exactly what was scored.

import { hashSeed } from "../../core/rng";
import { RULES_VERSION, type HeroId } from "../content";
import type { Build } from "../deck";
import { maxGoldByDay } from "../../net/validate";
import { decodeStandIn, encodeStandIn } from "../standInPool";
import { fullPurseBuild, spendFloor } from "./gen";
import { heroRefBuild } from "./heroes";
import type { Job, Runner } from "./tournament";

export interface StandInOpts {
  seed: number;
  pop: number; // builds per hero and day
  band: [number, number]; // strength percentile band for the picks
  per: number; // picks per hero and day
  gauntlet: number; // gauntlet builds per pool hero and day
  seeds: number; // seeds per pairing (each played from both sides)
  elites: number; // top builds per hero kept as "that day's elites" for the report
  refSeeds: number; // seeds for the par against heroRefBuild
  heroes: HeroId[];
}

export const STANDIN_DEFAULTS: StandInOpts = {
  seed: 1, pop: 64, band: [40, 60], per: 6, gauntlet: 20, seeds: 2, elites: 8, refSeeds: 10, heroes: ["furnace", "weaver"],
};

export interface Cand { idx: number; build: Build; code: string; cost: number; tries: number; floorMet: boolean; score: number; pct: number }

export interface HeroDay {
  hero: HeroId;
  day: number;
  budget: number;
  floor: number;
  pop: Cand[];
  picks: Cand[]; // sorted by pct
  par: number; // index into picks
  widened: boolean; // fewer than `per` eligible builds inside the band: nearest outside ones filled in
  short: boolean; // fewer than `per` builds reached the floor: highest-spend builds used instead
  elites: Cand[];
  parVsRef: Partial<Record<HeroId, number>>; // par's win rate vs heroRefBuild(hero, day)
  parVsElites: number; // par's win rate vs that day's elites of every pool hero
}

const norm = (b: Build): Build => decodeStandIn(b.hero, encodeStandIn(b));
const round1 = (x: number) => Math.round(x * 10) / 10;

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

/** `per` picks spread across the band [lo, hi]; the par is the pick nearest 50. */
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
  let par = 0;
  picks.forEach((x, i) => {
    if (Math.abs(x.pct - 50) < Math.abs(picks[par].pct - 50)) par = i;
  });
  return { picks, par, widened };
}

const winRate = (pts: number[], battles: number) => pts.reduce((s, p) => s + p, 0) / battles;

export async function genStandIns(o: StandInOpts, run: Runner, log?: (m: string) => void): Promise<{ days: HeroDay[]; battles: number }> {
  const out: HeroDay[] = [];
  let battles = 0;
  const per = o.seeds * 2;
  const seedsFor = (...parts: (string | number)[]) => Array.from({ length: o.seeds }, (_, k) => hashSeed("standin-battle", o.seed, ...parts, k));
  for (let day = 1; day <= 10; day++) {
    const gauntlet = o.heroes.flatMap((g) => Array.from({ length: o.gauntlet }, (_, i) => norm(fullPurseBuild(g, day, hashSeed("standin-gauntlet", o.seed, g, day, i)).build)));
    const dayOut: HeroDay[] = [];
    for (const hero of o.heroes) {
      const pop: Cand[] = Array.from({ length: o.pop }, (_, idx) => {
        const f = fullPurseBuild(hero, day, hashSeed("standin-pop", o.seed, hero, day, idx));
        const build = norm(f.build);
        return { idx, build, code: encodeStandIn(build), cost: f.cost, tries: f.tries, floorMet: f.floorMet, score: 0, pct: 0 };
      });
      const G = gauntlet.length, field = [...gauntlet, ...pop.map((c) => c.build)];
      const jobs: Job[] = pop.flatMap((_, i) => gauntlet.map((_, j): Job => ({ a: G + i, b: j, seeds: seedsFor(hero, day, i, j) })));
      const pts = await run(field, jobs);
      battles += jobs.length * per;
      pop.forEach((c, i) => (c.score = winRate(pts.slice(i * G, (i + 1) * G), G * per)));
      percentiles(pop.map((c) => c.score)).forEach((p, i) => (pop[i].pct = round1(p)));
      const met = pop.filter((c) => c.floorMet);
      const short = met.length < o.per;
      const eligible = short ? [...pop].sort((a, b) => b.cost - a.cost || a.idx - b.idx).slice(0, Math.max(o.per, met.length)) : met;
      const { picks, par, widened } = pickBand(eligible, o.band, o.per);
      const elites = [...pop].sort((a, b) => b.score - a.score || a.idx - b.idx).slice(0, o.elites);
      dayOut.push({ hero, day, budget: maxGoldByDay(day), floor: spendFloor(day), pop, picks, par, widened, short, elites, parVsRef: {}, parVsElites: 0 });
      log?.(`${hero} day ${day}: ${jobs.length * per} battles; picks pct ${picks.map((p) => p.pct).join(", ")}`);
    }
    // the par against the reference decks and against that day's elites (report only)
    for (const hd of dayOut) {
      const parB = hd.picks[hd.par].build;
      const refs = o.heroes.map((h) => heroRefBuild(h, day));
      const elites = dayOut.flatMap((x) => x.elites.map((e) => e.build));
      const field = [parB, ...refs, ...elites];
      const refJobs: Job[] = refs.map((_, r) => ({ a: 0, b: 1 + r, seeds: Array.from({ length: o.refSeeds }, (_, k) => hashSeed("standin-ref", o.seed, hd.hero, day, r, k)) }));
      const eliteJobs: Job[] = elites.map((_, e) => ({ a: 0, b: 1 + refs.length + e, seeds: seedsFor("elite", hd.hero, day, e) }));
      const pts = await run(field, [...refJobs, ...eliteJobs]);
      battles += refJobs.length * o.refSeeds * 2 + eliteJobs.length * per;
      o.heroes.forEach((h, r) => (hd.parVsRef[h] = pts[r] / (o.refSeeds * 2)));
      hd.parVsElites = winRate(pts.slice(refs.length), eliteJobs.length * per);
    }
    out.push(...dayOut);
  }
  return { days: out, battles };
}

/** Canonical command for the header: every generation option explicit, no --workers/--out/--check. */
export function standInCommand(o: StandInOpts): string {
  const g = o.gauntlet !== STANDIN_DEFAULTS.gauntlet ? ` --gauntlet ${o.gauntlet}` : "";
  return `npm run standins -- --seed ${o.seed} --pop ${o.pop} --band ${o.band[0]},${o.band[1]} --per ${o.per}${g}`;
}

/** The generated data module (src/sim/standInPoolData.ts), byte-stable for the same options. */
export function dataModuleText(o: StandInOpts, days: HeroDay[]): string {
  const L = [
    "// GENERATED by tools/genStandInPool.ts; do not edit by hand. Regenerate, or verify with --check:",
    `//   ${standInCommand(o)}`,
    `// Seed ${o.seed}; strength band ${o.band[0]}-${o.band[1]} (percentile inside a population of ${o.pop} full-purse builds per hero`,
    `// and day, each costing at least 90% of maxGoldByDay); ${o.per} picks per hero and day; RULES_VERSION ${RULES_VERSION}.`,
    "// Scored against a gauntlet of " + `${o.gauntlet} builds per pool hero, ${o.seeds} seeds x both sides per pairing.`,
    "// Tuples are [cost (gold), pct (strength percentile), score (win rate vs the gauntlet), build code];",
    "// src/sim/standInPool.ts decodes the build codes. Each day is [par index, entries sorted by pct].",
    "",
    'import type { HeroId } from "./content";',
    "",
    "export type StandInTuple = readonly [cost: number, pct: number, score: number, build: string];",
    "export type StandInDay = readonly [par: number, entries: readonly StandInTuple[]];",
    "export interface StandInShort { hero: HeroId; day: number; cost: number; floor: number }",
    "export interface StandInData {",
    "  rules: string;",
    "  seed: number;",
    "  pop: number;",
    "  band: readonly [number, number];",
    "  per: number;",
    "  floor: number; // spend floor as a share of maxGoldByDay, rounded up to whole gold",
    "  pools: Partial<Record<HeroId, readonly StandInDay[]>>;",
    "  short: readonly StandInShort[]; // picks under the floor (empty when every hero and day reached it)",
    "}",
    "",
    "export const STAND_IN_DATA: StandInData = {",
    `  rules: ${JSON.stringify(RULES_VERSION)}, seed: ${o.seed}, pop: ${o.pop}, band: [${o.band[0]}, ${o.band[1]}], per: ${o.per}, floor: 0.9,`,
    "  pools: {",
  ];
  for (const hero of o.heroes) {
    L.push(`    ${hero}: [`);
    for (const hd of days.filter((x) => x.hero === hero).sort((a, b) => a.day - b.day)) {
      L.push(`      [${hd.par}, [ // day ${hd.day}: floor ${hd.floor} of ${hd.budget} g`);
      for (const p of hd.picks) L.push(`        [${p.cost}, ${p.pct}, ${Number(p.score.toFixed(4))}, ${JSON.stringify(p.code)}],`);
      L.push("      ]],");
    }
    L.push("    ],");
  }
  L.push("  },");
  const short = days.flatMap((hd) => hd.picks.filter((p) => p.cost < hd.floor).map((p) => ({ hero: hd.hero, day: hd.day, cost: p.cost, floor: hd.floor })));
  L.push(`  short: [${short.map((s) => `{ hero: "${s.hero}", day: ${s.day}, cost: ${s.cost}, floor: ${s.floor} }`).join(", ")}],`);
  L.push("};", "");
  return L.join("\n");
}
