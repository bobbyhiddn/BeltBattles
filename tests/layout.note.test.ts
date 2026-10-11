import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { battleLayout, battleScale } from "../src/game/battleLayout";
import { computeView } from "../src/core/io";
import { textWidth } from "../src/render/font";
import { SOURCE_OFFLINE, SOURCE_ONLINE } from "../src/game/session";
import { ghostName } from "../src/game/day";
import { standInFoe } from "../src/game/ghosts";
import { NOTE_ROW, notePlace, plateSource, plateTag } from "../src/screens/battleHud";
import type { Box } from "../src/render/frame";
import { withHullScale } from "../src/sim/hullScale"; // AZ-BUMP (the flip): 0.6.2's layout is the switch-off one

// 0.7.0 (R1 M1; REQ-BFG-016): the enemy plate's source line (ONLINE GHOST / OFFLINE STAND-IN, online only) overlaps
// neither the hull nor the plate's text on any layout. 0.7.0a drew it just under the plate when no row was free above it,
// which on a phone (the plate at the screen's top edge) is the enemy hull's top rail. Now: in the free row above the
// plate where the layout leaves one (0.7.0a's spot, desktop 1920x1080), else inside the plate's strip as a tag before the
// name. The battle layout itself is never changed: it is 0.6.2's online and offline, pinned by a digest below.

const NOTES = [SOURCE_ONLINE, SOURCE_OFFLINE];
const inside = (b: Box, W: number, H: number) => b.x >= 0 && b.y >= 0 && b.x + b.w <= W && b.y + b.h <= H;
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Viewports in CSS px and dpr: the layout test's grid, plus landscape and portrait phones. */
function grid(): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const dpr of [1, 2, 3]) {
    for (let w = 320; w <= 2560; w += 97) for (let h = 480; h <= 1600; h += 83) out.push([w, h, dpr]);
    for (let w = 568; w <= 932; w += 41) for (let h = 320; h <= 430; h += 11) out.push([w, h, dpr]); // landscape phones
    for (let w = 320; w <= 430; w += 11) for (let h = 568; h <= 932; h += 41) out.push([w, h, dpr]); // portrait phones
  }
  return out;
}

/** The digest of 0.6.2's battleLayout over grid(), taken at v070a a8b9973 (battleLayout.ts is rel-062-final's). */
const LAYOUT_062 = "0a9a0f8b 129102c0 9dee4af1 18af96f3 b98452bb 81ef0bfe 344f1449 d54fdd49";
/** AZ-BUMP (the flip, HULL_SCALE): the same grid's digest with HULL_SCALE on (the shipped game), measured on the flip's src:
 *  HULL-1d's desk wind slot (ruling Q4; tests/hull1d.readouts) makes a landscape bar DESK_WIND_W wider (battleLayout.ts barW:
 *  min(W - 8, 150 + 40), was min(W - 8, 150)), so the WIND n%/S read-out fits beside the clock. The switch is battleLayout's
 *  only read (no other box moves); with it off the grid still hashes to LAYOUT_062. */
const LAYOUT_AZ = "3d569f73 460d022d 05bf5cdd 92ff1142 024666a9 9acedbe7 94e9b2ba 3cb24960";

/** Where 0.7.0a drew the line: text at (p.x + 3, p.y - 7) with a free row, else at (p.x + 3, p.y + p.h + 2); its box
 *  includes the 1 px outline. */
function line070a(p: Box, text: string): Box {
  const y = p.y >= 8 ? p.y - 7 : p.y + p.h + 2;
  return { x: p.x + 2, y: y - 1, w: textWidth(text, "3") + 2, h: 7 };
}

describe("the enemy plate's source line (0.7.0 R1 M1)", () => {
  it("the battle layout is 0.6.2's on every screen (1,602 viewports, one digest), online and offline alike", () => {
    const layouts = () => grid().map(([w, h, dpr]) => {
      const v = computeView(w, h, dpr, battleScale);
      return [w, h, dpr, v.scale, battleLayout(v.W, v.H, v.portrait)];
    });
    const all = layouts();
    expect(all).toHaveLength(1602);
    // AZ-BUMP (the flip, HULL_SCALE): 0a9a0f8b... -> 3d569f73... (LAYOUT_AZ), the desk wind slot the switch ships; the switch
    // off: 0.6.2's digest, as before
    expect(createHash("sha256").update(JSON.stringify(all)).digest("hex")).toBe(LAYOUT_AZ.replace(/ /g, ""));
    expect(createHash("sha256").update(JSON.stringify(withHullScale(layouts, false))).digest("hex")).toBe(LAYOUT_062.replace(/ /g, ""));
  });

  it("on every layout the line has a clean place: the free row above the plate (touching nothing), else the plate's strip", () => {
    const count = { above: 0, plate: 0, fell: 0 };
    for (const [w, h, dpr] of grid()) {
      const v = computeView(w, h, dpr, battleScale);
      const L = battleLayout(v.W, v.H, v.portrait);
      const p = L.plates[1];
      const place = notePlace(L);
      count[place]++;
      for (const text of NOTES) {
        const old = line070a(p, text);
        if (L.hulls.some((hb) => overlap(old, hb))) count.fell++; // where 0.7.0a's line sat on a hull
        if (place === "above") {
          expect(p.y).toBeGreaterThanOrEqual(NOTE_ROW);
          expect(old).toEqual({ x: p.x + 2, y: p.y - NOTE_ROW, w: textWidth(text, "3") + 2, h: NOTE_ROW - 1 }); // 0.7.0a's spot
          expect(inside(old, v.W, v.H)).toBe(true);
          for (const b of [...L.hulls, ...L.plates, L.bar, L.gapBox]) expect(overlap(old, b), `${w}x${h}@${dpr}`).toBe(false);
        } else {
          expect(p.y).toBeLessThan(NOTE_ROW);
          expect(p.w).toBeGreaterThanOrEqual(132); // the narrowest plate, for which every name is checked below
        }
      }
    }
    expect(count.above + count.plate).toBe(1602);
    expect(count.above).toBeGreaterThan(0);
    expect(count.plate).toBeGreaterThan(0);
    expect(count.fell).toBeGreaterThan(0); // the bug: 0.7.0a's line on a hull, on every "plate" layout
    expect(count.fell).toBe(count.plate * NOTES.length);
  });

  // the browser check's views (scripts/asynccheck.mjs M1) and the I1 screenshots
  const at = (css: [number, number], dpr: number) => {
    const v = computeView(css[0], css[1], dpr, battleScale);
    return { v, L: battleLayout(v.W, v.H, v.portrait) };
  };

  it("phone portrait 390x844 (iPhone): the plate at the top edge, 0.7.0a's line on the hull's top rail; now in the plate", () => {
    const { v, L } = at([390, 844], 3);
    expect([v.W, v.H, v.scale, v.portrait]).toEqual([195, 422, 6, true]);
    expect(L.plates[1].y).toBe(0);
    expect(overlap(line070a(L.plates[1], SOURCE_ONLINE), L.hulls[1])).toBe(true);
    expect(notePlace(L)).toBe("plate");
  });

  it("desktop 1920x1080 keeps its free row above the plate, where 0.7.0a drew the line", () => {
    const { L } = at([1920, 1080], 1);
    expect(L.plates[1].y).toBe(18);
    expect(notePlace(L)).toBe("above");
  });

  it("landscape: a small phone 640x360 has the row; an iPhone 844x390 and a 1366x768 laptop don't (0.7.0a's line fell on the hull)", () => {
    for (const [css, dpr, place] of [[[640, 360], 2, "above"], [[667, 375], 2, "above"], [[844, 390], 3, "plate"], [[1366, 768], 1, "plate"]] as const) {
      const { v, L } = at([css[0], css[1]], dpr);
      expect(v.portrait).toBe(false);
      expect(notePlace(L), `${css[0]}x${css[1]}`).toBe(place);
      expect(L.hulls.some((hb) => overlap(line070a(L.plates[1], SOURCE_OFFLINE), hb))).toBe(place === "plate");
    }
  });

  it("the plate's form: ONLINE before the ghost's hero and record, OFFLINE before the stand-in captain's name", () => {
    expect(plateSource("GHOST · WEAVER · 0W 5♥", SOURCE_ONLINE)).toEqual({ tag: "ONLINE", name: "WEAVER · 0W 5♥" });
    expect(plateSource("SILKSHADE", SOURCE_OFFLINE)).toEqual({ tag: "OFFLINE", name: "SILKSHADE" });
    expect(plateSource("SILKSHADE", "SOMETHING ELSE")).toEqual({ tag: "SOMETHING ELSE", name: "SILKSHADE" });
    expect(plateTag("ONLINE")).toBe("ONLINE ·");
  });

  it("inside the plate's strip, every ghost and stand-in name fits with its tag, the hull bar and a 4-digit hull", () => {
    const names: [string, string][] = [];
    for (const hero of ["furnace", "weaver"] as const) {
      for (let wins = 0; wins <= 9; wins++) for (let lives = 1; lives <= 5; lives++) names.push([ghostName({ hero, wins, lives }), SOURCE_ONLINE]);
    }
    const captains = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) for (let day = 1; day <= 10; day++) captains.add(standInFoe(seed, day).name);
    for (const c of captains) names.push([c, SOURCE_OFFLINE]);
    expect(captains.size).toBeGreaterThan(10);
    let narrowest = Infinity;
    for (const [name, note] of names) {
      const s = plateSource(name, note);
      // drawPlate on the narrowest plate (132 px): 3 | tag 4 | name 3 | bar | 3 hp 3
      const bar = 132 - 3 - (textWidth(plateTag(s.tag), "3") + 4) - textWidth(s.name, "3") - 3 - 3 - textWidth("9999", "3") - 3;
      narrowest = Math.min(narrowest, bar);
      expect(bar, `${name} (${note})`).toBeGreaterThanOrEqual(16); // drawPlate draws the bar above 8 px
    }
    expect(narrowest).toBeLessThan(40); // the widest names are checked, not just short ones
  });
});
