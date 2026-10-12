// RUNES-1 (REQ-BFG-058, M2): a rune's text as the picker, the rune bar and its read-out draw it. A rune's effect is data
// (src/sim/runes.ts RuneDef.text) with R1b-2's tokens: {N} is the typed amount, {NAME} / {*NAME} a keyword. Numbers fill
// in from RuneDef.amount through ONE small formatter per unit (RUNE_UNIT_TEXT), never as literal numbers in a string. On
// this base a keyword token renders as its keyword WORD in its keyword colour (KEYWORD_WORD, RUNE_KEYWORD_COLOUR); when
// the U2 face line merges, the same tokens become its icons. Text style (T1): one idea, whole numbers, no "·" chains in
// an effect line, no hand wrapping (richText.ts wrapRich breaks lines at draw time where a panel needs it).

import { C, RARITY_COLOR } from "../render/palette";
import { ICON } from "../render/font"; // SUS-D (REQ-BFG-069): the SEC icon after a whole number of seconds
import type { Rarity } from "../sim/content";
import type { RuneDef, RuneTheme, RuneUnit } from "../sim/runes";
import { NUMBER_COLOUR, type Span } from "./richText";
import { RUNE_REMINDER, glossaryEntry } from "./glossary"; // U2c: the keyword colours and reminders, one source
import { RUNE_NOTE } from "./glossary"; // Y-FURN: a rune's own reminder (SHATTER SHOT's)
import { FRAY_MAX } from "../sim/content"; // CARD-2 (REQ-BFG-081, K3 c): SNARE KNOT's FULL, named
import { fmtCount } from "./statFormat"; // CARD-2 (K3 c): the one formatter for a count
import { gameWords } from "./gameWords"; // CARD-3 (REQ-BFG-107): a sim string in the player's words
import { HEROES, ITEMS, type HeroId } from "../sim/content"; // CARD-4 run 3 (I): the source lines' names, never literals

/** A whole number as the game writes it. No rounding here: a rune whose amount is not whole shows it, and
 *  tests/runes.ui.test.ts (every number in every rune text is whole) catches it. */
const whole = (n: number): string => String(n);

/** One formatter per unit (the NUMBERS job scales dmg, hull and plate amounts by script; the text never changes). */
export const RUNE_UNIT_TEXT: Readonly<Record<RuneUnit, (n: number) => string>> = {
  dmg: whole,
  hull: whole,
  plate: whole,
  gold: whole,
  belt: whole,
  count: whole,
  pct: (n) => `${whole(n)}%`,
  // SUS-D (REQ-BFG-069): whole seconds, the SEC icon after the number, as the faces write a cadence ("6" then SEC: TICK
  // GUARD's EVERY 6s, WARD BELL's line form)
  sec: (n) => `${whole(n)}${ICON.SEC}`,
};

/** The keywords a rune's text may name, and the word each renders as on this base. */
// RUNES-2a: BURN, RIDE and STALL join (the new runes name them), each in the colour the game's text already gives it
// SUS-B (REQ-BFG-069): SHIELD, HEAL and REGEN join (WARD STONE names SHIELD now; SUS-D's runes name all three)
// FLIP-X2 (N4-d, REVIEW-NUM4 section 4): the STALL token is STUN now (STEADY IRON's {*STUN}), one word for one stop; STALL
// stays only as a glossary alias of STUN
export type RuneKeyword = "HULL" | "BELT" | "GOLD" | "DMG" | "RATE" | "PLATE" | "PAIR" | "HEAT" | "FRAY" | "BURN" | "RIDE" | "STUN"
  | "SHIELD" | "HEAL" | "REGEN"
  // CARD-4 (REQ-BFG-081, T; READ-4 11 item 6): word-only keywords, a word target with a note on the cards that name them
  // (SCRAP HALO's and SCRAP SAINT's MERGED, TOLL ROAD's LOAD and RIG), never a rune's chip word or its chip's line
  // (WORD_ONLY): glossary.ts RUNE_WORD_NOTE has their notes
  | "MERGED" | "LOAD" | "RIG";
// CARD-3 (REQ-BFG-107): the tokens keep their internal names; the soak layer (PLATE) reads SHIELD and the block (SHIELD)
// reads WARD, as font.ts PLAYER_WORD draws the faces' keywords (each keeps its colour: the glossary row of its word)
export const KEYWORD_WORD: Readonly<Record<RuneKeyword, string>> = {
  HULL: "HULL", BELT: "BELT", GOLD: "GOLD", DMG: "DMG", RATE: "RATE", PLATE: "SHIELD", PAIR: "PAIR", HEAT: "HEAT", FRAY: "FRAY",
  BURN: "BURN", RIDE: "RIDE", STUN: "STUN", SHIELD: "WARD", HEAL: "HEAL", REGEN: "REGEN",
  MERGED: "MERGED", LOAD: "LOAD", RIG: "RIG", // CARD-4 (T)
};
/** CARD-4 (REQ-BFG-081, T): the keywords that are only words with a note (a target on the card): never the chip's word
 *  (runeKeyword), never the chip's line (runeReminder), never a row of the panels' KEYWORDS view (keywords.ts runeWords). */
export const WORD_ONLY: ReadonlySet<RuneKeyword> = new Set<RuneKeyword>(["MERGED", "LOAD", "RIG"]);

/**
 * SUS-B (REQ-BFG-069, REQ-BFG-070; SUSTAIN-1 4.2): a rune's effect line as the cards draw it, where it differs from
 * RuneDef.text (src/sim/runes.ts, which a display job leaves alone). SUS-D moved its one row (WARD STONE's "START: +{N}
 * {*SHIELD}.") into runes.ts with the sustain runes, so it is empty: every card reads RuneDef.text. Kept, with
 * runeTextOf, as the place a later display job overrides a line without touching the rules file.
 * Y5 (release Y; BRIEF-Y5; REVIEW-Y3: ONLINE retires once no text names it; folded at the flip, Y7b2, from the star switch's
 * STAR_RUNE_TEXT): QUICK LATCH says START, the word ASSEMBLY LINE's face uses (abilityText.ts startIn), where it said
 * ONLINE; text only: the rune's rule, id and amount are unchanged, and RuneDef.text (src/sim/runes.ts) stays.
 */
export const RUNE_TEXT: Readonly<Record<string, string>> = {
  // WORDS-1 (REQ-BFG-081; READ-1 6.1's one-offs: START): START WORKING, as ASSEMBLY LINE's face (was "YOUR {BELT} RIGS: START
  // {N} SOONER."; battle.ts:839: every rig's online time x the rune's share)
  quick_latch: "YOUR {BELT} RIGS START WORKING {N} SOONER.",
  // WORDS-1 (REQ-BFG-081; READ-1 6.1, round D; cap's design call 1): the coined rune words in plain words, text only (src/sim
  // runes.ts keeps RuneDef.text, so no rule, id, amount or hash moves). VOLLEY: battle.ts:1757 opens a volley when a turret
  // turns from loading to firing and 546-550 spend it on its first load fired (GATLING: every load; SALVO: the salvo's first
  // load; COMPOUND: each shell); FINAL NAIL: 1889, the load that leaves the chamber empty, never on a GATLING SPOOL (its
  // opened card says so: glossary.ts RUNE_NOTE). Each line is one line of the card (223 px of 5x7: tests/runes.ui), so the
  // two VOLLEY openers say GUN, the game's other word for a turret (A TURRET'S ... is 229 to 241 px)
  final_nail: "THE SHOT THAT EMPTIES A TURRET: +{N} {DMG}.",
  ember_shot: "FIRST SHOT AFTER A GUN LOADS: +{N} {*BURN}.",
  first_blood: "FIRST SHOT AFTER A GUN LOADS: +{N} {DMG}.",
  // MERGED: runes.ts:566-569 counts each placed, fitted or installed piece at ★2 or ★3 (cargo is not the build's), once;
  // IN USE, and its opened card says what that is (RUNE_NOTE). CARD-2 (K3 d): SCRAP HALO's and SCRAP SAINT's one row each
  // is below (was "+{N} {HULL} FOR EACH ★2 OR ★3 PIECE IN USE." and "+{N} {DMG} FOR EACH ★2 OR ★3 PIECE IN USE." here; a
  // second key in the literal, which tsc refuses, TS1117)
  // STAMP: battle.ts:1096 each slug through a factory's one-slug stamp (batches' too, 1033-1049); a cast (TWIN MOULD,
  // 1045-1047) or a pour (CRUCIBLE, races/foundry.ts:68-121) gives none: its opened card says so (RUNE_NOTE)
  // CARD-3 (REQ-BFG-107): "EACH SLUG FROM YOUR FACTORY" (was "EACH SLUG YOUR FACTORY MAKES"): with the word SHIELD (one
  // letter more than PLATE) the old line took 225 px, past the op view card's 223 (one line, tests/runes.ui.test.ts); this
  // one 219. The same claim: battle.ts:1096 each slug a factory of the rune holder's side stamps adds N (PLATE_CAP holds)
  forge_ward: "EACH SLUG FROM YOUR FACTORY: +{N} {*PLATE}.",
  // MACHINES: battle.ts:570 every impact whose target is not the hull (belt tiles, rigs, factories, turrets): ENEMY PARTS,
  // and its opened card says what a part is (RUNE_NOTE; the PART row's words)
  scrap_biter: "YOUR HITS ON ENEMY PARTS: +{N} {DMG}.",
  // MACHINES, and a keyword's suffix ({*STUN}S, TEXT-STYLE 7.2): battle.ts:2212 cuts every STUN on your side's parts
  steady_iron: "{*STUN} ON YOUR SHIP: -{N}.",
  // READ-1 6.1's one-offs: WITHOUT FRAY: battle.ts:2071-2073 a hit whose slug adds no FRAY adds the rune's FRAY
  thread_storm: "YOUR HITS THAT ADD NO {*FRAY} ADD {N} {*FRAY}.",
  // READ-1 6.2: REGEN merged into HEAL: battle.ts:1441-1454 GREEN THREAD's amount goes through heal() each whole second
  green_thread: "YOUR HULL: {*HEAL} {N} EACH SEC.",
  // CARD-2 (REQ-BFG-081, K3 a; READ-3 4.1, 6: Haiku hedged between the run and the fight on START): every "START:" line is
  // the fight's start, one label for all: battle.ts:497-511, Battle's constructor (one Battle per fight: arena.ts:130)
  // adds the PLATE, the foe's FRAY and BURN and the SHIELD ("battle-start runes"). FIGHT START: fits every card (171 px of
  // 5x7 at most, under the 390-wide phones' 216); EACH FIGHT: fits too, but reads as a state held all fight ("EACH FIGHT:
  // THE FOE HAS 5 FRAY"), where the FRAY is added once, at the start
  rivet_hoard: "FIGHT START: +{N} {*PLATE}.",
  grave_plates: "FIGHT START: +{N} {*PLATE}.",
  loose_thread: "FIGHT START: THE FOE HAS {N} {*FRAY}.",
  tangle_wire: "FIGHT START: THE FOE HAS {N} {*FRAY}.",
  ash_kindle: "FIGHT START: THE FOE HAS {N} {BURN}.",
  ward_stone: "FIGHT START: +{N} {*SHIELD}.",
  bulwark_ward: "FIGHT START: +{N} {*SHIELD}.",
  searing: "FIGHT START: THE FOE HAS {N} {*BURN}. FOE WITH YOUR {*BURN}: NO {*HEAL}.",
  // CARD-2 (K3 c; READ-3 6: FULL): the number FULL is: battle.ts:571 runeHit adds the rune's DMG while the foe's hull holds
  // its FRAY cap (frayMax), which makeSide sets to FRAY_MAX (content.ts: 15) and impact (2068) raises only for a payload's
  // frayCap, which no piece has since Y3 (content.ts:694). The number from the sim's constant, never a literal
  snare_knot: `AT ${fmtCount(FRAY_MAX)} {*FRAY} (FULL): YOUR HITS +{N} {DMG}.`,
  // CARD-2 (K3 d; READ-3 6: ★2 and ★3 not read as merged): runes.ts:566-569 mergedPieces counts each placed, fitted or
  // installed piece at ★2 or more (★3 is the top), once; battle.ts:841 (HULL) and 540 (+n% DMG a merged piece). MERGED is
  // the MERGE badge's word (glossary.ts CORE_WORDS); IN USE keeps its note on the opened card. 223 px: one line on the op
  // card (the 390-wide phones wrap it, as WORDS-1's 217 px line did)
  // CARD-4 (REQ-BFG-081, T; READ-4 11 item 6: no note said what merging is): MERGED a word with a note (RUNE_WORD_NOTE);
  // the line's words and width are as before
  scrap_halo: "+{N} {HULL} PER {MERGED} (★2/★3) PIECE IN USE.",
  scrap_saint: "+{N} {DMG} PER {MERGED} (★2/★3) PIECE IN USE.",
  // CARD-2 (K3 e; READ-2 7.1: each load counts its own rigs; Haiku read it as all damage rising): battle.ts:540 runeMul
  // multiplies a shot by priorPct x p.prior, the gates that payload passed (1693: p.prior++ at each rig hit on it)
  // CARD-4 (T; READ-4 11 item 6): LOAD and RIG words with notes (RUNE_WORD_NOTE); the line as before
  toll_road: "EACH {LOAD}: +{N} {DMG} PER {RIG} IT PASSED.",
  // CARD-4 (REQ-BFG-081, REQ-BFG-089, T; READ-4 3: a reader hedged on whether +150 HULL lasts; its KEPT ALL RUN was behind the
  // chip): the rune's own fact on its face. runes.ts:704 / run.ts:211 add the amount to build.hullBonus when it is taken, the
  // max hull every fight starts full at (LAST CHANCE's +500 MAX HULL is the same field), for the rest of the run (104 px)
  iron_skin: "+{N} MAX {HULL}, ALL RUN.",
  spare_hull: "+{N} MAX {HULL}, ALL RUN.",
  // CARD-2 (K3 f; READ-2 7.1: Haiku read PAIR: as once a fight): battle.ts:639 runeHeal heals the rune's n on each PAIR shot
  // that lands (payload.paired), every time
  twin_salve: "EACH {PAIR}: {*HEAL} {N}.",
};
/** A rune's effect line in R1b-2's tokens: its RUNE_TEXT row, else RuneDef.text. */
// CARD-3 (REQ-BFG-107): RuneDef.text (src/sim) through the one display function (its tokens and names untouched)
export const runeTextOf = (def: RuneDef): string => RUNE_TEXT[def.id] ?? gameWords(def.text);
/** Each keyword's colour (render/palette.ts C): the hull's red, gold's yellow, the belts' brass, damage white, speed's yellow
 *  (richText.ts KEYWORD_COLOUR.faster), BASTION's plating, FOUNDRY's pair cyan, FURNACE's fire, WEAVER's plum. RUNES-2a:
 *  BURN in richText's burn colour (fire, as HEAT), RIDE in the belts' wood, STUN in shock's cyan (was the STALL token).
 *  U2c (REQ-BFG-046; REQ-BFG-032 rule 3): one source, the glossary's row for the word (src/ui/glossary.ts): a face keyword in
 *  its icon's colour (font.ts ICON_COLOUR: PAIR the TWIN family's blue, HEAT amber, as the faces draw them), STUN in STUN's. */
export const RUNE_KEYWORD_COLOUR: Readonly<Record<RuneKeyword, string>> = Object.fromEntries(
  (Object.keys(KEYWORD_WORD) as RuneKeyword[]).map((k) => [k, glossaryEntry(KEYWORD_WORD[k])?.colour ?? C.bone]),
) as Record<RuneKeyword, string>;
/** The effect line's own colour (richText.ts colourize's base) and its numbers' (richText NUMBER_COLOUR). */
export const RUNE_TEXT_COLOUR = C.bone;

const TOKEN = /\{(\*?)([A-Z]+)\}/g;
const isKeyword = (k: string): k is RuneKeyword => Object.prototype.hasOwnProperty.call(KEYWORD_WORD, k);

/** The rune's amount as its text shows it ("15", "25%"). */
export const runeAmountText = (def: RuneDef): string => RUNE_UNIT_TEXT[def.amount.unit](def.amount.n);

/**
 * RuneDef.text as rich-text spans (richText.ts Span): {N} filled from def.amount through its unit's formatter, in the
 * number colour (a "+" or "-" right before it joins the number, as colourize colours "+15"); each keyword token as its
 * word in its colour; the rest in RUNE_TEXT_COLOUR. An unknown token shows as its bare name (a test pins that none is).
 */
export function runeSpans(def: RuneDef, base: string = RUNE_TEXT_COLOUR): Span[] {
  return spansOf(def, runeTextOf(def), base); // SUS-B: WARD STONE's SHIELD line (RUNE_TEXT)
}

/** Y-FURN (REQ-BFG-070; TEXT-STYLE 3.1): a rune text's sentences, in order. One ability line is one trigger and one
 *  effect, so a text of two abilities (SEARING, SHATTER SHOT) is two sentences, and a card starts each on its own line
 *  (runeBar.ts runeTextLines). Every other rune's text is one sentence. A template holds no digit (no literal number) and
 *  no line break (TEXT-STYLE 8.2), so a full stop then a space always ends a sentence. */
export const runeSentences = (def: RuneDef): string[] => runeTextOf(def).replace(/\.\s+(?=\S)/g, ".\n").split("\n");

/** Y-FURN: each sentence of the rune's text as rich-text spans, as runeSpans makes the whole text's. */
export const runeSentenceSpans = (def: RuneDef, base: string = RUNE_TEXT_COLOUR): Span[][] =>
  runeSentences(def).map((t) => spansOf(def, t, base));

/** RuneDef.text's tokens in `text` (the whole text or one sentence of it) as spans: runeSpans' rule. */
function spansOf(def: RuneDef, text: string, base: string): Span[] {
  const out: Span[] = [];
  const push = (t: string, c: string) => {
    if (!t) return;
    const last = out[out.length - 1];
    if (last && last.c === c) last.t += t;
    else out.push({ t, c });
  };
  let at = 0;
  for (const m of text.matchAll(TOKEN)) {
    let plain = text.slice(at, m.index);
    at = (m.index ?? 0) + m[0].length;
    const name = m[2];
    if (name === "N") {
      const sign = /[+-]$/.exec(plain)?.[0] ?? "";
      plain = sign ? plain.slice(0, -1) : plain;
      push(plain, base);
      push(sign + runeAmountText(def), NUMBER_COLOUR);
    } else {
      push(plain, base);
      push(isKeyword(name) ? KEYWORD_WORD[name] : name, isKeyword(name) ? RUNE_KEYWORD_COLOUR[name] : base);
    }
  }
  push(text.slice(at), base);
  return out;
}

/** The effect line's plain text ("+15 HULL."). */
export const runeLine = (def: RuneDef): string => runeSpans(def).map((s) => s.t).join("");

/** The keywords a rune's text names, in order (the starred ones first: they carry a reminder). */
export function runeKeywords(def: RuneDef): RuneKeyword[] {
  const starred: RuneKeyword[] = [], plain: RuneKeyword[] = [];
  for (const m of runeTextOf(def).matchAll(TOKEN)) {
    const k = m[2];
    if (!isKeyword(k)) continue;
    const list = m[1] ? starred : plain;
    if (!list.includes(k)) list.push(k);
  }
  return [...starred, ...plain.filter((k) => !starred.includes(k))];
}

/** The keyword a rune's chip shows: its first starred keyword (the one with a reminder), else the last one named
 *  ("+{N} {HULL}." -> HULL; "EACH TURRET'S FIRST SHOT: +{N} {DMG}." -> DMG). */
export function runeKeyword(def: RuneDef): RuneKeyword | null {
  const text = runeTextOf(def); // SUS-B: WARD STONE's SHIELD line (RUNE_TEXT)
  const starred = /\{\*([A-Z]+)\}/.exec(text)?.[1];
  if (starred && isKeyword(starred)) return starred;
  const all = [...text.matchAll(TOKEN)].map((m) => m[2]).filter(isKeyword).filter((k) => !WORD_ONLY.has(k)); // CARD-4 (T)
  return all.length ? all[all.length - 1] : null;
}

/** The keyword reminders (no numbers: the amounts live in the effect line). U2c (REQ-BFG-046): the glossary's
 *  (src/ui/glossary.ts RUNE_REMINDER), each saying what its row says, one source. */
const REMINDER: Partial<Record<RuneKeyword, string>> = RUNE_REMINDER;
export const PLAIN_REMINDER = "KEPT ALL RUN.";

/** One short reminder line for an opened card: its keyword's (PLATE, PAIR, HEAT, FRAY, RATE), else PLAIN_REMINDER.
 *  Y-FURN: a rune's own reminder (glossary.ts RUNE_NOTE: SHATTER SHOT's) comes first. */
export function runeReminder(def: RuneDef): string {
  if (RUNE_NOTE[def.id]) return RUNE_NOTE[def.id];
  for (const k of runeKeywords(def)) if (REMINDER[k] && !WORD_ONLY.has(k)) return REMINDER[k]!; // CARD-4 (T): never a word-only one's
  return PLAIN_REMINDER;
}

/** The reminder as spans: its keyword word in the keyword's colour, the rest in `base` (dim). Y-FURN: a rune's own
 *  reminder colours the keyword it leads with, as a keyword's reminder does. */
export function runeReminderSpans(def: RuneDef, base: string = C.slate4): Span[] {
  const s = runeReminder(def), note = RUNE_NOTE[def.id];
  const k = runeKeywords(def).find((q) => (note ? s.startsWith(`${KEYWORD_WORD[q]}: `) : REMINDER[q] === s));
  if (!k || !s.startsWith(KEYWORD_WORD[k])) return [{ t: s, c: base }];
  return [{ t: KEYWORD_WORD[k], c: RUNE_KEYWORD_COLOUR[k] }, { t: s.slice(KEYWORD_WORD[k].length), c: base }];
}

// ---- CARD-4 run 3 (REQ-BFG-081, I; ref/open1 REPORT-OPEN1 sections 4 and 9; cap's words, RESTART-RUN3 2 (c)) ----------

/** A part-keyed rune's source: a shop part and a hero's own factory that give its keyword (by id: the words are their
 *  display names, ITEMS[...].name and HEROES[...].name, so a later rename follows), or `twoBelts`: a turret fed by two
 *  belts (ten turrets take in from both sides: content.ts intake "both"; FOUNDRY's CRUCIBLE pours pairs as well). */
export interface RuneSource {
  part?: string;
  hero?: HeroId;
  factory?: string;
  twoBelts?: true;
}
const HEAT_SOURCE: RuneSource = { part: "heatjacket", hero: "furnace", factory: "kiln" };
const FRAY_SOURCE: RuneSource = { part: "barbed", hero: "weaver", factory: "loom" };
const SHIELD_SOURCE: RuneSource = { part: "plateroller", hero: "bastion", factory: "wardworks" }; // the sim's PLATE
const PAIR_SOURCE: RuneSource = { twoBelts: true };

/** The 16 runes that do something only with a part (OPEN-1 section 4), keyed by rune id: one table. */
export const RUNE_SOURCE: Readonly<Record<string, RuneSource>> = {
  coal_chute: HEAT_SOURCE, heat_sink: HEAT_SOURCE,
  double_knot: FRAY_SOURCE, snare_knot: FRAY_SOURCE, barbed_silk: FRAY_SOURCE, widows_web: FRAY_SOURCE, loom_of_woe: FRAY_SOURCE,
  iron_temper: SHIELD_SOURCE, bulwark_oath: SHIELD_SOURCE,
  twin_nails: PAIR_SOURCE, molten_bond: PAIR_SOURCE, seam_rivets: PAIR_SOURCE, hot_seam: PAIR_SOURCE, twin_suns: PAIR_SOURCE,
  molten_vows: PAIR_SOURCE, twin_salve: PAIR_SOURCE,
};

/** "A" or "AN" before a name. */
const aOrAn = (name: string): string => (/^[AEIOU]/.test(name) ? "AN" : "A");

/** CARD-4 run 3 (I): the line under a part-keyed rune's reminder in its notes (the chip's note, the opened card's), never
 *  on its face (REQ-BFG-089): a part it works with, never "only" (other sources exist: OPEN-1 section 4, the REPORT's sim
 *  checks). Null for any other rune. */
export function runeSourceLine(def: Pick<RuneDef, "id">): string | null {
  const s = RUNE_SOURCE[def.id];
  if (!s) return null;
  if (s.twoBelts) return "WORKS WITH A TURRET THAT TAKES IN FROM TWO BELTS."; // LOAD's note's words (TAKES IN FROM A BELT)
  const part = ITEMS[s.part!].name, hero = HEROES[s.hero!].name, factory = ITEMS[s.factory!].name;
  return `WORKS WITH ${aOrAn(part)} ${part} OR ${hero}'S ${factory}.`;
}

/** The tier as a word (FIX-10: the tier shows as a word as well as a colour). */
export const tierWord = (tier: Rarity): string => tier.toUpperCase();
/** The tier's colour (palette.ts RARITY_COLOR). */
export const tierColour = (tier: Rarity): string => RARITY_COLOR[tier] ?? C.steel3;

const THEME_WORD: Readonly<Record<RuneTheme, string>> = {
  furnace: "FURNACE", weaver: "WEAVER", foundry: "FOUNDRY", bastion: "BASTION", belts: "BELTS", factories: "FACTORIES",
  turrets: "TURRETS", gold: "GOLD", armor: "ARMOR", stars: "STARS", // RUNES-2a: R1b's "stars and merging"
};

/** WORDS-1 (REQ-BFG-081; READ-1 6.1's one-offs: LAST STAND's TURRETS tag read as its scope): a rune whose theme's word says
 *  less than its rule. LAST STAND speeds guns (battle.ts:1791) and factories (1026). */
export const RUNE_TAG: Readonly<Record<string, string>> = { last_stand: "GUNS AND FACTORIES" };

/** The card's tag line: "RARE · ARMOR". */
export const runeTag = (def: RuneDef): string => `${tierWord(def.tier)} · ${RUNE_TAG[def.id] ?? THEME_WORD[def.theme]}`;

/** The read-out's sub line: "RARE RUNE · TAKEN DAY 4" (`day`: the dawn it was taken). */
export const runeTaken = (def: RuneDef, day: number): string => `${tierWord(def.tier)} RUNE · TAKEN DAY ${day}`;

/** A rune's initials for its chip ("IRON SKIN" -> "IS", "GUN OIL" -> "GO"; one word: its first two letters). */
export function runeInitials(def: RuneDef): string {
  const w = def.name.split(/\s+/).filter(Boolean);
  return w.length >= 2 ? w[0][0] + w[1][0] : (w[0] ?? "?").slice(0, 2);
}
