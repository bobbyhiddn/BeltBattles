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

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** How a pool ghost is named on the NEXT BATTLE card and the enemy plate: its hero, and the wins
 *  and lives it carried into that dusk (a v1 snapshot has no loss count). */
export function ghostName(g: Pick<GhostSnapshot, "hero" | "wins" | "lives">): string {
  return `GHOST · ${HEROES[g.hero].name} · ${g.wins}W ${g.lives}♥`;
}

/** PACKS M2 (REQ-BFG-063): a ghost's player name for its stored record, when it has one (pool entries have none). */
const named = (g: Pick<GhostSnapshot, "name">): { name?: string } => (g.name !== undefined ? { name: g.name } : {});

/** Choose today's dusk opponent from the pool, or else the day's stand-in captain with its named
 *  build (ghosts.ts standInFoe: standInBuild since 0.6.2 TUNE-C; the stand-in pool's standInPick
 *  from 0.6.0d). Pure: the caller stores it in run.dusk, so the deck never re-rolls. */
export function chooseFoe(run: Run, pool: readonly GhostSnapshot[]): DuskFoe {
  const g = pickGhost(pool, { rules: RULES_VERSION, day: run.day, runId: run.runId, wins: run.wins, lives: run.lives, seed: run.seed });
  if (g) {
    return {
      day: run.day, kind: "ghost", name: ghostName(g), hero: g.hero, build: clone(g.build),
      record: { wins: g.wins, lives: g.lives, runId: g.runId, playerId: g.playerId, createdAt: g.createdAt, ...named(g) },
    };
  }
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
      record: { wins: g.wins, lives: g.lives, runId: g.runId, playerId: g.playerId, createdAt: g.createdAt, ...named(g) },
      source: "online", ghostId: fetched.id,
    };
  }
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
  return `${who} · ${ghostRecord(foe.day, r.wins)}`;
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
  if (outcome === "win") run.wins++;
  if (outcome === "loss") {
    run.losses++;
    run.lives = Math.max(0, run.lives - 1);
  }
  run.gold += income;
  if (run.lives <= 0) run.over = "lost";
  else if (run.day >= RUN_DAYS) run.over = "complete";
  if (!run.over) {
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

/** A 10-0 run. */
export function flawless(run: Run): boolean {
  return run.over === "complete" && run.losses === 0 && run.wins === RUN_DAYS;
}
