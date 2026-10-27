// M3 (REQ-BFG-119): the small image toolkit the art scripts share, with no npm package: a PNG encoder and decoder over node:zlib,
// and the pixel operations the icon set needs (integer nearest-neighbour scaling, crop, pad, alpha-over, area-average resize,
// shape masks). An image is { w, h, data } with data an RGBA Uint8ClampedArray (w * h * 4).
import { deflateSync, inflateSync } from "node:zlib";

// ------------------------------------------------------------------ PNG

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};

/** Encodes an image as an 8-bit PNG: colour type 6 (RGBA) when `alpha`, else colour type 2 (RGB; every pixel must be opaque).
 *  Each row takes the filter (none, sub, up, average, paeth) with the smallest sum of absolute values; the output is deterministic. */
export function encodePng(img, { alpha = true } = {}) {
  const { w, h, data } = img;
  const bpp = alpha ? 4 : 3, stride = w * bpp;
  const px = Buffer.alloc(stride * h);
  for (let i = 0, o = 0; i < w * h; i++) {
    if (!alpha && data[i * 4 + 3] !== 255) throw new Error(`encodePng: pixel ${i} is not opaque but alpha is off`);
    px[o++] = data[i * 4]; px[o++] = data[i * 4 + 1]; px[o++] = data[i * 4 + 2];
    if (alpha) px[o++] = data[i * 4 + 3];
  }
  const raw = Buffer.alloc((stride + 1) * h);
  const cand = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride));
  for (let y = 0; y < h; y++) {
    const row = px.subarray(y * stride, (y + 1) * stride), up = y ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? row[x - bpp] : 0, b = up ? up[x] : 0, c = up && x >= bpp ? up[x - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      cand[0][x] = row[x];
      cand[1][x] = (row[x] - a) & 255;
      cand[2][x] = (row[x] - b) & 255;
      cand[3][x] = (row[x] - ((a + b) >> 1)) & 255;
      cand[4][x] = (row[x] - paeth) & 255;
    }
    let best = 0, bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      let s = 0;
      for (let x = 0; x < stride; x++) s += cand[f][x] < 128 ? cand[f][x] : 256 - cand[f][x];
      if (s < bestSum) { bestSum = s; best = f; }
    }
    raw[y * (stride + 1)] = best;
    cand[best].copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = alpha ? 6 : 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Decodes a non-interlaced 8-bit RGB or RGBA PNG (what encodePng and Chromium's screenshots write). */
export function decodePng(buf) {
  if (buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("decodePng: not a PNG");
  let pos = 8, w = 0, h = 0, depth = 0, ct = -1, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString("latin1", pos + 4, pos + 8), body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") { w = body.readUInt32BE(0); h = body.readUInt32BE(4); depth = body[8]; ct = body[9]; interlace = body[12]; }
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (depth !== 8 || (ct !== 2 && ct !== 6) || interlace) throw new Error(`decodePng: unsupported PNG (depth ${depth}, colour type ${ct}, interlace ${interlace})`);
  const bpp = ct === 6 ? 4 : 3, stride = w * bpp, raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = y && x >= bpp ? px[(y - 1) * stride + x - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      px[y * stride + x] = (v + pred) & 255;
    }
  }
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = px[i * bpp]; data[i * 4 + 1] = px[i * bpp + 1]; data[i * 4 + 2] = px[i * bpp + 2];
    data[i * 4 + 3] = bpp === 4 ? px[i * bpp + 3] : 255;
  }
  return { w, h, data, colorType: ct };
}

// ------------------------------------------------------------------ pixel operations

export const blank = (w, h, rgba = [0, 0, 0, 0]) => {
  const data = new Uint8ClampedArray(w * h * 4);
  if (rgba[0] || rgba[1] || rgba[2] || rgba[3]) for (let i = 0; i < w * h; i++) data.set(rgba, i * 4);
  return { w, h, data };
};
export const fromBase64 = (w, h, b64) => ({ w, h, data: new Uint8ClampedArray(Buffer.from(b64, "base64")) });
export const hexRgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

/** Whole-number nearest-neighbour scale: every source pixel becomes an s x s block. */
export function scaleNearest(img, s) {
  if (!Number.isInteger(s) || s < 1) throw new Error(`scaleNearest: ${s} is not a whole number`);
  const out = blank(img.w * s, img.h * s);
  for (let y = 0; y < out.h; y++) {
    const sy = (y / s) | 0;
    for (let x = 0; x < out.w; x++) {
      const si = (sy * img.w + ((x / s) | 0)) * 4, di = (y * out.w + x) * 4;
      out.data[di] = img.data[si]; out.data[di + 1] = img.data[si + 1]; out.data[di + 2] = img.data[si + 2]; out.data[di + 3] = img.data[si + 3];
    }
  }
  return out;
}

/** The w x h window at (x0, y0); outside the source it is transparent. */
export function crop(img, x0, y0, w, h) {
  const out = blank(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = x0 + x, sy = y0 + y;
      if (sx < 0 || sy < 0 || sx >= img.w || sy >= img.h) continue;
      out.data.set(img.data.subarray((sy * img.w + sx) * 4, (sy * img.w + sx) * 4 + 4), (y * w + x) * 4);
    }
  }
  return out;
}

/** `top` over `bottom` (straight alpha); sizes must match or `top` is placed at (dx, dy). */
export function over(bottom, top, dx = 0, dy = 0) {
  const out = { w: bottom.w, h: bottom.h, data: new Uint8ClampedArray(bottom.data) };
  for (let y = 0; y < top.h; y++) {
    const oy = y + dy;
    if (oy < 0 || oy >= out.h) continue;
    for (let x = 0; x < top.w; x++) {
      const ox = x + dx;
      if (ox < 0 || ox >= out.w) continue;
      const ti = (y * top.w + x) * 4, oi = (oy * out.w + ox) * 4;
      const ta = top.data[ti + 3] / 255, ba = out.data[oi + 3] / 255, a = ta + ba * (1 - ta);
      if (a <= 0) continue;
      for (let k = 0; k < 3; k++) out.data[oi + k] = Math.round((top.data[ti + k] * ta + out.data[oi + k] * ba * (1 - ta)) / a);
      out.data[oi + 3] = Math.round(a * 255);
    }
  }
  return out;
}

/** Area-average resize to w x h (every output pixel is the exact-coverage mean of the source it covers, premultiplied by alpha). */
export function boxResize(img, w, h) {
  const tmp = new Float64Array(w * img.h * 4);
  const sx = img.w / w, sy = img.h / h;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < w; x++) {
      const a0 = x * sx, a1 = (x + 1) * sx;
      let r = 0, g = 0, b = 0, a = 0;
      for (let i = Math.floor(a0); i < Math.ceil(a1); i++) {
        const wt = Math.min(a1, i + 1) - Math.max(a0, i), p = (y * img.w + i) * 4, al = img.data[p + 3] / 255;
        r += img.data[p] * al * wt; g += img.data[p + 1] * al * wt; b += img.data[p + 2] * al * wt; a += al * wt;
      }
      const o = (y * w + x) * 4;
      tmp[o] = r / sx; tmp[o + 1] = g / sx; tmp[o + 2] = b / sx; tmp[o + 3] = a / sx;
    }
  }
  const out = blank(w, h);
  for (let y = 0; y < h; y++) {
    const a0 = y * sy, a1 = (y + 1) * sy;
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let j = Math.floor(a0); j < Math.ceil(a1); j++) {
        const wt = Math.min(a1, j + 1) - Math.max(a0, j), p = (j * w + x) * 4;
        r += tmp[p] * wt; g += tmp[p + 1] * wt; b += tmp[p + 2] * wt; a += tmp[p + 3] * wt;
      }
      r /= sy; g /= sy; b /= sy; a /= sy;
      const o = (y * w + x) * 4;
      if (a > 0) { out.data[o] = Math.round(r / a); out.data[o + 1] = Math.round(g / a); out.data[o + 2] = Math.round(b / a); out.data[o + 3] = Math.round(a * 255); }
    }
  }
  return out;
}

// ------------------------------------------------------------------ shape masks (u, v in 0..1 across the visible square)

/** Rounded rectangle with a radius per corner [tl, tr, br, bl] (fractions of the side). */
const roundRect = (radii) => (u, v) => {
  const [tl, tr, br, bl] = radii;
  const corner = (cx, cy, r, sx, sy) => {
    const dx = (u - cx) * sx, dy = (v - cy) * sy;
    return dx > 0 && dy > 0 ? dx * dx + dy * dy <= r * r : true;
  };
  return corner(tl, tl, tl, -1, -1) && corner(1 - tr, tr, tr, 1, -1) && corner(1 - br, 1 - br, br, 1, 1) && corner(bl, 1 - bl, bl, -1, 1);
};
/** The four launcher shapes (Android's adaptive-icon masks vary by maker): circle, squircle, rounded square and teardrop. */
export const MASKS = {
  circle: (u, v) => (u - 0.5) ** 2 + (v - 0.5) ** 2 <= 0.25,
  squircle: (u, v) => Math.abs(2 * u - 1) ** 4 + Math.abs(2 * v - 1) ** 4 <= 1,
  rounded: roundRect([0.2, 0.2, 0.2, 0.2]),
  teardrop: roundRect([0.5, 0.5, 0.1, 0.5]),
  rounded10: roundRect([0.1, 0.1, 0.1, 0.1]), // the legacy icon's slightly rounded corners
};

/** Multiplies the alpha by a shape's coverage (4 x 4 samples per pixel, so the edge is anti-aliased). */
export function applyMask(img, inside) {
  const out = { w: img.w, h: img.h, data: new Uint8ClampedArray(img.data) };
  const n = 4;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      let hit = 0;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (inside((x + (i + 0.5) / n) / img.w, (y + (j + 0.5) / n) / img.h)) hit++;
      const o = (y * img.w + x) * 4 + 3;
      out.data[o] = Math.round((out.data[o] * hit) / (n * n));
    }
  }
  return out;
}
