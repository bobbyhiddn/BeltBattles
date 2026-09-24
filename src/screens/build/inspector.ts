// Details panel: explains the hovered or selected thing (card, cargo, deck item, belt route,
// turret) with its action button; idle it shows the cruiser card. Landscape uses the left
// column (sized to its content), portrait the strip between the shop and the deck.

import { shopBadge, type DuskFoe, type Run } from "../../game/run";
import { record } from "../../game/day";
import { HEROES, ITEMS, MERCHANTS, SIGNATURE_CORES, START_LIVES, rigShape } from "../../sim/content";
import {
  arrowsOf, beltUsed, connectedRouteCount, defOf, gearFor, hitsOfRig, itemByUid, routeInfo, routesOf, walkRoute,
  type TimelineHit,
} from "../../sim/deck";
import { resolveCore, type TurretCore } from "../../sim/cores"; // 0.6.1b
import { C, RARITY_COLOR } from "../../render/palette";
import { rect, type G } from "../../render/pixel";
import { drawText, textWidth, wrap } from "../../render/font";
import { beltIcon, itemIcon } from "../../render/sprites";
import { button, panel, type Rect } from "../../ui/ui";
import { drawPortrait, tag } from "../../ui/captain";
import { buy, deleteRoute, rotate, selectGain, sell, sellPrice, store, unfitCore, unfitMod, type Ctx } from "./actions";
import { effectAt, FUSE_MAX, fusible, perkAt, starsOf, starText } from "../../sim/stars";
import { gainModule, mergePreview } from "../../game/fuse";

/** 0.6.1a: an inspect title with its stars in the 5x7 ★ glyph ("TEMPER ★★"); 1 star shows none. */
const starred = (name: string, stars: number): string => (stars > 1 ? `${name} ${starText(stars)}` : name);
import type { Sel } from "./layout";
import { describe } from "./shop";

/** 0.6.1d: the headline number at `stars`, `effectAt` read out short (ARSENAL.md §8.1, §8.2). */
function starEffectLine(def: string, stars: number): string {
  const e = effectAt(def, stars);
  if (e.gate?.burn) return `+${e.gate.burn} BURN`;
  if (e.gate?.flat) return `+${e.gate.flat} FLAT`;
  if (e.gate?.perPriorGate) return `+${e.gate.perPriorGate}/HIT`;
  if (e.gate?.split) return `${e.gate.split.copies}X ${Math.round(e.gate.split.mult * 100)}%`;
  if (e.gate?.speed) return `SPEED X${e.gate.speed}`;
  if (e.factory) return `EVERY ${e.factory.interval}S`;
  if (e.mod?.fireMul) return `FIRE X${e.mod.fireMul}`;
  if (e.mod?.perShot) return `${e.mod.perShot}/SHOT`;
  const perk = perkAt(def, stars);
  if (perk) return perk;
  if (e.gate?.shock) return "SHOCK";
  return "";
}

/** 0.6.1d (ARSENAL.md §8.1): "MERGES WITH YOUR TEMPER ★1 → ★2 · +4 BURN", live from mergePreview. */
function mergeLine(run: Run, def: string): string | null {
  const preview = mergePreview(run, def);
  if (!preview) return null;
  const to = preview.toStars, from = to - 1;
  const after = starEffectLine(def, to);
  return `MERGES WITH YOUR ${ITEMS[def].name} ★${from} → ★${to}${after ? ` · ${after}` : ""}`;
}

/** How many more 1★ gains of `def` (bought, dropped, however) it takes to pass `atLeast` stars,
 *  simulated on a cloned run through the real gainModule (no re-implemented fuse math). */
function copiesToNextStar(run: Run, def: string, atLeast: number): number {
  const clone = { ...run, build: JSON.parse(JSON.stringify(run.build)), inventory: run.inventory.map((i) => ({ ...i })), fuseFx: [] } as Run;
  for (let n = 1; n <= 8; n++) {
    const g = gainModule(clone, def);
    if (g.stars > atLeast) return n;
  }
  return 8;
}

/** 0.6.1d (ARSENAL.md §8.2): "NEXT ★3: +7 BURN · 2 MORE COPIES"; null at ★3 or for a non-fusible id. */
function nextLine(run: Run, def: string, stars: number): string | null {
  if (!fusible(def) || stars >= FUSE_MAX) return null;
  const next = stars + 1;
  const eff = starEffectLine(def, next);
  const copies = copiesToNextStar(run, def, stars);
  return `NEXT ★${next}${eff ? `: ${eff}` : ""} · ${copies} MORE COPIES`;
}

interface Action {
  id: string;
  label: string;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onTap: () => void;
}

/** A line of the panel's text: plain (bone), or [text, colour] (0.6.2: warnings and the turret-end readout). */
type Line = string | [string, string];

interface Spec {
  icon: HTMLCanvasElement | null;
  title: string;
  color: string;
  sub: string;
  subColor?: string; // 0.6.2 BELTSIDE: an IDLE rig's sub line warns
  subShort?: string; // 0.6.2 BELTSIDE: the sub line where `sub` doesn't fit (the portrait strip beside two buttons)
  // 0.6.2 BELTSIDE: the sub line (in yellow) when the panel has no room for a single text line (the 360x640 portrait
  // strip is a header only): a belt's turret-end readout, so V4's DMG, BURN, SHOCK, SPD and TIME stay in sight.
  // Variants from the fullest to the tightest: the first that fits is drawn, else the last, cut short at its end
  // (the tightest one lists by importance: DMG, TIME, BURN, SHOCK, SPD, which the chevron tint also shows)
  subTight?: string[];
  text: Line[];
  actions?: Action[]; // 0.6.1b: was a single `action`; the turret case needs REMOVE CORE and REMOVE GEAR
  // 0.6.2 BELTSIDE: when the text overflows its panel, drop text[from..to) from the end and say so with
  // more(n) instead of losing the last lines (a belt's timeline rows give way to its turret-end readout)
  trim?: { from: number; to: number; more: (n: number) => Line };
}

/** 0.6.2 BELTSIDE: the hint for placing a part from the shop (`drag`: it can be dragged there too) or cargo. */
function placeHint(kind: string, drag: boolean): string {
  const how = kind === "mod" || kind === "core" ? "TAP A TURRET TO FIT IT"
    : kind === "gate" ? "TAP A CELL BESIDE A BELT: ITS ARROWS WORK THE BELT TILES THEY POINT AT"
    : "TAP THE DECK TO PLACE IT";
  return drag ? `${how}, OR DRAG IT THERE.` : `${how}.`;
}

const num = (x: number): string => String(+x.toFixed(2));

/** 0.6.2 BELTSIDE (V4): one hit in a belt's timeline: the rig and what it did there (walkRoute). */
function hitLabel(h: TimelineHit, locked: boolean): string {
  const name = ITEMS[h.def].name;
  if (h.split) return `${name} X${h.split.copies} AT ${Math.round(h.split.mult * 100)}%`;
  if (h.prior !== undefined) return `${name} +${num(h.flat ?? 0)} (${h.prior} HIT${h.prior === 1 ? "" : "S"} BEFORE)`;
  if (h.flat) return `${name} +${num(h.flat)}`;
  if (h.burn) return `${name} BURN +${h.burn}`;
  if (h.shock) return `${name} SHOCK`;
  if (h.speed !== undefined) return `${name} ${num(h.speed)}X${locked ? " (LOCKED)" : h.won ? "" : " (BEATEN)"}`;
  return name;
}

/** 0.6.1b: the core's firing summary rescaled by k ("3 PELLETS x 40%"), or "" for the identity routine
 *  (ARSENAL.md §8.4). `tc.spec` is already k-scaled (resolveCore), so absolute numbers read straight off it. */
function coreShape(tc: TurretCore): string {
  const c = tc.spec;
  switch (tc.routine) {
    case "scatter": return `${c.pellets} PELLETS x ${Math.round((c.share ?? 1) * 100)}%`;
    case "rotary": return `${c.order} LOAD FIRST`;
    case "pressure": return `+${(c.perQueued ?? 0).toFixed(1)} DMG PER QUEUED`;
    case "gatling": return `SPIN ${(c.start ?? 1).toFixed(2)}X TO ${(c.floor ?? 1).toFixed(2)}X`;
    case "hullbreaker": return `HULL ONLY x${(c.hullMul ?? 1).toFixed(2)}`;
    case "drake": return `+${c.addBurn} BURN ${c.burnTime}S`;
    case "salvo": return `FULL VOLLEY +${(c.volleyFlat ?? 0).toFixed(1)} EACH`;
    default: return "";
  }
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
      const merging = !o.sold && shopBadge(run, o.def)?.kind === "merge";
      const hint = d.kind === "supply" ? "USED THE MOMENT YOU BUY IT." : placeHint(d.kind, true);
      const mLine = merging ? mergeLine(run, o.def) : null;
      return {
        icon: itemIcon(d.id), title: d.name, color: RARITY_COLOR[d.rarity], sub: `${describe(d)} · ${MERCHANTS[run.shop.wagons[show.wagon].merchant].name}`,
        text: [...d.desc, ...(mLine ? [mLine] : []), hint],
        actions: hovering ? [] : [{
          id: "buy", label: o.sold ? "SOLD" : d.kind === "supply" ? `BUY+USE ${o.price}G` : merging ? `BUY+MERGE ${o.price}G` : `BUY ${o.price}G`, primary: can, disabled: !can,
          onTap: () => {
            const res = buy(ctx, show.wagon, show.slot);
            if (res.gain) selectGain(ctx, res.gain); // 0.6.1a: after a merge, the survivor
          },
        }],
      };
    }
    case "cargo": {
      const it = run.inventory.find((i) => i.uid === show.uid);
      if (!it) return null;
      const d = ITEMS[it.def];
      const stars = starsOf(it);
      const next = nextLine(run, it.def, stars);
      return {
        icon: itemIcon(d.id), title: starred(d.name, stars), color: RARITY_COLOR[d.rarity], sub: `${describe(d)} · IN CARGO`,
        text: [...d.desc, ...(next ? [next] : []), placeHint(d.kind, false)],
        actions: [{ id: "sell", label: `SELL +${sellPrice(d.id, stars)}G`, onTap: () => sell(ctx, it.uid) }],
      };
    }
    case "item": {
      const p = itemByUid(b, show.uid);
      if (!p) return null;
      const d = defOf(p);
      const stars = starsOf(p);
      const sig = d.id === "kiln" || d.id === "loom";
      const next = sig ? null : nextLine(run, d.id, stars);
      if (d.kind === "gate") {
        // 0.6.2 BELTSIDE (V4): a rig's hits, or IDLE when none of its arrows lands on a belt
        const hits = hitsOfRig(b, p.uid);
        const arrows = arrowsOf(p).length, x = rigShape(d) === "X";
        const idle = hits.length === 0;
        return {
          icon: itemIcon(d.id), title: starred(d.name, stars), color: RARITY_COLOR[d.rarity],
          sub: idle ? "RIG · IDLE" : `RIG · ${new Set(hits.map((h) => h.dir)).size}/${arrows} ARROWS ON BELTS`,
          subShort: idle ? undefined : `RIG · ${new Set(hits.map((h) => h.dir)).size}/${arrows} HIT`,
          subColor: idle ? C.amber : undefined,
          // the lines that matter most first: a short panel drops the last ones
          text: [
            ...(idle ? [["IDLE: NO ARROW REACHES A BELT. TURN IT OR MOVE IT BESIDE ONE.", C.amber] as Line] : hits.map((h) => `→ BELT ${h.route + 1} · TILE ${h.tile + 1}`)),
            x ? "FACES EVERY SIDE. DRAG TO MOVE." : "TAP TO TURN (OR R). DRAG TO MOVE.",
            ...d.desc, ...(next ? [next] : []),
          ],
          actions: [
            ...(x ? [] : [{ id: "rotate", label: "ROTATE", onTap: () => rotate(ctx, p.uid) }]),
            { id: "store", label: "TO CARGO", onTap: () => store(ctx, p.uid) },
          ],
        };
      }
      return {
        icon: itemIcon(d.id), title: starred(d.name, stars), color: RARITY_COLOR[d.rarity],
        sub: `FACTORY · BELTS ${routesOf(b, p.uid).length}/${d.factory?.outputs ?? 1}`,
        text: [...d.desc, ...(next ? [next] : []), "DRAG OUT OF IT TO LAY BELT."],
        actions: sig ? [] : [{ id: "store", label: "TO CARGO", onTap: () => store(ctx, p.uid) }],
      };
    }
    case "route": {
      if (!b.routes[show.index]) return null;
      const info = routeInfo(b, show.index);
      // 0.6.2 BELTSIDE (V4): the tile-by-tile timeline in R7 order, then the turret-end readout, from one walk
      const w = walkRoute(b, show.index);
      const est = w.estimate;
      const hitCount = w.timeline.reduce((n, row) => n + row.hits.length, 0);
      const head: Line[] = [
        ...(info.connected ? [] : [["ENDS SHORT OF A TURRET INTAKE.", C.amber] as Line]),
        `${info.tiles} TILES · ${hitCount} HIT${hitCount === 1 ? "" : "S"}${hitCount ? " IN ORDER:" : ": NO RIG WORKS THIS BELT"}`,
      ];
      const rows = w.timeline.map((row) => `T${row.tile + 1}: ${row.hits.map((h) => hitLabel(h, w.locked)).join(" · ")}`);
      const dmg = `DMG ${est.dmg.toFixed(1)}${est.copies > 1 ? `X${est.copies}` : ""}`, spd = `${num(w.speedEnd)}X`, time = `${est.time.toFixed(1)}S`;
      const tag = (burn: string, shock: string) => [...(est.burn ? [`${burn}${est.burn}`] : []), ...(est.shock ? [shock] : [])];
      return {
        icon: beltIcon(), title: "BELT ROUTE", color: C.white, sub: info.connected ? `FEEDS TURRET ${info.turret + 1}` : "NOT CONNECTED",
        subTight: info.connected
          ? [[dmg, ...tag("BURN ", "SHOCK"), spd, time].join(" · "), [dmg, ...tag("B", "SHK"), spd, time].join(" · "), [dmg, time, ...tag("B", "SHK"), spd].join(" ")]
          : undefined,
        // the turret end, what a payload carries into the gun (DMG, BURN, SHOCK) and how it gets there (SPD,
        // TIME), always stays in sight: on a short panel the last timeline rows give way first
        text: [
          ...head, ...rows,
          [`AT THE GUN: DMG ${est.dmg.toFixed(1)}${est.copies > 1 ? ` X${est.copies}` : ""} · BURN ${est.burn} · ${est.shock ? "SHOCK" : "NO SHOCK"}`, C.yellow],
          [`SPD ${num(w.speedEnd)}X · TIME ${est.time.toFixed(1)}S TO THE GUN`, C.yellow],
        ],
        trim: { from: head.length, to: head.length + rows.length, more: (n) => [`+${n} MORE HIT TILE${n === 1 ? "" : "S"} (NUMBERED ON THE DECK)`, C.slate4] },
        actions: [{ id: "rmroute", label: "REMOVE BELT", danger: true, onTap: () => deleteRoute(ctx, show.index) }],
      };
    }
    case "turret": {
      const td = HEROES[b.hero].turrets[show.index];
      if (!td) return null;
      const gm = gearFor(b, show.index); // 0.6.1b: gear only; the core has its own socket (coreFor via resolveCore)
      const gear = gm ? ITEMS[gm.def] : null;
      let every = td.fireInterval, per = 1;
      if (gm) {
        const md = effectAt(gm.def, starsOf(gm)).mod; // 0.6.1a: the gear's spec at its stars
        if (md?.fireMul) every *= md.fireMul;
        if (md?.perShot) per = Math.max(per, md.perShot);
      }
      const tc = resolveCore(b, show.index, td); // 0.6.1b: bought core (k-scaled) or the signature core
      if (tc.bought) every *= tc.spec.intervalMul ?? tc.spec.reloadMul ?? 1; // ROTARY / SALVO's static cadence change
      const coreName = tc.bought ? starred(ITEMS[tc.def].name, tc.stars) : (SIGNATURE_CORES[tc.def]?.name ?? "SIGNATURE CORE");
      const shape = coreShape(tc);
      const actions: Action[] = [];
      if (tc.bought) actions.push({ id: "unfitcore", label: "REMOVE CORE", onTap: () => unfitCore(ctx, show.index) });
      if (gear) actions.push({ id: "unfit", label: "REMOVE GEAR", onTap: () => unfitMod(ctx, show.index) });
      return {
        icon: gear ? itemIcon(gear.id) : null, title: `${td.kind.toUpperCase()} TURRET ${show.index + 1}`, color: C.white,
        sub: `FED FROM COLUMN ${td.connectors.map((c) => c + 1).join("+")}`,
        text: [
          `${shape ? `${shape} · ` : ""}FIRES EVERY ${every.toFixed(2)}S${per > 1 ? ` · ${per} PER SHOT` : ""}`,
          `CHAMBER ${td.window} SLUGS`,
          `CORE: ${coreName}`, // 0.6.1b: ARSENAL.md §8.4, hidden REMOVE CORE for a signature core
          `GEAR: ${gear ? starred(gear.name, starsOf(gm!)) : "EMPTY HARDPOINT"}`,
        ],
        actions,
      };
    }
    default:
      return null;
  }
}

/** 0.6.2: a panel's title (the 5x7 face, outlined) or sub line (3x5) within `max` px: a title that doesn't fit
 *  steps down to the 3x5 face, and whatever still doesn't fit is cut short with a dot. */
function fitHead(g: G, s: string, x: number, y: number, max: number, color: string, title: boolean): void {
  if (title && textWidth(s) <= max) {
    drawText(g, s, x, y, color, { outline: C.ink });
    return;
  }
  let t = s;
  while (t.length > 1 && textWidth(t, "3") > max) t = `${t.slice(0, -2).trimEnd()}.`;
  drawText(g, t, x, title ? y + 1 : y, color, title ? { font: "3", outline: C.ink } : { font: "3" });
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
  const acts = sp.actions ?? []; // 0.6.1b: 0-2 buttons (the turret case: REMOVE CORE, REMOVE GEAR)
  // the description in the 5x7 face when it fits the area (easier to read), else the 3x5 face; 0.6.2: a line
  // may carry its own colour (warnings, the belt's turret-end readout)
  const extra = acts.length ? acts.length * 19 + 3 : 4;
  let font: "5" | "3" = "5", lh = 9;
  const wrapAll = (f: "5" | "3"): [string, string][] => sp.text.flatMap((l) => {
    const [s, c] = typeof l === "string" ? [l, C.bone] : l;
    return wrap(s, wrapW, f).map((w): [string, string] => [w, c]);
  });
  let lines = wrapAll(font);
  if (column ? 27 + lines.length * lh + extra > area.h : lines.length * lh - 2 > area.h - 29) {
    font = "3";
    lh = 7;
    lines = wrapAll(font);
  }
  const r = column ? { ...area, h: Math.min(area.h, 27 + lines.length * lh + extra) } : area;
  panel(g, r, "dark");
  ctx.game.ui.add({ id: "details", r, block: true });
  rect(g, r.x + 4, r.y + 4, 16, 16, C.ink);
  rect(g, r.x + 5, r.y + 5, 14, 14, C.slate0);
  if (sp.icon) g.drawImage(sp.icon, r.x + 12 - Math.floor(sp.icon.width / 2), r.y + 12 - Math.floor(sp.icon.height / 2));
  let maxY = r.y + r.h - 4;
  let headRight = r.x + r.w - 4; // 0.6.2: the title and sub line end left of this (the portrait strip's buttons)
  if (acts.length && column) {
    // landscape column: one full-width button per action, stacked bottom-up under the text
    let by = r.y + r.h - 5;
    for (let i = acts.length - 1; i >= 0; i--) {
      by -= 16;
      const a = acts[i];
      button(ctx.game.ui, g, a.id, { x: r.x + 5, y: by, w: r.w - 10, h: 16 }, a.label, { font: "3", primary: a.primary, danger: a.danger, disabled: a.disabled, onTap: a.onTap });
      by -= 3;
    }
    maxY = by;
  } else if (acts.length) {
    // portrait strip: same top-right row as before, split between 1-2 buttons; 0.6.2: with two, each is sized
    // to its label, so a long title (a rig: "GALVANIC COIL ★★") and its sub line stay in sight
    const h = 13, gap = 3;
    const even = Math.min(64, Math.floor((r.w - 10 - gap * (acts.length - 1)) / acts.length));
    let x = r.x + r.w - 4;
    for (let i = acts.length - 1; i >= 0; i--) {
      const a = acts[i];
      const w = acts.length > 1 ? Math.min(even, Math.max(34, textWidth(a.label, "3") + 10)) : even;
      x -= w;
      button(ctx.game.ui, g, a.id, { x, y: r.y + 4, w, h }, a.label, { font: "3", primary: a.primary, danger: a.danger, disabled: a.disabled, onTap: a.onTap });
      x -= gap;
    }
    headRight = x;
  }
  let y = r.y + 25;
  const fit = Math.max(0, Math.floor((maxY - y + 2) / lh)); // lines with y + lh - 2 <= maxY
  fitHead(g, sp.title, r.x + 23, r.y + 4, headRight - (r.x + 23), sp.color, true);
  // 0.6.2 BELTSIDE: a header-only panel shows `subTight` (in yellow, like the readout it stands for) instead
  const subMax = headRight - (r.x + 23);
  const tight = fit === 0 && !!sp.subTight?.length ? sp.subTight : null;
  const sub = tight
    ? (tight.find((s) => textWidth(s, "3") <= subMax) ?? tight[tight.length - 1])
    : sp.subShort && textWidth(sp.sub, "3") > subMax ? sp.subShort : sp.sub;
  fitHead(g, sub, r.x + 23, r.y + 13, subMax, tight ? C.yellow : sp.subColor ?? C.slate4, false);
  if (sp.trim && lines.length > fit) {
    // 0.6.2 BELTSIDE: drop trimmable entries from the end of their range (and say how many) until it fits
    const { from, to, more } = sp.trim;
    for (let cut = 1; cut <= to - from; cut++) {
      lines = [...sp.text.slice(0, to - cut), more(cut), ...sp.text.slice(to)].flatMap((l) => {
        const [s, c] = typeof l === "string" ? [l, C.bone] : l;
        return wrap(s, wrapW, font).map((w): [string, string] => [w, c]);
      });
      if (lines.length <= fit) break;
    }
  }
  for (const [ln, col] of lines) {
    if (y + lh - 2 > maxY) break;
    drawText(g, ln, r.x + 5, y, col, { font });
    y += lh;
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
  // landscape column: the stats in the 5x7 face when they fit (RUN split into RUN and LIVES)
  const big: [string, string, string][] = [
    ["HULL", String(h.hull + b.hullBonus), C.white],
    ["BELT", `${used}/${cap} TILES`, used >= cap ? C.amber : C.white],
    ["FEEDS", `${connectedRouteCount(b)}/${h.turrets.reduce((n, tt) => n + tt.connectors.length, 0)} INTAKES`, connectedRouteCount(b) ? C.lime : C.red],
    ["RUN", `W-L ${record(run)}`, C.white],
    ["LIVES", `${run.lives}/${START_LIVES}`, C.white],
  ];
  const kw = textWidth("FEEDS") + 6;
  if (big.every(([, v]) => 10 + kw + textWidth(v) <= area.w) && 31 + big.length * 10 <= area.h) {
    const r = { ...area, h: 31 + big.length * 10 };
    panel(g, r, "dark");
    drawText(g, h.name, r.x + 5, r.y + 5, C.white, { outline: C.ink });
    drawText(g, h.factionName, r.x + r.w - 5, r.y + 6, C.slate4, { font: "3", align: "right" });
    drawText(g, `PLAYSTYLE: ${h.pattern}`, r.x + 5, r.y + 16, C.yellow, { font: "3" });
    let y = r.y + 27;
    for (const [k, v, c] of big) {
      drawText(g, k, r.x + 5, y, C.slate4);
      drawText(g, v, r.x + 5 + kw, y, c);
      y += 10;
    }
    return;
  }
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
  // 0.6.0b: a stand-in is a rival captain: its portrait, its name and a STAND-IN tag
  const rival = foe.kind === "standin" ? foe.rival : undefined;
  const ps = r.h >= 32 ? 24 : 16;
  if (rival) drawPortrait(g, rival, r.x + 5, r.y + Math.round((r.h - ps) / 2), ps);
  const x0 = rival ? r.x + 5 + ps + 5 : r.x + 5;
  drawText(g, r.h < 32 ? "NEXT BATTLE" : head, x0, r.y + 5, C.slate4, { font: "3" });
  if (r.h < 32) {
    drawText(g, foeClass(foe), r.x + r.w - 5, r.y + 5, C.bone, { font: "3", align: "right" });
    const nw = drawText(g, foe.name, x0, r.y + 13, C.red, { outline: C.ink });
    if (rival) tag(g, "STAND-IN", x0 + nw + 4, r.y + 14, C.slate3);
    return;
  }
  const nw = drawText(g, foe.name, x0, r.y + 13, C.red, { outline: C.ink });
  if (rival) tag(g, "STAND-IN", x0 + nw + 4, r.y + 14, C.slate3);
  drawText(g, foeClass(foe), x0, r.y + 24, C.bone, { font: "3" });
}
