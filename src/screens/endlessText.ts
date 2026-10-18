// ENDLESS-1 3.5 (REQ-BFG-059; run 1 starts run 2's work): the words an endless run's screens say, in one pure module (no DOM, no
// drawing), so the screens only place them and tests/endless1.text.test.ts pins every string the brief names. An UNMARKED run's and
// a 10-day run's words are never read from here (their screens keep their own). "No /10 anywhere in endless": the build bar, the
// title's CONTINUE line and the summary's foot line say ENDLESS n where a run says WINS n/10; the battle and replay banners, the
// fork's header and the inspector's RUN row already say DAY n (a long run's) and "n/3 HEARTS" (stakes.ts livesOf, through
// hearts.ts livesCap), so they need no endless words of their own.
import { HEROES, type HeroId } from "../sim/content";
import { ENDLESS_LIVES, endlessOver, inEndless, type EndlessRun } from "../sim/endless";
import { C } from "../render/palette";

/** The HUD colour of an endless run: the palette's plum, in its lighter step (plum5) because plum4, the BOSS tag's plum, reads only
 *  3.51:1 on the bar's ink and navy (palette.ts); plum5 reads 6.3:1. */
export const ENDLESS_COLOR = C.plum5;

/** "ENDLESS 4": the score so far, where a run says "WINS 3/10". */
export const endlessScore = (e: Pick<EndlessRun, "wins">): string => `ENDLESS ${e.wins}`;

/** The build bar's run pieces for an endless run, as chrome.ts barRun returns them: " · ENDLESS 4" then " · DAY 15", both plum. */
export function endlessBar(run: { day: number; endlessRun: Pick<EndlessRun, "wins"> }): [string, string][] {
  return [[` · ${endlessScore(run.endlessRun)}`, ENDLESS_COLOR], [` · DAY ${run.day}`, ENDLESS_COLOR]];
}

/** The title's CONTINUE line for an endless save: "ENDLESS 4 · DAY 15 · FURNACE". */
export const endlessContinueSub = (save: { day: number; hero: HeroId; endlessRun: Pick<EndlessRun, "wins"> }): string =>
  `${endlessScore(save.endlessRun)} · DAY ${save.day} · ${HEROES[save.hero].name}`;

/** The summary's foot line for an endless run ("7 HEARTS LEFT" is the caller's livesLeft): " · ENDLESS 7" where a run says " · WINS 3/10". */
export const endlessFootTail = (e: Pick<EndlessRun, "wins">): string => ` · ${endlessScore(e)}`;

// ---- the RUN WON screen's offer (a marked, won run that has not chosen yet; sim/endless.ts endlessOffered) ------------------------

/** The two buttons: CONTINUE ENDLESS (primary) and END RUN (which leads to NEW RUN / TITLE as today). */
export const CONTINUE_ENDLESS = "CONTINUE ENDLESS";
export const END_RUN = "END RUN";

/** The three short rules lines under CONTINUE ENDLESS. */
export const ENDLESS_OFFER_LINES: readonly string[] = [`${ENDLESS_LIVES} FRESH HEARTS`, "A LOSS COSTS 1", "YOUR SCORE IS ENDLESS WINS"];

// ---- the ENDLESS OVER card (an endless that ended: run.over "won" again with EndlessRun.end set) -------------------------------

export const ENDLESS_OVER_TITLE = "ENDLESS OVER";

/** "7 ENDLESS WINS · FURNACE · WON ON DAY 13": the score, the hero and the day the run was won on (the victory day, not the day
 *  endless ended on). "1 ENDLESS WIN" for one. */
export const endlessOverLine = (run: { hero: HeroId; endlessRun: Pick<EndlessRun, "wins" | "victoryDay"> }): string =>
  `${run.endlessRun.wins} ENDLESS ${run.endlessRun.wins === 1 ? "WIN" : "WINS"} · ${HEROES[run.hero].name} · WON ON DAY ${run.endlessRun.victoryDay}`;

/** Why endless ended, in the card's second line. */
export const ENDLESS_END_WORDS: Readonly<Record<NonNullable<EndlessRun["end"]>, string>> = {
  hearts: "OUT OF HEARTS",
  cap: "A PERFECT ENDLESS",
  lastDay: "THE LAST DAY",
};

/** The personal best's line: "BEST 9" (never lowered: the profile keeps the max; run 2 stores it). */
export const bestLine = (best: number): string => `BEST ${best}`;

/** Is this run's summary an ENDLESS OVER card (endless played and ended)? Re-exported for the screens' one test. */
export const isEndlessOverCard = (run: { endlessRun?: EndlessRun }): boolean => endlessOver(run);

/** Is `run` in endless now? (the screens' one test for the bar, the title's line and the foot line.) */
export const playingEndless = (run: { endlessRun?: EndlessRun }): boolean => inEndless(run);
