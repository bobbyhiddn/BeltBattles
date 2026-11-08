// POLISH-3 (REQ-BFG-089; BRIEF-POLISH3 Q4, the pieces lane's display list, item 1d; cap's ruling E): THE SHOP-OFFER PANEL'S TITLE CARRIES ITS STAR.
//   offerPanel gave `title: d.name`; every other panel's title is `NAME ★` since POLISH-1's P5a (inspector.ts `titled`): the offer beside the same piece in cargo read `FUSER` against `FUSER ★`.
//   The offer is drawn at ★1 (its abilityBlocks take star 1): the title is `NAME ★` always; the merge's ★2 stays on the button (`MERGE ★2: 3G`).
import { describe, expect, it } from "vitest";
import { installRaster } from "./raster.helpers";
import { framed } from "./polish2.guestCorpus";
import { buyableModules } from "../src/sim/content";
import { fusible } from "../src/sim/stars";
import { newRun, type Run } from "../src/game/run";
import { cargoPanel, offerPanel, planPanel, selFamilies } from "../src/screens/build/inspector";

installRaster();

const MODULES = buyableModules();
function offerRun(def: string, held: readonly number[]): Run {
  const d = MODULES.find((m) => m.id === def)!;
  const run = newRun("furnace", 5, "offer-title");
  run.gold = 99;
  run.inventory = held.map((s, i) => ({ uid: 950 + i, def, ...(s > 1 ? { stars: s } : {}) }));
  run.shop.wagons = [{ merchant: d.merchant!, offers: [{ def, price: d.price, sold: false }] }] as Run["shop"]["wagons"];
  return run;
}

describe("POLISH-3 Q4: the offer panel's title is `NAME ★`", () => {
  it("every buyable module's offer reads `NAME ★`, the same title as the piece in cargo at ★1", () => {
    let n = 0;
    for (const d of MODULES) {
      const run = offerRun(d.id, [1]);
      const offer = offerPanel(run, 0, 0)!, cargo = cargoPanel(run, 950)!;
      expect(offer.title, d.id).toBe(`${d.name} ★`);
      expect(offer.title, `${d.id}: the offer and the cargo twin`).toBe(cargo.title);
      n++;
    }
    expect(n, "buyable modules").toBeGreaterThan(100);
  });

  it("the merge's ★2 stays on the button: a piece the cargo holds at ★1 merges to ★2, the title says one star", () => {
    let merges = 0;
    for (const d of MODULES) {
      if (!fusible(d.id)) continue;
      const offer = offerPanel(offerRun(d.id, [1]), 0, 0)!;
      expect(offer.title, d.id).toBe(`${d.name} ★`);
      const label = offer.labels[0];
      if (/MERGE/.test(label)) { merges++; expect(label, `${d.id}: the button`).toMatch(/MERGE ★2/); }
    }
    expect(merges, "offers that merge").toBeGreaterThan(20);
  });

  it("402x690 and 360x640 (bands of 235 px and more): the star costs no offer its family head's place; 320x568 too", () => {
    for (const v of [[402, 690, 3], [360, 640, 2], [320, 568, 2]] as [number, number, number][]) {
      const f = framed(v[0], v[1], v[2], 0), area = f.L.info;
      let n = 0;
      for (const d of MODULES) for (const held of fusible(d.id) ? [[], [1]] : [[]]) {
        const run = offerRun(d.id, held), t = offerPanel(run, 0, 0)!, fam = selFamilies(run, { kind: "offer", wagon: 0, slot: 0 });
        const withStar = planPanel(t, area, fam, { tap: f.tap, band: true }).famHead, bare = planPanel({ ...t, title: t.title.slice(0, -2) }, area, fam, { tap: f.tap, band: true }).famHead;
        expect(JSON.stringify(withStar), `${v.join("x")} ${d.id} held[${held}]: the head's place`).toBe(JSON.stringify(bare));
        n++;
      }
      expect(n).toBeGreaterThan(150);
    }
  });
});
