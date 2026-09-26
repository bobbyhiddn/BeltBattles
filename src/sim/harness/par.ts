// Balance harness: THE par (FB-C, REQ-BFG-026). Every par-relative check reads par through parRefs() below: the
// stand-in pool's vsPar (standins.ts), the balance report's Reference (tournament.ts calibration), the first-fight
// par-loss rate and Hard-vs-par (tools/parBench.ts). Par is what a typical player can actually assemble: the par FIELD
// of a hero and day is the par player's decks of seeds 1..PAR_K (player.ts playerBuild: a real run through the game's
// caravan, bound by its luck), and vsPar is a win rate against the whole field, so it is continuous, not 0% or 100%.
// The par DECK, for callers that need one deck, is the field member of median strength against the field.
// "heroref" is the legacy par (heroRefBuild, the warlord deck with its plating ramp): it stays for the committed data
// it generated (the stand-in pool v2.1, `standins --check --par heroref`) and for tests pinned to it.

import { hashSeed } from "../../core/rng";
import type { HeroId } from "../content";
import type { Build } from "../deck";
import { heroRefBuild } from "./heroes";
import { playerBuild, type PlayerOpts } from "./player";
import type { Job, Runner } from "./tournament";

/** Par field size: seeds 1..PAR_K of the par player per hero and day. */
export const PAR_K = 12;
/** Seeds per pairing when a deck meets the par field (each played from both sides): the harness's refSeeds. */
export const PAR_SEEDS = 10;

/** "field": the par player's field (the default for every par-relative check); "heroref": the legacy par deck. */
export type ParSource = "field" | "heroref";

/** The par player's seeds for a field of k. */
export const parSeeds = (k = PAR_K): number[] => Array.from({ length: k }, (_, i) => i + 1);

/** The par field of (hero, day): playerBuild(hero, day, s) for s in parSeeds(k), fresh copies. `player`: the par
 *  player's options (the typical policy by default; bench sweeps pass their knob overrides). */
export function parField(hero: HeroId, day: number, k = PAR_K, player: PlayerOpts = {}): Build[] {
  return parSeeds(k).map((s) => playerBuild(hero, day, s, player));
}

/**
 * THE par of (hero, day), as the decks a par-relative check measures against. "field" (default): the par field;
 * "heroref": [heroRefBuild(hero, day)], the legacy par deck. A win rate "vs par" is the mean over these decks.
 */
export function parRefs(hero: HeroId, day: number, source: ParSource = "field", k = PAR_K, player: PlayerOpts = {}): Build[] {
  return source === "heroref" ? [heroRefBuild(hero, day)] : parField(hero, day, k, player);
}

/** Points to a win rate: a Runner returns points over 2 x seeds battles per job. */
const rate = (pts: number, battles: number): number => (battles > 0 ? pts / battles : 0);

/**
 * Each deck's win rate against the others (a round robin, `seeds` per pairing, both sides): the field's strength.
 * `seedsOf(i, j)` (i < j) names each pairing's seeds.
 */
export async function roundRobin(decks: Build[], seedsOf: (i: number, j: number) => number[], run: Runner): Promise<number[]> {
  const jobs: Job[] = [];
  for (let i = 0; i < decks.length; i++) for (let j = i + 1; j < decks.length; j++) jobs.push({ a: i, b: j, seeds: seedsOf(i, j) });
  const pts = await run(decks, jobs);
  const got = decks.map(() => 0), n = decks.map(() => 0);
  jobs.forEach((j, x) => {
    const per = 2 * j.seeds.length;
    got[j.a] += pts[x];
    got[j.b] += per - pts[x];
    n[j.a] += per;
    n[j.b] += per;
  });
  return got.map((p, i) => rate(p, n[i]));
}

/** The member of median strength: ranked weakest first (ties: the lower index first), the lower median. */
export function medianIndex(strength: readonly number[]): number {
  const order = strength.map((s, i) => ({ s, i })).sort((a, b) => a.s - b.s || a.i - b.i);
  return order[Math.floor((order.length - 1) / 2)].i;
}

export interface ParDeck { hero: HeroId; day: number; index: number; seed: number; build: Build; strength: number[] }

/** The par deck of (hero, day): the field member of median strength against the field (PAR_SEEDS per pairing). */
export async function parDeck(hero: HeroId, day: number, run: Runner, k = PAR_K, seeds = PAR_SEEDS, player: PlayerOpts = {}): Promise<ParDeck> {
  const field = parField(hero, day, k, player);
  const strength = await roundRobin(field, (i, j) => Array.from({ length: seeds }, (_, s) => hashSeed("par-field", hero, day, i, j, s)), run);
  const index = medianIndex(strength);
  return { hero, day, index, seed: parSeeds(k)[index], build: field[index], strength };
}

/** One deck's result against one hero's par: its win rate over every member, and the members' own rates. */
export interface VsPar { rate: number; battles: number; pts: number; members: number[] }

export interface VsParOpts {
  source?: ParSource;
  seeds?: number; // seeds per member (both sides): PAR_SEEDS
  k?: number; // field size: PAR_K
  key?: string; // separates the seed streams of different checks
  player?: PlayerOpts; // the par player's options (bench sweeps)
}

/**
 * Win rates of `decks` against the par of each hero in `heroes` on `day` (parRefs, `seeds` per member, both sides):
 * out[d][hero]. `key` separates the seed streams of different checks; the seeds of deck d against member m of hero h
 * are hashSeed(key, day, d, h, m, s), so the result doesn't depend on how the work is split.
 */
export async function vsPar(decks: Build[], heroes: readonly HeroId[], day: number, run: Runner, o: VsParOpts = {}): Promise<Record<string, VsPar>[]> {
  const seeds = o.seeds ?? PAR_SEEDS, key = o.key ?? "par-vs";
  const refs = heroes.map((h) => parRefs(h, day, o.source ?? "field", o.k ?? PAR_K, o.player));
  const field: Build[] = [...decks, ...refs.flat()];
  const at: number[] = [];
  let off = decks.length;
  for (const r of refs) { at.push(off); off += r.length; }
  const jobs: Job[] = [];
  decks.forEach((_, d) => heroes.forEach((h, hi) => refs[hi].forEach((_, m) => {
    jobs.push({ a: d, b: at[hi] + m, seeds: Array.from({ length: seeds }, (_, s) => hashSeed(key, day, d, h, m, s)) });
  })));
  const pts = await run(field, jobs);
  const out: Record<string, VsPar>[] = decks.map(() => ({}));
  let x = 0;
  decks.forEach((_, d) => heroes.forEach((h, hi) => {
    const members: number[] = [];
    let sum = 0;
    for (let m = 0; m < refs[hi].length; m++) {
      sum += pts[x];
      members.push(rate(pts[x++], 2 * seeds));
    }
    out[d][h] = { rate: members.reduce((s, v) => s + v, 0) / members.length, battles: members.length * 2 * seeds, pts: sum, members };
  }));
  return out;
}
