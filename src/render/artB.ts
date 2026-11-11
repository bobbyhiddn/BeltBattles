// ARTB-CODE-1 (REQ-BFG-126, REQ-BFG-127): art direction B's first slice in the game: KILN, the ten FURNACE rigs (EMBER TROUGH, NAIL STRIP, GREASE
// WORKS, BALLAST, RASP, BELLOWS, SPARK GAP, STATIC BRUSH, BARBED SPOOL, VENOM DRIP) and FURNACE's 32x32 face. DISPLAY ONLY: every pixel comes from
// artBData.ts (generated from tools/artb/artb-slice.json by tools/artb/gen.mjs); this file draws nothing of its own.
//
// ONE SWITCH (setArtB, on by default; a build made with VITE_ARTB=0 starts with it off). With it off every function below answers null ("not
// mine") and the base's drawing runs, so the game is the base pixel for pixel. For an id the data does not hold they answer null too.
//
// The hooks (sprites.ts gateSprite, gateSil, itemIcon, factorySprite, factoryFlashSil; shapeArt.ts shapedRigBody, shapedRigSil; shop.ts iconX2;
// hero.ts) ask here first and fall through on null. Each sprite is built once (pixel.ts fromRows, as sprites.ts caches), with the working-state
// phases laid over the plain sprite (a '.' in an overlay clears that pixel):
//   - a 1-cell rig (board/<id>, 12x12): `work`, two phases, phase (frame >> 1) & 1 while it works (today's `active`); idle holds still;
//   - a body (body/<id>, 24x12 lying along x; an upright box gets it transposed, as shapeArt.ts transposes today): `idle`, two phases, phase
//     (frame >> 2) & 1; while it works, `work` phase (frame >> 1) & 1;
//   - KILN (kiln, 24x24): `idle`, four phases, phase (frame >> 1) & 3 (the first is the plain sprite); `flash` over the plain sprite while
//     factorySprite's flash is true (the stars change nothing, as today);
//   - the small icon of a rig is its board/<id> sprite (KILN: icon/kiln), the shop card's picture card/<id> (KILN: kiln, 24x24), the face portrait/<id>.
// Nothing here imports sprites.ts or shapeArt.ts (they import this).

import { C } from "./palette";
import { flipX, fromRows, rot90, silhouette } from "./pixel";
import { ART_B_LEGEND, ART_B_SPRITES, ART_B_WORK, type ArtBPixel } from "./artBData";

type Cv = HTMLCanvasElement;

/** The switch. Default on; VITE_ARTB=0 at build time turns the art off for the whole page (the release's easy way back, and the pixel account's
 *  "switch off = the base" build). Tests flip it with setArtB. */
let ON = (import.meta.env as unknown as Record<string, string | undefined>).VITE_ARTB !== "0";
export function setArtB(on: boolean): void {
  ON = on;
}
export function artBOn(): boolean {
  return ON;
}

const SPR = new Map(Object.entries(ART_B_SPRITES));
const WORK = new Map(Object.entries(ART_B_WORK));
/** legend character -> the palette colour's hex (render/palette.ts C, by the legend's colour name) */
const PAL: Record<string, string> = {};
for (const [ch, name] of Object.entries(ART_B_LEGEND)) PAL[ch] = (C as Record<string, string>)[name];

const cache = new Map<string, Cv>();
function cached(k: string, make: () => Cv): Cv {
  let c = cache.get(k);
  if (!c) {
    c = make();
    cache.set(k, c);
  }
  return c;
}

/** The sprite `name` (a key of the data) with `overlay` laid over it ('.' clears a pixel), built once under `key`. */
function sprite(name: string, key: string, overlay?: readonly ArtBPixel[]): Cv {
  return cached(`${name}|${overlay && overlay.length ? key : "plain"}`, () => {
    const rows = SPR.get(name)!.rows.map((r) => r.split(""));
    if (overlay) for (const [x, y, ch] of overlay) rows[y][x] = ch;
    return fromRows(rows.map((r) => r.join("")), PAL);
  });
}

/** Phase number `i` (taken mod the list's length) of `name`'s `kind` overlays: its cache key and pixels; the plain sprite when it has none. */
function layer(name: string, kind: "work" | "idle", i: number): [string, readonly ArtBPixel[] | undefined] {
  const l = WORK.get(name)?.[kind];
  if (!l || l.length === 0) return ["plain", undefined];
  const k = i % l.length;
  return [`${kind}${k}`, l[k]];
}

const frameOf = (frameIdx: number): number => ((frameIdx % 8) + 8) % 8;
/** (x, y) -> (y, x): rot90 then flipX, shapeArt.ts's transpose (a bevel lit from the top-left stays lit from the top-left). */
const transpose = (c: Cv): Cv => flipX(rot90(c));
/** The white silhouette of a canvas of this module (the hit flashes), built once under `key`. */
const silOf = (key: string, c: Cv | null): Cv | null => (c ? cached(`sil|${key}`, () => silhouette(c, C.white)) : null);

// ------------------------------------------------------------------ the board

/** A 1-cell rig's 12x12 board sprite (sprites.ts gateSprite): board/<id> at frame `frameIdx` (mod 8), with its `work` phase while `active`. A
 *  shaped rig's board/<id> is its small icon (its body on the deck is artBBody): gateSprite of it is that icon, still. null: not mine. */
export function artBBoard(id: string, frameIdx: number, active: boolean): Cv | null {
  if (!ON) return null;
  const name = `board/${id}`;
  if (!SPR.has(name)) return null;
  const [key, ov]: [string, readonly ArtBPixel[] | undefined] = active ? layer(name, "work", (frameOf(frameIdx) >> 1) & 1) : ["plain", undefined];
  return sprite(name, key, ov);
}

/** The white silhouette of the idle board sprite (sprites.ts gateSil: the hit flash). null: not mine. */
export function artBBoardSil(id: string): Cv | null {
  return silOf(`board/${id}`, artBBoard(id, 0, false));
}

/** The 12x12 small icon (sprites.ts itemIcon): icon/<id> (KILN's) or else the rig's board/<id>, plain. null: not mine. */
export function artBIcon(id: string): Cv | null {
  if (!ON) return null;
  const name = SPR.has(`icon/${id}`) ? `icon/${id}` : SPR.has(`board/${id}`) ? `board/${id}` : "";
  return name ? sprite(name, "plain") : null;
}

// ------------------------------------------------------------------ the shop card

/** The shop card's native 24x24 picture (shop.ts iconX2): card/<id>, or KILN's `kiln`. null: not mine. */
export function artBCard(id: string): Cv | null {
  if (!ON) return null;
  const name = SPR.has(`card/${id}`) ? `card/${id}` : SPR.has(id) ? id : "";
  return name ? sprite(name, "plain") : null;
}

// ------------------------------------------------------------------ the factory and the bodies

/** KILN (a bare name in the data, 24x24; sprites.ts factorySprite): the plain sprite with its `idle` phase (frame >> 1) & 3, or its `flash` over
 *  the plain sprite while `flash`. Stars change nothing. null: not mine. */
export function artBFactory(id: string, frameIdx: number, flash: boolean): Cv | null {
  if (!ON || id.includes("/") || !SPR.has(id)) return null;
  const fl = WORK.get(id)?.flash;
  if (flash && fl && fl.length) return sprite(id, "flash", fl);
  const [key, ov] = layer(id, "idle", (frameOf(frameIdx) >> 1) & 3);
  return sprite(id, key, ov);
}

/** The white silhouette of the idle factory (sprites.ts factoryFlashSil: the stamp flash). null: not mine. */
export function artBFactorySil(id: string): Cv | null {
  return silOf(id, artBFactory(id, 0, false));
}

/** A shaped rig's body (shapeArt.ts shapedRigBody) for the screen box w x h px: body/<id> lying along x (24x12), transposed when the box stands
 *  upright (12x24), with its `idle` phase (frame >> 2) & 1, or while `active` its `work` phase (frame >> 1) & 1. A box of another size or a body with
 *  holes (`mask`) is not the picture's: null (the base's body runs). */
export function artBBody(id: string, w: number, h: number, frameIdx: number, active: boolean, mask = ""): Cv | null {
  if (!ON || mask) return null;
  const name = `body/${id}`, s = SPR.get(name);
  if (!s) return null;
  const tr = h > w;
  if ((tr ? h : w) !== s.w || (tr ? w : h) !== s.h) return null;
  const f = frameOf(frameIdx);
  const [key, ov] = active ? layer(name, "work", (f >> 1) & 1) : layer(name, "idle", (f >> 2) & 1);
  const lying = sprite(name, key, ov);
  return tr ? cached(`${name}|${ov && ov.length ? key : "plain"}|T`, () => transpose(lying)) : lying;
}

/** The white silhouette of the idle body (shapeArt.ts shapedRigSil: the hit flash). null: not mine. */
export function artBBodySil(id: string, w: number, h: number, mask = ""): Cv | null {
  return silOf(`body/${id}|${w}x${h}`, artBBody(id, w, h, 0, false, mask));
}

// ------------------------------------------------------------------ the hero's face

/** A hero's face (hero.ts): portrait/<id>, 32x32 (FURNACE's today). null: not mine (the 24x24 face runs). */
export function artBFace(id: string): Cv | null {
  if (!ON) return null;
  const name = `portrait/${id}`;
  return SPR.has(name) ? sprite(name, "plain") : null;
}

/** Whether the art holds a piece of this id (a rig, KILN) with the switch on: the ids the card, icon, board and body hooks answer for. */
export function artBHas(id: string): boolean {
  return ON && (SPR.has(`card/${id}`) || SPR.has(`board/${id}`) || SPR.has(`icon/${id}`) || SPR.has(`body/${id}`) || (!id.includes("/") && SPR.has(id)));
}
