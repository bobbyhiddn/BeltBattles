// 0.8.0 RC M3 (REQ-BFG-011): the version label is 0.8.0 in every place that carries it, so none can be left behind
// (src/version.ts says "keep in step with package.json", and nothing checked it): the title screen's VERSION, the
// package's version and package-lock.json's two root fields. The rules string is the release's too.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { VERSION } from "../src/version";
import { RULES_VERSION } from "../src/sim/content";

const json = (f: string) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), "utf8")) as { version: string; packages?: Record<string, { version?: string }> };

describe("the 0.8.0 label", () => {
  it("is 0.8.0 on the title screen (VERSION), in package.json and in package-lock.json's two root fields; the rules are bb-0.8.0", () => {
    const pkg = json("package.json"), lock = json("package-lock.json");
    expect([VERSION, pkg.version, lock.version, lock.packages?.[""]?.version]).toEqual(["0.8.0", "0.8.0", "0.8.0", "0.8.0"]);
    expect(RULES_VERSION).toBe(`bb-${VERSION}`); // 0.8.0 ships its own rules version (a battle change)
  });
});
