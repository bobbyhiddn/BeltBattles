// The deck rating the par player reads (FB-C, REQ-BFG-026): what the build screen shows about a deck, as one number.
// It lives beside deck.ts, not in src/sim/harness: like the build screen's inspector (screens/build/inspector.ts) it
// reads each placed part's effect at its stars through the game's own stars.ts, and the harness guard
// (tests/harness.mods.test.ts: no src/sim/harness file reads star values itself) keeps every harness file off that
// path. Nothing in the game imports it; the balance harness's par player (src/sim/harness/player.ts) does.

import { AMMO_SPACING, BELT_SPEED, BURN_TIME, HEROES, ITEMS, WINDOW_TIME, type FactorySpec, type HeroId } from "./content";
import { BURN_DPS } from "./content"; // NUM-1 (REQ-BFG-047): a Burn stack's damage a second
import { factorySpeed, rateMul, secPer } from "./content"; // NUM-2 (REQ-BFG-047): SPEED, whole rate %s
import { WIND_START, sustainLive } from "./content"; // BOTS-X (SUS-C, REQ-BFG-069): the bots' sustain value
import { AMMO, SHAPE_ARROWS, rigShape } from "./content"; // Y2 (release Y): release Y's prices (STAR_EQ)
import { JAM_COOLDOWN, JAM_THRESHOLD } from "./content"; // the overfeed (ruling Y7B1-Q4): a jammed gun's lost shots
import { DISRUPT_TIME } from "./content"; // PLAIN-1 (REQ-BFG-084, P5): SPARK GAP's STUN seconds (STUN_SEC_EQ)
import { roundHalfUp } from "./pct"; // NUM-2: a turret's speed rounds half up once (battle.ts makeTurret)
import {
  beltStateAt, connectorClaims, factoryPace, installedTurrets, itemByUid, joinOf, journeyTiles, occupancy, rigHits, routeInfo,
  walkRoute, type Build, type RigHit,
} from "./deck";
import type { RouteWalk } from "./deck"; // SCALE-2d (REQ-BFG-098): rateDeck keeps each belt's walk while SCALE_RIGS is on
import { platedDeck, stokeHits } from "./deck"; // 0.8.0 P1: wave 3's plating and stokers
import { FURNACE_LONG_BELT, SHARED_HEADROOM, gearStats } from "./battle";
import { resolveCore } from "./cores";
import { drakeConvert } from "./cores"; // Y4 (release Y): DRAKE NOZZLE's price (drakeGain)
import type { CoreSpec } from "./content"; // Y4
import { doubles } from "./overclock"; // Y3 (release Y): the OVERCLOCKER's price (chargeGains)
import { effectAt, gradeOf, starsOf, valueOf } from "./stars";
import { hullScaleRules } from "./hullScale"; // PAR-AZ (REQ-BFG-079): the tables measured with every switch on (fightTime, foeOn)
// SCALE-2d (REQ-BFG-098 098.6, REQ-BFG-108, REQ-BFG-106, REQ-BFG-110; BRIEF-SCALE2d D1): with SCALE_RIGS on the rating prices
// each scaling piece's `reads` line, PRESSURE BREECH's uncapped perQueued and VENOM DRIP's POISON (scaleRating.ts); off,
// none of it runs and every rating is byte for byte the base's
import { scaleRules } from "./scale";
import { READ_DAY_DEFAULT, poisonGain, readCtx, readValue, readerCount, type ReadCtx } from "./scaleRating";

/** Seconds in a typical dusk fight (the desk run's fights last 17-29 s): damage is weighed by how much of it lands. */
export const FIGHT_T = 25;
/**
 * 0.6.2 CAND-A (the skill-ladder fix): the mean length in seconds of a par-field fight at dusk of each day 1..10
 * (the typical par field against itself, K = 12, FURNACE and WEAVER both ways, one battle per pairing; measured at
 * 12c8e5a). FIGHT_T is day 1's; fights shorten as decks grow, to 9.5 s on day 10. Weighed over 25 s on every day, a
 * belt whose first payload lands at 6-10 s kept 60-75% of its damage on day 10, when most fights are over by then,
 * so the sharp player (it follows the rating most closely) drew long belts and long joined journeys that fire late.
 */
export const FIGHT_BY_DAY: readonly number[] = [24.4, 19.9, 15.7, 14.2, 12.9, 11.6, 11.1, 10.5, 10.1, 9.5];
/**
 * PAR-AZ (REQ-BFG-079; BRIEF-PARAZ 1 (b); output-hull1d/standin-proposal.md step 0b): FIGHT_BY_DAY re-measured with EVERY
 * switch on (NPC_DAY, HULL_SCALE and LADDER_FIX, each through its setter) and the par player's NPC day in (c52be67): the
 * par fights run on the day's hull, damage and sustain (M, D, S) and the wind's share. CAND-A's method, now a tool
 * (tools/fightByDay.ts): the typical par field against itself, K 12, FURNACE and WEAVER, every ordered pair once (552
 * battles a day), the MEAN fight in seconds. Measured at b56aa34 (bb-0.9.7; PAR-AZ's D(d) re-fit in, cap's ruling
 * bff72995f529f68b; the switches set by --all-on), 2026-10-10 13:54Z, four shards at once from the repo root:
 *   npx vite build --ssr tools/fightByDay.ts --outDir tools/dist/fightbyday --emptyOutDir --logLevel warn
 *   nice -n 19 node tools/dist/fightbyday/fightByDay.js --days 1,2,3 --k 12 --all-on --json fbd-d1_2_3.json
 *   (and --days 4,5,6, --days 7,8, --days 9,10)
 * Units: real seconds, as rateDeck compares them (each belt's damage counts for the share of the fight left after its first
 * payload, RIVETER and ARMOR PRESS repair over half of it); no day scales a second. Stability (FLIP-X2's way), every pass
 * in PAR-AZ REPORT (b): at the old D, pass 1 (the bots on the 0.9.7 tables, e80ad2d) was selected and pass 2 moved at most
 * 9.5%; at the re-fit D, pass 3 (the bots on pass 1's tables, b56aa34) is this table, and pass 4 (this table in) moved at
 * most 4.3% on any day and column, under the 10% rule.
 * fightTime reads it with HULL_SCALE on (hullScaleRules()); off, FIGHT_BY_DAY exactly as before.
 */
export const FIGHT_BY_DAY_HS: readonly number[] = [22.6, 19.7, 16.6, 16.3, 16.9, 17.8, 17.9, 18.1, 17.4, 18.2];
/** The par-field fight length of `day` (FIGHT_BY_DAY; days past the table read its last entry). PAR-AZ: with HULL_SCALE on,
 *  FIGHT_BY_DAY_HS (the fights with every switch on). */
export const fightTime = (day: number): number => {
  const t = hullScaleRules() ? FIGHT_BY_DAY_HS : FIGHT_BY_DAY;
  return t[Math.max(1, Math.min(t.length, Math.floor(day))) - 1];
};

/**
 * BOTS-X (SUS-C, REQ-BFG-069; SUSTAIN-1 4.8 rule 2): THE EXPECTED DUSK FOE by day 1..10, which the bots' sustain value
 * reads (rateDeck's `day`, below). Built ONCE by tools/sustainFoe.ts on bx e1e1004 (rules bb-0.8.7) with the sustain switch
 * on (content.ts setSustain(true) first), 2026-10-05 06:14:33Z (43 s wall): each day the par fields (par.ts parField, k 6)
 * of the four playable heroes (FURNACE, WEAVER, FOUNDRY, BASTION) meet in every cross pair and every mirror, 4 seeds each
 * (seed hashSeed("botsx-foe", day, hero x, hero y, i, j, s)), every fight from both sides: 2,208 battles a day, 22,080 in
 * all. From the repo root, four shards under nice -n 19:
 *   npx vite build --ssr tools/sustainFoe.ts --outDir tools/dist/botsx-foe --emptyOutDir --logLevel warn
 *   nice -n 19 node tools/dist/botsx-foe/sustainFoe.js --days 1,2,3 --k 6 --seeds 4 --json foe-d1-3.json
 *   (and --days 4,5,6, --days 7,8, --days 9,10, at once)
 * fight: the mean fight length (s); burn: the share of sides whose foe landed BURN on them; hit: the mean size of a hit no
 * SHIELD stopped (N1 units: what one SHIELD is worth). Data, not re-measured by any test (BOTS-X REPORT section 3).
 * TUNE-X (bench only, never merged): re-run on the bench branch tunex bbfc605 (both switches on: SUSTAIN_LIVE and
 * BOT_RUNES; DRAG CHAIN ★3 3 s; SIFTER dormant), 2026-10-05 07:05:55-07:06:48Z, the same command and shards. Fight, BURN
 * and hit moved by more than 10% on 8 of 10 days (most: day 8's BURN +46%, day 10's fight -23%), so this table is
 * release X's (TUNE-X REPORT step 0; FLIP-X2 applies it before the regeneration). BOTS-X's bx table was 29.34 / 0.208 /
 * 65.5 on day 1 to 17.91 / 0.527 / 95.5 on day 10.
 * FLIP-X2 step 3c (Addendum 1; REVIEW-TUNEX's re-run after the rune lines): re-run on flipx2 8d714af (both switches on,
 * bb-0.9.0, TUNE-X's rune lines and DORMANT_RUNES in, the captains' SIFTERs out), 2026-10-05 08:48:43-08:49:28Z, the same
 * command and four shards (W/output-flipx2/bench/foe-*.json). Days 1, 2, 3, 7, 9 and 10 moved by more than 10%, all in
 * the BURN share (day 1 0.208 -> 0.250, day 3 0.303 -> 0.380, day 9 0.637 -> 0.721, day 10 0.631 -> 0.719); fight and
 * hit moved under 5% on every day. So the table is re-pinned (TUNE-X's was 29.24 / 0.208 / 74.7 on day 1 to 13.84 /
 * 0.631 / 109.8 on day 10).
 */
export interface FoeDay { fight: number; burn: number; hit: number }
export const SUSTAIN_FOE: readonly FoeDay[] = [
  { fight: 29.25, burn: 0.250, hit: 74.5 }, // day 1
  { fight: 24.18, burn: 0.328, hit: 81.9 },
  { fight: 21.76, burn: 0.380, hit: 75.1 },
  { fight: 19.44, burn: 0.385, hit: 80.3 },
  { fight: 18.56, burn: 0.490, hit: 88.0 }, // day 5
  { fight: 17.75, burn: 0.598, hit: 87.1 },
  { fight: 16.19, burn: 0.613, hit: 96.9 },
  { fight: 15.60, burn: 0.661, hit: 98.1 },
  { fight: 14.39, burn: 0.721, hit: 104.9 },
  { fight: 13.41, burn: 0.719, hit: 113.1 }, // day 10
];
/**
 * PAR-AZ (REQ-BFG-079; BRIEF-PARAZ 1 (b); standin-proposal.md step 0b): SUSTAIN_FOE re-measured with EVERY switch on
 * (NPC_DAY, HULL_SCALE and LADDER_FIX, each through its setter) and the par player's NPC day in (c52be67), by
 * tools/sustainFoe.ts's own four shards (the sustain switch on first, k 6, 4 seeds, the four heroes' par fields in every
 * cross pair and mirror, both sides: 2,208 battles a day). Measured at b56aa34 (bb-0.9.7, the re-fit D in, --all-on),
 * 2026-10-10 13:54Z (pass 3; pass 4 with it in moved at most 4.3%, as FIGHT_BY_DAY_HS's):
 *   npx vite build --ssr tools/sustainFoe.ts --outDir tools/dist/botsx-foe --emptyOutDir --logLevel warn
 *   nice -n 19 node tools/dist/botsx-foe/sustainFoe.js --days 1,2,3 --k 6 --seeds 4 --all-on --json foe-d1_2_3.json
 *   (and --days 4,5,6, --days 7,8, --days 9,10)
 * Units, as rateDeck compares each column: `fight`, real seconds (the mean fight: the SHIELDs a WARD BELL gains over it,
 * the heal seconds min(25, fight)); `burn`, the share of sides whose foe landed BURN (heal halved by it), a share; `hit`,
 * the mean unstopped hit as it LANDED on the day divided by M(d) (the tool's hitM). rateDeck's defense is in day-1 numbers
 * (the hero's hull + hullBonus, heal and plate as written), and on day d a hull lands x M(d) while heal and plate land
 * x S(d) = M(d), so they stay day-1 exact; a SHIELD stops one landed hit (D(d) x the raw hit), worth hit / M(d) of day-1
 * hull. So every deck's defense keeps the day's proportions. Stability as FIGHT_BY_DAY_HS's (PAR-AZ REPORT (b)).
 * foeOn reads it with HULL_SCALE on (hullScaleRules()); off, SUSTAIN_FOE exactly as before.
 */
export const SUSTAIN_FOE_HS: readonly FoeDay[] = [
  { fight: 29.68, burn: 0.250, hit: 70.5 }, // day 1
  { fight: 24.27, burn: 0.583, hit: 67.9 },
  { fight: 19.90, burn: 0.590, hit: 75.2 },
  { fight: 21.07, burn: 0.715, hit: 68.0 },
  { fight: 22.17, burn: 0.761, hit: 68.1 }, // day 5
  { fight: 23.29, burn: 0.803, hit: 57.9 },
  { fight: 22.80, burn: 0.832, hit: 62.7 },
  { fight: 24.43, burn: 0.915, hit: 59.7 },
  { fight: 23.96, burn: 0.957, hit: 63.1 },
  { fight: 24.43, burn: 0.958, hit: 60.8 }, // day 10
];
/** BOTS-X: the expected foe of `day` (SUSTAIN_FOE; days past the table read its last row). PAR-AZ: with HULL_SCALE on,
 *  SUSTAIN_FOE_HS (the fights with every switch on; its hit in day-1 units). */
export const foeOn = (day: number): FoeDay => {
  const t = hullScaleRules() ? SUSTAIN_FOE_HS : SUSTAIN_FOE;
  return t[Math.max(1, Math.min(t.length, Math.floor(day))) - 1];
};

/** BOTS-X: a sustain keyword (SUSTAIN-1 4.6). */
export type SustainKw = "SHIELD" | "HEAL" | "REGEN";
/** BOTS-X: the sustain keyword piece `def` carries (its 1-star spec): WARD BELL SHIELD, RIVETER and MEND PRESS HEAL,
 *  MENDING LOOM REGEN; undefined for any other piece. */
export function sustainKeyword(def: string): SustainKw | undefined {
  const d = Object.prototype.hasOwnProperty.call(ITEMS, def) ? ITEMS[def] : undefined;
  if (d?.mod?.shield) return "SHIELD";
  if (d?.mod?.regen) return "REGEN";
  if (d?.factory?.heal || d?.gate?.heal) return "HEAL";
  return undefined;
}

/** BOTS-X (SUSTAIN-1 4.8 rule 2): a deck's sustain as effective hull on a day (rateDeck with `day`, the switch on), by
 *  keyword, and the total its defense gains. */
export interface SustainHull { shield: number; heal: number; regen: number; total: number }

/**
 * Damage-equivalents per payload of the effects the route walk doesn't turn into damage, read off the cards: a Fray
 * stack adds 0.2 to each later hit (~3), a shocked payload stalls a machine for DISRUPT_TIME (NUM-3: 2 s; was 1.6 s), a
 * static stall per second, an OVERCLOCKER doubling a rig every few seconds, TOLLBOOTH and SIFTER guards.
 */
export const EQ = { fray: 30, shock: 30, static: 40, overclock: 80, toll: 5, sift: 5 } as const;
/** PLAIN-1 (REQ-BFG-084, BRIEF-PLAIN1 P5): a SPARK GAP's STUN, a second of it: EQ.shock's stall (DISRUPT_TIME, 2 s) a second,
 *  15. A STUN second is the same STUN whatever gave it (Battle.impact), so the price is the shock's. */
export const STUN_SEC_EQ = EQ.shock / DISRUPT_TIME;
/** A harassment round's damage-equivalent per payload (content.ts FactorySpec.round), from its card. */
export const ROUND_EQ: Readonly<Record<string, number>> = { sabot: 60, frost: 40, drag: 30, limpet: 80 };

/**
 * Y2 (release Y; DESIGN-Y rows 8, 13, 15, 16; REVIEW-STARD: "each job prices its own rule, behind STAR_RULES"): the
 * rating's prices of the STUN pieces' new rules. Each is read off the cards, as EQ's are (Y7a benches them):
 * - perStun: LODESTONE pays for each STUN on the foe, its floor and cap gone, so it is rated by your own STUN pieces
 *   (stunSources): each holds 0.75 enemy parts stunned as it hits (two of them: the old price's 1.5 machines); none, 0.
 * - tollFactory: TOLLBOOTH's tolls guard its belt's factory from ★1 and spend on STUNs only: x1.25 its EQ.toll guard.
 * - LIMPET WORKS' 20 on impact joined its blast, so the walk counts no base: its round takes AMMO.limpet.base back (the
 *   same power, the same rating at every star).
 * - BRACE FRAME guards the tiles its arrows hit, no longer itself: its guard x arrows / (arrows + 1) (2/3 for its L).
 * The rest comes from the data: the walk drops LODESTONE's floor and OVERDRIVE's flats and counts HOT SWAP's
 * BURN 5 / 9; the cadence reads SABOT ★3's RATE 20. MANTLET, FLAK SCREEN, SPOTTER and GRAPNEL GUN stay rated by price
 * (NOMINAL), and SCRAPPER's trigger stamps were never rated: unchanged.
 * Y3 (release Y; DESIGN-Y rows 20-32); no new constant:
 * - OVERCLOCKER: EQ.overclock / its rest only when the rig it charges, the next one whatever it is, has something to double
 *   (chargeGains; a speed rig, a STOKER or a flat-less TWIN LATCH next: 0).
 * - STOKER: Y7b1 (ruling Y7A-R1): its cap holds (rateDeck caps the stoked feed; Y3 had skipped it, so the stoked feed
 *   arrived in full and firedShare priced the overfed gun's jams).
 * - The walk (deck.ts walkRoute) carries the rest from the data and rules: PINCER, TWIN GAUGE, QUENCH TANK and PLATE
 *   BREAKER without their floors, BELLOWS for each whole 2 s uncapped, QUENCH without its stack cap, LONG HAUL uncapped,
 *   BRAKE SHOE's slower ★2/★3 belts without their flats, TWIN LATCH without its flat, SURGE VALVE's pulses for the seconds
 *   a slug rides its belts (no speed). BARBED SPOOL's FRAY cap and ASSEMBLY LINE's start times were never rated: unchanged.
 * Y4 (release Y; DESIGN-Y rows 33-40); no new constant:
 * - SEAM WELDER: its plating is pairs only (a lone load rolls none), so its NOMINAL credit counts on the turret's share of
 *   paired loads (pairShare, as TWIN TRIGGER's bonus): a turret with no pairs rates it at nothing.
 * - EXT. CHAMBER: it fires 2/3/4 loads a shot, at most what the chamber holds (its +1 slot is gone): the turret's shot is
 *   min(perShot, its chamber) loads (Battle.chambers).
 * - DRAKE NOZZLE: each flatPerBurn (25/18/13: Y7b1, ruling Y7A-R4's fallback; Y4's 10/7/5) of a shot's bonus damage is a BURN (worth BURN_TIME x BURN_DPS) in place of that
 *   damage (cores.ts drakeConvert on the walk's flat, deck.ts RouteEstimate.flat), its free BURN gone: computed, so no NOMINAL.
 * - The rest comes from the data: HOPPER's window +1/+2/+3 with no load time, store or no-jam (`start`, the
 *   finisher's split, firedShare), TWIN TRIGGER's pairBonus 30/60/95 with no load-time cut (`start`), ROTARY BREECH's load
 *   time with no fire rate or no-jam (`start`, the cadence, firedShare) and STEAM BREECH's plated-only speed (bare: its own
 *   rate). SALVO RACK's pace was never read here. ANVIL BREECH: Y7b1 (ruling Y7A-R3c) deletes its row, so it rates as at
 *   0.9.2 (anvilFlat + perPlate x meanPlate); Y4's fold (perPlate 1.25/2.75/4.38 x meanPlate, no flat) priced it at about
 *   nothing on BASTION (18.75 against 40).
 * Y5 (release Y; DESIGN-Y rows 41-47):
 * - COUNTERWEIGHT uncapped: the walk counts every tile ridden (deck.ts walkRoute reads no max), as Battle.applyHit does.
 * - CAPACITOR BANK uncapped: NOMINAL priced it with its 5 s cap (capacitorPaid, the base's maxSeconds); the charge past that
 *   is priced on top (capacitorTail): on a gun fed a load every more than its load time + 5 s, each shot's extra seconds,
 *   and the first shot's past 5 s when its first load comes later than that.
 * - IRON WALL: Y7b1 (ruling Y7A-R3d) deletes its row, so it rates as at 0.9.2: its plating as repair and its bonus at 120
 *   PLATE for half the fight. (Y5 had it roll none, no repair, and counted its bonus only on a deck that plates its hull.)
 * - POWDER KEG's repeating pulse without BURN (kegGain: a blast at every multiple of its fuse).
 * - SPALL CATCHER's single-count soak: on a deck that plates its hull its NOMINAL credit counts spallPlated of it (a soak is
 *   about a quarter of what such a hull takes, so its charge falls from 1.25 to 1 for each damage taken: 1 / 1.25 = 0.8);
 *   elsewhere as before. Its cap was never rated (NOMINAL), so its going changes nothing here.
 * - LONGCASE and FINISHER RAM change no rule: rated as before.
 * Y6 (release Y; DESIGN-Y section 4.1; VENOM's def is burnPlus's one source); no new constant:
 * - VENOM DRIP: a burnPlus term (burnPlusGain), in place of its poison's: its extra BURN seconds x BURN_DPS x the BURN stacks
 *   a slug of its belt carries (the walk's estimate.burn, after any QUENCH), on each payload it hits. With no BURN on the
 *   belt it rates as nothing. An OVERCLOCKER's charge on it counts as on any rig whose number doubling changes (chargeGains:
 *   overclock.ts doubles burnPlus). The core's and the runes' BURN (DRAKE NOZZLE, EMBER SHOT, HOT SEAM) and SLOW EMBERS'
 *   % are not counted here, as the walk's BURN term counts none of them.
 */
export const STAR_EQ = { perStun: 0.75, tollFactory: 1.25, capacitorPaid: 5, spallPlated: 0.8 } as const;

/** Y6 (release Y; DESIGN-Y section 4.1): what a VENOM DRIP hit of `burnPlus` seconds adds to each
 *  payload of a belt whose slugs carry `burn` BURN stacks (deck.ts walkRoute's estimate): each stack lasts burnPlus s
 *  longer at BURN_DPS a second (Battle.impact). No BURN, nothing. */
export function burnPlusGain(burnPlus: number, burn: number): number {
  return burnPlus * BURN_DPS * burn;
}

/** Y5 (release Y; DESIGN-Y row 42): a CAPACITOR BANK's charge past its old cap (capacitorPaid
 *  seconds), for each load a turret fires: a gun whose loads come `gap` s apart, each fired alone after its `loadTime`,
 *  sits empty gap - loadTime s before each shot; and before its first shot it sat empty from the start to its first load
 *  (`first` s), once in the fight's `loads` loads. Each second past the cap is perSecond (spec: at the turret's class %). */
export function capacitorTail(spec: CoreSpec, gap: number, loadTime: number, first: number, loads: number): number {
  const per = spec.perSecond ?? 0, cap = STAR_EQ.capacitorPaid;
  return per * Math.max(0, gap - loadTime - cap) + (per * Math.max(0, first - cap)) / Math.max(1, loads);
}

/** Y4 (release Y; DESIGN-Y row 40): what a DRAKE NOZZLE adds to a shot of bonus damage `flat`: each
 *  flatPerBurn of it is one BURN stack (cores.ts drakeConvert) worth BURN_TIME x BURN_DPS, in place of the damage it used. */
export function drakeGain(spec: CoreSpec, flat: number): number {
  const { stacks, used } = drakeConvert(spec, flat);
  return stacks * BURN_TIME * BURN_DPS - used;
}

/** Y5 (release Y; DESIGN-Y row 46): a POWDER KEG's worth for each payload of a route whose first
 *  payload rides `time` s, in a fight of `fight` s. It blasts `flat` at every multiple of its fuse while the fight lasts
 *  (Battle.kegTick: its fuse runs from the start), each blast onto the payloads then on its belts: about `time` s of the
 *  route's payloads (clipped at the fight's end; a belt longer than a fuse holds slugs two blasts reach), of the
 *  (fight - time) it fires. Its BURN is gone. 0.9.2's one blast was this sum's first term, with its BURN. */
export function kegGain(keg: { fuse: number; flat: number }, fight: number, time: number): number {
  let buffed = 0;
  for (let t = keg.fuse; t < fight; t += keg.fuse) buffed += Math.min(fight, t + time) - t;
  return (keg.flat * buffed) / Math.max(1, fight - time);
}

/** Y2: the pieces of `b` that land a STUN (LODESTONE's price): a shock or static rig (GALVANIC COIL,
 *  STATIC BRUSH), a factory stamping shock slugs (HOT SWAP) or STUN rounds (SABOT, FROSTBITE, DRAG CHAIN; a LIMPET WORKS
 *  only with a stall, which none holds), and a TESLA ARC core; each at its own stars. */
export function stunSources(b: Build): number {
  let n = 0;
  for (const p of b.items) {
    if (!Object.prototype.hasOwnProperty.call(ITEMS, p.def)) continue;
    const e = effectAt(p.def, gradeOf(b, p)), r = e.factory?.round;
    // PLAIN-1 (REQ-BFG-084): a SPARK GAP lands a STUN as a coil does (gate.stun; no other rig holds it)
    if (e.gate?.shock || e.gate?.stun || e.gate?.staticTime || e.factory?.cycle?.some((c) => c.shock) || (r && (r.kind !== "limpet" || (r.stall ?? 0) > 0))) n++;
  }
  for (const m of b.mods) if (ITEMS[m.def]?.kind === "core" && effectAt(m.def, starsOf(m)).core?.routine === "tesla") n++;
  return n;
}

/** Y3 (release Y; DESIGN-Y row 29): the rig an OVERCLOCKER's hit `h` charges on belt `tiles` (its
 *  hits by tile, R7 order, as Battle.makeSide reads them): the first later hit of another rig, whatever it is; does
 *  doubling it change anything (overclock.ts doubles)? false with no later rig on the belt. */
export function chargeGains(b: Build, tiles: readonly (readonly RigHit[])[], h: RigHit): boolean {
  let seen = false;
  for (const tile of tiles) for (const o of tile) {
    if (o === h) { seen = true; continue; }
    if (!seen || o.uid === h.uid) continue;
    const e = effectAt(o.def, starsOf(itemByUid(b, o.uid))).gate;
    return !!e && doubles(e);
  }
  return false;
}

/** Y2: BRACE FRAME's share of its old guard: the tiles its arrows hit, not itself. */
const braceShare = (def: string): number => {
  const arrows = SHAPE_ARROWS[rigShape(ITEMS[def]) ?? "I"]?.length ?? 1;
  return arrows / (arrows + 1);
};
/** Gear and cores whose effect the rating doesn't compute (MANTLET, FLAK, SPOTTER, every bought core): the turret's
 *  damage x (1 + NOMINAL x the part's value in gold), the typical player's "pricier is better". TUNE-M: not HOPPER, whose
 *  window and window time the turret model reads (rateDeck `start`). */
export const NOMINAL = 0.03;
/**
 * 0.6.2 CAND-A: the share of what reaches its intake a turret fires, by its load (arrivals / its nominal rate, perShot
 * / interval): all of it up to SAT_LO, falling in a straight line to SATURATED at SAT_HI and beyond. Jams (a backlog
 * of JAM_THRESHOLD skips a shot every JAM_COOLDOWN), the window it can't load while it fires, and joiners and
 * factories stalled behind the queue grow with the load. FB-C read a cliff (all below the rate, 0.85 of it above);
 * junction-062's bench decks fire 0.53-0.66 of the nominal rate when saturated (bench/joinbench.md), and with the
 * cliff the rating preferred its crowded layouts (F4 over F3L, W5 over W4 on day 7) that lose 1-13 points there.
 */
export const SATURATED = 0.7;
export const SAT_LO = 0.75, SAT_HI = 1.25;
/** CAND-A (the skill-ladder fix): past SAT_HI the share goes on falling, to SAT_DEEP at a load of SAT_DEEP_AT and
 *  beyond (junction-062's saturated bench decks fired 0.53-0.66 of the rate; three lines into one heavy intake, F4,
 *  lost 8-13 points to the third factory idle, F3L, which the flat 0.7 no longer showed once each belt is weighed
 *  from its own first payload). */
export const SAT_DEEP = 0.55, SAT_DEEP_AT = 2;
/** The rating's saturation model: the load where firing starts to fall (satLo), where it reaches `saturated` (satHi),
 *  and optionally where it bottoms out at `deep` (deepAt; absent: `saturated` from satHi on). RATING_CURVE is the
 *  default; RATING_CLIFF is FB-C's rule (all of it up to the turret's rate, 0.85 of the rate above it), kept for bench
 *  comparisons (tools/parBench.ts --ablate). */
export interface RatingModel { satLo: number; satHi: number; saturated: number; deepAt?: number; deep?: number }
export const RATING_CURVE: Readonly<RatingModel> = { satLo: SAT_LO, satHi: SAT_HI, saturated: SATURATED, deepAt: SAT_DEEP_AT, deep: SAT_DEEP };
export const RATING_CLIFF: Readonly<RatingModel> = { satLo: 1, satHi: 1, saturated: 0.85 };
/** The share a turret with load `rho` fires (1 for one that never jams). */
export const firedShare = (rho: number, noJam = false, m: Readonly<RatingModel> = RATING_CURVE): number => {
  if (noJam || rho <= m.satLo) return 1;
  if (rho < m.satHi) return 1 - ((1 - m.saturated) * (rho - m.satLo)) / (m.satHi - m.satLo);
  if (m.deepAt === undefined || m.deep === undefined || m.deepAt <= m.satHi) return m.saturated;
  return m.saturated - (m.saturated - m.deep) * Math.min(1, (rho - m.satHi) / (m.deepAt - m.satHi));
};

interface Feed {
  route: number; arrival: number; eq: number; first: number; ride: number;
  flat?: number; // Y4 (release Y): the walk's bonus damage a payload carries (DRAKE NOZZLE's price)
  factory?: number; // 0.8.0 P1: the feeding factory (STOKER's cap counts the factories sharing a turret)
  base?: number; // 0.8.0 P1: a stoked feed's arrival without the stoke
}

/** Per payload, the rig effects the walk leaves out (EQ), and the hull a RIVETER repairs per passing payload.
 *  `fight`: the fight's length; `time`: the route's first payload's ride to its turret (walkRoute's estimate). Y6: `burn`,
 *  the BURN stacks its slugs carry (walkRoute's estimate), read only by a VENOM DRIP (burnPlusGain). */
// SCALE-2d (REQ-BFG-098, REQ-BFG-108; BRIEF-SCALE2d D1): `ctx` is set only while SCALE_RIGS is on (rateDeck). Then a rig's
// `reads` line is priced at the day's typical count (scaleRating.ts readerCount): DMG as EQ on each payload it hits, PLATE
// as repair (PLATE ROLLER's rule, and into `plate`, the deck's PLATE a payload, which IRON WALL's count reads), HEAL as
// RIVETER's; an IRON WALL-type line (it reads your PLATE) waits in `wall` (each per one counted) until rateDeck knows the
// deck's PLATE; VENOM DRIP's POISON is priced by poisonGain. Off (no ctx): exactly as before
function hitExtras(b: Build, hits: RigHit[][][], ri: number, fight: number, time: number, burn = 0, ctx?: ReadCtx): { eq: number; repair: number; heal: number; plate: number; wall: { def: string; k: number }[] } {
  let eq = 0, repair = 0, heal = 0; // BOTS-X: `heal`, RIVETER's part of `repair` (read only with the switch on)
  let plate = 0;
  const wall: { def: string; k: number }[] = [];
  for (const tile of hits[ri] ?? []) {
    for (const h of tile) {
      const e = effectAt(h.def, starsOf(itemByUid(b, h.uid))).gate;
      if (!e) continue;
      if (ctx) {
        if (e.poison) eq += poisonGain(e.poison, fight, time);
        if (e.plate) plate += e.plate;
        const r = e.reads;
        if (r && r.count === "ownPlate" && r.give === "dmg") wall.push({ def: h.def, k: readValue(r, 1) });
        else if (r) {
          const v = readValue(r, readerCount(b, h.def, r.count, ctx));
          if (r.give === "dmg") eq += v;
          else if (r.give === "plate") { repair += v; plate += v; }
          else { repair += v; heal += v; }
        }
      }
      // Y6 (release Y; DESIGN-Y 4.1): VENOM DRIP holds burnPlus in place of its poison (STAR_EQ's note)
      if (e.burnPlus) eq += burnPlusGain(e.burnPlus, burn);
      if (e.fray) eq += EQ.fray * e.fray;
      if (e.staticTime) eq += EQ.static * e.staticTime;
      // Y2 (release Y): LODESTONE by your STUN pieces (STAR_EQ.perStun)
      if (e.perStalled) eq += STAR_EQ.perStun * stunSources(b) * e.perStalled.each;
      // POWDER KEG. Y5 (release Y; DESIGN-Y row 46): it blasts at every multiple of its fuse, with no BURN (kegGain;
      // battle.ts kegTick). CAND-A's one blast, `fuse` s into the fight, is kegGain's first term
      if (e.keg) eq += kegGain(e.keg, fight, time);
      // Y3 (release Y; DESIGN-Y row 29): it charges the next rig whatever it is, so it is worth its EQ only when that rig
      // has something to double (chargeGains)
      if (e.overclockCooldown) eq += chargeGains(b, hits[ri] ?? [], h) ? EQ.overclock / e.overclockCooldown : 0;
      if (e.toll) eq += EQ.toll * e.toll * STAR_EQ.tollFactory; // Y2: its factory from ★1
      if (e.sift) eq += EQ.sift;
      if (e.heal) repair += e.heal; // SUS-A (REQ-BFG-069): RIVETER's heal (was repair), rated as before (the valuation is SUS-C's)
      if (e.heal) heal += e.heal; // BOTS-X (SUS-C): with the switch on, rateDeck values it as effective hull instead
      // 0.8.0 P1, wave 3 (D1's proxies, tools/wave3.ts): plating per payload rated as RIVETER's repair; SHIELD WALL's
      // damage at 12+ plating for half the fight; BRACE FRAME as a guard like TOLLBOOTH's (1, 1.4, 1.7 at its stars)
      if (e.plate) repair += e.plate;
      // PLAIN-1 (REQ-BFG-084, BRIEF-PLAIN1 P5): the plain stat rigs' two stats the walk's flat terms leave out. SCALE GUARD's
      // slug PLATE lands once a payload, at the gun, so it is rated as PLATE ROLLER's (the line above); SPARK GAP's STUN
      // seconds at the shock's own price a second (EQ.shock is a slug's DISRUPT_TIME stall: STUN_SEC_EQ). Its DMG is the
      // walk's flat; BALLAST's max hull is rateDeck's (ballastHull). No other rig holds either field
      if (e.slugPlate) repair += e.slugPlate;
      if (e.stun) eq += STUN_SEC_EQ * e.stun;
      // Y7b1 (release Y; ruling Y7A-R3d): IRON WALL keeps its 0.9.2 def (its own plating, `plate` above, is back), so its
      // bonus is rated as at 0.9.2. Y5's rule (DESIGN-Y row 45: no plating of its own, so the bonus counted only on a deck
      // that plates its hull, platedDeck) left with its deleted row
      if (e.plated) eq += e.plated.flat * 0.5;
      // Y2 (release Y): BRACE FRAME guards its arrows' tiles only (braceShare)
      if (e.brace) eq += ((EQ.toll * (1 - e.brace.mul)) / 0.25) * braceShare(h.def);
    }
  }
  return { eq, repair, heal, plate, wall };
}

/** PLAIN-1 (REQ-BFG-084, P3/P5): the max hull a deck's working BALLASTs add to the rating's hull (the hero's hull +
 *  hullBonus): each BALLAST with an arrow on a belt tile (rigHits: the IDLE rule) adds its whole %, the %s summed, rounded
 *  down, as Battle.makeSide adds it to the battle's. 0 without one (every deck while PLAIN_RIGS is off). */
export function ballastHull(b: Build, hits: RigHit[][][] = rigHits(b)): number {
  let pct = 0;
  for (const p of b.items) {
    const n = ITEMS[p.def]?.gate?.maxHullPct ? effectAt(p.def, starsOf(p)).gate?.maxHullPct ?? 0 : 0;
    if (n && hits.some((r) => r.some((t) => t.some((h) => h.uid === p.uid)))) pct += n;
  }
  return pct > 0 ? Math.floor(((HEROES[b.hero].hull + b.hullBonus) * pct) / 100) : 0;
}

/** 0.8.0 P1: the plating a plated deck's hull holds on average in a fight (ANVIL BREECH): P1 set half the cap (12) for
 *  every deck. 0.8.0 B1 M2 (oracle fda49d0c97fac446) measured it by hero (output-B1/kit/probes/platemean.test.ts: each
 *  hero's par decks that plate, against the FURNACE par field, days 3-9, shot-weighted; tests/fixtures/b1-platemean.json):
 *  every hit spends plating, so a BASTION's hull holds about 1.4 when its guns fire, a plating FURNACE, WEAVER or FOUNDRY
 *  deck far less. MEAN_PLATE_OTHER: the heroes with no par field (METRONOME, SIPHON), FURNACE's. */
export const MEAN_PLATE: Readonly<Partial<Record<HeroId, number>>> = { bastion: 15, furnace: 5, weaver: 2, foundry: 6 };
export const MEAN_PLATE_OTHER = 5;
/** The plating a plated deck of `hero` holds on average when its guns fire (MEAN_PLATE). */
export const meanPlate = (hero: HeroId): number => MEAN_PLATE[hero] ?? MEAN_PLATE_OTHER;
/** 0.8.0 B1 M2 (measured as MEAN_PLATE): the share of a plated deck's shots fired while its hull holds plating, STEAM
 *  BREECH's plated cadence (BASTION 37-47%; other plating decks 30-39%). */
export const PLATED_SHARE = 0.4;
/** 0.8.0 B1 M2 (N1's m4/breaker.md: 39-51% of THANE KARSK's PLATE BREAKER blows took a plating): the share of PLATE
 *  BREAKER's blows on a plated deck that pay its big number; the rest pay its floor (G1's F1). */
export const BREAKER_SHARE = 0.45;

/** 0.8.0 P1 (E2, TWIN TRIGGER): the share of a turret's loads that pair: 1 with two feeds of one rate whose first loads
 *  land within the sync window (equal belts from factories that stamp together), or a FOUNDRY's blanks (fusions are
 *  pairs); else 0. A rating's estimate, read only for a turret with TWIN TRIGGER. */
function pairShare(b: Build, fs: readonly Feed[]): number {
  if (fs.some((f) => { const r = b.routes[f.route], p = itemByUid(b, r.factory); return p && ITEMS[p.def]?.factory?.ammo === "blank"; }) && fs.length >= 2) return 1;
  for (let i = 0; i < fs.length; i++) for (let j = i + 1; j < fs.length; j++) {
    if (Math.abs(fs[i].first - fs[j].first) <= 0.25 && Math.abs(fs[i].arrival - fs[j].arrival) < 1e-9) return 1;
  }
  return 0;
}

/**
 * bb-0.8.3 (REQ-BFG-042 D4): the rating's share of a factory's casts that send a payload down each of its `belts` belts. A
 * TWIN MOULD (FactorySpec.twin) pours onto each of up to `pour` belts at once, and onto more takes `pour` of them in turn
 * (rule R): pour / belts each. Any other factory: 1 / belts, a stamp feeding its belts in turn. The CRUCIBLE keeps 0.8.0's
 * rating: one load a cycle over its belts, as a pour of its 2 blanks into one gun fuses into one load (rule R keeps that
 * at 3 belts: 2 blanks a cycle). A MIMIC FORGE is rated by its own spec (plain ammo, no twin): its belts in turn.
 */
export function beltShare(spec: FactorySpec, belts: number): number {
  const n = Math.max(1, belts);
  return spec.twin ? Math.min(1, (spec.pour ?? n) / n) : 1 / n;
}

/** 0.8.0 I1 M4 (VERIFIED-P1 H4): what rateDeck can hand back besides its rating (the inspector's capped-stoke line). */
export interface RateOut {
  /** Factory uid -> the share of its stoke the STOKER cap lets through (below 1 only where a gun it feeds can't take the
   *  full stoke; the least over its guns). Absent: not capped. */
  stokeKeep: Map<number, number>;
  /** BOTS-X (read only; filled when present): route index -> the payloads a second it delivers (after joins), for the
   *  bots' RIVETER placement (the belt with the most payloads a second). */
  arrival?: Map<number, number>;
  /** BOTS-X (read only; filled when present): turret slot -> its rated damage a second, for the bots' sustain gear
   *  placement (a turret that doesn't need damage gear). */
  turretDmg?: Map<number, number>;
  /** BOTS-X: the deck's sustain as effective hull (set only when rateDeck values it: a `day` and the switch on). */
  sustain?: SustainHull;
}

/** 0.8.0 I1 M4 (VERIFIED-P1 H4): each STOKER-worked factory whose stoke the static estimate caps by its gun (rateDeck's
 *  STOKER cap, as Battle.stokedPace), with the share of the stoke it keeps. Read only; the rating is unchanged. */
export function stokeKeep(b: Build): Map<number, number> {
  const out: RateOut = { stokeKeep: new Map() };
  rateDeck(b, RATING_CURVE, FIGHT_T, out);
  return out.stokeKeep;
}

export interface DeckRating {
  offense: number; // damage-equivalent per second that lands in a FIGHT_T fight
  defense: number; // hull, plus what RIVETERs repair in half a fight
  value: number; // offense x defense: in a duel of steady damage, the side with the larger product wins
}

/**
 * What a player reads off the build screen, as one number. Per connected route: the walk's damage per payload
 * (deck.ts walkRoute, the inspector's DMG, BURN, SHOCK and TIME: Burn stacks count BURN_TIME each), plus EQ for the
 * effects the walk leaves out, times payloads per second (copies x batch / (the factory's interval x its routes,
 * which it feeds by turns)). Per turret: the payloads it can fire per second (perShot / interval, with E1's 0.72 s
 * FURNACE breech from an 8-tile belt, CALIBRATION and a core's cadence) cap the payloads that arrive (a backlog
 * jams: 85%), FINISHER RAM and LONGCASE add their share, gear and cores the rating can't compute add NOMINAL; the
 * whole is weighed by the share of the fight left after the first payload arrives (CAND-A: per belt, below).
 * 0.6.2 CAND-A: the TURRET SLOTS as the battle fights them (deck.ts installedTurrets: a bought or replaced turret at
 * its stars, the extra slot's turret, every gear slot), E1's long belt on whatever turret it feeds (fireInterval x
 * FURNACE_LONG_BELT) counting a joining belt's whole journey (J14 (a)), and belt JOINS: a joining belt's walk goes on
 * through its main belt's rigs (walkRoute), its payloads load at the main belt's turret, and they enter the main belt
 * only into its gaps (J5: the main belt has right of way), so a main belt's join carries at most BELT_SPEED x its
 * speed there / AMMO_SPACING payloads a second, its own first.
 * CAND-A (the skill-ladder fix): each belt's damage is weighed by the share of the fight left after ITS first payload
 * arrives, not the turret's earliest belt's: with joins a turret takes several belts, and a long joined journey (its
 * ride bonus and the main belt's rigs make its payloads the heaviest) was counted from the shortest belt's first
 * arrival, though in a short fight it lands late or never. With one belt per turret this is the rule as before.
 * `fight`: the fight's length in seconds, FIGHT_T by default; the par player passes its day's (fightTime), so damage
 * is weighed by the share of that day's fight left after each first payload arrives, and RIVETER repairs half of it.
 * 0.6.2 TUNE-M, RULE JOIN PACE: a factory one of whose belts joins another belt makes its loads at JOIN_PACE of its rate
 * (deck.ts factoryPace), on every belt it feeds; a deck without joins rates exactly as before (x 1). JOINS-1
 * (REQ-BFG-091): with FREE_JOINS on factoryPace is 1 for every factory, so a joined factory rates at its full rate.
 */
// 0.8.0 B1 M2: `breakerShare` (BREAKER_SHARE by default) lets a test read the rating's PLATE BREAKER term at other shares
// BOTS-X (SUS-C, REQ-BFG-069; SUSTAIN-1 4.8 rule 2): `day` (the par player's, player.ts rateOn) with the sustain switch on
// (content.ts sustainLive) adds the deck's sustain to its defense as EFFECTIVE HULL against the day's expected foe
// (SUSTAIN_FOE): HEAL and REGEN, the healing in the first min(25 s, the foe's fight) halved against a foe that carries BURN
// (x (1 - burn / 2), the day's BURN share), and SHIELD, the SHIELDs gained over the foe's fight x the foe's mean hit; RIVETER's
// heal moves out of the half-fight repair into that HEAL, and WARD BELL and MENDING LOOM take no NOMINAL credit. Without a
// day, or with the switch off, every rating is exactly as before
export function rateDeck(b: Build, model: Readonly<RatingModel> = RATING_CURVE, fight = FIGHT_T, out?: RateOut, breakerShare = BREAKER_SHARE, day?: number): DeckRating {
  const h = HEROES[b.hero];
  const hits = rigHits(b), claims = connectorClaims(b), occ = occupancy(b);
  const outs = new Map<number, number>(), pace = new Map<number, number>();
  for (const r of b.routes) outs.set(r.factory, (outs.get(r.factory) ?? 0) + 1);
  for (const uid of outs.keys()) pace.set(uid, factoryPace(b, uid, occ));
  const feeds = new Map<number, Feed[]>(), longest = new Map<number, number>();
  const extras: number[] = [];
  // BOTS-X: the expected foe when the sustain value applies (else undefined: nothing below reads it); MEND PRESS heal a
  // second; RIVETER's heal per payload by route
  const foe = day !== undefined && sustainLive() ? foeOn(day) : undefined;
  let mend = 0;
  const heals: number[] = [];
  // 0.8.0 P1 (E3): each factory's stoke from the STOKERs aimed at it (empty without one: every rate as before)
  const stoke = new Map<number, number>();
  for (const sh of stokeHits(b)) {
    const g = itemByUid(b, sh.uid);
    stoke.set(sh.factory, (stoke.get(sh.factory) ?? 0) + (g ? effectAt(g.def, starsOf(g)).gate?.stoke ?? 0 : 0));
  }
  let plating = 0; // 0.8.0 P1: ARMOR PRESS plating a second, rated as repair
  // SCALE-2d (REQ-BFG-098; BRIEF-SCALE2d D1): with SCALE_RIGS on, the counts' context (scaleRating.ts readCtx: the day, does
  // the deck carry BURN, its VENOM DRIPs' POISON, its WARD BELLs' SHIELD a second), from each connected belt's walk, kept
  // for the loop below. Off: no ctx, no walks kept; the loop walks each belt as before
  const walks = new Map<number, RouteWalk>();
  let ctx: ReadCtx | undefined;
  const platePer: number[] = [], walls: { ri: number; def: string; k: number }[] = [];
  if (scaleRules()) {
    let burnAny = b.mods.some((m) => ITEMS[m.def]?.kind === "core" && effectAt(m.def, starsOf(m)).core?.routine === "drake");
    b.routes.forEach((_, ri) => {
      const info = routeInfo(b, ri, claims, occ, hits);
      if (!info.connected || info.turret < 0) return;
      const w = walkRoute(b, ri, hits);
      walks.set(ri, w);
      if (w.estimate.burn > 0) burnAny = true;
    });
    ctx = readCtx(b, day ?? READ_DAY_DEFAULT, burnAny);
  }
  b.routes.forEach((r, ri) => {
    const info = routeInfo(b, ri, claims, occ, hits);
    if (!info.connected || info.turret < 0) return;
    const f = itemByUid(b, r.factory);
    const spec = f && ITEMS[f.def]?.kind === "factory" ? effectAt(f.def, gradeOf(b, f)).factory : undefined; // bb-0.8.3: grade
    if (!f || !spec) return;
    const interval = secPer(factorySpeed(f.def, spec, b.hero)); // NUM-2: 30 / its whole speed (MIMIC: x its rate %)
    const walk = walks.get(ri) ?? walkRoute(b, ri, hits), est = walk.estimate;
    // 0.8.0 B1 M2 (G1's F1): on a deck that plates its hull the walk counts PLATE BREAKER's big number, which battles pay
    // only on BREAKER_SHARE of its blows: the rating reads floor + BREAKER_SHARE x (big - floor)
    const low = walk.timeline.some((row) => row.hits.some((th) => th.breaker)) && platedDeck(b)
      ? walkRoute(b, ri, hits, { unplated: true }).estimate : undefined;
    const dmg = low ? low.dmg + breakerShare * (est.dmg - low.dmg) : est.dmg;
    const x = hitExtras(b, hits, ri, fight, est.time, est.burn, ctx); // Y6: est.burn, read only by a VENOM DRIP; SCALE-2d: ctx
    if (ctx) { platePer[ri] = x.plate; for (const w of x.wall) walls.push({ ri, ...w }); } // SCALE-2d: IRON WALL's count, below
    // 0.8.0 P1: a TWIN MOULD casts onto each of its belts at once (each belt a slug a cast, as a CRUCIBLE pours); a stoked
    // factory works x (1 + stoke); an ARMOR PRESS with a belt to a turret plates every `every` s (counted once).
    // bb-0.8.3 (REQ-BFG-042 D4): beltShare, the pour size included
    const shared = 1 / beltShare(spec, outs.get(r.factory) ?? 1);
    const stoked = stoke.size ? 1 + (stoke.get(r.factory) ?? 0) : 1;
    if (spec.plate && b.routes.findIndex((q, qi) => q.factory === r.factory && routeInfo(b, qi, claims, occ, hits).connected) === ri) {
      plating += (spec.plate.amount * stoked * (pace.get(r.factory) ?? 1)) / spec.plate.every;
    }
    // BOTS-X: a MEND PRESS with a belt to a turret heals every `every` s at its pace (ARMOR PRESS's rule), counted once
    if (foe && spec.heal && b.routes.findIndex((q, qi) => q.factory === r.factory && routeInfo(b, qi, claims, occ, hits).connected) === ri) {
      mend += (spec.heal.amount * stoked * (pace.get(r.factory) ?? 1)) / spec.heal.every;
    }
    const arrival = (est.copies * (spec.batch ?? 1) * (pace.get(r.factory) ?? 1) * stoked) / (Math.max(0.1, interval) * shared);
    const eq = dmg + (spec.scrapFlat ?? 0) + BURN_TIME * BURN_DPS * est.burn + (est.shock ? EQ.shock : 0) + x.eq + (spec.round ? ROUND_EQ[spec.round.kind] ?? 0 : 0) + // NUM-1: BURN_DPS
      (spec.round?.kind === "limpet" ? AMMO.limpet.base : 0); // Y2: LIMPET's 20 on impact is in its blast now
    const list = feeds.get(info.turret) ?? [];
    list.push({ route: ri, arrival, eq, first: est.time, ride: est.ride, ...(stoked > 1 ? { factory: r.factory, base: arrival / stoked } : stoke.size ? { factory: r.factory } : {}),
      ...(est.flat !== undefined ? { flat: est.flat } : {}) }); // Y4: the walk's flat
    feeds.set(info.turret, list);
    const tiles = info.join ? journeyTiles(b, ri, occ) : r.cells.length; // E1 (battle.ts makeTurret): its journey
    longest.set(info.turret, Math.max(longest.get(info.turret) ?? 0, tiles));
    extras[ri] = foe ? x.repair - x.heal : x.repair; // BOTS-X: with the sustain value, RIVETER's heal is HEAL (below)
    if (foe) heals[ri] = x.heal;
  });
  // J5: a main belt takes its joiners' payloads into its gaps, its own first; along the belt, joiners in tile order
  // (ties: the battle's order, the lower last-cell key first). A joiner gets what is left of the belt's flow at its join
  // tile, BELT_SPEED x the speed there / AMMO_SPACING payloads a second. (A chain's upstream joiners are not carried on.)
  const byRoute = new Map<number, Feed>();
  for (const list of feeds.values()) for (const f of list) byRoute.set(f.route, f);
  const byMain = new Map<number, { i: number; tile: number; last: number }[]>();
  b.routes.forEach((r, i) => {
    if (r.join === undefined || !byRoute.has(i)) return;
    const link = joinOf(b, i, occ);
    if (!link) return;
    const list = byMain.get(link.route) ?? [];
    list.push({ i, tile: link.tile, last: r.cells[r.cells.length - 1] });
    byMain.set(link.route, list);
  });
  for (const [m, list] of byMain) {
    list.sort((x, y) => x.tile - y.tile || x.last - y.last);
    let flow = byRoute.get(m)?.arrival ?? 0;
    for (const j of list) {
      const f = byRoute.get(j.i)!;
      const room = (BELT_SPEED * beltStateAt(b, m, j.tile, hits).speed) / AMMO_SPACING - flow;
      f.arrival = Math.max(0, Math.min(f.arrival, room));
      flow += f.arrival;
    }
  }
  // SCALE-2d (REQ-BFG-098; BRIEF-SCALE2d D1): with SCALE_RIGS on, the deck's PLATE gained in a fight (each belt's PLATE a
  // payload x its payloads a second, plus ARMOR PRESS's plating a second, x the fight) sets the PLATE an IRON WALL counts
  // (scaleRating.ts readerCount "ownPlate"); its DMG then joins its belt's payloads, as every rig's EQ does
  if (ctx) {
    let rate = plating;
    for (const [ri, f] of byRoute) rate += f.arrival * (platePer[ri] ?? 0);
    ctx.plateFight = rate * fight;
    for (const w of walls) { const f = byRoute.get(w.ri); if (f) f.eq += w.k * readerCount(b, w.def, "ownPlate", ctx); }
  }
  let repair = 0;
  b.routes.forEach((_, ri) => { const f = byRoute.get(ri); if (f) repair += f.arrival * (extras[ri] ?? 0); });
  if (out?.arrival) for (const [ri, f] of byRoute) out.arrival.set(ri, f.arrival); // BOTS-X: read only
  let rivet = 0; // BOTS-X: RIVETER's heal a second (the switch on)
  if (foe) b.routes.forEach((_, ri) => { const f = byRoute.get(ri); if (f) rivet += f.arrival * (heals[ri] ?? 0); });
  let offense = 0;
  for (const s of installedTurrets(b)) {
    const t = s.slot, td = s.td, fs = (feeds.get(t) ?? []).filter((f) => f.arrival > 0);
    if (!fs.length) continue;
    const g = gearStats(b, t), core = resolveCore(b, t, td);
    // battle.ts makeTurret: E1's long belt scales whatever turret it feeds, at that turret's stars
    // NUM-2 (REQ-BFG-047): as makeTurret, the speed x each whole rate % (gear, E1's long belt, ROTARY), rounded half up once
    const raw = td.speed * g.speedMul * (b.hero === "furnace" && (longest.get(t) ?? 0) >= 8 ? rateMul(FURNACE_LONG_BELT) : 1) * rateMul(core.spec.fireRate);
    const at = (x: number): number => secPer(Math.max(1, roundHalfUp(x))); // 30 / the whole speed
    let interval = at(raw);
    // 0.8.0 P1: STEAM BREECH fires at its plated rate on a deck that plates its hull, else at its bare one (cores.ts). 0.8.0
    // B1 M2: a plated deck fires at the plated rate only on PLATED_SHARE of its shots (its hull holds plating), else bare
    if (core.routine === "steam") {
      const plated = at(raw * rateMul(core.spec.steamPlated)), bare = at(raw * rateMul(core.spec.steamBare)); // NUM-2: cores.ts steamInterval
      interval = platedDeck(b) ? PLATED_SHARE * plated + (1 - PLATED_SHARE) * bare : bare;
    }
    // Y4 (release Y; DESIGN-Y row 36): EXT. CHAMBER's 3/4 loads a shot fire at most the chamber
    const cap = Math.min(g.perShot, td.window + g.window) / interval;
    // 0.8.0 P1 (STOKER's cap, as Battle.stokedPace): a stoke never feeds a turret past its pace (SHARED_HEADROOM of it
    // kept free when several factories share it); the stoked feeds give their extra back, never below unstoked
    const stokedFs = fs.filter((f) => f.base !== undefined);
    // Y7b1 (release Y; ruling Y7A-R1): the cap holds, as Battle.stokedPace plays it (Y3 had lifted it, DESIGN-Y row 31);
    // the inspector's stokeKeep line follows
    if (stokedFs.length) {
      const room = cap * (new Set(fs.map((f) => f.factory)).size > 1 ? 1 - SHARED_HEADROOM : 1);
      const total = fs.reduce((s, f) => s + f.arrival, 0), extra = stokedFs.reduce((s, f) => s + f.arrival - f.base!, 0);
      if (total > room && extra > 0) {
        const keep = Math.max(0, extra - (total - room)) / extra;
        for (const f of stokedFs) f.arrival = f.base! + (f.arrival - f.base!) * keep;
        // 0.8.0 I1 M4 (VERIFIED-P1 H4): the inspector reads the cap off this estimate (read only: nothing above changes)
        if (out) for (const f of stokedFs) out.stokeKeep.set(f.factory!, Math.min(out.stokeKeep.get(f.factory!) ?? 1, keep));
      }
    }
    const arrival = fs.reduce((s, f) => s + f.arrival, 0);
    const noJam = g.noJam || !!core.spec.noJam;
    const thr = Math.min(arrival, cap) * firedShare(arrival / cap, noJam, model);
    // what each belt gets through the intake: all of it under the cap; over it, the belts that end at the intake fill
    // it first (a saturated main belt is dense, so its joiners find no gap, J5) and the joiners share what is left
    let flows = fs.map((f) => f.arrival);
    if (arrival > cap && fs.some((f) => b.routes[f.route].join !== undefined)) {
      const own = fs.reduce((s, f) => s + (b.routes[f.route].join === undefined ? f.arrival : 0), 0), joined = arrival - own;
      const so = own > cap ? cap / own : 1, sj = joined > 0 ? Math.max(0, Math.min(1, (cap - own * so) / joined)) : 0;
      flows = fs.map((f) => f.arrival * (b.routes[f.route].join === undefined ? so : sj));
    }
    const inflow = flows.reduce((s, v) => s + v, 0);
    // CAND-A (the skill-ladder fix): each belt counts for the share of the fight left after ITS first payload lands.
    // The turret's first shot waits for its loading window (cores.ts IDENTITY ready: `window` loads, or windowTime
    // after the first load) and flies td.flight; a belt that arrives later joins a turret already firing.
    const start = Math.min(...fs.map((f) => f.first)) + Math.min((core.spec.windowTime ?? WINDOW_TIME) + g.windowTime, (td.window + g.window - 1) / arrival);
    const left = (f: Feed): number => Math.max(0.1, (fight - Math.max(f.first, start) - td.flight) / fight);
    let eq = fs.reduce((s, f, i) => s + flows[i] * f.eq * left(f), 0) / inflow;
    if (g.longRideFlat) eq += g.longRideFlat * fs.reduce((s, f, i) => s + (f.ride >= g.longRideMin ? flows[i] * left(f) : 0), 0) / inflow;
    // 0.8.0 P1: ANVIL BREECH's flat on each shot, and its per-plating damage at MEAN_PLATE on a deck that plates its hull
    if (core.routine === "anvil") eq += (core.spec.anvilFlat ?? 0) + (core.spec.perPlate ?? 0) * (platedDeck(b) ? meanPlate(b.hero) : 0);
    // Y4 (release Y; DESIGN-Y row 40): a DRAKE NOZZLE's BURN for each flatPerBurn of each belt's bonus damage (drakeGain),
    // weighed as the belts' damage is (computed: no NOMINAL below)
    const drake = core.routine === "drake";
    if (drake) eq += fs.reduce((s, f, i) => s + flows[i] * drakeGain(core.spec, f.flat ?? 0) * left(f), 0) / inflow;
    // SCALE-2d (REQ-BFG-098; BRIEF-SCALE2d D1): with SCALE_RIGS on PRESSURE BREECH's perQueued is uncapped (no maxCount), so
    // it is computed, as ANVIL's flat: its class-scaled perQueued (resolveCore) x the slugs it typically reads at a shot
    // (scaleRating.ts readerCount "waiting", fed by SPLITTER or SHOT TOWER), on each load; no NOMINAL below. Off: NOMINAL
    const pressure = !!ctx && core.routine === "pressure" && core.spec.maxCount === undefined;
    if (pressure) eq += (core.spec.perQueued ?? 0) * readerCount(b, core.def, "waiting", ctx!);
    // Y5 (release Y; DESIGN-Y row 42): a CAPACITOR BANK charges past its old 5 s cap (capacitorTail), on top of its NOMINAL
    // credit below
    if (core.routine === "capacitor") {
      const loadTime = (core.spec.windowTime ?? WINDOW_TIME) + g.windowTime;
      eq += capacitorTail(core.spec, 1 / inflow, loadTime, Math.min(...fs.map((f) => f.first)), thr * fight);
    }
    let mult = 1 + (g.finisher ? g.finisher / (td.window + g.window) : 0);
    // 0.8.0 P1: ANVIL and STEAM BREECH are computed above, so they take no NOMINAL credit; TWIN TRIGGER pays its pair
    // bonus on the turret's share of paired loads (pairShare; its shorter load time is in `start`)
    if (core.bought && core.routine !== "anvil" && core.routine !== "steam" && !drake && !pressure) mult *= 1 + NOMINAL * valueOf(core.def, core.stars);
    if (g.pairBonus) mult *= 1 + g.pairBonus * pairShare(b, fs);
    for (const m of b.mods) {
      if (m.turret !== t || ITEMS[m.def]?.kind !== "mod") continue;
      const md = effectAt(m.def, starsOf(m)).mod ?? {};
      if (foe && (md.shield || md.regen)) continue; // BOTS-X: WARD BELL and MENDING LOOM are valued as effective hull (below)
      // SCALE-2d (REQ-BFG-098; BRIEF-SCALE2d D1): with SCALE_RIGS on a gun part's `reads` line (SPALL CATCHER: hits taken, at
      // its gun's shot) is computed at the day's typical count on each load, so it takes no NOMINAL credit
      if (ctx && md.reads) {
        if (md.reads.give === "dmg") eq += readValue(md.reads, readerCount(b, m.def, md.reads.count, ctx));
        continue;
      }
      // TUNE-M T3b (a rating bug): HOPPER's window and window time are modeled above (`start`: the loading window before
      // the first shot; the finisher's split; ★3's noJam in firedShare), so it takes no NOMINAL credit on top. It took
      // +12% / +24% / +48% of the turret's damage at ★1/★2/★3 (0.03 x 4/8/16 g), while its battle lift is negative
      // (flag 3: -2 to -9; its control -12 to -32), so the par player bought it where it costs damage
      // Y4 (release Y; DESIGN-Y row 35): SEAM WELDER plates pairs only: its credit x the turret's share of paired loads
      // (pairShare)
      const seamShare = md.seam ? pairShare(b, fs) : 1;
      // Y5 (release Y; DESIGN-Y row 47): SPALL CATCHER counts a PLATE soak once: on a deck that plates its hull its credit
      // is STAR_EQ.spallPlated of it
      const spallShare = md.spall && platedDeck(b) ? STAR_EQ.spallPlated : 1;
      if (!md.fireRate && !md.perShot && !md.finisher && !md.longRideFlat && !md.window && !md.windowTime && !md.store) mult *= 1 + NOMINAL * valueOf(m.def, starsOf(m)) * seamShare * spallShare;
    }
    // The overfeed (ruling Y7B1-Q4; it rides with the next rules bump and its regeneration): fed past its rate, a gun's
    // queue grows (arrival - cap) loads a second; once JAM_THRESHOLD of them wait at its busy chamber it skips a shot
    // (battle.ts turret loop), at most one every JAM_COOLDOWN s, for the rest of the fight. So from the queue's fill (its
    // first shot + JAM_THRESHOLD / (arrival - cap)) it fires (1 - interval / JAM_COOLDOWN) of its shots. firedShare's
    // curve stands for the loading window and the stalls; a noJam gun never jams.
    const fill = arrival > cap && !noJam ? start + JAM_THRESHOLD / (arrival - cap) : Infinity;
    const jamKeep = 1 - (Math.min(1, interval / JAM_COOLDOWN) * Math.max(0, fight - fill)) / fight;
    offense += thr * eq * mult * jamKeep;
    out?.turretDmg?.set(t, thr * eq * mult * jamKeep); // BOTS-X: read only
  }
  // 0.8.0 P1: ARMOR PRESS plating a second joins the repair rate (half a fight's worth, as RIVETER's)
  let defense = h.hull + b.hullBonus + (repair + plating) * fight * 0.5;
  // PLAIN-1 (REQ-BFG-084, BRIEF-PLAIN1 P5): BALLAST's max hull %, as Battle.makeSide adds it (the working ones' %s summed, of
  // the rating's hull, rounded down). The rating's hull term had no share in it, so a max-hull % was worth nothing
  defense += ballastHull(b, hits);
  if (foe) {
    // BOTS-X (SUSTAIN-1 4.8 rule 2): the sustain as effective hull. WARD BELL and MENDING LOOM work on any installed turret,
    // fed or not (a stalled one pauses: not modelled); a WARD BELL's SHIELDs come at every, 2 every, ... up to the fight's end
    const installed = new Set(installedTurrets(b).map((v) => v.slot));
    let shields = 0, regen = 0;
    for (const m of b.mods) {
      if (!installed.has(m.turret) || ITEMS[m.def]?.kind !== "mod") continue;
      const md = effectAt(m.def, starsOf(m)).mod ?? {};
      if (md.shield) shields += Math.floor(foe.fight / md.shield.every + 1e-9) * md.shield.amount;
      if (md.regen) regen += md.regen;
    }
    const heal = Math.min(WIND_START, foe.fight) * (1 - foe.burn / 2); // the seconds that heal, BURN's half expected
    const s: SustainHull = { shield: shields * foe.hit, heal: (mend + rivet) * heal, regen: regen * heal, total: 0 };
    s.total = s.shield + s.heal + s.regen;
    defense += s.total;
    if (out) out.sustain = s;
  }
  return { offense, defense, value: offense * defense };
}
