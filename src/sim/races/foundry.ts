// races: FOUNDRY mechanics (docs/RACES.md §1). The Crucible pours one alloy blank into every
// attached route on the same tick; two blanks that reach one turret through different
// connectors within SYNC_WINDOW fuse into an alloy slug before firing.

import { AMMO_SPACING } from "../content";
import { payloadDamage } from "../deck";
import type { FactoryState, Payload, SideState, SimEvent, TurretState } from "../battle";
import { RACE_AMMO } from "./data";

export const SYNC_WINDOW = 0.25; // s: max gap between the two loads (15 ticks)
export const FUSE_MULT = 1.3; // alloy slug = FUSE_MULT x (blank A + blank B)
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

/** One blank's own damage at fusion time (base 3 x split mult + its flat bonuses). */
export function blankDamage(p: Payload): number {
  const a = RACE_AMMO.blank;
  return payloadDamage(a.base, a.rideScale, p.ride, p.mult, p.flat);
}

/** Merge blank `b` into blank `a` (in place): `a` becomes an alloy slug. */
export function fuse(a: Payload, b: Payload): void {
  const dmg = FUSE_MULT * (blankDamage(a) + blankDamage(b));
  a.ammo = "alloy";
  a.flat = dmg;
  a.mult = 1;
  a.ride = Math.max(a.ride, b.ride);
  a.burn += b.burn;
  a.shock = a.shock || b.shock;
  a.prior = Math.max(a.prior, b.prior);
  a.copy = a.copy || b.copy;
}

/** Twin pour. Returns true when this factory is a Crucible (handled here). */
export function crucibleProduce(ctx: SimCtx, s: SideState, f: FactoryState, dt: number): boolean {
  const spec = f.def.factory!;
  if (spec.ammo !== "blank") return false;
  let poured = 0;
  for (const ri of f.routes) {
    const r = s.routes[ri];
    const back = r.ammo[r.ammo.length - 1];
    if (back && back.s < AMMO_SPACING) continue; // this output is backed up: it misses the pour
    const p: Payload = {
      id: ctx.newId(), ammo: "blank", ride: 0, mult: 1, flat: 0, burn: 0, shock: false,
      prior: 0, factory: f.uid, copy: false,
    };
    r.ammo.push({ p, s: 0, processed: -1, blocked: false });
    poured++;
  }
  if (poured > 0) {
    f.timer = spec.interval;
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
