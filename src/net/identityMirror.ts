// IDENT-1 (REQ-BFG-122): the native key mirror (the phone builds). A WebView's storage is "transient" (Capacitor's own word): the OS
// can reclaim it, and iOS can evict IndexedDB, and with the device key in IndexedDB that makes a new player. So where the app has
// a native key/value store the identity is mirrored there too:
//   beltbattles.identity.jwk.v1    the device key's private JWK (the key made extractable ONCE, at creation; IndexedDB still holds a
//                                  non-extractable re-import, which is what signs)
//   beltbattles.identity.link.v1   the link record (linkState.ts), so a restored key keeps its player
// At load an empty IndexedDB plus a mirrored JWK re-imports the key, so the playerId stays (identity.ts loadIdentity).
//
// What the mirror is: Capacitor's Preferences plugin, which is UserDefaults on iOS and SharedPreferences on Android. It is NOT the
// Keychain or the Keystore: it is app-private storage that survives the WebView being purged, but it is not hardware-protected,
// and iOS or Android backups may carry it (the privacy policy says the key lives on the device and in its backups). Without the
// plugin (the web, the Steam wrapper) there is no mirror: capacitorMirror() returns null, the key stays non-extractable and in
// IndexedDB only, and nothing here runs.

export interface IdentityMirror {
  /** The stored text, or null. */
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
  remove(name: string): Promise<void>;
}

export const MIRROR_JWK = "beltbattles.identity.jwk.v1";
export const MIRROR_LINK = "beltbattles.identity.link.v1";

/** The slice of @capacitor/preferences this uses (its documented API: get({key}), set({key,value}), remove({key})). */
interface PreferencesPlugin {
  get(o: { key: string }): Promise<{ value: string | null }>;
  set(o: { key: string; value: string }): Promise<void>;
  remove(o: { key: string }): Promise<void>;
}

/** An adapter over Capacitor's Preferences plugin when `globalThis.Capacitor.Plugins.Preferences` exists, else null. */
export function capacitorMirror(g: object = globalThis): IdentityMirror | null {
  const p = (g as { Capacitor?: { Plugins?: { Preferences?: Partial<PreferencesPlugin> } } }).Capacitor?.Plugins?.Preferences;
  if (!p || typeof p.get !== "function" || typeof p.set !== "function" || typeof p.remove !== "function") return null;
  const prefs = p as PreferencesPlugin;
  return {
    async get(name) {
      const r = await prefs.get({ key: name });
      return typeof r?.value === "string" ? r.value : null;
    },
    async set(name, value) {
      await prefs.set({ key: name, value });
    },
    async remove(name) {
      await prefs.remove({ key: name });
    },
  };
}

/** A mirror in memory: tests, and tools that want the native path without a phone. */
export function memoryMirror(): IdentityMirror & { readonly values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    async get(name) {
      return values.get(name) ?? null;
    },
    async set(name, value) {
      values.set(name, value);
    },
    async remove(name) {
      values.delete(name);
    },
  };
}
