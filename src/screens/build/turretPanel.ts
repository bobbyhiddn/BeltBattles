// 0.6.2s (REQ-BFG-031 S10): what the build screen's details panel says about TURRETS. A turret card (a shop offer
// or a cargo copy) shows its class, rarity and stars (title and sub line), its fire rate, loads, gear slots, intake
// and one-line reason; an EMPTY TURRET SLOT says what it takes; an installed turret's panel (inspector.ts) adds its
// CORE SOCKET and every GEAR SLOT, filled or empty, the belts a swap left without an intake, TO CARGO and SELL.
// Player text follows REQ-BFG-032: plain sentences, numbers with units, no dot chains, wrapped by the panel.
// 0.6.2rel (REQ-BFG-032 x REQ-BFG-031): the text comes from the glossary (src/ui/abilityText.ts: the turret block, each
// gear piece's clause) or is a whole sentence in its units, and every panel is inspector.ts PanelText (blocks wrapped by
// the one helper, src/ui/richText.ts, at draw time): a turret card is inspector.ts's offer or cargo panel (the glossary
// has every turret), an EMPTY TURRET SLOT is emptySlotPanel, and an installed turret is inspector.ts turretPanel, built
// with the helpers below. The catalogue's one-line `reason` isn't shown: it repeats the class, intake, rate and loads the
// glossary states at each star, and four of them quote the 1-star interval.

import type { Run } from "../../game/run";
import { ITEMS } from "../../sim/content";
import { canSellTurret, deadEndsAt, gearOn, hullSlots, kx, turretSellValue, turretSlots, type Build } from "../../sim/deck";
import { coreFor } from "../../sim/deck"; // shoptap: touchSlotHint
import { starsOf, starText } from "../../sim/stars";
import { C, RARITY_COLOR } from "../../render/palette";
import { itemIcon } from "../../render/sprites";
import { abilityText, nextStarText } from "../../ui/abilityText";
import { buy, selectGain, sell, type Ctx } from "./actions";
import type { Sel } from "./layout";
import { cargoPanel, offerPanel, type Block, type PanelText } from "./inspector"; // 0.6.2rel: the text series' panels
import { sellTurretAt, storeTurretAt } from "./turretActions";

/** inspector.ts Spec's shape (structural): the icon, the panel's text (0.6.2rel: PanelText) and its buttons. */
export interface TurretPanelSpec {
  icon: HTMLCanvasElement | null;
  text: PanelText;
  actions: { id: string; label: string; primary?: boolean; danger?: boolean; disabled?: boolean; onTap: () => void }[];
}

const starred = (name: string, stars: number): string => (stars > 1 ? `${name} ${starText(stars)}` : name);
const isTurret = (def: string): boolean => (Object.prototype.hasOwnProperty.call(ITEMS, def) ? ITEMS[def] : undefined)?.kind === "turret";

/** The facts of turret `def` at `stars`, most important first: the glossary's sentences (its class, fire rate and loads;
 *  the star's rate against 1 star; its intake; its gear slots and core socket; its shots' flight), then the next star. */
export function turretFacts(def: string, stars: number): string[] {
  const next = nextStarText(def, stars);
  return [...abilityText(def, stars).sentences, ...(next ? [next] : [])];
}

/** The hint under a turret card: how to install it (0.6.2s S5; the offer can be dragged to cargo too). shoptap (D2):
 *  `touch`: a touch tap never installs, so a cargo turret's hint names the drag alone. */
export const turretHint = (offer: boolean, touch = false): string =>
  (offer ? "DRAG IT ONTO A TURRET SLOT TO INSTALL IT, OR ONTO CARGO."
    : touch ? "DRAG IT ONTO A TURRET SLOT TO INSTALL IT." : "DRAG IT ONTO A TURRET SLOT, OR TAP A SLOT, TO INSTALL IT.");

/** A free starting copy's note (S6): at 1 star it can't be sold; merged, it holds the starting copy. U2c step 5 (REQ-BFG-046;
 *  T1 2.2's notice form, LABEL: TEXT.): were "IT HOLDS YOUR HULL'S FREE STARTING COPY." and "IT IS YOUR HULL'S FREE STARTING
 *  TURRET, SO IT CAN'T BE SOLD AT 1 STAR.", the same meanings. */
export const freeNote = (canSell: boolean): string =>
  (canSell ? "STARTING TURRET: IT HOLDS YOUR HULL'S FREE COPY." : "STARTING TURRET: YOUR HULL'S FREE ONE, SO IT CAN'T BE SOLD AT ★1.");

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
    const text = cargoPanel(run, it.uid, !!ctx.touch); // shoptap (D2): the touch hint
    if (!text) return null;
    const can = canSellTurret(it);
    return {
      icon: itemIcon(it.def), text,
      actions: can ? [{ id: "sell", label: `SELL +${turretSellValue(it)}G`, onTap: () => sell(ctx, it.uid) }] : [],
    };
  }
  if (show.kind === "turret") {
    const s = turretSlots(run.build)[show.index];
    if (!s) return null;
    if (s.turret) return undefined; // an installed turret: inspector.ts's turret case (with the hooks below)
    return { icon: null, text: emptySlotPanel(run.build, show.index), actions: [] };
  }
  return undefined;
}

function offerSpec(ctx: Ctx, run: Run, wagon: number, slot: number, hovering: boolean): TurretPanelSpec | null {
  const o = run.shop.wagons[wagon].offers[slot];
  const text = offerPanel(run, wagon, slot, !!ctx.touch); // shoptap (D2): the touch hint
  if (!text) return null;
  const can = !o.sold && run.gold >= o.price;
  return {
    icon: itemIcon(o.def), text,
    actions: hovering ? [] : [{
      id: "buy", label: text.labels[0], primary: can, disabled: !can,
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

/** S2/S5: the belts ending under slot t that no intake takes, as warnings: which belt, which column, and why; `short`:
 *  one line each for a short band (the phone). */
export function deadEndLines(b: Build, t: number, short = false): string[] {
  const s = turretSlots(b)[t];
  return deadEndsAt(b, t).map((ri) => {
    const cells = b.routes[ri].cells, col = kx(cells[cells.length - 1]) + 1;
    if (short) return `BELT ${ri + 1} IS A DEAD END ON COLUMN ${col}.`;
    const who = s?.turret ? "THIS TURRET TAKES" : "AN EMPTY SLOT TAKES";
    return `BELT ${ri + 1} IS A DEAD END: ${who} NO BELT ON COLUMN ${col}. RE-ROUTE IT TO FIGHT.`;
  });
}

/** S2: the columns an installed turret takes belts on, as a sentence. */
export function intakeColumnsLine(b: Build, t: number): string | null {
  const s = turretSlots(b)[t];
  if (!s?.turret) return null;
  const cols = s.intakes.map((c) => c + 1);
  return cols.length > 1 ? `IT TAKES BELTS ON COLUMNS ${cols.join(" AND ")}.` : `IT TAKES A BELT ON COLUMN ${cols[0]} ONLY.`;
}

/** An EMPTY TURRET SLOT's panel (S1, S2, S4): the belts it leaves dead ends, what it takes, and how to fill it. */
export function emptySlotPanel(b: Build, t: number): PanelText {
  const s = hullSlots(b.hero)[t];
  const body: Block[] = [
    ...deadEndLines(b, t).map((text): Block => ({ role: "warn", text, keep: true })),
    { role: "ability", text: "IT TAKES ANY TURRET.", keep: true },
    { role: "ability", text: "AN EMPTY SLOT TAKES NO BELTS AND HAS NO CORE SOCKET OR GEAR SLOTS.", rank: 2 },
    { role: "hint", text: "DRAG A TURRET HERE FROM CARGO OR THE SHOP.", rank: 6 },
  ];
  const short: Block[] = [...deadEndLines(b, t, true).map((text): Block => ({ role: "warn", text, keep: true })), ...body.filter((x) => x.role !== "warn")];
  return {
    title: `EMPTY TURRET SLOT ${t + 1}`, color: C.slate4, sub: `COLUMNS ${s.col0 + 1} AND ${s.col0 + s.width}`,
    body, variants: [{ body: short }, { body: short, tight: true }], labels: [],
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

/** One socket row of an installed turret: its label ("CORE", "GEAR 1"), what sits there (or EMPTY), and the piece. */
export interface SocketRow {
  label: string;
  text: string;
  def?: string;
  stars?: number;
}

/**
 * S4/S10: the CORE SOCKET and every GEAR SLOT of the turret in slot t, filled or empty, in hardpoint order, one row each
 * (a turret with one gear slot labels it GEAR). `gearText(def, stars)`, when given, is a gear piece's clause from the
 * glossary (abilityText.ts gist), after its name. `compact` (a short band): one GEAR row lists every slot, "EXT. CHAMBER
 * ★★, HOPPER AND 1 EMPTY SLOT".
 */
export function socketLines(b: Build, t: number, coreName: string, gearText?: (def: string, stars: number) => string, compact = false): SocketRow[] {
  const s = turretSlots(b)[t];
  if (!s?.turret) return [];
  const gear = gearOn(b, t).slice(0, s.gearSlots);
  const out: SocketRow[] = [{ label: "CORE", text: coreName }];
  if (compact) {
    const names = gear.map((m) => starred(ITEMS[m.def].name, starsOf(m)));
    const empty = s.gearSlots - names.length;
    // 0.6.2rel2 (the rehearsal's nit 2): the empty hardpoints say what they are, "3 EMPTY SLOTS", never a bare "3 EMPTY"
    const all = [...names, ...(empty ? [`${empty} EMPTY SLOT${empty === 1 ? "" : "S"}`] : [])];
    out.push({ label: "GEAR", text: all.length > 1 ? `${all.slice(0, -1).join(", ")} AND ${all[all.length - 1]}` : all[0] ?? "NONE" });
    return out;
  }
  for (let i = 0; i < s.gearSlots; i++) {
    const m = gear[i], label = s.gearSlots > 1 ? `GEAR ${i + 1}` : "GEAR";
    if (!m) {
      out.push({ label, text: "EMPTY" });
      continue;
    }
    const name = starred(ITEMS[m.def].name, starsOf(m)), fx = gearText?.(m.def, starsOf(m));
    out.push({ label, text: fx ? `${name}: ${fx}.` : name, def: m.def, stars: starsOf(m) });
  }
  return out;
}

/** The notes under an installed turret's sockets, whole sentences: the columns it takes belts on, and a free starting
 *  copy's note. */
export function slotNotes(b: Build, t: number): string[] {
  const tu = turretSlots(b)[t]?.turret;
  if (!tu) return [];
  const cols = intakeColumnsLine(b, t);
  return [...(cols ? [cols] : []), ...(tu.free ? [freeNote(canSellTurret(tu))] : [])];
}

/** The move hint under an installed turret (S5). */
export const SLOT_HINT = "HOLD IT, OR DRAG IT WITH NO GEAR ON, TO MOVE OR SWAP IT.";

/** shoptap (REQ-BFG-035): the hint under an installed turret on touch: a tap on the selected turret reads its core and
 *  gear, one at a time (edit.ts fittedPieces), then SLOT_HINT. A turret with neither: SLOT_HINT alone. */
export function touchSlotHint(b: Build, t: number): string {
  const s = turretSlots(b)[t];
  const core = !!coreFor(b, t), gear = !!s && gearOn(b, t).slice(0, s.gearSlots).length > 0;
  const what = core && gear ? "ITS CORE AND GEAR" : core ? "ITS CORE" : gear ? "ITS GEAR" : "";
  return what ? `TAP IT AGAIN TO READ ${what}. ${SLOT_HINT}` : SLOT_HINT;
}

/** An installed turret's sub line: its class and slot, "HEAVY TURRET IN SLOT 2". */
export function slotSub(b: Build, t: number): string {
  const td = turretSlots(b)[t]?.td;
  return td ? `${td.kind.toUpperCase()} TURRET IN SLOT ${t + 1}` : `TURRET SLOT ${t + 1}`;
}

/** S5: an installed turret's TO CARGO and SELL buttons (a 1-star starting turret can't be sold). */
export function slotActions(ctx: Ctx, t: number): TurretPanelSpec["actions"] {
  const tu = turretSlots(ctx.run.build)[t]?.turret;
  if (!tu) return [];
  return [
    { id: "turretcargo", label: "TO CARGO", onTap: () => { storeTurretAt(ctx, t); } },
    ...(canSellTurret(tu) ? [{ id: "turretsell", label: `SELL +${turretSellValue(tu)}G`, onTap: () => { sellTurretAt(ctx, t); } }] : []),
  ];
}

/** The labels of slotActions, for the panel's layout (inspector.ts turretPanel). */
export function slotLabels(b: Build, t: number): string[] {
  const tu = turretSlots(b)[t]?.turret;
  return tu ? ["TO CARGO", ...(canSellTurret(tu) ? [`SELL +${turretSellValue(tu)}G`] : [])] : [];
}
