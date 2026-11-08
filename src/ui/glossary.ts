// U2c (REQ-BFG-045, REQ-BFG-046, REQ-BFG-047): THE GLOSSARY, one source. T2a's table and API (t2a-text 34ec094: GLOSSARY,
// glossaryEntry, glossaryWordsIn, GLOSSARY_WRAP_W), ported onto the faces and the runes: one mechanic, one word, one
// definition, for tap-to-explain (src/screens/build/keywords.ts: a tap or a hover on a word shows its definition) and the
// rune cards' reminders (src/ui/runeText.ts reads RUNE_REMINDER and the keyword colours here). Pure data, no drawing.
//
// A row's definition (`def`, markup: "{*NAME}" a keyword in panel style, "{NAME}" an icon) is what a tap shows, whole: it
// leads with its word ("{*BURN}: ...", "JAM: ..."), never more than 2 lines of the 5x7 face at GLOSSARY_WRAP_W. Where:
// - the 6 face keywords (font.ts KEYWORDS): the face's reminder (faces.ts REMINDER) is the definition, with the tapped
//   piece's own number filled in (glossaryText: a faced piece's own reminder), then at most one sentence (`extra`) with what
//   the faces dropped (U2b REPORT section 12, the rows marked tap); no piece: the default number (T2a's, the sim's
//   constant), STUN's number-free, as T2a's SHOCK was (stars and pieces change it);
// - the words the kept texts still name (RULES and STUN-fold pieces, the notices): T2a's rows, in the style guide's form;
//   one mechanic one word: SHOCK and STALL are STUN's (battle.ts disrupt: one timer), PLATING is SHIELD's (CARD-3: the
//   soak layer, internal PLATE; REQ-BFG-107), FIRE RATE and
//   WORKS FASTER are RATE's (a gun's or a factory's pace), MACHINE is PART's (C1: "MACHINE becomes enemy part");
// - the rune keywords (runeText.ts RuneKeyword): BURN (battle.ts hull.burns: HOT SWAP's ticks and BURN_TIME), STUN (the
//   disrupt timer: STEADY IRON's stallCut shortens it; FLIP-X2 N4-d, was the STALL token), RIDE (rideOf: the ammo's own ride bonus, rideScale: only the
//   CINDER SLUG has one, the KILN's HEAT), RATE, HULL, BELT, GOLD, DMG; each with a number-free reminder (RUNE_REMINDER)
//   that says what its row says;
// - the brass trigger labels (T1 2.3: HIT:, SHOT:, LOAD:, EVERY n SEC:) and TAP_NOTES: the one thing a piece's face dropped
//   that only its own panel can say (U2b's ledger: PRESSURE BREECH's cap, COMPOUND BREECH's lone-load hold, SORTING ARM's
//   count across belts, SURGE VALVE's pulse, ...), on a word its face draws.
// Every number comes from the sim through one formatter of statFormat.ts (no digit in this file's strings: tests/
// glossary.test.ts scans it, as faceText scans faces.ts).

import { COMMISSION_BASE, COMMISSION_STEP, JAM_THRESHOLD, WINDOW_TIME, type ItemDef } from "../sim/content";
import { WIND_START } from "../sim/content"; // SUS-B (REQ-BFG-069): the DARK WIND row
import { SPEED_K } from "../sim/content"; // NUM-4 (REQ-BFG-047): the RATE row's 30 seconds
import { hullScaleRules } from "../sim/hullScale"; // HULL-1c (REQ-BFG-079; REVIEW-HULL1A N3): the DARK WIND row's share
import { BURN_DPS, BURN_TIME, FRAY_BONUS, FRAY_MAX } from "../sim/content"; // CARD-4 (REQ-BFG-081, T): the rune word notes' numbers
import { FUSE_MAX } from "../sim/stars"; // CARD-4 (T): MERGED's ★2 and ★3
import { SYNC_WINDOW } from "../sim/races/foundry";
import { scaleCore } from "../sim/cores";
import { effectAt } from "../sim/stars";
import { C } from "../render/palette";
import { ICON, ICON_COLOUR, icons, type KeywordName } from "../render/font";
import { KEYWORD_COLOUR } from "./richText";
import { SIM, type TextOpts } from "./abilityText";
import { REMINDER, faceAt, hasFace } from "./faces";
import { fmtCount, fmtPct, fmtSec } from "./statFormat"; // WORDS-1: fmtDmg left with the MARKS row
import { fmtDmg } from "./statFormat"; // FIX-099G (REQ-BFG-079): FRAY's and BURN's word notes, as faces.ts REMINDER prints them
import { shownOn } from "./dayShown"; // HULL-1d (REQ-BFG-079): the rows' numbers on the tapped piece's day
import { onSetScaleRigs, scaleRules } from "../sim/scale"; // SCALE-2b (REQ-BFG-108): POISON's row, SCALE_RIGS on only
import { dmgNow } from "./dayShown"; // FIX-099G (REQ-BFG-079): FRAY's and BURN's word notes on the card's day

/** One glossary row (see the file comment). */
export interface GlossaryRow {
  word: string;
  aliases: readonly string[];
  colour: string;
  /** The definition as a tap shows it, in markup, leading with its word; at most 2 lines of 5x7 at GLOSSARY_WRAP_W. */
  def: string;
  /** A face keyword: a faced piece's own reminder (its number) is its definition there, then `extra`. */
  kw?: KeywordName;
  /** The one sentence the faces dropped (after a reminder). */
  extra?: string;
  /** Where a line names it: "text", any panel text (glossaryWordsIn); "label", a rule's brass trigger label only;
   *  "rune", a rune's keyword token only (HULL, BELT, GOLD and DMG are everywhere else plain words, not taps). */
  scope: "text" | "label" | "rune";
}

/** The phone band's text width (art px) that every definition fits in 2 lines of 5x7: buildLayout(241, 414, portrait,
 *  5, phone).info is 235 wide, and planPanel wraps at its width - 10 (T1 measured; tests/glossary.test.ts re-measures). */
export const GLOSSARY_WRAP_W = 225;

/** A word without a colour of its own reads in the line's colour (the dotted underline is its tap cue). */
const PLAIN = C.bone;
/** A face keyword's colour: its icon's (font.ts ICON_COLOUR, the one source). */
const kwColour = (k: KeywordName): string => ICON_COLOUR[ICON[k]];

/** The keyword's reminder (faces.ts REMINDER) and its one extra sentence. */
const withExtra = (reminder: string, extra: string): string => `${reminder} ${extra}`;

/** The rows, built from the sim at each call (tests trace their numbers through the formatter registry). HULL-1d
 *  (REQ-BFG-079; BRIEF-HULL1D 2 (h)1): `day`, the day the rows are read on (the tapped piece's run day): the face keywords'
 *  numbers (faces.ts REMINDER: BURN's damage a second, HEAT's and FRAY's damage x D(d), PLATE's MAX x S(d)) on that day
 *  (dayShown.ts); no day, or the switch off: day 1's, as before (GLOSSARY, the table, is day 1's). */
export function glossaryRows(day?: number): GlossaryRow[] {
  return shownOn(day, rowsNow);
}

function rowsNow(): GlossaryRow[] {
  const burnExtra = "THEY ADD UP, AND {*PLATE} SOAKS THEM.";
  const stunExtra = "THE HULL ITSELF NEVER STOPS.";
  const heatExtra = "JACKETS ADD UP, FROM THEIR TILE ON.";
  // CARD-3 (REQ-BFG-107): the soak's one extra sentence says which acts first, as battle.ts impact does it: IRON HIDE's
  // cut (runeHit), then a WARD stops the hit (shieldHit returns 0, so absorb takes no SHIELD), then SHIELD soaks the rest
  // point for point (races/bastion.ts absorb), then the hull. THE DARK WIND GOES PAST IT moved to the DARK WIND row (both
  // sentences take 3 lines of 5x7 at 225 px with the point-for-point reminder; a tap shows at most 2)
  const plateExtra = "A {*SHIELD} GOES FIRST.";
  // NUM-4 (REQ-BFG-047; N1 2.2): the pair window (SYNC_WINDOW 0.25 s), the load window (1.5 s) and the commission timers
  // (1.2 s, +0.6 s) are hidden timers no whole second says: the rows keep the rule, not the number
  // WORDS-1 (REQ-BFG-081): PAIR's reminder says FROM TWO BELTS now (faces.ts REMINDER.PAIR), so its extra sentence goes (was
  // "BY TWO INTAKES.")
  // SUS-B (REQ-BFG-069; SUSTAIN-1 4.1): the sustain keywords' one extra sentence each. A face keyword never stands as a
  // bare word in a text a tap shows (REQ-BFG-032 rule 3; tests/glossary.test.ts), so 4.1's verb HEALS is said another way:
  // HEAL's "A HULL WITH BURN HEALS HALF." is "GETS HALF", REGEN's "NOTHING HEALS IN THE DARK WIND." is "IT STOPS"
  const shieldExtra = "{*BURN} GOES PAST IT.";
  const healExtra = "A HULL WITH {*BURN} GETS HALF.";
  const regenExtra = "IT STOPS IN THE DARK WIND.";
  const rows: GlossaryRow[] = [
    // ------------------------------------------------------------------------------- the 6 face keywords (C1)
    { word: "BURN", aliases: ["BURNS", "BURNING"], colour: kwColour("BURN"), kw: "BURN", extra: burnExtra, def: withExtra(REMINDER.BURN(), burnExtra), scope: "text" },
    {
      word: "STUN", aliases: ["STUNS", "STUNNED", "STALL", "STALLS", "STALLED", "STALLING", "SHOCK", "SHOCKS", "SHOCKED"],
      colour: kwColour("STUN"), kw: "STUN", extra: stunExtra, def: `{*STUN}: THE ENEMY PART IT HITS STOPS FOR A WHILE. ${stunExtra}`, scope: "text",
    },
    { word: "HEAT", aliases: [], colour: kwColour("HEAT"), kw: "HEAT", extra: heatExtra, def: withExtra(REMINDER.HEAT(), heatExtra), scope: "text" },
    { word: "FRAY", aliases: ["FRAYS"], colour: kwColour("FRAY"), kw: "FRAY", def: REMINDER.FRAY(), scope: "text" },
    // CARD-3 (REQ-BFG-107): the soak layer reads SHIELD (kw PLATE, its internal name); PLATES, PLATED and PLATING are no
    // longer aliases (the word PLATE is in no player text; a name holding it is never this row)
    { word: "SHIELD", aliases: ["SHIELDS", "SHIELDED"], colour: kwColour("PLATE"), kw: "PLATE", extra: plateExtra, def: withExtra(REMINDER.PLATE(), plateExtra), scope: "text" },
    { word: "PAIR", aliases: ["PAIRS", "PAIRED"], colour: kwColour("PAIR"), kw: "PAIR", def: REMINDER.PAIR(), scope: "text" },
    // SUS-B (REQ-BFG-069; SUSTAIN-1 4.1, 4.9): SHIELD a count (MAX 3), HEAL never past full hull (RIVETER's old REPAIR is
    // HEAL's: one mechanic, one word), REGEN at each whole second (battle.ts sustainTick)
    // CARD-3 (REQ-BFG-107): the one-hit block reads WARD (kw SHIELD, its internal name)
    { word: "WARD", aliases: ["WARDS"], colour: kwColour("SHIELD"), kw: "SHIELD", extra: shieldExtra, def: withExtra(REMINDER.SHIELD(), shieldExtra), scope: "text" },
    {
      word: "HEAL", aliases: ["HEALS", "HEALED", "HEALING", "REPAIR", "REPAIRS"], colour: kwColour("HEAL"), kw: "HEAL", extra: healExtra,
      def: withExtra(REMINDER.HEAL(), healExtra), scope: "text",
    },
    { word: "REGEN", aliases: [], colour: kwColour("REGEN"), kw: "REGEN", extra: regenExtra, def: withExtra(REMINDER.REGEN(), regenExtra), scope: "text" },
    // SCALE-2b (REQ-BFG-108; BRIEF-SCALE2b section 3): POISON, a face keyword's row in BURN's form, its reminder its whole
    // definition (faces.ts REMINDER.POISON, the design's text: no extra sentence), so POISON is a hover and tap target
    // wherever a line writes it; only while SCALE_RIGS is on (off, the table is exactly the base's)
    ...(scaleRules() ? [{ word: "POISON", aliases: ["POISONS", "POISONED"], colour: kwColour("POISON"), kw: "POISON" as const, def: REMINDER.POISON(), scope: "text" as const }] : []),
    // --------------------------------------------------------------------- the rune keywords that have no row above
    // U2d F4: was "RIDE: A CINDER SLUG'S OWN {*HEAT}, FOR EACH SEC IT RIDES. A HEAT JACKET'S IS APART." (cap: unclear)
    { word: "RIDE", aliases: [], colour: C.wood4, def: "RIDE: THE {*HEAT} A KILN'S SLUGS GAIN FOR EACH SEC THEY RIDE. NOT A HEAT JACKET'S.", scope: "rune" },
    {
      word: "RATE", aliases: ["FIRE RATE", "FIRES", "WORKS FASTER", "WORK FASTER"], colour: ICON_COLOUR[ICON.RATE],
      // NUM-4 (REQ-BFG-047; N1 2.2's tap text, in the row's form: its word first, no PER, the number through fmtSec): {RATE}
      // n is the SPEED, shots or slugs in SPEED_K seconds (was "HOW OFTEN A GUN FIRES OR A FACTORY WORKS. FASTER IS MORE OF IT.")
      def: `RATE: HOW OFTEN A GUN FIRES OR A FACTORY WORKS: {RATE} SHOTS OR SLUGS IN ${fmtSec(SPEED_K)}{SEC}.`, scope: "text",
    },
    { word: "HULL", aliases: [], colour: C.red, def: "HULL: YOUR SHIP'S LIFE. WHEN IT RUNS OUT, YOU LOSE THE FIGHT.", scope: "rune" },
    { word: "BELT", aliases: [], colour: C.brass3, def: "BELT: YOUR BELT TILES, SHARED BY ALL YOUR BELTS.", scope: "rune" },
    { word: "GOLD", aliases: [], colour: ICON_COLOUR[ICON.GOLD], def: "GOLD: WHAT THE SHOP, REROLLS AND UPGRADES COST.", scope: "rune" },
    { word: "DMG", aliases: [], colour: C.white, def: "DMG: DAMAGE, TO A PART OR TO THE HULL.", scope: "rune" },
    // ------------------------------------------------- the words the kept texts still name (T2a's rows, T1 2.4's form)
    { word: "PART", aliases: ["PARTS", "MACHINE", "MACHINES"], colour: PLAIN, def: "PART: A RIG, FACTORY, TURRET OR BELT TILE.", scope: "text" },
    // NUM-3 (R1's STUN fold, REQ-BFG-046): the FREEZE row is gone: a FROSTBITE round STUNs (the STUN row); nothing freezes.
    // Y7b2 (the flip): the POISON row is gone too (Y6 retired it; RETIRED below)
    // WORDS-1 (REQ-BFG-081; READ-1 3.3, 6.1): the speed rigs' faces end "FROM THIS TILE ON" (FROM THESE TILES ON), and a tap
    // on it shows this row: the SPEED note where the card prints it (READ-1: the one sentence that would fix the misread
    // had no tap that reached it)
    {
      word: "SPEED", aliases: ["AS FAST", "HALF SPEED", "SPEED RIG", "SPEED RIGS", "FROM THIS TILE ON", "FROM THESE TILES ON"],
      colour: KEYWORD_COLOUR.faster, def: "SPEED: A SPEED RIG CHANGES ITS BELT FROM THE TILE IT HITS ON.", scope: "text",
    },
    { word: "LOCKED", aliases: ["LOCKED BELT", "LOCKED BELTS"], colour: PLAIN, def: "LOCKED: METRONOME'S BELTS KEEP THEIR SPEED; SPEED RIGS ADD DAMAGE INSTEAD.", scope: "text" },
    { word: "COPIES", aliases: ["COPY", "COPIED"], colour: PLAIN, def: "COPIES: SPLITTER AND SORTING ARM TURN A SLUG INTO MORE SLUGS.", scope: "text" },
    // Y7b2 (the words): the LOAD TIME row is gone (no text names it; RETIRED below)
    // JAM keeps one meaning: an over-fed gun skipping a shot (battle.ts: JAM_THRESHOLD loads backed up)
    { word: "JAM", aliases: ["JAMS", "JAMMED"], colour: PLAIN, def: `JAM: A GUN WITH ${fmtCount(JAM_THRESHOLD)} LOADS BACKED UP AT ITS INTAKES SKIPS A SHOT.`, scope: "text" },
    // Y7b2 (the flip): the HARASSMENT row is gone (Y2 retired it: harassment is a STUN; RETIRED below)
    // WORDS-1 (REQ-BFG-081; READ-1 6.2): the MARKS row is gone: no piece gives SAP (harassment.ts), and no buyable card
    // names it (the dormant SIFTER's kept text says MARK in plain words)
    { word: "MATCHED", aliases: ["MATCHED BELT"], colour: PLAIN, def: "MATCHED: A BELT WITH AS MANY TILES AS ANOTHER BELT INTO THE SAME TURRET.", scope: "text" },
    // Y7b2 (the flip): the ONLINE row is gone (Y5 retired it: the texts say START; RETIRED below)
    { word: "BONUS DAMAGE", aliases: [], colour: PLAIN, def: "BONUS DAMAGE: WHAT RIGS AND SCRAP ADD TO A SLUG.", scope: "text" },
    // SUS-B (REQ-BFG-069; SUSTAIN-1 4.1): the dark wind's text row, no icon (battle.ts: WIND_START, nothing heals from then;
    // 4.1's "NOTHING HEALS IN IT." names HEAL in panel style, as every text a tap shows does)
    // HULL-1c (REQ-BFG-079; REVIEW-HULL1A N3): with HULL_SCALE on the wind is a share of each hull's own max (hullScale.ts
    // windShareBp; the battle bar's WIND n%/S), and the row says so in 2 lines (tests/hull1c.windhud); off, SUS-B's words
    // CARD-3 (REQ-BFG-107): + PAST SHIELD, the soak note's old extra (battle.ts: the wind's damage goes to the hull, never
    // through absorb; impacts, limpet blasts and BURN do), 2 lines of 5x7 at 225 px. MERGE-099D (cap's ruling, oracle
    // 19ddc7af83f1dba3): in both rows (HULL-1a's share goes straight to hp too: battle.ts hullEffects, "PLATE and SHIELD
    // don't absorb it"); the ON row in HULLS LOSE ... OF MAX so it keeps 2 lines (224 + 224 px; with ", PAST SHIELD" added
    // to "EACH HULL LOSES A GROWING % OF ITS MAX EACH SEC." it took 3)
    {
      word: "DARK WIND", aliases: [], colour: PLAIN,
      def: hullScaleRules()
        ? `DARK WIND: FROM ${fmtSec(WIND_START)}{SEC}, HULLS LOSE A GROWING % OF MAX EACH SEC, PAST {*PLATE}. NO {*HEAL}.`
        : `DARK WIND: FROM ${fmtSec(WIND_START)}{SEC}, HULL DAMAGE THAT GROWS, PAST {*PLATE}. NO {*HEAL} IN IT.`,
      scope: "text",
    },
    // ------------------------------------------------------------------------- the trigger labels (T1 2.3), brass
    // SHOPCARD-1b (REQ-BFG-081; READ-9 fix 1: the weakest reader read HIT: as "a slug hits the rig" on 7 cards, and quoted the old
    // note back and still did): the rig is the one that hits. battle.ts:1295-1301 a slug that crosses a belt tile's centre takes
    // the hit of every rig arrow pointing at that tile, one hit an arrow (applyTile 1661-1669, applyHit 1685); a stunned, frozen,
    // wrecked or not-yet-online rig hits nothing (1665), so "each time this rig hits" carries the old "while it works"
    { word: "HIT", aliases: [], colour: C.brass3, def: "HIT: EACH TIME THIS RIG HITS A SLUG ON A TILE ITS ARROWS POINT AT.", scope: "label" },
    { word: "SHOT", aliases: [], colour: C.brass3, def: "SHOT: EACH SHOT THIS TURRET FIRES.", scope: "label" },
    { word: "LOAD", aliases: [], colour: C.brass3, def: "LOAD: A SLUG ENTERS THIS TURRET'S CHAMBER.", scope: "label" },
    { word: "EVERY", aliases: [], colour: C.brass3, def: "EVERY: A TIMER, AGAIN AND AGAIN FOR THE WHOLE FIGHT.", scope: "label" },
  ];
  return rows;
}

/*
 * Y2-Y6 (release Y; DESIGN-Y 1.2 and section 5 column g, REVIEW-STARD rule 6), RETIRED at the flip (Y7b2): the three rows
 * the star switch retired (its STAR_RETIRED) left the table. HARASSMENT (Y2): harassment is a STUN (battle.ts
 * acceptHarassment), so no face or kept text names it (the STUN row says it); PART stays a glossary word, no colour and no
 * token (TOLLBOOTH's face names it). ONLINE (Y5, cap's ruling 882ecc7750f6dd37): POWDER KEG's kept sentence says its fuse
 * runs from the start, the QUICK LATCH rune's line says START (runeText.ts RUNE_TEXT), as ASSEMBLY LINE's texts do since Y3;
 * two ONLINEs are not this word and stay: the battle plate's network tag (session.ts SOURCE_ONLINE, "ONLINE GHOST") and
 * content.ts's catalogue descs. POISON (Y6; its alias POISONED with it): VENOM DRIP lengthens BURN instead, and POISON's
 * payload, pool, tick, event, colour and VENOM's desc left with the flip. MATCHED (TWIN GAUGE's face) and BONUS DAMAGE (DRAKE
 * NOZZLE's face) are rows. No word joined.
 * LOAD TIME (Y7b2, the words): no gear holds a load time since Y4 (HOPPER's and TWIN TRIGGER's went; ROTARY's texts say
 * SOONER), so no text names it any more: SALVO RACK's kept sentence names its wait in seconds (abilityText.ts salvo: 2 x
 * WINDOW_TIME after its first load) and TEMPO's family line says HOW LONG A GUN WAITS TO FIRE (families.ts). TXT-096
 * (Y7B2-Q5) took it out of HOPPER's and ROTARY BREECH's catalogue descs, and TXT-AZ (REVIEW-TXT096 Q2) out of TWIN TRIGGER's,
 * with tools/wave3Defs.ts's copy (tests/wave3Art.test.ts holds that def equal to the copy). None of the three is drawn
 * (flavour.ts KEPT_FLAVOUR).
 */

/** The table, in order: the face keywords, the rune keywords, the kept texts' words, the trigger labels. */
export const GLOSSARY: readonly GlossaryRow[] = glossaryRows();

/** The rune cards' number-free reminders (runeText.ts runeReminder), one per rune keyword that has one; each says what
 *  its glossary row says (tests/glossary.test.ts), its word first. */
export const RUNE_REMINDER: Readonly<Record<string, string>> = {
  // CARD-3 (REQ-BFG-107): the soak layer's player word is SHIELD, and the genre's POINT FOR POINT (races/bastion.ts absorb:
  // min(SHIELD, damage) off the hit, the rest to the hull). 203 px of 3x5, one line on every card (216 at the least)
  PLATE: "SHIELD: SOAKS DAMAGE POINT FOR POINT BEFORE YOUR HULL.",
  PAIR: "PAIR: TWO LOADS REACH ONE TURRET FROM TWO BELTS AT ONCE.", // WORDS-1: FROM TWO BELTS, as its row
  HEAT: "HEAT: MORE DAMAGE FOR EACH SEC IT RIDES.",
  FRAY: "FRAY: EACH ONE ADDS DAMAGE TO EVERY LATER SHOT ON THE HULL.", // WORDS-1: not HIT, the rig's label (READ-1 4)
  RATE: "RATE: HOW OFTEN A GUN FIRES OR A FACTORY WORKS.",
  BURN: "BURN: EACH ONE DEALS HULL DAMAGE EVERY SEC FOR A WHILE.",
  RIDE: "RIDE: THE HEAT A KILN'S SLUGS GAIN FOR EACH SEC THEY RIDE.", // U2d F4: its row's first sentence (was A CINDER SLUG'S OWN HEAT FOR EACH SEC IT RIDES.)
  STUN: "STUN: A STUNNED PART STOPS FOR A WHILE.", // FLIP-X2 (N4-d): the rune token is STUN (was STALL, which read STUN)
  // SUS-B (REQ-BFG-069; SUSTAIN-1 4.1's rune reminders; REGEN's says GIVES BACK, as its row does)
  // NUM-4 (REVIEW-SUSB F1; was "STOPS ONE WHOLE HIT"). CARD-2 (REQ-BFG-081, K3 b; READ-3 6: Haiku read a SHIELD as plate
  // that soaks): ALL OF a hit's damage, however big (battle.ts:2059 impact: shieldHit returns 0 for the hit, its FRAY bonus
  // too); its BURN, FRAY and STUN still land (2066-), so never "WHOLE HIT"
  // CARD-3 (REQ-BFG-107): the one-hit block's player word is WARD; CARD-2's true words (184 px of 3x5)
  SHIELD: "WARD: BLOCKS ALL OF ONE HIT'S DAMAGE, THEN BREAKS.",
  HEAL: "HEAL: GIVES BACK HULL, NEVER PAST FULL.",
  REGEN: "REGEN: GIVES BACK HULL EACH SEC.",
};

/**
 * CARD-4 (REQ-BFG-081, T; READ-4 5 and 11 item 6): what a tap on a rune card's word shows, where it is not the chip's
 * number-free reminder (RUNE_REMINDER, which the chip's line keeps): FRAY's and BURN's with their glossary rows' numbers
 * (content.ts FRAY_BONUS a stack on every later shot on the hull, FRAY_MAX stacks; BURN_DPS hull damage a second for
 * BURN_TIME seconds a stack: battle.ts:2053, 2354-2365), from the sim's constants; and the word-only keywords' notes
 * (runeText.ts WORD_ONLY): MERGED (stars.ts: copies merge into a ★2, a ★2 into a ★3; runes.ts mergedPieces counts a placed,
 * fitted or installed piece at ★2 or more), LOAD (VOCAB: a load is one slug a turret takes in from a belt) and RIG (the
 * place hint's words: its arrows work the belt tiles they point at). Each its word first; each fits the note room of every
 * card that shows it (tests/card4.test.ts (t)).
 * FIX-099G (REQ-BFG-079, REQ-BFG-081; REVIEW-MERGE099E ruling 1): this table is day 1's (no day). A card's tap reads
 * runeWordNote, so FRAY's and BURN's damage is the card's day's, as the panels show it.
 */
export const RUNE_WORD_NOTE: Readonly<Record<string, string>> = {
  FRAY: shownOn(undefined, frayNote),
  BURN: shownOn(undefined, burnNote),
  MERGED: `MERGED: A ★${FUSE_MAX - 1} OR ★${FUSE_MAX} PIECE, MADE BY MERGING COPIES.`, // stars.ts FUSE_MAX: ★3 the top
  LOAD: "LOAD: ONE SLUG A TURRET TAKES IN FROM A BELT.",
  RIG: "RIG: A PART BESIDE A BELT. ITS ARROWS WORK THE BELT TILES THEY POINT AT.",
};

/** FIX-099G (REQ-BFG-079): FRAY's and BURN's notes, their words CARD-4's, each damage number the panels' own on the
 *  read-out's day: FRAY_BONUS on every later shot, BURN_DPS a second (faces.ts REMINDER: fmtDmg(dmgNow(FRAY_BONUS)),
 *  fmtDmg(dmgNow(FACE_SIM.burnTick)), and FACE_SIM.burnTick is BURN_DPS). Read inside shownOn (dayShown.ts). */
function frayNote(): string {
  return `FRAY: EACH ONE ADDS +${fmtDmg(dmgNow(FRAY_BONUS))} DAMAGE TO EVERY LATER SHOT ON THE HULL. MAX ${FRAY_MAX}.`;
}
function burnNote(): string {
  return `BURN: EACH ONE DEALS ${fmtDmg(dmgNow(BURN_DPS))} HULL DAMAGE A SEC FOR ${BURN_TIME} SEC.`;
}
const DAY_NOTES: Readonly<Record<string, () => string>> = { FRAY: frayNote, BURN: burnNote };

/** FIX-099G (REQ-BFG-079, REQ-BFG-081): the note a tap on rune word `k` shows on a card read on `day` (the card's: the
 *  dawn's on a picker, the run's on the bar's read-out and LAST CHANCE). FRAY's and BURN's are built for that day, so
 *  with HULL_SCALE on their damage is the day's x D(d), rounded down (dmgNow), as faces.ts REMINDER and abilityText.ts
 *  show it. Every other note is RUNE_WORD_NOTE's. Undefined for a word with no note. No day, or the switch off:
 *  RUNE_WORD_NOTE[k], day 1's, byte for byte. */
export function runeWordNote(k: string, day?: number): string | undefined {
  const f = DAY_NOTES[k];
  return f ? shownOn(day, f) : RUNE_WORD_NOTE[k];
}

/** Y-FURN (REQ-BFG-070; release Y): a rune's own reminder, where its keyword's would say the opposite of its rule (runeText.ts
 *  runeReminder reads it first). SHATTER SHOT's hits shatter a SHIELD: SHIELD's reminder says a SHIELD blocks the hit, so
 *  its card says the SHIELD breaks and the hit still lands (battle.ts impact: shieldShatter), with no new keyword (no
 *  PIERCE: it would serve one rune). Number-free, its keyword's word first, one line of 3x5 on the card. */
export const RUNE_NOTE: Readonly<Record<string, string>> = {
  shatter_shot: "WARD: IT BREAKS; THE HIT STILL LANDS.", // CARD-3 (REQ-BFG-107): WARD, the block's word
  // WORDS-1 (REQ-BFG-081; TEXT-STYLE 7.4 as ruled 2026-10-10): what a plain rune line can't hold in its one line of the card,
  // on the opened card: FINAL NAIL never lands on a GATLING SPOOL (battle.ts:1889); a piece IN USE is a placed, installed or
  // fitted one (runes.ts:566-569: the build's pieces; cargo is not); a TWIN MOULD's cast and a CRUCIBLE's pour give FORGE
  // WARD nothing (battle.ts:1045-1047, races/foundry.ts:68-121); SCRAP BITER's PART, the PART row's words (battle.ts:570)
  final_nail: "NOT ON A GATLING SPOOL: IT FIRES EACH LOAD AS IT COMES.",
  scrap_halo: "IN USE: PLACED, INSTALLED OR FITTED, NOT IN CARGO.",
  scrap_saint: "IN USE: PLACED, INSTALLED OR FITTED, NOT IN CARGO.",
  forge_ward: "A TWIN MOULD'S OR CRUCIBLE'S SLUGS GIVE NONE.",
  scrap_biter: "PART: AN ENEMY RIG, FACTORY, GUN OR BELT TILE.",
};

/** Every form (word and aliases) with its row, longest first (so a two-word form wins over its first word). */
const formsOf = (rows: readonly GlossaryRow[]): [string, GlossaryRow][] => rows
  .flatMap((r): [string, GlossaryRow][] => [r.word, ...r.aliases].map((w) => [w, r]))
  .sort((a, b) => b[0].length - a[0].length);
const FORMS: readonly [string, GlossaryRow][] = formsOf(GLOSSARY);

/** SCALE-2b (REQ-BFG-108): POISON's row (rowsNow) is in the table only while SCALE_RIGS is on: at each flip the table
 *  (GLOSSARY, day 1's) and its forms are rebuilt in place, so off they are exactly the base's. The switch's hook
 *  (sim/scale.ts onSetScaleRigs). */
onSetScaleRigs((on) => {
  const rows = GLOSSARY as GlossaryRow[];
  if (on === rows.some((r) => r.kw === "POISON")) return;
  rows.splice(0, rows.length, ...glossaryRows());
  (FORMS as [string, GlossaryRow][]).splice(0, FORMS.length, ...formsOf(rows));
});

/** The row for a word or an alias (case-blind), else undefined. */
export function glossaryEntry(word: string): GlossaryRow | undefined {
  const w = word.trim().toUpperCase();
  return FORMS.find(([f]) => f === w)?.[1];
}

/** A form as a pattern over a cleaned text: its words with single spaces, and a two-word form may hold a value between
 *  its words ("WORKS 20% FASTER" names WORKS FASTER). */
const formPattern = (form: string): RegExp =>
  new RegExp(` (${form.split(" ").map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("(?: [+-]?\\d+(?:\\.\\d+)?%?)? ")})(?= )`, "g");

/** Where each named form sits in a text (each start, end and row), the longest form first, never overlapping. "text"
 *  rows only: a trigger label and a rune-only word are found where they are drawn (keywords.ts). */
export function glossaryHits(text: string): { at: number; end: number; row: GlossaryRow }[] {
  const t = ` ${text.toUpperCase().replace(/[^A-Z0-9'%+\-.-]/g, " ").replace(/\.(?=\s|$)/g, " ")} `;
  const hits: { at: number; end: number; row: GlossaryRow }[] = [];
  for (const [form, row] of FORMS) {
    if (row.scope !== "text") continue;
    for (const m of t.matchAll(formPattern(form))) {
      const at = m.index!, end = at + m[1].length; // in `text` (t has one leading space; m.index is the space before)
      if (!hits.some((h) => at < h.end && h.at < end)) hits.push({ at, end, row });
    }
  }
  return hits.sort((a, b) => a.at - b.at);
}

/** The rows a text names (whole words, each row once), in the order they first appear in it. */
export function glossaryWordsIn(text: string): GlossaryRow[] {
  const seen = new Set<GlossaryRow>();
  return glossaryHits(text).map((h) => h.row).filter((r) => (seen.has(r) ? false : (seen.add(r), true)));
}

/** The row of a face keyword (font.ts KEYWORDS). */
export const keywordRow = (k: KeywordName): GlossaryRow => GLOSSARY.find((r) => r.kw === k)!;

// ---------------------------------------------------------------------------------------- the piece's own tap text

/** U2b's ledger (section 12): what a face dropped that only its own panel can say, on a word its face draws (a trigger
 *  label's word, or a word of its rule); the text leads with that word. Each fits 2 lines of 5x7 at GLOSSARY_WRAP_W. */
export interface TapNote {
  word: string;
  text: (e: ItemDef, x: { stars: number; k: number }) => string;
}

const core = (e: ItemDef, x: { k: number }) => scaleCore(e.core!, x.k);

export const TAP_NOTES: Readonly<Record<string, TapNote>> = {
  // cores.ts pressure: + perQueued for each queued load, at most maxCount of them; it never jams (noJam)
  // U2d F5: as the turret panel's note (was "SHOT: AT MOST 5 LOADS WAITING COUNT, AND IT NEVER JAMS.")
  // SCALE-2c (REQ-BFG-098): with SCALE_RIGS on its def has no maxCount (MAX 5 dropped: scale.ts SCALE_DEFS): no cap to say
  pressure: {
    word: "SHOT",
    text: (e, x) => core(e, x).maxCount === undefined ? "SHOT: IT COUNTS EVERY WAITING LOAD, AND IT NEVER JAMS."
      : `SHOT: IT COUNTS UP TO ${fmtCount(core(e, x).maxCount!)} WAITING LOADS, AND IT NEVER JAMS.`,
  },
  // cores.ts compound: a lone load fires on its own after `hold` s; a shell carries both loads' burn and shock
  compound: { word: "SHOT", text: (e, x) => `SHOT: A LONE LOAD FIRES ALONE AFTER ${fmtSec(core(e, x).hold!)}{SEC}. A SHELL KEEPS BOTH LOADS' {*BURN} AND {*STUN}.` },
  // battle.ts applyHit: one count for every payload its arrows hit, on every belt they reach; the copies at full strength
  sorting: { word: "HIT", text: () => "HIT: ONE COUNT FOR THE SLUGS IT HITS ON EVERY BELT ITS ARROWS REACH." },
  // battle.ts applyHit: perPriorGate x every rig hit before it on the payload, speed rigs too
  // SHOPCARD-1b (REQ-BFG-081; READ-9 fix 1: LONG HAUL is one of the four rigs whose HIT: was read as "a slug hits the rig", and its
  // own note replaces the HIT row's, so it says when HIT fires itself): p.prior counts every hit the slug has taken (battle.ts:1778
  // p.prior++ for each applyHit, speed rigs' too) and LONG HAUL adds perPriorGate x it (1718). Was "HIT: EVERY RIG HIT BEFORE IT
  // COUNTS, SPEED RIGS TOO."
  longhaul: { word: "HIT", text: () => "HIT: WHEN IT HITS A SLUG, EVERY EARLIER HIT ON THAT SLUG COUNTS, SPEED RIGS TOO." },
  // SHOPCARD-1c (REQ-BFG-081; READ-10 8.1, its second Opus grader: 3 of 3 TWIN LATCH answers missed the one condition no panel or note
  // printed, so they went R -> P): battle.ts:757-764 makeSide builds a latch only from a TWIN LATCH whose two arrows both hit belts
  // (`g.hits.length === 2`; "one arrow on a belt never holds"), 1378-1389 tryHold has each arrow hold the slug that crosses its tile's
  // centre, and 1399-1420 latchTick lets it go within `hold` s. Its own note, as LONG HAUL's, replaces the HIT row's for this piece
  // (glossaryText: a piece's tap note first), so it says what HIT does here and the condition, in the HIT row's words (ARROWS POINT AT).
  // 2 rows of 5x7 at GLOSSARY_WRAP_W. Was the HIT row's "HIT: EACH TIME THIS RIG HITS A SLUG ON A TILE ITS ARROWS POINT AT."
  twinlatch: { word: "HIT", text: () => "HIT: IT HOLDS A SLUG IT HITS, BUT ONLY WHEN BOTH ITS ARROWS POINT AT BELTS." },
  // battle.ts split: each copy keeps the payload's burn and shock. Y6 (release Y; DESIGN-Y 4.1; folded at the flip, Y7b2):
  // POISON is retired, so it names the two a copy keeps (Battle.applyHit's spread: its BURN, with VENOM's seconds, and its
  // STUN); was "... {*BURN}, POISON AND {*STUN}."
  splitter: { word: "HIT", text: () => "HIT: EACH COPY KEEPS THE SLUG'S {*BURN} AND {*STUN}." },
  // Y3 (release Y; DESIGN-Y row 28): there is no speed pulse (Battle.surgeTick: every slug on its belts gains the {DMG} once
  // a period, wherever it is)
  surge: {
    word: "EVERY",
    text: (e) => `EVERY ${fmtSec(e.gate!.pulse!.period)}{SEC}: EACH SLUG ON ITS BELTS GETS IT, BEFORE ITS TILE TOO.`,
  },
  // cores.ts salvo: it waits for a full chamber (or twice its load time); after a volley its reload x reloadMul
  // TXT-095 (REQ-BFG-070, REQ-BFG-046; ACCEPT-093 7 (b)): the tap says the fallback too, in the {SEC} form COMPOUND's note
  // uses: SIM.salvoWait x WINDOW_TIME (2 x 1.5 = 3 s; makeTurret gives every SALVO gun WINDOW_TIME, abilityText.ts salvo),
  // as its kept sentence and 0.9.3's notes say it. All three facts in 2 lines of 5x7 at GLOSSARY_WRAP_W (225 + 215 px): the
  // brief's long form ("..., AND ITS NEXT RELOAD TAKES 60% LONGER.") and short form ("SHOT: FIRES AT A FULL CHAMBER OR
  // 3{SEC} AFTER ITS FIRST LOAD. ITS NEXT RELOAD TAKES 60% LONGER.") each take 3 lines, so this is option A, chosen by the
  // Prime (oracle eca9983506b0133c). Was "SHOT: IT WAITS FOR A FULL CHAMBER, AND ITS NEXT RELOAD TAKES 60% LONGER.".
  // tests/txt095.salvo.test.ts reads the wait off the sim's own ready (cores.ts ROUTINES.salvo, on makeTurret's gun)
  salvo: {
    word: "SHOT",
    text: (e, x) => `SHOT: FIRES AT A FULL CHAMBER OR ${fmtSec(SIM.salvoWait * WINDOW_TIME)}{SEC} AFTER ITS FIRST LOAD. NEXT RELOAD: ${fmtPct(core(e, x).reloadMul! - 1)} LONGER.`,
  },
  // WORDS-1 (REQ-BFG-081; READ-1 6.1: POWDER KEG's ITS BELTS read as the tiles by it): battle.ts:1146 its blast reaches every
  // slug on the belts its arrows hit, wherever it is, as SURGE VALVE's pulse does (the same note's words)
  // SCALE-2c (REQ-BFG-098): with SCALE_RIGS on POWDER KEG has no fuse and its face no EVERY (a HIT: reader line), so this
  // note never matches a word there; "" keeps a sweep over the notes from reading a fuse it doesn't have
  keg: {
    word: "EVERY",
    text: (e) => (e.gate?.keg ? `EVERY ${fmtSec(e.gate.keg.fuse)}{SEC}: EACH SLUG ON ITS BELTS GETS IT, BEFORE ITS TILE TOO.` : ""),
  },
  // battle.ts rip: a hit on an enemy belt tile or rig rips the nearest payloads within reach. Y2 (release Y; DESIGN-Y row
  // 19): a hit POWDER KEG is no longer disarmed, so the tap doesn't say it
  grapnel: {
    word: "SHOT",
    text: (e, x) => {
      const n = core(e, x).reach!;
      // PRESENT-1 (REQ-BFG-081; REVIEW-READ14 fix 2): DESTROYS, the face's verb (was "SHOT: IT RIPS THE NEAREST SLUGS ...")
      return `SHOT: IT DESTROYS THE NEAREST SLUGS WITHIN ${fmtCount(n)} TILE${n === 1 ? "" : "S"} OF A HIT.`;
    },
  },
  // battle.ts impact: each pellet picks its own target; a burn splits between them
  scatter: { word: "SHOT", text: () => "SHOT: EACH PELLET PICKS ITS OWN TARGET, AND ITS {*BURN} SPLITS AMONG THEM." },
  // battle.ts pickTarget: a pick of bare hull is picked again; a shot at a part still hits the hull too
  // WORDS-1 (REQ-BFG-081; READ-1 6.1's one-offs: BARE HULL): "AIMED AT NO PART", as its face (was "AIM: A SHOT AT BARE HULL
  // PICKS AGAIN; ...")
  spotter: { word: "AIM", text: () => "AIM: A SHOT AIMED AT NO PART PICKS AGAIN; A SHOT AT A PART STILL HITS THE HULL." },
  // WORDS-1 (REQ-BFG-081): DRAKE NOZZLE's face says RIGS ADDED; battle.ts:1907 converts the slug's whole flat at the shot,
  // so SCRAPPER's scrap (1078) and a FOUNDRY fuse's (races/foundry.ts:47) count too, and HEAT (p.heatBonus, 1199) never
  // CARD-2 (REQ-BFG-081, K3 h; REVIEW-WORDS1 note 1): a fused slug is an alloy (races/data.ts:64, base 0) whose whole damage
  // is its flat (races/foundry.ts:47 fuse: a.flat = dmg), so DRAKE converts all of it (battle.ts drakeConvert(c, p.flat));
  // HEAT (heatBonus) never. Two lines of 5x7 at 225 (was "SHOT: SCRAP AND FUSED SLUGS' EXTRA DAMAGE COUNTS TOO. ...")
  drake: { word: "SHOT", text: () => "SHOT: SCRAP'S EXTRA DAMAGE COUNTS, AND ALL OF A FUSED SLUG'S. {*HEAT} NEVER DOES." },
  // races/foundry.ts: two blanks by two intakes within SYNC_WINDOW fuse (FUSE_MULT); a lone blank fires as a load of its own
  crucible: { word: "PAIR", text: () => "{*PAIR}: TWO BLANKS BY TWO INTAKES AT ONCE FUSE; A LONE ONE FIRES ON ITS OWN." }, // NUM-4: no 0.25 s
  // battle.ts stokedPace: a stoked factory's other timers (ARMOR PRESS's plating) run faster too
  // WORDS-1 (REQ-BFG-081; READ-1 6.1: STAMP cut): its slugs come sooner (was "FASTER: IT STAMPS AND POURS SOONER, ...")
  stoker: { word: "FASTER", text: () => "FASTER: ITS SLUGS COME SOONER, AND ITS OTHER TIMERS RUN FASTER TOO." },
  // Y4 (release Y; REVIEW-Y1 ruling 3; BRIEF-Y4 S2; folded at the flip, Y7b2): TESLA ARC's face keeps its lone {DMG}25% stat
  // (faces.ts coreStats); its SHOT label's tap says what that share is: Battle.impact: each arc deals tesla.share of the
  // shot's damage (25% / 25% / 30%, its data's)
  tesla: { word: "SHOT", text: (e, x) => `SHOT: EACH ARC DEALS ${fmtPct(core(e, x).share!)} OF THE SHOT'S {DMG}.` },
  // Y7b1 (release Y; ruling Y7A-R2; folded at the flip, Y7b2): EXT. CHAMBER's ★2/★3 face reads UP TO 3 / UP TO 4 (faces.ts
  // chamber); its ⓘ (this tap, on UP TO) says why: Battle.chambers fires at most what the gun's chamber holds
  chamber: { word: "UP TO", text: () => "UP TO: A SHOT NEVER FIRES MORE THAN ITS GUN'S CHAMBER HOLDS." },
  // TXT-AZ (REQ-BFG-070; REVIEW-TXT096 Q1): ROTARY BREECH's OLDEST FIRST. cores.ts ROUTINES.rotary's select takes stack index
  // 0, the oldest load, while its core's order is "FIFO" (content.ts rotary: order "FIFO", at every star); every other gun's
  // select is IDENTITY's lifo, the newest. Its face can't take it without dropping PART-FULL ... SOONER (rule 4), so its tap
  // says it, on CHAMBERS: a word of its rule with no glossary row, as AIM, FASTER and UP TO (keywords.ts noteWord).
  // tests/txtaz.rotary.test.ts reads the order off the sim's own select
  rotary: { word: "CHAMBERS", text: () => "CHAMBERS: THE OLDEST LOAD IN ITS CHAMBER FIRES FIRST, NOT THE NEWEST." },
};

// ------------------------------------------------------------------------------- WORDS-1: the stat icons' notes

/**
 * WORDS-1 (REQ-BFG-081; READ-1 3.1: a turret's bare {SLUG} and {GEAR} were behind 40 of round A's 103 misses; cap's design
 * call 3): the stat row's {RATE}, {SLUG} and {GEAR} icons are tappable wherever a face draws them (keywords.ts matches),
 * each with a note that leads with its icon. {RATE} shows the RATE row. {SLUG} names two things (READ-1 6.5), so its note
 * follows the piece: a turret's (its stat row, the loads its chamber holds: TurretSpec.window, Battle.makeTurret), a
 * core's or gear's (a load its turret takes in), else a factory's or a rig's (a slug: what a factory makes, Battle.stamp,
 * and a belt carries). {GEAR} is a turret's gear slots (deck.ts gearSlotsOf: one piece of gear a slot; a core has its own
 * place, cores.ts resolveCore).
 */
export type StatIcon = "RATE" | "SLUG" | "GEAR" | "BELT";
export const STAT_ICONS: readonly StatIcon[] = ["RATE", "SLUG", "GEAR", "BELT"];
export const SLUG_NOTES = {
  gun: "{SLUG}: THE LOADS ITS CHAMBER HOLDS. A LOAD IS ONE SLUG FROM A BELT.",
  load: "{SLUG}: A SLUG ITS TURRET TAKES IN, ONE LOAD.",
  slug: "{SLUG}: A SLUG, WHAT A FACTORY MAKES AND A BELT CARRIES TO A GUN.",
} as const;
export const GEAR_NOTE = "{GEAR}: ITS GEAR SLOTS. EACH HOLDS ONE PIECE OF TURRET GEAR.";
/**
 * SHOPCARD-1e (REQ-BFG-081; READ-12 fix 5, E1): the factory stat row's {BELT}n had no tap note: all 12 LIMPET WORKS readers of
 * READ-12's rounds A and T listed `[BELT]2` as unclear ("what does the 2 count?", "belt tiles? number of belts?"), and the
 * ⓘ KEYWORDS page listed RATE and left BELT undefined (A haiku 2: "belt tiles? number of belts?"). The number is stars.ts
 * outputsAt (BELT_SLOTS by grade, plus the spec's lead, plus foot.ts footSlots): the belts the factory can feed (validate.ts
 * lets you lay no more routes from it). So the note says how many belts, and that they are not belt tiles (the build screen's
 * "BELT 6/14 TILES" is tiles; the word BELT's rune-only note, "BELT: YOUR BELT TILES, SHARED BY ALL YOUR BELTS.", scope "rune"
 * above, is about tiles too and stays as it is). Not "IN TURN" (the brief's example): battle.ts stamp (1123-1149) puts one
 * slug on its next belt in turn (`f.rr`, round-robin), but a pour factory puts slugs on several belts on one tick (battle.ts
 * 1104-1106 pourAll, TWIN MOULD; races/foundry.ts the CRUCIBLE: "POURS ONTO ALL ITS BELTS AT ONCE."), so "in turn" is true of
 * GANTRY PRESS's own face line ("FEEDS 4 BELTS IN TURN.", faces.ts shapeLines) and false of those, and a note on every
 * factory's {BELT} says only the count. The note is the stat icon's, on a factory's stat row (and GANTRY PRESS's BIGGER: +1
 * {BELT}), as {SLUG}'s and {GEAR}'s are theirs. Its icon leads it, like theirs.
 */
export const BELT_NOTE = "{BELT}: HOW MANY BELTS IT CAN FEED, NOT BELT TILES.";

/** What a tap on stat icon `k` shows on a line (`gunRow`: the line is a turret's stat row) of piece kind `kind`. */
export function statIconNote(k: StatIcon, kind: string | undefined, gunRow: boolean): string {
  if (k === "RATE") return glossaryRows().find((r) => r.word === "RATE")!.def;
  if (k === "GEAR") return GEAR_NOTE;
  if (k === "BELT") return BELT_NOTE; // SHOPCARD-1e (E1)
  return gunRow || kind === "turret" ? SLUG_NOTES.gun : kind === "core" || kind === "mod" ? SLUG_NOTES.load : SLUG_NOTES.slug;
}

/**
 * WORDS-1 (REQ-BFG-081; READ-1 6.2's list, kept as it stands; cap's design call 4): THE CORE LIST, the 10 words a new
 * player learns once and every card then uses without a note on that card: what a factory makes and a belt carries, the
 * belt, a rig's trigger, the stat icons, your hull, the three keywords every hero meets, and merging. Every other coined
 * word a buyable card prints is tappable on that card (keywords.ts matches) or a hero's own word, taught on hero select
 * (HEAT: FURNACE, FRAY: WEAVER, PAIR: FOUNDRY; BASTION's PLATE is core). docs/VOCAB of WORDS-1 lists each and how it is
 * learned; tests/words1.vocab.test.ts holds the list to 10 or fewer.
 */
export const CORE_WORDS: readonly string[] = ["SLUG", "BELT", "HIT", "RATE", "LOAD", "HULL", "BURN", "STUN", "SHIELD", "MERGE"]; // CARD-3: SHIELD (was PLATE)
/** The hero words, each taught on its hero's select card (heroes.ts; hero select draws the hero's trick). */
export const HERO_WORDS: Readonly<Record<string, string>> = { HEAT: "furnace", FRAY: "weaver", PAIR: "foundry" };

/** The tap note of piece `def` for `word` (a trigger label's word or a rule's word), else undefined. */
export function tapNote(def: string, word: string): TapNote | undefined {
  const n = TAP_NOTES[def];
  return n && n.word === word.toUpperCase().replace(/:$/, "") ? n : undefined;
}

/** What a tap on `word` shows, in markup, on piece `def` at `stars` (o: the core's class factor k, the run's hero): the
 *  piece's tap note on that word; else its row's: a face keyword on a faced piece takes the piece's own reminder (its
 *  number) and the row's extra sentence; else the row's definition. Undefined for a word with no row.
 *  CNT-DAY2 (REQ-BFG-100, REQ-BFG-082): `day`, the day the panel is read on (keywords.ts: its Run's day, the build
 *  screen's run.day or a face's faceRun day), for a tap with no piece (a belt's panel, an empty slot, a turret with no
 *  bought core) or on a piece with no day of its own: the row (and a faced piece's own reminder) on that day. A piece's own
 *  day (piece.o.day) comes first. No day: as before, byte for byte. */
export function glossaryText(word: string, piece?: { def: string; stars: number; o?: TextOpts }, day?: number): string | undefined {
  if (piece) {
    const n = tapNote(piece.def, word);
    if (n) return n.text(effectAt(piece.def, piece.stars), { stars: piece.stars, k: piece.o?.k ?? 1 });
  }
  const found = glossaryEntry(word);
  if (!found) return undefined;
  // CNT-DAY2: the piece's options, with the panel's day where the piece has none (no `day`: the piece's own, as before)
  const o = day !== undefined && piece?.o?.day === undefined ? { ...piece?.o, day } : piece?.o;
  // built now: its numbers go through the formatters now. HULL-1d: on the piece's day (piece.o.day, the run's)
  const row = glossaryRows(o?.day).find((r) => r.word === found.word)!;
  if (row.kw && piece && hasFace(piece.def)) {
    // BUMP-1E P6 (the re-pin of tests/glossary.test.ts 'every text a tap can show fits 2 lines'): a face's reminder DEFINES a keyword when
    // the keyword is in its head (before the colon: "{*PLATE}: SOAKS ...", "EACH {*POISON}: ..."), not when its body merely names it.
    // Was r.includes(`{*KW}`): VENOM DRIP's POISON reminder ("... GO PAST {*PLATE}.") was taken for SHIELD's own, so a tap on SHIELD
    // showed POISON's whole reminder and then SHIELD's extra sentence: 549 px, 3 lines at the 225 px band (the limit is 2).
    const defines = (r: string): boolean => { const i = r.indexOf(":"); return (i < 0 ? r : r.slice(0, i)).includes(`{*${row.kw}}`); };
    const own = faceAt(piece.def, piece.stars, o ?? {})?.reminders.find(defines);
    if (own) return row.extra ? `${own} ${row.extra}` : own;
  }
  return row.def;
}

/** A definition in glyphs (icons()), as it is drawn. */
export const glossaryGlyphs = (markup: string): string => icons(markup);

// CARD-3 (REQ-BFG-107): the one display function for a sim string a screen draws as it is (src/ui/gameWords.ts, a module
// of its own, so faces.ts can use it without the glossary's import of faces.ts)
export { GAME_WORDS, NAMES_KEPT, gameWords } from "./gameWords";
