// SCALE-2b (REQ-BFG-108, REQ-BFG-100 C1, REQ-BFG-089, REQ-BFG-107; BRIEF-SCALE2b section 3 and step 4): POISON's screen half,
// switch on only. Each thing is checked on with SCALE_RIGS on (withScaleRigs) and absent or unchanged with it off (as
// shipped): the drop glyph, the venom colour, the keyword (KEYWORDS, its reminder, its glossary row, its colour words),
// first sight, VENOM DRIP's plain face (stat row, chip, NOTES, KEYWORDS), C1's POISON chip, and the tick's venom number.
// BUMP-1E: the switch ships ON from bb-0.12.0 (SCALE_RIGS = true; it shipped off when this was written), so every "off" half below asks
// for the 0.9.11 world outright with withScaleRigs(fn, false) (the `off` helper), synchronously (it was a bare read or a bare Battle);
// the on halves are unchanged, and a bare read now is the shipped (on) world.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { putItemsBack, snapshotItems, type ItemsSnapshot } from "../src/sim/itemsKeep"; // BUMP-1F (R5.5 (b)): each test puts ITEMS back as it found it
import { ITEMS, type ItemDef, type ReadSpec } from "../src/sim/content";
import { Battle } from "../src/sim/battle";
import { SCALE_RIGS, scaleRules, withScaleRigs } from "../src/sim/scale";
import { clearStarCache } from "../src/sim/stars";
import {
  ICON, ICON_BASE, ICON_COLOUR, KEYWORDS, PLAYER_WORD, glyphRows, icons, isIcon, keywordColour, stripIcons, textWidth, wrap, type FontId,
} from "../src/render/font";
import { C } from "../src/render/palette";
import { KEYWORD_COLOUR, colourize } from "../src/ui/richText";
import { REMINDER, RIG_SENTENCE, faceAt, isPlainRig, plainRigStats } from "../src/ui/faces";
import { GLOSSARY, GLOSSARY_WRAP_W, glossaryEntry, glossaryText, glossaryWordsIn, keywordRow } from "../src/ui/glossary";
import { hitText } from "../src/ui/abilityText"; // BUMP-1E P6: the belt timeline's VENOM DRIP row
import { FIRST_SIGHT_IDS, FIRST_SIGHT_WORDS, kwSight } from "../src/ui/tips";
import { isSightWord } from "../src/ui/firstSight";
import { shopChip } from "../src/ui/chips";
import { statRow } from "../src/ui/icons";
import { STATUS_CHIPS, readCount, shownChips } from "../src/game/counters";
import { keywordEntry } from "../src/ui/counterText";
import { react } from "../src/game/arenaReact";
import { Arena } from "../src/game/arena";
import { faceBlocks } from "../src/screens/build/faceBlocks";
import { explainPanel, type PanelText } from "../src/screens/build/inspector";
import { explainWords } from "../src/screens/build/keywords";
import { fmtDmg } from "../src/ui/statFormat";
import { SEED, barge, furnaceBench, item, withItem } from "./wave3.helpers";

const ROT: ItemDef = {
  id: "s2bscrot", name: "S2BSCROT", kind: "gate", rarity: "common", price: 3, size: 1, merchant: "alchemist", desc: [], tags: ["FORGE"],
  gate: { reads: { count: "foePoison", each: 3, give: "dmg" } as ReadSpec },
};
const ITEMS_RW = ITEMS as Record<string, ItemDef>;
beforeAll(() => { ITEMS_RW.s2bscrot = ROT; clearStarCache(); });
afterAll(() => { delete ITEMS_RW.s2bscrot; clearStarCache(); });
// BUMP-1F (RULING-BUMP1F-R5 R5.5 (b); the suite guard, tests/setup/itemsGuard.ts): was no hook. The test-only ids above are the LAST keys of ITEMS (beforeAll appends them), and an
// off/on call of the scaling switch takes the seven out and brings them back at their rank, AFTER the test-only ids: so a test that asks for the 0.9.11 world (withScaleRigs(fn, false))
// left Object.keys(ITEMS) permuted (key 112: cindermail became a test id). Each test now keeps ITEMS as it found it (src/sim/itemsKeep.ts: snapshotItems, putItemsBack); the guard's
// afterEach runs after this one, so it sees ITEMS unchanged.
let kept: ItemsSnapshot;
beforeEach(() => { kept = snapshotItems(); });
afterEach(() => { putItemsBack(kept); });

const on = <T>(fn: () => T): T => withScaleRigs(fn);
const off = <T>(fn: () => T): T => withScaleRigs(fn, false); // BUMP-1E: the 0.9.11 world, asked for outright (the switch ships on; the off halves were bare)
const SHIPPED_KEYWORDS = ["BURN", "STUN", "HEAT", "FRAY", "PLATE", "PAIR", "SHIELD", "HEAL", "REGEN"];

// ---------------------------------------------------------------------------------------------- the glyph

/** Pixel Hamming distance (tests/icons.test.ts's): the narrower bitmap padded at every offset, the smallest kept. */
function dist(a: string[], b: string[]): number {
  if (a[0].length < b[0].length) [a, b] = [b, a];
  const wa = a[0].length, wb = b[0].length;
  let best = Infinity;
  for (let off = 0; off <= wa - wb; off++) {
    let d = 0;
    for (let y = 0; y < a.length; y++) {
      const pb = ".".repeat(off) + b[y] + ".".repeat(wa - wb - off);
      for (let x = 0; x < wa; x++) if (a[y][x] !== pb[x]) d++;
    }
    best = Math.min(best, d);
  }
  return best;
}

describe("SCALE-2b screen: POISON's drop glyph, pua(15)", () => {
  it("ICON.POISON is U+E00F, one unit, in both faces, an icon; ICON's listed names stay the 19 shipped, on and off", () => {
    expect(ICON.POISON).toBe(String.fromCharCode(ICON_BASE + 15));
    expect(ICON.POISON.length).toBe(1);
    const names = ["DMG", "SEC", "RATE", "SLUG", "BELT", "GEAR", "GOLD", "UP", "BURN", "STUN", "HEAT", "FRAY", "PLATE", "PAIR", "SHIELD", "HEAL", "REGEN", "HULL", "STAR"];
    expect(Object.keys(ICON)).toEqual(names);
    on(() => expect(Object.keys(ICON)).toEqual(names));
    expect(glyphRows(ICON.POISON, "5")).toEqual(["..#..", "..#..", ".#.#.", "#...#", "#...#", "#...#", ".###."]);
    expect(glyphRows(ICON.POISON, "3")).toEqual([".#.", ".#.", "###", "###", ".#."]);
    expect(isIcon(ICON.POISON)).toBe(true);
    expect(stripIcons(`+1${ICON.POISON}`)).toBe("+1");
    expect(textWidth(ICON.POISON, "5")).toBe(textWidth(ICON.BURN, "5"));
  });

  it("keeps icons.test.ts's distances: from every other icon (2+), letter and digit (3+) and punctuation (2+), in both faces", () => {
    const LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"];
    const PUNCT = [...".:-+/%!?()',;\"=<>&#·→♥★x"];
    const others = [...Object.values(ICON).filter((ch) => ch !== ICON.POISON)];
    for (const font of ["5", "3"] as FontId[]) {
      const me = glyphRows(ICON.POISON, font)!;
      for (const ch of others) { const r = glyphRows(ch, font); if (r) expect(dist(me, r), `${font}: icon U+${ch.charCodeAt(0).toString(16)}`).toBeGreaterThanOrEqual(2); }
      for (const ch of LETTERS) { const r = glyphRows(ch, font); if (r) expect(dist(me, r), `${font}: ${ch}`).toBeGreaterThanOrEqual(3); }
      for (const ch of PUNCT) { const r = glyphRows(ch, font); if (r && r[0].length > 1) expect(dist(me, r), `${font}: ${ch}`).toBeGreaterThanOrEqual(2); }
    }
    expect(dist(glyphRows(ICON.POISON, "5")!, glyphRows(ICON.BURN, "5")!)).toBeGreaterThanOrEqual(8); // never read as BURN's flame
  });
});

// ---------------------------------------------------------------------------------------------- the colour

/** WCAG contrast of two #RRGGBB colours. */
function contrast(a: string, b: string): number {
  const L = (h: string) => {
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [x, y] = [L(a), L(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
/** Hue in degrees of a #RRGGBB colour. */
function hue(h: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  const hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (hh * 60 + 360) % 360;
}

describe("SCALE-2b screen: the venom colour", () => {
  it("a yellow-green apart from lime (HP, SWARM), HEAL's green, BURN's fire3 and the yellow; it reads on the dark board", () => {
    expect(C.venom).toBe("#C4F032");
    expect(ICON_COLOUR[ICON.POISON]).toBe(C.venom); // BUMP-1E: the shipped switch is on, so the bare table holds the drop's colour
    off(() => expect(ICON_COLOUR[ICON.POISON]).toBeUndefined()); // off: ICON_COLOUR is the base's table (BUMP-1E: was bare, toBeUndefined)
    on(() => expect(ICON_COLOUR[ICON.POISON]).toBe(C.venom));
    off(() => expect(ICON_COLOUR).not.toHaveProperty(ICON.POISON)); // BUMP-1E: was bare
    const h = hue(C.venom);
    expect(h).toBeGreaterThan(65);
    expect(h).toBeLessThan(85);
    for (const [name, other] of [["lime", C.lime], ["green", C.green], ["fire3", C.fire3], ["yellow", C.yellow]] as const) {
      expect(Math.abs(hue(other) - h), name).toBeGreaterThan(25);
    }
    for (const bg of [C.navy, C.ink, C.night, C.slate1]) expect(contrast(C.venom, bg), bg).toBeGreaterThan(7);
  });
});

// ---------------------------------------------------------------------------------------------- the keyword

describe("SCALE-2b screen: the keyword, its reminder and its glossary row", () => {
  const drawn = (): string => icons(REMINDER.POISON());

  it("off: KEYWORDS is the shipped 9, {*POISON} stays markup, no POISON row, colour word or sight", () => {
    expect(SCALE_RIGS).toBe(true); // BUMP-1E: was toBe(false) (the switch ships on from bb-0.12.0)
    off(() => { // BUMP-1E: the whole old test, in the 0.9.11 world it was written for (was bare)
      expect(scaleRules()).toBe(false);
      expect([...KEYWORDS]).toEqual(SHIPPED_KEYWORDS);
      expect(PLAYER_WORD).not.toHaveProperty("POISON");
      expect(icons("{*POISON}")).toBe("{*POISON}");
      expect(glossaryEntry("POISON")).toBeUndefined();
      expect(glossaryWordsIn("THE FOE HAS 4 POISON NOW")).toEqual([]);
      expect(GLOSSARY.some((r) => r.kw === "POISON")).toBe(false);
      expect(Object.keys(KEYWORD_COLOUR)).not.toContain("poison");
      expect(colourize("POISON", C.bone)).toEqual([{ t: "POISON", c: C.bone }]);
      expect(FIRST_SIGHT_WORDS).not.toContain("POISON");
      expect(FIRST_SIGHT_IDS).not.toContain("kw:POISON");
      expect(isSightWord("POISON")).toBe(false);
    });
  });

  it("on: POISON joins KEYWORDS (the 10th), {*POISON} draws the drop then POISON in venom; off again, all as before", () => {
    const g = off(() => GLOSSARY.length); // BUMP-1E: the off count, read with the switch off (was bare: `GLOSSARY.length`, the shipped switch was off)
    on(() => {
      expect([...KEYWORDS]).toEqual([...SHIPPED_KEYWORDS, "POISON"]);
      expect(PLAYER_WORD.POISON).toBe("POISON");
      expect(icons("+1 {*POISON}")).toBe(`+1 ${ICON.POISON}POISON`);
      expect(icons("{*POISON}", "alone")).toBe(ICON.POISON);
      expect(keywordColour(`${ICON.POISON}POISON`)).toBe(C.venom);
      expect(KEYWORD_COLOUR).toHaveProperty("poison", C.venom);
      expect(colourize("POISON", C.bone)).toEqual([{ t: "POISON", c: C.venom }]);
      expect(GLOSSARY.length).toBe(g + 1);
    });
    // BUMP-1E: the shipped switch is on, so after the round trip a bare read is the on world, and "off again" is read with it off (was bare)
    expect([...KEYWORDS]).toEqual([...SHIPPED_KEYWORDS, "POISON"]);
    expect(GLOSSARY.length).toBe(g + 1);
    expect(Object.keys(KEYWORD_COLOUR)).toContain("poison");
    off(() => {
      expect([...KEYWORDS]).toEqual(SHIPPED_KEYWORDS);
      expect(GLOSSARY.length).toBe(g);
      expect(Object.keys(KEYWORD_COLOUR)).not.toContain("poison");
    });
  });

  it("the reminder: the design's text in BURN's form, {*PLATE} drawn as SHIELD, 2 lines of 5x7 at the glossary's width", () => {
    on(() => {
      // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), cause: POISON_DPS 3 -> 2, src/sim/content.ts; the reminder reads the number): was "3 HULL DAMAGE A SEC" in all three lines
      expect(REMINDER.POISON()).toBe("EACH {*POISON}: 2 HULL DAMAGE A SEC UNTIL THE END. THEY ADD UP AND GO PAST {*PLATE}.");
      expect(drawn()).toBe(`EACH ${ICON.POISON}POISON: 2 HULL DAMAGE A SEC UNTIL THE END. THEY ADD UP AND GO PAST ${ICON.PLATE}SHIELD.`);
      expect(wrap(drawn(), GLOSSARY_WRAP_W, "5")).toEqual([`EACH ${ICON.POISON}POISON: 2 HULL DAMAGE A SEC UNTIL`, `THE END. THEY ADD UP AND GO PAST ${ICON.PLATE}SHIELD.`]);
      // the design's own words (UNTIL THE FIGHT ENDS) take a third line: why the reminder says UNTIL THE END
      expect(wrap(icons("EACH {*POISON}: 3 HULL DAMAGE A SEC UNTIL THE FIGHT ENDS. THEY ADD UP AND GO PAST {*PLATE}."), GLOSSARY_WRAP_W, "5").length).toBe(3);
      // REQ-BFG-107's word rule: no plain PLATE word, and the one SHIELD is the soak layer's ({*PLATE})
      expect(drawn()).not.toMatch(/PLAT(E|ES|ED|ING)\b/);
      for (const m of drawn().matchAll(/SHIELD/g)) expect(drawn()[m.index! - 1]).toBe(ICON.PLATE);
    });
  });

  it("the glossary row (BURN's form): a hover and tap target wherever POISON is written; its text is the reminder", () => {
    on(() => {
      const row = glossaryEntry("POISON")!;
      expect(row).toMatchObject({ word: "POISON", kw: "POISON", colour: C.venom, scope: "text", def: REMINDER.POISON() });
      expect(glossaryEntry("POISONED")).toBe(row);
      expect(keywordRow("POISON")).toBe(row);
      const order = GLOSSARY.map((r) => r.word);
      expect(order.indexOf("POISON")).toBe(order.indexOf("REGEN") + 1);
      expect(glossaryWordsIn("HIT: +1 {*POISON}.").map((r) => r.word)).toEqual(["POISON"]); // markup, as glossaryWordsIn reads
      expect(glossaryWordsIn("THE FOE HAS 4 POISON NOW").map((r) => r.word)).toEqual(["POISON"]);
      expect(glossaryText("POISON")).toBe(REMINDER.POISON());
      expect(glossaryText("POISON", { def: "venom", stars: 2 })).toBe(REMINDER.POISON());
      expect(glossaryText("POISON", { def: "venom", stars: 1, o: { day: 9 } })).toMatch(/^EACH \{\*POISON\}: \d+ HULL DAMAGE/);
    });
  });

  it("first sight: POISON's note after REGEN's, with the switch on only", () => {
    on(() => {
      expect(FIRST_SIGHT_WORDS.indexOf("POISON")).toBe(FIRST_SIGHT_WORDS.indexOf("REGEN") + 1);
      expect(FIRST_SIGHT_IDS).toContain(kwSight("POISON"));
      expect(FIRST_SIGHT_IDS.indexOf("kw:POISON")).toBe(FIRST_SIGHT_IDS.indexOf("kw:REGEN") + 1);
      expect(isSightWord("POISON")).toBe(true);
      expect(FIRST_SIGHT_WORDS.slice(0, 4)).toEqual(["PAIR", "FRAY", "SHIELD", "WARD"]);
    });
    expect(FIRST_SIGHT_IDS).toContain("kw:POISON"); // BUMP-1E: the shipped switch is on, so the bare list holds POISON's note
    off(() => expect(FIRST_SIGHT_IDS).not.toContain("kw:POISON")); // BUMP-1E: was bare, `expect(FIRST_SIGHT_IDS).not.toContain("kw:POISON")`
  });
});

// ---------------------------------------------------------------------------------------------- VENOM DRIP's face

describe("SCALE-2b screen: VENOM DRIP's plain face", () => {
  it("off: today's Y6 face (ITS BURN LASTS +3s), its chip {BURN}+3{SEC}; not a plain rig", () => {
    expect(scaleRules()).toBe(true); // BUMP-1E: was toBe(false) (the switch ships on from bb-0.12.0)
    off(() => { // BUMP-1E: the whole old test, in the 0.9.11 world it was written for (was bare)
      expect(scaleRules()).toBe(false);
      expect(faceAt("venom", 1)!.rules.map((r) => r.text)).toEqual(["HIT: ITS {*BURN} LASTS +3{SEC}."]);
      expect(isPlainRig("venom")).toBe(false);
      expect(plainRigStats("venom", 1)).toBeNull();
      expect(shopChip("venom")).toBe("{BURN}+3{SEC}");
    });
  });

  it("on: a stat row POISON +1 / +2 / +3 (the plain-rig path), the rule kept for LEVELS, NEXT★ and the chip", () => {
    on(() => {
      expect(isPlainRig("venom")).toBe(true);
      expect([1, 2, 3].map((s) => plainRigStats("venom", s))).toEqual([[["POISON", "+1"]], [["POISON", "+2"]], [["POISON", "+3"]]]);
      expect([1, 2, 3].map((s) => faceAt("venom", s)!.rules.map((r) => r.text))).toEqual([["HIT: +1 {*POISON}."], ["HIT: +2 {*POISON}."], ["HIT: +3 {*POISON}."]]);
      expect(faceAt("venom", 1)!.reminders).toEqual([REMINDER.POISON()]);
      const blocks = faceBlocks("venom", 1, {})!;
      expect(blocks.map((b) => b.text)).toEqual([statRow([["POISON", "+1"]])]);
      expect(blocks[0].text).toBe(`${ICON.POISON}+1`);
      expect(shopChip("venom")).toBe("{POISON}+1");
    });
  });

  // BUMP-1E P6: the belt timeline's row for VENOM DRIP (abilityText.ts hitRow) was its bare name with the scaling rules (no burnPlus, no
  // POISON branch; found by a re-pin helper): now "<NAME> +<n> POISON" in the BURN and FRAY rows' form; off, today's "+n SEC TO EACH BURN"
  it("the belt row: on, VENOM DRIP +n POISON at each star; off, +n SEC TO EACH BURN as before", () => {
    on(() => {
      expect([1, 2, 3].map((s) => hitText({ def: "venom", stars: s } as never, "free"))).toEqual(["VENOM DRIP +1 POISON", "VENOM DRIP +2 POISON", "VENOM DRIP +3 POISON"]);
    });
    off(() => {
      expect(hitText({ def: "venom", stars: 2 } as never, "free")).toBe("VENOM DRIP +6 SEC TO EACH BURN");
    });
  });

  it("on: NOTES lead with the rig sentence; the ⓘ KEYWORDS hold HIT and POISON's reminder (its hover and tap)", () => {
    on(() => {
      const t: PanelText = { title: "VENOM DRIP", color: C.bone, sub: "", body: faceBlocks("venom", 1, {})!, labels: [] } as unknown as PanelText;
      const ex = explainPanel(t, "venom");
      expect(ex.notes![0].text).toBe(RIG_SENTENCE);
      const words = explainWords(ex, { def: "venom", stars: 1 } as never);
      expect(words.map((w) => w.word)).toEqual(["HIT", "POISON"]);
      expect(words[1]).toMatchObject({ text: REMINDER.POISON(), colour: C.venom });
    });
  });
});

// ---------------------------------------------------------------------------------------------- C1, the chip

describe("SCALE-2b screen: C1's POISON chip", () => {
  const chip = STATUS_CHIPS.find((c) => c.key === "poison")!;

  it("the reserved slot filled: the drop, venom icon and number, POISON's reminder, between BURN and FRAY", () => {
    expect(chip).toMatchObject({ icon: ICON.POISON, colour: C.venom, numColour: C.venom, reminder: "POISON", order: 20 });
    expect(chip.text(4)).toEqual({ num: "4", tail: "" });
  });

  it("off: never a chip, even with POISON put on a hull by hand (shownChips as today)", () => {
    off(() => { // BUMP-1E: the 0.9.11 world, asked for outright (was a bare Battle: the switch shipped off)
      const bt = new Battle(furnaceBench(), barge(), SEED);
      bt.sides[1].hull.poison = 4;
      expect(chip.value(bt, 1)).toBeNull();
      expect(shownChips(bt, 1).map((c) => c.chip.key)).toEqual([]);
    });
  });

  it("on: the foe's POISON beside BURN; none at 0 without a reader; dimmed at 0 with a POISON reader aboard", () => {
    const bt = on(() => new Battle(furnaceBench(), barge(), SEED));
    expect(shownChips(bt, 1)).toEqual([]); // 0 POISON, no reader
    bt.sides[1].hull.poison = 4;
    bt.sides[1].hull.burns.push({ dps: 2, t: 3 });
    expect(shownChips(bt, 1).map((c) => [c.chip.key, c.n, c.dim])).toEqual([["burn", 2, false], ["poison", 4, false]]);
    const reader = on(() => new Battle(withItem(furnaceBench(), item(30, "s2bscrot", 3, 3, 1)), barge(), SEED));
    expect(readCount(reader, 1, "poison")).toBe(true); // side 0 reads side 1's POISON
    expect(readCount(reader, 0, "poison")).toBe(false);
    expect(shownChips(reader, 1).map((c) => [c.chip.key, c.n, c.dim])).toEqual([["poison", 0, true]]);
    const e = on(() => keywordEntry("POISON", "4"))!;
    expect(e).toMatchObject({ icon: ICON.POISON, word: "POISON", colour: C.venom, count: "4" });
  });
});

// ---------------------------------------------------------------------------------------------- the tick's number

describe("SCALE-2b screen: the tick's venom number", () => {
  it("a poison event pops its number on that hull in venom, as BURN's tick does in fire3", () => {
    const a = on(() => new Arena(furnaceBench(), barge(), SEED, null));
    const n = a.fx.popCount;
    react(a, { type: "poison", side: 1, dmg: 12 });
    const pops = a.fx.popList.slice(n, a.fx.popCount);
    expect(pops.map((p) => [p.text, p.color, p.reader])).toEqual([[fmtDmg(12), C.venom, false]]);
    react(a, { type: "burn", side: 1, dmg: 10 });
    expect(a.fx.popList[a.fx.popCount - 1].color).toBe(C.fire3);
  });
});
