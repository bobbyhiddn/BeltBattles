// Road-event vignettes (0.5.0): a dusk road with the player's cruiser on the left and the
// event's props on the right. The static layer is cached per (event, size, hero, offer); the
// animated bits (smoke, sparks, dice, wind, flags, glints) are drawn per frame from the clock
// with no allocation. Reduced Motion keeps the scene but calms it (no flicker, slower motion).

import { cellNoise } from "../core/rng";
import type { EventId } from "../game/eventDefs";
import type { HeroId } from "../sim/content";
import { C } from "./palette";
import { bayer, flipX, makeCanvas, px, rect, type G } from "./pixel";
import { coinIcon, gateSprite, itemIcon } from "./sprites";
import { crate, die, figure, gantry, miniCruiser, pennant, wagon } from "./eventArt";

type Cv = HTMLCanvasElement;
const layers = new Map<string, Cv>();
let flippedFoe: Record<string, Cv> = {};

function foeCruiser(f: "orc" | "elf"): Cv {
  return (flippedFoe[f] ??= flipX(miniCruiser(f)));
}

/** Ground line (top of the road) for a scene of height h. */
export const roadY = (h: number) => Math.round(h * 0.7);

function sky(g: G, w: number, h: number, storm: boolean): void {
  const hz = Math.round(h * 0.46);
  const bands = storm ? [C.plum0, C.plum1, C.plum1, C.plum2] : [C.plum0, C.plum1, C.plum2, C.plum3];
  for (let i = 0; i < bands.length; i++) rect(g, 0, Math.floor((hz * i) / bands.length), w, Math.ceil(hz / bands.length) + 1, bands[i]);
  for (let i = 1; i < bands.length; i++) bayer(g, 0, Math.floor((hz * i) / bands.length) - 2, w, 2, bands[i], 0.5);
  if (!storm) bayer(g, 0, hz - 4, w, 4, C.rust2, 0.35); // last light on the horizon
  for (let k = 0; k < 14; k++) px(g, Math.floor(cellNoise(k, w, 3) * w), Math.floor(cellNoise(k, h, 5) * hz * 0.7), k % 3 ? C.slate3 : C.bone);
  // distant mesas
  for (let k = 0; k < 3; k++) {
    const mw = 24 + Math.floor(cellNoise(k, 9, w) * 30), mh = 6 + Math.floor(cellNoise(k, 4, h) * 9);
    const mx = Math.floor(cellNoise(k, 7, 11) * (w - mw));
    rect(g, mx, hz - mh, mw, mh, C.plum1);
    rect(g, mx + 2, hz - mh - 2, mw - 4, 2, C.plum1);
    rect(g, mx + 2, hz - mh - 2, mw - 4, 1, storm ? C.plum2 : C.plum3); // rim light
  }
  // ground + road
  rect(g, 0, hz, w, h - hz, C.soil2);
  bayer(g, 0, hz, w, h - hz, C.soil1, 0.3);
  bayer(g, 0, hz, w, 3, C.soil3, 0.4);
  const ry = roadY(h);
  rect(g, 0, ry, w, 13, C.soil1);
  bayer(g, 0, ry, w, 1, C.soil3, 0.6);
  rect(g, 0, ry + 3, w, 2, C.soil0);
  rect(g, 0, ry + 9, w, 2, C.soil0);
  bayer(g, 0, ry + 13, w, 2, C.soil3, 0.4);
  for (let k = 0; k < 18; k++) px(g, Math.floor(cellNoise(k, 1, w) * w), hz + 2 + Math.floor(cellNoise(k, 2, h) * (h - hz - 3)), k % 2 ? C.soil4 : C.soil0);
}

function put(g: G, img: Cv, x: number, y: number): void {
  g.drawImage(img, Math.round(x), Math.round(y));
}

function staticLayer(id: EventId, w: number, h: number, hero: HeroId, offer: string): Cv {
  const key = `${id}:${w}x${h}:${hero}:${offer}`;
  let c = layers.get(key);
  if (c) return c;
  const [cv, g] = makeCanvas(w, h);
  sky(g, w, h, id === "storm");
  const ry = roadY(h);
  const mine = hero === "furnace" ? "orc" : "elf", foe = hero === "furnace" ? "elf" : "orc";
  put(g, miniCruiser(mine), 6, ry - 15);
  const cx = Math.round(w * 0.62);
  switch (id) {
    case "wreck":
      put(g, miniCruiser(foe, true), cx - 18, ry - 13);
      for (let k = 0; k < 7; k++) px(g, cx - 24 + Math.floor(cellNoise(k, 3, 9) * 50), ry + 1 + Math.floor(cellNoise(k, 4, 9) * 10), k % 2 ? C.steel1 : C.rust2);
      break;
    case "cache":
      put(g, crate(), cx - 6, ry - 5);
      bayer(g, cx - 9, ry + 2, 18, 4, C.soil0, 0.5);
      put(g, crate(), cx + 9, ry - 1);
      break;
    case "trader":
      put(g, wagon(C.cyan, C.ice, C.deepblue), cx - 16, ry - 13);
      put(g, figure(C.cyan, C.wood2), cx + 18, ry - 3);
      break;
    case "dice":
      rect(g, cx - 18, ry + 2, 36, 8, C.plum2);
      bayer(g, cx - 18, ry + 2, 36, 8, C.plum3, 0.3);
      put(g, figure(C.red, C.steel1), cx - 26, ry - 3);
      put(g, figure(C.red, C.rust2), cx + 21, ry - 3);
      for (let k = 0; k < 3; k++) put(g, coinIcon(), cx + 8, ry + 4 - k * 2);
      break;
    case "dock":
      put(g, gantry(), cx - 20, ry - 30);
      put(g, miniCruiser(mine), cx - 19, ry - 14);
      break;
    case "herald":
      put(g, foeCruiser(foe), cx + 8, ry - 15);
      put(g, figure(C.red, C.maroon), cx - 12, ry - 3);
      break;
    case "sappers":
      put(g, figure(C.verd3, C.verd1), cx - 16, ry - 3);
      put(g, figure(C.verd3, C.verd2), cx - 6, ry - 2);
      rect(g, cx + 14, ry + 5, 8, 3, C.soil0);
      break;
    case "scout":
      rect(g, cx + 20, ry - 16, 2, 16, C.wood1);
      rect(g, cx + 14, ry - 15, 14, 5, C.wood2);
      rect(g, cx + 14, ry - 15, 14, 1, C.wood3);
      break;
    case "storm":
      for (let k = 0; k < 4; k++) put(g, crate(), cx - 20 + k * 11, ry + 1 - (k % 2) * 3);
      break;
    case "smuggler":
      put(g, wagon(C.slate2, C.slate3, C.slate1), cx - 16, ry - 13);
      put(g, figure(C.plum3, C.plum2), cx + 18, ry - 3);
      put(g, itemIcon("temper"), cx - 10, ry - 25);
      put(g, itemIcon("coil"), cx + 3, ry - 25);
      break;
  }
  c = cv;
  layers.set(key, c);
  return c;
}

/**
 * Draw an event vignette into rect (x, y, w, h). `offer` is the part a salvage shows, `t` the
 * screen clock, `calm` = Reduced Motion (no flicker, slower loops). No allocation per frame.
 */
export function drawScene(g: G, id: EventId, x: number, y: number, w: number, h: number, hero: HeroId, offer: string, t: number, calm: boolean): void {
  g.drawImage(staticLayer(id, w, h, hero, offer), x, y);
  const ry = y + roadY(h);
  const cx = x + Math.round(w * 0.62);
  const tt = calm ? t * 0.4 : t;
  // the player's cruiser idles: exhaust puffs
  for (let k = 0; k < 3; k++) {
    const p = (tt * 0.9 + k / 3) % 1;
    px(g, x + 12 - Math.round(p * 6), ry - 16 - Math.round(p * 10), p < 0.5 ? C.slate3 : C.slate2);
  }
  switch (id) {
    case "wreck": {
      for (let k = 0; k < 7; k++) { // smoke plume
        const p = (tt * 0.35 + k / 7) % 1;
        const sx = cx + Math.round(Math.sin(p * 5 + k) * 2 + p * 6), sy = ry - 16 - Math.round(p * (h * 0.45));
        rect(g, sx, sy, p < 0.4 ? 3 : 2, p < 0.4 ? 3 : 2, p < 0.3 ? C.slate2 : C.slate1);
      }
      const bob = Math.round(Math.sin(tt * 3) * 1.5);
      g.drawImage(gateSprite(offer, Math.floor(tt * 8), Math.floor(tt * 2) % 2 === 0), cx + 20, ry - 22 + bob);
      break;
    }
    case "cache":
      if (Math.floor(tt * 2) % 3 === 0) { px(g, cx - 3, ry - 7, C.white); px(g, cx - 4, ry - 6, C.yellow); px(g, cx - 2, ry - 6, C.yellow); }
      g.drawImage(coinIcon(), cx + 12, ry - 6 + Math.round(Math.sin(tt * 2.5)));
      break;
    case "trader": {
      const b1 = Math.round(Math.sin(tt * 2.2) * 1.5), b2 = Math.round(Math.sin(tt * 2.2 + 1.7) * 1.5);
      g.drawImage(itemIcon(offer), cx - 12, ry - 30 + b1);
      g.drawImage(coinIcon(), cx + 4, ry - 26 + b2);
      break;
    }
    case "dice": {
      const f = Math.floor(tt * 7);
      g.drawImage(die(1 + (f % 6)), cx - 9, ry + 1 - (f % 2));
      g.drawImage(die(1 + ((f * 5 + 2) % 6)), cx - 1, ry + 2 - ((f + 1) % 2));
      break;
    }
    case "dock":
      if (calm || Math.floor(t * 12) % 3 !== 0) {
        const s = Math.floor(tt * 10);
        for (let k = 0; k < 4; k++) px(g, cx + 1 + ((s + k * 3) % 7) - 3, ry - 12 + ((s * 2 + k) % 5), k % 2 ? C.fire4 : C.yellow);
      }
      break;
    case "herald":
      g.drawImage(pennant(C.red, C.maroon, Math.floor(tt * 5)), cx - 18, ry - 24);
      break;
    case "sappers": {
      const on = calm || Math.floor(t * 6) % 2 === 0;
      rect(g, cx + 15, ry + 2, 6, 3, C.steel1);
      if (on) { px(g, cx + 18, ry, C.fire4); px(g, cx + 19, ry - 1, C.fire3); }
      break;
    }
    case "scout": {
      const span = w + 40, wx = x - 36 + ((tt * 14) % span);
      if (wx < x + w - 34) {
        g.drawImage(wagon(C.cyan, C.ice, C.deepblue), Math.round(wx), ry - 12);
        for (let k = 0; k < 4; k++) px(g, Math.round(wx) - 2 - k * 3, ry + 6 - (k % 2), C.soil4);
      }
      break;
    }
    case "storm":
      for (let k = 0; k < 9; k++) {
        const p = (tt * (0.6 + (k % 3) * 0.2) + k * 0.37) % 1;
        const sx = x + w - Math.round(p * (w + 30)), sy = y + 6 + Math.round((k / 9) * (h * 0.8));
        rect(g, sx, sy, 10 + (k % 3) * 4, 1, k % 2 ? C.plum4 : C.plum3);
      }
      if (!calm && Math.floor(t * 4) % 23 === 0) { // a far lightning fork (a flash: skipped with Reduced Motion)
        let lx = x + Math.round(w * 0.3), ly = y;
        for (let s = 0; s < 7; s++) { rect(g, lx, ly, 1, 3, C.white); lx += s % 2 ? 1 : -1; ly += 3; }
      }
      break;
    case "smuggler": {
      const k = Math.floor(tt * 4) % 2;
      px(g, cx - 5, ry - 27 + k, C.fire4);
      px(g, cx + 8, ry - 27 + (1 - k), C.ice);
      break;
    }
  }
}

/** Test hook: drop cached layers (not used in play). */
export function clearSceneCache(): void {
  layers.clear();
  flippedFoe = {};
}
