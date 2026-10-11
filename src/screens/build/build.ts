// Build phase: shop cards -> the cruiser at centre stage -> cargo tray, FIGHT beside the
// bow. Drag and drop or tap-to-place; contextual cues replace the old instruction text.

import { playerSkin } from "../../game/profile"; // CUSTOM-2a (REQ-BFG-072, R11): the player's side wears the chosen styles
import { loadProfile } from "../../game/profile"; // CARD-3 (REQ-BFG-107): a finished run counts as earlier play
import type { Skin } from "../../render/styles"; // CUSTOM-2a
import type { Game, Screen } from "../../game/game";
import { reroll, saveRun, type DuskFoe, type Run } from "../../game/run";
import { buyPack } from "../../game/run"; // bb-0.8.6 (REQ-BFG-051 P5)
import { fightRefusal } from "../../game/run"; // RUNES-2a (REQ-BFG-058): no fight while a rune pick is pending
import type { PackId } from "../../sim/content";
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
import { cruiserModel, drawTurrets, turretPivotX, turretPivotY, type CruiserModel, type CruiserView } from "../../render/cruiser";
import { drawMachinery } from "../../render/machinery";
import { drawLevelMark, levelMarks, type LevelMark } from "../../render/levelMark"; // bb-0.8.3 (REQ-BFG-043 D11): the board's level marks
import { SeaBackdrop } from "../../render/backdrop"; // MOTION-2 (REQ-BFG-071): the day's sea behind the build screen
import { MOTION, MOTION_KNOBS, MotionPerf, seaForDay, stillSeaSeed } from "../../render/motion";
import { drawStillCarrier } from "../../render/ship"; // MOTION-2: the player's ship around the board
import { inside, tapRect, type Rect } from "../../ui/ui";
import { tapPx } from "../../ui/tap"; // zoom (D4)
import { TAP_CSS } from "../../ui/tap"; // bb-0.8.6 (REQ-BFG-051 P5): the pack slots' finger target
import { Editor, direct, type BeltX, type EditHost } from "./edit";
import { buildLayout, buildScale, Caravan, panelArea as panelAreaOf, phoneScreen, type BuildLayout, type Sel } from "./layout";
import { inCarrier, screenRect, toDeck, toScreen } from "./layout"; // ZOOM-1 (REQ-BFG-080): the carrier's own zoom
import { phoneBarLift } from "./layout"; // TAP-093 (backlog #340): a portrait phone's taller top bar
import { deleteRoute, rotate, sell, store, storeFitted } from "./actions";
import { cssPerPx as cssScale, type PointerKind } from "../../core/io"; // shoptap (D1)
import { beltXSide, placeBeltX } from "./beltx"; // shoptap (D3)
import { detailsPlan, fullest, fullText, keptWhole, visibleLines, type PLine } from "./inspector"; // shoptap tooling: panelInfo; shoptap2: panelArea; zoom: fullText
import { panelFit } from "./inspector"; // SPACE-1 (REQ-BFG-087, D4): the band's fit with the gaps
import { drawBuildChrome } from "./chrome";
import { keywordsPressed } from "./keywords"; // U2c (REQ-BFG-045): tap to explain
import { keywordState, questionRect } from "./keywords"; // EXPLAIN-1 (REQ-BFG-089) tooling: panelInfo's ⓘ target and view
import { columnButtons } from "./inspector"; // EXPLAIN-1 tooling: the column's buttons (panelInfo's ⓘ target clears them)
import { completeTip } from "../../ui/tips"; // EXPLAIN-1 (REQ-BFG-089, E5): a pack bought completes the supply tip
import { completeNotice, RENAME_NOTICE, renameNoticeDue } from "../../ui/tips"; // CARD-3 (REQ-BFG-107): the rename notice
import { suggestCell } from "./cues";
import { BattleScreen, duskScreen } from "../battle";
import { EventScreen } from "../event/event";
import { RuneBar, runeRowFits, runeRowH, shiftLayout } from "../../ui/runeBar"; // RUNES-1 (REQ-BFG-058): the rune bar
import { RunePicker } from "../runePicker"; // RUNES-1: the dawn rune picker
import { LastChancePicker } from "../lastChancePicker"; // LC-1 (REQ-BFG-073): the LAST CHANCE pick, before the dawn rune
import { FoeView } from "./foeView"; // SCOUT-1c (REQ-BFG-082): a SCOUT-revealed foe from the NEXT BATTLE card

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

/** CARD-3 (REQ-BFG-107): the runs this device finished (game/profile.ts counters.runsFinished; 0 with no store). */
function finishedRuns(): number {
  try {
    return loadProfile().counters.runsFinished;
  } catch {
    return 0;
  }
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
  /** CUSTOM-2a (REQ-BFG-072, R11): the player's styles, read once: the board (floor, belts) and the part panel with its
   *  idle forms (Ctx.skin) wear them. */
  readonly skin: Skin = playerSkin();
  /** MOTION-2 (REQ-BFG-071): the day's sea, held still (one cached blit a frame). */
  private sea = new SeaBackdrop();
  /** MOTION-2 (?perf=1, test builds only): the frame-time split (backdrop, hulls: the ship and plate, boards: machinery,
   *  turrets and marks, effects: the chrome and the rest, world: the whole draw); null in a player build. */
  readonly perf: MotionPerf | null = MOTION_KNOBS && MOTION.perf ? new MotionPerf() : null;

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
    this.view = { side: 0, build: this.run.build, model: this.model, frame: this.L.frame, t: 0, tread: 0, skin: this.skin };
  }

  /** zoom (REQ-BFG-040): a portrait phone's layout (layout.ts phoneScreen, told by the view pickScale last framed). */
  private phone = false;

  /** ZOOM-1 (REQ-BFG-080): the dpr pickScale last framed (pickSub's layout reads the rune row's height with it). */
  private pickDpr = 1;

  /**
   * ZOOM-1 (REQ-BFG-080): the canvas grid (game/viewGrid.ts, FIELD-1's): canvas px per logical px. The carrier draws at
   * its own whole device-pixel zoom z (layout.ts carrierZoom) and the UI at `scale`, so the canvas runs on unit =
   * gcd(scale, z) device px per canvas px (camera.ts's rule) and the logical px at sub = scale / unit canvas px: every art
   * px, the UI's and the carrier's, is whole canvas px. 1 where the carrier draws at the UI's scale (today's canvas).
   */
  pickSub(pw: number, ph: number, portrait: boolean, scale: number): number {
    const z = this.layoutAt(Math.floor(pw / scale), Math.floor(ph / scale), portrait, { scale, dpr: this.pickDpr }, { scale, unit: 1 }).cam.z;
    let a = scale, b = z;
    while (b) [a, b] = [b, a % b];
    return scale / a;
  }

  pickScale(pw: number, ph: number, portrait: boolean, dpr?: number): number {
    this.pickDpr = dpr ?? 1;
    // zoom (D1): on a phone an art pixel is at most 1.75 CSS px (buildScale); D2: in portrait the phone's layout
    this.phone = portrait && dpr !== undefined && phoneScreen(pw, ph, dpr);
    let scale = buildScale(pw, ph, portrait, dpr);
    // RUNES-1 (REQ-BFG-058): with a rune held its bar's row comes off the layout's height (layout()); a scale that would
    // put the cargo tray or FIGHT off the screen steps down (no rune held: always as before)
    while (scale > 1 && !runeRowFits(this, pw, ph, portrait, scale, dpr)) scale--;
    // bb-0.8.6 (REQ-BFG-051 P5; oracle 43f2c3d185b37c07): on any phone, portrait or landscape, the pack slots are finger
    // targets: TAP_CSS CSS px in art px at this scale (ui/tap.ts tapPx)
    this.packTap = dpr !== undefined && phoneScreen(pw, ph, dpr) ? Math.ceil(TAP_CSS / (scale / dpr)) : 0;
    return scale;
  }

  /** bb-0.8.6 (PACKS P5): a phone's finger target in art px (0 on a desk), for the pack slots (buildLayout's `tap`). */
  private packTap = 0;

  /** shoptap (D2): the last press was a finger or a pen (Ctx.touch: the panels' touch forms, a finger's targets). */
  get touch(): boolean {
    return direct(this.game.ui.pointer.kind);
  }

  /** shoptap (D1): CSS px per logical px, the touch slop's unit (EditHost.cssPerPx). */
  cssPerPx(): number {
    return cssScale(this.game.view);
  }

  /** shoptap (D3): where the belt X `x` goes this frame (beltx.ts placeBeltX), or null. Tooling reads it too.
   *  shoptap2: clear of the details panel as drawn (panelArea), not only of the band. */
  beltXRect(x: BeltX | null = this.ed.beltX()): Rect | null {
    if (!x) return null;
    const turrets = turretSlots(this.run.build).map((_, i) => this.turretRect(i));
    return placeBeltX(this.L, this.run.build, x, beltXSide(this.cssPerPx()), turrets, [this.panelArea()]);
  }

  /**
   * shoptap2 (REQ-BFG-034, REQ-BFG-035): where the details panel is drawn this frame. The layout's band (portrait) or
   * column (landscape), except after a finger's press on a portrait phone whose band is too short for the panel's kept
   * text (a phone's browser leaves the page less than its screen: Safari's 390x664 on a 390x844 iPhone gives a 40 px band,
   * 390x700 gives 8): then the panel gets PORT_BAND, more where its kept text needs it, grown over the bow for a shop card
   * and over the shop for anything else (layout.ts panelArea, panelRect). Not for a mouse (its panels are 0.8.0's), not
   * while a mouse hovers a card, and not during a drag or a belt draw (the band, so the deck stays in sight to drop on).
   */
  panelArea(): Rect {
    // SPACE-1 (REQ-BFG-087): once a frame (frameArea): inside draw() the frame's first call plans it, the others take it
    if (this.drawing && this.frameArea) return this.frameArea;
    // zoom (REQ-BFG-040, D3): on a phone's layout the panel sits in the band wherever its full description fits there
    // (fullText); only where it doesn't does shoptap2's fallback grow it. Elsewhere, as before: its kept text (keptWhole)
    // SPACE-1 (REQ-BFG-087, D4): inspector.ts panelFit, the one fit the tests share: on a phone, its full description with
    // its gaps at least GAP_MIN in the band, at GAP while it grows
    const r = panelAreaOf(this.L, this.sel, { touch: this.touch, hover: !!this.hover, busy: !!(this.ed.carry || this.ed.draw) },
      panelFit(this, this.sel, !!this.L.phone));
    if (this.drawing) this.frameArea = r;
    return r;
  }

  /** SPACE-1 (REQ-BFG-087): the details panel's rect for the frame being drawn. panelArea's PANEL_STEP loop plans the
   *  panel at each height (with D4's gaps a tall turret panel on the 402x690 phone with a rune takes 22 plans, 10 before),
   *  and a frame asks for it three times (the corner MENU's target, the details band, the rune bar's targets), so inside
   *  draw() it is planned once. Outside draw() (a press, a drop, the tooling's bb.panel) it is planned fresh, as before;
   *  nothing draw() reads for it (the selection, the hover, the press kind, a drag, the run) changes while it draws. */
  private frameArea: Rect | null = null;
  private drawing = false;

  /** shoptap tooling (window.bb.panel, read only): the details panel as drawDetails plans it now: its title, sub line,
   *  button labels and the body lines it draws, and whether its kept text shows whole; null with no panel. shoptap2: in
   *  the rect it is drawn in (panelArea). */
  panelInfo(): { title: string; sub: string; labels: string[]; lines: string[]; whole: boolean; full: boolean; fullest: boolean;
    variant: number; dropped: string[]; inBand: boolean; band: Rect; area: Rect; notes: string[]; info: Rect | null; view: boolean } | null {
    const area = this.panelArea();
    const d = detailsPlan(this, this.sel, this.hover, area);
    if (!d) return null;
    const text = (l: PLine): string => (l.cells ? l.cells.map((c) => `${c.label} ${c.spans.map((s) => s.t).join("")}`).join("  ")
      : `${l.label ? `${l.label} ` : ""}${l.spans.map((s) => s.t).join("")}`);
    const lines = visibleLines(d.plan).flatMap((v) => (v.line === "rule" ? [] : [text(v.line)]));
    const sub = d.plan.headerOnly ? d.plan.headerOnly.lines.join(" ") : d.plan.body.sub ?? d.plan.subs.join(" ");
    // EXPLAIN-1 (REQ-BFG-089) tooling: the ⓘ NOTES lines, the ⓘ icon's target as drawDetails registers it (keywords.ts
    // questionRect, clear of the buttons' hit rects) and whether the ⓘ view is open
    const tap = this.touch ? tapPx(this.game.view) : 0, n = d.t.labels.length, p = d.plan;
    const buttons = p.column ? columnButtons(n, p.r, tap) : (p.rects ?? []).map((b) => (tap ? tapRect(b, tap, p.r) : b));
    // zoom (REQ-BFG-040): its full description (fullText), its fullest form (every block, variant 0), the variant and the
    // blocks that gave way, and whether it sits in the band (not grown over the bow or the shop)
    return {
      title: d.t.title, sub, labels: d.t.labels, lines, whole: keptWhole(d.plan), full: fullText(d.plan), fullest: fullest(d.plan),
      variant: d.plan.body.variant, dropped: d.plan.body.dropped.map((b) => b.role), inBand: area === this.L.info, band: { ...this.L.info }, area: { ...area },
      notes: (d.t.notes ?? []).map((b) => b.text), info: questionRect(p.r, p.y, tap, buttons), view: (keywordState(this)?.page ?? null) !== null,
    };
  }

  /** bb-0.8.3 tooling (read only; scripts/touchcheck.mjs): the level marks the board draws now (render/levelMark.ts): the
   *  FACTORY level on the hero factory and TURRET SPEED on each starting turret, from level 2 up; logical px. */
  levelMarks(): LevelMark[] {
    return [...levelMarks(this.run.build, this.L.frame, this.view.hideItem ?? -1)];
  }

  get toastY(): number {
    // ZOOM-1 (REQ-BFG-080): landscape, 13 px over the hull's foot, where 0.9.8's toast sat (its cargo tray was 3 px under
    // the hull; the tray now sits under FIGHT, beside the carrier's middle); portrait, over the tray, as before
    return this.L.portrait ? this.L.cargo.y - 16 : this.L.hull.y + this.L.hull.h - 13;
  }

  private layout(): BuildLayout {
    // ZOOM-1 (REQ-BFG-080): the carrier at the zoom the view's canvas grid holds (pickSub): unit = scale / sub
    const v = this.game.view, sub = v.sub ?? 1;
    return this.layoutAt(this.game.W, this.game.H, this.game.portrait, v, { scale: v.scale, unit: v.scale / sub });
  }

  /** The layout of a W x H logical screen at `view`'s scale (layout(); ZOOM-1: pickSub's, for a view being framed). */
  private layoutAt(W: number, H: number, portrait: boolean, view: { scale: number; dpr: number }, grid: { scale: number; unit: number }): BuildLayout {
    // RUNES-1 (REQ-BFG-058): the rune bar's row under the top bar (0 with no rune held: exactly as before)
    const row = runeRowH(view, this.run.build.runes?.length ?? 0);
    const offers = this.refit ? OFFERS : this.offers().length, phone = this.phone && portrait;
    // TAP-093 (backlog #340): a portrait phone's top bar grows to a finger's target where the screen spares it with a rune
    // row (layout.ts phoneBarLift: the same with or without a rune held); 0 elsewhere, as before
    const lift = phone ? phoneBarLift(W, H, offers, this.packTap, runeRowH(view, 1)) : 0;
    return shiftLayout(buildLayout(W, H - row, portrait, offers, phone, this.packTap, lift, grid), row, H);
  }

  /** ZOOM-1 tooling (read only; scripts/touchcheck.mjs, zoom1shots.mjs): a deck cell's centre on screen (logical px),
   *  through the carrier's zoom. */
  tileCentre(cx: number, cy: number): { x: number; y: number } {
    return toScreen(this.L, footX(this.L.frame, cx, cy) + 6, footY(this.L.frame, cx, cy) + 6);
  }

  /** ZOOM-1 tooling (read only): the carrier's zoom (layout.ts CarrierCam) and the canvas grid (canvas px per logical px). */
  carrierView(): { k: number; z: number; x: number; y: number; sub: number; scale: number } {
    return { ...this.L.cam, sub: this.game.view.sub ?? 1, scale: this.game.view.scale };
  }

  /** TAP-093 (backlog #340): the corner MENU's target this frame (chrome.ts drawTopBar; layout.ts cornerTarget), or null
   *  where the bar keeps SND and MENU at its right end. */
  cornerMenu: Rect[] | null = null;

  /** RUNES-1 (REQ-BFG-058): the rune bar (under the top bar, with a rune held) and the dawn rune picker (a modal over the
   *  screen while today's pick is pending: it takes every press and key). */
  readonly runeBar = new RuneBar();
  readonly runePicker = new RunePicker();
  /** LC-1 (REQ-BFG-073): the LAST CHANCE picker (a modal like the rune picker, up while the run's pick is pending: never
   *  with the switch off) and the regained heart's animation clock on the bar (seconds since the pick; Infinity: none). */
  readonly lastChancePicker = new LastChancePicker();
  lcHeartT = Infinity;
  /** SCOUT-1c (REQ-BFG-082): a SCOUT-revealed foe's carrier, opened from the NEXT BATTLE card (build/foeView.ts). While it
   *  is open it takes every press and key, and the frame draws it over the sea instead of the deck and its chrome. */
  readonly foeView = new FoeView();

  /** RUNES-1, LC-1: a picker is up (it takes every press and key). */
  modalUp(): boolean {
    return this.runePicker.up(this) || this.lastChancePicker.up(this);
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
      // CARD-3 (REQ-BFG-107): the returning player's notice, once on this device: on the first caravan whose dawn has no
      // toast of its own (toasts replace each other), when the store shows earlier play (a how-to tip done, or a finished
      // run). A toast takes no press, so nothing on it can change the run
      else if (renameNoticeDue(finishedRuns())) {
        this.game.toast(RENAME_NOTICE, C.yellow, undefined, 6);
        completeNotice("rename107");
      }
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
    ({ x, y } = toDeck(this.L, x, y)); // ZOOM-1 (REQ-BFG-080): the screen point in the carrier's space (wfx draws there)
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

  /** ZOOM-1 (REQ-BFG-080): a landscape cargo tray in the right column has two rows of slots (layout.ts); one row elsewhere,
   *  as before. */
  slotRect(i: number): Rect {
    const per = this.cargoPerRow();
    return { x: this.L.cargo.x + 3 + (i % per) * 19, y: this.L.cargo.y + 2 + Math.floor(i / per) * 19, w: 18, h: 18 };
  }

  private cargoPerRow(): number {
    return Math.max(1, Math.floor((this.L.cargo.w - 6) / 19));
  }

  cargoSlots(): number {
    return this.cargoPerRow() * Math.max(1, Math.floor((this.L.cargo.h - 3) / 19));
  }

  cargoAt(x: number, y: number): number | null {
    const n = Math.min(this.cargoSlots(), this.run.inventory.length);
    for (let i = 0; i < n; i++) if (inside(this.cargoHit(i), x, y)) return this.run.inventory[i].uid;
    return null;
  }

  /** zoom (REQ-BFG-040, D4): cargo slot i's target: on a phone's layout a finger's (TAP_CSS CSS px tall, tapPx), grown
   *  about the slot from 1 px under the hull to the screen's foot (its neighbours keep theirs: side by side they never
   *  meet); elsewhere the slot, as before. */
  cargoHit(i: number): Rect {
    const r = this.slotRect(i);
    if (!this.L.phone) return r;
    const top = this.L.hull.y + this.L.hull.h + 1;
    return tapRect(r, tapPx(this.game.view), { x: r.x, y: top, w: r.w, h: this.game.H - top });
  }

  /** 0.6.2s (REQ-BFG-031 S9, S10): TURRET SLOT i's hit box (deck.ts turretSlots); an empty slot's mount is a heavy's size. */
  turretRect(i: number): Rect {
    return screenRect(this.L, this.deckTurretRect(i)); // ZOOM-1 (REQ-BFG-080): on screen, through the carrier's zoom
  }

  /** ZOOM-1: TURRET SLOT i's box in the carrier's space (the selection frame draws there). */
  private deckTurretRect(i: number): Rect {
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

  /** bb-0.8.6 (REQ-BFG-051, PACKS P5): one BELT PACK or ARMOR PACK from its fixed slot. Short of gold, the tap says why, as
   *  REROLL's does ("A BELT PACK COSTS 2G"); a buy shows REROLL's gold popup, lands on the belt and hull readouts at once
   *  (they read the build every frame) and is saved, so a reload keeps it. Not after a road event (no caravan). */
  doPack(id: PackId): void {
    if (this.refit || this.ed.busy) return;
    const r = buyPack(this.run, id);
    if (!r.ok) return this.invalid(r.reason ?? "");
    this.ufx.popup(this.coinX, 12, `-${r.price}`, C.yellow);
    this.game.audio.play("coin");
    saveRun(this.run);
    completeTip("supply"); // EXPLAIN-1 (REQ-BFG-089, E5): a supply bought (a pack is used the moment it is bought)
  }

  fight(): void {
    if (this.ed.busy) return;
    // RUNES-2a (REQ-BFG-058, RUNES-1 gap 6): no fight while today's rune pick is pending (run.ts fightRefusal)
    const rune = fightRefusal(this.run);
    if (rune) return this.invalid(rune);
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
    this.lcHeartT += dt; // LC-1: the regained heart's animation
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
    // SPACE-1 (REQ-BFG-087): panelArea once a frame (frameArea)
    this.drawing = true;
    this.frameArea = null;
    try {
      this.drawFrame(g);
    } finally {
      this.drawing = false;
      this.frameArea = null;
    }
  }

  private drawFrame(g: G): void {
    const L = (this.L = this.layout());
    const { W, H, portrait } = this.game;
    ({ block: this.block, broken: this.broken } = routeCheck(this.run.build));
    // MOTION-2 (REQ-BFG-071): one world on every screen. The day's sea, held still (still under REDUCED MOTION too), and
    // the player's own ship drawn around the board's rectangle: the board's tile size, position, taps and drags are
    // 0.9.4's (L.frame), only the hull under it changed. CUSTOM-2a (REVIEW-MOTION2 Q2): the only look (no ?motion=0).
    const P = MOTION_KNOBS ? this.perf : null; // ?perf=1 (test builds only): the frame-time split
    const tw = P ? performance.now() : 0;
    let t0 = tw;
    this.sea.drawStill(g, { W, H, kind: seaForDay(this.run.day), dist: 0, t: 0, reduced: false, seed: stillSeaSeed(this.run.day), scale: this.game.view.scale, dpr: this.game.view.dpr });
    if (P) { const t1 = performance.now(); P.add(0, t1 - t0); t0 = t1; }
    if (this.foeView.open) return this.foeView.draw(g, this); // SCOUT-1c (REQ-BFG-082): the scouted foe's carrier
    const ghost = this.ed.ghost();
    // free connectors glow while drawing, with no belt fed, or when a belt goes nowhere
    const guide = !!this.ed.draw || connectedRouteCount(this.run.build) === 0 || this.block === NOWHERE;
    const v = this.view;
    v.frame = L.frame;
    v.t = this.t;
    v.ghost = ghost;
    v.highlightConnectors = guide ? this.ed.freeConnectors() : undefined;
    // a reroute hides the belt it redraws (bb-0.8.3: no factory draw moves a belt any more, so 0.8.0's touch exception, a
    // one-output factory's moved belt left in sight, is gone with it)
    v.hideRoute = ghost && this.ed.draw ? this.ed.draw.replacing : -1;
    v.hideItem = this.ed.carry?.src.from === "deck" ? this.ed.carry.uid : -1;
    v.survivorUid = this.survivorUid();
    const fd = this.fuseAnimDeck();
    v.fuseAnimUid = fd?.uid;
    v.fuseAnimStars = fd?.showStars;
    const bump = this.thunkT > 0.07 ? 1 : 0;
    if (P) t0 = performance.now();
    // ZOOM-1 (REQ-BFG-080): the carrier group (the ship, the deck, belts, parts, turrets, the selection, the level marks,
    // the merge animation and the world effects) draws in the carrier's space at its own zoom (layout.ts inCarrier)
    inCarrier(g, L, () => {
      if (bump) g.translate(0, bump);
      drawStillCarrier(g, v.model.hero, L.frame, 0, this.skin.floor, this.skin.carrier); // CUSTOM-3 (REQ-BFG-074): your carrier style
      if (P) { const t1 = performance.now(); P.add(1, t1 - t0); t0 = t1; }
      drawMachinery(g, v);
      this.drawBroken(g);
      drawTurrets(g, v);
      this.drawSelection(g);
      // bb-0.8.3 (REQ-BFG-043 D11): the board's level marks (drawn with the deck) once more over the selection, so a selected
      // gun's frame never cuts its plate (nothing at level 1)
      for (const m of levelMarks(this.run.build, L.frame, v.hideItem ?? -1)) drawLevelMark(g, m);
      this.drawFuseAnim(g);
      if (bump) g.translate(0, -bump);
      if (P) { const t1 = performance.now(); P.add(2, t1 - t0); t0 = t1; }
      this.wfx.draw(g, 0, 0);
    });
    this.runeBar.drawUnder(g, this); // RUNES-1: the rune bar (a grown panel, the options card and a drag draw over it)
    drawBuildChrome(g, this);
    inCarrier(g, L, () => this.wfx.drawPops(g, 0, 0));
    this.ufx.draw(g, 0, 0);
    this.ufx.drawPops(g, 0, 0);
    if (!this.modalUp()) {
      this.runeBar.drawOver(g, this); // RUNES-1: the chips' targets and the open read-out
      // TAP-093: the corner MENU's target over the rune bar's strip, where it covers only the strip's label column (no chip:
      // layout.ts cornerTarget keeps it clear of them); not while the options card is up
      if (this.cornerMenu && !this.menu) for (const r of this.cornerMenu) this.game.ui.add({ id: "menu", r, onTap: () => { this.menu = true; }, block: true });
    }
    this.runePicker.draw(g, this); // RUNES-1: the dawn rune picker over everything (its regions take every press)
    this.lastChancePicker.draw(g, this); // LC-1: the LAST CHANCE pick (pendingRune is null while it is up)
    if (P) { const t1 = performance.now(); P.add(4, t1 - t0); P.add(5, t1 - tw); P.frame(); }
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
      const r = this.deckTurretRect(s.index); // ZOOM-1: drawn in the carrier's space
      frame(g, r.x, r.y, r.w, r.h, col);
    } else if (s.kind === "fitted") {
      // shoptap (REQ-BFG-035): a fitted core or gear piece: its turret is framed
      const m = b.mods.find((q) => q.uid === s.uid);
      if (m && turretSlots(b)[m.turret]) {
        const r = this.deckTurretRect(m.turret);
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
        to: this.tileCentre(cell.x, cell.y), // ZOOM-1 (REQ-BFG-080): on screen, through the carrier's zoom
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
        to: this.tileCentre(cell.x, cell.y), // ZOOM-1 (REQ-BFG-080): on screen, through the carrier's zoom
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
      return toDeck(this.L, r.x + 9, r.y + 9); // ZOOM-1 (REQ-BFG-080): the effects draw in the carrier's space
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
    if (this.foeView.open) return this.foeView.press(this, x, y); // SCOUT-1c: a part of the foe's carrier opens its face
    if (this.modalUp()) return; // RUNES-1: nothing under the rune picker moves (LC-1: nor the LAST CHANCE picker)
    this.skipFuseAnim(); // 0.6.1d2: a tap anywhere skips the merge animation to its end
    this.ed.down(x, y, kind);
  }

  /** shoptap (D3): every press: one anywhere but on the belt X takes the X down (a press on a UI region included). */
  pressed(_x: number, _y: number, region: string | null): void {
    if (this.foeView.open) return this.foeView.faces.pressed(region); // SCOUT-1c: a press off a face's word closes it
    // RUNES-1: the rune picker takes every press (LC-1: the LAST CHANCE picker too). EXPLAIN-1 (REQ-BFG-089, E3): a press
    // anywhere but the opened card's chip closes the line it shows
    if (this.modalUp()) return this.runePicker.pressed(region);
    if (region !== "beltx") this.ed.dropX();
    this.runeBar.pressed(region); // RUNES-1: a press off the rune bar closes its read-out
    keywordsPressed(this, region); // U2c (REQ-BFG-045): a press off a word, `?` or the KEYWORDS view closes them
  }

  move(x: number, y: number): void {
    if (this.foeView.open) return; // SCOUT-1c: no hover or drag under the foe's view
    if (this.modalUp()) return; // RUNES-1: no hover or drag under the rune picker (LC-1: nor the LAST CHANCE picker)
    this.ed.move(x, y);
    this.hover = this.game.ui.pointer.down ? null : this.offerAt(x, y);
  }

  up(x: number, y: number): void {
    if (this.foeView.open) return; // SCOUT-1c
    this.ed.up(x, y);
  }

  cancel(): void {
    this.ed.cancel();
  }

  key(k: string): void {
    if (this.foeView.open) return this.foeView.key(k); // SCOUT-1c: Escape closes the face, then the view; no FIGHT under it
    if (this.modalUp()) return; // RUNES-1: the rune picker can't be skipped (no FIGHT, reroll or Escape under it); LC-1: nor LAST CHANCE
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
