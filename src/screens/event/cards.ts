// Road-event choice cards: key badge + label (and a gamble's odds), the exchange line (what you
// pay -> what you get, as icon + number chips), then a note or the reason a card is disabled.
// Same frame grammar as the shop cards (ink edge, top stripe, bevel sides, bottom strip).

import type { Choice, Delta } from "../../game/eventDefs";
import { gameWords } from "../../ui/gameWords"; // CARD-3 (REQ-BFG-107)
import type { ShopBadge } from "../../game/run";
import { ITEMS } from "../../sim/content";
import { ENCHANT_DEFS, isEnchantId } from "../../sim/enchant"; // ENCHANT-2 (REQ-BFG-085, T3): the shrine's word chip (its icon, its name in its colour)
import { enchantIcon } from "../../render/enchantArt"; // ENCHANT-2 (T3)
import { SHRINE_NO_PART } from "../../game/shrine"; // ENCHANT-2W (REQ-BFG-085, W2): the reason that marks the ASH SHRINE's blocked card 2 (read only)
import { hullShown } from "../../sim/hullScale"; // HULL-1a (REQ-BFG-079): an event's hull amount on the day's hull
import { C } from "../../render/palette";
import { frame, rect, type G } from "../../render/pixel";
import { drawText, textWidth } from "../../render/font";
import { beltIcon, coinIcon, heartIcon, itemIcon } from "../../render/sprites";
import { crateIcon, rerollIcon, shieldIcon, skullIcon, tagIcon } from "../../render/eventArt"; // ENCHANT-2W (W2): the crate, the run bar's cargo mark
import { drawBadge } from "../build/shop";
import { drawShapePlate, hasGrid, shapeGridSize } from "../../ui/shapePic"; // SHOPCARD-1 (REQ-BFG-113, G4): a shaped part's grid on the choice card
import type { Rect } from "../../ui/ui";

// bb-0.8.6 (REQ-BFG-051 P1): plating's short name is the pack's, ARMOR PACK (was ARMOR PLATE), so every surface says it
/** CARD-3 (REQ-BFG-107): a choice's label as the card draws it. The FIELD DOCK's PLATING gains 200 HULL (eventDefs.ts
 *  dock: gain hull 200), not SHIELD, so it reads HULL PATCH; the label itself stays (src/net/roadCap.ts and the net tests
 *  read choices by it). Any other label through the one display function.
 *  ENCHANT-2 (REQ-BFG-085; T6 fix round, E2-01): the ASH SHRINE's second card (game/shrine.ts, label OFFER A PART, which only the
 *  shrine has, so ENCHANT off draws nothing different) shows OFFER CARGO PART: two of six readers could not say where the part
 *  comes from. Display only: the Choice's label stays OFFER A PART (roadCap, events and the tests read it). */
const CHOICE_TEXT: Readonly<Record<string, string>> = { PLATING: "HULL PATCH", "OFFER A PART": "OFFER CARGO PART" };
export const choiceLabel = (label: string): string => CHOICE_TEXT[label] ?? gameWords(label);
const SHORT: Record<string, string> = { calibrate: "CALIBRATE", chamber: "EXT. CHAMBER", plating: "ARMOR PACK", grease: "GREASE", coil: "GALV. COIL" };

export function deltaIcon(d: Delta): HTMLCanvasElement {
  switch (d.k) {
    case "gold": case "bounty": return coinIcon();
    case "lives": return heartIcon(true);
    case "hull": return shieldIcon();
    case "belt": return beltIcon();
    case "item": return itemIcon(d.def);
    case "sabotage": return skullIcon();
    case "reveal": case "discount": return tagIcon();
    case "reroll": return rerollIcon();
    case "ench": return enchantIcon(d.word); // ENCHANT-2 (REQ-BFG-085, T3): the word's own icon
  }
}

/** ENCHANT-2 (REQ-BFG-085, T3): a word chip's text colour (the word's own colour, as every other face prints it), or null for any other chip. */
export const deltaColour = (d: Delta): string | null => (d.k === "ench" && isEnchantId(d.word) ? ENCHANT_DEFS[d.word].color : null);

export function itemName(def: string): string {
  return SHORT[def] ?? ITEMS[def].name;
}

/** Chip text: numbers carry their sign; items their name. */
export function deltaText(d: Delta, cost: boolean, day?: number): string {
  const s = cost ? "-" : "+";
  switch (d.k) {
    case "gold": case "lives": return `${s}${d.n}`;
    case "hull": return `${s}${hullShown(d.n, day)} HULL`; // HULL-1a (REQ-BFG-079): the day's number (`day`: the run's)
    case "belt": return `${s}${d.n} BELT`;
    case "item": return itemName(d.def);
    case "bounty": return `+${d.n} ON A HARD WIN`;
    case "sabotage": return "WEAKER WARLORD";
    case "reveal": return "DUSK DECK";
    case "discount": return `PRICES -${d.n}`;
    case "reroll": return `${d.n} FREE REROLL`;
    case "ench": return ENCHANT_DEFS[d.word as keyof typeof ENCHANT_DEFS]?.name ?? d.word.toUpperCase(); // ENCHANT-2 (REQ-BFG-085, T3): the word's name
  }
}

/** ENCHANT-2W (REQ-BFG-085; W1, E2-01): the count in front of the part the ASH SHRINE's card 2 takes, in the game's own count form (`3x DMG`): `1x`.
 *  ENCHANT-2's fix round printed a bare `1 TEMPER`; three of six readers of its re-read could not tell whether that 1 is a count or a star. */
export const SHRINE_COUNT = "1x";

/** ENCHANT-2 (REQ-BFG-085; T6 fix round, E2-01): the text of a chip as the card draws it. `bare`: a part's icon alone (T3: the word keeps the room). `count`
 *  (only a card that gains a WORD, the ASH SHRINE's): the part a card TAKES reads `1x TEMPER` (ENCHANT-2W, W1: was `1 TEMPER`), a count and then the part, because two of six readers of
 *  the strict read's round 1 asked how many parts card 2 takes (the bare name `TEMPER` showed no number). Every other chip is deltaText, as before. */
export function chipText(d: Delta, cost: boolean, day: number | undefined, bare: boolean, count = false): string {
  if (bare && d.k === "item") return "";
  const t = deltaText(d, cost, day); // HULL-1a: `day`
  return count && cost && d.k === "item" ? `${SHRINE_COUNT} ${t}` : t;
}

/** PRESENT-2 N (REQ-BFG-113 (1); backlog #492 (5)): where a chip goes and whether its part keeps its name, the rule of `chip` below as a pure function (the one
 *  rule: chip draws from it, exchangePlan and the tests read it). `text` "" is a part's icon alone; `shown` false, no room for even the icon (the chip is not
 *  drawn); `next` where the next chip starts. */
export function chipPlan(x: number, d: Delta, cost: boolean, right: number, day: number | undefined, bare: boolean, count: boolean): { text: string; w: number; shown: boolean; next: number } {
  const icon = deltaIcon(d);
  let text = chipText(d, cost, day, bare, count); // HULL-1a: `day`; ENCHANT-2 (T3): `bare`, a part's icon alone (the word keeps the room); (T6 fix round) `count`, `1 NAME`
  let w = text ? icon.width + 2 + textWidth(text, "3") : icon.width;
  // 0.6.1c: road items draw from the whole catalogue, so a long part name can meet a long good on a
  // narrow card; with no room for its name the part still shows its icon (the card never hides a gain)
  if (x + w > right && d.k === "item") [text, w] = ["", icon.width];
  if (x + w > right) return { text, w, shown: false, next: x };
  return { text, w, shown: true, next: x + w + 5 };
}

function chip(g: G, x: number, cy: number, d: Delta, cost: boolean, dim: boolean, right: number, day?: number, bare = false, count = false): number {
  const icon = deltaIcon(d), p = chipPlan(x, d, cost, right, day, bare, count);
  if (!p.shown) return x;
  g.drawImage(icon, x, cy - Math.floor(icon.height / 2));
  const word = deltaColour(d); // ENCHANT-2 (T3): a word is printed in its own colour
  if (p.text) drawText(g, p.text, x + icon.width + 2, cy - 2, dim ? C.slate3 : word ?? (cost ? C.red : C.lime), { font: "3" });
  return p.next;
}

/** ENCHANT-2 (REQ-BFG-085, T3): the width a chip takes (chip's own sum), so a card that gains a WORD can keep room for it. */
export function chipWidth(d: Delta, cost: boolean, day: number | undefined, bare: boolean, count = false): number { // ENCHANT-2W: exported for the text sheet (tools/textSheet.ts reads the card's own widths)
  const text = chipText(d, cost, day, bare, count);
  return (text ? deltaIcon(d).width + 2 + textWidth(text, "3") : deltaIcon(d).width) + 5;
}

/** ENCHANT-2 (REQ-BFG-085, T3; T6 fix round): the width the exchange line needs with every part named (`bare` false), `1 ` before a part the card takes when `count`,
 *  or with the parts as icons alone (`bare`). */
export function exchangeNeed(c: Choice, day: number | undefined, bare: boolean, count: boolean): number { // ENCHANT-2W: exported for the text sheet
  return (c.cost.length ? c.cost.reduce((n, d) => n + chipWidth(d, true, day, bare, count), 0) : textWidth("FREE", "3") + 4) + 7 + c.gain.reduce((n, d) => n + chipWidth(d, false, day, false), 0);
}

/**
 * ENCHANT-2 (REQ-BFG-085, T3; T6 fix round, E2-01): how a card that gains a WORD draws the part it takes in `w` px, null for any other card (drawn exactly as before):
 * `count` (`1x TEMPER`; ENCHANT-2W, W1: was `1 TEMPER`) where the whole line fits with the count; else `name` (`TEMPER`, what T3 drew: the count never costs a card the name it showed before);
 * else `bare` (the part as its icon alone: the word never loses its room to a long part name; the card's label says OFFER CARGO PART).
 */
export function exchangeForm(c: Choice, w: number, day?: number): "count" | "name" | "bare" | null {
  if (!c.gain.some((d) => d.k === "ench")) return null;
  if (exchangeNeed(c, day, false, true) <= w) return "count";
  return exchangeNeed(c, day, false, false) <= w ? "name" : "bare";
}

/** PRESENT-2 N: how a card that GIVES a part keeps the part's name in its exchange line. `costBare`: the parts the card takes are icons alone (the card's own rule since 0.6.1c:
 *  the cost may stay an icon where the line has no room; the gain never hides); `ownRow`: the names of the parts it gives that fit on no line beside the plates even so, drawn on a
 *  row of their own under the line (exchange). A card that gives no part, a word card (exchangeForm) and a line that names its gain as it is: { costBare: false, ownRow: [] }. */
export interface ExchangePlan {
  costBare: boolean;
  ownRow: string[];
}

/**
 * PRESENT-2 N (REQ-BFG-113 (1), REQ-BFG-087; backlog #492 (5)): the TRADER's SWAP gives a PICKAXE for a SPIKE RAIL and the desk's line drew both parts as icons alone, because
 * PRESENT-1's S1 plates (a shaped part's grid at the card's right end, for every shaped part the card takes or gives) took 15-40 px of the line. The card's own rule (the 0.6.1c comment in
 * chip): it never hides a gain. So where the line as drawn leaves a part it GIVES without its name (icon alone, or not drawn), the parts it TAKES go to icons alone first (the cost
 * may stay an icon); and where the gain's name fits no line beside the plates even so, it goes on a row of its own under the line. `room`: the line's width (exchangeRoom). Pure.
 */
export function exchangePlan(c: Choice, room: number, day?: number): ExchangePlan {
  const none: ExchangePlan = { costBare: false, ownRow: [] };
  if (exchangeForm(c, room, day) !== null || !c.gain.some((d) => d.k === "item")) return none;
  const named = (costBare: boolean): boolean => {
    let x = c.cost.length ? 0 : textWidth("FREE", "3") + 4;
    for (const d of c.cost) x = chipPlan(x, d, true, room, day, costBare, false).next;
    x += 7;
    for (const d of c.gain) {
      const p = chipPlan(x, d, false, room, day, false, false);
      if (d.k === "item" && !(p.shown && p.text)) return false;
      x = p.next;
    }
    return true;
  };
  if (named(false)) return none;
  if (named(true)) return { costBare: true, ownRow: [] };
  return { costBare: true, ownRow: c.gain.flatMap((d) => (d.k === "item" ? [itemName(d.def)] : [])) };
}

/** PRESENT-2 N: the width the grids of a card's shaped parts take at its right end (drawChoiceCard: every part it takes or gives, side by side, 2 px apart); 0 for none. */
export function plateWidth(c: Choice): number {
  const shaped = [...c.cost, ...c.gain].filter((d): d is Extract<Delta, { k: "item" }> => d.k === "item" && hasGrid(d.def));
  return shaped.reduce((n, d) => n + shapeGridSize(d.def).w + 2, 0) + Math.max(0, shaped.length - 1) * 2;
}

/** PRESENT-2 N: the exchange line's width on a card `cw` px wide: the card less 10 px, and the plates with 4 px beside them. */
export const exchangeRoom = (c: Choice, cw: number): number => cw - 10 - (plateWidth(c) ? plateWidth(c) + 4 : 0);

/** PRESENT-2 N: the row of a part's name that fits no line: 9 px under the line's middle (the line's icons end 6 px under it, the note is 16 px under it: 3 px clear each side, REQ-BFG-087's 2 px least). */
export const OWN_ROW_DY = 9;

/**
 * ENCHANT-2W (REQ-BFG-085; W2, E2-01b): THE ASH SHRINE'S BLOCKED CARD 2, with nothing in cargo, drew `FREE -> NOTHING`, which is false: the card costs a cargo part and gives
 * word B (all six readers of the strict read's round 2 flagged it). The Choice's data stays (shrine.ts: cost and gain empty, blocked SHRINE_NO_PART; the bots and the
 * road-cap model read it); only the drawing changes: it draws the line the card WOULD have, dimmed as every blocked card's chips are: the crate (the run bar's cargo mark),
 * `1x CARGO PART` (no part is named: none is in cargo), the arrow, and word B's icon and name. The red reason under it stays. Three tiers as the card with a part has:
 * the count, else `CARGO PART`, else the crate alone; the word never loses its room.
 */
export const SHRINE_GHOST_PART = "CARGO PART";
export type GhostForm = "count" | "name" | "bare";

/** Is `c` the ASH SHRINE's blocked card 2 (the one drawn as the would-be line)? Only that card carries this reason, with nothing to take and nothing to give. */
export const isShrineBlockedPart = (c: Choice): boolean => c.blocked === SHRINE_NO_PART && !c.cost.length && !c.gain.length;

/** The text of the would-be cost in a form: `1x CARGO PART`, `CARGO PART`, or "" (the crate alone). */
export const ghostText = (form: GhostForm): string => (form === "count" ? `${SHRINE_COUNT} ${SHRINE_GHOST_PART}` : form === "name" ? SHRINE_GHOST_PART : "");

/** The width the would-be cost chip takes in a form (as chipWidth: icon, 2 px, text, 5 px after). */
export function ghostWidth(form: GhostForm): number { // ENCHANT-2W: exported for the text sheet
  const text = ghostText(form), icon = crateIcon();
  return (text ? icon.width + 2 + textWidth(text, "3") : icon.width) + 5;
}

/** The form the would-be line takes in `w` px for word B: the widest of count, name, bare that fits with the word's chip (never the word's room). */
export function ghostForm(word: string, w: number, day?: number): GhostForm {
  const room = w - 7 - chipWidth({ k: "ench", word }, false, day, false);
  if (ghostWidth("count") <= room) return "count";
  return ghostWidth("name") <= room ? "name" : "bare";
}

/** Draw the would-be line of the shrine's blocked card on row cy: crate, cost text and arrow dim (slate3, slate2), word B's chip as a blocked card's chip (its icon in its own colour, its name dim). */
function drawShrineGhost(g: G, x: number, cy: number, w: number, word: string, day?: number): void {
  const icon = crateIcon(), form = ghostForm(word, w, day), text = ghostText(form);
  g.drawImage(icon, x, cy - Math.floor(icon.height / 2));
  if (text) drawText(g, text, x + icon.width + 2, cy - 2, C.slate3, { font: "3" });
  const cx = x + ghostWidth(form);
  drawText(g, "→", cx, cy - 2, C.slate2, { font: "3" });
  chip(g, cx + 7, cy, { k: "ench", word }, false, true, x + w, day);
}

/** "pay -> get" line centred on row cy (icons centred, 3x5 text). ENCHANT-2W (W2): `shrineWord`, word B of the ASH SHRINE's offer (event.ts reads it from shrine.ts shrineOffer):
 *  with it, the shrine's blocked card 2 draws its would-be line (isShrineBlockedPart); every other card draws exactly as before. */
export function exchange(g: G, x: number, cy: number, w: number, c: Choice, dim: boolean, day?: number, shrineWord?: string): void {
  if (shrineWord !== undefined && isShrineBlockedPart(c)) return drawShrineGhost(g, x, cy, w, shrineWord, day);
  const right = x + w;
  let cx = x;
  // ENCHANT-2 (REQ-BFG-085, T3): a card that gains a WORD never loses it to a long part name: when the whole line does not fit, the part is its icon alone
  // (the card's label already says OFFER CARGO PART). Every other card draws exactly as before.
  // T6 fix round (E2-01): on such a card the part it takes reads `1 NAME` where the line has the room (exchangeForm).
  const form = exchangeForm(c, w, day);
  // PRESENT-2 N (REQ-BFG-113 (1)): a card that gives a part never leaves it without its name: the cost may go to an icon alone, and a name that fits no line has a row of its own (exchangePlan)
  const plan = exchangePlan(c, w, day);
  if (!c.cost.length) cx += drawText(g, "FREE", cx, cy - 2, dim ? C.slate3 : C.lime, { font: "3" }) + 4;
  else for (const d of c.cost) cx = chip(g, cx, cy, d, true, dim, right, day, form === "bare" || plan.costBare, form === "count");
  drawText(g, "→", cx, cy - 2, dim ? C.slate2 : C.slate4, { font: "3" });
  cx += 7;
  if (!c.gain.length) drawText(g, "NOTHING", cx, cy - 2, C.slate3, { font: "3" });
  else for (const d of c.gain) cx = chip(g, cx, cy, d, false, dim, right, day, plan.ownRow.length > 0);
  if (plan.ownRow.length) drawText(g, `→ ${plan.ownRow.join(", ")}`, x, cy + OWN_ROW_DY, dim ? C.slate3 : C.lime, { font: "3" });
}

export interface CardView {
  hover: boolean;
  pressed: boolean;
  state: "open" | "chosen" | "other";
  won: boolean;
  shake: number;
  t: number;
  flash: boolean; // chosen-card blink (off with Reduced Motion)
  badge?: ShopBadge | null; // 0.6.1d2: live from run.ts:shopBadge, for a choice that gains an item
  day?: number; // HULL-1a (REQ-BFG-079): the run's day (a hull amount: the day's number with HULL_SCALE on)
  /** ENCHANT-2W (REQ-BFG-085; W2): word B of the ASH SHRINE's offer (shrine.ts shrineOffer(run.seed, ev.day)[1], read by event.ts while the shrine is open), for its blocked card 2's would-be line; absent on every other event. */
  shrineWord?: string;
}

/** The line at the foot of a choice card: why it is blocked, else its note. Y4 (release Y; BRIEF-Y4 S3): a quiet block (the
 *  SMUGGLER's NONE ON OFFER: eventDefs.ts smugglerChoice) draws no line. */
export const cardNote = (c: Choice): string | undefined => (c.quiet ? c.note : c.blocked ?? c.note);

export function drawChoiceCard(g: G, r: Rect, c: Choice, i: number, v: CardView): void {
  const dim = !!c.blocked || v.state === "other";
  const lift = v.state === "open" && !c.blocked && v.hover && !v.pressed ? 1 : 0;
  const sh = v.shake > 0 ? Math.round(Math.sin(v.shake * 70) * 2) : 0;
  const x = r.x + sh, y = r.y - lift + (v.pressed && !dim ? 1 : 0);
  const stripe = v.state === "chosen" ? (v.won ? C.lime : C.red) : dim ? C.slate1 : c.cost.length ? C.amber : C.steel2;
  if (lift) rect(g, r.x + 2, r.y + r.h - 1, r.w - 1, 2, C.ink);
  rect(g, x, y, r.w, r.h, C.ink);
  rect(g, x + 1, y + 1, r.w - 2, r.h - 2, dim ? C.night : v.state === "chosen" && v.flash ? C.slate2 : C.slate0);
  rect(g, x + 1, y + 1, r.w - 2, 3, stripe);
  rect(g, x + 1, y + 4, r.w - 2, 1, C.ink);
  rect(g, x + 1, y + 5, 1, r.h - 7, dim ? C.slate0 : C.slate2);
  rect(g, x + r.w - 2, y + 5, 1, r.h - 7, C.navy);
  rect(g, x + 1, y + r.h - 2, r.w - 2, 1, dim ? C.slate0 : C.slate1);
  // key badge [1] [2] [3]
  rect(g, x + 4, y + 7, 9, 9, C.ink);
  rect(g, x + 5, y + 8, 7, 7, dim ? C.slate1 : v.state === "chosen" ? stripe : C.amber);
  drawText(g, String(i + 1), x + 7, y + 9, C.ink, { font: "3" });
  drawText(g, choiceLabel(c.label), x + 16, y + 8, dim ? C.slate3 : C.white, { outline: C.ink }); // CARD-3 (REQ-BFG-107)
  if (c.odds !== undefined) drawText(g, `${Math.round(c.odds * 100)}% WIN`, x + r.w - 5, y + 9, dim ? C.slate3 : C.yellow, { font: "3", align: "right" });
  // 0.6.1d2: the same MERGE/wait/MAX badge as the shop card, for a choice that gains an item.
  // Never combined with odds today (a gamble's gain is always gold), but skip it defensively
  // if it ever is, so the two never draw on top of each other.
  else if (v.badge && v.state === "open") {
    const bw = Math.min(50, r.w - 24);
    drawBadge(g, x + r.w - bw - 4, y + 6, bw, v.badge, v.t);
  }
  // SHOPCARD-1 (REQ-BFG-113, G4): a choice that pays or gives a shaped part shows its grid on an ink plate at the card's right end,
  // 15 px under its top (clear of the badge and the odds above; the note line at the foot is under it), and the exchange line keeps
  // clear of it (its chips and names stop short of the plate: chip() drops what doesn't fit)
  // PRESENT-1 (S1 (b), REQ-BFG-113 (1)): EVERY such part, not the first (it was `.find`): the plates side by side from the card's right end, in
  // the exchange line's own order (what it takes, then what it gives), 2 px apart; the line keeps clear of all of them
  const shaped = [...c.cost, ...c.gain].filter((d): d is Extract<Delta, { k: "item" }> => d.k === "item" && hasGrid(d.def));
  const plateW = plateWidth(c); // PRESENT-2 N: the same sum, one function (exchangeRoom, exchangePlan, the tests)
  exchange(g, x + 5, y + 25, exchangeRoom(c, r.w), c, dim, v.day, v.shrineWord); // ENCHANT-2W (W2): + word B for the shrine's blocked card
  let platX = x + r.w - 4 - plateW;
  for (const d of shaped) {
    drawShapePlate(g, d.def, platX, y + 15, undefined, dim ? 0.5 : 1);
    platX += shapeGridSize(d.def).w + 2 + 2;
  }
  const note = cardNote(c);
  if (note) drawText(g, note, x + 5, y + r.h - 9, c.blocked ? C.red : C.slate4, { font: "3" });
  if (v.state === "chosen") {
    const tag = v.won ? "CHOSEN" : "LOST";
    const tw = textWidth(tag, "3") + 6;
    rect(g, x + r.w - tw - 4, y + r.h - 12, tw, 9, C.ink);
    drawText(g, tag, x + r.w - 7, y + r.h - 10, v.won ? C.lime : C.red, { font: "3", align: "right" });
    frame(g, x - 1, y - 1, r.w + 2, r.h + 2, v.won ? C.lime : C.red);
  } else if (v.shake > 0) frame(g, x - 1, y - 1, r.w + 2, r.h + 2, Math.floor(v.t * 20) % 2 ? C.red : C.maroon);
  else if (v.hover && !dim) frame(g, x - 1, y - 1, r.w + 2, r.h + 2, C.bone);
}
