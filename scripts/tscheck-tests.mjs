// TSC-369 (backlog #369, REQ-BFG-040): the type-check ratchet for tests/ (cap's ruling Q3 in REVIEW-HOLD363).
// tsconfig.json includes only src/, so `npx tsc --noEmit` never sees tests/. This script runs
//     tsc -p tsconfig.tests.json --noEmit --pretty false
// counts its `error TS` lines, and compares the count with the committed baseline, tests/tsc-tests-baseline.json (the
// total, the count per TS code and the count per file). The total may fall but never grow. Once it reaches 0, this
// script is a plain gate.
// tsconfig.tests.json extends tsconfig.json. It includes tests/ and the project's ambient declarations: src/env.d.ts
// and the Node shims server/node.d.ts, tools/node-smoke.d.ts and tools/node-threads.d.ts. Module resolution brings
// in the src/, server/ and tools/ files the tests import, but never an ambient .d.ts. So an error outside tests/ means
// a declaration is missing from that list: add it there, and never raise the baseline for it.
// Usage:
//   npm run typecheck:tests                      exit 0: the total equals the baseline's or is lower
//                                                exit 1: the total grew; it prints the files and codes that grew
//   npm run typecheck:tests -- --write           the same check, then it rewrites the baseline, never upward
//   npm run typecheck:tests -- --write --force   it rewrites the baseline even upward (a deliberate raise, for review)
// Exit 2: the check itself could not run. tsc did not start or crashed, the config has an error, tsc printed an error
// with no file or a line this script can't read, the baseline is missing or broken, or an argument is unknown.
// It stays out of the vitest suite, because tsc over tests/ is too slow for it. The staging kit runs it as a gate step
// under `nice -n 19` (tsc inherits the priority).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = "tsconfig.tests.json";
const BASELINE = "tests/tsc-tests-baseline.json";
const NAME = "typecheck:tests";
const QUOTE = 40; // the most error lines quoted when the count grew
const USAGE = "usage: npm run typecheck:tests [-- --write [--force]]";
const ABOUT =
  "TSC-369 (backlog #369, REQ-BFG-040): the type errors that `tsc -p tsconfig.tests.json` reports. " +
  "`npm run typecheck:tests` fails when the total grows. Lower it with `npm run typecheck:tests -- --write`; " +
  "never raise it by hand.";

/** The check itself could not run (exit 2). */
class CannotCheck extends Error {}

/** An error with its file, as `--pretty false` prints it: `path(line,col): error TS1234: message`. */
const FILE_ERROR = /^(.+?)\((\d+),(\d+)\): error (TS\d+): /;
/** An error with no file: a config or install problem, never a test's. */
const NO_FILE_ERROR = /^error TS\d+: /;

const own = (m, k) => (Object.hasOwn(m, k) ? m[k] : 0);
const byCode = (a, b) => Number(a.slice(2)) - Number(b.slice(2));
const byPath = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sum = (m) => Object.values(m).reduce((s, n) => s + n, 0);

/** Runs tsc on the tests' config and returns its errors, each with its file, code and line. */
function runTsc() {
  const require = createRequire(import.meta.url);
  let bin, version;
  try {
    bin = require.resolve("typescript/bin/tsc");
    version = require("typescript/package.json").version;
  } catch {
    throw new CannotCheck("typescript is not installed here (run npm ci)");
  }
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [bin, "-p", CONFIG, "--noEmit", "--pretty", "false"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  const seconds = (Date.now() - t0) / 1000;
  if (r.error) throw new CannotCheck(`tsc did not run: ${r.error.message}`);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.signal) throw new CannotCheck(`tsc was stopped by ${r.signal}`);
  if (r.status !== 0 && r.status !== 1 && r.status !== 2) throw new CannotCheck(`tsc exited ${r.status}`);

  const errors = [], noFile = [], unread = [];
  for (const line of r.stdout.split(/\r?\n/)) {
    if (line.trim() === "" || /^\s/.test(line)) continue; // a blank line, or the next line of a long message
    const m = FILE_ERROR.exec(line);
    if (m) errors.push({ file: m[1].replace(/\\/g, "/"), code: m[4], line });
    else if (NO_FILE_ERROR.test(line)) noFile.push(line);
    else unread.push(line);
  }
  const list = (lines) => lines.slice(0, 10).map((l) => `\n  ${l}`).join("");
  if (noFile.length) throw new CannotCheck(`tsc reported ${noFile.length} error(s) with no file, so ${CONFIG} or the install is broken:${list(noFile)}`);
  if (unread.length) throw new CannotCheck(`tsc printed ${unread.length} line(s) this script can't read:${list(unread)}`);
  const config = errors.filter((e) => e.file.endsWith(".json"));
  if (config.length) throw new CannotCheck(`the config has an error:${list(config.map((e) => e.line))}`);
  if (r.status !== 0 && errors.length === 0) throw new CannotCheck(`tsc exited ${r.status} but printed no error`);
  if (r.status === 0 && errors.length > 0) throw new CannotCheck(`tsc exited 0 but printed ${errors.length} errors`);
  return { version, seconds, errors };
}

/** Counts errors by one key, in a stable key order (so a rewrite with the same errors is byte-identical). */
function tally(errors, key, order) {
  const counts = Object.create(null);
  for (const e of errors) counts[e[key]] = (counts[e[key]] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => order(a, b)));
}

/** The committed baseline, or null when there is none. A broken one throws, unless `lenient` (--write --force). */
function readBaseline(lenient) {
  const path = join(ROOT, BASELINE);
  if (!existsSync(path)) return null;
  const broken = (why) => {
    if (lenient) {
      console.log(`${NAME}: note: ${BASELINE} is broken (${why}); --write --force replaces it.`);
      return null;
    }
    throw new CannotCheck(`${BASELINE} is broken: ${why}. Restore it from git, or re-measure it with --write --force.`);
  };
  let b;
  try {
    b = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    return broken(`not JSON: ${e.message}`);
  }
  const counts = (m) => m && typeof m === "object" && !Array.isArray(m) && Object.values(m).every((n) => Number.isInteger(n) && n >= 0);
  if (!b || !Number.isInteger(b.total) || b.total < 0 || !counts(b.byCode) || !counts(b.byFile))
    return broken("it needs a total, byCode and byFile");
  if (sum(b.byCode) !== b.total || sum(b.byFile) !== b.total)
    return broken(`byCode adds up to ${sum(b.byCode)} and byFile to ${sum(b.byFile)}, not to the total ${b.total}`);
  return b;
}

/** What grew from `was` to `now`: [{ key, was, now }]. */
function grown(now, was) {
  return Object.keys(now)
    .filter((k) => now[k] > own(was, k))
    .map((k) => ({ key: k, was: own(was, k), now: now[k] }));
}

function rows(items) {
  const w = Math.max(...items.map((i) => i.key.length));
  return items.map((i) => `    ${i.key.padEnd(w)}  ${i.was} -> ${i.now} (+${i.now - i.was})`).join("\n");
}

/** Prints the comparison with the baseline; returns the exit code (0 held, 1 grew). */
function compare(base, now, errors, run, writing) {
  const how = `(tsc -p ${CONFIG}, TypeScript ${run.version}, ${run.seconds.toFixed(1)} s)`;
  if (base.typescript && base.typescript !== run.version)
    console.log(`${NAME}: note: the baseline was measured with TypeScript ${base.typescript} and this is ${run.version}; a TypeScript change can move the count, so re-measure it.`);
  const files = grown(now.byFile, base.byFile), codes = grown(now.byCode, base.byCode);
  if (now.total > base.total) {
    console.log(`${NAME}: FAIL: ${now.total} type errors, ${now.total - base.total} more than the baseline's ${base.total} ${how}. The count may not grow.`);
    if (files.length) console.log(`  files that grew:\n${rows(files)}`);
    if (codes.length) console.log(`  codes that grew:\n${rows(codes)}`);
    const grownFiles = new Set(files.map((f) => f.key));
    const quoted = errors.filter((e) => grownFiles.has(e.file));
    if (quoted.length) {
      console.log(`  the errors in the files that grew (the new ones are among them):`);
      for (const e of quoted.slice(0, QUOTE)) console.log(`    ${e.line}`);
      if (quoted.length > QUOTE) console.log(`    ... and ${quoted.length - QUOTE} more`);
    }
    console.log(`  Fix the new errors. Raising ${BASELINE} (--write --force) is a release-lane decision.`);
    return 1;
  }
  if (now.total === base.total) console.log(`${NAME}: PASS: ${now.total} type errors, as many as the baseline's ${base.total} ${how}.`);
  else {
    console.log(`${NAME}: PASS: ${now.total} type errors, ${base.total - now.total} fewer than the baseline's ${base.total} ${how}.`);
    if (!writing) console.log(`  Lower the baseline to ${now.total}: run npm run typecheck:tests -- --write, then commit ${BASELINE}.`);
  }
  if (files.length)
    console.log(`  note: ${files.length} file(s) have more errors than the baseline records, offset by fewer elsewhere (--write refreshes the per-file counts):\n${rows(files)}`);
  return 0;
}

/** An error outside tests/ (in a file a test imports) means the config misses an ambient declaration. */
function hintOutside(byFile) {
  const outside = Object.keys(byFile).filter((f) => !f.startsWith("tests/"));
  if (!outside.length) return;
  console.log(`  note: ${outside.length} file(s) outside tests/ have errors: ${outside.slice(0, 5).join(", ")}${outside.length > 5 ? ", ..." : ""}.`);
  console.log(`  That means ${CONFIG} misses an ambient declaration (a .d.ts that file's own config includes): add it to ${CONFIG}'s include list. Never raise the baseline for it.`);
}

/** Rewrites the baseline (never upward without --force); returns the exit code. */
function writeBaseline(base, now, version, force) {
  if (base && now.total > base.total && !force) {
    console.log(`${NAME}: --write did not raise ${BASELINE} from ${base.total} to ${now.total}: it only lowers it. --write --force raises it on purpose.`);
    return 1;
  }
  const path = join(ROOT, BASELINE);
  const doc = { about: ABOUT, typescript: version, total: now.total, byCode: now.byCode, byFile: now.byFile };
  const text = JSON.stringify(doc, null, 2) + "\n";
  if (existsSync(path) && readFileSync(path, "utf8") === text) {
    console.log(`${NAME}: ${BASELINE} is already up to date (${now.total}).`);
    return 0;
  }
  writeFileSync(path, text);
  const what = !base
    ? `written: ${now.total}`
    : now.total < base.total
      ? `lowered from ${base.total} to ${now.total}`
      : now.total > base.total
        ? `RAISED from ${base.total} to ${now.total} (--force)`
        : `rewritten; its total stays ${now.total}`;
  console.log(`${NAME}: ${BASELINE} ${what}. Commit it.`);
  return 0;
}

function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return 0;
  }
  for (const a of argv) if (a !== "--write" && a !== "--force") throw new CannotCheck(`unknown argument "${a}". ${USAGE}`);
  const write = argv.includes("--write"), force = argv.includes("--force");
  if (force && !write) throw new CannotCheck(`--force only goes with --write. ${USAGE}`);

  const base = readBaseline(write && force);
  if (!base && !write) throw new CannotCheck(`there is no ${BASELINE}. Measure one with: npm run typecheck:tests -- --write`);
  const run = runTsc();
  const now = { total: run.errors.length, byCode: tally(run.errors, "code", byCode), byFile: tally(run.errors, "file", byPath) };

  let code = 0;
  if (base) code = compare(base, now, run.errors, run, write);
  else console.log(`${NAME}: ${now.total} type errors (tsc -p ${CONFIG}, TypeScript ${run.version}, ${run.seconds.toFixed(1)} s); no baseline yet.`);
  hintOutside(now.byFile);
  if (!write) return code;
  return writeBaseline(base, now, run.version, force);
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  console.error(`${NAME}: CANNOT CHECK: ${e instanceof CannotCheck ? e.message : (e?.stack ?? e)}`);
  process.exitCode = 2;
}
