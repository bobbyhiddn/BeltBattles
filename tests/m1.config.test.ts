// M1 (BRIEF-M1 Goal 1): the Capacitor project's config files: capacitor.config.json (written by hand, never `cap init`), the
// pinned packages, the build:app script and the gitignored build folder. M1 was Android only; M2 (BRIEF-M2 Goal 1) added @capacitor/ios.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const json = <T = Record<string, unknown>>(rel: string): T => JSON.parse(read(rel)) as T;

interface Pkg {
  version: string;
  scripts: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}
const pkg = json<Pkg>("package.json");

/** Every script package.json had at m1-base (b300a9159c99), word for word: M1 adds build:app and changes nothing else. */
const BASE_SCRIPTS: Record<string, string> = {
  dev: "vite --host 0.0.0.0",
  build: "tsc --noEmit && vite build",
  "build:online": "tsc --noEmit && VITE_GHOST_SERVER=same-origin vite build --outDir dist-online",
  "build:demo": "tsc --noEmit && VITE_DEMO=1 vite build --outDir dist-demo",
  preview: "vite preview --host 0.0.0.0",
  test: "vitest run",
  shot: "node scripts/shot.mjs",
  "typecheck:server": "tsc -p tsconfig.server.json",
  "typecheck:tests": "node scripts/tscheck-tests.mjs",
  "build:server": "tsc -p tsconfig.server.json && vite build --config vite.server.config.ts",
  server: "npm run build:server && node server/dist/ghost-server.mjs",
  "gen:ghosts": "npm run build:server && node server/dist/gen-ghost-pool.mjs",
  "ghosts:admin": "npm run build:server && node server/dist/ghost-admin.mjs",
  stage: "node deploy/stage.mjs",
  smoke: "npm run build:server && vite build --ssr tools/smoke.ts --outDir tools/dist/smoke --emptyOutDir --logLevel warn && node tools/dist/smoke/smoke.js",
  "build:balance": "vite build --ssr tools/balance.ts --outDir tools/dist/balance --emptyOutDir --logLevel warn",
  balance: "npm run build:balance && node tools/dist/balance/balance.js",
  "build:standins": "vite build --ssr tools/genStandInPool.ts --outDir tools/dist/standins --emptyOutDir --logLevel warn",
  standins: "npm run build:standins && node tools/dist/standins/genStandInPool.js",
  "build:parbench": "vite build --ssr tools/parBench.ts --outDir tools/dist/parbench --emptyOutDir --logLevel warn",
  parbench: "npm run build:parbench && node tools/dist/parbench/parBench.js",
  "build:luckcaps": "vite build --ssr tools/luckCaps.ts --outDir tools/dist/luckcaps --emptyOutDir --logLevel warn",
  luckcaps: "npm run build:luckcaps && node tools/dist/luckcaps/luckCaps.js",
};

/** The packages, pinned exactly (npm install --save-exact): Capacitor 8's latest 8.x on 2026-10-26 (@capacitor/ios 8.5.3: 2026-10-27). */
const PINS: Record<string, string> = {
  "@capacitor/core": "8.5.3",
  "@capacitor/android": "8.5.3",
  "@capacitor/ios": "8.5.3",
  "@capacitor/app": "8.1.2",
  "@capacitor/preferences": "8.0.1",
};
const CLI_PIN = "8.5.3";

describe("M1 Goal 1: capacitor.config.json", () => {
  const cfg = json<Record<string, unknown>>("capacitor.config.json");

  it("is hand-written JSON at the repo root, and there is no capacitor.config.ts beside it (a root .ts file sits in no typecheck gate)", () => {
    expect(existsSync(join(ROOT, "capacitor.config.json"))).toBe(true);
    expect(existsSync(join(ROOT, "capacitor.config.ts"))).toBe(false);
    expect(existsSync(join(ROOT, "capacitor.config.js"))).toBe(false);
  });

  it("names the app: appId com.bobbyhiddn.beltbattles, appName BeltBattles (the page's title), webDir dist-app, backgroundColor #050B12", () => {
    expect(cfg.appId).toBe("com.bobbyhiddn.beltbattles");
    expect(cfg.appName).toBe("BeltBattles");
    expect(cfg.webDir).toBe("dist-app");
    expect(cfg.backgroundColor).toBe("#050B12");
    const html = read("index.html");
    expect(html).toContain(`<title>${cfg.appName}</title>`);
    // the WebView's colour is the page's own: index.html's html/body background and theme-color
    expect(html.toLowerCase()).toContain("background: #050b12;");
    expect(html.toLowerCase()).toContain('name="theme-color" content="#050b12"');
  });

  it("has no server block at all: no server.url, no cleartext, no allowNavigation, no hostname or scheme change (Android serves the bundle at https://localhost)", () => {
    expect("server" in cfg).toBe(false);
    const text = read("capacitor.config.json");
    for (const word of ["server", "cleartext", "allowNavigation", "hostname", "androidScheme", "iosScheme", "url"]) expect(text, word).not.toContain(word);
    expect(text).not.toMatch(/https?:\/\//);
  });

  it("holds only the fields a goal needs: the app's four names and SystemBars (light icons on the dark game; the viewport-fit hint, so the first layout doesn't jump)", () => {
    expect(Object.keys(cfg).sort()).toEqual(["appId", "appName", "backgroundColor", "plugins", "webDir"]);
    expect(cfg.plugins).toEqual({ SystemBars: { style: "DARK", initialViewportFitValueHint: "cover" } });
    // the hint is true: the page asks for the whole screen, which is what C1's #stage padding then clears
    expect(read("index.html")).toMatch(/viewport-fit=cover/);
  });
});

describe("M1 Goal 1: package.json and the lock", () => {
  it("pins exactly the six Capacitor packages: five dependencies and the CLI as a devDependency, no ^ or ~", () => {
    expect(pkg.dependencies).toEqual(PINS);
    expect(pkg.devDependencies?.["@capacitor/cli"]).toBe(CLI_PIN);
    for (const v of [...Object.values(pkg.dependencies ?? {}), pkg.devDependencies?.["@capacitor/cli"] ?? ""]) expect(v).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("adds nothing else: no splash-screen, assets, http or other plugin, and no other runtime dependency", () => {
    const all = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    expect(Object.keys(all).filter((n) => n.startsWith("@capacitor/")).sort()).toEqual(["@capacitor/android", "@capacitor/app", "@capacitor/cli", "@capacitor/core", "@capacitor/ios", "@capacitor/preferences"]);
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual(Object.keys(PINS).sort());
    expect(Object.keys(pkg.devDependencies ?? {}).sort()).toEqual(["@capacitor/cli", "playwright-core", "typescript", "vite", "vitest"]);
    // the four dev tools keep the ranges they had at the base
    expect(pkg.devDependencies).toMatchObject({ "playwright-core": "^1.55.0", typescript: "~5.9.3", vite: "^8.2.2", vitest: "^4.0.0" });
  });

  it("package-lock.json agrees: the root lists the same pins, and each package resolves to its pin (cli as a dev package)", () => {
    const lock = json<{ lockfileVersion: number; packages: Record<string, { version?: string; dev?: boolean; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }> }>("package-lock.json");
    expect(lock.lockfileVersion).toBe(3);
    expect(lock.packages[""].dependencies).toEqual(PINS);
    expect(lock.packages[""].devDependencies?.["@capacitor/cli"]).toBe(CLI_PIN);
    for (const [name, v] of Object.entries(PINS)) {
      expect(lock.packages[`node_modules/${name}`]?.version, name).toBe(v);
      expect(lock.packages[`node_modules/${name}`]?.dev, `${name} is a runtime package`).not.toBe(true);
    }
    expect(lock.packages["node_modules/@capacitor/cli"]?.version).toBe(CLI_PIN);
    expect(lock.packages["node_modules/@capacitor/cli"]?.dev).toBe(true);
  });

  it("build:app is the one new script, exactly: tsc, then the literal Fly URL and VITE_NATIVE=1, into dist-app (same-origin would mean https://localhost inside the app)", () => {
    expect(pkg.scripts["build:app"]).toBe("tsc --noEmit && VITE_GHOST_SERVER=https://beltbattles.fly.dev VITE_NATIVE=1 vite build --outDir dist-app");
    expect(pkg.scripts["build:app"]).not.toContain("same-origin");
    expect(Object.keys(pkg.scripts).filter((n) => !(n in BASE_SCRIPTS))).toEqual(["build:app"]);
  });

  it("every other script is the one the base had, word for word; no other build sets VITE_NATIVE", () => {
    for (const [name, line] of Object.entries(BASE_SCRIPTS)) expect(pkg.scripts[name], name).toBe(line);
    for (const [name, line] of Object.entries(pkg.scripts)) if (name !== "build:app") expect(line, name).not.toMatch(/VITE_NATIVE/);
  });

  it(".gitignore keeps dist-app/ (the app's web build) out of git beside the other build folders", () => {
    const lines = read(".gitignore").split("\n");
    for (const dir of ["dist/", "dist-online/", "dist-demo/", "dist-app/"]) expect(lines).toContain(dir);
  });
});
