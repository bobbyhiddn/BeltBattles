// PRESENT-3 C step 1 (REQ-BFG-113 (1); backlog #498 (5)): a lighter SCRAP CANNON icon that reads as a cannon at its size.
//  Before: render/turretIcon.ts drew every HEAVY turret (the SCRAP CANNON, the RAMPART CANNON ...) as a round mount and two barrels that were 1 px of steel2 between ink lines: a dim grey 12x12 picture that no reader of
//  PRESENT-2's K-02 could name (0 of 6, bare or under a grid; the KILN, the other slot, read 4 of 6).
//  Now: the same mount and gun body, the same 12x12 and palette, two FAT barrels (3 px of steel3 with a white edge and muzzle and a dark bore). The other classes' icons are untouched.
import { describe, expect, it } from "vitest";
import { installRaster, fresh, G as gOf, type RasterCanvas } from "./raster.helpers";
import { C, RARITY_COLOR } from "../src/render/palette";
import { ITEMS } from "../src/sim/content";
import { itemIcon } from "../src/render/sprites";
import { rect } from "../src/render/pixel";

installRaster();

/** The turret icon as render/turretIcon.ts drew it before this change (every class, the heavy one with its thin barrels), for the comparison. */
function oldIcon(id: string): (string | null)[] {
  const cv = fresh(12, 12), g = gOf(cv), d = ITEMS[id], cls = d.turret!.class;
  rect(g, 1, 6, 10, 6, C.ink); rect(g, 2, 7, 8, 4, C.steel1); rect(g, 2, 10, 8, 1, RARITY_COLOR[d.rarity]);
  rect(g, 3, 5, 6, 5, C.ink); rect(g, 4, 6, 4, 3, C.steel3); rect(g, 5, 7, 2, 1, C.steel0);
  const barrel = (x: number, w: number, len: number): void => { rect(g, x, 6 - len, w + 2, len + 1, C.ink); rect(g, x + 1, 7 - len, w, len - 1, C.steel2); rect(g, x + 1, 7 - len, w, 1, C.white); };
  if (cls === "heavy") { barrel(2, 1, 6); barrel(7, 1, 6); } else if (cls === "medium") barrel(4, 2, 6);
  else if (cls === "adaptable") { barrel(4, 2, 5); rect(g, 2, 5, 1, 4, C.brass3); rect(g, 9, 5, 1, 4, C.brass3); } else barrel(4, 1, 6);
  return cv.px.slice(0, 144);
}
const px = (id: string): (string | null)[] => { const cv = itemIcon(id) as unknown as RasterCanvas; return Array.from({ length: 144 }, (_, i) => cv.at(i % 12, Math.floor(i / 12))); };
const lum = (hex: string | null): number => (hex ? [1, 3, 5].reduce((n, k) => n + parseInt(hex.slice(k, k + 2), 16), 0) : 0);
const turrets = Object.values(ITEMS).filter((d) => d.kind === "turret" && d.turret).map((d) => d.id);

describe("PRESENT-3 C: the heavy turrets' icon", () => {
  it("every heavy turret (the SCRAP CANNON first) is 12x12, keeps its mount and gun body (rows 8-11 as before), draws only the old icon's palette, and is lighter: the barrels carry more steel3 and white", () => {
    const heavy = turrets.filter((id) => ITEMS[id].turret!.class === "heavy");
    expect(heavy).toContain("scrapcannon");
    expect(heavy.length).toBeGreaterThan(2);
    for (const id of heavy) {
      const now = px(id), was = oldIcon(id);
      expect(now.length).toBe(144);
      // the mount's lower rows (the rarity rim and the plate) are exactly as they were: the anchor is the same
      for (let i = 8 * 12; i < 144; i++) expect(now[i], `${id}: pixel ${i % 12},${Math.floor(i / 12)} of the mount`).toBe(was[i]);
      // the palette: every colour is one the old icon used
      const old = new Set(was.filter(Boolean)), fresh2 = [...new Set(now.filter(Boolean))];
      for (const c of fresh2) expect(old.has(c), `${id}: colour ${c} was in the old icon`).toBe(true);
      // lighter: the sum of the pixels' brightness rises, steel3 and white pixels in the barrels' rows (0-7) more than double
      const bright = (a: (string | null)[]): number => a.slice(0, 8 * 12).filter((c) => c === C.steel3 || c === C.white).length;
      expect(bright(now), `${id}: bright pixels in the barrels (was ${bright(was)})`).toBeGreaterThan(bright(was) * 2);
      expect(now.reduce((n, c) => n + lum(c), 0), `${id}: lighter overall`).toBeGreaterThan(was.reduce((n, c) => n + lum(c), 0));
    }
    // the SCRAP CANNON's picture, pinned: rows 0-7, `.` clear, `#` ink, `w` white, `s` steel3, `0` steel0 (the gun body's centre)
    const g = px("scrapcannon").slice(0, 8 * 12).map((c) => (c === null ? "." : c === C.ink ? "#" : c === C.white ? "w" : c === C.steel3 ? "s" : c === C.steel1 ? "1" : c === C.steel0 ? "0" : "?"));
    const rows = Array.from({ length: 8 }, (_, y) => g.slice(y * 12, y * 12 + 12).join(""));
    expect(rows).toEqual(["#####..#####", "#w#w#..#w#w#", "#wss#..#wss#", "#wss#..#wss#", "#wss#..#wss#", "#wss####wss#", "#wss#ss#wss#", "#####00#####"]);
  });

  it("the light, medium and adaptable turrets' icons are exactly as they were", () => {
    const others = turrets.filter((id) => ITEMS[id].turret!.class !== "heavy");
    expect(others.length).toBeGreaterThan(5);
    for (const id of others) expect(px(id), id).toEqual(oldIcon(id));
  });
});
