// NUM-1 (REQ-BFG-047, N1 section 2.1): the integer damage pipeline's one rounding rule. The sim stores and computes every
// damage-family amount (damage, hull, plating, burn, the wind, heals, spall; TXT-096: POISON left at Y6, and RIVETER's
// repair is a heal since SUS-A) as a whole number: where a % or a
// share meets such an amount, the result rounds half up to a whole number, once, where the amount is made (Battle.fire and
// fireCore, impact, the hull ticks; cores.ts scaleCore at install; deck.ts payloadDamage when the slug is fired).
// Pure, no imports: deck.ts, harassment.ts, races/* and cores.ts use it without a cycle.

/** x rounded half up to a whole number. The 1e-9 absorbs float noise in a product that is exactly .5 (1.3 x 5 = 6.5). */
export function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5 + 1e-9);
}

/** n x p% (p usually a whole %: 100 x a share such as 0.6 or 1 + 0.4), rounded half up once: the sim's one % rule. */
export function pct(n: number, p: number): number {
  return roundHalfUp((n * p) / 100);
}
