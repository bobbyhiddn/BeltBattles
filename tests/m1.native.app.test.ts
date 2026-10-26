// M1 (BRIEF-M1 Goals 2 and 3), the APP side: the real @capacitor/core, @capacitor/preferences and @capacitor/app modules run over a FAKE
// NATIVE BRIDGE (the one thing Android's WebView provides: window.androidBridge, Capacitor.PluginHeaders, nativePromise and
// nativeCallback), so what is real is Capacitor's own registerPlugin, its Plugins object, its proxies and its listener calls. Pinned:
//  - Preferences is registered by the boot, in Capacitor.Plugins, BEFORE the first loadIdentity: a key made before it is non-extractable
//    and unmirrored; one made after it sends its private JWK to Preferences (IDENT-1's key mirror);
//  - the Back button does Escape's action (the host's back), minimizes only when the host says the title was bare, never exits;
//  - appStateChange pauses and resumes the audio; a plugin that fails or hangs does not stop the boot.
// One platform per file: Node caches the externalized @capacitor/core per test file and reads androidBridge when it first loads, so this
// file is the Android one (tests/m1.native.test.ts is the web one). The FIRST test relies on being first: it is the one that sees the
// page before and after Preferences is registered.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadIdentity, memoryKeyStore } from "../src/net/identity";
import { MIRROR_JWK, capacitorMirror } from "../src/net/identityMirror";

type Boot = typeof import("../src/native/boot");
type Audio = typeof import("../src/audio/audio");

/** What the "native" side of Capacitor holds and was asked: the plugin calls, Preferences' values and App's listeners. */
interface Bridge {
  calls: string[];
  prefs: Map<string, string>;
  listeners: Map<string, ((data: unknown) => void)[]>;
  fire(event: string, data?: unknown): void;
}
const bridge: Bridge = {
  calls: [],
  prefs: new Map(),
  listeners: new Map(),
  fire(event, data = {}) {
    for (const cb of this.listeners.get(event) ?? []) cb(data);
  },
};
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const g = globalThis as unknown as { Capacitor?: { Plugins: Record<string, unknown>; isNativePlatform(): boolean }; androidBridge?: unknown };

let boot: Boot;
let audio: Audio;

beforeAll(async () => {
  const methods = (...names: [string, "promise" | "callback"][]) => names.map(([name, rtype]) => ({ name, rtype }));
  // what the Android WebView gives the page before any script runs (the real thing is injected by capacitor.js and the bridge class)
  g.androidBridge = { postMessage() {} };
  (g as Record<string, unknown>).Capacitor = {
    PluginHeaders: [
      { name: "Preferences", methods: methods(["get", "promise"], ["set", "promise"], ["remove", "promise"]) },
      { name: "App", methods: methods(["addListener", "callback"], ["removeListener", "promise"], ["minimizeApp", "promise"], ["exitApp", "promise"]) },
    ],
    nativePromise: async (plugin: string, method: string, options: { key?: string; value?: string } = {}) => {
      bridge.calls.push(`${plugin}.${method}${options.key ? ` ${options.key}` : ""}`);
      if (plugin !== "Preferences") return undefined;
      if (method === "get") return { value: bridge.prefs.get(options.key!) ?? null };
      if (method === "set") bridge.prefs.set(options.key!, options.value!);
      if (method === "remove") bridge.prefs.delete(options.key!);
      return undefined;
    },
    nativeCallback: (plugin: string, method: string, options: { eventName: string }, callback: (data: unknown) => void) => {
      bridge.calls.push(`${plugin}.${method} ${options.eventName}`);
      if (method === "addListener") bridge.listeners.set(options.eventName, [...(bridge.listeners.get(options.eventName) ?? []), callback]);
      return `callback-${bridge.calls.length}`;
    },
  };
  audio = await import("../src/audio/audio");
  boot = await import("../src/native/boot");
});
afterAll(() => {
  delete g.androidBridge;
  delete (g as Record<string, unknown>).Capacitor;
});
beforeEach(() => {
  bridge.calls.length = 0;
  bridge.listeners.clear();
});

describe("M1 Goal 2: the boot on an Android WebView", () => {
  it("Preferences is registered BEFORE the first loadIdentity: before the boot a key is non-extractable and unmirrored; after it a fresh identity's private JWK reaches Preferences", async () => {
    expect(g.Capacitor!.isNativePlatform()).toBe(true); // the fake bridge makes Capacitor say "android"
    // BEFORE: no plugin in Capacitor.Plugins, so no mirror, and the key made now can never be mirrored (IDENT-1 open question 2)
    expect(g.Capacitor!.Plugins.Preferences).toBeUndefined();
    expect(capacitorMirror()).toBeNull();
    const early = memoryKeyStore();
    expect(await loadIdentity(early, undefined, { links: null })).not.toBeNull();
    expect((await early.get())!.privateKey.extractable).toBe(false);
    expect(bridge.prefs.size).toBe(0);

    // THE BOOT: it resolves only when Preferences is registered (the registration is a side effect of loading the plugin's module)
    const host = { back: vi.fn(() => true) };
    await boot.installNative(host);
    const prefs = g.Capacitor!.Plugins.Preferences as Record<string, unknown>;
    expect(prefs).toBeDefined();
    for (const m of ["get", "set", "remove"]) expect(typeof prefs[m], `Preferences.${m}`).toBe("function"); // the proxy's methods are what the adapter calls
    expect(capacitorMirror()).not.toBeNull();

    // AFTER: the default mirror (what online.ts defaultDeps's loadIdentity(indexedDbKeyStore()) uses) is Preferences
    const late = memoryKeyStore();
    const id = await loadIdentity(late, undefined, { links: null });
    expect(id).not.toBeNull();
    const text = bridge.prefs.get(MIRROR_JWK);
    expect(text, "the private JWK reached Preferences").toBeDefined();
    const jwk = JSON.parse(text!) as JsonWebKey;
    expect(jwk).toMatchObject({ kty: "EC", crv: "P-256" });
    expect(typeof jwk.d).toBe("string");
    expect((await late.get())!.privateKey.extractable).toBe(false); // IndexedDB still holds the non-extractable re-import
    expect(bridge.calls).toContain(`Preferences.set ${MIRROR_JWK}`);
    expect(host.back).not.toHaveBeenCalled();

    // and a purged WebView (a new, empty IndexedDB) gets the same player back from Preferences
    const purged = memoryKeyStore();
    const again = (await loadIdentity(purged, undefined, { links: null }))!;
    expect(again.keyId).toBe(id!.keyId);
  });

  it("asks for the Back button and the app's state, once each, and loads Preferences before the App plugin", async () => {
    await boot.installNative({ back: () => true });
    await flush();
    expect(bridge.calls.filter((c) => c.startsWith("App.addListener")).sort()).toEqual(["App.addListener appStateChange", "App.addListener backButton"]);
    expect(bridge.listeners.get("backButton")).toHaveLength(1);
    expect(bridge.listeners.get("appStateChange")).toHaveLength(1);
  });

  it("a Preferences that fails to load does not stop the boot: the App listeners are still asked for, and the game would start (installNative never rejects)", async () => {
    vi.resetModules();
    vi.doMock("@capacitor/preferences", () => {
      throw new Error("boom: no such chunk");
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fresh = await import("../src/native/boot");
    await expect(fresh.installNative({ back: () => true })).resolves.toBeUndefined();
    await flush();
    expect(errors.mock.calls.some((c) => String(c[0]).includes("@capacitor/preferences failed"))).toBe(true);
    expect(bridge.listeners.get("backButton")).toHaveLength(1);
    errors.mockRestore();
    vi.doUnmock("@capacitor/preferences");
    vi.resetModules();
  });

  it("a plugin that never loads holds the boot for the timeout and no longer: the game starts without it", async () => {
    vi.resetModules();
    vi.doMock("@capacitor/preferences", () => new Promise(() => undefined)); // a module that never finishes loading
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fresh = await import("../src/native/boot");
    const t0 = Date.now();
    await fresh.installNative({ back: () => true }, { timeoutMs: 30 });
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(errors.mock.calls.some((c) => String(c[0]).includes("took over 30 ms"))).toBe(true);
    errors.mockRestore();
    vi.doUnmock("@capacitor/preferences");
    vi.resetModules();
  });
});

describe("M1 Goal 3: the Back button and the app's state, through Capacitor's own listener calls", () => {
  async function booted(back: () => boolean) {
    const host = { back: vi.fn(back) };
    await boot.installNative(host);
    await flush();
    return host;
  }

  it("Back is the host's Escape: used (true) means nothing more happens, and the app is never exited", async () => {
    const host = await booted(() => true);
    bridge.fire("backButton", { canGoBack: false });
    bridge.fire("backButton", { canGoBack: true }); // the WebView has no history, but even if it did: the same
    await flush();
    expect(host.back).toHaveBeenCalledTimes(2);
    expect(bridge.calls).not.toContain("App.minimizeApp");
    expect(bridge.calls).not.toContain("App.exitApp");
  });

  it("Back at the bare title (the host says false) minimizes the app, once per press, and never exits it", async () => {
    const host = await booted(() => false);
    bridge.fire("backButton", { canGoBack: false });
    await flush();
    expect(host.back).toHaveBeenCalledTimes(1);
    expect(bridge.calls.filter((c) => c === "App.minimizeApp")).toHaveLength(1);
    bridge.fire("backButton", { canGoBack: false });
    await flush();
    expect(bridge.calls.filter((c) => c === "App.minimizeApp")).toHaveLength(2);
    expect(bridge.calls.some((c) => c.startsWith("App.exitApp"))).toBe(false);
  });

  it("a game that throws on Back is treated as used: no minimize, no exit, and the next press still works", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let bad = true;
    const host = await booted(() => {
      if (bad) throw new Error("boom");
      return false;
    });
    bridge.fire("backButton", {});
    await flush();
    expect(bridge.calls).not.toContain("App.minimizeApp");
    expect(bridge.calls.some((c) => c.startsWith("App.exitApp"))).toBe(false);
    bad = false;
    bridge.fire("backButton", {});
    await flush();
    expect(host.back).toHaveBeenCalledTimes(2);
    expect(bridge.calls).toContain("App.minimizeApp");
    errors.mockRestore();
  });

  it("appStateChange: the audio pauses when the app goes inactive and resumes when it is active again", async () => {
    const pause = vi.fn();
    const resume = vi.fn();
    const unbind = audio.bindPageAudio({ pause, resume }); // what the Game does at start (pauseAudio and resumeAudio act on it)
    await booted(() => true);
    bridge.fire("appStateChange", { isActive: false });
    expect([pause.mock.calls.length, resume.mock.calls.length]).toEqual([1, 0]);
    bridge.fire("appStateChange", { isActive: true });
    expect([pause.mock.calls.length, resume.mock.calls.length]).toEqual([1, 1]);
    bridge.fire("appStateChange", { isActive: false });
    expect([pause.mock.calls.length, resume.mock.calls.length]).toEqual([2, 1]);
    unbind();
    // with no Game yet, a state change is harmless (pauseAudio and resumeAudio do nothing before bindPageAudio)
    expect(() => bridge.fire("appStateChange", { isActive: false })).not.toThrow();
  });

  it("the listener functions themselves: backListener and stateListener, with a fake minimize", async () => {
    const minimize = vi.fn(async () => undefined);
    const used = boot.backListener({ back: () => true }, minimize);
    used();
    expect(minimize).not.toHaveBeenCalled();
    const bare = boot.backListener({ back: () => false }, minimize);
    bare();
    expect(minimize).toHaveBeenCalledTimes(1);
    // a minimize that rejects is logged, not thrown into the WebView
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    boot.backListener({ back: () => false }, async () => {
      throw new Error("no");
    })();
    await flush();
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
    expect(typeof boot.stateListener()).toBe("function");
  });
});
