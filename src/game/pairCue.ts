// PAIR-CUE (REQ-BFG-100; REQ-BFG-081 for PAIR's read; display only): the PAIR on the battle board. A `pair` event (sim/battle.ts
// loaded: a load reaches a pair-reading turret from another belt no more than SYNC_WINDOW after an unpaired one; fusionPair:
// a FOUNDRY fusion in such a turret) names its side and turret only, so the view reads the rest from the sim's own state,
// never writing it: the turret's chamber, each chamber load's entry (SideState.pairs: when and through which route it
// entered), the loads' `paired` marks, and the shots in flight. On each pair the board shows, for FLASH_S:
//   1. both loads' intake tiles (their routes' last tiles) flashed in PAIR's blue;
//   2. a short bracket at the gun joining the two intakes;
//   3. PAIR's 5x7 glyph popping over the gun in the hit numbers' style (Fx.pairPop; the pool's spare room only);
// and 4. each hit of a PAIR shot (a paired load's, its COMPOUND partner's or a MOLTEN VOWS echo's) carries PAIR's small glyph
// beside its number (arenaReact's impact case; Fx.pairPop's mark); 5. while a load waits in the chamber inside the window,
// unpaired, its intake glows softly, fading as the window closes (pulsing with motion on); a pair's flash replaces it.
// Shown only in the fight phase (the screens set `on`); the arena feeds it every step it plays (Arena.update), before the
// step's events are reacted to. docs: output-pair1/REPORT.md sections 2-3.

import type { Battle, Payload, Side, SideState, SimEvent, TurretState } from "../sim/battle";
import { CELL } from "../sim/content";
import { kx, ky, turretSlots } from "../sim/deck";
import { SYNC_WINDOW } from "../sim/races/foundry";
import { TURRET_LY, localRect, sx, sy, type Box } from "../render/frame";
import { C } from "../render/palette";
import { rect, type G } from "../render/pixel";
import { PAIR_COLOUR } from "../render/fx";
import type { Arena } from "./arena";

/** The flash on both intakes and the bracket at the gun: how long they show (s, effect time, as the numbers age). */
export const FLASH_S = 0.3;
/** The near-miss glow's strongest alpha (a fresh load), fading to 0 as its window closes; with motion on it pulses this
 *  many times a second between PULSE_LOW and 1 of that. */
export const GLOW_A = 0.42;
export const PULSE_HZ = 6, PULSE_LOW = 0.55;
/** The flash's fill alpha at its start (it fades to a third of it by FLASH_S); its frame stays solid. */
export const FLASH_A = 0.6;
/** Float slack on the sim's accumulated time (races/foundry.ts EPS). */
const EPS = 1e-6;

/** How a pair's two intakes were found: from both loads' recorded entries ("loads"); a FOUNDRY fusion's alloy and the belt
 *  that delivered its partner this step ("fusion"); the turret's only two intakes ("two"); not found ("none": no flash or
 *  bracket, the glyph still pops). */
export type PairHow = "loads" | "fusion" | "two" | "none";

export interface PairShown {
  side: Side;
  turret: number;
  /** the two loads' routes (their intakes: each route's last tile), or fewer when not found */
  routes: number[];
  how: PairHow;
  /** effect seconds since the pair */
  age: number;
}

/** A load's entry as the sim recorded it (SideState.pairs). */
const entry = (s: SideState, p: Payload): { at: number; route: number } | undefined => s.pairs?.get(p);

/** The intakes of turret slot `slot` on side `s`: the routes feeding it (connected, not a joining belt). Pure. */
export function intakesOf(s: Pick<SideState, "routes">, slot: number): number[] {
  const out: number[] = [];
  for (const r of s.routes) if (r.turret === slot && r.connected && !r.join) out.push(r.index);
  return out;
}

/**
 * The two loads a `pair` event joined, among `loads` (the turret's chamber and the shots it fired in the step, as the view
 * finds them) that the sim marked `paired` and that no earlier pair event took (`taken`): the newest by its recorded entry
 * (the load that just entered), and its partner: the newest other one from another route, entered no more than SYNC_WINDOW
 * before it (the sim's own sync rule, races/foundry.ts inSync). Null when not both are found. Pure.
 */
export function pairLoads(s: Pick<SideState, "pairs">, loads: readonly Payload[], taken: { has(p: Payload): boolean }): [Payload, Payload] | null {
  let p: Payload | null = null;
  for (const q of loads) {
    if (!q.paired || taken.has(q)) continue;
    const m = s.pairs?.get(q);
    if (!m) continue;
    if (!p || m.at > s.pairs!.get(p)!.at) p = q;
  }
  if (!p) return null;
  const mp = s.pairs!.get(p)!;
  let q: Payload | null = null;
  for (const x of loads) {
    if (x === p || !x.paired || taken.has(x)) continue;
    const m = s.pairs!.get(x);
    if (!m || m.route === mp.route || mp.at - m.at > SYNC_WINDOW + EPS || m.at - mp.at > EPS) continue;
    if (!q || m.at >= s.pairs!.get(q)!.at) q = x;
  }
  return q ? [q, p] : null;
}

/**
 * Which of a step's impacts are PAIR shots' (SCOUT-1's countStep rule, Arena: a step lands its shots in flight order, which
 * is id order, each with one first-hand `impact`, a splash's, arc's or lance's impact coming after its own event): the ids
 * in flight before the step that are gone after it and were not downed (`flak`), sorted, take the first-hand impacts in
 * turn; `paired` says which of them carried a paired load. Pure: returns the marked impacts.
 */
export function pairedImpacts(before: ReadonlyMap<number, boolean>, alive: ReadonlySet<number>, ev: readonly SimEvent[]): SimEvent[] {
  const downed = new Set<number>();
  for (const e of ev) if (e.type === "flak") downed.add(e.proj);
  const landed: number[] = [];
  for (const id of before.keys()) if (!alive.has(id) && !downed.has(id)) landed.push(id);
  if (!landed.length) return [];
  landed.sort((x, y) => x - y);
  const out: SimEvent[] = [];
  let k = 0, cur = -1, second = false;
  for (const e of ev) {
    if (e.type === "splash" || e.type === "arc" || e.type === "lance") second = true;
    else if (e.type === "impact") {
      if (!second) cur = k < landed.length ? landed[k++] : -1;
      second = false;
      if (cur >= 0 && before.get(cur)) out.push(e);
    }
  }
  return out;
}

export class PairWatch {
  /** Drawn this frame: the screens set it (the fight phase of a battle or a replay; never the intro, the outro, the card
   *  or VIEW BATTLEFIELD). Off, nothing of the cue draws (its pops wait unseen and age out). */
  on = false;
  /** The pairs showing (age < FLASH_S). */
  readonly shown: PairShown[] = [];
  /** Tooling (bb.pairs; the REPORT): what the watch has seen and done this fight. */
  readonly tally = { pairs: 0, loads: 0, fusion: 0, two: 0, none: 0, glyphs: 0, glyphsDropped: 0, marks: 0, marksDropped: 0 };
  private readonly marked = new Set<SimEvent>();
  private readonly taken = new WeakSet<Payload>();
  private readonly fused = new WeakSet<Payload>();
  /** Before a step: each shot in flight, by id, and whether it carries a PAIR (its load, or its COMPOUND partner). */
  private readonly flying = new Map<number, boolean>();
  private readonly alive = new Set<number>();
  /** Before a step: each side's routes' front loads (a FOUNDRY fusion's partner leaves no record but its belt). */
  private readonly fronts: (Payload | undefined)[][] = [[], []];
  private slotsFor: unknown = null;
  private slots: [ReturnType<typeof turretSlots>, ReturnType<typeof turretSlots>] = [[], []];
  private readonly box: Box = { x: 0, y: 0, w: 0, h: 0 };

  /** Before each step the arena plays (read only). Nothing to do on a fight with no pair reader aboard. */
  pre(b: Battle): void {
    this.flying.clear();
    if (!b.sides[0].pairs && !b.sides[1].pairs) return;
    for (const p of b.projectiles) this.flying.set(p.id, !!(p.payload.paired || p.payload.compound?.paired));
    for (const side of [0, 1] as Side[]) {
      const s = b.sides[side], f = this.fronts[side];
      f.length = 0;
      if (!s.pairs) continue;
      for (const r of s.routes) f.push(r.ammo[0]?.p);
    }
  }

  /** After each step, before its events are reacted to (read only): the PAIR shots' impacts, and each pair's cue. */
  step(a: Arena, ev: readonly SimEvent[]): void {
    this.marked.clear();
    const b = a.b;
    if (!b.sides[0].pairs && !b.sides[1].pairs) return;
    if (this.flying.size) {
      this.alive.clear();
      for (const p of b.projectiles) this.alive.add(p.id);
      for (const e of pairedImpacts(this.flying, this.alive, ev)) this.marked.add(e);
    }
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      if (e.type !== "pair") continue;
      const prev = i > 0 ? ev[i - 1] : null;
      const fusion = !!prev && prev.type === "fuse" && prev.side === e.side && prev.turret === e.turret;
      this.pair(a, e.side, e.turret, fusion, ev);
    }
  }

  /** The effect clock (Arena.update's: the numbers' time): the flashes and brackets play out. */
  tick(dt: number): void {
    let n = 0;
    for (let i = 0; i < this.shown.length; i++) {
      const c = this.shown[i];
      c.age += dt;
      if (c.age < FLASH_S) this.shown[n++] = c;
    }
    this.shown.length = n;
  }

  /** arenaReact's impact case: this impact is a PAIR shot's (its number carries PAIR's glyph). */
  marks(e: SimEvent): boolean {
    return this.marked.has(e);
  }

  /** A mark was given (true) or dropped by the pool (false): tooling. */
  marked1(ok: boolean): void {
    if (ok) this.tally.marks++;
    else this.tally.marksDropped++;
  }

  /** A SKIP: nothing it stepped is shown. */
  reset(): void {
    this.shown.length = 0;
    this.marked.clear();
  }

  private slotsOf(b: Battle, side: Side): ReturnType<typeof turretSlots> {
    if (this.slotsFor !== b) {
      this.slotsFor = b;
      this.slots = [turretSlots(b.sides[0].build), turretSlots(b.sides[1].build)];
    }
    return this.slots[side];
  }

  /** The loads the view can find for turret `tu` right after the step: its chamber, then what it fired in the step (each
   *  shot's load and its COMPOUND partner; a MOLTEN VOWS echo shares its shot's load). */
  private loadsOf(b: Battle, side: Side, tu: TurretState, ev: readonly SimEvent[]): Payload[] {
    const out: Payload[] = [...tu.stack];
    for (const e of ev) {
      if (e.type !== "fire" || e.side !== side || e.turret !== tu.index) continue;
      const pr = b.projectiles.find((q) => q.id === e.proj);
      if (!pr) continue;
      if (!out.includes(pr.payload)) out.push(pr.payload);
      const c = pr.payload.compound;
      if (c && !out.includes(c)) out.push(c);
    }
    return out;
  }

  /** One `pair` event: its two intakes as soundly as the view can read them (PairHow), its flash and bracket, its glyph. */
  private pair(a: Arena, side: Side, slot: number, fusion: boolean, ev: readonly SimEvent[]): void {
    const b = a.b, s = b.sides[side];
    this.tally.pairs++;
    const tu = s.turrets.find((q) => q.index === slot);
    if (!tu) return;
    const intakes = intakesOf(s, slot);
    const loads = this.loadsOf(b, side, tu, ev);
    let routes: number[] = [], how: PairHow = "none";
    if (fusion) {
      // the alloy is the partner blank fused in place (races/foundry.ts tryFuse): its entry is recorded; the blank that
      // arrived is gone, so its belt is the intake whose front load left it in this step and is now nowhere (not on its
      // belt, not in the chamber or the store, not in a shot: it was fused away)
      const alloy = loads.find((p) => p.ammo === "alloy" && p.paired && !this.fused.has(p) && !!entry(s, p));
      if (alloy) {
        this.fused.add(alloy);
        const ra = entry(s, alloy)!.route, f = this.fronts[side];
        const gone = (p: Payload | undefined, ri: number): boolean => p !== undefined && !s.routes[ri].ammo.some((am) => am.p === p)
          && !loads.includes(p) && !tu.store.some((it) => it.p === p);
        const came = intakes.filter((ri) => ri !== ra && gone(f[ri], ri));
        if (came.length === 1) { routes = [ra, came[0]]; how = "fusion"; } else routes = [ra];
      }
    } else {
      const two = pairLoads(s, loads, this.taken);
      if (two) {
        this.taken.add(two[0]);
        this.taken.add(two[1]);
        routes = [entry(s, two[0])!.route, entry(s, two[1])!.route];
        how = "loads";
      }
    }
    if (routes.length < 2 && intakes.length === 2) { routes = intakes; how = "two"; }
    if (routes.length < 2) how = "none";
    this.tally[how]++;
    this.shown.push({ side, turret: slot, routes, how, age: 0 });
    // the glyph over the gun's pivot (its board's rest-screen px, as a hit number's), riding with its board
    const sl = this.slotsOf(b, side)[slot];
    if (!sl) return;
    const fr = a.drawn[side], lx = (sl.col0 + sl.width / 2) * CELL;
    a.fx.anchor = side;
    if (a.fx.pairPop(sx(fr, lx, TURRET_LY), sy(fr, lx, TURRET_LY) - 6)) this.tally.glyphs++;
    else this.tally.glyphsDropped++;
  }

  // ---------------------------------------------------------------------------------------------------------- drawing

  /** Is route `ri` of `side` flashing now (a pair's flash replaces the glow)? */
  private flashing(side: Side, ri: number): boolean {
    for (const c of this.shown) if (c.side === side && c.routes.includes(ri)) return true;
    return false;
  }

  /** The screen rect (the board's rest-screen px) of route `ri`'s intake tile: its last tile, the one before the gun. */
  private intakeTile(a: Arena, side: Side, ri: number): Box | null {
    const r = a.b.sides[side].routes[ri];
    if (!r || !r.cells.length) return null;
    const k = r.cells[r.cells.length - 1];
    return localRect(a.drawn[side], kx(k) * CELL, ky(k) * CELL, CELL, CELL, this.box);
  }

  /**
   * One board's cue, drawn in its world layer under its board's transform (ArenaMotion.overBoard, after its turrets): the
   * near-miss glows, then each pair's flash on both intakes and its bracket at the gun. Display only.
   */
  drawBoard(t: G, a: Arena, side: Side, reduced: boolean): void {
    const d = this.drawn;
    d.glows[side].length = 0;
    d.flashes[side].length = 0;
    d.brackets[side] = 0;
    if (!this.on || a.b.over) return;
    const s = a.b.sides[side];
    // 5. the near miss: an unpaired load in a pair reader's chamber, inside its window
    if (s.pairs) {
      const pulse = reduced ? 1 : PULSE_LOW + (1 - PULSE_LOW) * (0.5 + 0.5 * Math.cos(2 * Math.PI * PULSE_HZ * a.clock));
      for (const tu of s.turrets) {
        if (!tu.pairing) continue;
        for (const q of tu.stack) {
          if (q.paired) continue;
          const m = s.pairs.get(q);
          if (!m) continue;
          const age = a.b.t - m.at;
          if (age < -EPS || age > SYNC_WINDOW + EPS || this.flashing(side, m.route)) continue;
          const r = this.intakeTile(a, side, m.route);
          if (!r) continue;
          const alpha = GLOW_A * Math.max(0, 1 - age / SYNC_WINDOW) * pulse;
          t.globalAlpha = alpha;
          rect(t, r.x, r.y, r.w, r.h, PAIR_COLOUR);
          t.globalAlpha = 1;
          d.glows[side].push({ route: m.route, turret: tu.index, alpha, age });
        }
      }
    }
    // 1. and 2. each pair's flash on both intakes, and its bracket at the gun
    for (const c of this.shown) {
      if (c.side !== side) continue;
      const k = c.age / FLASH_S;
      for (const ri of c.routes) {
        const r = this.intakeTile(a, side, ri);
        if (!r) continue;
        t.globalAlpha = FLASH_A * (1 - (2 / 3) * k);
        rect(t, r.x, r.y, r.w, r.h, PAIR_COLOUR);
        t.globalAlpha = 1;
        frame(t, r, PAIR_COLOUR);
        d.flashes[side].push({ route: ri, turret: c.turret, age: c.age });
      }
      if (c.routes.length >= 2) { this.bracket(t, a, side, c.routes); d.brackets[side]++; }
    }
  }

  /** Tooling (bb.pairs, the tests): what drawBoard drew last for each side: the glows, the flashed intakes, the brackets. */
  readonly drawn: {
    glows: [{ route: number; turret: number; alpha: number; age: number }[], { route: number; turret: number; alpha: number; age: number }[]];
    flashes: [{ route: number; turret: number; age: number }[], { route: number; turret: number; age: number }[]];
    brackets: [number, number];
  } = { glows: [[], []], flashes: [[], []], brackets: [0, 0] };

  /**
   * The bracket at the gun joining two intakes (deck px, through the board's frame): a 1 px bar 2 px in front of the
   * intakes' row (on the gun's side), from one intake's centre column to the other's, a 3 px tick down into each tile
   * and a 2 px stem up from its middle towards the gun; PAIR's blue with a 1 px ink outline.
   */
  private bracket(t: G, a: Arena, side: Side, routes: readonly number[]): void {
    const s = a.b.sides[side], f = a.drawn[side];
    const ends: number[] = [];
    let row = Infinity;
    for (const ri of routes) {
      const r = s.routes[ri];
      if (!r || !r.cells.length) continue;
      const k = r.cells[r.cells.length - 1];
      ends.push((kx(k) + 0.5) * CELL);
      row = Math.min(row, ky(k) * CELL);
    }
    if (ends.length < 2 || !Number.isFinite(row)) return;
    const x0 = Math.floor(Math.min(...ends)), x1 = Math.floor(Math.max(...ends)), y = row - 2, mid = Math.floor((x0 + x1) / 2);
    const parts: [number, number, number, number][] = [
      [x0, y, x1 - x0 + 1, 1], [x0, y, 1, 4], [x1, y, 1, 4], [mid, y - 2, 1, 2],
    ];
    for (const [lx, ly, w, h] of parts) { const r = localRect(f, lx - 1, ly - 1, w + 2, h + 2, this.box); rect(t, r.x, r.y, r.w, r.h, C.ink); }
    for (const [lx, ly, w, h] of parts) { const r = localRect(f, lx, ly, w, h, this.box); rect(t, r.x, r.y, r.w, r.h, PAIR_COLOUR); }
  }
}

/** A 1 px frame round `r`. */
function frame(t: G, r: Box, col: string): void {
  rect(t, r.x, r.y, r.w, 1, col);
  rect(t, r.x, r.y + r.h - 1, r.w, 1, col);
  rect(t, r.x, r.y, 1, r.h, col);
  rect(t, r.x + r.w - 1, r.y, 1, r.h, col);
}
