// Tooling helpers behind window.bb (shots, metrics, scripted runs). The game never calls these.

import { newRun, pendingRune, rollShop, takeRune, type Run } from "./game/run";
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
import { key as K, rotField, type Build, type Placed } from "./sim/deck";
import { LAST_CHANCE_AT, LAST_CHANCE_LIVES, lastChanceRules } from "./sim/lastChance"; // LC-1 (REQ-BFG-073): a tooling ghost's lives

// ------------------------------------------------------------------ 0.6.2 BELTSIDE showcase decks (shots)

const rig = (uid: number, def: string, x: number, y: number, rot = 0): Placed => ({ uid, def, x, y, ...rotField(def, rot) });

/** Tooling decks that put the BELTSIDE rules on screen (scripts/shots-list.mjs). Each is a legal deck
 *  (validateBuild) on its `day`; rot turns a rig's arrows clockwise from their shape (content.ts SHAPE_ARROWS). */
export const SHOWCASE: Record<string, { hero: HeroId; day: number; build: () => Build }> = {
  // FURNACE: rigs on both sides of one belt (TEMPER + WHETSTONE on (2,3), BRAKE + SPLITTER on (2,2)); speed
  // states fast (GREASE), slow (BRAKE) and OVERDRIVE (the X on the press belt); Shock (COIL); idle arrows.
  sides: {
    hero: "furnace", day: 5,
    build: () => ({
      hero: "furnace", mods: [], beltCap: 18, hullBonus: 0,
      items: [
        { uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "press", x: 6, y: 6 },
        rig(10, "temper", 1, 3, 1), rig(11, "whetstone", 3, 3, 3), rig(12, "grease", 1, 4, 1), rig(13, "brake", 3, 2, 3),
        rig(14, "overdrive", 5, 3), rig(15, "coil", 7, 4, 3), rig(16, "splitter", 1, 2, 1),
      ],
      routes: [
        { factory: 1, cells: [K(4, 5), K(3, 5), K(2, 5), K(2, 4), K(2, 3), K(2, 2), K(2, 1), K(3, 1), K(4, 1), K(4, 0)] },
        { factory: 2, cells: [K(6, 5), K(6, 4), K(6, 3), K(6, 2), K(6, 1), K(5, 1), K(5, 0)] },
      ],
    }),
  },
  // WEAVER: one LONG HAUL (II) between two parallel belts feeds both; a GALV. COIL (L) works a corner twice
  twobelts: {
    hero: "weaver", day: 3,
    build: () => ({
      hero: "weaver", mods: [], beltCap: 24, hullBonus: 0,
      items: [
        { uid: 1, def: "loom", x: 4, y: 6 },
        rig(10, "longhaul", 3, 3), rig(11, "temper", 5, 4, 3), rig(12, "whetstone", 1, 4, 1), rig(13, "coil", 7, 5, 1),
        rig(14, "splitter", 5, 2, 3),
      ],
      routes: [
        { factory: 1, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] },
        { factory: 1, cells: [K(3, 6), K(2, 6), K(2, 5), K(2, 4), K(2, 3), K(2, 2), K(2, 1), K(1, 1), K(1, 0)] },
        { factory: 1, cells: [K(6, 6), K(7, 6), K(8, 6), K(8, 5), K(8, 4), K(8, 3), K(8, 2), K(8, 1), K(8, 0)] },
      ],
    }),
  },
  // WEAVER: an OVERDRIVE (X) at a belt junction, all four arrows on two routes; a BRAKE on the third
  junction: {
    hero: "weaver", day: 4,
    build: () => ({
      hero: "weaver", mods: [], beltCap: 28, hullBonus: 0,
      items: [{ uid: 1, def: "loom", x: 4, y: 6 }, rig(10, "overdrive", 5, 3), rig(11, "brake", 0, 4, 1), rig(12, "temper", 3, 3, 1)],
      routes: [
        { factory: 1, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(5, 2), K(5, 1), K(4, 1), K(4, 0)] },
        { factory: 1, cells: [K(5, 5), K(5, 4), K(6, 4), K(6, 3), K(6, 2), K(6, 1), K(7, 1), K(8, 1), K(8, 0)] },
        { factory: 1, cells: [K(3, 6), K(2, 6), K(1, 6), K(1, 5), K(1, 4), K(1, 3), K(1, 2), K(1, 1), K(1, 0)] },
      ],
    }),
  },
  // 0.6.2j BELT JOINS (REQ-BFG-027): FURNACE, the KILN's belt up column 4 into the turret; a STAMP PRESS west of it whose
  // belt joins the KILN's tile (4,4) from the side. A TEMPER works the joining belt, a WHETSTONE the join tile (both
  // lines take it) and a BRAKE SHOE the tile after, so the shared stretch crowds and the join backs up at times.
  // "joinsopen" is the same deck before the join is drawn (scripts/joinrun.mjs draws it with real input).
  joins: {
    hero: "furnace", day: 3,
    build: () => ({
      hero: "furnace", mods: [], beltCap: 14, hullBonus: 0,
      items: [
        { uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "press", x: 0, y: 6 },
        rig(10, "temper", 1, 5, 1), rig(11, "whetstone", 5, 4, 3), rig(12, "brake", 5, 3, 3),
      ],
      routes: [
        { factory: 1, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] },
        { factory: 2, cells: [K(2, 6), K(2, 5), K(2, 4), K(3, 4)], join: K(4, 4) },
      ],
    }),
  },
  joinsopen: {
    hero: "furnace", day: 3,
    build: () => {
      const b = SHOWCASE.joins.build();
      b.routes.pop();
      return b;
    },
  },
};

/** A run at the dawn of the showcase deck's day with that deck on board (and, for a battle, `foe` as
 *  tonight's stored dusk opponent: another showcase deck, or the classic warlord). */
export function showcaseRun(name: string, o: RunSpec & { foe?: string } = {}): Run {
  const s = SHOWCASE[name];
  if (!s) throw new Error(`no showcase deck "${name}"`);
  const run = setupRun({ ...o, hero: s.hero, day: o.day ?? s.day });
  run.build = s.build();
  run.nextUid = 200;
  const f = o.foe ? SHOWCASE[o.foe] : undefined;
  if (f) run.dusk = { day: run.day, kind: "standin", name: o.foe!.toUpperCase(), hero: f.hero, build: f.build() };
  else pinClassicFoe(run);
  return run;
}

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
    // 0.6.2 BELTSIDE: rigs carrying `rot` need v2 (DESIGN-beltside D1)
    // LC-1 (REQ-BFG-073): with LAST CHANCE on, a ghost whose losses brought it to 1 life (or past it) had its life back
    v: build.items.some((p) => p.rot !== undefined) ? 2 : 1, rules: RULES_VERSION, hero, day: s.day, wins: s.wins ?? 0, lives: Math.max(1, START_LIVES - losses + (lastChanceRules() && START_LIVES - losses <= LAST_CHANCE_AT ? LAST_CHANCE_LIVES : 0)),
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
    // RUNES-2a (REQ-BFG-058, RUNES-1 gap 6): this skips the picker, so it takes the dawn rune first (the first card), as
    // a fight is refused while a pick is pending (run.ts fightRefusal)
    const offer = pendingRune(run);
    if (offer) takeRune(run, offer.ids[0]);
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
