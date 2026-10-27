// M3 (REQ-BFG-119): from a mark's 54 x 54 pixel-art subject (drawn by the game's own code, page/motifs.ts) to every file of the
// icon set. All scaling of the art is by whole numbers with nearest-neighbour sampling; a size that is not a whole multiple of 54
// takes the nearest whole scale and is cropped (or padded with the field colour) evenly on both sides.
import { MASKS, applyMask, blank, boxResize, crop, hexRgb, over, scaleNearest } from "./img.mjs";

export const N = 54; // the logical canvas: the adaptive icon's 108 dp layer at 2 dp a pixel
export const FG_SIZES = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 }; // N x 2, 3, 4, 6, 8
export const LEGACY_SIZES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

export const solid = (w, h, hex) => blank(w, h, [...hexRgb(hex), 255]);

/** Where the subject's pixels lie on the 54 grid: its bounding box and the farthest pixel corner from the centre (the safe circle's
 *  radius is 16.5 pixels: 66 of 108 dp). `centre61` is the rule: the box lies inside the centre 32 x 32 (59.3% of the square). */
export function subjectStats(subject) {
  let x0 = subject.w, y0 = subject.h, x1 = -1, y1 = -1, maxR = 0, opaque = 0, partial = 0;
  for (let y = 0; y < subject.h; y++) {
    for (let x = 0; x < subject.w; x++) {
      const a = subject.data[(y * subject.w + x) * 4 + 3];
      if (!a) continue;
      opaque++;
      if (a !== 255) partial++;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) maxR = Math.max(maxR, Math.hypot(x + dx - N / 2, y + dy - N / 2));
    }
  }
  const lo = (N - 32) / 2;
  return { bbox: [x0, y0, x1, y1], width: x1 - x0 + 1, height: y1 - y0 + 1, maxR: Math.round(maxR * 100) / 100, opaque, partial, centre61: x0 >= lo && y0 >= lo && x1 < N - lo && y1 < N - lo };
}

/** The subject layer at T x T: transparent outside the subject. Whole-number scale round(T / 54), centred. */
export function subjectLayer(subject, T) {
  const s = Math.max(1, Math.round(T / N));
  const big = scaleNearest(subject, s);
  return crop(big, (big.w - T) / 2, (big.h - T) / 2, T, T);
}

/** The full-bleed, fully opaque master at T x T: the field colour with the subject on it. */
export function master(subject, field, T) {
  return over(solid(T, T, field), subjectLayer(subject, T));
}

/** A launcher icon for a legacy density: the full mark at T x T, from a 432 px render by area average. */
export function legacyBase(subject, field, T) {
  return boxResize(master(subject, field, 432), T, T);
}

/** ic_launcher.png: the full mark with slightly rounded corners, transparent outside them. */
export const legacyIcon = (subject, field, T) => applyMask(legacyBase(subject, field, T), MASKS.rounded10);
/** ic_launcher_round.png: the full mark clipped to a circle, transparent outside. */
export const legacyRound = (subject, field, T) => applyMask(legacyBase(subject, field, T), MASKS.circle);

/** What a launcher shows of an adaptive icon at `V` px: the layer at 1.5 V, its centre 72/108 under a mask. */
export function launcherIcon(subject, field, V, maskName) {
  const L = Math.round(V * 1.5);
  const s = Math.max(2, Math.ceil(L / N)); // the layer is drawn at a whole-number scale of the 54 grid, then area-averaged to L (as a launcher scales it)
  const layer = boxResize(master(subject, field, N * s), L, L);
  const vis = crop(layer, (L - V) / 2, (L - V) / 2, V, V);
  return applyMask(vis, MASKS[maskName]);
}

// ------------------------------------------------------------------ the contact sheet

/** A procedural wallpaper: a vertical gradient with soft diagonal bands (no outside art). */
export function wallpaper(w, h, kind) {
  const img = blank(w, h);
  const [t, b] = kind === "light" ? [[238, 242, 247], [172, 187, 203]] : [[12, 18, 28], [42, 54, 70]];
  const amp = kind === "light" ? 9 : 7;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y / (h - 1), band = Math.sin((x + y) / 31) * amp + Math.sin((x - 2 * y) / 57) * amp * 0.6;
      const o = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) img.data[o + c] = Math.max(0, Math.min(255, Math.round(t[c] + (b[c] - t[c]) * k + band)));
      img.data[o + 3] = 255;
    }
  }
  return img;
}

/** The sheet: for each wallpaper (light, dark) the icon at 1024, 512, 192, 96 and 48 px (the first two shown smaller) under four masks. */
export function contactSheet(subject, field) {
  const sizes = [[1024, 256], [512, 192], [192, 192], [96, 96], [48, 48]]; // [icon px, drawn px]
  const masks = ["circle", "squircle", "rounded", "teardrop"];
  const pad = 12, rowH = 256 + pad;
  const panelW = pad + sizes.reduce((s, [, d]) => s + d + pad, 0), panelH = pad + masks.length * rowH;
  let out = blank(panelW * 2, panelH);
  ["light", "dark"].forEach((kind, p) => {
    let sheet = wallpaper(panelW, panelH, kind);
    masks.forEach((m, r) => {
      let x = pad;
      for (const [v, d] of sizes) {
        let icon = launcherIcon(subject, field, v, m);
        if (d !== v) icon = boxResize(icon, d, d);
        sheet = over(sheet, icon, x, pad + r * rowH + Math.round((256 - d) / 2));
        x += d + pad;
      }
    });
    out = over(out, sheet, p * panelW, 0);
  });
  return out;
}

/** The small sizes only (192, 96, 48 px), magnified 2x by whole numbers, for looking at the pixels. */
export function smallSheet(subject, field) {
  const masks = ["circle", "squircle", "rounded", "teardrop"], rows = [[192, 1], [96, 2], [48, 4]], pad = 8, cell = 192;
  const w = pad + masks.length * (cell + pad), h = pad + rows.length * (cell + pad);
  let out = blank(w * 2, h);
  ["light", "dark"].forEach((kind, p) => {
    let sheet = wallpaper(w, h, kind);
    masks.forEach((m, c) => {
      rows.forEach(([v, k], r) => {
        sheet = over(sheet, scaleNearest(launcherIcon(subject, field, v, m), k), pad + c * (cell + pad), pad + r * (cell + pad));
      });
    });
    out = over(out, sheet, p * w, 0);
  });
  return out;
}
