// 0.8.0 A1 M4 (REQ-BFG-022, REQ-BFG-023, REQ-BFG-024, REQ-BFG-011): wave 3's 15 modules (src/render/wave3Art.ts, keyed by
// P1's ids) and the six new NPC portraits (portraitArt.ts FEATURES, keyed by D1's ids). Node has no canvas, so the render
// entry points draw here into a small software raster (RasterCanvas below: fillRect, drawImage with the 90-degree turns
// and flips the sprites use, source-in compositing, getImageData), which records every pixel's colour by name and counts
// any paint that falls outside its canvas. The pixels themselves are also shown in Chromium on the contact sheets
// (tools/wave3ArtSheet.ts; output-A1/art), and the all-existing-art digest (tools/artDigest.ts) proves every existing
// sprite, scene, portrait and battle frame unchanged.
// Two worlds: this branch (no ITEMS entry carries a wave-3 id: the art is reachable by id through the sprite entry
// points) and I1's (P1's 15 defs installed in memory, as P1's dormant switch keeps them: the deck and gun entry points
// draw them too).
// 0.8.0 I1 M1 (VERIFIED-A1 section G item 4): P1's real defs are merged, so both worlds are now the game's own: the first
// test is flipped (every wave-3 id IS an ITEMS entry, equal field by field to A1's copy in tools/wave3Defs.ts), the "I1's
// world" block reads the real defs (no install, no remove), and "existing" means every ITEMS entry that is not wave 3's,
// whether or not the switch lists them. Every other assertion is as A1 wrote it.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setArtB } from "../src/render/artB"; // ARTB-CODE-3A (REQ-BFG-126): the switch (the note below the imports)
import { C, type ColorName } from "../src/render/palette";
import { factoryFlashSil, factorySprite, gateSil, gateSprite, itemIcon } from "../src/render/sprites";
import {
  WAVE3_ART_IDS, WAVE3_CORES, WAVE3_CORE_GEM, WAVE3_FACTORIES, WAVE3_GEAR, WAVE3_RIGS, anvilSparks, drawWave3Gate, drawWave3Icon,
  isWave3Art, stokeFlare, wave3ChuteMouth, wave3FactoryArt, wave3GateSprite, wave3GearFace, wave3Gem, type Wave3RigState,
} from "../src/render/wave3Art";
import { gemColor } from "../src/render/coreArt";
import {
  PORTRAIT_HEROES, PORTRAIT_KEYS, WAVE3_NPC_IDS, WAVE3_NPC_PORTRAIT, portraitImage, portraitPixels, type PortraitKey,
} from "../src/render/portraits";
import { FEATURES, PH, PW, blank, paintBase, type Base, type Look } from "../src/render/portraitArt";
import { cruiserModel, drawTurrets, turretPivotX, turretPivotY, type CruiserView } from "../src/render/cruiser";
import { drawMachinery } from "../src/render/machinery";
import { footX, footY, frameForHull, localRect, type Box, type DeckFrame } from "../src/render/frame";
import { CELL, GRID, HEROES, ITEMS, WAVE3_IDS, isWave3, wave3Live, type HeroId } from "../src/sim/content";
import { DX, DY, cloneBuild, hitsOfRig, inGrid, key, kx, ky, occupancy, rigHits, rotField, stokeHits, turretSlots, type Build } from "../src/sim/deck";
import { stokeSpots } from "../src/sim/beltside"; // 0.8.0 I1: STOKER's place (oracle cb613c9cbd33ca88)
import { heroStartBuild } from "../src/sim/heroBuilds";
import { RIVALS, RIVAL_IDS } from "../src/sim/rivals";
import { P1_WAVE3_IDS, P1_WAVE3_ITEMS } from "../tools/wave3Defs"; // 0.8.0 I1: A1's copy, compared with the real defs
import type { ItemDef } from "../src/sim/content"; // AZ-BUMP (the flip, LADDER_FIX): A1's copy as a def, for LADDER_DEFS
import { LADDER_DEFS, withLadderFix } from "../src/sim/ladderFix"; // AZ-BUMP (the flip, LADDER_FIX): STOKER's fixed def
import { GUARD_DEFS, withGuard } from "../src/sim/guard"; // HULL-ON (the flip, GUARD): PLATE ROLLER's guarded def
import { SCALE_DEFS, SCALE_RIGS, withScaleRigs } from "../src/sim/scale"; // BUMP-1E (SCALE_RIGS on): IRON WALL's and SPALL CATCHER's entries are the scaling rules' defs; the 0.9.11 entries are read with the switch off

// ARTB-CODE-3A (REQ-BFG-126), old -> new: art direction B now draws wave 3's rigs PLATE ROLLER, PINCER, BRACE FRAME, SHIELD FUEL (id platebreaker), IRON WALL, TWIN GAUGE, TWIN LATCH, STOKER and others (board/<id>, batches 4a and 4b): gateSprite and itemIcon
// answer art B's sprite with the switch on, a still idle picture with two work phases, not wave3Art.ts's animated one. One assert went red on that data: "frames differ where the art animates" (PLATE ROLLER: 1 idle picture, the bar 2).
// This file pins the BASE drawing (src/render/wave3Art.ts, the VITE_ARTB=0 path), so it runs with the switch off, every assert as it was; art B's pictures of the same ids are pinned in tests/artb3.board.test.ts.
beforeAll(() => setArtB(false));
afterAll(() => setArtB(true));

// ------------------------------------------------------------------------------------------------- a software raster

type Pix = string | null;

class RasterCanvas {
  private w = 300;
  private h = 150;
  px: Pix[] = new Array<Pix>(300 * 150).fill(null);
  oob = 0; // paints that fell outside the canvas
  private ctx: RasterContext | null = null;
  get width(): number { return this.w; }
  set width(v: number) { this.w = Math.max(0, Math.floor(v)); this.px = new Array<Pix>(this.w * this.h).fill(null); }
  get height(): number { return this.h; }
  set height(v: number) { this.h = Math.max(0, Math.floor(v)); this.px = new Array<Pix>(this.w * this.h).fill(null); }
  getContext(): RasterContext { return (this.ctx ??= new RasterContext(this)); }
  at(x: number, y: number): Pix { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.px[y * this.w + x] : null; }
}

const hexRGBA = (s: string): [number, number, number, number] => {
  const m = /^#([0-9a-f]{6})$/i.exec(s);
  if (!m) return [0, 0, 0, 255];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
};

class RasterContext {
  fillStyle: unknown = "#000000";
  strokeStyle: unknown = "#000000";
  lineWidth = 1;
  globalAlpha = 1;
  globalCompositeOperation = "source-over";
  imageSmoothingEnabled = true;
  private m = [1, 0, 0, 1, 0, 0]; // x' = a x + c y + e, y' = b x + d y + f
  private stack: { m: number[]; fill: unknown; alpha: number; op: string }[] = [];
  constructor(readonly canvas: RasterCanvas) {}
  save(): void { this.stack.push({ m: [...this.m], fill: this.fillStyle, alpha: this.globalAlpha, op: this.globalCompositeOperation }); }
  restore(): void {
    const s = this.stack.pop();
    if (s) { this.m = s.m; this.fillStyle = s.fill; this.globalAlpha = s.alpha; this.globalCompositeOperation = s.op; }
  }
  translate(x: number, y: number): void {
    const [a, b, c, d, e, f] = this.m;
    this.m = [a, b, c, d, a * x + c * y + e, b * x + d * y + f];
  }
  scale(sx: number, sy: number): void {
    const [a, b, c, d, e, f] = this.m;
    this.m = [a * sx, b * sx, c * sy, d * sy, e, f];
  }
  rotate(t: number): void {
    const cs = Math.round(Math.cos(t)), sn = Math.round(Math.sin(t)); // the sprites turn by quarter turns only
    const [a, b, c, d, e, f] = this.m;
    this.m = [a * cs + c * sn, b * cs + d * sn, c * cs - a * sn, d * cs - b * sn, e, f];
  }
  private map(x: number, y: number): [number, number] {
    const [a, b, c, d, e, f] = this.m;
    return [a * x + c * y + e, b * x + d * y + f];
  }
  private paint(i: number, j: number, col: string): void {
    const cv = this.canvas;
    if (i < 0 || j < 0 || i >= cv.width || j >= cv.height) { cv.oob++; return; }
    if (this.globalAlpha <= 0) return;
    const k = j * cv.width + i;
    if (this.globalCompositeOperation === "source-in") cv.px[k] = cv.px[k] === null ? null : col;
    else cv.px[k] = col;
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    const [x0, y0] = this.map(x, y), [x1, y1] = this.map(x + w, y + h);
    const xa = Math.round(Math.min(x0, x1)), xb = Math.round(Math.max(x0, x1));
    const ya = Math.round(Math.min(y0, y1)), yb = Math.round(Math.max(y0, y1));
    for (let j = ya; j < yb; j++) for (let i = xa; i < xb; i++) this.paint(i, j, String(this.fillStyle));
  }
  clearRect(x: number, y: number, w: number, h: number): void {
    for (let j = Math.round(y); j < Math.round(y + h); j++) for (let i = Math.round(x); i < Math.round(x + w); i++) {
      if (i >= 0 && j >= 0 && i < this.canvas.width && j < this.canvas.height) this.canvas.px[j * this.canvas.width + i] = null;
    }
  }
  drawImage(img: RasterCanvas, ...a: number[]): void {
    let sx = 0, sy = 0, sw = img.width, sh = img.height, dx = 0, dy = 0, dw = img.width, dh = img.height;
    if (a.length === 2) [dx, dy] = a;
    else if (a.length === 4) [dx, dy, dw, dh] = a;
    else [sx, sy, sw, sh, dx, dy, dw, dh] = a;
    for (let j = 0; j < dh; j++) for (let i = 0; i < dw; i++) {
      const u = Math.floor(sx + ((i + 0.5) * sw) / dw), v = Math.floor(sy + ((j + 0.5) * sh) / dh);
      const col = img.at(u, v);
      if (col === null) continue;
      const [X, Y] = this.map(dx + i + 0.5, dy + j + 0.5);
      this.paint(Math.floor(X), Math.floor(Y), col);
    }
  }
  getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray; width: number; height: number } {
    const data = new Uint8ClampedArray(4 * w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const col = this.canvas.at(x + i, y + j);
      if (col !== null) data.set(hexRGBA(col), 4 * (j * w + i));
    }
    return { data, width: w, height: h };
  }
  measureText(): { width: number } { return { width: 0 }; }
  beginPath(): void {}
  arc(): void {}
  rect(): void {}
  clip(): void {}
  stroke(): void {}
  fill(): void {}
  moveTo(): void {}
  lineTo(): void {}
}

(globalThis as unknown as { document: unknown }).document = { createElement: () => new RasterCanvas() };
const R = (c: HTMLCanvasElement | null | undefined): RasterCanvas => c as unknown as RasterCanvas;
const G = (c: RasterCanvas): CanvasRenderingContext2D => c.getContext() as unknown as CanvasRenderingContext2D;
const fresh = (w: number, h: number): RasterCanvas => { const c = new RasterCanvas(); c.width = w; c.height = h; return c; };

const PALETTE = new Set<string>(Object.values(C));
const sig = (c: RasterCanvas): string => c.px.map((p) => p ?? "-").join(",");
const mask = (c: RasterCanvas): string => c.px.map((p) => (p === null ? "0" : "1")).join("");
const opaque = (c: RasterCanvas): number => c.px.filter((p) => p !== null).length;
const colours = (c: RasterCanvas): Set<string> => new Set(c.px.filter((p): p is string => p !== null));

/** Not empty, every paint inside the canvas, palette colours only. */
function wellDrawn(c: RasterCanvas, w: number, h: number, min: number, what: string): void {
  expect([c.width, c.height], what).toEqual([w, h]);
  expect(c.oob, `${what} paints outside its cell`).toBe(0);
  expect(opaque(c), `${what} is nearly empty`).toBeGreaterThanOrEqual(min);
  for (const col of colours(c)) expect(PALETTE.has(col), `${what}: ${col} is not a palette colour`).toBe(true);
}

// 0.8.0 I1: the existing parts are every entry but wave 3's (with the switch on Object.values lists wave 3 too)
const DEFS = Object.values(ITEMS).filter((d) => !isWave3(d.id));
const EXISTING = (kind: string): string[] => DEFS.filter((d) => d.kind === kind).map((d) => d.id);

/** Y7b2 (the flip): 8 wave-3 defs took release Y's rules (content.ts's STAR_DIFF rows, folded at the flip; DESIGN-Y rows
 *  21, 20, 30, 26, 39, 34, 47, 35): TWIN GAUGE's and PINCER's floors go (flat 0; PINCER's dead max 3 too), TWIN LATCH's
 *  flat goes and its hold is 1 / 2 / 3 s, PLATE BREAKER's floor goes, STEAM BREECH is 40 / 80 / 120% plated with no bare
 *  rate, TWIN TRIGGER pairs at 30 / 60 / 95% with no load-time cut, SPALL CATCHER has no cap, SEAM WELDER's lone plating
 *  is 0. A1's copy (tools/wave3Defs.ts) keeps 0.9.2's numbers, so each of these is A1's copy with the flip's fields over
 *  it (every other field, and the other 7 defs, A1's copy as before). */
const FLIPPED: Record<string, Record<string, unknown>> = {
  twingauge: { gate: { gauge: { flat: 0, matched: 30 } }, levels: { 2: { gate: { gauge: { flat: 0, matched: 66 } } }, 3: { gate: { gauge: { flat: 0, matched: 105 } } } } },
  pincer: { gate: { pincer: { flat: 0, each: 20 } }, levels: { 2: { gate: { pincer: { flat: 0, each: 44 } } }, 3: { gate: { pincer: { flat: 0, each: 70 } } } } },
  twinlatch: { gate: { latch: { hold: 1, flat: 0 } }, levels: { 2: { gate: { latch: { hold: 2, flat: 0 } } }, 3: { gate: { latch: { hold: 3, flat: 0 } } } } },
  platebreaker: { gate: { breaker: { flat: 40, floor: 0 } }, levels: { 2: { gate: { breaker: { flat: 88, floor: 0 } } }, 3: { gate: { breaker: { flat: 140, floor: 0 } } } } },
  steambreech: { core: { routine: "steam", steamPlated: 40 }, levels: { 2: { core: { steamPlated: 80 } }, 3: { core: { steamPlated: 120 } } } },
  twintrigger: { mod: { pairBonus: 0.3 }, levels: { 2: { mod: { pairBonus: 0.6 } }, 3: { mod: { pairBonus: 0.95 } } } },
  spallcatcher: { mod: { spall: { every: 40, add: 10 } }, levels: { 2: { mod: { spall: { every: 40, add: 22 } } }, 3: { mod: { spall: { every: 40, add: 35 } } } } },
  seamwelder: { mod: { seam: { pair: 10, lone: 0 } }, levels: { 2: { mod: { seam: { pair: 22, lone: 0 } } }, 3: { mod: { seam: { pair: 35, lone: 0 } } } } },
};
/** PLAIN-1F (M6; REQ-BFG-107): a display name renamed since A1's copy (the key and every number as they were): PLATE
 *  BREAKER is SHIELD FUEL (the cold read's pick, M8; content.ts platebreaker). */
const RENAMED: Record<string, Record<string, unknown>> = { platebreaker: { name: "SHIELD FUEL" } };

// ======================================================================================================= this branch

describe("wave 3's 15 modules: P1's ids, drawn at the game's entry points (P1's real defs, merged at I1)", () => {
  // Y7b2 (the flip): was "...; every ITEMS entry of wave 3 is P1's def, equal to A1's copy (tools/wave3Defs.ts)"
  it("the ids are P1's, by kind; every ITEMS entry of wave 3 is P1's def: A1's copy (tools/wave3Defs.ts), with the flip's numbers on 8", () => {
    expect([...WAVE3_ART_IDS]).toEqual([...P1_WAVE3_IDS]);
    expect([...WAVE3_ART_IDS]).toEqual([...WAVE3_IDS]); // 0.8.0 I1: the real ids, in P1's order
    expect(WAVE3_ART_IDS).toHaveLength(15);
    for (const [ids, kind] of [[WAVE3_RIGS, "gate"], [WAVE3_FACTORIES, "factory"], [WAVE3_CORES, "core"], [WAVE3_GEAR, "mod"]] as const) {
      for (const id of ids) expect(ITEMS[id].kind, id).toBe(kind);
    }
    expect(WAVE3_RIGS.map((id) => ITEMS[id].shape)).toEqual(["I", "I", "I", "L", "II", "II", "T", "X"]);
    // BUMP-1E: the scaling rules ship on (SCALE_RIGS, bb-0.12.0) and rework two of the 15 (src/sim/scale.ts SCALE_DEFS: IRON WALL, `shieldwall`, and
    // SPALL CATCHER, `spallcatcher`, become readers: no plating step, no charge). The "equal to A1's copy with the flip's numbers" check below is the
    // 0.9.11 world's, so it is read with the switch off (withScaleRigs(fn, false), synchronously: OFF holds the entries then); with it on the two are
    // SCALE_DEFS' defs built from those entries and the other 13 are the same entries as with it off
    expect(SCALE_RIGS).toBe(true);
    const REWORKED = WAVE3_ART_IDS.filter((id) => Object.prototype.hasOwnProperty.call(SCALE_DEFS, id));
    expect([...REWORKED]).toEqual(["shieldwall", "spallcatcher"]);
    const OFF = withScaleRigs(() => Object.fromEntries(WAVE3_ART_IDS.map((id) => [id, ITEMS[id]])), false) as Record<string, ItemDef>;
    for (const id of WAVE3_ART_IDS) {
      expect(Object.prototype.hasOwnProperty.call(ITEMS, id), id).toBe(true); // 0.8.0 I1: flipped (the real defs)
      // AZ-BUMP (the flip, LADDER_FIX): with the star-ladder pass on, STOKER's entry is its fixed def, a new object built from
      // P1's def as merged (ladderFix.ts LADDER_DEFS.stoker: ★3 stoke 0.7 -> 0.85, nothing else), so it is compared with
      // that fixed def of A1's copy; every other wave-3 entry as before. Off, STOKER is A1's copy itself (after the loop)
      const merged = { ...P1_WAVE3_ITEMS[id], ...FLIPPED[id], ...RENAMED[id] } as unknown as ItemDef; // PLAIN-1F (M6): RENAMED
      // HULL-ON (the flip, GUARD): PLATE ROLLER's entry is its guarded def (guard.ts GUARD_DEFS.plateroller: gate.plate
      // 5 / 11 / 17 -> 15 / 33 / 51, nothing else), built from the def as merged, so it is compared with that guarded def of
      // A1's copy; off, PLATE ROLLER is A1's copy itself (after the loop)
      const fixed = Object.prototype.hasOwnProperty.call(LADDER_DEFS, id) ? LADDER_DEFS[id](merged) : merged;
      const want = Object.prototype.hasOwnProperty.call(GUARD_DEFS, id) ? GUARD_DEFS[id](fixed) : fixed; // Y7b2 (the flip): was P1_WAVE3_ITEMS[id]
      expect(OFF[id], id).toEqual(want); // BUMP-1E: was ITEMS[id], read as shipped (with the switch off it is the same entry: the 0.9.11 world)
      // BUMP-1E: the shipped entry (the switch on): SCALE_DEFS' def of the two reworked, which hold a reader line (`reads`) and no old effect; every other as it was
      if (REWORKED.includes(id)) {
        expect(ITEMS[id], id).toEqual(SCALE_DEFS[id](OFF[id]));
        expect(ITEMS[id], id).not.toEqual(want);
        expect(ITEMS[id].gate?.reads ?? ITEMS[id].mod?.reads, id).toBeDefined();
      } else expect(ITEMS[id], id).toEqual(want);
      expect(isWave3Art(id), id).toBe(true);
    }
    expect(withLadderFix(() => ITEMS.stoker, false)).toEqual(P1_WAVE3_ITEMS.stoker);
    expect(withGuard(() => ITEMS.plateroller, false)).toEqual(P1_WAVE3_ITEMS.plateroller); // HULL-ON (the flip, GUARD): off
    for (const id of [...DEFS.map((d) => d.id), "zz-none", "constructor", "toString"]) expect(isWave3Art(id), id).toBe(false);
  });

  it("every rig draws through gateSprite (12x12) at frames 0-7, idle and active: not empty, inside its cell, palette only", () => {
    for (const id of WAVE3_RIGS) for (let f = 0; f < 8; f++) for (const active of [false, true]) {
      wellDrawn(R(gateSprite(id, f, active)), 12, 12, 40, `${id} frame ${f}${active ? " active" : ""}`);
    }
  });

  it("both factories draw through factorySprite (24x24) at frames 0-7, idle and stamping, 1-3 stars; the flash silhouette is white", () => {
    for (const id of WAVE3_FACTORIES) for (const s of [1, 2, 3]) {
      for (let f = 0; f < 8; f++) for (const flash of [false, true]) wellDrawn(R(factorySprite(id, f, flash, s)), 24, 24, 300, `${id} ${s}* frame ${f}${flash ? " flash" : ""}`);
      const sil = R(factoryFlashSil(id, s));
      expect(mask(sil), `${id} ${s}* silhouette`).toBe(mask(R(factorySprite(id, 0, false, s))));
      expect([...colours(sil)], id).toEqual([C.white]);
      // the entry point draws wave3Art's own sprite (the hook in factorySprite's chain)
      expect(sig(R(factorySprite(id, 3, true, s)))).toBe(sig(R(wave3FactoryArt(id, 3, true, s))));
    }
  });

  it("every part has its 12x12 icon through itemIcon (cards, cargo, the inspector); a rig's is its idle frame, as every rig's", () => {
    for (const id of WAVE3_ART_IDS) wellDrawn(R(itemIcon(id)), 12, 12, 30, `${id} icon`);
    for (const id of WAVE3_RIGS) expect(sig(R(itemIcon(id))), id).toBe(sig(R(gateSprite(id, 0, false))));
    for (const id of [...WAVE3_FACTORIES, ...WAVE3_CORES, ...WAVE3_GEAR]) {
      const own = fresh(12, 12);
      expect(drawWave3Icon(G(own), id), id).toBe(true);
      expect(sig(R(itemIcon(id))), `${id}: itemIcon draws wave3Art's icon`).toBe(sig(own));
    }
  });

  it("frames differ where the art animates; a hit (active) differs from idle; each battle state differs from the plain look", () => {
    for (const id of WAVE3_RIGS) {
      const idle = new Set(Array.from({ length: 8 }, (_, f) => sig(R(gateSprite(id, f, false)))));
      expect(idle.size, `${id} idle frames`).toBeGreaterThan(1);
      expect(sig(R(gateSprite(id, 0, true))), `${id} active`).not.toBe(sig(R(gateSprite(id, 0, false))));
      for (let f = 0; f < 8; f++) for (const a of [false, true]) {
        expect(sig(R(wave3GateSprite(id, f, a, {}))), `${id}: an empty state is the plain sprite`).toBe(sig(R(gateSprite(id, f, a))));
      }
    }
    const STATES: [string, Wave3RigState][] = [
      ["twingauge", { matched: true }], ["pincer", { crowd: 1 }], ["pincer", { crowd: 3 }], ["braceframe", { shrug: true }],
      ["twinlatch", { latch: "hold" }], ["twinlatch", { latch: "release" }], ["platebreaker", { spent: false }], ["shieldwall", { plated: true }],
    ];
    for (const [id, st] of STATES) {
      const c = R(wave3GateSprite(id, 0, id === "platebreaker", st));
      wellDrawn(c, 12, 12, 40, `${id} ${JSON.stringify(st)}`);
      expect(sig(c), `${id} ${JSON.stringify(st)}`).not.toBe(sig(R(gateSprite(id, 0, id === "platebreaker"))));
    }
    expect(sig(R(wave3GateSprite("pincer", 0, false, { crowd: 1 })))).not.toBe(sig(R(wave3GateSprite("pincer", 0, false, { crowd: 3 }))));
    for (const id of WAVE3_FACTORIES) {
      const idle = new Set(Array.from({ length: 8 }, (_, f) => sig(R(factorySprite(id, f, false)))));
      expect(idle.size, `${id} idle frames`).toBeGreaterThan(1);
      expect(sig(R(factorySprite(id, 0, true))), `${id} stamp`).not.toBe(sig(R(factorySprite(id, 0, false))));
    }
    // ARMOR PRESS's plating press: a glowing plate slides down the chute
    const plain = sig(R(wave3FactoryArt("armorpress", 1, false, 1)));
    const slide = new Set([0, 0.2, 0.4, 0.6].map((t) => sig(R(wave3FactoryArt("armorpress", 1, false, 1, { plateT: t })))));
    expect(slide.size).toBe(4);
    expect(slide.has(plain)).toBe(false);
    expect(sig(R(wave3FactoryArt("armorpress", 1, false, 1, { plateT: 2 })))).toBe(plain);
    // STOKER's flare and ANVIL BREECH's sparks: palette, distinct frames
    for (const [fx, n, w, h] of [[stokeFlare, 4, 7, 9], [anvilSparks, 3, 9, 7]] as const) {
      const frames = Array.from({ length: n }, (_, k) => R(fx(k)));
      frames.forEach((c, k) => wellDrawn(c, w, h, 4, `${fx.name} ${k}`));
      expect(new Set(frames.map(sig)).size).toBe(n);
    }
  });

  it("the star treatments differ: TWIN MOULD bands in brass (2) and cuts a third spout (3); ARMOR PRESS stacks 1, 2, 3 plates", () => {
    for (const id of WAVE3_FACTORIES) {
      for (let f = 0; f < 8; f++) {
        const s = [1, 2, 3].map((n) => sig(R(factorySprite(id, f, false, n))));
        expect(new Set(s).size, `${id} frame ${f}: stars 1-3`).toBe(3);
      }
      expect(new Set([1, 2, 3].map((n) => mask(R(factoryFlashSil(id, n))))).size >= 2, id).toBe(true);
    }
  });

  it("each silhouette differs from every existing part of its kind, and from the other new ones", () => {
    const rigMasks = new Map(EXISTING("gate").map((id) => [mask(R(gateSil(id))), id]));
    const seen = new Set<string>();
    for (const id of WAVE3_RIGS) {
      const m = mask(R(gateSil(id)));
      expect(rigMasks.get(m), `${id}'s silhouette is ${rigMasks.get(m)}'s`).toBeUndefined();
      expect(seen.has(m), `${id}'s silhouette repeats another new rig's`).toBe(false);
      seen.add(m);
    }
    const facMasks = new Map<string, string>();
    for (const id of EXISTING("factory")) for (const s of [1, 2, 3]) facMasks.set(mask(R(factoryFlashSil(id, s))), id);
    for (const id of WAVE3_FACTORIES) for (const s of [1, 2, 3]) {
      const m = mask(R(factoryFlashSil(id, s)));
      expect(facMasks.get(m), `${id} ${s}*'s silhouette is ${facMasks.get(m)}'s`).toBeUndefined();
    }
    expect(mask(R(factoryFlashSil("twinmould")))).not.toBe(mask(R(factoryFlashSil("armorpress"))));
    for (const [ids, kind] of [[WAVE3_CORES, "core"], [WAVE3_GEAR, "mod"]] as const) {
      const icons = new Map(EXISTING(kind).map((id) => [mask(R(itemIcon(id))), id]));
      const mine = new Set<string>();
      for (const id of ids) {
        const m = mask(R(itemIcon(id)));
        expect(icons.get(m), `${id}'s icon silhouette is ${icons.get(m)}'s`).toBeUndefined();
        expect(mine.has(m), id).toBe(false);
        mine.add(m);
      }
    }
  });

  it("every hook answers for a wave-3 id only: an existing part (or an unknown id) gets nothing from wave3Art", () => {
    const g = G(fresh(12, 12));
    for (const id of [...DEFS.map((d) => d.id), "zz-none", "constructor", "toString", "hasOwnProperty", "__proto__"]) {
      expect(drawWave3Gate(g, id, 0, false), id).toBe(false);
      expect(wave3GateSprite(id, 0, false), id).toBeNull();
      expect(wave3FactoryArt(id, 0, false, 1), id).toBeUndefined();
      expect(drawWave3Icon(g, id), id).toBe(false);
      expect(wave3ChuteMouth(id), id).toBeUndefined();
      expect(wave3Gem(id), id).toBeUndefined();
      expect(wave3GearFace(id), id).toBeNull();
    }
  });

  it("chute mouths, socket gems and gear faces are palette colours, and new beside today's", () => {
    // the chute glow: TWIN MOULD's fresh cast, ARMOR PRESS's pressed plate (today: fire2, ice, yellow, rune2, steel3)
    expect([wave3ChuteMouth("twinmould"), wave3ChuteMouth("armorpress")]).toEqual([C.fire3, C.plate3]);
    for (const c of [C.fire3, C.plate3]) expect([C.fire2, C.ice, C.yellow, C.rune2, C.steel3]).not.toContain(c);
    // the gems on every hero's gun; STEAM BREECH's gauge kicks into the red while plated
    expect(WAVE3_CORE_GEM).toEqual({ anvil: C.plate2, steambreech: C.white });
    for (const h of Object.keys(HEROES) as HeroId[]) {
      expect(gemColor("anvil", h), h).toBe(C.plate2);
      expect(gemColor("steambreech", h), h).toBe(C.white);
    }
    expect(wave3Gem("steambreech", true)).toBe(C.red);
    expect(wave3Gem("anvil", true)).toBe(C.plate2);
    // each gear piece's 3x3 face: nine palette colours; its battle state shows
    const faces = WAVE3_GEAR.map((id) => wave3GearFace(id)!);
    for (const f of faces) {
      expect(f).toHaveLength(9);
      for (const c of f) expect(PALETTE.has(c), c).toBe(true);
    }
    expect(new Set(faces.map((f) => f.join())).size).toBe(3);
    expect(wave3GearFace("twintrigger", { pair: 0.1 })).not.toEqual(wave3GearFace("twintrigger"));
    expect(wave3GearFace("twintrigger", { pair: 0.5 })).toEqual(wave3GearFace("twintrigger"));
    expect(wave3GearFace("seamwelder", { pair: 0 })).not.toEqual(wave3GearFace("seamwelder"));
    const charge = [0, 0.4, 0.7, 1].map((q) => wave3GearFace("spallcatcher", { charge: q })!.join());
    expect(new Set(charge).size).toBe(4);
  });
});

// ================================================================================================= I1's world

/** The deck frame the build view uses here: bow north, the hull's box at (10, 32). */
const FRAME: DeckFrame = frameForHull(0, 10, 32);

/** A build drawn as the build screen draws it (no sim): machinery and turrets, at t = 0. */
function deck(b: Build): RasterCanvas {
  const c = fresh(176, 184);
  const v: CruiserView = { side: 0, build: b, model: cruiserModel(b), frame: FRAME, t: 0, tread: 0 };
  drawMachinery(G(c), v);
  drawTurrets(G(c), v);
  return c;
}

/** `hero`'s start deck with its signature factory replaced by `id` (its belts then leave through id's chutes). */
function withFactory(hero: HeroId, id: string, stars: number): { b: Build; uid: number } {
  const b = cloneBuild(heroStartBuild(hero, 1));
  const uid = b.routes[0].factory;
  const p = b.items.find((q) => q.uid === uid)!;
  p.def = id;
  if (stars > 1) p.stars = stars;
  return { b, uid };
}

/** `hero`'s start deck with rig `id` on the free cell beside a belt where its arrows work the most tiles.
 *  0.8.0 I1 (oracle cb613c9cbd33ca88): a STOKER works factories, never belts (P1's E3: deck.ts rigHits skips it), so it
 *  stands at its best beltside.ts stokeSpots spot, beside the hero's factory. */
function withRig(hero: HeroId, id: string, stars: number): { b: Build; x: number; y: number } {
  const base = heroStartBuild(hero, 1);
  if (ITEMS[id].gate?.stoke) {
    const s = stokeSpots(base, id)[0];
    const b = cloneBuild(base);
    b.items.push({ uid: 990, def: id, x: s.x, y: s.y, ...(stars > 1 ? { stars } : {}), ...rotField(id, s.rot) });
    return { b, x: s.x, y: s.y };
  }
  const occ = occupancy(base);
  let best: { b: Build; x: number; y: number; n: number } | null = null;
  for (let k = 0; k < GRID * GRID; k++) {
    if (occ[k].item >= 0 || occ[k].route >= 0) continue;
    const x = kx(k), y = ky(k);
    if (![0, 1, 2, 3].some((d) => inGrid(x + DX[d], y + DY[d]) && occ[key(x + DX[d], y + DY[d])].route >= 0)) continue;
    for (let rot = 0; rot < 4; rot++) {
      const b = cloneBuild(base);
      b.items.push({ uid: 990, def: id, x, y, ...(stars > 1 ? { stars } : {}), ...rotField(id, rot) });
      const n = hitsOfRig(b, 990, rigHits(b)).length;
      if (!best || n > best.n) best = { b, x, y, n };
    }
  }
  return best!;
}

/** The region (x, y, w, h) of a deck render as a signature. */
const region = (c: RasterCanvas, x: number, y: number, w: number, h: number): string => {
  const out: string[] = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out.push(c.at(x + i, y + j) ?? "-");
  return out.join(",");
};

describe("with P1's 15 defs in ITEMS (I1's world), the deck and gun entry points draw the wave-3 art", () => {
  // 0.8.0 I1: the real defs are merged; the install and remove of A1's copies are gone (they would shadow, then delete,
  // the real entries)
  it("the defs are in ITEMS as P1's switch keeps them: own entries, listed exactly when wave 3 is live", () => {
    for (const id of P1_WAVE3_IDS) expect(Object.prototype.hasOwnProperty.call(ITEMS, id), id).toBe(true);
    expect(Object.keys(ITEMS).some((id) => isWave3Art(id))).toBe(wave3Live());
  });

  it("TWIN MOULD and ARMOR PRESS in a start deck's factory place: their sprite at the factory's cells, their chutes' glow", () => {
    for (const [id, hero, mouth] of [["twinmould", "foundry", C.fire3], ["armorpress", "bastion", C.plate3]] as const) {
      const { b, uid } = withFactory(hero, id, 1);
      const c = deck(b);
      const p = b.items.find((q) => q.uid === uid)!;
      const x = Math.round(footX(FRAME, p.x, p.y, 2)), y = Math.round(footY(FRAME, p.x, p.y, 2));
      const spr = R(factorySprite(id, 0, false, 1));
      for (let j = 0; j < 24; j++) for (let i = 0; i < 24; i++) {
        const s = spr.at(i, j);
        if (s !== null) expect(c.at(x + i, y + j), `${id} pixel ${i},${j}`).toBe(s);
      }
      // each belt's chute, as machinery.ts drawChute places it, glows in the factory's own colour
      const model = cruiserModel(b);
      const routes = model.routes.filter((r) => r.factory === uid && r.cells.length);
      expect(routes.length, id).toBeGreaterThan(0);
      for (const rm of routes) {
        const lx = kx(rm.cells[0]) * CELL, ly = ky(rm.cells[0]) * CELL;
        const box: Box = { x: 0, y: 0, w: 0, h: 0 };
        if (rm.d0 === 0) localRect(FRAME, lx + 2, ly + 9, 8, 5, box);
        else if (rm.d0 === 2) localRect(FRAME, lx + 2, ly - 2, 8, 5, box);
        else if (rm.d0 === 1) localRect(FRAME, lx - 2, ly + 2, 5, 8, box);
        else localRect(FRAME, lx + 9, ly + 2, 5, 8, box);
        expect(c.at(box.x + 2, box.y + 2), `${id} chute`).toBe(mouth);
      }
    }
  });

  it("each rig at work (beside a belt; STOKER beside a factory): its sprite at its cell (clear of the nozzles), and 2 and 3 stars add the pips and the rim", () => {
    for (const id of WAVE3_RIGS) {
      const cells: string[] = [];
      for (const stars of [1, 2, 3]) {
        const { b, x, y } = withRig("furnace", id, stars);
        if (ITEMS[id].gate?.stoke) expect(stokeHits(b).filter((h) => h.uid === 990).length, `${id} works a factory`).toBeGreaterThan(0);
        else expect(hitsOfRig(b, 990, rigHits(b)).length, `${id} works a belt`).toBeGreaterThan(0);
        const c = deck(b);
        const sx = Math.round(footX(FRAME, x, y)), sy = Math.round(footY(FRAME, x, y));
        const spr = R(gateSprite(id, 0, false));
        for (let j = 3; j <= 8; j++) for (let i = 3; i <= 8; i++) {
          const s = spr.at(i, j);
          if (s !== null && stars < 3) expect(c.at(sx + i, sy + j), `${id} pixel ${i},${j}`).toBe(s);
        }
        cells.push(region(c, sx, sy, 12, 12));
      }
      expect(new Set(cells).size, `${id}: 1, 2 and 3 stars`).toBe(3);
    }
  });

  it("each core shows its gem in the gun's socket, each gear piece its 3x3 face in its hardpoint box; stars add pips", () => {
    const b0 = heroStartBuild("furnace", 1);
    const td = turretSlots(b0)[0].td!;
    expect(td.kind).toBe("heavy");
    const px = Math.round(turretPivotX(FRAME, td.col0, td.width)), py = Math.round(turretPivotY(FRAME, td.col0, td.width));
    const pu = 12, bu = -pu - 5, su = 3, sv = pu - 8; // cruiser.ts drawTurrets on an orc HEAVY (no race look)
    for (const id of [...WAVE3_CORES, ...WAVE3_GEAR]) {
      const renders: string[] = [];
      for (const stars of [1, 2, 3]) {
        const b = cloneBuild(b0);
        b.mods = [{ uid: 980, def: id, turret: 0, ...(stars > 1 ? { stars } : {}) }];
        const c = deck(b);
        if ((WAVE3_CORES as readonly string[]).includes(id)) {
          expect(c.at(px + su + 1, py + sv + 3), `${id} gem`).toBe(gemColor(id, "furnace"));
          renders.push(region(c, px + su - 9, py + sv, 16, 6));
        } else {
          const face = wave3GearFace(id)!;
          face.forEach((col, k) => expect(c.at(px + bu + 1 + (k % 3), py - 2 + Math.floor(k / 3)), `${id} face ${k}`).toBe(col));
          renders.push(region(c, px + bu, py - 3, 9, 8));
        }
      }
      expect(new Set(renders).size, `${id}: 1, 2 and 3 stars`).toBe(3);
    }
  });

  it("itemIcon draws wave3Art's icon even when ITEMS holds the def: it asks wave3Art before drawCoreIcon and drawFactoryIcon", async () => {
    vi.resetModules();
    const content = await import("../src/sim/content");
    // 0.8.0 I1: the fresh module already holds P1's real defs (no copies installed)
    for (const id of P1_WAVE3_IDS) expect(Object.prototype.hasOwnProperty.call(content.ITEMS, id), id).toBe(true);
    const sprites = await import("../src/render/sprites");
    const art = await import("../src/render/wave3Art");
    const coreArt = await import("../src/render/coreArt");
    for (const id of [...WAVE3_CORES, ...WAVE3_FACTORIES, ...WAVE3_GEAR]) {
      const own = fresh(12, 12);
      art.drawWave3Icon(G(own), id);
      expect(sig(R(sprites.itemIcon(id))), id).toBe(sig(own));
    }
    // the control: with the def in ITEMS, drawCoreIcon alone would draw its default gem disc instead
    const disc = fresh(12, 12);
    expect(coreArt.drawCoreIcon(G(disc), "anvil")).toBe(true);
    expect(sig(disc)).not.toBe(sig(R(sprites.itemIcon("anvil"))));
  });
});

// ================================================================================================ the portraits

/** D1's six NPCs (output-D1 tools/wave3Npcs.ts at e782532): id, hero, palette. */
const D1: [string, HeroId, string[]][] = [
  ["brasswick", "foundry", ["brass2", "steel2", "bone", "lime"]],
  ["voss", "foundry", ["brass3", "ink", "steel1", "amber"]],
  ["grimhold", "bastion", ["steel3", "rust2", "fire3", "bone"]],
  ["karsk", "bastion", ["steel1", "steel3", "brass1", "rust3"]],
  ["lockjaw", "furnace", ["rust2", "steel2", "brass2", "fire2"]],
  ["thistlemail", "weaver", ["verd2", "steel2", "white", "verd4"]],
];
const BASES: Base[] = ["human", "dwarf", "orc", "elf"];
const RACE_BASE: Record<string, Base> = { human: "human", dwarf: "dwarf", orc: "orc", elf: "elf" };

/** A base's own pixels (skin, brows, eyes' ink, tusks): painted with look colours that no base uses, then kept. */
function baseSkin(base: Base): Map<number, ColorName> {
  const look: Look = { eye: "plum0", garment: "plum1", trim: "plum2", hair: "plum3" };
  const p = blank();
  paintBase(p, base, look);
  const out = new Map<number, ColorName>();
  p.forEach((c, i) => { if (c && !["plum0", "plum1", "plum2", "plum3"].includes(c)) out.set(i, c); });
  return out;
}

describe("the six new NPC portraits (D1's ids, on their race's base)", () => {
  // 0.8.0 N1 (BRIEF-wave3-N1 section 3, VERIFIED-A1 G item 1): the pending test flips. The six are rivals now, with D1's hero
  // and A1's palette (WAVE3_NPC_PORTRAIT), on PORTRAIT_KEYS after the 13, and WAVE3_NPC_IDS is empty (nothing is pending)
  it("are D1's NPCs, now captains: their hero and palette as D1 planned, on the roster and on PORTRAIT_KEYS, none pending", () => {
    expect([...WAVE3_NPC_IDS]).toEqual([]);
    for (const [id, hero, palette] of D1) {
      expect(WAVE3_NPC_PORTRAIT[id as keyof typeof WAVE3_NPC_PORTRAIT], id).toEqual({ hero, palette });
      expect(Object.prototype.hasOwnProperty.call(RIVALS, id), `${id} is a rival`).toBe(true);
      const r = RIVALS[id as keyof typeof RIVALS];
      expect([r.hero, r.portrait.palette], id).toEqual([hero, palette]);
      expect(PORTRAIT_KEYS as string[], id).toContain(id);
    }
    expect((PORTRAIT_KEYS as string[]).slice(13, 19)).toEqual(D1.map(([id]) => id));
    // every FEATURES key is a rival, a hero with a portrait, or a pending wave-3 NPC, and each of those has one
    const known = new Set<string>([...RIVAL_IDS, ...PORTRAIT_HEROES, ...WAVE3_NPC_IDS]);
    for (const k of Object.keys(FEATURES)) expect(known.has(k), `FEATURES.${k} is nobody's`).toBe(true);
    for (const k of known) expect(Object.prototype.hasOwnProperty.call(FEATURES, k), `${k} has no FEATURES entry`).toBe(true);
    expect(PORTRAIT_KEYS.length).toBe(RIVAL_IDS.length + PORTRAIT_HEROES.length);
  });

  it("each is 24x24 pixel data in palette colours, outlined in ink, 45-85% opaque, wears all of its palette, no rank frame", () => {
    for (const [id, , palette] of D1) {
      const { w, h, px } = portraitPixels(id as PortraitKey);
      expect([w, h, px.length], id).toEqual([24, 24, 576]);
      for (const c of px) if (c !== null) expect(c in C, `${id}: ${c}`).toBe(true);
      const share = px.filter((c) => c !== null).length / px.length;
      expect(share, id).toBeGreaterThanOrEqual(0.45);
      expect(share, id).toBeLessThanOrEqual(0.85);
      for (const c of palette) expect(px, `${id} wears ${c}`).toContain(c);
      const at = (x: number, y: number) => (x < 0 || y < 0 || x >= PW || y >= PH ? null : px[y * PW + x]);
      for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
        if (at(x, y) !== null) continue;
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
          const n = at(nx, ny);
          if (n !== null && n !== "ink") expect.fail(`${id}: ${n} at ${nx},${ny} touches transparency without an outline`);
        }
      }
      expect([at(0, 0), at(23, 0), at(0, 23), at(23, 23)], id).toEqual([null, null, null, null]);
      // drawn once as a 24x24 canvas, pixel for pixel
      const img = R(portraitImage(id as PortraitKey));
      expect([img.width, img.height], id).toEqual([24, 24]);
      px.forEach((c, i) => expect(img.px[i], `${id} canvas ${i}`).toBe(c === null ? null : C[c]));
    }
  });

  it("each sits on its race's base (D1's hero's): most of that base's skin shows through, more than any other base's", () => {
    const skins = new Map(BASES.map((b) => [b, baseSkin(b)]));
    for (const [id, hero] of D1) {
      const px = portraitPixels(id as PortraitKey).px;
      const share = (b: Base) => {
        const s = skins.get(b)!;
        let n = 0;
        for (const [i, c] of s) if (px[i] === c) n++;
        return n / s.size;
      };
      const own = RACE_BASE[HEROES[hero].faction];
      expect(share(own), `${id} on the ${own} base`).toBeGreaterThanOrEqual(0.6);
      for (const b of BASES) if (b !== own) expect(share(b), `${id}: ${b} base`).toBeLessThan(share(own));
    }
  });

  it("each is built around its one feature: drawn without it (FEATURES entry emptied), 20 or more of its pixels change", () => {
    for (const [id] of D1) {
      const full = portraitPixels(id as PortraitKey).px;
      const feature = FEATURES[id];
      FEATURES[id] = () => {};
      try {
        const bare = portraitPixels(id as PortraitKey).px;
        expect(full.filter((c, i) => c !== bare[i]).length, id).toBeGreaterThanOrEqual(20);
      } finally {
        FEATURES[id] = feature;
      }
    }
  });

  it("all differ: from one another, from today's 13 captains and from the four heroes' portraits; each key always gives the same pixels", () => {
    const seen = new Map<string, string>();
    for (const k of [...PORTRAIT_KEYS, ...WAVE3_NPC_IDS] as PortraitKey[]) {
      const s = portraitPixels(k).px.map((c) => c ?? "-").join(",");
      expect(seen.get(s), `${k} duplicates ${seen.get(s)}`).toBeUndefined();
      seen.set(s, k);
      expect(portraitPixels(k).px.map((c) => c ?? "-").join(","), k).toBe(s);
    }
    // 0.8.0 N1: the six are on PORTRAIT_KEYS now (13 + 6 captains and 4 heroes), so no pending face adds to the count
    for (const [id] of D1) expect([...seen.values()], id).toContain(id);
    expect(seen.size).toBe(PORTRAIT_KEYS.length);
    expect(seen.size).toBe(13 + 6 + 4);
  });
});
