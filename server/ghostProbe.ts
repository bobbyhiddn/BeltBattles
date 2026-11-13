// The uploads step's live check (0.8.0 U2 M2; REQ-BFG-016, REQ-BFG-009), a port of 0.7.0 U1's probe (cap_gamma, uploads-070
// d145bc5) to bb-0.8.0, and since BELTS (REQ-BFG-043, REQ-BFG-044) to bb-0.8.3: the same four heroes and the same checks,
// under the rules string BELTS ships (belt slots by level and the hero's two gold upgrades change which decks are legal,
// not who may travel). It does what a player's page does, from outside, against a base URL. It makes a fresh device
// identity with the game's own identity and signing code (src/net/identity.ts loadIdentity over an in-memory key store:
// the private key is generated non-extractable and never leaves this process). Each POST /v1/ghosts sends the canonical
// bytes the game's submitGhost sends (encodeSnapshot), signed with identity.sign. The checks, in order:
//   furnace-signed      the FURNACE start deck, day 1, 0 wins, 5 lives                         -> 201 and its ghost id
//   furnace-unsigned    the same bytes, without x-bb-key and x-bb-sig                          -> 401
//   dishonest-signed    that deck with 1000 more hull than day 1's budget pays for             -> 422, validateUpload's budget error
//   unreachable-signed  that honest deck with a record no run carries: day 1, 0 wins, 1 life   -> 422, H2's record error
//   hero-WEAVER, hero-FOUNDRY, hero-BASTION: each hero's honest day-3 reference deck (heroRefBuild) at 1 win and 5 lives,
//                       a record a run carries into dusk 3 (records.ts isReachable)            -> 201 each
//   hero-METRONOME, hero-SIPHON: the same, for the two heroes bb-0.10.0 does not take (FLIP-X2: release X adds no hero; BAL-2: nor does 0.9.1; Y7b2: nor does release Y; Z-BUMP: nor does release Z; AZ-BUMP: nor does the hull release). The game's encoder
//                       refuses them, so their bytes are the canonical text built by hand     -> 400, the strict decode's
//                       hero gate naming bb-0.8.3 and the hero
// Z-PREP (REQ-BFG-073; LC-1 REPORT 9.3), two more rows, under PROBE_RULES with LAST CHANCE (Z-BUMP: the switch is gone;
// the rules gate decides, rulesGate.ts lastChanceGateProblem(PROBE_RULES), as for any record):
//   lastchance-signed   FURNACE's start deck with its six dawn runes and the HULL card (+LAST_CHANCE_HULL), dusk 6 at 0 wins
//                       and 2 lives after a LAST CHANCE on day 5, with its seed                -> 201 and its ghost id
//   lastchance-day3     the same with its LAST CHANCE on day 3, which no run carries           -> 422, the record error
// Under rules before LAST_CHANCE_RULES the plan would be exactly the nine rows above, in that order, byte for byte.
// AZ-BUMP (REQ-BFG-077, REQ-BFG-078; the hull release's bump to bb-0.10.0), two more rows, under PROBE_RULES with the NPC
// day (the rules gate decides, rulesGate.ts npcDayGateProblem(PROBE_RULES), as for any record):
//   npcday-signed       WEAVER's start deck with its two dawn runes, dusk 2 at 1 win and 5 lives, with its seed and the
//                       road log of its two warlord wins (day 1 EASY, no drop; day 2 MEDIUM, its seeded drop SCATTER)
//                                                                                              -> 201 and its ghost id
//   npcday-forged       the same with day 2's drop forged (DARTGUN, another part of that warlord's pool)
//                                                                                              -> 422, the road error
// Under rules before NPC_DAY_RULES the plan would be exactly the eleven rows above, in that order, byte for byte.
// HULL-ON (REQ-BFG-096; the flip, HEARTS; cap's ruling 12a42239093fb6ec, Q2): the probe writes its records under
// PROBE_RULES, and the server judges each by the rules gate heartsFor(PROBE_RULES) (records.ts: the hearts model, runs start
// at HEARTS_START), so every row's lives go through that gate (probeHasHearts) and come from the hearts rule, never typed:
// the honest, dishonest, hero and NPC-day rows hold a run's start (HEARTS_START: 10 hearts), the unreachable row stays
// day 1 at 1 (no run holds less than its start at dusk 1, on either scale) and is refused with the server's own message,
// and the LAST CHANCE rows sit at the first dusk after LAST CHANCE fires on a run that loses every dusk, stepped with
// heartsDusk until heartsLastChanceFires (day 6: 9 8 7 5 3, then 1), so dusk 7 at 0 wins and 1 heart (probeLastChance).
// Under rules without hearts (heartsFor false) the rows are the 5-lives rows above, as before.
// BUMP-1D (REQ-BFG-059, REQ-BFG-116; the 10-wins release's bump to bb-0.11.0; RULING-BUMP-R1 R1.2): the long run (RUN-1) is the
// game's rule, so under PROBE_RULES (probeHasLongRun: the rules gate longRunFor) the server asks every upload to STATE its
// `losses`, the dusks the run lost before this one (snapshot v3; records.ts lossesProblem: 422 without it; the record check
// reads day - 1 = wins + losses + draws). Every row above now states its own, the dusks that were not wins or draws: 0 on the
// start rows (the hero rows' second dusk is a draw), and on the LAST CHANCE rows every dusk before theirs (day - 1: all lost, so
// the hearts rule's steps, below, and `losses` agree). A run has no last day, so two more rows follow the thirteen:
//   longrun-signed      FURNACE's day-12 reference deck with its twelve dawn runes, dusk 12 at 9 wins, 2 draws and no loss (the
//                       most wins a run ghost carries: a dusk before the 10th win), with its seed and `losses` 0   -> 201 and its ghost id
//   longrun-nolosses    the same deck and record without `losses`, which RUN-1's upload check refuses              -> 422, lossesProblem's error
// Under rules before LONG_RUN_RULES (or with the switch off) the plan would be exactly the thirteen rows above, without `losses`.
// BUMP-1E (REQ-BFG-098; the scaling release's bump to bb-0.12.0): one more row, under PROBE_RULES with the twelve scaling pieces (the rules
// gate scaleWorld: PROBE_RULES at or after SCALE_RULES, with SCALE_RIGS on as the build ships):
//   scale-signed        FURNACE's day-1 deck of the first row plus one GRUDGE ROD (one of the seven new ids) on cell 5,3 beside its belt,
//                       dusk 1 at no win and the start's lives, `losses` 0                                           -> 201 and its ghost id
// A server of an older build refuses the id as an unknown item, so the 201 proves the live server is the build with the twelve.
// Under rules before SCALE_RULES (or with the switch off) the plan would be exactly the fifteen rows above.
// BUMP-1F (RULING-BUMP1F-R13 R13.3; REQ-BFG-059, ENDLESS-1): the four ENDLESS rows of the release lane's kit probe (endlessprobe.mjs of 0.9.13), ported, follow
// gates-signed, under PROBE_RULES with endless (the rules gate endlessFor: the switch on AND rules at or after ENDLESS_RULES, bb-0.12.0). All three POSTs hold
// FURNACE's day-14 reference deck with its fourteen dawn runes, its seed and no road log, as the dusk of day 14 of a run won on day 10 that went on into endless
// (10 wins, `losses` 0, mode "endless", victoryDay 10, 3 endless wins and 3 hearts, `lives` 3):
//   endless-honest      the snapshot as it stands                                                                    -> 201 and its ghost id
//   endless-wins-cap    the same with endlessWins 30, the win that ends endless (the decoder takes 0..29)            -> 400, snapshot.endlessWins
//   endless-norecord    the same with 3 endless wins and 2 hearts (`lives` 2), a record no endless leads to           -> 422, endlessRecordProblem's record error
//   endless-match       GET /v1/ghosts/match?rules=<PROBE_RULES>&runs=5&day=14&wins=2&lives=3&player=other-player&mode=endless
//                                                                                                                   -> 200, a ghost whose snapshot.mode is "endless"
// The fourth is no POST and no deck: runProbe sends it after the POSTs and before the profile rows, and the stored count is taken before it. It serves the first
// row's own deck (the only endless ghost of day 14 unless real players' are about). Under rules before ENDLESS_RULES (or with the switch off) the plan would be
// exactly the seventeen rows above and there is no fourth check.
// BUMP-1I (REQ-BFG-125, VETERAN; the bump to bb-0.16.0): two more GETs, no deck, under PROBE_RULES with VETERAN (probeHasVeteran: the switch on AND PROBE_RULES at or after
// VETERAN_RULES), sent after the endless match and before the profile rows (the stored count is taken before them):
//   veteran-match       GET /v1/ghosts/match?rules=<PROBE_RULES>&runs=5&day=1&wins=0&lives=<the start hearts>&player=other-player&streak=2
//                                                                                    -> 200, a ghost (a veteran's request on the start record, which the seed pool always covers)
//   veteran-bad         the same request with streak=x                                -> 400, the error "streak: expected an integer in 0..99"
// A server of a build that does not read `streak` answers the second row as it answers any request (never 400), so the pair tells a build that reads it from one that does not.
// Under rules before VETERAN_RULES (or with the switch off) there are no veteran rows: the plan is exactly the checks above them.
// PROFILE-UP (REQ-BFG-074 clause 4, backlog #371): `--profile` (opt-in; anywhere among the arguments) adds two PUT /v1/profile rows
// after the POSTs, from the same fresh identity, and nothing else changes without the flag:
//   profile-signed      a minimal profile (1 run, 1 dusk win, best day 2, FURNACE won; no unlocks), signed in the profile
//                       domain                                                                   -> 200 and the same bytes back
//   profile-badsig      the same body with its signature broken (first character changed)        -> 401, the signature error
// The profile rows store one record, profiles/<probe player id>.json on Tigris (<data>/profiles/<id>.json on jsonl), which
// ghost-admin's remove-player does not know: delete that object by hand after a --profile probe. The deck count below counts
// decks only.
// Exactly ten decks are stored (BUMP-1F R13.3: was eight, a count the later rows had left behind), each its own record under the probe's player: FURNACE, WEAVER, FOUNDRY, BASTION,
// FURNACE's LAST CHANCE deck, WEAVER's NPC-day deck, FURNACE's day-12 deck (BUMP-1D), FURNACE's GRUDGE ROD deck (BUMP-1E), FURNACE's FUSER-and-word deck (BUMP-1F) and
// FURNACE's endless day-14 deck (BUMP-1F, R13.3; ten decks in all, nine under rules without endless, eight under rules without the gates and the words, seven
// under rules without the scaling pieces, six without the long run, five without the NPC day, four without LAST CHANCE).
// Built by `npm run build:server` beside ghost-admin.mjs:  node server/dist/ghost-probe.mjs <base-url> <id-file>
// It writes the probe's player id to <id-file> before the first POST, so the clean-up (ghost-admin.mjs remove-player)
// always has it, and it refuses an <id-file> that already holds an id (that earlier probe's player is not cleaned up yet).
// It prints one line per check (PASS or FAIL, name, expected, got), then the player id, then a summary with the number of
// decks the server stored for this player. Exit 0 only if every check matched; 1 if a check failed or got no answer; 2
// for a usage error (nothing sent). It refuses to run unless this build's RULES_VERSION is PROBE_RULES (bb-0.16.0; BUMP-1I: was bb-0.15.0; BUMP-1H: was bb-0.14.0; BUMP-1G: was bb-0.13.0; BUMP-1F: was bb-0.12.0; BUMP-1E: was bb-0.11.0; BUMP-1D: was bb-0.10.0). There is no secret
// to print: the key is non-extractable, and neither the public key nor a signature is printed. No network but the base
// URL. Its expectations are written out here, not read from the code under test (the rules gate, the record model).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { KEY_HEADER, PROFILE_PREFIX, SIG_HEADER, loadIdentity, memoryKeyStore } from "../src/net/identity";
import { checkBuildShape, encodeSnapshot, ghostId, SNAPSHOT_V3, SNAPSHOT_VERSION, type GhostSnapshot } from "../src/net/snapshot";
import { RULES_VERSION, type HeroId } from "../src/sim/content";
import { heroRefBuild, heroStartBuild } from "../src/sim/heroBuilds";
import { botTakeRune } from "../src/sim/runes"; // FLIP-X2 (cap's ruling 5d6d83ef57d1494c): the honest decks' dawn runes
import { LAST_CHANCE_HULL } from "../src/sim/lastChance"; // Z-PREP (REQ-BFG-073): the flip's two rows
import { lastChanceGateProblem } from "../src/net/rulesGate"; // Z-BUMP (REQ-BFG-073): the two rows by PROBE_RULES, through the rules gate
import { npcDayGateProblem } from "../src/net/rulesGate"; // AZ-BUMP (REQ-BFG-077, REQ-BFG-078): the NPC day's two rows, through the rules gate
import type { RoadEntry } from "../src/sim/npcDay"; // AZ-BUMP: the NPC-day rows' road log
import { openRunesFor } from "../src/net/rulesGate"; // OPEN-1 (REQ-BFG-109): the honest decks' offer rule, by PROBE_RULES
// HULL-ON (REQ-BFG-096; cap's ruling 12a42239093fb6ec, Q2): the rows' lives by PROBE_RULES's hearts gate, from the hearts rule
import { heartsFor } from "../src/net/rulesGate";
import { HEARTS_START, heartsDusk, heartsLastChanceFires } from "../src/sim/hearts";
import { RUN_DAYS, START_LIVES } from "../src/sim/content";
// BUMP-1D (RUN-1; REQ-BFG-059, REQ-BFG-116): the long run's rows and every row's `losses`, through the rules gate
import { longRunFor } from "../src/net/rulesGate";
// BUMP-1E (REQ-BFG-098): the scaling release's row: a deck holding one of the seven new pieces, under rules that have them
import { scaleWorld } from "../src/net/rulesGate";
// BUMP-1F (REQ-BFG-052, REQ-BFG-085): the gates-and-words row: a deck holding a FUSER and a rig with one word, under rules that have both
import { enchantWorld, gatesWorld } from "../src/net/rulesGate";
// BUMP-1F (RULING-BUMP1F-R13 R13.3; REQ-BFG-059): the ENDLESS rows: an honest endless dusk of a run won on day 10, under rules that have endless
import { endlessFor } from "../src/net/rulesGate";
// BUMP-1I (REQ-BFG-125): the VETERAN rows: a veteran's match request and a malformed streak, under rules that have VETERAN
import { rulesAtLeast } from "../src/net/rulesGate";
import { VETERAN_RULES, VETERAN_STREAK_MAX, veteranRules } from "../src/net/veteran";
import { splitProblem } from "../src/sim/split";
import { bestSpot, placeRigAt } from "../src/sim/beltside";
import { kx, ky } from "../src/sim/deck";
import { enchanterWords } from "../src/sim/enchantSources";
import { enchantProblem } from "../src/sim/enchant";

/** The rules this probe's expectations are written for: the hull release's (bb-0.10.0, AZ-BUMP's bump, with the NPC day's
 *  two rows; release Z's bb-0.9.7 with LAST CHANCE's two rows, release Y's bb-0.9.3, BAL-2's bb-0.9.1, release X's
 *  bb-0.9.0, RUNES-1's bb-0.8.7, PACKS's bb-0.8.6, BELTS's bb-0.8.3 and 0.8.0's bb-0.8.0 before, the same heroes). */
export const PROBE_RULES = "bb-0.16.0"; // BUMP-1I (REQ-BFG-125): VETERAN ships on (was bb-0.15.0); BUMP-1H (REQ-BFG-124): the difficulty curve ships on (was bb-0.14.0); BUMP-1G (REQ-BFG-033): the effect floor ships on (was bb-0.13.0); BUMP-1F (REQ-BFG-052, REQ-BFG-085): GATES and ENCHANT ship on (was bb-0.12.0); BUMP-1E (REQ-BFG-098): the scaling release (was bb-0.11.0); BUMP-1D (REQ-BFG-059, REQ-BFG-116): the bump (was bb-0.10.0; AZ-BUMP: was bb-0.9.7; Z-BUMP: was bb-0.9.3; Y7b2: was bb-0.9.1; BAL-2: was bb-0.9.0)
/** FLIP-X2 (cap's ruling 5d6d83ef57d1494c): under bb-0.9.0 an upload holds exactly one rune a dawn (validateUpload's
 *  player mode). The probe's honest decks take theirs as the bots do (runes.ts botTakeRune at each dawn on this run seed:
 *  the grants on the build, every pick in its dawn's offer), and the snapshot carries the seed (v3), so the server
 *  re-derives each offer. */
export const PROBE_SEED = 20261005;
/** `build` holding the bots' picks at the dawns of days 1..day on PROBE_SEED. */
export function probeRunes(build: GhostSnapshot["build"], day: number): GhostSnapshot["build"] {
  const b: GhostSnapshot["build"] = JSON.parse(JSON.stringify(build));
  for (let d = 1; d <= day; d++) {
    // OPEN-1 (REQ-BFG-109): the offers of the probe's own rules (openRunesFor), the rule the server checks them by
    if (!botTakeRune(b, PROBE_SEED, d, b.hero, true, false, 0, openRunesFor(PROBE_RULES))) throw new Error(`ghost-probe: no rune for ${b.hero} at the dawn of day ${d}`);
  }
  return b;
}
/** The heroes bb-0.11.0 takes (BUMP-1D: the bump adds no hero; was bb-0.10.0), as its hero gate names them (rulesGate.ts RULES_HEROES), written out. */
export const PROBE_ACCEPTED = "FURNACE, WEAVER, FOUNDRY, BASTION";
/** After FURNACE: the heroes whose honest decks must be stored (201), then those bb-0.11.0 refuses (400), in posting order. */
export const STORED_HEROES: readonly HeroId[] = ["weaver", "foundry", "bastion"];
export const REFUSED_HEROES: readonly HeroId[] = ["metronome", "siphon"];
/** The hero rows' dusk: day 3 at 1 win and 5 lives, a record a run carries into dusk 3. HULL-ON (HEARTS): the rows before
 *  hearts; under rules with hearts the plan reads probeDusk(HERO_DUSK) (the start's hearts: a win and a draw). */
export const HERO_DUSK = { day: 3, wins: 1, lives: 5 } as const;
/** The unreachable row's dusk: day 1 with 1 life (every run starts day 1 with 5 lives). HULL-ON (HEARTS): on both scales:
 *  dusk 1 holds only a run's start (probeStartLives: 10 hearts, or 5 lives before hearts), never 1. */
export const UNREACHABLE_DUSK = { day: 1, wins: 0, lives: 1 } as const;
/** HULL-ON (REQ-BFG-096; the flip, HEARTS; cap's ruling 12a42239093fb6ec, Q2): do the probe's records read on hearts? The
 *  server judges a record under PROBE_RULES by the rules gate heartsFor(PROBE_RULES) (records.ts reachableRecords), so the
 *  probe asks the same gate (as OPEN-1's rows ask openRunesFor): false before HEARTS_RULES or with the switch off. */
export const probeHasHearts = (): boolean => heartsFor(PROBE_RULES);
/** HULL-ON (HEARTS): a run's lives at its start under the probe's rules: HEARTS_START with hearts, else START_LIVES (5). */
export const probeStartLives = (): number => (probeHasHearts() ? HEARTS_START : START_LIVES);
/** HULL-ON (HEARTS): a start-lives row's dusk (the honest, dishonest, hero and NPC-day rows: no heart lost, a run's
 *  start) under the probe's rules: `d` as written (5 lives) without hearts; with hearts, its lives are the start's.
 *  BUMP-1D (RUN-1): and its `losses`, when the row states them (`stated`), travel with it. */
export const probeDusk = (d: { day: number; wins: number; lives: number; losses?: number }): { day: number; wins: number; lives: number; losses?: number } =>
  ({ ...d, lives: probeStartLives() });
/** BUMP-1D (RUN-1; REQ-BFG-059, REQ-BFG-116): does the probe's rules version have the long run (the rules gate: PROBE_RULES at
 *  or after LONG_RUN_RULES, with the switch on, as the build ships)? Then the server asks every upload to STATE its `losses`
 *  (records.ts lossesProblem; the decoder takes the field only there), so every row states its own and the plan has the two
 *  long-run rows (LONG_DUSK). Under older rules, or with the switch off, the decoder refuses the field: the plan is the
 *  thirteen rows of AZ-BUMP's probe, none stating `losses`. */
export const probeHasLongRun = (): boolean => longRunFor(PROBE_RULES);
/** BUMP-1D: a row's `losses` as it states them: `n` under the long run, else none (the field is refused there). Day - 1 =
 *  wins + losses + draws, so `n` is what the row's record says it lost, whatever else it won or drew. */
const stated = (n: number): number | undefined => (probeHasLongRun() ? n : undefined);
/** The decks the probe stores when every check passes: FURNACE's and STORED_HEROES'. */
export const PROBE_STORED = 1 + STORED_HEROES.length;
/** Z-PREP (REQ-BFG-073): the LAST CHANCE rows' dusk (five losses: the early-loss refund lifts day 3, the loss at dusk 5
 *  leaves 1 life and LAST CHANCE gives one back), the honest row's LAST CHANCE day and the forged row's. */
export const LC_DUSK = { day: 6, wins: 0, lives: 2 } as const;
export const LC_DAY = 5;
/** HULL-ON (HEARTS): the forged row's LAST CHANCE day, before the earliest one on either scale (day 5 on 5 lives, day 6
 *  on hearts: probeLastChance), so no run carries it. */
export const LC_FORGED_DAY = 3;
/** HULL-ON (REQ-BFG-096; the flip, HEARTS; cap's ruling 12a42239093fb6ec, Q2): the LAST CHANCE rows' dusk and the honest
 *  row's LAST CHANCE day under the probe's rules. With hearts (probeHasHearts), derived from the hearts rule as the server's
 *  record model steps it (records.ts heartsRecords): a run that loses every dusk from day 1, from HEARTS_START, each loss
 *  heartsDusk's step, until the first loss on which heartsLastChanceFires (day 6: 9 8 7 5 3, then 1); its dusk is the next
 *  day's, at 0 wins and the hearts LAST CHANCE leaves (1). Without hearts: LC_DUSK and LC_DAY, as before. */
export function probeLastChance(): { dusk: { day: number; wins: number; lives: number }; day: number } {
  if (!probeHasHearts()) return { dusk: LC_DUSK, day: LC_DAY };
  let hearts = HEARTS_START;
  for (let d = 1; d < RUN_DAYS; d++) {
    const step = heartsDusk(hearts, d, "loss", false);
    if (heartsLastChanceFires(d, "loss", Math.max(0, hearts - step.cost), false)) return { dusk: { day: d + 1, wins: 0, lives: step.hearts }, day: d };
    hearts = step.hearts;
  }
  throw new Error("ghost-probe: LAST CHANCE never fires on the hearts rule before the run's last day");
}
/** Z-BUMP (REQ-BFG-073): does the probe's rules version have LAST CHANCE (the rules gate: PROBE_RULES at or after
 *  LAST_CHANCE_RULES)? The switch is gone; this asks what the switch asked. */
export const probeHasLastChance = (): boolean => lastChanceGateProblem(PROBE_RULES) === null;
/** AZ-BUMP (REQ-BFG-077, REQ-BFG-078): the NPC-day rows' hero, dusk and road log on PROBE_SEED, written out (the server
 *  re-derives each warlord, its deck and its seeded roll from the seed: validate.ts roadProblem). Day 1's EASY warlord
 *  (BRASSWICK) rolled no drop; day 2's MEDIUM warlord (LACEWING) rolled SCATTER. The forged row names DARTGUN, another
 *  part of LACEWING's pool, as day 2's drop. */
export const NPC_HERO: HeroId = "weaver";
export const NPC_DUSK = { day: 2, wins: 1, lives: 5 } as const;
export const NPC_ROAD: readonly RoadEntry[] = [{ day: 1, tier: "easy", outcome: "win" }, { day: 2, tier: "medium", outcome: "win", drop: "scatter" }];
export const NPC_FORGED_DROP = "dartgun";
/** The server's answer to the forged drop: validateUpload's road line (validate.ts roadProblem), inside "deck failed validation". */
export const NPC_ROAD_ERROR = `road: day 2: the seeded roll of LACEWING gave scatter, not ${NPC_FORGED_DROP}`;
/** AZ-BUMP: does the probe's rules version have the NPC day (the rules gate: PROBE_RULES at or after NPC_DAY_RULES, with the
 *  switch on, as the build ships)? */
export const probeHasNpcDay = (): boolean => npcDayGateProblem(PROBE_RULES) === null;
/** BUMP-1D (RUN-1; REQ-BFG-059, REQ-BFG-116): the long-run rows' hero and dusk, written out. A run has no last day, so its
 *  days go on past 10 (snapshot.ts maxDayFor: 25 under PROBE_RULES): FURNACE's reference deck of day 12 (heroRefBuild: the
 *  day-10 layout, the day's own hull) with its twelve dawn runes, at the dusk of day 12 after 9 wins and 2 draws, no dusk
 *  lost. 9 wins is the most a run ghost carries (maxWinsFor: a run is over at its 10th, WIN_GOAL - 1), 2 draws are well under
 *  the most an upload may state (MAX_RUN_DRAWS, 8), and no heart is lost, so the record holds on both scales (probeDusk:
 *  the start's lives, 10 hearts, or 5 lives before hearts) and follows no cost of the hearts rule. */
export const LONG_HERO: HeroId = "furnace";
export const LONG_DUSK = { day: 12, wins: 9, lives: 5 } as const;
/** RUN-1's answer to an upload under a long run's rules that does not state `losses` (records.ts lossesProblem, POST step 6,
 *  after the record check), written out. */
export const LOSSES_ERROR = "losses: a long run's upload states the dusks the run lost (snapshot.losses is missing; day - 1 = wins + losses + draws needs it)";
/** BUMP-1E (REQ-BFG-098; the scaling release, bb-0.12.0): the scale row's hero, dusk, piece and cell, written out. The honest day-1
 *  FURNACE deck of the first row (its start deck and its day-1 rune, no dusk fought) plus ONE of the seven new pieces, GRUDGE ROD (a
 *  common rig, 3 G, one cell), beside FURNACE's belt (the belt runs up column 4; cell 5,3 is free). A server of an older build refuses
 *  the deck as an unknown item (validateBuild: `is unknown item "grudgerod"`); the build with the twelve stores it. So a 201 here
 *  proves the live server knows the new ids (a coordinated client + server deploy: SCALE-2d). */
export const SCALE_HERO: HeroId = "furnace";
export const SCALE_DUSK = { day: 1, wins: 0, lives: 5 } as const;
export const SCALE_PIECE = "grudgerod";
export const SCALE_CELL = { x: 5, y: 3 } as const;
/** BUMP-1E: does the probe's rules version have the twelve scaling pieces (the rules gate: PROBE_RULES at or after SCALE_RULES, with
 *  the switch on, as the build ships)? Under older rules, or with the switch off, the new ids are unknown items: no scale row. */
export const probeHasScale = (): boolean => scaleWorld(PROBE_RULES);
/** BUMP-1F (REQ-BFG-052, REQ-BFG-085): the gates-and-words row. FURNACE's honest day-3 deck (dusk 3 after a win and a draw, the day of the ENCHANTER's
 *  first wagon) plus a FUSER on a belt tile and a WHETSTONE beside the belt holding ONE word, one of the two the ENCHANTER offers on day 3 on the probe's
 *  run seed (PROBE_SEED: the server re-derives the offers), signed: 201 under bb-0.13.0. It proves the live server knows the gate ids and the word
 *  codes; a server of an older build answers 422 (unknown item "fuser"). */
export const GATES_HERO: HeroId = "furnace";
export const GATES_DUSK = HERO_DUSK;
export const GATES_PIECE = "fuser";
export const GATES_RIG = "whetstone";
/** Does the probe's rules version have the three gates and the eight words (the rules gate: PROBE_RULES at or after GATES_RULES and ENCHANT_RULES, with
 *  both switches on, as the build ships)? Under older rules, or with a switch off, the ids and the fields are refused: no gates row. */
export const probeHasGates = (): boolean => gatesWorld(PROBE_RULES) && enchantWorld(PROBE_RULES);
/** BUMP-1F (RULING-BUMP1F-R13 R13.3; REQ-BFG-059, ENDLESS-1): the four ENDLESS rows, written out: the kit probe's of 0.9.13 (W/ref/live0913/endlessprobe.mjs, whose
 *  snapshot came from the game's own play), ported. A run won on its 10th dusk (victoryDay 10: ten wins and none lost, so `losses` 0) goes on into endless with
 *  ENDLESS_LIVES (3) fresh hearts, wins the dusks of days 11, 12 and 13 and arrives at day 14 with 3 endless wins and its 3 hearts: the snapshot of that dusk says
 *  `wins` 10 (the victory), `lives` 3 (the endless hearts; the decoder holds `lives` equal to `endlessLives`), mode "endless", endlessWins 3, endlessLives 3 and
 *  victoryDay 10, after the seed and the losses. The deck is FURNACE's day-14 reference deck (heroRefBuild: a deck a player could own that day) with its fourteen
 *  dawn runes (probeRunes), uploaded with its seed and without a road log (the log is optional). Rows 1-3 are POSTs (below), row 4 a GET (ENDLESS_MATCH). */
export const ENDLESS_HERO: HeroId = "furnace";
export const ENDLESS_DUSK = { day: 14, wins: 10, lives: 3, victoryDay: 10, endlessWins: 3, endlessLives: 3 } as const;
/** Row 2's endless wins: ENDLESS_WIN_CAP (30), the win that ends endless, which no snapshot carries (the decoder takes 0..29). */
export const ENDLESS_CAP_WINS = 30;
/** Row 3's record: in the three endless dusks (days 11-13) 3 endless wins leave all 3 hearts, never 2 (`lives` follows the hearts). */
export const ENDLESS_NORECORD = { endlessWins: 3, endlessLives: 2, lives: 2 } as const;
/** The strict decode's answer to endlessWins 30 (snapshot.ts v3Fields: an integer in 0..ENDLESS_WIN_CAP - 1), written out. */
export const ENDLESS_WINS_ERROR = "snapshot.endlessWins: expected an integer in 0..29";
/** The server's answer to a record no endless leads to (records.ts endlessRecordProblem, POST step 6), written out: 3 endless wins and 2 hearts, a run won on day 10. */
export const endlessRecordError = (r: { endlessWins: number; endlessLives: number }): string =>
  `record: ${r.endlessWins} endless wins and ${r.endlessLives} hearts is no record a run won on day ${ENDLESS_DUSK.victoryDay} carries into endless dusk ${ENDLESS_DUSK.day}`;
/** Does the probe's rules version have endless (the rules gate: PROBE_RULES at or after ENDLESS_RULES, with the switch on, as the build ships)? Under older rules, or with
 *  the switch off, the decoder refuses the endless fields (400 on the server) and the match route refuses `mode=endless`: no endless rows. */
export const probeHasEndless = (): boolean => endlessFor(PROBE_RULES);

/** BUMP-1I (REQ-BFG-125): does the probe's rules version have VETERAN (the switch on AND PROBE_RULES at or after VETERAN_RULES, as the build ships)? Under older rules, or with
 *  the switch off, the plan has no veteran rows. */
export const probeHasVeteran = (): boolean => veteranRules() && rulesAtLeast(PROBE_RULES, VETERAN_RULES);
/** The decks the probe stores when every check passes: PROBE_STORED, the honest LAST CHANCE deck under rules with it, the
 *  honest NPC-day deck under rules with the NPC day (AZ-BUMP), the honest day-12 deck under rules with the long run
 *  (BUMP-1D), the GRUDGE ROD deck under rules with the scaling pieces (BUMP-1E), the FUSER-and-word deck under rules with the gates and the
 *  words (BUMP-1F), and the honest endless deck under rules with endless (BUMP-1F, RULING-BUMP1F-R13 R13.3: only row 1 of the four stores a deck). */
export const probeStored = (): number => PROBE_STORED + (probeHasLastChance() ? 1 : 0) + (probeHasNpcDay() ? 1 : 0) + (probeHasLongRun() ? 1 : 0) + (probeHasScale() ? 1 : 0) + (probeHasGates() ? 1 : 0) + (probeHasEndless() ? 1 : 0);
export const PROBE_TIMEOUT_MS = 15_000;
export const PROBE_USAGE = "usage: node server/dist/ghost-probe.mjs <base-url> <id-file> [--profile]   (base url: http(s)://host[:port], no path; an id file that holds no id yet; --profile also PUTs a profile)"; // PROFILE-UP: the opt-in flag
/** The server's answer to a POST without the signing headers (identity.ts uploadHeaderError). */
export const UNSIGNED_ERROR = `unsigned upload: the ${KEY_HEADER} and ${SIG_HEADER} headers are required`;
/** H2's answer to a record no run can carry into that dusk (server/app.ts, POST step 6). BUMP-1D (RUN-1): an upload that
 *  states its `losses` hears them in it ("... lives and 0 losses is no record ..."); one that does not, as before. */
export const recordError = (d: { day: number; wins: number; lives: number }, losses?: number): string =>
  `record: ${d.wins}W ${d.lives} lives${losses !== undefined ? ` and ${losses} losses` : ""} is no record a run carries into dusk ${d.day}`;
/** Z-PREP (REQ-BFG-073): the same answer for an upload that carries a LAST CHANCE (server/app.ts, POST step 6). */
export const lcRecordError = (d: { day: number; wins: number; lives: number }, lcDay: number, losses?: number): string =>
  `${recordError(d, losses)} after a LAST CHANCE on day ${lcDay}`;
/** The strict decode's answer to a hero bb-0.11.0 does not take (snapshot.ts checkSnapshot, rulesGate.ts heroGateProblem). */
export const heroError = (hero: HeroId): string => `snapshot.hero: rules ${PROBE_RULES} accept only ${PROBE_ACCEPTED}, not ${hero.toUpperCase()}`;

export interface ProbeAnswer {
  status: number;
  text: string;
  id?: string;
  error?: string;
  errors?: string[];
}

/** One planned POST: the snapshot, the exact body text, signed or not, and what must come back. */
export interface PlannedPost {
  name: string;
  snapshot: GhostSnapshot;
  text: string;
  signed: boolean;
  expected: string;
  pass: (a: ProbeAnswer) => boolean;
}

export interface ProbeCheck {
  name: string;
  expected: string;
  got: string;
  ok: boolean;
  /** The answer's status; undefined when there was no answer. */
  status?: number;
}

export interface ProbeResult {
  playerId: string;
  checks: ProbeCheck[];
  ok: boolean;
  /** Checks the server answered 201 or 200: decks it holds for this player. BUMP-1F: the POST rows only (the endless match's 200 is no deck). */
  stored: number;
}

class ProbeUsageError extends Error {}

/** The base URL as an origin without a trailing slash: http(s), a host, and no path, query, fragment or credentials. */
export function probeBase(raw: string | undefined): string {
  let u: URL;
  try {
    u = new URL(raw ?? "");
  } catch {
    throw new ProbeUsageError(`not a URL: ${JSON.stringify(raw ?? "")}`);
  }
  if ((u.protocol !== "http:" && u.protocol !== "https:") || u.pathname !== "/" || u.search || u.hash || u.username || u.password) {
    throw new ProbeUsageError(`expected a bare http(s) origin such as https://beltbattles.fly.dev, not ${JSON.stringify(raw)}`);
  }
  return u.origin;
}

function errText(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  if (e.name === "AbortError" || e.name === "TimeoutError") return "timeout";
  const cause = (e as { cause?: unknown }).cause;
  return cause instanceof Error ? `${e.message}: ${cause.message}` : e.message;
}

const utf8 = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);

/**
 * The canonical text of `s` as the game's encoder writes it (encodeSnapshot: the decoder's key order, the build as the
 * strict shape check copies it), built without the encoder's rules gates. Only for what the encoder refuses under these
 * rules (the heroes it does not take; BUMP-1F: and endlessWins 30, endless-wins-cap's row); for every other snapshot it
 * equals encodeSnapshot(s) (tests/ghost-probe.test.ts).
 */
export function canonicalText(s: GhostSnapshot): string {
  return JSON.stringify({
    v: s.v, rules: s.rules, hero: s.hero, day: s.day, wins: s.wins, lives: s.lives,
    build: checkBuildShape(s.build, "snapshot.build", s.v), runId: s.runId, playerId: s.playerId, createdAt: s.createdAt,
    ...(s.name !== undefined ? { name: s.name } : {}), // PACKS M2: the player's name
    ...(s.seed !== undefined ? { seed: s.seed } : {}), // FLIP-X2: the v3 run seed, after the name (snapshot.ts V3_SNAPSHOT_FIELDS)
    // BUMP-1D (RUN-1; REQ-BFG-059): the dusks the run lost, right after the seed (snapshot.ts V3_SNAPSHOT_FIELDS: seed, losses, ...),
    // so the probe's own canonical bytes cover every row that states them as the encoder writes them
    ...(s.losses !== undefined ? { losses: s.losses } : {}),
    // BUMP-1F (RULING-BUMP1F-R13 R13.3; ENDLESS-1): the endless group after the losses, in snapshot.ts V3_SNAPSHOT_FIELDS order (mode, endlessWins,
    // endlessLives, victoryDay), so the probe's own canonical bytes cover its three endless rows as the encoder writes them (and the one it refuses)
    ...(s.mode !== undefined ? { mode: s.mode } : {}),
    ...(s.endlessWins !== undefined ? { endlessWins: s.endlessWins } : {}),
    ...(s.endlessLives !== undefined ? { endlessLives: s.endlessLives } : {}),
    ...(s.victoryDay !== undefined ? { victoryDay: s.victoryDay } : {}),
    // Z-BUMP (REQ-BFG-073, the flip): the taken LAST CHANCE, last of all { day, boon, id? } (snapshot.ts lastChanceField), so
    // the probe's own canonical bytes cover its two LAST CHANCE rows as the encoder writes them
    ...(s.lastChance !== undefined ? { lastChance: { day: s.lastChance.day, boon: s.lastChance.boon, ...(s.lastChance.id !== undefined ? { id: s.lastChance.id } : {}) } } : {}),
    // AZ-BUMP (REQ-BFG-077, REQ-BFG-078): the road log after it, last of all [{ day, tier, outcome, drop?, sabotaged? }]
    // (snapshot.ts roadField), so the probe's own canonical bytes cover its two NPC-day rows as the encoder writes them
    ...(s.road !== undefined ? { road: s.road.map((e) => ({ day: e.day, tier: e.tier, outcome: e.outcome, ...(e.drop !== undefined ? { drop: e.drop } : {}), ...(e.sabotaged ? { sabotaged: true } : {}) })) } : {}),
  });
}

/** PACKS M2 (REQ-BFG-063): the probe's player name: every upload under this build's rules (since PACKS's bb-0.8.6)
 *  carries one (POST /v1/ghosts refuses one without it, 422 "name: missing"). */
export const PROBE_NAME = "PROBE";

/** The snapshot `playerId` uploads at the dusk of `d.day` with `build`, under this build's rules. FLIP-X2: a build that
 *  holds runes travels as v3 with the run seed (PROBE_SEED), as the game's ghostOf writes it; a rune-less one as before.
 *  BUMP-1D (RUN-1): `d.losses`, when the row states them (`stated`), travel with it (v3 only, as ghostOf writes them). */
function dusk(playerId: string, hero: HeroId, d: { day: number; wins: number; lives: number; losses?: number }, build: GhostSnapshot["build"], runId: string, now: number): GhostSnapshot {
  const runes = (build.runes?.length ?? 0) > 0;
  return {
    v: runes ? SNAPSHOT_V3 : SNAPSHOT_VERSION, rules: RULES_VERSION, hero, day: d.day, wins: d.wins, lives: d.lives, build, runId, playerId, createdAt: now,
    name: PROBE_NAME, ...(runes ? { seed: PROBE_SEED } : {}),
    ...(d.losses !== undefined ? { losses: d.losses } : {}),
  };
}

/** BUMP-1D (RUN-1): the `losses` of a record whose every dusk before it was lost (the LAST CHANCE rows: no win, no draw), as
 *  the row states them: day - 1 - wins. */
const lostAll = (d: { day: number; wins: number }): number | undefined => stated(d.day - 1 - d.wins);

/** Z-PREP (REQ-BFG-073): FURNACE's start deck with its dawn runes of days 1..6 and the HULL card taken at the dawn of
 *  day 6, uploaded at dusk 6 (0W 2L) with a LAST CHANCE on `lcDay`. Only while the switch is on (the encoder and the
 *  decoder refuse the field otherwise). BUMP-1D (RUN-1): and its `losses`, every dusk before it (lostAll). */
function lastChanceDusk(playerId: string, lcDay: number, runId: string, now: number): GhostSnapshot {
  const lcDusk = probeLastChance().dusk; // HULL-ON (HEARTS; ruling 12a42239093fb6ec): the hearts rule's LAST CHANCE dusk (was LC_DUSK)
  const build = probeRunes(heroStartBuild("furnace"), lcDusk.day);
  build.hullBonus += LAST_CHANCE_HULL;
  return { ...dusk(playerId, "furnace", { ...lcDusk, losses: lostAll(lcDusk) }, build, runId, now), lastChance: { day: lcDay, boon: "hull" } };
}

/** AZ-BUMP (REQ-BFG-077, REQ-BFG-078): WEAVER's start deck with its dawn runes of days 1..2, uploaded at dusk 2 (1W 5L) with
 *  `road`, the road log of its two warlord fights (NPC_ROAD, or a forgery of it). Only under rules with the NPC day (the
 *  encoder and the decoder refuse the field otherwise). */
function npcDayDusk(playerId: string, road: readonly RoadEntry[], runId: string, now: number): GhostSnapshot {
  const build = probeRunes(heroStartBuild(NPC_HERO), NPC_DUSK.day);
  // HULL-ON (HEARTS; ruling 12a42239093fb6ec): day 1 won, so the start's lives (probeDusk: 10 hearts; 5 before hearts)
  // BUMP-1D (RUN-1): and the one dusk fought was won: no loss
  return { ...dusk(playerId, NPC_HERO, probeDusk({ ...NPC_DUSK, losses: stated(0) }), build, runId, now), road: road.map((e) => ({ ...e })) };
}

/** BUMP-1D (RUN-1; REQ-BFG-059, REQ-BFG-116): FURNACE's day-12 reference deck with its twelve dawn runes (probeRunes), uploaded
 *  at LONG_DUSK (9W and 2 draws at the start's lives) with its `losses` (0: `states`), or, for the forged row, without them.
 *  Only under rules with the long run (the encoder and the decoder refuse a day past 10 otherwise). */
function longRunDusk(playerId: string, states: boolean, runId: string, now: number): GhostSnapshot {
  const build = probeRunes(heroRefBuild(LONG_HERO, LONG_DUSK.day), LONG_DUSK.day);
  return dusk(playerId, LONG_HERO, probeDusk({ ...LONG_DUSK, ...(states ? { losses: 0 } : {}) }), build, runId, now);
}

/** BUMP-1E (REQ-BFG-098): FURNACE's honest day-1 deck (probeRunes of its start deck: the kiln and the day-1 rune) plus one GRUDGE ROD
 *  at SCALE_CELL, uploaded at SCALE_DUSK with its `losses` (0: `stated`). Only under rules with the scaling pieces (the decoder's
 *  strict shape check needs the def in ITEMS; validateUpload refuses the id under older rules or with the switch off). */
function scaleDusk(playerId: string, runId: string, now: number): GhostSnapshot {
  const build = probeRunes(heroStartBuild(SCALE_HERO), SCALE_DUSK.day);
  build.items.push({ uid: Math.max(0, ...build.items.map((p) => p.uid)) + 1, def: SCALE_PIECE, x: SCALE_CELL.x, y: SCALE_CELL.y });
  return dusk(playerId, SCALE_HERO, probeDusk({ ...SCALE_DUSK, losses: stated(0) }), build, runId, now);
}

/** BUMP-1F (REQ-BFG-052, REQ-BFG-085): FURNACE's honest day-3 deck (probeRunes of its start deck: the kiln and three dawn runes) plus a FUSER on the first belt tile
 *  of its belt that splitProblem allows, and a WHETSTONE at the best spot beside the belt holding the first word of the day-3 ENCHANTER offer that goes on a
 *  rig (WIDE needs a side, so it is left out), uploaded at GATES_DUSK with its `losses` (0: `stated`). The word is bought (4 G), the FUSER (6 G) and the rig
 *  fit the day's gold. Only under rules with the gates and the words. */
function gatesDusk(playerId: string, runId: string, now: number): GhostSnapshot {
  const build = probeRunes(heroStartBuild(GATES_HERO), GATES_DUSK.day);
  const cells = build.routes[0].cells;
  const t = cells.findIndex((c) => splitProblem(build as never, GATES_PIECE, c) === null);
  if (t < 0) throw new Error("ghost-probe: no belt tile takes the FUSER");
  const word = enchanterWords(PROBE_SEED, GATES_DUSK.day).find((w) => w !== "wide" && enchantProblem(GATES_RIG, w) === null);
  if (!word) throw new Error("ghost-probe: the day-3 ENCHANTER offers no word a rig takes");
  let uid = Math.max(0, ...build.items.map((p) => p.uid)) + 1;
  build.items.push({ uid: uid++, def: GATES_PIECE, x: kx(cells[t]), y: ky(cells[t]) });
  const spot = bestSpot(build as never, GATES_RIG);
  if (!spot) throw new Error("ghost-probe: no spot beside the belt takes the rig");
  const rig = placeRigAt(build as never, uid++, GATES_RIG, spot);
  rig.ench = word;
  return dusk(playerId, GATES_HERO, probeDusk({ ...GATES_DUSK, losses: stated(0) }), build, runId, now);
}

/** BUMP-1F (RULING-BUMP1F-R13 R13.3; REQ-BFG-059): FURNACE's day-14 reference deck with its fourteen dawn runes (probeRunes), uploaded as the ENDLESS dusk of
 *  ENDLESS_DUSK: the run won on day 10 (10 wins, `losses` 0: `stated`), `r` endless wins and hearts going into the fight (`lives` follows the hearts), mode
 *  "endless" and the victory day. Only under rules with endless (the decoder refuses the fields otherwise); without a road log. */
function endlessDusk(playerId: string, r: { endlessWins: number; endlessLives: number; lives: number }, runId: string, now: number): GhostSnapshot {
  const build = probeRunes(heroRefBuild(ENDLESS_HERO, ENDLESS_DUSK.day), ENDLESS_DUSK.day);
  return {
    ...dusk(playerId, ENDLESS_HERO, { day: ENDLESS_DUSK.day, wins: ENDLESS_DUSK.wins, lives: r.lives, losses: stated(0) }, build, runId, now),
    mode: "endless", endlessWins: r.endlessWins, endlessLives: r.endlessLives, victoryDay: ENDLESS_DUSK.victoryDay,
  };
}

/** The nine POSTs, in order, for `playerId` at time `now` (eleven with LAST CHANCE; thirteen with the NPC day too, as
 *  bb-0.10.0 has both; fifteen with the long run, as bb-0.11.0 has, BUMP-1D; sixteen with the scaling pieces, as bb-0.12.0 has,
 *  BUMP-1E; seventeen with the gates and the words, as bb-0.13.0 has, BUMP-1F; twenty with endless, BUMP-1F R13.3). Pure: no key, no network. */
export function probePlan(playerId: string, now: number): PlannedPost[] {
  const run = `probe-${now}`;
  const plan: PlannedPost[] = [];
  // 1-2. an honest FURNACE deck, as the game's submitGhost sends it (the canonical bytes), signed and then unsigned
  // FLIP-X2: the start deck with its day-1 rune (probeRunes), so the exact count passes and each later row fails on the
  // one rule it exists to test (the budget, the record)
  // HULL-ON (HEARTS; cap's ruling 12a42239093fb6ec): day 1 at the start's lives (probeDusk: 10 hearts; 5 before hearts)
  // BUMP-1D (RUN-1): and every row states its `losses` (stated: under the long run's rules): no dusk fought, none lost
  const honest = dusk(playerId, "furnace", probeDusk({ day: 1, wins: 0, lives: 5, losses: stated(0) }), probeRunes(heroStartBuild("furnace"), 1), run, now);
  const honestText = encodeSnapshot(honest);
  const id = ghostId(honest);
  plan.push({ name: "furnace-signed", snapshot: honest, text: honestText, signed: true, expected: `201 {"id":"${id}"}`, pass: (a) => a.status === 201 && a.id === id });
  plan.push({ name: "furnace-unsigned", snapshot: honest, text: honestText, signed: false, expected: `401 ${UNSIGNED_ERROR}`, pass: (a) => a.status === 401 && a.error === UNSIGNED_ERROR });
  // 3. dishonest: the same deck with 1000 hull (4 ARMOR PACKs; NUM-1 hull x10, was 100) more than day 1's budget pays for
  const over = dusk(playerId, "furnace", probeDusk({ day: 1, wins: 0, lives: 5, losses: stated(0) }), { ...honest.build, hullBonus: honest.build.hullBonus + 1000 }, `${run}-over`, now); // HULL-ON (HEARTS): the honest row's record; BUMP-1D: and its losses
  plan.push({
    name: "dishonest-signed", snapshot: over, text: encodeSnapshot(over), signed: true, expected: "422 deck failed validation: budget: ...",
    pass: (a) => a.status === 422 && a.error === "deck failed validation" && (a.errors ?? []).some((e) => e.startsWith("budget: ")),
  });
  // 4. unreachable: the honest deck under a record no run carries into that dusk (H2's record check)
  // BUMP-1D (RUN-1): it states its losses (0: no dusk is fought before dusk 1), so the record check alone refuses it, and says so
  // with them (recordError); the losses check (lossesProblem) asks nothing of it
  const farLost = stated(0);
  const far = dusk(playerId, "furnace", { ...UNREACHABLE_DUSK, losses: farLost }, honest.build, `${run}-unreachable`, now);
  const farError = recordError(UNREACHABLE_DUSK, farLost);
  plan.push({ name: "unreachable-signed", snapshot: far, text: encodeSnapshot(far), signed: true, expected: `422 ${farError}`, pass: (a) => a.status === 422 && a.error === farError });
  // 5-7. the other heroes bb-0.9.1 takes: their honest day-3 reference decks, each stored as its own record
  for (const hero of STORED_HEROES) {
    // HULL-ON (HEARTS; ruling 12a42239093fb6ec): probeDusk(HERO_DUSK), a win and a draw at the start's lives (10 hearts)
    // BUMP-1D (RUN-1): so none of its two dusks was lost: losses 0 (day - 1 = 1 win + 0 losses + 1 draw)
    const s = dusk(playerId, hero, probeDusk({ ...HERO_DUSK, losses: stated(0) }), probeRunes(heroRefBuild(hero, HERO_DUSK.day), HERO_DUSK.day), `${run}-${hero}`, now); // FLIP-X2: 3 dawn runes
    const hid = ghostId(s);
    plan.push({ name: `hero-${hero.toUpperCase()}`, snapshot: s, text: encodeSnapshot(s), signed: true, expected: `201 {"id":"${hid}"}`, pass: (a) => a.status === 201 && a.id === hid });
  }
  // 8-9. the heroes bb-0.9.1 refuses: the same honest reference decks, as the canonical text built by hand
  for (const hero of REFUSED_HEROES) {
    const s = dusk(playerId, hero, probeDusk({ ...HERO_DUSK, losses: stated(0) }), probeRunes(heroRefBuild(hero, HERO_DUSK.day), HERO_DUSK.day), `${run}-${hero}`, now); // FLIP-X2: 3 dawn runes; HULL-ON (HEARTS): probeDusk; BUMP-1D: and the same losses as the stored heroes
    const want = heroError(hero);
    plan.push({ name: `hero-${hero.toUpperCase()}`, snapshot: s, text: canonicalText(s), signed: true, expected: `400 ${want}`, pass: (a) => a.status === 400 && a.error === want });
  }
  // 10-11. Z-PREP (REQ-BFG-073): LAST CHANCE's rows, under rules with LAST CHANCE (Z-BUMP: the rules gate, not the switch)
  if (probeHasLastChance()) {
    const plc = probeLastChance(); // HULL-ON (HEARTS; ruling 12a42239093fb6ec): the hearts rule's LAST CHANCE (was LC_DUSK, LC_DAY)
    const lc = lastChanceDusk(playerId, plc.day, `${run}-lastchance`, now);
    const lid = ghostId(lc);
    plan.push({ name: "lastchance-signed", snapshot: lc, text: encodeSnapshot(lc), signed: true, expected: `201 {"id":"${lid}"}`, pass: (a) => a.status === 201 && a.id === lid });
    const forged = lastChanceDusk(playerId, LC_FORGED_DAY, `${run}-lastchance-day3`, now);
    const fErr = lcRecordError(plc.dusk, LC_FORGED_DAY, lostAll(plc.dusk)); // BUMP-1D (RUN-1): the record error names the losses the row states
    plan.push({ name: "lastchance-day3", snapshot: forged, text: encodeSnapshot(forged), signed: true, expected: `422 ${fErr}`, pass: (a) => a.status === 422 && a.error === fErr });
  }
  // 12-13. AZ-BUMP (REQ-BFG-077, REQ-BFG-078): the NPC day's rows, under rules with the NPC day (the rules gate): an honest
  // NPC-day upload with its road log and a drop, then the same with day 2's drop forged
  if (probeHasNpcDay()) {
    const nd = npcDayDusk(playerId, NPC_ROAD, `${run}-npcday`, now);
    const nid = ghostId(nd);
    plan.push({ name: "npcday-signed", snapshot: nd, text: encodeSnapshot(nd), signed: true, expected: `201 {"id":"${nid}"}`, pass: (a) => a.status === 201 && a.id === nid });
    const forgedRoad = NPC_ROAD.map((e) => (e.day === NPC_DUSK.day ? { ...e, drop: NPC_FORGED_DROP } : e));
    const nf = npcDayDusk(playerId, forgedRoad, `${run}-npcday-forged`, now);
    plan.push({
      name: "npcday-forged", snapshot: nf, text: encodeSnapshot(nf), signed: true, expected: `422 deck failed validation: ${NPC_ROAD_ERROR}`,
      pass: (a) => a.status === 422 && a.error === "deck failed validation" && (a.errors ?? []).includes(NPC_ROAD_ERROR),
    });
  }
  // 14-15. BUMP-1D (RUN-1; REQ-BFG-059, REQ-BFG-116): the long run's rows, under rules with it (the rules gate): an honest upload
  // on a day past 10 that states its losses (LONG_DUSK: day 12), then the same deck and record without them, which the
  // upload check of RUN-1 (records.ts lossesProblem, after the record check) refuses on its own: the record is one a run reaches
  if (probeHasLongRun()) {
    const lr = longRunDusk(playerId, true, `${run}-longrun`, now);
    const lrid = ghostId(lr);
    plan.push({ name: "longrun-signed", snapshot: lr, text: encodeSnapshot(lr), signed: true, expected: `201 {"id":"${lrid}"}`, pass: (a) => a.status === 201 && a.id === lrid });
    const bare = longRunDusk(playerId, false, `${run}-longrun-nolosses`, now);
    plan.push({ name: "longrun-nolosses", snapshot: bare, text: encodeSnapshot(bare), signed: true, expected: `422 ${LOSSES_ERROR}`, pass: (a) => a.status === 422 && a.error === LOSSES_ERROR });
  }
  // 16. BUMP-1E (REQ-BFG-098; SCALE-2d): the scaling release's row, under rules with the twelve (the rules gate scaleWorld): the
  // honest day-1 FURNACE deck plus one GRUDGE ROD, signed, 201. A server of an older build answers 422 (unknown item "grudgerod").
  if (probeHasScale()) {
    const sc = scaleDusk(playerId, `${run}-scale`, now);
    const scid = ghostId(sc);
    plan.push({ name: "scale-signed", snapshot: sc, text: encodeSnapshot(sc), signed: true, expected: `201 {"id":"${scid}"}`, pass: (a) => a.status === 201 && a.id === scid });
  }
  // 17. BUMP-1F (REQ-BFG-052, REQ-BFG-085): the gates-and-words row, under rules with both (the rules gate gatesWorld and enchantWorld): the honest day-3
  // FURNACE deck plus a FUSER on its belt and a WHETSTONE holding one ENCHANTER word, signed, 201. A server of an older build answers 422.
  if (probeHasGates()) {
    const gt = gatesDusk(playerId, `${run}-gates`, now);
    const gtid = ghostId(gt);
    plan.push({ name: "gates-signed", snapshot: gt, text: encodeSnapshot(gt), signed: true, expected: `201 {"id":"${gtid}"}`, pass: (a) => a.status === 201 && a.id === gtid });
  }
  // 18-20. BUMP-1F (RULING-BUMP1F-R13 R13.3; REQ-BFG-059): the ENDLESS rows' three POSTs, under rules with endless (the rules gate endlessFor): the honest day-14
  // endless dusk (a run won on day 10, 3 endless wins and 3 hearts), signed, 201; the same with endlessWins 30, which the decoder refuses (400, the field named; the
  // encoder refuses it too, so its text is canonicalText's); and the same with 3 endless wins and 2 hearts, which the decoder takes and no endless leads to (422, the
  // record). The fourth row, the endless match, is a GET (ENDLESS_MATCH; runProbe).
  if (probeHasEndless()) {
    const en = endlessDusk(playerId, ENDLESS_DUSK, `${run}-endless`, now);
    const enid = ghostId(en);
    plan.push({ name: "endless-honest", snapshot: en, text: encodeSnapshot(en), signed: true, expected: `201 {"id":"${enid}"}`, pass: (a) => a.status === 201 && a.id === enid });
    const cap = { ...endlessDusk(playerId, ENDLESS_DUSK, `${run}-endless-wins-cap`, now), endlessWins: ENDLESS_CAP_WINS };
    plan.push({
      name: "endless-wins-cap", snapshot: cap, text: canonicalText(cap), signed: true, expected: `400 ${ENDLESS_WINS_ERROR}`,
      pass: (a) => a.status === 400 && /^snapshot\.endlessWins: /.test(a.error ?? ""),
    });
    const nr = endlessDusk(playerId, ENDLESS_NORECORD, `${run}-endless-norecord`, now);
    const nrErr = endlessRecordError(ENDLESS_NORECORD);
    plan.push({ name: "endless-norecord", snapshot: nr, text: encodeSnapshot(nr), signed: true, expected: `422 ${nrErr}`, pass: (a) => a.status === 422 && a.error === nrErr });
  }
  return plan;
}

/** BUMP-1I (REQ-BFG-125): the VETERAN rows, two GETs and no deck, in the form of ENDLESS_MATCH. A veteran's match request (`streak=2`, so the lead pick under VETERAN_RULES)
 *  from another player who has finished runs (`runs=5`), on the start record (day 1, 0 wins, the start hearts), which the seed pool always covers (the check asks only for a
 *  ghost); and the same request with a streak the server refuses (`streak=x`: 400, parseMatchQuery's error). */
const VETERAN_PATH = (streak: string): string => `/v1/ghosts/match?rules=${PROBE_RULES}&runs=5&day=1&wins=0&lives=${HEARTS_START}&player=other-player&streak=${streak}`;
export const VETERAN_MATCH = {
  name: "veteran-match",
  path: VETERAN_PATH("2"),
  expected: "200 a ghost (a veteran's request on the start record)",
  pass: (a: ProbeAnswer): boolean => {
    if (a.status !== 200) return false;
    try {
      const served: unknown = JSON.parse(a.text);
      const snap = typeof served === "object" && served !== null ? (served as { snapshot?: unknown }).snapshot : undefined;
      return typeof snap === "object" && snap !== null && (snap as { day?: unknown }).day === 1;
    } catch {
      return false; // not JSON
    }
  },
};
export const VETERAN_BAD = {
  name: "veteran-bad",
  path: VETERAN_PATH("x"),
  expected: `400 streak: expected an integer in 0..${VETERAN_STREAK_MAX}`,
  pass: (a: ProbeAnswer): boolean => a.status === 400 && a.error === `streak: expected an integer in 0..${VETERAN_STREAK_MAX}`,
};

/** BUMP-1F (RULING-BUMP1F-R13 R13.3): the fourth ENDLESS row, a GET and no deck: the match request of an endless dusk of day 14 (2 endless wins, 3 hearts) from another
 *  player (`other-player`) who has finished runs (`runs=5`: not a new player, so the request reads the uploads and not the seed pool alone), under PROBE_RULES. An endless
 *  request reads only endless ghosts, so the server serves row 1's own stored deck (the only endless ghost it holds for day 14, unless real players' are about: the check
 *  asks only that the ghost it serves is an endless one). runProbe sends it after the POST rows and counts it for no deck. */
export const ENDLESS_MATCH = {
  name: "endless-match",
  path: `/v1/ghosts/match?rules=${PROBE_RULES}&runs=5&day=${ENDLESS_DUSK.day}&wins=2&lives=3&player=other-player&mode=endless`,
  expected: "200 an endless ghost (snapshot.mode endless)",
  pass: (a: ProbeAnswer): boolean => {
    if (a.status !== 200) return false;
    try {
      const served: unknown = JSON.parse(a.text);
      const snap = typeof served === "object" && served !== null ? (served as { snapshot?: unknown }).snapshot : undefined;
      return typeof snap === "object" && snap !== null && (snap as { mode?: unknown }).mode === "endless";
    } catch {
      return false; // not JSON
    }
  },
};

/** PROFILE-UP: the flag that adds the profile rows. */
export const PROFILE_FLAG = "--profile";
/** PROFILE-UP: the server's answer to a profile signature that does not verify (identity.ts verifyIn, step 4 of the route). */
export const BADSIG_ERROR = `${SIG_HEADER}: the signature does not match this body and key`;
/** PROFILE-UP: the minimal profile's canonical body at `now`, written out (the key order, no spaces: profileWire.ts
 *  encodeWire; tests/profileup.probe.test.ts pins the two equal). 1 run, 1 dusk win, best day 2, FURNACE won: no style is
 *  earned, so the picks are the defaults and `unlocked` is empty. */
export const profileProbeText = (now: number): string =>
  `{"v":1,"counters":{"runs":1,"runsFinished":0,"flawless":0,"duskWins":1,"bestDay":2,"warlordWins":0,"matriarchWins":0,"mostBelts":0},"heroesWon":["furnace"],"heroesFinished":[],"unlocked":[],"chosen":{"floor":"plate","belt":"iron","panel":"slate","carrier":"war"},"updatedAt":${now}}`;

/** One planned PUT /v1/profile: the exact body text, whether its signature is broken, and what must come back. */
export interface PlannedPut {
  name: string;
  text: string;
  broken: boolean;
  expected: string;
  pass: (a: ProbeAnswer) => boolean;
}

/** The two profile rows (--profile), in order. Pure: no key, no network. */
export function profilePlan(now: number): PlannedPut[] {
  const text = profileProbeText(now);
  return [
    { name: "profile-signed", text, broken: false, expected: "200 the profile, as sent", pass: (a) => a.status === 200 && a.text === text },
    { name: "profile-badsig", text, broken: true, expected: `401 ${BADSIG_ERROR}`, pass: (a) => a.status === 401 && a.error === BADSIG_ERROR },
  ];
}

/** The answer of `res`, read: its status, its text, and the id, error and errors a JSON object body carries (BUMP-1F: post's reading, taken out for get). */
async function read(res: Response): Promise<ProbeAnswer> {
  const text = await res.text();
  let o: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) o = parsed as Record<string, unknown>;
  } catch {
    /* not JSON: shown as text */
  }
  return {
    status: res.status, text,
    id: typeof o.id === "string" ? o.id : undefined,
    error: typeof o.error === "string" ? o.error : undefined,
    errors: Array.isArray(o.errors) ? o.errors.filter((e): e is string => typeof e === "string") : undefined,
  };
}

/** One request with these exact body bytes: POST /v1/ghosts unless told otherwise. Throws on no answer (a network error or the timeout). */
async function post(
  base: string, body: Uint8Array<ArrayBuffer>, headers: Record<string, string>, timeoutMs: number, method = "POST", path = "/v1/ghosts",
): Promise<ProbeAnswer> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", ...headers }, body, signal: ctl.signal });
    return await read(res);
  } finally {
    clearTimeout(timer);
  }
}

/** BUMP-1F (RULING-BUMP1F-R13 R13.3): one GET, no body, no signing (the endless match). Throws on no answer (a network error or the timeout), as post does. */
async function get(base: string, path: string, timeoutMs: number): Promise<ProbeAnswer> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, { method: "GET", signal: ctl.signal });
    return await read(res);
  } finally {
    clearTimeout(timer);
  }
}

/** An answer on one line: the status, then the id, or the error and its first detail, or the body (clipped). */
function shown(a: ProbeAnswer): string {
  const detail = a.id !== undefined ? `{"id":"${a.id}"}` : a.error !== undefined ? `${a.error}${a.errors?.length ? `: ${a.errors[0]}` : ""}` : a.text;
  const one = detail.replace(/\s+/g, " ").trim();
  return `${a.status} ${one.length > 200 ? `${one.slice(0, 197)}...` : one}`;
}

/**
 * The checks of probePlan (nine before LAST CHANCE; BUMP-1D: fifteen) against `base`, then (BUMP-1F, RULING-BUMP1F-R13 R13.3) under rules with endless the GET of
 * ENDLESS_MATCH, a fourth ENDLESS check that is no deck. `saveId` gets the probe's player id before the first POST. Resolves every check, each
 * with what was expected and what came back; a POST with no answer is a failed check. Throws only if no identity can be
 * made or `saveId` throws, before any POST.
 */
export async function runProbe(
  base: string, saveId: (playerId: string) => void, timeoutMs = PROBE_TIMEOUT_MS, now = Date.now(), opts: { profile?: boolean } = {},
): Promise<ProbeResult> {
  const me = await loadIdentity(memoryKeyStore());
  if (!me) throw new Error("no WebCrypto (crypto.subtle) here: cannot make a device identity");
  saveId(me.playerId);
  const checks: ProbeCheck[] = [];
  for (const p of probePlan(me.playerId, now)) {
    let got: string, ok = false, status: number | undefined;
    try {
      const body = utf8(p.text);
      const headers: Record<string, string> = {};
      if (p.signed) {
        const { key, sig } = await me.sign(body); // the game's own signing: UPLOAD_PREFIX + these exact bytes
        headers[KEY_HEADER] = key;
        headers[SIG_HEADER] = sig;
      }
      const a = await post(base, body, headers, timeoutMs);
      status = a.status;
      got = shown(a);
      ok = p.pass(a);
    } catch (e) {
      got = `no answer (${errText(e)})`;
    }
    checks.push({ name: p.name, expected: p.expected, got, ok, status });
  }
  const stored = checks.filter((c) => c.status === 201 || c.status === 200).length; // decks only: counted before the endless match and the profile rows
  // BUMP-1F (RULING-BUMP1F-R13 R13.3): the ENDLESS rows' fourth, a GET and no deck, after the POSTs (row 1 stored the endless ghost it asks for) and before the
  // profile rows; it is counted after `stored`, so its 200 is no deck
  if (probeHasEndless()) {
    let got: string, ok = false, status: number | undefined;
    try {
      const a = await get(base, ENDLESS_MATCH.path, timeoutMs);
      status = a.status;
      got = shown(a);
      ok = ENDLESS_MATCH.pass(a);
    } catch (e) {
      got = `no answer (${errText(e)})`;
    }
    checks.push({ name: ENDLESS_MATCH.name, expected: ENDLESS_MATCH.expected, got, ok, status });
  }
  // BUMP-1I (REQ-BFG-125): the VETERAN rows, two GETs and no deck, after the endless match and before the profile rows (counted after `stored`, so a 200 is no deck)
  if (probeHasVeteran()) {
    for (const row of [VETERAN_MATCH, VETERAN_BAD]) {
      let got: string, ok = false, status: number | undefined;
      try {
        const a = await get(base, row.path, timeoutMs);
        status = a.status;
        got = shown(a);
        ok = row.pass(a);
      } catch (e) {
        got = `no answer (${errText(e)})`;
      }
      checks.push({ name: row.name, expected: row.expected, got, ok, status });
    }
  }
  if (opts.profile) {
    // PROFILE-UP: PUT /v1/profile from the same identity, in the profile domain (the second row's signature is then broken)
    for (const p of profilePlan(now)) {
      let got: string, ok = false, status: number | undefined;
      try {
        const body = utf8(p.text);
        const signed = await me.sign(body, PROFILE_PREFIX);
        const sig = p.broken ? `${signed.sig.startsWith("A") ? "B" : "A"}${signed.sig.slice(1)}` : signed.sig;
        const a = await post(base, body, { [KEY_HEADER]: signed.key, [SIG_HEADER]: sig }, timeoutMs, "PUT", "/v1/profile");
        status = a.status;
        got = shown(a);
        ok = p.pass(a);
      } catch (e) {
        got = `no answer (${errText(e)})`;
      }
      checks.push({ name: p.name, expected: p.expected, got, ok, status });
    }
  }
  return { playerId: me.playerId, checks, ok: checks.every((c) => c.ok), stored };
}

/** The command line: <base-url> <id-file>. Resolves the exit code (0 every check as expected, 1 not, 2 usage). */
export async function probeMain(argv: readonly string[], out: (line: string) => void, timeoutMs = PROBE_TIMEOUT_MS): Promise<number> {
  const profile = argv.includes(PROFILE_FLAG); // PROFILE-UP: opt-in; without it every line below is as it was
  if (profile) argv = argv.filter((a) => a !== PROFILE_FLAG);
  let base: string, idFile: string;
  try {
    if (argv.length !== 2) throw new ProbeUsageError(`expected 2 arguments, got ${argv.length}`);
    base = probeBase(argv[0]);
    idFile = argv[1];
    if (!idFile || idFile.startsWith("-")) throw new ProbeUsageError(`the id file must be a path, not ${JSON.stringify(idFile)}`);
    let held = "";
    try {
      held = existsSync(idFile) ? readFileSync(idFile, "utf8").trim() : "";
    } catch {
      throw new ProbeUsageError(`cannot read the id file ${idFile}`);
    }
    if (held) throw new ProbeUsageError(`${idFile} already holds a probe player id: clean that player up first (RUNBOOK section 9), then move the file away`);
  } catch (e) {
    if (!(e instanceof ProbeUsageError)) throw e;
    out(`ghost-probe: ${e.message}`);
    out(PROBE_USAGE);
    return 2;
  }
  if (RULES_VERSION !== PROBE_RULES) {
    out(`ghost-probe: this build's rules are ${RULES_VERSION}, but the probe's expectations are written for ${PROBE_RULES}`);
    return 2;
  }
  out(`probe: POST ${base}/v1/ghosts as a fresh device (rules ${RULES_VERSION}); only the FURNACE, WEAVER, FOUNDRY and BASTION decks may be stored`);
  if (profile) out(`probe: ${PROFILE_FLAG}: then PUT ${base}/v1/profile, a minimal profile and the same body with a broken signature; the server keeps that one profile for this player (delete profiles/<player id>.json by hand)`);
  let r: ProbeResult;
  try {
    r = await runProbe(base, (playerId) => writeFileSync(idFile, `${playerId}\n`), timeoutMs, Date.now(), { profile });
  } catch (e) {
    out(`ghost-probe failed before any upload: ${errText(e)}`);
    return 1;
  }
  for (const c of r.checks) out(`${c.ok ? "PASS" : "FAIL"}  ${c.name.padEnd(18)} expected: ${c.expected} | got: ${c.got}`);
  out(`probe player: ${r.playerId}`);
  out(`probe: ${r.checks.filter((c) => c.ok).length} of ${r.checks.length} checks as expected; the server stored ${r.stored} deck(s) for this player (expected ${probeStored()}); the player id is in ${idFile}`);
  return r.ok ? 0 : 1;
}
