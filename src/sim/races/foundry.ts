// races: FOUNDRY mechanics (docs/RACES.md §1). The Crucible pours one alloy blank into every
// attached route on the same tick; two blanks that reach one turret through different
// connectors within SYNC_WINDOW fuse into an alloy slug before firing.

import { AMMO_SPACING, secPer } from "../content";
import { payloadDamage } from "../deck";
import type { FactoryState, Payload, SideState, SimEvent, TurretState } from "../battle";
import { RACE_AMMO } from "./data";
import { pct } from "../pct"; // NUM-1 (REQ-BFG-047)

export const SYNC_WINDOW = 0.25; // s: max gap between the two loads (15 ticks)
export const FUSE_MULT = 1.15; // alloy slug = FUSE_MULT x (blank A + blank B)
const EPS = 1e-6; // float slack on accumulated battle time

export interface SimCtx {
  t: number;
  events: SimEvent[];
  newId(): number;
}

export interface FoundryState {
  sync: WeakMap<Payload, { at: number; route: number }>; // unfused blanks in a chamber
  fusions: number;
  blanksLoaded: number;
}

export function newFoundryState(): FoundryState {
  return { sync: new WeakMap(), fusions: 0, blanksLoaded: 0 };
}

/** The sync rule: different connector (route) and loaded no more than SYNC_WINDOW apart. */
export function inSync(gap: number, sameRoute: boolean): boolean {
  return !sameRoute && gap >= -EPS && gap <= SYNC_WINDOW + EPS;
}

/** One blank's own damage at fusion time (base 3 x split mult + its flat bonuses). bb-0.8.3 (REQ-BFG-042 D2): a ★2-3
 *  CRUCIBLE's blank carries its level's base (Payload.base), as a bought factory's slug does. */
export function blankDamage(p: Payload): number {
  const a = RACE_AMMO.blank;
  return payloadDamage(p.base ?? a.base, a.rideScale, p.ride, p.mult, p.flat);
}

/** Merge blank `b` into blank `a` (in place): `a` becomes an alloy slug. */
export function fuse(a: Payload, b: Payload): void {
  const dmg = pct(blankDamage(a) + blankDamage(b), 100 * FUSE_MULT); // NUM-1: the fuse's 115%, rounded half up once
  a.ammo = "alloy";
  a.flat = dmg;
  a.mult = 1;
  a.ride = Math.max(a.ride, b.ride);
  a.burn += b.burn;
  a.shock = a.shock || b.shock;
  a.prior = Math.max(a.prior, b.prior);
  a.copy = a.copy || b.copy;
}

/**
 * The twin pour: one payload from `make` onto every route of factory f with room at its entry, all on the same tick (a
 * backed-up output misses the pour). One produce event a pour; nothing poured: the factory stalls. 0.8.0 P1: the
 * Crucible's pour, shared with TWIN MOULD (any ammo; DESIGN-wave3.md 3.3 module 9). Returns the payloads poured.
 * bb-0.8.3 (REQ-BFG-042 D4, rule R): `size`, the pour size (FactorySpec.pour). A factory with no more belts than that pours
 * exactly as before; with more, each cast puts one payload onto each of `size` belts with room, taking its belts in turn
 * from f.rr (a belt without room is skipped, as Battle.stamp skips it), so a belt adds reach, never more payloads a cast.
 */
export function pourAll(ctx: SimCtx, s: SideState, f: FactoryState, dt: number, make: () => Payload, size = Infinity): number {
  const spec = f.def.factory!;
  const n = f.routes.length;
  let poured = 0;
  if (n <= size) {
    for (const ri of f.routes) {
      const r = s.routes[ri];
      const back = r.ammo[r.ammo.length - 1];
      if (back && back.s < AMMO_SPACING) continue; // this output is backed up: it misses the pour
      r.ammo.push({ p: make(), s: 0, processed: -1, blocked: false });
      poured++;
    }
  } else {
    let last = -1;
    for (let k = 0; k < n && poured < size; k++) {
      const at = (f.rr + k) % n, r = s.routes[f.routes[at]];
      const back = r.ammo[r.ammo.length - 1];
      if (back && back.s < AMMO_SPACING) continue; // backed up: the next belt in turn takes its slug
      r.ammo.push({ p: make(), s: 0, processed: -1, blocked: false });
      poured++;
      last = at;
    }
    if (last >= 0) f.rr = (last + 1) % n;
  }
  if (poured > 0) {
    f.timer += secPer(spec.speed); // NUM-2 (REQ-BFG-047): 30 / speed, carrying the remainder (was a reset to the interval)
    f.flash = 0.18;
    f.produced += poured;
    f.stalled = false;
    s.stats.produced += poured;
    ctx.events.push({ type: "produce", side: s.side, factory: f.uid });
  } else {
    f.stalled = true;
    f.timer = 0;
    s.stats.stalled += dt;
  }
  return poured;
}

/**
 * Twin pour. Returns true when this factory pours alloy blanks (handled here). bb-0.8.3 (REQ-BFG-042 D3): the factories
 * that pour blanks, by name: the CRUCIBLE always, and a MIMIC FORGE from ★3 (TWIN SIGNET), which Battle.factoryDef gives
 * FOUNDRY's blank and its pour of 2. A blank factory without a pour (a MIMIC below ★3) stamps its blanks one at a time, in
 * turn (Battle.stamp), and they never fuse with each other (tryFuse).
 */
export function crucibleProduce(ctx: SimCtx, s: SideState, f: FactoryState, dt: number): boolean {
  const spec = f.def.factory!;
  if (spec.ammo !== "blank" || !spec.pour || (f.def.id !== "crucible" && f.def.id !== "mimic")) return false;
  pourAll(ctx, s, f, dt, (): Payload => ({
    id: ctx.newId(), ammo: "blank", ride: 0, mult: 1, flat: 0, burn: 0, shock: false,
    prior: 0, factory: f.uid, copy: false,
    ...(spec.base !== undefined ? { base: spec.base } : {}), // bb-0.8.3 (REQ-BFG-042 D2): a ★2-3 CRUCIBLE's level
  }), spec.pour);
  return true;
}

/** Damage an alloy slug will fire for (its whole damage is in flat; see RACE_AMMO.alloy). */
export function alloyDamage(p: Payload): number {
  const a = RACE_AMMO.alloy;
  return payloadDamage(a.base, a.rideScale, p.ride, p.mult, p.flat);
}

/** Intake: fuse an arriving blank with a synced partner already in this chamber. Returns the
 *  alloy slug (the partner, fused in place) or null when nothing fused. */
export function tryFuse(ctx: SimCtx, st: FoundryState, route: number, tu: TurretState, p: Payload): Payload | null {
  if (p.ammo !== "blank") return null;
  for (let i = tu.stack.length - 1; i >= 0; i--) {
    const q = tu.stack[i];
    if (q.ammo !== "blank") continue;
    if (p.lone && q.factory === p.factory) continue; // bb-0.8.3 (D3): a blank stamped alone never fuses with its own factory's
    const m = st.sync.get(q);
    if (!m || !inSync(ctx.t - m.at, m.route === route)) continue;
    fuse(q, p);
    st.sync.delete(q);
    st.fusions++;
    return q;
  }
  return null;
}

/** After a normal load: remember when and where a blank entered, for the sync rule. */
export function blankLoaded(ctx: SimCtx, st: FoundryState, route: number, p: Payload): void {
  if (p.ammo !== "blank") return;
  st.sync.set(p, { at: ctx.t, route });
  st.blanksLoaded++;
}
