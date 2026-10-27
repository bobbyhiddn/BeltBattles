// 0.8.0 H1 M2 (REQ-BFG-032, REQ-BFG-011): the signature panels of FOUNDRY and BASTION. Their factories (the CRUCIBLE and
// the WARDWORKS, never sold) have ability text in the glossary (src/ui/abilityText.ts), plain sentences built from the
// real values, the factory's and its ammo's: the twin pour, the blank, the sync window and the fusion; the bulwark slug,
// its plating, the cap, what plating soaks and what it doesn't. Their flavour keeps a tip with no number (F1). The
// signatures stay unbuyable. FURNACE's KILN and WEAVER's LOOM keep their catalogue desc, as before.
import { describe, expect, it } from "vitest";
import { abilityText, cardText, gist, hasAbilityText, nextStarText } from "../src/ui/abilityText";
import { flavour } from "../src/screens/build/flavour";
import { itemPanel } from "../src/screens/build/inspector";
import { faceLines } from "../src/ui/faces"; // U2a
import { wrapText } from "../src/ui/richText";
import { textWidth } from "../src/render/font";
import { AMMO, ITEMS, MERCHANTS, buyableModules, itemsSoldBy, type MerchantId } from "../src/sim/content";
import { fusible, outputsAt } from "../src/sim/stars";
import { FUSE_MULT, SYNC_WINDOW } from "../src/sim/races/foundry";
import { fmtPct } from "../src/ui/statFormat"; // NUM-4 (REQ-BFG-047): FUSE_MULT as a whole %
import { PLATE_CAP, PLATE_PER_SLUG } from "../src/sim/races/bastion";
import { newRun } from "../src/game/run";
import { banned, numbers, repeats } from "./textRules";

const WIDTHS: [number, "5" | "3"][] = [[102, "5"], [109, "5"], [116, "5"], [102, "3"], [109, "3"], [116, "3"], [151, "3"]];

describe("CRUCIBLE and WARDWORKS: plain sentences from the real values", () => {
  it("the CRUCIBLE: its pour, the blank, the window and the fusion, each number the sim's", () => {
    const t = abilityText("crucible").sentences;
    expect(t).toEqual([
      // T47 (REQ-BFG-047): no seconds; its cycle moves with its FACTORY level (the blank, the window and the fusion keep
      // 0.8.4's numbers until the numbers release)
      "POURS AN ALLOY BLANK ONTO EACH OF ITS 2 BELTS AT THE SAME MOMENT.",
      "AN ALLOY BLANK DEALS 35 DAMAGE.", // NUM-1 (REQ-BFG-047), the numbers release: AMMO.blank.base x10 (was 3.5)
      // NUM-4 (REQ-BFG-047, N1 2.2): the window (SYNC_WINDOW 0.25 s) is a hidden sub-second timer, named by the PAIR word
      // AT ONCE; FUSE_MULT reads as a whole % through fmtPct (was "... WITHIN 0.25 SECONDS OF EACH OTHER FUSE INTO AN
      // ALLOY SLUG WITH 1.15 TIMES THEIR DAMAGE.")
      `TWO BLANKS THAT REACH ONE TURRET THROUGH DIFFERENT INTAKES AT ONCE FUSE INTO AN ALLOY SLUG THAT DEALS THEIR DAMAGE AND ${fmtPct(FUSE_MULT - 1)} MORE.`,
      "A BLANK WITH NO PARTNER FIRES ON ITS OWN.",
    ]);
    // "TWO BLANKS ... ONE TURRET": a pair, at one gun (the sync rule's own words)
    // bb-0.8.3 (REQ-BFG-042 D2): FactorySpec.outputs is gone; the belt slots at ★1 are outputsAt's (2, as before)
    // NUM-4 (REQ-BFG-047): the fusion's number is FUSE_MULT as a whole % (15), and the window is not quoted: it is under a
    // second, so AT ONCE names it (was [..., SYNC_WINDOW, FUSE_MULT], 0.25 and 1.15)
    expect(SYNC_WINDOW).toBeLessThan(1);
    expect(numbers(t.join(" "))).toEqual([outputsAt("crucible", 1), AMMO.blank.base, 2, 1, parseFloat(fmtPct(FUSE_MULT - 1))]);
  });

  it("the WARDWORKS: its stamp, the bulwark slug, the plating, the cap, what plating soaks and the dark wind", () => {
    const t = abilityText("wardworks").sentences;
    expect(t).toEqual([
      // bb-0.8.3 (REQ-BFG-042 M4): its belts; T47 (REQ-BFG-047): no seconds, as its cycle moves with its FACTORY level
      "STAMPS BULWARK SLUGS ONTO UP TO 2 BELTS IN TURN.",
      // NUM-1 (REQ-BFG-047): AMMO.bulwark.base, PLATE_PER_SLUG and PLATE_CAP x10 (were 5, 2 and 24)
      "A BULWARK SLUG DEALS 50 DAMAGE.",
      "EACH ONE THAT LOADS INTO A TURRET SHIELDS YOUR HULL BY 20, UP TO 240 SHIELD; A SPLITTER COPY SHIELDS BY ITS SHARE.",
      "SHIELD TAKES HITS AND BURN BEFORE YOUR HULL DOES, AND IT LASTS UNTIL THE BATTLE ENDS.",
      "THE DARK WIND IGNORES SHIELD.",
    ]);
    expect(numbers(t.join(" "))).toEqual([outputsAt("wardworks", 1), AMMO.bulwark.base, 1, PLATE_PER_SLUG, PLATE_CAP]);
  });

  it("T2: no banned shorthand; whole sentences; every sentence wraps inside every panel width", () => {
    for (const def of ["crucible", "wardworks"]) {
      for (const s of abilityText(def).sentences) {
        expect(banned(s), `${def}: ${s}`).toEqual([]);
        expect(s, def).toMatch(/^[A-Z].*\.$/);
        for (const [w, font] of WIDTHS) for (const line of wrapText(s, w, font)) expect(textWidth(line, font), `${def} ${w}/${font}: ${line}`).toBeLessThanOrEqual(w);
      }
      expect(gist(def)).not.toBe("");
      expect(nextStarText(def, 1)).toBeNull(); // a signature never merges (bb-0.8.3 D10: it levels by its hero's upgrade)
    }
  });

  it("their flavour keeps one tip with no number that repeats no ability sentence (F1)", () => {
    for (const def of ["crucible", "wardworks"]) {
      const kept = flavour(def);
      expect(kept, def).toHaveLength(1);
      expect(numbers(kept[0]), def).toEqual([]);
      for (const a of abilityText(def).sentences) expect(repeats(kept[0], a), `${def}: ${kept[0]} | ${a}`).toBe(false);
    }
  });

  it("a placed CRUCIBLE's or WARDWORKS' panel shows its face and the tip, no stars and no TO CARGO", () => {
    for (const [hero, def] of [["foundry", "crucible"], ["bastion", "wardworks"]] as const) {
      const run = newRun(hero, 3);
      const sig = run.build.items.find((p) => p.def === def)!;
      const p = itemPanel(run, sig.uid)!;
      const text = p.body.map((b) => b.text);
      // U2a (REQ-BFG-046): the face (src/ui/faces.ts) in place of the sentences: its stat row, rule lines and reminder.
      // U2e step 4 (REQ-BFG-070): no reminder on the face (a tap, the hover and the ⓘ view's KEYWORDS show it)
      const fl = faceLines(def)!;
      for (const s of [fl.stats!, ...fl.rules.map((r) => r.text)]) expect(text, `${def}: ${s}`).toContain(s);
      for (const r of fl.reminders) expect(text, `${def}: no reminder`).not.toContain(r);
      expect(text.join(" ")).toContain(flavour(def)[0]);
      expect(p.labels).toEqual(["UPGRADE 10G"]); // bb-0.8.3 (REQ-BFG-043 D11): its FACTORY upgrade's button (0.8.0: [])
      expect(p.title).toBe(`${ITEMS[def].name} ★`); // POLISH-1 (P5a): the panel's title shows its star at ★1 too (was the bare name)
    }
  });

  // bb-0.8.3 (REQ-BFG-042 D2, M4): 0.8.0's "FURNACE's KILN and WEAVER's LOOM keep their catalogue desc and no ability
  // text": they level up by merging and their caravan sells copies, so they read their numbers at every star as the
  // CRUCIBLE and the WARDWORKS do, with one tip with no number for flavour (tests/belts.text.test.ts reads the numbers)
  // U2b F2 (REQ-BFG-046), moved onto 0.8.6: their panels draw the face and never the catalogue desc; 0.8.5's tip stays
  it("FURNACE's KILN and WEAVER's LOOM have ability text at every star, a face, and a tip for flavour", () => {
    for (const def of ["kiln", "loom"]) {
      expect(hasAbilityText(def), def).toBe(true);
      // U2b F2 (REQ-BFG-046): a panel that draws a face never draws the desc, which restates the rule in old words
      expect(faceLines(def), def).not.toBeNull();
      expect(flavour(def), def).toHaveLength(1);
      expect(flavour(def)[0], def).not.toMatch(/\d/);
      expect(flavour(def)[0], def).not.toBe(ITEMS[def].desc.join(" "));
    }
  });
});

describe("the signatures stay unbuyable", () => {
  it("no merchant sells the CRUCIBLE or the WARDWORKS; they are in no buyable list, have no price and no card", () => {
    for (const def of ["crucible", "wardworks"]) {
      expect(ITEMS[def].merchant, def).toBeUndefined();
      expect(ITEMS[def].price, def).toBe(0);
      expect(fusible(def), def).toBe(false);
      expect(buyableModules().map((d) => d.id)).not.toContain(def);
      for (const m of Object.keys(MERCHANTS) as MerchantId[]) expect(itemsSoldBy(m).map((d) => d.id), `${m} ${def}`).not.toContain(def);
      expect(cardText(def)).toMatch(/\.$/); // only a shop card would show it, and no shop offers it
    }
  });
});
