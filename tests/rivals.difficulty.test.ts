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
  // CATCHUP-098 (REQ-BFG-024; the captain pass on 0.9.7's rules, backlog #377; cap's rulings 3c58471c74bdc4ed Q4 (i) and
  // REVIEW-CATCHUP097 ruling 3: walls, the Hard band and the named stand-ins rank before the ladder): re-measured at
  // catchup098 13ec8db (the FURNACE par count re-fit, the day-10 lever, MOTH QUEEN's day-4 SPLITTER (cap's yes for roadCap,
  // bc842e7024551665), the day-5 same-price swaps, LONGTOOTH's BELLOWS and riveter (cap's yes,
  // 112bc3b7a16e38fa), the named stand-ins' dusk decks, the Iron Matriarch's day-9 plate) with kit098's collector, an
  // uncommitted copy of these rules with no exception list (W/output-c098/ladder/ladder-13ec8db.json): 105 -> 100 entries,
  // ceiling = measured v + 0.02. By rule (r097 236ac6f -> now): easyOverHard 81 -> 75, parBeatsEasy 6 -> 6, parLosesToHard
  // 2 -> 2, slotGap 5 -> 6, poolBand 2 -> 2, matriarchLowest 7 -> 7, pacing 2 -> 2. Out (pass now) 6: easyOverHard d3
  // BRASSWICK, GRUBNOSE and NETTLE v LONGTOOTH, d4 BRASSWICK v LONGTOOTH (his BELLOWS), d4 GRUBNOSE v BULWARK (his KEG), d4
  // RATCHET v MOTH QUEEN (her SPLITTER). New 1: slotGap d10 easy / medium (SOOTJAW's and SPARKFANG's day-10 packs, the par
  // count re-fit). BRASSWICK's TWIN MOULD waits (ruling 3: the named stand-ins don't hold 36 on days 4-5). Each line's
  // comment: "carried" (in the list at 236ac6f, its v there) and, where v moved, what moved it. Before, CATCHUP-097's note:
  // CATCHUP-097 (REQ-BFG-024; the captains' re-plan on release Z's field, backlog #362; cap's rulings 3c58471c74bdc4ed Q4
  // (i) and REVIEW-CATCHUP093 ruling 2: walls, the Hard band and the named stand-ins rank before the ladder): re-measured at
  // catchup097 d289ece (the day-5 walls' fallback 2 trims, OLD BULWARK's re-planned good-luck road deck, LONGTOOTH's two
  // (B) moves, the Iron Matriarch's day-8-10 plates) with kit097's collector, an uncommitted copy of these rules with no
  // exception list (W/output-c097/ladder/ladder-d289ece.json): 121 -> 105 entries, ceiling = measured v + 0.02. By rule
  // (zbump-accepted -> now): easyOverHard 90 -> 81, parBeatsEasy 6 -> 6, parLosesToHard 2 -> 2, slotGap 7 -> 5, poolBand
  // 2 -> 2, matriarchLowest 12 -> 7, pacing 2 -> 2. Out (pass now) 16: easyOverHard d4 GRUBNOSE and RATCHET v LONGTOOTH, d5
  // GRUBNOSE v BULWARK, d5 RATCHET v LONGTOOTH, d6 GRUBNOSE and RATCHET v BULWARK, d8 GRUBNOSE and NETTLE v BULWARK, d10
  // RATCHET v BULWARK (BULWARK's re-plan, LONGTOOTH's moves); matriarchLowest d8 SILKSHADE, d9 HIGHSPIRE, LONGTOOTH and MOTH
  // QUEEN, d10 THISTLEMAIL (her plates); slotGap d4 and d8 medium / hard. New 0. BRASSWICK's TWIN MOULD carries most of
  // what stays (58 of the 81 easyOverHard pairs): with the mould two days later his day-5 road deck reads 99 -> 55, but his
  // dusk deck 99 -> 63, which lowers the named stand-ins (REPORT section 5), so his plan is unchanged. Each line's comment:
  // "carried" (in the list at zbump-accepted, its v there) and, where v moved, what moved it. Before, CATCHUP-093's note:
  // CATCHUP-093 (REQ-BFG-024; release Y's captain pass, backlog #358; cap's rulings 3c58471c74bdc4ed Q4 (i) and Y7B2-Q4: this
  // pass owns the list from Y7b2's 126; HB 678fb328359e02f1): re-measured at catchup093 0a4ea7c (the walls' rune rules and
  // HIGHSPIRE's day-9 packs, fallback 2 to the par count, the (B) moves and the stand-in packs) with kit093's collector, an
  // uncommitted copy of these rules with no exception list (W/output-c093/ladder/ladder-ladder-3c.json): 126 -> 121 entries,
  // ceiling = measured v + 0.02. By rule (Y7b2 -> now): easyOverHard 96 -> 90, parBeatsEasy 6 -> 6, parLosesToHard 3 -> 2,
  // slotGap 7 -> 7, poolBand 2 -> 2, matriarchLowest 10 -> 12, pacing 2 -> 2. Out (pass now) 7: easyOverHard d4 BRASSWICK v
  // VOSS, d4 RATCHET v HIGHSPIRE, d5 GRUBNOSE v LONGTOOTH, d5 RATCHET v VOSS, d8 GRUBNOSE v KARSK, d9 GRUBNOSE v VOSS (the Hard
  // captains' fallback 2 and (B) moves); parLosesToHard d4. New 2: matriarchLowest d8 SILKSHADE and d9 LONGTOOTH (the
  // Matriarch's IRON SKIN rule, walls first). The Easy captains over the Hard ones stay: an Easy-captain rune rule (BRASSWICK's
  // pair runes, RATCHET's SEARING) clears some of them but lowers the named stand-ins on days 4-6, which rank before the
  // ladder (REPORT section 5). Each line's comment: "carried" (in Y7b2's list, its v there) or what moved it in. Before,
  // Y7b2's note:
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
  { rule: "easyOverHard", day: 1, a: "brasswick", b: "karsk", v: 0.0153, ceiling: 0.0353 }, // carried (0.9.7 0.0153)
  { rule: "easyOverHard", day: 1, a: "nettle", b: "highspire", v: 0.0249, ceiling: 0.0449 }, // carried (0.9.7 0.0249)
  { rule: "easyOverHard", day: 1, a: "nettle", b: "karsk", v: 0.1666, ceiling: 0.1866 }, // carried (0.9.7 0.1666)
  { rule: "easyOverHard", day: 1, a: "nettle", b: "mothqueen", v: 0.0542, ceiling: 0.0742 }, // carried (0.9.7 0.0542)
  { rule: "easyOverHard", day: 1, a: "ratchet", b: "karsk", v: 0.0586, ceiling: 0.0786 }, // carried (0.9.7 0.0586)
  { rule: "easyOverHard", day: 2, a: "brasswick", b: "karsk", v: 0.1921, ceiling: 0.2121 }, // carried (0.9.7 0.1921)
  { rule: "easyOverHard", day: 2, a: "brasswick", b: "longtooth", v: 0.0848, ceiling: 0.1048 }, // carried (0.9.7 0.0848)
  { rule: "easyOverHard", day: 2, a: "grubnose", b: "karsk", v: 0.0707, ceiling: 0.0907 }, // carried (0.9.7 0.0707)
  { rule: "easyOverHard", day: 2, a: "nettle", b: "karsk", v: 0.0095, ceiling: 0.0295 }, // carried (0.9.7 0.0095)
  { rule: "easyOverHard", day: 3, a: "brasswick", b: "bulwark", v: 0.1296, ceiling: 0.1496 }, // carried (0.9.7 0.2420); 0.2420 -> 0.1296: OLD BULWARK's VENOM DRIP -> POWDER KEG (target 3) and his day-8 / day-10 packs (target 2)
  { rule: "easyOverHard", day: 3, a: "brasswick", b: "highspire", v: 0.1525, ceiling: 0.1725 }, // carried (0.9.7 0.1525)
  { rule: "easyOverHard", day: 3, a: "brasswick", b: "karsk", v: 0.1667, ceiling: 0.1867 }, // carried (0.9.7 0.1667)
  { rule: "easyOverHard", day: 3, a: "brasswick", b: "mothqueen", v: 0.0863, ceiling: 0.1063 }, // carried (0.9.7 0.0863)
  { rule: "easyOverHard", day: 3, a: "brasswick", b: "voss", v: 0.1226, ceiling: 0.1426 }, // carried (0.9.7 0.1226)
  { rule: "easyOverHard", day: 3, a: "grubnose", b: "bulwark", v: 0.0231, ceiling: 0.0431 }, // carried (0.9.7 0.1356); 0.1356 -> 0.0231: OLD BULWARK's VENOM DRIP -> POWDER KEG (target 3) and his day-8 / day-10 packs (target 2)
  { rule: "easyOverHard", day: 3, a: "grubnose", b: "highspire", v: 0.0460, ceiling: 0.0660 }, // carried (0.9.7 0.0460)
  { rule: "easyOverHard", day: 3, a: "grubnose", b: "karsk", v: 0.0603, ceiling: 0.0803 }, // carried (0.9.7 0.0603)
  { rule: "easyOverHard", day: 3, a: "grubnose", b: "voss", v: 0.0161, ceiling: 0.0361 }, // carried (0.9.7 0.0161)
  { rule: "easyOverHard", day: 3, a: "ratchet", b: "bulwark", v: 0.1520, ceiling: 0.1720 }, // carried (0.9.7 0.2644); 0.2644 -> 0.1520: OLD BULWARK's VENOM DRIP -> POWDER KEG (target 3) and his day-8 / day-10 packs (target 2)
  { rule: "easyOverHard", day: 3, a: "ratchet", b: "highspire", v: 0.1749, ceiling: 0.1949 }, // carried (0.9.7 0.1749)
  { rule: "easyOverHard", day: 3, a: "ratchet", b: "karsk", v: 0.1891, ceiling: 0.2091 }, // carried (0.9.7 0.1891)
  { rule: "easyOverHard", day: 3, a: "ratchet", b: "longtooth", v: 0.0092, ceiling: 0.0292 }, // carried (0.9.7 0.4167); 0.4167 -> 0.0092: LONGTOOTH's re-plan (targets 2-4)
  { rule: "easyOverHard", day: 3, a: "ratchet", b: "mothqueen", v: 0.1086, ceiling: 0.1286 }, // carried (0.9.7 0.1086)
  { rule: "easyOverHard", day: 3, a: "ratchet", b: "silkshade", v: 0.0194, ceiling: 0.0394 }, // carried (0.9.7 0.0194)
  { rule: "easyOverHard", day: 3, a: "ratchet", b: "voss", v: 0.1450, ceiling: 0.1650 }, // carried (0.9.7 0.1450)
  { rule: "easyOverHard", day: 4, a: "brasswick", b: "bulwark", v: 0.2561, ceiling: 0.2761 }, // carried (0.9.7 0.3356); 0.3356 -> 0.2561: OLD BULWARK's VENOM DRIP -> POWDER KEG (target 3) and his day-8 / day-10 packs (target 2)
  { rule: "easyOverHard", day: 4, a: "brasswick", b: "highspire", v: 0.0065, ceiling: 0.0265 }, // carried (0.9.7 0.0065)
  { rule: "easyOverHard", day: 4, a: "brasswick", b: "karsk", v: 0.0181, ceiling: 0.0381 }, // carried (0.9.7 0.0181)
  { rule: "easyOverHard", day: 4, a: "brasswick", b: "mothqueen", v: 0.0125, ceiling: 0.0325 }, // carried (0.9.7 0.2618); 0.2618 -> 0.0125: MOTH QUEEN's SPLITTER on day 4 (target 3)
  { rule: "easyOverHard", day: 4, a: "ratchet", b: "bulwark", v: 0.0801, ceiling: 0.1001 }, // carried (0.9.7 0.1596); 0.1596 -> 0.0801: OLD BULWARK's VENOM DRIP -> POWDER KEG (target 3) and his day-8 / day-10 packs (target 2)
  { rule: "easyOverHard", day: 5, a: "brasswick", b: "bulwark", v: 0.5542, ceiling: 0.5742 }, // carried (0.9.7 0.5842); 0.5842 -> 0.5542: OLD BULWARK's VENOM DRIP -> POWDER KEG (target 3) and his day-8 / day-10 packs (target 2)
  { rule: "easyOverHard", day: 5, a: "brasswick", b: "highspire", v: 0.4179, ceiling: 0.4379 }, // carried (0.9.7 0.4179)
  { rule: "easyOverHard", day: 5, a: "brasswick", b: "karsk", v: 0.4489, ceiling: 0.4689 }, // carried (0.9.7 0.4489)
  { rule: "easyOverHard", day: 5, a: "brasswick", b: "longtooth", v: 0.3229, ceiling: 0.3429 }, // carried (0.9.7 0.4823); 0.4823 -> 0.3229: LONGTOOTH's re-plan (targets 2-4)
  { rule: "easyOverHard", day: 5, a: "brasswick", b: "mothqueen", v: 0.3053, ceiling: 0.3253 }, // carried (0.9.7 0.3053)
  { rule: "easyOverHard", day: 5, a: "brasswick", b: "silkshade", v: 0.4992, ceiling: 0.5192 }, // carried (0.9.7 0.4992)
  { rule: "easyOverHard", day: 5, a: "brasswick", b: "voss", v: 0.4697, ceiling: 0.4897 }, // carried (0.9.7 0.5034); 0.5034 -> 0.4697: MASTER VOSS's COUNTERWEIGHT -> VENOM DRIP (target 3) and day-10 LIMPET WORKS (target 2)
  { rule: "easyOverHard", day: 5, a: "ratchet", b: "bulwark", v: 0.0293, ceiling: 0.0493 }, // carried (0.9.7 0.0593); 0.0593 -> 0.0293: OLD BULWARK's VENOM DRIP -> POWDER KEG (target 3) and his day-8 / day-10 packs (target 2)
  { rule: "easyOverHard", day: 6, a: "brasswick", b: "bulwark", v: 0.4047, ceiling: 0.4247 }, // carried (0.9.7 0.4227); 0.4227 -> 0.4047: OLD BULWARK's VENOM DRIP -> POWDER KEG (target 3) and his day-8 / day-10 packs (target 2)
  { rule: "easyOverHard", day: 6, a: "brasswick", b: "highspire", v: 0.3464, ceiling: 0.3664 }, // carried (0.9.7 0.3464)
  { rule: "easyOverHard", day: 6, a: "brasswick", b: "karsk", v: 0.4270, ceiling: 0.4470 }, // carried (0.9.7 0.4270)
  { rule: "easyOverHard", day: 6, a: "brasswick", b: "longtooth", v: 0.3071, ceiling: 0.3271 }, // carried (0.9.7 0.4145); 0.4145 -> 0.3071: LONGTOOTH's re-plan (targets 2-4)
  { rule: "easyOverHard", day: 6, a: "brasswick", b: "mothqueen", v: 0.3357, ceiling: 0.3557 }, // carried (0.9.7 0.3357)
  { rule: "easyOverHard", day: 6, a: "brasswick", b: "silkshade", v: 0.0746, ceiling: 0.0946 }, // carried (0.9.7 0.0746)
  { rule: "easyOverHard", day: 6, a: "brasswick", b: "voss", v: 0.3202, ceiling: 0.3402 }, // carried (0.9.7 0.2861); 0.2861 -> 0.3202: MASTER VOSS's COUNTERWEIGHT -> VENOM DRIP (target 3) and day-10 LIMPET WORKS (target 2)
  { rule: "easyOverHard", day: 7, a: "brasswick", b: "bulwark", v: 0.2304, ceiling: 0.2504 }, // carried (0.9.7 0.2433); 0.2433 -> 0.2304: OLD BULWARK's VENOM DRIP -> POWDER KEG (target 3) and his day-8 / day-10 packs (target 2)
  { rule: "easyOverHard", day: 7, a: "brasswick", b: "highspire", v: 0.2382, ceiling: 0.2582 }, // carried (0.9.7 0.2382)
  { rule: "easyOverHard", day: 7, a: "brasswick", b: "karsk", v: 0.3201, ceiling: 0.3401 }, // carried (0.9.7 0.3201)
  { rule: "easyOverHard", day: 7, a: "brasswick", b: "longtooth", v: 0.2136, ceiling: 0.2336 }, // carried (0.9.7 0.2394); 0.2394 -> 0.2136: LONGTOOTH's re-plan (targets 2-4)
  { rule: "easyOverHard", day: 7, a: "brasswick", b: "mothqueen", v: 0.1711, ceiling: 0.1911 }, // carried (0.9.7 0.1711)
  { rule: "easyOverHard", day: 7, a: "brasswick", b: "silkshade", v: 0.1791, ceiling: 0.1991 }, // carried (0.9.7 0.1791)
  { rule: "easyOverHard", day: 7, a: "brasswick", b: "voss", v: 0.2557, ceiling: 0.2757 }, // carried (0.9.7 0.1744); 0.1744 -> 0.2557: MASTER VOSS's COUNTERWEIGHT -> VENOM DRIP (target 3) and day-10 LIMPET WORKS (target 2)
  { rule: "easyOverHard", day: 8, a: "brasswick", b: "bulwark", v: 0.2959, ceiling: 0.3159 }, // carried (0.9.7 0.2741); 0.2741 -> 0.2959: OLD BULWARK's VENOM DRIP -> POWDER KEG (target 3) and his day-8 / day-10 packs (target 2)
  { rule: "easyOverHard", day: 8, a: "brasswick", b: "highspire", v: 0.3180, ceiling: 0.3380 }, // carried (0.9.7 0.3180)
  { rule: "easyOverHard", day: 8, a: "brasswick", b: "karsk", v: 0.3824, ceiling: 0.4024 }, // carried (0.9.7 0.3824)
  { rule: "easyOverHard", day: 8, a: "brasswick", b: "longtooth", v: 0.3167, ceiling: 0.3367 }, // carried (0.9.7 0.3068); 0.3068 -> 0.3167: LONGTOOTH's re-plan (targets 2-4)
  { rule: "easyOverHard", day: 8, a: "brasswick", b: "matriarch", v: 0.1696, ceiling: 0.1896 }, // carried (0.9.7 0.1696)
  { rule: "easyOverHard", day: 8, a: "brasswick", b: "mothqueen", v: 0.2799, ceiling: 0.2999 }, // carried (0.9.7 0.2799)
  { rule: "easyOverHard", day: 8, a: "brasswick", b: "silkshade", v: 0.1818, ceiling: 0.2018 }, // carried (0.9.7 0.1818)
  { rule: "easyOverHard", day: 8, a: "brasswick", b: "voss", v: 0.2589, ceiling: 0.2789 }, // carried (0.9.7 0.2573); 0.2573 -> 0.2589: MASTER VOSS's COUNTERWEIGHT -> VENOM DRIP (target 3) and day-10 LIMPET WORKS (target 2)
  { rule: "easyOverHard", day: 9, a: "brasswick", b: "bulwark", v: 0.2190, ceiling: 0.2390 }, // carried (0.9.7 0.2201); 0.2201 -> 0.2190: OLD BULWARK's VENOM DRIP -> POWDER KEG (target 3) and his day-8 / day-10 packs (target 2)
  { rule: "easyOverHard", day: 9, a: "brasswick", b: "highspire", v: 0.2508, ceiling: 0.2708 }, // carried (0.9.7 0.2508)
  { rule: "easyOverHard", day: 9, a: "brasswick", b: "karsk", v: 0.2676, ceiling: 0.2876 }, // carried (0.9.7 0.2676)
  { rule: "easyOverHard", day: 9, a: "brasswick", b: "longtooth", v: 0.2442, ceiling: 0.2642 }, // carried (0.9.7 0.2335); 0.2335 -> 0.2442: LONGTOOTH's re-plan (targets 2-4)
  { rule: "easyOverHard", day: 9, a: "brasswick", b: "matriarch", v: 0.1614, ceiling: 0.1814 }, // carried (0.9.7 0.1910); 0.1910 -> 0.1614: the Iron Matriarch's day-9 plate (target 6)
  { rule: "easyOverHard", day: 9, a: "brasswick", b: "mothqueen", v: 0.1976, ceiling: 0.2176 }, // carried (0.9.7 0.1976)
  { rule: "easyOverHard", day: 9, a: "brasswick", b: "silkshade", v: 0.0018, ceiling: 0.0218 }, // carried (0.9.7 0.0018)
  { rule: "easyOverHard", day: 9, a: "brasswick", b: "voss", v: 0.2993, ceiling: 0.3193 }, // carried (0.9.7 0.2827); 0.2827 -> 0.2993: MASTER VOSS's COUNTERWEIGHT -> VENOM DRIP (target 3) and day-10 LIMPET WORKS (target 2)
  { rule: "easyOverHard", day: 10, a: "brasswick", b: "bulwark", v: 0.0853, ceiling: 0.1053 }, // carried (0.9.7 0.0630); 0.0630 -> 0.0853: OLD BULWARK's VENOM DRIP -> POWDER KEG (target 3) and his day-8 / day-10 packs (target 2)
  { rule: "easyOverHard", day: 10, a: "brasswick", b: "highspire", v: 0.1241, ceiling: 0.1441 }, // carried (0.9.7 0.1241)
  { rule: "easyOverHard", day: 10, a: "brasswick", b: "karsk", v: 0.2118, ceiling: 0.2318 }, // carried (0.9.7 0.2118)
  { rule: "easyOverHard", day: 10, a: "brasswick", b: "longtooth", v: 0.1633, ceiling: 0.1833 }, // carried (0.9.7 0.1394); 0.1394 -> 0.1633: LONGTOOTH's re-plan (targets 2-4)
  { rule: "easyOverHard", day: 10, a: "brasswick", b: "matriarch", v: 0.0151, ceiling: 0.0351 }, // carried (0.9.7 0.0151)
  { rule: "easyOverHard", day: 10, a: "brasswick", b: "mothqueen", v: 0.1429, ceiling: 0.1629 }, // carried (0.9.7 0.1429)
  { rule: "easyOverHard", day: 10, a: "brasswick", b: "voss", v: 0.0489, ceiling: 0.0689 }, // carried (0.9.7 0.1775); 0.1775 -> 0.0489: MASTER VOSS's COUNTERWEIGHT -> VENOM DRIP (target 3) and day-10 LIMPET WORKS (target 2)
  { rule: "matriarchLowest", day: 8, a: "brasswick", v: 0.1696, ceiling: 0.1896 }, // carried (0.9.7 0.1696)
  { rule: "matriarchLowest", day: 8, a: "sootjaw", v: 0.0298, ceiling: 0.0498 }, // carried (0.9.7 0.0298)
  { rule: "matriarchLowest", day: 9, a: "brasswick", v: 0.1614, ceiling: 0.1814 }, // carried (0.9.7 0.1910); 0.1910 -> 0.1614: the Iron Matriarch's day-9 plate (target 6)
  { rule: "matriarchLowest", day: 9, a: "silkshade", v: 0.1596, ceiling: 0.1796 }, // carried (0.9.7 0.1892); 0.1892 -> 0.1596: the Iron Matriarch's day-9 plate (target 6)
  { rule: "matriarchLowest", day: 9, a: "thistlemail", v: 0.0076, ceiling: 0.0276 }, // carried (0.9.7 0.0372); 0.0372 -> 0.0076: the Iron Matriarch's day-9 plate (target 6)
  { rule: "matriarchLowest", day: 10, a: "brasswick", v: 0.0151, ceiling: 0.0351 }, // carried (0.9.7 0.0151)
  { rule: "matriarchLowest", day: 10, a: "silkshade", v: 0.0524, ceiling: 0.0724 }, // carried (0.9.7 0.0524)
  { rule: "pacing", day: 3, a: "grimhold", b: "furnace", v: 0.2758, ceiling: 0.2958 }, // carried (0.9.7 0.2758); pacing pin, cap's ruling ebdb9a49d368e029
  { rule: "pacing", day: 3, a: "grimhold", b: "weaver", v: 0.9558, ceiling: 0.9758 }, // carried (0.9.7 0.9558); pacing pin, cap's ruling ebdb9a49d368e029
  { rule: "parBeatsEasy", day: 5, v: 0.0877, ceiling: 0.1077 }, // carried (0.9.7 0.0747); 0.0747 -> 0.0877: the slots' means (this pass's Hard decks; NETTLE's and EMBERLYN's dusk decks, target 4)
  { rule: "parBeatsEasy", day: 6, v: 0.1275, ceiling: 0.1475 }, // carried (0.9.7 0.0595); 0.0595 -> 0.1275: the slots' means (this pass's Hard decks; NETTLE's and EMBERLYN's dusk decks, target 4)
  { rule: "parBeatsEasy", day: 7, v: 0.2045, ceiling: 0.2245 }, // carried (0.9.7 0.1946); 0.1946 -> 0.2045: the slots' means (this pass's Hard decks; NETTLE's and EMBERLYN's dusk decks, target 4)
  { rule: "parBeatsEasy", day: 8, v: 0.2483, ceiling: 0.2683 }, // carried (0.9.7 0.2361); 0.2361 -> 0.2483: the slots' means (this pass's Hard decks; NETTLE's and EMBERLYN's dusk decks, target 4)
  { rule: "parBeatsEasy", day: 9, v: 0.1614, ceiling: 0.1814 }, // carried (0.9.7 0.1502); 0.1502 -> 0.1614: the slots' means (this pass's Hard decks; NETTLE's and EMBERLYN's dusk decks, target 4)
  { rule: "parBeatsEasy", day: 10, v: 0.1267, ceiling: 0.1467 }, // carried (0.9.7 0.1193); 0.1193 -> 0.1267: the slots' means (this pass's Hard decks; NETTLE's and EMBERLYN's dusk decks, target 4)
  { rule: "parLosesToHard", day: 2, v: 0.1417, ceiling: 0.1617 }, // carried (0.9.7 0.1417)
  { rule: "parLosesToHard", day: 3, v: 0.1613, ceiling: 0.1813 }, // carried (0.9.7 0.2356); 0.2356 -> 0.1613: the slots' means (this pass's Hard decks; NETTLE's and EMBERLYN's dusk decks, target 4)
  { rule: "poolBand", day: 1, v: 0.0266, ceiling: 0.0466 }, // carried (0.9.7 0.0266)
  { rule: "poolBand", day: 8, v: 0.0058, ceiling: 0.0258 }, // carried (0.9.7 0.0122); 0.0122 -> 0.0058: the slots' means (this pass's Hard decks; NETTLE's and EMBERLYN's dusk decks, target 4)
  { rule: "slotGap", day: 2, a: "medium", b: "hard", v: 0.0464, ceiling: 0.0664 }, // carried (0.9.7 0.0464)
  { rule: "slotGap", day: 3, a: "medium", b: "hard", v: 0.2016, ceiling: 0.2216 }, // carried (0.9.7 0.2759); 0.2759 -> 0.2016: the slots' means (this pass's Hard decks; NETTLE's and EMBERLYN's dusk decks, target 4)
  { rule: "slotGap", day: 5, a: "easy", b: "medium", v: 0.1465, ceiling: 0.1665 }, // carried (0.9.7 0.1488); 0.1488 -> 0.1465: the slots' means (this pass's Hard decks; NETTLE's and EMBERLYN's dusk decks, target 4)
  { rule: "slotGap", day: 6, a: "easy", b: "medium", v: 0.1097, ceiling: 0.1297 }, // carried (0.9.7 0.0326); 0.0326 -> 0.1097: the slots' means (this pass's Hard decks; NETTLE's and EMBERLYN's dusk decks, target 4)
  { rule: "slotGap", day: 7, a: "easy", b: "medium", v: 0.0064, ceiling: 0.0264 }, // carried (0.9.7 0.0033); 0.0033 -> 0.0064: the slots' means (this pass's Hard decks; NETTLE's and EMBERLYN's dusk decks, target 4)
  { rule: "slotGap", day: 10, a: "easy", b: "medium", v: 0.0234, ceiling: 0.0434 }, // new: SOOTJAW's and SPARKFANG's day-10 packs (target 2: the FURNACE par count)
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
