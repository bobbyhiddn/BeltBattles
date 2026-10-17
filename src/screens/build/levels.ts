// U2e step 5 (REQ-BFG-070; the operator: "Let's follow the batomon pattern by having an info button that shows more
// information about further levels. It'll keep the cards cleaner to not show it all the time."): THE LEVELS of a piece,
// the first section of the ⓘ view (keywords.ts), as Batomon's info card writes a level ladder ("Shield: 450/900/1350"):
//   - a LADDER for each number that changes with the stars, in the face's own icons (faces.ts faceAt at every star, so
//     every number comes through its statFormat formatter): "{DMG} +1/+2/+4", "1.5/1.3/1.1{SEC}" (SEC after its numbers,
//     as in the stat row), "EVERY 3/2.5/2{SEC}", "-" at a star the number is not there yet; the current star's value is
//     drawn in yellow (in text, ladderText marks it [like this]);
//   - the PERK each star adds: its interim clause where it has one ("★2 SPARK JUMP: {*STUN} HITS 2 PARTS."), else its
//     name ("★2 OVERPRESSURE"), in brass;
//   - what merging gives: today's NEXT★ line ("NEXT ★2: +2 {BURN}"), never a copy count. A RULES piece that keeps today's
//     sentences has no ladder (its numbers are in its sentences): its perks' names and its NEXT STAR sentence.
// A piece without stars (a hero's signature factory, a pack) has no LEVELS (null).

import { C } from "../../render/palette";
import { icons } from "../../render/font";
import { colourize, PERK_COLOUR, type Span } from "../../ui/richText";
import { faceAt, hasFace, ruleSpans, type Face } from "../../ui/faces";
import { faceNextBlock } from "./faceBlocks";
import { livePerk, newPerk, nextStarHeadline, nextStarText, type TextOpts } from "../../ui/abilityText";
import { FUSE_MAX, fusible } from "../../sim/stars";
import type { Block } from "./inspector";

/** One ladder: a lead (markup, an icon or words before the numbers), one value a star ("-" where it has none), a tail
 *  (markup after the numbers: SEC, a unit or words), and the current star's index (0-based). */
export interface Ladder {
  lead: string;
  values: string[];
  tail: string;
  current: number;
}

/** One line of the LEVELS section: a ladder, a star's perk, or the next star's line (markup; `brass`, its label). */
export type LevelLine =
  | { kind: "ladder"; ladder: Ladder }
  | { kind: "perk"; text: string; brass: string }
  | { kind: "next"; text: string; brass: string; perk?: string };

/** The separator between a ladder's values: font.ts has no "»", so "/" (Batomon's "450/900/1350"). */
export const LADDER_SEP = "/";

/** A number as the face prints it (signed, decimal, a percentage): its first one in a NEXT★ form. */
const NUM = /[+-]?\d+(?:\.\d+)?%?/;
/** A keyword in panel style ({*BURN}) as its icon alone ({BURN}), as NEXT★ draws it (C7). */
const alone = (s: string): string => s.replace(/\{\*([A-Z]+)\}/g, "{$1}");
/** A plural's S gone, so "1 MORE AIM" and "2 MORE AIMS" share a template. */
const singular = (s: string): string => s.replace(/S\b/g, "");

/** The next star's line (C7): a face's NEXT★ block, else today's NEXT STAR sentence with the perk it brings and its
 *  headline (`alt`); [] at the top star or for a piece that never fuses. inspector.ts progressBlocks reads it too. */
export function nextBlocks(def: string, stars: number, o: TextOpts): Block[] {
  const fn = hasFace(def) ? faceNextBlock(def, stars, o) : null;
  if (fn) return [fn];
  const next = nextStarText(def, stars, o);
  if (!next) return [];
  const perk = newPerk(def, stars + 1), head = nextStarHeadline(def, stars, o);
  return [{ role: "next", text: next, keep: true, ...(perk ? { perk: `★${stars + 1} ${perk}` } : {}), ...(head ? { alt: head } : {}) }];
}

/** The ladders of a face's numbers over its stars: the stat pairs (both rows) by icon, then the rule's keyed numbers by
 *  key, each only where it changes. */
function ladders(faces: Face[], current: number): Ladder[] {
  const out: Ladder[] = [];
  // the stat pairs, by icon, in the top star's order (a pair a lower star lacks shows "-")
  const pairs = (f: Face) => [...f.stats, ...(f.stats2 ?? [])];
  const icons_: string[] = [];
  for (const f of faces) for (const [ic] of pairs(f)) if (!icons_.includes(ic)) icons_.push(ic);
  for (const ic of icons_) {
    const values = faces.map((f) => { const p = pairs(f).find(([i]) => i === ic); return p ? String(p[1]) : "-"; });
    if (values.every((v) => v === values[0])) continue;
    // PLAIN-1F (REQ-BFG-084, M3; REVIEW-PLAIN1 D4: one reading): a stat's word before its icon leads its ladder too, as the
    // stat row draws it (BALLAST's "MAX {HULL} +8%/+16%/+25%"; icons.ts Stat's third item, which no other stat has)
    const pre = faces.map((f) => { const p = pairs(f).find(([i]) => i === ic); return p && p.length > 2 ? p[2] : undefined; }).find((w) => !!w);
    out.push(ic === "SEC" ? { lead: "", values, tail: "{SEC}", current } : { lead: `${pre ? `${pre} ` : ""}{${ic}} `, values, tail: "", current });
  }
  // the rule's keyed numbers (faces.ts nums, the NEXT★ forms), by key
  const keys: string[] = [];
  for (const f of faces) for (const [k] of f.nums) if (!keys.includes(k)) keys.push(k);
  for (const k of keys) {
    const forms = faces.map((f) => f.nums.find(([k2]) => k2 === k)?.[1] ?? null);
    if (forms.every((v) => v === forms[0])) continue;
    const parts = forms.map((v) => {
      if (v === null) return null;
      const a = alone(v), m = NUM.exec(a);
      return m ? { pre: a.slice(0, m.index), num: m[0], post: a.slice(m.index + m[0].length) } : { pre: a, num: "", post: "" };
    });
    const present = parts.filter((p): p is NonNullable<typeof p> => !!p);
    const top = present[present.length - 1];
    const same = present.every((p) => p.num && singular(p.pre) === singular(top.pre) && singular(p.post) === singular(top.post));
    if (!same) {
      // no shared template (two numbers move, or none): the forms themselves, a star apart
      out.push({ lead: "", values: forms.map((v) => (v === null ? "-" : alone(v))), tail: "", current });
      continue;
    }
    const values = parts.map((p) => (p ? p.num : "-"));
    // a number with only an icon after it reads icon first, as the stat row does: "+2 {BURN}" is "{BURN} +2/+4/+7"
    const iconOnly = !top.pre && /^ \{[A-Z]+\}$/.test(top.post);
    out.push(iconOnly ? { lead: `${top.post.trim()} `, values, tail: "", current } : { lead: top.pre, values, tail: top.post, current });
  }
  return out;
}

/**
 * The LEVELS of `def` at `stars` (o: the turret class factor k for a core, the run's hero for MIMIC FORGE): its ladders,
 * each star's perk and the next star's line; null for a piece without stars. Pure (the ⓘ view, tests, tools).
 */
export function levelLines(def: string, stars: number, o: TextOpts = {}): LevelLine[] | null {
  if (!fusible(def)) return null;
  const out: LevelLine[] = [];
  const all = Array.from({ length: FUSE_MAX }, (_, i) => i + 1);
  const faces = hasFace(def) ? all.map((s) => faceAt(def, s, o)!) : null;
  if (faces) for (const ladder of ladders(faces, stars - 1)) out.push({ kind: "ladder", ladder });
  // each star's perk: its interim clause (the face's own line at that star) where it has one, else its name; a perk a
  // star keeps from the one before adds nothing, so it shows once
  let prevPerk: string | undefined, prevClause: string | undefined;
  for (const s of all.slice(1)) {
    const perk = livePerk(def, s), clause = faces?.[s - 1].clause;
    const body = clause ? clause.text.slice(clause.label!.length) : undefined;
    if (clause && (body !== prevClause || perk !== prevPerk)) out.push({ kind: "perk", text: clause.text, brass: clause.label! });
    else if (!clause && perk && perk !== prevPerk) out.push({ kind: "perk", text: `★${s} ${perk}`, brass: `★${s} ${perk}` });
    prevPerk = perk;
    prevClause = body;
  }
  // what merging gives: the next star's line
  const nb = nextBlocks(def, stars, o)[0];
  if (nb) out.push({ kind: "next", text: nb.text, brass: nb.brass ?? (nb.text.startsWith("NEXT STAR:") ? "NEXT STAR:" : nb.text), ...(nb.perk ? { perk: nb.perk } : {}) });
  return out;
}

/** A ladder in markup, the current star's value marked by `mark` (tests and tools: "[8]"; the view draws it yellow). */
export function ladderText(l: Ladder, mark: (v: string) => string = (v) => v): string {
  return `${l.lead}${l.values.map((v, i) => (i === l.current ? mark(v) : v)).join(LADDER_SEP)}${l.tail}`;
}

/** A LEVELS line in markup (tests, the text sheet): a ladder with its current value [marked], a perk, a next line. */
export function levelText(line: LevelLine, mark: (v: string) => string = (v) => `[${v}]`): string {
  if (line.kind === "ladder") return ladderText(line.ladder, mark);
  return line.kind === "next" && line.perk ? `${line.text} ${line.perk}` : line.text;
}

/** The colour of the current star's value on a ladder (the open ⓘ button is lit in it too). */
export const CURRENT_COLOUR = C.yellow;

/** A LEVELS line as spans in glyphs: a ladder's icon in its colour, its values bone with the current one yellow and the
 *  separators dim; a perk or next line with its label in brass (a keyword keeps its colour), the next star's perk name
 *  after it in brass. */
export function levelSpans(line: LevelLine, base: string = C.bone): Span[] {
  if (line.kind === "ladder") {
    const l = line.ladder, out: Span[] = [];
    if (l.lead) out.push(...colourize(icons(l.lead.trimEnd()), base), ...(l.lead.endsWith(" ") ? [{ t: " ", c: base }] : []));
    l.values.forEach((v, i) => {
      if (i) out.push({ t: LADDER_SEP, c: C.slate4 });
      out.push({ t: v, c: i === l.current ? CURRENT_COLOUR : base });
    });
    if (l.tail) out.push(...(l.tail.startsWith(" ") ? [{ t: " ", c: base }] : []), ...colourize(icons(l.tail.trimStart()), base));
    // the values stay together on one line where they can (a ladder is read as one)
    return out;
  }
  const spans = ruleSpans(icons(line.text), icons(line.brass), base);
  if (line.kind === "next" && line.perk) spans.push({ t: " ", c: base }, { t: line.perk, c: PERK_COLOUR, whole: true });
  return spans;
}
