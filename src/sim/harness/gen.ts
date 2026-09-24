// Balance harness: random legal, honestly priced builds. randomBuild(hero, day, rng) starts
// from the hero's starting deck and spends up to maxGoldByDay(day) on the real shop levers
// (levers.ts), drawn at random with per-build lever weights, so a population spans
// plating-heavy to gate-heavy decks. Every output passes validateBuild(build, day); the same
// Rng state gives the same build. fullPurseBuild adds a spend floor for the stand-in pool.

import { Rng, hashSeed } from "../../core/rng";
import { rarityWeights, type HeroId } from "../content";
import type { Build } from "../deck";
import { buildCost, maxGoldByDay } from "../../net/validate";
import { FUSE_MAX } from "../stars";
import { heroStartBuild } from "./heroes";
import { LEVERS, applyLever, canApply, normalize, type Lever } from "./levers";
import { CRATE, CRATE_BELT, PLATE, PLATE_HULL, Shopper, type Stars } from "./shopper";

export { LEVERS, type Lever };
export { MAX_ROUTE_EDITS, MAX_TILES, type Stars } from "./shopper";

/** v1 levers: each build skips each of them outright with this chance (weight 0). */
const V1_LEVERS: ReadonlySet<Lever> = new Set<Lever>(["sync", "order", "drop"]);
export const V1_SKIP = 0.3;

/**
 * Random lever weights for one build (its "personality"). `stars` off must draw exactly the v1
 * RNG stream: "merge" (v2-only) gets weight 0 with no RNG consumed at all, so every other
 * lever's chance()/next() draws, in order, are untouched and `open` in spend() below never
 * contains "merge" — bf779de's builds reproduce byte for byte for a fixed seed set.
 */
function personality(rng: Rng, stars: boolean): Record<Lever, number> {
  const w = {} as Record<Lever, number>;
  for (const l of LEVERS) {
    if (l === "merge") {
      w[l] = stars ? 0.1 + rng.next() : 0;
      continue;
    }
    w[l] = V1_LEVERS.has(l) && rng.chance(V1_SKIP) ? 0 : 0.1 + rng.next();
  }
  return w;
}

function spend(s: Shopper, rng: Rng): void {
  const w = personality(rng, s.stars);
  for (let fails = 0, steps = 0; fails < 12 && steps < 400; steps++) {
    const open = LEVERS.filter((l) => w[l] > 0 && canApply(s, l));
    if (!open.length) break;
    const ok = applyLever(s, rng.weighted(open, (x) => w[x]));
    if (ok) normalize(s);
    fails = ok ? 0 : fails + 1;
  }
}

/**
 * A random legal build for `hero` on `day` (1-10) that costs at most maxGoldByDay(day).
 * `stars`: "on" is merge-aware; "off" reproduces v1 exactly, RNG draw for RNG draw. Defaults to
 * "off" here (see Shopper's constructor note) so every pre-existing 3-arg call site — including
 * the protected tests/harness.*.test.ts — is untouched; tournament.ts's DEFAULT_OPTS.stars and
 * the CLIs' --stars flag default to "on", which is the harness's actual product-level default.
 */
export function randomBuild(hero: HeroId, day: number, rng: Rng, stars: Stars = "off", maxStars: number = FUSE_MAX): Build {
  const b = heroStartBuild(hero, 1);
  spend(new Shopper(b, maxGoldByDay(day), day, rng, stars, maxStars), rng);
  return b;
}

/** The stand-in pool's spend floor: 90% of the day's gold, rounded up. */
export const spendFloor = (day: number): number => Math.ceil(0.9 * maxGoldByDay(day));

/**
 * Spend what randomBuild left (under 5 gold, since plating is always on offer): plating while
 * 5 or more remains, then a 3 g gate on a free belt tile (useful) unless that strands gold the
 * floor needs, then belt crates (2 g each). Never exceeds the day's gold.
 */
export function topUp(b: Build, day: number, rng: Rng, floor = spendFloor(day), stars: Stars = "off", maxStars: number = FUSE_MAX): void {
  const s = new Shopper(b, maxGoldByDay(day), day, rng, stars, maxStars);
  const slack = s.budget - floor; // gold the build may leave unspent
  while (s.left() >= PLATE.price) b.hullBonus += PLATE_HULL;
  const w = rarityWeights(day);
  const cheap = s.gates.filter((d) => d.price === 3 && w[d.rarity] > 0 && s.canGain(d.id));
  const cells = s.freeRouteCells();
  const left = s.left();
  if (left >= 3 && cheap.length && cells.length && (left - 3 <= slack || left - 3 >= CRATE.price)) {
    s.placeGate(rng.pick(cheap).id, rng.pick(cells));
    normalize(s);
  }
  while (s.left() >= CRATE.price) b.beltCap += CRATE_BELT;
}

export interface FullPurse { build: Build; cost: number; tries: number; floorMet: boolean }

/**
 * A random legal build that spends at least `floor` gold: draw, top up, keep it if it clears the
 * floor, else redraw (sub-seeds of `seed`). After `maxTries` it returns the highest-spend draw
 * with floorMet = false, so a caller can record the shortfall instead of hiding it.
 */
export function fullPurseBuild(hero: HeroId, day: number, seed: number, floor = spendFloor(day), maxTries = 60, stars: Stars = "off", maxStars: number = FUSE_MAX): FullPurse {
  let best: FullPurse | null = null;
  for (let t = 0; t < maxTries; t++) {
    const rng = new Rng(hashSeed("full-purse", seed, t));
    const b = randomBuild(hero, day, rng, stars, maxStars);
    topUp(b, day, rng, floor, stars, maxStars);
    const cost = buildCost(b).total;
    if (cost >= floor) return { build: b, cost, tries: t + 1, floorMet: true };
    if (!best || cost > best.cost) best = { build: b, cost, tries: t + 1, floorMet: false };
  }
  return { ...best!, tries: maxTries };
}
