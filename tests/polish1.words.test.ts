// POLISH-1 (REQ-BFG-085; BRIEF-POLISH1 P3): four lines say what they mean (ENCHANT-2W's cold read found them).
//  (a) RISING's line says its climb starts over each fight, said in the display layer (enchantFaces.ts wordLine; sim/enchant.ts enchantLine is as it was);
//  (b) the fight clock reads `24 SEC`, not `24S` (read as 245): the dusk card's top line, the warlord's, the replay's and the FIRST SHOT row, each fitting every view;
//  (c) MANTLET's lines say which belts' last tiles they guard (the belts INTO the turret), and no sentence ends on IN;
//  (d) the ASH SHRINE's hull chip says MAX HULL (every card the `hull` case draws).
import { afterEach, describe, expect, it } from "vitest";
import { installRaster } from "./raster.helpers";
import { viewWithSub } from "../src/game/viewGrid";
import { ENCHANT, ENCHANT_DEFS, ENCHANT_IDS, enchantLine, setEnchant, withEnchant, type EnchantId, type EnchantKind } from "../src/sim/enchant";
import { RISING_RESETS, pieceLine, wordFace, wordLine } from "../src/ui/enchantFaces";
import { duskLine, resultRows } from "../src/screens/battleHud";
import { roadLine } from "../src/screens/warlordHud";
import { replayLine } from "../src/screens/replay";
import { fmtClockSec } from "../src/ui/statFormat";
import { TIER_LABEL } from "../src/ui/captain";
import { gist, abilityText, shieldText } from "../src/ui/abilityText";
import { deltaText } from "../src/screens/event/cards";
import { textWidth } from "../src/render/font";

installRaster();
afterEach(() => setEnchant(ENCHANT));
const on = <T>(fn: () => T): T => withEnchant(fn, true);
const KINDS: EnchantKind[] = ["rig", "factory", "turret"];

describe("POLISH-1 P3a: RISING's line says the climb starts over each fight (display layer only)", () => {
  it("wordLine and pieceLine end with the sentence on every kind, star and day; the amount is still the day's", () => {
    on(() => {
      for (const kind of KINDS) for (const stars of [1, 2, 3]) for (const day of [undefined, 1, 8, 15]) {
        for (const line of [wordLine("rising", kind, stars, day), pieceLine("rising", kind, stars, day)]) {
          expect(line, `RISING ${kind} ★${stars} day ${day}`).toMatch(/ MORE THAN THE LAST\. IT STARTS OVER EACH FIGHT\.$/);
          expect(line!.endsWith(` ${RISING_RESETS}`)).toBe(true);
        }
      }
      expect(wordLine("rising", "turret", 1, 8)).toBe("EACH SHOT: +2 {DMG} MORE THAN THE LAST. IT STARTS OVER EACH FIGHT.");
      expect(wordLine("rising", "turret", 1)).toBe("EACH SHOT: +1 {DMG} MORE THAN THE LAST. IT STARTS OVER EACH FIGHT.");
    });
  });

  it("the generator's own line (sim/enchant.ts enchantLine) is as it was, and no other word's line gained the sentence", () => {
    on(() => {
      expect(enchantLine("rising", "rig")).toBe("EACH SLUG IT HITS: +1 DMG MORE THAN THE LAST.");
      expect(enchantLine("rising", "factory")).toBe("EACH SLUG IT MAKES: +1 DMG MORE THAN THE LAST.");
      expect(enchantLine("rising", "turret")).toBe("EACH SHOT: +1 DMG MORE THAN THE LAST.");
      for (const id of ENCHANT_IDS as readonly EnchantId[]) {
        if (id === "rising") continue;
        for (const kind of KINDS) expect(wordLine(id, kind, 1)?.includes("STARTS OVER"), `${id} ${kind}`).not.toBe(true);
      }
    });
  });

  it("the word's card says it once, on its last row (three rows with it do not keep whole in the phone's band)", () => {
    on(() => {
      const rows = wordFace("rising", 8).lines;
      expect(rows.map((l) => l.kind)).toEqual(["rig", "factory", "turret"]);
      expect(rows.filter((l) => l.text.includes(RISING_RESETS)).map((l) => l.kind)).toEqual(["turret"]);
      expect(rows[2].text).toBe("EACH SHOT: +2 {DMG} MORE THAN THE LAST. IT STARTS OVER EACH FIGHT.");
      expect(rows[0].text).toBe("EACH SLUG IT HITS: +2 {DMG} MORE THAN THE LAST.");
    });
  });
});

// the views the replay/result tests read (tests/replay1b.test.ts): css w x h @ dpr
const VIEWS: [number, number, number][] = [[402, 690, 3], [390, 844, 3], [430, 932, 3], [360, 780, 3], [844, 390, 3], [690, 402, 3], [932, 430, 3], [1920, 1080, 1], [1366, 768, 1], [1280, 720, 1], [320, 462, 3], [360, 640, 2]];

describe("POLISH-1 P3b: the fight clock reads `24 SEC`", () => {
  it("the lines", () => {
    expect(fmtClockSec(24.4)).toBe("24 SEC");
    expect(duskLine(6, 24.4)).toBe("DUSK · DAY 6 · 24 SEC");
    expect(roadLine(6, "medium", 24.4)).toBe("ROAD · DAY 6 · MEDIUM WARLORD · 24 SEC");
    expect(replayLine("6", "24")).toBe("REPLAY · DAY 6 · 24 SEC");
    const s = { damage: 1200, shots: 30, firstShot: 24.4, idle: 3, turretTime: 30, jams: 1, burnDealt: 170, disrupted: 0 } as never;
    expect(resultRows({ player: s, enemy: s })[2]).toEqual(["FIRST SHOT", "24 SEC", "24 SEC"]);
    const never = { ...(s as object), firstShot: -1 } as never;
    expect(resultRows({ player: s, enemy: never })[2]).toEqual(["FIRST SHOT", "24 SEC", "NEVER"]);
    for (const line of [duskLine(6, 24), roadLine(6, "hard", 24), replayLine(6, "24")]) expect(line, "no bare S after the number").not.toMatch(/\d{1,3}S$/);
  });

  it("each top line fits its card on every view, at the widest day (two digits, or `n/10`) and clock (three digits); FIRST SHOT's cell clears its label", () => {
    for (const [w, h, dpr] of VIEWS) {
      const W = viewWithSub(w, h, dpr).W;
      const card = Math.min(W - 10, 214), replayCard = Math.min(W - 10, 150);
      const widest = (s: string): number => textWidth(s, "3");
      for (const day of [9, 12, 24]) {
        expect(widest(duskLine(day, 999)), `${w}x${h}@${dpr} dusk day ${day}`).toBeLessThanOrEqual(card - 8);
        for (const tier of Object.keys(TIER_LABEL) as (keyof typeof TIER_LABEL)[]) expect(widest(roadLine(day, tier, 999)), `${w}x${h}@${dpr} road ${tier} day ${day}`).toBeLessThanOrEqual(card - 8);
      }
      for (const day of ["9/10", "12", "24"]) expect(widest(replayLine(day, "999")), `${w}x${h}@${dpr} replay day ${day}`).toBeLessThanOrEqual(replayCard - 8);
      // the table: the label from x + 10, the YOU value ends at x + card - 52 (right-aligned), the FOE value at x + card - 10: 42 px of column each
      expect(widest("FIRST SHOT") + 10 + widest("999 SEC") + 4, `${w}x${h}@${dpr} FIRST SHOT label and YOU value`).toBeLessThanOrEqual(card - 52);
      expect(widest("999 SEC"), `${w}x${h}@${dpr} FOE value`).toBeLessThanOrEqual(42 - 2);
    }
  });
});

describe("POLISH-1 P3c: MANTLET says which belts' last tiles it guards", () => {
  it("no MANTLET sentence, clause or gist ends on IN; each names the belts INTO the turret", () => {
    const all: string[] = [];
    for (const stars of [1, 2, 3]) all.push(...abilityText("mantlet", stars).sentences, gist("mantlet", stars));
    for (const n of [1, 2, 3]) all.push(shieldText(n));
    for (const t of all) {
      expect(t, t).not.toMatch(/\bIN\.?$/);
      if (/EACH BELT/.test(t)) expect(t, t).toMatch(/EACH BELT INTO IT\.?$/);
    }
    expect(shieldText(1)).toBe("GUARDED: THE LAST TILE OF EACH BELT INTO IT.");
    expect(shieldText(2)).toBe("GUARDED: THE LAST 2 TILES OF EACH BELT INTO IT.");
    expect(gist("mantlet", 1)).toBe("IGNORES EVERY STUN, GUARDS THE LAST TILE OF EACH BELT INTO IT");
    expect(abilityText("mantlet", 3).sentences[0]).toBe("THE TURRET IGNORES EVERY STUN, AND SO DO THE LAST 3 TILES OF EACH BELT INTO IT.");
  });
});

describe("POLISH-1 P3d: the shrine's hull chip says MAX HULL", () => {
  it("deltaText: a hull cost and a hull gain say MAX HULL, on every day; the other chips are as they were", () => {
    for (const day of [undefined, 1, 4, 10, 18]) {
      expect(deltaText({ k: "hull", n: 220 }, true, day), `cost day ${day}`).toMatch(/^-\d+ MAX HULL$/);
      expect(deltaText({ k: "hull", n: 250 }, false, day), `gain day ${day}`).toMatch(/^\+\d+ MAX HULL$/);
    }
    expect(deltaText({ k: "gold", n: 3 }, false)).toBe("+3");
    expect(deltaText({ k: "belt", n: 2 }, false)).toBe("+2 BELT");
    expect(ENCHANT_DEFS.fiery.name).toBe("FIERY"); // (the word chip is the word's name, unchanged)
  });
});
