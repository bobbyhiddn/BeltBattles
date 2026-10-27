// S6 (REQ-BFG-119) Goal 3: where the game sends a player to read the privacy policy, and how it gets there.
//
// The stores want the privacy policy linked inside the app as well as in the store form (Apple App Store Review Guideline 5.1.1(i); Google
// Play's User Data policy). The pages are the game server's own (server/pages/privacy.html, support.html; server/pages.ts), so the addresses
// are absolute: the phone apps load the game from the device, and the itch.io build (W1) runs on another host.
//
// The page is opened OUTSIDE the game, never in place of it:
//   on the web          window.open(url, "_blank", "noopener"): a new tab. It runs inside the player's tap (the title's PRIVACY row calls it from
//                       game.ts pointerUp, which io.ts calls synchronously from the canvas's pointerup handler), so a browser's popup blocker
//                       lets it through.
//   in the phone apps   a top-level navigation, window.location.assign(url), to another host. Capacitor 8.5.3's own native code hands that to
//                       the system browser and leaves the game where it is, with no plugin (no @capacitor/browser):
//                         Android  node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/BridgeWebViewClient.java:27-30
//                                  shouldOverrideUrlLoading -> Bridge.java:389-427 launchIntent: a URL whose host is not the app's own
//                                  (https://localhost) and not in server.allowNavigation (the config has none) starts an ACTION_VIEW intent
//                                  (:419-420) and returns true, so the WebView does not navigate;
//                         iOS      node_modules/@capacitor/ios/Capacitor/Capacitor/WebViewDelegationHandler.swift:67-125 decidePolicyFor: a
//                                  main-frame navigation outside allowNavigation and outside the app's own URL (:101-121) is cancelled and
//                                  UIApplication.shared.open(navURL) opens it in Safari (:116-119).
//                       window.open would also reach Safari on iOS (createWebViewWith, :334-339), but on Android Capacitor sets
//                       setJavaScriptCanOpenWindowsAutomatically(true) (Bridge.java:593) and never setSupportMultipleWindows or onCreateWindow,
//                       so what a WebView does with a window.open there is the WebView's own and not Capacitor's code: the navigation is the one
//                       call whose path is in Capacitor's own source on both.
//                       NATIVE (src/native.ts) is the build's own flag, true only in `npm run build:app`.

import { NATIVE } from "../native";

export const SITE = "https://beltbattles.fly.dev";
/** The privacy policy (the server's GET /privacy; the stores' Privacy Policy URL fields). */
export const PRIVACY_URL = `${SITE}/privacy`;
/** The policy's "how to delete your online data" section (Play's data deletion URL). */
export const PRIVACY_DELETE_URL = `${SITE}/privacy#delete`;
/** The support page (the stores' Support URL fields). */
export const SUPPORT_URL = `${SITE}/support`;

/** What opening an address outside the game needs from the page. Tests hand in their own. */
export interface OutsideHost {
  /** The build is the phone app. */
  native: boolean;
  /** window.open. */
  open(url: string, target: string, features: string): unknown;
  /** window.location.assign. */
  navigate(url: string): void;
}

/** The page's own window, and the build's flag. */
export function pageHost(): OutsideHost {
  return { native: NATIVE, open: (u, t, f) => window.open(u, t, f), navigate: (u) => window.location.assign(u) };
}

/** Open `url` outside the game: a new tab on the web, the system browser in the phone apps. Call it inside the player's tap. */
export function openOutside(url: string, host: OutsideHost = pageHost()): void {
  if (host.native) host.navigate(url);
  else host.open(url, "_blank", "noopener");
}
