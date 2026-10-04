import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { COMMISSION_BASE, COMMISSION_STEP, ITEMS, JAM_THRESHOLD, WINDOW_TIME, type HeroId } from "../src/sim/content";
import { SYNC_WINDOW } from "../src/sim/races/foundry";
import { effectAt, fusible } from "../src/sim/stars";
import { scaleCore } from "../src/sim/cores";
import { C } from "../src/render/palette";
import { ICON, ICON_COLOUR, KEYWORDS, icons, stripIcons, textWidth } from "../src/render/font";
import { KEYWORD_COLOUR, colourize, wrapRich } from "../src/ui/richText";
import { SIM } from "../src/ui/abilityText";
import { FACE_IDS, faceAt, faceLines } from "../src/ui/faces";
import { captureFormats, FORMATTERS, fmtCount, fmtSec } from "../src/ui/statFormat";
import {
  GLOSSARY, GLOSSARY_WRAP_W, RUNE_REMINDER, TAP_NOTES, glossaryEntry, glossaryHits, glossaryRows, glossaryText, glossaryWordsIn, keywordRow,
} from "../src/ui/glossary";
import { KEYWORD_WORD, RUNE_KEYWORD_COLOUR, runeReminder, runeReminderSpans, type RuneKeyword } from "../src/ui/runeText";
import { RUNE_LIST } from "../src/sim/runes";
import { computeView } from "../src/core/io";
import { buildLayout, buildScale } from "../src/screens/build/layout";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";

// U2c (REQ-BFG-045, REQ-BFG-046, REQ-BFG-047): the glossary, one source (src/ui/glossary.ts; T2a's table and API, ported
// onto the faces and the runes). Its numbers are the sim's through the formatter registry; every definition a tap can show
// fits 2 lines of the 5x7 face at the phone band's text width; one mechanic, one word, one definition.

const STARS = [1, 2, 3];
/** Every context that changes a face's numbers (faceText's): MIMIC FORGE's hero, a core's class factor. */
const contexts = (def: string): { k?: number; hero?: HeroId }[] =>
  def === "mimic" ? PLAYABLE_HEROES.map((hero) => ({ hero })) : ITEMS[def].kind === "core" ? [1, 0.8, 0.75, 0.55, 0.4].map((k) => ({ k })) : [{}];
const starsOf = (def: string): number[] => (fusible(def) ? STARS : [1]);
/** The numbers a text shows. */
const numbersIn = (s: string): string[] => [...stripIcons(s).replace(/★\d/g, "").matchAll(/\d+(?:\.\d+)?%?/g)].map((m) => m[0]);
/** A definition's 5x7 lines at the band's width, as keywords.ts draws it. */
const linesOf = (markup: string): number => wrapRich(colourize(icons(markup), C.bone), GLOSSARY_WRAP_W, "5").length;

/** Every text a tap can show: each row's definition; each faced piece's keyword (its own reminder and the extra); each tap
 *  note at every star and context. */
function shownTexts(): { id: string; text: string }[] {
  const out = GLOSSARY.map((r) => ({ id: r.word, text: r.def }));
  for (const def of FACE_IDS) for (const o of contexts(def)) for (const s of starsOf(def)) {
    for (const k of KEYWORDS) if (faceAt(def, s, o)!.reminders.some((r) => r.includes(`{*${k}}`))) out.push({ id: `${def} ★${s} ${k}`, text: glossaryText(k, { def, stars: s, o })! });
    const n = TAP_NOTES[def];
    if (n) out.push({ id: `${def} ★${s} note`, text: glossaryText(n.word, { def, stars: s, o })! });
  }
  return out;
}

describe("U2c the glossary: the table and its API (T2a's, ported)", () => {
  it("each form names one row (aliases too); the API finds a row by its word or an alias, case-blind", () => {
    const forms = GLOSSARY.flatMap((r) => [r.word, ...r.aliases]);
    expect(new Set(forms).size).toBe(forms.length);
    for (const f of forms) expect(f, f).toMatch(/^[A-Z][A-Z' ]*[A-Z]$/);
    expect(glossaryEntry("burn")!.word).toBe("BURN");
    expect(glossaryEntry("FROZEN")!.word).toBe("FREEZE");
    expect(glossaryEntry("PAIRS")!.word).toBe("PAIR");
    expect(glossaryEntry("NOT A WORD")).toBeUndefined();
    expect(GLOSSARY_WRAP_W).toBe(225);
  });

  it("glossaryWordsIn: the rows a line names, each once, in order; whole words, the longest form first", () => {
    const words = (t: string) => glossaryWordsIn(t).map((r) => r.word);
    expect(words("PAIR: +25% DAMAGE.")).toEqual(["PAIR"]);
    expect(words("LOAD TIME -0.25 SEC, NOT UNDER 0.3 SEC.")).toEqual(["LOAD TIME"]);
    expect(words("SHOT: EVERY 2 BONUS DAMAGE BECOMES 1 BURN.")).toEqual(["BONUS DAMAGE", "BURN"]);
    expect(words("EACH FACTORY ITS ARROWS POINT AT WORKS 20% FASTER.")).toEqual(["RATE"]);
    expect(words("HIT: +1 BURN. HIT: +2 BURN.")).toEqual(["BURN"]);
    expect(words("PAIRED LOADS")).toEqual(["PAIR"]);
    expect(words("UNPAIRED, PLATINGS, BURNT")).toEqual([]); // whole words only
    // the trigger labels and the rune-only words are taps only where they are drawn as such (keywords.ts)
    expect(words("HIT: EVERY SHOT ON THE HULL HAS A BELT AND GOLD.")).toEqual([]);
    // where a form sits: its start and end in the text itself
    const t = "IT STALLS THE MACHINE IT HITS.";
    expect(glossaryHits(t).map((h) => [t.slice(h.at, h.end), h.row.word])).toEqual([["STALLS", "STUN"], ["MACHINE", "PART"]]);
  });
});

describe("U2c the glossary: one mechanic, one word, one definition", () => {
  it("the face keywords' rows are their reminders (faces.ts REMINDER) and one sentence; each in its icon's colour", () => {
    for (const k of KEYWORDS) {
      const r = keywordRow(k);
      expect(r.word, k).toBe(k);
      expect(r.colour, k).toBe(ICON_COLOUR[ICON[k]]); // font.ts, the one source (REQ-BFG-032 rule 3)
      expect(r.def.startsWith(`{*${k}}:`) || r.def.startsWith(`EACH {*${k}}:`), r.def).toBe(true);
      if (r.extra) expect((r.extra.match(/\.(?=\s|$)/g) ?? []).length, `${k}: at most one sentence`).toBeLessThanOrEqual(1);
    }
  });

  it("the same mechanic is one row: SHOCK and STALL are STUN's (one disrupt timer), PLATING PLATE's, FIRE RATE and WORKS FASTER RATE's, MACHINE PART's", () => {
    for (const [form, word] of [["SHOCK", "STUN"], ["STALL", "STUN"], ["STALLED", "STUN"], ["PLATING", "PLATE"], ["FIRE RATE", "RATE"], ["WORKS FASTER", "RATE"], ["MACHINE", "PART"]]) {
      expect(glossaryEntry(form)!.word, form).toBe(word);
    }
    // JAM keeps one meaning, an over-fed gun skipping a shot; STUN keeps today's (the part stops)
    expect(glossaryEntry("JAM")!.def).toBe(`JAM: A GUN WITH ${fmtCount(JAM_THRESHOLD)} LOADS BACKED UP AT ITS INTAKES SKIPS A SHOT.`);
    expect(stripIcons(keywordRow("STUN").def)).toContain("THE ENEMY PART IT HITS STOPS");
    // colours: battle colours where the game has them
    expect([glossaryEntry("FREEZE")!.colour, glossaryEntry("POISON")!.colour, glossaryEntry("SPEED")!.colour]).toEqual([KEYWORD_COLOUR.freeze, KEYWORD_COLOUR.poison, KEYWORD_COLOUR.faster]);
  });

  it("the rune keywords have rows (BURN, RIDE and STALL too), and the rune cards' colours and reminders come from them", () => {
    for (const k of Object.keys(KEYWORD_WORD) as RuneKeyword[]) {
      const row = glossaryEntry(KEYWORD_WORD[k]);
      expect(row, k).toBeDefined();
      expect(RUNE_KEYWORD_COLOUR[k], k).toBe(row!.colour);
    }
    // each rune reminder: number-free, its word first, and it says what its row says (a phrase both hold)
    const same: Record<string, string> = {
      PLATE: "BEFORE YOUR HULL", PAIR: "TWO LOADS REACH ONE TURRET AT ONCE", HEAT: "FOR EACH SEC IT RIDES", FRAY: "LATER HIT",
      // U2d F4: RIDE's row reworded (cap), its reminder its first sentence; was "CINDER SLUG'S OWN"
      RATE: "HOW OFTEN A GUN FIRES OR A FACTORY WORKS", BURN: "HULL DAMAGE", RIDE: "THE HEAT A KILN'S SLUGS GAIN FOR EACH SEC THEY RIDE", STALL: "STOPS FOR A WHILE",
    };
    // U2d F4 (cap, seen in crop-keywords-rune-op): RIDE's row in cap's words, whole (2 lines of 5x7 at 225 px: the fit test below)
    expect(glossaryEntry("RIDE")!.def).toBe("RIDE: THE {*HEAT} A KILN'S SLUGS GAIN FOR EACH SEC THEY RIDE. NOT A HEAT JACKET'S.");
    expect(Object.keys(RUNE_REMINDER).sort()).toEqual(Object.keys(same).sort());
    for (const [k, phrase] of Object.entries(same)) {
      const rem = RUNE_REMINDER[k];
      expect(rem.startsWith(`${k}: `), rem).toBe(true);
      expect(rem, k).not.toMatch(/\d/);
      expect(rem, k).toContain(phrase);
      expect(stripIcons(icons(glossaryEntry(k)!.def)).replace(/  +/g, " "), k).toContain(phrase);
    }
    // the rune card reads them: a rune naming PLATE shows PLATE's reminder, its word in PLATE's colour
    const plate = RUNE_LIST.find((d) => d.id === "rivet_hoard")!;
    expect(runeReminder(plate)).toBe(RUNE_REMINDER.PLATE);
    expect(runeReminderSpans(plate)[0]).toEqual({ t: "PLATE", c: ICON_COLOUR[ICON.PLATE] });
  });
});

describe("U2c the glossary: numbers, digits and fit", () => {
  it("every number a definition shows is the sim's, printed through a formatter (the registry), at every star and context", () => {
    let checked = 0;
    const { value: rows, records } = captureFormats(() => glossaryRows());
    for (const r of records) expect(FORMATTERS[r.unit](r.value)).toBe(r.printed);
    const printed = records.map((r) => r.printed);
    for (const row of rows) for (const n of numbersIn(icons(row.def))) {
      expect(printed, `${row.word}: ${n}`).toContain(n);
      printed.splice(printed.indexOf(n), 1);
      checked++;
    }
    for (const def of FACE_IDS) for (const o of contexts(def)) for (const s of starsOf(def)) {
      // the keywords this face names (its own reminder fills in its number) and its tap note
      const kws = KEYWORDS.filter((k) => faceAt(def, s, o)!.reminders.some((r) => r.includes(`{*${k}}`)));
      for (const word of [...kws, ...(TAP_NOTES[def] ? [TAP_NOTES[def].word] : [])]) {
        const { value: text, records: rec } = captureFormats(() => glossaryText(word, { def, stars: s, o }));
        if (!text) continue;
        const p = rec.map((r) => r.printed);
        for (const n of numbersIn(icons(text))) {
          expect(p, `${def} ★${s} ${word}: ${n}`).toContain(n);
          p.splice(p.indexOf(n), 1);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
    // the constants the rows quote, as T2a's sentences quoted them
    expect([WINDOW_TIME, COMMISSION_BASE, COMMISSION_STEP, JAM_THRESHOLD, SYNC_WINDOW, SIM.poisonTick, SIM.poisonMax, SIM.poisonTime]).toEqual([1.5, 1.2, 0.6, 4, 0.25, 4, 24, 6]); // NUM-1: poison 4 a stack each second (was 0.4)
  });

  it("no digit in glossary.ts's strings: every number is a formatter's", () => {
    const bad = stringLiterals(readFileSync("src/ui/glossary.ts", "utf8")).filter((t) => /\d/.test(t));
    expect(bad).toEqual([]);
  });

  it("every text a tap can show fits 2 lines of 5x7 at the op band's text width; no middle dot, no hand-wrapping", () => {
    const v = computeView(402, 690, 3, buildScale), band = buildLayout(v.W, v.H, v.portrait, 5, true).info;
    expect(band.w - 10).toBe(GLOSSARY_WRAP_W);
    let n = 0, widest = 0;
    const over: string[] = [];
    for (const { id, text } of shownTexts()) {
      if (linesOf(text) > 2) over.push(`${id}: ${stripIcons(icons(text))}`);
      expect(/·|\n|  |^ | $/.test(text), id).toBe(false);
      widest = Math.max(widest, textWidth(icons(text), "5"));
      n++;
    }
    expect(over, over.join(" | ")).toEqual([]);
    // REQ-BFG-032 rule 3: a face keyword draws in its icon's colour, so a text names it in panel style (its icon glued before
    // it), never as a bare word (a piece's name aside: HEAT JACKET)
    for (const { id, text } of shownTexts()) for (const k of KEYWORDS) {
      const t = icons(text).replace(/HEAT JACKET/g, "");
      for (const m of t.matchAll(new RegExp(`${k}`, "g"))) expect(t[m.index! - 1], `${id}: ${k} in ${stripIcons(t)}`).toBe(ICON[k]);
    }
    console.log(`U2c glossary fit: ${n} texts, each 2 lines or fewer at ${GLOSSARY_WRAP_W} px (the longest ${widest} px unwrapped)`);
  });
});

describe("U2c U2b's ledger: every NEEDED: U2c row now has a home", () => {
  it("PRESSURE's cap, COMPOUND's lone-load hold, SORTING ARM's count across belts, PAIR's window and lone blank, SURGE's pulse", () => {
    const k = 1;
    // PRESSURE BREECH: the cap of 5 waiting loads (its tap note; the turret panel's CHAMBER row: tests/turretPanel.u2c)
    // U2d F5: the note reads forwards, as the turret panel's (was "AT MOST 5 LOADS WAITING COUNT, AND IT NEVER JAMS.")
    expect(stripIcons(icons(glossaryText("SHOT", { def: "pressure", stars: 1, o: { k } })!))).toBe(`SHOT: IT COUNTS UP TO ${fmtCount(scaleCore(ITEMS.pressure.core!, k).maxCount!)} WAITING LOADS, AND IT NEVER JAMS.`);
    // COMPOUND BREECH: the lone load's hold
    expect(stripIcons(icons(glossaryText("SHOT", { def: "compound", stars: 1, o: { k } })!))).toContain(`A LONE LOAD FIRES ALONE AFTER ${fmtSec(ITEMS.compound.core!.hold!)}`);
    // SORTING ARM: one count across every belt its arrows reach
    expect(glossaryText("HIT", { def: "sorting", stars: 1 })).toContain("ON EVERY BELT ITS ARROWS REACH");
    // FOUNDRY / CRUCIBLE: the pair window, the two intakes and the lone blank (PAIR, on CRUCIBLE's own face)
    const pair = stripIcons(icons(glossaryText("PAIR", { def: "crucible", stars: 1 })!));
    expect(pair).toContain(`BY TWO INTAKES WITHIN ${fmtSec(SYNC_WINDOW)}`);
    expect(pair).toContain("A LONE ONE FIRES ON ITS OWN");
    expect(stripIcons(icons(glossaryText("PAIR")!))).toContain(`BY TWO INTAKES, WITHIN ${fmtSec(SYNC_WINDOW)}`); // every other PAIR
    // SURGE VALVE: its face says the pulse's speed and length (group 0 fix 1), its EVERY label's tap explains it
    const p = effectAt("surge", 1).gate!.pulse!;
    expect(stripIcons(faceLines("surge", 1)!.rules[0].text)).toContain(`${fmtCount(p.speed)} TIMES AS FAST FOR ${fmtSec(p.on)}`);
    expect(glossaryText("EVERY", { def: "surge", stars: 1 })).toContain(`RUNS FAST FOR ${fmtSec(p.on)}{SEC}, THEN AS BEFORE`);
    // every tap note sits on a word its piece's face draws (a trigger label or a word of its rule)
    for (const [def, n] of Object.entries(TAP_NOTES)) {
      const fl = faceLines(def, 1, { k: 1 })!;
      const said = [...fl.rules.map((r) => `${r.label ?? ""} ${r.text}`)].join(" ");
      expect(new RegExp(`\\b${n.word}\\b`).test(stripIcons(said).replace(/\d+(?:\.\d+)?/g, "")), `${def}: ${n.word}`).toBe(true);
    }
  });
});

/** The text of every string literal in TypeScript source (tests/faceText.test.ts's scanner): "..." and '...' whole, a
 *  template's text parts (its ${...} expressions scanned as code); comments skipped. */
function stringLiterals(src: string): string[] {
  const out: string[] = [];
  let i = 0;
  const code = (stopAtBrace: boolean): void => {
    let depth = 0;
    while (i < src.length) {
      const ch = src[i];
      if (ch === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
      if (ch === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i + 2) + 2; continue; }
      if (ch === "/" && /[(,=:[!&|?{};]\s*$/.test(src.slice(Math.max(0, i - 20), i))) { // a regex literal: skip it
        let j = i + 1;
        while (j < src.length && src[j] !== "/") { if (src[j] === "\\") j++; else if (src[j] === "[") { while (src[j] !== "]") j++; } j++; }
        i = j + 1;
        continue;
      }
      if (ch === '"' || ch === "'") {
        let j = i + 1, s = "";
        while (src[j] !== ch) { if (src[j] === "\\") { s += src[j + 1]; j += 2; } else s += src[j++]; }
        out.push(s);
        i = j + 1;
        continue;
      }
      if (ch === "`") { i++; template(); continue; }
      if (stopAtBrace && ch === "{") depth++;
      if (stopAtBrace && ch === "}") { if (depth === 0) { i++; return; } depth--; }
      i++;
    }
  };
  const template = (): void => {
    let s = "";
    while (i < src.length) {
      const ch = src[i];
      if (ch === "\\") { s += src[i + 1]; i += 2; continue; }
      if (ch === "`") { i++; if (s) out.push(s); return; }
      if (ch === "$" && src[i + 1] === "{") { if (s) out.push(s); s = ""; i += 2; code(true); continue; }
      s += ch;
      i++;
    }
  };
  code(false);
  return out;
}
