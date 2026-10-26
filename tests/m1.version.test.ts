// M1 (BRIEF-M1 Goal 4): the Android version formula, scripts/android-version.mjs: versionName is package.json's version, versionCode =
// (major*10000 + minor*100 + patch)*100 + rebuild with rebuild 0-99 (0.9.13 -> 91300). One formula in node; the workflow runs it as a
// command and Gradle gets its two numbers as -P properties.
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MAX_VERSION_CODE, androidVersion, rebuildFromTag, run } from "../scripts/android-version.mjs";
import { VERSION } from "../src/version";

const ROOT = new URL("..", import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string };

describe("M1 Goal 4: the version formula", () => {
  it("the brief's examples: 0.9.13 is 91300, 0.9.13 rebuilt twice is 91302, 1.0.0 is 1000000, 0.9.14 is 91400", () => {
    expect(androidVersion("0.9.13")).toEqual({ versionName: "0.9.13", versionCode: 91300 });
    expect(androidVersion("0.9.13", 2)).toEqual({ versionName: "0.9.13", versionCode: 91302 });
    expect(androidVersion("1.0.0")).toEqual({ versionName: "1.0.0", versionCode: 1000000 });
    expect(androidVersion("0.9.14").versionCode).toBe(91400);
  });

  it("is (major*10000 + minor*100 + patch)*100 + rebuild, and grows with the version and with the rebuild", () => {
    expect(androidVersion("0.0.1").versionCode).toBe(100);
    expect(androidVersion("0.0.0", 1).versionCode).toBe(1);
    expect(() => androidVersion("0.0.0")).toThrow(/not a positive integer/); // Play wants a positive code
    expect(androidVersion("1.2.3", 45).versionCode).toBe((10000 + 200 + 3) * 100 + 45);
    expect(androidVersion("0.99.99", 99).versionCode).toBe(999999);
    expect(androidVersion("1.0.0", 0).versionCode).toBe(androidVersion("0.99.99", 99).versionCode + 1); // digits never run into each other
    let last = -1;
    for (const v of ["0.9.12", "0.9.13", "0.9.14", "0.10.0", "0.99.99", "1.0.0", "1.0.1", "1.1.0", "2.0.0"]) {
      const code = androidVersion(v).versionCode;
      expect(code, v).toBeGreaterThan(last);
      last = code;
    }
    for (let r = 1; r <= 99; r++) expect(androidVersion("0.9.13", r).versionCode).toBe(androidVersion("0.9.13", r - 1).versionCode + 1);
    // far below Play's ceiling for any real version
    expect(androidVersion("20.99.99", 99).versionCode).toBeLessThan(MAX_VERSION_CODE);
    expect(MAX_VERSION_CODE).toBe(2_100_000_000);
  });

  it("takes the rebuild as a number or as the digits a workflow input arrives as", () => {
    expect(androidVersion("0.9.13", "0").versionCode).toBe(91300);
    expect(androidVersion("0.9.13", "7").versionCode).toBe(91307);
    expect(androidVersion("0.9.13", "99").versionCode).toBe(91399);
    expect(androidVersion("0.9.13", undefined).versionCode).toBe(91300);
  });

  it("refuses a version that is not x.y.z", () => {
    for (const v of ["", "1", "1.2", "1.2.3.4", "v1.2.3", "1.2.3-beta", "1.2.3+1", "1.2.x", "01.2.3", "1.02.3", "1.2.03", " 1.2.3", "1.2.3 ", "1.2.3\n", "-1.2.3", "1,2,3", "one.two.three"]) {
      expect(() => androidVersion(v), JSON.stringify(v)).toThrow(/not x\.y\.z/);
    }
  });

  it("refuses a minor or a patch over 99, and a code over Play's ceiling", () => {
    expect(() => androidVersion("1.100.0")).toThrow(/minor 100 is over 99/);
    expect(() => androidVersion("1.0.100")).toThrow(/patch 100 is over 99/);
    expect(androidVersion("1.99.99").versionCode).toBe((10000 + 9900 + 99) * 100);
    expect(() => androidVersion("99999.0.0")).toThrow(/over Google Play's 2100000000/);
    expect(androidVersion("2099.0.0").versionCode).toBeLessThanOrEqual(MAX_VERSION_CODE);
    expect(androidVersion("2100.0.0").versionCode).toBe(MAX_VERSION_CODE); // exactly the ceiling: allowed
    expect(() => androidVersion("2100.0.1")).toThrow(/over Google Play's/);
  });

  it("refuses a rebuild outside 0-99, a fraction, and anything that is not a whole number", () => {
    for (const r of [-1, 100, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "-1", "100", "1.5", "01", "007", "1e1", "0x10", "", " 2", "2 ", "abc", "2\n"]) {
      expect(() => androidVersion("0.9.13", r), JSON.stringify(r)).toThrow(/rebuild .* is not a whole number from 0 to 99/);
    }
  });

  it("src/version.ts's VERSION (the title's V0.9.13) is package.json's version, the one the Android versionName takes", () => {
    expect(VERSION).toBe(pkg.version);
    expect(androidVersion(pkg.version).versionName).toBe(VERSION);
    // the formula as this test spells it on its own, so a version bump (0.9.14 is 91400) needs no edit here
    const [major, minor, patch] = pkg.version.split(".").map(Number);
    expect(androidVersion(pkg.version).versionCode).toBe((major * 10000 + minor * 100 + patch) * 100);
  });
});

describe("M1 Goal 4: the release tag", () => {
  it("android-v<version> is rebuild 0, android-v<version>-r<N> is N", () => {
    expect(rebuildFromTag("android-v0.9.13", "0.9.13")).toBe(0);
    expect(rebuildFromTag("android-v0.9.13-r1", "0.9.13")).toBe(1);
    expect(rebuildFromTag("android-v0.9.13-r2", "0.9.13")).toBe(2);
    expect(rebuildFromTag("android-v0.9.13-r99", "0.9.13")).toBe(99);
    expect(rebuildFromTag("android-v0.9.13-r0", "0.9.13")).toBe(0);
  });

  it("refuses a tag for another version than package.json's, and every other tag", () => {
    expect(() => rebuildFromTag("android-v0.9.14", "0.9.13")).toThrow(/names version 0\.9\.14, but package\.json says 0\.9\.13/);
    expect(() => rebuildFromTag("android-v1.0.0-r1", "0.9.13")).toThrow(/package\.json says 0\.9\.13/);
    for (const t of ["android-0.9.13", "android-v0.9.13-r", "android-v0.9.13-rc1", "android-v0.9.13-r100", "android-v0.9.13-r02", "android-v0.9.13-r-1", "android-v0.9", "android-v0.9.13.1", "v0.9.13", "refs/tags/android-v0.9.13", "android-v0.9.13 ", "android-v0.9.13\n", "Android-v0.9.13", "android-v0.9.13-r1-r2", ""]) {
      expect(() => rebuildFromTag(t, "0.9.13"), JSON.stringify(t)).toThrow();
    }
  });
});

describe("M1 Goal 4: the command the workflow runs", () => {
  const pkgOf = (version: string) => () => ({ version });

  it("prints the three lines the workflow appends to $GITHUB_OUTPUT", () => {
    expect(run([], pkgOf("0.9.13"))).toBe("versionName=0.9.13\nversionCode=91300\nrebuild=0\n");
    expect(run(["--rebuild", "3"], pkgOf("1.2.3"))).toBe("versionName=1.2.3\nversionCode=1020303\nrebuild=3\n");
    expect(run(["--tag", "android-v0.9.13-r2"], pkgOf("0.9.13"))).toBe("versionName=0.9.13\nversionCode=91302\nrebuild=2\n");
    expect(run(["--tag", "android-v1.0.0"], pkgOf("1.0.0"))).toBe("versionName=1.0.0\nversionCode=1000000\nrebuild=0\n");
  });

  it("refuses with an Error that says why: a bad tag, a bad rebuild, an unknown argument, a missing value, a package.json version that is not x.y.z", () => {
    expect(() => run(["--tag", "android-v9.9.9"], pkgOf("0.9.13"))).toThrow(/package\.json says 0\.9\.13/);
    expect(() => run(["--rebuild", "100"], pkgOf("0.9.13"))).toThrow(/rebuild/);
    expect(() => run(["--bogus"], pkgOf("0.9.13"))).toThrow(/unknown argument/);
    expect(() => run(["--rebuild"], pkgOf("0.9.13"))).toThrow(/needs a value/);
    expect(() => run([], pkgOf("0.9"))).toThrow(/not x\.y\.z/);
    expect(() => run([], () => ({}))).toThrow(/not x\.y\.z/);
  });

  it("as a real command on this repo's package.json: the three lines on stdout, exit 0; a refusal is one line on stderr and exit 1", () => {
    const script = join(ROOT, "scripts/android-version.mjs");
    const ok = spawnSync(process.execPath, [script], { cwd: ROOT, encoding: "utf8" });
    expect(ok.status).toBe(0);
    expect(ok.stdout).toBe(`versionName=${pkg.version}\nversionCode=${androidVersion(pkg.version).versionCode}\nrebuild=0\n`);
    const tagged = spawnSync(process.execPath, [script, "--tag", `android-v${pkg.version}-r2`], { cwd: ROOT, encoding: "utf8" });
    expect(tagged.stdout).toContain(`versionCode=${androidVersion(pkg.version, 2).versionCode}`);
    const bad = spawnSync(process.execPath, [script, "--tag", "android-v0.0.1"], { cwd: ROOT, encoding: "utf8" });
    expect(bad.status).toBe(1);
    expect(bad.stdout).toBe("");
    expect(bad.stderr.trim().split("\n")).toHaveLength(1);
    expect(bad.stderr).toMatch(/^android-version: tag "android-v0\.0\.1" names version 0\.0\.1/);
    const bad2 = spawnSync(process.execPath, [script, "--rebuild", "250"], { cwd: ROOT, encoding: "utf8" });
    expect(bad2.status).toBe(1);
  });
});
