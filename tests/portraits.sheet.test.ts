import { it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { C } from "../src/render/palette";
import { PORTRAIT_KEYS, portraitPixels } from "../src/render/portraits";
import { HEROES, type HeroId } from "../src/sim/content";
import { RIVALS, type RivalId } from "../src/sim/rivals";

// Portrait contact sheet (not an assertion suite). Run: BB_SHEET=1 npx vitest run tests/portraits.sheet.test.ts
// Writes portraits.png (every portrait at 6x, 5 per row, 6 px gutters, on the dark build-screen
// panel colour) and portraits.txt (the grid order) to $BB_SHEET_DIR, default ../output beside the repo.
const on = !!process.env.BB_SHEET;
const SCALE = 6, PER_ROW = 5, GUTTER = 6, SIZE = 24 * SCALE;
const PANEL = C.navy; // panel(g, r, "dark") fill in src/ui/ui.ts

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  out.set(data, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
/** 8-bit RGB PNG, filter 0 on every scanline. */
function encodePng(w: number, h: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", new Uint8Array(0))]);
}
const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

it.runIf(on)("portrait contact sheet", () => {
  const rows = Math.ceil(PORTRAIT_KEYS.length / PER_ROW);
  const w = GUTTER + PER_ROW * (SIZE + GUTTER), h = GUTTER + rows * (SIZE + GUTTER);
  const rgb = new Uint8Array(w * h * 3);
  const bg = rgbOf(PANEL);
  for (let i = 0; i < w * h; i++) rgb.set(bg, i * 3);
  const lines = [
    `BeltBattles captain portraits: ${PORTRAIT_KEYS.length} at ${SCALE}x (${SIZE}x${SIZE}), ${PER_ROW} per row, ${GUTTER} px gutters,`,
    `on the build-screen panel colour navy ${PANEL}. Grid order (row, column: key, name, faction, rank):`,
  ];
  PORTRAIT_KEYS.forEach((key, n) => {
    const col = n % PER_ROW, row = Math.floor(n / PER_ROW);
    const ox = GUTTER + col * (SIZE + GUTTER), oy = GUTTER + row * (SIZE + GUTTER);
    const { px } = portraitPixels(key);
    px.forEach((name, i) => {
      if (!name) return;
      const c = rgbOf(C[name]);
      const x0 = ox + (i % 24) * SCALE, y0 = oy + Math.floor(i / 24) * SCALE;
      for (let y = y0; y < y0 + SCALE; y++) for (let x = x0; x < x0 + SCALE; x++) rgb.set(c, (y * w + x) * 3);
    });
    const hero = key in HEROES;
    const name = hero ? `${HEROES[key as HeroId].name} (hero)` : RIVALS[key as RivalId].name;
    const faction = hero ? HEROES[key as HeroId].faction : RIVALS[key as RivalId].faction;
    const rank = hero ? "hero" : `${RIVALS[key as RivalId].rank}, act ${RIVALS[key as RivalId].tier}`;
    lines.push(`  r${row + 1} c${col + 1}: ${key.padEnd(10)} ${name.padEnd(16)} ${faction.padEnd(4)} ${rank}`);
  });
  const dir = process.env.BB_SHEET_DIR || resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "output");
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "portraits.png"), encodePng(w, h, rgb));
  writeFileSync(resolve(dir, "portraits.txt"), lines.join("\n") + "\n");
  // eslint-disable-next-line no-console
  console.log(`wrote ${resolve(dir, "portraits.png")} (${w}x${h})\n${lines.join("\n")}`);
});
