// M2 (BRIEF-M2 Goal 2 and 4): the two iOS workflows and scripts/ios-version.mjs. There is no macOS runner, Xcode or Ruby on the dev host, so the
// macOS jobs cannot run here. What can run does: the workflow files are read by a small YAML reader (the subset they use), every `run:` block is
// syntax-checked by bash, and the two Linux jobs' scripts (the one that picks the path, and the one that checks the secrets) are RUN, with the real
// version script, for every case: no secrets, all six, some, a smoke tag, a release tag that matches and one that does not.
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { iosVersion, kindFromTag, run as runVersion } from "../scripts/ios-version.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const pkg = JSON.parse(read("package.json")) as { version: string };
const cfg = JSON.parse(read("capacitor.config.json")) as { appId: string };

/** The six signing secrets (the report explains each, and the eleven of the operator's seventeen that are not needed). */
const SECRETS = ["APPLE_KEY_ID", "APPLE_ISSUER_ID", "APPLE_KEY_CONTENT", "DEVELOPER_PORTAL_TEAM_ID", "MATCH_GIT_URL", "MATCH_PASSWORD"];

// ------------------------------------------------------------------ a small YAML reader (the subset the workflows use)

type Y = string | number | boolean | null | Y[] | { [key: string]: Y };
type YMap = { [key: string]: Y };

/** Reads block YAML: mappings, sequences (also "- key: value" items), plain, "double" and 'single' quoted scalars, and `|` block scalars; full-line
 *  comments are skipped. It refuses what it does not read (flow collections, anchors, folded scalars, a trailing comment, a duplicate key), so a
 *  workflow edit that leaves the subset fails here rather than being read wrongly. */
function parseYaml(src: string, name: string): YMap {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  const fail = (msg: string): never => { throw new Error(`${name}:${i + 1}: ${msg}`); };
  const indentOf = (l: string): number => l.length - l.trimStart().length;
  const skippable = (l: string): boolean => l.trim() === "" || l.trim().startsWith("#");
  const next = (): number => { while (i < lines.length && skippable(lines[i])) i++; return i < lines.length ? indentOf(lines[i]) : -1; };
  const isDash = (t: string): boolean => t.startsWith("- ") || t === "-";

  const scalar = (raw: string): Y => {
    const s = raw.trim();
    if (s.startsWith('"')) {
      const m = /^"((?:[^"\\]|\\.)*)"$/.exec(s);
      if (!m) return fail(`a bad double-quoted scalar: ${s}`);
      return JSON.parse(`"${m[1]}"`) as string;
    }
    if (s.startsWith("'")) {
      const m = /^'((?:[^']|'')*)'$/.exec(s);
      if (!m) return fail(`a bad single-quoted scalar: ${s}`);
      return m[1].replace(/''/g, "'");
    }
    if (/^[[{&*>!%@`]/.test(s)) return fail(`a YAML form this reader does not read: ${s}`);
    if (/\s#/.test(s)) return fail(`a trailing comment: ${s}`);
    if (s === "" || s === "null" || s === "~") return null;
    if (s === "true") return true;
    if (s === "false") return false;
    if (/^-?\d+$/.test(s)) return Number(s);
    return s;
  };

  const blockScalar = (parentIndent: number, header: string): string => {
    if (!/^\|[-+]?$/.test(header.trim())) return fail(`a block scalar header this reader does not read: ${header}`);
    const body: string[] = [];
    let blockIndent = -1;
    while (i < lines.length) {
      const l = lines[i];
      if (l.trim() === "") { body.push(""); i++; continue; }
      const ind = indentOf(l);
      if (ind <= parentIndent) break;
      if (blockIndent < 0) blockIndent = ind;
      if (ind < blockIndent) fail("a block scalar line indented less than its first line");
      body.push(l.slice(blockIndent));
      i++;
    }
    while (body.length && body[body.length - 1] === "") body.pop();
    const text = body.join("\n");
    return header.trim() === "|-" ? text : `${text}\n`;
  };

  const parseNode = (indent: number): Y => {
    next();
    return isDash(lines[i].trimStart()) ? parseSeq(indent) : parseMap(indent);
  };

  const parseSeq = (indent: number): Y[] => {
    const out: Y[] = [];
    for (;;) {
      const ni = next();
      if (ni !== indent || !isDash(lines[i].trimStart())) break;
      const rest = lines[i].trimStart().slice(1);
      const after = rest.replace(/^ +/, "");
      const itemIndent = indent + 1 + (rest.length - after.length);
      if (after === "") { i++; out.push(parseNode(next())); continue; }
      if (/^[A-Za-z0-9_][^:]*:( |$)/.test(after)) {
        lines[i] = " ".repeat(itemIndent) + after; // "- key: value": the item is a mapping whose first key sits on the dash line
        out.push(parseMap(itemIndent));
      } else {
        i++;
        out.push(scalar(after));
      }
    }
    return out;
  };

  const parseMap = (indent: number): YMap => {
    const out: YMap = {};
    for (;;) {
      const ni = next();
      if (ni < 0 || ni < indent) break;
      if (ni > indent) return fail("unexpected deeper indent");
      const t = lines[i].trimStart();
      if (isDash(t)) break;
      const m = /^([A-Za-z0-9_.-]+):(?: +(.*))?$/.exec(t);
      if (!m) return fail(`not a "key: value" line: ${t}`);
      if (m[1] in out) fail(`duplicate key ${m[1]}`);
      i++;
      const rest = m[2] ?? "";
      if (rest.startsWith("|")) out[m[1]] = blockScalar(indent, rest);
      else if (rest.trim() === "") {
        const nj = next();
        if (nj > indent || (nj === indent && isDash(lines[i].trimStart()))) out[m[1]] = parseNode(nj);
        else out[m[1]] = null;
      } else out[m[1]] = scalar(rest);
    }
    return out;
  };

  const first = next();
  const doc = first < 0 ? {} : parseNode(first);
  if (next() >= 0) fail("text after the document");
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) fail("the document is not a mapping");
  return doc as YMap;
}

const asMap = (y: Y | undefined, what: string): YMap => {
  if (typeof y !== "object" || y === null || Array.isArray(y)) throw new Error(`${what} is not a mapping`);
  return y;
};
const asList = (y: Y | undefined, what: string): Y[] => {
  if (!Array.isArray(y)) throw new Error(`${what} is not a list`);
  return y;
};
const str = (y: Y | undefined): string => (typeof y === "string" ? y : "");

interface Workflow { doc: YMap; text: string; body: string; lines: string[]; jobs: Record<string, YMap>; }
function load(rel: string): Workflow {
  const text = read(rel);
  const doc = parseYaml(text, rel);
  const lines = text.split("\n").filter((l) => l.trim() !== "" && !l.trim().startsWith("#"));
  const jobs: Record<string, YMap> = {};
  for (const [k, v] of Object.entries(asMap(doc.jobs, "jobs"))) jobs[k] = asMap(v, `job ${k}`);
  return { doc, text, body: lines.join("\n"), lines, jobs };
}
const stepsOf = (job: YMap): YMap[] => asList(job.steps, "steps").map((s, n) => asMap(s, `step ${n}`));
const stepNamed = (job: YMap, re: RegExp): YMap => {
  const found = stepsOf(job).filter((s) => re.test(str(s.name)));
  if (found.length !== 1) throw new Error(`${found.length} steps match ${re}`);
  return found[0];
};
/** Every `run:` script of a job, in order. */
const runsOf = (job: YMap): string[] => stepsOf(job).map((s) => str(s.run)).filter((r) => r !== "");

const ios = load(".github/workflows/ios.yml");
const init = load(".github/workflows/ios-match-init.yml");
// android.yml is M1's file and not read as YAML here: only its `uses:` lines are compared (the action majors), so an edit there cannot break this reader
const android = { body: read(".github/workflows/android.yml").split("\n").filter((l) => l.trim() !== "" && !l.trim().startsWith("#")).join("\n") };

describe("M2 Goal 4: the YAML reader reads what the workflows use, and refuses what it does not", () => {
  it("reads maps, lists, scalars, block scalars and dash-line mappings", () => {
    const y = parseYaml('a: 1\nb:\n  - x: "q: r"\n    y: \'it\'\'s\'\n  - plain text\nc: |\n  line 1\n    line 2\n\n  line 3\nd:\n  e: true\n# comment\nf: ${{ secrets.X != \'\' }}\n', "sample");
    expect(y).toEqual({ a: 1, b: [{ x: "q: r", y: "it's" }, "plain text"], c: "line 1\n  line 2\n\nline 3\n", d: { e: true }, f: "${{ secrets.X != '' }}" });
  });
  it("refuses a duplicate key, a trailing comment, a flow list and a folded scalar", () => {
    expect(() => parseYaml("a: 1\na: 2\n", "x")).toThrow(/duplicate key a/);
    expect(() => parseYaml("a: 1 # no\n", "x")).toThrow(/trailing comment/);
    expect(() => parseYaml("a: [1, 2]\n", "x")).toThrow(/does not read/);
    expect(() => parseYaml("a: >\n  folded\n", "x")).toThrow(/does not read/);
  });
});

describe("M2 Goal 2: .github/workflows/ios.yml: when it runs, who may run it, and what it may touch", () => {
  const on = asMap(ios.doc.on, "on");

  it("runs only on workflow_dispatch (input smoke_only, a boolean that defaults to false) and on pushed tags ios-v* and ios-smoke-*: no branch, no pull request, no schedule, no paths", () => {
    expect(Object.keys(on).sort()).toEqual(["push", "workflow_dispatch"]);
    const inputs = asMap(asMap(on.workflow_dispatch, "workflow_dispatch").inputs, "inputs");
    expect(Object.keys(inputs)).toEqual(["smoke_only"]);
    expect(asMap(inputs.smoke_only, "smoke_only")).toMatchObject({ type: "boolean", default: false, required: false });
    expect(asMap(on.push, "push")).toEqual({ tags: ["ios-v*", "ios-smoke-*"] });
    expect(ios.body).not.toMatch(/branches:|pull_request|schedule:|paths:|workflow_run|release:/);
  });

  it("holds read-only permissions (contents: read) and raises none; no environment, no write-back of a version variable, no GitHub API call", () => {
    expect(ios.doc.permissions).toEqual({ contents: "read" });
    for (const j of Object.values(ios.jobs)) expect(j.permissions, "a job-level permission").toBeUndefined();
    expect(ios.body).not.toMatch(/: write\b|environment:|CURRENT_VERSION|api\.github\.com|\bgh (api|secret|variable)\b|curl |vars\./);
    expect(ios.body).not.toMatch(/git (push|commit|tag|add)|gh release/);
  });

  it("has a concurrency group per kind (smoke runs and builds do not cancel each other) that cancels the older run, so two tag pushes do not both burn minutes", () => {
    const c = asMap(ios.doc.concurrency, "concurrency");
    expect(c["cancel-in-progress"]).toBe(true);
    const group = str(c.group);
    expect(group).toContain("startsWith(github.ref_name, 'ios-smoke-')");
    expect(group).toContain("inputs.smoke_only == true");
    expect(group).toMatch(/&& 'smoke' \|\| 'build'/);
  });

  it("has three jobs: plan on ubuntu-24.04, and the smoke and the signed build on macos-26 (Apple takes Xcode 26 uploads only), each with a timeout", () => {
    expect(Object.keys(ios.jobs)).toEqual(["plan", "smoke", "testflight"]);
    expect(ios.jobs.plan["runs-on"]).toBe("ubuntu-24.04");
    expect(ios.jobs.smoke["runs-on"]).toBe("macos-26");
    expect(ios.jobs.testflight["runs-on"]).toBe("macos-26");
    for (const [name, j] of Object.entries(ios.jobs)) expect(typeof j["timeout-minutes"], `${name} has a timeout`).toBe("number");
    expect(ios.jobs.smoke["timeout-minutes"] as number).toBeLessThanOrEqual(45);
    expect(ios.jobs.testflight["timeout-minutes"] as number).toBeLessThanOrEqual(60);
    expect(ios.body.match(/runs-on: (.+)/g)).toEqual(["runs-on: ubuntu-24.04", "runs-on: macos-26", "runs-on: macos-26"]);
    expect(ios.body).not.toMatch(/macos-latest|macos-1[0-5]\b|macos-xl/);
  });

  it("the two macOS jobs wait for the plan and run only on their own path: smoke when the plan says smoke, the signed build when it says signed", () => {
    expect(ios.jobs.smoke.needs).toBe("plan");
    expect(ios.jobs.testflight.needs).toBe("plan");
    expect(ios.jobs.smoke.if).toBe("needs.plan.outputs.path == 'smoke'");
    expect(ios.jobs.testflight.if).toBe("needs.plan.outputs.path == 'signed'");
    expect(ios.jobs.plan.needs).toBeUndefined();
    const out = asMap(ios.jobs.plan.outputs, "outputs");
    expect(Object.keys(out).sort()).toEqual(["path", "version"]);
  });

  it("uses only checkout, setup-node and upload-artifact at the majors android.yml uses (one fix covers both), and ruby/setup-ruby@v1; nothing else, nothing unpinned", () => {
    const uses = (w: { body: string }): string[] => [...w.body.matchAll(/^\s+(?:- )?uses: (\S+)$/gm)].map((m) => m[1]);
    const major = (list: string[], action: string): string[] => [...new Set(list.filter((u) => u.startsWith(`${action}@`)))];
    const mine = uses(ios);
    for (const u of mine) expect(u, u).toMatch(/^(actions\/(checkout|setup-node|upload-artifact)|ruby\/setup-ruby)@v\d+$/);
    for (const action of ["actions/checkout", "actions/setup-node", "actions/upload-artifact"]) {
      expect(major(mine, action).length, action).toBe(1);
      expect(major(mine, action), action).toEqual(major(uses(android), action));
    }
    expect(major(mine, "ruby/setup-ruby")).toEqual(["ruby/setup-ruby@v1"]);
    expect(ios.body).not.toMatch(/docker:\/\/|\.\/\.github\/actions|@main|@master|@latest/);
  });
});

describe("M2 Goal 2: ios.yml's plan job picks the path, from the tag, smoke_only and which signing secrets exist", () => {
  const plan = stepNamed(ios.jobs.plan, /Work out the version/);
  const script = str(plan.run);

  it("sees only whether each secret exists (secrets.X != ''), never a value; the six names are exactly the secrets the workflows use", () => {
    const env = asMap(plan.env, "plan env");
    const flags = Object.entries(env).filter(([k]) => k.startsWith("HAVE_"));
    expect(flags.map(([k]) => k.slice(5)).sort()).toEqual([...SECRETS].sort());
    for (const [k, v] of flags) expect(v, k).toBe(`\${{ secrets.${k.slice(5)} != '' }}`);
    expect(Object.keys(env).filter((k) => !k.startsWith("HAVE_")).sort()).toEqual(["REF_NAME", "REF_TYPE", "SMOKE_ONLY"]);
    for (const l of ios.lines.filter((x) => /secrets\.[A-Z]/.test(x))) expect(l, l).toMatch(/^\s+(HAVE_[A-Z_]+: \$\{\{ secrets\.[A-Z_]+ != '' \}\}|[A-Z_]+: \$\{\{ secrets\.[A-Z_]+ \}\})$/);
    const used = new Set([...ios.body.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]));
    expect([...used].sort()).toEqual([...SECRETS].sort());
    expect(script).toContain("scripts/ios-version.mjs");
  });

  /** Runs the plan step's script for real, in the repo, with the real version script; GITHUB_OUTPUT and the summary are temp files. */
  function runPlan(env: Record<string, string>, secrets: number): { status: number | null; out: string; github: Record<string, string>; summary: string } {
    const dir = mkdtempSync(join(tmpdir(), "m2plan-"));
    try {
      const outFile = join(dir, "output");
      const sumFile = join(dir, "summary");
      writeFileSync(outFile, "");
      writeFileSync(sumFile, "");
      const have: Record<string, string> = {};
      SECRETS.forEach((s, n) => { have[`HAVE_${s}`] = n < secrets ? "true" : "false"; });
      const r = spawnSync("bash", ["-c", script], { cwd: ROOT, encoding: "utf8", env: { PATH: process.env.PATH ?? "", RUNNER_TEMP: dir, GITHUB_OUTPUT: outFile, GITHUB_STEP_SUMMARY: sumFile, SMOKE_ONLY: "", ...have, ...env } });
      const github: Record<string, string> = {};
      for (const l of readFileSync(outFile, "utf8").split("\n")) { const m = /^(\w+)=(.*)$/.exec(l); if (m) github[m[1]] = m[2]; }
      return { status: r.status, out: `${r.stdout}${r.stderr}`, github, summary: readFileSync(sumFile, "utf8") };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  const v = pkg.version;

  it("PATH (a): no signing secret (a manual run, or a release tag) is the unsigned Simulator smoke test, with package.json's version", () => {
    const r = runPlan({ REF_TYPE: "branch", REF_NAME: "main" }, 0);
    expect(r.status).toBe(0);
    expect(r.github).toEqual({ path: "smoke", version: v });
    expect(r.summary).toContain("none of the six signing secrets is set");
    const t = runPlan({ REF_TYPE: "tag", REF_NAME: `ios-v${v}` }, 0);
    expect(t.status).toBe(0);
    expect(t.github).toEqual({ path: "smoke", version: v });
  });

  it("PATH (b): all six secrets is the signed TestFlight build, on a manual run and on a matching release tag", () => {
    const r = runPlan({ REF_TYPE: "branch", REF_NAME: "main" }, 6);
    expect(r.status).toBe(0);
    expect(r.github).toEqual({ path: "signed", version: v });
    const t = runPlan({ REF_TYPE: "tag", REF_NAME: `ios-v${v}` }, 6);
    expect(t.status).toBe(0);
    expect(t.github).toEqual({ path: "signed", version: v });
  });

  it("PATH (c): some secrets but not all stops at once, with one error line for each missing secret, and sets no path", () => {
    for (const n of [1, 3, 5]) {
      const r = runPlan({ REF_TYPE: "branch", REF_NAME: "main" }, n);
      expect(r.status, `${n} of 6`).toBe(1);
      expect(r.github.path).toBeUndefined();
      const errors = r.out.split("\n").filter((l) => l.startsWith("::error::"));
      expect(errors).toEqual(SECRETS.slice(n).map((s) => `::error::The secret ${s} is not set.`));
      for (const s of SECRETS.slice(0, n)) expect(r.out, s).not.toContain(`The secret ${s} is not set`);
    }
    const t = runPlan({ REF_TYPE: "tag", REF_NAME: `ios-v${v}` }, 2);
    expect(t.status).toBe(1);
  });

  it("smoke_only forces the smoke test even with every secret set; an ios-smoke tag always does, with no version match, and never fails on missing secrets", () => {
    const a = runPlan({ REF_TYPE: "branch", REF_NAME: "main", SMOKE_ONLY: "true" }, 6);
    expect(a.status).toBe(0);
    expect(a.github).toEqual({ path: "smoke", version: v });
    expect(a.summary).toContain("smoke_only is set");
    const b = runPlan({ REF_TYPE: "tag", REF_NAME: "ios-smoke-first-dry-run" }, 6);
    expect(b.status).toBe(0);
    expect(b.github).toEqual({ path: "smoke", version: v });
    const c = runPlan({ REF_TYPE: "tag", REF_NAME: "ios-smoke-2" }, 3);
    expect(c.status).toBe(0);
    expect(c.github.path).toBe("smoke");
    expect(c.out).toContain("::warning::These signing secrets are not set: ");
    const d = runPlan({ REF_TYPE: "branch", REF_NAME: "main", SMOKE_ONLY: "false" }, 6);
    expect(d.github.path).toBe("signed");
  });

  it("a release tag that names another version, or that is not a version at all, is refused before any path is chosen", () => {
    for (const tag of ["ios-v9.9.9", `ios-v${v}.1`, "ios-vfoo", "ios-v", "ios-smoke-"]) {
      const r = runPlan({ REF_TYPE: "tag", REF_NAME: tag }, 6);
      expect(r.status, tag).toBe(1);
      expect(r.github.path, tag).toBeUndefined();
      expect(r.out, tag).toMatch(/ios-version: /);
    }
  });

  it("never prints a secret: the plan job has no secret value in its environment, so none can reach its log", () => {
    expect(Object.values(asMap(plan.env, "env")).filter((x) => /^\$\{\{ secrets\.[A-Z_]+ \}\}$/.test(str(x)))).toEqual([]);
    expect(script).not.toMatch(/set -x|xtrace/);
  });
});

describe("M2 Goal 2: ios.yml's smoke job is his collack pattern: an unsigned Debug build for the Simulator, installed, launched, screenshotted, checked, with the evidence kept", () => {
  const smoke = ios.jobs.smoke;
  const text = runsOf(smoke).join("\n");

  it("builds in order: checkout, Node 22 with the npm cache, Xcode 26, npm ci, build:app, cap sync ios, the Swift packages, xcodebuild, the checks, the simulator", () => {
    const names = stepsOf(smoke).map((s) => str(s.name));
    const at = (re: RegExp): number => names.findIndex((n) => re.test(n));
    const order = [/Check out/, /Node 22/, /Select Xcode/, /Install the packages/, /Build the web app/, /Copy the web app/, /Resolve the Swift packages/, /Build the app for the iOS Simulator/, /Check what was built/, /Install, launch and screenshot/];
    for (const re of order) expect(at(re), String(re)).toBeGreaterThan(-1);
    for (let k = 1; k < order.length; k++) expect(at(order[k]), `${order[k - 1]} before ${order[k]}`).toBeGreaterThan(at(order[k - 1]));
    expect(asMap(stepNamed(smoke, /Node 22/).with, "with")).toEqual({ "node-version": 22, cache: "npm" });
    expect(str(stepNamed(smoke, /Install the packages/).run)).toBe("npm ci");
    expect(str(stepNamed(smoke, /Build the web app/).run)).toBe("npm run build:app");
    expect(str(stepNamed(smoke, /Copy the web app/).run)).toBe("npx cap sync ios");
    expect(text).not.toMatch(/pod install|bundle |fastlane|ruby/i); // Ruby and fastlane belong to the signed path only
  });

  it("selects the Xcode explicitly (the image holds seven; Xcode_26.6 is its default) and refuses anything older than Xcode 26", () => {
    expect(asMap(smoke.env, "env").XCODE_APP).toBe("/Applications/Xcode_26.6.app");
    const sel = str(stepNamed(smoke, /Select Xcode/).run);
    expect(sel).toContain('echo "DEVELOPER_DIR=$XCODE_APP/Contents/Developer" >> "$GITHUB_ENV"');
    expect(sel).toMatch(/\[ "\$\{major:-0\}" -lt 26 \]/);
  });

  it("builds Debug for the iPhone Simulator from App.xcodeproj, unsigned, with the version from the plan and build number 1", () => {
    const build = str(stepNamed(smoke, /Build the app for the iOS Simulator/).run);
    for (const s of ["-project ios/App/App.xcodeproj", "-scheme App", "-configuration Debug", "-sdk iphonesimulator", "-destination 'generic/platform=iOS Simulator'", "CODE_SIGNING_ALLOWED=NO", "CODE_SIGNING_REQUIRED=NO", "CODE_SIGN_IDENTITY=", 'MARKETING_VERSION="$VERSION"', "CURRENT_PROJECT_VERSION=1", "set -euo pipefail"]) expect(build, s).toContain(s);
    expect(build).toContain("2>&1 | tee");
    expect(asMap(smoke.env, "env").VERSION).toBe("${{ needs.plan.outputs.version }}");
    expect(build).not.toMatch(/-workspace|xcworkspace|archive|exportArchive|-allowProvisioningUpdates/);
  });

  it("checks the built app: bundle id = capacitor.config.json's appId, the version, build 1, the privacy manifest and the web build inside the bundle", () => {
    const chk = str(stepNamed(smoke, /Check what was built/).run);
    for (const s of ["CFBundleIdentifier", "CFBundleShortVersionString", "CFBundleVersion", "ITSAppUsesNonExemptEncryption", "UIDeviceFamily", 'PrivacyInfo.xcprivacy"', 'public/index.html"', 'capacitor.config.json"', '= "$APP_ID"', '= "$VERSION"']) expect(chk, s).toContain(s);
    expect(str(stepNamed(smoke, /Read the app id/).run)).toContain("require('./capacitor.config.json').appId");
  });

  it("installs on an available iPhone simulator, launches it, waits, screenshots twice, checks the app is still running as the process it launched, and saves the console output", () => {
    const sim = str(stepNamed(smoke, /Install, launch and screenshot/).run);
    for (const s of ["xcrun simctl list devices available --json", 'device.name.startsWith("iPhone")', 'xcrun simctl bootstatus "$SIM_UDID" -b', 'xcrun simctl install "$SIM_UDID" "$APP_PATH"', "xcrun simctl launch --terminate-running-process", '--stdout="$EVIDENCE/app-stdout.log"', '--stderr="$EVIDENCE/app-stderr.log"', "sleep 12", 'xcrun simctl io "$SIM_UDID" screenshot "$EVIDENCE/app-launched.png"', 'xcrun simctl spawn "$SIM_UDID" launchctl list', '"$RUNNING_PID" != "$LAUNCH_PID"', "exit 1"]) expect(sim, s).toContain(s);
    // no marker is added to the app's own code: the screenshot and the liveness check are the proof
    expect(read("ios/App/App/AppDelegate.swift")).not.toMatch(/SMOKE|NSLog|os_log|print\(/);
    expect(read("ios/App/App/SceneDelegate.swift")).not.toMatch(/SMOKE|NSLog|os_log|print\(/);
  });

  it("uploads the evidence as an artifact even when a step fails: build log, screenshots, console, plist values, simulator, liveness; and the summary says SMOKE ONLY: NOTHING SIGNED OR UPLOADED", () => {
    const up = stepNamed(smoke, /Upload the evidence/);
    expect(up.if).toBe("always()");
    expect(up.uses).toBe("actions/upload-artifact@v6");
    expect(asMap(up.with, "with")).toMatchObject({ name: "beltbattles-${{ needs.plan.outputs.version }}-ios-smoke", path: "${{ runner.temp }}/ios-smoke-evidence", "if-no-files-found": "error" });
    for (const f of ["xcodebuild.log", "app-launched.png", "app-stdout.log", "app-stderr.log", "info-plist-values.txt", "simulators.json", "liveness.txt", "xcode-version.txt"]) expect(text, f).toContain(f);
    const sum = stepNamed(smoke, /job summary/);
    expect(sum.if).toBe("always()");
    expect(str(sum.run)).toContain("SMOKE ONLY: NOTHING SIGNED OR UPLOADED");
    expect(str(sum.run)).toContain('>> "$GITHUB_STEP_SUMMARY"');
  });

  it("touches no secret and nothing Apple: no secrets.* in the job, no upload, no match, no TestFlight", () => {
    const block = JSON.stringify(smoke);
    expect(block).not.toMatch(/secrets\./);
    expect(text).not.toMatch(/altool|notarytool|upload_to_testflight|iTMSTransporter|appstoreconnect|security |match /i);
  });
});

describe("M2 Goal 2: ios.yml's signed job runs fastlane's closed_beta with the six secrets, and cleans up", () => {
  const tf = ios.jobs.testflight;

  it("sets up Ruby 3.3 with bundler-cache in ios/App (the Gemfile alone: the action runs bundle lock), then runs `bundle exec fastlane closed_beta` there", () => {
    const ruby = stepNamed(tf, /Set up Ruby/);
    expect(ruby.uses).toBe("ruby/setup-ruby@v1");
    expect(asMap(ruby.with, "with")).toEqual({ "ruby-version": "3.3", "bundler-cache": true, "working-directory": "ios/App" });
    const lane = stepNamed(tf, /fastlane closed_beta/);
    expect(lane["working-directory"]).toBe("ios/App");
    expect(lane.run).toBe("bundle exec fastlane closed_beta");
    expect(stepsOf(tf).findIndex((s) => s === ruby)).toBeLessThan(stepsOf(tf).findIndex((s) => s === lane));
  });

  it("maps exactly the six secrets into the one fastlane step, as env values (NAME: ${{ secrets.NAME }}); the app id and the version are not secrets", () => {
    const lane = stepNamed(tf, /fastlane closed_beta/);
    const env = asMap(lane.env, "env");
    expect(Object.keys(env).sort()).toEqual([...SECRETS].sort());
    for (const [k, v] of Object.entries(env)) expect(v, k).toBe(`\${{ secrets.${k} }}`);
    expect(asMap(tf.env, "job env").CUSTOM_VERSION).toBe("${{ needs.plan.outputs.version }}");
    expect(str(stepNamed(tf, /Read the app id/).run)).toContain(`DEVELOPER_APP_IDENTIFIER=$(node -p "require('./capacitor.config.json').appId")" >> "$GITHUB_ENV"`);
    expect(ios.body).not.toContain("secrets.DEVELOPER_APP_IDENTIFIER");
    expect(cfg.appId).toBe("com.bobbyhiddn.beltbattles");
  });

  it("checks the key's format without printing it, selects Xcode 26, builds the web app and syncs first, and uploads only logs (never the signed build)", () => {
    const names = stepsOf(tf).map((s) => str(s.name));
    const at = (re: RegExp): number => names.findIndex((n) => re.test(n));
    for (const re of [/Select Xcode/, /Install the packages/, /Build the web app/, /Copy the web app/, /Read the app id/, /Set up Ruby/, /App Store Connect key is a key/, /fastlane closed_beta/]) expect(at(re), String(re)).toBeGreaterThan(-1);
    expect(at(/Copy the web app/)).toBeLessThan(at(/fastlane closed_beta/));
    expect(at(/App Store Connect key is a key/)).toBeLessThan(at(/fastlane closed_beta/));
    expect(asMap(tf.env, "env").XCODE_APP).toBe("/Applications/Xcode_26.6.app");
    const key = stepNamed(tf, /App Store Connect key is a key/);
    expect(str(key.run)).toContain("openssl pkey");
    expect(str(key.run)).toContain('rm -f "$KEY_FILE"');
    const art = stepNamed(tf, /build logs as an artifact/);
    expect(art.if).toBe("always()");
    expect(JSON.stringify(art.with)).not.toMatch(/\.ipa|\.xcarchive/);
  });

  it("deletes the temporary keychain and any key file in an always() step, last", () => {
    const steps = stepsOf(tf);
    const last = steps[steps.length - 1];
    expect(last.if).toBe("always()");
    expect(str(last.run)).toContain('rm -f "$RUNNER_TEMP/AuthKey-check.p8"');
    expect(str(last.run)).toContain("security delete-keychain fastlane_tmp_keychain");
  });

  it("never echoes a secret, writes one into the repo or onto a command line", () => {
    for (const m of ios.body.matchAll(/^.*secrets\.[A-Z].*$/gm)) expect(m[0], "a secret outside an env mapping").toMatch(/^\s+[A-Z0-9_]+: \$\{\{ secrets\.[A-Z0-9_]+( != '')? \}\}$/);
    const SECRET_VARS = /\$\{?(APPLE_KEY_ID|APPLE_ISSUER_ID|APPLE_KEY_CONTENT|DEVELOPER_PORTAL_TEAM_ID|MATCH_GIT_URL|MATCH_PASSWORD)\b/;
    const printing = ios.lines.filter((l) => /\b(echo|printf|cat|tee)\b/.test(l) && SECRET_VARS.test(l));
    expect(printing.map((l) => l.trim())).toEqual([`BODY="$(printf '%s' "$APPLE_KEY_CONTENT" | grep -v -e '-----' | tr -d ' \\r\\n' || true)"`]); // the one use: into a pipe, into a variable, into a file that is deleted
    expect(ios.body).not.toMatch(/set -x|xtrace|ACTIONS_STEP_DEBUG|add-mask|-keypass|-storepass|--password|--passphrase/);
    expect(ios.body).not.toMatch(/MATCH_PASSWORD=|MATCH_GIT_URL=|APPLE_KEY_CONTENT=/); // none is exported or assigned in a script
  });

  it("is what the first real run will have: every run block is valid bash (bash -n), including the macOS ones", () => {
    for (const [name, job] of Object.entries(ios.jobs)) {
      for (const s of runsOf(job)) {
        const r = spawnSync("bash", ["-n"], { input: s, encoding: "utf8" });
        expect(r.status, `${name}: ${r.stderr}\n${s.slice(0, 200)}`).toBe(0);
      }
    }
    for (const [name, job] of Object.entries(init.jobs)) {
      for (const s of runsOf(job)) {
        const r = spawnSync("bash", ["-n"], { input: s, encoding: "utf8" });
        expect(r.status, `match-init ${name}: ${r.stderr}`).toBe(0);
      }
    }
  });

  it("every ${{ }} expression uses a context the place allows: github, inputs, secrets, needs, runner; steps only in the plan job's two outputs; no env, vars or matrix", () => {
    for (const w of [ios, init]) {
      for (const m of w.body.matchAll(/\$\{\{([^}]*)\}\}/g)) {
        const roots = [...m[1].matchAll(/\b(github|inputs|secrets|needs|runner|steps|env|vars|matrix|strategy|job)\./g)].map((x) => x[1]);
        for (const r of roots) expect(["github", "inputs", "secrets", "needs", "runner", "steps"], `${m[0]} uses ${r}`).toContain(r);
      }
    }
    const stepsUses = ios.lines.filter((l) => l.includes("steps."));
    expect(stepsUses.map((l) => l.trim())).toEqual(["path: ${{ steps.plan.outputs.path }}", "version: ${{ steps.plan.outputs.version }}"]);
    expect(init.body).not.toContain("steps.");
  });
});

describe("M2 Goal 2: .github/workflows/ios-match-init.yml: the one-off that WRITES the certificate and the profile", () => {
  const on = asMap(init.doc.on, "on");

  it("runs only by hand or on a pushed tag ios-match-init-* (so it can run before the release lane merges this branch to main); read-only token; one run at a time, never cancelled", () => {
    expect(Object.keys(on).sort()).toEqual(["push", "workflow_dispatch"]);
    expect(asMap(on.push, "push")).toEqual({ tags: ["ios-match-init-*"] });
    expect(init.doc.permissions).toEqual({ contents: "read" });
    expect(asMap(init.doc.concurrency, "concurrency")).toEqual({ group: "ios-match-init", "cancel-in-progress": false });
    expect(init.body).not.toMatch(/branches:|pull_request|schedule:|paths:|environment:|: write\b|vars\./);
  });

  it("says plainly that it writes: to the match repo and to the Apple account, in its header, its job name and its summary", () => {
    expect(init.text).toMatch(/THIS WORKFLOW WRITES/);
    expect(init.text).toMatch(/Apple Developer account/);
    expect(init.text).toMatch(/COMMITS the encrypted certificate/);
    expect(str(init.doc.name)).toBe("iOS match init");
    expect(str(init.jobs.match.name)).toMatch(/writes to the match repo/);
    expect(init.text).toMatch(/Run fastlane match_init \(this writes\)/);
  });

  it("first checks on a Linux runner that all six secrets exist, and only then starts the Mac: it stops at once naming each missing one", () => {
    expect(Object.keys(init.jobs)).toEqual(["check", "match"]);
    expect(init.jobs.check["runs-on"]).toBe("ubuntu-24.04");
    expect(init.jobs.match["runs-on"]).toBe("macos-26");
    expect(init.jobs.match.needs).toBe("check");
    expect(typeof init.jobs.match["timeout-minutes"]).toBe("number");
    const step = stepsOf(init.jobs.check)[0];
    const env = asMap(step.env, "env");
    expect(Object.keys(env).sort()).toEqual(SECRETS.map((s) => `HAVE_${s}`).sort());
    for (const [k, v] of Object.entries(env)) expect(v, k).toBe(`\${{ secrets.${k.slice(5)} != '' }}`);
    const script = str(step.run);
    const go = (have: number): { status: number | null; out: string } => {
      const flags: Record<string, string> = {};
      SECRETS.forEach((s, n) => { flags[`HAVE_${s}`] = n < have ? "true" : "false"; });
      const r = spawnSync("bash", ["-c", script], { encoding: "utf8", env: { PATH: process.env.PATH ?? "", ...flags } });
      return { status: r.status, out: `${r.stdout}${r.stderr}` };
    };
    expect(go(6).status).toBe(0);
    for (const n of [0, 2, 5]) {
      const r = go(n);
      expect(r.status, `${n} of 6`).toBe(1);
      expect(r.out.split("\n").filter((l) => l.startsWith("::error::"))).toEqual(SECRETS.slice(n).map((s) => `::error::The secret ${s} is not set.`));
    }
  });

  it("runs `bundle exec fastlane match_init` in ios/App with the six secrets as env values and the app id from capacitor.config.json, then deletes the temporary keychain", () => {
    const lane = stepNamed(init.jobs.match, /match_init/);
    expect(lane["working-directory"]).toBe("ios/App");
    expect(lane.run).toBe("bundle exec fastlane match_init");
    const env = asMap(lane.env, "env");
    expect(Object.keys(env).sort()).toEqual([...SECRETS].sort());
    for (const [k, v] of Object.entries(env)) expect(v, k).toBe(`\${{ secrets.${k} }}`);
    expect(str(stepNamed(init.jobs.match, /Read the app id/).run)).toContain("require('./capacitor.config.json').appId");
    const ruby = stepNamed(init.jobs.match, /Set up Ruby/);
    expect(asMap(ruby.with, "with")).toEqual({ "ruby-version": "3.3", "bundler-cache": true, "working-directory": "ios/App" });
    const steps = stepsOf(init.jobs.match);
    expect(steps[steps.length - 1].if).toBe("always()");
    expect(str(steps[steps.length - 1].run)).toContain("security delete-keychain fastlane_tmp_keychain");
    for (const m of init.body.matchAll(/^.*secrets\.[A-Z].*$/gm)) expect(m[0], "a secret outside an env mapping").toMatch(/^\s+[A-Z0-9_]+: \$\{\{ secrets\.[A-Z0-9_]+( != '')? \}\}$/);
    expect(init.body).not.toMatch(/set -x|xtrace|add-mask|\becho\b[^\n]*\$\{?(APPLE_|MATCH_|DEVELOPER_PORTAL)/);
    const used = new Set([...init.body.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]));
    expect([...used].sort()).toEqual([...SECRETS].sort());
  });
});

describe("M2 Goal 2: scripts/ios-version.mjs: package.json's version, and what a tag asks for", () => {
  it("accepts x.y.z and refuses anything else (a leading zero, a fourth part, a suffix, an empty string)", () => {
    expect(iosVersion("0.9.13")).toEqual({ marketingVersion: "0.9.13" });
    expect(iosVersion("1.0.0")).toEqual({ marketingVersion: "1.0.0" });
    expect(iosVersion("10.20.30").marketingVersion).toBe("10.20.30");
    for (const bad of ["1.0", "1.0.0.0", "01.0.0", "1.0.0-beta", "v1.0.0", "", "1.x.0"]) expect(() => iosVersion(bad), bad).toThrow(/is not x\.y\.z/);
  });

  it("kindFromTag: ios-v<version> must equal package.json's version; ios-smoke-<label> never needs a match; any other tag is refused", () => {
    expect(kindFromTag("ios-v0.9.13", "0.9.13")).toBe("release");
    expect(kindFromTag("ios-smoke-1", "0.9.13")).toBe("smoke");
    expect(kindFromTag("ios-smoke-first.dry_run-2", "0.9.13")).toBe("smoke");
    expect(() => kindFromTag("ios-v0.9.14", "0.9.13")).toThrow(/names version 0\.9\.14, but package\.json says 0\.9\.13/);
    for (const bad of ["ios-v", "ios-v1.0", "ios-v1.0.0-r2", "ios-smoke-", "ios-smoke- x", "android-v0.9.13", "v0.9.13", "ios-match-init-1", "ios-V0.9.13"]) expect(() => kindFromTag(bad, "0.9.13"), bad).toThrow(/is not ios-v<version> or ios-smoke-<label>/);
  });

  it("run(): prints the two lines the workflow reads, from a package file; no tag is a release run; it refuses a tag that does not match and an unknown argument", () => {
    const pkgOf = (version: unknown) => () => ({ version });
    expect(runVersion([], pkgOf("0.9.13"))).toBe("version=0.9.13\nkind=release\n");
    expect(runVersion(["--tag", "ios-v0.9.13"], pkgOf("0.9.13"))).toBe("version=0.9.13\nkind=release\n");
    expect(runVersion(["--tag", "ios-smoke-x"], pkgOf("0.9.13"))).toBe("version=0.9.13\nkind=smoke\n");
    expect(() => runVersion(["--tag", "ios-v1.0.0"], pkgOf("0.9.13"))).toThrow(/but package\.json says 0\.9\.13/);
    expect(() => runVersion([], pkgOf("0.9"))).toThrow(/is not x\.y\.z/);
    expect(() => runVersion(["--tag"], pkgOf("0.9.13"))).toThrow(/needs a value/);
    expect(() => runVersion(["--rebuild", "1"], pkgOf("0.9.13"))).toThrow(/unknown argument/);
  });

  it("as a real process: exit 0 and the two lines for package.json's own version; exit 1 and one line on stderr for a wrong tag", () => {
    const ok = spawnSync("node", ["scripts/ios-version.mjs"], { cwd: ROOT, encoding: "utf8" });
    expect(ok.status).toBe(0);
    expect(ok.stdout).toBe(`version=${pkg.version}\nkind=release\n`);
    const smoke = spawnSync("node", ["scripts/ios-version.mjs", "--tag", "ios-smoke-dry"], { cwd: ROOT, encoding: "utf8" });
    expect(smoke.stdout).toBe(`version=${pkg.version}\nkind=smoke\n`);
    const bad = spawnSync("node", ["scripts/ios-version.mjs", "--tag", "ios-v0.0.1"], { cwd: ROOT, encoding: "utf8" });
    expect(bad.status).toBe(1);
    expect(bad.stdout).toBe("");
    expect(bad.stderr).toMatch(/^ios-version: tag "ios-v0\.0\.1" names version 0\.0\.1, but package\.json says /);
    expect(bad.stderr.trim().split("\n")).toHaveLength(1);
  });

  it("package.json's version is x.y.z, so the marketing version is the version the game already reports", () => {
    expect(iosVersion(pkg.version).marketingVersion).toBe(pkg.version);
    expect(read("src/version.ts")).toContain(`"${pkg.version}"`);
  });
});
