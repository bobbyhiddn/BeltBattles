// SUS-B (REQ-BFG-069, REQ-BFG-070; SUSTAIN-1 4.1, 4.4, 4.9 as cap accepted it; docs/TEXT-STYLE.md): the words and faces of
// SHIELD, HEAL and REGEN. The faces of RIVETER (HEAL), WARD BELL (SHIELD), MEND PRESS (HEAL) and MENDING LOOM (REGEN), each
// one ability line, every number through a formatter; their ⓘ LEVELS ladders and KEYWORDS; their shop chips and one-line
// effects; their ability text (the kept sentences, the gist, the card) and RIVETER's timeline line; WARD STONE's rune line
// (START: +3 SHIELD.); a tap on each new label; and, because the three new pieces stay out of every listing until RUNES-2b
// flips the sustain switch, the face, ability-text and glossary coverage checks run under withSustain, so they hold the day
// the switch flips.
import { describe, expect, it } from "vitest";
import { installRaster } from "./raster.helpers";
import { AMMO, ITEMS, SHIELD_CAP, SUSTAIN_IDS, SUSTAIN_LIVE, buyableModules, withSustain, type ItemDef } from "../src/sim/content"; // NUM-4: secPer unused (RATE)
import { effectAt, fusible } from "../src/sim/stars";
import { ICON, ICON_COLOUR, KEYWORDS, icons, stripIcons, textWidth } from "../src/render/font";
import { C } from "../src/render/palette";
import { colourize, lineText, wrapRich } from "../src/ui/richText";
import { captureFormats, FORMATTERS, fmtCount, fmtDmg, fmtSec, fmtSpeed } from "../src/ui/statFormat";
import { FACE_IDS, NEXT_LINE_W, REMINDER, faceAt, faceLines, faceNext, factoryStats, hasFace } from "../src/ui/faces";
import { abilityText, cardText, gist, hasAbilityText, hitText, nextStarText } from "../src/ui/abilityText";
import { GLOSSARY_WRAP_W, glossaryEntry, glossaryText, keywordRow } from "../src/ui/glossary";
import { shopChip } from "../src/ui/chips";
import { levelLines, levelText } from "../src/screens/build/levels";
import { RUNE_LIST } from "../src/sim/runes";
import { RUNE_KEYWORD_COLOUR, runeKeywords, runeLine, runeReminder, runeSpans } from "../src/ui/runeText";
import { newRun, type Run } from "../src/game/run";
import { computeView } from "../src/core/io";
import { UI, type Rect } from "../src/ui/ui";
import { buildLayout, buildScale, panelArea, type Sel } from "../src/screens/build/layout";
import { detailsPlan, fullText } from "../src/screens/build/inspector";
import { panelPiece, panelWords } from "../src/screens/build/keywords";
import type { Ctx } from "../src/screens/build/actions";
import { banned, numbers } from "./textRules";

installRaster();

const STARS = [1, 2, 3];
const SUSTAIN_FACES = ["riveter", "wardbell", "mendpress", "mendingloom"];
/** A line's numbers, its star labels aside (faceText's). */
const numbersIn = (s: string): string[] => [...stripIcons(s).replace(/★\d/g, "").matchAll(/\d+(?:\.\d+)?%?/g)].map((m) => m[0]);
const g = (id: string, s: number) => effectAt(id, s);

describe("SUS-B the faces (REQ-BFG-070: stats apart from abilities, one line, levels behind ⓘ)", () => {
  it("the switch is off on this base: the three new pieces resolve but no listing shows them; their faces exist", () => {
    // FLIP-X2 (REQ-BFG-069, release X): the switch is on (was false): every listing shows them; off (withSustain(fn,
    // false)) none does, as on SUS-B's base
    expect(SUSTAIN_LIVE).toBe(true);
    expect(SUSTAIN_IDS).toEqual(["wardbell", "mendpress", "mendingloom"]);
    for (const id of SUSTAIN_IDS) {
      expect(withSustain(() => buyableModules().some((d) => d.id === id), false), id).toBe(false);
      expect(buyableModules().some((d) => d.id === id), id).toBe(true);
      expect([hasFace(id), hasAbilityText(id), FACE_IDS.includes(id)], id).toEqual([true, true, true]);
    }
  });

  // TXT-AZ (REQ-BFG-070; REVIEW-TXT096 Q3): MEND PRESS's line leads with its condition, FEEDS A GUN (tests/txtaz.presses.test.ts
  // reads it off the sim); was "EVERY 3{SEC}: {*HEAL} 20." (the label stays, in brass, after it)
  it("each face at every star, in markup through the formatters: RIVETER HIT: HEAL 6, WARD BELL EVERY 8s: +1 SHIELD, MEND PRESS FEEDS A GUN: EVERY 3s: HEAL 20, MENDING LOOM YOUR HULL: REGEN 10", () => {
    for (const s of STARS) {
      const rv = faceAt("riveter", s)!, heal = fmtDmg(g("riveter", s).gate!.heal!);
      expect([rv.stats, rv.rules, rv.reminders]).toEqual([[], [{ text: `HIT: {*HEAL} ${heal}.`, label: "HIT:" }], [REMINDER.HEAL()]]);
      const wb = faceAt("wardbell", s)!, sh = g("wardbell", s).mod!.shield!;
      const every = `EVERY ${fmtSec(sh.every)}{SEC}:`;
      expect([wb.stats, wb.rules, wb.reminders]).toEqual([[], [{ text: `${every} +${fmtCount(sh.amount)} {*SHIELD}.`, label: every }], [REMINDER.SHIELD()]]);
      const mp = faceAt("mendpress", s)!, h = g("mendpress", s).factory!.heal!;
      const pe = `EVERY ${fmtSec(h.every)}{SEC}:`;
      // MEND PRESS's stat row is ARMOR PRESS's kind's (factoryStats: its cadence, its plain slug's damage, its belts)
      expect(mp.stats).toEqual(factoryStats("mendpress", s));
      // NUM-4 (REQ-BFG-047): the cadence pair is ["RATE", its SPEED] through fmtSpeed (faces.ts speedPair; was ["SEC",
      // fmtSpeed(secPer(speed))], the interval 30 / speed)
      expect(mp.stats.slice(0, 2)).toEqual([["RATE", fmtSpeed(g("mendpress", s).factory!.speed)], ["DMG", fmtDmg(AMMO.plain.base)]]);
      expect(factoryStats("armorpress", s).map(([ic]) => ic)).toEqual(mp.stats.map(([ic]) => ic));
      expect([mp.rules, mp.reminders, mp.stats2]).toEqual([[{ text: `FEEDS A GUN: ${pe} {*HEAL} ${fmtDmg(h.amount)}.`, label: pe }], [REMINDER.HEAL()], undefined]);
      const ml = faceAt("mendingloom", s)!;
      // "YOUR HULL:" says whose, not when: no trigger, so no brass label (TEXT-STYLE 3.2, 3.3)
      // WORDS-1 (REQ-BFG-081; READ-1 6.2: REGEN merged into HEAL, battle.ts:1441-1454 its regen goes through heal() each
      // whole second): a HEAL each second (was `YOUR HULL: {*REGEN} n.` with REGEN's reminder)
      expect([ml.stats, ml.rules, ml.reminders]).toEqual([[], [{ text: `YOUR HULL: {*HEAL} ${fmtDmg(g("mendingloom", s).mod!.regen!)} EACH SEC.` }], [REMINDER.HEAL()]]);
    }
    // ★1 as the brief writes them, on this base's numbers (NUM-1's x10; SUS-A's WARD BELL ★1 fallback, 8 s)
    const plain = (id: string) => stripIcons(faceLines(id, 1)!.rules[0].text);
    // MERGE-099C: both sides' lines, as c099 ships them: TXT-AZ item 2's FEEDS A GUN (MEND PRESS) and WORDS-1's MENDING LOOM
    // (was "YOUR HULL: REGEN 10.")
    expect(SUSTAIN_FACES.map(plain)).toEqual(["HIT: HEAL 6.", "EVERY 8: +1 SHIELD.", "FEEDS A GUN: EVERY 3: HEAL 20.", "YOUR HULL: HEAL 10 EACH SEC."]);
  });

  it("every number on them is a formatter's, at every star; no bare keyword; each line fits the op band", () => {
    for (const id of SUSTAIN_FACES) for (const s of STARS) {
      const { value: fl, records } = captureFormats(() => faceLines(id, s));
      for (const r of records) expect(FORMATTERS[r.unit](r.value)).toBe(r.printed);
      const printed = records.map((r) => r.printed);
      for (const line of [fl!.stats ?? "", ...fl!.rules.map((r) => r.text), ...fl!.reminders]) {
        for (const n of numbersIn(line)) {
          expect(printed, `${id} ★${s}: ${n}`).toContain(n);
          printed.splice(printed.indexOf(n), 1);
        }
        for (const k of KEYWORDS) for (const m of line.matchAll(new RegExp(k, "g"))) expect(line[m.index! - 1], `${id}: ${k}`).toBe(ICON[k]);
      }
      // the stat row and the ability line are one 5x7 line each on the op band (a reminder is a tap's 2-line text)
      for (const line of [fl!.stats ?? "", ...fl!.rules.map((r) => r.text)]) expect(textWidth(line, "5"), `${id} ★${s}: ${stripIcons(line)}`).toBeLessThanOrEqual(GLOSSARY_WRAP_W);
    }
  });

  it("the ⓘ LEVELS: a ladder for each number the stars change (one 5x7 line each), the current star marked, then NEXT★", () => {
    // each LEVELS line as text, its icons dropped (a ladder's icon lead leaves no space behind)
    const at = (id: string, s: number) => levelLines(id, s)!.map((l) => stripIcons(icons(levelText(l))).replace(/ +/g, " ").trim());
    // WARD BELL's ladder is EVERY 8/5/4 (LADDER_SEP: the font has no "»", TEXT-STYLE 5.3)
    expect(at("wardbell", 1)).toEqual(["EVERY [8]/5/4", "NEXT ★2: EVERY 5"]);
    expect(at("wardbell", 3)).toEqual(["EVERY 8/5/[4]"]);
    expect(at("riveter", 2)).toEqual(["6/[13]/21", "NEXT ★3: 21"]);
    expect(at("mendingloom", 1)).toEqual(["[10]/15/20", "NEXT ★2: 15"]);
    const press = at("mendpress", 1);
    expect(press).toContain("[20]/30/45");
    expect(press[press.length - 1].startsWith("NEXT ★2: ")).toBe(true);
    // the icons in the ladders: HEAL's, SHIELD's (in its rule), REGEN's
    expect(levelText(levelLines("riveter", 1)![0])).toBe("{HEAL} [6]/13/21");
    expect(levelText(levelLines("mendingloom", 1)![0])).toBe("{HEAL} [10]/15/20"); // WORDS-1: HEAL's icon (was {REGEN})
    expect(levelText(levelLines("wardbell", 1)![0])).toBe("EVERY [8]/5/4{SEC}");
    for (const id of SUSTAIN_FACES) for (const s of STARS) {
      for (const l of levelLines(id, s)!) expect(textWidth(icons(levelText(l, (v) => v)), "5"), `${id} ★${s}`).toBeLessThanOrEqual(NEXT_LINE_W);
      const nx = faceNext(id, s);
      if (s < 3) expect(nx, `${id} ★${s}`).not.toBeNull();
    }
  });

  it("the ⓘ KEYWORDS (a tap's texts): each face keyword's own reminder and its row's extra sentence, 2 lines at 225 px", () => {
    const want: Record<string, [string, string]> = {
      riveter: ["HEAL", `${REMINDER.HEAL()} ${keywordRow("HEAL").extra}`],
      wardbell: ["SHIELD", `${REMINDER.SHIELD()} ${keywordRow("SHIELD").extra}`],
      mendpress: ["HEAL", `${REMINDER.HEAL()} ${keywordRow("HEAL").extra}`],
      mendingloom: ["HEAL", `${REMINDER.HEAL()} ${keywordRow("HEAL").extra}`], // WORDS-1: HEAL (was REGEN's reminder and extra)
    };
    for (const id of SUSTAIN_FACES) for (const s of STARS) {
      const [k, text] = want[id];
      expect(glossaryText(k, { def: id, stars: s }), `${id} ★${s}`).toBe(text);
      expect(wrapRich(colourize(icons(text), C.bone), GLOSSARY_WRAP_W, "5").length, id).toBeLessThanOrEqual(2);
    }
  });

  it("their one-line shop offers: the stat chip (the rule's keyword with its count) and the card's sentence", () => {
    expect(SUSTAIN_FACES.map((id) => shopChip(id))).toEqual([
      `{HEAL}${fmtDmg(ITEMS.riveter.gate!.heal!)}`, `{SHIELD}+${fmtCount(ITEMS.wardbell.mod!.shield!.amount)}`,
      `{HEAL}${fmtDmg(ITEMS.mendpress.factory!.heal!.amount)}`, `{HEAL}${fmtDmg(ITEMS.mendingloom.mod!.regen!)}`, // WORDS-1: {HEAL} (was {REGEN})
    ]);
    expect(SUSTAIN_FACES.map((id) => cardText(id))).toEqual([
      "HEALS 6 HULL EACH HIT.", "SHIELDS YOUR HULL EVERY 8 SECONDS." /* FLIP-X2 (cap's ruling 207816b18a9fbfdb C): was "+1 SHIELD EVERY 8 SECONDS." */, "HEALS YOUR HULL EVERY 3 SECONDS.", "HEALS 10 HULL EVERY SECOND.",
    ]);
  });
});

describe("SUS-B the ability text (the kept sentences, gist, card; RIVETER's words are HEAL's)", () => {
  /** The numbers each piece's sentences quote at a star (abilityText.test's NUMBERS rows, for RUNES-2b to move there). */
  const NUMBERS: Record<string, (e: ItemDef) => number[]> = {
    riveter: (e) => [e.gate!.heal!],
    // NUM-4 (REVIEW-SUSB F1): the 1 is BLOCKS ONE HIT'S DAMAGE now (was STOPS ONE WHOLE HIT)
    wardbell: (e) => [e.mod!.shield!.amount, e.mod!.shield!.every, SHIELD_CAP, 1], // GAINS ONE ... UP TO 3; BLOCKS ONE HIT'S DAMAGE
    // NUM-4 (REQ-BFG-047): the stamp's cadence is quoted as its SPEED, "AT RATE n" with n = effectAt(...).factory.speed (was
    // its interval, +secPer(speed).toFixed(2), "EVERY 1.58 SECONDS")
    mendpress: (e) => [e.factory!.heal!.amount, e.factory!.heal!.every, AMMO.plain.base, e.factory!.speed],
    mendingloom: (e) => [e.mod!.regen!],
  };

  it("each star's sentences quote that star's numbers; whole plain sentences, no banned shorthand", () => {
    for (const id of SUSTAIN_FACES) for (const s of STARS) {
      const at = abilityText(id, s), tag = `${id} ★${s}`;
      expect(numbers(at.sentences.join(" ")), tag).toEqual(NUMBERS[id](effectAt(id, s)));
      expect(at.sentences[0], tag).toMatch(/^[A-Z][A-Z0-9 ,:;'%()★.+-]*\.$/);
      for (const t of at.sentences) expect(t, tag).toMatch(/^[A-Z0-9][^\n·]*\.$/);
      for (const t of [...at.sentences, gist(id, s), nextStarText(id, s) ?? "", s === 1 ? cardText(id) : ""]) expect(banned(t), `${tag}: ${t}`).toEqual([]);
    }
    expect(abilityText("riveter", 1).sentences).toEqual([
      "HEALS YOUR HULL BY 6 FOR EACH PAYLOAD IT HITS.", "IT NEVER HEALS PAST YOUR FULL HULL.", "A HULL WITH BURN HEALS HALF, AND NOTHING HEALS IN THE DARK WIND.",
    ]);
    expect(abilityText("wardbell", 1).sentences[0]).toBe(`YOUR HULL GAINS ONE SHIELD EVERY 8 SECONDS, UP TO ${SHIELD_CAP}.`);
    expect(abilityText("mendingloom", 2).sentences[0]).toBe("HEALS YOUR HULL BY 15 EVERY SECOND.");
  });

  it("RIVETER's belt timeline line says HEALS (was REPAIRS), its number its star's", () => {
    for (const s of STARS) expect(hitText({ def: "riveter", stars: s } as Parameters<typeof hitText>[0], "free")).toBe(`RIVETER HEALS ${g("riveter", s).gate!.heal} HULL`);
  });

  it("the three new pieces' desc lines are real (no placeholder), number-free, at most 20 a line, and name no sustain word", () => {
    for (const id of SUSTAIN_IDS) {
      const d = ITEMS[id].desc;
      expect(d.length, id).toBe(3);
      for (const line of d) {
        expect(line.length, `${id}: ${line}`).toBeLessThanOrEqual(20);
        expect(line, id).not.toMatch(/\d|SHIELD|HEAL|REGEN/);
      }
    }
    // NUM-4 (REVIEW-SUSB F1): a SHIELD blocks one hit's damage, not the whole hit (was "... STOPS ONE WHOLE HIT, ...")
    expect(ITEMS.wardbell.desc.join(" ")).toBe("RINGS A WARD THAT BLOCKS ONE HIT, AGAIN AND AGAIN.");
  });
});

describe("SUS-B WARD STONE reads as SHIELD (its rune line; runes.ts keeps the rule)", () => {
  it("START: +3 SHIELD., SHIELD in its colour, SHIELD's rune reminder", () => {
    const ward = RUNE_LIST.find((r) => r.id === "ward_stone")!;
    expect(ward.amount.n).toBe(3);
    expect(runeLine(ward)).toBe("START: +3 SHIELD.");
    expect(runeKeywords(ward)).toEqual(["SHIELD"]);
    expect(runeSpans(ward).find((sp) => sp.t === "SHIELD")!.c).toBe(ICON_COLOUR[ICON.SHIELD]);
    expect(RUNE_KEYWORD_COLOUR.SHIELD).toBe(ICON_COLOUR[ICON.SHIELD]);
    // NUM-4 (REVIEW-SUSB F1): it blocks one hit's DAMAGE (was "SHIELD: STOPS ONE WHOLE HIT, THEN BREAKS.")
    expect(runeReminder(ward)).toBe("SHIELD: BLOCKS ONE HIT'S DAMAGE, THEN BREAKS.");
    // every other rune reads as before
    for (const r of RUNE_LIST.filter((q) => q.id !== "ward_stone")) expect(runeLine(r), r.id).not.toContain("SHIELD");
  });
});

describe("SUS-B a tap on each new label (the panel's own words, as keywords.ts finds them)", () => {
  /** The words a cargo panel of `def` at `stars` names, and what a tap on each shows (keywords.ts panelWords). */
  function wordsOf(def: string, stars: number): Record<string, string> {
    const v = computeView(402, 690, 3, buildScale), L = buildLayout(v.W, v.H, v.portrait, 5, true);
    const run: Run = newRun("furnace", 5, "susb");
    run.inventory = [{ uid: 900, def, ...(stars > 1 ? { stars } : {}) }];
    const sel: Sel = { kind: "cargo", uid: 900 };
    const ctx = { game: { ui: new UI(), t: 0, view: v }, run, touch: true, L } as unknown as Ctx;
    const plan = (r: Rect) => detailsPlan(ctx, sel, null, r);
    const area = panelArea(L, sel, { touch: true, hover: false, busy: false }, (r) => { const d = plan(r); return d ? fullText(d.plan) : null; });
    const d = plan(area)!;
    return Object.fromEntries(panelWords(d.t.body, panelPiece(run, d.show)).map((w) => [w.word, w.text]));
  }

  it("SHIELD on WARD BELL, HEAL on RIVETER and MEND PRESS, REGEN on MENDING LOOM: each shows its LABEL: EFFECT text", () => {
    withSustain(() => {
      const wb = wordsOf("wardbell", 1), rv = wordsOf("riveter", 2), mp = wordsOf("mendpress", 1), ml = wordsOf("mendingloom", 3);
      expect(wb.SHIELD).toBe(glossaryText("SHIELD", { def: "wardbell", stars: 1 }));
      // NUM-4 (REVIEW-SUSB F1): REMINDER.SHIELD blocks one hit's DAMAGE (was /^EACH SHIELD: STOPS ONE WHOLE HIT\./)
      expect(stripIcons(icons(wb.SHIELD))).toMatch(/^EACH SHIELD: BLOCKS ONE HIT'S DAMAGE\./);
      expect(wb.EVERY).toBe(glossaryEntry("EVERY")!.def);
      expect(stripIcons(icons(rv.HEAL))).toMatch(/^HEAL: GIVES BACK ♥, NEVER PAST FULL\./);
      expect(rv.HIT).toBe(glossaryEntry("HIT")!.def);
      expect(mp.HEAL).toBe(rv.HEAL);
      // WORDS-1 (REQ-BFG-081; READ-1 6.2): MENDING LOOM's face says HEAL now (REGEN merged into HEAL), so its tap shows HEAL's
      // (was /^REGEN: GIVES BACK THIS MUCH ♥ EACH SEC\./ and the key REGEN)
      expect(ml.HEAL).toBe(rv.HEAL);
      // no tap note on these faces (MEND PRESS keeps ARMOR PRESS's: the belt rule is in its kept text, cap's answer 5)
      expect(Object.keys(ml)).toEqual(["HEAL"]);
    });
  });
});

describe("SUS-B the coverage checks under withSustain (the day RUNES-2b flips the switch)", () => {
  it("every buyable piece has a face or kept text, ability text and a card; the three new ones among them", () => {
    withSustain(() => {
      const mods = buyableModules().filter((d) => fusible(d.id));
      for (const id of SUSTAIN_IDS) expect(mods.some((d) => d.id === id), id).toBe(true);
      for (const d of mods) {
        expect(hasAbilityText(d.id), d.id).toBe(true);
        expect(cardText(d.id).length, d.id).toBeGreaterThan(0);
        for (const s of STARS) expect(abilityText(d.id, s).sentences.length, `${d.id} ★${s}`).toBeGreaterThan(0);
      }
    });
  });

  it("every face (the new ones too): its numbers through the formatters, keywords in panel style, NEXT★ one line", () => {
    withSustain(() => {
      for (const d of buyableModules().filter((x) => hasFace(x.id) && fusible(x.id))) for (const s of STARS) {
        const o = d.kind === "core" ? { k: 1 } : {};
        const { value: fl, records } = captureFormats(() => faceLines(d.id, s, o));
        const printed = records.map((r) => r.printed);
        for (const line of [fl!.stats ?? "", ...fl!.rules.map((r) => r.text), ...fl!.reminders, fl!.clause?.text ?? "", ...(fl!.caveats ?? [])]) {
          for (const n of numbersIn(line)) {
            expect(printed, `${d.id} ★${s}: ${n}`).toContain(n);
            printed.splice(printed.indexOf(n), 1);
          }
        }
        // faceText's rule: a keyword in panel style, never a bare word; a perk's name (its clause label) is no keyword
        const said = [fl!.stats ?? "", ...fl!.rules.map((r) => r.text), ...fl!.reminders, fl!.clause ? fl!.clause.text.slice(fl!.clause.label!.length + 1) : "", ...(fl!.caveats ?? [])];
        for (const line of said) for (const k of KEYWORDS) for (const m of line.matchAll(new RegExp(k, "g"))) expect(line[m.index! - 1], `${d.id}: ${k}`).toBe(ICON[k]);
        const nx = faceNext(d.id, s, o);
        if (nx) expect(textWidth(`${nx.text}${nx.perk ? ` ★${s + 1} ${nx.perk}` : ""}`, "5"), `${d.id} ★${s}`).toBeLessThanOrEqual(NEXT_LINE_W);
      }
    });
  });

  it("the glossary: every keyword a face names has its row, and every tap text a face shows fits 2 lines of 5x7 at 225 px", () => {
    withSustain(() => {
      let n = 0;
      for (const d of buyableModules().filter((x) => hasFace(x.id))) for (const s of fusible(d.id) ? STARS : [1]) {
        const o = d.kind === "core" ? { k: 1 } : {};
        for (const k of KEYWORDS) {
          if (!faceAt(d.id, s, o)!.reminders.some((r) => r.includes(`{*${k}}`))) continue;
          expect(keywordRow(k), k).toBeDefined();
          const text = glossaryText(k, { def: d.id, stars: s, o })!;
          const lines = wrapRich(colourize(icons(text), C.bone), GLOSSARY_WRAP_W, "5");
          expect(lines.length, `${d.id} ★${s} ${k}: ${stripIcons(icons(text))}`).toBeLessThanOrEqual(2);
          for (const l of lines) expect(textWidth(lineText(l), "5")).toBeLessThanOrEqual(GLOSSARY_WRAP_W);
          n++;
        }
      }
      expect(n).toBeGreaterThanOrEqual(50); // measured: 50 keyword taps over the faced pieces at their stars (12 of them sustain's)
    });
  });
});
