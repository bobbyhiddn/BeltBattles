// 0.8.0 I1 M4 (REQ-BFG-023 part 2; VERIFIED-D1 Q1; DESIGN-wave3.md 2.1 and 2.5): the seven v2 families as the player
// sees them. Each has a colour and a 3x3 mark of its own shape (colour is never the only cue, ARSENAL.md 8.1), and the
// glossary line of DESIGN 2.1, the one sentence a player can test any card against (kept here for the inspect view's
// glossary line, which I1 leaves open: output-I1/REPORT.md). Tags are shop hints: nothing in play reads them (content.ts
// ModuleTag). The shop card shows the marks (shop.ts drawCard), the desk's hover tooltip the names, and each module's
// panel the names in its header, or the marks where the names have no room (inspector.ts planPanel).
import { ITEMS, type ModuleTag } from "../sim/content";
import { C } from "../render/palette";
import { rect, type G } from "../render/pixel";
import type { Span } from "./richText";

export interface Family {
  tag: ModuleTag;
  colour: string;
  /** The 3x3 mark, row by row ("x" lit). */
  mark: readonly [string, string, string];
  /** DESIGN-wave3.md 2.1's glossary line, in the game's capitals. */
  glossary: string;
}

/** The families in DESIGN 2.1's order (the order a module's tags are shown in). */
export const FAMILY_ORDER: readonly ModuleTag[] = ["FORGE", "HARASS", "SWARM", "BURST", "TEMPO", "TWIN", "PLATE"];

export const FAMILY: Readonly<Record<ModuleTag, Family>> = {
  FORGE: {
    tag: "FORGE", colour: C.fire3, mark: [".x.", "xxx", "xxx"], // a flame
    // Y6 (release Y; DESIGN-Y 4.1; BRIEF-Y6 words): POISON is retired (glossary.ts), so the line drops it (was "ADDS
    // DAMAGE, BURN, POISON OR FRAY ..."; a getter behind the star switch until the flip, Y7b2)
    glossary: "ADDS DAMAGE, BURN OR FRAY TO EACH PAYLOAD ON THE BELT, OR BUILDS DAMAGE THE LONGER THE PAYLOAD RIDES.",
  },
  HARASS: {
    tag: "HARASS", colour: C.ice, mark: ["xx.", ".x.", ".xx"], // a bolt
    // NUM-3 (R1's STUN fold): every stop is a STUN (was "STALLS, FREEZES, SLOWS, WRECKS OR RIPS ...")
    glossary: "STUNS, WRECKS OR RIPS ENEMY MACHINES; PAYS FOR DOING IT; OR STOPS THE ENEMY DOING IT TO YOU.",
  },
  SWARM: {
    tag: "SWARM", colour: C.lime, mark: ["x.x", "...", "x.x"], // many
    glossary: "MORE PAYLOADS AND MORE HITS: SECOND FACTORIES, BATCHES, COPIES, PELLETS AND LIGHT GUNS, AND WHAT PAYS FOR EACH PAYLOAD.",
  },
  BURST: {
    tag: "BURST", colour: C.red, mark: [".x.", "xxx", ".x."], // a burst
    glossary: "FEWER, BIGGER HITS: HEAVY SLUGS AND ROUNDS, RIG CHAINS ON ONE PAYLOAD, FULL-CHAMBER VOLLEYS, PACKED AND CHARGED SHELLS, HEAVY GUNS.",
  },
  TEMPO: {
    tag: "TEMPO", colour: C.yellow, mark: ["xxx", ".x.", "xxx"], // an hourglass
    // Y7b2 (the words): LOAD TIME retires (glossary.ts RETIRED) and COMMISSION is an engine word, so the line says what each
    // is (was "..., FIRE RATE, LOAD TIME, COMMISSIONING, PULSES AND FUSES.")
    glossary: "WHEN THINGS HAPPEN: BELT SPEED, FIRE RATE, HOW LONG A GUN WAITS TO FIRE, WHEN RIGS START, PULSES AND FUSES.",
  },
  TWIN: {
    tag: "TWIN", colour: C.blue, mark: ["x.x", "x.x", "x.x"], // two belts
    glossary: "TWO BELTS INTO ONE GUN: MATCHED BELTS, PAIRS THAT ARRIVE TOGETHER, AND WHAT PAYS FOR A PAIR.",
  },
  PLATE: {
    tag: "PLATE", colour: C.plate3, mark: ["xxx", "x.x", "xxx"], // a plate
    glossary: "A HULL THAT OUTLASTS THE FIGHT: PLATING, REPAIR AND GUARDS, AND WHAT TURNS PLATING INTO DAMAGE.",
  },
};

/** A module's families in FAMILY_ORDER ([] for a generalist, a supply or an unknown id). */
export function familiesOf(def: string): ModuleTag[] {
  const tags = Object.prototype.hasOwnProperty.call(ITEMS, def) ? ITEMS[def].tags ?? [] : [];
  return FAMILY_ORDER.filter((t) => tags.includes(t));
}

/** A module's families line, "FORGE, TEMPO" ("" for none). Commas, not "·": T2 keeps the middle dot out of player text. */
export function familiesText(def: string): string {
  return familiesOf(def).join(", ");
}

/** A families line as spans: each name in its family's colour, the commas between in `sep`. */
export function familySpans(text: string, sep: string = C.slate3): Span[] {
  const out: Span[] = [];
  text.split(", ").forEach((name, i) => {
    if (i) out.push({ t: ", ", c: sep });
    out.push({ t: name, c: FAMILY[name as ModuleTag]?.colour ?? sep, whole: true });
  });
  return out;
}

/** Draw a family's 3x3 mark with its top-left at (x, y); `dim` greys it (a sold card). */
export function drawFamilyMark(g: G, tag: ModuleTag, x: number, y: number, dim = false): void {
  const col = dim ? C.slate1 : FAMILY[tag].colour;
  FAMILY[tag].mark.forEach((row, v) => {
    for (let u = 0; u < 3; u++) if (row[u] === "x") rect(g, x + u, y + v, 1, 1, col);
  });
}

/** Draw a module's marks in a row from (x, y), 4 px apart; returns the width drawn (0 for none). */
export function drawFamilyMarks(g: G, def: string, x: number, y: number, dim = false): number {
  const tags = familiesOf(def);
  tags.forEach((t, i) => drawFamilyMark(g, t, x + i * 4, y, dim));
  return tags.length ? tags.length * 4 - 1 : 0;
}
