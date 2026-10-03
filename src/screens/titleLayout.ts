// Title screen framing (intro, BeltBattles 0.8.0, REQ-BFG-038: "The intro screen's battle also has the two carriers too
// close."). The title's attract battle (title.ts) rolls two cruisers between the logo band and the command panel. Until
// 0350e5f they took the floor left over between those two at the menu scale (io.ts defaultScale): on a portrait phone
// 39-78 px between the hull boxes (8-15% of the height; 2.6-10.3% of open water between the barrel tips), and on a
// 360x640 phone the cruisers met each other and NEW RUN sat on one. Now the title frames itself as the battle does
// (battleLayout.ts battleScale): the largest integer scale, at most the menu scale and never below one CSS px per logical
// px, at which the logo band, the command panel (with CONTINUE) and both cruisers fit with an open floor of at least
// GAP_SHARE (17%, the battle's own minimum) of the firing axis. The floor is then TITLE_GAP_SHARE (20%, what the title
// always aimed at) where there is room; the rest is margin. Landscape and desktop keep the menu scale and 0350e5f's
// placement (the cruisers lift a few px off the panel on the one band of screen heights where they met it); a portrait
// phone steps down one scale. Where it does, the title's buttons keep at least the CSS size the menu scale gave them
// (k: the menu scale over the title's), so no tap target shrinks. Presentation only: the battle's layout (battleLayout)
// and the sim are untouched.

import { defaultScale } from "../core/io";
import { arenaIn, minGap } from "../game/battleLayout";
import { HULL_L, type Box, type DeckFrame } from "../render/frame";
import { textWidth, wrap, type FontId } from "../render/font";
import { VERSION } from "../version";

/** The open floor wanted between the bows, as a share of the firing axis (0350e5f's title aimed at it too). */
export const TITLE_GAP_SHARE = 0.2;
/** Portrait: logical px kept clear between a cruiser and the logo band or the command panel. */
export const TITLE_CLEAR = 6;

export interface TitleLayout {
  W: number;
  H: number;
  portrait: boolean;
  save: boolean;
  /** The buttons' size factor: the menu scale over the title's (1 where the title keeps the menu scale). */
  k: number;
  /** The logo art's top; the band runs from ly - 6 to ly + 38. */
  ly: number;
  logo: Box;
  sound: Box;
  panel: Box;
  buttons: { new: Box; cont: Box | null; help: Box; options: Box };
  /** The version line, right-aligned at the bottom right. */
  version: Box;
  frames: [DeckFrame, DeckFrame];
  hulls: [Box, Box];
  /** The open floor between the two hull boxes along the firing axis (logical px). */
  gap: number;
  /** The floor is at least minGap of the firing axis, and both hulls are on screen and clear of the logo band, the
   *  command panel (its buttons), the sound button and the version line. */
  fits: boolean;
}

const meets = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const onScreen = (b: Box, W: number, H: number) => b.x >= 0 && b.y >= 0 && b.x + b.w <= W && b.y + b.h <= H;

/** The title's frame on a W x H logical screen. `save`: CONTINUE shows (a taller panel). `k` (>= 1): the buttons' size
 *  factor. At k = 1 every rect but the portrait cruisers is exactly 0350e5f's, and so are the landscape cruisers wherever
 *  0350e5f's did not meet the panel. */
export function titleLayout(W: number, H: number, portrait: boolean, save: boolean, k = 1): TitleLayout {
  const u = (n: number) => Math.ceil(n * k - 1e-9);
  // the sound button, top right (0350e5f: 26x13, 4 px in from the top and right edges)
  const sound = { x: W - 4 - u(26), y: 4, w: u(26), h: u(13) };
  // the logo band (its dark strip, the art and the tagline): portrait under the sound button
  const ly = portrait ? Math.max(22, sound.y + sound.h + 5) : Math.max(8, Math.round(H * 0.08));
  const logo = { x: 0, y: ly - 6, w: W, h: 44 };
  // the command panel: NEW RUN, CONTINUE (a saved run), then HOW TO PLAY beside OPTIONS (0350e5f: 132 wide, the two
  // half buttons 64 each; at k > 1 wide enough for two u(64) halves too, so neither half shrinks either)
  const bw = Math.min(W - 24, Math.max(u(132), 2 * u(64) + 4)), bh = u(22), ch = u(28), hh = u(18);
  const ph = 8 + bh + 6 + (save ? ch + 6 : 0) + hh + 10;
  const px = Math.round(W / 2 - (bw + 16) / 2);
  const py = portrait ? H - ph - 10 : H - ph - Math.max(8, Math.round(H * 0.05));
  const bx = px + 8;
  let by = py + 8;
  const bNew = { x: bx, y: by, w: bw, h: bh };
  by += bh + 6;
  let bCont: Box | null = null;
  if (save) {
    bCont = { x: bx, y: by, w: bw, h: ch };
    by += ch + 6;
  }
  const hw = Math.floor((bw - 4) / 2);
  const buttons = { new: bNew, cont: bCont, help: { x: bx, y: by, w: hw, h: hh }, options: { x: bx + hw + 4, y: by, w: bw - hw - 4, h: hh } };
  const panel = { x: px, y: py, w: bw + 16, h: ph };
  const vw = textWidth(`V${VERSION}`, "3");
  const version = { x: W - 4 - vw, y: H - 8, w: vw, h: 5 };
  let a: { frames: [DeckFrame, DeckFrame]; hulls: [Box, Box] };
  if (portrait) {
    // the cruisers between the logo band and the panel, TITLE_CLEAR from each; the floor TITLE_GAP_SHARE of the height
    // where it fits, else all the room there is (titleScale then steps the scale down until it is at least minGap)
    const top = logo.y + logo.h + TITLE_CLEAR, bottom = py - TITLE_CLEAR;
    a = arenaIn({ x: 0, y: top, w: W, h: bottom - top }, true, Math.min(Math.round(H * TITLE_GAP_SHARE), bottom - top - 2 * HULL_L));
  } else {
    // 0350e5f's landscape placement: the floor 20% of the width, the cruisers centred in the band's box. Its box allowed
    // for a 90 px panel where CONTINUE makes it 98, so on a screen 346-351 px tall (the menu scale's least) the hulls'
    // bottom row met the panel: there, and only there, they lift until they clear it, never into the logo band
    const top = Math.round(H * 0.08) + 40;
    const box = { x: 0, y: top, w: W, h: Math.max(160, H - top - (save ? u(90) : u(62)) - 14) };
    a = arenaIn(box, false, Math.min(Math.round(W * TITLE_GAP_SHARE), box.w - 2 * HULL_L - 12));
    const met = a.hulls.some((h) => meets(h, panel));
    const lift = met ? Math.max(0, Math.min(a.hulls[0].y + a.hulls[0].h - py, a.hulls[0].y - (logo.y + logo.h))) : 0;
    if (lift > 0) {
      a = {
        frames: [{ ...a.frames[0], dy: a.frames[0].dy - lift }, { ...a.frames[1], dy: a.frames[1].dy - lift }],
        hulls: [{ ...a.hulls[0], y: a.hulls[0].y - lift }, { ...a.hulls[1], y: a.hulls[1].y - lift }],
      };
    }
  }
  const [hp, he] = a.hulls;
  const gap = portrait ? hp.y - (he.y + he.h) : he.x - (hp.x + hp.w);
  const clear = a.hulls.every((h) => onScreen(h, W, H) && ![logo, panel, sound, version].some((b) => meets(h, b)));
  return { W, H, portrait, save, k, ly, logo, sound, panel, buttons, version, frames: a.frames, hulls: a.hulls, gap, fits: clear && gap >= minGap(portrait ? H : W) };
}

/** The HOW TO PLAY card for `lines` (title.ts HELP) on a W x H screen at the buttons' size factor `k`: 0350e5f's card at
 *  k = 1 (300 px wide at most, the 3x5 face); where the title steps its scale down (k > 1) the card keeps its CSS width
 *  (k times as wide, within the screen) and its text takes the 5x7 face, about as tall in CSS px as the 3x5 face was. */
export function helpCard(W: number, H: number, k: number, lines: readonly string[]): Box & { font: FontId; row: number } {
  const big = k > 1;
  const font: FontId = big ? "5" : "3", row = big ? 9 : 7;
  const w = Math.min(W - 16, Math.round(300 * k));
  const x = Math.round((W - w) / 2);
  const rows = lines.reduce((n, ln) => n + wrap(ln, w - 16, font).length, 0);
  const h = 20 + rows * row + lines.length * 3 + 5;
  return { x, y: Math.round(Math.max(20, H / 2 - h / 2)), w, h, font, row };
}

/** The title's integer device-pixel scale (TitleScreen.pickScale): the menu scale where the title fits it (desktop and
 *  landscape), else the largest smaller scale where it fits with CONTINUE showing (a portrait phone: one step down),
 *  never below `dpr` (one CSS px per logical px: the size the landscape title is drawn at on the same phone, so its text
 *  stays readable); that floor where nothing fits. The scale never depends on the saved run. */
export function titleScale(pw: number, ph: number, portrait: boolean, dpr = 1): number {
  const menu = defaultScale(pw, ph, portrait);
  const least = Math.min(menu, Math.max(1, Math.ceil(dpr - 1e-6)));
  for (let s = menu; s > least; s--) {
    if (titleLayout(Math.floor(pw / s), Math.floor(ph / s), portrait, true, menu / s).fits) return s;
  }
  return least;
}
