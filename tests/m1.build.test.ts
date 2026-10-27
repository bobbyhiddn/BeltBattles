// M1 (BRIEF-M1 Goal 2, "the Capacitor check"): the four web builds hold NO Capacitor code, and `npm run build:app` holds the boot. Made here
// in-process the way the scripts make them (tests/build.online.test.ts's way, write: false), from the env each script sets:
//   npm run build, build:online, build:demo: ONE JS chunk, with registerPlugin, @capacitor, CapacitorStorage and isNativePlatform at 0.
//     Preferences and Capacitor are NOT 0: IDENT-1's src/net/identityMirror.ts reads `Capacitor?.Plugins?.Preferences` by name, so every
//     build already holds each word once (cap's base counts, gates/m1base-capgrep.txt); they must stay at 1.
//   npm run build:app: the boot is its own chunk (registerPlugin, isNativePlatform, the plugins' names), and the page holds the literal Fly URL.
// This is the fold check as a regression test: this repo's Vite 8 bundles with Rolldown, which drops main.ts's import() behind the inline
// `import.meta.env.VITE_NATIVE === "1"` test, and would NOT drop it behind a const imported from another module (src/native.ts says so).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "vite";

const ROOT = new URL("..", import.meta.url).pathname;
const scripts = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;

/** A build script's `vite build` step's env assignments (tests/build.online.test.ts's reader). */
function envOf(script: string): Record<string, string> {
  const step = script.split("&&").map((s) => s.trim()).find((s) => / ?vite build( |$)/.test(s));
  if (!step) throw new Error(`no vite build in "${script}"`);
  const words = step.split(/\s+/);
  const env: Record<string, string> = {};
  while (/^[A-Z_][A-Z0-9_]*=/.test(words[0])) {
    const [k, ...v] = words.shift()!.split("=");
    env[k] = v.join("=");
  }
  return env;
}

interface Chunk { fileName: string; code: string; isEntry: boolean }
const KEYS = ["VITE_GHOST_SERVER", "VITE_NATIVE", "VITE_DEMO", "VITE_MOTION_KNOBS", "NODE_ENV"];

/** The JS chunks of a client build made in-process with `env` (and nothing else) set, as `vite build` makes them (write: false). */
async function chunks(env: Record<string, string>): Promise<Chunk[]> {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  try {
    for (const k of KEYS) delete process.env[k];
    process.env.NODE_ENV = "production"; // as the CLI runs it (vitest sets "test")
    Object.assign(process.env, env);
    const out = await build({ root: ROOT, configFile: join(ROOT, "vite.config.ts"), logLevel: "silent", build: { write: false } });
    const outputs = (Array.isArray(out) ? out : [out]) as { output?: { type: string; code?: string; fileName?: string; isEntry?: boolean }[] }[];
    return outputs.flatMap((o) => o.output ?? []).filter((c) => c.type === "chunk").map((c) => ({ fileName: c.fileName!, code: c.code!, isEntry: !!c.isEntry }));
  } finally {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}
const count = (all: Chunk[], word: string): number => all.reduce((n, c) => n + (c.code.split(word).length - 1), 0);
const NOT_THERE = ["registerPlugin", "@capacitor", "CapacitorStorage", "CapacitorException", "isNativePlatform"];

describe("M1: the web builds hold no Capacitor code", () => {
  for (const name of ["build", "build:online", "build:demo"]) {
    it(`npm run ${name}: one JS chunk; registerPlugin, @capacitor, CapacitorStorage, CapacitorException and isNativePlatform 0 times; Preferences and Capacitor once (identityMirror's read), as at the base`, async () => {
      const env = envOf(scripts[name]);
      expect(env.VITE_NATIVE, `${name} sets no VITE_NATIVE`).toBeUndefined();
      const all = await chunks(env);
      expect(all.map((c) => c.fileName), name).toHaveLength(1);
      for (const w of NOT_THERE) expect(count(all, w), `${name}: ${w}`).toBe(0);
      expect(count(all, "Preferences"), `${name}: Preferences`).toBe(1);
      expect(count(all, "Capacitor"), `${name}: Capacitor`).toBe(1);
      expect(count(all, "minimizeApp") + count(all, "appStateChange") + count(all, "backButton"), `${name}: the app's listeners`).toBe(0);
    }, 60_000);
  }

  it("the same with VITE_NATIVE set to anything but \"1\": the flag is the exact string", async () => {
    for (const v of ["", "0", "true", "yes"]) {
      const all = await chunks({ VITE_NATIVE: v });
      expect(all, JSON.stringify(v)).toHaveLength(1);
      expect(count(all, "registerPlugin"), JSON.stringify(v)).toBe(0);
    }
  }, 60_000);
});

describe("M1: npm run build:app holds the boot", () => {
  it("makes the boot its own lazy chunk (registerPlugin, isNativePlatform, the two plugins), keeps the page's entry free of it, and holds the literal Fly URL", async () => {
    const env = envOf(scripts["build:app"]);
    expect(env).toEqual({ VITE_GHOST_SERVER: "https://beltbattles.fly.dev", VITE_NATIVE: "1" });
    const all = await chunks(env);
    expect(all.length).toBeGreaterThan(1);
    const entry = all.filter((c) => c.isEntry);
    expect(entry).toHaveLength(1);
    const boot = all.filter((c) => c.code.includes("isNativePlatform"));
    expect(boot, "one chunk holds Capacitor's core").toHaveLength(1);
    expect(boot[0]).not.toBe(entry[0]);
    expect(boot[0].code).toContain("registerPlugin");
    expect(boot[0].code).toContain("minimizeApp");
    expect(boot[0].code).toContain("backButton");
    expect(boot[0].code).toContain("appStateChange");
    // the plugins' registrations are in their own chunks, loaded by the boot only after isNativePlatform is true
    expect(count(all, "CapacitorStorage")).toBe(1); // the Preferences web fallback's storage group, in a chunk nothing loads on a native platform
    // the entry reaches the boot only through a dynamic import, and holds none of Capacitor's code
    expect(entry[0].code).toMatch(/import\(`\.\/boot-[\w-]+\.js`\)|import\("\.\/boot-[\w-]+\.js"\)/);
    for (const w of ["registerPlugin", "isNativePlatform", "CapacitorStorage", "minimizeApp"]) expect(entry[0].code.includes(w), `entry: ${w}`).toBe(false);
    // the literal Fly URL in the entry: the app's server (same-origin would be https://localhost inside the app), and (S6, REQ-BFG-119) the
    // address of the privacy policy the PRIVACY row opens (src/net/privacyLink.ts SITE; the other two addresses there are not used by the client
    // and are not in the bundle). Two, no more: the pages themselves are in the server bundle only (tests/s6.server.test.ts)
    expect(count(all, "https://beltbattles.fly.dev")).toBe(2);
    expect(entry[0].code).toContain("https://beltbattles.fly.dev");
  }, 60_000);
});
