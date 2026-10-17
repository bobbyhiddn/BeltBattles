// ENCHANT-1 (REQ-BFG-085; BRIEF-ENCHANT1 E3): THE EIGHT EFFECTS, in one module. battle.ts calls these from short marked hooks
// (`// ENCHANT-1 (REQ-BFG-085)`); every number comes from enchant.ts ENCHANT_NUM, so the bench sets one place. Nothing here rolls:
// ECHOING counts, so a fight with words is as deterministic as one without.
//
// THE NUMBERS (E3): ★1 x1, ★2 x2, ★3 x3 for FIERY's BURN, RISING's and GROWING's DMG and BRACED's stuns (a signature factory's grade
// counts as its stars); counts and words (EVERY 3RD, +1 ARROW, HALF, TWICE, 2x) do not scale.
//  - FIERY    a rig's hit, a factory's slug or a turret's shot carries [BURN]+1 x stars.
//  - RISING   a counter on the piece, 0 at each fight's start: the nth slug the rig hits (its rank among the slugs it has hit), the nth
//             slug the factory makes or the nth shot the turret fires gets +5 x n x stars DMG.
//  - GROWING  +5 x grow x stars DMG on its hit, slugs or shots; `grow` (Placed.grow) is the dusk fights the piece has been through
//             (enchant.ts growPieces adds 1 after each dusk fight; warlord fights don't count).
//  - ECHOING  a counter, no roll: every 3rd slug a rig hits gets the rig's own stats applied twice (the OVERCLOCKER's doubling,
//             overclock.ts); every 3rd slug a factory makes is followed by a copy of it with a new id, placed with the same
//             spacing a stamp keeps; every 3rd shot a turret fires hits twice (a copy of the projectile 0.08 s behind, MOLTEN VOWS' echo).
//  - MASSIVE  a factory works, a turret fires, half as often (enchant.ts enchantRate: the rate halves rounding down, deck.ts resolveSlots
//             and Battle.makeSide patch the def), and its slug or shot deals 2x: the SPLITTER's share (mult, flat, plate; rounded
//             half up once). SWIFT: twice as often, half the DMG share (a shot never below the least a shot deals).
//  - WIDE     static: a rig's added arrow (deck.ts wideDir), a factory's belt slot (enchant.ts wideSlots), a turret's gear slot.
//  - BRACED   the first 2 x stars STUNs that land on the piece each fight do nothing (Battle.acceptHarassment asks bracedSwallow);
//             a STUN on any other piece is never blocked, and the battle says so (the `braced` event).
//
// PAYLOAD MATH IN ONE PLACE: every change a word makes to a Payload is made by a function below, and PAYLOAD_RULES names, for EVERY key
// of Payload (battle.ts:68), what a word does with it. A field added later (BUMP-1E's POISON, GATES-1's fused payload) is a type error here
// until it has a rule (the table is typed `{ [K in keyof Payload]-?: ... }`), and tests/enchant1.effects.test.ts reads battle.ts's
// interface text and fails the same way, so the rule is chosen on purpose.

import type { FactoryState, GateState, Payload, TurretState } from "./battle";
import type { BuildTurret, Placed } from "./deck";
import { ENCHANT_NUM, enchantRate, enchantRules, enchantShare, enchantStars, isEnchantId, type EnchantId } from "./enchant";
import { pct } from "./pct";

/** What a word does with one key of Payload. `kept`: untouched, copied as is. `deep`: untouched, but an echoed copy gets its own
 *  copy of the object or array (as SPLITTER's copies do). `id`: a copy takes a new id. `burn`: FIERY adds to it. `share`: the key is
 *  part of the slug's DMG share, scaled by MASSIVE (x2) and SWIFT (x1/2) as SPLITTER scales it (mult, flat and plate, rounded half up
 *  once); RISING and GROWING add to `flat`, after the share. */
export type PayloadRule = "kept" | "deep" | "id" | "burn" | "share";

export const PAYLOAD_RULES: { readonly [K in keyof Payload]-?: PayloadRule } = {
  id: "id",
  ammo: "kept",
  ride: "kept",
  mult: "share",
  flat: "share",
  burn: "burn",
  shock: "kept",
  prior: "kept",
  factory: "kept",
  copy: "kept",
  shockTime: "kept",
  jump: "kept",
  base: "kept",
  preset: "kept",
  debuffs: "deep",
  harass: "deep",
  static: "kept",
  arc: "kept",
  rip: "deep",
  heat: "kept",
  heatRide: "kept",
  heatBonus: "kept",
  pulseSeen: "deep",
  compound: "deep",
  burnPlus: "kept",
  fray: "kept",
  frayCap: "kept",
  staticTime: "kept",
  boosters: "deep",
  journeyOffset: "kept",
  paired: "kept",
  lone: "kept",
  plate: "share",
};

/** The keys a rule covers, for the code below and the test. */
export const payloadKeys = (rule: PayloadRule): string[] => Object.entries(PAYLOAD_RULES).filter(([, r]) => r === rule).map(([k]) => k);

/** One piece's word at a fight's start. The counters start at 0 each fight (the state is made in Battle.makeSide). */
export interface EnchantState {
  id: EnchantId;
  stars: number; // 1..3: the numbers multiply by it
  grow: number; // GROWING: the dusk fights the piece has been through (Placed.grow, absent = 0)
  n: number; // RISING's and ECHOING's count: slugs a rig has hit (distinct), slugs a factory has made, shots a turret has fired
  seen?: WeakMap<Payload, number>; // a rig counts each slug once: the slug's rank among those it has hit
  braced: number; // BRACED: the STUNs it still swallows this fight
  echo?: Payload; // a factory: the copy ECHOING owes, waiting in the mouth for room
}

/** The state of a piece holding a word, or undefined (no word, an id that isn't one of the eight, or the switch off). */
export function makeEnchantState(p: { ench?: string; grow?: number } | undefined, stars: number): EnchantState | undefined {
  if (!enchantRules() || !p || !isEnchantId(p.ench)) return undefined;
  const s = enchantStars(stars);
  return {
    id: p.ench, stars: s, grow: p.ench === "growing" ? Math.max(0, Math.floor(p.grow ?? 0)) : 0, n: 0,
    braced: p.ench === "braced" ? ENCHANT_NUM.bracedStuns * s : 0,
  };
}

/** The rig states: every rig holding a word gets its state (Battle.makeSide, after the gates are made). */
export function enchantGates(gates: GateState[], items: readonly Placed[], starsOf: (p: Placed) => number): void {
  for (const g of gates) {
    const p = items.find((q) => q.uid === g.uid);
    const st = p && p.ench !== undefined ? makeEnchantState(p, starsOf(p)) : undefined;
    if (st) g.ench = st;
  }
}

/** A factory holding a word: its state and (MASSIVE, SWIFT) its work rate, on the def the battle reads (FactorySpec.speed). */
export function enchantFactory(f: FactoryState, p: Placed, grade: number): void {
  const st = makeEnchantState(p, grade);
  if (!st) return;
  f.ench = st;
  const spec = f.def.factory;
  if (spec && (st.id === "massive" || st.id === "swift")) f.def = { ...f.def, factory: { ...spec, speed: enchantRate(st.id, spec.speed) } };
}

/** The turret states: each installed turret holding a word (installedTurrets, in slot order, matches `turrets`). */
export function enchantTurrets(turrets: TurretState[], slots: readonly { turret: BuildTurret }[], starsOf: (t: BuildTurret) => number): void {
  slots.forEach((s, i) => {
    const st = s.turret.ench !== undefined ? makeEnchantState(s.turret, starsOf(s.turret)) : undefined;
    if (st && turrets[i]) turrets[i].ench = st;
  });
}

// ---------------------------------------------------------------------------------------------------------------- the payload

/** MASSIVE (k = 2) and SWIFT (k = 1/2): the slug's DMG share scales like SPLITTER's (battle.ts applyHit): mult, flat and plate,
 *  each rounded half up once. BURN, the stuns and the rest stay. */
export function scaleShare(p: Payload, k: number): void {
  if (k === 1) return;
  p.mult *= k;
  p.flat = pct(p.flat, 100 * k);
  if (p.plate) p.plate = pct(p.plate, 100 * k);
}

/** A copy of `p` with a new id: the keys the table marks `deep` get their own copy (as SPLITTER's copies do), the rest are copied as is. */
export function echoCopy(p: Payload, id: number): Payload {
  const c: Payload = { ...p, id };
  for (const k of payloadKeys("deep") as (keyof Payload)[]) {
    const v = p[k];
    if (typeof v === "object" && v !== null) (c as unknown as Record<string, unknown>)[k] = Array.isArray(v) ? [...v] : { ...v };
  }
  return c;
}

/** A rig holding a word: the rank of slug `p` among the slugs it has hit (first time it hits `p`: the count goes up by 1). */
export function rigRank(st: EnchantState, p: Payload): number {
  const seen = (st.seen ??= new WeakMap());
  let r = seen.get(p);
  if (r === undefined) {
    r = ++st.n;
    seen.set(p, r);
  }
  return r;
}

/** ECHOING on a rig: is the slug of this rank one the rig hits twice (every 3rd)? */
export const rigEchoes = (st: EnchantState, rank: number): boolean => st.id === "echoing" && rank % ENCHANT_NUM.echoEvery === 0;

/** A rig holding a word has hit slug `p` (one arrow; `rank` from rigRank): FIERY adds its BURN, RISING and GROWING their DMG. The rig's
 *  own stats and ECHOING's doubling are Battle.applyHit's. */
export function rigHitFx(st: EnchantState, p: Payload, rank: number): void {
  if (st.id === "fiery") p.burn += ENCHANT_NUM.burn * st.stars;
  else if (st.id === "rising") p.flat += ENCHANT_NUM.risingStep * rank * st.stars;
  else if (st.id === "growing") p.flat += ENCHANT_NUM.growingStep * st.grow * st.stars;
}

/**
 * A factory holding a word has made slug `p` (Battle.made: stamp, TWIN MOULD, and the race factories' own paths): the count goes up,
 * and FIERY, RISING, GROWING, MASSIVE or SWIFT change the slug. Returns true when ECHOING owes a copy (every 3rd slug).
 */
export function slugMadeFx(st: EnchantState, p: Payload): boolean {
  st.n++;
  if (st.id === "fiery") p.burn += ENCHANT_NUM.burn * st.stars;
  else if (st.id === "rising") p.flat += ENCHANT_NUM.risingStep * st.n * st.stars;
  else if (st.id === "growing") p.flat += ENCHANT_NUM.growingStep * st.grow * st.stars;
  else if (st.id === "massive" || st.id === "swift") scaleShare(p, enchantShare(st.id));
  else if (st.id === "echoing") return st.n % ENCHANT_NUM.echoEvery === 0;
  return false;
}

/** What a turret holding a word does to one shot (Battle.fire, fireCore): the damage, the BURN to add and whether this shot hits twice. */
export interface ShotFx {
  dmg: number;
  burn: number;
  echo: boolean;
}

/** One shot of a turret holding a word: `dmg` is the shot's damage before the pair bonus, the finisher and the runes; `floor` the
 *  least a shot deals (SWIFT's half never goes under it). RISING's and GROWING's DMG is flat, added here; MASSIVE and SWIFT scale it. */
export function shotFx(st: EnchantState, dmg: number, floor: number): ShotFx {
  st.n++;
  let burn = 0, echo = false;
  if (st.id === "fiery") burn = ENCHANT_NUM.burn * st.stars;
  else if (st.id === "rising") dmg += ENCHANT_NUM.risingStep * st.n * st.stars;
  else if (st.id === "growing") dmg += ENCHANT_NUM.growingStep * st.grow * st.stars;
  else if (st.id === "massive") dmg = pct(dmg, 100 * enchantShare("massive"));
  else if (st.id === "swift") dmg = Math.max(floor, pct(dmg, 100 * enchantShare("swift")));
  else if (st.id === "echoing") echo = st.n % ENCHANT_NUM.echoEvery === 0;
  return { dmg, burn, echo };
}

/** BRACED: does the part swallow a STUN landing on it now? The first 2 x stars each fight do; the count goes down by 1 each time. */
export function bracedSwallow(st: EnchantState | undefined): boolean {
  if (!st || st.id !== "braced" || st.braced <= 0) return false;
  st.braced--;
  return true;
}
