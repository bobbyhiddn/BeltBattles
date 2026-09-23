// The road fork (0.6.0b, REQ-BFG-010, spec §19): after the dawn caravan the player picks ONE road
// stop: the day's road event, or the Easy, Medium or Hard warlord of warlordOffer(runSeed, day,
// matriarchBeatenOn). A warlord fight is PvE: the captain's hero with rivalBuild(id, day) (it keeps
// warlordHull and may exceed the budget), fought on its own seed hashSeed(runSeed, "warlord", day),
// so a reload replays the same fight. It NEVER costs a life: a loss only forfeits the reward.
// Rewards (decision 3): Easy +2 gold, Medium +4, Hard +3 and a pick of 1 of the warlord's 2 most
// expensive distinct non-signature parts; the Iron Matriarch +5 and her most expensive part
// (LEGENDARY). R3: she holds the Hard slot on days 8-10 until beaten (run.matriarchBeatenOn).
// Road events act only on warlords: a pending SABOTAGE weakens the next warlord, a pending ELITE
// BOUNTY rides on the next Hard warlord. Dusk (day.ts) is unchanged: a ghost runs as submitted.

import { hashSeed } from "../core/rng";
import { ITEMS } from "../sim/content";
import type { Build } from "../sim/deck";
import { RIVALS, rivalBuild, rivalDays, warlordOffer, type Difficulty, type RivalId, type WarlordOffer } from "../sim/rivals";
import { beginRoad, eventFor } from "./events";
import type { EventId } from "./eventDefs";
import type { Run, RoadPick, WarlordFight, WarlordOutcome, WarlordReward } from "./run";

export const ROAD_PICKS: readonly RoadPick[] = ["event", "easy", "medium", "hard"];
export const REWARD_GOLD: Record<Difficulty, number> = { easy: 2, medium: 4, hard: 3 };
export const MATRIARCH_GOLD = 5;
/** SABOTAGE with no deck for the day before (the Matriarch on day 8): the warlord fights with -25 hull. */
export const SABOTAGE_HULL = 25;
const SIGNATURE = new Set(["kiln", "loom"]);

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Today's fork: the road event and the three warlords. */
export interface Fork {
  day: number;
  event: EventId;
  warlords: WarlordOffer;
}

export function forkFor(run: Pick<Run, "seed" | "day" | "matriarchBeatenOn">): Fork {
  return {
    day: run.day,
    event: eventFor(run.seed, run.day),
    warlords: warlordOffer(run.seed, run.day, run.matriarchBeatenOn ?? undefined),
  };
}

/** The fork has been picked today. */
export function roadChosen(run: Run): boolean {
  return !!run.road && run.road.day === run.day;
}

/** Today's stored warlord fight, if one was picked. */
export function todaysWarlord(run: Run): WarlordFight | null {
  return run.warlord && run.warlord.day === run.day ? run.warlord : null;
}

/** The caravan leaves (the dawn button): where the day goes next. Before the pick: the fork. */
export function leaveCaravan(run: Run): "fork" | "event" | "warlord" | "battle" {
  if (!roadChosen(run)) {
    run.stage = "fork";
    return "fork";
  }
  if (run.road!.pick === "event") return beginRoad(run) ? "event" : "battle";
  const w = todaysWarlord(run);
  if (w && !w.result) {
    run.stage = "warlord";
    return "warlord";
  }
  run.stage = "battle";
  return "battle";
}

/** The deck a warlord fights with: rivalBuild(id, day); SABOTAGE: rivalBuild(id, day - 1), or
 *  -25 hull when the captain has no deck for the day before. */
export function warlordDeck(id: RivalId, day: number, sabotaged = false): Build {
  if (!sabotaged) return clone(rivalBuild(id, day));
  if (rivalDays(id).includes(day - 1)) return clone(rivalBuild(id, day - 1));
  const b = clone(rivalBuild(id, day));
  b.hullBonus -= SABOTAGE_HULL;
  return b;
}

/** A deck's n most expensive distinct parts (deck items and turret gear), signature factories and
 *  supplies excluded; ties by id. */
export function topParts(b: Build, n: number): string[] {
  const defs = new Set<string>();
  for (const p of b.items) if (!SIGNATURE.has(p.def)) defs.add(p.def);
  for (const m of b.mods) defs.add(m.def);
  return [...defs]
    .filter((d) => ITEMS[d] && ITEMS[d].kind !== "supply" && !SIGNATURE.has(d))
    .sort((a, c) => ITEMS[c].price - ITEMS[a].price || (a < c ? -1 : a > c ? 1 : 0))
    .slice(0, n);
}

/** What beating this warlord pays (decision 3), from the deck it fights with. */
export function warlordReward(id: RivalId, tier: Difficulty, deck: Build): WarlordReward {
  if (id === "matriarch") return { gold: MATRIARCH_GOLD, parts: topParts(deck, 1), legendary: true };
  return { gold: REWARD_GOLD[tier], parts: tier === "hard" ? topParts(deck, 2) : [], legendary: false };
}

/** The warlord of a tier on today's fork, set up for the fight. Consumes a pending SABOTAGE (the
 *  next warlord, any tier) and, for Hard, a pending ELITE BOUNTY. */
export function warlordFight(run: Run, tier: Difficulty): WarlordFight {
  const id = forkFor(run).warlords[tier];
  const sabotaged = !!run.sabotage;
  if (sabotaged) run.sabotage = null;
  let bounty = 0;
  if (tier === "hard" && run.bounty) {
    bounty = run.bounty.pay;
    run.bounty = null;
  }
  const build = warlordDeck(id, run.day, sabotaged);
  const r = RIVALS[id];
  return {
    day: run.day, tier, id, name: r.name, hero: r.hero, build, sabotaged, bounty,
    reward: warlordReward(id, tier, build), result: null,
  };
}

/** Pick a road stop at the fork (once a day): the event opens, or the warlord fight is stored. */
export function pickRoad(run: Run, pick: RoadPick): { ok: boolean; reason?: string } {
  if (roadChosen(run)) return { ok: false, reason: "THE ROAD IS CHOSEN" };
  if (!ROAD_PICKS.includes(pick)) return { ok: false, reason: "NO SUCH ROAD" };
  run.road = { day: run.day, pick };
  if (pick === "event") {
    beginRoad(run);
    return { ok: true };
  }
  run.warlord = warlordFight(run, pick);
  run.stage = "warlord";
  return { ok: true };
}

/** A warlord fight's battle seed: from the run seed and the day (a reload replays it). */
export function warlordSeed(run: Pick<Run, "seed" | "day">): number {
  return hashSeed(run.seed, "warlord", run.day);
}

/**
 * The warlord fight ends. Lives never change. A win pays its gold (and a staked bounty); the
 * Matriarch's legendary part goes straight to cargo and marks her beaten (R3); a Hard win waits
 * for takePart. Idempotent: a second call returns the stored result.
 */
export function finishWarlord(run: Run, winner: 0 | 1 | -1, time: number): WarlordOutcome | null {
  const w = todaysWarlord(run);
  if (!w) return null;
  if (w.result) return w.result;
  const outcome = winner === 0 ? "win" : winner === 1 ? "loss" : "draw";
  const won = outcome === "win";
  const bountyPaid = won ? w.bounty : 0;
  const gold = won ? w.reward.gold + bountyPaid : 0;
  run.gold += gold;
  let took: string | null = null;
  if (won && w.reward.legendary && w.reward.parts.length) {
    took = w.reward.parts[0];
    run.inventory.push({ uid: run.nextUid++, def: took });
  }
  if (won && w.id === "matriarch") run.matriarchBeatenOn = run.day;
  w.result = { outcome, time, gold, bountyPaid, parts: won ? [...w.reward.parts] : [], took };
  run.warlords.push({ day: run.day, tier: w.tier, id: w.id, name: w.name, outcome, time, gold, part: took });
  return w.result;
}

/** A Hard win's part pick (index into the offered parts): the part goes to cargo. */
export function takePart(run: Run, i: number): string | null {
  const w = todaysWarlord(run);
  const r = w?.result;
  if (!w || !r || r.outcome !== "win" || r.took || w.reward.legendary) return null;
  const def = r.parts[i];
  if (!def) return null;
  run.inventory.push({ uid: run.nextUid++, def });
  r.took = def;
  const log = run.warlords[run.warlords.length - 1];
  if (log && log.day === run.day) log.part = def;
  return def;
}

/** The warlord's result has a part pick still open. */
export function pickPending(w: WarlordFight | null): boolean {
  return !!w?.result && w.result.outcome === "win" && !w.reward.legendary && !w.result.took && w.result.parts.length > 0;
}
