// shoptap (D5, backlog 319; R1 M1's rule, moved here from screens/summary.ts so the build and replay screens share it):
// tap targets for fingers. A phone is told by its view alone (its short side under PHONE_CSS CSS px); a finger's target
// is TAP_CSS CSS px (Apple's 44 pt), in the logical px of the screen that draws it.

import type { View } from "../core/io";

/** 0.7.0 (R1 M1): the smallest tap target on a phone, in CSS px (Apple's 44 pt). */
export const TAP_CSS = 44;
/** 0.7.0 (R1 M1): a phone's viewport is under this many CSS px on its short side (portrait phones are 320-430 px wide,
 *  landscape ones as tall); desktops, laptops and tablets are not. */
export const PHONE_CSS = 500;

/** CSS px per logical px of a view. */
export const cssK = (v: Pick<View, "scale" | "dpr">): number => v.scale / v.dpr;

/** R1 M1's phone test: the view's short side is under PHONE_CSS CSS px. */
export function isPhone(v: Pick<View, "W" | "H" | "scale" | "dpr">): boolean {
  return Math.min(v.W, v.H) * cssK(v) < PHONE_CSS;
}

/** A TAP_CSS target's side in the view's logical px (rounded up). */
export function tapPx(v: Pick<View, "scale" | "dpr">): number {
  return Math.ceil(TAP_CSS / cssK(v));
}
