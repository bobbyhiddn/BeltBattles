// POLISH-3 (REQ-BFG-089; BRIEF-POLISH3 Q6; the pieces lane's display list, item 1b): GRAPNEL GUN's words say DESTROY and SLUG, never RIP and PAYLOAD. Its face (faces.ts), its ⓘ ladder and its SHOT note
// already said DESTROYS (SHOPCARD-1f F5, PRESENT-1 S2); abilityText.ts still said RIP OFF THE NEAREST PAYLOAD (the kept text), RIPS n PAYLOAD(S) (the gist) and SHOTS RIP SLUGS OFF ENEMY BELTS (the
// card line). The card line is the one-line strip the tap panel takes on a band under 34 px (no real view reaches it); its first wording, SHOTS DESTROY SLUGS ON ENEMY BELTS, takes 3 lines at the
// 69 px card where abilityText.test.ts pins two, so it is SHOTS DESTROY ENEMY SLUGS. chips.ts' `{SLUG}RIP` stays (tests/card5.test.ts and shopChips.test.ts pin it; no importer in src).
import { describe, expect, it } from "vitest";
import { installRaster } from "./raster.helpers";
import { abilityText, cardText, gist } from "../src/ui/abilityText";
import { wideCardW } from "../src/screens/build/layout";
import { CARD_EFFECT_LINES, cardEffectLines } from "../src/screens/build/shop";
import { lineText } from "../src/ui/richText";

installRaster();

describe("POLISH-3 Q6: GRAPNEL GUN says DESTROY, never RIP", () => {
  it("the kept text and the gist, ★1 to ★3: DESTROY(S) and SLUG(S), the reach and the count as before", () => {
    expect([1, 2, 3].map((s) => abilityText("grapnel", s).sentences)).toEqual([
      ["SHOTS THAT HIT AN ENEMY BELT OR RIG DESTROY THE NEAREST SLUG WITHIN 1 TILE."],
      ["SHOTS THAT HIT AN ENEMY BELT OR RIG DESTROY THE 2 NEAREST SLUGS WITHIN 2 TILES."],
      ["SHOTS THAT HIT AN ENEMY BELT OR RIG DESTROY THE 3 NEAREST SLUGS WITHIN 3 TILES."],
    ]);
    expect([1, 2, 3].map((s) => gist("grapnel", s))).toEqual(["DESTROYS 1 SLUG WITHIN 1 TILE", "DESTROYS 2 SLUGS WITHIN 2 TILES", "DESTROYS 3 SLUGS WITHIN 3 TILES"]);
  });

  it("the card line is SHOTS DESTROY ENEMY SLUGS., and it takes the two lines of the 69-70 px card (the first wording, SHOTS DESTROY SLUGS ON ENEMY BELTS, takes three)", () => {
    expect(cardText("grapnel")).toBe("SHOTS DESTROY ENEMY SLUGS.");
    for (const W of [430, 455, 480]) {
      const w = wideCardW(W, 5);
      expect(cardEffectLines(cardText("grapnel"), w).map(lineText), `card ${w}`).toEqual(["SHOTS DESTROY", "ENEMY SLUGS."]);
      expect(cardEffectLines(cardText("grapnel"), w).length).toBeLessThanOrEqual(CARD_EFFECT_LINES);
    }
    expect(cardEffectLines("SHOTS DESTROY SLUGS ON ENEMY BELTS.", wideCardW(430, 5)).length, "the wording that does not fit").toBeGreaterThan(CARD_EFFECT_LINES);
  });

  it("none of its words says RIP or PAYLOAD (the kept text, the gist and the card line, every star)", () => {
    for (const s of [1, 2, 3]) {
      const all = [...abilityText("grapnel", s).sentences, gist("grapnel", s), cardText("grapnel")].join(" ");
      expect(/\bRIPS?\b|PAYLOAD/.test(all), `★${s}: ${all}`).toBe(false);
      expect(all).toContain("DESTROY");
      expect(all).toContain("SLUG");
    }
  });
});
