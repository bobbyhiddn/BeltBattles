// Balance harness tournament. For each day: a population of random builds per hero, each
// build plays the same gauntlet (the first `gauntlet` builds of EVERY hero's population, a
// random sample since builds are iid) with `seeds` seeds per pairing, from both sides. The top
// `elites` builds per hero by win rate are that day's elites; elites of different heroes then
// play each other. Battles run through a Runner, so the CLI can fan out to worker threads;
// results are keyed by job, so the tables never depend on how the work was split.

import { Rng, hashSeed } from "../../core/rng";
import { simulate } from "../battle";
import { ITEMS, type HeroId } from "../content";
import { hitsOfRig, rigHits, routeInfo, routesOf, type Build } from "../deck";
import { buildCost, maxGoldByDay, unfusedPairs, validateBuild } from "../../net/validate";
import { fuseDeck } from "./merge";
import { FUSE_MAX, fusible, perkAt, starsOf } from "../stars";
import { shopBuild, type Shopped } from "./gen";
import { HARNESS_HEROES, heroRefBuild, heroStartBuild, shopFactories } from "./heroes";
import { buildTraits, type Traits } from "./levers";
import { rigValues, type RigValue } from "./rigs";
import { fixedSpeedCells, isSpeedGate, type Cores, type Factories, type SlagCount, type Stars } from "./shopper";
import { meanCI, wilson, type Rate } from "./stats";
import { parReference, type ParSource } from "./par";

export interface TourneyOpts {
  seed: number;
  days: number[];
  heroes: readonly HeroId[];
  pop: number; // builds per hero and day
  gauntlet: number; // gauntlet members per hero (<= pop)
  seeds: number; // seeds per pairing; each seed is played from both sides
  elites: number;
  calibrationDays: number[]; // days that also rank the reference build
  stars: Stars; // 0.6.1a harness v2: merge-aware population/gauntlet when "on" (the product default)
  // 0.6.1b harness v2 part 2: the shopper buys and fits turret cores; only with stars on. Absent = "off", so
  // every pre-existing caller (and test) of DEFAULT_OPTS keeps part 1's exact path; the product surface is the
  // CLI, whose --cores defaults to the --stars value (tools/balance.ts).
  cores?: Cores;
  // 0.6.1c harness v2 part 3: the "press"/"drop" levers buy any factory the hero can buy and the "merge" lever a
  // factory copy that merges at once; only with stars on. Absent = "off" (part 2's exact path for every
  // pre-existing caller); the CLI's --factories defaults to the --stars value (tools/balance.ts).
  factories?: Factories;
  // FB-C (REQ-BFG-026): the calibration's Reference deck, through par.ts parReference. "field": the par deck (the
  // median member of the par player's field; heroes the par player doesn't play keep heroRefBuild). Absent or
  // "heroref": heroRefBuild (every pre-existing caller and test). The CLI's --par defaults to "field".
  par?: ParSource;
}

export const DEFAULT_OPTS: TourneyOpts = {
  seed: 1, days: [1, 3, 5, 7, 10], heroes: HARNESS_HEROES, pop: 40, gauntlet: 20, seeds: 2, elites: 8,
  calibrationDays: [1, 3, 5, 7, 10], stars: "on",
};

/** 0.6.1b: cores are bought only with stars on and cores on (the CLI defaults cores to the stars flag). */
export const coresOn = (o: { stars: Stars; cores?: Cores }): boolean => o.stars === "on" && o.cores === "on";
/** 0.6.1c: factories are bought only with stars on and factories on (the CLI defaults them to the stars flag). */
export const factoriesOn = (o: { stars: Stars; factories?: Factories }): boolean => o.stars === "on" && o.factories === "on";

// field indices. HULL-1a (REQ-BFG-079): `day`, the day the pairing's fights are on (simulate's; the day's hull with
// HULL_SCALE on, nothing without it); every job maker with a day sets it
export interface Job { a: number; b: number; seeds: number[]; day?: number }
/** Plays jobs over a field; returns, per job, a's points (win 1, draw 0.5) over 2 x seeds battles. */
export type Runner = (field: Build[], jobs: Job[]) => Promise<number[]>;

/** One pairing: every seed from both sides (A as player, then A as enemy). */
export function playJob(field: Build[], j: Job): number {
  let pts = 0;
  for (const s of j.seeds) {
    const x = simulate(field[j.a], field[j.b], s, undefined, undefined, j.day).winner;
    const y = simulate(field[j.b], field[j.a], s, undefined, undefined, j.day).winner;
    pts += (x === 0 ? 1 : x === -1 ? 0.5 : 0) + (y === 1 ? 1 : y === -1 ? 0.5 : 0);
  }
  return pts;
}

export const localRunner: Runner = async (field, jobs) => jobs.map((j) => playJob(field, j));

/** Plays jobs like a Runner, but returns per job the exact outcome of every battle, in play order
 *  (each seed: A as player, then A as enemy): "winner,duration,hull0,hull1" joined by ";". The star
 *  bench's NO EFFECT and SAME AS 2-star checks compare these strings. */
export type DetailRunner = (field: Build[], jobs: Job[]) => Promise<string[]>;

export function jobDetail(field: Build[], j: Job): string {
  const out: string[] = [];
  for (const s of j.seeds) {
    for (const r of [simulate(field[j.a], field[j.b], s, undefined, undefined, j.day), simulate(field[j.b], field[j.a], s, undefined, undefined, j.day)]) {
      out.push(`${r.winner},${r.t},${r.sides[0].hull.hp},${r.sides[1].hull.hp}`);
    }
  }
  return out.join(";");
}

export const localDetail: DetailRunner = async (field, jobs) => jobs.map((j) => jobDetail(field, j));

/** 0.6.1c (part 3, PRESS-SLOT): per job, a's points (exactly playJob's: the same battles), the damage a dealt and
 *  the jams on a's turrets (battle.ts side stats), summed over its 2 x seeds battles. */
export interface JobStats { pts: number; dmg: number; jams: number }
export type StatsRunner = (field: Build[], jobs: Job[]) => Promise<JobStats[]>;

export function jobStats(field: Build[], j: Job): JobStats {
  let pts = 0, dmg = 0, jams = 0;
  for (const s of j.seeds) {
    const x = simulate(field[j.a], field[j.b], s, undefined, undefined, j.day), y = simulate(field[j.b], field[j.a], s, undefined, undefined, j.day);
    pts += (x.winner === 0 ? 1 : x.winner === -1 ? 0.5 : 0) + (y.winner === 1 ? 1 : y.winner === -1 ? 0.5 : 0);
    dmg += x.sides[0].stats.damage + y.sides[1].stats.damage;
    jams += x.sides[0].stats.jams + y.sides[1].stats.jams;
  }
  return { pts, dmg, jams };
}

export const localStats: StatsRunner = async (field, jobs) => jobs.map((j) => jobStats(field, j));

export interface Spend { median: number; min: number; max: number }
export interface Entry { hero: HeroId; idx: number; ref: boolean; build: Build; cost: number; score: Rate }
export interface EliteInfo { idx: number; score: Rate; cost: number; build: Build }
export type TraitKey = keyof Traits;
/** Per trait: builds with it (n) and their mean gauntlet score, beside those without it. */
export type TraitStats = Record<TraitKey, { n: number; mean: number; restN: number; restMean: number }>;
export interface Calibration { rank: number; of: number; score: Rate; build: Build; cost: number; popCost: Spend }

/** 0.6.1a harness v2: K random 50/50 splits of a hero's population, each half played against the
 *  other (both sides, same seeds per pairing). A noise gauge (about 50%), not a balance target:
 *  v1's single split swung 35%-68% on sampling noise alone (races tuning v1). */
export interface SplitStats { mean: number; min: number; max: number; splits: number[] }

/** Share of a hero's modules (items + mods, fusible defs only) at each star, and merged modules
 *  (stars > 1) per build. */
export interface StarMix { n: number; p1: number; p2: number; p3: number; medianMerged: number; maxMerged: number }

/** One benched deck of a row: its source (elite or par deck) and its paired delta, the mean over
 *  its gauntlet jobs of (points at the star - points at 1 star), as a win rate (0-1 scale). */
export interface BenchDeck { tag: string; par: boolean; delta: number }

export type BenchFlag = "WORSE" | "NO EFFECT" | "SAME AS ★2" | "STEP WORSE";

/** Part 2: the STEP column of a 3-star row. Per deck whose 2-star variant was also played, its paired step =
 *  the mean over its gauntlet jobs of (points at 3 stars - points at 2 stars), on the SAME seeds and sides
 *  (both variants of a source deck use benchSeeds keyed by that deck). D1 on the steps: STEP WORSE. */
export interface BenchStep { n: number; mean: number; worse: number; ci: [number, number] | null; decks: BenchDeck[] }

/** Star bench row (ARSENAL.md §9.2, "per-star win-rate deltas"): every elite/par deck holding
 *  `def` at 1 star, raised in place to 2 or 3 stars (same cell/turret, budget ignored), replayed
 *  against the day's gauntlet on exactly the seeds and sides its 1-star deck played (paired). */
export interface BenchRow {
  def: string;
  star: 2 | 3;
  n: number; // decks benched: instances of def at 1 star whose 1-star deck and star variant the game can build
  skipped: number; // instances not played at this star: the variant (or its 1-star deck) holds an unfused pair
  skippedBase: number; // of skipped: the 1-star deck itself holds an unfused pair (e.g. a par deck with 2 copies)
  wr1: Rate; // description: pooled Wilson rates over the n decks' battles
  wrN: Rate;
  delta: number; // wrN.p - wr1.p = the mean of the decks' paired deltas
  worse: number; // decks whose paired delta is below 0
  ci: [number, number] | null; // 95% t-interval of the mean paired delta over decks (n >= 2)
  same2?: number; // 3-star rows: decks whose 2-star variant was also played (the SAME AS 2-star comparison)
  perk?: string; // 0.6.1p: the perk at this star, from the game's own stars.ts perkAt (report only; absent: none)
  step?: BenchStep; // part 2, 3-star rows: each comparable deck's paired 3-star minus 2-star delta
  flags: BenchFlag[];
  decks: BenchDeck[]; // every benched deck with its paired delta (the report lists them for WORSE rows)
}

/** D1 (F9): the deck is the unit. WORSE needs at least 3 decks, a mean paired delta below 0, and
 *  the 95% t-interval of that mean entirely below 0. */
export const BENCH_MIN_DECKS = 3;
export function benchWorse(deltas: number[]): boolean {
  if (deltas.length < BENCH_MIN_DECKS) return false;
  const { mean, ci } = meanCI(deltas);
  return mean < 0 && ci !== null && ci[1] < 0;
}

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
  // 0.6.1a harness v2 additions (populated when o.stars === "on"); every v1 field above is unchanged.
  mirror2?: Partial<Record<HeroId, SplitStats>>;
  starMix?: Partial<Record<HeroId, { pop: StarMix; elites: StarMix }>>;
  bench?: BenchRow[];
  // 0.6.1b harness v2 part 2 (populated when cores are on): bought cores in the population and the elites.
  coreUse?: Partial<Record<HeroId, { pop: CoreUse; elites: CoreUse }>>;
  // part 2 (stars on, report only): the PAR~ decks' KNOWN_FALLS copies at 1/2/3 stars (focusBench)
  parTilde?: FocusDeck[];
  // part 2 (stars on, report only, optional): splitter at 1/2/3 stars with / without HOPPER 3-star on its turret
  hopperSplitter?: { with: FocusDeck[]; without: FocusDeck[] };
  // 0.6.1c harness v2 part 3 (populated only when factories are on, so a factories-off day is part 2's exactly)
  factoryUse?: Partial<Record<HeroId, { pop: FactoryUse; elites: FactoryUse }>>;
  factory?: FactoryRow[]; // the FACTORY table: the bench's factory rows, split by hero (and GANTRY PRESS by routes fed)
  pressSlot?: PressSlot; // report only: decks holding a STAMP PRESS with the Press swapped for each factory at 1-3 stars
}

/** 0.6.1c: factories in a set of builds. byDef: decks holding the def and its copies at 1/2/3 stars; gantryRoutes:
 *  GANTRY PRESS copies feeding 1, 2 and 3 routes; slag: speed gates the shopper kept off slag routes (population
 *  only: from its Shopped counts); slagSpeed: speed-rig HITS on a slag route (the shopper's rule keeps it 0);
 *  thirdArm: routes a merge's new output added (population only). */
export interface FactoryUse {
  builds: number;
  byDef: Record<string, { decks: number; stars: [number, number, number] }>;
  gantryRoutes: [number, number, number];
  slag: SlagCount;
  slagSpeed: number;
  thirdArm: number;
}

export function factoryUseOf(builds: Build[], shops?: { slag: SlagCount; thirdArm: number }[]): FactoryUse {
  const byDef: FactoryUse["byDef"] = {};
  for (const d of FACTORY_DEFS) byDef[d] = { decks: 0, stars: [0, 0, 0] };
  const gantryRoutes: [number, number, number] = [0, 0, 0];
  let slagSpeed = 0;
  for (const b of builds) {
    const held = new Set<string>();
    for (const p of b.items) {
      if (!byDef[p.def]) continue;
      held.add(p.def);
      byDef[p.def].stars[starsOf(p) - 1]++;
      if (p.def === "gantry") { const n = routesOf(b, p.uid).length; if (n >= 1 && n <= 3) gantryRoutes[n - 1]++; }
    }
    for (const d of held) byDef[d].decks++;
    const slag = fixedSpeedCells(b);
    for (const route of rigHits(b)) for (const tile of route) for (const hit of tile) {
      if (slag.has(hit.cell) && isSpeedGate(ITEMS[hit.def])) slagSpeed++;
    }
  }
  const slag = { skipped: 0, steered: 0 };
  let thirdArm = 0;
  for (const s of shops ?? []) { slag.skipped += s.slag.skipped; slag.steered += s.slag.steered; thirdArm += s.thirdArm; }
  return { builds: builds.length, byDef, gantryRoutes, slag, slagSpeed, thirdArm };
}

/** 0.6.1c: every factory a hero can buy, STAMP PRESS first (shopFactories; the same for every hero at 4ecf202). */
export const FACTORY_DEFS: readonly string[] = shopFactories("furnace").map((d) => d.id).sort((a, b) => (a === "press" ? -1 : b === "press" ? 1 : 0));

/** 0.6.1c: one split of a FACTORY row (a hero, or a GANTRY PRESS route count): decks and paired deltas. */
export interface FactorySplit { key: string; n: number; d12: number; ci12: [number, number] | null; worse: boolean; nStep: number; step: number; ciStep: [number, number] | null; stepWorse: boolean; decks: BenchDeck[]; steps: BenchDeck[] }
/** 0.6.1c: the FACTORY table row of one factory on one day, from the star bench's def*2 and def*3 rows (the same
 *  paired decks): 1->2 = the 2-star row's paired delta, 1->3 = the 3-star row's, 2->3 = its STEP. */
export interface FactoryRow { def: string; all: FactorySplit; d13: number; flags: BenchFlag[]; byHero: FactorySplit[]; byRoutes?: FactorySplit[] }

const splitOf = (key: string, decks: BenchDeck[], steps: BenchDeck[]): FactorySplit => {
  const a = meanCI(decks.map((d) => d.delta)), s = meanCI(steps.map((d) => d.delta));
  return {
    key, n: decks.length, d12: decks.length ? a.mean : 0, ci12: a.ci, worse: benchWorse(decks.map((d) => d.delta)),
    nStep: steps.length, step: steps.length ? s.mean : 0, ciStep: s.ci, stepWorse: benchWorse(steps.map((d) => d.delta)), decks, steps,
  };
};

/** 0.6.1c: the FACTORY table from the bench rows. A benched deck holds its factory at 1 star exactly once (a
 *  second 1-star copy is an unfused pair, which the bench never plays), so (tag, def) names the instance. */
export function factoryRows(rows: BenchRow[], sources: BenchSource[]): FactoryRow[] {
  const src = new Map(sources.map((s) => [s.tag, s]));
  const out: FactoryRow[] = [];
  for (const def of FACTORY_DEFS) {
    const r2 = rows.find((r) => r.def === def && r.star === 2), r3 = rows.find((r) => r.def === def && r.star === 3);
    if (!r2 && !r3) continue;
    const d12 = r2?.decks ?? [], st = r3?.step?.decks ?? [];
    const heroOf = (t: string) => src.get(t)?.hero ?? t.split(" ")[0];
    const heroes = [...new Set([...d12, ...st].map((d) => heroOf(d.tag)))];
    const row: FactoryRow = {
      def, all: splitOf("all", d12, st), d13: r3?.delta ?? 0, flags: [...(r2?.flags ?? []), ...(r3?.flags ?? [])],
      byHero: heroes.map((h) => splitOf(h, d12.filter((d) => heroOf(d.tag) === h), st.filter((d) => heroOf(d.tag) === h))),
    };
    if (def === "gantry") {
      const routes = (t: string) => {
        const b = src.get(t)?.build;
        const g = b?.items.find((p) => p.def === "gantry" && starsOf(p) === 1);
        return b && g ? routesOf(b, g.uid).length : 0;
      };
      row.byRoutes = [1, 2, 3].map((n) => splitOf(`${n} route${n > 1 ? "s" : ""}`, d12.filter((d) => routes(d.tag) === n), st.filter((d) => routes(d.tag) === n)));
    }
    out.push(row);
  }
  return out;
}

/** 0.6.1c PRESS-SLOT (report only): one deck holding a STAMP PRESS, with the Press swapped in place (same uid,
 *  cell and routes) for each factory at 1, 2 and 3 stars, against the whole gauntlet on the SAME seeds (focusSeeds
 *  keyed by this deck). cells[def][star-1]: the stats summed over the gauntlet (null: the swap holds an unfused
 *  pair, so the game can't build it). */
export interface PressSlotDeck { tag: string; hero: HeroId; par: boolean; pressStars: number; routes: number; battles: number; cells: Record<string, (JobStats | null)[]> }
/** 0.6.1c: the arsenal's own report-only rows (tests/arsenal.decks.test.ts parSwap), recomputed through the harness:
 *  par/furnace/6 with its Press swapped, against par/weaver/6 over seeds 1-5; mean damage dealt, wins, jams per fight. */
export interface ArsenalSlotRow { def: string; dmg: [number, number, number]; wins: [number, number, number]; jams: [number, number, number] }
export interface PressSlot { decks: PressSlotDeck[]; arsenal: ArsenalSlotRow[] }

export const PRESS_SLOT_KEY = "bb-bench-pressslot";
export const ARSENAL_SLOT_SEEDS: readonly number[] = [1, 2, 3, 4, 5];

/** `b` with its first STAMP PRESS (as parSwap finds it) swapped for `def` at `stars`, in place. */
export function pressSwap(b: Build, def: string, stars: number): Build {
  const c = JSON.parse(JSON.stringify(b)) as Build;
  const p = c.items.find((i) => i.def === "press")!;
  p.def = def;
  if (stars > 1) p.stars = stars;
  else delete p.stars;
  return c;
}

/** The PRESS-SLOT decks: the arsenal's par/furnace/6 (heroRefBuild("furnace", 6), the golden-060 fixture's deck;
 *  tests/harness.factories.test.ts checks it) first, then every bench source (elite or par) holding a STAMP PRESS. */
export function pressSlotSources(sources: BenchSource[]): BenchSource[] {
  const out: BenchSource[] = [{ hero: "furnace", tag: "par/furnace/6 (arsenal)", build: heroRefBuild("furnace", 6), par: true }];
  for (const s of sources) if (s.build.items.some((p) => p.def === "press")) out.push(s);
  return out;
}

export async function pressSlotBench(o: TourneyOpts, day: number, gauntlet: Build[], sources: BenchSource[], stats: StatsRunner): Promise<{ decks: PressSlotDeck[]; battles: number }> {
  const field: Build[] = [], jobs: Job[] = [];
  const G = gauntlet.length, per = o.seeds * 2;
  const slots: { src: number; def: string; star: number; f: number | null }[] = [];
  sources.forEach((s, src) => {
    for (const def of FACTORY_DEFS) {
      for (const star of [1, 2, 3]) {
        const v = pressSwap(s.build, def, star);
        if (unfusedPairs(v).length) { slots.push({ src, def, star, f: null }); continue; }
        slots.push({ src, def, star, f: field.length });
        field.push(v);
        gauntlet.forEach((_, g) => jobs.push({ a: field.length - 1, b: -1 - g, seeds: focusSeeds(o, day, src, g, PRESS_SLOT_KEY), day }));
      }
    }
  });
  const decks: PressSlotDeck[] = sources.map((s) => {
    const p = s.build.items.find((i) => i.def === "press")!;
    return { tag: s.tag, hero: s.hero, par: !!s.par, pressStars: starsOf(p), routes: routesOf(s.build, p.uid).length, battles: G * per, cells: {} };
  });
  if (!jobs.length) return { decks, battles: 0 };
  for (const j of jobs) j.b = field.length + (-1 - j.b);
  const res = await stats([...field, ...gauntlet], jobs);
  const sum = new Map<number, JobStats>();
  jobs.forEach((j, i) => {
    const t = sum.get(j.a) ?? { pts: 0, dmg: 0, jams: 0 };
    sum.set(j.a, { pts: t.pts + res[i].pts, dmg: t.dmg + res[i].dmg, jams: t.jams + res[i].jams });
  });
  for (const sl of slots) {
    const d = decks[sl.src];
    (d.cells[sl.def] ??= [null, null, null])[sl.star - 1] = sl.f === null ? null : sum.get(sl.f)!;
  }
  return { decks, battles: jobs.length * per };
}

/** The arsenal's report-only press-slot rows through the harness (see ArsenalSlotRow): 105 battles, in-process. */
export function arsenalPressSlot(): ArsenalSlotRow[] {
  const deck = heroRefBuild("furnace", 6), opp = heroRefBuild("weaver", 6);
  return FACTORY_DEFS.map((def) => {
    const row: ArsenalSlotRow = { def, dmg: [0, 0, 0], wins: [0, 0, 0], jams: [0, 0, 0] };
    for (const star of [1, 2, 3]) {
      // HULL-1a (REQ-BFG-079): both decks are day 6's (heroRefBuild(..., 6)), so the fights are on day 6
      const fights = ARSENAL_SLOT_SEEDS.map((seed) => simulate(pressSwap(deck, def, star), JSON.parse(JSON.stringify(opp)) as Build, seed, undefined, undefined, 6));
      row.dmg[star - 1] = fights.reduce((a, b) => a + b.sides[0].stats.damage, 0) / fights.length;
      row.wins[star - 1] = fights.filter((b) => b.winner === 0).length;
      row.jams[star - 1] = fights.reduce((a, b) => a + b.sides[0].stats.jams, 0) / fights.length;
    }
    return row;
  });
}

/** 0.6.1b: bought turret cores in a set of builds: builds with at least one, cores fitted, per def, per star.
 *  0.6.1p: ramOnGatling = turrets carrying FINISHER RAM gear under a GATLING SPOOL core (content.ts:278: the ram
 *  does nothing there, battle.ts:597; the game allows the pair, so the harness counts it and doesn't forbid it). */
export interface CoreUse { builds: number; withCore: number; cores: number; byDef: Record<string, number>; stars: [number, number, number]; ramOnGatling: number }

export function coreUseOf(builds: Build[]): CoreUse {
  const byDef: Record<string, number> = {};
  const stars: [number, number, number] = [0, 0, 0];
  let withCore = 0, cores = 0, ramOnGatling = 0;
  for (const b of builds) {
    const cs = b.mods.filter((m) => ITEMS[m.def]?.kind === "core");
    if (cs.length) withCore++;
    cores += cs.length;
    for (const c of cs) {
      byDef[c.def] = (byDef[c.def] ?? 0) + 1;
      stars[starsOf(c) - 1]++;
      if (c.def === "gatling" && b.mods.some((m) => m.turret === c.turret && m.def === "ram")) ramOnGatling++;
    }
  }
  return { builds: builds.length, withCore, cores, byDef, stars, ramOnGatling };
}

export interface TourneyResult { opts: TourneyOpts; days: DayResult[]; battles: number }

const pk = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);

export function spendOf(costs: number[]): Spend {
  const s = [...costs].sort((a, b) => a - b), n = s.length;
  if (!n) return { median: 0, min: 0, max: 0 };
  return { median: n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2, min: s[0], max: s[n - 1] };
}

export async function runTournament(o: TourneyOpts, run: Runner = localRunner, log?: (m: string) => void, detail: DetailRunner = localDetail): Promise<TourneyResult> {
  const days: DayResult[] = [];
  let battles = 0;
  for (const day of o.days) {
    const r = await runDay(o, day, run, detail);
    battles += r.battles;
    log?.(`day ${day}: ${r.battles} battles`);
    days.push(r);
  }
  return { opts: o, days, battles };
}

export async function runDay(o: TourneyOpts, day: number, run: Runner, detail: DetailRunner = localDetail, stats: StatsRunner = localStats): Promise<DayResult> {
  const field: Entry[] = [];
  const blank: Rate = { p: 0, lo: 0, hi: 0, n: 0, pts: 0 };
  const shopped = new Map<number, Shopped>(); // 0.6.1c: field index -> its shopper's counts (the usage table)
  for (const hero of o.heroes) {
    for (let i = 0; i < o.pop; i++) {
      // randomBuild(...) is shopBuild(...).build: the same draws; 0.6.1c keeps the shopper's slag/new-output counts
      const sb = shopBuild(hero, day, new Rng(hashSeed("bb-pop", o.seed, hero, day, i)), o.stars, FUSE_MAX, coresOn(o) ? "on" : "off", undefined, factoriesOn(o) ? "on" : "off");
      const build = sb.build;
      shopped.set(field.length, sb);
      field.push({ hero, idx: i, ref: false, build, cost: buildCost(build).total, score: blank });
    }
    if (o.calibrationDays.includes(day)) {
      const build = await parReference(hero, day, run, o.par ?? "heroref"); // FB-C: THE par, one deck (par.ts)
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
      jobs.push({ a, b, seeds: seedsFor(a, b), day });
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

  let mirror2: DayResult["mirror2"], starMix: DayResult["starMix"], bench: DayResult["bench"], coreUse: DayResult["coreUse"];
  let parTilde: DayResult["parTilde"], hopperSplitter: DayResult["hopperSplitter"];
  let factoryUse: DayResult["factoryUse"], factory: DayResult["factory"], pressSlot: DayResult["pressSlot"];
  if (o.stars === "on") {
    mirror2 = {};
    starMix = {};
    if (coresOn(o)) coreUse = {};
    for (const h of o.heroes) {
      const popBuilds = popOf(h).map((i) => field[i].build);
      const r = await mirrorSplits(o, day, h, popBuilds, run);
      mirror2[h] = r.stats;
      battles += r.battles;
      starMix[h] = { pop: starMixOf(popBuilds), elites: starMixOf(elites[h].map((e) => e.build)) };
      if (coreUse) coreUse[h] = { pop: coreUseOf(popBuilds), elites: coreUseOf(elites[h].map((e) => e.build)) };
    }
    const gauntletBuilds = gauntlet.map((i) => field[i].build);
    const sources: BenchSource[] = [];
    for (const h of o.heroes) {
      eliteIdx[h].forEach((i, k) => sources.push({ hero: h, tag: `${h} elite ${k}`, build: field[i].build }));
      if (calibration?.[h]) sources.push({ hero: h, tag: `${h} par`, build: calibration[h].build, par: true });
    }
    const benchRes = await starBench(o, day, gauntletBuilds, sources, run, detail);
    bench = benchRes.rows;
    battles += benchRes.battles;
    // part 2, PAR~ (report only): a merged copy (fuse.ts fuseAll, via the harness adapter) of each par deck that
    // holds an unfused pair (the main bench skips those as bases), benched for the KNOWN_FALLS defs only
    const parX: BenchSource[] = [];
    for (const h of o.heroes) {
      const pb = calibration?.[h]?.build;
      if (pb && unfusedPairs(pb).length) parX.push({ hero: h, tag: `${h} par~`, build: fuseDeck(pb).build, par: true });
    }
    const kf = await focusBench(o, day, gauntletBuilds, parX, KNOWN_FALLS_DEFS, run, "bb-bench-parx");
    parTilde = kf.decks;
    battles += kf.battles;
    // part 2, optional (report only): SPLITTER at 1/2/3 stars with HOPPER at 3 stars on its turret, beside
    // the same decks without it, on shared seeds (both lists use the same focus key and source index)
    const hp = hopperSources(sources);
    const withH = await focusBench(o, day, gauntletBuilds, hp.with, ["splitter"], run, "bb-bench-hopper");
    const without = await focusBench(o, day, gauntletBuilds, hp.without, ["splitter"], run, "bb-bench-hopper");
    hopperSplitter = { with: withH.decks, without: without.decks };
    battles += withH.battles + without.battles;
    if (factoriesOn(o)) {
      // 0.6.1c (part 3): the usage table, the FACTORY table (from the bench rows above: no new battle) and PRESS-SLOT
      factoryUse = {};
      for (const h of o.heroes) {
        const idx = popOf(h);
        factoryUse[h] = { pop: factoryUseOf(idx.map((i) => field[i].build), idx.map((i) => shopped.get(i)!)), elites: factoryUseOf(elites[h].map((e) => e.build)) };
      }
      factory = factoryRows(bench, sources);
      const ps = await pressSlotBench(o, day, gauntletBuilds, pressSlotSources(sources), stats);
      pressSlot = { decks: ps.decks, arsenal: arsenalPressSlot() };
      battles += ps.battles;
    }
  }

  const rigs = rigValues(field.filter((e) => !e.ref).map((e) => e.build)); // 0.6.2 BELTSIDE H1
  return { day, budget: maxGoldByDay(day), battles, pop, elite, elites, calibration, popScores, spend, traits, rigs, mirror2, starMix, bench, ...(coreUse ? { coreUse } : {}), ...(parTilde ? { parTilde } : {}), ...(hopperSplitter ? { hopperSplitter } : {}), ...(factoryUse ? { factoryUse } : {}), ...(factory ? { factory } : {}), ...(pressSlot ? { pressSlot } : {}) };
}

// ---------------------------------------------------------------- 0.6.1a harness v2

/** K=4 random 50/50 splits of `pop`, each half played against the other (both sides, `o.seeds`
 *  seeds per pairing). Report the mean and the min-max over the splits: a noise gauge, not a
 *  balance target (see SplitStats doc). */
export async function mirrorSplits(o: TourneyOpts, day: number, hero: HeroId, pop: Build[], run: Runner, K = 4): Promise<{ stats: SplitStats; battles: number }> {
  const per = o.seeds * 2;
  const splits: number[] = [];
  let battles = 0;
  for (let k = 0; k < K; k++) {
    if (pop.length < 2) { splits.push(0.5); continue; }
    const idx = new Rng(hashSeed("bb-mirror-split", o.seed, day, hero, k)).shuffle(pop.map((_, i) => i));
    const half = Math.floor(idx.length / 2);
    const A = idx.slice(0, half), B = idx.slice(half);
    const jobs: Job[] = [];
    for (const a of A) for (const b of B) {
      jobs.push({ a, b, seeds: Array.from({ length: o.seeds }, (_, s) => hashSeed("bb-mirror-battle", o.seed, day, hero, k, a, b, s)), day });
    }
    const pts = await run(pop, jobs);
    const total = pts.reduce((s, p) => s + p, 0);
    battles += jobs.length * per;
    splits.push(jobs.length ? total / (jobs.length * per) : 0.5);
  }
  return { stats: { mean: splits.reduce((s, x) => s + x, 0) / splits.length, min: Math.min(...splits), max: Math.max(...splits), splits }, battles };
}

/** Share of fusible modules (items + mods) at each star, and merged (>1 star) modules per build. */
export function starMixOf(builds: Build[]): StarMix {
  const stars: number[] = [];
  const merged: number[] = [];
  for (const b of builds) {
    let m = 0;
    for (const p of [...b.items, ...b.mods]) {
      if (!fusible(p.def)) continue;
      const s = starsOf(p);
      stars.push(s);
      if (s > 1) m++;
    }
    merged.push(m);
  }
  const n = stars.length;
  const share = (s: number) => (n ? stars.filter((x) => x === s).length / n : 0);
  const sorted = [...merged].sort((a, b) => a - b), mn = sorted.length;
  const median = mn ? (mn % 2 ? sorted[(mn - 1) / 2] : (sorted[mn / 2 - 1] + sorted[mn / 2]) / 2) : 0;
  return { n, p1: share(1), p2: share(2), p3: share(3), medianMerged: median, maxMerged: mn ? sorted[mn - 1] : 0 };
}

export interface BenchSource { hero: HeroId; tag: string; build: Build; par?: boolean }

function withStar(b: Build, kind: "item" | "mod", uid: number, star: number): Build {
  const c = JSON.parse(JSON.stringify(b)) as Build;
  const arr = (kind === "item" ? c.items : c.mods) as { uid: number; stars?: number }[];
  const o = arr.find((x) => x.uid === uid)!;
  if (star > 1) o.stars = star;
  else delete o.stars;
  return c;
}

interface BenchInstance { src: number; def: string; kind: "item" | "mod"; uid: number }

/** Seeds of the star bench: keyed by the SOURCE deck (not by field index), so the 1-star deck and
 *  every 2- and 3-star variant of it play gauntlet member `g` on exactly the same seeds (F1). */
export function benchSeeds(o: TourneyOpts, day: number, src: number, g: number): number[] {
  return Array.from({ length: o.seeds }, (_, k) => hashSeed("bb-bench-battle", o.seed, day, src, g, k));
}

/**
 * ARSENAL.md §9.2: per-star win-rate deltas, so the balance pass catches "merging made it worse".
 * For every elite/par deck (`sources`) and every fusible module it holds at 1 star, two variants
 * (2 and 3 stars, same cell/turret, budget ignored).
 * - Paired (F1): the 1-star deck and all its variants play each gauntlet member on the same seeds
 *   (benchSeeds, keyed by the source deck), from both sides; the 1-star deck is played once.
 * - Reachable only (F5): a variant, or a 1-star deck, holding an unfused pair (the game would have
 *   fused it) is not played; each row counts its skipped instances (skippedBase: the 1-star deck).
 * - Per def x star: every deck's paired delta; WORSE by the decks (D1, F9: benchWorse); the Wilson
 *   rates stay as description. NO EFFECT: every battle of every deck ends exactly as at 1 star
 *   (winner, both hulls, duration), so its delta is exactly 0. SAME AS ★2 (3-star rows): every
 *   battle ends exactly as at 2 stars. The exact outcomes come from `detail`, which replays the
 *   same jobs (same seeds) only for decks whose points already match job for job.
 */
export async function starBench(o: TourneyOpts, day: number, gauntlet: Build[], sources: BenchSource[], run: Runner, detail: DetailRunner = localDetail): Promise<{ rows: BenchRow[]; battles: number }> {
  const insts: BenchInstance[] = [];
  sources.forEach((s, src) => {
    for (const p of s.build.items) if (fusible(p.def) && starsOf(p) === 1) insts.push({ src, def: p.def, kind: "item", uid: p.uid });
    for (const m of s.build.mods) if (fusible(m.def) && starsOf(m) === 1) insts.push({ src, def: m.def, kind: "mod", uid: m.uid });
  });
  if (!insts.length || !gauntlet.length) return { rows: [], battles: 0 };
  const per = o.seeds * 2, G = gauntlet.length;
  const baseOk = sources.map((s) => unfusedPairs(s.build).length === 0);
  // field: a source's 1-star deck (once, before its first played variant), then that variant
  const field: Build[] = [], fieldSrc: number[] = [];
  const baseAt = new Map<number, number>();
  const at: Partial<Record<1 | 2 | 3, number>>[] = insts.map(() => ({}));
  insts.forEach((inst, i) => {
    if (!baseOk[inst.src]) return;
    for (const star of [2, 3] as const) {
      const v = withStar(sources[inst.src].build, inst.kind, inst.uid, star);
      if (unfusedPairs(v).length) continue;
      if (!baseAt.has(inst.src)) {
        baseAt.set(inst.src, field.length);
        field.push(sources[inst.src].build);
        fieldSrc.push(inst.src);
      }
      at[i][1] = baseAt.get(inst.src)!;
      at[i][star] = field.length;
      field.push(v);
      fieldSrc.push(inst.src);
    }
  });
  const allField = [...field, ...gauntlet];
  const jobsOf = (fs: number[]): Job[] => fs.flatMap((f) => gauntlet.map((_, g): Job => ({ a: f, b: field.length + g, seeds: benchSeeds(o, day, fieldSrc[f], g), day })));
  const jobs = jobsOf(field.map((_, f) => f));
  const pts = field.length ? await run(allField, jobs) : [];
  const ptsOf = (f: number, g: number) => pts[f * G + g];
  const sumOf = (f: number) => gauntlet.reduce((s, _, g) => s + ptsOf(f, g), 0);
  const samePts = (f: number, h: number) => gauntlet.every((_, g) => ptsOf(f, g) === ptsOf(h, g));

  const groups = new Map<string, { insts: number[]; star: 2 | 3 }>();
  insts.forEach((inst, i) => {
    for (const star of [2, 3] as const) {
      const k = `${inst.def}*${star}`;
      if (!groups.has(k)) groups.set(k, { insts: [], star });
      groups.get(k)!.insts.push(i);
    }
  });
  const keys = [...groups.keys()].sort((a, b) => (a < b ? -1 : 1));
  const played = (i: number, star: 1 | 2 | 3) => at[i][star] !== undefined;
  // exact outcomes are needed only where the points agree on every job (else the outcomes differ)
  const need = new Set<number>();
  const noEffectCand = new Map<string, boolean>(), same2Cand = new Map<string, boolean>();
  for (const k of keys) {
    const g = groups.get(k)!, ds = g.insts.filter((i) => played(i, g.star));
    const ne = ds.length > 0 && ds.every((i) => samePts(at[i][1]!, at[i][g.star]!));
    noEffectCand.set(k, ne);
    if (ne) for (const i of ds) need.add(at[i][1]!).add(at[i][g.star]!);
    if (g.star === 3) {
      const cs = ds.filter((i) => played(i, 2));
      const s2 = cs.length > 0 && cs.every((i) => samePts(at[i][2]!, at[i][3]!));
      same2Cand.set(k, s2);
      if (s2) for (const i of cs) need.add(at[i][2]!).add(at[i][3]!);
    }
  }
  const needed = [...need].sort((a, b) => a - b);
  const replay = jobsOf(needed);
  const sig = new Map<number, string[]>();
  if (replay.length) {
    const out = await detail(allField, replay);
    needed.forEach((f, j) => sig.set(f, out.slice(j * G, (j + 1) * G)));
  }
  const sameOutcome = (f: number, h: number) => gauntlet.every((_, g) => sig.get(f)![g] === sig.get(h)![g]);

  const rows: BenchRow[] = [];
  for (const k of keys) {
    const g = groups.get(k)!, def = k.slice(0, k.indexOf("*"));
    const ds = g.insts.filter((i) => played(i, g.star));
    const skippedBase = g.insts.filter((i) => !baseOk[insts[i].src]).length;
    let pts1 = 0, ptsN = 0;
    const decks: BenchDeck[] = ds.map((i) => {
      const s1 = sumOf(at[i][1]!), sN = sumOf(at[i][g.star]!), src = sources[insts[i].src];
      pts1 += s1;
      ptsN += sN;
      return { tag: src.tag, par: !!src.par, delta: (sN - s1) / (G * per) };
    });
    const n1 = ds.length * G * per;
    const wr1 = wilson(pts1, n1), wrN = wilson(ptsN, n1);
    const deltas = decks.map((d) => d.delta);
    const flags: BenchFlag[] = [];
    if (benchWorse(deltas)) flags.push("WORSE");
    if (noEffectCand.get(k) && ds.every((i) => sameOutcome(at[i][1]!, at[i][g.star]!))) flags.push("NO EFFECT");
    let same2: number | undefined, step: BenchStep | undefined;
    if (g.star === 3) {
      const cs = ds.filter((i) => played(i, 2));
      same2 = cs.length;
      if (same2Cand.get(k) && cs.every((i) => sameOutcome(at[i][2]!, at[i][3]!))) flags.push("SAME AS ★2");
      // part 2 STEP: the 2- and 3-star variants of one instance share every seed (benchSeeds by source deck)
      const sd: BenchDeck[] = cs.map((i) => {
        const src = sources[insts[i].src];
        return { tag: src.tag, par: !!src.par, delta: (sumOf(at[i][3]!) - sumOf(at[i][2]!)) / (G * per) };
      });
      const sds = sd.map((x) => x.delta);
      step = { n: sd.length, mean: sds.length ? sds.reduce((s, x) => s + x, 0) / sds.length : 0, worse: sds.filter((x) => x < 0).length, ci: meanCI(sds).ci, decks: sd };
      if (benchWorse(sds)) flags.push("STEP WORSE");
    }
    const perk = perkAt(def, g.star); // 0.6.1p: the game's own name for the level (report only)
    rows.push({
      def, star: g.star, n: ds.length, skipped: g.insts.length - ds.length, skippedBase, wr1, wrN, delta: wrN.p - wr1.p,
      worse: deltas.filter((d) => d < 0).length, ci: meanCI(deltas).ci, ...(same2 !== undefined ? { same2 } : {}), ...(perk ? { perk } : {}),
      ...(step ? { step } : {}), flags, decks,
    });
  }
  return { rows, battles: (jobs.length + replay.length) * per };
}

/** Part 2: the two modules tests/arsenal.decks.test.ts lists in KNOWN_FALLS at c432bee (SPLITTER 2->3, BRAKE
 *  SHOE 1->2->3). The KNOWN_FALLS report rows and the PAR~ bench cover exactly these. */
export const KNOWN_FALLS_DEFS: readonly string[] = ["splitter", "brake"];

/** Part 2 (report only): one copy of a focus def on a focus deck, with its points at 1, 2 and 3 stars against the
 *  whole gauntlet (null: that variant holds an unfused pair, so the game can't build it), on shared seeds. */
export interface FocusDeck { tag: string; hero: HeroId; par: boolean; def: string; uid: number; stars0: number; valid: boolean; pts: [number | null, number | null, number | null]; n: number }

/** Seeds of the focus bench: keyed by the focus deck (a separate stream from benchSeeds), so a copy's 1-, 2- and
 *  3-star variants play every gauntlet member on the same seeds. */
export function focusSeeds(o: TourneyOpts, day: number, src: number, g: number, key = "bb-bench-focus"): number[] {
  return Array.from({ length: o.seeds }, (_, k) => hashSeed(key, o.seed, day, src, g, k));
}

/**
 * Part 2, PAR~ (report only; never in the main bench or its flags): every copy of a `defs` module on each source
 * deck, at 1, 2 and 3 stars in place (budget ignored), against the gauntlet on paired seeds. Unlike the main
 * bench a copy may start above 1 star (a merged par deck may hold a 2-star BRAKE SHOE): all three levels are set.
 */
export async function focusBench(o: TourneyOpts, day: number, gauntlet: Build[], sources: BenchSource[], defs: readonly string[], run: Runner, key = "bb-bench-focus"): Promise<{ decks: FocusDeck[]; battles: number }> {
  const field: Build[] = [], jobs: Job[] = [];
  const G = gauntlet.length, per = o.seeds * 2;
  const decks: FocusDeck[] = [];
  const slot: (number | null)[][] = [];
  sources.forEach((s, src) => {
    const copies = [...s.build.items.map((p) => ({ p, kind: "item" as const })), ...s.build.mods.map((p) => ({ p, kind: "mod" as const }))].filter((c) => defs.includes(c.p.def));
    for (const { p, kind } of copies) {
      const at: (number | null)[] = [];
      for (const star of [1, 2, 3]) {
        const v = withStar(s.build, kind, p.uid, star);
        if (unfusedPairs(v).length) { at.push(null); continue; }
        at.push(field.length);
        field.push(v);
      }
      slot.push(at);
      decks.push({ tag: s.tag, hero: s.hero, par: !!s.par, def: p.def, uid: p.uid, stars0: starsOf(p), valid: validateBuild(s.build, day).ok, pts: [null, null, null], n: G * per });
      at.forEach((f) => { if (f !== null) gauntlet.forEach((_, g) => jobs.push({ a: f, b: -1 - g, seeds: focusSeeds(o, day, src, g, key), day })); });
    }
  });
  if (!jobs.length) return { decks, battles: 0 };
  const allField = [...field, ...gauntlet];
  for (const j of jobs) j.b = field.length + (-1 - j.b);
  const pts = await run(allField, jobs);
  const sum = new Map<number, number>();
  jobs.forEach((j, i) => sum.set(j.a, (sum.get(j.a) ?? 0) + pts[i]));
  decks.forEach((d, i) => { d.pts = slot[i].map((f) => (f === null ? null : sum.get(f)!)) as FocusDeck["pts"]; });
  return { decks, battles: jobs.length * per };
}

/** Part 2, optional: the bench decks holding a 1-star SPLITTER on a route into a turret, each paired with a copy
 *  that carries HOPPER at 3 stars as that turret's gear (replacing its gear, budget ignored). Decks
 *  the game can't build (an unfused pair) are left out. `with[k]` and `without[k]` are the same deck.
 *  beltside-062-on-061 (P16): a SPLITTER rig works a route through its hits (it stands beside the belt), so
 *  its route is the one its first hit lands on (R7 order), where v2 read the route its cell lay on. */
export function hopperSources(sources: BenchSource[]): { with: BenchSource[]; without: BenchSource[] } {
  const out = { with: [] as BenchSource[], without: [] as BenchSource[] };
  for (const s of sources) {
    const b = s.build;
    if (unfusedPairs(b).length) continue;
    const sp = b.items.find((p) => p.def === "splitter" && starsOf(p) === 1);
    if (!sp) continue;
    const ri = hitsOfRig(b, sp.uid)[0]?.route ?? -1;
    const turret = ri >= 0 ? routeInfo(b, ri).turret : -1;
    if (turret < 0) continue;
    const h = JSON.parse(JSON.stringify(b)) as Build;
    h.mods = h.mods.filter((m) => !(m.turret === turret && ITEMS[m.def]?.kind !== "core"));
    h.mods.push({ uid: 1 + Math.max(0, ...h.items.map((p) => p.uid), ...h.mods.map((m) => m.uid)), def: "hopper", turret, stars: 3 });
    if (unfusedPairs(h).length) continue;
    out.with.push({ ...s, tag: `${s.tag} +HOPPER★3`, build: h });
    out.without.push(s);
  }
  return out;
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
