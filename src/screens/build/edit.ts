// Deck editing gestures. Drag: buy/place/move/store, lay conveyor out of a factory, grab a
// belt to reroute it, hold a factory to lift it. Tap: select; with a card or cargo item
// selected, a tap on the deck places it there (touch parity with drag and drop).
//
// shoptap (BeltBattles 0.8.0 phone controls; REQ-BFG-034, -035, -036, -037): a press knows its pointer (core/io.ts passes
// pointerdown's pointerType). A mouse press is exactly as before: a 4 px drag threshold, a click selects, a click on a rig
// turns it, click-to-place. A touch or pen press:
//   D1  stays a tap until it has moved TOUCH_SLOP_CSS (10) CSS px, converted through the view (dragSlop);
//   D2  taps read (read()): it selects what it lands on and opens its panel, and never buys, sells, moves, places, merges,
//       cuts or reroutes. A rig turns only on a tap while it is already selected; with a card or cargo part selected, a
//       tap on the deck reads what it lands on (an empty cell dismisses). A tap on the selected turret steps through its
//       core and gear (each a "fitted" selection with its own panel: TO CARGO, SELL);
//   D3  a tap on a belt selects it and puts up its X (beltX(); the screen draws it; any other press takes it down);
//   D4a a drag that starts on a factory's own first belt tile is the factory's while it has a free output: a new belt;
//   D4b back on its factory, a draw starts over (released there, nothing changes).
// bb-0.8.3 (REQ-BFG-042 D6): every factory has 2 or more belt slots (stars.ts outputsAt), so no drag moves a belt any more:
// a drag out of a factory whose slots are all in use draws nothing and says so (fullNotice), mouse and touch alike, as a
// full GANTRY PRESS's drag did in 0.8.0. 0.8.0's one-output notice ("HAS 1 OUTPUT · THIS MOVES ITS BELT") is gone.

import type { PointerKind } from "../../core/io";
import { GRID, rigShape } from "../../sim/content";
import {
  adjacentToFactory, canExtend, commitRoute, connectorFree, defOf, hero, inGrid, isFreeConnectorEnd, isRig,
  itemByUid, key, kx, ky, manhattanSteps, occupancy, rotOf, routeInfo, routesOf,
} from "../../sim/deck";
import { canJoin, joinOf } from "../../sim/deck"; // 0.6.2j: belt joins
import { JOIN_PACE_PCT } from "../../sim/deck"; // 0.6.2 TUNE-M: RULE JOIN PACE
import { ITEMS, UPGRADE_MAX } from "../../sim/content";
import { FUSE_MAX, gradeOf, isSignatureFactory, outputsAt } from "../../sim/stars";
import { C } from "../../render/palette";
import { cellAt, footX, footY } from "../../render/frame";
import { inside } from "../../ui/ui";
import { drop, dropCell, rigRotAt, rotate, type Carry, type Ctx, type Src } from "./actions";
import type { Sel } from "./layout";
import { coreFor, gearFor } from "../../sim/deck"; // 0.6.1b
import { gearOn, turretSlots, type Build } from "../../sim/deck"; // 0.6.2s (REQ-BFG-031); shoptap: gearOn, Build

/** The mouse's drag threshold in logical px (unchanged since 0.5). */
export const MOUSE_SLOP = 4;
/** shoptap (D1): a touch or pen press stays a tap until it has moved this many CSS px (a finger's tap drifts 3-8). */
export const TOUCH_SLOP_CSS = 10;

/** shoptap (D1): how far a press must move, in logical px, to become a drag: MOUSE_SLOP for a mouse; TOUCH_SLOP_CSS
 *  CSS px for touch and pen, through `cssPerPx` (the view's CSS px per logical px, view.scale / view.dpr). */
export function dragSlop(kind: PointerKind, cssPerPx: number): number {
  return kind === "mouse" ? MOUSE_SLOP : TOUCH_SLOP_CSS / Math.max(1e-6, cssPerPx);
}

/** shoptap (D2): a touch or pen pointer: its taps read. */
export const direct = (kind: PointerKind | undefined): boolean => kind === "touch" || kind === "pen";

/** "3RD", "4TH" (belt slots run 2-5). */
const ordinal = (n: number): string => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "TH" : ["TH", "ST", "ND", "RD"][n % 10] ?? "TH"}`;

/**
 * bb-0.8.3 (REQ-BFG-044 D6, REQ-BFG-043 D11): what a drag out of a factory whose belt slots are all in use says, as it
 * draws nothing: its belts are in use, and what opens one more. A bought factory below ★3: its next star ("STAMP PRESS'S
 * 2 BELTS ARE IN USE · ★2 OPENS A 3RD"); the hero's own factory below level 4: its FACTORY upgrade ("KILN'S 2 BELTS ARE
 * IN USE · UPGRADE FOR A 3RD"); one at the top says to drag a belt to reroute it. `grade`: its stars, or the hero
 * factory's FACTORY level (stars.ts gradeOf); `signature`: it is a hero's signature factory (it levels by upgrade).
 */
export function fullNotice(name: string, belts: number, grade: number, signature: boolean): string {
  const head = `${name}'S ${belts} BELTS ARE IN USE`;
  if (signature) return grade < UPGRADE_MAX ? `${head} · UPGRADE FOR A ${ordinal(belts + 1)}` : `${head} · DRAG A BELT TO REROUTE`;
  return grade < FUSE_MAX ? `${head} · ★${grade + 1} OPENS A ${ordinal(belts + 1)}` : `${head} · DRAG A BELT TO REROUTE`;
}

/** shoptap (D4 a): how many more belts factory `uid` can start (its outputs at its stars, = routeCheck.ts, validate.ts;
 *  bb-0.8.3: the hero factory's at its FACTORY level, stars.ts gradeOf). */
export function freeOutputs(b: Build, uid: number): number {
  const f = itemByUid(b, uid);
  if (!f || defOf(f).kind !== "factory") return 0;
  return (outputsAt(f.def, gradeOf(b, f)) || 1) - routesOf(b, uid).length;
}

/** shoptap (REQ-BFG-035): the fitted pieces of turret slot t that a touch tap on the selected turret steps through: its
 *  bought core, then its gear in hardpoint order (its GEAR SLOTS); none for an empty slot. */
export function fittedPieces(b: Build, t: number): number[] {
  const s = turretSlots(b)[t];
  if (!s?.turret) return [];
  const core = coreFor(b, t);
  return [...(core ? [core.uid] : []), ...gearOn(b, t).slice(0, s.gearSlots).map((m) => m.uid)];
}

export interface EditHost extends Ctx {
  sel: Sel;
  offerAt(x: number, y: number): { wagon: number; slot: number } | null;
  cargoAt(x: number, y: number): number | null;
  /** shoptap (D1): CSS px per logical px (the touch slop's unit); absent, 1. */
  cssPerPx?(): number;
}

interface Press {
  src: Src;
  x0: number;
  y0: number;
  t: number;
  /** shoptap (D1): the pointer that pressed, and how far (logical px) it must move to become a drag. */
  kind: PointerKind;
  slop: number;
}

export interface Draw {
  factory: number;
  cells: number[];
  replacing: number;
  // 0.6.2j (J3): the draw stepped into another belt's tile and joins it there (canJoin): it is complete, and can't
  // go on past it; dragging back over its own cells undoes it
  join?: number;
  // 0.6.2j (J3, J11): the belt tile the drag last tried to join and was refused, and why (the preview marks it)
  refused?: { cell: number; reason: string };
  /** shoptap (D4 b): a touch or pen draw (absent: a mouse draw, exactly as before): back on its factory it starts over. */
  kind?: PointerKind;
  /** shoptap (D4 a): the factory's own first belt tile a touch draw started on: it counts as the factory (the press was
   *  ambiguous between them), so the new belt never steps into or joins its old one there. */
  start?: number;
}

/** 0.6.2j: the belt being drawn, as the deck renderer previews it (CruiserView.ghost). */
export interface GhostBelt {
  factory: number;
  cells: number[];
  connected: boolean;
  join?: number; // J11: it will join this belt tile
  refused?: { cell: number; reason: string }; // J11: a join the drag was refused, and why
}

/** shoptap (D3): the X a touch tap put up on a belt: the belt (route index), the tile tapped and the belt's cells then. */
export interface BeltX {
  index: number;
  cell: number;
  cells: string;
}

export class Editor {
  press: Press | null = null;
  carry: Carry | null = null;
  draw: Draw | null = null;
  px = 0;
  py = 0;
  carryT = 0; // time since pick-up (lift animation)
  private lastWarn = "";
  private warnT = 0;
  /** shoptap (D3): the belt X a touch tap put up (beltX() says whether it still stands). */
  private x: BeltX | null = null;

  constructor(private h: EditHost) {}

  get busy(): boolean {
    return !!(this.press || this.carry || this.draw);
  }

  /** shoptap (D3): the belt X, while it stands: put up by a touch tap on a belt; gone with any other press (down(), or
   *  the screen's dropX() for a press on a UI region), once that belt is no longer selected, or once it changes. */
  beltX(): BeltX | null {
    const x = this.x, s = this.h.sel;
    if (!x || this.busy || s.kind !== "route" || s.index !== x.index) return null;
    const r = this.h.run.build.routes[x.index];
    return r && r.cells.join(",") === x.cells && r.cells.includes(x.cell) ? x : null;
  }

  /** shoptap (D3): take the belt X down (a press anywhere but on it). */
  dropX(): void {
    this.x = null;
  }

  update(dt: number): void {
    this.warnT = Math.max(0, this.warnT - dt);
    if (this.carry) this.carryT += dt;
    const p = this.press;
    // HOLD-363 (backlog #363, REQ-BFG-040): `t` is the seconds the press has been held, counted once a frame (a factory
    // press, and a turret press with nothing picked, added dt twice a frame, so their 0.38 s hold lifted after ~0.2 s)
    if (p) p.t += dt;
    if (p && p.src.from === "factory" && p.t > 0.38) {
      const f = itemByUid(this.h.run.build, p.src.uid);
      this.press = null;
      if (f) this.lift({ src: { from: "deck", uid: f.uid }, def: f.def, uid: f.uid });
      if (f) this.h.select({ kind: "item", uid: f.uid });
    } else if (p && p.src.from === "turret" && !this.selectedCarry() && p.t > 0.38) {
      // 0.6.2s (REQ-BFG-031 S5): hold an installed turret to lift the turret itself (a drag lifts its gear first);
      // not while a card or cargo part is picked for tap-to-place (a slow tap still fits it)
      const index = p.src.index;
      this.press = null;
      this.liftMount(index);
    }
  }

  private lift(c: Carry): void {
    this.carry = c;
    this.carryT = 0;
    this.h.game.audio.play("pickup");
  }

  /** 0.6.2s (REQ-BFG-031 S5): lift the turret installed in slot `index` (to move, swap or store it). */
  private liftMount(index: number): void {
    const t = turretSlots(this.h.run.build)[index]?.turret;
    if (!t) return;
    this.lift({ src: { from: "mount", index }, def: t.def, uid: t.uid });
    this.h.select({ kind: "turret", index });
  }

  private pick(x: number, y: number): Src | null {
    const h = this.h;
    const o = h.offerAt(x, y);
    if (o) return { from: "offer", wagon: o.wagon, slot: o.slot };
    const cu = h.cargoAt(x, y);
    if (cu !== null) return { from: "cargo", uid: cu };
    const t = h.turretAt(x, y);
    if (t >= 0) return { from: "turret", index: t };
    const c = cellAt(h.L.frame, x, y);
    if (!inGrid(c.cx, c.cy)) return inside(h.L.hull, x, y) ? { from: "cell", k: -1 } : null;
    const k = key(c.cx, c.cy);
    const b = h.run.build;
    const occ = occupancy(b)[k];
    if (occ.item >= 0) {
      const p = itemByUid(b, occ.item)!;
      return defOf(p).kind === "factory" ? { from: "factory", uid: p.uid } : { from: "deck", uid: p.uid };
    }
    if (occ.route >= 0) return { from: "route", index: occ.route, cell: b.routes[occ.route].cells.indexOf(k) };
    return { from: "cell", k };
  }

  /** A press at (x, y). shoptap: `kind`, the pointer (a mouse when absent: tooling and the tests press as before). */
  down(x: number, y: number, kind: PointerKind = "mouse"): void {
    this.x = null; // shoptap (D3): any press here takes the belt X down (a press on the X is a UI region's, never ours)
    this.px = x;
    this.py = y;
    const src = this.pick(x, y);
    if (!src && !inside(this.h.L.cargo, x, y)) {
      this.h.select({ kind: "none" });
      return;
    }
    this.press = src ? { src, x0: x, y0: y, t: 0, kind, slop: dragSlop(kind, this.h.cssPerPx?.() ?? 1) } : null;
  }

  move(x: number, y: number): void {
    this.px = x;
    this.py = y;
    const p = this.press;
    if (p && Math.hypot(x - p.x0, y - p.y0) >= p.slop) { // shoptap (D1): the mouse's 4 px; touch and pen 10 CSS px
      this.press = null;
      this.begin(p.src, p.kind);
    }
    if (this.draw) this.extendTo(x, y);
    this.aim();
  }

  /** 0.6.2 BELTSIDE (B1): a carried rig's preview aims itself at the hovered cell (unless turned by hand). */
  private aim(): void {
    const c = this.carry;
    if (!c || c.manual || !isRig(c.def) || !inside(this.h.L.hull, this.px, this.py)) return;
    const cell = dropCell(this.h.L, this.px, this.py, 1);
    if (cell) c.rot = rigRotAt(this.h.run.build, c, cell);
  }

  /** 0.6.2 BELTSIDE (B2): R while carrying a rig turns its preview a quarter turn clockwise, by hand from then on. */
  rotateCarry(): boolean {
    const c = this.carry;
    if (!c || !isRig(c.def)) return false;
    if (rigShape(c.def) !== "X") {
      c.rot = ((c.rot ?? 0) + 1) % 4;
      c.manual = true;
      this.h.game.audio.play("belt");
    }
    return true;
  }

  up(x: number, y: number): void {
    if (this.press) {
      this.tap(this.press.src, x, y, this.press.kind);
      this.press = null;
    } else if (this.carry) {
      const c = this.carry;
      this.carry = null;
      drop(this.h, c, x, y);
    } else if (this.draw) {
      this.commit();
      this.draw = null;
    }
  }

  cancel(): void {
    this.press = null;
    this.carry = null;
    this.draw = null;
  }

  /** The currently selected card or cargo item as something that can be placed. */
  selectedCarry(): Carry | null {
    const s = this.h.sel;
    const run = this.h.run;
    if (s.kind === "offer") {
      const o = run.shop.wagons[s.wagon]?.offers[s.slot];
      return o && !o.sold ? { src: { from: "offer", wagon: s.wagon, slot: s.slot }, def: o.def, uid: -1 } : null;
    }
    if (s.kind === "cargo") {
      const it = run.inventory.find((i) => i.uid === s.uid);
      return it ? { src: { from: "cargo", uid: it.uid }, def: it.def, uid: it.uid } : null;
    }
    return null;
  }

  private tap(src: Src, x: number, y: number, kind: PointerKind = "mouse"): void {
    if (direct(kind)) return this.read(src); // shoptap (D2): a touch or pen tap reads
    const h = this.h;
    const s = h.select.bind(h);
    const onDeck = src.from === "cell" || src.from === "route" || src.from === "deck" || src.from === "factory" || src.from === "turret";
    const held = this.selectedCarry();
    if (held && onDeck) {
      const def = ITEMS[held.def];
      const hs = held.src;
      if (hs.from === "offer") {
        const price = h.run.shop.wagons[hs.wagon].offers[hs.slot].price;
        if (h.run.gold < price) return h.invalid(`NEED ${price - h.run.gold} MORE GOLD`);
      }
      if (def.kind === "mod" && src.from !== "turret") return h.invalid("DROP TURRET GEAR ON A TURRET");
      if (def.kind === "core" && src.from !== "turret") return h.invalid("DROP A TURRET CORE ON A TURRET"); // 0.6.1b
      if (def.kind === "turret" && src.from !== "turret") return h.invalid("DROP A TURRET ON A TURRET SLOT"); // 0.6.2s
      drop(h, held, x, y);
      return;
    }
    const cur = h.sel;
    switch (src.from) {
      case "offer":
        if (cur.kind === "offer" && cur.wagon === src.wagon && cur.slot === src.slot) return s({ kind: "none" });
        return s({ kind: "offer", wagon: src.wagon, slot: src.slot });
      case "cargo":
        if (cur.kind === "cargo" && cur.uid === src.uid) return s({ kind: "none" });
        return s({ kind: "cargo", uid: src.uid });
      case "deck": {
        // 0.6.2 BELTSIDE (B2): a tap turns a placed rig a quarter turn clockwise, and selects it (its hits show)
        const p = itemByUid(h.run.build, src.uid);
        if (p && isRig(p.def)) rotate(h, p.uid);
        return s({ kind: "item", uid: src.uid });
      }
      case "factory": return s({ kind: "item", uid: src.uid });
      case "route": return s({ kind: "route", index: src.index });
      case "turret": return s({ kind: "turret", index: src.index });
      default: return s({ kind: "none" });
    }
  }

  /**
   * shoptap (D2): a touch or pen tap reads: it selects what it lands on, and that opens its panel. It never buys, sells,
   * moves, places, merges, cuts or reroutes, whatever is selected (tap-to-place is the mouse's). A shop card (affordable
   * or not) and a cargo part select, and a second tap closes them, as a click does; a factory or other deck item
   * selects; a rig selects (its hits show) and only a tap on the rig already selected turns it (B2's quarter turn); a belt
   * selects and puts up its X (D3); a turret selects, and a tap on the selected turret steps through its fitted pieces
   * (core, then gear) and back to the turret; an empty cell dismisses.
   */
  private read(src: Src): void {
    const h = this.h, cur = h.sel, b = h.run.build;
    const s = (q: Sel) => h.select(q);
    switch (src.from) {
      case "offer":
        if (cur.kind === "offer" && cur.wagon === src.wagon && cur.slot === src.slot) return s({ kind: "none" });
        return s({ kind: "offer", wagon: src.wagon, slot: src.slot });
      case "cargo":
        if (cur.kind === "cargo" && cur.uid === src.uid) return s({ kind: "none" });
        return s({ kind: "cargo", uid: src.uid });
      case "deck": {
        const p = itemByUid(b, src.uid);
        if (p && isRig(p.def) && cur.kind === "item" && cur.uid === p.uid) rotate(h, p.uid);
        return s({ kind: "item", uid: src.uid });
      }
      case "factory": return s({ kind: "item", uid: src.uid });
      case "route": {
        s({ kind: "route", index: src.index });
        const r = b.routes[src.index], cell = r?.cells[src.cell];
        if (r && cell !== undefined) this.x = { index: src.index, cell, cells: r.cells.join(",") };
        return;
      }
      case "turret": {
        const pieces = fittedPieces(b, src.index);
        const mine = cur.kind === "fitted" ? pieces.indexOf(cur.uid) : -1;
        const at = mine >= 0 ? mine : cur.kind === "turret" && cur.index === src.index ? -1 : -2;
        if (at === -2) return s({ kind: "turret", index: src.index });
        const next = pieces[at + 1];
        return s(next !== undefined ? { kind: "fitted", uid: next } : { kind: "turret", index: src.index });
      }
      default: return s({ kind: "none" });
    }
  }

  private begin(src: Src, kind: PointerKind = "mouse"): void {
    const { run, game } = this.h;
    const b = run.build;
    switch (src.from) {
      case "offer": {
        const o = run.shop.wagons[src.wagon]?.offers[src.slot];
        if (!o || o.sold) return;
        if (run.gold < o.price) return this.h.invalid(`NEED ${o.price - run.gold} MORE GOLD`);
        this.lift({ src, def: o.def, uid: -1 });
        this.h.select({ kind: "offer", wagon: src.wagon, slot: src.slot });
        return;
      }
      case "cargo": {
        const it = run.inventory.find((i) => i.uid === src.uid);
        if (it) this.lift({ src, def: it.def, uid: it.uid });
        return;
      }
      case "deck": {
        const p = itemByUid(b, src.uid);
        if (p) this.lift({ src, def: p.def, uid: p.uid, ...(isRig(p.def) ? { rot: rotOf(p) } : {}) }); // 0.6.2: a rig keeps its aim
        return;
      }
      case "turret": {
        const m = gearFor(b, src.index) ?? coreFor(b, src.index); // 0.6.1b: the gear first, else the bought core
        if (m) this.lift({ src: { from: "mod", uid: m.uid }, def: m.def, uid: m.uid });
        else this.liftMount(src.index); // 0.6.2s (S5): else the turret itself
        return;
      }
      case "route": {
        const r = b.routes[src.index];
        // shoptap (D4 a): a finger aimed at a factory lands on the factory's own first belt tile as often as on the
        // factory (a deck cell is 16-28 CSS px on a phone, a fingertip wider): a touch drag from that tile draws a new
        // belt out of the factory while it has a free output. Else (no free output, a later tile, a mouse) it reroutes
        if (r && direct(kind) && src.cell === 0 && freeOutputs(b, r.factory) > 0) return this.startFrom(r.factory, kind, r.cells[0]);
        if (r) {
          const cells = r.cells.slice(0, Math.max(1, src.cell + 1));
          // 0.6.2j (J3): a joining belt grabbed at its end keeps its join until the drag moves back off it
          const keep = cells.length === r.cells.length && r.join !== undefined && joinOf(b, src.index) ? { join: r.join } : {};
          this.draw = { factory: r.factory, cells, replacing: src.index, ...keep, ...(direct(kind) ? { kind } : {}) };
        }
        game.audio.play("belt");
        return;
      }
      case "factory":
        return this.startFrom(src.uid, kind);
      case "cell": {
        if (src.k < 0) return;
        const f = b.items.find((p) => defOf(p).kind === "factory" && adjacentToFactory(b, p.uid, src.k) >= 0);
        if (f) this.startFrom(f.uid, kind);
        return;
      }
      default:
        return;
    }
  }

  /** A draw out of factory `uid`. shoptap: `kind`, the pointer; `start`, the factory's own first belt tile a touch drag
   *  started on (D4 a). */
  private startFrom(uid: number, kind: PointerKind = "mouse", start?: number): void {
    const b = this.h.run.build;
    const f = itemByUid(b, uid);
    if (!f) return;
    const d = defOf(f);
    const outs = outputsAt(f.def, gradeOf(b, f)) || 1; // 0.6.1a: outputs at its stars (= routeCheck.ts, validate.ts)
    const mine = routesOf(b, uid);
    // bb-0.8.3 (REQ-BFG-044 D6): every slot in use: nothing is drawn, as 0.8.0's full GANTRY PRESS (no factory has one
    // slot now, so none moves its belt); the warning says so, and what opens one more (a star, or the hero's upgrade)
    if (mine.length >= outs) return this.warn(fullNotice(d.name, mine.length, gradeOf(b, f), isSignatureFactory(f.def)));
    const touch = direct(kind) ? { kind, ...(start !== undefined ? { start } : {}) } : {};
    this.draw = { factory: uid, cells: [], replacing: -1, ...touch };
    this.h.select({ kind: "item", uid });
  }

  private warn(msg: string): void {
    if (msg === this.lastWarn && this.warnT > 0) return;
    this.lastWarn = msg;
    this.warnT = 0.9;
    this.h.game.error(msg);
  }

  private extendTo(x: number, y: number): void {
    const d = this.draw!;
    const { run, game, L } = this.h;
    const b = run.build;
    const c = cellAt(L.frame, x, y);
    if (!inGrid(c.cx, c.cy)) return;
    const k = key(c.cx, c.cy);
    const cells = d.cells;
    // shoptap (D4 b): touch: back on the factory it draws from (or the first belt tile it started on, D4 a), the draw
    // starts over (released there, it lays nothing and the old belt stays as it was; out again, a new belt starts beside
    // the factory)
    if (direct(d.kind) && (occupancy(b)[k].item === d.factory || k === d.start)) {
      if (cells.length) {
        cells.length = 0;
        delete d.join;
        delete d.refused;
        game.audio.play("belt");
      }
      return;
    }
    if (d.refused && d.refused.cell !== k) delete d.refused; // 0.6.2j: the refused tile's mark follows the pointer off it
    if (cells.length && cells[cells.length - 1] === k) return;
    const back = cells.indexOf(k);
    if (back >= 0) {
      cells.length = back + 1;
      delete d.join; // 0.6.2j (J3): back over its own belt, the draw no longer joins
      game.audio.play("belt", cells.length);
      return;
    }
    if (!cells.length) {
      if (occupancy(b)[k].item === d.factory) return; // still on the factory
      let best = -1, bd = 1e9;
      for (let kk = 0; kk < GRID * GRID; kk++) {
        if (adjacentToFactory(b, d.factory, kk) < 0 || !canExtend(b, d.factory, [], kk, d.replacing).ok) continue;
        const dist = Math.abs(kx(kk) - c.cx) + Math.abs(ky(kk) - c.cy);
        if (dist < bd) { bd = dist; best = kk; }
      }
      if (best < 0) return this.warn("NO ROOM BESIDE THE FACTORY");
      cells.push(best);
      game.audio.play("belt", cells.length);
      if (best === k) return;
    }
    for (const s of manhattanSteps(cells[cells.length - 1], k)) {
      if (d.join !== undefined) break; // 0.6.2j (J3): joined, the draw is complete (drag back over it to change it)
      const chk = canExtend(b, d.factory, cells, s, d.replacing);
      if (!chk.ok) {
        // 0.6.2j (J3): stepping into another belt's tile joins that belt when it's legal (fast drags: the first belt
        // tile they enter); otherwise the step is refused with the join's reason
        if (chk.reason === "BELTS CAN'T CROSS") {
          const jn = canJoin(b, d.factory, cells, s, d.replacing);
          if (jn.ok) {
            d.join = s;
            delete d.refused;
            game.audio.play("connect");
            const f = L.frame;
            this.h.wfx.sparkle(footX(f, kx(s), ky(s)) + 6, footY(f, kx(s), ky(s)) + 6);
            break;
          }
          d.refused = { cell: s, reason: jn.reason ?? chk.reason };
          this.warn(d.refused.reason);
          break;
        }
        if (chk.reason !== "ROUTE COMPLETE") this.warn(chk.reason ?? "BLOCKED");
        break;
      }
      cells.push(s);
      game.audio.play("belt", cells.length);
      if (chk.completes) {
        game.audio.play("connect");
        const f = L.frame;
        const cx = footX(f, kx(s), ky(s)) + 6, cy = footY(f, kx(s), ky(s)) + 6;
        this.h.wfx.sparkle(cx, cy);
        this.h.wfx.sparks(cx, cy, 8, [C.lime, C.white], 40);
        break;
      }
    }
  }

  private commit(): void {
    const d = this.draw!;
    if (!d.cells.length) return;
    const b = this.h.run.build;
    const idx = commitRoute(b, d.factory, d.cells, d.replacing, d.join); // 0.6.2j: the join, when the draw ended in one
    this.h.touched();
    const info = routeInfo(b, idx);
    if (!info.connected) this.h.game.toast("BELT DOESN'T REACH A TURRET YET", C.yellow);
    // 0.6.2j (J3): no confirmation, just word. 0.6.2 TUNE-M: RULE JOIN PACE, said where the join is made
    else if (info.join) this.h.game.toast(`JOINS BELT ${info.join.route + 1} · FACTORY AT ${JOIN_PACE_PCT}% PACE`, C.lime);
    this.h.select({ kind: "route", index: idx });
  }

  /** Belt being drawn, for the deck renderer. 0.6.2j (J11): with the join it will make, or a join it was refused. */
  ghost(): GhostBelt | null {
    const d = this.draw;
    if (!d || !d.cells.length) return null;
    const b = this.h.run.build;
    let connected = isFreeConnectorEnd(b, d.cells, d.replacing);
    if (d.join !== undefined) { // it feeds whatever the belt it joins feeds
      const m = occupancy(b)[d.join].route;
      connected = m >= 0 && m !== d.replacing && routeInfo(b, m).connected;
    }
    return {
      factory: d.factory, cells: d.cells, connected,
      ...(d.join !== undefined ? { join: d.join } : {}), ...(d.refused ? { refused: { ...d.refused } } : {}),
    };
  }

  freeConnectors(): number[] {
    const b = this.h.run.build;
    const rep = this.draw?.replacing ?? -1;
    return hero(b).turrets.flatMap((t) => t.connectors).filter((col) => connectorFree(b, col, rep)); // 0.6.2s: installed intakes
  }
}
