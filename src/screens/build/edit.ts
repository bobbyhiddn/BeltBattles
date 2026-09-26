// Deck editing gestures. Drag: buy/place/move/store, lay conveyor out of a factory, grab a
// belt to reroute it, hold a factory to lift it. Tap: select; with a card or cargo item
// selected, a tap on the deck places it there (touch parity with drag and drop).

import { GRID, rigShape } from "../../sim/content";
import {
  adjacentToFactory, canExtend, commitRoute, connectorFree, defOf, hero, inGrid, isFreeConnectorEnd, isRig,
  itemByUid, key, kx, ky, manhattanSteps, occupancy, rotOf, routeInfo, routesOf,
} from "../../sim/deck";
import { canJoin, joinOf } from "../../sim/deck"; // 0.6.2j: belt joins
import { ITEMS } from "../../sim/content";
import { outputsAt, starsOf } from "../../sim/stars";
import { C } from "../../render/palette";
import { cellAt, footX, footY } from "../../render/frame";
import { inside } from "../../ui/ui";
import { drop, dropCell, rigRotAt, rotate, type Carry, type Ctx, type Src } from "./actions";
import type { Sel } from "./layout";
import { coreFor, gearFor } from "../../sim/deck"; // 0.6.1b
import { turretSlots } from "../../sim/deck"; // 0.6.2s (REQ-BFG-031)

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
  // 0.6.2j (J3): the draw stepped into another belt's tile and joins it there (canJoin): it is complete, and can't
  // go on past it; dragging back over its own cells undoes it
  join?: number;
  // 0.6.2j (J3, J11): the belt tile the drag last tried to join and was refused, and why (the preview marks it)
  refused?: { cell: number; reason: string };
}

/** 0.6.2j: the belt being drawn, as the deck renderer previews it (CruiserView.ghost). */
export interface GhostBelt {
  factory: number;
  cells: number[];
  connected: boolean;
  join?: number; // J11: it will join this belt tile
  refused?: { cell: number; reason: string }; // J11: a join the drag was refused, and why
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
    } else if (p && p.src.from === "turret" && !this.selectedCarry() && (p.t += dt) > 0.38) {
      // 0.6.2s (REQ-BFG-031 S5): hold an installed turret to lift the turret itself (a drag lifts its gear first);
      // not while a card or cargo part is picked for tap-to-place (a slow tap still fits it)
      const index = p.src.index;
      this.press = null;
      this.liftMount(index);
    } else if (p) p.t += dt;
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
        if (r) {
          const cells = r.cells.slice(0, Math.max(1, src.cell + 1));
          // 0.6.2j (J3): a joining belt grabbed at its end keeps its join until the drag moves back off it
          const keep = cells.length === r.cells.length && r.join !== undefined && joinOf(b, src.index) ? { join: r.join } : {};
          this.draw = { factory: r.factory, cells, replacing: src.index, ...keep };
        }
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
    else if (info.join) this.h.game.toast(`JOINS BELT ${info.join.route + 1}`, C.lime); // 0.6.2j (J3): no confirmation, just word
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
