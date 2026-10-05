/** Rules shared by the wave-2 harassment engine and its later module definitions. */

import { pct } from "./pct"; // NUM-1 (REQ-BFG-047)

/** NUM-3 (R1's STUN fold, REQ-BFG-046): CHILL (a frozen tile's mark) and SNAG (a chain slow's mark) are gone with the
 *  freeze and the slow; SAP is the one mark left (no piece gives it yet: Battle.applyPayloadDebuff is its only door). */
export interface PayloadDebuffs {
  sap?: boolean;
}

export type HarassRound =
  | { kind: "sabot"; seconds: number; shrapnel?: boolean }
  | { kind: "frost"; seconds: number; spread?: number }
  | { kind: "drag"; seconds: number }
  | { kind: "limpet"; delay: number; blast: number; stall?: number };

/** A SIFTER removes enemy marks in the catalogue's fixed order (NUM-3: SAP only; CHILL and SNAG are gone). */
export function siftDebuffs(debuffs: PayloadDebuffs | undefined, count: number | "all" = 1): number {
  if (!debuffs) return 0;
  let removed = 0;
  for (const key of ["sap"] as const) {
    if (!debuffs[key] || (count !== "all" && removed >= count)) continue;
    delete debuffs[key];
    removed++;
  }
  return removed;
}

/** Apply carried damage marks after the shot's ordinary and core damage calculation. */
export function debuffedDamage(damage: number, debuffs: PayloadDebuffs | undefined): number {
  if (!debuffs) return damage;
  // NUM-1 (REQ-BFG-047): SAP takes 20 (x10 of 2). NUM-3: no CHILL (its 75%) any more
  return Math.max(0, damage - (debuffs.sap ? 20 : 0));
}
