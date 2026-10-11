// 0.6.2s (REQ-BFG-031 S5, S10): build-screen commands for TURRETS between the shop, cargo and the hull's TURRET
// SLOTS: drag (or tap) a turret onto an empty slot to install it, onto an occupied slot to swap (the old turret goes
// to cargo), an installed turret onto another slot to move or swap, onto cargo to store it; sell one from cargo or
// a slot. deck.ts does the work (installTurret, moveTurret, removeTurret via run.ts); this file adds the player's
// feedback: sounds, the selection, and which belt a swap left without an intake (it blocks FIGHT until fixed).

import { buyOffer, installFromCargo, moveInstalled, sellInstalled, storeTurret } from "../../game/run";
import { ITEMS } from "../../sim/content";
import { deadEndsAt, turretSlots, type TurretOpResult } from "../../sim/deck";
import { C } from "../../render/palette";
import { inside } from "../../ui/ui";
import type { Carry, Ctx } from "./actions";
import { completeTip } from "../../ui/tips"; // EXPLAIN-1 (REQ-BFG-089, E5): a successful action completes its first-run tip

/** A turret operation's refusal (deck.ts / run.ts reasons) as a player sentence. */
function refusal(reason?: string): string {
  if (reason === "NO SUCH TURRET SLOT") return "DROP A TURRET ON A TURRET SLOT";
  if (reason === "EMPTY TURRET SLOT") return "THIS TURRET SLOT IS EMPTY";
  return reason ?? "CAN'T DO THAT";
}

/** The belts that the change at `slots` left ending where no intake takes them (route indices, sorted). */
export function deadEndsAfter(ctx: Ctx, slots: number[]): number[] {
  const b = ctx.run.build;
  return [...new Set(slots.flatMap((t) => deadEndsAt(b, t)))].sort((x, y) => x - y);
}

/** One toast for a finished turret operation: a new dead end first (it blocks FIGHT), else what went to cargo. */
function report(ctx: Ctx, r: TurretOpResult, slots: number[]): void {
  const dead = deadEndsAfter(ctx, slots);
  if (dead.length) {
    ctx.game.toast(`BELT ${dead.map((i) => i + 1).join(" AND ")} IS A DEAD END NOW`, C.amber);
    return;
  }
  const back = r.turrets.length + r.mods.length;
  if (r.turrets.length) ctx.game.toast(`${ITEMS[r.turrets[0].def].name} WENT TO CARGO`, C.yellow);
  else if (back) ctx.game.toast(`${back} PART${back > 1 ? "S" : ""} WENT TO CARGO`, C.yellow);
}

/** Install cargo turret `uid` in slot t (a swap when the slot is occupied). */
export function installAt(ctx: Ctx, uid: number, t: number, x: number, y: number): boolean {
  const r = installFromCargo(ctx.run, uid, t);
  if (!r.ok) {
    ctx.invalid(refusal(r.reason));
    return false;
  }
  ctx.game.audio.play(r.turrets.length ? "pickup" : "place");
  report(ctx, r, [t]);
  ctx.select({ kind: "turret", index: t });
  ctx.touched();
  ctx.placed(x, y);
  completeTip("install"); // EXPLAIN-1 (E5): a turret installed in a slot
  return true;
}

/** Move the turret in slot `from` to slot `to` (a swap when `to` is occupied). */
export function moveTo(ctx: Ctx, from: number, to: number, x: number, y: number): boolean {
  if (from !== to) {
    const r = moveInstalled(ctx.run, from, to);
    if (!r.ok) {
      ctx.invalid(refusal(r.reason));
      return false;
    }
    ctx.game.audio.play("place");
    report(ctx, r, [from, to]);
    ctx.touched();
    ctx.placed(x, y);
    completeTip("swap"); // EXPLAIN-1 (E5): an installed turret moved or swapped to another slot
  }
  ctx.select({ kind: "turret", index: to });
  return true;
}

/** TO CARGO: the turret in slot t goes to cargo; its slot's core and gear go too (an empty slot holds none). */
export function storeTurretAt(ctx: Ctx, t: number): boolean {
  const r = storeTurret(ctx.run, t);
  if (!r.ok) {
    ctx.invalid(refusal(r.reason));
    return false;
  }
  ctx.game.audio.play("pickup");
  report(ctx, { ...r, turrets: [] }, [t]);
  if (r.turrets[0]) ctx.select({ kind: "cargo", uid: r.turrets[0].uid });
  ctx.touched();
  return true;
}

/** SELL: the turret in slot t for its sell value (S7); its slot's core and gear go to cargo. */
export function sellTurretAt(ctx: Ctx, t: number): boolean {
  const v = sellInstalled(ctx.run, t);
  if (v <= 0) {
    ctx.invalid(turretSlots(ctx.run.build)[t]?.turret ? "A STARTING TURRET AT 1 STAR CAN'T BE SOLD" : "THIS TURRET SLOT IS EMPTY");
    return false;
  }
  const cp = ctx.coinPos();
  ctx.ufx.popup(cp.x, cp.y + 10, `+${v}`, C.lime);
  ctx.game.audio.play("sell");
  report(ctx, { ok: true, turrets: [], mods: [] }, [t]);
  ctx.select({ kind: "turret", index: t });
  ctx.touched();
  return true;
}

/** Buy turret offer (wagon, slot); dropped on TURRET SLOT t (-1: onto cargo) it installs there, unless the bought
 *  copy merged into one the player owns (S6: the result stays where that copy is). */
function buyTurret(ctx: Ctx, wagon: number, slot: number, t: number, x: number, y: number): boolean {
  const res = buyOffer(ctx.run, wagon, slot);
  if (!res.ok || !res.gain) {
    ctx.invalid(res.reason ?? "CAN'T BUY");
    return false;
  }
  const price = ctx.run.shop.wagons[wagon].offers[slot].price;
  const cp = ctx.coinPos();
  ctx.ufx.popup(cp.x, cp.y + 10, `-${price}`, C.yellow);
  ctx.game.audio.play("coin");
  const g = res.gain;
  if (g.where === "cargo" && t >= 0) return installAt(ctx, g.survivor, t, x, y);
  if (g.where === "slot") {
    const s = turretSlots(ctx.run.build).find((q) => q.turret?.uid === g.survivor);
    if (s) ctx.select({ kind: "turret", index: s.slot });
  } else ctx.select({ kind: "cargo", uid: g.survivor });
  ctx.touched();
  if (t >= 0) ctx.placed(x, y);
  if (t >= 0) completeTip("install"); // EXPLAIN-1 (E5): bought onto a slot (it merged into a copy the player owns)
  return true;
}

/** Drop a carried turret (a shop offer, a cargo copy, or an installed one lifted off its slot) at a screen point. */
export function dropTurret(ctx: Ctx, c: Carry, x: number, y: number): boolean {
  const { L } = ctx;
  const src = c.src;
  if (inside(L.cargo, x, y)) {
    if (src.from === "offer") return buyTurret(ctx, src.wagon, src.slot, -1, x, y);
    if (src.from === "mount") return storeTurretAt(ctx, src.index);
    return true;
  }
  const t = ctx.turretAt(x, y);
  if (t < 0) {
    if (inside(L.hull, x, y)) ctx.invalid("DROP A TURRET ON A TURRET SLOT");
    return false;
  }
  if (src.from === "offer") return buyTurret(ctx, src.wagon, src.slot, t, x, y);
  if (src.from === "cargo") return installAt(ctx, c.uid, t, x, y);
  if (src.from === "mount") return moveTo(ctx, src.index, t, x, y);
  return false;
}
