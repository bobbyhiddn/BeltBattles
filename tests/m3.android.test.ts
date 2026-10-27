// M3 (REQ-BFG-119) Goal 2: checks of the Android app's art and the store masters, by text and by bytes. No Android SDK, no Gradle and no
// emulator exist on the dev host (and none may be run), so nothing here builds the app: each check reads a file and says what the first
// real build and the stores will rely on. The art itself is drawn by scripts/m3 (the game's own pixel-art code); these tests pin what it wrote:
//  - the 15 launcher PNGs and only those, each a real PNG at the size its density needs;
//  - the adaptive icon: a solid palette colour behind a foreground whose subject sits in the centre 66 of 108 dp, all five sizes whole-number
//    scales (nearest neighbour, no blur) of one 54 x 54 pixel-art image;
//  - the legacy icons (Android 7.x), and the store masters (the App Store icon without an alpha channel, Play's 512 icon opaque, the splash);
//  - no template art is left, and every resource reference in android/ resolves, and every XML file under res/ is well-formed.
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

const ROOT = new URL("..", import.meta.url).pathname;
const RES = "android/app/src/main/res";
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

/** Every file under `rel` (relative paths), depth first, skipping build output and caches; [] where the folder is absent. */
function walk(rel: string): string[] {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  for (const name of readdirSync(abs).sort()) {
    if (name === "build" || name === ".gradle" || name === "node_modules") continue;
    const sub = `${rel}/${name}`;
    if (statSync(join(ROOT, sub)).isDirectory()) out.push(...walk(sub));
    else out.push(sub);
  }
  return out;
}

// ------------------------------------------------------------------ PNG

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (b: Uint8Array): number => {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

interface Png { w: number; h: number; depth: number; colorType: number; interlace: number; chunks: string[]; bytes: number }

/** Reads a PNG's structure and checks it is a whole file: the signature, IHDR first, every chunk's CRC, IDAT then IEND last, nothing after. */
function pngInfo(buf: Buffer, name: string): Png & { idat: Buffer } {
  expect(buf.subarray(0, 8).toString("hex"), `${name}: the PNG signature`).toBe("89504e470d0a1a0a");
  const chunks: string[] = [];
  const idat: Buffer[] = [];
  let pos = 8, w = 0, h = 0, depth = 0, colorType = -1, interlace = 0;
  while (pos < buf.length) {
    expect(pos + 12, `${name}: a chunk header fits`).toBeLessThanOrEqual(buf.length);
    const len = buf.readUInt32BE(pos), type = buf.toString("latin1", pos + 4, pos + 8);
    expect(pos + 12 + len, `${name}: chunk ${type} fits`).toBeLessThanOrEqual(buf.length);
    expect(crc32(buf.subarray(pos + 4, pos + 8 + len)), `${name}: the CRC of ${type}`).toBe(buf.readUInt32BE(pos + 8 + len));
    chunks.push(type);
    if (type === "IHDR") {
      w = buf.readUInt32BE(pos + 8); h = buf.readUInt32BE(pos + 12); depth = buf[pos + 16]; colorType = buf[pos + 17]; interlace = buf[pos + 20];
    } else if (type === "IDAT") idat.push(buf.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  expect(pos, `${name}: no bytes after the last chunk`).toBe(buf.length);
  expect(chunks[0], `${name}: IHDR first`).toBe("IHDR");
  expect(chunks[chunks.length - 1], `${name}: IEND last`).toBe("IEND");
  expect(chunks.includes("IDAT"), `${name}: has image data`).toBe(true);
  return { w, h, depth, colorType, interlace, chunks, bytes: buf.length, idat: Buffer.concat(idat) };
}

interface Img extends Png { rgba: Uint8Array }

/** The decoded image (8-bit RGB or RGBA, not interlaced: what scripts/m3 writes) as RGBA. */
function readPng(rel: string): Img {
  const buf = Buffer.from(readFileSync(join(ROOT, rel)));
  const info = pngInfo(buf, rel);
  expect(info.depth, `${rel}: 8 bits a channel`).toBe(8);
  expect([2, 6], `${rel}: RGB or RGBA`).toContain(info.colorType);
  expect(info.interlace, `${rel}: not interlaced`).toBe(0);
  const bpp = info.colorType === 6 ? 4 : 3, stride = info.w * bpp;
  const raw = inflateSync(info.idat);
  expect(raw.length, `${rel}: the image data is a whole image`).toBe((stride + 1) * info.h);
  const px = Buffer.alloc(stride * info.h);
  for (let y = 0; y < info.h; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = y && x >= bpp ? px[(y - 1) * stride + x - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      px[y * stride + x] = (v + (f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
    }
  }
  const rgba = new Uint8Array(info.w * info.h * 4);
  for (let i = 0; i < info.w * info.h; i++) {
    rgba[i * 4] = px[i * bpp]; rgba[i * 4 + 1] = px[i * bpp + 1]; rgba[i * 4 + 2] = px[i * bpp + 2];
    rgba[i * 4 + 3] = bpp === 4 ? px[i * bpp + 3] : 255;
  }
  return { ...info, rgba };
}
const at = (im: Img, x: number, y: number): number[] => Array.from(im.rgba.subarray((y * im.w + x) * 4, (y * im.w + x) * 4 + 4));
const hex = (c: number[]): string => `#${c.slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;

// ------------------------------------------------------------------ the set

const DENSITIES = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"] as const;
const LEGACY = [48, 72, 96, 144, 192]; // ic_launcher.png and ic_launcher_round.png: 48 dp at 1, 1.5, 2, 3 and 4 px a dp
const FOREGROUND = [108, 162, 216, 324, 432]; // ic_launcher_foreground.png: the 108 dp layer at the same five densities
const N = 54; // the art's pixels: the 108 dp layer at 2 dp a pixel (scripts/m3/mark.mjs), so the foreground scales are 2, 3, 4, 6 and 8
const INK = "#050B12";

const bg = read(`${RES}/values/ic_launcher_background.xml`).match(/<color name="ic_launcher_background">(#[0-9A-Fa-f]{6})<\/color>/)?.[1]?.toUpperCase() ?? "";
const hexRgb = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** The 26 PNGs `cap add android` 8.5.3 wrote into res/ (M1 kept them as written): [path under res/, width, height, SHA-256], read at e7b3469b1f7e. */
const TEMPLATE_PNGS: [string, number, number, string][] = [
  ["drawable-land-hdpi/splash.png", 800, 480, "08cc34ad7713fe7ed58bceaa37b2387b670c53cd60264b4bd6442db3098e75dc"],
  ["drawable-land-mdpi/splash.png", 480, 320, "5cf98b4451bd99b20df26f9e608a46946118be6b0ae90762f9ca1786a30c76ff"],
  ["drawable-land-xhdpi/splash.png", 1280, 720, "22f87e1e3bc89aa01a7dbc39c9a4db058cd0bf4ad3fe9f55712bf69eb997f4bf"],
  ["drawable-land-xxhdpi/splash.png", 1600, 960, "42aa26392546fcdee1b8d3ac6d4b41bfcceb41dc6a4f3a3c30c24a8a8f4db862"],
  ["drawable-land-xxxhdpi/splash.png", 1920, 1280, "60393ce8636fd263e4e1fea3fd4ab2de948c6295e898fda9b50ac4e5283be809"],
  ["drawable-port-hdpi/splash.png", 480, 800, "c5015f4ba3628392b538386c5e210f0b94f352a3160adab934fd0311972137ca"],
  ["drawable-port-mdpi/splash.png", 320, 480, "07fa579e1c83e04ba7f9cbcbfcf41b68e15fe3638f2c44a04e58b809103e6b69"],
  ["drawable-port-xhdpi/splash.png", 720, 1280, "b73049cb37fe76d6c11b87a796766bf6af0c85483b31eb6a921657b0d764a4b9"],
  ["drawable-port-xxhdpi/splash.png", 960, 1600, "0c7f1212f25b7b90e9a6e1d320013e4ff3d3e03e634cbb07b7b7981cac51627f"],
  ["drawable-port-xxxhdpi/splash.png", 1280, 1920, "3db071a03b2f8ffe0dfd4170fc59842d53cd15bba5e88af59401d58efabf7827"],
  ["drawable/splash.png", 480, 320, "5cf98b4451bd99b20df26f9e608a46946118be6b0ae90762f9ca1786a30c76ff"],
  ["mipmap-hdpi/ic_launcher.png", 72, 72, "72b71c3581ca3b5a23b1c168d69b9d855b3f184fa079902a01f088eb4f0607d5"],
  ["mipmap-hdpi/ic_launcher_foreground.png", 162, 162, "32baa10d2632a4417454a579f992bd640e0a3cec79321423559b2c9940de58a9"],
  ["mipmap-hdpi/ic_launcher_round.png", 72, 72, "bfcc1b0fa931b14bb241372c76ab4f04374b67d02363c98d9cb12edfdacdf5f3"],
  ["mipmap-mdpi/ic_launcher.png", 48, 48, "27ed3603010ebc278f64f8645741ab132ff517abb5308eb9df6c8e42a48956b2"],
  ["mipmap-mdpi/ic_launcher_foreground.png", 108, 108, "58e78a618778926b1f6d9472a6468de878de8530970934e94aab5ba4ba08cc00"],
  ["mipmap-mdpi/ic_launcher_round.png", 48, 48, "0166fc333074c373fbd0ce6b5defd71552166165ac778121ca9c9dff6b83f0fc"],
  ["mipmap-xhdpi/ic_launcher.png", 96, 96, "d35dbfff175b83c13ef59cf924abfc810f7b6a158595d7417c5498ea8c7c7ed1"],
  ["mipmap-xhdpi/ic_launcher_foreground.png", 216, 216, "6f88083b8166cc559102f7044688de7525287632ebe09ac45d001ac8bf4b3eae"],
  ["mipmap-xhdpi/ic_launcher_round.png", 96, 96, "40911a00922868686854a4804b93fd6e56b503664696de03f450bff690affb6d"],
  ["mipmap-xxhdpi/ic_launcher.png", 144, 144, "ed346eb1e3f0280f15709393705899b3ff55c20b88f4e0308006b3c33cf5fe14"],
  ["mipmap-xxhdpi/ic_launcher_foreground.png", 324, 324, "4a82bc1e9923576275869998925ce0ae021a79aa18b24a0dd87ad6b61ca85053"],
  ["mipmap-xxhdpi/ic_launcher_round.png", 144, 144, "1ee4cd9ff371dcb2e3938097e434f6fb8731688ed7165e61fc63693ad5b2f455"],
  ["mipmap-xxxhdpi/ic_launcher.png", 192, 192, "87cb2f2ffe992652bb4fa768c73719a37b5852ab17fbf8e170e888f7a42b0761"],
  ["mipmap-xxxhdpi/ic_launcher_foreground.png", 432, 432, "bd24fd383253bf8d43f0a81f11c071d76d1d555114376dd647cd9fb38fa0a9da"],
  ["mipmap-xxxhdpi/ic_launcher_round.png", 192, 192, "ab93096331e7cd8ec379f73f1e9adcaaa9ee1115c9f4ff10411a811fb9700174"],
];

describe("M3 Goal 2: the 15 launcher PNGs", () => {
  const files = DENSITIES.flatMap((d, i) => [
    { path: `${RES}/mipmap-${d}/ic_launcher.png`, size: LEGACY[i] },
    { path: `${RES}/mipmap-${d}/ic_launcher_round.png`, size: LEGACY[i] },
    { path: `${RES}/mipmap-${d}/ic_launcher_foreground.png`, size: FOREGROUND[i] },
  ]);

  it("res/ holds these 15 PNGs and no other image, each a real RGBA PNG at the size its density needs", () => {
    const images = walk(RES).filter((f) => /\.(png|jpe?g|webp|gif|svg)$/i.test(f));
    expect(images.sort()).toEqual(files.map((f) => f.path).sort());
    for (const f of files) {
      const im = readPng(f.path);
      expect([im.w, im.h], f.path).toEqual([f.size, f.size]);
      expect(im.colorType, `${f.path}: RGBA`).toBe(6);
    }
  });

  it("ic_launcher.png is the full mark with slightly rounded corners and ic_launcher_round.png is it clipped to a circle: transparent outside, opaque inside", () => {
    for (const [i, d] of DENSITIES.entries()) {
      const T = LEGACY[i];
      const sq = readPng(`${RES}/mipmap-${d}/ic_launcher.png`), rd = readPng(`${RES}/mipmap-${d}/ic_launcher_round.png`);
      expect(at(sq, 0, 0)[3], `${d}: the square's corner pixel is cut`).toBe(0);
      expect(at(sq, T - 1, T - 1)[3]).toBe(0);
      expect(at(sq, Math.floor(T / 2), 1)[3], `${d}: the square's edge middle is the mark`).toBe(255);
      expect(at(sq, 1, Math.floor(T / 2))[3]).toBe(255);
      expect(hex(at(sq, Math.floor(T / 2), 1)), `${d}: the edge of the mark is the field colour`).toBe(bg);
      for (const [x, y] of [[0, 0], [T - 1, 0], [0, T - 1], [T - 1, T - 1], [2, 2]]) expect(at(rd, x, y)[3], `${d}: the circle's corner ${x},${y}`).toBe(0);
      expect(at(rd, Math.floor(T / 2), Math.floor(T / 2))[3]).toBe(255);
      // how much of the square is cut at the corners: a little for the square (under 4%), a lot for the circle (21.5% of the area, less the
      // anti-aliased edge pixels, which are partly opaque: 18.6% of a 48 px icon)
      const clear = (im: Img): number => { let n = 0; for (let k = 3; k < im.rgba.length; k += 4) if (im.rgba[k] === 0) n++; return n / (T * T); };
      expect(clear(sq), `${d}: the square is only slightly rounded`).toBeLessThan(0.04);
      expect(clear(rd), `${d}: the round one is a circle`).toBeGreaterThan(0.15);
      expect(clear(rd)).toBeLessThan(0.24);
    }
  });
});

describe("M3 Goal 2: the adaptive icon", () => {
  it("the background is one solid colour from palette.ts, not white; both adaptive icons put it behind the foreground", () => {
    expect(bg).toMatch(/^#[0-9A-F]{6}$/);
    expect(bg).not.toBe("#FFFFFF");
    expect(read("src/render/palette.ts").toUpperCase(), `${bg} is a palette.ts colour`).toContain(`"${bg}"`);
    for (const f of ["ic_launcher", "ic_launcher_round"]) {
      const xml = read(`${RES}/mipmap-anydpi-v26/${f}.xml`);
      expect(xml).toContain('<background android:drawable="@color/ic_launcher_background"/>');
      expect(xml).toContain('<foreground android:drawable="@mipmap/ic_launcher_foreground"/>');
    }
    expect(read(`${RES}/values/ic_launcher_background.xml`).match(/<color /g)).toHaveLength(1);
  });

  it("each foreground is transparent outside its subject, and the subject lies inside the centre 66 of 108 dp (the safe circle's square)", () => {
    for (const [i, d] of DENSITIES.entries()) {
      const T = FOREGROUND[i];
      const im = readPng(`${RES}/mipmap-${d}/ic_launcher_foreground.png`);
      let x0 = T, y0 = T, x1 = -1, y1 = -1, partial = 0, clear = 0;
      for (let y = 0; y < T; y++) {
        for (let x = 0; x < T; x++) {
          const a = im.rgba[(y * T + x) * 4 + 3];
          if (a === 0) { clear++; continue; }
          if (a !== 255) partial++;
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
      }
      expect(at(im, 0, 0)[3], `${d}: the corner is clear`).toBe(0);
      expect(clear, `${d}: most of the layer is clear`).toBeGreaterThan(T * T * 0.4);
      expect(partial, `${d}: pixel art has no half-transparent pixel`).toBe(0);
      const lo = (T * (108 - 66)) / 2 / 108;
      expect(x0, `${d}: left`).toBeGreaterThanOrEqual(lo);
      expect(y0, `${d}: top`).toBeGreaterThanOrEqual(lo);
      expect(x1 + 1, `${d}: right`).toBeLessThanOrEqual(T - lo);
      expect(y1 + 1, `${d}: bottom`).toBeLessThanOrEqual(T - lo);
    }
  });

  it("the five foreground sizes are whole-number scales (nearest neighbour, no blur) of one 54 x 54 pixel-art image", () => {
    const big = readPng(`${RES}/mipmap-xxxhdpi/ic_launcher_foreground.png`); // 432 = 54 x 8
    const art: number[][] = [];
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const c = at(big, i * 8, j * 8);
        art.push(c);
        // every one of the 64 device pixels of this art pixel is the same
        for (const [dx, dy] of [[7, 7], [0, 7], [7, 0], [3, 5]]) expect(at(big, i * 8 + dx, j * 8 + dy), `art pixel ${i},${j}`).toEqual(c);
      }
    }
    for (const [i, d] of DENSITIES.entries()) {
      const T = FOREGROUND[i], s = T / N;
      expect(Number.isInteger(s), `${d}: ${T} is a whole multiple of ${N}`).toBe(true);
      const im = readPng(`${RES}/mipmap-${d}/ic_launcher_foreground.png`);
      for (let y = 0; y < T; y++) {
        for (let x = 0; x < T; x++) {
          const want = art[Math.floor(y / s) * N + Math.floor(x / s)], got = at(im, x, y);
          if (got[3] !== want[3] || (want[3] && (got[0] !== want[0] || got[1] !== want[1] || got[2] !== want[2]))) throw new Error(`${d}: pixel ${x},${y} is not the art pixel ${Math.floor(x / s)},${Math.floor(y / s)} scaled by ${s}`);
        }
      }
    }
  });
});

describe("M3 Goal 2: the store masters (store/)", () => {
  const field = hexRgb(bg);
  /** The foreground art (54 x 54), read from the 432 px file. */
  const art = (): number[][] => {
    const big = readPng(`${RES}/mipmap-xxxhdpi/ic_launcher_foreground.png`);
    const out: number[][] = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) out.push(at(big, i * 8, j * 8));
    return out;
  };
  /** The art pixel's colour on `base` (the art where opaque, else `base`). */
  const on = (a: number[], base: number[]): number[] => (a[3] === 255 ? a.slice(0, 3) : base.slice(0, 3));

  it("icon-1024.png is 1024 x 1024 RGB with no alpha channel (the App Store icon, M2's AppIcon): the art at 19 px a pixel on the adaptive background colour, cropped evenly", () => {
    const rel = "store/icon-1024.png";
    const im = readPng(rel);
    expect([im.w, im.h, im.colorType]).toEqual([1024, 1024, 2]);
    expect(readFileSync(join(ROOT, rel)).length).toBeLessThan(1024 * 1024);
    const a = art(), S = 19, off = (N * S - 1024) / 2; // 1026 px of art, one px cropped on each side
    for (let y = 0; y < 1024; y++) {
      for (let x = 0; x < 1024; x++) {
        const want = on(a[Math.floor((y + off) / S) * N + Math.floor((x + off) / S)], field), got = im.rgba.subarray((y * 1024 + x) * 4, (y * 1024 + x) * 4 + 3);
        if (got[0] !== want[0] || got[1] !== want[1] || got[2] !== want[2]) throw new Error(`icon-1024 pixel ${x},${y} is ${hex(Array.from(got))}, the art says ${hex(want)}`);
      }
    }
  });

  it("play-icon-512.png is 512 x 512, 32-bit RGBA (Google Play's hi-res icon) and fully opaque: the art at 9 px a pixel on the background colour", () => {
    const rel = "store/play-icon-512.png";
    const im = readPng(rel);
    expect([im.w, im.h, im.colorType]).toEqual([512, 512, 6]);
    expect(readFileSync(join(ROOT, rel)).length).toBeLessThan(1024 * 1024); // Play: at most 1,024 KB
    const a = art(), S = 9, pad = (512 - N * S) / 2;
    let seeThrough = 0;
    for (let y = 0; y < 512; y++) {
      for (let x = 0; x < 512; x++) {
        const got = im.rgba.subarray((y * 512 + x) * 4, (y * 512 + x) * 4 + 4);
        if (got[3] !== 255) seeThrough++;
        const inside = x >= pad && y >= pad && x < pad + N * S && y < pad + N * S;
        const want = inside ? on(a[Math.floor((y - pad) / S) * N + Math.floor((x - pad) / S)], field) : field;
        if (got[0] !== want[0] || got[1] !== want[1] || got[2] !== want[2]) throw new Error(`play-icon-512 pixel ${x},${y} is ${hex(Array.from(got))}, the art says ${hex(want)}`);
      }
    }
    expect(seeThrough, "pixels that are not fully opaque").toBe(0);
  });

  it("splash-2732.png is 2732 x 2732 RGB: the mark centred on #050B12, at most a third of the width (iOS scales a launch image to fill the phone and crops its sides)", () => {
    const rel = "store/splash-2732.png";
    const im = readPng(rel);
    expect([im.w, im.h, im.colorType]).toEqual([2732, 2732, 2]);
    expect(readFileSync(join(ROOT, rel)).length).toBeLessThan(1024 * 1024);
    const ink = hexRgb(INK);
    let x0 = 2732, x1 = -1, y0 = 2732, y1 = -1;
    for (let y = 0; y < 2732; y++) {
      for (let x = 0; x < 2732; x++) {
        const o = (y * 2732 + x) * 4;
        if (im.rgba[o] === ink[0] && im.rgba[o + 1] === ink[1] && im.rgba[o + 2] === ink[2]) continue;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
    expect(x1 - x0 + 1, "the mark's width").toBeLessThanOrEqual(Math.floor(2732 / 3));
    expect(y1 - y0 + 1, "the mark's height").toBeLessThanOrEqual(Math.floor(2732 / 3));
    expect(Math.abs(x0 + x1 + 1 - 2732), "centred across").toBeLessThanOrEqual(2);
    expect(Math.abs(y0 + y1 + 1 - 2732), "centred down").toBeLessThanOrEqual(2);
    expect(hex(at(im, 0, 0))).toBe(INK);
    expect(hex(at(im, 2731, 2731))).toBe(INK);
    // it is the foreground art at 28 px a pixel, on #050B12
    const a = art(), S = 28, pad = (2732 - N * S) / 2;
    for (let y = pad; y < pad + N * S; y += 7) {
      for (let x = pad; x < pad + N * S; x += 7) {
        const want = on(a[Math.floor((y - pad) / S) * N + Math.floor((x - pad) / S)], ink), got = at(im, x, y);
        if (got[0] !== want[0] || got[1] !== want[1] || got[2] !== want[2]) throw new Error(`splash-2732 pixel ${x},${y} is ${hex(got)}, the art says ${hex(want)}`);
      }
    }
  });
});

describe("M3 Goal 2: no template art is left", () => {
  it("there is no splash image and neither of the template's vectors, and the launch theme names no picture", () => {
    const all = walk("android");
    expect(all.filter((f) => /splash\.(png|jpe?g|webp|xml)$/i.test(f))).toEqual([]);
    expect(existsSync(join(ROOT, `${RES}/drawable/ic_launcher_background.xml`))).toBe(false); // the template's green grid
    expect(existsSync(join(ROOT, `${RES}/drawable-v24/ic_launcher_foreground.xml`))).toBe(false); // the template's robot
    expect(walk(RES).filter((f) => /\/drawable[^/]*\//.test(f))).toEqual([]); // no drawable folder is left at all
    expect(read(`${RES}/values/styles.xml`)).not.toMatch(/@drawable\//);
  });

  it("none of the 26 template PNGs (by SHA-256, read at e7b3469b1f7e) is any file under android/ or store/, whatever its name or type", () => {
    expect(TEMPLATE_PNGS).toHaveLength(26);
    expect(new Set(TEMPLATE_PNGS.map((t) => t[3])).size, "the 26 sums include splash.png's repeats (drawable/ and land-mdpi hold the same image)").toBeGreaterThanOrEqual(25);
    const sums = new Set(TEMPLATE_PNGS.map((t) => t[3]));
    const files = [...walk("android"), ...walk("store")];
    expect(files.length).toBeGreaterThan(40);
    for (const f of files) {
      const sum = createHash("sha256").update(readFileSync(join(ROOT, f))).digest("hex");
      expect(sums.has(sum), `${f} is a template image`).toBe(false);
    }
  });
});

// ------------------------------------------------------------------ XML and references

/** A well-formedness check for the XML in res/ (the node test environment has no DOM parser): tags nest and close, attribute values are
 *  quoted, comments, CDATA and the declaration end, text holds only whole entities, one root. Throws with the line. */
function checkXml(text: string, name: string): void {
  let i = 0, line = 1, roots = 0;
  const stack: string[] = [];
  const fail = (msg: string): never => { throw new Error(`${name}:${line}: ${msg}`); };
  const skipTo = (end: string, what: string): void => {
    const j = text.indexOf(end, i);
    if (j < 0) fail(`${what} is never closed`);
    for (const ch of text.slice(i, j + end.length)) if (ch === "\n") line++;
    i = j + end.length;
  };
  while (i < text.length) {
    if (text[i] !== "<") {
      const j = text.indexOf("<", i);
      const seg = text.slice(i, j < 0 ? text.length : j);
      if (!stack.length && seg.trim() !== "") fail("text outside the root element");
      for (const m of seg.matchAll(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g)) fail(`a bare & at ${m.index}`);
      for (const ch of seg) if (ch === "\n") line++;
      i = j < 0 ? text.length : j;
      continue;
    }
    if (text.startsWith("<?", i)) skipTo("?>", "a declaration");
    else if (text.startsWith("<!--", i)) skipTo("-->", "a comment");
    else if (text.startsWith("<![CDATA[", i)) skipTo("]]>", "a CDATA section");
    else if (text.startsWith("<!", i)) skipTo(">", "a declaration");
    else if (text.startsWith("</", i)) {
      const m = /^<\/([A-Za-z_][\w:.-]*)\s*>/.exec(text.slice(i, i + 200));
      if (!m) fail("a bad closing tag");
      const open = stack.pop();
      if (open !== m![1]) fail(`</${m![1]}> closes <${open}>`);
      i += m![0].length;
    } else {
      const m = /^<([A-Za-z_][\w:.-]*)/.exec(text.slice(i, i + 200));
      if (!m) fail("a bad opening tag");
      i += m![0].length;
      for (;;) {
        const ws = /^\s*/.exec(text.slice(i, i + 50))![0];
        for (const ch of ws) if (ch === "\n") line++;
        i += ws.length;
        if (text.startsWith("/>", i)) { i += 2; if (!stack.length) roots++; break; }
        if (text[i] === ">") { i++; if (!stack.length) roots++; stack.push(m![1]); break; }
        const a = /^([A-Za-z_][\w:.-]*)\s*=\s*("[^"<]*"|'[^'<]*')/.exec(text.slice(i, i + 4000));
        if (!a) fail(`a bad attribute in <${m![1]}>`);
        for (const ch of a![0]) if (ch === "\n") line++;
        i += a![0].length;
      }
    }
  }
  if (stack.length) fail(`<${stack[stack.length - 1]}> is never closed`);
  if (roots !== 1) fail(`${roots} root elements`);
}

const TYPES = ["mipmap", "drawable", "color"] as const;
type ResType = (typeof TYPES)[number];

/** Every `@type/name` in XML text (comments dropped) and `R.type.name` in Java text (comments dropped): [type, name, where]. */
function references(file: string, text: string): [ResType, string, string][] {
  const out: [ResType, string, string][] = [];
  if (file.endsWith(".xml")) {
    for (const m of text.replace(/<!--[\s\S]*?-->/g, "").matchAll(/@(mipmap|drawable|color)\/([A-Za-z0-9_]+)/g)) out.push([m[1] as ResType, m[2], file]);
  } else if (file.endsWith(".java")) {
    // `R.` not preceded by a dot or a word character: android.R.drawable.x is the framework's, not the app's
    for (const m of text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").matchAll(/(?<![\w.])R\.(mipmap|drawable|color)\.([A-Za-z0-9_]+)/g)) out.push([m[1] as ResType, m[2], file]);
  } else if (file.endsWith(".gradle")) {
    for (const m of text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").matchAll(/@(mipmap|drawable|color)\/([A-Za-z0-9_]+)|(?<![\w.])R\.(mipmap|drawable|color)\.([A-Za-z0-9_]+)/g)) out.push([(m[1] ?? m[3]) as ResType, m[2] ?? m[4], file]);
  }
  return out;
}

/** The names the app's res/ defines, by type: mipmap and drawable folders' files, and the <color> and <drawable> values in res/values*. */
function defined(res: string): Record<ResType, Set<string>> {
  const d: Record<ResType, Set<string>> = { mipmap: new Set(), drawable: new Set(), color: new Set() };
  for (const f of walk(res)) {
    const m = /\/(mipmap|drawable)[^/]*\/([A-Za-z0-9_]+)\.[a-z]+$/.exec(f);
    if (m) d[m[1] as "mipmap" | "drawable"].add(m[2]);
    if (/\/values[^/]*\/[^/]+\.xml$/.test(f)) {
      const xml = read(f).replace(/<!--[\s\S]*?-->/g, "");
      for (const c of xml.matchAll(/<color\s+(?:[^>]*\s)?name="([A-Za-z0-9_]+)"/g)) { d.color.add(c[1]); d.drawable.add(c[1]); } // a colour also serves as a drawable
      for (const c of xml.matchAll(/<drawable\s+(?:[^>]*\s)?name="([A-Za-z0-9_]+)"/g)) d.drawable.add(c[1]);
    }
  }
  return d;
}

describe("M3 Goal 2: every XML file under res/ and every resource reference in android/", () => {
  const xmls = [...walk(RES).filter((f) => f.endsWith(".xml")), "android/app/src/main/AndroidManifest.xml"];

  it("every XML file under res/, and the manifest, is well-formed", () => {
    expect(xmls.length).toBeGreaterThan(8);
    for (const f of xmls) checkXml(read(f), f);
  });

  it("the well-formedness check rejects what it should (a mismatched tag, an unquoted attribute, a bare &, two roots, a comment left open)", () => {
    expect(() => checkXml("<a><b></a></b>", "x")).toThrow(/closes/);
    expect(() => checkXml("<a b=c/>", "x")).toThrow(/bad attribute/);
    expect(() => checkXml("<a>fish & chips</a>", "x")).toThrow(/bare &/);
    expect(() => checkXml("<a/><b/>", "x")).toThrow(/2 root/);
    expect(() => checkXml("<a><!-- </a>", "x")).toThrow(/never closed/);
    expect(() => checkXml('<?xml version="1.0"?><a b="1"><c d=\'2\'/>&amp;&#x41;</a>', "x")).not.toThrow();
  });

  it("every @mipmap/, @drawable/ and @color/ reference in android/ (XML, Java, Gradle) resolves to a file or a value, in the app's res/ or Capacitor's own", () => {
    const own = defined(RES);
    const lib = defined("node_modules/@capacitor/android/capacitor/src/main/res"); // colorPrimary, colorPrimaryDark and colorAccent live here
    const refs = walk("android")
      .filter((f) => /\.(xml|java|gradle)$/.test(f) && !f.includes("/assets/public/"))
      .flatMap((f) => references(f, read(f)));
    expect(refs.length, "the adaptive icons, the manifest and the themes name resources").toBeGreaterThan(8);
    const missing = refs.filter(([type, name]) => !own[type].has(name) && !lib[type].has(name)).map(([type, name, file]) => `@${type}/${name} in ${file}`);
    expect(missing).toEqual([]);
    // what the app's own icons need is the app's own, not the library's
    for (const [type, name] of [["mipmap", "ic_launcher"], ["mipmap", "ic_launcher_round"], ["mipmap", "ic_launcher_foreground"], ["color", "ic_launcher_background"], ["color", "bb_background"]] as const) {
      expect(own[type].has(name), `${type}/${name} is the app's own`).toBe(true);
    }
  });

  it("the reference check finds a dangling reference when there is one", () => {
    const own = defined(RES);
    const found = references("x.xml", '<adaptive-icon><!-- @drawable/in_a_comment --><foreground android:drawable="@drawable/ic_launcher_foreground"/><background android:drawable="@color/ic_launcher_background"/></adaptive-icon>');
    expect(found.map((r) => `${r[0]}/${r[1]}`)).toEqual(["drawable/ic_launcher_foreground", "color/ic_launcher_background"]);
    expect(own.drawable.has("ic_launcher_foreground"), "the template's drawable foreground is gone, so this reference would dangle").toBe(false);
    expect(references("A.java", "int x = R.mipmap.ic_launcher; // R.drawable.splash").map((r) => `${r[0]}/${r[1]}`)).toEqual(["mipmap/ic_launcher"]);
  });
});
