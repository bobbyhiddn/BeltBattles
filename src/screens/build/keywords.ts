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
import { ICON, KEYWORDS, drawText, icons, textWidth, type FontId } from "../../render/font";
import { colourize, drawRich, lineText, lineWidth, wrapRich, type RichLine } from "../../ui/richText";
import { glossaryEntry, glossaryHits, glossaryText, keywordRow, tapNote } from "../../ui/glossary";
import { STAT_ICONS, statIconNote } from "../../ui/glossary"; // WORDS-1 (REQ-BFG-081): the stat icons' notes
import { ICON_COLOUR } from "../../render/font"; // WORDS-1: a stat icon's underline in its colour ({RATE} yellow)
import { FAMILY, familyNote } from "../../ui/families"; // WORDS-1: the family tags' taps (familyTargets)
import type { ModuleTag } from "../../sim/content"; // WORDS-1
import { tapRect, inside, type Rect, type UI } from "../../ui/ui";
import type { TextOpts } from "../../ui/abilityText";
import { hasFace } from "../../ui/faces";
import type { Sel } from "./layout";
import { RUNES } from "../../sim/runes";
import { KEYWORD_WORD, runeKeywords } from "../../ui/runeText";
import type { Block, PLine, PanelPlan, PanelText } from "./inspector";
import { levelLines, levelSpans, type LevelLine } from "./levels"; // U2e step 5 (REQ-BFG-070): the ⓘ view's LEVELS
import { fusible } from "../../sim/stars"; // U2e step 5
import type { BuildLayout } from "./layout"; // U2f: the room the ⓘ view grows into (infoFree)
import { GAP } from "../../ui/spacing"; // SPACE-1 (REQ-BFG-087): the gaps between the ⓘ view's entries
import { isPlainRig } from "../../ui/faces"; // EXPLAIN-1 (REQ-BFG-084 step 0b, E9): HIT on the plain rigs' KEYWORDS (SHAPES-1: isPlainRig)

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

/** The spans [at, end) of a line's text that name a word, each with what a tap shows. */
function matches(text: string, l: PLine, first: boolean, piece: Piece | null): { at: number; end: number; word: string; text: string; colour: string }[] {
  const out: { at: number; end: number; word: string; text: string; colour: string }[] = [];
  const free = (a: number, b: number) => !out.some((m) => a < m.end && m.at < b);
  const add = (at: number, end: number, word: string) => {
    if (end <= at || !free(at, end)) return;
    const shown = glossaryText(word, piece ?? undefined);
    if (!shown) return;
    const row = glossaryEntry(word);
    out.push({ at, end, word, text: shown, colour: row?.colour ?? C.bone });
  };
  // the keywords as drawn: the icon and its word (panel style), or the icon alone
  for (const k of KEYWORDS) {
    for (let i = text.indexOf(ICON[k]); i >= 0; i = text.indexOf(ICON[k], i + 1)) add(i, text.startsWith(k, i + 1) ? i + 1 + k.length : i + 1, k);
  }
  const b = l.block;
  // WORDS-1 (REQ-BFG-081; cap's design call 3): the stat icons {RATE}, {SLUG} and {GEAR} on an ability line (a face's stat
  // row and rule lines, the turret panel's stat row), each with its note (glossary.ts statIconNote: {SLUG} by the piece's
  // kind; a row with a {GEAR} pair is a turret's stat row)
  if (b.role === "ability") {
    const kind = piece ? ITEMS[piece.def]?.kind : undefined, gunRow = text.includes(ICON.GEAR) && text.includes(ICON.RATE);
    for (const k of STAT_ICONS) {
      for (let i = text.indexOf(ICON[k]); i >= 0; i = text.indexOf(ICON[k], i + 1)) {
        if (free(i, i + 1)) out.push({ at: i, end: i + 1, word: k, text: statIconNote(k, kind, gunRow), colour: ICON_COLOUR[ICON[k]] ?? C.bone });
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

/**
 * The tap targets of a planned panel (pure; drawDetails and the tests): every word its visible lines name (see the file
 * comment), each its glyphs grown to its line's pitch and at least a pitch wide, the nearest winning where two meet, inside
 * the panel `r` (1 px in from its frame) and clear of `avoid` (the buttons' grown rects and the `?` button's). A target
 * whose rect would be empty is left out (its word is still in the KEYWORDS view).
 */
export function keywordTargets(lines: readonly { line: PLine | "rule"; y: number }[], plan: Pick<PanelPlan, "r">, piece: Piece | null,
  avoid: readonly Rect[] = []): KwTarget[] {
  const r = plan.r, x0 = r.x + 5;
  const firsts = new Set<Block>();
  const raw: (KwTarget & { cx: number; cy: number })[] = [];
  for (const v of lines) {
    if (v.line === "rule" || v.line.cells) continue;
    const l = v.line, text = lineText(l.spans), first = !firsts.has(l.block);
    firsts.add(l.block);
    const lx = x0 + (l.indent ?? 0), gh = GLYPH_H[l.font];
    for (const m of matches(text, l, first, piece)) {
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
 */
export function familyTargets(plan: Pick<PanelPlan, "r" | "famHead">, avoid: readonly Rect[] = []): KwTarget[] {
  const fh = plan.famHead, r = plan.r;
  if (!fh) return [];
  const within = { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 }, out: KwTarget[] = [];
  const push = (tag: ModuleTag, glyph: Rect) => {
    let q: Rect | null = clamp(grow({ x: glyph.x - 1, y: glyph.y, w: glyph.w + 2, h: glyph.h }, 7, 7), within);
    for (const a of avoid) if (q) q = clipOut(q, a);
    for (const t of out) if (q && overlaps(q, t.r)) q = clipOut(q, t.r);
    if (q && inside(q, Math.floor(glyph.x + glyph.w / 2), Math.floor(glyph.y + glyph.h / 2))) {
      out.push({ word: `${tag} FAMILY`, text: familyNote(tag), colour: FAMILY[tag].colour, glyph, r: q });
    }
  };
  if (fh.names) {
    // drawFamHead: "FORGE, TEMPO" in 3x5, under the sub line (x + 23, y + 19), or right-aligned on the sub line's second row
    // (y + 19) or the title's (y + 5)
    const text = fh.tags.join(", "), x0 = fh.at === "sub" ? r.x + 23 : r.x + r.w - 4 - textWidth(text, "3");
    const y0 = r.y + (fh.at === "title" ? 5 : 19);
    fh.tags.forEach((tag, i) => {
      const before = i ? textWidth(`${fh.tags.slice(0, i).join(", ")}, `, "3") + 1 : 0;
      push(tag, { x: x0 + before, y: y0, w: textWidth(tag, "3"), h: GLYPH_H["3"] });
    });
    return out;
  }
  // drawFamHead's marks: 3x3 each, 4 px apart, from (x + 23, y + 20) under the sub line, else right-aligned (y + 6 by the
  // title, y + 20 by the sub line's second row)
  const x0 = fh.at === "sub" ? r.x + 23 : r.x + r.w - 4 - (fh.tags.length * 4 - 1), y0 = r.y + (fh.at === "title" ? 6 : 20);
  fh.tags.forEach((tag, i) => push(tag, { x: x0 + i * 4, y: y0, w: 3, h: 3 }));
  return out;
}

/** The keywords of the runes the run holds (runeText.ts runeKeywords), in pick order, each with its glossary row's
 *  definition: the KEYWORDS view lists them after the panel's own words (BURN, RIDE, STUN, ...). */
export function runeWords(run: Run): KwWord[] {
  const out: KwWord[] = [];
  for (const h of run.build.runes ?? []) {
    const d = RUNES[h.id];
    if (!d) continue;
    for (const k of runeKeywords(d)) {
      const row = glossaryEntry(KEYWORD_WORD[k]);
      if (row && !out.some((w) => w.word === row.word)) out.push({ word: row.word, text: row.def, colour: row.colour });
    }
  }
  return out;
}

/**
 * EXPLAIN-1 (REQ-BFG-089, E4; REQ-BFG-084 step 0b, E9): the words a drawn panel's ⓘ KEYWORDS lists: panelWords over its
 * text's `words` (inspector.ts explainPanel: the face's blocks before any was hidden, then the NOTES lines no face drew),
 * so a hidden line's words keep their definitions; and on a plain rig (faces.ts PLAIN_RIGS), whose face no longer prints
 * the HIT: label, HIT first, as its label led the line (its definition as today's: glossary.ts glossaryText).
 */
export function explainWords(t: Pick<PanelText, "body" | "words">, piece: Piece | null): KwWord[] {
  const own = panelWords(t.words ?? t.body, piece);
  if (!piece || !isPlainRig(piece.def) || own.some((w) => w.word === "HIT")) return own; // SHAPES-1: isPlainRig (+ the shaped three, SHAPES on)
  const row = glossaryEntry("HIT"), text = glossaryText("HIT", piece);
  return row && text ? [{ word: row.word, text, colour: row.colour }, ...own] : own;
}

/** EXPLAIN-1 (E3): what the ⓘ icon's hover tooltip lists: the NOTES lines, each a separate item, and a plain rig's HIT
 *  definition after them (its face no longer prints the label a hover would read). Markup or glyphs, as drawn. */
export function iconTipItems(t: Pick<PanelText, "notes">, words: readonly KwWord[], piece: Piece | null): string[] {
  const notes = (t.notes ?? []).map((b) => b.text);
  const hit = piece && isPlainRig(piece.def) ? words.find((w) => w.word === "HIT") : undefined; // SHAPES-1: isPlainRig
  return [...notes, ...(hit ? [hit.text] : [])];
}

/** Every word a panel's text names (all of its body's blocks, shown or given way), once, in reading order, with what a tap
 *  on it shows: for the KEYWORDS view (and the test that every word a panel names can be reached). */
export function panelWords(body: readonly Block[], piece: Piece | null): KwWord[] {
  const seen = new Set<string>(), out: KwWord[] = [];
  const fake = (b: Block): PLine => ({ spans: [{ t: b.text, c: C.bone }], font: "5", block: b, pitch: 9 });
  for (const b of body) {
    if (b.cells) continue;
    for (const m of matches(b.text, fake(b), true, piece).sort((p, q) => p.at - q.at)) {
      const key = glossaryEntry(m.word)?.word ?? m.word;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ word: key, text: m.text, colour: m.colour });
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------- state and drawing

/** The panel's tap state: which panel (its selection), the word shown, the KEYWORDS view's page. */
interface KwState {
  key: string;
  word: string | null;
  page: number | null;
  hover: string | null;
}
const STATE = new WeakMap<object, KwState>();
const stateOf = (owner: object, key: string): KwState => {
  let s = STATE.get(owner);
  if (!s || s.key !== key) {
    s = { key, word: null, page: null, hover: null };
    STATE.set(owner, s);
  }
  return s;
};

/** The ids this layer's regions use (BuildScreen.pressed keeps a press on one from closing what it opens). */
export const KW_REGION = "kw:";
export const isKeywordRegion = (id: string | null): boolean => !!id && id.startsWith(KW_REGION);

/** BuildScreen.pressed: a press anywhere but on a word, `?` or the KEYWORDS view closes the definition and the view. */
export function keywordsPressed(owner: object, region: string | null): void {
  const s = STATE.get(owner);
  if (!s || isKeywordRegion(region)) return;
  s.word = null;
  s.page = null;
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

/** The definition's lines in 5x7 at the panel's text width (`w`), its keyword in its colour. */
export const definitionLines = (text: string, w: number): RichLine[] => wrapRich(colourize(icons(text), C.bone), w, "5");

/** The box a shown definition takes: the panel's bottom rows (the hint's place), as tall as its lines, growing up over the
 *  panel (and above it on a strip too short to hold it): never cut. `bottom`: the body's last row + 1. */
export function definitionBox(r: Rect, bottom: number, lines: number): Rect {
  const h = lines * 9 + 3;
  return { x: r.x + 2, y: bottom - h, w: r.w - 4, h };
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
}

/** The ⓘ view's entries at text width `w`: EXPLAIN-1 (E4) the NOTES lines first (each a separate entry, wrapped in 5x7 as a
 *  definition is), then the LEVELS lines (each wrapped in 5x7), then the KEYWORDS definitions. */
export function infoItems(levels: readonly LevelLine[], words: readonly KwWord[], w: number, notes: readonly string[] = []): InfoItem[] {
  return [
    ...notes.map((note): InfoItem => ({ section: "NOTES", lines: definitionLines(note, w), gap: 2, note })),
    ...levels.map((level, i): InfoItem => ({ section: "LEVELS", lines: wrapRich(levelSpans(level), w, "5"), gap: i === levels.length - 1 ? 2 : 0, level })),
    ...words.map((word): InfoItem => ({ section: "KEYWORDS", lines: definitionLines(word.text, w), gap: 2, word })),
  ];
}

/** The height an entry takes on a page after `prev` (its section's 9 px header row when it opens the page or a section). */
const itemNeed = (it: InfoItem, prev: InfoItem | undefined): number => (prev?.section === it.section ? 0 : 9) + it.lines.length * 9 + it.gap;

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

/** The ⓘ button's glyph in the icon box's corner (where U2c's `?` was): an "i", a dot over a stem on a foot, in a 3x5
 *  cell (drawn, so the font needs no new glyph). */
function drawInfoGlyph(g: G, x: number, y: number, colour: string): void {
  rect(g, x + 1, y, 1, 1, colour); // the dot
  rect(g, x + 1, y + 2, 1, 3, colour); // the stem
  rect(g, x, y + 2, 1, 1, colour); // its serif
  rect(g, x, y + 4, 3, 1, colour); // its foot
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
export function drawKeywordLayer(g: G, owner: object, ui: UI, run: Run, d: { show: Sel; t: PanelText; plan: PanelPlan },
  lines: readonly { line: PLine | "rule"; y: number }[], buttons: readonly Rect[], tap: number, canvas?: HTMLCanvasElement | null,
  free: Rect | null = null, screen?: { W: number; H: number }): void {
  const { plan } = d, r = plan.r;
  const piece = panelPiece(run, d.show);
  const own = explainWords(d.t, piece); // EXPLAIN-1 (E4, E9): the face's words before any line was hidden; HIT on a plain rig
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
  const body = keywordTargets(lines, plan, piece, avoid);
  const targets = [...body, ...familyTargets(plan, [...avoid, ...body.map((t) => t.r)])];
  // the shown definition covers the panel's bottom rows: the words under it are not targets meanwhile
  const shown = s.word ? words.find((w) => w.word === s.word) ?? targets.find((t) => t.word === s.word) : undefined;
  const defLines = shown ? definitionLines(shown.text, r.w - 10) : [];
  const box = shown ? definitionBox(r, bottom, defLines.length) : null;
  targets.forEach((t, i) => {
    if (box && overlaps(t.glyph, box)) return;
    underline(g, t);
    ui.add({ id: `${KW_REGION}${i}:${t.word}`, r: t.r, onTap: () => { s.word = s.word === t.word ? null : glossaryEntry(t.word)?.word ?? t.word; } });
  });
  if (box) {
    rect(g, box.x, box.y, box.w, box.h, C.navy);
    rect(g, box.x, box.y, box.w, 1, C.slate1);
    defLines.forEach((ln, i) => drawRich(g, ln, r.x + 5, box.y + 3 + i * 9, "5"));
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
    return setCursor(canvas, true);
  }
  s.hover = hov ? hov.word : null;
  setCursor(canvas, !!hov);
  if (hov) drawHoverTip(g, hov, r);
}

/** FLIP-X1 (N4-b): one text row the ⓘ view draws: a section's header (3x5, `section`) or one line of an entry (5x7,
 *  `line`), at its top `y`, `h` px tall, in area `area`. */
export interface InfoRow {
  area: number;
  y: number;
  h: number;
  section?: InfoItem["section"];
  line?: RichLine;
}

/** FLIP-X1 (N4-b): page `page` of the ⓘ view as drawView draws it: its areas and pages (infoView), each area's box (null
 *  where none is drawn), every text row, and the footer's top (`TAP FOR MORE n/m`, 3x5) where there are more pages. */
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
      for (const ln of it.lines) {
        rows.push({ area: ai, y, h: 7, line: ln });
        y += 9;
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
      else if (row.line) drawRich(g, row.line, r.x + 5, row.y, "5");
    }
    ui.add({ id: `${KW_REGION}view`, r: box, onTap: turn });
  });
  if (foot !== null) drawText(g, `TAP FOR MORE ${(s.page ?? 0) + 1}/${pages.length}`, r.x + r.w - 5, foot, C.slate4, { font: "3", align: "right" });
}

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
 *  sits under its card (the panel's title and the word stay in sight). */
function drawHoverTip(g: G, t: KwTarget, r: Rect): void {
  const lines = wrapRich(colourize(icons(t.text), C.bone), 150, "3");
  const w = Math.max(...lines.map((l) => lineWidth(l, "3"))) + 10, h = 8 + lines.length * 7;
  const x = Math.max(2, Math.min(r.x + r.w + 200 - w, t.glyph.x - 4));
  const y = t.glyph.y + t.glyph.h + 4;
  rect(g, x + 2, y + 2, w, h, C.ink);
  rect(g, x, y, w, h, C.ink);
  rect(g, x + 1, y + 1, w - 2, h - 2, C.night);
  rect(g, x + 1, y + 1, w - 2, 1, t.colour === C.bone ? C.slate3 : t.colour);
  lines.forEach((l, i) => drawRich(g, l, x + 5, y + 4 + i * 7, "3"));
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
