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
// BUMP-1D (rules bb-0.11.0; cap's ruling R2.3 Q4): the ladder's pins are re-keyed to the values measured on the 10-wins rules
// release, each with a "BUMP-1D: was ..." trail, in LADDER_X_OPEN below (the par field moved with the twelve new pieces; no
// captain was tuned; the rule of every check, the +-0.25 pool band included, is unchanged). This file is on BUMP-1E's tuning
// list: BUMP-1E re-reads the stand-in ladder in its regeneration, and the pins are re-measured there.
// BUMP-1E (rules bb-0.12.0): the pins are re-measured in LADDER_X_OPEN below (65 -> 88 entries, each with a "BUMP-1E: was ..." trail and its cause: the flip and C3,
// SOOTJAW's SCATTER CHOKE on day 5); no captain was tuned and no rule of any check changed. ONE entry is an INVERTED ORDER, not a thin gap: "every day: by mean margin
// Easy > Medium > Hard" on day 6, where the Easy slot's mean margin (+0.237) is below the Medium slot's (+0.351). It is pinned as the slotGap day 6 easy / medium entry by
// cap's ruling (oracle b648372ad6c78cb6, run 7, which overrode the re-pin brief's "a ladder that breaks its order is left red" for this one entry) and MUST be fixed in the
// next rules release (see LADDER_X_OPEN).
// BUMP-1F (rules bb-0.13.0; RULING-BUMP1F-R5 R5.2 (2), RULING-BUMP1F-R2 R2.1 Q3): the pins are re-measured at the BUMP-1F tip in LADDER_X_OPEN below (88 -> 88 entries); the BUMP-1E day-6 inversion is gone (the order holds, the gap is a thin one), and DAY 10 is a THIN GAP, an inversion of -0.0036 under 0.015 with J5 at K 96 having the pair in order (REPORT R4.8); no captain was tuned in P6.

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
  // BUMP-1F (rules bb-0.13.0; RULING-BUMP1F-R5 R5.2 (2), P6; the days-1-10 margin ladder is judged by RULING-BUMP1F-R2 R2.1 Q3): the pins are re-measured at the BUMP-1F tip (GATES and ENCHANT on by default: the par player buys converters and words; ENCHANT-2: the rivals' own
  // words from day 5 (RULING-BUMP1F-R3.1); POISON_DPS 2; RATCHET's day-8 kiln BRACED; OLD BULWARK's day-3 GREASE, run 2's one captain-deck step) with a temporary collector, an uncommitted copy of these rules with no exception list (this file's own helpers, no pool read;
  // W/tmp/h11/ladder.scratch.ts, ladder.json, 118 s): 88 -> 88 entries, ceiling = measured v + 0.02. By rule (BUMP-1E -> now): easyOverHard 64 -> 65, matriarchLowest 2 -> 0, pacing 4 -> 4 (the four GRIMHOLD pins read unchanged), parBeatsEasy 0 -> 2, parLosesToHard 6 -> 6,
  // poolBand 7 -> 5, slotGap 5 -> 6. Out (pass now) 26: easyOverHard 21 (d3 BRASSWICK, GRUBNOSE and RATCHET v BULWARK, d4 BRASSWICK and RATCHET v BULWARK, d5 BRASSWICK v BULWARK, HIGHSPIRE, KARSK, LONGTOOTH, MOTH QUEEN and VOSS, d5 NETTLE v BULWARK, d6 BRASSWICK v BULWARK,
  // HIGHSPIRE, KARSK, LONGTOOTH and MOTH QUEEN, d6 RATCHET v BULWARK, d7 BRASSWICK v BULWARK, d8 BRASSWICK v KARSK, d9 BRASSWICK v VOSS), matriarchLowest d8 and d9 SILKSHADE, poolBand d6 and d7 (the pool means +0.1567 and +0.1631 are inside the band now), slotGap easy / medium d5
  // (Easy +0.3687, Medium +0.1966). New 26: easyOverHard 22 (d1 NETTLE v KARSK; d3 BRASSWICK and GRUBNOSE v HIGHSPIRE; d4 GRUBNOSE v KARSK, RATCHET v HIGHSPIRE; d5 RATCHET v VOSS; d6 GRUBNOSE v MOTH QUEEN, NETTLE v MOTH QUEEN, RATCHET v KARSK; d7 BRASSWICK, GRUBNOSE and NETTLE v LONGTOOTH;
  // d8 GRUBNOSE v HIGHSPIRE (v 0.1142), RATCHET v LONGTOOTH; d9 GRUBNOSE v MOTH QUEEN, NETTLE v KARSK (0.1061), RATCHET v KARSK (0.0979); d10 GRUBNOSE v MOTH QUEEN (0.2018), NETTLE v KARSK, v LONGTOOTH and v MOTH QUEEN, RATCHET v MOTH QUEEN (0.2357)), parBeatsEasy d9 and d10, slotGap
  // medium / hard d3 and d5. THE CAUSE: the flips and rulings of this release, not attributed entry by entry (no A/B in P6): every margin is measured against the FURNACE par field, which now buys converters and words (GATES, ENCHANT), and from day 5 the captains hold words
  // (ENCHANT-2), the Easy ones the gentler (ECHOING, BRACED), the Hard ones the sharper (FIERY, MASSIVE, RISING). The slot means (Easy / Medium / Hard) on days 1-10: +0.4981 / +0.4228 / +0.3586; +0.4333 / +0.2983 / +0.2399; +0.3796 / +0.3056 / +0.2813; +0.4019 / +0.1358 / +0.1210;
  // +0.3687 / +0.1966 / +0.1806; +0.2011 / +0.1524 / +0.0369; +0.2342 / +0.1676 / +0.0952; +0.0877 / -0.0051 / -0.1251; -0.0240 / -0.0373 / -0.2421; -0.0631 / -0.0595 / -0.2622. Days 1-9 are in order; DAY 10 IS A THIN GAP (Easy -0.0036 below Medium; J5 at K 96 has Easy 11.4% < Medium 15.4%,
  // REPORT R4.8, pinned below as the slotGap day 10 easy / medium entry); the BUMP-1E day-6 inversion is gone (below). Each line's comment: "BUMP-1F: was v (ceiling c)" (the BUMP-1E pin), "unchanged" (the pin reads to four decimals as before) or "new", then the BUMP-1E line's own history.
  // BUMP-1E (rules bb-0.12.0; the re-pin brief: a ladder number that moved for the flip or for C3 is re-keyed with its reason, a ladder that now breaks its ORDER is
  // left red and reported): re-measured at the BUMP-1E tip (SCALE_RIGS and ENDLESS on, the regenerated pools) with a temporary collector, an uncommitted copy of these
  // rules with no exception list (this file's own helpers; scratch run W/tmp/alpha-r5/rivals-on.json): 65 -> 87 entries, ceiling = measured v + 0.02, and the 88th, the day-6
  // inversion below (run 7). By rule (BUMP-1D -> now): easyOverHard 43 -> 64, matriarchLowest 0 -> 2, pacing 5 -> 4, parLosesToHard 6 -> 6, poolBand 7 -> 7, slotGap 4 -> 5.
  // THE CAUSES, from A/B runs of the same collector (W/tmp/alpha-r5/rivals-off.json, rivals-co-*.json: scratch checkouts of the commits named below, never committed): (1) C3 (211c498: SOOTJAW's SCATTER CHOKE on day 5,
  // was 3, in every world): it moves SOOTJAW (the Medium slot's mean, the stand-in pool's mean, his pacing pin) and, since easyOverHard lines that never name him move too,
  // the par field every margin is measured against (presumably through the par player's road fights: NPC_DAY, it meets a Medium warlord each day). With the scaling switch
  // off all 65 BUMP-1D pins read EXACTLY at b0478bd (before the flip), 00627d9 (the flip and its rules literals), 85297df (P2d) and 71f87ff (C1, C2), and 35 of them differ at
  // 78a3c21 and at this tip, the same 35 with the same values (C3, 211c498, is the one commit between 71f87ff and 78a3c21 that is not behind the switch: C4 is PRESSURE BREECH's
  // scaled def); (2) the flip: with the scaling rules on the par player shops the seven new rigs and the five reworks, and the captains' decks hold reworked pieces (SPALL
  // CATCHER, VENOM DRIP, KINDLING). The luck caps (f6ce0ce) move none of this file's numbers: the file reads none (luckCapsData.ts is imported by tools/luckCaps.ts and the
  // captains.* and rivals.npcs tests only), and the switch-off run at this tip equals the one at 78a3c21, before f6ce0ce. Each line's comment: "BUMP-1E: was v (ceiling c; switch off v')": v the BUMP-1D pin,
  // v' this line with the scaling switch off at this tip (the move from v to v' is C3, from v' to the line the flip), or "new" (the rule held at BUMP-1D), then the BUMP-1D
  // line's own history. Out (pass now) 11: easyOverHard d2 BRASSWICK v BULWARK and v LONGTOOTH, d3 BRASSWICK v HIGHSPIRE and v MOTH QUEEN, d3 GRUBNOSE v HIGHSPIRE, d5 RATCHET v
  // VOSS, d9 GRUBNOSE v VOSS; pacing d3 SOOTJAW v WEAVER (C3: his day-3 fight against the WEAVER pacing deck lasts 16.09 s now, 15.83 s with the switch off, was 13.68 s);
  // slotGap medium / hard d2, d3 and d5. New 33: easyOverHard 28 (14 against THANE KARSK on days 3, 4, 6, 7, 8 and 10, 8 against OLD BULWARK on days 4-7, 5 against LONGTOOTH
  // on days 5, 8 and 10, 1 against HIGHSPIRE: the largest are day 7 NETTLE, GRUBNOSE and RATCHET against KARSK, v 0.2745, 0.2654 and 0.1196, KARSK's margin +0.592 being the
  // highest of all 16 captains on day 7, and day 6 GRUBNOSE against BULWARK, v 0.2026), matriarchLowest
  // d8 and d9 SILKSHADE (v 0.0700 and 0.0111), slotGap easy / medium d5, d9 and d10 (the order holds, the gaps are 0.040, 0.040 and 0.004: the rule's 0.05 is missed).
  // INVERTED ORDER, pinned by cap's ruling (oracle b648372ad6c78cb6, run 7; it overrides the re-pin brief's (c), "a ladder that breaks its order is left red and reported", for this one
  // entry): slotGap day 6 easy / medium. The Easy slot's mean margin is +0.2374, BELOW the Medium slot's +0.3514 (v 0.1640: the order is inverted, the 88th entry); with the scaling
  // switch off it holds (+0.3838 against +0.2892), so the flip breaks it. C3's J5 win-rate read at the freeze (78a3c21) still had day 6 in order, thinly (Easy / Medium / Hard 14.6 /
  // 16.5 / 28.2): the win order holds and the margin order flips. MUST be fixed in the next rules release: one captain-deck step for day 6 in src/sim/rivalBuilds.ts (R1.1's "one
  // step there"), owed to that release's regeneration; nothing in src/ moved in 1E.
  // BUMP-1D (rules bb-0.11.0; cap's ruling R2.3 Q4: re-key to the measured values, each line with a "BUMP-1D: was ..." trail and
  // a one-line reason; the pool band is pinned at the measured value (its +-0.25 rule stays, the excess is a poolBand line); no
  // rivals or ladder number in src/ was changed): re-measured at the BUMP-1D tip (LONG_RUN, PLAIN_RIGS and SHAPES2 on) with a
  // temporary collector, an uncommitted copy of these rules with no exception list (this file's own helpers;
  // W/output-bump/logs/p7-r3-smug-3.log): 64 -> 65 entries, ceiling = measured v + 0.02.
  // By rule (old -> new): easyOverHard 46 -> 43, pacing 5 -> 5, parLosesToHard 4 -> 6, poolBand 4 -> 7, slotGap 5 -> 4.
  // Out (pass now) 9: easyOverHard d1 NETTLE v KARSK, d5 BRASSWICK v SILKSHADE, d6 GRUBNOSE v BULWARK, d7 NETTLE v KARSK, d8
  // BRASSWICK v LONGTOOTH, d10 BRASSWICK v KARSK, d10 GRUBNOSE v KARSK, d10 GRUBNOSE v LONGTOOTH; slotGap d7 medium / hard. New 10:
  // easyOverHard d3 BRASSWICK v MOTH QUEEN, d6 NETTLE and GRUBNOSE v LONGTOOTH, d9 BRASSWICK and GRUBNOSE v VOSS; parLosesToHard
  // d6 and d7 (the Hard mean +0.1711 and +0.2220; day 8 still holds, -0.0025); poolBand d5, d6 and d7 (the pool mean +0.3925,
  // +0.3093 and +0.3180 against the +-0.25 band, whose rule stays). Over the old ceiling 21: easyOverHard on days 2, 3, 5 and 6
  // against the Hard captains BULWARK, HIGHSPIRE, KARSK and LONGTOOTH (12), parLosesToHard d2-d5, poolBand d1-d4, slotGap d5
  // medium / hard. Each line's comment: "BUMP-1D: was v (ceiling c)" (the pin before this job), a one-line reason, the mean for a
  // rule that pins one, then "before:" the line's earlier history; a new line says what its rule read before (a negative v: it held).
  // THE CAUSE (an A/B with the same collector, W/output-bump/logs/p7-r3-smug-4.log and -5.log): with PLAIN_RIGS and SHAPES2 off
  // (the twelve new pieces out of the shop; LONG_RUN on or off; the regenerated 16-day stand-in pool data and every other switch
  // as shipped) all 64 old pins read to four decimals as pinned, so the old path is intact. The captains did not move (their five
  // pacing pins read unchanged); the FURNACE par field did: the par player shops the 103-module catalogue now, so every margin
  // against it moved (day 1 Easy / Medium / Hard means +0.5137 / +0.4436 / +0.3878, were +0.4850 / +0.4092 / +0.3433; Hard on day 6
  // +0.1711, was -0.0850; the pool mean on day 5 +0.3925, was +0.1813). The regenerated stand-in pool data moves none of this
  // file's numbers. No captain, part or plan was tuned for any of it. BUMP-1E re-reads the stand-in ladder in its regeneration:
  // this file is on its tuning list, and these pins are the ladder as it stands on bb-0.11.0, not a target. Before, S8b's note:
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
  { rule: "easyOverHard", day: 1, a: "nettle", b: "highspire", v: 0.029, ceiling: 0.049 }, // BUMP-1F: was 0.0226 (ceiling 0.0426); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: was 0.0236 (ceiling 0.0436; switch off 0.0236); the flip and C3 move the par field and the captains' decks; BUMP-1D: was 0.0183 (ceiling 0.0383); the stand-in ladder moved (par field: the 12 new pieces); before: carried (0.0249); 0.0249 -> 0.0183 s8-base (1e5fe4f 0.0212, 41a600a 0.0224)
  { rule: "easyOverHard", day: 1, a: "nettle", b: "karsk", v: 0.0467, ceiling: 0.0667 }, // BUMP-1F: new (the rule held at BUMP-1E); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks
  { rule: "easyOverHard", day: 1, a: "nettle", b: "mothqueen", v: 0.0358, ceiling: 0.0558 }, // BUMP-1F: was 0.0254 (ceiling 0.0454); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: was 0.0273 (ceiling 0.0473; switch off 0.0273); the flip and C3 move the par field and the captains' decks; BUMP-1D: was 0.0252 (ceiling 0.0452); the stand-in ladder moved (par field: the 12 new pieces); before: carried (0.0542); 0.0542 -> 0.0252 s8-base (1e5fe4f 0.0408, 41a600a 0.0454)
  { rule: "easyOverHard", day: 1, a: "ratchet", b: "highspire", v: 0.0244, ceiling: 0.0444 }, // BUMP-1F: was 0.0562 (ceiling 0.0762); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: was 0.0478 (ceiling 0.0678; switch off 0.0478); the flip and C3 move the par field and the captains' decks; BUMP-1D: was 0.0356 (ceiling 0.0556); the stand-in ladder moved (par field: the 12 new pieces); before: new (red at s8-base: 0.0356; 1e5fe4f 0.0168, 41a600a passes)
  { rule: "easyOverHard", day: 1, a: "ratchet", b: "karsk", v: 0.0422, ceiling: 0.0622 }, // BUMP-1F: was 0.0171 (ceiling 0.0371); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: was 0.0115 (ceiling 0.0315; switch off 0.0115); the flip and C3 move the par field and the captains' decks; BUMP-1D: was 0.0288 (ceiling 0.0488); the stand-in ladder moved (par field: the 12 new pieces); before: carried (0.0586); 0.0586 -> 0.0288 s8-base (1e5fe4f -0.0142, 41a600a 0.0704)
  { rule: "easyOverHard", day: 1, a: "ratchet", b: "mothqueen", v: 0.0312, ceiling: 0.0512 }, // BUMP-1F: was 0.059 (ceiling 0.079); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: was 0.0515 (ceiling 0.0715; switch off 0.0515); the flip and C3 move the par field and the captains' decks; BUMP-1D: was 0.0426 (ceiling 0.0626); the stand-in ladder moved (par field: the 12 new pieces); before: new (red at s8-base: 0.0426; 1e5fe4f 0.0364, 41a600a passes)
  { rule: "easyOverHard", day: 2, a: "brasswick", b: "highspire", v: 0.1131, ceiling: 0.1331 }, // BUMP-1F: was 0.0886 (ceiling 0.1086); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: was 0.0852 (ceiling 0.1052; switch off 0.0852); the flip and C3 move the par field and the captains' decks; BUMP-1D: was 0.0462 (ceiling 0.0662); the stand-in ladder moved (par field: the 12 new pieces); before: new (red at s8-base: 0.0462; 1e5fe4f 0.0926, 41a600a 0.0399)
  { rule: "easyOverHard", day: 2, a: "brasswick", b: "karsk", v: 0.0638, ceiling: 0.0838 }, // BUMP-1F: was 0.0106 (ceiling 0.0306); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: was 0.0401 (ceiling 0.0601; switch off 0.0401); the flip and C3 move the par field and the captains' decks; BUMP-1D: was 0.0315 (ceiling 0.0515); the stand-in ladder moved (par field: the 12 new pieces); before: carried (0.1921); 0.1921 -> 0.0315 s8-base (1e5fe4f 0.0431, 41a600a 0.1107)
  { rule: "easyOverHard", day: 2, a: "brasswick", b: "mothqueen", v: 0.081, ceiling: 0.101 }, // BUMP-1F: was 0.067 (ceiling 0.087); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: was 0.0533 (ceiling 0.0733; switch off 0.0533); the flip and C3 move the par field and the captains' decks; BUMP-1D: was 0.0383 (ceiling 0.0583); the stand-in ladder moved (par field: the 12 new pieces); before: new (red at s8-base: 0.0383; 1e5fe4f 0.0589, 41a600a 0.0272)
  { rule: "easyOverHard", day: 3, a: "brasswick", b: "highspire", v: 0.0144, ceiling: 0.0344 }, // BUMP-1F: new (the rule held at BUMP-1E); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks
  { rule: "easyOverHard", day: 3, a: "brasswick", b: "karsk", v: 0.0934, ceiling: 0.1134 }, // BUMP-1F: was 0.0416 (ceiling 0.0616); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: new (the rule held at BUMP-1D; switch off: the rule holds); the flip and C3 move the par field and the captains' decks
  { rule: "easyOverHard", day: 3, a: "grubnose", b: "highspire", v: 0.0113, ceiling: 0.0313 }, // BUMP-1F: new (the rule held at BUMP-1E); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks
  { rule: "easyOverHard", day: 3, a: "grubnose", b: "karsk", v: 0.0903, ceiling: 0.1103 }, // BUMP-1F: was 0.036 (ceiling 0.056); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: new (the rule held at BUMP-1D; switch off: the rule holds); the flip and C3 move the par field and the captains' decks
  { rule: "easyOverHard", day: 3, a: "ratchet", b: "highspire", v: 0.1575, ceiling: 0.1775 }, // BUMP-1F: was 0.0741 (ceiling 0.0941); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: was 0.1322 (ceiling 0.1522; switch off 0.1322); the flip and C3 move the par field and the captains' decks; BUMP-1D: was 0.1070 (ceiling 0.1270); the stand-in ladder moved (par field: the 12 new pieces); before: carried (0.1749); 0.1749 -> 0.1070 s8-base (1e5fe4f 0.0918, 41a600a 0.0629)
  { rule: "easyOverHard", day: 3, a: "ratchet", b: "karsk", v: 0.2365, ceiling: 0.2565 }, // BUMP-1F: was 0.1307 (ceiling 0.1507); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: new (the rule held at BUMP-1D; switch off: the rule holds); the flip and C3 move the par field and the captains' decks
  { rule: "easyOverHard", day: 3, a: "ratchet", b: "mothqueen", v: 0.1291, ceiling: 0.1491 }, // BUMP-1F: was 0.0812 (ceiling 0.1012); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: was 0.072 (ceiling 0.092; switch off 0.072); the flip and C3 move the par field and the captains' decks; BUMP-1D: was 0.0539 (ceiling 0.0739); the stand-in ladder moved (par field: the 12 new pieces); before: carried (0.1086); 0.1086 -> 0.0539 s8-base (1e5fe4f 0.0604, 41a600a 0.0768)
  { rule: "easyOverHard", day: 3, a: "ratchet", b: "silkshade", v: 0.0765, ceiling: 0.0965 }, // BUMP-1F: was 0.0363 (ceiling 0.0563); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: was 0.0444 (ceiling 0.0644; switch off 0.0444); the flip and C3 move the par field and the captains' decks; BUMP-1D: was 0.0537 (ceiling 0.0737); the stand-in ladder moved (par field: the 12 new pieces); before: carried (0.0194); 0.0194 -> 0.0537 s8-base (1e5fe4f 0.0225, 41a600a 0.0392)
  { rule: "easyOverHard", day: 4, a: "grubnose", b: "karsk", v: 0.0291, ceiling: 0.0491 }, // BUMP-1F: new (the rule held at BUMP-1E); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks
  { rule: "easyOverHard", day: 4, a: "ratchet", b: "highspire", v: 0.006, ceiling: 0.026 }, // BUMP-1F: new (the rule held at BUMP-1E); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks
  { rule: "easyOverHard", day: 4, a: "ratchet", b: "karsk", v: 0.1562, ceiling: 0.1762 }, // BUMP-1F: was 0.0347 (ceiling 0.0547); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: new (the rule held at BUMP-1D; switch off: the rule holds); the flip and C3 move the par field and the captains' decks
  { rule: "easyOverHard", day: 5, a: "grubnose", b: "bulwark", v: 0.0444, ceiling: 0.0644 }, // BUMP-1F: was 0.1031 (ceiling 0.1231); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: new (the rule held at BUMP-1D; switch off: the rule holds); the flip and C3 move the par field and the captains' decks
  { rule: "easyOverHard", day: 5, a: "ratchet", b: "bulwark", v: 0.1047, ceiling: 0.1247 }, // BUMP-1F: was 0.2722 (ceiling 0.2922); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: was 0.1611 (ceiling 0.1811; switch off 0.1599); the flip and C3 move the par field and the captains' decks; BUMP-1D: was 0.0387 (ceiling 0.0587); the stand-in ladder moved (par field: the 12 new pieces); before: carried (0.0293); 0.0293 -> 0.0387 s8-base (1e5fe4f 0.0231, 41a600a -0.0379)
  { rule: "easyOverHard", day: 5, a: "ratchet", b: "longtooth", v: 0.0126, ceiling: 0.0326 }, // BUMP-1F: was 0.008 (ceiling 0.028); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: new (the rule held at BUMP-1D; switch off: the rule holds); the flip and C3 move the par field and the captains' decks
  { rule: "easyOverHard", day: 5, a: "ratchet", b: "voss", v: 0.0264, ceiling: 0.0464 }, // BUMP-1F: new (the rule held at BUMP-1E); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks
  { rule: "easyOverHard", day: 6, a: "grubnose", b: "bulwark", v: 0.1532, ceiling: 0.1732 }, // BUMP-1F: was 0.2026 (ceiling 0.2226); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: new (the rule held at BUMP-1D; switch off: the rule holds); the flip and C3 move the par field and the captains' decks
  { rule: "easyOverHard", day: 6, a: "grubnose", b: "karsk", v: 0.1973, ceiling: 0.2173 }, // BUMP-1F: was 0.1522 (ceiling 0.1722); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: new (the rule held at BUMP-1D; switch off: the rule holds); the flip and C3 move the par field and the captains' decks
  { rule: "easyOverHard", day: 6, a: "grubnose", b: "longtooth", v: 0.0793, ceiling: 0.0993 }, // BUMP-1F: was 0.1532 (ceiling 0.1732); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: was 0.0222 (ceiling 0.0422; switch off 0.035); the flip and C3 move the par field and the captains' decks; BUMP-1D: new (the rule held before: v -0.0464); the stand-in ladder moved (par field: the 12 new pieces)
  { rule: "easyOverHard", day: 6, a: "grubnose", b: "mothqueen", v: 0.0042, ceiling: 0.0242 }, // BUMP-1F: new (the rule held at BUMP-1E); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks
  { rule: "easyOverHard", day: 6, a: "nettle", b: "bulwark", v: 0.1861, ceiling: 0.2061 }, // BUMP-1F: was 0.1368 (ceiling 0.1568); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: new (the rule held at BUMP-1D; switch off: the rule holds); the flip and C3 move the par field and the captains' decks
  { rule: "easyOverHard", day: 6, a: "nettle", b: "karsk", v: 0.2302, ceiling: 0.2502 }, // BUMP-1F: was 0.0864 (ceiling 0.1064); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: new (the rule held at BUMP-1D; switch off: the rule holds); the flip and C3 move the par field and the captains' decks
  { rule: "easyOverHard", day: 6, a: "nettle", b: "longtooth", v: 0.1122, ceiling: 0.1322 }, // BUMP-1F: was 0.0874 (ceiling 0.1074); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: was 0.0074 (ceiling 0.0274; switch off 0.0138); the flip and C3 move the par field and the captains' decks; BUMP-1D: new (the rule held before: v -0.1468); the stand-in ladder moved (par field: the 12 new pieces)
  { rule: "easyOverHard", day: 6, a: "nettle", b: "mothqueen", v: 0.0372, ceiling: 0.0572 }, // BUMP-1F: new (the rule held at BUMP-1E); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks
  { rule: "easyOverHard", day: 6, a: "ratchet", b: "karsk", v: 0.0053, ceiling: 0.0253 }, // BUMP-1F: new (the rule held at BUMP-1E); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks
  { rule: "easyOverHard", day: 7, a: "brasswick", b: "karsk", v: 0.1721, ceiling: 0.1921 }, // BUMP-1F: was 0.288 (ceiling 0.308); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: was 0.0034 (ceiling 0.0234; switch off 0.0014); the flip and C3 move the par field and the captains' decks; BUMP-1D: was 0.0221 (ceiling 0.0421); the stand-in ladder moved (par field: the 12 new pieces); before: carried (0.3201); 0.3201 -> 0.0221 s8-base (1e5fe4f 0.0336, 41a600a -0.0464)
  { rule: "easyOverHard", day: 7, a: "brasswick", b: "longtooth", v: 0.01, ceiling: 0.03 }, // BUMP-1F: new (the rule held at BUMP-1E); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks
  { rule: "easyOverHard", day: 7, a: "grubnose", b: "karsk", v: 0.1725, ceiling: 0.1925 }, // BUMP-1F: was 0.2654 (ceiling 0.2854); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: new (the rule held at BUMP-1D; switch off: the rule holds); the flip and C3 move the par field and the captains' decks
  { rule: "easyOverHard", day: 7, a: "grubnose", b: "longtooth", v: 0.0105, ceiling: 0.0305 }, // BUMP-1F: new (the rule held at BUMP-1E); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks
  { rule: "easyOverHard", day: 7, a: "nettle", b: "karsk", v: 0.1869, ceiling: 0.2069 }, // BUMP-1F: was 0.2745 (ceiling 0.2945); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: new (the rule held at BUMP-1D; switch off: the rule holds); the flip and C3 move the par field and the captains' decks
  { rule: "easyOverHard", day: 7, a: "nettle", b: "longtooth", v: 0.0248, ceiling: 0.0448 }, // BUMP-1F: new (the rule held at BUMP-1E); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks
  { rule: "easyOverHard", day: 7, a: "ratchet", b: "karsk", v: 0.0447, ceiling: 0.0647 }, // BUMP-1F: was 0.1196 (ceiling 0.1396); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: new (the rule held at BUMP-1D; switch off: the rule holds); the flip and C3 move the par field and the captains' decks
  { rule: "easyOverHard", day: 8, a: "brasswick", b: "longtooth", v: 0.1032, ceiling: 0.1232 }, // BUMP-1F: was 0.0366 (ceiling 0.0566); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: new (the rule held at BUMP-1D; switch off: the rule holds); the flip and C3 move the par field and the captains' decks
  { rule: "easyOverHard", day: 8, a: "grubnose", b: "highspire", v: 0.1142, ceiling: 0.1342 }, // BUMP-1F: new (the rule held at BUMP-1E); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks
  { rule: "easyOverHard", day: 8, a: "grubnose", b: "karsk", v: 0.2139, ceiling: 0.2339 }, // BUMP-1F: was 0.1211 (ceiling 0.1411); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: new (the rule held at BUMP-1D; switch off: the rule holds); the flip and C3 move the par field and the captains' decks
  { rule: "easyOverHard", day: 8, a: "grubnose", b: "longtooth", v: 0.3688, ceiling: 0.3888 }, // BUMP-1F: was 0.123 (ceiling 0.143); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: was 0.0033 (ceiling 0.0233; switch off: the rule holds); the flip and C3 move the par field and the captains' decks; BUMP-1D: was 0.1931 (ceiling 0.2131); the stand-in ladder moved (par field: the 12 new pieces); before: new (red at s8-base: 0.2107; 1e5fe4f 0.2037, 41a600a passes) -> 0.1931 FIT-099
  { rule: "easyOverHard", day: 8, a: "nettle", b: "karsk", v: 0.0425, ceiling: 0.0625 }, // BUMP-1F: was 0.0238 (ceiling 0.0438); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: new (the rule held at BUMP-1D; switch off: the rule holds); the flip and C3 move the par field and the captains' decks
  { rule: "easyOverHard", day: 8, a: "nettle", b: "longtooth", v: 0.1973, ceiling: 0.2173 }, // BUMP-1F: was 0.0257 (ceiling 0.0457); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: new (the rule held at BUMP-1D; switch off: the rule holds); the flip and C3 move the par field and the captains' decks
  { rule: "easyOverHard", day: 8, a: "ratchet", b: "longtooth", v: 0.0032, ceiling: 0.0232 }, // BUMP-1F: new (the rule held at BUMP-1E); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks
  { rule: "easyOverHard", day: 9, a: "brasswick", b: "karsk", v: 0.2508, ceiling: 0.2708 }, // BUMP-1F: was 0.1828 (ceiling 0.2028); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: was 0.0241 (ceiling 0.0441; switch off 0.0239); the flip and C3 move the par field and the captains' decks; BUMP-1D: was 0.2157 (ceiling 0.2357); the stand-in ladder moved (par field: the 12 new pieces); before: carried (0.2676); 0.2676 -> 0.1736 s8-base (1e5fe4f 0.0160, 41a600a 0.1339) -> 0.2157 FIT-099
  { rule: "easyOverHard", day: 9, a: "brasswick", b: "longtooth", v: 0.1367, ceiling: 0.1567 }, // BUMP-1F: was 0.2251 (ceiling 0.2451); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: was 0.0891 (ceiling 0.1091; switch off 0.0672); the flip and C3 move the par field and the captains' decks; BUMP-1D: was 0.2107 (ceiling 0.2307); the stand-in ladder moved (par field: the 12 new pieces); before: carried (0.2442); 0.2442 -> 0.1606 s8-base (1e5fe4f 0.0842, 41a600a 0.0980) -> 0.2107 FIT-099
  { rule: "easyOverHard", day: 9, a: "grubnose", b: "karsk", v: 0.331, ceiling: 0.351 }, // BUMP-1F: was 0.0806 (ceiling 0.1006); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: was 0.0055 (ceiling 0.0255; switch off: the rule holds); the flip and C3 move the par field and the captains' decks; BUMP-1D: was 0.2101 (ceiling 0.2301); the stand-in ladder moved (par field: the 12 new pieces); before: new (red at s8-base: 0.2148; 1e5fe4f passes, 41a600a 0.0739) -> 0.2101 FIT-099
  { rule: "easyOverHard", day: 9, a: "grubnose", b: "longtooth", v: 0.2169, ceiling: 0.2369 }, // BUMP-1F: was 0.1229 (ceiling 0.1429); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: was 0.0705 (ceiling 0.0905; switch off 0.0425); the flip and C3 move the par field and the captains' decks; BUMP-1D: was 0.2051 (ceiling 0.2251); the stand-in ladder moved (par field: the 12 new pieces); before: new (red at s8-base: 0.2018; 1e5fe4f 0.0268, 41a600a 0.0380) -> 0.2051 FIT-099
  { rule: "easyOverHard", day: 9, a: "grubnose", b: "mothqueen", v: 0.0361, ceiling: 0.0561 }, // BUMP-1F: new (the rule held at BUMP-1E); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks
  { rule: "easyOverHard", day: 9, a: "nettle", b: "karsk", v: 0.1061, ceiling: 0.1261 }, // BUMP-1F: new (the rule held at BUMP-1E); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks
  { rule: "easyOverHard", day: 9, a: "ratchet", b: "karsk", v: 0.0979, ceiling: 0.1179 }, // BUMP-1F: new (the rule held at BUMP-1E); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks
  { rule: "easyOverHard", day: 10, a: "brasswick", b: "karsk", v: 0.0987, ceiling: 0.1187 }, // BUMP-1F: was 0.0854 (ceiling 0.1054); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: new (the rule held at BUMP-1D; switch off: the rule holds); the flip and C3 move the par field and the captains' decks
  { rule: "easyOverHard", day: 10, a: "brasswick", b: "longtooth", v: 0.0124, ceiling: 0.0324 }, // BUMP-1F: was 0.0278 (ceiling 0.0478); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: new (the rule held at BUMP-1D; switch off: the rule holds); the flip and C3 move the par field and the captains' decks
  { rule: "easyOverHard", day: 10, a: "grubnose", b: "karsk", v: 0.3061, ceiling: 0.3261 }, // BUMP-1F: was 0.1042 (ceiling 0.1242); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: new (the rule held at BUMP-1D; switch off: the rule holds); the flip and C3 move the par field and the captains' decks
  { rule: "easyOverHard", day: 10, a: "grubnose", b: "longtooth", v: 0.2198, ceiling: 0.2398 }, // BUMP-1F: was 0.0465 (ceiling 0.0665); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: new (the rule held at BUMP-1D; switch off: the rule holds); the flip and C3 move the par field and the captains' decks
  { rule: "easyOverHard", day: 10, a: "grubnose", b: "mothqueen", v: 0.2018, ceiling: 0.2218 }, // BUMP-1F: new (the rule held at BUMP-1E); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks
  { rule: "easyOverHard", day: 10, a: "nettle", b: "karsk", v: 0.1091, ceiling: 0.1291 }, // BUMP-1F: new (the rule held at BUMP-1E); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks
  { rule: "easyOverHard", day: 10, a: "nettle", b: "longtooth", v: 0.0228, ceiling: 0.0428 }, // BUMP-1F: new (the rule held at BUMP-1E); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks
  { rule: "easyOverHard", day: 10, a: "nettle", b: "mothqueen", v: 0.0048, ceiling: 0.0248 }, // BUMP-1F: new (the rule held at BUMP-1E); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks
  { rule: "easyOverHard", day: 10, a: "ratchet", b: "karsk", v: 0.3401, ceiling: 0.3601 }, // BUMP-1F: was 0.0902 (ceiling 0.1102); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: was 0.0348 (ceiling 0.0548; switch off 0.0867); the flip and C3 move the par field and the captains' decks; BUMP-1D: was 0.1363 (ceiling 0.1563); the stand-in ladder moved (par field: the 12 new pieces); before: new (red at s8-base: 0.0866; 1e5fe4f passes, 41a600a 0.1535) -> 0.1355 FIT-099 -> 0.1363 CAPTAIN_RUNES
  { rule: "easyOverHard", day: 10, a: "ratchet", b: "longtooth", v: 0.2538, ceiling: 0.2738 }, // BUMP-1F: was 0.0325 (ceiling 0.0525); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: was 0.0369 (ceiling 0.0569; switch off 0.0304); the flip and C3 move the par field and the captains' decks; BUMP-1D: was 0.0347 (ceiling 0.0547); the stand-in ladder moved (par field: the 12 new pieces); before: new (red at s8-base: 0.0192; 1e5fe4f passes, 41a600a 0.1646) -> 0.0339 FIT-099 -> 0.0347 CAPTAIN_RUNES
  { rule: "easyOverHard", day: 10, a: "ratchet", b: "mothqueen", v: 0.2357, ceiling: 0.2557 }, // BUMP-1F: new (the rule held at BUMP-1E); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks
  { rule: "pacing", day: 3, a: "grimhold", b: "furnace", v: 2.5175, ceiling: 2.5375 }, // BUMP-1F: unchanged (v 2.5175, ceiling 2.5375); BUMP-1E: was 2.5175 (ceiling 2.5375; switch off 2.5175); the flip and C3 move the par field and the captains' decks; carried (0.2758); 0.2758 -> 2.5175 s8-base (1e5fe4f 2.5175, 41a600a 0.2758)
  { rule: "pacing", day: 3, a: "grimhold", b: "weaver", v: 4.7292, ceiling: 4.7492 }, // BUMP-1F: unchanged (v 4.7292, ceiling 4.7492); BUMP-1E: was 4.7292 (ceiling 4.7492; switch off 4.7292); the flip and C3 move the par field and the captains' decks; carried (0.9558); 0.9558 -> 4.7292 s8-base (1e5fe4f 4.7292, 41a600a 0.9558)
  // HULL-ON H4, the captains pass (REQ-BFG-092; cap's rulings 6f4568477e66a600 = RULING-HULLON-R3 section 3's fallback and
  // ed10dd26da1a89fb = RULING-HULLON-R13 Q9 (b)): three pacing pins, each v measured on the captains commit, ceiling v + 0.02.
  // No captain number reaches them: GRIMHOLD has no count or level on days 1-2 (his first pack is day 3), and SOOTJAW has
  // none that slows his day-3 damage. The bounds stay (15-45 s).
  // BUMP-1E: SOOTJAW's pin (day 3, WEAVER's deck) left the list: C3 (211c498) moved his SCATTER CHOKE to day 5, which slows his day-3 damage after all: the fight lasts
  // 16.09 s now (15.83 s with the scaling switch off), the rule holds (was 13.68 s, v 1.3167)
  { rule: "pacing", day: 2, a: "grimhold", b: "furnace", v: 0.2783, ceiling: 0.2983 }, // BUMP-1F: unchanged (v 0.2783, ceiling 0.2983); BUMP-1E: was 0.2783 (ceiling 0.2983; switch off 0.2783); the flip and C3 move the par field and the captains' decks; cause GUARD (R3: 16.26 s with GUARD off); 14.7217 s, as at c4e8504
  { rule: "pacing", day: 2, a: "grimhold", b: "weaver", v: 0.2867, ceiling: 0.3067 }, // BUMP-1F: unchanged (v 0.2867, ceiling 0.3067); BUMP-1E: was 0.2867 (ceiling 0.3067; switch off 0.2867); the flip and C3 move the par field and the captains' decks; cause GUARD with FREE_JOINS (WEAVER's pacing deck at FREE_JOINS_HULL's 1500): 14.7133 s; holds with either off (GUARD off 19.2 s, FREE_JOINS_HULL = {} 16.3 s)
  { rule: "parBeatsEasy", day: 9, v: 0.024, ceiling: 0.044 }, // BUMP-1F (RULING-BUMP1F-R11 R11.5: the guard stays for every other day; days 9 and 10 only are exempt, with margins -0.024 and -0.063): new (the rule held at BUMP-1E); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks (a LEVEL, not an order: the Easy slot's mean margin is -0.0240 on day 9, the furnace par field loses to the Easy captains on average; the slot order Easy > Medium > Hard holds, the rule "a par deck beats Easy" had 0 entries since BUMP-1D)
  { rule: "parBeatsEasy", day: 10, v: 0.0631, ceiling: 0.0831 }, // BUMP-1F (RULING-BUMP1F-R11 R11.5: the guard stays for every other day; days 9 and 10 only are exempt, with margins -0.024 and -0.063): new (the rule held at BUMP-1E); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks (a LEVEL, not an order: the Easy slot's mean margin is -0.0631 on day 10, the furnace par field loses to the Easy captains on average; the slot order Easy > Medium > Hard holds, the rule "a par deck beats Easy" had 0 entries since BUMP-1D)
  { rule: "parLosesToHard", day: 2, v: 0.2399, ceiling: 0.2599 }, // BUMP-1F: was 0.2894 (ceiling 0.3094); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: was 0.3843 (ceiling 0.4043; switch off 0.3843); the flip and C3 move the par field and the captains' decks; BUMP-1D: was 0.3170 (ceiling 0.3370); the stand-in ladder moved (par field: the 12 new pieces); Hard mean +0.3843 (was +0.3170); before: carried (0.1417); 0.1417 -> 0.3170 s8-base (1e5fe4f 0.2599, 41a600a 0.2390)
  { rule: "parLosesToHard", day: 3, v: 0.2813, ceiling: 0.3013 }, // BUMP-1F: was 0.3071 (ceiling 0.3271); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: was 0.3472 (ceiling 0.3672; switch off 0.3472); the flip and C3 move the par field and the captains' decks; BUMP-1D: was 0.2462 (ceiling 0.2662); the stand-in ladder moved (par field: the 12 new pieces); Hard mean +0.3472 (was +0.2462); before: carried (0.1613); 0.1613 -> 0.2462 s8-base (1e5fe4f 0.2299, 41a600a 0.1733)
  { rule: "parLosesToHard", day: 4, v: 0.121, ceiling: 0.141 }, // BUMP-1F: was 0.2058 (ceiling 0.2258); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: was 0.2114 (ceiling 0.2314; switch off 0.2114); the flip and C3 move the par field and the captains' decks; BUMP-1D: was 0.0222 (ceiling 0.0422); the stand-in ladder moved (par field: the 12 new pieces); Hard mean +0.2114 (was +0.0222); before: new (red at s8-base: 0.0222; 1e5fe4f 0.0480, 41a600a passes)
  { rule: "parLosesToHard", day: 5, v: 0.1806, ceiling: 0.2006 }, // BUMP-1F: was 0.2674 (ceiling 0.2874); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: was 0.3292 (ceiling 0.3492; switch off 0.3409); the flip and C3 move the par field and the captains' decks; BUMP-1D: was 0.0878 (ceiling 0.1078); the stand-in ladder moved (par field: the 12 new pieces); Hard mean +0.3292 (was +0.0878); before: new (red at s8-base: 0.0878; 1e5fe4f 0.1085, 41a600a 0.0519)
  { rule: "parLosesToHard", day: 6, v: 0.0369, ceiling: 0.0569 }, // BUMP-1F: was 0.1097 (ceiling 0.1297); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: was 0.1711 (ceiling 0.1911; switch off 0.1724); the flip and C3 move the par field and the captains' decks; BUMP-1D: new (the rule held before: v -0.0850); the stand-in ladder moved (par field: the 12 new pieces); Hard mean +0.1711 (was -0.0850)
  { rule: "parLosesToHard", day: 7, v: 0.0952, ceiling: 0.1152 }, // BUMP-1F: was 0.1744 (ceiling 0.1944); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: was 0.222 (ceiling 0.242; switch off 0.2092); the flip and C3 move the par field and the captains' decks; BUMP-1D: new (the rule held before: v -0.0418); the stand-in ladder moved (par field: the 12 new pieces); Hard mean +0.2220 (was -0.0418)
  { rule: "poolBand", day: 1, v: 0.1163, ceiling: 0.1363 }, // BUMP-1F: was 0.1078 (ceiling 0.1278); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: was 0.1308 (ceiling 0.1508; switch off 0.1308); the flip and C3 move the par field and the captains' decks; BUMP-1D: was 0.0934 (ceiling 0.1134); the stand-in ladder moved (par field: the 12 new pieces); pool mean +0.3808 against the +-0.25 band (was +0.3434); before: carried (0.0266); 0.0266 -> 0.0934 s8-base (1e5fe4f 0.0633, 41a600a 0.0486)
  { rule: "poolBand", day: 2, v: 0.0312, ceiling: 0.0512 }, // BUMP-1F: was 0.0825 (ceiling 0.1025); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: was 0.1454 (ceiling 0.1654; switch off 0.1454); the flip and C3 move the par field and the captains' decks; BUMP-1D: was 0.0760 (ceiling 0.0960); the stand-in ladder moved (par field: the 12 new pieces); pool mean +0.3954 against the +-0.25 band (was +0.3260); before: new (red at s8-base: 0.0760; 1e5fe4f 0.0307, 41a600a 0.0182)
  { rule: "poolBand", day: 3, v: 0.1251, ceiling: 0.1451 }, // BUMP-1F: was 0.1522 (ceiling 0.1722); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: was 0.1841 (ceiling 0.2041; switch off 0.1949); the flip and C3 move the par field and the captains' decks; BUMP-1D: was 0.1137 (ceiling 0.1337); the stand-in ladder moved (par field: the 12 new pieces); pool mean +0.4341 against the +-0.25 band (was +0.3637); before: new (red at s8-base: 0.1137; 1e5fe4f 0.0971, 41a600a 0.0428)
  { rule: "poolBand", day: 4, v: 0.077, ceiling: 0.097 }, // BUMP-1F: was 0.1453 (ceiling 0.1653); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: was 0.1533 (ceiling 0.1733; switch off 0.1725); the flip and C3 move the par field and the captains' decks; BUMP-1D: was 0.0036 (ceiling 0.0236); the stand-in ladder moved (par field: the 12 new pieces); pool mean +0.4033 against the +-0.25 band (was +0.2536); before: new (red at s8-base: 0.0036; 1e5fe4f 0.0018, 41a600a passes)
  { rule: "poolBand", day: 5, v: 0.0357, ceiling: 0.0557 }, // BUMP-1F: was 0.1295 (ceiling 0.1495); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: was 0.1425 (ceiling 0.1625; switch off 0.1493); the flip and C3 move the par field and the captains' decks; BUMP-1D: new (the rule held before: v -0.0687); the stand-in ladder moved (par field: the 12 new pieces); pool mean +0.3925 against the +-0.25 band (was +0.1813)
  // HULL-ON H4, the captains pass (cap's rulings 6f4568477e66a600 = R3 section 3's fallback and ed10dd26da1a89fb = R13 Q9
  // (b)): v measured on the captains commit, ceiling v + 0.02. Cause GUARD (R3: +0.063 with GUARD off at the flip) with
  // FREE_JOINS a co-cause (WEAVER's hull at FREE_JOINS_HULL's 1500: the gap -0.021 -> -0.026; GUARD off on the WEAVER tree
  // +0.043, still under 0.05). No least change clears it: three day-4 PvE plates moved 0.030 of the 0.076 needed.
  { rule: "slotGap", day: 3, a: "medium", b: "hard", v: 0.0257, ceiling: 0.0457 }, // BUMP-1F: new (the rule held at BUMP-1E); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks
  { rule: "slotGap", day: 4, a: "medium", b: "hard", v: 0.0351, ceiling: 0.0551 }, // BUMP-1F: was 0.0245 (ceiling 0.0445); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: was 0.0601 (ceiling 0.0801; switch off: the rule holds); the flip and C3 move the par field and the captains' decks; BUMP-1D: was 0.0721 (ceiling 0.0921); the stand-in ladder moved (par field: the 12 new pieces); before: carried (0.0763); 0.0763 -> 0.0721 s8-base (1e5fe4f 0.0763, 41a600a -0.0350)
  { rule: "slotGap", day: 5, a: "medium", b: "hard", v: 0.034, ceiling: 0.054 }, // BUMP-1F: new (the rule held at BUMP-1E); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks
  { rule: "slotGap", day: 6, a: "easy", b: "medium", v: 0.0013, ceiling: 0.0213 }, // BUMP-1F: was 0.164 (ceiling 0.184), the 88th entry of BUMP-1E, the INVERTED ORDER (Easy +0.2374 below Medium +0.3514; F7): the order is back at this tip, Easy +0.2011 above Medium +0.1524 (RULING-BUMP1F-R2 R2.1 Q3: days 1-10 by the margin), and the gap 0.0487 misses the rule's 0.05 by 0.0013, so the entry stays as a plain THIN GAP in the right order (the cause of the move is not isolated here: no captain was tuned in P6; run 2's one step was OLD BULWARK's)
  { rule: "slotGap", day: 9, a: "easy", b: "medium", v: 0.0367, ceiling: 0.0567 }, // BUMP-1F: was 0.0106 (ceiling 0.0306); GATES and ENCHANT on and ENCHANT-2's rival words move the par field and the captains' decks; BUMP-1E: new (the rule held at BUMP-1D; switch off: the rule holds); the flip and C3 move the par field and the captains' decks
  { rule: "slotGap", day: 10, a: "easy", b: "medium", v: 0.0536, ceiling: 0.0736 }, // BUMP-1F: was 0.0466 (ceiling 0.0666; the order held, a gap of 0.0034); DAY 10 IS A THIN GAP, an INVERSION under 0.015: Easy -0.0631 below Medium -0.0595 (-0.0036), and J5 at K 96 on the frozen tip has the pair in the right order (REPORT R4.8, bench/j5-fz: day 10 Easy 11.4% < Medium 15.4% < Hard 33.6% foe win rate), so by RULING-BUMP1F-R2 R2.1 Q3 it is pinned the way BUMP-1E pinned its thin gaps (v = 0.05 + 0.0036); BUMP-1E: new (the rule held at BUMP-1D; switch off: the rule holds)
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
