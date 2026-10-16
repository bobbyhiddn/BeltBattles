// TXT-095 (ii) (REQ-BFG-070, REQ-BFG-046; BeltBattles 0.9.5, display only; ACCEPT-093's tooltip finding): the shop card's
// hover tooltip (chrome.ts) reads faces first, as the pack tooltip does: the face's first rule line (faceLines with the run's
// TextOpts, as its panel draws the face), else the kept text's opening sentence (shop.ts offerTooltip). The audit behind it
// (every buyable def and pack at ★1-★3, sentences[0] beside the face's first rule line, and what textOpts changes) is
// TXT-095's REPORT (W/kit-txt095/audit095.ts): textOpts changes sentences[0] only for the 4 cores whose numbers scale with
// the gun (PRESSURE, SALVO, CAPACITOR, ANVIL), and their face lines say the same number with the same TextOpts.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ITEMS, PACK_IDS, PACK_ITEM, buyableModules, classFactor, type HeroId } from "../src/sim/content";
import { effectAt } from "../src/sim/stars";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { lineWidth } from "../src/ui/richText";
import { abilityText } from "../src/ui/abilityText";
import { faceLines, hasFace } from "../src/ui/faces";
import { plainRigStats } from "../src/ui/faces"; // CARD-2 (REQ-BFG-084, K6): the plain rigs' tooltip
import { statRow } from "../src/ui/icons"; // CARD-2 (K6)
import { TOOLTIP_TEXT_W, drawTooltip, offerTooltip, tooltipLines } from "../src/screens/build/shop";
import { G, fresh, installRaster } from "./raster.helpers";

const STARS = [1, 2, 3];
/** Every TextOpts a run gives (inspector.ts textOpts: its first gun's class factor, its hero) and none. */
const ks = [...new Set([1, ...Object.values(ITEMS).filter((d) => d.kind === "turret").flatMap((d) => STARS.map((s) => classFactor(effectAt(d.id, s).turret!)))])];
const ctxs = [{}, ...ks.flatMap((k) => PLAYABLE_HEROES.map((hero) => ({ k, hero: hero as HeroId })))];
const DEFS = [...buyableModules().map((d) => d.id), ...PACK_IDS.map((p) => PACK_ITEM[p])];

describe("TXT-095 (ii): the shop card's hover tooltip reads faces first, as the pack's (REQ-BFG-070, REQ-BFG-046)", () => {
  it("it is the face's first rule line where the piece's face has one, else the kept opening sentence; the run's numbers both ways", () => {
    let ruled = 0, unruled = 0;
    const without = new Set<string>();
    for (const def of DEFS) for (const o of ctxs) {
      const tip = offerTooltip(def, o), id = `${def} ${JSON.stringify(o)}`;
      const rule = faceLines(def, 1, o)?.rules[0]?.text;
      // CARD-2 (REQ-BFG-084, K6): a plain stat rig's tooltip is its plain face, the panel's stat row (was its HIT: rule)
      const plain = plainRigStats(def, 1);
      if (plain) {
        expect(tip, id).toBe(statRow(plain));
        ruled++;
      } else if (rule !== undefined) {
        expect(tip, id).toBe(rule);
        ruled++;
      } else {
        expect(tip, id).toBe(abilityText(def, 1, o).sentences[0]);
        without.add(def);
        unruled++;
      }
      expect(tip, id).not.toBe("");
    }
    // every buyable piece and pack has a face; 17 faces are a stat row with no rule line (the 4 factories PRESS, DOUBLE
    // STAMP, GANTRY and DRAG CHAIN, and the 13 guns): their tooltip keeps the kept opening sentence, as before
    expect(DEFS.filter((d) => !hasFace(d))).toEqual([]);
    expect([...without].sort()).toEqual(["bombard", "carronade", "dartgun", "deckgun", "doublestamp", "dragchain", "gantry", "hailgun",
      "press", "railgun", "rampart", "scrapcannon", "siegegun", "spikegun", "swivel", "thunderer", "twinneedle"]);
    expect([ruled, unruled]).toEqual([(DEFS.length - 17) * ctxs.length, 17 * ctxs.length]);
    // a core's number is the run's gun's: SALVO RACK on a light gun (k 0.55) reads its face's +11, not the heavy gun's +20
    expect(offerTooltip("salvo", { k: 0.55 })).toBe(faceLines("salvo", 1, { k: 0.55 })!.rules[0].text);
    expect(offerTooltip("salvo", { k: 0.55 })).not.toBe(offerTooltip("salvo", { k: 1 }));
  });

  // SHOPCARD-1 (REQ-BFG-115, F5): the card shows no words, so chrome.ts draws the tooltip with the offer's whole face (offerFace:
  // every line the tap panel's face draws; tests/shopcard1.test.ts pins it line for line); offerTooltip (the first rule line
  // alone) stays pinned above as data. Was: drawTooltip(g, L.cards[idx], ITEMS[o.def], L.W, offerTooltip(o.def, textOpts(s.run))).
  it("chrome.ts draws the whole face at the shop card (no more sentences[0] there); the pack tooltip's line is as before", () => {
    const src = readFileSync("src/screens/build/chrome.ts", "utf8");
    expect(src).toContain("drawTooltip(g, L.cards[idx], ITEMS[o.def], L.W, offerFace(o.def, textOpts(s.run)), L.H);");
    expect(src).not.toContain("abilityText(o.def, 1, textOpts(s.run)).sentences[0]");
    // AZ-PREP (REVIEW-HULL1D Q3): the pack tooltip's line, face first then its sentence, now on the run's day (chrome.ts
    // packTip; was faceLines(def, 1)?.rules[0]?.text ?? abilityText(def, 1, textOpts(s.run)).sentences[0] ?? "")
    expect(src).toContain("faceLines(def, 1, textOpts(run))?.rules[0]?.text ?? abilityText(def, 1, textOpts(run)).sentences[0] ?? \"\"");
  });

  it("every offer's tooltip wraps inside its 150 px and draws inside the desk's 640 px build view", () => {
    installRaster();
    for (const def of DEFS) for (const o of [{}, { k: 1, hero: "furnace" as HeroId }, { k: 0.4, hero: "weaver" as HeroId }]) {
      const tip = offerTooltip(def, o), id = `${def} ${JSON.stringify(o)}`;
      const lines = tooltipLines(tip);
      expect(lines.length, id).toBeGreaterThan(0);
      for (const l of lines) expect(lineWidth(l, "3"), id).toBeLessThanOrEqual(TOOLTIP_TEXT_W);
      const c = fresh(640, 360);
      drawTooltip(G(c), { x: 560, y: 40, w: 44, h: 60 }, ITEMS[def], 640, tip);
      expect(c.oob, id).toBe(0);
    }
  });
});
