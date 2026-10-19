// 0.8.0 I1 M4 (REQ-BFG-023 part 2; VERIFIED-D1 Q1; DESIGN-wave3.md 2.1 and 2.5): the seven v2 families as the player
// sees them. Each has a colour and a 3x3 mark of its own shape (colour is never the only cue, ARSENAL.md 8.1), and the
// glossary line of DESIGN 2.1, the one sentence a player can test any card against (kept here for the inspect view's
// glossary line, which I1 leaves open: output-I1/REPORT.md). Tags are shop hints: nothing in play reads them (content.ts
// ModuleTag). The shop card shows the marks (shop.ts drawCard), the desk's hover tooltip the names, and each module's
// panel the names in its header, or the marks where the names have no room (inspector.ts planPanel).
import { ITEMS, type ModuleTag } from "../sim/content";
import { plainRigsRules } from "../sim/plainRigs"; // PLAIN-1F (M3, F6): the SHIELD family's line with BALLAST in it
import { C } from "../render/palette";
import { rect, type G } from "../render/pixel";
import type { Span } from "./richText";

export interface Family {
  tag: ModuleTag;
  /** CARD-3 (REQ-BFG-107): the tag as the player reads it (the PLATE family reads SHIELD, as its keyword does); the
   *  content tag stays in the code (content.ts ModuleTag). */
  word: string;
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
    tag: "FORGE", word: "FORGE", colour: C.fire3, mark: [".x.", "xxx", "xxx"], // a flame
    // Y6 (release Y; DESIGN-Y 4.1; BRIEF-Y6 words): POISON is retired (glossary.ts), so the line drops it (was "ADDS
    // DAMAGE, BURN, POISON OR FRAY ..."; a getter behind the star switch until the flip, Y7b2)
    // WORDS-1 (REQ-BFG-081; READ-1 3.2): plain words, and the line is the tag's tap note now (keywords.ts familyTargets): was
    // "ADDS DAMAGE, BURN OR FRAY TO EACH PAYLOAD ON THE BELT, OR BUILDS DAMAGE THE LONGER THE PAYLOAD RIDES."
    glossary: "ADDS DAMAGE, {*BURN} OR {*FRAY} TO SLUGS ON THE BELT, OR MORE DAMAGE THE LONGER A SLUG RIDES.",
  },
  HARASS: {
    tag: "HARASS", word: "HARASS", colour: C.ice, mark: ["xx.", ".x.", ".xx"], // a bolt
    // NUM-3 (R1's STUN fold): every stop is a STUN (was "STALLS, FREEZES, SLOWS, WRECKS OR RIPS ...")
    // WORDS-1: was "STUNS, WRECKS OR RIPS ENEMY MACHINES; PAYS FOR DOING IT; OR STOPS THE ENEMY DOING IT TO YOU."
    glossary: "STOPS OR ROBS ENEMY RIGS, FACTORIES, GUNS AND BELTS, PAYS FOR DOING IT, OR GUARDS YOURS.",
  },
  SWARM: {
    tag: "SWARM", word: "SWARM", colour: C.lime, mark: ["x.x", "...", "x.x"], // many
    // WORDS-1: was "MORE PAYLOADS AND MORE HITS: SECOND FACTORIES, BATCHES, COPIES, PELLETS AND LIGHT GUNS, AND WHAT PAYS FOR
    // EACH PAYLOAD."
    glossary: "MORE SLUGS AND MORE HITS: MORE FACTORIES, SPLIT SLUGS, PELLETS AND LIGHT GUNS, AND WHAT PAYS FOR EACH SLUG.",
  },
  BURST: {
    tag: "BURST", word: "BURST", colour: C.red, mark: [".x.", "xxx", ".x."], // a burst
    // WORDS-1: was "FEWER, BIGGER HITS: HEAVY SLUGS AND ROUNDS, RIG CHAINS ON ONE PAYLOAD, FULL-CHAMBER VOLLEYS, PACKED AND
    // CHARGED SHELLS, HEAVY GUNS."
    glossary: "FEWER, BIGGER HITS: HEAVY SLUGS, MANY RIGS ON ONE SLUG, A FULL CHAMBER FIRED AT ONCE, AND HEAVY GUNS.",
  },
  TEMPO: {
    tag: "TEMPO", word: "TEMPO", colour: C.yellow, mark: ["xxx", ".x.", "xxx"], // an hourglass
    // Y7b2 (the words): LOAD TIME retires (glossary.ts RETIRED) and COMMISSION is an engine word, so the line says what each
    // is (was "..., FIRE RATE, LOAD TIME, COMMISSIONING, PULSES AND FUSES.")
    // WORDS-1: was "WHEN THINGS HAPPEN: BELT SPEED, FIRE RATE, HOW LONG A GUN WAITS TO FIRE, WHEN RIGS START, PULSES AND FUSES."
    glossary: "WHEN THINGS HAPPEN: BELT SPEED, HOW OFTEN A GUN FIRES, HOW LONG IT WAITS, WHEN RIGS START, AND TIMERS.",
  },
  TWIN: {
    tag: "TWIN", word: "TWIN", colour: C.blue, mark: ["x.x", "x.x", "x.x"], // two belts
    // WORDS-1: was "TWO BELTS INTO ONE GUN: MATCHED BELTS, PAIRS THAT ARRIVE TOGETHER, AND WHAT PAYS FOR A PAIR."
    glossary: "TWO BELTS INTO ONE GUN: BELTS AS LONG AS EACH OTHER, A {*PAIR}, AND WHAT PAYS FOR ONE.",
  },
  PLATE: {
    tag: "PLATE", word: "SHIELD", colour: C.plate3, mark: ["xxx", "x.x", "xxx"], // a plate
    // WORDS-1: was "A HULL THAT OUTLASTS THE FIGHT: PLATING, REPAIR AND GUARDS, AND WHAT TURNS PLATING INTO DAMAGE."
    // CARD-3 (REQ-BFG-107): the tag reads SHIELD, and the line names what its members give (content.ts tags, checked):
    // SHIELD (PLATE ROLLER, ARMOR PRESS, SEAM WELDER, IRON WALL), WARD (WARD BELL), HEAL (RIVETER, MEND PRESS, MENDING
    // LOOM), guards (TOLLBOOTH, FLAK SCREEN, MANTLET, BRACE FRAME), and what turns SHIELD into damage (PLATE BREAKER,
    // ANVIL BREECH, STEAM BREECH, IRON WALL; SPALL CATCHER the damage the ship takes). Was "... {*PLATE}, {*HEAL} AND
    // GUARDS, ..."
    // PLAIN-1F (REQ-BFG-084, M3; cap's call on run 2's F6): with PLAIN_RIGS on BALLAST joins the family (plainRigs.ts tags
    // PLATE; kept, since tools/luckReport.ts and tools/wave3.ts read the tags), so the line names what it gives too: MAX
    // {HULL}, its stat row's words. Off: the line as before, byte for byte
    // SC-0912b (cap's answer to SC-0912's question 1; REQ-BFG-081): MAX HULL in words, not the heart (MAX {HULL}), as BALLAST's stat row, ladder and
    // line say it since SC-0912 (e951668) and for READ-9's reason (HEAL and REGEN are words, a heart is a picture a reader has to name). The off branch is
    // untouched. LAST CHANCE's hull option and the IRON SKIN / SPARE HULL runes still draw MAX {HULL}: a later pass
    get glossary(): string {
      return plainRigsRules()
        ? "A HULL THAT OUTLASTS THE FIGHT: {*PLATE}, {*SHIELD}, {*HEAL}, MAX HULL, GUARDS, AND WHAT TURNS {*PLATE} INTO DAMAGE."
        : "A HULL THAT OUTLASTS THE FIGHT: {*PLATE}, {*SHIELD}, {*HEAL}, GUARDS, AND WHAT TURNS {*PLATE} INTO DAMAGE.";
    },
  },
};

/** WORDS-1 (REQ-BFG-081; READ-1 3.2: the family tags drew 403 of round A's 1,172 "not understood" flags; cap's design call
 *  4): what a tap on a family tag in a panel's header shows (keywords.ts familyTargets): its name, then its line. */
export const familyNote = (tag: ModuleTag): string => `${FAMILY[tag].word}: ${FAMILY[tag].glossary}`; // CARD-3: the player's tag

/** CARD-3 (REQ-BFG-107): a family's tag as the player reads it (FAMILY.word). */
export const familyWord = (tag: ModuleTag): string => FAMILY[tag].word;
/** CARD-3: the family a player tag names ("SHIELD" -> PLATE), else undefined. */
const familyOfWord = (word: string): ModuleTag | undefined => FAMILY_ORDER.find((t) => FAMILY[t].word === word);

/** A module's families in FAMILY_ORDER ([] for a generalist, a supply or an unknown id). */
export function familiesOf(def: string): ModuleTag[] {
  const tags = Object.prototype.hasOwnProperty.call(ITEMS, def) ? ITEMS[def].tags ?? [] : [];
  return FAMILY_ORDER.filter((t) => tags.includes(t));
}

/** A module's families line, "FORGE, TEMPO" ("" for none). Commas, not "·": T2 keeps the middle dot out of player text. */
export function familiesText(def: string): string {
  return familiesOf(def).map(familyWord).join(", "); // CARD-3: the player's tags
}

/** A families line as spans: each name in its family's colour, the commas between in `sep`. */
export function familySpans(text: string, sep: string = C.slate3): Span[] {
  const out: Span[] = [];
  text.split(", ").forEach((name, i) => {
    if (i) out.push({ t: ", ", c: sep });
    const tag = familyOfWord(name); // CARD-3: the line holds the player's tags
    out.push({ t: name, c: tag ? FAMILY[tag].colour : sep, whole: true });
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
