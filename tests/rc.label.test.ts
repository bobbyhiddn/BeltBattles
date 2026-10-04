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
// BELTS (REQ-BFG-043, REQ-BFG-044), built on 0.8.4, changes battles (belt slots by level, the hero's two gold upgrades),
// so the rules move to bb-0.8.3. The label stays 0.8.4 on this branch: the launch step sets the next one.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { VERSION } from "../src/version";
import { RULES_VERSION } from "../src/sim/content";

const json = (f: string) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), "utf8")) as { version: string; packages?: Record<string, { version?: string }> };

describe("the 0.8.4 label", () => {
  it("is 0.8.4 on the title screen (VERSION), in package.json and in package-lock.json's two root fields; the rules are BELTS's bb-0.8.3", () => {
    const pkg = json("package.json"), lock = json("package-lock.json");
    expect([VERSION, pkg.version, lock.version, lock.packages?.[""]?.version]).toEqual(["0.8.4", "0.8.4", "0.8.4", "0.8.4"]);
    expect(RULES_VERSION).toBe("bb-0.8.3"); // 0.8.4 kept 0.8.0's bb-0.8.0; BELTS changes battles, so it bumps the rules
  });
});
