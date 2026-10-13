// CNT-DAY (REQ-BFG-100, REQ-BFG-082; REQ-BFG-079): THE FIGHT'S DAY for the battle view's tap texts (the counters' panels,
// VIEW BATTLEFIELD's faces). A fight on the day's hull (Battle.scaled: HULL_SCALE on where it started, and a day given)
// deals damage x D(d) and caps its pool at PLATE_CAP x S(d), and only then its record keeps that day (record.day). Its tap
// texts are built for that day (dayShown.ts shownOn, through the glossary's rows and the inspector's run), so they show
// the fight's numbers; a fight without it (no day, or the switch off: older records and replays) gets no day, and its
// texts are today's, byte for byte. Display only: this reads the Battle and never writes it.

import type { Battle } from "../sim/battle";

/** The day a fight's tap texts are read on: the day the Battle was built with, on the day's hull (b.scaled); else
 *  undefined (day 1's numbers). */
export const textDay = (b: Pick<Battle, "scaled" | "record">): number | undefined => (b.scaled ? b.record.day : undefined);
