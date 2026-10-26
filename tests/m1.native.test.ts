// M1 (BRIEF-M1 Goals 2 and 3), the WEB side and the shape of the code: the build flag, the web path (no Capacitor, no mirror, a
// non-extractable key), the text of main.ts and of src/ (ONE import() of the boot, behind the inline VITE_NATIVE test; no @capacitor
// import outside src/native/boot.ts), the boot on a page that is not a native platform (it registers nothing), and the Back button's
// map in the game (Game.back, the title's atRoot). The app's side, with the real Capacitor modules over a fake native bridge, is
// tests/m1.native.app.test.ts (its own file: Node caches the externalized @capacitor/core per test file, and its platform is fixed when
// it is first loaded).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Modal } from "../src/game/game";
import { NATIVE } from "../src/native";
import { loadIdentity, memoryKeyStore } from "../src/net/identity";
import { MIRROR_JWK, capacitorMirror } from "../src/net/identityMirror";
import { TitleScreen } from "../src/screens/title";
import { makeGame } from "./c1.gameHarness";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
/** A source file's text without its comments, read as a small tokenizer would: a comment starts only outside a string, and a `/*` inside a
 *  `//` line (this repo's comments name `@capacitor/*`) is not a block comment. Regex literals holding a quote are not understood; none of
 *  the files read this way has one. */
function stripComments(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; ) {
    const c = s[i], d = s[i + 1];
    if (c === "/" && d === "/") {
      while (i < s.length && s[i] !== "\n") i++;
    } else if (c === "/" && d === "*") {
      i += 2;
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++;
      i += 2;
    } else if (c === '"' || c === "'" || c === "`") {
      out += s[i++];
      while (i < s.length && s[i] !== c) {
        if (s[i] === "\\") out += s[i++];
        out += s[i++];
      }
      out += s[i++] ?? "";
    } else out += s[i++];
  }
  return out;
}
const code = (rel: string): string => stripComments(read(rel));
function walk(rel: string): string[] {
  return readdirSync(join(ROOT, rel)).flatMap((n) => (statSync(join(ROOT, rel, n)).isDirectory() ? walk(`${rel}/${n}`) : [`${rel}/${n}`]));
}

describe("M1 Goal 2: the flag, and the web path that never sees Capacitor", () => {
  it("NATIVE is false under vitest (VITE_NATIVE is set by npm run build:app only), typed like VITE_DEMO, and its comment says it never guards the boot's import()", () => {
    expect(NATIVE).toBe(false);
    expect(read("src/native.ts")).toMatch(/export const NATIVE: boolean = import\.meta\.env\.VITE_NATIVE === "1";/);
    expect(read("src/native.ts")).toMatch(/NEVER GUARDS THE BOOT'S import\(\)/);
    expect(read("src/env.d.ts")).toMatch(/readonly VITE_NATIVE\?: string;/);
    expect(read("package.json")).toContain("VITE_NATIVE=1 vite build --outDir dist-app");
  });

  it("on the web path capacitorMirror() is null, nothing registers Preferences, and a fresh key is non-extractable and in IndexedDB's store only", async () => {
    const g = globalThis as { Capacitor?: unknown };
    expect(g.Capacitor).toBeUndefined(); // no @capacitor/core has been loaded by anything the web runs
    expect(capacitorMirror()).toBeNull();
    const store = memoryKeyStore();
    const id = await loadIdentity(store, undefined, { links: null }); // the default mirror: capacitorMirror(), null here
    expect(id).not.toBeNull();
    const pair = (await store.get())!;
    expect(pair.privateKey.extractable).toBe(false); // for good: it can never be mirrored later (IDENT-1 open question 2)
    await expect(globalThis.crypto.subtle.exportKey("jwk", pair.privateKey)).rejects.toThrow();
    expect(g.Capacitor).toBeUndefined();
    expect(MIRROR_JWK).toBe("beltbattles.identity.jwk.v1");
  });

  it("main.ts holds ONE import(), of the boot, as the first statement of the inline `import.meta.env.VITE_NATIVE === \"1\"` test; never `if (NATIVE)`", () => {
    const main = code("src/main.ts");
    expect([...main.matchAll(/\bimport\s*\(/g)].length).toBe(1);
    expect(main).toMatch(/if \(import\.meta\.env\.VITE_NATIVE === "1"\) \{\s*import\("\.\/native\/boot"\)/);
    expect(main).not.toMatch(/\bNATIVE\b/); // the const from src/native.ts is not what guards it (this Vite does not fold it across modules)
    expect(main).not.toMatch(/from "\.\/native"/);
    expect(main).not.toMatch(/from "\.\/native\//); // and no static import of the boot
    expect(main).not.toMatch(/@capacitor/);
  });

  it("the boot's result only decides WHEN the game starts: then, catch and finally(start), and the web path is start() at once", () => {
    const main = code("src/main.ts");
    expect(main).toMatch(/\.then\(\(m\) => m\.installNative\(\{ back: \(\) => \(game as Game \| undefined\)\?\.back\(\) \?\? true \}\)\)/);
    expect(main).toMatch(/\.catch\(\(e\) => console\.error\([^)]*\)\)\s*\.finally\(start\);/);
    expect(main).toMatch(/\} else \{\s*start\(\);\s*\}/);
    // the first loadIdentity (startOnline) and the Game are made by start(), after the boot on the app path, at once on the web
    const body = main.slice(main.indexOf("const start = (): void => {"));
    expect(body).toContain("if (serverUrl) startOnline(serverUrl);");
    expect(body.indexOf("if (serverUrl) startOnline(serverUrl);")).toBeLessThan(body.indexOf("game = new Game(canvas, (g) => new TitleScreen(g));"));
    // nothing before start() reads the identity or opens the online session
    const before = main.slice(0, main.indexOf("const start = (): void => {"));
    expect(before).not.toMatch(/startOnline\(|loadIdentity|onlineSession\(/);
    expect(before.match(/new Game\(/g)).toBeNull();
    // the first import is still firstRun's (CARD-4's test)
    expect(read("src/main.ts").split("\n").filter((l) => /^import\s/.test(l))[0]).toMatch(/^import "\.\/ui\/firstRun";/);
  });

  it("no src file but src/native/boot.ts imports @capacitor/* (identityMirror.ts and native.ts only NAME the package in comments)", () => {
    const files = walk("src").filter((f) => /\.(ts|tsx|js|mjs)$/.test(f));
    expect(files.length).toBeGreaterThan(100);
    for (const f of files) {
      if (f === "src/native/boot.ts") continue;
      expect(code(f), f).not.toMatch(/@capacitor/);
    }
    // the only place the package names are the boot's: core statically, the two plugins each behind their own import()
    const boot = code("src/native/boot.ts");
    expect([...boot.matchAll(/from "(@capacitor\/[\w-]+)"/g)].map((m) => m[1])).toEqual(["@capacitor/core"]);
    expect([...boot.matchAll(/import\("(@capacitor\/[\w-]+)"\)/g)].map((m) => m[1])).toEqual(["@capacitor/preferences", "@capacitor/app"]);
    // ... in this order, after the platform test: isNativePlatform, then Preferences (the key mirror), then the app's listeners
    const at = (s: string): number => boot.indexOf(s);
    expect(at("Capacitor.isNativePlatform()")).toBeGreaterThan(-1);
    expect(at("Capacitor.isNativePlatform()")).toBeLessThan(at('import("@capacitor/preferences")'));
    expect(at('import("@capacitor/preferences")')).toBeLessThan(at('import("@capacitor/app")'));
    // the app is never exited from here
    expect(boot).not.toMatch(/exitApp/);
  });

  it("this repo's Vite does not fold a const imported across modules, so the boot's guard is inline: the fold check's two shapes are in the gates folder's record", () => {
    // the record itself lives outside the repo (WS/output-m1/gates/m1base-foldcheck.txt); what the repo pins is the rule's own text
    expect(read("src/native.ts")).toContain("folds that inline test but NOT a const imported from another module");
    expect(read("src/native.ts")).toContain("`if (NATIVE) import(\"./native/boot\")`");
  });
});

describe("M1 Goal 2: the boot on a page that is not a native platform (dist-app opened in a desktop browser)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers nothing: no Preferences, no App, no mirror, and the game's Back hook is never called", async () => {
    const { Capacitor } = await import("@capacitor/core");
    expect(Capacitor.isNativePlatform()).toBe(false); // no androidBridge, no iOS bridge: Capacitor says "web"
    const { installNative } = await import("../src/native/boot");
    const host = { back: vi.fn(() => true) };
    await installNative(host);
    const plugins = (globalThis as unknown as { Capacitor: { Plugins: Record<string, unknown> } }).Capacitor.Plugins;
    expect(plugins.Preferences).toBeUndefined();
    expect(plugins.App).toBeUndefined();
    expect(capacitorMirror()).toBeNull();
    expect(host.back).not.toHaveBeenCalled();
    // and a key made now is still the web's: non-extractable, no JWK anywhere
    const store = memoryKeyStore();
    await loadIdentity(store, undefined, { links: null });
    expect((await store.get())!.privateKey.extractable).toBe(false);
  });
});

describe("M1 Goal 3: the Back button's map (Game.back), over a real Game on fakes", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined, removeItem: () => undefined, key: () => null, length: 0, clear: () => undefined });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const modalCard = (): Modal & { keys: string[] } => {
    const keys: string[] = [];
    return { keys, draw() {}, key: (k: string) => void keys.push(k), dispose() {} };
  };

  it("with nothing open on the root screen Back is Escape and says so: false, the one case where the app minimizes", () => {
    const keys: string[] = [];
    const { game } = makeGame({ w: 800, h: 450, dpr: 1, screen: { key: (k: string) => void keys.push(k), atRoot: () => true } });
    expect(game.back()).toBe(false);
    expect(keys).toEqual(["Escape"]); // the screen was given Escape all the same: Escape at the bare title does nothing
  });

  it("on any other screen, or on the root screen with a card up, Back is Escape and is used: true, never a minimize", () => {
    const keys: string[] = [];
    const other = makeGame({ w: 800, h: 450, dpr: 1, screen: { key: (k: string) => void keys.push(k) } });
    expect(other.game.back()).toBe(true); // no atRoot: a mid-run screen
    expect(keys).toEqual(["Escape"]);
    let open = true;
    const root = makeGame({ w: 800, h: 450, dpr: 1, screen: { key: (k: string) => void (k === "Escape" && (open = false)), atRoot: () => !open } });
    expect(root.game.back()).toBe(true); // a card was open: Escape closed it
    expect(root.game.back()).toBe(false); // now the title is bare: the next Back minimizes
  });

  it("a modal card has Back first (its own Escape), and the screen under it is not asked; so a card over the bare title is not 'bare'", () => {
    const keys: string[] = [];
    const { game } = makeGame({ w: 800, h: 450, dpr: 1, screen: { key: (k: string) => void keys.push(k), atRoot: () => true } });
    const card = modalCard();
    game.openModal(card);
    expect(game.back()).toBe(true);
    expect(card.keys).toEqual(["Escape"]);
    expect(keys).toEqual([]);
    game.closeModal();
    expect(game.back()).toBe(false);
  });

  it("during a screen change nothing is asked and nothing minimizes: Back is used (true), and Escape is ignored by the wipe", () => {
    const keys: string[] = [];
    const { game } = makeGame({ w: 800, h: 450, dpr: 1, screen: { key: (k: string) => void keys.push(k), atRoot: () => true } });
    game.go({ update() {}, draw() {}, enter() {} });
    expect(game.transitioning).toBe(true);
    expect(game.back()).toBe(true);
    expect(keys).toEqual([]);
  });

  it("the real title: bare, Back is false (minimize); with HOW TO PLAY or OPTIONS open, Back closes it and is true; then bare again", () => {
    const { game, doc } = makeGame({ w: 800, h: 450, dpr: 1 });
    // the stand-in document has no createElement; the title's sprites and attract battle want canvases (c1.screens.test.ts's stub)
    (doc as unknown as { createElement: () => unknown }).createElement = () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }) }) });
    const title = new TitleScreen(game);
    game.go(title);
    for (let i = 0; i < 8; i++) game.step(0.2); // the wipe closes (0.24 s), swaps the screen, opens (0.24 s)
    expect(game.transitioning).toBe(false);
    expect(game.screen).toBe(title);
    expect(title.atRoot()).toBe(true);
    expect(game.back()).toBe(false);
    title.help = true;
    expect(title.atRoot()).toBe(false);
    expect(game.back()).toBe(true);
    expect(title.help).toBe(false);
    (title as unknown as { menu: boolean }).menu = true;
    expect(title.atRoot()).toBe(false);
    expect(game.back()).toBe(true);
    expect((title as unknown as { menu: boolean }).menu).toBe(false);
    expect(game.back()).toBe(false);
  });
});

describe("M1 Goal 3: what a background kill loses (no save on pause is added)", () => {
  it("every change to the build is saved as it is made (touched(), reroll, packs) and every screen change saves too, so a kill loses what a web reload would", () => {
    const build = code("src/screens/build/build.ts");
    expect(build).toMatch(/touched\(\): void \{[^}]*saveRun\(this\.run\);/);
    for (const f of ["src/screens/battle.ts", "src/screens/fork/fork.ts", "src/screens/event/event.ts", "src/screens/hero.ts", "src/screens/summary.ts"]) expect(code(f), f).toMatch(/saveRun\(/);
    // so the app's pause hook is audio only: it never touches the run
    const boot = code("src/native/boot.ts");
    expect(boot).not.toMatch(/saveRun|localStorage/);
    expect(boot).toMatch(/pauseAudio\(\)/);
    expect(boot).toMatch(/resumeAudio\(\)/);
  });
});
