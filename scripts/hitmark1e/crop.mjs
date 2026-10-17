// HITMARK-1E (REQ-BFG-100, C7; BRIEF-HITMARK1E step 6) picture tool, not shipped: cuts a box out of a PNG still and enlarges it by a
// whole number, nearest neighbour (every device px becomes scale x scale px, so the pixel art stays hard-edged). Reads 8-bit RGB or
// RGBA PNGs without interlace (what Playwright writes); writes an 8-bit RGB PNG. Node's zlib only; no package.
// Usage: node scripts/hitmark1e/crop.mjs <in.png> <out.png> <x> <y> <w> <h> <scale>
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";

const [IN, OUT, X, Y, W, H, S] = process.argv.slice(2);
if (!IN || !OUT || [X, Y, W, H, S].some((v) => v === undefined || Number.isNaN(Number(v)))) {
  console.error("usage: node scripts/hitmark1e/crop.mjs <in.png> <out.png> <x> <y> <w> <h> <scale>");
  process.exit(2);
}

function decode(buf) {
  let p = 8, w = 0, h = 0, depth = 0, colour = 0, interlace = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString("ascii", p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; colour = data[9]; interlace = data[12]; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  if (depth !== 8 || (colour !== 2 && colour !== 6) || interlace !== 0) throw new Error(`unsupported PNG: depth ${depth}, colour type ${colour}, interlace ${interlace}`);
  const bpp = colour === 6 ? 4 : 3, stride = w * bpp, raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = out.subarray(y * stride, (y + 1) * stride), prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev ? prev[x] : 0, c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = row[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[x] = v & 255;
    }
  }
  return { w, h, bpp, px: out };
}

const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t.push(c >>> 0); } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

const img = decode(readFileSync(IN));
const x0 = Math.max(0, Math.round(Number(X))), y0 = Math.max(0, Math.round(Number(Y)));
const w = Math.min(img.w - x0, Math.round(Number(W))), h = Math.min(img.h - y0, Math.round(Number(H))), s = Math.max(1, Math.round(Number(S)));
const ow = w * s, oh = h * s, rowLen = ow * 3 + 1, raw = Buffer.alloc(rowLen * oh);
for (let j = 0; j < oh; j++) {
  raw[j * rowLen] = 0;
  const sy = y0 + Math.floor(j / s);
  for (let i = 0; i < ow; i++) {
    const sx = x0 + Math.floor(i / s), k = (sy * img.w + sx) * img.bpp, o = j * rowLen + 1 + i * 3;
    raw[o] = img.px[k]; raw[o + 1] = img.px[k + 1]; raw[o + 2] = img.px[k + 2];
  }
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(ow, 0); ihdr.writeUInt32BE(oh, 4); ihdr[8] = 8; ihdr[9] = 2;
writeFileSync(OUT, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
console.log(`${OUT}: ${ow}x${oh} px (box ${w}x${h} at ${x0},${y0} of ${img.w}x${img.h}, x${s})`);
