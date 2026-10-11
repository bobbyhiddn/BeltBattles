import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { COMMISSION_BASE, COMMISSION_STEP, ITEMS, JAM_THRESHOLD, WINDOW_TIME, type HeroId } from "../src/sim/content";
import { SHIELD_CAP, WIND_START } from "../src/sim/content"; // SUS-B (REQ-BFG-069)
import { withHullScale } from "../src/sim/hullScale"; // AZ-BUMP (the flip): the DARK WIND row's switch-off words
import { SYNC_WINDOW } from "../src/sim/races/foundry";
import { effectAt, fusible } from "../src/sim/stars";
import { scaleCore } from "../src/sim/cores";
import { C } from "../src/render/palette";
import { ICON, ICON_COLOUR, KEYWORDS, PLAYER_WORD, icons, stripIcons, textWidth } from "../src/render/font";
import { PLATE_CAP } from "../src/sim/races/bastion"; // CARD-3 (REQ-BFG-107): SHIELD's MAX
import { NAMES_KEPT } from "../src/ui/gameWords"; // CARD-3: a name is never a keyword
import { KEYWORD_COLOUR, colourize, wrapRich } from "../src/ui/richText";
import { FACE_IDS, faceAt, faceLines } from "../src/ui/faces"; // Y7b2 (the flip): SIM's import went with its poison constants
import { captureFormats, FORMATTERS, fmtCount, fmtSec } from "../src/ui/statFormat";
import { fmtDmg } from "../src/ui/statFormat"; // Y7b2 (the flip): SURGE VALVE's damage pulse on its face
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
    // CARD-3 (REQ-BFG-107): a tap reaches the word as drawn (PLAYER_WORD)
    for (const k of KEYWORDS) if (faceAt(def, s, o)!.reminders.some((r) => r.includes(`{*${k}}`))) out.push({ id: `${def} ★${s} ${k}`, text: glossaryText(PLAYER_WORD[k], { def, stars: s, o })! });
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
    // NUM-3 (R1's STUN fold): the FREEZE row is gone (a FROSTBITE round STUNs), so FROZEN names no row; an alias still finds
    // its row (was: FROZEN found FREEZE)
    expect(glossaryEntry("FROZEN")).toBeUndefined();
    expect(glossaryEntry("STUNNED")!.word).toBe("STUN");
    expect(glossaryEntry("PAIRS")!.word).toBe("PAIR");
    expect(glossaryEntry("NOT A WORD")).toBeUndefined();
    expect(GLOSSARY_WRAP_W).toBe(225);
  });

  it("glossaryWordsIn: the rows a line names, each once, in order; whole words, the longest form first", () => {
    const words = (t: string) => glossaryWordsIn(t).map((r) => r.word);
    expect(words("PAIR: +25% DAMAGE.")).toEqual(["PAIR"]);
    // Y7b2 (the words; LOAD TIME retires): its row is gone (no text names it; glossary.ts RETIRED), so the line names none
    // (was ["LOAD TIME"]); BONUS DAMAGE below keeps a two-word form
    expect(words("LOAD TIME -0.25 SEC, NOT UNDER 0.3 SEC.")).toEqual([]);
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
      expect(r.word, k).toBe(PLAYER_WORD[k]); // CARD-3 (REQ-BFG-107): PLATE reads SHIELD, SHIELD reads WARD
      expect(r.colour, k).toBe(ICON_COLOUR[ICON[k]]); // font.ts, the one source (REQ-BFG-032 rule 3)
      expect(r.def.startsWith(`{*${k}}:`) || r.def.startsWith(`EACH {*${k}}:`), r.def).toBe(true);
      if (r.extra) expect((r.extra.match(/\.(?=\s|$)/g) ?? []).length, `${k}: at most one sentence`).toBeLessThanOrEqual(1);
    }
  });

  it("the same mechanic is one row: SHOCK and STALL are STUN's (one disrupt timer), SHIELDS and SHIELDED SHIELD's, WARDS WARD's, FIRE RATE and WORKS FASTER RATE's, MACHINE PART's", () => {
    // CARD-3 (REQ-BFG-107): PLATE, PLATES, PLATED and PLATING name no row (the word PLATE is in no player text)
    for (const w of ["PLATE", "PLATES", "PLATED", "PLATING"]) expect(glossaryEntry(w), w).toBeUndefined();
    for (const [form, word] of [["SHOCK", "STUN"], ["STALL", "STUN"], ["STALLED", "STUN"], ["SHIELDS", "SHIELD"], ["SHIELDED", "SHIELD"], ["WARDS", "WARD"], ["FIRE RATE", "RATE"], ["WORKS FASTER", "RATE"], ["MACHINE", "PART"]]) {
      expect(glossaryEntry(form)!.word, form).toBe(word);
    }
    // JAM keeps one meaning, an over-fed gun skipping a shot; STUN keeps today's (the part stops)
    expect(glossaryEntry("JAM")!.def).toBe(`JAM: A GUN WITH ${fmtCount(JAM_THRESHOLD)} LOADS BACKED UP AT ITS INTAKES SKIPS A SHOT.`);
    expect(stripIcons(keywordRow("STUN").def)).toContain("THE ENEMY PART IT HITS STOPS");
    // colours: battle colours where the game has them
    // NUM-3 (R1's STUN fold): FREEZE has no row (it is STUN's, in STUN's colour); POISON and SPEED keep their battle colours
    // Y7b2 (the flip): the POISON row left with POISON (STAR_RETIRED's rows left the table; KEYWORD_COLOUR.poison is gone),
    // so it has none either (was glossaryEntry("POISON")!.colour, KEYWORD_COLOUR.poison)
    expect([glossaryEntry("FREEZE"), glossaryEntry("POISON"), glossaryEntry("SPEED")!.colour]).toEqual([undefined, undefined, KEYWORD_COLOUR.faster]);
    expect(keywordRow("STUN").colour).toBe(ICON_COLOUR[ICON.STUN]);
  });

  it("the rune keywords have rows (BURN, RIDE and STUN too), and the rune cards' colours and reminders come from them", () => {
    for (const k of Object.keys(KEYWORD_WORD) as RuneKeyword[]) {
      const row = glossaryEntry(KEYWORD_WORD[k]);
      expect(row, k).toBeDefined();
      expect(RUNE_KEYWORD_COLOUR[k], k).toBe(row!.colour);
    }
    // each rune reminder: number-free, its word first, and it says what its row says (a phrase both hold)
    const same: Record<string, string> = {
      // WORDS-1 (REQ-BFG-081; READ-1 4): PAIR from two belts (was "TWO LOADS REACH ONE TURRET AT ONCE"), FRAY on the hull's
      // later shots (was "LATER HIT": HIT read as the rig's label)
      PLATE: "POINT FOR POINT", PAIR: // CARD-3 (REQ-BFG-107): the genre's words, in both (was "BEFORE YOUR HULL")
        "TWO LOADS REACH ONE TURRET FROM TWO BELTS AT ONCE", HEAT: "FOR EACH SEC IT RIDES", FRAY: "EVERY LATER SHOT",
      // U2d F4: RIDE's row reworded (cap), its reminder its first sentence; was "CINDER SLUG'S OWN"
      RATE: "HOW OFTEN A GUN FIRES OR A FACTORY WORKS", BURN: "HULL DAMAGE", RIDE: "THE HEAT A KILN'S SLUGS GAIN FOR EACH SEC THEY RIDE", STUN: "STOPS FOR A WHILE", // FLIP-X2 N4-d: STUN (was STALL)
      // SUS-B (REQ-BFG-069): the sustain keywords' rune reminders (SUSTAIN-1 4.1)
      // NUM-4 (REVIEW-SUSB F1): a SHIELD blocks one hit's DAMAGE (was "STOPS ONE WHOLE HIT")
      // CARD-2 (REQ-BFG-081, K3 b): ALL OF one hit's damage, in the reminder and the row alike (was "BLOCKS ONE HIT'S DAMAGE")
      SHIELD: "BLOCKS ALL OF ONE HIT'S DAMAGE", HEAL: "NEVER PAST FULL", REGEN: "EACH SEC",
    };
    // U2d F4 (cap, seen in crop-keywords-rune-op): RIDE's row in cap's words, whole (2 lines of 5x7 at 225 px: the fit test below)
    expect(glossaryEntry("RIDE")!.def).toBe("RIDE: THE {*HEAT} A KILN'S SLUGS GAIN FOR EACH SEC THEY RIDE. NOT A HEAT JACKET'S.");
    expect(Object.keys(RUNE_REMINDER).sort()).toEqual(Object.keys(same).sort());
    for (const [k, phrase] of Object.entries(same)) {
      const rem = RUNE_REMINDER[k];
      // FLIP-X2 (N4-d): its word first, the keyword's own name again (the STALL token is STUN now, so NUM-4's "the word the
      // rune card draws" form, KEYWORD_WORD[k], is no longer needed: every rune keyword's word is its name)
      // CARD-3 (REQ-BFG-107): the word a card draws is the keyword's player word (PLATE reads SHIELD, SHIELD reads WARD)
      const w = KEYWORD_WORD[k as RuneKeyword];
      expect(rem.startsWith(`${w}: `), rem).toBe(true);
      expect(w, k).toBe(({ PLATE: "SHIELD", SHIELD: "WARD" } as Record<string, string>)[k] ?? k);
      expect(rem, k).not.toMatch(/\d/);
      expect(rem, k).toContain(phrase);
      expect(stripIcons(icons(glossaryEntry(w)!.def)).replace(/  +/g, " "), k).toContain(phrase);
    }
    // the rune card reads them: a rune naming PLATE shows PLATE's reminder, its word in PLATE's colour
    const plate = RUNE_LIST.find((d) => d.id === "rivet_hoard")!;
    expect(runeReminder(plate)).toBe(RUNE_REMINDER.PLATE);
    expect(runeReminderSpans(plate)[0]).toEqual({ t: "SHIELD", c: ICON_COLOUR[ICON.PLATE] }); // CARD-3: SHIELD, in the soak's colour
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
      const kws = KEYWORDS.filter((k) => faceAt(def, s, o)!.reminders.some((r) => r.includes(`{*${k}}`))).map((k) => PLAYER_WORD[k]); // CARD-3
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
    // the constants the rows quote, as T2a's sentences quoted them. Y7b2 (the flip): SIM.poisonTick, SIM.poisonMax and
    // SIM.poisonTime left with POISON (deleted symbols; were 4, 24 and 6, NUM-1: poison 4 a stack each second)
    expect([WINDOW_TIME, COMMISSION_BASE, COMMISSION_STEP, JAM_THRESHOLD, SYNC_WINDOW]).toEqual([1.5, 1.2, 0.6, 4, 0.25]);
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
    // CARD-3 (REQ-BFG-107): the word as drawn (PLAYER_WORD: SHIELD, WARD), a whole word, never inside a name (NAMES_KEPT)
    for (const { id, text } of shownTexts()) for (const k of KEYWORDS) {
      const t = NAMES_KEPT.reduce((x, n) => x.split(n).join(""), icons(text).replace(/HEAT JACKET/g, ""));
      for (const m of t.matchAll(new RegExp(`\\b${PLAYER_WORD[k]}(?:S|ED)?\\b`, "g"))) expect(t[m.index! - 1], `${id}: ${k} in ${stripIcons(t)}`).toBe(ICON[k]);
    }
    console.log(`U2c glossary fit: ${n} texts, each 2 lines or fewer at ${GLOSSARY_WRAP_W} px (the longest ${widest} px unwrapped)`);
  });
});

describe("SUS-B (REQ-BFG-069): the SHIELD, HEAL and REGEN rows and the DARK WIND text row", () => {
  // SUSTAIN-1 4.1 as cap accepted it; where 4.1's verb HEALS would stand as a bare keyword (REQ-BFG-032 rule 3, the fit
  // test above), the row says it another way: REGEN GIVES BACK, a hull with BURN GETS HALF, IT STOPS, NO HEAL IN IT
  const want: Record<string, { def: string; aliases: string[]; colour: string }> = {
    // NUM-4 (REVIEW-SUSB F1): BLOCKS ONE HIT'S DAMAGE (was "STOPS ONE WHOLE HIT"); the extra {*BURN} GOES PAST IT. stays
    // CARD-2 (REQ-BFG-081, K3 b; READ-3 6: SHIELD read as plate that soaks): ALL OF one hit's damage (was "BLOCKS ONE HIT'S")
    // CARD-3 (REQ-BFG-107): the soak layer is SHIELD (point for point; which acts first), the one-hit block WARD (CARD-2's
    // words with its cap); THE DARK WIND GOES PAST IT moved to the DARK WIND row
    SHIELD: { def: `{*PLATE}: SOAKS HULL DAMAGE POINT FOR POINT. MAX ${fmtDmg(PLATE_CAP)} {PLATE}. A {*SHIELD} GOES FIRST.`, aliases: ["SHIELDS", "SHIELDED"], colour: ICON_COLOUR[ICON.PLATE] },
    WARD: { def: `{*SHIELD}: BLOCKS ALL OF ONE HIT'S DAMAGE, THEN BREAKS. MAX ${fmtCount(SHIELD_CAP)} {SHIELD}. {*BURN} GOES PAST IT.`, aliases: ["WARDS"], colour: ICON_COLOUR[ICON.SHIELD] },
    HEAL: { def: "{*HEAL}: GIVES BACK {HULL}, NEVER PAST FULL. A HULL WITH {*BURN} GETS HALF.", aliases: ["HEALS", "HEALED", "HEALING", "REPAIR", "REPAIRS"], colour: ICON_COLOUR[ICON.HEAL] },
    REGEN: { def: "{*REGEN}: GIVES BACK THIS MUCH {HULL} EACH SEC. IT STOPS IN THE DARK WIND.", aliases: [], colour: ICON_COLOUR[ICON.REGEN] },
    // AZ-BUMP (the flip, HULL_SCALE): "HULL DAMAGE THAT GROWS. NO {*HEAL} IN IT." -> "EACH HULL LOSES A GROWING % OF ITS MAX
    // EACH SEC. NO {*HEAL}.": with HULL_SCALE on the wind is a share of each hull's own max, and the row says so (glossary.ts,
    // HULL-1c's words; tests/hull1c.windhud). The switch off still reads SUS-B's words (DARK_WIND_OFF, the tap test below)
    // CARD-3 (REQ-BFG-107): + PAST {*PLATE} (the soak row's THE DARK WIND GOES PAST IT moved here). MERGE-099D (cap's ruling,
    // oracle 19ddc7af83f1dba3): in both rows; the ON row reads HULLS LOSE A GROWING % OF MAX EACH SEC so it keeps 2 lines
    "DARK WIND": { def: `DARK WIND: FROM ${fmtSec(WIND_START)}{SEC}, HULLS LOSE A GROWING % OF MAX EACH SEC, PAST {*PLATE}. NO {*HEAL}.`, aliases: [], colour: C.bone },
  };
  // MERGE-099D (1f; cap's ruling, oracle 19ddc7af83f1dba3): the switch off reads CARD-3's words, + PAST {*PLATE}
  const DARK_WIND_OFF = `DARK WIND: FROM ${fmtSec(WIND_START)}{SEC}, HULL DAMAGE THAT GROWS, PAST {*PLATE}. NO {*HEAL} IN IT.`;

  it("each row: its word first, its aliases, its colour (the icon's; DARK WIND none), its definition in markup", () => {
    for (const [word, w] of Object.entries(want)) {
      const row = glossaryEntry(word)!;
      expect(row.word, word).toBe(word);
      expect([row.def, [...row.aliases], row.colour, row.scope], word).toEqual([w.def, w.aliases, w.colour, "text"]);
      for (const a of w.aliases) expect(glossaryEntry(a)!.word, a).toBe(word); // REPAIR and REPAIRS are HEAL's: one mechanic, one word
    }
    expect(glossaryEntry("DARK WIND")!.kw).toBeUndefined();
    expect([keywordRow("SHIELD").kw, keywordRow("HEAL").kw, keywordRow("REGEN").kw]).toEqual(["SHIELD", "HEAL", "REGEN"]);
    expect([SHIELD_CAP, WIND_START]).toEqual([3, 25]); // the sim's numbers the rows print (fmtCount, fmtSec)
  });

  it("each fits 2 lines of 5x7 at 225 px (textWidth, wrapRich), number-free in glossary.ts (the formatters print them)", () => {
    const report: string[] = [];
    for (const [word, w] of Object.entries(want)) {
      const glyphs = icons(w.def), lines = wrapRich(colourize(glyphs, C.bone), GLOSSARY_WRAP_W, "5");
      expect(lines.length, `${word}: ${stripIcons(glyphs)}`).toBeLessThanOrEqual(2);
      for (const l of lines) expect(textWidth(l.map((s) => s.t).join(""), "5"), word).toBeLessThanOrEqual(GLOSSARY_WRAP_W);
      report.push(`${word} ${textWidth(glyphs, "5")} px unwrapped, ${lines.length} lines (${lines.map((l) => textWidth(l.map((s) => s.t).join(""), "5")).join(" + ")} px)`);
    }
    // the rune reminders the cards draw are number-free, each its word first (the rune-keywords test above pins the phrase)
    for (const k of ["PLATE", "SHIELD", "HEAL", "REGEN"]) expect(RUNE_REMINDER[k].startsWith(`${KEYWORD_WORD[k as RuneKeyword]}: `) && !/\d/.test(RUNE_REMINDER[k]), k).toBe(true); // CARD-3
    console.log(`SUS-B rows: ${report.join("; ")}`);
  });

  it("a tap on each label shows its LABEL: EFFECT text: the row's, an alias's, and a kept text's word (RIVETER's old REPAIRS)", () => {
    expect(glossaryText("SHIELD")).toBe(want.SHIELD.def);
    expect(glossaryText("SHIELDS")).toBe(want.SHIELD.def);
    expect(glossaryText("WARD")).toBe(want.WARD.def); // CARD-3 (REQ-BFG-107)
    expect(glossaryText("WARDS")).toBe(want.WARD.def);
    expect(glossaryText("HEALING")).toBe(want.HEAL.def);
    expect(glossaryText("REPAIRS")).toBe(want.HEAL.def);
    expect(glossaryText("REGEN")).toBe(want.REGEN.def);
    expect(glossaryText("DARK WIND")).toBe(want["DARK WIND"].def);
    expect(withHullScale(() => glossaryText("DARK WIND"), false)).toBe(DARK_WIND_OFF); // AZ-BUMP: the switch off, SUS-B's words
    // a kept text names them as words: each is a tap there, the longest form first
    const t = "IT REPAIRS YOUR HULL. NOTHING HEALS IN THE DARK WIND. TWO SHIELDS AND REGEN.";
    expect(glossaryHits(t).map((h) => [t.slice(h.at, h.end), h.row.word])).toEqual([
      ["REPAIRS", "HEAL"], ["HEALS", "HEAL"], ["DARK WIND", "DARK WIND"], ["SHIELDS", "SHIELD"], ["REGEN", "REGEN"],
    ]);
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
    // NUM-4 (REQ-BFG-047; N1 2.2): the pair window, SYNC_WINDOW 0.25 s, is a hidden timer no whole second says, so the
    // rows name it in the PAIR word's own terms, AT ONCE (was "WITHIN 0.25{SEC}"): an EQUIVALENT home for the window,
    // and the window itself is still the sim's 15 ticks (the rows say when, not how long)
    expect(SYNC_WINDOW).toBe(0.25);
    const pair = stripIcons(icons(glossaryText("PAIR", { def: "crucible", stars: 1 })!));
    expect(pair).toContain("BY TWO INTAKES AT ONCE");
    expect(pair).toContain("A LONE ONE FIRES ON ITS OWN");
    // WORDS-1 (REQ-BFG-081; READ-1 4: readers took a pair for two slugs fired together): FROM TWO BELTS, in the reminder
    // itself (was "TWO LOADS REACH ONE TURRET AT ONCE. BY TWO INTAKES.")
    expect(stripIcons(icons(glossaryText("PAIR")!))).toContain("TWO LOADS REACH ONE TURRET FROM TWO BELTS AT ONCE."); // every other PAIR
    // SURGE VALVE: its face says the pulse's speed and length (group 0 fix 1), its EVERY label's tap explains it. Y7b2 (the
    // flip): the speed pulse left (Y3), so the face says the damage pulse, its period and damage, and the tap who gets it
    // (were toContain(`${fmtCount(p.speed)} TIMES AS FAST FOR ${fmtSec(p.on)}`) and toContain(`RUNS FAST FOR
    // ${fmtSec(p.on)}{SEC}, THEN AS BEFORE`))
    const p = effectAt("surge", 1).gate!.pulse!;
    expect(stripIcons(faceLines("surge", 1)!.rules[0].text)).toBe(stripIcons(icons(`EVERY ${fmtSec(p.period)}{SEC}: +${fmtDmg(p.flat)} {DMG} TO SLUGS ON ITS BELTS.`)));
    expect(glossaryText("EVERY", { def: "surge", stars: 1 })).toBe(`EVERY ${fmtSec(p.period)}{SEC}: EACH SLUG ON ITS BELTS GETS IT, BEFORE ITS TILE TOO.`);
    // every tap note sits on a word its piece's face draws (a trigger label or a word of its rule). Y7b2 (the flip):
    // STAR_TAP_NOTES folded into TAP_NOTES, so EXT. CHAMBER's UP TO note joins (Y7b1 Y7A-R2): its ★1 face fires exactly 2,
    // no UP TO, and its ★2/★3 faces say UP TO, so that note sits on its faces from ★2 (the others on ★1's, as before)
    const said = (def: string, s: number) => {
      const fl = faceLines(def, s, { k: 1 })!;
      return stripIcons([...fl.rules.map((r) => `${r.label ?? ""} ${r.text}`)].join(" ")).replace(/\d+(?:\.\d+)?/g, "");
    };
    for (const [def, n] of Object.entries(TAP_NOTES)) for (const s of def === "chamber" ? [2, 3] : [1]) {
      expect(new RegExp(`\\b${n.word}\\b`).test(said(def, s)), `${def} ★${s}: ${n.word}`).toBe(true);
    }
    expect([TAP_NOTES.chamber?.word, /\bUP TO\b/.test(said("chamber", 1))]).toEqual(["UP TO", false]);
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
