// Build phase: the merchant caravan, cargo tray, deck editing, inspector and FIGHT.

import type { Game, Screen } from "../../game/game";
import { reroll, saveRun, type Run, type Wagon } from "../../game/run";
import { HEROES, MERCHANTS, REROLL_COST, RUN_LIVES, RUN_WINS } from "../../sim/content";
import { beltUsed, connectedRouteCount, defOf, itemByUid, kx, ky } from "../../sim/deck";
import { Fx } from "../../render/fx";
import { C } from "../../render/palette";
import { frame, rect, type G } from "../../render/pixel";
import { drawText, textWidth } from "../../render/font";
import { beltIcon, coinIcon, heartIcon } from "../../render/sprites";
import { cellTL, drawCloudShadows, drawCruiser, drawGround, drawWagon, footTL, turretPivot, wagonSlotRect } from "../../render/world";
import { button, inside, itemSlot, panel, type Rect } from "../../ui/ui";
import { Editor, type EditHost } from "./edit";
import { drawInspector, drawNextBattle } from "./inspector";
import { buildLayout, Caravan, type BuildLayout, type Sel } from "./layout";
import { deleteRoute, sell, store } from "./actions";
import { BattleScreen } from "../battle";
import { TitleScreen } from "../title";

export class BuildScreen implements Screen, EditHost {
  run: Run;
  L: BuildLayout;
  readonly wfx = new Fx();
  readonly ufx = new Fx();
  sel: Sel = { kind: "none" };
  private ed: Editor;
  private caravan = new Caravan();
  private leaving: Wagon[] | null = null;
  private t = 0;
  private armed = 0;
  private menu = false;
  private coinX = 50;

  constructor(public game: Game) {
    if (!game.run) throw new Error("BuildScreen needs a run");
    this.run = game.run;
    this.L = this.layout();
    this.ed = new Editor(this);
  }

  get toastY(): number {
    return this.L.cargo.y - 17;
  }

  private wagons(): Wagon[] {
    return this.leaving ?? this.run.shop.wagons;
  }

  private layout(): BuildLayout {
    return buildLayout(this.game.W, this.game.H, this.game.portrait, this.wagons().length);
  }

  enter(): void {
    this.caravan.arrive(this.run.shop.wagons.length);
    this.game.audio.music("prep");
    this.game.audio.play("horn");
    saveRun(this.run);
  }

  select(s: Sel): void {
    this.sel = s;
  }

  coinPos(): { x: number; y: number } {
    return { x: this.coinX, y: 2 };
  }

  offerAt(x: number, y: number): { wagon: number; slot: number } | null {
    if (!this.caravan.ready) return null;
    const L = this.L;
    const ws = this.run.shop.wagons;
    for (let j = 0; j < ws.length; j++) {
      for (let i = 0; i < ws[j].offers.length; i++) {
        const r = wagonSlotRect({ x: L.wagonX[j], y: L.wagonY }, i);
        if (!ws[j].offers[i].sold && inside({ x: r.x - 1, y: r.y, w: r.w + 2, h: r.h + 2 }, x, y)) return { wagon: j, slot: i };
      }
    }
    return null;
  }

  private slotRect(i: number): Rect {
    return { x: this.L.cargo.x + 2 + i * 20, y: this.L.cargo.y + 2, w: 18, h: 18 };
  }

  cargoAt(x: number, y: number): number | null {
    const n = Math.floor((this.L.cargo.w - 4) / 20);
    for (let i = 0; i < Math.min(n, this.run.inventory.length); i++) {
      if (inside(this.slotRect(i), x, y)) return this.run.inventory[i].uid;
    }
    return null;
  }

  private turretRect(i: number): Rect {
    const td = HEROES[this.run.build.hero].turrets[i];
    const pv = turretPivot(0, td);
    return { x: Math.round(this.L.ox + pv.x - td.width * 6), y: Math.round(this.L.oy + pv.y - 13), w: td.width * 12, h: 19 };
  }

  turretAt(x: number, y: number): number {
    const n = HEROES[this.run.build.hero].turrets.length;
    for (let i = 0; i < n; i++) if (inside(this.turretRect(i), x, y)) return i;
    return -1;
  }

  private doReroll(): void {
    if (!this.caravan.ready || this.ed.busy) return;
    if (this.run.gold < REROLL_COST) return this.game.error(`A REROLL COSTS ${REROLL_COST}G`);
    this.leaving = this.run.shop.wagons;
    reroll(this.run);
    this.ufx.popup(this.coinX, 12, `-${REROLL_COST}`, C.yellow);
    this.game.audio.play("coin");
    if (this.sel.kind === "offer") this.sel = { kind: "none" };
    this.caravan.leave(() => {
      this.leaving = null;
      this.caravan.arrive(this.run.shop.wagons.length);
      this.game.audio.play("horn");
    });
    saveRun(this.run);
  }

  private fight(): void {
    if (this.ed.busy) return;
    if (connectedRouteCount(this.run.build) === 0 && this.armed <= 0) {
      this.armed = 2.5;
      this.game.error("NO BELT FEEDS A TURRET! FIGHT AGAIN TO GO ANYWAY");
      return;
    }
    saveRun(this.run);
    this.game.audio.play("go");
    this.game.go(new BattleScreen(this.game));
  }

  update(dt: number): void {
    this.t += dt;
    this.armed = Math.max(0, this.armed - dt);
    this.caravan.update(dt);
    this.ed.update(dt);
    this.wfx.update(dt);
    this.ufx.update(dt);
    this.wagons().forEach((_, j) => {
      if (this.caravan.moving(j) && Math.random() < dt * 20) {
        const x = this.caravan.x(j, this.L.wagonX[j] ?? 0, this.L.W);
        this.ufx.dust(x + 60, this.L.wagonY + 22, 1, 4);
      }
    });
  }

  draw(g: G): void {
    this.L = this.layout();
    const L = this.L;
    const { W, H } = this.game;
    const b = this.run.build;
    drawGround(g, L.ox, L.oy, W, H, 0);
    drawCloudShadows(g, W, H, this.t);
    this.drawWagons(g);
    const ghost = this.ed.ghost();
    const guide = this.ed.draw || connectedRouteCount(b) === 0;
    drawCruiser(g, {
      side: 0, build: b, t: this.t, treadPhase: 0, ghost,
      highlightConnectors: guide ? this.ed.freeConnectors() : undefined,
      hideRoute: ghost && this.ed.draw ? this.ed.draw.replacing : -1,
      hideItem: this.ed.carry?.src.from === "deck" ? this.ed.carry.uid : -1,
    }, L.ox, L.oy);
    this.drawSelection(g);
    this.wfx.draw(g, L.ox, L.oy);
    this.drawBar(g);
    this.drawCargo(g);
    drawInspector(g, this, this.sel, L.insp, this.t, !L.info);
    if (L.info) drawNextBattle(g, this.run, L.info);
    const ui = this.game.ui;
    const rr = L.reroll;
    button(ui, g, "reroll", rr, `REROLL ${REROLL_COST}G`, { font: "3", disabled: this.run.gold < REROLL_COST || !this.caravan.ready, onTap: () => this.doReroll() });
    button(ui, g, "fight", L.fight, "FIGHT!", { primary: true, blink: this.armed > 0, onTap: () => this.fight() });
    if (L.portrait) this.drawHint(g, rr);
    this.ed.drawCarry(g, this.t);
    this.ufx.draw(g, 0, 0);
    if (this.menu) this.drawMenu(g);
  }

  private drawHint(g: G, rr: Rect): void {
    const txt = this.caravan.ready ? "TAP OR DRAG WARES" : "THE CARAVAN ARRIVES...";
    drawText(g, txt, 4, rr.y + 4, C.bone, { font: "3", outline: C.ink });
  }

  private drawWagons(g: G): void {
    const L = this.L;
    const run = this.run;
    const carry = this.ed.carry;
    this.wagons().forEach((w, j) => {
      const x = this.caravan.x(j, L.wagonX[j] ?? L.wagonX[0], L.W);
      drawWagon(g, {
        merchant: w.merchant, name: MERCHANTS[w.merchant].name, x, y: L.wagonY,
        open: this.caravan.open(j), wheel: this.caravan.moving(j) ? Math.floor(this.t * 14) : 0,
        offers: w.offers.map((o) => ({ def: o.def, price: o.price, sold: o.sold, affordable: run.gold >= o.price })),
        selected: this.sel.kind === "offer" && this.sel.wagon === j ? this.sel.slot : -1,
        hover: -1,
        hideOffer: carry && carry.src.from === "offer" && carry.src.wagon === j ? carry.src.slot : -1,
      }, 0, 0, this.t);
    });
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
      const tl = footTL(0, p.x, p.y, size);
      frame(g, Math.round(L.ox + tl.x) - 1, Math.round(L.oy + tl.y) - 1, size * 12 + 2, size * 12 + 2, col);
    } else if (s.kind === "route" && b.routes[s.index] && !this.ed.draw) {
      for (const k of b.routes[s.index].cells) {
        const tl = cellTL(0, kx(k), ky(k));
        frame(g, Math.round(L.ox + tl.x), Math.round(L.oy + tl.y), 12, 12, col);
      }
    } else if (s.kind === "turret") {
      const r = this.turretRect(s.index);
      frame(g, r.x, r.y, r.w, r.h, col);
    }
  }

  private drawBar(g: G): void {
    const { W, ui } = this.game;
    const run = this.run;
    rect(g, 0, 0, W, 14, C.ink);
    rect(g, 0, 14, W, 1, C.slate1);
    ui.add({ id: "bar", r: { x: 0, y: 0, w: W, h: 15 }, block: true });
    drawText(g, `ROUND ${run.round}`, 4, 5, C.bone, { font: "3" });
    const gx = 42;
    g.drawImage(coinIcon(), gx, 4);
    drawText(g, String(run.gold), gx + 8, 4, C.yellow);
    this.coinX = gx + 12;
    const hx = gx + 32;
    for (let i = 0; i < RUN_LIVES; i++) g.drawImage(heartIcon(i < run.lives), hx + i * 7, 4);
    let wx = hx + 26;
    if (W >= 236) {
      drawText(g, "WINS", wx, 5, C.slate4, { font: "3" });
      wx += 19;
    }
    for (let i = 0; i < RUN_WINS; i++) rect(g, wx + i * 5, 4, 4, 6, i < run.wins ? C.lime : C.slate1);
    this.game.soundButton(g, { x: W - 29, y: 1, w: 26, h: 12 });
    button(ui, g, "menu", { x: W - 58, y: 1, w: 27, h: 12 }, "MENU", { font: "3", onTap: () => { this.menu = !this.menu; } });
  }

  private drawCargo(g: G): void {
    const r = this.L.cargo;
    const run = this.run;
    panel(g, r, "inset");
    drawText(g, "CARGO", r.x + 1, r.y - 7, C.slate4, { font: "3" });
    const used = beltUsed(run.build), cap = run.build.beltCap;
    const txt = `BELT ${used}/${cap}`;
    drawText(g, txt, r.x + r.w - 1, r.y - 7, used >= cap ? C.amber : C.bone, { font: "3", align: "right" });
    g.drawImage(beltIcon(), r.x + r.w - textWidth(txt, "3") - 10, r.y - 6);
    const items = run.inventory;
    const carry = this.ed.carry;
    if (!items.length) {
      drawText(g, "EMPTY · BUY WARES FROM THE WAGONS", r.x + r.w / 2, r.y + 9, C.slate3, { font: "3", align: "center" });
    } else {
      const n = Math.floor((r.w - 4) / 20);
      for (let i = 0; i < Math.min(n, items.length); i++) {
        const it = items[i];
        const s = this.slotRect(i);
        const hidden = carry?.src.from === "cargo" && carry.uid === it.uid;
        itemSlot(g, s.x, s.y, hidden ? null : it.def, this.sel.kind === "cargo" && this.sel.uid === it.uid, this.t);
      }
      if (items.length > n) drawText(g, `+${items.length - n}`, r.x + r.w - 3, r.y + 8, C.yellow, { font: "3", align: "right" });
    }
    if (carry && carry.src.from !== "cargo" && inside(r, this.ed.px, this.ed.py)) frame(g, r.x - 1, r.y - 1, r.w + 2, r.h + 2, C.yellow);
  }

  private drawMenu(g: G): void {
    const { W, H, ui } = this.game;
    const w = 150, h = 78;
    const x = Math.round(W / 2 - w / 2), y = Math.round(H / 2 - h / 2);
    g.globalAlpha = 0.6;
    rect(g, 0, 0, W, H, C.ink);
    g.globalAlpha = 1;
    ui.add({ id: "menubg", r: { x: 0, y: 0, w: W, h: H }, onTap: () => { this.menu = false; } });
    panel(g, { x, y, w, h }, "raised");
    drawText(g, "PAUSED", W / 2, y + 6, C.yellow, { align: "center" });
    button(ui, g, "quit", { x: x + 10, y: y + 20, w: w - 20, h: 20 }, "SAVE & QUIT", { onTap: () => { saveRun(this.run); this.game.go(new TitleScreen(this.game)); } });
    button(ui, g, "abandon", { x: x + 10, y: y + 46, w: w - 20, h: 20 }, "ABANDON RUN", {
      danger: true, onTap: () => { saveRun(null); this.game.run = null; this.game.go(new TitleScreen(this.game)); },
    });
  }

  down(x: number, y: number): void {
    this.ed.down(x, y);
  }

  move(x: number, y: number): void {
    this.ed.move(x, y);
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
    } else if (k === "f" || k === "F" || k === "Enter") this.fight();
    else if (k === "r" || k === "R") this.doReroll();
    else if (k === "Delete" || k === "Backspace") {
      const s = this.sel;
      if (s.kind === "cargo") sell(this, s.uid);
      else if (s.kind === "item") store(this, s.uid);
      else if (s.kind === "route") deleteRoute(this, s.index);
    }
  }
}
