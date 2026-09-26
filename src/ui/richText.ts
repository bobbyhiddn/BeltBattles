// 0.6.2t (REQ-BFG-032, T4): the one word-wrap helper for player text, and rich lines. Text functions return whole
// sentences (src/ui/abilityText.ts, src/screens/build/flavour.ts); this file breaks them at spaces to a panel's width at
// draw time, for every panel, card and tooltip that shows ability text, and colours them:
// - wrapText(s, w, font): plain lines. wrapRich(spans, w, font): lines of [text, colour] spans. Both use one algorithm:
//   - it never breaks inside a word, or between a number and the word after it ("2.75 SECONDS", "25% FASTER"), unless
//     that word is a preposition, conjunction or article ("25% / OF HARASSMENT");
//   - a span marked `whole` (a perk name, "★3 TWIN SIGNET") is never split: it joins the line if it fits, else the next;
//   - 0b.2: a paragraph never ends on one short word (4 letters or fewer, or a lone number) alone on its last line, or
//     on a stub of a few words with 4 letters and digits in all ("TO 6."), when pulling the word before it down still
//     fits the width.
// - colourize(s, base): numbers in white (emphasised), BURN, SHOCK, FREEZE, POISON and speed (FASTER, SLOWER) in their
//   battle colours (abilityText.ts KEYWORD), everything else in `base`.
// - drawRich(g, line, x, y, font): draws one wrapped line (the 5x7 or 3x5 pixel face, as drawText).

import { drawText, textWidth, type FontId } from "../render/font";
import type { G } from "../render/pixel";
import { C } from "../render/palette";

/** A run of text in one colour. `whole`: never split across lines (a perk name). */
export interface Span {
  t: string;
  c: string;
  whole?: boolean;
}

/** One wrapped line: spans drawn left to right (a space between two words is part of a span's text). */
export type RichLine = Span[];

/** The battle colours of the keywords (T4), also exported by abilityText.ts as KEYWORD. Speed: fast chevrons are
 *  yellow and slow ones blue (render/sprites.ts speedTint); Burn's popups fire3; Poison's lime; Freeze's sparks ice;
 *  Shock's sparks cyan and ice (game/arenaReact.ts). */
export const KEYWORD_COLOUR = {
  burn: C.fire3,
  shock: C.cyan,
  freeze: C.ice,
  poison: C.lime,
  faster: C.yellow,
  slower: C.blue,
} as const;

/** The colour of a number in rich text (T4: numbers are emphasised). */
export const NUMBER_COLOUR = C.white;
/** The colour of a star mark and a perk name ("★2 HOT SHOE"). */
export const PERK_COLOUR = C.brass3;

const WORD_KEYWORDS: Record<string, string> = {
  BURN: KEYWORD_COLOUR.burn, BURNS: KEYWORD_COLOUR.burn, BURNING: KEYWORD_COLOUR.burn,
  SHOCK: KEYWORD_COLOUR.shock, SHOCKED: KEYWORD_COLOUR.shock, SHOCKS: KEYWORD_COLOUR.shock,
  FREEZE: KEYWORD_COLOUR.freeze, FREEZES: KEYWORD_COLOUR.freeze, FROZEN: KEYWORD_COLOUR.freeze, FROST: KEYWORD_COLOUR.freeze,
  POISON: KEYWORD_COLOUR.poison, POISONED: KEYWORD_COLOUR.poison,
  FASTER: KEYWORD_COLOUR.faster, SLOWER: KEYWORD_COLOUR.slower,
};
/** Speed phrases, longest first: "HALF SPEED" is slower; "TWICE AS FAST" and "3 TIMES AS FAST" are faster (the number
 *  keeps its own colour). */
const PHRASES: [string[], string][] = [
  [["HALF", "SPEED"], KEYWORD_COLOUR.slower],
  [["TWICE", "AS", "FAST"], KEYWORD_COLOUR.faster],
  [["TIMES", "AS", "FAST"], KEYWORD_COLOUR.faster],
  [["AS", "FAST"], KEYWORD_COLOUR.faster],
];

const NUMBER = /^[+-]?\d+(?:\.\d+)?%?$/;
const STAR = /^★\d$/;
/** A word's core: its letters, digits, ★ and %, without the punctuation around it ("(3" -> "3", "BURN." -> "BURN"). */
function split(word: string): [string, string, string] {
  const m = /^([("'[]*)(.*?)([)"'\].,:;!?]*)$/.exec(word);
  return m ? [m[1], m[2], m[3]] : ["", word, ""];
}

/**
 * A sentence (or several) as coloured spans: numbers white, keywords in their battle colours, the rest `base`. `num`
 * overrides the number colour (the flavour keeps its numbers dim; its keywords keep their battle colours).
 */
export function colourize(text: string, base: string, num: string = NUMBER_COLOUR): Span[] {
  const words = text.split(" ");
  const colour: (string | null)[] = words.map(() => null);
  const cores = words.map((w) => split(w)[1].toUpperCase());
  for (let i = 0; i < words.length; i++) {
    if (colour[i]) continue;
    for (const [ph, c] of PHRASES) {
      if (ph.every((p, j) => cores[i + j] === p)) {
        for (let j = 0; j < ph.length; j++) colour[i + j] = c;
        break;
      }
    }
  }
  const out: Span[] = [];
  const push = (t: string, c: string) => {
    if (!t) return;
    const last = out[out.length - 1];
    if (last && last.c === c && !last.whole) last.t += t;
    else out.push({ t, c });
  };
  words.forEach((w, i) => {
    if (i > 0) push(" ", base);
    const [lead, core, tail] = split(w);
    const kc = colour[i] ?? WORD_KEYWORDS[core.toUpperCase()];
    const c = kc ?? (NUMBER.test(core) ? num : STAR.test(core) ? PERK_COLOUR : base);
    push(lead, base);
    push(core, c);
    push(tail, base);
  });
  return out;
}

/** A word of a paragraph: its spans (a word may change colour inside, "(3" is "(" and "3"). */
interface Word {
  spans: Span[];
  text: string;
  whole: boolean;
}

/** A unit the wrap never breaks: one word, a number glued to the word after it, or a whole span. */
interface Unit {
  words: Word[];
  text: string;
}

/** Split spans into words at spaces (a `whole` span is one word). */
function words(spans: readonly Span[]): Word[] {
  const out: Word[] = [];
  let cur: Word | null = null;
  const end = () => {
    if (cur && cur.text) out.push(cur);
    cur = null;
  };
  for (const s of spans) {
    if (s.whole) {
      end();
      out.push({ spans: [{ t: s.t, c: s.c }], text: s.t, whole: true });
      continue;
    }
    const parts = s.t.split(" ");
    parts.forEach((p, i) => {
      if (i > 0) end();
      if (!p) return;
      if (!cur) cur = { spans: [], text: "", whole: false };
      cur.spans.push({ t: p, c: s.c });
      cur.text += p;
    });
  }
  end();
  return out;
}

/** A number with no punctuation after it glues to the next word: "2.75 SECONDS", "(3 DAMAGE)", "25% FASTER". */
const GLUE = /^\(?[+-]?\d+(?:\.\d+)?%?$/;
/** ...unless that word is a preposition, conjunction or article, which is no unit: "25% / OF", "2 / AT 60%". */
const FUNCTION_WORDS = new Set(["A", "AN", "THE", "OF", "AT", "TO", "IN", "ON", "FOR", "AND", "OR", "WITH", "INTO", "FROM", "BY"]);

function units(ws: Word[]): Unit[] {
  const out: Unit[] = [];
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    if (!w.whole && GLUE.test(w.text) && i + 1 < ws.length && !ws[i + 1].whole && !FUNCTION_WORDS.has(ws[i + 1].text)) {
      out.push({ words: [w, ws[i + 1]], text: `${w.text} ${ws[i + 1].text}` });
      i++;
    } else out.push({ words: [w], text: w.text });
  }
  return out;
}

/** 0b.2: a short word: one word of 4 letters or fewer, or a lone number (punctuation aside). */
export function shortWord(text: string): boolean {
  if (text.includes(" ")) return false;
  const bare = text.replace(/[^A-Z0-9★%+-]/gi, "");
  return bare.length <= 4 || NUMBER.test(bare);
}

/** 0b.2, widened: a stub last line: one short word, or a few words with 4 letters and digits or fewer in all ("TO 6."). */
export function stubLine(text: string): boolean {
  return shortWord(text) || text.replace(/[^A-Z0-9]/gi, "").length <= 4;
}

/** The pixel gap between two words: a space glyph and its two advances. */
export function gapWidth(font: FontId): number {
  return textWidth(" ", font) + 2;
}

/** Greedy fill, then the lone-word rule (0b.2). */
function fill(us: Unit[], maxW: number, font: FontId): Unit[][] {
  const gap = gapWidth(font);
  const lines: Unit[][] = [];
  let cur: Unit[] = [], w = 0;
  for (const u of us) {
    const uw = textWidth(u.text, font);
    if (!cur.length) {
      cur = [u];
      w = uw;
    } else if (w + gap + uw <= maxW) {
      cur.push(u);
      w += gap + uw;
    } else {
      lines.push(cur);
      cur = [u];
      w = uw;
    }
  }
  if (cur.length) lines.push(cur);
  const n = lines.length;
  if (n >= 2) {
    // 0b.2: a last line that is only a stub ("MORE", "6.", "TO 6.") takes the word before it down, while that still
    // fits and the line above keeps a word ("SPLITS INTO 2 AT" / "60%." becomes "SPLITS INTO" / "2 AT 60%.")
    const last = lines[n - 1], prev = lines[n - 2];
    for (;;) {
      const text = last.map((u) => u.text).join(" ");
      if (last.some((u) => u.words.some((w) => w.whole)) || !stubLine(text) || prev.length < 2) break;
      const moved = prev[prev.length - 1];
      if (textWidth(moved.text, font) + gap + textWidth(text, font) > maxW) break;
      prev.pop();
      last.unshift(moved);
    }
  }
  return lines;
}

/** A unit line back to spans, a single space between units, runs of one colour merged. */
function toSpans(line: Unit[], space: string): RichLine {
  const out: RichLine = [];
  const push = (t: string, c: string) => {
    const last = out[out.length - 1];
    if (last && last.c === c) last.t += t;
    else out.push({ t, c });
  };
  line.forEach((u, i) => {
    if (i > 0) push(" ", space);
    u.words.forEach((w, j) => {
      if (j > 0) push(" ", w.spans[0].c);
      for (const s of w.spans) push(s.t, s.c);
    });
  });
  return out;
}

/** Wrap a paragraph of spans to `maxW` px in `font` (see the file comment). */
export function wrapRich(spans: readonly Span[], maxW: number, font: FontId = "5"): RichLine[] {
  const space = spans.find((s) => !s.whole)?.c ?? C.bone;
  return fill(units(words(spans)), maxW, font).map((l) => toSpans(l, space));
}

/** Wrap plain text to `maxW` px in `font`: the same rules as wrapRich. */
export function wrapText(text: string, maxW: number, font: FontId = "5"): string[] {
  return wrapRich([{ t: text, c: C.bone }], maxW, font).map(lineText);
}

/** A rich line's plain text. */
export function lineText(line: readonly Span[]): string {
  return line.map((s) => s.t).join("");
}

/** A rich line's width in px (the same as textWidth of its text). */
export function lineWidth(line: readonly Span[], font: FontId = "5"): number {
  return textWidth(lineText(line), font);
}

/** Draw one rich line at (x, y); `align` centres or right-aligns it on x. Returns its width. */
export function drawRich(g: G, line: readonly Span[], x: number, y: number, font: FontId = "5", align: "left" | "center" | "right" = "left"): number {
  const w = lineWidth(line, font);
  let cx = align === "center" ? Math.round(x - w / 2) : align === "right" ? Math.round(x - w) : Math.round(x);
  for (const s of line) {
    if (!s.t) continue;
    cx += drawText(g, s.t, cx, y, s.c, { font }) + 1;
  }
  return w;
}
