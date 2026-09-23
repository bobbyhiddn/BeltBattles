// Rival captains (0.6.0 groundwork). A run becomes three acts against named rivals, with
// an elite at the end of acts 1 and 2 and a boss finale. This file holds the roster data
// and the schedule; the decks live in rivalBuilds.ts. The schedule draws from its own
// hashSeed(runSeed, "rival", act) stream, so the shop and battle streams are untouched.

import { hashSeed, Rng } from "../core/rng";
import { HEROES, type Faction, type HeroId } from "./content";
import type { Build } from "./deck";
import { PLANS, planBuild, type RivalLoadout } from "./rivalBuilds";

export type RivalId =
  | "sootjaw" | "nettle" | "grubnose" | "mothqueen"
  | "sparkfang" | "lacewing" | "ratchet" | "emberlyn" | "bulwark"
  | "silkshade" | "longtooth" | "highspire" | "matriarch";

export type RivalRank = "regular" | "elite" | "boss";
export type Act = 1 | 2 | 3;

export interface Portrait {
  palette: string[]; // 3-4 names from src/render/palette.ts (C)
  feature: string; // the one visual feature the artist should build the face around
}

export interface RivalDef {
  id: RivalId;
  name: string; // all caps, at most 14 characters
  hero: HeroId;
  faction: Faction;
  tier: Act; // the act the rival belongs to
  rank: RivalRank;
  trick: string; // NEXT BATTLE panel title
  blurb: string; // NEXT BATTLE panel line
  portrait: Portrait;
}

function rival(
  id: RivalId, name: string, hero: HeroId, tier: Act, rank: RivalRank,
  trick: string, blurb: string, palette: string[], feature: string,
): RivalDef {
  return { id, name, hero, faction: HEROES[hero].faction, tier, rank, trick, blurb, portrait: { palette, feature } };
}

export const RIVALS: Record<RivalId, RivalDef> = {
  sootjaw: rival("sootjaw", "SOOTJAW", "furnace", 1, "regular", "SLOW COOKER",
    "ONE LONG WINDING BELT. LATE, HOT SLUGS.",
    ["rust2", "soil3", "fire3", "bone"], "soot-black jaw clamped on a glowing cinder pipe"),
  nettle: rival("nettle", "NETTLE", "weaver", 1, "regular", "SHORT STITCH",
    "LOOM PARKED UNDER THE GUNS. FIRES FIRST.",
    ["verd3", "verd1", "lime", "bone"], "crown of bent sewing needles"),
  grubnose: rival("grubnose", "GRUBNOSE", "furnace", 1, "regular", "PRESS GANG",
    "A STAMP PRESS FEEDS THE SECOND INTAKE.",
    ["rust3", "brass2", "steel1", "amber"], "nose ring shaped like a press die"),
  mothqueen: rival("mothqueen", "MOTH QUEEN", "weaver", 1, "elite", "FRAY STORM",
    "SPLIT BOLTS, OILED BELTS. FRAY PILES UP.",
    ["plum3", "plum4", "ice", "verd4"], "moth-wing mantle with frayed, glowing edges"),
  sparkfang: rival("sparkfang", "SPARKFANG", "furnace", 2, "regular", "SHOCK TROOPER",
    "GALVANIC COILS STALL YOUR MACHINES.",
    ["rust2", "cyan", "ice", "steel2"], "copper fang arcing a blue spark"),
  lacewing: rival("lacewing", "LACEWING", "weaver", 2, "regular", "SPLITTER SWARM",
    "SPLITTERS TURN EVERY BOLT INTO TWO.",
    ["verd2", "verd4", "white", "cyan"], "lace veil that splits into twin tails"),
  ratchet: rival("ratchet", "RATCHET", "furnace", 2, "regular", "OVERCLOCK",
    "OVERDRIVE BELT, CALIBRATED GUN.",
    ["brass3", "yellow", "rust1", "steel3"], "goggles with a spinning gear monocle"),
  emberlyn: rival("emberlyn", "EMBERLYN", "weaver", 2, "regular", "EMBER WEAVE",
    "A TEMPER ON EVERY BELT. EVERY HIT BURNS.",
    ["verd1", "fire2", "fire4", "maroon"], "braids tipped with smouldering embers"),
  bulwark: rival("bulwark", "OLD BULWARK", "furnace", 2, "elite", "IRONCLAD",
    "THREE ARMOR PLATES, A BRAKED COOKER.",
    ["steel1", "steel3", "rust2", "brass1"], "riveted iron plate bolted over one eye"),
  silkshade: rival("silkshade", "SILKSHADE", "weaver", 3, "regular", "STATIC WEB",
    "A COIL ON EVERY BELT. SHOCK AFTER SHOCK.",
    ["plum2", "verd3", "cyan", "ink"], "hooded face behind a crackling web"),
  longtooth: rival("longtooth", "LONGTOOTH", "furnace", 3, "regular", "GATE CHAIN",
    "SIX GATES, THEN A LONG HAUL. HUGE SLUGS.",
    ["rust3", "bone", "amber", "soil2"], "one long tusk hung with gate tags"),
  highspire: rival("highspire", "HIGHSPIRE", "weaver", 3, "regular", "TRIPLE THREAT",
    "BURN LEFT, SPLIT CENTRE, HAUL RIGHT.",
    ["verd2", "brass3", "white", "blue"], "tall spire helm flying three pennants"),
  matriarch: rival("matriarch", "IRON MATRIARCH", "furnace", 3, "boss", "GRAND FOUNDRY",
    "KILN AND PRESS, EVERY GATE, HEAVY ARMOR.",
    ["rust1", "fire2", "brass4", "ink"], "crown of kiln chimneys venting fire"),
};

export const RIVAL_IDS = Object.keys(RIVALS) as RivalId[];

export const RIVAL_ROUNDS = 12; // hard cap on rounds in a rival run (run.ts MAX_ROUNDS)
export const BOSS_ROUND = 10; // first round of the finale

export interface ActDef {
  act: Act;
  title: string; // act banner, e.g. "ACT I"
  name: string; // act banner subtitle
  first: number; // first round of the act
  last: number; // last round of the act (the elite or the finale's final retry)
}

export const ACTS: ActDef[] = [
  { act: 1, title: "ACT I", name: "THE CINDER ROAD", first: 1, last: 3 },
  { act: 2, title: "ACT II", name: "THE SKYWRIGHT PASS", first: 4, last: 7 },
  { act: 3, title: "ACT III", name: "THE GRAND FOUNDRY", first: 8, last: 12 },
];

export interface RivalSlot {
  round: number;
  act: Act;
  rank: RivalRank;
  index: number; // position within the act's regular draw (or boss attempt number)
}

/** Rounds 1-2 tier 1, 3 act-1 elite, 4-6 tier 2, 7 act-2 elite, 8-9 tier 3, 10-12 boss. */
export function rivalSlot(round: number): RivalSlot {
  const r = Math.max(1, Math.min(RIVAL_ROUNDS, Math.floor(round)));
  if (r <= 2) return { round: r, act: 1, rank: "regular", index: r - 1 };
  if (r === 3) return { round: r, act: 1, rank: "elite", index: 0 };
  if (r <= 6) return { round: r, act: 2, rank: "regular", index: r - 4 };
  if (r === 7) return { round: r, act: 2, rank: "elite", index: 0 };
  if (r <= 9) return { round: r, act: 3, rank: "regular", index: r - 8 };
  return { round: r, act: 3, rank: "boss", index: r - BOSS_ROUND };
}

export function actFor(round: number): ActDef {
  return ACTS[rivalSlot(round).act - 1];
}

/** Rivals that can fill a slot, in roster order. */
export function rivalPool(act: Act, rank: RivalRank): RivalId[] {
  return RIVAL_IDS.filter((id) => RIVALS[id].tier === act && RIVALS[id].rank === rank);
}

/** The rival fought in a round of the run seeded runSeed. No regular repeats within a run. */
export function rivalFor(runSeed: number, round: number): RivalId {
  const s = rivalSlot(round);
  const pool = rivalPool(s.act, s.rank);
  if (s.rank !== "regular") return pool[0];
  const order = new Rng(hashSeed(runSeed, "rival", s.act)).shuffle([...pool]);
  return order[s.index % order.length];
}

/** The whole run's rival for rounds 1..12 (index 0 = round 1). */
export function rivalSchedule(runSeed: number): RivalId[] {
  return Array.from({ length: RIVAL_ROUNDS }, (_, i) => rivalFor(runSeed, i + 1));
}

/** Every round a rival can be fought in. */
export function rivalRounds(id: RivalId): number[] {
  const d = RIVALS[id];
  const out: number[] = [];
  for (let r = 1; r <= RIVAL_ROUNDS; r++) {
    const s = rivalSlot(r);
    if (s.act === d.tier && s.rank === d.rank) out.push(r);
  }
  return out;
}

/** A rival's deck plus the supplies and gold it represents, as it stands at a round. */
export function rivalLoadout(id: RivalId, round: number): RivalLoadout {
  return planBuild(PLANS[id], round);
}

/** The rival's production build for a round (1-based); escalates with the round. */
export function rivalBuild(id: RivalId, round: number): Build {
  return rivalLoadout(id, round).build;
}
