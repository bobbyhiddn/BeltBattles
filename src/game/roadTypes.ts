// The road fork's run state (0.6.0b, save v6). Types only: the rules live in road.ts.

import type { HeroId } from "../sim/content";
import type { Build } from "../sim/deck";
import type { Difficulty, RivalId } from "../sim/rivals";

/** A fork pick: the day's road event, or the warlord of one difficulty. */
export type RoadPick = "event" | Difficulty;

export interface RoadChoice {
  day: number;
  pick: RoadPick;
}

/** What a warlord win pays (decision 3): gold, and for Hard a pick of 1 of `parts`; the Iron
 *  Matriarch's one part is LEGENDARY and goes straight to cargo. */
export interface WarlordReward {
  gold: number;
  parts: string[]; // item ids from the warlord's own deck (0-2)
  legendary: boolean;
}

/** The outcome of a warlord fight. Lives never change (a loss only forfeits the reward). */
export interface WarlordOutcome {
  outcome: "win" | "loss" | "draw";
  time: number;
  gold: number; // gold paid (reward + bounty), 0 unless won
  bountyPaid: number;
  parts: string[]; // the parts on offer (won only)
  took: string | null; // the part that went to cargo (null until picked, or none)
}

/** Today's warlord fight: stored at the fork pick, so a reload replays exactly this fight. */
export interface WarlordFight {
  day: number;
  tier: Difficulty;
  id: RivalId;
  name: string;
  hero: HeroId;
  build: Build; // the deck it fights with (SABOTAGE: yesterday's deck, or -25 hull)
  sabotaged: boolean;
  bounty: number; // gold an ELITE BOUNTY pays on a win (0: none)
  reward: WarlordReward;
  result: WarlordOutcome | null;
}

/** One finished warlord fight, for the summary. */
export interface WarlordResult {
  day: number;
  tier: Difficulty;
  id: RivalId;
  name: string;
  outcome: "win" | "loss" | "draw";
  time: number;
  gold: number;
  part: string | null;
}

export interface PendingBounty {
  day: number; // the day it was staked
  stake: number;
  pay: number;
}

export interface PendingSabotage {
  day: number; // the day it was bought
}
