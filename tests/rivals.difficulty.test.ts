import { describe, expect, it } from "vitest";
import { simulate } from "../src/sim/battle";
import { startingBuild } from "../src/sim/ai";
import type { Build } from "../src/sim/deck";
import type { HeroId } from "../src/sim/content";
import {
  DIFFICULTIES, MATRIARCH_DAY, RIVALS, RIVAL_IDS, RUN_DAYS, deckCost, difficultyOf, rivalBuild,
  rivalDays, standInBuild, type Difficulty, type RivalId,
} from "../src/sim/rivals";
import { parField } from "../src/sim/harness/par";

// The per-day difficulty ladder (Part 4, rulings R1-R2), measured the way the player meets the
// captains. The margin is the reference's hull left minus the captain's (fractions), so a higher
// margin is an easier captain. Warlords are measured as rivalBuild (their PvE deck); the stand-in
// pool is measured as standInBuild, the captain's honest plan deck: since 0.6.2 TUNE-C the dusk deck
// again (ghosts.ts standInFoe; from 0.6.0d it was the full-purse stand-in pool's standInPick); the
// printed line adds each hero's stand-in win rate.
// 0.6.2 TUNE-C (ref/BRIEF-final-062-captains.md section 6): the reference is the FURNACE PAR FIELD of the day, the
// typical player the captain plans are calibrated against (src/sim/harness/par.ts parField, its first REF_K members),
// fought as the player (side 0), 3 seeds per member: 24 battles per captain-day (20 before). The old reference,
// honestReference(the other faction, day), spends 0-51% of the day's gold: every retimed plan beats it from day 2, so
// its margins no longer order the ladder (OUT/CAPTAINS-REPORT.md lists this change with the --rivals table).

const REF_K = 8;
const SEEDS = Array.from({ length: 3 }, (_, i) => (i + 1) * 7919);
/** The pacing check's seeds: 20, as before TUNE-C (one pacing deck, no field). */
const PACE_SEEDS = Array.from({ length: 20 }, (_, i) => (i + 1) * 7919);
const DAYS = Array.from({ length: RUN_DAYS }, (_, i) => i + 1);
const GAP = 0.05;
/** 0.8.0 I1 M3 (oracles 64485b535a06683c and 405facc95783b82c, the second replacing the first's single exception): B1's
 *  open items, the three captain-days skipped by "days 8-10: the Iron Matriarch has the lowest margin of all". No rival
 *  changed; the reference (the FURNACE par field) moved when wave 3 went on, and the order broke at M2, before the draw
 *  (day 8 MOTH QUEEN -0.383 vs her -0.364; SILKSHADE below her on days 8, 9 and 10). At the tip (the draw and the
 *  regrown pool) her margins are day 8 -0.409 (ref wins 8%), day 9 -0.527 (4%), day 10 -0.453 (8%), and three sit below:
 *  day 8 MOTH QUEEN -0.423 (13%) and SILKSHADE -0.537 (13%), day 9 SILKSHADE -0.534 (13%). By win rate she is the hardest
 *  on all three days. B1 owns the fix (VERIFIED-P1 section I). Each entry carries its measured gap (her margin minus
 *  its) and a ceiling; the open-item test after the check pins them, and both go when B1 restores the order. */
// 0.8.0 B1 M3 (approved by ref/BRIEF-v080-B1.md section 4): emptied. B1 regrew MOTH QUEEN day 8 and SILKSHADE days 8-9
// (their stand-ins, output-B1/m3/O13-NOTES.md), so every captain sits above the Matriarch on days 8-10 again; the
// open-item test that pinned the three is deleted, as its title asked.
const B1_EXCEPTIONS: readonly { id: RivalId; day: number; gap: number; ceiling: number }[] = [];
// FLIP-X2 step 6 (the brief: remove every exception, measured on the new pools): NUM-1's NUM1_EXCEPTIONS (NETTLE v MOTH
// QUEEN day 1), NUM-2's NUM2_EXCEPTIONS (NETTLE v KARSK days 1 and 8, the day-1 ceiling 0.04) and NUM2_HARD_EXCEPTIONS
// (Hard days 5 and 6), NUM-3's NUM3_MATRIARCH_EXCEPTIONS (SILKSHADE days 8-10, MOTH QUEEN day 9), their pin tests and the
// bb-0.8.7 tripwire are removed. What still fails on release X's field is in LADDER_X_OPEN, below.

/** A ladder rule's violation, as LADDER_X_OPEN pins it: how far past its rule a measured value lies (> 0 means failing). */
type LadderRule = "slotGap" | "easyOverHard" | "parBeatsEasy" | "parLosesToHard" | "matriarchLowest" | "poolBand" | "pacing";
interface LadderOpen { rule: LadderRule; day: number; a?: string; b?: string; v: number; ceiling: number }
/**
 * FLIP-X2 (cap's ruling d9206869a6c991ab item 3 and Addendum 4, pre-authorized): THE ONE LIST of ladder rules that fail on
 * release X's field after the flips, the regeneration and step 4.4b's cap fit. Each rule's failing (day, pair) is skipped
 * by its check and pinned here by its measured violation `v` (slotGap: GAP minus the upper slot's mean margin minus the
 * lower's; easyOverHard: the Hard captain's margin minus the Easy's; parBeatsEasy: minus Easy's mean margin;
 * parLosesToHard: Hard's mean margin; matriarchLowest: her margin minus the captain's; poolBand: |the pool's mean| minus
 * 0.25), with `ceiling` = measured + 0.02, so the gate stays green and any drift shows. No pack or part was re-trimmed for
 * them: cap re-trims the packs on the flipped field in its own job (CATCHUP's capsearch method), which deletes this list.
 */
const LADDER_X_OPEN: readonly LadderOpen[] = [
  // measured on flipx2 13c868d (09:32Z; W/output-flipx2/logs/rivals-difficulty-1.log): 85 rules, v and ceiling = v + 0.02
  { rule: "easyOverHard", day: 1, a: "nettle", b: "karsk", v: 0.0669, ceiling: 0.0869 },
  { rule: "easyOverHard", day: 1, a: "nettle", b: "mothqueen", v: 0.0348, ceiling: 0.0548 },
  { rule: "easyOverHard", day: 2, a: "brasswick", b: "karsk", v: 0.0987, ceiling: 0.1187 },
  { rule: "easyOverHard", day: 2, a: "nettle", b: "karsk", v: 0.2253, ceiling: 0.2453 },
  { rule: "easyOverHard", day: 3, a: "brasswick", b: "karsk", v: 0.1399, ceiling: 0.1599 },
  { rule: "easyOverHard", day: 3, a: "brasswick", b: "mothqueen", v: 0.0523, ceiling: 0.0723 },
  { rule: "easyOverHard", day: 3, a: "nettle", b: "karsk", v: 0.1564, ceiling: 0.1764 },
  { rule: "easyOverHard", day: 3, a: "nettle", b: "mothqueen", v: 0.0688, ceiling: 0.0888 },
  { rule: "easyOverHard", day: 3, a: "ratchet", b: "karsk", v: 0.2633, ceiling: 0.2833 },
  { rule: "easyOverHard", day: 3, a: "ratchet", b: "mothqueen", v: 0.1757, ceiling: 0.1957 },
  { rule: "easyOverHard", day: 4, a: "brasswick", b: "highspire", v: 0.0134, ceiling: 0.0334 },
  { rule: "easyOverHard", day: 4, a: "brasswick", b: "karsk", v: 0.2236, ceiling: 0.2436 },
  { rule: "easyOverHard", day: 4, a: "brasswick", b: "mothqueen", v: 0.2149, ceiling: 0.2349 },
  { rule: "easyOverHard", day: 4, a: "brasswick", b: "silkshade", v: 0.0752, ceiling: 0.0952 },
  { rule: "easyOverHard", day: 4, a: "ratchet", b: "karsk", v: 0.2072, ceiling: 0.2272 },
  { rule: "easyOverHard", day: 4, a: "ratchet", b: "mothqueen", v: 0.1985, ceiling: 0.2185 },
  { rule: "easyOverHard", day: 4, a: "ratchet", b: "silkshade", v: 0.0588, ceiling: 0.0788 },
  { rule: "easyOverHard", day: 5, a: "brasswick", b: "bulwark", v: 0.4142, ceiling: 0.4342 },
  { rule: "easyOverHard", day: 5, a: "brasswick", b: "highspire", v: 0.3217, ceiling: 0.3417 },
  { rule: "easyOverHard", day: 5, a: "brasswick", b: "karsk", v: 0.3145, ceiling: 0.3345 },
  { rule: "easyOverHard", day: 5, a: "brasswick", b: "longtooth", v: 0.1379, ceiling: 0.1579 },
  { rule: "easyOverHard", day: 5, a: "brasswick", b: "mothqueen", v: 0.2134, ceiling: 0.2334 },
  { rule: "easyOverHard", day: 5, a: "brasswick", b: "silkshade", v: 0.2379, ceiling: 0.2579 },
  { rule: "easyOverHard", day: 5, a: "brasswick", b: "voss", v: 0.1542, ceiling: 0.1742 },
  { rule: "easyOverHard", day: 5, a: "ratchet", b: "bulwark", v: 0.0863, ceiling: 0.1063 },
  { rule: "easyOverHard", day: 6, a: "brasswick", b: "bulwark", v: 0.4713, ceiling: 0.4913 },
  { rule: "easyOverHard", day: 6, a: "brasswick", b: "highspire", v: 0.1523, ceiling: 0.1723 },
  { rule: "easyOverHard", day: 6, a: "brasswick", b: "karsk", v: 0.4681, ceiling: 0.4881 },
  { rule: "easyOverHard", day: 6, a: "brasswick", b: "longtooth", v: 0.1004, ceiling: 0.1204 },
  { rule: "easyOverHard", day: 6, a: "brasswick", b: "mothqueen", v: 0.1943, ceiling: 0.2143 },
  { rule: "easyOverHard", day: 6, a: "brasswick", b: "silkshade", v: 0.0269, ceiling: 0.0469 },
  { rule: "easyOverHard", day: 6, a: "brasswick", b: "voss", v: 0.0070, ceiling: 0.0270 },
  { rule: "easyOverHard", day: 6, a: "nettle", b: "bulwark", v: 0.0431, ceiling: 0.0631 },
  { rule: "easyOverHard", day: 6, a: "nettle", b: "karsk", v: 0.0399, ceiling: 0.0599 },
  { rule: "easyOverHard", day: 6, a: "ratchet", b: "bulwark", v: 0.0123, ceiling: 0.0323 },
  { rule: "easyOverHard", day: 6, a: "ratchet", b: "karsk", v: 0.0090, ceiling: 0.0290 },
  { rule: "easyOverHard", day: 7, a: "brasswick", b: "bulwark", v: 0.2693, ceiling: 0.2893 },
  { rule: "easyOverHard", day: 7, a: "brasswick", b: "highspire", v: 0.1339, ceiling: 0.1539 },
  { rule: "easyOverHard", day: 7, a: "brasswick", b: "karsk", v: 0.2714, ceiling: 0.2914 },
  { rule: "easyOverHard", day: 7, a: "brasswick", b: "longtooth", v: 0.0336, ceiling: 0.0536 },
  { rule: "easyOverHard", day: 7, a: "brasswick", b: "mothqueen", v: 0.0812, ceiling: 0.1012 },
  { rule: "easyOverHard", day: 7, a: "nettle", b: "bulwark", v: 0.0272, ceiling: 0.0472 },
  { rule: "easyOverHard", day: 7, a: "nettle", b: "karsk", v: 0.0292, ceiling: 0.0492 },
  { rule: "easyOverHard", day: 8, a: "brasswick", b: "bulwark", v: 0.3239, ceiling: 0.3439 },
  { rule: "easyOverHard", day: 8, a: "brasswick", b: "highspire", v: 0.3310, ceiling: 0.3510 },
  { rule: "easyOverHard", day: 8, a: "brasswick", b: "karsk", v: 0.3486, ceiling: 0.3686 },
  { rule: "easyOverHard", day: 8, a: "brasswick", b: "mothqueen", v: 0.2002, ceiling: 0.2202 },
  { rule: "easyOverHard", day: 8, a: "brasswick", b: "silkshade", v: 0.1062, ceiling: 0.1262 },
  { rule: "easyOverHard", day: 8, a: "grubnose", b: "bulwark", v: 0.0366, ceiling: 0.0566 },
  { rule: "easyOverHard", day: 8, a: "grubnose", b: "highspire", v: 0.0437, ceiling: 0.0637 },
  { rule: "easyOverHard", day: 8, a: "grubnose", b: "karsk", v: 0.0612, ceiling: 0.0812 },
  { rule: "easyOverHard", day: 8, a: "nettle", b: "karsk", v: 0.0099, ceiling: 0.0299 },
  { rule: "easyOverHard", day: 9, a: "brasswick", b: "bulwark", v: 0.1985, ceiling: 0.2185 },
  { rule: "easyOverHard", day: 9, a: "brasswick", b: "highspire", v: 0.1160, ceiling: 0.1360 },
  { rule: "easyOverHard", day: 9, a: "brasswick", b: "karsk", v: 0.4381, ceiling: 0.4581 },
  { rule: "easyOverHard", day: 9, a: "brasswick", b: "longtooth", v: 0.0060, ceiling: 0.0260 },
  { rule: "easyOverHard", day: 9, a: "brasswick", b: "mothqueen", v: 0.1601, ceiling: 0.1801 },
  { rule: "easyOverHard", day: 9, a: "brasswick", b: "voss", v: 0.0249, ceiling: 0.0449 },
  { rule: "easyOverHard", day: 9, a: "grubnose", b: "karsk", v: 0.0487, ceiling: 0.0687 },
  { rule: "easyOverHard", day: 9, a: "ratchet", b: "karsk", v: 0.0133, ceiling: 0.0333 },
  { rule: "easyOverHard", day: 10, a: "brasswick", b: "bulwark", v: 0.2722, ceiling: 0.2922 },
  { rule: "easyOverHard", day: 10, a: "brasswick", b: "highspire", v: 0.1665, ceiling: 0.1865 },
  { rule: "easyOverHard", day: 10, a: "brasswick", b: "karsk", v: 0.4521, ceiling: 0.4721 },
  { rule: "easyOverHard", day: 10, a: "brasswick", b: "mothqueen", v: 0.1794, ceiling: 0.1994 },
  { rule: "easyOverHard", day: 10, a: "grubnose", b: "karsk", v: 0.0448, ceiling: 0.0648 },
  { rule: "easyOverHard", day: 10, a: "nettle", b: "karsk", v: 0.0221, ceiling: 0.0421 },
  { rule: "easyOverHard", day: 10, a: "ratchet", b: "bulwark", v: 0.1612, ceiling: 0.1812 },
  { rule: "easyOverHard", day: 10, a: "ratchet", b: "highspire", v: 0.0556, ceiling: 0.0756 },
  { rule: "easyOverHard", day: 10, a: "ratchet", b: "karsk", v: 0.3412, ceiling: 0.3612 },
  { rule: "easyOverHard", day: 10, a: "ratchet", b: "mothqueen", v: 0.0684, ceiling: 0.0884 },
  { rule: "matriarchLowest", day: 10, a: "voss", v: 0.1774, ceiling: 0.1974 },
  { rule: "parBeatsEasy", day: 3, v: 0.1172, ceiling: 0.1372 },
  { rule: "parBeatsEasy", day: 4, v: 0.1305, ceiling: 0.1505 },
  { rule: "parBeatsEasy", day: 5, v: 0.2958, ceiling: 0.3158 },
  { rule: "parBeatsEasy", day: 6, v: 0.2973, ceiling: 0.3173 },
  { rule: "parBeatsEasy", day: 7, v: 0.1305, ceiling: 0.1505 },
  { rule: "parBeatsEasy", day: 8, v: 0.1237, ceiling: 0.1437 },
  { rule: "parBeatsEasy", day: 9, v: 0.1013, ceiling: 0.1213 },
  { rule: "parBeatsEasy", day: 10, v: 0.0781, ceiling: 0.0981 },
  { rule: "poolBand", day: 6, v: 0.0996, ceiling: 0.1196 },
  // non-ladder pins: the days 1-3 pacing floor (15 s), a = the captain, b = the pacing deck's hero; v = 15 - the mean fight
  { rule: "pacing", day: 2, a: "grimhold", b: "furnace", v: 0.2783, ceiling: 0.2983 }, // mean 14.7217 s; pacing pin (cap's ruling ebdb9a49d368e029)
  { rule: "pacing", day: 3, a: "grimhold", b: "furnace", v: 0.9117, ceiling: 0.9317 }, // mean 14.0883 s; pacing pin (cap's ruling ebdb9a49d368e029)
  { rule: "pacing", day: 3, a: "grimhold", b: "weaver", v: 0.9558, ceiling: 0.9758 }, // mean 14.0442 s; pacing pin (cap's ruling ebdb9a49d368e029)
  { rule: "slotGap", day: 3, a: "medium", b: "hard", v: 0.0796, ceiling: 0.0996 },
  { rule: "slotGap", day: 4, a: "medium", b: "hard", v: 0.1075, ceiling: 0.1275 },
  { rule: "slotGap", day: 5, a: "easy", b: "medium", v: 0.0909, ceiling: 0.1109 },
  { rule: "slotGap", day: 8, a: "medium", b: "hard", v: 0.0278, ceiling: 0.0478 },
  { rule: "slotGap", day: 10, a: "easy", b: "medium", v: 0.0423, ceiling: 0.0623 },
];
const open = (rule: LadderRule, day: number, a?: string, b?: string): LadderOpen | undefined =>
  LADDER_X_OPEN.find((x) => x.rule === rule && x.day === day && x.a === a && x.b === b);
const REFS = new Map<number, Build[]>();
const refsOf = (day: number): Build[] => {
  if (!REFS.has(day)) REFS.set(day, parField("furnace", day, REF_K));
  return REFS.get(day)!;
};

interface Score { rate: number; margin: number; t: number; foe: number } // 0.6.0d: foe = the captain's win rate

/** The captain against the day's par field: the mean over its REF_K members. */
const vsPar = (day: number, foe: Build): Score => mean(refsOf(day).map((ref) => versus(ref, foe)));

function versus(ref: Build, foe: Build, seeds: readonly number[] = SEEDS): Score {
  let wins = 0, lost = 0, margin = 0, t = 0;
  for (const seed of seeds) {
    const b = simulate(ref, foe, seed);
    const [p, e] = b.sides;
    if (b.winner === 0) wins++;
    if (b.winner === 1) lost++;
    margin += Math.max(0, p.hull.hp) / p.hull.max - Math.max(0, e.hull.hp) / e.hull.max;
    t += b.t;
  }
  return { rate: wins / seeds.length, margin: margin / seeds.length, t: t / seeds.length, foe: lost / seeds.length };
}

function mean(xs: Score[]): Score {
  const n = xs.length;
  return {
    rate: xs.reduce((a, s) => a + s.rate, 0) / n,
    margin: xs.reduce((a, s) => a + s.margin, 0) / n,
    t: xs.reduce((a, s) => a + s.t, 0) / n,
    foe: xs.reduce((a, s) => a + s.foe, 0) / n,
  };
}

/** Captains the player can meet on a day as a warlord: all 12 regulars and elites, the Matriarch on 8-10. */
const eligible = (day: number) => RIVAL_IDS.filter((id) => rivalDays(id).includes(day));
const slotOn = (slot: Difficulty, day: number) => eligible(day).filter((id) => difficultyOf(id) === slot);
const STAND_INS = RIVAL_IDS.filter((id) => id !== "matriarch");

const warlord = new Map<string, Score>(), standIn = new Map<string, Score>();
for (const day of DAYS) {
  for (const id of eligible(day)) warlord.set(`${id}@${day}`, vsPar(day, rivalBuild(id, day)));
  for (const id of STAND_INS) standIn.set(`${id}@${day}`, vsPar(day, standInBuild(id, day)));
}
const score = (id: RivalId, day: number) => warlord.get(`${id}@${day}`)!;
const slotMean = (slot: Difficulty, day: number) => mean(slotOn(slot, day).map((id) => score(id, day)));
const poolMean = (day: number) => mean(STAND_INS.map((id) => standIn.get(`${id}@${day}`)!));

/** A tests/pacing.test.ts player deck: the hero's start deck plus its first `n` (0-2) gates. */
function pacingDeck(h: HeroId, n: number): Build {
  const b = JSON.parse(JSON.stringify(startingBuild(h, 1))) as Build;
  const gates: [string, number, number][] = h === "furnace"
    ? [["temper", 4, 3], ["whetstone", 4, 2]]
    : [["grease", 4, 3], ["whetstone", 1, 3]];
  gates.slice(0, n).forEach(([def, x, y], i) => b.items.push({ uid: 500 + i, def, x, y }));
  return b;
}
/** The pacing-test deck a player brings to days 1-3 (0, 1 and 2 gates). */
const playerDeck = (h: HeroId, day: number) => pacingDeck(h, Math.min(2, day - 1));
const pct = (x: number) => `${(x * 100).toFixed(0).padStart(3)}%`;
const sgn = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(3)}`;
const fmt = (s: Score) => `ref wins ${pct(s.rate)}  margin ${sgn(s.margin)}  avg ${s.t.toFixed(1)}s`;

describe("warlord difficulty ladder, day by day (reference = the FURNACE par field, 8 members x 3 seeds)", () => {
  it("prints the ladder and the stand-in pool: per day, each difficulty's mean, then every captain", () => {
    const lines = ["warlord ladder (rivalBuild vs the FURNACE par field; reference win rate and margin):"];
    for (const day of DAYS) {
      const means = DIFFICULTIES.map((d) => `${d} ${pct(slotMean(d, day).rate)} ${sgn(slotMean(d, day).margin)}`);
      lines.push(`  day ${String(day).padStart(2)}: ${means.join(" | ")}`);
      for (const slot of DIFFICULTIES) {
        for (const id of slotOn(slot, day)) {
          const g = deckCost(rivalBuild(id, day)).total;
          lines.push(`      ${slot.padEnd(6)} ${RIVALS[id].name.padEnd(14)} ${String(g).padStart(3)}g  ${fmt(score(id, day))}`);
        }
      }
    }
    lines.push("stand-in pool (12 standInBuild decks vs the FURNACE par field):");
    for (const day of DAYS) {
      const p = poolMean(day);
      const each = STAND_INS.map((id) => `${id} ${sgn(standIn.get(`${id}@${day}`)!.margin)}`).join(" ");
      // 0.6.0d: the old dusk decks' own win rate per hero (the same fights, no new sweep)
      const hero = (h: HeroId) => pct(mean(STAND_INS.filter((id) => RIVALS[id].hero === h).map((id) => standIn.get(`${id}@${day}`)!)).foe);
      lines.push(`  day ${String(day).padStart(2)}: pool ref wins ${pct(p.rate)} margin ${sgn(p.margin)} | standInBuild wins: furnace ${hero("furnace")} weaver ${hero("weaver")} | ${each}`);
    }
    // eslint-disable-next-line no-console
    console.log(lines.join("\n"));
    // 0.8.0 N1 (oracle 94b9559fbb7da299 (7)): 16 road captains a day (the 12 and BRASSWICK, GRIMHOLD, MASTER VOSS, THANE
    // KARSK; LOCKJAW and THISTLEMAIL never ride the road), so 18 lines a day (14 before): 2 + 10 x 18 + 3 = 185
    expect(lines.length).toBe(2 + RUN_DAYS * 18 + (RUN_DAYS - MATRIARCH_DAY + 1));
  });

  it("the Iron Matriarch is measured on days 8-10 only", () => {
    expect(DAYS.filter((d) => eligible(d).includes("matriarch"))).toEqual([8, 9, 10]);
  });

  it("every day: by mean margin Easy > Medium > Hard, each gap at least 0.05", () => {
    const bad: string[] = [];
    for (const day of DAYS) {
      const [e, m, h] = DIFFICULTIES.map((d) => slotMean(d, day).margin);
      for (const [a, b, x, y] of [["easy", "medium", e, m], ["medium", "hard", m, h]] as const) {
        if (x - y < GAP && !open("slotGap", day, a, b)) bad.push(`slotGap day ${day} ${a} ${sgn(x)} vs ${b} ${sgn(y)}: v ${(GAP - (x - y)).toFixed(4)}`);
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  // NUM-1 (cap's oracle 03f2cc3c1884e806): failures are collected, so one run names every failing pair (as the Matriarch
  // test does); FLIP-X2: LADDER_X_OPEN's pairs are skipped here and pinned by its own test below
  it("every day: every Easy captain's margin is above every Hard captain's", () => {
    const violations: string[] = [];
    for (const day of DAYS) {
      for (const a of slotOn("easy", day)) {
        for (const b of slotOn("hard", day)) {
          if (open("easyOverHard", day, a, b)) continue; // FLIP-X2: LADDER_X_OPEN
          if (!(score(a, day).margin > score(b, day).margin)) violations.push(`easyOverHard day ${day} ${a} ${b}: ${fmt(score(a, day))} vs ${fmt(score(b, day))} v ${(score(b, day).margin - score(a, day).margin).toFixed(4)}`);
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  // 0.6.2 TUNE-C: Hard from day 2. On day 1 the Hard warlords read 41% against the FURNACE par field (K 24;
  // OUT/CAPTAINS-REPORT.md, the --rivals table), a miss accepted for luck (REQ-BFG-033): the day-1 good-luck value cap is
  // 8 g, and MOTH QUEEN (7 g), OLD BULWARK (7 g), HIGHSPIRE (6 g) and SILKSHADE (8 g) sit within 2 g of it while the
  // cheapest part costs 3 g; the warlord's PvE ramp also takes 27 hull on day 1 (ai.ts warlordHull).
  it("every day: a par deck beats Easy on average (mean margin > 0); from day 2 it loses to Hard (< 0)", () => {
    const bad: string[] = [];
    for (const day of DAYS) {
      const e = slotMean("easy", day).margin, h = slotMean("hard", day).margin;
      if (!(e > 0) && !open("parBeatsEasy", day)) bad.push(`parBeatsEasy day ${day}: easy ${sgn(e)} v ${(-e).toFixed(4)}`);
      if (day >= 2 && !(h < 0) && !open("parLosesToHard", day)) bad.push(`parLosesToHard day ${day}: hard ${sgn(h)} v ${h.toFixed(4)}`);
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  // 0.8.0 I1 M3 (oracle 405facc95783b82c): the same predicate, every failing captain-day listed before one assertion, so
  // one run names them all (a loop of expects stopped at the first and hid SILKSHADE behind MOTH QUEEN); B1's three
  // open items (B1_EXCEPTIONS) are skipped; FLIP-X2: LADDER_X_OPEN's too, pinned by its own test below
  it("days 8-10: the Iron Matriarch has the lowest margin of all", () => {
    const violations: string[] = [];
    for (const day of DAYS.filter((d) => d >= MATRIARCH_DAY)) {
      for (const id of eligible(day)) {
        if (id === "matriarch") continue;
        if (B1_EXCEPTIONS.some((x) => x.id === id && x.day === day)) continue; // B1's open item (oracle 405facc95783b82c)
        if (open("matriarchLowest", day, id)) continue; // FLIP-X2: LADDER_X_OPEN
        if (!(score(id, day).margin > score("matriarch", day).margin)) {
          violations.push(`matriarchLowest day ${day} ${id}: ${fmt(score(id, day))} vs matriarch ${fmt(score("matriarch", day))} v ${(score("matriarch", day).margin - score(id, day).margin).toFixed(4)}`);
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]); // NUM-3: the message names every violation (vitest truncates arrays)
  });

  it("every day: the stand-in pool's mean margin is between -0.25 and +0.25", () => {
    const bad: string[] = [];
    for (const day of DAYS) {
      const p = poolMean(day).margin;
      if (Math.abs(p) > 0.25 && !open("poolBand", day)) bad.push(`poolBand day ${day}: pool ${sgn(p)} v ${(Math.abs(p) - 0.25).toFixed(4)}`);
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  // FLIP-X2 (cap's ruling d9206869a6c991ab item 3, Addendum 4): every LADDER_X_OPEN entry still fails its rule (else it
  // leaves the list) and stays within its ceiling (measured + 0.02), so any drift shows
  it("LADDER_X_OPEN: each open ladder rule's violation stays above 0 and at or under its ceiling (measured + 0.02)", () => {
    const vOf = (x: LadderOpen): number => {
      if (x.rule === "slotGap") return GAP - (slotMean(x.a as Difficulty, x.day).margin - slotMean(x.b as Difficulty, x.day).margin);
      if (x.rule === "easyOverHard") return score(x.b as RivalId, x.day).margin - score(x.a as RivalId, x.day).margin;
      if (x.rule === "parBeatsEasy") return -slotMean("easy", x.day).margin;
      if (x.rule === "parLosesToHard") return slotMean("hard", x.day).margin;
      if (x.rule === "matriarchLowest") return score("matriarch", x.day).margin - score(x.a as RivalId, x.day).margin;
      if (x.rule === "pacing") return 15 - versus(playerDeck(x.b as HeroId, x.day), rivalBuild(x.a as RivalId, x.day), PACE_SEEDS).t;
      return Math.abs(poolMean(x.day).margin) - 0.25;
    };
    for (const x of LADDER_X_OPEN) {
      const v = vOf(x), what = `${x.rule} day ${x.day} ${x.a ?? ""} ${x.b ?? ""}: v ${v.toFixed(4)} (measured ${x.v})`;
      expect(v, what).toBeGreaterThanOrEqual(0);
      expect(v, what).toBeLessThanOrEqual(x.ceiling);
      expect(x.ceiling, what).toBeCloseTo(x.v + 0.02, 6);
    }
  });

  // 0.6.2 TUNE-C: the floor is 15 s (20 before). The retimed Easy and Medium decks beat the weak pacing-test decks
  // faster: day 1 24-33 s, day 2 19-23 s, day 3 15.5-20.6 s (lowest: the WEAVER pacing deck vs LACEWING on day 3,
  // 15.5 s). The round tunes no pacing (brief section 3 item 6: report fight lengths only); the genre study's typical
  // dusk fight is 10-30 s, and par's fights against the named decks are listed in OUT/CAPTAINS-REPORT.md.
  it("days 1-3: Easy and Medium captains keep the 0.4.0 pacing against the pacing-test decks (mean 15-45 s)", () => {
    const lines: string[] = [], bad: string[] = [];
    for (const day of [1, 2, 3]) {
      for (const id of [...slotOn("easy", day), ...slotOn("medium", day)]) {
        for (const h of ["furnace", "weaver"] as HeroId[]) {
          const s = versus(playerDeck(h, day), rivalBuild(id, day), PACE_SEEDS);
          lines.push(`  pacing ${h} deck day ${day} vs ${RIVALS[id].name}: ${fmt(s)}`);
          if (open("pacing", day, id, h)) continue; // FLIP-X2: LADDER_X_OPEN's pacing pins (cap's ruling ebdb9a49d368e029)
          // FLIP-X2: every failing pair is collected before one assertion (as the other ladder checks), same bounds
          if (!(s.t >= 15 && s.t <= 45)) bad.push(`pacing day ${day} ${h} vs ${id}: avg ${s.t.toFixed(4)} s v ${(15 - s.t).toFixed(4)}`);
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log(lines.join("\n"));
    expect(bad, bad.join("\n")).toEqual([]);
  });
});
