// M3 (REQ-BFG-119) Goal 3: checks of the store kit's committed parts: the feature graphic (Google Play's, 1024 x 500, 24-bit PNG with no
// alpha channel, the title's logo over a battle frame, the key content clear of the edges) and the scripts under scripts/m3 (they add no npm
// package, never name production, and let nothing but the served game build reach the page). The screenshots are NOT committed: they go to the
// kit folder (WS/output-m3/kit), made by `node scripts/m3/kit.mjs`; their sizes are checked when they are made (scripts/m3/storeshots.mjs).
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

// ------------------------------------------------------------------ the feature graphic

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

/** An 8-bit RGB or RGBA PNG decoded to RGBA, after the structure checks (signature, every chunk's CRC, IHDR first, IEND last, nothing after). */
function readPng(rel: string): { w: number; h: number; colorType: number; bytes: number; rgba: Uint8Array } {
  const buf = Buffer.from(readFileSync(join(ROOT, rel)));
  expect(buf.subarray(0, 8).toString("hex"), `${rel}: the PNG signature`).toBe("89504e470d0a1a0a");
  const chunks: string[] = [], idat: Buffer[] = [];
  let pos = 8, w = 0, h = 0, depth = 0, colorType = -1, interlace = 0;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString("latin1", pos + 4, pos + 8);
    expect(crc32(buf.subarray(pos + 4, pos + 8 + len)), `${rel}: the CRC of ${type}`).toBe(buf.readUInt32BE(pos + 8 + len));
    chunks.push(type);
    if (type === "IHDR") { w = buf.readUInt32BE(pos + 8); h = buf.readUInt32BE(pos + 12); depth = buf[pos + 16]; colorType = buf[pos + 17]; interlace = buf[pos + 20]; }
    if (type === "IDAT") idat.push(buf.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  expect(pos, `${rel}: no bytes after the last chunk`).toBe(buf.length);
  expect([chunks[0], chunks[chunks.length - 1]], `${rel}: IHDR first, IEND last`).toEqual(["IHDR", "IEND"]);
  expect([depth, interlace], `${rel}: 8 bits, not interlaced`).toEqual([8, 0]);
  expect([2, 6], `${rel}: RGB or RGBA`).toContain(colorType);
  const bpp = colorType === 6 ? 4 : 3, stride = w * bpp, raw = inflateSync(Buffer.concat(idat));
  expect(raw.length, `${rel}: a whole image`).toBe((stride + 1) * h);
  const px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = y && x >= bpp ? px[(y - 1) * stride + x - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      px[y * stride + x] = (v + (f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
    }
  }
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = px[i * bpp]; rgba[i * 4 + 1] = px[i * bpp + 1]; rgba[i * 4 + 2] = px[i * bpp + 2];
    rgba[i * 4 + 3] = bpp === 4 ? px[i * bpp + 3] : 255;
  }
  return { w, h, colorType, bytes: buf.length, rgba };
}

const hexRgb = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

describe("M3 Goal 3: store/feature-1024x500.png (Google Play's feature graphic)", () => {
  const rel = "store/feature-1024x500.png";
  const im = readPng(rel);

  it("is 1024 x 500, 24-bit RGB with no alpha channel (Play takes a JPEG or a 24-bit PNG), and well under a megabyte", () => {
    expect([im.w, im.h, im.colorType]).toEqual([1024, 500, 2]);
    expect(im.bytes).toBeLessThan(1024 * 1024);
    for (let k = 3; k < im.rgba.length; k += 4) if (im.rgba[k] !== 255) throw new Error(`a see-through pixel at ${(k - 3) / 4}`);
  });

  it("carries the title's logo: titleArt's seven-step fire ramp (palette.ts white, fire4, fire3, amber, fire2, fire1, fire0) in the logo band, at 4 px a pixel", () => {
    const palette = read("src/render/palette.ts"); // sprites.ts titleArt: ramp = [C.white, C.fire4, C.fire3, C.amber, C.fire2, C.fire1, C.fire0]
    expect(read("src/render/sprites.ts")).toContain("const ramp = [C.white, C.fire4, C.fire3, C.amber, C.fire2, C.fire1, C.fire0];");
    const ramp = ["white", "fire4", "fire3", "amber", "fire2", "fire1", "fire0"].map((n) => new RegExp(`^\\s+${n}: "(#[0-9A-Fa-f]{6})"`, "m").exec(palette)?.[1]?.toUpperCase() ?? "");
    expect(ramp.every((c) => /^#[0-9A-F]{6}$/.test(c)), `the ramp's colours: ${ramp.join(" ")}`).toBe(true);
    // the logo band: x 114..910, y 24..124 (796 x 100 = the 199 x 25 art at 4 px a pixel)
    const counts = ramp.map(() => 0);
    let x0 = 1024, x1 = -1, y0 = 500, y1 = -1;
    for (let y = 0; y < 500; y++) {
      for (let x = 0; x < 1024; x++) {
        const o = (y * 1024 + x) * 4;
        const i = ramp.findIndex((c) => { const [r, g, b] = hexRgb(c); return im.rgba[o] === r && im.rgba[o + 1] === g && im.rgba[o + 2] === b; });
        if (i < 0 || y > 140) continue;
        counts[i]++;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
    for (const [i, n] of counts.entries()) expect(n, `${ramp[i]} (ramp step ${i}) in the logo`).toBeGreaterThan(400);
    // the key content (the logo) is clear of the edges: 100 px or more from each side, 16 or more from the top
    expect(x0, "the logo's left").toBeGreaterThanOrEqual(100);
    expect(1023 - x1, "the logo's right").toBeGreaterThanOrEqual(100);
    expect(y0, "the logo's top").toBeGreaterThanOrEqual(16);
    expect(y1, "the logo's bottom is inside the band").toBeLessThanOrEqual(136);
    // and drawn whole by 4s (nearest neighbour, no blur): the B's top bar and its stem are solid, so every run of 4 pixels along them is one
    // colour; and the two outline rings titleArt draws round the glyphs (ink, then maroon) are each exactly 4 px wide
    const hexAt = (px: number, py: number): string => { const o = (py * 1024 + px) * 4; return `#${[0, 1, 2].map((k) => im.rgba[o + k].toString(16).padStart(2, "0")).join("").toUpperCase()}`; };
    for (const y of [y0 + 4, y0 + 8]) {
      for (let x = x0; x < x0 + 48; x += 4) {
        const c = hexAt(x, y);
        for (const d of [1, 2, 3]) if (hexAt(x + d, y) !== c) throw new Error(`the logo is not whole 4 px blocks at ${x},${y}`);
      }
    }
    for (const x of [x0 + 4, x0 + 8]) {
      for (let y = y0; y < y0 + 84; y += 4) {
        const c = hexAt(x, y);
        for (const d of [1, 2, 3]) if (hexAt(x, y + d) !== c) throw new Error(`the logo is not whole 4 px blocks at ${x},${y}`);
      }
    }
    const ink = /^\s+ink: "(#[0-9A-Fa-f]{6})"/m.exec(palette)?.[1]?.toUpperCase(), maroon = /^\s+maroon: "(#[0-9A-Fa-f]{6})"/m.exec(palette)?.[1]?.toUpperCase();
    const y = y0 + 16; // a row through the B's stem
    expect([hexAt(x0 - 1, y), hexAt(x0 - 4, y)], "the ink ring, 4 px").toEqual([ink, ink]);
    expect([hexAt(x0 - 5, y), hexAt(x0 - 8, y)], "the maroon ring, 4 px").toEqual([maroon, maroon]);
    expect(hexAt(x0 - 9, y), "nothing of the logo beyond the rings").not.toBe(maroon);
  });

  it("shows a battle under the band: the sky behind the cruisers (blue) and warm fire from the muzzles, not a flat fill", () => {
    const seen = new Set<number>();
    let blue = 0, warm = 0;
    for (let y = 150; y < 500; y += 2) {
      for (let x = 0; x < 1024; x += 2) {
        const o = (y * 1024 + x) * 4, r = im.rgba[o], g = im.rgba[o + 1], b = im.rgba[o + 2];
        seen.add((r << 16) | (g << 8) | b);
        if (b > r + 40 && b > g) blue++;
        if (r > 200 && g > 100 && b < 120) warm++;
      }
    }
    expect(seen.size, "distinct colours below the band").toBeGreaterThan(40);
    expect(blue, "the sky").toBeGreaterThan(20000);
    expect(warm, "fire and warm metal").toBeGreaterThan(300);
  });
});

// ------------------------------------------------------------------ the scripts

describe("M3 Goal 3: scripts/m3 add no package, make no request but to the served build, and never name production", () => {
  const files = (dir: string): string[] => readdirSync(join(ROOT, dir)).flatMap((n) => (n.includes(".") ? [`${dir}/${n}`] : files(`${dir}/${n}`)));
  const scripts = files("scripts/m3").filter((f) => /\.(mjs|ts|html)$/.test(f));

  it("holds the pipeline's scripts (icon, android, feature, storeshots, kit) and the art page", () => {
    for (const f of ["icon.mjs", "android.mjs", "feature.mjs", "storeshots.mjs", "kit.mjs", "lib.mjs", "img.mjs", "mark.mjs", "vite.m3.config.mjs", "page/index.html", "page/main.ts", "page/motifs.ts", "page/frame.ts"]) {
      expect(existsSync(join(ROOT, "scripts/m3", f)), f).toBe(true);
    }
  });

  it("imports only node built-ins, playwright-core and vite (devDependencies already in package.json), and its own files", () => {
    const pkg = JSON.parse(read("package.json")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const known = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
    for (const f of scripts.filter((s) => /\.(mjs|ts)$/.test(s))) {
      const text = read(f);
      for (const m of text.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"\n]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)) {
        const spec = (m[1] ?? m[2]) as string;
        if (spec.startsWith(".") || spec.startsWith("node:")) continue;
        expect(known.has(spec), `${f} imports ${spec}: not a package the project already has`).toBe(true);
        expect(["playwright-core", "vite"], `${f} imports ${spec}`).toContain(spec);
      }
    }
  });

  it("names no production address and no cloud: no fly.dev, no GitHub, no Google or Apple address in code (only the served http://bb.test)", () => {
    for (const f of scripts) {
      const code = read(f).split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|<!--)/.test(l)).join("\n");
      expect(code, f).not.toMatch(/fly\.dev|beltbattles\.fly|flyctl|github\.com|googleapis|play\.google|apple\.com|appstoreconnect/i);
      for (const m of code.matchAll(/https?:\/\/[^\s"'`)<>]+/g)) expect(m[0], `${f}: a URL in code`).toMatch(/^http:\/\/bb\.test/);
    }
  });

  it("serves the build at http://bb.test and aborts every other request: one route for everything, the refused URLs counted", () => {
    const lib = read("scripts/m3/lib.mjs");
    expect(lib).toContain('export const ORIGIN = "http://bb.test";');
    expect(lib).toMatch(/ctx\.route\("\*\*\/\*"/);
    expect(lib).toMatch(/if \(url\.origin !== ORIGIN\) \{[\s\S]*?route\.abort\(\)/);
    // the scripts that open the game open it only through that served context
    expect(read("scripts/m3/storeshots.mjs")).toContain("servedContext(browser, dist, ");
    expect(read("scripts/m3/storeshots.mjs")).not.toMatch(/\.(route|goto)\(["'`]https?:/);
    // the plain offline build: no ghost server, no native flag, no demo flag (never dist-app: it would call the production server)
    for (const f of ["storeshots.mjs", "kit.mjs", "feature.mjs"]) expect(read(`scripts/m3/${f}`), f).not.toMatch(/VITE_GHOST_SERVER|VITE_NATIVE|VITE_DEMO|dist-app/);
  });

  it("kit.mjs empties only a folder that is missing, empty or already a kit, and checks that before it builds or deletes anything", () => {
    const kit = read("scripts/m3/kit.mjs");
    expect(kit).toContain("is not empty and is not a kit folder (no index.html and shots.json): refusing to empty it");
    expect(kit.indexOf("await clearKit(OUT);"), "the guard runs first").toBeGreaterThan(-1);
    expect(kit.indexOf("await clearKit(OUT);")).toBeLessThan(kit.indexOf("viteBuild(DIST"));
    // the only recursive delete of the output folder goes through the guard; the other one is the fixed scratch build in WS/tmp
    const deletes = [...kit.matchAll(/\brm\(([^,]+),/g)].map((m) => m[1].trim());
    expect(deletes.sort()).toEqual(["DIST", "dir"]);
  });

  it("builds only into WS/tmp (outside the repo), and the Android script writes only res/ and store/", () => {
    expect(read("scripts/m3/lib.mjs")).toContain('export const TMP = join(WS, "tmp");');
    expect(read("scripts/m3/vite.m3.config.mjs")).toContain('"tmp", "m3-page"');
    const android = read("scripts/m3/android.mjs");
    const targets = [...android.matchAll(/\bput\(([^,]+),/g)].map((m) => m[1].trim());
    expect(targets.length).toBeGreaterThan(5);
    for (const t of targets) expect(t, `a file android.mjs writes: ${t}`).toMatch(/^(`\$\{RES\}\/|"store\/)/);
    expect(android).toContain('const RES = "android/app/src/main/res";');
    for (const f of scripts.filter((s) => s.endsWith(".mjs"))) {
      expect(read(f), f).not.toMatch(/\b(writeFile|copyFile|put)\([^;]*(["'`]|\/)(src|server|deploy|docs|\.github)\//);
    }
  });
});
