// ARTB-CODE-2A (REQ-BFG-126), item N1 (cap's REVIEW-CODE1B, N1): artB.ts artBCard answers for a bare id that is a sprite name (KILN's `kiln`; with batch 2 also `loom`,
// `crucible`, `wardworks`). An id with a "/" in it is a sprite's NAME in the data ("card/barbed", "board/barbed", "icon/loom", "body/nailstrip", "portrait/weaver"), never a
// piece's id, so it must answer null there, as artBFactory and artBHas already did. The expectations read the names from the data (the generated constants): no pixel is typed.
import { afterEach, describe, expect, it } from "vitest";
import { R, installRaster } from "./raster.helpers";

installRaster();

import { ART_B_SPRITES } from "../src/render/artBData";
import { artBBoard, artBBody, artBCard, artBFace, artBFactory, artBHas, artBIcon, setArtB } from "../src/render/artB";

const NAMES = Object.keys(ART_B_SPRITES);
const SLASHED = NAMES.filter((n) => n.includes("/"));
const BARE = NAMES.filter((n) => !n.includes("/"));
/** ids with a "/" that are not a sprite's name at all, and edge shapes of one */
const MADE_UP = ["a/b", "card/", "/kiln", "card/card/barbed", "portrait/", "kiln/", "/", "card/kiln", "board/kiln", "icon/kiln"];

afterEach(() => setArtB(true));

describe("ARTB-CODE-2A N1: an id with a '/' is never a piece's id: artBCard answers null for it, as every other hook does", () => {
  it("the data has sprite names with a '/' (the five kinds) and bare names (the factories): the cases below are not empty", () => {
    expect(SLASHED.length).toBeGreaterThan(0);
    for (const kind of ["card/", "board/", "icon/", "body/", "portrait/"]) expect(SLASHED.some((n) => n.startsWith(kind)), kind).toBe(true);
    expect(BARE).toContain("kiln");
  });

  it("artBCard answers null for every sprite name that has a '/' and for every made-up id with a '/' (the switch on)", () => {
    setArtB(true);
    for (const n of [...SLASHED, ...MADE_UP]) expect(artBCard(n), `artBCard(${JSON.stringify(n)})`).toBeNull();
  });

  it("every other hook answers null (artBHas: false) for those ids too, with the switch on: only a piece's own id is answered", () => {
    setArtB(true);
    for (const n of [...SLASHED, ...MADE_UP]) {
      expect(artBHas(n), `artBHas(${JSON.stringify(n)})`).toBe(false);
      expect([artBIcon(n), artBCard(n), artBBoard(n, 0, false), artBBoard(n, 3, true), artBFactory(n, 0, false), artBFactory(n, 0, true), artBBody(n, 24, 12, 0, false), artBBody(n, 12, 24, 0, true), artBFace(n)], JSON.stringify(n))
        .toEqual([null, null, null, null, null, null, null, null, null]);
    }
  });

  it("a bare id that is a sprite name still answers: artBCard of it is the sprite itself, 24x24 (the card picture of KILN and, with batch 2, of the other factories)", () => {
    setArtB(true);
    for (const id of BARE) {
      const s = ART_B_SPRITES[id], c = artBCard(id);
      expect(c, `artBCard(${id})`).not.toBeNull();
      const r = R(c);
      expect([r.width, r.height], `${id}: the card picture is the bare sprite's size`).toEqual([s.w, s.h]);
      expect(artBHas(id), `artBHas(${id})`).toBe(true);
    }
  });

  it("with the switch off artBCard answers null for every name and id (the guard changes nothing there)", () => {
    setArtB(false);
    for (const n of [...NAMES, ...MADE_UP]) expect(artBCard(n), n).toBeNull();
  });
});
