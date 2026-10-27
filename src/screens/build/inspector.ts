// Details panel: explains the hovered or selected thing (card, cargo, deck item, belt route,
// turret) with its action button; idle it shows the cruiser card. Landscape uses the left
// column (sized to its content), portrait the strip between the shop and the deck.
//
// 0.6.2t (REQ-BFG-032): the body is blocks of whole sentences from the glossary (src/ui/abilityText.ts), wrapped by the
// one helper (src/ui/richText.ts) at draw time (T4):
// - the ability text: bone, numbers white, BURN / SHOCK / FREEZE / POISON / FASTER / SLOWER in their battle colours, and
//   a perk's name right after the sentence it names, in the perk colour, never split (Y7b2, ruling R-1 for every piece: no
//   panel body draws a perk's name now; the ⓘ view's LEVELS do);
// - the next-star line ("NEXT STAR: FEEDS 3 BELTS."), its own line (U2e: no merge progress; the ⓘ view holds it);
// - stat rows with aligned values (a belt's timeline and gun-end readout, a turret's rows);
// - then, set apart by a rule, the flavour (dimmer, the small face) and the action hint (dimmer again).
// planPanel is the pure layout that drawDetails and the tests share: blocks marked `keep` always show whole (the phone
// guarantee, T6: the opening sentence, the hits or IDLE, the perk and the next-star line); every
// other block shows whole or not at all (the flavour too, 0b.5), in rank order while there is room. Where the kept blocks
// don't fit, the panel's compact variants are tried, fullest first (0.6.2p item 3's approach).

import { shopBadge, type DuskFoe, type Run } from "../../game/run";
import { record } from "../../game/day";
import { FINDING_GHOST } from "../../game/session"; // 0.7.0a: the NEXT BATTLE card online
import { drawStakes, duskStakes, livesOf, stakesWidth, STAKES_SAVES, STAKES_SAVES_SHORT, type DuskStakes } from "../../ui/stakes"; // RETUNE-1 run 2: the hearts at stake
import { heartsRun, livesCap } from "../../sim/hearts"; // RETUNE-1 run 2: the hero card's HEARTS
import { HEROES, ITEMS, SIGNATURE_CORES, START_LIVES, classFactor, rigShape, type HeroId } from "../../sim/content";
import type { ModuleTag } from "../../sim/content"; // 0.8.0 I1 M4: the families in the header
import type { ItemDef } from "../../sim/content"; // SHOPCARD-1e (E3, E4): offerLabel
import { drawFamilyMark, familiesOf, famHeadSpans, famHeadText } from "../../ui/families"; // 0.8.0 I1 M4 (REQ-BFG-023 part 2); PRESENT-2 W (b): the head's words
import { makeTurret } from "../../sim/battle"; // 0.6.1p: the turret's window as the battle sees it
import {
  arrowsOf, beltUsed, canSellTurret, connectedRouteCount, defOf, gearFor, gearOn, hitsOfRig, installedTurrets, itemByUid, routeInfo,
  routesOf, turretSellValue, turretSlots, walkRoute, type Build, type RigHit, type RouteWalk, type TimelineHit,
} from "../../sim/deck";
import { joinersOf, type WalkJoin } from "../../sim/deck"; // 0.6.2j: belt joins
import { stokeHits } from "../../sim/deck"; // 0.8.0 P1 (E3): a STOKER's hits are the factories its arrows work
import { platedDeck } from "../../sim/deck"; // 0.8.0 B1 M2 (F1): PLATE BREAKER's two DMG numbers
import { stokeKeep } from "../../sim/deckRating"; // 0.8.0 I1 M4 (VERIFIED-P1 H4): a stoke capped by its gun
import { effectAt } from "../../sim/stars"; // 0.8.0 I1 M4: a STOKER's stoke at its stars
import { JOIN_PACE_LINE, JOIN_PACE_PCT, factoryPace, loadEvery } from "../../sim/deck"; // 0.6.2 TUNE-M: RULE JOIN PACE
import { freeJoinsRules } from "../../sim/freeJoins"; // JOINS-1 (REQ-BFG-091): no pace words with FREE_JOINS on
import { drawKeywordLayer, keywordCursorOff } from "./keywords"; // U2c (REQ-BFG-045): tap to explain
import { infoFree } from "./keywords"; // U2f (REQ-BFG-070): the room the ⓘ view grows into
import { keywordsIdle } from "./keywords"; // CARD-2 (REQ-BFG-004, K1): a closed panel's next draw is a new open
import { definitionAhead, type ColumnSpec, type NoteHang } from "./keywords"; // PRESENT-1 (S4 (b)): the note a finger's panel is about to show, for panelFit; PRESENT-2 L: NoteHang; P: ColumnSpec
import { nextBlocks } from "./levels"; // U2e step 5 (REQ-BFG-070): the ⓘ view's LEVELS and the next-star line

/**
 * 0.6.2 TUNE-M, RULE JOIN PACE: the lines a joined factory's panels lead with (its own panel, and each of its belts'):
 * JOIN_PACE_LINE ("JOINED: THIS FACTORY RUNS AT 70% PACE.") and, for belt `index` (or the factory's first belt), how
 * often a load now leaves onto it against the unjoined rate. [] for a factory none of whose belts joins, so those
 * panels read as before. JOINS-1 (REQ-BFG-091): [] for every factory with FREE_JOINS on (factoryPace is 1: no line at
 * all, not a 100% line).
 */
export function joinPaceLines(b: Build, factoryUid: number, index = b.routes.findIndex((r) => r.factory === factoryUid)): [string, string][] {
  const pace = factoryPace(b, factoryUid);
  if (pace >= 1 || index < 0) return [];
  const every = loadEvery(b, index);
  const lines: [string, string][] = [[JOIN_PACE_LINE, C.cyan]];
  // 0.6.2rel3 (REQ-BFG-032 F2): the seconds in the glossary's words ("2 SECONDS"), as every other sentence says them.
  // NUM-4 (REQ-BFG-047): a joined belt's load cadence (loadEvery: the stamp's 30 / speed x its belts / the pace) is a
  // repeating action that no whole number states exactly (2.5 s / 0.7 = 3.57 s), so the line says it in loads: as many as
  // the pace lets through, said by the pace line's whole % (was "A LOAD EVERY 3.57 SECONDS ON THIS BELT, NOT 2.5 SECONDS.")
  if (Number.isFinite(every)) lines.push([`FEWER LOADS REACH THIS BELT: ${JOIN_PACE_PCT}% AS MANY.`, C.cyan]);
  return lines;
}

/** 0.6.2rel3: joinPaceLines as panel blocks, cyan as the join rows: the pace sentence always shows (keep); the load
 *  sentence is optional and gives way early when room is short. [] unless the factory's belt joins another. */
function joinPaceBlocks(b: Build, factoryUid: number, index?: number): Block[] {
  return joinPaceLines(b, factoryUid, index).map(([text, colour], i): Block => (i === 0
    ? { role: "hits", text, colour, keep: true }
    : { role: "hits", text, colour, rank: 3 }));
}

/** 0.6.2s (REQ-BFG-031 S2): the build's intakes: its installed turrets' belt columns (an empty slot has none). */
const intakeCount = (b: Build): number => turretSlots(b).reduce((n, s) => n + s.intakes.length, 0);
import { resolveCore } from "../../sim/cores"; // 0.6.1b
import { C, RARITY_COLOR } from "../../render/palette";
import { rect, type G } from "../../render/pixel";
import { drawText, textWidth, type FontId } from "../../render/font";
import { beltIcon, itemIcon } from "../../render/sprites";
import { syncIcon } from "../../render/raceFx"; // 0.8.0 H1 M3: the SYNC mark
import { syncOf } from "../../sim/syncEstimate";
import { SYNC_WINDOW } from "../../sim/races/foundry";
import { button, panel, statsPanel, type Rect } from "../../ui/ui";
import { skinOf, type PanelId } from "../../render/styles"; // CUSTOM-2a (REQ-BFG-072): the part and hero panels' style
import { drawPortrait, tag } from "../../ui/captain";
import { buy, deleteRoute, rotate, selectGain, sell, sellPrice, store, unfitCore, unfitMod, upgrade, type Ctx } from "./actions";
import { fusible, gradeOf, outputsAt, starsOf, starText, upgradeLevel } from "../../sim/stars";
import { enchantRules, wideSlots } from "../../sim/enchant"; // ENCHANT-1 (REQ-BFG-085): WIDE on a factory is +1 belt slot
import { sellLabelFor, wordSpec } from "./apply"; // ENCHANT-1 (REQ-BFG-085, E4, E5): the armed SELL label, a word card's panel
import { factoryNext, levelLine, turretSpeedRow, upgradeLabel } from "../../ui/upgradeText"; // bb-0.8.3 (REQ-BFG-043 D11)
import { nextUpgrade, upgradeShown } from "../../game/run"; // bb-0.8.3 (D11)
import { shopShut } from "../../game/run"; // AZ-PREP (REQ-BFG-077; REVIEW-NPC1 Q4): no SELL button in REFIT (NPC_DAY on)
import type { UpgradeTrack } from "../../sim/content"; // bb-0.8.3 (D11)
import { UPGRADE_MAX } from "../../sim/content"; // NUM-4: the starting turret's next TURRET SPEED level
import { hullShown } from "../../sim/hullScale"; // HULL-1a (REQ-BFG-079): the hero card's and the foe's hull on the day's hull
import { dmgShown } from "../../sim/hullScale"; // HULL-1d (REQ-BFG-079): the belt readout's DMG x D(d) on the run's day
import { mergePreview } from "../../game/fuse";
import { flavourText } from "./flavour"; // 0.6.2p (item 1): the desc at the module's stars; 0.6.2t: whole sentences
import {
  abilityText, clashShortText, every as everyText, gatlingClashText, gist, hasAbilityText, hitText, mergesWithText,
  newPerk, nextStarHeadline, nextStarText, percent, plural, seconds, shieldText, slagPulseExtra, type BeltKind, type TextOpts,
} from "../../ui/abilityText";
import { colourize, drawRich, lineText, lineWidth, PERK_COLOUR, wrapRich, type Span } from "../../ui/richText";
import type { Sel } from "./layout";
import { carrierBox, screenRect } from "./layout"; // PRESENT-2 L: the deck's screen rect, a hard line for a hanging note; P: the carrier's drawn box
import { DECK } from "../../render/frame";
import { describe, KIND_SUB, panelKind } from "./shop"; // WORDS-1: KIND_SUB, panelKind (a core's and gear's kind in plain words)
import {
  deadEndLines, freeNote, SLOT_HINT, slotActions, slotColor, slotIcon, slotLabels, slotNotes, slotSub, slotTitle, socketLines, turretHint,
  turretSpec, type SocketRow,
} from "./turretPanel"; // 0.6.2s; 0.6.2rel: its panels are PanelText too
import { touchSlotHint } from "./turretPanel"; // shoptap (REQ-BFG-035)
import { sellFitted, sellPlaced, storeFitted } from "./actions"; // shoptap (D2, REQ-BFG-035): SELL on the carrier's panels
import { canTurn, shapedPiece } from "./shapeEdit"; // SHAPES-1 (REQ-BFG-086 S2): a shaped factory's ROTATE
import { arrowCellsOf } from "../../sim/deck"; // SHAPES-1 (R2): a long rig's arrows, one per (cell, direction)
import { tapRect } from "../../ui/ui"; // shoptap (D5): a finger's tap target around a drawn button
import { tapPx } from "../../ui/tap"; // shoptap (D5)
import { faceBlocks, faceMergeBlock, faceNextBlock, hasFace } from "./faceBlocks"; // U2a (REQ-BFG-046): the new faces
import { PAIR_GAP, turretRow } from "./faceBlocks"; // CARD-2 (REQ-BFG-081, K4): the turret row's labels
import { ICON_COLOUR } from "../../render/font"; // CARD-2 (K4): a label's icon in its colour
import { NUMBER_COLOUR } from "../../ui/richText"; // CARD-2 (K4): a label's number
import { faceGist, heroPlaystyle, ruleSpans } from "../../ui/faces"; // U2a
import { speedPair } from "../../ui/faces"; // U2c step 4: the installed turret's stat row
import { salvoSpeed } from "../../sim/cores"; // Y1: SALVO RACK's volley pace, in a SPEED's one rounding; Y4 (S1): the sim's helper
import { statRow } from "../../ui/icons"; // U2c step 4
import { fmtClock, fmtCount, fmtDmg, fmtReadPct } from "../../ui/statFormat"; // U2c step 4; NUM-4: the estimate, whole
import { icons } from "../../render/font"; // U2c step 4
import { GAP, GAP_MIN } from "../../ui/spacing"; // SPACE-1 (REQ-BFG-087): the gaps between a panel's separate items
import { hintShows } from "../../ui/tips"; // EXPLAIN-1 (REQ-BFG-089, E5): a hint shows until its first-run tip is done
import { turretPlainOf } from "../../ui/faces"; // EXPLAIN-1 (E4, E9): NOTES' kind lines (PLAIN-1F M3: the rig sentence comes through plainNotes)
import { shapeNotes } from "../../ui/faces"; // SHAPES-1 (REQ-BFG-089): the shaped rigs' NOTES
import { gateNotes } from "../../ui/faces"; // GATES-1 (REQ-BFG-089): a gate's NOTES: the gate rule, the wait, the FUSER's order
import { beltTile } from "../../sim/split"; // GATES-1 (REQ-BFG-057): the belt a placed gate stands on
import { key } from "../../sim/deck"; // GATES-1: its cell
import { shapeLines } from "../../ui/faces"; // PLAIN-1F (M4): a placed long rig's UP TO n HITS, said by its arrows line
import { plainNotes } from "../../ui/faces"; // PLAIN-1F (REQ-BFG-089, M3): a plain rig's NOTES lead (was isPlainRig's rig sentence)
import { cardEffect } from "../../ui/faces"; // BUMP-1D P6: the offer panel's header-only one-line effect: cardText, else a plain rig's stat row (the twelve have no ability text)
import { scaleNotes } from "../../ui/faces"; // SCALE-2c (REQ-BFG-089): the 12 readers' NOTES line, SCALE_RIGS on only
import { ruleNotes } from "../../ui/faces"; // PRESENT-1 (REQ-BFG-081; REVIEW-READ14 fix 3): LIMPET WORKS's ANYTHING line
import { shapePic } from "../../ui/shapePic"; // SHAPES-1 (REQ-BFG-086.1): the panel face's shape picture
import { enchantNotes, wordTurretRow } from "../../ui/faces"; // ENCHANT-1 (REQ-BFG-085, E7): an enchanted piece's NOTES, an installed turret's row with its word
import { enchantedTitle, nameSpans, wordColour, wordOn, type WordOn } from "../../ui/enchantFaces"; // ENCHANT-1 (E7): the word first in the title, the piece's word as the faces read it
import { wordLineBlocks, wordOnSentences } from "./faceBlocks"; // ENCHANT-1 (E7): the word's line; a faceless piece's word
import { slotWord } from "./turretPanel"; // ENCHANT-1 (E7): the word an installed turret holds
import type { EnchantId } from "../../sim/enchant"; // ENCHANT-1: PanelText.ench

/** SHAPES-1 (REQ-BFG-086.1, S8): a panel's header picture: a shaped piece's shape with its arrows (ui/shapePic.ts), in the
 *  header's 16x16 box where every other piece keeps its icon. */
function panelIcon(def: string): HTMLCanvasElement {
  return shapedPiece(def) ? shapePic(def) : itemIcon(def);
}

/** 0.6.1a: an inspect title with its stars in the 5x7 ★ glyph ("TEMPER ★★"); 1 star shows none. */
const starred = (name: string, stars: number): string => (stars > 1 ? `${name} ${starText(stars)}` : name);
/** POLISH-1 (REQ-BFG-089; P5a, cap's answer 2 on ENCHANT-2W's read, REVIEW-ENCHANT2W.md:76): a panel's TITLE shows its star at ★1 too, `NAME ★` (the rows' names keep `starred`). */
const titled = (name: string, stars: number): string => `${name} ${starText(stars)}`;

/** ENCHANT-1 (REQ-BFG-085, E7): a panel's title and its word: `{ title }` for a plain piece (no `ench` key), `{ title: "FIERY WHETSTONE ★★",
 *  ench }` for one holding a word: the word first (the title's colour is the piece's rarity; the word's is drawn by fitTitle). */
const enchTitle = (w: WordOn | undefined, title: string): { title: string; ench?: EnchantId } => (w ? { title: enchantedTitle(w.id, title), ench: w.id } : { title });

/** 0.6.1r N4: the class factor a core in this run's cargo or shop would fire at: the hero's turrets (all of one
 *  class today: FURNACE heavy k 1, WEAVER light k 0.55), as resolveCore scales it once fitted. */
export function heroK(run: Run): number {
  const td = installedTurrets(run.build)[0]?.td; // 0.6.2s: the first installed turret (the hero's first, at the start)
  return td ? classFactor(td) : 1;
}

/** 0.6.2t: the glossary's options for a run: its hero's class factor (a core's numbers) and its hero (MIMIC FORGE). */
export function textOpts(run: Run): TextOpts {
  return { k: heroK(run), hero: run.hero as HeroId, day: run.day }; // HULL-1a (REQ-BFG-079): the day (the ARMOR PACK's hull)
}

// -------------------------------------------------------------------------------------------------------- the blocks

/** A block's role sets its colour and face (T4). */
export type Role = "hits" | "warn" | "ability" | "next" | "merges" | "merge" | "row" | "grid" | "note" | "flavour" | "hint"
  | "reminder" // U2a (REQ-BFG-046, R1 C4): a keyword's dim 3x5 reminder, right under its rule line (no divider before it)
  | "caveat"; // U2b F5: an interim caveat (faces.ts INTERIM_CAVEATS): kept, 3x5, the reminder's colour, no divider

/** One block of a panel's body: whole sentences, a stat row or a grid row of stat pairs. */
export interface Block {
  role: Role;
  /** Whole sentence(s); a stat row's value. */
  text: string;
  /** A stat row's label (its values align after the widest label of the panel, or of its group). */
  label?: string;
  /** 0.6.2t2 (F2): a stat row's alignment group: rows of one group share a value column (a turret's CORE and GEAR
   *  name rows apart from its FIRES, CHAMBER and LOAD TIME rows); ungrouped rows share one. */
  group?: string;
  /** A grid row: label and value pairs in two aligned columns (the belt's gun-end readout). */
  cells?: [string, string][];
  /** A perk's name, after the text in the perk colour, never split ("★3 TWIN SIGNET"). */
  perk?: string;
  /** Must show whole (T6's phone guarantee). */
  keep?: boolean;
  /** 0.6.2rel2 (the rehearsal's nit 1): kept in the desk column (planBody's keepBig) as `keep` is; on the phone band an
   *  optional block by its rank. A turret's gear clashes and MANTLET's shield. */
  deskKeep?: boolean;
  /** An optional block's order when room is short: the lowest first (default 5). */
  rank?: number;
  /** Optional blocks of one chain show in order: once one doesn't fit, the later ones stay out too (an ability's
   *  later sentences never show without the ones before them). */
  chain?: string;
  /** A shorter text for the last compact variant (the next-star line's headline, T6). */
  alt?: string;
  /** A belt's timeline row: they give way from the end, and a note says how many (0.6.2 BELTSIDE's trim). */
  trim?: boolean;
  /** 0.6.2j (J10): a timeline row that is a JOINS line, not a hit tile (the trim note counts hit tiles only). */
  join?: boolean;
  /** The text's base colour (else the role's). */
  colour?: string;
  /** U2a (REQ-BFG-046, R1 C4): a part of the text drawn in brass, a rule's trigger label ("SHOT:", "EVERY 3s:") or the
   *  NEXT★ label; a keyword in it keeps its colour. */
  brass?: string;
  /** SPACE-1 (REQ-BFG-087, D1): it continues the item above it, so no gap opens between them (gapSlots): a turret's socket
   *  row's own description under that row, a factory's second stat row, a rig's next hit, a belt's timeline rows (under
   *  its TILES, HITS: line) and their note, the gun end's next readout row. Presentation only: no plan reads it. */
  tie?: boolean;
  /** EXPLAIN-1 (REQ-BFG-089, E1, E4): default rules text, drawn only in the ⓘ view's NOTES (explainPanel takes it off the
   *  face): "kind", a line true of every piece of its kind (a turret's HOLDS and SLOT lines, an empty slot's; CARD-3: an
   *  IDLE rig's fix, IDLE_FIX); "rig", a
   *  plain rig's rig sentence (faces.ts RIG_SENTENCE), first in NOTES. */
  note?: "rig" | "kind";
  /** CARD-2 (REQ-BFG-081, K4): a turret's labelled stat row (faceBlocks.ts turretRow): its pairs never split; one line where
   *  the row fits, else one pair a line (the desk column). */
  pairs?: boolean;
  /** ENCHANT-1 (REQ-BFG-085, E7): a stat row's numbers (0-based, in reading order) that an enchantment added or changed, drawn in the
   *  word's `colour` instead of white (FIERY's `{BURN}+1`, MASSIVE's RATE and DMG, WIDE's slots, GROWING's grown DMG). */
  hue?: { colour: string; nums: number[] };
}

/** Each role's base colour and whether it always takes the small (3x5) face: the flavour dimmer than the ability text,
 *  the hint dimmer again (T4). */
export const ROLE: Record<Role, { colour: string; small: boolean }> = {
  hits: { colour: C.bone, small: false },
  warn: { colour: C.amber, small: false },
  ability: { colour: C.bone, small: false },
  next: { colour: C.bone, small: false },
  merges: { colour: C.bone, small: false },
  merge: { colour: C.steel3, small: false },
  row: { colour: C.bone, small: false },
  grid: { colour: C.yellow, small: false },
  note: { colour: C.slate4, small: false },
  flavour: { colour: C.steel2, small: true },
  hint: { colour: C.slate3, small: true },
  reminder: { colour: C.slate4, small: true }, // U2a: a grey a step brighter than the hint's
  caveat: { colour: C.slate4, small: true }, // U2b F5: the reminder's colour
};
/** U2a: a small block that takes the rule (the divider) before it: the flavour and the hint, never a reminder (U2b: nor
 *  a caveat). */
const ruledRole = (role: Role): boolean => ROLE[role].small && role !== "reminder" && role !== "caveat";
/** A stat label's colour. */
const LABEL = C.slate4;

/** The ability text as blocks: the opening sentence keeps; the others give way first, from the last (a chain: a later
 *  sentence never shows without the ones before it). Y7b2 (the words; ruling R-1 for every piece): a faceless piece
 *  (SIFTER; the signature CLOCKWORKS and SUMP have no stars) no longer draws its star's perk name after the sentence it
 *  names, nor keeps that sentence for it (was "★2 POLISH" after its opening): the name shows in the ⓘ LEVELS view only
 *  (levels.ts levelLines), as every face's (faceBlocks.ts perkInfoOnly). */
function abilityBlocks(def: string, stars: number, o: TextOpts, w?: WordOn): Block[] {
  const face = faceBlocks(def, stars, o, w); // U2a (REQ-BFG-046): a piece with a new face draws it; ENCHANT-1 (REQ-BFG-085): `w`, its word
  if (face) return face;
  const at = abilityText(def, stars, o);
  const sentences = at.sentences.map((text, i): Block => ({ role: "ability", text, keep: i === 0, rank: 2, chain: "ability" }));
  return w ? wordOnSentences(sentences, def, stars, o, w) : sentences; // ENCHANT-1: a faceless piece's word
}

/** 0.6.2t (T6): a compact form of a panel for a short band (the phone), fullest first: its body; a header sub line in
 *  place of the panel's (a rig's hits or its IDLE warning, moved up; used only where it fits the header); and `tight`:
 *  the 3x5 body at a 6 px line pitch, 1 px higher (the 69 px phone band then holds 5 lines under a button row, not 4). */
export interface Variant {
  body: Block[];
  sub?: string;
  subColor?: string;
  tight?: boolean;
}

/** The next-star line without the name of the perk that star brings (a compact variant). */
const noNextPerk = (bs: readonly Block[]): Block[] => bs.map((b) => (b.role === "next" && b.perk ? { ...b, perk: undefined } : b));
/** ...and at its headline, the first clause of the next star's effect (the last resort, as 0.6.2p's headline). */
const headlineNext = (bs: readonly Block[]): Block[] => noNextPerk(bs).map((b) => (b.role === "next" && b.alt ? { ...b, text: b.alt } : b));

/** The usual compact forms of a body: tight lines; then without the next star's perk name; then its headline. */
const tightForms = (body: Block[]): Variant[] => [
  { body, tight: true }, { body: noNextPerk(body), tight: true }, { body: headlineNext(body), tight: true },
];

/** T5: the next-star line (and the perk that star brings); [] at the top star or when not fusible. The next-star block
 *  carries its headline (`alt`, T6) for the last compact variant. U2e step 1 (REQ-BFG-070; the operator: "The items
 *  don't need to say 1 more to merge."): no merge progress, no copy count (copiesToNextStar and mergeProgressText are
 *  gone). */
function progressBlocks(run: Run, def: string, stars: number): Block[] {
  // U2a (REQ-BFG-046, C7): a face's NEXT★ line, computed from the two stars' data; else the NEXT STAR sentence. U2e step
  // 5: one source with the ⓘ view's LEVELS (levels.ts nextBlocks); no panel body draws it (step 4)
  return nextBlocks(def, stars, textOpts(run));
}

/** The flavour (T7), whole or not at all (0b.5); no block when nothing is kept (0.6.2t2 F1: the hint follows the text). */
const flavourBlocks = (def: string, stars: number, k: number): Block[] => {
  const text = flavourText(def, stars, k);
  return text ? [{ role: "flavour", text, rank: 7 }] : [];
};
/** The action hint. */
const hintBlock = (text: string): Block => ({ role: "hint", text, rank: 6 });

// ------------------------------------------------------------------------------------------- EXPLAIN-1: the default face

/** EXPLAIN-1 (REQ-BFG-089, E4): a NOTES line's place: the rig sentence, the kind lines, the flavour and edge-case
 *  sentences, the how-to hint (stable within each). */
const noteOrder = (b: Block): number => (b.note === "rig" ? 0 : b.note === "kind" ? 1 : b.role === "hint" ? 3 : 2);

/** EXPLAIN-1 (E1, E5): a block the default face doesn't draw: default rules text (a "kind" or "rig" note, the flavour, a
 *  keyword reminder) and a how-to hint whose first-run tip is done (src/ui/tips.ts). */
export function hiddenBlock(b: Block): boolean {
  return !!b.note || b.role === "flavour" || b.role === "reminder" || (b.role === "hint" && !hintShows(b.text));
}

/**
 * EXPLAIN-1 (REQ-BFG-089; the operator: "any of the default rules text should be hidden without the hover" and "per item
 * abilities should always be visible"): a panel's DEFAULT FACE, as every drawn panel is (spec: offer, cargo, placed,
 * fitted, rig, stoker, turret and turret slot panels, the desk column and the phone's tap panel). From `t`:
 * - E1, E5: the body and every compact variant without the hidden blocks (hiddenBlock); a variant that shared the body's
 *   blocks shares the new body (planBody's fullBody reads that), so the plan is the base's minus the hidden blocks and they
 *   take no gap slot (SPACE-1's gapSlots never sees them);
 * - E2: a per-piece restriction (the "caveat" role: faces.ts INTERIM_CAVEATS, DART GUN's inner column) as a rule line, the
 *   ability text's role (its face and C.bone), in the same place, its words unchanged;
 * - E4: `notes`, the ⓘ view's NOTES: the rig sentence of a plain rig (`def` in faces.ts PLAIN_RIGS; E9), the kind lines,
 *   the flavour and edge-case sentences, then the hint (always, its tip done or not); a builder's own `notes` join them.
 *   Keyword reminders are KEYWORDS' definitions, not NOTES;
 * - `words`: the face's blocks before any was hidden, then the NOTES lines it never drew (keywords.ts panelWords reads them,
 *   so KEYWORDS still names every word a hidden line names).
 * Pure but for the tips' store (hintShows). Apply once per panel.
 */
export function explainPanel(t: PanelText, def?: string): PanelText {
  const ruled = new Map<Block, Block>();
  const rule = (b: Block): Block => {
    if (b.role !== "caveat") return b;
    let r = ruled.get(b);
    if (!r) ruled.set(b, (r = { ...b, role: "ability" }));
    return r;
  };
  const faces = new Map<readonly Block[], Block[]>();
  const face = (bs: readonly Block[]): Block[] => {
    let out = faces.get(bs);
    if (!out) faces.set(bs, (out = bs.filter((b) => !hiddenBlock(b)).map(rule)));
    return out;
  };
  // SHAPES-1 (REQ-BFG-089, S8): a shaped plain rig leads with the rig sentence too (isPlainRig), then a shaped piece's
  // shape or size rule (faces.ts shapeNotes): default rules text, behind the hover or tap
  // SCALE-2c (REQ-BFG-089; BRIEF-SCALE2c section 3): a scaling piece's count line (faces.ts scaleNotes, REPORT-SCALE1 3.2's
  // hover line) joins them, behind the hover or tap; [] for every other piece and with SCALE_RIGS off
  // BUMP-1F (PACKET-BUMP-0130 section 4): shapeNotes, gateNotes, scaleNotes, in that order
  const shaped: Block[] = def ? [...shapeNotes(def), ...gateNotes(def), ...scaleNotes(def), ...ruleNotes(def)].map((text) => ({ role: "ability", text, note: "rig" } as Block)) : []; // GATES-1: and a gate's rule, its wait and the FUSER's order; PRESENT-1: LIMPET WORKS's ANYTHING line (ruleNotes)
  // PLAIN-1F (REQ-BFG-089, M3): a plain rig's NOTES lead is faces.ts plainNotes: the rig sentence (as before for every
  // plain rig with PLAIN_RIGS off), SCALE GUARD's carry line after it, BALLAST's own line in its place
  // ENCHANT-1 (REQ-BFG-085, E7): an enchanted piece's NOTES (faces.ts enchantNotes: what an enchantment is, that a new one replaces it), "kind"
  // lines like a turret's: true of every enchanted piece, hidden from the face, in the ⓘ view and the desk hover. [] for a plain piece
  const enchanted: Block[] = enchantNotes(t.ench).map((text) => ({ role: "ability", text, note: "kind" } as Block));
  const extra: Block[] = [...(def ? plainNotes(def).map((text) => ({ role: "ability", text, note: "rig" } as Block)) : []), ...shaped, ...(t.notes ?? []), ...enchanted];
  const hidden = t.body.filter((b) => !!b.note || b.role === "flavour" || b.role === "hint");
  const notes = [...extra, ...hidden].map((b, i) => ({ b, i })).sort((p, q) => noteOrder(p.b) - noteOrder(q.b) || p.i - q.i).map((x) => x.b);
  return {
    ...t, body: face(t.body), ...(t.variants ? { variants: t.variants.map((v) => ({ ...v, body: face(v.body) })) } : {}),
    notes, words: [...t.body, ...extra],
  };
}

/** GATES-1 (REQ-BFG-057): a gate's place hints: on a mouse (tap a belt tile, or drag) and on a finger (a drag only; it snaps to a belt tile). */
export const GATE_TAP = "TAP A BELT TILE: THE BELT SPLITS AROUND IT";
export const GATE_DRAG = "DRAG IT ONTO A BELT: THE BELT SPLITS AROUND IT.";
/** GATES-1: a placed gate's move hint (its panel): it moves along belts, and TO CARGO puts the belt whole again. */
export const GATE_MOVE = "DRAG IT TO ANOTHER BELT TILE. TO CARGO JOINS THE BELT.";

/** 0.6.2 BELTSIDE: the hint for placing a part from the shop (`drag`: it can be dragged there too) or cargo.
 *  shoptap (D2): `touch`: a touch tap never places (it reads), so on a phone a part is dragged where it goes. */
function placeHint(kind: string, drag: boolean, def?: string, touch = false): string {
  if (kind === "turret") return turretHint(drag, touch); // 0.6.2s (S5): a turret goes into a TURRET SLOT
  // GATES-1 (REQ-BFG-057): a gate goes ON a belt tile, and the belt splits around it (tips.ts PLACE lists these)
  if (kind === "converter") return touch ? GATE_DRAG : drag ? `${GATE_TAP}, OR DRAG IT THERE.` : `${GATE_TAP}.`;
  if (touch) {
    return kind === "mod" || kind === "core" ? "DRAG IT ONTO A TURRET TO FIT IT."
      : kind === "gate" && def && ITEMS[def]?.gate?.stoke ? "DRAG IT BESIDE A FACTORY: ITS ARROWS WORK THE FACTORIES THEY POINT AT."
      : kind === "gate" ? "DRAG IT BESIDE A BELT: ITS ARROWS WORK THE BELT TILES THEY POINT AT."
      : "DRAG IT ONTO THE DECK TO PLACE IT.";
  }
  const how = kind === "mod" || kind === "core" ? "TAP A TURRET TO FIT IT"
    // 0.8.0 P1 (E3): a STOKER's arrows work factories, never belts
    : kind === "gate" && def && ITEMS[def]?.gate?.stoke ? "TAP A CELL BESIDE A FACTORY: ITS ARROWS WORK THE FACTORIES THEY POINT AT"
    : kind === "gate" ? "TAP A CELL BESIDE A BELT: ITS ARROWS WORK THE BELT TILES THEY POINT AT"
    : "TAP THE DECK TO PLACE IT";
  return drag ? `${how}, OR DRAG IT THERE.` : `${how}.`;
}

// ---------------------------------------------------------------------------------------------- one-line helpers

/** T5: an offer that merges on purchase: "MERGES WITH YOUR TEMPER INTO ★2: ADDS 4 BURN." (and the perk it brings);
 *  null when buying it merges nothing. */
export function mergeLine(run: Run, def: string): string | null {
  const b = mergeBlock(run, def);
  return b ? `${b.text}${b.perk ? ` ${b.perk}` : ""}` : null;
}

/** T5: the next-star line with the perk it brings: "NEXT ★2: +2 {BURN}" (U2e: no merge progress after it); null at the
 *  top star or for a non-fusible id. */
export function nextLine(run: Run, def: string, stars: number): string | null {
  const b = progressBlocks(run, def, stars);
  return b.length ? `${b[0].text}${b[0].perk ? ` ${b[0].perk}` : ""}` : null;
}

/** 0.6.2 BELTSIDE: the IDLE warning (the sub line says IDLE in amber; the turn hint follows). CARD-3 (REQ-BFG-080, B's
 *  lever 1; REQ-BFG-089): the face draws the rig's own state, IDLE_SHORT (was IDLE_SHORT plus "TURN IT OR MOVE IT BESIDE
 *  ONE.", 2 lines of the phone band's 5x7 face). The fix says how every rig works (its arrows work the belt tiles they
 *  reach), so it is a NOTES line (IDLE_FIX: the ⓘ view and the desk hover), as EXPLAIN-1 made the other kind lines. */
export const IDLE_SHORT = "IDLE: NO ARROW REACHES A BELT.";
/** CARD-3 (B, lever 1): the IDLE warning's fix, a NOTES line (rigPanel). */
export const IDLE_FIX = "TURN IT OR MOVE IT BESIDE A BELT.";
/** 0.6.2t: the IDLE warning where it moves up into a narrow header (the desk column's). */
export const IDLE_HEAD = "IDLE: NO ARROW ON A BELT.";
/** 0.8.0 P1 (E3): a STOKER's IDLE warning (it works factories, never belts), in the same forms. CARD-3 (B, lever 1): its
 *  fix a NOTES line too. */
export const STOKER_IDLE = { short: "IDLE: NO ARROW REACHES A FACTORY.", head: "IDLE: NO ARROW ON A FACTORY.", fix: "TURN IT OR MOVE IT BESIDE A FACTORY." };
/** PLAIN-1F (M4; REQ-BFG-080): a long rig's IDLE warning in its arrows line's words (the header's RIG · x/n ARROWS ON BELTS
 *  when it works), so the placed panel says its n either way and its UP TO n HITS line can leave it (rigPanel). */
export const longIdle = (arrows: number): string => `IDLE: 0/${arrows} ARROWS ON BELTS.`;

/** 0.6.2t (0b.4): which belt a walk is on: locked (METRONOME, speed-locked), slag (a SLAG POT's fixed speed) or free. */
export function beltKind(w: RouteWalk): BeltKind {
  return w.locked ? "locked" : w.fixed !== undefined ? "slag" : "free";
}

/** 0.6.2 BELTSIDE (V4): one hit in a belt's timeline (0.6.2t: the glossary's hitText, with 0b.4's slag and locked
 *  readings: a SLAG belt never reads LOCKED or pays a locked bonus). Exported for tests. */
export function hitLabel(h: TimelineHit, belt: BeltKind, day?: number): string {
  return hitText(h, belt, day); // HULL-1d (REQ-BFG-079): `day`, the run's (its numbers x D(d) / S(d))
}

/** "4 AND 6", "4, 5 AND 6". */
function andList(xs: (string | number)[]): string {
  return xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} AND ${xs[xs.length - 1]}`;
}

/** A rig's hits, one line each ("→ BELT 1, TILE 3"), or all on one line grouped by belt ("→ BELT 1 TILE 4, BELT 2 TILES
 *  4 AND 6"): the phone band's compact form; `short` labels the tiles as the belt readout's rows do ("→ BELT 1 T4, BELT 2
 *  T4 AND T6", the header's last resort). */
function hitLines(hits: readonly RigHit[]): { full: string[]; compact: string; short: string } {
  const by = new Map<number, number[]>();
  for (const h of hits) by.set(h.route, [...(by.get(h.route) ?? []), h.tile + 1]);
  return {
    full: hits.map((h) => `→ BELT ${h.route + 1}, TILE ${h.tile + 1}`),
    compact: `→ ${[...by].map(([r, ts]) => `BELT ${r + 1} ${ts.length === 1 ? `TILE ${ts[0]}` : `TILES ${andList(ts)}`}`).join(", ")}`,
    short: `→ ${[...by].map(([r, ts]) => `BELT ${r + 1} ${andList(ts.map((t) => `T${t}`))}`).join(", ")}`,
  };
}

// ---------------------------------------------------------------------------------------------------- the panels

/** A panel's text: its header, body blocks, compact variants (fullest first) and its buttons' labels. Pure; spec()
 *  adds the icon and the buttons' actions. Exported for the tests (planPanel on the phone band). */
export interface PanelText {
  title: string;
  color: string;
  /** ENCHANT-1 (REQ-BFG-085, E7): the word an enchanted piece holds (an enchant.ts ENCHANT_IDS id; only while the switch is on): `title`
   *  then starts with it (`FIERY WHETSTONE`), drawn in the word's colour with the name in `color` (titleSpans, fitTitle); explainPanel adds
   *  the NOTES (faces.ts enchantNotes). Absent for every plain piece. */
  ench?: EnchantId;
  sub: string;
  /** ENCHANT-2W (REQ-BFG-085; W5): a FOE's part panel (battleScout.ts faceText's `owner`): the possessive that starts `sub` and `subShort` (`SPARKFANG'S`). Where the desk column is too
   *  narrow for the whole sub, planPanel puts the owner on a line of its own and the rest of the sub under it, so the sub is never cut; absent for every other panel. */
  subOwner?: string;
  subColor?: string; // 0.6.2 BELTSIDE: an IDLE rig's sub line warns
  subShort?: string; // 0.6.2 BELTSIDE: the sub line where `sub` doesn't fit beside the portrait strip's buttons
  /** A header-only strip's text (the 360x640 portrait): the fullest that fits, on up to two lines (0.6.2 BELTSIDE's
   *  subTight for a belt's readout; 0.6.2t: an offer's one-line effect, the tap preview there). */
  headerOnly?: { texts: string[]; colour: string };
  body: Block[];
  /** Compact forms for a short band, fullest first (planBody takes the first whose kept blocks fit). */
  variants?: Variant[];
  labels: string[];
  /** EXPLAIN-1 (REQ-BFG-089, E4): the ⓘ view's NOTES, in order (explainPanel): the rig sentence, the kind lines, the flavour
   *  and edge-case sentences, the how-to hint. A builder may give lines no face draws (an installed turret's kind lines). */
  notes?: Block[];
  /** EXPLAIN-1 (E4): the blocks the ⓘ KEYWORDS reads (keywords.ts panelWords): the face's blocks before any was hidden,
   *  then the NOTES lines no face drew, so no word's definition goes with the line that named it. Absent: `body`. */
  words?: Block[];
}

/** A rig's panel extras (tests): IDLE, an X rig (no ROTATE). */
export interface RigPanel extends PanelText {
  idle: boolean;
  x: boolean;
}

/**
 * 0.6.2 BELTSIDE (V4): a placed rig's panel: its hits, or IDLE when none of its arrows lands on a belt. beltside-062c
 * (DESIGN §12 P11): the lines that matter most come first. 0.6.2t: the hits (or IDLE), the ability text (its opening
 * sentence and its perk's sentence kept), the next-star line and merge progress, then the turn hint and the flavour. On
 * the phone band the compact variants put the hits on one line (or IDLE's short warning), then drop the next star's
 * perk name. Exported for tests; null unless `uid` is a placed rig.
 */
export function rigPanel(run: Run, uid: number, touch = false): RigPanel | null {
  const p = itemByUid(run.build, uid);
  if (!p) return null;
  const d = defOf(p);
  if (d.kind !== "gate") return null;
  const stars = starsOf(p);
  const w = wordOn(p, d, stars); // ENCHANT-1 (REQ-BFG-085, E7): the word the rig holds (none with the switch off)
  const hits = hitsOfRig(run.build, p.uid);
  const arrows = shapedPiece(d.id) ? arrowCellsOf(p).length : arrowsOf(p).length, x = rigShape(d) === "X"; // SHAPES-1: per cell
  // 0.8.0 P1 (E3): a STOKER works factories, not belts: its factory hits take off the IDLE mark and lead its panel
  const stokes = d.gate?.stoke ? stokeHits(run.build).filter((h) => h.uid === p.uid) : [];
  if (stokes.length) return stokerPanel(run, p.uid, stokes.map((h) => h.factory), arrows, touch);
  const idle = hits.length === 0;
  // SHAPES-1 (REQ-BFG-086 R2): a long rig's arrows are its (cell, direction) pairs (deck.ts arrowCellsOf), each one hit
  const shaped = shapedPiece(d.id);
  const on = shaped ? new Set(hits.map((h) => `${h.from ?? -1}:${h.dir}`)).size : new Set(hits.map((h) => h.dir)).size;
  const hl = hitLines(hits);
  // 0.8.0 P1 (E3): a STOKER beside no factory warns about factories (its arrows never work belts, so it has no belt hits)
  // PLAIN-1F (M4): a long rig's IDLE warning says its arrows, 0/n (longIdle), as its working header says x/n
  const warn = d.gate?.stoke ? STOKER_IDLE : shaped ? { short: longIdle(arrows), head: longIdle(arrows), fix: IDLE_FIX }
    : { short: IDLE_SHORT, head: IDLE_HEAD, fix: IDLE_FIX };
  // SPACE-1 (D1): a rig's hits are one list (the next hit ties to the one above it). CARD-3 (B, lever 1): IDLE's fix is a
  // NOTES line (a "kind" note: explainPanel hides it from every face)
  // PLAIN-1F (M4; REQ-BFG-080, REQ-BFG-089; BRIEF-PLAIN1F M4, RUN5-SHAPES1 1.2): a long rig's placed panel fits the phone
  // band again by its content alone (no layout change). Its hits are one line, the grouped form (hl.compact: each hit gives
  // the same stats, so its tiles are listed once, belt by belt), and its UP TO n HITS line leaves this panel: its arrows
  // line already says n (the header's RIG · x/n ARROWS ON BELTS, or IDLE: 0/n ARROWS ON BELTS.). The stat row stays (the
  // piece's own numbers); the shop card and every other panel keep UP TO n HITS (faces.ts shapeLines). A one-cell rig's
  // panel is as before.
  const long = shaped && hits.length > 1;
  const lead: Block[] = idle ? [{ role: "warn", text: warn.short, keep: true }, { role: "warn", text: warn.fix, note: "kind" }]
    : long ? [{ role: "hits", text: hl.compact, keep: true }]
    : hl.full.map((t, i): Block => ({ role: "hits", text: t, keep: true, ...(i ? { tie: true } : {}) }));
  const leadTight: Block[] = idle ? [{ role: "warn", text: warn.short, keep: true }]
    : hits.length > 1 ? [{ role: "hits", text: hl.compact, keep: true }] : lead;
  const upTo = shaped ? shapeLines(d.id, stars).map((r) => r.text) : []; // PLAIN-1F (M4): said by the arrows line
  const rest = [
    ...abilityBlocks(d.id, stars, textOpts(run), w).filter((b) => !upTo.includes(b.text)), // ENCHANT-1: w, its word's stat and line
    ...flavourBlocks(d.id, stars, 1),
    hintBlock(x ? "FACES EVERY SIDE. DRAG TO MOVE." : touch ? TOUCH_TURN : "TAP TO TURN (OR R). DRAG TO MOVE."),
  ];
  // T6 (phone): the hits (or the IDLE warning) move up into the header's sub line, where they fit there (planBody skips
  // a head that doesn't): the compact list, then its short form with tile labels ("→ BELT 1 T4, BELT 2 T4 AND T6")
  const heads: Pick<Variant, "sub" | "subColor">[] = idle ? [warn.short, warn.head].map((sub) => ({ sub, subColor: C.amber }))
    : [...new Set([`RIG ${hl.compact}`, `RIG ${hl.short}`])].map((sub) => ({ sub }));
  const forms = (body: Block[], tight: boolean): Variant[] => [...heads.map((h) => ({ body, ...h, tight })), { body: [...leadTight, ...body], tight }];
  return {
    ...enchTitle(w, titled(d.name, stars)), color: RARITY_COLOR[d.rarity], // ENCHANT-1: the word first in the title
    sub: idle ? "RIG · IDLE" : `RIG · ${on}/${arrows} ARROWS ON BELTS`,
    subShort: idle ? undefined : `RIG · ${on}/${arrows} HIT`,
    subColor: idle ? C.amber : undefined,
    body: [...lead, ...rest],
    variants: [
      { body: [...leadTight, ...rest] },
      ...heads.map((h) => ({ body: rest, ...h })),
      ...forms(rest, true),
      ...forms(noNextPerk(rest), true),
      ...forms(headlineNext(rest), true),
    ],
    labels: [...(x ? [] : ["ROTATE"]), "TO CARGO", ...(touch ? [sellLabel(d.id, stars)] : [])], // shoptap (D2): SELL
    idle, x,
  };
}

/** shoptap (D2): a placed rig's turn hint on touch (a first tap selects it; a tap on it while selected turns it). */
export const TOUCH_TURN = "TAP IT AGAIN TO TURN IT. DRAG TO MOVE.";
/** shoptap (D2, REQ-BFG-035): what a placed part's SELL says: its cargo sell price (sellValue at its stars). */
export const sellLabel = (def: string, stars: number): string => `SELL +${sellPrice(def, stars)}G`;
/** shoptap (D2): the signature factory's panel on touch says why it offers no SELL (actions.ts store's own words).
 *  U2c step 5 (REQ-BFG-046; T1 2.2's notice form, LABEL: TEXT.): was "THE SIGNATURE FACTORY STAYS ABOARD. IT CAN'T BE
 *  SOLD.", the same meaning. */
export const SIGNATURE_ABOARD = "STAYS ABOARD: THE SIGNATURE FACTORY CAN'T BE SOLD.";

/**
 * 0.8.0 P1 (E3, DESIGN-beltside section 8's production rigs): a placed STOKER that points at factories: the factories it
 * works lead (it is never IDLE beside one), then the rig panel's ability text, progress, flavour and hint.
 */
function stokerPanel(run: Run, uid: number, factories: number[], arrows: number, touch = false): RigPanel {
  const p = itemByUid(run.build, uid)!;
  const d = defOf(p), stars = starsOf(p);
  const names = factories.map((f) => `THE ${ITEMS[itemByUid(run.build, f)!.def].name}`);
  const lead: Block[] = names.map((n, i): Block => ({ role: "hits", text: `→ STOKES ${n}`, keep: true, ...(i ? { tie: true } : {}) })); // SPACE-1: one list
  const compact = `→ STOKES ${andList(names)}`;
  const w = wordOn(p, d, stars); // ENCHANT-1 (REQ-BFG-085, E7): the word the STOKER holds, its stat and line around the ability text
  const ability = stokerAbility(run, d.id, stars, factories);
  const rest = [
    ...(w ? wordOnSentences(ability, d.id, stars, textOpts(run), w) : ability),
    ...flavourBlocks(d.id, stars, 1),
    hintBlock(touch ? TOUCH_TURN : "TAP TO TURN (OR R). DRAG TO MOVE."), // shoptap (D2)
  ];
  const tight: Block[] = [{ role: "hits", text: compact, keep: true }];
  return {
    ...enchTitle(w, titled(d.name, stars)), color: RARITY_COLOR[d.rarity], // ENCHANT-1: the word first in the title
    sub: `RIG · ${factories.length}/${arrows} ARROWS ON FACTORIES`, subShort: `RIG · ${factories.length}/${arrows} ON`,
    body: [...lead, ...rest],
    variants: [
      { body: [...tight, ...rest] },
      { body: rest, sub: `RIG ${compact}` },
      { body: [...tight, ...rest], tight: true },
      { body: [...tight, ...noNextPerk(rest)], tight: true },
      { body: [...tight, ...headlineNext(rest)], tight: true },
    ],
    labels: ["ROTATE", "TO CARGO", ...(touch ? [sellLabel(d.id, stars)] : [])], // shoptap (D2): SELL on touch
    idle: false, x: false,
  };
}

/**
 * 0.8.0 B1 M4 (REQ-BFG-032; VERIFIED-I1's call 5, I1 REPORT open item 5): a placed STOKER's ability text. Where every
 * factory it works has room at its gun, the glossary's as before. Where one's gun can't take its full stoke (by the
 * static estimate deckRating uses: rateDeck's cap, as Battle.stokedPace plays it; stokeCapBlocks), its capped line takes
 * the place of the opening sentence ("EACH FACTORY ITS ARROWS POINT AT WORKS 44% FASTER.", a promise that gun can't
 * keep): the same kept opening block (T6), its text the capped line's, in the warning's amber, on the phone band and in
 * the desk column alike. The panel holds the same blocks as before with one sentence in the other's place, so no panel
 * grows, and no band promises a speed-up the gun can't take. A second capped factory's line (I1's, optional), and the
 * speed of a factory it works at the full stoke ("THE STAMP PRESS WORKS 44% FASTER.", optional), follow it (rank 1, as
 * I1's capped line was). Exported for the tests.
 */
export function stokerAbility(run: Run, def: string, stars: number, factories: readonly number[]): Block[] {
  const ability = abilityBlocks(def, stars, textOpts(run));
  const capped = stokeCapBlocks(run, factories);
  if (!capped.length) return ability;
  const keep = stokeKeep(run.build);
  const full = [...new Set(factories)].filter((f) => (keep.get(f) ?? 1) >= 1 - 1e-9)
    .map((f): Block => ({ role: "ability", text: `THE ${ITEMS[itemByUid(run.build, f)!.def].name} WORKS ${percent(factoryStoke(run.build, f))} FASTER.`, rank: 1 }));
  const [first, ...more] = capped;
  return [{ ...ability[0], text: first.text, colour: ROLE.warn.colour }, ...more, ...full, ...ability.slice(1)];
}

/** 0.8.0 B1 M4: the stoke on factory `f` from every STOKER whose arrows work it (deck.ts stokeHits), at their stars. */
function factoryStoke(b: Build, f: number): number {
  let stoke = 0;
  for (const h of stokeHits(b)) if (h.factory === f) {
    const g = itemByUid(b, h.uid);
    if (g) stoke += effectAt(g.def, starsOf(g)).gate?.stoke ?? 0;
  }
  return stoke;
}

/** 0.8.0 I1 M4 (VERIFIED-P1 H4): one amber line for each factory in `factories` whose gun can't take its full stoke
 *  (deckRating.ts stokeKeep): "THE KILN'S GUN IS FULL, SO IT WORKS ONLY 8% FASTER." (or "... SO IT WORKS NO FASTER."),
 *  its stoke from every STOKER on it times the share the cap lets through; none where every gun has room. I1 made it
 *  optional (rank 1); 0.8.0 B1 M4: the first takes the place of the STOKER's opening sentence, kept (stokerAbility), and
 *  the others stay optional. 0.8.0 B1 M4 (G1's F2): the cap holds back only the stamping; a factory's plating timer (ARMOR
 *  PRESS) runs with the full stoke (Battle.produce: its pace x (1 + stoke), oracle a0e94bc69949561f), so its line says so:
 *  "THE ARMOR PRESS'S GUN IS FULL, SO ONLY ITS PLATING WORKS 44% FASTER." (or "... SO IT STAMPS ONLY 40% FASTER, BUT
 *  PLATES 44% FASTER."). Exported for the tests. */
export function stokeCapBlocks(run: Run, factories: readonly number[]): Block[] {
  const keep = stokeKeep(run.build);
  if (!keep.size) return [];
  return [...new Set(factories)].flatMap((f): Block[] => {
    const k = keep.get(f);
    if (k === undefined || k > 1 - 1e-9) return [];
    const p = itemByUid(run.build, f)!, stoke = factoryStoke(run.build, f);
    // NUM-4 (REQ-BFG-047; REVIEW-NUM2 answer 2): the line tells the battle's truth in the faces' unit. A factory's cadence
    // is a whole SPEED (slugs in 30 s), so the cap matters only when it holds back at least one SPEED point of the stoke:
    // speed x stoke x (1 - keep) >= 1. Below that the factory's shown SPEED would not change, and the STOKER's own line
    // stands (ARMOR PRESS ★2 under STOKER ★2: 21 x 44% x (1 - 43/44) = 0.21 of a point, the "1-point gap" NUM-2 flagged)
    const speed = effectAt(p.def, starsOf(p)).factory?.speed ?? 0;
    if (speed * stoke * (1 - k) < 1) return [];
    // NUM-4: `eff` is the rating's estimate of the share the gun lets through (stokeKeep), a reading, so it prints through
    // fmtReadPct (whole, rounded as before); the stoke itself is a rule's whole % (percent)
    const eff = stoke * k, name = `THE ${ITEMS[p.def].name}'S`, none = Math.round(eff * 100) < 1, effPct = fmtReadPct(eff);
    // U2c step 5 (REQ-BFG-046; T1 2.2's notice form, LABEL: TEXT.): "THE KILN'S GUN IS FULL: IT WORKS ONLY 8% FASTER." (was
    // "..., SO IT WORKS ONLY 8% FASTER."), the same meaning and numbers
    const text = effectAt(p.def, starsOf(p)).factory?.plate
      // CARD-3 (REQ-BFG-107): its SHIELD timer (factory.plate.every, stokedPace) in SHIELD's words (was "ONLY ITS PLATING WORKS
      // n FASTER" and "BUT PLATES n FASTER")
      ? none ? `${name} GUN IS FULL: ONLY ITS SHIELD COMES ${percent(stoke)} FASTER.`
      : `${name} GUN IS FULL: IT STAMPS ONLY ${effPct} FASTER, BUT ITS SHIELD COMES ${percent(stoke)} FASTER.`
      : none ? `${name} GUN IS FULL: IT WORKS NO FASTER.` : `${name} GUN IS FULL: IT WORKS ONLY ${effPct} FASTER.`;
    return [{ role: "warn", text, rank: 1 }];
  });
}

/** T5: the MERGES WITH block of an offer that merges on purchase (the perk that star brings after it). */
function mergeBlock(run: Run, def: string): Block | null {
  const preview = mergePreview(run, def);
  if (!preview) return null;
  const to = preview.toStars, perk = newPerk(def, to);
  const face = faceMergeBlock(def, to, textOpts(run), perk); // U2a (C7): "MERGES INTO ★2: +4 [BURN]."
  if (face) return face;
  return { role: "merges", text: mergesWithText(def, to, textOpts(run)), keep: true, ...(perk ? { perk: `★${to} ${perk}` } : {}) };
}

/** SHOPCARD-1 (REQ-BFG-115, F5): what the shop card said in words about owning a copy, now that its merge mark and owned marker
 *  (shop.ts drawMergeMark, drawOwnedMarker) are wordless: a sentence for the panel's NOTES and the desk's hover tooltip. An offer
 *  that merges on purchase says into which star (mergeLine: "MERGES INTO ★2: +2 BURN.", faces.ts faceMerge); an offer of a piece
 *  the run holds (not a starting copy) that a new copy won't merge with, the owned marker's cases (run.ts shopBadge "wait" and
 *  "max": mergePreview is null, so gainModule makes no merge), says so. null: no copy held, or the offer is sold. */
export const OWNED_NOTE = "YOU OWN ONE ALREADY: A NEW COPY WON'T MERGE WITH IT.";
export function offerMergeNote(run: Run, def: string): string | null {
  const b = shopBadge(run, def);
  return b?.kind === "merge" ? mergeLine(run, def) : b ? OWNED_NOTE : null;
}

/** PRESENT-1 (REQ-BFG-081, REQ-BFG-115; the cold read's PR-06, 4 of 6: two readers took the card's merge mark for its star and left its sale
 *  mark at "can't tell"; the one fix round, words only): a shop offer on sale says so in words in its panel and its hover tooltip, with the
 *  list price it fell from: `ON SALE: WAS 3G.` (the price now is the card's and the button's). The buy button can say it only when
 *  nothing else claims it (offerLabel: `SALE: BUY 2G`; a merge wins the label, and no label says both within 60 px), and the desk's tooltip
 *  has no button, so a sale that merges, and every sale on a desk, was said by the marks alone. The sale is the game's own test (run.ts
 *  priceOf, chrome.ts drawShop's `sale`, offerLabel): an unsold offer under its list price. null: not on sale, or sold. Pure (offerPanel, the tooltip, tests). */
export function offerSaleNote(o: { def: string; price: number; sold?: boolean }): string | null {
  const list = ITEMS[o.def].price;
  return !o.sold && o.price < list ? `ON SALE: WAS ${list}G.` : null;
}

/**
 * SHOPCARD-1e (REQ-BFG-081, REQ-BFG-115; READ-12 round S, E3 and E4): a shop offer's buy button, in words.
 * - E3, a sale: the panel read `BUY 6G` (GANTRY PRESS, list 7) or `BUY 2G` (WHETSTONE, list 3), and all six round S readers read a
 *   plain buy (N 6 of 6). A cut price now says so: `SALE: BUY 6G`. The game's rule: run.ts:454 priceOf = max(1, list - run.shop.discount)
 *   (a scout's deal), and chrome.ts:148 draws the card's sale mark when `o.price < ITEMS[o.def].price`: the same test here.
 * - E4, a merge: the ★2 and ★3 panels of a piece were the same picture (`BUY+MERGE 7G` either way), so a reader learnt the star only
 *   from the notes, and Haiku led with ★2 on both ★3 offers. The label names the star the buy makes (run.ts shopBadge toStars, the
 *   card's MERGE ★n mark): `MERGE ★3: 7G`. 3x5 face, button = text + 4 px, and the least button is 64 px (the 360x640 strip's
 *   one button; inspector.ts topRowButtons, portraitButtons' even width), so a label holds at most 60 px at every price: the game's
 *   dearest offer is 13G (THUNDERER), and `BUY+MERGE ★3 13G` (61 px) is 1 px too wide, `MERGE TO ★3: 13G` is 58 (but 54 at 1
 *   digit, 8 px wider than the old `BUY+MERGE 7G`: its button no longer fits the phone band's top row beside nine pieces' long
 *   titles, so it moved 18 merge-offer panels' buttons to the second row; REPORT section 2). `MERGE ★3: 7G` is 43 px (47 at 2
 *   digits), narrower than the old label (46 and 50): no button moves down (four panels' move up).
 * - A merge that is also on sale: the MERGE label wins, and the cut price is still the price shown. Same precedence as the card
 *   (shop.ts:338-342: the merge mark, else the owned marker, else the sale mark), and no label says both within 60 px at a
 *   one-digit price and a two-digit one alike (`SALE: MERGE ★3 6G` is 62 px, `SALE MERGE ★3 6G` 60 and 64 at 10G).
 * - A supply (BUY+USE) on sale: `SALE: BUY+USE 6G` (59 px). Supplies never merge (they are not fusible).
 * `toStars`: the star the buy makes when it merges, else null. Pure (offerPanel, the tests).
 */
export function offerLabel(d: Pick<ItemDef, "kind" | "price">, price: number, toStars: number | null): string {
  const sale = price < d.price ? "SALE: " : "";
  if (d.kind === "supply") return `${sale}BUY+USE ${price}G`;
  return toStars !== null ? `MERGE ★${toStars}: ${price}G` : `${sale}BUY ${price}G`;
}

/** A shop offer's panel, the phone's tap preview (T5): the module's 1-star ability text, the MERGES WITH line when it
 *  merges on purchase, the hint and the flavour; on the header-only 360x640 strip, its one-line effect. shoptap (D2):
 *  `touch`, the drag hint (a touch tap never places). */
export function offerPanel(run: Run, wagon: number, slot: number, touch = false): PanelText | null {
  const o = run.shop.wagons[wagon]?.offers[slot];
  if (!o) return null;
  const d = ITEMS[o.def];
  const badge = o.sold ? null : shopBadge(run, o.def); // SHOPCARD-1e: the label names the merge's star (was `merging`)
  const opts = textOpts(run);
  const one = cardEffect(d.id, opts); // BUMP-1D P6: was cardText(d.id, opts); cardEffect is cardText byte for byte wherever cardText has a line, and a plain rig's stat row where it has none (the twelve of PLAIN_RIGS and SHAPES2, on since bb-0.11.0: the 360x640 strip drew no effect for them)
  // U2e step 4 (REQ-BFG-070): no MERGES INTO line on the face: the card's MERGE ★2 badge and BUY+MERGE say it merges, and
  // the ⓘ view's NEXT★ line what the merge gives (mergeBlock and mergeLine stay for tools; no panel draws them)
  const sale = offerSaleNote(o); // PRESENT-1 (PR-06): a sale, in words (lime, the sale mark's colour), the first line of the body
  const body: Block[] = [
    ...(sale ? [{ role: "note", text: sale, colour: C.lime, keep: true } as Block] : []),
    ...abilityBlocks(d.id, 1, opts),
    ...flavourBlocks(d.id, 1, opts.k ?? 1),
    hintBlock(d.kind === "supply" ? "USED THE MOMENT YOU BUY IT." : placeHint(d.kind, true, d.id, touch)),
  ];
  const own = o.sold ? null : offerMergeNote(run, o.def); // SHOPCARD-1 (F5): the card's merge mark and owned marker, in words, in NOTES
  return {
    ...(own ? { notes: [{ role: "note", text: own } as Block] } : {}),
    // WORDS-1 (REQ-BFG-081; READ-1 6.2: merchant names drew 40 "not understood" flags): no merchant's name on the panel (the
    // desk's wagon tags keep them), and a core's or gear's kind in plain words (shop.ts panelKind). Was `${describe(d)} ·
    // ${merchant}`, subShort describe(d)
    title: d.name, color: RARITY_COLOR[d.rarity], sub: panelKind(d),
    subShort: KIND_SUB[d.kind] ?? describe(d), // T6: the rarity gives way first (the title shows it in colour)
    headerOnly: one ? { texts: [one], colour: C.bone } : undefined,
    body,
    variants: tightForms(body),
    labels: [o.sold ? "SOLD" : offerLabel(d, o.price, badge?.kind === "merge" ? badge.toStars : null)], // SHOPCARD-1e (E3, E4)
  };
}

/** A module in cargo: its ability text at its stars (a core's numbers at the hero's k), next star, merge progress.
 *  shoptap (D2): `touch`, the drag hint (a touch tap never places). */
export function cargoPanel(run: Run, uid: number, touch = false): PanelText | null {
  const it = run.inventory.find((i) => i.uid === uid);
  if (!it) return null;
  const d = ITEMS[it.def], stars = starsOf(it), opts = textOpts(run);
  const w = wordOn(it, d, stars); // ENCHANT-1 (REQ-BFG-085, E7): the word the cargo piece holds (it keeps it in cargo)
  // 0.6.2s (S6): a turret sells for turretSellValue, and a hull's free starting copy can't be sold at 1 star
  const turret = d.kind === "turret", sellable = !turret || canSellTurret(it);
  const body: Block[] = [
    ...abilityBlocks(d.id, stars, opts, w),
    ...(turret && it.free ? [{ role: "ability", text: freeNote(sellable), rank: 3 } as Block] : []),
    ...flavourBlocks(d.id, stars, opts.k ?? 1),
    hintBlock(placeHint(d.kind, false, d.id, touch)),
  ];
  return {
    // WORDS-1 (REQ-BFG-081): a core's or gear's kind in plain words (shop.ts KIND_SUB; was TURRET CORE, TURRET GEAR)
    // (a core's or gear's own words alone: "... · IN CARGO" is 132-138 px of 3x5, past the 113 px a 320x568 phone's sub
    // line holds, where fitHead would cut it; its SELL button says it is cargo)
    ...enchTitle(w, titled(d.name, stars)), color: RARITY_COLOR[d.rarity], sub: KIND_SUB[d.kind] ?? `${describe(d)} · IN CARGO`, // ENCHANT-1: the word first in the title
    subShort: `${KIND_SUB[d.kind] ?? KIND_WORD[d.kind] ?? "PART"}${KIND_SUB[d.kind] ? "" : " · IN CARGO"}`, // T6: the rarity gives way first (the title shows it in colour)
    body,
    variants: tightForms(body),
    labels: sellable ? [`SELL +${turret ? turretSellValue(it) : sellPrice(d.id, stars)}G`] : [],
  };
}

/** The kind as the panels name it (shop.ts describe, without the rarity). */
const KIND_WORD: Record<string, string> = {
  gate: "RIG", factory: "FACTORY", mod: "TURRET GEAR", core: "TURRET CORE", supply: "SUPPLY", turret: "TURRET", converter: "GATE", // GATES-1
};

/** A placed deck item: a rig (rigPanel), or a factory with its outputs at its stars (GANTRY PRESS ★2 THIRD ARM feeds 3)
 *  and its text; a hero's signature factory has no stars, no next star and no TO CARGO. shoptap (D2, REQ-BFG-035):
 *  `touch`: SELL after TO CARGO (a placed part sells at its cargo price), and the signature factory's panel says it stays
 *  aboard (it offers no SELL). */
export function itemPanel(run: Run, uid: number, touch = false): PanelText | null {
  const p = itemByUid(run.build, uid);
  if (!p) return null;
  const d = defOf(p);
  if (d.kind === "gate") return rigPanel(run, uid, touch);
  if (d.kind === "converter") return gatePanel(run, uid, touch); // GATES-1 (REQ-BFG-052): a gate has its own panel
  const stars = starsOf(p);
  const sig = !fusible(d.id);
  // bb-0.8.3 (REQ-BFG-043, REQ-BFG-044 D10, D11): the hero's own factory reads at its FACTORY level (stars.ts gradeOf: its
  // ability text, its belts) and shows that level, its next level in one line and the UPGRADE button with its price
  const grade = gradeOf(run.build, p), level = sig ? upgradeLevel(run.build, "factory") : 0;
  const w = wordOn(p, d, grade); // ENCHANT-1 (REQ-BFG-085, E7): the word the factory holds; its numbers multiply by its stars (a signature factory's grade)
  const body: Block[] = [
    ...joinPaceBlocks(run.build, p.uid), // 0.6.2rel3 (TUNE-M, RULE JOIN PACE): a joined factory leads with its pace
    ...(hasAbilityText(d.id) || hasFace(d.id) ? abilityBlocks(d.id, grade, textOpts(run), w) : w ? wordOnSentences([], d.id, grade, textOpts(run), w) : []), // U2a: KILN and LOOM's faces too; 0.8.5: at the factory's grade
    ...(sig ? upgradeBlocks("factory", level, factoryNext(d.id, level)) : []), // U2e step 4: NEXT★ is the ⓘ view's
    ...(sig && touch ? [{ role: "note", text: SIGNATURE_ABOARD, keep: true } as Block] : []),
    ...flavourBlocks(d.id, stars, 1),
    hintBlock("DRAG OUT OF IT TO LAY BELT."),
  ];
  const up = sig ? upgradeLabel(level) : null;
  return {
    ...enchTitle(w, titled(d.name, stars)), color: RARITY_COLOR[d.rarity], // ENCHANT-1: the word first in the title
    sub: `FACTORY · BELTS ${routesOf(run.build, p.uid).length}/${(outputsAt(d.id, grade) || 1) + wideSlots(p)}`, // ENCHANT-1 (REQ-BFG-085): + WIDE's slot
    body,
    variants: tightForms(body),
    // SHAPES-1 (REQ-BFG-086 S2): a shaped factory that turns (2x3, I3) has ROTATE first, as a rig's panel does
    labels: sig ? (up ? [up] : []) : [...(shapedPiece(d.id) && canTurn(d.id) ? ["ROTATE"] : []), "TO CARGO", ...(touch ? [sellLabel(d.id, stars)] : [])],
  };
}

/**
 * GATES-1 (REQ-BFG-052, REQ-BFG-089, REQ-BFG-087; PIECES-1 6.3): a placed gate's panel, beside rigPanel. Its kind line says GATE and
 * which belt it splits (`GATE · BELT 1`), its own line is always visible (the face: slugs in and out, what it adds), and the
 * stat row, the star line and the rest follow as for any part; the gate rule, the wait and the FUSER's order are NOTES (behind the
 * hover or tap). TO CARGO (and SELL on touch) take it off: the belt is whole again with no merge code. No ROTATE: a gate has no
 * arrows. Exported for tests; null unless `uid` is a placed gate.
 */
export function gatePanel(run: Run, uid: number, touch = false): PanelText | null {
  const p = itemByUid(run.build, uid);
  if (!p) return null;
  const d = defOf(p);
  if (d.kind !== "converter") return null;
  const stars = starsOf(p);
  const at = beltTile(run.build, key(p.x, p.y));
  const body: Block[] = [
    ...abilityBlocks(d.id, stars, textOpts(run)),
    ...flavourBlocks(d.id, stars, 1),
    hintBlock(GATE_MOVE),
  ];
  return {
    title: titled(d.name, stars), color: RARITY_COLOR[d.rarity],
    sub: at ? `GATE · BELT ${at[0] + 1}` : "GATE · NO BELT", subShort: "GATE",
    subColor: at ? undefined : C.amber,
    body,
    variants: tightForms(body),
    labels: ["TO CARGO", ...(touch ? [sellLabel(d.id, stars)] : [])],
  };
}

/** bb-0.8.3 (REQ-BFG-043 D11): a track's level line ("FACTORY LEVEL 2/4") and its next level in one line, both kept. */
function upgradeBlocks(track: UpgradeTrack, level: number, next: string | null): Block[] {
  return [{ role: "next", text: levelLine(track, level), keep: true }, ...(next ? [{ role: "next", text: next, keep: true } as Block] : [])];
}

/**
 * bb-0.8.3 (REQ-BFG-043 D11): the UPGRADE button of a track, with the next level's price; dimmed, still showing it, when
 * the gold is short; none at the top level or while the track's control doesn't show (run.ts upgradeShown).
 */
function upgradeAction(ctx: Ctx, track: UpgradeTrack): Action[] {
  const n = nextUpgrade(ctx.run, track), label = upgradeLabel(n.level);
  if (!label || n.price === undefined || !upgradeShown(ctx.run, track)) return [];
  return [{ id: `upgrade-${track}`, label, primary: true, disabled: ctx.run.gold < n.price, onTap: () => { upgrade(ctx, track); } }];
}

/**
 * shoptap (REQ-BFG-035): a turret's bought core or one of its gear pieces (a "fitted" selection, picked by a touch tap
 * on the selected turret): its name and stars, what it is and which turret it sits on, its ability text at its stars (a
 * core's numbers at that turret's class factor, as the turret panel reads them), next star and merge progress, the
 * flavour and how to step on; TO CARGO (REMOVE CORE's or REMOVE GEAR's path, for this piece) and SELL (its cargo price).
 * Null unless `uid` is fitted to an installed turret.
 */
export function fittedPanel(run: Run, uid: number): PanelText | null {
  const b = run.build, m = b.mods.find((q) => q.uid === uid);
  const td = m ? turretSlots(b)[m.turret]?.td : undefined;
  if (!m || !td) return null;
  const d = ITEMS[m.def], stars = starsOf(m), core = d.kind === "core";
  const k = core ? classFactor(td) : 1;
  const body: Block[] = [
    ...abilityBlocks(d.id, stars, { k, hero: b.hero as HeroId, day: run.day }), // CNT-DAY2 (REQ-BFG-100): the run's day, as its word taps (panelPiece's fitted) and textOpts read it
    ...flavourBlocks(d.id, stars, k),
    hintBlock("TAP THE TURRET AGAIN FOR ITS NEXT PART."),
  ];
  return {
    title: titled(d.name, stars), color: RARITY_COLOR[d.rarity],
    sub: `${core ? "CORE" : "GEAR"} ON TURRET ${m.turret + 1}`,
    body,
    variants: tightForms(body),
    labels: ["TO CARGO", sellLabel(d.id, stars)],
  };
}

/** 0.6.2j: a belt's panel parts (routePanel adds the title and the button), exported for tests. */
export interface BeltPanel {
  sub: string;
  subShort?: string;
  headerOnly?: PanelText["headerOnly"];
  /** The ENDS SHORT warning, the belts that join it, its tiles and hits. */
  head: Block[];
  /** The timeline in R7 order, a JOINS row where the walk joins another belt (they give way from the end). */
  rows: Block[];
  /** The gun end's readout, always in sight. */
  foot: Block[];
  /** What stands for the last n rows on a short panel (moreFor: hit tiles only, 0.6.2j). */
  more: (n: number) => Block;
}

/**
 * A belt route (0.6.2 BELTSIDE, V4): its tiles and hits, the timeline in R7 order (0.6.2t: the glossary's hit rows, 0b.4),
 * then the gun end's readout in aligned stat pairs: DMG and BURN, SPD and TIME, and SHOCK and COPIES where they apply.
 * The readout always stays; on a short panel the last timeline rows give way first, and a note says how many.
 * 0.6.2j (J10): a joining belt shows its own tiles' hits, a cyan "JOINS BELT n AT TILE t." row, then the main belt's
 * hits from the join tile on (walkRoute continues through the join); its sub line names the belt it joins; a main belt
 * says which belts join it. 0b.4 holds through a join (J15: the speed belongs to the payload): a SLAG joiner keeps its
 * fixed speed past the join, so its speed hits there read NO EFFECT ON SLAG, never LOCKED; a normal payload joining a
 * slag-fed belt rides that belt's speed state. A belt without joins reads as before. Null unless route `index` exists.
 */
export function beltPanel(run: Run, index: number): BeltPanel | null {
  const b = run.build;
  if (!b.routes[index]) return null;
  const info = routeInfo(b, index);
  const w = walkRoute(b, index, undefined, { gates: true }); // GATES-1b (REQ-BFG-052 B3): DMG, BURN, TIME and COPIES through a gate on the belt
  const belt = beltKind(w);
  const est = w.estimate;
  // 0b.4: the walk counts SURGE VALVE's pulse damage on a SLAG belt, where the sim never pays it
  // NUM-4 (REQ-BFG-047; N1 2.5): the walk's own estimate through fmtDmg, as it is (was toFixed(1) over a max(1, ...) floor)
  // HULL-1d (REQ-BFG-079; BRIEF-HULL1D 2 (h)1): the shown number lands x D(d) on the run's day (dmgShown; the walk stays
  // day 1's: deck.ts walkRoute); BURN (a stack count) and TIME (seconds) don't scale. The switch off: as before
  const big = fmtDmg(dmgShown(est.dmg - slagPulseExtra(w.timeline, belt), run.day));
  // 0.8.0 B1 M2 (G1's F1, ref/BRIEF-v080-B1.md 3.4): a PLATE BREAKER pays its big number only on a blow that finds a whole
  // plating on the hull, and its floor on every other (in real fights about half the blows: N1's m4/breaker.md 39-51%;
  // B1's m2/platemean: a plated hull holds no plating at 53-63% of its shots). On a deck that plates its hull the walk
  // counts the big number, so DMG shows both: the floor's total, then the big number's ("DMG 9.1-12.1")
  const breakers = w.timeline.some((row) => row.hits.some((h) => h.breaker));
  const low = breakers && platedDeck(b) ? walkRoute(b, index, undefined, { unplated: true, gates: true }) : null; // GATES-1b B3: gates too
  const floorDmg = low ? fmtDmg(dmgShown(low.estimate.dmg - slagPulseExtra(low.timeline, belt), run.day)) : big; // HULL-1d: x D(d)
  const dmg = floorDmg !== big ? `${floorDmg}-${big}` : big;
  const hitCount = w.timeline.reduce((n, row) => n + row.hits.length, 0);
  const spd = belt === "locked" ? "100% (LOCKED)" : belt === "slag" ? `${fmtReadPct(w.speedEnd)} (SLAG)` : fmtReadPct(w.speedEnd); // NUM-4: the walk's end speed, a product of speed states (a reading)
  const time = `${fmtClock(est.time)} SEC`; // NUM-4: the ride's whole elapsed seconds, as a clock reads (was toFixed(1))
  const cells: [string, string][][] = [
    [["DMG", dmg], ["BURN", String(est.burn)]],
    [["SPD", spd], ["TIME", time]],
    ...(est.shock || est.copies > 1 ? [[["SHOCK", est.shock ? "YES" : "NO"], ["COPIES", fmtCount(est.copies)]] as [string, string][]] : []),
  ];
  const joined = joinersOf(b, index); // 0.6.2j (J10): the belts that join this one
  const joins = w.joins ?? [];
  // SPACE-1 (REQ-BFG-087, D1): the timeline is one table under its TILES, HITS: line (its rows tie), and the gun end's
  // readout another (its second and third rows tie to the first)
  const joinRow = (j: WalkJoin): Block => ({ role: "row", text: `JOINS BELT ${j.route + 1} AT TILE ${j.tile + 1}.`, colour: C.cyan, trim: true, join: true, tie: true });
  const rows: Block[] = [];
  w.timeline.forEach((row, i) => {
    for (const j of joins) if (j.row === i) rows.push(joinRow(j));
    rows.push({ role: "row", label: `T${row.tile + 1}`, text: row.hits.map((h) => hitText(h, belt, run.day)).join(", "), trim: true, tie: true }); // HULL-1d: the day
  });
  for (const j of joins) if (j.row >= w.timeline.length) rows.push(joinRow(j));
  const feeds = info.connected ? `FEEDS TURRET ${info.turret + 1}` : "NOT CONNECTED";
  const sync = syncLine(b, index); // 0.8.0 H1 M3: FOUNDRY's SYNC line; null for every belt no CRUCIBLE feeds
  return {
    // 0.6.2j: a joining belt's sub names the belt it joins (0.6.2rel: two short sentences, no "·"); 0.6.2rel2: a main
    // belt's one sentence ends with its full stop too
    // 0.6.2rel3 (TUNE-M, RULE JOIN PACE): a joining belt's sub says its factory's pace too, for the header strip.
    // JOINS-1 (REQ-BFG-091): with FREE_JOINS on there is no pace to say: the sub names the belt it joins only
    sub: info.join ? (freeJoinsRules() ? `JOINS BELT ${info.join.route + 1}. ${feeds}.` : `JOINS BELT ${info.join.route + 1} AT ${JOIN_PACE_PCT}% PACE. ${feeds}.`) : `${feeds}.`,
    ...(info.join ? { subShort: `JOINS BELT ${info.join.route + 1}.` } : {}),
    // 0.6.2t2 (F2): the header strip labels its time as the readout's grid does (TIME), never a bare number
    headerOnly: info.connected ? {
      texts: [
        `DMG ${dmg}, BURN ${est.burn}${est.shock ? ", SHOCK" : ""}, SPD ${fmtReadPct(w.speedEnd)}, TIME ${time}`,
        `DMG ${dmg}, TIME ${time}, BURN ${est.burn}`,
        `DMG ${dmg}, TIME ${time}`,
      ],
      colour: C.yellow,
    } : undefined,
    head: [
      ...(info.connected ? [] : [{ role: "warn", text: "ENDS SHORT OF A TURRET INTAKE.", keep: true } as Block]),
      ...joinPaceBlocks(b, b.routes[index].factory, index), // 0.6.2rel3 (TUNE-M, RULE JOIN PACE): [] unless joined
      ...(joined.length ? [{
        role: "hits", colour: C.cyan, keep: true,
        text: joined.length === 1 ? `BELT ${joined[0] + 1} JOINS IT.` : `BELTS ${andList(joined.map((j) => j + 1))} JOIN IT.`,
      } as Block] : []),
      ...(sync ? [{ role: "hits", text: sync.text, colour: SYNC_COLOUR[sync.state], keep: true } as Block] : []),
      { role: "hits", text: hitCount ? `${info.tiles} TILES, ${hitCount} HIT${hitCount === 1 ? "" : "S"}:` : `${info.tiles} TILES. NO RIG WORKS THIS BELT.`, keep: true },
    ],
    rows,
    foot: cells.map((c, i): Block => ({ role: "grid", text: "", cells: c, keep: true, ...(i ? { tie: true } : {}) })),
    more: (n) => moreFor(rows.slice(rows.length - n)),
  };
}

/** 0.8.0 H1 M3: a SYNC line's state: its blanks fuse with a partner belt's, reach the gun too far apart, or have no
 *  partner belt at that gun. */
export type SyncState = "sync" | "apart" | "alone";
const SYNC_COLOUR: Record<SyncState, string> = { sync: C.yellow, apart: C.amber, alone: C.slate4 };

/**
 * 0.8.0 H1 M3 (REQ-BFG-011): the route inspector's SYNC line for a belt a CRUCIBLE feeds (syncOf, docs/RACES.md section
 * 1): whether its blanks fuse at their turret with another CRUCIBLE belt's that enters through a different intake, in
 * whole sentences with the real numbers (the arrival gap, SYNC_WINDOW). A delay line names the pours between the two
 * blanks. Null for every belt no CRUCIBLE feeds or that reaches no turret. Exported for tests.
 */
export function syncLine(b: Build, index: number): { text: string; state: SyncState } | null {
  const s = syncOf(b, index);
  if (!s) return null;
  const gun = `TURRET ${s.turret + 1}`;
  if (!s.partners.length) return { text: `NO OTHER CRUCIBLE BELT REACHES ${gun}, SO ITS BLANKS FIRE UNFUSED.`, state: "alone" };
  const p = s.partners.find((q) => q.sync) ?? s.partners.reduce((m, q) => (q.offset < m.offset ? q : m));
  // NUM-4 (REQ-BFG-047): the arrival gap and the 0.25 s window are hidden timers no whole second can say (N1 2.2): the
  // line says AT ONCE (the PAIR word) or TOO FAR APART (was "0.35 SECONDS APART, MORE THAN 0.25 SECONDS")
  const when = Math.abs(p.offset) < 1e-9 ? "AT THE SAME MOMENT" : p.sync ? "AT ONCE" : "TOO FAR APART";
  if (p.sync) {
    // a delay line: the longer belt's blank meets a later pour's blank from the shorter one
    const pours = p.pours === 0 ? "" : `, ${p.pours === 1 ? "ONE POUR" : `${p.pours} POURS`} APART`;
    return { text: `IN SYNC WITH BELT ${p.route + 1}${pours}: THEIR BLANKS REACH ${gun} ${when} AND FUSE.`, state: "sync" };
  }
  return {
    text: `OUT OF SYNC WITH BELT ${p.route + 1}: THEIR BLANKS REACH ${gun} ${when}, SO THEY FIRE UNFUSED.`,
    state: "apart",
  };
}

/** A belt route's panel (beltPanel with its title and REMOVE BELT). */
export function routePanel(run: Run, index: number): PanelText | null {
  const bp = beltPanel(run, index);
  if (!bp) return null;
  return {
    title: "BELT ROUTE", color: C.white, sub: bp.sub, ...(bp.subShort ? { subShort: bp.subShort } : {}), headerOnly: bp.headerOnly,
    body: [...bp.head, ...bp.rows, ...bp.foot],
    labels: ["REMOVE BELT"],
  };
}

/**
 * 0.6.1p: the GATLING clashes (the Prime's call): a GATLING never holds a window, so HOPPER's seconds and FINISHER RAM do
 * nothing on its turret. 0.6.2 CAND-A: every piece of gear on slot t, in hardpoint order (0.6.2s S4), not only the
 * first; a HOPPER's store still works there (tests/fb062.mech.test.ts). 0.6.2rel: whole sentences from the glossary
 * (gatlingClashText). 0.6.2rel2: the same clash on a COMPOUND BREECH, whose hold ignores HOPPER's seconds (cores.ts
 * ROUTINES.compound). `short`: the desk's short lines (clashShortText), one for each clashing gear type. Exported for
 * tests.
 */
export function gatlingClash(b: Build, t: number, routine: string, short = false): string[] {
  if (routine !== "gatling" && routine !== "compound") return [];
  const texts = gearOn(b, t).map((m) => (short ? clashShortText(m.def, routine) : gatlingClashText(m.def, starsOf(m), routine)));
  const out = texts.filter((s): s is string => !!s);
  return short ? [...new Set(out)] : out;
}

/** 0.6.2 FB-B (DESIGN §11 P6): the turret panel's sentence for a MANTLET ★2/★3 that shields `n` tiles: the last tile(s)
 *  of every belt into this turret (the glossary's shieldText; Y7b2, the flip: not the rigs working them). Exported for tests. */
export const shieldLine = (n: number): string => shieldText(n);

/**
 * A turret (0.6.1b) in its TURRET SLOT (0.6.2s, REQ-BFG-031 S10): its name, stars and rarity (the title) and its class
 * and slot (the sub line); first the belts a swap left without an intake (S2/S5); then its CORE socket and every GEAR
 * slot in hardpoint order (S4), filled or empty, each named in a row with its opening sentence under it (T5: the same
 * sentence as the module's own panel, the core at the turret's k); its firing rows (0.6.2t: from makeTurret, the
 * numbers the battle fires by; 0.6.2 FB-B: a HOPPER ★2/★3's store); a clash for each piece of gear a GATLING SPOOL
 * idles (CAND-A); a MANTLET ★2/★3's shield (FB-B); its notes (turretPanel.ts slotNotes) and the move hint. The compact
 * forms, fullest first: each socket's short effect (the glossary's gist) in its row; then the dead ends on one line each;
 * then every gear slot on one row. The dead ends and the socket rows always show. Null unless a turret is installed.
 */
export function turretPanel(run: Run, index: number, touch = false): PanelText | null {
  const b = run.build;
  const td = turretSlots(b)[index]?.td; // 0.6.2s: the installed turret (an empty slot: turretPanel.ts emptySlotPanel)
  if (!td) return null;
  const gm = gearFor(b, index); // 0.6.1b: the gear REMOVE GEAR takes; the core has its own socket (coreFor via resolveCore)
  const tc = resolveCore(b, index, td); // 0.6.1b: bought core (k-scaled) or the signature core
  const tu = makeTurret(b, index, td); // its interval (every gear piece, the core, the long-belt cadence), window and store
  const every = tu.interval * (tc.bought ? tc.spec.reloadMul ?? 1 : 1); // SALVO's volley reload
  const coreName = tc.bought ? starred(ITEMS[tc.def].name, tc.stars) : (SIGNATURE_CORES[tc.def]?.name ?? "SIGNATURE CORE");
  const o = (k: number): TextOpts => ({ k, hero: b.hero as HeroId, day: run.day }); // HULL-1d (REQ-BFG-079): the run's day
  // a socket's opening sentence (T5: as its own panel reads it); the compact forms use its gist in the row instead
  const first = (def: string, stars: number, k: number): Block[] => {
    // U2a (REQ-BFG-046): a core with a new face shows its rule line(s) under its row, as its own panel reads them
    const face = faceBlocks(def, stars, o(k));
    if (face) return face.filter((x) => x.role === "ability"); // its reminder stays on the core's own panel
    // Y7b2 (the words; ruling R-1 for every piece): no perk name after a faceless part's opening sentence (the ⓘ view's)
    const at = abilityText(def, stars, o(k));
    return at.sentences.length ? [{ role: "ability", text: at.sentences[0], keep: true }] : [];
  };
  const coreGist = tc.bought ? faceGist(tc.def, tc.stars, o(tc.k)) ?? gist(tc.def, tc.stars, o(tc.k)) : ""; // U2a: a face's rule
  const warn = (short: boolean) => deadEndLines(b, index, short).map((text): Block => ({ role: "warn", text, keep: true }));
  // the CORE and GEAR socket rows name the parts; they align apart from the stat rows (0.6.2t2 F2: LOAD TIME's wider
  // label moves only those)
  const rowOf = (s: SocketRow): Block => ({ role: "row", label: s.label, text: s.text, keep: true, group: "part" });
  const noJam = tu.noJam || (tc.bought && tc.spec.noJam);
  // U2c step 4 (REQ-BFG-046, REQ-BFG-047): the turret's STAT ROW, as its face reads it (faces.ts turretStats: how often it
  // fires, the loads its chamber holds, its gear slots), at its effective values: the interval makeTurret builds (every
  // gear piece, the core, the long-belt cadence and the TURRET SPEED level) x SALVO's volley reload, as the FIRES row read
  // it; the window as the CHAMBER row read it; the slot's gear slots. The LOAD TIME row goes (a hidden timer, N1 6.6).
  // What the CHAMBER row said beside its loads stays as one short kept note: NEVER JAMS, a HOPPER's store, and PRESSURE
  // BREECH's cap on the loads waiting it counts (U2b's ledger: "in the turret panel's stat rows").
  const gearSlots = turretSlots(b)[index]?.gearSlots ?? 0;
  const capped = tc.bought && tc.routine === "pressure" ? tc.spec.maxCount : undefined;
  const note = [
    ...(noJam ? ["NEVER JAMS."] : []),
    ...(tu.storeMax ? [`STORES +${fmtCount(tu.storeMax)} {SLUG} WHILE IT FIRES.`] : []),
    ...(capped ? [`COUNTS UP TO ${fmtCount(capped)} WAITING {SLUG}.`] : []), // U2d F5: was MAX 5 {SLUG} WAITING COUNT.
  ].join(" ");
  // Y1 (REQ-BFG-070; STAR-D rule 7's cue, ships with SALVO RACK's face 'SHOT: FIRES THE CHAMBER AT +20 {DMG} EACH.'): a
  // SALVO RACK fires its whole chamber, then reloads for its interval x reloadMul (cores.ts ROUTINES.salvo cadence; the
  // `every` above), so its turret's RATE is its volley pace: the SPEED over reloadMul, rounded half up once as makeTurret
  // rounds a SPEED (30 / 1.6 = 18.75 is 19). Every other turret's RATE is its SPEED, as before. Y4 (release Y; REQ-BFG-047;
  // BRIEF-Y4 S1): through cores.ts salvoSpeed, the helper the sim's volley reload reads (salvoReload: with the star switch
  // on, the interval of this RATE), so the row and the sim can't drift; the same number whatever the switch
  const salvo = tc.bought && tc.routine === "salvo" && !!tc.spec.reloadMul;
  const rate = salvo ? salvoSpeed(tu.speed, tc.spec.reloadMul!) : tu.speed;
  // ENCHANT-1 (REQ-BFG-085, E7): the word the turret holds. Its row is the battle's own numbers (MASSIVE's and SWIFT's RATE and WIDE's gear
  // slot are in them already: deck.ts resolveSlots) with the word's stat at the end (FIERY, GROWING's grown DMG), the numbers the word
  // added or changed in its colour; its one line (a LINE word) goes under the row, in every form below, kept
  const wt = slotWord(b, index);
  const trow = wt ? wordTurretRow([speedPair(rate), ["SLUG", fmtCount(tu.window)], ["GEAR", fmtCount(gearSlots)]], wt) : null;
  const wl = wordLineBlocks(wt, run.day); // ENCHANT-2 (REQ-BFG-085; T6 fix round): RISING's and GROWING's damage amounts on the run's day
  const stats: Block[] = [
    // NUM-4 (REQ-BFG-047): the RATE pair is the SPEED the battle uses (TurretState.speed: every gear piece, the core, the
    // long belt and the TURRET SPEED level, rounded once); Y1: a SALVO RACK's, its volley pace (above)
    // CARD-2 (REQ-BFG-081, K4): in words, its own numbers (faceBlocks.ts turretRow: RATE n  HOLDS n  GEAR SLOTS n)
    trow ? { role: "ability", text: turretRow(trow.row), keep: true, pairs: true, ...(trow.nums.length ? { hue: { colour: wordColour(wt!.id), nums: trow.nums } } : {}) }
      : { role: "ability", text: turretRow([speedPair(rate), ["SLUG", fmtCount(tu.window)], ["GEAR", fmtCount(gearSlots)]]), keep: true, pairs: true },
    ...(note ? [{ role: "note", text: icons(note), keep: true } as Block] : []),
  ];
  // a clash (a piece of gear that does nothing here) and the shield. 0.6.2rel2 (the rehearsal's nit 1): the desk column
  // keeps both (deskKeep), so where they don't fit beside every gear piece's sentence the panel takes the gear's compact
  // forms first (the gist rows, then the one-row list); only a panel whose one-row list leaves no room for them falls
  // back to that list without them (the last forms below). The phone band ranks them first among its optional blocks.
  const rest: Block[] = [
    ...gatlingClash(b, index, tc.routine).map((text): Block => ({ role: "warn", text, rank: 1, deskKeep: true })), // CAND-A: every gear slot
    ...(tu.intakeGuard > 0 ? [{ role: "ability", text: shieldLine(tu.intakeGuard), rank: 1, deskKeep: true } as Block] : []), // FB-B MANTLET
    ...slotNotes(b, index).map((text): Block => ({ role: "ability", text, rank: 4 })),
    hintBlock(touch ? touchSlotHint(b, index) : SLOT_HINT), // shoptap: on touch, a tap again reads its core and gear
  ];
  // bb-0.8.3 (REQ-BFG-043 D11): a starting turret (it holds the free copy) shows its TURRET SPEED level and next level in
  // one short sentence ("SPEED LEVEL 1/4, NEXT EVERY 0.85 SEC."), the last optional block (rank 7, after the hint): where
  // a panel is short of room it gives way before anything the panel showed before (the board's level marker and the
  // UPGRADE button with its price still show)
  const startTurret = !!turretSlots(b)[index]?.turret?.free, tl = upgradeLevel(b, "turret");
  // U2c step 5: in the notice form, "SPEED: LEVEL 1/4. UPGRADE: FASTER." (was "SPEED LEVEL 1/4, NEXT: FASTER."): what the
  // UPGRADE button beside it does; two lines of the desk column, as before
  // NUM-4 (REQ-BFG-047; N1 2.2): its UPGRADE names the next level's SPEED, the battle's: makeTurret on this build at that
  // TURRET SPEED level (deck.ts turretSlots: levelSpeed, then every gear piece and the core as now)
  const nextSpeed = (): number => {
    if (tl >= UPGRADE_MAX) return tu.speed;
    const b2 = { ...b, upgrades: { ...(b.upgrades ?? {}), turret: tl + 1 } };
    return makeTurret(b2, index, turretSlots(b2)[index]?.td ?? td).speed;
  };
  if (startTurret) rest.splice(rest.length - 1, 0, { role: "ability", text: `SPEED: ${turretSpeedRow(nextSpeed(), tl)}`, rank: 7 });
  // SPACE-1 (REQ-BFG-087, D1): each socket is one item: its row, and its own description tied under it
  const own = (bs: Block[]): Block[] => bs.map((x) => ({ ...x, tie: true }));
  const body: Block[] = [
    ...warn(false),
    ...stats, // U2c step 4: the stat row first, then the CORE and GEAR rows as now
    ...wl, // ENCHANT-1: the word's line under the stat row
    ...socketLines(b, index, coreName).flatMap((s, i) =>
      [rowOf(s), ...own(i === 0 ? (tc.bought ? first(tc.def, tc.stars, tc.k) : []) : s.def ? first(s.def, s.stars ?? 1, 1) : [])]),
    ...rest,
  ];
  const gists = socketLines(b, index, coreGist ? `${coreName}: ${coreGist}.` : coreName, (d, s) => gist(d, s, o(1))).map(rowOf);
  const list = socketLines(b, index, coreName, undefined, true).map(rowOf);
  // U2c step 4: the last form lists the gear on one row; there the stat row and its note give way where room is short
  // (rank 2, a chain), as the stat sentences it replaces did, so the shortest band never cuts a kept row
  const statsLast: Block[] = stats.map((x) => ({ ...x, keep: undefined, rank: 2, chain: "stats" }));
  const forms = [[...warn(false), ...stats, ...wl, ...gists, ...rest], [...warn(true), ...stats, ...wl, ...gists, ...rest], [...warn(true), ...statsLast, ...wl, ...list, ...rest]]; // ENCHANT-1: ...wl, the word's line, kept in each
  // 0.6.2rel2 (the release owner's answer d957272806131146): the desk's last rungs, for a turret whose one-row gear list
  // leaves no room for the whole clash sentences: that list with each clash's short line; then the gear as a count of
  // its pieces with the short lines (the names give way before the warning); the shield in each only if it fits. Last,
  // a safety net no desk panel should need: the list with nothing kept but its rows. The phone never reaches these.
  // Y7b2 (cap's ruling d4e8184e90c0ed75; the flip): on these rungs the optional shield ranks 2, after the hint (deskRank
  // 1.5), so the hint comes right after the kept blocks (0.6.2t2 F4) and the shield shows where it fits (was rank 1: with
  // HOPPER's short line gone it took the room first and dropped the hint on two six-gear THUNDERERs)
  const optional = (bs: Block[]): Block[] => bs.map(({ deskKeep, ...x }) => x);
  if (rest.some((x) => x.deskKeep)) {
    const short = gatlingClash(b, index, tc.routine, true).map((text): Block => ({ role: "warn", text, rank: 1, deskKeep: true }));
    const after = [...(tu.intakeGuard > 0 ? [{ role: "ability", text: shieldLine(tu.intakeGuard), rank: 2 } as Block] : []), ...rest.filter((x) => !x.deskKeep)];
    const pieces = gearOn(b, index).slice(0, turretSlots(b)[index]?.gearSlots ?? 0).length;
    forms.push([...warn(true), ...statsLast, ...wl, ...list, ...short, ...after]);
    if (short.length) forms.push([...warn(true), ...statsLast, ...wl, list[0], rowOf({ label: "GEAR", text: plural(pieces, "PIECE") }), ...short, ...after]);
    forms.push(optional(forms[2]));
  }
  return {
    title: slotTitle(b, index), color: slotColor(b, index), sub: slotSub(b, index), ...(wt ? { ench: wt.id } : {}), // ENCHANT-1: the word first in the title
    body,
    variants: [{ body, tight: true }, ...forms.flatMap((f) => [{ body: f }, { body: f, tight: true }])],
    labels: [...(startTurret && upgradeLabel(tl) ? [upgradeLabel(tl)!] : []), ...(tc.bought ? ["REMOVE CORE"] : []), ...(gm ? ["REMOVE GEAR"] : []), ...slotLabels(b, index)],
    // EXPLAIN-1 (REQ-BFG-089, E1c, E4): the turret's two kind lines, never on this face (WORDS-1 drew them on its cards only),
    // in its ⓘ NOTES at its stat row's numbers: the window and the slot's gear slots
    notes: turretPlainOf(tu.window, gearSlots).map((text): Block => ({ role: "ability", text: icons(text), keep: true, note: "kind" })),
  };
}

// ------------------------------------------------------------------------------------------------------ the layout

/** One drawn line of a panel's body. */
export interface PLine {
  spans: Span[];
  font: FontId;
  /** A stat row's label (drawn in the label colour at the left) and its value's indent. */
  label?: string;
  indent?: number;
  /** A grid row's pairs: each label at x + at, its value at x + vx. */
  cells?: { at: number; label: string; spans: Span[]; vx: number }[];
  /** The block it belongs to (tests). */
  block: Block;
  /** The height it takes: its glyphs and the gap under them (LH, or 6 for a tight 3x5 line). */
  pitch: number;
}

/** The pixel height a line takes in each face (its glyphs and the gap under them). */
export const LH: Record<FontId, number> = { "5": 9, "3": 7 };
/** 0.6.2t (T6): a tight variant's 3x5 line pitch (5 px glyphs, 1 px gap). */
export const LH_TIGHT = 6;
/** The rule between the ability text and the flavour or hint (T4: visibly separated). */
export const DIVIDER = 4;

/** A laid-out block: its lines and their height. */
export interface Laid {
  b: Block;
  lines: PLine[];
  h: number;
}

/** A face's gap after a stat label. */
const labelGap = (font: FontId): number => (font === "5" ? 5 : 4);

interface Cols {
  labelW: number; // a stat row's value indent
  /** The grid rows' geometry: two columns (the second at `at1`) when every pair fits them, else one pair a line. */
  grid: { two: boolean; at1: number; l0: number; l1: number };
}

/** Lay one block into wrapped lines at `width` in the panel's main face (the flavour and hint take the small face);
 *  `tight`: 3x5 lines at LH_TIGHT. */
function layBlock(b: Block, width: number, main: FontId, cols: Cols, tight = false): PLine[] {
  const font: FontId = ROLE[b.role].small ? "3" : main;
  const pitch = font === "3" && tight ? LH_TIGHT : LH[font];
  const base = b.colour ?? ROLE[b.role].colour;
  if (b.role === "grid" && b.cells) {
    const gp = cols.grid, gap = labelGap(font);
    if (gp.two) {
      return [{
        spans: [], font, block: b, pitch,
        cells: b.cells.map(([l, v], i) => ({ at: i ? gp.at1 : 0, label: l, spans: colourize(v, base), vx: i ? gp.at1 + gp.l1 + gap : gp.l0 + gap })),
      }];
    }
    // one pair a line, the values aligned after the widest label
    const lw = Math.max(gp.l0, gp.l1) + gap;
    return b.cells.map(([l, v]) => ({ spans: [], font, block: b, pitch, cells: [{ at: 0, label: l, spans: colourize(v, base), vx: lw }] }));
  }
  if (b.pairs) {
    // CARD-2 (REQ-BFG-081, K4): the turret row's labelled pairs ("{RATE}RATE 55"), each its icon in its colour, its word in
    // the line's colour and its number white, never split: one line where the row fits, else one pair a line (the desk
    // column's 118 px)
    const ps = b.text.split(PAIR_GAP).map((p): Span[] => {
      const at = p.lastIndexOf(" "), icon = p[0], ic = ICON_COLOUR[icon];
      const label = ic ? p.slice(1, at) : p.slice(0, at);
      return [...(ic ? [{ t: icon, c: ic }] : []), { t: `${label} `, c: base }, { t: p.slice(at + 1), c: NUMBER_COLOUR }];
    });
    // ENCHANT-1 (REQ-BFG-085, E7): a pair whose number a word added or changed draws that number in the word's colour (Block.hue)
    if (b.hue) ps.forEach((s, i) => { if (b.hue!.nums.includes(i)) ps[i] = s.map((sp) => (sp.c === NUMBER_COLOUR ? { ...sp, c: b.hue!.colour } : sp)); });
    const one = ps.flatMap((s, i) => (i ? [{ t: PAIR_GAP, c: base }, ...s] : s));
    if (lineWidth(one, font) <= width) return [{ spans: one, font, block: b, pitch }];
    return ps.map((spans) => ({ spans, font, block: b, pitch }));
  }
  if (b.role === "row") {
    const indent = b.label ? cols.labelW : 0;
    return wrapRich(colourize(b.text, base), width - indent, font)
      .map((spans, i) => ({ spans, font, block: b, indent, pitch, ...(i === 0 && b.label ? { label: b.label } : {}) }));
  }
  let spans: Span[];
  if (b.brass) spans = ruleSpans(b.text, b.brass, base); // U2a: a trigger or NEXT★ label in brass, the rest rich text
  else if (b.role === "reminder" || b.role === "caveat") spans = colourize(b.text, base, base); // U2a: dim, numbers too; its keyword keeps its colour (U2b: a caveat too)
  else if (b.role === "next" && b.text.startsWith("NEXT STAR:")) {
    spans = [{ t: "NEXT STAR:", c: PERK_COLOUR, whole: true }, { t: " ", c: base }, ...colourize(b.text.slice(10).trim(), base)];
  } else if (b.role === "flavour") spans = colourize(b.text, base, base); // its numbers stay dim; its keywords keep their colours
  else if (b.role === "hint" || b.role === "note") spans = [{ t: b.text, c: base }];
  else spans = colourize(b.text, base);
  if (b.hue) spans = hueSpans(spans, b.hue); // ENCHANT-1 (REQ-BFG-085, E7): the numbers a word added or changed, in its colour
  if (b.perk) spans.push({ t: " ", c: base }, { t: b.perk, c: PERK_COLOUR, whole: true });
  return wrapRich(spans, width, font).map((s) => ({ spans: b.perk ? ownPerk(s, b.perk, base) : s, font, block: b, pitch }));
}

/** U2b: a perk's name keeps its own span. wrapRich colours the space between two words as the block's first span, so after
 *  a brass trigger label the space before the perk is brass and merges into it (" ★2 CLEAN CUT"); it goes back to the
 *  base colour (a space has no ink, so the line draws the same). */
function ownPerk(line: Span[], perk: string, base: string): Span[] {
  return line.flatMap((s): Span[] => (s.c === PERK_COLOUR && s.t !== perk && s.t.endsWith(perk) && !s.t.slice(0, -perk.length).trim()
    ? [{ t: s.t.slice(0, -perk.length), c: base }, { t: perk, c: PERK_COLOUR }] : [s]));
}

/** ENCHANT-1 (REQ-BFG-085, E7): a stat row's spans with the numbers a word added or changed (`hue.nums`, 0-based in reading order: each
 *  number is one span drawn in NUMBER_COLOUR by colourize) in the word's colour; the icons keep their own (drawText tints each glyph). */
export function hueSpans(spans: readonly Span[], hue: NonNullable<Block["hue"]>): Span[] {
  let n = 0;
  return spans.map((s) => (s.c === NUMBER_COLOUR && /\d/.test(s.t) && hue.nums.includes(n++) ? { ...s, c: hue.colour } : s));
}

/** Lay out blocks: a panel's stat labels share one value column (each group its own), its grid rows two label columns. */
export function lay(bs: readonly Block[], width: number, main: FontId, tight = false): Laid[] {
  const labelsOf = (g?: string) => bs.filter((b) => b.role === "row" && b.label && b.group === g).map((b) => textWidth(b.label!, main));
  const labels = labelsOf();
  const grids = bs.filter((b) => b.role === "grid" && b.cells);
  const colW = (i: number, j: 0 | 1) => Math.max(0, ...grids.flatMap((b) => (b.cells![i] ? [textWidth(b.cells![i][j], main)] : [])));
  // the second column starts at the half, or after the first column's widest value; two columns only if all fit
  const gap = labelGap(main), l0 = colW(0, 0), l1 = colW(1, 0);
  const at1 = Math.max(Math.floor((width + gap) / 2), l0 + gap + colW(0, 1) + 6);
  const cols: Cols = {
    labelW: labels.length ? Math.max(...labels) + labelGap(main) : 0,
    grid: { two: at1 + l1 + gap + colW(1, 1) <= width, at1, l0, l1 },
  };
  return bs.map((b) => {
    const own = b.group === undefined ? cols : { ...cols, labelW: Math.max(0, ...labelsOf(b.group)) + labelGap(main) };
    const lines = layBlock(b, width, main, own, tight);
    return { b, lines, h: lines.reduce((n, l) => n + l.pitch, 0) };
  });
}

/** The height of blocks in display order: a rule before the first small block (flavour, hint) after a big one. */
export function heightOf(ls: readonly Laid[]): number {
  let h = 0, big = false, ruled = false;
  for (const l of ls) {
    const small = ruledRole(l.b.role); // U2a: a reminder is drawn small but takes no rule
    if (small && big && !ruled) {
      h += DIVIDER;
      ruled = true;
    }
    if (!small) big = true;
    h += l.h;
  }
  return h;
}

/** The body's plan: the main face, the blocks drawn (in order) and their lines. */
export interface BodyPlan {
  font: FontId;
  shown: Laid[];
  lines: (PLine | "rule")[];
  height: number;
  /** The kept blocks fit whole (false: the last variant is drawn, cut at the panel's end: a phone cut). */
  fits: boolean;
  /** Which text was used: 0 the full body, n the n-th compact variant. */
  variant: number;
  /** zoom (REQ-BFG-040): the text is the full body's: variant 0, or a variant that only sets it at the tight pitch (the
   *  same blocks, no sub line of its own: tightForms' first, a turret's first). */
  fullBody: boolean;
  /** The variant's tight 3x5 pitch (its body starts 1 px higher). */
  tight: boolean;
  /** The variant's header sub line, in place of the panel's (a rig's hits or IDLE warning), and its colour. */
  sub?: string;
  subColor?: string;
  /** The optional blocks left out. */
  dropped: Block[];
}

/** A note for timeline rows that gave way (0.6.2 BELTSIDE's trim). */
const moreNote = (n: number): Block => ({ role: "note", text: `+${n} MORE HIT TILE${n === 1 ? "" : "S"} (NUMBERED ON THE DECK)`, keep: true, tie: true }); // SPACE-1: the timeline's
/** 0.6.2j (J10): the block standing for the timeline rows that gave way: the note counts the hit tiles among them (a
 *  JOINS row is none); when they hold no hit tile, the first of them shows as itself. */
export function moreFor(dropped: readonly Block[]): Block {
  const k = dropped.filter((b) => !b.join).length;
  return !k && dropped.length ? { ...dropped[0], trim: false, keep: true } : moreNote(k);
}

/** 0.6.2t2 (F4): the desk column's order for the optional blocks: the action hint right after the kept blocks (a turret's
 *  stat rows aside), so it shows whenever it fits whole beside them; then the ability's later sentences, then the flavour. */
const deskRank = (b: Block): number => (b.role === "hint" ? 1.5 : b.rank ?? 5);

/** Choose the blocks for `avail` px: every kept block, the timeline rows that fit (then a note for the rest), then the
 *  optional blocks by rank (`rankOf`), each only if it fits whole. Returns them in display order. */
function choose(all: readonly Laid[], avail: number, width: number, main: FontId, tight = false,
  rankOf: (b: Block) => number = (b) => b.rank ?? 5): { chosen: Laid[]; fits: boolean } {
  const seqOf = (s: Set<Laid>, note: Laid | null): Laid[] => {
    const seq = all.filter((l) => s.has(l));
    if (!note) return seq;
    const lastTrim = [...seq].reverse().find((l) => l.b.trim);
    const grid = seq.findIndex((l) => l.b.role === "grid");
    const at = lastTrim ? seq.indexOf(lastTrim) + 1 : grid >= 0 ? grid : seq.length;
    return [...seq.slice(0, at), note, ...seq.slice(at)];
  };
  let set = new Set(all.filter((l) => l.b.keep));
  let note: Laid | null = null;
  if (heightOf(seqOf(set, null)) > avail) return { chosen: seqOf(set, null), fits: false };
  const trims = all.filter((l) => l.b.trim);
  if (trims.length) {
    const rows = (n: number) => new Set([...set, ...trims.slice(0, n)]);
    if (heightOf(seqOf(rows(trims.length), null)) <= avail) set = rows(trims.length);
    else {
      for (let n = trims.length - 1; n >= 0; n--) {
        const nt = lay([moreFor(trims.slice(n).map((l) => l.b))], width, main, tight)[0]; // 0.6.2j: hit tiles only
        if (heightOf(seqOf(rows(n), nt)) <= avail || n === 0) {
          set = rows(n);
          note = nt;
          break;
        }
      }
    }
  }
  const optional = all.filter((l) => !l.b.keep && !l.b.trim)
    .sort((a, b) => rankOf(a.b) - rankOf(b.b) || all.indexOf(a) - all.indexOf(b));
  const stopped = new Set<string>(); // chains whose next block didn't fit: their later blocks stay out too
  for (const o of optional) {
    if (o.b.chain && stopped.has(o.b.chain)) continue;
    const s = new Set([...set, o]);
    if (heightOf(seqOf(s, note)) <= avail) set = s;
    else if (o.b.chain) stopped.add(o.b.chain);
  }
  return { chosen: seqOf(set, note), fits: true };
}

/**
 * Plan a panel's body for `avail` px at `width` (T6): the 5x7 face when every block fits it, else the 3x5 face with
 * every kept block whole and the rest whole or absent; where the kept blocks don't fit, the first compact variant whose
 * do (else the last, drawn until the space ends: a phone cut). A tight variant has 1 px more (its body starts 1 px
 * higher). `subFits` says whether a variant's header sub line fits the header (else that variant is skipped).
 * CARD-3 (REQ-BFG-080, B's lever 3): `small`, the band's face only: the 5x7 face is not tried (planPanel's `inBand`).
 */
export function planBody(body: readonly Block[], variants: readonly Variant[] | undefined, width: number, avail: number,
  subFits: (s: string) => boolean = () => true, keepBig = false, small = false): BodyPlan {
  const finish = (font: FontId, chosen: Laid[], fits: boolean, variant: number, from: readonly Laid[], v?: Variant): BodyPlan => {
    const lines: (PLine | "rule")[] = [];
    let big = false, ruled = false;
    for (const l of chosen) {
      const small = ruledRole(l.b.role); // U2a: a reminder is drawn small but takes no rule
      if (small && big && !ruled) {
        lines.push("rule");
        ruled = true;
      }
      if (!small) big = true;
      lines.push(...l.lines);
    }
    const src = variant > 0 ? variants?.[variant - 1] : undefined;
    return {
      font, shown: chosen, lines, height: heightOf(chosen), fits, variant, tight: !!v?.tight,
      fullBody: variant === 0 || (!!src && src.body === body && !src.sub),
      ...(v?.sub ? { sub: v.sub, subColor: v.subColor } : {}),
      dropped: from.filter((l) => !chosen.includes(l)).map((l) => l.b),
    };
  };
  // 0.6.2rel2: in the desk column a deskKeep block is a kept block (so its panel takes a compact variant before it
  // gives way); elsewhere it stays optional
  const deskKept = (bs: readonly Block[]): Block[] =>
    (keepBig && bs.some((b) => b.deskKeep) ? bs.map((b) => (b.deskKeep ? { ...b, keep: true } : b)) : [...bs]);
  const big = lay(deskKept(body), width, "5");
  if (!small && heightOf(big) <= avail) return finish("5", big, true, 0, big);
  // 0.6.2t: the desk column (keepBig) keeps the readable 5x7 face while its kept blocks fit it: the optional blocks
  // give way first, each whole or not at all, least important first (the flavour, then the ability's later sentences,
  // then the hint: 0.6.2t2 F4, deskRank); only then does the text drop to the 3x5 face
  const texts: Variant[] = [{ body: deskKept(body) }, ...(variants ?? []).map((t) => ({ ...t, body: deskKept(t.body) }))];
  if (keepBig && !small) {
    for (let v = 0; v < texts.length; v++) {
      const t = texts[v];
      if (t.tight || (t.sub && !subFits(t.sub))) continue; // the tight pitch is the 3x5 face's
      const all = v === 0 ? big : lay(t.body, width, "5");
      const pick = choose(all, avail, width, "5", false, deskRank);
      if (pick.fits) return finish("5", pick.chosen, true, v, all, t);
    }
  }
  let last: BodyPlan | null = null;
  for (let v = 0; v < texts.length; v++) {
    const t = texts[v];
    if (t.sub && !subFits(t.sub)) continue;
    const room = avail + (t.tight ? 1 : 0);
    const all = lay(t.body, width, "3", !!t.tight);
    const { chosen, fits } = choose(all, room, width, "3", !!t.tight, keepBig ? deskRank : undefined);
    last = finish("3", chosen, fits, v, all, t);
    if (fits) return last;
  }
  return last!;
}

// ------------------------------------------------------------------------------------------- the panel's geometry

/** 0.6.2: a panel's title (the 5x7 face, outlined) or sub line (3x5) within `max` px: a title that doesn't fit
 *  steps down to the 3x5 face, and whatever still doesn't fit is cut short with a dot. */
export function fitHead(g: G, s: string, x: number, y: number, max: number, color: string, title: boolean): void { // SCOUT-1: exported (the battle's faces)
  if (title && textWidth(s) <= max) {
    drawText(g, s, x, y, color, { outline: C.ink });
    return;
  }
  let t = s;
  while (t.length > 1 && textWidth(t, "3") > max) t = `${t.slice(0, -2).trimEnd()}.`;
  drawText(g, t, x, title ? y + 1 : y, color, title ? { font: "3", outline: C.ink } : { font: "3" });
}

/** ENCHANT-1 (REQ-BFG-085, E7): a panel's title as spans: an enchanted piece's WORD first in its colour, then its name (and stars) in its
 *  rarity colour (`FIERY` WHETSTONE: enchantFaces.ts nameSpans); a plain piece's title is one span in `color`, as fitHead draws it. */
export function titleSpans(t: Pick<PanelText, "title" | "color" | "ench">): Span[] {
  return t.ench ? nameSpans(t.ench, t.title, t.color) : [{ t: t.title, c: t.color }];
}

/** ENCHANT-1 (REQ-BFG-085, E7): drawDetails' title (and the battle face's): fitHead for a plain piece, as before; for an enchanted one the
 *  word and the name in their two colours, in the same steps (the 5x7 face where it fits `max`, else the 3x5 face cut short with a dot). */
export function fitTitle(g: G, t: Pick<PanelText, "title" | "color" | "ench">, x: number, y: number, max: number): void {
  if (!t.ench) return fitHead(g, t.title, x, y, max, t.color, true);
  const [word, name] = titleSpans(t);
  let s = t.title;
  const big = textWidth(s) <= max;
  while (!big && s.length > 1 && textWidth(s, "3") > max) s = `${s.slice(0, -2).trimEnd()}.`;
  const at = Math.min(s.length, word.t.length);
  let cx = x;
  for (const [txt, c] of [[s.slice(0, at), word.c], [s.slice(at), name.c]] as const) {
    if (txt) cx += drawText(g, txt, cx, big ? y : y + 1, c, big ? { outline: C.ink } : { font: "3", outline: C.ink }) + 1;
  }
}

/**
 * 0.6.1r F7 (review-061; the Prime's layout call): in portrait the 1-2 action buttons never cover the panel's
 * title or sub-line. They keep the top-right row when it can hold them right of both texts (at the old even width,
 * else each sized to its label); otherwise they take one row directly under the sub-line (and the icon box), and
 * the body text moves down by that row (`shift`). Returns one rect per label, in action order (the last action
 * sits at the right edge, as before). Exported for tests.
 */
export function portraitButtons(title: string, sub: string, labels: string[], r: Rect, left = 0): { rects: Rect[]; shift: number } {
  const n = labels.length, gap = 3, h = 13;
  const clear = r.x + 23 + Math.max(textWidth(title) + 2, textWidth(sub, "3")) + 3; // the title's outline, then a gap
  const even = Math.min(64, Math.floor((r.w - 10 - gap * (n - 1)) / n));
  const sized = labels.map((l) => Math.min(even, Math.max(24, textWidth(l, "3") + 10)));
  const place = (ws: number[], right: number, y: number): Rect[] => {
    const out: Rect[] = [];
    let x = right;
    for (let i = ws.length - 1; i >= 0; i--) {
      x -= ws[i];
      out[i] = { x, y, w: ws[i], h };
      x -= gap;
    }
    return out;
  };
  // ENCHANT-1 (REQ-BFG-085, E4): an armed SELL's label (`SELL? FIERY IS LOST`, 75 px of the 3x5 face) is wider than the 64 px a button keeps in
  // the top row: with the switch on a label wider than its button takes the row under the sub line, where the buttons share the panel's width
  const overflows = (ws: number[]): boolean => enchantRules() && labels.some((l, i) => textWidth(l, "3") + 4 > ws[i]);
  for (const ws of [labels.map(() => even), sized]) {
    const rects = place(ws, r.x + r.w - 4, r.y + 4);
    if (rects[0].x >= clear && !overflows(ws)) return { rects, shift: 0 };
  }
  // the row: y+21..y+33, 1 px under the icon box (y+4..y+19) and 3 px under the sub-line (y+13..y+17). The body
  // text, which began at y+25, starts 3 px under the row (y+37): a 12 px shift keeps 4 lines of the 3x5 face in
  // the 69 px phone band (the turret case's CORE and GEAR lines both still show).
  // EXPLAIN-1 (REQ-BFG-089, E3): `left`, on touch the ⓘ icon's finger square (keywords.ts questionRect: the box grown to a
  // TAP_CSS square from x+1): the row starts right of it, so the icon's target is a whole square clear of the buttons'
  // grown rects; where a label would not fit the narrower buttons, the row keeps the panel's width, as before
  const w = Math.floor((r.w - 10 - gap * (n - 1)) / n);
  const x0 = Math.max(5, left), wl = Math.floor((r.w - 5 - x0 - gap * (n - 1)) / n);
  if (x0 > 5 && labels.every((l) => textWidth(l, "3") + 4 <= wl)) return { rects: place(labels.map(() => wl), r.x + r.w - 5, r.y + 21), shift: 12 };
  return { rects: place(labels.map(() => w), r.x + r.w - 5, r.y + 21), shift: 12 };
}

/** EXPLAIN-1 (REQ-BFG-089, E3): how far right of a phone panel's left edge its ⓘ icon's finger square reaches (questionRect:
 *  the 16 px box at x+4, grown to `tap` px from x+1), so the button row under the sub line starts there; 0 for a mouse. */
export const iconReserve = (tap: number): number => (tap > 0 ? Math.max(20, 1 + tap) : 0);

/** beltside-062: the least portrait panel height that holds portraitButtons' row (y+21..y+33) inside its frame. */
const PORT_ROW_MIN_H = 36;

/**
 * beltside-062: BELTSIDE's portrait top row, for a strip too short for portraitButtons' second row (the header-only
 * 360x640 portrait): 1-2 buttons at the top right, one at the even width, two each sized to its label; the title and
 * the header text are cut short left of them (drawDetails, fitHead).
 */
function topRowButtons(labels: string[], r: Rect): Rect[] {
  const n = labels.length, gap = 3, h = 13;
  const even = Math.min(64, Math.floor((r.w - 10 - gap * (n - 1)) / n));
  const out: Rect[] = [];
  let x = r.x + r.w - 4;
  for (let i = n - 1; i >= 0; i--) {
    const w = n > 1 ? Math.min(even, Math.max(34, textWidth(labels[i], "3") + 10)) : even;
    x -= w;
    out[i] = { x, y: r.y + 4, w, h };
    x -= gap;
  }
  return out;
}

/** The whole panel's plan: its rect, the buttons' rects, the header and the body plan. Pure (drawDetails, tests). */
export interface PanelPlan {
  r: Rect;
  column: boolean;
  /** The portrait buttons' rects (null in the column: its buttons stack under the text). */
  rects: Rect[] | null;
  shift: number;
  subs: string[];
  subMax: number;
  body: BodyPlan;
  /** The body's top y and the last y a glyph may reach. */
  y: number;
  maxY: number;
  /** A header-only strip (no body line fits): the header text drawn in place of the sub line, on 1-2 lines. */
  headerOnly: { lines: string[]; colour: string } | null;
  /** 0.8.0 I1 M4: the module's families in the header: named under the sub line ("sub"), or right-aligned on the row of
   *  the sub line's second line ("sub2") or of the title ("title"), named or (where the names don't fit) as their marks;
   *  null when none is given or the header has no room. */
  famHead: { at: "sub" | "sub2" | "title"; tags: ModuleTag[]; names: boolean; explained?: boolean } | null;
  /** SPACE-1 (REQ-BFG-087): the gaps between the body's separate items, laid after the body's plan (which is exactly as
   *  without them) from the room it leaves: `before[i]`, the gap slots before body line i (gapSlots); `slots`, their sum;
   *  `px`, each slot's gap (all alike: `G` where the room holds it, less where it doesn't, 0 with no room or a cut);
   *  `G` and `min`, the body face's GAP and GAP_MIN (src/ui/spacing.ts). */
  gaps: PanelGaps;
}

/** SPACE-1 (REQ-BFG-087): a panel plan's gaps (PanelPlan.gaps). */
export interface PanelGaps {
  before: number[];
  slots: number;
  px: number;
  G: number;
  min: number;
}

/**
 * SPACE-1 (REQ-BFG-087, D1, D8): the gap slots before each of a body plan's lines: 1 before a line that starts a separate
 * item (a block after a block it isn't tied to, the rule before the flavour or hint, the block after that rule: the rule
 * takes at most a gap above and below it), 0 inside one block (a wrapped description keeps its pitch) and before a block
 * tied to the one above it (Block.tie). `tag`: the family tag sits on the header's row right above the body (under the
 * sub line, or beside its second line): one slot before the first line, so its underline gets clear space (WORDS-1's
 * review note 3). Pure (planPanel, tests).
 */
export function gapSlots(lines: readonly (PLine | "rule")[], tag: boolean): number[] {
  const out: number[] = [];
  let prev: PLine | "rule" | null = null;
  for (const l of lines) {
    out.push(prev === null ? (tag ? 1 : 0) : l === "rule" || prev === "rule" ? 1 : l.block === prev.block || l.block.tie ? 0 : 1);
    prev = l;
  }
  return out;
}

/** SPACE-1 (D3): each gap slot's px in a body from `y` to `maxY`: the room under its last line's glyphs (as visibleLines
 *  draws it), shared by `slots`, at most `G` each; 0 where a line is cut already (a phone cut keeps exactly its lines). */
function slotPx(lines: readonly (PLine | "rule")[], y: number, maxY: number, slots: number, G: number): number {
  if (!slots) return 0;
  let at = y, end = y;
  for (const l of lines) {
    if (l === "rule") {
      at += DIVIDER;
      continue;
    }
    const gh = l.font === "5" ? 7 : 5;
    if (at + gh > maxY) return 0;
    end = at + gh;
    at += l.pitch;
  }
  return Math.max(0, Math.min(G, Math.floor((maxY - end) / slots)));
}

/** shoptap (D5): the landscape column's stacked button height: 16 px, and on touch a finger's target (`tap`, TAP_CSS CSS
 *  px in logical px) where that is taller. Exported for the tests. */
export const columnButtonH = (tap = 0): number => Math.max(16, tap);

/**
 * The landscape column's buttons for `n` actions at the foot of panel `r`, in action order, bottom-up as 0.6.1r stacked
 * them: one full-width 16 px button a row, 3 px apart (the mouse, exactly as before). shoptap (D5): on touch (`tap` > 0)
 * each is a finger's target (columnButtonH) and they go two to a row (a lone last one full width), so the taller
 * buttons cost the column's text half the rows (a turret's four: two rows, not four). Pure (tests).
 */
export function columnButtons(n: number, r: Rect, tap = 0): Rect[] {
  const bh = columnButtonH(tap), per = tap > 0 ? 2 : 1, rows = Math.ceil(n / per), gap = 3;
  const out: Rect[] = [];
  const top = r.y + r.h - 5 - rows * bh - (rows - 1) * gap;
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / per), inRow = Math.min(per, n - row * per), col = i % per;
    const w = Math.floor((r.w - 10 - gap * (inRow - 1)) / inRow);
    out.push({ x: r.x + 5 + col * (w + gap) + (inRow > 1 && col === inRow - 1 ? r.w - 10 - inRow * w - gap * (inRow - 1) : 0), y: top + row * (bh + gap), w, h: bh });
  }
  return out;
}

/** The rows the column's buttons take (columnButtons). */
const columnRows = (n: number, tap = 0): number => Math.ceil(n / (tap > 0 ? 2 : 1));

/** Lay out a panel in `area` (the landscape column when area.h >= 70, else the portrait band). 0.8.0 I1 M4: `families`,
 *  the shown module's families (selFamilies), go in its header; the body plans as without them. shoptap (D5): `o.tap`,
 *  a touch press's target height in logical px: the column's buttons are that tall (columnButtonH; the portrait band's
 *  keep their size, and drawDetails grows their tap targets instead, so the band keeps its text). shoptap2: `o.band`,
 *  a portrait screen's panel: the band's layout however tall it is (a finger's panel grown past the band, layout.ts
 *  panelArea, keeps its buttons in its header row, not under its text).
 *  CARD-3 (REQ-BFG-080, B's lever 3; SPACE-1 open item 2): `o.inBand`, a finger's panel on a phone's band itself
 *  (detailsPlan: layout.ts panelArea's L.info). A body that takes the 5x7 face there with its gaps under 5x7's GAP_MIN
 *  (it would grow over the shop rows, D4) stays in the band in the band's face, 3x5, where that shows its full text
 *  (fullText) with its gaps at least 3x5's GAP_MIN; else the plan is as before. A grown panel still reads in 5x7. The
 *  face is chosen with the gaps on, whatever `o.gaps` asks, so the content is the same with the gaps off and on (SPACE-1's
 *  content first: the gaps never change what a plan shows).
 *  PRESENT-2 F (REQ-BFG-081; PRESENT-1 Question 4 (d) (ii)): `o.small`, the band's face carried to a panel grown up from the band for a note
 *  (detailsPlanOf): the body in the 3x5 face only, as the band itself planned it. */
export function planPanel(sp: PanelText, area: Rect, families: readonly ModuleTag[] = [],
  o: { tap?: number; band?: boolean; gaps?: boolean; inBand?: boolean; small?: boolean } = {}): PanelPlan {
  if (o.small) return planIn(sp, area, families, o, true);
  const p = planIn(sp, area, families, o, false);
  if (!o.inBand || p.column || p.headerOnly || p.body.font !== "5") return p;
  const on = { ...o, gaps: true }, big = o.gaps === false ? planIn(sp, area, families, on, false) : p;
  if (gapsAtLeast(big, big.gaps.min)) return p;
  const s = planIn(sp, area, families, on, true);
  if (!fullText(s) || !gapsAtLeast(s, s.gaps.min)) return p;
  return o.gaps === false ? planIn(sp, area, families, o, true) : s;
}

/** ENCHANT-2W (REQ-BFG-085; W5): a sub line as one line, or as two where it is wider than `max` and has a " · " (broken after the last one, as planIn breaks a sub on the desk column) or a full stop. */
function breakSub(s: string, max: number): string[] {
  const cut = s.lastIndexOf(" · "), stop = s.lastIndexOf(". ");
  if (textWidth(s, "3") <= max || (cut <= 0 && stop <= 0)) return [s];
  return cut > 0 ? [s.slice(0, cut + 2), s.slice(cut + 3)] : [s.slice(0, stop + 1), s.slice(stop + 2)];
}

/** planPanel's plan; `small` (CARD-3, B's lever 3): the body in the 3x5 face only (planBody's `small`). */
function planIn(sp: PanelText, area: Rect, families: readonly ModuleTag[], o: { tap?: number; band?: boolean; gaps?: boolean }, small: boolean): PanelPlan {
  const column = !o.band && area.h >= 70; // landscape column: size to content, the buttons under the text
  const labels = sp.labels;
  const pitch = columnButtonH(o.tap) + 3; // a row of buttons and the gap above it (0.6.1r: 16 + 3)
  const btnRows = columnRows(labels.length, o.tap); // shoptap (D5): on touch two buttons a row (columnButtons)
  const wrapW = area.w - 10;
  // EXPLAIN-1 (REQ-BFG-089, E3): on touch a button row under the sub line starts right of the ⓘ's finger square
  const reserve = iconReserve(o.tap ?? 0);
  let port = !column && labels.length ? portraitButtons(sp.title, sp.sub, labels, area, reserve) : null;
  if (port?.shift && sp.subShort) {
    const short = portraitButtons(sp.title, sp.subShort, labels, area, reserve);
    if (!short.shift) port = short;
  }
  if (port?.shift && area.h < PORT_ROW_MIN_H) port = { rects: topRowButtons(labels, area), shift: 0 };
  // 0.6.1r (item 11): a sub-line wider than the desk column breaks after its last " · " onto a second line; 0.6.2rel:
  // or after its last full stop (a joining belt's "JOINS BELT 1. FEEDS TURRET 1.")
  const cut = sp.sub.lastIndexOf(" · "), stop = sp.sub.lastIndexOf(". ");
  // ENCHANT-2W (REQ-BFG-085; W5): a foe's sub line that is wider than the column (`SPARKFANG'S HEAVY TURRET IN SLOT 1`, 134 px) puts the owner on a line of its own and the rest of
  // the sub under it (itself broken at its last " · " or full stop where that is wider than the column too): the sub is never cut, the owner never given way. Any other panel: as before.
  const wideSub = textWidth(sp.sub, "3") > area.w - 27;
  const ownerLine = column && wideSub && !!sp.subOwner && sp.sub.startsWith(`${sp.subOwner} `) ? sp.subOwner : null;
  const subs = ownerLine !== null ? [ownerLine, ...breakSub(sp.sub.slice(ownerLine.length + 1), area.w - 27)]
    : column && (cut > 0 || stop > 0) && wideSub
      ? cut > 0 ? [sp.sub.slice(0, cut + 2), sp.sub.slice(cut + 3)] : [sp.sub.slice(0, stop + 1), sp.sub.slice(stop + 2)]
      : [sp.sub];
  const shift = (port?.shift ?? 0) + (subs.length > 1 ? 4 + 6 * (subs.length - 2) : 0); // a third sub line (the owner's, then a broken sub) takes its 6 px more
  const extra = labels.length ? btnRows * pitch + 3 : 4;
  const headRight = !column && port && !port.shift ? port.rects[0].x - 3 : area.x + area.w - 4;
  const subMax = headRight - (area.x + 23);
  // the body starts at y + 25 + shift (a tight variant's 1 px higher). The column grows to its text (27 + shift + body +
  // extra, as 0.6.1r sized it); the band's text ends 4 px above its bottom edge. A variant's sub line must fit the header
  const body = planBody(sp.body, sp.variants, wrapW, column ? area.h - 27 - shift - extra : area.h - 27 - shift,
    (s) => subs.length === 1 && textWidth(s, "3") <= subMax, column, small);
  // 0.8.0 I1 M4 (REQ-BFG-023 part 2): the module's families sit in the header and never in the body (planned above,
  // exactly as without them), named where they fit, else as their marks (ui/families.ts, the card's own), in the first
  // place free with a clear pixel all round: the band under a one-line sub line (y+19..y+23, when the body starts at
  // y+25: no button row under the sub line, not a tight body, not the header-only strip); the row of the column's second
  // sub line, right of it; the title row, right of the title, where no button sits (the column's buttons are under its
  // text, the phone's dropped under the sub line). Marks only: under a one-line sub line also above a tight body (rows
  // y+20..y+22; the body starts at y+24)
  const tags = [...families];
  const strip = !column && area.y + 25 + shift + 5 > area.y + area.h - 4 && !!sp.headerOnly;
  const namesW = textWidth(famHeadText(tags, false), "3"), marksW = tags.length * 4 - 1; // CARD-3: the player's tags (the plain names: where the head sits is decided by them, as before PRESENT-2)
  const explainedW = textWidth(famHeadText(tags), "3"); // PRESENT-2 W (b): the head says what the names are (`FORGE FAMILY`, `FAMILIES: FORGE, TEMPO`) where that fits the same place
  const titleFree = column || !labels.length || !!port?.shift;
  const beside = (text: string, font: FontId, free: boolean, gap = 6) => (w: number) => free && 23 + textWidth(text, font) + gap + w <= area.w - 4;
  const bySub2 = beside(subs[1] ?? "", "3", column && subs.length === 2), byTitle = beside(sp.title, "5", titleFree);
  // 0.8.0 B1 M4 (VERIFIED-I1 call 7): the last resort, the marks right of the title with only its outline and one clear
  // pixel between (I1's rule: a clear pixel all round). DRAG CHAIN FOUNDRY at 3 stars on the phone (its 125 px title, the
  // buttons under the sub line) had no place at all
  const byTitleTight = beside(sp.title, "5", titleFree, 2);
  const underSub = subs.length === 1 && !shift;
  const famHead0: PanelPlan["famHead"] = !tags.length || strip || area.h < 28 ? null
    : underSub && !body.tight && namesW <= area.w - 27 ? { at: "sub", tags, names: true }
    : bySub2(namesW) ? { at: "sub2", tags, names: true }
    : byTitle(namesW) ? { at: "title", tags, names: true }
    : underSub && marksW <= area.w - 27 ? { at: "sub", tags, names: false }
    : bySub2(marksW) ? { at: "sub2", tags, names: false }
    : byTitle(marksW) || byTitleTight(marksW) ? { at: "title", tags, names: false }
    : null;
  // PRESENT-2 W (b) (cap's ruling 7d5006c5f3ca852f): one ladder a head, per view: the explained words (`FORGE FAMILY`, `FAMILIES: FORGE, TEMPO`) where they fit the place the plain names
  // took (the head keeps today's place, colour and face), else the plain names as before, else the marks as before: no head loses the names it shows
  const famHead: PanelPlan["famHead"] = famHead0 && famHead0.names
    && (famHead0.at === "sub" ? explainedW <= area.w - 27 : famHead0.at === "sub2" ? bySub2(explainedW) : byTitle(explainedW))
    ? { ...famHead0, explained: true } : famHead0;
  // SPACE-1 (REQ-BFG-087, D2, D3): the body above is planned exactly as without gaps; its separate items then take a gap
  // each (gapSlots) from the room left: up to G (the body face's GAP), all alike, less where the room is short. The
  // column, sized to its text, is sized with its gaps at G within its area (`o.gaps` false: none, the plan as before)
  const on = o.gaps !== false, G = GAP[body.font];
  const before = gapSlots(body.lines, !!famHead && (famHead.at === "sub" || famHead.at === "sub2"));
  const slots = before.reduce((n, k) => n + k, 0);
  const r = column ? { ...area, h: Math.min(area.h, 27 + shift + body.height + extra + (on ? slots * G : 0)) } : area;
  const y = r.y + 25 + shift - (body.tight ? 1 : 0);
  const maxY = column && labels.length ? r.y + r.h - 5 - btnRows * pitch : r.y + r.h - 4;
  // no body line fits (the header-only 360x640 strip): its header text instead of the sub line, on up to two lines
  const headerOnly = !column && r.y + 25 + shift + 5 > maxY && sp.headerOnly
    ? { lines: headerLines(sp.headerOnly.texts, subMax, r.w - 27), colour: sp.headerOnly.colour } : null;
  const gaps: PanelGaps = { before, slots, px: on && !headerOnly ? slotPx(body.lines, y, maxY, slots, G) : 0, G, min: GAP_MIN[body.font] };
  return { r, column, rects: port?.rects ?? null, shift, subs: body.sub ? [body.sub] : subs, subMax, body, y, maxY, headerOnly, famHead, gaps };
}

/** SPACE-1 (REQ-BFG-087, D4): a plan's gaps are at least `px` (or it has none to show). */
export const gapsAtLeast = (plan: Pick<PanelPlan, "gaps">, px: number): boolean => plan.gaps.slots === 0 || plan.gaps.px >= px;

/** A header-only strip's text: the first of `texts` that fits one line of `first` px, else the fullest that fits two
 *  (the first line beside the buttons, the second under them), else the last on two lines, the second cut. */
export function headerLines(texts: readonly string[], first: number, second: number): string[] {
  for (const t of texts) if (textWidth(t, "3") <= first) return [t];
  for (const t of texts) {
    const a = wrapRich([{ t, c: C.bone }], first, "3").map(lineText);
    const rest = wrapRich([{ t: a.slice(1).join(" "), c: C.bone }], second, "3").map(lineText);
    if (a.length > 1 && rest.length === 1 && textWidth(a[0], "3") <= first) return [a[0], rest[0]];
  }
  const t = texts[texts.length - 1], a = wrapRich([{ t, c: C.bone }], first, "3").map(lineText);
  return [a[0], ...(a.length > 1 ? [a.slice(1).join(" ")] : [])];
}

// -------------------------------------------------------------------------------------------------------- drawing

interface Action {
  id: string;
  label: string;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onTap: () => void;
  /** shoptap (D2): a button a touch panel can do without (TO CARGO: a drag onto the cargo tray does the same): on the
   *  phone band it gives way where keeping it would cut the panel's kept text (detailsPlan). */
  optional?: boolean;
}

interface Spec {
  icon: HTMLCanvasElement | null;
  text: PanelText;
  actions: Action[];
}

/** AZ-PREP (REQ-BFG-077; REVIEW-NPC1 Q4): the SELL buttons a panel can offer: a cargo part's or turret's (sell), a placed
 *  part's on touch (sellpart), a fitted core's or gear's (sellfitted) and an installed turret's (turretsell, turretPanel.ts
 *  slotActions). */
const SELL_ACTIONS: ReadonlySet<string> = new Set(["sell", "sellpart", "sellfitted", "turretsell"]);

/** EXPLAIN-1 (REQ-BFG-089): the piece a selection shows, for its plain face's rig sentence (explainPanel's `def`). */
function shownDef(run: Run, show: Sel): string | undefined {
  switch (show.kind) {
    case "offer": return run.shop.wagons[show.wagon]?.offers[show.slot]?.def;
    case "cargo": return run.inventory.find((i) => i.uid === show.uid)?.def;
    case "item": return itemByUid(run.build, show.uid)?.def;
    case "fitted": return run.build.mods.find((m) => m.uid === show.uid)?.def;
    default: return undefined;
  }
}

/** EXPLAIN-1 (REQ-BFG-089): every drawn panel's text is its default face (explainPanel), once, here. AZ-PREP (REQ-BFG-077;
 *  REVIEW-NPC1 Q4): in REFIT with NPC_DAY on (run.ts shopShut: the caravan has moved on, every sale is refused with
 *  REFIT_NO_SHOP) the panel comes without its SELL buttons, so it offers only what REFIT allows. The layout reads the
 *  buttons (detailsPlan's labels), so it lays out without them. Off, or at the dawn: as before. */
function spec(ctx: Ctx, show: Sel, hovering: boolean): Spec | null {
  const s = baseSpec(ctx, show, hovering);
  if (!s) return null;
  const sp = { ...s, text: explainPanel(s.text, shownDef(ctx.run, show)) };
  const ask = sellLabelFor(ctx, show); // ENCHANT-1 (REQ-BFG-085, E4): the armed SELL button reads SELL? FIERY IS LOST (apply.ts; null otherwise)
  if (ask) sp.actions = sp.actions.map((a) => (SELL_ACTIONS.has(a.id) ? { ...a, label: ask } : a));
  return shopShut(ctx.run) ? { ...sp, actions: sp.actions.filter((a) => !SELL_ACTIONS.has(a.id)) } : sp;
}

function baseSpec(ctx: Ctx, show: Sel, hovering: boolean): Spec | null {
  if (show.kind === "word") return wordSpec(ctx, show); // ENCHANT-1 (REQ-BFG-085, E5): a word card's tap panel (apply.ts; null with the switch off)
  const { run } = ctx;
  const b = run.build;
  const touch = !!ctx.touch; // shoptap (D2): the last press was a finger or a pen
  const tp = turretSpec(ctx, show, hovering); // 0.6.2s (REQ-BFG-031 S10): turret cards and empty turret slots
  if (tp !== undefined) return tp;
  switch (show.kind) {
    case "offer": {
      const t = offerPanel(run, show.wagon, show.slot, touch);
      const o = run.shop.wagons[show.wagon]?.offers[show.slot];
      if (!t || !o) return null;
      const can = !o.sold && run.gold >= o.price;
      return {
        icon: panelIcon(o.def), text: t, // SHAPES-1 (REQ-BFG-086.1): a shaped piece's panel shows its shape
        actions: hovering ? [] : [{
          id: "buy", label: t.labels[0], primary: can, disabled: !can,
          onTap: () => {
            const res = buy(ctx, show.wagon, show.slot);
            if (res.gain) selectGain(ctx, res.gain); // 0.6.1a: after a merge, the survivor
          },
        }],
      };
    }
    case "cargo": {
      const t = cargoPanel(run, show.uid, touch);
      const it = run.inventory.find((i) => i.uid === show.uid);
      if (!t || !it) return null;
      return { icon: panelIcon(it.def), text: t, actions: [{ id: "sell", label: t.labels[0], onTap: () => sell(ctx, it.uid) }] }; // SHAPES-1
    }
    case "item": {
      const p = itemByUid(b, show.uid);
      const t = p ? itemPanel(run, p.uid, touch) : null;
      if (!p || !t) return null;
      const d = defOf(p);
      // bb-0.8.3 (REQ-BFG-043 D11): the hero's own factory: its UPGRADE button only (it never goes to cargo or sells)
      if (!fusible(d.id)) return { icon: itemIcon(d.id), text: t, actions: upgradeAction(ctx, "factory") };
      // shoptap (D2, REQ-BFG-035): on touch a placed part's panel sells it too (a button, never a tap on the part)
      const sellIt: Action[] = touch && t.labels.length ? [{ id: "sellpart", label: t.labels[t.labels.length - 1], onTap: () => sellPlaced(ctx, p.uid) }] : [];
      const actions: Action[] = d.kind === "gate"
        ? [
          ...((t as RigPanel).x ? [] : [{ id: "rotate", label: "ROTATE", onTap: () => rotate(ctx, p.uid) }]),
          { id: "store", label: "TO CARGO", onTap: () => store(ctx, p.uid), ...(touch ? { optional: true } : {}) },
          ...sellIt,
        ]
        : t.labels.length ? [
          // SHAPES-1 (REQ-BFG-086 S2): a shaped factory's ROTATE (its panel's first label)
          ...(shapedPiece(d.id) && canTurn(d.id) ? [{ id: "rotate", label: "ROTATE", onTap: () => rotate(ctx, p.uid) }] : []),
          { id: "store", label: "TO CARGO", onTap: () => store(ctx, p.uid), ...(touch ? { optional: true } : {}) }, ...sellIt,
        ] : [];
      return { icon: panelIcon(d.id), text: t, actions }; // SHAPES-1: a shaped piece's shape picture
    }
    case "fitted": {
      // shoptap (REQ-BFG-035): a turret's core or gear piece, picked by a touch tap on the selected turret
      const t = fittedPanel(run, show.uid);
      const m = b.mods.find((q) => q.uid === show.uid);
      if (!t || !m) return null;
      return {
        icon: itemIcon(m.def), text: t,
        actions: [
          { id: "storefitted", label: t.labels[0], onTap: () => storeFitted(ctx, m.uid), optional: true },
          { id: "sellfitted", label: t.labels[1], onTap: () => sellFitted(ctx, m.uid) },
        ],
      };
    }
    case "route": {
      const t = routePanel(run, show.index);
      if (!t) return null;
      // 0.8.0 H1 M3: a CRUCIBLE belt with a partner at its gun shows the SYNC mark, lit when their blanks fuse
      const sync = syncLine(b, show.index);
      const icon = sync && sync.state !== "alone" ? syncIcon(sync.state === "sync", Math.floor(ctx.game.t * 2) % 2) : beltIcon();
      return { icon, text: t, actions: [{ id: "rmroute", label: "REMOVE BELT", danger: true, onTap: () => deleteRoute(ctx, show.index) }] };
    }
    case "turret": {
      const td = turretSlots(b)[show.index]?.td; // 0.6.2s: the installed turret (an empty slot has none)
      const t = turretPanel(run, show.index, touch);
      if (!td || !t) return null;
      const gm = gearFor(b, show.index); // 0.6.1b: gear only; the core has its own socket (coreFor via resolveCore)
      const tc = resolveCore(b, show.index, td);
      const actions: Action[] = [];
      if (tc.bought) actions.push({ id: "unfitcore", label: "REMOVE CORE", onTap: () => unfitCore(ctx, show.index) });
      if (gm) actions.push({ id: "unfit", label: "REMOVE GEAR", onTap: () => unfitMod(ctx, show.index) });
      // 0.6.2s (S10): the installed turret's icon; TO CARGO and SELL after the socket buttons. bb-0.8.3 (REQ-BFG-043 D11):
      // a starting turret (it holds the free copy) leads with its TURRET SPEED UPGRADE button
      const up = turretSlots(b)[show.index]?.turret?.free ? upgradeAction(ctx, "turret") : [];
      return { icon: slotIcon(b, show.index), text: t, actions: [...up, ...actions, ...slotActions(ctx, show.index)] };
    }
    default:
      return null;
  }
}

/** True when a hovered card or a selection has details to show (otherwise the idle cards). */
export function hasDetails(ctx: Ctx, sel: Sel, hover: { wagon: number; slot: number } | null): boolean {
  const show: Sel = hover ? { kind: "offer", wagon: hover.wagon, slot: hover.slot } : sel;
  return spec(ctx, show, !!hover) !== null;
}

/** Draw a body line at (x, y): a stat label and its value, a grid row, or rich spans. SCOUT-1: exported (the battle's
 *  faces). */
export function drawLine(g: G, l: PLine, x: number, y: number): void {
  if (l.cells) {
    for (const c of l.cells) {
      drawText(g, c.label, x + c.at, y, LABEL, { font: l.font });
      drawRich(g, c.spans, x + c.vx, y, l.font);
    }
    return;
  }
  if (l.label) drawText(g, l.label, x, y, LABEL, { font: l.font });
  drawRich(g, l.spans, x + (l.indent ?? 0), y, l.font);
}

/** 0.8.0 I1 M4 (REQ-BFG-023 part 2): the families of the module a selection shows (an offer, a part in cargo, a placed
 *  rig or factory, an installed turret); [] for anything else (a belt, an empty slot) and for a part with no family (a
 *  generalist, a supply, a hero's signature). */
export function selFamilies(run: Run, show: Sel): ModuleTag[] {
  switch (show.kind) {
    case "offer": return familiesOf(run.shop.wagons[show.wagon]?.offers[show.slot]?.def ?? "");
    case "cargo": return familiesOf(run.inventory.find((i) => i.uid === show.uid)?.def ?? "");
    case "item": return familiesOf(itemByUid(run.build, show.uid)?.def ?? "");
    case "turret": return familiesOf(turretSlots(run.build)[show.index]?.turret?.def ?? "");
    case "fitted": return familiesOf(run.build.mods.find((m) => m.uid === show.uid)?.def ?? ""); // shoptap
    default: return [];
  }
}

/** 0.8.0 I1 M4: what drawDetails shows for `sel` (or the hovered offer) in `area`: its spec, its text with the action
 *  labels, and the panel's plan with the shown module's families in its header (selFamilies); null for the idle panel.
 *  Exported for the tests. */
export function detailsPlan(ctx: Ctx, sel: Sel, hover: { wagon: number; slot: number } | null, area: Rect,
  o: { gaps?: boolean } = {}): { show: Sel; sp: Spec; t: PanelText; plan: PanelPlan; hint: string | null } | null {
  const show: Sel = hover ? { kind: "offer", wagon: hover.wagon, slot: hover.slot } : sel;
  const sp = spec(ctx, show, !!hover);
  if (!sp) return null;
  const t: PanelText = { ...sp.text, labels: sp.actions.map((a) => a.label) };
  // CARD-3 (REQ-BFG-080, REQ-BFG-004, C; EXPLAIN-1 open item 3): on a portrait band a how-to hint (its tip new) no longer
  // grows the panel: the panel is planned without it, so it is sized as with its tip done, and drawDetails draws the hint
  // in a strip by the panel (hintStrip; CARD-4 S: just under it). The hint keeps its words, its once-only rule and its store (tips.ts);
  // `t` keeps it (NOTES, KEYWORDS, the tests' face). The landscape column keeps it as its last item, as before
  const hint = ctx.L?.portrait ? t.body.find((b) => b.role === "hint")?.text ?? null : null;
  const r = detailsPlanOf(ctx, show, sp, t, area, o, hint);
  return r && { ...r, hint };
}

/** CARD-3 (C): a panel's text without its how-to hint (the body and every variant; a variant that shared the body's
 *  blocks shares the new body, as explainPanel keeps them, so planBody's fullBody reads the same). */
function withoutHint(t: PanelText): PanelText {
  const cut = new Map<readonly Block[], Block[]>();
  const f = (bs: readonly Block[]): Block[] => {
    let out = cut.get(bs);
    if (!out) cut.set(bs, (out = bs.filter((b) => b.role !== "hint")));
    return out;
  };
  return { ...t, body: f(t.body), ...(t.variants ? { variants: t.variants.map((v) => ({ ...v, body: f(v.body) })) } : {}) };
}

/** detailsPlan's plan of `t` in `area` (CARD-3, C: without the hint where `hint` is set). */
function detailsPlanOf(ctx: Ctx, show: Sel, sp: Spec, t: PanelText, area: Rect, o: { gaps?: boolean }, hint: string | null): { show: Sel; sp: Spec; t: PanelText; plan: PanelPlan } {
  const planned = (x: PanelText): PanelText => (hint ? withoutHint(x) : x);
  // 0.8.0 I1 M4: the families in its header; shoptap (D5): on touch, a finger's button height; shoptap2: a portrait
  // screen's panel keeps the band's layout however tall a finger's panel grows (layout.ts panelArea). SPACE-1: `o.gaps`
  // false plans it without the gaps (tests: the content is the same either way)
  const fams = selFamilies(ctx.run, show), tap = touchTap(ctx), band = !!ctx.L?.portrait, gaps = o.gaps !== false;
  // CARD-3 (REQ-BFG-080, B's lever 3): a finger's panel on a phone's band itself (panelArea's L.info, by its rect: the
  // tests and BuildScreen pass the same rect) may stay in the band in 3x5 (planPanel's `inBand`)
  const I = ctx.L?.info, onPhone = !!ctx.L?.phone && tap > 0 && !!I, inBand = onPhone && area.x === I.x && area.y === I.y && area.w === I.w && area.h === I.h;
  // PRESENT-2 F (REQ-BFG-081; PRESENT-1 Question 4 (d) (ii)): a panel grown UP from the band (the same x, width and foot, taller: layout.ts panelRect "up") for a
  // definition keeps the face the band gave it where the band shows the panel's whole text in the 3x5 face (the fit it had before any note): only the note grows it, not
  // a switch to the 5x7 face (539 of 2,429 grown notes on 402x690 with a rune took the body from 3x5 to 5x7 and 30-42 px of growth for it). Any other panel: as before
  const grownUp = onPhone && !inBand && area.x === I!.x && area.w === I!.w && area.y + area.h === I!.y + I!.h && area.h > I!.h;
  let small = false;
  if (grownUp) {
    const bp = planPanel(planned(t), I!, fams, { tap, band, gaps: true, inBand: true }); // with the gaps ON whatever `gaps` asks: SPACE-1's content first (the gaps never change what a plan shows)
    small = bp.body.font === "3" && fullText(bp) && gapsAtLeast(bp, bp.gaps.min);
  }
  const plan = planPanel(planned(t), area, fams, { tap, band, gaps, inBand, small });
  // shoptap (D2): on the phone band a touch panel's optional button (TO CARGO) gives way where keeping it would cut the
  // panel's kept text (the extra button pushes the row under the sub line); its kept text always shows whole
  if (tap && !plan.column && !keptWhole(plan) && sp.actions.some((a) => a.optional)) {
    const lean: Spec = { ...sp, actions: sp.actions.filter((a) => !a.optional) };
    const lt: PanelText = { ...sp.text, labels: lean.actions.map((a) => a.label) };
    const lp = planPanel(planned(lt), area, fams, { tap, band, gaps, inBand, small });
    if (keptWhole(lp)) return { show, sp: lean, t: lt, plan: lp };
  }
  return { show, sp, t, plan };
}

/** CARD-3 (REQ-BFG-080, REQ-BFG-004, C): a band panel's how-to hint strip by its panel `r`: the hint's words in 3x5 in
 *  the hint's colour, wrapped to the panel's text width, in a frame as wide as the panel, on a screen `H` tall. Pure
 *  (drawDetails, keywords.ts's box, tests). CARD-4 (REQ-BFG-087, S; READ-4 F steps 7-16): just UNDER the panel, on the deck
 *  side (above it, the strip covered the shop's last row: REROLL, a pack, two cards' prices), where the screen holds it;
 *  else just above it, as before. */
export function hintStrip(text: string, r: Rect, H?: number): { lines: Span[][]; r: Rect } {
  const lines = wrapRich([{ t: text, c: ROLE.hint.colour }], r.w - 10, "3");
  const h = 2 + 7 * lines.length;
  const under = r.y + r.h, room = H ?? under + h + 2;
  const y = under + h <= room - 2 ? under : r.y - h >= 2 ? r.y - h : Math.max(2, Math.min(room - h, under));
  return { lines, r: { x: r.x, y, w: r.w, h } };
}

/** CARD-3 (C): draw a hint strip (hintStrip): an ink frame, night inside, the lines from 2 px under its top edge. */
function drawHintStrip(g: G, s: ReturnType<typeof hintStrip>): void {
  rect(g, s.r.x, s.r.y, s.r.w, s.r.h, C.ink);
  rect(g, s.r.x + 1, s.r.y + 1, s.r.w - 2, s.r.h - 2, C.night);
  s.lines.forEach((ln, i) => drawRich(g, ln, s.r.x + 5, s.r.y + 2 + i * 7, "3"));
}

/**
 * SPACE-1 (REQ-BFG-087, D4): how the build screen tests a rect `r` for the details panel of `sel` (BuildScreen.panelArea,
 * layout.ts panelArea; the tests use this one function too): null, no panel. On a phone's layout (`phone`), its full
 * description (fullText, zoom's D3) with its gaps at least GAP_MIN in the band (`at` "band": else it grows over the shop
 * rows), and at GAP while it grows (`at` "grown": it stops at the first height that shows them, or at panelArea's limit).
 * Elsewhere its kept text (keptWhole), as before: its gaps take the room it gets.
 * PRESENT-1 (REQ-BFG-081; S4 (b), cap's ruling af2c96863a44ab41): on touch, a panel that is about to show a definition (a tap's
 * or a first sight's: keywords.ts definitionAhead) also counts the note: it fits only where the note's box sits clear of
 * every rule row of the panel (rulesCovered), and, while the first-sight chain is under way, is no shorter than the chain
 * has made it (`hold`). With no note to show, the fit is exactly what it was.
 */
export function panelFit(ctx: Ctx, sel: Sel, phone: boolean): (r: Rect, at?: "band" | "grown") => boolean | null {
  return (r, at = "band") => {
    const d = detailsPlan(ctx, sel, null, r);
    if (!d) return null;
    const whole = phone ? fullText(d.plan) && gapsAtLeast(d.plan, at === "band" ? d.plan.gaps.min : d.plan.gaps.G) : keptWhole(d.plan);
    return whole && noteClear(ctx, d, r);
  };
}

/** PRESENT-1 (S4 (b)): the roles whose rows are a panel's rules: a shown definition may cover a panel's flavour, hint,
 *  reminder or caveat row (the ruling), never one of these. */
const RULE_ROLES: ReadonlySet<Role> = new Set<Role>(["ability", "hits", "warn", "next", "merges", "merge", "row", "grid", "note"]);

/**
 * PRESENT-1 (REQ-BFG-081; S4 (b)): the rule rows of a panel's drawn `lines` (visibleLines) that box `box` covers, each with
 * `clear` px (default 1) to spare between the row's glyphs and the box's edge: [] where the note sits clear of the rules.
 * Pure (panelFit, the tests).
 */
export function rulesCovered(box: Rect, lines: readonly { line: PLine | "rule"; y: number }[], clear = 1): PLine[] {
  const out: PLine[] = [];
  for (const v of lines) {
    if (v.line === "rule" || !RULE_ROLES.has(v.line.block.role)) continue;
    const bottom = v.y + (v.line.font === "5" ? 7 : 5);
    if (v.y - clear < box.y + box.h && box.y < bottom + clear) out.push(v.line);
  }
  return out;
}

/**
 * PRESENT-2 L (REQ-BFG-081; cap's call on PRESENT-1's Question 4 (d) (i) and cap's ruling 0d0ef2465804aafb): for a finger's panel that
 * already fills the growth limit (its top at the top bar: layout.ts panelArea's `most`), where the note cannot be made clear by growing the
 * panel, what keywords.ts hangPlace needs to put the note just under the lowest rule row: that row's end, a box's covering a rule row, the
 * carrier's pad (a note over it is counted) and what a note NEVER covers (the deck's cells, FIGHT, the cargo bar, the top bar). undefined for
 * every other panel (the desk, the landscape column, a panel still below its limit): their notes are placed exactly as before.
 */
function noteHang(ctx: Ctx, plan: PanelPlan, lines: readonly { line: PLine | "rule"; y: number }[]): NoteHang | undefined {
  const L = ctx.L;
  if (!touchTap(ctx) || !L?.portrait || !L.bar || plan.r.y > L.bar.y + L.bar.h + 1) return undefined;
  let ruleEnd = 0;
  for (const v of lines) if (v.line !== "rule" && RULE_ROLES.has(v.line.block.role)) ruleEnd = Math.max(ruleEnd, v.y + (v.line.font === "5" ? 7 : 5));
  if (!ruleEnd) return undefined;
  const deck = L.frame ? screenRect(L, { x: L.frame.dx, y: L.frame.dy, w: DECK, h: DECK }) : null;
  return { ruleEnd, covers: (b) => rulesCovered(b, lines).length > 0, pad: L.pad ?? null, hard: [deck, L.fight, L.cargo, L.bar].filter((q): q is Rect => !!q) };
}

/**
 * PRESENT-2 P (cap's ruling 26addce8293da756): for a panel in the landscape COLUMN, what keywords.ts columnPlace needs to keep a shown definition off the rule rows: a box's covering a rule row, the
 * column's top and the y its area ends, the free strip beside the column (2 px right of its edge to 2 px left of the carrier's DRAWING: layout.ts carrierBox, the widest the ship is ever drawn),
 * the screen's foot less 2 px, and what a note never covers. undefined for every other panel (the portrait band, the desk's hover tips): their notes are placed as before.
 */
function columnSpec(ctx: Ctx, plan: PanelPlan, lines: readonly { line: PLine | "rule"; y: number }[]): ColumnSpec | undefined {
  const L = ctx.L;
  if (!plan.column || !L || L.portrait || !L.info || !L.cam || !L.bar) return undefined;
  const cb = carrierBox(false), carrier = screenRect(L, { x: L.cam.x + cb.x0, y: L.cam.y + cb.y0, w: cb.w, h: cb.h });
  const x0 = L.info.x + L.info.w + 2, x1 = carrier.x - 2;
  return {
    covers: (b) => rulesCovered(b, lines).length > 0,
    top: L.info.y, areaBottom: L.info.y + L.info.h,
    beside: x1 > x0 ? { x0, x1 } : null,
    floor: (ctx.game?.H ?? Infinity) - 2,
    hard: [carrier, ...(L.cards ?? []), L.reroll, ...(L.packs ?? []), L.bar, L.fight, L.foe, L.cargo, plan.r].filter((q): q is Rect => !!q),
  };
}

/**
 * PRESENT-1 (S4 (b)): panelFit's note clause for the plan `d` of a panel in rect `r`: true where no definition is about to
 * show (the fit as it was), else where the box the layer will draw (keywords.ts definitionAhead: the same words, targets and
 * placement) fits defBoxPlace's rules and covers no rule row, and `r` is at least as tall as this open's chain has held it.
 */
function noteClear(ctx: Ctx, d: NonNullable<ReturnType<typeof detailsPlan>>, r: Rect): boolean {
  const tap = touchTap(ctx);
  if (!tap) return true;
  const plan = d.plan, lines = visibleLines(plan);
  const buttons = plan.column ? columnButtons(d.t.labels.length, plan.r, tap) : (plan.rects ?? []).map((b) => tapRect(b, tap, plan.r));
  const strip = d.hint ? hintStrip(d.hint, plan.r, ctx.game?.H).r : null;
  const a = definitionAhead(ctx, ctx.run, { show: d.show, t: d.t, plan, strip, hang: noteHang(ctx, plan, lines) }, lines, buttons, tap,
    ctx.game?.W ? { W: ctx.game.W, H: ctx.game.H } : undefined, ctx.run.stage === "caravan");
  return r.h >= a.hold && (!a.box || (a.fits && rulesCovered(a.box, lines).length === 0));
}

/** shoptap (D2): a plan's kept blocks fit and every one of their lines is drawn (T6's phone guarantee). */
export function keptWhole(plan: PanelPlan): boolean {
  const drawn = new Set(visibleLines(plan).map((v) => v.line));
  return plan.body.fits && plan.body.shown.filter((l) => l.b.keep).every((l) => l.lines.every((ln) => drawn.has(ln)));
}

/** zoom (REQ-BFG-040, D3): a plan shows its panel's full description: its kept text whole (keptWhole), the full body's
 *  text (variant 0, or the same blocks at the tight pitch), every rule sentence (no ability sentence given way) and no
 *  header-only strip. Its flavour and its hint may give way. */
export function fullText(plan: PanelPlan): boolean {
  return keptWhole(plan) && !plan.headerOnly && plan.body.fullBody && !plan.body.dropped.some((b) => b.role === "ability");
}

/** zoom: the plan in its fullest form: variant 0, every block of it shown (fullText, and neither the flavour nor the
 *  hint given way). Tooling and tests. */
export function fullest(plan: PanelPlan): boolean {
  return fullText(plan) && plan.body.variant === 0 && plan.body.dropped.length === 0;
}

/** shoptap (D5): on touch, a TAP_CSS target's height in the build screen's logical px; 0 for a mouse. */
function touchTap(ctx: Ctx): number {
  return ctx.touch ? tapPx(ctx.game.view) : 0;
}

/** shoptap2: the parts of a panel `r` grown past `band` (above it and below it). Pure (tests). */
export function overhang(r: Rect, band: Rect): Rect[] {
  const top = Math.min(r.y + r.h, band.y) - r.y, bot = r.y + r.h - Math.max(r.y, band.y + band.h);
  return [
    ...(top > 0 ? [{ x: r.x, y: r.y, w: r.w, h: top }] : []),
    ...(bot > 0 ? [{ x: r.x, y: r.y + r.h - bot, w: r.w, h: bot }] : []),
  ];
}

/** Draw the details panel for `sel` (or the hovered offer) in `area`, else the idle panel. shoptap2: `through`, a finger's
 *  panel grown past the band (layout.ts panelArea): over the band it takes a press as the band always did; over what it
 *  covers (the bow, the shop) a press goes on to the build screen (`through.press`), as if the panel weren't there, so a
 *  tap there reads what is under it and a drag lifts it; its buttons, registered after, still take theirs. */
export function drawDetails(g: G, ctx: Ctx, sel: Sel, hover: { wagon: number; slot: number } | null, area: Rect, foe: DuskFoe, note: string | null = null,
  through?: { band: Rect; press: (x: number, y: number) => void }): void {
  keywordCursorOff(ctx.game?.canvas); // U2c: the desk's help cursor goes until a word is hovered again
  if (area.h < 14) return;
  // zoom (REQ-BFG-040): a portrait band is never the landscape column, however tall a phone's band is (before the zoom
  // a portrait area was always under 70 px)
  const column = !ctx.L?.portrait && area.h >= 70;
  const d = detailsPlan(ctx, sel, hover, area);
  const pid = skinOf(ctx.skin).panel; // CUSTOM-2a (REQ-BFG-072): the player's panel style (ctx.skin, set by the build screen)
  if (!d) {
    keywordsIdle(ctx); // CARD-2 (REQ-BFG-004, K1): the panel closed: its next draw is a new open
    return drawIdle(g, ctx.run, area, column, foe, note, pid);
  }
  const { sp, t, plan } = d;
  const r = plan.r;
  statsPanel(g, r, pid); // CUSTOM-1 hook (REQ-BFG-072): the part panel
  ctx.game.ui.add({ id: "details", r, block: true });
  if (through) for (const q of overhang(r, through.band)) ctx.game.ui.add({ id: "details-over", r: q, onDown: through.press });
  rect(g, r.x + 4, r.y + 4, 16, 16, C.ink);
  rect(g, r.x + 5, r.y + 5, 14, 14, C.slate0);
  if (sp.icon) g.drawImage(sp.icon, r.x + 12 - Math.floor(sp.icon.width / 2), r.y + 12 - Math.floor(sp.icon.height / 2));
  const acts = sp.actions;
  const tap = touchTap(ctx); // shoptap (D5): on touch, every button is a finger's target (TAP_CSS CSS px tall)
  const hits: Rect[] = []; // U2c: the buttons' hit rects (the keyword targets and `?` keep clear of them)
  if (acts.length && plan.column) {
    // landscape column: one full-width button per action, stacked bottom-up under the text (shoptap: on touch, each
    // drawn as tall as its target, two to a row; columnButtons)
    columnButtons(acts.length, r, tap).forEach((q, i) => {
      const a = acts[i];
      button(ctx.game.ui, g, a.id, q, a.label, { font: "3", primary: a.primary, danger: a.danger, disabled: a.disabled, onTap: a.onTap });
      hits.push(q);
    });
  } else if (plan.rects) {
    // shoptap (D5): the portrait band's buttons keep their size (the band keeps its text); on touch each one's target
    // grows to TAP_CSS CSS px tall inside the panel (side by side, the targets never meet)
    acts.forEach((a, i) => button(ctx.game.ui, g, a.id, plan.rects![i], a.label, {
      font: "3", primary: a.primary, danger: a.danger, disabled: a.disabled, onTap: a.onTap, ...(tap ? { hit: tapRect(plan.rects![i], tap, r) } : {}),
    }));
    acts.forEach((_, i) => hits.push(tap ? tapRect(plan.rects![i], tap, r) : plan.rects![i]));
  }
  fitTitle(g, t, r.x + 23, r.y + 4, plan.subMax); // ENCHANT-1 (REQ-BFG-085, E7): fitHead(t.title, t.color) for a plain piece; an enchanted piece's word in its own colour
  const subColor = t.subColor ?? C.slate4;
  if (plan.headerOnly) {
    // the header-only strip (360x640): the header text in place of the sub line (a belt's readout; an offer's effect)
    plan.headerOnly.lines.forEach((ln, i) => {
      const max = i === 0 ? plan.subMax : r.w - 27;
      if (textWidth(ln, "3") <= max) drawRich(g, colourize(ln, plan.headerOnly!.colour), r.x + 23, r.y + 13 + i * 6, "3");
      else fitHead(g, ln, r.x + 23, r.y + 13 + i * 6, max, plan.headerOnly!.colour, false);
    });
  } else if (plan.body.sub) {
    // T6: a compact variant's own sub line (a rig's hits, or its IDLE warning in amber)
    fitHead(g, plan.body.sub, r.x + 23, r.y + 13, plan.subMax, plan.body.subColor ?? subColor, false);
  } else if (plan.subs.length > 1) {
    plan.subs.forEach((s, i) => fitHead(g, s, r.x + 23, r.y + 13 + i * 6, plan.subMax, subColor, false));
  } else {
    fitHead(g, t.subShort && textWidth(t.sub, "3") > plan.subMax ? t.subShort : t.sub, r.x + 23, r.y + 13, plan.subMax, subColor, false);
  }
  drawFamHead(g, plan); // 0.8.0 I1 M4 (REQ-BFG-023 part 2): the module's families in its header
  const shown = visibleLines(plan);
  for (const v of shown) {
    if (v.line === "rule") rect(g, r.x + 5, v.y + 1, r.w - 10, 1, C.slate1);
    else drawLine(g, v.line, r.x + 5, v.y);
  }
  // CARD-3 (REQ-BFG-080, REQ-BFG-004, C): a band panel's how-to hint (its tip new), outside the panel's plan (CARD-4, S:
  // just under it). CARD-4 (K, D): the keyword layer keeps a shown note's box clear of it
  const strip = d.hint ? hintStrip(d.hint, r, ctx.game?.H) : null;
  // PRESENT-2 L (cap's ruling 0d0ef2465804aafb): at the growth limit a note that hangs under the last rule row can land where the strip is:
  // the strip is not drawn while it shows, from the note's first frame (its place is worked out here, before the layer runs, as panelFit does);
  // it is back in the frame the note closes. Its tip stays new: only the action completes it (tips.ts)
  const hang = noteHang(ctx, plan, shown);
  const yields = !!strip && !!hang && !!definitionAhead(ctx, ctx.run, { show: d.show, t: d.t, plan, strip: strip.r, hang }, shown, hits, tap,
    ctx.game?.W ? { W: ctx.game.W, H: ctx.game.H } : undefined, ctx.run.stage === "caravan").place?.yieldsStrip;
  if (strip && !yields) drawHintStrip(g, strip);
  // U2c (REQ-BFG-045, REQ-BFG-046): tap to explain (keywords.ts): the words' underlines and targets, the `?` button, the
  // shown definition or the KEYWORDS view, the desk's hover tooltip
  // U2f (REQ-BFG-070): the ⓘ view may grow past the panel (infoFree: above it on the phone, down the column on the desk)
  // EXPLAIN-1 (REQ-BFG-089, E3): the screen's size, so the icon's hover tooltip stays on it
  // CARD-2 (REQ-BFG-004, K1): the build screen asks for the first-sight notes in its caravan only (never in a refit, the
  // build screen between a fight's rounds; a fight's own faces never come here)
  drawKeywordLayer(g, ctx, ctx.game.ui, ctx.run, { ...d, strip: strip?.r ?? null, hang, column: columnSpec(ctx, plan, shown) }, shown, hits, tap, ctx.game?.canvas, infoFree(ctx.L, r, plan.column),
    ctx.game?.W ? { W: ctx.game.W, H: ctx.game.H } : undefined, ctx.run.stage === "caravan");
}

/** 0.8.0 I1 M4 (REQ-BFG-023 part 2): draw plan.famHead, the shown module's families in the panel's header: each name in
 *  its family's colour (the commas slate4) under the sub line at (x+23, y+19), or right-aligned 4 px in from the panel's
 *  right edge on the sub line's second row (y+19) or the title row (y+5); where the names don't fit, their 3x3 marks
 *  (the card's own, 4 px apart): under the sub line at (x+23, y+20), or right-aligned on those rows (y+20 or y+6).
 *  Nothing without a famHead. Exported for the tests. */
export function drawFamHead(g: G, plan: Pick<PanelPlan, "r" | "famHead">): void {
  const fh = plan.famHead, r = plan.r;
  if (!fh) return;
  if (fh.names) {
    const spans = famHeadSpans(fh.tags, C.slate4, !!fh.explained); // CARD-3 (REQ-BFG-107): the player's tags; PRESENT-2 W (b): `FORGE FAMILY`, `FAMILIES: FORGE, TEMPO` where the explained words fit
    if (fh.at === "sub") drawRich(g, spans, r.x + 23, r.y + 19, "3");
    else drawRich(g, spans, r.x + r.w - 4 - lineWidth(spans, "3"), r.y + (fh.at === "sub2" ? 19 : 5), "3");
    return;
  }
  const x0 = fh.at === "sub" ? r.x + 23 : r.x + r.w - 4 - (fh.tags.length * 4 - 1), y0 = r.y + (fh.at === "title" ? 6 : 20);
  fh.tags.forEach((tag, i) => drawFamilyMark(g, tag, x0 + i * 4, y0));
}

/** The body lines drawDetails draws and their y: every line whose glyphs end by the panel's last y (a line past it is a
 *  phone cut, which planBody avoids; the tests check that every kept line is here). Exported for tests. */
export function visibleLines(plan: Pick<PanelPlan, "y" | "maxY" | "body"> & Partial<Pick<PanelPlan, "gaps">>): { line: PLine | "rule"; y: number }[] {
  const out: { line: PLine | "rule"; y: number }[] = [];
  let y = plan.y;
  for (const [i, l] of plan.body.lines.entries()) {
    y += (plan.gaps?.before[i] ?? 0) * (plan.gaps?.px ?? 0); // SPACE-1 (REQ-BFG-087): the gap before a separate item
    if (l === "rule") {
      if (y + 1 <= plan.maxY) out.push({ line: l, y });
      y += DIVIDER;
      continue;
    }
    if (y + (l.font === "5" ? 7 : 5) > plan.maxY) break;
    out.push({ line: l, y });
    y += l.pitch;
  }
  return out;
}

function drawIdle(g: G, run: Run, area: Rect, column: boolean, foe: DuskFoe, note: string | null = null, pid: PanelId = "slate"): void {
  const h = HEROES[run.hero];
  const b = run.build;
  const used = beltUsed(b), cap = b.beltCap;
  if (!column && area.h < 30) {
    statsPanel(g, area, pid); // CUSTOM-1 hook (REQ-BFG-072)
    drawText(g, "NEXT", area.x + 5, area.y + 5, C.slate4, { font: "3" });
    // 0.7.0a: online, until tonight's ghost is stored, the line says so instead of naming a foe
    const searching = note === FINDING_GHOST;
    const nw = drawText(g, searching ? note : foe.name, area.x + 24, area.y + 4, searching ? C.slate4 : C.red, { outline: C.ink });
    drawText(g, `${searching ? "" : `${foeClass(foe)} · `}BELT ${used}/${cap} · W-L ${record(run)}`, area.x + 5, area.y + 14, C.bone, { font: "3" });
    // RETUNE-1 run 2 (REQ-BFG-096): the strip's NEXT row carries the hearts at stake on a hearts run, where they fit
    const st = duskStakes(run);
    if (st) foeStakes(g, st, area, area.y + 5, area.x + 24 + nw);
    return;
  }
  if (!column) return drawHeroStrip(g, run, area, pid);
  // landscape column: the stats in the 5x7 face when they fit (RUN split into RUN and LIVES)
  const big: [string, string, string][] = [
    ["HULL", heroHullText(run), C.white],
    ["BELT", `${used}/${cap} TILES`, used >= cap ? C.amber : C.white],
    ["FEEDS", `${connectedRouteCount(b)}/${intakeCount(b)} INTAKES`, connectedRouteCount(b) ? C.lime : C.red],
    ["RUN", `W-L ${record(run)}`, C.white],
    // RETUNE-1 run 2 (REQ-BFG-096): HEARTS n/10 on a hearts run (the label column widens to hold it); else as before
    heartsRun(run) ? ["HEARTS", `${run.lives}/${livesCap(run)}`, C.white] : ["LIVES", `${run.lives}/${START_LIVES}`, C.white],
  ];
  const kw = Math.max(textWidth("FEEDS"), ...big.map(([k]) => textWidth(k))) + 6;
  if (big.every(([, v]) => 10 + kw + textWidth(v) <= area.w) && 31 + big.length * 10 <= area.h) {
    const r = { ...area, h: 31 + big.length * 10 };
    statsPanel(g, r, pid); // CUSTOM-1 hook (REQ-BFG-072)
    drawText(g, h.name, r.x + 5, r.y + 5, C.white, { outline: C.ink });
    drawText(g, h.factionName, r.x + r.w - 5, r.y + 6, C.slate4, { font: "3", align: "right" });
    drawText(g, `PLAYSTYLE: ${heroPlaystyle(h.id)}`, r.x + 5, r.y + 16, C.yellow, { font: "3" });
    let y = r.y + 27;
    for (const [k, v, c] of big) {
      drawText(g, k, r.x + 5, y, C.slate4);
      drawText(g, v, r.x + 5 + kw, y, c);
      y += 10;
    }
    return;
  }
  const rows: [string, string, string][] = [
    ["HULL", heroHullText(run), C.white],
    ["BELT", `${used}/${cap} TILES`, used >= cap ? C.amber : C.white],
    ["FEEDS", `${connectedRouteCount(b)}/${intakeCount(b)} INTAKES`, connectedRouteCount(b) ? C.lime : C.red],
    ["RUN", `W-L ${record(run)} · ${livesOf(run)}`, C.white], // RETUNE-1 run 2: "n/10 HEARTS" on a hearts run
  ];
  const r = column ? { ...area, h: Math.min(area.h, 29 + rows.length * 8) } : area;
  statsPanel(g, r, pid); // CUSTOM-1 hook (REQ-BFG-072)
  let y = r.y + 5;
  drawText(g, h.name, r.x + 5, y, C.white, { outline: C.ink });
  drawText(g, h.factionName, r.x + r.w - 5, y + 1, C.slate4, { font: "3", align: "right" });
  y += 11;
  drawText(g, `PLAYSTYLE: ${heroPlaystyle(h.id)}`, r.x + 5, y, C.yellow, { font: "3" });
  y += 9;
  for (const [k, v, c] of rows) {
    if (y + 7 > r.y + r.h - 2) break;
    drawText(g, k, r.x + 5, y, C.slate4, { font: "3" });
    drawText(g, v, r.x + 34, y, c, { font: "3" });
    y += 8;
  }
}

/** Portrait hero card (strip): name and faction, playstyle, then HULL · BELT · FEEDS and RUN rows. */
function drawHeroStrip(g: G, run: Run, r: Rect, pid: PanelId = "slate"): void {
  const h = HEROES[run.hero];
  const b = run.build;
  const used = beltUsed(b), cap = b.beltCap;
  const feeds = connectedRouteCount(b), intakes = intakeCount(b);
  statsPanel(g, r, pid); // CUSTOM-1 hook (REQ-BFG-072)
  let y = r.y + 5;
  drawText(g, h.name, r.x + 5, y, C.white, { outline: C.ink });
  drawText(g, h.factionName, r.x + r.w - 5, y + 1, C.slate4, { font: "3", align: "right" });
  y += 11;
  // ZOOM-1 (REQ-BFG-080): a compact card (24-29 px: drawHeroCard) skips the playstyle line; from 30 px, as before
  if (r.h >= 30) {
    drawText(g, `PLAYSTYLE: ${heroPlaystyle(h.id)}`, r.x + 5, y, C.yellow, { font: "3" });
    y += 9;
  }
  const stats: [string, string, string][] = [
    ["HULL", heroHullText(run), C.white],
    ["BELT", `${used}/${cap}`, used >= cap ? C.amber : C.white],
    ["FEEDS", `${feeds}/${intakes}`, feeds ? C.lime : C.red],
  ];
  let x = r.x + 5;
  for (const [k, v, c] of stats) {
    x += drawText(g, k, x, y, C.slate4, { font: "3" }) + 3;
    x += drawText(g, v, x, y, c, { font: "3" }) + 8;
  }
  y += 8;
  if (y + 5 <= r.y + r.h - 3) {
    const x2 = r.x + 5 + drawText(g, "RUN", r.x + 5, y, C.slate4, { font: "3" }) + 3;
    drawText(g, `W-L ${record(run)} · ${livesOf(run)}`, x2, y, C.white, { font: "3" }); // RETUNE-1 run 2: HEARTS on a hearts run
  }
}

/** HULL-1a (REQ-BFG-079): the hero card's HULL (every form: the landscape column, its rows, the portrait strip): base +
 *  hullBonus, the day's number with HULL_SCALE on (hullShown); off, 0.9.7's. */
export const heroHullText = (run: Pick<Run, "hero" | "build" | "day">): string =>
  String(hullShown(HEROES[run.hero].hull + run.build.hullBonus, run.day));

/** ZOOM-1 (REQ-BFG-080, call 5): the idle hero card alone, in its compact form where it is 24-29 px tall (chrome.ts: a
 *  phone's band sized for 90% of the panels; from 30 px drawDetails' idle path draws it, as before). */
export function drawHeroCard(g: G, ctx: Ctx, r: Rect): void {
  drawHeroStrip(g, ctx.run, r, skinOf(ctx.skin).panel);
}

/** The opponent's hero and hull (a ghost's hull includes its own plating). HULL-1a (REQ-BFG-079): on the fight's day (the
 *  day's number with HULL_SCALE on). */
export function foeClass(foe: DuskFoe): string {
  const h = HEROES[foe.hero];
  return `${h.name} · HULL ${hullShown(h.hull + foe.build.hullBonus, foe.day)}`;
}

/** Next-battle card (tonight's dusk opponent): beside FIGHT in landscape (3 rows); a 2-row strip
 *  in portrait. A pool ghost reads "GHOST · <HERO> · <W>-<L>", a stand-in its warlord name.
 *  0.7.0a step 6 (online only; `note` null offline, 0.6.2's card): the head line names the source in small text, ONLINE
 *  GHOST or OFFLINE STAND-IN; until tonight's ghost is stored the card says FINDING A GHOST... and names no foe. */
export function drawFoe(g: G, foe: DuskFoe, r: Rect, note: string | null = null, stakes: DuskStakes | null = null): FoeSaves | null {
  panel(g, r, "dark");
  if (note === FINDING_GHOST) {
    const head = r.h < 32 ? "NEXT BATTLE" : "NEXT BATTLE · DUSK";
    drawText(g, head, r.x + 5, r.y + 5, C.slate4, { font: "3" });
    drawText(g, note, r.x + 5, r.y + 13, C.slate4, { outline: C.ink });
    return stakes ? foeStakes(g, stakes, r, r.y + 5, r.x + 5 + textWidth(head, "3")) : null; // RETUNE-1 run 2: the hearts at stake
  }
  const head0 = foe.kind === "ghost" ? "NEXT BATTLE · DUSK GHOST" : "NEXT BATTLE · DUSK";
  // 0.6.0b: a stand-in is a rival captain: its portrait, its name and a STAND-IN tag
  const rival = foe.kind === "standin" ? foe.rival : undefined;
  const ps = r.h >= 32 ? 24 : 16;
  if (rival) drawPortrait(g, rival, r.x + 5, r.y + Math.round((r.h - ps) / 2), ps);
  const x0 = rival ? r.x + 5 + ps + 5 : r.x + 5;
  const room = r.x + r.w - 5 - x0 - (r.h < 32 ? textWidth(foeClass(foe), "3") + 6 : 0);
  const fits = (s: string) => textWidth(s, "3") <= room;
  const head = !note ? (r.h < 32 ? "NEXT BATTLE" : head0)
    : [`NEXT BATTLE · ${note}`, `NEXT · ${note}`, note].find(fits) ?? note;
  drawText(g, head, x0, r.y + 5, C.slate4, { font: "3" });
  if (r.h < 32) {
    drawText(g, foeClass(foe), r.x + r.w - 5, r.y + 5, C.bone, { font: "3", align: "right" });
    const nw = drawText(g, foe.name, x0, r.y + 13, C.red, { outline: C.ink });
    if (rival) tag(g, "STAND-IN", x0 + nw + 4, r.y + 14, C.slate3);
    // RETUNE-1 run 2 (REQ-BFG-096): on a hearts run, the hearts at stake at the name row's right, clear of the name and tag
    return stakes ? foeStakes(g, stakes, r, r.y + 14, x0 + nw + (rival ? 4 + textWidth("STAND-IN", "3") + 5 : 0)) : null; // the tag: its text + 5
  }
  const nw = drawText(g, foe.name, x0, r.y + 13, C.red, { outline: C.ink });
  if (rival) tag(g, "STAND-IN", x0 + nw + 4, r.y + 14, C.slate3);
  drawText(g, foeClass(foe), x0, r.y + 24, C.bone, { font: "3" });
  // RETUNE-1 run 2 (REQ-BFG-096): on a hearts run, the hearts at stake at the head row's right; LAST CHANCE on the class row
  if (!stakes) return null;
  foeStakes(g, { ...stakes, saves: false }, r, r.y + 5, x0 + textWidth(head, "3"));
  if (!stakes.saves) return null;
  // RETUNE-1 run 3 (brief section 10, "when LAST CHANCE would save the run, they say so"): where neither form fits beside
  // the class line (the landscape panel at 844x390 and 1920x1080), on a row of its own under it: the panel's 40 px hold a
  // fourth 3x5 row (3 px under the class line, 3 px over the panel's foot), right of the portrait
  return foeSaves(g, r, r.y + 24, x0 + textWidth(foeClass(foe), "3")) ?? (r.h >= 40 ? foeSaves(g, r, r.y + 32, x0) : null);
}

/** RETUNE-1 run 3: the LAST CHANCE words the NEXT BATTLE panel drew (right-aligned: their right edge and row), for tests. */
export interface FoeSaves {
  words: string;
  right: number;
  y: number;
}

/** RETUNE-1 run 2 (REQ-BFG-096): the NEXT BATTLE panel's stakes on a hearts run, right-aligned in `r` on row `y` where they
 *  clear `after` (the row's last drawn pixel) by 4 px: "-N" and the heart, then (`saves`) LAST CHANCE SAVES YOU (or LAST
 *  CHANCE) before it where that fits too. Run 3: returns the LAST CHANCE words drawn, or null. */
function foeStakes(g: G, s: DuskStakes, r: Rect, y: number, after: number): FoeSaves | null {
  const right = r.x + r.w - 5, w = stakesWidth(s);
  if (right - w < after + 4) return null;
  drawStakes(g, s, right - w, y);
  return s.saves ? foeSaves(g, { ...r, w: r.w - w - 4 }, y, after) : null;
}

/** LAST CHANCE SAVES YOU (or LAST CHANCE where only that fits) right-aligned in `r` on row `y`, clear of `after`; the words
 *  drawn, or null where neither fits (run 3). */
function foeSaves(g: G, r: Rect, y: number, after: number): FoeSaves | null {
  const right = r.x + r.w - 5;
  const words = [STAKES_SAVES, STAKES_SAVES_SHORT].find((t) => right - textWidth(t, "3") >= after + 4);
  if (!words) return null;
  drawText(g, words, right, y, C.lime, { font: "3", align: "right" });
  return { words, right, y };
}
