// 0.6.2s (REQ-BFG-031 S10): what the build screen's details panel says about TURRETS. A turret card (a shop offer
// or a cargo copy) shows its class, rarity and stars (title and sub line), its fire rate, loads, gear slots, intake
// and one-line reason; an EMPTY TURRET SLOT says what it takes; an installed turret's panel (inspector.ts) adds its
// CORE SOCKET and every GEAR SLOT, filled or empty, the belts a swap left without an intake, TO CARGO and SELL.
// Player text follows REQ-BFG-032: plain sentences, numbers with units, no dot chains, wrapped by the panel.

import { mergePreview } from "../../game/fuse";
import type { Run } from "../../game/run";
import { ITEMS, MERCHANTS, type ItemDef } from "../../sim/content";
import {
  canSellTurret, deadEndsAt, gearOn, gearSlotsOf, hullSlots, kx, turretSellValue, turretSlots, type Build,
} from "../../sim/deck";
import { effectAt, starsOf, starText } from "../../sim/stars";
import { C, RARITY_COLOR } from "../../render/palette";
import { itemIcon } from "../../render/sprites";
import { buy, selectGain, sell, type Ctx } from "./actions";
import type { Sel } from "./layout";
import { describe } from "./shop";
import { sellTurretAt, storeTurretAt } from "./turretActions";

/** A panel text line: plain (bone) or [text, colour] (inspector.ts Line). */
export type PanelLine = string | [string, string];

/** inspector.ts Spec's shape (structural), for the turret panels this file builds. */
export interface TurretPanelSpec {
  icon: HTMLCanvasElement | null;
  title: string;
  color: string;
  sub: string;
  text: PanelLine[];
  actions?: { id: string; label: string; primary?: boolean; danger?: boolean; disabled?: boolean; onTap: () => void }[];
}

const sec = (x: number): string => String(+x.toFixed(2));
const plural = (n: number, one: string, many = `${one}S`): string => `${n} ${n === 1 ? one : many}`;
const starred = (name: string, stars: number): string => (stars > 1 ? `${name} ${starText(stars)}` : name);
const isTurret = (def: string): boolean => (Object.prototype.hasOwnProperty.call(ITEMS, def) ? ITEMS[def] : undefined)?.kind === "turret";

/** The fire rate and loads of turret `def` at `stars`: "FIRES EVERY 0.85 S AND HOLDS 4 LOADS." */
export function fireLine(def: string, stars: number): string {
  const t = effectAt(def, stars).turret!;
  return `FIRES EVERY ${sec(t.fireInterval)} S AND HOLDS ${plural(t.window, "LOAD")}.`;
}

/** Its gear slots (S4) and the one core socket: "2 GEAR SLOTS AND 1 CORE SOCKET." */
export function gearLine(def: string, stars: number): string {
  return `${plural(gearSlotsOf(def, stars), "GEAR SLOT")} AND 1 CORE SOCKET.`;
}

/** Which of a slot's columns it takes belts on (S2). */
export function intakeLine(def: string): string {
  return ITEMS[def].turret?.intake === "inner" ? "IT TAKES A BELT ON ITS INNER COLUMN ONLY." : "IT TAKES BELTS ON BOTH ITS COLUMNS.";
}

/** What the next star brings (S6 levels, S4 gear slots): "NEXT ★2: IT HOLDS 5 LOADS AND HAS 3 GEAR SLOTS. MERGE TWO
 *  ★1 COPIES TO GET IT." */
export function nextStarLine(def: string, stars: number): string | null {
  if (stars >= 3) return null;
  const a = effectAt(def, stars).turret!, b = effectAt(def, stars + 1).turret!;
  const parts: string[] = [];
  if (b.fireInterval !== a.fireInterval) parts.push(`FIRES EVERY ${sec(b.fireInterval)} S`);
  if (b.window !== a.window) parts.push(`HOLDS ${plural(b.window, "LOAD")}`);
  parts.push(`HAS ${plural(gearSlotsOf(def, stars + 1), "GEAR SLOT")}`);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} AND ${parts[parts.length - 1]}` : parts[0];
  return `NEXT ★${stars + 1}: IT ${list}. MERGE TWO ★${stars} COPIES TO GET IT.`;
}

/** The facts of a turret card, most important first (a phone panel shows the first four lines). */
export function turretFacts(def: string, stars: number): string[] {
  const d = ITEMS[def];
  const next = nextStarLine(def, stars);
  return [
    fireLine(def, stars),
    gearLine(def, stars),
    ...(d.reason ? [d.reason.toUpperCase()] : []),
    intakeLine(def),
    ...(next ? [next] : []),
  ];
}

/** A shop offer, a cargo copy or an empty TURRET SLOT: its panel; undefined when `show` is none of those (inspector.ts
 *  goes on with its own cases), null when there is nothing to show. */
export function turretSpec(ctx: Ctx, show: Sel, hovering: boolean): TurretPanelSpec | null | undefined {
  const run = ctx.run;
  if (show.kind === "offer") {
    const o = run.shop.wagons[show.wagon]?.offers[show.slot];
    if (!o || !isTurret(o.def)) return undefined;
    return offerSpec(ctx, run, show.wagon, show.slot, hovering);
  }
  if (show.kind === "cargo") {
    const it = run.inventory.find((i) => i.uid === show.uid);
    if (!it || !isTurret(it.def)) return undefined;
    const d = ITEMS[it.def], stars = starsOf(it);
    const can = canSellTurret(it);
    return {
      icon: itemIcon(d.id), title: starred(d.name, stars), color: RARITY_COLOR[d.rarity], sub: `${describe(d)} IN CARGO`,
      text: [
        ...turretFacts(d.id, stars),
        ...(it.free ? [can ? "IT HOLDS YOUR HULL'S FREE STARTING COPY." : "YOUR HULL'S FREE STARTING TURRET. IT CAN'T BE SOLD AT 1 STAR."] : []),
        "DRAG IT ONTO A TURRET SLOT, OR TAP A SLOT, TO INSTALL IT.",
      ],
      actions: can ? [{ id: "sell", label: `SELL +${turretSellValue(it)}G`, onTap: () => sell(ctx, it.uid) }] : [],
    };
  }
  if (show.kind === "turret") {
    const s = turretSlots(run.build)[show.index];
    if (!s) return null;
    if (s.turret) return undefined; // an installed turret: inspector.ts's turret case (with the hooks below)
    return emptySlotSpec(run.build, show.index);
  }
  return undefined;
}

function offerSpec(ctx: Ctx, run: Run, wagon: number, slot: number, hovering: boolean): TurretPanelSpec {
  const o = run.shop.wagons[wagon].offers[slot];
  const d: ItemDef = ITEMS[o.def];
  const can = !o.sold && run.gold >= o.price;
  const pv = o.sold ? null : mergePreview(run, o.def);
  const merge = pv ? `BUYING IT MERGES IT WITH YOUR ${d.name} INTO ★${pv.toStars}.` : null;
  return {
    icon: itemIcon(d.id), title: d.name, color: RARITY_COLOR[d.rarity], sub: `${describe(d)} FROM THE ${MERCHANTS[run.shop.wagons[wagon].merchant].name}`,
    text: [...turretFacts(d.id, 1), ...(merge ? [merge] : []), "DRAG IT ONTO A TURRET SLOT TO INSTALL IT, OR ONTO CARGO."],
    actions: hovering ? [] : [{
      id: "buy", label: o.sold ? "SOLD" : pv ? `BUY+MERGE ${o.price}G` : `BUY ${o.price}G`, primary: can, disabled: !can,
      onTap: () => {
        const res = buy(ctx, wagon, slot);
        if (!res.gain) return;
        if (res.gain.where === "slot") {
          const s = turretSlots(run.build).find((q) => q.turret?.uid === res.gain!.survivor);
          if (s) ctx.select({ kind: "turret", index: s.slot });
        } else selectGain(ctx, res.gain);
      },
    }],
  };
}

/** S2/S5: the belts ending under slot t that no intake takes, as warnings: which belt, which column, and why. */
export function deadEndLines(b: Build, t: number): PanelLine[] {
  const s = turretSlots(b)[t];
  return deadEndsAt(b, t).map((ri): PanelLine => {
    const cells = b.routes[ri].cells, col = kx(cells[cells.length - 1]) + 1;
    const who = s?.turret ? "THIS TURRET TAKES" : "AN EMPTY SLOT TAKES";
    return [`BELT ${ri + 1} IS A DEAD END: ${who} NO BELT ON COLUMN ${col}. RE-ROUTE IT TO FIGHT.`, C.amber];
  });
}

/** S2: the columns an installed turret takes belts on, as a sentence. */
export function intakeColumnsLine(b: Build, t: number): string | null {
  const s = turretSlots(b)[t];
  if (!s?.turret) return null;
  const cols = s.intakes.map((c) => c + 1);
  return cols.length > 1 ? `IT TAKES BELTS ON COLUMNS ${cols.join(" AND ")}.` : `IT TAKES A BELT ON COLUMN ${cols[0]} ONLY.`;
}

/** An EMPTY TURRET SLOT's panel (S1, S2, S4). */
export function emptySlotSpec(b: Build, t: number): TurretPanelSpec {
  const s = hullSlots(b.hero)[t];
  return {
    icon: null, title: `EMPTY TURRET SLOT ${t + 1}`, color: C.slate4, sub: `COLUMNS ${s.col0 + 1} AND ${s.col0 + s.width}`,
    text: [
      ...deadEndLines(b, t),
      "IT TAKES ANY TURRET. DRAG ONE HERE FROM CARGO OR THE SHOP.",
      "AN EMPTY SLOT TAKES NO BELTS AND HAS NO CORE SOCKET OR GEAR SLOTS.",
    ],
  };
}

/** An installed turret's title: its name and stars (inspector.ts turret case). */
export function slotTitle(b: Build, t: number): string {
  const tu = turretSlots(b)[t]?.turret;
  return tu ? starred(ITEMS[tu.def].name, starsOf(tu)) : `TURRET SLOT ${t + 1}`;
}

/** Its colour: the turret's rarity. */
export function slotColor(b: Build, t: number): string {
  const tu = turretSlots(b)[t]?.turret;
  return tu ? RARITY_COLOR[ITEMS[tu.def].rarity] : C.white;
}

/** Its icon: the turret's. */
export function slotIcon(b: Build, t: number): HTMLCanvasElement | null {
  const tu = turretSlots(b)[t]?.turret;
  return tu ? itemIcon(tu.def) : null;
}

/**
 * S4/S10: the CORE SOCKET and every GEAR SLOT of the turret in slot t, filled or empty, in hardpoint order.
 * `gearText(def, stars)` is a gear piece's own effect line (inspector.ts starEffectLine). `compact` (the phone's
 * four-line band): one line lists every gear slot, "3 GEAR SLOTS: EXT. CHAMBER, HOPPER, 1 EMPTY".
 */
export function socketLines(b: Build, t: number, coreName: string, gearText: (def: string, stars: number) => string, compact = false): string[] {
  const s = turretSlots(b)[t];
  if (!s?.turret) return [];
  const gear = gearOn(b, t);
  const out = [`CORE SOCKET: ${coreName}`];
  if (compact) {
    const names = gear.slice(0, s.gearSlots).map((m) => starred(ITEMS[m.def].name, starsOf(m)));
    const empty = s.gearSlots - names.length;
    const list = [...names, ...(empty ? [`${empty} EMPTY`] : [])].join(", ");
    out.push(`${plural(s.gearSlots, "GEAR SLOT")}: ${list}`);
    return out;
  }
  for (let i = 0; i < s.gearSlots; i++) {
    const m = gear[i];
    if (!m) {
      out.push(`GEAR SLOT ${i + 1}: EMPTY`);
      continue;
    }
    const fx = gearText(m.def, starsOf(m));
    out.push(`GEAR SLOT ${i + 1}: ${starred(ITEMS[m.def].name, starsOf(m))}${fx ? `, ${fx}` : ""}`);
  }
  return out;
}

/** The notes under an installed turret's sockets: a free starting copy, and the reason to buy it. */
export function slotNotes(b: Build, t: number): string[] {
  const tu = turretSlots(b)[t]?.turret;
  if (!tu) return [];
  const d = ITEMS[tu.def];
  const cols = intakeColumnsLine(b, t);
  return [
    ...(cols ? [cols] : []),
    ...(tu.free && !canSellTurret(tu) ? ["YOUR HULL'S FREE STARTING TURRET. IT CAN'T BE SOLD AT 1 STAR."] : []),
    ...(d.reason ? [d.reason.toUpperCase()] : []),
    "HOLD IT, OR DRAG IT WITH NO GEAR ON, TO MOVE OR SWAP IT.",
  ];
}

/** An installed turret's sub line: its class and slot, "HEAVY TURRET IN SLOT 2". */
export function slotSub(b: Build, t: number): string {
  const td = turretSlots(b)[t]?.td;
  return td ? `${td.kind.toUpperCase()} TURRET IN SLOT ${t + 1}` : `TURRET SLOT ${t + 1}`;
}

/** S5: an installed turret's TO CARGO and SELL buttons (a 1-star starting turret can't be sold). */
export function slotActions(ctx: Ctx, t: number): NonNullable<TurretPanelSpec["actions"]> {
  const tu = turretSlots(ctx.run.build)[t]?.turret;
  if (!tu) return [];
  return [
    { id: "turretcargo", label: "TO CARGO", onTap: () => { storeTurretAt(ctx, t); } },
    ...(canSellTurret(tu) ? [{ id: "turretsell", label: `SELL +${turretSellValue(tu)}G`, onTap: () => { sellTurretAt(ctx, t); } }] : []),
  ];
}
