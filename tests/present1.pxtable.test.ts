// PRESENT-1 S1 (d) (REQ-BFG-113 (2): "at least 6 CSS px a cell on a phone"): the px table, every grid surface x view, with its px a cell.
// A grid is drawn at gridCell(def, face) art px a cell (5; PICKAXE 4 where the surface's box is an icon's: iconCell) on a screen whose logical scale puts
// one art px at `css` CSS px (scale / dpr, read from the built page on each view: output-present1/scenes, kit/viewscales.mjs). CSS px a cell = cell x css.
// The rows below are that product; the test pins the rule (every piece >= 6 CSS px on every surface and view that has room, PICKAXE included) and names each
// exception: the surfaces whose box is an icon's keep PICKAXE at 4 art px (5.33 CSS px on a landscape phone's x4), and every cell on the 320x568 @2 phone's
// battle and victory screens (one CSS px an art px: 5.00 at 5 px).
import { describe, expect, it } from "vitest";
import { ITEMS } from "../src/sim/content";
import { CARD_TEXT_MIN_W, CARD_W } from "../src/screens/build/layout";
import { CARGO_FACE, gridCell, hasGrid, iconCell } from "../src/ui/shapePic";
import { shapedPiece } from "../src/screens/build/shapeEdit";

/** CSS px per art px, per view and screen (build, fork, event, warlord = the victory card and its pick; battle): measured on the page, kit/viewscales.mjs. */
const VIEWS: [string, Record<"build" | "fork" | "event" | "warlord" | "battle", number>][] = [
  ["402x690@3", { build: 5 / 3, fork: 6 / 3, event: 6 / 3, warlord: 5 / 3, battle: 5 / 3 }],
  ["390x844@3", { build: 5 / 3, fork: 6 / 3, event: 6 / 3, warlord: 6 / 3, battle: 6 / 3 }],
  ["844x390@3", { build: 4 / 3, fork: 4 / 3, event: 4 / 3, warlord: 6 / 3, battle: 6 / 3 }],
  ["360x640@2", { build: 3 / 2, fork: 3 / 2, event: 3 / 2, warlord: 3 / 2, battle: 3 / 2 }],
  ["375x667@2", { build: 3 / 2, fork: 3 / 2, event: 3 / 2, warlord: 3 / 2, battle: 3 / 2 }],
  ["320x568@2", { build: 3 / 2, fork: 3 / 2, event: 3 / 2, warlord: 2 / 2, battle: 2 / 2 }],
  ["1280x800@1", { build: 2, fork: 2, event: 2, warlord: 3, battle: 3 }],
  ["1440x900@2", { build: 6 / 2, fork: 6 / 2, event: 6 / 2, warlord: 8 / 2, battle: 8 / 2 }],
  ["1920x1080@1", { build: 4, fork: 4, event: 4, warlord: 5, battle: 5 }],
];

type Screen = "build" | "fork" | "event" | "warlord" | "battle";
/** Each surface: its screen, and the art px a cell for a piece on it (`narrowCard`: the phone's 46 px shop card; `wide`: a landscape or desk card). */
const SURFACES: { name: string; screen: Screen; cell: (id: string) => number; icon: boolean; only?: "portrait" | "wide" }[] = [
  { name: "shop card, phone (46 px)", screen: "build", cell: (id) => gridCell(id, CARD_W >= CARD_TEXT_MIN_W ? Infinity : CARGO_FACE), icon: true, only: "portrait" },
  { name: "shop card, wide (69-70 px)", screen: "build", cell: (id) => gridCell(id), icon: false, only: "wide" },
  { name: "cargo slot", screen: "build", cell: iconCell, icon: true },
  { name: "LAST CHANCE part card, plate", screen: "build", cell: (id) => gridCell(id), icon: false },
  { name: "LAST CHANCE part card, corner", screen: "build", cell: iconCell, icon: true },
  { name: "victory drop card, plate", screen: "warlord", cell: (id) => gridCell(id), icon: false },
  { name: "victory drop card, corner", screen: "warlord", cell: iconCell, icon: true },
  { name: "warlord pick button", screen: "warlord", cell: (id) => gridCell(id), icon: false },
  { name: "drop icons (fork card)", screen: "fork", cell: iconCell, icon: true },
  { name: "drop list row", screen: "fork", cell: (id) => gridCell(id), icon: false },
  { name: "fork reward icons", screen: "fork", cell: iconCell, icon: true },
  { name: "road event choice card", screen: "event", cell: (id) => gridCell(id), icon: false },
  { name: "scout report deck icons", screen: "event", cell: iconCell, icon: true },
];
const LANDSCAPE = new Set(["844x390@3", "1280x800@1", "1440x900@2", "1920x1080@1"]);

describe("PRESENT-1 S1 (d): CSS px a cell, every grid surface x view", () => {
  const shaped = Object.keys(ITEMS).filter((id) => hasGrid(id));

  it("every piece, every surface that has a view: at least 6 CSS px a cell, but the named exceptions; PICKAXE on a surface with room is 6.67 at x4@3", () => {
    const rows: string[] = [];
    const exceptions: Record<string, string[]> = {};
    for (const [vn, css] of VIEWS) {
      const wide = LANDSCAPE.has(vn);
      for (const s of SURFACES) {
        if (s.only === "wide" && !wide) continue;
        if (s.only === "portrait" && wide) continue;
        const c = css[s.screen];
        for (const id of shaped) {
          const px = s.cell(id) * c;
          if (px < 6 - 1e-9) (exceptions[`${vn} ${s.name}`] ??= []).push(`${id} ${px.toFixed(2)}`);
        }
      }
      // the PICKAXE row of this view
      rows.push(`${vn}: ` + SURFACES.filter((s) => !(s.only === "wide" && !wide) && !(s.only === "portrait" && wide)).map((s) => `${s.name} ${(s.cell("pickaxe") * css[s.screen]).toFixed(2)}`).join("; "));
    }
    // eslint-disable-next-line no-console
    console.log(`PRESENT-1 S1 (d) PICKAXE's CSS px a cell, per view and surface:\n${rows.join("\n")}\nBelow 6 (every piece):\n${Object.entries(exceptions).map(([k, v]) => `  ${k}: ${v.join(", ")}`).join("\n")}`);
    // 1. a surface with room (no `icon`): 6 CSS px or more on every view but 320x568 @2's warlord screen (1 CSS px an art px: 5.00)
    for (const [k, v] of Object.entries(exceptions)) {
      const [vn, ...rest] = k.split(" ");
      const name = rest.join(" "), s = SURFACES.find((q) => q.name === name)!;
      if (!s.icon) expect(vn === "320x568@2" && s.screen === "warlord", `${k}: ${v.join(", ")}`).toBe(true);
      else {
        // 2. an icon surface: only PICKAXE's 4 art px at 1.333 / 1.0 CSS px (5.33 / 4.00), and every other piece on the 1.0 screen
        for (const e of v) expect(e.startsWith("pickaxe ") || (vn === "320x568@2" && s.screen === "warlord"), `${k}: ${e}`).toBe(true);
      }
    }
    // the stated outcome: PICKAXE on the 844x390 @3 phone's x4 screens: the surfaces with room 6.67, the icon surfaces 5.33
    const land = VIEWS.find(([n]) => n === "844x390@3")![1];
    expect(gridCell("pickaxe") * land.build).toBeCloseTo(6.667, 2);
    expect(iconCell("pickaxe") * land.build).toBeCloseTo(5.333, 2);
    expect(Object.keys(exceptions).length).toBeGreaterThan(0);
  });

  it("only PICKAXE's grid is wider than the 16 px face at 5 px: gridCell with no face is 5 for every piece", () => {
    for (const id of shaped) expect(gridCell(id), id).toBe(5);
    expect(shaped.filter((id) => iconCell(id) === 4)).toEqual(["pickaxe"]);
    expect(shaped.filter((id) => shapedPiece(id)).length).toBe(11);
  });
});
