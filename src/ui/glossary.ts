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
//   one mechanic one word: SHOCK and STALL are STUN's (battle.ts disrupt: one timer), PLATING is PLATE's, FIRE RATE and
//   WORKS FASTER are RATE's (a gun's or a factory's pace), MACHINE is PART's (C1: "MACHINE becomes enemy part");
// - the rune keywords (runeText.ts RuneKeyword): BURN (battle.ts hull.burns: HOT SWAP's ticks and BURN_TIME), STALL (STUN's
//   disrupt timer: STEADY IRON's stallCut shortens it), RIDE (rideOf: the ammo's own ride bonus, rideScale: only the
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
import { SYNC_WINDOW } from "../sim/races/foundry";
import { scaleCore } from "../sim/cores";
import { effectAt } from "../sim/stars";
import { C } from "../render/palette";
import { ICON, ICON_COLOUR, icons, type KeywordName } from "../render/font";
import { KEYWORD_COLOUR } from "./richText";
import { SIM, type TextOpts } from "./abilityText";
import { REMINDER, faceAt, hasFace } from "./faces";
import { fmtCount, fmtDmg, fmtPct, fmtSec } from "./statFormat";

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

/** The rows, built from the sim at each call (tests trace their numbers through the formatter registry). */
export function glossaryRows(): GlossaryRow[] {
  const burnExtra = "THEY ADD UP, AND {*PLATE} SOAKS THEM.";
  const stunExtra = "THE HULL ITSELF NEVER STOPS.";
  const heatExtra = "JACKETS ADD UP, FROM THEIR TILE ON.";
  const plateExtra = "THE DARK WIND GOES PAST IT.";
  // NUM-4 (REQ-BFG-047; N1 2.2): the pair window (SYNC_WINDOW 0.25 s), the load window (1.5 s) and the commission timers
  // (1.2 s, +0.6 s) are hidden timers no whole second says: the rows keep the rule, not the number
  const pairExtra = "BY TWO INTAKES.";
  // SUS-B (REQ-BFG-069; SUSTAIN-1 4.1): the sustain keywords' one extra sentence each. A face keyword never stands as a
  // bare word in a text a tap shows (REQ-BFG-032 rule 3; tests/glossary.test.ts), so 4.1's verb HEALS is said another way:
  // HEAL's "A HULL WITH BURN HEALS HALF." is "GETS HALF", REGEN's "NOTHING HEALS IN THE DARK WIND." is "IT STOPS"
  const shieldExtra = "{*BURN} GOES PAST IT.";
  const healExtra = "A HULL WITH {*BURN} GETS HALF.";
  const regenExtra = "IT STOPS IN THE DARK WIND.";
  return [
    // ------------------------------------------------------------------------------- the 6 face keywords (C1)
    { word: "BURN", aliases: ["BURNS", "BURNING"], colour: kwColour("BURN"), kw: "BURN", extra: burnExtra, def: withExtra(REMINDER.BURN(), burnExtra), scope: "text" },
    {
      word: "STUN", aliases: ["STUNS", "STUNNED", "STALL", "STALLS", "STALLED", "STALLING", "SHOCK", "SHOCKS", "SHOCKED"],
      colour: kwColour("STUN"), kw: "STUN", extra: stunExtra, def: `{*STUN}: THE ENEMY PART IT HITS STOPS FOR A WHILE. ${stunExtra}`, scope: "text",
    },
    { word: "HEAT", aliases: [], colour: kwColour("HEAT"), kw: "HEAT", extra: heatExtra, def: withExtra(REMINDER.HEAT(), heatExtra), scope: "text" },
    { word: "FRAY", aliases: ["FRAYS"], colour: kwColour("FRAY"), kw: "FRAY", def: REMINDER.FRAY(), scope: "text" },
    { word: "PLATE", aliases: ["PLATES", "PLATED", "PLATING"], colour: kwColour("PLATE"), kw: "PLATE", extra: plateExtra, def: withExtra(REMINDER.PLATE(), plateExtra), scope: "text" },
    { word: "PAIR", aliases: ["PAIRS", "PAIRED"], colour: kwColour("PAIR"), kw: "PAIR", extra: pairExtra, def: withExtra(REMINDER.PAIR(), pairExtra), scope: "text" },
    // SUS-B (REQ-BFG-069; SUSTAIN-1 4.1, 4.9): SHIELD a count (MAX 3), HEAL never past full hull (RIVETER's old REPAIR is
    // HEAL's: one mechanic, one word), REGEN at each whole second (battle.ts sustainTick)
    { word: "SHIELD", aliases: ["SHIELDS"], colour: kwColour("SHIELD"), kw: "SHIELD", extra: shieldExtra, def: withExtra(REMINDER.SHIELD(), shieldExtra), scope: "text" },
    {
      word: "HEAL", aliases: ["HEALS", "HEALED", "HEALING", "REPAIR", "REPAIRS"], colour: kwColour("HEAL"), kw: "HEAL", extra: healExtra,
      def: withExtra(REMINDER.HEAL(), healExtra), scope: "text",
    },
    { word: "REGEN", aliases: [], colour: kwColour("REGEN"), kw: "REGEN", extra: regenExtra, def: withExtra(REMINDER.REGEN(), regenExtra), scope: "text" },
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
    // NUM-3 (R1's STUN fold, REQ-BFG-046): the FREEZE row is gone: a FROSTBITE round STUNs (the STUN row); nothing freezes
    {
      word: "POISON", aliases: ["POISONED"], colour: KEYWORD_COLOUR.poison,
      def: `EACH POISON: ${fmtDmg(SIM.poisonTick)} HULL DAMAGE A SEC, MAX ${fmtCount(SIM.poisonMax)}, UNTIL ${fmtSec(SIM.poisonTime)}{SEC} PASS WITH NO POISONED HIT.`, scope: "text",
    },
    { word: "SPEED", aliases: ["AS FAST", "HALF SPEED", "SPEED RIG", "SPEED RIGS"], colour: KEYWORD_COLOUR.faster, def: "SPEED: A SPEED RIG CHANGES ITS BELT FROM THE TILE IT HITS ON.", scope: "text" },
    { word: "LOCKED", aliases: ["LOCKED BELT", "LOCKED BELTS"], colour: PLAIN, def: "LOCKED: METRONOME'S BELTS KEEP THEIR SPEED; SPEED RIGS ADD DAMAGE INSTEAD.", scope: "text" },
    { word: "COPIES", aliases: ["COPY", "COPIED"], colour: PLAIN, def: "COPIES: SPLITTER AND SORTING ARM TURN A SLUG INTO MORE SLUGS.", scope: "text" },
    { word: "LOAD TIME", aliases: [], colour: PLAIN, def: "LOAD TIME: A GUN FIRES A FULL CHAMBER, OR SOON AFTER ITS FIRST LOAD.", scope: "text" },
    // JAM keeps one meaning: an over-fed gun skipping a shot (battle.ts: JAM_THRESHOLD loads backed up)
    { word: "JAM", aliases: ["JAMS", "JAMMED"], colour: PLAIN, def: `JAM: A GUN WITH ${fmtCount(JAM_THRESHOLD)} LOADS BACKED UP AT ITS INTAKES SKIPS A SHOT.`, scope: "text" },
    // NUM-3 (R1's STUN fold): no FREEZE or SLOW any more (battle.ts acceptHarassment: a STUN, a SABOT wreck, a GRAPNEL rip)
    { word: "HARASSMENT", aliases: [], colour: PLAIN, def: "HARASSMENT: ANY {*STUN}, WRECK OR RIP ON AN ENEMY PART.", scope: "text" },
    {
      // NUM-3: CHILL and SNAG are gone (harassment.ts PayloadDebuffs); SAP is the one mark left, and no piece gives it yet
      word: "MARKS", aliases: ["MARK", "SAP"], colour: PLAIN,
      def: `MARKS: SAP, THE ONE MARK: ITS SLUG DEALS ${fmtDmg(SIM.sap)} LESS {DMG}. NO PIECE GIVES IT YET.`, scope: "text",
    },
    { word: "MATCHED", aliases: ["MATCHED BELT"], colour: PLAIN, def: "MATCHED: A BELT WITH AS MANY TILES AS ANOTHER BELT INTO THE SAME TURRET.", scope: "text" },
    {
      word: "ONLINE", aliases: ["COME ONLINE", "COMES ONLINE"], colour: PLAIN,
      def: "ONLINE: A RIG WORKS SOON AFTER THE START, LATER FOR EACH EARLIER RIG ON ITS BELT.", scope: "text",
    },
    { word: "BONUS DAMAGE", aliases: [], colour: PLAIN, def: "BONUS DAMAGE: WHAT RIGS AND SCRAP ADD TO A SLUG.", scope: "text" },
    // SUS-B (REQ-BFG-069; SUSTAIN-1 4.1): the dark wind's text row, no icon (battle.ts: WIND_START, nothing heals from then;
    // 4.1's "NOTHING HEALS IN IT." names HEAL in panel style, as every text a tap shows does)
    { word: "DARK WIND", aliases: [], colour: PLAIN, def: `DARK WIND: FROM ${fmtSec(WIND_START)}{SEC}, HULL DAMAGE THAT GROWS. NO {*HEAL} IN IT.`, scope: "text" },
    // ------------------------------------------------------------------------- the trigger labels (T1 2.3), brass
    { word: "HIT", aliases: [], colour: C.brass3, def: "HIT: EACH SLUG ON A TILE ITS ARROWS POINT AT, WHILE IT WORKS.", scope: "label" },
    { word: "SHOT", aliases: [], colour: C.brass3, def: "SHOT: EACH SHOT THIS TURRET FIRES.", scope: "label" },
    { word: "LOAD", aliases: [], colour: C.brass3, def: "LOAD: A SLUG ENTERS THIS TURRET'S CHAMBER.", scope: "label" },
    { word: "EVERY", aliases: [], colour: C.brass3, def: "EVERY: A TIMER, AGAIN AND AGAIN FOR THE WHOLE FIGHT.", scope: "label" },
  ];
}

/** The table, in order: the face keywords, the rune keywords, the kept texts' words, the trigger labels. */
export const GLOSSARY: readonly GlossaryRow[] = glossaryRows();

/** The rune cards' number-free reminders (runeText.ts runeReminder), one per rune keyword that has one; each says what
 *  its glossary row says (tests/glossary.test.ts), its word first. */
export const RUNE_REMINDER: Readonly<Record<string, string>> = {
  PLATE: "PLATE: SOAKS DAMAGE BEFORE YOUR HULL.",
  PAIR: "PAIR: TWO LOADS REACH ONE TURRET AT ONCE.",
  HEAT: "HEAT: MORE DAMAGE FOR EACH SEC IT RIDES.",
  FRAY: "FRAY: EACH ONE ADDS DAMAGE TO EVERY LATER HIT.",
  RATE: "RATE: HOW OFTEN A GUN FIRES OR A FACTORY WORKS.",
  BURN: "BURN: EACH ONE DEALS HULL DAMAGE EVERY SEC FOR A WHILE.",
  RIDE: "RIDE: THE HEAT A KILN'S SLUGS GAIN FOR EACH SEC THEY RIDE.", // U2d F4: its row's first sentence (was A CINDER SLUG'S OWN HEAT FOR EACH SEC IT RIDES.)
  STALL: "STUN: A STUNNED PART STOPS FOR A WHILE.", // NUM-4 (REVIEW-NUM3 F2): the rune token STALL reads STUN
  // SUS-B (REQ-BFG-069; SUSTAIN-1 4.1's rune reminders; REGEN's says GIVES BACK, as its row does)
  SHIELD: "SHIELD: BLOCKS ONE HIT'S DAMAGE, THEN BREAKS.", // NUM-4 (REVIEW-SUSB F1; was "STOPS ONE WHOLE HIT")
  HEAL: "HEAL: GIVES BACK HULL, NEVER PAST FULL.",
  REGEN: "REGEN: GIVES BACK HULL EACH SEC.",
};

/** Every form (word and aliases) with its row, longest first (so a two-word form wins over its first word). */
const FORMS: readonly [string, GlossaryRow][] = GLOSSARY
  .flatMap((r): [string, GlossaryRow][] => [r.word, ...r.aliases].map((w) => [w, r]))
  .sort((a, b) => b[0].length - a[0].length);

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
  pressure: { word: "SHOT", text: (e, x) => `SHOT: IT COUNTS UP TO ${fmtCount(core(e, x).maxCount!)} WAITING LOADS, AND IT NEVER JAMS.` },
  // cores.ts compound: a lone load fires on its own after `hold` s; a shell carries both loads' burn and shock
  compound: { word: "SHOT", text: (e, x) => `SHOT: A LONE LOAD FIRES ALONE AFTER ${fmtSec(core(e, x).hold!)}{SEC}. A SHELL KEEPS BOTH LOADS' {*BURN} AND {*STUN}.` },
  // battle.ts applyHit: one count for every payload its arrows hit, on every belt they reach; the copies at full strength
  sorting: { word: "HIT", text: () => "HIT: ONE COUNT FOR THE SLUGS IT HITS ON EVERY BELT ITS ARROWS REACH." },
  // battle.ts applyHit: perPriorGate x every rig hit before it on the payload, speed rigs too
  longhaul: { word: "HIT", text: () => "HIT: EVERY RIG HIT BEFORE IT COUNTS, SPEED RIGS TOO." },
  // battle.ts split: each copy keeps the payload's burn, poison and shock
  splitter: { word: "HIT", text: () => "HIT: EACH COPY KEEPS THE SLUG'S {*BURN}, POISON AND {*STUN}." },
  // battle.ts transport: for pulse.on s of every pulse.period its belts run x pulse.speed, then at their own speed; a payload
  // the pulse speeds up gains pulse.flat once a pulse (pulseSeen)
  surge: {
    word: "EVERY",
    text: (e) => {
      const p = e.gate!.pulse!;
      return `EVERY ${fmtSec(p.period)}{SEC}: ITS BELT RUNS FAST FOR ${fmtSec(p.on)}{SEC}, THEN AS BEFORE; A SLUG GETS THE {DMG} ONCE.`;
    },
  },
  // cores.ts salvo: it waits for a full chamber (or twice its load time); after a volley its reload x reloadMul
  salvo: { word: "SHOT", text: (e, x) => `SHOT: IT WAITS FOR A FULL CHAMBER, AND ITS NEXT RELOAD TAKES ${fmtPct(core(e, x).reloadMul! - 1)} LONGER.` },
  // battle.ts rip: a hit on an enemy belt tile or rig rips the nearest payloads within reach; a hit on a powder keg disarms it
  grapnel: {
    word: "SHOT",
    text: (e, x) => {
      const n = core(e, x).reach!;
      return `SHOT: IT RIPS THE NEAREST SLUGS WITHIN ${fmtCount(n)} TILE${n === 1 ? "" : "S"} OF A HIT; A HIT KEG IS DISARMED.`;
    },
  },
  // battle.ts impact: each pellet picks its own target; a burn splits between them
  scatter: { word: "SHOT", text: () => "SHOT: EACH PELLET PICKS ITS OWN TARGET, AND ITS {*BURN} SPLITS AMONG THEM." },
  // battle.ts pickTarget: a pick of bare hull is picked again; a shot at a part still hits the hull too
  spotter: { word: "AIM", text: () => "AIM: A SHOT AT BARE HULL PICKS AGAIN; A SHOT AT A PART STILL HITS THE HULL." },
  // races/foundry.ts: two blanks by two intakes within SYNC_WINDOW fuse (FUSE_MULT); a lone blank fires as a load of its own
  crucible: { word: "PAIR", text: () => "{*PAIR}: TWO BLANKS BY TWO INTAKES AT ONCE FUSE; A LONE ONE FIRES ON ITS OWN." }, // NUM-4: no 0.25 s
  // battle.ts stokedPace: a stoked factory's other timers (ARMOR PRESS's plating) run faster too
  stoker: { word: "FASTER", text: () => "FASTER: IT STAMPS AND POURS SOONER, AND ITS OTHER TIMERS RUN FASTER TOO." },
};

/** The tap note of piece `def` for `word` (a trigger label's word or a rule's word), else undefined. */
export function tapNote(def: string, word: string): TapNote | undefined {
  const n = TAP_NOTES[def];
  return n && n.word === word.toUpperCase().replace(/:$/, "") ? n : undefined;
}

/** What a tap on `word` shows, in markup, on piece `def` at `stars` (o: the core's class factor k, the run's hero): the
 *  piece's tap note on that word; else its row's: a face keyword on a faced piece takes the piece's own reminder (its
 *  number) and the row's extra sentence; else the row's definition. Undefined for a word with no row. */
export function glossaryText(word: string, piece?: { def: string; stars: number; o?: TextOpts }): string | undefined {
  if (piece) {
    const n = tapNote(piece.def, word);
    if (n) return n.text(effectAt(piece.def, piece.stars), { stars: piece.stars, k: piece.o?.k ?? 1 });
  }
  const found = glossaryEntry(word);
  if (!found) return undefined;
  const row = glossaryRows().find((r) => r.word === found.word)!; // built now: its numbers go through the formatters now
  if (row.kw && piece && hasFace(piece.def)) {
    const own = faceAt(piece.def, piece.stars, piece.o ?? {})?.reminders.find((r) => r.includes(`{*${row.kw}}`));
    if (own) return row.extra ? `${own} ${row.extra}` : own;
  }
  return row.def;
}

/** A definition in glyphs (icons()), as it is drawn. */
export const glossaryGlyphs = (markup: string): string => icons(markup);
