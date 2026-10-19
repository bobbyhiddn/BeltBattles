// ENCHANT-2 (REQ-BFG-085; BRIEF-ENCHANT2 T3): THE BOTS AT THE ASH SHRINE. The harness players (par, the casual c4/c5) take no road event: the par
// player's road stop is the Medium warlord alone (player.ts parNpcDay, "no map event and no after-fight event"), so the shrine is the first event
// they answer, and only when it is the day's event under ENCHANT. It follows the game's own order: the fight, then the day's event (events.ts
// beginDayEvent), then REFIT, where the open word is put on a part (enchanter.ts takeWarlordWord, as a warlord pick is).
//
// THE PAR PLAYER values the two paid cards in the rating's own currency (the change in the deck rating, a share of it, player.ts relOf):
//   * card 1, word A for SHRINE_HULL max hull: enchantBot.ts bestWordFor's gain on its best piece, less what the hull is worth (the rating of the
//     deck with that much hull less, over the rating of the deck as it is);
//   * card 2, word B for the cargo part the event names: bestWordFor's gain, less the part's gold value (stars.ts valueOf) at SHRINE_GOLD_REL of the
//     rating a gold, the par player's own bar for a gold (PolicyKnobs.minRel, a gain below it is no help).
// It takes the card with the larger net when that net is above minRel, else MOVE ON, so a word that gains nothing for its price is declined.
// THE CASUAL PLAYER never reads a rating (enchantBot.ts casualWordBuys' rule): with the chance CASUAL_WORD_RATE it takes one of the cards it can
// pay, by a seeded coin, and the word goes on a seeded legal part with no word; NO THANKS when no part takes it.
// Nothing here runs with ENCHANT off or on a day the shrine is not the event.

import { Rng, hashSeed } from "../../core/rng";
import { beginDayEvent, choicesFor, eventFor, pickChoice } from "../../game/events";
import { pendingEnchantPick } from "../../game/enchanter";
import type { Run } from "../../game/run";
import { SHRINE_HULL, SHRINE_ID } from "../../game/shrine";
import type { Build } from "../deck";
import { enchantRules, type EnchantId } from "../enchant";
import { longRun } from "../longRun";
import { valueOf } from "../stars";
import { CASUAL_WORD_RATE, botWarlordPick, bestWordFor, casualWarlordPick, type WordExtras } from "./enchantBot";

/** The rating a gold is worth to a bot weighing a cargo part (a share of the deck's rating per gold): PolicyKnobs.minRel's order, 0.4%. */
export const SHRINE_GOLD_REL = 0.004;

/** What a bot did at the shrine: the card it took (0 hull, 1 part, 2 MOVE ON), the word and where it went, and the values it weighed. */
export interface ShrineVisit {
  card: 0 | 1 | 2;
  word?: EnchantId;
  on?: string; // the def of the part the par player put the word on, "placed" for the casual player's, or "none" when no part took it (NO THANKS)
  gain: number; // the word's best gain on the deck (a share of the rating), 0 for MOVE ON
  cost: number; // what the card cost in the same share
}

/** The rating of `b` less `SHRINE_HULL` hull, over its rating as it is, as a loss (0 when the hull is not in the rating). */
function hullLoss(b: Build, day: number, rate: (b: Build, day: number) => number): number {
  const base = rate(b, day);
  if (!(base > 0)) return 0;
  return Math.max(0, 1 - rate({ ...b, hullBonus: b.hullBonus - SHRINE_HULL }, day) / base);
}

/**
 * The bot's visit to the shrine on `run`'s day, or null when today's event is not the shrine (or ENCHANT is off). `casual`: the casual player's
 * rule; else the par player's valuation with `rate` (player.ts rateOn) and the knob `minRel`. Mutates `run`: the day's event is set up and
 * resolved, the open word is put on a part (or declined), and run.stage is put back as it was (the harness has no REFIT screen).
 */
export function botShrine(run: Run, opts: { casual: boolean; rate: (b: Build, day: number) => number; minRel: number; extras: WordExtras }): ShrineVisit | null {
  if (!enchantRules() || eventFor(run.seed, run.day, longRun(run)) !== SHRINE_ID) return null;
  const stage = run.stage;
  beginDayEvent(run);
  const ev = run.event!;
  if (ev.picked >= 0) {
    run.stage = stage;
    return null; // already answered (a reload of the bot's own day): nothing more to do
  }
  const cards = choicesFor(run);
  let card: 0 | 1 | 2 = 2, gain = 0, cost = 0;
  if (opts.casual) {
    const rng = new Rng(hashSeed("casual-shrine", run.hero, run.seed, run.day));
    const open = ([0, 1] as const).filter((i) => !cards[i].blocked);
    if (open.length && rng.next() < CASUAL_WORD_RATE) card = open[rng.int(open.length)];
  } else {
    const best = (i: 0 | 1): { net: number; gain: number; cost: number } | null => {
      const c = cards[i], w = c.gain.find((d) => d.k === "ench");
      if (c.blocked || !w || w.k !== "ench") return null;
      const g = bestWordFor(run, w.word, opts.extras)?.value ?? 0;
      const give = c.cost.find((d) => d.k === "item");
      const price = give && give.k === "item"
        ? valueOf(give.def, run.inventory.find((q) => q.uid === give.uid)?.stars ?? 1) * SHRINE_GOLD_REL
        : hullLoss(run.build, run.day, opts.rate);
      return { net: g - price, gain: g, cost: price };
    };
    const a = best(0), b = best(1);
    const pick = a && (!b || a.net >= b.net) ? { i: 0 as const, ...a } : b ? { i: 1 as const, ...b } : null;
    if (pick && pick.net > opts.minRel) ({ i: card, gain, cost } = pick);
  }
  const res = pickChoice(run, card);
  if (!res.ok) throw new Error(`shrine bot: card ${card} refused on day ${run.day}: ${res.reason}`);
  let word: EnchantId | undefined, on: string | undefined;
  const pk = pendingEnchantPick(run);
  if (pk && card !== 2) {
    word = pk.words[0] as EnchantId;
    if (opts.casual) on = casualWarlordPick(run, new Rng(hashSeed("casual-shrine-pick", run.hero, run.seed, run.day))) ? "placed" : "none";
    else {
      const r = botWarlordPick(run, opts.extras);
      on = r && r !== "skipped" ? r.spot.def : "none";
    }
  }
  run.stage = stage;
  return { card, ...(word ? { word } : {}), ...(on ? { on } : {}), gain, cost };
}
