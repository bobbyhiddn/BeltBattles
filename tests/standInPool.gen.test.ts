import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util"; // NUM-3: the exceptions' exact pin
import { hashSeed } from "../src/core/rng";
import { simulate } from "../src/sim/battle";
import { ITEMS, POOL_RULES, RULES_VERSION, type HeroId } from "../src/sim/content"; // BUMP-1D: + ITEMS (POOL_NATIVE below)
import { cellsOf, type Build } from "../src/sim/deck"; // BUMP-1D: + cellsOf (POOL_NATIVE below)
import { buildCost, maxGoldByDay, roadCap, validateBuild, validateUpload } from "../src/net/validate"; // S8c: + validateUpload (the player mode), roadCap
import { npcDayRules, roadDropValue } from "../src/sim/npcDay"; // S8c: the budget line is left to the player mode only while NPC_DAY is on
import { poolLoss, poolRaw } from "./beltside.helpers"; // BUMP-1D: POOL_NATIVE is computed below (was imported from here)
import { POOL_LEGACY, POOL_PAR, POOL_PAR_BAND, POOL_PAR_SHORT, POOL_SOURCE } from "./standInPool.helpers";
import { heroRefBuild } from "../src/sim/heroBuilds";
import {
  ROBUST_BAND, ROBUST_MULT, STANDIN_DEFAULTS, STANDIN_MAX_STARS, boughtCost, caravanCand, robustBorderline, robustReplay, standInRefs, type Cand, type StandInOpts,
} from "../src/sim/harness/standins";
import { runeGrants } from "../src/sim/runes"; // FLIP-X2: a stored deck's runes' dawn gold
import { caravanCandidate } from "../src/sim/harness/caravan";
import { localRunner, playJob } from "../src/sim/harness/tournament";
import { STAND_IN_DATA } from "../src/sim/standInPoolData";
import {
  STAND_IN_POOL_DAYS, STAND_IN_POOL_HEROES, STAND_IN_POOL_RULES, decodeStandIn, decodeStarred, encodeStandIn, encodeStarred, standInPar, standInParIndex,
  standInPick, standInPickIndex, standInPool,
} from "../src/sim/standInPool";

// The bundled stand-in pool (0.6.0c dusk stand-ins) and its portable loader. Step 5 M5: the tests hold for pool v2.1
// (full purse; every v2.1 pin while its legacy header is committed) and for a caravan-bound regen pool (decision D4).

const DAYS = Array.from({ length: STAND_IN_POOL_DAYS }, (_, i) => i + 1); // BUMP-1D: was length 10; the regenerated pool holds days 1-16
const floor = (day: number) => Math.ceil(0.9 * maxGoldByDay(day));
const dayData = (hero: HeroId, day: number) => STAND_IN_DATA.pools[hero]![day - 1];
// hero/days that took their best-vsPar builds (relaxation "best"), listed with their vsPar values
const parShort = new Set(STAND_IN_DATA.short.filter((s) => s.vsPar).map((s) => `${s.hero}|${s.day}`));
// BUMP-1D (cap's ruling R2.3 Q2, the footprint check): is the pool native, i.e. does no deck have a rig standing on a belt tile? Judged by the
// rig's FOOTPRINT, as the loader's D3 step (beltside.ts migrateInlineGates) reads it now. tests/beltside.helpers.ts POOL_NATIVE reads the rig's
// ANCHOR cell instead, and the anchor of a shaped rig is the corner of its bounding box, a cell it may not occupy: four stored decks hold an
// ELBOW GUARD at rot 3 whose corner is a belt tile, so that flag reads false for a pool that is native (tests/beltside.shaped.test.ts pins
// both). Computed here, the `if (POOL_NATIVE)` lines below run again. Was: import { POOL_NATIVE } from "./beltside.helpers".
const POOL_NATIVE = STAND_IN_POOL_HEROES.every((hero) => STAND_IN_DATA.pools[hero]!.every((d, di) => d[1].every((_, i) => {
  const b = poolRaw(hero, di + 1, i), belt = new Set(b.routes.flatMap((r) => r.cells));
  return !b.items.some((p) => ITEMS[p.def].kind === "gate" && cellsOf(p).some((k) => belt.has(k)));
})));

/** A's win rate against B over `seeds`, each played from both sides (win 1, draw 0.5). */
function winRate(a: Build, b: Build, seeds: number[]): number {
  let pts = 0;
  for (const s of seeds) {
    const x = simulate(a, b, s).winner, y = simulate(b, a, s).winner;
    pts += (x === 0 ? 1 : x === -1 ? 0.5 : 0) + (y === 1 ? 1 : y === -1 ? 0.5 : 0);
  }
  return pts / (2 * seeds.length);
}

const r4 = (x: number) => Number(x.toFixed(4)); // a stored vsPar (standins.ts dataModuleText)

/** Step 5 M5: the options a step-5 pool was generated with, as far as its par needs them: its header's --par and
 *  --par-band, its data's seed and parFloor, and the CLI's refSeeds (10) and robust multiplier. */
const genOpts = (): StandInOpts => ({
  ...STANDIN_DEFAULTS, seed: STAND_IN_DATA.seed, heroes: [...STAND_IN_POOL_HEROES], parFloor: STAND_IN_DATA.parFloor, par: POOL_PAR, source: POOL_SOURCE,
  ...(POOL_PAR_BAND ? { parBand: [POOL_PAR_BAND[0], POOL_PAR_BAND[1]] as [number, number] } : {}),
});

/** Step 5 M5: the fixed spread of hero-days whose par a caravan pool's test re-simulates exactly: a par with a robust
 *  re-play is 2,400 battles (with --par-band 0.5,0.6 nearly every pick has one), 20-60 s here depending on the load, so
 *  all twenty would take ten minutes and more. */
const PAR_SPREAD: readonly (readonly [HeroId, number])[] = [["furnace", 2], ["weaver", 4], ["furnace", 7], ["weaver", 9]];

/**
 * Step 5 M5: the par of (hero, day) re-simulated exactly as genStandIns (src/sim/harness/standins.ts) computed its
 * stored vsPar: against the par of every pool hero (standInRefs: par.ts parRefs of the header's --par, the par field of
 * 12 decks per hero), refSeeds seeds x both sides per member on the generator's seeds hashSeed("standin-ref", seed,
 * hero, day, r, k); each hero's rate over its members, vsPar = the lowest. A sample at most ROBUST_BAND above parFloor
 * (robustBorderline) was re-played once by robustReplay, run here as it is, on seeds that name the candidate's
 * population index. The data module doesn't store that index: it is the caravan candidate below the day's population
 * size whose code is the par's and whose re-play gives the stored value (NaN: none does). NUM-1 (cap's oracle
 * 03f2cc3c1884e806): the par's code in this build's units, and the closest re-play to the stored value (PAR_TOLERANCE).
 */
async function parVsPar(hero: HeroId, day: number): Promise<{ vsPar: number; sample: number; idx?: number }> {
  const o = genOpts(), { refs, refHero } = standInRefs(o, day);
  const [parIndex, entries, , popSize] = dayData(hero, day);
  // NUM-1 (cap's oracle 03f2cc3c1884e806) brought the pre-NUM-1 stored code into this build's units (hull x10) here.
  // FLIP-X2 step 4.5: the pool is regenerated in native N1 units (BUNDLED_POOL_HULL_SCALE deleted), so the code as stored
  const raw = poolRaw(hero, day, parIndex), code = encodeStarred(raw);
  const stored = entries[parIndex][4], build = standInPar(hero, day);
  // BUMP-1E: + `day` on the Job, as every job of the generator carries it (standins.ts: "HULL-1a: the day"): the day's hull (HULL_SCALE) and, with the scaling rules on, the par
  // run model's counts for the day (tournament.ts jobCounts), which a TROPHY CHAIN or a GRUDGE ROD in the par reads. Without it the pairings were another world's (see S8_PAR_EXCEPTIONS)
  const pts = refs.map((ref, r) => playJob([build, ref], { a: 0, b: 1, seeds: Array.from({ length: o.refSeeds }, (_, k) => hashSeed("standin-ref", o.seed, hero, day, r, k)), day }));
  const vsRef: Partial<Record<HeroId, number>> = {};
  o.heroes.forEach((h, hi) => {
    let sum = 0, m = 0;
    refs.forEach((_, r) => { if (refHero[r] === hi) { sum += pts[r]; m++; } });
    vsRef[h] = sum / (m * o.refSeeds * 2);
  });
  const sample = Math.min(...o.heroes.map((h) => vsRef[h]!));
  if (!robustBorderline({ vsPar: sample } as Cand, o)) return { vsPar: sample, sample };
  // NUM-1 (oracle 03f2cc3c1884e806): every candidate whose code is the par's is re-played; the closest re-play to the
  // stored value is the par's (the caller holds it to PAR_TOLERANCE); NaN: no candidate's code is the par's
  let best: { vsPar: number; sample: number; idx?: number } = { vsPar: NaN, sample };
  for (let idx = 0; idx < popSize; idx++) {
    if (caravanCand(idx, caravanCandidate(hero, day, o.seed, idx, STANDIN_MAX_STARS)).code !== code) continue;
    const c = { idx, build, vsRef: { ...vsRef }, vsPar: sample } as Cand;
    await robustReplay(o, hero, day, [c], refs, localRunner, refHero);
    if (Number.isNaN(best.vsPar) || Math.abs(c.vsPar - stored) < Math.abs(best.vsPar - stored)) best = { vsPar: c.vsPar, sample, idx };
  }
  return best;
}

/**
 * NUM-1 (REQ-BFG-047, cap's oracle 03f2cc3c1884e806): the stored vsPar values were measured on bb-0.8.6 in pre-NUM-1
 * units; this build's integer damage pipeline flips about 1% of close battles, so a par re-simulated here passes when
 * |re-simulated - stored| <= PAR_TOLERANCE (the brief's 2% target, applied per par; the robust re-play's candidate match
 * uses the same 0.02, the closest re-play taken). The tolerance holds until R6 regenerates the pool, and then R6
 * restores the exact toBe(stored). Don't widen it: a par that misses stays red.
 */
// FLIP-X2 step 6 (the brief; NUM2-REPORT section 12, NUM3-REPORT section 7): the pool is regenerated on this build (bb-0.9.0),
// so the exact check is restored (the re-simulated par equals its stored vsPar; was NUM-1's PAR_TOLERANCE 0.02), and
// NUM-2's NUM2_PAR_EXCEPTIONS (weaver d4), NUM-3's NUM3_PAR_EXCEPTIONS (furnace d2, weaver d4) and their tripwire are gone.
const PAR_TOLERANCE = 0;

/**
 * S8c (the pools: the stand-in pool regenerated once with every switch on as shipped, P1 83c039d, NPC_DAY on): three of the
 * spread's four pars re-simulate here past PAR_TOLERANCE against the par field (furnace d2 re-simulates exactly). Each is
 * pinned exactly, as NUM-3 pinned its exceptions, under this rules version only (the tripwire): old (its stored vsPar, which
 * the exact check expected) -> new (re-simulated).
 */
// BUMP-1D: the pool is regenerated on this build (bb-0.11.0, days 1-16) and the same three hero-days re-simulate past the tolerance
// again (furnace d2 exactly), so each exception is re-measured and pinned exactly as S8c did. Measured (this build, the new pool):
// old (stored, re-simulated) -> new: weaver d4 (0.5733, 0.6583) -> (0.5758, 0.6167); furnace d7 (0.5433, 0.5692) -> (0.5558, 0.6333);
// weaver d9 (0.555, 0.6067) -> (0.5167, 0.4792: now under the 0.5 floor, a re-simulation the pool's stored 0.5167 doesn't reproduce).
// BUMP-1E (the regenerated pool, R1 19ae423, bb-0.12.0): the exceptions are GONE. The three of BUMP-1D (below: weaver d4 stored 0.5758 / re-simulated 0.6167, furnace d7
// 0.5558 / 0.6333, weaver d9 0.5167 / 0.4792) and S8c's before them were this test's own world, not the pool's: parVsPar played its pairings without the Job's `day`, which every
// job of the generator carries (standins.ts: `day` on each Job, "HULL-1a: the day"): the day's hull with HULL_SCALE on and, with the scaling rules on, the par run model's counts for the
// day (tournament.ts jobCounts: the wins and hearts lost that a TROPHY CHAIN and a GRUDGE ROD read). Played with the day, as the generator plays them, all four pars of the spread
// re-simulate EXACTLY on the regenerated pool (measured: furnace d2 0.5183, weaver d4 0.5842, furnace d7 0.55, weaver d9 0.5783, each equal to its stored vsPar, difference 0; the same
// pars played without the day read 0.52, 0.4542, 0.5383 and 0.3833): the committed pool is what the generator makes, and the check is as strict as it was meant to be (PAR_TOLERANCE 0).
const S8_PAR_EXCEPTIONS: Record<string, { stored: number; resim: number }> = {}; // BUMP-1E: was weaver|4, furnace|7 and weaver|9 (see above)
/** BUMP-1E (the regenerated pool, bb-0.12.0): the stored picks whose deck holds MORE than their gold spent and their road's drops (the run books a NEGATIVE sale loss: player.ts parNpcDay),
 *  hero|day|position -> the gain in gold: spent + drops + gain = cost exactly. One pick of 192, the loose run of seed 1003 (furnace #3); replayed in "the one sale-gain pick" below. */
// BUMP-1F (F5: parNpcDay never books a negative sale loss, player.ts; RULING-BUMP1F-R5 R5.2 (2); the stand-in pool regenerated under bb-0.13.0): the exception is GONE. The loose run of seed 1003 (candidate #3 at day 4) books a sale
// loss of 0 now (was -6), so no stored pick holds more than its gold spent and its road's drops (measured off the committed pool: all 192 picks have spent + drops >= cost, none under-covered); furnace d4 #2 is another deck
// (cost 48, spent 45, drops 11). Was { "furnace|4|2": 6 }. S8_PAR_EXCEPTIONS stays empty (the four pars of the spread re-simulate exactly on the regenerated pool: the caravanPars tests below are green unchanged)
const SALE_GAIN: Record<string, number> = {};

/** The rules version the exceptions were measured under (the tripwire: red at the next bump). BUMP-1D: was "bb-0.10.0". */
const S8_EXCEPTIONS_RULES = "bb-0.12.0"; // BUMP-1E: no exception is listed now; a later one is measured under this version (was "bb-0.11.0")

/** Step 5 M5: test 2 for a caravan pool: the spread's pars re-simulated exactly, and every par at least parFloor and
 *  inside the header's --par-band, unless its hero/day is listed short. */
async function caravanPars(): Promise<void> {
  expect(POOL_SOURCE, "a step-5 pool's par is re-simulated through its caravan candidates").toBe("caravan");
  const lines: string[] = [], over: string[] = [];
  for (const [hero, day] of PAR_SPREAD) {
    const t0 = performance.now(), stored = standInPool(hero, day)[standInParIndex(hero, day)].vsPar, r = await parVsPar(hero, day);
    const diff = r4(r4(r.vsPar) - stored); // NUM-1 (oracle 03f2cc3c1884e806): stored, re-simulated and their difference, per par
    lines.push(`${hero} d${day}: stored ${stored}, re-simulated ${r4(r.vsPar)}, difference ${diff} (10-seed sample ${r4(r.sample)}${r.idx === undefined ? "" : `, robust re-play of candidate #${r.idx}`}; ${((performance.now() - t0) / 1000).toFixed(1)} s)`);
    console.log(`stand-in par ${hero} d${day}: stored ${stored}, re-simulated ${r4(r.vsPar)}, difference ${diff}`);
    // S8c (the pools): a listed par is pinned exactly (stored and re-simulated), under this rules version only
    const ex = S8_PAR_EXCEPTIONS[`${hero}|${day}`];
    if (ex) {
      expect(RULES_VERSION, "S8c tripwire: a rules bump with the pools' par exceptions left").toBe(S8_EXCEPTIONS_RULES);
      if (!isDeepStrictEqual([stored, r4(r.vsPar)], [ex.stored, ex.resim])) over.push(`${hero} d${day}: exception ${JSON.stringify(ex)}, now stored ${stored}, re-simulated ${r4(r.vsPar)}`);
      continue;
    }
    // NUM-3: every par past the tolerance listed before one assertion (the loop stopped at the first and hid the rest)
    if (Math.abs(diff) > PAR_TOLERANCE) over.push(`${hero} d${day}: its stored vsPar ${stored}, re-simulated against the par field ${r4(r.vsPar)}: difference ${diff}, past ${PAR_TOLERANCE}`);
  }
  expect(over, over.join("\n")).toEqual([]);
  for (const hero of STAND_IN_POOL_HEROES) {
    for (const day of DAYS) {
      if (POOL_PAR_SHORT.has(`${hero}|${day}`)) continue;
      const vsPar = standInPool(hero, day)[standInParIndex(hero, day)].vsPar;
      expect(vsPar, `${hero} d${day}`).toBeGreaterThanOrEqual(STAND_IN_DATA.parFloor);
      if (POOL_PAR_BAND) expect(vsPar >= POOL_PAR_BAND[0] && vsPar <= POOL_PAR_BAND[1], `${hero} d${day}: par vsPar ${vsPar} outside --par-band ${POOL_PAR_BAND.join(",")}`).toBe(true);
    }
  }
  console.log(`stand-in par vsPar re-simulated (--par ${POOL_PAR}${POOL_PAR_BAND ? ` --par-band ${POOL_PAR_BAND.join(",")}` : ""}):\n${lines.join("\n")}`);
}

describe("stand-in pool", () => {
  it("covers FURNACE and WEAVER with 6 entries per day, days 1-16, under this build's pool rules (content.ts POOL_RULES: RULES_VERSION, or the rules it carries the pool from)", () => {
    // BUMP-1D: title and days were 1-10: the pool is regenerated to days 1-16 (STAND_IN_POOL_DAYS), under bb-0.11.0 (192 entries)
    expect(STAND_IN_POOL_HEROES).toEqual(["furnace", "weaver"]);
    expect(STAND_IN_POOL_DAYS).toBe(16);
    expect(DAYS).toHaveLength(16);
    for (const hero of STAND_IN_POOL_HEROES) expect(STAND_IN_DATA.pools[hero]!, hero).toHaveLength(16);
    expect(STAND_IN_DATA.rules).toBe("bb-0.14.0"); // BUMP-1G (label bb-0.13.0 -> bb-0.14.0, the stand-in module's rules): was bb-0.13.0. BUMP-1F (the regenerated pool under bb-0.13.0, src/sim/standInPoolData.ts: header 'RULES_VERSION bb-0.13.0'; RULING-BUMP1F-R5 R5.2 (2)): was "bb-0.12.0". BUMP-1E (the regenerated pool, R1 19ae423: header 'RULES_VERSION bb-0.12.0'): was "bb-0.11.0"
    expect(STAND_IN_POOL_RULES).toBe(POOL_RULES);
    expect(STAND_IN_DATA.band).toEqual([40, 60]);
    expect(STAND_IN_DATA.parFloor).toBe(0.5);
    for (const hero of STAND_IN_POOL_HEROES) for (const day of DAYS) expect(standInPool(hero, day), `${hero} d${day}`).toHaveLength(6);
  });

  // 0.6.2 BELTSIDE: the pool was generated with gates on belt tiles; decodeStandIn migrates each deck (D3),
  // which drops a rig with no free cell beside its tile. So the stored cost and the 90% floor hold for the
  // deck as generated, and the loaded deck costs exactly that minus what D3 dropped (nothing once native).
  // Step 5 M5 (decision D2, honesty is gold spent): the 90% floor applies to the gold spent (a caravan pool's stored
  // sixth element; pool v2.1's is its cost), and the deck's value, the stored cost, is at most maxGoldByDay.
  it("every entry is legal for its day, the right hero, priced at buildCost, and meets the 90% floor (as generated)", () => {
    const short = new Set(STAND_IN_DATA.short.filter((s) => !s.vsPar).map((s) => `${s.hero}|${s.day}|${s.cost}`));
    for (const hero of STAND_IN_POOL_HEROES) {
      for (const day of DAYS) {
        for (const [i, e] of standInPool(hero, day).entries()) {
          // S8c (RULING-S8-R5 section 3 item 1 (T1e's form, RULING-S8-R1 item 3); cause a48010b: with NPC_DAY on, a road-fed deck
          // spends the road's drops too, by design): the pool was regenerated once with every switch on (P1 83c039d), so a deck
          // may hold the road's gold and drops, which the strict mode's budget line (the shop's gold alone) doesn't count; its
          // drops count through its road log (its tuple's seventh element, StandInEntry.road), in the player mode. So each entry
          // is held to validateBuild's lines minus at most its ONE budget line (matched by its "budget: " prefix, and only while
          // NPC_DAY is on: off, the strict check stays whole) AND to validateUpload in the player mode with its road log (a
          // stand-in carries no run seed). Was: validateBuild(e.build, day).errors toEqual [] whole.
          const strict = validateBuild(e.build, day).errors;
          const budget = npcDayRules() ? strict.filter((x) => x.startsWith("budget: ")) : [];
          expect(budget.length, `${hero} d${day} #${i}: at most its one budget line`).toBeLessThanOrEqual(1);
          expect(strict.filter((x) => !budget.includes(x)), `${hero} d${day} #${i}: every other strict line`).toEqual([]);
          const road = npcDayRules() ? e.road : undefined; // as tools/samplePool.ts roadOf: NPC_DAY on only
          const up = validateUpload(e.build, day, RULES_VERSION, road ? { road } : {});
          expect(up.errors, `${hero} d${day} #${i}: the player mode with its road log`).toEqual([]);
          expect(e.hero).toBe(hero);
          expect(e.build.hero).toBe(hero);
          expect(e.day).toBe(day);
          // NUM-1 (cap's oracle bcc36c430b4f3a01) priced the pre-NUM-1 stored deck x10. FLIP-X2 (steps 4.1 and 4.5): the pool
          // is native N1 and its decks hold their runes, so the stored cost is the stored deck as bought (standins.ts
          // boughtCost: the runes' HULL and BELT out), against the day's gold plus its runes' dawn gold (writtenProblems)
          const raw = poolRaw(hero, day, i);
          expect(e.cost).toBe(boughtCost(raw));
          expect(boughtCost(e.build), `${hero} d${day} #${i}`).toBe(e.cost - poolLoss(hero, day, i));
          if (POOL_NATIVE) expect(poolLoss(hero, day, i)).toBe(0);
          // S8c (RULING-S8-R5 section 3 item 1, T1e's form; cause a48010b: with NPC_DAY on, a road-fed deck spends the road's
          // drops too, by design): the deck's value against the shop's gold alone (+ its runes' gold) is the strict budget line
          // restated (furnace d1 #0: 11 of 8). With NPC_DAY on it is left, as that line is, to the player mode above, which counts
          // the road's gold and drops through its road log (the generator's own bound adds them too: standins.ts writtenProblems,
          // PAR-AZ); off, it stays whole. Was: the bound whole.
          if (!npcDayRules()) expect(e.cost, `${hero} d${day} #${i}: the deck's value`).toBeLessThanOrEqual(maxGoldByDay(day) + runeGrants(e.build.runes, day).gold);
          expect(e.build.runes?.length, `${hero} d${day} #${i}: one rune a dawn`).toBe(day); // FLIP-X2: the content guarantee
          // S8c (the same cause, a48010b): a road-fed deck holds the road's drops, which its run didn't buy (furnace d1 #0: spent 8
          // of its 11), so with NPC_DAY on its gold spent and its road log's drops, at the value the upload budget counts them
          // (npcDay.ts roadDropValue), cover the deck; off (no road log), exactly as before. Was: e.spent >= e.cost.
          const drops = npcDayRules() ? roadDropValue(e.road) : 0;
          // BUMP-1E (the regenerated pool, R1 19ae423): ONE stored pick holds 6 more than its gold spent and its road's drops cover (furnace d4 #2: cost 71, spent 48, drops 17): its
          // run (the loose run of seed 1003, candidate #3) books a negative sale loss, -6 from day 4 on (player.ts parNpcDay; replayed and pinned in the test below). Pinned EXACTLY
          // (spent + drops + the gain = cost), every other pick keeps the line as it was. Was: spent + drops >= cost for all 192, no exception.
          const saleGain = SALE_GAIN[`${hero}|${day}|${i}`] ?? 0;
          if (saleGain) expect(e.spent + drops + saleGain, `${hero} d${day} #${i}: its sale gain makes it exact`).toBe(e.cost);
          expect(e.spent + drops + saleGain, `${hero} d${day} #${i}: gold spent (+ its road's drops) covers the deck`).toBeGreaterThanOrEqual(e.cost);
          // FLIP-X2: the caravan run took a rune each dawn, and its gold spent includes the gold its runes paid (COIN PURSE,
          // FAT PURSE, RUNE TITHE ...), so the bound is the day's gold plus its runes' dawn gold (was maxGoldByDay(day);
          // furnace d5 #0 spent 54 of 50 + its runes' gold)
          // S8c (the same cause, a48010b): a road-fed run also spends the road's gold (furnace d2 #0: spent 20 of 17), so with
          // NPC_DAY on the bound adds roadCap(day), the most any honest run's road adds by that dusk, as the player mode's budget
          // does (maxGoldByDay + roadCap); off, exactly as before. Was: maxGoldByDay(day) + its runes' dawn gold.
          expect(e.spent, `${hero} d${day} #${i}: gold spent`).toBeLessThanOrEqual(maxGoldByDay(day) + (npcDayRules() ? roadCap(day) : 0) + runeGrants(e.build.runes, day).gold);
          if (POOL_LEGACY) expect(e.spent).toBe(e.cost); // pool v2.1: full purse, its gold spent is its cost
          if (!short.has(`${hero}|${day}|${e.cost}`)) {
            expect(e.spent, `${hero} d${day} #${i}: gold spent`).toBeGreaterThanOrEqual(floor(day));
            if (POOL_LEGACY) expect(e.cost, `${hero} d${day}`).toBeGreaterThanOrEqual(floor(day));
          }
          expect(e.pct).toBeGreaterThanOrEqual(0);
          expect(e.pct).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  // BUMP-1E: the replay of SALE_GAIN's one pick: furnace d4 #2 is candidate #3's day-4 deck, the loose run of seed 1003, and that run's meta books the gain (a sale loss of -6) to the gold
  // BUMP-1F (F5: parNpcDay never books a negative sale loss; RULING-BUMP1F-R5 R5.2 (2)): the title was "the one sale-gain pick: furnace d4 #2 is the loose run of seed 1003 (candidate #3 at day 4), whose meta books a sale loss of -6
  // (spent 48 + drops 17 + 6 = its cost 71)". The replay of that run is kept: it books a sale loss of 0 now (its day-4 deck is worth 65, not 71, and is no longer the stored pick), and SALE_GAIN is empty
  // BUMP-1G (R1: the stand-in pool regenerated under bb-0.14.0, src/sim/standInPoolData.ts): furnace d4 #2 is another deck again: cost 54, spent 49 + drops 15 (was cost 48, spent 45 + drops 11, which the title said); the loose run of seed 1003 (candidate #3 at day 4) still books a sale loss of 0 and is still not the stored pick
  it("the former sale-gain pick (BUMP-1F F5): the loose run of seed 1003 (candidate #3 at day 4) books no negative sale loss now (0, was -6), and furnace d4 #2 is another deck (cost 54, spent 49 + drops 15)", () => {
    const e = standInPool("furnace", 4)[2], d = caravanCandidate("furnace", 4, STAND_IN_DATA.seed, 3, STANDIN_MAX_STARS);
    expect(caravanCand(3, d).code).not.toBe(encodeStarred(poolRaw("furnace", 4, 2))); // BUMP-1F: the stored pick is no longer this run's day-4 deck (was toBe: it IS)
    expect([d.meta.policy, d.meta.seed]).toEqual(["loose", 1003]);
    expect([e.cost, e.spent, roadDropValue(e.road)]).toEqual([54, 49, 15]); // BUMP-1G: was [48, 45, 11] (R1: the stand-in pool regenerated under bb-0.14.0, furnace d4 #2 is another deck again). BUMP-1F: measured off the committed pool (was [71, 48, 17])
    expect([d.value, d.meta.spent, d.meta.soldLoss]).toEqual([65, 48, 0]); // BUMP-1F: measured (was [71, 48, -6]); F5: never a negative sale loss
    expect(SALE_GAIN).toEqual({}); // BUMP-1F: was { "furnace|4|2": -d.meta.soldLoss }
  }, 120_000);

  it("entries are sorted by pct and lie inside their window, which starts at 40 or above and is 20 points wide unless widened", () => {
    for (const hero of STAND_IN_POOL_HEROES) {
      for (const day of DAYS) {
        const p = standInPool(hero, day).map((e) => e.pct);
        const [, , [lo, hi], n, relax] = dayData(hero, day);
        expect(p).toEqual([...p].sort((a, b) => a - b));
        expect(lo, `${hero} d${day}`).toBeGreaterThanOrEqual(STAND_IN_DATA.band[0]);
        for (const x of p) expect(x >= lo && x <= hi, `${hero} d${day} pct ${x} outside ${lo}-${hi}`).toBe(true);
        if (relax === "none") expect(hi, `${hero} d${day}`).toBe(Math.min(100, Math.round((lo + 20) * 10) / 10));
        if (relax === "widen") expect(hi - lo, `${hero} d${day}`).toBeGreaterThan(20);
        expect(n, `${hero} d${day}`).toBe(relax === "none" || relax === "widen" ? STAND_IN_DATA.pop : n);
        expect([64, 128, 256]).toContain(n);
        if (lo === 40 && hi === 60) for (const x of p) expect(x >= 40 && x <= 60).toBe(true); // the old band, unmoved
      }
    }
  });

  it("days outside 1-16 clamp; a hero not in the pool gets [] and a clear error from pick and par", () => {
    // BUMP-1D: was "outside 1-10" and weaver 14 -> weaver 10: the pool holds days 1-16 now, so day 14 is its own day and the clamp is at 16
    expect(standInPool("furnace", 0)).toEqual(standInPool("furnace", 1));
    expect(standInPool("weaver", 17)).toEqual(standInPool("weaver", 16));
    expect(standInPool("furnace", 99)).toEqual(standInPool("furnace", 16));
    expect(standInPool("weaver", 14)).not.toEqual(standInPool("weaver", 10));
    expect(standInPool("weaver", 14).map((e) => e.day)).toEqual([14, 14, 14, 14, 14, 14]); // day 14 is stored, not a clamp of another day
    expect(standInPool("furnace", 99).map((e) => e.day)).toEqual([16, 16, 16, 16, 16, 16]);
    expect(standInPool("weaver", NaN)).toEqual(standInPool("weaver", 1));
    expect(standInPool("siphon", 3)).toEqual([]);
    expect(() => standInPick("foundry", 3, 1)).toThrow(/no stand-in decks for hero "foundry"/);
    expect(() => standInPar("metronome", 3)).toThrow(/no stand-in decks for hero "metronome"/);
  });

  it("standInPick is deterministic, reaches several entries across seeds, and returns fresh copies", () => {
    for (const hero of STAND_IN_POOL_HEROES) {
      for (const day of [1, 5, 10, 16]) { // BUMP-1D: + 16 (the pool's deepest day now)
        const seen = new Set<number>();
        for (let seed = 0; seed < 60; seed++) {
          const i = standInPickIndex(hero, day, seed);
          seen.add(i);
          expect(standInPick(hero, day, seed)).toEqual(standInPool(hero, day)[i].build);
          expect(standInPick(hero, day, seed)).toEqual(standInPick(hero, day, seed));
        }
        expect(seen.size, `${hero} d${day}`).toBeGreaterThanOrEqual(4);
      }
    }
    const a = standInPick("furnace", 3, 7), before = JSON.stringify(standInPool("furnace", 3));
    a.items.push({ uid: 999, def: "temper", x: 0, y: 9 });
    a.hullBonus += 500;
    standInPool("furnace", 3)[0].build.routes.length = 0;
    standInPar("furnace", 3).mods.push({ uid: 998, def: "chamber", turret: 0 });
    expect(JSON.stringify(standInPool("furnace", 3))).toBe(before);
    expect(standInPick("furnace", 3, 7)).not.toBe(standInPick("furnace", 3, 7));
  });

  it("standInPar is the stored par index: the entry nearest the middle of its window (pct 50 for the old band)", () => {
    for (const hero of STAND_IN_POOL_HEROES) {
      for (const day of DAYS) {
        const pool = standInPool(hero, day), par = standInParIndex(hero, day);
        const [stored, , [lo, hi]] = dayData(hero, day);
        const mid = (lo + hi) / 2, dist = pool.map((e) => Math.abs(e.pct - mid));
        expect(par, `${hero} d${day}`).toBe(stored);
        expect(par, `${hero} d${day}`).toBe(dist.indexOf(Math.min(...dist))); // the first on a tie
        expect(standInPar(hero, day)).toEqual(pool[par].build);
        if (lo === 40 && hi === 60) expect(Math.abs(pool[par].pct - 50)).toBe(Math.min(...pool.map((e) => Math.abs(e.pct - 50))));
      }
    }
  });

  it("every entry wins at least half its battles against both par decks (vsPar >= 0.5), unless its hero/day is listed in short", () => {
    for (const s of STAND_IN_DATA.short.filter((x) => x.vsPar)) {
      expect(s.vsPar, `${s.hero} d${s.day}`).toEqual(standInPool(s.hero, s.day).map((e) => e.vsPar));
    }
    for (const hero of STAND_IN_POOL_HEROES) {
      for (const day of DAYS) {
        for (const e of standInPool(hero, day)) {
          expect(e.vsPar).toBeLessThanOrEqual(1);
          if (!parShort.has(`${hero}|${day}`)) expect(e.vsPar, `${hero} d${day} pct ${e.pct}`).toBeGreaterThanOrEqual(0.5);
        }
      }
    }
  });

  // 0.6.2 BELTSIDE: the stored vsPar was measured under the inline rules against the inline par decks. Until the
  // harness re-bakes the pool natively (D4, POOL_NATIVE), the re-simulation measures the BELTSIDE drift and
  // prints it (REPORT.md) instead of asserting the stored value.
  // Step 5 M5 (decision D4): pool v2.1 (the legacy header: full purse against heroRefBuild) is checked exactly as before.
  // A caravan pool's par is measured against the par field: caravanPars re-simulates a fixed spread of hero-days exactly
  // as the generator did (robust re-play included) and holds every par to parFloor and the header's --par-band.
  // NUM-1 (REQ-BFG-047, cap's oracle 03f2cc3c1884e806): the stored vsPar values were measured on bb-0.8.6 in pre-NUM-1
  // units, so each spread par holds to |re-simulated - stored| <= PAR_TOLERANCE (0.02) and prints stored, re-simulated
  // and their difference. The tolerance holds until R6 regenerates the pool, and then R6 restores the exact toBe(stored).
  it("each par, re-simulated against its pool's par (pool v2.1: heroRefBuild of both factions; a caravan pool: the par field, a fixed spread of 4 hero-days), 10 seeds x both sides, wins at least 50%: its stored vsPar (strict once the pool is native)", async () => {
    if (!POOL_LEGACY) return caravanPars();
    const drift: string[] = [];
    let reReplayed = 0;
    for (const hero of STAND_IN_POOL_HEROES) {
      for (const day of DAYS) {
        const par = standInPar(hero, day);
        const rates = STAND_IN_POOL_HEROES.map((foe, r) =>
          winRate(par, heroRefBuild(foe, day), Array.from({ length: 10 }, (_, k) => hashSeed("standin-ref", STAND_IN_DATA.seed, hero, day, r, k))));
        const low = Math.min(...rates), stored = standInPool(hero, day)[standInParIndex(hero, day)].vsPar;
        for (const x of rates) expect(x >= 0 && x <= 1, `${hero} d${day}`).toBe(true);
        drift.push(`${hero} d${day}: stored ${stored.toFixed(2)} now ${low.toFixed(2)} (vs ${rates.map((x) => x.toFixed(2)).join(" / ")})`);
        if (!POOL_NATIVE) continue;
        // pool v2.1 (the D4 native re-bake): the stored vsPar is this 10-seed sample, unless the generator's robust re-play
        // (0.6.1a, ARSENAL.md §9.2) took the pick: that happens exactly when the sample cleared the floor by at most
        // ROBUST_BAND, and then the stored value is over all ROBUST_MULT x 10 + 10 seeds x both sides (100 battles per
        // par deck, so a whole number of hundredths). The re-play seeds need the candidate's population index, which the
        // data module doesn't store, so a re-played par is checked by those two consequences, not re-played here.
        if (Math.abs(low - stored) > 1e-6) {
          expect(low, `${hero} d${day}: only a borderline sample is re-played`).toBeGreaterThanOrEqual(STAND_IN_DATA.parFloor - 1e-9);
          expect(low, `${hero} d${day}: only a borderline sample is re-played`).toBeLessThanOrEqual(STAND_IN_DATA.parFloor + ROBUST_BAND + 1e-9);
          expect(Math.abs(stored * 20 * (ROBUST_MULT + 1) - Math.round(stored * 20 * (ROBUST_MULT + 1))), `${hero} d${day} stored ${stored}`).toBeLessThan(1e-6);
          reReplayed++;
        }
        if (!parShort.has(`${hero}|${day}`)) {
          expect(low, `${hero} d${day} vs refs ${rates.join(" / ")}`).toBeGreaterThanOrEqual(0.5);
          expect(stored, `${hero} d${day}`).toBeGreaterThanOrEqual(0.5);
        }
      }
    }
    if (!POOL_NATIVE) console.log(`stand-in par vsPar under BELTSIDE (the pool is inline until the D4 re-bake):\n${drift.join("\n")}`);
    // most pars are stored as their plain 10-seed sample; at 65a36b7 one (WEAVER day 2) was re-played
    else expect(reReplayed, drift.join("\n")).toBeLessThan(STAND_IN_POOL_HEROES.length * DAYS.length);
  }, 1_200_000); // BUMP-1F (RULING-BUMP1F-R13 R13.2; the release lane's finding F19): was 600_000: alone at nice 10 this test took 599,532 ms at 0.9.13's STAGE and timed out at 606,299 ms in a batch

  it("each par against heroRefBuild: a quick battle finishes with no NaN", () => {
    for (const hero of STAND_IN_POOL_HEROES) {
      for (const day of DAYS) {
        for (const foe of STAND_IN_POOL_HEROES) {
          const r = simulate(standInPar(hero, day), heroRefBuild(foe as HeroId, day), 1000 + day);
          expect(Number.isFinite(r.t) && r.t > 0).toBe(true);
          expect([0, 1, -1]).toContain(r.winner);
          for (const s of r.sides) expect(Number.isNaN(s.hull.hp)).toBe(false);
        }
      }
    }
  }, 30_000);

  it("build codes round-trip", () => {
    for (const hero of STAND_IN_POOL_HEROES) {
      for (const day of DAYS) {
        // star-aware since the 0.6.1 flip (pool v2 decks carry merge stars)
        for (const e of standInPool(hero, day)) expect(decodeStarred(hero, encodeStarred(e.build))).toEqual(e.build);
      }
    }
    expect(() => decodeStandIn("furnace", "14 0/kiln6/1:54/")).toThrow(/bad item/);
  });

  it("the loader and its data module import only ./content and ./deck (and each other; 0.6.2: and ./beltside, which imports only those)", () => {
    const specs = (f: string) => [...readFileSync(f, "utf8").matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s+["']([^"']+)["']/gm)].map((m) => m[1]);
    const loader = specs("src/sim/standInPool.ts"), data = specs("src/sim/standInPoolData.ts"), beltside = specs("src/sim/beltside.ts");
    expect(loader.length).toBeGreaterThan(0);
    for (const s of loader) expect(["./content", "./deck", "./beltside", "./standInPoolData"]).toContain(s);
    for (const s of data) expect(["./content", "./deck"]).toContain(s);
    for (const s of beltside) expect(["./content", "./deck"]).toContain(s);
    for (const f of ["src/sim/standInPool.ts", "src/sim/standInPoolData.ts", "src/sim/beltside.ts"]) expect(readFileSync(f, "utf8")).not.toMatch(/\bimport\s*\(|\brequire\s*\(/);
  });
});
