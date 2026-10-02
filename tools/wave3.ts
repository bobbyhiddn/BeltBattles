// D1 (BeltBattles 0.8.0, the wave-3 design; REQ-BFG-023, 022, 033, 024): the hypothetical-offer extension of the luck
// tool (tools/luckReport.ts). Design and measurement only. Nothing here writes src/, and every change it makes to the
// game's tables lives in memory for one measurement and is undone right after it.
//
// - Family map v2 (M2): member lists, never tags in content.ts. TAGS_TODAY tags the 71 buyable modules of v070-rc into
//   five families; the wave-3 map (tagsFor("wave3")) adds the two new families (TWIN, PLATE) to existing modules and
//   tags the wave-3 modules. Tags are shop hints, so a member list is all a measurement needs.
// - Hypothetical offers (M3, M4): WAVE3 (the 15 wave-3 modules) and PROJ (14 placeholders that take the catalogue to
//   100, the 1.0 projection) join ITEMS in memory (install / withCatalogue) with a PROXY spec made of existing effect
//   fields, so the caravan offers them and the par player can rate them; uninstall deletes them again. A proxy is never
//   the module's design (output-D1/DESIGN-wave3.md has that): it only gives the par player a fair reason to buy it.
// - The per-run draw (M4): wares(runSeed) picks the run's stock (DRAW.active parts, stratified by merchant, kind and
//   rarity) and the day each one unlocks (epics day 2, the ARCANE DEALER day 3, legendaries day 4, two late restocks on
//   days 6 and 8). withDraw makes the game's caravan (run.ts rollShop, through content.ts itemsSoldBy) offer only the
//   unlocked wares, by patching DORMANT_ITEMS.has for one run; the patch is removed after it.
// Measures: the catalogue count (REQ-BFG-022 acceptance 1), the pools (active, day 1, unlock steps), the offer mix by
// day (REQ-BFG-033 part 5), the CHASER's full-set rate per family (luckReport.ts chaserRun; REQ-BFG-033 proof 3) and the
// par player's merges (2-star and 3-star parts at day 10, REQ-BFG-019).
//
// Run (as tools/luckReport.ts; no package.json script, since no existing file may change):
//   npx vite build --ssr tools/wave3.ts --outDir tools/dist/wave3 --emptyOutDir --logLevel warn
//   node tools/dist/wave3/wave3.js --mode m1|m2|m3|m4|merges|m5|all [--runs 2000] [--typical 1000] [--mix 4000] [--seed 1]
//     [--heroes furnace,weaver,foundry,bastion] [--workers 8] [--out ../output-D1/measure]
// Results are keyed by job, so the output never depends on --workers; the same seeds give the same output.

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { hashSeed, Rng } from "../src/core/rng";
import {
  HEROES, ITEMS, MERCHANTS, RARITIES, RUN_DAYS, SHAPE_ARROWS, buyableModules, rigShape,
  type HeroId, type ItemDef, type ItemKind, type MerchantId, type Rarity, type RigShape,
} from "../src/sim/content";
import { DORMANT_ITEMS } from "../src/sim/races/data";
import { newRun, rollShop, type InvItem, type Run } from "../src/game/run";
import { playerRun } from "../src/sim/harness/player";
import { luckMeasures } from "../src/sim/harness/luck";
import { wilson, type Rate } from "../src/sim/harness/stats";
import { chaserRun, offerable, runSeed } from "./luckReport";
import { NPCS, mdPlan, problems } from "./wave3Npcs";

// ---------------------------------------------------------------- family map v2

export type Fam = "FORGE" | "HARASS" | "SWARM" | "BURST" | "TEMPO" | "TWIN" | "PLATE";
export const FAMS_TODAY: readonly Fam[] = ["FORGE", "HARASS", "SWARM", "BURST", "TEMPO"];
export const FAMS_WAVE3: readonly Fam[] = [...FAMS_TODAY, "TWIN", "PLATE"];

/**
 * Family map v2 on today's catalogue (v070-rc, 71 buyable modules): five families, every module tagged (1-3 tags).
 * FORGE folds BURN, EDGE and most of HAUL; HARASS folds SHOCK and GUARD; SWARM folds VOLUME, SPLIT, FRAY and POISON;
 * TEMPO folds TIMING and SPEED; BURST stays. output-D1/DESIGN-wave3.md section M2 gives each tag's reason.
 */
export const TAGS_TODAY: Readonly<Record<string, readonly Fam[]>> = {
  // rigs
  temper: ["FORGE"], whetstone: ["FORGE"], grease: ["TEMPO"], brake: ["FORGE", "TEMPO"], longhaul: ["FORGE", "BURST"],
  coil: ["HARASS"], splitter: ["SWARM"], overdrive: ["TEMPO"], tollbooth: ["HARASS"], sifter: ["HARASS", "FORGE"],
  surge: ["TEMPO", "BURST", "FORGE"], sorting: ["SWARM"], riveter: ["SWARM"], heatjacket: ["FORGE"], venom: ["SWARM", "FORGE"],
  overclocker: ["FORGE", "BURST", "TEMPO"], keg: ["FORGE", "BURST", "TEMPO"], bellows: ["FORGE"], quench: ["FORGE"],
  staticbrush: ["HARASS"], lodestone: ["HARASS", "FORGE"], barbed: ["SWARM", "FORGE"], counterweight: ["FORGE"],
  // factories
  press: ["SWARM"], doublestamp: ["SWARM"], shottower: ["SWARM"], hotswap: ["FORGE", "HARASS"], slagpot: ["FORGE", "BURST"],
  assembly: ["TEMPO", "SWARM"], gantry: ["SWARM"], scrapper: ["HARASS", "SWARM"], sabot: ["HARASS", "BURST"],
  frostbite: ["HARASS"], dragchain: ["HARASS", "TEMPO"], mimic: ["SWARM"], limpet: ["HARASS", "BURST"],
  // mods
  chamber: ["BURST"], calibrate: ["TEMPO"], flak: ["HARASS"], spotter: ["HARASS"], hopper: ["BURST", "TEMPO"],
  mantlet: ["HARASS"], ram: ["BURST"], escapement: ["TEMPO"], longcase: ["FORGE", "TEMPO"],
  // cores
  scatter: ["SWARM"], rotary: ["TEMPO"], pressure: ["SWARM", "BURST"], gatling: ["TEMPO", "SWARM"], hullbreaker: ["BURST"],
  drake: ["FORGE"], salvo: ["BURST"], mortar: ["BURST", "HARASS"], grapnel: ["HARASS"], tesla: ["HARASS"],
  capacitor: ["BURST", "TEMPO"], compound: ["BURST"], lance: ["HARASS", "BURST"],
  // turrets (class: heavy BURST, light SWARM; the fast ones TEMPO)
  scrapcannon: ["BURST"], rampart: ["BURST", "TEMPO"], dartgun: ["SWARM"], spikegun: ["SWARM"], carronade: ["SWARM"],
  swivel: ["TEMPO"], twinneedle: ["SWARM"], hailgun: ["SWARM", "TEMPO"], deckgun: ["BURST"], railgun: ["TEMPO"],
  bombard: ["BURST"], siegegun: ["BURST"], thunderer: ["BURST"],
};

/** Wave 3's new families on existing modules: TWIN (every turret that takes a belt on both columns, and the pair
 *  pieces), PLATE (the guards and the repair rig). */
export const ADD_WAVE3: Readonly<Record<string, readonly Fam[]>> = {
  scrapcannon: ["TWIN"], rampart: ["TWIN"], carronade: ["TWIN"], swivel: ["TWIN"], twinneedle: ["TWIN"], deckgun: ["TWIN"],
  railgun: ["TWIN"], bombard: ["TWIN"], siegegun: ["TWIN"], thunderer: ["TWIN"], compound: ["TWIN"], chamber: ["TWIN"],
  gantry: ["TWIN"],
  tollbooth: ["PLATE"], flak: ["PLATE"], mantlet: ["PLATE"], sifter: ["PLATE"], riveter: ["PLATE"],
};

// ---------------------------------------------------------------- hypothetical modules (in memory only)

/** A hypothetical module: what the caravan needs (kind, rarity, price, merchant, shape), its v2 tags, and a PROXY spec
 *  of existing effect fields that the par player can rate (never the design: DESIGN-wave3.md has that). */
export interface Hypo {
  id: string;
  name: string;
  kind: ItemKind;
  rarity: Rarity;
  price: number;
  merchant: MerchantId;
  shape?: RigShape;
  tags: readonly Fam[];
  proxy: Pick<ItemDef, "gate" | "factory" | "core" | "mod" | "levels">;
  why: string; // what the proxy stands for
}

const lv = <T extends object>(k: "gate" | "factory" | "core" | "mod", two: T, three: T) => ({ 2: { [k]: two }, 3: { [k]: three } });

/** Wave 3: 15 modules (8 rigs, 2 factories, 2 cores, 3 mods). DESIGN-wave3.md section M3 is their full spec. */
export const WAVE3: readonly Hypo[] = [
  { id: "plateroller", name: "PLATE ROLLER", kind: "gate", rarity: "common", price: 3, merchant: "ironmonger", shape: "I", tags: ["PLATE", "SWARM"],
    proxy: { gate: { repair: 0.5 }, levels: lv("gate", { repair: 1.1 }, { repair: 1.75 }) }, why: "plating per payload, rated as RIVETER's repair" },
  { id: "twingauge", name: "TWIN GAUGE", kind: "gate", rarity: "common", price: 3, merchant: "tinker", shape: "I", tags: ["TWIN", "FORGE"],
    proxy: { gate: { flat: 1.5 }, levels: lv("gate", { flat: 3.3 }, { flat: 5.25 }) }, why: "+1 flat, +2 more on a matched belt: about +1.5" },
  { id: "pincer", name: "PINCER", kind: "gate", rarity: "common", price: 3, merchant: "alchemist", shape: "I", tags: ["FORGE"],
    proxy: { gate: { flat: 1.5 }, levels: lv("gate", { flat: 3.3 }, { flat: 5.25 }) }, why: "+1, and +2 for each other rig on its tile: about +1.5" },
  { id: "braceframe", name: "BRACE FRAME", kind: "gate", rarity: "rare", price: 5, merchant: "ironmonger", shape: "L", tags: ["PLATE", "HARASS"],
    proxy: { gate: { toll: 2 }, levels: lv("gate", { toll: 4 }, { toll: 7 }) }, why: "a guard, rated as TOLLBOOTH's" },
  { id: "twinlatch", name: "TWIN LATCH", kind: "gate", rarity: "rare", price: 6, merchant: "tinker", shape: "II", tags: ["TWIN", "TEMPO"],
    proxy: { gate: { flat: 1 }, levels: lv("gate", { flat: 2.2 }, { flat: 3.5 }) }, why: "+1 on each payload it releases" },
  { id: "stoker", name: "STOKER", kind: "gate", rarity: "rare", price: 5, merchant: "scrapper", shape: "II", tags: ["TEMPO", "SWARM"],
    proxy: { gate: { flat: 1 }, levels: lv("gate", { flat: 2.2 }, { flat: 3.5 }) }, why: "a factory 20% faster: about +1 per payload" },
  { id: "platebreaker", name: "PLATE BREAKER", kind: "gate", rarity: "epic", price: 7, merchant: "scrapper", shape: "T", tags: ["PLATE", "FORGE"],
    proxy: { gate: { flat: 3 }, levels: lv("gate", { flat: 6.6 }, { flat: 10.5 }) }, why: "spends plating for +4: about +3" },
  { id: "shieldwall", name: "SHIELD WALL", kind: "gate", rarity: "legendary", price: 10, merchant: "ironmonger", shape: "X", tags: ["PLATE", "FORGE"],
    proxy: { gate: { flat: 1, repair: 1 }, levels: lv("gate", { flat: 2.2, repair: 2.2 }, { flat: 3.5, repair: 3.5 }) }, why: "plating and damage per payload" },
  { id: "twinmould", name: "TWIN MOULD", kind: "factory", rarity: "rare", price: 7, merchant: "tinker", tags: ["TWIN", "SWARM"],
    proxy: { factory: { ammo: "plain", interval: 1.8, outputs: 2 }, levels: lv("factory", { base: 5 }, { interval: 1.4, outputs: 3 }) }, why: "two plain slugs per cast, one on each belt" },
  { id: "armorpress", name: "ARMOR PRESS", kind: "factory", rarity: "epic", price: 8, merchant: "ironmonger", tags: ["PLATE", "SWARM"],
    proxy: { factory: { ammo: "plain", interval: 1.8, outputs: 1 }, levels: lv("factory", { interval: 1.6 }, { interval: 1.4 }) }, why: "plain slugs; its plating is unrated" },
  { id: "anvil", name: "ANVIL BREECH", kind: "core", rarity: "rare", price: 6, merchant: "ironmonger", tags: ["PLATE", "BURST"],
    proxy: { core: { routine: "hullbreaker", hullMul: 1 } }, why: "a bought core: the rating's NOMINAL credit" },
  { id: "steambreech", name: "STEAM BREECH", kind: "core", rarity: "common", price: 4, merchant: "gunsmith", tags: ["PLATE", "TEMPO"],
    proxy: { core: { routine: "hullbreaker", hullMul: 1 } }, why: "a bought core: the rating's NOMINAL credit" },
  { id: "twintrigger", name: "TWIN TRIGGER", kind: "mod", rarity: "rare", price: 5, merchant: "gunsmith", tags: ["TWIN", "TEMPO"],
    proxy: { mod: {} }, why: "gear the rating can't compute: NOMINAL credit" },
  { id: "spallcatcher", name: "SPALL CATCHER", kind: "mod", rarity: "rare", price: 5, merchant: "quartermaster", tags: ["PLATE", "BURST"],
    proxy: { mod: {} }, why: "gear the rating can't compute: NOMINAL credit" },
  { id: "seamwelder", name: "SEAM WELDER", kind: "mod", rarity: "rare", price: 5, merchant: "arcane", tags: ["TWIN", "PLATE"],
    proxy: { mod: {} }, why: "gear the rating can't compute: NOMINAL credit" },
];

/** A copy of an existing module's spec (effect fields and star levels) as a proxy. */
const clone = (id: string): Hypo["proxy"] => {
  const d = ITEMS[id];
  return JSON.parse(JSON.stringify({ gate: d.gate, factory: d.factory, core: d.core, mod: d.mod, levels: d.levels }));
};

/** The 1.0 projection (M4): 14 placeholders after wave 3 take the catalogue to 100, in wave 3's mix (rigs first). Each
 *  copies an existing module's spec, so it fights and rates like it; they stand for the 0.9.0 and 0.10.0 waves. */
export const PROJ: readonly Hypo[] = [
  ["proj01", "gate", "common", 3, "alchemist", ["FORGE"], "temper"],
  ["proj02", "gate", "common", 3, "tinker", ["FORGE", "BURST"], "whetstone"],
  ["proj03", "gate", "rare", 5, "alchemist", ["HARASS"], "coil"],
  ["proj04", "gate", "rare", 4, "tinker", ["FORGE"], "quench"],
  ["proj05", "gate", "rare", 4, "quartermaster", ["SWARM"], "barbed"],
  ["proj06", "gate", "rare", 5, "ironmonger", ["PLATE"], "riveter"],
  ["proj07", "gate", "epic", 7, "scrapper", ["SWARM", "TWIN"], "sorting"],
  ["proj08", "gate", "legendary", 10, "arcane", ["TEMPO"], "overdrive"],
  ["proj09", "factory", "rare", 6, "scrapper", ["SWARM"], "shottower"],
  ["proj10", "factory", "epic", 8, "ironmonger", ["HARASS", "BURST"], "limpet"],
  ["proj11", "core", "common", 4, "gunsmith", ["SWARM"], "scatter"],
  ["proj12", "core", "rare", 6, "arcane", ["BURST", "HARASS"], "mortar"],
  ["proj13", "mod", "rare", 5, "gunsmith", ["TEMPO"], "calibrate"],
  ["proj14", "mod", "rare", 5, "quartermaster", ["HARASS", "PLATE"], "flak"],
].map(([id, kind, rarity, price, merchant, tags, from]) => ({
  id: id as string, name: `PROJECTION ${(id as string).slice(4)}`, kind: kind as ItemKind, rarity: rarity as Rarity,
  price: price as number, merchant: merchant as MerchantId, tags: tags as Fam[], proxy: clone(from as string), why: `a copy of ${(from as string).toUpperCase()}`,
}));

export type Variant = "today" | "wave3" | "p100";
export const VARIANTS: readonly Variant[] = ["today", "wave3", "p100"];
const hyposOf = (v: Variant): readonly Hypo[] => (v === "today" ? [] : v === "wave3" ? WAVE3 : [...WAVE3, ...PROJ]);

/** The variant's tag map: TAGS_TODAY, plus wave 3's (ADD_WAVE3 and the wave-3 modules' own), plus the projection's. */
export function tagsFor(v: Variant): Record<string, Fam[]> {
  const out: Record<string, Fam[]> = {};
  for (const [id, t] of Object.entries(TAGS_TODAY)) out[id] = [...t];
  if (v === "today") return out;
  for (const [id, t] of Object.entries(ADD_WAVE3)) out[id] = [...out[id], ...t];
  for (const h of hyposOf(v)) out[h.id] = [...h.tags];
  return out;
}
export const famsFor = (v: Variant): readonly Fam[] => (v === "today" ? FAMS_TODAY : FAMS_WAVE3);

const ADDED: string[] = [];

/** Add the variant's hypothetical modules to ITEMS (in memory). Throws if one is already there. */
export function install(v: Variant): void {
  if (ADDED.length) throw new Error(`wave3: ${ADDED.length} hypothetical modules are already installed`);
  for (const h of hyposOf(v)) {
    if (Object.prototype.hasOwnProperty.call(ITEMS, h.id)) throw new Error(`wave3: ${h.id} is already in ITEMS`);
    ITEMS[h.id] = {
      id: h.id, name: h.name, kind: h.kind, rarity: h.rarity, price: h.price, merchant: h.merchant,
      size: h.kind === "factory" || h.kind === "turret" ? 2 : 1, desc: [h.name],
      ...(h.shape ? { shape: h.shape } : {}),
      ...JSON.parse(JSON.stringify(h.proxy)),
    } as ItemDef;
    ADDED.push(h.id);
  }
}

/** Remove every hypothetical module again. */
export function uninstall(): void {
  for (const id of ADDED.splice(0)) delete ITEMS[id];
}

export function withCatalogue<T>(v: Variant, fn: () => T): T {
  install(v);
  try {
    return fn();
  } finally {
    uninstall();
  }
}

// ---------------------------------------------------------------- the catalogue count and the family table

export type Kind = "rig" | "factory" | "core" | "mod" | "turret";
export const KINDS: readonly Kind[] = ["rig", "factory", "core", "mod", "turret"];
export const kind = (id: string): Kind => (ITEMS[id].kind === "gate" ? "rig" : (ITEMS[id].kind as Kind));

/** REQ-BFG-022's count: ITEMS without supplies and hero signatures (each hero's own factory), in ITEMS order. */
export function counted(): string[] {
  const sig = new Set(Object.values(HEROES).map((h) => h.factory));
  return Object.keys(ITEMS).filter((id) => ITEMS[id].kind !== "supply" && !sig.has(id));
}

export interface CatalogueCount {
  items: number; // every ITEMS key
  supplies: string[];
  signatures: string[];
  total: number; // counted (with turrets)
  modules: number; // without turrets
  turrets: number;
  byKind: Record<Kind, number>;
  byRarity: Record<Rarity, number>;
  byRarityModules: Record<Rarity, number>;
  byMerchant: Record<MerchantId, number>;
  byMerchantModules: Record<MerchantId, number>;
  byMerchantKind: Record<MerchantId, Record<Kind, number>>;
  sameAsBuyable: boolean; // counted() equals content.ts buyableModules() (every counted module is stocked)
  gold: number; // one copy of each
}

export function catalogueCount(): CatalogueCount {
  const sig = new Set(Object.values(HEROES).map((h) => h.factory));
  const ids = counted();
  const zero = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
  const merchants = Object.keys(MERCHANTS) as MerchantId[];
  const out: CatalogueCount = {
    items: Object.keys(ITEMS).length,
    supplies: Object.keys(ITEMS).filter((id) => ITEMS[id].kind === "supply"),
    signatures: Object.keys(ITEMS).filter((id) => sig.has(id)),
    total: ids.length, modules: ids.filter((id) => kind(id) !== "turret").length, turrets: ids.filter((id) => kind(id) === "turret").length,
    byKind: zero(KINDS), byRarity: zero(RARITIES), byRarityModules: zero(RARITIES), byMerchant: zero(merchants),
    byMerchantModules: zero(merchants), byMerchantKind: Object.fromEntries(merchants.map((m) => [m, zero(KINDS)])) as Record<MerchantId, Record<Kind, number>>,
    sameAsBuyable: JSON.stringify([...ids].sort()) === JSON.stringify(buyableModules().map((d) => d.id).sort()),
    gold: ids.reduce((s, id) => s + ITEMS[id].price, 0),
  };
  for (const id of ids) {
    const d = ITEMS[id], k = kind(id), m = d.merchant!;
    out.byKind[k]++;
    out.byRarity[d.rarity]++;
    out.byMerchant[m]++;
    out.byMerchantKind[m][k]++;
    if (k !== "turret") {
      out.byRarityModules[d.rarity]++;
      out.byMerchantModules[m]++;
    }
  }
  return out;
}

export interface V2Family {
  fam: Fam;
  members: string[]; // buyable, ITEMS order
  kinds: Kind[];
  gold: number; // one copy of each member
  flag: string | null; // fewer than 12 members or 2 kinds (the Prime's direction; REQ-BFG-023's floor is 5)
}

export interface V2Table {
  variant: Variant;
  buyable: string[];
  families: V2Family[];
  untagged: string[]; // buyable modules with no v2 tag (must be none)
  tagsPerModule: Record<number, number>; // how many modules carry 1, 2, 3 tags
  unknown: string[]; // tagged ids that are not buyable (must be none)
}

/** The v2 family table of the installed variant. */
export function familyTableV2(v: Variant): V2Table {
  const buyable = counted();
  const tags = tagsFor(v);
  const families = famsFor(v).map((fam): V2Family => {
    const members = buyable.filter((id) => (tags[id] ?? []).includes(fam));
    const kinds = KINDS.filter((k) => members.some((m) => kind(m) === k));
    const why = [members.length < 12 ? `${members.length} members (< 12)` : "", kinds.length < 2 ? `${kinds.length} kind (< 2)` : ""].filter(Boolean).join(", ");
    return { fam, members, kinds, gold: members.reduce((s, id) => s + ITEMS[id].price, 0), flag: why || null };
  });
  const tagsPerModule: Record<number, number> = {};
  for (const id of buyable) {
    const n = (tags[id] ?? []).length;
    tagsPerModule[n] = (tagsPerModule[n] ?? 0) + 1;
  }
  return {
    variant: v, buyable, families,
    untagged: buyable.filter((id) => !(tags[id] ?? []).length),
    tagsPerModule,
    unknown: Object.keys(tags).filter((id) => !buyable.includes(id)),
  };
}

// ---------------------------------------------------------------- the per-run draw

/** The per-run draw (M4): `active` parts per run, stratified by merchant, kind and rarity; `late` of them held back
 *  for two restocks; the unlock ladder by rarity and merchant. */
export interface DrawRule {
  active: number;
  late: number;
  lateDays: readonly [number, number];
  epicDay: number;
  arcaneDay: number;
  legendaryDay: number;
}
export const DRAW: DrawRule = { active: 62, late: 12, lateDays: [6, 8], epicDay: 2, arcaneDay: 3, legendaryDay: 4 };

/**
 * Integer quotas summing to `total` in proportion to `sizes`: each group's floor, then the remaining seats by a seeded
 * lottery weighted by the fractions (no group twice), so no group is left out on every run. Hero-blind: `rng` comes
 * from the run seed only.
 */
export function quotas(sizes: readonly number[], total: number, rng: Rng): number[] {
  const sum = sizes.reduce((s, x) => s + x, 0);
  if (total >= sum) return [...sizes];
  const exact = sizes.map((s) => (s * total) / sum);
  const q = exact.map(Math.floor);
  let left = total - q.reduce((s, x) => s + x, 0);
  const cand = exact.map((x, i) => ({ i, w: x - Math.floor(x) })).filter((c) => c.w > 1e-9);
  while (left > 0 && cand.length) {
    const pick = rng.weighted(cand, (c) => c.w);
    q[pick.i]++;
    cand.splice(cand.indexOf(pick), 1);
    left--;
  }
  return q;
}

/** The day a ware unlocks: rarity (epic from epicDay, legendary from legendaryDay), the ARCANE DEALER from arcaneDay
 *  (run.ts gives it no weight before day 3 and offers no legendary before day 4: both kept), and a late restock day. */
export function unlockDay(id: string, late: number | undefined, rule: DrawRule = DRAW): number {
  const d = ITEMS[id];
  let u = d.rarity === "legendary" ? rule.legendaryDay : d.rarity === "epic" ? rule.epicDay : 1;
  if (d.merchant === "arcane") u = Math.max(u, rule.arcaneDay);
  if (late !== undefined) u = Math.max(u, late);
  return u;
}

/**
 * This run's wares: every buyable module the run's caravan can ever offer, with the day it unlocks (ITEMS order).
 * Each merchant carries its share of DRAW.active (its stock x active / catalogue, the remainders by a seeded lottery),
 * spread over its rarities the same way, the parts of each rarity drawn by a seeded shuffle. Then `late` of the wares
 * that are neither legendary nor the ARCANE DEALER's (so those two steps stay whole) wait for the restocks, stratified
 * by kind, alternating between the two restock days. It reads only the run seed and the catalogue, never the hero
 * (REQ-BFG-021).
 */
export function wares(seed: number, rule: DrawRule = DRAW): Map<string, number> {
  const all = buyableModules().map((d) => d.id);
  const merchants = [...new Set(all.map((id) => ITEMS[id].merchant!))].sort();
  const stockOf = (m: MerchantId) => all.filter((id) => ITEMS[id].merchant === m);
  const qm = quotas(merchants.map((m) => stockOf(m).length), Math.min(rule.active, all.length), new Rng(hashSeed(seed, "wares-merchant")));
  const picked = new Set<string>();
  merchants.forEach((m, i) => {
    const stock = stockOf(m);
    const tiers = RARITIES.filter((r) => stock.some((id) => ITEMS[id].rarity === r));
    const qr = quotas(tiers.map((r) => stock.filter((id) => ITEMS[id].rarity === r).length), qm[i], new Rng(hashSeed(seed, "wares-rarity", m)));
    tiers.forEach((r, j) => {
      const ids = new Rng(hashSeed(seed, "wares", m, r)).shuffle(stock.filter((id) => ITEMS[id].rarity === r));
      for (const id of ids.slice(0, qr[j])) picked.add(id);
    });
  });
  const eligible = all.filter((id) => picked.has(id) && ITEMS[id].rarity !== "legendary" && ITEMS[id].merchant !== "arcane");
  const byKind = KINDS.map((k) => eligible.filter((id) => kind(id) === k));
  const lq = quotas(byKind.map((l) => l.length), Math.min(rule.late, eligible.length), new Rng(hashSeed(seed, "late-quota")));
  const late = new Map<string, number>();
  byKind.forEach((ids, i) => {
    const order = new Rng(hashSeed(seed, "late", KINDS[i])).shuffle([...ids]);
    order.slice(0, lq[i]).forEach((id, j) => late.set(id, rule.lateDays[j % 2]));
  });
  const out = new Map<string, number>();
  for (const id of all) if (picked.has(id)) out.set(id, unlockDay(id, late.get(id), rule));
  return out;
}

/** Today's rule as a ware map (no draw): every buyable module, from day 1, the ARCANE DEALER from day 3, legendaries
 *  from day 4. */
export function todayWares(): Map<string, number> {
  return new Map(buyableModules().map((d) => [d.id, unlockDay(d.id, undefined, { ...DRAW, epicDay: 1 })] as [string, number]));
}

interface DrawCtx { wares: Map<string, number>; day: () => number }
let CTX: DrawCtx | null = null;
const SET_HAS = Set.prototype.has;
function drawHas(this: Set<string>, id: string): boolean {
  const ctx = CTX;
  if (!ctx) return SET_HAS.call(this, id);
  const d = Object.prototype.hasOwnProperty.call(ITEMS, id) ? ITEMS[id] : undefined;
  if (!d || d.kind === "supply" || !d.merchant) return SET_HAS.call(this, id);
  const u = ctx.wares.get(id);
  return u === undefined || u > ctx.day() || SET_HAS.call(this, id);
}

/** Run `fn` with the caravan limited to `w`'s wares unlocked by `day()` (DORMANT_ITEMS.has, patched for this call only;
 *  supplies stay on sale). */
export function withDraw<T>(w: Map<string, number>, day: () => number, fn: () => T): T {
  if (CTX) throw new Error("wave3: a draw is already active");
  CTX = { wares: w, day };
  Object.defineProperty(DORMANT_ITEMS, "has", { value: drawHas, configurable: true, writable: true });
  try {
    return fn();
  } finally {
    CTX = null;
    delete (DORMANT_ITEMS as unknown as { has?: unknown }).has;
  }
}

// ---------------------------------------------------------------- pools

export interface PoolStat { active: number; day1: number; steps: number[] }

/** A ware map's pools: parts ever offerable (unlocked by day 10), the day-1 pool and the days a step unlocks parts. */
export function poolOf(w: Map<string, number>): PoolStat {
  const days = [...w.values()];
  return {
    active: days.filter((u) => u <= RUN_DAYS).length,
    day1: days.filter((u) => u <= 1).length,
    steps: [...new Set(days.filter((u) => u > 1 && u <= RUN_DAYS))].sort((a, b) => a - b),
  };
}

export interface PoolsReport {
  variant: Variant;
  draw: boolean;
  runs: number;
  active: { min: number; median: number; max: number };
  day1: { min: number; median: number; max: number };
  steps: { days: number[]; runs: number }[]; // the step patterns and how many runs had each
  byDay: { day: number; min: number; median: number; max: number }[]; // parts offerable on each day
  reachable: number; // modules that are a ware in at least one run (REQ-BFG-022 acceptance 3)
  catalogue: number;
  shareOfRuns: { min: number; max: number }; // per module: the share of runs whose wares hold it
  sampled?: SampledPools; // the real caravan, checked against the ware map
}

const stat = (xs: number[]) => ({ min: Math.min(...xs), median: median(xs), max: Math.max(...xs) });

/** The analytic pools of `runs` run seeds (the installed variant): with the draw each run's wares, else today's rule. */
export function pools(v: Variant, draw: boolean, runs: number, seed0 = 1): PoolsReport {
  const all = counted();
  const maps = Array.from({ length: runs }, (_, i) => (draw ? wares(hashSeed("d1-pools", seed0 + i)) : todayWares()));
  const ps = maps.map(poolOf);
  const steps = new Map<string, number>();
  for (const p of ps) steps.set(p.steps.join(","), (steps.get(p.steps.join(",")) ?? 0) + 1);
  const held = new Map<string, number>();
  for (const m of maps) for (const id of m.keys()) held.set(id, (held.get(id) ?? 0) + 1);
  const shares = all.map((id) => (held.get(id) ?? 0) / runs);
  return {
    variant: v, draw, runs,
    active: stat(ps.map((p) => p.active)), day1: stat(ps.map((p) => p.day1)),
    steps: [...steps.entries()].map(([d, n]) => ({ days: d ? d.split(",").map(Number) : [], runs: n })).sort((a, b) => b.runs - a.runs),
    byDay: Array.from({ length: RUN_DAYS }, (_, i) => ({ day: i + 1, ...stat(maps.map((m) => [...m.values()].filter((u) => u <= i + 1).length)) })),
    reachable: all.filter((id) => held.has(id)).length, catalogue: all.length,
    shareOfRuns: { min: Math.min(...shares), max: Math.max(...shares) },
  };
}

export interface SampledPools {
  runs: number;
  caravansPerDay: number;
  outside: number; // offers outside the run's unlocked wares (must be 0)
  active: { min: number; median: number; max: number }; // distinct parts the run's caravans offered over days 1-10
  day1: { min: number; median: number; max: number };
  coverage: number; // offered / ware-map active, over all runs
}

/** The real caravan under the pools' rule: fresh runs of `hero` (run seeds "d1-pools"), `perDay` caravans a day
 *  (rerolls 0..perDay-1). Every offer must be an unlocked ware; the distinct offers approach the ware map's pools. */
export function sampledPools(hero: HeroId, draw: boolean, runs: number, perDay: number, seed0 = 1): SampledPools {
  let outside = 0, offered = 0, possible = 0;
  const act: number[] = [], d1: number[] = [];
  for (let i = 0; i < runs; i++) {
    const seed = hashSeed("d1-pools", seed0 + i);
    const w = draw ? wares(seed) : todayWares();
    const box: { run?: Run } = {};
    const seen = new Set<string>(), seen1 = new Set<string>();
    const go = () => {
      const run = newRun(hero, seed, `d1-pools-${i}`);
      box.run = run;
      for (let day = 1; day <= RUN_DAYS; day++) for (let r = 0; r < perDay; r++) {
        run.day = day;
        run.shop = { wagons: [], rerolls: r, discount: 0, free: 0 };
        rollShop(run);
        for (const wg of run.shop.wagons) for (const o of wg.offers) {
          if (ITEMS[o.def].kind === "supply") continue;
          const u = w.get(o.def);
          if (u === undefined || u > day) outside++;
          seen.add(o.def);
          if (day === 1) seen1.add(o.def);
        }
      }
    };
    if (draw) withDraw(w, () => box.run?.day ?? 1, go);
    else go();
    act.push(seen.size);
    d1.push(seen1.size);
    offered += seen.size;
    possible += poolOf(w).active;
  }
  return { runs, caravansPerDay: perDay, outside, active: stat(act), day1: stat(d1), coverage: offered / possible };
}

// ---------------------------------------------------------------- the offer mix by day

/** The 0.6.2 desk scripted run's own parts at each dawn (tests/shopMix.test.ts DESK): a realistic owned state. */
const DESK: Record<number, [string, number][]> = { 1: [], 2: [["sifter", 1], ["whetstone", 1]] };
DESK[3] = [...DESK[2], ["brake", 1], ["grease", 1]];
DESK[4] = [["sifter", 2], ["whetstone", 1], ["brake", 1], ["grease", 1], ["riveter", 1]];
DESK[5] = [...DESK[4], ["splitter", 1]];
DESK[6] = [...DESK[5], ["temper", 1], ["bellows", 1]];
DESK[7] = [...DESK[6], ["longhaul", 1], ["venom", 1]];
DESK[8] = [...DESK[7], ["quench", 1], ["coil", 1]];
DESK[9] = DESK[8].map(([d, s]) => [d, d === "longhaul" ? 2 : s] as [string, number]);
DESK[10] = [...DESK[9], ["sifter", 1], ["barbed", 1]];

export type MixKind = Kind | "supply";
export interface MixDay {
  day: number;
  caravans: number;
  offers: Record<MixKind, number>;
  rigPerCore: number;
  rigPerTurret: number;
  ok: boolean; // rigs at least 2x cores and 2x turrets
}

/** Offers by kind over `n` seeded caravans a day (fresh run of seed SEED0 + s, set to the day with no rerolls; with
 *  `desk`, the desk run's parts in cargo), as tests/shopMix.turrets.test.ts samples them; with the draw, each run seed's
 *  wares. */
export function offerMix(draw: boolean, n: number, desk = false, hero: HeroId = "furnace"): MixDay[] {
  const SEED0 = 7000;
  const out: MixDay[] = [];
  for (let day = 1; day <= RUN_DAYS; day++) {
    const offers: Record<MixKind, number> = { rig: 0, factory: 0, core: 0, mod: 0, turret: 0, supply: 0 };
    for (let s = 1; s <= n; s++) {
      const seed = SEED0 + s;
      const box: { run?: Run } = {};
      const go = () => {
        const run = newRun(hero, seed, "d1-mix");
        box.run = run;
        run.day = day;
        if (desk) run.inventory = DESK[day].map(([def, stars], i): InvItem => ({ uid: 5000 + i, def, ...(stars > 1 ? { stars } : {}) }));
        run.shop = { wagons: [], rerolls: 0, discount: 0, free: 0 };
        rollShop(run);
        for (const w of run.shop.wagons) for (const o of w.offers) offers[ITEMS[o.def].kind === "supply" ? "supply" : kind(o.def)]++;
      };
      if (draw) withDraw(wares(seed), () => box.run?.day ?? 1, go);
      else go();
    }
    const rigPerCore = offers.rig / Math.max(1, offers.core), rigPerTurret = offers.rig / Math.max(1, offers.turret);
    out.push({ day, caravans: n, offers, rigPerCore, rigPerTurret, ok: rigPerCore >= 2 && rigPerTurret >= 2 });
  }
  return out;
}

// ---------------------------------------------------------------- the CHASER and the par player under a variant

export interface ChaseOne { full: boolean; owned: number; rerolls: number; inWares: boolean }

/** luckReport.ts chaserRun of (hero, seed) for `members`, under the run's draw when `draw`: the caravan offers only its
 *  unlocked wares, and the CHASER rerolls only for a member the caravan can offer that day (so it stays an upper bound). */
export function chaseOne(hero: HeroId, members: readonly string[], seed: number, draw: boolean): ChaseOne {
  if (!draw) {
    const c = chaserRun(hero, members, seed);
    return { full: c.day !== null, owned: c.owned, rerolls: c.rerolls, inWares: true };
  }
  const w = wares(runSeed(hero, seed));
  const box: { run?: Run } = {};
  const c = withDraw(w, () => box.run?.day ?? 1, () => chaserRun(hero, members, seed, {
    start: (run) => { box.run = run; },
    offerable: (def, day) => { const u = w.get(def); return u !== undefined && u <= day && offerable(def, day); },
  }));
  return { full: c.day !== null, owned: c.owned, rerolls: c.rerolls, inWares: members.every((m) => w.has(m)) };
}

export interface TypicalOne { star2: number; star3: number; merges: number; distinct: number; value: number; rerolls: number }

/** The par player (player.ts playerRun, typical policy) of (hero, seed): its day-10 dusk deck's 2-star and 3-star parts
 *  (luck.ts luckMeasures), the merges it made (purchases that ended at 2+ stars) and the distinct parts on its deck.
 *  Always traced (onDecide), so playerRun's cache never hands back a run played under another catalogue or draw. */
export function typicalOne(hero: HeroId, seed: number, draw: boolean): TypicalOne {
  const box: { run?: Run } = {};
  const play = () => playerRun(hero, RUN_DAYS, seed, { onDecide: (run) => { box.run = run; } });
  const days = draw ? withDraw(wares(runSeed(hero, seed)), () => box.run?.day ?? 1, play) : play();
  const last = days[RUN_DAYS - 1];
  const m = luckMeasures(last.build);
  const sig = HEROES[hero].factory;
  const distinct = new Set([...last.build.items.map((p) => p.def), ...last.build.mods.map((p) => p.def)].filter((d) => d !== sig)).size;
  return {
    star2: m.star2, star3: m.star3, merges: days.reduce((s, d) => s + d.buys.filter((b) => b.stars >= 2).length, 0),
    distinct, value: m.value, rerolls: days.reduce((s, d) => s + d.rerolls, 0),
  };
}

// ---------------------------------------------------------------- jobs (in process or on worker threads)

interface Job {
  id: number;
  kind: "chaser" | "typical";
  variant: Variant;
  draw: boolean;
  hero: HeroId;
  seeds: number[];
  members?: string[];
}

function runJob(j: Job): (ChaseOne | TypicalOne)[] {
  return withCatalogue(j.variant, () => (j.kind === "chaser"
    ? j.seeds.map((s) => chaseOne(j.hero, j.members!, s, j.draw))
    : j.seeds.map((s) => typicalOne(j.hero, s, j.draw))));
}

function serve(): void {
  parentPort!.on("message", (job: Job) => parentPort!.postMessage({ id: job.id, out: runJob(job) }));
}

async function runJobs(jobs: Job[], n: number, script?: string): Promise<(ChaseOne | TypicalOne)[][]> {
  if (n <= 1 || !script || jobs.length <= 1) return jobs.map(runJob);
  process.env.WAVE3_WORKER = "1";
  const workers = Array.from({ length: Math.min(n, jobs.length) }, () => new Worker(new URL(script)));
  try {
    return await new Promise<(ChaseOne | TypicalOne)[][]>((done, fail) => {
      const out = new Array<(ChaseOne | TypicalOne)[]>(jobs.length);
      let next = 0, pending = jobs.length;
      const feed = (w: Worker) => {
        if (next < jobs.length) w.postMessage(jobs[next++]);
      };
      for (const w of workers) {
        w.on("error", fail);
        w.on("message", (m: { id: number; out: (ChaseOne | TypicalOne)[] }) => {
          out[m.id] = m.out;
          if (--pending === 0) done(out);
          else feed(w);
        });
        feed(w);
      }
    });
  } finally {
    await Promise.all(workers.map((w) => w.terminate()));
  }
}

const chunks = (xs: number[], size: number): number[][] => {
  const out: number[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
};

export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b), h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}

export interface LuckRow {
  fam: Fam;
  size: number;
  gold: number;
  rates: { hero: HeroId; rate: Rate; medianOwned: number; meanRerolls: number; inWares: number }[];
  pass: boolean; // every hero's point estimate at most 10%
}

export interface LuckOpts { variant: Variant; draw: boolean; heroes: HeroId[]; runs: number; seed: number; workers: number; script?: string }

/** The CHASER's full-set rate of every v2 family of the variant, per hero (seeds seed..seed+runs-1). */
export async function familyLuck(o: LuckOpts): Promise<LuckRow[]> {
  const table = withCatalogue(o.variant, () => familyTableV2(o.variant));
  const seeds = Array.from({ length: o.runs }, (_, i) => o.seed + i);
  const jobs: Job[] = [];
  const index: { fam: Fam; hero: HeroId }[] = [];
  for (const f of table.families) for (const hero of o.heroes) for (const s of chunks(seeds, 250)) {
    jobs.push({ id: jobs.length, kind: "chaser", variant: o.variant, draw: o.draw, hero, seeds: s, members: f.members });
    index.push({ fam: f.fam, hero });
  }
  const outs = await runJobs(jobs, o.workers, o.script);
  return table.families.map((f) => {
    const rates = o.heroes.map((hero) => {
      const ch = outs.filter((_, j) => index[j].fam === f.fam && index[j].hero === hero).flat() as ChaseOne[];
      return {
        hero, rate: wilson(ch.filter((c) => c.full).length, ch.length), medianOwned: median(ch.map((c) => c.owned)),
        meanRerolls: ch.reduce((s, c) => s + c.rerolls, 0) / ch.length, inWares: ch.filter((c) => c.inWares).length / ch.length,
      };
    });
    return { fam: f.fam, size: f.members.length, gold: f.gold, rates, pass: rates.every((r) => r.rate.p <= 0.1) };
  });
}

export interface MergeRow {
  variant: Variant;
  draw: boolean;
  hero: HeroId;
  runs: number;
  star2: { median: number; mean: number; p10: number; p90: number };
  star3: { median: number; mean: number; atLeastOne: number };
  merges: { median: number; mean: number };
  distinct: { median: number };
  value: { median: number };
}

const pctile = (xs: number[], q: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.max(0, Math.ceil(q * xs.length) - 1))];

/** The par player's merges per run under each (variant, draw) case, per hero (seeds seed..seed+runs-1). */
export async function merges(cases: { variant: Variant; draw: boolean }[], heroes: HeroId[], runs: number, seed: number, workers: number, script?: string): Promise<MergeRow[]> {
  const seeds = Array.from({ length: runs }, (_, i) => seed + i);
  const jobs: Job[] = [];
  const index: { c: number; hero: HeroId }[] = [];
  cases.forEach((c, ci) => {
    for (const hero of heroes) for (const s of chunks(seeds, 10)) {
      jobs.push({ id: jobs.length, kind: "typical", variant: c.variant, draw: c.draw, hero, seeds: s });
      index.push({ c: ci, hero });
    }
  });
  const outs = await runJobs(jobs, workers, script);
  const rows: MergeRow[] = [];
  cases.forEach((c, ci) => {
    for (const hero of heroes) {
      const t = outs.filter((_, j) => index[j].c === ci && index[j].hero === hero).flat() as TypicalOne[];
      const s2 = t.map((x) => x.star2), s3 = t.map((x) => x.star3), mg = t.map((x) => x.merges);
      rows.push({
        variant: c.variant, draw: c.draw, hero, runs: t.length,
        star2: { median: median(s2), mean: mean(s2), p10: pctile(s2, 0.1), p90: pctile(s2, 0.9) },
        star3: { median: median(s3), mean: mean(s3), atLeastOne: s3.filter((x) => x >= 1).length / t.length },
        merges: { median: median(mg), mean: mean(mg) },
        distinct: { median: median(t.map((x) => x.distinct)) },
        value: { median: median(t.map((x) => x.value)) },
      });
    }
  });
  return rows;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);

// ---------------------------------------------------------------- markdown

const pc = (x: number, dp = 1) => `${(100 * x).toFixed(dp)}%`;
const rateCI = (r: Rate) => `${pc(r.p)} [${pc(r.lo)}-${pc(r.hi)}]`;
const nm = (id: string) => ITEMS[id]?.name ?? id;
const f1 = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

export function mdCatalogue(c: CatalogueCount, title: string): string[] {
  const L = [`### ${title}`, ""];
  L.push(`- ITEMS keys: ${c.items}. Supplies (left out): ${c.supplies.map(nm).join(", ")}. Hero signatures (left out): ${c.signatures.map(nm).join(", ")}.`);
  L.push(`- **Counted (REQ-BFG-022): ${c.total} with turrets, ${c.modules} without turrets** (${c.turrets} turrets). Equal to content.ts buyableModules(): ${c.sameAsBuyable ? "yes" : "NO"}. One copy of each: ${c.gold} g.`);
  L.push("", "| kind | count |", "|---|---:|", ...KINDS.map((k) => `| ${k} | ${c.byKind[k]} |`));
  L.push("", "| rarity | with turrets | without turrets |", "|---|---:|---:|", ...RARITIES.map((r) => `| ${r} | ${c.byRarity[r]} | ${c.byRarityModules[r]} |`));
  L.push("", `| merchant | with turrets | without turrets | ${KINDS.join(" | ")} |`, `|---|---:|---:|${KINDS.map(() => "---:").join("|")}|`);
  for (const m of Object.keys(MERCHANTS) as MerchantId[]) L.push(`| ${MERCHANTS[m].name} | ${c.byMerchant[m]} | ${c.byMerchantModules[m]} | ${KINDS.map((k) => c.byMerchantKind[m][k]).join(" | ")} |`);
  return L;
}

export function mdFamilyTable(t: V2Table): string[] {
  const L = ["| family | members | kinds | one of each | members (kind) | flag |", "|---|---:|---|---:|---|---|"];
  for (const f of t.families) L.push(`| ${f.fam} | ${f.members.length} | ${f.kinds.join(", ")} | ${f.gold} g | ${f.members.map((m) => `${nm(m)} (${kind(m)})`).join(", ")} | ${f.flag ?? ""} |`);
  L.push("", `Buyable modules: ${t.buyable.length}. Untagged: ${t.untagged.length ? t.untagged.map(nm).join(", ") : "none"}. Tags per module: ${Object.entries(t.tagsPerModule).map(([n, c]) => `${c} with ${n}`).join(", ")}. Tagged ids not buyable: ${t.unknown.length ? t.unknown.join(", ") : "none"}.`);
  return L;
}

export function mdLuck(rows: LuckRow[], heroes: HeroId[]): string[] {
  const L = [`| family | size | one of each | ${heroes.map((h) => `${h.toUpperCase()} CHASER full set [95% CI]`).join(" | ")} | median owned | rerolls (mean) | runs with every member in the wares | at most 10% |`,
    `|---|---:|---:|${heroes.map(() => "---").join("|")}|---|---|---|---|`];
  for (const r of rows) {
    L.push(`| ${r.fam} | ${r.size} | ${r.gold} g | ${r.rates.map((x) => rateCI(x.rate)).join(" | ")} | ${r.rates.map((x) => f1(x.medianOwned)).join(" / ")} | ` +
      `${r.rates.map((x) => x.meanRerolls.toFixed(1)).join(" / ")} | ${r.rates.map((x) => pc(x.inWares, 0)).join(" / ")} | ${r.pass ? "yes" : "**NO**"} |`);
  }
  return L;
}

export function mdMix(days: MixDay[]): string[] {
  const L = ["| day | caravans | rigs | factories | cores | mods | turrets | supplies | rigs per core | rigs per turret | rigs at least 2x both |", "|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|"];
  for (const d of days) {
    const o = d.offers;
    L.push(`| ${d.day} | ${d.caravans} | ${o.rig} | ${o.factory} | ${o.core} | ${o.mod} | ${o.turret} | ${o.supply} | ${d.rigPerCore.toFixed(2)} | ${d.rigPerTurret.toFixed(2)} | ${d.ok ? "yes" : "**NO**"} |`);
  }
  return L;
}

export function mdPools(p: PoolsReport): string[] {
  const s = (x: { min: number; median: number; max: number }) => (x.min === x.max ? `${x.min}` : `${x.median} (${x.min}-${x.max})`);
  const L = [
    `- ${p.variant}, ${p.draw ? "with the per-run draw" : "today's rule (no draw)"}, ${p.runs} run seeds: **active pool ${s(p.active)}**, **day-1 pool ${s(p.day1)}**, ` +
      `unlock steps ${p.steps.map((x) => `days ${x.days.join(", ") || "none"} (${x.days.length} steps, ${x.runs} runs)`).join("; ")}.`,
    `- Offerable parts by day (median, min-max): ${p.byDay.map((d) => `d${d.day} ${s(d)}`).join(", ")}.`,
    `- Modules a ware in at least one run: ${p.reachable} of ${p.catalogue}; each module is in ${pc(p.shareOfRuns.min, 0)}-${pc(p.shareOfRuns.max, 0)} of runs.`,
  ];
  if (p.sampled) {
    const q = p.sampled;
    L.push(`- Checked on the real caravan (${q.runs} runs, ${q.caravansPerDay} caravans a day): offers outside the unlocked wares ${q.outside}; distinct parts offered ${s(q.active)} (day 1: ${s(q.day1)}), ${pc(q.coverage)} of the ware map's active pool.`);
  }
  return L;
}

export function mdMerges(rows: MergeRow[]): string[] {
  const L = ["| catalogue | draw | hero | runs | 2-star parts at day 10: median (mean) [P10-P90] | 3-star: median (mean), runs with one | merges per run: median (mean) | distinct parts: median | deck value: median |",
    "|---|---|---|---:|---|---|---|---:|---:|"];
  for (const r of rows) {
    L.push(`| ${r.variant} | ${r.draw ? "yes" : "no"} | ${r.hero.toUpperCase()} | ${r.runs} | ${f1(r.star2.median)} (${r.star2.mean.toFixed(2)}) [${r.star2.p10}-${r.star2.p90}] | ` +
      `${f1(r.star3.median)} (${r.star3.mean.toFixed(2)}), ${pc(r.star3.atLeastOne, 0)} | ${f1(r.merges.median)} (${r.merges.mean.toFixed(2)}) | ${f1(r.distinct.median)} | ${f1(r.value.median)} g |`);
  }
  return L;
}

// ---------------------------------------------------------------- the CLI

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function intArg(name: string, dflt: number): number {
  const v = arg(name);
  if (v === undefined) return dflt;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new Error(`--${name} must be a whole number, got ${v}`);
  return n;
}

async function main(): Promise<void> {
  const mode = arg("mode") ?? "all";
  const runs = intArg("runs", 2000), typ = intArg("typical", 1000), mixN = intArg("mix", 4000), seed = intArg("seed", 1);
  const workers = intArg("workers", 8), out = resolve(arg("out") ?? "../output-D1/measure");
  const heroes = (arg("heroes") ?? "furnace,weaver,foundry,bastion").split(",").filter(Boolean) as HeroId[];
  for (const h of heroes) if (!HEROES[h]) throw new Error(`--heroes: unknown hero ${h}`);
  const script = import.meta.url;
  mkdirSync(out, { recursive: true });
  const json: Record<string, unknown> = { mode, runs, typical: typ, mix: mixN, seed, heroes, workers, draw: DRAW };
  const md: string[] = [`# D1 measurements (tools/wave3.ts --mode ${mode})`, "",
    `Seeds: CHASER ${seed}..${seed + runs - 1} per hero and family; par player ${seed}..${seed + typ - 1} per hero; offer mix ${mixN} caravans a day (run seeds 7001..${7000 + mixN}). Heroes: ${heroes.map((h) => h.toUpperCase()).join(", ")}. Workers: ${workers}.`, ""];
  const time: Record<string, number> = {};
  const timed = async <T>(label: string, fn: () => Promise<T> | T): Promise<T> => {
    const t0 = performance.now();
    const r = await fn();
    time[label] = Math.round((performance.now() - t0) / 100) / 10;
    console.error(`${label}: ${time[label]} s`);
    return r;
  };
  const all = mode === "all";

  if (mode === "m1" || all) {
    md.push("## M1: baseline (today's catalogue and caravan, v070-rc)", "");
    const c = catalogueCount();
    json.m1Catalogue = c;
    md.push(...mdCatalogue(c, "The catalogue count"), "");
    const p = await timed("m1 pools", () => {
      const r = pools("today", false, 1);
      r.sampled = sampledPools("furnace", false, 40, 200);
      return r;
    });
    json.m1Pools = p;
    md.push("### Pools (today's rule)", "", ...mdPools(p), "");
    const heroPools = await timed("m1 pools by hero", () => (Object.keys(HEROES) as HeroId[]).map((h) => ({ hero: h, sampled: sampledPools(h, false, 20, 100) })));
    json.m1PoolsByHero = heroPools;
    md.push("| hero | distinct parts offered, days 1-10 | day 1 | offers outside the pool |", "|---|---|---|---:|",
      ...heroPools.map((x) => `| ${x.hero.toUpperCase()} | ${x.sampled.active.median} (${x.sampled.active.min}-${x.sampled.active.max}) | ${x.sampled.day1.median} (${x.sampled.day1.min}-${x.sampled.day1.max}) | ${x.sampled.outside} |`), "");
    const mix = await timed("m1 mix", () => ({ fresh: offerMix(false, mixN), desk: offerMix(false, mixN, true) }));
    json.m1Mix = mix;
    md.push("### Offer mix by day, fresh run", "", ...mdMix(mix.fresh), "", "### Offer mix by day, the desk run's parts owned", "", ...mdMix(mix.desk), "");
  }

  if (mode === "m2" || all) {
    md.push("## M2: family map v2 on today's catalogue (no draw)", "");
    const t = withCatalogue("today", () => familyTableV2("today"));
    json.m2Table = t;
    md.push(...withCatalogue("today", () => mdFamilyTable(t)), "");
    const luck = await timed("m2 luck", () => familyLuck({ variant: "today", draw: false, heroes, runs, seed, workers, script }));
    json.m2Luck = luck;
    md.push(...mdLuck(luck, heroes), "");
  }

  if (mode === "m3" || all) {
    md.push("## M3: wave 3 as hypothetical offers (family map v2 with TWIN and PLATE)", "");
    const c = withCatalogue("wave3", () => catalogueCount());
    json.m3Catalogue = c;
    md.push(...withCatalogue("wave3", () => mdCatalogue(c, "The catalogue count with wave 3")), "");
    const t = withCatalogue("wave3", () => familyTableV2("wave3"));
    json.m3Table = t;
    md.push(...withCatalogue("wave3", () => mdFamilyTable(t)), "");
    for (const draw of [false, true]) {
      const luck = await timed(`m3 luck draw=${draw}`, () => familyLuck({ variant: "wave3", draw, heroes, runs, seed, workers, script }));
      json[`m3Luck${draw ? "Draw" : ""}`] = luck;
      md.push(`### CHASER luck, wave 3, ${draw ? "with the per-run draw" : "no draw"}`, "", ...withCatalogue("wave3", () => mdLuck(luck, heroes)), "");
      const mix = await timed(`m3 mix draw=${draw}`, () => withCatalogue("wave3", () => ({ fresh: offerMix(draw, mixN), desk: offerMix(draw, mixN, true) })));
      json[`m3Mix${draw ? "Draw" : ""}`] = mix;
      md.push(`### Offer mix, wave 3, ${draw ? "with the draw" : "no draw"}, fresh run`, "", ...mdMix(mix.fresh), "", `### Offer mix, wave 3, ${draw ? "with the draw" : "no draw"}, desk parts owned`, "", ...mdMix(mix.desk), "");
      const p = await timed(`m3 pools draw=${draw}`, () => withCatalogue("wave3", () => {
        const r = pools("wave3", draw, draw ? 2000 : 1);
        r.sampled = sampledPools("furnace", draw, draw ? 40 : 20, 200);
        return r;
      }));
      json[`m3Pools${draw ? "Draw" : ""}`] = p;
      md.push(`### Pools, wave 3, ${draw ? "with the draw" : "no draw"}`, "", ...mdPools(p), "");
    }
  }

  if (mode === "m4" || all) {
    md.push("## M4: the per-run draw", "", `Rule: ${JSON.stringify(DRAW)}.`, "");
    for (const v of VARIANTS) {
      const p = await timed(`m4 pools ${v}`, () => withCatalogue(v, () => {
        const r = pools(v, true, 2000);
        r.sampled = sampledPools("furnace", true, 40, 200);
        return r;
      }));
      json[`m4Pools_${v}`] = p;
      md.push(`### Pools, ${v}, with the draw`, "", ...mdPools(p), "");
      const mix = await timed(`m4 mix ${v}`, () => withCatalogue(v, () => ({ fresh: offerMix(true, mixN), desk: offerMix(true, mixN, true) })));
      json[`m4Mix_${v}`] = mix;
      md.push(`### Offer mix, ${v}, with the draw, fresh run`, "", ...mdMix(mix.fresh), "", `### Offer mix, ${v}, with the draw, desk parts owned`, "", ...mdMix(mix.desk), "");
    }
    for (const v of ["today", "p100"] as const) {
      const luck = await timed(`m4 luck ${v}`, () => familyLuck({ variant: v, draw: true, heroes, runs, seed, workers, script }));
      json[`m4Luck_${v}`] = luck;
      md.push(`### CHASER luck, ${v}, with the draw`, "", ...withCatalogue(v, () => mdLuck(luck, heroes)), "");
    }
  }

  if (mode === "merges" || all) {
    md.push("## M4: merges under the draw (the par player)", "");
    const cases = [
      { variant: "today" as const, draw: false }, { variant: "today" as const, draw: true },
      { variant: "wave3" as const, draw: false }, { variant: "wave3" as const, draw: true },
      { variant: "p100" as const, draw: false }, { variant: "p100" as const, draw: true },
    ];
    const mg = await timed("m4 merges", () => merges(cases, heroes, typ, seed, workers, script));
    json.m4Merges = mg;
    md.push("### Merges: the par player's day-10 deck", "", ...mdMerges(mg), "");
  }

  if (mode === "m5" || all) {
    md.push("## M5: the new NPCs' plans, checked (wave3Npcs.ts)", "");
    const checked = withCatalogue("wave3", () => NPCS.map((n) => ({ id: n.id, problems: problems(n), table: mdPlan(n) })));
    json.m5 = checked.map((c) => ({ id: c.id, problems: c.problems }));
    for (const n of NPCS) {
      const c = checked.find((x) => x.id === n.id)!;
      md.push(`### ${n.name} (${n.hero.toUpperCase()}, ${n.role === "warlord" ? `${n.tier} warlord and dusk stand-in` : "dusk stand-in"}): ${n.trick}`, "",
        `- ${n.blurb} Families: ${n.families.join(", ")}. Synergy parts: ${n.synergy.join(", ")}. Prize: ${n.prize}.`,
        `- Problems: ${c.problems.length ? c.problems.join("; ") : "none"}.`, "", ...c.table, "");
    }
  }

  json.time = time;
  md.push("## Run times (s)", "", ...Object.entries(time).map(([k, v]) => `- ${k}: ${v}`), "");
  writeFileSync(resolve(out, `wave3-${mode}.json`), JSON.stringify(json, null, 1));
  writeFileSync(resolve(out, `wave3-${mode}.md`), md.join("\n"));
  console.log(md.join("\n"));
}

// the entry comes last, so every module-level constant above is initialised first (as in tools/luckReport.ts)
if (!isMainThread && process.env.WAVE3_WORKER === "1") serve();
else if (isMainThread && /wave3\.(js|mjs)$/.test(process.argv[1] ?? "")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

// keep imports used only in types or helpers referenced by tests
export { SHAPE_ARROWS, rigShape };
