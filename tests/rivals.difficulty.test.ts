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
  // S8b (REQ-BFG-092; BRIEF-S8 S8b, Y7b2 step 8's re-measure; R3's LADDER_X_OPEN form: RULING-HULLON-R3 section 3 and R13
  // Q9 (b)): re-measured at s8 c1c93e4 (the regenerated stand-in pool P1 83c039d and seed pool c6d3445) with an uncommitted
  // copy of these rules with no exception list (B/output-s8/logs/r3x-coll-c1c93e4.r3x.txt): 104 -> 64 entries, ceiling =
  // measured v + 0.02. By rule (HULL-ON H4's list -> now): easyOverHard 75 -> 46, matriarchLowest 7 -> 0, pacing 5 -> 5 (no
  // new pacing pair), parBeatsEasy 6 -> 0, parLosesToHard 2 -> 4, poolBand 2 -> 4, slotGap 7 -> 5. The cause, read with the
  // same collector at each step: the pools move nothing here (7cc41c6, 83c039d and c1c93e4 read line for line the same).
  // What moved, moved before s8-base e866408 ("s8-base": the 0.9.9 flips, AZ-BUMP's, HULL-ON's and SHAPES' worlds merged at
  // MERGE-099F; the file was red there, its LADDER_X_OPEN test stopping at its first line) or, on days 7-10 only, after it:
  // "FIT-099" (S8 T3's merge acdae00: KARSK's day-10 road PvE plates, D days 3-5) and "CAPTAIN_RUNES" (S8 lane 2's
  // regeneration, a9dfbcb). Out (pass now) 62: easyOverHard 44 (d1 1, d2 2, d3 8, d4 5, d6 3, d7 6, d8 7, d9 6, d10 6),
  // matriarchLowest 7, parBeatsEasy 6, poolBand d8, slotGap easy / medium d5, d6, d7 and d10. New 22, each red at s8-base
  // already: easyOverHard 15, parLosesToHard d4 and d5, poolBand d2-d4, slotGap medium / hard d5 and d7. Over the old
  // ceiling 7: easyOverHard d3 GRUBNOSE v BULWARK and RATCHET v SILKSHADE, pacing d3 GRIMHOLD v both decks (HULL-ON:
  // hullon-accepted 1e5fe4f reads both), parLosesToHard d2 and d3, poolBand d1. R13's three pacing pins read their v
  // unchanged; its slotGap d4 0.0763 -> 0.0721. No captain was tuned. Each line's comment: "carried (its old v)" or "new",
  // then each move "-> v step"; beside s8-base, the v on its two merged lines, both on AZ-BUMP (merge base c44046f):
  // HULL-ON's (hullon-accepted 1e5fe4f) and c099's with SHAPES before MERGE-099F (41a600a); "passes" = the rule holds
  // there (a v under 0 likewise). Before, CATCHUP-098's note:
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
  { rule: "easyOverHard", day: 1, a: "nettle", b: "highspire", v: 0.0183, ceiling: 0.0383 }, // carried (0.0249); 0.0249 -> 0.0183 s8-base (1e5fe4f 0.0212, 41a600a 0.0224)
  { rule: "easyOverHard", day: 1, a: "nettle", b: "karsk", v: 0.0114, ceiling: 0.0314 }, // carried (0.1666); 0.1666 -> 0.0114 s8-base (1e5fe4f -0.0098, 41a600a 0.1520)
  { rule: "easyOverHard", day: 1, a: "nettle", b: "mothqueen", v: 0.0252, ceiling: 0.0452 }, // carried (0.0542); 0.0542 -> 0.0252 s8-base (1e5fe4f 0.0408, 41a600a 0.0454)
  { rule: "easyOverHard", day: 1, a: "ratchet", b: "highspire", v: 0.0356, ceiling: 0.0556 }, // new (red at s8-base: 0.0356; 1e5fe4f 0.0168, 41a600a passes)
  { rule: "easyOverHard", day: 1, a: "ratchet", b: "karsk", v: 0.0288, ceiling: 0.0488 }, // carried (0.0586); 0.0586 -> 0.0288 s8-base (1e5fe4f -0.0142, 41a600a 0.0704)
  { rule: "easyOverHard", day: 1, a: "ratchet", b: "mothqueen", v: 0.0426, ceiling: 0.0626 }, // new (red at s8-base: 0.0426; 1e5fe4f 0.0364, 41a600a passes)
  { rule: "easyOverHard", day: 2, a: "brasswick", b: "bulwark", v: 0.0185, ceiling: 0.0385 }, // new (red at s8-base: 0.0185; 1e5fe4f passes, 41a600a passes)
  { rule: "easyOverHard", day: 2, a: "brasswick", b: "highspire", v: 0.0462, ceiling: 0.0662 }, // new (red at s8-base: 0.0462; 1e5fe4f 0.0926, 41a600a 0.0399)
  { rule: "easyOverHard", day: 2, a: "brasswick", b: "karsk", v: 0.0315, ceiling: 0.0515 }, // carried (0.1921); 0.1921 -> 0.0315 s8-base (1e5fe4f 0.0431, 41a600a 0.1107)
  { rule: "easyOverHard", day: 2, a: "brasswick", b: "longtooth", v: 0.0482, ceiling: 0.0682 }, // carried (0.0848); 0.0848 -> 0.0482 s8-base (1e5fe4f 0.0883, 41a600a 0.0634)
  { rule: "easyOverHard", day: 2, a: "brasswick", b: "mothqueen", v: 0.0383, ceiling: 0.0583 }, // new (red at s8-base: 0.0383; 1e5fe4f 0.0589, 41a600a 0.0272)
  { rule: "easyOverHard", day: 3, a: "brasswick", b: "bulwark", v: 0.0601, ceiling: 0.0801 }, // carried (0.1296); 0.1296 -> 0.0601 s8-base (1e5fe4f 0.0803, 41a600a -0.0250)
  { rule: "easyOverHard", day: 3, a: "brasswick", b: "highspire", v: 0.0427, ceiling: 0.0627 }, // carried (0.1525); 0.1525 -> 0.0427 s8-base (1e5fe4f 0.0378, 41a600a -0.0838)
  { rule: "easyOverHard", day: 3, a: "grubnose", b: "bulwark", v: 0.0494, ceiling: 0.0694 }, // carried (0.0231); 0.0231 -> 0.0494 s8-base (1e5fe4f 0.0075, 41a600a 0.0172)
  { rule: "easyOverHard", day: 3, a: "grubnose", b: "highspire", v: 0.0320, ceiling: 0.0520 }, // carried (0.0460); 0.0460 -> 0.0320 s8-base (1e5fe4f -0.0350, 41a600a -0.0417)
  { rule: "easyOverHard", day: 3, a: "ratchet", b: "bulwark", v: 0.1244, ceiling: 0.1444 }, // carried (0.1520); 0.1520 -> 0.1244 s8-base (1e5fe4f 0.1343, 41a600a 0.1218)
  { rule: "easyOverHard", day: 3, a: "ratchet", b: "highspire", v: 0.1070, ceiling: 0.1270 }, // carried (0.1749); 0.1749 -> 0.1070 s8-base (1e5fe4f 0.0918, 41a600a 0.0629)
  { rule: "easyOverHard", day: 3, a: "ratchet", b: "mothqueen", v: 0.0539, ceiling: 0.0739 }, // carried (0.1086); 0.1086 -> 0.0539 s8-base (1e5fe4f 0.0604, 41a600a 0.0768)
  { rule: "easyOverHard", day: 3, a: "ratchet", b: "silkshade", v: 0.0537, ceiling: 0.0737 }, // carried (0.0194); 0.0194 -> 0.0537 s8-base (1e5fe4f 0.0225, 41a600a 0.0392)
  { rule: "easyOverHard", day: 5, a: "brasswick", b: "bulwark", v: 0.2992, ceiling: 0.3192 }, // carried (0.5542); 0.5542 -> 0.2992 s8-base (1e5fe4f 0.3670, 41a600a 0.1560)
  { rule: "easyOverHard", day: 5, a: "brasswick", b: "highspire", v: 0.1014, ceiling: 0.1214 }, // carried (0.4179); 0.4179 -> 0.1014 s8-base (1e5fe4f 0.0458, 41a600a -0.0420)
  { rule: "easyOverHard", day: 5, a: "brasswick", b: "karsk", v: 0.0511, ceiling: 0.0711 }, // carried (0.4489); 0.4489 -> 0.0511 s8-base (1e5fe4f 0.1612, 41a600a 0.0151)
  { rule: "easyOverHard", day: 5, a: "brasswick", b: "longtooth", v: 0.0951, ceiling: 0.1151 }, // carried (0.3229); 0.3229 -> 0.0951 s8-base (1e5fe4f 0.1325, 41a600a -0.0144)
  { rule: "easyOverHard", day: 5, a: "brasswick", b: "mothqueen", v: 0.0968, ceiling: 0.1168 }, // carried (0.3053); 0.3053 -> 0.0968 s8-base (1e5fe4f 0.0386, 41a600a 0.0281)
  { rule: "easyOverHard", day: 5, a: "brasswick", b: "silkshade", v: 0.1294, ceiling: 0.1494 }, // carried (0.4992); 0.4992 -> 0.1294 s8-base (1e5fe4f 0.1613, 41a600a -0.0804)
  { rule: "easyOverHard", day: 5, a: "brasswick", b: "voss", v: 0.3499, ceiling: 0.3699 }, // carried (0.4697); 0.4697 -> 0.3499 s8-base (1e5fe4f 0.2542, 41a600a 0.2801)
  { rule: "easyOverHard", day: 5, a: "ratchet", b: "bulwark", v: 0.0387, ceiling: 0.0587 }, // carried (0.0293); 0.0293 -> 0.0387 s8-base (1e5fe4f 0.0231, 41a600a -0.0379)
  { rule: "easyOverHard", day: 5, a: "ratchet", b: "voss", v: 0.0894, ceiling: 0.1094 }, // new (red at s8-base: 0.0894; 1e5fe4f passes, 41a600a 0.0862)
  { rule: "easyOverHard", day: 6, a: "brasswick", b: "bulwark", v: 0.2302, ceiling: 0.2502 }, // carried (0.4047); 0.4047 -> 0.2302 s8-base (1e5fe4f 0.3318, 41a600a 0.1521)
  { rule: "easyOverHard", day: 6, a: "brasswick", b: "karsk", v: 0.1999, ceiling: 0.2199 }, // carried (0.4270); 0.4270 -> 0.1999 s8-base (1e5fe4f 0.1921, 41a600a 0.1643)
  { rule: "easyOverHard", day: 6, a: "brasswick", b: "longtooth", v: 0.1683, ceiling: 0.1883 }, // carried (0.3071); 0.3071 -> 0.1683 s8-base (1e5fe4f 0.2297, 41a600a 0.0936)
  { rule: "easyOverHard", day: 6, a: "brasswick", b: "mothqueen", v: 0.0741, ceiling: 0.0941 }, // carried (0.3357); 0.3357 -> 0.0741 s8-base (1e5fe4f 0.0698, 41a600a 0.0557)
  { rule: "easyOverHard", day: 6, a: "grubnose", b: "bulwark", v: 0.0155, ceiling: 0.0355 }, // new (red at s8-base: 0.0155; 1e5fe4f 0.0673, 41a600a passes)
  { rule: "easyOverHard", day: 7, a: "brasswick", b: "karsk", v: 0.0221, ceiling: 0.0421 }, // carried (0.3201); 0.3201 -> 0.0221 s8-base (1e5fe4f 0.0336, 41a600a -0.0464)
  { rule: "easyOverHard", day: 7, a: "nettle", b: "karsk", v: 0.0035, ceiling: 0.0235 }, // new (red at s8-base: 0.0035; 1e5fe4f passes, 41a600a 0.0006)
  { rule: "easyOverHard", day: 8, a: "brasswick", b: "longtooth", v: 0.0233, ceiling: 0.0433 }, // carried (0.3167); 0.3167 -> 0.0192 s8-base (1e5fe4f 0.0838, 41a600a -0.0056) -> 0.0233 FIT-099
  { rule: "easyOverHard", day: 8, a: "grubnose", b: "longtooth", v: 0.1931, ceiling: 0.2131 }, // new (red at s8-base: 0.2107; 1e5fe4f 0.2037, 41a600a passes) -> 0.1931 FIT-099
  { rule: "easyOverHard", day: 9, a: "brasswick", b: "karsk", v: 0.2157, ceiling: 0.2357 }, // carried (0.2676); 0.2676 -> 0.1736 s8-base (1e5fe4f 0.0160, 41a600a 0.1339) -> 0.2157 FIT-099
  { rule: "easyOverHard", day: 9, a: "brasswick", b: "longtooth", v: 0.2107, ceiling: 0.2307 }, // carried (0.2442); 0.2442 -> 0.1606 s8-base (1e5fe4f 0.0842, 41a600a 0.0980) -> 0.2107 FIT-099
  { rule: "easyOverHard", day: 9, a: "grubnose", b: "karsk", v: 0.2101, ceiling: 0.2301 }, // new (red at s8-base: 0.2148; 1e5fe4f passes, 41a600a 0.0739) -> 0.2101 FIT-099
  { rule: "easyOverHard", day: 9, a: "grubnose", b: "longtooth", v: 0.2051, ceiling: 0.2251 }, // new (red at s8-base: 0.2018; 1e5fe4f 0.0268, 41a600a 0.0380) -> 0.2051 FIT-099
  { rule: "easyOverHard", day: 10, a: "brasswick", b: "karsk", v: 0.0209, ceiling: 0.0409 }, // carried (0.2118); 0.2118 -> -0.0089 s8-base (1e5fe4f -0.0977, 41a600a 0.0583) -> 0.0209 FIT-099
  { rule: "easyOverHard", day: 10, a: "grubnose", b: "karsk", v: 0.1567, ceiling: 0.1767 }, // new (red at s8-base: 0.1320; 1e5fe4f passes, 41a600a passes) -> 0.1567 FIT-099
  { rule: "easyOverHard", day: 10, a: "grubnose", b: "longtooth", v: 0.0551, ceiling: 0.0751 }, // new (red at s8-base: 0.0645; 1e5fe4f passes, 41a600a passes) -> 0.0551 FIT-099
  { rule: "easyOverHard", day: 10, a: "ratchet", b: "karsk", v: 0.1363, ceiling: 0.1563 }, // new (red at s8-base: 0.0866; 1e5fe4f passes, 41a600a 0.1535) -> 0.1355 FIT-099 -> 0.1363 CAPTAIN_RUNES
  { rule: "easyOverHard", day: 10, a: "ratchet", b: "longtooth", v: 0.0347, ceiling: 0.0547 }, // new (red at s8-base: 0.0192; 1e5fe4f passes, 41a600a 0.1646) -> 0.0339 FIT-099 -> 0.0347 CAPTAIN_RUNES
  { rule: "pacing", day: 3, a: "grimhold", b: "furnace", v: 2.5175, ceiling: 2.5375 }, // carried (0.2758); 0.2758 -> 2.5175 s8-base (1e5fe4f 2.5175, 41a600a 0.2758)
  { rule: "pacing", day: 3, a: "grimhold", b: "weaver", v: 4.7292, ceiling: 4.7492 }, // carried (0.9558); 0.9558 -> 4.7292 s8-base (1e5fe4f 4.7292, 41a600a 0.9558)
  // HULL-ON H4, the captains pass (REQ-BFG-092; cap's rulings 6f4568477e66a600 = RULING-HULLON-R3 section 3's fallback and
  // ed10dd26da1a89fb = RULING-HULLON-R13 Q9 (b)): three pacing pins, each v measured on the captains commit, ceiling v + 0.02.
  // No captain number reaches them: GRIMHOLD has no count or level on days 1-2 (his first pack is day 3), and SOOTJAW has
  // none that slows his day-3 damage. The bounds stay (15-45 s).
  { rule: "pacing", day: 2, a: "grimhold", b: "furnace", v: 0.2783, ceiling: 0.2983 }, // cause GUARD (R3: 16.26 s with GUARD off); 14.7217 s, as at c4e8504
  { rule: "pacing", day: 2, a: "grimhold", b: "weaver", v: 0.2867, ceiling: 0.3067 }, // cause GUARD with FREE_JOINS (WEAVER's pacing deck at FREE_JOINS_HULL's 1500): 14.7133 s; holds with either off (GUARD off 19.2 s, FREE_JOINS_HULL = {} 16.3 s)
  { rule: "pacing", day: 3, a: "sootjaw", b: "weaver", v: 1.3167, ceiling: 1.3367 }, // cause FREE_JOINS (WEAVER's pacing deck at FREE_JOINS_HULL's 1500): 13.6833 s; holds with FREE_JOINS_HULL = {}, fails with GUARD off too
  { rule: "parLosesToHard", day: 2, v: 0.3170, ceiling: 0.3370 }, // carried (0.1417); 0.1417 -> 0.3170 s8-base (1e5fe4f 0.2599, 41a600a 0.2390)
  { rule: "parLosesToHard", day: 3, v: 0.2462, ceiling: 0.2662 }, // carried (0.1613); 0.1613 -> 0.2462 s8-base (1e5fe4f 0.2299, 41a600a 0.1733)
  { rule: "parLosesToHard", day: 4, v: 0.0222, ceiling: 0.0422 }, // new (red at s8-base: 0.0222; 1e5fe4f 0.0480, 41a600a passes)
  { rule: "parLosesToHard", day: 5, v: 0.0878, ceiling: 0.1078 }, // new (red at s8-base: 0.0878; 1e5fe4f 0.1085, 41a600a 0.0519)
  { rule: "poolBand", day: 1, v: 0.0934, ceiling: 0.1134 }, // carried (0.0266); 0.0266 -> 0.0934 s8-base (1e5fe4f 0.0633, 41a600a 0.0486)
  { rule: "poolBand", day: 2, v: 0.0760, ceiling: 0.0960 }, // new (red at s8-base: 0.0760; 1e5fe4f 0.0307, 41a600a 0.0182)
  { rule: "poolBand", day: 3, v: 0.1137, ceiling: 0.1337 }, // new (red at s8-base: 0.1137; 1e5fe4f 0.0971, 41a600a 0.0428)
  { rule: "poolBand", day: 4, v: 0.0036, ceiling: 0.0236 }, // new (red at s8-base: 0.0036; 1e5fe4f 0.0018, 41a600a passes)
  { rule: "slotGap", day: 2, a: "medium", b: "hard", v: 0.0601, ceiling: 0.0801 }, // carried (0.0464); 0.0464 -> 0.0601 s8-base (1e5fe4f 0.0363, 41a600a 0.0033)
  { rule: "slotGap", day: 3, a: "medium", b: "hard", v: 0.0605, ceiling: 0.0805 }, // carried (0.2016); 0.2016 -> 0.0605 s8-base (1e5fe4f 0.0738, 41a600a 0.0362)
  // HULL-ON H4, the captains pass (cap's rulings 6f4568477e66a600 = R3 section 3's fallback and ed10dd26da1a89fb = R13 Q9
  // (b)): v measured on the captains commit, ceiling v + 0.02. Cause GUARD (R3: +0.063 with GUARD off at the flip) with
  // FREE_JOINS a co-cause (WEAVER's hull at FREE_JOINS_HULL's 1500: the gap -0.021 -> -0.026; GUARD off on the WEAVER tree
  // +0.043, still under 0.05). No least change clears it: three day-4 PvE plates moved 0.030 of the 0.076 needed.
  { rule: "slotGap", day: 4, a: "medium", b: "hard", v: 0.0721, ceiling: 0.0921 }, // carried (0.0763); 0.0763 -> 0.0721 s8-base (1e5fe4f 0.0763, 41a600a -0.0350)
  { rule: "slotGap", day: 5, a: "medium", b: "hard", v: 0.0570, ceiling: 0.0770 }, // new (red at s8-base: 0.0570; 1e5fe4f passes, 41a600a passes)
  { rule: "slotGap", day: 7, a: "medium", b: "hard", v: 0.0118, ceiling: 0.0318 }, // new (red at s8-base: 0.0118; 1e5fe4f passes, 41a600a 0.0116)
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
    // AZ-BUMP (the flip, LADDER_FIX): 600 s (was the 30 s default), a host timeout under the 1.5-CPU quota (the GATE RULE),
    // not the rule. LADDER_FIX makes these 1,080 battles about 1.2x slower (in battle its per-tick code is OVERDRIVE's
    // ride-keep walk, battle.ts rideKeepAt): AZ-BUMP run 7's probe read 6.6-6.9 s with every switch on and 5.5 s with
    // LADDER_FIX off; NPC_DAY and HULL_SCALE moved it by 0.1 s at most (these fights pass no day). 7.4 s in S1's whole
    // suite, 12.5 s in run 4's switch-on shard, 33 s and 50 s in run 6 (the quota's cgroup saturated by other jobs)
  }, 600_000);
});
