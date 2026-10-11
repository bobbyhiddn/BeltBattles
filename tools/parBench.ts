// Par bench CLI (FB-C): npm run parbench -- <mode> [--days 1,5,10] [--workers 4] [--out dir] [--cache dir]
//   [--heroes furnace,weaver] [--k 12] [--policy typical|sharp] [--tune knob=value,...] [--tag name]
// Modes (any combination; each writes <out>/<mode>-<tag>.json and prints a summary):
//   --spend     no battles: the par field's deck value as a share of maxGoldByDay per hero-day, with the reroll
//               gold, the loss on replaced parts sold and the unspent gold apart (together: maxGoldByDay)
//   --pct       the par field's strength percentile inside the harness's full-purse population (the stand-in
//               generator's population and gauntlet, seed 1: 64 standInCandidate builds scored against 20 fullPurseBuild
//               builds per pool hero, 2 seeds x both sides); population scores are cached in <cache>/pop-<hero>-<day>.json
//   --pool      the shipped stand-in pool (v2.1) against the par field (brief 4a); step 5: [--pool-data <file>] the picks
//               of that data module instead (a dry candidate), with the same seeds
//   --rivals    [--seeds 4] [--tq-seeds 20] the captains against the par field and honestReference (brief 4b-4d); TUNE-C:
//               per field (FURNACE, WEAVER, both), the par field's top quartile / decile vs Hard, the stand-ins' fight
//               lengths; [--ids a,b] [--no-honest] [--no-tq] [--tq-pop] (the full-purse population's top quartile);
//               0.8.0 N1: [--fields furnace,weaver,foundry,bastion] adds par fields beside FURNACE and WEAVER
//   --ladder    [--seeds 4] the skill ladder: par vs the random-pick field, calm and sharp vs the par field (brief 0c)
//   --mix       no battles: the spend mix of the par field and the full-purse population, and supply offer rates
//   --desk      [--seeds 10] the desk run's seeded pool ghosts (scripts/singlefile.mjs) against the par field (step 5)
// 0.6.2 CAND-A (ref/BRIEF-final-062-cand.md section 3; see the CAND-A section below):
//   --uptake    no battles: turrets, gear, joins, two-belt rigs, landed arrows and FURNACE's F1 in the par field
//   --extra     [--seeds 4] flag 1: the extra turret slot's lift on the par decks that fill it
//   --ctrl K    [--seeds 4] [--sample N] a knob's control (join, turret, extra): each par deck against the same seed's
//               run with --tune K=0 (the gold re-spent), beside the flag-3 ablation of the same part and its dead belts
//   --stars     [--seeds 4] flag 2: starting turrets at 1/2/3 stars on the par decks (default --heroes weaver)
//   --ablate    [--seeds 4] [--min 3] flag 3: each part's lift (whole deck vs the deck without it), REQ-BFG-033 (4)
//   --joins     [--seeds 10] flag 4: junction-062's bench layouts against the par field; with --foes gauntlet
//               [--seeds 12] against junction-062's own foes and seeds (its REPORT section 8 bench, on this head)
//   --fingerprint  no battles: a hash of every par deck per hero-day (a refactor must not move them)
// 0.6.2 TUNE-M (ref/BRIEF-final-062-tune.md T1):
//   --forbid d1,d2  [--seeds 4] [--sample N] a part's control: each par deck against the same seed's run with
//               --tune forbid=<def> (the part never taken, the gold re-spent), over the decks that hold it, beside its
//               ablation; one forbid-<def>-<tag>-d<day>.json per def
//   --rigs      [--sample N] [--rigs-all] no battles: each multi-arrow rig's copies, landed arrows (one belt / two belts)
//               and gold per landed arrow in the par decks (T3); --rigs-all counts the 1-arrow rigs too
//   --partstars d1,d2  [--seeds 4] [--sample N] a changed part's merge steps on the par decks that hold it (T6):
//               every copy at 1, 2 and 3 stars in place, paired; WORSE / STEP WORSE by the star bench's D1 rule
// 0.6.2 TUNE-C (ref/BRIEF-final-062-captains.md section 3 item 5):
//   --synergy   [--seeds 4] [--variants 3] [--ids a,b] the synergy check: each captain's named build on days 5 and 9
//               (the Iron Matriarch on day 10; --days picks others) against copies with its synergy parts swapped for
//               off-plan parts of the same cost in the same slots (src/sim/harness/synergy.ts), paired per par member;
//               0.8.0 N1: [--fields ...] as for --rivals
// Battles fan out to worker threads; results are keyed by job, so they never depend on --workers.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { isMainThread } from "node:worker_threads";
import { hashSeed } from "../src/core/rng";
import { HEROES as HEROES_DEF, ITEMS, type HeroId } from "../src/sim/content";
import { newRun, rollShop } from "../src/game/run";
import { honestStandInBuild, strongHonestBuild } from "../src/game/honest";
import {
  TURRET_UID0, beltUsed, clearJoin, cloneBuild, feedOf, gearOn, gearSlotsAt, hullSlots, installTurret, installedTurrets,
  joinOf, key as K, moveTurret, occupancy, pruneJoins, removeItem, removeTurret, rigArrows, rigHits, rotField, setTurretList,
  turretList, turretSlots, type Build, type Placed, type RouteDef,
} from "../src/sim/deck";
import { heroRefBuild } from "../src/sim/heroBuilds";
import { buildCost, maxGoldByDay, validateBuild } from "../src/net/validate";
import { FUSE_MAX, starsOf, valueOf } from "../src/sim/stars";
import { fullPurseBuild, spendFloor } from "../src/sim/harness/gen";
import { STANDIN_DEFAULTS, decodeStandInCode, standInCandidate, standInCodeOf, writtenPicks } from "../src/sim/harness/standins";
import { describeBuild } from "../src/sim/harness/report";
import { PAR_K, parField, parSeeds, roundRobin, vsPar, type VsPar } from "../src/sim/harness/par";
import { nearestRank } from "../src/sim/harness/luck";
import { fmtRate, meanCI, wilson } from "../src/sim/harness/stats";
import { decodeStarred, standInPool } from "../src/sim/standInPool";
import { playerBuild, playerRun, refeedRoute, type PlayerOpts } from "../src/sim/harness/player";
import { RATING_CLIFF, RATING_CURVE, rateDeck } from "../src/sim/deckRating";
import { RIVALS, RIVAL_IDS, deckCost, difficultyOf, honestReference, rivalBuild, rivalDays, standInBuild, type RivalId } from "../src/sim/rivals";
import { PLANS } from "../src/sim/rivalBuilds";
import { synergySwap, type Swap } from "../src/sim/harness/synergy";
import type { DetailRunner, Job, Runner } from "../src/sim/harness/tournament";
import { DEFAULT_OPTS, focusSeeds } from "../src/sim/harness/tournament";
import { HARNESS_HEROES } from "../src/sim/harness/heroes";
import { flag, num, serveJobs, workerRunner } from "./workers";
import { ladderFixRules, setLadderFix } from "../src/sim/ladderFix"; // HULL-1b (REQ-BFG-070): --ladder-fix
import { hullScaleRules, setHullScale } from "../src/sim/hullScale"; // HULL-1c (REQ-BFG-079): --hull-scale, N4's cache
import { setNpcDay } from "../src/sim/npcDay"; // HULL-1c (REQ-BFG-078): --npc-day
import { setPlainRigs } from "../src/sim/plainRigs"; // PLAIN-1 (REQ-BFG-084): --plain-rigs
import { setFirstRun } from "../src/sim/firstRun"; // FIRSTDAY-1 (REQ-BFG-004): --first-run

const HEROES: HeroId[] = ["furnace", "weaver"];
/** 0.8.0 N1 (REQ-BFG-024, REQ-BFG-011): the par fields --rivals and --synergy measure against, `--fields a,b,...`
 *  (default FURNACE and WEAVER). FURNACE stays the calibration field and "both" stays FURNACE + WEAVER; FOUNDRY and
 *  BASTION (`--fields furnace,weaver,foundry,bastion`) are reported beside them. A field's battle seeds are keyed by its
 *  hero, so adding a field never moves another field's numbers. */
function fieldsOf(): HeroId[] {
  const f = (flag("fields")?.split(",").filter(Boolean) as HeroId[] | undefined) ?? HEROES;
  for (const h of HEROES) if (!f.includes(h)) throw new Error(`--fields must include ${h} (the calibration field and "both")`);
  return f;
}
const norm = (b: Build): Build => decodeStandInCode(b.hero, standInCodeOf(b, "on"), "on");
const G = STANDIN_DEFAULTS.gauntlet, SEED = STANDIN_DEFAULTS.seed, SEEDS = STANDIN_DEFAULTS.seeds;

/** The stand-in generator's gauntlet of `day` (standins.ts genStandIns, seed 1, stars/cores/factories on). */
function gauntletOf(day: number): Build[] {
  return HEROES.flatMap((g) => Array.from({ length: G }, (_, i) => norm(fullPurseBuild(g, day, hashSeed("standin-gauntlet", SEED, g, day, i), spendFloor(day), 60, "on", FUSE_MAX, "on", "on").build)));
}

/** Each deck's win rate against the gauntlet (SEEDS seeds x both sides per member); seeds from seedsOf(deck, member). */
// HULL-1a (REQ-BFG-079): `day`, the day the fights are on (Job's)
async function score(decks: Build[], gauntlet: Build[], seedsOf: (d: number, g: number) => number[], run: Runner, day?: number): Promise<number[]> {
  const field = [...gauntlet, ...decks];
  const jobs: Job[] = decks.flatMap((_, d) => gauntlet.map((_, g): Job => ({ a: gauntlet.length + d, b: g, seeds: seedsOf(d, g), ...(day !== undefined ? { day } : {}) })));
  const pts = await run(field, jobs);
  return decks.map((_, d) => pts.slice(d * gauntlet.length, (d + 1) * gauntlet.length).reduce((s, p) => s + p, 0) / (gauntlet.length * SEEDS * 2));
}

/** HULL-1c (REVIEW-HULL1A N4): a population cache records the switches its scores were measured under: `hullScale`
 *  (HULL_SCALE: the day's hull, the wind's share and the economy behind it) and `ladderFix` (LADDER_FIX), each present
 *  only when on. With both off the file name and the record are as before. */
interface PopCache { hero: HeroId; day: number; scores: number[]; costs: number[]; hullScale?: true; ladderFix?: true }

/** HULL-1c (N4): the cache file of `hero` and `day` under the switches now: pop-HERO-DAY.json with both off (as before),
 *  + "-hs" with HULL_SCALE on and "-lf" with LADDER_FIX on. */
const popFile = (cache: string, hero: HeroId, day: number): string =>
  resolve(cache, `pop-${hero}-${day}${hullScaleRules() ? "-hs" : ""}${ladderFixRules() ? "-lf" : ""}.json`);

/** HULL-1c (N4): read a population cache, refusing one recorded under other switches than this run's (a renamed or
 *  hand-copied file): its scores were measured on another game. */
function readPop(f: string): PopCache {
  const c = JSON.parse(readFileSync(f, "utf8")) as PopCache;
  const was = `HULL_SCALE ${c.hullScale === true ? "on" : "off"}, LADDER_FIX ${c.ladderFix === true ? "on" : "off"}`;
  const now = `HULL_SCALE ${hullScaleRules() ? "on" : "off"}, LADDER_FIX ${ladderFixRules() ? "on" : "off"}`;
  if (was !== now) throw new Error(`${f}: a population cache recorded with ${was}; this run has ${now}: refused (use another --cache)`);
  return c;
}

async function population(hero: HeroId, day: number, gauntlet: Build[], run: Runner, cache: string): Promise<PopCache> {
  const f = popFile(cache, hero, day);
  if (existsSync(f)) return readPop(f);
  const pop = Array.from({ length: STANDIN_DEFAULTS.pop }, (_, idx) => standInCandidate(hero, day, hashSeed("standin-pop", SEED, hero, day, idx), "on", "on", "on"));
  const builds = pop.map((c) => norm(c.build));
  const scores = await score(builds, gauntlet, (d, g) => Array.from({ length: SEEDS }, (_, k) => hashSeed("standin-battle", SEED, hero, day, d, g, k)), run, day);
  const out: PopCache = {
    hero, day, scores, costs: pop.map((c) => c.cost),
    ...(hullScaleRules() ? { hullScale: true as const } : {}), ...(ladderFixRules() ? { ladderFix: true as const } : {}),
  };
  writeFileSync(f, JSON.stringify(out));
  return out;
}

/** Percentile of `x` inside `scores`: the share scoring lower, ties half (standins.ts percentiles, for an outside deck). */
export const pctIn = (scores: readonly number[], x: number): number =>
  (100 * scores.reduce((s, v) => s + (v < x ? 1 : v === x ? 0.5 : 0), 0)) / scores.length;

const med = (xs: number[]): number => { const s = [...xs].sort((a, b) => a - b), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

async function pctMode(days: number[], run: Runner, out: string, cache: string, opts: PlayerOpts, k: number, tag: string): Promise<void> {
  const rows: unknown[] = [];
  for (const day of days) {
    const gauntlet = gauntletOf(day);
    for (const hero of (flag("heroes")?.split(",") as HeroId[] | undefined) ?? HEROES) {
      const t0 = performance.now();
      const pop = await population(hero, day, gauntlet, run, cache);
      const seeds = parSeeds(k);
      const field = seeds.map((s) => playerRun(hero, day, s, opts)[day - 1]);
      for (const d of field) {
        const v = validateBuild(d.build, day);
        if (!v.ok) throw new Error(`par ${hero} d${day}: invalid: ${v.errors.join("; ")}`);
      }
      const sc = await score(field.map((d) => d.build), gauntlet, (d, g) => Array.from({ length: SEEDS }, (_, x) => hashSeed("par-pct", tag, hero, day, seeds[d], g, x)), run, day);
      const pcts = sc.map((x) => pctIn(pop.scores, x));
      rows.push({ hero, day, seeds, pct: pcts, score: sc, value: field.map((d) => d.value), rerollGold: field.map((d) => d.rerollGold), gold: field.map((d) => d.gold), popMedianScore: med(pop.scores) });
      console.log(`pct ${tag} ${hero} d${day}: median ${med(pcts).toFixed(1)} [${Math.min(...pcts).toFixed(0)}-${Math.max(...pcts).toFixed(0)}] | ${pcts.map((p) => p.toFixed(0)).join(" ")} | value% ${field.map((d) => Math.round((100 * d.value) / maxGoldByDay(day))).join(" ")} (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
    }
  }
  writeFileSync(resolve(out, `pct-${tag}.json`), JSON.stringify({ k, opts: { policy: opts.policy ?? "typical", maxStars: opts.maxStars ?? FUSE_MAX }, rows }, null, 1));
}

/** --spend (no battles): per hero-day, the par field's deck value as a share of maxGoldByDay, with the reroll gold,
 *  the gold lost selling replaced parts and the unspent gold kept apart (they add up to maxGoldByDay). */
function spendMode(days: number[], out: string, opts: PlayerOpts, k: number, tag: string): void {
  const rows: unknown[] = [];
  const all: number[] = [];
  for (const hero of (flag("heroes")?.split(",") as HeroId[] | undefined) ?? HEROES) {
    for (const day of days) {
      const budget = maxGoldByDay(day);
      const field = parSeeds(k).map((s) => playerRun(hero, day, s, opts)[day - 1]);
      for (const d of field) {
        const v = validateBuild(d.build, day);
        if (!v.ok) throw new Error(`par ${hero} d${day}: invalid: ${v.errors.join("; ")}`);
        if (d.value + d.rerollGold + d.soldLoss + d.gold !== budget) throw new Error(`par ${hero} d${day}: gold does not add up`);
      }
      const share = field.map((d) => d.value / budget);
      all.push(...share);
      rows.push({ hero, day, budget, value: field.map((d) => d.value), rerollGold: field.map((d) => d.rerollGold), soldLoss: field.map((d) => d.soldLoss), gold: field.map((d) => d.gold), rerolls: field.map((d) => d.rerolls) });
      const p = (x: number) => Math.round(100 * x);
      console.log(`spend ${tag} ${hero} d${day} (${budget} g): value% min ${p(Math.min(...share))} median ${p(med(share))} max ${p(Math.max(...share))} | value ${field.map((d) => d.value).join(" ")} | reroll g ${field.map((d) => d.rerollGold).join(" ")} | sold loss ${field.map((d) => d.soldLoss).join(" ")} | unspent ${field.map((d) => d.gold).join(" ")}`);
    }
  }
  console.log(`spend ${tag}: every deck ${Math.round(100 * Math.min(...all))}% or more of maxGoldByDay (${all.filter((x) => x < 0.85).length} of ${all.length} below 85%)`);
  writeFileSync(resolve(out, `spend-${tag}.json`), JSON.stringify({ k, opts: { policy: opts.policy ?? "typical", tune: opts.tune ?? {} }, rows }, null, 1));
}

/** --show (no battles): each par deck of the field (describeBuild) and the run's purchases up to that day. */
function showMode(days: number[], opts: PlayerOpts, k: number): void {
  for (const hero of (flag("heroes")?.split(",") as HeroId[] | undefined) ?? HEROES) {
    for (const day of days) {
      for (const s of parSeeds(k)) {
        const run = playerRun(hero, day, s, opts);
        const d = run[day - 1];
        // CAND-A: the installed turrets (slot:def, * stars, $ a bought copy) and the joins
        const tur = installedTurrets(d.build).map((v) => `${v.slot}:${v.turret.def}${starsOf(v.turret) > 1 ? `*${starsOf(v.turret)}` : ""}${v.turret.free ? "" : "$"}`).join(" ");
        const joins = d.build.routes.filter((_, i) => !!joinOf(d.build, i)).length;
        console.log(`show ${hero} d${day} s${s}: ${describeBuild(d.build, day)} | turrets ${tur} | joins ${joins} | reroll ${d.rerollGold} g, sold loss ${d.soldLoss} g, unspent ${d.gold} g`);
        for (const r of run) console.log(`    d${r.day}: ${r.buys.map((b) => `${b.def}${b.stars > 1 ? `*${b.stars}` : ""}(${b.price}${b.why === "best" ? "" : ` ${b.why}`}${b.roll ? ` r${b.roll}` : ""}${b.replaced ? ` for ${b.replaced}` : ""}${b.grew ? ` +${b.grew}t` : ""}${b.into ? ` ${b.into}@${b.slot}` : ""}${b.joins ? ` joins ${b.joins}` : ""})`).join(" ") || "-"}`);
      }
    }
  }
}

/** --showpop N (no battles): the first N builds of the full-purse population (standInCandidate, as --pct scores them)
 *  with their cached gauntlet score when --pct has run. */
function showPopMode(days: number[], n: number, cache: string): void {
  for (const hero of (flag("heroes")?.split(",") as HeroId[] | undefined) ?? HEROES) {
    for (const day of days) {
      const f = popFile(cache, hero, day); // HULL-1c (N4): the switches' file, refused on a mismatch
      const pop = existsSync(f) ? readPop(f) : null;
      const sorted = pop ? [...pop.scores].sort((a, b) => a - b) : [];
      for (let idx = 0; idx < Math.min(n, STANDIN_DEFAULTS.pop); idx++) {
        const c = standInCandidate(hero, day, hashSeed("standin-pop", SEED, hero, day, idx), "on", "on", "on");
        const sc = pop ? pop.scores[idx] : NaN;
        const pctTxt = pop ? ` pct ${pctIn(sorted, sc).toFixed(0)} score ${sc.toFixed(3)}` : "";
        console.log(`pop ${hero} d${day} #${idx}${pctTxt}: ${describeBuild(norm(c.build), day)}`);
      }
    }
  }
}

const pc = (x: number): string => `${(100 * x).toFixed(0)}%`;
const ciTxt = (c: [number, number] | null): string => (c ? `[${pc(Math.max(0, c[0]))}-${pc(Math.min(1, c[1]))}]` : "[n/a]");

/** --pool: the shipped stand-in pool (v2.1) against the par field of both heroes, per hero-day: each pick's win rate
 *  against each hero's field (PAR_SEEDS x both sides per member), vsPar = the lower of the two (the generator's floor
 *  rule), the mean over the picks with its 95% t-interval (the pick is the unit), and the pooled Wilson rate per hero.
 *  Step 5: --pool-data <file> measures the picks of that data module instead (a dry candidate: every stored code, read
 *  by the game's loader decodeStarred), with the same seeds, so two pools compare pick for pick. */
async function poolMode(days: number[], run: Runner, out: string, opts: PlayerOpts, k: number, tag: string, data?: string): Promise<void> {
  const rows: unknown[] = [];
  const written = data ? writtenPicks(readFileSync(resolve(data), "utf8")) : undefined;
  if (written && !written.length) throw new Error(`--pool-data ${data}: no picks in that file`);
  for (const day of days) {
    for (const hero of HEROES) {
      const picks = written ? written.filter((w) => w.hero === hero && w.day === day).map((w) => decodeStarred(hero, w.code)) : standInPool(hero, day).map((e) => e.build);
      const res = await vsPar(picks, HEROES, day, run, { key: "par-pool", k, player: opts });
      const vp = res.map((r) => Math.min(...HEROES.map((h) => r[h].rate)));
      const m = meanCI(vp);
      const per = HEROES.map((h) => wilson(res.reduce((s, r) => s + r[h].pts, 0), res.reduce((s, r) => s + r[h].battles, 0)));
      rows.push({ hero, day, vsPar: vp, mean: m.mean, ci: m.ci, vs: Object.fromEntries(HEROES.map((h, i) => [h, { p: per[i].p, lo: per[i].lo, hi: per[i].hi, n: per[i].n, picks: res.map((r) => r[h].rate) }])) });
      console.log(`pool ${tag} ${hero} d${day}: vsPar ${pc(m.mean)} ${ciTxt(m.ci)} | picks ${vp.map(pc).join(" ")} | ${HEROES.map((h, i) => `vs ${h} ${fmtRate(per[i])}`).join(" | ")}`);
    }
  }
  writeFileSync(resolve(out, `pool-${tag}.json`), JSON.stringify({ k, rows }, null, 1));
}

const other = (h: HeroId): HeroId => (h === "furnace" ? "weaver" : "furnace");
const mean = (xs: readonly number[]): number => xs.reduce((s, v) => s + v, 0) / xs.length;
/** Mean and 95% t-interval with the par member as the unit: xs[m] = a rate against member m. */
const memberCI = (xs: number[]) => { const m = meanCI(xs); return { mean: m.mean, lo: m.ci ? Math.max(0, m.ci[0]) : NaN, hi: m.ci ? Math.min(1, m.ci[1]) : NaN, n: xs.length }; };
const ciOf = (c: { mean: number; lo: number; hi: number }): string => `${pc(c.mean)} [${pc(c.lo)}-${pc(c.hi)}]`;

/**
 * --rivals (brief 4b-4d, and the ladder's reference): per day, every captain's warlord deck (rivalBuild; the Iron
 * Matriarch on days 8-10 only) and every named stand-in's dusk deck (standInBuild, the 12 captains other than the
 * Matriarch), plus on day 1 the shipped pool's day-1 picks (the 3fbd553 dusk source), against the par field of each hero
 * (`seeds` seeds x both sides per member). The member is the unit of every interval (95% t over the K members).
 * Next to it, the same decks against the warlord ladder's current reference, honestReference(the other faction, day)
 * (K x `seeds` seeds x both sides: as many battles; --no-honest skips it).
 * 0.6.2 TUNE-C (ref/BRIEF-final-062-captains.md section 3):
 * - every deck's rate against the FURNACE par field, the WEAVER par field and both (the calibration field is FURNACE's);
 * - the battles keep their lengths: the stand-ins' fight lengths against par (median and IQR, per field);
 * - the PAR FIELD's top quartile and top decile: each hero's members ranked by their mean against the whole par field
 *   (both heroes, a round robin of `seeds` seeds x both sides per pairing), the members at or above the nearest-rank
 *   P75 (P90), each against each Hard captain of the day (P90: the Iron Matriarch), `tqSeeds` seeds x both sides; the
 *   rate is the member's (--no-tq skips it). --tq-pop adds the old reading, the full-purse population's decks nearest
 *   P75 / P90 by the cached --pct scores;
 * - --ids a,b restricts the captains (the seeds are keyed by the deck's tag, so a captain reads the same alone).
 * Writes <out>/rivals-<tag>-d<day>.json per day, so a cut loses at most one day.
 */
async function rivalsMode(days: number[], run: Runner, detail: DetailRunner, out: string, cache: string, opts: PlayerOpts, k: number, seeds: number, tqSeeds: number, tag: string): Promise<void> {
  const only = flag("ids")?.split(",") as RivalId[] | undefined;
  const pick = (id: RivalId) => !only || only.includes(id);
  const honestOn = !process.argv.includes("--no-honest"), tqOn = !process.argv.includes("--no-tq"), tqPop = process.argv.includes("--tq-pop");
  const FIELDS = fieldsOf(), EXTRA = FIELDS.filter((h) => !HEROES.includes(h)); // 0.8.0 N1: --fields
  for (const day of days) {
    const t0 = performance.now();
    // 0.8.0 N1: a stand-in-only captain (difficultyOf null: LOCKJAW, THISTLEMAIL) is never a warlord, only a stand-in
    const warlords = RIVAL_IDS.filter((id) => rivalDays(id).includes(day) && difficultyOf(id) !== null && pick(id));
    const standIns = RIVAL_IDS.filter((id) => id !== "matriarch" && pick(id));
    const pool = day === 1 && !only ? HEROES.flatMap((h) => standInPool(h, day).map((e, i) => ({ tag: `pool/${h}#${i}`, hero: h, build: e.build }))) : [];
    const decks = [
      ...warlords.map((id) => ({ tag: `warlord/${id}`, hero: RIVALS[id].hero, build: rivalBuild(id, day) })),
      ...standIns.map((id) => ({ tag: `standin/${id}`, hero: RIVALS[id].hero, build: standInBuild(id, day) })),
      ...pool,
    ];
    const { res, times } = await vsParDetail(decks, day, detail, k, seeds, opts);
    // the ladder's reference: honestReference(the other faction), as many battles as against a field
    let vsHonest: (Record<HeroId, number> | null)[] = decks.map(() => null);
    if (honestOn) {
      const honest = HEROES.map((h) => honestReference(h, day));
      const hSeeds = k * seeds;
      const hJobs: Job[] = decks.flatMap((d) => HEROES.map((h, hi): Job => ({ a: decks.indexOf(d), b: decks.length + hi, seeds: Array.from({ length: hSeeds }, (_, s) => hashSeed("par-rivals-honest", day, d.tag, h, s)), day })));
      const hPts = await run([...decks.map((d) => d.build), ...honest], hJobs);
      vsHonest = decks.map((_, d) => Object.fromEntries(HEROES.map((h, hi) => [h, hPts[d * HEROES.length + hi] / (2 * hSeeds)])) as Record<HeroId, number>);
    }
    const rows = decks.map((d, i) => ({
      tag: d.tag, hero: d.hero, cost: deckCost(d.build).total,
      vs: Object.fromEntries(FIELDS.map((h) => [h, { rate: res[i][h].rate, members: res[i][h].members }])) as Record<HeroId, { rate: number; members: number[] }>,
      vsHonest: vsHonest[i],
      times: Object.fromEntries(FIELDS.map((h) => [h, times[i][h].map((t) => Math.round(10 * t) / 10)])) as Record<HeroId, number[]>,
    }));
    const hard = warlords.filter((id) => difficultyOf(id) === "hard");
    // TUNE-C: the par field's top quartile (P75 and up) vs each Hard captain, and its top decile (P90 and up) vs the Matriarch
    const tqPar: unknown[] = [];
    if (tqOn && hard.length) {
      const refs = HEROES.map((h) => parField(h, day, k, opts));
      const strength = await roundRobin(refs.flat(), (i, j) => Array.from({ length: seeds }, (_, s) => hashSeed("par-tq-rank", day, i, j, s)), run, day);
      for (const [hi, hero] of HEROES.entries()) {
        const st = strength.slice(hi * k, (hi + 1) * k);
        for (const q of [0.75, 0.9]) {
          const foes = q === 0.9 ? hard.filter((id) => id === "matriarch") : hard.filter((id) => id !== "matriarch");
          if (!foes.length) continue;
          const cut = nearestRank(st, q);
          const members = st.map((s, m) => ({ s, m })).filter((x) => x.s >= cut).map((x) => x.m);
          const builds = members.map((m) => refs[hi][m]);
          const jobs: Job[] = builds.flatMap((_, b) => foes.map((id, f): Job => ({ a: b, b: builds.length + f, seeds: Array.from({ length: tqSeeds }, (_, s) => hashSeed("par-tq-field", day, hero, members[b], id, s)), day })));
          const pts = await run([...builds, ...foes.map((id) => rivalBuild(id, day))], jobs);
          const per = foes.map((id, f) => {
            const rates = builds.map((_, b) => pts[b * foes.length + f] / (2 * tqSeeds));
            return { id, rates, ...memberCI(rates) };
          });
          tqPar.push({ hero, q, members, strength: members.map((m) => st[m]), fieldStrength: st, per });
          console.log(`tq par ${tag} d${day} ${hero} P${Math.round(q * 100)} (${members.length} of ${k} members) beats ${per.map((p) => `${p.id} ${ciOf(p)}`).join(" | ")}`);
        }
      }
    }
    // the full-purse population's decks nearest P75 (P90 for the Matriarch) vs each Hard warlord of the day (CAND-A's reading)
    const tq: unknown[] = [];
    if (tqPop && hard.length) {
      const gauntlet = gauntletOf(day);
      for (const hero of HEROES) {
        const pop = await population(hero, day, gauntlet, run, cache);
        const order = pop.scores.map((s, idx) => ({ s, idx })).sort((a, b) => a.s - b.s || a.idx - b.idx);
        for (const q of [0.75, 0.9]) {
          const at = Math.round(q * (order.length - 1));
          const picks = order.slice(Math.max(0, at - 2), at + 3).map((o) => o.idx);
          const builds = picks.map((idx) => norm(standInCandidate(hero, day, hashSeed("standin-pop", SEED, hero, day, idx), "on", "on", "on").build));
          const foes = q === 0.9 ? hard.filter((id) => id === "matriarch") : hard.filter((id) => id !== "matriarch");
          if (!foes.length) continue;
          const jobs: Job[] = builds.flatMap((_, b) => foes.map((id, f): Job => ({ a: b, b: builds.length + f, seeds: Array.from({ length: tqSeeds }, (_, s) => hashSeed("par-tq", day, hero, q, picks[b], id, s)), day })));
          const pts = await run([...builds, ...foes.map((id) => rivalBuild(id, day))], jobs);
          const per = foes.map((id, f) => {
            const rates = builds.map((_, b) => pts[b * foes.length + f] / (2 * tqSeeds));
            return { id, rates, ...memberCI(rates) };
          });
          tq.push({ hero, q, picks, pct: picks.map((idx) => pctIn(pop.scores, pop.scores[idx])), per });
          console.log(`tq pop ${tag} d${day} ${hero} P${Math.round(q * 100)} (${picks.length} decks) vs ${per.map((p) => `${p.id} ${ciOf(p)}`).join(" | ")}`);
        }
      }
    }
    // print: slot means (the unit: the par member) vs each hero's par field and both, and vs honestReference
    const slotLine = (label: string, ids: string[], kind: "warlord" | "standin") => {
      const rs = rows.filter((r) => ids.some((id) => r.tag === `${kind}/${id}`));
      if (!rs.length) return;
      const per = (h: HeroId) => memberCI(Array.from({ length: k }, (_, m) => mean(rs.map((r) => r.vs[h].members[m]))));
      const both = memberCI(HEROES.flatMap((h) => Array.from({ length: k }, (_, m) => mean(rs.map((r) => r.vs[h].members[m])))));
      const hon = honestOn ? ` | vs honestReference (other) ${pc(mean(rs.map((r) => r.vsHonest![other(r.hero)])))}` : "";
      const extra = EXTRA.map((h) => ` | ${h.toUpperCase()} ${ciOf(per(h))}`).join("");
      console.log(`rivals ${tag} d${day} ${label.padEnd(16)} (${rs.length}) vs FURNACE ${ciOf(per("furnace"))} | WEAVER ${ciOf(per("weaver"))} | both ${ciOf(both)}${extra}${hon}`);
    };
    slotLine("easy", warlords.filter((id) => difficultyOf(id) === "easy"), "warlord");
    slotLine("medium", warlords.filter((id) => difficultyOf(id) === "medium"), "warlord");
    slotLine("hard (pool)", hard.filter((id) => id !== "matriarch"), "warlord");
    slotLine("matriarch", hard.filter((id) => id === "matriarch"), "warlord");
    slotLine("named dusk decks", standIns, "standin");
    for (const r of rows.filter((x) => !x.tag.startsWith("pool/"))) {
      const both = memberCI(HEROES.flatMap((h) => r.vs[h].members));
      const hon = r.vsHonest ? ` | honest: furnace ${pc(r.vsHonest.furnace)} weaver ${pc(r.vsHonest.weaver)}` : "";
      const extra = EXTRA.map((h) => ` ${h.toUpperCase()} ${pc(r.vs[h].rate)}`).join("");
      console.log(`    ${r.tag.padEnd(20)} ${String(r.cost).padStart(3)}g vs FURNACE ${pc(r.vs.furnace.rate)} WEAVER ${pc(r.vs.weaver.rate)} (both ${ciOf(both)})${extra}${hon}`);
    }
    // the stand-ins' fight lengths against par: median [P25-P75] per field
    const lens = (h?: HeroId) => rows.filter((r) => r.tag.startsWith("standin/")).flatMap((r) => (h ? r.times[h] : HEROES.flatMap((x) => r.times[x])));
    const q3 = (xs: number[]) => (xs.length ? `${quantile(xs, 0.5).toFixed(1)} s [${quantile(xs, 0.25).toFixed(1)}-${quantile(xs, 0.75).toFixed(1)}]` : "-");
    if (standIns.length) console.log(`length ${tag} d${day} par vs the named stand-ins: FURNACE ${q3(lens("furnace"))} | WEAVER ${q3(lens("weaver"))} | both ${q3(lens())}${EXTRA.map((h) => ` | ${h.toUpperCase()} ${q3(lens(h))}`).join("")}`);
    if (day === 1) {
      // 4c: the par field's day-1 decks against the day-1 dusk opponents; loss = the opponents' win rate, per par member
      for (const [label, pre] of [["named stand-ins", "standin/"], ["pool v2.1 picks", "pool/"]] as const) {
        const opp = rows.filter((r) => r.tag.startsWith(pre));
        if (!opp.length) continue;
        for (const h of FIELDS) console.log(`first ${tag} d1 par ${h} loses to ${label} (${opp.length}): ${ciOf(memberCI(Array.from({ length: k }, (_, m) => mean(opp.map((r) => r.vs[h].members[m])))))}`);
      }
    }
    writeFileSync(resolve(out, `rivals-${tag}-d${day}.json`), JSON.stringify({ day, k, seeds, tqSeeds, rows, tqPar, tq }, null, 1));
    console.log(`rivals ${tag} d${day}: ${decks.length} decks (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
  }
}

/** Linear-interpolated quantile of xs (q in 0..1). */
function quantile(xs: readonly number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b), at = q * (s.length - 1), lo = Math.floor(at), hi = Math.ceil(at);
  return s[lo] + (s[hi] - s[lo]) * (at - lo);
}

/**
 * vsPar with the battles' lengths (TUNE-C): each deck against each member of both heroes' par fields, `seeds` seeds x
 * both sides, on seeds hashSeed("par-rivals", day, tag, hero, member, s) (keyed by the deck's tag, not its index, so a
 * captain reads the same with --ids as in the full table), through the detail runner. res[d][hero]: vsPar's shape;
 * times[d][hero]: every battle's length (s).
 */
async function vsParDetail(decks: { tag: string; build: Build }[], day: number, detail: DetailRunner, k: number, seeds: number, opts: PlayerOpts, HEROES: HeroId[] = fieldsOf()): Promise<{ res: Record<HeroId, VsPar>[]; times: Record<HeroId, number[]>[] }> {
  const refs = HEROES.map((h) => parField(h, day, k, opts));
  const field = [...decks.map((d) => d.build), ...refs.flat()];
  const at: number[] = [];
  let off = decks.length;
  for (const r of refs) { at.push(off); off += r.length; }
  const jobs: Job[] = [], where: [number, number, number][] = [];
  decks.forEach((dk, d) => HEROES.forEach((h, hi) => refs[hi].forEach((_, m) => {
    jobs.push({ a: d, b: at[hi] + m, seeds: Array.from({ length: seeds }, (_, s) => hashSeed("par-rivals", day, dk.tag, h, m, s)), day }); // HULL-1a: the day
    where.push([d, hi, m]);
  })));
  const got = await detail(field, jobs);
  const res = decks.map(() => Object.fromEntries(HEROES.map((h, hi) => [h, { rate: 0, battles: 0, pts: 0, members: refs[hi].map(() => 0) }])) as Record<HeroId, VsPar>);
  const times = decks.map(() => Object.fromEntries(HEROES.map((h) => [h, [] as number[]])) as Record<HeroId, number[]>);
  got.forEach((s, x) => {
    const [d, hi, m] = where[x];
    const r = res[d][HEROES[hi]];
    let pts = 0;
    const bs = s.split(";");
    bs.forEach((b, i) => {
      const [w, t] = b.split(",").map(Number);
      pts += i % 2 === 0 ? (w === 0 ? 1 : w === -1 ? 0.5 : 0) : (w === 1 ? 1 : w === -1 ? 0.5 : 0);
      times[d][HEROES[hi]].push(t);
    });
    r.members[m] = pts / bs.length;
    r.pts += pts;
    r.battles += bs.length;
  });
  for (const r of res) for (const h of HEROES) r[h].rate = mean(r[h].members);
  return { res, times };
}

/**
 * --ladder (the skill ladder, brief 0c item 3; it replaces the percentile aim as the par player's sanity check): on the
 * same seeds (parSeeds(k): the same runs, so the same first caravans), per hero and day, same-hero fields:
 *   par vs random: the par field (typical) against the random-pick field (typical with impulse=1: every pick that is
 *     not a merge is any offer the deck can take);
 *   calm vs par: typical without misjudging or whims (noise=0, whim=0) against the par field;
 *   sharp vs par: the sharp policy (no misjudging or whims, best spots, belts re-drawn to the best length) against it.
 * `seeds` seeds x both sides per pairing; the row field's member is the unit of the 95% interval. One JSON per day.
 */
async function ladderMode(days: number[], run: Runner, out: string, k: number, seeds: number, tag: string): Promise<void> {
  const RANDOM: PlayerOpts = { tune: { impulse: 1 } }, CALM: PlayerOpts = { tune: { noise: 0, whim: 0 } }, SHARP: PlayerOpts = { policy: "sharp" };
  for (const day of days) {
    const t0 = performance.now();
    const rows: unknown[] = [];
    for (const hero of (flag("heroes")?.split(",") as HeroId[] | undefined) ?? HEROES) {
      const pairs: [string, PlayerOpts, PlayerOpts][] = [["par vs random", {}, RANDOM], ["calm vs par", CALM, {}], ["sharp vs par", SHARP, {}]];
      const line: string[] = [];
      for (const [label, rowOpts, refOpts] of pairs) {
        const decks = parField(hero, day, k, rowOpts);
        const res = await vsPar(decks, [hero], day, run, { key: `par-ladder-${label}`, k, seeds, player: refOpts });
        const c = memberCI(res.map((r) => r[hero].rate));
        rows.push({ hero, label, ...c, members: res.map((r) => r[hero].rate), rowValue: decks.map((b) => deckCost(b).total) });
        line.push(`${label} ${ciOf(c)}`);
      }
      console.log(`ladder ${tag} ${hero} d${day}: ${line.join(" | ")}`);
    }
    writeFileSync(resolve(out, `ladder-${tag}-d${day}.json`), JSON.stringify({ day, k, seeds, rows }, null, 1));
    console.log(`ladder ${tag} d${day} (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
  }
}

/**
 * --mix (no battles; the percentile diagnostic's cause, brief 0c item 2): per hero-day, the mean spend mix of the par
 * field and of the full-purse population (--pct's 64 standInCandidate builds): gold in rigs and factories (items),
 * gear and cores (mods), belt crates, plating, and for the par player also rerolls, the loss on parts sold and unspent
 * gold. Also how often a dawn's first caravan offers plating or a belt crate (rollShop on a fresh run of the day, 400
 * seeds per hero-day), and the share of the population's crate gold that lengthens no belt (capacity above its longest
 * route's tiles, rounded to whole crates).
 */
function mixMode(days: number[], out: string, opts: PlayerOpts, k: number, tag: string): void {
  const rows: unknown[] = [];
  const cr = ITEMS.beltcrate.price, pl = ITEMS.plating.price, crateBelt = ITEMS.beltcrate.supply!.belt!;
  const mixOf = (b: Build) => { const c = deckCost(b); return { items: c.items, mods: c.mods, crates: c.crates * cr, plating: c.plates * pl, total: c.total }; };
  const avg = <T extends Record<string, number>>(xs: T[]): T => Object.fromEntries(Object.keys(xs[0]).map((key) => [key, Math.round(10 * mean(xs.map((x) => x[key]))) / 10])) as T;
  for (const hero of (flag("heroes")?.split(",") as HeroId[] | undefined) ?? HEROES) {
    for (const day of days) {
      const par = parSeeds(k).map((s) => playerRun(hero, day, s, opts)[day - 1]);
      const parMix = avg(par.map((d) => ({ ...mixOf(d.build), rerolls: d.rerollGold, soldLoss: d.soldLoss, unspent: d.gold })));
      const pop = Array.from({ length: STANDIN_DEFAULTS.pop }, (_, idx) => norm(standInCandidate(hero, day, hashSeed("standin-pop", SEED, hero, day, idx), "on", "on", "on").build));
      const popMix = avg(pop.map(mixOf));
      // crate gold no belt uses: whole crates of belt capacity above the tiles its belts hold (deck.ts beltUsed)
      const idle = mean(pop.map((b) => Math.min(deckCost(b).crates, Math.floor(Math.max(0, b.beltCap - beltUsed(b)) / crateBelt)) * cr));
      void HEROES_DEF;
      let plating = 0, crate = 0;
      const N = 400;
      for (let s = 0; s < N; s++) {
        const r = newRun(hero, hashSeed("par-mix-offers", hero, s), `mix-${hero}-${s}`);
        r.day = day;
        rollShop(r);
        const defs = r.shop.wagons.flatMap((w) => w.offers.map((o) => o.def));
        if (defs.includes("plating")) plating++;
        if (defs.includes("beltcrate")) crate++;
      }
      rows.push({ hero, day, budget: maxGoldByDay(day), par: parMix, pop: popMix, popIdleCrateGold: Math.round(10 * idle) / 10, offers: { plating: plating / N, beltcrate: crate / N } });
      const f = (m: Record<string, number>) => Object.entries(m).map(([key, v]) => `${key} ${v}`).join(" ");
      console.log(`mix ${hero} d${day} (${maxGoldByDay(day)} g) | par: ${f(parMix)} | pop: ${f(popMix)} idle-crates ${idle.toFixed(1)} | offered: plating ${pc(plating / N)} crate ${pc(crate / N)}`);
    }
  }
  writeFileSync(resolve(out, `mix-${tag}.json`), JSON.stringify({ k, rows }, null, 1));
}

/** The desk run's seeded pool ghosts (scripts/singlefile.mjs RUNS.desk.pool): [day, hero, power]; tooling.ts makeGhost
 *  builds power > 0 as strongHonestBuild(hero, day, power) and power <= 0 as honestStandInBuild(hero, day + power). */
const DESK_GHOSTS: [number, HeroId, number][] = [[1, "weaver", 0], [2, "furnace", 6], [4, "weaver", 0], [5, "furnace", -2], [6, "weaver", -2], [7, "furnace", -2], [8, "weaver", -2], [9, "furnace", -2], [10, "weaver", -2]];

/**
 * --desk (brief step 5): each desk-run pool ghost against the par field of its day (both heroes; the desk hero is
 * FURNACE), `seeds` seeds x both sides per member: does a typical player's deck beat the ghost the desk run loses to?
 */
async function deskMode(run: Runner, out: string, k: number, seeds: number): Promise<void> {
  const rows: unknown[] = [];
  for (const [day, hero, power] of DESK_GHOSTS) {
    const ghost = power > 0 ? strongHonestBuild(hero, day, power) : honestStandInBuild(hero, Math.max(1, day + power));
    const res = (await vsPar([ghost], HEROES, day, run, { key: "par-desk", k, seeds }))[0];
    const par = Object.fromEntries(HEROES.map((h) => [h, memberCI(res[h].members.map((x) => 1 - x))]));
    rows.push({ day, hero, power, cost: deckCost(ghost).total, hullBonus: ghost.hullBonus, parWins: par });
    console.log(`desk ghost d${day} ${hero} power ${power} (${deckCost(ghost).total} g, hull +${ghost.hullBonus}): par FURNACE beats it ${ciOf(par.furnace)} | par WEAVER beats it ${ciOf(par.weaver)}`);
  }
  writeFileSync(resolve(out, "desk-ghosts.json"), JSON.stringify({ k, seeds, rows }, null, 1));
}

// ---------------------------------------------------------------- 0.6.2 CAND-A (ref/BRIEF-final-062-cand.md section 3)
// The candidate's readings on the par field. Every battle reading is paired: all variants of one deck meet each
// par-field member on the same seeds (keyed by the deck's par seed and the member, never by the variant), so a lift is
// a paired difference in win-rate points. A par deck never meets itself: its own member is left out for all its
// variants. The deck is the unit of each interval (the member for --joins' fixed layouts). Nothing here tunes.

const heroesOf = (dflt: HeroId[] = HEROES): HeroId[] => (flag("heroes")?.split(",") as HeroId[] | undefined) ?? dflt;
/** The hull's extra TURRET SLOT (the one with no starting turret). */
const extraSlotOf = (hero: HeroId): number => hullSlots(hero).findIndex((s) => !s.start);
const sum = (xs: readonly number[]): number => xs.reduce((s, v) => s + v, 0);
/** Win-rate points, signed. */
const pp = (x: number): string => `${x >= 0 ? "+" : ""}${(100 * x).toFixed(1)}`;
const fmtLift = (c: { mean: number; ci: [number, number] | null }): string => `${pp(c.mean)} [${c.ci ? `${pp(c.ci[0])}, ${pp(c.ci[1])}` : "n/a"}]`;

/** What a par deck holds of the 0.6.2 mechanics (--uptake). */
export interface Uptake {
  extra: boolean; // a turret in the extra slot
  extraBought: boolean; // ... a bought copy (not the free starting copy moved there)
  replaced: boolean; // a starting slot holds another def than the one it starts with
  gear2: boolean; // an installed turret carries 2+ gear
  join: boolean; // a legal join
  twoBelt: boolean; // a rig whose arrows land on two or more belts
  landed: number[]; // per multi-arrow rig (2-4 arrows): its arrows that land on a belt tile (FB-A's landed/rig)
  twoBeltMulti: number; // multi-arrow rigs whose arrows land on two or more belts
  sigJoin: boolean; // a belt joins the signature factory's belt (KILN, LOOM)
  f1: boolean; // another factory's belt joins the signature belt at or before its first worked tile (FURNACE: F1)
}

export function uptakeOf(b: Build): Uptake {
  const slots = turretSlots(b), ex = slots[extraSlotOf(b.hero)]?.turret;
  const occ = occupancy(b), hits = rigHits(b);
  const on = new Map<number, number[]>();
  for (const r of hits) for (const t of r) for (const h of t) on.set(h.uid, [...(on.get(h.uid) ?? []), h.route]);
  const landed: number[] = [];
  let twoBelt = false, twoBeltMulti = 0;
  for (const p of b.items) {
    if (ITEMS[p.def].kind !== "gate") continue;
    const rs = on.get(p.uid) ?? [], two = new Set(rs).size >= 2;
    if (two) twoBelt = true;
    if (rigArrows(p.def).length >= 2) {
      landed.push(rs.length);
      if (two) twoBeltMulti++;
    }
  }
  const sig = new Set(b.items.filter((p) => p.def === HEROES_DEF[b.hero].factory).map((p) => p.uid));
  let join = false, sigJoin = false, f1 = false;
  b.routes.forEach((r, i) => {
    const link = r.join === undefined ? undefined : joinOf(b, i, occ);
    if (!link) return;
    join = true;
    if (!sig.has(b.routes[link.route].factory)) return;
    sigJoin = true;
    const worked = (hits[link.route] ?? []).findIndex((t) => t.length > 0);
    if (!sig.has(r.factory) && worked >= 0 && link.tile <= worked) f1 = true;
  });
  return {
    extra: !!ex, extraBought: !!ex && !ex.free, replaced: slots.some((s) => !!s.start && !!s.turret && s.turret.def !== s.start),
    gear2: installedTurrets(b).some((v) => gearOn(b, v.slot).length >= 2), join, twoBelt, landed, twoBeltMulti, sigJoin, f1,
  };
}

/**
 * TUNE-M T3 --rigs [--sample N] (no battles): per hero-day, each multi-arrow rig def (2-4 arrows) in the par decks of
 * seeds 1..N: the decks holding it, its copies and their stars, the arrows that land on a belt tile (rigHits) per copy,
 * split by copies whose arrows land on one belt and on two or more belts, and the gold per landed arrow (the copies'
 * value, price x 2^(stars - 1), over their landed arrows). A 1-arrow common costs 3 g per landed arrow.
 */
function rigsMode(days: number[], out: string, opts: PlayerOpts, k: number, sample: number, tag: string): void {
  const rows: unknown[] = [];
  for (const hero of heroesOf()) {
    for (const day of days) {
      const decks = parSeeds(Math.max(k, sample)).map((s) => playerRun(hero, day, s, opts)[day - 1].build);
      const per = new Map<string, { decks: number; copies: number; stars: number[]; one: number[]; two: number[]; gold: number }>();
      for (const b of decks) {
        const on = new Map<number, number[]>();
        for (const r of rigHits(b)) for (const t of r) for (const h of t) on.set(h.uid, [...(on.get(h.uid) ?? []), h.route]);
        const seen = new Set<string>();
        for (const p of b.items) {
          if (ITEMS[p.def].kind !== "gate" || (rigArrows(p.def).length < 2 && !process.argv.includes("--rigs-all"))) continue;
          const e = per.get(p.def) ?? { decks: 0, copies: 0, stars: [], one: [], two: [], gold: 0 };
          if (!seen.has(p.def)) { seen.add(p.def); e.decks++; }
          const rs = on.get(p.uid) ?? [];
          e.copies++;
          e.stars.push(starsOf(p));
          (new Set(rs).size >= 2 ? e.two : e.one).push(rs.length);
          e.gold += valueOf(p.def, starsOf(p));
          per.set(p.def, e);
        }
      }
      for (const [def, e] of [...per.entries()].sort((a, b) => b[1].copies - a[1].copies)) {
        const landed = sum(e.one) + sum(e.two);
        const row = {
          hero, day, def, arrows: rigArrows(def).length, price: ITEMS[def].price, decks: e.decks, of: decks.length, copies: e.copies,
          stars: [1, 2, 3].map((s) => e.stars.filter((x) => x === s).length), landedPerCopy: landed / e.copies,
          oneBelt: { copies: e.one.length, landed: e.one.length ? sum(e.one) / e.one.length : null },
          twoBelt: { copies: e.two.length, landed: e.two.length ? sum(e.two) / e.two.length : null },
          goldPerLanded: landed ? e.gold / landed : null,
        };
        rows.push(row);
        console.log(`rigs ${tag} ${hero} d${day} ${def} (${row.arrows} arrows, ${row.price} g): ${e.decks}/${decks.length} decks, ${e.copies} copies (★ ${row.stars.join("/")}) | landed/copy ${row.landedPerCopy.toFixed(2)} (one belt ${e.one.length} x ${row.oneBelt.landed?.toFixed(2) ?? "-"}, two belts ${e.two.length} x ${row.twoBelt.landed?.toFixed(2) ?? "-"}) | ${row.goldPerLanded?.toFixed(2) ?? "-"} g per landed arrow`);
      }
    }
  }
  writeFileSync(resolve(out, `rigs-${tag}.json`), JSON.stringify({ k, sample: Math.max(k, sample), opts: { policy: opts.policy ?? "typical", tune: opts.tune ?? {} }, rows }, null, 1));
}

/** --uptake (no battles): per hero-day, how many of the K par decks hold each 0.6.2 mechanic (Uptake), the landed arrows
 *  per multi-arrow rig (95% t over the rigs), and the turret purchases of the runs up to that day. */
function uptakeMode(days: number[], out: string, opts: PlayerOpts, k: number, tag: string): void {
  const rows: unknown[] = [];
  for (const hero of heroesOf()) {
    for (const day of days) {
      const runs = parSeeds(k).map((s) => playerRun(hero, day, s, opts));
      const us = runs.map((r) => uptakeOf(r[day - 1].build));
      const n = (f: (u: Uptake) => boolean) => us.filter(f).length;
      const counts = { extra: n((u) => u.extra), extraBought: n((u) => u.extraBought), replaced: n((u) => u.replaced), gear2: n((u) => u.gear2), join: n((u) => u.join), twoBelt: n((u) => u.twoBelt), sigJoin: n((u) => u.sigJoin), f1: n((u) => u.f1) };
      const landed = us.flatMap((u) => u.landed), lm = meanCI(landed), two = sum(us.map((u) => u.twoBeltMulti));
      const buys: Record<string, number> = {};
      for (const r of runs) for (const d of r) for (const x of d.buys) if (x.into) buys[`${x.into} ${x.def}`] = (buys[`${x.into} ${x.def}`] ?? 0) + 1;
      rows.push({ hero, day, k, ...counts, landed, landedMean: lm.mean, landedCI: lm.ci, twoBeltMulti: two, turretBuys: buys, decks: us.map((u, i) => ({ seed: i + 1, ...u })) });
      console.log(`uptake ${tag} ${hero} d${day}: ${Object.entries(counts).map(([key, v]) => `${key} ${v}/${k}`).join(" ")} | landed per multi-arrow rig ${landed.length ? `${lm.mean.toFixed(2)}${lm.ci ? ` [${lm.ci[0].toFixed(2)}-${lm.ci[1].toFixed(2)}]` : ""}` : "-"} (${landed.length} rigs, ${two} on two belts) | turret buys to d${day}: ${Object.entries(buys).map(([key, v]) => `${key} x${v}`).join(", ") || "-"}`);
    }
  }
  writeFileSync(resolve(out, `uptake-${tag}.json`), JSON.stringify({ k, opts: { policy: opts.policy ?? "typical", tune: opts.tune ?? {} }, rows }, null, 1));
}

/** --fingerprint (no battles): a hash (core/rng hashSeed, chained) of every par deck (its dusk build and its day's
 *  buys) per hero-day, and of all of them. */
function fingerprintMode(days: number[], opts: PlayerOpts, k: number): void {
  let all = 0;
  for (const hero of heroesOf()) {
    for (const day of days) {
      let h = 0;
      for (const s of parSeeds(k)) {
        const d = playerRun(hero, day, s, opts)[day - 1];
        h = hashSeed("par-fingerprint", h, JSON.stringify(d.build), JSON.stringify(d.buys));
      }
      all = hashSeed("par-fingerprint-all", all, h);
      console.log(`fingerprint ${hero} d${day}: ${(h >>> 0).toString(16).padStart(8, "0")}`);
    }
  }
  console.log(`fingerprint all: ${(all >>> 0).toString(16).padStart(8, "0")}`);
}

/** A deck variant for the paired readings: `pair` keys its seeds (every variant of one deck shares it); `self` is the
 *  member of its own hero's par field it came from (left out), or -1. */
interface Row { build: Build; pair: string; hero: HeroId; self: number }

/** The jobs of `rows` against every member of the par field of each hero in `foes` (`seeds` seeds x both sides per
 *  member, its own member left out) and where each job's result goes: [row, foe, member]. */
function pairedJobs(rows: Row[], foes: readonly HeroId[], day: number, k: number, seeds: number, key: string, player: PlayerOpts): { field: Build[]; jobs: Job[]; where: [number, HeroId, number][] } {
  const refs = foes.map((h) => parField(h, day, k, player));
  const field: Build[] = [...rows.map((r) => r.build), ...refs.flat()];
  const at: number[] = [];
  let off = rows.length;
  for (const r of refs) { at.push(off); off += r.length; }
  const jobs: Job[] = [], where: [number, HeroId, number][] = [];
  rows.forEach((r, ri) => foes.forEach((h, hi) => refs[hi].forEach((_, m) => {
    if (h === r.hero && m === r.self) return;
    jobs.push({ a: ri, b: at[hi] + m, seeds: Array.from({ length: seeds }, (_, s) => hashSeed(key, day, r.pair, h, m, s)), day }); // HULL-1a: the day
    where.push([ri, h, m]);
  })));
  return { field, jobs, where };
}

type Rates = Record<string, number[]>; // foe hero -> member rates (NaN: left out)
const emptyRates = (foes: readonly HeroId[], k: number): Rates => Object.fromEntries(foes.map((h) => [h, Array.from({ length: k }, () => NaN)]));

/** Each row's win rate against every member it meets (pairedJobs): out[row][foe][member]. */
async function vsFieldPaired(rows: Row[], foes: readonly HeroId[], day: number, run: Runner, k: number, seeds: number, key: string, player: PlayerOpts = {}): Promise<Rates[]> {
  const { field, jobs, where } = pairedJobs(rows, foes, day, k, seeds, key, player);
  const got = await run(field, jobs);
  const out = rows.map(() => emptyRates(foes, k));
  got.forEach((p, x) => { const [ri, h, m] = where[x]; out[ri][h][m] = p / (2 * seeds); });
  return out;
}

/** vsFieldPaired with every battle kept: battles[row] = the row's points per battle (win 1, draw 0.5), in job order,
 *  each seed as player then as enemy (tournament.ts jobDetail), so the rows of one deck line up battle for battle. */
async function vsFieldBattles(rows: Row[], foes: readonly HeroId[], day: number, detail: DetailRunner, k: number, seeds: number, key: string, player: PlayerOpts = {}): Promise<{ rates: Rates[]; battles: number[][] }> {
  const { field, jobs, where } = pairedJobs(rows, foes, day, k, seeds, key, player);
  const got = await detail(field, jobs);
  const rates = rows.map(() => emptyRates(foes, k)), battles: number[][] = rows.map(() => []);
  got.forEach((s, x) => {
    const [ri, h, m] = where[x];
    const ps = s.split(";").map((b, i) => { const w = Number(b.split(",")[0]); return i % 2 === 0 ? (w === 0 ? 1 : w === -1 ? 0.5 : 0) : (w === 1 ? 1 : w === -1 ? 0.5 : 0); });
    battles[ri].push(...ps);
    rates[ri][h][m] = sum(ps) / ps.length;
  });
  return { rates, battles };
}

/** A row's mean over the members it met (both foes' fields). */
const rowMean = (r: Rates): number => mean(Object.values(r).flat().filter((x) => !Number.isNaN(x)));
/** The paired lift of a over b (two variants of one deck): the mean over the members both met of a - b. */
function liftOf(a: Rates, b: Rates): number {
  const d: number[] = [];
  for (const h of Object.keys(a)) a[h].forEach((x, m) => { if (!Number.isNaN(x) && !Number.isNaN(b[h][m])) d.push(x - b[h][m]); });
  return mean(d);
}

/** Ranks (1-based, ties share their average rank). */
function ranks(xs: readonly number[]): number[] {
  const order = xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x);
  const out = new Array<number>(xs.length);
  for (let s = 0; s < order.length;) {
    let e = s;
    while (e + 1 < order.length && order[e + 1].x === order[s].x) e++;
    for (let j = s; j <= e; j++) out[order[j].i] = (s + e) / 2 + 1;
    s = e + 1;
  }
  return out;
}
/** Spearman's rank correlation of xs and ys (NaN below 3 pairs or with no spread). */
function spearman(xs: readonly number[], ys: readonly number[]): number {
  if (xs.length < 3) return NaN;
  const a = ranks(xs), b = ranks(ys), ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : NaN;
}

/** Two-sided exact sign test: p of a split at least as uneven as better/worse under p = 0.5 (ties dropped). */
function signTest(better: number, worse: number): number {
  const n = better + worse, lo = Math.min(better, worse);
  if (!n) return 1;
  let lp = n * Math.log(0.5), acc = 0;
  for (let i = 0; i <= lo; i++) {
    acc += Math.exp(lp);
    lp += Math.log((n - i) / (i + 1));
  }
  return Math.min(1, 2 * acc);
}

/** A part a par deck can hold (REQ-BFG-033 clause 4): "rig:<def>", "factory:<def>" (not the signature factory),
 *  "gear:<def>", "core:<def>", "turret:<def>" (an installed bought copy), "extra" (a turret in the extra slot), "join". */
type PartKey = string;

export function partsOf(b: Build): PartKey[] {
  const out = new Set<PartKey>();
  for (const p of b.items) {
    const kind = ITEMS[p.def].kind;
    if (kind === "gate") out.add(`rig:${p.def}`);
    else if (kind === "factory" && p.def !== HEROES_DEF[b.hero].factory) out.add(`factory:${p.def}`);
  }
  for (const m of b.mods) out.add(`${ITEMS[m.def].kind === "core" ? "core" : "gear"}:${m.def}`);
  for (const v of installedTurrets(b)) if (!v.turret.free) out.add(`turret:${v.turret.def}`);
  if (turretSlots(b)[extraSlotOf(b.hero)]?.turret) out.add("extra");
  if (b.routes.some((_, i) => !!joinOf(b, i))) out.add("join");
  return [...out];
}

/** Feed every belt that reaches no turret again (player.ts refeedRoute: a free intake, else with `join` a join),
 *  after clearing joins that no longer hold; returns how many still reach none (their payloads never load). */
function refeedAll(b: Build, day: number, seed: number, join: boolean): number {
  for (let pass = 0; pass < 3; pass++) {
    pruneJoins(b);
    const loose = b.routes.map((_, i) => i).filter((i) => !feedOf(b, i).connected);
    if (!loose.length) return 0;
    let fixed = 0;
    for (const i of loose) if (!feedOf(b, i).connected && refeedRoute(b, i, day, seed + 7919 * pass, join)) fixed++;
    if (!fixed) break;
  }
  pruneJoins(b);
  return b.routes.filter((_, i) => !feedOf(b, i).connected).length;
}

/**
 * The deck without part `key`, as a player without it would have it: a rig or factory def lifted off the deck (a
 * factory's belts go with it); gear or a core off its turret; a bought turret out (in a starting slot the hull's
 * starting turret back: the displaced copy from the extra slot when it sits there, else a free copy); the extra slot's
 * turret out (its gear and core with it); every join undone. Then each belt left feeding no turret is fed again where
 * it can be (refeedAll; after undoing joins only into a free intake). dead: belts still feeding none.
 */
export function ablate(b0: Build, key: PartKey, day: number, seed: number): { build: Build; dead: number } {
  const b = cloneBuild(b0);
  const at = key.indexOf(":"), kind = at < 0 ? key : key.slice(0, at), def = at < 0 ? "" : key.slice(at + 1);
  let join = true;
  if (kind === "rig" || kind === "factory") for (const p of b0.items.filter((q) => q.def === def)) removeItem(b, p.uid);
  else if (kind === "gear" || kind === "core") b.mods = b.mods.filter((m) => m.def !== def);
  else if (kind === "extra") removeTurret(b, extraSlotOf(b.hero));
  else if (kind === "turret") {
    const e = extraSlotOf(b.hero), hull = hullSlots(b.hero);
    for (const v of installedTurrets(b0)) {
      if (v.turret.def !== def || v.turret.free) continue;
      if (v.slot === e) { removeTurret(b, e); continue; }
      const start = hull[v.slot].start!, home = turretSlots(b)[e]?.turret;
      if (home && home.free && home.def === start) {
        moveTurret(b, e, v.slot);
        removeTurret(b, e);
      } else if (!installTurret(b, { uid: TURRET_UID0 + v.slot, def: start, free: true }, v.slot).ok) {
        installTurret(b, { uid: 9000 + v.slot, def: start, free: true }, v.slot);
      }
    }
  } else if (kind === "join") {
    join = false;
    b.routes.forEach((r, i) => { if (r.join !== undefined) clearJoin(b, i); });
  } else throw new Error(`ablate: unknown part ${key}`);
  return { build: b, dead: refeedAll(b, day, seed, join) };
}

/**
 * --extra (flag 1): the extra TURRET SLOT on the par decks that fill it. Each such deck (FULL) against the same deck with
 * the slot emptied (EMPTY: ablate "extra"; its gold stays unspent, reported) and against the same seed's par run that
 * never fills it (CTRL: --tune extra=0, the gold back to the policy), vs the par field of both heroes, `seeds` x both
 * sides per member, paired. 0.6.2s REPORT section 6: +50 to +76 points for FURNACE at +14 g (bench decks).
 */
async function extraMode(days: number[], run: Runner, out: string, opts: PlayerOpts, k: number, seeds: number, sample: number, tag: string): Promise<void> {
  for (const day of days) {
    const t0 = performance.now();
    const rows: unknown[] = [];
    for (const hero of heroesOf()) {
      // the decks tested: par seeds 1..sample (--sample; default K), each against the K-member field (a seed above K is
      // no field member, so it meets all K)
      const e = extraSlotOf(hero), seedsK = parSeeds(Math.max(k, sample));
      const fill = seedsK.map((s, i) => ({ s, i: i < k ? i : -1, b: playerBuild(hero, day, s, opts) })).filter((x) => !!turretSlots(x.b)[e]?.turret);
      if (!fill.length) {
        rows.push({ hero, day, n: 0, of: seedsK.length });
        console.log(`extra ${tag} ${hero} d${day}: no par deck fills the extra slot`);
        continue;
      }
      const ctrlOpts: PlayerOpts = { ...opts, tune: { ...(opts.tune ?? {}), extra: 0 } };
      const vs: Row[] = [];
      const meta = fill.map((x) => {
        const empty = ablate(x.b, "extra", day, x.s), ctrl = playerBuild(hero, day, x.s, ctrlOpts), pair = `${hero}|${x.s}`;
        vs.push({ build: x.b, pair, hero, self: x.i }, { build: empty.build, pair, hero, self: x.i }, { build: ctrl, pair, hero, self: x.i });
        const t = turretSlots(x.b)[e].turret!;
        return {
          seed: x.s, turret: `${t.def}${starsOf(t) > 1 ? `*${starsOf(t)}` : ""}${t.free ? " (starting copy)" : ""}`, gear: gearOn(x.b, e).map((m) => m.def),
          value: deckCost(x.b).total, emptyValue: deckCost(empty.build).total, ctrlValue: deckCost(ctrl).total, dead: empty.dead, ctrlFills: !!turretSlots(ctrl)[e]?.turret,
        };
      });
      const res = await vsFieldPaired(vs, HEROES, day, run, k, seeds, `cand-extra-${tag}`, opts);
      const lE = fill.map((_, j) => liftOf(res[3 * j], res[3 * j + 1])), lC = fill.map((_, j) => liftOf(res[3 * j], res[3 * j + 2]));
      const cE = meanCI(lE), cC = meanCI(lC);
      rows.push({
        hero, day, n: fill.length, of: seedsK.length, liftEmpty: cE, liftCtrl: cC,
        decks: meta.map((m, j) => ({ ...m, full: rowMean(res[3 * j]), empty: rowMean(res[3 * j + 1]), ctrl: rowMean(res[3 * j + 2]), liftEmpty: lE[j], liftCtrl: lC[j], rates: { full: res[3 * j], empty: res[3 * j + 1], ctrl: res[3 * j + 2] } })),
      });
      console.log(`extra ${tag} ${hero} d${day}: ${fill.length}/${seedsK.length} fill it | FULL - EMPTY ${fmtLift(cE)} pts | FULL - CTRL(extra=0) ${fmtLift(cC)} pts`);
      for (const [j, m] of meta.entries()) console.log(`    s${m.seed} ${m.turret}${m.gear.length ? ` + ${m.gear.join(",")}` : ""}: FULL ${pc(rowMean(res[3 * j]))} (${m.value} g) EMPTY ${pc(rowMean(res[3 * j + 1]))} (${m.emptyValue} g${m.dead ? `, ${m.dead} belt dead` : ""}) CTRL ${pc(rowMean(res[3 * j + 2]))} (${m.ctrlValue} g${m.ctrlFills ? "" : ", slot empty"})`);
    }
    writeFileSync(resolve(out, `extra-${tag}-d${day}.json`), JSON.stringify({ day, k, sample: Math.max(k, sample), seeds, rows }, null, 1));
    console.log(`extra ${tag} d${day} (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
  }
}

/** The flag-3 parts a CAND-A knob disallows (--ctrl): join -> "join", extra -> "extra", turret -> every "turret:<def>". */
const knobParts = (knob: string, b: Build): PartKey[] =>
  partsOf(b).filter((p) => (knob === "turret" ? p.startsWith("turret:") : p === knob));

/**
 * --ctrl <knob> (the joins control, ref/BRIEF-final-062-cand-resume.md step 3; knob: join, turret or extra): each par
 * deck of seeds 1..sample (FULL) against the same seed's par run with --tune <knob>=0 (CTRL: the part never allowed,
 * the gold re-spent by the policy), as --extra's CTRL; beside it, each deck that holds the part against the deck with the
 * part ablated (ABL: --ablate's removal, whose belts are refed where they can be; its dead belts counted). Every variant
 * of a deck meets the par field of both heroes on the same seeds (`seeds` x both sides per member, its own member left
 * out); lifts are paired differences in points, the deck the unit, with a 95% t-interval.
 */
async function ctrlMode(days: number[], run: Runner, out: string, opts: PlayerOpts, k: number, seeds: number, sample: number, knob: string, tag: string): Promise<void> {
  if (!["join", "turret", "extra"].includes(knob)) throw new Error(`--ctrl: unknown knob ${knob} (join, turret, extra)`);
  for (const day of days) {
    const t0 = performance.now();
    const rows: unknown[] = [];
    for (const hero of heroesOf()) {
      const seedsK = parSeeds(Math.max(k, sample));
      const ctrlOpts: PlayerOpts = { ...opts, tune: { ...(opts.tune ?? {}), [knob]: 0 } };
      const vs: Row[] = [];
      const meta = seedsK.map((s, i) => {
        const full = playerBuild(hero, day, s, opts), ctrl = playerBuild(hero, day, s, ctrlOpts), pair = `${hero}|${s}`, self = i < k ? i : -1;
        const parts = knobParts(knob, full);
        let ablBuild: Build | undefined, ablDead = 0;
        for (const p of parts) {
          const a = ablate(ablBuild ?? full, p, day, s);
          ablBuild = a.build;
          ablDead += a.dead;
        }
        const abl = ablBuild ? { build: ablBuild, dead: ablDead } : null;
        const at = vs.length;
        vs.push({ build: full, pair, hero, self }, { build: ctrl, pair, hero, self });
        if (abl) vs.push({ build: abl.build, pair, hero, self });
        return {
          seed: s, at, holds: parts.length > 0, parts, same: JSON.stringify(full) === JSON.stringify(ctrl), ctrlHolds: knobParts(knob, ctrl).length > 0,
          value: deckCost(full).total, ctrlValue: deckCost(ctrl).total, ablValue: abl ? deckCost(abl.build).total : null, dead: abl ? abl.dead : null,
        };
      });
      const res = await vsFieldPaired(vs, HEROES, day, run, k, seeds, `cand-ctrl-${knob}-${tag}`, opts);
      const decks = meta.map((m) => ({
        ...m, full: rowMean(res[m.at]), ctrl: rowMean(res[m.at + 1]), liftCtrl: liftOf(res[m.at], res[m.at + 1]),
        ...(m.holds ? { abl: rowMean(res[m.at + 2]), liftAbl: liftOf(res[m.at], res[m.at + 2]) } : {}),
      }));
      const held = decks.filter((d) => d.holds);
      const cAll = meanCI(decks.map((d) => d.liftCtrl)), cHeld = meanCI(held.map((d) => d.liftCtrl)), cAbl = meanCI(held.map((d) => d.liftAbl!));
      const dead = sum(held.map((d) => d.dead ?? 0)), deadDecks = held.filter((d) => (d.dead ?? 0) > 0).length;
      rows.push({ hero, day, n: decks.length, holders: held.length, liftCtrlAll: cAll, liftCtrlHolders: cHeld, liftAblate: cAbl, dead, deadDecks, decks });
      console.log(`ctrl ${knob} ${tag} ${hero} d${day}: FULL - CTRL(${knob}=0) all ${decks.length} decks ${fmtLift(cAll)} pts | the ${held.length} holders ${fmtLift(cHeld)} | ablate ${fmtLift(cAbl)} pts, ${dead} dead belt(s) in ${deadDecks} deck(s)`);
      for (const d of decks) console.log(`    s${d.seed}${d.holds ? ` [${d.parts.join(",")}]` : ""}: FULL ${pc(d.full)} (${d.value} g) CTRL ${pc(d.ctrl)} (${d.ctrlValue} g${d.same ? ", same deck" : ""}${d.ctrlHolds ? ", holds it" : ""})${d.holds ? ` ABL ${pc(d.abl!)} (${d.ablValue} g, ${d.dead} dead)` : ""}`);
    }
    writeFileSync(resolve(out, `ctrl-${knob}-${tag}-d${day}.json`), JSON.stringify({ day, k, sample: Math.max(k, sample), seeds, knob, rows }, null, 1));
    console.log(`ctrl ${knob} ${tag} d${day} (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
  }
}

/** TUNE-M (T1): the part keys (partsOf) of `b` whose def is `def` (a rig, a factory, gear, a core or a bought turret). */
const defParts = (b: Build, def: string): PartKey[] => partsOf(b).filter((p) => p.includes(":") && p.slice(p.indexOf(":") + 1) === def);

/**
 * TUNE-M T1 --forbid d1,d2,... [--seeds 4] [--sample N]: a part's control (ref/BRIEF-final-062-tune.md T1). Per hero and
 * day, each par deck of seeds 1..sample (FULL) against the same seed's par run with --tune forbid=<def> (CTRL: the caravan
 * still rolls the part, the player never takes it and spends the gold elsewhere; player.ts judges its offers with the
 * same RNG draws, so a run stays aligned until it would first take the part). Every variant meets the par field of both
 * heroes on the same seeds (`seeds` x both sides per member, its own member left out; one seed key for every def, so
 * FULL battles once per hero-day and a CTRL deck identical to its FULL deck reuses FULL's rates: the same battles).
 * Beside it, each holder's ablation (--ablate's removal of each of the def's part keys; ABL, with its dead belts).
 * The brief's lift: FULL - CTRL over the decks whose FULL holds the def (liftCtrlHolders), 95% t-interval, deck unit.
 * Writes forbid-<def>-<tag>-d<day>.json in --ctrl's shape (knob "forbid:<def>") plus the RNG alignment: how many
 * non-holders' CTRL decks are identical to FULL.
 */
async function forbidMode(days: number[], run: Runner, out: string, opts: PlayerOpts, k: number, seeds: number, sample: number, defs: string[], tag: string): Promise<void> {
  for (const def of defs) if (!ITEMS[def]) throw new Error(`--forbid: unknown part ${def}`);
  for (const day of days) {
    const t0 = performance.now();
    const rows = new Map<string, unknown[]>(defs.map((d) => [d, []]));
    for (const hero of heroesOf()) {
      const seedsK = parSeeds(Math.max(k, sample));
      const self = (i: number): number => (i < k ? i : -1);
      const key = `tune-forbid-${tag}`;
      const full = seedsK.map((s) => playerBuild(hero, day, s, opts));
      const fullRes = await vsFieldPaired(full.map((b, i) => ({ build: b, pair: `${hero}|${seedsK[i]}`, hero, self: self(i) })), HEROES, day, run, k, seeds, key, opts);
      for (const def of defs) {
        const ctrlOpts: PlayerOpts = { ...opts, tune: { ...(opts.tune ?? {}), forbid: def } };
        const vs: Row[] = [];
        const meta = seedsK.map((s, i) => {
          const b = full[i], ctrl = playerBuild(hero, day, s, ctrlOpts), pair = `${hero}|${s}`;
          const parts = defParts(b, def), same = JSON.stringify(b) === JSON.stringify(ctrl);
          let ctrlAt = -1, ablAt = -1, ablBuild: Build | undefined, ablDead = 0;
          if (!same) { ctrlAt = vs.length; vs.push({ build: ctrl, pair, hero, self: self(i) }); }
          for (const p of parts) {
            const a = ablate(ablBuild ?? b, p, day, s);
            ablBuild = a.build;
            ablDead += a.dead;
          }
          const abl: { build: Build; dead: number } | null = ablBuild ? { build: ablBuild, dead: ablDead } : null;
          if (abl) { ablAt = vs.length; vs.push({ build: abl.build, pair, hero, self: self(i) }); }
          return {
            seed: s, i, ctrlAt, ablAt, holds: parts.length > 0, parts, same, ctrlHolds: defParts(ctrl, def).length > 0,
            value: deckCost(b).total, ctrlValue: deckCost(ctrl).total, ablValue: abl ? deckCost(abl.build).total : null, dead: abl ? abl.dead : null,
          };
        });
        const res = vs.length ? await vsFieldPaired(vs, HEROES, day, run, k, seeds, key, opts) : [];
        const decks = meta.map(({ ctrlAt, ablAt, i, ...m }) => {
          const f = fullRes[i], c = ctrlAt >= 0 ? res[ctrlAt] : f;
          return {
            ...m, full: rowMean(f), ctrl: rowMean(c), liftCtrl: liftOf(f, c),
            ...(ablAt >= 0 ? { abl: rowMean(res[ablAt]), liftAbl: liftOf(f, res[ablAt]) } : {}),
          };
        });
        const held = decks.filter((d) => d.holds), rest = decks.filter((d) => !d.holds);
        const cAll = meanCI(decks.map((d) => d.liftCtrl)), cHeld = meanCI(held.map((d) => d.liftCtrl)), cAbl = meanCI(held.map((d) => d.liftAbl!));
        const dead = sum(held.map((d) => d.dead ?? 0)), deadDecks = held.filter((d) => (d.dead ?? 0) > 0).length;
        const aligned = rest.filter((d) => d.same).length;
        rows.get(def)!.push({ hero, day, part: def, n: decks.length, holders: held.length, liftCtrlAll: cAll, liftCtrlHolders: cHeld, liftAblate: cAbl, dead, deadDecks, nonHolders: rest.length, alignedNonHolders: aligned, gold: held.length ? mean(held.map((d) => d.value - (d.ablValue ?? d.value))) : null, decks });
        console.log(`forbid ${def} ${tag} ${hero} d${day}: ${held.length}/${decks.length} hold it | FULL - CTRL holders ${held.length ? fmtLift(cHeld) : "-"} | all ${fmtLift(cAll)} | ablate ${held.length ? fmtLift(cAbl) : "-"} pts, ${dead} dead belt(s) | non-holders aligned ${aligned}/${rest.length}`);
      }
    }
    for (const def of defs) writeFileSync(resolve(out, `forbid-${def}-${tag}-d${day}.json`), JSON.stringify({ day, k, sample: Math.max(k, sample), seeds, knob: `forbid:${def}`, rows: rows.get(def) }, null, 1));
    console.log(`forbid ${tag} d${day} (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
  }
}

/** `b` with the turrets in `slots` at `stars` (the installed def and uid; gear beyond a slot's gear slots comes off,
 *  last placed first, as deck.ts trimGear does). */
function withStars(b0: Build, slots: readonly number[], stars: number): Build {
  const b = cloneBuild(b0);
  setTurretList(b, turretList(b).map((t) => (slots.includes(t.slot) ? { ...t, stars } : t)));
  for (const t of slots) {
    const room = gearSlotsAt(b, t), gear = gearOn(b, t);
    if (gear.length <= room) continue;
    const off = new Set(gear.slice(room).map((m) => m.uid));
    b.mods = b.mods.filter((m) => !off.has(m.uid));
  }
  return b;
}

/**
 * --stars (flag 2; --heroes default weaver, --days e.g. 10): each par deck with its starting-slot turret(s) at 1, 2 and 3
 * stars (the installed def; stars change the fire interval x0.9 / x0.8 and add gear slots, no gear is added), slot 0
 * alone and all starting slots, vs the par field of both heroes, `seeds` x both sides per member, paired battle for
 * battle. 0.6.2s bench: WEAVER day 10 par, slot 0, 3 stars 60.2% < 2 stars 65.3%, sign test p = 0.049.
 */
async function starsMode(days: number[], detail: DetailRunner, out: string, opts: PlayerOpts, k: number, seeds: number, tag: string): Promise<void> {
  for (const day of days) {
    const rows: unknown[] = [];
    for (const hero of heroesOf(["weaver"])) {
      const t0 = performance.now();
      const seedsK = parSeeds(k), decks = seedsK.map((s) => playerBuild(hero, day, s, opts));
      const starts = hullSlots(hero).map((s, i) => (s.start ? i : -1)).filter((i) => i >= 0);
      const sets: [string, number[]][] = [["slot 0", [0]], ["all starting slots", starts]];
      const vs: Row[] = [], idx: number[][][] = []; // idx[set][stars - 1][deck] = row
      for (const [, slots] of sets) {
        idx.push([1, 2, 3].map((st) => decks.map((b, i) => {
          vs.push({ build: withStars(b, slots.filter((t) => !!turretSlots(b)[t]?.turret), st), pair: `${hero}|${seedsK[i]}`, hero, self: i });
          return vs.length - 1;
        })));
      }
      const { rates, battles } = await vsFieldBattles(vs, HEROES, day, detail, k, seeds, `cand-stars-${tag}`, opts);
      const setRows = sets.map(([label], si) => {
        const r = idx[si];
        const at = [0, 1, 2].map((x) => meanCI(r[x].map((row) => rowMean(rates[row]))));
        const l32 = decks.map((_, i) => liftOf(rates[r[2][i]], rates[r[1][i]])), l21 = decks.map((_, i) => liftOf(rates[r[1][i]], rates[r[0][i]]));
        let better = 0, worse = 0;
        decks.forEach((_, i) => battles[r[2][i]].forEach((p, x) => { const d = p - battles[r[1][i]][x]; if (d > 0) better++; else if (d < 0) worse++; }));
        const c32 = meanCI(l32), c21 = meanCI(l21), p = signTest(better, worse);
        const now = decks.map((b) => starts.map((t) => starsOf(turretSlots(b)[t]?.turret ?? {})).join("/"));
        console.log(`stars ${tag} ${hero} d${day} ${label}: 1* ${pc(at[0].mean)} 2* ${pc(at[1].mean)} 3* ${pc(at[2].mean)} | 3* - 2* ${fmtLift(c32)} pts, battles better/worse ${better}/${worse}, sign p ${p.toFixed(3)} | 2* - 1* ${fmtLift(c21)} pts | decks' own stars ${now.join(" ")}`);
        return { label, rate: at.map((c) => c.mean), lift32: c32, lift21: c21, better, worse, p, decks: decks.map((_, i) => ({ seed: seedsK[i], stars: now[i], rates: [0, 1, 2].map((x) => rowMean(rates[r[x][i]])), lift32: l32[i], lift21: l21[i] })) };
      });
      rows.push({ hero, day, sets: setRows });
      console.log(`stars ${tag} ${hero} d${day} (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
    }
    writeFileSync(resolve(out, `stars-${tag}-d${day}.json`), JSON.stringify({ day, k, seeds, rows }, null, 1));
  }
}

/** TUNE-M T6: `b` with every copy of `def` (rigs and factories on the deck, gear and cores on turrets) at `stars`, in
 *  place (same cell, rotation, turret and uid). */
function withPartStars(b0: Build, def: string, stars: number): Build {
  const b = cloneBuild(b0);
  const set = (x: { stars?: number }) => { if (stars > 1) x.stars = stars; else delete x.stars; };
  for (const p of b.items) if (p.def === def) set(p);
  for (const m of b.mods) if (m.def === def) set(m);
  return b;
}

/**
 * TUNE-M T6 --partstars d1,d2,... [--seeds 4] [--sample N]: a changed part's merge steps on real decks (the harness star
 * bench's rows and D1 rule, on the par field). Each par deck of seeds 1..N that holds the def (a rig, a factory, gear or
 * a core) plays with every copy of it at 1, 2 and 3 stars in place, against the par field of both heroes (`seeds` x both
 * sides per member, its own member left out), battle for battle. Per hero, day and def: ★2 - ★1, ★3 - ★1 and the STEP
 * ★3 - ★2 (deck unit, 95% t), the battles each step makes better or worse (sign test), and the flags: WORSE (a star row
 * vs ★1) and STEP WORSE (★3 - ★2) by the D1 rule (at least 3 decks, mean below 0, 95% interval below 0), NO EFFECT
 * (every battle ends as at ★1).
 */
async function partStarsMode(days: number[], detail: DetailRunner, out: string, opts: PlayerOpts, k: number, seeds: number, sample: number, defs: string[], tag: string): Promise<void> {
  for (const def of defs) if (!ITEMS[def]) throw new Error(`--partstars: unknown part ${def}`);
  for (const day of days) {
    const rows: unknown[] = [];
    for (const hero of heroesOf()) {
      const seedsK = parSeeds(Math.max(k, sample)), decks = seedsK.map((s) => playerBuild(hero, day, s, opts));
      for (const def of defs) {
        const holders = decks.map((b, i) => ({ b, i })).filter((x) => x.b.items.some((p) => p.def === def) || x.b.mods.some((m) => m.def === def));
        if (!holders.length) { rows.push({ hero, day, def, n: 0 }); continue; }
        const vs: Row[] = [], idx: number[][] = [[], [], []];
        for (const { b, i } of holders) for (const st of [1, 2, 3]) {
          vs.push({ build: withPartStars(b, def, st), pair: `${hero}|${seedsK[i]}`, hero, self: i < k ? i : -1 });
          idx[st - 1].push(vs.length - 1);
        }
        const { rates, battles } = await vsFieldBattles(vs, HEROES, day, detail, k, seeds, `tune-partstars-${tag}`, opts);
        const step = (hi: number, lo: number) => {
          const lifts = holders.map((_, j) => liftOf(rates[idx[hi][j]], rates[idx[lo][j]]));
          let better = 0, worse = 0;
          holders.forEach((_, j) => battles[idx[hi][j]].forEach((p, x) => { const d = p - battles[idx[lo][j]][x]; if (d > 0) better++; else if (d < 0) worse++; }));
          const c = meanCI(lifts);
          return { ...c, better, worse, p: signTest(better, worse), d1: holders.length >= 3 && c.mean < 0 && !!c.ci && c.ci[1] < 0, lifts };
        };
        const s21 = step(1, 0), s31 = step(2, 0), s32 = step(2, 1);
        const same = (a: number, b: number) => holders.every((_, j) => JSON.stringify(battles[idx[a][j]]) === JSON.stringify(battles[idx[b][j]]));
        const flags = [s21.d1 || s31.d1 ? "WORSE" : "", s32.d1 ? "STEP WORSE" : "", same(1, 0) && same(2, 0) ? "NO EFFECT" : ""].filter(Boolean);
        const at = [0, 1, 2].map((x) => mean(idx[x].map((r) => rowMean(rates[r]))));
        rows.push({ hero, day, def, n: holders.length, rate: at, s21, s31, s32, flags, seeds: holders.map((h) => seedsK[h.i]) });
        console.log(`partstars ${tag} ${hero} d${day} ${def}: ${holders.length} decks | 1* ${pc(at[0])} 2* ${pc(at[1])} 3* ${pc(at[2])} | 2-1 ${fmtLift(s21)} (${s21.better}/${s21.worse}) | 3-1 ${fmtLift(s31)} | STEP 3-2 ${fmtLift(s32)} (${s32.better}/${s32.worse}, p ${s32.p.toFixed(3)}) | ${flags.join(", ") || "-"}`);
      }
    }
    writeFileSync(resolve(out, `partstars-${tag}-d${day}.json`), JSON.stringify({ day, k, seeds, defs, rows }, null, 1));
  }
}

/**
 * --ablate (flag 3, REQ-BFG-033 clause 4; --days e.g. 5,7,10): every part (partsOf) in at least `min` par decks of a
 * hero-day is taken out of each deck that holds it (ablate), and that deck's win rate against the par field of both
 * heroes (`seeds` x both sides per member) is compared with the whole deck's on the same seeds: lift = whole - ablated,
 * in points, the deck the unit. FLAG: a mean lift above 10 points ("every deck": each deck with it gains over 10).
 */
async function ablateMode(days: number[], run: Runner, out: string, opts: PlayerOpts, k: number, seeds: number, min: number, tag: string): Promise<void> {
  for (const day of days) {
    for (const hero of heroesOf()) {
      const t0 = performance.now();
      const seedsK = parSeeds(k), decks = seedsK.map((s) => playerBuild(hero, day, s, opts));
      const holders = new Map<PartKey, number[]>();
      decks.forEach((b, i) => { for (const p of partsOf(b)) holders.set(p, [...(holders.get(p) ?? []), i]); });
      const keys = [...holders.keys()].filter((p) => holders.get(p)!.length >= min).sort();
      const vs: Row[] = decks.map((b, i) => ({ build: b, pair: `${hero}|${seedsK[i]}`, hero, self: i }));
      // the par player's reading of the same removal (rateDeck: whole / ablated - 1), with the CAND-A saturation curve
      // and with FB-C's cliff: does the rating the player shops by rank the parts as the battle does?
      const rel = (a: Build, b: Build, m = RATING_CURVE) => { const x = rateDeck(b, m).value; return x > 0 ? rateDeck(a, m).value / x - 1 : 1; };
      const meta: { key: PartKey; deck: number; row: number; dead: number; gold: number; relCurve: number; relCliff: number }[] = [];
      for (const key of keys) {
        for (const i of holders.get(key)!) {
          const a = ablate(decks[i], key, day, seedsK[i]);
          meta.push({ key, deck: i, row: vs.length, dead: a.dead, gold: deckCost(decks[i]).total - deckCost(a.build).total, relCurve: rel(decks[i], a.build), relCliff: rel(decks[i], a.build, RATING_CLIFF) });
          vs.push({ build: a.build, pair: `${hero}|${seedsK[i]}`, hero, self: i });
        }
      }
      const res = await vsFieldPaired(vs, HEROES, day, run, k, seeds, `cand-ablate-${tag}`, opts);
      const parts = keys.map((key) => {
        const ms = meta.filter((m) => m.key === key);
        const lifts = ms.map((m) => liftOf(res[m.deck], res[m.row]));
        const c = meanCI(lifts);
        return {
          key, n: ms.length, mean: c.mean, ci: c.ci, min: Math.min(...lifts), max: Math.max(...lifts), over10: lifts.filter((x) => x > 0.1).length,
          gold: mean(ms.map((m) => m.gold)), dead: sum(ms.map((m) => m.dead)), relCurve: mean(ms.map((m) => m.relCurve)), relCliff: mean(ms.map((m) => m.relCliff)),
          seeds: ms.map((m) => seedsK[m.deck]), lifts, rels: ms.map((m) => [m.relCurve, m.relCliff]),
        };
      }).sort((x, y) => y.mean - x.mean);
      const base = decks.map((_, i) => rowMean(res[i]));
      // rank agreement over every (part, deck) removal: Spearman's rho of the battle lift and each rating's rel
      const all = meta.map((m) => ({ lift: liftOf(res[m.deck], res[m.row]), curve: m.relCurve, cliff: m.relCliff }));
      const rCurve = spearman(all.map((x) => x.lift), all.map((x) => x.curve)), rCliff = spearman(all.map((x) => x.lift), all.map((x) => x.cliff));
      writeFileSync(resolve(out, `ablate-${tag}-${hero}-d${day}.json`), JSON.stringify({ day, hero, k, seeds, min, base, spearman: { curve: rCurve, cliff: rCliff }, parts }, null, 1));
      console.log(`ablate ${tag} ${hero} d${day}: ${keys.length} parts in ${min}+ of ${k} decks, ${meta.length} ablated decks (${((performance.now() - t0) / 1000).toFixed(0)} s); whole decks ${pc(mean(base))}; rating vs battle, Spearman over removals: curve ${rCurve.toFixed(2)} cliff ${rCliff.toFixed(2)}`);
      for (const p of parts) {
        const flagged = p.mean > 0.1 ? (p.over10 === p.n ? "  FLAG (every deck)" : "  FLAG (mean)") : "";
        console.log(`    ${p.key.padEnd(22)} n ${String(p.n).padStart(2)} lift ${fmtLift(p)} min ${pp(p.min)} max ${pp(p.max)} >10 in ${p.over10}/${p.n} | ${p.gold.toFixed(1)} g | rating rel curve ${pp(p.relCurve)}% cliff ${pp(p.relCliff)}%${p.dead ? ` | ${p.dead} belt(s) dead` : ""}${flagged}`);
      }
    }
  }
}

// junction-062's bench layouts (tests/joins.bench.test.ts, rebuilt cell for cell: a test file can't be imported outside
// vitest). FURNACE: KILN (4,6), belt M up column 4 into connector 4, STAMP PRESS (6,6), DOUBLE STAMP (1,6) in the
// three-factory group, the rig row west of M facing east. WEAVER: LOOM (4,5), belts A/B/C into turrets 2/1/3, PRESS
// (7,7), DOUBLE STAMP (0,6), the rig row west of A.
const jbRigs = (day: number): [string, number][] =>
  day >= 10 ? [["temper", 2], ["whetstone", 2], ["brake", 1], ["splitter", 1]] : day >= 7 ? [["temper", 2], ["whetstone", 2], ["brake", 1]] : [["temper", 1], ["whetstone", 1], ["brake", 1]];
function jbDeck(hero: "furnace" | "weaver", day: number, three: boolean, routes: RouteDef[]): Build {
  const f = hero === "furnace", st = (s: number) => (s > 1 ? { stars: s } : {});
  const items: Placed[] = f
    ? [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "press", x: 6, y: 6 }, ...(three ? [{ uid: 3, def: "doublestamp", x: 1, y: 6 }] : [])]
    : [{ uid: 1, def: "loom", x: 4, y: 5 }, { uid: 2, def: "press", x: 7, y: 7 }, ...(three ? [{ uid: 3, def: "doublestamp", x: 0, y: 6 }] : [])];
  jbRigs(day).forEach(([def, s], i) => items.push({ uid: 10 + i, def, x: 3, y: (f ? 4 : 3) - i, ...rotField(def, 1), ...st(s) }));
  return {
    hero, items, routes: routes.map((r) => ({ ...r, cells: [...r.cells] })), mods: day >= 7 ? [{ uid: 30, def: "calibrate", turret: f ? 0 : 1 }] : [],
    beltCap: f ? (three ? 18 : 14) : 24, hullBonus: heroRefBuild(hero, day).hullBonus,
  };
}
const FM = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)], F_P5 = [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)];
const F_P5L = [K(7, 5), K(7, 4), K(7, 3), K(7, 2), K(7, 1), K(7, 0), K(6, 0), K(5, 0)], F_PJ = [K(6, 5), K(5, 5)], F_DJ = [K(3, 6), K(3, 5)];
const WA = [K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)], WB = [K(3, 5), K(2, 5), K(1, 5), K(1, 4), K(1, 3), K(1, 2), K(1, 1), K(1, 0)];
const WC = [K(6, 5), K(7, 5), K(8, 5), K(8, 4), K(8, 3), K(8, 2), K(8, 1), K(8, 0)], W_CJ = [K(5, 4)];
const W_P8 = [K(8, 6), K(8, 5), K(8, 4), K(8, 3), K(8, 2), K(8, 1), K(8, 0)], W_PJ = [K(7, 6), K(6, 6), K(6, 5), K(6, 4), K(5, 4)];
const W_D1 = [K(1, 5), K(1, 4), K(1, 3), K(1, 2), K(1, 1), K(1, 0)], W_DJ = [K(1, 5), K(2, 5), K(3, 5), K(3, 4)];
const JB: Record<string, (d: number) => Build> = {
  F0: (d) => jbDeck("furnace", d, false, [{ factory: 1, cells: FM }, { factory: 2, cells: F_P5 }]),
  F0L: (d) => jbDeck("furnace", d, false, [{ factory: 1, cells: FM }, { factory: 2, cells: F_P5L }]),
  F1: (d) => jbDeck("furnace", d, false, [{ factory: 1, cells: FM }, { factory: 2, cells: F_PJ, join: K(4, 5) }]),
  F2: (d) => jbDeck("furnace", d, false, [{ factory: 1, cells: FM }, { factory: 2, cells: F_P5, join: K(4, 0) }]),
  F3: (d) => jbDeck("furnace", d, true, [{ factory: 1, cells: FM }, { factory: 2, cells: F_P5 }]),
  F3L: (d) => jbDeck("furnace", d, true, [{ factory: 1, cells: FM }, { factory: 2, cells: F_P5L }]),
  F4: (d) => jbDeck("furnace", d, true, [{ factory: 1, cells: FM }, { factory: 2, cells: F_P5 }, { factory: 3, cells: F_DJ, join: K(4, 5) }]),
  F5: (d) => jbDeck("furnace", d, true, [{ factory: 1, cells: FM }, { factory: 2, cells: F_PJ, join: K(4, 5) }, { factory: 3, cells: F_DJ, join: K(4, 5) }]),
  W0: (d) => jbDeck("weaver", d, false, [{ factory: 1, cells: WA }, { factory: 1, cells: WB }, { factory: 2, cells: W_P8 }]),
  W1: (d) => jbDeck("weaver", d, false, [{ factory: 1, cells: WA }, { factory: 1, cells: WB }, { factory: 2, cells: W_PJ, join: K(4, 4) }]),
  W2: (d) => jbDeck("weaver", d, false, [{ factory: 1, cells: WA }, { factory: 1, cells: WB }, { factory: 1, cells: WC }]),
  W3: (d) => jbDeck("weaver", d, false, [{ factory: 1, cells: WA }, { factory: 1, cells: WB }, { factory: 1, cells: W_CJ, join: K(4, 4) }, { factory: 2, cells: W_P8 }]),
  W4: (d) => jbDeck("weaver", d, true, [{ factory: 1, cells: WA }, { factory: 2, cells: W_P8 }, { factory: 3, cells: W_D1 }]),
  W5: (d) => jbDeck("weaver", d, true, [{ factory: 1, cells: WA }, { factory: 2, cells: W_PJ, join: K(4, 4) }, { factory: 3, cells: W_DJ, join: K(4, 4) }]),
};
/** junction-062 section 8's comparisons (join layout minus join-free layout). */
const JB_PAIRS: [string, string, string][] = [
  ["F1", "F0", "PRESS joined before the rig row vs its own 7-tile belt"], ["F1", "F0L", "... vs its own 8-tile belt (E1)"], ["F0L", "F0", "E1 alone (8 vs 7 tiles)"],
  ["F2", "F0L", "a join at the intake tile vs the 8-tile belt"], ["F4", "F3L", "three into one heavy turret (one join) vs the third idle"],
  ["F5", "F3L", "three into one intake (two joins) vs the third idle"], ["W1", "W0", "WEAVER: PRESS joined before the rig row vs its own turret"],
  ["W3", "W2", "WEAVER: a join frees a connector for the idle PRESS"], ["W5", "W4", "WEAVER: three lines into turret 2 vs one per turret"],
];

/**
 * --joins (flag 4; --days e.g. 5,7,10): junction-062's bench layouts (JB) against the par field of both heroes, `seeds`
 * x both sides per member, every layout on the same seeds per member; lifts are paired per member, the member (24) the
 * unit. The par player's own F1s: --uptake's f1 column.
 */
async function joinsMode(days: number[], run: Runner, out: string, opts: PlayerOpts, k: number, seeds: number, tag: string): Promise<void> {
  for (const day of days) {
    const t0 = performance.now();
    const ids = Object.keys(JB);
    const decks = ids.map((id) => JB[id](day));
    for (const [i, b] of decks.entries()) {
      const v = validateBuild(b, 10);
      if (!v.ok) throw new Error(`joins: layout ${ids[i]} d${day} is not legal: ${v.errors.join("; ")}`);
    }
    const res = await vsFieldPaired(decks.map((b) => ({ build: b, pair: "jb", hero: b.hero, self: -1 })), HEROES, day, run, k, seeds, `cand-joins-${tag}`, opts);
    const at = Object.fromEntries(ids.map((id, i) => [id, res[i]]));
    const members = (r: Rates) => HEROES.flatMap((h) => r[h]);
    const rate = Object.fromEntries(ids.map((id) => [id, memberCI(members(at[id]))]));
    const pairs = JB_PAIRS.map(([a, b, what]) => {
      const xa = members(at[a]), xb = members(at[b]);
      const c = meanCI(xa.map((x, m) => x - xb[m]));
      return { a, b, what, mean: c.mean, ci: c.ci };
    });
    console.log(`joins ${tag} d${day}: ${ids.map((id) => `${id} ${pc(rate[id].mean)}`).join(" ")} (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
    for (const p of pairs) console.log(`    ${`${p.a} - ${p.b}`.padEnd(10)} ${fmtLift(p)} pts  ${p.what}`);
    writeFileSync(resolve(out, `joins-${tag}-d${day}.json`), JSON.stringify({ day, k, seeds, rate, pairs, rates: at }, null, 1));
  }
}

/** tests/joins.bench.test.ts JOIN_BENCH_KEY: the join bench's seed key. */
const JOIN_BENCH_KEY = "bb-bench-joins";

/**
 * --joins --foes gauntlet (flag 4 on junction-062's own terms; --seeds default 12, its REPORT section 8 run): each
 * layout against the day's harness gauntlet (heroRefBuild of the six HARNESS_HEROES) on the bench's own seeds
 * (focusSeeds(DEFAULT_OPTS.seed, day, hero, foe, "bb-bench-joins"), each from both sides: tests/joins.bench.test.ts
 * benchDay's battles), so the win rates are that table's on this head. One job per (layout, foe, seed); the pair
 * (foe, seed) is the unit of every interval, and lifts are paired on it.
 */
async function joinsGauntletMode(days: number[], run: Runner, out: string, seeds: number, tag: string): Promise<void> {
  for (const day of days) {
    const t0 = performance.now();
    const ids = Object.keys(JB), decks = ids.map((id) => JB[id](day));
    const foes = HARNESS_HEROES.map((h) => heroRefBuild(h, day));
    const o = { ...DEFAULT_OPTS, seeds };
    const jobs: Job[] = [];
    decks.forEach((b, i) => {
      const src = b.hero === "furnace" ? 0 : 1;
      foes.forEach((_, g) => { for (const s of focusSeeds(o, day, src, g, JOIN_BENCH_KEY)) jobs.push({ a: i, b: decks.length + g, seeds: [s], day }); }); // HULL-1a
    });
    const pts = await run([...decks, ...foes], jobs);
    const per = foes.length * seeds;
    const units: Record<string, number[]> = Object.fromEntries(ids.map((id, i) => [id, pts.slice(i * per, (i + 1) * per).map((p) => p / 2)]));
    const rate = Object.fromEntries(ids.map((id) => { const c = meanCI(units[id]); return [id, { mean: c.mean, ci: c.ci, battles: 2 * per }]; }));
    const pairs = JB_PAIRS.map(([a, b, what]) => { const c = meanCI(units[a].map((x, u) => x - units[b][u])); return { a, b, what, mean: c.mean, ci: c.ci }; });
    console.log(`joins gauntlet ${tag} d${day}: ${ids.map((id) => `${id} ${pc(rate[id].mean)}`).join(" ")} (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
    for (const p of pairs) console.log(`    ${`${p.a} - ${p.b}`.padEnd(10)} ${fmtLift(p)} pts  ${p.what}`);
    writeFileSync(resolve(out, `joins-gauntlet-${tag}-d${day}.json`), JSON.stringify({ day, seeds, foes: HARNESS_HEROES, rate, pairs, units }, null, 1));
  }
}

/** A policy spec "policy" or "policy|knob=v,knob=v" (--vs): the player options it names. */
function specOpts(spec: string): PlayerOpts {
  const [policy, tunes = ""] = spec.split("|");
  const tune = Object.fromEntries(tunes.split(",").filter(Boolean).map((kv) => {
    const [key, v] = kv.split("=");
    return [key, key === "grow" ? v === "1" || v === "true" : Number.isFinite(Number(v)) ? Number(v) : v];
  })) as PlayerOpts["tune"];
  return { policy: policy as PlayerOpts["policy"], ...(Object.keys(tune ?? {}).length ? { tune } : {}) };
}

/**
 * --vs "spec;spec;..." (the ladder's rows for any policy, e.g. "sharp|turret=0;typical|join=0"): per hero and day, the
 * field of each spec (seeds 1..K) against the par field of the same hero, `seeds` x both sides per member, the row
 * field's member the unit (as --ladder). "row@ref" plays the row field against the field of spec `ref` instead of the
 * par field. Diagnoses which CAND-A knob moves the ladder.
 */
async function vsMode(days: number[], run: Runner, out: string, k: number, seeds: number, specs: string[], tag: string): Promise<void> {
  for (const day of days) {
    const rows: unknown[] = [];
    for (const hero of heroesOf()) {
      const line: string[] = [];
      for (const spec of specs) {
        const [row, ref] = spec.split("@");
        const decks = parField(hero, day, k, specOpts(row));
        const res = await vsPar(decks, [hero], day, run, { key: `par-vs-${spec}`, k, seeds, ...(ref ? { player: specOpts(ref) } : {}) });
        const c = memberCI(res.map((r) => r[hero].rate));
        rows.push({ hero, spec, ...c, members: res.map((r) => r[hero].rate), rowValue: decks.map((b) => deckCost(b).total) });
        line.push(`${spec} ${ciOf(c)}`);
      }
      console.log(`vs ${tag} ${hero} d${day}: ${line.join(" | ")}`);
    }
    writeFileSync(resolve(out, `vs-${tag}-d${day}.json`), JSON.stringify({ day, k, seeds, specs, rows }, null, 1));
  }
}

/**
 * --synergy (TUNE-C, ref/BRIEF-final-062-captains.md section 3 item 5; REQ-BFG-024): does each named build's synergy
 * pay? Per day (default 5, 9 and 10), each captain's build (days 1-9: the 12 stand-in captains' standInBuild, the named
 * dusk build; day 10: the Iron Matriarch's warlord deck, rivalBuild), beside `variants` copies with every synergy part
 * (RivalPlan.synergy) swapped for an off-plan part of the same cost in the same slot (harness/synergy.ts synergySwap),
 * against both par fields. Paired: a captain-day's decks meet par member m of hero h on the same seeds,
 * hashSeed("par-synergy", day, id, h, m, s), `seeds` x both sides. The change is per member (the variants' mean rate
 * minus the build's), with its 95% t-interval over the members. The synergy PAYS when the change's interval against the
 * FURNACE field (the calibration field) lies below 0. Writes <out>/synergy-<tag>-d<day>.json per day.
 */
async function synergyMode(days: number[], run: Runner, out: string, opts: PlayerOpts, k: number, seeds: number, variants: number, tag: string): Promise<void> {
  const only = flag("ids")?.split(",") as RivalId[] | undefined;
  const ci = (xs: number[]) => { const m = meanCI(xs); return { mean: m.mean, lo: m.ci ? m.ci[0] : NaN, hi: m.ci ? m.ci[1] : NaN }; };
  const sgn = (x: number) => `${x >= 0 ? "+" : ""}${(100 * x).toFixed(0)}`;
  const fmtCh = (c: { mean: number; lo: number; hi: number }) => `${sgn(c.mean)} [${sgn(c.lo)} to ${sgn(c.hi)}]`;
  for (const day of days) {
    const t0 = performance.now();
    const ids = (day === 10 ? ["matriarch" as RivalId] : RIVAL_IDS.filter((id) => id !== "matriarch")).filter((id) => !only || only.includes(id));
    const groups = ids.map((id) => {
      const pve = id === "matriarch";
      const build = pve ? rivalBuild(id, day) : standInBuild(id, day);
      const vs = Array.from({ length: variants }, (_, v) => synergySwap(id, PLANS[id], build, day, v, pve));
      return { id, kind: pve ? "warlord" : "standin", build, vs };
    });
    const FIELDS = fieldsOf(), EXTRA = FIELDS.filter((h) => !HEROES.includes(h)); // 0.8.0 N1: --fields
    const refs = FIELDS.map((h) => parField(h, day, k, opts));
    const decks = groups.flatMap((g) => [g.build, ...g.vs.map((x) => x.build)]);
    const field = [...decks, ...refs.flat()];
    const at: number[] = [];
    let off = decks.length;
    for (const r of refs) { at.push(off); off += r.length; }
    const jobs: Job[] = [];
    let d = 0;
    for (const g of groups) {
      for (let j = 0; j <= variants; j++, d++) {
        FIELDS.forEach((h, hi) => refs[hi].forEach((_, m) => jobs.push({ a: d, b: at[hi] + m, seeds: Array.from({ length: seeds }, (_, s) => hashSeed("par-synergy", day, g.id, h, m, s)), day }))); // HULL-1a
      }
    }
    const pts = await run(field, jobs);
    let x = 0;
    const rows = groups.map((g) => {
      // rates[j][hero][m]: deck j (0 = the build, 1.. the swapped variants) against member m
      const rates = Array.from({ length: variants + 1 }, () => Object.fromEntries(FIELDS.map((h, hi) => [h, refs[hi].map(() => pts[x++] / (2 * seeds))])) as Record<HeroId, number[]>);
      const change = (h: HeroId) => refs[FIELDS.indexOf(h)].map((_, m) => mean(rates.slice(1).map((r) => r[h][m])) - rates[0][h][m]);
      const ch: Record<string, { mean: number; lo: number; hi: number }> & { furnace: { mean: number; lo: number; hi: number }; weaver: { mean: number; lo: number; hi: number }; both: { mean: number; lo: number; hi: number } } = {
        furnace: ci(change("furnace")), weaver: ci(change("weaver")), both: ci([...change("furnace"), ...change("weaver")]),
        ...Object.fromEntries(EXTRA.map((h) => [h, ci(change(h))])),
      };
      const swaps: Swap[][] = g.vs.map((v) => v.swaps);
      return {
        id: g.id, kind: g.kind, cost: deckCost(g.build).total, synergy: PLANS[g.id].synergy ?? [],
        rate: Object.fromEntries(FIELDS.map((h) => [h, mean(rates[0][h])])), members: rates[0],
        variants: g.vs.map((v, j) => ({ swaps: v.swaps, kept: v.kept, cost: deckCost(v.build).total, rate: Object.fromEntries(FIELDS.map((h) => [h, mean(rates[j + 1][h])])), members: rates[j + 1] })),
        change: ch, pays: ch.furnace.hi < 0, parts: swaps[0]?.length ?? 0,
      };
    });
    for (const r of rows) {
      const sw = r.variants.map((v) => v.swaps.map((s) => `${s.from}->${s.to}${s.stars > 1 ? `*${s.stars}` : ""}${s.dGold ? `(${s.dGold > 0 ? "+" : ""}${s.dGold}g)` : ""}${s.tier === "off-plan" ? "" : `[${s.tier}]`}`).join(",") + (v.kept.length ? ` kept ${v.kept.join(",")}` : "")).join(" | ");
      const extra = EXTRA.map((h) => ` ${h.toUpperCase()} ${pc(r.rate[h])} -> ${pc(mean(r.variants.map((v) => v.rate[h])))} ${fmtCh(r.change[h])}`).join(";");
      console.log(`synergy ${tag} d${day} ${r.id.padEnd(10)} ${r.kind} ${String(r.cost).padStart(3)}g: build F ${pc(r.rate.furnace)} W ${pc(r.rate.weaver)}; swapped F ${pc(mean(r.variants.map((v) => v.rate.furnace)))} W ${pc(mean(r.variants.map((v) => v.rate.weaver)))}; change F ${fmtCh(r.change.furnace)} W ${fmtCh(r.change.weaver)} both ${fmtCh(r.change.both)}${extra ? `;${extra}` : ""} -> ${r.pays ? "PAYS" : "does not pay"} | ${sw}`);
    }
    writeFileSync(resolve(out, `synergy-${tag}-d${day}.json`), JSON.stringify({ day, k, seeds, variants, rows }, null, 1));
    console.log(`synergy ${tag} d${day}: ${rows.length} builds, ${rows.filter((r) => r.pays).length} pay (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
  }
}

async function main(): Promise<void> {
  const days = flag("days")?.split(",").map(Number) ?? Array.from({ length: 10 }, (_, i) => i + 1);
  const nw = num("workers", 4);
  const out = resolve(flag("out") ?? "../output-par");
  const cache = resolve(flag("cache") ?? out);
  mkdirSync(out, { recursive: true });
  mkdirSync(cache, { recursive: true });
  const pool = workerRunner(nw, import.meta.url);
  const t0 = performance.now();
  const policy = (flag("policy") ?? "typical") as PlayerOpts["policy"];
  const k = num("k", PAR_K);
  // --tune whim=0.5,noise=0.6: policy knob overrides (sweeps)
  const tune = Object.fromEntries((flag("tune") ?? "").split(",").filter(Boolean).map((kv) => {
    const [key, v] = kv.split("=");
    return [key, key === "grow" ? v === "1" || v === "true" : Number.isFinite(Number(v)) ? Number(v) : v];
  })) as PlayerOpts["tune"];
  const opts: PlayerOpts = { policy, ...(Object.keys(tune ?? {}).length ? { tune } : {}) };
  const tag = flag("tag") ?? `${policy}${flag("tune") ? `-${flag("tune")}` : ""}`;
  if (process.argv.includes("--show")) showMode(days, opts, k);
  if (flag("showpop")) showPopMode(days, num("showpop", 8), cache);
  if (process.argv.includes("--spend")) spendMode(days, out, opts, k, tag);
  if (process.argv.includes("--mix")) mixMode(days, out, opts, k, tag);
  if (process.argv.includes("--pct")) await pctMode(days, pool.run, out, cache, opts, k, tag);
  if (process.argv.includes("--pool")) await poolMode(days, pool.run, out, opts, k, tag, flag("pool-data"));
  if (process.argv.includes("--rivals")) await rivalsMode(days, pool.run, pool.detail, out, cache, opts, k, num("seeds", 4), num("tq-seeds", 20), tag);
  if (process.argv.includes("--ladder")) await ladderMode(days, pool.run, out, k, num("seeds", 4), tag);
  if (process.argv.includes("--desk")) await deskMode(pool.run, out, k, num("seeds", 10));
  // 0.6.2 CAND-A
  if (process.argv.includes("--fingerprint")) fingerprintMode(days, opts, k);
  if (process.argv.includes("--uptake")) uptakeMode(days, out, opts, k, tag);
  if (process.argv.includes("--extra")) await extraMode(days, pool.run, out, opts, k, num("seeds", 4), num("sample", k), tag);
  if (flag("ctrl")) await ctrlMode(days, pool.run, out, opts, k, num("seeds", 4), num("sample", k), flag("ctrl")!, tag);
  if (flag("forbid")) await forbidMode(days, pool.run, out, opts, k, num("seeds", 4), num("sample", k), flag("forbid")!.split(",").filter(Boolean), tag); // TUNE-M T1
  if (process.argv.includes("--rigs")) rigsMode(days, out, opts, k, num("sample", k), tag); // TUNE-M T3
  if (flag("partstars")) await partStarsMode(days, pool.detail, out, opts, k, num("seeds", 4), num("sample", k), flag("partstars")!.split(",").filter(Boolean), tag); // TUNE-M T6
  if (process.argv.includes("--stars")) await starsMode(days, pool.detail, out, opts, k, num("seeds", 4), tag);
  if (process.argv.includes("--ablate")) await ablateMode(days, pool.run, out, opts, k, num("seeds", 4), num("min", 3), tag);
  if (process.argv.includes("--joins")) {
    if (flag("foes") === "gauntlet") await joinsGauntletMode(days, pool.run, out, num("seeds", 12), tag);
    else await joinsMode(days, pool.run, out, opts, k, num("seeds", 10), tag);
  }
  if (flag("vs")) await vsMode(days, pool.run, out, k, num("seeds", 4), flag("vs")!.split(";").filter(Boolean), tag);
  // 0.6.2 TUNE-C
  if (process.argv.includes("--synergy")) await synergyMode(flag("days") ? days : [5, 9, 10], pool.run, out, opts, k, num("seeds", 4), num("variants", 3), tag);
  await pool.close();
  console.log(`done in ${((performance.now() - t0) / 1000).toFixed(0)} s on ${nw} worker(s)`);
  void buildCost;
}

// HULL-1b (REQ-BFG-070): --ladder-fix runs with LADDER_FIX on (src/sim/ladderFix.ts) in the main thread: the par decks,
// the --fingerprint lines and every no-battle mode. Worker threads don't read the flag, so a battle mode takes --workers 1
// (its battles then run in the main thread, localRunner).
if (isMainThread && process.argv.includes("--ladder-fix")) setLadderFix(true);
// HULL-1c (REQ-BFG-079, REQ-BFG-078): --hull-scale (HULL_SCALE), --npc-day (NPC_DAY) and --all-on (those two and
// LADDER_FIX) turn the switches on through each module's setter in the main thread AND in every worker thread: the main
// thread hands the list to its workers in the environment (PARBENCH_SWITCHES, which a worker thread inherits), so a
// battle mode runs on any --workers. Without these flags nothing here runs.
{
  const sw = new Set<string>();
  if (isMainThread) {
    if (process.argv.includes("--all-on")) for (const s of ["ladder", "hull", "npc"]) sw.add(s);
    if (process.argv.includes("--hull-scale")) sw.add("hull");
    if (process.argv.includes("--npc-day")) sw.add("npc");
    if (process.argv.includes("--plain-rigs")) sw.add("plain"); // PLAIN-1 (REQ-BFG-084): PLAIN_RIGS, beside --all-on or alone
    if (process.argv.includes("--first-run")) sw.add("first"); // FIRSTDAY-1 (REQ-BFG-004): FIRST_RUN (the par player never plays a first run: F5)
    if (sw.size) process.env.PARBENCH_SWITCHES = [...sw, ...(process.argv.includes("--ladder-fix") ? ["ladder"] : [])].join(",");
  } else for (const s of (process.env.PARBENCH_SWITCHES ?? "").split(",")) if (s) sw.add(s);
  if (sw.has("ladder")) setLadderFix(true);
  if (sw.has("hull")) setHullScale(true);
  if (sw.has("npc")) setNpcDay(true);
  if (sw.has("plain")) setPlainRigs(true); // PLAIN-1: the six in ITEMS in every thread (a content patch)
  if (sw.has("first")) setFirstRun(true); // FIRSTDAY-1 (F5): with it on, every par deck must equal the switch-off decks'
}
// the entry comes last, so every module-level constant above is initialised before main() runs
if (!isMainThread) serveJobs();
else {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
