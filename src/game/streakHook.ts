// BUMP-1I (REQ-BFG-125, VETERAN): the one call a screen makes about the device's streak that is not the run's end. A run's end reaches the streak
// through Session.countRun (battle.ts calls it at the end of every finished run, online.ts takes the streak beside D2's count); ABANDON RUN
// (screens/build/chrome.ts) discards a run before its end, so it calls this.
//
// WHY NOT A Session METHOD: src/game/session.ts is on the three generators' import closure (kit-1i/closure-gens-base.txt), and BRIEF-BUMP1I
// P1's CLOSURE RULE lets V1 change no line of any file on that list (no code, no type, no comment), which keeps the stand-in pool's
// regeneration a re-stamp. So the interface stays as it is and the call asks the page's session for the method the Online class (online.ts)
// has, as Session.profileChanged is asked: a session without it (offline, a test's stub) does nothing.

import type { Run } from "./run";
import { online } from "./session";

/** ABANDON RUN: a run abandoned before its 10th win sets the device's streak to 0 (once per run id, only while the session is active;
 *  an abandon in ENDLESS, where the run was already won, changes nothing). No session, or one without the method: nothing happens. */
export function abandonRun(run: Run): void {
  (online() as { abandonRun?: (run: Run) => void } | null)?.abandonRun?.(run);
}
