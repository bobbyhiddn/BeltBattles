// FIELD-1 (REQ-BFG-075): the battle's setting. Eight settings in three media, picked per battle from the battle's own
// seed with a display-only hash: first the medium (a third each), then a setting within it (evenly). The replay plays
// the record's seed, so it shows the battle's setting. Never the sim's PRNG, never Math.random, no sim import: this reads
// a number and returns a name. The still screens (build, customize, event, fork, summary, the hero preview) keep the day's
// sea (motion.ts seaForDay). The title's attract fight walks ATTRACT_SCENES, one per round.

import { SCENE_IDS, type SceneId } from "./motion";

export type { SceneId };
export type Medium = "water" | "ground" | "air";

export const MEDIUM_ORDER: readonly Medium[] = ["water", "ground", "air"];

/** The settings in each medium. WATER's are MOTION-1's seas (CALM SEA renamed OPEN SEA, STORM renamed STORM SEA). */
export const MEDIA: Record<Medium, readonly SceneId[]> = {
  water: ["calm", "storm", "ember"],
  ground: ["forest", "desert", "badlands"],
  air: ["sky", "clouds"],
};

/** Each setting's name, in the game's capitals (docs/TEXT-STYLE.md). */
export const SCENE_NAME: Record<SceneId, string> = {
  calm: "OPEN SEA", storm: "STORM SEA", ember: "EMBER SEA",
  forest: "FOREST", desert: "DESERT", badlands: "BADLANDS",
  sky: "SKY", clouds: "STORM CLOUDS",
};

export function mediumOf(s: SceneId): Medium {
  return s === "calm" || s === "storm" || s === "ember" ? "water" : s === "sky" || s === "clouds" ? "air" : "ground";
}

/** murmur3's 32-bit finaliser: every input bit reaches every output bit (consecutive seeds spread evenly). */
function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** The display hash: a uniform number in [0, 1) from a battle seed and a salt (one salt per draw). */
export function sceneHash(seed: number, salt: number): number {
  return fmix32((fmix32((seed | 0) ^ 0x5ce9e5ed) + Math.imul(salt, 0x9e3779b9)) >>> 0) / 4294967296;
}

/** The setting a battle seed picks: the medium (a third each), then a setting within it (evenly). */
export function sceneForSeed(seed: number): SceneId {
  const medium = MEDIUM_ORDER[Math.min(2, Math.floor(sceneHash(seed, 1) * 3))];
  const list = MEDIA[medium];
  return list[Math.min(list.length - 1, Math.floor(sceneHash(seed, 2) * list.length))];
}

let forced: SceneId | null = null;

/** Tooling only (the page's bb.scene, for shots and videos; nothing in play calls it): every battle and replay from now
 *  on shows `s` (null: back to the pick). */
export function forceScene(s: SceneId | null): void {
  forced = s;
}

export function forcedScene(): SceneId | null {
  return forced;
}

/** A battle's (and its replay's) setting: the seed's pick, or the tooling's forced one. */
export function battleScene(seed: number): SceneId {
  return forced ?? sceneForSeed(seed);
}

/** The title's attract fight, round by round: all three media in the first three rounds (OPEN SEA first: the intro
 *  screen's first battle, REQ-BFG-038's, stays on open water), then the other five. */
export const ATTRACT_SCENES: readonly SceneId[] = ["calm", "desert", "sky", "forest", "clouds", "storm", "badlands", "ember"];

export function attractScene(n: number): SceneId {
  return ATTRACT_SCENES[((n % ATTRACT_SCENES.length) + ATTRACT_SCENES.length) % ATTRACT_SCENES.length];
}

export { SCENE_IDS };
