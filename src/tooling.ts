// Tooling helpers behind window.bb (shots, metrics, scripted runs). The game never calls these.

import { newRun, rollShop, type Run } from "./game/run";
import { finishDay, startDusk } from "./game/day";
import { GHOST_KEY, loadPool, saveGhost, type GhostSnapshot } from "./game/ghosts";
import { beginRoad, choicesFor, pickChoice } from "./game/events";
import { warlordName } from "./sim/ai";
import { RULES_VERSION, START_LIVES, type HeroId } from "./sim/content";
import type { SideStats } from "./sim/battle";
import { honestStandInBuild, strongHonestBuild } from "./game/honest";
import { finishWarlord, pickPending, pickRoad, takePart } from "./game/road";
import { gainModule } from "./game/fuse";
import type { Difficulty } from "./sim/rivals";

export interface GhostSpec {
  day: number;
  hero?: HeroId;
  wins?: number;
  losses?: number;
  runId?: string;
  // 0: the day's honest warlord deck; > 0 strong: warlord gates up to `power` days ahead that fit the
  // day's gold, the rest spent on plating; < 0 under-built: the honest deck of `-power` days earlier
  power?: number;
}

/** A pool ghost for tooling: an honest warlord production build (M3b: whole plating, within the
 *  gold a player can have by that dusk), stamped like a player's snapshot. */
export function makeGhost(s: GhostSpec): GhostSnapshot {
  const hero = s.hero ?? "weaver";
  const power = s.power ?? 0;
  const build = power > 0 ? strongHonestBuild(hero, s.day, power) : honestStandInBuild(hero, Math.max(1, s.day + power));
  const losses = s.losses ?? 0;
  return {
    v: 1, rules: RULES_VERSION, hero, day: s.day, wins: s.wins ?? 0, lives: Math.max(1, START_LIVES - losses),
    build, runId: s.runId ?? "tool-pool", playerId: "tool-player", createdAt: Date.now(),
  };
}

export function clearPool(): void {
  try {
    localStorage.removeItem(GHOST_KEY);
  } catch {
    /* ignore */
  }
}

export function addGhosts(specs: GhostSpec[]): number {
  for (const s of specs) saveGhost(makeGhost(s));
  return loadPool().length;
}

export interface RunSpec {
  hero?: HeroId;
  seed?: number;
  day?: number;
  lives?: number;
  wins?: number;
  losses?: number;
  gold?: number;
  cargo?: string[]; // 0.6.1a: modules gained into cargo, in order (each through gainModule, so pairs merge)
}

/** A run standing at the dawn of `day` with the given record (its caravan rolled for that day). */
export function setupRun(o: RunSpec = {}): Run {
  const run = newRun(o.hero ?? "furnace", o.seed ?? 12345);
  run.day = o.day ?? 1;
  run.lives = o.lives ?? START_LIVES;
  run.wins = o.wins ?? 0;
  run.losses = o.losses ?? 0;
  run.gold = o.gold ?? run.gold;
  run.shop.rerolls = 0;
  for (const def of o.cargo ?? []) gainModule(run, def);
  rollShop(run);
  return run;
}

/** 0.5.0's matchup for this day (the other hero's warlord gates), stored as tonight's dusk foe, so
 *  bb.open("battle") (battle shots, metrics) keeps the 0.5.0 layouts; M3b: with the honest hull. */
export function pinClassicFoe(run: Run): void {
  if (run.dusk && run.dusk.day === run.day) return;
  const hero = run.enemyHero;
  run.dusk = { day: run.day, kind: "standin", name: warlordName(hero, run.day), hero, build: honestStandInBuild(hero, run.day) };
}

const ZERO = { damage: 0, shots: 0, firstShot: -1, idle: 0, turretTime: 1, jams: 0, burnDealt: 0, maxQueue: 0 } as unknown as SideStats;

/** Play a run to its end without battles (summary shots). Each day's road stop comes from `roads`
 *  (per day: "V"/"v" the event, taking its first open choice; "E"/"M"/"H" a warlord of that tier
 *  won, "e"/"m"/"h" lost; default the event), then dusk against the pool (or a stand-in) with the
 *  scripted result W / L / D. */
export function playOut(o: RunSpec & { results: string; roads?: string }): Run {
  const run = newRun(o.hero ?? "furnace", o.seed ?? 12345);
  let i = 0;
  for (const ch of o.results) {
    if (run.over) break;
    const r = o.roads?.[i++] ?? "V";
    const tier = ({ e: "easy", m: "medium", h: "hard" } as const)[r.toLowerCase() as "e" | "m" | "h"];
    if (tier) {
      pickRoad(run, tier);
      finishWarlord(run, r === r.toUpperCase() ? 0 : 1, 18 + run.day * 2.3);
      if (pickPending(run.warlord)) takePart(run, 0);
    } else if (beginRoad(run)) pickChoice(run, Math.max(0, choicesFor(run).findIndex((c) => !c.blocked)));
    startDusk(run, loadPool());
    finishDay(run, ch === "W" ? 0 : ch === "L" ? 1 : -1, 20 + run.day * 3.1, ZERO, ZERO);
  }
  return run;
}

/** A run at the dawn of `day` that has gone to the fork (fork shots). */
export function setupFork(o: RunSpec & { matriarchBeatenOn?: number; bounty?: boolean; sabotage?: boolean } = {}): Run {
  const run = setupRun(o);
  run.matriarchBeatenOn = o.matriarchBeatenOn ?? null;
  // B3 shots: a pending ELITE BOUNTY / SABOTAGE bought on an earlier day
  if (o.bounty) run.bounty = { day: Math.max(1, run.day - 1), stake: 3, pay: 10 };
  if (o.sabotage) run.sabotage = { day: Math.max(1, run.day - 1) };
  run.stage = "fork";
  return run;
}

/** A run that picked the warlord of `tier` at today's fork; with `outcome` its fight is already
 *  over (result-card shots): 0 a win (a Hard win keeps its part pick open), 1 a loss. */
export function setupWarlord(tier: Difficulty, o: RunSpec & { matriarchBeatenOn?: number; outcome?: 0 | 1 | -1 } = {}): Run {
  const run = setupFork(o);
  pickRoad(run, tier);
  if (o.outcome !== undefined) finishWarlord(run, o.outcome, 24.6);
  return run;
}
