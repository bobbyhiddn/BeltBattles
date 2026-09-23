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

export { loadRun, migrateRun, saveRun, SAVE_KEY, SAVE_KEY_V3, SAVE_KEY_V4 } from "./save";

export interface InvItem {
  uid: number;
  def: string;
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

/** Where the day stands: dawn caravan, on the road (event), refitting after it, or the dusk fight. */
export type Stage = "caravan" | "event" | "refit" | "battle";

/** Road-event foe modifiers (0.5.0). Kept as the seam for 0.6.0b's warlords: a dusk ghost runs
 *  exactly as submitted, so nothing here is ever applied to it. */
export interface FoeMods {
  day: number;
  boost: number;
  hull: number;
  bounty: number;
}

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
  record?: { wins: number; losses: number; lives: number; runId: string; savedAt: number }; // a pool ghost's stamp
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
  foe: FoeMods | null;
  nextShop: { discount: number; free: number };
  events: TakenEvent[];
  dusk: DuskFoe | null;
}

export const RUN_VERSION = 5;

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
    stage: "caravan", event: null, foe: null, nextShop: { discount: 0, free: 0 }, events: [], dusk: null,
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
  item?: InvItem; // absent for consumed supplies
  consumed?: string;
}

/** Purchase exactly the offered item; a sold slot can never charge twice (spec §17). */
export function buyOffer(run: Run, wagon: number, slot: number): BuyResult {
  const w = run.shop.wagons[wagon];
  const o = w?.offers[slot];
  if (!o) return { ok: false, reason: "NO SUCH OFFER" };
  if (o.sold) return { ok: false, reason: "SOLD" };
  if (run.gold < o.price) return { ok: false, reason: `NEED ${o.price - run.gold} MORE GOLD` };
  run.gold -= o.price;
  o.sold = true;
  const d = ITEMS[o.def];
  if (d.kind === "supply") {
    if (d.supply?.belt) run.build.beltCap += d.supply.belt;
    if (d.supply?.hull) run.build.hullBonus += d.supply.hull;
    return { ok: true, consumed: d.id };
  }
  const item: InvItem = { uid: run.nextUid++, def: o.def };
  run.inventory.push(item);
  return { ok: true, item };
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
  run.inventory.push({ uid, def: p.def });
  return true;
}

export function storeMod(run: Run, uid: number): boolean {
  const i = run.build.mods.findIndex((m) => m.uid === uid);
  if (i < 0) return false;
  const m = run.build.mods.splice(i, 1)[0];
  run.inventory.push({ uid: m.uid, def: m.def });
  return true;
}

export function sellInventory(run: Run, uid: number): number {
  const it = takeFromInventory(run, uid);
  if (!it) return 0;
  const v = sellValue(ITEMS[it.def]);
  run.gold += v;
  return v;
}

export function merchantName(m: MerchantId): string {
  return MERCHANTS[m].name;
}
