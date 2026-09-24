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
// 0.6.2 BELTSIDE (ref/DESIGN-beltside.md H2): the "gate" lever buys a rig. Rigs stand beside the belt and
// are placed greedily (Shopper.placeRig): a belt tile to work, then the free cell beside it and the rotation
// with the most hits on connected belts. A rig is never left idle: every rig lands at least one arrow on a
// connected belt, and one whose belt moves or goes moves with it.

import { GRID, HEROES, ITEMS, rarityWeights, type ItemDef } from "../content";
import {
  cloneBuild, footprint, hitsOfRig, itemByUid, occupancy, rigHits, rotOf, routeInfo, routesOf, setRot,
  type Build, type Placed, type RigHit,
} from "../deck";
import { beltIndex, hitsIfPlaced, rotations, type WouldHit } from "../beltside";
import { buildCost } from "../../net/validate";
import { blockedCells, freeConnectors, startCells } from "./path";
import { MAX_ROUTE_EDITS, PLATE, PLATE_HULL, PRESS, isFlatGate, isSpeedGate, isSplitter, type Accept, type Shopper } from "./shopper";

export type Lever = "gate" | "mod" | "plating" | "route" | "press" | "sync" | "order" | "drop";
export const LEVERS: readonly Lever[] = ["gate", "mod", "plating", "route", "press", "sync", "order", "drop"];

export function canApply(s: Shopper, l: Lever): boolean {
  const left = s.left(), b = s.b;
  switch (l) {
    case "plating": return left >= PLATE.price;
    case "gate": return left >= s.minGate && s.rigTiles().length > 0;
    case "mod": return left >= s.minMod && HEROES[b.hero].turrets.some((_, t) => !b.mods.some((m) => m.turret === t));
    case "press": return left >= PRESS.price && freeConnectors(b).length > 0;
    case "route": return s.edits < MAX_ROUTE_EDITS && b.routes.length > 0;
    case "sync": return !s.synced && s.twinRoutes() !== null;
    case "order": return routesOutOfOrder(b).length > 0 || buyMoves(s).length > 0;
    case "drop": return left >= PRESS.price && freeConnectors(b).length === 0 && droppable(b).length > 0;
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
  }
}

/** Keep a synced or ordered build that way after any lever (both steps are idempotent). */
export function normalize(s: Shopper): void {
  if (s.synced) mirrorSpeed(s);
  if (s.ordered) for (const ri of routesOutOfOrder(s.b)) sortRoute(s.b, ri);
}

/** A rig put to work on a random belt tile that has a free side (H2 placement); the type is drawn with
 *  the shop's rarity weights for the day. */
function gate(s: Shopper): boolean {
  const left = s.left(), w = rarityWeights(s.day);
  const pool = s.gates.filter((d) => d.price <= left && w[d.rarity] > 0);
  const tiles = s.rigTiles();
  if (!pool.length || !tiles.length) return false;
  const d = s.rng.weighted(pool, (g) => w[g.rarity] / s.gates.filter((x) => x.rarity === g.rarity).length);
  const [ri, ti] = s.rng.pick(tiles);
  return s.placeRig(d.id, ri, ti) !== null;
}

/** A turret module on a free hardpoint, preferring guns that some belt feeds. */
function mod(s: Shopper): boolean {
  const b = s.b, h = HEROES[b.hero], left = s.left();
  const free = h.turrets.map((_, t) => t).filter((t) => !b.mods.some((m) => m.turret === t));
  const fed = new Set(b.routes.map((r) => h.turrets.findIndex((t) => t.connectors.includes(r.cells[r.cells.length - 1] % GRID))));
  const live = free.filter((t) => fed.has(t));
  const pool = s.mods.filter((d) => d.price <= left);
  if (!pool.length || !free.length) return false;
  b.mods.push({ uid: s.uid++, def: s.rng.pick(pool).id, turret: s.rng.pick(live.length ? live : free) });
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

/** Per tile of route ri, the speed rigs landing on it (defs, sorted, "+"-joined; "" for none): the belt's
 *  speed profile. Two belts with the same profile hold the same speed on every tile (R7 item 4). */
export function speedProfile(b: Build, ri: number, hits: RigHit[][][] = rigHits(b)): string[] {
  return (hits[ri] ?? []).map((t) => t.filter((h) => isSpeedGate(ITEMS[h.def])).map((h) => h.def).sort().join("+"));
}

const speedHitsAt = (hits: RigHit[][][], ri: number, i: number): RigHit[] => (hits[ri]?.[i] ?? []).filter((h) => isSpeedGate(ITEMS[h.def]));

/** Hits in `xs` with no same-def partner left in `ys` (multiset difference by def). */
function unmatched(xs: RigHit[], ys: RigHit[]): RigHit[] {
  const left = ys.map((h) => h.def);
  return xs.filter((h) => {
    const j = left.indexOf(h.def);
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
 *  pairing; after a bounded number of fixes any speed rig still on the twins goes. */
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
    const onlyA = unmatched(la, lc), onlyC = unmatched(lc, la);
    if (onlyA.length && onlyC.length) {
      s.removeItem(onlyC[0].uid); // different speeds: the sibling takes route a's
      continue;
    }
    const src = onlyA[0] ?? onlyC[0];
    if (!copyRigTo(s, src.def, onlyA.length ? c : a, i, onceOnTwins(a, c))) s.removeItem(src.uid);
  }
  const hits = rigHits(s.b);
  if (speedProfile(s.b, a, hits).join() !== speedProfile(s.b, c, hits).join()) {
    for (const h of [...hits[a], ...hits[c]].flat()) if (isSpeedGate(ITEMS[h.def])) s.removeItem(h.uid);
  }
}

/** Buy `def` to work tile i of route ri, when affordable and a cell beside it is accepted. */
function copyRigTo(s: Shopper, def: string, ri: number, i: number, accept: Accept): boolean {
  if (s.left() < ITEMS[def].price) return false;
  return s.placeRig(def, ri, i, accept) !== null;
}

/** Buy one speed rig pair at the same tile index of both twins (no speed hit there yet), when affordable. */
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
  const snap = cloneBuild(s.b), once = onceOnTwins(a, sib);
  if (!s.placeRig(d.id, a, i, once) || !s.placeRig(d.id, sib, i, once)) s.restore(snap);
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
 *  new rig may not put any belt out of order. */
function buyMoves(s: Shopper): { defs: ItemDef[]; ri: number; tiles: number[]; accept: Accept }[] {
  const w = rarityWeights(s.day), left = s.left(), hits = rigHits(s.b);
  const ok = (d: ItemDef) => w[d.rarity] > 0 && d.price <= left;
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
  synced: boolean; // Crucible twins matched with the same speed rig hits at every tile index
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

/** A Stamp Press on a free 2x2 spot (not the forward row) with a line into a free connector;
 *  `carried` rigs go to work beside the new line (any that find no place are not bought). */
function pressLine(s: Shopper, carried: Placed[]): boolean {
  const b = s.b;
  for (let tries = 0; tries < 8; tries++) {
    const x = s.rng.int(GRID - 1), y = 1 + s.rng.int(GRID - 2);
    const occ = occupancy(b);
    if (footprint(PRESS, x, y).some((k) => occ[k].item >= 0 || occ[k].route >= 0)) continue;
    const snap = cloneBuild(b);
    const uid = s.uid++;
    b.items.push({ uid, def: PRESS.id, x, y });
    const bl = blockedCells(b);
    const cells = s.drawRoute(-1, startCells(x, y, PRESS.size, bl), bl, s.left());
    if (cells) {
      s.buyBelt(-1, cells.length);
      b.routes.push({ factory: uid, cells });
      s.reseat(carried, b.routes.length - 1);
      if (buildCost(b).total <= s.budget) return true;
    }
    s.restore(snap);
  }
  return false;
}
