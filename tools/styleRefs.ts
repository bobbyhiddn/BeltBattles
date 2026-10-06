// CUSTOM-2b (REQ-BFG-072): the references of scripts/stylecheck.mjs, the readability test's rendered half. The catalogue
// (src/render/styles.ts) and the metric with its thresholds (src/render/styleContrast.ts: contrast, THRESHOLDS,
// keywordMin, floorTones, KEYWORD_COLOURS), exactly as the logic half (tests/styles.readability.test.ts) reads them.
// stylecheck.mjs builds this file for Node (vite build --ssr, as the other tools) so both halves share one source.
// Display only: nothing here is the sim's.
export { BELTS, DEFAULT_SKIN, FLOORS, PANELS } from "../src/render/styles";
export {
  KEYWORD_COLOURS, NUMBER_COLOURS, THRESHOLDS, chevronContrast, contrast, edgeContrast, floorTones, keywordMin, numberContrast,
} from "../src/render/styleContrast";
export { C, FACTION } from "../src/render/palette";
export { ICON, ICON_COLOUR } from "../src/render/font";
