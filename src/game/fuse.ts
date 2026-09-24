// 0.6.1a: run-side fusion (ARSENAL.md §4.1, §4.2; REQ-BFG-019). Two copies of one fusible def at the
// same star level merge into one copy a level higher (1+1 = 2, 2+2 = 3; 3 is the maximum), as a copy
// is GAINED. gainModule is the only way a module enters a run: the shop (card, drag onto a cell or a
// turret), a warlord Hard pick, the Matriarch's prize, a road-event item (the trader's SWAP too) and
// tooling. Moving, storing, selling and trading never fuse. Invariant (tests/fuse.test.ts): after
// any run mutation no two fusible copies share a def and a star level below FUSE_MAX.

import { ITEMS } from "../sim/content";
import { removeItem, routesOf } from "../sim/deck";
import { FUSE_MAX, fusible, starField, starsOf, starText } from "../sim/stars";
import type { Run } from "./run";

export type FuseWhere = "cargo" | "deck" | "turret";

/** One merge: `absorbed` merged into `survivor`, which now has `stars` and sits at `where`. */
export interface FuseStep {
  def: string;
  absorbed: number;
  survivor: number;
  stars: number;
  where: FuseWhere;
  belts?: number; // belts removed with an absorbed factory (their tiles go back to belt capacity)
}

/** Where a gained copy goes: cargo (absent), a deck cell (caller checked canPlaceItem) or a turret hardpoint. */
export type GainAt = { x: number; y: number } | { turret: number };

/** What gainModule did: the new copy's uid, the merges, and where the module ended up. */
export interface Gain {
  uid: number;
  steps: FuseStep[];
  survivor: number;
  stars: number;
  where: FuseWhere;
}

interface Copy { uid: number; def: string; stars: number; where: FuseWhere; belts: number }

function copiesOf(run: Run, def?: string): Copy[] {
  const b = run.build;
  const out: Copy[] = [];
  for (const p of b.items) if (!def || p.def === def) out.push({ uid: p.uid, def: p.def, stars: starsOf(p), where: "deck", belts: routesOf(b, p.uid).length });
  for (const m of b.mods) if (!def || m.def === def) out.push({ uid: m.uid, def: m.def, stars: starsOf(m), where: "turret", belts: 0 });
  for (const i of run.inventory) if (!def || i.def === def) out.push({ uid: i.uid, def: i.def, stars: starsOf(i), where: "cargo", belts: 0 });
  return out;
}

function find(run: Run, uid: number): Copy | undefined {
  return copiesOf(run).find((c) => c.uid === uid);
}

function setStars(run: Run, uid: number, stars: number): void {
  const o = run.build.items.find((p) => p.uid === uid) ?? run.build.mods.find((m) => m.uid === uid) ?? run.inventory.find((i) => i.uid === uid);
  if (!o) return;
  if (stars > 1) o.stars = stars;
  else delete o.stars;
}

/** Remove a copy from its spot. A gate's cell becomes plain belt (routes are RouteDef.cells), a
 *  factory takes its belts with it, a mod frees its hardpoint. Returns the belts removed. */
function absorb(run: Run, c: Copy): number {
  if (c.where === "deck") {
    removeItem(run.build, c.uid);
    return c.belts;
  }
  if (c.where === "turret") run.build.mods = run.build.mods.filter((m) => m.uid !== c.uid);
  else run.inventory = run.inventory.filter((i) => i.uid !== c.uid);
  return 0;
}

/** The survivor rule (ARSENAL.md §4.1 rule 4). `arriving` is the copy that just reached this star
 *  level (a new copy, or the survivor of the previous step of a chain); null in fuseAll. */
function survivorOf(a: Copy, b: Copy, arriving: number | null): Copy {
  const pa = a.where !== "cargo", pb = b.where !== "cargo";
  if (pa !== pb) return pa ? a : b; // 1. a placed copy beats one in cargo
  if (pa) {
    // 3. two placed factories: the one with more belts survives
    if (ITEMS[a.def]?.kind === "factory" && a.belts !== b.belts) return a.belts > b.belts ? a : b;
    // 2. two placed copies: the twin that was already at that star level keeps its spot
    if (arriving === a.uid) return b;
    if (arriving === b.uid) return a;
  }
  return a.uid < b.uid ? a : b; // 4. otherwise the lower uid
}

function chain(run: Run, uid: number, arrivingFirst: boolean): FuseStep[] {
  const steps: FuseStep[] = [];
  let cur = find(run, uid);
  let first = true;
  while (cur && fusible(cur.def) && cur.stars < FUSE_MAX) {
    const c = cur;
    const twin = copiesOf(run, c.def).filter((t) => t.uid !== c.uid && t.stars === c.stars).sort((x, y) => x.uid - y.uid)[0];
    if (!twin) break;
    const keep = survivorOf(c, twin, first && !arrivingFirst ? null : c.uid);
    const lose = keep === c ? twin : c;
    const belts = absorb(run, lose);
    const stars = c.stars + 1;
    setStars(run, keep.uid, stars);
    steps.push({ def: c.def, absorbed: lose.uid, survivor: keep.uid, stars, where: keep.where, ...(belts ? { belts } : {}) });
    cur = find(run, keep.uid);
    first = false;
  }
  if (steps.length) queueFx(run, steps);
  return steps;
}

/** Cosmetic: the build screen toasts these in order ("MERGED: TEMPER ★2", "MERGED · 1 BELT REMOVED"). */
function queueFx(run: Run, steps: FuseStep[]): void {
  const last = steps[steps.length - 1];
  const fx = [`MERGED: ${ITEMS[last.def].name} ${starText(last.stars)}`];
  const belts = steps.reduce((n, s) => n + (s.belts ?? 0), 0);
  if (belts) fx.push(`MERGED · ${belts} BELT${belts > 1 ? "S" : ""} REMOVED`);
  run.fuseFx = [...(run.fuseFx ?? []), ...fx];
}

/** The chain loop from copy `uid`: merge while a twin (same def, same stars below FUSE_MAX) exists. */
export function fuseFrom(run: Run, uid: number): FuseStep[] {
  return chain(run, uid, true);
}

/** Merge every pair in the run (migration of old saves, tooling). Lowest stars first, then uid. */
export function fuseAll(run: Run): FuseStep[] {
  const steps: FuseStep[] = [];
  for (;;) {
    const all = copiesOf(run).filter((c) => fusible(c.def) && c.stars < FUSE_MAX).sort((x, y) => x.stars - y.stars || x.uid - y.uid);
    const c = all.find((x) => all.some((y) => y !== x && y.def === x.def && y.stars === x.stars));
    if (!c) return steps;
    steps.push(...chain(run, c.uid, false));
  }
}

/** THE way a module enters a run: a 1-star copy in cargo, on a deck cell or on a turret, then fused. */
export function gainModule(run: Run, def: string, at?: GainAt): Gain {
  const uid = run.nextUid++;
  if (at && "turret" in at) run.build.mods.push({ uid, def, turret: at.turret });
  else if (at) run.build.items.push({ uid, def, x: at.x, y: at.y });
  else run.inventory.push({ uid, def });
  const steps = fuseFrom(run, uid);
  const fin = find(run, steps.length ? steps[steps.length - 1].survivor : uid)!;
  return { uid, steps, survivor: fin.uid, stars: fin.stars, where: fin.where };
}

/** What gaining one more copy of `def` into cargo would do, without changing the run (badge,
 *  inspect and pick cards): the final star level, the survivor and where it sits; null: no merge. */
export function mergePreview(run: Run, def: string): { toStars: number; survivorUid: number; where: FuseWhere } | null {
  if (!fusible(def)) return null;
  const sim = { ...run, build: JSON.parse(JSON.stringify(run.build)), inventory: run.inventory.map((i) => ({ ...i })), fuseFx: [] } as Run;
  const g = gainModule(sim, def);
  return g.steps.length ? { toStars: g.stars, survivorUid: g.survivor, where: g.where } : null;
}

/** Invariant check: one message per def and star level (below FUSE_MAX) held more than once. */
export function unfusedInRun(run: Run): string[] {
  const n = new Map<string, number>();
  for (const c of copiesOf(run)) if (fusible(c.def) && c.stars < FUSE_MAX) n.set(`${c.def}*${c.stars}`, (n.get(`${c.def}*${c.stars}`) ?? 0) + 1);
  return [...n].filter(([, k]) => k > 1).map(([key, k]) => { const [d, s] = key.split("*"); return `UNFUSED PAIR: ${ITEMS[d].name} ★${s} x${k}`; });
}

/** A copy of `o` with the star field of `stars` (absent at 1 star): moving parts keeps their stars. */
export function keepStars<T extends object>(o: T, stars: number): T & { stars?: number } {
  return { ...o, ...starField(stars) };
}
