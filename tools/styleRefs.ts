// CUSTOM-2b (REQ-BFG-072): the references of scripts/stylecheck.mjs, the readability test's rendered half. The catalogue
// (src/render/styles.ts) and the metric with its thresholds (src/render/styleContrast.ts: contrast, THRESHOLDS,
// keywordMin, floorTones, KEYWORD_COLOURS), exactly as the logic half (tests/styles.readability.test.ts) reads them.
// stylecheck.mjs builds this file for Node (vite build --ssr, as the other tools) so both halves share one source.
// Display only: nothing here is the sim's. CUSTOM-3 (REQ-BFG-074): the carrier styles and their checks (CARRIERS,
// carrierFill, carrierContrasts, yoursDistance, separation, SMOKE_50, FIRE_25, CARRIER_FACTIONS).
export { BELTS, CARRIERS, DEFAULT_SKIN, FLOORS, PANELS } from "../src/render/styles";
export {
  CARRIER_FACTIONS, FIRE_25, KEYWORD_COLOURS, NUMBER_COLOURS, SMOKE_50, THRESHOLDS, TODAY_CLOSEST_DEFAULTS, carrierContrasts,
  carrierFill, chevronContrast, contrast, edgeContrast, floorTones, keywordMin, numberContrast, separation, yoursDistance,
} from "../src/render/styleContrast";
export { C, FACTION } from "../src/render/palette";
// FIELD-1 (REQ-BFG-075): the battle settings' checks and thresholds (the logic half reads the same)
export { SCENE_GROUND, SCENE_THRESHOLDS, sceneChecks } from "../src/render/sceneContrast";
export { SCENE_IDS } from "../src/render/motion";
export { SCENE_NAME } from "../src/render/scenery";
export { ICON, ICON_COLOUR } from "../src/render/font";
