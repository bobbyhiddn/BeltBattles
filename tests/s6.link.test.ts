// S6 (REQ-BFG-119) Goal 3: the game links to the privacy policy. In process, no network, no new package.
//  - src/net/privacyLink.ts holds the three absolute addresses; they are the server's routes (server/pages.ts), the listings' fields and the pages' own links;
//  - openOutside: a new tab on the web (window.open, "_blank", "noopener"), a top-level navigation in the phone apps, which Capacitor 8.5.3's own native code
//    hands to the system browser (the lines privacyLink.ts cites are read here), with no @capacitor/browser and no allowNavigation;
//  - the PRIVACY row: last of the title's four extra rows (LINK A DEVICE, MY PLAYER ID, DELETE MY ONLINE DATA, PRIVACY; S6D put MY PLAYER ID between LINK and
//    DELETE, so PRIVACY moved from the third place to the fourth), below DELETE MY ONLINE DATA, on whatever the session is (also offline) and in the demo flag's
//    build; its tap calls the opener with PRIVACY_URL; the card still fits every view; and the tap runs INSIDE the pointerup event (a user gesture), through
//    the game's own input chain (io.ts bindInput -> Game.pointerDown/pointerUp -> the region's onTap -> window.open).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { bindInput, computeView, defaultScale, type InputSink } from "../src/core/io";
import { Game } from "../src/game/game";
import { PRIVACY_DELETE_URL, PRIVACY_URL, SITE, SUPPORT_URL, openOutside, pageHost, type OutsideHost } from "../src/net/privacyLink";
import type { Identity } from "../src/net/identity";
import type { G } from "../src/render/pixel";
import { WORDS, optionsExtras, type Availability } from "../src/screens/linkCards";
import { titleScale } from "../src/screens/titleLayout";
import { NOTE_ROW, optionsCard, optionsGeometry } from "../src/ui/hud";
import { UI } from "../src/ui/ui";
import { INFO_ROUTES } from "../server/pages";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const lines = (rel: string): string[] => read(rel).split("\n");
/** The text of lines a..b (1-based, inclusive) of a file. */
const span = (rel: string, a: number, b: number): string => lines(rel).slice(a - 1, b).join("\n");

// ------------------------------------------------------------------------------------------------------------------ the addresses
describe("S6 Goal 3: the three addresses are absolute, and are the server's routes, the listings' fields and the pages' own links", () => {
  it("https://beltbattles.fly.dev/privacy, /privacy#delete and /support", () => {
    expect([SITE, PRIVACY_URL, PRIVACY_DELETE_URL, SUPPORT_URL]).toEqual([
      "https://beltbattles.fly.dev", "https://beltbattles.fly.dev/privacy", "https://beltbattles.fly.dev/privacy#delete", "https://beltbattles.fly.dev/support",
    ]);
    for (const u of [PRIVACY_URL, PRIVACY_DELETE_URL, SUPPORT_URL]) expect(new URL(u).protocol).toBe("https:"); // absolute: the itch.io build runs on another host
  });

  it("the paths are routes the server serves (pages.ts), under the host fly.toml's app name gives", () => {
    expect(Object.keys(INFO_ROUTES)).toEqual(expect.arrayContaining([new URL(PRIVACY_URL).pathname, new URL(SUPPORT_URL).pathname]));
    expect(read("fly.toml")).toMatch(/^app = "beltbattles"$/m); // https://beltbattles.fly.dev
    expect(read("server/app.ts")).toContain('case "/privacy":');
  });

  it("the listings carry them: both the Privacy Policy URL and the Support URL; Play also the data deletion URL", () => {
    for (const f of ["store/listing/apple.md", "store/listing/play.md"]) {
      const t = read(f);
      expect(t, f).toMatch(new RegExp(`^## Privacy [Pp]olicy URL \\([^\\n]*\\)\\n\\n${PRIVACY_URL}\\n`, "m"));
      expect(t, f).toMatch(new RegExp(`^## Support URL \\([^\\n]*\\)\\n\\n${SUPPORT_URL}\\n`, "m"));
    }
    expect(read("store/listing/play.md")).toMatch(new RegExp(`^## Data deletion URL \\([^\\n]*\\)\\n\\n${PRIVACY_DELETE_URL}\\n`, "m"));
  });

  it("the pages point at each other with the same addresses, and #delete is an id on the privacy page", () => {
    const privacy = read("server/pages/privacy.html"), support = read("server/pages/support.html");
    expect(privacy).toContain(`<code>${PRIVACY_URL}</code>`);
    expect(privacy).toContain(`href="${SUPPORT_URL}"`);
    expect(support).toContain(`href="${PRIVACY_URL}"`);
    expect(support).toContain(`href="${PRIVACY_DELETE_URL}"`);
    expect(privacy).toContain(`<section id="${new URL(PRIVACY_DELETE_URL).hash.slice(1)}">`);
  });
});

// ------------------------------------------------------------------------------------------------------------------ the opener
describe("S6 Goal 3: openOutside", () => {
  const host = (native: boolean): { host: OutsideHost; opened: unknown[][]; navigated: string[] } => {
    const opened: unknown[][] = [], navigated: string[] = [];
    return { host: { native, open: (...a) => void opened.push(a), navigate: (u) => void navigated.push(u) }, opened, navigated };
  };

  it("the web: window.open(url, '_blank', 'noopener'), one new tab, no navigation of the game", () => {
    const h = host(false);
    openOutside(PRIVACY_URL, h.host);
    expect(h.opened).toEqual([[PRIVACY_URL, "_blank", "noopener"]]);
    expect(h.navigated).toEqual([]);
  });

  it("the phone apps: a top-level navigation to the address, and no window.open", () => {
    const h = host(true);
    openOutside(PRIVACY_URL, h.host);
    expect(h.navigated).toEqual([PRIVACY_URL]);
    expect(h.opened).toEqual([]);
  });

  describe("the page's own host", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      vi.resetModules();
    });
    const fakeWindow = () => {
      const w = { open: vi.fn(), location: { assign: vi.fn() } };
      vi.stubGlobal("window", w);
      return w;
    };

    it("in a web build (NATIVE false) it is window.open with the address, _blank and noopener", () => {
      const w = fakeWindow();
      expect(pageHost().native).toBe(false);
      openOutside(PRIVACY_URL);
      expect(w.open).toHaveBeenCalledTimes(1);
      expect(w.open).toHaveBeenCalledWith(PRIVACY_URL, "_blank", "noopener");
      expect(w.location.assign).not.toHaveBeenCalled();
    });

    it("in the app build (VITE_NATIVE=1) it is window.location.assign with the address", async () => {
      const w = fakeWindow();
      vi.stubEnv("VITE_NATIVE", "1");
      vi.resetModules();
      const fresh = await import("../src/net/privacyLink");
      expect(fresh.pageHost().native).toBe(true);
      fresh.openOutside(fresh.PRIVACY_URL);
      expect(w.location.assign).toHaveBeenCalledTimes(1);
      expect(w.location.assign).toHaveBeenCalledWith(PRIVACY_URL);
      expect(w.open).not.toHaveBeenCalled();
    });
  });

  it("no new package: privacyLink.ts imports only the build flag, package.json holds no @capacitor/browser, the dependencies are M1's and M2's", () => {
    const src = read("src/net/privacyLink.ts");
    expect([...src.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1])).toEqual(["../native"]);
    const code = src.split("\n").filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join("\n"); // the comments cite Capacitor's files; the code names no package
    expect(code).not.toMatch(/@capacitor|import\(|require\(/);
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies).sort()).toEqual(["@capacitor/android", "@capacitor/app", "@capacitor/core", "@capacitor/ios", "@capacitor/preferences"]);
    expect(Object.keys(pkg.devDependencies).sort()).toEqual(["@capacitor/cli", "playwright-core", "typescript", "vite", "vitest"]);
    expect(pkg.dependencies["@capacitor/android"]).toBe("8.5.3");
    expect(pkg.dependencies["@capacitor/ios"]).toBe("8.5.3");
  });
});

// ------------------------------------------------------------------------------------------------------------------ Capacitor's own code
describe("S6 Goal 3: Capacitor 8.5.3's native code does what privacyLink.ts says it does (file and line, as cited)", () => {
  const A = "node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor";
  const I = "node_modules/@capacitor/ios/Capacitor/Capacitor";

  it("the installed Capacitor is 8.5.3", () => {
    for (const p of ["android", "ios", "core"]) expect((JSON.parse(read(`node_modules/@capacitor/${p}/package.json`)) as { version: string }).version).toBe("8.5.3");
  });

  it("Android: shouldOverrideUrlLoading -> launchIntent starts ACTION_VIEW for a host that is not the app's own and not in allowNavigation, and the WebView stays", () => {
    expect(span(`${A}/BridgeWebViewClient.java`, 26, 30)).toMatch(/public boolean shouldOverrideUrlLoading\(WebView view, WebResourceRequest request\) \{\s*Uri url = request\.getUrl\(\);\s*return bridge\.launchIntent\(url\);\s*\}/);
    const launch = span(`${A}/Bridge.java`, 389, 427);
    expect(launch).toContain("public boolean launchIntent(Uri url)");
    expect(span(`${A}/Bridge.java`, 413, 425)).toMatch(/!\(appUri\.getHost\(\)\.equals\(url\.getHost\(\)\) && url\.getScheme\(\)\.equals\(appUri\.getScheme\(\)\)\) &&\s*!appAllowNavigationMask\.matches\(url\.getHost\(\)\)/);
    expect(span(`${A}/Bridge.java`, 418, 420)).toMatch(/Intent openIntent = new Intent\(Intent\.ACTION_VIEW, url\);\s*getContext\(\)\.startActivity\(openIntent\);/);
    expect(span(`${A}/Bridge.java`, 424, 424)).toContain("return true;");
    // window.open: JavaScript may open windows, and Capacitor never asks for multiple windows nor handles onCreateWindow
    expect(span(`${A}/Bridge.java`, 593, 593)).toContain("settings.setJavaScriptCanOpenWindowsAutomatically(true);");
    const dir = join(ROOT, A);
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".java") && statSync(join(dir, n)).isFile())) {
      expect(read(`${A}/${f}`), f).not.toMatch(/setSupportMultipleWindows|onCreateWindow/);
    }
  });

  it("iOS: a main-frame navigation outside allowNavigation and the app's own URL is cancelled and opened with UIApplication.shared.open; window.open too (createWebViewWith)", () => {
    const f = `${I}/WebViewDelegationHandler.swift`;
    expect(span(f, 67, 67)).toContain("decidePolicyFor navigationAction: WKNavigationAction");
    expect(span(f, 101, 105)).toMatch(/bridge\.config\.shouldAllowNavigation\(to: host\)/);
    expect(span(f, 108, 112)).toMatch(/toplevelNavigation = \(navigationAction\.targetFrame == nil \|\| navigationAction\.targetFrame\?\.isMainFrame == true\)[\s\S]*isApplicationNavigation = navURL\.absoluteString\.starts\(with: bridge\.config\.serverURL\.absoluteString\)/);
    expect(span(f, 114, 121)).toMatch(/if !isApplicationNavigation, toplevelNavigation \{[\s\S]*UIApplication\.shared\.open\(navURL, options: \[:\], completionHandler: nil\)[\s\S]*decisionHandler\(\.cancel\)/);
    expect(span(f, 334, 339)).toMatch(/createWebViewWith configuration[\s\S]*UIApplication\.shared\.open\(url, options: \[:\], completionHandler: nil\)[\s\S]*return nil/);
  });

  it("the app has no allowNavigation (a navigation to beltbattles.fly.dev would stay in the game's WebView if it had) and the privacy host is not the app's own", () => {
    const cfg = JSON.parse(read("capacitor.config.json")) as Record<string, unknown>;
    expect(Object.keys(cfg).sort()).toEqual(["appId", "appName", "backgroundColor", "plugins", "webDir"]);
    expect(cfg.server).toBeUndefined();
    // the app is served from https://localhost (Android) and capacitor://localhost (iOS), never from the game's server
    expect(new URL(PRIVACY_URL).hostname).not.toBe("localhost");
  });
});

// ------------------------------------------------------------------------------------------------------------------ the row
interface Placed { s: string }
function recCanvas(): { width: number; height: number; getContext: () => G } {
  const c: { width: number; height: number; getContext: () => G } = { width: 0, height: 0, getContext: () => g };
  const st: Record<string, unknown> = {
    canvas: c, fillStyle: "#000000", strokeStyle: "#000000", globalAlpha: 1, imageSmoothingEnabled: false, lineWidth: 1,
    globalCompositeOperation: "source-over", font: "10px sans-serif", textAlign: "start", textBaseline: "alphabetic", filter: "none",
  };
  const g = new Proxy(st, {
    get(t, k) {
      if (typeof k !== "string") return undefined;
      if (k in t) return t[k];
      if (k === "getImageData" || k === "createImageData") return (_x: number, _y: number, w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h });
      if (k === "measureText") return () => ({ width: 0 });
      if (k === "createLinearGradient" || k === "createRadialGradient" || k === "createPattern") return () => ({ addColorStop() {} });
      return () => undefined;
    },
    set(t, k, v) {
      if (typeof k === "string") t[k] = v;
      return true;
    },
  }) as unknown as G;
  return c;
}

/** The title's view and its buttons' size factor on a CSS viewport, as the game computes them (tests/m1.options.test.ts). */
function titleView(cssW: number, cssH: number, dpr: number) {
  const v = computeView(cssW, cssH, dpr, (pw, ph, p) => titleScale(pw, ph, p, dpr));
  const pw = Math.floor(cssW * dpr), ph = Math.floor(cssH * dpr);
  const menu = defaultScale(pw, ph, v.portrait);
  return { ...v, menu, k: menu / v.scale, css: v.scale / v.dpr, pw, ph };
}
type TV = ReturnType<typeof titleView>;
const VIEWS: [string, number, number, number][] = [
  ["desk 1280x800", 1280, 800, 1], ["op690 402x690 @3", 402, 690, 3], ["small 360x640 @2", 360, 640, 2], ["phone on its side 844x390 @3", 844, 390, 3],
  ["phone on its side 740x360 @3", 740, 360, 3],
];

function stubGame(tv: TV): Game {
  return {
    run: null, audio: { mode: 0, play: () => undefined, unlock() {}, music() {} }, view: tv, W: tv.W, H: tv.H, portrait: tv.portrait, t: 0, ui: new UI(),
    canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: (tv.W * tv.scale) / tv.dpr, height: (tv.H * tv.scale) / tv.dpr }) },
    toast() {}, error() {}, soundButton() {}, cycleSound() {}, transitioning: false, resize() {}, go() {}, openName() {}, modal: null, openModal() {}, closeModal() {},
  } as unknown as Game;
}

const ME: Identity = { playerId: "A".repeat(43), publicKey: new Uint8Array(65), sign: async () => ({ key: "k", sig: "s" }) };
const STATES: [string, Availability][] = [
  ["online", { on: true, session: { url: "https://ghosts.example", identity: ME } }],
  ["no session (offline, or a build with no server)", { on: false, why: WORDS.offNone }],
  ["failed", { on: false, why: WORDS.offFailed }],
  ["loading", { on: false, why: WORDS.offLoading }],
];
const done = { id: "optdone", label: "DONE", primary: true, onTap: () => undefined };

beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: () => "ANNA", setItem: () => undefined, removeItem: () => undefined, key: () => null, length: 0, clear: () => undefined });
  vi.stubGlobal("document", { createElement: () => recCanvas() }); // the font's glyph cache makes canvases
});
afterEach(() => vi.unstubAllGlobals());

describe("S6 Goal 3: the PRIVACY row", () => {
  it("is the last extra row (the fourth since S6D put MY PLAYER ID before DELETE), below DELETE MY ONLINE DATA, labelled PRIVACY, and takes a tap in every state; LINK, MY PLAYER ID and DELETE are off when there is no session", () => {
    for (const [state, a] of STATES) {
      const game = stubGame(titleView(402, 690, 3));
      const x = optionsExtras(game, () => 1, { availability: () => a });
      expect(x.rows.map((r) => r.id), state).toEqual(["opt-link", "opt-id", "opt-delete", "opt-privacy"]);
      expect(x.rows.map((r) => r.label), state).toEqual([WORDS.linkRow, WORDS.idRow, WORDS.deleteRow, "PRIVACY"]);
      const [link, id, del, privacy] = x.rows;
      expect(!!link.disabled && !!id.disabled && !!del.disabled, state).toBe(!a.on);
      expect(privacy.disabled, state).toBeFalsy();
      expect(typeof privacy.onTap, state).toBe("function");
      expect(x.note, state).toBe(a.on ? undefined : a.why); // the one line is about LINK, MY PLAYER ID and DELETE
    }
    expect(WORDS.privacyRow).toBe("PRIVACY"); // one word, like the others
  });

  it("its tap opens PRIVACY_URL through the opener, once, and LINK, MY PLAYER ID and DELETE open nothing outside", () => {
    for (const [state, a] of STATES) {
      const opened: string[] = [];
      const game = stubGame(titleView(402, 690, 3));
      const x = optionsExtras(game, () => 1, { availability: () => a, openOutside: (u) => void opened.push(u) });
      x.rows[3].onTap!();
      expect(opened, state).toEqual([PRIVACY_URL]);
      if (a.on) {
        const modals: unknown[] = [];
        (game as unknown as { openModal: (m: unknown) => void }).openModal = (m) => void modals.push(m);
        x.rows[0].onTap!();
        x.rows[1].onTap!();
        x.rows[2].onTap!();
        expect(modals.length, state).toBe(3);
      }
      expect(opened, state).toEqual([PRIVACY_URL]);
    }
  });

  it("with no opener handed in, the tap goes to window.open (the web) with the address", () => {
    const w = { open: vi.fn(), location: { assign: vi.fn() } };
    vi.stubGlobal("window", w);
    const game = stubGame(titleView(402, 690, 3));
    optionsExtras(game, () => 1, { availability: () => STATES[1][1] }).rows[3].onTap!();
    expect(w.open).toHaveBeenCalledWith(PRIVACY_URL, "_blank", "noopener");
  });

  it("is on in the demo flag's build too: nothing in linkCards.ts reads DEMO, NATIVE or the build, and a VITE_DEMO=1 import gives the same row", async () => {
    const src = read("src/screens/linkCards.ts");
    expect(src).not.toMatch(/from "\.\.\/demo"|from "\.\.\/native"|import\.meta\.env|\bDEMO\b|\bNATIVE\b/);
    vi.stubEnv("VITE_DEMO", "1");
    vi.resetModules();
    const demo = await import("../src/demo");
    expect(demo.DEMO).toBe(true);
    const fresh = await import("../src/screens/linkCards");
    const opened: string[] = [];
    const x = fresh.optionsExtras(stubGame(titleView(402, 690, 3)), () => 1, { availability: () => STATES[1][1], openOutside: (u) => void opened.push(u) });
    expect(x.rows.map((r) => r.id)).toEqual(["opt-link", "opt-id", "opt-delete", "opt-privacy"]);
    expect(x.rows[3].disabled).toBeFalsy();
    x.rows[3].onTap!();
    expect(opened).toEqual([PRIVACY_URL]);
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("sits below DELETE inside the card, a button of the card's own size, its label inside it, and the card is on the screen, on every view and in every state", () => {
    for (const [what, cw, ch, dpr] of VIEWS) {
      const tv = titleView(cw, ch, dpr);
      for (const [state, a] of STATES) {
        const at = `${what} ${tv.W}x${tv.H} ${state}`;
        const game = stubGame(tv);
        const x = optionsExtras(game, () => tv.k, { availability: () => a });
        game.ui.begin();
        const card = optionsCard(game, recCanvas().getContext(), "OPTIONS", [done], () => undefined, tv.k, x);
        game.ui.end();
        expect(card.x >= 0 && card.y >= 0 && card.x + card.w <= tv.W && card.y + card.h <= tv.H, `${at}: card ${JSON.stringify(card)}`).toBe(true);
        const geo = optionsGeometry(tv.W, tv.H, tv.k, 1, x);
        expect(card, at).toEqual(geo.card);
        const reg = (id: string) => game.ui.regions.find((r) => r.id === id)!;
        const [name, del, privacy] = [reg("opt-name"), reg("opt-delete"), reg("opt-privacy")];
        expect(privacy, at).toBeTruthy();
        expect(privacy.r.y, at).toBe(del.r.y + geo.step); // one step below DELETE
        expect([privacy.r.w, privacy.r.h], at).toEqual([name.r.w, name.r.h]);
        expect(privacy.r.x >= card.x && privacy.r.x + privacy.r.w <= card.x + card.w && privacy.r.y + privacy.r.h <= card.y + card.h, `${at}: inside the card`).toBe(true);
        expect(typeof privacy.onTap, at).toBe("function");
        // the rows: DONE, REDUCED MOTION, SOUND, NAME, LINK, MY PLAYER ID, DELETE, PRIVACY (S6D: one more); the note (why LINK, MY PLAYER ID and DELETE are off) is under PRIVACY, in the card
        expect(geo.card.h, at).toBe(18 + 8 * geo.step + 4 + geo.noteLines.length * NOTE_ROW);
        expect(geo.noteLines.join(" "), at).toBe(a.on ? "" : a.why);
      }
    }
  });
});

// ------------------------------------------------------------------------------------------------------------------ the gesture
describe("S6 Goal 3: the tap runs inside the pointerup event, so a browser lets window.open through", () => {
  it("canvas pointerup -> io.ts -> Game.pointerUp -> the row's onTap -> window.open, all before the handler returns (online, and offline)", () => {
    for (const [state, a] of [STATES[0], STATES[1]]) {
      const tv = titleView(402, 690, 3);
      const game = stubGame(tv);
      let inHandler = false;
      const calls: { args: unknown[]; inHandler: boolean }[] = [];
      vi.stubGlobal("window", { addEventListener() {}, open: (...args: unknown[]) => void calls.push({ args, inHandler }), location: { assign: vi.fn() } });
      // the real card, drawn into the stand-in Game's UI, with the real default opener
      const x = optionsExtras(game, () => tv.k, { availability: () => a });
      game.ui.begin();
      optionsCard(game, recCanvas().getContext(), "OPTIONS", [done], () => undefined, tv.k, x);
      game.ui.end();
      const r = game.ui.regions.find((q) => q.id === "opt-privacy")!.r;
      // the game's own input sink: Game.pointerDown/pointerUp on a minimal `this` (the stand-in's UI, no screen)
      const self = { audio: { unlock() {}, play() {} }, ui: game.ui, wipeDir: 0, covered: false, screen: {} } as unknown as Game;
      const sink: InputSink = {
        pointerDown: (px, py, b, k) => Game.prototype.pointerDown.call(self, px, py, b, k),
        pointerMove: (px, py, d) => Game.prototype.pointerMove.call(self, px, py, d),
        pointerUp: (px, py) => Game.prototype.pointerUp.call(self, px, py),
        pointerCancel: () => Game.prototype.pointerCancel.call(self),
        key: () => undefined,
      };
      const handlers: Record<string, (e: unknown) => void> = {};
      const canvas = {
        addEventListener: (t: string, f: (e: unknown) => void) => void (handlers[t] = f), setPointerCapture() {}, focus() {},
        getBoundingClientRect: () => ({ left: 0, top: 0, width: tv.W, height: tv.H }),
      } as unknown as HTMLCanvasElement;
      bindInput(canvas, () => tv, sink);
      const ev = { pointerId: 1, clientX: r.x + r.w / 2, clientY: r.y + r.h / 2, button: 0, pointerType: "touch", preventDefault() {} };
      handlers.pointerdown(ev);
      expect(calls, `${state}: nothing opens on the press`).toEqual([]);
      inHandler = true;
      handlers.pointerup(ev);
      inHandler = false;
      expect(calls, state).toEqual([{ args: [PRIVACY_URL, "_blank", "noopener"], inHandler: true }]);
    }
  });

  it("the source agrees: io.ts calls the sink inside the pointerup handler and Game.pointerUp calls onTap at once, with no await, timer or frame between", () => {
    const io = read("src/core/io.ts");
    expect(io).toMatch(/canvas\.addEventListener\("pointerup", \(e\) => end\(e, false\)\);/);
    const end = io.slice(io.indexOf("const end = (e: PointerEvent, cancel: boolean) => {"), io.indexOf('canvas.addEventListener("pointerup"'));
    expect(end).toContain("sink.pointerUp(p.x, p.y)");
    const game = read("src/game/game.ts");
    const up = game.slice(game.indexOf("  pointerUp(x: number, y: number): void {"), game.indexOf("  pointerCancel(): void {"));
    expect(up).toContain("r.onTap();");
    for (const body of [end, up]) expect(body).not.toMatch(/await|async|setTimeout|requestAnimationFrame|Promise|queueMicrotask/);
  });
});
