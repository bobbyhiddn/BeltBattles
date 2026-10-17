// NUM-2 (REQ-BFG-047; cap's oracle ec91a967c21f4c7b, item 3): the tripwire of the dead-offer audit's open reasons. NUM-1's
// num1Open and NUM-2's num2Open are provisional (3cf09080186f8f84): R6's RULES_VERSION bump may not ship with any of them.
// NUM-3 (cap's call in REVIEW-SUSA.md): its num3Open rows (SIFTER, every hero, days 1-10) are under the same tripwire.
// FLIP-X2 (REVIEW-NUM3 answer 2): SIFTER is dormant, so its 60 num3Open rows and the num3Open reason are gone.
// Under today's rules version this lists them; once RULES_VERSION differs from it, any open reason left fails here.
import { describe, expect, it } from "vitest";
import { RULES_VERSION, type HeroId } from "../src/sim/content";
import { INERT, reasonOf } from "./deadOffers.inert";

/** The rules version the open reasons were pinned under. FLIP-X2 step 7 (the brief: carry the rows not classified under a
 *  re-keyed tripwire, reported, for ACCEPT-X): re-keyed to bb-0.9.0 (was bb-0.8.7). The audit re-run on release X's rules
 *  (W/output-flipx2/deadaudit) finds every num1Open and num2Open pair still inert, none live; classifying them needs the
 *  base comparison (3cf09080186f8f84's procedure), which is ACCEPT-X's / R6-X's.
 *  BAL-2 step 7 (the brief: the tripwire re-keyed to bb-0.9.1): re-keyed to bb-0.9.1 (was bb-0.9.0) with the bump; the
 *  audit re-run on 0.9.1's rules is in W/output-bal2/deadaudit.
 *  Y7b2 step 7 (BRIEF-Y7B2: "Re-run the dead-offer audit, with its tripwire re-keyed to bb-0.9.3"): re-keyed to bb-0.9.3
 *  (was bb-0.9.1) with the flip and the bump; the audit re-run on release Y's rules is in T/output-y7b2/deadaudit.
 *  Z-BUMP S5 (BRIEF-ZBUMP: "Re-key the dead-offer audit's tripwire to bb-0.9.7, as Y7b2 step 7 did"): re-keyed to bb-0.9.7
 *  (was bb-0.9.3) with the bump; the audit re-run on release Z's rules is in L/output-zbump/deadaudit.
 *  AZ-BUMP S7 (BRIEF-AZBUMP: "Re-key any other test keyed to bb-0.9.7 that git grep finds (the dead-offer audit and the
 *  like)"): re-keyed to bb-0.10.0 (was bb-0.9.7) with the hull release's bump, as Z-BUMP S5 and Y7b2 step 7 did; the open
 *  rows are the same NUM-1 / NUM-2 provisional rows (the INERT table, tests/deadOffers.inert.ts), still unclassified.
 *  BUMP-1D P6 (typecheck:tests: the old literal made this comparison a type error against RULES_VERSION "bb-0.11.0"): re-keyed
 *  to bb-0.11.0 (was bb-0.10.0) with the 10-wins release's bump, as AZ-BUMP S7 did; the open rows are the same provisional rows. */
const OPEN_RULES = "bb-0.11.0";

describe("REQ-BFG-021: the dead-offer audit's open reasons (num1Open, num2Open) end at the next rules version", () => {
  it("no num1Open or num2Open reason remains once RULES_VERSION differs from bb-0.11.0 (BUMP-1D: re-keyed, was bb-0.10.0; AZ-BUMP: was bb-0.9.7; Z-BUMP: was bb-0.9.3; Y7b2: was bb-0.9.1; BAL-2: was bb-0.9.0; FLIP-X2: was bb-0.8.7)", () => {
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
