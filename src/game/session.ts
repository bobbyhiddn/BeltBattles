// 0.7.0a: the page's online session as game logic and the screens see it. src/game/online.ts makes it (only when a
// server URL is set, decision D3); this module holds it and imports types only, so game logic (events.ts) can ask
// without importing the network code (which reaches road.ts and so events.ts itself). No session: offline, as 0.6.2.

import type { DuskFoe, Run } from "./run";

export interface Session {
  readonly url: string;
  /** An identity: tonight's ghost is fetched and the dusk deck uploaded. */
  readonly active: boolean;
  /** No identity (no WebCrypto, or a plain-http origin other than localhost): the game plays offline, as 0.6.2. */
  readonly failed: boolean;
  /** Every frame: store a fetched answer in the run, or start tonight's fetch. */
  tick(run: Run | null): void;
  /** The stored foe, or 0.6.2's stand-in now (never wait). */
  settle(run: Run): void;
  /** Upload tonight's deck (once per dusk, fire and forget). */
  submitDusk(run: Run): void;
  /** A finished run counts toward the new-player pool (D2). */
  countRun(run: Run): void;
  /** PROFILE-UP (REQ-BFG-074 clause 4): the profile changed in a way worth uploading: "end" = a run's end was just folded
   *  (styleFolds.ts; runId dedupes the battle's fold and the summary's), "pick" = CUSTOMIZE wore a style (customize.ts). Fire
   *  and forget, one try per trigger. Optional: a session without it (a test's stub) uploads nothing. */
  profileChanged?(why: "end" | "pick", runId?: string): void;
}

let current: Session | null = null;

/** The page's online session, or null: offline, as 0.6.2. */
export function online(): Session | null {
  return current;
}

export function setSession(s: Session | null): void {
  current = s;
}

/** Online mode: a server URL is set and the identity has not failed (it may still be loading). Offline otherwise. */
export function onlineMode(): boolean {
  return !!current && !current.failed;
}

/** The NEXT BATTLE card while tonight's ghost is on its way. */
export const FINDING_GHOST = "FINDING A GHOST...";
export const SOURCE_ONLINE = "ONLINE GHOST";
export const SOURCE_OFFLINE = "OFFLINE STAND-IN";

/** Step 6, the source in small text on the NEXT BATTLE card and under the enemy plate: online ghost, or offline
 *  stand-in (fetchGhost fell back); FINDING_GHOST before the answer. Offline (no session): null, 0.6.2's card. */
export function foeNote(run: Run, foe: DuskFoe): string | null {
  if (!onlineMode()) return null;
  const stored = run.dusk && run.dusk.day === run.day ? run.dusk : null;
  if (!stored && !run.over) return FINDING_GHOST;
  return foe.source === "online" ? SOURCE_ONLINE : foe.source === "offline" ? SOURCE_OFFLINE : null;
}
