// PRESENT-3 C (REQ-BFG-113 (1); backlog #498 (5)): the heavy turrets' icon reads as a cannon at its size.
//  Before PRESENT-3: render/turretIcon.ts drew every HEAVY turret (the SCRAP CANNON, the RAMPART CANNON ...) as a round mount and two barrels that were 1 px of steel2 between ink lines: a dim grey 12x12
//  picture that no reader of PRESENT-2's K-02 could name (0 of 6, bare or under a grid; the KILN, the other slot, read 4 of 6).
//  Step 1 (598837cc): two FAT upright barrels. Run 2's cold read (the bare control, six fresh seats) read that as a face or a robot: no seat called it a gun. cap's RULINGS-RUN1 item 3 allowed V3.
//  Now (the fix round): V3, a CARRIAGE GUN (a wheel, a carriage, a barrel on the diagonal), the same 12x12 and palette; the rarity rim keeps its place at the wheel's foot. The other classes' icons are untouched.
import { describe, expect, it } from "vitest";
import { installRaster, fresh, G as gOf, type RasterCanvas } from "./raster.helpers";
import { C, RARITY_COLOR } from "../src/render/palette";
import { ITEMS } from "../src/sim/content";
import { itemIcon } from "../src/render/sprites";
import { rect } from "../src/render/pixel";

installRaster();

/** The turret icon as render/turretIcon.ts drew it before PRESENT-3 (every class, the heavy one with its thin barrels), for the comparison. */
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
const turrets = Object.values(ITEMS).filter((d) => d.kind === "turret" && d.turret).map((d) => d.id);

describe("PRESENT-3 C: the heavy turrets' icon", () => {
  it("every heavy turret (the SCRAP CANNON first) is a 12x12 carriage gun: its foot on row 11 as before, only the old icon's palette, the rarity rim at the wheel's foot, brighter barrel pixels than before", () => {
    const heavy = turrets.filter((id) => ITEMS[id].turret!.class === "heavy");
    expect(heavy).toContain("scrapcannon");
    expect(heavy.length).toBeGreaterThan(2);
    for (const id of heavy) {
      const now = px(id), was = oldIcon(id);
      expect(now.length).toBe(144);
      // the anchor: the icon's foot is on the box's last row (ink), as the old icon's was
      expect(now.slice(11 * 12).filter(Boolean).length, `${id}: ink on row 11`).toBeGreaterThan(0);
      expect(now.slice(11 * 12).filter(Boolean).every((c) => c === C.ink), `${id}: row 11 is ink`).toBe(true);
      // the palette: every colour is one the old icon used
      const old = new Set(was.filter(Boolean)), fresh2 = [...new Set(now.filter(Boolean))];
      for (const c of fresh2) expect(old.has(c), `${id}: colour ${c} was in the old icon`).toBe(true);
      // the rarity rim keeps its place (the wheel's foot: x 3-6 on row 10), in the piece's own rarity colour
      for (let x = 3; x <= 6; x++) expect(now[10 * 12 + x], `${id}: the rarity rim at ${x},10`).toBe(RARITY_COLOR[ITEMS[id].rarity]);
      // brighter: the steel3 and white pixels in the barrel's rows (0-7) are at least three times the old icon's
      const bright = (a: (string | null)[]): number => a.slice(0, 8 * 12).filter((c) => c === C.steel3 || c === C.white).length;
      expect(bright(now), `${id}: bright pixels in rows 0-7 (was ${bright(was)})`).toBeGreaterThanOrEqual(bright(was) * 3);
    }
    // the SCRAP CANNON's picture, pinned (common: its rim is steel3): `.` clear, `#` ink, `w` white, `s` steel3, `1` steel1
    const g = px("scrapcannon").map((c) => (c === null ? "." : c === C.ink ? "#" : c === C.white ? "w" : c === C.steel3 ? "s" : c === C.steel1 ? "1" : "?"));
    const rows = Array.from({ length: 12 }, (_, y) => g.slice(y * 12, y * 12 + 12).join(""));
    // PRESENT-4 M (REQ-BFG-113; backlog #531 (5)), old -> new: row 0 was `......#ws#w#`: an ink pixel at x 9 stood between the barrel's steel and the white muzzle pixel (7 of PRESENT-3's readers saw a separate dot or
    // spark); the muzzle's cap is drawn before the steel now, so x 9 is steel3 and the white pixel joins the barrel's end: `......#wssw#`. The other eleven rows are as they were.
    expect(rows).toEqual([
      "......#wssw#", ".....#wss###", "....#wss##..", "...#wss##...", "..##ss##....", ".##ss##.....",
      ".#ss##111#..", ".#########..", "..#1111#....", "..#1ss1#....", "..#ssss#....", "..######....",
    ]);
  });

  it("the light, medium and adaptable turrets' icons are exactly as they were", () => {
    const others = turrets.filter((id) => ITEMS[id].turret!.class !== "heavy");
    expect(others.length).toBeGreaterThan(5);
    for (const id of others) expect(px(id), id).toEqual(oldIcon(id));
  });
});
