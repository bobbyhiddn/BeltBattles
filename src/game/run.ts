// Run state (spec §17, §18): days, gold, lives, owned equipment and the caravan shop. 0.5.0 added
// the road event between the caravan and the battle; 0.6.0 makes a run 10 days, each ending in a
// dusk fight against a ghost (day.ts, ghosts.ts). Saving and migrations live in save.ts.

import { hashSeed, Rng } from "../core/rng";
import {
  ITEMS, MERCHANTS, OFFERS, RARITIES, REROLL_COST, START_GOLD, START_LIVES,
  itemsSoldBy, rarityWeights, sellValue,
  type HeroId, type MerchantId, type Rarity,
} from "../sim/content";
import { removeItem, type Build } from "../sim/deck";
import { startingBuild } from "../sim/ai";
import type { SideStats } from "../sim/battle";
import type { EventId, EventState } from "./eventDefs";
import type { RivalId } from "../sim/rivals";
import type { PendingBounty, PendingSabotage, RoadChoice, WarlordFight, WarlordResult } from "./roadTypes";
import { starField, starsOf } from "../sim/stars";
import { gainModule, mergePreview, type Gain, type GainAt } from "./fuse";

export { loadRun, migrateRun, saveRun, SAVE_KEY, SAVE_KEY_V3, SAVE_KEY_V4, SAVE_KEY_V5 } from "./save";
export type { PendingBounty, PendingSabotage, RoadChoice, RoadPick, WarlordFight, WarlordOutcome, WarlordResult, WarlordReward } from "./roadTypes";

export interface InvItem {
  uid: number;
  def: string;
  stars?: number; // 0.6.1a: 2 or 3 after a merge; absent = 1 (never written as 1)
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
  player: SideStats;
  enemy: SideStats;
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
  record?: { wins: number; lives: number; runId: string; playerId: string; createdAt: number }; // a pool ghost's stamp
}

export interface Run {
  version: number;
  seed: number;
  runId: string; // unique per run: a run never meets its own ghosts
  hero: HeroId;
  enemyHero: HeroId; // 0.5.0 warlord hero (the herald's champion; 0.6.0b retargets it)
  day: number; // 1..RUN_DAYS
  gold: number;
  lives: number;
  wins: number;
  losses: number;
  build: Build;
  inventory: InvItem[];
  shop: Shop;
  nextUid: number;
  history: DayResult[];
  over: null | "complete" | "lost";
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
}

export const RUN_VERSION = 6;

let runCounter = 0;
/** A fresh run id: the seed plus the clock and a session counter (unique across quick restarts). */
export function newRunId(seed: number): string {
  return `${(seed >>> 0).toString(36)}-${Date.now().toString(36)}-${(runCounter++).toString(36)}`;
}

export function newRun(hero: HeroId, seed: number, runId = newRunId(seed)): Run {
  const run: Run = {
    version: RUN_VERSION, seed, runId, hero, enemyHero: hero === "furnace" ? "weaver" : "furnace",
    day: 1, gold: START_GOLD, lives: START_LIVES, wins: 0, losses: 0,
    build: startingBuild(hero, 1), inventory: [], shop: { wagons: [], rerolls: 0, discount: 0, free: 0 },
    nextUid: 100, history: [], over: null,
    stage: "caravan", event: null, nextShop: { discount: 0, free: 0 }, events: [], dusk: null,
    road: null, warlord: null, warlords: [], matriarchBeatenOn: null, bounty: null, sabotage: null,
  };
  rollShop(run);
  return run;
}

export function battleSeed(run: Run): number {
  return hashSeed(run.seed, "battle", run.day);
}

function rollRarity(rng: Rng, day: number): Rarity {
  const w = rarityWeights(day);
  return rng.weighted(RARITIES, (r) => w[r]);
}

export function rollShop(run: Run): void {
  const rng = new Rng(hashSeed(run.seed, "shop", run.day, run.shop.rerolls));
  const nWagons = rng.chance(0.5) ? 2 : 3;
  const all: MerchantId[] = rng.shuffle(["ironmonger", "tinker", "alchemist", "gunsmith"] as MerchantId[]);
  const merchants = all.slice(0, nWagons);
  if (!merchants.includes("tinker") && !merchants.includes("alchemist")) merchants[nWagons - 1] = "tinker";
  const wagons: Wagon[] = merchants.map((m) => ({ merchant: m, offers: [] }));
  for (let slot = 0; slot < OFFERS; slot++) {
    const w = wagons[slot % nWagons];
    const pool = itemsSoldBy(w.merchant).filter((d) => d.rarity !== "legendary" || run.day >= 4);
    const rarity = rollRarity(rng, run.day);
    let choices = pool.filter((d) => d.rarity === rarity && !w.offers.some((o) => o.def === d.id));
    if (!choices.length) choices = pool.filter((d) => !w.offers.some((o) => o.def === d.id));
    if (!choices.length) choices = pool;
    const d = rng.pick(choices);
    w.offers.push({ def: d.id, price: Math.max(1, d.price - (run.shop.discount || 0)), sold: false });
  }
  run.shop.wagons = wagons;
}

/** Reroll the caravan: a free reroll (scout) first, else REROLL_COST gold. Same roll sequence either way. */
export function reroll(run: Run): boolean {
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

/**
 * Purchase exactly the offered item; a sold slot can never charge twice (spec §17). 0.6.1a: the
 * module enters through gainModule (1 star, then merged). `at` is a drag's drop target (a deck cell
 * the caller checked, or a turret). A drop that would merge ignores the target (buy plus merge,
 * ARSENAL.md §4.1 rule 5), except when every twin is in cargo: then the copy is placed at the target
 * first and the merge lands where it was dropped.
 */
export function buyOffer(run: Run, wagon: number, slot: number, at?: GainAt): BuyResult {
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
  const gain = gainModule(run, o.def, pv && pv.where !== "cargo" ? undefined : at);
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
  if (d.id === "kiln" || d.id === "loom") return false; // signature factory stays aboard
  removeItem(run.build, uid);
  run.inventory.push({ uid, def: p.def, ...starField(starsOf(p)) }); // 0.6.1a: moving never fuses; stars ride along
  return true;
}

export function storeMod(run: Run, uid: number): boolean {
  const i = run.build.mods.findIndex((m) => m.uid === uid);
  if (i < 0) return false;
  const m = run.build.mods.splice(i, 1)[0];
  run.inventory.push({ uid: m.uid, def: m.def, ...starField(starsOf(m)) }); // 0.6.1a: never fuses
  return true;
}

/** Sell a cargo copy for sellValue(def, stars) = max(1, floor(valueOf / 2)) (0.6.1a). */
export function sellInventory(run: Run, uid: number): number {
  const it = takeFromInventory(run, uid);
  if (!it) return 0;
  const v = sellValue(it.def, starsOf(it));
  run.gold += v;
  return v;
}

export function merchantName(m: MerchantId): string {
  return MERCHANTS[m].name;
}
