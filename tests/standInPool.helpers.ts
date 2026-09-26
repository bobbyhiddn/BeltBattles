// Shared test helpers for step 5 M5 (not a test file). The stand-in pool tests hold both while pool v2.1 is the committed
// src/sim/standInPoolData.ts and once the caravan-bound regen pool is (harness-owner decision D4: the regen commit is the
// data module alone). Which pool is committed is read from its header, whose line 2 is the command that regenerates it:
// pool v2.1's legacy header has no --source (full purse against heroRefBuild), and while it is committed every v2.1 pin
// stays; the regen's carries --par field --source caravan and (D1) --par-band 0.5,0.6. Honesty is gold spent (D2): a
// pool pick's 90% floor applies to its entry's gold spent (StandInEntry.spent: a caravan pool's stored sixth element,
// the cost for v2.1), and its deck value (buildCost, deckCost) is at most maxGoldByDay.
import { readFileSync } from "node:fs";
import type { HeroId } from "../src/sim/content";
import { STAND_IN_DATA } from "../src/sim/standInPoolData";
import { standInPickIndex, standInPool, type StandInEntry } from "../src/sim/standInPool";

/** Line 2 of the committed data module: `//   npm run standins -- ...`, the command that regenerates it. */
export const POOL_HEADER: string = readFileSync(new URL("../src/sim/standInPoolData.ts", import.meta.url), "utf8").split("\n")[1];

/** The legacy header (pool v2.1): no --source. While it is committed, the tests keep every v2.1 pin. */
export const POOL_LEGACY: boolean = !POOL_HEADER.includes(" --source ");

/** The population source and the par the committed pool was generated with (legacy: full purse against heroRefBuild). */
export const POOL_SOURCE = (/ --source (caravan|fullpurse)(?: |$)/.exec(POOL_HEADER)?.[1] ?? "fullpurse") as "caravan" | "fullpurse";
export const POOL_PAR = (/ --par (field|heroref)(?: |$)/.exec(POOL_HEADER)?.[1] ?? "heroref") as "field" | "heroref";

const band = / --par-band ([\d.]+),([\d.]+)(?: |$)/.exec(POOL_HEADER);
/** The header's --par-band [lo, hi], if any: every pick's vsPar lies inside it unless its hero/day is listed short. */
export const POOL_PAR_BAND: readonly [number, number] | undefined = band ? [Number(band[1]), Number(band[2])] : undefined;

/** "hero|day" of each hero/day that took its best-vsPar builds (relaxation "best"), listed in short with their vsPar. */
export const POOL_PAR_SHORT: ReadonlySet<string> = new Set(STAND_IN_DATA.short.filter((s) => s.vsPar).map((s) => `${s.hero}|${s.day}`));

/** The pool entry standInPick(hero, day, seed) draws: its stored cost (the deck's value as generated) and gold spent. */
export const pickEntry = (hero: HeroId, day: number, seed: number): StandInEntry => standInPool(hero, day)[standInPickIndex(hero, day, seed)];
