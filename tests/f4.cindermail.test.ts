// BUMP-1F P2 (F4, BUMP-1E REPORT section 11): a deck plated only by CINDER MAIL is a PLATED deck. platedDeck() (src/sim/deck.ts) and holdsPlating()
// (src/render/wave3Moments.ts) counted only `gate.plate`, `factory.plate` and `mod.seam`; CINDER MAIL plates through a `reads` line (give plate: +2/+3/+5
// PLATE for each BURN on the foe), so the belt walk counted PLATE BREAKER's floor on its deck, the inspector's estimate and the rating said "bare", and
// the HUD's plating strip logic did not know it held a source. Now the line counts. cap's call (BRIEF-BUMP1F P2 F4): yes.
import { describe, expect, it } from "vitest";
import { ITEMS } from "../src/sim/content";
import { platedDeck, walkRoute, type Build, type TimelineHit } from "../src/sim/deck";
import { holdsPlating } from "../src/render/wave3Moments";
import { withScaleRigs } from "../src/sim/scale";
import { bench } from "./arsenal.bench";

const hit = (b: Build): TimelineHit => walkRoute(b, 0).timeline.flatMap((r) => r.hits).find((h) => !!h.breaker)!;

describe("BUMP-1F F4: a reader that gives PLATE makes a plated deck", () => {
  it("CINDER MAIL's line is the only plate-giving `reads` line of the catalogue, and it is a rig's", () => {
    const givers = Object.values(ITEMS).filter((d) => d.gate?.reads?.give === "plate" || d.mod?.reads?.give === "plate").map((d) => d.id);
    expect(givers).toEqual(["cindermail"]);
  });

  it("platedDeck and holdsPlating: true with CINDER MAIL on the deck, false without it, at every star", () => {
    for (const stars of [1, 2, 3]) {
      const bare = bench([["whetstone", 4, 3, 1]]), mail = bench([["whetstone", 4, 3, 1], ["cindermail", 4, 2, stars]]);
      expect([platedDeck(bare), holdsPlating(bare)], "bare").toEqual([false, false]);
      expect([platedDeck(mail), holdsPlating(mail)], `CINDER MAIL ★${stars}`).toEqual([true, true]);
    }
  });

  it("the walk counts PLATE BREAKER's big number on a deck plated only by CINDER MAIL, and its floor on the bare deck", () => {
    for (const stars of [1, 2, 3]) {
      const bare = bench([["platebreaker", 4, 3, stars]]), mail = bench([["platebreaker", 4, 3, stars], ["cindermail", 4, 2, 1]]);
      expect(platedDeck(bare)).toBe(false);
      expect(hit(bare).flat, `★${stars} bare`).toBe(hit(bare).breaker!.floor);
      expect(platedDeck(mail)).toBe(true);
      expect(hit(mail).flat, `★${stars} with CINDER MAIL`).toBe(hit(mail).breaker!.flat);
      expect(hit(mail).breaker!.flat).toBeGreaterThan(hit(mail).breaker!.floor);
    }
  });

  it("with the scaling switch off CINDER MAIL is not in the catalogue and plates nothing (the bb-0.11.0 world)", () => {
    withScaleRigs(() => {
      expect(ITEMS.cindermail).toBeUndefined();
      expect(platedDeck(bench([["whetstone", 4, 3, 1]]))).toBe(false);
    }, false);
  });
});
