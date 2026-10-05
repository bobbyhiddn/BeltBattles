// Y2 (release Y; REQ-BFG-070, REQ-BFG-046; DESIGN-Y 1.2 and section 3; REVIEW-STARD rule 6): THE WORDS and THE BOTS' DECK
// RATING with the star switch on (content.ts STAR_RULES, withStarRules).
// - HARASSMENT retires: no glossary row, no tap, and no text of the 12 STUN pieces names it (faces, kept sentences, the
//   shop card's line, the belt timeline); PART is a glossary word with no colour of its own and no token; no new keyword.
// - The rating prices each new rule (deckRating.ts STAR_EQ): LODESTONE by your STUN pieces, TOLLBOOTH x1.25, BRACE FRAME
//   its arrows' share, LIMPET WORKS the same at every star; off, every rating as before.
import { describe, expect, it } from "vitest";
import { withStarRules, type HeroId } from "../src/sim/content";
import { type Build } from "../src/sim/deck";
import { STAR_EQ, rateDeck, stunSources } from "../src/sim/deckRating";
import { starField } from "../src/sim/stars";
import { GLOSSARY, STAR_RETIRED, glossaryEntry, glossaryRows, glossaryText, glossaryWordsIn } from "../src/ui/glossary";
import { abilityText, cardText, hitText } from "../src/ui/abilityText";
import { faceAt, Y2_PIECES } from "../src/ui/faces";
import { levelLines, levelText } from "../src/screens/build/levels";
import { KEYWORDS } from "../src/render/font";
import { bench } from "./arsenal.bench";

const STARS = [1, 2, 3] as const;
const on = <T>(fn: () => T): T => withStarRules(fn);

describe("Y2 words: HARASSMENT retires with the switch on; PART is a plain glossary word", () => {
  it("on, no HARASSMENT row, entry or tap (off: the row and its tap as before)", () => {
    expect(STAR_RETIRED).toEqual(["HARASSMENT", "ONLINE"]); // Y5 (ruling 882ecc77): was ["HARASSMENT"]
    expect(on(() => glossaryRows().map((r) => r.word))).not.toContain("HARASSMENT");
    expect(on(() => glossaryEntry("HARASSMENT"))).toBeUndefined();
    expect(on(() => glossaryWordsIn("ANY HARASSMENT LANDS.").map((r) => r.word))).toEqual([]);
    expect(on(() => glossaryText("HARASSMENT"))).toBeUndefined();
    // off: as before
    expect(glossaryRows().map((r) => r.word)).toContain("HARASSMENT");
    expect(glossaryEntry("HARASSMENT")?.def).toBe("HARASSMENT: ANY {*STUN}, WRECK OR RIP ON AN ENEMY PART.");
    expect(GLOSSARY.map((r) => r.word)).toContain("HARASSMENT");
    // on, every other row stays, in order (Y5: but ONLINE, which Y5 retires)
    expect(on(() => glossaryRows().map((r) => r.word))).toEqual(GLOSSARY.map((r) => r.word).filter((w) => w !== "HARASSMENT" && w !== "ONLINE")); // Y5 (ruling 882ecc77): was .filter((w) => w !== "HARASSMENT")
  });

  it("PART (TOLLBOOTH's tap) is a glossary row with no colour of its own and no token, and no new keyword joins", () => {
    const part = on(() => glossaryEntry("PARTS"))!;
    expect(part.word).toBe("PART");
    expect(part.kw).toBeUndefined();
    expect(part.scope).toBe("text");
    expect(part.colour).toBe(glossaryEntry("COPIES")!.colour); // PLAIN: the line's own colour, as COPIES, JAM, MATCHED
    expect((KEYWORDS as readonly string[]).includes("PART")).toBe(false);
    expect(on(() => glossaryWordsIn("BLOCKS 2 STUN ON ITS BELT'S PARTS.").map((r) => r.word))).toEqual(["STUN", "PART"]);
    expect(on(() => glossaryRows().filter((r) => r.kw).map((r) => r.word))).toEqual(GLOSSARY.filter((r) => r.kw).map((r) => r.word));
  });

  it("on, no text of the 12 names HARASSMENT, wrecks counting, a cap or a perk clause: faces, ⓘ lines, kept sentences, cards, timeline", () => {
    on(() => {
      for (const def of Y2_PIECES) for (const s of STARS) {
        const f = faceAt(def, s)!;
        const texts = [...f.rules.map((r) => r.text), ...levelLines(def, s)!.map((l) => levelText(l)), ...abilityText(def, s).sentences, cardText(def)];
        for (const t of texts) expect(t, `${def} ★${s}`).not.toMatch(/HARASS|WRECKS AND RIPS|MAX \d+ SLUGS|ONLY YOUR BEST|KEG|SALVAGE:|NEXT SHOT \+|RIGS WORKING|ON ITSELF|PLATED|UP TO \d+ DAMAGE|SHRAPNEL:|ALSO STUNS THE TILES|FACTORIES \d+ TIMES|ALWAYS AIMS/);
      }
      expect(hitText({ def: "tollbooth", stars: 1 } as never, "free")).toBe("TOLLBOOTH BLOCKS 2 STUNS");
      expect(hitText({ def: "lodestone", stars: 1 } as never, "free")).toBe("LODESTONE +10 DAMAGE FOR EACH STUNNED MACHINE");
      expect(hitText({ def: "braceframe", stars: 1 } as never, "free")).toBe("BRACE FRAME ENEMY STUNS 50% SHORTER");
    });
    // off: today's words
    expect(cardText("tollbooth")).toBe("BLOCKS 2 HITS OF HARASSMENT.");
    expect(hitText({ def: "tollbooth", stars: 1 } as never, "free")).toBe("TOLLBOOTH BLOCKS 2 HARASSMENT HITS");
  });

  it("on, the kept sentences and cards say the new rules", () => {
    on(() => {
      expect(abilityText("tollbooth", 1).sentences[0]).toBe("BLOCKS THE FIRST 2 ENEMY STUNS ON ITS BELTS AND THEIR FACTORIES EACH BATTLE.");
      expect(abilityText("flak", 1).sentences).toEqual(["SHOOTS DOWN 25% OF THE ENEMY'S STUN SHOTS BEFORE THEY LAND.", "IT GUARDS YOUR WHOLE SHIP; EACH FLAK SCREEN ROLLS ON ITS OWN."]);
      expect(abilityText("lodestone", 1).sentences[0]).toBe("ADDS 10 DAMAGE FOR EACH ENEMY MACHINE STUNNED, BELT TILES TOO.");
      expect(abilityText("braceframe", 2).sentences).toEqual(["ENEMY STUNS ON THE BELT TILES IT HITS LAST 70% SHORTER."]);
      expect(abilityText("scrapper", 3).sentences[1]).toMatch(/ONE MORE EACH TIME YOUR STUN LANDS\.$/);
      expect(cardText("flak")).toBe("SHOOTS DOWN 25% OF STUN SHOTS.");
      expect(cardText("lodestone")).toBe("10 DAMAGE FOR EACH STUN.");
    });
  });
});

describe("Y2 rating: the bots' deck rating prices each new rule (switch on); off, as before", () => {
  const offense = (b: Build, star: boolean): number => withStarRules(() => rateDeck(b).offense, star);
  /** The bench with the KILN swapped for factory `def` at ★`stars` (uid 1), and rigs `gates`. */
  const fb = (def: string, stars = 1, gates: [string, number, number, number][] = []): Build => {
    const b = bench(gates);
    b.items[0] = { uid: 1, def, x: 4, y: 6, ...starField(stars) };
    return b;
  };

  it("stunSources counts the deck's STUN pieces at their stars (on: a LIMPET WORKS has no stall, so it doesn't count)", () => {
    const b: Build = {
      hero: "furnace" as HeroId, beltCap: 30, hullBonus: 0, routes: [],
      items: [{ uid: 1, def: "kiln", x: 0, y: 0 }, { uid: 2, def: "coil", x: 1, y: 1 }, { uid: 3, def: "staticbrush", x: 2, y: 2 },
        { uid: 4, def: "hotswap", x: 3, y: 3 }, { uid: 5, def: "frostbite", x: 5, y: 5 }, { uid: 6, def: "limpet", x: 7, y: 7, stars: 2 },
        { uid: 7, def: "whetstone", x: 9, y: 9 }],
      mods: [{ uid: 8, def: "tesla", turret: 0 }],
    };
    expect([on(() => stunSources(b)), stunSources(b)]).toEqual([5, 6]);
  });

  it("LODESTONE: on, with no STUN piece it adds nothing (off: its floor and 1.5 machines); each STUN piece adds 0.75 x its +10", () => {
    const none = bench(), lode = bench([["lodestone", 4, 3, 1]]);
    expect(offense(lode, true)).toBeCloseTo(offense(none, true), 9);
    expect(offense(lode, false)).toBeGreaterThan(offense(none, false));
    // with one GALVANIC COIL on the belt too: the LODESTONE's part is 0.75 x 1 x 10 a slug, half the base's 1.5 x 10 term
    const coil = bench([["coil", 4, 4, 1]]), both = bench([["coil", 4, 4, 1], ["lodestone", 4, 3, 1]]);
    expect(offense(both, true)).toBeGreaterThan(offense(coil, true));
    expect(STAR_EQ.perStun).toBe(0.75);
  });

  it("TOLLBOOTH: on, its part of the rating is x1.25 the base's", () => {
    const none = bench(), toll = bench([["tollbooth", 4, 3, 1]]);
    const a = offense(toll, true) - offense(none, true), b = offense(toll, false) - offense(none, false);
    expect(b).toBeGreaterThan(0);
    expect(a / b).toBeCloseTo(STAR_EQ.tollFactory, 9);
  });

  it("BRACE FRAME: on, its part is 2/3 of the base's (its L's 2 arrows' tiles, no longer itself)", () => {
    const none = bench(), brace = bench([["braceframe", 4, 3, 1]]);
    const a = offense(brace, true) - offense(none, true), b = offense(brace, false) - offense(none, false);
    expect(b).toBeGreaterThan(0);
    expect(a / b).toBeCloseTo(2 / 3, 9);
  });

  it("LIMPET WORKS: on, the same rating at every star (its 20 moved into the blast); SABOT ★3 rates higher (RATE 20)", () => {
    for (const s of STARS) expect(offense(fb("limpet", s), true), `★${s}`).toBeCloseTo(offense(fb("limpet", s), false), 9);
    expect(offense(fb("sabot", 3), true)).toBeGreaterThan(offense(fb("sabot", 3), false));
    expect(offense(fb("sabot", 2), true)).toBeCloseTo(offense(fb("sabot", 2), false), 9);
  });
});
