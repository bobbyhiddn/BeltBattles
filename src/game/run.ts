// Run state: rounds, gold, lives, owned equipment, the caravan shop (spec §17, §18) and, from
// 0.5.0, the road event between the caravan and the battle (stage, event, foe and next-caravan
// modifiers). Saving and the v3 -> v4 migration live in save.ts.

import { hashSeed, Rng } from "../core/rng";
import {
  ITEMS, MERCHANTS, OFFERS, RARITIES, REROLL_COST, RUN_LIVES, RUN_WINS, START_GOLD,
  incomeFor, itemsSoldBy, rarityWeights, sellValue,
  type HeroId, type MerchantId, type Rarity,
} from "../sim/content";
import { removeItem, type Build } from "../sim/deck";
import { startingBuild, warlordBuild, warlordName } from "../sim/ai";
import type { Side, SideStats } from "../sim/battle";
import type { EventId, EventState } from "./eventDefs";

export { loadRun, migrateRun, saveRun, SAVE_KEY, SAVE_KEY_V3 } from "./save";

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

export interface RoundResult {
  round: number;
  outcome: "win" | "loss" | "draw";
  income: number;
  bounty?: number; // extra gold for beating an accepted challenge (0.5.0)
  time: number;
  player: SideStats;
  enemy: SideStats;
}

/** Where the round stands: shopping, on the road (event), refitting after it, or fighting. */
export type Stage = "caravan" | "event" | "refit" | "battle";

/** This round's foe modifiers from an event: warlord from `boost` rounds ahead, hull change, win bonus. */
export interface FoeMods {
  round: number;
  boost: number;
  hull: number;
  bounty: number;
}

export interface TakenEvent {
  round: number;
  id: EventId;
  choice: string;
  won: boolean;
}

export interface Run {
  version: number;
  seed: number;
  hero: HeroId;
  enemyHero: HeroId;
  round: number;
  gold: number;
  lives: number;
  wins: number;
  losses: number;
  build: Build;
  inventory: InvItem[];
  shop: Shop;
  nextUid: number;
  history: RoundResult[];
  over: null | "won" | "lost";
  // 0.5.0 (save v4)
  stage: Stage;
  event: EventState | null;
  foe: FoeMods | null;
  nextShop: { discount: number; free: number };
  events: TakenEvent[];
}

export const RUN_VERSION = 4;
export const MAX_ROUNDS = 12;

export function newRun(hero: HeroId, seed: number): Run {
  const run: Run = {
    version: RUN_VERSION, seed, hero, enemyHero: hero === "furnace" ? "weaver" : "furnace",
    round: 1, gold: START_GOLD, lives: RUN_LIVES, wins: 0, losses: 0,
    build: startingBuild(hero, 1), inventory: [], shop: { wagons: [], rerolls: 0, discount: 0, free: 0 },
    nextUid: 100, history: [], over: null,
    stage: "caravan", event: null, foe: null, nextShop: { discount: 0, free: 0 }, events: [],
  };
  rollShop(run);
  return run;
}

/** This round's event foe modifiers, if any. */
export function activeFoe(run: Run): FoeMods | null {
  return run.foe && run.foe.round === run.round ? run.foe : null;
}

/** The warlord this round: an accepted challenge brings the build from `boost` rounds ahead. */
export function enemyBuild(run: Run): Build {
  const f = activeFoe(run);
  const b = warlordBuild(run.enemyHero, run.round + (f?.boost ?? 0));
  if (f?.hull) b.hullBonus += f.hull;
  return b;
}

export function foeName(run: Run): string {
  const f = activeFoe(run);
  const name = warlordName(run.enemyHero, run.round + (f?.boost ?? 0));
  return f?.boost ? `ELITE ${name}` : name;
}

export function battleSeed(run: Run): number {
  return hashSeed(run.seed, "battle", run.round);
}

function rollRarity(rng: Rng, round: number): Rarity {
  const w = rarityWeights(round);
  return rng.weighted(RARITIES, (r) => w[r]);
}

export function rollShop(run: Run): void {
  const rng = new Rng(hashSeed(run.seed, "shop", run.round, run.shop.rerolls));
  const nWagons = rng.chance(0.5) ? 2 : 3;
  const all: MerchantId[] = rng.shuffle(["ironmonger", "tinker", "alchemist", "gunsmith"] as MerchantId[]);
  const merchants = all.slice(0, nWagons);
  if (!merchants.includes("tinker") && !merchants.includes("alchemist")) merchants[nWagons - 1] = "tinker";
  const wagons: Wagon[] = merchants.map((m) => ({ merchant: m, offers: [] }));
  for (let slot = 0; slot < OFFERS; slot++) {
    const w = wagons[slot % nWagons];
    const pool = itemsSoldBy(w.merchant).filter((d) => d.rarity !== "legendary" || run.round >= 4);
    const rarity = rollRarity(rng, run.round);
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

export function finishRound(run: Run, winner: Side | -1, time: number, player: SideStats, enemy: SideStats): RoundResult {
  const outcome = winner === 0 ? "win" : winner === 1 ? "loss" : "draw";
  const income = incomeFor(run.round, outcome === "win");
  const bounty = outcome === "win" ? activeFoe(run)?.bounty ?? 0 : 0;
  const res: RoundResult = { round: run.round, outcome, income, bounty, time, player, enemy };
  run.history.push(res);
  if (outcome === "win") run.wins++;
  if (outcome === "loss") {
    run.losses++;
    run.lives--;
  }
  run.gold += income + bounty;
  run.foe = null;
  if (run.wins >= RUN_WINS) run.over = "won";
  else if (run.lives <= 0) run.over = "lost";
  else if (run.round >= MAX_ROUNDS) run.over = run.wins >= run.losses ? "won" : "lost";
  if (!run.over) {
    run.round++;
    run.stage = "caravan";
    run.shop = { wagons: [], rerolls: 0, discount: run.nextShop.discount, free: run.nextShop.free };
    run.nextShop = { discount: 0, free: 0 };
    rollShop(run);
  }
  return res;
}

export function merchantName(m: MerchantId): string {
  return MERCHANTS[m].name;
}
