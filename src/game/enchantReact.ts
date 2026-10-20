// ENCHANT-1 (REQ-BFG-085; BRIEF-ENCHANT1 E3, E7): THE BATTLE'S LINE for a BRACED part. The game keeps no text log of a fight: a SimEvent becomes
// sound and juice in arenaReact.ts react() (a number popping over a hull, a ring, a spray), and the one text that floats in the world is the
// damage-number pool (render/fx.ts popup). So the new `braced` event (sim/battle.ts: a BRACED part swallowed an enemy STUN, the first 2 x stars
// each fight) is said the way the battle says everything: a ring and a pop over the part, in the word's colour, reading BRACED. The full line,
// `BRACED SPLITTER: THE STUN DID NOTHING` (the word first in its colour, the part's name in its rarity colour), is bracedLine: the text the
// pop stands for, and what a surface that prints one reads. Display only: it reads the arena and writes nothing in the sim. With the switch off
// the event never occurs, and this does nothing if one is handed in.

import type { Arena } from "./arena";
import type { Side, SimEvent } from "../sim/battle";
import { ITEMS, type ItemDef } from "../sim/content";
import { turretSlots } from "../sim/deck";
import { ENCHANT_DEFS, enchantRules } from "../sim/enchant";
import { C, RARITY_COLOR } from "../render/palette";
import { sx, sy } from "../render/frame";
import { turretPivotX, turretPivotY } from "../render/cruiser";
import { nameSpans } from "../ui/enchantFaces";
import { lineText, type Span } from "../ui/richText";

/** What the line says after the part's name. */
export const BRACED_TAIL = ": THE STUN DID NOTHING";

/** The battle's line for a swallowed STUN as spans: `BRACED` in the word's colour, the part's name in its rarity colour, then the tail. */
export function bracedLine(def: Pick<ItemDef, "name" | "rarity"> | undefined): Span[] {
  const name = def?.name ?? "PART", rarity = def ? RARITY_COLOR[def.rarity] ?? C.white : C.white;
  return [...nameSpans("braced", name, rarity), { t: BRACED_TAIL, c: C.bone }];
}

/** The same line as plain text: `BRACED SPLITTER: THE STUN DID NOTHING`. */
export const bracedLineText = (def: Pick<ItemDef, "name" | "rarity"> | undefined): string => lineText(bracedLine(def));

/** The part a `braced` event names: its def and its middle on screen (rest-screen px, the arena's own), or undefined where it is gone. */
export function bracedPart(
  a: Pick<Arena, "b" | "drawn">,
  e: Extract<SimEvent, { type: "braced" }>,
  mid: (side: Side, q: { uid: number; x: number; y: number; def: ItemDef }) => [number, number],
): { def: ItemDef | undefined; x: number; y: number } | undefined {
  const s = a.b.sides[e.side], fr = a.drawn[e.side];
  if (e.kind === "turret") {
    const slot = turretSlots(s.build)[e.ref];
    if (!slot?.td) return undefined;
    return { def: slot.turret ? ITEMS[slot.turret.def] : undefined, x: turretPivotX(fr, slot.col0, slot.width), y: turretPivotY(fr, slot.col0, slot.width) };
  }
  const q = e.kind === "gate" ? s.gates.find((v) => v.uid === e.ref) : e.kind === "factory" ? s.factories.find((v) => v.uid === e.ref) : undefined;
  if (!q) return undefined;
  const [lx, ly] = mid(e.side, q);
  return { def: q.def, x: sx(fr, lx, ly), y: sy(fr, lx, ly) };
}

/** react()'s `braced` case: a ring (not at the fast speeds, as the other rings) and the word's pop over the part. `mid`: arenaReact.ts
 *  pieceMid (a rig's or factory's middle, SHAPES-1's turned box), passed in so this file imports nothing from arenaReact. */
export function bracedReact(a: Arena, e: Extract<SimEvent, { type: "braced" }>, mid: (side: Side, q: { uid: number; x: number; y: number; def: ItemDef }) => [number, number]): void {
  if (!enchantRules()) return;
  const at = bracedPart(a, e, mid);
  if (!at) return;
  const word = ENCHANT_DEFS.braced;
  if (a.speed <= 2) a.fx.ring(at.x, at.y, 9, word.color);
  a.fx.popup(at.x, at.y - 7, word.name, word.color, false, a.b.scaled);
}
