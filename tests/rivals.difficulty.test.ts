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
  // Y7b2 (REQ-BFG-070, REQ-BFG-046; release Y's flip, bb-0.9.3; BRIEF-Y7B2 step 8, BAL-2 step 8's method): re-measured on y7b2
  // 9173558 (the flip, the fuse rule, the regenerated luck caps and the captain fit; CAPTAIN_RUNES unchanged) with an uncommitted
  // copy of these rules with no exception list (T/output-y7b2/ladder/make-collector.mjs, ladder.jsonl, ladder.compare.txt):
  // 110 -> 126 entries, ceiling = measured v + 0.02. By rule (old -> new): easyOverHard 77 -> 96, parBeatsEasy 6 -> 6,
  // parLosesToHard 2 -> 3, slotGap 8 -> 7, poolBand 1 -> 2, matriarchLowest 14 -> 10, pacing 2 -> 2 (no new pacing pair).
  // Out (pass now) 23; in 39, most of them easyOverHard on days 3-5 against LONGTOOTH, BULWARK, VOSS and HIGHSPIRE (the Easy
  // captains over the Hard ones stay the structural item after 0.9.2 that CATCHUP-091 named). Each line's comment: "carried"
  // (in 0.9.2's list, its old v) or "new". Before, CATCHUP-091's note:
  // CATCHUP-091 (REQ-BFG-024; cap's ruling 3c58471c74bdc4ed Q4 (i): everything that stays is re-pinned at the measured v
  // + 0.02, each with its reason; more than 10 authorized): re-measured at fa273df (the captains' final plans and
  // CAPTAIN_RUNES) with kit091's collector, an uncommitted copy of these rules with no exception list
  // (W/output-c091/ladder/ladder-final-fa273df.json): 110 entries, BAL-2's 92 -> 110. Out (pass now) 7: easyOverHard d4
  // BRASSWICK v HIGHSPIRE and v KARSK, d4 RATCHET v HIGHSPIRE and v KARSK, d5 RATCHET v HIGHSPIRE, d8 GRUBNOSE v
  // HIGHSPIRE; matriarchLowest d10 VOSS. New 25, every one from the walls' fixes (walls first, ruling 3c58471c74bdc4ed):
  // the Matriarch's PYRE HEART rule (matriarchLowest 14, easyOverHard v the Matriarch 3), MASTER VOSS's and SILKSHADE's
  // fixes (easyOverHard 6), parLosesToHard d3 and slotGap d8 medium / hard. The Easy captains over the Hard ones are a
  // structural item for a pass after 0.9.2 (the ruling: no Easy-captain rune rule or plan move here). Each line's
  // comment: "carried" (in BAL-2's list, its old v) or what moved it in. Before, BAL-2's note:
  // BAL-2 step 8 (cap's REVIEW-BAL1 answer 3: any rivals.difficulty rule may enter it; cap's ruling ebdb9a49d368e029 for
  // the pacing pins): re-measured on bal2 b1b0d28 (16:15Z; 0.9.1's lines, the regenerated caps, CAPTAIN_RUNES re-pinned
  // and the captain fit; W/output-bal2/ladder/ladder.json): 90 ladder rules + 2 pacing pins, v and ceiling = v + 0.02.
  // The pacing entries are non-ladder pins: the days 1-3 pacing floor (15 s), a = the captain, b = the pacing deck's hero;
  // v = 15 - the mean fight (GRIMHOLD's day-3 pins stay: no least change of his own plan clears them in this job).
  { rule: "easyOverHard", day: 1, a: "brasswick", b: "karsk", v: 0.0153, ceiling: 0.0353 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "easyOverHard", day: 1, a: "nettle", b: "highspire", v: 0.0249, ceiling: 0.0449 }, // carried (0.9.2 0.0226)
  { rule: "easyOverHard", day: 1, a: "nettle", b: "karsk", v: 0.1666, ceiling: 0.1866 }, // carried (0.9.2 0.0659)
  { rule: "easyOverHard", day: 1, a: "nettle", b: "mothqueen", v: 0.0542, ceiling: 0.0742 }, // carried (0.9.2 0.0467)
  { rule: "easyOverHard", day: 1, a: "ratchet", b: "karsk", v: 0.0586, ceiling: 0.0786 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "easyOverHard", day: 2, a: "brasswick", b: "karsk", v: 0.1921, ceiling: 0.2121 }, // carried (0.9.2 0.1272)
  { rule: "easyOverHard", day: 2, a: "brasswick", b: "longtooth", v: 0.0848, ceiling: 0.1048 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "easyOverHard", day: 2, a: "grubnose", b: "karsk", v: 0.0707, ceiling: 0.0907 }, // carried (0.9.2 0.0000)
  { rule: "easyOverHard", day: 2, a: "nettle", b: "karsk", v: 0.0095, ceiling: 0.0295 }, // carried (0.9.2 0.1361)
  { rule: "easyOverHard", day: 3, a: "brasswick", b: "bulwark", v: 0.2420, ceiling: 0.2620 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "easyOverHard", day: 3, a: "brasswick", b: "highspire", v: 0.1525, ceiling: 0.1725 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "easyOverHard", day: 3, a: "brasswick", b: "karsk", v: 0.1667, ceiling: 0.1867 }, // carried (0.9.2 0.0796)
  { rule: "easyOverHard", day: 3, a: "brasswick", b: "longtooth", v: 0.3944, ceiling: 0.4144 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "easyOverHard", day: 3, a: "brasswick", b: "mothqueen", v: 0.0863, ceiling: 0.1063 }, // carried (0.9.2 0.0409)
  { rule: "easyOverHard", day: 3, a: "brasswick", b: "voss", v: 0.1534, ceiling: 0.1734 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "easyOverHard", day: 3, a: "grubnose", b: "bulwark", v: 0.1356, ceiling: 0.1556 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "easyOverHard", day: 3, a: "grubnose", b: "highspire", v: 0.0460, ceiling: 0.0660 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "easyOverHard", day: 3, a: "grubnose", b: "karsk", v: 0.0603, ceiling: 0.0803 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "easyOverHard", day: 3, a: "grubnose", b: "longtooth", v: 0.2879, ceiling: 0.3079 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "easyOverHard", day: 3, a: "grubnose", b: "voss", v: 0.0470, ceiling: 0.0670 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "easyOverHard", day: 3, a: "nettle", b: "longtooth", v: 0.1287, ceiling: 0.1487 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "easyOverHard", day: 3, a: "ratchet", b: "bulwark", v: 0.2644, ceiling: 0.2844 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "easyOverHard", day: 3, a: "ratchet", b: "highspire", v: 0.1749, ceiling: 0.1949 }, // carried (0.9.2 0.1189)
  { rule: "easyOverHard", day: 3, a: "ratchet", b: "karsk", v: 0.1891, ceiling: 0.2091 }, // carried (0.9.2 0.2420)
  { rule: "easyOverHard", day: 3, a: "ratchet", b: "longtooth", v: 0.4167, ceiling: 0.4367 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "easyOverHard", day: 3, a: "ratchet", b: "mothqueen", v: 0.1086, ceiling: 0.1286 }, // carried (0.9.2 0.2033)
  { rule: "easyOverHard", day: 3, a: "ratchet", b: "silkshade", v: 0.0194, ceiling: 0.0394 }, // carried (0.9.2 0.1458)
  { rule: "easyOverHard", day: 3, a: "ratchet", b: "voss", v: 0.1758, ceiling: 0.1958 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "easyOverHard", day: 4, a: "brasswick", b: "bulwark", v: 0.3356, ceiling: 0.3556 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "easyOverHard", day: 4, a: "brasswick", b: "highspire", v: 0.2319, ceiling: 0.2519 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "easyOverHard", day: 4, a: "brasswick", b: "karsk", v: 0.0792, ceiling: 0.0992 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "easyOverHard", day: 4, a: "brasswick", b: "longtooth", v: 0.5225, ceiling: 0.5425 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "easyOverHard", day: 4, a: "brasswick", b: "mothqueen", v: 0.2618, ceiling: 0.2818 }, // carried (0.9.2 0.1557)
  { rule: "easyOverHard", day: 4, a: "brasswick", b: "voss", v: 0.1742, ceiling: 0.1942 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "easyOverHard", day: 4, a: "grubnose", b: "bulwark", v: 0.0292, ceiling: 0.0492 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "easyOverHard", day: 4, a: "grubnose", b: "longtooth", v: 0.2161, ceiling: 0.2361 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "easyOverHard", day: 4, a: "ratchet", b: "bulwark", v: 0.1596, ceiling: 0.1796 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "easyOverHard", day: 4, a: "ratchet", b: "highspire", v: 0.0559, ceiling: 0.0759 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "easyOverHard", day: 4, a: "ratchet", b: "longtooth", v: 0.3465, ceiling: 0.3665 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "easyOverHard", day: 4, a: "ratchet", b: "mothqueen", v: 0.0858, ceiling: 0.1058 }, // carried (0.9.2 0.1731)
  { rule: "easyOverHard", day: 5, a: "brasswick", b: "bulwark", v: 0.8146, ceiling: 0.8346 }, // carried (0.9.2 0.4342)
  { rule: "easyOverHard", day: 5, a: "brasswick", b: "highspire", v: 0.4179, ceiling: 0.4379 }, // carried (0.9.2 0.2903)
  { rule: "easyOverHard", day: 5, a: "brasswick", b: "karsk", v: 0.5125, ceiling: 0.5325 }, // carried (0.9.2 0.5394)
  { rule: "easyOverHard", day: 5, a: "brasswick", b: "longtooth", v: 0.8472, ceiling: 0.8672 }, // carried (0.9.2 0.3095)
  { rule: "easyOverHard", day: 5, a: "brasswick", b: "mothqueen", v: 0.3053, ceiling: 0.3253 }, // carried (0.9.2 0.3119)
  { rule: "easyOverHard", day: 5, a: "brasswick", b: "silkshade", v: 0.4179, ceiling: 0.4379 }, // carried (0.9.2 0.5893)
  { rule: "easyOverHard", day: 5, a: "brasswick", b: "voss", v: 0.6120, ceiling: 0.6320 }, // carried (0.9.2 0.2775)
  { rule: "easyOverHard", day: 5, a: "grubnose", b: "bulwark", v: 0.1347, ceiling: 0.1547 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "easyOverHard", day: 5, a: "grubnose", b: "longtooth", v: 0.1673, ceiling: 0.1873 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "easyOverHard", day: 5, a: "ratchet", b: "bulwark", v: 0.2897, ceiling: 0.3097 }, // carried (0.9.2 0.0395)
  { rule: "easyOverHard", day: 5, a: "ratchet", b: "longtooth", v: 0.3222, ceiling: 0.3422 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "easyOverHard", day: 5, a: "ratchet", b: "voss", v: 0.0871, ceiling: 0.1071 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "easyOverHard", day: 6, a: "brasswick", b: "bulwark", v: 0.8639, ceiling: 0.8839 }, // carried (0.9.2 0.5678)
  { rule: "easyOverHard", day: 6, a: "brasswick", b: "highspire", v: 0.3464, ceiling: 0.3664 }, // carried (0.9.2 0.2169)
  { rule: "easyOverHard", day: 6, a: "brasswick", b: "karsk", v: 0.4270, ceiling: 0.4470 }, // carried (0.9.2 0.5238)
  { rule: "easyOverHard", day: 6, a: "brasswick", b: "longtooth", v: 0.4145, ceiling: 0.4345 }, // carried (0.9.2 0.2406)
  { rule: "easyOverHard", day: 6, a: "brasswick", b: "mothqueen", v: 0.3357, ceiling: 0.3557 }, // carried (0.9.2 0.3027)
  { rule: "easyOverHard", day: 6, a: "brasswick", b: "silkshade", v: 0.0746, ceiling: 0.0946 }, // carried (0.9.2 0.2547)
  { rule: "easyOverHard", day: 6, a: "brasswick", b: "voss", v: 0.5041, ceiling: 0.5241 }, // carried (0.9.2 0.2063)
  { rule: "easyOverHard", day: 6, a: "grubnose", b: "bulwark", v: 0.1723, ceiling: 0.1923 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "easyOverHard", day: 6, a: "ratchet", b: "bulwark", v: 0.0293, ceiling: 0.0493 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "easyOverHard", day: 7, a: "brasswick", b: "bulwark", v: 0.4772, ceiling: 0.4972 }, // carried (0.9.2 0.2888)
  { rule: "easyOverHard", day: 7, a: "brasswick", b: "highspire", v: 0.2382, ceiling: 0.2582 }, // carried (0.9.2 0.1456)
  { rule: "easyOverHard", day: 7, a: "brasswick", b: "karsk", v: 0.3201, ceiling: 0.3401 }, // carried (0.9.2 0.4713)
  { rule: "easyOverHard", day: 7, a: "brasswick", b: "longtooth", v: 0.2394, ceiling: 0.2594 }, // carried (0.9.2 0.1160)
  { rule: "easyOverHard", day: 7, a: "brasswick", b: "mothqueen", v: 0.2202, ceiling: 0.2402 }, // carried (0.9.2 0.2511)
  { rule: "easyOverHard", day: 7, a: "brasswick", b: "silkshade", v: 0.1791, ceiling: 0.1991 }, // carried (0.9.2 0.2646)
  { rule: "easyOverHard", day: 7, a: "brasswick", b: "voss", v: 0.4267, ceiling: 0.4467 }, // carried (0.9.2 0.3236)
  { rule: "easyOverHard", day: 8, a: "brasswick", b: "bulwark", v: 0.5673, ceiling: 0.5873 }, // carried (0.9.2 0.3020)
  { rule: "easyOverHard", day: 8, a: "brasswick", b: "highspire", v: 0.3180, ceiling: 0.3380 }, // carried (0.9.2 0.2019)
  { rule: "easyOverHard", day: 8, a: "brasswick", b: "karsk", v: 0.4897, ceiling: 0.5097 }, // carried (0.9.2 0.5733)
  { rule: "easyOverHard", day: 8, a: "brasswick", b: "longtooth", v: 0.3068, ceiling: 0.3268 }, // carried (0.9.2 0.0818)
  { rule: "easyOverHard", day: 8, a: "brasswick", b: "matriarch", v: 0.1648, ceiling: 0.1848 }, // carried (0.9.2 0.2262)
  { rule: "easyOverHard", day: 8, a: "brasswick", b: "mothqueen", v: 0.2799, ceiling: 0.2999 }, // carried (0.9.2 0.2782)
  { rule: "easyOverHard", day: 8, a: "brasswick", b: "silkshade", v: 0.1818, ceiling: 0.2018 }, // carried (0.9.2 0.2661)
  { rule: "easyOverHard", day: 8, a: "brasswick", b: "voss", v: 0.3646, ceiling: 0.3846 }, // carried (0.9.2 0.2858)
  { rule: "easyOverHard", day: 8, a: "grubnose", b: "bulwark", v: 0.1515, ceiling: 0.1715 }, // carried (0.9.2 0.0616)
  { rule: "easyOverHard", day: 8, a: "grubnose", b: "karsk", v: 0.0738, ceiling: 0.0938 }, // carried (0.9.2 0.3330)
  { rule: "easyOverHard", day: 8, a: "nettle", b: "bulwark", v: 0.0721, ceiling: 0.0921 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "easyOverHard", day: 9, a: "brasswick", b: "bulwark", v: 0.3402, ceiling: 0.3602 }, // carried (0.9.2 0.2911)
  { rule: "easyOverHard", day: 9, a: "brasswick", b: "highspire", v: 0.1704, ceiling: 0.1904 }, // carried (0.9.2 0.2103)
  { rule: "easyOverHard", day: 9, a: "brasswick", b: "karsk", v: 0.3782, ceiling: 0.3982 }, // carried (0.9.2 0.5102)
  { rule: "easyOverHard", day: 9, a: "brasswick", b: "longtooth", v: 0.3412, ceiling: 0.3612 }, // carried (0.9.2 0.2283)
  { rule: "easyOverHard", day: 9, a: "brasswick", b: "matriarch", v: 0.2223, ceiling: 0.2423 }, // carried (0.9.2 0.2670)
  { rule: "easyOverHard", day: 9, a: "brasswick", b: "mothqueen", v: 0.1976, ceiling: 0.2176 }, // carried (0.9.2 0.2507)
  { rule: "easyOverHard", day: 9, a: "brasswick", b: "silkshade", v: 0.0018, ceiling: 0.0218 }, // carried (0.9.2 0.1450)
  { rule: "easyOverHard", day: 9, a: "brasswick", b: "voss", v: 0.4494, ceiling: 0.4694 }, // carried (0.9.2 0.4422)
  { rule: "easyOverHard", day: 9, a: "grubnose", b: "voss", v: 0.0320, ceiling: 0.0520 }, // carried (0.9.2 0.1092)
  { rule: "easyOverHard", day: 10, a: "brasswick", b: "bulwark", v: 0.3648, ceiling: 0.3848 }, // carried (0.9.2 0.1480)
  { rule: "easyOverHard", day: 10, a: "brasswick", b: "highspire", v: 0.1241, ceiling: 0.1441 }, // carried (0.9.2 0.1486)
  { rule: "easyOverHard", day: 10, a: "brasswick", b: "karsk", v: 0.3067, ceiling: 0.3267 }, // carried (0.9.2 0.4410)
  { rule: "easyOverHard", day: 10, a: "brasswick", b: "longtooth", v: 0.1930, ceiling: 0.2130 }, // carried (0.9.2 0.1469)
  { rule: "easyOverHard", day: 10, a: "brasswick", b: "matriarch", v: 0.0740, ceiling: 0.0940 }, // carried (0.9.2 0.1006)
  { rule: "easyOverHard", day: 10, a: "brasswick", b: "mothqueen", v: 0.1729, ceiling: 0.1929 }, // carried (0.9.2 0.1184)
  { rule: "easyOverHard", day: 10, a: "brasswick", b: "voss", v: 0.3336, ceiling: 0.3536 }, // carried (0.9.2 0.3599)
  { rule: "easyOverHard", day: 10, a: "ratchet", b: "bulwark", v: 0.0273, ceiling: 0.0473 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "parBeatsEasy", day: 5, v: 0.0747, ceiling: 0.0947 }, // carried (0.9.2 0.1734)
  { rule: "parBeatsEasy", day: 6, v: 0.0595, ceiling: 0.0795 }, // carried (0.9.2 0.1381)
  { rule: "parBeatsEasy", day: 7, v: 0.1946, ceiling: 0.2146 }, // carried (0.9.2 0.0800)
  { rule: "parBeatsEasy", day: 8, v: 0.2361, ceiling: 0.2561 }, // carried (0.9.2 0.1153)
  { rule: "parBeatsEasy", day: 9, v: 0.1502, ceiling: 0.1702 }, // carried (0.9.2 0.0663)
  { rule: "parBeatsEasy", day: 10, v: 0.1193, ceiling: 0.1393 }, // carried (0.9.2 0.0466)
  { rule: "parLosesToHard", day: 2, v: 0.1461, ceiling: 0.1661 }, // carried (0.9.2 0.0314)
  { rule: "parLosesToHard", day: 3, v: 0.2400, ceiling: 0.2600 }, // carried (0.9.2 0.0077)
  { rule: "parLosesToHard", day: 4, v: 0.0205, ceiling: 0.0405 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "slotGap", day: 2, a: "medium", b: "hard", v: 0.0508, ceiling: 0.0708 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "slotGap", day: 3, a: "medium", b: "hard", v: 0.2803, ceiling: 0.3003 }, // carried (0.9.2 0.1347)
  { rule: "slotGap", day: 4, a: "medium", b: "hard", v: 0.1073, ceiling: 0.1273 }, // carried (0.9.2 0.0395)
  { rule: "slotGap", day: 5, a: "easy", b: "medium", v: 0.1488, ceiling: 0.1688 }, // carried (0.9.2 0.1257)
  { rule: "slotGap", day: 6, a: "easy", b: "medium", v: 0.0326, ceiling: 0.0526 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "slotGap", day: 7, a: "easy", b: "medium", v: 0.0033, ceiling: 0.0233 }, // carried (0.9.2 0.0165)
  { rule: "slotGap", day: 8, a: "medium", b: "hard", v: 0.0501, ceiling: 0.0701 }, // carried (0.9.2 0.0412)
  { rule: "poolBand", day: 1, v: 0.0244, ceiling: 0.0444 }, // carried (0.9.2 0.0169)
  { rule: "poolBand", day: 8, v: 0.0092, ceiling: 0.0292 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "matriarchLowest", day: 8, a: "brasswick", v: 0.1648, ceiling: 0.1848 }, // carried (0.9.2 0.2262)
  { rule: "matriarchLowest", day: 8, a: "sootjaw", v: 0.0250, ceiling: 0.0450 }, // new (release Y: the flip, the regenerated caps, the captain fit)
  { rule: "matriarchLowest", day: 9, a: "brasswick", v: 0.2223, ceiling: 0.2423 }, // carried (0.9.2 0.2670)
  { rule: "matriarchLowest", day: 9, a: "highspire", v: 0.0518, ceiling: 0.0718 }, // carried (0.9.2 0.0567)
  { rule: "matriarchLowest", day: 9, a: "mothqueen", v: 0.0247, ceiling: 0.0447 }, // carried (0.9.2 0.0163)
  { rule: "matriarchLowest", day: 9, a: "silkshade", v: 0.2204, ceiling: 0.2404 }, // carried (0.9.2 0.1221)
  { rule: "matriarchLowest", day: 9, a: "thistlemail", v: 0.0684, ceiling: 0.0884 }, // carried (0.9.2 0.0808)
  { rule: "matriarchLowest", day: 10, a: "brasswick", v: 0.0740, ceiling: 0.0940 }, // carried (0.9.2 0.1006)
  { rule: "matriarchLowest", day: 10, a: "silkshade", v: 0.1113, ceiling: 0.1313 }, // carried (0.9.2 0.1941)
  { rule: "matriarchLowest", day: 10, a: "thistlemail", v: 0.0444, ceiling: 0.0644 }, // carried (0.9.2 0.0662)
  { rule: "pacing", day: 3, a: "grimhold", b: "furnace", v: 0.2758, ceiling: 0.2958 }, // carried (0.9.2 0.2758)
  { rule: "pacing", day: 3, a: "grimhold", b: "weaver", v: 0.9558, ceiling: 0.9758 }, // carried (0.9.2 0.9558)
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
