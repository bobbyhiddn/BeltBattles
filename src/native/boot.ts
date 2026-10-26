// M1 (BRIEF-M1 Goals 2 and 3): the phone app's boot. THE ONLY MODULE THAT IMPORTS @capacitor/* (a test reads every src file for it).
// main.ts reaches it through ONE dynamic import(), behind the inline test `import.meta.env.VITE_NATIVE === "1"`: only `npm run
// build:app` has this module in its bundle (src/native.ts says why that guard is never a const imported from another module). A web
// build holds no Capacitor code at all.
//
// WHAT IT DOES, in this order, once, before the game exists (main.ts starts the game when this settles, whether it worked or not):
//  1. Capacitor.isNativePlatform(). False (dist-app opened in a desktop browser): nothing else is loaded or registered.
//  2. @capacitor/preferences, loaded for its one side effect: registerPlugin("Preferences") puts the plugin's proxy into
//     Capacitor.Plugins, which is where IDENT-1's capacitorMirror() (src/net/identityMirror.ts) looks. This must come BEFORE the first
//     loadIdentity, because a device key made without a mirror is non-extractable for good and can never be mirrored later (IDENT-1's
//     open question 2): main.ts's start() runs startOnline, the first loadIdentity, only after this module has settled. THE WEB MUST
//     NEVER GET HERE: @capacitor/preferences has a web implementation over localStorage, so a web page that loaded it would make the
//     private key extractable and keep its JWK in localStorage. That is why steps 1 and 2 are in this order, and why this module is
//     behind the build flag as well as isNativePlatform().
//  3. @capacitor/app: the Android Back button (the same action as the Escape key; at the bare title the app minimizes; the app is
//     never exited from here) and appStateChange (C1's pauseAudio and resumeAudio).
// Each step is on its own: a failure is logged and the next step still runs, so the game always starts.

import { Capacitor } from "@capacitor/core";
import { pauseAudio, resumeAudio } from "../audio/audio";
import { capacitorMirror } from "../net/identityMirror";

/** What the app asks of the running game. main.ts passes the Game's own `back` (src/game/game.ts). */
export interface NativeHost {
  /** The Back button: do what Escape does. Returns false only at the bare title with nothing open: the one place the app minimizes. */
  back(): boolean;
}

/** How long a plugin may take to load before the game starts without it (a local chunk takes a few ms). */
export const PLUGIN_TIMEOUT_MS = 4000;

/** `p`'s value, or undefined when it fails or takes longer than `ms`; never rejects, never waits longer than `ms`. */
function settled<T>(p: Promise<T>, ms: number, what: string): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.error(`[beltbattles] ${what} took over ${ms} ms: the game starts without waiting for it`);
      resolve(undefined);
    }, ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        console.error(`[beltbattles] ${what} failed:`, e);
        resolve(undefined);
      },
    );
  });
}

/** The Back button's listener: Escape's action through `host`; only when that was nothing to close or leave (the bare title) does the app
 *  minimize (Android 12+'s own rule at a root screen). It never exits the app, and a game that throws still does neither. */
export function backListener(host: NativeHost, minimize: () => Promise<unknown>): () => void {
  return () => {
    let used = true;
    try {
      used = host.back();
    } catch (e) {
      console.error("[beltbattles] Back: the game's Escape threw:", e);
    }
    if (!used) minimize().catch((e) => console.error("[beltbattles] minimizeApp failed:", e));
  };
}

/** appStateChange: the audio stops when the app goes to the background (C1's pauseAudio) and comes back when it returns (resumeAudio). */
export function stateListener(): (state: { isActive: boolean }) => void {
  return ({ isActive }) => {
    if (isActive) resumeAudio();
    else pauseAudio();
  };
}

/** The app's boot (see the top of this file). Resolves when Preferences is in place and the listeners are asked for; never rejects. */
export async function installNative(host: NativeHost, opts: { timeoutMs?: number } = {}): Promise<void> {
  if (!Capacitor.isNativePlatform()) return; // a desktop browser on dist-app: nothing is loaded, nothing registered
  const ms = opts.timeoutMs ?? PLUGIN_TIMEOUT_MS;

  // 2. Preferences first: the key mirror (identity.ts newPair makes the key extractable once, and sends its JWK here)
  await settled(import("@capacitor/preferences"), ms, "@capacitor/preferences");
  if (!capacitorMirror()) console.error("[beltbattles] Preferences is not registered: this device's key stays in IndexedDB only, with no mirror");

  // 3. the Back button and the app's state. The listeners are not awaited: a plugin call that never answers must not hold the game back
  try {
    const app = await settled(import("@capacitor/app"), ms, "@capacitor/app");
    if (!app) return;
    const { App } = app;
    void App.addListener("backButton", backListener(host, () => App.minimizeApp())).catch((e) => console.error("[beltbattles] backButton listener failed:", e));
    void App.addListener("appStateChange", stateListener()).catch((e) => console.error("[beltbattles] appStateChange listener failed:", e));
  } catch (e) {
    console.error("[beltbattles] the app listeners failed:", e);
  }
}
