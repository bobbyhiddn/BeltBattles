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
//  - a belt that JOINS at the converter's tile feeds its buffer: the joiner's slug enters at the tile's upstream edge when
//    that point is free (Battle.joins, the main belt having right of way), and is taken like a slug of the main belt.
//    Order of entry: by arrival, a tie going to the main belt, then the joiners in the sim's order (lowest last cell first).
//
// THE PAYLOAD RULES are one function each (fusePayload, pelletPayload, smeltPayload), each driven by a table typed
// Record<keyof Payload, ...>: a field added to Payload later (BUMP-1E's POISON, for one) is a TYPE ERROR in the table and a
// failure of tests/gates1.engine.test.ts (which also reads the interface itself) until it has a rule, instead of silently
// not fusing.
//
// Not here: where a gate may stand (split.ts), the faces and the board art (G4).

import { AMMO, AMMO_SPACING, CELL, DISRUPT_TIME, TICK, type ConverterSpec, type ItemDef } from "./content";
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
  buf: Payload[]; // slugs taken in (at most spec.in)
  out: Payload[]; // converted, waiting for AMMO_SPACING at the downstream edge (front first)
  left: number; // ticks of work left while it works (0: not working)
  disrupted: number; // a STUN's seconds left (it stalls the whole machine)
  /** Always 0 in play; tests set it to pause a machine (Battle's other machines have it). */
  frozen: number;
  flash: number; // render: counts down after a conversion
  done: number; // conversions finished
}

/** Does route `r` have a converter on tile `ci`? (makeSide: that tile is no belt target.) */
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
    out.push({
      uid: p.uid, def: d, spec: d.converter, route: ri, tile, x: kx(k), y: ky(k), inEdge: tile * CELL, outEdge: (tile + 1) * CELL,
      buf: [], out: [], left: 0, disrupted: 0, frozen: 0, flash: 0, done: 0,
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
 * the upstream edge into the buffer if there is room and it isn't working; (4) when the buffer is full and the last output
 * has gone, start the timer (it runs from the next tick, so a conversion takes exactly `secs`).
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
    if (c.left === 0 && c.buf.length >= c.spec.in && c.out.length === 0) c.left = workTicks(c.spec);
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

/** Take the slug waiting at the upstream edge (the front-most one in the tile's reach) into the buffer, if there is room. */
function intake(r: RouteState, c: ConverterState): void {
  if (c.buf.length >= c.spec.in) return;
  for (let k = 0; k < r.ammo.length; k++) {
    const a = r.ammo[k];
    if (a.s >= c.outEdge - EDGE) continue; // ahead of the tile
    if (a.s < c.inEdge - EDGE || a.hold) return; // not at the edge yet (or held by a latch)
    c.buf.push(a.p);
    r.ammo.splice(k, 1);
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
};

/** How pelletPayload makes each field of a pellet from the slug: "new" a new id; "share" the pellet's share of it (SPLITTER's
 *  rule: battle.ts applyHit's split: mult, flat and plate); "flag" set true (a copy); "copy" whole (a record is cloned). */
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
 * ★3 x2). It rides on as two (rideMerge), so rigs before a FUSER count twice and rigs after it count once. `a` is the first
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

/** Re-exported for the tests: the belt position type a converter reads. */
export type { BeltAmmo };
