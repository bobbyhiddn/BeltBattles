// M2 (BRIEF-M2 Goal 2): the iPhone app's version and what a tag asks for, in one place. The workflow (.github/workflows/ios.yml) runs this file
// as a command in its first job; tests/m2.workflows.test.ts imports the functions. Plain Node 20+, no dependency. It does not touch
// scripts/android-version.mjs (iOS has no versionCode formula: the build number comes from TestFlight, see ios/App/fastlane/Fastfile).
//
//   marketing version (CFBundleShortVersionString) = package.json's "version", which must be x.y.z (digits only, no leading zeros)
//   build number      (CFBundleVersion)            = the latest TestFlight build + 1 (the lane asks App Store Connect), and 1 for the smoke test
//
// TAGS (the workflow runs on pushed tags ios-v* and ios-smoke-*, and by hand):
//   ios-v<version>     a release: <version> must equal package.json's, or the run refuses (so a tag never names a version it did not build)
//   ios-smoke-<label>  a dry run: always the unsigned Simulator smoke test, no version match (it never uses up a version tag)
//   no tag (a manual run) is a release run of package.json's version
//
// COMMAND (prints two lines for $GITHUB_OUTPUT; a refusal prints one line on stderr and exits 1):
//   node scripts/ios-version.mjs [--tag ios-vX.Y.Z | ios-smoke-LABEL] [--package path/to/package.json]

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const NUMBER = "(0|[1-9][0-9]*)"; // digits without a leading zero
const VERSION = new RegExp(`^${NUMBER}\\.${NUMBER}\\.${NUMBER}$`);
const RELEASE_TAG = /^ios-v([0-9]+\.[0-9]+\.[0-9]+)$/;
const SMOKE_TAG = /^ios-smoke-[A-Za-z0-9._-]+$/;

/** The marketing version for a package.json version: the version itself, if it is x.y.z (digits only, no leading zeros).
 *  Throws an Error that says why if it is not (App Store Connect wants one to three period-separated integers; the game uses three). */
export function iosVersion(version) {
  const m = VERSION.exec(String(version));
  if (!m) throw new Error(`version "${version}" is not x.y.z (digits only, no leading zeros)`);
  return { marketingVersion: `${Number(m[1])}.${Number(m[2])}.${Number(m[3])}` };
}

/** What a pushed tag asks for: "release" (ios-v<version>, <version> equal to `version`) or "smoke" (ios-smoke-<label>, any label).
 *  Throws on any other tag, and on a release tag that names another version. */
export function kindFromTag(tag, version) {
  const t = String(tag);
  if (SMOKE_TAG.test(t)) return "smoke";
  const m = RELEASE_TAG.exec(t);
  if (!m) throw new Error(`tag "${t}" is not ios-v<version> or ios-smoke-<label>`);
  if (m[1] !== version) throw new Error(`tag "${t}" names version ${m[1]}, but package.json says ${version}`);
  return "release";
}

/** The command: argv without node and the script. Returns the text to print. */
export function run(argv, readPackage = (path) => JSON.parse(readFileSync(path, "utf8"))) {
  let tag = null;
  let pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tag" || a === "--package") {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      if (a === "--tag") tag = v;
      else pkgPath = v;
    } else throw new Error(`unknown argument "${a}"`);
  }
  const version = String(readPackage(pkgPath).version);
  const { marketingVersion } = iosVersion(version);
  const kind = tag === null ? "release" : kindFromTag(tag, version);
  return `version=${marketingVersion}\nkind=${kind}\n`;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    process.stdout.write(run(process.argv.slice(2)));
  } catch (e) {
    process.stderr.write(`ios-version: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  }
}
