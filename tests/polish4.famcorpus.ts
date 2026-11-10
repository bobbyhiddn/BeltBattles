// POLISH-4 (REQ-BFG-089; P4-5): the corpus of tests/present2.famhead.test.ts (and tests/families.test.ts) -- 1,303 panels: every offer, cargo part, placed rig, factory and turret -- as a module of its own for tests/polish4.sub1.test.ts.
// A copy of that file's generator, unchanged (PRESENT-2 W (b)); not a test file. PHONE / DESK / LAPTOP are the three build-screen info areas it reads (a 161x69 phone band, the 126 px desk column, the 119 px laptop column).
import { installRaster } from "./raster.helpers";
import { buyableModules } from "../src/sim/content";
import { key as K, rotField, setTurretList, type Placed } from "../src/sim/deck";
import { rotFacing, stokeSpots } from "../src/sim/beltside";
import { fusible } from "../src/sim/stars";
import { newRun, type Run } from "../src/game/run";
import { buildLayout, type Sel } from "../src/screens/build/layout";
import { cargoPanel, itemPanel, offerPanel, rigPanel, turretPanel, type PanelText } from "../src/screens/build/inspector";

installRaster();

export const MODULES = buyableModules();
export const PHONE = buildLayout(167, 394, true, 5).info;
export const DESK = buildLayout(480, 270, false, 5).info;
export const LAPTOP = buildLayout(455, 256, false, 5).info;
const SHORT = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const SIDE = [K(6, 5), K(6, 4), K(6, 3), K(6, 2), K(6, 1), K(5, 1), K(5, 0)];
function rigRun(def: string, stars: number, x: number, y: number, rot: number, spare: number): Run {
  const run = newRun("furnace", 5, "fam");
  run.inventory = Array.from({ length: spare }, (_, i) => ({ uid: 800 + i, def }));
  run.build = {
    hero: "furnace", mods: [], beltCap: 30, hullBonus: 0,
    items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 7, def: "press", x: 6, y: 6 }, { uid: 10, def, x, y, ...rotField(def, rot), ...(stars > 1 ? { stars } : {}) } as Placed],
    routes: [{ factory: 1, cells: [...SHORT] }, { factory: 7, cells: [...SIDE] }],
  };
  return run;
}
export interface Case { id: string; run: Run; sel: Sel; t: PanelText }
export function corpus(): Case[] {
  const out: Case[] = [];
  for (const d of MODULES) for (const s of [1, 2, 3]) {
    for (const spare of [0, 1]) {
      const run = newRun("furnace", 5, "fam");
      run.inventory = [{ uid: 900, def: d.id, ...(s > 1 ? { stars: s } : {}) }, ...Array.from({ length: spare }, (_, i) => ({ uid: 800 + i, def: d.id }))];
      out.push({ id: `cargo ${d.id} ★${s} spare${spare}`, run, sel: { kind: "cargo", uid: 900 }, t: cargoPanel(run, 900)! });
    }
    if (d.kind === "gate") {
      const base = rigRun(d.id, s, 0, 9, 0, 0);
      const spot = d.gate?.stoke ? stokeSpots(base.build, d.id)[0] : null;
      const lays: [string, number, number, number][] = spot ? [["stoke", spot.x, spot.y, spot.rot], ["idle", 0, 9, 0]] : [["1hit", 3, 3, rotFacing(d.id, 1)], ["idle", 0, 9, 0]];
      for (const [lay, x, y, rot] of lays) {
        const run = rigRun(d.id, s, x, y, rot, 1);
        out.push({ id: `rig ${d.id} ★${s} ${lay}`, run, sel: { kind: "item", uid: 10 }, t: { ...rigPanel(run, 10)! } });
      }
    }
    if (d.kind === "factory") {
      const run = newRun("furnace", 5, "fam");
      run.build.items.push({ uid: 901, def: d.id, x: 6, y: 6, ...(s > 1 ? { stars: s } : {}) });
      run.build.routes.push({ factory: 901, cells: [56, 55, 45, 35, 25, 15, 5] });
      out.push({ id: `placed ${d.id} ★${s}`, run, sel: { kind: "item", uid: 901 }, t: itemPanel(run, 901)! });
    }
    if (d.kind === "turret") {
      const run = newRun("furnace", 5, "fam");
      setTurretList(run.build, [{ slot: 0, def: d.id, uid: 700, ...(s > 1 ? { stars: s } : {}) }]);
      out.push({ id: `installed ${d.id} ★${s}`, run, sel: { kind: "turret", index: 0 }, t: turretPanel(run, 0)! });
    }
  }
  for (const d of MODULES) for (const held of fusible(d.id) ? [[], [1]] : [[]]) {
    const run = newRun("furnace", 5, "fam");
    run.gold = 99;
    run.inventory = held.map((s, i) => ({ uid: 950 + i, def: d.id, ...(s > 1 ? { stars: s } : {}) }));
    run.shop.wagons = [{ merchant: d.merchant!, offers: [{ def: d.id, price: d.price, sold: false }] }] as Run["shop"]["wagons"];
    out.push({ id: `offer ${d.id} held[${held}]`, run, sel: { kind: "offer", wagon: 0, slot: 0 }, t: offerPanel(run, 0, 0)! });
  }
  return out;
}
