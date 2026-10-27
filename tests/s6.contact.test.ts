// S6 (REQ-BFG-119) Goal 4: scripts/s6/contact.mjs and the listings' new fields. The script runs as a real process, on a TEMP COPY of the four files it
// works on (--root), never on the repository, and never with real details: the tests use help@example.org and Example Games.
//  - --check lists every placeholder (file:line) and exits 1, or says none is left and exits 0;
//  - --email --name fills both everywhere, the pages still parse and keep their links, and --check then exits 0;
//  - it refuses (exit 2, nothing written) a bad address, a name with < > & " or a line break, a second run, and bad arguments;
//  - store/listing/apple.md and play.md carry the Privacy Policy URL, the Support URL, the contact email and (Play) the data deletion URL.
import { describe, expect, it, afterEach } from "vitest";
import * as childProcess from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parseHtml } from "./s6Html";

const ROOT = new URL("..", import.meta.url).pathname;
const SCRIPT = join(ROOT, "scripts/s6/contact.mjs");
const FILES = ["server/pages/privacy.html", "server/pages/support.html", "store/listing/apple.md", "store/listing/play.md"] as const;
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

// tsconfig.tests.json carries a small shim for node:child_process (spawn only); the ratchet counts type errors, so this goes through a cast
const spawnSync = (childProcess as unknown as { spawnSync(file: string, args: string[], opts?: Record<string, unknown>): { status: number | null; stdout: string; stderr: string } }).spawnSync;
const run = (args: string[], root?: string): { status: number | null; stdout: string; stderr: string } =>
  spawnSync(process.execPath, [SCRIPT, ...(root ? ["--root", root] : []), ...args], { encoding: "utf8" });

const made: string[] = [];
afterEach(() => {
  while (made.length) rmSync(made.pop()!, { recursive: true, force: true });
});
/** A temp directory holding the four files, as the repository has them. */
function copy(): string {
  const dir = mkdtempSync(join(tmpdir(), "bb-s6-contact-"));
  made.push(dir);
  for (const rel of FILES) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), read(rel));
  }
  return dir;
}
const snapshot = (dir: string): string[] => FILES.map((rel) => readFileSync(join(dir, rel), "utf8"));
/** The expected --check lines: every [[...]] of the four files, file:line: token. */
function expectedCheck(dir: string): string[] {
  const out: string[] = [];
  for (const rel of FILES) {
    readFileSync(join(dir, rel), "utf8").split("\n").forEach((ln, i) => {
      for (const m of ln.matchAll(/\[\[[^\]\r\n]*\]\]/g)) out.push(`${rel}:${i + 1}: ${m[0]}`);
    });
  }
  return out;
}

const template = FILES.some((rel) => read(rel).includes("[[SUPPORT_EMAIL]]"));
const EMAIL = "help@example.org";
const NAME = "Example Games";

describe("S6 Goal 4: the listings carry the privacy, support and contact fields", () => {
  const field = (text: string, heading: string): { note: string; value: string } => {
    const m = new RegExp(`^## ${heading} \\(([^\\n]*)\\)\\n\\n([^\\n]+)\\n`, "m").exec(text);
    expect(m, heading).not.toBeNull();
    return { note: m![1], value: m![2] };
  };
  const isEmail = (v: string): boolean => v === "[[SUPPORT_EMAIL]]" || /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(v);

  it("apple.md: the Privacy Policy URL, the Support URL and the contact email, after the M3 fields", () => {
    const t = read("store/listing/apple.md");
    expect(field(t, "Privacy Policy URL").value).toBe("https://beltbattles.fly.dev/privacy");
    expect(field(t, "Support URL").value).toBe("https://beltbattles.fly.dev/support");
    expect(isEmail(field(t, "Contact email").value)).toBe(true);
    expect(t.indexOf("## Privacy Policy URL")).toBeGreaterThan(t.indexOf("## Categories"));
    expect(t).not.toMatch(/Data deletion/); // Apple's form has no such field: deletion is in the app and in the privacy policy
  });

  it("play.md: the privacy policy URL, the Support URL, the contact email and the data deletion URL, after the M3 fields", () => {
    const t = read("store/listing/play.md");
    expect(field(t, "Privacy policy URL").value).toBe("https://beltbattles.fly.dev/privacy");
    expect(field(t, "Support URL").value).toBe("https://beltbattles.fly.dev/support");
    expect(isEmail(field(t, "Contact email").value)).toBe(true);
    expect(field(t, "Data deletion URL").value).toBe("https://beltbattles.fly.dev/privacy#delete");
    expect(t.indexOf("## Privacy policy URL")).toBeGreaterThan(t.indexOf("## Category"));
  });

  it("the only [[...]] in the listings are [[SUPPORT_EMAIL]] (and the files have no other address or placeholder)", () => {
    for (const f of ["store/listing/apple.md", "store/listing/play.md"]) {
      const found = [...read(f).matchAll(/\[\[[^\]\r\n]*\]\]/g)].map((m) => m[0]);
      expect(found.every((x) => x === "[[SUPPORT_EMAIL]]"), f).toBe(true);
      expect(found.length, f).toBeLessThanOrEqual(1);
      expect([...read(f).matchAll(/https?:\/\/[^\s)]+/g)].map((m) => m[0]).every((u) => u.startsWith("https://beltbattles.fly.dev/")), f).toBe(true);
    }
  });
});

describe("S6 Goal 4: node scripts/s6/contact.mjs --check", () => {
  it.skipIf(!template)("lists every placeholder left, file:line, and exits 1", () => {
    const dir = copy();
    const r = run(["--check"], dir);
    expect(r.status).toBe(1);
    const lines = r.stdout.trimEnd().split("\n");
    const want = expectedCheck(dir);
    expect(want.length).toBeGreaterThanOrEqual(8); // the two pages (privacy 6, support 2 or more) and the listings' email
    expect(lines.slice(0, want.length)).toEqual(want);
    expect(lines[want.length]).toBe(`${want.length} placeholders left. Fill them: node scripts/s6/contact.mjs --email <address> --name <text>`);
    expect(lines).toHaveLength(want.length + 1);
    for (const rel of FILES) expect(want.some((l) => l.startsWith(`${rel}:`)), rel).toBe(true);
    expect(snapshot(dir)).toEqual(FILES.map((rel) => read(rel))); // --check writes nothing
    expect(r.stderr).toBe("");
  });

  it.skipIf(template)("says no placeholder is left and exits 0, once the details are in", () => {
    const r = run(["--check"], copy());
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe("no placeholder left in 4 files");
  });

  it("run on the repository itself (no --root) only reads: its exit code follows its output, and nothing changes", () => {
    const before = FILES.map((rel) => read(rel));
    const r = run(["--check"]);
    expect(r.status).toBe(template ? 1 : 0);
    expect(r.stdout).toContain(template ? "placeholders left." : "no placeholder left");
    expect(FILES.map((rel) => read(rel))).toEqual(before);
  });
});

describe("S6 Goal 4: node scripts/s6/contact.mjs --email <address> --name <text>", () => {
  it.skipIf(!template)("fills both placeholders in all four files; the pages still parse and keep their links; --check then exits 0; a second run is refused", () => {
    const dir = copy();
    const r = run(["--email", EMAIL, "--name", NAME], dir);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim().split("\n").sort()).toEqual(FILES.map((f) => `filled ${f}`).sort());
    const after = snapshot(dir);
    for (const [i, rel] of FILES.entries()) {
      const was = read(rel);
      expect(after[i], rel).not.toMatch(/\[\[/);
      // nothing else changed: the filled text is the old text with the two tokens replaced
      expect(after[i], rel).toBe(was.split("[[SUPPORT_EMAIL]]").join(EMAIL).split("[[DEVELOPER_NAME]]").join(NAME));
    }
    // the pages
    for (const i of [0, 1]) {
      const p = parseHtml(after[i]);
      expect(p.errors).toEqual([]);
      const hrefs = p.tags.filter((t) => t.name === "a").map((t) => t.attrs.href);
      expect(hrefs.filter((h) => h.startsWith("mailto:")).every((h) => h === `mailto:${EMAIL}`)).toBe(true);
      expect(hrefs.filter((h) => h.startsWith("mailto:")).length).toBeGreaterThan(0);
      expect(p.text).toContain(`published by ${NAME}.`);
      expect(p.text).toContain(EMAIL);
    }
    // the listings
    expect(after[2]).toContain(`## Contact email (on the support page; App Review contact information)\n\n${EMAIL}\n`);
    expect(after[3]).toContain(`\n\n${EMAIL}\n`);
    // --check, then a second fill
    const check = run(["--check"], dir);
    expect(check.status).toBe(0);
    expect(check.stdout.trim()).toBe("no placeholder left in 4 files");
    const again = run(["--email", "other@example.org", "--name", "Other"], dir);
    expect(again.status).toBe(2);
    expect(again.stderr).toContain("nothing to fill");
    expect(snapshot(dir)).toEqual(after);
  });

  it.skipIf(!template)("refuses an address that is not shaped like one: exit 2, a reason on stderr, nothing written", () => {
    const dir = copy();
    const before = snapshot(dir);
    for (const bad of ["", "nobody", "a@b", "a b@example.org", "@example.org", "a@@example.org", "a@example..", "a@exam ple.org", "a@example.org\n", "<a>@example.org", "a&b@example.org", '"a"@example.org', "a@exa'mple.org", `${"x".repeat(250)}@example.org`]) {
      const r = run(["--email", bad, "--name", NAME], dir);
      expect(r.status, JSON.stringify(bad)).toBe(2);
      expect(r.stderr, JSON.stringify(bad)).toContain("not an email address");
      expect(r.stdout).toBe("");
    }
    expect(snapshot(dir)).toEqual(before);
    expect(readdirSync(join(dir, "server/pages")).sort()).toEqual(["privacy.html", "support.html"]); // no temp file left behind
  });

  it.skipIf(!template)("refuses a name with <, >, & or \" in it, one with a line break, an empty one and an over-long one: exit 2, nothing written", () => {
    const dir = copy();
    const before = snapshot(dir);
    for (const bad of ["A<B", "A>B", "A&B", 'A"B', "A\nB", "A\rB", "A B", "A\u0007B", "", "   ", "x".repeat(121)]) { // (a NUL cannot be passed in an argument at all)
      const r = run(["--email", EMAIL, "--name", bad], dir);
      expect(r.status, JSON.stringify(bad)).toBe(2);
      expect(r.stderr, JSON.stringify(bad)).toMatch(/the name/);
    }
    expect(snapshot(dir)).toEqual(before);
  });

  it.skipIf(!template)("a name or an address with $ patterns goes in as it is (no replace patterns), and an apostrophe or an accent is fine", () => {
    const dir = copy();
    const name = "Dollar $1 $$ $' $` Games O'Neil Ångström"; // String.replace would read $1, $$, $' and $` as patterns; split/join does not
    const r = run(["--email", "a+b_c.d-e%f@sub.example.co.uk", "--name", `  ${name}  `], dir);
    expect(r.status, r.stderr).toBe(0);
    const [privacy] = snapshot(dir);
    expect(privacy).toContain(`published by ${name}.`);
    expect(privacy).toContain('href="mailto:a+b_c.d-e%f@sub.example.co.uk"');
    expect(parseHtml(privacy).errors).toEqual([]);
  });

  it("bad arguments are refused with the usage (exit 2): none, --check with details, a detail alone, a missing value, an unknown flag, a missing root", () => {
    const dir = copy();
    const before = snapshot(dir);
    for (const args of [[], ["--check", "--email", EMAIL], ["--email", EMAIL], ["--name", NAME], ["--email"], ["--email", "--name", NAME], ["--frobnicate"], ["--email", EMAIL, "--name", NAME, "extra"]]) {
      const r = run(args, dir);
      expect(r.status, JSON.stringify(args)).toBe(2);
      expect(r.stderr, JSON.stringify(args)).toContain("usage: node scripts/s6/contact.mjs");
    }
    const missing = run(["--check"], join(dir, "nowhere"));
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain("cannot read server/pages/privacy.html");
    expect(snapshot(dir)).toEqual(before);
  });

  it("the script has no dependency: it imports node's own modules and nothing else", () => {
    const src = read("scripts/s6/contact.mjs");
    const imports = [...src.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]);
    expect(imports.sort()).toEqual(["node:fs", "node:path", "node:url"]);
    expect(src).not.toMatch(/require\(|import\(|child_process|fetch\(|https?\.request/);
  });
});
