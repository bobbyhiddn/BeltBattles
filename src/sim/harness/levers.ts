// Balance harness levers: every way randomBuild spends gold or reshapes a deck. v0's five
// (gate, mod, plating, route, press) plus three from v1:
// - sync (FOUNDRY): Crucible twins matched (same length, the two connectors of one gun) and
//   every speed gate mirrored at the same cell index on both routes, so twin blanks keep
//   arriving together. Once applied, normalize() holds it after every later lever.
// - order: flat-bonus gates (Whetstone, Long Haul) ahead of Splitters on every route: reorder
//   in place, or buy the missing Splitter / flat gate. Also held by normalize().
// - drop (WEAVER, SIPHON): the build screen's REMOVE BELT works on signature belts and
//   validateBuild accepts a factory feeding fewer routes than it has outputs, so a signature
//   route may be dropped to free a connector for a Stamp Press line; its gates move onto the
//   new line. Never for a twin-pour factory (one route alone never fuses).
// Gates are never left off-route: they only act on payloads riding their cell.

import { GRID, HEROES, ITEMS, rarityWeights, type ItemDef } from "../content";
import { cloneBuild, footprint, itemByUid, kx, ky, occupancy, routeInfo, routesOf, type Build, type Placed } from "../deck";
import { buildCost } from "../../net/validate";
import { fusibleCopies, gainInto, previewMerge } from "./merge";
import { blockedCells, freeConnectors, startCells } from "./path";
import { MAX_ROUTE_EDITS, PLATE, PLATE_HULL, PRESS, isFlatGate, isSpeedGate, isSplitter, type Shopper } from "./shopper";
import type { GainAt } from "../../game/fuse";

export type Lever = "gate" | "mod" | "plating" | "route" | "press" | "sync" | "order" | "drop" | "merge";
export const LEVERS: readonly Lever[] = ["gate", "mod", "plating", "route", "press", "sync", "order", "drop", "merge"];

export function canApply(s: Shopper, l: Lever): boolean {
  const left = s.left(), b = s.b;
  switch (l) {
    case "plating": return left >= PLATE.price;
    case "gate": return left >= s.minGate && s.freeRouteCells().length > 0;
    case "mod": return left >= s.minMod && HEROES[b.hero].turrets.some((_, t) => !b.mods.some((m) => m.turret === t));
    case "press": return left >= PRESS.price && freeConnectors(b).length > 0;
    case "route": return s.edits < MAX_ROUTE_EDITS && b.routes.length > 0;
    case "sync": return !s.synced && s.twinRoutes() !== null;
    case "order": return routesOutOfOrder(b).length > 0 || buyMoves(s).length > 0;
    case "drop": return left >= PRESS.price && freeConnectors(b).length === 0 && droppable(b).length > 0;
    case "merge": return s.stars && mergeableDefs(s).length > 0;
  }
}

export function applyLever(s: Shopper, l: Lever): boolean {
  switch (l) {
    case "plating": s.b.hullBonus += PLATE_HULL; return true;
    case "gate": return gate(s);
    case "mod": return mod(s);
    case "press": return pressLine(s, []);
    case "route": s.edits++; return reroute(s);
    case "sync": return sync(s);
    case "order": return order(s);
    case "drop": return drop(s);
    case "merge": return merge(s);
  }
}

/** Keep a synced or ordered build that way after any lever (both steps are idempotent). */
export function normalize(s: Shopper): void {
  if (s.synced) mirrorSpeed(s);
  if (s.ordered) for (const ri of routesOutOfOrder(s.b)) sortRoute(s.b, ri);
}

/** A gate on a free belt tile; the type is drawn with the shop's rarity weights for the day. */
function gate(s: Shopper): boolean {
  const left = s.left(), w = rarityWeights(s.day);
  const pool = s.gates.filter((d) => d.price <= left && w[d.rarity] > 0 && s.canGain(d.id));
  const cells = s.freeRouteCells();
  if (!pool.length || !cells.length) return false;
  const d = s.rng.weighted(pool, (g) => w[g.rarity] / s.gates.filter((x) => x.rarity === g.rarity).length);
  s.placeGate(d.id, s.rng.pick(cells));
  return true;
}

/** A turret module on a free hardpoint, preferring guns that some belt feeds. */
function mod(s: Shopper): boolean {
  const b = s.b, h = HEROES[b.hero], left = s.left();
  const free = h.turrets.map((_, t) => t).filter((t) => !b.mods.some((m) => m.turret === t));
  const fed = new Set(b.routes.map((r) => h.turrets.findIndex((t) => t.connectors.includes(r.cells[r.cells.length - 1] % GRID))));
  const live = free.filter((t) => fed.has(t));
  const pool = s.mods.filter((d) => d.price <= left && s.canGain(d.id));
  if (!pool.length || !free.length) return false;
  // same RNG order as v1 (def, then turret) whether or not this ends up merging
  const def = s.rng.pick(pool).id;
  const turret = s.rng.pick(live.length ? live : free);
  if (s.stars) gainInto(s, b, def, { turret });
  else b.mods.push({ uid: s.uid++, def, turret });
  return true;
}

/** Reroute a random route. Crucible twins: synced builds move as a matched pair; otherwise
 *  half the time the sibling is redrawn to the same tile count (v0). */
function reroute(s: Shopper): boolean {
  const ri = s.rng.int(s.b.routes.length);
  const tw = s.twinRoutes();
  const sib = tw && tw.includes(ri) ? (tw[0] === ri ? tw[1] : tw[0]) : -1;
  if (sib >= 0 && s.synced) return moveTwins(s, ri, sib);
  if (!s.moveRoute(ri)) return false;
  if (sib >= 0 && s.rng.chance(0.5)) s.moveRoute(sib, s.b.routes[ri].cells.length);
  return true;
}

/** Redraw twin `a` anywhere, then its sibling to the same length into the partner connector. */
function moveTwins(s: Shopper, a: number, sib: number): boolean {
  const snap = cloneBuild(s.b);
  for (let tries = 0; tries < 3; tries++) {
    if (!s.moveRoute(a)) continue;
    const col = s.partnerCol(a, sib);
    if (col >= 0 && s.moveRoute(sib, s.b.routes[a].cells.length, col)) return true;
    s.restore(snap);
  }
  return s.restore(snap);
}

/** Match the twins (cheapest first: redraw only the sibling). */
function matchTwins(s: Shopper, a: number, sib: number): boolean {
  if (s.twinsMatched(a, sib)) return true;
  const col = s.partnerCol(a, sib);
  return (col >= 0 && s.moveRoute(sib, s.b.routes[a].cells.length, col)) || moveTwins(s, a, sib);
}

function sync(s: Shopper): boolean {
  const [a, sib] = s.twinRoutes()!;
  if (!matchTwins(s, a, sib)) return false;
  s.synced = true;
  mirrorSpeed(s);
  addSpeedPair(s);
  return true;
}

/** Same speed gate (or none) at every cell index of both twins; unmatched copies are bought
 *  when affordable, else the lone speed gate goes. */
function mirrorSpeed(s: Shopper): void {
  const tw = s.twinRoutes();
  if (!tw || !matchTwins(s, tw[0], tw[1])) return;
  const [a, sib] = tw;
  for (let i = 0; i < s.b.routes[a].cells.length; i++) {
    const ga = s.itemAt(s.b.routes[a].cells[i]), gb = s.itemAt(s.b.routes[sib].cells[i]);
    const sa = ga && isSpeedGate(ITEMS[ga.def]) ? ga : undefined;
    const sb = gb && isSpeedGate(ITEMS[gb.def]) ? gb : undefined;
    if (sa?.def === sb?.def) continue;
    if (sa && sb) s.removeItem(sb.uid); // different speeds: the sibling takes route a's
    const src = (sa ?? sb)!;
    if (!copyGateTo(s, src.def, sa ? sib : a, i)) s.removeItem(src.uid);
  }
}

/** Buy `def` onto cell index i of route ri, first moving a non-speed gate there to a free tile. */
function copyGateTo(s: Shopper, def: string, ri: number, i: number): boolean {
  if (s.left() < ITEMS[def].price || !s.canGain(def)) return false;
  const cells = s.b.routes[ri].cells, k = cells[i];
  const there = s.itemAt(k);
  if (there) {
    const occ = occupancy(s.b);
    const free = cells.filter((c, j) => j !== i && occ[c].item < 0);
    if (!free.length) return false;
    const to = s.rng.pick(free);
    there.x = kx(to);
    there.y = ky(to);
  }
  s.placeGate(def, k);
  return true;
}

/** Buy one speed gate pair at the same free cell index on both twins, when affordable. */
function addSpeedPair(s: Shopper): void {
  const [a, sib] = s.twinRoutes()!;
  const w = rarityWeights(s.day), left = s.left();
  const pool = s.gates.filter((d) => isSpeedGate(d) && w[d.rarity] > 0 && 2 * d.price <= left);
  const ra = s.b.routes[a].cells, rb = s.b.routes[sib].cells, occ = occupancy(s.b);
  const idx = ra.map((_, i) => i).filter((i) => occ[ra[i]].item < 0 && occ[rb[i]].item < 0);
  if (!pool.length || !idx.length || !s.twinsMatched(a, sib)) return;
  const d = s.rng.weighted(pool, (g) => w[g.rarity]);
  const i = s.rng.pick(idx);
  if (!s.canGain(d.id)) return; // F8 cap (always true at FUSE_MAX): the first copy
  s.placeGate(d.id, ra[i]);
  if (!s.canGain(d.id)) return; // the second copy may chain further than the first
  s.placeGate(d.id, rb[i]);
}

interface SeqGate { uid: number; def: ItemDef; ci: number }

/** Gates along route ri in travel order, with their cell index. */
export function gateSeq(b: Build, ri: number): SeqGate[] {
  const info = routeInfo(b, ri);
  return info.gates.map((u, j) => ({ uid: u, def: ITEMS[itemByUid(b, u)!.def], ci: info.gateCells[j] }));
}

/** Does a Splitter come before a flat-bonus gate on this route? */
export function outOfOrder(seq: SeqGate[]): boolean {
  let split = false;
  for (const g of seq) {
    if (isSplitter(g.def)) split = true;
    else if (split && isFlatGate(g.def)) return true;
  }
  return false;
}

export function routesOutOfOrder(b: Build): number[] {
  return b.routes.map((_, ri) => ri).filter((ri) => outOfOrder(gateSeq(b, ri)));
}

/** Flat-bonus gates first, then Splitters, on the cells those gates already hold. */
function sortRoute(b: Build, ri: number): void {
  const seq = gateSeq(b, ri).filter((g) => isFlatGate(g.def) || isSplitter(g.def));
  const want = [...seq.filter((g) => isFlatGate(g.def)), ...seq.filter((g) => isSplitter(g.def))];
  want.forEach((g, j) => {
    const p = itemByUid(b, g.uid)!, k = b.routes[ri].cells[seq[j].ci];
    p.x = kx(k);
    p.y = ky(k);
  });
}

/** Purchases that create an ordered pair: a Splitter after a route's last flat gate, or a flat
 *  gate before a route's first Splitter. */
function buyMoves(s: Shopper): { defs: ItemDef[]; cells: number[] }[] {
  const w = rarityWeights(s.day), left = s.left(), occ = occupancy(s.b);
  const ok = (d: ItemDef) => w[d.rarity] > 0 && d.price <= left && s.canGain(d.id);
  const splitters = s.gates.filter((d) => isSplitter(d) && ok(d)), flats = s.gates.filter((d) => isFlatGate(d) && ok(d));
  const out: { defs: ItemDef[]; cells: number[] }[] = [];
  s.b.routes.forEach((r, ri) => {
    const seq = gateSeq(s.b, ri);
    const f = seq.filter((g) => isFlatGate(g.def)), sp = seq.filter((g) => isSplitter(g.def));
    const free = r.cells.map((k, i) => (occ[k].item < 0 ? i : -1)).filter((i) => i >= 0);
    const after = f.length ? free.filter((i) => i > f[f.length - 1].ci) : [];
    const before = sp.length ? free.filter((i) => i < sp[0].ci) : [];
    if (f.length && !sp.length && splitters.length && after.length) out.push({ defs: splitters, cells: after.map((i) => r.cells[i]) });
    if (sp.length && !f.length && flats.length && before.length) out.push({ defs: flats, cells: before.map((i) => r.cells[i]) });
  });
  return out;
}

function order(s: Shopper): boolean {
  s.ordered = true;
  const bad = routesOutOfOrder(s.b);
  for (const ri of bad) sortRoute(s.b, ri);
  if (bad.length) return true;
  const moves = buyMoves(s);
  if (!moves.length) return false;
  const m = s.rng.pick(moves);
  s.placeGate(s.rng.pick(m.defs).id, s.rng.pick(m.cells));
  return true;
}

/** Which v1 lever shapes a finished build shows (for the report's trait table). */
export interface Traits {
  ordered: boolean; // some route has a flat gate before a Splitter, and none has one after a Splitter
  reverse: boolean; // some route has a Splitter before a flat-bonus gate
  synced: boolean; // Crucible twins matched with the same speed gates at every cell index
  speedSynced: boolean; // synced, with at least one mirrored speed gate pair
  dropped: boolean; // the signature factory feeds fewer routes than at the start (a route was dropped)
  press: boolean;
}

export function buildTraits(b: Build, startRoutes: number): Traits {
  const bad = routesOutOfOrder(b).length > 0;
  const both = b.routes.some((_, ri) => {
    const seq = gateSeq(b, ri);
    return seq.some((g) => isFlatGate(g.def)) && seq.some((g) => isSplitter(g.def));
  });
  const sig = b.items.find((p) => p.def === HEROES[b.hero].factory);
  const own = sig ? routesOf(b, sig.uid) : [];
  let synced = false, speedSynced = false;
  if (sig && ITEMS[sig.def].factory?.ammo === "blank" && own.length === 2) {
    const [ia, ic] = own.map((ri) => routeInfo(b, ri));
    const occ = occupancy(b);
    const speeds = (ri: number) => b.routes[ri].cells.map((k) => {
      const p = b.items.find((q) => q.uid === occ[k].item);
      return p && isSpeedGate(ITEMS[p.def]) ? p.def : "";
    });
    const sa = speeds(own[0]), sc = speeds(own[1]);
    synced = ia.turret >= 0 && ia.turret === ic.turret && ia.tiles === ic.tiles && sa.join() === sc.join();
    speedSynced = synced && sa.some((d) => d !== "");
  }
  return {
    ordered: both && !bad, reverse: bad, synced, speedSynced,
    dropped: own.length < startRoutes, press: b.items.some((p) => p.def === PRESS.id),
  };
}

/** Signature routes that may be dropped: the factory keeps at least one route, never a Crucible. */
export function droppable(b: Build): number[] {
  const sig = b.items.find((p) => p.def === HEROES[b.hero].factory);
  if (!sig || ITEMS[sig.def].factory?.ammo === "blank") return [];
  const own = routesOf(b, sig.uid);
  return own.length >= 2 ? own : [];
}

/** REMOVE BELT on a signature route, then a Stamp Press line into the freed connector. */
function drop(s: Shopper): boolean {
  const own = droppable(s.b);
  if (!own.length) return false;
  const snap = cloneBuild(s.b);
  const ri = s.rng.pick(own);
  const occ = occupancy(s.b);
  const lifted = new Set(s.b.routes[ri].cells.map((k) => occ[k].item).filter((u) => u >= 0));
  const carried = s.b.items.filter((p) => lifted.has(p.uid));
  s.b.items = s.b.items.filter((p) => !lifted.has(p.uid));
  s.b.routes.splice(ri, 1);
  return pressLine(s, carried) || s.restore(snap);
}

/** A Stamp Press on a free 2x2 spot (not the forward row) with a line into a free connector;
 *  `carried` gates go onto the new line (any that don't fit are not bought). 0.6.1a: if a 1-star
 *  Press is already placed elsewhere, this purchase merges into it instead (no new footprint or
 *  route to find — a Press has one output at any star, so a second route would be illegal); any
 *  `carried` gates then have nowhere new to go and are dropped, same as the trade-off ARSENAL.md
 *  §4.1 rule 5 already accepts for a merging drop (the target is ignored, not honoured). */
function pressLine(s: Shopper, carried: Placed[]): boolean {
  const b = s.b;
  if (!s.canGain(PRESS.id)) return false; // F8 cap (always true at FUSE_MAX and with stars off)
  if (s.stars) {
    const preview = previewMerge(b, s.uid, PRESS.id);
    if (preview && preview.where !== "cargo") {
      gainInto(s, b, PRESS.id, { x: 0, y: 0 }); // target ignored: merges into the existing placed press
      return true;
    }
  }
  for (let tries = 0; tries < 8; tries++) {
    const x = s.rng.int(GRID - 1), y = 1 + s.rng.int(GRID - 2);
    const occ = occupancy(b);
    if (footprint(PRESS, x, y).some((k) => occ[k].item >= 0 || occ[k].route >= 0)) continue;
    const snap = cloneBuild(b);
    const uid = s.uid; // gainInto (stars on) mints this same uid; the raw push (off) mints it too
    if (s.stars) gainInto(s, b, PRESS.id, { x, y }); // no twin (checked above): lands at x,y, as pushed
    else { b.items.push({ uid, def: PRESS.id, x, y }); s.uid++; }
    const bl = blockedCells(b);
    const cells = s.drawRoute(-1, startCells(x, y, PRESS.size, bl), bl, s.left());
    if (cells) {
      s.buyBelt(-1, cells.length);
      b.routes.push({ factory: uid, cells });
      const spots = carried.length ? s.rng.shuffle([...cells]) : [];
      carried.slice(0, cells.length).forEach((p, i) => b.items.push({ ...p, x: kx(spots[i]), y: ky(spots[i]) }));
      if (buildCost(b).total <= s.budget) return true;
    }
    s.restore(snap);
  }
  return false;
}

/** Fusible defs (below 3 stars, factories excluded: a Press's single route makes a second one
 *  unplaceable, so it merges only opportunistically through the "press"/"drop" levers above) the
 *  "merge" lever could buy one more 1-star copy of right now: affordable, and either an immediate
 *  merge (a 1-star twin is already placed, so no new spot is needed) or a genuinely free spot. */
function mergeableDefs(s: Shopper): string[] {
  const b = s.b, left = s.left();
  const present = fusibleCopies(b).filter((c) => c.kind !== "factory");
  if (!present.length) return [];
  const oneStar = new Set(present.filter((c) => c.stars === 1).map((c) => c.def));
  const cells = s.freeRouteCells();
  const freeT = HEROES[b.hero].turrets.map((_, t) => t).filter((t) => !b.mods.some((m) => m.turret === t));
  return [...new Set(present.map((c) => c.def))].filter((d) => {
    if (ITEMS[d].price > left || !s.canGain(d)) return false;
    if (oneStar.has(d)) return true; // will merge immediately: no placement needed
    return ITEMS[d].kind === "gate" ? cells.length > 0 : freeT.length > 0;
  });
}

/** Buy one more 1-star copy of an existing fusible def (ARSENAL.md §4.1): the new lever that
 *  teaches the shopper to actually grow stars, on top of the organic duplicates gate/mod/press
 *  can already draw by chance. Repeated application on the same def is how 1+1+1+1 = 3-star. */
function merge(s: Shopper): boolean {
  const defs = mergeableDefs(s);
  if (!defs.length) return false;
  const b = s.b, def = s.rng.pick(defs), kind = ITEMS[def].kind;
  let at: GainAt;
  if (kind === "mod") {
    const freeT = HEROES[b.hero].turrets.map((_, t) => t).filter((t) => !b.mods.some((m) => m.turret === t));
    at = { turret: s.rng.pick(freeT.length ? freeT : [0]) };
  } else {
    const cells = s.freeRouteCells();
    const k = s.rng.pick(cells.length ? cells : [0]);
    at = { x: kx(k), y: ky(k) };
  }
  gainInto(s, b, def, at);
  return true;
}
