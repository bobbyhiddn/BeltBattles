// ARTB-CODE-3A (REQ-BFG-126): the NAMES of the pieces art direction B's batches 2R, 3a, 4a and 4b add or redraw, shared by tests/artb1.* and tests/artb2.* (their re-pinned lists) and tests/artb3.*, and the decoder of
// tools/artb/artb-slice.json the artb3.* tests compare canvases with. Not a test file. Only ids are typed here (the brief's lists); every pixel, pixel count and size is read from the data by the tests that use these.
import { readFileSync } from "node:fs";
import { expect } from "vitest";
import { C } from "../src/render/palette";
import { R } from "./raster.helpers";

/** Batch 1's ten rigs (the first slice, FURNACE's): they have card/<id> and board/<id>; two of them are shaped and also have body/<id>. */
export const SLICE_RIGS = ["embertrough", "nailstrip", "grease", "ballast", "rasp", "bellows", "sparkgap", "staticbrush", "barbed", "venom"];
/** The two shaped rigs of batch 1 that have a body/<id> on the deck. */
export const SHAPED = ["embertrough", "nailstrip"];
// ARTB-CODE-3B (the hold): 27 of the 3A pictures missed the acceptance read (ARTB-READ-6) and are HELD, out of the data, so every list below is the ids the data HOLDS now (the held ids are
// typed once, with their names, in tests/artb3.hold.test.ts). Old -> new: GUNS 13 -> 6, NEW_RIGS 34 -> 14, ALL_RIGS 44 -> 24, ICON_ONLY 15 -> 8, NEW_CARD_IDS 49 -> 22, SLICE_IDS 64 -> 37.
/** Batch 3a: the six gun pieces that ride (kind "turret"): card/<id> and icon/<id> (24x24 and 12x12); no board sprite. (The other seven are held: scrapcannon rampart carronade hailgun deckgun bombard thunderer.) */
export const GUNS = ["dartgun", "spikegun", "swivel", "twinneedle", "railgun", "siegegun"];
/** Batch 3a: WARD BELL and MENDING LOOM (kind "mod"): card/<id> and icon/<id>. */
export const MODS = ["wardbell", "mendingloom"];
/** Batches 4a and 4b: the 14 more rigs that ride: card/<id> (24x24), board/<id> (12x12, work = two phases). Their small icon is board/<id>. (The other 20 are held.) */
export const NEW_RIGS = [
  "temper", "tollbooth", "grudgerod", "whetstone", "counterweight", "plateroller", "surge", "aegisspike",
  "braceframe", "keg", "lodestone", "shieldwall", "trophychain", "twingauge",
];
/** Every rig that has a board/<id> and a card/<id> in the data now: the ten of batch 1 and the 14 new ones that ride. */
export const ALL_RIGS = [...SLICE_RIGS, ...NEW_RIGS];
/** The factories the data holds as a bare 24x24 sprite with an idle entry (4 phases) and a flash, each with icon/<id>: the four start factories and MEND PRESS (batch 3a). */
export const FACTORY_PIECES = ["kiln", "loom", "crucible", "wardworks", "mendpress"];
/** The pieces whose card is card/<id> and whose small icon is icon/<id>, with no board sprite: the six guns that ride and the two mods. */
export const ICON_ONLY = [...GUNS, ...MODS];
/** The 22 ids that are NEW as a card in this swap and ride: the 6 guns, the 2 mods and the 14 rigs. (BARBED SPOOL's card/barbed is replaced, not new.) */
export const NEW_CARD_IDS = [...GUNS, ...MODS, ...NEW_RIGS];
/** Every id the art answers for with the switch on (card, icon, board or factory): the 24 rigs, the 6 guns, the two mods and the five factories: 37. */
export const SLICE_IDS = [...ALL_RIGS, ...ICON_ONLY, ...FACTORY_PIECES];
/** ARTB-CODE-3B (REVIEW F1): the rigs that show a STATE through art B and the data's state keys (wave3Art.ts stKey) with their phase counts: twingauge `m` (one phase), braceframe `s` (one), shieldwall `p` (two). */
export const STATE_RIGS: Record<string, Record<string, number>> = { twingauge: { m: 1 }, braceframe: { s: 1 }, shieldwall: { p: 2 } };
/** The six sprites the swap REDRAWS (same names and sizes as before): LOOM and CRUCIBLE with their icons, and BARBED SPOOL's card and board sprite. */
export const REPLACED = ["loom", "icon/loom", "crucible", "icon/crucible", "card/barbed", "board/barbed"];

// ------------------------------------------------------------------ the data, decoded

export type Px = string | null;
export type Ex = { w: number; h: number; px: Px[] };
export type Overlay = [number, number, string][];
export type ArtData = {
  legend: Record<string, string>;
  legendHex: Record<string, string>;
  sprites: Record<string, { w: number; h: number; rows: string[] }>;
  work: Record<string, { work?: Overlay[]; idle?: Overlay[]; flash?: Overlay; state?: Record<string, Overlay[]> }>;
};
// (paths are the repo root's, where vitest runs; the repo's node shims declare no node:url)
export const data = JSON.parse(readFileSync("tools/artb/artb-slice.json", "utf8")) as ArtData;
const pal = C as Record<string, string>;
/** a legend character as a palette hex (null = clear) */
export const hex = (ch: string): Px => (ch === "." ? null : pal[data.legend[ch]]);
/** The sprite `name` of the data as w x h palette hexes (null = clear), with `overlay` laid over it. */
export function expected(name: string, overlay: Overlay = []): Ex {
  const s = data.sprites[name];
  const px: Px[] = [];
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) px.push(hex(s.rows[y][x]));
  for (const [x, y, ch] of overlay) px[y * s.w + x] = hex(ch);
  return { w: s.w, h: s.h, px };
}
/** phase `i` (mod the list's length) of a sprite's `work` or `idle` overlays; none when it has none */
export const phase = (name: string, kind: "work" | "idle", i: number): Overlay => { const l = data.work[name]?.[kind]; return l && l.length ? l[i % l.length] : []; };
/** the white silhouette of a decoded sprite (every opaque px white) */
export const white = (e: Ex): Ex => ({ ...e, px: e.px.map((p) => (p === null ? null : C.white)) });
/** a canvas equals a decoded sprite: size, then every pixel */
export function same(c: HTMLCanvasElement | null, e: Ex, what: string): void {
  expect(c, `${what}: a canvas`).not.toBeNull();
  const r = R(c);
  expect([r.width, r.height], `${what}: size`).toEqual([e.w, e.h]);
  expect(r.px, `${what}: pixels`).toEqual(e.px);
}
/** a sprite name's kind: the part before the "/", or "bare" for a bare name (a factory's picture) */
export const kindOf = (name: string): string => (name.includes("/") ? name.split("/")[0] : "bare");
