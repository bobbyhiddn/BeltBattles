// CUSTOM-1 (REQ-BFG-072; a design-study MOCK): the readability metric for every style, on palette pairs. Pure functions
// (no DOM, no sim): tests/styles.readability.test.ts asserts the thresholds and the catalogue sheet prints the numbers.
//  - contrast: the WCAG 2 contrast ratio of two sRGB colours, (L1 + 0.05) / (L2 + 0.05), 1 to 21;
//  - separation: CIE76 delta E in CIELAB (D65), for "this state colour must not look like that one".

import { C, FACTION } from "./palette";
import { ICON, ICON_COLOUR } from "./font";
import { BELTS, CARRIERS, FLOORS, PANELS, type BeltStyle, type CarrierStyle, type FloorStyle, type PanelSkin } from "./styles";

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const lin = (c: number): number => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function lab(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map(lin);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

export function separation(a: string, b: string): number {
  const p = lab(a), q = lab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** The deck tones a floor style shows: its own, or each faction's (the default follows the hero). */
export function floorTones(s: FloorStyle): [string, string, string][] {
  const own: [string, string, string][] = s.deck ? [s.deck] : Object.values(FACTION).map((P) => [P.deck0, P.deck1, P.deck2]);
  return s.alt ? [...own, s.alt] : own;
}

/** Tile edges: the seam between two tiles is one tile's shadow edge beside the next one's light edge; with a checker
 *  the seam crosses tones. The weakest seam's contrast. */
export function edgeContrast(s: FloorStyle): number {
  const t = floorTones(s);
  let m = Infinity;
  for (const a of t) for (const b of t) m = Math.min(m, contrast(a[0], b[2]));
  return m;
}

/** Belt direction: the normal chevron's crest against the belt's bed. */
export function chevronContrast(s: BeltStyle): number {
  return contrast(s.chev[1], s.bed);
}

/** Belt direction against the floor: the crest against every floor fill it may lie on (all floors, every faction). */
export function chevronOnFloors(s: BeltStyle): number {
  let m = Infinity;
  for (const f of FLOORS) for (const t of floorTones(f)) m = Math.min(m, contrast(s.chev[1], t[1]));
  return m;
}

/** The colours that carry a belt's state, which no style may borrow: the fast, OVERDRIVE and slow crests, the warn
 *  rails (a blocked belt) and the dead rails (an unconnected one). */
export const STATE_CHEVRONS = [C.yellow, C.fire3, C.ice];
export const STATE_RAILS = [C.yellow, C.amber, C.maroon, C.rust0];

/** The least separation between the style's normal crest and the state crests, and between its rails and the state rails. */
export function stateSeparation(s: BeltStyle): { chev: number; rails: number } {
  let chev = Infinity, rails = Infinity;
  for (const c of STATE_CHEVRONS) chev = Math.min(chev, separation(s.chev[1], c), separation(s.chev[0], c));
  for (const c of STATE_RAILS) for (const r of s.rails.slice(0, 2)) rails = Math.min(rails, separation(r, c));
  return { chev, rails };
}

/** The numbers a stats panel prints (HP, stats, the clock): white and bone. */
export const NUMBER_COLOURS: [string, string][] = [["WHITE", C.white], ["BONE", C.bone]];

/** Every keyword colour (font.ts ICON_COLOUR: the 9 keywords and RATE/GOLD), the hull bars and the plate's grey tag. */
export const KEYWORD_COLOURS: [string, string][] = [
  ["BURN", ICON_COLOUR[ICON.BURN]], ["STUN", ICON_COLOUR[ICON.STUN]], ["HEAT", ICON_COLOUR[ICON.HEAT]],
  ["FRAY", ICON_COLOUR[ICON.FRAY]], ["PLATE", ICON_COLOUR[ICON.PLATE]], ["PAIR", ICON_COLOUR[ICON.PAIR]],
  ["SHIELD", ICON_COLOUR[ICON.SHIELD]], ["HEAL", ICON_COLOUR[ICON.HEAL]], ["REGEN", ICON_COLOUR[ICON.REGEN]],
  ["RATE", ICON_COLOUR[ICON.RATE]], ["LIME BAR", C.lime], ["RED BAR", C.red], ["ENEMY NAME", C.red], ["TAG", C.slate4],
];

export function numberContrast(s: PanelSkin): number {
  return Math.min(...NUMBER_COLOURS.map(([, c]) => contrast(c, s.fill)));
}

/** A keyword colour's threshold on any panel: what it shows on today's panel (navy), capped at WCAG AA's 4.5:1 (a colour
 *  that clears AA today need only keep AA), and never under WCAG's 3:1 for large text and UI parts. */
export function keywordMin(c: string): number {
  return Math.max(3, Math.min(contrast(c, C.navy), 4.5));
}

/** The keyword colour with the least room over its threshold on the panel: its contrast, its threshold, which. */
export function keywordContrast(s: PanelSkin): { min: number; need: number; worst: string } {
  let room = Infinity, min = 0, need = 0, worst = "";
  for (const [n, c] of KEYWORD_COLOURS) {
    const k = contrast(c, s.fill), m = keywordMin(c);
    if (k - m < room) { room = k - m; min = k; need = m; worst = n; }
  }
  return { min, need, worst };
}

/** Today's iron chevron crest on today's decks (the four faction fills). */
function ironOnTodayFloors(): number {
  const iron = BELTS[0];
  return Math.min(...FLOORS.filter((f) => !f.deck).flatMap(floorTones).map((t) => contrast(iron.chev[1], t[1])));
}

// ------------------------------------------------------------------------------------- CUSTOM-3: carrier styles

/** The factions a carrier can belong to (beastfolk and unaligned borrow orc's and elf's palettes). */
export const CARRIER_FACTIONS = ["orc", "elf", "human", "dwarf"] as const;
/** The damage effects (arenaReact.ts damageFx; render/fx.ts, particles.ts): below 50% hull the light smoke puff (slate3
 *  body, slate4 highlight); below 25% the fire: embers (fire4) and sparks (fire4, yellow, white). */
export const SMOKE_50 = [C.slate3, C.slate4];
export const FIRE_25 = [C.fire4, C.yellow, C.white];

/** A carrier's paint fill (the colour the visible hull shows most): the style's, or the faction's hull2 (WAR COLOURS). */
export function carrierFill(s: CarrierStyle, faction: (typeof CARRIER_FACTIONS)[number]): string {
  return s.paint ? s.paint[2] : FACTION[faction].hull2;
}

/** The four carrier checks on a fill: smoke and fire against it, the plate's ink rim against it (WCAG contrast). */
export function carrierContrasts(fill: string): { smoke: number; fire: number; edge: number } {
  return {
    smoke: Math.min(...SMOKE_50.map((c) => contrast(c, fill))),
    fire: Math.min(...FIRE_25.map((c) => contrast(c, fill))),
    edge: contrast(C.ink, fill),
  };
}

/** "Yours" against every faction's default carrier: the least CIE76 delta E between the style's fill and each faction's
 *  default fill, and the faction it is nearest. */
export function yoursDistance(s: CarrierStyle): { value: number; nearest: string } {
  let value = Infinity, nearest = "";
  for (const f of CARRIER_FACTIONS) {
    const d = separation(carrierFill(s, f), FACTION[f].hull2);
    if (d < value) { value = d; nearest = f; }
  }
  return { value, nearest };
}

/** Today's carriers (WAR COLOURS on the four factions): the weakest value of each check, the carrier thresholds. */
function todayCarriers(): { smoke: number; fire: number; edge: number; closest: number } {
  const v = CARRIER_FACTIONS.map((f) => carrierContrasts(FACTION[f].hull2));
  let closest = Infinity;
  for (const a of CARRIER_FACTIONS) for (const b of CARRIER_FACTIONS) if (a < b) closest = Math.min(closest, separation(FACTION[a].hull2, FACTION[b].hull2));
  return { smoke: Math.min(...v.map((x) => x.smoke)), fire: Math.min(...v.map((x) => x.fire)), edge: Math.min(...v.map((x) => x.edge)), closest };
}
const TODAY = todayCarriers();
/** The closest two of today's default carriers (FOUNDRY's blued steel and BASTION's granite, about 19.8): a carrier
 *  style must stand farther than this from every default. */
export const TODAY_CLOSEST_DEFAULTS = TODAY.closest;

/** The thresholds (REPORT section 6). Each is the weakest pair today's default shows (a style may never read worse
 *  than the game reads now), or a fixed floor where today clears it by far. */
export const THRESHOLDS = {
  /** CUSTOM-3: smoke at 50% on the hull's fill: today's weakest carrier (WEAVER's verdigris, 1.11). */
  carrierSmoke: TODAY.smoke,
  /** CUSTOM-3: fire at 25% on the fill: today's weakest (WEAVER's verdigris against the yellow sparks, 4.29). */
  carrierFire: TODAY.fire,
  /** CUSTOM-3: the board plate's ink rim against the hull's fill around it: today's weakest (BASTION's granite, 1.91). */
  plateEdge: TODAY.edge,
  /** CUSTOM-3: "yours" against every faction's default carrier, CIE76 delta E: 20, the state colours' "clearly another
   *  colour", just past the closest two of today's defaults (TODAY_CLOSEST_DEFAULTS, 19.8). */
  yours: 20,
  /** Tile edges: the weakest seam of today's four faction decks (1.21). */
  edge: Math.min(...FLOORS.filter((f) => !f.deck).map(edgeContrast)),
  /** Chevron crest on its bed: today's iron belt (2.99; WCAG's 3:1 for UI parts, less a hair). */
  chevron: chevronContrast(BELTS[0]),
  /** Chevron crest on any floor fill: today's iron crest on today's decks (2.46). */
  chevronOnFloor: ironOnTodayFloors(),
  /** CIE76 delta E from the state colours: clearly another colour (a just-noticeable difference is about 2.3). */
  state: 20,
  /** Numbers (white, bone): WCAG AAA, 7:1 (today 10.9). */
  number: 7,
  /** Keyword colours: per colour, keywordMin (today's, capped at 4.5, at least 3); FRAY's is the tightest (3.51). */
  keyword: 3,
};

export interface StyleReport {
  surface: "floor" | "belt" | "panel" | "carrier";
  id: string;
  /** Each metric, its value and whether it passes. */
  rows: { name: string; value: number; min: number; pass: boolean }[];
}

export function reportAll(): StyleReport[] {
  const T = THRESHOLDS;
  const out: StyleReport[] = [];
  const e = 1e-9;
  for (const f of FLOORS) {
    // the floor under today's iron belt: its chevrons may not read worse on it than on today's decks
    const iron = Math.min(...floorTones(f).map((t) => contrast(BELTS[0].chev[1], t[1])));
    out.push({
      surface: "floor", id: f.id, rows: [
        { name: "EDGE", value: edgeContrast(f), min: T.edge, pass: edgeContrast(f) >= T.edge - e },
        { name: "IRON ON IT", value: iron, min: T.chevronOnFloor, pass: iron >= T.chevronOnFloor - e },
      ],
    });
  }
  for (const b of BELTS) {
    const st = stateSeparation(b);
    out.push({
      surface: "belt", id: b.id, rows: [
        { name: "CHEV", value: chevronContrast(b), min: T.chevron, pass: chevronContrast(b) >= T.chevron - e },
        { name: "ON FLOORS", value: chevronOnFloors(b), min: T.chevronOnFloor, pass: chevronOnFloors(b) >= T.chevronOnFloor - e },
        { name: "STATE", value: Math.min(st.chev, st.rails), min: T.state, pass: Math.min(st.chev, st.rails) >= T.state },
      ],
    });
  }
  for (const p of PANELS) {
    const k = keywordContrast(p);
    out.push({
      surface: "panel", id: p.id, rows: [
        { name: "NUM", value: numberContrast(p), min: T.number, pass: numberContrast(p) >= T.number },
        { name: `KEY ${k.worst}`, value: k.min, min: k.need, pass: k.min >= k.need - e },
      ],
    });
  }
  // CUSTOM-3: each carrier style on every faction (WAR COLOURS: the faction's own hull, so its rows are today's)
  for (const s of CARRIERS) {
    const v = CARRIER_FACTIONS.map((f) => carrierContrasts(carrierFill(s, f)));
    const smoke = Math.min(...v.map((x) => x.smoke)), fire = Math.min(...v.map((x) => x.fire)), edge = Math.min(...v.map((x) => x.edge));
    const rows = [
      { name: "SMOKE 50%", value: smoke, min: T.carrierSmoke, pass: smoke >= T.carrierSmoke - e },
      { name: "FIRE 25%", value: fire, min: T.carrierFire, pass: fire >= T.carrierFire - e },
      { name: "PLATE EDGE", value: edge, min: T.plateEdge, pass: edge >= T.plateEdge - e },
    ];
    if (s.paint) {
      const y = yoursDistance(s);
      rows.push({ name: `YOURS (${y.nearest})`, value: y.value, min: T.yours, pass: y.value >= T.yours });
    }
    out.push({ surface: "carrier", id: s.id, rows });
  }
  return out;
}

/** One decimal without toFixed (NUM-4 keeps decimal formatting to statFormat in the game; this is a mock's label). */
export function oneDecimal(v: number): string {
  const n = Math.round(v * 10);
  return `${Math.floor(n / 10)}.${n % 10}`;
}
