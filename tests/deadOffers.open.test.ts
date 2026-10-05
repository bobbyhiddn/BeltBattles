// NUM-2 (REQ-BFG-047; cap's oracle ec91a967c21f4c7b, item 3): the tripwire of the dead-offer audit's open reasons. NUM-1's
// num1Open and NUM-2's num2Open are provisional (3cf09080186f8f84): R6's RULES_VERSION bump may not ship with any of them.
// NUM-3 (cap's call in REVIEW-SUSA.md): its num3Open rows (SIFTER, every hero, days 1-10) are under the same tripwire.
// FLIP-X2 (REVIEW-NUM3 answer 2): SIFTER is dormant, so its 60 num3Open rows and the num3Open reason are gone.
// Under today's rules version this lists them; once RULES_VERSION differs from it, any open reason left fails here.
import { describe, expect, it } from "vitest";
import { RULES_VERSION, type HeroId } from "../src/sim/content";
import { INERT, reasonOf } from "./deadOffers.inert";

/** The rules version the open reasons were pinned under. */
const OPEN_RULES = "bb-0.8.7";

describe("REQ-BFG-021: the dead-offer audit's open reasons (num1Open, num2Open) end at the next rules version", () => {
  it("no num1Open or num2Open reason remains once RULES_VERSION differs from bb-0.8.7", () => {
    const open: string[] = [];
    for (const [hero, mods] of Object.entries(INERT) as [HeroId, Record<string, number[]>][]) {
      for (const [id, days] of Object.entries(mods)) for (const day of days) {
        const why = reasonOf(hero, id, day);
        if (why === "num1Open" || why === "num2Open") open.push(`${hero} ${id} d${day} ${why}`);
      }
    }
    console.log(`dead-offer audit: ${open.length} open rows (${open.filter((o) => o.endsWith("num1Open")).length} num1Open, ${open.filter((o) => o.endsWith("num2Open")).length} num2Open)`);
    if (RULES_VERSION !== OPEN_RULES) expect(open, `R6 may not bump with open reasons left: ${open.join(", ")}`).toEqual([]);
    else expect(open.length).toBeGreaterThan(0); // today: NUM-1's and NUM-2's provisional rows, listed in the log above
  });
});
