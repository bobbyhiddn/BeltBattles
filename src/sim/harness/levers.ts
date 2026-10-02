// Balance harness levers: every way randomBuild spends gold or reshapes a deck. v0's five
// (gate, mod, plating, route, press) plus three from v1:
// - sync (FOUNDRY): Crucible twins matched (same length, the two connectors of one gun) and
//   every speed rig hit mirrored at the same tile index on both routes, so twin blanks keep
//   arriving together. Once applied, normalize() holds it after every later lever.
// - order: flat-bonus rigs (Whetstone, Long Haul) ahead of Splitters on every route: swap them
//   in place, or buy the missing Splitter / flat rig. Also held by normalize().
// - drop (WEAVER, SIPHON): the build screen's REMOVE BELT works on signature belts and
//   validateBuild accepts a factory feeding fewer routes than it has outputs, so a signature
//   route may be dropped to free a connector for a Stamp Press line; its rigs move beside the
//   new line. Never for a twin-pour factory (one route alone never fuses).
// and harness v2's two: merge (buy one more copy of a fusible module the deck holds, so stars grow) and core
// (0.6.1b: buy and fit a turret core), both through the game's gainModule (merge.ts gainInto).
// 0.6.2 BELTSIDE (ref/DESIGN-beltside.md H2): the "gate" lever buys a rig. Rigs stand beside the belt and
// are placed greedily (Shopper.placeRig): a belt tile to work, then the free cell beside it and the rotation
// with the most hits on connected belts. A rig is never left idle: every rig lands at least one arrow on a
// connected belt, and one whose belt moves or goes moves with it.
// beltside-062-on-061 (DESIGN §13 P16): one harness. Harness v2's levers, canGain caps and F6 star-aware twin
// sync, with H2's placeRig wherever v2 places a gate (a merging copy leaves the survivor on its cell with its
// rotation). The twin sync compares, tile index by tile index, the speed hits that land there by def and
// stars (v2 F6); a rig's rotation is what decides which tile its arrow lands on.
// beltside-062-h3 (DESIGN §14 P19-P23): harness v2 part 3's factories on rigs. factoryToBuy, moreRoutes and the
// factory merge are part 3's; the slag rule reads rig tiles and hits (P20, P21: Shopper.rigTilesFor, hasRigTileFor,
// speedOnSlag), and the carried rigs go to work beside a new line before a GANTRY draws its extra routes (P22).
// Factories off, every draw is beltside-062-on-061's (P19).

import { AMMO, GRID, HEROES, ITEMS, rarityWeights, type ItemDef } from "../content";
import {
  cloneBuild, coreFor, footprint, gearFor, hero, hitsOfRig, installedTurrets, itemByUid, occupancy, rigHits, rotOf,
  routeInfo, routesOf, setRot, type Build, type Placed, type RigHit,
} from "../deck";
import { beltIndex, hitsIfPlaced, rotations, type WouldHit } from "../beltside";
import { outputsAt, starsOf } from "../stars";
import { fusibleCopies, gainInto, previewMerge } from "./merge";
import { blockedCells, freeConnectors, shortestTiles, startCells } from "./path";
import { MAX_ROUTE_EDITS, PLATE, PLATE_HULL, PRESS, isFlatGate, isSpeedGate, isSplitter, type Accept, type Shopper } from "./shopper";
import type { GainAt } from "../../game/fuse";

// 0.6.1b (harness v2 part 2): "core" is last, so personality() draws its weight after every part-1
// lever's, and only when cores are on: with cores off every RNG draw is exactly part 1's.
export type Lever = "gate" | "mod" | "plating" | "route" | "press" | "sync" | "order" | "drop" | "merge" | "core";
export const LEVERS: readonly Lever[] = ["gate", "mod", "plating", "route", "press", "sync", "order", "drop", "merge", "core"];

/** 0.6.1b: turrets whose gear hardpoint is free. The core socket is separate: deck.ts
 *  turretHasFreeHardpoint/gearFor (c432bee deck.ts:483-489) count gear only. With no core fitted this is
 *  exactly v1's "no module on the turret". */
const gearFree = (b: Build): number[] => turretIndices(b).filter((t) => !gearFor(b, t));
/** 0.6.2s (REQ-BFG-031 S9): the build's installed turrets' slots (deck.ts installedTurrets): 0..n-1 for the
 *  starting layout, which is every deck the harness builds, so every list and RNG draw below is unchanged. */
function turretIndices(b: Build): number[] {
  return installedTurrets(b).map((s) => s.slot);
}
/** 0.6.1b: turrets whose core socket is empty (deck.ts coreFor, c432bee deck.ts:478): they run the hero's
 *  implicit signature core (ARSENAL.md §2.1 rule 1), which is never an item and never bought. */
const socketFree = (b: Build): number[] => turretIndices(b).filter((t) => !coreFor(b, t));

export function canApply(s: Shopper, l: Lever): boolean {
  const left = s.left(), b = s.b;
  switch (l) {
    case "plating": return left >= PLATE.price;
    case "gate": return left >= s.minGate && s.hasRigTile();
    case "mod": return left >= s.minMod && gearFree(b).length > 0;
    // 0.6.1c: with factories on, "press" and "drop" buy any factory the hero can buy (the cheapest decides)
    case "press": return left >= (s.factoriesOn ? s.minFactory : PRESS.price) && freeConnectors(b).length > 0;
    case "route": return s.edits < MAX_ROUTE_EDITS && b.routes.length > 0;
    case "sync": return !s.synced && s.twinRoutes() !== null;
    case "order": return routesOutOfOrder(b).length > 0 || buyMoves(s).length > 0;
    case "drop": return left >= (s.factoriesOn ? s.minFactory : PRESS.price) && freeConnectors(b).length === 0 && droppable(b).length > 0;
    case "merge": return s.stars && mergeableDefs(s).length > 0;
    case "core": return s.coresOn && left >= s.minCore;
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
    case "core": return core(s);
  }
}

/** Keep a synced or ordered build that way after any lever (both steps are idempotent). */
export function normalize(s: Shopper): void {
  if (s.synced) mirrorSpeed(s);
  if (s.ordered) for (const ri of routesOutOfOrder(s.b)) sortRoute(s.b, ri);
}

/** A rig put to work on a random belt tile that has a free side (H2 placement); the type is drawn with
 *  the shop's rarity weights for the day (v2: among the defs one more copy of may be gained). */
function gate(s: Shopper): boolean {
  const left = s.left(), w = rarityWeights(s.day);
  const pool = s.gates.filter((d) => d.price <= left && w[d.rarity] > 0 && s.canGain(d.id));
  const tiles = s.rigTiles();
  if (!pool.length || !tiles.length) return false;
  const d = s.rng.weighted(pool, (g) => w[g.rarity] / s.gates.filter((x) => x.rarity === g.rarity).length);
  // 0.8.0 I1 M3: a STOKER works factories, never belts: it stands beside a factory (Shopper.placeStoker)
  if (d.gate?.stoke) return s.placeStoker(d.id) !== null;
  const ok = s.rigTilesFor(d, tiles); // 0.6.1c (P20 on rigs): factories on, no speed rig works a slag route's tile (off: `tiles` itself)
  if (!ok.length) return false;
  const [ri, ti] = s.rng.pick(ok);
  return s.placeRig(d.id, ri, ti) !== null;
}

/** A turret module on a free hardpoint, preferring guns that some belt feeds. */
function mod(s: Shopper): boolean {
  const b = s.b, left = s.left();
  const free = gearFree(b); // 0.6.1b: a fitted core doesn't take the gear hardpoint
  const fed = fedTurrets(b);
  const live = free.filter((t) => fed.has(t));
  const pool = s.mods.filter((d) => d.price <= left && s.canGain(d.id));
  if (!pool.length || !free.length) return false;
  // same RNG order as v1 (def, then turret) whether or not this ends up merging
  const def = s.rng.pick(pool).id;
  const turret = s.rng.pick(live.length ? live : free);
  if (s.stars) gainInto(s, b, def, { turret }, s.cargo);
  else b.mods.push({ uid: s.uid++, def, turret });
  return true;
}

/** Turrets some belt feeds (the mod lever's "live" guns, v1). */
function fedTurrets(b: Build): Set<number> {
  const h = hero(b); // 0.6.2s: the build's slots (an empty one has no connectors, so it never matches)
  return new Set(b.routes.map((r) => h.turrets.findIndex((t) => t.connectors.includes(r.cells[r.cells.length - 1] % GRID))));
}

/**
 * 0.6.1b: buy a turret core the hero's caravan sells (shopItems(hero, "core"); drawn with the shop's rarity
 * weights for the day, like the gate lever) and fit it, following the game (c432bee):
 * - a copy that merges into a FITTED twin goes in as buyOffer does it (run.ts:330, `pv.where !== "cargo"`:
 *   the gain enters cargo and gainModule fuses it into the placed twin, which keeps its socket; fuse.ts:74-85);
 * - else an empty socket comes first (a fed gun preferred, as the mod lever does);
 * - else a DIFFERENT core on a full socket is swapped: gainModule's freeSocket sends the bought core there to
 *   cargo with its stars (fuse.ts:139-144, ARSENAL.md §2.1 rule 6); cargo doesn't fight, its gold stays spent.
 *   A same-def core already fitted is never swapped out for its own copy.
 * Every gain runs through gainInto (fuse.ts gainModule), which also merges with a cargo twin (placed beats
 * cargo). The validator's rule (validate.ts:192-202: one core per socket, one mod per hardpoint) holds.
 */
function core(s: Shopper): boolean {
  const b = s.b, left = s.left(), w = rarityWeights(s.day);
  const pool = s.cores.filter((d) => d.price <= left && w[d.rarity] > 0 && s.canGain(d.id));
  if (!pool.length) return false;
  const d = s.rng.weighted(pool, (g) => w[g.rarity] / s.cores.filter((x) => x.rarity === g.rarity).length);
  const pv = previewMerge(b, s.uid, d.id, s.cargo);
  if (pv && pv.where !== "cargo") {
    gainInto(s, b, d.id, { turret: 0 }, s.cargo); // merges into the fitted twin; the target is ignored (buyOffer)
    return true;
  }
  const empty = socketFree(b);
  let turret: number;
  if (empty.length) {
    const fed = fedTurrets(b), live = empty.filter((t) => fed.has(t));
    turret = s.rng.pick(live.length ? live : empty);
  } else {
    const other = turretIndices(b).filter((t) => coreFor(b, t)!.def !== d.id);
    if (!other.length) return false;
    turret = s.rng.pick(other);
    s.swaps++;
  }
  gainInto(s, b, d.id, { turret }, s.cargo);
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

/** A speed hit's identity for the twin sync: its rig's def and (v2 F6) star level, "grease" at 1 star and
 *  "grease*2" above, so a stars-off profile reads exactly as before (a 2-star and a 1-star copy run at
 *  different speeds, so they are different). */
const speedKey = (b: Build, h: RigHit): string => {
  const st = starsOf(itemByUid(b, h.uid));
  return st > 1 ? `${h.def}*${st}` : h.def;
};

/** Per tile of route ri, the speed rigs landing on it (def and stars, sorted, "+"-joined; "" for none): the
 *  belt's speed profile. Two belts with the same profile hold the same speed on every tile (R7 item 4). */
export function speedProfile(b: Build, ri: number, hits: RigHit[][][] = rigHits(b)): string[] {
  return (hits[ri] ?? []).map((t) => t.filter((h) => isSpeedGate(ITEMS[h.def])).map((h) => speedKey(b, h)).sort().join("+"));
}

const speedHitsAt = (hits: RigHit[][][], ri: number, i: number): RigHit[] => (hits[ri]?.[i] ?? []).filter((h) => isSpeedGate(ITEMS[h.def]));

/** Hits in `xs` with no same-def, same-star partner left in `ys` (multiset difference by speedKey). */
function unmatched(b: Build, xs: RigHit[], ys: RigHit[]): RigHit[] {
  const left = ys.map((h) => speedKey(b, h));
  return xs.filter((h) => {
    const j = left.indexOf(speedKey(b, h));
    if (j < 0) return true;
    left.splice(j, 1);
    return false;
  });
}

/** A new rig may land on the twins only once: at the tile it is placed to work. */
const onceOnTwins = (a: number, c: number): Accept => (hs) => hs.filter((h) => h.route === a || h.route === c).length === 1;

/** The same speed rigs (or none) on every tile index of both twins. A lone speed hit gets a copy bought
 *  beside the other twin at the same tile when affordable, else its rig goes; where both twins have speed
 *  hits that differ, the sibling takes route a's. A rig that lands on several twin tiles can defeat the
 *  pairing; after a bounded number of fixes any speed rig still on the twins goes. 0.6.1a (F6): "same" is
 *  the same def AND the same star level; stars off every copy is 1-star, so this is v1's def comparison. */
function mirrorSpeed(s: Shopper): void {
  const tw = s.twinRoutes();
  if (!tw || !matchTwins(s, tw[0], tw[1])) return;
  const [a, c] = tw;
  for (let guard = 0; guard < 12; guard++) {
    const hits = rigHits(s.b);
    const pa = speedProfile(s.b, a, hits), pc = speedProfile(s.b, c, hits);
    const i = pa.findIndex((x, j) => x !== pc[j]);
    if (i < 0) return;
    const la = speedHitsAt(hits, a, i), lc = speedHitsAt(hits, c, i);
    const onlyA = unmatched(s.b, la, lc), onlyC = unmatched(s.b, lc, la);
    if (onlyA.length && onlyC.length) {
      s.removeItem(onlyC[0].uid); // different speeds: the sibling takes route a's
      continue;
    }
    const src = onlyA[0] ?? onlyC[0];
    if (!copyRigTo(s, src.def, starsOf(itemByUid(s.b, src.uid)), onlyA.length ? c : a, i, onceOnTwins(a, c))) s.removeItem(src.uid);
  }
  const hits = rigHits(s.b);
  if (speedProfile(s.b, a, hits).join() !== speedProfile(s.b, c, hits).join()) {
    for (const h of [...hits[a], ...hits[c]].flat()) if (isSpeedGate(ITEMS[h.def])) s.removeItem(h.uid);
  }
}

/** Buy `def` to work tile i of route ri, when affordable and a cell beside it is accepted. 0.6.1a (F6): with
 *  stars on the bought copy must mirror a `stars` copy. A new copy lands at 1 star, and it merges into any
 *  1-star twin (the source itself at 1 star): a copy that merges, or lands at another star level, is no
 *  mirror, so nothing is bought and the caller drops the lone rig. */
function copyRigTo(s: Shopper, def: string, stars: number, ri: number, i: number, accept: Accept): boolean {
  if (s.left() < ITEMS[def].price || !s.canGain(def)) return false;
  if (s.stars && (stars !== 1 || previewMerge(s.b, s.uid, def))) return false;
  return s.placeRig(def, ri, i, accept) !== null;
}

/** Buy one speed rig pair at the same tile index of both twins (no speed hit there yet), when affordable.
 *  F6 (stars on): the second new copy would merge into the first (a merge is no mirror), so a pair bought
 *  now can never stay mirrored; the draws are kept, nothing is bought. */
function addSpeedPair(s: Shopper): void {
  const [a, sib] = s.twinRoutes()!;
  const w = rarityWeights(s.day), left = s.left();
  const pool = s.gates.filter((d) => isSpeedGate(d) && w[d.rarity] > 0 && 2 * d.price <= left);
  if (!pool.length || !s.twinsMatched(a, sib)) return;
  const hits = rigHits(s.b);
  const pa = speedProfile(s.b, a, hits), pc = speedProfile(s.b, sib, hits);
  const open = s.rigTiles((r) => r === a || r === sib);
  const oa = new Set(open.filter(([r]) => r === a).map(([, t]) => t)), oc = new Set(open.filter(([r]) => r === sib).map(([, t]) => t));
  const idx = pa.map((_, i) => i).filter((i) => pa[i] === "" && pc[i] === "" && oa.has(i) && oc.has(i));
  if (!idx.length) return;
  const d = s.rng.weighted(pool, (g) => w[g.rarity]);
  const i = s.rng.pick(idx);
  if (s.stars) return;
  if (!s.canGain(d.id)) return; // F8 cap (always true at FUSE_MAX and with stars off): the first copy
  const snap = cloneBuild(s.b), once = onceOnTwins(a, sib);
  if (!s.placeRig(d.id, a, i, once) || !s.canGain(d.id) || !s.placeRig(d.id, sib, i, once)) s.restore(snap);
}

interface SeqGate { uid: number; def: ItemDef; ci: number }

/** Hits along route ri in travel order (tile, then R7), with their tile index; a rig appears once per arrow. */
export function gateSeq(b: Build, ri: number, hits?: RigHit[][][]): SeqGate[] {
  const info = routeInfo(b, ri, undefined, undefined, hits);
  return info.gates.map((u, j) => ({ uid: u, def: ITEMS[itemByUid(b, u)!.def], ci: info.gateCells[j] }));
}

/** Does a Splitter hit come before a flat-bonus hit on this route? (On one tile R7 applies flat bonuses
 *  first, so a Splitter hit only comes first from an earlier tile.) */
export function outOfOrder(seq: SeqGate[]): boolean {
  let split = false;
  for (const g of seq) {
    if (isSplitter(g.def)) split = true;
    else if (split && isFlatGate(g.def)) return true;
  }
  return false;
}

export function routesOutOfOrder(b: Build): number[] {
  const hits = rigHits(b);
  return b.routes.map((_, ri) => ri).filter((ri) => outOfOrder(gateSeq(b, ri, hits)));
}

/** Turn rig p (where it stands) to work belt cell `tile`: of the rotations that reach it, the one with the
 *  fewest hits `bad` rejects, then the most hits (H2), then its current rotation. */
function aimAt(b: Build, p: Placed, tile: number, bad: (h: WouldHit) => boolean): void {
  const belts = beltIndex(b), cur = rotOf(p);
  let best: { rot: number; bad: number; n: number } | null = null;
  for (const rot of [cur, ...rotations(p.def).filter((r) => r !== cur)]) {
    const hs = hitsIfPlaced(b, p.def, p.x, p.y, rot, belts);
    if (!hs.some((h) => h.cell === tile)) continue;
    const nb = hs.filter(bad).length;
    if (!best || nb < best.bad || (nb === best.bad && hs.length > best.n)) best = { rot, bad: nb, n: hs.length };
  }
  if (best) setRot(p, best.rot);
}

/** Flat-bonus rigs first, then Splitters, on the cells those rigs already hold: the first Splitter that a
 *  flat-bonus hit follows swaps cells with the last such flat-bonus rig, and each is turned to work the tile
 *  the other worked (the Splitter reaching as little before it as it can, the flat rig as little after).
 *  Repeats until the route is in order (a bounded number of swaps). Returns whether anything moved. */
function sortRoute(b: Build, ri: number): boolean {
  let moved = false;
  for (let guard = 0; guard < 8; guard++) {
    const seq = gateSeq(b, ri);
    const si = seq.findIndex((g) => isSplitter(g.def));
    let fi = -1;
    seq.forEach((g, j) => { if (isFlatGate(g.def)) fi = j; });
    if (si < 0 || fi < si) return moved;
    const S = itemByUid(b, seq[si].uid)!, F = itemByUid(b, seq[fi].uid)!;
    const sTile = b.routes[ri].cells[seq[si].ci], fTile = b.routes[ri].cells[seq[fi].ci];
    [S.x, S.y, F.x, F.y] = [F.x, F.y, S.x, S.y];
    aimAt(b, S, fTile, (h) => h.route === ri && h.tile < seq[fi].ci);
    aimAt(b, F, sTile, (h) => h.route === ri && h.tile > seq[si].ci);
    moved = true;
  }
  return moved;
}

/** Purchases that create an ordered pair: a Splitter at or after a route's last flat-bonus hit, or a
 *  flat-bonus rig at or before its first Splitter hit (R7 puts flat bonuses first on a shared tile); the
 *  new rig may not put any belt out of order. v2: only defs one more copy of may be gained. */
function buyMoves(s: Shopper): { defs: ItemDef[]; ri: number; tiles: number[]; accept: Accept }[] {
  const w = rarityWeights(s.day), left = s.left(), hits = rigHits(s.b);
  const ok = (d: ItemDef) => w[d.rarity] > 0 && d.price <= left && s.canGain(d.id);
  const splitters = s.gates.filter((d) => isSplitter(d) && ok(d)), flats = s.gates.filter((d) => isFlatGate(d) && ok(d));
  const seqs = s.b.routes.map((_, ri) => gateSeq(s.b, ri, hits));
  const lastFlat = seqs.map((q) => Math.max(-1, ...q.filter((g) => isFlatGate(g.def)).map((g) => g.ci)));
  const firstSplit = seqs.map((q) => Math.min(Infinity, ...q.filter((g) => isSplitter(g.def)).map((g) => g.ci)));
  const splitOk: Accept = (hs) => hs.every((h) => h.tile >= lastFlat[h.route]);
  const flatOk: Accept = (hs) => hs.every((h) => h.tile <= firstSplit[h.route]);
  const open = s.rigTiles();
  const out: { defs: ItemDef[]; ri: number; tiles: number[]; accept: Accept }[] = [];
  seqs.forEach((seq, ri) => {
    const f = seq.filter((g) => isFlatGate(g.def)), sp = seq.filter((g) => isSplitter(g.def));
    const free = open.filter(([r]) => r === ri).map(([, t]) => t);
    const after = f.length ? free.filter((t) => t >= lastFlat[ri]) : [];
    const before = sp.length ? free.filter((t) => t <= firstSplit[ri]) : [];
    if (f.length && !sp.length && splitters.length && after.length) out.push({ defs: splitters, ri, tiles: after, accept: splitOk });
    if (sp.length && !f.length && flats.length && before.length) out.push({ defs: flats, ri, tiles: before, accept: flatOk });
  });
  return out;
}

function order(s: Shopper): boolean {
  s.ordered = true;
  const bad = routesOutOfOrder(s.b);
  let moved = false;
  for (const ri of bad) moved = sortRoute(s.b, ri) || moved;
  if (bad.length) return moved;
  const moves = buyMoves(s);
  if (!moves.length) return false;
  const m = s.rng.pick(moves);
  return s.placeRig(s.rng.pick(m.defs).id, m.ri, s.rng.pick(m.tiles), m.accept) !== null;
}

/** Which v1 lever shapes a finished build shows (for the report's trait table). */
export interface Traits {
  ordered: boolean; // some route has a flat-bonus hit before a Splitter hit, and none has one after a Splitter
  reverse: boolean; // some route has a Splitter hit before a flat-bonus hit
  synced: boolean; // Crucible twins matched with the same speed rig hits (def and stars) at every tile index
  speedSynced: boolean; // synced, with at least one mirrored speed hit pair
  dropped: boolean; // the signature factory feeds fewer routes than at the start (a route was dropped)
  press: boolean;
  multi: boolean; // 0.6.2 BELTSIDE: some rig lands two or more arrows (on one belt or several)
}

export function buildTraits(b: Build, startRoutes: number): Traits {
  const hits = rigHits(b);
  const bad = b.routes.some((_, ri) => outOfOrder(gateSeq(b, ri, hits)));
  const both = b.routes.some((_, ri) => {
    const seq = gateSeq(b, ri, hits);
    return seq.some((g) => isFlatGate(g.def)) && seq.some((g) => isSplitter(g.def));
  });
  const sig = b.items.find((p) => p.def === HEROES[b.hero].factory);
  const own = sig ? routesOf(b, sig.uid) : [];
  let synced = false, speedSynced = false;
  if (sig && ITEMS[sig.def].factory?.ammo === "blank" && own.length === 2) {
    const [ia, ic] = own.map((ri) => routeInfo(b, ri, undefined, undefined, hits));
    // F6 (patch 0004): speedProfile keys each speed hit by def and stars (a 2-star and a 1-star copy run at
    // different speeds)
    const sa = speedProfile(b, own[0], hits), sc = speedProfile(b, own[1], hits);
    synced = ia.turret >= 0 && ia.turret === ic.turret && ia.tiles === ic.tiles && sa.join() === sc.join();
    speedSynced = synced && sa.some((d) => d !== "");
  }
  const multi = b.items.some((p) => ITEMS[p.def].kind === "gate" && hitsOfRig(b, p.uid, hits).length >= 2);
  return {
    ordered: both && !bad, reverse: bad, synced, speedSynced,
    dropped: own.length < startRoutes, press: b.items.some((p) => p.def === PRESS.id), multi,
  };
}

/** Signature routes that may be dropped: the factory keeps at least one route, never a Crucible. */
export function droppable(b: Build): number[] {
  const sig = b.items.find((p) => p.def === HEROES[b.hero].factory);
  if (!sig || ITEMS[sig.def].factory?.ammo === "blank") return [];
  const own = routesOf(b, sig.uid);
  return own.length >= 2 ? own : [];
}

/** REMOVE BELT on a signature route, then a Stamp Press line into the freed connector; the dropped
 *  route's riders (rigs that worked only it) move beside the new line. */
function drop(s: Shopper): boolean {
  const own = droppable(s.b);
  if (!own.length) return false;
  const snap = cloneBuild(s.b);
  const ri = s.rng.pick(own);
  const carried = s.ridersOf(ri);
  s.lift(carried);
  s.b.routes.splice(ri, 1);
  return pressLine(s, carried) || s.restore(snap);
}

/** 0.6.1c: the factory the "press" and "drop" levers buy. Factories off: the STAMP PRESS, with no RNG draw
 *  (part 2 exactly). On: any factory the hero can buy (Shopper.factories = shopFactories: STAMP PRESS and the
 *  six), affordable and within the stand-in cap, drawn with the day's rarity weights as the gate lever draws a
 *  gate (content.ts rarityWeights; a rarity's weight shared by its defs). */
export function factoryToBuy(s: Shopper): ItemDef | undefined {
  if (!s.factoriesOn) return PRESS;
  const left = s.left(), w = rarityWeights(s.day);
  const pool = s.factories.filter((d) => d.price <= left && w[d.rarity] > 0 && s.canGain(d.id));
  if (!pool.length) return undefined;
  return s.rng.weighted(pool, (g) => w[g.rarity] / s.factories.filter((x) => x.rarity === g.rarity).length);
}

/** 0.6.1c: does `def` stamp a fixed-speed ammo (SLAG POT)? Its own spec and AMMO (see shopper.ts fixedSpeedRoute). */
const fixedSpeedDef = (def: string): boolean => AMMO[ITEMS[def].factory?.ammo ?? "plain"]?.fixedSpeed !== undefined;

/**
 * 0.6.1c: routes into free connectors for the placed factory `uid`, up to outputsAt(its def, its stars)
 * (validateBuild's rule): a GANTRY PRESS feeds every free connector it can reach, up to its outputs, and when a
 * merge raises its outputs (2 stars: a third output) the same lever tries to add the new route (`merged`: counted in
 * Shopper.thirdArm). A route that would take deck + cargo over the day's gold is not drawn. Every other factory
 * has one output at every star and already feeds it, so this draws nothing for them (no RNG either).
 */
function moreRoutes(s: Shopper, uid: number, merged: boolean): void {
  const b = s.b;
  for (;;) {
    const f = b.items.find((p) => p.uid === uid);
    if (!f || routesOf(b, uid).length >= outputsAt(f.def, starsOf(f))) return;
    const bl = blockedCells(b), starts = startCells(f.x, f.y, ITEMS[f.def].size, bl);
    let cells: number[] | null = null;
    for (let t = 0; t < 3 && !cells; t++) cells = s.drawRoute(-1, starts, bl, s.left());
    // random lengths wander (and the first belt walls off the next connector): then the shortest belt around the
    // other belts into each free connector in turn (or 2 tiles longer, the next length of the same parity)
    for (const c of cells ? [] : freeConnectors(b)) {
      const lo = shortestTiles(bl, starts, c);
      if (lo !== Infinity) cells = s.drawRoute(-1, starts, bl, s.left(), lo, c) ?? s.drawRoute(-1, starts, bl, s.left(), lo + 2, c);
      if (cells) break;
    }
    if (!cells) return;
    const snap = cloneBuild(b);
    s.buyBelt(-1, cells.length);
    b.routes.push({ factory: uid, cells });
    if (s.left() < 0) { s.restore(snap); return; }
    if (merged) s.thirdArm++;
  }
}

/** A Stamp Press on a free 2x2 spot (not the forward row) with a line into a free connector;
 *  `carried` rigs go to work beside the new line (any that find no place are not bought). 0.6.1a: if a
 *  1-star Press is already placed elsewhere, this purchase merges into it instead (no new footprint or
 *  route to find — a Press has one output at any star, so a second route would be illegal); any
 *  `carried` rigs then have nowhere new to go and are dropped, same as the trade-off ARSENAL.md
 *  §4.1 rule 5 already accepts for a merging drop (the target is ignored, not honoured).
 *  0.6.1c (factories on): the factory is factoryToBuy's draw, placed the same way; a GANTRY PRESS then draws
 *  a route into every free connector it can reach, up to its outputs (moreRoutes); a merge into a GANTRY that
 *  raises its outputs tries the new route in the same lever; a speed rig carried onto a SLAG POT line is left
 *  behind (it could do nothing there) and counted in Shopper.slag.skipped. Factories off: exactly part 2.
 *  beltside-062-h3 (DESIGN §14 P20, P22): the carried rigs (`load`) go to work beside the new line first
 *  (reseat), then a GANTRY draws its extra routes around every placed item, rigs included (blockedCells); the
 *  fix pass also refuses a new slag line that runs past a speed rig's arrow (Shopper.speedOnSlag). */
function pressLine(s: Shopper, carried: Placed[]): boolean {
  const b = s.b;
  const def = factoryToBuy(s);
  if (!def) return false;
  if (!s.canGain(def.id)) return false; // F8 cap (always true at FUSE_MAX and with stars off)
  if (s.stars) {
    const preview = previewMerge(b, s.uid, def.id, s.cargo);
    if (preview && preview.where !== "cargo") {
      const g = gainInto(s, b, def.id, { x: 0, y: 0 }, s.cargo); // target ignored: merges into the existing placed twin
      if (s.factoriesOn) moreRoutes(s, g.survivor, true);
      return true;
    }
  }
  const load = s.factoriesOn && fixedSpeedDef(def.id) ? carried.filter((p) => !isSpeedGate(ITEMS[p.def])) : carried;
  for (let tries = 0; tries < 8; tries++) {
    const x = s.rng.int(GRID - 1), y = 1 + s.rng.int(GRID - 2);
    const occ = occupancy(b);
    if (footprint(def, x, y).some((k) => occ[k].item >= 0 || occ[k].route >= 0)) continue;
    const snap = cloneBuild(b);
    const uid = s.uid; // gainInto (stars on) mints this same uid; the raw push (off) mints it too
    if (s.stars) gainInto(s, b, def.id, { x, y }, s.cargo); // no twin (checked above): lands at x,y, as pushed
    else { b.items.push({ uid, def: def.id, x, y }); s.uid++; }
    const bl = blockedCells(b);
    const cells = s.drawRoute(-1, startCells(x, y, def.size, bl), bl, s.left());
    if (cells) {
      s.buyBelt(-1, cells.length);
      b.routes.push({ factory: uid, cells });
      s.reseat(load, b.routes.length - 1); // P22: the carried rigs go to work beside the new line first
      if (s.factoriesOn) moreRoutes(s, uid, false); // 0.6.1c: GANTRY PRESS, up to its outputs (around the rigs: P22)
      // fix pass: deck + cargo within the day's gold (left() subtracts the cargo; with cores off the cargo is
      // empty, so this is `buildCost(b).total <= s.budget` exactly). The carried rigs were lifted before the route
      // was drawn, so this after-the-fact check is what keeps a drop within the gold. P20: and no speed-rig hit on a
      // slag tile (factories off: speedOnSlag() is 0).
      if (s.left() >= 0 && !s.speedOnSlag()) {
        s.slag.skipped += carried.length - load.length;
        return true;
      }
    }
    s.restore(snap);
  }
  return false;
}

/** Fusible defs (below 3 stars, factories excluded: a Press's single route makes a second one
 *  unplaceable, so it merges only opportunistically through the "press"/"drop" levers above) the
 *  "merge" lever could buy one more 1-star copy of right now: affordable, and either an immediate
 *  merge (a 1-star twin is already placed, so no new spot is needed) or a genuinely free spot
 *  (BELTSIDE: for a rig, a belt tile with a free cell beside it). */
export function mergeableDefs(s: Shopper): string[] {
  const b = s.b, left = s.left();
  // 0.6.1c: with factories on a factory copy is a candidate too, but only one that merges at once (below)
  const present = fusibleCopies(b).filter((c) => c.kind !== "factory" || s.factoriesOn);
  if (!present.length) return [];
  const oneStar = new Set(present.filter((c) => c.stars === 1).map((c) => c.def));
  let tiles: boolean | undefined, dry: boolean | undefined; // a belt tile with a free side; one on a non-slag route (lazy)
  const freeT = gearFree(b); // 0.6.1b: gear hardpoints (== v1's free turrets when no core is fitted)
  const freeS = socketFree(b); // 0.6.1b: a core copy that doesn't merge needs an empty socket (never a swap here)
  return [...new Set(present.map((c) => c.def))].filter((d) => {
    if (ITEMS[d].price > left || !s.canGain(d)) return false;
    const kind = ITEMS[d].kind;
    if (kind === "factory") { // 0.6.1c: merges at once into a placed twin (the game's own preview), so no footprint or route
      const pv = previewMerge(b, s.uid, d, s.cargo);
      return !!pv && pv.where !== "cargo";
    }
    if (oneStar.has(d)) return true; // will merge immediately: no placement needed
    if (kind !== "gate") return kind === "core" ? freeS.length > 0 : freeT.length > 0;
    // 0.6.1c (P20 on rigs): factories on, a speed rig's belt tiles leave out slag routes (factories off: hasRigTile()
    // itself). Both probes are asked lazily and stop at the first tile (B3): the filter is the same for every speed def.
    return s.slagRoutesFor(ITEMS[d]) ? (dry ??= s.hasRigTileFor(ITEMS[d])) : (tiles ??= s.hasRigTile());
  });
}

/** Buy one more 1-star copy of an existing fusible def (ARSENAL.md §4.1): the new lever that
 *  teaches the shopper to actually grow stars, on top of the organic duplicates gate/mod/press
 *  can already draw by chance. Repeated application on the same def is how 1+1+1+1 = 3-star.
 *  BELTSIDE: a rig copy goes to work on a random belt tile with a free side (H2's placeRig, through
 *  gainInto), or, merging at once, into its placed twin, which keeps its cell and rotation. */
function merge(s: Shopper): boolean {
  const defs = mergeableDefs(s);
  if (!defs.length) return false;
  const b = s.b, def = s.rng.pick(defs), kind = ITEMS[def].kind;
  let at: GainAt;
  if (kind === "mod") {
    const freeT = gearFree(b);
    at = { turret: s.rng.pick(freeT.length ? freeT : [0]) };
  } else if (kind === "core") {
    const freeS = socketFree(b); // 0.6.1b: a 1-star twin is fitted (merges, target ignored) or a socket is empty
    at = { turret: s.rng.pick(freeS.length ? freeS : [0]) };
  } else if (kind === "factory") {
    // 0.6.1c (factories on only: mergeableDefs): the copy merges at once into its placed twin, which keeps its
    // spot and routes (target ignored, as run.ts buyOffer); a GANTRY raised to 2 stars (3 outputs) tries its new route
    const g = gainInto(s, b, def, { x: 0, y: 0 }, s.cargo);
    moreRoutes(s, g.survivor, true);
    return true;
  } else {
    const tiles = s.rigTilesFor(ITEMS[def], s.rigTiles()); // 0.6.1c (P20 on rigs): factories off, rigTiles() itself
    const t = s.rng.pick(tiles.length ? tiles : [null]); // one draw either way, as v2's pick of a cell (or [0])
    if (t) return s.placeRig(def, t[0], t[1]) !== null; // H2 spot (gainInto: a placed 1-star twin absorbs it)
    at = { x: 0, y: 0 }; // no free tile: the copy merges into its placed 1-star twin (mergeableDefs), target ignored
  }
  gainInto(s, b, def, at, s.cargo);
  return true;
}
