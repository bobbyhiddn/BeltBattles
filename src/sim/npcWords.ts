// ENCHANT-2 (REQ-BFG-085 clause 5, "bots, captains and stand-ins use enchantments"; BRIEF-ENCHANT2 T1 and T2): THE RIVALS' OWN WORDS.
//
// Every rival carries hand-picked words, in CAPTAIN_RUNES' form (rivalBuilds.ts): 1 word from day 5, 2 from day 8, 3 from day 12 (NPC_WORD_DAYS).
// Each grant names a piece the rival's deck holds on EVERY day it is live, at every luck and at both moments (the road warlord and the
// dusk stand-in; tests/enchant2.npcwords.test.ts proves it for every rival x day 5-16 x luck x moment) and is LEGAL on it (enchant.ts
// enchantProblem is null; ECHOING never sits on a rig, because 1c's NOTHING TO DOUBLE refuses 13 of them; GROWING never sits on a rival:
// its counter means nothing on a deck rebuilt each day). A rival's deck gets its words where it gets its runes (rivals.ts rivalBuild and
// standInBuild call captainWordsOn), so the warlord on the road and the dusk stand-in carry the same words on the same day.
// With ENCHANT off the table is NEVER READ and every deck is byte for byte what it was (captainWordsOn returns the build itself).
//
// HAND-PICKED, NOT COMPUTED: each line is a literal with the reason beside it. They were picked from the bots' score on that rival's deck for that
// day (tools/enchant2/npcPick.ts prints it: enchantBot.ts wordGain, the change in a piece's route damage), then for IDENTITY (the rival's trick,
// blurb and hero), and tiered: the Easy captains carry the gentler words (ECHOING, BRACED; BUMP-1F, RULING-BUMP1F-Q2: SWIFT was RATCHET's kiln and is gone), the Hard ones the sharper (FIERY, MASSIVE).
// The bench (tools/enchant2/rivals.ts, REPORT T5a) holds par's win rate against them within 5 points of ENCHANT off; T5's levers are, in
// order, NPC_WORD_DAYS, then which pieces and words, then the shrine's hull price.
//
// T2 (REQ-BFG-078): a warlord's drop keeps its word. The cargo copy of the dropped def gets the word (and its side) the rival's copy of that
// def held that day (dropWordOf); the server accepts such a word only for a (def, word) pair some rival holds from day 5 on (npcDropPairs),
// at most one a day (enchantCheck.ts).
//
// Shared, pure and dependency-light (no DOM): the sim, the game, the server and the tests read this one table.

import { ITEMS } from "./content";
import { setTurretList, turretList, type Build } from "./deck";
import { enchantRules, type EnchantId } from "./enchant";
import type { RivalId } from "./rivals"; // type only: rivals.ts imports this file

/** The days the first, second and third word go live (T1's schedule, T5's first lever). */
export const NPC_WORD_DAYS: readonly [number, number, number] = [5, 8, 12];
const [D1, D2, D3] = NPC_WORD_DAYS;

/** One grant: from `from` on the rival's piece of def `def` holds `word` (WIDE on a rig: `enchDir`, the added arrow's side at rotation 0). */
export interface NpcGrant {
  from: number;
  def: string;
  word: EnchantId;
  enchDir?: number;
}

/** The first day the rival is fielded at all (the Iron Matriarch holds the Hard slot from MATRIARCH_DAY = 8, rivals.ts). */
const FIRST_DAY: Partial<Record<RivalId, number>> = { matriarch: 8 };

export const NPC_WORDS: Readonly<Record<RivalId, readonly NpcGrant[]>> = {
  sootjaw: [ // SLOW COOKER: one long winding belt, late hot slugs (furnace, tier 2)
    { from: D1, def: "temper", word: "fiery" }, // hot slugs: his TEMPER's burn gets one more
    { from: D2, def: "scrapcannon", word: "rising" }, // late: each shot of the long wait hits harder than the last
    { from: D3, def: "kiln", word: "echoing" }, // the long cooker puts out an extra slug now and then
  ],
  nettle: [ // SHORT STITCH: the loom parked under the guns, fires first (weaver, tier 1)
    { from: D1, def: "loom", word: "rising" }, // fires first: every slug the loom makes hits harder than the last (SWIFT: par 99% to 81%, T5a pass 1)
    { from: D2, def: "temper", word: "fiery" }, // she grows with burn: a temper on the short belt
    { from: D3, def: "dartgun", word: "echoing" }, // every fifth dart hits twice
  ],
  grubnose: [ // PRESS GANG: a stamp press feeds the second intake (furnace, tier 1)
    { from: D1, def: "doublestamp", word: "fiery" }, // the press stamps hot: its slugs come out burning (ECHOING and SWIFT on the press score below 0 on his belts)
    { from: D2, def: "keg", word: "rising" }, // his keg flares up: each slug it hits lands harder than the last
    { from: D3, def: "kiln", word: "braced" }, // the gang holds the line: the cooker shrugs off the first stuns
  ],
  mothqueen: [ // FRAY STORM: split bolts, two plates, fray piles up (weaver, tier 1, elite)
    { from: D1, def: "loom", word: "braced" }, // two plates: the loom holds under stun (SWIFT on the loom: par 96% to 65%, T5a pass 1)
    { from: D2, def: "splitter", word: "rising" }, // fray piles up: each bolt the splitter makes lands harder than the last (FIERY: par 86% to 76% on day 8, T5a pass 2)
    { from: D3, def: "dartgun", word: "echoing" }, // a stray dart hits twice now and then
  ],
  sparkfang: [ // SHOCK TROOPER: galvanic coils stun your machines (furnace, tier 2)
    { from: D1, def: "scrapcannon", word: "rising" }, // the troopers' gun lands harder with each shot (FIERY on the coil from day 5, then BRACED on the kiln: par 90% to 71% on days 8-11, T5a pass 3)
    { from: D2, def: "kiln", word: "braced" }, // the troopers hold the line under stun
    { from: D3, def: "coil", word: "fiery" }, // the shock burns, once the troopers are in step (RISING on the old gun scored 0.9 at day 8)
  ],
  lacewing: [ // SPLITTER SWARM: splitters turn every bolt into two (weaver, tier 2)
    { from: D1, def: "loom", word: "rising" }, // the swarm starts at the loom: each slug lands harder than the last (SWIFT: par 97% to 77%, T5a pass 1)
    { from: D2, def: "splitter", word: "rising" }, // the swarm builds: each bolt lands harder than the last (FIERY: par 98% to 79% on day 8; BRACED scores 0 on the splitter, T5a pass 2)
    { from: D3, def: "dartgun", word: "echoing" }, // the swarm darts hit twice now and then
  ],
  ratchet: [ // OVERCLOCK: overdrive belt, calibrated gun (furnace, tier 1)
    { from: D1, def: "scrapcannon", word: "rising" }, // calibrated: each shot lands harder than the last
    { from: D2, def: "kiln", word: "braced" }, // overclocked: the kiln keeps its pace under stun. BUMP-1F: was SWIFT (the kiln worked twice as often), which put the Easy slot below Medium on days 9-16 by rivals.difficulty's instrument (d9 -0.040, d10 -0.034; RATCHET's margin -0.139 / -0.312) (RULING-BUMP1F-Q2: the word changes, the day and the piece stay; BRACED on a kiln is legal and other rivals hold it from day 5, so npcDropPairs and firstDay keep their pins)
    { from: D3, def: "temper", word: "fiery" }, // the hot belt
  ],
  emberlyn: [ // EMBER WEAVE: a temper on every belt, every hit burns (weaver, tier 2)
    { from: D1, def: "temper", word: "fiery" }, // the weave burns: one more BURN on every temper hit
    { from: D2, def: "bellows", word: "braced" }, // the bellows hold under stun (RISING on the loom: par 97% to 78% on day 8, T5a pass 2)
    { from: D3, def: "loom", word: "rising" }, // the embers grow: each slug the loom makes hits harder than the last
  ],
  bulwark: [ // IRONCLAD: three armor plates, a braked cooker (furnace, tier 2, elite)
    { from: D1, def: "kiln", word: "braced" }, // ironclad: the cooker shrugs off the first stuns
    { from: D2, def: "scrapcannon", word: "rising" }, // the old gun hits harder with each shot (ECHOING: par 80% to 69% on days 8-11, T5a pass 1)
    { from: D3, def: "temper", word: "fiery" }, // slow, but hot
  ],
  silkshade: [ // STATIC WEB: a coil on every belt, shock after shock (weaver, tier 3)
    { from: D1, def: "loom", word: "braced" }, // shock after shock: the loom holds under stun (SWIFT on the loom took par from 92% to 17%, T5a pass 1)
    { from: D2, def: "staticbrush", word: "rising" }, // the web tightens: each slug it brushes lands harder than the last (FIERY here: par 55% to 42% on days 8-11, T5a pass 2)
    { from: D3, def: "dartgun", word: "echoing" }, // the last dart hits twice
  ],
  longtooth: [ // RIG CHAIN: six rigs, then a long haul, huge slugs (furnace, tier 3)
    { from: D1, def: "venom", word: "wide", enchDir: 2 }, // six rigs: the chain reaches one belt more (a free side that faces the next belt)
    { from: D2, def: "kiln", word: "braced" }, // the cooker holds under stun while the chain works (ECHOING: par 91% to 79% on day 8, T5a pass 2)
    { from: D3, def: "whetstone", word: "rising" }, // huge slugs: each slug the chain hits grows past the last
  ],
  highspire: [ // TRIPLE THREAT: burn left, split centre, haul right (weaver, tier 3)
    { from: D1, def: "loom", word: "rising" }, // haul right: the long run of slugs climbs (FIERY on the temper from day 5: par 88% to 69%, T5a pass 1)
    { from: D2, def: "splitter", word: "rising" }, // split centre: each bolt lands harder than the last (FIERY: par 90% to 78% on day 8; BRACED scores 0 on the splitter, T5a pass 2)
    { from: D3, def: "temper", word: "fiery" }, // burn left, once the other two are working
  ],
  matriarch: [ // GRAND FOUNDRY: kiln and press, every rig, heavy armor (furnace, tier 3, the boss; fielded from day 8)
    { from: D1, def: "press", word: "braced" }, // heavy armor: the press holds under stun (live the day she arrives)
    { from: D2, def: "scrapcannon", word: "rising" }, // heavy: each shot of the big gun hits harder than the last (live the day she arrives)
    { from: D3, def: "kiln", word: "fiery" }, // the foundry fire, once she has been seen
  ],
  brasswick: [ // MATCHED POUR: mirrored belts, gauged, every pour fuses (foundry, tier 1)
    { from: D1, def: "temper", word: "fiery" }, // the matched pour runs hot (FIERY on the twin gauge: par 90% to 75% on day 6, T5a pass 2)
    { from: D2, def: "twinmould", word: "echoing" }, // every pour fuses: an extra slug in a fifth pour
    { from: D3, def: "crucible", word: "braced" }, // the gauger crucible holds
  ],
  voss: [ // LOCKSTEP: latched in step, every pair hits harder (foundry, tier 3)
    { from: D1, def: "twinlatch", word: "fiery" }, // the latched pair hits with fire
    { from: D2, def: "crucible", word: "braced" }, // in step: the pour holds under stun (SWIFT: par 93% to 78%, T5a pass 1)
    { from: D3, def: "carronade", word: "rising" }, // each shot of the pair hits harder than the last
  ],
  grimhold: [ // ANVIL WALL: thick plate makes every shot hit harder (bastion, tier 2)
    { from: D1, def: "rampart", word: "rising" }, // plate makes every shot hit harder: each shot lands harder than the last
    { from: D2, def: "wardworks", word: "braced" }, // the wall holds under stun
    { from: D3, def: "tollbooth", word: "fiery" }, // the toll burns
  ],
  karsk: [ // IRON WALL: a wall of plate, he breaks it on you (bastion, tier 3)
    { from: D1, def: "wardworks", word: "braced" }, // a wall of plate holds under stun (MASSIVE on the rampart from day 5: par 64% to 46%, T5a pass 1)
    { from: D2, def: "platebreaker", word: "braced" }, // the breaker holds under stun (MASSIVE on the rampart: par 55% to 42% on day 8 and it HELPED par from day 12, T5a pass 2)
    { from: D3, def: "rampart", word: "rising" }, // the hammer lands harder with every blow
  ],
  lockjaw: [ // TWIN BITE: latched belts, his slugs land in pairs (furnace, tier 2, stand-in only)
    { from: D1, def: "twingauge", word: "wide", enchDir: 1 }, // twin: one more arrow on the gauge (a free side that faces the belt)
    { from: D2, def: "twinlatch", word: "fiery" }, // the latched pair bites with fire
    { from: D3, def: "scrapcannon", word: "echoing" }, // a pair of shots now and then
  ],
  thistlemail: [ // LEAF MAIL: threads plate her, plated her guns spin (weaver, tier 2, stand-in only)
    { from: D1, def: "loom", word: "braced" }, // threads plate her: the loom holds under stun
    { from: D2, def: "dartgun", word: "rising" }, // her guns spin up: each dart hits harder than the last
    { from: D3, def: "venom", word: "fiery" }, // the thistles sting with fire
  ],
};

/** The first day a grant's rival can field it: the later of the grant's day and the rival's own first day. */
export const npcGrantDay = (id: RivalId, g: NpcGrant): number => Math.max(g.from, FIRST_DAY[id] ?? 1);

/** The state of the T1/T2 toggle (module state; default on): the bench keeps the rivals' words out of ENCHANT-on worlds with it
 *  (state B of T5), and a test pins that. The game never flips it. */
let npcWordsOn = true;
export const npcWordsRules = (): boolean => enchantRules() && npcWordsOn;
export function setNpcWords(on: boolean): void {
  npcWordsOn = on;
}
export function withNpcWords<T>(fn: () => T, on = true): T {
  const was = npcWordsOn;
  setNpcWords(on);
  try {
    return fn();
  } finally {
    setNpcWords(was);
  }
}

/**
 * T1: `build` (a rival's deck on `day`, runes already on or not) holding the rival's words that are live on `day`. Nothing when ENCHANT is off
 * (the table is not read: the SAME build comes back), or the day is before the first grant. The word goes on the first copy of the grant's
 * def that holds none: a rig or factory in `items`, a turret in the turret list (setTurretList writes build.turrets, the starting layout has
 * none). The deck is copied before it is written; a grant whose def the deck lacks is skipped (the test over every rival and day proves it never is).
 */
export function captainWordsOn(build: Build, id: RivalId, day: number): Build {
  if (!npcWordsRules()) return build;
  const live = NPC_WORDS[id].filter((g) => g.from <= day);
  if (!live.length) return build;
  const out: Build = { ...build, items: build.items.map((p) => ({ ...p })) };
  for (const g of live) {
    if (ITEMS[g.def]?.kind === "turret") {
      const list = turretList(out);
      const t = list.find((x) => x.def === g.def && x.ench === undefined);
      if (!t) continue;
      t.ench = g.word;
      setTurretList(out, list);
    } else {
      const p = out.items.find((x) => x.def === g.def && x.ench === undefined);
      if (!p) continue;
      p.ench = g.word;
      if (g.enchDir !== undefined) p.enchDir = g.enchDir;
    }
  }
  return out;
}

/**
 * T2: the word and side the deck's copy of `def` holds, or null. A deck with two copies of the def, only one with a word, gives that word;
 * with two words, the first copy's (items in deck order, then turrets by slot). Null when ENCHANT is off.
 */
export function dropWordOf(deck: Pick<Build, "hero" | "items" | "turrets">, def: string): { ench: EnchantId; enchDir?: number } | null {
  if (!enchantRules()) return null;
  for (const p of deck.items) if (p.def === def && p.ench !== undefined) return { ench: p.ench as EnchantId, ...(p.enchDir !== undefined ? { enchDir: p.enchDir } : {}) };
  for (const t of turretList(deck)) if (t.def === def && t.ench !== undefined) return { ench: t.ench as EnchantId };
  return null;
}

/** A (def, word) pair some rival holds, WIDE on a rig with its side. */
export interface NpcPair {
  def: string;
  word: EnchantId;
  enchDir?: number;
}

/** The key of a pair, for the server's slot test. */
export const npcPairKey = (p: { def: string; ench?: string; word?: string; enchDir?: number }): string =>
  `${p.def}:${p.ench ?? p.word}${p.enchDir !== undefined && (p.ench ?? p.word) === "wide" ? `/${p.enchDir}` : ""}`;

/** T2 (the server): the pairs some rival holds on a day from 5 up to `day` (a grant counts from the first day its rival is fielded
 *  with it: npcGrantDay), as keys. A word a warlord's drop kept can only be one of these. Empty while the T5 toggle keeps the rivals' words
 *  out (setNpcWords(false): state B, ENCHANT-1's world, whose upload tests pin the player's sources alone; the game and the server never flip it). */
export function npcDropPairs(day: number): Set<string> {
  const out = new Set<string>();
  if (!npcWordsOn) return out;
  for (const id of Object.keys(NPC_WORDS) as RivalId[]) {
    for (const g of NPC_WORDS[id]) if (npcGrantDay(id, g) <= day) out.add(npcPairKey(g));
  }
  return out;
}

/** T2 (the server): the words in npcDropPairs(day): every word some rival holds on a day from 5 up to `day` (the offered-words set's extra). */
export function npcDropWords(day: number): Set<EnchantId> {
  const out = new Set<EnchantId>();
  if (!npcWordsOn) return out;
  for (const id of Object.keys(NPC_WORDS) as RivalId[]) {
    for (const g of NPC_WORDS[id]) if (npcGrantDay(id, g) <= day) out.add(g.word);
  }
  return out;
}

/** T2 (the server): how many drops can carry a word by `day`: one warlord fight a day, from day NPC_WORD_DAYS[0] on (0 with the toggle off, like the pairs). */
export const npcDropsByDay = (day: number): number => (npcWordsOn && Number.isInteger(day) && day >= NPC_WORD_DAYS[0] ? day - NPC_WORD_DAYS[0] + 1 : 0);
