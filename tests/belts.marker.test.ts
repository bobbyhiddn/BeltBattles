// bb-0.8.3 (REQ-BFG-043 D11): the board's level marks (render/levelMark.ts), drawn by the game's own entry points
// (render/machinery.ts drawMachinery, render/cruiser.ts drawTurrets) into the software raster (tests/raster.helpers.ts):
// nothing at level 1; at levels 2-4 the level's numeral, yellow on a 5x7 ink plate, on the hero's signature factory and on
// each starting turret (the free copy), in every facing (the build screen's two, a battle's foe's two); every other pixel
// as at level 1, and a turret's plate over nothing the gun or its marks draw. Bought turrets get none; a lifted factory
// none.
import { describe, expect, it } from "vitest";
import { G, diffPx, fresh, installRaster, sig, type RasterCanvas } from "./raster.helpers";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { turretList, turretSlots, type Build } from "../src/sim/deck";
import { ITEMS, type HeroId } from "../src/sim/content";
import { frameForHull, type DeckFrame } from "../src/render/frame";
import { drawMachinery } from "../src/render/machinery";
import { cruiserModel, drawTurrets, type CruiserView } from "../src/render/cruiser";
import { MARK_H, MARK_W, levelMarks } from "../src/render/levelMark";
import { C } from "../src/render/palette";
import { levelMark } from "../src/ui/upgradeText";
import { signatureOf } from "../src/sim/stars";

installRaster();

const HEROES: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
/** The build screen's two facings, portrait (bow north) and landscape (bow east), and a battle's foe's two (bow south,
 *  bow west), each hull with its barrels inside a 200x200 raster. */
const FRAMES: [string, DeckFrame][] = [
  ["portrait", frameForHull(0, 10, 40)], ["landscape", frameForHull(1, 10, 10)], ["foe portrait", frameForHull(2, 10, 10)], ["foe landscape", frameForHull(3, 40, 10)],
];
/** The 3x5 face's numerals (render/font.ts F3), row by row. */
const GLYPH: Record<string, string[]> = {
  "2": ["###", "..#", "###", "#..", "###"], "3": ["###", "..#", "###", "..#", "###"], "4": ["#.#", "#.#", "###", "..#", "..#"],
};

function draw(b: Build, f: DeckFrame): RasterCanvas {
  const c = fresh(200, 200);
  const v: CruiserView = { side: 0, build: b, model: cruiserModel(b), frame: f, t: 0, tread: 0 };
  drawMachinery(G(c), v);
  drawTurrets(G(c), v);
  return c;
}
const levels = (b: Build, turret: number, factory: number): Build =>
  ({ ...b, upgrades: { ...(turret > 1 ? { turret } : {}), ...(factory > 1 ? { factory } : {}) } });

describe("bb-0.8.3 (REQ-BFG-043 D11): the board's level marks", () => {
  it("level 1 marks nothing: every hero's starting deck draws exactly as with no upgrades", () => {
    for (const hero of HEROES) for (const [, f] of FRAMES) {
      const b = heroStartBuild(hero);
      expect(levelMarks(levels(b, 1, 1), f)).toEqual([]);
      expect(sig(draw(levels(b, 1, 1), f))).toBe(sig(draw(b, f)));
    }
  });

  it("levels 2-4: the numeral on the hero factory and on each starting turret, yellow on ink; nothing else moves", () => {
    for (const hero of HEROES) for (const [facing, f] of FRAMES) {
      const b = heroStartBuild(hero), base = draw(b, f);
      const starts = turretSlots(b).filter((s) => s.turret?.free).map((s) => s.slot);
      for (const lv of [2, 3, 4]) {
        const ub = levels(b, lv, lv), marks = levelMarks(ub, f), c = draw(ub, f);
        const at = `${hero} ${facing} level ${lv}`;
        expect(marks.filter((m) => m.track === "factory").map((m) => m.uid), at).toEqual([b.items.find((p) => p.def === signatureOf(hero))!.uid]);
        expect(marks.filter((m) => m.track === "turret").map((m) => m.slot), at).toEqual(starts);
        const inside = (x: number, y: number) => marks.some((m) => x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + m.h);
        expect(diffPx(c, base).filter(([x, y]) => !inside(x, y)), `${at}: pixels changed outside the plates`).toEqual([]);
        for (const m of marks) {
          expect([m.text, m.level, m.w, m.h], at).toEqual([levelMark(lv), lv, MARK_W, MARK_H]);
          for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++) {
            const lit = i >= 1 && i <= 3 && j >= 1 && j <= 5 && GLYPH[m.text][j - 1][i - 1] === "#";
            expect(c.at(m.x + i, m.y + j), `${at}: ${m.track} plate (${i}, ${j})`).toBe(lit ? C.yellow : C.ink);
            // a turret's plate lies where the level-1 board drew nothing: clear of the gun, its pips, gear and SYNC mark
            if (m.track === "turret") expect(base.at(m.x + i, m.y + j), `${at}: under turret ${m.slot}'s plate`).toBeNull();
          }
        }
      }
    }
  });

  it("with any gun in the slot beside a starting turret (WEAVER's 4th, FOUNDRY's 3rd), its plate still covers nothing", () => {
    const guns = Object.values(ITEMS).filter((d) => d.kind === "turret").map((d) => d.id);
    for (const [hero, slot] of [["weaver", 3], ["foundry", 2]] as [HeroId, number][]) for (const def of guns) for (const [facing, f] of FRAMES) {
      const b0 = heroStartBuild(hero), b: Build = { ...b0, turrets: [...turretList(b0), { slot, def, uid: 700 }] };
      const base = draw(b, f), marks = levelMarks(levels(b, 2, 1), f);
      expect(marks.length, `${hero} with a ${def} in slot ${slot + 1}, ${facing}`).toBe(turretList(b0).length);
      for (const m of marks) for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++) {
        expect(base.at(m.x + i, m.y + j), `${hero} with a ${def} in slot ${slot + 1}, ${facing}: under turret ${m.slot}'s plate`).toBeNull();
      }
    }
  });

  it("each track marks its own parts; bought turrets, a stowed starting turret and a lifted factory get none", () => {
    const f = FRAMES[0][1];
    const deck: Build = { ...heroStartBuild("furnace"), turrets: [{ slot: 0, def: "scrapcannon", uid: 90, free: true, stars: 2 }, { slot: 1, def: "bombard", uid: 700 }] };
    const kiln = deck.items.find((p) => p.def === "kiln")!.uid;
    expect(levelMarks(levels(deck, 3, 1), f).map((m) => [m.track, m.slot, m.text])).toEqual([["turret", 0, "3"]]); // merged: still the free copy
    expect(levelMarks(levels(deck, 1, 2), f).map((m) => [m.track, m.uid, m.text])).toEqual([["factory", kiln, "2"]]);
    expect(levelMarks(levels(deck, 4, 4), f, kiln).map((m) => m.track)).toEqual(["turret"]); // the KILN lifted off the deck
    expect(levelMarks(levels({ ...deck, turrets: [{ slot: 1, def: "bombard", uid: 700 }] }, 4, 1), f)).toEqual([]); // stowed
  });
});
