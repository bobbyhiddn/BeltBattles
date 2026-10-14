// PLAIN-1F (M6; REQ-BFG-107, REQ-BFG-084; BRIEF-PLAIN1F M6, PLAIN1F-NAMES, READ-4 call 7): PLATE BREAKER's display name is
// SHIELD-FED, a WORKING NAME until the cold read's round C picks among the candidates (one commit swaps it then). The key
// stays platebreaker (saves, snapshots, the server, the phone gist's row); src/ui/gameWords.ts NAMES_KEPT keeps the name
// whole (it holds SHIELD: gameWords would make it WARD-FED). The name fits every surface that draws it: the phone shop card
// (46x42: at most two lines of 3x5 in CARD_W - 4 = 42 px, tests/shopRow.test.ts's rule), the desk's wide card, and the
// panel title (no wider than PLATE BREAKER's was); the cargo strip draws icons only.
import { describe, expect, it } from "vitest";
import { ITEMS } from "../src/sim/content";
import { textWidth } from "../src/render/font";
import { CARD_W, wideCardW } from "../src/screens/build/layout";
import { cardName } from "../src/screens/build/shop";
import { NAMES_KEPT, gameWords } from "../src/ui/gameWords";
import { phoneGist } from "../src/ui/chips";
import { RENAME_NOTICE } from "../src/ui/tips";

const NAME = "SHIELD-FED";

describe("PLAIN-1F (M6): PLATE BREAKER's display name", () => {
  it("is SHIELD-FED; the key stays platebreaker; the kept-name list holds it and gameWords leaves it whole", () => {
    expect(ITEMS.platebreaker.id).toBe("platebreaker");
    expect(ITEMS.platebreaker.name).toBe(NAME);
    expect(Object.values(ITEMS).filter((d) => d.name === "PLATE BREAKER")).toEqual([]);
    expect(NAMES_KEPT).toContain(NAME);
    expect(NAMES_KEPT).not.toContain("PLATE BREAKER");
    expect(gameWords(`A ${NAME} SPENDS PLATING.`)).toBe(`A ${NAME} SPENDS SHIELD.`);
    // the phone card's gist is keyed by id (CARD-5): unchanged by a display name
    expect(phoneGist("platebreaker")).toEqual(["YOUR {PLATE}→{DMG}", phoneGist("platebreaker")![1]]);
    expect(RENAME_NOTICE).not.toContain("BREAKER"); // no rename notice (BUMP-1D's CHANGELOG line tells returning players)
  });

  it("fits the phone shop card, the desk's wide card and the panel title", () => {
    const d = ITEMS.platebreaker;
    const phone = cardName(d, CARD_W - 4);
    expect(phone).toEqual([NAME]); // one line of the 3x5 face
    for (const l of phone) expect(textWidth(l, "3"), l).toBeLessThanOrEqual(CARD_W - 4);
    for (let W = 430; W <= 480; W++) {
      const w = wideCardW(W, 5) - 26, lines = cardName(d, w);
      expect(lines.length, `desk ${W}`).toBeLessThanOrEqual(2);
      for (const l of lines) expect(textWidth(l, "3"), `desk ${W}: ${l}`).toBeLessThanOrEqual(w);
    }
    for (const s of ["", " ★2", " ★3"]) expect(textWidth(`${NAME}${s}`), s).toBeLessThan(textWidth(`PLATE BREAKER${s}`));
    console.log(`PLAIN1F (M6) ${NAME}: phone card ${textWidth(NAME, "3")} px of ${CARD_W - 4}; panel title ${textWidth(`${NAME} ★3`)} px (PLATE BREAKER ★3 ${textWidth("PLATE BREAKER ★3")})`);
  });
});
