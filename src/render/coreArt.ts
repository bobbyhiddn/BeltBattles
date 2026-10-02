// 0.6.1b: turret core art (ARSENAL.md §8.4; catalogue.json art notes). Small and in the existing palette: a
// 12x12 icon per bought core (shop card, cargo, inspector; sprites.ts itemIcon asks here first) and each
// core's socket gem colour. A signature core's gem is its hero's faction glow.

import { HEROES, ITEMS, type HeroId } from "../sim/content";
import { C, FACTION } from "./palette";
import { bevel, disc, hline, line, px, rect, ring, vline, type G } from "./pixel";
import { wave3Gem } from "./wave3Art"; // 0.8.0 A1: ANVIL BREECH's and STEAM BREECH's gems

/** The socket gem colour of each bought core (catalogue art notes). */
export const CORE_GEM: Record<string, string> = {
  scatter: C.steel3, rotary: C.cyan, pressure: C.amber, gatling: C.steel2, hullbreaker: C.red, drake: C.fire2, salvo: C.verd3,
  mortar: C.rust3, grapnel: C.steel3, tesla: C.ice, capacitor: C.yellow, compound: C.brass4, lance: C.cyan,
};

/** The gem colour for turret core `def` (a bought core), or the hero's faction glow for its signature core. 0.8.0 A1:
 *  wave 3's two cores after CORE_GEM (wave3Art.ts WAVE3_CORE_GEM). */
export function gemColor(def: string | undefined, hero: HeroId): string {
  return (def && (CORE_GEM[def] || wave3Gem(def))) || FACTION[HEROES[hero].faction].glow;
}

/** Draw the 12x12 icon of a bought turret core; false for any other id. */
export function drawCoreIcon(g: G, id: string): boolean {
  if (ITEMS[id]?.kind !== "core") return false;
  switch (id) {
    case "scatter": // three bone dots in a fan on a steel disc
      disc(g, 6, 6.5, 5.6, C.ink);
      disc(g, 6, 6.5, 4.6, C.steel1);
      for (const [x, y] of [[3, 4], [6, 3], [9, 4]]) { px(g, x, y, C.bone); px(g, x, y + 1, C.steel3); }
      rect(g, 5, 7, 3, 3, C.steel0);
      px(g, 6, 8, C.steel3);
      break;
    case "rotary": // a six-hole cylinder with a cyan arrow pointing forward
      disc(g, 6, 7, 5, C.ink);
      disc(g, 6, 7, 4, C.steel2);
      for (const [x, y] of [[6, 4], [8, 5], [8, 8], [6, 9], [4, 8], [4, 5]]) px(g, x, y, C.ink);
      px(g, 6, 7, C.steel3);
      vline(g, 10, 1, 4, C.cyan); px(g, 9, 2, C.cyan); px(g, 11, 2, C.cyan); px(g, 10, 0, C.white);
      break;
    case "pressure": // a round gauge with the needle in the red
      disc(g, 6, 6, 5.6, C.ink);
      disc(g, 6, 6, 4.6, C.bone);
      ring(g, 6, 6, 4, C.steel2);
      hline(g, 8, 3, 2, C.red); px(g, 9, 4, C.red);
      line(g, 6, 6, 9, 3, C.ink);
      px(g, 6, 6, C.red);
      rect(g, 4, 11, 4, 1, C.amber);
      break;
    case "gatling": // a hexagon of barrel dots
      disc(g, 6, 6, 5.6, C.ink);
      disc(g, 6, 6, 4.6, C.steel1);
      for (const [x, y] of [[6, 2], [9, 4], [9, 8], [6, 10], [3, 8], [3, 4]]) { px(g, x, y, C.steel3); px(g, x, y + 1, C.steel0); }
      px(g, 6, 6, C.steel2);
      break;
    case "hullbreaker": // a cracked hull plate with a red wedge
      bevel(g, 1, 2, 10, 9, C.steel2, C.steel3, C.steel0, C.ink);
      line(g, 3, 4, 6, 7, C.ink); line(g, 6, 7, 5, 10, C.ink);
      for (let i = 0; i < 4; i++) hline(g, 7 + i, 1 + i, 4 - i, C.red);
      px(g, 10, 1, C.white);
      break;
    case "drake": // a dragon-head nozzle with a glowing jaw
      bevel(g, 1, 4, 8, 6, C.rust2, C.rust3, C.rust1, C.ink);
      px(g, 3, 5, C.fire4);
      rect(g, 8, 6, 3, 3, C.ink);
      hline(g, 9, 7, 3, C.fire3); px(g, 11, 6, C.fire4); px(g, 11, 8, C.fire2);
      hline(g, 2, 3, 3, C.rust4);
      break;
    case "salvo": // a 2x2 grid of brass shell ends
      bevel(g, 0, 0, 12, 12, C.verd1, C.verd3, C.verd0, C.ink);
      for (const [x, y] of [[2, 2], [7, 2], [2, 7], [7, 7]]) {
        disc(g, x + 1.5, y + 1.5, 1.9, C.ink);
        rect(g, x + 1, y + 1, 2, 2, C.brass3);
        px(g, x + 1, y + 1, C.brass4);
      }
      break;
    case "mortar":
      bevel(g, 1, 4, 10, 7, C.steel1, C.steel3, C.steel0, C.ink);
      rect(g, 3, 1, 6, 7, C.ink); rect(g, 4, 2, 4, 6, C.rust2); hline(g, 4, 2, 4, C.rust4);
      break;
    case "grapnel":
      line(g, 6, 11, 6, 3, C.steel3); line(g, 6, 3, 2, 6, C.steel3); line(g, 6, 3, 10, 6, C.steel3);
      line(g, 6, 7, 3, 9, C.brass3); line(g, 6, 7, 9, 9, C.brass3); px(g, 6, 2, C.white);
      break;
    case "tesla":
      disc(g, 6, 6, 5, C.ink); disc(g, 6, 6, 4, C.blue);
      line(g, 3, 8, 7, 2, C.white); line(g, 7, 2, 6, 6, C.ice); line(g, 6, 6, 10, 4, C.white);
      break;
    case "capacitor":
      bevel(g, 1, 2, 10, 9, C.steel1, C.steel3, C.steel0, C.ink);
      for (const x of [3, 8]) rect(g, x, 3, 1, 7, C.yellow);
      line(g, 4, 6, 8, 6, C.white); px(g, 6, 5, C.cyan);
      break;
    case "compound":
      bevel(g, 1, 2, 10, 9, C.brass1, C.brass4, C.brass0, C.ink);
      for (const x of [3, 7]) { rect(g, x, 3, 2, 6, C.ink); px(g, x, 4, C.steel3); }
      line(g, 4, 9, 8, 11, C.white);
      break;
    case "lance":
      bevel(g, 1, 1, 10, 10, C.blue, C.cyan, C.deepblue, C.ink);
      vline(g, 6, 1, 10, C.white); hline(g, 3, 5, 6, C.ice); px(g, 6, 0, C.white);
      break;
    default:
      disc(g, 6, 6, 5, gemColor(id, "furnace"));
  }
  return true;
}
