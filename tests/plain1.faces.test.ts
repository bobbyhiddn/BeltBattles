// PLAIN-1 (REQ-BFG-084.1; BRIEF-PLAIN1 P4, step 4): the six plain stat rigs' interim faces and icons, with the switch on.
// A face is the stat row and no ability line (faces.ts plainRigStats through rigStats since PLAIN-1F's M1 fold; PLAIN-1F M3
// puts the shared rig sentence behind the ⓘ, the hover or a tap on EXPLAIN-1's layer: "PLAIN-1F (M3)" below, and
// tests/explain1 (f), card2 (k6), card3 (r)). Every line of the six fits the sizes the base's checks use: the op card's chip
// (tests/shopChips.test.ts's rule) and the op view's 225 px band in 5x7 (NEXT_LINE_W, tests/faceText.test.ts's rule). Each
// has its own icon (plainArt.ts): six pictures, none another rig's.
import { describe, expect, it } from "vitest";
import { R, installRaster, sig } from "./raster.helpers";
import { ITEMS } from "../src/sim/content";
import { PLAIN_RIG_IDS, withPlainRigs } from "../src/sim/plainRigs";
import { ICON, ICON_BASE, textWidth } from "../src/render/font";
import { faceAt, faceLines, faceNext, hasFace, NEXT_LINE_W } from "../src/ui/faces";
import { shopChipGlyphs } from "../src/ui/chips";
import { CARD_MARK_X, cardPriceX } from "../src/screens/build/shop";
import { CARD_W } from "../src/screens/build/layout";
import { levelLines, levelText } from "../src/screens/build/levels";
import { gateSprite, itemIcon } from "../src/render/sprites";
// PLAIN-1F (M3): the final faces
import { buyableModules } from "../src/sim/content";
import { icons } from "../src/render/font";
import { REMINDER, cardEffect, plainRigStats } from "../src/ui/faces";
import { cardText } from "../src/ui/abilityText";
import { statRow } from "../src/ui/icons";
import { CARD_EFFECT_LINES, cardEffectLines, cardEffectWidth } from "../src/screens/build/shop";
import { wideCardW } from "../src/screens/build/layout";
import { lineText, lineWidth } from "../src/ui/richText";
import { familiesOf, familyNote } from "../src/ui/families";

installRaster();
const on = <T>(fn: () => T): T => withPlainRigs(fn);
const NAME_OF = new Map<string, string>(Object.entries(ICON).map(([k, v]) => [v as string, k]));
/** Glyphs as the text sheet prints them (tools/textSheet.ts plain): each private-use icon as [NAME]; ♥ as itself. */
const plain = (s: string): string => [...s].map((ch) => (ch.charCodeAt(0) >= ICON_BASE && NAME_OF.has(ch) ? `[${NAME_OF.get(ch)}]` : ch)).join("");

describe("P4: the interim faces", () => {
  it("off, none has a face; on, each draws its stat row as the table reads it and no ability line", () => {
    for (const id of PLAIN_RIG_IDS) expect(hasFace(id), id).toBe(false);
    const want: Record<string, string[]> = {
      rasp: ["[DMG]+8 [BURN]+1", "[DMG]+16 [BURN]+2", "[DMG]+28 [BURN]+3"], // SHAPES-2 run 2: DMG 10/20/35 -> 8/16/28
      sparkgap: ["[STUN]+1", "[STUN]+2", "[STUN]+3"],
      scaleguard: ["[PLATE]+5 [DMG]+10", "[PLATE]+12 [DMG]+20", "[PLATE]+18 [DMG]+35"], // SHAPES-2 run 2: PLATE 3/7/11 -> 5/12/18
      ballast: ["MAX ♥+8%", "MAX ♥+16%", "MAX ♥+25%"],
      grindstone: ["[DMG]+25", "[DMG]+55", "[DMG]+90"],
      brandingiron: ["[DMG]+15", "[DMG]+30 [BURN]+1", "[DMG]+50 [BURN]+2"], // FIRSTDAY-1 F7: the burn comes with the first merge
    };
    on(() => {
      for (const id of PLAIN_RIG_IDS) {
        expect(hasFace(id), id).toBe(true);
        const rows = [1, 2, 3].map((s) => {
          const fl = faceLines(id, s)!;
          expect(fl.rules, `${id} ★${s}: no ability line`).toEqual([]);
          return plain(fl.stats!);
        });
        expect(rows, id).toEqual(want[id]);
      }
    });
  });

  it("every line of the six fits: the op card's chip beside its price, the stat row, NEXT★ and the ⓘ ladder in the 225 px band", () => on(() => {
    const widest: string[] = [];
    for (const id of PLAIN_RIG_IDS) {
      const chip = shopChipGlyphs(id, { hero: "furnace" })!;
      expect(chip, id).toBeTruthy();
      const cw = textWidth(chip, "3");
      for (const price of [ITEMS[id].price, Math.max(0, ITEMS[id].price - 2)]) {
        expect(CARD_MARK_X + cw + 2, `${id} chip ${cw} px`).toBeLessThanOrEqual(cardPriceX(0, CARD_W, price, false, true));
      }
      for (let s = 1; s <= 3; s++) {
        const fl = faceLines(id, s)!;
        expect(textWidth(fl.stats!, "5"), `${id} ★${s} stats`).toBeLessThanOrEqual(NEXT_LINE_W);
        const nx = s < 3 ? faceNext(id, s) : null;
        if (nx) expect(textWidth(nx.text, "5"), `${id} ★${s} NEXT`).toBeLessThanOrEqual(NEXT_LINE_W);
        for (const l of levelLines(id, s) ?? []) expect(textWidth(levelText(l), "5"), `${id} ★${s} ladder`).toBeLessThanOrEqual(NEXT_LINE_W);
        widest.push(`${id}★${s} ${textWidth(fl.stats!, "5")}`);
      }
      expect(faceAt(id, 1)!.stats.length).toBeLessThanOrEqual(3);
    }
    console.log(`PLAIN1 stat rows (5x7 px): ${widest.join(", ")}`);
  }));
});

// PLAIN-1F (REQ-BFG-084.1, REQ-BFG-089, M3): the six's final faces on the card lane's layer, re-pinned on the one plain path
// (faces.ts plainRigStats through rigStats, isPlainRig; EXPLAIN-1's NOTES; tests/explain1 (f), card2 (k6) and card3 (r) walk
// the panel, LAST CHANCE's card and the words): the desk's wide shop card draws the stat row as its effect line (cap's call on
// run 2's F5), BALLAST has one reading, MAX ♥+8% (REVIEW-PLAIN1 D4), and a reminder shows only on a star whose stats hold
// its keyword (F7). With PLAIN_RIGS off nothing moves.
describe("PLAIN-1F (M3): the final faces", () => {
  it("the desk's wide card draws the stat row as its effect, in at most two lines at every landscape width; every other piece keeps cardText", () => {
    const out: string[] = [];
    on(() => {
      for (const id of PLAIN_RIG_IDS) {
        expect(cardText(id), id).toBe(""); // no kept text: the wide face needs an effect (shop.ts drawCard's `wide`)
        expect(cardEffect(id), id).toBe(statRow(plainRigStats(id, 1)!));
        expect(cardEffect(id), id).not.toContain("HIT:");
        let most = 0;
        for (let W = 430; W <= 480; W++) {
          const w = wideCardW(W, 5), ls = cardEffectLines(cardEffect(id), w);
          expect(ls.length, `${id} at ${w}`).toBeLessThanOrEqual(CARD_EFFECT_LINES);
          for (const l of ls) expect(lineWidth(l, "3"), `${id} at ${w}: ${lineText(l)}`).toBeLessThanOrEqual(cardEffectWidth(w));
          most = Math.max(most, ls.length);
        }
        out.push(`${id} "${plain(cardEffect(id))}" ${most} line(s), ${textWidth(cardEffect(id), "3")} px`);
      }
      expect(plain(cardEffect("ballast"))).toBe("MAX ♥+8%");
    });
    // every buyable piece with or without the six: cardEffect is its cardText where it has one (WHETSTONE's "ADDS 20 DAMAGE.")
    for (const d of buyableModules()) if (cardText(d.id)) expect(cardEffect(d.id), d.id).toBe(cardText(d.id));
    expect(cardEffect("whetstone")).toBe("ADDS 20 DAMAGE.");
    console.log(`PLAIN1F desk cards: ${out.join("; ")}`);
  });

  it("BALLAST reads MAX ♥ on its stat row, ladder, NEXT★ and desk card; its chip keeps ♥+8% (MAX doesn't fit the chip room)", () => on(() => {
    expect([1, 2, 3].map((s) => plain(faceLines("ballast", s)!.stats!))).toEqual(["MAX ♥+8%", "MAX ♥+16%", "MAX ♥+25%"]);
    expect([1, 2, 3].map((s) => levelLines("ballast", s)!.filter((l) => l.kind === "ladder").map((l) => plain(icons(levelText(l)))))).toEqual([
      ["MAX ♥ [+8%]/+16%/+25%"], ["MAX ♥ +8%/[+16%]/+25%"], ["MAX ♥ +8%/+16%/[+25%]"],
    ]);
    expect(plain(faceNext("ballast", 1)!.text)).toBe("NEXT ★2: MAX ♥+16%");
    const chip = shopChipGlyphs("ballast")!, room = cardPriceX(0, CARD_W, ITEMS.ballast.price, false, true) - CARD_MARK_X - 2;
    expect(plain(chip)).toBe("♥+8%");
    expect(textWidth(`MAX ${chip}`, "3"), "MAX ♥+8% would not fit the phone card's chip room").toBeGreaterThan(room);
    console.log(`PLAIN1F BALLAST chip: ${textWidth(chip, "3")} px; with MAX ${textWidth(`MAX ${chip}`, "3")} px; room ${room} px`);
  }));

  it("a reminder only where the star's stats hold its keyword: BRANDING IRON's BURN from ★2; RASP BURN, SPARK GAP STUN (its seconds), SCALE GUARD SHIELD", () => on(() => {
    const rem = (id: string) => [1, 2, 3].map((s) => faceAt(id, s)!.reminders);
    expect(rem("brandingiron")).toEqual([[], [REMINDER.BURN()], [REMINDER.BURN()]]);
    expect(rem("rasp")).toEqual([[REMINDER.BURN()], [REMINDER.BURN()], [REMINDER.BURN()]]);
    expect(rem("sparkgap")).toEqual([1, 2, 3].map((s) => [REMINDER.STUN(s)]));
    expect(rem("scaleguard")).toEqual([[REMINDER.PLATE()], [REMINDER.PLATE()], [REMINDER.PLATE()]]);
    expect(rem("ballast")).toEqual([[], [], []]);
    expect(rem("grindstone")).toEqual([[], [], []]);
    // the ⓘ ladder keeps BRANDING IRON's dash at ★1 (brief M3: "no burn yet")
    expect(levelLines("brandingiron", 1)!.filter((l) => l.kind === "ladder").map((l) => plain(icons(levelText(l))))).toEqual(["[DMG] [+15]/+30/+50", "[BURN] [-]/+1/+2"]);
  }));

  it("the SHIELD family's line names MAX ♥ while BALLAST is in it (PLAIN_RIGS on); off, the line is the base's", () => {
    const base = "SHIELD: A HULL THAT OUTLASTS THE FIGHT: {*PLATE}, {*SHIELD}, {*HEAL}, GUARDS, AND WHAT TURNS {*PLATE} INTO DAMAGE.";
    expect(familyNote("PLATE")).toBe(base);
    on(() => {
      expect(familiesOf("ballast")).toEqual(["PLATE"]); // the tag stays (tools/luckReport.ts and tools/wave3.ts read tags)
      expect(familyNote("PLATE")).toBe("SHIELD: A HULL THAT OUTLASTS THE FIGHT: {*PLATE}, {*SHIELD}, {*HEAL}, MAX {HULL}, GUARDS, AND WHAT TURNS {*PLATE} INTO DAMAGE.");
    });
    expect(familyNote("PLATE")).toBe(base);
  });
});

describe("P4: six icons, each its own", () => {
  it("each draws (12x12, not empty), its icon is its idle frame, it flashes on a hit, and no two rigs share a picture", () => on(() => {
    const rigs = Object.values(ITEMS).filter((d) => d.kind === "gate").map((d) => d.id);
    const seen = new Map<string, string>();
    for (const id of rigs) {
      const s = sig(R(gateSprite(id, 0, false)));
      if (PLAIN_RIG_IDS.includes(id)) {
        expect(s.split(",").filter((p) => p !== "-").length, `${id}: drawn`).toBeGreaterThan(40);
        expect(sig(R(itemIcon(id))), `${id}: its icon is its idle frame`).toBe(s);
        expect(sig(R(gateSprite(id, 0, true))), `${id}: a hit flash`).not.toBe(s);
        expect(seen.get(s), `${id} shares a picture`).toBeUndefined();
      }
      seen.set(s, id);
    }
    // and no plain rig's picture is another rig's (all 31 base rigs' and each other's)
    const plain = new Set(PLAIN_RIG_IDS.map((id) => sig(R(gateSprite(id, 0, false)))));
    expect(plain.size).toBe(6);
    for (const id of rigs.filter((r) => !PLAIN_RIG_IDS.includes(r))) expect(plain.has(sig(R(gateSprite(id, 0, false)))), id).toBe(false);
  }));
});
