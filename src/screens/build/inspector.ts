// Inspector panel: explains whatever is selected (offer, cargo, deck item, belt route,
// turret) and hosts the matching action buttons. With nothing selected it coaches.

import { enemyBuild, type Run } from "../../game/run";
import { warlordName } from "../../sim/ai";
import { HEROES, ITEMS, MERCHANTS, RUN_LIVES, RUN_WINS, type ItemDef } from "../../sim/content";
import {
  connectedRouteCount, defOf, estimateRoute, itemByUid, key, routeInfo, routesOf,
} from "../../sim/deck";
import { C, RARITY_COLOR } from "../../render/palette";
import { rect, type G } from "../../render/pixel";
import { drawText, wrap } from "../../render/font";
import { beltIcon } from "../../render/sprites";
import { button, itemSlot, panel, para, type Rect } from "../../ui/ui";
import { buy, deleteRoute, sell, sellPrice, store, unfitMod, type Ctx } from "./actions";
import type { Sel } from "./layout";

const KIND: Record<string, string> = { gate: "GATE", factory: "FACTORY", mod: "TURRET GEAR", supply: "SUPPLY" };

function header(g: G, r: Rect, def: ItemDef | null, title: string, sub: string, t: number, icon?: HTMLCanvasElement): number {
  if (def) itemSlot(g, r.x + 5, r.y + 5, def.id, false, t);
  else if (icon) {
    rect(g, r.x + 5, r.y + 5, 18, 18, C.ink);
    g.drawImage(icon, r.x + 14 - Math.floor(icon.width / 2), r.y + 13);
  }
  drawText(g, title, r.x + 28, r.y + 6, def ? RARITY_COLOR[def.rarity] : C.white, { outline: C.ink });
  drawText(g, sub, r.x + 28, r.y + 16, C.slate4, { font: "3" });
  return r.y + 28;
}

function line(g: G, r: Rect, y: number, label: string, value: string, color: string = C.white): number {
  drawText(g, label, r.x + 6, y, C.slate4, { font: "3" });
  drawText(g, value, r.x + 50, y, color, { font: "3" });
  return y + 8;
}

function hintLines(r: Rect, text: string): number {
  return wrap(text, r.w - 12, "3").length;
}

/** Yellow tip sitting just above the action button; it grows upward when it wraps. */
function hint(g: G, r: Rect, text: string, y?: number): void {
  para(g, [text], r.x + 6, y ?? r.y + r.h - 27 - hintLines(r, text) * 7, r.w - 12, C.yellow, "3", 2);
}

const offerTip = (d: ItemDef, sold: boolean) =>
  sold ? "SOLD OUT." : d.kind === "mod" ? "OR DRAG IT ONTO A TURRET." : d.kind === "supply" ? "USED THE MOMENT YOU BUY IT." : "OR DRAG IT STRAIGHT ONTO YOUR DECK.";
const cargoTip = (d: ItemDef) => (d.kind === "mod" ? "DRAG IT ONTO A TURRET TO FIT IT." : "DRAG IT ONTO YOUR DECK. GATES WORK ON BELT TILES.");
const itemTip = (d: ItemDef) => (d.kind === "factory" ? "DRAG OUT OF IT TO LAY BELT. HOLD IT TO MOVE IT." : "DRAG TO MOVE. DROP ON CARGO TO STORE.");
const ROUTE_TIP = "DRAG THE BELT TO REROUTE IT FROM THAT TILE.";
const TURRET_TIP = "DROP TURRET GEAR FROM A WAGON OR CARGO HERE.";

/** Height a selected card needs, so the tip and button sit right under its text. */
function selHeight(ctx: Ctx, sel: Sel, r: Rect): number {
  const { run } = ctx;
  const descH = (d: ItemDef) => d.desc.reduce((n, ln) => n + wrap(ln, r.w - 12).length, 0) * 9 + 2;
  let body = 0, tip = "";
  if (sel.kind === "offer") {
    const o = run.shop.wagons[sel.wagon]!.offers[sel.slot]!;
    body = descH(ITEMS[o.def]); tip = offerTip(ITEMS[o.def], o.sold);
  } else if (sel.kind === "cargo") {
    const d = ITEMS[run.inventory.find((i) => i.uid === sel.uid)!.def];
    body = descH(d); tip = cargoTip(d);
  } else if (sel.kind === "item") {
    const d = defOf(itemByUid(run.build, sel.uid)!);
    body = descH(d); tip = itemTip(d);
  } else if (sel.kind === "route") {
    body = 9 + 4 * 8; tip = ROUTE_TIP;
  } else if (sel.kind === "turret") {
    body = 3 * 8; tip = TURRET_TIP;
  }
  return 28 + body + 4 + hintLines(r, tip) * 7 + 27;
}

function selected(ctx: Ctx, sel: Sel): boolean {
  const { run } = ctx;
  const b = run.build;
  switch (sel.kind) {
    case "offer": return !!run.shop.wagons[sel.wagon]?.offers[sel.slot];
    case "cargo": return run.inventory.some((i) => i.uid === sel.uid);
    case "item": return !!itemByUid(b, sel.uid);
    case "route": return !!b.routes[sel.index];
    case "turret": return !!HEROES[b.hero].turrets[sel.index];
    default: return false;
  }
}

/** Height of the idle card, so it hugs its text instead of leaving an empty slab. */
function idleHeight(run: Run, r: Rect, withFoe: boolean): number {
  return 6 + 11 + 10 + (withFoe ? 27 : 0) + wrap(coach(run), r.w - 12, "3").length * 7 + 5;
}

export function drawInspector(g: G, ctx: Ctx, sel: Sel, r: Rect, t: number, withFoe = true): void {
  const { run, game } = ctx;
  const ui = game.ui;
  const b = run.build;
  r = { ...r, h: Math.min(r.h, selected(ctx, sel) ? selHeight(ctx, sel, r) : idleHeight(run, r, withFoe)) };
  panel(g, r, "dark");
  ui.add({ id: "insp", r, block: true });
  const by = r.y + r.h - 22;
  const bw = Math.min(96, r.w - 12);
  switch (sel.kind) {
    case "offer": {
      const o = run.shop.wagons[sel.wagon]?.offers[sel.slot];
      if (!o) break;
      const d = ITEMS[o.def];
      let y = header(g, r, d, d.name, `${d.rarity.toUpperCase()} ${KIND[d.kind]} · ${MERCHANTS[run.shop.wagons[sel.wagon].merchant].name}`, t);
      y += para(g, d.desc, r.x + 6, y, r.w - 12, C.bone) + 2;
      const can = !o.sold && run.gold >= o.price;
      hint(g, r, offerTip(d, o.sold));
      button(ui, g, "buy", { x: r.x + 6, y: by, w: bw, h: 18 }, o.sold ? "SOLD" : `${d.kind === "supply" ? "BUY+USE" : "BUY"} ${o.price}G`, {
        primary: can, disabled: !can, onTap: () => {
          const res = buy(ctx, sel.wagon, sel.slot);
          if (res.item) ctx.select({ kind: "cargo", uid: res.item.uid });
        },
      });
      return;
    }
    case "cargo": {
      const it = run.inventory.find((i) => i.uid === sel.uid);
      if (!it) break;
      const d = ITEMS[it.def];
      let y = header(g, r, d, d.name, `${d.rarity.toUpperCase()} ${KIND[d.kind]} · IN CARGO`, t);
      y += para(g, d.desc, r.x + 6, y, r.w - 12, C.bone) + 2;
      hint(g, r, cargoTip(d));
      button(ui, g, "sell", { x: r.x + 6, y: by, w: bw, h: 18 }, `SELL +${sellPrice(d.id)}G`, { onTap: () => sell(ctx, it.uid) });
      return;
    }
    case "item": {
      const p = itemByUid(b, sel.uid);
      if (!p) break;
      const d = defOf(p);
      let sub: string;
      if (d.kind === "factory") sub = `FACTORY · BELTS ${routesOf(b, p.uid).length}/${d.factory?.outputs ?? 1}`;
      else sub = b.routes.some((q) => q.cells.includes(key(p.x, p.y))) ? "GATE · ON A BELT" : "GATE · NOT ON A BELT!";
      let y = header(g, r, d, d.name, sub, t);
      y += para(g, d.desc, r.x + 6, y, r.w - 12, C.bone) + 2;
      hint(g, r, itemTip(d));
      const sig = d.id === "kiln" || d.id === "loom";
      if (!sig) button(ui, g, "store", { x: r.x + 6, y: by, w: bw, h: 18 }, "TO CARGO", { onTap: () => store(ctx, p.uid) });
      return;
    }
    case "route": {
      if (!b.routes[sel.index]) break;
      const info = routeInfo(b, sel.index);
      const est = estimateRoute(b, sel.index);
      let y = header(g, r, null, "BELT ROUTE", info.connected ? `FEEDS TURRET ${info.turret + 1}` : "NOT CONNECTED", t, beltIcon());
      if (!info.connected) {
        drawText(g, "ENDS SHORT OF A TURRET INTAKE", r.x + 6, y, C.red, { font: "3" });
        y += 9;
      }
      y = line(g, r, y, "TILES", `${info.tiles}  (${info.gates.length} GATE${info.gates.length === 1 ? "" : "S"})`);
      y = line(g, r, y, "TRAVEL", `${est.time.toFixed(1)}S TO THE GUN`);
      y = line(g, r, y, "DAMAGE", `${est.dmg.toFixed(1)}${est.copies > 1 ? ` X${est.copies} COPIES` : ""}`, C.fire3);
      const fx = [est.burn ? `BURN ${est.burn}` : "", est.shock ? "SHOCK" : ""].filter(Boolean).join(" · ");
      if (fx) line(g, r, y, "EFFECTS", fx, C.ice);
      hint(g, r, ROUTE_TIP);
      button(ui, g, "rmroute", { x: r.x + 6, y: by, w: bw, h: 18 }, "REMOVE BELT", { danger: true, onTap: () => deleteRoute(ctx, sel.index) });
      return;
    }
    case "turret": {
      const td = HEROES[b.hero].turrets[sel.index];
      if (!td) break;
      const mods = b.mods.filter((m) => m.turret === sel.index);
      let every = td.fireInterval, per = 1;
      for (const m of mods) {
        const md = ITEMS[m.def].mod;
        if (md?.fireMul) every *= md.fireMul;
        if (md?.perShot) per = Math.max(per, md.perShot);
      }
      let y = header(g, r, mods[0] ? ITEMS[mods[0].def] : null, `${td.kind.toUpperCase()} TURRET ${sel.index + 1}`, `FED FROM COLUMN ${td.connectors.map((c) => c + 1).join("+")}`, t);
      y = line(g, r, y, "FIRES", `EVERY ${every.toFixed(2)}S${per > 1 ? ` · ${per} PER SHOT` : ""}`);
      y = line(g, r, y, "CHAMBER", `${td.window} SLUGS`);
      line(g, r, y, "GEAR", mods[0] ? ITEMS[mods[0].def].name : "EMPTY HARDPOINT", mods[0] ? C.lime : C.slate3);
      hint(g, r, TURRET_TIP);
      if (mods[0]) button(ui, g, "unfit", { x: r.x + 6, y: by, w: bw, h: 18 }, "REMOVE GEAR", { onTap: () => unfitMod(ctx, sel.index) });
      return;
    }
    default:
      break;
  }
  drawIdle(g, run, r, withFoe);
}

function coach(run: Run): string {
  const b = run.build;
  const h = HEROES[b.hero];
  if (connectedRouteCount(b) === 0) return `DRAG OUT OF YOUR ${ITEMS[h.factory].name} TO A BLINKING TURRET INTAKE.`;
  if (run.inventory.some((i) => ITEMS[i.def].kind !== "mod")) return "DRAG CARGO ONTO YOUR DECK. GATES ONLY WORK ON BELT TILES.";
  const loose = b.items.some((p) => defOf(p).kind === "gate" && !b.routes.some((q) => q.cells.includes(key(p.x, p.y))));
  if (loose) return "A GATE ONLY WORKS ON A BELT TILE. RUN A BELT THROUGH IT.";
  if (run.round === 1) return "BUY A GATE FROM A WAGON AND DROP IT ON YOUR BELT. THEN PRESS FIGHT.";
  return "TAP ANYTHING TO INSPECT IT. PRESS FIGHT WHEN READY.";
}

function drawIdle(g: G, run: Run, r: Rect, withFoe: boolean): void {
  const h = HEROES[run.hero];
  let y = r.y + 6;
  drawText(g, h.name, r.x + 6, y, C.white, { outline: C.ink });
  drawText(g, h.factionName, r.x + r.w - 6, y + 1, C.slate4, { font: "3", align: "right" });
  y += 11;
  drawText(g, `PLAYSTYLE: ${h.pattern}`, r.x + 6, y, C.yellow, { font: "3" });
  y += 10;
  if (withFoe) y = foeLines(g, run, r.x + 6, y) + 2;
  para(g, [coach(run)], r.x + 6, y, r.w - 12, C.yellow, "3", 2);
}

function foeLines(g: G, run: Run, x: number, y: number): number {
  const foe = enemyBuild(run);
  drawText(g, "NEXT BATTLE", x, y, C.slate4, { font: "3" });
  y += 7;
  drawText(g, warlordName(foe.hero, run.round), x, y, C.red, { outline: C.ink });
  y += 9;
  drawText(g, `${HEROES[foe.hero].name} · HULL ${HEROES[foe.hero].hull + foe.hullBonus}`, x, y, C.bone, { font: "3" });
  return y + 9;
}

/** Standalone next-opponent card (landscape keeps it on screen next to the deck). */
export function drawNextBattle(g: G, run: Run, r: Rect): void {
  panel(g, r, "dark");
  const y = foeLines(g, run, r.x + 6, r.y + 5);
  drawText(g, `WIN ${RUN_WINS} BEFORE YOU LOSE ${RUN_LIVES}`, r.x + 6, y + 1, C.slate3, { font: "3" });
}
