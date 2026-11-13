// ARTB-CODE-3A (REQ-BFG-126), items T (e) and T (g): the one switch and the new ids.
//   (e) with the switch OFF every hook answers the base for every new id: every art hook answers null (artBHas false), and every drawing function (icon, gate, gate silhouette, factory at 8 frames x flash x 3 star
//       levels, factory silhouette, the shaped bodies) equals the base's digests (tests/artb1.base-digests.json: the base's drawing, read once from the base's source: a base digest does not move when the art
//       is replaced); the shop's card picture is the base's icon doubled;
//   (g) with the switch ON (the verifier's soft point 2, VERIFY-ARTB2): EXACTLY the functions the art draws for an id differ from the base's, every other digest of every id of ITEMS equals the base's: so the gate and
//       gate-silhouette digests of LOOM, CRUCIBLE, WARDWORKS and MEND PRESS (factories: the art draws their factory, flash silhouette and icon, never a rig's board sprite) are the base's, and so are the bodies of
//       the shaped rigs the art has no body for; on, off, on swaps both ways with "off = the base" asserted (soft point 3).
// Every expectation is decoded from tools/artb/artb-slice.json or read from the base's digests: no pixel, digest or pixel count is typed here.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { R, installRaster } from "./raster.helpers";

installRaster();

import { ITEMS } from "../src/sim/content";
import { artBBoard, artBBoardSil, artBBody, artBBodySil, artBCard, artBFace, artBFactory, artBFactorySil, artBHas, artBIcon, setArtB } from "../src/render/artB";
import { itemIcon } from "../src/render/sprites";
import { iconX2 } from "../src/screens/build/shop";
import { allDigests, type Digests } from "./artb1.helpers";
import { ALL_RIGS, FACTORY_PIECES, GUNS, ICON_ONLY, MODS, NEW_CARD_IDS, NEW_RIGS, SHAPED, SLICE_IDS } from "./artb3.helpers";

const base = JSON.parse(readFileSync("tests/artb1.base-digests.json", "utf8")) as Digests;
/** the ids this swap adds or redraws (new cards, the five factories' new or redrawn art, BARBED SPOOL): every one of them a piece of ITEMS */
const NEW_IDS = [...NEW_CARD_IDS, "mendpress", "loom", "crucible", "barbed"];

/** For each drawing function of allDigests: does the art draw this id's? (the others are the base's, the switch on or off) */
const ART_DRAWS: Record<string, (id: string) => boolean> = {
  icon: (id) => SLICE_IDS.includes(id),
  gate: (id) => ALL_RIGS.includes(id),
  gateSil: (id) => ALL_RIGS.includes(id),
  factory: (id) => FACTORY_PIECES.includes(id),
  factorySil: (id) => FACTORY_PIECES.includes(id),
  body: (id) => SHAPED.includes(id),
  bodySil: (id) => SHAPED.includes(id),
  sfactory: () => false,
  sfactorySil: () => false,
};

afterEach(() => setArtB(true));

describe("ARTB-CODE-3A T(e): with the switch off, every hook answers the base for every new id", () => {
  it("the new ids are pieces of ITEMS (a name that is not a piece would never show); the list is 49 new cards, MEND PRESS, LOOM, CRUCIBLE and BARBED SPOOL", () => {
    expect(NEW_IDS.length).toBe(49 + 4);
    expect(new Set(NEW_IDS).size).toBe(NEW_IDS.length);
    for (const id of NEW_IDS) expect(ITEMS[id], id).toBeDefined();
    for (const id of SLICE_IDS) expect(ITEMS[id], id).toBeDefined();
    expect(SLICE_IDS.length).toBe(64);
  });

  it("switch OFF: artBHas is false and every art hook answers null (icon, card, board at both states, board silhouette, factory at both states, factory silhouette, bodies, face) for all 64 ids", () => {
    setArtB(false);
    for (const id of SLICE_IDS) {
      expect(artBHas(id), id).toBe(false);
      expect([artBIcon(id), artBCard(id), artBBoard(id, 0, false), artBBoard(id, 2, true), artBBoardSil(id), artBFactory(id, 0, false), artBFactory(id, 0, true), artBFactorySil(id),
        artBBody(id, 24, 12, 0, false), artBBody(id, 12, 24, 0, true), artBBodySil(id, 24, 12), artBFace(id)], id).toEqual(Array.from({ length: 12 }, () => null));
    }
  });

  it("switch OFF: every drawing function of every new id (and of all 64) equals the base's digests: icon, gate, gate silhouette, factory, factory silhouette, the shaped bodies", () => {
    setArtB(false);
    const ids = [...new Set([...SLICE_IDS, ...NEW_IDS])];
    const off = allDigests(ids);
    for (const fn of Object.keys(base)) {
      for (const key of Object.keys(off[fn])) expect(off[fn][key], `${fn} ${key}: the base's`).toBe(base[fn][key]);
    }
    for (const fn of ["icon", "gate", "gateSil", "factory", "factorySil"]) expect(Object.keys(off[fn]).sort(), `${fn}: the 64 ids`).toEqual([...ids].sort());
  });

  it("switch OFF: the shop's card picture of every new card is the base's: the icon doubled, pixel for pixel (24x24)", () => {
    setArtB(false);
    for (const id of [...NEW_CARD_IDS, "mendpress", "loom", "crucible", "barbed"]) {
      const ic = R(itemIcon(id)), card = R(iconX2(id));
      expect([card.width, card.height], `${id}: 24x24`).toEqual([2 * ic.width, 2 * ic.height]);
      const dbl: (string | null)[] = [];
      for (let y = 0; y < card.height; y++) for (let x = 0; x < card.width; x++) dbl.push(ic.px[(y >> 1) * ic.width + (x >> 1)]);
      expect(card.px, `${id}: the icon doubled`).toEqual(dbl);
    }
  });
});

describe("ARTB-CODE-3A T(g): with the switch on, exactly the art's functions differ from the base's; on, off, on is clean", () => {
  it("switch ON: for every id of ITEMS and every drawing function, the digest differs from the base's where the art draws that function for that id and equals it everywhere else (the gate and gate-silhouette digests of LOOM, CRUCIBLE, WARDWORKS and MEND PRESS are the base's)", () => {
    setArtB(true);
    const on = allDigests();
    let same = 0, differ = 0;
    for (const fn of Object.keys(base)) {
      expect(Object.keys(on[fn]).sort(), `${fn}: the same keys`).toEqual(Object.keys(base[fn]).sort());
      for (const key of Object.keys(base[fn])) {
        const id = key.split("@")[0];
        if (ART_DRAWS[fn](id)) { expect(on[fn][key], `${fn} ${key}: the art draws it, so not the base's`).not.toBe(base[fn][key]); differ++; }
        else { expect(on[fn][key], `${fn} ${key}: the art does not draw it, so the base's`).toBe(base[fn][key]); same++; }
      }
    }
    expect(differ, "the art's own digests").toBeGreaterThan(0);
    expect(same, "the base's digests that stay").toBeGreaterThan(0);
    for (const id of ["loom", "crucible", "wardworks", "mendpress"]) {
      expect(on.gate[id], `${id}: gate digest = the base's`).toBe(base.gate[id]);
      expect(on.gateSil[id], `${id}: gateSil digest = the base's`).toBe(base.gateSil[id]);
      expect(on.factory[id], `${id}: factory digest is new art`).not.toBe(base.factory[id]);
    }
    // the guns, the mods and the new shaped rigs have no body or factory art: their body and factory digests stay the base's
    for (const id of [...GUNS, ...MODS]) for (const fn of ["gate", "gateSil", "factory", "factorySil"]) expect(on[fn][id], `${fn} ${id}: no art here, so the base's`).toBe(base[fn][id]);
    for (const id of NEW_RIGS) for (const fn of ["factory", "factorySil"]) expect(on[fn][id], `${fn} ${id}`).toBe(base[fn][id]);
    for (const k of Object.keys(base.body)) if (!SHAPED.includes(k.split("@")[0])) expect(on.body[k], `body ${k}: the base's`).toBe(base.body[k]);
  });

  it("on, off, on: the 64 ids' drawings swap both ways (the pictures drawn with the art on are gone with it off: off = the base's digests; on again = on)", () => {
    setArtB(true);
    const a = allDigests(ICON_ONLY.concat(NEW_RIGS, FACTORY_PIECES, ["barbed"]));
    setArtB(false);
    const b = allDigests(ICON_ONLY.concat(NEW_RIGS, FACTORY_PIECES, ["barbed"]));
    setArtB(true);
    const c = allDigests(ICON_ONLY.concat(NEW_RIGS, FACTORY_PIECES, ["barbed"]));
    expect(c, "on again = on").toEqual(a);
    for (const fn of Object.keys(base)) for (const key of Object.keys(b[fn])) {
      expect(b[fn][key], `${fn} ${key}: off = the base's`).toBe(base[fn][key]);
      if (ART_DRAWS[fn](key.split("@")[0])) expect(a[fn][key], `${fn} ${key}: on differs from off`).not.toBe(b[fn][key]);
    }
  });
});
