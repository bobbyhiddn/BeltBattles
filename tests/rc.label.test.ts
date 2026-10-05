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
// RUNES (REQ-BFG-058), built on 0.8.6: the runes change battles and the uploads, so the rules move to bb-0.8.7; the label
// stays 0.8.6 until the Prime stages 0.8.7.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { VERSION } from "../src/version";
import { RULES_VERSION } from "../src/sim/content";

const json = (f: string) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), "utf8")) as { version: string; packages?: Record<string, { version?: string }> };

describe("the 0.8.6 label", () => {
  it("is 0.8.6 on the title screen (VERSION), in package.json and in package-lock.json's two root fields; the rules are RUNES-1's bb-0.8.7 (PACKS's were bb-0.8.6; the label stays 0.8.6 until the Prime stages 0.8.7)", () => {
    const pkg = json("package.json"), lock = json("package-lock.json");
    expect([VERSION, pkg.version, lock.version, lock.packages?.[""]?.version]).toEqual(["0.8.6", "0.8.6", "0.8.6", "0.8.6"]);
    expect(RULES_VERSION).toBe("bb-0.9.0") /* FLIP-X2: the one bump (was bb-0.8.7) */; // 0.8.6 played PACKS's bb-0.8.6; RUNES changes battles, so it bumps the rules
  });
});
