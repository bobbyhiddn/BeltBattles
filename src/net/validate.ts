// Server-grade deck validation for ghosts. It applies deck.ts's own rules (placement,
// route well-formedness, connector claims, belt capacity, one hardpoint per turret) and
// adds what only matters once builds travel: purchasability and a gold budget.
//
// Budget (see docs/ASYNC.md):
//   maxGold(day) = START_GOLD + Σ_{d=1}^{day-1} incomeFor(d, won = true)
//   cost(build)  = Σ value(deck items) + Σ value(turret mods)   (0.6.1a: value = price × 2^(stars − 1))
//                + price(beltcrate) × ceil((beltCap − hero.belt) / beltcrate.belt)
//                + price(plating)   × ceil(hullBonus / plating.hull)
//                + Σ turretValue(installed turrets)   (0.6.2s S7; 0 for a build without `turrets`)
//   valid iff cost(build) ≤ maxGold(day)
// Sales refund at most half the price and rerolls only spend, so no sequence of shop
// actions can put more purchase value on the deck than the gold ever received.

import { GRID, HEROES, ITEMS, RULES_VERSION, START_GOLD, incomeFor, isWave3, wave3Live, type ItemDef } from "../sim/content";
import {
  canPlaceItem, connectorClaims, dirBetween, adjacentToFactory, footprint, hullSlots, occupancy,
  routeInfo, routeWellFormed, turretSlots, turretsCost, type Build,
} from "../sim/deck";
import { joinProblem } from "../sim/deck"; // 0.6.2j (J12): belt joins
import { checkBuildShape, MAX_DAY, SnapshotError } from "./snapshot";
import { FUSE_MAX, fusible, outputsAt, starsOf, valueOf } from "../sim/stars";
import { playerSupplyBudget } from "./roadCap"; // 0.7.0: the player mode's supply and budget blocks
import { heroGateProblem, rulesGateProblem } from "./rulesGate"; // 0.7.0 (v070-rel M2): turrets and joins need bb-0.6.2 rules; 0.8.0 H1: heroes by rules

export { maxHonestSpend, roadCap } from "./roadCap";

/**
 * 0.7.0 (v070-validate D1): two modes, one validator. "strict" (the default) holds a deck to the shop alone:
 * stand-ins, the bundled pool, the harness and the pool generator. "player" is for decks a real player
 * uploaded (server/app.ts POST /v1/ghosts) or a ghost the server serves (ghostClient.ts): every strict rule,
 * with the supply and budget blocks replaced by the road's reachable hull and belt and maxHonestSpend(day)
 * (src/net/roadCap.ts). It accepts every deck strict accepts.
 */
export type ValidationMode = "strict" | "player";

/**
 * validateBuild in the player mode (see ValidationMode). 0.7.0 (v070-rel M2): `rules` is the rules version the deck
 * travels under (its snapshot's; default this build's RULES_VERSION). A deck with turret slots or belt joins under rules
 * that predate bb-0.6.2, or that can't be read, is refused with one "rules:" error naming both (rulesGate.ts). Joins
 * past JOIN_LIMIT are validateBuild's own (deck.ts joinProblem: "2 JOINS PER DECK"), in both modes.
 */
export function validateUpload(build: Build, day: number, rules: string = RULES_VERSION): Validation {
  const why = rulesGateProblem(rules, build);
  if (why) return { ok: false, errors: [`rules: ${why}`] };
  // 0.8.0 H1 (REQ-BFG-009): the deck's hero must be one its rules accept (rulesGate.ts RULES_HEROES)
  const hero = heroGateProblem(rules, (build as { hero?: unknown } | null)?.hero);
  if (hero) return { ok: false, errors: [`rules: ${hero}`] };
  return validateBuild(build, day, "player");
}

export interface Validation {
  ok: boolean;
  errors: string[]; // each starts with a category: shape|item|turret|placement|route|hardpoint|supply|budget (validateUpload: also rules)
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
  // 0.6.2s TURRET SLOTS (S7): the installed turrets' value (deck.ts turretsCost: price x (2^(stars-1) - 1 for the free
  // starting copy)). Present only when the build carries `turrets`, so a starting-layout build's breakdown is unchanged.
  turrets?: number;
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
  const total = items + mods + crates * crate.price + plates * plate.price;
  if (!b.turrets) return { items, mods, crates, plates, total };
  const turrets = turretsCost(b);
  return { items, mods, crates, plates, turrets, total: total + turrets };
}

const SIGNATURES = new Set(Object.values(HEROES).map((h) => h.factory));

/**
 * 0.6.1a (ARSENAL-DECISIONS call 1): under auto-merge two fusible modules with the same def and the
 * same stars below FUSE_MAX can't exist. validateBuild applies this rule while FUSE_LIVE is true:
 * LIVE since the 0.6.1 flip (RULES_VERSION bb-0.6.1, stand-in pool v2, harness v2). The game
 * validates foreign decks only (ghosts, stand-ins, uploads); the captains and par decks still hold
 * pairs until job E merges them, and the game never validates them.
 */
export const FUSE_LIVE = true;

/** One message per def and star level (below FUSE_MAX) held more than once, e.g. "UNFUSED PAIR: TEMPER ★1 x2".
 *  Supplies, signature factories and unknown ids are not fusible and never count. 0.6.2s TURRET SLOTS (S6, S7): the
 *  installed turrets count too, after the items and mods, except that two FREE copies never merge with each other
 *  (WEAVER starts with three free DART GUNs): per def and star level below FUSE_MAX, with N bought and F free copies,
 *  it is a pair iff N >= 1 and N + F >= 2 (reported as x(N + F)). The starting layout (a build without `turrets`)
 *  holds free copies only, so it never adds a message. */
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
  const t = new Map<string, { bought: number; free: number }>();
  for (const x of build.turrets ?? []) {
    const s = starsOf(x);
    if (!fusible(x.def) || ITEMS[x.def].kind !== "turret" || s >= FUSE_MAX) continue;
    const k = `${x.def}*${s}`;
    const c = t.get(k) ?? { bought: 0, free: 0 };
    if (x.free) c.free++;
    else c.bought++;
    t.set(k, c);
  }
  for (const [k, c] of t) {
    if (c.bought < 1 || c.bought + c.free < 2) continue;
    const [def, s] = k.split("*");
    out.push(`UNFUSED PAIR: ${ITEMS[def].name} ★${s} x${c.bought + c.free}`);
  }
  return out;
}

/** 0.6.2 BELTSIDE (D2): a rig's rotation is 0..3 quarter turns (absent = 0). */
const MAX_ROT = 3;

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
    if (occ[k].item >= 0) return `runs through machinery at cell ${k}`; // 0.6.2 BELTSIDE (R1): no exception for rigs
  }
  return routeWellFormed(b, r) ? null : "is not well formed";
}

export function validateBuild(build: Build, day: number, mode: ValidationMode = "strict"): Validation {
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
    // 0.8.0 P1: a wave-3 module resolves in ITEMS, but while the switch is off (content.ts WAVE3_LIVE) no player can own one
    else if (isWave3(p.def) && !wave3Live()) errors.push(`item: uid ${p.uid} ${ITEMS[p.def].name} is not in the game yet`);
    if (uids.has(p.uid)) errors.push(`item: uid ${p.uid} is used twice`);
    uids.add(p.uid);
  }
  // 0.6.2s TURRET SLOTS (S8): the installed turret list (absent = the starting layout: nothing to check here). Uids are
  // unique together with the items' and mods'; each entry is a turret def in a slot of this hull, one turret per slot.
  // deck.ts's slot helpers (hero(b), turretSlots) throw on a def that isn't a turret, so stop here if not.
  const slots = hullSlots(b.hero);
  const held = new Set<number>();
  for (const t of b.turrets ?? []) {
    const d = itemDef(t.def);
    if (uids.has(t.uid)) errors.push(`turret: uid ${t.uid} is used twice`);
    uids.add(t.uid);
    if (!d) errors.push(`turret: uid ${t.uid} is unknown item "${t.def}"`);
    else if (d.kind !== "turret") errors.push(`turret: uid ${t.uid} ${d.name} is not a turret`);
    if (t.slot >= slots.length) errors.push(`turret: uid ${t.uid} is in slot ${t.slot}; ${h.name} has ${slots.length} turret slots`);
    else if (held.has(t.slot)) errors.push(`turret: slot ${t.slot} holds more than one turret`);
    held.add(t.slot);
  }
  if (errors.length) return { ok: false, errors };

  // 0.6.1a stars: an integer 1..FUSE_MAX (absent = 1; checkBuildShape already bounds it); signature
  // factories and supplies never merge, so theirs must be absent or 1
  for (const p of [...b.items, ...b.mods]) {
    if (p.stars === undefined) continue;
    if (!Number.isInteger(p.stars) || p.stars < 1 || p.stars > FUSE_MAX) errors.push(`item: uid ${p.uid} has stars ${p.stars}; expected 1..${FUSE_MAX}`);
    else if (p.stars > 1 && !fusible(p.def)) errors.push(`item: uid ${p.uid} ${ITEMS[p.def].name} can't have ${p.stars} stars (signatures and supplies never merge)`);
  }
  // 0.6.2s TURRET SLOTS: a turret's stars are 1..FUSE_MAX too (checkBuildShape already bounds them). S7: a free copy
  // (the hull's starting copy, maybe merged) only of the hero's own starting defs, at most as many of a def as it starts with.
  const starts = new Map<string, number>(), frees = new Map<string, number>();
  for (const s of slots) if (s.start) starts.set(s.start, (starts.get(s.start) ?? 0) + 1);
  for (const t of b.turrets ?? []) {
    if (t.stars !== undefined && (!Number.isInteger(t.stars) || t.stars < 1 || t.stars > FUSE_MAX)) {
      errors.push(`turret: uid ${t.uid} has stars ${t.stars}; expected 1..${FUSE_MAX}`);
    }
    if (!t.free) continue;
    if (!starts.has(t.def)) errors.push(`turret: uid ${t.uid} ${ITEMS[t.def].name} is a free copy, but ${h.name} doesn't start with one`);
    else frees.set(t.def, (frees.get(t.def) ?? 0) + 1);
  }
  for (const [def, n] of frees) {
    const most = starts.get(def)!;
    if (n > most) errors.push(`turret: ${n} free ${ITEMS[def].name} copies, but ${h.name} starts with ${most}`);
  }
  if (FUSE_LIVE) for (const m of unfusedPairs(b)) errors.push(`item: ${m}`);

  // 0.6.2 BELTSIDE (D2) rot: an integer 0..MAX_ROT (checkBuildShape already bounds it), on a rig only
  for (const p of b.items) {
    if (p.rot === undefined) continue;
    if (!Number.isInteger(p.rot) || p.rot < 0 || p.rot > MAX_ROT) errors.push(`item: uid ${p.uid} has rot ${p.rot}; expected 0..${MAX_ROT}`);
    else if (ITEMS[p.def].kind !== "gate") errors.push(`item: uid ${p.uid} ${ITEMS[p.def].name} can't have a rot (only rigs turn)`);
  }

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

  // placement: deck equipment only, on the deck, no overlaps (canPlaceItem = the editor's rule). 0.6.2
  // BELTSIDE (D2, R1): canPlaceItem now refuses a rig on a belt tile too (BELT IN THE WAY), and routeProblem
  // below refuses a route under any machinery, so no machinery stands on a belt tile.
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

  // routes: well formed, no crossings, connected to a claimed connector, belt ≤ beltCap. 0.6.2j (J2, J12): a joining
  // belt's join must be legal (joinProblem: next to its join tile, another belt's tile, not itself, no loop); it
  // claims no connector and counts as connected when its chain ends on a claimed one; its cells alone count as belt
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
    const jp = joinProblem(b, i, occ); // 0.6.2j (J12); routeCheck.ts reports it in the same words
    if (jp) errors.push(`route: route ${i} can't join cell ${r.join}: ${jp}`);
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

  // turret equipment: a real turret; 0.6.1b, one bought turret core per socket (deck.ts coreFor). Cores ride in
  // build.mods, so buildCost already counts them. 0.6.2s TURRET SLOTS (S4, S8): ModPlacement.turret is a slot of the
  // hull (turretSlots); neither gear nor a core on an empty slot; at most the installed turret's GEAR SLOTS of gear
  // (a 1-star common, so every starting turret, has one: one mod per hardpoint, turretHasFreeHardpoint, reported per
  // extra piece as before; with more gear slots, once per turret) and never two copies of one gear def on a turret.
  const views = turretSlots(b);
  const installed = views.filter((s) => s.turret).length;
  const gearOn = new Map<number, number>();
  for (const m of b.mods) if (ITEMS[m.def].kind !== "core") gearOn.set(m.turret, (gearOn.get(m.turret) ?? 0) + 1);
  const mounted = new Map<number, string[]>(), socketed = new Set<number>();
  for (const m of b.mods) {
    const d = ITEMS[m.def];
    const core = d.kind === "core";
    if (d.kind !== "mod" && !core) errors.push(`hardpoint: uid ${m.uid} ${d.name} is not turret equipment`);
    const v = views[m.turret];
    const gear = mounted.get(m.turret) ?? [];
    if (!v) errors.push(`hardpoint: uid ${m.uid} targets turret ${m.turret}; ${h.name} has ${views.length}`);
    else if (!v.turret) errors.push(`hardpoint: uid ${m.uid} targets turret ${m.turret}; ${h.name} has ${installed} installed: uid ${m.uid} ${d.name} is on an empty turret slot ${m.turret}`);
    else if (core && socketed.has(m.turret)) errors.push(`hardpoint: turret ${m.turret} carries more than one core`);
    else if (!core && gear.length >= v.gearSlots) {
      if (v.gearSlots <= 1) errors.push(`hardpoint: turret ${m.turret} carries more than one module`);
      else if (gear.length === v.gearSlots) errors.push(`hardpoint: turret ${m.turret} carries ${gearOn.get(m.turret)} gear; its turret has ${v.gearSlots} gear slots`);
    } else if (!core && gear.includes(m.def)) errors.push(`hardpoint: turret ${m.turret} carries two ${d.name}`);
    if (core) socketed.add(m.turret);
    else mounted.set(m.turret, [...gear, m.def]);
  }

  // 0.7.0 player mode: the road's reachable hull and belt, and maxHonestSpend, replace the two blocks below
  if (mode === "player") {
    errors.push(...playerSupplyBudget(b, day, buildCost(b)));
    return { ok: errors.length === 0, errors };
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
    const turrets = cost.turrets ? `, turrets ${cost.turrets}` : ""; // 0.6.2s: only when the turrets cost anything
    errors.push(`budget: build costs ${cost.total} gold (items ${cost.items}, mods ${cost.mods}, ${cost.crates} crates, ${cost.plates} plating${turrets}) but day ${day} allows at most ${max}`);
  }
  return { ok: errors.length === 0, errors };
}
