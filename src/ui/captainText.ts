// U2b (REQ-BFG-046; REQ-BFG-032's four rules on the captains): a rival captain's player text, its trick and its blurb
// (src/sim/rivals.ts, read as it is: src/sim is not the UI's to edit), drawn with the keyword colours. A keyword a captain's
// line names (FRAY STORM, THICK PLATE, EVERY PAIR, EVERY HIT BURNS) draws in its icon's colour, from the one source every
// face uses (render/font.ts KEYWORDS and ICON_COLOUR); the rest of the line is drawn as colourize draws any line (its
// numbers in the line's own colour). Each keyword's word forms are listed, not guessed: "ARMOR PLATES" is the ARMOR
// PLATING supply (hull), not the PLATE keyword, so PLATES stays plain. The road fork's card and its inspect panel use
// it (screens/fork); the portrait and the tags (ui/captain.ts) carry no keyword.

import { ICON, ICON_COLOUR, KEYWORDS, type KeywordName } from "../render/font";
import { colourize, type Span } from "./richText";
import { gameWords } from "./gameWords"; // CARD-3 (REQ-BFG-107)

/** Each keyword's word forms in captain text: the keyword, and the plural or past forms the lines use. */
export const CAPTAIN_FORMS: Readonly<Record<KeywordName, readonly string[]>> = {
  BURN: ["BURN", "BURNS"],
  STUN: ["STUN", "STUNS", "STUNNED"],
  HEAT: ["HEAT"],
  FRAY: ["FRAY"],
  PLATE: ["SHIELD", "SHIELDED"], // CARD-3 (REQ-BFG-107): the soak layer's player words (after gameWords)
  PAIR: ["PAIR", "PAIRS"],
  // SUS-B (REQ-BFG-069): the sustain keywords (no captain line names one today; THANE KARSK's plan is IRON WALL)
  SHIELD: ["WARD", "WARDS"], // CARD-3: the block's
  HEAL: ["HEAL", "HEALS"],
  REGEN: ["REGEN"],
};

const COLOUR_OF: ReadonlyMap<string, string> = new Map(
  KEYWORDS.flatMap((k) => CAPTAIN_FORMS[k].map((w): [string, string] => [w, ICON_COLOUR[ICON[k]]])),
);

/** The keyword colour of one word of a captain's line ("PLATED," is PLATE's), else undefined. */
export function captainKeywordColour(word: string): string | undefined {
  const core = /^[^A-Z]*([A-Z]+)[^A-Z]*$/.exec(word)?.[1];
  return core ? COLOUR_OF.get(core) : undefined;
}

/**
 * CARD-2 (REQ-BFG-081, K3 (i); REVIEW-WORDS1 note 2): two captains' lines in src/sim/rivals.ts still print a retired word
 * (VOCAB.md: MACHINE(S), MATCHED). RIVALS keeps its strings (src/sim is protected; rivals.npcs.test.ts pins the trick);
 * every captain line the player reads (the road fork's card and its inspect panel) goes through captainSpans, so it draws
 * the current words here, as runeText.ts draws RuneDef.text's. Checked in src/sim: SPARKFANG's synergy is the GALVANIC
 * COIL (rivalBuilds.ts:298; G(2, "coil") on his belts), whose slug stuns the part it hits (a PART: a rig, factory, turret
 * or belt tile); BRASSWICK's is the TWIN GAUGE, TWIN MOULD and TWIN TRIGGER (rivalBuilds.ts:631).
 */
export const CAPTAIN_TEXT: ReadonlyArray<readonly [string, string]> = [
  ["GALVANIC COILS STUN YOUR MACHINES.", "GALVANIC COILS STUN YOUR PARTS."], // SPARKFANG's blurb
  ["MATCHED POUR", "TWIN POUR"], // BRASSWICK's trick (alone, or after his name in the inspect panel's title)
  // CARD-3 (REQ-BFG-107): PLATE leaves the game's text. These two PLATES are ARMOR PACKs (+hull, the plating supply;
  // bb-0.8.6 renamed ARMOR PLATE to ARMOR PACK), not the soak layer: rivalBuilds.ts P() = { plating } upgrades, two for
  // MOTH QUEEN ("ARMOR PACKs on her two plates") and three for OLD BULWARK ("on his three plates")
  ["SPLIT BOLTS, TWO PLATES.", "SPLIT BOLTS, TWO ARMOR PACKS."], // MOTH QUEEN's blurb
  ["THREE ARMOR PLATES,", "THREE ARMOR PACKS,"], // OLD BULWARK's blurb
];

/** A captain's line in the words the player reads (CAPTAIN_TEXT); any other line as it is. */
// CARD-3 (REQ-BFG-107): then the one display function (GRIMHOLD's THICK PLATE, THANE KARSK's WALL OF PLATE and THISTLEMAIL's
// PLATE and PLATED name the soak layer: SHIELD)
export const captainText = (text: string): string => gameWords(CAPTAIN_TEXT.reduce((t, [from, to]) => t.split(from).join(to), text));

/** A captain's line as rich spans: each keyword in its colour, everything else as colourize draws it in `base`. */
export function captainSpans(text: string, base: string): Span[] {
  const out: Span[] = [];
  captainText(text).split(" ").forEach((w, i) => {
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
