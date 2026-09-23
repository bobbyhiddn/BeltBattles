// Build-phase commands shared by drag-and-drop and the inspector buttons. Every command
// validates first and only mutates the run when it succeeds.

import type { Game } from "../../game/game";
import {
  buyOffer, storeMod, storePlaced, sellInventory, takeFromInventory, type InvItem, type Run,
} from "../../game/run";
import { CELL, GRID, ITEMS, sellValue } from "../../sim/content";
import { canPlaceItem, moveItem, placeItem, removeRoute } from "../../sim/deck";
import type { Fx } from "../../render/fx";
import { C } from "../../render/palette";
import { DECK_X, FWD_Y, footTL } from "../../render/world";
import { inside } from "../../ui/ui";
import type { BuildLayout, Sel } from "./layout";

export interface Ctx {
  game: Game;
  run: Run;
  L: BuildLayout;
  wfx: Fx; // world-space effects
  ufx: Fx; // screen-space effects
  select(s: Sel): void;
  turretAt(x: number, y: number): number;
  coinPos(): { x: number; y: number };
}

export type Src =
  | { from: "offer"; wagon: number; slot: number }
  | { from: "cargo"; uid: number }
  | { from: "deck"; uid: number }
  | { from: "mod"; uid: number }
  | { from: "route"; index: number; cell: number }
  | { from: "factory"; uid: number }
  | { from: "turret"; index: number }
  | { from: "cell"; k: number };

export interface Carry {
  src: Src;
  def: string;
  uid: number; // -1 while still in a wagon
}

/** Buy a wagon offer. Supplies are consumed on the spot; returns the new cargo item. */
export function buy(ctx: Ctx, wagon: number, slot: number): { ok: boolean; item?: InvItem } {
  const res = buyOffer(ctx.run, wagon, slot);
  if (!res.ok) {
    ctx.game.error(res.reason ?? "CAN'T BUY");
    return { ok: false };
  }
  const offer = ctx.run.shop.wagons[wagon].offers[slot];
  const cp = ctx.coinPos();
  ctx.ufx.popup(cp.x, cp.y + 10, `-${offer.price}`, C.yellow);
  ctx.game.audio.play("coin");
  if (res.consumed) {
    const d = ITEMS[res.consumed];
    ctx.game.toast(d.supply?.belt ? `+${d.supply.belt} BELT CAPACITY` : `+${d.supply?.hull ?? 0} MAX HULL`, C.lime, "repair");
    ctx.select({ kind: "none" });
  }
  return { ok: true, item: res.item };
}

export function sell(ctx: Ctx, uid: number): void {
  const it = ctx.run.inventory.find((i) => i.uid === uid);
  if (!it) return;
  const v = sellInventory(ctx.run, uid);
  const cp = ctx.coinPos();
  ctx.ufx.popup(cp.x, cp.y + 10, `+${v}`, C.lime);
  ctx.game.audio.play("sell");
  ctx.select({ kind: "none" });
}

export function store(ctx: Ctx, uid: number): void {
  if (!storePlaced(ctx.run, uid)) {
    ctx.game.error("THE SIGNATURE FACTORY STAYS ABOARD");
    return;
  }
  ctx.game.audio.play("pickup");
  ctx.select({ kind: "cargo", uid });
}

export function unfitMod(ctx: Ctx, turret: number): void {
  const m = ctx.run.build.mods.find((q) => q.turret === turret);
  if (!m) return;
  storeMod(ctx.run, m.uid);
  ctx.game.audio.play("pickup");
  ctx.select({ kind: "cargo", uid: m.uid });
}

export function deleteRoute(ctx: Ctx, index: number): void {
  if (!ctx.run.build.routes[index]) return;
  removeRoute(ctx.run.build, index);
  ctx.game.audio.play("sell");
  ctx.select({ kind: "none" });
}

export function sellPrice(defId: string): number {
  return sellValue(ITEMS[defId]);
}

/** Deck cell under a screen point for an item of the given footprint (centred on it). */
export function dropCell(L: BuildLayout, x: number, y: number, size: number): { x: number; y: number } | null {
  const lx = x - L.ox - DECK_X, ly = y - L.oy - FWD_Y;
  if (lx < -8 || ly < -8 || lx > GRID * CELL + 8 || ly > GRID * CELL + 8) return null;
  const cx = Math.floor(lx / CELL - (size - 1) / 2), cy = Math.floor(ly / CELL - (size - 1) / 2);
  return { x: Math.max(0, Math.min(GRID - size, cx)), y: Math.max(0, Math.min(GRID - size, cy)) };
}

/** Resolve a drag-and-drop. Invalid drops leave everything where it was. */
export function drop(ctx: Ctx, c: Carry, x: number, y: number): void {
  const { run, L, game } = ctx;
  const b = run.build;
  const def = ITEMS[c.def];
  const src = c.src;
  if (inside(L.cargo, x, y)) {
    if (src.from === "offer") {
      const r = buy(ctx, src.wagon, src.slot);
      if (r.item) ctx.select({ kind: "cargo", uid: r.item.uid });
    } else if (src.from === "deck") store(ctx, c.uid);
    else if (src.from === "mod") {
      const m = b.mods.find((q) => q.uid === c.uid);
      if (m) unfitMod(ctx, m.turret);
    }
    return;
  }
  const overHull = inside(L.hull, x, y);
  if (def.kind === "supply") {
    if (src.from === "offer" && overHull) buy(ctx, src.wagon, src.slot);
    return;
  }
  if (def.kind === "mod") {
    const t = ctx.turretAt(x, y);
    if (t < 0) {
      if (overHull) game.error("DROP TURRET GEAR ON A TURRET");
      return;
    }
    const cur = b.mods.find((m) => m.turret === t);
    if (cur && cur.uid !== c.uid) {
      game.error("ONE PIECE OF GEAR PER TURRET");
      return;
    }
    if (src.from === "offer") {
      const r = buy(ctx, src.wagon, src.slot);
      if (!r.item) return;
      takeFromInventory(run, r.item.uid);
      b.mods.push({ uid: r.item.uid, def: r.item.def, turret: t });
    } else if (src.from === "cargo") {
      const it = takeFromInventory(run, c.uid);
      if (!it) return;
      b.mods.push({ uid: it.uid, def: it.def, turret: t });
    } else if (src.from === "mod") {
      const m = b.mods.find((q) => q.uid === c.uid);
      if (m) m.turret = t;
    }
    game.audio.play("repair");
    ctx.select({ kind: "turret", index: t });
    return;
  }
  const cell = dropCell(L, x, y, def.size);
  if (!cell) return;
  const ignore = src.from === "deck" ? c.uid : -1;
  const chk = canPlaceItem(b, c.def, cell.x, cell.y, ignore);
  if (!chk.ok) {
    game.error(chk.reason ?? "CAN'T PLACE THAT");
    return;
  }
  let uid = c.uid;
  if (src.from === "offer") {
    const r = buy(ctx, src.wagon, src.slot);
    if (!r.item) return;
    takeFromInventory(run, r.item.uid);
    uid = r.item.uid;
    placeItem(b, { uid, def: c.def, x: cell.x, y: cell.y });
  } else if (src.from === "cargo") {
    const it = takeFromInventory(run, c.uid);
    if (!it) return;
    placeItem(b, { uid, def: c.def, x: cell.x, y: cell.y });
  } else if (src.from === "deck") {
    const r = moveItem(b, uid, cell.x, cell.y);
    if (r.dropped) game.toast(`${r.dropped} BELT${r.dropped > 1 ? "S" : ""} CUT LOOSE`, C.yellow);
  }
  const tl = footTL(0, cell.x, cell.y, def.size);
  const cx = tl.x + (def.size * CELL) / 2, cy = tl.y + (def.size * CELL) / 2;
  ctx.wfx.dust(cx, cy + 4, 8, -10);
  ctx.wfx.sparkle(cx, cy - 2, 0.05);
  game.audio.play("place");
  ctx.select({ kind: "item", uid });
}
