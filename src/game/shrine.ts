// ENCHANT-2 (REQ-BFG-085, REQ-BFG-012; BRIEF-ENCHANT2 T3): THE ASH SHRINE, the road's 11th event, in the game only with ENCHANT on
// (eventDefs.ts eventIds/bagIds: each bag then holds 11 events and the shrine comes once a bag, like every event). Three cards, the
// SMUGGLER's shape:
//   1. word A for max hull (SHRINE_HULL, the DARK WIND's RIDE THROUGH form: a {k: "hull"} cost, refused by events.ts blockReason's
//      HULL TOO WEAK below the floor);
//   2. word B for ONE PART OF YOUR CARGO, named by the event's fixed `pick` as the TRADER's swap names its part (shrineGive); blocked
//      with NOTHING TO OFFER when cargo holds nothing that can be offered;
//   3. MOVE ON.
// The two words are shrineWords(seed, day) (enchantSources.ts): two DIFFERENT words from their own stream hashSeed(seed, "ench", day,
// "shrine"). The gain {k: "ench", word} opens ENCHANT-1's APPLY exactly as a warlord pick does (enchanter.ts openShrineWord: a free word
// to put on a part of your choice, or NO THANKS), and an open pick never blocks FIGHT.
//
// This file reads the run and the sim only (no DOM). eventDefs.ts imports it for the card list; it imports eventDefs.ts for types only.

import { ENCHANT_DEFS, enchantRules, type EnchantId } from "../sim/enchant";
import { shrineWords } from "../sim/enchantSources";
import { ITEMS } from "../sim/content";
import { starsOf } from "../sim/stars";
import { enchantChoices } from "./enchanter";
import type { Choice, EventState } from "./eventDefs";
import type { Run } from "./run";

/** The ASH SHRINE's event id. */
export const SHRINE_ID = "shrine" as const;

/** Card 1's price in max hull (hullBonus units, as RIDE THROUGH's 100). A STARTING VALUE: T5 may set it anywhere from 60 to 150. */
export const SHRINE_HULL = 100;

/** Why card 2 is blocked with nothing to give, and why a card is blocked when no part you hold can take its word. */
export const SHRINE_NO_PART = "NOTHING TO OFFER";
export const SHRINE_NO_TAKER = "NO PART TAKES IT";

/** The two words of the shrine on `day` of the run seeded `seed`: [word A (for hull), word B (for a part)]. */
export const shrineOffer = (seed: number, day: number): [EnchantId, EnchantId] => shrineWords(seed, day);

/** A cargo part the shrine can take: a plain id with the star it holds. */
export interface ShrineGive {
  uid: number;
  def: string;
  stars: number;
}

/**
 * The cargo part card 2 takes, named by the event's `pick` (a fixed number in [0, 1) saved with the event, so a reload names the same part):
 * the parts in cargo in uid order, with the ones holding no word first (a part you enchanted is only offered when nothing plain is left), a
 * turret and a free starting copy never (the TRADER's rule: a free copy is worth nothing and a turret does not ride the road). Undefined
 * when cargo holds nothing to offer. Only `pick` and cargo decide it; neither can change while the event is open.
 */
export function shrineGive(run: Pick<Run, "inventory">, pick: number): ShrineGive | undefined {
  const all = run.inventory.filter((i) => ITEMS[i.def] && ITEMS[i.def].kind !== "turret" && !i.free).sort((a, b) => a.uid - b.uid);
  const plain = all.filter((i) => i.ench === undefined);
  const pool = plain.length ? plain : all;
  if (!pool.length) return undefined;
  const p = pool[Math.min(pool.length - 1, Math.floor(Math.min(Math.max(pick, 0), 1 - Number.EPSILON) * pool.length))];
  return { uid: p.uid, def: p.def, stars: starsOf(p) };
}

/** Can any part the run holds (deck, turrets, cargo) take `word`? The game's own legality (enchanter.ts enchantChoices). */
export const someoneTakes = (run: Run, word: string): boolean => enchantChoices(run, word).some((c) => c.reason === null);

/** The shrine's three cards on `ev` (eventDefs.ts EVENTS.shrine.choices). The labels are verbs of the offering; the word rides as a {k: "ench"} gain. */
export function shrineChoices(run: Run, ev: EventState): Choice[] {
  const [a, b] = shrineOffer(run.seed, ev.day);
  const done = ev.picked >= 0; // resolved (also after a reload): the cards show what was taken, and a card is never blocked for what it spent
  // a resolved second card still names the part it took (ev.gave): cargo no longer holds it
  const give: ShrineGive | undefined = done && ev.picked === 1 && ev.gave ? { uid: -1, def: ev.gave, stars: 1 } : shrineGive(run, ev.pick);
  const hull: Choice = { label: "OFFER HULL", cost: [{ k: "hull", n: SHRINE_HULL }], gain: [{ k: "ench", word: a }], note: "YOU CHOOSE THE PART" };
  if (!done && !someoneTakes(run, a)) hull.blocked = SHRINE_NO_TAKER;
  const part: Choice = give
    ? { label: "OFFER A PART", cost: [{ k: "item", def: give.def, uid: give.uid, from: "cargo" }], gain: [{ k: "ench", word: b }], note: "YOU CHOOSE THE PART" }
    : { label: "OFFER A PART", cost: [], gain: [], blocked: SHRINE_NO_PART };
  if (!done && give && !someoneTakes(run, b)) part.blocked = SHRINE_NO_TAKER;
  return [hull, part, { label: "MOVE ON", cost: [], gain: [] }];
}

/** The name of a shrine word as a card prints it (a forged id falls back to its own letters). */
export const shrineWordName = (word: string): string => (ENCHANT_DEFS as Record<string, { name: string }>)[word]?.name ?? word.toUpperCase();

/** The T5 toggle (module state, default on; BRIEF-ENCHANT2 T5's state C keeps the shrine out of the bag, and ENCHANT-1's own tests run without it, in state B):
 *  with ENCHANT on and the toggle off the bag is the OFF world's ten events. The game and the server never flip it. */
let shrineOn = true;
export function setShrine(on: boolean): void {
  shrineOn = on;
}
export function withShrine<T>(fn: () => T, on = true): T {
  const was = shrineOn;
  setShrine(on);
  try {
    return fn();
  } finally {
    setShrine(was);
  }
}

/** Is the shrine in this rules world's bag? (eventDefs.ts bagIds / eventIds: ENCHANT on, and the T5 toggle). */
export const shrineInBag = (): boolean => enchantRules() && shrineOn;
