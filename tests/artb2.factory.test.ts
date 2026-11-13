// ARTB-CODE-2A (REQ-BFG-126), items T (c) and T (d): batch 2's start factories on the board and in the small icons, and the switch.
// - (c) factorySprite(id) for kiln, loom, crucible and wardworks (the four heroes' start factories, read from HEROES) is the data's sprite with its idle phase (frame >> 1) & 3 at
//   frames 0 to 7 (and the wrapped frames), or with its flash laid over the plain sprite while flash, whatever the stars; factoryFlashSil is the white silhouette of the plain sprite;
//   itemIcon(id) is icon/<id>; artBCard(id) is the bare 24x24 sprite;
// - (d) with the switch off, every hook answers null for the new ids too (the ids batch 2 adds: the three factories and their icons, the three faces; the redrawn rigs BARBED SPOOL and
//   STATIC BRUSH) and every drawing function equals the base's (tests/artb1.base-digests.json: the base's drawing, read once from the base's source: a base digest does not move when the
//   art is replaced); with it on, the new ids' drawings are new art.
// Every expectation is decoded from tools/artb/artb-slice.json: no pixel, digest or pixel count of a sprite is typed into this file.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { R, installRaster } from "./raster.helpers";

installRaster();

import { C } from "../src/render/palette";
import { HEROES, ITEMS } from "../src/sim/content";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { artBBoard, artBBoardSil, artBBody, artBBodySil, artBCard, artBFace, artBFactory, artBFactorySil, artBHas, artBIcon, setArtB } from "../src/render/artB";
import { factoryFlashSil, factorySprite, gateSil, gateSprite, itemIcon } from "../src/render/sprites";
import { FRAMES, allDigests, type Digests } from "./artb1.helpers";

type Px = string | null;
type Ex = { w: number; h: number; px: Px[] };
type Overlay = [number, number, string][];
// (paths are the repo root's, where vitest runs; the repo's node shims declare no node:url)
const data = JSON.parse(readFileSync("tools/artb/artb-slice.json", "utf8")) as {
  legend: Record<string, string>;
  sprites: Record<string, { w: number; h: number; rows: string[] }>;
  work: Record<string, { work?: Overlay[]; idle?: Overlay[]; flash?: Overlay }>;
};
const base = JSON.parse(readFileSync("tests/artb1.base-digests.json", "utf8")) as Digests;
const pal = C as Record<string, string>;
const hex = (ch: string): Px => (ch === "." ? null : pal[data.legend[ch]]);

/** The four playable heroes' start factories, read from the game's content: kiln, loom, crucible, wardworks. */
const FACTORIES = PLAYABLE_HEROES.map((id) => HEROES[id].factory);
/** The factories batch 2 adds (KILN is batch 1's), the redrawn rigs, and the three faces' hero ids. */
const NEW_FACTORIES = FACTORIES.filter((id) => id !== "kiln");
const REDRAWN = ["barbed", "staticbrush"];
const NEW_FACES = PLAYABLE_HEROES.filter((id) => id !== "furnace");
const NEW_IDS = [...NEW_FACTORIES, ...REDRAWN];

/** The sprite `name` of the data as w x h palette hexes (null = clear), with `overlay` laid over it. */
function expected(name: string, overlay: Overlay = []): Ex {
  const s = data.sprites[name];
  const px: Px[] = [];
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) px.push(hex(s.rows[y][x]));
  for (const [x, y, ch] of overlay) px[y * s.w + x] = hex(ch);
  return { w: s.w, h: s.h, px };
}
const idle = (name: string, i: number): Overlay => { const l = data.work[name]?.idle; return l && l.length ? l[i % l.length] : []; };
const white = (e: Ex): Ex => ({ ...e, px: e.px.map((p) => (p === null ? null : C.white)) });
function same(c: HTMLCanvasElement | null, e: Ex, what: string): void {
  expect(c, `${what}: a canvas`).not.toBeNull();
  const r = R(c);
  expect([r.width, r.height], `${what}: size`).toEqual([e.w, e.h]);
  expect(r.px, `${what}: pixels`).toEqual(e.px);
}

afterEach(() => setArtB(true));

describe("ARTB-CODE-2A T(c): the four start factories on the board and in the small icons show the data", () => {
  it("the four start factories are kiln, loom, crucible and wardworks (HEROES), and the data holds each as a bare 24x24 sprite with an idle entry and a flash", () => {
    expect([...FACTORIES].sort()).toEqual(["crucible", "kiln", "loom", "wardworks"]);
    for (const id of FACTORIES) {
      expect(ITEMS[id].kind, `${id} is a factory`).toBe("factory");
      expect([data.sprites[id].w, data.sprites[id].h], id).toEqual([24, 24]);
      expect(data.work[id].idle!.length, `${id}: four idle phases`).toBe(4);
      expect(data.work[id].flash!.length, `${id}: a flash`).toBeGreaterThan(0);
    }
  });

  it("factorySprite(id) is the data's sprite with its idle phase (frame >> 1) & 3, at frames 0 to 7 and the wrapped frames, whatever the stars", () => {
    setArtB(true);
    for (const id of FACTORIES) for (const f of [...FRAMES, -3, 8, 11, 17]) for (const stars of [1, 2, 3]) {
      const m = ((f % 8) + 8) % 8;
      same(factorySprite(id, f, false, stars), expected(id, idle(id, (m >> 1) & 3)), `${id} frame ${f} stars ${stars}`);
    }
  });

  it("the idle phases show: for each factory, frames 2 to 7 draw a picture other than frame 0's (the plain sprite), and frames 0 and 1 are the plain sprite", () => {
    setArtB(true);
    for (const id of FACTORIES) {
      const plain = R(factorySprite(id, 0, false)).px;
      expect(R(factorySprite(id, 1, false)).px, `${id} frame 1 = frame 0`).toEqual(plain);
      for (const f of [2, 3, 4, 5, 6, 7]) expect(R(factorySprite(id, f, false)).px, `${id} frame ${f} differs from the plain sprite`).not.toEqual(plain);
    }
  });

  it("with the flash, factorySprite(id) is the plain sprite with the data's flash overlay over it, at every frame and star level", () => {
    setArtB(true);
    for (const id of FACTORIES) for (const f of [...FRAMES, -3, 11]) for (const stars of [1, 2, 3]) {
      same(factorySprite(id, f, true, stars), expected(id, data.work[id].flash ?? []), `${id} frame ${f} flash stars ${stars}`);
    }
  });

  it("factoryFlashSil(id, stars) is the white silhouette of the plain sprite (the stamp flash follows the new sprite)", () => {
    setArtB(true);
    for (const id of FACTORIES) for (const stars of [1, 2, 3]) same(factoryFlashSil(id, stars), white(expected(id)), `${id} factoryFlashSil stars ${stars}`);
    for (const id of FACTORIES) same(artBFactorySil(id), white(expected(id)), `${id} artBFactorySil`);
  });

  it("itemIcon(id) is icon/<id>, 12x12, plain; artBCard(id) is the bare 24x24 sprite", () => {
    setArtB(true);
    for (const id of FACTORIES) {
      same(itemIcon(id), expected(`icon/${id}`), `${id} itemIcon`);
      same(artBIcon(id), expected(`icon/${id}`), `${id} artBIcon`);
      same(artBCard(id), expected(id), `${id} artBCard`);
      expect(artBHas(id), `${id}: artBHas`).toBe(true);
    }
  });

  it("the redrawn rigs: BARBED SPOOL's and STATIC BRUSH's gateSprite, gateSil and itemIcon are the data's board/<id> (and its work phases); the card picture of BARBED SPOOL is card/barbed", () => {
    setArtB(true);
    for (const id of REDRAWN) {
      const name = `board/${id}`, work = data.work[name].work!;
      expect(work.length, `${name}: two work phases`).toBe(2);
      same(gateSprite(id, 0, false), expected(name), `${id} idle`);
      same(gateSprite(id, 0, true), expected(name, work[0]), `${id} work phase 0`);
      same(gateSprite(id, 2, true), expected(name, work[1]), `${id} work phase 1`);
      same(gateSil(id), white(expected(name)), `${id} gateSil`);
      same(itemIcon(id), expected(name), `${id} itemIcon`);
      same(artBBoardSil(id), white(expected(name)), `${id} artBBoardSil`);
    }
    same(artBCard("barbed"), expected("card/barbed"), "barbed artBCard");
    same(artBCard("staticbrush"), expected("card/staticbrush"), "staticbrush artBCard");
  });

  it("the faces: artBFace(id) is the data's portrait/<hero id> (32x32) for the four playable heroes", () => {
    setArtB(true);
    for (const id of PLAYABLE_HEROES) same(artBFace(id), expected(`portrait/${id}`), `${id} face`);
  });
});

describe("ARTB-CODE-2A T(d): with the switch off every hook answers the base for the new ids too; with it on they are new art", () => {
  it("switch OFF: every hook answers null (artBHas false) for the ids batch 2 adds or redraws and for the four heroes' faces", () => {
    setArtB(false);
    for (const id of [...NEW_IDS, ...PLAYABLE_HEROES]) {
      expect(artBHas(id), id).toBe(false);
      expect([artBIcon(id), artBCard(id), artBBoard(id, 0, false), artBBoard(id, 2, true), artBBoardSil(id), artBFactory(id, 0, false), artBFactory(id, 0, true), artBFactorySil(id),
        artBBody(id, 24, 12, 0, false), artBBody(id, 12, 24, 0, true), artBBodySil(id, 24, 12), artBFace(id)], id).toEqual(Array.from({ length: 12 }, () => null));
    }
  });

  it("switch OFF: every drawing function of the new ids (icon, gate, gate silhouette, factory at 8 frames x flash x 3 star levels, factory silhouette) equals the base's digests", () => {
    setArtB(false);
    const off = allDigests(NEW_IDS);
    for (const fn of ["icon", "gate", "gateSil", "factory", "factorySil"]) {
      expect(Object.keys(off[fn]).sort(), `${fn}: the new ids`).toEqual([...NEW_IDS].sort());
      for (const id of NEW_IDS) expect(off[fn][id], `${fn} ${id}: the base's`).toBe(base[fn][id]);
    }
  });

  it("switch ON: the three factories' icon, factory and flash silhouette are new art (they differ from the base's); BARBED SPOOL's and STATIC BRUSH's icon, gate and gate silhouette too", () => {
    setArtB(true);
    const on = allDigests(NEW_IDS);
    for (const id of NEW_FACTORIES) {
      expect(on.icon[id], `${id} icon is new art`).not.toBe(base.icon[id]);
      expect(on.factory[id], `${id} factorySprite is new art`).not.toBe(base.factory[id]);
      expect(on.factorySil[id], `${id} factoryFlashSil follows the new sprite`).not.toBe(base.factorySil[id]);
    }
    for (const id of REDRAWN) {
      expect(on.icon[id], `${id} icon is new art`).not.toBe(base.icon[id]);
      expect(on.gate[id], `${id} gateSprite is new art`).not.toBe(base.gate[id]);
      expect(on.gateSil[id], `${id} gateSil follows the new sprite`).not.toBe(base.gateSil[id]);
    }
  });

  it("toggling the switch swaps the factories' pictures both ways (on, off, on: no cache keeps the other art)", () => {
    for (const id of NEW_FACTORIES) {
      setArtB(true);
      const a = [R(factorySprite(id, 2, false)).px.slice(), R(itemIcon(id)).px.slice(), R(factoryFlashSil(id)).px.slice()];
      setArtB(false);
      const b = [R(factorySprite(id, 2, false)).px.slice(), R(itemIcon(id)).px.slice(), R(factoryFlashSil(id)).px.slice()];
      // ARTB-CODE-3A (the verifier's soft point 3, VERIFY-ARTB2): the pictures drawn with the art on just before are gone: off IS the base (its digests), not only "differs from on"
      const off = allDigests([id]);
      for (const fn of ["icon", "factory", "factorySil"]) expect(off[fn][id], `${id} ${fn}: off = the base's (after a draw with the art on)`).toBe(base[fn][id]);
      setArtB(true);
      const c = [R(factorySprite(id, 2, false)).px.slice(), R(itemIcon(id)).px.slice(), R(factoryFlashSil(id)).px.slice()];
      for (let k = 0; k < 3; k++) {
        expect(c[k], `${id} part ${k}: on again = on`).toEqual(a[k]);
        expect(b[k], `${id} part ${k}: off differs from on`).not.toEqual(a[k]);
      }
      same(factoryFlashSil(id), white(expected(id)), `${id} factoryFlashSil back on`);
    }
  });

  it("the three faces' hero ids: artBFace answers with the switch on and null with it off (hero select's 24x24 face runs then: tests/artb2.hero.test.ts)", () => {
    for (const id of NEW_FACES) {
      setArtB(true);
      expect(artBFace(id), `${id} on`).not.toBeNull();
      setArtB(false);
      expect(artBFace(id), `${id} off`).toBeNull();
    }
  });
});
