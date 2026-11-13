// PRESENT-5 M2 (REQ-BFG-113; backlog #537 (4)): the carriage gun (src/render/turretIcon.ts carriageGun, every heavy turret's icon) has no detached white muzzle pixel.
//  PRESENT-3 C drew a white pixel at (10, 0), off the barrel's end inside an ink cap; three of six of PRESENT-4's readers took it for a glint or spark (K-03), and PRESENT-4 M's try of joining it to the barrel read as a blade
//  (a cannon or gun 2 of 6) and was put back. M2 drops the pixel (candidate A of O/img/m2/candidates.png): row 0 `......#ws#w#` -> `......#ws###`, every other pixel PRESENT-3's.
//  This guard pins the new rows for every heavy turret (every rarity's rim) and that no bright pixel stands alone. (tests/present3.cannon.test.ts pins the SCRAP CANNON's rows and that the other classes' icons are as they were.)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setArtB } from "../src/render/artB";
import { installRaster, type RasterCanvas } from "./raster.helpers";
import { C, RARITY_COLOR } from "../src/render/palette";
import { ITEMS } from "../src/sim/content";
import { itemIcon } from "../src/render/sprites";

installRaster();

// ARTB-CODE-3A (REQ-BFG-126), old -> new: art direction B now draws the 13 gun pieces' small icon (icon/<id>, batch 3a): with the switch on itemIcon is art B's picture, not the carriage gun's rows (scrapcannon: white pixels in rows 0-9:
// 0, the old rows 4). This file pins the BASE carriage gun (src/render/turretIcon.ts carriageGun, the VITE_ARTB=0 path), so it runs with the switch off, every assert as it was; art B's icons are pinned in tests/artb3.board.test.ts.
beforeAll(() => setArtB(false));
afterAll(() => setArtB(true));

const px = (id: string): (string | null)[] => { const cv = itemIcon(id) as unknown as RasterCanvas; return Array.from({ length: 144 }, (_, i) => cv.at(i % 12, Math.floor(i / 12))); };
const heavy = Object.values(ITEMS).filter((d) => d.kind === "turret" && d.turret && d.turret.class === "heavy").map((d) => d.id);
/** the icon as letters: `.` clear, `#` ink, `w` white, `s` steel3, `1` steel1, `r` the part's rarity rim colour where it is none of those (a common part's rim IS steel3, so it shows as `s`), `?` anything else */
const letters = (id: string): string[] => {
  const rim = RARITY_COLOR[ITEMS[id].rarity];
  const g = px(id).map((c) => (c === null ? "." : c === C.ink ? "#" : c === C.white ? "w" : c === C.steel3 ? "s" : c === C.steel1 ? "1" : c === rim ? "r" : "?"));
  return Array.from({ length: 12 }, (_, y) => g.slice(y * 12, y * 12 + 12).join(""));
};
/** PRESENT-3's rows (the base's), row 0 with the white muzzle pixel: the oracle for "every other pixel is as it was" */
const BASE_ROWS = ["......#ws#w#", ".....#wss###", "....#wss##..", "...#wss##...", "..##ss##....", ".##ss##.....", ".#ss##111#..", ".#########..", "..#1111#....", "..#1ss1#....", "..#ssss#....", "..######...."];
const NEW_ROWS = ["......#ws###", ...BASE_ROWS.slice(1)];
/** does a pixel of the icon (not ink, not clear) have a neighbour of the same kind (8 neighbours)? */
const aloneIn = (lit: (x: number, y: number) => boolean): number => {
  let n = 0;
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) if (lit(x, y) && ![-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => (dx || dy) && lit(x + dx, y + dy)))) n++;
  return n;
};

describe("PRESENT-5 M2: the carriage gun's muzzle is an ink cap, not a white pixel off the barrel's end", () => {
  it("every heavy turret (the five; the SCRAP CANNON first) draws the new rows: row 0 `......#ws###`, the other eleven PRESENT-3's, the rim at the wheel's foot in the part's own rarity colour", () => {
    expect(heavy).toContain("scrapcannon");
    expect(heavy.length).toBeGreaterThanOrEqual(5); // PRESENT-4 counted five heavy turrets (the SCRAP CANNON, the RAMPART CANNON ...)
    for (const id of heavy) {
      const rim = RARITY_COLOR[ITEMS[id].rarity], g = px(id);
      expect(g.length).toBe(144);
      expect(g[0 * 12 + 10], `${id}: (10, 0) is ink, where PRESENT-3 had white`).toBe(C.ink);
      // the white pixels of the barrel's rows (0-9; the rim on row 10 may be any rarity colour): the barrel's top edge (4, 3) (5, 2) (6, 1) (7, 0) and nothing else (PRESENT-3: and (10, 0))
      expect(g.slice(0, 10 * 12).filter((c) => c === C.white).length, `${id}: white pixels in rows 0-9`).toBe(4);
      const want = NEW_ROWS.map((r, y) => (y === 10 && rim !== C.steel3 ? r.replace("ssss", "rrrr") : r));
      expect(letters(id), `${id}: the rows`).toEqual(want);
      for (let x = 3; x <= 6; x++) expect(g[10 * 12 + x], `${id}: the rarity rim at ${x},10`).toBe(rim);
    }
  });

  it("no bright pixel stands alone: every pixel of a heavy turret's icon that is not ink touches (8 neighbours) another that is not ink (PRESENT-3's muzzle pixel had none: all its neighbours were ink), and PRESENT-3's rows held exactly one such pixel", () => {
    for (const id of heavy) {
      const g = px(id);
      expect(aloneIn((x, y) => x >= 0 && y >= 0 && x < 12 && y < 12 && g[y * 12 + x] !== null && g[y * 12 + x] !== C.ink), `${id}: bright pixels with no lit neighbour`).toBe(0);
    }
    const base = BASE_ROWS.map((r) => r.split(""));
    expect(aloneIn((x, y) => x >= 0 && y >= 0 && x < 12 && y < 12 && base[y][x] !== "." && base[y][x] !== "#"), "PRESENT-3's icon: the muzzle pixel").toBe(1);
  });
});
