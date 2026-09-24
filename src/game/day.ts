// The day loop (0.6.0, REQ-BFG-008): DAWN (the caravan) -> the ROAD (an event, when the day has
// one) -> DUSK (a fight against a ghost). The dusk opponent is picked when dusk starts and stored
// in the run, so a reload fights the same one; the build screen previews the same pick. A dusk
// loss costs a life, a draw none; 0 lives loses the run, surviving day 10's dusk completes it.

import { HEROES, RULES_VERSION, RUN_DAYS, incomeFor } from "../sim/content";
import type { Side, SideStats } from "../sim/battle";
import { pickGhost, standInFoe, type GhostSnapshot } from "./ghosts";
import { playerId, SNAPSHOT_VERSION } from "./ghostSnapshot";
import { rollShop, type DayResult, type DuskFoe, type Run } from "./run";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** How a pool ghost is named on the NEXT BATTLE card and the enemy plate: its hero, and the wins
 *  and lives it carried into that dusk (a v1 snapshot has no loss count). */
export function ghostName(g: Pick<GhostSnapshot, "hero" | "wins" | "lives">): string {
  return `GHOST · ${HEROES[g.hero].name} · ${g.wins}W ${g.lives}♥`;
}

/** Choose today's dusk opponent from the pool, or else the day's stand-in captain with its
 *  full-purse stand-in pool deck (ghosts.ts standInFoe: standInPick since 0.6.0d, no longer the
 *  cheaper standInBuild). Pure: the caller stores it in run.dusk, so the deck never re-rolls. */
export function chooseFoe(run: Run, pool: readonly GhostSnapshot[]): DuskFoe {
  const g = pickGhost(pool, { rules: RULES_VERSION, day: run.day, runId: run.runId, wins: run.wins, lives: run.lives, seed: run.seed });
  if (g) {
    return {
      day: run.day, kind: "ghost", name: ghostName(g), hero: g.hero, build: clone(g.build),
      record: { wins: g.wins, lives: g.lives, runId: g.runId, playerId: g.playerId, createdAt: g.createdAt },
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

/** Dusk starts: pick (once per day) and store the opponent. The caller saves the run. */
export function startDusk(run: Run, pool: readonly GhostSnapshot[]): DuskFoe {
  const f = storedFoe(run) ?? chooseFoe(run, pool);
  run.dusk = f;
  run.stage = "battle";
  return f;
}

/** The player's own snapshot as it fights today's dusk (wins and lives going INTO the fight).
 *  0.6.1a: v2, whose build carries each copy's stars (absent = 1). */
export function ghostOf(run: Run, createdAt = Date.now(), player = playerId()): GhostSnapshot {
  return {
    v: SNAPSHOT_VERSION, rules: RULES_VERSION, hero: run.hero, day: run.day, wins: run.wins, lives: Math.max(1, run.lives),
    build: clone(run.build), runId: run.runId, playerId: player, createdAt: Math.max(0, Math.floor(createdAt)),
  };
}

/** Score line: the dusk record, W-L. */
export function record(run: Pick<Run, "wins" | "losses">): string {
  return `${run.wins}-${run.losses}`;
}

/** Apply a dusk result: income, the W-L record, a life on a loss; then the run ends or the next dawn comes. */
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
  }
  return res;
}

/** A 10-0 run. */
export function flawless(run: Run): boolean {
  return run.over === "complete" && run.losses === 0 && run.wins === RUN_DAYS;
}
