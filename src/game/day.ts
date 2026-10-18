// The day loop (0.6.0, REQ-BFG-008): DAWN (the caravan) -> the ROAD (an event, when the day has
// one) -> DUSK (a fight against a ghost). The dusk opponent is picked when dusk starts and stored
// in the run, so a reload fights the same one; the build screen previews the same pick. A dusk
// loss costs a life, a draw none; 0 lives loses the run, surviving day 10's dusk completes it.

import { HEROES, RULES_VERSION, RUN_DAYS, START_LIVES, incomeFor } from "../sim/content";
import type { Side, SideStats } from "../sim/battle";
import { pickGhost, standInFoe, type GhostSnapshot } from "./ghosts";
import { currentName, playerId, SNAPSHOT_V3 } from "./ghostSnapshot";
import { displayName, nameProblem, WANDERER } from "../net/names"; // PACKS M2 (REQ-BFG-063)
import { rollShop, runeDawn, type DayResult, type DuskFoe, type Run } from "./run";
import type { FetchedGhost } from "../net/ghostClient"; // 0.7.0a: online play (type only)
import { LAST_CHANCE_LIVES, lastChanceFires } from "../sim/lastChance"; // LC-1 (REQ-BFG-073); Z-BUMP: no switch
import { npcDayRules, roadLog } from "../sim/npcDay"; // NPC-1 (REQ-BFG-077, REQ-BFG-078): the snapshot's road log
import { heartsDusk, heartsRun } from "../sim/hearts"; // RETUNE-1 (REQ-BFG-096): a hearts run's dusk
import { lcLastDay, longRun, longRunEnd } from "../sim/longRun"; // RUN-1 (REQ-BFG-059): a long run's end and LAST CHANCE
import { LAST_CHANCE_AT } from "../sim/lastChance"; // RETUNE-1 run 2: the dusk card's LAST CHANCE line on a hearts run
import { firstRunGate } from "../sim/firstRun"; // FIRSTDAY-1 (REQ-BFG-004, F4): the snapshot's first-run flag
import { ENDLESS_LIVES, endlessDusk, endlessOffered, inEndless } from "../sim/endless"; // ENDLESS-1 (REQ-BFG-059): the endless dusk step and state
import { endlessFor } from "../net/rulesGate"; // ENDLESS-1: an endless snapshot travels only under rules that have endless
import { godFoe } from "../sim/godStandIn"; // ENDLESS-1: the GOD stand-in, an endless dusk's last foe

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** How a pool ghost is named on the NEXT BATTLE card and the enemy plate: its hero, and the wins
 *  and lives it carried into that dusk (a v1 snapshot has no loss count). ENDLESS-1: an endless ghost carries its endless wins
 *  instead (its run's WIN_GOAL wins are no news): "GHOST · FURNACE · ENDLESS 4 2♥". */
export function ghostName(g: Pick<GhostSnapshot, "hero" | "wins" | "lives"> & { mode?: string; endlessWins?: number }): string {
  if (g.mode === "endless" && g.endlessWins !== undefined) return `GHOST · ${HEROES[g.hero].name} · ENDLESS ${g.endlessWins} ${g.lives}♥`;
  return `GHOST · ${HEROES[g.hero].name} · ${g.wins}W ${g.lives}♥`;
}

/** PACKS M2 (REQ-BFG-063): a ghost's player name for its stored record, when it has one (pool entries have none). */
const named = (g: Pick<GhostSnapshot, "name">): { name?: string } => (g.name !== undefined ? { name: g.name } : {});
/** RUN-1 (R1.5, T4b): the ghost's own day, when a widened pick met it on a later day than its own (D6: a long run's thin day
 *  widens to the nearest EARLIER day); nothing for an exact-day pick, so a 10-day run's record is exactly as before. */
const widened = (g: Pick<GhostSnapshot, "day">, day: number): { ghostDay?: number } => (g.day !== day ? { ghostDay: g.day } : {});
/** RUN-1 (R2.4): the ghost's STATED losses, when its snapshot states them (snapshot.ts v3: a long run's record does); nothing when it states
 *  none (every 10-day ghost, an older snapshot), so such a record is exactly as before. foeTitle prints W-L from it. */
const stated = (g: Pick<GhostSnapshot, "losses">): { losses?: number } => (typeof g.losses === "number" ? { losses: g.losses } : {});
/** ENDLESS-1 (REQ-BFG-059): an endless ghost's stamp, the endless wins it carried into that dusk (nothing for a run ghost, so every
 *  run record is exactly as before). */
const endlessStamp = (g: Pick<GhostSnapshot, "mode" | "endlessWins">): { endlessWins?: number } =>
  g.mode === "endless" && typeof g.endlessWins === "number" ? { endlessWins: g.endlessWins } : {};

/** ENDLESS-1 (BRIEF-ENDLESS1 3.3): an endless dusk's foe when no endless ghost is near: THE GOD STAND-IN (sim/godStandIn.ts), the
 *  stand-in pool's strongest deck of the day with the hull the player's endless wins earn it. PvE: kind "standin", flagged `god`. */
export function endlessGodFoe(run: Run): DuskFoe {
  const f = godFoe(run.day, run.endlessRun?.wins ?? 0);
  return { day: run.day, kind: "standin", name: f.name, hero: f.hero, build: f.build, god: true };
}

/** Choose today's dusk opponent from the pool, or else the day's stand-in captain with its named
 *  build (ghosts.ts standInFoe: standInBuild since 0.6.2 TUNE-C; the stand-in pool's standInPick
 *  from 0.6.0d). Pure: the caller stores it in run.dusk, so the deck never re-rolls.
 *  ENDLESS-1 (REQ-BFG-059): an endless dusk (sim/endless.ts inEndless) reads only endless ghosts of the pool (nearest endless wins
 *  first, then the nearest earlier day's), then the GOD stand-in. A run's dusk never reads an endless ghost. */
export function chooseFoe(run: Run, pool: readonly GhostSnapshot[]): DuskFoe {
  // RUN-1 (REQ-BFG-059, D6): the run's own mark decides the widening (a thin day widens to the nearest earlier day on a long run;
  // a 10-day run saved before the bump keeps its exact-day pick)
  const endless = inEndless(run);
  const g = endless
    ? pickGhost(pool, { rules: RULES_VERSION, day: run.day, runId: run.runId, wins: run.endlessRun!.wins, lives: run.lives, seed: run.seed, endless: true })
    : pickGhost(pool, { rules: RULES_VERSION, day: run.day, runId: run.runId, wins: run.wins, lives: run.lives, seed: run.seed, long: longRun(run) });
  if (g) {
    return {
      day: run.day, kind: "ghost", name: ghostName(g), hero: g.hero, build: clone(g.build),
      record: { wins: g.wins, lives: g.lives, runId: g.runId, playerId: g.playerId, createdAt: g.createdAt, ...named(g), ...widened(g, run.day), ...stated(g), ...endlessStamp(g) },
    };
  }
  if (endless) return endlessGodFoe(run);
  const s = standInFoe(run.seed, run.day);
  return { day: run.day, kind: "standin", name: s.name, hero: s.hero, build: s.build, rival: s.id };
}

/** Today's stored dusk opponent, if dusk has started. */
export function storedFoe(run: Run): DuskFoe | null {
  return run.dusk && run.dusk.day === run.day ? run.dusk : null;
}

/** The opponent tonight: the stored one once dusk has started, else the pick it will make. */
export function duskFoe(run: Run, pool: readonly GhostSnapshot[]): DuskFoe {
  return storedFoe(run) ?? chooseFoe(run, pool);
}

/** 0.7.0a (online play, src/game/online.ts): what the ghost server's answer makes of tonight's foe. A server ghost
 *  (fetchGhost's source "server") fights as a kind "ghost" DuskFoe: ghostName, its hero, a cloned build and its record.
 *  Anything else (fetchGhost's fallback, whose id starts with "offline-", or no answer at all) is 0.6.2's own dusk
 *  stand-in, standInFoe, and never fetchGhost's stand-in pool deck: the fallback is 0.6.2's tuned dusk. Pure. */
export function onlineFoe(run: Run, fetched: FetchedGhost | null): DuskFoe {
  if (fetched && fetched.source === "server" && !fetched.id.startsWith("offline-")) {
    const g = fetched.snapshot;
    return {
      day: run.day, kind: "ghost", name: ghostName(g), hero: g.hero, build: clone(g.build),
      record: { wins: g.wins, lives: g.lives, runId: g.runId, playerId: g.playerId, createdAt: g.createdAt, ...named(g), ...widened(g, run.day), ...stated(g), ...endlessStamp(g) },
      source: "online", ghostId: fetched.id,
    };
  }
  // ENDLESS-1: an endless dusk with no endless ghost from the server meets the GOD stand-in, not a captain
  if (inEndless(run)) return { ...endlessGodFoe(run), source: "offline" };
  const s = standInFoe(run.seed, run.day);
  return { day: run.day, kind: "standin", name: s.name, hero: s.hero, build: s.build, rival: s.id, source: "offline" };
}

/** 0.7.0a: store tonight's foe from the server's answer, once (a stored foe stays), so a reload fights the same one; a
 *  server ghost's id joins run.seenGhosts (no repeats in a run). The caller saves the run. */
export function storeOnlineFoe(run: Run, fetched: FetchedGhost | null): DuskFoe {
  const had = storedFoe(run);
  if (had) return had;
  const f = onlineFoe(run, fetched);
  run.dusk = f;
  if (f.ghostId) run.seenGhosts = [...(run.seenGhosts ?? []).filter((id) => id !== f.ghostId), f.ghostId];
  return f;
}

/** Dusk starts: pick (once per day) and store the opponent. The caller saves the run. 0.7.0a: `online` (online play
 *  only) takes the ghost server's answer instead of the local pool (storeOnlineFoe); offline it is absent, as in 0.6.2. */
export function startDusk(run: Run, pool: readonly GhostSnapshot[], online?: { ghost: FetchedGhost | null }): DuskFoe {
  const f = storedFoe(run) ?? (online ? storeOnlineFoe(run, online.ghost) : chooseFoe(run, pool));
  run.dusk = f;
  run.stage = "battle";
  return f;
}

/** The player's own snapshot as it fights today's dusk (wins and lives going INTO the fight).
 *  0.6.1a: v2, whose build carries each copy's stars (absent = 1). PACKS M2 (REQ-BFG-063): `name`, the device's stored
 *  player name (ghostSnapshot.ts currentName), goes in last when there is one (no name: the snapshot is as before). */
export function ghostOf(run: Run, createdAt = Date.now(), player = playerId(), name: string | null = currentName()): GhostSnapshot {
  const seed = run.seed >>> 0;
  return {
    v: SNAPSHOT_V3, rules: RULES_VERSION, hero: run.hero, day: run.day, wins: run.wins, lives: Math.max(1, run.lives),
    build: clone(run.build), runId: run.runId, playerId: player, createdAt: Math.max(0, Math.floor(createdAt)),
    ...(name ? { name } : {}),
    // RUNES-1 (REQ-BFG-058, snapshot v3): the run seed, last (left out when zero), so the server re-derives the rune
    // offers (runes.ts runeProblem). FIX-5 (a server-issued seed) is a later job: this is the client's run seed.
    ...(seed ? { seed } : {}),
    // RUN-1 (REQ-BFG-059, D4): a long run's snapshot states its losses (snapshot.ts: R1e's `losses`, taken under long-run rules only),
    // so the record check can tell a loss from a draw; a 10-day run's snapshot is exactly as before
    ...(longRun(run) ? { losses: run.losses } : {}),
    // ENDLESS-1 (REQ-BFG-059, BRIEF-ENDLESS1 3.4): an endless dusk's snapshot states its mode, the endless wins and hearts going into
    // the fight and the victory day (snapshot v3, taken only under rules with endless: rulesGate.ts endlessFor), after `losses` (the
    // run's own, unchanged), in V3_SNAPSHOT_FIELDS order; `wins` is the run's WIN_GOAL, `lives` the endless hearts. A run's
    // snapshot, and every endless snapshot under rules without it, is exactly as before
    ...(inEndless(run) && endlessFor(RULES_VERSION) ? { mode: "endless" as const, endlessWins: run.endlessRun!.wins, endlessLives: Math.max(1, run.lives), victoryDay: run.endlessRun!.victoryDay } : {}),
    // LC-1 (REQ-BFG-073): a taken LAST CHANCE, after the seed (the server re-derives its offer and finds its rune); a run
    // without one (every switch-off run) snapshots exactly as before
    ...(run.lastChance?.boon ? { lastChance: { day: run.lastChance.day, boon: run.lastChance.boon, ...(run.lastChance.id !== undefined ? { id: run.lastChance.id } : {}) } } : {}),
    // NPC-1 (REQ-BFG-077, REQ-BFG-078): with NPC_DAY on, the road log, last: one entry per day reached (its tier, outcome
    // and drop), so the server re-derives each warlord and drop from the seed; off, every snapshot is as before
    ...(npcDayRules() && run.warlords.length ? { road: roadLog(run.warlords) } : {}),
    // FIRSTDAY-1 (REQ-BFG-004, F4): a first run's flag, last of all, on every snapshot of that run (the server re-derives
    // its days 1-2 rune offers by F3's rule); every other run, and every run with the gate off, snapshots as before
    ...(run.firstRun === true && firstRunGate() ? { firstRun: true as const } : {}),
  };
}

/** PACKS M2 (REQ-BFG-063): a ghost's record on the dusk intro, as the summary screen shows a run's (record(): W-L): the
 *  wins it carried into that dusk, then the dusks before it that it did not win (day - 1 - wins: a snapshot keeps no
 *  loss or draw count, and its lives can't give one, since the early-loss refund and PATCH UP give lives back). */
export function ghostRecord(day: number, wins: number): string {
  return `${wins}-${Math.max(0, day - 1 - wins)}`;
}

/** PACKS M2 (REQ-BFG-063): who the dusk intro says the foe is (after "VS "). A player's ghost: NAME#TAG · W-L (the tag
 *  from its playerId, names.ts); a ghost without a usable name (seed pool, legacy uploads): WANDERER · W-L; a stand-in
 *  captain: its captain name, as before. */
export function foeTitle(foe: Pick<DuskFoe, "kind" | "name" | "day" | "record">): string {
  const r = foe.record;
  if (foe.kind !== "ghost" || !r) return foe.name;
  const who = r.name !== undefined && nameProblem(r.name) === null ? displayName(r.name, r.playerId) : WANDERER;
  if (r.endlessWins !== undefined) return `${who} · ENDLESS ${r.endlessWins}`; // ENDLESS-1: an endless ghost shows its score, not its run's record
  // RUN-1 (R1.5, T4b): a widened ghost's W-L is read at ITS day (the dusks before it that it did not win), not at this dusk's
  // RUN-1 (R2.4): a ghost whose snapshot STATED its losses (the stamp's `losses`) shows them (a draw is no loss); without them, as before
  const wl = typeof r.losses === "number" ? `${r.wins}-${r.losses}` : ghostRecord(r.ghostDay ?? foe.day, r.wins);
  return `${who} · ${wl}`;
}

/** Score line: the dusk record, W-L. */
export function record(run: Pick<Run, "wins" | "losses">): string {
  return `${run.wins}-${run.losses}`;
}

/**
 * 0.6.2 TUNE-M, RULE EARLY-LOSS REFUND (ROADMAP 0.6.2 §1, the genre study's cushion): a run that lost a life at dusk on
 * day 1 or 2 gets REFUND_LIVES back at the dawn of day REFUND_DAY. Once per run (only that dawn, and run.refund records
 * it), never above START_LIVES. A win or a draw pays more or the same and keeps every life, so a run that throws days
 * 1-2 never reaches day 3's dusk with more lives or gold than one that won them.
 */
export const REFUND_DAY = 3;
export const REFUND_LIVES = 1;
/** The rule in the player's words (the dawn toast, the dusk card and the rules card). */
export const REFUND_TEXT = `EARLY-LOSS REFUND: +${REFUND_LIVES} LIFE`;

/** The build screen's dawn toast: REFUND_TEXT on the dawn the refund gave a life back, else null. */
export const refundNotice = (run: Pick<Run, "day" | "refund">): string | null =>
  run.refund && run.refund.day === run.day && run.refund.lives > 0 ? REFUND_TEXT : null;
/** The dusk card's line when the dawn it leads to gives a life back ("+1 LIFE AT DAWN"), else null. */
export const refundCardLine = (r: Pick<DayResult, "refund">): string | null => (r.refund ? `+${r.refund} LIFE AT DAWN` : null);

/** LC-1 (REQ-BFG-073): the dusk card's line when this dusk fired LAST CHANCE ("LAST CHANCE: +1 LIFE"), else null. */
export const lastChanceCardLine = (r: Pick<DayResult, "lastChance" | "heartsLost">): string | null =>
  !r.lastChance ? null
    // RETUNE-1 run 2 (REQ-BFG-096): a hearts run's loss (heartsLost set) that fired it: the run stays on 1 heart (it sets the
    // hearts to 1, adding none when the loss left 1); today's width (20 characters), so the card's INCOME line stays clear
    : r.heartsLost !== undefined ? `LAST CHANCE: ${LAST_CHANCE_AT} ${LAST_CHANCE_AT === 1 ? "HEART" : "HEARTS"}`
    : `LAST CHANCE: +${r.lastChance.lives} LIFE`;

/** Did the run lose a life at dusk before REFUND_DAY? (Lives are only ever lost at dusk.) */
export const lostEarly = (run: Pick<Run, "history">): boolean => run.history.some((h) => h.day < REFUND_DAY && h.outcome === "loss");

/** At the dawn run.day has just reached: the lives the early-loss refund gives back now, or null when it doesn't apply
 *  (another day, no early loss, or already given). Pure. */
export function earlyLossRefund(run: Pick<Run, "day" | "lives" | "history" | "refund">): number | null {
  if (run.day !== REFUND_DAY || run.refund || !lostEarly(run)) return null;
  return Math.max(0, Math.min(REFUND_LIVES, START_LIVES - run.lives));
}

/** Apply a dusk result: income, the W-L record, a life on a loss; then the run ends or the next dawn comes (0.6.2:
 *  on day 3, with the early-loss refund). */
export function finishDay(run: Run, winner: Side | -1, time: number, player: SideStats, enemy: SideStats): DayResult {
  const outcome = winner === 0 ? "win" : winner === 1 ? "loss" : "draw";
  const income = incomeFor(run.day, outcome === "win");
  const foe = storedFoe(run);
  const res: DayResult = { day: run.day, outcome, income, time, foe: foe?.name ?? "?", ghost: foe?.kind === "ghost", player, enemy };
  run.history.push(res);
  // ENDLESS-1 (REQ-BFG-059): an endless dusk takes its own step (sim/endless.ts endlessDusk): the run's wins and losses stay the
  // run's, an endless win is counted apart, a loss costs ONE heart on every day, no LAST CHANCE and no refund
  if (inEndless(run)) return finishEndlessDay(run, res, outcome, income);
  if (outcome === "win") run.wins++;
  // RETUNE-1 (REQ-BFG-096): a hearts run (hearts.ts heartsRun: started with HEARTS on) takes the hearts step instead: a
  // loss costs heartCost(day), LAST CHANCE at the first loss leaving 1 heart or fewer sets the hearts to 1, no refund
  if (heartsRun(run)) return finishHeartsDay(run, res, outcome, income);
  if (outcome === "loss") {
    run.losses++;
    run.lives = Math.max(0, run.lives - 1);
  }
  // LC-1 (REQ-BFG-073), RULE LAST CHANCE (lastChance.ts; Z-BUMP: the game's rule, no switch): a loss that leaves exactly 1 life on a
  // day before RUN_DAYS gives one back at once, once a run; the card pick waits for the next dawn's screen
  // RUN-1 (REQ-BFG-059): on a long run any day (lcLastDay: no last day)
  if (lastChanceFires(run.day, outcome, run.lives, run.lastChance !== undefined, lcLastDay(run))) {
    run.lives += LAST_CHANCE_LIVES;
    run.lastChance = { day: run.day };
    res.lastChance = { lives: LAST_CHANCE_LIVES };
  }
  run.gold += income;
  if (longRun(run)) run.over = longRunEnd(run); // RUN-1: WON at WIN_GOAL wins, LOST at 0 lives; never by the day
  else if (run.lives <= 0) run.over = "lost";
  else if (run.day >= RUN_DAYS) run.over = "complete";
  if (!run.over) {
    nextDawn(run);
    // 0.6.2 RULE EARLY-LOSS REFUND: the new dawn is day 3 and a life was lost on day 1 or 2: one back, once per run
    const back = earlyLossRefund(run);
    if (back !== null) {
      run.refund = { day: run.day, lives: back };
      run.lives += back;
      if (back > 0) res.refund = back;
    }
  }
  return res;
}

/**
 * ENDLESS-1 (REQ-BFG-059, BRIEF-ENDLESS1 3.2): CONTINUE ENDLESS, taken on the RUN WON screen of a run that carries the endless mark
 * (Run.endless: newRun set it while ENDLESS was on). The run is already won and recorded (its 10th win ended it: history, profile
 * and style folds ran then, exactly as today); nothing here changes or costs any of it. It keeps the same run and build (hero,
 * deck, cargo, gold, runes, upgrades), sets the endless state (victoryDay = the day of the 10th win, endless wins, losses and
 * draws 0) and the hearts to ENDLESS_LIVES whatever the run had left, clears `over` and goes to the next dawn (every day still has
 * its dawn rune, shop, upgrades, merges and road). Returns false (and changes nothing) when the run is not offered endless. The
 * caller saves the run.
 */
export function startEndless(run: Run): boolean {
  if (!endlessOffered(run)) return false;
  run.endlessRun = { victoryDay: run.day, wins: 0, losses: 0, draws: 0 };
  run.over = null;
  run.lives = ENDLESS_LIVES;
  run.dusk = null;
  nextDawn(run);
  return true;
}

/** ENDLESS-1: an endless dusk after its history row: the step (endless.ts endlessDusk), the income, then endless ends (every
 *  reader of run.over sees a WON run again, with EndlessRun.end saying why) or the next dawn comes, with no early-loss refund. */
function finishEndlessDay(run: Run, res: DayResult, outcome: DayResult["outcome"], income: number): DayResult {
  const e = run.endlessRun!;
  res.endless = true; // the history row says so (replays.ts replayAt: the run's wins stay WIN_GOAL)
  const step = endlessDusk(run.lives, e.wins, run.day, outcome);
  if (outcome === "win") e.wins = step.wins;
  else if (outcome === "loss") e.losses++;
  else e.draws++;
  if (step.cost > 0) res.heartsLost = step.cost;
  run.lives = step.hearts;
  run.gold += income;
  if (step.end) {
    e.end = step.end;
    run.over = "won";
  } else nextDawn(run);
  return res;
}

/** RUN-1 (REQ-BFG-059): the benches' par run asked past its own end (the 10th win of a long run, day 10's dusk of a
 *  10-day run) goes on to the next dawn, so its deck keeps growing on the days a long run reaches (harness/player.ts
 *  playerRun's depth). Never the game's: a game run ends where finishDay ends it. */
export function continueRun(run: Run): void {
  run.over = null;
  nextDawn(run);
}

/** The next dawn: a fresh day, its caravan and its rune (finishDay's, for both scales). */
function nextDawn(run: Run): void {
  run.day++;
  run.stage = "caravan";
  run.dusk = null;
  run.road = null;
  run.warlord = null;
  // 0.6.1d: today's final caravan is tomorrow's variety check (ARSENAL.md §5.2 step 1).
  run.lastMerchants = run.shop.wagons.map((w) => w.merchant);
  run.shop = { wagons: [], rerolls: 0, discount: run.nextShop.discount, free: run.nextShop.free };
  run.nextShop = { discount: 0, free: 0 };
  rollShop(run);
  runeDawn(run); // RUNES-1 (REQ-BFG-058): the held dawn-gold runes pay; today's rune pick (runes.ts' own stream, never the shop's)
}

/** RETUNE-1 (REQ-BFG-096): finishDay on a hearts run, after the history row and the win count: the hearts step
 *  (hearts.ts heartsDusk), the income, then the run ends or the next dawn comes, with no early-loss refund. A LAST CHANCE
 *  row records the hearts it gave back (0 when the loss left exactly 1) and the hearts it saved the run on (`hearts`). */
function finishHeartsDay(run: Run, res: DayResult, outcome: DayResult["outcome"], income: number): DayResult {
  if (outcome === "loss") run.losses++;
  // RUN-1 (REQ-BFG-059): hearts.ts's lastDay re-pointed: on a long run LAST CHANCE can fire on any day (lcLastDay)
  const step = heartsDusk(run.lives, run.day, outcome, run.lastChance !== undefined, { lastDay: lcLastDay(run) });
  if (step.cost > 0) res.heartsLost = step.cost;
  if (step.lastChance) {
    res.lastChance = { lives: step.hearts - Math.max(0, run.lives - step.cost) };
    run.lastChance = { day: run.day };
  }
  run.lives = step.hearts;
  run.gold += income;
  if (longRun(run)) run.over = longRunEnd(run); // RUN-1: WON at WIN_GOAL wins, LOST at 0 hearts; never by the day
  else if (run.lives <= 0) run.over = "lost";
  else if (run.day >= RUN_DAYS) run.over = "complete";
  if (!run.over) nextDawn(run);
  return res;
}

/** A 10-0 run. RUN-1 (REQ-BFG-059): a long run is flawless when won with 0 losses. */
export function flawless(run: Run): boolean {
  if (longRun(run)) return run.over === "won" && run.losses === 0;
  return run.over === "complete" && run.losses === 0 && run.wins === RUN_DAYS;
}

/** RUN-1 (REQ-BFG-059): did the run end won? A long run's "won", or a 10-day run's "complete" (it survived day 10). */
export const runWon = (run: Pick<Run, "over">): boolean => run.over === "won" || run.over === "complete";
