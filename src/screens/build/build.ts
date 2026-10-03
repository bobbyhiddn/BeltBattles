// Build phase: shop cards -> the cruiser at centre stage -> cargo tray, FIGHT beside the
// bow. Drag and drop or tap-to-place; contextual cues replace the old instruction text.

import type { Game, Screen } from "../../game/game";
import { reroll, saveRun, type DuskFoe, type Run } from "../../game/run";
import { duskFoe, refundNotice, storedFoe } from "../../game/day";
import { loadPool } from "../../game/ghosts";
import { foeNote, onlineMode } from "../../game/session"; // 0.7.0a: online play (none: offline, as 0.6.2)
import { leaveCaravan } from "../../game/road";
import { mergePreview } from "../../game/fuse";
import type { FuseStep } from "../../game/fuse";
import { ForkScreen } from "../fork/fork";
import { EVENTS } from "../../game/eventDefs";
import { ITEMS, OFFERS, REROLL_COST } from "../../sim/content";
import { connectedRouteCount, defOf, hitsOfRig, isRig, itemByUid, kx, ky, rigHits, turretSlots, walkRoute } from "../../sim/deck";
import { joinOf } from "../../sim/deck"; // 0.6.2j: belt joins
import { NOWHERE, fightBlock, routeCheck } from "../../game/routeCheck";
import { settings } from "../../core/settings";
import { Fx } from "../../render/fx";
import { C } from "../../render/palette";
import { frame, rect, type G } from "../../render/pixel";
import { drawText } from "../../render/font";
import { footX, footY } from "../../render/frame";
import { itemIcon } from "../../render/sprites";
import { cruiserModel, drawHull, drawTurrets, turretPivotX, turretPivotY, type CruiserModel, type CruiserView } from "../../render/cruiser";
import { drawMachinery } from "../../render/machinery";
import { ArenaBg } from "../../render/arenaBg";
import { inside, type Rect } from "../../ui/ui";
import { Editor, direct, type BeltX, type EditHost } from "./edit";
import { buildLayout, buildScale, Caravan, type BuildLayout, type Sel } from "./layout";
import { deleteRoute, rotate, sell, store, storeFitted } from "./actions";
import { cssPerPx as cssScale, type PointerKind } from "../../core/io"; // shoptap (D1)
import { beltXSide, placeBeltX } from "./beltx"; // shoptap (D3)
import { detailsPlan, keptWhole, visibleLines, type PLine } from "./inspector"; // shoptap tooling: panelInfo
import { drawBuildChrome } from "./chrome";
import { suggestCell } from "./cues";
import { BattleScreen, duskScreen } from "../battle";
import { EventScreen } from "../event/event";

/** 0.6.1d2 (ARSENAL.md §8.3): 0.5s per merge step normally; reduced motion collapses lift/arc/ring/
 *  sparkle to just the flash, so its "impact" beat comes almost immediately. */
const FUSE_STEP_DUR = 0.5;
const FUSE_REDUCED_DUR = 0.22;
const FUSE_IMPACT_FRAC = 0.55; // normal-motion: fraction of the step before flash/ring/sparkle fire
const FUSE_REDUCED_IMPACT_FRAC = 0.3;

interface FuseAnimState {
  step: FuseStep;
  t: number;
  fired: boolean; // the flash/ring/sparkle one-shot has fired for this step
}

export class BuildScreen implements Screen, EditHost {
  run: Run;
  /** REFIT after a road event (0.5.0): the deck and cargo only; the caravan has moved on. */
  readonly refit: boolean;
  /** 0.6.1a: the build screen shows the save-migration notice ("YOUR SPARE PARTS MERGED"). */
  readonly mergeNotice = true;
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
  /** 0.6.1d2: the merge animation's current step (lift/arc/flash/ring/sparkle then pips), drained
   *  from run.fuseAnim one step at a time; null when idle. A tap anywhere skips the whole queue. */
  private anim: FuseAnimState | null = null;
  /** Why FIGHT is blocked (a dead-end or broken belt, routeCheck.ts) and the routes at fault; read
   *  once per frame in draw(). blockT flashes them after a refused press. */
  block: string | undefined;
  broken: number[] = [];
  blockT = 0;
  /** Tonight's dusk opponent: stored once dusk has started, else the pick dusk will make (the pool
   *  only changes after a dusk fight, so the preview is the pick). Read once, not per frame. */
  foe: DuskFoe;
  private model: CruiserModel;
  private view: CruiserView;
  private bg = new ArenaBg();

  constructor(public game: Game) {
    if (!game.run) throw new Error("BuildScreen needs a run");
    this.run = game.run;
    // 0.7.0a online: the stored foe, or (until the session stores tonight's ghost) the stand-in the card hides behind
    // FINDING A GHOST...; never the local pool. Offline exactly 0.6.2's preview.
    this.foe = duskFoe(this.run, onlineMode() ? [] : loadPool());
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

  /** shoptap (D2): the last press was a finger or a pen (Ctx.touch: the panels' touch forms, a finger's targets). */
  get touch(): boolean {
    return direct(this.game.ui.pointer.kind);
  }

  /** shoptap (D1): CSS px per logical px, the touch slop's unit (EditHost.cssPerPx). */
  cssPerPx(): number {
    return cssScale(this.game.view);
  }

  /** shoptap (D3): where the belt X `x` goes this frame (beltx.ts placeBeltX), or null. Tooling reads it too. */
  beltXRect(x: BeltX | null = this.ed.beltX()): Rect | null {
    if (!x) return null;
    const turrets = turretSlots(this.run.build).map((_, i) => this.turretRect(i));
    return placeBeltX(this.L, this.run.build, x, beltXSide(this.cssPerPx()), turrets);
  }

  /** shoptap tooling (window.bb.panel, read only): the details panel as drawDetails plans it now: its title, sub line,
   *  button labels and the body lines it draws, and whether its kept text shows whole; null with no panel. */
  panelInfo(): { title: string; sub: string; labels: string[]; lines: string[]; whole: boolean } | null {
    const d = detailsPlan(this, this.sel, this.hover, this.L.info);
    if (!d) return null;
    const text = (l: PLine): string => (l.cells ? l.cells.map((c) => `${c.label} ${c.spans.map((s) => s.t).join("")}`).join("  ")
      : `${l.label ? `${l.label} ` : ""}${l.spans.map((s) => s.t).join("")}`);
    const lines = visibleLines(d.plan).flatMap((v) => (v.line === "rule" ? [] : [text(v.line)]));
    const sub = d.plan.headerOnly ? d.plan.headerOnly.lines.join(" ") : d.plan.body.sub ?? d.plan.subs.join(" ");
    return { title: d.t.title, sub, labels: d.t.labels, lines, whole: keptWhole(d.plan) };
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
    return ev && ev.day === this.run.day ? EVENTS[ev.id].title : "THE ROAD";
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
      this.game.toast("REFIT · CARAVAN GONE", C.yellow, "pickup");
    } else {
      this.caravan.arrive(this.offers().length);
      this.game.audio.play("horn");
      const sh = this.run.shop;
      const scout = sh.discount > 0 || sh.free > 0 ? (sh.discount > 0 ? `SCOUT: PRICES -${sh.discount}` : `SCOUT: ${sh.free} FREE REROLL`) : "";
      // 0.6.2 RULE EARLY-LOSS REFUND: said at the dawn it gives the life back (toasts replace each other: one line)
      const refund = refundNotice(this.run) ?? "";
      if (refund || scout) this.game.toast([refund, scout].filter(Boolean).join(" · "), C.lime);
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

  /** 0.6.2s (REQ-BFG-031 S9, S10): TURRET SLOT i's hit box (deck.ts turretSlots); an empty slot's mount is a heavy's size. */
  turretRect(i: number): Rect {
    const s = turretSlots(this.run.build)[i];
    const x = turretPivotX(this.L.frame, s.col0, s.width), y = turretPivotY(this.L.frame, s.col0, s.width);
    const r = !s.td || s.td.kind === "heavy" ? 12 : 9;
    return { x: Math.round(x - r), y: Math.round(y - r), w: r * 2, h: r * 2 };
  }

  /** The TURRET SLOT under (x, y), empty or not, or -1. */
  turretAt(x: number, y: number): number {
    const n = turretSlots(this.run.build).length;
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
    // a belt the ghost validator would refuse (dead end, crossing, ...) blocks the fight outright
    const why = fightBlock(this.run.build);
    if (why) {
      this.blockT = 0.6;
      return this.invalid(why);
    }
    if (connectedRouteCount(this.run.build) === 0 && this.armed <= 0) {
      this.armed = 2.5;
      this.invalid("NO BELT FEEDS A TURRET! FIGHT AGAIN TO GO ANYWAY");
      return;
    }
    // 0.6.0b: leaving the caravan goes to the road fork (after a REFIT: on to dusk)
    const next = leaveCaravan(this.run);
    saveRun(this.run);
    this.game.audio.play("go");
    this.game.go(next === "fork" ? new ForkScreen(this.game) : next === "event" ? new EventScreen(this.game)
      : next === "warlord" ? new BattleScreen(this.game, "warlord") : duskScreen(this.game));
  }

  /** 0.7.0a step 6: the NEXT BATTLE card's source line (online only; null offline, 0.6.2's card). */
  note(): string | null {
    return foeNote(this.run, this.foe);
  }

  update(dt: number): void {
    this.t += dt;
    if (onlineMode()) {
      // 0.7.0a: tonight's ghost arrived (the session stored it): the NEXT BATTLE card shows it
      const st = storedFoe(this.run);
      if (st && st !== this.foe) this.foe = st;
    }
    this.armed = Math.max(0, this.armed - dt);
    this.shakeT = Math.max(0, this.shakeT - dt);
    this.blockT = Math.max(0, this.blockT - dt);
    this.thunkT = Math.max(0, this.thunkT - dt);
    this.caravan.update(dt);
    this.ed.update(dt);
    this.wfx.update(dt);
    this.ufx.update(dt);
    this.updateFuseAnim(dt);
    if (this.run.inventory.length || this.run.shop.wagons.some((w) => w.offers.some((o) => o.sold))) this.boughtOnce = true;
  }

  draw(g: G): void {
    const L = (this.L = this.layout());
    const { W, H, portrait } = this.game;
    ({ block: this.block, broken: this.broken } = routeCheck(this.run.build));
    this.bg.draw(g, W, H, { hulls: [L.hull], vertical: portrait, gapLine: false, pad: L.pad }, this.t);
    const ghost = this.ed.ghost();
    // free connectors glow while drawing, with no belt fed, or when a belt goes nowhere
    const guide = !!this.ed.draw || connectedRouteCount(this.run.build) === 0 || this.block === NOWHERE;
    const v = this.view;
    v.frame = L.frame;
    v.t = this.t;
    v.ghost = ghost;
    v.highlightConnectors = guide ? this.ed.freeConnectors() : undefined;
    // shoptap (D4 b): a touch draw that moves a one-output factory's belt leaves the old belt in sight until it commits
    v.hideRoute = ghost && this.ed.draw && !this.ed.draw.moves ? this.ed.draw.replacing : -1;
    v.hideItem = this.ed.carry?.src.from === "deck" ? this.ed.carry.uid : -1;
    v.survivorUid = this.survivorUid();
    const fd = this.fuseAnimDeck();
    v.fuseAnimUid = fd?.uid;
    v.fuseAnimStars = fd?.showStars;
    const bump = this.thunkT > 0.07 ? 1 : 0;
    if (bump) g.translate(0, bump);
    drawHull(g, v);
    drawMachinery(g, v);
    this.drawBroken(g);
    drawTurrets(g, v);
    this.drawSelection(g);
    this.drawFuseAnim(g);
    if (bump) g.translate(0, -bump);
    this.wfx.draw(g, 0, 0);
    drawBuildChrome(g, this);
    this.wfx.drawPops(g, 0, 0);
    this.ufx.draw(g, 0, 0);
    this.ufx.drawPops(g, 0, 0);
  }

  /** Belts that block FIGHT: a pulsing red tint and outline on every cell (brighter after a press). */
  private drawBroken(g: G): void {
    const b = this.run.build, f = this.L.frame;
    const hot = this.blockT > 0;
    const a = 0.2 + 0.15 * Math.sin(this.t * 6) + this.blockT * 0.5;
    for (const i of this.broken) {
      if (i === this.view.hideRoute || !b.routes[i]) continue;
      for (const k of b.routes[i].cells) {
        const x = Math.round(footX(f, kx(k), ky(k))), y = Math.round(footY(f, kx(k), ky(k)));
        g.globalAlpha = a;
        rect(g, x, y, 12, 12, C.red);
        g.globalAlpha = 1;
        frame(g, x, y, 12, 12, hot ? C.white : C.red);
      }
    }
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
      // 0.6.2 BELTSIDE (V4): the belt tiles the selected rig works
      if (isRig(p.def)) {
        for (const h of hitsOfRig(b, p.uid, rigHits(b))) {
          frame(g, Math.round(footX(L.frame, kx(h.cell), ky(h.cell))), Math.round(footY(L.frame, kx(h.cell), ky(h.cell))), 12, 12, C.yellow);
        }
      }
    } else if (s.kind === "route" && b.routes[s.index] && !this.ed.draw) {
      for (const k of b.routes[s.index].cells) frame(g, Math.round(footX(L.frame, kx(k), ky(k))), Math.round(footY(L.frame, kx(k), ky(k))), 12, 12, col);
      // 0.6.2j (J10): a joining belt's join tile, where its payloads enter the main belt
      const link = joinOf(b, s.index);
      if (link) frame(g, Math.round(footX(L.frame, kx(link.cell), ky(link.cell))), Math.round(footY(L.frame, kx(link.cell), ky(link.cell))), 12, 12, C.cyan);
      // 0.6.2 BELTSIDE (V4): every tile with hits carries its number in the inspector's timeline (T1, T2, ...)
      for (const row of walkRoute(b, s.index).timeline) {
        const x = Math.round(footX(L.frame, kx(row.cell), ky(row.cell))), y = Math.round(footY(L.frame, kx(row.cell), ky(row.cell)));
        drawText(g, String(row.tile + 1), x + 2, y + 2, C.yellow, { font: "3", outline: C.ink });
      }
    } else if (s.kind === "turret") {
      const r = this.turretRect(s.index);
      frame(g, r.x, r.y, r.w, r.h, col);
    } else if (s.kind === "fitted") {
      // shoptap (REQ-BFG-035): a fitted core or gear piece: its turret is framed
      const m = b.mods.find((q) => q.uid === s.uid);
      if (m && turretSlots(b)[m.turret]) {
        const r = this.turretRect(m.turret);
        frame(g, r.x, r.y, r.w, r.h, col);
      }
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

  /** 0.6.1d2 (ARSENAL.md §8.1): the cargo/deck uid the hovered (mouse) or else selected shop offer
   *  would merge into, or undefined. Feeds the survivor ring in machinery.ts and itemSlot (via
   *  chrome.ts's drawCargo). Never a turret: 0.6.1b owns turret rendering. */
  survivorUid(): number | undefined {
    if (this.refit || !this.caravan.ready) return undefined;
    const pick = this.hover ?? (this.sel.kind === "offer" ? this.sel : null);
    if (!pick) return undefined;
    const o = this.run.shop.wagons[pick.wagon]?.offers[pick.slot];
    if (!o || o.sold) return undefined;
    const preview = mergePreview(this.run, o.def);
    // review-061 F4: a carried offer whose only twin is in cargo lands where it is dropped, and the
    // dropped copy survives (ARSENAL.md §4.1 rule 5), so no ring on the cargo twin during the carry.
    if (preview?.where === "cargo" && this.ed.carry?.src.from === "offer") return undefined;
    return preview && preview.where !== "turret" ? preview.survivorUid : undefined;
  }

  private fusePopped(): boolean {
    const a = this.anim;
    if (!a) return true;
    const reduced = settings.reducedMotion;
    const at = (reduced ? FUSE_REDUCED_DUR : FUSE_STEP_DUR) * (reduced ? FUSE_REDUCED_IMPACT_FRAC : FUSE_IMPACT_FRAC);
    return a.t >= at;
  }

  /** 0.6.1d2: the deck item mid-merge-animation and its pip override (Math.max(1, step.stars - 1)
   *  pre-pop, the real value once popped), or undefined when nothing is animating on the deck. */
  fuseAnimDeck(): { uid: number; showStars: number } | undefined {
    const a = this.anim;
    if (!a || a.step.where !== "deck") return undefined;
    return { uid: a.step.survivor, showStars: this.fusePopped() ? a.step.stars : Math.max(1, a.step.stars - 1) };
  }

  /** Same, for the cargo tray (chrome.ts's drawCargo). */
  fuseAnimCargo(): { uid: number; showStars: number } | undefined {
    const a = this.anim;
    if (!a || a.step.where !== "cargo") return undefined;
    return { uid: a.step.survivor, showStars: this.fusePopped() ? a.step.stars : Math.max(1, a.step.stars - 1) };
  }

  /** Drains run.fuseAnim one step at a time (chains play step after step); turret steps have no
   *  deck frame to animate in, so they're dropped silently. Fires the ring/sparkle one-shot at the
   *  impact beat (skipped under reduced motion, which shows only the flash and the pips). */
  private updateFuseAnim(dt: number): void {
    while (!this.anim && this.run.fuseAnim?.length) {
      const step = this.run.fuseAnim.shift()!;
      if (step.where !== "turret") this.anim = { step, t: 0, fired: false };
    }
    const a = this.anim;
    if (!a) return;
    a.t += dt;
    const reduced = settings.reducedMotion;
    const dur = reduced ? FUSE_REDUCED_DUR : FUSE_STEP_DUR;
    const impactAt = dur * (reduced ? FUSE_REDUCED_IMPACT_FRAC : FUSE_IMPACT_FRAC);
    if (!a.fired && a.t >= impactAt) {
      a.fired = true;
      if (!reduced) {
        const pos = this.fuseAnimPos(a.step);
        if (pos) {
          this.wfx.ring(pos.x, pos.y, 10, C.yellow);
          this.wfx.sparkle(pos.x - 3, pos.y - 2, 0);
          this.wfx.sparkle(pos.x + 3, pos.y + 1, 0.05);
          if (a.step.stars >= 3) this.wfx.sparkle(pos.x, pos.y - 4, 0.1);
        }
      }
    }
    if (a.t >= dur) this.anim = null;
  }

  /** Screen-space centre of a fuse step's (already-final) survivor: a cargo slot or a deck cell.
   *  Null if it moved out of both since the merge (a rare race; the step is then just skipped). */
  private fuseAnimPos(step: FuseStep): { x: number; y: number } | null {
    if (step.where === "cargo") {
      const i = this.run.inventory.findIndex((it) => it.uid === step.survivor);
      if (i < 0 || i >= this.cargoSlots()) return null;
      const r = this.slotRect(i);
      return { x: r.x + 9, y: r.y + 9 };
    }
    if (step.where === "deck") {
      const p = this.run.build.items.find((q) => q.uid === step.survivor);
      if (!p) return null;
      const d = defOf(p);
      const s = d.size * 12;
      return { x: footX(this.L.frame, p.x, p.y, d.size) + s / 2, y: footY(this.L.frame, p.x, p.y, d.size) + s / 2 };
    }
    return null;
  }

  /** The lift/arc + flash beats; ring/sparkle are one-shot particles fired from updateFuseAnim, and
   *  the pips themselves are drawn by machinery.ts/chrome.ts from the fuseAnimDeck/fuseAnimCargo
   *  override, so there's nothing more to draw once popped. */
  private drawFuseAnim(g: G): void {
    const a = this.anim;
    if (!a) return;
    const pos = this.fuseAnimPos(a.step);
    if (!pos) return;
    const reduced = settings.reducedMotion;
    const dur = reduced ? FUSE_REDUCED_DUR : FUSE_STEP_DUR;
    const p = Math.min(1, a.t / dur);
    const impactFrac = reduced ? FUSE_REDUCED_IMPACT_FRAC : FUSE_IMPACT_FRAC;
    if (!reduced && p < impactFrac) {
      // lift + arc: the absorbed copy drops in from above and to the side
      const k = p / impactFrac;
      const ease = k * (2 - k);
      const dx = (1 - ease) * -8;
      const dy = (1 - ease) * -14 - Math.sin(ease * Math.PI) * 4;
      g.globalAlpha = 0.4 + 0.6 * ease;
      g.drawImage(itemIcon(a.step.def), Math.round(pos.x + dx - 6), Math.round(pos.y + dy - 6));
      g.globalAlpha = 1;
    }
    if (p >= impactFrac && p < impactFrac + 0.18) {
      const k = 1 - (p - impactFrac) / 0.18;
      g.globalAlpha = Math.min(0.8, k);
      rect(g, Math.round(pos.x - 7), Math.round(pos.y - 7), 14, 14, C.white);
      g.globalAlpha = 1;
    }
  }

  /** ARSENAL.md §8.3: a tap skips the whole queued sequence, not just the current step — the run
   *  state is already final, so skipping is just clearing cosmetic state. */
  private skipFuseAnim(): void {
    if (!this.anim && !this.run.fuseAnim?.length) return;
    this.anim = null;
    if (this.run.fuseAnim?.length) this.run.fuseAnim = [];
  }

  /** shoptap (D1): `kind`, the pointer that pressed (the editor's touch rules read it). */
  down(x: number, y: number, kind: PointerKind = "mouse"): void {
    this.skipFuseAnim(); // 0.6.1d2: a tap anywhere skips the merge animation to its end
    this.ed.down(x, y, kind);
  }

  /** shoptap (D3): every press: one anywhere but on the belt X takes the X down (a press on a UI region included). */
  pressed(_x: number, _y: number, region: string | null): void {
    if (region !== "beltx") this.ed.dropX();
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
    else if (k === "r" || k === "R") {
      // 0.6.2 BELTSIDE (B2): R turns the carried rig, else the selected placed rig; with no rig in hand, rerolls
      if (this.ed.rotateCarry()) return;
      const s = this.sel;
      const p = s.kind === "item" ? itemByUid(this.run.build, s.uid) : undefined;
      if (p && isRig(p.def)) rotate(this, p.uid);
      else this.doReroll();
    }
    else if (k === "Delete" || k === "Backspace") {
      const s = this.sel;
      if (s.kind === "cargo") sell(this, s.uid);
      else if (s.kind === "item") store(this, s.uid);
      else if (s.kind === "route") deleteRoute(this, s.index);
      else if (s.kind === "fitted") storeFitted(this, s.uid); // shoptap: a fitted piece goes to cargo (its TO CARGO)
    }
  }
}

export { ITEMS };
