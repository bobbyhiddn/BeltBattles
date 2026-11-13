// ARTB-CODE-3A (REQ-BFG-126), item T (b): the cards, the board sprites and the small icons of the 49 new ids and of BARBED SPOOL (redrawn).
//   - for each of the 49 new ids and for barbed: artBCard(id) is the data's card/<id> (24x24), and so are the shop's iconX2 and the card as drawn (tests/artb1.card.test.ts draws every card on three widths);
//   - for each of the 34 new rigs and for barbed: artBBoard(id, frame, active) is board/<id>, plain and in both work phases (frame >> 1) & 1, and gateSprite, gateSil and itemIcon follow;
//   - for the 13 guns, WARD BELL, MENDING LOOM and MEND PRESS: itemIcon(id) is icon/<id> (12x12); the guns and mods have no board sprite (artBBoard null) and no factory entry (MEND PRESS is a factory: tests/artb3.factory.test.ts).
// Every expectation is decoded from tools/artb/artb-slice.json (tests/artb3.helpers.ts): no pixel, digest or pixel count is typed here.
import { afterEach, describe, expect, it } from "vitest";
import { installRaster } from "./raster.helpers";

installRaster();

import { artBBoard, artBBoardSil, artBBody, artBCard, artBFace, artBFactory, artBHas, artBIcon, setArtB } from "../src/render/artB";
import { gateSil, gateSprite, itemIcon } from "../src/render/sprites";
import { iconX2 } from "../src/screens/build/shop";
import { FRAMES } from "./artb1.helpers";
import { ICON_ONLY, MODS, GUNS, NEW_CARD_IDS, NEW_RIGS, data, expected, phase, same, white } from "./artb3.helpers";

afterEach(() => setArtB(true));

describe("ARTB-CODE-3A T(b): the cards", () => {
  it("artBCard(id) is the data's card/<id>, 24x24, for each of the 49 new ids and for BARBED SPOOL; the shop's iconX2 is the same picture", () => {
    setArtB(true);
    expect(NEW_CARD_IDS.length).toBe(49);
    for (const id of [...NEW_CARD_IDS, "barbed"]) {
      same(artBCard(id), expected(`card/${id}`), `${id} artBCard`);
      same(iconX2(id), expected(`card/${id}`), `${id} iconX2`);
      expect(artBHas(id), `${id}: artBHas`).toBe(true);
    }
  });
});

describe("ARTB-CODE-3A T(b): the board sprites of the 34 new rigs and of BARBED SPOOL", () => {
  it("artBBoard(id, frame, false) is board/<id>; with `active` it is board/<id> with work phase (frame >> 1) & 1 laid over it, at frames 0 to 7 and the wrapped frames (both phases are reached)", () => {
    setArtB(true);
    for (const id of [...NEW_RIGS, "barbed"]) {
      const name = `board/${id}`, work = data.work[name].work!;
      expect(work.length, `${name}: two work phases`).toBe(2);
      for (const f of [...FRAMES, -1, 8, 9, 17]) {
        const m = ((f % 8) + 8) % 8;
        same(artBBoard(id, f, false), expected(name), `${id} frame ${f} idle`);
        same(artBBoard(id, f, true), expected(name, work[(m >> 1) & 1]), `${id} frame ${f} working (phase ${(m >> 1) & 1})`);
      }
      // both phases are used: frames 0 and 1 show phase 0, frames 2 and 3 phase 1
      same(artBBoard(id, 0, true), expected(name, work[0]), `${id} phase 0`);
      same(artBBoard(id, 2, true), expected(name, work[1]), `${id} phase 1`);
    }
  });

  it("gateSprite(id, frame, active) draws the same (the hook in sprites.ts), gateSil(id) is the white silhouette of the idle sprite, and itemIcon(id) is board/<id>, plain", () => {
    setArtB(true);
    for (const id of [...NEW_RIGS, "barbed"]) {
      const name = `board/${id}`;
      for (const f of FRAMES) {
        same(gateSprite(id, f, false), expected(name), `${id} gateSprite frame ${f} idle`);
        same(gateSprite(id, f, true), expected(name, phase(name, "work", (f >> 1) & 1)), `${id} gateSprite frame ${f} working`);
      }
      same(gateSil(id), white(expected(name)), `${id} gateSil`);
      same(artBBoardSil(id), white(expected(name)), `${id} artBBoardSil`);
      same(itemIcon(id), expected(name), `${id} itemIcon`);
      same(artBIcon(id), expected(name), `${id} artBIcon`);
    }
  });

  it("the working phases show: for each of the 34 new rigs and BARBED SPOOL, some working frame draws a picture other than the idle one", () => {
    setArtB(true);
    for (const id of [...NEW_RIGS, "barbed"]) {
      const idle = expected(`board/${id}`).px;
      const phases = [0, 2].map((f) => expected(`board/${id}`, phase(`board/${id}`, "work", (f >> 1) & 1)).px);
      expect(phases.some((px) => px.some((p, i) => p !== idle[i])), `${id}: a work phase differs from idle`).toBe(true);
    }
  });
});

describe("ARTB-CODE-3A T(b): the small icons of the guns, the two mods and MEND PRESS", () => {
  it("itemIcon(id) is the data's icon/<id> (12x12) for the 13 guns, WARD BELL, MENDING LOOM and MEND PRESS; so is artBIcon", () => {
    setArtB(true);
    expect([GUNS.length, MODS.length]).toEqual([13, 2]);
    for (const id of [...ICON_ONLY, "mendpress"]) {
      same(itemIcon(id), expected(`icon/${id}`), `${id} itemIcon`);
      same(artBIcon(id), expected(`icon/${id}`), `${id} artBIcon`);
    }
  });

  it("the guns and the two mods have no board sprite, no body, no factory entry and no face: those hooks answer null for them (the base draws them on the deck)", () => {
    setArtB(true);
    for (const id of ICON_ONLY) {
      expect(artBBoard(id, 0, false), `${id}: no board sprite`).toBeNull();
      expect(artBBoard(id, 2, true), `${id}: no board sprite while working`).toBeNull();
      expect(artBBoardSil(id), `${id}: no board silhouette`).toBeNull();
      expect(artBFactory(id, 0, false), `${id}: not a factory`).toBeNull();
      expect(artBBody(id, 24, 12, 0, false), `${id}: no body`).toBeNull();
      expect(artBFace(id), `${id}: not a hero`).toBeNull();
      expect(artBHas(id), `${id}: art holds it (a card and an icon)`).toBe(true);
    }
  });
});
