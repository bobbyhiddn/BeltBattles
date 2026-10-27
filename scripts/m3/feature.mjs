// M3 (REQ-BFG-119) Goal 3: Google Play's feature graphic, 1024 x 500, a 24-bit PNG with no alpha channel (Play's rule), no text but the
// game's own logo: the logo as the title screen draws it (titleArt over the game's 5x7 pixel face, in the title's own dark band) over a
// battle frame from the game. The frame is drawn by the game's own battle code (scripts/m3/page/frame.ts: Arena and ArenaMotion, the calls the
// title's attract fight makes) at 512 x 250 pixels and scaled by 2; the logo is scaled by 4. Both are whole-number scales with nearest
// neighbour (no blur). The key content stays clear of the edges: the logo is 114 px in from each side and 24 px from the top, the
// cruisers 90 px from the left and right and 40 px from the bottom.
//   node scripts/m3/feature.mjs --out store/feature-1024x500.png [--scene sky --t 12 --left twobelts --right furnace --day 6 --gap 130]
//   node scripts/m3/feature.mjs --out <sheet.png> --probe sky:10,sky:14,calm:12     frames (scene:seconds) in one sheet, to choose from
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { args, openArtPage } from "./lib.mjs";
import { blank, boxResize, encodePng, fromBase64, hexRgb, over, scaleNearest } from "./img.mjs";

const a = args();
const INK = "#050B12", SLATE1 = "#263745"; // palette.ts ink and slate1: the title's logo band (title.ts: rect ink at alpha .7, lines of slate1)
const SPEC = { W: 512, H: 250, top: 78, gap: Number(a.gap ?? 90), shift: Number(a.shift ?? 3), seed: Number(a.seed ?? 1000), left: a.left ?? "twobelts", right: a.right ?? "furnace", rightDay: Number(a.day ?? 6) };

/** The feature graphic from a battle frame (512 x 250) and the logo (199 x 25 art pixels). */
function compose(frame, logo) {
  const scene = scaleNearest(frame, 2); // 1024 x 500
  const [ir, ig, ib] = hexRgb(INK), [sr, sg, sb] = hexRgb(SLATE1);
  const bandY = 12, bandH = 124, line = 4;
  let img = over(scene, blank(1024, bandH, [ir, ig, ib, Math.round(0.7 * 255)]), 0, bandY);
  img = over(img, blank(1024, line, [sr, sg, sb, 255]), 0, bandY);
  img = over(img, blank(1024, line, [sr, sg, sb, 255]), 0, bandY + bandH - line);
  const big = scaleNearest(logo, 4); // 796 x 100
  return over(img, big, (1024 - big.w) / 2, bandY + (bandH - big.h) / 2);
}

async function main() {
  const probe = typeof a.probe === "string" ? a.probe.split(",").map((p) => p.split(":")) : null;
  const wanted = probe ?? [[a.scene ?? "sky", a.t ?? "12"]];
  const art = await openArtPage();
  const frames = [];
  let logoImg;
  try {
    const l = await art.page.evaluate(() => window.m3.logo("BELTBATTLES"));
    logoImg = fromBase64(l.w, l.h, l.rgba);
    for (const [scene, secs] of wanted) {
      const r = await art.page.evaluate((spec) => window.m3.battle(spec), { ...SPEC, scene, seconds: Number(secs) });
      frames.push({ scene, secs, info: r.info, im: fromBase64(r.w, r.h, r.rgba) });
    }
  } finally {
    await art.close();
  }
  if (probe) {
    const cell = frames.map((f) => boxResize(compose(f.im, logoImg), 512, 250));
    const cols = 2, rows = Math.ceil(cell.length / cols);
    let sheet = blank(cols * 518, rows * 256, [20, 20, 20, 255]);
    cell.forEach((c, i) => { sheet = over(sheet, c, (i % cols) * 518 + 3, Math.floor(i / cols) * 256 + 3); });
    await writeFile(resolve(a.out), encodePng(sheet, { alpha: false }));
    for (const f of frames) console.log(`${f.scene}:${f.secs} ${JSON.stringify({ ...f.info, boxes: undefined })}`);
    return;
  }
  const img = compose(frames[0].im, logoImg);
  const png = encodePng(img, { alpha: false });
  await writeFile(resolve(a.out), png);
  console.log(`${resolve(a.out)}: ${img.w}x${img.h}, RGB (colour type 2), ${png.length} bytes; battle frame ${JSON.stringify({ scene: frames[0].scene, ...SPEC, seconds: Number(frames[0].secs), ...frames[0].info, boxes: undefined })}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
