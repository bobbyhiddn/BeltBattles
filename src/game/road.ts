// The road fork (0.6.0b, REQ-BFG-010, spec §19): after the dawn caravan the player picks ONE road
// stop: the day's road event, or the Easy, Medium or Hard warlord of warlordOffer(runSeed, day,
// matriarchBeatenOn). A warlord fight is PvE: the captain's hero with rivalBuild(id, day) (it keeps
// warlordHull and may exceed the budget), fought on its own seed hashSeed(runSeed, "warlord", day),
// so a reload replays the same fight. It NEVER costs a life: a loss only forfeits the reward.
// Rewards (decision 3): Easy +2 gold (0.6.2 RULE EASY PAY: +3 from day 4), Medium +4, Hard +3 and a pick of 1 of the warlord's 2 most
// expensive distinct non-signature parts (0.6.0c: always 2; a deck with fewer is filled from the
// same captain's later decks, see hardParts); the Iron Matriarch +5 and her most expensive part
// (LEGENDARY). R3: she holds the Hard slot on days 8-10 until beaten (run.matriarchBeatenOn).
// Road events act only on warlords: a pending SABOTAGE weakens the next warlord, a pending ELITE
// BOUNTY rides on the next Hard warlord. Dusk (day.ts) is unchanged: a ghost runs as submitted.
// NPC-1 (REQ-BFG-077, REQ-BFG-078), behind NPC_DAY (src/sim/npcDay.ts; off, everything above is unchanged): the fork offers
// the three warlords only (forkPicks); after the fight, won or lost, ON TO THE ROAD opens the day's event (onToTheRoad),
// then REFIT, then dusk. Every win rolls a drop from the deck it fought (warlordDrop; the Matriarch: her legendary part),
// which replaces Hard's pick of 2; the gold is unchanged.

import { hashSeed } from "../core/rng";
import { HEROES, ITEMS } from "../sim/content";
import type { Build } from "../sim/deck";
import { RIVALS, rivalBuild, rivalDays, warlordOffer, type Difficulty, type RivalId, type WarlordOffer } from "../sim/rivals";
import { starsOf, valueOf } from "../sim/stars";
import { beginDayEvent, beginRoad, eventFor } from "./events";
import { gainModule } from "./fuse";
import type { EventId } from "./eventDefs";
import { queueFuseAnim, type Run, type RoadPick, type WarlordFight, type WarlordOutcome, type WarlordReward } from "./run";
// NPC-1 (REQ-BFG-077, REQ-BFG-078): the NPC day and the drops, behind NPC_DAY (off: every function here is 0.9.7's)
import { DROP_CHANCE, DROP_STARS, dropTable, expectedDropValue, npcDayRules, rollDrop, type DropTable } from "../sim/npcDay";
import { warlordPool, MATRIARCH_DAY } from "../sim/rivals";

export const ROAD_PICKS: readonly RoadPick[] = ["event", "easy", "medium", "hard"];
/** NPC-1 (REQ-BFG-077): the fork's picks now: ROAD_PICKS, or with NPC_DAY on the three warlords only (the day's event
 *  comes after the fight, never instead of it). */
export function forkPicks(): readonly RoadPick[] {
  return npcDayRules() ? ROAD_PICKS.filter((p) => p !== "event") : ROAD_PICKS;
}
/** NPC-1: what pickRoad("event") says with NPC_DAY on. */
export const EVENT_AFTER_FIGHT = "THE EVENT COMES AFTER THE FIGHT";
export const REWARD_GOLD: Record<Difficulty, number> = { easy: 2, medium: 4, hard: 3 };
/** 0.6.2 TUNE-M, RULE EASY PAY (ROADMAP 0.6.2): the Easy warlord pays EASY_PAY_LATE gold from day EASY_PAY_FROM on;
 *  days 1-3 keep REWARD_GOLD.easy. Medium and Hard are unchanged. */
export const EASY_PAY_FROM = 4;
export const EASY_PAY_LATE = 3;
/** What beating a warlord of `tier` pays in gold on run day `day` (the Matriarch aside: MATRIARCH_GOLD). */
export function rewardGold(tier: Difficulty, day: number): number {
  return tier === "easy" && day >= EASY_PAY_FROM ? EASY_PAY_LATE : REWARD_GOLD[tier];
}
export const MATRIARCH_GOLD = 5;
/** SABOTAGE with no deck for the day before (the Matriarch on day 8): the warlord fights with -25 hull. */
export const SABOTAGE_HULL = 250;
// 0.8.0 H1 (REQ-BFG-011): every hero's signature factory (was only the KILN and the LOOM). A warlord's deck must never
// pay out a signature as a reward part; once race captains fly (N1), their CRUCIBLE or WARDWORKS would have. Today's 13
// captains are FURNACE and WEAVER decks, so nothing a run meets changes.
const SIGNATURE = new Set(Object.values(HEROES).map((h) => h.factory));

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
  // NPC-1 (REQ-BFG-077): with NPC_DAY on, the fight is followed by the day's event (while its choice is open)
  if (npcDayRules() && w?.result && beginDayEvent(run)) return "event";
  run.stage = "battle";
  return "battle";
}

/** NPC-1 (REQ-BFG-077, NPC_DAY on): the warlord result's ON TO THE ROAD: the day's event (set up once; "event" while its
 *  choice is open), else REFIT ("refit": the event is already resolved). Null before the fight has a result, and always
 *  with the switch off (nothing changes). */
export function onToTheRoad(run: Run): "event" | "refit" | null {
  const w = todaysWarlord(run);
  if (!npcDayRules() || !w?.result) return null;
  return beginDayEvent(run) ? "event" : "refit";
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

/** The day of the rivalBuild a warlord fights with: day, or day - 1 when SABOTAGE swapped it. */
export function warlordDeckDay(id: RivalId, day: number, sabotaged = false): number {
  return sabotaged && rivalDays(id).includes(day - 1) ? day - 1 : day;
}

/** A deck's n most valuable distinct parts (deck items and turret gear), signature factories and
 *  supplies excluded; ties by id. 0.6.1a: ranked by valueOf(def, stars) of the def's best copy (a
 *  starred warlord part ranks by its value); the pick always grants a 1-star copy (gainModule). */
export function topParts(b: Build, n: number): string[] {
  const best = new Map<string, number>();
  const see = (def: string, v: number) => best.set(def, Math.max(best.get(def) ?? 0, v));
  for (const p of b.items) if (!SIGNATURE.has(p.def)) see(p.def, valueOf(p.def, starsOf(p)));
  for (const m of b.mods) see(m.def, valueOf(m.def, starsOf(m)));
  return [...best.keys()]
    .filter((d) => ITEMS[d] && ITEMS[d].kind !== "supply" && !SIGNATURE.has(d))
    .sort((a, c) => best.get(c)! - best.get(a)! || (a < c ? -1 : a > c ? 1 : 0))
    .slice(0, n);
}

/** A Hard win's n parts (0.6.0c: every Hard pick offers 2): topParts of the deck it fought, and
 *  when that deck has fewer, the rest from the same captain's later decks (rivalBuild(id, d) for
 *  the days d in rivalDays(id) after deckDay, in order, each priciest first), skipping parts
 *  already offered. */
export function hardParts(id: RivalId, deck: Build, deckDay: number, n = 2): string[] {
  const out = topParts(deck, n);
  for (const d of rivalDays(id)) {
    if (out.length >= n) break;
    if (d <= deckDay) continue;
    for (const p of topParts(rivalBuild(id, d), Infinity)) {
      if (out.length >= n) break;
      if (!out.includes(p)) out.push(p);
    }
  }
  return out;
}

/** What beating this warlord pays (decision 3), from the deck it fights with (rivalBuild of
 *  deckDay; warlordDeckDay). 0.6.2 RULE EASY PAY: the gold on run day `day` (rewardGold; the run's day, not
 *  SABOTAGE's deck day; it defaults to deckDay for callers that have no run). */
export function warlordReward(id: RivalId, tier: Difficulty, deck: Build, deckDay: number, day = deckDay): WarlordReward {
  if (id === "matriarch") return { gold: MATRIARCH_GOLD, parts: topParts(deck, 1), legendary: true };
  // NPC-1 (REQ-BFG-078): with NPC_DAY on, every tier's win rolls a drop (DROP_CHANCE) instead of Hard's pick of 2: no parts
  // on offer, the chance carried for the cards; the gold is unchanged
  if (npcDayRules()) return { gold: rewardGold(tier, day), parts: [], legendary: false, chance: DROP_CHANCE[tier] };
  return { gold: rewardGold(tier, day), parts: tier === "hard" ? hardParts(id, deck, deckDay) : [], legendary: false };
}

/** NPC-1 (REQ-BFG-078): a warlord's drop table as the inspect panel shows it: the Matriarch's is her legendary part, always
 *  (chance 1); every other captain's is dropTable(tier, the deck it fights with). */
export function warlordDropTable(id: RivalId, tier: Difficulty, deck: Build): DropTable {
  if (id === "matriarch") {
    const p = topParts(deck, 1)[0];
    return p ? { chance: 1, lines: [{ def: p, cls: "legendary", odds: 1 }] } : { chance: 0, lines: [] };
  }
  return dropTable(tier, deck);
}

/** NPC-1 (REQ-BFG-078): what today's warlord win drops (NPC_DAY on): the Matriarch's legendary part, always; else the seeded
 *  roll (npcDay.ts rollDrop on hashSeed(seed, "warlord-drop", day)) over the deck it fought with. */
export function warlordDrop(seed: number, day: number, id: RivalId, tier: Difficulty, deck: Build): string | null {
  if (id === "matriarch") return topParts(deck, 1)[0] ?? null;
  return rollDrop(seed, day, tier, deck);
}

/**
 * NPC-1 (REQ-BFG-078), HULL-1's bench input: the expected road value of a `slot` win on `day` with NPC_DAY's drops: gold
 * plus the expected drop value (chance x the sum of odds x valueOf at 1 star; HULL-1b: at the drop's star, Hard's ★2),
 * the mean over every captain the slot can hold (warlordPool; "matriarch": her, from MATRIARCH_DAY), unsabotaged.
 * Arithmetic, no fight: a win is assumed.
 */
export function expectedRoadValue(day: number, slot: Difficulty | "matriarch"): number {
  const ids: RivalId[] = slot === "matriarch" ? (day >= MATRIARCH_DAY ? ["matriarch"] : []) : warlordPool(slot);
  if (!ids.length) return 0;
  const tier: Difficulty = slot === "matriarch" ? "hard" : slot;
  let sum = 0;
  for (const id of ids) {
    const deck = warlordDeck(id, day);
    const gold = id === "matriarch" ? MATRIARCH_GOLD : rewardGold(tier, day);
    sum += gold + expectedDropValue(warlordDropTable(id, tier, deck));
  }
  return sum / ids.length;
}

/** NPC-1 (REQ-BFG-078): the same for 0.9.7's rewards (NPC_DAY off): gold, plus for Hard the better part of its pick of 2
 *  (the player takes the priciest), and the Matriarch's legendary part; the mean over the slot's captains. */
export function roadValue097(day: number, slot: Difficulty | "matriarch"): number {
  const ids: RivalId[] = slot === "matriarch" ? (day >= MATRIARCH_DAY ? ["matriarch"] : []) : warlordPool(slot);
  if (!ids.length) return 0;
  const tier: Difficulty = slot === "matriarch" ? "hard" : slot;
  let sum = 0;
  for (const id of ids) {
    const deck = warlordDeck(id, day);
    const gold = id === "matriarch" ? MATRIARCH_GOLD : rewardGold(tier, day);
    const parts = id === "matriarch" ? topParts(deck, 1) : tier === "hard" ? hardParts(id, deck, day) : [];
    sum += gold + (parts.length ? Math.max(...parts.map((p) => valueOf(p, 1))) : 0);
  }
  return sum / ids.length;
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
    reward: warlordReward(id, tier, build, warlordDeckDay(id, run.day, sabotaged), run.day), result: null,
  };
}

/** Pick a road stop at the fork (once a day): the event opens, or the warlord fight is stored. */
export function pickRoad(run: Run, pick: RoadPick): { ok: boolean; reason?: string } {
  if (roadChosen(run)) return { ok: false, reason: "THE ROAD IS CHOSEN" };
  if (!ROAD_PICKS.includes(pick)) return { ok: false, reason: "NO SUCH ROAD" };
  if (!forkPicks().includes(pick)) return { ok: false, reason: EVENT_AFTER_FIGHT }; // NPC-1: no "event only" stop
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
    queueFuseAnim(run, gainModule(run, took)); // 0.6.1a: a 1-star copy to cargo, then merged
  } else if (won && npcDayRules()) {
    // NPC-1 (REQ-BFG-078): every other win rolls its drop once (seeded by the run and the day: a reload never re-rolls,
    // and this result is stored, so the call is idempotent); the part goes to cargo at its tier's star, then merged
    took = warlordDrop(run.seed, run.day, w.id, w.tier, w.build);
    // HULL-1b (REQ-BFG-078): at its tier's star (npcDay.ts DROP_STARS: Hard's at ★2)
    if (took) queueFuseAnim(run, gainModule(run, took, undefined, DROP_STARS[w.tier]));
  }
  if (won && w.id === "matriarch") run.matriarchBeatenOn = run.day;
  w.result = { outcome, time, gold, bountyPaid, parts: won ? [...w.reward.parts] : [], took };
  run.warlords.push({
    day: run.day, tier: w.tier, id: w.id, name: w.name, outcome, time, gold, part: took,
    // HULL-1a (REQ-BFG-078; REVIEW-NPC1 Q3): a sabotaged fight says so (NPC_DAY on, and only when true): the road log's
    // `sabotaged` names the one deck the server checks
    ...(w.sabotaged && npcDayRules() ? { sabotaged: true as const } : {}),
  });
  return w.result;
}

/** A Hard win's part pick (index into the offered parts): the part goes to cargo. */
export function takePart(run: Run, i: number): string | null {
  const w = todaysWarlord(run);
  const r = w?.result;
  if (!w || !r || r.outcome !== "win" || r.took || w.reward.legendary) return null;
  const def = r.parts[i];
  if (!def) return null;
  queueFuseAnim(run, gainModule(run, def)); // 0.6.1a: a 1-star copy to cargo, then merged
  r.took = def;
  const log = run.warlords[run.warlords.length - 1];
  if (log && log.day === run.day) log.part = def;
  return def;
}

/** The warlord's result has a part pick still open. */
export function pickPending(w: WarlordFight | null): boolean {
  return !!w?.result && w.result.outcome === "win" && !w.reward.legendary && !w.result.took && w.result.parts.length > 0;
}
