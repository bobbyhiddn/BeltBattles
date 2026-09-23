// Details panel: explains the hovered or selected thing (card, cargo, deck item, belt route,
// turret) with its action button; idle it shows the cruiser card. Landscape uses the left
// column (sized to its content), portrait the strip between the shop and the deck.

import type { DuskFoe, Run } from "../../game/run";
import { record } from "../../game/day";
import { HEROES, ITEMS, MERCHANTS, START_LIVES } from "../../sim/content";
import { beltUsed, connectedRouteCount, defOf, estimateRoute, itemByUid, key, routeInfo, routesOf } from "../../sim/deck";
import { C, RARITY_COLOR } from "../../render/palette";
import { rect, type G } from "../../render/pixel";
import { drawText, wrap } from "../../render/font";
import { beltIcon, itemIcon } from "../../render/sprites";
import { button, panel, type Rect } from "../../ui/ui";
import { buy, deleteRoute, sell, sellPrice, store, unfitMod, type Ctx } from "./actions";
import type { Sel } from "./layout";
import { describe } from "./shop";

interface Action {
  id: string;
  label: string;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onTap: () => void;
}

interface Spec {
  icon: HTMLCanvasElement | null;
  title: string;
  color: string;
  sub: string;
  text: string[];
  action?: Action;
}

function spec(ctx: Ctx, show: Sel, hovering: boolean): Spec | null {
  const { run } = ctx;
  const b = run.build;
  switch (show.kind) {
    case "offer": {
      const o = run.shop.wagons[show.wagon]?.offers[show.slot];
      if (!o) return null;
      const d = ITEMS[o.def];
      const can = !o.sold && run.gold >= o.price;
      const hint = d.kind === "mod" ? "TAP A TURRET OR DRAG IT THERE." : d.kind === "supply" ? "USED THE MOMENT YOU BUY IT." : "TAP A BELT TILE OR DRAG IT ON.";
      return {
        icon: itemIcon(d.id), title: d.name, color: RARITY_COLOR[d.rarity], sub: `${describe(d)} · ${MERCHANTS[run.shop.wagons[show.wagon].merchant].name}`,
        text: [...d.desc, hint],
        action: hovering ? undefined : {
          id: "buy", label: o.sold ? "SOLD" : d.kind === "supply" ? `BUY+USE ${o.price}G` : `BUY ${o.price}G`, primary: can, disabled: !can,
          onTap: () => {
            const res = buy(ctx, show.wagon, show.slot);
            if (res.item) ctx.select({ kind: "cargo", uid: res.item.uid });
          },
        },
      };
    }
    case "cargo": {
      const it = run.inventory.find((i) => i.uid === show.uid);
      if (!it) return null;
      const d = ITEMS[it.def];
      return {
        icon: itemIcon(d.id), title: d.name, color: RARITY_COLOR[d.rarity], sub: `${describe(d)} · IN CARGO`,
        text: [...d.desc, d.kind === "mod" ? "TAP A TURRET TO FIT IT." : "TAP A BELT TILE TO PLACE IT."],
        action: { id: "sell", label: `SELL +${sellPrice(d.id)}G`, onTap: () => sell(ctx, it.uid) },
      };
    }
    case "item": {
      const p = itemByUid(b, show.uid);
      if (!p) return null;
      const d = defOf(p);
      const sub = d.kind === "factory" ? `FACTORY · BELTS ${routesOf(b, p.uid).length}/${d.factory?.outputs ?? 1}` : b.routes.some((q) => q.cells.includes(key(p.x, p.y))) ? "GATE · ON A BELT" : "GATE · NOT ON A BELT!";
      const sig = d.id === "kiln" || d.id === "loom";
      return {
        icon: itemIcon(d.id), title: d.name, color: RARITY_COLOR[d.rarity], sub,
        text: [...d.desc, d.kind === "factory" ? "DRAG OUT OF IT TO LAY BELT." : "DRAG TO MOVE IT."],
        action: sig ? undefined : { id: "store", label: "TO CARGO", onTap: () => store(ctx, p.uid) },
      };
    }
    case "route": {
      if (!b.routes[show.index]) return null;
      const info = routeInfo(b, show.index);
      const est = estimateRoute(b, show.index);
      const fx = [est.burn ? `BURN ${est.burn}` : "", est.shock ? "SHOCK" : ""].filter(Boolean).join(" · ");
      return {
        icon: beltIcon(), title: "BELT ROUTE", color: C.white, sub: info.connected ? `FEEDS TURRET ${info.turret + 1}` : "NOT CONNECTED",
        text: [
          info.connected ? "" : "ENDS SHORT OF A TURRET INTAKE.",
          `${info.tiles} TILES · ${info.gates.length} GATES · ${est.time.toFixed(1)}S TO THE GUN`,
          `DAMAGE ${est.dmg.toFixed(1)}${est.copies > 1 ? ` X${est.copies}` : ""}${fx ? ` · ${fx}` : ""}`,
        ].filter(Boolean),
        action: { id: "rmroute", label: "REMOVE BELT", danger: true, onTap: () => deleteRoute(ctx, show.index) },
      };
    }
    case "turret": {
      const td = HEROES[b.hero].turrets[show.index];
      if (!td) return null;
      const mods = b.mods.filter((m) => m.turret === show.index);
      let every = td.fireInterval, per = 1;
      for (const m of mods) {
        const md = ITEMS[m.def].mod;
        if (md?.fireMul) every *= md.fireMul;
        if (md?.perShot) per = Math.max(per, md.perShot);
      }
      const gear = mods[0] ? ITEMS[mods[0].def] : null;
      return {
        icon: gear ? itemIcon(gear.id) : null, title: `${td.kind.toUpperCase()} TURRET ${show.index + 1}`, color: C.white,
        sub: `FED FROM COLUMN ${td.connectors.map((c) => c + 1).join("+")}`,
        text: [`FIRES EVERY ${every.toFixed(2)}S${per > 1 ? ` · ${per} PER SHOT` : ""}`, `CHAMBER ${td.window} SLUGS`, `GEAR: ${gear ? gear.name : "EMPTY HARDPOINT"}`],
        action: gear ? { id: "unfit", label: "REMOVE GEAR", onTap: () => unfitMod(ctx, show.index) } : undefined,
      };
    }
    default:
      return null;
  }
}

/** True when a hovered card or a selection has details to show (otherwise the idle cards). */
export function hasDetails(ctx: Ctx, sel: Sel, hover: { wagon: number; slot: number } | null): boolean {
  const show: Sel = hover ? { kind: "offer", wagon: hover.wagon, slot: hover.slot } : sel;
  return spec(ctx, show, !!hover) !== null;
}

export function drawDetails(g: G, ctx: Ctx, sel: Sel, hover: { wagon: number; slot: number } | null, area: Rect, foe: DuskFoe): void {
  if (area.h < 14) return;
  const show: Sel = hover ? { kind: "offer", wagon: hover.wagon, slot: hover.slot } : sel;
  const sp = spec(ctx, show, !!hover);
  const column = area.h >= 70; // landscape column: size to content, button under the text
  if (!sp) return drawIdle(g, ctx.run, area, column, foe);
  const wrapW = area.w - 10;
  const lines = sp.text.flatMap((l) => wrap(l, wrapW, "3"));
  const r = column ? { ...area, h: Math.min(area.h, 27 + lines.length * 7 + (sp.action ? 22 : 4)) } : area;
  panel(g, r, "dark");
  ctx.game.ui.add({ id: "details", r, block: true });
  rect(g, r.x + 4, r.y + 4, 16, 16, C.ink);
  rect(g, r.x + 5, r.y + 5, 14, 14, C.slate0);
  if (sp.icon) g.drawImage(sp.icon, r.x + 12 - Math.floor(sp.icon.width / 2), r.y + 12 - Math.floor(sp.icon.height / 2));
  drawText(g, sp.title, r.x + 23, r.y + 4, sp.color, { outline: C.ink });
  drawText(g, sp.sub, r.x + 23, r.y + 13, C.slate4, { font: "3" });
  let maxY = r.y + r.h - 4;
  if (sp.action) {
    const a = sp.action;
    const w = column ? r.w - 10 : Math.min(64, r.w - 10), h = column ? 16 : 13;
    const x = column ? r.x + 5 : r.x + r.w - w - 4, y = column ? r.y + r.h - h - 5 : r.y + 4;
    button(ctx.game.ui, g, a.id, { x, y, w, h }, a.label, { font: "3", primary: a.primary, danger: a.danger, disabled: a.disabled, onTap: a.onTap });
    if (column) maxY = y - 3;
  }
  let y = r.y + 25;
  for (const ln of lines) {
    if (y + 5 > maxY) break;
    drawText(g, ln, r.x + 5, y, C.bone, { font: "3" });
    y += 7;
  }
}

function drawIdle(g: G, run: Run, area: Rect, column: boolean, foe: DuskFoe): void {
  const h = HEROES[run.hero];
  const b = run.build;
  const used = beltUsed(b), cap = b.beltCap;
  if (!column && area.h < 30) {
    panel(g, area, "dark");
    drawText(g, "NEXT", area.x + 5, area.y + 5, C.slate4, { font: "3" });
    drawText(g, foe.name, area.x + 24, area.y + 4, C.red, { outline: C.ink });
    drawText(g, `${foeClass(foe)} · BELT ${used}/${cap} · W-L ${record(run)}`, area.x + 5, area.y + 14, C.bone, { font: "3" });
    return;
  }
  if (!column) return drawHeroStrip(g, run, area);
  const rows: [string, string, string][] = [
    ["HULL", String(h.hull + b.hullBonus), C.white],
    ["BELT", `${used}/${cap} TILES`, used >= cap ? C.amber : C.white],
    ["FEEDS", `${connectedRouteCount(b)}/${h.turrets.reduce((n, tt) => n + tt.connectors.length, 0)} INTAKES`, connectedRouteCount(b) ? C.lime : C.red],
    ["RUN", `W-L ${record(run)} · ${run.lives}/${START_LIVES} LIVES`, C.white],
  ];
  const r = column ? { ...area, h: Math.min(area.h, 29 + rows.length * 8) } : area;
  panel(g, r, "dark");
  let y = r.y + 5;
  drawText(g, h.name, r.x + 5, y, C.white, { outline: C.ink });
  drawText(g, h.factionName, r.x + r.w - 5, y + 1, C.slate4, { font: "3", align: "right" });
  y += 11;
  drawText(g, `PLAYSTYLE: ${h.pattern}`, r.x + 5, y, C.yellow, { font: "3" });
  y += 9;
  for (const [k, v, c] of rows) {
    if (y + 7 > r.y + r.h - 2) break;
    drawText(g, k, r.x + 5, y, C.slate4, { font: "3" });
    drawText(g, v, r.x + 34, y, c, { font: "3" });
    y += 8;
  }
}

/** Portrait hero card (strip): name and faction, playstyle, then HULL · BELT · FEEDS and RUN rows. */
function drawHeroStrip(g: G, run: Run, r: Rect): void {
  const h = HEROES[run.hero];
  const b = run.build;
  const used = beltUsed(b), cap = b.beltCap;
  const feeds = connectedRouteCount(b), intakes = h.turrets.reduce((n, tt) => n + tt.connectors.length, 0);
  panel(g, r, "dark");
  let y = r.y + 5;
  drawText(g, h.name, r.x + 5, y, C.white, { outline: C.ink });
  drawText(g, h.factionName, r.x + r.w - 5, y + 1, C.slate4, { font: "3", align: "right" });
  y += 11;
  drawText(g, `PLAYSTYLE: ${h.pattern}`, r.x + 5, y, C.yellow, { font: "3" });
  y += 9;
  const stats: [string, string, string][] = [
    ["HULL", String(h.hull + b.hullBonus), C.white],
    ["BELT", `${used}/${cap}`, used >= cap ? C.amber : C.white],
    ["FEEDS", `${feeds}/${intakes}`, feeds ? C.lime : C.red],
  ];
  let x = r.x + 5;
  for (const [k, v, c] of stats) {
    x += drawText(g, k, x, y, C.slate4, { font: "3" }) + 3;
    x += drawText(g, v, x, y, c, { font: "3" }) + 8;
  }
  y += 8;
  if (y + 5 <= r.y + r.h - 3) {
    const x2 = r.x + 5 + drawText(g, "RUN", r.x + 5, y, C.slate4, { font: "3" }) + 3;
    drawText(g, `W-L ${record(run)} · ${run.lives}/${START_LIVES} LIVES`, x2, y, C.white, { font: "3" });
  }
}

/** The opponent's hero and hull (a ghost's hull includes its own plating). */
function foeClass(foe: DuskFoe): string {
  const h = HEROES[foe.hero];
  return `${h.name} · HULL ${h.hull + foe.build.hullBonus}`;
}

/** Next-battle card (tonight's dusk opponent): beside FIGHT in landscape (3 rows); a 2-row strip
 *  in portrait. A pool ghost reads "GHOST · <HERO> · <W>-<L>", a stand-in its warlord name. */
export function drawFoe(g: G, foe: DuskFoe, r: Rect): void {
  panel(g, r, "dark");
  const head = foe.kind === "ghost" ? "NEXT BATTLE · DUSK GHOST" : "NEXT BATTLE · DUSK";
  drawText(g, r.h < 32 ? "NEXT BATTLE" : head, r.x + 5, r.y + 5, C.slate4, { font: "3" });
  if (r.h < 32) {
    drawText(g, foeClass(foe), r.x + r.w - 5, r.y + 5, C.bone, { font: "3", align: "right" });
    drawText(g, foe.name, r.x + 5, r.y + 13, C.red, { outline: C.ink });
    return;
  }
  drawText(g, foe.name, r.x + 5, r.y + 13, C.red, { outline: C.ink });
  drawText(g, foeClass(foe), r.x + 5, r.y + 24, C.bone, { font: "3" });
}
