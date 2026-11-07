// GATES-1 (REQ-BFG-052; BRIEF-GATES1 G2): THE CONVERTER ENGINE. A converter (FUSER, SCATTER MILL, SMELTER; gates.ts) is a
// Placed item standing ON one tile of a belt; the route stays ONE RouteDef (deck.ts converterCellOk), so beltCap, the belt
// slots and the FURNACE journey all see the whole belt as before. In a battle it is one ConverterState per converter, and
// Battle calls this file from three short hooks: makeSide (makeConverters), transport (convertLimit, convertTick) and the
// STUN code (convertMachinery, convertTargets). Everything the converters do is here.
//
// THE STEP (r1d REPORT 2.1; measured as variants F, G and J):
//  - slugs ride the belt to the converter's tile and STOP at its upstream edge (convertLimit: the tile's start, x CELL);
//    a slug at the edge goes into the buffer when the buffer has room (it holds `in` slugs) and the converter isn't working;
//    the slugs behind wait in the queue (the queue in front of it is its own counter). A FUSER waits for its partner with no
//    timeout; a slug still in a buffer when the battle ends is never fired;
//  - when the buffer holds `in` slugs and the last output has left, the timer runs `secs` whole seconds (60 ticks a second:
//    the n-th tick after the buffer filled), then the output exists;
//  - the output goes onto the same route at the tile's DOWNSTREAM edge ((tile + 1) x CELL, `processed` = the converter's
//    tile), one payload at a time, each once AMMO_SPACING is free around that point (as Battle.stamp and Battle.joins do);
//  - the rigs' arrows aimed at the converter's tile idle (DESIGN-beltside R5; deck.ts rigHits), so the tile has no hits;
//    every later tile's hits act on the output;
//  - a STUN (Battle.disrupt) stalls the whole machine: no timer, no intake, no output while it lasts; the converter is a
//    Target like a factory (weight 3), and the belt tile it stands on is no belt target;
//  - a belt that JOINS at the converter's tile feeds its buffer, and the converter takes from its own (main) belt and from the
//    joining belt(s) IN TURN (GATES-1b B1; cap's ruling on GATES-1 question 5; `intake`): when it is ready for a slug and slugs
//    wait on both belts it takes from the belt it did not take from last (with more joiners: the next belt in the sim's order,
//    the main belt, then the joiners lowest last cell first); when only one belt has a slug ready it takes that one at once and
//    never waits for the other. A joiner's slug goes straight from its belt's end into the buffer (Battle.joins leaves a join
//    on a converter's tile to this file), so it can't slip into the gap the converter just opened on the main belt, which is
//    what let an `in` 1 converter give every free place to the joining belt and starve the main belt. A FUSER therefore takes one
//    slug of each belt when both are backed up, and two of one belt when only that belt has a slug ready. A join tile with no
//    converter keeps Battle.joins's rule.
//
// THE PAYLOAD RULES are one function each (fusePayload, pelletPayload, smeltPayload), each driven by a table typed
// Record<keyof Payload, ...>: a field added to Payload later (BUMP-1E's POISON, for one) is a TYPE ERROR in the table and a
// failure of tests/gates1.engine.test.ts (which also reads the interface itself) until it has a rule, instead of silently
// not fusing.
//
// Not here: where a gate may stand (split.ts), the faces and the board art (G4).

import { AMMO, AMMO_SPACING, CELL, DISRUPT_TIME, ITEMS, TICK, type ConverterSpec, type ItemDef } from "./content";
import { key, kx, ky, payloadDamage, type Build } from "./deck";
import { pct, roundHalfUp } from "./pct";
import { effectAt, starsOf } from "./stars";
import type { BeltAmmo, Payload, RouteState, Side, SideState, SimEvent, Target } from "./battle";

const TICKS_PER_SEC = Math.round(1 / TICK);
const EDGE = 1e-6; // float slack on a belt position (px)

/** What Battle gives the engine (structurally: Battle's own `t`, `events` and `newId`), as races' SimCtx does. */
export interface ConvCtx {
  t: number;
  events: SimEvent[];
  newId(): number;
}

/** One converter in a battle (SideState.converters, in route and tile order; RouteState.conv holds its route's). */
export interface ConverterState {
  uid: number;
  def: ItemDef; // at its stars (stars.ts effectAt)
  spec: ConverterSpec;
  route: number; // the route it stands on
  tile: number; // its tile's index along the route
  x: number; // its deck cell
  y: number;
  inEdge: number; // tile x CELL: where the slugs stop and are taken (px along the route)
  outEdge: number; // (tile + 1) x CELL: where the output goes back on the belt
  /** GATES-1b B1: the joining belts that end on this converter's tile (RouteState.join.tile = its tile), in the sim's join order
   *  (lowest last cell first); [] for a converter on no join tile, which is every converter but those. See `intake`. */
  feeders: RouteState[];
  /** GATES-1b B1: whose turn it is when slugs wait on several belts: 0 = this converter's own (main) belt, i >= 1 = feeders[i - 1].
   *  Moves on past the belt a slug was taken from (so with one joiner the belts alternate). Always 0 when there are no feeders. */
  turn: number;
  buf: Payload[]; // slugs taken in (at most spec.in)
  out: Payload[]; // converted, waiting for AMMO_SPACING at the downstream edge (front first)
  left: number; // ticks of work left while it works (0: not working)
  disrupted: number; // a STUN's seconds left (it stalls the whole machine)
  /** Always 0 in play; tests set it to pause a machine (Battle's other machines have it). */
  frozen: number;
  flash: number; // render: counts down after a conversion
  done: number; // conversions finished
}

/** Does route `r` have a converter on tile `ci`? (makeSide: that tile is no belt target. Battle.joins: a belt that joins at such a
 *  tile is that converter's to feed, in turn with the main belt (`intake`), so joins leaves it alone.) */
export function convAt(r: Pick<RouteState, "conv">, ci: number): boolean {
  return !!r.conv?.some((c) => c.tile === ci);
}

/**
 * The battle's converters for build `b`: every converter item standing on a tile of one of `routes` (the first route holding
 * its cell), in route and tile order; each is also listed on its route (RouteState.conv). One that stands off every belt does
 * nothing (the editor and the validator refuse it). [] without converters, which is every battle with GATES off.
 */
export function makeConverters(b: Build, routes: RouteState[]): ConverterState[] {
  const out: ConverterState[] = [];
  for (const p of b.items) {
    const d = effectAt(p.def, starsOf(p));
    if (d.kind !== "converter" || !d.converter) continue;
    const k = key(p.x, p.y);
    const ri = routes.findIndex((r) => r.cells.includes(k));
    if (ri < 0) continue;
    const tile = routes[ri].cells.indexOf(k);
    // GATES-1b B1: the belts that join on this very tile, in Battle.joins's order (lowest last cell key first)
    const feeders = routes.filter((q) => q.join && q.join.route === ri && q.join.tile === tile)
      .sort((a, c) => a.cells[a.cells.length - 1] - c.cells[c.cells.length - 1]);
    out.push({
      uid: p.uid, def: d, spec: d.converter, route: ri, tile, x: kx(k), y: ky(k), inEdge: tile * CELL, outEdge: (tile + 1) * CELL,
      feeders, turn: 0, buf: [], out: [], left: 0, disrupted: 0, frozen: 0, flash: 0, done: 0,
    });
  }
  out.sort((a, c) => a.route - c.route || a.tile - c.tile);
  for (const c of out) (routes[c.route].conv ??= []).push(c);
  return out;
}

/** Each converter's Target: weight 3, a factory's (BRIEF-GATES1 G2: STUN, targeting like a factory), at its tile's centre. */
export function convertTargets(cs: readonly ConverterState[]): Target[] {
  return cs.map((c) => ({ kind: "converter", ref: c.uid, cell: -1, x: c.x * CELL + CELL / 2, y: c.y * CELL + CELL / 2, weight: 3 }));
}

/** Each tick, before the work (Battle.updateMachinery): a converter's STUN counts down like a factory's, and its flash fades.
 *  `stunLeft` is Battle's own (a whole-tick timer ends on its tick). */
export function convertMachinery(s: SideState, dt: number, stunLeft: (left: number, dt: number) => number): void {
  for (const c of s.converters!) {
    if (c.flash > 0) c.flash -= dt;
    const stopped = c.disrupted > 0 || c.frozen > 0;
    if (c.disrupted > 0) c.disrupted = stunLeft(c.disrupted, dt);
    if (c.frozen > 0) c.frozen = Math.max(0, c.frozen - dt);
    if (stopped) s.stats.disrupted += dt;
  }
}

/** Battle.disrupt on a converter target: the STUN's seconds, the longest wins (as a factory's). */
export function convertDisrupt(s: SideState, ref: number, secs: number): void {
  const c = s.converters?.find((x) => x.uid === ref);
  if (c) c.disrupted = Math.max(c.disrupted, secs);
}

/**
 * Battle.transport's limit for a slug at `pos` on a route with converters: it stops at the upstream edge of the first
 * converter it has not passed (a slug already inside a converter's tile stays where it is). A slug at or past a converter's
 * downstream edge (the output, or a joined slug past it) is its own. Returns the lesser of `limit` and that stop.
 */
export function convertLimit(conv: readonly ConverterState[], pos: number, limit: number): number {
  for (const c of conv) {
    if (pos >= c.outEdge - EDGE) continue;
    return Math.min(limit, pos < c.inEdge ? c.inEdge : pos);
  }
  return limit;
}

/** Ticks of work a conversion takes: its whole seconds. */
const workTicks = (spec: ConverterSpec): number => Math.max(1, Math.round(spec.secs * TICKS_PER_SEC));

/**
 * One tick of side `s`'s converters, after every belt has moved (end of Battle.transport), in route and tile order. A
 * stunned or frozen converter does nothing at all. Otherwise: (1) put the next output on the belt if AMMO_SPACING is free;
 * (2) run the timer, and when it ends convert the buffer (a `convert` event) and try the output again; (3) take the slug at
 * the upstream edge into the buffer if there is room and it isn't working (on a join tile: from the main belt or the joining
 * belt, in turn: `intake`); (4) when the buffer is full and fewer than `out` outputs are still waiting for room, start the
 * timer (it runs from the next tick, so a conversion takes exactly `secs`).
 * The pellets of one conversion leave the mouth one by one (AMMO_SPACING = 14 ticks apart) WHILE the next slug is converted,
 * the way a factory's DOUBLE STAMP batch leaves while its next cycle runs (battle.ts `pending`): the face says 1 SEC a
 * conversion, and a machine that waited for its last pellet to leave would take 1.5 s (3 out) to 1.7 s (4 out). With out = 1
 * (FUSER, SMELTER) this is the old rule: the next conversion starts once the one output has gone.
 */
export function convertTick(ctx: ConvCtx, s: SideState, _dt: number): void {
  for (const c of s.converters!) {
    if (c.disrupted > 0 || c.frozen > 0) continue;
    const r = s.routes[c.route];
    emit(r, c);
    if (c.left > 0 && --c.left === 0) {
      finish(ctx, s.side, c);
      emit(r, c);
    }
    if (c.left === 0) intake(r, c);
    if (c.left === 0 && c.buf.length >= c.spec.in && c.out.length < c.spec.out) c.left = workTicks(c.spec);
  }
}

/** Put the first waiting output on the belt at the downstream edge when no slug is within AMMO_SPACING of that point. */
function emit(r: RouteState, c: ConverterState): void {
  if (!c.out.length) return;
  let k = 0;
  for (; k < r.ammo.length; k++) {
    const d = r.ammo[k].s - c.outEdge;
    if (Math.abs(d) < AMMO_SPACING - EDGE) return; // no room yet
    if (d < 0) break;
  }
  const p = c.out.shift()!;
  r.ammo.splice(k, 0, { p, s: c.outEdge, processed: c.tile, blocked: false });
}

/** The index in `r.ammo` of the slug waiting at the converter's upstream edge (the front-most one in the tile's reach), or -1
 *  when none is there yet (or a latch holds it). */
function edgeSlug(r: RouteState, c: ConverterState): number {
  for (let k = 0; k < r.ammo.length; k++) {
    const a = r.ammo[k];
    if (a.s >= c.outEdge - EDGE) continue; // ahead of the tile
    return a.s < c.inEdge - EDGE || a.hold ? -1 : k; // not at the edge yet (or held by a latch)
  }
  return -1;
}

/**
 * Take one slug into the buffer, if there is room. The slug waiting at the upstream edge (the front-most one in the tile's
 * reach) of the converter's own belt, or, on a join tile (GATES-1b B1), the slug waiting at the end of a joining belt: the
 * belts take a turn (`turn`: the one after the belt a slug was last taken from, scanning on to the next that has a slug ready).
 * With no joiner this is the one belt, as before. A joiner's slug is handed over as Battle.joins would have put it on the main
 * belt: its journey offset grows by the tiles it rode on its own belt past the join.
 */
function intake(r: RouteState, c: ConverterState): void {
  if (c.buf.length >= c.spec.in) return;
  const n = 1 + c.feeders.length;
  for (let i = 0; i < n; i++) {
    const from = (c.turn + i) % n;
    if (from === 0) {
      const k = edgeSlug(r, c);
      if (k < 0) continue;
      c.buf.push(r.ammo[k].p);
      r.ammo.splice(k, 1);
    } else {
      const f = c.feeders[from - 1], a = f.ammo[0];
      if (!a || a.hold || a.s < f.L - 1e-6) continue; // nothing at the joining belt's end
      f.ammo.shift();
      a.p.journeyOffset = (a.p.journeyOffset ?? 0) + f.cells.length - f.join!.tile;
      c.buf.push(a.p);
    }
    c.turn = (from + 1) % n;
    return;
  }
}

/** The timer has run out: convert the buffer into the output by the converter's idea, and tell the renderer and the log. */
function finish(ctx: ConvCtx, side: Side, c: ConverterState): void {
  const spec = c.spec, held = c.buf;
  c.buf = [];
  const made = spec.how === "fuse" ? [fusePayload(held[0], held[1] ?? held[0], spec, ctx.newId())]
    : spec.how === "pellet" ? pelletPayload(held[0], spec, () => ctx.newId())
    : [smeltPayload(held[0], spec)];
  c.out.push(...made);
  c.flash = 0.25;
  c.done++;
  ctx.events.push({ type: "convert", side, converter: c.uid, def: c.def.id, route: c.route, tile: c.tile, slugs: made.length });
}

// ------------------------------------------------------------------------------------------------ the payload rules

/** How fusePayload makes each field of the fused slug from the two it takes (a = the first in, b = the second):
 *  "new" a new id; "first" a's (b's when a has none); "ride" the ride rule (rideMerge); "add" the two add;
 *  "max" the larger; "or" a flag that either has; "merge" the two records merged; "stall" STUN seconds add (a slug that
 *  shocks without its own time deals DISRUPT_TIME). */
export type FuseRule = "new" | "first" | "ride" | "add" | "max" | "or" | "merge" | "stall";

/** FUSER: every field of Payload has a rule here, or this file doesn't compile. (races/foundry.ts fuse is the precedent for
 *  `prior` (max), `burn`, `burnPlus`, `shock` and `copy`.) */
export const FUSE_RULES: Readonly<Record<keyof Payload, FuseRule>> = {
  id: "new",
  ammo: "first",
  ride: "ride", // a's: the fused slug is a, carrying b's base and ride in its flat (rideMerge)
  mult: "ride",
  flat: "ride",
  burn: "add",
  shock: "or",
  prior: "max",
  factory: "first",
  copy: "or",
  shockTime: "stall",
  jump: "max",
  base: "ride", // a's, for the same reason
  preset: "first",
  debuffs: "merge",
  harass: "first",
  static: "or",
  arc: "add",
  rip: "merge",
  heat: "add", // HEAT per second ridden: it rides on as two
  heatRide: "add",
  heatBonus: "add",
  pulseSeen: "merge",
  compound: "first",
  burnPlus: "add",
  fray: "add",
  frayCap: "max",
  staticTime: "stall",
  boosters: "merge",
  journeyOffset: "max",
  paired: "or",
  lone: "or",
  plate: "add",
  // BUMP-1F (PACKET-BUMP-0130 section 5; cap's rulings): BUMP-1E's two Payload fields. `poison` ADDS, like burn (the FUSER's bonus
  // does not touch it: the bonus multiplies mult and flat only); `each` (SCALE-2a's FOR EACH DMG) adds too, then scales with `flat`
  // below ("a split scales both", SCALE-2a F3): rigs before the FUSER count twice, rigs after it once, in the sim and in the walk
  poison: "add",
  each: "add",
};

/** How pelletPayload makes each field of a pellet from the slug: "new" a new id; "share" the pellet's share of it (SPLITTER's
 *  rule: battle.ts applyHit's split: mult, flat, plate and each); "flag" set true (a copy); "copy" whole (a record is cloned). */
export type PelletRule = "new" | "share" | "flag" | "copy";

export const PELLET_RULES: Readonly<Record<keyof Payload, PelletRule>> = {
  id: "new",
  ammo: "copy",
  ride: "copy",
  mult: "share",
  flat: "share",
  burn: "copy",
  shock: "copy",
  prior: "copy",
  factory: "copy",
  copy: "flag",
  shockTime: "copy",
  jump: "copy",
  base: "copy",
  preset: "copy",
  debuffs: "copy",
  harass: "copy",
  static: "copy",
  arc: "copy",
  rip: "copy",
  heat: "copy",
  heatRide: "copy",
  heatBonus: "copy",
  pulseSeen: "copy",
  compound: "copy",
  burnPlus: "copy",
  fray: "copy",
  frayCap: "copy",
  staticTime: "copy",
  boosters: "copy",
  journeyOffset: "copy",
  paired: "copy",
  lone: "copy",
  plate: "share",
  // BUMP-1F (PACKET-BUMP-0130 section 5): SPLITTER's rule (battle.ts applyHit's split) for BUMP-1E's two fields: `each` takes the
  // share as `flat` does ("a split scales both"); `poison` is copied whole, as every non-share field (the split leaves it alone)
  poison: "copy",
  each: "share",
};

/** How smeltPayload changes each field of the slug: "burn" the field a burn rig's hit adds to (+ the SMELTER's BURN);
 *  "same" the slug keeps it. */
export type SmeltRule = "burn" | "same";

export const SMELT_RULES: Readonly<Record<keyof Payload, SmeltRule>> = {
  id: "same", ammo: "same", ride: "same", mult: "same", flat: "same", burn: "burn", shock: "same", prior: "same", factory: "same",
  copy: "same", shockTime: "same", jump: "same", base: "same", preset: "same", debuffs: "same", harass: "same", static: "same",
  arc: "same", rip: "same", heat: "same", heatRide: "same", heatBonus: "same", pulseSeen: "same", compound: "same",
  burnPlus: "same", fray: "same", frayCap: "same", staticTime: "same", boosters: "same", journeyOffset: "same", paired: "same",
  lone: "same", plate: "same",
  poison: "same", each: "same", // BUMP-1F (PACKET-BUMP-0130 section 5): a SMELTER adds BURN only; the POISON and the FOR EACH DMG stay
};

type Bag = Record<string, unknown>;

const addN = (x: unknown, y: unknown): number | undefined => (x === undefined && y === undefined ? undefined : ((x as number | undefined) ?? 0) + ((y as number | undefined) ?? 0));
const maxN = (x: unknown, y: unknown): number | undefined => (x === undefined && y === undefined ? undefined : Math.max((x as number | undefined) ?? 0, (y as number | undefined) ?? 0));

/** The records of two slugs merged: a's marks and b's (debuffs), the later pulse seen (pulseSeen), every booster uid
 *  (boosters), the rip hook's counts added and its longer reach (rip). */
const MERGE: Readonly<Record<string, (x: unknown, y: unknown) => unknown>> = {
  debuffs: (x, y) => (x || y ? { ...(x as object | undefined), ...(y as object | undefined) } : undefined),
  pulseSeen: (x, y) => {
    if (!x && !y) return undefined;
    const out: Record<number, number> = { ...(x as Record<number, number> | undefined) };
    for (const [uid, cycle] of Object.entries((y as Record<number, number> | undefined) ?? {})) out[Number(uid)] = Math.max(out[Number(uid)] ?? -1, cycle);
    return out;
  },
  boosters: (x, y) => (x || y ? [...new Set([...((x as number[] | undefined) ?? []), ...((y as number[] | undefined) ?? [])])] : undefined),
  rip: (x, y) => {
    const p = x as { count: number; reach: number } | undefined, q = y as { count: number; reach: number } | undefined;
    return p && q ? { count: p.count + q.count, reach: Math.max(p.reach, q.reach) } : p ?? q;
  },
};

/** One slug's damage right now, as Battle.fire reads it before any gear or rune (a ride curve's slug: its curve). */
function damageNow(p: Payload): number {
  const m = AMMO[p.ammo];
  if (m.rideCurve) return m.rideCurve(p.ride);
  return payloadDamage(p.base ?? m.base, m.rideScale, p.ride, p.mult, p.flat + (p.heatBonus ?? 0));
}

/**
 * The "ride" fields of two slugs fused: `mult`, `flat` (before the bonus) and whether b's ride gain goes on. r1d variant B:
 * "the fused slug rides on as two". When both ride on a line (no curve, one rideScale), the fused slug keeps a's base and
 * ride, its mult is both mults and its flat holds the rest of both, so it deals exactly what the two dealt this moment and
 * every second it rides adds both slugs' gain (a KILN slug grows while it rides; without this FURNACE loses about 10 points).
 * Otherwise b's damage so far is frozen into the flat and b's gain does not ride on. NUM-1: the flat stays whole.
 */
function rideMerge(a: Payload, b: Payload): { mult: number; flat: number; both: boolean } {
  const am = AMMO[a.ammo], bm = AMMO[b.ammo];
  if (!am.rideCurve && !bm.rideCurve && am.rideScale === bm.rideScale) {
    const baseA = a.base ?? am.base, baseB = b.base ?? bm.base, rs = am.rideScale;
    const more = roundHalfUp((baseB + rs * b.ride - (baseA + rs * a.ride)) * b.mult);
    return { mult: a.mult + b.mult, flat: a.flat + b.flat + more, both: true };
  }
  return { mult: a.mult, flat: a.flat + damageNow(b), both: false };
}

/**
 * FUSER (BRIEF-GATES1 G2): two slugs in, one out. The fused slug carries both (FUSE_RULES: every number adds, flags OR, a
 * new id), and then its DMG share, `mult` and `flat` (the fields SPLITTER shares), is x(100 + spec.bonus)% (x1.5, ★2 x1.75,
 * ★3 x2.5). It rides on as two (rideMerge), so rigs before a FUSER count twice and rigs after it count once. `a` is the first
 * slug in, `b` the second; both are consumed.
 */
export function fusePayload(a: Payload, b: Payload, spec: Pick<ConverterSpec, "bonus">, id: number): Payload {
  const out: Payload = { ...a, id };
  const A = a as unknown as Bag, B = b as unknown as Bag, O = out as unknown as Bag;
  const ride = rideMerge(a, b);
  for (const k of Object.keys(FUSE_RULES) as (keyof Payload)[]) {
    switch (FUSE_RULES[k]) {
      case "new": case "ride": break; // the id above; the ride rule below
      case "first": if (A[k] === undefined && B[k] !== undefined) O[k] = B[k]; break;
      case "add": { const v = addN(A[k], B[k]); if (v !== undefined) O[k] = v; break; }
      case "max": { const v = maxN(A[k], B[k]); if (v !== undefined) O[k] = v; break; }
      case "or": if (A[k] || B[k]) O[k] = true; break;
      case "merge": { const v = MERGE[k](A[k], B[k]); if (v !== undefined) O[k] = v; break; }
      case "stall": { // STUN seconds: both stalls count when both slugs shock; a slug that shocks without a time deals DISRUPT_TIME
        const on = k === "shockTime" ? "shock" : "static";
        if (A[on] && B[on]) O[k] = ((A[k] as number | undefined) ?? DISRUPT_TIME) + ((B[k] as number | undefined) ?? DISRUPT_TIME);
        else if (!A[on] && B[on] && B[k] !== undefined) O[k] = B[k];
        break;
      }
    }
  }
  if (!ride.both) { // b's gain does not ride on: its HEAT and what it had gained are in the flat already (damageNow)
    out.heat = a.heat;
    out.heatRide = a.heatRide;
    out.heatBonus = a.heatBonus;
    if (a.heat === undefined) delete out.heat;
    if (a.heatRide === undefined) delete out.heatRide;
    if (a.heatBonus === undefined) delete out.heatBonus;
  }
  const f = 100 + (spec.bonus ?? 0);
  out.mult = (ride.mult * f) / 100;
  out.flat = pct(ride.flat, f);
  if (out.each) out.each = pct(out.each, f); // BUMP-1F (PACKET-BUMP-0130 section 5; SCALE-2a F3): the FOR EACH DMG scales with `flat`; `poison` is not touched
  return out;
}

/**
 * SCATTER MILL (BRIEF-GATES1 G2): one slug in, `spec.out` pellets out, each at spec.share % of its DMG. The pellets follow
 * SPLITTER's copy rule (battle.ts applyHit, the split): mult, flat and plate take the share, every other field copies whole
 * (a record is cloned), each pellet gets a new id (`newId` is called once a pellet) and is marked a copy.
 */
export function pelletPayload(p: Payload, spec: Pick<ConverterSpec, "out" | "share">, newId: () => number): Payload[] {
  const share = spec.share ?? 100, out: Payload[] = [];
  for (let i = 0; i < spec.out; i++) {
    const q: Payload = { ...p, id: newId(), mult: (p.mult * share) / 100, flat: pct(p.flat, share), copy: true };
    if (p.plate) q.plate = pct(p.plate, share);
    if (p.each) q.each = pct(p.each, share); // BUMP-1F (SCALE-2a F3): a split is a copy, both accumulators; `poison` copies whole (the spread)
    if (p.debuffs) q.debuffs = { ...p.debuffs };
    if (p.pulseSeen) q.pulseSeen = { ...p.pulseSeen };
    if (p.boosters) q.boosters = [...p.boosters];
    if (p.rip) q.rip = { ...p.rip };
    out.push(q);
  }
  return out;
}

/** SMELTER (BRIEF-GATES1 G2): the slug gains spec.burn BURN, the field a burn rig's hit adds to (battle.ts applyHit: e.burn). */
export function smeltPayload(p: Payload, spec: Pick<ConverterSpec, "burn">): Payload {
  p.burn += spec.burn ?? 0;
  return p;
}

// ------------------------------------------------------------------------------------ the belt panel through a gate (B3)

/**
 * GATES-1b B3 (BRIEF-GATES1B; review risk 7): the belt panel's DMG, BURN, TIME and COPIES through a gate on the belt. The panel's
 * walk (deck.ts walkRoute, opted in by the panel with WalkOpts.gates: the bots' rating and the par player's estimates keep
 * the gate-blind walk, because G6's table already prices a gate and a gate-aware rating would count it twice) carries ONE slug,
 * as a `WalkSlug`; at a gate's tile it stops at the upstream edge, waits `convertTicks` inside the machine (no ride, no HEAT, no
 * SURGE pulse: it isn't on the belt), and comes out at the downstream edge: the tile itself isn't ridden. What it becomes is the
 * engine's own: convertWalk hands the slug to fusePayload, pelletPayload or smeltPayload, so a rule added there reaches the panel
 * with no second copy. A FUSER's slug is the one that completes a pair (its partner already waits in the buffer: both stand
 * alike at the edge, the same ride, the same hits), so the panel's TIME is that slug's: it doesn't include how long the first
 * of the pair waited for it (that depends on the factory's rate).
 */
export interface WalkSlug {
  ammo: Payload["ammo"];
  base: number; // the walk's base DMG (the factory's, or the ammo's)
  ride: number;
  mult: number;
  flat: number; // before HEAT's bonus (heatBonus is counted apart, as Payload.flat)
  each: number; // BUMP-1F (SCALE-2a F3): the FOR EACH DMG so far, apart from `flat` (0, and always 0 with SCALE_RIGS off)
  burn: number;
  shock: boolean;
  prior: number;
  heat: number; // HEAT a second ridden (0: none)
  heatBonus: number; // what the HEAT has added so far
  copies: number; // slugs reaching the gun for one slug the factory stamps (a FUSER's pair is 1/2, a SCATTER MILL's pellets 3)
}

/** The converters standing on `b`'s cells (cell key -> its spec at its stars). Empty without converters: every deck with GATES off. */
export function convertCells(b: Pick<Build, "items">): Map<number, ConverterSpec> {
  const out = new Map<number, ConverterSpec>();
  for (const p of b.items) {
    if (!Object.prototype.hasOwnProperty.call(ITEMS, p.def)) continue;
    const d = effectAt(p.def, starsOf(p));
    if (d.kind === "converter" && d.converter) out.set(key(p.x, p.y), d.converter);
  }
  return out;
}

/** The ticks a slug waits inside a converter (the engine's own: `secs` whole seconds). */
export const convertTicks = workTicks;

/**
 * THE ONE FUNCTION: the walk's slug after a converter (see WalkSlug). The slug is made a Payload and put through the engine's rule
 * for the converter's idea, fusePayload (two alike slugs: one that carries both, +bonus%), pelletPayload (the first of its pellets:
 * they are alike) or smeltPayload (+BURN); what the rule leaves is read back. `copies` follows the converter's `in` and `out`.
 */
export function convertWalk(s: WalkSlug, spec: ConverterSpec): WalkSlug {
  const p: Payload = { id: 1, ammo: s.ammo, base: s.base, ride: s.ride, mult: s.mult, flat: s.flat, burn: s.burn, shock: s.shock, prior: s.prior, factory: 0, copy: false };
  if (s.each) p.each = s.each; // BUMP-1F: the FUSER doubles and scales it with `flat`, a SCATTER MILL's pellet takes its share, a SMELTER leaves it
  if (s.heat) { p.heat = s.heat; p.heatBonus = s.heatBonus; }
  const made = spec.how === "fuse" ? fusePayload(p, { ...p, id: 2 }, spec, 3)
    : spec.how === "pellet" ? pelletPayload(p, spec, (() => { let n = 3; return () => ++n; })())[0]
    : smeltPayload(p, spec);
  return {
    ammo: s.ammo, base: made.base ?? s.base, ride: made.ride, mult: made.mult, flat: made.flat, each: made.each ?? 0, burn: made.burn, shock: made.shock, prior: made.prior,
    heat: made.heat ?? 0, heatBonus: made.heatBonus ?? 0, copies: (s.copies * spec.out) / spec.in,
  };
}

/** Re-exported for the tests: the belt position type a converter reads. */
export type { BeltAmmo };
