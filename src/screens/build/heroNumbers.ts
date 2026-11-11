// POLISH-9 (P9-1; REQ-BFG-087, REQ-BFG-089; RULING-SCOUT-POLISH9 1, 4, 5, 10): WHERE THE PLAYER'S OWN HULL, BELT n/m AND FEEDS ARE DRAWN WHEN THE HERO CARD IS NOT.
//   On the portrait build screen the three numbers were drawn only in the hero card (inspector.ts drawHeroStrip), and the hero card needs HERO_MIN (24) rows above the NEXT BATTLE card, i.e. a 50 px band. Over the scout's 1,040 real states
//   (52 views x rune and none x 3-7 offers x a plain dawn and the ENCHANTER's wagon up) 265 had no hero card, so no HULL and no FEEDS (164 no BELT n/m either): small phones, phones with the browser's bars up, tablets, narrow windows.
//   THE RULE (A1 + C+). Where the hero card is not drawn and nothing is selected or hovered or carried (chrome.ts):
//     (1) with 8 rows or more above the NEXT BATTLE card (a band of 34 or more) the three numbers stand in ONE slim row there (rowRect: a 9 px panel, its foot 2 px above the card, 1 px at 8 rows);
//     (2) otherwise they stand as a three-row stack (inspector.ts drawHeroStack, 37 x 23 at its widest) in the free place nearest the middle of the two pack buttons (stackPlace): the rect that keeps 1 clear px from the bar, the rune bar's row,
//         the corner MENU's finger square, every shop card, REROLL, the packs, the merchants' tags and the ENCHANTER's tag, the wagon's cards and their tap targets, the strip's band, the hull, the bow mounts (and their barrels up to the tips), FIGHT and
//         the cargo tray, and ends 2 px above the deck's first part (deckFloor).
//   Nothing here moves the layout: no number of buildLayout, lowerInfo, idleFoeRect or heroCardRect changes, and the row and the stack register no region (they are not buttons). Pure but for `stackObstacles`, which reads the screen.
//   THE PLACE is found by candidates, not by a scan of every pixel: the distance to the packs' middle is |x - cx| + |y - cy|, so the best free rect has its x at the edge of a free interval or at cx, and its y at the edge of a free interval or at
//   cy (stackPlace): the same rect the scout's 1-px scan found (O/kit/p9-scan-oracle.test.ts reproduces it over the census), in about 80 x 80 trials instead of a whole screen's. It is computed once per KEY of its inputs (stackPlaceMemo),
//   never per frame: build.ts rebuilds `s.L` every frame, so the memo cannot hang on it.
import { textWidth } from "../../render/font";
import { MERCHANTS } from "../../sim/content";
import { turretSlots } from "../../sim/deck";
import { tapPx } from "../../ui/tap";
import type { Rect } from "../../ui/ui";
import { carrierBox, cornerTap } from "./layout";
import { deckFloor, tagWidth } from "./enchantStrip";
import type { BuildScreen } from "./build";

/** The slim row's height: the 3x5 face with 2 px over and under. */
export const ROW_H = 9;
/** The rows above the NEXT BATTLE card the slim row needs (heroCardRect's h): 8 (a band of 34); 9 or more leave 2 px clear above the card, 8 leave 1. */
export const ROW_MIN_ABOVE = 8;
/** The clear px the stack keeps from every part, card and target. */
export const STACK_CLEAR = 1;
/** The rows the stack keeps clear above the deck's first part (deckFloor: the hull and the bow mounts, whose barrels reach 8 px higher still). */
export const STACK_FLOOR = 2;

/** A1: the slim row's rect in the `top` rows above the NEXT BATTLE card (layout.ts heroCardRect), or null under ROW_MIN_ABOVE rows. Its foot is 2 px above the card (1 px at 8 rows). Pure. */
export function rowRect(top: Rect): Rect | null {
  if (top.h < ROW_MIN_ABOVE) return null;
  return { x: top.x, y: top.y + top.h + (top.h >= ROW_H ? 0 : 1) - ROW_H, w: top.w, h: ROW_H };
}

export interface PlaceSpec {
  /** The screen's width. */
  W: number;
  /** The stack's first row: 1 clear row under the bar. */
  y0: number;
  /** The row the stack must end above: deckFloor less STACK_FLOOR. */
  y1: number;
  /** The stack's size (inspector.ts heroStackSize). */
  size: { w: number; h: number };
  /** The middle of the two pack buttons. */
  near: { x: number; y: number };
  /** Every part, card and target the stack keeps STACK_CLEAR px from. */
  obstacles: readonly Rect[];
}

/** Does a stack of `sz` at (x, y) come within STACK_CLEAR px of `o`? */
const hits = (x: number, y: number, sz: { w: number; h: number }, o: Rect): boolean =>
  x - STACK_CLEAR < o.x + o.w && x + sz.w + STACK_CLEAR > o.x && y - STACK_CLEAR < o.y + o.h && y + sz.h + STACK_CLEAR > o.y;

/**
 * C+: the free place nearest `near` that holds the stack: the rect (x, y, size) inside [1, W - 1] and [y0, y1] that keeps STACK_CLEAR px from every obstacle and whose middle is the least |dx| + |dy| from `near`; the first in
 * rows then columns on a tie (the order a pixel scan would find it in). null: no place holds it. Pure. The candidates: the x at which a free interval starts or ends (an obstacle's edge, 1 clear px off) or the unconstrained best
 * (floor and ceil of near.x less half the width), and the same for y: the distance is a sum of one term in x and one in y, so the best free point of any free box lies on such a coordinate in each axis.
 */
export function stackPlace(p: PlaceSpec): Rect | null {
  const { W, y0, y1, size: sz, near } = p;
  const xmin = 1, xmax = W - 1 - sz.w, ymin = y0, ymax = y1 - sz.h;
  if (xmax < xmin || ymax < ymin) return null;
  const obs = p.obstacles.filter((o) => o.w > 0 && o.h > 0);
  const cx = near.x - sz.w / 2, cy = near.y - sz.h / 2;
  const xs = new Set<number>([xmin, xmax, Math.floor(cx), Math.ceil(cx)]);
  const ys = new Set<number>([ymin, ymax, Math.floor(cy), Math.ceil(cy)]);
  for (const o of obs) {
    xs.add(o.x + o.w + STACK_CLEAR); xs.add(o.x - STACK_CLEAR - sz.w);
    ys.add(o.y + o.h + STACK_CLEAR); ys.add(o.y - STACK_CLEAR - sz.h);
  }
  const X = [...xs].filter((x) => x >= xmin && x <= xmax).sort((a, b) => a - b);
  const Y = [...ys].filter((y) => y >= ymin && y <= ymax).sort((a, b) => a - b);
  let best: Rect | null = null, bd = Infinity;
  for (const y of Y) {
    for (const x of X) {
      const d = Math.abs(x + sz.w / 2 - near.x) + Math.abs(y + sz.h / 2 - near.y);
      if (d >= bd) continue; // strictly nearer than the best so far: the first of equals wins, as a scan's would
      if (obs.some((o) => hits(x, y, sz, o))) continue;
      bd = d;
      best = { x, y, w: sz.w, h: sz.h };
    }
  }
  return best;
}

/** The place for a key of its inputs: the last key and its place. The key is every number the place is a function of (not `s.L`, which build.ts rebuilds every frame), so a stale place cannot be returned. */
let memo: { key: string; r: Rect | null } | null = null;

/** stackPlace, computed once per key of its inputs (the screen's width, the rows it may take, the stack's size, the packs' middle, every obstacle rect). */
export function stackPlaceMemo(p: PlaceSpec): Rect | null {
  const key = [p.W, p.y0, p.y1, p.size.w, p.size.h, p.near.x, p.near.y, ...p.obstacles.map((o) => `${o.x},${o.y},${o.w},${o.h}`)].join(" ");
  if (memo && memo.key === key) return memo.r;
  const r = stackPlace(p);
  memo = { key, r };
  return r;
}

/** The merchant tags' drawn rects (shop.ts drawTag: the glyph at x, the name 5 px in at the same y; chrome.ts drawShop draws one over the first card of each wagon's group at y - 8), 8 rows tall down to the card, each its drawn width. */
function merchantTags(s: BuildScreen): Rect[] {
  const L = s.L;
  if (!L.tags) return [];
  const out: Rect[] = [];
  let last = -1;
  s.offers().forEach(({ wagon }, i) => {
    const c = L.cards[i];
    if (c && wagon !== last) out.push({ x: c.x, y: c.y - 8, w: 5 + textWidth(MERCHANTS[s.run.shop.wagons[wagon].merchant].name, "3"), h: 8 });
    last = wagon;
  });
  return out;
}

/** Every part, card and target the stack keeps clear of on screen `s`, and the rows it may take. Reads `s.L` as it stands this frame. */
export function stackSpec(s: BuildScreen, size: { w: number; h: number }): PlaceSpec {
  const L = s.L, run = s.run;
  const obs: Rect[] = [L.bar, L.hull, L.fight, L.cargo, ...L.cards, L.reroll, ...L.packs];
  if (L.wagon) {
    obs.push(...L.wagon.rects, ...L.wagon.hits);
    if (L.wagon.tag) obs.push({ x: L.wagon.tag.x, y: L.wagon.tag.y, w: tagWidth(), h: 8 }); // the ENCHANTER's tag
  }
  obs.push(...merchantTags(s));
  if ((run.build.runes?.length ?? 0) > 0) obs.push({ x: 0, y: L.bar.h, w: L.W, h: Math.min(...L.cards.map((r) => r.y), L.reroll.y) - L.bar.h }); // the rune bar's row
  const tp = L.phone ? tapPx(s.game.view) : 0;
  if (cornerTap(L, tp) > 0) obs.push({ x: 0, y: 0, w: Math.max(tp, 31), h: tp }); // the corner MENU's finger square (layout.ts cornerTarget)
  if (L.info.h > 0) obs.push(L.info); // the strip's band
  // the bow mounts, and the barrels above them up to their tips (the carrier box's top: build.ts deckTurretRect's 24 x 24 box reaches 7 px over the hull's bow edge, the barrels 8 px higher still). The scout's patch kept 2 px above the mounts' boxes only: in 1 of
  // its 176 stacks (1024x1366@2, no rune, 3 offers, the wagon) the stack's foot lay 4 rows into a barrel's column, over its tip (V3: nothing drawn over a deck part)
  const tip = Math.floor(L.cam.y + L.cam.k * carrierBox(true).y0);
  for (let i = 0; i < turretSlots(run.build).length; i++) {
    const m = s.turretRect(i);
    obs.push(m);
    if (m.y > tip) obs.push({ x: m.x, y: tip, w: m.w, h: m.y - tip });
  }
  const packs = L.packs.length ? L.packs : [L.reroll];
  const near = { x: packs.reduce((a, r) => a + r.x + r.w / 2, 0) / packs.length, y: packs.reduce((a, r) => a + r.y + r.h / 2, 0) / packs.length };
  return { W: L.W, y0: L.bar.y + L.bar.h + 1, y1: deckFloor(L, run) - STACK_FLOOR, size, near, obstacles: obs };
}

export interface HeroNumbersPlan {
  kind: "row" | "stack";
  r: Rect;
}

/**
 * Where the three numbers are drawn on screen `s` when the hero card is not (chrome.ts has checked that, and that nothing is selected, hovered or carried): the slim row in the rows `top` above the NEXT BATTLE card (null: no card) where
 * there are 8 or more and the row's words fit its panel (`rowW`: inspector.ts heroRowWidth), else the stack in its place (`size`: heroStackSize); null where no place holds the stack (8 of the census's 1,040 states).
 */
export function heroNumbersPlan(s: BuildScreen, top: Rect | null, rowW: number, size: { w: number; h: number }): HeroNumbersPlan | null {
  const row = top ? rowRect(top) : null;
  if (row && rowW <= row.w) return { kind: "row", r: row };
  const r = stackPlaceMemo(stackSpec(s, size));
  return r ? { kind: "stack", r } : null;
}
