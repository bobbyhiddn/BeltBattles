// PLAIN-1 (REQ-BFG-084.1; BRIEF-PLAIN1 P4, step 4): the six plain stat rigs' interim faces and icons, with the switch on.
// A face is the stat row and no ability line (faces.ts plainStats through rigStats; PLAIN-1F moves the shared rig sentence
// behind a hover on EXPLAIN-1's layer). Every line of the six fits the sizes the base's checks use: the op card's chip
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

installRaster();
const on = <T>(fn: () => T): T => withPlainRigs(fn);
const NAME_OF = new Map<string, string>(Object.entries(ICON).map(([k, v]) => [v as string, k]));
/** Glyphs as the text sheet prints them (tools/textSheet.ts plain): each private-use icon as [NAME]; ♥ as itself. */
const plain = (s: string): string => [...s].map((ch) => (ch.charCodeAt(0) >= ICON_BASE && NAME_OF.has(ch) ? `[${NAME_OF.get(ch)}]` : ch)).join("");

describe("P4: the interim faces", () => {
  it("off, none has a face; on, each draws its stat row as the table reads it and no ability line", () => {
    for (const id of PLAIN_RIG_IDS) expect(hasFace(id), id).toBe(false);
    const want: Record<string, string[]> = {
      rasp: ["[DMG]+10 [BURN]+1", "[DMG]+20 [BURN]+2", "[DMG]+35 [BURN]+3"],
      sparkgap: ["[STUN]+1", "[STUN]+2", "[STUN]+3"],
      scaleguard: ["[PLATE]+3 [DMG]+10", "[PLATE]+7 [DMG]+20", "[PLATE]+11 [DMG]+35"],
      ballast: ["MAX ♥+8%", "MAX ♥+16%", "MAX ♥+25%"],
      grindstone: ["[DMG]+25", "[DMG]+55", "[DMG]+90"],
      brandingiron: ["[DMG]+5 [BURN]+1", "[DMG]+30 [BURN]+2", "[DMG]+50 [BURN]+3"], // ★1 DMG 5: the bench guard's cut
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
