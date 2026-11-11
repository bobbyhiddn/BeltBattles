// ARTB-CODE-1 (REQ-BFG-127), item H: FURNACE's 32x32 face on hero select.
// The hero screen is drawn on a recording context with a stand-in Game (tests/endless1.screens.test.ts's way): every fillRect and drawImage the screen makes is
// recorded with where it landed, every drawText with where and how wide, and the UI's regions after the frame. The expectations are decoded from
// tools/artb/artb-slice.json: no pixel of the face is typed here.
//  - FURNACE's face is the data's portrait/furnace, 32x32, in an ink box and the faction's trim ring, at the same place as the 24x24 face was (ix + 1, iy + 1);
//  - WEAVER, FOUNDRY and BASTION still draw their own 24x24 faces (portraits.ts's, the same objects), in the base's frame at the base's place, with the switch on or off;
//  - on every view the head's text keeps whole and clear of the frame, and no row below the head, no region and no tap moves (FURNACE with the art on and off).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

const data = JSON.parse(readFileSync(fileURLToPath(new URL("../tools/artb/artb-slice.json", import.meta.url)), "utf8")) as {
  legend: Record<string, string>;
  sprites: Record<string, { w: number; h: number; rows: string[] }>;
};
const pal = C as Record<string, string>;
const face = data.sprites["portrait/furnace"];
const faceHexes = (): (string | null)[] => face.rows.flatMap((r) => [...r].map((ch) => (ch === "." ? null : pal[data.legend[ch]])));

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

/** The views the brief names, with the device pixel ratios they are seen at (402x690, 390x660, 360x640, 320x568, 844x390, 667x375 are the kit's; 300x640 and 280x653 at 2 and 3; the desks at 1). */
const VIEWS: [string, number, number, number[]][] = [
  ["402x690", 402, 690, [3]], ["390x660", 390, 660, [3]], ["360x640", 360, 640, [2]], ["320x568", 320, 568, [2]], ["300x640", 300, 640, [2, 3]], ["280x653", 280, 653, [2, 3]],
  ["844x390", 844, 390, [3]], ["667x375", 667, 375, [2]], ["1280x800", 1280, 800, [1]], ["1366x768", 1366, 768, [1]], ["1920x1080", 1920, 1080, [1]],
];
const ids = [...PLAYABLE_HEROES];

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
  // the portrait: the drawImage whose source is a 24x24 or 32x32 face (portraitImage's or art B's), preceded by the ink box and the ring
  const img = ops.find((o): o is Extract<Rec, { op: "drawImage" }> => o.op === "drawImage" && (o.img === artBFace(id) || o.img === portraitImage(id as PortraitHero))) ?? null;
  const k = img ? ops.indexOf(img) : -1;
  const ink = k > 0 ? [...ops.slice(0, k)].reverse().find((o): o is Extract<Rec, { op: "fillRect" }> => o.op === "fillRect" && o.fill === C.ink && o.w === img!.w + 2 && o.h === img!.h + 2) ?? null : null;
  return { W: view.W, H: view.H, ops, text: [...placed], regions: ui.regions.map((r) => `${r.id}:${r.r.x},${r.r.y},${r.r.w},${r.r.h}`), ink, img };
}

describe("ARTB-CODE-1 H: FURNACE's face on hero select", () => {
  it("FURNACE draws art B's portrait/furnace, 32x32, equal to the data, in an ink box and the faction's trim ring, where the 24x24 face stood", () => {
    setArtB(true);
    const f = frameOf("furnace", 402, 690, 3);
    expect(f.img, "the face is drawn").not.toBeNull();
    const img = f.img!;
    expect([img.img.width, img.img.height, img.w, img.h]).toEqual([face.w, face.h, 32, 32]);
    expect(R(img.img as unknown as HTMLCanvasElement).px).toEqual(faceHexes());
    expect(f.ink, "the ink box round the face").not.toBeNull();
    expect([f.ink!.x + 1, f.ink!.y + 1, f.ink!.w, f.ink!.h]).toEqual([img.x, img.y, 34, 34]); // the face sits 1 px inside its ink box, which is 1 px bigger each side
    // the trim ring: four 1 px lines one px outside the ink box, in the faction's trim1
    const trim = FACTION[HEROES.furnace.faction].trim1;
    const ring = f.ops.filter((o) => o.op === "fillRect" && o.fill === trim && o.x >= f.ink!.x - 1 && o.x <= f.ink!.x + 35 && o.y >= f.ink!.y - 1 && o.y <= f.ink!.y + 35);
    expect(ring.length, "the ring is four lines").toBeGreaterThanOrEqual(4);
    // the base's place: with the art off, the 24x24 face is drawn at the same top-left corner
    setArtB(false);
    const b = frameOf("furnace", 402, 690, 3);
    expect([b.img!.x, b.img!.y, b.img!.w, b.img!.h]).toEqual([img.x, img.y, 24, 24]);
    expect(b.img!.img).toBe(portraitImage("furnace"));
    expect([b.ink!.x, b.ink!.y]).toEqual([f.ink!.x, f.ink!.y]);
  });

  it("WEAVER, FOUNDRY and BASTION keep their 24x24 faces: portraits.ts's own canvases, in the base's frame at the base's place, with the switch on and off", () => {
    for (const id of ids.filter((h) => h !== "furnace")) for (const [vn, w, h, dprs] of VIEWS) for (const dpr of dprs) {
      setArtB(true);
      const on = frameOf(id, w, h, dpr);
      setArtB(false);
      const off = frameOf(id, w, h, dpr);
      const what = `${id} ${vn} @${dpr}`;
      expect(artBFace(id), what).toBeNull();
      expect(on.img!.img, `${what}: portraits.ts's face`).toBe(portraitImage(id as PortraitHero));
      expect([on.img!.w, on.img!.h], what).toEqual([24, 24]);
      expect([on.img!.x, on.img!.y, on.ink!.x, on.ink!.y, on.ink!.w], `${what}: the frame is the base's`).toEqual([off.img!.x, off.img!.y, off.ink!.x, off.ink!.y, off.ink!.w]);
      const head = (fr: Frame): string => JSON.stringify(fr.text.filter((t) => t.y >= fr.ink!.y - 1).map((t) => [t.s, t.x, t.y, t.w, t.font, t.scale]));
      expect(head(on), `${what}: every text line from the head down is the base's`).toBe(head(off));
      expect(on.regions, `${what}: the regions are the base's`).toEqual(off.regions);
    }
  });

  it("on every view FURNACE's head text is whole and clear of the frame, no row below the head moves, no region moves", () => {
    const rows: string[] = [];
    for (const [vn, w, h, dprs] of VIEWS) for (const dpr of dprs) {
      setArtB(true);
      const on = frameOf("furnace", w, h, dpr);
      setArtB(false);
      const off = frameOf("furnace", w, h, dpr);
      const what = `furnace ${vn} @${dpr} (logical ${on.W}x${on.H})`;
      const ink = on.ink!, ringR = ink.x + ink.w, ringB = ink.y + ink.h; // the trim ring is 1 px outside the ink box: its right/bottom px are ink.x + ink.w and ink.y + ink.h
      // the head: the lines drawn level with the face (from the ink box's top to the ring's bottom), at the text column
      const level = on.text.filter((t) => t.y >= ink.y - 1 && t.y <= ringB);
      expect(level.length, `${what}: faction, name and playstyle are drawn level with the face`).toBe(3);
      const base = off.text.filter((t) => t.y >= off.ink!.y - 1 && t.y <= off.ink!.y + 26);
      for (const t of level) {
        const left = t.align === "center" ? t.x - t.w / 2 : t.x, right = left + t.w;
        expect(left, `${what}: "${t.s}" starts clear of the ring`).toBeGreaterThan(ringR);
        expect(right, `${what}: "${t.s}" ends inside the screen (not clipped)`).toBeLessThanOrEqual(on.W);
        expect(t.y + t.h, `${what}: "${t.s}" does not run past the head`).toBeLessThanOrEqual(ringB + 1);
      }
      // the same words, the same rows: only the column moved right by the face's extra 8 px
      expect(level.map((t) => [t.s, t.y]), what).toEqual(base.map((t) => [t.s, t.y]));
      for (let i = 0; i < level.length; i++) expect(level[i].x - base[i].x, `${what}: "${level[i].s}" moved right by the face's 8 extra px`).toBe(8);
      // no text line below the head overlaps the ring, and none of them moved
      const below = (fr: Frame): string => JSON.stringify(fr.text.filter((t) => t.y > fr.ink!.y + 26).map((t) => [t.s, t.x, t.y, t.w]));
      expect(below(on), `${what}: every line below the head is where it was`).toBe(below(off));
      for (const t of on.text.filter((x) => x.y > ink.y + 26)) expect(t.y, `${what}: "${t.s}" clear of the ring's bottom row`).toBeGreaterThan(ringB);
      expect(on.regions, `${what}: the regions, taps and swipe are the base's`).toEqual(off.regions);
      rows.push(`${what}: ring ${ink.x - 1},${ink.y - 1} ${ink.w + 2}x${ink.h + 2}; ${level.map((t) => `"${t.s}" ${t.x}..${t.x + t.w}`).join(", ")}; screen ${on.W}`);
    }
    console.log(`ARTB1 HERO head text on ${rows.length} views:\n${rows.join("\n")}`);
  });
});
