// Run state (spec §17, §18): days, gold, lives, owned equipment and the caravan shop. 0.5.0 added
// the road event between the caravan and the battle; 0.6.0 makes a run 10 days, each ending in a
// dusk fight against a ghost (day.ts, ghosts.ts). Saving and migrations live in save.ts.

import { hashSeed, Rng } from "../core/rng";
import {
  FAMILY_WEIGHT, HEROES, ITEMS, MERCHANTS, OFFERS, PACK_ITEM, RARITIES, REROLL_COST, START_GOLD, START_LIVES, UPGRADE_MAX,
  UPGRADE_PRICE, itemsSoldBy, rarityWeights, rigShape, sellValue,
  type HeroId, type ItemDef, type MerchantId, type PackId, type Rarity, type UpgradeTrack,
} from "../sim/content";
import { removeItem, rotOf, setRot, type Build } from "../sim/deck";
import { heroStartBuild } from "../sim/heroBuilds";
import type { BattleRecord, SideStats } from "../sim/battle";
import type { RaceReadout } from "./raceReadout"; // 0.8.0 H1 M3
import type { EventId, EventState } from "./eventDefs";
import type { RivalId } from "../sim/rivals";
import type { PendingBounty, PendingSabotage, RoadChoice, WarlordFight, WarlordResult } from "./roadTypes";
import { fusible, starField, starsOf, upgradeLevel } from "../sim/stars";
import { gainModule, mergePreview, type FuseStep, type Gain, type GainAt } from "./fuse";
import { drawWares, unlocked, type Wares } from "./wares"; // 0.8.0 I1 M3: the per-run draw
import { SUSTAIN_FIRST_DAY, isSustain } from "../sim/content"; // BOTS-X (REQ-BFG-069): the day-3 hold (dayPool)
import { GATES_FIRST_DAY } from "./wares"; // GATES-1 (REQ-BFG-052): the gates' first day (dayPool)
import { isGatesPiece } from "../sim/gates"; // GATES-1 (REQ-BFG-052): the three gates (dayPool)
import { coreFor } from "../sim/deck"; // 0.6.1b: fitCore
import { cellsOf, isIntakeCell, shapesRules } from "../sim/deck"; // SHAPES-1 S5b: the intake sweep
import { canPlaceItem } from "../sim/deck"; // SHAPES-1 (R1, S2): rotateRig turns a long rig only where it fits
import { isShaped } from "../sim/foot"; // SHAPES-1 S5b
import { strandedConverters } from "../sim/split"; // GATES-1 (REQ-BFG-057): releaseStranded
import { dawnGold, dawnRuneOffer, pickGold, RUNES, type RuneOffer } from "../sim/runes"; // RUNES-1 (REQ-BFG-058); FIRSTDAY-1: dawnRuneOffer
import { FIRST_RUN_COMMONS, FIRST_RUN_DAYS, firstRunGate, seededOrder } from "../sim/firstRun"; // FIRSTDAY-1 (REQ-BFG-004): F2-F3
import { BOONS, LAST_CHANCE_HULL, lastChanceOffer, offeredId, type Boon, type LastChance, type LastChanceOffer } from "../sim/lastChance"; // LC-1 (REQ-BFG-073)
import { npcDayRules } from "../sim/npcDay"; // NPC-1 (REQ-BFG-077): REFIT has no shop
import { HEARTS_START, heartsRules } from "../sim/hearts"; // RETUNE-1 (REQ-BFG-096): a new run's hearts
import { longRunRules } from "../sim/longRun"; // RUN-1 (REQ-BFG-059): a new run's long-run mark
import { endlessRules, type EndlessRun } from "../sim/endless"; // ENDLESS-1 (REQ-BFG-059): a new run's endless mark; the endless state
import { openRunesRules } from "../sim/openRunes"; // OPEN-1 (REQ-BFG-109): the dawn offer's and LAST CHANCE card's rule
import {
  canSellTurret, installTurret, isTurretDef, moveTurret, removeTurret, turretList, turretSellValue, turretSlots,
  type TurretOpResult,
} from "../sim/deck"; // 0.6.2s (REQ-BFG-031): turret slots

export { loadRun, migrateRun, saveRun, SAVE_KEY, SAVE_KEY_V3, SAVE_KEY_V4, SAVE_KEY_V5, SAVE_KEY_V6 } from "./save";
export type { PendingBounty, PendingSabotage, RoadChoice, RoadPick, WarlordFight, WarlordOutcome, WarlordResult, WarlordReward } from "./roadTypes";

export interface InvItem {
  uid: number;
  def: string;
  stars?: number; // 0.6.1a: 2 or 3 after a merge; absent = 1 (never written as 1)
  free?: boolean; // 0.6.2s (REQ-BFG-031 S7): a turret holding its hull's free starting copy; absent = false
}

export interface Offer {
  def: string;
  price: number;
  sold: boolean;
}

export interface Wagon {
  merchant: MerchantId;
  offers: Offer[];
}

export interface Shop {
  wagons: Wagon[];
  rerolls: number;
  discount: number; // every price -n (min 1) in this caravan (a scout's deal)
  free: number; // free rerolls left in this caravan
}

/** One day's dusk fight. */
export interface DayResult {
  day: number;
  outcome: "win" | "loss" | "draw";
  income: number;
  time: number;
  foe: string; // the dusk opponent as shown ("GHOST · WEAVER · 2-1" or a stand-in's name)
  ghost: boolean; // a pool ghost (false: a stand-in)
  refund?: number; // 0.6.2 RULE EARLY-LOSS REFUND: lives given back at the dawn this dusk leads into (absent: none)
  shocks?: [number, number]; // 0.6.2 RULE SHOCK ROW: machines each side's Shock stalled (you, foe); absent before 0.6.2
  // 0.8.0 H1 M3 (display only): FOUNDRY's and BASTION's rows (raceReadout: fused slugs, plating gained and spent, from the
  // sim's race counters); absent when neither side is one of them, so a Furnace or Weaver result is saved as before
  race?: RaceReadout;
  player: SideStats;
  enemy: SideStats;
  // 0.7.0a (online play only, src/game/online.ts; absent offline, so an offline save is 0.6.2's), save v7, no bump:
  record?: BattleRecord; // battleRecordFor(your deck, the foe's, battleSeed): the summary's REPLAY plays it (read-only)
  hulls?: [number, number]; // both hulls when the fight ended (you, foe): what a replay must reproduce
  // LC-1 (REQ-BFG-073; Z-BUMP: no switch): this dusk's loss fired LAST CHANCE: the lives it gave back at
  // once (the dusk card's "LAST CHANCE: +1 LIFE"), then the card taken and its id (the summary's row). Absent otherwise,
  // so every switch-off result is saved as before. Save v8, no bump (a new optional field, as refund was).
  lastChance?: { lives: number; boon?: Boon; id?: string };
  // RETUNE-1 (REQ-BFG-096): on a hearts run, the hearts this dusk's loss cost (heartCost: 1/2/3); absent on a lives run
  // and on a win or a draw, so every switch-off result is saved as before
  heartsLost?: number;
  // ENDLESS-1 (REQ-BFG-059): this dusk was an ENDLESS dusk (day.ts finishEndlessDay): the run's wins stay WIN_GOAL, so replays.ts
  // replayAt counts the player's wins carried in (WARLORD'S DUE) from the run's own dusks only. Absent on every run dusk.
  endless?: true;
}

/** Where the day stands (0.6.0b): dawn caravan, the road fork, the road event or the warlord
 *  fight picked there, refitting after it, or the dusk fight. */
export type Stage = "caravan" | "fork" | "event" | "warlord" | "refit" | "battle";

export interface TakenEvent {
  day: number;
  id: EventId;
  choice: string;
  won: boolean;
}

/** Today's dusk opponent, stored when dusk starts so a reload fights the same one. */
export interface DuskFoe {
  day: number;
  kind: "ghost" | "standin";
  name: string;
  hero: HeroId;
  build: Build; // fought exactly as stored
  rival?: RivalId; // a stand-in's captain (portrait, STAND-IN tag)
  record?: { wins: number; lives: number; runId: string; playerId: string; createdAt: number; name?: string; ghostDay?: number; losses?: number; endlessWins?: number }; // a pool ghost's stamp (PACKS M2: its player name, when it has one; ENDLESS-1: an endless ghost's endless wins)
  // ENDLESS-1 (REQ-BFG-059): the GOD stand-in (sim/godStandIn.ts), an endless dusk's foe when no endless ghost is near: a stand-in
  // without a captain (no `rival`), PvE only. Absent on every other foe, so a run's save is as before. Save v8, no bump.
  god?: true;
  // RUN-1 (R1.5, T4b): `ghostDay`, the ghost's OWN day, only when it differs from this dusk's day (D6: a long run's thin day widens to the
  // nearest earlier day, so a day-12 dusk can meet a day-10 ghost): foeTitle reads the ghost's W-L from it. Absent: the ghost fought on
  // this dusk's day (every 10-day run, and every exact-day pick), so a save and a record are byte for byte as before.
  // RUN-1 (R2.4): `losses`, the dusks the ghost lost before its dusk, only when its snapshot STATES them (a long run's record does; a draw is
  // no loss): foeTitle prints W-L from it. Absent: the snapshot stated none (every 10-day ghost), the L is derived as before.
  // 0.7.0a (online play only; absent offline), save v7, no bump: where tonight's foe came from, shown in small text on
  // the NEXT BATTLE card and under the enemy plate: "online" a ghost from the ghost server, "offline" 0.6.2's stand-in
  // after the fetch fell back (an error, a timeout, a 404 or an unusable answer)
  source?: "online" | "offline";
  ghostId?: string; // the server ghost's id (it joins Run.seenGhosts: no repeats in a run)
}

export interface Run {
  version: number;
  seed: number;
  runId: string; // unique per run: a run never meets its own ghosts
  hero: HeroId;
  enemyHero: HeroId; // 0.5.0 warlord hero (the herald's champion; 0.6.0b retargets it)
  day: number; // 1..RUN_DAYS; RUN-1: a long run (longRun) has no day limit (1, 2, ...)
  gold: number;
  lives: number;
  wins: number;
  losses: number;
  build: Build;
  inventory: InvItem[];
  shop: Shop;
  nextUid: number;
  history: DayResult[];
  over: null | "complete" | "lost" | "won"; // RUN-1: "won" ends a long run at its WIN_GOAL-th win ("complete": a 10-day run)
  stage: Stage;
  event: EventState | null;
  nextShop: { discount: number; free: number };
  events: TakenEvent[];
  dusk: DuskFoe | null;
  // 0.6.0b, the road fork (road.ts)
  road: RoadChoice | null; // today's fork pick
  warlord: WarlordFight | null; // today's warlord fight (stored at the pick, so a reload replays it)
  warlords: WarlordResult[]; // every warlord fight of the run, in order (summary)
  matriarchBeatenOn: number | null; // R3: the day the Iron Matriarch was beaten
  bounty: PendingBounty | null; // ELITE BOUNTY: rides on the next Hard warlord fight
  sabotage: PendingSabotage | null; // SABOTAGE: the next warlord fights weakened
  fuseFx?: string[]; // 0.6.1a, cosmetic: merge toasts the build screen shows next ("MERGED: TEMPER ★2")
  lastMerchants?: MerchantId[]; // 0.6.1d: yesterday's final caravan (absent = no variety factor); save v7, no bump
  fuseAnim?: FuseStep[]; // 0.6.1d2, cosmetic: merge steps queued for the build screen's animation
  // (lift/arc/flash/ring/sparkle, then the pips pop in); see queueFuseAnim. Save v7, no bump.
  // 0.6.2 TUNE-M, RULE EARLY-LOSS REFUND (day.ts): set at the dawn of REFUND_DAY when the run lost a life on day 1 or 2,
  // with the lives it gave back (0 when already at START_LIVES); once per run. Absent: no refund (yet). Save v7, no bump.
  refund?: { day: number; lives: number };
  // 0.7.0a, online play only (src/game/online.ts; absent offline, so an offline save stays 0.6.2's). Save v7, no bump:
  // a new optional field, as 0.6.2j's joins and TUNE-M's refund were; a v8 key would be a new storage key offline (D3).
  seenGhosts?: string[]; // server ghost ids fought this run, sent as the match request's `seen` (no repeats in a run)
  uploaded?: number; // the last day whose dusk deck was submitted (once per dusk, also across a reload)
  // 0.8.0 I1 M3 (REQ-BFG-022 part 2; DESIGN-wave3.md 4.2): the per-run draw (wares.ts drawWares, from the run seed alone,
  // never the hero): each module the run's caravan and road can offer, with the day it unlocks. Save v7, no bump: a new
  // optional field, as refund and the joins were. Absent (a save from before 0.8.0): today's rule, so a run in progress
  // never changes.
  wares?: Wares;
  // RUNES-1 (REQ-BFG-058): the day whose dawn rune pick is pending (runePending: the picker shows over the caravan until
  // it is taken; free, no skip). Set by newRun (day 1) and at every new dawn of a run that took a rune at every dawn
  // before it (runes.length === day - 1); a save from before runes never gets one. The held runes live in build.runes
  // (in pick order), so the snapshot, the battle and a reload carry them. Save v7, no bump (a new optional field).
  runeDay?: number;
  // LC-1 (REQ-BFG-073; Z-BUMP: no switch): the run's LAST CHANCE, once a run: set by finishDay when it fires
  // ({ day }: the pick is pending; the picker shows before that dawn's rune pick), then { day, boon, id } once a card is
  // taken (takeLastChance). A LAST CHANCE rune sits in build.runes right after its day's dawn pick (index `day`). Absent:
  // it never fired (every switch-off run). Save v8, no bump (a new optional field, as refund and runeDay were).
  lastChance?: LastChance;
  // RETUNE-1 (REQ-BFG-096): the run plays on hearts (src/sim/hearts.ts: 10 hearts, a loss costs 1/2/3 by day), set by
  // newRun while HEARTS is on; true only. Absent: 5 lives, as before (every switch-off run, and a run saved before the
  // bump that turns HEARTS on, which finishes on its own scale). Save v8, no bump (a new optional field, as lastChance).
  hearts?: true;
  // RUN-1 (REQ-BFG-059, REQ-BFG-116): the run is a long run (src/sim/longRun.ts: won at WIN_GOAL wins, lost at 0 hearts, no
  // day limit), set by newRun while LONG_RUN is on; true only. Absent: the 10-day run, as before (every switch-off run, and
  // a run saved before the bump that turns LONG_RUN on, which finishes on its own rule). Save v8, no bump (a new optional
  // field, as hearts).
  longRun?: true;
  // ENDLESS-1 (REQ-BFG-059, its second step; src/sim/endless.ts): the run is OFFERED endless once it is won, set by newRun while
  // ENDLESS is on; true only. Absent: the run ends at its win, as before (every switch-off run, and a run saved before the release
  // that turns ENDLESS on, which plays on its own rules). Save v8, no bump (a new optional field, as longRun).
  endless?: true;
  // ENDLESS-1: the run's endless state once CONTINUE ENDLESS is taken (day.ts startEndless): the victory day, the endless wins,
  // losses and draws, and why it ended (`end`) once it did. Absent until then, so a won run and every switch-off run are as
  // before. While it plays `over` is null and `lives` hold the endless hearts (ENDLESS_LIVES); when it ends `over` is "won" again.
  // Save v8, no bump (a new optional field).
  endlessRun?: EndlessRun;
  // FIRSTDAY-1 (REQ-BFG-004; BRIEF-FIRSTDAY1 F2-F3; src/sim/firstRun.ts): a new player's first run (set by newRun only with
  // the gate live and the hero screen's profile read: profile.ts isNewPlayer), so its days 1-2 offers are gated and its
  // snapshots carry the flag; and the first rig it bought on day 1 (dawn 2 offers a copy). Both absent on every other run,
  // so every other save is as before. Save v8, no bump (new optional fields, as refund and runeDay were).
  firstRun?: true;
  firstRig?: string;
}

export const RUN_VERSION = 8; // 0.6.1a: module merging (stars; save.ts v6to7 runs fuseAll once); NUM-1: hull x10 (save.ts v7to8, once)

let runCounter = 0;
/** A fresh run id: the seed plus the clock and a session counter (unique across quick restarts). */
export function newRunId(seed: number): string {
  return `${(seed >>> 0).toString(36)}-${Date.now().toString(36)}-${(runCounter++).toString(36)}`;
}

/** A new run. FIRSTDAY-1 (REQ-BFG-004; BRIEF-FIRSTDAY1 F2): `firstRun` is the caller's profile read (the hero screen asks
 *  profile.ts isNewPlayer; nothing here reads a profile, so the server's, the harness's and the tools' runs never do); it
 *  makes a first run only while the gate is live (firstRunGate: FIRST_RUN and PLAIN_RIGS), else the run is normal. */
export function newRun(hero: HeroId, seed: number, runId = newRunId(seed), firstRun = false): Run {
  const run: Run = {
    version: RUN_VERSION, seed, runId, hero, enemyHero: hero === "furnace" ? "weaver" : "furnace",
    day: 1, gold: START_GOLD, lives: START_LIVES, wins: 0, losses: 0,
    build: heroStartBuild(hero, 1), inventory: [], shop: { wagons: [], rerolls: 0, discount: 0, free: 0 },
    nextUid: 100, history: [], over: null,
    stage: "caravan", event: null, nextShop: { discount: 0, free: 0 }, events: [], dusk: null,
    road: null, warlord: null, warlords: [], matriarchBeatenOn: null, bounty: null, sabotage: null,
    wares: drawWares(seed), // 0.8.0 I1 M3: the per-run draw (the run seed alone)
    runeDay: 1, // RUNES-1: the first dawn's rune pick
    // RETUNE-1 (REQ-BFG-096): with HEARTS on, HEARTS_START hearts and the run's mark, last; off: exactly as before
    ...(heartsRules() ? { lives: HEARTS_START, hearts: true as const } : {}),
    // RUN-1 (REQ-BFG-059): with LONG_RUN on, the run's long-run mark, after the hearts; off: exactly as before
    ...(longRunRules() ? { longRun: true as const } : {}),
    // ENDLESS-1: with ENDLESS on, the run's endless mark (a won run is then offered CONTINUE ENDLESS), after the long-run mark; off: exactly as before
    ...(endlessRules() ? { endless: true as const } : {}),
    // PLAIN-1F (M1): FIRSTDAY-1's flag after RETUNE-1's hearts (and RUN-1's long-run mark), so it stays the save's last key
    // (only on a first run)
    ...(firstRun && firstRunGate() ? { firstRun: true as const } : {}), // FIRSTDAY-1: last, only on a first run
  };
  rollShop(run);
  return run;
}

// ---- FIRSTDAY-1 (REQ-BFG-004, REQ-BFG-084.4; BRIEF-FIRSTDAY1 F3): a first run's caravan on days 1-2 (src/sim/firstRun.ts) --

/** F3: does this run's caravan (and dawn rune) follow the first-run gate today? A first run, on day 1 or 2, with the gate
 *  live (FIRST_RUN and PLAIN_RIGS). */
export function firstRunGated(run: Pick<Run, "firstRun" | "day">): boolean {
  return run.firstRun === true && run.day <= FIRST_RUN_DAYS && firstRunGate();
}

/** F3: the hero's own pieces: every part its starting deck holds (its factory, rigs, gear and starting turrets). A first
 *  run's caravan keeps an offer of one where the base's caravan rolled it (buying it merges). */
export function firstRunOwnPieces(run: Pick<Run, "hero">): Set<string> {
  const b = heroStartBuild(run.hero, 1);
  return new Set([...b.items.map((p) => p.def), ...b.mods.map((m) => m.def), ...turretList(b).map((t) => t.def)]);
}

/** F3, dawn 2: the cheapest turret or gear piece the hero can use (gear needs a turret to sit on; a turret a free
 *  hardpoint), among the commons a merchant sells; the first in catalogue order on a tie. Today HOPPER (4 G, "+1 LOAD")
 *  for every hero (READ-1 6.4); MANTLET ties at 4 G after it. */
export function firstRunGear(run: Pick<Run, "build">): string | null {
  const turrets = turretList(run.build).length;
  const freeHardpoint = turretSlots(run.build).some((s) => !s.turret);
  let best: ItemDef | null = null;
  for (const d of Object.values(ITEMS)) {
    if ((d.kind !== "mod" && d.kind !== "turret") || d.rarity !== "common") continue;
    if (!d.merchant || !itemsSoldBy(d.merchant).some((x) => x.id === d.id)) continue;
    if (d.kind === "mod" ? turrets === 0 : !freeHardpoint) continue;
    if (!best || d.price < best.price) best = d;
  }
  return best ? best.id : null;
}

/**
 * F3: gate a first run's caravan on days 1-2, after rollShop rolled it by the base's rule (the same stream, merchants,
 * wagons and slots, so lastMerchants and every later day are the base's). Each offer stays when it is a plain common
 * (FIRST_RUN_COMMONS, in ITEMS) or one of the hero's own pieces (firstRunOwnPieces); every other slot is refilled.
 * - Dawn 2 first places its two extra offers: the cheapest turret or gear the hero can use (firstRunGear) and, when the
 *   run bought a rig on day 1, a copy of the first one (run.firstRig), so the MERGE ★2 badge shows. Each takes the first
 *   slot to refill (caravan order), else the last kept slot; one already on offer is not added twice.
 *   FIRSTDAY-1 Q4 (REVIEW-FIRSTDAY1; PLAIN-1F M2): the copy only while buying it would merge (fuse.ts mergePreview, the
 *   test shopBadge's MERGE reads), checked on the dawn roll and on every day-2 reroll: once the first rig is sold, merged
 *   on day 1 or bought again on day 2, no copy is added, and its slot takes the usual plain-common refill.
 * - The other slots are refilled with the plain commons in a seeded order ("first-run-shop", day, rerolls: a reroll
 *   draws from the same gated set), never one already in the caravan. With 6 plain commons and at most 5 slots no slot is
 *   ever left unfillable; were one, it would keep the base's offer.
 * Prices follow the base's rule (the def's price less the caravan's discount, at least 1); no slot is added or removed.
 */
export function firstRunCaravan(run: Run, priceOf: (d: { price: number }) => number): void {
  const own = firstRunOwnPieces(run);
  const plain = FIRST_RUN_COMMONS.filter((id) => !!ITEMS[id]);
  const keep = (def: string) => plain.includes(def) || own.has(def);
  const slots = run.shop.wagons.flatMap((w) => w.offers.map((_, i) => ({ w, i })));
  const defOf = (s: { w: Wagon; i: number }) => s.w.offers[s.i].def;
  const put = (s: { w: Wagon; i: number }, def: string) => { s.w.offers[s.i] = { def, price: priceOf(ITEMS[def]), sold: false }; };
  const kept = slots.filter((s) => keep(defOf(s)));
  const open = slots.filter((s) => !keep(defOf(s)));
  const shown = new Set(kept.map(defOf));
  const extras: string[] = [];
  if (run.day === 2) {
    const gear = firstRunGear(run);
    if (gear) extras.push(gear);
    // FIRSTDAY-1 Q4: only while buying the copy would merge (mergePreview, as shopBadge's MERGE)
    if (run.firstRig && ITEMS[run.firstRig] && mergePreview(run, run.firstRig) !== null) extras.push(run.firstRig);
  }
  for (const def of extras) {
    if (shown.has(def)) continue;
    const s = open.shift() ?? kept.pop();
    if (!s) break;
    shown.delete(defOf(s));
    put(s, def);
    shown.add(def);
  }
  const order = seededOrder(plain, run.seed, "first-run-shop", run.day, run.shop.rerolls);
  for (const s of open) {
    const def = order.find((id) => !shown.has(id));
    if (!def) continue; // never with 6 plain commons and at most 5 slots (tests/firstday1.rules.test.ts)
    put(s, def);
    shown.add(def);
  }
}

// ---- RUNES-1 (REQ-BFG-058): the dawn rune pick ------------------------------------------------------------------------

/** Today's pending rune offer (runes.ts runeOffer on the run's own "rune" stream), or null when no pick is pending. The
 *  offer is re-derived from (seed, day, hero, held), never stored, so a reload shows the same cards. */
export function pendingRune(run: Pick<Run, "seed" | "day" | "hero" | "build" | "runeDay" | "over" | "lastChance" | "firstRun">): RuneOffer | null {
  if (run.over || run.runeDay !== run.day) return null;
  if (lastChancePending(run)) return null; // LC-1: the LAST CHANCE pick comes first (its offer reads the runes held now)
  // OPEN-1 (REQ-BFG-109): this build's offer rule, the switch (openRunesRules: hero-blind when on)
  // FIRSTDAY-1 (F3): a first run's dawns 1-2 (runes.ts dawnRuneOffer); every other run reads runeOffer(..., open), as before
  const offer = dawnRuneOffer(run.seed, run.day, run.hero, (run.build.runes ?? []).map((q) => q.id), openRunesRules(), run.firstRun === true);
  return offer.ids.length ? offer : null;
}

/**
 * Take rune `id` from today's offer: it joins build.runes (pick order), a HULL or BELT rune adds to build.hullBonus /
 * build.beltCap at once, and a dawn-gold rune pays this dawn's gold at once (it is part of the dawn). Refused when no
 * pick is pending or `id` is not on offer. The caller saves the run.
 */
export function takeRune(run: Run, id: string): { ok: boolean; reason?: string } {
  const offer = pendingRune(run);
  if (!offer) return { ok: false, reason: "NO RUNE TO PICK" };
  if (!offer.ids.includes(id)) return { ok: false, reason: "NOT ON OFFER" };
  const d = RUNES[id];
  run.build.runes = [...(run.build.runes ?? []), { id }];
  if (d.kind === "hull") run.build.hullBonus += d.amount.n;
  else if (d.kind === "belt") run.build.beltCap += d.amount.n;
  else run.gold += pickGold(d, run.build.runes.length, lastWon(run)); // RUNES-2a: dawn gold, RUNE TITHE, SPOILS SACK
  delete run.runeDay;
  return { ok: true };
}

/** RUNES-2a (SPOILS SACK): the dusk before this dawn was a win (never on day 1). */
const lastWon = (run: Pick<Run, "history">): boolean => run.history[run.history.length - 1]?.outcome === "win";

/** RUNES-2a (REQ-BFG-058; RUNES-1 gap 6): what a refused fight says while today's rune pick is pending. */
export const RUNE_FIRST = "TAKE TODAY'S RUNE FIRST";

/**
 * RUNES-2a (RUNES-1 gap 6): why the run can't leave for a fight now, or null. A fight is refused while today's rune pick
 * is pending (pendingRune: the pick is free and can't be skipped), so a deck never fights a dusk with fewer runes than
 * its dawns. The build screen's FIGHT asks it first (screens/build/build.ts fight, so tooling that calls screen.fight()
 * meets it too); tooling that skips the picker takes the rune first (takeRune, or bb.holdRunes in a browser run).
 */
export function fightRefusal(run: Pick<Run, "seed" | "day" | "hero" | "build" | "runeDay" | "over" | "lastChance" | "firstRun">): string | null {
  if (lastChancePending(run)) return LAST_CHANCE_FIRST; // LC-1: never set while the switch is off
  return pendingRune(run) ? RUNE_FIRST : null;
}

/** At a new dawn (day.ts finishDay): the held dawn-gold runes pay, then a run that took a rune at every dawn so far owes
 *  today's pick. A run from before runes (fewer runes than dawns) never owes one. LC-1: a LAST CHANCE rune is held but is
 *  no dawn's pick, so the count leaves it out (lcRunes: 0 for every switch-off run). */
export function runeDawn(run: Run): void {
  run.gold += dawnGold(run.build.runes, lastWon(run)); // RUNES-2a: RUNE TITHE per rune held, SPOILS SACK after a win
  if ((run.build.runes?.length ?? 0) - lcRunes(run) === run.day - 1) run.runeDay = run.day;
  else delete run.runeDay;
}

// ---- LC-1 (REQ-BFG-073): LAST CHANCE (src/sim/lastChance.ts; Z-BUMP: the game's rule, its switch deleted) --------------

/** What a refused fight says while the LAST CHANCE pick is pending. */
export const LAST_CHANCE_FIRST = "TAKE YOUR LAST CHANCE FIRST";

/** 1 when the run holds a LAST CHANCE rune (one more rune than its dawns), else 0. */
export const lcRunes = (run: Pick<Run, "lastChance">): number => (run.lastChance?.boon === "rune" ? 1 : 0);

/** Is the LAST CHANCE pick pending (fired, no card taken yet)? */
export const lastChancePending = (run: Pick<Run, "lastChance" | "over">): boolean => !run.over && !!run.lastChance && run.lastChance.boon === undefined;

/** The pending LAST CHANCE offer, re-derived from (seed, its day, hero, the runes held now), never stored, so a reload or
 *  CONTINUE shows the same three cards; null when no pick is pending. */
export function pendingLastChance(run: Pick<Run, "seed" | "hero" | "build" | "lastChance" | "over">): LastChanceOffer | null {
  if (!lastChancePending(run)) return null;
  return lastChanceOffer(run.seed, run.lastChance!.day, run.hero, (run.build.runes ?? []).map((q) => q.id), openRunesRules()); // OPEN-1: the switch
}

/**
 * Take LAST CHANCE's card `boon`: the RUNE joins build.runes (right after its day's dawn pick: the pick comes before the
 * next dawn's) with takeRune's effects (a HULL or BELT rune on the build at once, a dawn-gold rune's gold now); the PART
 * enters cargo free at 1 star through gainModule (it merges as a bought copy would, so the fuse invariant holds); HULL adds
 * LAST_CHANCE_HULL to build.hullBonus. The run and that day's history row record the card. Refused when no pick is
 * pending or the offer has no such card. The caller saves the run.
 */
export function takeLastChance(run: Run, boon: Boon): { ok: boolean; reason?: string; gain?: Gain } {
  const offer = pendingLastChance(run);
  if (!offer) return { ok: false, reason: "NO LAST CHANCE TO PICK" };
  if (!BOONS.includes(boon)) return { ok: false, reason: "NOT ON OFFER" };
  const id = offeredId(offer, boon);
  if (id === null) return { ok: false, reason: "NOT ON OFFER" };
  let gain: Gain | undefined;
  if (boon === "rune") {
    const d = RUNES[id];
    run.build.runes = [...(run.build.runes ?? []), { id }];
    if (d.kind === "hull") run.build.hullBonus += d.amount.n;
    else if (d.kind === "belt") run.build.beltCap += d.amount.n;
    else run.gold += pickGold(d, run.build.runes.length, lastWon(run));
  } else if (boon === "part") {
    gain = gainModule(run, id, undefined, offer.partStars ?? 1); // HULL-1d: at the card's star (★2 with HULL_SCALE on)
    queueFuseAnim(run, gain);
  } else run.build.hullBonus += LAST_CHANCE_HULL;
  const day = run.lastChance!.day;
  run.lastChance = { day, boon, ...(boon !== "hull" ? { id } : {}) };
  const row = run.history.find((h) => h.day === day && h.lastChance);
  if (row) row.lastChance = { lives: row.lastChance!.lives, boon, ...(boon !== "hull" ? { id } : {}) };
  return { ok: true, ...(gain ? { gain } : {}) };
}

export function battleSeed(run: Run): number {
  return hashSeed(run.seed, "battle", run.day);
}

// ---- NPC-1 (REQ-BFG-077): REFIT before every dusk has no shop (NPC_DAY on) -------------------------------------------

/** What a buy, a sale, a reroll, a pack or an upgrade says in REFIT with NPC_DAY on. */
export const REFIT_NO_SHOP = "REFIT: THE CARAVAN HAS MOVED ON";

/** NPC-1: is the shop shut? With NPC_DAY on, in REFIT (and at dusk): no buying, selling, rerolling, packs or upgrades;
 *  moving, swapping, re-belting, fitting and placing cargo stay. Off: never (0.9.7's road REFIT keeps its sales). */
export function shopShut(run: Pick<Run, "stage">): boolean {
  return npcDayRules() && (run.stage === "refit" || run.stage === "battle");
}

function rollRarity(rng: Rng, day: number): Rarity {
  const w = rarityWeights(day);
  return rng.weighted(RARITIES, (r) => w[r]);
}

const ALL_MERCHANTS: MerchantId[] = ["ironmonger", "tinker", "alchemist", "gunsmith", "scrapper", "quartermaster", "arcane"];

/** ARSENAL.md §5.2 step 1, base weight before the regular-trade and variety modifiers. */
function baseMerchantWeight(m: MerchantId, day: number): number {
  if (m === "scrapper" || m === "quartermaster") return 2;
  if (m === "arcane") return day <= 2 ? 0 : day <= 4 ? 1 : 2;
  return 3; // ironmonger, tinker, alchemist, gunsmith
}

/**
 * 0.6.2s (REQ-BFG-031 step 5, REQ-BFG-021): a hull's free 1-star starting turret (S7 `free`, in cargo or installed),
 * which the shop never counts as owned. The starting turrets differ by hero, and a fresh run's caravan must be
 * identical for every hero, so fresh-first, the merchant bias and the familiar slot can't read them. A free copy
 * merged with a bought one (2+ stars) counts: the player bought into it.
 */
const startingCopy = (c: { stars?: number; free?: boolean }): boolean => !!c.free && starsOf(c) <= 1;

/** Every star level (1-3) `def` is currently held at, across cargo, the deck and turrets. 0.6.2s (REQ-BFG-031 step 5):
 *  and every turret copy the player bought, in cargo or installed (deck.ts turretList), never a startingCopy. */
function starLevelsOwned(run: Run, def: string): Set<number> {
  const s = new Set<number>();
  for (const i of run.inventory) if (i.def === def && !startingCopy(i)) s.add(starsOf(i));
  for (const i of run.build.items) if (i.def === def) s.add(starsOf(i));
  for (const i of run.build.mods) if (i.def === def) s.add(starsOf(i));
  for (const t of turretList(run.build)) if (t.def === def && !startingCopy(t)) s.add(starsOf(t));
  return s;
}

/** Fresh-first's "owned": a copy of `def` counts where starLevelsOwned counts it (so never a startingCopy). */
function ownsDef(run: Run, def: string): boolean {
  return starLevelsOwned(run, def).size > 0;
}

/**
 * 0.8.0 I1 M3 (DESIGN-wave3.md 4.2): what `m` stocks for this run on `day`: with the per-run draw, only the run's wares
 * unlocked by `day` (wares.ts unlocked; supplies are always on sale); a run without wares (a save from before 0.8.0)
 * keeps today's rule, its whole stock.
 */
function stockOf(run: Run, m: MerchantId, day: number): ItemDef[] {
  const stock = itemsSoldBy(m);
  return run.wares ? stock.filter((d) => unlocked(run, d.id, day)) : stock;
}

/** What `m` can sell on `day`: its stock without legendaries before day 4 (the shop's day gate). 0.8.0 I1 M3: the run's
 *  stock (stockOf: its unlocked wares under the per-run draw). */
function dayPool(run: Run, m: MerchantId, day: number): ItemDef[] {
  // BOTS-X (REQ-BFG-069): a run without wares holds the sustain pieces to the first sustain day too (wares.ts unlockDay
  // holds them for every run with wares); switch off, itemsSoldBy lists none, so this filter keeps every part as before
  // GATES-1 (REQ-BFG-052): and the three gates to GATES_FIRST_DAY (never day 1's shop); switch off, itemsSoldBy lists none either
  return stockOf(run, m, day).filter((d) => (d.rarity !== "legendary" || day >= 4) && (!isSustain(d.id) || day >= SUSTAIN_FIRST_DAY) && (!isGatesPiece(d.id) || day >= GATES_FIRST_DAY));
}

/** ARSENAL.md §5.2 step 1: base weight, +1 per owned 1★ fusible part the merchant sells (max +3),
 *  x0.5 if `m` rode in yesterday's final caravan. A merchant with no stock today never appears
 *  (0.6.1r N5: judged on the day's pool, so an all-legendary stock waits for day 4; the bias still
 *  counts every part it sells, so no weight changes for today's catalogue). 0.8.0 I1 M3: under the per-run draw "every
 *  part it sells" is the run's stock (stockOf); without wares it is the whole catalogue stock, as before. */
function merchantWeight(run: Run, m: MerchantId, day: number): number {
  const stock = stockOf(run, m, day);
  if (!dayPool(run, m, day).length) return 0;
  const base = baseMerchantWeight(m, day);
  if (base <= 0) return 0;
  let bias = 0;
  for (const d of stock) if (fusible(d.id) && starLevelsOwned(run, d.id).has(1)) bias++;
  const w = base + Math.min(3, bias);
  return run.lastMerchants?.includes(m) ? w * 0.5 : w;
}

/** Draw `n` distinct merchants by weight (no replacement), then guarantee a gate seller. */
function pickMerchants(run: Run, rng: Rng, n: number): MerchantId[] {
  const remaining = ALL_MERCHANTS.slice();
  const chosen: MerchantId[] = [];
  for (let i = 0; i < n && remaining.length; i++) {
    const weights = remaining.map((m) => merchantWeight(run, m, run.day));
    if (weights.every((w) => w <= 0)) break;
    const pick = rng.weighted(remaining, (m) => merchantWeight(run, m, run.day));
    chosen.push(pick);
    remaining.splice(remaining.indexOf(pick), 1);
  }
  if (!chosen.includes("tinker") && !chosen.includes("alchemist")) {
    // 0.6.1r N5: only a gate seller with something to sell today; never index -1 of an empty list
    const seller = (["tinker", "alchemist"] as const).find((m) => dayPool(run, m, run.day).length);
    if (seller && chosen.length) chosen[chosen.length - 1] = seller;
    else if (seller) chosen.push(seller);
  }
  return chosen;
}

/** ARSENAL.md §5.2 step 3: the familiar slot's chance by day. */
function familiarChance(day: number): number {
  if (day <= 1) return 0;
  if (day <= 3) return 0.35;
  if (day <= 6) return 0.5;
  return 0.6; // days 7-10
}

interface FamiliarCandidate { merchant: MerchantId; def: string; weight: number }

/** Owned fusible parts a merchant in this caravan sells, weighted 0.5 (only 1★ owned) / 4 (only 2★
 *  owned) / 12 (1★ and 2★ owned: the next copy chains to 3★) / dropped at 0 (only 3★ owned). 0.8.0 I1 M3: what it sells
 *  this run today (stockOf: its unlocked wares under the per-run draw). */
function familiarCandidates(run: Run, merchants: MerchantId[]): FamiliarCandidate[] {
  const out: FamiliarCandidate[] = [];
  for (const m of merchants) {
    for (const d of stockOf(run, m, run.day)) {
      if (!fusible(d.id)) continue;
      if (d.rarity === "legendary" && run.day < 4) continue; // review-061 N1: the shop's legendary day gate
      const levels = starLevelsOwned(run, d.id);
      const weight = levels.has(1) && levels.has(2) ? 12 : levels.has(2) ? 4 : levels.has(1) ? 0.5 : 0;
      if (weight > 0) out.push({ merchant: m, def: d.id, weight });
    }
  }
  return out;
}

/**
 * ARSENAL.md §5.2, on `hashSeed(seed, "shop", day, rerolls)`. Merchants are drawn by weight
 * (step 1); regular slots are fresh-first (step 2: the rolled rarity and a def the player doesn't
 * own, falling back to any rarity, then to owned parts); at most one familiar slot is spliced in
 * after (step 3), drawn from owned fusible parts and weighted toward a 3★ chain.
 */
export function rollShop(run: Run): void {
  const rng = new Rng(hashSeed(run.seed, "shop", run.day, run.shop.rerolls));
  const nWagons = rng.chance(0.5) ? 2 : 3;
  const merchants = pickMerchants(run, rng, nWagons);
  const wagons: Wagon[] = merchants.map((m) => ({ merchant: m, offers: [] }));
  const priceOf = (d: { price: number }) => Math.max(1, d.price - (run.shop.discount || 0));
  // 0.6.1r N5: slots go round the wagons actually drawn (fewer stocked merchants than wagons can't
  // index past the list), and a slot with nothing to sell stays empty rather than rng.pick([]).
  // 0.6.1c M0 (the Prime's call): a wagon never offers one part twice, so it holds at most as many
  // offers as its merchant has distinct parts today. A regular slot whose wagon has no fresh def left
  // goes to the next wagon round (slot+1, slot+2, ...) that has one and draws there, fresh-first as
  // usual; if no wagon has one, the slot stays empty. rollRarity is still drawn once per slot, in slot
  // order, so a caravan whose wagons never repeated a def keeps its stream and its offers.
  const hasFresh = (wg: Wagon) => dayPool(run, wg.merchant, run.day).some((d) => !wg.offers.some((o) => o.def === d.id));
  for (let slot = 0; slot < OFFERS && wagons.length; slot++) {
    const rarity = rollRarity(rng, run.day);
    let w: Wagon | undefined;
    for (let k = 0; k < wagons.length && !w; k++) {
      const cand = wagons[(slot + k) % wagons.length];
      if (hasFresh(cand)) w = cand;
    }
    if (!w) continue;
    const wagon = w;
    const pool = dayPool(run, wagon.merchant, run.day);
    const fresh = (d: ItemDef) => !wagon.offers.some((o) => o.def === d.id);
    let choices = pool.filter((d) => d.rarity === rarity && !ownsDef(run, d.id) && fresh(d));
    if (!choices.length) choices = pool.filter((d) => !ownsDef(run, d.id) && fresh(d));
    if (!choices.length) choices = pool.filter(fresh);
    // 0.6.2s (REQ-BFG-031 step 5, REQ-BFG-033): drawn by FAMILY_WEIGHT (a turret weighs half); with no turret among
    // the choices every weight is 1 and this is exactly the even pick it was, on the same one draw of the stream
    const d = rng.weighted(choices, (c) => FAMILY_WEIGHT[c.kind]);
    wagon.offers.push({ def: d.id, price: priceOf(d), sold: false });
  }
  if (rng.chance(familiarChance(run.day))) {
    const candidates = familiarCandidates(run, merchants);
    if (candidates.length) {
      const pick = rng.weighted(candidates, (c) => c.weight);
      const w = wagons.find((wg) => wg.merchant === pick.merchant)!;
      let slotIdx = rng.int(w.offers.length); // drawn either way: the stream keeps its order
      const same = w.offers.findIndex((o) => o.def === pick.def);
      if (same >= 0) slotIdx = same; // review-061 F3: never two offers of one def in a wagon
      w.offers[slotIdx] = { def: pick.def, price: priceOf(ITEMS[pick.def]), sold: false };
    }
  }
  run.shop.wagons = wagons.filter((w) => w.offers.length > 0); // 0.6.1r N5: an empty wagon doesn't ride
  if (firstRunGated(run)) firstRunCaravan(run, priceOf); // FIRSTDAY-1 (F3): a first run's days 1-2, after the base's roll
}

export type ShopBadge = { kind: "merge"; toStars: number } | { kind: "wait" } | { kind: "max" };

/**
 * The live MERGE badge (ARSENAL.md §8.1), never stored on the offer: recomputed from `mergePreview`
 * every frame, because one purchase can change another card's badge. "wait" is the grey +1 ★2 (a
 * 2★ is owned but no 1★, so this copy will not merge yet); "max" means only 3★ copies are owned.
 */
export function shopBadge(run: Run, def: string): ShopBadge | null {
  const preview = mergePreview(run, def);
  if (preview) return { kind: "merge", toStars: preview.toStars };
  const levels = starLevelsOwned(run, def);
  if (levels.has(2)) return { kind: "wait" };
  if (levels.size > 0) return { kind: "max" };
  return null;
}

/**
 * 0.6.1d2: queue a gainModule chain's steps for the build screen's merge animation, cosmetic and
 * next to fuseFx's toasts. Call at every gainModule call site (buyOffer here; road.ts and
 * events.ts's item gains). Every queued step's `survivor`/`where` is normalized to the chain's
 * FINAL resting copy (gain.survivor/gain.where): by the time the animation plays, an earlier
 * step's own survivor may itself have been absorbed into a later step, so only the final uid is
 * guaranteed to still exist. `stars` still rises step by step, so a chain still animates in place
 * as two pulses (★2 then ★3) at the one spot that ends up holding the part.
 */
export function queueFuseAnim(run: Run, gain: Gain): void {
  if (!gain.steps.length) return;
  const queued = gain.steps.map((s) => ({ ...s, survivor: gain.survivor, where: gain.where }));
  run.fuseAnim = [...(run.fuseAnim ?? []), ...queued];
}

/** Reroll the caravan: a free reroll (scout) first, else REROLL_COST gold. Same roll sequence either way. */
export function reroll(run: Run): boolean {
  if (shopShut(run)) return false; // NPC-1: no reroll in REFIT
  if ((run.shop.free || 0) > 0) run.shop.free--;
  else if (run.gold < REROLL_COST) return false;
  else run.gold -= REROLL_COST;
  run.shop.rerolls++;
  rollShop(run);
  return true;
}

export interface BuyResult {
  ok: boolean;
  reason?: string;
  item?: InvItem; // the bought module when it ends up in cargo (absent for supplies or a placed result)
  consumed?: string;
  gain?: Gain; // 0.6.1a: where the bought module ended up, and the merges it caused
}

/** bb-0.8.3 (REQ-BFG-043 D10): a track's level now, and the next level with its price (absent at UPGRADE_MAX). */
export function nextUpgrade(run: Pick<Run, "build">, track: UpgradeTrack): { level: number; next?: number; price?: number } {
  const level = upgradeLevel(run.build, track);
  return level >= UPGRADE_MAX ? { level } : { level, next: level + 1, price: UPGRADE_PRICE[level + 1] };
}

/**
 * bb-0.8.3 (REQ-BFG-043 D10, D11): does the track's control show? FACTORY always (the hero's signature factory never
 * leaves the deck); TURRET SPEED while a starting turret is aboard (an installed turret holding the free starting copy,
 * merged or not): with none left nothing would fire faster.
 */
export function upgradeShown(run: Pick<Run, "build">, track: UpgradeTrack): boolean {
  return track === "factory" || turretSlots(run.build).some((s) => !!s.turret?.free);
}

/**
 * bb-0.8.3 (REQ-BFG-043 D10): buy the next level of one of the hero's two upgrade tracks for UPGRADE_PRICE gold (10, 20,
 * then 30: the operator's prices), any time in the caravan, OUTSIDE the shop roll: it takes no offer slot, draws on no
 * random stream and changes nothing the shop shows, so runs and ghosts stay deterministic. Refused at UPGRADE_MAX, with
 * too little gold, and for TURRET SPEED with no starting turret aboard. No refund, ever: the level stays with the run.
 */
export function buyUpgrade(run: Run, track: UpgradeTrack): { ok: boolean; reason?: string; level: number; price?: number } {
  const n = nextUpgrade(run, track);
  if (shopShut(run)) return { ok: false, reason: REFIT_NO_SHOP, level: n.level }; // NPC-1: no buying in REFIT
  if (n.next === undefined || n.price === undefined) return { ok: false, reason: "MAX LEVEL", level: n.level };
  if (!upgradeShown(run, track)) return { ok: false, reason: "NO STARTING TURRET ABOARD", level: n.level };
  if (run.gold < n.price) return { ok: false, reason: `NEED ${n.price - run.gold} MORE GOLD`, level: n.level };
  run.gold -= n.price;
  const now = { ...run.build.upgrades, [track]: n.next };
  // the canonical key order (turret, then factory), as the strict decoder writes it
  run.build.upgrades = { ...(now.turret ? { turret: now.turret } : {}), ...(now.factory ? { factory: now.factory } : {}) };
  return { ok: true, level: n.next, price: n.price };
}

/** bb-0.8.6 (REQ-BFG-051, PACKS P2): a pack's price: its ITEMS entry's (BELT PACK 2, ARMOR PACK 5), flat on every visit
 *  and day: the scout's discount (shop.discount) and free rerolls (shop.free) never apply to a pack. */
export function packPrice(id: PackId): number {
  return ITEMS[PACK_ITEM[id]].price;
}

/** bb-0.8.6 (REQ-BFG-051, PACKS P5): why a pack can't be bought now, as the slot's tap says it ("A BELT PACK COSTS 2G",
 *  "AN ARMOR PACK COSTS 5G"), or undefined when the gold covers it. */
export function packShort(run: Pick<Run, "gold">, id: PackId): string | undefined {
  const d = ITEMS[PACK_ITEM[id]];
  return run.gold < d.price ? `${id === "armor" ? "AN" : "A"} ${d.name} COSTS ${d.price}G` : undefined;
}

/**
 * bb-0.8.6 (REQ-BFG-051, PACKS P1-P2): buy one BELT PACK (+4 to build.beltCap) or ARMOR PACK (+25 to build.hullBonus) at
 * its flat price (packPrice). One of the caravan's two FIXED offers: outside the roll, like buyUpgrade, it takes no offer
 * slot, draws on no random stream and changes nothing the shop shows, so a seed's rolled offers and stream are the same
 * with and without pack buys. Again and again while the gold lasts (no cap, no discount); refused only for gold. The
 * amount lands at once on the build (the save keeps it as it keeps the build and the gold).
 */
export function buyPack(run: Run, id: PackId): { ok: boolean; reason?: string; price: number } {
  const d = ITEMS[PACK_ITEM[id]], price = packPrice(id);
  if (shopShut(run)) return { ok: false, reason: REFIT_NO_SHOP, price }; // NPC-1: no buying in REFIT
  const short = packShort(run, id);
  if (short) return { ok: false, reason: short, price };
  run.gold -= price;
  if (d.supply?.belt) run.build.beltCap += d.supply.belt;
  if (d.supply?.hull) run.build.hullBonus += d.supply.hull;
  return { ok: true, price };
}

/**
 * Purchase exactly the offered item; a sold slot can never charge twice (spec §17). 0.6.1a: the
 * module enters through gainModule (1 star, then merged). `at` is a drag's drop target (a deck cell
 * the caller checked, or a turret). A drop that would merge ignores the target (buy plus merge,
 * ARSENAL.md §4.1 rule 5), except when every twin is in cargo: then the copy is placed at the target
 * first and the merge lands where it was dropped.
 */
export function buyOffer(run: Run, wagon: number, slot: number, at?: GainAt): BuyResult {
  if (shopShut(run)) return { ok: false, reason: REFIT_NO_SHOP }; // NPC-1: no buying in REFIT
  const w = run.shop.wagons[wagon];
  const o = w?.offers[slot];
  if (!o) return { ok: false, reason: "NO SUCH OFFER" };
  if (o.sold) return { ok: false, reason: "SOLD" };
  if (run.gold < o.price) return { ok: false, reason: `NEED ${o.price - run.gold} MORE GOLD` };
  const d = ITEMS[o.def];
  const pv = at && d.kind !== "supply" ? mergePreview(run, o.def) : null;
  run.gold -= o.price;
  o.sold = true;
  if (d.kind === "supply") {
    if (d.supply?.belt) run.build.beltCap += d.supply.belt;
    if (d.supply?.hull) run.build.hullBonus += d.supply.hull;
    return { ok: true, consumed: d.id };
  }
  // FIRSTDAY-1 (F3): a first run's first rig bought on day 1 (dawn 2 offers a copy: firstRunCaravan)
  if (d.kind === "gate" && run.day === 1 && run.firstRig === undefined && firstRunGated(run)) run.firstRig = d.id;
  const gain = gainModule(run, o.def, pv && pv.where !== "cargo" ? undefined : at);
  queueFuseAnim(run, gain);
  const item = gain.where === "cargo" ? run.inventory.find((i) => i.uid === gain.survivor) : undefined;
  return { ok: true, item, gain };
}

export function takeFromInventory(run: Run, uid: number): InvItem | undefined {
  const i = run.inventory.findIndex((it) => it.uid === uid);
  if (i < 0) return undefined;
  return run.inventory.splice(i, 1)[0];
}

export function returnToInventory(run: Run, item: InvItem): void {
  if (!run.inventory.some((it) => it.uid === item.uid)) run.inventory.push(item);
}

/** Store a placed deck item back in the cargo tray. */
export function storePlaced(run: Run, uid: number): boolean {
  const p = run.build.items.find((q) => q.uid === uid);
  if (!p) return false;
  const d = ITEMS[p.def];
  if (Object.values(HEROES).some((h) => h.factory === d.id)) return false; // every hero's signature factory stays aboard
  removeItem(run.build, uid);
  run.inventory.push({ uid, def: p.def, ...starField(starsOf(p)) }); // 0.6.1a: moving never fuses; stars ride along
  return true;
}

/**
 * GATES-1 (REQ-BFG-057): a gate (FUSER, SCATTER MILL, SMELTER) stands ON a belt tile, so a belt that goes (rerouted, deleted,
 * or gone with its factory) leaves it standing on nothing. Each such gate goes back to cargo, as a part stored from the deck
 * is (storePlaced: stars kept, no refund, no fuse). Returns their names, in order; [] for every deck without a gate. The
 * build screen calls it whenever the build changes (build.ts touched), so no saved run holds a stranded gate.
 */
export function releaseStranded(run: Run): string[] {
  const names: string[] = [];
  for (const p of strandedConverters(run.build)) {
    const name = ITEMS[p.def].name;
    if (storePlaced(run, p.uid)) names.push(name);
  }
  return names;
}

/**
 * 0.6.2 BELTSIDE (ref/DESIGN-beltside.md R4, B2): turn a placed rig a quarter turn clockwise; free while
 * preparing. False for anything that is not a rig, and for an X rig, which faces every side.
 */
export function rotateRig(run: Run, uid: number): boolean {
  const p = run.build.items.find((q) => q.uid === uid);
  if (!p || rigShape(p.def) === undefined || rigShape(p.def) === "X") return false;
  // SHAPES-1 (REQ-BFG-086 R1, S2; found by the flip's upload-driver fix): a long rig's turn moves its footprint, so it turns
  // around its anchor only to a turn that fits there (the editor's rule, shapeEdit.ts turnFit): the next one that fits;
  // none fits: it stays put (false). A 1-cell rig turns as before. (The build screen sends shaped pieces to turnFit.)
  if (isShaped(ITEMS[p.def])) {
    for (let k = 1; k < 4; k++) {
      const r = (rotOf(p) + k) % 4;
      if (canPlaceItem(run.build, p.def, p.x, p.y, uid, r).ok) {
        setRot(p, r);
        return true;
      }
    }
    return false;
  }
  setRot(p, rotOf(p) + 1);
  return true;
}

/** Store turret equipment (gear or, 0.6.1b, a bought core: REMOVE CORE) back in cargo, stars kept. */
export function storeMod(run: Run, uid: number): boolean {
  const i = run.build.mods.findIndex((m) => m.uid === uid);
  if (i < 0) return false;
  const m = run.build.mods.splice(i, 1)[0];
  run.inventory.push({ uid: m.uid, def: m.def, ...starField(starsOf(m)) }); // 0.6.1a: never fuses
  return true;
}

/**
 * 0.6.1b: fit turret core `uid` (from cargo, or moved from another turret's socket) into turret `turret`'s
 * socket. A bought core already there goes to cargo: a swap, never the gear rule. Moving never fuses (by the
 * fuse invariant no twin exists). False when `uid` is not a core the run holds or the turret doesn't exist.
 */
export function fitCore(run: Run, uid: number, turret: number): boolean {
  const b = run.build;
  // 0.6.2s (REQ-BFG-031 S4): a core fits an installed turret's socket; an empty TURRET SLOT has no socket
  if (!Number.isInteger(turret) || !turretSlots(b)[turret]?.turret) return false;
  const inCargo = run.inventory.find((i) => i.uid === uid);
  const fitted = b.mods.find((m) => m.uid === uid);
  const def = inCargo?.def ?? fitted?.def;
  if (!def || ITEMS[def]?.kind !== "core") return false;
  if (fitted?.turret === turret) return true;
  const old = coreFor(b, turret);
  if (old) storeMod(run, old.uid);
  if (inCargo) {
    takeFromInventory(run, uid);
    b.mods.push({ uid, def, turret, ...starField(starsOf(inCargo)) });
  } else if (fitted) fitted.turret = turret;
  return true;
}

/** Sell a cargo copy for sellValue(def, stars) = max(1, floor(valueOf / 2)) (0.6.1a). 0.6.2s (S7): a turret sells
 *  for turretSellValue (its value counts a free starting copy as 0); a 1-star starting turret can't be sold (0, kept). */
export function sellInventory(run: Run, uid: number): number {
  if (shopShut(run)) return 0; // NPC-1: no selling in REFIT (nothing changes)
  const held = run.inventory.find((i) => i.uid === uid);
  if (held && isTurretDef(held.def) && !canSellTurret(held)) return 0;
  const it = takeFromInventory(run, uid);
  if (!it) return 0;
  const v = isTurretDef(it.def) ? turretSellValue(it) : sellValue(it.def, starsOf(it));
  run.gold += v;
  return v;
}

// ---- 0.6.2s (REQ-BFG-031 S5): turrets between cargo and the hull's TURRET SLOTS (deck.ts does the work; what it
// hands back goes to cargo with its stars and free flag). Moving never merges.

function backToCargo(run: Run, r: TurretOpResult): void {
  for (const t of r.turrets) run.inventory.push({ uid: t.uid, def: t.def, ...starField(starsOf(t)), ...(t.free ? { free: true } : {}) });
  for (const m of r.mods) run.inventory.push({ uid: m.uid, def: m.def, ...starField(starsOf(m)) });
}

/**
 * SHAPES-1 S5b (REQ-BFG-086; cap's ruling, oracle 7f2a91a61910e167): after any change to the turret slots, every SHAPED
 * piece (a rig of 2+ cells, a factory not 2x2: foot.ts isShaped) that covers a row-0 intake cell of an installed turret
 * goes to cargo by the to-cargo path (storePlaced: the same uid, its stars, a factory's belts with it, never fuses), in
 * ascending uid so seeded runs replay alike. 1-cell rigs and 2x2 factories on an intake stay (S5's ruling, point 2). A
 * turret always goes in. Returns the names of the pieces it sent, for the toast (intakeToast). With SHAPES off nothing is
 * shaped: a no-op, so every pin holds.
 */
export function sweepIntakes(run: Run): string[] {
  if (!shapesRules()) return [];
  const b = run.build;
  const uids = b.items.filter((p) => {
    const d = ITEMS[p.def];
    return !!d && (d.kind === "gate" || d.kind === "factory") && isShaped(d) && cellsOf(p).some((k) => isIntakeCell(b, k));
  }).map((p) => p.uid).sort((x, y) => x - y);
  const out: string[] = [];
  for (const uid of uids) {
    const p = b.items.find((q) => q.uid === uid);
    if (p && storePlaced(run, uid)) out.push(ITEMS[p.def].name);
  }
  return out;
}

/** SHAPES-1 S5b: the sweep's toast (yellow, as CUT LOOSE; cap's words): `NAIL STRIP WENT TO CARGO · TURRET INTAKE`, or
 *  `2 PARTS WENT TO CARGO · TURRET INTAKE`; null when nothing went. */
export function intakeToast(names: readonly string[]): string | null {
  if (!names.length) return null;
  return `${names.length === 1 ? names[0] : `${names.length} PARTS`} WENT TO CARGO · TURRET INTAKE`;
}

/** A turret operation's result, and (SHAPES-1 S5b) the shaped pieces its intake sweep sent to cargo. */
export type RunTurretOp = TurretOpResult & { swept?: string[] };

/** SHAPES-1 S5b: the sweep after a turret operation that went through, its names on the result. */
function swept(run: Run, r: TurretOpResult): RunTurretOp {
  if (!r.ok) return r;
  const names = sweepIntakes(run);
  return names.length ? { ...r, swept: names } : r;
}

/** Install cargo turret `uid` in slot `slot` (an occupied slot swaps: its turret goes to cargo). SHAPES-1 S5b: then the
 *  intake sweep. */
export function installFromCargo(run: Run, uid: number, slot: number): RunTurretOp {
  const it = run.inventory.find((i) => i.uid === uid);
  if (!it || !isTurretDef(it.def)) return { ok: false, reason: "NOT A TURRET IN CARGO", turrets: [], mods: [] };
  const r = installTurret(run.build, it, slot);
  if (!r.ok) return r;
  takeFromInventory(run, uid);
  backToCargo(run, r);
  return swept(run, r);
}

/** Move the turret in slot `from` to slot `to` (an occupied target swaps). SHAPES-1 S5b: then the intake sweep. */
export function moveInstalled(run: Run, from: number, to: number): RunTurretOp {
  const r = moveTurret(run.build, from, to);
  if (r.ok) backToCargo(run, r);
  return swept(run, r);
}

/** Take the turret in slot `slot` to cargo (its slot's core and gear go to cargo too). SHAPES-1 S5b: then the intake
 *  sweep (a removal makes no intake, so it finds none; every turret-slot path runs it). */
export function storeTurret(run: Run, slot: number): RunTurretOp {
  const r = removeTurret(run.build, slot);
  if (r.ok) backToCargo(run, r);
  return swept(run, r);
}

/** Sell the turret in slot `slot` at turretSellValue; the slot's core and gear go to cargo. 0 (nothing changes) when
 *  the slot is empty or holds a 1-star starting turret. */
export function sellInstalled(run: Run, slot: number): number {
  if (shopShut(run)) return 0; // NPC-1: no selling in REFIT (nothing changes)
  const t = turretSlots(run.build)[slot]?.turret;
  if (!t || !canSellTurret(t)) return 0;
  const r = removeTurret(run.build, slot);
  if (!r.ok) return 0;
  for (const m of r.mods) run.inventory.push({ uid: m.uid, def: m.def, ...starField(starsOf(m)) });
  const v = turretSellValue(t);
  run.gold += v;
  sweepIntakes(run); // SHAPES-1 S5b: every turret-slot path runs the sweep (a removal makes no intake: it finds none)
  return v;
}

export function merchantName(m: MerchantId): string {
  return MERCHANTS[m].name;
}
