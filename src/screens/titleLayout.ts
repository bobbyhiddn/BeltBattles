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
import { HULL_A, HULL_L, type Box, type DeckFrame } from "../render/frame";
import { textWidth, wrap, type FontId } from "../render/font";
import { VERSION } from "../version";

/** The open floor wanted between the bows, as a share of the firing axis (0350e5f's title aimed at it too). */
export const TITLE_GAP_SHARE = 0.2;
/** Portrait: logical px kept clear between a cruiser and the logo band or the command panel. */
export const TITLE_CLEAR = 6;

// TITLE-1 (PRESENT-1, REQ-BFG-038; BRIEF-PRESENT1 T2): "the two carriers too close" is about the open water a player SEES, the
// distance between the DRAWN carriers (barrel tip to bow, with the bank and the surge: scripts/introcheck.mjs measures the pixels
// each carrier adds to the frame), not between their hull boxes, which the floor above is. A drawn carrier reaches out of its hull
// box into the floor (its bow wedge and barrels, its stern block) by 22-25 px (the player's) and 27-35 px (the enemy's) in
// landscape, 10-24 and 10 in portrait, at introcheck's three moments of the title's first fight (kit: output-present1/browser/
// introcheck-base). So the floor is at least the bar's 14% of the firing axis PLUS what the two carriers take of it, and the
// bar's one CSS inch (96 CSS px) PLUS the same: introcheck's own thresholds (scripts/introcheck.mjs MIN_SHARE and MIN_CSS) are
// the title's design now, not only its check. TITLE_OPEN_PAD px are kept beyond them.
/** introcheck.mjs MIN_SHARE: the open water between the drawn carriers, at least this share of the firing axis. */
export const TITLE_OPEN_SHARE = 0.14;
/** introcheck.mjs MIN_CSS: ... and at least this many CSS px (one CSS inch). */
export const TITLE_OPEN_CSS = 96;
/** Logical px the two drawn carriers together take of the floor between the hull boxes, at the worst of introcheck's three moments:
 *  landscape 58 (the player's 25 and the enemy's 33, desk 1440x900 @2, start), portrait 34 (24 and 10: the up ship at the end). */
export const TITLE_REACH_FLOOR = { land: 58, port: 34 };
/** Logical px kept beyond the bar and the reach. */
export const TITLE_OPEN_PAD = 2;
/** Landscape: how far a drawn carrier sits above and below its hull box (its bank and the lane's drift), logical px, at the same
 *  moments (the drawn boxes sit 5-18 px lower than the hull boxes); the command panel and the logo band are kept clear of it. */
export const TITLE_REACH_UP = 5;
export const TITLE_REACH_DOWN = 18;
/** Landscape: logical px kept clear between a drawn carrier's reach and the command panel. */
export const TITLE_CLEAR_PANEL = 4;
/** Landscape: how far a drawn carrier reaches sideways into the panel's columns beyond its hull box, logical px (the floor's reach). */
export const TITLE_REACH_SIDE = 30;

/** The floor between the hull boxes the title wants on a firing axis of `axis` logical px at `css` CSS px per logical px: the
 *  TITLE_GAP_SHARE floor, or what leaves the open water between the DRAWN carriers at introcheck's bar (TITLE_OPEN_SHARE of the axis
 *  and TITLE_OPEN_CSS CSS px) once the carriers have taken their reach of it, whichever is more. `css` unknown (a caller that
 *  does not model a screen): the CSS-inch term is left out. */
export function titleGap(axis: number, portrait: boolean, css = Infinity): number {
  const reach = (portrait ? TITLE_REACH_FLOOR.port : TITLE_REACH_FLOOR.land) + TITLE_OPEN_PAD;
  return Math.max(Math.round(axis * TITLE_GAP_SHARE), Math.ceil(axis * TITLE_OPEN_SHARE) + reach, Math.ceil(TITLE_OPEN_CSS / css) + reach);
}
/** CUSTOM-2a (REQ-BFG-072): the CUSTOMIZE button's least width (logical px): its word in the 3x5 face (35 px), a margin
 *  and room for the NEW dot. */
export const CUSTOMIZE_MIN = 40;

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
  /** CUSTOM-2a (REQ-BFG-072, REVIEW-CUSTOM1 Q5): `customize`, the CUSTOMIZE button, a third button in the HOW TO PLAY /
   *  OPTIONS row (a full-width row of its own made the panel taller, and the 360x640 phone's cruisers then fit at no
   *  scale: REPORT section 7). HOW TO PLAY and OPTIONS keep their size; the panel is wider by CUSTOMIZE's slot. */
  buttons: { new: Box; cont: Box | null; help: Box; options: Box; customize: Box };
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
export function titleLayout(W: number, H: number, portrait: boolean, save: boolean, k = 1, css = Infinity): TitleLayout {
  const u = (n: number) => Math.ceil(n * k - 1e-9);
  // the sound button, top right (0350e5f: 26x13, 4 px in from the top and right edges)
  const sound = { x: W - 4 - u(26), y: 4, w: u(26), h: u(13) };
  // the logo band (its dark strip, the art and the tagline): portrait under the sound button
  const ly = portrait ? Math.max(22, sound.y + sound.h + 5) : Math.max(8, Math.round(H * 0.08));
  const logo = { x: 0, y: ly - 6, w: W, h: 44 };
  // the command panel: NEW RUN, CONTINUE (a saved run), then HOW TO PLAY beside OPTIONS (0350e5f: 132 wide, the two
  // half buttons 64 each; at k > 1 wide enough for two u(64) halves too, so neither half shrinks either)
  // CUSTOM-2a (REQ-BFG-072, Q5): HOW TO PLAY and OPTIONS keep 0350e5f's halves (hw); CUSTOMIZE, a third button beside
  // them, takes u(48) where the screen has room and never less than CUSTOMIZE_MIN (its word and the NEW dot); the panel
  // (and NEW RUN and CONTINUE with it) is that much wider. Its height, and so the cruisers' room, is unchanged
  const bw0 = Math.min(W - 24, Math.max(u(132), 2 * u(64) + 4)), hw = Math.floor((bw0 - 4) / 2);
  const cw = Math.max(CUSTOMIZE_MIN, Math.min(u(48), W - 24 - (2 * hw + 8)));
  const bw = 2 * hw + 8 + cw, bh = u(22), ch = u(28), hh = u(18);
  const ph = 8 + bh + 6 + (save ? ch + 6 : 0) + hh + 10;
  const px = Math.round(W / 2 - (bw + 16) / 2);
  // TITLE-1: landscape's bottom margin is 5% of the height (8 px at least), but on a short screen (desk 1440x900 @2 is 360 px
  // tall) it gives way, down to 8 px, to what the drawn carriers' reach needs between the logo band and the panel
  const wantM = Math.max(8, Math.round(H * 0.05));
  const need = ly - 6 + 44 + TITLE_REACH_UP + HULL_A + TITLE_REACH_DOWN + TITLE_CLEAR_PANEL;
  const py = portrait ? H - ph - 10 : H - ph - Math.max(8, Math.min(wantM, H - ph - need));
  const bx = px + 8;
  let by = py + 8;
  const bNew = { x: bx, y: by, w: bw, h: bh };
  by += bh + 6;
  let bCont: Box | null = null;
  if (save) {
    bCont = { x: bx, y: by, w: bw, h: ch };
    by += ch + 6;
  }
  const buttons = {
    new: bNew, cont: bCont, help: { x: bx, y: by, w: hw, h: hh }, options: { x: bx + hw + 4, y: by, w: hw, h: hh },
    customize: { x: bx + 2 * (hw + 4), y: by, w: cw, h: hh },
  };
  const panel = { x: px, y: py, w: bw + 16, h: ph };
  const vw = textWidth(`V${VERSION}`, "3");
  const version = { x: W - 4 - vw, y: H - 8, w: vw, h: 5 };
  let a: { frames: [DeckFrame, DeckFrame]; hulls: [Box, Box] };
  if (portrait) {
    // the cruisers between the logo band and the panel, TITLE_CLEAR from each; the floor TITLE_GAP_SHARE of the height
    // where it fits, else all the room there is (titleScale then steps the scale down until it is at least minGap)
    const top = logo.y + logo.h + TITLE_CLEAR, bottom = py - TITLE_CLEAR;
    // TITLE-1: the floor is titleGap's (the bar's open water for the DRAWN carriers; the TITLE_GAP_SHARE floor where that is less)
    a = arenaIn({ x: 0, y: top, w: W, h: bottom - top }, true, Math.min(titleGap(H, true, css), bottom - top - 2 * HULL_L));
  } else {
    // 0350e5f's landscape placement: the floor 20% of the width (TITLE-1: titleGap's, more where the drawn carriers' reach takes
    // the open water below the bar), the cruisers centred in the band's box. Its box allowed for a 90 px panel where CONTINUE
    // makes it 98, so on a screen 346-351 px tall (the menu scale's least) the hulls' bottom row met the panel. TITLE-1: and the
    // DRAWN carriers reach TITLE_REACH_UP above, TITLE_REACH_DOWN below and TITLE_REACH_SIDE beside their hull boxes (a bank, the
    // lane's drift, the bow and the barrels), so wherever that meets the panel (desk 1440x900 @2 and the phone on its side, with
    // a saved run) they lift until it clears it, never into the logo band
    const top = Math.round(H * 0.08) + 40;
    const box = { x: 0, y: top, w: W, h: Math.max(160, H - top - (save ? u(90) : u(62)) - 14) };
    a = arenaIn(box, false, Math.min(titleGap(W, false, css), box.w - 2 * HULL_L - 12));
    const reachBox = (h: Box): Box => ({ x: h.x - TITLE_REACH_SIDE, y: h.y - TITLE_REACH_UP, w: h.w + 2 * TITLE_REACH_SIDE, h: h.h + TITLE_REACH_UP + TITLE_REACH_DOWN + TITLE_CLEAR_PANEL });
    const met = a.hulls.some((h) => meets(reachBox(h), panel));
    const lift = met ? Math.max(0, Math.min(a.hulls[0].y + a.hulls[0].h + TITLE_REACH_DOWN + TITLE_CLEAR_PANEL - py, a.hulls[0].y - TITLE_REACH_UP - (logo.y + logo.h))) : 0;
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
    if (titleLayout(Math.floor(pw / s), Math.floor(ph / s), portrait, true, menu / s, s / dpr).fits) return s;
  }
  return least;
}
