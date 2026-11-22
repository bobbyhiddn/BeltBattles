// ARTB-CODE-2A (REQ-BFG-127), item T (b): the four playable heroes' 32x32 faces on hero select. Batch 2's data adds the faces of WEAVER, FOUNDRY and BASTION (FURNACE's came with ARTB-CODE-1);
// src/screens/hero.ts did not change: it asks artBFace(id) and draws what ARTB-CODE-1B's option B drew for FURNACE, so the three take the same frame. The hero screen is drawn on a recording
// context with a stand-in Game (tests/artb1.hero.test.ts's way, which this file generalises from FURNACE to the four heroes): every fillRect and drawImage the screen makes is recorded with
// where it landed, every drawText with where and how wide, and the UI's regions after the frame. The expectations are decoded from tools/artb/artb-slice.json: no pixel of a face is typed here.
//  - every hero of PLAYABLE_HEROES has a face in the data (portrait/<id>, 32x32), and hero select draws it: the drawImage source is artBFace(id) and its pixels are the data's;
//  - frame B for each of the four, on the 13 view and dpr combinations of artb1.hero: a 34 x 34 ring in the faction's trim at (ix, iy) hugging the face (four 1 px lines), an ink backing
//    exactly under the 32 x 32 face at (ix + 1, iy + 1) (where the 24x24 face stood), the head's three text lines level with the face at ix + 38 (the 4 clear px beside the ring the 24x24 face
//    has; 7 px right of the switch-off column), whole and inside the screen, one clear row between the ring and the first rule line (iy + HEAD_H), every line below the head and every region
//    where the switch-off run puts it;
//  - with the switch off every playable hero draws portraits.ts's own 24x24 face in the base's frame (the 26 px ink box, the 28 px ring, the text column at ix + 31).
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { RasterCanvas, R } from "./raster.helpers";

type Rec = { op: "fillRect"; x: number; y: number; w: number; h: number; fill: string } | { op: "drawImage"; img: RasterCanvas; x: number; y: number; w: number; h: number };
const placed = vi.hoisted(() => [] as { s: string; x: number; y: number; w: number; h: number; font: string; scale: number; align: string }[]);
vi.mock("../src/render/font", async (importOriginal) => {
  const m = await importOriginal<typeof import("../src/render/font")>();
  return {
    ...m,
    drawText: (...a: Parameters<typeof m.drawText>) => {
      const w = m.drawText(...a);
      const o = (a[5] ?? {}) as { font?: "3" | "5"; scale?: number; align?: string };
      const font = o.font ?? "5", scale = o.scale ?? 1;
      placed.push({ s: String(a[1]), x: Number(a[2]), y: Number(a[3]), w, h: m.fontHeight(font) * scale, font, scale, align: o.align ?? "left" });
      return w;
    },
  };
});

import { computeView } from "../src/core/io";
import { newRun } from "../src/game/run";
import { UI } from "../src/ui/ui";
import { C, FACTION } from "../src/render/palette";
import { HEROES } from "../src/sim/content";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { portraitImage, type PortraitHero } from "../src/render/portraits";
import { artBFace, setArtB } from "../src/render/artB";
import { HeroScreen } from "../src/screens/hero";
import type { Game } from "../src/game/game";
import type { G } from "../src/render/pixel";

const data = JSON.parse(readFileSync("tools/artb/artb-slice.json", "utf8")) as { // (the repo root's path, where vitest runs; the repo's node shims declare no node:url)
  legend: Record<string, string>;
  sprites: Record<string, { w: number; h: number; rows: string[] }>;
};
const pal = C as Record<string, string>;
const faceHexes = (id: string): (string | null)[] => data.sprites[`portrait/${id}`].rows.flatMap((r) => [...r].map((ch) => (ch === "." ? null : pal[data.legend[ch]])));

/** A canvas that is a software raster for the sprites (the face is read back from it) and tolerates the canvas calls the sea and the arena make that the raster has no use for. */
class SoftCanvas extends RasterCanvas {
  override getContext(): ReturnType<RasterCanvas["getContext"]> {
    const ctx = super.getContext();
    return new Proxy(ctx, {
      get(t, k) {
        const v = Reflect.get(t, k) as unknown;
        if (v !== undefined) return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(t) : v;
        if (k === "createLinearGradient" || k === "createRadialGradient" || k === "createPattern") return () => ({ addColorStop() {} });
        return typeof k === "string" ? () => undefined : undefined;
      },
      set(t, k, v) { Reflect.set(t, k, v); return true; },
    });
  }
}

/** The page's draw target: a recording context. */
function recorder(): { g: G; ops: Rec[] } {
  const ops: Rec[] = [];
  const st: Record<string, unknown> = { fillStyle: "#000000", strokeStyle: "#000000", globalAlpha: 1, imageSmoothingEnabled: false, lineWidth: 1, globalCompositeOperation: "source-over" };
  const g = new Proxy(st, {
    get(t, k) {
      if (typeof k !== "string") return undefined;
      if (k === "fillRect") return (x: number, y: number, w: number, h: number) => { ops.push({ op: "fillRect", x, y, w, h, fill: String(t.fillStyle) }); };
      if (k === "drawImage") return (img: RasterCanvas, ...a: number[]) => { ops.push({ op: "drawImage", img, x: a[0], y: a[1], w: a.length >= 4 ? a[2] : img.width, h: a.length >= 4 ? a[3] : img.height }); };
      if (k in t) return t[k];
      if (k === "getImageData" || k === "createImageData") return (_x: number, _y: number, w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h });
      if (k === "measureText") return () => ({ width: 0 });
      if (k === "createLinearGradient" || k === "createRadialGradient" || k === "createPattern") return () => ({ addColorStop() {} });
      return () => undefined;
    },
    set(t, k, v) { if (typeof k === "string") t[k] = v; return true; },
  }) as unknown as G;
  return { g, ops };
}

const store = new Map<string, string>();
let restoreDom: () => void = () => undefined;
beforeAll(() => {
  const doc = globalThis as { document?: unknown };
  const prev = doc.document;
  doc.document = { createElement: () => new SoftCanvas() };
  restoreDom = () => { doc.document = prev; };
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); },
    key: () => null, length: 0, clear: () => store.clear(),
  });
});
afterAll(() => { restoreDom(); vi.unstubAllGlobals(); });
beforeEach(() => { placed.length = 0; store.clear(); });
afterEach(() => setArtB(true));

/** The views the brief names, with the device pixel ratios they are seen at (the same 13 combinations as tests/artb1.hero.test.ts). */
const VIEWS: [string, number, number, number[]][] = [
  ["402x690", 402, 690, [3]], ["390x660", 390, 660, [3]], ["360x640", 360, 640, [2]], ["320x568", 320, 568, [2]], ["300x640", 300, 640, [2, 3]], ["280x653", 280, 653, [2, 3]],
  ["844x390", 844, 390, [3]], ["667x375", 667, 375, [2]], ["1280x800", 1280, 800, [1]], ["1366x768", 1366, 768, [1]], ["1920x1080", 1920, 1080, [1]],
];
const ids = [...PLAYABLE_HEROES];
const HEAD_H = 35; // hero.ts: the text column beside the face; the first rule line is drawn at iy + HEAD_H

interface Frame { W: number; H: number; ops: Rec[]; text: typeof placed; regions: string[]; ink: Extract<Rec, { op: "fillRect" }> | null; img: Extract<Rec, { op: "drawImage" }> | null }
/** Draw hero `id`'s card on a `w` x `h` css px view at `dpr`: what the screen drew. */
function frameOf(id: string, w: number, h: number, dpr: number): Frame {
  const view = computeView(w, h, dpr);
  const ui = new UI();
  const game = { run: newRun("furnace", 7), audio: new Proxy({}, { get: () => () => undefined }), view, W: view.W, H: view.H, portrait: view.portrait, t: 0, ui, toast() {}, go() {}, error() {}, soundButton() {}, transitioning: false, resize() {} } as unknown as Game;
  const screen = new HeroScreen(game);
  expect(screen.showHero(id as never)).toBe(true);
  const { g, ops } = recorder();
  placed.length = 0;
  ui.begin();
  screen.draw(g);
  ui.end();
  // the portrait: the drawImage whose source is a 24x24 or 32x32 face (portraits.ts's or art B's), preceded by the ink behind it: the 24x24 face's 26x26 ink box one px outside it, or the 32x32 face's ink backing exactly under it
  const faces: unknown[] = [artBFace(id), portraitImage(id as PortraitHero)]; // art B's 32x32 (or null) and portraits.ts's 24x24: canvases the screen draws as they are
  const img = ops.find((o): o is Extract<Rec, { op: "drawImage" }> => o.op === "drawImage" && faces.includes(o.img)) ?? null;
  const k = img ? ops.indexOf(img) : -1;
  const ink = k > 0 ? [...ops.slice(0, k)].reverse().find((o): o is Extract<Rec, { op: "fillRect" }> => o.op === "fillRect" && o.fill === C.ink && o.w <= img!.w + 2 && o.h <= img!.h + 2
    && o.x <= img!.x && o.y <= img!.y && o.x + o.w >= img!.x + img!.w && o.y + o.h >= img!.y + img!.h) ?? null : null;
  return { W: view.W, H: view.H, ops, text: [...placed], regions: ui.regions.map((r) => `${r.id}:${r.r.x},${r.r.y},${r.r.w},${r.r.h}`), ink, img };
}
/** The faction's trim ring round the face: the bounding box of the 1 px lines in `trim` within 2 px of the face, and how many lines there are (a ring is four). */
function ringOf(f: Frame, trim: string): { x: number; y: number; w: number; h: number; lines: number } | null {
  const im = f.img;
  if (!im) return null;
  const ls = f.ops.filter((o): o is Extract<Rec, { op: "fillRect" }> => o.op === "fillRect" && o.fill === trim && (o.w === 1 || o.h === 1)
    && o.x >= im.x - 2 && o.y >= im.y - 2 && o.x + o.w <= im.x + im.w + 2 && o.y + o.h <= im.y + im.h + 2);
  if (!ls.length) return null;
  const x0 = Math.min(...ls.map((o) => o.x)), y0 = Math.min(...ls.map((o) => o.y)), x1 = Math.max(...ls.map((o) => o.x + o.w)), y1 = Math.max(...ls.map((o) => o.y + o.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, lines: ls.length };
}
const trimOf = (id: string): string => FACTION[HEROES[id as keyof typeof HEROES].faction].trim1;

describe("ARTB-CODE-2A T(b): every playable hero has a 32x32 face in the data, and hero select draws it", () => {
  it("the data holds portrait/<id>, 32x32, for each hero of PLAYABLE_HEROES, and artBFace(id) is that sprite with the switch on (null with it off)", () => {
    expect(ids.length).toBe(4);
    for (const id of ids) {
      const s = data.sprites[`portrait/${id}`];
      expect(s, `portrait/${id} is in the data`).toBeDefined();
      expect([s.w, s.h], `${id}: 32x32`).toEqual([32, 32]);
      setArtB(true);
      const c = artBFace(id);
      expect(c, `${id}: artBFace`).not.toBeNull();
      expect([c!.width, c!.height]).toEqual([32, 32]);
      expect(R(c).px, `${id}: the face is the data's`).toEqual(faceHexes(id));
      setArtB(false);
      expect(artBFace(id), `${id}: null with the switch off`).toBeNull();
    }
  });

  it("each of the four draws art B's face at 402x690 @3: the drawImage source is artBFace(id), 32x32, equal to the data, in frame B (a 34 px trim ring, the ink backing exactly under the face), where the 24x24 face stood", () => {
    for (const id of ids) {
      setArtB(true);
      const f = frameOf(id, 402, 690, 3);
      expect(f.img, `${id}: the face is drawn`).not.toBeNull();
      const img = f.img!;
      expect(img.img, `${id}: the source is art B's canvas`).toBe(artBFace(id));
      expect([img.img.width, img.img.height, img.w, img.h], `${id}: drawn 32x32`).toEqual([32, 32, 32, 32]);
      expect(R(img.img as unknown as HTMLCanvasElement).px, `${id}: the pixels are the data's`).toEqual(faceHexes(id));
      expect(f.ink, `${id}: the ink behind the face's clear px`).not.toBeNull();
      expect([f.ink!.x, f.ink!.y, f.ink!.w, f.ink!.h], `${id}: the ink is exactly under the face (no margin)`).toEqual([img.x, img.y, 32, 32]);
      const ring = ringOf(f, trimOf(id));
      expect(ring, `${id}: the ring`).not.toBeNull();
      expect([ring!.x, ring!.y, ring!.w, ring!.h, ring!.lines], `${id}: the ring is four 1 px lines, 34 x 34 round the face`).toEqual([img.x - 1, img.y - 1, 34, 34, 4]);
      // the base's place: with the art off, the 24x24 face is drawn at the same top-left corner, in the base's frame (26x26 ink box, 28x28 ring)
      setArtB(false);
      const b = frameOf(id, 402, 690, 3);
      expect([b.img!.x, b.img!.y, b.img!.w, b.img!.h], `${id}: the base's face`).toEqual([img.x, img.y, 24, 24]);
      expect(b.img!.img, `${id}: portraits.ts's canvas`).toBe(portraitImage(id as PortraitHero));
      expect([b.ink!.x, b.ink!.y, b.ink!.w, b.ink!.h], `${id}: the base's ink box`).toEqual([img.x - 1, img.y - 1, 26, 26]);
      const br = ringOf(b, trimOf(id))!;
      expect([br.x, br.y, br.w, br.h, br.lines], `${id}: the base's ring`).toEqual([img.x - 2, img.y - 2, 28, 28, 4]);
    }
  });
});

describe("ARTB-CODE-2A T(b): frame B for the four heroes on the 13 view and dpr combinations", () => {
  it("on every view each hero's head text is whole and clear of the frame, one clear row lies above the first rule line, no row below the head moves, no region moves", () => {
    const rows: string[] = [];
    for (const id of ids) for (const [vn, w, h, dprs] of VIEWS) for (const dpr of dprs) {
      setArtB(true);
      const faceOn = artBFace(id); // (read with the switch on: the screen draws this canvas)
      const on = frameOf(id, w, h, dpr);
      setArtB(false);
      const off = frameOf(id, w, h, dpr);
      const what = `${id} ${vn} @${dpr} (logical ${on.W}x${on.H})`;
      const trim = trimOf(id);
      const ring = ringOf(on, trim)!, offRing = ringOf(off, trim)!; // frame B's ring: 34 x 34 at (ix, iy); the base's 24x24 ring: 28 x 28 at (ix - 1, iy - 1)
      const iy = on.img!.y - 1, ix = on.img!.x - 1; // the face sits at (ix + 1, iy + 1), as the 24x24 face did
      expect(faceOn, `${what}: art B holds a face`).not.toBeNull();
      expect(on.img!.img, `${what}: art B's face`).toBe(faceOn);
      expect([on.img!.w, on.img!.h], `${what}: 32x32`).toEqual([32, 32]);
      expect([off.img!.x, off.img!.y], `${what}: the face is where the 24x24 face stood`).toEqual([ix + 1, iy + 1]);
      expect([ring.x, ring.y, ring.w, ring.h, ring.lines], `${what}: the ring hugs the face`).toEqual([ix, iy, 34, 34, 4]);
      expect([on.ink!.x, on.ink!.y, on.ink!.w, on.ink!.h], `${what}: the ink is exactly under the face`).toEqual([ix + 1, iy + 1, 32, 32]);
      const ringR = ring.x + ring.w, ringB = ring.y + ring.h; // the first px clear of the ring, to its right and below it
      // the head: the lines drawn level with the face (the head's rows iy .. iy + HEAD_H - 1), at the text column
      const level = on.text.filter((t) => t.y >= iy && t.y < iy + HEAD_H);
      expect(level.length, `${what}: faction, name and playstyle are drawn level with the face`).toBe(3);
      const base = off.text.filter((t) => t.y >= iy && t.y < iy + HEAD_H);
      const baseGap = base[0].x - (offRing.x + offRing.w); // the clear px between the 24x24 hero's ring and its text
      expect(baseGap, `${what}: the 24x24 face keeps 4 clear px between the ring and the text`).toBe(4);
      for (const t of level) {
        const left = t.align === "center" ? t.x - t.w / 2 : t.x, right = left + t.w;
        expect(left, `${what}: "${t.s}" starts clear of the ring, the base's 4 px gap from it`).toBe(ringR + baseGap);
        expect(right, `${what}: "${t.s}" ends inside the screen (not clipped)`).toBeLessThanOrEqual(on.W);
        expect(t.y + t.h, `${what}: "${t.s}" does not run past the head`).toBeLessThanOrEqual(iy + HEAD_H);
      }
      expect(level[0].y, `${what}: the ring's top row is the text's top row`).toBe(ring.y);
      // the same words, the same rows: only the column moved right by 7 px (the ring is 34 wide at ix, the base's 28 wide at ix - 1: the text starts at ix + 38, was ix + 31)
      expect(level.map((t) => [t.s, t.y]), what).toEqual(base.map((t) => [t.s, t.y]));
      for (let i = 0; i < level.length; i++) expect(level[i].x - base[i].x, `${what}: "${level[i].s}" moved right by 7 px`).toBe(7);
      // no row under the head moves: every text line from iy + HEAD_H down is where it was, and the first rule line has ONE clear row between the ring's last row (iy + 33) and itself (iy + 35)
      const below = (fr: Frame): string => JSON.stringify(fr.text.filter((t) => t.y >= iy + HEAD_H).map((t) => [t.s, t.x, t.y, t.w]));
      expect(below(on), `${what}: every line below the head is where it was`).toBe(below(off));
      const firstBelow = Math.min(...on.text.filter((t) => t.y >= iy + HEAD_H).map((t) => t.y));
      expect(firstBelow, `${what}: the first rule line is at iy + HEAD_H`).toBe(iy + HEAD_H);
      expect(firstBelow - ringB, `${what}: one clear row between the ring and the first rule line`).toBe(1);
      expect(on.regions, `${what}: the regions, taps and swipe are the base's`).toEqual(off.regions);
      rows.push(`${what}: ring ${ring.x},${ring.y} ${ring.w}x${ring.h}, face ${on.img!.x},${on.img!.y} 32x32; ${level.map((t) => `"${t.s}" ${t.x}..${t.x + t.w}`).join(", ")}; first rule line y ${firstBelow}; screen ${on.W}`);
    }
    console.log(`ARTB2 HERO head text, four heroes on ${rows.length} view and dpr combinations:\n${rows.join("\n")}`);
    expect(rows.length, "4 heroes x 13 view and dpr combinations").toBe(4 * 13);
  });

  it("switch OFF: every playable hero draws portraits.ts's own 24x24 face in the base's frame on every view (the 26 px ink box, the 28 px ring, the text column 4 px beyond the ring)", () => {
    let n = 0;
    for (const id of ids) for (const [vn, w, h, dprs] of VIEWS) for (const dpr of dprs) {
      setArtB(false);
      const off = frameOf(id, w, h, dpr);
      const what = `${id} ${vn} @${dpr}`;
      expect(artBFace(id), `${what}: artBFace is null`).toBeNull();
      expect(off.img!.img, `${what}: portraits.ts's face`).toBe(portraitImage(id as PortraitHero));
      expect([off.img!.w, off.img!.h], what).toEqual([24, 24]);
      expect([off.ink!.x, off.ink!.y, off.ink!.w, off.ink!.h], `${what}: the base's ink box`).toEqual([off.img!.x - 1, off.img!.y - 1, 26, 26]);
      const r = ringOf(off, trimOf(id))!;
      expect([r.x, r.y, r.w, r.h, r.lines], `${what}: the base's ring`).toEqual([off.img!.x - 2, off.img!.y - 2, 28, 28, 4]);
      const iy = off.img!.y - 1; // the head's rows: iy .. iy + HEAD_H - 1 (the base's ring starts one px higher, at iy - 1)
      const level = off.text.filter((t) => t.y >= iy && t.y < iy + HEAD_H);
      expect(level.length, `${what}: three head lines`).toBe(3);
      for (const t of level) expect(t.x, `${what}: the text column is the ring's right edge + 4`).toBe(r.x + r.w + 4);
      n++;
    }
    expect(n).toBe(4 * 13);
  });
});
