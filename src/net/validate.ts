// Server-grade deck validation for ghosts. It applies deck.ts's own rules (placement,
// route well-formedness, connector claims, belt capacity, one hardpoint per turret) and
// adds what only matters once builds travel: purchasability and a gold budget.
//
// Budget (see docs/ASYNC.md):
//   maxGold(day) = START_GOLD + Σ_{d=1}^{day-1} incomeFor(d, won = true)
//   cost(build)  = Σ value(deck items) + Σ value(turret mods)   (0.6.1a: value = price × 2^(stars − 1))
//                + price(beltcrate) × ceil((beltCap − hero.belt) / beltcrate.belt)
//                + price(plating)   × ceil(hullBonus / plating.hull)
//   valid iff cost(build) ≤ maxGold(day)
// Sales refund at most half the price and rerolls only spend, so no sequence of shop
// actions can put more purchase value on the deck than the gold ever received.

import { GRID, HEROES, ITEMS, START_GOLD, incomeFor, type ItemDef } from "../sim/content";
import {
  canPlaceItem, connectorClaims, dirBetween, adjacentToFactory, footprint, occupancy,
  routeInfo, routeWellFormed, type Build,
} from "../sim/deck";
import { checkBuildShape, MAX_DAY, SnapshotError } from "./snapshot";
import { FUSE_MAX, fusible, outputsAt, starsOf, valueOf } from "../sim/stars";

export interface Validation {
  ok: boolean;
  errors: string[]; // each starts with a category: shape|item|placement|route|hardpoint|supply|budget
}

export function itemDef(id: string): ItemDef | undefined {
  return Object.prototype.hasOwnProperty.call(ITEMS, id) ? ITEMS[id] : undefined;
}

/** Most gold a player can have received before the dusk fight of `day` (1-based). */
export function maxGoldByDay(day: number): number {
  let gold = START_GOLD;
  for (let d = 1; d < day; d++) gold += incomeFor(d, true);
  return gold;
}

export interface BuildCost {
  items: number;
  mods: number;
  crates: number; // belt crates implied by beltCap above the hero's base (count)
  plates: number; // armor plating implied by hullBonus (count)
  total: number; // gold
}

export function buildCost(b: Build): BuildCost {
  const h = HEROES[b.hero];
  const crate = ITEMS.beltcrate, plate = ITEMS.plating;
  // 0.6.1a: value = price x 2^(stars - 1) (stars.ts valueOf; unknown ids 0), so a merged module costs exactly its copies
  const items = b.items.reduce((s, p) => s + valueOf(p.def, starsOf(p)), 0);
  const mods = b.mods.reduce((s, m) => s + valueOf(m.def, starsOf(m)), 0);
  const crates = Math.max(0, Math.ceil((b.beltCap - h.belt) / crate.supply!.belt!));
  const plates = Math.max(0, Math.ceil(b.hullBonus / plate.supply!.hull!));
  return { items, mods, crates, plates, total: items + mods + crates * crate.price + plates * plate.price };
}

const SIGNATURES = new Set(Object.values(HEROES).map((h) => h.factory));

/**
 * 0.6.1a (ARSENAL-DECISIONS call 1, staged): under auto-merge two fusible modules with the same def
 * and the same stars below FUSE_MAX can't exist. validateBuild applies this rule only while FUSE_LIVE
 * is true. It stays FALSE until the flip commit (RULES_VERSION bb-0.6.1, stand-in pool v2, harness
 * v2, fused captains and par decks): today those still hold pairs.
 */
export const FUSE_LIVE = false;

/** One message per def and star level (below FUSE_MAX) held more than once, e.g. "UNFUSED PAIR: TEMPER ★1 x2".
 *  Supplies, signature factories and unknown ids are not fusible and never count. */
export function unfusedPairs(build: Build): string[] {
  const n = new Map<string, number>();
  for (const p of [...build.items, ...build.mods]) {
    const s = starsOf(p);
    if (!fusible(p.def) || s >= FUSE_MAX) continue;
    n.set(`${p.def}*${s}`, (n.get(`${p.def}*${s}`) ?? 0) + 1);
  }
  const out: string[] = [];
  for (const [k, c] of n) {
    if (c < 2) continue;
    const [def, s] = k.split("*");
    out.push(`UNFUSED PAIR: ${ITEMS[def].name} ★${s} x${c}`);
  }
  return out;
}

function routeProblem(b: Build, i: number, occ: ReturnType<typeof occupancy>): string | null {
  const r = b.routes[i];
  if (!r.cells.length) return "has no belt tiles";
  const f = b.items.find((p) => p.uid === r.factory);
  if (!f || itemDef(f.def)?.kind !== "factory") return `is fed by uid ${r.factory}, which is not a factory on this deck`;
  if (adjacentToFactory(b, r.factory, r.cells[0]) < 0) return "does not start beside its factory";
  const seen = new Set<number>();
  for (let j = 0; j < r.cells.length; j++) {
    const k = r.cells[j];
    if (seen.has(k)) return `revisits cell ${k} (no loops)`;
    seen.add(k);
    if (j > 0 && dirBetween(r.cells[j - 1], k) < 0) return `is broken between cells ${r.cells[j - 1]} and ${k}`;
    const it = occ[k].item;
    if (it >= 0 && itemDef(b.items.find((p) => p.uid === it)?.def ?? "")?.kind !== "gate") {
      return `runs through non-gate machinery at cell ${k}`;
    }
  }
  return routeWellFormed(b, r) ? null : "is not well formed";
}

export function validateBuild(build: Build, day: number): Validation {
  let b: Build;
  try {
    b = checkBuildShape(build);
  } catch (e) {
    return { ok: false, errors: [`shape: ${e instanceof SnapshotError ? e.message : String(e)}`] };
  }
  if (!Number.isInteger(day) || day < 1 || day > MAX_DAY) return { ok: false, errors: [`shape: day ${day} is not in 1..${MAX_DAY}`] };
  const errors: string[] = [];
  const h = HEROES[b.hero];

  // items exist, uids unique (deck.ts helpers throw on unknown defs, so stop here if not)
  const uids = new Set<number>();
  for (const p of [...b.items, ...b.mods]) {
    if (!itemDef(p.def)) errors.push(`item: uid ${p.uid} is unknown item "${p.def}"`);
    if (uids.has(p.uid)) errors.push(`item: uid ${p.uid} is used twice`);
    uids.add(p.uid);
  }
  if (errors.length) return { ok: false, errors };

  // 0.6.1a stars: an integer 1..FUSE_MAX (absent = 1; checkBuildShape already bounds it); signature
  // factories and supplies never merge, so theirs must be absent or 1
  for (const p of [...b.items, ...b.mods]) {
    if (p.stars === undefined) continue;
    if (!Number.isInteger(p.stars) || p.stars < 1 || p.stars > FUSE_MAX) errors.push(`item: uid ${p.uid} has stars ${p.stars}; expected 1..${FUSE_MAX}`);
    else if (p.stars > 1 && !fusible(p.def)) errors.push(`item: uid ${p.uid} ${ITEMS[p.def].name} can't have ${p.stars} stars (signatures and supplies never merge)`);
  }
  if (FUSE_LIVE) for (const m of unfusedPairs(b)) errors.push(`item: ${m}`);

  // purchasability and the signature factory
  let own = 0;
  for (const p of b.items) {
    const d = ITEMS[p.def];
    if (SIGNATURES.has(d.id)) {
      if (d.id === h.factory) own++;
      else errors.push(`item: uid ${p.uid} ${d.name} is another hero's signature factory`);
    } else if (!d.merchant) {
      errors.push(`item: uid ${p.uid} ${d.name} is not sold by any merchant`);
    }
  }
  if (own !== 1) errors.push(`item: the deck must carry exactly one ${ITEMS[h.factory].name} (found ${own})`);

  // placement: deck equipment only, on the deck, no overlaps (canPlaceItem = the editor's rule)
  const owner = new Map<number, number>();
  for (const p of b.items) {
    const d = ITEMS[p.def];
    const chk = canPlaceItem(b, p.def, p.x, p.y, p.uid);
    if (!chk.ok && chk.reason !== "OCCUPIED") errors.push(`placement: uid ${p.uid} ${d.name} at ${p.x},${p.y}: ${chk.reason}`);
    if (p.x + d.size > GRID || p.y + d.size > GRID) continue;
    for (const k of footprint(d, p.x, p.y)) {
      const o = owner.get(k);
      if (o !== undefined) errors.push(`placement: uid ${p.uid} ${d.name} overlaps uid ${o} at cell ${k}`);
      else owner.set(k, p.uid);
    }
  }
  if (errors.length) return { ok: false, errors }; // route checks assume a sane deck

  // routes: well formed, no crossings, connected to a claimed connector, belt ≤ beltCap
  const occ = occupancy(b);
  const claims = connectorClaims(b);
  const beltOwner = new Map<number, number>();
  const perFactory = new Map<number, number>();
  let belt = 0;
  b.routes.forEach((r, i) => {
    belt += r.cells.length;
    perFactory.set(r.factory, (perFactory.get(r.factory) ?? 0) + 1);
    const why = routeProblem(b, i, occ);
    if (why) {
      errors.push(`route: route ${i} ${why}`);
      return;
    }
    for (const k of r.cells) {
      const o = beltOwner.get(k);
      if (o !== undefined) errors.push(`route: routes ${o} and ${i} cross at cell ${k}`);
      else beltOwner.set(k, i);
    }
    if (!routeInfo(b, i, claims, occ).connected) {
      errors.push(`route: route ${i} does not end on a free turret connector (disconnected)`);
    }
  });
  for (const [uid, n] of perFactory) {
    const f = b.items.find((p) => p.uid === uid);
    const outs = f ? outputsAt(f.def, starsOf(f)) || 1 : 1; // 0.6.1a: outputs at its stars
    if (f && n > outs) errors.push(`route: ${ITEMS[f.def].name} uid ${uid} feeds ${n} routes but has ${outs} output(s)`);
  }
  if (belt > b.beltCap) errors.push(`route: ${belt} belt tiles exceed beltCap ${b.beltCap}`);

  // turret hardpoints: mods only, a real turret, one per turret (turretHasFreeHardpoint)
  const mounted = new Set<number>();
  for (const m of b.mods) {
    const d = ITEMS[m.def];
    if (d.kind !== "mod") errors.push(`hardpoint: uid ${m.uid} ${d.name} is not turret equipment`);
    if (m.turret >= h.turrets.length) errors.push(`hardpoint: uid ${m.uid} targets turret ${m.turret}; ${h.name} has ${h.turrets.length}`);
    else if (mounted.has(m.turret)) errors.push(`hardpoint: turret ${m.turret} carries more than one module`);
    mounted.add(m.turret);
  }

  // supplies: only whole belt crates and whole plating are purchasable
  const crate = ITEMS.beltcrate.supply!.belt!, plate = ITEMS.plating.supply!.hull!;
  if (b.beltCap < h.belt || (b.beltCap - h.belt) % crate !== 0) {
    errors.push(`supply: beltCap ${b.beltCap} is not ${h.belt} + a whole number of +${crate} belt crates`);
  }
  if (b.hullBonus < 0 || b.hullBonus % plate !== 0) {
    errors.push(`supply: hullBonus ${b.hullBonus} is not a whole number of +${plate} plating`);
  }

  // gold budget
  const cost = buildCost(b), max = maxGoldByDay(day);
  if (cost.total > max) {
    errors.push(`budget: build costs ${cost.total} gold (items ${cost.items}, mods ${cost.mods}, ${cost.crates} crates, ${cost.plates} plating) but day ${day} allows at most ${max}`);
  }
  return { ok: errors.length === 0, errors };
}
