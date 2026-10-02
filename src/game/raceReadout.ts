// 0.8.0 H1 M3 (REQ-BFG-011), display only: the dusk result card's rows for FOUNDRY and BASTION (fused slugs, plating
// gained, plating spent). They come from the counters the sim keeps outside SideStats, step by step (RaceSide:
// foundry.fusions, plating.gained, plating.absorbed), so a played battle and a skipped one read the same. A battle with
// neither hero has no readout, so a Furnace or Weaver result is saved and shown exactly as before.

import type { SideState } from "../sim/battle";

/** One row's values, (you, foe); null where that side isn't the hero the row is about (the card shows "-"). */
export type RacePair = [number | null, number | null];

export interface RaceReadout {
  /** FUSED SLUGS: alloy slugs a FOUNDRY side fused. */
  fused?: RacePair;
  /** PLATING GAINED: plating a BASTION side's bulwark slugs added (after the cap). */
  plated?: RacePair;
  /** PLATING SPENT: plating that took hits and Burn before the hull did. */
  spent?: RacePair;
}

export const READOUT_KEYS = ["fused", "plated", "spent"] as const;

/** The readout of a battle's two sides (you first), or undefined when neither is FOUNDRY or BASTION. */
export function raceReadout(sides: readonly [Pick<SideState, "build" | "race">, Pick<SideState, "build" | "race">]): RaceReadout | undefined {
  const is = (hero: string): [boolean, boolean] => [sides[0].build.hero === hero, sides[1].build.hero === hero];
  // two decimals: plating sums carry float noise (a splitter copy plates by its share); the card shows whole numbers
  const r2 = (x: number): number => Math.round(x * 100) / 100;
  const pair = (on: [boolean, boolean], v: (s: Pick<SideState, "race">) => number): RacePair =>
    [on[0] ? r2(v(sides[0])) : null, on[1] ? r2(v(sides[1])) : null];
  const foundry = is("foundry"), bastion = is("bastion");
  const out: RaceReadout = {};
  if (foundry[0] || foundry[1]) out.fused = pair(foundry, (s) => s.race?.foundry.fusions ?? 0);
  if (bastion[0] || bastion[1]) {
    out.plated = pair(bastion, (s) => s.race?.plating.gained ?? 0);
    out.spent = pair(bastion, (s) => s.race?.plating.absorbed ?? 0);
  }
  return out.fused || out.plated ? out : undefined;
}

/** A saved readout is well formed: only these keys, each two numbers or nulls. */
export function readoutOk(v: unknown): v is RaceReadout {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  return Object.entries(v as Record<string, unknown>).every(([k, p]) => (READOUT_KEYS as readonly string[]).includes(k)
    && Array.isArray(p) && p.length === 2 && p.every((x) => x === null || (typeof x === "number" && Number.isFinite(x))));
}
