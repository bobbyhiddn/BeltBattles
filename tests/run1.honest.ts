// RUN-1 T3 (REQ-BFG-059, REQ-BFG-116): honest LONG runs for the net and server tests. Not a test file itself.
// It plays real runs through the game's own functions (run.ts, road.ts, events.ts, day.ts) with the long run on (the whole
// play under withLongRun: the run's mark AND the pure content functions that read the module switch), as
// tests/h2.playthrough.test.ts plays 10-day runs: the dawn's rune, a few caravan buys, the fork's warlord and the day's
// event after it (NPC day), REFIT, then the dusk. Each dusk's snapshot is what the game uploads (day.ts ghostOf), plus the
// run's `losses` (snapshot v3, taken under a long run's rules): ghostOf does not write it yet, so the helper adds it.
// Battles are not simulated: a fight's outcome is an input of finishWarlord and finishDay, drawn from the run's own odds.
import { Rng, hashSeed } from "../src/core/rng";
import type { HeroId } from "../src/sim/content";
import type { SideStats } from "../src/sim/battle";
import { buyOffer, newRun, pendingLastChance, pendingRune, takeLastChance, takeRune, type Run } from "../src/game/run";
import { BOONS, offeredId } from "../src/sim/lastChance";
import { finishWarlord, forkPicks, leaveCaravan, onToTheRoad, pickPending, pickRoad, takePart, todaysWarlord } from "../src/game/road";
import { choicesFor, pickChoice } from "../src/game/events";
import { finishDay, ghostOf, startDusk } from "../src/game/day";
import { MAX_RUN_DRAWS, withLongRun } from "../src/sim/longRun";
import type { GhostSnapshot } from "../src/net/snapshot";

const NOSTATS = {} as SideStats; // finishDay and finishWarlord only store a fight's stats

export interface LongPlayed {
  hero: HeroId;
  run: Run;
  /** Every dusk's upload in order: day 1, 2, ... with `losses` (the dusks lost so far), as a long run's game would send it. */
  snaps: GhostSnapshot[];
  /** Per dusk: how many of the dock's PLATING / PATCH UP choices had been taken by then (to show the second bag is exercised). */
  dock: { plating: number; patchUp: number };
}

/** One honest long run of `hero` (run `i`) played to its end or to the dawn of day `until`. `odds`: the chance of a win and of
 *  a loss at dusk (the rest are draws, at most MAX_RUN_DRAWS - 2 of them: more would not be an upload the server takes). */
export function playLongRun(hero: HeroId, i: number, player: string, until = 16, odds: { win: number; loss: number } = { win: 0.42, loss: 0.2 }): LongPlayed {
  return withLongRun(() => {
    const rng = new Rng(hashSeed("run1-honest", hero, i));
    const run = newRun(hero, hashSeed("run1-run", hero, i), `run1-${hero}-${i}`);
    const snaps: GhostSnapshot[] = [];
    const dock = { plating: 0, patchUp: 0 };
    let draws = 0;
    while (!run.over && run.day <= until) {
      const lc = pendingLastChance(run);
      if (lc) takeLastChance(run, rng.pick(BOONS.filter((b) => offeredId(lc, b) !== null)));
      const offer = pendingRune(run);
      if (offer) takeRune(run, offer.ids[0]);
      for (let t = rng.int(4); t > 0; t--) {
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
        if (open.length) {
          const { c, ci } = rng.pick(open);
          pickChoice(run, ci);
          if (c.label === "PLATING") dock.plating++;
          if (c.gain.some((d) => d.k === "lives")) dock.patchUp++;
        }
        onToTheRoad(run);
      }
      startDusk(run, []);
      snaps.push({ ...ghostOf(run, 1_790_400_000_000 + i * 100 + run.day, player), losses: run.losses });
      const r = rng.next();
      let winner: 0 | 1 | -1 = r < odds.win ? 0 : r < odds.win + odds.loss ? 1 : -1;
      if (winner === -1) {
        if (draws >= MAX_RUN_DRAWS - 2) winner = 0; // the run keeps playing; its upload would be refused past the bound
        else draws++;
      }
      finishDay(run, winner, 20 + run.day, NOSTATS, NOSTATS);
    }
    return { hero, run, snaps, dock };
  });
}
