// Run state: rounds, gold, lives, owned equipment and the caravan shop (spec §17, §18).

import { hashSeed, Rng } from "../core/rng";
import {
  ITEMS, MERCHANTS, OFFERS, RARITIES, REROLL_COST, RUN_LIVES, RUN_WINS, START_GOLD,
  incomeFor, itemsSoldBy, rarityWeights, sellValue,
  type HeroId, type MerchantId, type Rarity,
} from "../sim/content";
import { removeItem, type Build } from "../sim/deck";
import { startingBuild, warlordBuild } from "../sim/ai";
import type { Side, SideStats } from "../sim/battle";

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
}

export interface RoundResult {
  round: number;
  outcome: "win" | "loss" | "draw";
  income: number;
  time: number;
  player: SideStats;
  enemy: SideStats;
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
}

const SAVE_KEY = "beltbattles.run.v3";
const MAX_ROUNDS = 12;

export function newRun(hero: HeroId, seed: number): Run {
  const run: Run = {
    version: 3, seed, hero, enemyHero: hero === "furnace" ? "weaver" : "furnace",
    round: 1, gold: START_GOLD, lives: RUN_LIVES, wins: 0, losses: 0,
    build: startingBuild(hero, 1), inventory: [], shop: { wagons: [], rerolls: 0 },
    nextUid: 100, history: [], over: null,
  };
  rollShop(run);
  return run;
}

export function enemyBuild(run: Run): Build {
  return warlordBuild(run.enemyHero, run.round);
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
    w.offers.push({ def: d.id, price: d.price, sold: false });
  }
  run.shop.wagons = wagons;
}

export function reroll(run: Run): boolean {
  if (run.gold < REROLL_COST) return false;
  run.gold -= REROLL_COST;
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
  const res: RoundResult = { round: run.round, outcome, income, time, player, enemy };
  run.history.push(res);
  if (outcome === "win") run.wins++;
  if (outcome === "loss") {
    run.losses++;
    run.lives--;
  }
  run.gold += income;
  if (run.wins >= RUN_WINS) run.over = "won";
  else if (run.lives <= 0) run.over = "lost";
  else if (run.round >= MAX_ROUNDS) run.over = run.wins >= run.losses ? "won" : "lost";
  if (!run.over) {
    run.round++;
    run.shop = { wagons: [], rerolls: 0 };
    rollShop(run);
  }
  return res;
}

export function merchantName(m: MerchantId): string {
  return MERCHANTS[m].name;
}

export function saveRun(run: Run | null): void {
  try {
    if (!run || run.over) localStorage.removeItem(SAVE_KEY);
    else localStorage.setItem(SAVE_KEY, JSON.stringify(run));
  } catch {
    /* storage unavailable */
  }
}

export function loadRun(): Run | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as Run;
    if (r.version !== 3 || !r.build || !r.shop) return null;
    return r;
  } catch {
    return null;
  }
}
