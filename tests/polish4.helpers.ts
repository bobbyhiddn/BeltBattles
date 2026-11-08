// POLISH-4 (REQ-BFG-089, REQ-BFG-087): what the tests/polish4.*.test.ts files share (not a test file).
//   The corpora and the plan readers are POLISH-3b's (tests/polish3b.helpers.ts): A = every rival build's faces (2,242), read as your own faces or, with `foe`, as the foe's; B = every shop piece that takes an
//   enchant word x every star x plain and each word, on your own build (1,809; the foe's: read as SPARKFANG's).
//   The views are the scout's thirteen (POLISH-4 SCOUT, kit/p4-snip-own.test.ts): POLISH-3's six + the 96 px column (3040x1710@1) + the four landscape phones whose fixed integer scale leaves the face 106-122 px
//   (812x375@3, 851x393@2.75, 915x412@2.625, 926x428@3) + the two narrow bands (280x653@3, 300x640@3).
import { battleLayout, battleScale, laneLayout, battleGrid } from "../src/game/battleLayout";
import { viewWithSub } from "../src/game/viewGrid";
import { faceArea } from "../src/screens/battleScout";
import { tapPx } from "../src/ui/tap";
import { UI, type Rect } from "../src/ui/ui";
import type { Game } from "../src/game/game";
import { fresh } from "./raster.helpers";

export const VIEWS13 = {
  "desk-1920x1080": [1920, 1080, 1], "laptop-1366x768": [1366, 768, 1], "desk-1280x800": [1280, 800, 1], "land-844x390": [844, 390, 3], "op-402x690": [402, 690, 3], "phone-360x640": [360, 640, 3],
  "col96-3040x1710": [3040, 1710, 1], "land-812x375@3": [812, 375, 3], "pixel5-851x393@2.75": [851, 393, 2.75], "land-915x412@2.625": [915, 412, 2.625], "promax-926x428@3": [926, 428, 3],
  "band-280x653": [280, 653, 3], "band-300x640": [300, 640, 3],
} as const;
export type View13 = keyof typeof VIEWS13;
export const VIEW13_NAMES = Object.keys(VIEWS13) as View13[];
/** the five landscape phones and the 1920x1080 desk, 844x390 and the 3040x1710 column: P4-3's views */
export const LANDSCAPE_PHONES: View13[] = ["land-812x375@3", "pixel5-851x393@2.75", "land-915x412@2.625", "promax-926x428@3"];

const pickSub = (pw: number, ph: number, p: boolean, scale: number): number => { const g = battleGrid(pw, ph, p); return g.close === scale ? g.sub : 1; };
/** A view's screen and a Game stub holding what BattleFaces.drawOn reads (the view, a UI, a canvas of the logical screen's size). */
export function gameAt(name: View13): { v: ReturnType<typeof viewWithSub>; game: Game } {
  const [w, h, dpr] = VIEWS13[name];
  const v = viewWithSub(w, h, dpr, (pw, ph, p) => battleScale(pw, ph, p), pickSub);
  return { v, game: { view: v, ui: new UI(), canvas: fresh(v.W, v.H), t: 0, W: v.W, H: v.H, portrait: v.portrait } as unknown as Game };
}
const cache = new Map<string, { fa: { area: Rect; band: boolean }; tp: number }>();
/** A view's face area and finger target for a side's faces (0: yours, 1: the foe's), as BattleFaces.draw reads them. */
export function viewAt(name: View13, side: 0 | 1 = 0): { fa: { area: Rect; band: boolean }; tp: number } {
  const key = `${name}/${side}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [w, h, dpr] = VIEWS13[name];
  const v = viewWithSub(w, h, dpr, (pw, ph, p) => battleScale(pw, ph, p), pickSub);
  const out = { fa: faceArea(laneLayout(battleLayout(v.W, v.H, v.portrait)), side), tp: tapPx(v) };
  cache.set(key, out);
  return out;
}
