// Persistent player settings. Reduced Motion removes camera shake and full-screen flashes
// (STUDY rule 11); it defaults to the OS preference the first time the game runs.

export interface Settings {
  reducedMotion: boolean;
}

const KEY = "beltbattles.settings.v1";

function load(): Settings {
  const s: Settings = { reducedMotion: false };
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (raw) {
      const v = JSON.parse(raw) as Partial<Settings>;
      s.reducedMotion = !!v.reducedMotion;
    } else if (typeof matchMedia === "function") {
      s.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
  } catch {
    /* storage unavailable: defaults */
  }
  return s;
}

export const settings: Settings = load();

export function saveSettings(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export function setReducedMotion(on: boolean): void {
  settings.reducedMotion = on;
  saveSettings();
}
