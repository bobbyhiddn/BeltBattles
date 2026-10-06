// 0.8.0 RC M3 (REQ-BFG-011): the version label is the same in every place that carries it, so none can be left behind
// (src/version.ts says "keep in step with package.json", and nothing checked it): the title screen's VERSION, the
// package's version and package-lock.json's two root fields.
// 0.8.1 (the phone controls, REQ-BFG-034 to 037) is a UI-only release on 0.8.0's rules: the label moves to 0.8.1 and
// the rules stay bb-0.8.0, so the live ghosts and uploads stay valid. A battle change gets its own rules version.
// 0.8.2 (the title screen on phones, REQ-BFG-038) is UI-only too: the label moves to 0.8.2 and the rules stay bb-0.8.0.
// 0.8.3 (a part's whole description on a phone tap, REQ-BFG-034/035) is UI-only too, built on 0.8.2: the label moves to
// 0.8.3 and the rules stay bb-0.8.0.
// 0.8.4 (a roomier build screen on phones, REQ-BFG-040) is UI-only too, built on 0.8.3: the label moves to 0.8.4 and
// the rules stay bb-0.8.0.
// 0.8.5 is BELTS (REQ-BFG-043, REQ-BFG-044), built on 0.8.4: it changes battles (belt slots by level, the hero's two
// gold upgrades), so the rules move to bb-0.8.3, and the label moves to 0.8.5.
// 0.8.6 is PACKS (REQ-BFG-051, REQ-BFG-063), built on 0.8.5: it changes battles (the belt and armor packs) and the
// uploads (a required player name), so the rules move to bb-0.8.6, and the label moves to 0.8.6.
// 0.8.7 is RUNES (REQ-BFG-058), built on 0.8.6: the runes change battles and the uploads, so the rules move to bb-0.8.7
// (with bb-0.8.6's seed and stand-in pools carried, content.ts POOL_RULES_CARRIED), and the label moves to 0.8.7.
// 0.8.8 (the card faces, REQ-BFG-045) is UI-only, built on 0.8.7: the label moves to 0.8.8 and the rules stay bb-0.8.7.
// 0.8.9 (the captains' catch-up, REQ-BFG-024 and REQ-BFG-051, and U2f's card fixes, REQ-BFG-070 and REQ-BFG-046), built
// on 0.8.8: the captains' road decks buy ARMOR PACKs, but the battle sim, the upload check and the pools don't move, so
// the label moves to 0.8.9 and the rules stay bb-0.8.7.
// 0.9.0 is release X (whole numbers, sustain and the bots' runes; REQ-BFG-047, REQ-BFG-069, REQ-BFG-058) with Y1's card
// faces (REQ-BFG-070, REQ-BFG-046): the battles, the pools and the upload check change, so FLIP-X2 moved the rules once
// to bb-0.9.0 (nothing carried), and the label moves to 0.9.0.
// 0.9.1 is the hero balance pass (REQ-BFG-069, REQ-BFG-058): the hulls, the KILN's HEAT and FURNACE's four runes change
// battles, the pools and the upload check, so BAL-2 moved the rules once to bb-0.9.1 (nothing carried), and the label
// moves to 0.9.1.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { VERSION } from "../src/version";
import { RULES_VERSION } from "../src/sim/content";

const json = (f: string) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), "utf8")) as { version: string; packages?: Record<string, { version?: string }> };

describe("the 0.9.1 label", () => {
  it("is 0.9.1 on the title screen (VERSION), in package.json and in package-lock.json's two root fields; the rules are Y7b2's bb-0.9.3 (BAL-2's were bb-0.9.1, release X's bb-0.9.0, RUNES-1's bb-0.8.7, PACKS's bb-0.8.6)", () => {
    const pkg = json("package.json"), lock = json("package-lock.json");
    expect([VERSION, pkg.version, lock.version, lock.packages?.[""]?.version]).toEqual(["0.9.1", "0.9.1", "0.9.1", "0.9.1"]);
    expect(RULES_VERSION).toBe("bb-0.9.3") /* Y7b2: the bump (was bb-0.9.1; BAL-2: was bb-0.9.0; FLIP-X2: was bb-0.8.7) */; // 0.8.6 played PACKS's bb-0.8.6; RUNES changes battles, so it bumps the rules
  });
});
