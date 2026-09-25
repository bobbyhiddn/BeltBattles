// Details panel: explains the hovered or selected thing (card, cargo, deck item, belt route,
// turret) with its action button; idle it shows the cruiser card. Landscape uses the left
// column (sized to its content), portrait the strip between the shop and the deck.

import { shopBadge, type DuskFoe, type Run } from "../../game/run";
import { record } from "../../game/day";
import { DISRUPT_TIME, HEROES, ITEMS, MERCHANTS, SIGNATURE_CORES, START_LIVES, WINDOW_TIME, classFactor } from "../../sim/content";
import { AMMO, type FactorySpec, type ItemDef } from "../../sim/content"; // 0.6.1c: factory headlines
import { makeTurret } from "../../sim/battle"; // 0.6.1p: the turret's window as the battle sees it
import { beltUsed, connectedRouteCount, defOf, estimateRoute, gearFor, itemByUid, key, routeInfo, routesOf } from "../../sim/deck";
import { resolveCore, scaleCore, type TurretCore } from "../../sim/cores"; // 0.6.1b; 0.6.1r N4: scaleCore
import { C, RARITY_COLOR } from "../../render/palette";
import { rect, type G } from "../../render/pixel";
import { drawText, textWidth, wrap } from "../../render/font";
import { beltIcon, itemIcon } from "../../render/sprites";
import { button, panel, type Rect } from "../../ui/ui";
import { drawPortrait, tag } from "../../ui/captain";
import { buy, deleteRoute, selectGain, sell, sellPrice, store, unfitCore, unfitMod, type Ctx } from "./actions";
import { effectAt, FUSE_MAX, fusible, outputsAt, pendingAt, perkAt, starsOf, starText } from "../../sim/stars";
import { gainModule, mergePreview } from "../../game/fuse";

/** 0.6.1a: an inspect title with its stars in the 5x7 ★ glyph ("TEMPER ★★"); 1 star shows none. */
const starred = (name: string, stars: number): string => (stars > 1 ? `${name} ${starText(stars)}` : name);
import type { Sel } from "./layout";
import { describe } from "./shop";

/**
 * 0.6.1d: the headline number at `stars`, `effectAt` read out short (ARSENAL.md §8.1, §8.2). 0.6.1p: every applied
 * star perk reads here too. OVERDRIVE's REDLINE/AFTERBURNER guards and MANTLET's freeze/sabot/static/arc/drag
 * immunities act only once wave 2 adds those attacks, so no line promises them (only the perk's name shows).
 */
export function starEffectLine(def: string, stars: number, k = 1): string {
  const e = effectAt(def, stars);
  const gt = e.gate, m = e.mod;
  if (e.core) return coreLine(def, stars, k); // 0.6.1r N4: a core's headline at that star
  if (gt?.burn) return `+${gt.burn} BURN`;
  // 0.6.1f BRAKE SHOE: half speed at every star; HOT SHOE and RED-HOT SHOE add friction heat (flat damage)
  if (gt?.speed && gt.speed < 1) return `${gt.speed === 0.5 ? "HALF SPEED" : `SPEED X${gt.speed}`}${gt.flat ? ` · +${gt.flat} DMG` : ""}`;
  if (gt?.speed) return `SPEED X${gt.speed}${gt.flat ? ` · +${gt.flat} FLAT` : ""}`; // OVERDRIVE ★3: + AFTERBURNER's flat
  if (gt?.flat) return `+${gt.flat} FLAT`;
  if (gt?.perPriorGate) return `+${gt.perPriorGate}/GATE${gt.priorCap !== undefined ? ` · MAX ${gt.priorCap} GATES` : ""}`;
  if (gt?.split) return `${gt.split.copies} X ${Math.round(gt.split.mult * 100)}%`; // 0.6.1f: "2 X 85%", as "3 X 1 DMG"
  if (gt?.shock) return `STALL ${(gt.shockTime ?? DISRUPT_TIME).toFixed(1)}S${gt.jump ? ` · JUMPS TO ${gt.jump} MORE` : ""}`;
  if (e.factory) return factoryLine(e.factory);
  if (m?.fireMul) return `FIRE X${m.fireMul}`;
  if (m?.perShot) return `${m.perShot}/SHOT${m.window ? ` · +${m.window} SLOT` : ""}`;
  if (m?.window) return `+${m.window} SLOT${m.window > 1 ? "S" : ""} · +${m.windowTime ?? 0}S${m.noJam ? " · NEVER JAMS" : ""}`; // HOPPER
  if (m?.immune) return `SHOCK-PROOF${m.intakeGuard ? ` · GUARDS LAST ${m.intakeGuard} TILES` : ""}`; // MANTLET (wave 1: shock only)
  if (m?.finisher) return `FINISHER +${Math.round(m.finisher * 100)}%`;
  const perk = livePerk(def, stars);
  if (perk) return perk;
  return "";
}

/**
 * 0.6.1c: a factory's headline at its stars (catalogue.json "headline"), one phone line each (3x5 face, 151 px).
 * STAMP PRESS keeps 0.6.1p's "EVERY 1.1S · 5 DMG SLUGS" (and the signatures, which never show a level line).
 */
function factoryLine(f: FactorySpec): string {
  const base = f.base ?? AMMO[f.ammo]?.base ?? 0;
  if (f.cycle) { // HOT SWAP
    const em = f.cycle.find((p) => p.tint === "ember"), sp = f.cycle.find((p) => p.tint === "spark");
    return `EMBER +${em?.burn ?? 0} · SPARK ${(sp?.shockTime ?? DISRUPT_TIME).toFixed(1)}S${sp?.jump ? "+JUMP" : ""} · ${f.interval}S`;
  }
  if (f.commission !== undefined) return `GATES ONLINE X${f.commission} · ${f.interval}S${f.hotStart ? ` · X2 ${f.hotStart}S` : ""}`; // ASSEMBLY LINE
  if (f.batch) return `${f.batch} X ${base} DMG EVERY ${f.interval}S`; // DOUBLE STAMP, SHOT TOWER
  if (AMMO[f.ammo]?.fixedSpeed) return `${base} DMG SLAG EVERY ${f.interval}S`; // SLAG POT
  if (f.outputs > 1) return `${f.outputs} OUTPUTS · ${base} DMG EVERY ${f.interval}S`; // GANTRY PRESS
  return `EVERY ${f.interval}S${f.base !== undefined ? ` · ${f.base} DMG SLUGS` : ""}`;
}

/** 0.6.1c: a bought factory's inspect body leads with its headline at its stars and the MERGES WITH / NEXT line, so
 *  the phone band's 4 body lines (0.6.1r F7) keep both; its desc follows. Every other kind keeps desc first. */
function body(d: ItemDef, stars: number, lines: (string | null)[], hint: string, k = 1): string[] {
  const own = lines.filter((l): l is string => !!l);
  if (d.kind !== "factory" || !fusible(d.id)) return [...d.desc, ...own, hint];
  const head = stars > 1 ? own : [starEffectLine(d.id, stars, k), ...own];
  return [...head, ...d.desc, hint];
}

/** 0.6.1r (review-061 F5): the perk's name, unless the sim doesn't apply its values yet (levels[n].pending), so
 *  the inspector never promises an effect that doesn't exist. 0.6.1p emptied every pending; later waves may not. */
function livePerk(def: string, stars: number): string | undefined {
  return Object.keys(pendingAt(def, stars)).length ? undefined : perkAt(def, stars);
}

/** 0.6.1r (review-061 N4): a turret core's headline at `stars` on a turret of class factor k: the turret panel's
 *  own firing summary (coreShape) over the same k-scaled spec resolveCore builds (effectAt's core, scaleCore by k),
 *  plus what only the fire rate shows there (ROTARY's intervalMul) and a NEVER JAMS a star adds (ROTARY ★3). */
function coreLine(def: string, stars: number, k: number): string {
  const raw = effectAt(def, stars).core!;
  const tc: TurretCore = { def, bought: true, routine: raw.routine, stars, k, spec: scaleCore(raw, k) };
  const base = ITEMS[def].core;
  return [
    coreShape(tc),
    tc.spec.intervalMul ? `FIRE X${tc.spec.intervalMul}` : "",
    tc.spec.noJam && !base?.noJam ? "NEVER JAMS" : "",
  ].filter(Boolean).join(" · ");
}

/** 0.6.1r N4: the class factor a core in this run's cargo or shop would fire at: the hero's turrets (all of one
 *  class today: FURNACE heavy k 1, WEAVER light k 0.55), as resolveCore scales it once fitted. */
function heroK(run: Run): number {
  const td = HEROES[run.hero]?.turrets[0];
  return td ? classFactor(td) : 1;
}

/** 0.6.1p (ARSENAL.md §8.2): the current level's numbers with its perk, "★2 CLEAN CUT: 2 X 72%"; null at 1 star (desc says it).
 *  0.6.1r: exported for tests; `k` scales a core's numbers (heroK). */
export function levelLine(def: string, stars: number, k = 1): string | null {
  if (stars <= 1 || !fusible(def)) return null;
  const perk = livePerk(def, stars), eff = starEffectLine(def, stars, k);
  return `★${stars}${perk ? ` ${perk}` : ""}${eff && eff !== perk ? `: ${eff}` : ""}`;
}

/** 0.6.1d (ARSENAL.md §8.1): "MERGES WITH YOUR TEMPER ★1 → ★2 · +4 BURN", live from mergePreview. */
export function mergeLine(run: Run, def: string): string | null {
  const preview = mergePreview(run, def);
  if (!preview) return null;
  const to = preview.toStars, from = to - 1;
  const after = starEffectLine(def, to, heroK(run));
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

/** 0.6.1d (ARSENAL.md §8.2): "NEXT ★3: +7 BURN · 2 MORE COPIES"; null at ★3 or for a non-fusible id.
 *  0.6.1r (review-061 N2): "1 MORE COPY" in the singular. */
export function nextLine(run: Run, def: string, stars: number): string | null {
  if (!fusible(def) || stars >= FUSE_MAX) return null;
  const next = stars + 1;
  const eff = starEffectLine(def, next, heroK(run));
  const copies = copiesToNextStar(run, def, stars);
  // 0.6.1c: a factory's NEXT line names the perk that star brings (TRIPLE DIES, HOT START, THIRD ARM, HEAVY GANTRY).
  // 0.6.1f: so does a gate's (HOT SHOE, RED-HOT SHOE, CLEAN CUT, PERFECT CUT; SPARK JUMP, REDLINE, AFTERBURNER), unless
  // the perk's name is the whole effect line (a gate with no numbers reads "NEXT ★2: PERK" as before)
  const kind = ITEMS[def].kind;
  const brings = (kind === "factory" || kind === "gate") && perkAt(def, next) !== perkAt(def, stars) ? livePerk(def, next) : undefined;
  const perk = brings !== eff ? brings : undefined;
  return `NEXT ★${next}${perk ? ` ${perk}` : ""}${eff ? `: ${eff}` : ""} · ${copies} MORE ${copies === 1 ? "COPY" : "COPIES"}`;
}

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
  actions?: Action[]; // 0.6.1b: was a single `action`; the turret case needs REMOVE CORE and REMOVE GEAR
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
      const hint = d.kind === "mod" || d.kind === "core" ? "TAP A TURRET OR DRAG IT THERE." : d.kind === "supply" ? "USED THE MOMENT YOU BUY IT." : "TAP A BELT TILE OR DRAG IT ON.";
      const mLine = merging ? mergeLine(run, o.def) : null;
      return {
        icon: itemIcon(d.id), title: d.name, color: RARITY_COLOR[d.rarity], sub: `${describe(d)} · ${MERCHANTS[run.shop.wagons[show.wagon].merchant].name}`,
        text: body(d, 1, [mLine], hint, heroK(run)), // 0.6.1c: a factory leads with its headline
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
      const lvl = levelLine(it.def, stars, heroK(run)); // 0.6.1p; 0.6.1r N4: a core's numbers at the hero's k
      return {
        icon: itemIcon(d.id), title: starred(d.name, stars), color: RARITY_COLOR[d.rarity], sub: `${describe(d)} · IN CARGO`,
        text: body(d, stars, [lvl, next], d.kind === "mod" || d.kind === "core" ? "TAP A TURRET TO FIT IT." : "TAP A BELT TILE TO PLACE IT.", heroK(run)),
        actions: [{ id: "sell", label: `SELL +${sellPrice(d.id, stars)}G`, onTap: () => sell(ctx, it.uid) }],
      };
    }
    case "item": {
      const p = itemByUid(b, show.uid);
      if (!p) return null;
      const d = defOf(p);
      const stars = starsOf(p);
      // 0.6.1c: outputs at its stars (GANTRY PRESS ★2 THIRD ARM feeds 3; = routeCheck.ts, validate.ts)
      const sub = d.kind === "factory" ? `FACTORY · BELTS ${routesOf(b, p.uid).length}/${outputsAt(d.id, stars) || 1}` : b.routes.some((q) => q.cells.includes(key(p.x, p.y))) ? "GATE · ON A BELT" : "GATE · NOT ON A BELT!";
      const sig = d.id === "kiln" || d.id === "loom";
      const next = sig ? null : nextLine(run, d.id, stars);
      const lvl = sig ? null : levelLine(d.id, stars); // 0.6.1p
      return {
        icon: itemIcon(d.id), title: starred(d.name, stars), color: RARITY_COLOR[d.rarity], sub,
        text: body(d, stars, [lvl, next], d.kind === "factory" ? "DRAG OUT OF IT TO LAY BELT." : "DRAG TO MOVE IT."),
        actions: sig ? [] : [{ id: "store", label: "TO CARGO", onTap: () => store(ctx, p.uid) }],
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
      // 0.6.1p: the window as the battle sees it (EXT. CHAMBER, HOPPER), and the GATLING clashes (the Prime's call):
      // a GATLING never holds a window, so HOPPER's seconds and FINISHER RAM do nothing there
      const tu = makeTurret(b, show.index, td);
      const plain = tu.window === td.window && tu.windowTime === WINDOW_TIME && !tu.noJam;
      const chamber = plain ? `CHAMBER ${td.window} SLUGS` : `CHAMBER ${tu.window} SLUGS · ${+tu.windowTime.toFixed(2)}S${tu.noJam ? " · NEVER JAMS" : ""}`;
      const gstars = gm ? starsOf(gm) : 1;
      const gearFx = gear ? starEffectLine(gear.id, gstars) : "";
      const clash: string[] = [];
      if (tc.routine === "gatling" && gear?.id === "hopper") clash.push(`GATLING: HOPPER'S +${effectAt("hopper", gstars).mod?.windowTime ?? 0}S DOES NOTHING`);
      if (tc.routine === "gatling" && gear?.id === "ram") clash.push("GATLING: NO WINDOW, SO NO FINISHER");
      return {
        icon: gear ? itemIcon(gear.id) : null, title: `${td.kind.toUpperCase()} TURRET ${show.index + 1}`, color: C.white,
        sub: `FED FROM COLUMN ${td.connectors.map((c) => c + 1).join("+")}`,
        text: [
          `${shape ? `${shape} · ` : ""}FIRES EVERY ${every.toFixed(2)}S${per > 1 ? ` · ${per} PER SHOT` : ""}`,
          chamber,
          `CORE: ${coreName}`, // 0.6.1b: ARSENAL.md §8.4, hidden REMOVE CORE for a signature core
          `GEAR: ${gear ? `${starred(gear.name, gstars)}${gearFx ? ` · ${gearFx}` : ""}` : "EMPTY HARDPOINT"}`,
          ...clash,
        ],
        actions,
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

/**
 * 0.6.1r F7 (review-061; the Prime's layout call): in portrait the 1-2 action buttons never cover the panel's
 * title or sub-line. They keep the top-right row when it can hold them right of both texts (at the old even width,
 * else each sized to its label); otherwise they take one row directly under the sub-line (and the icon box), and
 * the body text moves down by that row (`shift`). Returns one rect per label, in action order (the last action
 * sits at the right edge, as before). Exported for tests.
 */
export function portraitButtons(title: string, sub: string, labels: string[], r: Rect): { rects: Rect[]; shift: number } {
  const n = labels.length, gap = 3, h = 13;
  const clear = r.x + 23 + Math.max(textWidth(title) + 2, textWidth(sub, "3")) + 3; // the title's outline, then a gap
  const even = Math.min(64, Math.floor((r.w - 10 - gap * (n - 1)) / n));
  const sized = labels.map((l) => Math.min(even, Math.max(24, textWidth(l, "3") + 10)));
  const place = (ws: number[], right: number, y: number): Rect[] => {
    const out: Rect[] = [];
    let x = right;
    for (let i = ws.length - 1; i >= 0; i--) {
      x -= ws[i];
      out[i] = { x, y, w: ws[i], h };
      x -= gap;
    }
    return out;
  };
  for (const ws of [labels.map(() => even), sized]) {
    const rects = place(ws, r.x + r.w - 4, r.y + 4);
    if (rects[0].x >= clear) return { rects, shift: 0 };
  }
  // the row: y+21..y+33, 1 px under the icon box (y+4..y+19) and 3 px under the sub-line (y+13..y+17). The body
  // text, which began at y+25, starts 3 px under the row (y+37): a 12 px shift keeps 4 lines of the 3x5 face in
  // the 69 px phone band (the turret case's CORE and GEAR lines both still show).
  const w = Math.floor((r.w - 10 - gap * (n - 1)) / n);
  return { rects: place(labels.map(() => w), r.x + r.w - 5, r.y + 21), shift: 12 };
}

export function drawDetails(g: G, ctx: Ctx, sel: Sel, hover: { wagon: number; slot: number } | null, area: Rect, foe: DuskFoe): void {
  if (area.h < 14) return;
  const show: Sel = hover ? { kind: "offer", wagon: hover.wagon, slot: hover.slot } : sel;
  const sp = spec(ctx, show, !!hover);
  const column = area.h >= 70; // landscape column: size to content, button under the text
  if (!sp) return drawIdle(g, ctx.run, area, column, foe);
  const wrapW = area.w - 10;
  const acts = sp.actions ?? []; // 0.6.1b: 0-2 buttons (the turret case: REMOVE CORE, REMOVE GEAR)
  // 0.6.1r F7: the portrait buttons' place (the top row, or a row under the sub-line that moves the body down)
  const port = !column && acts.length ? portraitButtons(sp.title, sp.sub, acts.map((a) => a.label), area) : null;
  // 0.6.1r (item 11): a sub-line wider than the desk column ("COMMON TURRET GEAR · QUARTERMASTER") breaks after its
  // last " · " onto a second line at y+19, and the column's body moves down 4 px (the portrait band fits one line)
  const cut = sp.sub.lastIndexOf(" · ");
  const subs = column && cut > 0 && textWidth(sp.sub, "3") > area.w - 27 ? [sp.sub.slice(0, cut + 2), sp.sub.slice(cut + 3)] : [sp.sub];
  const shift = (port?.shift ?? 0) + (subs.length > 1 ? 4 : 0);
  // the description in the 5x7 face when it fits the area (easier to read), else the 3x5 face
  const extra = acts.length ? acts.length * 19 + 3 : 4;
  let font: "5" | "3" = "5", lh = 9;
  let lines = sp.text.flatMap((l) => wrap(l, wrapW, font));
  if (column ? 27 + shift + lines.length * lh + extra > area.h : lines.length * lh - 2 > area.h - 29 - shift) {
    font = "3";
    lh = 7;
    lines = sp.text.flatMap((l) => wrap(l, wrapW, font));
  }
  const r = column ? { ...area, h: Math.min(area.h, 27 + shift + lines.length * lh + extra) } : area;
  panel(g, r, "dark");
  ctx.game.ui.add({ id: "details", r, block: true });
  rect(g, r.x + 4, r.y + 4, 16, 16, C.ink);
  rect(g, r.x + 5, r.y + 5, 14, 14, C.slate0);
  if (sp.icon) g.drawImage(sp.icon, r.x + 12 - Math.floor(sp.icon.width / 2), r.y + 12 - Math.floor(sp.icon.height / 2));
  drawText(g, sp.title, r.x + 23, r.y + 4, sp.color, { outline: C.ink });
  subs.forEach((s, i) => drawText(g, s, r.x + 23, r.y + 13 + i * 6, C.slate4, { font: "3" }));
  let maxY = r.y + r.h - 4;
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
  } else if (port) {
    // portrait strip: 1-2 buttons where portraitButtons put them (never over the title or the sub-line)
    acts.forEach((a, i) => button(ctx.game.ui, g, a.id, port.rects[i], a.label, { font: "3", primary: a.primary, danger: a.danger, disabled: a.disabled, onTap: a.onTap }));
  }
  let y = r.y + 25 + shift;
  for (const ln of lines) {
    if (y + lh - 2 > maxY) break;
    drawText(g, ln, r.x + 5, y, C.bone, { font });
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
