// Balance harness: the synergy check of the named NPC builds (0.6.2 TUNE-C, REQ-BFG-024; ref/BRIEF-final-062-captains.md
// section 3 item 5). The ROADMAP asks that each build's synergy really pays: swap a build's synergy parts (RivalPlan.synergy,
// the parts its blurb promises) for off-plan parts of the same cost, in the same slots, keeping the deck legal, and the
// build must get clearly weaker. synergySwap() makes the swapped decks; tools/parBench.ts --synergy fights them against
// the par field; tests/captains.synergy.test.ts checks the swaps.

import { hashSeed, Rng } from "../../core/rng";
import { ITEMS, RUN_DAYS, rarityWeights, type ItemDef } from "../content";
import { canFitGear, cloneBuild, hitsOfRig, setRot, type Build } from "../deck";
import { bestRot } from "../beltside";
import { validateBuild } from "../../net/validate";
import type { RivalPlan } from "../rivalBuilds";
import { starsOf, valueOf } from "../stars";

/** Race timing gear: never in a captain deck (tests/races.dormant.test.ts). */
const RACE = new Set(["escapement", "longcase"]);
/** The part kinds a synergy part is swapped within: a rig for a rig, gear for gear, a core for a core, a factory for a factory. */
const KINDS = new Set(["gate", "mod", "core", "factory"]);
const PLATE = 25;

/** Every def a plan buys at any luck on any day: its factories, rigs, gear, cores and turrets. */
export function planDefs(plan: RivalPlan): Set<string> {
  const out = new Set(plan.factories.map((f) => f.def));
  for (const u of plan.upgrades) {
    for (const d of [u.gate?.[0], u.mod?.[0], u.fuseGate?.[0], u.fuseMod?.[0], u.factory?.def, u.turret?.[0]]) if (d) out.add(d);
  }
  return out;
}

/** The first day the caravan can offer `d`: its rarity has weight that day (content.ts rarityWeights) and its merchant
 *  rides (the ARCANE DEALER from day 3). */
export function firstOfferDay(d: ItemDef): number {
  for (let day = 1; day <= RUN_DAYS; day++) {
    if (!(rarityWeights(day)[d.rarity] > 0)) continue;
    if (d.merchant === "arcane" && day <= 2) continue;
    return day;
  }
  return Infinity;
}

/** How a candidate was chosen: "off-plan" (same price, a part the plan never buys), "unused" (same price, a part of the
 *  plan that is not in the day's deck and is no synergy part), or "nearest" (no same-price part of the kind: the
 *  off-plan parts at the nearest price, above on a tie). */
export type SwapTier = "off-plan" | "unused" | "nearest";

/** The parts that may replace synergy part `def` in `deck` (a deck of `plan` on `day`), and how they were chosen. Every
 *  candidate is of the same kind, sold by the caravan, offerable by `day`, never a race part and never a synergy part. */
export function swapCandidates(plan: RivalPlan, deck: Build, def: string, day: number): { tier: SwapTier; defs: string[] } {
  const d = ITEMS[def];
  const own = planDefs(plan), syn = new Set(plan.synergy ?? []);
  const inDeck = new Set([...deck.items, ...deck.mods].map((p) => p.def));
  const pool = Object.values(ITEMS).filter((x) => x.kind === d.kind && !!x.merchant && x.price > 0 && !RACE.has(x.id) && !syn.has(x.id) && firstOfferDay(x) <= day);
  const offPlan = pool.filter((x) => !own.has(x.id));
  const same = offPlan.filter((x) => x.price === d.price);
  if (same.length) return { tier: "off-plan", defs: same.map((x) => x.id) };
  const unused = pool.filter((x) => own.has(x.id) && !inDeck.has(x.id) && x.price === d.price);
  if (unused.length) return { tier: "unused", defs: unused.map((x) => x.id) };
  if (!offPlan.length) return { tier: "nearest", defs: [] };
  const gap = (x: ItemDef) => Math.abs(x.price - d.price) - (x.price > d.price ? 0.5 : 0);
  const best = Math.min(...offPlan.map(gap));
  return { tier: "nearest", defs: offPlan.filter((x) => gap(x) === best).map((x) => x.id) };
}

/** One synergy part swapped: its uid and slot, the defs, its stars, the gold the swap adds (negative: saves), the tier. */
export interface Swap { uid: number; slot: string; from: string; to: string; stars: number; dGold: number; tier: SwapTier }
export interface Swapped { build: Build; swaps: Swap[]; kept: string[] }

/** Is `b` legal on `day`: the async validator's checks (`pve`: a warlord deck, its PvE hull as whole plates, no budget)
 *  and every rig working at least one belt tile. */
export function swapLegal(b: Build, day: number, pve = false): boolean {
  const whole = pve ? { ...b, hullBonus: Math.max(0, Math.ceil(b.hullBonus / PLATE) * PLATE) } : b;
  const errs = validateBuild(whole, day).errors.filter((e) => !pve || !/^(budget|supply):/.test(e));
  if (errs.length) return false;
  return b.items.every((p) => ITEMS[p.def].kind !== "gate" || hitsOfRig(b, p.uid).length > 0);
}

/**
 * Variant `v` of deck `b` (captain plan `plan`, `id` for the seed, on `day`) with every synergy part swapped for a
 * candidate of swapCandidates(), each in its own slot: a rig on the same cell, turned to work the most belt tiles; gear or
 * a core on the same turret (gear through canFitGear); a factory on the same cells, feeding the same belts. The part
 * keeps its uid and stars. The candidates are tried in an order shuffled per (id, day, uid, v), so variants differ; a
 * candidate that leaves the deck illegal (swapLegal) is skipped, and a part with no legal candidate is kept (listed in
 * `kept`). The hero's signature factory is never a synergy part.
 */
export function synergySwap(id: string, plan: RivalPlan, b: Build, day: number, v: number, pve = false): Swapped {
  const syn = new Set(plan.synergy ?? []);
  let cur = cloneBuild(b);
  const swaps: Swap[] = [], kept: string[] = [];
  const parts = [...b.items.map((p) => ({ uid: p.uid, def: p.def, mod: false })), ...b.mods.map((m) => ({ uid: m.uid, def: m.def, mod: true }))]
    .filter((p) => syn.has(p.def) && KINDS.has(ITEMS[p.def].kind))
    .sort((a, c) => a.uid - c.uid);
  for (const part of parts) {
    const { tier, defs } = swapCandidates(plan, cur, part.def, day);
    const order = new Rng(hashSeed("synergy-swap", id, day, part.uid, v)).shuffle([...defs]);
    let done = false;
    for (const to of order) {
      const nb = cloneBuild(cur);
      let slot: string, stars: number;
      if (!part.mod) {
        const q = nb.items.find((p) => p.uid === part.uid)!;
        slot = `${q.x},${q.y}`;
        stars = starsOf(q);
        q.def = to;
        if (ITEMS[to].kind === "gate") setRot(q, bestRot(nb, to, q.x, q.y).rot);
      } else {
        const m = nb.mods.find((x) => x.uid === part.uid)!;
        slot = `turret ${m.turret}`;
        stars = starsOf(m);
        if (ITEMS[to].kind === "mod" && !canFitGear(nb, m.turret, to, m.uid).ok) continue;
        m.def = to;
      }
      if (!swapLegal(nb, day, pve)) continue;
      cur = nb;
      swaps.push({ uid: part.uid, slot, from: part.def, to, stars, dGold: valueOf(to, stars) - valueOf(part.def, stars), tier });
      done = true;
      break;
    }
    if (!done) kept.push(`${part.def}#${part.uid}`);
  }
  return { build: cur, swaps, kept };
}
