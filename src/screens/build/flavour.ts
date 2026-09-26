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

import { ITEMS } from "../../sim/content";
import { PENDULUM } from "../../sim/races/data";
import { peakTiles, seconds } from "../../ui/abilityText";

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
  // --- supplies ---
  beltcrate: ["LONGER ROUTES COOK HOTTER PAYLOADS."], // character; "+4 BELT CAPACITY" is the ability text
  plating: [],
};

/**
 * A hero's signature factory has no ability text, so its flavour is its only description: its catalogue desc, except
 * CLOCKWORKS (METRONOME's), whose desc quotes a glued second (races/data.ts is pinned by tests/races.metronome.test.ts,
 * so the UI says it in T2's units).
 */
const SIGNATURE_FLAVOUR: Readonly<Record<string, readonly string[]>> = {
  clockworks: ["STAMPS PENDULUM SLUGS.", `THEY PEAK AFTER ${seconds(PENDULUM.peak)} OF RIDE: ${peakTiles(PENDULUM.peak)} TILES.`],
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
