// U2b (REQ-BFG-046; REQ-BFG-032's four rules on the captains): a rival captain's player text, its trick and its blurb
// (src/sim/rivals.ts, read as it is: src/sim is not the UI's to edit), drawn with the keyword colours. A keyword a captain's
// line names (FRAY STORM, THICK PLATE, EVERY PAIR, EVERY HIT BURNS) draws in its icon's colour, from the one source every
// face uses (render/font.ts KEYWORDS and ICON_COLOUR); the rest of the line is drawn as colourize draws any line (its
// numbers in the line's own colour). Each keyword's word forms are listed, not guessed: "ARMOR PLATES" is the ARMOR
// PLATING supply (hull), not the PLATE keyword, so PLATES stays plain. The road fork's card and its inspect panel use
// it (screens/fork); the portrait and the tags (ui/captain.ts) carry no keyword.

import { ICON, ICON_COLOUR, KEYWORDS, type KeywordName } from "../render/font";
import { colourize, type Span } from "./richText";

/** Each keyword's word forms in captain text: the keyword, and the plural or past forms the lines use. */
export const CAPTAIN_FORMS: Readonly<Record<KeywordName, readonly string[]>> = {
  BURN: ["BURN", "BURNS"],
  STUN: ["STUN", "STUNS", "STUNNED"],
  HEAT: ["HEAT"],
  FRAY: ["FRAY"],
  PLATE: ["PLATE", "PLATED"],
  PAIR: ["PAIR", "PAIRS"],
};

const COLOUR_OF: ReadonlyMap<string, string> = new Map(
  KEYWORDS.flatMap((k) => CAPTAIN_FORMS[k].map((w): [string, string] => [w, ICON_COLOUR[ICON[k]]])),
);

/** The keyword colour of one word of a captain's line ("PLATED," is PLATE's), else undefined. */
export function captainKeywordColour(word: string): string | undefined {
  const core = /^[^A-Z]*([A-Z]+)[^A-Z]*$/.exec(word)?.[1];
  return core ? COLOUR_OF.get(core) : undefined;
}

/** A captain's line as rich spans: each keyword in its colour, everything else as colourize draws it in `base`. */
export function captainSpans(text: string, base: string): Span[] {
  const out: Span[] = [];
  text.split(" ").forEach((w, i) => {
    if (i > 0) out.push({ t: " ", c: base });
    const m = /^([^A-Z]*)([A-Z]+)([^A-Z]*)$/.exec(w);
    const kc = m ? COLOUR_OF.get(m[2]) : undefined;
    if (!m || !kc) {
      out.push(...colourize(w, base, base));
      return;
    }
    if (m[1]) out.push({ t: m[1], c: base });
    out.push({ t: m[2], c: kc });
    if (m[3]) out.push({ t: m[3], c: base });
  });
  return out;
}
