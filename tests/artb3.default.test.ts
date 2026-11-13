// ARTB-CODE-3A (REQ-BFG-126, REQ-BFG-127), item P2: the SECOND PIN of art direction B's default. The release lane's mutant AB1 (the switch's default turned off in src/render/artB.ts) was caught by ONE case
// (tests/artb1.board "the switch is on by default and the setter flips it"). This file pins the default from the other side: it never imports or calls the switch's setter (and no helper that does), so the switch
// stays at what the module starts with; each case then asks a hook for its art and expects the data's own picture. With the default turned off every case here is red.
// Every expectation is decoded from tools/artb/artb-slice.json (tests/artb3.helpers.ts): no pixel is typed.
import { describe, expect, it } from "vitest";
import { R, installRaster } from "./raster.helpers";

installRaster();

import { artBBoard, artBCard, artBFace, artBFactory, artBIcon } from "../src/render/artB";
import { factorySprite, gateSprite, itemIcon } from "../src/render/sprites";
import { iconX2 } from "../src/screens/build/shop";
import { data, expected, phase, same } from "./artb3.helpers";

describe("ARTB-CODE-3A P2: with nothing flipped, the art is on (every case asks a hook, none touches the switch)", () => {
  it("a card: artBCard answers the data's card/<id> (a rig of batch 1, a new rig, a gun, a mod) and MEND PRESS's bare 24x24; the shop's iconX2 shows it", () => {
    for (const id of ["grease", "temper", "dartgun", "wardbell"]) { // ARTB-CODE-3B: "scrapcannon" -> "dartgun" (SCRAP CANNON is held; DART GUN rides)
      same(artBCard(id), expected(`card/${id}`), `${id} artBCard`);
      same(iconX2(id), expected(`card/${id}`), `${id} iconX2`);
    }
    same(artBCard("mendpress"), expected("mendpress"), "mendpress artBCard");
    same(iconX2("mendpress"), expected("mendpress"), "mendpress iconX2");
  });

  it("a face: artBFace answers the data's portrait/<hero id> (32x32) for the four playable heroes", () => {
    for (const id of ["furnace", "weaver", "foundry", "bastion"]) same(artBFace(id), expected(`portrait/${id}`), `${id} face`);
  });

  it("a factory: artBFactory answers the data's bare sprite with its idle phase (frame >> 1) & 3 and its flash, for KILN, a redrawn start factory and MEND PRESS; factorySprite draws the same", () => {
    for (const id of ["kiln", "loom", "mendpress"]) {
      for (const f of [0, 2, 4, 6]) {
        same(artBFactory(id, f, false), expected(id, phase(id, "idle", (f >> 1) & 3)), `${id} artBFactory frame ${f}`);
        same(factorySprite(id, f, false), expected(id, phase(id, "idle", (f >> 1) & 3)), `${id} factorySprite frame ${f}`);
      }
      same(artBFactory(id, 0, true), expected(id, data.work[id].flash ?? []), `${id} artBFactory flash`);
      same(factorySprite(id, 0, true), expected(id, data.work[id].flash ?? []), `${id} factorySprite flash`);
    }
  });

  it("a board sprite: artBBoard answers the data's board/<id> (idle, and the work phase while it works) for a rig of batch 1, a new rig and the redrawn BARBED SPOOL; gateSprite and itemIcon draw the same", () => {
    for (const id of ["grease", "temper", "barbed"]) {
      const name = `board/${id}`;
      same(artBBoard(id, 0, false), expected(name), `${id} artBBoard idle`);
      same(artBBoard(id, 0, true), expected(name, phase(name, "work", 0)), `${id} artBBoard working, phase 0`);
      same(artBBoard(id, 2, true), expected(name, phase(name, "work", 1)), `${id} artBBoard working, phase 1`);
      same(gateSprite(id, 0, false), expected(name), `${id} gateSprite`);
      same(itemIcon(id), expected(name), `${id} itemIcon`);
    }
  });

  it("a small icon: artBIcon and itemIcon answer the data's icon/<id> for a gun, a mod, MEND PRESS and the start factories", () => {
    for (const id of ["dartgun", "wardbell", "mendpress", "kiln", "loom"]) { // ARTB-CODE-3B: "scrapcannon" -> "dartgun" (SCRAP CANNON is held)
      same(artBIcon(id), expected(`icon/${id}`), `${id} artBIcon`);
      same(itemIcon(id), expected(`icon/${id}`), `${id} itemIcon`);
    }
    expect(R(itemIcon("dartgun")).width).toBe(12);
  });
});
