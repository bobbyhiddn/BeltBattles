// 0.8.0 H1 M2 (REQ-BFG-032, REQ-BFG-011): the signature panels of FOUNDRY and BASTION. Their factories (the CRUCIBLE and
// the WARDWORKS, never sold) have ability text in the glossary (src/ui/abilityText.ts), plain sentences built from the
// real values, the factory's and its ammo's: the twin pour, the blank, the sync window and the fusion; the bulwark slug,
// its plating, the cap, what plating soaks and what it doesn't. Their flavour keeps a tip with no number (F1). The
// signatures stay unbuyable. FURNACE's KILN and WEAVER's LOOM keep their catalogue desc, as before.
import { describe, expect, it } from "vitest";
import { abilityText, cardText, gist, hasAbilityText, nextStarText } from "../src/ui/abilityText";
import { flavour } from "../src/screens/build/flavour";
import { itemPanel } from "../src/screens/build/inspector";
import { wrapText } from "../src/ui/richText";
import { textWidth } from "../src/render/font";
import { AMMO, ITEMS, MERCHANTS, buyableModules, itemsSoldBy, type MerchantId } from "../src/sim/content";
import { fusible } from "../src/sim/stars";
import { FUSE_MULT, SYNC_WINDOW } from "../src/sim/races/foundry";
import { PLATE_CAP, PLATE_PER_SLUG } from "../src/sim/races/bastion";
import { newRun } from "../src/game/run";
import { banned, numbers, repeats } from "./textRules";

const WIDTHS: [number, "5" | "3"][] = [[102, "5"], [109, "5"], [116, "5"], [102, "3"], [109, "3"], [116, "3"], [151, "3"]];

describe("CRUCIBLE and WARDWORKS: plain sentences from the real values", () => {
  it("the CRUCIBLE: its pour, the blank, the window and the fusion, each number the sim's", () => {
    const t = abilityText("crucible").sentences;
    expect(t).toEqual([
      "POURS AN ALLOY BLANK ONTO EACH OF ITS 2 BELTS EVERY 1.6 SECONDS, ALL AT THE SAME MOMENT.",
      "AN ALLOY BLANK DEALS 3.5 DAMAGE.",
      "TWO BLANKS THAT REACH ONE TURRET THROUGH DIFFERENT INTAKES WITHIN 0.25 SECONDS OF EACH OTHER FUSE INTO AN ALLOY SLUG WITH 1.15 TIMES THEIR DAMAGE.",
      "A BLANK WITH NO PARTNER FIRES ON ITS OWN.",
    ]);
    const f = ITEMS.crucible.factory!;
    // "TWO BLANKS ... ONE TURRET": a pair, at one gun (the sync rule's own words)
    expect(numbers(t.join(" "))).toEqual([f.outputs, f.interval, AMMO.blank.base, 2, 1, SYNC_WINDOW, FUSE_MULT]);
  });

  it("the WARDWORKS: its stamp, the bulwark slug, the plating, the cap, what plating soaks and the dark wind", () => {
    const t = abilityText("wardworks").sentences;
    expect(t).toEqual([
      "STAMPS A BULWARK SLUG EVERY 1.1 SECONDS.",
      "A BULWARK SLUG DEALS 5 DAMAGE.",
      "EACH ONE THAT LOADS INTO A TURRET PLATES YOUR HULL BY 2, UP TO 24 PLATING; A SPLITTER COPY PLATES BY ITS SHARE.",
      "PLATING TAKES HITS AND BURN BEFORE YOUR HULL DOES, AND IT LASTS UNTIL THE BATTLE ENDS.",
      "THE DARK WIND IGNORES PLATING.",
    ]);
    expect(numbers(t.join(" "))).toEqual([ITEMS.wardworks.factory!.interval, AMMO.bulwark.base, 1, PLATE_PER_SLUG, PLATE_CAP]);
  });

  it("T2: no banned shorthand; whole sentences; every sentence wraps inside every panel width", () => {
    for (const def of ["crucible", "wardworks"]) {
      for (const s of abilityText(def).sentences) {
        expect(banned(s), `${def}: ${s}`).toEqual([]);
        expect(s, def).toMatch(/^[A-Z].*\.$/);
        for (const [w, font] of WIDTHS) for (const line of wrapText(s, w, font)) expect(textWidth(line, font), `${def} ${w}/${font}: ${line}`).toBeLessThanOrEqual(w);
      }
      expect(gist(def)).not.toBe("");
      expect(nextStarText(def, 1)).toBeNull(); // a signature never merges
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

  it("a placed CRUCIBLE's or WARDWORKS' panel shows those sentences and the tip, no stars and no TO CARGO", () => {
    for (const [hero, def] of [["foundry", "crucible"], ["bastion", "wardworks"]] as const) {
      const run = newRun(hero, 3);
      const sig = run.build.items.find((p) => p.def === def)!;
      const p = itemPanel(run, sig.uid)!;
      const text = p.body.map((b) => b.text);
      for (const s of abilityText(def).sentences) expect(text, `${def}: ${s}`).toContain(s);
      expect(text.join(" ")).toContain(flavour(def)[0]);
      expect(p.labels).toEqual([]);
      expect(p.title).toBe(ITEMS[def].name);
    }
  });

  it("FURNACE's KILN and WEAVER's LOOM keep their catalogue desc and no ability text (their screens unchanged)", () => {
    for (const def of ["kiln", "loom"]) {
      expect(hasAbilityText(def), def).toBe(false);
      expect(flavour(def), def).toEqual([ITEMS[def].desc.join(" ")]);
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
