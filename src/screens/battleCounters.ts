// COUNT-1 (REQ-BFG-100; REQ-BFG-053's waiting count; display only): the battle view's counters. The values and the
// status row's chip list are game/counters.ts (data); the words ui/counterText.ts. Drawn on the canvas in the HUD layer at
// the screen's scale, upright, after the world (so the camera's zoom never shrinks them and they ride the boards without
// blurring): the board counters (C5 a belt's slugs, C6 a gun's waiting slugs) anchored every frame to their tile or pivot
// through the board's transform and the camera (ArenaMotion.tileCentre and localToScreen, without the shake), the status
// rows (C1 the foe's, C2 yours) hanging off each plate on its hull side. A tap (phone) or a hover (desk) on a counter
// group opens its panel: the count over its keyword's reminder (the build view's definition box), closed by any other
// press as the build view's is. Nothing here writes the sim or the arena: a tap never changes the fight. The battle and
// the replay draw it alike.

import type { Game } from "../game/game";
import type { Arena } from "../game/arena";
import type { ArenaMotion } from "../game/arenaMotion";
import type { BattleLayout } from "../game/battleLayout";
import type { Side, SimEvent } from "../sim/battle";
import { CELL } from "../sim/content";
import { kx, ky, turretSlots, type Build } from "../sim/deck";
import { DECK, TURRET_LY, fwdX, fwdY } from "../render/frame";
import { C } from "../render/palette";
import { makeCanvas, rect, type G } from "../render/pixel";
import { ICON, drawText, textWidth } from "../render/font";
import { inside, type Rect } from "../ui/ui";
import { tapPx } from "../ui/tap";
import { fmtCount } from "../ui/statFormat";
import { drawRich, type RichLine } from "../ui/richText";
import { definitionLines } from "./build/keywords";
import {
  BELT_BACK, BELT_COUNTS, BOX_H, GUN_COLOUR, JamMemory, STATUS_H, beltShows, boxW, canJam, gunBoxAt, gunState, keepOnScreen,
  overlap, readCount, shownChips, slugsWaiting, statusTab, tabBelow, type BeltCounts, type CountKey, type GunState, type ShownChip,
} from "../game/counters";
import { rampBadges, type RampBadge, type RunRecord } from "../game/counters"; // SCALE-2c (REQ-BFG-100): C8, C9
import { JAM_TAG, beltText, keywordEntry, pairEntry, sentenceEntry, waitingText, type CounterEntry } from "../ui/counterText";
import { rampText, recordText } from "../ui/counterText"; // SCALE-2c (REQ-BFG-100): C8's and C9's taps
import { textDay } from "../ui/fightDay"; // CNT-DAY (REQ-BFG-100, REQ-BFG-079): the panels' reminders on the fight's day
import { GLOW_A, type PairWatch } from "../game/pairCue"; // PAIR-CUE (REQ-BFG-100): an intake's cue on its belt's box
import { PAIR_COLOUR } from "../render/fx";
import type { PlateInfo } from "./battleHud";

/** A counter group's region id prefix (one tap target a group: a plate's counts, a gun, a belt). */
export const CNT_REGION = "cnt:";
/** The open panel's own region (a press on it closes it, as on the build view's definition box). */
export const CNT_PANEL = "cntpanel";
/** The panel's widest (art px): the glossary's wrap width (GLOSSARY_WRAP_W 225) and its 5 px margins. */
export const PANEL_W = 235;
/** C5's box steps back along its belt this far at a time, at most this many times, to keep off a gun's box. */
export const BELT_STEP = 5, BELT_TRIES = 3;
/** How many frames an open panel outlives its group (a gun fires its last waiting slug, a belt empties): it stays where
 *  it was, its count now 0, for about 1.5 s, so a finger's panel doesn't vanish under it; then it closes. */
export const OPEN_GRACE = 90;

type GroupKind = "plate" | "gun" | "belt" | "piece"; // SCALE-2c: "piece", a C8 badge (ref: the rig's uid, or 1000 + the gun's slot)
interface Group { id: string; kind: GroupKind; side: Side; ref: number; anchor: Rect; target: Rect }

/** Tooling (bb.counters): what the counters drew this frame (logical px). */
export interface CountersDrawn {
  tabs: [TabDrawn | null, TabDrawn | null];
  guns: { side: Side; slot: number; r: Rect; n: number; text: string; state: GunState }[];
  belts: { side: Side; route: number; r: Rect; n: number }[];
  /** SCALE-2c (C8): the reader badges drawn (a rig's uid or a gun's slot, its bonus) */
  badges: { kind: "rig" | "gun"; ref: number; r: Rect; text: string }[];
  targets: { id: string; r: Rect }[];
  panel: { id: string; r: Rect; heads: string[]; lines: string[] } | null;
  /** board boxes not drawn this frame: they would have covered a plate, a status row, the bar or a wind number */
  skipped: number;
}
export interface TabDrawn { side: Side; r: Rect; below: boolean; chips: { key: CountKey; text: string; dim: boolean; x: number }[] }

const SIDES: Side[] = [0, 1];
/** The most cached images (status tabs and boxes) kept before the cache starts again. */
const CACHE_MAX = 96;

export class BattleCounters {
  /** C6's jam memory (red from a gun's `jam` until it fires again). */
  readonly jams = new JamMemory();
  /** C5's rule (game/counters.ts BELT_COUNTS); tooling may flip it for the comparison stills. */
  mode: BeltCounts = BELT_COUNTS;
  /** The group a tap opened (null: none); a hover shows its group's panel without opening it. */
  open: string | null = null;
  readonly last: CountersDrawn = { tabs: [null, null], guns: [], belts: [], badges: [], targets: [], panel: null, skipped: 0 };
  /** SCALE-2c (REQ-BFG-100, C9): your run's record, set by the battle screen for the fight (game/counters.ts runRecord: null
   *  unless a GRUDGE ROD or TROPHY CHAIN is aboard with the switch on); your plate's tap shows it. */
  record: RunRecord | null = null;
  private readonly groups: Group[] = [];
  /** The open group as last drawn, and the frames since (OPEN_GRACE). */
  private kept: { grp: Group; frames: number } | null = null;
  private readonly cache = new Map<string, HTMLCanvasElement>();
  private slotsFor: Build | null = null;
  private slots: [ReturnType<typeof turretSlots>, ReturnType<typeof turretSlots>] = [[], []];
  private readsOf: unknown = null;
  private readonly reads = new Map<string, boolean>();

  /** The arena's events this frame (Arena.update's): the jams and the shots that end them. */
  events(ev: readonly SimEvent[]): void {
    for (let i = 0; i < ev.length; i++) this.jams.event(ev[i] as { type: string; side?: Side; turret?: number });
  }

  /** A SKIP: the steps it ran are not shown, so no jam is remembered past it; the panel closes. */
  reset(): void {
    this.jams.clear();
    this.open = null;
  }

  /** Every press the screen hears (Game.pointerDown, before routing): a press off a counter group closes its panel. */
  pressed(region: string | null): void {
    if (!region || !region.startsWith(CNT_REGION)) this.open = null;
  }

  /** Start a frame: no groups yet (each draw adds its own). */
  begin(): void {
    this.groups.length = 0;
    this.last.targets.length = 0;
  }

  /** Some piece in the fight reads `key` on `side` (cached for the battle: its pieces never change in a fight). */
  private readsCount(a: Arena, side: Side, key: CountKey): boolean {
    if (this.readsOf !== a.b) {
      this.readsOf = a.b;
      this.reads.clear();
    }
    const k = `${side}${key}`;
    let v = this.reads.get(k);
    if (v === undefined) this.reads.set(k, (v = readCount(a.b, side, key)));
    return v;
  }

  private slotsOf(a: Arena, side: Side): ReturnType<typeof turretSlots> {
    if (this.slotsFor !== a.b.sides[0].build) {
      this.slotsFor = a.b.sides[0].build;
      this.slots = [turretSlots(a.b.sides[0].build), turretSlots(a.b.sides[1].build)];
    }
    return this.slots[side];
  }

  // ---------------------------------------------------------------------------------------------- C5 and C6: the boards

  /**
   * The board counters (C5, C6) while the fight runs (`live`, and the battle not over): a box at each gun with slugs waiting
   * and at each belt holding a slug (BELT_COUNTS' rule), each on its anchor as drawn now, upright, whole px, kept on the
   * screen and not drawn while its anchor is off it (CLOSE). A box that would cover a plate, a status row, the bar (`keep`)
   * or a wind number drawn this frame (ArenaMotion.windDrawn) is left out this frame. Call after the world, before the
   * plates: the plates, the bar and the DARK WIND callout draw over it. PAIR-CUE (REVIEW-COUNT1 ruling 3): the screens call
   * it from ArenaMotion.underNumbers, so every number (hits, BURN, heals, BLOCKED, PAIR's pops, the wind's) draws over it.
   * A gun's box sits on its pivot's outward side, never over the board's tiles (gunBoxAt; ruling 4).
   */
  drawBoard(g: G, game: Game, a: Arena, m: ArenaMotion, keep: readonly Rect[], avoid: readonly Rect[], live: boolean): void {
    const d = this.last;
    d.guns.length = 0;
    d.belts.length = 0;
    d.badges.length = 0;
    d.skipped = 0;
    if (!live || a.b.over) return;
    const { W, H } = game, tp = tapPx(game.view);
    // C6 first: a gun's waiting slugs (PRESSURE BREECH's count), beside its pivot on its outward side (PAIR-CUE: never over
    // the board's tiles); JAM while jammed
    for (const side of SIDES) {
      if (!a.show[side]) continue;
      const s = a.b.sides[side], slots = this.slotsOf(a, side);
      const f = a.drawn[side], deck = deckOnScreen(a, m, side);
      for (const tu of s.turrets) {
        const n = slugsWaiting(tu), sl = slots[tu.index];
        if (n <= 0 || !sl) continue;
        const [px, py] = m.localToScreen(a, side, (sl.col0 + sl.width / 2) * CELL, TURRET_LY);
        const st = gunState(tu, this.jams.jammed(side, tu.index));
        const text = st === "jam" ? `${fmtCount(n)} ${JAM_TAG}` : fmtCount(n);
        const w = boxW(textWidth(ICON.SLUG, "3") + 1 + textWidth(text, "3"));
        const at = gunBoxAt(px, py, w, BOX_H, fwdX(f), fwdY(f), deck);
        const box = keepOnScreen(px, py, at.x, at.y, w, BOX_H, W, H);
        if (!box || this.covers(box, keep, m)) { d.skipped++; continue; }
        g.drawImage(this.boxImage(ICON.SLUG, text, GUN_COLOUR[st]), box.x, box.y);
        d.guns.push({ side, slot: tu.index, r: box, n, text, state: st });
        this.addGroup(game, `${CNT_REGION}gun${side}:${tu.index}`, "gun", side, tu.index, box, squareAt(box, tp, W, H), avoid);
      }
    }
    // C5: a belt's slugs, at its last tile before the gun, set back along the belt (away from its gun), further back
    // (BELT_STEP at a time, BELT_TRIES times) while it would touch a gun's box: the desk's foe ends its belts by its guns
    for (const side of SIDES) {
      if (!a.show[side]) continue;
      const s = a.b.sides[side];
      for (const r of s.routes) {
        if (!beltShows(s, r, this.mode) || !r.cells.length) continue;
        const last = r.cells[r.cells.length - 1];
        const [cx, cy] = m.tileCentre(a, side, kx(last), ky(last));
        let ux = 0, uy = 0;
        if (r.cells.length >= 2) {
          const prev = r.cells[r.cells.length - 2];
          const [px, py] = m.tileCentre(a, side, kx(prev), ky(prev));
          const l = Math.hypot(cx - px, cy - py) || 1;
          ux = (cx - px) / l;
          uy = (cy - py) / l;
        }
        const n = r.ammo.length, text = fmtCount(n), w = boxW(textWidth(text, "3"));
        let box: Rect | null = null;
        for (let k = 0; k <= BELT_TRIES; k++) {
          const back = BELT_BACK + k * BELT_STEP;
          box = keepOnScreen(cx, cy, cx - back * ux - w / 2, cy - back * uy - BOX_H / 2, w, BOX_H, W, H);
          if (!box || !d.guns.some((q) => overlap(box!, q.r))) break;
          if (k === BELT_TRIES) box = null;
        }
        if (!box || this.covers(box, keep, m)) { d.skipped++; continue; }
        g.drawImage(this.boxImage("", text, C.white), box.x, box.y);
        // PAIR-CUE (REQ-BFG-100, REQ-BFG-081): the box sits on its belt's intake tile, so while that intake flashes for a
        // pair (or glows for a load waiting inside its window) the box's frame takes PAIR's blue (the glow's strength):
        // the box never hides the cue
        const cue = a.cue ? intakeCue(a.cue.drawn, side, r.index) : 0;
        if (cue > 0) { g.globalAlpha = Math.min(1, cue); frameRect(g, box, PAIR_COLOUR); g.globalAlpha = 1; }
        d.belts.push({ side, route: r.index, r: box, n });
        this.addGroup(game, `${CNT_REGION}belt${side}:${r.index}`, "belt", side, r.index, box, squareAt(box, tp, W, H), avoid);
      }
    }
    // SCALE-2c (REQ-BFG-100, C8; REPORT-SCALE1 1.2, counter-layout.md 6): a reader's running bonus, on the piece itself, your
    // side only, with the switch on (game/counters.ts rampBadges): a red badge at a rig's tile's lower right (its centre +2,
    // +1), or under its gun's C6 box (a gun part, SPALL CATCHER); the bonus its next hit or shot gives
    if (!a.show[0]) return;
    const s0 = a.b.sides[0], slots0 = this.slotsOf(a, 0), f0 = a.drawn[0], deck0 = deckOnScreen(a, m, 0);
    for (const bd of rampBadges(a.b, 0)) {
      const text = `+${fmtCount(bd.bonus)}`, w = boxW(textWidth(text, "3"));
      let ax: number, ay: number, bx: number, by: number, alts: [number, number][];
      if (bd.kind === "rig") {
        const g0 = s0.gates.find((q) => q.uid === bd.ref);
        if (!g0) continue;
        [ax, ay] = m.tileCentre(a, 0, g0.x, g0.y);
        bx = ax + 2;
        by = ay + 1;
        alts = badgeSpots("rig", ax, ay, w);
      } else {
        const sl = slots0[bd.ref];
        if (!sl) continue;
        [ax, ay] = m.localToScreen(a, 0, (sl.col0 + sl.width / 2) * CELL, TURRET_LY);
        const gun = gunBoxAt(ax, ay, w, BOX_H, fwdX(f0), fwdY(f0), deck0);
        bx = gun.x;
        by = gun.y + BOX_H + 1;
        alts = badgeSpots("gun", ax, ay, w, gun);
      }
      let box = keepOnScreen(ax, ay, bx, by, w, BOX_H, W, H);
      if (!box || this.covers(box, keep, m) || d.guns.some((q) => overlap(box!, q.r))) { d.skipped++; continue; }
      // ROWS-1 (REQ-BFG-100; F11): a badge is never drawn on a belt's counter box: drawn after the belts it sat on top of belt 0's second chip on
      // the phone (op690, motion-c1 fight A at 10 s: POWDER KEG's badge over `cnt:belt0:1`, in 764 of that fight's 876 frames; the small phone 855),
      // hiding the chip's count and taking the tap meant for the chip. Where its own place would sit on a belt chip it takes the first other place
      // beside its piece (badgeSpots) that is clear of every chip, bar and badge drawn this frame; with none it is left out (skipped), as a gun's box
      // has always left it out. Every other badge stays exactly where it was
      if (badgeOverChip(box, [], d.belts)) {
        box = null;
        for (const [cx, cy] of alts) {
          const c = keepOnScreen(ax, ay, cx, cy, w, BOX_H, W, H);
          if (c && !this.covers(c, keep, m) && !badgeOverChip(c, d.guns, d.belts) && !d.badges.some((q) => overlap(c, q.r))) { box = c; break; }
        }
        if (!box) { d.skipped++; continue; }
      }
      g.drawImage(this.badgeImage(text), box.x, box.y);
      d.badges.push({ kind: bd.kind, ref: bd.ref, r: box, text });
      const ref = bd.kind === "rig" ? bd.ref : 1000 + bd.ref;
      this.addGroup(game, `${CNT_REGION}piece0:${ref}`, "piece", 0, ref, box, squareAt(box, tp, W, H), avoid);
    }
  }

  private covers(box: Rect, keep: readonly Rect[], m: ArenaMotion): boolean {
    for (const k of keep) if (overlap(box, k)) return true;
    for (const n of m.windDrawn) if (overlap(box, n)) return true;
    return false;
  }

  // ------------------------------------------------------------------------------------------- C1 and C2: the plates

  /**
   * The status rows (C1, C2) on the plates as drawn this frame (`plates`, riding with their carriers in the sail-in), and
   * each plate's tap target (`live`) over its counts: the row's chips, the soak layer's number and the block's pips (C3,
   * C4: tap and hover only), at least a finger's height, grown towards the plate's hull and clear of `avoid`. Returns
   * each side's tab (tooling; the screens keep the wind's numbers clear of the tabs' rows through windKeep).
   */
  drawRows(g: G, game: Game, a: Arena, L: BattleLayout, plates: readonly Rect[], rows: readonly (PlateInfo | null)[], avoid: readonly Rect[], live: boolean): void {
    const d = this.last, tp = tapPx(game.view);
    for (const side of SIDES) {
      const r = plates[side];
      const shown = shownChips(a.b, side, undefined, (b, s, k) => this.readsCount(a, s, k));
      const texts = shown.map((c) => c.chip.text(c.n));
      const below = tabBelow(L.plates[side], L.hulls[side]);
      const tab = statusTab(r, below, texts.map((t) => textWidth(t.num + t.tail, "5")));
      d.tabs[side] = null;
      if (tab) {
        g.drawImage(this.tabImage(shown), tab.x, tab.y);
        d.tabs[side] = { side, r: { x: tab.x, y: tab.y, w: tab.w, h: tab.h }, below, chips: shown.map((c, i) => ({ key: c.chip.key, text: texts[i].num + texts[i].tail, dim: c.dim, x: tab.chips[i].x })) };
      }
      const row = rows[side];
      if (!live || (!tab && !row?.plate && !row?.shield && !(side === 0 && this.record))) continue; // SCALE-2c: C9 taps too
      const base = tab ? union(r, tab) : { ...r };
      this.addGroup(game, `${CNT_REGION}plate${side}`, "plate", side, side, base, plateTarget(base, below, tp, game.H), avoid);
    }
  }

  /** One group's tap target, clear of `avoid` (the existing in-fight targets: the bar's buttons, the replay's BACK). */
  private addGroup(game: Game, id: string, kind: GroupKind, side: Side, ref: number, anchor: Rect, target: Rect, avoid: readonly Rect[]): void {
    let t: Rect | null = target;
    for (const b of avoid) if (t) t = clipOut(t, b);
    if (!t) return;
    const grp: Group = { id, kind, side, ref, anchor, target: t };
    this.groups.push(grp);
    this.last.targets.push({ id, r: t });
    // where finger targets overlap, the tap goes to the group whose box is under it, else the nearest (pickGroup); the tap
    // keeps the group as tapped, so its panel opens even if the count falls to 0 in the very next step
    game.ui.add({
      id, r: t, onTap: () => {
        const p = game.ui.pointer, q = pickGroup(this.groups, p.x, p.y) ?? grp;
        this.open = this.open === q.id ? null : q.id;
        this.kept = this.open ? { grp: q, frames: 0 } : null;
      },
    });
  }

  // ------------------------------------------------------------------------------------------------------- the panel

  /** The entries of a group's panel, from the state now. CNT-DAY (REQ-BFG-100, REQ-BFG-079): each keyword's reminder on
   *  the fight's day (textDay: the day the Battle was built with on the day's hull; none on a fight without it). */
  private entries(grp: Group, a: Arena, rows: readonly (PlateInfo | null)[]): CounterEntry[] {
    const s = a.b.sides[grp.side], day = textDay(a.b);
    if (grp.kind === "belt") return [sentenceEntry(beltText(s.routes[grp.ref]?.ammo.length ?? 0))];
    if (grp.kind === "piece") { // SCALE-2c (C8): the badge's bonus and its count, from the state now
      const bd: RampBadge | undefined = rampBadges(a.b, grp.side).find((q) => (q.kind === "rig" ? q.ref : 1000 + q.ref) === grp.ref);
      if (!bd) return [];
      const own = bd.kind === "rig" && !!s.gates.find((q) => q.uid === bd.ref && q.def.gate?.reads?.count === "ownHits");
      return [sentenceEntry(rampText(bd.bonus, bd.count, bd.kind, own))];
    }
    if (grp.kind === "gun") {
      const tu = s.turrets.find((q) => q.index === grp.ref);
      if (!tu) return [];
      const out = [sentenceEntry(waitingText(slugsWaiting(tu), canJam(tu)))];
      // PAIR-CUE (REQ-BFG-100, REQ-BFG-081, REQ-BFG-089): a gun with a pair reader adds PAIR's reminder, by its keyword key
      const pair = tu.pairing ? pairEntry(day) : null;
      if (pair) out.push(pair);
      return out;
    }
    const out: CounterEntry[] = [];
    for (const c of shownChips(a.b, grp.side, undefined, (b, sd, k) => this.readsCount(a, sd, k))) {
      if (!c.chip.reminder) { if (c.chip.sentence) out.push(sentenceEntry(c.chip.sentence(c.n))); continue; } // SCALE-2c: C7's own words
      const t = c.chip.text(c.n), e = keywordEntry(c.chip.reminder, t.num + t.tail, day);
      if (e) out.push(e);
    }
    const row = rows[grp.side];
    // C3 and C4 by their internal keys (REQ-BFG-107: the glossary's words for them, whatever they are)
    if (row?.plate) { const e = keywordEntry("PLATE", row.plate, day); if (e) out.push(e); }
    if (row?.shield) { const e = keywordEntry("SHIELD", row.shield, day); if (e) out.push(e); }
    if (grp.side === 0 && this.record) out.push(sentenceEntry(recordText(this.record))); // SCALE-2c (C9): your run record
    return out;
  }

  /**
   * The open group's panel (a tap's), else the hovered group's (a resting mouse on the desk): its entries in the build
   * view's definition box (navy, a slate1 top edge; the 5x7 face at the glossary's width), under its group where it fits,
   * else over it, on the screen. A group gone this frame (its count fell to 0, the fight ended) closes its panel.
   */
  drawPanel(g: G, game: Game, a: Arena, rows: readonly (PlateInfo | null)[]): void {
    const d = this.last, ui = game.ui, p = ui.pointer;
    let grp = this.open ? this.groups.find((q) => q.id === this.open) : undefined;
    if (this.open) {
      if (grp) this.kept = { grp, frames: 0 };
      else if (this.kept && this.kept.grp.id === this.open && this.kept.frames++ < OPEN_GRACE) grp = this.kept.grp;
      else { this.open = null; this.kept = null; }
    }
    if (!grp && p.kind === "mouse" && !p.down) {
      // PAIR-CUE (REVIEW-COUNT1 gap 4): a resting mouse shows a group's panel only where that group's target is the topmost
      // region under it (the paused chip, the bar and the cards above a target hide it, as they take its press)
      const id = hoverGroup(ui.regions, p.x, p.y);
      if (id) grp = this.groups.find((q) => q.id === id);
    }
    d.panel = null;
    if (!grp) return;
    const entries = this.entries(grp, a, rows);
    if (!entries.length) return;
    const { W, H } = game, w = Math.min(W - 4, PANEL_W);
    const blocks: { e: CounterEntry; lines: RichLine[] }[] = entries.map((e) => ({ e, lines: definitionLines(e.body, w - 10) }));
    let h = 3;
    for (const b of blocks) h += (b.e.word ? 9 : 0) + b.lines.length * 9 + 2;
    const an = grp.anchor;
    const x = Math.max(2, Math.min(W - w - 2, Math.round(an.x + an.w / 2 - w / 2)));
    let y = an.y + an.h + 2;
    if (y + h > H - 2) y = an.y - 2 - h;
    y = Math.max(2, Math.min(H - h - 2, y));
    const r = { x, y, w, h };
    rect(g, x - 1, y - 1, w + 2, h + 2, C.ink);
    rect(g, x, y, w, h, C.navy);
    rect(g, x, y, w, 1, C.slate1);
    let ty = y + 3;
    const heads: string[] = [], lines: string[] = [];
    for (const b of blocks) {
      if (b.e.word) {
        let hx = x + 5;
        if (b.e.icon) hx += drawText(g, b.e.icon, hx, ty, b.e.colour, { mono: true }) + 2; // drawText returns the width
        hx += drawText(g, b.e.word, hx, ty, b.e.colour) + 4;
        drawText(g, b.e.count, hx, ty, C.white);
        heads.push(`${b.e.word} ${b.e.count}`);
        ty += 9;
      }
      for (const ln of b.lines) {
        drawRich(g, ln, x + 5, ty, "5");
        lines.push(ln.map((sp) => sp.t).join(""));
        ty += 9;
      }
      ty += 2;
    }
    ui.add({ id: CNT_PANEL, r, block: true });
    d.panel = { id: grp.id, r, heads, lines };
  }

  // ------------------------------------------------------------------------------------------------- cached images

  /** A counter box (C5, C6): 1 px ink frame, navy fill, a 1 px slate2 top edge; `icon` then `text` in the 3x5 face, 2 px
   *  in and 2 px down, in `col`, with a 1 px ink outline. Cached by its content. */
  private boxImage(icon: string, text: string, col: string): HTMLCanvasElement {
    const key = `b${icon}${text}${col}`;
    let img = this.cache.get(key);
    if (img) return img;
    const tw = (icon ? textWidth(icon, "3") + 1 : 0) + textWidth(text, "3"), w = boxW(tw);
    const [c, cg] = makeCanvas(w, BOX_H);
    chrome(cg, w, BOX_H);
    let tx = 2;
    if (icon) tx += drawText(cg, icon, tx, 2, col, { font: "3", mono: true, outline: C.ink }) + 1; // drawText returns the width
    drawText(cg, text, tx, 2, col, { font: "3", outline: C.ink });
    edge(cg, w);
    img = this.put(key, c);
    return img;
  }

  /** SCALE-2c (REQ-BFG-100, C8): a reader's badge: 1 px ink frame, red #EF5B4E fill (R1b-2's RAMP badge), its `+n` in the
   *  3x5 face in white with a 1 px ink outline, 2 px in and 2 px down; C5's box size. Cached by its text. */
  private badgeImage(text: string): HTMLCanvasElement {
    const key = `r${text}`;
    let img = this.cache.get(key);
    if (img) return img;
    const w = boxW(textWidth(text, "3"));
    const [c, cg] = makeCanvas(w, BOX_H);
    rect(cg, 0, 0, w, BOX_H, C.ink);
    rect(cg, 1, 1, w - 2, BOX_H - 2, C.red);
    drawText(cg, text, 2, 2, C.white, { font: "3", outline: C.ink });
    img = this.put(key, c);
    return img;
  }

  /** A status tab: the box chrome, each chip its 5x7 icon (its colour), 1 px, its number (its number colour; FRAY's tail in
   *  slate4), 6 px apart, 4 px in; a dimmed chip (a read count at 0) at half strength. Cached by its content. */
  private tabImage(shown: readonly ShownChip[]): HTMLCanvasElement {
    const texts = shown.map((c) => c.chip.text(c.n));
    const key = `t${shown.map((c, i) => `${c.chip.key}${texts[i].num}${texts[i].tail}${c.dim ? "d" : ""}`).join(",")}`;
    let img = this.cache.get(key);
    if (img) return img;
    const tab = statusTab({ x: 0, y: 0, w: 0, h: 0 }, true, texts.map((t) => textWidth(t.num + t.tail, "5")))!;
    const [c, cg] = makeCanvas(tab.w, STATUS_H);
    chrome(cg, tab.w, STATUS_H);
    shown.forEach((ch, i) => {
      const b = tab.chips[i], x = b.x - tab.x;
      cg.globalAlpha = ch.dim ? 0.45 : 1;
      drawText(cg, ch.chip.icon, x, 2, ch.chip.colour, { mono: true, outline: C.ink });
      const nx = b.numX - tab.x + drawText(cg, texts[i].num, b.numX - tab.x, 2, ch.chip.numColour, { outline: C.ink }) + 1; // + its width and the face's 1 px advance
      if (texts[i].tail) drawText(cg, texts[i].tail, nx, 2, C.slate4, { outline: C.ink });
      cg.globalAlpha = 1;
    });
    edge(cg, tab.w);
    img = this.put(key, c);
    return img;
  }

  private put(key: string, c: HTMLCanvasElement): HTMLCanvasElement {
    if (this.cache.size >= CACHE_MAX) this.cache.clear();
    this.cache.set(key, c);
    return c;
  }

  /** Tooling: the cache's size (the cost check reads it). */
  get cached(): number {
    return this.cache.size;
  }
}

/** The counter box style's frame and fill (the plates' dark panel flattened). */
function chrome(g: G, w: number, h: number): void {
  rect(g, 0, 0, w, h, C.ink);
  rect(g, 1, 1, w - 2, h - 2, C.navy);
}

/** The box's 1 px slate2 top edge, drawn last (over the numbers' ink outline). */
function edge(g: G, w: number): void {
  rect(g, 1, 1, w - 2, 1, C.slate2);
}

/** PAIR-CUE (REVIEW-COUNT1 gap 4): the counter group a resting mouse at (x, y) hovers: the topmost region under it (the
 *  UI's regions, last added on top: the frame before's), when that is a counter group's target; the open panel's own
 *  region is looked through (it never sits on its group). Null: none (a block, a button or nothing on top). Pure. */
export function hoverGroup(regions: readonly { id: string; r: Rect }[], x: number, y: number): string | null {
  for (let i = regions.length - 1; i >= 0; i--) {
    const q = regions[i];
    if (q.id === CNT_PANEL || !inside(q.r, x, y)) continue;
    return q.id.startsWith(CNT_REGION) ? q.id : null;
  }
  return null;
}

/** PAIR-CUE (REQ-BFG-100, REQ-BFG-081): a belt's intake cue this frame (PairWatch.drawn, drawn with the world just
 *  before the counters): 1 while it flashes for a pair, else its near-miss glow's strength over GLOW_A (0..1), else 0. */
export function intakeCue(drawn: PairWatch["drawn"], side: Side, route: number): number {
  if (drawn.flashes[side].some((f) => f.route === route)) return 1;
  let a = 0;
  for (const g of drawn.glows[side]) if (g.route === route) a = Math.max(a, g.alpha / GLOW_A);
  return a;
}

/** A 1 px frame round `r`. */
function frameRect(g: G, r: Rect, col: string): void {
  rect(g, r.x, r.y, r.w, 1, col);
  rect(g, r.x, r.y + r.h - 1, r.w, 1, col);
  rect(g, r.x, r.y, 1, r.h, col);
  rect(g, r.x + r.w - 1, r.y, 1, r.h, col);
}

/** PAIR-CUE (REVIEW-COUNT1 ruling 4): `side`'s deck (its 120 x 120 tiles) on screen now, as the counters' anchors are
 *  (ArenaMotion.localToScreen: carrier x board x camera, without the shake). */
export function deckOnScreen(a: Arena, m: Pick<ArenaMotion, "localToScreen">, side: Side): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [lx, ly] of [[0, 0], [DECK, 0], [0, DECK], [DECK, DECK]]) {
    const [x, y] = m.localToScreen(a, side, lx, ly);
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/** ROWS-1 (REQ-BFG-100; F11): does a C8 badge's `box` cover a counter box drawn this frame: a gun's (C6: as it always kept off,
 *  SCALE-2c) or a belt's (C5: new)? The chips are drawn first, so a chip keeps its place, its count and its tap: a badge that
 *  would cover one is not drawn there (drawBoard: badgeSpots, else skipped). Pure (tests). */
export function badgeOverChip(box: Rect, guns: readonly { r: Rect }[], belts: readonly { r: Rect }[]): boolean {
  return guns.some((q) => overlap(box, q.r)) || belts.some((q) => overlap(box, q.r));
}

/** ROWS-1 (REQ-BFG-100; F11): the other places a C8 badge (w wide, BOX_H tall) may take, in order, where its own place (a rig's tile's
 *  lower right: the centre (`ax`, `ay`) +2, +1; a gun part's: under its gun's box) would sit on a belt chip: a rig's, the tile's
 *  upper right, lower left and upper left (2 px off the centre, as its own place is); a gun part's, above its gun's box `gun`.
 *  drawBoard takes the first that is clear. Pure (tests). */
export function badgeSpots(kind: "rig" | "gun", ax: number, ay: number, w: number, gun?: { x: number; y: number }): [number, number][] {
  if (kind === "gun" && gun) return [[gun.x, gun.y - 1 - BOX_H]];
  return [[ax + 2, ay - 1 - BOX_H], [ax - 2 - w, ay + 1], [ax - 2 - w, ay - 1 - BOX_H]];
}

/** Where finger targets overlap, the group a tap at (x, y) means: the one whose box (`anchor`) holds the point, else the
 *  one whose box centre is nearest, among those whose target holds it (later groups win ties); null: none. Pure. */
export function pickGroup<T extends { anchor: Rect; target: Rect }>(groups: readonly T[], x: number, y: number): T | null {
  let best: T | null = null, bd = Infinity;
  for (const q of groups) {
    if (!inside(q.target, x, y)) continue;
    const d = inside(q.anchor, x, y) ? -1 : Math.hypot(x - (q.anchor.x + q.anchor.w / 2), y - (q.anchor.y + q.anchor.h / 2));
    if (d <= bd) { bd = d; best = q; }
  }
  return best;
}

/** A plate group's tap target: the plate and its tab (`base`), at least `tp` px tall, grown towards the plate's hull
 *  (`below`: down), kept on a screen H px high. Pure. */
export function plateTarget(base: Rect, below: boolean, tp: number, H: number): Rect {
  const h = Math.max(base.h, tp);
  const y = below ? base.y : base.y + base.h - h;
  return { x: base.x, y: Math.max(0, Math.min(H - h, y)), w: Math.max(base.w, tp), h };
}

/** A finger's square (tp px) centred on a box, kept on the W x H screen. */
export function squareAt(b: Rect, tp: number, W: number, H: number): Rect {
  const w = Math.max(b.w, tp), h = Math.max(b.h, tp);
  return { x: Math.max(0, Math.min(W - w, Math.round(b.x + b.w / 2 - w / 2))), y: Math.max(0, Math.min(H - h, Math.round(b.y + b.h / 2 - h / 2))), w, h };
}

/** `r` with `b` cut out: the largest of the parts of `r` above, below, left or right of `b` (keywords.ts clipOut's rule);
 *  null where nothing is left. */
export function clipOut(r: Rect, b: Rect): Rect | null {
  if (!overlap(r, b)) return r;
  const cands: Rect[] = [
    { x: r.x, y: r.y, w: r.w, h: b.y - r.y },
    { x: r.x, y: b.y + b.h, w: r.w, h: r.y + r.h - (b.y + b.h) },
    { x: r.x, y: r.y, w: b.x - r.x, h: r.h },
    { x: b.x + b.w, y: r.y, w: r.x + r.w - (b.x + b.w), h: r.h },
  ].filter((q) => q.w > 0 && q.h > 0);
  if (!cands.length) return null;
  return cands.sort((p, q) => q.w * q.h - p.w * p.h)[0];
}

/** The rows the wind's numbers keep clear of (ArenaMotion.windKeep's plates): each plate with its status row's room, a
 *  full STATUS_H on its hull side (the tab's widest), so a wind number never lands under a tab. */
export function plateKeep(L: Pick<BattleLayout, "plates" | "hulls">): Rect[] {
  return SIDES.map((s) => {
    const p = L.plates[s];
    return tabBelow(p, L.hulls[s]) ? { x: p.x, y: p.y, w: p.w, h: p.h + STATUS_H } : { x: p.x, y: p.y - STATUS_H, w: p.w, h: p.h + STATUS_H };
  });
}
