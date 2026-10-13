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
// 0.6.2 BELTSIDE (ref/DESIGN-beltside.md D3), every load, no version bump: gates standing ON belt tiles
//  become rigs beside their belts (migrateInlineGates; idempotent, so a migrated run is untouched). A
//  stranded rig of the player's deck goes to cargo, or is refunded at its value when cargo already holds
//  MIGRATE_CARGO_CAP parts; the stored dusk foe and warlord decks drop theirs (logged).
// 0.6.2j (REQ-BFG-027, J12), save v7, no bump: a belt's `join` (RouteDef.join) is saved and loads as it was; saves
//  without joins load exactly as before. On load a join that no longer holds is cleared (pruneJoins, J8), so it can
//  never come back to life under a belt drawn later.

import { RUN_DAYS, START_LIVES, type HeroId } from "../sim/content";
import { ITEMS } from "../sim/content"; // SHAPES-1 (Q4): a reshaped factory's name in its load notice
import { pruneJoins, type Build } from "../sim/deck"; // 0.6.2j
import { warlordName } from "../sim/ai";
import { logMigration, migrateDeck, migrateInlineGates } from "../sim/beltside";
import { logShapes, migrateShapedFactories } from "../sim/beltside"; // SHAPES-1 (REQ-BFG-086 S6): the load migration
import { shapesRules } from "../sim/shapes"; // SHAPES-1 (S1): the switch
import { starField, starsOf, valueOf } from "../sim/stars";
import { ID_PATTERN, toId } from "./ghostSnapshot";
import { fuseAll } from "./fuse";
import { readoutOk } from "./raceReadout"; // 0.8.0 H1 M3
import { waresOk } from "./wares"; // 0.8.0 I1 M3
import { lastChanceShapeOk } from "../sim/lastChance"; // LC-1 (REQ-BFG-073)
import { HEARTS_START } from "../sim/hearts"; // RETUNE-1 (REQ-BFG-096): a hearts run's clamp
import type { Run } from "./run";

export const SAVE_KEY = "beltbattles.run.v7";
export const SAVE_KEY_V6 = "beltbattles.run.v6";
/** 0.6.1a: the toast a migrated v6 run shows when its spare parts merged. */
export const MIGRATE_TOAST = "YOUR SPARE PARTS MERGED";
/** 0.6.2 BELTSIDE: the toast a run shows once its gates moved off the belts (next build screen). */
export const BELTSIDE_TOAST = "RIGS NOW STAND BESIDE THE BELT";
/** 0.6.2 BELTSIDE: cargo counts as full at this many parts: the smallest cargo tray (portrait, 160 px
 *  wide) shows 4 slots, so a rig the migration puts in cargo is always in reach. */
export const MIGRATE_CARGO_CAP = 4;
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

/** 0.6.2 BELTSIDE, D3 at the save boundary (see the header). Pure on the raw save; returns what moved. */
export function beltsideRun(r: Raw): { moved: number; cargoed: number; refunded: number; dropped: number } {
  const m = migrateInlineGates(r.build);
  let cargoed = 0, refunded = 0;
  for (const p of m.stranded) {
    if (r.inventory.length < MIGRATE_CARGO_CAP) {
      r.inventory.push({ uid: p.uid, def: p.def, ...starField(starsOf(p)) });
      cargoed++;
    } else {
      r.gold = (Number(r.gold) || 0) + valueOf(p.def, starsOf(p));
      refunded++;
    }
  }
  logMigration("save", m, { cargoed, refunded });
  if (m.moved.length || m.stranded.length) r.fuseFx = [...(Array.isArray(r.fuseFx) ? r.fuseFx : []), BELTSIDE_TOAST];
  const before = (b: Raw | undefined) => (b ? (b.items as unknown[]).length : 0);
  let dropped = 0;
  for (const [b, src] of [[r.dusk?.build, "save:dusk"], [r.warlord?.build, "save:warlord"]] as [Raw | undefined, string][]) {
    if (!b || !Array.isArray(b.items) || !Array.isArray(b.routes)) continue;
    const n = before(b);
    migrateDeck(b as never, src);
    dropped += n - before(b);
  }
  return { moved: m.moved.length, cargoed, refunded, dropped };
}

/**
 * SHAPES-1 (REQ-BFG-086 S6), at the save boundary: with SHAPES on, the run's GANTRY PRESS and ASSEMBLY LINE take their new
 * shapes (beltside.ts migrateShapedFactories: kept where they fit with every belt, else the spot that keeps the most belts;
 * a belt it can't keep is removed whole). One that fits nowhere goes to cargo with its belts removed (refunded, as
 * beltsideRun's stranded rigs, once cargo holds MIGRATE_CARGO_CAP parts). The stored dusk foe and warlord decks re-place
 * theirs too (one that fits nowhere is dropped, logged). Every load, idempotent; a run without them is untouched. Off: no
 * call (migrateRun reads the switch).
 */
export function shapesRun(r: Raw): { moved: number; cargoed: number; refunded: number; lost: number } {
  const moves = migrateShapedFactories(r.build);
  let cargoed = 0, refunded = 0;
  const notices: string[] = []; // SHAPES-1 (cap's RUN2 note, Q4): one line a factory that moved or left
  for (const v of moves) {
    const name = ITEMS[v.def]?.name ?? v.def;
    if (v.to) {
      const put = v.to.x === v.from.x && v.to.y === v.from.y && v.to.rot === v.from.rot;
      if (!put || v.lost) notices.push(shapeNotice(name, { lost: v.lost }));
      continue;
    }
    const p = { uid: v.uid, def: v.def };
    if (r.inventory.length < MIGRATE_CARGO_CAP) {
      r.inventory.push({ ...p, ...starField(v.stars ?? 1) });
      cargoed++;
      notices.push(shapeNotice(name, { cargo: true }));
    } else {
      const g = valueOf(v.def, v.stars ?? 1);
      r.gold = (Number(r.gold) || 0) + g;
      refunded++;
      notices.push(shapeNotice(name, { sold: g }));
    }
  }
  logShapes("save:shapes", moves, { cargoed, refunded });
  // SHAPES-1 (Q4): the player's save only, once, on the first build screen after this load (nextFuseToast holds them
  // there, as BELTSIDE_TOAST), at most two lines; nothing for a factory that stayed put
  if (notices.length) r.fuseFx = [...(Array.isArray(r.fuseFx) ? r.fuseFx : []), ...notices.slice(0, 2)];
  for (const [b, src] of [[r.dusk?.build, "save:dusk:shapes"], [r.warlord?.build, "save:warlord:shapes"]] as [Raw | undefined, string][]) {
    if (!b || !Array.isArray(b.items) || !Array.isArray(b.routes)) continue;
    logShapes(src, migrateShapedFactories(b as never));
  }
  return { moved: moves.filter((v) => v.to).length, cargoed, refunded, lost: moves.reduce((n, v) => n + v.lost, 0) };
}

function v6to7(r: Raw): void {
  r.version = 7;
  const fx = Array.isArray(r.fuseFx) ? r.fuseFx : [];
  r.fuseFx = [];
  const steps = fuseAll(r as unknown as Run); // absent stars = 1: nothing else is rewritten
  r.fuseFx = steps.length ? [...fx, MIGRATE_TOAST] : fx;
}

/**
 * NUM-1 (REQ-BFG-047; cap's oracle bcc36c430b4f3a01): a save written before NUM-1 holds hull in pre-NUM-1 units. On load,
 * once, x10 the hullBonus of every Build it stores: the player's, tonight's foe's, today's warlord's and each day's battle
 * record's. A save written by NUM-1 is version 8 (RUN_VERSION) and never converts again. The storage key stays (a new key
 * would be a new storage key offline, which D3 rules out: see Run.seenGhosts).
 */
function v7to8(r: Raw): void {
  r.version = 8;
  const x10 = (b: Raw | null | undefined): void => {
    if (b && typeof b === "object" && typeof b.hullBonus === "number") b.hullBonus *= 10;
  };
  x10(r.build);
  x10(r.dusk?.build);
  x10(r.warlord?.build);
  for (const h of Array.isArray(r.history) ? (r.history as Raw[]) : []) {
    for (const b of Array.isArray(h?.record?.builds) ? (h.record.builds as Raw[]) : []) x10(b);
  }
}

/** SHAPES-1 (REQ-BFG-086 S6; cap's RUN2 note, Q4, cap's words): the load notice for a reshaped factory in the player's
 *  save: moved (`GANTRY PRESS HAS A NEW SHAPE. IT MOVED TO FIT.`, with `AND LOST 2 BELTS` / `LOST 1 BELT`), into cargo
 *  (`... HAS A NEW SHAPE AND NO ROOM. IT'S IN YOUR CARGO.`) or sold with a full cargo (`... IT WAS SOLD FOR 7 G.`). */
export function shapeNotice(name: string, o: { lost?: number; cargo?: boolean; sold?: number }): string {
  if (o.cargo) return `${name} HAS A NEW SHAPE AND NO ROOM. IT'S IN YOUR CARGO.`;
  if (o.sold !== undefined) return `${name} HAS A NEW SHAPE AND NO ROOM. IT WAS SOLD FOR ${o.sold} G.`;
  const n = o.lost ?? 0;
  return n ? `${name} HAS A NEW SHAPE. IT MOVED TO FIT AND LOST ${n} BELT${n > 1 ? "S" : ""}.` : `${name} HAS A NEW SHAPE. IT MOVED TO FIT.`;
}

/** SHAPES-1 (Q4): a shape notice waits for the build screen, as the save-migration notices do. */
const SHAPE_NOTICE = " HAS A NEW SHAPE";

/** 0.6.1a, cosmetic: take the next queued merge toast for the screen on show (game.ts). MERGED
 *  toasts show on any settled screen; the migration notice waits for the next build screen. */
export function nextFuseToast(run: Run, onBuildScreen: boolean, held = false): string | undefined {
  // AZ-PREP (REQ-BFG-077, REQ-BFG-078; REVIEW-NPC1 N1): a screen with its result card up holds them all (Screen.holdsMerges):
  // with every NPC win able to drop a part, a drop's merge toast covered the card's "+4 GOLD" line; it waits for the next screen
  if (held) return undefined;
  const fx = run.fuseFx;
  const i = fx ? fx.findIndex((t) => (t !== MIGRATE_TOAST && t !== BELTSIDE_TOAST && !t.includes(SHAPE_NOTICE)) || onBuildScreen) : -1; // SHAPES-1 (Q4): + the shape notices
  return i < 0 ? undefined : fx!.splice(i, 1)[0];
}

/**
 * 0.7.0a, save v7, no bump (a v8 key would be a new storage key written offline, which D3 rules out): online play adds
 * optional fields an offline save never has (Run.seenGhosts and uploaded, DuskFoe.source and ghostId, DayResult.record
 * and hulls). Kept when well formed, dropped otherwise, so no load trips over them; every older save loads as before.
 */
export function normalizeOnline(r: Raw): void {
  if (r.seenGhosts !== undefined) {
    if (Array.isArray(r.seenGhosts)) r.seenGhosts = r.seenGhosts.filter((id: unknown) => typeof id === "string" && ID_PATTERN.test(id)).slice(-64);
    else delete r.seenGhosts;
  }
  if (r.uploaded !== undefined && !(Number.isInteger(r.uploaded) && r.uploaded >= 1 && r.uploaded <= RUN_DAYS)) delete r.uploaded;
  const d = r.dusk as Raw | null | undefined;
  if (d && typeof d === "object") {
    if (d.source !== undefined && d.source !== "online" && d.source !== "offline") delete d.source;
    if (d.ghostId !== undefined && !(typeof d.ghostId === "string" && ID_PATTERN.test(d.ghostId))) delete d.ghostId;
  }
  for (const h of Array.isArray(r.history) ? (r.history as Raw[]) : []) {
    if (!h || typeof h !== "object") continue;
    const rec = h.record as Raw | undefined;
    if (rec !== undefined && !(rec && typeof rec === "object" && typeof rec.rules === "string" && Array.isArray(rec.builds) && rec.builds.length === 2)) delete h.record;
    if (h.hulls !== undefined && !(Array.isArray(h.hulls) && h.hulls.length === 2 && h.hulls.every((x: unknown) => typeof x === "number"))) delete h.hulls;
  }
}

/** Bring a parsed save up to v8 (NUM-1; was v7), or null if it isn't a usable run. Pure (tests call it directly). */
export function migrateRun(raw: unknown): Run | null {
  const r = raw as Raw | null;
  if (!r || typeof r !== "object" || !r.build || !r.shop || !Array.isArray(r.inventory)) return null;
  if (r.version === 3) v3to4(r);
  if (r.version === 4) v4to5(r);
  if (r.version === 5) v5to6(r);
  if (r.version === 6) v6to7(r);
  if (r.version === 7) v7to8(r); // NUM-1: hull x10, once
  if (r.version !== 8) return null;
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
  // 0.6.1r (review-061 N6): a saved lastMerchants that isn't an array reads as none (merchantWeight calls
  // .includes on it); absent stays absent (no variety factor either way). Save v7, no bump.
  if (r.lastMerchants !== undefined && !Array.isArray(r.lastMerchants)) r.lastMerchants = [];
  // 0.6.2 TUNE-M, RULE EARLY-LOSS REFUND (day.ts): a saved refund that isn't { day, lives } reads as given on day 3
  // with nothing back (the dawn it belongs to is past), so a load never gives it twice. Save v7, no bump.
  if (r.refund === null) delete r.refund;
  else if (r.refund !== undefined && !(typeof r.refund === "object" && typeof r.refund.day === "number" && typeof r.refund.lives === "number")) r.refund = { day: 3, lives: 0 };
  normalizeOnline(r);
  // 0.8.0 I1 M3 (DESIGN-wave3.md 4.2): the per-run draw's wares stay when well formed and are dropped otherwise; a run
  // without wares (every save from before 0.8.0) plays today's rule. Save v7, no bump.
  if (r.wares !== undefined && !waresOk(r.wares)) delete r.wares;
  // RUNES-1 (REQ-BFG-058): a pending pick is a day number and the held runes a list of { id } (run.ts takeRune); anything
  // else is dropped, so no load trips over it (a run from before runes has neither and never gets a pick). Save v7, no bump.
  if (r.runeDay !== undefined && !(typeof r.runeDay === "number" && Number.isInteger(r.runeDay))) delete r.runeDay;
  if (r.build.runes !== undefined && !(Array.isArray(r.build.runes) && r.build.runes.every((q: unknown) => !!q && typeof (q as Raw).id === "string"))) delete r.build.runes;
  // LC-1 (REQ-BFG-073): the run's LAST CHANCE ({ day } pending, { day, boon, id? } taken) and a history row's record of
  // it ({ lives, boon?, id? }) stay when well formed and are dropped otherwise, so no load trips over them; a save
  // without them (every save before LC-1, every switch-off run) loads exactly as before. Save v8, no bump.
  if (r.lastChance !== undefined && !lastChanceShapeOk(r.lastChance)) delete r.lastChance;
  for (const h of Array.isArray(r.history) ? (r.history as Raw[]) : []) {
    if (h && typeof h === "object" && h.lastChance !== undefined && !(h.lastChance && typeof h.lastChance === "object" && typeof h.lastChance.lives === "number")) delete h.lastChance;
  }
  // 0.8.0 H1 M3: a dusk's FOUNDRY/BASTION readout (DayResult.race) stays when well formed and is dropped otherwise, so
  // no load trips over it. Save v7, no bump: a Furnace or Weaver result never has one.
  for (const h of Array.isArray(r.history) ? (r.history as Raw[]) : []) {
    if (h && typeof h === "object" && h.race !== undefined && !readoutOk(h.race)) delete h.race;
  }
  r.day = clampDay(r.day);
  // RETUNE-1 (REQ-BFG-096): a hearts run's mark is `true` or absent (anything else is dropped: a lives run), and its
  // hearts clamp to HEARTS_START; a save without the mark (every switch-off run) clamps to START_LIVES exactly as before
  if (r.hearts !== undefined && r.hearts !== true) delete r.hearts;
  r.lives = Math.max(0, Math.min(r.hearts === true ? HEARTS_START : START_LIVES, Number(r.lives) || 0));
  if (typeof r.runId !== "string") r.runId = `s-${((Number(r.seed) || 0) >>> 0).toString(36)}`;
  if (!STAGES.includes(r.stage)) r.stage = "caravan";
  if (r.stage === "warlord" && !(r.warlord && r.warlord.day === r.day)) r.stage = "fork";
  if (Array.isArray(r.build.items) && Array.isArray(r.build.routes)) beltsideRun(r); // 0.6.2 BELTSIDE (D3): every load, idempotent
  // SHAPES-1 (REQ-BFG-086 S6): with SHAPES on, GANTRY PRESS and ASSEMBLY LINE in their new shapes; every load, idempotent
  if (shapesRules() && Array.isArray(r.build.items) && Array.isArray(r.build.routes)) shapesRun(r);
  if (Array.isArray(r.build.routes) && r.build.routes.some((q: Raw) => q && q.join !== undefined)) {
    try {
      // 0.6.2j (J8, J12): every load, idempotent; a deck without joins never gets here. JOINS-1 (REQ-BFG-091): a save is
      // the run in play, under this client's rules: with FREE_JOINS on pruneJoins keeps every legal join (no limit)
      pruneJoins(r.build as Build);
    } catch {
      /* a deck the sim can't read: its joins stay as saved (the sim treats an illegal join as an open end) */
    }
  }
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
