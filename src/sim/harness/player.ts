// Balance harness: the par player (FB-C, REQ-BFG-026). The operator's rule for balance is that shop luck does most
// of the work, and nobody assembles "the perfect deck" unless the stars align. So par is what a typical player can
// actually assemble: playerBuild(hero, day, seed) plays a REAL run through days 1..day. The run comes from the game's
// newRun, each dawn's caravan from its rollShop (5 offers from 2-3 merchants, fresh-first slots, the familiar slot,
// hero-blind offers), each reroll from its reroll (2 g), each purchase from its buyOffer (offered parts only, at the
// offered price, through gainModule, so copies merge as they do in the game), and each dusk from its finishDay (a win's
// income, so day t adds maxGoldByDay(t) - maxGoldByDay(t - 1)). Road stops, events and warlords are left out.
// PAR-AZ (REQ-BFG-078, REQ-BFG-077; cap's ruling Q5 on REVIEW-HULL1D): with NPC_DAY on, the par player has the game's NPC
// day after each dawn's shop (parNpcDay): it fights the day's MEDIUM warlord as the game plays it (road.ts pickRoad and
// warlordFight, the battle on warlordSeed and the run's day, finishWarlord); a win pays rewardGold (spent at the next
// dawn) and the seeded drop, which the bots then place as a free part (placeFreePart: a merge, a spot or the REFIT swap,
// else cargo). A loss pays nothing and costs no life. It takes no map event and no after-fight event (as 0.9.7's par took
// no road stop), so its gap to a human is one road stop's worth a day. With NPC_DAY off, none of this runs.
//
// The policy (PLAYER_POLICY; output/PAR-REPORT.md measures it) is sensible, not perfect:
// - The player reads its deck the way the build screen shows it (rateDeck: deck.ts's route walk, the inspector's
//   DMG / BURN / SHOCK / TIME, turned into damage per second that lands, times hull).
// - Each dawn it takes merges first, then a part that helps the current deck: usually the one it judges best for the
//   gold (misjudging each offer by up to `noise`), sometimes (`whim`) any helpful one. A rig goes beside a random belt
//   tile at the harness's H2 spot (Shopper.rigSpot: most hits on connected belts, the slag rule), gear and cores on a
//   free hardpoint or socket, a factory beside a free intake with the shortest belt. A belt crate is bought to lengthen
//   a belt (the game redraws belts for free; Shopper.moveRoute, riders put back beside the new belt).
// - It rerolls only when nothing affordable helps, at most `rerolls` times a day, and only while the run's reroll gold
//   stays within `rerollShare` of the day's gold and the purse can still reach `floor`. Then it fills its deck to
//   `floor` of the day's gold (supplies first, then parts that do no harm), and it carries at most `reserve` gold
//   into the next dawn when the caravan sells belt crates.
// - A persona per seed holds what players differ in before any shop luck: whether a FURNACE player lengthens the
//   kiln belt on day 1 (the hero card: "AT 8+ TILES, BREECH FIRES EVERY 0.72S") and how far.
// Everything is deterministic per (hero, seed, policy): the run seed, the persona and the policy's RNG are hashed from
// them. Every day's deck passes validateBuild, and deck value + reroll gold + unspent gold = maxGoldByDay(day).
//
// 0.6.2 CAND-A: the player on the 0.6.2 mechanics head (ref/BRIEF-final-062-cand.md §2).
// - TURRETS (REQ-BFG-031): a turret offer is bought when a plan with it rates better, each plan played on a copy of
//   the run through the game's own actions (buyOffer's gain into cargo, then run.ts installFromCargo, the build
//   screen's drop onto a turret slot): into the empty EXTRA slot, fed by a belt redrawn to its intake (the game's free
//   redraw; its riders put back beside it), or replacing an installed turret (a swap: the old one goes to cargo, and
//   is sold unless it is a 1-star starting turret, which can't be; a belt the swap leaves without an intake is
//   redrawn to a free one, or there is no plan), the displaced turret perhaps moved into the empty extra slot. Gear a
//   smaller turret can't hold goes onto another turret with room, else is sold. A cargo turret goes back into an empty
//   slot at dawn when a fed plan rates better. A copy that merges into an installed twin is a merge, as before.
// - GEAR goes into any free GEAR SLOT of an installed turret (rarity + stars; never two copies of one def on a
//   turret), cores into a socket; the rating (deckRating.ts) reads every installed turret, its stars and all its gear.
// - JOINS (REQ-BFG-027): a new factory's belt either runs into a free intake (as before) or joins a connected belt at
//   a tile up to its rig row, whichever rates better (deck.ts commitRoute, the editor's path); at dawn the player may
//   redraw a belt into a join (the free redraw) when that rates clearly better. The rating sees the joined walk (the
//   main belt's rigs), E1's long journey, and a crowded intake (joiners starve at a saturated turret).
// - AIM: a multi-arrow rig also tries the spots where most of its arrows land (`aimTop` of them), two-belt spots
//   included: a player dragging a rig sees where its arrows land before dropping it (the game's drop auto-aims).
// - CAND-A resume (the skill-ladder fix): the player reads its day's rating (rateOn: deckRating.ts fightTime, the par
//   field's fight length on that day, 24 s on day 1 to 9.5 s on day 10), not a 25 s fight on every day.
// - 0.8.0 B1 M1 (FOUNDRY's sync, syncKeeper): no change the player makes loses a gun its CRUCIBLE belts reach in sync;
//   a synced pair grows together. A deck without a synced gun (every other hero's) plays exactly as before.

import { Rng, hashSeed } from "../../core/rng";
import { hullScaleRules } from "../hullScale"; // HULL-1c (REQ-BFG-079): the cache key
import { ladderFixRules } from "../ladderFix"; // HULL-1c: the cache key
import { guardRules } from "../guard"; // RETUNE-1 (REQ-BFG-097): the cache key
import { openRunesRules } from "../openRunes"; // OPEN-1 (REQ-BFG-109): the bots' offer rule, and the cache key
import { plainRigsRules } from "../plainRigs"; // PLAIN-1 (REQ-BFG-084): the cache key (the six in the shop move every par run)
import { npcDayRules } from "../npcDay"; // HULL-1d (REQ-BFG-073): the REFIT swap of LAST CHANCE's part (refitSwap)
import { freeJoinsRules } from "../freeJoins"; // JOINS-1 (REQ-BFG-091): no join limit with FREE_JOINS on; the cache key
import { GRID, HEROES, ITEMS, JOIN_LIMIT, REROLL_COST, sellValue, type HeroId } from "../content";
import {
  DX, DY, arrowCell, canFitGear, canSellTurret, cloneBuild, commitRoute, connectorClaims, coreFor, deadEndsAt, footprint,
  gearOn, inGrid, installedTurrets, isTurretDef, itemByUid, joinCount, joinersOf, key, kx, ky, newJoinProblem, occupancy, opposite,
  rigArrows, rigHits, routeInfo, turretSlots, turretValue,
  type Build, type Dir, type ModPlacement,
} from "../deck";
import { hero as deckHero, routesOf, turretForColumn } from "../deck"; // bb-0.8.3 (D7): the bots' belts
import { beltIndex, freeForRig, hitsIfPlaced, intakeCell, placeRigAt, rotFacing, rotations, type RigSpot } from "../beltside";
import { stokeSpots } from "../beltside"; // 0.8.0 P1 (E3): STOKER's place beside factories
import { shapedSpot } from "../beltside"; // SHAPES-1 (REQ-BFG-086 S7.1): the shaped-rig solver
import { shapesRules } from "../shapes"; // SHAPES-1 (S1): the par-run cache key
import { shapes2Rules } from "../shapes2"; // SHAPES-2 (REQ-BFG-114): the par-run cache key (the six in the shop move every par run)
import { gatesRules } from "../gates"; // GATES-1 (REQ-BFG-052, G6): the par-run cache key (the three in the shop move every par run)
import { gateFits, gateSpot, gateWorth, readFlow } from "./gateBots"; // GATES-1 (REQ-BFG-052, G6): the bots' gates (value table, placement rule)
import type { SideStats } from "../battle";
import { FUSE_MAX, fusible, gradeOf, starsOf, valueOf } from "../stars";
import { beltPolicy, botSlots, reachCols, upgradePolicy } from "./belts"; // bb-0.8.3 (REQ-BFG-042 D7, REQ-BFG-043 D7')
import { packPolicy } from "./belts"; // bb-0.8.6 (REQ-BFG-051 P6): the fixed packs
import { PACK_IDS, PACK_ITEM, type PackId } from "../content"; // bb-0.8.6 (REQ-BFG-051)
import { buildCost, maxGoldByDay } from "../../net/validate";
import { continueRun, finishDay } from "../../game/day"; // RUN-1: continueRun (a par run past its end)
import { LONG_RUN_GEN_DAYS, longRunRules } from "../longRun"; // RUN-1 (REQ-BFG-059, D5): the par run's long depth
import { gainModule, mergePreview, type GainAt } from "../../game/fuse";
import {
  buyOffer, buyPack, buyUpgrade, fitCore, installFromCargo, newRun, nextUpgrade, packPrice, reroll, sellInventory, storeMod,
  storePlaced, takeFromInventory, upgradeShown, type Run,
} from "../../game/run";
import { UPGRADE_TRACKS, type UpgradeTrack } from "../content"; // bb-0.8.3 (REQ-BFG-043 D7')
import { MAX_TILES, Shopper } from "./shopper";
import { blockedCells, freeConnectors, randomPath, shortestTiles, startCells } from "./path";
import { startCellsFor } from "./path"; // SHAPES-1 (REQ-BFG-086 S7.2): start cells beside any footprint
import { cellsOf, rotField, type Placed } from "../deck"; // SHAPES-1: a placed piece's turned footprint; the stored rot
import { footOf, footOnDeck, footprintCells, footTurns, isShaped } from "../foot"; // SHAPES-1: the footprint engine
import type { ItemDef } from "../content";
import { syncOf, syncedTurrets } from "../syncEstimate"; // 0.8.0 B1 M1: FOUNDRY's sync guard (syncKeeper)
import { BOT_RUNES, botTakeRune, runeGrants } from "../runes"; // RUNES-2a (REQ-BFG-058): the bots' dawn rune, behind BOT_RUNES
import { lastChanceOffer, lastChanceRuneAt, type Boon } from "../lastChance"; // LC-1 (REQ-BFG-073)
import { lcRunes, takeLastChance } from "../../game/run"; // LC-1: the game's own pick
// PAR-AZ (REQ-BFG-078, REQ-BFG-077): the par player's NPC day (parNpcDay), behind NPC_DAY: the game's road stop and fight
import { finishWarlord, pickRoad, todaysWarlord, warlordDrop, warlordSeed } from "../../game/road";
import { simulate } from "../battle";
import { roadDropValue, roadLog, withNpcDay, type RoadEntry } from "../npcDay";
import type { RivalId } from "../rivals";
// ENCHANT-1 (REQ-BFG-085, E8): the bots' words (enchantBot.ts), the switch, LAST CHANCE's word, the game's own merge-pick and ENCHANTER actions
import { enchantField, enchantRules, mergeWord, wideSlots, type EnchantFields } from "../enchant";
import { turretList } from "../deck";
import { lastChanceWord } from "../enchantSources";
import { botWarlordPick, buyPlan, casualWarlordPick, casualWordBuys, chooserFor, enchanterPlans, settleMergePick, wordPick, wordValue, type WordExtras, type WordPlan } from "./enchantBot";
import { setPieceWord } from "../../game/fuse";
import { pendingEnchantPick } from "../../game/enchanter";

// ---------------------------------------------------------------- the deck rating (what the player reads)

// FB-C: the rating (rateDeck and its constants) lives in src/sim/deckRating.ts, beside deck.ts: it reads starred
// effects through stars.ts like the build screen's inspector, which no src/sim/harness file may do itself.
export { EQ, FIGHT_T, NOMINAL, ROUND_EQ, SATURATED, rateDeck, type DeckRating } from "../deckRating";
import { FIGHT_T, RATING_CURVE, fightTime, rateDeck } from "../deckRating";
import { sustainKeyword, type RateOut, type SustainKw } from "../deckRating"; // BOTS-X (SUS-C, REQ-BFG-069): the bots' sustain
import { sustainLive } from "../content"; // BOTS-X: the sustain switch (SUSTAIN_LIVE, or a withSustain call)
// SCALE-2d (REQ-BFG-098 098.6, REQ-BFG-106; BRIEF-SCALE2d D2): the bots' feeder+reader rule, the run's hearts lost in its
// fights and the cache key, all SCALE_RIGS on only (off: every run exactly as before)
import { heartsLost, scaleRules } from "../scale";
import { READER_FEEDERS, hasFeeder, needsFeeder } from "../scaleRating";

// ---------------------------------------------------------------- the policy

export type PlayerPolicy = "typical" | "sharp";

/** The par player's knobs (output/PAR-REPORT.md explains each and measures what it does). */
export interface PolicyKnobs {
  noise: number; // each offer's gain is misjudged by a factor 1 +- noise (seeded)
  whim: number; // chance that a pick (not a merge) is any helpful offer rather than the one judged best for the gold
  impulse: number; // chance that a pick (not a merge) is any offer the deck can take, whether or not it helps
  place: "tile" | "best"; // "tile": a rig at a random belt tile's H2 spot, gear on a random free fed turret; "best": the best
  belt: number; // FURNACE: the chance a player lengthens the kiln belt on day 1
  beltMin: number; // FURNACE: the shortest kiln belt such a player draws (the hero card's 8)
  beltMax: number; // FURNACE: the longest (it draws beltMin..beltMax tiles, within the starting belt capacity)
  grow: boolean; // the player re-draws its belts to the best-rated length after every purchase (sharp); a typical
  // player lengthens a belt only when it buys a belt crate for it (then the best-rated connected belt), or (room)
  room: boolean; // ... when it has gold but no free cell beside a belt for a rig: then it draws a belt into the free capacity
  rerolls: number; // rerolls a day at most, only when nothing affordable helps
  rerollShare: number; // the run's reroll gold stays within this share of maxGoldByDay(day)
  stuck: number; // extra rerolls a day while the deck is short of the floor and nothing on offer can fill it
  floor: number; // the share of maxGoldByDay(day) the player fills its deck to: supplies first, then harmless parts
  reserve: number; // gold a player may carry into the next dawn once the floor is met (the rest goes into belt crates)
  minRel: number; // a gain below this share of the deck's rating is no help
  harmless: number; // a loss below this share still fills the purse
  mergeFloor: number; // a merge is taken unless it costs more than this share
  fillFloor: number; // while the deck is short of the floor, the fill takes the least harmful offer down to this share
  upgrade: boolean; // an offer of gear or a core may replace a fitted one worth less (the old one is sold)
  upgradeGain: number; // ... when nothing else helps and the swap gains at least this share
  line: "short" | "random"; // a new factory's belt: the shortest into the intake, or shortest + random slack within the spare belt
  aim: "h2" | "first"; // place "tile": the tile's H2 spot (most hits), or a random free side with the first arrow on the tile
  // 0.6.2 CAND-A (the report lists these four additions; the policy names stay "typical" and "sharp"):
  turret: number; // 1: a turret offer may be bought to install or replace one (0: only a copy that merges, as FB-C)
  extra: number; // 1: a turret may go into the empty extra slot (0: never; the gold goes elsewhere: flag 1's control)
  join: number; // 1: a new factory's belt may join a belt, and a belt may be redrawn into a join (0: never)
  aimTop: number; // place "tile": a multi-arrow rig also tries this many of the spots where most of its arrows land
  // 0.6.2 TUNE-M (T1, a part's control: parBench --forbid): optional, set by no policy. Part defs ("+"-joined) the player
  // never takes: the caravan still rolls them and candidates() still judges them (the same RNG draws), but no merge,
  // pick, whim, fill or crate buy takes one, and the change is never counted as spendable on one; the gold goes elsewhere.
  forbid?: string;
  // ENCHANT-1 (REQ-BFG-085, E8): optional, set by no par policy. With ENCHANT on, a player with `wordBuy` is a CASUAL buyer of the ENCHANTER's
  // words (enchantBot.ts casualWordBuys: each affordable offer with this chance, on a seeded legal piece with no word, no rating read); a
  // player without it values every offer by the rating (enchantBot.ts bestWordFor) and buys the best pair as it buys a part. Off: never read.
  wordBuy?: number;
}

export interface PlayerOpts {
  policy?: PlayerPolicy; // "typical" (the par player, default) or "sharp" (no misjudging or whims, best spots)
  tune?: Partial<PolicyKnobs>; // knob overrides (bench sweeps; the cache key includes them)
  maxStars?: number; // the highest star a purchase may merge up to: FUSE_MAX for par, 2 for a stand-in candidate
  trace?: (run: Run, wagon: number, slot: number) => void; // called just before each buyOffer (tests)
  onReroll?: (run: Run) => void; // called just before each reroll (tests)
  onDecide?: (run: Run, cands: readonly PlayerOffer[], pick: string | null) => void; // each shopping step (diagnostics)
  // RUNES-2a (REQ-BFG-058): the player takes a rune at every dawn, before the shop (runes.ts botTakeRune on the run's own
  // seed). Absent: runes.ts BOT_RUNES, THE switch (off in this rules version, so every run plays exactly as before).
  botRunes?: boolean;
  // LC-1 (REQ-BFG-073): the run's LAST CHANCE (the bench, the stand-ins' and captains' modeled runs): at the dawn after
  // `day`, before that dawn's rune, the player takes card `boon` of lastChance.ts lastChanceOffer on its own seed (a part
  // where the bots would put it: placeFreePart). The par run pays a win every day, so it never fires one itself. Absent:
  // none (every run and cache key exactly as before). `hull` (the bench's sweep only): the HULL card's amount instead of
  // LAST_CHANCE_HULL.
  lastChance?: { day: number; boon: Boon; hull?: number };
}

/** An offer as the player judged it (diagnostics): its def, price, kind and the rating change it would make; a turret's
 *  plan ("extra 1", "replace 0", "replace 0 moved 1": its slot, and where the displaced one went). */
export interface PlayerOffer { def: string; price: number; kind: string; merge: boolean; rel: number; plan?: string }

export const PLAYER_POLICY: Readonly<Record<PlayerPolicy, Readonly<PolicyKnobs>>> = {
  typical: {
    noise: 0.6, whim: 0.3, impulse: 0, place: "tile", belt: 0.5, beltMin: 8, beltMax: 12, grow: false, room: true, rerolls: 2, rerollShare: 0.1, stuck: 2,
    floor: 0.87, reserve: 2, minRel: 0.004, harmless: 0.002, mergeFloor: -0.02, fillFloor: -0.15, upgrade: true, upgradeGain: 0.05, line: "short", aim: "h2",
    turret: 1, extra: 1, join: 1, aimTop: 4,
  },
  sharp: {
    noise: 0, whim: 0, impulse: 0, place: "best", belt: 1, beltMin: 8, beltMax: 12, grow: true, room: true, rerolls: 2, rerollShare: 0.1, stuck: 2,
    floor: 0.87, reserve: 2, minRel: 0.004, harmless: 0.002, mergeFloor: -0.02, fillFloor: -0.15, upgrade: true, upgradeGain: 0.05, line: "short", aim: "h2",
    turret: 1, extra: 1, join: 1, aimTop: 4,
  },
};

/** What a player brings to the run before any shop luck (drawn per hero and seed). */
export interface Persona {
  beltTiles: number; // FURNACE: the kiln belt it draws on day 1 (0: it keeps the starting belt)
}

export function knobsOf(policy: PlayerPolicy = "typical", tune?: Partial<PolicyKnobs>): PolicyKnobs {
  return { ...PLAYER_POLICY[policy], ...tune };
}

/** The persona of (hero, seed) under `pol`: its own stream, so the policy's draws never move it. */
export function personaOf(hero: HeroId, seed: number, pol: PolicyKnobs): Persona {
  const rng = new Rng(hashSeed("par-player-persona", hero, seed));
  const extend = rng.next() < pol.belt, len = pol.beltMin + rng.int(Math.max(1, pol.beltMax - pol.beltMin + 1));
  return { beltTiles: hero === "furnace" && extend ? len : 0 };
}

export interface PlayerBuy {
  day: number;
  roll: number; // the caravan's reroll count when bought (0 = the dawn caravan)
  def: string;
  price: number;
  stars: number; // the copy's stars after any merge
  merged: boolean;
  why: "merge" | "best" | "whim" | "impulse" | "fill" | "crate" | "greedy" | "word"; // bb-0.8.6: "greedy", M3's pack policies; ENCHANT-1: "word", a casual buy at the ENCHANTER
  word?: { id: string; on: string; slot: number; value: number; replaced?: string }; // ENCHANT-1 (E8): an ENCHANTER buy: the word, the piece's def, its slot or uid, the rating gain the bot read (0: casual), the word it replaced
  grew?: number; // a belt crate: the tiles the belt it lengthened grew by (absent: none)
  replaced?: string; // an upgrade: the def of the fitted gear or core it replaced (sold); a turret: the one it displaced
  slot?: number; // CAND-A: a turret: the slot it went into
  into?: "extra" | "replace"; // CAND-A: a turret: into the empty extra slot, or replacing an installed one
  joins?: number; // CAND-A: a factory: how many of its belts join another belt
}

/** One dusk of the par player's run. */
export interface PlayerDay {
  day: number;
  build: Build; // the deck at dusk (a fresh copy)
  value: number; // buildCost(build).total
  budget: number; // maxGoldByDay(day) (RUNES-2a: + the gold its dawn-gold runes paid by this dusk, runeGrants; 0 without runes)
  gold: number; // unspent gold carried into the next dawn
  rerolls: number; // rerolls taken today
  rerollGold: number; // gold spent on rerolls, days 1..day
  soldLoss: number; // value lost selling replaced parts (value minus refund), days 1..day
  buys: PlayerBuy[]; // today's purchases, in order
  // PAR-AZ (REQ-BFG-078, REQ-BFG-077): with NPC_DAY on only (absent with it off, so every switch-off day is as before):
  // today's road stop (parNpcDay); the warlord gold paid on days 1..day; the drops' value on days 1..day at their stars
  // (npcDay.ts roadDropValue of the run's road log, as validate.ts budgets an upload); and the value left in cargo at dusk
  // (parts the REFIT swap took off, drops that found no place). `budget` then adds roadGold and roadDrops, so
  // boughtCost(build) + rerollGold + gold + soldLoss + cargo = budget.
  road?: PlayerRoad;
  roadGold?: number;
  roadDrops?: number;
  cargo?: number;
  // ENCHANT-1 (REQ-BFG-085, E8): with ENCHANT on and a word bought: the gold spent at the ENCHANTER on days 1..day (E6.4: it joins the
  // deck's cost, so boughtCost(build) + rerollGold + gold + soldLoss + wordGold (+ cargo) = budget); absent otherwise
  wordGold?: number;
}

/** PAR-AZ (REQ-BFG-078, REQ-BFG-077): one day's road stop of the par player with NPC_DAY on (parNpcDay). */
export interface PlayerRoad {
  id: RivalId; // the warlord fought: the Medium one of the day's fork (forkFor(run).warlords.medium)
  outcome: "win" | "loss" | "draw";
  time: number; // the fight's length (s)
  gold: number; // the gold the win paid (rewardGold; 0 on a loss or a draw)
  drop: string | null; // the seeded drop (warlordDrop; null: no win, or the roll dropped nothing)
  placed: boolean; // the drop went onto the deck (a merge, a spot or the REFIT swap); false: in cargo, or no drop
  declined?: string; // a capped run's (maxStars below FUSE_MAX) seeded drop it declined: it would merge above the cap
}

type Kind = "rig" | "gear" | "core" | "factory" | "plating" | "crate" | "turret" | "upgrade" | "word" | "converter"; // GATES-1 (REQ-BFG-052, G6): "converter", a gate on a belt tile; ENCHANT-1 (E8): "word" (BUMP-1F: both)

/** A new factory's belt: its cells, and the belt tile it joins (absent: it ends on a free intake). */
interface Line { cells: number[]; join?: number }

/** CAND-A: a turret offer's plan, played on a copy of the run and replayed by buyTurret through the same actions. */
interface TurretPlan {
  copy: number; // the bought copy in cargo after buyOffer's gain (a cargo twin may have merged into it)
  slot: number; // installFromCargo(copy, slot); an occupied slot swaps
  moved?: number; // the displaced turret, installed in this empty slot
  refit: Refit[]; // gear and cores the swap handed back, put on a turret with room
  sell: number[]; // cargo parts sold after (a displaced turret worth something, gear or cores with no room)
  build: Build; // the deck after the plan
  into: "extra" | "replace";
  replaced?: string; // the displaced turret's def
  sold: boolean; // it sells a part worth something: an upgrade, a late sink like the gear upgrade
}
interface Refit { uid: number; turret: number; core: boolean }

interface Cand {
  wagon: number;
  slot: number;
  def: string;
  price: number;
  kind: Kind;
  merge: boolean; // the copy merges into a placed twin
  at?: GainAt; // where it is dropped (buyOffer's `at`)
  routes?: Line[]; // a new factory's belts
  grown?: { build: Build; tiles: number }; // a belt crate: the deck after it lengthens a belt (items and routes)
  swap?: number; // an upgrade: the uid of the fitted gear or core it replaces (stored, then sold)
  turret?: TurretPlan; // CAND-A: a turret offer's plan
  track?: UpgradeTrack; // bb-0.8.3 (D7'): the hero's gold upgrade's next level (no wagon: wagon -1, slot the track's index)
  pack?: PackId; // bb-0.8.6 (REQ-BFG-051 P6): a fixed pack (no wagon: wagon -2, slot the pack's index in PACK_IDS)
  rel: number; // (rateDeck(after) - rateDeck(now)) / rateDeck(now)
  banned?: boolean; // BOTS-X: the sustain rule's mark (judged as usual, never taken)
  // FIX-ABE E (cap's ruling 207816b18a9fbfdb): TUNE-M's mark, its def is in pol.forbid: judged, weighed and counted as
  // spendable change as usual, refused only at the moment it would be taken (pickOffer, fillPick, the packs)
  forbid?: boolean;
  pair?: string; // SCALE-2d (REQ-BFG-098 098.6): a feeder valued as the pair with this reader on offer (readerRule)
  plan?: WordPlan; // ENCHANT-1 (E8): an ENCHANTER offer's best (word, piece) pair (wagon -3, slot the offer's index in run.shop.enchanter)
}

/** TUNE-M (T1): the defs pol.forbid names (none for both policies). */
const forbidden = (pol: PolicyKnobs): ReadonlySet<string> => new Set((pol.forbid ?? "").split("+").filter(Boolean));
/** TUNE-M (T1): the candidates the player may take (FIX-ABE E: the sustain rule's `banned` out; pol.forbid's parts are
 *  refused only when picked). */
const allowed = (cs: readonly Cand[]): Cand[] => cs.filter((c) => !c.banned);

/** A late sink (pickOffer): an upgrade that sells a part it replaces, or a turret that replaces a working one (a
 *  deliberate swap, taken for a clear gain only; the rating can't see a turret's window or shell flight). */
const sinks = (c: Cand): boolean => c.swap !== undefined || c.turret?.into === "replace";

const SIDE0: SideStats = { shots: 0, damage: 0, firstShot: 0, idle: 0, turretTime: 0, maxQueue: 0, jams: 0, disrupted: 0, windTaken: 0, burnDealt: 0, payloadSum: 0, produced: 0, stalled: 0 };

/** FLIP-X2: the run seed of the par player's run `seed` for `hero` (its runeOffer seed): what a v3 seed ghost made from
 *  that run carries (tools/samplePool.ts raceGhosts), so the upload check re-derives each dawn's offer. */
export const parRunSeed = (hero: HeroId, seed: number): number => hashSeed("par-player-run", hero, seed);

/** The run the par player plays: the game's own newRun (runId fixed, so nothing reads the clock). */
function startRun(hero: HeroId, seed: number): Run {
  return newRun(hero, parRunSeed(hero, seed), `par-${hero}-${seed}`);
}

/** Dusk won, next dawn: the game's finishDay (a win's income, yesterday's merchants, a fresh caravan). */
function nextDawn(run: Run): void {
  finishDay(run, 0, FIGHT_T, { ...SIDE0 }, { ...SIDE0 });
  // RUN-1 (REQ-BFG-059): a run played past its end (playerRun's depth past 10: day 10's dusk of a 10-day run, the 10th win
  // of a long run) goes on, so the deck keeps growing; a 10-day depth never gets here (its last dawn is day 10's)
  if (run.over) continueRun(run);
}

/** A copy of the run whose deck and cargo can change without touching the run (the shop is shared, never written). */
function simRun(run: Run): Run {
  return { ...run, build: cloneBuild(run.build), inventory: run.inventory.map((i) => ({ ...i })), fuseFx: [], fuseAnim: [] } as Run;
}

/** What buyOffer(run, ., ., at) would leave on the deck, on a copy of the run (the same gainModule path). */
function afterGain(run: Run, def: string, at: GainAt | undefined): Build {
  const sim = simRun(run);
  const pv = at ? mergePreview(sim, def) : null;
  gainModule(sim, def, pv && pv.where !== "cargo" ? undefined : at);
  return sim.build;
}

/** CAND-A (the skill-ladder fix): the rating the player reads on `day`, its damage weighed over that day's fight
 *  (deckRating.ts fightTime: 24 s on day 1 to 9.5 s on day 10; it was FIGHT_T, 25 s, on every day). */
export const rateOn = (b: Build, day: number): number => rateDeck(b, RATING_CURVE, fightTime(day), undefined, undefined, day).value; // BOTS-X: `day`, the sustain value while the switch is on (off: as before)

// ---------------------------------------------------------------- the bots' sustain (BOTS-X, SUS-C; SUSTAIN-1 4.8)

/** SUSTAIN-1 4.8 rule 3: a deck holds at most this many sustain pieces (WARD BELL, RIVETER, MEND PRESS, MENDING LOOM; a
 *  copy that merges into one is no new piece) ... */
export const SUSTAIN_MAX = 2;
/** ... and at most this many SHIELD sources (WARD BELL). */
export const SHIELD_MAX = 1;
/** Rule 4, the hero lean: a sustain piece of the hero's own keyword is worth this much more to it (the runes' style weight). */
export const SUSTAIN_LEAN = 1.5;
export const HERO_SUSTAIN: Readonly<Partial<Record<HeroId, SustainKw>>> = { bastion: "SHIELD", foundry: "HEAL", weaver: "REGEN" };

/** Rule 2's gate: the deck has its second damage source, a turret line (a belt into a turret) plus one rig (not RIVETER). */
export function secondSource(b: Build): boolean {
  return b.items.some((p) => ITEMS[p.def]?.kind === "gate" && !sustainKeyword(p.def)) && fedTurrets(b).size > 0;
}

/** The sustain pieces on the deck (its rigs, factories and gear), one per placed copy. */
export const sustainPieces = (b: Build): { def: string; kw: SustainKw }[] =>
  [...b.items, ...b.mods].flatMap((p) => { const kw = sustainKeyword(p.def); return kw ? [{ def: p.def, kw }] : []; });

/** The rating's read-outs on `day` (deckRating.ts RateOut): payloads a second by route, damage a second by turret. */
function readOuts(b: Build, day: number): RateOut {
  const ro: RateOut = { stokeKeep: new Map(), arrival: new Map(), turretDmg: new Map() };
  rateDeck(b, RATING_CURVE, fightTime(day), ro, undefined, day);
  return ro;
}

/** Rule 5: RIVETER's belt, the connected belt with the most payloads a second (ties: the lower route index); undefined: none. */
export function busiestRoute(b: Build, day: number): number | undefined {
  let best: number | undefined, most = 0;
  for (const [ri, a] of [...readOuts(b, day).arrival!].sort((x, y) => x[0] - y[0])) if (a > most) { most = a; best = ri; }
  return best;
}

/** Rule 5: WARD BELL's or MENDING LOOM's turret among `free` (turret slots with a free gear slot for it): one that doesn't
 *  need damage gear, an installed turret no belt feeds first, else the fed one with the least rated damage (damage gear
 *  multiplies a turret's damage, so it is worth least there); ties: the lower slot. */
export function quietTurret(b: Build, day: number, free: readonly number[]): number | undefined {
  const fed = fedTurrets(b), dmg = readOuts(b, day).turretDmg!;
  return [...free].sort((x, y) => Number(fed.has(x)) - Number(fed.has(y)) || (dmg.get(x) ?? 0) - (dmg.get(y) ?? 0) || x - y)[0];
}

/**
 * SUSTAIN-1 4.8 rules 2-4 and 6, with the sustain switch on (candidates() calls it only then). Every candidate is judged
 * as before (deckRating.ts: a sustain piece's gain is its effective hull against the day's expected foe); then
 * - rule 4: a sustain piece of the hero's own keyword gains x SUSTAIN_LEAN (a positive gain);
 * - rule 2: a sustain candidate may be taken only once the deck has its second damage source, and only as the best value
 *   per gold (rel / price) of the offer row: every candidate from the caravan's rolled offers (wagon >= 0; the two fixed
 *   packs and the gold upgrades sit outside the row: an ARMOR PACK's 250 hull for 5 gold would outbid every sustain piece
 *   at 1 star on every day) that the deck may take (rule 3's caps first); a tie goes to the lower item id (rule 6);
 * - rule 3: a new sustain piece only while the deck holds fewer than SUSTAIN_MAX, and a new WARD BELL only while it holds
 *   fewer than SHIELD_MAX (a copy that merges adds none).
 * A candidate that fails is `banned` (TUNE-M's mark): judged with the same draws, never taken. No RNG is read here.
 * Exported for tests (tests/botsx.sustain.test.ts).
 */
export function sustainRule(b: Build, out: Cand[]): void {
  const lean = HERO_SUSTAIN[b.hero];
  for (const c of out) if (lean && sustainKeyword(c.def) === lean && c.rel > 0) c.rel *= SUSTAIN_LEAN;
  const held = sustainPieces(b), shields = held.filter((p) => p.kw === "SHIELD").length, ready = secondSource(b);
  const per = (c: Cand): number => c.rel / Math.max(1, c.price);
  // first the gates (rules 2 and 3), then the value among the candidates still open: a piece the deck may not take (a
  // second WARD BELL) never blocks one it may; the open set is fixed before the comparison, so the order never matters
  for (const c of out) {
    const kw = sustainKeyword(c.def);
    if (kw && !(ready && (c.merge || (held.length < SUSTAIN_MAX && (kw !== "SHIELD" || shields < SHIELD_MAX))))) c.banned = true;
  }
  const open = out.filter((o) => o.wagon >= 0 && !o.banned);
  const lose = out.filter((c) => !c.banned && sustainKeyword(c.def)
    && !open.every((o) => o.def === c.def || per(c) > per(o) || (per(c) === per(o) && c.def < o.def)));
  for (const c of lose) c.banned = true;
}

const relOf = (after: Build, base: number, day: number): number => {
  const v = rateOn(after, day);
  return base > 0 ? v / base - 1 : v > 0 ? 1 : 0;
};

/** A new Shopper on `b` for belt edits only: an unlimited purse (moveRoute's check), stars, cores and factories on. */
const editor = (b: Build, day: number, rng: Rng): Shopper => new Shopper(b, Number.MAX_SAFE_INTEGER, day, rng, "on", FUSE_MAX, "on", "on");

// ---------------------------------------------------------------- FOUNDRY's sync (0.8.0 B1 M1)

/**
 * 0.8.0 B1 M1 (output-H1 REPORT section 11 item 5; N1's m1/sync-probe: the par FOUNDRY kept a synced gun in 92% of runs
 * on day 1 and 40-44% on days 9-10): the par player keeps a FOUNDRY's belts in sync. The CRUCIBLE pours a blank onto
 * each of its belts on one tick, and two blanks that reach one gun through different intakes within SYNC_WINDOW fuse
 * (races/foundry.ts). The rating counts each blank on its own belt, so it can't see a fusion lost; a player sees the
 * route inspector's SYNC mark (syncEstimate.ts syncedTurrets, the same estimate). So no change the player makes may lose
 * a synced gun: a speed rig (or a BRAKE) goes where it works both belts alike or onto another belt, never onto one belt
 * of a synced pair; a belt crate lengthens both belts of a pair alike (growBelt's pair growth); a redraw (a join, a feed
 * for a new gun, a moved factory) and a merge leave every synced gun in sync. Returns the judge of a changed deck, or
 * undefined when `b` has no synced gun: every deck without a CRUCIBLE (FURNACE, WEAVER, BASTION, ...), whose player is
 * thereby untouched, byte for byte.
 */
export function syncKeeper(b: Build): ((after: Build) => boolean) | undefined {
  const was = syncedTurrets(b);
  if (!was.length) return undefined;
  return (after) => {
    const now = syncedTurrets(after);
    return was.every((t) => now.includes(t));
  };
}

/** 0.8.0 B1 M1: the synced pairs of CRUCIBLE belts (route indices, i < j), for growBelt's pair growth. */
function syncPairs(b: Build): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < b.routes.length; i++) {
    for (const p of syncOf(b, i)?.partners ?? []) if (p.sync && p.route > i) out.push([i, p.route]);
  }
  return out;
}

/** The rig spots worth trying for `def`: the harness's H2 spot (Shopper.rigSpot) for every belt tile of a connected
 *  route with a free side (Shopper.rigTiles; a speed rig skips slag routes, rigTilesFor), each spot once. With `rng`
 *  (place "tile"), exactly as the harness's gate lever places a rig: one of those tiles at random, its H2 spot.
 *  CAND-A: with `rng` and `top`, a multi-arrow rig also tries `top` of the spots where most of its arrows land (at
 *  least two: on two tiles of a belt or on two belts), at random among them. */
function rigSpots(s: Shopper, def: string, rng?: Rng, aim: PolicyKnobs["aim"] = "h2", top = 0, ok?: (sp: RigSpot) => boolean): RigSpot[] {
  // 0.8.0 P1 (E3): a STOKER works factories, not belts: the free cells beside factories (beltside.ts stokeSpots), the
  // most factories first; "tile" picks one of them at random, as it picks a belt tile for any other rig
  if (ITEMS[def]?.gate?.stoke) {
    let all = stokeSpots(s.b, def).map((sp): RigSpot => ({ x: sp.x, y: sp.y, rot: sp.rot, hits: [] }));
    if (ok) all = all.filter(ok); // 0.8.0 B1 M1: FOUNDRY's sync guard (syncKeeper); absent for every other deck
    return rng ? (all.length ? [rng.pick(all)] : []) : all;
  }
  const out: RigSpot[] = [];
  const seen = new Set<string>();
  let tiles = s.rigTilesFor(ITEMS[def], s.rigTiles(), false);
  // SHAPES-1 (REQ-BFG-086 S7.1): a multi-cell rig takes the shaped-rig solver's placement (beltside.ts shapedSpot):
  // "tile" (typical) the best one that hits one random belt tile (its one draw, as for any rig), "best" (sharp) the global
  // best; a speed rig never hits a slag belt (P20)
  if (footOf(ITEMS[def]) !== "1") {
    const slag = s.slagRoutesFor(ITEMS[def]);
    const accept = slag ? (hs: { route: number }[]) => !hs.some((h) => slag[h.route]) : undefined;
    const t = rng ? (tiles.length ? rng.pick(tiles) : null) : undefined;
    if (t === null) return out;
    const sp = shapedSpot(s.b, def, s.connected(), accept, t);
    if (sp && (!ok || ok(sp))) out.push(sp);
    return out;
  }
  // 0.8.0 B1 M1: with FOUNDRY's sync guard, only the tiles whose spot keeps every synced gun in sync (a speed rig never
  // lands on one belt of a synced pair); without it (every deck without a synced gun) the tiles as before
  if (ok) tiles = tiles.filter(([ri, ti]) => { const sp = s.rigSpot(def, ri, ti); return !!sp && ok(sp); });
  if (rng && aim === "first") {
    // a random free side of a random belt tile, the rig's first arrow turned to that tile (other arrows land where
    // they land); a speed rig that would hit a slag belt is not put there (P20)
    if (!tiles.length) return out;
    const [ri, ti] = rng.pick(tiles);
    const b = s.b, k0 = b.routes[ri].cells[ti], occ = occupancy(b);
    const sides = ([0, 1, 2, 3] as Dir[]).filter((d) => {
      const k = arrowCell(kx(k0), ky(k0), d);
      return freeForRig(b, k, occ) && !intakeCell(b, k);
    });
    if (!sides.length) return out;
    const d = rng.pick(sides), k = arrowCell(kx(k0), ky(k0), d), rot = rotFacing(def, opposite(d));
    const hits = hitsIfPlaced(b, def, kx(k), ky(k), rot, beltIndex(b, s.connected()));
    const slag = s.slagRoutesFor(ITEMS[def]);
    if (slag && hits.some((h) => slag[h.route])) return out;
    if (ok && !ok({ x: kx(k), y: ky(k), rot, hits })) return out; // 0.8.0 B1 M1: the sync guard
    out.push({ x: kx(k), y: ky(k), rot, hits });
    return out;
  }
  for (const [ri, ti] of rng ? (tiles.length ? [rng.pick(tiles)] : []) : tiles) {
    const sp = s.rigSpot(def, ri, ti);
    if (!sp) continue;
    const k = `${sp.x},${sp.y},${sp.rot}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(sp);
  }
  if (rng && top > 0 && rigArrows(def).length > 1) {
    const all = rigSpots(s, def, undefined, "h2", 0, ok);
    const most = Math.max(0, ...all.map((sp) => sp.hits.length));
    if (most >= 2) {
      for (const sp of rng.shuffle(all.filter((x) => x.hits.length === most)).slice(0, top)) {
        const k = `${sp.x},${sp.y},${sp.rot}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(sp);
      }
    }
  }
  return out;
}

/**
 * A full deck (no free cell beside a connected belt): the rig upgrade. The player sells a placed rig worth less than
 * the offer (half its value back) and drops the new rig on that cell, turned for the most hits on connected belts
 * (the game's drop auto-aims; a speed rig never hits a slag belt, P20). Of those swaps, the best-rated; null: none.
 */
function rigSwap(b: Build, s: Shopper, def: string, price: number, uid: number, base: number, day: number, keep?: (after: Build) => boolean, stars = 1): Omit<Cand, "wagon" | "slot" | "price"> | null {
  if (footOf(ITEMS[def]) !== "1") return null; // SHAPES-1 (S7.3): one freed cell can't hold a multi-cell rig
  const slag = s.slagRoutesFor(ITEMS[def]);
  const belts = beltIndex(b, s.connected());
  let best: Omit<Cand, "wagon" | "slot" | "price"> | null = null;
  for (const p of b.items) {
    if (ITEMS[p.def].kind !== "gate" || valueOf(p.def, starsOf(p)) >= price) continue;
    const trial = cloneBuild(b);
    trial.items = trial.items.filter((q) => q.uid !== p.uid);
    let spot: RigSpot | null = null;
    for (const rot of rotations(def)) {
      const hits = hitsIfPlaced(trial, def, p.x, p.y, rot, belts);
      if (!hits.length || (slag && hits.some((h) => slag[h.route]))) continue;
      if (!spot || hits.length > spot.hits.length) spot = { x: p.x, y: p.y, rot, hits };
    }
    if (!spot) continue;
    placeRigAt(trial, uid, def, spot);
    if (stars > 1) starFresh(trial, new Set(b.items.map((q) => q.uid)), def, stars); // HULL-1d: LAST CHANCE's ★2 copy
    if (keep && !keep(trial)) continue; // 0.8.0 B1 M1: FOUNDRY's sync guard
    const r = relOf(trial, base, day);
    if (!best || r > best.rel) best = { def, kind: "rig", merge: false, at: { x: spot.x, y: spot.y, rot: spot.rot }, swap: p.uid, rel: r };
  }
  return best;
}

/** Belt tiles free under the deck's belt capacity. */
const beltFree = (b: Build): number => b.beltCap - b.routes.reduce((s, r) => s + r.cells.length, 0);

/**
 * SHAPES-1 (REQ-BFG-086 S7.3): does a shaped piece of `def` fit anywhere useful on `b`: a multi-cell rig a placement
 * that hits a connected belt (beltside.ts shapedSpot), a shaped factory a spot with a line into a free intake
 * (factoryPlan)? A 1-cell rig, a 2x2 factory and anything else: true (their own rules apply, as before). The buy policy
 * checks it before it buys a shape, so a shape the deck can't hold stays in the caravan.
 */
export function fitsSomewhere(b: Build, def: string, rng: Rng = new Rng(1)): boolean {
  const d = ITEMS[def];
  // GATES-1 (REQ-BFG-052, G6): a gate fits where a legal belt tile exists (split.ts splitProblem); the other kinds' rules stand as below
  if (d?.kind === "converter") return gateFits(b, def);
  if (!d || !isShaped(d)) return true;
  if (d.kind === "gate") {
    const claims = connectorClaims(b), occ = occupancy(b);
    return shapedSpot(b, def, (ri) => routeInfo(b, ri, claims, occ).connected) !== null;
  }
  return d.kind === "factory" ? factoryPlan(b, def, rng) !== null : true;
}

/** blockedCells of the deck with a `def` factory put at (x, y) as well: `bl` (blockedCells of the deck) with its
 *  footprint blocked, without copying the deck (CAND-A: the spot searches try every free spot). */
function withFactory(bl: Uint8Array, def: string, x: number, y: number): Uint8Array {
  const out = bl.slice();
  for (const k of footprint(ITEMS[def], x, y)) if (k >= 0 && k < out.length) out[k] = 1;
  return out;
}

/** SHAPES-1 (REQ-BFG-086 S7.2): `bl` with `cells` blocked as well (withFactory for any footprint). */
function withCells(bl: Uint8Array, cells: readonly number[]): Uint8Array {
  const out = bl.slice();
  for (const k of cells) if (k >= 0 && k < out.length) out[k] = 1;
  return out;
}

/** SHAPES-1 (REQ-BFG-086 S7.2): every spot of `d`'s footprint off the forward row, in scan order (row y from 1, then column
 *  x, then rot 0..footTurns-1), with its cells (foot.ts footprintCells): factoryPlan's scan over every anchor x rot. A 2x2
 *  (one rot) gives 0.9.9's scan exactly: rows 1-8, columns 0-8. */
function factorySpots(d: ItemDef): { x: number; y: number; rot: number; cells: number[] }[] {
  const out: { x: number; y: number; rot: number; cells: number[] }[] = [];
  const turns = footTurns(footOf(d));
  for (let y = 1; y < GRID; y++) for (let x = 0; x < GRID; x++) for (let rot = 0; rot < turns; rot++) {
    if (footOnDeck(d, x, y, rot)) out.push({ x, y, rot, cells: footprintCells(d, x, y, rot) });
  }
  return out;
}

/** The shortest belt a new 2x2 factory could have into a free intake (a free spot off the forward row), or Infinity
 *  when no intake is free or none can be reached. */
function factoryReach(b: Build): number {
  const cols = freeConnectors(b);
  if (!cols.length) return Infinity;
  const occ = occupancy(b), d = ITEMS.press, bl0 = blockedCells(b);
  let best = Infinity;
  for (let y = 1; y + d.size <= 10; y++) {
    for (let x = 0; x + d.size <= 10; x++) {
      if (footprint(d, x, y).some((k) => occ[k].item >= 0 || occ[k].route >= 0)) continue;
      const bl = withFactory(bl0, d.id, x, y), starts = startCells(x, y, d.size, bl);
      for (const col of cols) best = Math.min(best, shortestTiles(bl, starts, col));
    }
  }
  return best;
}

/** Turrets some connected belt feeds (the harness's mod lever prefers them). */
function fedTurrets(b: Build): Set<number> {
  const claims = connectorClaims(b), hits = rigHits(b), occ = occupancy(b);
  const out = new Set<number>();
  b.routes.forEach((_, ri) => {
    const info = routeInfo(b, ri, claims, occ, hits);
    if (info.connected && info.turret >= 0) out.add(info.turret);
  });
  return out;
}

/**
 * A new factory's own lines: the free 2x2 spot (off the forward row) with the shortest belt into a free intake that
 * the spare belt covers (ties: the first spot in row order), and for a factory with more outputs (GANTRY PRESS) the
 * next shortest belts into the other free intakes, while the belt lasts. null when none fits.
 */
function factoryPlan(b: Build, def: string, rng: Rng, line: PolicyKnobs["line"] = "short", only?: readonly number[]): { x: number; y: number; rot: number; routes: Line[] } | null {
  const d = ITEMS[def];
  const cols = freeConnectors(b).filter((c) => !only || only.includes(c)); // CAND-A: `only`, one turret's free intakes
  if (!cols.length) return null;
  const occ = occupancy(b), bl0 = blockedCells(b);
  let best: { x: number; y: number; rot: number; col: number; len: number } | null = null;
  // SHAPES-1 (REQ-BFG-086 S7.2): every anchor x rot of the footprint (factorySpots; a 2x2: 0.9.9's scan), start cells
  // from the turned edge (startCellsFor)
  for (const sp of factorySpots(d)) {
    if (sp.cells.some((k) => occ[k].item >= 0 || occ[k].route >= 0)) continue;
    const bl = withCells(bl0, sp.cells), starts = startCellsFor(sp.cells, bl);
    for (const col of cols) {
      const len = shortestTiles(bl, starts, col);
      if (len > beltFree(b)) continue;
      if (!best || len < best.len) best = { x: sp.x, y: sp.y, rot: sp.rot, col, len };
    }
  }
  if (!best) return null;
  const trial = cloneBuild(b);
  trial.items.push({ uid: -1, def, x: best.x, y: best.y, ...rotField(def, best.rot) });
  const routes: Line[] = [];
  let spare = beltFree(b);
  // bb-0.8.3 (REQ-BFG-042 D7): up to the bots' slots (belts.ts); under "reach" each further line into another turret
  const policy = beltPolicy(b.hero), outputs = botSlots(def, 1, b.hero, policy), h = deckHero(b), fed = new Set<number>();
  for (const col of [best.col, ...cols.filter((c) => c !== best!.col)]) {
    if (routes.length >= outputs) break;
    if (policy === "reach" && fed.has(turretForColumn(h, col))) continue;
    const bl = blockedCells(trial), starts = startCellsFor(footprintCells(d, best.x, best.y, best.rot), bl);
    const len = shortestTiles(bl, starts, col);
    if (len > spare) continue;
    // a winding line: shortest + random slack within the spare belt (a path of the drawn length may not exist: shorter)
    let cells: number[] | null = null;
    if (line === "random") for (let n = len + rng.int(spare - len + 1); n > len && !cells; n--) cells = randomPath(bl, starts, col, n, rng);
    cells ??= randomPath(bl, starts, col, len, rng);
    if (!cells) continue;
    routes.push({ cells });
    trial.routes.push({ factory: -1, cells });
    spare -= cells.length;
    fed.add(turretForColumn(h, col));
  }
  return routes.length ? { x: best.x, y: best.y, rot: best.rot, routes } : null;
}

/**
 * bb-0.8.3 (REQ-BFG-042 D7): one more belt for a factory that has a free slot for the bots (belts.ts botSlots; nothing
 * under "today"), the game's free draw out of the factory: its shortest line into each free intake ("come": any installed
 * turret's; "reach": a turret it doesn't feed yet) within the free belt, for the hero's signature factory and every
 * bought one alike. The best-rated deck, or null.
 */
function moreBelt(b: Build, day: number, rng: Rng, base: number, keep?: (after: Build) => boolean): { build: Build; rel: number } | null {
  const policy = beltPolicy(b.hero);
  const spare = beltFree(b);
  if (policy === "today" || spare <= 0) return null;
  let best: { build: Build; rel: number } | null = null;
  for (const p of b.items) {
    // bb-0.8.3 (REQ-BFG-044 D7'): at its grade (the hero factory's FACTORY level opens slots like a star does)
    if (ITEMS[p.def]?.kind !== "factory" || routesOf(b, p.uid).length >= botSlots(p.def, gradeOf(b, p), b.hero, policy) + wideSlots(p)) continue; // ENCHANT-1 (REQ-BFG-085): WIDE is +1 belt slot (0 off)
    const cols = policy === "reach" ? reachCols(b, p.uid) : freeConnectors(b);
    const bl = blockedCells(b), starts = startCellsFor(cellsOf(p), bl);
    for (const col of cols) {
      const len = shortestTiles(bl, starts, col);
      if (!Number.isFinite(len) || len > spare) continue;
      const cells = randomPath(bl, starts, col, len, rng);
      if (!cells) continue;
      const trial = cloneBuild(b);
      commitRoute(trial, p.uid, cells, -1);
      if (keep && !keep(trial)) continue; // 0.8.0 B1 M1: FOUNDRY's sync guard
      const rel = relOf(trial, base, day);
      if (!best || rel > best.rel) best = { build: trial, rel };
    }
  }
  return best;
}

// ---------------------------------------------------------------- joins (0.6.2j, REQ-BFG-027)

/** Breadth-first search through the free cells (bl: machinery, belts, the forward row) from `starts`: each cell's
 *  distance in tiles (a start is 1; -1 unreached) and its parent. */
function bfs(bl: Uint8Array, starts: number[]): { dist: Int32Array; prev: Int32Array } {
  const dist = new Int32Array(GRID * GRID).fill(-1), prev = new Int32Array(GRID * GRID).fill(-1), q: number[] = [];
  for (const s of starts) if (!bl[s] && dist[s] < 0) { dist[s] = 1; q.push(s); }
  for (let i = 0; i < q.length; i++) {
    const k = q[i];
    for (let d = 0; d < 4; d++) {
      const nx = kx(k) + DX[d], ny = ky(k) + DY[d];
      if (!inGrid(nx, ny)) continue;
      const n = key(nx, ny);
      if (dist[n] >= 0 || bl[n]) continue;
      dist[n] = dist[k] + 1;
      prev[n] = k;
      q.push(n);
    }
  }
  return { dist, prev };
}

/** The tiles a new joining belt may aim at: each connected belt's tiles (but `skip`'s) up to its first worked tile, so
 *  its payloads still meet the whole rig row; every tile of a belt no rig works. */
function joinTargets(b: Build, skip = -1): { route: number; tile: number }[] {
  const claims = connectorClaims(b), hits = rigHits(b), occ = occupancy(b);
  const out: { route: number; tile: number }[] = [];
  b.routes.forEach((r, m) => {
    if (m === skip || !routeInfo(b, m, claims, occ, hits).connected) return;
    const worked = (hits[m] ?? []).findIndex((t) => t.length > 0);
    const last = worked < 0 ? r.cells.length - 1 : worked;
    for (let t = 0; t <= last; t++) out.push({ route: m, tile: t });
  });
  return out;
}

/** The shortest joining line (bfs from a factory's starts) into tile `tile` of route m: to the reached free cell beside
 *  the tile nearest a start (ties: direction order), then the join. null when none is reached. */
function joinLine(b: Build, dist: Int32Array, prev: Int32Array, m: number, tile: number): Line | null {
  const k0 = b.routes[m].cells[tile];
  let best = -1;
  for (let d = 0; d < 4; d++) {
    const n = arrowCell(kx(k0), ky(k0), d as Dir);
    if (n < 0 || dist[n] < 1) continue;
    if (best < 0 || dist[n] < dist[best]) best = n;
  }
  if (best < 0) return null;
  const cells: number[] = [];
  for (let c = best; c >= 0; c = prev[c]) cells.push(c);
  return { cells: cells.reverse(), join: k0 };
}

/**
 * A new factory's plan (CAND-A): its own lines into free intakes (factoryPlan: into any, and into each installed
 * turret's own free intakes, so a line can feed a gun just put in the extra slot), or with `join` one line joining a
 * connected belt at a tile up to its rig row, from the free spot whose line there is shortest (ties: row order); the
 * best-rated plan. The editor's commitRoute writes each belt. null when none fits.
 */
function factoryCand(b: Build, def: string, uid: number, rng: Rng, pol: PolicyKnobs, base: number, day: number, keep?: (after: Build) => boolean): { x: number; y: number; rot: number; routes: Line[]; rel: number } | null {
  const place = (x: number, y: number, routes: Line[], rot = 0): Build => {
    const after = cloneBuild(b);
    after.items.push({ uid, def, x, y, ...rotField(def, rot) }); // SHAPES-1: a shaped factory's rot
    for (const l of routes) commitRoute(after, uid, l.cells, -1, l.join);
    return after;
  };
  let best: { x: number; y: number; rot: number; routes: Line[]; rel: number } | null = null;
  const free = freeConnectors(b);
  const groups: (readonly number[] | undefined)[] = [undefined];
  for (const v of installedTurrets(b)) {
    const cols = v.intakes.filter((c) => free.includes(c));
    if (cols.length && cols.length < free.length) groups.push(cols);
  }
  for (const only of groups) {
    const own = factoryPlan(b, def, rng, pol.line, only);
    if (!own) continue;
    const after = place(own.x, own.y, own.routes, own.rot);
    if (keep && !keep(after)) continue; // 0.8.0 B1 M1: FOUNDRY's sync guard
    const rel = relOf(after, base, day);
    if (!best || rel > best.rel) best = { ...own, rel };
  }
  if (!pol.join) return best;
  // TUNE-M, RULE JOIN LIMIT: a new factory's belt is the last route, so on a deck that already holds JOIN_LIMIT joins
  // its join would be refused (commitRoute's pruneJoins leaves it an open end): no join plan. JOINS-1 (REQ-BFG-091): with
  // FREE_JOINS on there is no limit, so the plan is always weighed (off: exactly as before)
  if (!freeJoinsRules() && joinCount(b) >= JOIN_LIMIT) return best;
  const d = ITEMS[def], occ = occupancy(b), spare = beltFree(b);
  const targets = joinTargets(b);
  if (!targets.length) return best;
  const near = targets.map(() => null as { x: number; y: number; rot: number; line: Line } | null);
  const bl0 = blockedCells(b);
  for (const sp of factorySpots(d)) { // SHAPES-1 (S7.2): every anchor x rot (a 2x2: 0.9.9's scan)
    if (sp.cells.some((k) => occ[k].item >= 0 || occ[k].route >= 0)) continue;
    const bl = withCells(bl0, sp.cells), { dist, prev } = bfs(bl, startCellsFor(sp.cells, bl));
    targets.forEach((t, i) => {
      const l = joinLine(b, dist, prev, t.route, t.tile);
      if (l && l.cells.length <= spare && (!near[i] || l.cells.length < near[i]!.line.cells.length)) near[i] = { x: sp.x, y: sp.y, rot: sp.rot, line: l };
    });
  }
  for (const n of near) {
    if (!n) continue;
    const after = place(n.x, n.y, [n.line], n.rot);
    if (newJoinProblem(after, after.routes.length - 1) !== null) continue;
    if (keep && !keep(after)) continue; // 0.8.0 B1 M1: FOUNDRY's sync guard
    const rel = relOf(after, base, day);
    if (!best || rel > best.rel) best = { x: n.x, y: n.y, rot: n.rot, routes: [n.line], rel };
  }
  return best;
}

/**
 * CAND-A: redraw one belt into a join, the game's free redraw: for each connected belt that neither joins nor is
 * joined, its shortest line into each target tile of another belt (within its own tiles plus the free belt), its
 * riders (rigs that work only it) lifted and put back beside the new belt (Shopper.reseat). The best-rated, or null.
 */
function rejoin(b: Build, day: number, rng: Rng, base: number, keep?: (after: Build) => boolean): { build: Build; rel: number } | null {
  const claims = connectorClaims(b);
  let best: { build: Build; rel: number } | null = null;
  b.routes.forEach((r, ri) => {
    if (r.join !== undefined || joinersOf(b, ri).length || !routeInfo(b, ri, claims).connected) return;
    best = joinRedraw(b, ri, day, rng, base, best, keep);
  });
  return best;
}

/** Belt ri redrawn into each join target (another connected belt's tile up to its rig row) at its shortest line from
 *  its factory (within its own tiles plus the free belt), its riders lifted and put back beside it: the best-rated
 *  of those and `best` (rejoin's scan; parBench's refeedRoute). */
function joinRedraw(b: Build, ri: number, day: number, rng: Rng, base: number, best: { build: Build; rel: number } | null, keep?: (after: Build) => boolean): { build: Build; rel: number } | null {
  const r = b.routes[ri], f = itemByUid(b, r.factory);
  if (!f) return best;
  const lifted = cloneBuild(b), s = editor(lifted, day, rng);
  const riders = s.ridersOf(ri);
  s.lift(riders);
  const bl = blockedCells(lifted, ri), { dist, prev } = bfs(bl, startCellsFor(cellsOf(f), bl));
  const room = r.cells.length + beltFree(b);
  for (const t of joinTargets(lifted, ri)) {
    const l = joinLine(lifted, dist, prev, t.route, t.tile);
    if (!l || l.cells.length > room) continue;
    const trial = cloneBuild(lifted);
    trial.routes[ri] = { factory: r.factory, cells: l.cells, join: l.join };
    if (newJoinProblem(trial, ri) !== null) continue; // TUNE-M: never a join past RULE JOIN LIMIT, here or later
    if (editor(trial, day, rng).reseat(riders.map((p) => ({ ...p })), ri) < riders.length) continue;
    if (keep && !keep(trial)) continue; // 0.8.0 B1 M1: FOUNDRY's sync guard
    const rel = relOf(trial, base, day);
    if (!best || rel > best.rel) best = { build: trial, rel };
  }
  return best;
}

// ---------------------------------------------------------------- turrets (0.6.2s, REQ-BFG-031)

/**
 * The ways to feed turret slot `slot` (a turret just installed there, no belt yet): a connected belt that no belt
 * joins (a joining belt too: it then runs to the intake instead), redrawn at its shortest into one of the slot's
 * intakes within its tiles plus the free belt (the game's free redraw; Shopper.moveRoute lifts its riders and puts
 * them back beside the new belt). Each a new deck.
 */
function feedPlans(b: Build, slot: number, day: number, rng: Rng): Build[] {
  const out: Build[] = [];
  const cols = turretSlots(b)[slot]?.intakes ?? [];
  const claims = connectorClaims(b), free = beltFree(b);
  b.routes.forEach((r, ri) => {
    if (joinersOf(b, ri).length || !routeInfo(b, ri, claims).connected) return;
    const f = itemByUid(b, r.factory);
    if (!f) return;
    const bl = blockedCells(b, ri), starts = startCellsFor(cellsOf(f), bl);
    for (const col of cols) {
      const len = shortestTiles(bl, starts, col);
      if (!Number.isFinite(len) || len > r.cells.length + free) continue;
      const trial = cloneBuild(b);
      if (editor(trial, day, rng).moveRoute(ri, len, col)) out.push(trial);
    }
    const moved = moveFactoryPlan(b, ri, cols, r.cells.length + free, day, rng);
    if (moved) out.push(moved);
  });
  return out;
}

/**
 * CAND-A: the factory of belt ri moved (the build screen's free move) to the free spot with the shortest line into one
 * of `cols` (ties: row order, then the column order), its belt redrawn there at that length (at most `room` tiles) and
 * its riders put back beside it. Only a factory with that one belt, not the hero's own (KILN, LOOM). null: none fits.
 */
function moveFactoryPlan(b: Build, ri: number, cols: readonly number[], room: number, day: number, rng: Rng): Build | null {
  const r = b.routes[ri], f = itemByUid(b, r.factory);
  if (!f || f.def === HEROES[b.hero].factory || b.routes.some((q, i) => i !== ri && q.factory === f.uid)) return null;
  const fd = ITEMS[f.def];
  const lifted = cloneBuild(b), s = editor(lifted, day, rng);
  const riders = s.ridersOf(ri);
  s.lift(riders);
  lifted.items = lifted.items.filter((p) => p.uid !== f.uid);
  lifted.routes[ri] = { factory: f.uid, cells: [] };
  const occ = occupancy(lifted), bl0 = blockedCells(lifted, ri);
  let best: { x: number; y: number; rot: number; col: number; len: number } | null = null;
  for (const sp of factorySpots(fd)) { // SHAPES-1 (S7.2): every anchor x rot (a 2x2: 0.9.9's scan)
    if (sp.cells.some((k) => occ[k].item >= 0 || occ[k].route >= 0)) continue;
    const bl = withCells(bl0, sp.cells), starts = startCellsFor(sp.cells, bl);
    for (const col of cols) {
      const len = shortestTiles(bl, starts, col);
      if (len <= room && (!best || len < best.len)) best = { x: sp.x, y: sp.y, rot: sp.rot, col, len };
    }
  }
  if (!best) return null;
  const trial = cloneBuild(lifted);
  const moved: Placed = { ...f, x: best.x, y: best.y };
  delete moved.rot;
  trial.items.push({ ...moved, ...rotField(f.def, best.rot) });
  const bl = blockedCells(trial, ri);
  const cells = randomPath(bl, startCellsFor(footprintCells(fd, best.x, best.y, best.rot), bl), best.col, best.len, rng);
  if (!cells) return null;
  trial.routes[ri] = { factory: f.uid, cells };
  if (editor(trial, day, rng).reseat(riders.map((p) => ({ ...p })), ri) < riders.length) return null;
  return trial;
}

/** A swap can leave belts under slot t without an intake (an "inner" turret takes one column): each is redrawn at its
 *  shortest into a free intake (within its tiles plus the free belt), shortest first. False when one can't be. */
function rerouteDeadEnds(b: Build, t: number, day: number, rng: Rng): boolean {
  for (const ri of deadEndsAt(b, t)) {
    const r = b.routes[ri];
    if (r.join !== undefined || joinersOf(b, ri).length) return false;
    const f = itemByUid(b, r.factory);
    if (!f) return false;
    const bl = blockedCells(b, ri), starts = startCellsFor(cellsOf(f), bl);
    const tries = freeConnectors(b, ri).map((col) => ({ col, len: shortestTiles(bl, starts, col) }))
      .filter((c) => Number.isFinite(c.len) && c.len <= r.cells.length + beltFree(b)).sort((x, y) => x.len - y.len || x.col - y.col);
    if (!tries.some((c) => editor(b, day, rng).moveRoute(ri, c.len, c.col))) return false;
  }
  return deadEndsAt(b, t).length === 0;
}

/** Put a cargo gear piece or core onto turret t: the build screen's drop (actions.ts: takeFromInventory, then the
 *  hardpoint) or run.ts fitCore. */
function refitTo(run: Run, f: Refit): boolean {
  if (f.core) return fitCore(run, f.uid, f.turret);
  const it = takeFromInventory(run, f.uid);
  if (!it) return false;
  run.build.mods.push({ uid: it.uid, def: it.def, turret: f.turret, ...(starsOf(it) > 1 ? { stars: starsOf(it) } : {}) });
  return true;
}

/** The value of a cargo copy (a turret's counts a free starting copy as 0). */
const cargoValue = (it: { def: string; stars?: number; free?: boolean }): number => (isTurretDef(it.def) ? turretValue(it) : valueOf(it.def, starsOf(it)));

/** What a plan does with the parts its swap handed back (`back`, cargo uids): gear and cores onto a turret with room
 *  (the first installed turret that takes it, fed ones first), else sold; a displaced turret sold when it is worth
 *  something (a 1-star starting turret can't be sold: it stays in cargo, worth 0). Applied to `sim`. */
function settle(sim: Run, back: number[]): { refit: Refit[]; sell: number[]; sold: boolean } {
  const refit: Refit[] = [], sell: number[] = [];
  const fed = fedTurrets(sim.build);
  const slots = installedTurrets(sim.build).map((v) => v.slot).sort((x, y) => Number(fed.has(y)) - Number(fed.has(x)) || x - y);
  for (const uid of back) {
    const it = sim.inventory.find((i) => i.uid === uid);
    if (!it) continue;
    if (isTurretDef(it.def)) {
      if (canSellTurret(it)) sell.push(uid);
      continue;
    }
    const core = ITEMS[it.def].kind === "core";
    const t = slots.find((s) => (core ? !coreFor(sim.build, s) : canFitGear(sim.build, s, it.def).ok));
    if (t !== undefined && refitTo(sim, { uid, turret: t, core })) refit.push({ uid, turret: t, core });
    else sell.push(uid);
  }
  let sold = false;
  for (const uid of sell) {
    const it = sim.inventory.find((i) => i.uid === uid)!;
    if (cargoValue(it) > 0) sold = true;
    sellInventory(sim, uid);
  }
  return { refit, sell, sold };
}

/**
 * A turret offer's best plans (0.6.2s REQ-BFG-031), each played on a copy of the run through the game's actions:
 * buyOffer's gain (gainModule into cargo), installFromCargo into each slot: the empty extra slot with a belt redrawn to
 * feed it (feedPlans), or an installed turret's slot (a swap; dead ends redrawn), the displaced turret perhaps
 * installed in the empty extra slot with a belt to feed it; then the handed-back parts settled. The best plan of each
 * kind ("extra": a plain buy; "replace": an upgrade, a late sink), so a swap never hides a gun for the extra slot.
 * {} when the copy merges into an installed twin (a merge) or no plan exists.
 */
type TurretBest = { plan: TurretPlan; rel: number };
function turretCand(run: Run, def: string, pol: PolicyKnobs, rng: Rng, base: number, keep?: (after: Build) => boolean): { extra?: TurretBest; replace?: TurretBest } {
  const sim0 = simRun(run);
  const g = gainModule(sim0, def);
  const best: { extra?: TurretBest; replace?: TurretBest } = {};
  if (g.where !== "cargo") return best;
  const consider = (sim: Run, back: number[], p: Pick<TurretPlan, "slot" | "moved" | "into" | "replaced">) => {
    if (keep && !keep(sim.build)) return; // 0.8.0 B1 M1: FOUNDRY's sync guard (a redrawn or swapped gun's belts)
    const s = settle(sim, back);
    const rel = relOf(sim.build, base, run.day);
    const cur = best[p.into];
    if (!cur || rel > cur.rel) best[p.into] = { plan: { copy: g.survivor, ...p, refit: s.refit, sell: s.sell, sold: s.sold, build: sim.build }, rel };
  };
  for (const v of turretSlots(sim0.build)) {
    if (!v.turret && !pol.extra) continue;
    const sim = simRun(sim0);
    const r = installFromCargo(sim, g.survivor, v.slot);
    if (!r.ok) continue;
    const back = [...r.turrets.map((x) => x.uid), ...r.mods.map((m) => m.uid)];
    if (!v.turret) {
      for (const fed of feedPlans(sim.build, v.slot, run.day, rng)) {
        const s2 = simRun(sim);
        s2.build = fed;
        consider(s2, back, { slot: v.slot, into: "extra" });
      }
      continue;
    }
    if (!rerouteDeadEnds(sim.build, v.slot, run.day, rng)) continue;
    const replaced = r.turrets[0]?.def;
    consider(simRun(sim), back, { slot: v.slot, into: "replace", replaced });
    const displaced = r.turrets[0];
    if (!displaced || !pol.extra) continue;
    for (const e of turretSlots(sim.build).filter((x) => !x.turret)) {
      const s2 = simRun(sim);
      if (!installFromCargo(s2, displaced.uid, e.slot).ok) continue;
      for (const fed of feedPlans(s2.build, e.slot, run.day, rng)) {
        const s3 = simRun(s2);
        s3.build = fed;
        consider(s3, back.filter((u) => u !== displaced.uid), { slot: v.slot, moved: e.slot, into: "replace", replaced });
      }
    }
  }
  return best;
}

/** CAND-A: `b` with factory plan `fp`'s factory (uid `uid`, def `fdef`) and its lines: the deck pairCand rates a turret and
 *  factory pair on. SHAPES-1 flip fix: the factory stands at the plan's rot (rotField), as factoryCand places it. It was
 *  pushed at rot 0, so a turned 2x3 GANTRY PRESS or I3 ASSEMBLY LINE (factoryPlan's spot, scanned at every rot) overlapped a
 *  piece, left the deck or stood away from its own lines' start in the deck being rated (par runs s1-s6: BASTION d5, METRONOME
 *  d6, SIPHON d8). A 2x2 plan's rot is 0, so its deck is exactly as before. */
export function withFactoryPlan(b: Build, uid: number, fdef: string, fp: { x: number; y: number; rot: number; routes: readonly { cells: number[] }[] }): Build {
  const after = cloneBuild(b);
  after.items.push({ uid, def: fdef, x: fp.x, y: fp.y, ...rotField(fdef, fp.rot) });
  for (const l of fp.routes) commitRoute(after, uid, l.cells, -1);
  return after;
}

/**
 * CAND-A: a turret for an empty slot, judged with a factory offer the purse also covers whose own line would feed it
 * (factoryPlan into that turret's intakes on the deck with it installed). The plan installs the turret unfed; the
 * factory is judged on its own next, its line into the new turret among its choices (factoryCand). null: no such line.
 */
function pairCand(run: Run, def: string, fdef: string, pol: PolicyKnobs, rng: Rng, base: number, keep?: (after: Build) => boolean): { plan: TurretPlan; rel: number } | null {
  const sim0 = simRun(run);
  const g = gainModule(sim0, def);
  if (g.where !== "cargo") return null;
  let best: { plan: TurretPlan; rel: number } | null = null;
  for (const v of turretSlots(sim0.build)) {
    if (v.turret) continue;
    const sim = simRun(sim0);
    if (!installFromCargo(sim, g.survivor, v.slot).ok) continue;
    const fp = factoryPlan(sim.build, fdef, rng, pol.line, turretSlots(sim.build)[v.slot].intakes);
    if (!fp) continue;
    const after = withFactoryPlan(sim.build, sim.nextUid, fdef, fp); // SHAPES-1 flip fix: the plan's factory at its rot
    if (keep && (!keep(after) || !keep(sim.build))) continue; // 0.8.0 B1 M1: FOUNDRY's sync guard
    const rel = relOf(after, base, run.day);
    if (!best || rel > best.rel) best = { plan: { copy: g.survivor, slot: v.slot, into: "extra", refit: [], sell: [], sold: false, build: sim.build }, rel };
  }
  return best;
}

/** CAND-A: a cargo turret (one a swap displaced) back into an empty slot with a belt to feed it, when that rates best. */
function reinstallCand(run: Run, rng: Rng, base: number, keep?: (after: Build) => boolean): { uid: number; slot: number; build: Build; rel: number } | null {
  const empty = turretSlots(run.build).filter((v) => !v.turret).map((v) => v.slot);
  let best: { uid: number; slot: number; build: Build; rel: number } | null = null;
  if (!empty.length) return best;
  for (const it of run.inventory) {
    if (!isTurretDef(it.def)) continue;
    for (const e of empty) {
      const sim = simRun(run);
      if (!installFromCargo(sim, it.uid, e).ok) continue;
      for (const fed of feedPlans(sim.build, e, run.day, rng)) {
        if (keep && !keep(fed)) continue; // 0.8.0 B1 M1: FOUNDRY's sync guard
        const rel = relOf(fed, base, run.day);
        if (!best || rel > best.rel) best = { uid: it.uid, slot: e, build: fed, rel };
      }
    }
  }
  return best;
}

/** The same deck (a plan against its replay). */
const same = (a: Build, b: Build): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * The belt a player lengthens with its free belt capacity (after a belt crate): for each connected route, the route
 * redrawn `free` tiles longer into the same intake (Shopper.moveRoute: its riders, the rigs that work only it, are
 * lifted and put back beside the new belt; the harness's own route edit), and of those the best-rated deck. null
 * when nothing can grow or no growth rates above `base`. CAND-A: a belt that joins or is joined isn't redrawn here.
 */
function growBelt(b: Build, day: number, rng: Rng, base: number, keep = syncKeeper(b)): { build: Build; tiles: number; rel: number } | null {
  // while a factory line still fits into a free intake, the player keeps the belt it needs
  const reach = factoryReach(b);
  const free = beltFree(b) - (reach <= beltFree(b) ? reach : 0);
  if (free <= 0) return null;
  const claims = connectorClaims(b);
  let best: { build: Build; tiles: number; rel: number } | null = null;
  b.routes.forEach((r, ri) => {
    if (r.join !== undefined || joinersOf(b, ri).length) return;
    if (!routeInfo(b, ri, claims, undefined, []).connected) return;
    const col = r.cells[r.cells.length - 1] % 10;
    for (let tiles = Math.min(MAX_TILES, r.cells.length + free); tiles > r.cells.length; tiles--) {
      const trial = cloneBuild(b);
      const s = editor(trial, day, rng);
      if (!s.moveRoute(ri, tiles, col)) continue;
      if (keep && !keep(trial)) break; // 0.8.0 B1 M1: FOUNDRY's sync guard (one belt of a synced pair never grows alone)
      const rel = relOf(trial, base, day);
      if (!best || rel > best.rel) best = { build: trial, tiles: tiles - r.cells.length, rel };
      break;
    }
  });
  // 0.8.0 B1 M1: a synced pair of CRUCIBLE belts grows together, both to one new length (the free belt split between
  // them), so its blanks still meet; the longest such growth that keeps the gun in sync
  if (keep) {
    for (const [i, j] of syncPairs(b)) {
      const ri = b.routes[i], rj = b.routes[j];
      if (ri.join !== undefined || rj.join !== undefined || joinersOf(b, i).length || joinersOf(b, j).length) continue;
      const len = Math.max(ri.cells.length, rj.cells.length);
      const ci = ri.cells[ri.cells.length - 1] % 10, cj = rj.cells[rj.cells.length - 1] % 10;
      for (let tiles = Math.min(MAX_TILES, len + Math.floor((free - Math.abs(ri.cells.length - rj.cells.length)) / 2)); tiles > len; tiles--) {
        const trial = cloneBuild(b);
        const s = editor(trial, day, rng);
        if (!s.moveRoute(i, tiles, ci) || !s.moveRoute(j, tiles, cj) || !keep(trial)) continue;
        const rel = relOf(trial, base, day);
        const grew = tiles - ri.cells.length + tiles - rj.cells.length;
        if (!best || rel > best.rel) best = { build: trial, tiles: grew, rel };
        break;
      }
    }
  }
  return best;
}

const kindOf = (def: string): Kind => {
  const k = ITEMS[def].kind;
  if (k === "converter") return "converter"; // GATES-1 (REQ-BFG-052, G6): not a rig, not gear, not a crate
  return k === "gate" ? "rig" : k === "mod" ? "gear" : k === "core" ? "core" : k === "factory" ? "factory" : k === "turret" ? "turret" : ITEMS[def].supply?.hull ? "plating" : "crate";
};

/** Every affordable offer the deck can take, with what it does to the rating: merges into a placed twin, rigs at an
 *  H2 spot, gear and cores on a free hardpoint or socket (never a core swap), factories with their belts, plating, and
 *  belt crates with the belt they lengthen (pol.grow). CAND-A: turrets (turretCand), gear in any free gear slot of an
 *  installed turret, factory belts that join, and a multi-arrow rig's best-landing spots. */
function candidates(run: Run, maxStars: number, rng: Rng, pol: PolicyKnobs): Cand[] {
  const b = run.build, day = run.day;
  const base = rateOn(b, day);
  const s = new Shopper(b, maxGoldByDay(run.day), run.day, rng, "on", maxStars, "on", "on");
  s.uid = run.nextUid;
  const out: Cand[] = [];
  const planned = new Map<string, Omit<Cand, "wagon" | "slot" | "price">[]>();
  const fed = fedTurrets(b);
  const banned = forbidden(pol); // TUNE-M (T1): empty for both policies
  // 0.8.0 B1 M1: FOUNDRY's sync guard (undefined for every deck without a synced gun: every candidate as before)
  const keep = syncKeeper(b);
  const keepSpot = keep && ((def: string) => (sp: RigSpot) => {
    const after = cloneBuild(b);
    placeRigAt(after, run.nextUid, def, sp);
    return keep(after);
  });
  // CAND-A: the factories on offer, for a turret judged with the factory that would feed it (pairCand)
  const factories = run.shop.wagons.flatMap((w) => w.offers.filter((o) => !o.sold && ITEMS[o.def].kind === "factory").map((o) => ({ def: o.def, price: o.price })));
  const sus = sustainLive(); // BOTS-X (SUS-C): the bots' sustain rules (SUSTAIN-1 4.8), only while the switch is on
  // GATES-1 (REQ-BFG-052, G6): the rating's belt flow, read once and only for a gate on offer (gateBots.ts reads it for its rule and its worth)
  let flow: RateOut | undefined;
  const gflow = (): RateOut => (flow ??= readFlow(b, day));
  run.shop.wagons.forEach((w, wi) => w.offers.forEach((o, si) => {
    if (o.sold || o.price > run.gold) return;
    const d = ITEMS[o.def];
    const push = (cs: Omit<Cand, "wagon" | "slot" | "price">[]) => { for (const c of cs) out.push({ ...c, wagon: wi, slot: si, price: o.price }); };
    if (planned.has(o.def)) return push(planned.get(o.def)!);
    let c: Omit<Cand, "wagon" | "slot" | "price"> | null = null;
    const kw = sus ? sustainKeyword(o.def) : undefined; // BOTS-X: a sustain piece (placed by rule 5 below)
    const more: Omit<Cand, "wagon" | "slot" | "price">[] = []; // CAND-A: a turret's second plan (its best swap)
    if (d.kind === "supply") {
      const after = cloneBuild(b);
      if (d.supply?.hull) after.hullBonus += d.supply.hull;
      if (d.supply?.belt) after.beltCap += d.supply.belt;
      c = { def: o.def, kind: kindOf(o.def), merge: false, rel: relOf(after, base, day) };
      if (d.supply?.belt) {
        // a belt crate is bought to lengthen a belt: the one that rates best with the new capacity
        const g = growBelt(after, run.day, rng, base);
        if (g && g.rel > c.rel) c = { ...c, rel: g.rel, grown: { build: g.build, tiles: g.tiles } };
      }
    } else if (fusible(o.def)) {
      const pv = mergePreview(run, o.def);
      if (pv && pv.toStars > maxStars) c = null; // over the cap (stand-in candidates stop at 2 stars)
      else if (pv && pv.where !== "cargo") {
        const after = afterGain(run, o.def, { x: 0, y: 0 });
        // 0.8.0 B1 M1: a merge that would lose a synced gun is no candidate (FOUNDRY's sync guard)
        // GATES-1 (REQ-BFG-052, G6): the rating is blind to a gate, so a merged gate adds what the table says its star adds
        c = keep && !keep(after) ? null : { def: o.def, kind: kindOf(o.def), merge: true, rel: d.kind === "converter" ? relOf(after, base, day) + gateWorth(after, gflow()) - gateWorth(b, gflow()) : relOf(after, base, day) };
      } else if (d.kind === "converter") {
        // GATES-1 (REQ-BFG-052, G6): a gate stands ON a belt tile, where the bots' rule puts it (gateBots.ts gateSpot: none where it does
        // nothing); its worth is the table's (gateWorth), added to the rating's own change (a rig whose arrow it idles loses its hit)
        const sp = fitsSomewhere(b, o.def) ? gateSpot(b, o.def, gflow()) : null;
        if (sp) {
          const after = cloneBuild(b);
          after.items.push({ uid: run.nextUid, def: o.def, x: sp.x, y: sp.y, ...(pv && pv.toStars > 1 ? { stars: pv.toStars } : {}) }); // a cargo twin merges into it
          if (!keep || keep(after)) c = { def: o.def, kind: "converter", merge: false, at: { x: sp.x, y: sp.y }, rel: relOf(after, base, day) + gateWorth(after, gflow()) - gateWorth(b, gflow()) };
        }
      } else if (d.kind === "gate") {
        let best: Omit<Cand, "wagon" | "slot" | "price"> | null = null;
        // BOTS-X (rule 5): RIVETER only on the belt with the most payloads a second (its HIT heals scale with traffic)
        const busy = kw ? busiestRoute(b, day) : undefined;
        const ok = keepSpot ? keepSpot(o.def) : undefined;
        const spotOk = kw ? (sp: RigSpot) => busy !== undefined && sp.hits.some((h) => h.route === busy) && (!ok || ok(sp)) : ok;
        // SHAPES-1 (S7.3): a shape the deck can't hold is no candidate (fitsSomewhere; a 1-cell rig always passes)
        for (const sp of !isShaped(d) || fitsSomewhere(b, o.def) ? rigSpots(s, o.def, pol.place === "tile" ? rng : undefined, pol.aim, pol.aimTop, spotOk) : []) {
          const after = cloneBuild(b);
          placeRigAt(after, run.nextUid, o.def, sp);
          const r = relOf(after, base, day);
          if (!best || r > best.rel) best = { def: o.def, kind: "rig", merge: false, at: { x: sp.x, y: sp.y, rot: sp.rot }, rel: r };
        }
        // no free cell beside a belt: an upgrade sells a cheaper placed rig and puts the new one on its cell (BOTS-X: never
        // for a sustain piece, which takes no damage piece's place)
        if (!best && pol.upgrade && !kw && !s.hasRigTile()) best = rigSwap(b, s, o.def, o.price, run.nextUid, base, day, keep);
        c = best;
      } else if (d.kind === "mod" || d.kind === "core") {
        // 0.6.2s (S4): gear into a free GEAR SLOT of an installed turret (never two copies of one def on a turret), a
        // core into a socket without a bought core; "tile": one such turret at random, a fed one when there is one
        const slots = installedTurrets(b).map((v) => v.slot);
        const room = (t: number) => (d.kind === "mod" ? canFitGear(b, t, o.def).ok : !coreFor(b, t));
        const free = slots.filter(room);
        const live = free.filter((t) => fed.has(t));
        // BOTS-X (rule 5): WARD BELL and MENDING LOOM in a free gear slot of a turret that doesn't need damage gear (no draw)
        const quiet = kw ? quietTurret(b, day, free) : undefined;
        const tries = kw ? (quiet !== undefined ? [quiet] : []) : pol.place === "tile" ? (free.length ? [rng.pick(live.length ? live : free)] : []) : free;
        let best: Omit<Cand, "wagon" | "slot" | "price"> | null = null;
        for (const t of tries) {
          const after = cloneBuild(b);
          after.mods.push({ uid: run.nextUid, def: o.def, turret: t });
          const r = relOf(after, base, day);
          if (!best || r > best.rel) best = { def: o.def, kind: kindOf(o.def), merge: false, at: { turret: t }, rel: r };
        }
        if (!free.length && pol.upgrade && !kw) { // BOTS-X: a sustain piece never replaces fitted gear
          // no room for it on any turret: an upgrade replaces a fitted piece of its kind worth less than this offer (sold)
          for (const t of slots) {
            const fitted: ModPlacement[] = d.kind === "mod" ? gearOn(b, t) : [coreFor(b, t)].filter((m): m is ModPlacement => !!m);
            for (const old of fitted) {
              if (old.def === o.def || valueOf(old.def, starsOf(old)) >= o.price) continue;
              const after = cloneBuild(b);
              after.mods = after.mods.filter((m) => m.uid !== old.uid);
              if (d.kind === "mod" && !canFitGear(after, t, o.def).ok) continue;
              after.mods.push({ uid: run.nextUid, def: o.def, turret: t });
              const r = relOf(after, base, day);
              if (!best || r > best.rel) best = { def: o.def, kind: kindOf(o.def), merge: false, at: { turret: t }, swap: old.uid, rel: r };
            }
          }
        }
        c = best;
      } else if (d.kind === "factory") {
        // BOTS-X (rule 5): MEND PRESS where ARMOR PRESS would go, only where it adds a line: a free spot and a free intake,
        // never a join (cap's answer 2 to SUS-A)
        const fp = factoryCand(b, o.def, run.nextUid, rng, kw ? { ...pol, join: 0 } : pol, base, day, keep);
        if (fp) c = { def: o.def, kind: "factory", merge: false, at: { x: fp.x, y: fp.y, ...(fp.rot ? { rot: fp.rot } : {}) }, routes: fp.routes, rel: fp.rel };
      } else if (d.kind === "turret" && pol.turret) {
        const tp = turretCand(run, o.def, pol, rng, base, keep);
        let extra = tp.extra;
        if (pol.extra) {
          for (const f of factories) {
            if (o.price + f.price > run.gold) continue;
            const pc = pairCand(run, o.def, f.def, pol, rng, base, keep);
            // FIX-ABE E: a forbidden factory is weighed as usual (the plan buys only the turret; the factory is refused when taken)
            if (pc && (!extra || pc.rel > extra.rel)) extra = pc;
          }
        }
        if (extra) c = { def: o.def, kind: "turret", merge: false, turret: extra.plan, rel: extra.rel };
        if (tp.replace) more.push({ def: o.def, kind: "turret", merge: false, turret: tp.replace.plan, rel: tp.replace.rel });
      }
    }
    const cs = [...(c ? [c] : []), ...more];
    if (banned.has(o.def)) for (const x of cs) x.forbid = true; // TUNE-M (T1): judged, never taken (FIX-ABE E: its own mark)
    planned.set(o.def, cs);
    push(cs);
  }));
  out.push(...upgradeCands(run, base, banned));
  out.push(...packCands(run, base, banned)); // bb-0.8.6 (REQ-BFG-051 P6)
  if (enchantRules() && pol.wordBuy === undefined && run.shop.enchanter) out.push(...wordCands(run)); // ENCHANT-1 (REQ-BFG-085, E8): the ENCHANTER's offers, valued by the rating
  if (sus) sustainRule(b, out); // BOTS-X (SUS-C): rules 2-4 and 6, only while the switch is on
  if (scaleRules()) readerRule(run, out, base, pol); // SCALE-2d (REQ-BFG-098 098.6): SCALE_RIGS on only
  return out;
}

// ---------------------------------------------------------------- ENCHANT-1 (REQ-BFG-085, E8): the bots' words

/** E8: what the valuation reads from this player for WIDE on a factory: the belt it would lay into the new slot (moreBelt on the fixed seed
 *  the factory level's slot is judged with, moreSlotRel), as a fraction of the deck's rating (-Infinity: none fits). */
const wordExtras = (run: Run): WordExtras => ({ wideFactory: (after, base) => moreSlotRel(after, run.day, base) });

/** E8: the ENCHANTER's offers as candidates: each unsold offer the purse affords with the best piece for its word (enchantBot.ts
 *  enchanterPlans: the rating's gain, a held word netted out), judged and picked like a part by gain for the gold (pickOffer: above
 *  PolicyKnobs.minRel is helpful, the best gain per gold is the pick). Outside the shop: wagon -3, the slot is the offer's index. */
function wordCands(run: Run): Cand[] {
  return enchanterPlans(run, wordExtras(run)).map(({ slot, price, plan }) => ({ wagon: -3, slot, def: `ench:${plan.word}`, price, kind: "word" as const, merge: false, rel: plan.spot.value, plan }));
}

/** E8: buy a word candidate through the game's buyEnchant (applied, then paid), then the follow-up WIDE needs: a factory's new belt (the one
 *  it was judged with) or a turret's gear from cargo (the best-rated). */
function buyWordCand(run: Run, c: Cand, why: PlayerBuy["why"], rolls: number, buys: PlayerBuy[]): void {
  const plan = c.plan!, spot = plan.spot;
  buyPlan(run, c.slot, plan);
  buys.push({
    day: run.day, roll: rolls, def: c.def, price: c.price, stars: 1, merged: false, why,
    word: { id: plan.word, on: spot.def, slot: spot.target.kind === "turret" ? spot.target.slot : spot.target.uid, value: spot.value, ...(spot.replaces ? { replaced: spot.replaces } : {}) },
  });
  if (plan.word !== "wide") return;
  if (spot.target.kind === "item" && ITEMS[spot.def].kind === "factory") {
    const mb = moreBelt(run.build, run.day, new Rng(hashSeed(run.day, "upgrade-belt")), rateOn(run.build, run.day), syncKeeper(run.build));
    if (mb && mb.rel > 0) {
      run.build.items = mb.build.items;
      run.build.routes = mb.build.routes;
    }
  } else if (spot.target.kind === "turret") {
    const slot = spot.target.slot, base = rateOn(run.build, run.day);
    let best: { uid: number; rel: number } | undefined;
    for (const it of [...run.inventory].sort((x, y) => x.uid - y.uid)) {
      if (ITEMS[it.def]?.kind !== "mod" || !canFitGear(run.build, slot, it.def).ok) continue;
      const after = cloneBuild(run.build);
      after.mods.push({ uid: it.uid, def: it.def, turret: slot, ...(starsOf(it) > 1 ? { stars: starsOf(it) } : {}) });
      const rel = relOf(after, base, run.day);
      if (rel > 0 && (!best || rel > best.rel)) best = { uid: it.uid, rel };
    }
    if (best) refitTo(run, { uid: best.uid, turret: slot, core: false });
  }
}

/** E8, the casual rule at the dawn: each affordable ENCHANTER offer is bought with chance pol.wordBuy, on a seeded legal piece with no word
 *  (enchantBot.ts casualWordBuys, its own seeded stream). The gold joins the day's cost (spent.word). */
function casualWords(run: Run, pol: PolicyKnobs, spent: { word?: number }, rolls: number, buys: PlayerBuy[]): void {
  for (const w of casualWordBuys(run, pol.wordBuy!, new Rng(hashSeed("casual-ench", run.hero, run.seed, run.day)))) {
    spent.word = (spent.word ?? 0) + w.price;
    buys.push({ day: run.day, roll: rolls, def: `ench:${w.word}`, price: w.price, stars: 1, merged: false, why: "word", word: { id: w.word, on: w.on, slot: w.target.kind === "turret" ? w.target.slot : w.target.uid, value: 0 } });
  }
}

/**
 * SCALE-2d (REQ-BFG-098 098.6; BRIEF-SCALE2d D2): the bots' feeder+reader rule, SCALE_RIGS on only (candidates). A reader
 * that wants a feeder (scaleRating.ts READER_FEEDERS) is bought only when the deck holds one of its feeders, or the same
 * visit buys one first (shopDay judges the offers again after every buy): otherwise its candidates are `banned` (judged
 * with the same draws, never taken). A free part (price 0: a road drop, LAST CHANCE's PART) is no buy, so it is placed as
 * before. A feeder on offer beside an affordable reader the deck can't feed yet is valued as the pair: its gain is the
 * larger of its own and the pair's gain for the feeder's share of the pair's gold (the pick weighs gain for the gold, so
 * the pair's gain per gold becomes the feeder's), the reader placed at its best spot after the feeder (readerBest; a fixed
 * stream, so the policy's draws are untouched here).
 */
function readerRule(run: Run, out: Cand[], base: number, pol: PolicyKnobs): void {
  const b = run.build, day = run.day;
  const unfed = new Map<string, number>(); // reader -> its cheapest affordable price on offer
  for (const w of run.shop.wagons) for (const o of w.offers) {
    if (o.sold || o.price <= 0 || o.price > run.gold || !ITEMS[o.def] || !needsFeeder(o.def) || hasFeeder(b, o.def)) continue;
    unfed.set(o.def, Math.min(unfed.get(o.def) ?? Infinity, o.price));
  }
  if (!unfed.size) return;
  for (const c of out) if (c.price > 0 && c.wagon >= 0 && unfed.has(c.def)) c.banned = true;
  for (const c of out) {
    if (c.banned || c.merge || c.price <= 0 || c.wagon < 0 || c.turret || c.swap !== undefined || c.grown) continue;
    for (const [r, rp] of unfed) {
      if (!READER_FEEDERS[r].includes(c.def) || c.price + rp > run.gold) continue;
      const after = afterCand(run, c);
      const rel = after ? readerBest(after, r, run.nextUid + 1, base, day, pol) : null;
      if (rel === null) continue;
      const share = (rel * c.price) / (c.price + rp);
      if (share > c.rel) { c.rel = share; c.pair = r; }
    }
  }
}

/** SCALE-2d: the deck after candidate `c` (a rig at its spot, gear or a core on its turret, a factory with its belts), as
 *  buy() lays it, for readerRule's pair; null for anything else. */
function afterCand(run: Run, c: Cand): Build | null {
  const after = cloneBuild(run.build), d = ITEMS[c.def], at = c.at;
  if (!at) return null;
  if (d.kind === "gate" && "x" in at) { placeRigAt(after, run.nextUid, c.def, { x: at.x, y: at.y, rot: at.rot ?? 0 }); return after; }
  if ((d.kind === "mod" || d.kind === "core") && "turret" in at) { after.mods.push({ uid: run.nextUid, def: c.def, turret: at.turret }); return after; }
  if (d.kind === "factory" && "x" in at && c.routes) {
    after.items.push({ uid: run.nextUid, def: c.def, x: at.x, y: at.y, ...rotField(c.def, at.rot ?? 0) });
    for (const l of c.routes) commitRoute(after, run.nextUid, l.cells, -1, l.join);
    return after;
  }
  return null;
}

/** SCALE-2d: the best gain (relOf against `base`) of reader `def` placed on `after` (a rig at its best H2 spot, gear or a
 *  core on the best free hardpoint), or null when it fits nowhere. */
function readerBest(after: Build, def: string, uid: number, base: number, day: number, pol: PolicyKnobs): number | null {
  const d = ITEMS[def];
  let best: number | null = null;
  const take = (b2: Build): void => { const r = relOf(b2, base, day); if (best === null || r > best) best = r; };
  if (d.kind === "gate") {
    const s = new Shopper(after, maxGoldByDay(day), day, new Rng(hashSeed("scale2d-pair", def, day)), "on", FUSE_MAX, "on", "on");
    s.uid = uid;
    for (const sp of !isShaped(d) || fitsSomewhere(after, def) ? rigSpots(s, def, undefined, pol.aim, pol.aimTop) : []) {
      const b2 = cloneBuild(after);
      placeRigAt(b2, uid, def, sp);
      take(b2);
    }
  } else if (d.kind === "mod" || d.kind === "core") {
    for (const v of installedTurrets(after)) {
      if (d.kind === "mod" ? !canFitGear(after, v.slot, def).ok : !!coreFor(after, v.slot)) continue;
      const b2 = cloneBuild(after);
      b2.mods.push({ uid, def, turret: v.slot });
      take(b2);
    }
  }
  return best;
}

/** SCALE-2d (REQ-BFG-098, REQ-BFG-106; BRIEF-SCALE2d D2): the hearts each side has lost coming into a run's fight, as the
 *  live battle screen passes them since SCALE-2a (screens/battle.ts heartsLost(run.lives, run)): the run's own, and 0 for
 *  a warlord (no run). Only while SCALE_RIGS is on; off undefined, so the fight is called exactly as before. */
export function runLost(run: { lives: number; hearts?: boolean }): readonly [number, number] | undefined {
  return scaleRules() ? [heartsLost(run.lives, run), 0] : undefined;
}

/**
 * bb-0.8.6 (REQ-BFG-051 P6): the caravan's two fixed packs as candidates (belts.ts packPolicy, every policy but "never"):
 * each pack the purse affords, judged as any offer is, by the rating's gain (relOf) for its gold: an ARMOR PACK with its
 * +25 hull; a BELT PACK with its +4 belt, and with the belt it lengthens best when that rates better (growBelt, the crate
 * rule, on a fixed seed: judging draws on no stream, so the policies' streams stay paired). Outside the shop: no wagon
 * (-2), nothing the shop shows; repeatable, so the next dawn step judges them again. pol.forbid may name "pack:belt" /
 * "pack:armor" (judged, never taken).
 */
function packCands(run: Run, base: number, banned: ReadonlySet<string>): Cand[] {
  if (packPolicy(run.build.hero) === "never") return [];
  const out: Cand[] = [];
  PACK_IDS.forEach((id, i) => {
    const price = packPrice(id), d = ITEMS[PACK_ITEM[id]];
    if (price > run.gold) return;
    const after = cloneBuild(run.build);
    if (d.supply?.hull) after.hullBonus += d.supply.hull;
    if (d.supply?.belt) after.beltCap += d.supply.belt;
    let c: Cand = { wagon: -2, slot: i, def: d.id, price, kind: id === "armor" ? "plating" : "crate", merge: false, rel: relOf(after, base, run.day), pack: id };
    if (d.supply?.belt) {
      const g = growBelt(after, run.day, new Rng(hashSeed(run.day, "pack-belt")), base);
      if (g && g.rel > c.rel) c = { ...c, rel: g.rel, grown: { build: g.build, tiles: g.tiles } };
    }
    if (banned.has(`pack:${id}`)) c.forbid = true; // FIX-ABE E: TUNE-M's own mark
    out.push(c);
  });
  return out;
}

/** bb-0.8.6 (REQ-BFG-051 P6): buy pack candidate `c` (run.ts buyPack), then lay the belt it was judged with (a BELT PACK's
 *  grown belt: the game's free redraw). */
function buyPackCand(run: Run, c: Cand, why: PlayerBuy["why"], rolls: number, buys: PlayerBuy[]): void {
  const r = buyPack(run, c.pack!);
  if (!r.ok) throw new Error(`par player: buyPack ${c.pack} failed: ${r.reason}`);
  if (c.grown) {
    run.build.items = cloneBuild(c.grown.build).items;
    run.build.routes = cloneBuild(c.grown.build).routes;
  }
  buys.push({ day: run.day, roll: rolls, def: c.def, price: c.price, stars: 1, merged: false, why, ...(c.grown ? { grew: c.grown.tiles } : {}) });
}

/** bb-0.8.6 (REQ-BFG-051 P6, M3): ARMOR-greedy / BELT-greedy's end of the day: every coin left goes to that pack (a BELT
 *  PACK laid into the belt it lengthens best, when that helps). */
function greedyPacks(run: Run, id: PackId, rolls: number, buys: PlayerBuy[]): void {
  for (let guard = 0; guard < 200 && run.gold >= packPrice(id); guard++) {
    const c = packCands(run, rateOn(run.build, run.day), new Set()).find((x) => x.pack === id);
    if (!c) return;
    buyPackCand(run, c, "greedy", rolls, buys);
  }
}

/**
 * bb-0.8.3 (REQ-BFG-043 D7'): the hero's two gold upgrades as candidates under the "value" policy (belts.ts
 * UPGRADE_POLICY): the next level of each track the purse affords and the game shows (run.ts upgradeShown), judged as any
 * offer is, by the rating's gain (relOf) for its gold. The FACTORY level's new belt slot is judged with the best belt
 * the bot would lay into it (moreSlotRel), so the level is worth its slot and its faster cycle. Outside the shop: no
 * wagon (-1), no random stream (moreSlotRel reads a fixed walk), nothing the shop shows. pol.forbid may name
 * "upgrade:turret" / "upgrade:factory" (judged, never taken).
 */
function upgradeCands(run: Run, base: number, banned: ReadonlySet<string>): Cand[] {
  if (upgradePolicy(run.build.hero) !== "value") return [];
  const out: Cand[] = [];
  const keep = syncKeeper(run.build); // bb-0.8.6 (PACKS): FOUNDRY's sync guard, as on every other candidate (0.8.0 B1 M1)
  UPGRADE_TRACKS.forEach((track, i) => {
    const n = nextUpgrade(run, track);
    if (n.next === undefined || n.price === undefined || n.price > run.gold || !upgradeShown(run, track)) return;
    const after = cloneBuild(run.build);
    after.upgrades = { ...after.upgrades, [track]: n.next };
    // a FACTORY level changes the CRUCIBLE's cycle: a pair whose belts grew apart (a BELT PACK lengthens one belt where
    // the gun stays in sync at today's cycle) may fall out of sync at the next level; no such level is a candidate
    if (keep && !keep(after)) return;
    const rel = Math.max(relOf(after, base, run.day), track === "factory" ? moreSlotRel(after, run.day, base) : -Infinity);
    out.push({ wagon: -1, slot: i, def: `upgrade:${track}`, price: n.price, kind: "upgrade", merge: false, rel, track, ...(banned.has(`upgrade:${track}`) ? { forbid: true } : {}) });
  });
  return out;
}

/** bb-0.8.3 (D7'): the rating gain of `after` with the best belt the bots would lay into its free slots (moreBelt on a
 *  fixed seed, so judging never draws on the player's own stream); -Infinity when none fits. */
function moreSlotRel(after: Build, day: number, base: number): number {
  const mb = moreBelt(after, day, new Rng(hashSeed(day, "upgrade-belt")), base, syncKeeper(after));
  return mb ? mb.rel : -Infinity;
}

/**
 * bb-0.8.3 (D7'), the "greedy" policy (M2''s comparison): the next level of the cheaper track (a tie: FACTORY) whenever
 * the purse affords it, before any shop card, until neither does.
 */
function greedyUpgrades(run: Run, rolls: number, buys: PlayerBuy[]): void {
  for (let guard = 0; guard < 6; guard++) {
    const next = UPGRADE_TRACKS.map((track) => ({ track, n: nextUpgrade(run, track) }))
      .filter((x) => x.n.price !== undefined && x.n.price <= run.gold && upgradeShown(run, x.track))
      .sort((a, b) => a.n.price! - b.n.price! || (a.track === "factory" ? -1 : 1));
    if (!next.length) return;
    const t = next[0];
    buyUpgradeCand(run, { wagon: -1, slot: UPGRADE_TRACKS.indexOf(t.track), def: `upgrade:${t.track}`, price: t.n.price!, kind: "upgrade", merge: false, rel: 0, track: t.track }, "best", rolls, buys);
  }
}

/** bb-0.8.3 (D7'): buy upgrade candidate `c` (run.ts buyUpgrade), then lay the bots' best belt into a FACTORY level's
 *  new slot when that rates better (as the dawn's moreBelt would). */
function buyUpgradeCand(run: Run, c: Cand, why: PlayerBuy["why"], rolls: number, buys: PlayerBuy[]): void {
  const r = buyUpgrade(run, c.track!);
  if (!r.ok) throw new Error(`par player: buyUpgrade ${c.track} failed: ${r.reason}`);
  buys.push({ day: run.day, roll: rolls, def: c.def, price: c.price, stars: r.level, merged: false, why });
  if (c.track !== "factory") return;
  const mb = moreBelt(run.build, run.day, new Rng(hashSeed(run.day, "upgrade-belt")), rateOn(run.build, run.day), syncKeeper(run.build));
  if (mb && mb.rel > 0) {
    run.build.items = mb.build.items;
    run.build.routes = mb.build.routes;
  }
}

/** The most gold a set of distinct offers (one per def) costing at most `cap` can spend. */
function bestSpend(prices: number[], cap: number): number {
  const top = Math.min(cap, 30);
  let reach = 1; // bit g: g gold can be spent exactly
  for (const p of prices) reach |= (reach << p) & ((2 << top) - 1);
  let g = top;
  while (g > 0 && !(reach & (1 << g))) g--;
  return g;
}

/**
 * The pick: a merge first (the one judged best for the gold), else a part that helps: a whim (any helpful offer) with
 * chance `whim`, else the one judged best for the gold (each gain misjudged by a factor 1 +- noise). Either way the
 * player counts its coins: it prefers a part after which the change can still be spent on the other offers that do
 * no harm (a subset-sum over them), down to `keep` gold (the reserve, or less when the floor needs it). null:
 * nothing helps.
 *
 * FIX-ABE E (cap's ruling 207816b18a9fbfdb): TUNE-M's forbidden parts (pol.forbid, Cand.forbid) are refused only at the
 * moment one would be taken. The pick is made as the player without the knob makes it (a forbidden part is judged, is
 * spendable change for the other offers, and fills every step as any offer does); only when that pick is a forbidden
 * part does the player refuse it and pick again without the forbidden parts. So a run with a forbidden part stays aligned
 * with the run without one until that run would first take the part (was: forbidden parts were dropped from the
 * spendable change, so the run could drift before it, e.g. FURNACE, TEMPER forbidden, seed 6, day 9). With nothing
 * forbidden no candidate carries the mark, and this is exactly the pick as before.
 */
function pickOffer(cands: Cand[], gold: number, keep: number, pol: PolicyKnobs, rng: Rng, short = false): { c: Cand; why: PlayerBuy["why"] } | null {
  const p = pickAs(cands, gold, keep, pol, rng, short);
  return p && p.c.forbid ? pickAs(cands.filter((c) => !c.forbid), gold, keep, pol, rng, short) : p;
}

/** pickOffer's pick among `cands` (the sustain rule's `banned` candidates judged, never taken; Cand.forbid unread). */
function pickAs(cands: Cand[], gold: number, keep: number, pol: PolicyKnobs, rng: Rng, short: boolean): { c: Cand; why: PlayerBuy["why"] } | null {
  const judge = (c: Cand) => (c.rel * (pol.noise ? 1 + pol.noise * (2 * rng.next() - 1) : 1)) / c.price;
  // TUNE-M (T1): a banned candidate is judged like any other (the same RNG draws as a player without the mark) but never
  // becomes the top; with no banned candidate this is the pick as before (FIX-ABE E: the sustain rule's mark alone)
  const best = (xs: Cand[]) => {
    let top: Cand | null = null, v = -Infinity;
    for (const x of xs) {
      const j = judge(x);
      if (!x.banned && j > v) { v = j; top = x; }
    }
    return top;
  };
  const merges = cands.filter((c) => c.merge && c.rel >= pol.mergeFloor);
  if (merges.length) {
    const m = best(merges);
    if (m) return { c: m, why: "merge" };
  }
  // an upgrade (a swap) is a late sink: only when nothing else helps, and only for a clear gain
  const plain = cands.filter((c) => !c.merge && !sinks(c) && c.rel > pol.minRel);
  const help = allowed(plain).length ? plain : cands.filter((c) => sinks(c) && c.rel >= pol.upgradeGain);
  if (!allowed(help).length) return null;
  // the change must stay spendable: on offers that do no harm, or, while the deck is short of the floor, on any
  // offer the fill would take (pol.fillFloor); then such an offer may itself be the pick that keeps the floor reachable
  const ok = (c: Cand) => !sinks(c) && c.rel >= (short ? pol.fillFloor : -pol.harmless) && !c.banned;
  const harmless = cands.filter(ok);
  const keepsOf = (xs: Cand[], spendable: Cand[]) => xs.filter((c) => {
    const left = gold - c.price;
    if (left <= keep) return true;
    const seen = new Set<string>([c.def]), prices: number[] = [];
    // an offer of the kind that takes the same turret slot (gear, a core, a turret) or intake (a factory) may not fit after c
    const rival = (o: Cand) => !o.merge && !c.merge && o.kind === c.kind && (c.kind === "gear" || c.kind === "core" || c.kind === "factory" || c.kind === "turret");
    for (const o of spendable) if (!seen.has(o.def) && !rival(o)) { seen.add(o.def); prices.push(o.price); }
    return left - bestSpend(prices, left) <= keep;
  });
  const any = cands.filter((c) => !c.merge && c.kind !== "crate");
  // TUNE-M (T1): a random pick that lands on a banned candidate picks again among the allowed ones
  const pickAllowed = (xs: Cand[]) => { const c = rng.pick(xs); return c.banned ? rng.pick(allowed(xs)) : c; };
  if (pol.impulse > 0 && allowed(any).length && rng.next() < pol.impulse) {
    const ok = keepsOf(any, any);
    return { c: pickAllowed(allowed(ok).length ? ok : any), why: "impulse" };
  }
  const keeps = keepsOf(short ? [...help, ...harmless.filter((c) => !c.merge && !help.includes(c))] : help, harmless);
  const keepsHelp = keeps.filter((c) => help.includes(c));
  const poolOf = (kh: Cand[], ks: Cand[], hp: Cand[]) => (kh.length ? kh : ks.length ? ks : hp);
  let pool = poolOf(keepsHelp, keeps, help);
  if (!allowed(pool).length) pool = poolOf(allowed(keepsHelp), allowed(keeps), allowed(help)); // TUNE-M: only banned ones
  if (pol.whim > 0 && rng.next() < pol.whim) return { c: pickAllowed(pool), why: "whim" };
  return { c: best(pool)!, why: "best" };
}

/** CAND-A: buy turret offer `c` and replay its plan on the run with the same actions: buyOffer (the copy into cargo),
 *  installFromCargo (a swap sends the old turret and gear it can't hold to cargo), the displaced turret into the empty
 *  slot, the plan's belts (the free redraw), gear and cores refitted, the rest sold. Returns the gold the sale lost. */
function buyTurret(run: Run, c: Cand): number {
  const p = c.turret!;
  const res = buyOffer(run, c.wagon, c.slot, undefined, wordPick(run)); // ENCHANT-1 (E4/E8): the bots' word pick on a merge (undefined off)
  if (!res.ok || !res.gain || res.gain.where !== "cargo" || res.gain.survivor !== p.copy) throw new Error(`par player: buyOffer ${c.def} did not land in cargo as planned`);
  const r = installFromCargo(run, p.copy, p.slot);
  if (!r.ok) throw new Error(`par player: installFromCargo ${c.def} -> slot ${p.slot}: ${r.reason}`);
  if (p.moved !== undefined) {
    const d = r.turrets[0];
    if (!d || !installFromCargo(run, d.uid, p.moved).ok) throw new Error(`par player: the displaced turret did not go into slot ${p.moved}`);
  }
  run.build.items = cloneBuild(p.build).items; // the plan's belts and the riders put back beside them (a free redraw)
  run.build.routes = cloneBuild(p.build).routes;
  for (const f of p.refit) if (!refitTo(run, f)) throw new Error(`par player: refit ${f.uid} -> turret ${f.turret} failed`);
  let lost = 0;
  for (const uid of p.sell) {
    const it = run.inventory.find((i) => i.uid === uid);
    if (!it) throw new Error(`par player: part ${uid} to sell is not in cargo`);
    lost += cargoValue(it) - sellInventory(run, uid);
  }
  if (!same(run.build, p.build)) throw new Error(`par player: the ${c.def} plan and its replay differ`);
  return lost;
}

/** Buy `c` through the game's buyOffer at its spot; a new factory then gets its belts (commitRoute, joins included), a
 *  crate lengthens its belt, an upgrade's old part goes to cargo first (the game's storeMod; a bought core is swapped
 *  out by gainModule) and is sold (sellInventory: half its value back), a turret replays its plan (buyTurret).
 *  Returns the gold the sale lost (value minus refund). */
function buy(run: Run, c: Cand, why: PlayerBuy["why"], rolls: number, buys: PlayerBuy[], trace?: PlayerOpts["trace"]): number {
  if (c.track) { buyUpgradeCand(run, c, why, rolls, buys); return 0; } // bb-0.8.3 (D7'): no offer, no trace, no refund
  if (c.pack) { buyPackCand(run, c, why, rolls, buys); return 0; } // bb-0.8.6 (REQ-BFG-051 P6): a fixed pack, no offer
  if (c.plan) { buyWordCand(run, c, why, rolls, buys); return 0; } // ENCHANT-1 (REQ-BFG-085, E8): an ENCHANTER word: buyEnchant, no refund
  trace?.(run, c.wagon, c.slot);
  if (c.turret) {
    const lost = buyTurret(run, c);
    const t = turretSlots(run.build)[c.turret.slot]?.turret;
    buys.push({ day: run.day, roll: rolls, def: c.def, price: c.price, stars: t ? starsOf(t) : 1, merged: false, why, slot: c.turret.slot, into: c.turret.into, ...(c.turret.replaced ? { replaced: c.turret.replaced } : {}) });
    return lost;
  }
  const oldMod = c.swap !== undefined ? run.build.mods.find((m) => m.uid === c.swap) : undefined;
  const oldRig = c.swap !== undefined && !oldMod ? run.build.items.find((p) => p.uid === c.swap) : undefined;
  const old = oldMod ?? oldRig;
  if (oldMod && ITEMS[oldMod.def].kind === "mod") storeMod(run, oldMod.uid);
  if (oldRig && !storePlaced(run, oldRig.uid)) throw new Error(`par player: the replaced ${oldRig.def} could not go to cargo`);
  const res = buyOffer(run, c.wagon, c.slot, c.at, wordPick(run)); // ENCHANT-1 (E4/E8): the bots' word pick on a merge (undefined off)
  if (!res.ok) throw new Error(`par player: buyOffer ${c.def} failed: ${res.reason}`);
  let lost = 0;
  if (old) {
    const refund = sellInventory(run, old.uid);
    if (!refund) throw new Error(`par player: the replaced ${old.def} is not in cargo`);
    lost = valueOf(old.def, starsOf(old)) - refund;
  }
  let joins = 0;
  if (c.routes && res.gain && res.gain.where === "deck" && !res.gain.steps.length) {
    for (const l of c.routes) {
      commitRoute(run.build, res.gain.survivor, l.cells, -1, l.join);
      if (l.join !== undefined) joins++;
    }
  }
  if (c.grown) {
    // the redraw is free in the game: the same items (rigs moved beside the new belt) and routes, nothing bought
    run.build.items = cloneBuild(c.grown.build).items;
    run.build.routes = cloneBuild(c.grown.build).routes;
  }
  buys.push({ day: run.day, roll: rolls, def: c.def, price: c.price, stars: res.gain?.stars ?? 1, merged: !!res.gain?.steps.length, why, ...(c.grown ? { grew: c.grown.tiles } : {}), ...(old ? { replaced: old.def } : {}), ...(joins ? { joins } : {}) });
  return lost;
}

/**
 * FURNACE, day 1: redraw the starting kiln belt as a belt of `tiles` tiles (within the starting belt capacity) into
 * either intake (randomPath from the policy RNG): the first such belt the player manages to draw.
 */
function drawKilnBelt(run: Run, rng: Rng, tiles: number): void {
  const b = run.build;
  const kiln = b.items.find((p) => p.def === HEROES.furnace.factory);
  const ri = kiln ? b.routes.findIndex((r) => r.factory === kiln.uid) : -1;
  if (b.hero !== "furnace" || !kiln || ri < 0 || b.routes[ri].cells.length >= tiles) return;
  const target = Math.min(tiles, b.beltCap - (b.routes.reduce((s, r) => s + r.cells.length, 0) - b.routes[ri].cells.length));
  const bl = blockedCells(b, ri), starts = startCellsFor(cellsOf(kiln), bl);
  const cols = HEROES.furnace.turrets[0].connectors;
  for (let t = 0; t < 24; t++) {
    const cells = randomPath(bl, starts, cols[rng.int(cols.length)], target, rng);
    if (cells) {
      b.routes[ri] = { factory: kiln.uid, cells };
      return;
    }
  }
}

/** The fill: harmless offers (else the least harmful down to pol.fillFloor), supplies first, then the best rating,
 *  then the dearer (it fills more of the purse). */
function fillPick(cands: Cand[], pol: PolicyKnobs): Cand | null {
  // CAND-A: nobody swaps or adds a gun to fill the purse. FIX-ABE E: a forbidden part out changes the fill only when it
  // would have been the fill (the order below is fixed), so it is refused only at the moment it would be taken
  cands = cands.filter((c) => c.kind !== "turret" && c.kind !== "word" && !c.banned && !c.forbid); // ENCHANT-1: nobody buys a word to fill the purse
  let ok = cands.filter((c) => c.rel >= -pol.harmless);
  if (!ok.length) ok = cands.filter((c) => c.rel >= pol.fillFloor);
  const supply = (c: Cand) => (c.kind === "plating" || c.kind === "crate" ? 0 : 1);
  ok.sort((a, b) => supply(a) - supply(b) || b.rel - a.rel || b.price - a.price || a.wagon - b.wagon || a.slot - b.slot);
  return ok[0] ?? null;
}

/** The share of the day's gold the player aims its deck at, in whole gold. */
export const floorGold = (day: number, floor: number): number => Math.ceil(floor * maxGoldByDay(day));

/**
 * CAND-A, each dawn before shopping (free actions): a turret in cargo goes back into an empty slot with a belt to feed
 * it (pol.extra), and a belt is redrawn into a join (pol.join), each when it rates better: by minRel for the sharp
 * player (it re-draws belts anyway), by upgradeGain for the typical one (a clear gain it notices on the build screen).
 */
function dawnEdits(run: Run, pol: PolicyKnobs, rng: Rng): void {
  const need = pol.grow ? pol.minRel : pol.upgradeGain;
  if (pol.extra && pol.turret) {
    const r = reinstallCand(run, rng, rateOn(run.build, run.day), syncKeeper(run.build)); // 0.8.0 B1 M1: the sync guard
    if (r && r.rel > need) {
      if (!installFromCargo(run, r.uid, r.slot).ok) throw new Error(`par player: reinstall ${r.uid} -> slot ${r.slot} failed`);
      run.build.items = cloneBuild(r.build).items;
      run.build.routes = cloneBuild(r.build).routes;
      if (!same(run.build, r.build)) throw new Error("par player: the reinstall plan and its replay differ");
    }
  }
  if (pol.join) {
    const j = rejoin(run.build, run.day, rng, rateOn(run.build, run.day), syncKeeper(run.build)); // 0.8.0 B1 M1: the sync guard
    if (j && j.rel > need) {
      run.build.items = j.build.items;
      run.build.routes = j.build.routes;
    }
  }
  // bb-0.8.3 (REQ-BFG-042 D7): a factory with a free slot gets another belt when that rates better (up to 3 a dawn; none
  // under "today", whose decks stay 0.8.1's)
  for (let n = 0; n < 3; n++) {
    const mb = moreBelt(run.build, run.day, rng, rateOn(run.build, run.day), syncKeeper(run.build));
    if (!mb || mb.rel <= need) break;
    run.build.items = mb.build.items;
    run.build.routes = mb.build.routes;
  }
}

/**
 * One dawn: merges and helpful parts while any is affordable. When none is: a reroll, if today's count and the run's
 * reroll share allow it, a part of the cheapest price stays affordable after it, and the deck can still reach the
 * floor; else the purse is filled to `floor` of the day's gold with harmless offers (supplies first, each at its
 * best spot). Gold above `reserve` then goes into belt crates when the caravan sells them.
 */
function shopDay(run: Run, pol: PolicyKnobs, maxStars: number, rng: Rng, spent: { reroll: number; sold: number; word?: number }, opts: PlayerOpts): { buys: PlayerBuy[]; rolls: number } {
  const budget = maxGoldByDay(run.day), target = floorGold(run.day, pol.floor);
  const buys: PlayerBuy[] = [];
  let rolls = 0, roomy = false;
  dawnEdits(run, pol, rng);
  if (upgradePolicy(run.build.hero) === "greedy") greedyUpgrades(run, rolls, buys); // bb-0.8.3 (D7'): M2''s comparison
  if (enchantRules() && pol.wordBuy !== undefined) casualWords(run, pol, spent, rolls, buys); // ENCHANT-1 (E8): a casual buyer's words, before the shop (its own seeded stream)
  for (let guard = 0; guard < 80; guard++) {
    if (pol.grow && beltFree(run.build) > 0) {
      // free belt capacity: the player lengthens the belt that rates best with it (a free redraw in the game)
      const g = growBelt(run.build, run.day, rng, rateOn(run.build, run.day));
      if (g && g.rel > pol.minRel) {
        run.build.items = g.build.items;
        run.build.routes = g.build.routes;
      }
    }
    const cands = candidates(run, maxStars, rng, pol);
    const value = buildCost(run.build).total + (enchantRules() ? spent.word ?? 0 : 0); // ENCHANT-1 (E6.4): the ENCHANTER's gold is part of the deck's cost
    const keep = Math.min(pol.reserve, Math.max(0, value + run.gold - target));
    const p = pickOffer(cands, run.gold, keep, pol, rng, value < target);
    opts.onDecide?.(run, cands.map((c) => ({ def: c.def, price: c.price, kind: c.kind, merge: c.merge, rel: c.rel, ...(c.turret ? { plan: `${c.turret.into} ${c.turret.slot}${c.turret.moved !== undefined ? ` moved ${c.turret.moved}` : ""}` } : {}) })), p ? p.c.def : null);
    if (p) {
      spent.sold += buy(run, p.c, p.why, rolls, buys, opts.trace);
      if (p.c.plan) spent.word = (spent.word ?? 0) + p.c.price; // ENCHANT-1 (E8): a word bought: its gold joins the day's cost
      continue;
    }
    if (!roomy && pol.room && run.gold >= 3 && beltFree(run.build) > 0 && !new Shopper(run.build, budget, run.day, rng, "on", maxStars, "on", "on").hasRigTile()) {
      // out of room with gold to spend: the player lengthens a belt into its free capacity (a free redraw in the
      // game), the one that rates best, so rigs fit again; at most once a day, and never for a worse deck
      roomy = true;
      const g = growBelt(run.build, run.day, rng, rateOn(run.build, run.day));
      if (g && g.rel >= -pol.harmless) {
        run.build.items = g.build.items;
        run.build.routes = g.build.routes;
        continue;
      }
    }
    // SHAPES-1 (REQ-BFG-086 S7.3; PIECES-1 5.3): the room knob's one more trigger, "the piece on offer fits nowhere useful":
    // an affordable shaped piece the deck can't hold (fitsSomewhere) makes the player lengthen its best belt once (the same
    // once a day) and look again; if it still fits nowhere it stays in the caravan. Off: never (shapesRules first)
    if (!roomy && pol.room && shapesRules() && beltFree(run.build) > 0
      && run.shop.wagons.some((w) => w.offers.some((o) => !o.sold && o.price <= run.gold && !!ITEMS[o.def] && isShaped(ITEMS[o.def]) && !fitsSomewhere(run.build, o.def)))) {
      roomy = true;
      const g = growBelt(run.build, run.day, rng, rateOn(run.build, run.day));
      if (g && g.rel >= -pol.harmless) {
        run.build.items = g.build.items;
        run.build.routes = g.build.routes;
        continue;
      }
    }
    const allowed = rolls < pol.rerolls && run.gold >= REROLL_COST + 3
      && spent.reroll + REROLL_COST <= pol.rerollShare * budget
      && value + run.gold - REROLL_COST >= target;
    if (allowed) {
      opts.onReroll?.(run);
      if (!reroll(run)) break;
      rolls++;
      spent.reroll += REROLL_COST;
      continue;
    }
    if (value < target) {
      const f = fillPick(pol.place === "best" ? cands : candidates(run, maxStars, rng, { ...pol, place: "best" }), pol);
      if (f) {
        spent.sold += buy(run, f, f.kind === "crate" ? "crate" : "fill", rolls, buys, opts.trace);
        continue;
      }
      // short of the floor with nothing on offer that fills it: the gold would sit idle, so the player rerolls
      // (a few more times a day) while a 3 g part stays affordable after the reroll and the gold the run has
      // not put on the deck (rerolls, sale losses) stays within 1 - floor of the day's gold
      if (rolls < pol.rerolls + pol.stuck && run.gold >= REROLL_COST + 3 && spent.reroll + spent.sold + REROLL_COST <= (1 - pol.floor) * budget) {
        opts.onReroll?.(run);
        if (!reroll(run)) break;
        rolls++;
        spent.reroll += REROLL_COST;
        continue;
      }
    }
    break;
  }
  // bb-0.8.6 (REQ-BFG-051 P6): the gold above the reserve went into the belt crates the caravan's roll offered (each
  // offer once). Those crates are the fixed BELT PACK now, bought again and again, so the leftover goes into a pack only
  // when one helps (rel > minRel: better than keeping the gold), the better gain for its gold first.
  const pp = packPolicy(run.build.hero);
  for (let guard = 0; pp !== "never" && guard < 20 && run.gold > pol.reserve; guard++) {
    // FIX-ABE E: a forbidden pack out changes the pick only when it would have been the pick (the order is fixed)
    const cands = packCands(run, rateOn(run.build, run.day), forbidden(pol)).filter((c) => !c.banned && !c.forbid && c.rel > pol.minRel);
    const pack = cands.sort((a, b) => b.rel / b.price - a.rel / a.price || a.price - b.price)[0];
    if (!pack) break;
    buyPackCand(run, pack, "crate", rolls, buys);
  }
  if (pp === "armor" || pp === "belt") greedyPacks(run, pp, rolls, buys); // M3: ARMOR-greedy / BELT-greedy
  return { buys, rolls };
}

/**
 * RUNES-2a (REQ-BFG-058, R1b-2 1.6): the dawn's rune, before the shop: runes.ts botTakeRune on the run's own seed (the
 * offer the game shows this run), with run.ts takeRune's effects (the rune's HULL or BELT on the deck, its dawn gold in
 * the purse, no pick pending). finishDay's runeDawn pays the held dawn-gold runes at every later dawn.
 */
function dawnRune(run: Run): void {
  // LC-1: a LAST CHANCE rune is held but no dawn's pick (lcRunes: 0 for every run without one)
  // OPEN-1 (REQ-BFG-109): the bots follow the switch (the game's own offer rule)
  const got = botTakeRune(run.build, run.seed, run.day, run.hero, true, run.history[run.history.length - 1]?.outcome === "win", lcRunes(run), openRunesRules());
  if (!got) return;
  run.gold += got.gold;
  delete run.runeDay;
}

const CACHE = new Map<string, PlayerDay[]>();
export const PLAYER_DAYS = 10;
/** RUN-1 (REQ-BFG-059, D5): the par player's depth on a long run, 16 (longRun.ts LONG_RUN_GEN_DAYS): playerRun asked for
 *  more than PLAYER_DAYS days plays at least this many (one cached run serves days 11-16), and playerBuild reads this deep
 *  while the long run is in the game. */
export const PLAYER_DAYS_LONG = LONG_RUN_GEN_DAYS;

/**
 * The par player's run for (hero, seed): one PlayerDay per day 1..days (at most 10; RUN-1: more when asked, at least
 * PLAYER_DAYS_LONG then). Deterministic: the same arguments give the same decks, and days 1..d of a longer run are exactly
 * the run to day d (the policy never looks ahead).
 */
export function playerRun(hero: HeroId, days: number, seed: number, opts: PlayerOpts = {}): PlayerDay[] {
  const policy = opts.policy ?? "typical", maxStars = opts.maxStars ?? FUSE_MAX;
  const pol = knobsOf(policy, opts.tune);
  const traced = !!(opts.trace || opts.onReroll || opts.onDecide);
  const runes = opts.botRunes ?? BOT_RUNES; // RUNES-2a: THE switch (off: the cache key and the run exactly as before)
  // BOTS-X: the sustain switch too (on: another run; off: the key exactly as before)
  const lc = opts.lastChance; // LC-1 (REQ-BFG-073): absent, the key exactly as before
  // HULL-1c (REQ-BFG-079): the switches that move the par decks (HULL_SCALE's economy, LADDER_FIX's walk) are in the key,
  // so a run made with a switch off is never reused with it on; off, the key exactly as before
  // PAR-AZ (REQ-BFG-078): NPC_DAY moves every par run now (parNpcDay), so it is in the key; off, the key exactly as before
  // PLAIN-1 (REQ-BFG-084): so does PLAIN_RIGS (the six join the shop's pool); off, the key exactly as before
  const nd = npcDayRules();
  // RETUNE-1 (REQ-BFG-097): GUARD moves the par decks (the rating reads PLATE ROLLER's and WARD BELL's numbers); off, the
  // key exactly as before
  // JOINS-1 (REQ-BFG-091): FREE_JOINS moves the par decks (no join pace, no join limit), so it is in the key; off, the key
  // exactly as before
  // RUN-1 (REQ-BFG-059, D5): a long run's bench asks past day 10: the run is played to `depth` days (PLAYER_DAYS, 10, unless
  // more are asked: then at least PLAYER_DAYS_LONG, so days 11-16 share one run), and only a deeper run adds "|d<depth>" to
  // the key, so every 10-day caller is exactly as before (the policy never looks ahead: days 1..10 of a deeper run are the
  // 10-day run). LONG_RUN moves the par decks too (newRun marks the run long: the fork's event bag, the offers past day 10), so
  // it is in the key as well ("|long"); off, the key exactly as before
  // PLAIN-1 (REQ-BFG-084): PLAIN_RIGS moves the par decks (the six in the shop), so "|pr" is appended last; PLAIN-1F (M1):
  // off, the key is c099's byte for byte. SHAPES-2 (REQ-BFG-114): SHAPES2 moves them too ("|s2", after "|pr")
  // GATES-1 (REQ-BFG-052, G6): GATES moves them (the three in the shop; the par player buys and places them), "|gates" last
  const asked =Number.isFinite(days) ? Math.floor(days) : PLAYER_DAYS;
  const depth = asked <= PLAYER_DAYS ? PLAYER_DAYS : Math.max(PLAYER_DAYS_LONG, asked);
  const key = `${hero}|${seed}|${policy}|${maxStars}|${JSON.stringify(opts.tune ?? {})}${depth > PLAYER_DAYS ? `|d${depth}` : ""}${longRunRules() ? "|long" : ""}${runes ? "|runes" : ""}${sustainLive() ? "|sustain" : ""}${lc ? `|lc${lc.day}${lc.boon}${lc.hull ?? ""}` : ""}${hullScaleRules() ? "|hs" : ""}${ladderFixRules() ? "|lf" : ""}${nd ? "|nd" : ""}${guardRules() ? "|guard" : ""}${openRunesRules() ? "|open" : ""}${freeJoinsRules() ? "|fj" : ""}${shapesRules() ? "|sh" : ""}${plainRigsRules() ? "|pr" : ""}${shapes2Rules() ? "|s2" : ""}${scaleRules() ? "|sc" : ""}${gatesRules() ? "|gates" : ""}${enchantRules() ? "|en" : ""}`; // SHAPES-1: "|sh"; PLAIN-1: "|pr"; SHAPES-2: "|s2"; SCALE-2d: "|sc" (last: SCALE_RIGS on moves every par run: the catalogue, the reworks, the rating; off: the key as before) (BUMP-1E: both sides' parts); GATES-1 (REQ-BFG-052, G6): "|gates" (after "|sc"; off: the key as before) (BUMP-1F: both sides' parts, PACKET-BUMP-0130 section 4); ENCHANT-1 (REQ-BFG-085): "|en" (the words move every par run; after "|gates"; off: the key as before) (BUMP-1F: every switch appended in order, PACKET-BUMP-0130 section 4)
  let full = traced ? undefined : CACHE.get(key);
  if (!full) {
    const run = startRun(hero, seed);
    const rng = new Rng(hashSeed("par-player-policy", hero, seed, policy));
    const persona = personaOf(hero, seed, pol);
    const spent: { reroll: number; sold: number; word?: number } = { reroll: 0, sold: 0 };
    full = [];
    if (runes) dawnRune(run); // RUNES-2a: day 1's rune first (the game's picker comes before anything at dawn)
    if (persona.beltTiles > 0) drawKilnBelt(run, rng, persona.beltTiles);
    for (let day = 1; day <= depth; day++) {
      if (day > 1) nextDawn(run);
      if (lc && day === lc.day + 1) lastChanceCard(run, lc.day, lc.boon, pol, lc.hull); // LC-1: before the dawn's rune, as the game
      if (runes && day > 1) dawnRune(run);
      const { buys, rolls } = shopDay(run, pol, maxStars, rng, spent, opts);
      // PAR-AZ (REQ-BFG-078, REQ-BFG-077): with NPC_DAY on, the day's road stop after the shop (its gold is spent at the
      // next dawn), and the road's gold and drops in the day's budget, as validate.ts counts them
      const road = nd ? parNpcDay(run, pol, spent, maxStars) : undefined;
      const budget = maxGoldByDay(day) + runeGrants(run.build.runes, day, lastChanceRuneAt(run.lastChance)).gold;
      const roadGold = road ? run.warlords.reduce((s, w) => s + w.gold, 0) : 0, roadDrops = road ? roadDropValue(roadLog(run.warlords)) : 0;
      full.push({
        day, build: cloneBuild(run.build), value: buildCost(run.build).total, budget: budget + roadGold + roadDrops, gold: run.gold, rerolls: rolls, rerollGold: spent.reroll, soldLoss: spent.sold, buys,
        ...(road ? { road, roadGold, roadDrops, cargo: run.inventory.reduce((s, it) => s + cargoValue(it), 0) } : {}),
        ...(spent.word ? { wordGold: spent.word } : {}), // ENCHANT-1 (E8): the gold spent at the ENCHANTER by this dusk (absent off and with no word bought)
      });
      if (traced && day >= days) break;
    }
    if (!traced) CACHE.set(key, full);
  }
  return full.slice(0, Math.max(0, Math.min(depth, days))).map((d) => ({ ...d, build: cloneBuild(d.build), buys: d.buys.map((x) => ({ ...x })), ...(d.road ? { road: { ...d.road } } : {}) }));
}

/** The par player's deck at dusk of `day` (1-10) for (hero, seed): a fresh copy. RUN-1: with the long run in the game, 1-16
 *  (PLAYER_DAYS_LONG), and a later day is day 16's deck (the day's own hull is M(day), taken in battle). */
export function playerBuild(hero: HeroId, day: number, seed: number, opts: PlayerOpts = {}): Build {
  const d = Math.max(1, Math.min(longRunRules() ? PLAYER_DAYS_LONG : PLAYER_DAYS, Math.floor(day)));
  return playerRun(hero, d, seed, opts)[d - 1].build;
}

// ---------------------------------------------------------------- PAR-AZ (REQ-BFG-078, REQ-BFG-077): the par player's NPC day

/** PAR-AZ: the tier the par player fights every day. The par player is the median player; the tiers are tuned so that
 *  Hard's extra drop worth (1.52-1.59x Medium's on days 3-10) pays for its lower odds, so Medium is a fair pick, and one
 *  tier keeps par stable and readable (cap's ruling Q5 on REVIEW-HULL1D). Never Easy, Hard or the Matriarch: the Medium
 *  slot of every day's fork holds a Medium captain (rivals.ts warlordOffers: its own pool, every day: RUN-1, a long run's too). */
export const PAR_ROAD_TIER = "medium" as const;

/** AZ-BUMP (REQ-BFG-078, REQ-BFG-077; REVIEW-PARAZ N3, BRIEF-AZBUMP S3): the road log of a par-player run (playerRun's days,
 *  NPC_DAY on) by dusk `day`, as the game's road log reads it (npcDay.ts roadLog of run.warlords): one entry a day in day
 *  order, the tier PAR_ROAD_TIER, the outcome and the drop that went to cargo (absent: none; a capped run's declined drop
 *  is none, as finishWarlord logs it); a par run is never sabotaged. [] with NPC_DAY off (no road stop). So roadDropValue
 *  of it is the day's roadDrops, and a deck drawn from the run travels with it (the stand-in pool, the seed pool). */
export function playerRoadLog(days: readonly PlayerDay[], day: number): RoadEntry[] {
  return days.slice(0, Math.max(0, day)).flatMap((d) => (d.road ? [{ day: d.day, tier: PAR_ROAD_TIER, outcome: d.road.outcome, ...(d.road.drop ? { drop: d.road.drop } : {}) }] : []));
}

/**
 * PAR-AZ (REQ-BFG-078, REQ-BFG-077; BRIEF-PARAZ 1 (a); cap's ruling Q5): the par player's road stop, NPC_DAY on, after the
 * dawn's shop, as the game plays it:
 * 1. the fork's Medium warlord: road.ts pickRoad(run, "medium") (warlordFight: forkFor(run).warlords.medium, its deck
 *    warlordDeck(id, day) and its reward warlordReward; run.road and run.warlord set as the game sets them);
 * 2. the battle on the run's warlord seed (warlordSeed) and day, each side's wins carried in as screens/battle.ts passes
 *    them ([run.wins, 0]); simulate() steps it to its end as the battle screen's arena does;
 * 3. finishWarlord: a win pays rewardGold into the purse (the gold arrives after the day's shop, so it is spent at the next
 *    dawn) and rolls the seeded drop (warlordDrop -> rollDrop at DROP_STARS.medium, ★1) into cargo, merged as any copy is;
 *    the road log (run.warlords) gets the game's entry. A loss or a draw pays nothing and costs no life;
 * 4. the REFIT: today's drop, if it sits in cargo (alone, or as the survivor of a merge with a cargo twin), is placed where
 *    the bots put a free part (placeFreePart at its star: a merge, the best spot that rates a gain, the REFIT swap of
 *    34351b5, else back to cargo), on its own stream. A drop that merged into a twin on the deck is placed already.
 *    Nothing else moves at REFIT (earlier cargo stays).
 * No map event and no after-fight event: 0.9.7's par took no road stop, so with the fight in, its gap to a human is one
 * road stop's worth a day (cap's ruling Q5). Mutates `run`; a part the placement sells (a replaced piece of gear or a
 * displaced turret, as a shop buy sells it) adds its loss to `spent.sold`, so the day's gold still adds up.
 * `maxStars` (playerRun's: FUSE_MAX for par, 2 for a stand-in candidate, whose pool stops at 2 stars): a capped run
 * declines a drop that would merge above its cap (fuse.ts mergePreview of the seeded roll), as its shop declines such a
 * buy; the game's gold and road log entry still come from finishWarlord, played with its drop branch off (NPC_DAY off for
 * that one call: its only NPC_DAY reads are the drop and the sabotage flag, and a par run is never sabotaged). Par runs
 * (FUSE_MAX) never decline.
 */
function parNpcDay(run: Run, pol: PolicyKnobs, spent: { reroll: number; sold: number }, maxStars = FUSE_MAX): PlayerRoad {
  const worth = (): number => buildCost(run.build).total + run.gold + run.inventory.reduce((s, it) => s + cargoValue(it), 0);
  const before = worth(), logged = run.warlords.length;
  const pick = pickRoad(run, PAR_ROAD_TIER);
  const w = todaysWarlord(run);
  if (!pick.ok || !w) throw new Error(`par player: no ${PAR_ROAD_TIER} warlord on day ${run.day} (${pick.reason ?? "no fight stored"})`);
  // SCALE-2d (REQ-BFG-098, REQ-BFG-106; D2): with SCALE_RIGS on, the run's hearts lost too (runLost), so a GRUDGE ROD reads
  // the run's real number (its TROPHY CHAIN reads run.wins, passed already); off, the call is exactly as before
  const bt = simulate(run.build, w.build, warlordSeed(run), undefined, [run.wins, 0], run.day, runLost(run));
  const winner = (bt.winner ?? -1) as 0 | 1 | -1;
  // AZ-BUMP (the flip; cap's ruling on run 4's Q5a): TUNE-M's forbid knob (pol.forbid) declines a forbidden drop as it
  // refuses a forbidden buy, the same way a capped run declines a drop above its cap. Harness only; par and every policy
  // set no forbid, so their runs (and the fingerprint) are as before
  const banned = forbidden(pol);
  const pre = winner === 0 && (maxStars < FUSE_MAX || banned.size > 0) ? warlordDrop(run.seed, run.day, w.id, w.tier, w.build) : null;
  const declined = pre && ((mergePreview(run, pre)?.toStars ?? 1) > maxStars || banned.has(pre)) ? pre : undefined;
  const uid = run.nextUid, queued = run.fuseAnim?.length ?? 0; // the drop's copy takes run.nextUid (fuse.ts gainModule)
  const res = declined ? withNpcDay(() => finishWarlord(run, winner, bt.t), false) : finishWarlord(run, winner, bt.t);
  if (!res) throw new Error(`par player: the ${PAR_ROAD_TIER} warlord of day ${run.day} has no result`);
  if (enchantRules()) settleMergePick(run); // ENCHANT-1 (E4/E8): road.ts gains the drop with no chooser: a merge of two different words left the pick open; the bot keeps the higher-valued word
  const drop = res.took;
  let placed = false;
  if (drop) {
    // where finishWarlord's copy ended: alone in cargo (its own uid), or merged (the queued fuse steps name the survivor)
    const steps = (run.fuseAnim ?? []).slice(queued);
    const last = steps[steps.length - 1];
    const at = last ? last.survivor : uid;
    const where = last ? last.where : "cargo";
    const i = where === "cargo" ? run.inventory.findIndex((it) => it.uid === at) : -1;
    if (i >= 0 && ITEMS[drop]?.merchant) {
      const [copy] = run.inventory.splice(i, 1);
      placed = placeFreePart(run, copy.def, new Rng(hashSeed("par-npcday-place", run.hero, run.seed, run.day)), pol, starsOf(copy)).placed;
    } else placed = where !== "cargo";
  }
  // ENCHANT-1 (E5b/E8): a warlord win's pick of 1 of 2 words (it opens only on a Hard win, which par never fights: PAR_ROAD_TIER is Medium;
  // the bots still answer it, so a tier change or a test that opens one is played): the casual player's seeded pick, the par player's valued one
  if (enchantRules() && pendingEnchantPick(run)) {
    if (pol.wordBuy !== undefined) casualWarlordPick(run, new Rng(hashSeed("casual-ench-pick", run.hero, run.seed, run.day)));
    else botWarlordPick(run, wordExtras(run));
  }
  // the day's sale loss, if the placement sold a part: what came in (the win's gold, the drop at its star, as the road
  // log counts it) minus what the deck, the purse and cargo gained
  spent.sold += before + res.gold + roadDropValue(roadLog(run.warlords.slice(logged))) - worth();
  return { id: w.id, outcome: res.outcome, time: res.time, gold: res.gold, drop, placed, ...(declined ? { declined } : {}) };
}

// ---------------------------------------------------------------- LC-1 (REQ-BFG-073): LAST CHANCE's cards for the bots

/**
 * LC-1: where the bots put a FREE part (LAST CHANCE's PART card): the par player's own judgment of an offer (candidates:
 * the best spot by the rating's gain, a merge, a rig beside a belt, gear in a free gear slot, a factory with its belts, a
 * turret's plan), on the run with a caravan of that one part at price 0, then taken through buy() as a shop buy is (the run's
 * caravan comes back after). A part that rates no gain anywhere goes to cargo (gainModule). `rng`: the caller's own stream
 * (never the policy's). Mutates `run`; returns the rating gain and whether it was placed.
 */
export function placeFreePart(run: Run, def: string, rng: Rng, pol: PolicyKnobs = knobsOf("typical"), stars = 1, word?: EnchantFields): { rel: number; placed: boolean; worth?: number } {
  const shop = run.shop, merchant = ITEMS[def]?.merchant;
  if (!merchant) throw new Error(`placeFreePart: ${def} is not a shop part`);
  // HULL-1d (REQ-BFG-073): a copy at ★2 (LAST CHANCE's PART with HULL_SCALE on, lastChance.ts lastChancePartStars) goes to
  // cargo at its star in the game (run.ts takeLastChance) and merges with a twin of that star as any copy does: where that
  // twin sits on the deck, the merge is its place
  // ENCHANT-1 (REQ-BFG-085, E5c/E8): `word`, the word LAST CHANCE's part arrives with (enchantSources.ts lastChanceWord): gained with the copy
  // (gainModule's `word` and the bots' chooser), or put on after a buy() (freeWord); `worth` is what it is worth where it ended
  if (stars > 1) {
    const g = gainModule(simRun(run), def, undefined, stars);
    if (g.steps.length && g.where !== "cargo") {
      const base0 = rateOn(run.build, run.day);
      const at = gainModule(run, def, undefined, stars, enchantRules() ? { ...(word ? { word } : {}), choose: chooserFor(run) } : undefined);
      const worth = enchantRules() && word ? wordValue(run.build, run.day, run.build.items.some((p) => p.uid === at.survivor) ? { kind: "item", uid: at.survivor } : { kind: "turret", slot: turretList(run.build).find((t) => t.uid === at.survivor)?.slot ?? -1 }, word.ench ?? "", { net: false, extras: wordExtras(run) }) : undefined;
      return { rel: relOf(run.build, base0, run.day), placed: true, ...(worth !== undefined ? { worth } : {}) };
    }
  }
  const offer = (): Run["shop"] => ({ wagons: [{ merchant, offers: [{ def, price: 0, sold: false }] }], rerolls: 0, discount: 0, free: 0 });
  run.shop = offer();
  const free = freeMark(run); // ENCHANT-1: the copy's uid and the merges queued before it (for freeWord)
  try {
    const base = stars > 1 ? rateOn(run.build, run.day) : 0;
    let best: Cand | null = null, bestRel = -Infinity;
    for (const c of allowed(candidates(run, FUSE_MAX, rng, pol))) {
      if (c.wagon !== 0 || c.slot !== 0 || c.def !== def) continue;
      // HULL-1d: a copy above ★1 is judged at its star: the buy played on a copy of the run, the fresh piece starred (a ★1
      // twin's merge is none for it)
      let rel = c.rel;
      if (stars > 1) {
        if (c.merge) continue;
        const sim = simRun(run);
        sim.shop = offer();
        try {
          if (!buyStarred(sim, c, def, stars)) continue;
        } catch {
          continue;
        }
        rel = relOf(sim.build, base, run.day);
      }
      if (!best || rel > bestRel) { best = c; bestRel = rel; }
    }
    if (best && bestRel > 0) {
      if (stars > 1) buyStarred(run, best, def, stars);
      else buy(run, best, "best", 0, []);
      return { rel: bestRel, placed: true, ...freeWord(run, def, free, word) };
    }
    // HULL-1d: with NPC_DAY on, the REFIT before every dusk: the part swapped in for a fitted piece of its kind
    const sw = npcDayRules() ? refitSwap(run, def, rng, stars) : null;
    if (sw) {
      const oldMod = run.build.mods.find((m) => m.uid === sw.swap);
      if (oldMod ? !storeMod(run, oldMod.uid) : !storePlaced(run, sw.swap)) throw new Error(`placeFreePart: the swapped-out part ${sw.swap} could not go to cargo`);
      const had = uidsOf(run.build);
      const res = buyOffer(run, 0, 0, sw.at, wordPick(run)); // ENCHANT-1 (E4): the bots' word pick on a merge (undefined off)
      if (!res.ok) throw new Error(`placeFreePart: the REFIT swap of ${def} failed: ${res.reason}`);
      if (stars > 1) starFresh(run.build, had, def, stars);
      return { rel: sw.rel, placed: true, ...freeWord(run, def, free, word) };
    }
    gainModule(run, def, undefined, stars, enchantRules() ? { ...(word ? { word } : {}), choose: chooserFor(run) } : undefined); // HULL-1d: into cargo at its star (1: as before); ENCHANT-1: and with its word
    return { rel: 0, placed: false };
  } finally {
    run.shop = shop;
  }
}

/** ENCHANT-1 (E5c/E8): the copy placeFreePart is about to gain: its uid (gainModule's run.nextUid) and the merges queued before it. */
function freeMark(run: Run): { uid: number; queued: number } {
  return { uid: run.nextUid, queued: run.fuseAnim?.length ?? 0 };
}

/**
 * ENCHANT-1 (REQ-BFG-085, E5c/E8): LAST CHANCE's part arrives WITH its word (run.ts takeLastChance: gainModule's `word`); placeFreePart gains
 * the copy through buy(), which has none, so the word goes on after, by the game's own rules: on the copy where it sits, or, when the copy
 * merged into a twin, merged into the survivor's word (fuse.ts mergeWord: the higher-valued of two different words, the bots' chooser).
 * Returns `worth`: what the word is worth on the piece it ended on (enchantBot.ts wordValue), for the bots' LAST CHANCE pick; {} with no word.
 */
function freeWord(run: Run, def: string, mark: { uid: number; queued: number }, word: EnchantFields | undefined): { worth?: number } {
  if (!enchantRules() || !word) return {};
  const steps = (run.fuseAnim ?? []).slice(mark.queued), last = steps[steps.length - 1];
  const at = last ? last.survivor : mark.uid;
  const turret = turretList(run.build).find((t) => t.uid === at);
  const piece = turret ?? run.build.items.find((p) => p.uid === at) ?? run.inventory.find((i) => i.uid === at);
  if (!piece) return {};
  const { kept } = mergeWord(enchantField(piece), word, (a, b) => chooserFor(run)({ def: piece.def, stars: starsOf(piece), a, b }));
  setPieceWord(run, at, kept);
  const placed = turret ? { kind: "turret" as const, slot: turret.slot } : run.build.items.some((p) => p.uid === at) ? { kind: "item" as const, uid: at } : undefined;
  return { worth: placed && kept.ench ? wordValue(run.build, run.day, placed, kept.ench, { net: false, extras: wordExtras(run) }) : 0 };
}

/** HULL-1d: every placed piece's uid (rigs and factories, gear and cores, installed turrets). */
const uidsOf = (b: Build): Set<number> => new Set([...b.items, ...b.mods, ...(b.turrets ?? [])].map((p) => p.uid));

/** HULL-1d: the piece of `def` that `b` holds and `had` didn't (the copy just placed) goes to ★`stars` (LAST CHANCE's copy
 *  comes at its star; stars ride along when a part moves, run.ts storePlaced). False when none landed (it merged away). */
function starFresh(b: Build, had: ReadonlySet<number>, def: string, stars: number): boolean {
  const fresh = [...b.items, ...b.mods, ...(b.turrets ?? [])].find((p) => p.def === def && !had.has(p.uid));
  if (!fresh) return false;
  fresh.stars = stars;
  return true;
}

/** HULL-1d: buy() of candidate `c` (a copy of `def` at price 0), then the fresh piece at ★`stars`. */
function buyStarred(r: Run, c: Cand, def: string, stars: number): boolean {
  const had = uidsOf(r.build);
  buy(r, c, "best", 0, []);
  return starFresh(r.build, had, def, stars);
}

/**
 * HULL-1d (REQ-BFG-073; BRIEF-HULL1D 2 (a)2 and (e)2): the bots' REFIT swap of a free part, NPC_DAY on only. With NPC_DAY
 * on, a player gets REFIT before every dusk (npcDay.ts: move, swap and place cargo; no buying or selling), so LAST
 * CHANCE's part, which goes to cargo, can be swapped in for a fitted piece of its kind, the old one going to cargo. The
 * bots' own swaps (rigSwap, candidates' gear upgrade) judge a fitted piece against the offer's price, and a free part's
 * price is 0, so they never swapped it in: with every switch on, 155 of 307 offered parts stayed in cargo (HULL-1c).
 * This is the swap a player makes there: a free rig on a placed rig's cell (rigSwap, the fitted rig's value not
 * compared), free gear in a fitted gear piece's place on its turret (canFitGear); the best-rated swap, when it rates a
 * gain and keeps FOUNDRY's synced guns (syncKeeper). A turret needs none (turretCand plans its swap). Reads no RNG
 * beyond the Shopper's (none here). Null: no swap rates a gain.
 */
function refitSwap(run: Run, def: string, rng: Rng, stars = 1): { rel: number; swap: number; at: GainAt } | null {
  const b = run.build, day = run.day, d = ITEMS[def], base = rateOn(b, day), keep = syncKeeper(b);
  if (d.kind === "gate") {
    const s = new Shopper(b, maxGoldByDay(day), day, rng, "on", FUSE_MAX, "on", "on");
    const c = rigSwap(b, s, def, Infinity, run.nextUid, base, day, keep, stars);
    return c && c.rel > 0 && c.swap !== undefined && c.at ? { rel: c.rel, swap: c.swap, at: c.at } : null;
  }
  if (d.kind !== "mod") return null;
  let best: { rel: number; swap: number; at: GainAt } | null = null;
  for (const v of installedTurrets(b)) {
    for (const old of gearOn(b, v.slot)) {
      if (old.def === def) continue;
      const after = cloneBuild(b);
      after.mods = after.mods.filter((m) => m.uid !== old.uid);
      if (!canFitGear(after, v.slot, def).ok) continue;
      after.mods.push({ uid: run.nextUid, def, turret: v.slot, ...(stars > 1 ? { stars } : {}) }); // HULL-1d: at its star
      if (keep && !keep(after)) continue;
      const rel = relOf(after, base, day);
      if (rel > 0 && (!best || rel > best.rel)) best = { rel, swap: old.uid, at: { turret: v.slot } };
    }
  }
  return best;
}

/** BUMP-1E C2 (S8 item 7; REQ-BFG-073): what a LAST CHANCE part is worth at the least, in hull: its sale (content.ts sellValue at its
 *  star) spent on ARMOR PACKs, "the least a gold can buy" (harness/lastChance.ts goldBy10 prices the gold runes the same way). A part the
 *  bots can place nowhere (45% of the par boards of days 3-8 at K 24) sat in cargo, rated no gain, and so was the weakest card by
 *  construction (c5 20%, par 7% on 1D's F1); a part is never worth less than selling it. One reader: the pick (botLastChancePick) and
 *  the modeled run's card (lastChanceCard) both take this number, so the bots get what they priced. */
export function partSaleHull(def: string, stars: number): number {
  const armor = ITEMS[PACK_ITEM.armor];
  return Math.floor(sellValue(def, stars) * ((armor.supply?.hull ?? 0) / Math.max(1, armor.price)));
}

/** LC-1: the par run's LAST CHANCE card at the dawn after `day` (playerRun's opts.lastChance): the game's takeLastChance
 *  for the rune and the hull; the part placed by placeFreePart (on its own stream), recorded as the game records it.
 *  BUMP-1E C2: a part that finds no spot is sold at once into ARMOR PACKs (partSaleHull), the value the pick gave it. */
function lastChanceCard(run: Run, day: number, boon: Boon, pol: PolicyKnobs, hull?: number): void {
  run.lastChance = { day };
  if (boon === "hull" && hull !== undefined) { // the bench's sweep: another HULL amount
    run.build.hullBonus += hull;
    run.lastChance = { day, boon };
    return;
  }
  if (boon !== "part") {
    if (!takeLastChance(run, boon).ok) throw new Error(`par player: LAST CHANCE ${boon} on day ${day} was refused`);
    return;
  }
  const lo = lastChanceOffer(run.seed, day, run.hero, (run.build.runes ?? []).map((q) => q.id), openRunesRules()), id = lo.part; // OPEN-1: the switch
  if (!id) throw new Error(`par player: no LAST CHANCE part on day ${day}`);
  // ENCHANT-1 (E5c): the part arrives with its seeded word (run.ts takeLastChance), which the harness run keeps (placeFreePart's freeWord)
  // BUMP-1F (PACKET-BUMP-0130 section 4, SEMANTIC): lw as ENCHANT computes it, then BUMP-1E's `put` and its sale: a part that finds no
  // spot is sold into ARMOR PACKs (its word is lost with it, as lastChance.ts rates the sale floor)
  const lw = enchantRules() ? lastChanceWord(run.seed, day, id) : null;
  const put = placeFreePart(run, id, new Rng(hashSeed("lastchance-place", run.hero, run.seed, day)), pol, lo.partStars ?? 1, lw ? enchantField(lw) : undefined); // HULL-1d: at its star
  if (!put.placed) run.build.hullBonus += partSaleHull(id, lo.partStars ?? 1); // BUMP-1E C2: sold into ARMOR PACKs, as the pick rated it
  run.lastChance = { day, boon, id };
}

// ---------------------------------------------------------------- bench helper (CAND-A: parBench's ablations)

/**
 * CAND-A (tools/parBench.ts, flags 1 and 3): feed belt ri again as a player would once its turret has left or its
 * join is undone: redrawn at its shortest into a free intake (the free redraw, within its tiles plus the free belt,
 * its riders put back beside it, any join dropped), else, with `join`, into the best-rated join at a tile up to
 * another connected belt's rig row. True when it was redrawn; otherwise `b` is unchanged. Deterministic per seed.
 */
export function refeedRoute(b: Build, ri: number, day: number, seed: number, join = true): boolean {
  const r = b.routes[ri], f = r ? itemByUid(b, r.factory) : undefined;
  if (!r || !f) return false;
  const rng = new Rng(hashSeed("par-refeed", b.hero, day, ri, seed));
  const bl = blockedCells(b, ri), starts = startCellsFor(cellsOf(f), bl);
  const room = r.cells.length + beltFree(b);
  const tries = freeConnectors(b, ri).map((col) => ({ col, len: shortestTiles(bl, starts, col) }))
    .filter((c) => Number.isFinite(c.len) && c.len <= room).sort((x, y) => x.len - y.len || x.col - y.col);
  for (const c of tries) if (editor(b, day, rng).moveRoute(ri, c.len, c.col)) return true;
  if (!join) return false;
  const j = joinRedraw(b, ri, day, rng, rateOn(b, day), null);
  if (!j) return false;
  b.items = j.build.items;
  b.routes = j.build.routes;
  return true;
}
