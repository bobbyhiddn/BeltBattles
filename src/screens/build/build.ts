// Build phase: shop cards -> the cruiser at centre stage -> cargo tray, FIGHT beside the
// bow. Drag and drop or tap-to-place; contextual cues replace the old instruction text.

import type { Game, Screen } from "../../game/game";
import { reroll, saveRun, type Run } from "../../game/run";
import { beginRoad } from "../../game/events";
import { EVENTS } from "../../game/eventDefs";
import { HEROES, ITEMS, OFFERS, REROLL_COST } from "../../sim/content";
import { connectedRouteCount, defOf, itemByUid, kx, ky } from "../../sim/deck";
import { Fx } from "../../render/fx";
import { C } from "../../render/palette";
import { frame, type G } from "../../render/pixel";
import { footX, footY } from "../../render/frame";
import { cruiserModel, drawHull, drawTurrets, turretPivotX, turretPivotY, type CruiserModel, type CruiserView } from "../../render/cruiser";
import { drawMachinery } from "../../render/machinery";
import { ArenaBg } from "../../render/arenaBg";
import { inside, type Rect } from "../../ui/ui";
import { Editor, type EditHost } from "./edit";
import { buildLayout, buildScale, Caravan, type BuildLayout, type Sel } from "./layout";
import { deleteRoute, sell, store } from "./actions";
import { drawBuildChrome } from "./chrome";
import { suggestCell } from "./cues";
import { BattleScreen } from "../battle";
import { EventScreen } from "../event/event";

export class BuildScreen implements Screen, EditHost {
  run: Run;
  /** REFIT after a road event (0.5.0): the deck and cargo only; the caravan has moved on. */
  readonly refit: boolean;
  L: BuildLayout;
  readonly wfx = new Fx();
  readonly ufx = new Fx();
  sel: Sel = { kind: "none" };
  readonly ed: Editor;
  readonly caravan = new Caravan();
  t = 0;
  armed = 0;
  menu = false;
  coinX = 50;
  shakeT = 0; // red shake on a refused action
  shakeSrc: Sel = { kind: "none" };
  thunkT = 0;
  placedOnce = false; // something was placed this round -> point at FIGHT
  boughtOnce = false;
  hover: { wagon: number; slot: number } | null = null;
  private model: CruiserModel;
  private view: CruiserView;
  private bg = new ArenaBg();

  constructor(public game: Game) {
    if (!game.run) throw new Error("BuildScreen needs a run");
    this.run = game.run;
    this.refit = this.run.stage === "refit" || this.run.stage === "battle";
    if (this.refit) this.caravan.park();
    this.L = this.layout();
    this.ed = new Editor(this);
    this.model = cruiserModel(this.run.build);
    this.view = { side: 0, build: this.run.build, model: this.model, frame: this.L.frame, t: 0, tread: 0 };
  }

  pickScale(pw: number, ph: number, portrait: boolean): number {
    return buildScale(pw, ph, portrait);
  }

  get toastY(): number {
    return this.L.cargo.y - 16;
  }

  private layout(): BuildLayout {
    return buildLayout(this.game.W, this.game.H, this.game.portrait, this.refit ? OFFERS : this.offers().length);
  }

  /** Title of the road event this refit follows (banner text). */
  refitFrom(): string {
    const ev = this.run.event;
    return ev && ev.round === this.run.round ? EVENTS[ev.id].title : "THE ROAD";
  }

  /** Offers in display order (grouped by wagon). */
  offers(): { wagon: number; slot: number }[] {
    const out: { wagon: number; slot: number }[] = [];
    this.run.shop.wagons.forEach((w, j) => w.offers.forEach((_, i) => out.push({ wagon: j, slot: i })));
    return out;
  }

  enter(): void {
    this.L = this.layout();
    this.game.audio.music("prep");
    if (this.refit) {
      this.caravan.park();
      this.game.toast("REFIT · THE CARAVAN HAS MOVED ON", C.yellow, "pickup");
    } else {
      this.caravan.arrive(this.offers().length);
      this.game.audio.play("horn");
      const sh = this.run.shop;
      if (sh.discount > 0 || sh.free > 0) this.game.toast(sh.discount > 0 ? `SCOUT'S DEAL: PRICES -${sh.discount}` : `SCOUT'S WORD: ${sh.free} FREE REROLL`, C.lime);
    }
    saveRun(this.run);
  }

  select(s: Sel): void {
    this.sel = s;
  }

  touched(): void {
    this.model = cruiserModel(this.run.build);
    this.view.model = this.model;
    saveRun(this.run);
  }

  placed(x: number, y: number): void {
    this.placedOnce = true;
    this.thunkT = 0.14;
    this.wfx.dust(x, y + 4, 12, -6);
    this.wfx.ring(x, y, 9, C.bone);
    this.wfx.sparkle(x, y - 2, 0.05);
  }

  invalid(msg: string): void {
    this.shakeT = 0.32;
    this.shakeSrc = this.sel;
    const c = this.ed.carry;
    if (c && c.src.from === "offer") this.shakeSrc = { kind: "offer", wagon: c.src.wagon, slot: c.src.slot };
    if (c && c.src.from === "cargo") this.shakeSrc = { kind: "cargo", uid: c.src.uid };
    this.game.error(msg);
  }

  coinPos(): { x: number; y: number } {
    return { x: this.coinX, y: 2 };
  }

  offerAt(x: number, y: number): { wagon: number; slot: number } | null {
    if (this.refit || !this.caravan.ready) return null;
    const list = this.offers();
    for (let i = 0; i < list.length; i++) {
      const r = this.L.cards[i];
      const o = this.run.shop.wagons[list[i].wagon].offers[list[i].slot];
      if (r && !o.sold && inside(r, x, y)) return list[i];
    }
    return null;
  }

  slotRect(i: number): Rect {
    return { x: this.L.cargo.x + 3 + i * 19, y: this.L.cargo.y + 2, w: 18, h: 18 };
  }

  cargoSlots(): number {
    return Math.max(1, Math.floor((this.L.cargo.w - 6) / 19));
  }

  cargoAt(x: number, y: number): number | null {
    const n = Math.min(this.cargoSlots(), this.run.inventory.length);
    for (let i = 0; i < n; i++) if (inside(this.slotRect(i), x, y)) return this.run.inventory[i].uid;
    return null;
  }

  turretRect(i: number): Rect {
    const td = HEROES[this.run.build.hero].turrets[i];
    const x = turretPivotX(this.L.frame, td.col0, td.width), y = turretPivotY(this.L.frame, td.col0, td.width);
    const r = td.kind === "heavy" ? 12 : 9;
    return { x: Math.round(x - r), y: Math.round(y - r), w: r * 2, h: r * 2 };
  }

  turretAt(x: number, y: number): number {
    const n = HEROES[this.run.build.hero].turrets.length;
    for (let i = 0; i < n; i++) if (inside(this.turretRect(i), x, y)) return i;
    return -1;
  }

  doReroll(): void {
    if (this.refit || !this.caravan.ready || this.ed.busy) return;
    const free = this.run.shop.free > 0;
    if (!free && this.run.gold < REROLL_COST) return this.invalid(`A REROLL COSTS ${REROLL_COST}G`);
    reroll(this.run);
    this.ufx.popup(this.coinX, 12, free ? "FREE" : `-${REROLL_COST}`, free ? C.lime : C.yellow);
    this.game.audio.play("coin");
    if (this.sel.kind === "offer") this.sel = { kind: "none" };
    this.caravan.leave(() => {
      this.caravan.arrive(this.offers().length);
      this.game.audio.play("horn");
    });
    saveRun(this.run);
  }

  fight(): void {
    if (this.ed.busy) return;
    if (connectedRouteCount(this.run.build) === 0 && this.armed <= 0) {
      this.armed = 2.5;
      this.invalid("NO BELT FEEDS A TURRET! FIGHT AGAIN TO GO ANYWAY");
      return;
    }
    // leaving the caravan: this round's road event first (if one is due and not yet resolved)
    const open = beginRoad(this.run);
    saveRun(this.run);
    this.game.audio.play("go");
    this.game.go(open ? new EventScreen(this.game) : new BattleScreen(this.game));
  }

  update(dt: number): void {
    this.t += dt;
    this.armed = Math.max(0, this.armed - dt);
    this.shakeT = Math.max(0, this.shakeT - dt);
    this.thunkT = Math.max(0, this.thunkT - dt);
    this.caravan.update(dt);
    this.ed.update(dt);
    this.wfx.update(dt);
    this.ufx.update(dt);
    if (this.run.inventory.length || this.run.shop.wagons.some((w) => w.offers.some((o) => o.sold))) this.boughtOnce = true;
  }

  draw(g: G): void {
    const L = (this.L = this.layout());
    const { W, H, portrait } = this.game;
    this.bg.draw(g, W, H, { hulls: [L.hull], vertical: portrait, gapLine: false, pad: L.pad }, this.t);
    const ghost = this.ed.ghost();
    const guide = !!this.ed.draw || connectedRouteCount(this.run.build) === 0;
    const v = this.view;
    v.frame = L.frame;
    v.t = this.t;
    v.ghost = ghost;
    v.highlightConnectors = guide ? this.ed.freeConnectors() : undefined;
    v.hideRoute = ghost && this.ed.draw ? this.ed.draw.replacing : -1;
    v.hideItem = this.ed.carry?.src.from === "deck" ? this.ed.carry.uid : -1;
    const bump = this.thunkT > 0.07 ? 1 : 0;
    if (bump) g.translate(0, bump);
    drawHull(g, v);
    drawMachinery(g, v);
    drawTurrets(g, v);
    this.drawSelection(g);
    if (bump) g.translate(0, -bump);
    this.wfx.draw(g, 0, 0);
    drawBuildChrome(g, this);
    this.wfx.drawPops(g, 0, 0);
    this.ufx.draw(g, 0, 0);
    this.ufx.drawPops(g, 0, 0);
  }

  private drawSelection(g: G): void {
    const s = this.sel;
    const L = this.L;
    const b = this.run.build;
    const col = Math.floor(this.t * 5) % 2 ? C.white : C.yellow;
    if (s.kind === "item") {
      const p = itemByUid(b, s.uid);
      if (!p || this.ed.carry) return;
      const size = defOf(p).size;
      frame(g, Math.round(footX(L.frame, p.x, p.y, size)) - 1, Math.round(footY(L.frame, p.x, p.y, size)) - 1, size * 12 + 2, size * 12 + 2, col);
    } else if (s.kind === "route" && b.routes[s.index] && !this.ed.draw) {
      for (const k of b.routes[s.index].cells) frame(g, Math.round(footX(L.frame, kx(k), ky(k))), Math.round(footY(L.frame, kx(k), ky(k))), 12, 12, col);
    } else if (s.kind === "turret") {
      const r = this.turretRect(s.index);
      frame(g, r.x, r.y, r.w, r.h, col);
    }
  }

  /** Tooling: logical centre of the first affordable gate card (or, in a refit or when none, the
   *  first gate in cargo) and of its suggested belt cell. */
  dragPlan(): { from: { x: number; y: number }; to: { x: number; y: number }; def: string } | null {
    const plan = this.offerPlan();
    if (plan) return plan;
    const n = Math.min(this.cargoSlots(), this.run.inventory.length);
    for (let i = 0; i < n; i++) {
      const it = this.run.inventory[i];
      const cell = ITEMS[it.def].kind === "gate" ? suggestCell(this.run.build, it.def) : null;
      if (!cell) continue;
      const r = this.slotRect(i);
      return {
        from: { x: r.x + r.w / 2, y: r.y + r.h / 2 },
        to: { x: footX(this.L.frame, cell.x, cell.y) + 6, y: footY(this.L.frame, cell.x, cell.y) + 6 },
        def: it.def,
      };
    }
    return null;
  }

  private offerPlan(): { from: { x: number; y: number }; to: { x: number; y: number }; def: string } | null {
    const list = this.refit ? [] : this.offers();
    for (let i = 0; i < list.length; i++) {
      const o = this.run.shop.wagons[list[i].wagon].offers[list[i].slot];
      const d = ITEMS[o.def];
      if (o.sold || d.kind !== "gate" || this.run.gold < o.price) continue;
      const cell = suggestCell(this.run.build, o.def);
      const r = this.L.cards[i];
      if (!cell || !r) continue;
      return {
        from: { x: r.x + r.w / 2, y: r.y + r.h / 2 },
        to: { x: footX(this.L.frame, cell.x, cell.y) + 6, y: footY(this.L.frame, cell.x, cell.y) + 6 },
        def: o.def,
      };
    }
    return null;
  }

  down(x: number, y: number): void {
    this.ed.down(x, y);
  }

  move(x: number, y: number): void {
    this.ed.move(x, y);
    this.hover = this.game.ui.pointer.down ? null : this.offerAt(x, y);
  }

  up(x: number, y: number): void {
    this.ed.up(x, y);
  }

  cancel(): void {
    this.ed.cancel();
  }

  key(k: string): void {
    if (k === "Escape") {
      if (this.menu) this.menu = false;
      else if (this.ed.busy) this.ed.cancel();
      else this.sel = { kind: "none" };
    } else if (this.menu) return;
    else if (k === "f" || k === "F" || k === "Enter") this.fight();
    else if (k === "r" || k === "R") this.doReroll();
    else if (k === "Delete" || k === "Backspace") {
      const s = this.sel;
      if (s.kind === "cargo") sell(this, s.uid);
      else if (s.kind === "item") store(this, s.uid);
      else if (s.kind === "route") deleteRoute(this, s.index);
    }
  }
}

export { ITEMS };
