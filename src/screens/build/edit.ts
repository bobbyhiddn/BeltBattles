// Deck editing gestures: tap to inspect; drag to buy, place, move or store; drag out of a
// factory (or grab an existing belt) to lay conveyor; hold a factory to lift and move it.

import { C } from "../../render/palette";
import { frame, type G } from "../../render/pixel";
import { factorySprite, gateSprite, itemIcon, shadowBlob } from "../../render/sprites";
import { cellTL, footTL, w2cell } from "../../render/world";
import { GRID, HEROES, ITEMS } from "../../sim/content";
import {
  adjacentToFactory, canExtend, canPlaceItem, commitRoute, connectorFree, defOf, inGrid,
  isFreeConnectorEnd, itemByUid, key, kx, ky, manhattanSteps, occupancy, routeInfo, routesOf,
} from "../../sim/deck";
import { drop, dropCell, type Carry, type Ctx, type Src } from "./actions";

export interface EditHost extends Ctx {
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
  private lastWarn = "";
  private warnT = 0;

  constructor(private h: EditHost) {}

  get busy(): boolean {
    return !!(this.press || this.carry || this.draw);
  }

  update(dt: number): void {
    this.warnT = Math.max(0, this.warnT - dt);
    const p = this.press;
    if (p && p.src.from === "factory" && (p.t += dt) > 0.38) {
      const f = itemByUid(this.h.run.build, p.src.uid);
      this.press = null;
      if (f) {
        this.carry = { src: { from: "deck", uid: f.uid }, def: f.def, uid: f.uid };
        this.h.game.audio.play("pickup");
        this.h.select({ kind: "item", uid: f.uid });
      }
    } else if (p) p.t += dt;
  }

  private pick(x: number, y: number): Src | null {
    const h = this.h;
    const o = h.offerAt(x, y);
    if (o) return { from: "offer", wagon: o.wagon, slot: o.slot };
    const cu = h.cargoAt(x, y);
    if (cu !== null) return { from: "cargo", uid: cu };
    const t = h.turretAt(x, y);
    if (t >= 0) return { from: "turret", index: t };
    const c = w2cell(0, x - h.L.ox, y - h.L.oy);
    if (!inGrid(c.cx, c.cy)) return null;
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
    if (!src) {
      this.h.select({ kind: "none" });
      return;
    }
    this.press = { src, x0: x, y0: y, t: 0 };
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
      this.tap(this.press.src);
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

  private tap(src: Src): void {
    const s = this.h.select.bind(this.h);
    switch (src.from) {
      case "offer": return s({ kind: "offer", wagon: src.wagon, slot: src.slot });
      case "cargo": return s({ kind: "cargo", uid: src.uid });
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
        if (run.gold < o.price) return game.error(`NEED ${o.price - run.gold} MORE GOLD`);
        this.carry = { src, def: o.def, uid: -1 };
        game.audio.play("pickup");
        return;
      }
      case "cargo": {
        const it = run.inventory.find((i) => i.uid === src.uid);
        if (it) this.carry = { src, def: it.def, uid: it.uid };
        game.audio.play("pickup");
        return;
      }
      case "deck": {
        const p = itemByUid(b, src.uid);
        if (p) this.carry = { src, def: p.def, uid: p.uid };
        game.audio.play("pickup");
        return;
      }
      case "turret": {
        const m = b.mods.find((q) => q.turret === src.index);
        if (m) this.carry = { src: { from: "mod", uid: m.uid }, def: m.def, uid: m.uid };
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
    const outs = d.factory?.outputs ?? 1;
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
    const c = w2cell(0, x - L.ox, y - L.oy);
    if (!inGrid(c.cx, c.cy)) return;
    const k = key(c.cx, c.cy);
    const cells = d.cells;
    if (cells.length && cells[cells.length - 1] === k) return;
    const back = cells.indexOf(k);
    if (back >= 0) {
      cells.length = back + 1;
      game.audio.play("belt");
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
      game.audio.play("belt");
      if (best === k) return;
    }
    for (const s of manhattanSteps(cells[cells.length - 1], k)) {
      const chk = canExtend(b, d.factory, cells, s, d.replacing);
      if (!chk.ok) {
        if (chk.reason !== "ROUTE COMPLETE") this.warn(chk.reason ?? "BLOCKED");
        break;
      }
      cells.push(s);
      game.audio.play("belt");
      if (chk.completes) {
        game.audio.play("connect");
        const tl = cellTL(0, kx(s), ky(s));
        this.h.wfx.sparkle(tl.x + 6, tl.y - 4);
        this.h.wfx.sparks(tl.x + 6, tl.y, 6, [C.lime, C.white], 40, 0);
        break;
      }
    }
  }

  private commit(): void {
    const d = this.draw!;
    if (!d.cells.length) return;
    const b = this.h.run.build;
    const idx = commitRoute(b, d.factory, d.cells, d.replacing);
    if (!routeInfo(b, idx).connected) this.h.game.toast("BELT DOESN'T REACH A TURRET YET", C.yellow);
    this.h.select({ kind: "route", index: idx });
  }

  /** View parameters for the deck renderer while a gesture is in progress. */
  ghost(): { factory: number; cells: number[]; connected: boolean; valid: boolean } | null {
    const d = this.draw;
    if (!d || !d.cells.length) return null;
    return { factory: d.factory, cells: d.cells, connected: isFreeConnectorEnd(this.h.run.build, d.cells, d.replacing), valid: true };
  }

  freeConnectors(): number[] {
    const b = this.h.run.build;
    const rep = this.draw?.replacing ?? -1;
    return HEROES[b.hero].turrets.flatMap((t) => t.connectors).filter((col) => connectorFree(b, col, rep));
  }

  /** Carried item preview, drawn over everything. */
  drawCarry(g: G, t: number): void {
    const c = this.carry;
    if (!c) return;
    const { L, run } = this.h;
    const def = ITEMS[c.def];
    if (def.kind === "gate" || def.kind === "factory") {
      const cell = dropCell(L, this.px, this.py, def.size);
      if (cell) {
        const ok = canPlaceItem(run.build, c.def, cell.x, cell.y, c.src.from === "deck" ? c.uid : -1).ok;
        const tl = footTL(0, cell.x, cell.y, def.size);
        const x = Math.round(L.ox + tl.x), y = Math.round(L.oy + tl.y);
        g.globalAlpha = 0.8;
        g.drawImage(def.kind === "factory" ? factorySprite(def.id, Math.floor(t * 6), false) : gateSprite(def.id, 0, false), x, y);
        g.globalAlpha = 1;
        frame(g, x - 1, y - 1, def.size * 12 + 2, def.size * 12 + 2, ok ? C.lime : Math.floor(t * 8) % 2 ? C.red : C.maroon);
        return;
      }
    }
    const ix = Math.round(this.px - 6), iy = Math.round(this.py - 20);
    g.globalAlpha = 0.5;
    g.drawImage(shadowBlob(8), ix + 2, iy + 16);
    g.globalAlpha = 1;
    g.drawImage(itemIcon(c.def), ix, iy + (Math.floor(t * 4) % 2));
  }
}
