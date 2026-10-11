// SCOUT-1b (REQ-BFG-083; presentation only): the battle speed the player picks holds for the rest of the run. It is kept
// on the device beside the run, display side: one small localStorage key holding the run's id and the speed (its index
// into the bar's 0.5X 1X 2X 4X). It never touches the run or its save (beltbattles.run.v7), the profile, or anything the
// sim, the ghost upload, the battle record or battleSeed reads. A key for another run (or none, or a broken one) reads as
// 1X, so a new run starts at 1X; a reload or CONTINUE keeps the run's id, so its battles start at the speed kept.

import type { Run } from "./run";

export const SPEED_KEY = "beltbattles.speed.v1";
/** The bar's speeds (screens/battleHud.ts SPEEDS: 0.5X 1X 2X 4X): how many, and 1X's index (SPEED_1X). */
export const RUN_SPEEDS = 4, RUN_SPEED_1X = 1;

type Store = Pick<Storage, "getItem" | "setItem">;

function storage(s?: Store | null): Store | null {
  if (s) return s;
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/** The speed this run's battles start at: the last one the player picked in a battle of this run, else 1X. */
export function runSpeed(run: Pick<Run, "runId">, s?: Store | null): number {
  const st = storage(s);
  if (!st) return RUN_SPEED_1X;
  try {
    const raw = st.getItem(SPEED_KEY);
    if (!raw) return RUN_SPEED_1X;
    const v = JSON.parse(raw) as { runId?: unknown; speed?: unknown } | null;
    const i = Number(v?.speed);
    return v?.runId === run.runId && Number.isInteger(i) && i >= 0 && i < RUN_SPEEDS ? i : RUN_SPEED_1X;
  } catch {
    return RUN_SPEED_1X;
  }
}

/** Keep the speed the player just picked in a battle of this run (a bar button, the cycle button, keys 1-4). */
export function keepRunSpeed(run: Pick<Run, "runId">, speed: number, s?: Store | null): void {
  const st = storage(s);
  if (!st) return;
  try {
    st.setItem(SPEED_KEY, JSON.stringify({ runId: run.runId, speed }));
  } catch {
    // storage full or blocked: the pick holds for this battle only
  }
}
