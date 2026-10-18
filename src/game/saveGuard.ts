// BUMP-1E P6 E.2 (REVIEW-STAGE0911 section E.2): THE SAVE GUARD. A saved run that names a part, a rune or a hero this build does not know (a run
// saved by a NEWER build, then this one served by a rollback) used to load: the title drew `HEROES[save.hero].name` (a black screen) or CONTINUE
// opened a build screen that read ITEMS[def] (a dead build screen). Now `loadRunGuarded` returns no run for it and keeps one plain line for the
// title to show, so the player sees NEW RUN and a message, never a dead CONTINUE; the save stays in storage untouched until a new run overwrites
// it (a later build that knows the ids can still continue it). The check reads the stored JSON before loadRun migrates it (a migration that
// trips over an unknown id would otherwise end in a silent null). Pure reads of the catalogue; it is NOT in the pool generators' import closure
// (title.ts and customize.ts call it; save.ts, which is in the closure, is not edited).
import { HEROES, ITEMS } from "../sim/content";
import { isRune } from "../sim/runes";
import { wrap } from "../render/font";
import { loadRun, SAVE_KEY, SAVE_KEY_V3, SAVE_KEY_V4, SAVE_KEY_V5, SAVE_KEY_V6, type Run } from "./run";

const has = (o: object, k: unknown): boolean => typeof k === "string" && Object.prototype.hasOwnProperty.call(o, k);
type Loose = Record<string, unknown> | null | undefined;
const list = (x: unknown): Loose[] => (Array.isArray(x) ? (x as Loose[]) : []);

/** What a saved run (parsed JSON, or a Run) names that this build does not know: "hero x" / "part x" / "rune x" each, in the order met (empty: a run
 *  this build can play). Reads the player's own state: hero, deck (rigs, gun parts, turrets), cargo, the caravan's offers, runes. */
export function unknownInSave(run: unknown): string[] {
  const out: string[] = [];
  const add = (kind: string, id: unknown): void => {
    const s = `${kind} ${String(id)}`;
    if (!out.includes(s)) out.push(s);
  };
  const part = (def: unknown): void => { if (!has(ITEMS, def)) add("part", def); };
  const hero = (id: unknown): void => { if (!has(HEROES, id)) add("hero", id); };
  const r = (run ?? {}) as Record<string, unknown>;
  hero(r.hero);
  if (r.enemyHero !== undefined) hero(r.enemyHero);
  const b = (r.build ?? {}) as Record<string, unknown>;
  for (const p of list(b.items)) part(p?.def);
  for (const m of list(b.mods)) part(m?.def);
  for (const t of list(b.turrets)) part(t?.def);
  for (const i of list(r.inventory)) part(i?.def);
  const shop = (r.shop ?? {}) as Record<string, unknown>;
  for (const w of list(shop.wagons)) for (const o of list(w?.offers)) part(o?.def);
  for (const q of list(b.runes)) if (!isRune(q?.id)) add("rune", q?.id);
  return out;
}

/** The line the title shows while a saved run is set aside. */
export const SAVE_ASIDE_LINE = "THE SAVED RUN NEEDS A NEWER VERSION OF THE GAME. START A NEW RUN.";

/** Where the title draws it: wrapped to the screen's width in the 3x5 face, 7 px a line, on a strip `boxH` tall starting at `y0 - 2`, as low as
 *  `panelY - boxH - 6` (just above the command panel: the portrait panel sits at the bottom edge) but never above `top` (under the logo band). */
export function asideBox(W: number, top: number, panelY: number): { lines: string[]; y0: number; boxH: number; lh: number } {
  const lines = wrap(SAVE_ASIDE_LINE, W - 16, "3");
  const lh = 7, boxH = lines.length * lh + 4;
  return { lines, y0: Math.max(top, panelY - boxH - 6), boxH, lh };
}

let aside: string | null = null;

/** The plain message for the save the last `loadRunGuarded` set aside, or null. */
export function saveProblem(): string | null {
  return aside;
}

/** The stored save's text, the key order loadRun reads (the newest key first); null when there is none or storage is unavailable. */
function storedSave(): string | null {
  try {
    return localStorage.getItem(SAVE_KEY) ?? localStorage.getItem(SAVE_KEY_V6) ?? localStorage.getItem(SAVE_KEY_V5)
      ?? localStorage.getItem(SAVE_KEY_V4) ?? localStorage.getItem(SAVE_KEY_V3);
  } catch {
    return null;
  }
}

/** `loadRun()`, except that a save naming something this build does not know comes back as no run, with `saveProblem()` saying so. */
export function loadRunGuarded(): Run | null {
  aside = null;
  const text = storedSave();
  if (text) {
    let raw: unknown = null;
    try {
      raw = JSON.parse(text);
    } catch {
      raw = null; // not JSON: loadRun reads it as no run, as before
    }
    if (raw && unknownInSave(raw).length > 0) {
      aside = SAVE_ASIDE_LINE;
      return null;
    }
  }
  return loadRun();
}
