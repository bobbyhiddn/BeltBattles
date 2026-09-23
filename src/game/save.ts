// Run save/load. Save format v4 (0.5.0) adds the round stage, the road event, the event's foe
// and next-caravan modifiers and the event log. A v3 save (0.3.0-0.4.1) still loads: it is
// migrated in place, sitting at its caravan with no event taken yet this round.

import type { Run } from "./run";

export const SAVE_KEY = "beltbattles.run.v4";
export const SAVE_KEY_V3 = "beltbattles.run.v3";

/** Bring a parsed save up to v4, or null if it isn't a usable run. Pure (tests call it directly). */
export function migrateRun(raw: unknown): Run | null {
  const r = raw as Partial<Run> | null;
  if (!r || typeof r !== "object" || !r.build || !r.shop || !Array.isArray(r.inventory)) return null;
  if (r.version === 3) {
    r.version = 4;
    r.stage = "caravan";
    r.event = null;
    r.foe = null;
    r.nextShop = { discount: 0, free: 0 };
    r.events = [];
  }
  if (r.version !== 4) return null;
  r.shop.discount = r.shop.discount ?? 0;
  r.shop.free = r.shop.free ?? 0;
  r.stage = r.stage ?? "caravan";
  r.event = r.event ?? null;
  r.foe = r.foe ?? null;
  r.nextShop = r.nextShop ?? { discount: 0, free: 0 };
  r.events = r.events ?? [];
  if (!["caravan", "event", "refit", "battle"].includes(r.stage)) r.stage = "caravan";
  return r as Run;
}

export function saveRun(run: Run | null): void {
  try {
    localStorage.removeItem(SAVE_KEY_V3);
    if (!run || run.over) localStorage.removeItem(SAVE_KEY);
    else localStorage.setItem(SAVE_KEY, JSON.stringify(run));
  } catch {
    /* storage unavailable */
  }
}

export function loadRun(): Run | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY) ?? localStorage.getItem(SAVE_KEY_V3);
    if (!raw) return null;
    return migrateRun(JSON.parse(raw));
  } catch {
    return null;
  }
}
