// ARTB-CODE-3A (REQ-BFG-126), items T (c) and T (d): MEND PRESS (batch 3a) on the board and in the small icon, the factories that borrow the base's art, and the pieces batch 2R redraws.
//   (c) factorySprite("mendpress") is the data's bare 24x24 sprite with its idle phase (frame >> 1) & 3 at frames 0 to 7 (and the wrapped ones) and with its flash laid over the plain sprite, whatever the stars;
//       factoryFlashSil is the white silhouette of the plain sprite; itemIcon is icon/mendpress; the card picture is the bare sprite; CLOCKWORKS and SUMP (METRONOME's and SIPHON's start factories), which borrow
//       STAMP PRESS's art as MEND PRESS did, still equal the base (tests/artb1.base-digests.json: the base's drawing), the switch on;
//   (d) LOOM and CRUCIBLE (24x24 and their 12x12 icons) and BARBED SPOOL (card, board sprite and its work phases) equal the NEW data. The tests of tests/artb2.factory.test.ts that read the data follow by
//       themselves (they decode the JSON at run time): "factorySprite(id) is the data's sprite ...", "the idle phases show", "with the flash ...", "factoryFlashSil ...", "itemIcon(id) is icon/<id> ...",
//       "the redrawn rigs ..." (BARBED SPOOL) and the on/off/on test; they were green on the new data without an edit. The same is asserted here by name, once, so the question has its own answer.
// Every expectation is decoded from tools/artb/artb-slice.json (tests/artb3.helpers.ts): no pixel, digest or pixel count of a sprite is typed here.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { R, installRaster } from "./raster.helpers";

installRaster();

import { HEROES, ITEMS } from "../src/sim/content";
import { artBBoard, artBCard, artBFactory, artBFactorySil, artBHas, artBIcon, setArtB } from "../src/render/artB";
import { factoryFlashSil, factorySprite, gateSil, gateSprite, itemIcon } from "../src/render/sprites";
import { iconX2 } from "../src/screens/build/shop";
import { FRAMES, allDigests, type Digests } from "./artb1.helpers";
import { FACTORY_PIECES, data, expected, phase, same, white } from "./artb3.helpers";

const base = JSON.parse(readFileSync("tests/artb1.base-digests.json", "utf8")) as Digests;
/** METRONOME's and SIPHON's start factories (read from the game's content): they borrow STAMP PRESS's art, no sprite of theirs in the data */
const BORROWERS = ["metronome", "siphon"].map((h) => HEROES[h as "metronome" | "siphon"].factory);

afterEach(() => setArtB(true));

describe("ARTB-CODE-3A T(c): MEND PRESS on the board and in the small icon", () => {
  it("MEND PRESS is a factory of the game (kind factory) and the data holds it as a bare 24x24 sprite with an idle entry (four phases, the first plain), a flash and its own icon/mendpress", () => {
    expect(ITEMS.mendpress.kind).toBe("factory");
    expect([data.sprites.mendpress.w, data.sprites.mendpress.h]).toEqual([24, 24]);
    expect([data.sprites["icon/mendpress"].w, data.sprites["icon/mendpress"].h]).toEqual([12, 12]);
    expect(data.work.mendpress.idle!.length).toBe(4);
    expect(data.work.mendpress.idle![0]).toEqual([]);
    expect(data.work.mendpress.flash!.length).toBeGreaterThan(0);
    expect(Object.keys(data.work.mendpress).sort()).toEqual(["flash", "idle"]);
  });

  it("factorySprite('mendpress') is the data's sprite with its idle phase (frame >> 1) & 3 at frames 0 to 7 and the wrapped frames, whatever the stars; frames 0 and 1 are the plain sprite, frames 2 to 7 are not", () => {
    setArtB(true);
    for (const f of [...FRAMES, -3, 8, 11, 17]) for (const stars of [1, 2, 3]) {
      const m = ((f % 8) + 8) % 8;
      same(factorySprite("mendpress", f, false, stars), expected("mendpress", phase("mendpress", "idle", (m >> 1) & 3)), `mendpress frame ${f} stars ${stars}`);
      same(artBFactory("mendpress", f, false), expected("mendpress", phase("mendpress", "idle", (m >> 1) & 3)), `mendpress artBFactory frame ${f}`);
    }
    const plain = R(factorySprite("mendpress", 0, false)).px;
    expect(R(factorySprite("mendpress", 1, false)).px, "frame 1 = frame 0").toEqual(plain);
    for (const f of [2, 3, 4, 5, 6, 7]) expect(R(factorySprite("mendpress", f, false)).px, `frame ${f} differs from the plain sprite`).not.toEqual(plain);
  });

  it("with the flash, factorySprite('mendpress') is the plain sprite with the data's flash overlay over it, at every frame and star level", () => {
    setArtB(true);
    for (const f of [...FRAMES, -3, 11]) for (const stars of [1, 2, 3]) same(factorySprite("mendpress", f, true, stars), expected("mendpress", data.work.mendpress.flash ?? []), `mendpress frame ${f} flash stars ${stars}`);
  });

  it("factoryFlashSil('mendpress', stars) is the white silhouette of the plain sprite; itemIcon and artBIcon are icon/mendpress; the card picture (artBCard, iconX2) is the bare sprite", () => {
    setArtB(true);
    for (const stars of [1, 2, 3]) same(factoryFlashSil("mendpress", stars), white(expected("mendpress")), `mendpress factoryFlashSil stars ${stars}`);
    same(artBFactorySil("mendpress"), white(expected("mendpress")), "mendpress artBFactorySil");
    same(itemIcon("mendpress"), expected("icon/mendpress"), "mendpress itemIcon");
    same(artBIcon("mendpress"), expected("icon/mendpress"), "mendpress artBIcon");
    same(artBCard("mendpress"), expected("mendpress"), "mendpress artBCard");
    same(iconX2("mendpress"), expected("mendpress"), "mendpress iconX2");
    expect(artBHas("mendpress")).toBe(true);
    expect(artBBoard("mendpress", 0, false), "no board sprite: a factory is not a rig").toBeNull();
  });

  it("CLOCKWORKS and SUMP borrow STAMP PRESS's art as MEND PRESS did: no sprite of theirs in the data, every hook null, and with the art ON their drawings equal the base's (icon, gate, gate silhouette, factory at 8 frames x flash x 3 stars, factory silhouette)", () => {
    expect(BORROWERS).toEqual(["clockworks", "sump"]);
    setArtB(true);
    const on = allDigests(BORROWERS);
    for (const id of BORROWERS) {
      expect(Object.keys(data.sprites).filter((n) => n === id || n.endsWith(`/${id}`)), `${id}: no sprite in the data`).toEqual([]);
      expect([artBHas(id), artBIcon(id), artBCard(id), artBBoard(id, 0, false), artBFactory(id, 0, false), artBFactorySil(id)], id).toEqual([false, null, null, null, null, null]);
      for (const fn of ["icon", "gate", "gateSil", "factory", "factorySil"]) expect(on[fn][id], `${fn} ${id}: the base's, the art on`).toBe(base[fn][id]);
    }
  });
});

describe("ARTB-CODE-3A T(d): LOOM, CRUCIBLE, their icons and BARBED SPOOL are the NEW data", () => {
  it("factorySprite, factoryFlashSil, itemIcon and the card picture of LOOM and CRUCIBLE are the data's loom, crucible and icon/loom, icon/crucible (idle phases at frames 0 to 7, the flash)", () => {
    setArtB(true);
    for (const id of ["loom", "crucible"]) {
      for (const f of FRAMES) same(factorySprite(id, f, false), expected(id, phase(id, "idle", (f >> 1) & 3)), `${id} frame ${f}`);
      same(factorySprite(id, 0, true), expected(id, data.work[id].flash ?? []), `${id} flash`);
      same(factoryFlashSil(id), white(expected(id)), `${id} factoryFlashSil`);
      same(itemIcon(id), expected(`icon/${id}`), `${id} itemIcon`);
      same(iconX2(id), expected(id), `${id} iconX2`);
    }
  });

  it("BARBED SPOOL: gateSprite (idle and both work phases), gateSil, itemIcon are the data's board/barbed and its work phases; its card is card/barbed", () => {
    setArtB(true);
    const name = "board/barbed", work = data.work[name].work!;
    expect(work.length).toBe(2);
    same(gateSprite("barbed", 0, false), expected(name), "barbed idle");
    same(gateSprite("barbed", 0, true), expected(name, work[0]), "barbed work phase 0");
    same(gateSprite("barbed", 2, true), expected(name, work[1]), "barbed work phase 1");
    same(gateSil("barbed"), white(expected(name)), "barbed gateSil");
    same(itemIcon("barbed"), expected(name), "barbed itemIcon");
    same(artBCard("barbed"), expected("card/barbed"), "barbed artBCard");
    same(iconX2("barbed"), expected("card/barbed"), "barbed iconX2");
  });

  it("the five factories of the data are exactly kiln, loom, crucible, wardworks and mendpress", () => {
    expect(Object.keys(data.sprites).filter((n) => !n.includes("/")).sort()).toEqual([...FACTORY_PIECES].sort());
  });
});
