// TXT-096 (b) (REQ-BFG-046; text only, rules bb-0.9.7 unchanged): the dead desc arrays. The Prime's ruling fd56a6c372070b6d
// (option C): a catalogue desc is display text that lives in content.ts; the ones BRIEF-TXT096 (b)3 names and the other
// HARASS-tagged ones become [] once each is proved drawn nowhere (the test-pinned LIMPET and LODESTONE stay); HOPPER keeps
// a short desc without LOAD TIME, and LOAD TIME leaves ROTARY's too (Y7B2-Q5). Step 6 put two back: BRACE FRAME's and TWIN
// TRIGGER's (LOAD TIME and all), as emptying either turns tests/wave3Art.test.ts:199 red (it holds each wave-3 ITEMS def
// equal to tools/wave3Defs.ts's copy). flavour.ts:174 is the one reader of a desc (src/, server/, tools/), and only for a
// def with no KEPT_FLAVOUR or signature row and no face: this pins that every emptied def keeps its KEPT_FLAVOUR row, so no
// panel can ever fall back to an empty desc.
import { describe, expect, it } from "vitest";
import { ITEMS } from "../src/sim/content";
import { flavour, KEPT_FLAVOUR } from "../src/screens/build/flavour";
import { hasFace } from "../src/ui/faces"; // BUMP-1D: the twelve plain stat rigs' stat-row faces
import { PLAIN_RIG_IDS } from "../src/sim/plainRigs"; // BUMP-1D (PLAIN_RIGS on)
import { SHAPES2_IDS } from "../src/sim/shapes2"; // BUMP-1D (SHAPES2 on)

/** The descs TXT-096 emptied: (b)3's named ones (SCRAPPER, TOLLBOOTH, FLAK SCREEN) and every other HARASS-tagged def but the
 *  test-pinned LIMPET WORKS and LODESTONE and the put-back BRACE FRAME (TWIN TRIGGER, (b)3's too, is put back as well). */
const EMPTIED = [
  "scrapper", "tollbooth", "flak",
  "hotswap", "sabot", "frostbite", "dragchain", "coil", "sifter", "staticbrush", "spotter", "mantlet", "mortar", "grapnel", "tesla", "lance",
];
const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
/** BUMP-1D (PLAIN_RIGS and SHAPES2 on): the twelve plain stat rigs. Each is born with desc [] (a stat-row face and no ability line,
 *  faces.ts), not emptied by TXT-096, and has no KEPT_FLAVOUR row: flavour() returns [] for a piece with a face, so the empty
 *  desc is never read. */
const PLAIN12: string[] = [...PLAIN_RIG_IDS, ...SHAPES2_IDS];

describe("TXT-096 (b): the dead desc arrays (REQ-BFG-046; ruling fd56a6c372070b6d)", () => {
  it("the emptied descs are [], each def keeps its KEPT_FLAVOUR row, and the HARASS-tagged ones left are the two test-pinned and BRACE FRAME", () => {
    for (const id of EMPTIED) {
      expect(ITEMS[id].desc, id).toEqual([]);
      expect(own(KEPT_FLAVOUR, id), `${id}: a KEPT_FLAVOUR row`).toBe(true);
    }
    const harass = Object.values(ITEMS).filter((d) => d.tags?.includes("HARASS")).map((d) => d.id);
    // BUMP-1D: SPARK GAP (PLAIN_RIGS) and SPARK COMB (SHAPES2) are HARASS-tagged too, born with desc [] (PLAIN12), so they are
    // neither TXT-096's emptied nor a def with a desc left: the sweep's own list is the same three (was filter(!EMPTIED))
    expect(harass.filter((id) => !EMPTIED.includes(id) && !PLAIN12.includes(id)).sort()).toEqual(["braceframe", "limpet", "lodestone"]);
    expect(harass.filter((id) => PLAIN12.includes(id)).sort()).toEqual(["sparkcomb", "sparkgap"]);
    for (const id of ["sparkcomb", "sparkgap"]) expect(ITEMS[id].desc, id).toEqual([]);
    for (const id of ["braceframe", "limpet", "lodestone", "twintrigger"]) {
      expect(ITEMS[id].desc.length, id).toBeGreaterThan(0);
      expect(own(KEPT_FLAVOUR, id), `${id}: a KEPT_FLAVOUR row (its desc is drawn nowhere)`).toBe(true);
    }
  });

  it("no def's flavour is an empty desc: every def with an empty desc has a KEPT_FLAVOUR row (VENOM DRIP's since Y6)", () => {
    for (const d of Object.values(ITEMS)) {
      // BUMP-1D: the twelve plain stat rigs have no KEPT_FLAVOUR row; their face is what keeps flavour() off their empty desc
      if (d.desc.join("").trim() === "") expect(own(KEPT_FLAVOUR, d.id) || (PLAIN12.includes(d.id) && hasFace(d.id) && flavour(d.id, 1).length === 0), `${d.id}: its empty desc must never be drawn`).toBe(true);
      for (const line of flavour(d.id, 1)) expect(line.trim(), `${d.id}: a flavour line`).not.toBe("");
    }
  });

  // TXT-AZ (REQ-BFG-070; REVIEW-TXT096 Q2): TWIN TRIGGER's desc says what it does now, with tools/wave3Defs.ts's copy, so
  // LOAD TIME is in no desc (was: TWIN TRIGGER's alone, kept by step 6); tests/txtaz.descs.test.ts pins the two new descs
  it("LOAD TIME is in no catalogue desc (Y7B2-Q5: HOPPER's, ROTARY BREECH's and TWIN TRIGGER's held it; TXT-AZ took the last out)", () => {
    expect(Object.values(ITEMS).filter((d) => /LOAD\s+TIME/.test(d.desc.join(" "))).map((d) => d.id)).toEqual([]);
    expect(ITEMS.hopper.desc.join(" ")).toBe("CHAMBER HOLDS 1 MORE LOAD.");
    expect(ITEMS.rotary.desc.join(" ")).toBe("FIRES OLDEST FIRST; PART-FULL CHAMBERS FIRE 50% SOONER.");
    for (const id of ["hopper", "rotary"]) for (const line of ITEMS[id].desc) expect(line.length, `${id}: ${line}`).toBeLessThanOrEqual(20);
  });
});
