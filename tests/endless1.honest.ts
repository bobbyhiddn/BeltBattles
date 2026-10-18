// ENDLESS-1 (REQ-BFG-059, BRIEF-ENDLESS1 3.4): honest ENDLESS runs for the net and server tests. Not a test file itself. It plays a
// real run through the game's own functions (run.ts, road.ts, events.ts, day.ts) with the long run AND endless on, as
// tests/run1.honest.ts plays long runs: the dawn's rune, a few caravan buys, the fork's warlord and the day's event after it
// (NPC day), REFIT, then the dusk. The run is won (its dusk outcomes are an input), CONTINUE ENDLESS is taken (day.ts startEndless)
// and the endless dusks go on from an input list. Each dusk's snapshot is what the game uploads (day.ts ghostOf: the run's
// `losses`, and in endless its mode, endless wins and hearts and the victory day). Battles are not simulated.
import { Rng, hashSeed } from "../src/core/rng";
import type { HeroId } from "../src/sim/content";
import type { SideStats } from "../src/sim/battle";
import { buyOffer, newRun, pendingLastChance, pendingRune, takeLastChance, takeRune, type Run } from "../src/game/run";
import { BOONS, offeredId } from "../src/sim/lastChance";
import { finishWarlord, forkPicks, leaveCaravan, onToTheRoad, pickPending, pickRoad, takePart, todaysWarlord } from "../src/game/road";
import { choicesFor, pickChoice } from "../src/game/events";
import { finishDay, ghostOf, startDusk, startEndless } from "../src/game/day";
import { withEndless } from "../src/sim/endless";
import { withLongRun } from "../src/sim/longRun";
import type { GhostSnapshot } from "../src/net/snapshot";

const NOSTATS = {} as SideStats;
export const WIN = 0 as const, LOSS = 1 as const, DRAW = -1 as const;
export type Winner = typeof WIN | typeof LOSS | typeof DRAW;

export interface EndlessPlayed {
  hero: HeroId;
  run: Run;
  /** The run's dusk snapshots (days 1 .. the victory day), as a long run's game would send them. */
  runSnaps: GhostSnapshot[];
  /** The endless dusks' snapshots (victory day + 1 ..), each with mode "endless", its endless wins and hearts going in, the victory day. */
  endlessSnaps: GhostSnapshot[];
}

/** One honest run of `hero` (run `i`): `runOutcomes` its dusks until it is won (a missing entry is a win), then endless on
 *  `endlessOutcomes` (a missing entry is a win) until endless ends or `until` is the day. */
export function playEndless(hero: HeroId, i: number, player: string, opts: { runOutcomes?: readonly Winner[]; endlessOutcomes?: readonly Winner[]; until?: number; buys?: number } = {}): EndlessPlayed {
  return withEndless(() => withLongRun(() => {
    const rng = new Rng(hashSeed("endless1-honest", hero, i));
    const run = newRun(hero, hashSeed("endless1-run", hero, i), `e1-${hero}-${i}`);
    const runSnaps: GhostSnapshot[] = [], endlessSnaps: GhostSnapshot[] = [];
    let ri = 0, ei = 0, started = false;
    for (;;) {
      if (run.over === "won" && !started) {
        if (!startEndless(run)) throw new Error("the won run was not offered endless");
        started = true;
      }
      if (run.over || run.day > (opts.until ?? 99)) break;
      const lc = pendingLastChance(run);
      if (lc) takeLastChance(run, rng.pick(BOONS.filter((b) => offeredId(lc, b) !== null)));
      const offer = pendingRune(run);
      if (offer) takeRune(run, offer.ids[0]);
      for (let t = opts.buys !== undefined ? (rng.int(4), opts.buys) : rng.int(4); t > 0; t--) { // `buys`: a lean deck (the road's hull and belt only), cheap to check at the deep days
        const open = run.shop.wagons.flatMap((w, wi) => w.offers.map((o, si) => ({ o, wi, si }))).filter(({ o }) => !o.sold && o.price <= run.gold);
        if (!open.length) break;
        const { wi, si } = rng.pick(open);
        buyOffer(run, wi, si);
      }
      leaveCaravan(run);
      const pick = rng.pick(forkPicks());
      pickRoad(run, pick);
      if (pick !== "event") {
        finishWarlord(run, rng.pick([0, 1, -1] as const), 20 + run.day);
        if (pickPending(run.warlord)) takePart(run, rng.int(todaysWarlord(run)!.result!.parts.length));
      }
      if (pick === "event" || onToTheRoad(run) === "event") {
        const open = choicesFor(run).map((c, ci) => ({ c, ci })).filter(({ c }) => !c.blocked);
        if (open.length) pickChoice(run, rng.pick(open).ci);
        onToTheRoad(run);
      }
      startDusk(run, []);
      (started ? endlessSnaps : runSnaps).push(ghostOf(run, 1_790_400_000_000 + i * 100 + run.day, player));
      const w = started ? opts.endlessOutcomes?.[ei++] ?? WIN : opts.runOutcomes?.[ri++] ?? WIN;
      finishDay(run, w, 20 + run.day, NOSTATS, NOSTATS);
    }
    return { hero, run, runSnaps, endlessSnaps };
  }));
}
