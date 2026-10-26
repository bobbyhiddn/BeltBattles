// M1 (BRIEF-M1 Goal 4): the Android app's version, from ONE formula, in one place. The workflow (.github/workflows/android.yml) runs this
// file as a command and passes what it prints to Gradle as -PbbVersionName and -PbbVersionCode (android/app/build.gradle reads them);
// tests/m1.version.test.ts imports the two functions. Plain Node 20+, no dependency.
//
//   versionName = package.json's "version", which must be x.y.z (digits only)
//   versionCode = (major * 10000 + minor * 100 + patch) * 100 + rebuild      rebuild is 0-99, the workflow's input (a re-upload of the same version)
//
//   0.9.13 -> 91300      0.9.13 rebuild 2 -> 91302      1.0.0 -> 1000000      0.9.14 -> 91400
//
// Play wants a positive integer, higher than every earlier upload, at most 2,100,000,000. The formula only grows with the version, and a
// re-upload of one version takes the next rebuild number; minor and patch stop at 99 so the digits never run into each other.
//
// COMMAND (prints three lines for $GITHUB_OUTPUT; a refusal prints one line on stderr and exits 1):
//   node scripts/android-version.mjs [--rebuild N] [--tag android-vX.Y.Z[-rN]] [--package path/to/package.json]
// With --tag, the tag must read android-v<version> (rebuild 0) or android-v<version>-r<N>, <version> equal to package.json's.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Google Play's ceiling for a versionCode. */
export const MAX_VERSION_CODE = 2_100_000_000;

const NUMBER = "(0|[1-9][0-9]*)"; // digits without a leading zero
const VERSION = new RegExp(`^${NUMBER}\\.${NUMBER}\\.${NUMBER}$`);

/** { versionName, versionCode } for a package.json version and a rebuild (a number, or a string of digits such as a workflow input).
 *  Throws an Error that says why on: a version that is not x.y.z, a minor or patch over 99, a rebuild outside 0-99 or not a whole number,
 *  or a code over Play's ceiling. */
export function androidVersion(version, rebuild = 0) {
  const m = VERSION.exec(String(version));
  if (!m) throw new Error(`version "${version}" is not x.y.z (digits only, no leading zeros)`);
  const [major, minor, patch] = [m[1], m[2], m[3]].map(Number);
  if (minor > 99) throw new Error(`version ${version}: the minor ${minor} is over 99`);
  if (patch > 99) throw new Error(`version ${version}: the patch ${patch} is over 99`);
  let r;
  if (typeof rebuild === "string") r = /^(0|[1-9][0-9]?)$/.test(rebuild) ? Number(rebuild) : Number.NaN;
  else r = rebuild;
  if (!Number.isInteger(r) || r < 0 || r > 99) throw new Error(`rebuild ${JSON.stringify(rebuild)} is not a whole number from 0 to 99`);
  const versionCode = (major * 10000 + minor * 100 + patch) * 100 + r;
  if (!Number.isSafeInteger(versionCode) || versionCode > MAX_VERSION_CODE) throw new Error(`version ${version} rebuild ${r}: the code ${versionCode} is over Google Play's ${MAX_VERSION_CODE}`);
  if (versionCode < 1) throw new Error(`version ${version} rebuild ${r}: the code ${versionCode} is not a positive integer, which Google Play wants`);
  return { versionName: `${major}.${minor}.${patch}`, versionCode };
}

/** The rebuild number a release tag asks for: android-v<version> is 0 and android-v<version>-r<N> is N (0-99, no leading zero).
 *  Throws on any other tag, and on one whose <version> is not `version` (package.json's). */
export function rebuildFromTag(tag, version) {
  const m = /^android-v([0-9]+\.[0-9]+\.[0-9]+)(?:-r([0-9]+))?$/.exec(String(tag));
  if (!m) throw new Error(`tag "${tag}" is not android-v<version> or android-v<version>-r<N>`);
  if (m[1] !== version) throw new Error(`tag "${tag}" names version ${m[1]}, but package.json says ${version}`);
  const rebuild = m[2] ?? "0";
  androidVersion(version, rebuild); // the rebuild's own rules (0-99, no leading zero)
  return Number(rebuild);
}

/** The command: argv without node and the script. Returns the text to print. */
export function run(argv, readPackage = (path) => JSON.parse(readFileSync(path, "utf8"))) {
  let rebuild = "0";
  let tag = null;
  let pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--rebuild" || a === "--tag" || a === "--package") {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      if (a === "--rebuild") rebuild = v;
      else if (a === "--tag") tag = v;
      else pkgPath = v;
    } else throw new Error(`unknown argument "${a}"`);
  }
  const version = String(readPackage(pkgPath).version);
  if (tag !== null) rebuild = String(rebuildFromTag(tag, version));
  const { versionName, versionCode } = androidVersion(version, rebuild);
  return `versionName=${versionName}\nversionCode=${versionCode}\nrebuild=${Number(rebuild)}\n`;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    process.stdout.write(run(process.argv.slice(2)));
  } catch (e) {
    process.stderr.write(`android-version: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  }
}
