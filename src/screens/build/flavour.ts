// 0.6.2p (item 1): star-aware flavour. 0.6.2t (REQ-BFG-032, T7): flavour is player text too: whole sentences with T2's
// units and no hand-made line breaks; the panel joins them into one paragraph and the one wrap helper
// (src/ui/richText.ts) breaks it to the panel's width at draw time.
//
// 0.6.2t2 (REQ-BFG-032 F1): the flavour adds something or shows nothing. The ability text (src/ui/abilityText.ts) says
// what a module does, with that star's numbers, so the dim flavour block under it keeps only what those sentences don't
// say: a tip, an interaction, a consequence or a line of character, trimmed to that part. KEPT_FLAVOUR below is that
// curated table. Every other flavour sentence restated the effect or quoted its numbers, so it is gone, and a module with
// nothing kept shows no flavour block (the panel shows only the action hint there). No kept sentence quotes a number, so
// the table is the same at every star. The catalogue descs (src/sim/content.ts) are untouched: a module with ability
// text reads its flavour from this table, never from its desc.
// The guard (tests/abilityPanels.test.ts, over buyableModules() and the supplies): in every panel, no flavour sentence
// quotes a number the ability sentences there quote or repeats one of them. A new module without a KEPT_FLAVOUR row shows
// its catalogue desc joined into one string, so that guard fails if the desc repeats its ability text.
// 0.6.2rel2 (on the 0.6.2 candidate): the 13 buyable turrets (REQ-BFG-031) have rows too, and FB-B's QUENCH TANK, SURGE
// VALVE, HOPPER and MANTLET keep nothing, like the rest of their families: their rules are all in the ability text.

import { ITEMS } from "../../sim/content";

/**
 * The kept flavour of every buyable module and supply, by id: whole sentences (T2's rules, no numbers), the same at every
 * star; [] shows no flavour block. What each keeps, and why the rest went, is in the 0.6.2t2 REPORT.
 */
export const KEPT_FLAVOUR: Readonly<Record<string, readonly string[]>> = {
  // --- factories ---
  press: ["NEEDS A FREE TURRET INTAKE."], // a tip: the rate and the slug are in the ability text
  doublestamp: [], // "QUEUE PRESSURE": its slugs leave one by one as the belt makes room (ability text)
  shottower: [],
  hotswap: [],
  slagpot: [],
  assembly: [],
  gantry: [],
  scrapper: [],
  sabot: ["TELEGRAPHED ROUNDS WRECK RIGS OR STALL OTHER MACHINERY."], // character: the enemy sees them coming
  frostbite: [],
  dragchain: [],
  mimic: [],
  limpet: [],
  // --- rigs ---
  temper: [],
  whetstone: ["BEFORE A SPLITTER, BOTH COPIES GAIN IT."], // an interaction (the split scales it: battle.ts applyHit)
  grease: [],
  brake: [],
  longhaul: [],
  coil: [],
  // "MORE BELT PRESSURE." in the glossary's words: copies back up at a turret's intakes, and 4 backed up there jam it
  // as it fires (battle.ts turret loop, JAM_THRESHOLD)
  splitter: ["ITS COPIES CAN BACK UP AT THE TURRET AND JAM IT."],
  overdrive: [],
  tollbooth: [],
  sifter: [],
  surge: [],
  sorting: [],
  riveter: [],
  heatjacket: [],
  venom: [],
  overclocker: [],
  keg: [],
  bellows: [],
  quench: [],
  staticbrush: [],
  lodestone: [],
  barbed: [],
  counterweight: [],
  // --- turret gear ---
  chamber: [], // "DROP ON A TURRET." is the action hint's job
  calibrate: [],
  flak: [],
  spotter: [],
  hopper: [],
  mantlet: [],
  ram: [],
  escapement: [],
  longcase: [],
  // --- turret cores ---
  scatter: [],
  rotary: [],
  pressure: [],
  gatling: [],
  hullbreaker: [],
  drake: [],
  salvo: [],
  mortar: [],
  grapnel: [],
  tesla: [],
  capacitor: [],
  compound: [],
  lance: [],
  // --- turrets (0.6.2rel2, REQ-BFG-031): the ability text says each one's class, fire rate, chamber, columns, gear
  // slots, core socket and when its shots land, so a turret keeps only a comparison that text can't make. Each claim
  // holds at every star, because every turret's star values scale its fire interval by the same x0.9 and x0.8 and none
  // moves its flight (content.ts; tests/flavour.test.ts checks both claims against the TurretDefs). The old catalogue
  // `reason` lines restate the ability text (columns, loads, gear slots, the 1-star interval) or claim what the sim
  // doesn't bear out (DECK GUN's "fewer loads wait"), so the other eleven keep nothing.
  scrapcannon: [],
  // character: the quickest heavy gun (0.75 s against 0.8-1 s at 1 star) and the slowest shell of any gun (0.65 s)
  rampart: ["A QUICKER HEAVY GUN WITH A SLOWER SHELL."],
  dartgun: [],
  spikegun: [],
  carronade: [],
  swivel: [],
  twinneedle: [],
  // character: at any one star no gun fires as often (0.45 s at 1 star; the next are 0.55 s), but a ★3 DART GUN or
  // TWIN NEEDLE (0.44 s) outpaces a ★1 HAIL GUN, so the claim names the star
  hailgun: ["THE FASTEST GUN, STAR FOR STAR."],
  deckgun: [],
  railgun: [],
  bombard: [],
  siegegun: [],
  thunderer: [],
  // --- supplies ---
  beltcrate: ["LONGER ROUTES COOK HOTTER PAYLOADS."], // character; "+4 BELT CAPACITY" is the ability text
  plating: [],
  // --- wave 3 (0.8.0 P1's WAVE3_FLAVOUR, moved here by I1 M2 when the switch went on): none kept, as FB-B's four keep
  // none; their rules are all in the ability text (src/ui/abilityText.ts)
  plateroller: [],
  twingauge: [],
  pincer: [],
  braceframe: [],
  twinlatch: [],
  stoker: [],
  platebreaker: [],
  shieldwall: [],
  twinmould: [],
  armorpress: [],
  anvil: [],
  steambreech: [],
  twintrigger: [],
  spallcatcher: [],
  seamwelder: [],
};

/**
 * A hero's signature factory has no ability text, so its flavour is its only description: its catalogue desc, except
 * CLOCKWORKS (METRONOME's), whose desc quotes a glued second (races/data.ts is pinned by tests/races.metronome.test.ts,
 * so the UI says it in T2's units). 0.8.0 H1 (REQ-BFG-032): FOUNDRY's CRUCIBLE and BASTION's WARDWORKS have ability text
 * (src/ui/abilityText.ts), so, like a sold module's, their flavour keeps only a tip those sentences don't give, with no
 * number (the 0.6.2t2 F1 rule).
 */
// bb-0.8.3 (REQ-BFG-042 M4): every signature factory has ability text now (it levels up and its caravan sells copies), so
// each keeps only a tip with no number: CLOCKWORKS's peak moved into its ability text; the KILN's tip is FURNACE's breech,
// the LOOM's its lead, the SUMP's its two marks (its catalogue desc).
const SIGNATURE_FLAVOUR: Readonly<Record<string, readonly string[]>> = {
  kiln: ["LONG BELTS HEAT ITS SLUGS, AND A LONG BELT SPEEDS UP THE GUN IT FEEDS."],
  loom: ["IT FEEDS ONE BELT MORE THAN MOST FACTORIES."],
  clockworks: [],
  sump: ["ITS SLUGS DRAG FOR THE LEFT GUN AND ECHO FOR THE RIGHT GUN."],
  crucible: ["MIRROR ITS BELTS, TILE FOR TILE AND RIG FOR RIG, SO ITS BLANKS ARRIVE TOGETHER."],
  wardworks: ["A FULL OR JAMMED CHAMBER STARVES THE PLATING."],
};

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/**
 * A module's flavour at `stars` (on a turret of class factor `k`): its kept sentences (KEPT_FLAVOUR; [] when nothing is
 * kept), else a signature factory's text, else its catalogue desc joined into one string. [] for an unknown id. No kept
 * sentence depends on the star or k today; the panels pass both, so a star-aware row can come back without new plumbing.
 */
export function flavour(def: string, stars = 1, k = 1): string[] {
  if (!own(ITEMS, def)) return [];
  if (own(KEPT_FLAVOUR, def)) return [...KEPT_FLAVOUR[def]];
  if (own(SIGNATURE_FLAVOUR, def)) return [...SIGNATURE_FLAVOUR[def]];
  return [ITEMS[def].desc.join(" ")];
}

/** The flavour as one paragraph (what the panels wrap and draw); "" when there is none. */
export function flavourText(def: string, stars = 1, k = 1): string {
  return flavour(def, stars, k).join(" ");
}
