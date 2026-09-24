// races: SIPHON mechanics (docs/RACES.md §4). The Sump marks each leech by its route's
// destination (left gun DRAG, right gun ECHO, no gun DRAG). DRAG slows the struck enemy belt
// segment; ECHO copies the added effects of the last enemy payload that struck Siphon.

import { AMMO, AMMO_SPACING } from "../content";
import type { RouteDef } from "../deck";
import type { FactoryState, Payload, RouteState, SideState, Target } from "../battle";
import { FUSE_MULT, type SimCtx } from "./foundry";
import { RACE_AMMO } from "./data";

export const DRAG_MULT = 0.25; // a dragged segment runs at x0.25 of its speed state
export const DRAG_TIME = 3.0; // s; a re-hit refreshes it, never stacks
export const ECHO_TURRET = 1; // routes into the right gun carry ECHO; every other route DRAG
export const ECHO_CAP = { flat: 3, burn: 2, fray: 1 } as const;
const EPS = 1e-9;

// ---------------------------------------------------------------- Sump

export type LeechKind = "leechDrag" | "leechEcho";

/** The mark a leech gets on this route: ECHO into the right gun, otherwise DRAG. */
export function leechFor(r: RouteState): LeechKind {
  return r.connected && r.turret === ECHO_TURRET ? "leechEcho" : "leechDrag";
}

/** Sump production: round robin over its routes like the Loom, marking each leech. */
export function sumpProduce(ctx: SimCtx, s: SideState, f: FactoryState, dt: number): boolean {
  const spec = f.def.factory!;
  if (spec.ammo !== "leechDrag") return false;
  const n = f.routes.length;
  for (let k = 0; k < n; k++) {
    const r = s.routes[f.routes[(f.rr + k) % n]];
    const back = r.ammo[r.ammo.length - 1];
    if (back && back.s < AMMO_SPACING) continue;
    const p: Payload = {
      id: ctx.newId(), ammo: leechFor(r), ride: 0, mult: 1, flat: 0, burn: 0, shock: false,
      prior: 0, factory: f.uid, copy: false,
    };
    r.ammo.push({ p, s: 0, processed: -1, blocked: false });
    f.rr = (f.rr + k + 1) % n;
    f.timer = spec.interval;
    f.flash = 0.18;
    f.produced++;
    f.stalled = false;
    s.stats.produced++;
    ctx.events.push({ type: "produce", side: s.side, factory: f.uid });
    return true;
  }
  f.stalled = true;
  f.timer = 0;
  s.stats.stalled += dt;
  return true;
}

// ---------------------------------------------------------------- Drag

export interface DragState {
  until: number[][]; // per route, per cell: battle time the Drag ends (0 = never dragged)
  hits: number; // Drag hits that dragged at least one cell
}

export function newDragState(routes: RouteDef[]): DragState {
  return { until: routes.map((r) => r.cells.map(() => 0)), hits: 0 };
}

export function isDragged(st: DragState, t: number, route: number, ci: number): boolean {
  const u = st.until[route];
  return !!u && ci >= 0 && ci < u.length && t < u[ci] - EPS;
}

/**
 * Belt spans between machinery nodes on a route, as [first, last] tile index. 0.6.2 BELTSIDE: rigs stand
 * beside the belt, so the nodes are the tiles their arrows hit: each hit tile opens a new span, and every
 * tile belongs to exactly one span (a hit tile is the first tile of the span downstream of it).
 */
export function segments(r: RouteState): [number, number][] {
  const out: [number, number][] = [];
  if (!r.cells.length) return out;
  let start = 0;
  for (let i = 1; i < r.cells.length; i++) {
    if (r.gateAt[i].length) {
      out.push([start, i - 1]);
      start = i;
    }
  }
  out.push([start, r.cells.length - 1]);
  return out;
}

/** The segments a DRAG hit on target `t` slows (RACES.md §4). A bare-hull hit drags nothing. */
export function dragSpans(s: SideState, t: Target): { route: number; span: [number, number] }[] {
  const out: { route: number; span: [number, number] }[] = [];
  const add = (r: RouteState | undefined, span: [number, number] | undefined) => {
    if (r && span) out.push({ route: r.index, span });
  };
  switch (t.kind) {
    case "belt": {
      const r = s.routes[t.ref];
      if (r) add(r, segments(r).find(([a, b]) => t.cell >= a && t.cell <= b));
      break;
    }
    case "gate": { // 0.6.2: the span downstream of each tile the rig hits (none when IDLE)
      const g = s.gates.find((q) => q.uid === t.ref);
      for (const h of g?.hits ?? []) add(s.routes[h.route], segments(s.routes[h.route]).find(([a]) => a === h.tile));
      break;
    }
    case "factory": { // the first segment of each of its routes
      const f = s.factories.find((q) => q.uid === t.ref);
      if (f) for (const ri of f.routes) add(s.routes[ri], segments(s.routes[ri])[0]);
      break;
    }
    case "turret": { // the last segment of each route feeding it
      for (const r of s.routes) {
        if (!r.connected || r.turret !== t.ref) continue;
        const sg = segments(r);
        add(r, sg[sg.length - 1]);
      }
      break;
    }
    default:
      break;
  }
  return out;
}

/** Apply (or refresh) Drag on the struck side. Returns the number of cells dragged. */
export function applyDrag(ctx: SimCtx, s: SideState, st: DragState, t: Target): number {
  const until = ctx.t + DRAG_TIME;
  let cells = 0;
  for (const { route, span } of dragSpans(s, t)) {
    for (let i = span[0]; i <= span[1]; i++) {
      st.until[route][i] = until;
      cells++;
    }
  }
  if (cells > 0) st.hits++;
  return cells;
}

// ---------------------------------------------------------------- Echo

export interface EchoMemory {
  flat: number;
  burn: number;
  shock: boolean;
  fray: number;
}

export interface EchoState {
  mem: EchoMemory | null; // the last enemy payload that struck, capped
  fray: WeakSet<Payload>; // ECHO leeches that carry a copied Fray stack
  charged: number; // ECHO leeches that loaded with a non-empty memory
}

export function newEchoState(): EchoState {
  return { mem: null, fray: new WeakSet(), charged: 0 };
}

/** The flat damage a payload gained from processing. An alloy slug keeps its fused base in flat. */
export function addedFlat(p: Payload): number {
  const fused = p.ammo === "alloy" ? FUSE_MULT * 2 * RACE_AMMO.blank.base : 0;
  return Math.max(0, p.flat - fused);
}

/** Echo memory of payload `p` (overwrites the last one; never consumed). */
export function echoOf(p: Payload, carriesFray: boolean): EchoMemory {
  return {
    flat: Math.min(ECHO_CAP.flat, addedFlat(p)),
    burn: Math.min(ECHO_CAP.burn, p.burn),
    shock: p.shock,
    fray: AMMO[p.ammo].fray > 0 || carriesFray ? ECHO_CAP.fray : 0,
  };
}

/** An ECHO leech loading into the chamber copies the memory: flat x its split mult, full statuses. */
export function echoOnLoad(st: EchoState, p: Payload): void {
  if (p.ammo !== "leechEcho" || !st.mem) return;
  const m = st.mem;
  p.flat += m.flat * p.mult;
  p.burn += m.burn;
  p.shock = p.shock || m.shock;
  if (m.fray > 0) st.fray.add(p);
  st.charged++;
}
