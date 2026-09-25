/** Rules shared by the wave-2 harassment engine and its later module definitions. */

export interface PayloadDebuffs {
  chill?: boolean;
  snag?: boolean;
  sap?: boolean;
}

export type HarassRound =
  | { kind: "sabot" }
  | { kind: "frost"; seconds: number }
  | { kind: "drag"; mul: number; seconds: number }
  | { kind: "limpet"; delay: number; blast: number; stall?: number };

/** A SIFTER removes enemy marks in the catalogue's fixed order. */
export function siftDebuffs(debuffs: PayloadDebuffs | undefined, count: number | "all" = 1): number {
  if (!debuffs) return 0;
  let removed = 0;
  for (const key of ["chill", "snag", "sap"] as const) {
    if (!debuffs[key] || (count !== "all" && removed >= count)) continue;
    delete debuffs[key];
    removed++;
  }
  return removed;
}

/** Apply carried damage marks after the shot's ordinary and core damage calculation. */
export function debuffedDamage(damage: number, debuffs: PayloadDebuffs | undefined): number {
  if (!debuffs) return damage;
  return Math.max(0, (debuffs.chill ? damage * 0.75 : damage) - (debuffs.sap ? 2 : 0));
}

/** A rig arrow is a segment node at its belt tile. A hit on that tile enters its downstream segment. */
export function segmentBounds(nodes: readonly boolean[], tile: number): [number, number] {
  let first = 0, last = nodes.length - 1;
  for (let i = 0; i <= tile; i++) if (nodes[i]) first = i;
  for (let i = tile + 1; i < nodes.length; i++) if (nodes[i]) { last = i - 1; break; }
  return [first, last];
}
