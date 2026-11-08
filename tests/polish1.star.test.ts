// POLISH-1 (REQ-BFG-089; BRIEF-POLISH1 P5; cap's answer 2 on ENCHANT-2W's read, REVIEW-ENCHANT2W.md:76): the panel's star and its (i).
//  (a) a part's tap panel shows its star at ★1 too: `NAME ★` (the placed rig's, the cargo piece's, the installed turret's, an enchanted piece's `WORD NAME ★`); ★2 and ★3 as they were;
//  (b) the (i) button's glyph reads as "more about this piece", not as a 1 (desk readers took the bare "i" for the star level): the 5x7 face's `?` (picked by a blind read of three candidates), in the same 5x7 box and place as the bare "i" it replaces.
import { afterEach, describe, expect, it } from "vitest";
import { G, fresh, installRaster } from "./raster.helpers";
import { newRun, type Run } from "../src/game/run";
import { cargoPanel, itemPanel, turretPanel } from "../src/screens/build/inspector";
import { drawInfoGlyph } from "../src/screens/build/keywords";
import { glyphRows } from "../src/render/font";
import { setTurretList, type Build } from "../src/sim/deck";
import { ENCHANT, setEnchant, withEnchant } from "../src/sim/enchant";
import { ITEMS } from "../src/sim/content";
import { C } from "../src/render/palette";

installRaster();
afterEach(() => setEnchant(ENCHANT));

function runWith(items: Build["items"] = [], cargo: Run["inventory"] = [], turrets: Parameters<typeof setTurretList>[1] = []): Run {
  const run = newRun("furnace", 5, "polish1-star");
  run.build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, ...items], routes: [], mods: [], beltCap: 40, hullBonus: 0 };
  run.inventory = cargo;
  if (turrets.length) setTurretList(run.build, turrets);
  return run;
}

describe("POLISH-1 P5a: a part's panel title shows its star at ★1 too", () => {
  it("a placed rig, a cargo piece and an installed turret: ★1 `NAME ★`, ★2 `NAME ★★`, ★3 `NAME ★★★`", () => {
    for (const stars of [1, 2, 3]) {
      const mark = "★".repeat(stars);
      const run = runWith([{ uid: 20, def: "whetstone", x: 2, y: 2, stars }], [{ uid: 30, def: "whetstone", stars } as Run["inventory"][number]], [{ slot: 0, def: "scrapcannon", uid: 90, stars } as never]);
      expect(itemPanel(run, 20)!.title, `placed ★${stars}`).toBe(`${ITEMS.whetstone.name} ${mark}`);
      expect(cargoPanel(run, 30)!.title, `cargo ★${stars}`).toBe(`${ITEMS.whetstone.name} ${mark}`);
      expect(turretPanel(run, 0)!.title, `turret ★${stars}`).toBe(`${ITEMS.scrapcannon.name} ${mark}`);
    }
  });

  it("an enchanted ★1 part: the word first, then the name and the star", () => {
    withEnchant(() => {
      const run = runWith([{ uid: 20, def: "whetstone", x: 2, y: 2, ench: "fiery" } as never]);
      expect(itemPanel(run, 20)!.title).toBe(`FIERY ${ITEMS.whetstone.name} ★`);
    }, true);
  });

  it("an empty turret slot keeps its title (no part, no star)", () => {
    const run = runWith();
    const t = turretPanel(run, 3);
    if (t) expect(t.title).toMatch(/^TURRET SLOT 4$|★/);
  });
});

// P5b (final, run 3): the candidates read picked B, the 5x7 face's `?` (7 of 8 seats read it as a help button that explains the part; the ring round an i of 48e219d0 was read as a letter
// badge by 6 of 8, the filled badge as a padlock by 8 of 8): the glyph is the font's own `?` in the old glyph's 5x7 box
describe("POLISH-1 P5b: the (i) button's glyph is the 5x7 face's `?`, in the old glyph's 5x7 box", () => {
  const draw = (colour: string): (string | null)[][] => {
    const c = fresh(12, 12);
    // the box the keyword layer inks: (qb.x + 11, qb.y + 9) 5x7; the glyph's (x, y) is the box + (1, 1). Here the box is at (3, 2).
    drawInfoGlyph(G(c), 4, 3, colour);
    return Array.from({ length: 12 }, (_, y) => Array.from({ length: 12 }, (_, x) => c.at(x, y)));
  };

  it("the pixels: the 5 wide, 7 tall `?` of the 5x7 face (the hook at the top, the stem, the dot at (2, 6)); nothing outside the box", () => {
    const px = draw(C.brass3);
    const want = [
      ".###.",
      "#...#",
      "....#",
      "...#.",
      "..#..",
      ".....",
      "..#..",
    ];
    expect(want, "the font's own ?").toEqual(glyphRows("?", "5"));
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
      const inBox = x >= 3 && x < 8 && y >= 2 && y < 9;
      const lit = inBox && want[y - 2][x - 3] === "#";
      expect(px[y][x], `(${x},${y})`).toBe(lit ? C.brass3 : null);
    }
  });

  it("it is not the bare i (a serif and a foot, the glyph the desk readers took for a 1): no row of the box is a full-width serif; lit in yellow when the view is open", () => {
    const px = draw(C.yellow);
    const rows = px.map((r) => r.map((p) => (p ? "#" : ".")).join(""));
    expect(rows.slice(2, 9).map((r) => r.slice(3, 8))).not.toContain("#####"); // no solid bar (the bare i drew a serif and a foot)
    expect(rows.slice(2, 9).map((r) => r.slice(3, 8))[0]).toBe(".###."); // the hook, not the bare i's dot over a stem
    expect(px[2][4]).toBe(C.yellow); // the hook's first pixel, (1, 0) of the box
  });
});
