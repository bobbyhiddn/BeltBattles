// bb-0.8.3 (REQ-BFG-042 D7): a helper shared by the harness tests written for 0.8.1's belt counts.
import type { HeroId } from "../src/sim/content";
import { BELT_POLICY, type BeltPolicy } from "../src/sim/harness/belts";

/**
 * bb-0.8.3 (REQ-BFG-042 D7): run `fn` with every hero's bots on belt policy `policy` (harness/belts.ts BELT_POLICY), then
 * put the chosen policies back. A harness test written for 0.8.1's belt counts reads its lever there under "today".
 */
export function withBeltPolicy<T>(policy: BeltPolicy, fn: () => T): T {
  const table = BELT_POLICY as Record<HeroId, BeltPolicy>, saved = { ...table };
  for (const h of Object.keys(table) as HeroId[]) table[h] = policy;
  try { return fn(); } finally { Object.assign(table, saved); }
}
