// CUSTOM-1 (REQ-BFG-072) designed, CUSTOM-2a ships: cosmetic styles for three surfaces of the player's carrier (CUSTOM-3
// adds the fourth, the hull itself; see below): the
// floor panels (the deck grid, hull.ts drawDeck, so also the board plate every screen cuts from it), the belts
// (sprites.ts beltN / beltCorner / turntable) and the stats panels (ui.ts statsPanel: the player's battle plate and the
// build screen's part panel with its idle forms). Every default entry reproduces today's colours exactly and takes
// today's code path. Each view sets its skin explicitly (CruiserView.skin; REVIEW-CUSTOM1 R11): the player's side wears
// the profile's chosen styles (game/profile.ts), the title's attract fight and every foe the defaults. There is no URL
// knob (R11: the study's ?mock= never ships). Display only: imports palette values, no sim value, and the sim never
// reads anything here.

import { C } from "./palette";

// CUSTOM-3 (REQ-BFG-074, which replaces REQ-BFG-072 and keeps its clauses): the carrier's hull is a fourth surface
// (render/carrier.ts): WAR COLOURS, today's ship in the faction's hull colours, is the default and the reference look;
// four paints and dressings are earned on the prestige goals. A style changes the hull art only (the outline, the board
// plate, the pivot, the mounts, lanes and motion stay the default's), keeps the faction's trim and glow, and is drawn on
// the player's own carrier only: foes, ghosts and the title's attract fight keep WAR COLOURS.

export type FloorId = "plate" | "timber" | "tread" | "checker" | "rune";
export type BeltId = "iron" | "verdigris" | "blued" | "timber" | "rune";
export type PanelId = "slate" | "brass" | "verdigris" | "timber" | "plum";
export type CarrierId = "war" | "admiral" | "ironclad" | "storm" | "gold";
export type Surface = "floor" | "belt" | "panel" | "carrier";

/** How a style is earned: the one short line a locked style shows (docs/TEXT-STYLE.md: capitals, a verb first). */
export interface Unlock {
  /** The line on a locked swatch. */
  how: string;
  /** The counter it reads (see REPORT section 4) and the target. Default styles have none. */
  counter?: string;
  need?: number;
  /** A long-term goal (one or two per surface). */
  long?: boolean;
}

export interface FloorStyle extends Unlock {
  id: FloorId;
  name: string;
  /** [shadow edge, fill, light edge]; undefined = the hero's faction deck (today's look). */
  deck?: [string, string, string];
  /** The second tone of a checker floor. */
  alt?: [string, string, string];
  /** The tile's inner mark. */
  mark: "rivet" | "planks" | "tread" | "checker" | "rune";
  /** The mark's colour, where the style has one apart from its shadow edge. */
  ink?: string;
}

export interface BeltStyle extends Unlock {
  id: BeltId;
  name: string;
  /** Rails [hi, mid, lo2, lo] (today: steel3, steel1, steel2, steel0). Never the warn (yellow/amber/fire) or dead
   *  (maroon/rust) rails: those carry a blocked or unconnected belt. */
  rails: [string, string, string, string];
  /** The bed between the chevrons (today belt1). */
  bed: string;
  /** The normal-speed chevron ramp [mid, crest] (today soil4, soil5). Never the speed tints' yellow, fire or ice. */
  chev: [string, string];
  /** The turntable's hub light. */
  hub: string;
}

export interface PanelSkin extends Unlock {
  id: PanelId;
  name: string;
  /** bevel2's fill, hi1, hi2, lo1, lo2 and rivet (today: navy, slate2, slate1, ink, night, slate3). */
  fill: string;
  hi1: string;
  hi2: string;
  lo1: string;
  lo2: string;
  rivet: string;
  /** An inner trim line one pixel inside the bevel (none today). */
  trim?: string;
}

export const FLOORS: readonly FloorStyle[] = [
  { id: "plate", name: "SHIP'S PLATE", mark: "rivet", how: "" },
  { id: "timber", name: "TIMBER DECK", deck: [C.soil0, C.wood0, C.wood1], mark: "planks", ink: C.soil1, how: "WIN 3 DUSK FIGHTS", counter: "duskWins", need: 3 },
  { id: "tread", name: "TREAD PLATE", deck: [C.night, C.slate0, C.slate1], mark: "tread", ink: C.slate2, how: "REACH DAY 5", counter: "bestDay", need: 5 },
  // CUSTOM-1: the first cut filled the brass tiles with brass0, which the readability test failed (today's iron chevrons
  // read 2.29 on it against 2.46 on today's decks); brass now rims the tiles and the fill is soil2
  { id: "checker", name: "BRASS CHECKER", deck: [C.soil0, C.soil2, C.brass1], alt: [C.ink, C.soil1, C.soil2], mark: "checker", how: "BEAT A WARLORD", counter: "warlordWins", need: 1 },
  { id: "rune", name: "RUNE STONE", deck: [C.stone0, C.stone1, C.stone2], mark: "rune", ink: C.rune0, how: "FINISH WITH 3 DIFFERENT HEROES", counter: "heroesFinished", need: 3, long: true }, // R6
];

export const BELTS: readonly BeltStyle[] = [
  { id: "iron", name: "IRON BELT", rails: [C.steel3, C.steel1, C.steel2, C.steel0], bed: C.belt1, chev: [C.soil4, C.soil5], hub: C.steel3, how: "" },
  { id: "verdigris", name: "VERDIGRIS", rails: [C.verd4, C.verd2, C.verd3, C.verd1], bed: C.oil0, chev: [C.verd2, C.verd4], hub: C.verd4, how: "PLAY 2 RUNS", counter: "runs", need: 2 },
  { id: "blued", name: "BLUED STEEL", rails: [C.bsteel4, C.bsteel2, C.bsteel3, C.bsteel1], bed: C.bsteel0, chev: [C.steel2, C.bone], hub: C.bsteel4, how: "END A RUN WITH 3 BELTS", counter: "mostBelts", need: 3 },
  { id: "timber", name: "TIMBER ROLLERS", rails: [C.wood4, C.wood2, C.wood3, C.wood1], bed: C.soil0, chev: [C.wood2, C.bone], hub: C.wood4, how: "WIN WITH 2 DIFFERENT HEROES", counter: "heroesWon", need: 2 }, // R6: DIFFERENT HEROES
  // a long goal: about 5 dusk wins a run makes 60 a dozen runs or more, past the first ~10
  { id: "rune", name: "RUNE CHAIN", rails: [C.plum4, C.plum2, C.plum3, C.plum1], bed: C.plum0, chev: [C.plum3, C.white], hub: C.rune3, how: "WIN 60 DUSK FIGHTS", counter: "duskWins", need: 60, long: true },
];

export const PANELS: readonly PanelSkin[] = [
  { id: "slate", name: "SLATE", fill: C.navy, hi1: C.slate2, hi2: C.slate1, lo1: C.ink, lo2: C.night, rivet: C.slate3, how: "" },
  // CUSTOM-1: the first cut's fills (soil1, verd0, wood0) were a shade lighter than today's navy, and the readability
  // test failed FRAY on them (3.2-3.4 against today's 3.51); each fill is now as dark as navy or darker, the style in
  // its bevel and rivets
  { id: "brass", name: "BRASSBOUND", fill: C.soil0, hi1: C.brass2, hi2: C.brass1, lo1: C.ink, lo2: C.ink, rivet: C.brass3, how: "FINISH A RUN", counter: "runsFinished", need: 1 },
  { id: "verdigris", name: "VERDIGRIS", fill: C.oil0, hi1: C.verd2, hi2: C.verd1, lo1: C.ink, lo2: C.ink, rivet: C.verd3, how: "BEAT THE IRON MATRIARCH", counter: "matriarchWins", need: 1 },
  { id: "timber", name: "CAPTAIN'S DESK", fill: C.stone0, hi1: C.wood2, hi2: C.wood1, lo1: C.ink, lo2: C.soil0, rivet: C.wood3, how: "REACH DAY 8", counter: "bestDay", need: 8 },
  { id: "plum", name: "WARLORD'S PLUM", fill: C.plum1, hi1: C.plum3, hi2: C.plum2, lo1: C.ink, lo2: C.plum0, rivet: C.plum4, trim: C.brass1, how: "WIN A RUN 10-0", counter: "flawless", need: 1, long: true },
];

export interface CarrierStyle extends Unlock {
  id: CarrierId;
  name: string;
  /** The hull paint in hull0..hull4's places (shade, low, fill, upper and deckhouse, gunwale light); undefined = the
   *  faction's own hull ramp (today's look). The faction's trim and glow stay on every style. */
  paint?: readonly [string, string, string, string, string];
}

/** CUSTOM-3: the carrier styles, the prestige tier (each goal is past any floor, belt or panel goal on its counter).
 *  Each fill (paint[2]) sits in today's band of hull luminance, so the plate's rim, smoke and fire read as on today's
 *  four hulls, and is delta E 20 or more from every faction's hull (styleContrast.ts carrierReadability). */
export const CARRIERS: readonly CarrierStyle[] = [
  { id: "war", name: "WAR COLOURS", how: "" },
  { id: "admiral", name: "ADMIRAL'S BLUE", paint: [C.night, C.rune0, C.rune1, C.rune2, C.rune3], how: "FINISH 3 RUNS", counter: "runsFinished", need: 3 },
  { id: "ironclad", name: "IRONCLAD", paint: [C.olive0, C.olive1, C.olive2, C.olive3, C.olive4], how: "BEAT 5 WARLORDS", counter: "warlordWins", need: 5 },
  { id: "storm", name: "STORMCALLER", paint: [C.plum1, C.plum2, C.plum3, C.plum4, C.rune3], how: "WIN WITH 4 DIFFERENT HEROES", counter: "heroesWon", need: 4 }, // R6
  // a long goal: about 5 dusk wins a run makes 100 some 20 runs
  { id: "gold", name: "CHAMPION'S GOLD", paint: [C.soil1, C.brass0, C.brass1, C.brass2, C.brass3], how: "WIN 100 DUSK FIGHTS", counter: "duskWins", need: 100, long: true },
];

export interface Skin {
  floor: FloorId;
  belt: BeltId;
  panel: PanelId;
  carrier: CarrierId;
}

export const DEFAULT_SKIN: Readonly<Skin> = { floor: "plate", belt: "iron", panel: "slate", carrier: "war" };

export const floorStyle = (id: FloorId): FloorStyle => FLOORS.find((s) => s.id === id) ?? FLOORS[0];
export const beltStyle = (id: BeltId): BeltStyle => BELTS.find((s) => s.id === id) ?? BELTS[0];
export const panelSkin = (id: PanelId): PanelSkin => PANELS.find((s) => s.id === id) ?? PANELS[0];
export const carrierStyle = (id: CarrierId | undefined): CarrierStyle => CARRIERS.find((s) => s.id === id) ?? CARRIERS[0];

/** A view's styles: its own skin, set explicitly by the screen that made it (R11), or the defaults (today's look). */
export function skinOf(own?: Skin | null): Readonly<Skin> {
  return own ?? DEFAULT_SKIN;
}

/** The catalogue per surface, in CUSTOMIZE's order (the default first, then the four in earning order); CUSTOM-3's
 *  CARRIER is the fourth tab. */
export const SURFACES: readonly Surface[] = ["floor", "belt", "panel", "carrier"];
export type AnyStyle = FloorStyle | BeltStyle | PanelSkin | CarrierStyle;
export function stylesOf(surface: Surface): readonly AnyStyle[] {
  return surface === "floor" ? FLOORS : surface === "belt" ? BELTS : surface === "panel" ? PANELS : CARRIERS;
}

/** A style's namespaced id in the profile's `unlocked` and `seen` lists (REQ-BFG-003 adds "hero:...", "parts:..."). */
export function styleKey(surface: Surface, id: string): string {
  return `style:${surface}.${id}`;
}

/** Whether a style is open for these counters (a default always is). `count` reads a counter by name. */
export function earned(s: Unlock, count: (counter: string) => number): boolean {
  return !s.counter || count(s.counter) >= (s.need ?? 1);
}

/** Is `id` one of `surface`'s styles? (a stored choice is checked before it is worn) */
export function isStyleId(surface: Surface, id: unknown): boolean {
  return typeof id === "string" && stylesOf(surface).some((s) => s.id === id);
}
