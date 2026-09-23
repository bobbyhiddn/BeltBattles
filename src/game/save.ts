// Run save/load. Save v5 (0.6.0) is the 10-day run: `day` (was `round`), 5 lives, a run id and
// today's stored dusk opponent. Older saves still load, migrated in place:
//  v3 (0.3.0-0.4.1) -> v4: at its caravan, no road event taken yet this round;
//  v4 (0.5.0) -> v5: day = its round (at most 10), lives + 2 (at most 5), no ghost picked yet
//  (picked when dusk starts). 0.5.0's road modifiers of its warlord are dropped (a ghost runs as
//  submitted), and an open WARLORD'S HERALD / ELVEN SAPPERS event (out of the bag) is dropped.

import { RUN_DAYS, START_LIVES, type HeroId } from "../sim/content";
import { warlordName } from "../sim/ai";
import type { Run } from "./run";

export const SAVE_KEY = "beltbattles.run.v5";
export const SAVE_KEY_V4 = "beltbattles.run.v4";
export const SAVE_KEY_V3 = "beltbattles.run.v3";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

const clampDay = (n: unknown): number => Math.max(1, Math.min(RUN_DAYS, Math.floor(Number(n) || 1)));

function v3to4(r: Raw): void {
  r.version = 4;
  r.stage = "caravan";
  r.event = null;
  r.foe = null;
  r.nextShop = { discount: 0, free: 0 };
  r.events = [];
}

function v4to5(r: Raw): void {
  r.version = 5;
  const round = r.round;
  r.day = clampDay(round);
  delete r.round;
  r.lives = Math.min(START_LIVES, Math.max(0, Number(r.lives) || 0) + 2);
  r.runId = typeof r.runId === "string" ? r.runId : `v4-${((Number(r.seed) || 0) >>> 0).toString(36)}`;
  r.dusk = null;
  r.foe = null;
  const ev = r.event as Raw | null;
  if (ev) {
    // only this round's event matters (a stale one from an earlier round is dropped)
    const retired = ev.picked < 0 && (ev.id === "herald" || ev.id === "sappers");
    if (ev.round !== round || retired) {
      r.event = null;
      if (r.stage === "event") r.stage = "caravan";
    } else {
      ev.day = r.day;
      delete ev.round;
    }
  }
  r.events = (Array.isArray(r.events) ? r.events : []).map((e: Raw) => ({ day: e.day ?? e.round, id: e.id, choice: e.choice, won: e.won }));
  const foeHero = (r.enemyHero ?? "furnace") as HeroId;
  r.history = (Array.isArray(r.history) ? r.history : []).map((h: Raw) => ({
    day: h.day ?? h.round, outcome: h.outcome, income: h.income ?? 0, time: h.time ?? 0,
    foe: h.foe ?? warlordName(foeHero, h.round ?? 1), ghost: false, player: h.player, enemy: h.enemy,
  }));
  if (r.over === "won") r.over = "complete";
}

/** Bring a parsed save up to v5, or null if it isn't a usable run. Pure (tests call it directly). */
export function migrateRun(raw: unknown): Run | null {
  const r = raw as Raw | null;
  if (!r || typeof r !== "object" || !r.build || !r.shop || !Array.isArray(r.inventory)) return null;
  if (r.version === 3) v3to4(r);
  if (r.version === 4) v4to5(r);
  if (r.version !== 5) return null;
  r.shop.discount = r.shop.discount ?? 0;
  r.shop.free = r.shop.free ?? 0;
  r.stage = r.stage ?? "caravan";
  r.event = r.event ?? null;
  r.foe = r.foe ?? null;
  r.nextShop = r.nextShop ?? { discount: 0, free: 0 };
  r.events = r.events ?? [];
  r.history = r.history ?? [];
  r.dusk = r.dusk ?? null;
  r.over = r.over ?? null;
  r.day = clampDay(r.day);
  r.lives = Math.max(0, Math.min(START_LIVES, Number(r.lives) || 0));
  if (typeof r.runId !== "string") r.runId = `s-${((Number(r.seed) || 0) >>> 0).toString(36)}`;
  if (!["caravan", "event", "refit", "battle"].includes(r.stage)) r.stage = "caravan";
  return r as unknown as Run;
}

export function saveRun(run: Run | null): void {
  try {
    localStorage.removeItem(SAVE_KEY_V3);
    localStorage.removeItem(SAVE_KEY_V4);
    if (!run || run.over) localStorage.removeItem(SAVE_KEY);
    else localStorage.setItem(SAVE_KEY, JSON.stringify(run));
  } catch {
    /* storage unavailable */
  }
}

export function loadRun(): Run | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY) ?? localStorage.getItem(SAVE_KEY_V4) ?? localStorage.getItem(SAVE_KEY_V3);
    if (!raw) return null;
    return migrateRun(JSON.parse(raw));
  } catch {
    return null;
  }
}
