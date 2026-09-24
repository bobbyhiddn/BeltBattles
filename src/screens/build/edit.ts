// Deck editing gestures. Drag: buy/place/move/store, lay conveyor out of a factory, grab a
// belt to reroute it, hold a factory to lift it. Tap: select; with a card or cargo item
// selected, a tap on the deck places it there (touch parity with drag and drop).

import { GRID } from "../../sim/content";
import {
  adjacentToFactory, canExtend, commitRoute, connectorFree, defOf, inGrid, isFreeConnectorEnd,
  itemByUid, key, kx, ky, manhattanSteps, occupancy, routeInfo, routesOf,
} from "../../sim/deck";
import { HEROES, ITEMS } from "../../sim/content";
import { outputsAt, starsOf } from "../../sim/stars";
import { C } from "../../render/palette";
import { cellAt, footX, footY } from "../../render/frame";
import { inside } from "../../ui/ui";
import { drop, type Carry, type Ctx, type Src } from "./actions";
import type { Sel } from "./layout";

export interface EditHost extends Ctx {
  sel: Sel;
  offerAt(x: number, y: number): { wagon: number; slot: number } | null;
  cargoAt(x: number, y: number): number | null;
}

interface Press {
  src: Src;
  x0: number;
  y0: number;
  t: number;
}

export interface Draw {
  factory: number;
  cells: number[];
  replacing: number;
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

  constructor(private h: EditHost) {}

  get busy(): boolean {
    return !!(this.press || this.carry || this.draw);
  }

  update(dt: number): void {
    this.warnT = Math.max(0, this.warnT - dt);
    if (this.carry) this.carryT += dt;
    const p = this.press;
    if (p && p.src.from === "factory" && (p.t += dt) > 0.38) {
      const f = itemByUid(this.h.run.build, p.src.uid);
      this.press = null;
      if (f) this.lift({ src: { from: "deck", uid: f.uid }, def: f.def, uid: f.uid });
      if (f) this.h.select({ kind: "item", uid: f.uid });
    } else if (p) p.t += dt;
  }

  private lift(c: Carry): void {
    this.carry = c;
    this.carryT = 0;
    this.h.game.audio.play("pickup");
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

  down(x: number, y: number): void {
    this.px = x;
    this.py = y;
    const src = this.pick(x, y);
    if (!src && !inside(this.h.L.cargo, x, y)) {
      this.h.select({ kind: "none" });
      return;
    }
    this.press = src ? { src, x0: x, y0: y, t: 0 } : null;
  }

  move(x: number, y: number): void {
    this.px = x;
    this.py = y;
    const p = this.press;
    if (p && Math.hypot(x - p.x0, y - p.y0) >= 4) {
      this.press = null;
      this.begin(p.src);
    }
    if (this.draw) this.extendTo(x, y);
  }

  up(x: number, y: number): void {
    if (this.press) {
      this.tap(this.press.src, x, y);
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

  private tap(src: Src, x: number, y: number): void {
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
      case "deck":
      case "factory": return s({ kind: "item", uid: src.uid });
      case "route": return s({ kind: "route", index: src.index });
      case "turret": return s({ kind: "turret", index: src.index });
      default: return s({ kind: "none" });
    }
  }

  private begin(src: Src): void {
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
        if (p) this.lift({ src, def: p.def, uid: p.uid });
        return;
      }
      case "turret": {
        const m = b.mods.find((q) => q.turret === src.index);
        if (m) this.lift({ src: { from: "mod", uid: m.uid }, def: m.def, uid: m.uid });
        return;
      }
      case "route": {
        const r = b.routes[src.index];
        if (r) this.draw = { factory: r.factory, cells: r.cells.slice(0, Math.max(1, src.cell + 1)), replacing: src.index };
        game.audio.play("belt");
        return;
      }
      case "factory":
        return this.startFrom(src.uid);
      case "cell": {
        if (src.k < 0) return;
        const f = b.items.find((p) => defOf(p).kind === "factory" && adjacentToFactory(b, p.uid, src.k) >= 0);
        if (f) this.startFrom(f.uid);
        return;
      }
      default:
        return;
    }
  }

  private startFrom(uid: number): void {
    const b = this.h.run.build;
    const f = itemByUid(b, uid);
    if (!f) return;
    const d = defOf(f);
    const outs = outputsAt(f.def, starsOf(f)) || 1; // 0.6.1a: outputs at its stars (= routeCheck.ts, validate.ts)
    const mine = routesOf(b, uid);
    let replacing = -1;
    if (mine.length >= outs) {
      if (outs === 1) replacing = mine[0];
      else return this.warn(`ALL ${outs} ${d.name} OUTPUTS USED - DRAG A BELT TO REROUTE`);
    }
    this.draw = { factory: uid, cells: [], replacing };
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
    if (cells.length && cells[cells.length - 1] === k) return;
    const back = cells.indexOf(k);
    if (back >= 0) {
      cells.length = back + 1;
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
      const chk = canExtend(b, d.factory, cells, s, d.replacing);
      if (!chk.ok) {
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
    const idx = commitRoute(b, d.factory, d.cells, d.replacing);
    this.h.touched();
    if (!routeInfo(b, idx).connected) this.h.game.toast("BELT DOESN'T REACH A TURRET YET", C.yellow);
    this.h.select({ kind: "route", index: idx });
  }

  /** Belt being drawn, for the deck renderer. */
  ghost(): { factory: number; cells: number[]; connected: boolean } | null {
    const d = this.draw;
    if (!d || !d.cells.length) return null;
    return { factory: d.factory, cells: d.cells, connected: isFreeConnectorEnd(this.h.run.build, d.cells, d.replacing) };
  }

  freeConnectors(): number[] {
    const b = this.h.run.build;
    const rep = this.draw?.replacing ?? -1;
    return HEROES[b.hero].turrets.flatMap((t) => t.connectors).filter((col) => connectorFree(b, col, rep));
  }
}
