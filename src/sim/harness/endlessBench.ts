// ENDLESS-1 (REQ-BFG-059, BRIEF-ENDLESS1 section 4): the endless bench. Opt-in: no bench, test or tool but tests/endless1.bench.test.ts
// imports it, and nothing here changes a policy or a pinned number (the sim fingerprint, parBench's fingerprint).
//
// WHAT IT MEASURES: won runs carried into endless against the GOD stand-in, with ENDLESS on, for the par player (player.ts
// playerRun) and the casual bot c5 (casual.ts), every hero. One row per (bot, hero, seed):
//  - PHASE A, the run up to its victory: the "long" model of tools/retune1.ts runLedger (RUN-1's T6), the game as it ships: the
//    policy's own deck each day (playerRun, played day by day to the depth asked), the dusk foe the game's own pick makes on the
//    committed seed pool (pick.ts matchPick, the same request a new player sends; the day's stand-in captain when none is left),
//    the fight at that day's scales (simulate's `day`), HEARTS (hearts.ts heartsDusk) with LAST CHANCE on any day, its card from
//    the bot's own pick and the deck replayed from the next dawn with it. The run is WON at its WIN_GOAL-th dusk win; one that
//    is lost, or still going past LONG_RUN_MAX_DAY (a backstop, flagged), is no won run and is not carried on.
//  - PHASE B, endless (a won run only; CONTINUE ENDLESS taken): ENDLESS_LIVES hearts, the same bot's deck of each later day (the
//    bot keeps shopping, as the game's day loop does: playerRun past its win, day.ts continueRun), the foe on day d the GOD
//    stand-in with the hull its endless wins earn it (godStandIn.ts godBuild, `step` hull per endless win), the dusk step the
//    game's own (endless.ts endlessDusk): a loss costs 1 heart, a draw none, no LAST CHANCE; it ends at 0 hearts, at
//    ENDLESS_WIN_CAP endless wins or after the dusk of ENDLESS_LAST_DAY. Every GOD step asked is played on the same run, so one
//    pass gives the reads before and after a tune.
// APPROXIMATIONS (they are the T6 bench's, flagged in every table): the policy's deck path is the WIN path (its income is a
// win's, whatever the run lost on the way); nobody takes PATCH UP (the par and casual bots take no event: player.ts parNpcDay);
// no endless ghost exists (at launch every endless foe is the GOD stand-in: that is the read).

import { Rng, hashSeed } from "../../core/rng";
import { simulate } from "../battle";
import { RULES_VERSION, type HeroId } from "../content";
import type { Build } from "../deck";
import { ENDLESS_LAST_DAY, ENDLESS_LIVES, ENDLESS_WIN_CAP, endlessDusk, type EndlessEnd } from "../endless";
import { godBuild } from "../godStandIn";
import { HEARTS_RULE, heartsDusk } from "../hearts";
import { LONG_RUN_MAX_DAY, WIN_GOAL } from "../longRun";
import { lastChanceOffer, type Boon } from "../lastChance";
import { openRunesRules } from "../openRunes";
import { standInFoe } from "../../game/ghosts";
import { matchPick } from "../../net/pick";
import type { MatchRequest } from "../../net/matchmaking";
import type { PoolEntry } from "../../net/snapshot";
import { botLastChancePick } from "./lastChance";
import { casualOpts } from "./casual";
import { parRunSeed, playerRun, type PlayerOpts } from "./player";

export type EndlessBot = "par" | "c5";
export const ENDLESS_BOTS: readonly EndlessBot[] = ["par", "c5"];

/** The bot's options (par: the typical policy as it is; c5: the casual bot, casual.ts CASUAL_TUNES.c5). */
export const botOpts = (bot: EndlessBot): PlayerOpts => (bot === "par" ? {} : casualOpts("c5"));

/** The GOD hull steps (Build.hullBonus per endless win) one pass plays: the shipped one (ENDLESS_GOD_HULL_STEP, endless.ts), the
 *  floor (no extra hull) and two harder ones, for the reads before and after a tune. */
export const DEFAULT_STEPS: readonly number[] = [0, 250, 1500, 4000]; // BUMP-1F (RULING-BUMP1F-R9 R9.2): was [0, 250, 1000, 4000]; the shipped step is 1500 now (was 250, kept as the "before" read; 4000 the harder one; 1000 left out)

/** The deck depths asked: the policy's run is played day by day, and its cost is linear in the days. A bot that mostly wins (par)
 *  starts at DEPTH_LONG (a victory by day 25 and 9 endless days); one that mostly loses (c5) at DEPTH_SHORT and asks for more only
 *  when a run goes on past it. A longer endless asks for the last endless day's. (Days 1..d of a deeper run are the shorter run:
 *  the policy never looks ahead, so no read depends on the depth asked.) */
const DEPTH_SHORT = 16, DEPTH_LONG = 34;

/** One endless played on one GOD step. */
export interface EndlessPlay {
  step: number;
  wins: number; // the score: endless wins
  losses: number;
  draws: number;
  end: EndlessEnd; // why it ended
  lastDay: number; // the day of its last dusk
  dusks: number; // endless dusks fought (wins + losses + draws): "the days endless lasts"
}

export interface BenchRow {
  bot: EndlessBot;
  hero: HeroId;
  seed: number;
  /** "won" (carried into endless), "lost" (0 hearts before the 10th win) or "backstop" (still going past LONG_RUN_MAX_DAY). */
  run: "won" | "lost" | "backstop";
  /** The run's last dusk day: the victory day when won. */
  runDay: number;
  /** The run's wins at its end and the day LAST CHANCE fired (0: never). */
  runWins: number;
  lcDay: number;
  /** A won run's endless, one per GOD step asked (empty for a run that was not won). */
  endless: EndlessPlay[];
}

/** The fight: deck a (side 0) against b on `day`'s scales; 0 a wins, 1 b wins, -1 a draw (retune1.ts fight). */
function fight(a: Build, b: Build, seed: number, day: number): 0 | 1 | -1 {
  const w = simulate(a, b, seed, undefined, undefined, day).winner;
  return w === 0 ? 0 : w === 1 ? 1 : -1;
}

/** One (bot, hero, seed): phase A, then phase B on every step. `pool`: the seed pool as the game's pick reads it (committed
 *  server/seedPoolData.ts, decoded). The module switches stand as the build ships them (the caller turns ENDLESS on). */
export function benchRun(bot: EndlessBot, hero: HeroId, seed: number, pool: readonly PoolEntry[], steps: readonly number[] = DEFAULT_STEPS): BenchRow {
  const runSeed = parRunSeed(hero, seed);
  const base = botOpts(bot);
  let opts: PlayerOpts = base;
  let depth = bot === "par" ? DEPTH_LONG : DEPTH_SHORT;
  const decksOf = (o: PlayerOpts, d: number): Build[] => playerRun(hero, d, seed, o).map((x) => x.build);
  let decks = decksOf(opts, depth);
  /** The bot's deck at dusk of `day`, asking a deeper deck path when the run goes on past the one in hand. */
  const deckAt = (day: number): Build => {
    if (day > decks.length && depth < ENDLESS_LAST_DAY) {
      depth = day <= DEPTH_LONG ? DEPTH_LONG : ENDLESS_LAST_DAY;
      decks = decksOf(opts, depth);
    }
    return decks[Math.min(day, decks.length) - 1];
  };

  // ---- phase A: the run, to its WIN_GOAL-th win (retune1.ts runLedger, the "long" model, hearts on)
  let left = HEARTS_RULE.start, wins = 0, lcUsed = false, lcDay = 0;
  const seen: string[] = [];
  let run: BenchRow["run"] = "backstop", runDay = LONG_RUN_MAX_DAY;
  for (let day = 1; day <= LONG_RUN_MAX_DAY; day++) {
    const deck = deckAt(day);
    const req: MatchRequest = { rules: RULES_VERSION, day, wins, lives: Math.max(1, left), playerId: "endless1-bench", seen, runs: 0 };
    const hit = matchPick(pool, req, new Rng(hashSeed("rt1-match", runSeed, day)));
    let foe: Build;
    if (hit) {
      foe = hit.snapshot.build;
      seen.push(hit.id);
    } else foe = standInFoe(runSeed, day).build;
    const r = fight(deck, foe, hashSeed(runSeed, "battle", day), day);
    const outcome = r === 0 ? "win" : r === 1 ? "loss" : "draw";
    if (r === 0) wins++;
    const s = heartsDusk(left, day, outcome, lcUsed, { rule: HEARTS_RULE, lastDay: Infinity });
    left = s.hearts;
    if (s.lastChance) {
      lcUsed = true;
      lcDay = day;
      const offer = lastChanceOffer(runSeed, day, hero, (deck.runes ?? []).map((q) => q.id), openRunesRules());
      const boon = botLastChancePick(offer, hero, deck, day, { wins }).boon as Boon;
      opts = { ...base, lastChance: { day, boon } };
      decks = decksOf(opts, depth);
    }
    if (left <= 0) { run = "lost"; runDay = day; break; }
    if (wins >= WIN_GOAL) { run = "won"; runDay = day; break; }
  }
  const row: BenchRow = { bot, hero, seed, run, runDay, runWins: wins, lcDay, endless: [] };
  if (run !== "won") return row;

  // ---- phase B: endless, on every GOD step
  for (const step of steps) {
    let hearts = ENDLESS_LIVES, ew = 0, el = 0, ed = 0, day = runDay + 1, end: EndlessEnd | null = null;
    for (; end === null; day++) {
      const r = fight(deckAt(day), godBuild(day, ew, step), hashSeed(runSeed, "battle", day), day);
      const outcome = r === 0 ? "win" : r === 1 ? "loss" : "draw";
      const s = endlessDusk(hearts, ew, day, outcome);
      hearts = s.hearts;
      ew = s.wins;
      if (outcome === "loss") el++;
      else if (outcome === "draw") ed++;
      end = s.end;
      if (end !== null) break;
    }
    row.endless.push({ step, wins: ew, losses: el, draws: ed, end: end as EndlessEnd, lastDay: day, dusks: ew + el + ed });
  }
  return row;
}

/** Mean, median, p10 and p90 of `xs` (p by nearest rank on the sorted list); NaN for none. */
export function summary(xs: readonly number[]): { n: number; mean: number; median: number; p10: number; p90: number } {
  const s = [...xs].sort((a, b) => a - b);
  const at = (p: number) => (s.length ? s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))] : NaN);
  return { n: s.length, mean: s.length ? s.reduce((a, b) => a + b, 0) / s.length : NaN, median: s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN, p10: at(0.1), p90: at(0.9) };
}

/** The table of one (bot, hero) group of rows on `step`: runs, won runs and the endless reads of the won ones. */
export function readOf(rows: readonly BenchRow[], step: number): { runs: number; won: number; wins: ReturnType<typeof summary>; reach30: number; days: number } {
  const plays = rows.flatMap((r) => r.endless.filter((e) => e.step === step));
  return {
    runs: rows.length, won: rows.filter((r) => r.run === "won").length, wins: summary(plays.map((p) => p.wins)),
    reach30: plays.length ? plays.filter((p) => p.wins >= ENDLESS_WIN_CAP).length / plays.length : NaN,
    days: plays.length ? plays.reduce((a, p) => a + p.dusks, 0) / plays.length : NaN,
  };
}
