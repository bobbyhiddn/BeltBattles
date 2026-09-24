// Run save/load. Save v6 (0.6.0b) is the 10-day run with the road fork: today's fork pick, the
// stored warlord fight and its result, every warlord result, matriarchBeatenOn (R3), a pending
// ELITE BOUNTY and a pending SABOTAGE. Older saves still load, migrated in place:
//  v3 (0.3.0-0.4.1) -> v4: at its caravan, no road event taken yet this round;
//  v4 (0.5.0) -> v5: day = its round (at most 10), lives + 2 (at most 5), no ghost picked yet
//  (picked when dusk starts). 0.5.0's road modifiers of its warlord are dropped (a ghost runs as
//  submitted), and an open WARLORD'S HERALD / ELVEN SAPPERS event (out of the bag) is dropped;
//  v5 (0.6.0a) -> v6: a save past its caravan already took its road stop (its event, or a quiet
//  road), so its fork pick is the event; no warlord fought yet, nothing pending; a stored pool
//  ghost's stamp moves to the v1 snapshot fields;
//  v6 (0.6.0b-0.6.0d) -> v7 (0.6.1a, module merging): absent `stars` mean 1, so nothing is
//  rewritten; then fuseAll runs once (a v6 run can hold duplicates such as two tempers), and when
//  anything merged the next screen toasts "YOUR SPARE PARTS MERGED" (run.fuseFx, cosmetic).

import { RUN_DAYS, START_LIVES, type HeroId } from "../sim/content";
import { warlordName } from "../sim/ai";
import { toId } from "./ghostSnapshot";
import { fuseAll } from "./fuse";
import type { Run } from "./run";

export const SAVE_KEY = "beltbattles.run.v7";
export const SAVE_KEY_V6 = "beltbattles.run.v6";
/** 0.6.1a: the toast a migrated v6 run shows when its spare parts merged. */
export const MIGRATE_TOAST = "YOUR SPARE PARTS MERGED";
export const SAVE_KEY_V5 = "beltbattles.run.v5";
export const SAVE_KEY_V4 = "beltbattles.run.v4";
export const SAVE_KEY_V3 = "beltbattles.run.v3";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

const clampDay = (n: unknown): number => Math.max(1, Math.min(RUN_DAYS, Math.floor(Number(n) || 1)));
const STAGES = ["caravan", "fork", "event", "warlord", "refit", "battle"];

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

function v5to6(r: Raw): void {
  r.version = 6;
  const day = clampDay(r.day);
  const past = r.stage === "event" || r.stage === "refit" || r.stage === "battle";
  r.road = past ? { day, pick: "event" } : null;
  r.warlord = null;
  r.warlords = [];
  r.matriarchBeatenOn = null;
  r.bounty = null;
  r.sabotage = null;
  const rec = r.dusk?.record as Raw | undefined;
  if (rec) {
    r.dusk.record = {
      wins: Math.max(0, Number(rec.wins) || 0), lives: Math.max(1, Number(rec.lives) || 1),
      runId: toId(rec.runId), playerId: toId(rec.playerId), createdAt: Math.max(0, Number(rec.createdAt ?? rec.savedAt) || 0),
    };
  }
}

function v6to7(r: Raw): void {
  r.version = 7;
  const fx = Array.isArray(r.fuseFx) ? r.fuseFx : [];
  r.fuseFx = [];
  const steps = fuseAll(r as unknown as Run); // absent stars = 1: nothing else is rewritten
  r.fuseFx = steps.length ? [...fx, MIGRATE_TOAST] : fx;
}

/** 0.6.1a, cosmetic: take the next queued merge toast for the screen on show (game.ts). MERGED
 *  toasts show on any settled screen; the migration notice waits for the next build screen. */
export function nextFuseToast(run: Run, onBuildScreen: boolean): string | undefined {
  const fx = run.fuseFx;
  const i = fx ? fx.findIndex((t) => t !== MIGRATE_TOAST || onBuildScreen) : -1;
  return i < 0 ? undefined : fx!.splice(i, 1)[0];
}

/** Bring a parsed save up to v7, or null if it isn't a usable run. Pure (tests call it directly). */
export function migrateRun(raw: unknown): Run | null {
  const r = raw as Raw | null;
  if (!r || typeof r !== "object" || !r.build || !r.shop || !Array.isArray(r.inventory)) return null;
  if (r.version === 3) v3to4(r);
  if (r.version === 4) v4to5(r);
  if (r.version === 5) v5to6(r);
  if (r.version === 6) v6to7(r);
  if (r.version !== 7) return null;
  r.shop.discount = r.shop.discount ?? 0;
  r.shop.free = r.shop.free ?? 0;
  r.stage = r.stage ?? "caravan";
  r.event = r.event ?? null;
  delete r.foe; // 0.5.0's warlord modifiers: retired (0.6.0b keeps run.bounty / run.sabotage)
  r.nextShop = r.nextShop ?? { discount: 0, free: 0 };
  r.events = r.events ?? [];
  r.history = r.history ?? [];
  r.dusk = r.dusk ?? null;
  r.over = r.over ?? null;
  r.road = r.road ?? null;
  r.warlord = r.warlord ?? null;
  r.warlords = Array.isArray(r.warlords) ? r.warlords : [];
  r.matriarchBeatenOn = typeof r.matriarchBeatenOn === "number" ? r.matriarchBeatenOn : null;
  r.bounty = r.bounty ?? null;
  r.sabotage = r.sabotage ?? null;
  r.day = clampDay(r.day);
  r.lives = Math.max(0, Math.min(START_LIVES, Number(r.lives) || 0));
  if (typeof r.runId !== "string") r.runId = `s-${((Number(r.seed) || 0) >>> 0).toString(36)}`;
  if (!STAGES.includes(r.stage)) r.stage = "caravan";
  if (r.stage === "warlord" && !(r.warlord && r.warlord.day === r.day)) r.stage = "fork";
  return r as unknown as Run;
}

export function saveRun(run: Run | null): void {
  try {
    for (const k of [SAVE_KEY_V3, SAVE_KEY_V4, SAVE_KEY_V5, SAVE_KEY_V6]) localStorage.removeItem(k);
    if (!run || run.over) localStorage.removeItem(SAVE_KEY);
    else localStorage.setItem(SAVE_KEY, JSON.stringify(run));
  } catch {
    /* storage unavailable */
  }
}

export function loadRun(): Run | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY) ?? localStorage.getItem(SAVE_KEY_V6) ?? localStorage.getItem(SAVE_KEY_V5)
      ?? localStorage.getItem(SAVE_KEY_V4) ?? localStorage.getItem(SAVE_KEY_V3);
    if (!raw) return null;
    return migrateRun(JSON.parse(raw));
  } catch {
    return null;
  }
}
