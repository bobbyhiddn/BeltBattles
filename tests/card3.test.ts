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

// ------------------------------------------------------------------ (d1, d2): the definition box and the word tooltip
import { installRaster, fresh, G as gOf } from "./raster.helpers";
import { UI, type Rect } from "../src/ui/ui";
import { TAP_CSS } from "../src/ui/tap";
import { buildLayout, buildScale, panelArea, phoneBarLift, phoneScreen, type Sel } from "../src/screens/build/layout";
import { runeRowFits, runeRowH, shiftLayout, runeHintBand } from "../src/ui/runeBar";
import { detailsPlan, drawDetails, panelFit } from "../src/screens/build/inspector";
import { defBoxClear, definitionBox, drawWordTip, keywordState, keywordsIdle } from "../src/screens/build/keywords";
import { RunePicker } from "../src/screens/runePicker";
import type { Ctx } from "../src/screens/build/actions";
import type { DuskFoe, Run } from "../src/game/run";

installRaster();
const gcd3 = (a: number, b: number): number => (b ? gcd3(b, a % b) : a);
/** The build screen as the game frames it (tests/card2.test.ts's framed). */
function framed(w: number, h: number, dpr: number, runes = 1, offers = 5) {
  const pw = Math.floor(w * dpr), ph = Math.floor(h * dpr), portrait = ph > pw * 1.05;
  const fake = { run: { build: { runes: Array.from({ length: runes }, () => ({ id: "many_hands" })) } }, refit: false, offers: () => Array.from({ length: offers }) } as unknown as Parameters<typeof runeRowFits>[0];
  let S = buildScale(pw, ph, portrait, dpr);
  while (S > 1 && !runeRowFits(fake, pw, ph, portrait, S, dpr)) S--;
  const isPh = phoneScreen(pw, ph, dpr), phone = portrait && isPh, tap = isPh ? Math.ceil(TAP_CSS / (S / dpr)) : 0;
  const v = { scale: S, dpr }, W = Math.floor(pw / S), H = Math.floor(ph / S);
  const lay = (unit: number) => {
    const row = runeRowH(v, runes), lift = phone ? phoneBarLift(W, H, offers, tap, runeRowH(v, 1)) : 0;
    return shiftLayout(buildLayout(W, H - row, portrait, offers, phone, tap, lift, { scale: S, unit }), row, H);
  };
  const Z = lay(1).cam.z, unit = gcd3(S, Z), sub = S / unit;
  return { S, W, H, L: lay(unit), tap, phone, portrait, view: { W, H, scale: S, dpr, portrait, sub } };
}
/** A build screen's panel context (tests/card2.test.ts's panelCtx). */
function panelCtx(run: Run, sel: Sel, f: ReturnType<typeof framed>, touch: boolean) {
  const ctx = { game: { ui: new UI(), t: 0, view: f.view, W: f.W, H: f.H }, run, touch, L: f.L } as unknown as Ctx;
  const area = panelArea(f.L, sel, { touch, hover: false, busy: false }, panelFit(ctx, sel, !!f.L.phone));
  const draw = () => {
    const ui = (ctx.game as unknown as { ui: UI }).ui;
    ui.pointer.kind = touch ? "touch" : "mouse";
    Object.assign(ui.pointer, { x: -1, y: -1, down: false });
    ui.begin();
    drawDetails(gOf(fresh(f.W, f.H)), ctx, sel, null, area, {} as DuskFoe);
    ui.end();
    return ui;
  };
  return { ctx, area, draw, d: () => detailsPlan(ctx, sel, null, area)! };
}
const CARGO3: Sel = { kind: "cargo", uid: 900 };
const ov = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("CARD-3 (d1, d2): a definition never covers its own word; a word's tooltip never covers TAP AGAIN (REQ-BFG-087)", () => {
  it("defBoxClear: the foot box moves just above the word's line where it would cover the word, else it stays", () => {
    const r = { x: 0, y: 100, w: 235, h: 57 }, box = definitionBox(r, r.y + 55, 2); // 21 px at the foot
    const low = { glyph: { x: 30, y: 145, w: 20, h: 7 } }, high = { glyph: { x: 30, y: 112, w: 20, h: 7 } };
    expect(defBoxClear(box, r, [high])).toEqual(box);
    expect(defBoxClear(box, r, [low])).toEqual({ ...box, y: 145 - 2 - box.h });
    expect(defBoxClear(box, { ...r, y: 140 }, [{ glyph: { x: 0, y: 150, w: 5, h: 7 } }])).toEqual(box); // no room above: as before
  });

  it("every phone panel (402x690 @3, a rune, tips done): a word's definition, opened as a tap opens it, leaves that word showing", () => {
    setTipsForTests("done");
    const f = framed(402, 690, 3, 1);
    let panels = 0, words = 0, moved = 0;
    const out: string[] = [];
    for (const d of [...buyableModules(), ...Object.values(ITEMS).filter((x) => x.kind === "supply")]) for (const s of fusible(d.id) ? [1, 2, 3] : [1]) {
      const run = newRun("furnace", 5, `card3-${d.id}`);
      let sel: Sel = CARGO3;
      if (d.kind === "supply") {
        run.shop.wagons = [{ merchant: d.merchant ?? "ironmonger", offers: [{ def: d.id, price: d.price, sold: false }] }] as Run["shop"]["wagons"];
        sel = { kind: "offer", wagon: 0, slot: 0 };
      } else run.inventory = [{ uid: 900, def: d.id, ...(s > 1 ? { stars: s } : {}) }];
      const p = panelCtx(run, sel, f, true);
      const ui0 = p.draw(), regs = ui0.regions.filter((q) => /^kw:\d+:/.test(q.id));
      const ws = [...new Set(regs.map((q) => q.id.split(":")[2]))].filter((w) => glossaryEntry(w) || w.endsWith(" FAMILY") === false);
      panels++;
      for (const w of ws) {
        const st = keywordState(p.ctx)! as { word: string | null }; // the panel's tap state (a tap sets its word)
        st.word = glossaryEntry(w)?.word ?? w;
        const ui = p.draw(), def = ui.regions.find((q) => q.id === "kwdef");
        if (!def) { st.word = null; continue; }
        words++;
        const foot = definitionBox(p.d().plan.r, p.d().plan.maxY + 2, 1);
        if (def.r.y + def.r.h < foot.y + foot.h - 1) moved++;
        // the word's own targets are still targets (a target under the box is not: drawKeywordLayer)
        const mine = ui.regions.filter((q) => /^kw:\d+:/.test(q.id) && (glossaryEntry(q.id.split(":")[2])?.word ?? q.id.split(":")[2]) === st.word);
        expect(mine.length, `${d.id} ★${s} ${w}: its own word under its box`).toBeGreaterThan(0);
        if (def.r.y + def.r.h < foot.y + foot.h - 1 && out.length < 12) out.push(`${d.id} ★${s} ${w}`);
        st.word = null;
      }
      keywordsIdle(p.ctx);
    }
    console.log(`CARD3 (d1): ${panels} phone panels, ${words} definitions opened, ${moved} moved above their word (e.g. ${out.join(", ")})`);
    expect(moved).toBeGreaterThan(0);
  });

  it("drawWordTip keeps clear of `avoid` (above the word where below would cover it), as before without it", () => {
    const c = fresh(300, 200), r = { x: 4, y: 40, w: 233, h: 100 }, glyph = { x: 30, y: 95, w: 20, h: 7 };
    const band = runeHintBand(r);
    const below = drawWordTip(gOf(c), "PAIR: TWO LOADS REACH ONE TURRET FROM TWO BELTS AT ONCE.", C.blue, glyph, r);
    const clear = drawWordTip(gOf(c), "PAIR: TWO LOADS REACH ONE TURRET FROM TWO BELTS AT ONCE.", C.blue, glyph, r, undefined, band);
    expect(below.y).toBe(glyph.y + glyph.h + 4);
    expect(ov(below, band)).toBe(true);
    expect([ov(clear, band), clear.y + clear.h + 2 <= glyph.y]).toEqual([false, true]);
  });

  it("the desk's dawn picker: a hovered word's tooltip leaves every pixel of TAP AGAIN TO TAKE IT showing", () => {
    setTipsForTests("done");
    const f = framed(1920, 1080, 1, 0), ui = new UI();
    const s = { run: newRun("foundry", 5, "card3-pick"), refit: false, touch: false, L: f.L,
      game: { W: f.W, H: f.H, ui, view: f.view, canvas: null, error: () => {}, resize: () => {}, toast: () => {} }, touched: () => {} };
    const picker = new RunePicker();
    picker.offer = () => ({ day: 1, tier: "common", ids: ["seam_rivets", "twin_salve", "hot_seam"] }) as never;
    const frame = (pointer?: { x: number; y: number }) => {
      ui.pointer.kind = "mouse";
      Object.assign(ui.pointer, pointer ? { ...pointer, down: false } : { x: -1, y: -1, down: false });
      const c = fresh(f.W, f.H);
      ui.begin();
      picker.draw(gOf(c), s as never);
      ui.end();
      return c;
    };
    frame();
    ui.regions.find((q) => q.id === "runepick-0")!.onTap!();
    frame();
    const card = ui.regions.find((q) => q.id === "runepick-0")!.r, band = runeHintBand(card);
    const yellow = (c: ReturnType<typeof fresh>) => { let n = 0; for (let y = band.y; y < band.y + band.h; y++) for (let x = band.x; x < band.x + band.w; x++) if (c.at(x, y) === C.yellow) n++; return n; };
    const base = yellow(frame());
    expect(base).toBeGreaterThan(50);
    const words = ui.regions.filter((q) => q.id.startsWith("runepick-w"));
    expect(words.length).toBeGreaterThan(0);
    for (const w of words) expect(yellow(frame({ x: w.r.x + 2, y: w.r.y + 2 })), w.id).toBe(base);
  });
});

// --------------------------------------------------------------------------- (a): the phone shop card's gist
import { PHONE_GISTS, phoneGist, shopChip } from "../src/ui/chips";
import { CARD_CHIP_Y, CARD_GIST_Y, CARD_GIST_NAME_Y, CARD_MARK_X, cardPriceX, drawCard } from "../src/screens/build/shop";
import { CARD_H, CARD_W } from "../src/screens/build/layout";
import { textWidth } from "../src/render/font";

describe("CARD-3 (a): the phone shop card's gist for cores, gear and five rigs (REQ-BFG-081)", () => {
  const FIVE = ["tollbooth", "sorting", "mantlet", "braceframe", "overdrive"];
  it("every core and piece of gear shows a gist, and so do the five rigs; turrets, factories and the other rigs keep their chips", () => {
    const rows: string[] = [];
    for (const d of buyableModules()) {
      const o = d.kind === "core" ? { k: 1 } : {}, gst = phoneGist(d.id, o), chip = shopChip(d.id, o);
      const wants = d.kind === "core" || d.kind === "mod" || FIVE.includes(d.id);
      expect(!!gst, `${d.id} (${d.kind})`).toBe(wants);
      if (!gst) continue;
      const [a, b] = gst, aw = textWidth(icons(a), "3"), bw = textWidth(icons(b, "alone"), "3");
      const room = cardPriceX(0, CARD_W, d.price, false, true) - CARD_MARK_X - 1; // the chip's room, left of the coin
      expect(/\d/.test(a), `${d.id}: row A in words`).toBe(false);
      expect(aw, `${d.id} row A ${a}`).toBeLessThanOrEqual(CARD_W - 2 * CARD_MARK_X - 1);
      expect(bw, `${d.id} row B ${b} (room ${room})`).toBeLessThanOrEqual(room);
      rows.push(`${d.id} | ${d.kind} | ${plain(chip ?? "-")} | ${plain(a)} / ${plain(b)} | ${cardText(d.id, o)} | A ${aw} px of ${CARD_W - 2 * CARD_MARK_X - 1}, B ${bw} of ${room}`);
    }
    expect(Object.keys(PHONE_GISTS).length).toBe(rows.length);
    console.log(`CARD3 (a) gists, ${rows.length}:\n${rows.join("\n")}`);
  });

  it("the card keeps its 46x42 size, its price and its touch target; the gist's rows sit inside it, the art gives up its room", () => {
    expect([CARD_W, CARD_H]).toEqual([46, 42]);
    expect([CARD_GIST_NAME_Y, CARD_GIST_Y, CARD_CHIP_Y]).toEqual([13, 25, 32]); // name rows 13..23, row A 25..29, row B 32..36
    const st = { sold: false, affordable: true, selected: false, hover: false, pulse: false, hidden: false, shake: 0 };
    for (const id of ["lance", "mortar", "salvo", "steambreech", "overdrive"]) {
      const d = ITEMS[id], gst = phoneGist(id, d.kind === "core" ? { k: 1 } : {})!;
      const c = fresh(60, 60), r = { x: 5, y: 5, w: CARD_W, h: CARD_H };
      drawCard(gOf(c), r, d, d.price, d.merchant!, { ...st, gist: gst, chip: shopChip(id) ?? undefined }, 0);
      let outside = 0, rowA = 0, rowB = 0;
      for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) {
        const px = c.at(x, y);
        if (px === null) continue;
        if (x < r.x || x >= r.x + r.w || y < r.y || y >= r.y + r.h) outside++;
        if (y >= r.y + CARD_GIST_Y && y < r.y + CARD_GIST_Y + 5 && x > r.x + 2 && x < r.x + r.w - 3 && px !== C.slate0) rowA++;
        if (y >= r.y + CARD_CHIP_Y && y < r.y + CARD_CHIP_Y + 5 && x > r.x + 2 && x < cardPriceX(r.x, r.w, d.price, false, true) && px !== C.slate0) rowB++;
      }
      expect([outside, rowA > 0, rowB > 0], id).toEqual([0, true, true]);
    }
  });

  it("keyword words keep their colours in a gist (STEAM BREECH's SHIELD in plate3)", () => {
    const [a] = phoneGist("steambreech", { k: 1 })!;
    expect(icons(a)).toBe(`IF ${ICON.PLATE}SHIELD`);
    expect(keywordColour(`${ICON.PLATE}SHIELD`)).toBe(C.plate3);
  });
});

// --------------------------------------------------------------------------- (b, c): the phone band and the first-run band
import { key as K, rotField, setTurretList, turretSlots, type Placed } from "../src/sim/deck";
import { GAP_MIN } from "../src/ui/spacing";
import { IDLE_FIX, IDLE_SHORT, STOKER_IDLE, TOUCH_TURN, fullText, gapsAtLeast, hintStrip, itemPanel, visibleLines } from "../src/screens/build/inspector";

const SHORTB = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const rigAt = (uid: number, def: string, x: number, y: number, rot = 0, stars = 1): Placed => ({ uid, def, x, y, ...rotField(def, rot), ...(stars > 1 ? { stars } : {}) });
function furnaceRun(items: Placed[] = []): Run {
  const run = newRun("furnace", 5, "shoptap2-panels");
  run.build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, ...items], routes: [{ factory: 1, cells: [...SHORTB] }], mods: [], beltCap: 40, hullBonus: 0 };
  run.inventory = [];
  run.gold = 2;
  return run;
}
/** Every panel a finger can open: tests/explain1.test.ts's 899 (space1's, zoom1's), the same ids. */
function allPanels(): { id: string; run: Run; sel: Sel }[] {
  const out: ReturnType<typeof allPanels> = [];
  const OFFER: Sel = { kind: "offer", wagon: 0, slot: 0 };
  for (const d of buyableModules()) {
    const stars = fusible(d.id) ? [1, 2, 3] : [1];
    const o = furnaceRun();
    o.shop.wagons = [{ merchant: d.merchant ?? "ironmonger", offers: [{ def: d.id, price: d.price, sold: false }] }] as Run["shop"]["wagons"];
    out.push({ id: `offer ${d.id}`, run: o, sel: OFFER });
    for (const s of stars) {
      const c = furnaceRun();
      c.inventory = [{ uid: 900, def: d.id, ...(s > 1 ? { stars: s } : {}) }];
      out.push({ id: `cargo ${d.id} ★${s}`, run: c, sel: CARGO3 });
      if (d.kind === "gate") {
        for (const [x, y, rot] of [[3, 3, 1], [0, 9, 0], [5, 3, 0]] as const) out.push({ id: `${d.id} ★${s} @${x},${y}`, run: furnaceRun([rigAt(10, d.id, x, y, rot, s)]), sel: { kind: "item", uid: 10 } });
      } else if (d.kind === "factory") {
        out.push({ id: `${d.id} ★${s}`, run: furnaceRun([{ uid: 10, def: d.id, x: 0, y: 6, ...(s > 1 ? { stars: s } : {}) }]), sel: { kind: "item", uid: 10 } });
      } else if (d.kind === "mod" || d.kind === "core") {
        for (const hero of ["furnace", "weaver"] as const) {
          const run = newRun(hero, 5, "shoptap2-fit");
          run.build.mods = [{ uid: 950, def: d.id, turret: 0, ...(s > 1 ? { stars: s } : {}) }];
          out.push({ id: `${d.id} ★${s} fitted on ${hero}`, run, sel: { kind: "fitted", uid: 950 } });
        }
      } else if (d.kind === "turret") {
        const run = furnaceRun();
        setTurretList(run.build, [{ slot: 0, def: "scrapcannon", uid: 90 }, { slot: 1, def: d.id, uid: 700, ...(s > 1 ? { stars: s } : {}) }]);
        run.build.mods = [{ uid: 950, def: "pressure", turret: 1 }, { uid: 951, def: "hopper", turret: 1 }];
        out.push({ id: `turret ${d.id} ★${s} with a core and gear`, run, sel: { kind: "turret", index: 1 } });
      }
    }
  }
  for (const hero of PLAYABLE_HEROES) {
    const run = newRun(hero, 5, "shoptap2-start");
    for (const p of run.build.items) out.push({ id: `${hero}'s starting ${p.def}`, run, sel: { kind: "item", uid: p.uid } });
    if (turretSlots(run.build)[0]?.turret) out.push({ id: `${hero}'s starting turret`, run, sel: { kind: "turret", index: 0 } });
    run.build.routes.forEach((_, i) => out.push({ id: `${hero}'s belt ${i + 1}`, run, sel: { kind: "route", index: i } }));
  }
  out.push({ id: "the KILN's belt", run: furnaceRun(), sel: { kind: "route", index: 0 } });
  return out;
}

describe("CARD-3 (b, c): the phone band (REQ-BFG-080) and the first-run band (REQ-BFG-004)", () => {
  it("B's lever 1: an IDLE rig's face says its own state; the fix, true of every rig, is a NOTES line", () => {
    setTipsForTests("done");
    for (const [def, warn] of [["temper", { short: IDLE_SHORT, fix: IDLE_FIX }], ["stoker", STOKER_IDLE]] as const) {
      const run = furnaceRun([rigAt(10, def, 0, 9, 0, 1)]);
      const t = itemPanel(run, 10, true)!;
      expect(t.body.map((b) => b.text).slice(0, 2), def).toEqual([warn.short, warn.fix]);
      const f = framed(402, 690, 3, 1), p = panelCtx(run, { kind: "item", uid: 10 }, f, true);
      const d = p.d();
      expect(d.t.body.some((b) => b.text === warn.fix), `${def}: off the face`).toBe(false);
      expect(d.t.notes!.some((b) => b.text === warn.fix), `${def}: in NOTES`).toBe(true);
      expect(d.t.body[0].text, def).toBe(warn.short);
    }
  });

  it("the in-band counts on the four zoomed phones (tips done and new); 402x690 @3 with a rune: at least 720 of 899 with tips done; every in-band finger panel shows its full text with its gaps at least its face's Gmin; lever 3's panels in 3x5", () => {
    const all = allPanels(), rows: string[] = [];
    // SHAPES-1 x c099-card3 (RUN6 1.1): +39 = the shaped three's placed panels (zoom's +39 in 8dcf439): NAIL STRIP, EMBER
    // TROUGH and SPIKE RAIL join the buyable modules with SHAPES on, 13 panels each (an offer, and at each star a cargo panel
    // and 3 placed ones), as explain1, space1, zoom1 and zoom count them: 899 + 39 = 938, measured on the merged tree (the
    // 720 floor and the 5-point rule below keep their point; run 6's measured counts: REPORT-SHAPES1 "Run 6")
    expect(all.length).toBe(938);
    const counts: Record<string, number> = {};
    for (const mode of ["done", "new"] as const) {
      setTipsForTests(mode);
      for (const [w, h] of [[402, 690], [390, 844], [390, 660], [430, 739]] as const) for (const runes of [1, 0]) {
        const f = framed(w, h, 3, runes), L = f.L;
        let inBand = 0, small = 0;
        for (const c of all) {
          const ctx = { game: { ui: new UI(), t: 0, view: f.view, W: f.W, H: f.H }, run: c.run, touch: true, L } as unknown as Ctx;
          const area = panelArea(L, c.sel, { touch: true, hover: false, busy: false }, panelFit(ctx, c.sel, !!L.phone));
          if (area !== L.info) continue;
          inBand++;
          const p = detailsPlan(ctx, c.sel, null, area)!.plan;
          const tag = `${mode} ${w}x${h} runes ${runes} ${c.id}`;
          expect(fullText(p), tag).toBe(true);
          expect(["3", "5"].includes(p.body.font), tag).toBe(true); // never a face under 3x5
          expect(gapsAtLeast(p, GAP_MIN[p.body.font]), `${tag}: gaps ${p.gaps.px}`).toBe(true); // never a gap under Gmin
          // lever 3: in 3x5 where the 5x7 face fits the band only with its gaps under 5x7's Gmin
          const big = detailsPlan({ ...ctx, L: { ...L, phone: undefined } } as unknown as Ctx, c.sel, null, area)!.plan;
          if (p.body.font === "3" && big.body.font === "5") { small++; expect(gapsAtLeast(big, GAP_MIN["5"]), tag).toBe(false); }
        }
        counts[`${mode} ${w}x${h} ${runes}`] = inBand;
        rows.push(`CARD3 (b) tips ${mode}: ${w}x${h} @3 runes ${runes}: band ${L.info.h}, ${inBand} of ${all.length} in the band (${((100 * inBand) / all.length).toFixed(1)}%), ${small} of them in 3x5 by lever 3`);
      }
    }
    console.log(rows.join("\n"));
    expect(counts["done 402x690 1"]).toBeGreaterThanOrEqual(720);
    // C: with tips new, within 5 points of tips done on 402x690 @3 with a rune
    expect((100 * (counts["done 402x690 1"] - counts["new 402x690 1"])) / all.length).toBeLessThanOrEqual(5);
  }, 900_000);

  it("C: a new tip's hint no longer grows the panel: the panel is sized as with the tip done, the hint in a strip just above it, its words, its once-only rule and its store unchanged", () => {
    const f = framed(402, 690, 3, 1);
    const run = furnaceRun([rigAt(10, "temper", 3, 3, 1, 1)]), sel: Sel = { kind: "item", uid: 10 };
    setTipsForTests("done");
    const done = panelCtx(run, sel, f, true);
    expect(done.d().hint).toBe(null);
    setTipsForTests("new");
    const fresh1 = panelCtx(run, sel, f, true), d = fresh1.d();
    expect(d.hint).toBe(TOUCH_TURN); // its words
    expect(d.t.body.some((b) => b.role === "hint" && b.text === TOUCH_TURN)).toBe(true); // the face keeps it (NOTES, the store)
    expect(fresh1.area).toEqual(done.area); // sized as with the tip done
    expect(visibleLines(d.plan).some((v) => v.line !== "rule" && v.line.block.role === "hint")).toBe(false);
    const s = hintStrip(d.hint!, d.plan.r, f.H);
    expect([s.r.x, s.r.w, s.r.y + s.r.h]).toEqual([d.plan.r.x, d.plan.r.w, d.plan.r.y]); // just above the panel
    expect(s.lines.map(lineText).join(" ")).toBe(TOUCH_TURN);
    expect(s.lines.every((l) => lineWidth(l, "3") <= d.plan.r.w - 10)).toBe(true);
    // the strip takes no press: drawDetails registers nothing over it (a press there reaches what is under it)
    const ui = fresh1.draw();
    expect(ui.regions.filter((q) => ov(q.r, s.r)).map((q) => q.id)).toEqual([]);
    // its once-only rule (tips.ts): it shows while either of its tips (turn, move) is new; both done, the strip goes
    completeTip("turn");
    expect(panelCtx(run, sel, f, true).d().hint).toBe(TOUCH_TURN);
    completeTip("move");
    expect(panelCtx(run, sel, f, true).d().hint).toBe(null);
  });
});

// --------------------------------------------------------------------------- (d5, d6): LAST CHANCE's part and hull cards
import { LastChancePicker, cardH, lcGaps, partInfo, partLines } from "../src/screens/lastChancePicker";
import { GAP } from "../src/ui/spacing";

describe("CARD-3 (d5, d6): LAST CHANCE's part and hull cards take gaps between their items (REQ-BFG-087)", () => {
  const n = (its: readonly unknown[][]): number => its.reduce((k, it) => k + it.length, 0);
  it("a card's items (a stat row, each rule, each detail) are G apart, the pitch inside one; Gmin where G doesn't fit the screen", () => {
    expect([lcGaps(), lcGaps(true)]).toEqual([{ lines: GAP["5"], info: GAP["3"] }, { lines: GAP_MIN["5"], info: GAP_MIN["3"] }]);
    const run = newRun("foundry", 5, "card3-lc");
    let multi = 0;
    for (const d of buyableModules()) {
      const items = partLines(d.id, 290, run), info = partInfo(d.id, 290, run);
      if (items.length > 1) multi++;
      const was = 31 + n(items) * 9 + 1 + n(info) * 7 + 13 + 4; // card3-base's cardH: no gap
      const gi = Math.max(0, items.length - 1), gd = Math.max(0, info.length - 1);
      expect(cardH(items, info, true), d.id).toBe(was + gi * GAP["5"] + gd * GAP["3"]);
      expect(cardH(items, info, true, lcGaps(true)), d.id).toBe(was + gi * GAP_MIN["5"] + gd * GAP_MIN["3"]);
      expect(items.every((it) => it.length > 0) && info.every((it) => it.length > 0), d.id).toBe(true);
    }
    expect(multi).toBeGreaterThan(10);
  });

  it("on the operator's phone the three cards fit with G, every card's details open; on a screen too short for G they take Gmin", () => {
    const run = newRun("furnace", 5, "card3-lc");
    (run as unknown as { lastChance: { lives: number; day: number } }).lastChance = { lives: 1, day: 3 };
    const lc = new LastChancePicker();
    const f = framed(402, 690, 3, 0), s = { run, refit: false, game: { W: f.W, H: f.H } };
    const o = lc.offer(s as never);
    expect(o).not.toBeNull();
    lc.boons(o!).forEach((_, i) => lc.info.add(i));
    lc.open = lc.boons(o!).length - 1;
    const L = lc.layout(s as never, o!);
    expect([L.gap, L.bottom <= f.H]).toEqual([lcGaps(), true]);
    // a screen 1 px too short for the cards with G even at lcLayout's least top (4)
    const short = lc.layout({ ...s, game: { W: f.W, H: L.bottom - L.top + 3 } } as never, o!);
    expect(short.gap).toEqual(lcGaps(true));
  });
});

// --------------------------------------------------------------------------- (e): the rune bar read-out's note room
import { RuneBar, runeCardH as cardHOf } from "../src/ui/runeBar";
import { RUNES } from "../src/sim/runes";

describe("CARD-3 (e): the rune bar's read-out makes its note room only while a note shows (REQ-BFG-089)", () => {
  it("every rune: the read-out ends after its last line with no note, makes the room for the chip's line or a word's definition; its chip and words stay put", () => {
    setTipsForTests("done");
    const f = framed(402, 690, 3, 1), rows: string[] = [];
    let n = 0;
    for (const def of RUNE_LIST) {
      const run = newRun("furnace", 5, `card3-e-${def.id}`);
      run.build.runes = [{ id: def.id }] as never;
      const ui = new UI(), bar = new RuneBar();
      const s = { run, game: { W: f.W, H: f.H, view: f.view, ui, canvas: null }, L: f.L, menu: false, panelArea: () => f.L.info };
      const frame = () => { ui.begin(); bar.drawOver(gOf(fresh(f.W, f.H)), s as never); ui.end(); return ui; };
      frame().regions.find((q) => q.id === "rune-0")!.onTap!();
      bar.word = null; // the read-out with no note (K1's first sight aside)
      const at = () => {
        const u = frame(), r = u.regions.find((q) => q.id === "rune-readout")!.r;
        return { r, chip: u.regions.find((q) => q.id === "rune-chip")?.r, words: u.regions.filter((q) => q.id.startsWith("rune-w")).map((q) => q.r) };
      };
      const none = at(), w = none.r.w;
      bar.note = true;
      const note = at();
      bar.note = false;
      const k = runeKeywords(def)[0];
      bar.word = k ? KEYWORD_WORD[k] : null;
      const word = k ? at() : note;
      expect(none.r.h, def.id).toBe(cardHOf(def, w, {}));
      expect([note.r.h, word.r.h], def.id).toEqual([cardHOf(def, w, { reminder: true }), cardHOf(def, w, { reminder: true })]);
      // nothing a press reaches moves: the card's top, its chip, its words
      expect([note.r.y, note.chip, note.words], def.id).toEqual([none.r.y, none.chip, none.words]);
      expect([!!none.chip, RUNES[def.id].id], def.id).toEqual([true, def.id]);
      if (n++ < 4) rows.push(`${def.id}: ${none.r.h} px with no note, ${note.r.h} with one`);
      bar.word = null;
    }
    console.log(`CARD3 (e): ${n} runes' read-outs on 402x690 @3: ${rows.join("; ")}`);
  });
});
