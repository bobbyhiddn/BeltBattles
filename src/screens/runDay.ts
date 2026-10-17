// RUN-1 (REQ-BFG-059, REQ-BFG-116; BRIEF-RUN1 D7): how a screen words the run's day. A 10-day run counts its days against
// the run's length ("DAY 3/10", as live); a long run (Run.longRun, src/sim/longRun.ts: won at 10 wins, lost at 0 hearts,
// no day limit) never shows "/N" after its day, since no day is its last. WINS carries the "/10" there: it is the goal.
// Every screen that names the day (the build bar, the fork, the dusk and the replay banners) reads the run's own mark,
// never the LONG_RUN switch, so a run keeps the words of the rule it started on (and an old save reads as live).

import { RUN_DAYS } from "../sim/content";

/** The first day past the 10-day run's length: from here a long run is on "the long road" (its day turns amber on the bar,
 *  its row in the run summary is marked). */
export const LONG_ROAD_FROM = RUN_DAYS + 1;

/** The day as a screen says it: "DAY 3/10" on a 10-day run, exactly as live; "DAY 12" on a long run (never "/N"). */
export const dayText = (day: number, long: boolean): string => (long ? `DAY ${day}` : `DAY ${day}/${RUN_DAYS}`);

/** Is `day` on a long run's long road (past the day a 10-day run ends on)? Always false for a 10-day run. */
export const onLongRoad = (day: number, long: boolean): boolean => long && day >= LONG_ROAD_FROM;
