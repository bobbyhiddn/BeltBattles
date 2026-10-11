// CARD-3 (REQ-BFG-107, REQ-BFG-081, REQ-BFG-080, REQ-BFG-087, REQ-BFG-089, REQ-BFG-004): the job's tests.
// (r) SHIELD and WARD: the soak layer (internal PLATE: races/bastion.ts absorb) reads SHIELD, the one-hit block (internal
// SHIELD: Battle.shieldHit) reads WARD, and the word PLATE leaves the game's text. Icons and colours stay with their
// mechanics; names keep their words; sim strings go through gameWords; the two renamed words take new first-sight ids;
// a returning player sees one notice, once.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { AMMO, HEROES, ITEMS, buyableModules, type HeroId } from "../src/sim/content";
import { fusible } from "../src/sim/stars";
import { RUNE_LIST, SUSTAIN_RUNE_LIST } from "../src/sim/runes";
import { RIVALS, RIVAL_IDS } from "../src/sim/rivals";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { EVENTS } from "../src/game/eventDefs";
import { newRun } from "../src/game/run";
import { C } from "../src/render/palette";
import { ICON, ICON_COLOUR, ICON_WORD, KEYWORDS, PLAYER_WORD, glyphRows, icons, keywordColour, keywordOfWord } from "../src/render/font";
import { PLATE_COLOUR, SHIELD_COLOUR } from "../src/game/arenaReact";
import { REMINDER, faceAt, hasFace, heroPlaystyle } from "../src/ui/faces";
import { abilityText, cardText, gist, hasAbilityText, heroTrick, nextStarText } from "../src/ui/abilityText";
import { flavour } from "../src/screens/build/flavour";
import { GLOSSARY, RUNE_NOTE, RUNE_REMINDER, glossaryEntry, glossaryText, keywordRow } from "../src/ui/glossary";
import { GAME_WORDS, NAMES_KEPT, gameWords } from "../src/ui/gameWords";
import { KEYWORD_WORD, runeLine, runeKeywords, runeReminder } from "../src/ui/runeText";
import { FAMILY, FAMILY_ORDER, familiesText, familyNote, familyWord } from "../src/ui/families";
import { captainSpans } from "../src/ui/captainText";
import { resultRows } from "../src/screens/battleHud";
import { choiceLabel } from "../src/screens/event/cards";
import { CARD_EFFECT_LINES, cardEffectLines, cardEffectWidth } from "../src/screens/build/shop";
import { lineText, lineWidth } from "../src/ui/richText";
import { wideCardW } from "../src/screens/build/layout";
import { FIRST_SIGHT_IDS, FIRST_SIGHT_WORDS, NOTICE_IDS, RENAME_NOTICE, TIPS_KEY, completeNotice, completeTip, kwSight, noticeDone, renameNoticeDue, setTipsForTests, sightDone } from "../src/ui/tips";
import { sightWord } from "../src/ui/firstSight";

/** The words that must not stand in a player text outside a name (REQ-BFG-107). */
const OLD = /\b(PLATE|PLATES|PLATED|PLATING)\b/;
/** `s` with every kept name blanked (a name keeps its words: NAMES_KEPT) and the markup tokens taken out (internal). */
const unnamed = (s: string): string => NAMES_KEPT.reduce((t, n) => t.split(n).join(" "), s).replace(/\{\*?[A-Z]+\}/g, " ");
const plain = (s: string): string => [...icons(s)].map((ch) => ICON_WORD[ch] ? " " : ch).join("");

/** Every player text a sweep reaches: faces, sentences, gists, desk lines, flavour, NEXT★, runes, glossary, families,
 *  captains, heroes, the result card's rows, the road's choices, the notice. [where, text] pairs, drawn (icons()). */
function playerTexts(): [string, string][] {
  const out: [string, string][] = [];
  const push = (where: string, s: unknown) => { if (typeof s === "string" && s) out.push([where, plain(s)]); };
  for (const d of [...buyableModules(), ...Object.values(ITEMS).filter((x) => x.kind === "supply")]) {
    for (const s of fusible(d.id) ? [1, 2, 3] : [1]) {
      const o = d.kind === "core" ? { k: 1 } : {};
      if (hasFace(d.id)) {
        const f = faceAt(d.id, s, o)!;
        for (const t of [...f.rules.map((r) => r.text), ...f.reminders, f.clause?.text ?? "", ...(f.caveats ?? [])]) push(`${d.id} ★${s} face`, t);
      }
      if (hasAbilityText(d.id)) {
        for (const t of abilityText(d.id, s, o).sentences) push(`${d.id} ★${s} sentence`, t);
        push(`${d.id} ★${s} gist`, gist(d.id, s, o));
      }
      push(`${d.id} card`, cardText(d.id, o));
      push(`${d.id} ★${s} next`, nextStarText(d.id, s, o));
      for (const t of flavour(d.id, s)) push(`${d.id} ★${s} flavour`, t);
      push(`${d.id} families`, familiesText(d.id));
    }
  }
  for (const r of [...RUNE_LIST, ...SUSTAIN_RUNE_LIST]) {
    push(`${r.id} line`, runeLine(r));
    push(`${r.id} reminder`, runeReminder(r));
    for (const k of runeKeywords(r)) push(`${r.id} ${k}`, glossaryEntry(KEYWORD_WORD[k])?.def);
  }
  for (const row of GLOSSARY) push(`glossary ${row.word}`, row.def);
  for (const k of KEYWORDS) push(`glossary text ${k}`, glossaryText(PLAYER_WORD[k]));
  for (const t of FAMILY_ORDER) push(`family ${t}`, familyNote(t));
  for (const id of RIVAL_IDS) for (const line of [RIVALS[id].trick, RIVALS[id].blurb]) push(`captain ${id}`, captainSpans(line, "#000000").map((s) => s.t).join(""));
  for (const h of PLAYABLE_HEROES) { push(`hero ${h} trick`, heroTrick(h as HeroId)); push(`hero ${h} playstyle`, heroPlaystyle(h as HeroId)); }
  for (const [l] of resultRows({ player: stats(), enemy: stats(), race: { plated: [1, 2], spent: [1, 2] } } as never)) push("result row", l);
  const run = newRun("furnace", 5, "card3");
  for (const e of Object.values(EVENTS)) {
    let cs: { label: string }[] = [];
    try { cs = (e.choices as (r: unknown, ev: unknown) => { label: string }[])(run, { id: e.id, pick: 0, picks: [], seed: 1 }); } catch { cs = []; }
    for (const c of cs) push(`event ${e.id}`, choiceLabel(c.label));
  }
  expect(choiceLabel("PLATING")).toBe("HULL PATCH"); // the FIELD DOCK's +200 HULL (eventDefs.ts dock), not SHIELD
  push("notice", RENAME_NOTICE.replace("PLATE IS NOW CALLED SHIELD", "")); // the notice names the old word once, on purpose
  return out;
}
const stats = () => ({ damage: 1, shots: 1, burnDealt: 0, payloadSum: 0, hitsTaken: 0, windTaken: 0, stuns: 0, misses: 0, jams: 0, heals: 0 });

/** A localStorage for the store tests (as tests/card2.test.ts's Mem). */
class Mem {
  private m = new Map<string, string>();
  getItem(k: string): string | null { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string): void { this.m.set(k, String(v)); }
  removeItem(k: string): void { this.m.delete(k); }
}
const g = globalThis as unknown as { localStorage?: unknown };
beforeEach(() => { g.localStorage = new Mem(); setTipsForTests("reload"); });
afterEach(() => { delete g.localStorage; setTipsForTests("reload"); });

describe("CARD-3 (r): SHIELD and WARD (REQ-BFG-107)", () => {
  it("the player's words: SHIELD on the soak layer's icon and colour, WARD on the block's; every other keyword its name", () => {
    expect(PLAYER_WORD).toEqual({ BURN: "BURN", STUN: "STUN", HEAT: "HEAT", FRAY: "FRAY", PLATE: "SHIELD", PAIR: "PAIR", SHIELD: "WARD", HEAL: "HEAL", REGEN: "REGEN" });
    expect([icons("{*PLATE}"), icons("{*SHIELD}"), icons("{PLATE}"), icons("{SHIELD}")]).toEqual([`${ICON.PLATE}SHIELD`, `${ICON.SHIELD}WARD`, ICON.PLATE, ICON.SHIELD]);
    expect([keywordOfWord("SHIELD"), keywordOfWord("WARD"), keywordOfWord("PLATE")]).toEqual(["PLATE", "SHIELD", undefined]);
    // the colours stay with their mechanics (ICON_COLOUR unchanged): SHIELD plate3, WARD rune3; the HUD's and pops' too
    expect([keywordColour(`${ICON.PLATE}SHIELD`), keywordColour(`${ICON.SHIELD}WARD`), keywordColour(`${ICON.SHIELD}WARDS`)]).toEqual([C.plate3, C.rune3, C.rune3]);
    expect([keywordColour(`${ICON.PLATE}PLATE`), keywordColour(`${ICON.SHIELD}SHIELD`), keywordColour("SHIELD")]).toEqual([undefined, undefined, undefined]);
    expect([ICON_COLOUR[ICON.PLATE], ICON_COLOUR[ICON.SHIELD], PLATE_COLOUR, SHIELD_COLOUR]).toEqual([C.plate3, C.rune3, C.plate3, C.rune3]);
    expect([glossaryEntry("SHIELD")!.colour, glossaryEntry("WARD")!.colour]).toEqual([C.plate3, C.rune3]);
    expect(familyWord("PLATE")).toBe("SHIELD");
  });

  it("both mechanics' glyph pixels are unchanged (card3-base's bitmaps, font.ts F5 and F3)", () => {
    expect(glyphRows(ICON.PLATE, "5")).toEqual("#####|##.##|#...#|#...#|.#.#.|.#.#.|..#..".split("|"));
    expect(glyphRows(ICON.SHIELD, "5")).toEqual("..#..|.#.#.|#...#|#.#.#|#...#|.#.#.|..#..".split("|"));
    expect(glyphRows(ICON.PLATE, "3")).toEqual("###|###|#.#|.#.|.#.".split("|"));
    expect(glyphRows(ICON.SHIELD, "3")).toEqual("...|.#.|#.#|#.#|.#.".split("|"));
  });

  it("gameWords: one pass (the old PLATE never becomes WARD), names and markup tokens untouched", () => {
    expect(gameWords("PLATE PLATES PLATED PLATING SHIELD SHIELDS")).toBe("SHIELD SHIELDS SHIELDED SHIELD WARD WARDS");
    expect(gameWords("+{N} {*PLATE}. {*SHIELD} {PLATE} {SHIELD}")).toBe("+{N} {*PLATE}. {*SHIELD} {PLATE} {SHIELD}");
    for (const n of NAMES_KEPT) expect(gameWords(`A ${n} ROLLS PLATING.`), n).toBe(`A ${n} ROLLS SHIELD.`);
    expect(gameWords("THREADS PLATE HER. PLATED, HER GUNS SPIN.")).toBe("THREADS SHIELD HER. SHIELDED, HER GUNS SPIN.");
    expect(Object.keys(GAME_WORDS).sort()).toEqual(["PLATE", "PLATED", "PLATES", "PLATING", "SHIELD", "SHIELDS"]);
  });

  it("every catalogue name holding PLATE, SHIELD or WARD is kept (NAMES_KEPT), and gameWords never re-words one", () => {
    const names = [...Object.values(ITEMS).map((d) => d.name), ...[...RUNE_LIST, ...SUSTAIN_RUNE_LIST].map((r) => r.name)];
    const holding = [...new Set(names.filter((n) => /\b(PLATE|PLATES|SHIELD|SHIELDS|WARD|WARDS)\b|WARD/.test(n)))].sort();
    expect(holding.filter((n) => !NAMES_KEPT.includes(n))).toEqual([]);
    for (const n of holding) expect(gameWords(n), n).toBe(n);
    // the sim's own strings a screen draws, through gameWords: no old word outside a name
    const sim = [
      ...Object.values(ITEMS).map((d) => d.desc.join(" ")), ...[...RUNE_LIST, ...SUSTAIN_RUNE_LIST].map((r) => r.text),
      ...RIVAL_IDS.flatMap((id) => [RIVALS[id].trick, RIVALS[id].blurb]), ...Object.values(HEROES).map((h) => h.pattern ?? ""),
    ];
    for (const s of sim) expect(OLD.test(unnamed(gameWords(s))), s).toBe(false);
  });

  it("no player text a sweep reaches uses PLATE, PLATES, PLATED or PLATING outside a kept name", () => {
    const texts = playerTexts(), bad = texts.filter(([, t]) => OLD.test(unnamed(t)));
    expect(bad.map(([w, t]) => `${w}: ${t}`)).toEqual([]);
    expect(texts.length).toBeGreaterThan(1500);
    console.log(`CARD3 (r) sweep: ${texts.length} player texts, 0 with PLATE outside a name (${NAMES_KEPT.length} names kept)`);
  });

  it("the definitions (sim-checked: races/bastion.ts absorb, PLATE_CAP 240; Battle.shieldHit, SHIELD_CAP 3; impact's order)", () => {
    expect(REMINDER.PLATE()).toBe("{*PLATE}: SOAKS HULL DAMAGE POINT FOR POINT. MAX 240 {PLATE}.");
    expect(REMINDER.SHIELD()).toBe("{*SHIELD}: BLOCKS ALL OF ONE HIT'S DAMAGE, THEN BREAKS. MAX 3 {SHIELD}.");
    expect([keywordRow("PLATE").word, keywordRow("PLATE").extra, keywordRow("SHIELD").word, keywordRow("SHIELD").extra]).toEqual(["SHIELD", "A {*SHIELD} GOES FIRST.", "WARD", "{*BURN} GOES PAST IT."]);
    expect([RUNE_REMINDER.PLATE, RUNE_REMINDER.SHIELD, RUNE_NOTE.shatter_shot]).toEqual([
      "SHIELD: SOAKS DAMAGE POINT FOR POINT BEFORE YOUR HULL.", "WARD: BLOCKS ALL OF ONE HIT'S DAMAGE, THEN BREAKS.", "WARD: IT BREAKS; THE HIT STILL LANDS.",
    ]);
    expect(glossaryEntry("DARK WIND")!.def).toContain("PAST {*PLATE}.");
    for (const t of [REMINDER.SHIELD(), RUNE_REMINDER.SHIELD, keywordRow("SHIELD").def]) expect(t, t).not.toContain("WHOLE HIT"); // REVIEW-SUSB F1
    // the source order the notes say (A WARD GOES FIRST): IRON HIDE's cut, then a WARD stops the hit, then the soak
    const b = readFileSync("src/sim/battle.ts", "utf8"), at = b.indexOf("private impact(pr: Projectile)");
    const body = b.slice(at, at + 4000);
    expect(body.indexOf("this.runeHit(") < body.indexOf("this.shieldHit(def)") && body.indexOf("this.shieldHit(def)") < body.indexOf("absorb(def.plate, total)")).toBe(true);
    expect(AMMO.bulwark).toBeDefined();
  });

  it("aliases: SHIELD takes SHIELDS and SHIELDED, WARD takes WARDS; PLATE, PLATES, PLATED and PLATING name no row", () => {
    expect([...glossaryEntry("SHIELD")!.aliases, ...glossaryEntry("WARD")!.aliases]).toEqual(["SHIELDS", "SHIELDED", "WARDS"]);
    for (const w of ["PLATE", "PLATES", "PLATED", "PLATING"]) expect(glossaryEntry(w), w).toBeUndefined();
    expect([glossaryEntry("SHIELDED")!.kw, glossaryEntry("WARDS")!.kw]).toEqual(["PLATE", "SHIELD"]);
    expect(FAMILY.PLATE.word).toBe("SHIELD");
  });

  it("first-sight ids no earlier build used: kw:SHIELD.107 and kw:WARD; an old store's kw:SHIELD and kw:PLATE count for neither", () => {
    expect([kwSight("SHIELD"), kwSight("WARD"), kwSight("PAIR")]).toEqual(["kw:SHIELD.107", "kw:WARD", "kw:PAIR"]);
    expect(FIRST_SIGHT_IDS).toContain("kw:SHIELD.107");
    expect(FIRST_SIGHT_IDS).toContain("kw:WARD");
    expect(FIRST_SIGHT_IDS.filter((id) => id === "kw:PLATE" || id === "kw:SHIELD")).toEqual([]);
    expect(FIRST_SIGHT_WORDS.slice(0, 4)).toEqual(["PAIR", "FRAY", "SHIELD", "WARD"]);
    // a store written by CARD-2's K1 (both old words seen) and a done tip: both new meanings still show once
    localStorage.setItem(TIPS_KEY, JSON.stringify(["place", "kw:PLATE", "kw:SHIELD", "kw:PAIR"]));
    setTipsForTests("reload");
    expect([sightDone("kw:SHIELD.107"), sightDone("kw:WARD"), sightDone("kw:PAIR")]).toEqual([false, false, true]);
    expect([sightWord(["PAIR", "SHIELD"]), sightWord(["SHIELDS"]), sightWord(["WARD"])]).toEqual(["SHIELD", "SHIELDS", "WARD"]);
  });

  it("the returning player's notice: once, only after earlier play (a how-to tip done, or a finished run), kept in E5's store", () => {
    expect(RENAME_NOTICE).toBe("PLATE IS NOW CALLED SHIELD. THE OLD SHIELD IS NOW WARD.");
    expect(NOTICE_IDS).toEqual(["rename107"]);
    setTipsForTests("new");
    expect([renameNoticeDue(0), renameNoticeDue(1)]).toEqual([false, true]); // a new player never; a finished run counts
    completeTip("place");
    expect(renameNoticeDue(0)).toBe(true);
    completeNotice("rename107");
    expect([renameNoticeDue(0), noticeDone("rename107")]).toEqual([false, true]);
    expect(JSON.parse(localStorage.getItem(TIPS_KEY)!)).toContain("rename107");
    setTipsForTests("reload");
    expect(renameNoticeDue(3)).toBe(false); // stored: never again
    setTipsForTests("done");
    expect(renameNoticeDue(3)).toBe(false); // "done" covers it, so every capture with tips done is as before
    setTipsForTests("sight");
    expect(renameNoticeDue(3)).toBe(false);
    // where it shows: the build screen's caravan dawn with no toast of its own, as a toast (no press on it does anything)
    const src = readFileSync("src/screens/build/build.ts", "utf8"), enter = src.slice(src.indexOf("  enter(): void {"), src.indexOf("  select(s: Sel): void {"));
    expect(enter).toMatch(/if \(refund \|\| scout\) this\.game\.toast\([^\n]+\n(?:\s*\/\/[^\n]*\n)*\s*else if \(renameNoticeDue\(finishedRuns\(\)\)\) \{\n\s*this\.game\.toast\(RENAME_NOTICE, C\.yellow, undefined, 6\);\n\s*completeNotice\("rename107"\);/);
    expect(src.match(/renameNoticeDue|completeNotice/g)!.length).toBe(4); // the import's two, enter()'s two
  });
});

describe("CARD-3 (d3): the wide desk shop card's one-line effects say their faces' meaning (REQ-BFG-081)", () => {
  it("the five lines CARD-2's K3 fixed on the faces, each in at most two lines of the wide card at every landscape width", () => {
    const want: Record<string, string> = {
      assembly: "FEEDS A GUN: RIGS WORK 50% SOONER.", gatling: "FIRES AS LOADS COME, SPINS UP.", pincer: "DAMAGE FOR OTHER RIGS HITTING IT.",
      limpet: "BLASTS THE FOE'S HULL FOR 100.", spotter: "SHOTS AIMED AT NO PART AIM AGAIN.",
    };
    const out: string[] = [];
    for (const [id, line] of Object.entries(want)) {
      expect(cardText(id), id).toBe(line);
      let most = 0;
      for (let W = 430; W <= 480; W++) {
        const w = wideCardW(W, 5), ls = cardEffectLines(line, w);
        expect(ls.length, `${id} at ${w}`).toBeLessThanOrEqual(CARD_EFFECT_LINES);
        for (const l of ls) { expect(lineWidth(l, "3"), `${id} at ${w}: ${lineText(l)}`).toBeLessThanOrEqual(cardEffectWidth(w)); most = Math.max(most, ls.length); }
      }
      out.push(`${id} "${line}" ${most} line(s)`);
    }
    console.log(`CARD3 (d3): ${out.join("; ")}`);
  });
});
