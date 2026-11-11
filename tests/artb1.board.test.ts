// ARTB-CODE-1 (REQ-BFG-126), items M and B: art direction B's first slice on the board and in the small icons, and the one switch.
// - M: with the switch on, an id the data holds is answered here; any other id gets null ("not mine"); with it off every function answers null.
// - B: for each slice id the canvas equals the data's sprite with the right phase laid over it (every frame 0..7, idle and working, KILN's flash; a body lying and
//   transposed), the hit flashes are the white silhouettes of those sprites; for EVERY other id in ITEMS, gateSprite, gateSil, itemIcon, factorySprite,
//   factoryFlashSil and the shaped bodies are identical to the pixel with the switch on and off, and equal the BASE's (tests/artb1.base-digests.json, read from
//   artb1-base's source by kit/digests-base.sh); with the switch off the slice ids equal the base too.
// Every expectation is decoded here from tools/artb/artb-slice.json: no pixel, digest or pixel count of a slice sprite is typed into this file (the digest
// fixture holds the BASE's drawing of those ids, i.e. the old art, which does not move when the art is replaced).
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { R, installRaster } from "./raster.helpers";

installRaster();

import { C } from "../src/render/palette";
import { ITEMS } from "../src/sim/content";
import { artBBoard, artBBody, artBCard, artBFace, artBFactory, artBHas, artBIcon, artBOn, setArtB } from "../src/render/artB";
import { factoryFlashSil, factorySprite, gateSil, gateSprite, itemIcon } from "../src/render/sprites";
import { shapedRigBody, shapedRigSil } from "../src/render/shapeArt";
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

const RIGS = ["embertrough", "nailstrip", "grease", "ballast", "rasp", "bellows", "sparkgap", "staticbrush", "barbed", "venom"];
const SHAPED = ["embertrough", "nailstrip"];
const ONE_CELL = RIGS.filter((id) => !SHAPED.includes(id));
const SLICE = [...RIGS, "kiln"];

/** The sprite `name` of the data as w x h palette hexes (null = clear), with `overlay` laid over it. */
function expected(name: string, overlay: Overlay = []): Ex {
  const s = data.sprites[name];
  const px: Px[] = [];
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) px.push(hex(s.rows[y][x]));
  for (const [x, y, ch] of overlay) px[y * s.w + x] = hex(ch);
  return { w: s.w, h: s.h, px };
}
/** phase `i` (mod the list's length) of a sprite's `work` or `idle` overlays; none when it has none */
const phase = (name: string, kind: "work" | "idle", i: number): Overlay => { const l = data.work[name]?.[kind]; return l && l.length ? l[i % l.length] : []; };
const transposed = (e: Ex): Ex => { const px: Px[] = []; for (let y = 0; y < e.w; y++) for (let x = 0; x < e.h; x++) px.push(e.px[x * e.w + y]); return { w: e.h, h: e.w, px }; };
const white = (e: Ex): Ex => ({ ...e, px: e.px.map((p) => (p === null ? null : C.white)) });
function same(c: HTMLCanvasElement | null, e: Ex, what: string): void {
  expect(c, `${what}: a canvas`).not.toBeNull();
  const r = R(c);
  expect([r.width, r.height], `${what}: size`).toEqual([e.w, e.h]);
  expect(r.px, `${what}: pixels`).toEqual(e.px);
}

afterEach(() => setArtB(true));

describe("ARTB-CODE-1 M: the module and its one switch", () => {
  it("the switch is on by default and setArtB flips it", () => {
    expect(artBOn()).toBe(true);
    setArtB(false);
    expect(artBOn()).toBe(false);
    setArtB(true);
    expect(artBOn()).toBe(true);
  });

  it("with the switch on, every function answers for the slice's ids and with null (not mine) for every other id in ITEMS", () => {
    setArtB(true);
    for (const id of Object.keys(ITEMS)) {
      const mine = SLICE.includes(id);
      expect(artBHas(id), id).toBe(mine);
      expect(artBIcon(id) !== null, `${id}: icon`).toBe(mine);
      expect(artBCard(id) !== null, `${id}: card`).toBe(mine);
      expect(artBBoard(id, 0, false) !== null, `${id}: board`).toBe(RIGS.includes(id));
      expect(artBFactory(id, 0, false) !== null, `${id}: factory`).toBe(id === "kiln");
      expect(artBBody(id, 24, 12, 0, false) !== null, `${id}: body`).toBe(SHAPED.includes(id));
    }
    expect(artBFace("furnace")).not.toBeNull();
    for (const h of ["weaver", "foundry", "bastion"]) expect(artBFace(h), h).toBeNull();
  });

  it("with the switch off every function answers null, for every id", () => {
    setArtB(false);
    for (const id of [...Object.keys(ITEMS), "furnace"]) {
      expect(artBHas(id), id).toBe(false);
      expect([artBIcon(id), artBCard(id), artBBoard(id, 0, true), artBFactory(id, 0, true), artBBody(id, 24, 12, 0, true), artBBody(id, 12, 24, 0, true), artBFace(id)], id).toEqual([null, null, null, null, null, null, null]);
    }
  });
});

describe("ARTB-CODE-1 B: the board, the small icons, KILN and the two bodies show the data", () => {
  it("each 1-cell rig's gateSprite is board/<id> at every frame, idle and working (phase (frame >> 1) & 1 laid over it), and frames wrap mod 8", () => {
    setArtB(true);
    for (const id of ONE_CELL) {
      const name = `board/${id}`;
      for (const f of [...FRAMES, -1, 8, 9, 17]) for (const active of [false, true]) {
        const m = ((f % 8) + 8) % 8;
        same(gateSprite(id, f, active), expected(name, active ? phase(name, "work", (m >> 1) & 1) : []), `${id} frame ${f} ${active ? "working" : "idle"}`);
      }
    }
  });

  it("the working phases differ from the plain sprite where the data gives them pixels (the rig visibly works)", () => {
    setArtB(true);
    for (const id of ONE_CELL) {
      const name = `board/${id}`, idle = R(gateSprite(id, 0, false)).px;
      const worked = [0, 2].map((f) => R(gateSprite(id, f, true)).px);
      const anyPixels = (data.work[name]?.work ?? []).some((ph) => ph.length > 0);
      expect(worked.some((px) => px.some((p, i) => p !== idle[i])), `${id}: some working frame differs from idle`).toBe(anyPixels);
    }
  });

  it("itemIcon of every slice rig is board/<id> (12x12, plain) and of KILN icon/kiln; a shaped rig's gateSprite is its small icon, still", () => {
    setArtB(true);
    for (const id of RIGS) same(itemIcon(id), expected(`board/${id}`), `${id} icon`);
    same(itemIcon("kiln"), expected("icon/kiln"), "kiln icon");
    for (const id of SHAPED) for (const f of FRAMES) for (const active of [false, true]) same(gateSprite(id, f, active), expected(`board/${id}`), `${id} gateSprite ${f} ${active}`);
  });

  it("KILN: factorySprite is kiln with its idle phase (frame >> 1) & 3, or its flash laid over the plain sprite while flash; the stars change nothing", () => {
    setArtB(true);
    for (const f of [...FRAMES, -3, 11]) for (const flash of [false, true]) for (const stars of [1, 2, 3]) {
      const m = ((f % 8) + 8) % 8;
      const ov = flash ? (data.work.kiln.flash ?? []) : phase("kiln", "idle", (m >> 1) & 3);
      same(factorySprite("kiln", f, flash, stars), expected("kiln", ov), `kiln frame ${f} flash ${flash} stars ${stars}`);
    }
  });

  it("the shaped rigs' bodies: body/<id> lying along x (24x12), transposed when the box stands upright (12x24); idle phase (frame >> 2) & 1, working phase (frame >> 1) & 1", () => {
    setArtB(true);
    for (const id of SHAPED) {
      const name = `body/${id}`;
      for (const f of [...FRAMES, -1, 12]) for (const active of [false, true]) {
        const m = ((f % 8) + 8) % 8;
        const ov = active ? phase(name, "work", (m >> 1) & 1) : phase(name, "idle", (m >> 2) & 1);
        const lying = expected(name, ov);
        same(shapedRigBody(id, 24, 12, f, active, ""), lying, `${id} lying frame ${f} ${active ? "working" : "idle"}`);
        same(shapedRigBody(id, 12, 24, f, active, ""), transposed(lying), `${id} upright frame ${f} ${active ? "working" : "idle"}`);
      }
    }
  });

  it("nothing of today's drawing remains: a slice picture is the data alone, so it holds no pixel the data does not draw (no plate edge, no old rivet)", () => {
    setArtB(true);
    for (const id of SHAPED) {
      const lying = expected(`body/${id}`);
      const got = R(shapedRigBody(id, 24, 12, 0, false, "")).px;
      expect(got.filter((p, i) => p !== lying.px[i]).length).toBe(0);
      const old = R((setArtB(false), shapedRigBody(id, 24, 12, 0, false, ""))).px;
      setArtB(true);
      expect(old.some((p, i) => p !== lying.px[i]), `${id}: the base's body is another picture than the data's`).toBe(true);
    }
  });

  it("hit flashes follow the sprites: gateSil, factoryFlashSil and shapedRigSil are the white silhouettes of the new idle sprites", () => {
    setArtB(true);
    for (const id of RIGS) same(gateSil(id), white(expected(`board/${id}`)), `${id} gateSil`);
    for (const s of [1, 2, 3]) same(factoryFlashSil("kiln", s), white(expected("kiln")), `kiln factoryFlashSil stars ${s}`);
    for (const id of SHAPED) {
      same(shapedRigSil(id, 24, 12, ""), white(expected(`body/${id}`)), `${id} shapedRigSil lying`);
      same(shapedRigSil(id, 12, 24, ""), white(transposed(expected(`body/${id}`))), `${id} shapedRigSil upright`);
    }
  });

  it("toggling the switch swaps the picture both ways (no cache keeps the other art): on, off, on", () => {
    for (const id of ["grease", "venom"]) {
      setArtB(true);
      const a = R(gateSprite(id, 0, false)).px.slice();
      setArtB(false);
      const b = R(gateSprite(id, 0, false)).px.slice();
      setArtB(true);
      const c = R(gateSprite(id, 0, false)).px.slice();
      expect(a).toEqual(c);
      expect(a).not.toEqual(b);
      same(gateSil(id), white(expected(`board/${id}`)), `${id} gateSil back on`);
    }
  });
});

describe("ARTB-CODE-1 B: every other id is the base's, the switch on or off; with it off the slice ids are the base's too", () => {
  const ids = Object.keys(ITEMS);
  it("the base's digests cover every id in ITEMS", () => {
    for (const fn of ["icon", "gate", "gateSil", "factory", "factorySil"]) expect(Object.keys(base[fn]).sort(), fn).toEqual([...ids].sort());
  });

  it("switch OFF: every digest of every id (the slice's included) equals the base's", () => {
    setArtB(false);
    expect(allDigests()).toEqual(base);
  });

  it("switch ON: every digest of every id outside the slice equals the base's; the slice ids' icons, gate and factory drawings differ where the art is theirs", () => {
    setArtB(true);
    const on = allDigests();
    for (const fn of Object.keys(base)) {
      for (const key of Object.keys(base[fn])) {
        const id = key.split("@")[0];
        if (SLICE.includes(id)) continue;
        expect(on[fn][key], `${fn} ${key}: not a slice piece, so the base's`).toBe(base[fn][key]);
      }
      expect(Object.keys(on[fn]).sort(), `${fn}: the same keys`).toEqual(Object.keys(base[fn]).sort());
    }
    for (const id of SLICE) expect(on.icon[id], `${id} icon is new art`).not.toBe(base.icon[id]);
    for (const id of RIGS) {
      expect(on.gate[id], `${id} gateSprite is new art`).not.toBe(base.gate[id]);
      expect(on.gateSil[id], `${id} gateSil follows the new sprite`).not.toBe(base.gateSil[id]);
    }
    expect(on.factory.kiln, "kiln factorySprite is new art").not.toBe(base.factory.kiln);
    expect(on.factorySil.kiln, "kiln factoryFlashSil follows").not.toBe(base.factorySil.kiln);
    for (const id of SHAPED) for (let rot = 0; rot < 4; rot++) {
      const b = rot % 2 ? "upright" : "lying";
      expect(on.body[`${id}@${rot}`], `${id} ${b} body is new art`).not.toBe(base.body[`${id}@${rot}`]);
    }
  });

  it("the shaped rigs that are not in the slice keep their bodies at every turn, with the switch on and off (SPIKE RAIL and the SHAPES-2 pieces)", () => {
    const others = Object.keys(base.body).filter((k) => !SHAPED.includes(k.split("@")[0]));
    expect(others.length).toBeGreaterThan(0);
    setArtB(true);
    const on = allDigests(ids.filter((id) => !SLICE.includes(id)));
    setArtB(false);
    const off = allDigests(ids.filter((id) => !SLICE.includes(id)));
    expect(on).toEqual(off);
    for (const k of others) expect(on.body[k], k).toBe(base.body[k]);
  });
});
