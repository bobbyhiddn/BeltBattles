// Build-phase commands shared by drag-and-drop, tap-to-place and the inspector buttons.
// Every command validates first and only mutates the run when it succeeds.

import type { Game } from "../../game/game";
import {
  buyOffer, storeMod, storePlaced, sellInventory, takeFromInventory, type InvItem, type Run,
} from "../../game/run";
import { CELL, GRID, ITEMS, sellValue } from "../../sim/content";
import { starField, starsOf } from "../../sim/stars";
import { mergePreview, type Gain, type GainAt } from "../../game/fuse";
import { canPlaceItem, key, moveItem, occupancy, placeItem, removeRoute } from "../../sim/deck";
import type { Fx } from "../../render/fx";
import { C } from "../../render/palette";
import { footX, footY, localX, localY } from "../../render/frame";
import { inside } from "../../ui/ui";
import type { BuildLayout, Sel } from "./layout";

export interface Ctx {
  game: Game;
  run: Run;
  L: BuildLayout;
  wfx: Fx; // deck-space effects (screen coordinates)
  ufx: Fx; // UI effects
  select(s: Sel): void;
  turretAt(x: number, y: number): number;
  coinPos(): { x: number; y: number };
  touched(): void; // the build changed: rebuild render caches
  placed(x: number, y: number): void; // successful placement at screen point (thunk + cues)
  invalid(msg: string): void; // refused action: red shake + error
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
  uid: number; // -1 while still on a card
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
    ctx.game.toast(d.supply?.belt ? `+${d.supply.belt} BELT CAPACITY` : `+${d.supply?.hull ?? 0} MAX HULL`, C.lime, "repair");
    ctx.select({ kind: "none" });
    ctx.touched();
  }
  if (res.gain?.steps.length) ctx.touched(); // a merge changed the deck or cargo
  return { ok: true, item: res.item, gain: res.gain };
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

export function sell(ctx: Ctx, uid: number): void {
  if (!ctx.run.inventory.some((i) => i.uid === uid)) return;
  const v = sellInventory(ctx.run, uid);
  const cp = ctx.coinPos();
  ctx.ufx.popup(cp.x, cp.y + 10, `+${v}`, C.lime);
  ctx.game.audio.play("sell");
  ctx.select({ kind: "none" });
}

export function store(ctx: Ctx, uid: number): void {
  if (!storePlaced(ctx.run, uid)) return ctx.invalid("THE SIGNATURE FACTORY STAYS ABOARD");
  ctx.game.audio.play("pickup");
  ctx.select({ kind: "cargo", uid });
  ctx.touched();
}

export function unfitMod(ctx: Ctx, turret: number): void {
  const m = ctx.run.build.mods.find((q) => q.turret === turret);
  if (!m) return;
  storeMod(ctx.run, m.uid);
  ctx.game.audio.play("pickup");
  ctx.select({ kind: "cargo", uid: m.uid });
  ctx.touched();
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
  const lx = localX(L.frame, x, y) - (size - 1) * (CELL / 2), ly = localY(L.frame, x, y) - (size - 1) * (CELL / 2);
  const m = GRID * CELL;
  if (lx < -8 || ly < -8 || lx > m + 8 || ly > m + 8) return null;
  const cx = Math.floor(lx / CELL), cy = Math.floor(ly / CELL);
  return { x: Math.max(0, Math.min(GRID - size, cx)), y: Math.max(0, Math.min(GRID - size, cy)) };
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
  if (inside(L.cargo, x, y)) {
    if (src.from === "offer") {
      const r = buy(ctx, src.wagon, src.slot);
      if (r.item) ctx.select({ kind: "cargo", uid: r.item.uid });
      return r.ok;
    }
    if (src.from === "deck") store(ctx, c.uid);
    else if (src.from === "mod") {
      const m = b.mods.find((q) => q.uid === c.uid);
      if (m) unfitMod(ctx, m.turret);
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
      return true;
    }
  }
  if (def.kind === "mod") {
    const t = ctx.turretAt(x, y);
    if (t < 0) {
      if (overHull) ctx.invalid("DROP TURRET GEAR ON A TURRET");
      return false;
    }
    const cur = b.mods.find((m) => m.turret === t);
    if (cur && cur.uid !== c.uid) {
      ctx.invalid("ONE PIECE OF GEAR PER TURRET");
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
    return true;
  }
  const cell = dropCell(L, x, y, def.size);
  if (!cell) return false;
  const ignore = src.from === "deck" ? c.uid : -1;
  const chk = canPlaceItem(b, c.def, cell.x, cell.y, ignore);
  if (!chk.ok) {
    ctx.invalid(chk.reason ?? "CAN'T PLACE THAT");
    return false;
  }
  let uid = c.uid;
  if (src.from === "offer") {
    const r = buy(ctx, src.wagon, src.slot, { x: cell.x, y: cell.y }); // placed first; a cargo twin merges into it
    if (!r.ok || !r.gain) return false;
    uid = r.gain.survivor;
  } else if (src.from === "cargo") {
    const it = takeFromInventory(run, c.uid);
    if (!it) return false;
    placeItem(b, { uid, def: c.def, x: cell.x, y: cell.y, ...starField(starsOf(it)) }); // moving never fuses
  } else if (src.from === "deck") {
    const r = moveItem(b, uid, cell.x, cell.y);
    if (r.dropped) ctx.game.toast(`${r.dropped} BELT${r.dropped > 1 ? "S" : ""} CUT LOOSE`, C.yellow);
  }
  const f = L.frame;
  const px = footX(f, cell.x, cell.y, def.size) + (def.size * CELL) / 2;
  const py = footY(f, cell.x, cell.y, def.size) + (def.size * CELL) / 2;
  ctx.game.audio.play("place");
  ctx.select({ kind: "item", uid });
  ctx.touched();
  ctx.placed(px, py);
  return true;
}
