// Build-phase commands shared by drag-and-drop, tap-to-place and the inspector buttons.
// Every command validates first and only mutates the run when it succeeds.

import type { Skin } from "../../render/styles"; // CUSTOM-2a (REQ-BFG-072)
import type { Game } from "../../game/game";
import {
  buyOffer, buyUpgrade, rotateRig, storeMod, storePlaced, sellInventory, takeFromInventory, type InvItem, type Run,
} from "../../game/run";
import { REFIT_NO_SHOP, shopShut } from "../../game/run"; // NPC-1 (REQ-BFG-077): REFIT has no shop (NPC_DAY on)
import { CELL, GRID, ITEMS, sellValue, type UpgradeTrack } from "../../sim/content";
import { hullShown } from "../../sim/hullScale"; // HULL-1a (REQ-BFG-079): the ARMOR PACK's toast on the day's hull
import { starField, starsOf } from "../../sim/stars";
import { mergePreview, type Gain, type GainAt } from "../../game/fuse";
import { canPlaceItem, isRig, key, moveItem, occupancy, placeItem, removeRoute, rotField, setRot } from "../../sim/deck";
import { bestRot } from "../../sim/beltside"; // 0.6.2 BELTSIDE: the preview's auto-aim
import { coreFor, gearFor } from "../../sim/deck"; // 0.6.1b
import { fitCore } from "../../game/run"; // 0.6.1b
import { canFitGear, gearSlotsAt, turretSlots, type Build } from "../../sim/deck"; // 0.6.2s (REQ-BFG-031)
import { enchantField } from "../../sim/enchant"; // ENCHANT-1 (REQ-BFG-085): a cargo piece keeps its enchantment on the deck
import { sellAsk } from "./apply"; // ENCHANT-1 (REQ-BFG-085, E4): selling a piece that holds a word asks first
import { dropTurret } from "./turretActions"; // 0.6.2s (REQ-BFG-031 S5)
import { completeTip } from "../../ui/tips"; // EXPLAIN-1 (REQ-BFG-089, E5): a successful action completes its first-run tip

/** HULL-1a (REQ-BFG-079): a supply's toast once bought ("+250 MAX HULL", "+4 BELT CAPACITY"): the hull as the day's
 *  number with HULL_SCALE on (`day`: the run's); off, 0.9.7's. */
export function supplyToast(d: { supply?: { belt?: number; hull?: number } }, day?: number): string {
  return d.supply?.belt ? `+${d.supply.belt} BELT CAPACITY` : `+${hullShown(d.supply?.hull ?? 0, day)} MAX HULL`;
}

/** 0.6.2s (S4): why gear can't go on turret slot t, as a player sentence. */
export function gearRefusal(b: Build, t: number, reason?: string): string {
  if (reason === "EMPTY TURRET SLOT") return "THIS TURRET SLOT IS EMPTY. INSTALL A TURRET FIRST.";
  if (reason === "THIS TURRET ALREADY HAS ONE") return "THIS TURRET ALREADY CARRIES ONE OF THOSE.";
  const n = gearSlotsAt(b, t);
  return n <= 1 ? "ONE PIECE OF GEAR PER TURRET" : `ALL ${n} GEAR SLOTS ON THIS TURRET ARE FULL.`;
}
import type { Fx } from "../../render/fx";
import { C } from "../../render/palette";
import { footX, footY, localX, localY } from "../../render/frame";
import { inside } from "../../ui/ui";
import type { BuildLayout, Sel } from "./layout";
import { toDeck, toScreen } from "./layout"; // ZOOM-1 (REQ-BFG-080): the carrier's own zoom
import { screenRect } from "./layout"; // SHAPES-1 (S3): a cell's size on screen (the finger lift)
import { footBox } from "../../sim/foot"; // SHAPES-1 (REQ-BFG-086 R1): a turned footprint's box
import { boxRect } from "../../render/frame"; // SHAPES-1: a non-square box on screen
import { aimShaped, carriedRot, shapedPiece, snapAnchor, turnFit } from "./shapeEdit"; // SHAPES-1 (S2, S3)
import { snapSplit } from "../../sim/split"; // GATES-1 (REQ-BFG-057): a finger's drop of a gate snaps to a legal belt tile

export interface Ctx {
  game: Game;
  run: Run;
  L: BuildLayout;
  wfx: Fx; // deck-space effects (ZOOM-1: the carrier's space, drawn through its zoom: layout.ts inCarrier)
  ufx: Fx; // UI effects
  select(s: Sel): void;
  turretAt(x: number, y: number): number;
  coinPos(): { x: number; y: number };
  touched(): void; // the build changed: rebuild render caches
  placed(x: number, y: number): void; // successful placement at screen point (thunk + cues)
  invalid(msg: string): void; // refused action: red shake + error
  /** shoptap (D2): the last press was a finger or a pen: the panels offer SELL on the carrier's parts and say how to drag,
   *  and their buttons are a finger's targets. Absent or false: a mouse, the panels as before. */
  readonly touch?: boolean;
  /** CUSTOM-2a (REQ-BFG-072, R11): the player's styles, which the build screen's part panel and its idle forms wear.
   *  Absent: the defaults. */
  readonly skin?: Skin;
}

export type Src =
  | { from: "offer"; wagon: number; slot: number }
  | { from: "cargo"; uid: number }
  | { from: "deck"; uid: number }
  | { from: "mod"; uid: number }
  | { from: "route"; index: number; cell: number }
  | { from: "factory"; uid: number }
  | { from: "turret"; index: number }
  | { from: "mount"; index: number } // 0.6.2s (REQ-BFG-031 S5): an installed turret lifted off TURRET SLOT `index`
  | { from: "cell"; k: number };

export interface Carry {
  src: Src;
  def: string;
  uid: number; // -1 while still on a card
  // 0.6.2 BELTSIDE (B1, B2): a rig's rotation as previewed; the preview aims itself at the hovered cell (the
  // rotation with the most hits, ties keep this one) until R turns it by hand (`manual`)
  rot?: number;
  manual?: boolean;
  /** SHAPES-1 (REQ-BFG-086 S3): a finger or a pen lifted it: a shaped piece's ghost and drop point stand above the finger
   *  (fingerLift), its drop snaps (shapeEdit.ts snapAnchor) and the floating ROTATE button shows. Absent: a mouse. */
  touch?: boolean;
}

/**
 * 0.6.2 BELTSIDE: the rotation a carried rig takes at a deck cell: the one turned by hand, else the one that
 * lands the most arrows on belts there (H2's greedy rule, beltside.ts bestRot), ties keeping the carried
 * rotation. The drag preview and the drop both read this, so what the player sees is what lands.
 */
export function rigRotAt(b: Run["build"], c: Pick<Carry, "def" | "rot" | "manual">, cell: { x: number; y: number }): number {
  if (c.manual) return c.rot ?? 0;
  return bestRot(b, c.def, cell.x, cell.y, c.rot ?? 0).rot;
}

/** 0.6.2 BELTSIDE (B2): tap, ROTATE or R: a placed rig turns a quarter turn clockwise (an X rig faces every side).
 *  SHAPES-1 (REQ-BFG-086 S2): a shaped piece (a long rig, a 2x3 or I3 factory) turns around its anchor to the next turn
 *  that fits there (shapeEdit.ts turnFit); none fits: it stays put and the reason shows. A factory that turns over its
 *  own belts drops them, as a move does. */
export function rotate(ctx: Ctx, uid: number): void {
  const p = ctx.run.build.items.find((q) => q.uid === uid);
  if (p && shapedPiece(p.def)) {
    const t = turnFit(ctx.run.build, uid);
    if (!t.ok) return ctx.invalid(t.reason);
    const r = moveItem(ctx.run.build, uid, p.x, p.y, t.rot);
    if (r.dropped) ctx.game.toast(`${r.dropped} BELT${r.dropped > 1 ? "S" : ""} CUT LOOSE`, C.yellow);
    ctx.game.audio.play("belt");
    ctx.touched();
    completeTip("turn");
    const box = footBox(ITEMS[p.def], t.rot), at = boxRect(ctx.L.frame, p.x, p.y, box.w, box.h);
    ctx.wfx.ring(at.x + at.w / 2, at.y + at.h / 2, 7, C.yellow);
    return;
  }
  if (!p || !isRig(p.def)) return;
  if (!rotateRig(ctx.run, uid)) {
    ctx.game.toast("AN X RIG FACES EVERY SIDE", C.slate4);
    return;
  }
  ctx.game.audio.play("belt");
  ctx.touched();
  completeTip("turn"); // EXPLAIN-1 (E5): a placed rig turned
  const f = ctx.L.frame;
  ctx.wfx.ring(footX(f, p.x, p.y) + CELL / 2, footY(f, p.x, p.y) + CELL / 2, 7, C.yellow);
}

/** Buy a wagon offer. Supplies are consumed on the spot; returns the cargo item when the bought
 *  module ends up in cargo. 0.6.1a: `at` is a drop target (see run.ts buyOffer); merges toast
 *  through run.fuseFx on the build screen. */
export function buy(ctx: Ctx, wagon: number, slot: number, at?: GainAt): { ok: boolean; item?: InvItem; gain?: Gain } {
  const res = buyOffer(ctx.run, wagon, slot, at);
  if (!res.ok) {
    ctx.invalid(res.reason ?? "CAN'T BUY");
    return { ok: false };
  }
  const offer = ctx.run.shop.wagons[wagon].offers[slot];
  const cp = ctx.coinPos();
  ctx.ufx.popup(cp.x, cp.y + 10, `-${offer.price}`, C.yellow);
  ctx.game.audio.play("coin");
  if (res.consumed) {
    const d = ITEMS[res.consumed];
    ctx.game.toast(supplyToast(d, ctx.run.day), C.lime, "repair"); // HULL-1a (REQ-BFG-079): the day's hull
    ctx.select({ kind: "none" });
    ctx.touched();
    completeTip("supply"); // EXPLAIN-1 (E5): a supply bought (used the moment it was bought)
  }
  if (res.gain?.steps.length) ctx.touched(); // a merge changed the deck or cargo
  return { ok: true, item: res.item, gain: res.gain };
}

/**
 * bb-0.8.3 (REQ-BFG-043 D11): the panel's UPGRADE button: the next level of the hero's TURRET SPEED or FACTORY for its
 * price (run.ts buyUpgrade: outside the shop roll, no refund). The gold pops off the purse like any buy, and the panel
 * stays on what was upgraded (its level and its next line change at once).
 */
export function upgrade(ctx: Ctx, track: UpgradeTrack): boolean {
  const res = buyUpgrade(ctx.run, track);
  if (!res.ok) {
    ctx.invalid(res.reason ?? "CAN'T UPGRADE");
    return false;
  }
  const cp = ctx.coinPos();
  ctx.ufx.popup(cp.x, cp.y + 10, `-${res.price}`, C.yellow);
  ctx.game.audio.play("coin");
  ctx.game.toast(`${track === "factory" ? "FACTORY" : "TURRET SPEED"} LEVEL ${res.level}`, C.lime);
  ctx.touched();
  return true;
}

/** Select where a bought module ended up (after a merge it may be a placed twin). */
export function selectGain(ctx: Ctx, g: Gain): void {
  if (g.where === "cargo") ctx.select({ kind: "cargo", uid: g.survivor });
  else if (g.where === "deck") ctx.select({ kind: "item", uid: g.survivor });
  else {
    const m = ctx.run.build.mods.find((q) => q.uid === g.survivor);
    if (m) ctx.select({ kind: "turret", index: m.turret });
  }
}

export function sell(ctx: Ctx, uid: number, asked = false): void {
  if (shopShut(ctx.run)) return ctx.invalid(REFIT_NO_SHOP); // NPC-1 (REQ-BFG-077): no selling in REFIT (NPC_DAY on)
  if (!ctx.run.inventory.some((i) => i.uid === uid)) return;
  if (!asked && sellAsk(ctx, { kind: "cargo", uid })) return; // ENCHANT-1 (REQ-BFG-085, E4): a piece that holds a word asks first (SELL? FIERY IS LOST); a second press sells
  const v = sellInventory(ctx.run, uid);
  const cp = ctx.coinPos();
  ctx.ufx.popup(cp.x, cp.y + 10, `+${v}`, C.lime);
  ctx.game.audio.play("sell");
  ctx.select({ kind: "none" });
}

/** U2c step 5 (REQ-BFG-046; T1 2.2's notice form): the refusal's toast when the signature factory would leave the deck
 *  (TO CARGO, SELL): was "THE SIGNATURE FACTORY STAYS ABOARD", the same meaning. */
export const STAYS_ABOARD = "STAYS ABOARD: THE SIGNATURE FACTORY.";

export function store(ctx: Ctx, uid: number): void {
  if (!storePlaced(ctx.run, uid)) return ctx.invalid(STAYS_ABOARD);
  ctx.game.audio.play("pickup");
  ctx.select({ kind: "cargo", uid });
  ctx.touched();
}

/** shoptap (D2, REQ-BFG-035): SELL on a placed part's panel (touch): it leaves the deck as TO CARGO takes it (a
 *  factory's belts go with it) and sells from cargo at its cargo price (sellValue at its stars). Nothing else changes; the
 *  signature factory stays aboard. */
export function sellPlaced(ctx: Ctx, uid: number): void {
  if (shopShut(ctx.run)) return ctx.invalid(REFIT_NO_SHOP); // NPC-1: refused before the part leaves the deck
  if (sellAsk(ctx, { kind: "item", uid })) return; // ENCHANT-1 (REQ-BFG-085, E4): asks first, before the part leaves the deck
  if (!storePlaced(ctx.run, uid)) return ctx.invalid(STAYS_ABOARD);
  ctx.touched();
  sell(ctx, uid, true);
}

/** shoptap (REQ-BFG-035): TO CARGO on a fitted core's or gear piece's panel: that piece goes to cargo (REMOVE CORE's and
 *  REMOVE GEAR's path, for this piece), selected there. */
export function storeFitted(ctx: Ctx, uid: number): void {
  if (!storeMod(ctx.run, uid)) return;
  ctx.game.audio.play("pickup");
  ctx.select({ kind: "cargo", uid });
  ctx.touched();
}

/** shoptap (REQ-BFG-035): SELL on a fitted core's or gear piece's panel: to cargo, then sold at its cargo price; its
 *  turret is selected again. */
export function sellFitted(ctx: Ctx, uid: number): void {
  if (shopShut(ctx.run)) return ctx.invalid(REFIT_NO_SHOP); // NPC-1: refused before the piece leaves its turret
  const m = ctx.run.build.mods.find((q) => q.uid === uid);
  if (!m || !storeMod(ctx.run, uid)) return;
  ctx.touched();
  sell(ctx, uid);
  ctx.select({ kind: "turret", index: m.turret });
}

/** REMOVE GEAR: the turret's gear goes to cargo (0.6.1b: its gear, never its core). */
export function unfitMod(ctx: Ctx, turret: number): void {
  const m = gearFor(ctx.run.build, turret);
  if (!m) return;
  storeMod(ctx.run, m.uid);
  ctx.game.audio.play("pickup");
  ctx.select({ kind: "cargo", uid: m.uid });
  ctx.touched();
}

/** 0.6.1b, REMOVE CORE: the turret's bought core goes to cargo, and the turret falls back to its signature core. */
export function unfitCore(ctx: Ctx, turret: number): void {
  const m = coreFor(ctx.run.build, turret);
  if (!m) return;
  storeMod(ctx.run, m.uid);
  ctx.game.audio.play("pickup");
  ctx.select({ kind: "cargo", uid: m.uid });
  ctx.touched();
}

/** 0.6.1b: a turret core dropped on a turret (from an offer, cargo or another socket). A bought core already in
 *  that socket goes to cargo with a "pickup" sound: a swap, not the gear rule. Moving never fuses. */
function dropCore(ctx: Ctx, c: Carry, x: number, y: number, overHull: boolean): boolean {
  const { run } = ctx;
  const src = c.src;
  const t = ctx.turretAt(x, y);
  if (t < 0) {
    if (overHull) ctx.invalid("DROP A TURRET CORE ON A TURRET");
    return false;
  }
  if (!turretSlots(run.build)[t]?.turret) { // 0.6.2s (S4): an empty TURRET SLOT has no core socket
    ctx.invalid("THIS TURRET SLOT IS EMPTY. INSTALL A TURRET FIRST.");
    return false;
  }
  const old = coreFor(run.build, t);
  const swap = !!old && old.uid !== c.uid;
  if (src.from === "offer") {
    const r = buy(ctx, src.wagon, src.slot, { turret: t }); // fitted first (a swap); a cargo twin merges into it
    if (!r.ok) return false;
  } else if (!fitCore(run, c.uid, t)) return false;
  ctx.game.audio.play(swap ? "pickup" : "repair");
  ctx.select({ kind: "turret", index: t });
  ctx.touched();
  ctx.placed(x, y);
  completeTip("fit"); // EXPLAIN-1 (E5): a core fitted to a turret
  return true;
}

export function deleteRoute(ctx: Ctx, index: number): void {
  if (!ctx.run.build.routes[index]) return;
  removeRoute(ctx.run.build, index);
  ctx.game.audio.play("sell");
  ctx.select({ kind: "none" });
  ctx.touched();
}

/** 0.6.1a: sellValue(def, stars) = max(1, floor(valueOf / 2)). */
export function sellPrice(defId: string, stars = 1): number {
  return sellValue(defId, stars);
}

/** Deck cell for an item of the given footprint centred under a screen point. */
export function dropCell(L: BuildLayout, x: number, y: number, size: number): { x: number; y: number } | null {
  ({ x, y } = toDeck(L, x, y)); // ZOOM-1 (REQ-BFG-080): the screen point in the carrier's space
  const lx = localX(L.frame, x, y) - (size - 1) * (CELL / 2), ly = localY(L.frame, x, y) - (size - 1) * (CELL / 2);
  const m = GRID * CELL;
  if (lx < -8 || ly < -8 || lx > m + 8 || ly > m + 8) return null;
  const cx = Math.floor(lx / CELL), cy = Math.floor(ly / CELL);
  return { x: Math.max(0, Math.min(GRID - size, cx)), y: Math.max(0, Math.min(GRID - size, cy)) };
}

/** SHAPES-1 (REQ-BFG-086 R1): dropCell for a turned footprint: the anchor (the top-left of its box, `w` cells along x
 *  and `h` along y: footBox) with the box centred under a screen point, kept on the deck as dropCell keeps a square. */
export function dropAnchor(L: BuildLayout, x: number, y: number, defId: string, rot: number): { x: number; y: number } | null {
  const { w, h } = footBox(ITEMS[defId], rot);
  ({ x, y } = toDeck(L, x, y));
  const lx = localX(L.frame, x, y) - (w - 1) * (CELL / 2), ly = localY(L.frame, x, y) - (h - 1) * (CELL / 2);
  const m = GRID * CELL;
  if (lx < -8 || ly < -8 || lx > m + 8 || ly > m + 8) return null;
  const cx = Math.floor(lx / CELL), cy = Math.floor(ly / CELL);
  return { x: Math.max(0, Math.min(GRID - w, cx)), y: Math.max(0, Math.min(GRID - h, cy)) };
}

/** SHAPES-1 (S3): how far (screen px) above a finger a touch-carried shaped piece's ghost, and so its drop point, stands:
 *  half the ghost's height on screen plus 1.5 cells, so the finger doesn't hide it. */
export function fingerLift(L: BuildLayout, defId: string, rot: number): number {
  const { w, h } = footBox(ITEMS[defId], rot);
  const cell = screenRect(L, { x: 0, y: 0, w: CELL, h: CELL }).h;
  const tall = L.frame.facing === 0 || L.frame.facing === 2 ? h : w;
  return (tall / 2 + 1.5) * cell;
}

/** SHAPES-1 (S2, S3): where a carried deck piece would land for a pointer at (x, y): its anchor, its rot, and whether it
 *  fits there (else why). One function for the preview (cues.ts drawCarry) and the drop, so what shows is what lands. */
export interface CarryTarget {
  x: number;
  y: number;
  rot: number;
  ok: boolean;
  reason?: string;
  /** a shaped piece's drop point on screen (above the finger on touch). */
  px: number;
  py: number;
}

/**
 * SHAPES-1: the carried piece's target. A 1-cell rig and a 2x2 factory: 0.9.9's (dropCell at its size; a rig at
 * rigRotAt's rot; no snap). A shaped piece: its rot as carried (a long rig's auto-aim or hand turn, edit.ts aim; a factory's
 * hand turn), its box centred under the point (fingerLift above a finger), and on touch the snap to the nearest legal
 * anchor within 1 cell (shapeEdit.ts snapAnchor). null: off the deck.
 */
export function carryTarget(L: BuildLayout, b: Run["build"], c: Carry, x: number, y: number): CarryTarget | null {
  const def = ITEMS[c.def];
  const ignore = c.src.from === "deck" ? c.uid : -1;
  if (def.kind === "converter") { // GATES-1 (REQ-BFG-057): a gate goes only ON a belt tile; a finger's drop stands above the finger and snaps
    const py = c.touch ? y - fingerLift(L, c.def, 0) : y; // to the nearest legal belt tile within 1 cell (split.ts snapSplit); a mouse's doesn't
    const cell = dropCell(L, x, py, 1);
    if (!cell) return null;
    const at = (c.touch ? snapSplit(b, c.def, cell.x, cell.y, ignore) : null) ?? cell;
    const chk = canPlaceItem(b, c.def, at.x, at.y, ignore);
    return { ...at, rot: 0, ok: chk.ok, ...(chk.reason ? { reason: chk.reason } : {}), px: x, py };
  }
  if (!shapedPiece(c.def)) {
    const cell = dropCell(L, x, y, def.size);
    if (!cell) return null;
    const rot = isRig(c.def) ? rigRotAt(b, c, cell) : 0;
    const chk = canPlaceItem(b, c.def, cell.x, cell.y, ignore);
    return { ...cell, rot, ok: chk.ok, ...(chk.reason ? { reason: chk.reason } : {}), px: x, py: y };
  }
  // a long rig placed with no turn yet (a click on the deck with its card selected) aims itself where it lands, as B1's
  // rigRotAt does for a 1-cell rig (aimCarry asks again with each rot set, so this runs once)
  const rot = c.rot === undefined && !c.manual && isRig(c.def) ? aimCarry(L, b, { ...c, rot: 0 }, x, y) ?? 0 : carriedRot(c.def, c.rot);
  const py = c.touch ? y - fingerLift(L, c.def, rot) : y;
  const a = dropAnchor(L, x, py, c.def, rot);
  if (!a) return null;
  const snap = c.touch ? snapAnchor(b, c.def, a.x, a.y, rot, ignore) : null;
  const at = snap ?? a;
  const chk = canPlaceItem(b, c.def, at.x, at.y, ignore, rot);
  return { x: at.x, y: at.y, rot, ok: chk.ok, ...(chk.reason ? { reason: chk.reason } : {}), px: x, py };
}

/** SHAPES-1 (S2): a carried shaped rig's auto-aim at a pointer (B1's, extended): the turn with the most hits where it
 *  would land (aimShaped over carryTarget's anchors), unless turned by hand. */
export function aimCarry(L: BuildLayout, b: Run["build"], c: Carry, x: number, y: number): number | undefined {
  if (c.manual || !isRig(c.def) || !shapedPiece(c.def)) return undefined;
  const ignore = c.src.from === "deck" ? c.uid : -1;
  return aimShaped(b, c.def, c.rot ?? 0, (rot) => {
    const t = carryTarget(L, b, { ...c, rot }, x, y);
    return t ? { x: t.x, y: t.y } : null;
  }, ignore);
}

/** Is (x, y) a belt tile of the build? */
export function onBelt(run: Run, x: number, y: number): boolean {
  return occupancy(run.build)[key(x, y)].route >= 0;
}

/** Place / fit / store what is carried at a screen point. Returns false when refused. */
export function drop(ctx: Ctx, c: Carry, x: number, y: number): boolean {
  const { run, L } = ctx;
  const b = run.build;
  const def = ITEMS[c.def];
  const src = c.src;
  if (def.kind === "turret") return dropTurret(ctx, c, x, y); // 0.6.2s (REQ-BFG-031 S5): install, swap, move, store
  if (inside(L.cargo, x, y)) {
    if (src.from === "offer") {
      const r = buy(ctx, src.wagon, src.slot);
      if (r.item) ctx.select({ kind: "cargo", uid: r.item.uid });
      return r.ok;
    }
    if (src.from === "deck") store(ctx, c.uid);
    else if (src.from === "mod") {
      const m = b.mods.find((q) => q.uid === c.uid);
      if (m && def.kind === "core") unfitCore(ctx, m.turret); // 0.6.1b
      else if (m) unfitMod(ctx, m.turret);
    }
    return true;
  }
  const overHull = inside(L.hull, x, y);
  if (def.kind === "supply") {
    if (src.from === "offer" && overHull) return buy(ctx, src.wagon, src.slot).ok;
    return false;
  }
  // 0.6.1a: an offer that would merge into a placed twin is a buy plus a merge; the target doesn't matter
  if (src.from === "offer") {
    const pv = mergePreview(run, c.def);
    if (pv && pv.where !== "cargo") {
      const r = buy(ctx, src.wagon, src.slot);
      if (!r.ok || !r.gain) return false;
      selectGain(ctx, r.gain);
      ctx.touched();
      ctx.placed(x, y);
      completeTip(def.kind === "core" || def.kind === "mod" ? "fit" : "place"); // EXPLAIN-1 (E5): dropped where it merged
      return true;
    }
  }
  if (def.kind === "core") return dropCore(ctx, c, x, y, overHull); // 0.6.1b: the core socket
  if (def.kind === "mod") {
    const t = ctx.turretAt(x, y);
    if (t < 0) {
      if (overHull) ctx.invalid("DROP TURRET GEAR ON A TURRET");
      return false;
    }
    // 0.6.1b: the hardpoints only; a core in the socket doesn't take one. 0.6.2s (REQ-BFG-031 S4): a turret has
    // gearSlotsAt GEAR SLOTS (rarity + stars), holds one copy of a def, and an empty TURRET SLOT holds no gear
    const fit = canFitGear(b, t, c.def, c.uid);
    if (!fit.ok) {
      ctx.invalid(gearRefusal(b, t, fit.reason));
      return false;
    }
    if (src.from === "offer") {
      const r = buy(ctx, src.wagon, src.slot, { turret: t }); // fitted first; a cargo twin merges into it
      if (!r.ok) return false;
    } else if (src.from === "cargo") {
      const it = takeFromInventory(run, c.uid);
      if (!it) return false;
      b.mods.push({ uid: it.uid, def: it.def, turret: t, ...starField(starsOf(it)) }); // moving never fuses
    } else if (src.from === "mod") {
      const m = b.mods.find((q) => q.uid === c.uid);
      if (m) m.turret = t;
    }
    ctx.game.audio.play("repair");
    ctx.select({ kind: "turret", index: t });
    ctx.touched();
    ctx.placed(x, y);
    completeTip("fit"); // EXPLAIN-1 (E5): a piece of gear fitted to a turret
    return true;
  }
  // SHAPES-1 (REQ-BFG-086 S2, S3): carryTarget, the preview's own target (a 1-cell rig and a 2x2 factory: 0.9.9's
  // dropCell, canPlaceItem and rigRotAt, unchanged)
  const tgt = carryTarget(L, b, c, x, y);
  if (!tgt) return false;
  const cell = { x: tgt.x, y: tgt.y };
  if (!tgt.ok) {
    ctx.invalid(tgt.reason ?? "CAN'T PLACE THAT");
    return false;
  }
  // 0.6.2 BELTSIDE: a rig lands at the rotation its preview showed (B1). SHAPES-1: a shaped piece at its carried rot
  const rot = tgt.rot;
  const shaped = shapedPiece(c.def);
  let uid = c.uid;
  if (src.from === "offer") {
    const r = buy(ctx, src.wagon, src.slot, { x: cell.x, y: cell.y, rot }); // placed first; a cargo twin merges into it
    if (!r.ok || !r.gain) return false;
    uid = r.gain.survivor;
  } else if (src.from === "cargo") {
    const it = takeFromInventory(run, c.uid);
    if (!it) return false;
    placeItem(b, { uid, def: c.def, x: cell.x, y: cell.y, ...starField(starsOf(it)), ...rotField(c.def, rot), ...enchantField(it) }); // moving never fuses; ENCHANT-1: nor does it drop the word
  } else if (src.from === "deck") {
    // SHAPES-1 (S2): a shaped piece moves and turns at once (its new cells decide which of a factory's belts it keeps)
    const r = shaped ? moveItem(b, uid, cell.x, cell.y, rot) : moveItem(b, uid, cell.x, cell.y);
    if (r.dropped) ctx.game.toast(`${r.dropped} BELT${r.dropped > 1 ? "S" : ""} CUT LOOSE`, C.yellow);
    const p = b.items.find((q) => q.uid === uid);
    if (p && isRig(p.def) && !shaped) setRot(p, rot);
  }
  const f = L.frame;
  const box = shaped ? boxRect(f, cell.x, cell.y, footBox(def, rot).w, footBox(def, rot).h) : null; // SHAPES-1: its box's centre
  const px = box ? box.x + box.w / 2 : footX(f, cell.x, cell.y, def.size) + (def.size * CELL) / 2;
  const py = box ? box.y + box.h / 2 : footY(f, cell.x, cell.y, def.size) + (def.size * CELL) / 2;
  ctx.game.audio.play("place");
  ctx.select({ kind: "item", uid });
  ctx.touched();
  const at = toScreen(L, px, py); // ZOOM-1: placed() takes a screen point, as from a drop
  ctx.placed(at.x, at.y);
  completeTip(src.from === "deck" ? "move" : "place"); // EXPLAIN-1 (E5): a part placed on the deck, or a placed one moved
  return true;
}
