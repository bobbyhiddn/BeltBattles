// bb-0.8.3 (REQ-BFG-042 D9; REQ-BFG-021's identity tests, narrowed as the brief pre-approves): a hero's own signature
// factory card (run.ts signatureOffer, on its own stream after the shared roll) is the one card of a caravan that differs
// by hero, and it is no merchant's stock. These helpers let the identity and stock checks read the shared offers: the
// signature card is written as SIGNATURE_CARD (it stands where the shared card it replaced stood, or in the empty slot
// it took), and a stock check skips it after checking it is the run's own hero's.
import { expect } from "vitest";
import type { HeroId } from "../src/sim/content";
import { isSignatureFactory, signatureOf } from "../src/sim/stars";
import { BELT_POLICY, type BeltPolicy } from "../src/sim/harness/belts";

export const SIGNATURE_CARD = "<the hero's own signature factory>";

/** `def`, or SIGNATURE_CARD for a signature factory's card. */
export const sharedDef = (def: string): string => (isSignatureFactory(def) ? SIGNATURE_CARD : def);

/** The wagons with each signature factory card written as SIGNATURE_CARD (the rest exactly as rolled). */
export function sharedWagons<W extends { offers: { def: string }[] }>(wagons: readonly W[]): W[] {
  return wagons.map((w) => ({ ...w, offers: w.offers.map((o) => (isSignatureFactory(o.def) ? { ...o, def: SIGNATURE_CARD } : o)) }));
}

/** A merchant's stock check, narrowed: true for the run's own signature card (checked to be its hero's: never another
 *  hero's), so the caller skips it; false for every shared offer, which the caller checks against the stock as before. */
export function ownSignatureCard(hero: HeroId, def: string): boolean {
  if (!isSignatureFactory(def)) return false;
  expect(def, `${hero}'s caravan offers a signature factory: only its own`).toBe(signatureOf(hero));
  return true;
}

/**
 * bb-0.8.3 (REQ-BFG-042 D7): run `fn` with every hero's bots on belt policy `policy` (harness/belts.ts BELT_POLICY), then
 * put the chosen policies back. A harness test written for 0.8.1's belt counts reads its lever there under "today".
 */
export function withBeltPolicy<T>(policy: BeltPolicy, fn: () => T): T {
  const table = BELT_POLICY as Record<HeroId, BeltPolicy>, saved = { ...table };
  for (const h of Object.keys(table) as HeroId[]) table[h] = policy;
  try { return fn(); } finally { Object.assign(table, saved); }
}
