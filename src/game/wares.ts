// 0.8.0 I1 M3 (REQ-BFG-022 part 2; output-D1/DESIGN-wave3.md 4.1-4.2, VERIFIED-D1 Q8): THE PER-RUN DRAW.
//
// When a run starts (run.ts newRun), each merchant packs this run's wares: DRAW.active parts in all (62). Each merchant
// carries its share of the catalogue (its stock x 62 / catalogue size), spread over its rarities the same way, and the
// parts of each rarity are drawn by a seeded shuffle; leftover fractions go to a seeded lottery weighted by the fraction,
// so no group is left out of every run. The stock unlocks on 5 steps: day 1 offers commons and rares from every merchant
// but the ARCANE DEALER; epics from day 2; the ARCANE DEALER from day 3 (as run.ts always had it); legendaries from day 4
// (as always); and two restocks on days 6 and 8, where DRAW.late (12) of the run's wares, stratified by kind and never
// legendary or the ARCANE DEALER's (so those two steps stay whole), wait on the road, half arriving each day.
//
// Everything here reads the run seed and the catalogue alone, never the hero (REQ-BFG-021): two heroes with one seed
// get the same wares. The code is D1's tools/wave3.ts draw (wares, quotas, unlockDay) moved into the game unchanged, so
// DESIGN 4.3's measurements (62 wares, a day-1 pool of about 35, 5 steps) hold for the game's own runs.
//
// A run without wares (a save from before 0.8.0) plays today's rule: every buyable module, legendaries from day 4, the
// ARCANE DEALER from day 3 (run.ts dayPool), so a run in progress never changes.
//
// FIX-ABE (REQ-BFG-069; cap's ruling 207816b18a9fbfdb): a ware held past its slot's day by a hold of its own (a sustain
// piece before SUSTAIN_FIRST_DAY) never holds a merchant's ware slot: the slot goes to a stand-in from the same shuffle,
// open with the slot, and the held ware joins on its own day, so a run holds DRAW.active wares plus one per such slot.

import { hashSeed, Rng } from "../core/rng";
import { ITEMS, RARITIES, buyableModules, type MerchantId } from "../sim/content";
import { SUSTAIN_FIRST_DAY, isSustain } from "../sim/content"; // BOTS-X (REQ-BFG-069): the day-3 hold
import { SHAPES2_ODDS, isShapedRig, shapes2Rules } from "../sim/shapes2"; // SHAPES-2 (REQ-BFG-114 S3): the offer lever b

/** The draw's rule: `active` wares a run, `late` of them held back for two restocks; the unlock ladder. */
export interface DrawRule {
  active: number;
  late: number;
  lateDays: readonly [number, number];
  epicDay: number;
  arcaneDay: number;
  legendaryDay: number;
}
export const DRAW: DrawRule = { active: 62, late: 12, lateDays: [6, 8], epicDay: 2, arcaneDay: 3, legendaryDay: 4 };

/** A run's wares: each module the run's caravan and road can ever offer, with the day (1-10) it unlocks. */
export type Wares = Record<string, number>;

/** The draw's kinds (a rig is "gate" in ITEMS), in D1's order: the restocks are stratified by them. */
const KINDS = ["rig", "factory", "core", "mod", "turret"] as const;
const kindOf = (id: string): (typeof KINDS)[number] => (ITEMS[id].kind === "gate" ? "rig" : (ITEMS[id].kind as (typeof KINDS)[number]));

/**
 * Integer quotas summing to `total` in proportion to `sizes`: each group's floor, then the remaining seats by a seeded
 * lottery weighted by the fractions (no group twice), so no group is left out on every run. `rng` reads the run seed.
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

/** FIX-ABE (cap's ruling 207816b18a9fbfdb): the day a ware's seat opens, the draw's own ladder: its rarity's (epic from
 *  epicDay, legendary from legendaryDay) and the ARCANE DEALER's from arcaneDay, before any hold of the ware's own. */
export function seatDay(id: string, rule: DrawRule = DRAW): number {
  const d = ITEMS[id];
  const u = d.rarity === "legendary" ? rule.legendaryDay : d.rarity === "epic" ? rule.epicDay : 1;
  return d.merchant === "arcane" ? Math.max(u, rule.arcaneDay) : u;
}

/** The day a ware unlocks: its seat's (seatDay), a hold of its own (a sustain piece's first day), and a late restock day
 *  when it waits for one. */
export function unlockDay(id: string, late: number | undefined, rule: DrawRule = DRAW): number {
  let u = seatDay(id, rule);
  // BOTS-X (REQ-BFG-069): the sustain pieces from the first sustain day (switch off: no draw lists one, so never read)
  if (isSustain(id)) u = Math.max(u, SUSTAIN_FIRST_DAY);
  if (late !== undefined) u = Math.max(u, late);
  return u;
}

/** FIX-ABE (cap's ruling 207816b18a9fbfdb): is `id` held past its seat's day by a hold of its own (today a sustain piece
 *  before SUSTAIN_FIRST_DAY)? Such a ware never holds a merchant's ware slot (drawWares). */
export const heldPast = (id: string, rule: DrawRule = DRAW): boolean => unlockDay(id, undefined, rule) > seatDay(id, rule);

/**
 * The run's wares, drawn from the run seed alone (in catalogue order). Each merchant carries its share of `active`, spread
 * over its rarities, each rarity's parts drawn by a seeded shuffle; then `late` of the wares that are neither legendary
 * nor the ARCANE DEALER's wait for the restocks, stratified by kind, alternating between the two restock days.
 */
export function drawWares(seed: number, rule: DrawRule = DRAW): Wares {
  const all = buyableModules().map((d) => d.id);
  const merchants = [...new Set(all.map((id) => ITEMS[id].merchant!))].sort();
  const stockOf = (m: MerchantId) => all.filter((id) => ITEMS[id].merchant === m);
  const qm = quotas(merchants.map((m) => stockOf(m).length), Math.min(rule.active, all.length), new Rng(hashSeed(seed, "wares-merchant")));
  const picked = new Set<string>();
  const standIns = new Set<string>(); // FIX-ABE: the wares that hold a held ware's slot
  merchants.forEach((m, i) => {
    const stock = stockOf(m);
    const tiers = RARITIES.filter((r) => stock.some((id) => ITEMS[id].rarity === r));
    const qr = quotas(tiers.map((r) => stock.filter((id) => ITEMS[id].rarity === r).length), qm[i], new Rng(hashSeed(seed, "wares-rarity", m)));
    tiers.forEach((r, j) => {
      const ids = new Rng(hashSeed(seed, "wares", m, r)).shuffle(stock.filter((id) => ITEMS[id].rarity === r));
      for (const id of ids.slice(0, qr[j])) picked.add(id);
      // FIX-ABE (cap's ruling 207816b18a9fbfdb): a ware held past its seat's day never holds a merchant's ware slot, so the
      // merchant's slots fill only from wares open that day: each slot such a ware drew goes to the tier's next ware in
      // this same shuffle that opens with the seat (no new draw: the stream holds), open from the seat's day; the held
      // ware still joins the run on its own day. A tier that drew no held ware draws exactly as before.
      let owed = ids.slice(0, qr[j]).filter((id) => heldPast(id, rule)).length;
      for (const id of ids.slice(qr[j])) {
        if (owed <= 0) break;
        if (!heldPast(id, rule)) { standIns.add(id); owed--; }
      }
    });
  });
  if (shapes2Rules() && SHAPES2_ODDS.minStock > 0) holdShaped(seed, all, picked, standIns, rule); // SHAPES-2 (REQ-BFG-114 S3, lever b)
  const eligible = all.filter((id) => picked.has(id) && ITEMS[id].rarity !== "legendary" && ITEMS[id].merchant !== "arcane");
  const byKind = KINDS.map((k) => eligible.filter((id) => kindOf(id) === k));
  const lq = quotas(byKind.map((l) => l.length), Math.min(rule.late, eligible.length), new Rng(hashSeed(seed, "late-quota")));
  const late = new Map<string, number>();
  byKind.forEach((ids, i) => {
    const order = new Rng(hashSeed(seed, "late", KINDS[i])).shuffle([...ids]);
    order.slice(0, lq[i]).forEach((id, j) => late.set(id, rule.lateDays[j % 2]));
  });
  const out: Wares = {};
  // FIX-ABE: the restocks above read the slots' draw as before (a held ware may wait for one; a stand-in never does, it
  // opens with the slot it holds), so a run's every other ware keeps its day and the stand-ins only add
  for (const id of all) {
    if (picked.has(id)) out[id] = unlockDay(id, late.get(id), rule);
    else if (standIns.has(id)) out[id] = seatDay(id, rule);
  }
  return out;
}

/**
 * SHAPES-2 (REQ-BFG-114 (2); BRIEF-SHAPES2 S3, lever b): with SHAPES2 on, the per-run draw keeps at least
 * SHAPES2_ODDS.minStock shaped rigs among the run's wares (all of them when the catalogue holds fewer). Each missing shaped rig
 * (a seeded shuffle of them, on its own stream `wares-shaped`, so no other draw moves) takes the place of one drawn piece of its
 * own merchant and rarity that is not a shaped rig and is not held past its seat's day (so no merchant's or rarity's share
 * changes); where its merchant has none of its rarity, a drawn piece of the merchant, else of the run. The run still holds
 * DRAW.active wares (a stand-in for a held ware counts as a ware of the run). Called only with the switch on; the draw is
 * untouched with it off.
 */
function holdShaped(seed: number, all: readonly string[], picked: Set<string>, standIns: ReadonlySet<string>, rule: DrawRule): void {
  const shaped = all.filter((id) => isShapedRig(ITEMS[id]));
  const held = (id: string): boolean => picked.has(id) || standIns.has(id); // a stand-in is a ware of the run too
  const need = Math.min(SHAPES2_ODDS.minStock, shaped.length) - shaped.filter(held).length;
  if (need <= 0) return;
  const rng = new Rng(hashSeed(seed, "wares-shaped"));
  const missing = rng.shuffle(shaped.filter((id) => !held(id))).slice(0, need);
  for (const id of missing) {
    const d = ITEMS[id];
    const drawn = all.filter((o) => picked.has(o) && !isShapedRig(ITEMS[o]) && !heldPast(o, rule));
    const pools = [
      drawn.filter((o) => ITEMS[o].merchant === d.merchant && ITEMS[o].rarity === d.rarity),
      drawn.filter((o) => ITEMS[o].merchant === d.merchant),
      drawn,
    ];
    const pool = pools.find((p) => p.length > 0);
    if (!pool) continue;
    picked.delete(rng.pick(pool));
    picked.add(id);
  }
}

/**
 * Is module `id` among the run's unlocked wares on `day`? With no wares (a save from before 0.8.0) every module is, and
 * run.ts dayPool applies today's legendary and ARCANE DEALER days itself. A supply is never a ware: always on sale.
 */
export function unlocked(run: { wares?: Wares }, id: string, day: number): boolean {
  if (!run.wares) return true;
  if (ITEMS[id]?.kind === "supply") return true;
  const u = Object.prototype.hasOwnProperty.call(run.wares, id) ? run.wares[id] : undefined;
  return u !== undefined && u <= day;
}

/** A save's wares, kept when well formed (module ids that are buyable, days 1-10) and dropped otherwise, so the run then
 *  plays today's rule (save.ts migrateRun). */
export function waresOk(w: unknown): w is Wares {
  if (!w || typeof w !== "object" || Array.isArray(w)) return false;
  const buyable = new Set(buyableModules().map((d) => d.id));
  return Object.entries(w as Record<string, unknown>).every(([id, day]) => buyable.has(id) && Number.isInteger(day) && (day as number) >= 1 && (day as number) <= 10);
}
