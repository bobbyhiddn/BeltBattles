// U2c (REQ-BFG-046, REQ-BFG-047; R1 MEMO C4, U3): THE SHOP CARD'S STAT CHIP. Each shop card of a piece with a face shows
// one chip: an icon alone (C2: "shop chips and the board use the icon alone") and one value, read off the face's own data
// (faces.ts faceAt: its keyed rule numbers and its stat pairs, each printed by a formatter), never written again here. The
// pick, in order:
//   1. the rule's keyword with its count, when the face has one: TESLA ARC {STUN}1 (at the hero's k; NUM-3: whole seconds); U2e: or the keyword
//      its own payloads carry, a stat of its second row: HOT SWAP {BURN}2 (was {BURN}+2, its rule's number);
//   2. else the face's first stat pair: DART GUN {RATE}55 (NUM-4: its SPEED; was 0.55{SEC}), SCATTER CHOKE {DMG}40%;
//      NUM-4 (REQ-BFG-047): a gun's or a factory's cadence is its SPEED now, DART GUN {RATE}55 (unsigned: a stat);
//   3. else the rule's first number with its icon: PRESSURE BREECH {DMG}+12 (NUM-1: x10), CHAMBER {SLUG}2; a gun's or a factory's
//      FASTER is the {RATE} icon (C1: WORKS FASTER and FIRE RATE fold into RATE): CALIBRATION {RATE}+33% (U2d F2: the
//      chip rule below; a belt's speed is not RATE).
// A piece without a face (RULES and STUN-fold pieces), or a face with no number that has an icon (ROTARY BREECH ★1, SORTING
// ARM, SPOTTER, BRAKE SHOE, OVERDRIVE, GRAPNEL GUN; U2d F2: GREASE WORKS and OVERCLOCKER under the chip rule), keeps today's
// card. The packs are fixed slots, no rolled cards: no chip.
//
// U2d F2 (cap's answer to U2c question 3): THE CHIP RULE. A chip's icon is the mechanic its number measures:
//   - {RATE} is how often a gun fires or a factory works. A FASTER takes it only where its face key says it measures that
//     (RATE_KEYS: a gun's fire rate, GATLING BREECH's spin, STOKER's stoking), never a belt's speed: GREASE WORKS' "60%
//     FASTER" is its belts' speed, so it has no chip (today's card).
//   - A chip never shows a waiting timer (a rest, a cooldown, a hold, a delay, a pulse's period): a rule's {SEC} number is
//     one of those (OVERCLOCKER's rest: no chip, today's card; LIMPET WORKS' delay; SURGE VALVE's and ARMOR PRESS's
//     period). Only a stat pair's {SEC}, a gun's or a factory's cadence, made a {SEC} chip; NUM-4: a cadence is a {RATE}
//     pair now ({RATE}55, unsigned), so no piece makes a {SEC} chip.

import { KEYWORDS, icons, type IconName } from "../render/font";
import { ITEMS } from "../sim/content";
import type { TextOpts } from "./abilityText";
import { faceAt, hasFace, type Face } from "./faces";
import { scaleRules } from "../sim/scale"; // SCALE-2c (REQ-BFG-098): the 12 readers' phone gists, SCALE_RIGS on only

/** A number as the face prints it (signed, decimal, a percentage). */
const NUM = /[+-]?\d+(?:\.\d+)?%?/;
/** An icon token ({NAME} or {*NAME}). */
const TOKEN = /\{\*?([A-Z]+)\}/;

/** U2d F2: the face keys (faces.ts) whose FASTER measures how often a gun fires or a factory works: the {RATE} chip's. A
 *  belt's speed ("speed": GREASE WORKS, BRAKE SHOE, OVERDRIVE, SURGE VALVE) is none of them. */
export const RATE_KEYS: Readonly<Record<string, string>> = {
  rate: "a gun fires faster (CALIBRATION, ESCAPEMENT)",
  spin: "a gun fires faster as it spins up (GATLING BREECH)",
  stoke: "a factory works faster (STOKER)",
};

/** U2d F2: a rule's number in {SEC} is a waiting timer (a rest, a delay, a period): never a chip. */
const isTimer = (text: string): boolean => text.includes("{SEC}");

/** One chip from a face string ("+2 {*BURN}", "{*STUN} 0.8", "40% EACH" with its stat's icon): the icon then the number
 *  (SEC after its number), in markup; null without a number or an icon. U2d F2: a FASTER is {RATE} only under a RATE_KEYS
 *  key (`key`, the face's key of a rule number). */
function chipFrom(text: string, icon?: IconName, key?: string): string | null {
  const n = NUM.exec(text)?.[0];
  const rate = /FASTER/.test(text) && key !== undefined && key in RATE_KEYS;
  const name = icon ?? (TOKEN.exec(text)?.[1] as IconName | undefined) ?? (rate ? "RATE" : undefined);
  if (!n || !name) return null;
  // a FASTER (a rule's rate bonus) is signed; NUM-4: a stat pair's {RATE}, a gun's or a factory's SPEED, is a stat: unsigned
  const v = name === "RATE" && rate && !n.startsWith("+") ? `+${n}` : n;
  return name === "SEC" ? `${v}{SEC}` : `{${name}}${v}`;
}

/** WORDS-1: a face's keyed rule number as its face printed it (the first number of `key`'s value: "+3", "50%"). */
const numOf = (f: Face, key: string): string => NUM.exec(f.nums.find(([k]) => k === key)?.[1] ?? "")?.[0] ?? "";

/**
 * WORDS-1 (REQ-BFG-081; READ-1 6.3 option 1: the 15 pieces whose phone card showed no chip scored 33% read alone;
 * TEXT-STYLE 9.3 as ruled 2026-10-10): THE PLAIN CHIPS, one for each piece whose face has no number with an icon (or whose
 * number is a belt's speed or a rest), so every buyable piece's phone card says something before a tap. Each fits the
 * card's chip room beside its price (tests/shopChips.test.ts) and can't be read as damage or as another card's number:
 *   - a belt-speed rig, a word: FAST (GREASE WORKS, OVERDRIVE) or SLOW (BRAKE SHOE), never {RATE} or {DMG} (9.3);
 *   - a keyword the piece works on, its icon with a word or with its face's own number: VENOM DRIP {BURN}+3{SEC} (its BURN
 *     lasts 3 s more), BRACE FRAME {STUN}-50% (STUN on its tiles half as long), FLAK SCREEN {STUN}-30% (30% of STUN shots shot
 *     down), TOLLBOOTH {STUN}BLOCK, MANTLET NO{STUN}, TWIN LATCH {PAIR}PAIR, DRAKE NOZZLE {DMG}TO{BURN};
 *   - else a word for its effect: SORTING ARM {SLUG}COPY, OVERCLOCKER TWICE, ROTARY BREECH SOONER, GRAPNEL GUN {SLUG}RIP,
 *     SPOTTER AIM+1 (its face's number).
 * A number here is the face's own (numOf: printed by its formatter), never a literal.
 */
export const PLAIN_CHIPS: Readonly<Record<string, (f: Face) => string>> = {
  venom: (f) => `{BURN}${numOf(f, "plus")}{SEC}`,
  tollbooth: () => "{STUN}BLOCK",
  braceframe: (f) => `{STUN}-${numOf(f, "cut")}`,
  grease: () => "FAST",
  brake: () => "SLOW",
  overdrive: () => "FAST",
  sorting: () => "{SLUG}COPY",
  overclocker: () => "TWICE",
  twinlatch: () => "{PAIR}PAIR",
  drake: () => "{DMG}TO{BURN}",
  rotary: () => "SOONER",
  grapnel: () => "{SLUG}RIP",
  spotter: (f) => `AIM+${numOf(f, "rerolls")}`,
  mantlet: () => "NO{STUN}",
  flak: (f) => `{STUN}-${numOf(f, "intercept")}`,
};

/** The shop card's chip for `def` at ★1 (o: the hero's class factor for a core, the hero for MIMIC FORGE), in markup, or
 *  null (today's card). WORDS-1: a piece the rule gives no chip takes its PLAIN_CHIPS row. */
export function shopChip(def: string, o: TextOpts = {}): string | null {
  if (!hasFace(def) || ITEMS[def]?.kind === "supply") return null;
  const f = faceAt(def, 1, o);
  return f ? chipOn(def, f) : null;
}

/** CARD-5: the chip rule on face `f` of `def` (any star): ruleChip, else its PLAIN_CHIPS row, else null. */
const chipOn = (def: string, f: Face): string | null => ruleChip(f) ?? PLAIN_CHIPS[def]?.(f) ?? null;

/** The chip rule (U2c, U2d F2) on a face at ★1, or null. */
function ruleChip(f: Face): string | null {
  // 1. the rule's keyword with its count
  const kw = f.nums.find(([, v]) => KEYWORDS.some((k) => v.includes(`{*${k}}`) || v.includes(`{${k}}`)));
  if (kw) return chipFrom(kw[1]);
  // U2e step 2 (REQ-BFG-070): or the keyword its own payloads carry, a stat of its second row (HOT SWAP {BURN}2)
  const own = f.stats2?.find(([ic]) => (KEYWORDS as readonly string[]).includes(ic));
  if (own) return chipFrom(String(own[1]), own[0]);
  // 2. the face's first stat pair
  if (f.stats.length) return chipFrom(String(f.stats[0][1]), f.stats[0][0]);
  // 3. the rule's first number with its icon (U2d F2: never a waiting timer; a FASTER only under a RATE_KEYS key)
  for (const [key, v] of f.nums) {
    if (isTimer(v)) continue;
    const c = chipFrom(v, undefined, key);
    if (c) return c;
  }
  return null;
}

/** The chip in glyphs, as the card draws it (icons() alone mode: an icon is its glyph). */
export const shopChipGlyphs = (def: string, o: TextOpts = {}): string | null => {
  const c = shopChip(def, o);
  return c ? icons(c, "alone") : null;
};

/**
 * CARD-3 (REQ-BFG-081, A; READ-2 7.3: a card read alone scored 59% on the phone and 77% on the desk; cores 40% against 87%):
 * THE PHONE CARD'S GIST, for every core and piece of gear and the five rigs whose chip leaves the target open (TOLLBOOTH,
 * SORTING ARM, MANTLET, BRACE FRAME, OVERDRIVE): two rows of the 3x5 face in place of the chip. Row A names the mechanic in
 * words (at most 10 capitals, the card's 40 px; no digit: a number is the face's own), row B keeps the chip (its number, the
 * face's: shopChip) or a word, beside the price (25 px, 19 at a two-digit price: tests/card3.test.ts). Each says what its
 * face and desk line say (faces.ts, abilityText.ts cardText; the REPORT's table gives each sim check). Turrets, factories
 * and the other rigs keep their chips. On the narrow card the art gives up its room for row A (shop.ts drawCard).
 *
 * CARD-5 (REQ-BFG-111, REQ-BFG-081; CARD-5 PREP's GISTS-CARD5.md with REVIEW-CARD5PREP section 4's two changes): the words
 * READ-5's 57 weakest phone cards were given by cold reads of text mock-ups. Every factory now says what it makes, 19 more
 * rigs and the three inner-column turrets take a gist, and TOLLBOOTH, TWIN TRIGGER, WARD BELL, FLAK SCREEN and 11 cores
 * and gear change theirs (SEAM WELDER, ROTARY BREECH, GRAPNEL GUN, SPOTTER and DRAKE NOZZLE keep theirs). A number in a row
 * is its face's own, never typed: numOf(f, key) (a keyed rule number), statOf / stat2Of (the stat row or its second row),
 * or the chip `c` (shopChip's rule on the same face), so it follows the star and the day (HULL_SCALE). Row A may hold a
 * digit only where it is such a face number (13 rows: an EVERY, a HOLD, a batch, a pour, BELT, pellets, a shot). The one
 * literal number is OVERCLOCKER's x2: overclock.ts overclocked() doubles each effect, a rule with no named constant
 * (src/sim stays as it is), pinned at exactly x2 at every star by tests/card5.test.ts. Each row's sim check is in
 * REPORT-CARD5 section 6; tests/card5.test.ts pins each entry by id, its fit at every star and day, and its digits.
 */
export const PHONE_GISTS: Readonly<Record<string, (chip: string, f: Face) => readonly [string, string]>> = {
  // cores
  lance: (c) => ["WHOLE LINE", c], // SHOT: ALSO HITS 1 WHOLE COLUMN, 20% DMG. CARD-5: was + A COLUMN
  mortar: (c) => ["SPLASHES", c], // SHOT: ALSO HITS 1 MORE TARGET FOR 50% DMG
  salvo: (c) => ["FIRES ALL", c], // SHOT: FIRES THE CHAMBER AT +20 DMG EACH. CARD-5: was ALL LOADS
  scatter: (c, f) => [`${numOf(f, "pellets")} PELLETS`, c], // SHOT: BURSTS INTO 3 PELLETS, 40% DMG EACH. CARD-5: was PELLETS
  rotary: (c) => ["PART-FULL", c], // FIRES PART-FULL CHAMBERS 50% SOONER
  pressure: (c) => ["PER {SLUG} HELD", c], // SHOT: +12 DMG FOR EACH SLUG WAITING. CARD-5: was {SLUG}WAITING
  gatling: (c) => ["SPINS UP", c], // SPINS UP TO 67% FASTER (and fires each load as it comes)
  hullbreaker: (c) => ["HULL ONLY", c], // SHOT: HITS ONLY THE HULL, FOR +30% DMG
  drake: () => ["RIG DAMAGE", "TO{BURN}"], // SHOT: EACH 25 DAMAGE RIGS ADDED TO ITS SLUG BECOMES 1 BURN (CARD-5: kept, REVIEW-CARD5PREP 4)
  grapnel: (c) => ["FOE BELTS", c], // SHOT: ON A BELT OR RIG, RIPS 1 SLUG (an enemy's)
  tesla: (c) => ["SHOTS ARC", c], // SHOT: ALSO ARCS TO 1 PART: STUN 1. CARD-5: was ARC STUNS
  // SHOT: +20 DMG FOR EACH SEC IT SAT EMPTY (the chip, /SEC after it). CARD-5: was CHARGES UP. A three-digit number (★2-★3
  // from day 3; a shop offers ★1, which fits every day) drops its + (27 px > the 26 px room; 23 px without it)
  capacitor: (c) => ["EMPTY TIME", `${/\d{3}/.test(c) ? c.replace("+", "") : c}/{SEC}`],
  compound: (c) => ["{SLUG}{SLUG} AS ONE", c], // SHOT: FIRES 2 SLUG AS 1 SHOT AT +15% DMG. CARD-4 (T): was ONE SHELL (PPW)
  anvil: (c) => ["DMG + YOUR", c], // SHOT: +25 DMG, +100% OF YOUR SHIELD (the chip: the SHIELD icon, +100%). CARD-4 (T): was DMG FROM (RPW)
  steambreech: (c) => ["IF {*PLATE}", c], // FIRES 40% FASTER IF YOU HAVE SHIELD
  // gear
  chamber: (_c, f) => [`FIRES ${numOf(f, "shot")}{SLUG}`, "A SHOT"], // EACH SHOT FIRES UP TO 2 SLUG. CARD-5: was PER SHOT / {SLUG}2
  calibrate: (c) => ["FIRE RATE", c], // FIRES 33% FASTER
  escapement: (c) => ["FIRE RATE", c], // FIRES 11% FASTER
  flak: (_c, f) => ["SHOOT DOWN", `{STUN}-${numOf(f, "intercept")}`], // SHOOTS DOWN 25% OF ENEMY STUN SHOTS. CARD-5: was FOE {*STUN} / -25%
  spotter: (c) => ["AIMS AGAIN", c], // SHOTS AIMED AT NO PART AIM AGAIN ONCE. CARD-4 (T): was AT NO PART (WPW: read as wasted shots)
  hopper: (c) => ["GUN HOLDS", c], // ITS CHAMBER HOLDS +1 SLUG. CARD-5: was CHAMBER
  mantlet: (c) => ["ITS GUN", c], // STUN CAN'T STOP ITS GUN OR LAST 1 TILE
  ram: (c) => ["LAST LOAD", c], // SHOT: THE CHAMBER'S LAST SLUG +40% DMG. CARD-5: was LAST {SLUG}
  longcase: (c) => ["LONG RIDES", c], // SHOT: +15 DMG IF ITS SLUG RODE 2s
  twintrigger: (c) => ["PAIRED {SLUG}", c], // PAIR: +30% DMG. CARD-5: was {*PAIR}
  spallcatcher: (c) => ["HURT→SHOT", c], // EVERY 40 DMG YOU TAKE: NEXT SHOT +10 DMG. CARD-5: was HITS TAKEN
  seamwelder: (c) => ["{*PAIR}", c], // PAIR: +10 SHIELD (the chip: the SHIELD icon, +10)
  wardbell: (_c, f) => [`EVERY ${numOf(f, "every")}{SEC}`, "{SHIELD}WARD"], // EVERY 4s: +1 WARD. CARD-5: was OVER TIME / {SHIELD}+1
  mendingloom: (c) => ["YOUR HULL", `${c}/{SEC}`], // YOUR HULL: HEAL 10 EACH SEC (the chip, /SEC after it). CARD-5: was EACH SEC / {HEAL}10
  // the five rigs whose chip leaves the target open (READ-2 7.3 item 2)
  tollbooth: (_c, f) => ["ITS BELT", `${numOf(f, "toll")}{STUN}FAIL`], // THE FIRST 2 STUN ON ITS BELT'S PARTS EACH FIGHT DO NOTHING. CARD-5: was {STUN}BLOCK
  sorting: (c) => ["EACH THIRD", c], // HIT: OF EVERY 3 SLUG, ONE BECOMES 2 (on every belt its arrows reach). CARD-4 (T): was ITS BELTS (PPW)
  braceframe: (c) => ["ITS TILES", c], // FOE STUN ON TILES IT HITS: 50% SHORTER. CARD-4 run 3 (cap's call): READ-4's ITS TILES back (read RRR with images; TILES HIT read PPP in run 2's small read); the face and the desk line keep TILES IT HITS
  overdrive: (c) => ["ITS BELTS", c], // ITS BELTS RUN 3 TIMES AS FAST FROM THESE TILES ON
  // CARD-5: the other rigs READ-5 worked on (GISTS-CARD5 group 2 and 3)
  venom: (_c, f) => ["EXTENDS {BURN}", `${numOf(f, "plus")}{SEC}`], // HIT: ITS BURN LASTS +3s
  bellows: (c) => ["RIDE TIME", c], // HIT: +1 BURN FOR EACH 2s THE SLUG RODE
  quench: (c) => ["SPENDS {BURN}", c], // HIT: EACH BURN ON THE SLUG BECOMES +40 DMG
  staticbrush: () => ["HULL HITS:", "{STUN}A GUN"], // ITS SLUGS THAT HIT BARE HULL STUN A RANDOM ENEMY TURRET 1s
  pincer: (c) => ["PER RIG", c], // HIT: +20 DMG FOR EACH OTHER RIG HITTING THE TILE
  lodestone: (c) => ["PER {STUN}", c], // HIT: +10 DMG FOR EACH ENEMY PART STUNNED
  riveter: (c) => ["PER SLUG", c], // HIT: HEAL YOUR HULL 6 FOR EACH SLUG
  plateroller: (c) => ["PER SLUG", c], // HIT: +15 SHIELD ON YOUR HULL FOR EACH SLUG
  shieldwall: (c) => ["PER SLUG", c], // HIT: +10 SHIELD ON YOUR HULL FOR EACH SLUG (IRON WALL)
  keg: (c, f) => [`EVERY ${numOf(f, "every")}{SEC}`, c], // EVERY 12s: +60 DMG TO SLUGS ON ITS BELTS
  counterweight: (c) => ["PER {BELT} RODE", c], // HIT: +3 DMG FOR EACH BELT TILE THE SLUG RODE
  stoker: (c) => ["AT FACTORY", c], // THE FACTORY ITS ARROWS POINT AT WORKS UP TO 20% FASTER
  platebreaker: (c) => ["YOUR {PLATE}→{DMG}", c], // HIT: SPENDS YOUR SHIELD FOR +40 DMG
  longhaul: (c) => ["PRIOR RIGS", c], // HIT: +10 DMG FOR EACH RIG THE SLUG PASSED
  surge: (c, f) => [`EVERY ${numOf(f, "every")}{SEC}`, c], // EVERY 3s: +10 DMG TO SLUGS ON ITS BELTS
  overclocker: (_c, f) => [`EVERY ${numOf(f, "every")}{SEC}:`, "RIG x2"], // EVERY 4s: THE NEXT RIG DOWN ITS BELT HITS TWICE (x2: overclocked())
  twingauge: (c) => ["BELT=BELT", c], // HIT: +30 DMG IF ITS BELT IS AS LONG AS ANOTHER INTO THE SAME TURRET
  barbed: (c) => ["WEARS HULL", c], // HIT: +1 FRAY
  twinlatch: (c, f) => [`WAITS ${numOf(f, "hold")}{SEC}`, c], // HIT: HOLDS A SLUG UP TO 1s TO MAKE A PAIR
  // CARD-5: the factories (GISTS-CARD5 group 1): what each makes
  frostbite: (_c, f) => ["MAKES {STUN}{SLUG}", `{STUN}${stat2Of(f, "STUN")}{SEC}`], // its rounds STUN the part they hit 2s
  shottower: (c, f) => [`MAKES ${stat2Of(f, "SLUG")}{SLUG}`, c], // a batch of 3 slugs
  press: (c) => ["MAKES {SLUG}", c], // plain slugs (STAMP PRESS)
  doublestamp: (c, f) => [`MAKES ${stat2Of(f, "SLUG")}{SLUG}`, c], // a batch of 2 slugs
  slagpot: (c) => ["HEAVY {SLUG}", c], // slag slugs, 70 DMG
  assembly: () => ["RIGS START", "SOONER"], // YOUR RIGS START 50% SOONER (ASSEMBLY LINE)
  armorpress: (c, f) => [`EVERY ${numOf(f, "every")}{SEC}`, c], // FEEDS A GUN: EVERY 3s: +30 SHIELD
  mendpress: (c, f) => [`EVERY ${numOf(f, "every")}{SEC}`, c], // FEEDS A GUN: EVERY 3s: HEAL 20
  hotswap: (_c, f) => ["MAKES {BURN}/{STUN}", `{BURN}${stat2Of(f, "BURN")} {STUN}${stat2Of(f, "STUN")}`], // ALTERNATES BURN AND STUN SLUGS
  sabot: (c) => ["KILLS RIGS", c], // ITS ROUNDS WRECK A RIG FOR THE FIGHT; ANY OTHER PART: STUN 4
  scrapper: () => ["MAKES +{DMG}{SLUG}", "+{SLUG}PER{STUN}"], // SCRAP SLUGS; EACH STUN YOU LAND: 1 EXTRA SLUG
  dragchain: (_c, f) => ["MAKES {STUN}{SLUG}", `{STUN}${stat2Of(f, "STUN")}{SEC}`], // its rounds STUN the part they hit 1s
  limpet: (_c, f) => ["BOMB {SLUG}", `${numOf(f, "delay")}{SEC}FUSE`], // ITS SLUGS BLAST THE FOE'S HULL 3s AFTER A HIT (REVIEW-CARD5PREP 4: B)
  gantry: (c, f) => [`${statOf(f, "BELT")} BELTS`, c], // FEEDS 4 BELTS IN TURN
  twinmould: (_c, f) => [`${stat2Of(f, "SLUG")} BELTS`, "{SLUG}EACH"], // CASTS ITS 2 SLUG ONTO SEPARATE BELTS AT ONCE
  // CARD-5: the inner-column turrets (GISTS-CARD5 group 5)
  dartgun: (c) => ["ONE INTAKE", c],
  spikegun: (c) => ["ONE INTAKE", c],
  hailgun: (c) => ["ONE INTAKE", c],
};

/** CARD-5: a stat's number as the face's stat row prints it (GANTRY PRESS's BELT 4), or "". */
const statOf = (f: Face, icon: IconName): string => String(f.stats.find(([ic]) => ic === icon)?.[1] ?? "");
/** CARD-5: a stat's number as the face's second stat row prints it (a batch's or a pour's SLUG, HOT SWAP's BURN), or "". */
const stat2Of = (f: Face, icon: IconName): string => String(f.stats2?.find(([ic]) => ic === icon)?.[1] ?? "");

/**
 * SCALE-2c (REQ-BFG-098, REQ-BFG-081; BRIEF-SCALE2c section 3): the 12 scaling pieces' phone gists, read before
 * PHONE_GISTS only while SCALE_RIGS is on (phoneGist), so with it off every row (tests/card5.test.ts's pins) is CARD-5's.
 * Row A says what the piece counts, in words (at most 39 px of 3x5, no digit: IRON WALL's per 10 is its face's, not row
 * A's); row B is the chip, the face's own number (shopChip's rule on the reader face: {DMG}+3, {PLATE}+2, {HEAL}4).
 */
export const SCALE_GISTS: Readonly<Record<string, (chip: string, f: Face) => readonly [string, string]>> = {
  quench: (c) => ["PER FOE {BURN}", c], // KINDLING: HIT: +3 DMG FOR EACH BURN ON THE FOE
  pressure: (c) => ["PER {SLUG} HELD", c], // SHOT: +12 DMG FOR EACH SLUG WAITING (MAX 5 dropped; CARD-5's words)
  shieldwall: (c) => ["YOUR {PLATE}", c], // IRON WALL: HIT: +5 DMG FOR EACH 10 SHIELD YOU HAVE
  spallcatcher: (c) => ["HITS TAKEN", c], // SHOT: +3 DMG FOR EACH HIT ON YOU
  keg: (c) => ["ITS HITS", c], // POWDER KEG: HIT: +3 DMG FOR EACH OF ITS HITS
  cindermail: (c) => ["PER FOE {BURN}", c], // HIT: +2 SHIELD FOR EACH BURN ON THE FOE
  rotgauge: (c) => ["PER FOE {POISON}", c], // HIT: +3 DMG FOR EACH POISON ON THE FOE
  leechcoil: (c) => ["PER FOE {POISON}", c], // HIT: HEAL 4 TIMES THE FOE'S POISON
  crowdpress: (c) => ["{SLUG} ON BELT", c], // HIT: +3 DMG FOR EACH SLUG ON ITS BELT
  aegisspike: (c) => ["YOUR {SHIELD}", c], // HIT: +40 DMG FOR EACH WARD YOU HAVE
  grudgerod: (c) => ["{HULL} LOST", c], // HIT: +6 DMG FOR EACH HEART LOST (the run bar's heart)
  trophychain: (c) => ["PER WIN", c], // HIT: +8 DMG FOR EACH WIN
};

/** CARD-3 (A): the phone card's gist for `def` (rows A and B, in markup), or null (the card keeps its chip). CARD-5: at
 *  `stars` (the shop's offers are ★1; tests read ★2 and ★3 too), every number from the face at that star and o.day. */
export function phoneGist(def: string, o: TextOpts = {}, stars = 1): readonly [string, string] | null {
  const g: ((chip: string, f: Face) => readonly [string, string]) | undefined =
    scaleRules() && Object.prototype.hasOwnProperty.call(SCALE_GISTS, def) ? SCALE_GISTS[def] : PHONE_GISTS[def]; // SCALE-2c
  if (!g || !hasFace(def) || ITEMS[def]?.kind === "supply") return null;
  const f = faceAt(def, stars, o), c = f ? chipOn(def, f) : null;
  return f && c ? g(c, f) : null;
}
