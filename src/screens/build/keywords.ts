// U2c (REQ-BFG-045, REQ-BFG-046; BRIEF-T2b items 1-3, adapted to the faces): TAP TO EXPLAIN on every build-screen panel
// that draws a face or rule text (offer, cargo, placed, fitted, rig and stoker panels, the turret panel).
// - The targets (keywordTargets, pure): each keyword as drawn, its icon and word in panel style ({*NAME}), or its icon alone
//   (a NEXT★ or MERGES line); a rule's brass trigger label (HIT:, SHOT:, LOAD:, EVERY n SEC:); a word a piece's tap note
//   sits on (glossary.ts TAP_NOTES); and in the kept texts (RULES pieces, flavour, notes, clashes) every word the glossary
//   names (glossaryHits). Each is the word's glyphs grown to its line's pitch (and at least a pitch wide); where two grown
//   rects meet, the nearest wins (they split between the words); none reaches outside the panel or into a button's grown
//   rect or the `?` button's. Each gets a 1 art px dotted underline in its colour.
// - A tap (or a click) on one shows its definition (glossary.ts glossaryText: the piece's own number) over the panel's
//   bottom rows, where the hint sits, in 5x7 with the keyword in its colour, on the panel's background; whole, never cut
//   (it grows up over the panel, and above it on a strip too short). A second tap on it, or a tap anywhere else, closes it;
//   a tap on another word switches to it.
// - The `?` button: the header's 16 art px icon box (a `?` in its corner) on every panel that names a word; on touch its
//   target grows as the buttons' do (ui.ts tapRect), clear of their grown rects. It opens the KEYWORDS view over the body:
//   each word the panel names, once, in reading order, with its definition in 5x7; where they don't fit, a page at a time
//   (a tap on the view turns the page; after the last, it closes). `?` again, or a tap anywhere else, closes it.
// - U2e step 5 (REQ-BFG-070; the operator: "follow the batomon pattern by having an info button that shows more
//   information about further levels"): the `?` button is the ⓘ button: the same box, target, hit rect and region id
//   (`kw:?`), an "i" (a dot over a stem) in its corner. It shows on every panel that names a word or has LEVELS. Its view
//   (the KEYWORDS view, extended and paged as before) shows the piece's LEVELS first (levels.ts: a ladder per number that
//   changes with the stars, the current star's value in yellow; each star's perk; the next star's NEXT★ line, never a copy
//   count), then the KEYWORDS.
// - The desk: hovering a word shows its definition in the shop's tooltip style, with the `help` cursor.
// A press on a word, `?` or the view is a UI region's: it never reaches the board (no drag, no placing), and every other
// gesture is untouched (BuildScreen.pressed closes the definition and the view on any other press).

import type { Run } from "../../game/run";
import { classFactor, ITEMS, type HeroId } from "../../sim/content";
import { defOf, itemByUid, turretSlots } from "../../sim/deck";
import { resolveCore } from "../../sim/cores";
import { gradeOf, starsOf } from "../../sim/stars";
import { C } from "../../render/palette";
import { rect, frame, type G } from "../../render/pixel";
import { drawInfoMark } from "../../ui/infoGlyph"; // POLISH-2 (REQ-BFG-089; Q3): the one ⓘ mark, shared by every info button
import { ICON, KEYWORDS, PLAYER_WORD, drawText, icons, textWidth, type FontId } from "../../render/font";
import { colourize, drawRich, lineText, lineWidth, wrapRich, type RichLine } from "../../ui/richText";
import { glossaryEntry, glossaryHits, glossaryText, keywordRow, tapNote } from "../../ui/glossary";
import { STAT_ICONS, statIconNote } from "../../ui/glossary"; // WORDS-1 (REQ-BFG-081): the stat icons' notes
import { ICON_COLOUR, faceChars } from "../../render/font"; // WORDS-1: a stat icon's underline in its colour ({RATE} yellow); PRESENT-3 D: faceChars, for smallFaceHolds
import { FAMILY, famHeadParts, famHeadText, familyNote, familyWord } from "../../ui/families"; // WORDS-1: the family tags' taps (familyTargets); PRESENT-2 W (b): the head's words
import type { ModuleTag } from "../../sim/content"; // WORDS-1
import { tapRect, inside, type Rect, type UI } from "../../ui/ui";
import type { TextOpts } from "../../ui/abilityText";
import { hasFace } from "../../ui/faces";
import type { Sel } from "./layout";
import { RUNES } from "../../sim/runes";
import { KEYWORD_WORD, runeKeywords } from "../../ui/runeText";
import { WORD_ONLY } from "../../ui/runeText"; // CARD-4 (REQ-BFG-081, T)
import type { Block, PLine, PanelPlan, PanelText } from "./inspector";
import { levelLines, levelSpans, type LevelLine } from "./levels"; // U2e step 5 (REQ-BFG-070): the ⓘ view's LEVELS
import { fusible } from "../../sim/stars"; // U2e step 5
import type { BuildLayout } from "./layout"; // U2f: the room the ⓘ view grows into (infoFree)
import { GAP, headDy } from "../../ui/spacing"; // SPACE-1 (REQ-BFG-087): the gaps between the ⓘ view's entries; POLISH-4 (P4-1): where a family head sits under a two-row title
import { plainSlugRig } from "../../ui/faces"; // EXPLAIN-1 (REQ-BFG-084 step 0b, E9): HIT on the plain rigs' KEYWORDS (SHAPES-1: isPlainRig; PLAIN-1F M3: plainSlugRig)
import { RIG_SENTENCE, faceLines } from "../../ui/faces"; // CARD-2 (REQ-BFG-004, K1): the rig sentence on the first rig
import { rigSeen, sawRig, sawWord, sightsLeft, sightWord } from "../../ui/firstSight"; // CARD-2 (K1): the first-sight notes
import { TURRET_LABELS } from "./faceBlocks"; // CARD-2 (REQ-BFG-081, K4): a turret row label's target
import { dayScaled } from "../../sim/hullScale"; // CNT-DAY2 (REQ-BFG-100): runeWords reads the run's day on the day's hull only

/** The piece a panel shows (its number fills in a keyword's reminder; its tap note): an offer, a part in cargo, a placed
 *  part, a fitted core or gear piece, an installed turret's bought core. */
export interface Piece {
  def: string;
  stars: number;
  o: TextOpts;
}

/** One tap target: the word as drawn (`glyph`, its underline under it), its grown hit rect, what a tap shows (markup)
 *  and the word's colour. */
export interface KwTarget {
  word: string;
  text: string;
  colour: string;
  glyph: Rect;
  r: Rect;
}

/** A word a panel names, for the KEYWORDS view: its word, colour and what a tap on it shows. */
export interface KwWord {
  word: string;
  text: string;
  colour: string;
}

const GLYPH_H: Record<FontId, number> = { "5": 7, "3": 5 };
/** The trigger labels a target names (T1 2.3): a label's first word. */
const TRIGGERS = ["HIT", "SHOT", "LOAD", "EVERY"];

/** The panel's piece for a selection (null: a belt, an empty slot, a turret with no bought core). */
export function panelPiece(run: Run, show: Sel): Piece | null {
  const o: TextOpts = { k: heroKOf(run), hero: run.hero as HeroId, day: run.day }; // HULL-1d (REQ-BFG-079): the run's day
  switch (show.kind) {
    case "offer": {
      const of = run.shop.wagons[show.wagon]?.offers[show.slot];
      return of ? { def: of.def, stars: 1, o } : null;
    }
    case "cargo": {
      const it = run.inventory.find((i) => i.uid === show.uid);
      return it ? { def: it.def, stars: starsOf(it), o } : null;
    }
    case "item": {
      const p = itemByUid(run.build, show.uid);
      if (!p) return null;
      // a factory reads at its grade (inspector.ts itemPanel), a rig at its stars
      return { def: p.def, stars: defOf(p).kind === "factory" ? gradeOf(run.build, p) : starsOf(p), o };
    }
    case "fitted": {
      const m = run.build.mods.find((q) => q.uid === show.uid);
      const td = m ? turretSlots(run.build)[m.turret]?.td : undefined;
      if (!m || !td) return null;
      return { def: m.def, stars: starsOf(m), o: { k: ITEMS[m.def].kind === "core" ? classFactor(td) : 1, hero: run.hero as HeroId, day: run.day } }; // HULL-1d: the day
    }
    case "turret": {
      const td = turretSlots(run.build)[show.index]?.td;
      if (!td) return null;
      const tc = resolveCore(run.build, show.index, td);
      return tc.bought ? { def: tc.def, stars: tc.stars, o: { k: tc.k, hero: run.hero as HeroId, day: run.day } } : null; // HULL-1d: the day
    }
    default:
      return null;
  }
}

/** U2e step 5 (REQ-BFG-070): the piece whose LEVELS a panel's ⓘ view shows, at its stars (a placed factory at its stars,
 *  not its grade; an installed turret's own, not its core's); null for a panel with none (a belt, an empty slot). */
export function levelsPiece(run: Run, show: Sel): Piece | null {
  if (show.kind === "turret") {
    const t = turretSlots(run.build)[show.index]?.turret;
    return t ? { def: t.def, stars: t.stars ?? 1, o: { k: heroKOf(run), hero: run.hero as HeroId, day: run.day } } : null; // HULL-1d
  }
  if (show.kind === "item") {
    const p = itemByUid(run.build, show.uid);
    return p ? { def: p.def, stars: starsOf(p), o: { k: heroKOf(run), hero: run.hero as HeroId, day: run.day } } : null; // HULL-1d
  }
  return panelPiece(run, show);
}

/** U2e step 5: the LEVELS lines of a panel's ⓘ view ([] for a piece without stars, or no piece). */
export function infoLevels(run: Run, show: Sel): LevelLine[] {
  const p = levelsPiece(run, show);
  return p && fusible(p.def) ? levelLines(p.def, p.stars, p.o) ?? [] : [];
}

/** inspector.ts heroK's reading (the hero's first installed turret's class factor), without the import cycle's order. */
function heroKOf(run: Run): number {
  const s = turretSlots(run.build).find((q) => q.td);
  return s?.td ? classFactor(s.td) : 1;
}

/** A face line (the stat row, a rule, a clause, a caveat, a reminder, NEXT★ or MERGES INTO of a piece with a face): its
 *  targets are its keywords as drawn and its trigger label; a kept text's, the glossary's words. */
const faceRoles = new Set(["ability", "reminder", "caveat", "next", "merges"]);
const isFaceLine = (b: Block, piece: Piece | null): boolean => !!piece && hasFace(piece.def) && faceRoles.has(b.role);

/** The spans [at, end) of a line's text that name a word, each with what a tap shows. CNT-DAY2 (REQ-BFG-100,
 *  REQ-BFG-082): `day`, the day the panel is read on (its Run's: drawKeywordLayer's run.day), for a word with no piece
 *  (glossaryText's `day`); undefined: as before. */
function matches(text: string, l: PLine, first: boolean, piece: Piece | null, day?: number): { at: number; end: number; word: string; text: string; colour: string }[] {
  const out: { at: number; end: number; word: string; text: string; colour: string }[] = [];
  const free = (a: number, b: number) => !out.some((m) => a < m.end && m.at < b);
  const add = (at: number, end: number, word: string) => {
    if (end <= at || !free(at, end)) return;
    const shown = glossaryText(word, piece ?? undefined, day); // CNT-DAY2: the panel's day where there is no piece
    if (!shown) return;
    const row = glossaryEntry(word);
    out.push({ at, end, word, text: shown, colour: row?.colour ?? C.bone });
  };
  // the keywords as drawn: the icon and its word (panel style), or the icon alone
  // CARD-3 (REQ-BFG-107): the word glued to the icon is the player's (font.ts PLAYER_WORD: SHIELD, WARD)
  for (const k of KEYWORDS) {
    const w = PLAYER_WORD[k];
    for (let i = text.indexOf(ICON[k]); i >= 0; i = text.indexOf(ICON[k], i + 1)) add(i, text.startsWith(w, i + 1) ? i + 1 + w.length : i + 1, w);
  }
  const b = l.block;
  // WORDS-1 (REQ-BFG-081; cap's design call 3): the stat icons {RATE}, {SLUG} and {GEAR} on an ability line (a face's stat
  // row and rule lines, the turret panel's stat row), each with its note (glossary.ts statIconNote: {SLUG} by the piece's
  // kind; a row with a {GEAR} pair is a turret's stat row)
  // SHOPCARD-1e (REQ-BFG-081; READ-12 fix 5, E1): {BELT} too, on a factory's stat row (and GANTRY PRESS's BIGGER: +1 {BELT} line):
  // the belts it can feed (glossary.ts BELT_NOTE). The word BELT's rune-only note (glossary.ts, scope "rune") is untouched: it is
  // found where a rune card draws that word (runeBar.ts), never here. A factory's only: no other face draws the icon.
  if (b.role === "ability") {
    const kind = piece ? ITEMS[piece.def]?.kind : undefined, gunRow = text.includes(ICON.GEAR) && text.includes(ICON.RATE);
    for (const k of STAT_ICONS) {
      if (k === "BELT" && kind !== "factory") continue;
      for (let i = text.indexOf(ICON[k]); i >= 0; i = text.indexOf(ICON[k], i + 1)) {
        // CARD-2 (REQ-BFG-081, K4): on the turret row's labels the target is the icon and its word (HOLDS: {SLUG}'s note)
        const label = b.pairs && k !== "BELT" ? TURRET_LABELS[k] : "", end = label && text.startsWith(label, i + 1) ? i + 1 + label.length : i + 1; // SHOPCARD-1e: a turret row has no {BELT}
        if (free(i, end)) out.push({ at: i, end, word: k, text: statIconNote(k, kind, gunRow), colour: ICON_COLOUR[ICON[k]] ?? C.bone });
      }
    }
  }
  if (isFaceLine(b, piece)) {
    // WORDS-1 (REQ-BFG-081; TEXT-STYLE 7.4 as ruled 2026-10-10: a coined word only where a tap on that card explains it):
    // every glossary word a face line prints (PART, SPEED's FROM THIS TILE ON, MATCHED, JAM, ...), as a kept text's are;
    // RATE's verb forms (FIRES, WORKS FASTER) stay plain on a face, where the {RATE} icon carries the note
    for (const h of glossaryHits(text)) if (h.row.word !== "RATE") add(h.at, h.end, h.row.word);
    // the rule's brass trigger label (on the block's first line), its word's row or the piece's tap note
    if (first && b.brass) {
      const at = text.indexOf(b.brass), word = b.brass.split(/[ :]/)[0];
      if (at >= 0 && TRIGGERS.includes(word)) add(at, at + b.brass.length, word);
    }
    // the word a piece's tap note sits on (SPOTTER's AIM, STOKER's FASTER)
    const note = piece ? noteWord(piece.def) : null;
    if (note && !TRIGGERS.includes(note) && !(KEYWORDS as readonly string[]).includes(note) && b.role === "ability") {
      for (const m of text.matchAll(new RegExp(`\\b${note}\\b`, "g"))) add(m.index!, m.index! + note.length, note);
    }
    return out;
  }
  // a kept text: the glossary's words (not the action hint, which a shown definition covers, nor merge progress, whose
  // COPY is a copy of the piece, not SPLITTER's COPIES)
  if (b.role !== "hint" && b.role !== "merge") for (const h of glossaryHits(text)) add(h.at, h.end, h.row.word);
  return out;
}

/** The word a piece's tap note sits on, else null. Y7b1 (release Y; ruling Y7A-R2): UP TO too, EXT. CHAMBER's (glossary.ts
 *  TAP_NOTES chamber). TXT-AZ (REQ-BFG-070; REVIEW-TXT096 Q1): CHAMBERS too, ROTARY BREECH's (TAP_NOTES rotary). */
export function noteWord(def: string): string | null {
  for (const w of ["AIM", "FASTER", "UP TO", "CHAMBERS"]) if (tapNote(def, w)) return w;
  return null;
}

/** Grow `r` to at least `h` tall and `w` wide about its centre. */
const grow = (r: Rect, w: number, h: number): Rect => {
  const nw = Math.max(r.w, w), nh = Math.max(r.h, h);
  return { x: r.x - Math.floor((nw - r.w) / 2), y: r.y - Math.floor((nh - r.h) / 2), w: nw, h: nh };
};
const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** `r` without the part `b` covers (the larger side left of it, in y then x), or null when nothing is left. */
function clipOut(r: Rect, b: Rect): Rect | null {
  if (!overlaps(r, b)) return r;
  const cands: Rect[] = [
    { x: r.x, y: r.y, w: r.w, h: b.y - r.y }, // above b
    { x: r.x, y: b.y + b.h, w: r.w, h: r.y + r.h - (b.y + b.h) }, // below b
    { x: r.x, y: r.y, w: b.x - r.x, h: r.h }, // left of b
    { x: b.x + b.w, y: r.y, w: r.x + r.w - (b.x + b.w), h: r.h }, // right of b
  ].filter((q) => q.w > 0 && q.h > 0);
  if (!cands.length) return null;
  return cands.sort((p, q) => q.w * q.h - p.w * p.h)[0];
}

/** `r` kept inside `within`. */
const clamp = (r: Rect, within: Rect): Rect | null => {
  const x = Math.max(r.x, within.x), y = Math.max(r.y, within.y);
  const x1 = Math.min(r.x + r.w, within.x + within.w), y1 = Math.min(r.y + r.h, within.y + within.h);
  return x1 > x && y1 > y ? { x, y, w: x1 - x, h: y1 - y } : null;
};

/** CARD-2 (REQ-BFG-081, K2): U2c's target rules, for the rune cards' word targets (runeBar.ts runeWordTargets). */
export const clampRect = clamp;
export const clipOutRect = clipOut;

/**
 * The tap targets of a planned panel (pure; drawDetails and the tests): every word its visible lines name (see the file
 * comment), each its glyphs grown to its line's pitch and at least a pitch wide, the nearest winning where two meet, inside
 * the panel `r` (1 px in from its frame) and clear of `avoid` (the buttons' grown rects and the `?` button's). A target
 * whose rect would be empty is left out (its word is still in the KEYWORDS view). CNT-DAY2 (REQ-BFG-100, REQ-BFG-082):
 * `day`, the panel's (its Run's) day, for the words with no piece (matches); undefined: as before.
 */
export function keywordTargets(lines: readonly { line: PLine | "rule"; y: number }[], plan: Pick<PanelPlan, "r">, piece: Piece | null,
  avoid: readonly Rect[] = [], day?: number): KwTarget[] {
  const r = plan.r, x0 = r.x + 5;
  const firsts = new Set<Block>();
  const raw: (KwTarget & { cx: number; cy: number })[] = [];
  for (const v of lines) {
    if (v.line === "rule" || v.line.cells) continue;
    const l = v.line, text = lineText(l.spans), first = !firsts.has(l.block);
    firsts.add(l.block);
    const lx = x0 + (l.indent ?? 0), gh = GLYPH_H[l.font];
    for (const m of matches(text, l, first, piece, day)) {
      const gx = lx + (m.at > 0 ? textWidth(text.slice(0, m.at), l.font) + 1 : 0);
      const glyph = { x: gx, y: v.y, w: textWidth(text.slice(m.at, m.end).replace(/[:]$/, ""), l.font), h: gh };
      const hit = grow({ x: glyph.x - 1, y: glyph.y, w: glyph.w + 2, h: gh }, l.pitch, l.pitch);
      raw.push({ word: m.word, text: m.text, colour: m.colour, glyph, r: hit, cx: glyph.x + glyph.w / 2, cy: glyph.y + gh / 2 });
    }
  }
  // the nearest wins: two grown rects that meet split between their words (along the axis they are apart on)
  for (let i = 0; i < raw.length; i++) for (let j = i + 1; j < raw.length; j++) {
    const a = raw[i], b = raw[j];
    if (!overlaps(a.r, b.r)) continue;
    const [p, q] = Math.abs(a.cx - b.cx) >= Math.abs(a.cy - b.cy) ? (a.cx <= b.cx ? [a, b] : [b, a]) : (a.cy <= b.cy ? [a, b] : [b, a]);
    if (Math.abs(a.cx - b.cx) >= Math.abs(a.cy - b.cy)) {
      const mid = Math.max(p.glyph.x + p.glyph.w, Math.min(q.glyph.x, Math.round((p.glyph.x + p.glyph.w + q.glyph.x) / 2)));
      p.r = { ...p.r, w: Math.max(1, mid - p.r.x) };
      q.r = { ...q.r, w: Math.max(1, q.r.x + q.r.w - mid), x: mid };
    } else {
      const mid = Math.max(p.glyph.y + p.glyph.h, Math.min(q.glyph.y, Math.round((p.glyph.y + p.glyph.h + q.glyph.y) / 2)));
      p.r = { ...p.r, h: Math.max(1, mid - p.r.y) };
      q.r = { ...q.r, h: Math.max(1, q.r.y + q.r.h - mid), y: mid };
    }
  }
  const within = { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 };
  const out: KwTarget[] = [];
  for (const t of raw) {
    let q: Rect | null = clamp(t.r, within);
    for (const a of avoid) if (q) q = clipOut(q, a);
    // a word a button's grown rect covers past its middle is no target (a sliver of one would only mislead): it stays a
    // tap away in the KEYWORDS view
    if (q && inside(q, Math.floor(t.cx), Math.floor(t.cy))) out.push({ word: t.word, text: t.text, colour: t.colour, glyph: t.glyph, r: q });
  }
  return out;
}

/**
 * WORDS-1 (REQ-BFG-081; READ-1 3.2: the family tags drew 403 of round A's 1,172 "not understood" flags; cap's design call
 * 4): the header's family tags as tap targets, each showing its families.ts line (familyNote). Where drawFamHead draws the
 * names (3x5), each name; where only the marks fit, each 3x3 mark. Each glyph grown to a 7 px pitch (the header's), inside
 * the panel (1 px in from its frame) and clear of `avoid` (the buttons' grown rects and the ⓘ button's), its middle in its
 * target; its key is "<TAG> FAMILY", apart from the PLATE keyword's. Pure (drawKeywordLayer, tests).
 * POLISH-4 (REQ-BFG-089; P4-1): the head's place is drawFamHead's, under a two-row title and beside the last of three or more sub rows too (`dy`, spacing.ts headDy).
 */
export function familyTargets(plan: Pick<PanelPlan, "r" | "famHead"> & Partial<Pick<PanelPlan, "titleRows">>, avoid: readonly Rect[] = []): KwTarget[] {
  const fh = plan.famHead, r = plan.r;
  if (!fh) return [];
  const dy = headDy(plan);
  const within = { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 }, out: KwTarget[] = [];
  const push = (tag: ModuleTag, glyph: Rect) => {
    let q: Rect | null = clamp(grow({ x: glyph.x - 1, y: glyph.y, w: glyph.w + 2, h: glyph.h }, 7, 7), within);
    for (const a of avoid) if (q) q = clipOut(q, a);
    for (const t of out) if (q && overlaps(q, t.r)) q = clipOut(q, t.r);
    if (q && inside(q, Math.floor(glyph.x + glyph.w / 2), Math.floor(glyph.y + glyph.h / 2))) {
      out.push({ word: `${familyWord(tag)} FAMILY`, text: familyNote(tag), colour: FAMILY[tag].colour, glyph, r: q }); // CARD-3: the player's tag
    }
  };
  if (fh.names) {
    // drawFamHead: `FORGE FAMILY` or `FAMILIES: FORGE, TEMPO` in 3x5 (PRESENT-2 W (b); was "FORGE, TEMPO"), under the sub line (x + 23, y + 19), or
    // right-aligned on the sub line's second row (y + 19) or the title's (y + 5)
    const parts = famHeadParts(fh.tags, !!fh.explained), words = parts.names, text = famHeadText(fh.tags, !!fh.explained), x0 = fh.at === "sub" ? r.x + 23 : r.x + r.w - 4 - textWidth(text, "3"); // CARD-3
    const y0 = r.y + dy + (fh.at === "title" ? 5 : fh.at === "sub1" ? 13 : 19); // POLISH-4 (P4-5): `sub1`, the sub line's first row
    if (fh.tags.length === 1) {
      // one family: the whole head is its target (`FORGE FAMILY`: a tap on either word opens the note, whose key is `FORGE FAMILY`; the plain `FORGE`: the name)
      push(fh.tags[0], { x: x0, y: y0, w: textWidth(text, "3"), h: GLYPH_H["3"] });
      return out;
    }
    fh.tags.forEach((tag, i) => {
      const lead = `${parts.prefix}${i ? `${words.slice(0, i).join(", ")}, ` : ""}`, before = lead ? textWidth(lead, "3") + 1 : 0;
      push(tag, { x: x0 + before, y: y0, w: textWidth(words[i], "3"), h: GLYPH_H["3"] });
    });
    return out;
  }
  // drawFamHead's marks: 3x3 each, 4 px apart, from (x + 23, y + 20) under the sub line, else right-aligned (y + 6 by the
  // title, y + 20 by the sub line's second row)
  const x0 = fh.at === "sub" ? r.x + 23 : r.x + r.w - 4 - (fh.tags.length * 4 - 1), y0 = r.y + dy + (fh.at === "title" ? 6 : 20);
  fh.tags.forEach((tag, i) => push(tag, { x: x0 + i * 4, y: y0, w: 3, h: 3 }));
  return out;
}

/** The keywords of the runes the run holds (runeText.ts runeKeywords), in pick order, each with its glossary row's
 *  definition: the KEYWORDS view lists them after the panel's own words (BURN, RIDE, STUN, ...). CNT-DAY2 (REQ-BFG-100,
 *  REQ-BFG-082): on the day's hull (the switch on and a run day) the row is read on the run's day, as a word with no piece
 *  is (glossaryText's `day`: BURN's and FRAY's damage, SHIELD's MAX); no day, or the switch off: the table's, as before. */
export function runeWords(run: Run): KwWord[] {
  const out: KwWord[] = [];
  for (const h of run.build.runes ?? []) {
    const d = RUNES[h.id];
    if (!d) continue;
    for (const k of runeKeywords(d)) {
      if (WORD_ONLY.has(k)) continue; // CARD-4 (REQ-BFG-081, T): a word-only keyword (TOLL ROAD's LOAD) is no row of the view
      const row = glossaryEntry(KEYWORD_WORD[k]);
      const text = row && dayScaled(run.day) ? glossaryText(row.word, undefined, run.day) ?? row.def : row?.def; // CNT-DAY2
      if (row && text && !out.some((w) => w.word === row.word)) out.push({ word: row.word, text, colour: row.colour });
    }
  }
  return out;
}

/**
 * EXPLAIN-1 (REQ-BFG-089, E4; REQ-BFG-084 step 0b, E9): the words a drawn panel's ⓘ KEYWORDS lists: panelWords over its
 * text's `words` (inspector.ts explainPanel: the face's blocks before any was hidden, then the NOTES lines no face drew),
 * so a hidden line's words keep their definitions; and on a plain rig (faces.ts PLAIN_RIGS), whose face no longer prints
 * the HIT: label, HIT first, as its label led the line (its definition as today's: glossary.ts glossaryText).
 * CNT-DAY2 (REQ-BFG-100, REQ-BFG-082): `day`, the panel's (its Run's) day, for the words with no piece; undefined: as
 * before.
 */
export function explainWords(t: Pick<PanelText, "body" | "words">, piece: Piece | null, day?: number): KwWord[] {
  const own = panelWords(t.words ?? t.body, piece, day);
  // SHAPES-1: isPlainRig (+ the shaped three, SHAPES on). PLAIN-1F (M3): plainSlugRig, the plain rigs the rig sentence and
  // HIT are true of (BALLAST's stat is the ship's: no HIT); with PLAIN_RIGS off it is isPlainRig exactly
  if (!piece || !plainSlugRig(piece.def) || own.some((w) => w.word === "HIT")) return own;
  const row = glossaryEntry("HIT"), text = glossaryText("HIT", piece, day);
  return row && text ? [{ word: row.word, text, colour: row.colour }, ...own] : own;
}

/** EXPLAIN-1 (E3): what the ⓘ icon's hover tooltip lists: the NOTES lines, each a separate item, and a plain rig's HIT
 *  definition after them (its face no longer prints the label a hover would read). Markup or glyphs, as drawn. */
export function iconTipItems(t: Pick<PanelText, "notes">, words: readonly KwWord[], piece: Piece | null): string[] {
  const notes = (t.notes ?? []).map((b) => b.text);
  const hit = piece && plainSlugRig(piece.def) ? words.find((w) => w.word === "HIT") : undefined; // SHAPES-1: isPlainRig; PLAIN-1F (M3): plainSlugRig
  return [...notes, ...(hit ? [hit.text] : [])];
}

/** Every word a panel's text names (all of its body's blocks, shown or given way), once, in reading order, with what a tap
 *  on it shows: for the KEYWORDS view (and the test that every word a panel names can be reached). CNT-DAY2: `day`, the
 *  panel's (its Run's) day, for the words with no piece (matches); undefined: as before. */
export function panelWords(body: readonly Block[], piece: Piece | null, day?: number): KwWord[] {
  const seen = new Set<string>(), out: KwWord[] = [];
  const fake = (b: Block): PLine => ({ spans: [{ t: b.text, c: C.bone }], font: "5", block: b, pitch: 9 });
  for (const b of body) {
    if (b.cells) continue;
    for (const m of matches(b.text, fake(b), true, piece, day).sort((p, q) => p.at - q.at)) {
      const key = glossaryEntry(m.word)?.word ?? m.word;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ word: key, text: m.text, colour: m.colour });
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------- state and drawing

/** The panel's tap state: which panel (its selection), the word shown, the KEYWORDS view's page. CARD-2 (REQ-BFG-004, K1):
 *  `opened`, this open's first sight is decided (a fresh state is a new open: another panel, or this one again after the
 *  panel closed, keywordsIdle); `auto`, a desk's first-sight word (its definition in the hover tooltip's look; on touch
 *  the first sight is `word` itself, as a tap's); `rig`, the rig sentence's box by the icon. */
interface KwState {
  key: string;
  word: string | null;
  page: number | null;
  hover: string | null;
  opened: boolean;
  auto: string | null;
  rig: boolean;
  /** CARD-5 (REQ-BFG-004, K): this open's first sights are under way: a first-sight note opened by itself, so when no box
   *  shows while the panel is still open, the next keyword not yet seen opens (one at a time), until none is left. */
  chain: boolean;
  /** PRESENT-1 (REQ-BFG-081; S4 (b), cap's ruling af2c96863a44ab41): the tallest panel (its rect's h) a note of this open's
   *  first-sight chain was shown in, while the chain is under way, else 0: a phone's panel that grew to keep a note clear of its
   *  rule rows keeps that height until the chain's last note closes (definitionAhead's `hold`), so it never shrinks and grows
   *  back between two notes. */
  held: number;
  /** PRESENT-2 P (cap's ruling 26addce8293da756): where the last shown note went on the landscape column (columnPlace); null: not a column's, or none shown. Read by the tests. */
  place: "today" | "under" | "beside" | "band" | "corner" | "fallback" | null;
  /** PRESENT-3 D: the face the last column note drew in (the small-face pass: "3"); null: not a column's, or none shown. Read by the tests. */
  face: FontId | null;
  /** PRESENT-3 D: the text of the last shown note (before wrapping); null: none shown. Read by the tests (the small-face pass keeps every word). */
  text: string | null;
  /** PRESENT-2 P: the lines the last shown note drew (a box beside the column wraps to its own width); null: none shown. Read by the tests. */
  note: RichLine[] | null;
  /** PRESENT-4 T (F10): where the rig sentence's box went on its first frame (rigPlace); kept while it shows (no jumps), null when it is not shown. Read by the tests and by rigAhead. */
  rigAt: RigPlace | null;
}
const STATE = new WeakMap<object, KwState>();
const stateOf = (owner: object, key: string): KwState => {
  let s = STATE.get(owner);
  if (!s || s.key !== key) {
    s = { key, word: null, page: null, hover: null, opened: false, auto: null, rig: false, chain: false, held: 0, place: null, face: null, text: null, note: null, rigAt: null };
    STATE.set(owner, s);
  }
  return s;
};

/** The ids this layer's regions use (BuildScreen.pressed keeps a press on one from closing what it opens). */
export const KW_REGION = "kw:";
export const isKeywordRegion = (id: string | null): boolean => !!id && id.startsWith(KW_REGION);
/** CARD-2 (K1): a first-sight box's region (the desk's word box, the rig sentence's): a UI region, so a press on it never
 *  reaches the board; like a tapped word's box (`kwdef`) it is no keyword region, so the press closes it. */
export const SIGHT_REGION = "kwsight";

/** BuildScreen.pressed: a press anywhere but on a word, `?` or the KEYWORDS view closes the definition and the view.
 *  CARD-2 (K1): any press closes a first-sight box (on touch the box is the shown word's: it closes as a tapped one). */
export function keywordsPressed(owner: object, region: string | null): void {
  const s = STATE.get(owner);
  if (!s) return;
  s.auto = null;
  s.rig = false;
  if (isKeywordRegion(region)) return;
  s.word = null;
  s.page = null;
}

/** CARD-2 (REQ-BFG-004, K1): drawDetails with no panel to draw: the panel closed, so its next draw is a new open (its first
 *  sight decided again). */
export function keywordsIdle(owner: object): void {
  STATE.delete(owner);
}

/** CARD-2 (K1): the reading order of a panel's word targets (top to bottom, left to right). */
const reading = (a: KwTarget, b: KwTarget): number => a.glyph.y - b.glyph.y || a.glyph.x - b.glyph.x;

/**
 * CARD-2 (REQ-BFG-004, K1): a rig the rig sentence is true of (faces.ts RIG_SENTENCE: each arrow on a belt tile gives its
 * stats to every slug on that tile, one hit an arrow): a plain stat rig (WHETSTONE, TEMPER, BARBED SPOOL) or a rig whose
 * face's rule is a HIT: rule. Not a STOKER (its arrows work factories) nor a speed or timer rig (no HIT:).
 */
export function rigSentenceRig(piece: Piece | null): boolean {
  if (!piece) return false;
  const e = ITEMS[piece.def];
  if (e?.kind !== "gate" || e.gate?.stoke) return false;
  // SHAPES-1 x c099-card3 (RUN5 2): PLAIN_RIGS, and the shaped three with SHAPES on. PLAIN-1F (M3): plainSlugRig (BALLAST,
  // whose stat is the ship's, is no rig the sentence is true of; it has no HIT: rule either, so it falls through to false)
  if (plainSlugRig(piece.def)) return true;
  return !!faceLines(piece.def, piece.stars, piece.o)?.rules.some((r) => r.label === "HIT:");
}

/** What the layer shows now (tests and tooling). */
export function keywordState(owner: object): Readonly<KwState> | undefined {
  return STATE.get(owner);
}

/** The `?` button's drawn box: the header's icon box (drawDetails draws the icon at r.x + 4..20). */
export const questionBox = (r: Rect): Rect => ({ x: r.x + 4, y: r.y + 4, w: 16, h: 16 });

/** The `?` button's target: the box, grown on touch (`tap` > 0) as the buttons' are, clear of the buttons' grown rects.
 *  EXPLAIN-1 (REQ-BFG-089, E3: "at least 44 CSS px square on every pinned phone view"): it grows inside the panel (1 px in
 *  from its frame), no longer kept above the body: a phone's header is 23 art px tall where a TAP_CSS square is 27 (x5 at
 *  DPR 3), so the square reaches 4 px into the body's top left; the words there keep their targets clear of it, as they
 *  keep clear of the buttons' (keywordTargets' `avoid`). `bodyY` stays for the callers (unused). */
export function questionRect(r: Rect, bodyY: number, tap: number, buttons: readonly Rect[]): Rect | null {
  void bodyY;
  let q: Rect | null = tap ? tapRect(questionBox(r), tap, { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 }, tap) : questionBox(r);
  for (const b of buttons) if (q) q = clipOut(q, b);
  return q;
}

/** The definition's lines at the panel's text width (`w`), its keyword in its colour: in 5x7, or (PRESENT-3 D's small-face pass) in 3x5. */
export const definitionLines = (text: string, w: number, face: FontId = "5"): RichLine[] => wrapRich(colourize(icons(text), C.bone), w, face);

/** PRESENT-3 D: a note's line pitch in each face (the glyph's rows and 2 px between lines): 9 in 5x7, 7 in 3x5. */
export const NOTE_PITCH: Record<FontId, number> = { "5": 9, "3": 7 };

/** PRESENT-3 D (cap's ruling 6420b5479c7c7b92 (3)): can the 3x5 face draw every character of this note? It draws `?` for one it has no glyph for, and such a note never takes the small-face pass. The
 *  icons' markup is expanded to their glyphs first (icons()), as definitionLines does; a lower-case letter reads as its capital, as the face's own lookup does. */
export function smallFaceHolds(text: string): boolean {
  const have = new Set(faceChars("3"));
  return [...icons(text)].every((ch) => have.has(ch) || have.has(ch.toUpperCase()));
}

/** The box a shown definition takes: the panel's bottom rows (the hint's place), as tall as its lines, growing up over the
 *  panel (and above it on a strip too short to hold it): never cut. `bottom`: the body's last row + 1. */
export function definitionBox(r: Rect, bottom: number, lines: number, pitch = 9): Rect {
  const h = lines * pitch + 3;
  return { x: r.x + 2, y: bottom - h, w: r.w - 4, h };
}

/** CARD-3 (REQ-BFG-087, D1): definition box `box` (definitionBox's, at the panel's foot), moved to end 2 px above the top
 *  of the explained word's line where it would cover one of `own` (the targets of the word it explains); the panel's
 *  frame (r.y + 1) the highest it goes, else it stays at the foot. Pure (drawKeywordLayer, tests). */
export function defBoxClear(box: Rect, r: Rect, own: readonly { glyph: Rect }[]): Rect {
  const hit = own.filter((t) => overlaps(t.glyph, box));
  if (!hit.length) return box;
  const y = Math.min(...hit.map((t) => t.glyph.y)) - 2 - box.h;
  return y >= r.y + 1 ? { ...box, y } : box;
}

/**
 * CARD-4 (REQ-BFG-087, D; REVIEW-CARD3 D1; READ-4 F step 11: SPEED's box over BRAKE SHOE's title, ⓘ and BUY): where a shown
 * definition's box goes (a tap's or a first sight's), in place of defBoxClear: never over the panel's header (`head`: its
 * rows down to the body's top, and the drawn buttons), never over its own word's row (`own`, the explained word's
 * targets), never over the how-to strip (`strip`; CARD-4 K: a strip is not a note, so a first-sight box may show beside
 * it), and on the screen (`H`). In order: the panel's foot (definitionBox, as before) where that is clear; else just under
 * the word's line (past the panel's foot, onto the deck side, where it must); else just above the line, where that misses
 * the header; else just under the header (a word in the header itself: a family tag); else just under the strip; else
 * just under the line as the screen allows (`fits` false: the tests list it). Pure (drawKeywordLayer, tests).
 */
export function defBoxPlace(box: Rect, own: readonly { glyph: Rect }[], head: readonly Rect[], strip: Rect | null, H = Infinity): { box: Rect; fits: boolean } {
  const clear = (b: Rect): boolean => b.y >= 0 && b.y + b.h <= H && !head.some((q) => overlaps(b, q)) && !own.some((t) => overlaps(t.glyph, b)) && !(strip && overlaps(b, strip));
  if (clear(box)) return { box, fits: true };
  const top = own.length ? Math.min(...own.map((t) => t.glyph.y)) : box.y;
  const bot = own.length ? Math.max(...own.map((t) => t.glyph.y + t.glyph.h)) : box.y + box.h;
  const headBot = head.length ? Math.max(...head.map((q) => q.y + q.h)) : bot;
  const at = (y: number): Rect => ({ ...box, y });
  for (const b of [at(bot + 2), at(top - 2 - box.h), at(headBot + 1), ...(strip ? [at(strip.y + strip.h + 1)] : [])]) if (clear(b)) return { box: b, fits: true };
  return { box: at(Math.max(0, Math.min(H - box.h, bot + 2))), fits: false };
}

/**
 * PRESENT-2 L (REQ-BFG-081; cap's call on PRESENT-1's Question 4 (d) (i), and cap's ruling 0d0ef2465804aafb): a phone's panel that already
 * fills the growth limit (its top at the top bar: layout.ts panelArea's `most`) cannot grow for its note, and its rows fill it: the note at
 * the panel's foot covers 2-6 px of the last rule row. There the note leaves the foot: `hang`, built by inspector.ts for such a panel, says
 * where the lowest rule row ends (`ruleEnd`), whether a box covers a rule row (`covers`), the carrier's pad (`pad`) and what a note NEVER
 * covers (`hard`: the deck's cells, FIGHT, the cargo bar, the top bar). The note goes just under that row (1 px clear), hanging past the
 * panel's foot onto the deck side as defBoxPlace's under-the-line candidate does: where that place is whole on the screen and covers no rule
 * row, header or own word's row it is the place, even over the carrier's top edge (the bow pieces' barrels, the pad's margin, the hull's top
 * plate: `overPad` says how far into the pad), never over a `hard` rect; a how-to strip there does not draw while the note shows
 * (`yieldsStrip`). Where that place would cross a hard line, `blocked`: the note stays where defBoxPlace put it (today's foot place; the tests
 * list such a state by name). With no `hang` (every other panel) or where `placed` covers no rule row, `placed` is returned as it is. Pure.
 */
export interface NoteHang {
  ruleEnd: number;
  covers: (box: Rect) => boolean;
  pad: Rect | null;
  hard: readonly Rect[];
}
export interface NotePlace {
  box: Rect;
  fits: boolean;
  /** the note hangs under the last rule row (the panel is at its limit and the foot place covered a rule row) */
  hung: boolean;
  /** px of the note's box inside the carrier's pad (0: off it) */
  overPad: number;
  /** the note's place overlaps the how-to strip: the strip is not drawn while the note shows */
  yieldsStrip: boolean;
  /** a hang was wanted and its place crosses a hard line: the note keeps today's place */
  blocked: boolean;
}
export function hangPlace(placed: { box: Rect; fits: boolean }, own: readonly { glyph: Rect }[], head: readonly Rect[], strip: Rect | null, H: number, hang?: NoteHang): NotePlace {
  const plain: NotePlace = { ...placed, hung: false, overPad: 0, yieldsStrip: false, blocked: false };
  if (!hang || !hang.covers(placed.box)) return plain;
  const b: Rect = { ...placed.box, y: hang.ruleEnd + 1 };
  const clear = b.y >= 0 && b.y + b.h <= H && !head.some((q) => overlaps(b, q)) && !own.some((t) => overlaps(t.glyph, b)) && !hang.hard.some((q) => overlaps(b, q)) && !hang.covers(b);
  if (!clear) return { ...plain, blocked: true };
  return { box: b, fits: true, hung: true, overPad: hang.pad && overlaps(b, hang.pad) ? b.y + b.h - hang.pad.y : 0, yieldsStrip: !!strip && overlaps(b, strip), blocked: false };
}

/**
 * PRESENT-3 H (REQ-BFG-081; PRESENT-1's old item list, PRESENT-2 run 1's Question 5): in the first-run state a phone's panel has its how-to strip just under it, and a note that
 * goes to defBoxPlace's last candidate (just under the strip) ended 1-10 px into the deck's top rows (402x690 with a rune: 411 tapped notes and 230 first sights; 390x660: 612 and
 * 622; the other three views none). `deck` is the deck's cells on screen (a touch panel on a portrait layout: inspector.ts deckOf). A box that overlaps it moves UP until it ends at the
 * deck's top, no higher than the panel's foot (so it covers no panel row, header or word of its own); where it then overlaps the how-to strip the strip is not drawn while the note shows
 * (`yieldsStrip`: from the note's first frame, back in the frame the note closes, never moved: cap's ruling 0d0ef2465804aafb item 2). A box clear of the deck is returned as it is. If it
 * cannot clear the deck above the panel's foot it stays (`blocked`: the tests list it). Pure (drawKeywordLayer, definitionAhead).
 */
export function deckClear(placed: NotePlace, deck: Rect | null | undefined, panel: Rect, strip: Rect | null): NotePlace {
  if (!deck || !overlaps(placed.box, deck)) return placed;
  const b: Rect = { ...placed.box, y: Math.floor(deck.y) - placed.box.h }; // whole px: the deck's top is fractional under the carrier's zoom (231.8), a box is drawn on whole ones
  if (b.y < panel.y + panel.h || b.y < 0) return { ...placed, blocked: true };
  return { ...placed, box: b, yieldsStrip: placed.yieldsStrip || (!!strip && overlaps(b, strip)) };
}

/**
 * PRESENT-2 P (REQ-BFG-081; PRESENT-1's ruling af2c96863a44ab41 item 4, and cap's ruling 26addce8293da756): on the landscape COLUMN (a panel sized to its content, buttons under its text) a shown
 * definition at the foot of the text covered a rule row on 965 of 2,484 boxes on 844x390 @3. Where the column fits the panel there, `col` (built by inspector.ts) carries what the ladder needs, and
 * the note takes the first place that works, in turn: (today) where defBoxPlace put it, if that covers no rule row; (under) under the panel's foot, under its buttons, at the column's full
 * width, where the column has the room (the box and 2 px); (beside) beside the column, in the free strip between its edge and the carrier's drawing (one width a view: 2 px right of the column to
 * 2 px left of the carrier), as tall as its text wrapped to that width, its top level with its word's line, moved up only as far as it must to end 2 px above the screen's foot, never above the
 * column's top; (fallback) else today's place, which the tests list by name. A box never covers a `hard` rect (the carrier's drawing, a shop card, REROLL, a pack, the top bar, FIGHT, the foe
 * card, the cargo bar, the panel), a rule row, the header or its own word's row, and sits whole on the screen. Pure.
 *
 * PRESENT-3 D (REQ-BFG-081; backlog #498 (1); cap's ruling 6420b5479c7c7b92): on the desks the strip beside the column is 35 and 19 px, so 170 and 275 notes (every one a turret panel with a core and
 * gear) still covered a rule row. Two places join the ladder after (beside), in this order: (band) the free room between the shop row's foot and the carrier's drawing, from 2 px right of the
 * column, as wide as the note needs (1-2 lines on 1280x800 and the laptop); (corner) above the column, left of the shop row, under the rune row (closed on a day the ENCHANTER's wagon is up:
 * it uses that margin). A note that is clean in the first three keeps its exact box. Then, when no place takes a note in the 5x7 face, the same five are tried once more in the 3x5 face (`again`
 * gives today's place for a smaller box; the words are the same, none broken, clipped or hyphenated; a note with a character the 3x5 face has no glyph for stays out of the pass: smallFaceHolds).
 */
export interface ColumnSpec {
  covers: (box: Rect) => boolean;
  top: number;
  areaBottom: number;
  beside: { x0: number; x1: number } | null;
  floor: number;
  hard: readonly Rect[];
  /** PRESENT-3 D: the band (null where under one 3x5 line tall or 40 px wide). */
  band?: Rect | null;
  /** PRESENT-3 D: the corner (null with the ENCHANTER's wagon up, or where under one line tall or 40 px wide). */
  corner?: Rect | null;
}
export interface ColumnNote {
  box: Rect;
  lines: RichLine[];
  place: "today" | "under" | "beside" | "band" | "corner" | "fallback";
  /** PRESENT-3 D: the face the lines are in ("3": the small-face pass). */
  face: FontId;
}
/** The ladder in one face: the first place that works for `lines` (wrapped at the panel's text width), or null. `placed` is today's place for a box of these lines. */
function columnLadder(face: FontId, text: string, placed: { box: Rect; fits: boolean }, lines: RichLine[], own: readonly { glyph: Rect }[], head: readonly Rect[], panel: Rect, col: ColumnSpec): ColumnNote | null {
  const pitch = NOTE_PITCH[face];
  if (!col.covers(placed.box)) return { box: placed.box, lines, place: "today", face };
  // `covers` is a test of y alone (the panel's rule rows are all inside the panel): a box BESIDE the column is out of the panel by x, so only the box under the panel is held to it
  const whole = (b: Rect, apart: boolean): boolean => b.y >= 0 && b.y + b.h <= col.floor + 2 && !head.some((q) => overlaps(b, q)) && !own.some((t) => overlaps(t.glyph, b)) && !col.hard.some((q) => overlaps(b, q)) && (apart || !col.covers(b));
  const h = lines.length * pitch + 3, under: Rect = { x: panel.x + 2, y: panel.y + panel.h + 2, w: panel.w - 4, h };
  if (under.y + under.h <= col.areaBottom && whole(under, false)) return { box: under, lines, place: "under", face };
  if (col.beside && col.beside.x1 - col.beside.x0 >= 40) {
    const w = col.beside.x1 - col.beside.x0, l2 = definitionLines(text, w - 6, face), h2 = l2.length * pitch + 3;
    const word = own.length ? Math.min(...own.map((t) => t.glyph.y)) : placed.box.y, y = Math.min(word, col.floor - h2);
    const beside: Rect = { x: col.beside.x0, y, w, h: h2 };
    // no broken or clipped word: wrapRich sets a unit wider than the line on a line of its own, past the box's edge: such a note is not set beside
    if (y >= col.top && l2.every((l) => lineWidth(l, face) <= w - 6) && whole(beside, true)) return { box: beside, lines: l2, place: "beside", face };
  }
  // PRESENT-3 D: the band (its top under the shop row) and the corner (its foot just above the column): the box is as wide as its widest line needs, from the free room's left edge
  for (const [place, room] of [["band", col.band], ["corner", col.corner]] as const) {
    if (!room) continue;
    const l2 = definitionLines(text, room.w - 6, face), h2 = l2.length * pitch + 3;
    if (h2 > room.h || !l2.every((l) => lineWidth(l, face) <= room.w - 6)) continue;
    const box: Rect = { x: room.x, y: place === "band" ? room.y : room.y + room.h - h2, w: Math.min(room.w, Math.max(...l2.map((l) => lineWidth(l, face))) + 6), h: h2 };
    if (whole(box, true)) return { box, lines: l2, place, face };
  }
  return null;
}
export function columnPlace(text: string, placed: { box: Rect; fits: boolean }, lines: RichLine[], own: readonly { glyph: Rect }[], head: readonly Rect[], panel: Rect, col: ColumnSpec,
  again?: (lines: number) => { box: Rect; fits: boolean }): ColumnNote {
  const big = columnLadder("5", text, placed, lines, own, head, panel, col);
  if (big) return big;
  // PRESENT-3 D (cap's ruling 6420b5479c7c7b92 (3)): no place takes it in 5x7: the same ladder once more in the 3x5 face (one general rule), where the face has every character of the note
  if (again && smallFaceHolds(text)) {
    const small = definitionLines(text, panel.w - 10, "3");
    const got = columnLadder("3", text, again(small.length), small, own, head, panel, col);
    if (got) return got;
  }
  return { box: placed.box, lines, place: "fallback", face: "5" };
}

/** CARD-4 (D): a planned panel's header as defBoxPlace avoids it: its rows from the panel's top to the body's (the title,
 *  the sub line, the families, the ⓘ icon), and the drawn buttons (the band's in the header; the column's under the text). */
export function panelHead(plan: Pick<PanelPlan, "r" | "y" | "rects" | "column">, buttons: readonly Rect[] = []): Rect[] {
  const r = plan.r;
  return [{ x: r.x, y: r.y, w: r.w, h: Math.max(1, plan.y - r.y) }, ...(plan.rects ?? []), ...(plan.column ? buttons : [])];
}

/**
 * PRESENT-1 (REQ-BFG-081; S4 (b), cap's ruling af2c96863a44ab41): the definition box drawKeywordLayer will draw for the planned
 * panel `d` in the frame about to be drawn, worked out BEFORE the layer runs and without touching its state, so that
 * inspector.ts panelFit can grow a finger's panel until the box sits clear of the panel's rule rows. It follows the layer step
 * for step (its words, targets, first-sight pick, definitionBox and defBoxPlace), on touch only (`tap` > 0: the desk's hover tips
 * are out of scope). `lines`, `buttons`, `tap`, `screen` and `sight` are what drawDetails passes the layer. `box`: where the layer
 * puts the shown note (null: none this frame; the rig sentence's box by the icon is no definition); `fits`: defBoxPlace's
 * verdict; `hold`: the panel height this open's first-sight chain has shown a note in (KwState.held), which the panel keeps while
 * the chain is under way (0: nothing to keep). A note is wanted when
 * - a word shows already (state.word: a tap's, or a first sight's still open): its note;
 * - this is a new open (no state of this panel, or its first sight not decided yet): the first sight the layer opens now, where
 *   the screen asks for it (`sight`) and the body draws no how-to hint;
 * - the chain (CARD-5) goes on: the note that opened by itself has closed and no box shows: the next one the layer opens now.
 * Pure (panelFit, the tests).
 */
export function definitionAhead(owner: object, run: Run, d: { show: Sel; t: PanelText; plan: PanelPlan; strip?: Rect | null; hang?: NoteHang; deck?: Rect | null },
  lines: readonly { line: PLine | "rule"; y: number }[], buttons: readonly Rect[], tap: number, screen: { W: number; H: number } | undefined,
  sight: boolean): { box: Rect | null; fits: boolean; hold: number; place?: NotePlace } {
  const none = { box: null, fits: true, hold: 0 };
  if (!tap) return none;
  const s0 = STATE.get(owner), s = s0 && s0.key === JSON.stringify(d.show) ? s0 : undefined;
  if (s && s.page !== null) return none; // the ⓘ view is open: it takes the body, no definition shows
  const sightNow = sight && !lines.some((v) => v.line !== "rule" && v.line.block.role === "hint");
  const decided = !!s && s.opened;
  const goesOn = !!s && decided && s.chain && s.word === null && s.auto === null && !s.rig;
  const word0 = s?.word ?? null;
  if (word0 === null && !(sightNow && (decided ? goesOn : sightsLeft()))) return none;
  const { plan } = d, r = plan.r;
  const piece = panelPiece(run, d.show);
  const own = explainWords(d.t, piece, run.day);
  const words = [...own, ...runeWords(run).filter((w) => !own.some((o) => o.word === w.word))];
  if (!words.length && !infoLevels(run, d.show).length && !(d.t.notes ?? []).length) return none; // the layer draws nothing here
  const qr = questionRect(r, plan.y, tap, buttons), avoid = [...buttons, ...(qr ? [qr] : [])];
  const body = keywordTargets(lines, plan, piece, avoid, run.day);
  const targets = [...body, ...familyTargets(plan, [...avoid, ...body.map((t) => t.r)])];
  let word = word0, next = false;
  if (word === null && !(rigSentenceRig(piece) && !rigSeen())) {
    const w = sightWord([...body].sort(reading).map((t) => t.word));
    if (w) {
      word = glossaryEntry(w)?.word ?? w;
      next = true;
    }
  }
  const hold = s && s.chain && (word0 !== null || next) ? s.held : 0;
  const shown = word === null ? undefined : words.find((w) => w.word === word) ?? targets.find((t) => t.word === word);
  if (!shown) return { box: null, fits: true, hold };
  const defLines = definitionLines(shown.text, r.w - 10);
  const ownT = targets.filter((t) => (glossaryEntry(t.word)?.word ?? t.word) === word), head = panelHead(plan, buttons);
  const placed = deckClear(hangPlace(defBoxPlace(definitionBox(r, plan.maxY + 2, defLines.length), ownT, head, d.strip ?? null, screen?.H),
    ownT, head, d.strip ?? null, screen?.H ?? Infinity, d.hang), d.deck, r, d.strip ?? null); // PRESENT-2 L: at the growth limit, under the last rule row; PRESENT-3 H: never over the deck
  return { box: placed.box, fits: placed.fits, hold, place: placed };
}

/** The KEYWORDS view's pages: as many whole definitions as fit the body's height (`h`) each, the header row first. */
export function viewPages(words: readonly KwWord[], w: number, h: number): KwWord[][] {
  const pages: KwWord[][] = [];
  let cur: KwWord[] = [], used = 9;
  for (const kw of words) {
    const need = definitionLines(kw.text, w).length * 9 + 2;
    if (cur.length && used + need > h - 8) {
      pages.push(cur);
      cur = [];
      used = 9;
    }
    cur.push(kw);
    used += need;
  }
  if (cur.length) pages.push(cur);
  return pages;
}

/** U2e step 5 (REQ-BFG-070): one entry of the ⓘ view: a LEVELS line or a keyword's definition, as wrapped lines, under
 *  its section's header (LEVELS first, then KEYWORDS). */
export interface InfoItem {
  /** EXPLAIN-1 (REQ-BFG-089, E4): NOTES, the piece's hidden lines, first. */
  section: "NOTES" | "LEVELS" | "KEYWORDS";
  lines: RichLine[];
  /** The gap under it (a definition's 2 px, as U2c's view; a LEVELS line none, its section's last 2; a NOTES line 2). */
  gap: number;
  level?: LevelLine;
  word?: KwWord;
  /** EXPLAIN-1: a NOTES line's text (markup or glyphs, as the panel's text holds it). */
  note?: string;
  /** CARD-2 (REQ-BFG-081, K5): its lines' face: NOTES in 3x5 (a 7 px pitch), as the hidden lines were drawn on the face;
   *  LEVELS and KEYWORDS in 5x7 (absent: "5", a 9 px pitch). */
  font?: FontId;
}

/** CARD-2 (K5): an entry's line pitch: 7 px for a 3x5 entry (NOTES), 9 for a 5x7 one. */
const pitchOf = (it: Pick<InfoItem, "font">): number => (it.font === "3" ? 7 : 9);

/** The ⓘ view's entries at text width `w`: EXPLAIN-1 (E4) the NOTES lines first (each a separate entry, wrapped in 5x7 as a
 *  definition is), then the LEVELS lines (each wrapped in 5x7), then the KEYWORDS definitions. */
export function infoItems(levels: readonly LevelLine[], words: readonly KwWord[], w: number, notes: readonly string[] = []): InfoItem[] {
  return [
    // CARD-2 (REQ-BFG-081, K5; READ-3 fix 5, EXPLAIN-1 open item 2): NOTES in the 3x5 face (each line its own entry, its
    // keyword in its colour), so most views fit one page; was definitionLines (5x7)
    ...notes.map((note): InfoItem => ({ section: "NOTES", lines: wrapRich(colourize(icons(note), C.bone), w, "3"), gap: 2, note, font: "3" })),
    ...levels.map((level, i): InfoItem => ({ section: "LEVELS", lines: wrapRich(levelSpans(level), w, "5"), gap: i === levels.length - 1 ? 2 : 0, level })),
    ...words.map((word): InfoItem => ({ section: "KEYWORDS", lines: definitionLines(word.text, w), gap: 2, word })),
  ];
}

/** The height an entry takes on a page after `prev` (its section's 9 px header row when it opens the page or a section). */
const itemNeed = (it: InfoItem, prev: InfoItem | undefined): number => (prev?.section === it.section ? 0 : 9) + it.lines.length * pitchOf(it) + it.gap;

/** The ⓘ view's pages: as many whole entries as fit the body's height (`h`), each section's header row before its first
 *  entry on a page (U2c's viewPages, with LEVELS before KEYWORDS); a page footer's room where there are more. */
export function infoPages(items: readonly InfoItem[], h: number): InfoItem[][] {
  const pages: InfoItem[][] = [];
  let cur: InfoItem[] = [], used = 0;
  for (const it of items) {
    const need = itemNeed(it, cur[cur.length - 1]);
    if (cur.length && used + need > h - 8) {
      pages.push(cur);
      cur = [];
      used = 0;
    }
    used += itemNeed(it, cur[cur.length - 1]);
    cur.push(it);
  }
  if (cur.length) pages.push(cur);
  return pages;
}

/** U2f (REQ-BFG-070, REQ-BFG-046): the least free room (px) the ⓘ view grows into: a section's header row and one line. */
export const INFO_FREE_MIN = 20;

/**
 * U2f: the room past a panel `r` that its ⓘ view may grow into, in layout `L` (null: none). On the phone (the portrait
 * band) the room above the panel, over the shop: from the shop's top (its merchant tags too; so under the top bar and the
 * rune row, whose targets stay theirs) to the row above the panel's frame. On the desk (the landscape column, `column`) the
 * column below the panel. Its x and width are the view's (the panel's, 2 px in). Pure (tests).
 * FLIP-X1 (N4-b): the desk's column ends at the screen's bottom at most (L.H), so the view pages rather than draw a line
 * past it where a layout's column runs off the screen (a rune row at a scale pickScale would step down from: NUM-4's shot).
 */
export function infoFree(L: Pick<BuildLayout, "portrait" | "bar" | "cards" | "reroll" | "packs" | "tags" | "info" | "H"> | undefined, r: Rect, column: boolean): Rect | null {
  if (!L) return null;
  let y0: number, y1: number;
  if (column) {
    y0 = r.y + r.h + 1;
    y1 = Math.min(L.info.y + L.info.h, L.H);
  } else if (L.portrait) {
    const shop = Math.min(...[...L.cards, L.reroll, ...L.packs].map((q) => q.y)) - (L.tags ? 7 : 1);
    y0 = Math.max(L.bar.y + L.bar.h + 1, shop);
    y1 = r.y - 1;
  } else return null;
  return y1 - y0 >= INFO_FREE_MIN ? { x: r.x + 2, y: y0, w: r.w - 4, h: y1 - y0 } : null;
}

/** U2f: the ⓘ view's pages over its areas (top to bottom): whole entries, each area opening with its section's header row,
 *  filled in order; the last area keeps a page footer's room. An entry taller than every area goes alone on a page, in the
 *  tallest area (drawView grows that area's box to it, as U2e's view did). Pure (tests). */
export function infoPagesIn(items: readonly InfoItem[], hs: readonly number[]): InfoItem[][][] {
  const pages: InfoItem[][][] = [];
  const last = hs.length - 1;
  const room = (a: number): number => hs[a] - (a === last ? 8 : 0);
  let page: InfoItem[][] = hs.map(() => []), a = 0, used = 0;
  for (const it of items) {
    for (;;) {
      const need = itemNeed(it, page[a][page[a].length - 1]);
      if (used + need <= room(a)) {
        page[a].push(it);
        used += need;
        break;
      }
      if (a < last) {
        a++;
        used = 0;
        continue;
      }
      if (page.every((q) => !q.length)) {
        page[hs.reduce((b, _, i) => (room(i) > room(b) ? i : b), 0)].push(it);
        used = Infinity;
        break;
      }
      pages.push(page);
      page = hs.map(() => []);
      a = 0;
      used = 0;
    }
  }
  if (page.some((q) => q.length)) pages.push(page);
  // a page whose entries all fit the last area (the body) alone shows them there, as U2e's view did
  for (const p of pages) {
    const its = p.flat();
    if (p[last].length < its.length && its.reduce((n, it, i) => n + itemNeed(it, its[i - 1]), 0) <= room(last)) p.forEach((q, i) => { p[i] = i === last ? its : []; });
  }
  return pages;
}

/** U2f: the ⓘ view's areas and their pages. */
export interface InfoView {
  /** The areas, top to bottom (the body last on the phone; one area on the desk). */
  areas: Rect[];
  /** Each page's entries per area. */
  pages: InfoItem[][][];
}

/**
 * U2f (REQ-BFG-070, REQ-BFG-046): the ⓘ view's geometry. While its entries fit the body on one page, U2e's view: the body,
 * from `top` to `bottom`. Else it grows into `free` (infoFree): on the phone the room above the panel, read first, then
 * the body (the panel's header between them, never covered: its title row, star badge, ⓘ button and buttons); on the desk
 * one area from the body down the free column below the panel (over the panel's buttons while open). Nothing changes while
 * the view is closed. Pure (drawView, the tests).
 */
export function infoView(items: readonly InfoItem[], r: Rect, top: number, bottom: number, free: Rect | null): InfoView {
  const body: Rect = { x: r.x + 2, y: top, w: r.w - 4, h: Math.max(0, bottom - top) };
  const one = infoPages(items, body.h);
  if (one.length <= 1 || !free || free.h < INFO_FREE_MIN) return { areas: [body], pages: one.map((p) => [p]) };
  const areas = free.y < r.y ? [free, body] : [{ ...body, h: Math.max(body.h, free.y + free.h - top) }];
  return { areas, pages: infoPagesIn(items, areas.map((q) => q.h)) };
}

/** The ⓘ button's glyph in the icon box's corner: the 5x7 face's `?`, in the box's whole 5x7 (drawn here, so the font needs no new glyph).
 *  POLISH-1 (REQ-BFG-089; P5b, cap's answer 2 on ENCHANT-2W's read): it was a bare "i" with a serif and a foot in 3x5, and desk readers took it for the star level (a 1). THREE
 *  candidates were drawn on a real ★1 panel (the game's own drawDetails) and read blind by fresh seats on both views (O/REPORT.md, P5b): A, a ring round an i (what this was in
 *  48e219d0), was read as a letter badge ("A", "R") by 6 of 8 seats; C, a filled badge with the i cut out, as a padlock or an 8 by 8 of 8; B, this `?`, as a help button that explains the
 *  part by 7 of 8 (and every seat read the star level right). (x, y) is still the old glyph's top-left (box + 1, + 1).
 *  POLISH-2 (REQ-BFG-089; Q3): the mark itself lives in ui/infoGlyph.ts (INFO_GLYPH, drawInfoMark) and is the one mark of every info button (LAST CHANCE's cards, the road's
 *  drop list and the event cards draw it too, each in its own box); this keeps the panel's call and its (x, y). */
export function drawInfoGlyph(g: G, x: number, y: number, colour: string): void {
  drawInfoMark(g, x - 1, y - 1, colour); // the ink box's top-left: the `?` uses all of it
}

/** Draw the 1 art px dotted underline under a word's glyphs (every other pixel), in its colour. */
function underline(g: G, t: KwTarget): void {
  const y = t.glyph.y + t.glyph.h;
  for (let x = t.glyph.x; x < t.glyph.x + t.glyph.w; x += 2) rect(g, x, y, 1, 1, t.colour === C.bone ? C.slate4 : t.colour);
}

/**
 * drawDetails' last step for a planned panel: the underlines and the targets, the `?` button, and whichever is open, the
 * definition or the KEYWORDS view; on the desk, the hover tooltip and the `help` cursor. `owner`: the screen (its state);
 * `ui`: the frame's regions; `buttons`: the drawn buttons' hit rects; `tap`: a finger's target height (0: a mouse).
 */
export function drawKeywordLayer(g: G, owner: object, ui: UI, run: Run, d: { show: Sel; t: PanelText; plan: PanelPlan; hint?: string | null; strip?: Rect | null; hang?: NoteHang; column?: ColumnSpec; deck?: Rect | null },
  lines: readonly { line: PLine | "rule"; y: number }[], buttons: readonly Rect[], tap: number, canvas?: HTMLCanvasElement | null,
  free: Rect | null = null, screen?: { W: number; H: number }, sight = false): void {
  // CARD-2 (REQ-BFG-004, K1): `sight`, the screen asks for the first-sight notes (inspector.ts drawDetails: the build
  // screen in its caravan; a fight's VIEW BATTLEFIELD, the foe's carrier and every other caller never ask)
  const { plan } = d, r = plan.r;
  const piece = panelPiece(run, d.show);
  // CNT-DAY2 (REQ-BFG-100, REQ-BFG-082): a word with no piece (a belt's panel, an empty slot, a turret with no bought core)
  // reads the run's day as a piece's does (the build screen's run; a face's faceRun: the fight's day, the scouted foe's run
  // day); no day: as before
  const own = explainWords(d.t, piece, run.day); // EXPLAIN-1 (E4, E9): the face's words before any line was hidden; HIT on a plain rig
  // the view lists the held runes' keywords after the panel's own words (BRIEF-U2c step 2: the rune keywords too)
  const words = [...own, ...runeWords(run).filter((w) => !own.some((o) => o.word === w.word))];
  const s = stateOf(owner, JSON.stringify(d.show));
  // U2e step 5 (REQ-BFG-070): the ⓘ view shows the piece's LEVELS first, then its KEYWORDS. EXPLAIN-1 (REQ-BFG-089, E4):
  // NOTES, the lines the default face hides, before them; the icon shows on a panel with NOTES too (E3)
  const levels = infoLevels(run, d.show);
  const notes = (d.t.notes ?? []).map((b) => b.text);
  if (!words.length && !levels.length && !notes.length) return setCursor(canvas, false);
  const bottom = plan.maxY + 2;
  const qr = questionRect(r, plan.y, tap, buttons);
  const avoid = [...buttons, ...(qr ? [qr] : [])];
  // U2e step 5: the ⓘ button (U2c's `?` button: the same box, target and hit rect, and its region id `kw:?`): an "i" in
  // the icon box's corner, lit while the view is open
  const qb = questionBox(r);
  rect(g, qb.x + 11, qb.y + 9, 5, 7, C.ink);
  drawInfoGlyph(g, qb.x + 12, qb.y + 10, s.page !== null ? C.yellow : C.brass3);
  if (s.page !== null) frame(g, qb.x - 1, qb.y - 1, qb.w + 2, qb.h + 2, C.yellow);
  if (qr) ui.add({ id: `${KW_REGION}?`, r: qr, onTap: () => { s.page = s.page === null ? 0 : null; s.word = null; } });
  if (s.page !== null) {
    // U2f: `free`, the room past the panel the view may grow into (infoFree: above it on the phone, below on the desk)
    drawView(g, ui, s, infoItems(levels, words, r.w - 10, notes), r, plan.y - 1, bottom, free);
    return setCursor(canvas, false);
  }
  // EXPLAIN-1 (REQ-BFG-089, E3): the desk: the mouse resting on the icon (drawn last, below: the words keep their underlines
  // and targets meanwhile)
  const pm = ui.pointer;
  const tipItems = iconTipItems(d.t, words, piece);
  const onIcon = !tap && pm.kind === "mouse" && !pm.down && !!qr && tipItems.length > 0 && inside(qr, pm.x, pm.y);
  // WORDS-1 (REQ-BFG-081): the header's family tags too, each with its families.ts line (familyTargets)
  const body = keywordTargets(lines, plan, piece, avoid, run.day); // CNT-DAY2: the run's day for a word with no piece
  const targets = [...body, ...familyTargets(plan, [...avoid, ...body.map((t) => t.r)])];
  // CARD-2 (REQ-BFG-004, K1): THE FIRST SIGHT, decided once per open (a fresh state). None where the screen doesn't ask
  // (`sight`) or where the panel shows a how-to tip this time (E5's hint drawn); else the rig sentence on the first rig
  // panel (a rig it is true of), else the first effect keyword not yet seen, in reading order, its definition opened as a
  // finger's tap opens it (touch: `word`, definitionBox at the panel's foot) or as a resting mouse shows it (the desk:
  // drawHoverTip under the word). One box per open; the next waits for the next open.
  // CARD-3 (REQ-BFG-080, C): a band panel draws its hint in a strip by it (detailsPlan's `hint`). CARD-4 (REQ-BFG-004, K;
  // READ-4 10.1: the first rigs' keywords never opened before the first fight): a strip is not a note, so the first
  // sight opens beside it (its box kept off the strip: defBoxPlace); a hint drawn in the body (the column) still waits
  const sightNow = sight && !lines.some((v) => v.line !== "rule" && v.line.block.role === "hint");
  /** The next first sight: the rig sentence, else the first keyword not yet seen in reading order (true: one opened). */
  const nextSight = (): boolean => {
    if (rigSentenceRig(piece) && !rigSeen()) return (s.rig = true);
    const w = sightWord([...body].sort(reading).map((t) => t.word));
    if (w && tap) s.word = glossaryEntry(w)?.word ?? w;
    else if (w) s.auto = w;
    return !!w;
  };
  if (!s.opened) {
    s.opened = true;
    if (sightNow) s.chain = nextSight();
  } else if (s.chain && sightNow && s.word === null && s.auto === null && !s.rig && s.page === null && !onIcon
    && !(!tap && pm.kind === "mouse" && !pm.down && targets.some((t) => inside(t.r, pm.x, pm.y)))) {
    // CARD-5 (REQ-BFG-004, K; READ-5 11.1 run F: SPOTTER's AIM never opened, as K1 showed one keyword per open): the note
    // that opened by itself has closed (any press closes it, a tap on its word too) and no box shows (no word's, no view,
    // no hover or icon tooltip), while the panel is still open: the next keyword not yet seen opens its note the same way,
    // one at a time, until none is left; one left when the panel closes opens on a later open, as before. A box the player
    // opened himself waits for its own close (two boxes never show at once)
    s.chain = nextSight();
  }
  // the shown definition covers the panel's bottom rows: the words under it are not targets meanwhile
  const shown = s.word ? words.find((w) => w.word === s.word) ?? targets.find((t) => t.word === s.word) : undefined;
  const defLines = shown ? definitionLines(shown.text, r.w - 10) : [];
  // CARD-3 (REQ-BFG-087, D1; REVIEW-CARD2 open item 1): the box sits at the panel's foot, unless it would cover the word it
  // explains there (a short phone panel's last rows: TEMPER's BURN box over [BURN]+1). CARD-4 (REQ-BFG-087, D): then just
  // under the word's line, or above it only where that misses the header, never over the header or the hint strip
  const ownT = shown ? targets.filter((t) => (glossaryEntry(t.word)?.word ?? t.word) === s.word) : [], head = shown ? panelHead(plan, buttons) : [];
  const foot = shown ? deckClear(hangPlace(defBoxPlace(definitionBox(r, bottom, defLines.length), ownT, head, d.strip ?? null, screen?.H),
    ownT, head, d.strip ?? null, screen?.H ?? Infinity, d.hang), d.deck, r, d.strip ?? null) : null; // PRESENT-2 L: at the growth limit, under the last rule row; PRESENT-3 H: never over the deck
  // PRESENT-2 P (cap's ruling 26addce8293da756): on the landscape column, where that place covers a rule row: under the panel, else beside the column (columnPlace)
  const cn = shown && foot && d.column ? columnPlace(shown.text, foot, defLines, ownT, head, r, d.column,
    (n) => defBoxPlace(definitionBox(r, bottom, n, NOTE_PITCH["3"]), ownT, head, d.strip ?? null, screen?.H)) : null; // PRESENT-3 D: today's place for a 3x5 box
  const box = cn ? cn.box : foot ? foot.box : null, shownLines = cn ? cn.lines : defLines;
  s.place = cn ? cn.place : null;
  s.face = cn ? cn.face : null;
  s.text = box && shown ? shown.text : null;
  s.note = box ? shownLines : null;
  const noteFace: FontId = cn ? cn.face : "5";
  // PRESENT-1 (S4 (b)): the panel's height while this open's first-sight chain shows a note (definitionAhead's `hold`); 0 once it is over
  s.held = s.chain ? Math.max(s.held, box ? r.h : 0) : 0;
  targets.forEach((t, i) => {
    if (box && overlaps(t.glyph, box)) return;
    underline(g, t);
    ui.add({ id: `${KW_REGION}${i}:${t.word}`, r: t.r, onTap: () => { s.word = s.word === t.word ? null : glossaryEntry(t.word)?.word ?? t.word; } });
  });
  if (box) {
    rect(g, box.x, box.y, box.w, box.h, C.navy);
    rect(g, box.x, box.y, box.w, 1, C.slate1);
    shownLines.forEach((ln, i) => drawRich(g, ln, box.x + 3, box.y + 3 + i * NOTE_PITCH[noteFace], noteFace)); // PRESENT-2 P: box.x + 3 is r.x + 5 for today's box (x r.x + 2); PRESENT-3 D: the 3x5 face's lines are 7 px apart
    ui.add({ id: "kwdef", r: box, block: true });
  }
  // the desk: a hovered word's definition in the shop's tooltip style, and the help cursor
  const p = ui.pointer;
  // (not the word whose definition is open: a click leaves the mouse on it, and the box already says it)
  const hov = !tap && p.kind === "mouse" && !p.down
    ? targets.find((t) => inside(t.r, p.x, p.y) && !(box && overlaps(t.glyph, box)) && (glossaryEntry(t.word)?.word ?? t.word) !== s.word) : undefined;
  // EXPLAIN-1 (REQ-BFG-089, E3): the mouse on the icon shows the NOTES (and a plain rig's HIT) beside the panel, in the word
  // tooltip's style, whole and on the screen, with the help cursor; a click opens the ⓘ view as before
  if (onIcon) {
    const tr = iconTipRect(tipItems, r, screen);
    drawIconTip(g, tipItems, tr);
    ui.add({ id: `${KW_REGION}tip`, r: tr, block: true });
    s.hover = "ⓘ";
    // CARD-2 (K1): the player's own look at NOTES: the rig sentence there counts as seen; a first-sight box gives way
    if (tipItems.includes(RIG_SENTENCE)) sawRig();
    s.auto = null;
    s.rig = false;
    return setCursor(canvas, true);
  }
  // a word's own definition on screen (its tap, its hover, or its first sight) is done (firstSight.ts)
  if (shown && box) sawWord(shown.word);
  s.hover = hov ? hov.word : null;
  setCursor(canvas, !!hov);
  if (hov) {
    drawHoverTip(g, hov, r);
    sawWord(hov.word);
    s.auto = null; // the player's own hover replaces a first-sight box
    s.rig = false;
  }
  if (box) s.auto = null;
  if (s.page !== null || box) s.rig = false;
  // the desk's first-sight box: the word's definition in the hover tooltip's look, under the word, a UI region
  const at = s.auto ? targets.find((t) => t.word === s.auto) : undefined;
  if (s.auto && !at) s.auto = null;
  if (at) {
    ui.add({ id: SIGHT_REGION, r: drawHoverTip(g, at, r), block: true });
    sawWord(at.word);
  }
  // the rig sentence's box: by the panel's icon, in the icon tooltip's look (iconTipRect, drawIconTip), a UI region.
  // CARD-4 run 2 (REQ-BFG-087): where the screen has no room beside the panel (a phone's band panel), under the panel and
  // its strip, off the shop (rigTipRect). PRESENT-4 T (F10): there, its place is rigPlace's (inside the panel's body, else
  // the strip's place with the strip yielding, else rigTipRect's), chosen once from the box's first frame (KwState.rigAt)
  if (s.rig) {
    const items = [RIG_SENTENCE], pl = s.rigAt ?? (s.rigAt = rigPlace(items, r, screen, d.strip ?? null, rigRowsEnd(lines, plan), d.deck));
    drawIconTip(g, items, pl.box);
    ui.add({ id: SIGHT_REGION, r: pl.box, block: true });
    sawRig();
  } else s.rigAt = null;
}

/** FLIP-X1 (N4-b): one text row the ⓘ view draws: a section's header (3x5, `section`) or one line of an entry (5x7,
 *  `line`), at its top `y`, `h` px tall, in area `area`. */
export interface InfoRow {
  area: number;
  y: number;
  h: number;
  section?: InfoItem["section"];
  line?: RichLine;
  /** CARD-2 (K5): the line's face (NOTES "3"; absent: "5"). */
  font?: FontId;
}

/** FLIP-X1 (N4-b): page `page` of the ⓘ view as drawView draws it: its areas and pages (infoView), each area's box (null
 *  where none is drawn), every text row, and the footer's top (`TAP FOR MORE n/m`, on the last page `TAP TO CLOSE m/m`: infoFootText; 3x5) where there are more pages. */
export interface InfoDrawn {
  view: InfoView;
  boxes: (Rect | null)[];
  rows: InfoRow[];
  foot: number | null;
}

/**
 * FLIP-X1 (N4-b, REQ-BFG-046): drawView's geometry, pure, so a test can measure where the view's last text line ends (the
 * U2f view's code, moved here unchanged; drawView draws from it). The view's areas and pages are infoView's; each area's
 * box holds its page's entries, each under its section's header; the footer sits at the end of the last area's box.
 */
export function infoDrawn(items: readonly InfoItem[], r: Rect, top: number, bottom: number, free: Rect | null, page: number): InfoDrawn {
  // U2f: the view's areas (infoView: U2e's body alone while one page holds it; else the room above the panel then the body
  // on the phone, or the body down the free column on the desk), each a box of its page's entries; one footer, at the end
  const view = infoView(items, r, top, bottom, free);
  const { areas, pages } = view;
  const pg = pages[Math.min(page, pages.length - 1)];
  const last = areas.length - 1;
  const boxes: (Rect | null)[] = [], rows: InfoRow[] = [];
  let foot = bottom;
  areas.forEach((a, ai) => {
    const its = pg[ai] ?? [];
    const need = its.reduce((n, it, i) => n + itemNeed(it, its[i - 1]), 0) + (ai === last && pages.length > 1 ? 8 : 0);
    let box: Rect;
    if (ai === last) {
      // the body's box (U2e's: the whole body, higher where one entry needs more); on the desk as far down the column as
      // its entries need
      const end = Math.max(bottom, Math.min(a.y + a.h, a.y + need + 3));
      const y0 = Math.min(a.y, end - need);
      box = { x: a.x, y: y0, w: a.w, h: end - y0 };
      foot = end;
    } else {
      // the phone's room above the panel: a box as tall as its entries, on the panel's top edge
      if (!its.length) {
        boxes.push(null);
        return;
      }
      const h = Math.min(a.h, need + 3);
      box = { x: a.x, y: a.y + a.h - h, w: a.w, h };
    }
    boxes.push(box);
    let y = box.y + 2;
    // SPACE-1 (REQ-BFG-087, D5): the view keeps its size and its pages; the room its page leaves in its box (past the
    // 2 px top and 1 px foot) goes to the gaps between its entries (each LEVELS line, each definition: separate items), up
    // to the 5x7 face's GAP each, all alike; none where the box is sized to its entries (the room above the panel)
    const slots = Math.max(0, its.length - 1);
    const px = slots ? Math.max(0, Math.min(GAP["5"], Math.floor((box.h - 3 - need) / slots))) : 0;
    its.forEach((it, i) => {
      if (its[i - 1]?.section !== it.section) {
        // the section's header row (U2c's "KEYWORDS" at the view's top; a second header sits under the LEVELS; U2f: each
        // area opens with its section's header)
        rows.push({ area: ai, y: y + 1, h: 5, section: it.section });
        y += 9;
      }
      // CARD-2 (K5): a NOTES entry's lines in 3x5 (5 px tall, a 7 px pitch)
      for (const ln of it.lines) {
        rows.push({ area: ai, y, h: it.font === "3" ? 5 : 7, line: ln, ...(it.font === "3" ? { font: "3" as FontId } : {}) });
        y += pitchOf(it);
      }
      y += it.gap + (i < its.length - 1 ? px : 0);
    });
  });
  return { view, boxes, rows, foot: pages.length > 1 ? foot - 7 : null };
}

/** The ⓘ view over the body (from `top` to `bottom`; U2c's KEYWORDS view, U2e step 5: its LEVELS first): its page of
 *  entries, each in 5x7 under its section's header; a page footer where there are more. A tap on it turns the page; past
 *  the last, it closes. FLIP-X1 (N4-b): drawn from infoDrawn, its geometry. */
function drawView(g: G, ui: UI, s: KwState, items: readonly InfoItem[], r: Rect, top: number, bottom: number, free: Rect | null = null): void {
  const { view: { pages }, boxes, rows, foot } = infoDrawn(items, r, top, bottom, free, s.page ?? 0);
  const turn = (): void => { s.page = (s.page ?? 0) + 1 >= pages.length ? null : (s.page ?? 0) + 1; };
  boxes.forEach((box, ai) => {
    if (!box) return;
    // past the panel's frame, an ink edge: around the room above the panel; down the desk's column, from the panel's edge
    // (never over the header)
    const be = box.y + box.h, rb = r.y + r.h;
    if (be <= r.y) frame(g, box.x - 1, box.y - 1, box.w + 2, box.h + 2, C.ink);
    else if (be > rb) {
      rect(g, box.x - 1, rb, 1, be + 1 - rb, C.ink);
      rect(g, box.x + box.w, rb, 1, be + 1 - rb, C.ink);
      rect(g, box.x - 1, be, box.w + 2, 1, C.ink);
    }
    rect(g, box.x, box.y, box.w, box.h, C.navy);
    rect(g, box.x, box.y, box.w, 1, C.slate1);
    for (const row of rows) {
      if (row.area !== ai) continue;
      if (row.section) drawText(g, row.section, r.x + 5, row.y, C.brass3, { font: "3" });
      else if (row.line) drawRich(g, row.line, r.x + 5, row.y, row.font ?? "5");
    }
    ui.add({ id: `${KW_REGION}view`, r: box, onTap: turn });
  });
  if (foot !== null) drawText(g, infoFootText(s.page ?? 0, pages.length), r.x + r.w - 5, foot, C.slate4, { font: "3", align: "right" });
}

/**
 * PRESENT-4 N (REQ-BFG-089; STAGE-0915's F7 and F12: every page of the ⓘ view, the last one included, read `TAP FOR MORE n/N`): the footer's words. A tap on a page turns it (drawView's `turn`), and past the
 * last page it closes the view, so the last page says `TAP TO CLOSE N/N`; the others are as they were. Both are 12 letters and spaces in the 3x5 face, 45 px wide: the new words fit wherever the old ones did.
 */
export const infoFootText = (page: number, pages: number): string => `${page + 1 >= pages ? "TAP TO CLOSE" : "TAP FOR MORE"} ${page + 1}/${pages}`;

/** EXPLAIN-1 (REQ-BFG-089, E3): the icon tooltip's text width (3x5 px), as the word tooltip's (drawHoverTip). */
export const ICON_TIP_W = 150;

/** EXPLAIN-1 (E3): the icon tooltip's lines: each item wrapped in 3x5 at ICON_TIP_W (today's 7 px pitch inside one
 *  sentence), its keyword in its colour, as drawHoverTip writes a definition. */
export const iconTipLines = (items: readonly string[]): RichLine[][] => items.map((t) => wrapRich(colourize(icons(t), C.bone), ICON_TIP_W, "3"));

/**
 * EXPLAIN-1 (REQ-BFG-089, E3): where the icon's hover tooltip goes for panel `r`: beside the panel, top-aligned with it
 * (its right, else its left), else above it, else below it, kept on the screen (`screen`, the build screen's W and H). Its
 * size: drawHoverTip's frame (5 px in, 4 px over the first line, 4 under the last) round the items, each a separate item
 * with the 3x5 face's GAP between two of them (SPACE-1, REQ-BFG-087) and the 7 px pitch inside one. Pure (tests).
 */
export function iconTipRect(items: readonly string[], r: Rect, screen?: { W: number; H: number }): Rect {
  const ls = iconTipLines(items);
  const w = Math.max(...ls.flat().map((l) => lineWidth(l, "3"))) + 10;
  const h = 8 + ls.reduce((n, l) => n + l.length * 7, 0) + Math.max(0, ls.length - 1) * GAP["3"];
  const W = screen?.W ?? r.x + r.w + w + 6, H = screen?.H ?? r.y + h + 4;
  const fitsX = (x: number) => x >= 2 && x + w + 2 <= W, clampY = (y: number) => Math.max(2, Math.min(H - h - 2, y));
  if (fitsX(r.x + r.w + 4)) return { x: r.x + r.w + 4, y: clampY(r.y), w, h };
  if (fitsX(r.x - w - 6)) return { x: r.x - w - 6, y: clampY(r.y), w, h };
  const x = Math.max(2, Math.min(W - w - 2, r.x));
  if (r.y - h - 6 >= 2) return { x, y: r.y - h - 6, w, h };
  return { x, y: Math.max(2, Math.min(H - h - 2, r.y + r.h + 4)), w, h };
}

/**
 * CARD-4 run 2 (REQ-BFG-087, REQ-BFG-004; RESTART-RUN2 3 (b): READ-4 F step 7, run 1's tip1 and tip2): the rig sentence's
 * first-sight box. Beside the panel where the screen has room (iconTipRect's place: the desk's column); where it hasn't (a
 * phone's band panel spans the screen) just under the panel and its how-to strip, on the deck side, where the screen holds
 * it (iconTipRect put it above the panel, over shop cards 4 and 5, their prices and REROLL's edge); else just above the
 * panel and its strip; else iconTipRect's place. Never over the panel (its header, its word's row) or the strip where one
 * of those fits. Any press closes it (keywordsPressed), as before. Pure (drawKeywordLayer, tests).
 */
export function rigTipRect(items: readonly string[], r: Rect, screen?: { W: number; H: number }, strip: Rect | null = null): Rect {
  const tr = iconTipRect(items, r, screen);
  if (tr.x >= r.x + r.w || tr.x + tr.w <= r.x) return tr;
  const H = screen?.H ?? Infinity;
  const below = Math.max(r.y + r.h, strip && strip.y >= r.y + r.h ? strip.y + strip.h : 0) + 4;
  if (below + tr.h + 2 <= H) return { ...tr, y: below };
  const above = Math.min(r.y, strip && strip.y < r.y ? strip.y : r.y) - tr.h - 6;
  if (above >= 2) return { ...tr, y: above };
  return tr;
}

/**
 * PRESENT-4 T (REQ-BFG-087, REQ-BFG-004; STAGE-0915's F10; cap's call): the first-run rig sentence's box on a phone's band panel went just under the panel and its how-to strip (rigTipRect), so on 402x690 it
 * covered the hull's top and the deck's first row (546 of 546 boxes on every one of the five checked phone views, every tip new; the strip above it tells the player to drag the rig onto that deck). Where the box
 * is placed (chosen ONCE, from its first frame: KwState.rigAt; never moved while it shows), in this order:
 *   (1) `inside`: inside the panel's own body, under its last row (`rowsEnd`: the lowest text row's foot) and 2 px clear of it, where the box fits whole 2 px clear of the panel's edge (its 2 px drop shadow, drawIconTip's, ends inside the frame);
 *   (2) `strip`: the how-to strip yields (it is not drawn from the box's first frame, back in the frame the box closes, never moved: cap's ruling 0d0ef2465804aafb item 2, as definitionAhead's `yieldsStrip`) and
 *       the box takes the strip's place (its top at the strip's top), where it then covers no deck cell (`deck`: a touch panel on a portrait layout, inspector.ts deckOf). With no strip this open (the tips are
 *       done and only the first sight is left) there is nothing to yield: the place is the panel's foot, taken only where rigTipRect's place would cover a deck cell (a box that clears the deck stays where it was);
 *   (3) `today`: rigTipRect's place (the tests list the panels that land here).
 * Where the box goes beside the panel (the desk's, the landscape phone's column) its place is rigTipRect's, as before. Its x and size are rigTipRect's; only y moves. Pure (the layer, rigAhead, the tests).
 */
export interface RigPlace {
  box: Rect;
  place: "inside" | "strip" | "today";
  /** the box is in the strip's place and a strip is under the panel: the strip is not drawn while the box shows */
  yieldsStrip: boolean;
}
export function rigPlace(items: readonly string[], r: Rect, screen: { W: number; H: number } | undefined, strip: Rect | null, rowsEnd: number, deck: Rect | null | undefined): RigPlace {
  const today = rigTipRect(items, r, screen, strip);
  if (today.x >= r.x + r.w || today.x + today.w <= r.x) return { box: today, place: "today", yieldsStrip: false }; // beside the panel: as before
  const inside: Rect = { ...today, y: rowsEnd + 2 };
  if (inside.y + inside.h + 2 <= r.y + r.h) return { box: inside, place: "inside", yieldsStrip: false };
  if (deck) {
    const top = Math.floor(deck.y), H = screen?.H ?? Infinity; // the deck's top is fractional under the carrier's zoom: whole px, as deckClear
    const clear = (b: Rect): boolean => b.y + b.h <= top && b.y + b.h <= H;
    const at: Rect = { ...today, y: strip ? strip.y : r.y + r.h };
    if (strip ? clear(at) : !clear(today) && clear(at)) return { box: at, place: "strip", yieldsStrip: !!strip };
  }
  return { box: today, place: "today", yieldsStrip: false };
}
/** PRESENT-4 T: the foot of the panel's lowest text row (5x7 rows are 7 px tall, 3x5 rows 5), at least the body's top. */
export const rigRowsEnd = (lines: readonly { line: PLine | "rule"; y: number }[], plan: Pick<PanelPlan, "y">): number =>
  Math.max(plan.y, ...lines.filter((v) => v.line !== "rule").map((v) => v.y + ((v.line as { font: FontId }).font === "5" ? 7 : 5)));
/**
 * PRESENT-4 T: the place the rig sentence's box has in THIS frame, worked out before the panel draws its strip (inspector.ts drawDetails, as definitionAhead is for a note): the place of its first frame while it
 * shows, or, on a new open where the layer will open it now (the screen asks for first sights, the body draws no how-to hint, the rig is one the sentence is true of and it is not seen yet, the layer has
 * something to draw), the place rigPlace gives. null: no sentence this frame. Pure.
 */
export function rigAhead(owner: object, run: Run, d: { show: Sel; t: PanelText; plan: PanelPlan; strip?: Rect | null; deck?: Rect | null },
  lines: readonly { line: PLine | "rule"; y: number }[], screen: { W: number; H: number } | undefined, sight: boolean): RigPlace | null {
  const s0 = STATE.get(owner), s = s0 && s0.key === JSON.stringify(d.show) ? s0 : undefined;
  // shown: the place of its first frame, unless a tapped word's note or the ⓘ view takes the panel this frame (the layer closes the sentence then: drawKeywordLayer's `if (s.page !== null || box) s.rig = false`)
  if (s?.rig && s.rigAt) return s.word !== null || s.page !== null ? null : s.rigAt;
  if (s?.opened) return null; // this open's first sight is decided: the sentence shows only through rigAt
  if (!sight || lines.some((v) => v.line !== "rule" && v.line.block.role === "hint")) return null;
  const piece = panelPiece(run, d.show);
  if (!(rigSentenceRig(piece) && !rigSeen())) return null;
  const own = explainWords(d.t, piece, run.day);
  const words = [...own, ...runeWords(run).filter((w) => !own.some((o) => o.word === w.word))];
  if (!words.length && !infoLevels(run, d.show).length && !(d.t.notes ?? []).length) return null; // the layer draws nothing here
  return rigPlace([RIG_SENTENCE], d.plan.r, screen, d.strip ?? null, rigRowsEnd(lines, d.plan), d.deck);
}

/** EXPLAIN-1 (E3): the icon's hover tooltip in `tr` (iconTipRect), drawHoverTip's style: an ink frame and shadow, night,
 *  a slate3 top edge; the items in 3x5, GAP apart. A rune card's chip draws its hidden line with it (runeBar.ts). */
export function drawIconTip(g: G, items: readonly string[], tr: Rect): void {
  rect(g, tr.x + 2, tr.y + 2, tr.w, tr.h, C.ink);
  rect(g, tr.x, tr.y, tr.w, tr.h, C.ink);
  rect(g, tr.x + 1, tr.y + 1, tr.w - 2, tr.h - 2, C.night);
  rect(g, tr.x + 1, tr.y + 1, tr.w - 2, 1, C.slate3);
  let y = tr.y + 4;
  for (const ls of iconTipLines(items)) {
    for (const l of ls) {
      drawRich(g, l, tr.x + 5, y, "3");
      y += 7;
    }
    y += GAP["3"];
  }
}

/** The desk's hover tooltip (shop.ts drawTooltip's style: night, an ink frame and shadow) under the word, as the shop's
 *  sits under its card (the panel's title and the word stay in sight). CARD-2 (K1): returns its rect (a first-sight box
 *  in this look is a UI region). */
function drawHoverTip(g: G, t: KwTarget, r: Rect): Rect {
  return drawWordTip(g, t.text, t.colour, t.glyph, r);
}

/** CARD-2 (REQ-BFG-081, K1, K2): drawHoverTip's box for a definition `text` (markup) of a word drawn at `glyph` on panel or
 *  card `r`, its top edge in the word's `colour`; on `screen` where given, kept on it (a rune card on a narrow screen).
 *  Returns its rect. */
export function drawWordTip(g: G, text: string, colour: string, glyph: Rect, r: Rect, screen?: { W: number; H: number }, avoid?: Rect | null): Rect {
  const lines = wrapRich(colourize(icons(text), C.bone), 150, "3");
  const w = Math.max(...lines.map((l) => lineWidth(l, "3"))) + 10, h = 8 + lines.length * 7;
  let x = Math.max(2, Math.min(r.x + r.w + 200 - w, glyph.x - 4));
  if (screen) x = Math.max(2, Math.min(screen.W - w - 2, x));
  let y = glyph.y + glyph.h + 4;
  // CARD-3 (REQ-BFG-087, D2; REVIEW-CARD2 open item 3): under the word it would cover `avoid` (a rune card's TAP AGAIN TO
  // TAKE IT bar, its shadow 2 px included): then above the word, where the screen's top allows
  if (avoid && overlaps({ x, y, w: w + 2, h: h + 2 }, avoid) && glyph.y - 4 - h >= 2) y = glyph.y - 4 - h;
  rect(g, x + 2, y + 2, w, h, C.ink);
  rect(g, x, y, w, h, C.ink);
  rect(g, x + 1, y + 1, w - 2, h - 2, C.night);
  rect(g, x + 1, y + 1, w - 2, 1, colour === C.bone ? C.slate3 : colour);
  lines.forEach((l, i) => drawRich(g, l, x + 5, y + 4 + i * 7, "3"));
  return { x, y, w, h };
}

let cursorHelp = false;
/** The canvas's cursor: `help` over a word (desk), else the page's own. */
function setCursor(canvas: HTMLCanvasElement | null | undefined, on: boolean): void {
  if (!canvas || on === cursorHelp) return;
  cursorHelp = on;
  canvas.style.cursor = on ? "help" : "";
}

/** drawDetails, before it draws (or with no panel): the help cursor goes until a word is hovered again. */
export function keywordCursorOff(canvas?: HTMLCanvasElement | null): void {
  setCursor(canvas, false);
}

/** EXPLAIN-1 (REQ-BFG-089, E3): the help cursor for a hovered rune chip (runeBar.ts runeChipIcon), drawn after the panel. */
export function helpCursor(canvas: HTMLCanvasElement | null | undefined, on: boolean): void {
  setCursor(canvas, on);
}

export { keywordRow };
