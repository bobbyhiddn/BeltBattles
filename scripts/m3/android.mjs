// M3 (REQ-BFG-119) Goal 2: the Android app's art and the store masters, from the chosen mark.
//   node scripts/m3/android.mjs [--motif captain]
// Writes (and nothing else):
//   android/app/src/main/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png, ic_launcher_round.png (48/72/96/144/192 px)
//                                                                  and ic_launcher_foreground.png (108/162/216/324/432 px)
//   android/app/src/main/res/values/ic_launcher_background.xml     the adaptive icon's one background colour (the mark's field)
//   store/icon-1024.png        1024 x 1024, RGB, no alpha: the App Store icon (and the iOS AppIcon M2 wires in)
//   store/play-icon-512.png    512 x 512, 32-bit RGBA, fully opaque: Google Play's hi-res icon
//   store/splash-2732.png      2732 x 2732, RGB: the mark centred on #050B12 (M2's iOS launch screen)
// The mark is drawn by the game's own pixel-art code (scripts/m3/page/motifs.ts); all art scaling here is by whole numbers with
// nearest-neighbour sampling, except the legacy icons (Android 7.x only), which are area-averaged from a 432 px render.
// To swap the mark: run this with another --motif, then `npx vitest run tests/m3.android.test.ts tests/m1.android.test.ts`.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { args, openArtPage, ROOT } from "./lib.mjs";
import { drawMotif } from "./icon.mjs";
import { encodePng, over, scaleNearest } from "./img.mjs";
import { FG_SIZES, LEGACY_SIZES, N, legacyIcon, legacyRound, master, solid, subjectLayer, subjectStats } from "./mark.mjs";

const a = args();
const MOTIF = typeof a.motif === "string" ? a.motif : "captain";
const RES = "android/app/src/main/res";
const INK = "#050B12"; // the page's own background: capacitor.config.json backgroundColor, values/colors.xml bb_background

const put = async (rel, bytes) => {
  const file = join(ROOT, rel);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, bytes);
  return rel;
};

async function main() {
  const art = await openArtPage();
  let drawn;
  try {
    drawn = await drawMotif(art.page, MOTIF);
  } finally {
    await art.close();
  }
  const { subject, field } = drawn;
  const st = subjectStats(subject);
  if (!st.centre61 || st.partial) throw new Error(`${MOTIF}: the subject breaks the centre 61% rule or has partly transparent pixels`);
  const written = [];

  for (const [density, T] of Object.entries(LEGACY_SIZES)) {
    written.push(await put(`${RES}/mipmap-${density}/ic_launcher.png`, encodePng(legacyIcon(subject, field, T))));
    written.push(await put(`${RES}/mipmap-${density}/ic_launcher_round.png`, encodePng(legacyRound(subject, field, T))));
  }
  for (const [density, T] of Object.entries(FG_SIZES)) {
    // the adaptive icon's top layer: the subject alone, transparent outside it, a whole-number scale of the 54 x 54 art
    written.push(await put(`${RES}/mipmap-${density}/ic_launcher_foreground.png`, encodePng(subjectLayer(subject, T))));
  }
  written.push(await put(`${RES}/values/ic_launcher_background.xml`, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${field}</color>\n</resources>\n`));

  written.push(await put("store/icon-1024.png", encodePng(master(subject, field, 1024), { alpha: false })));
  written.push(await put("store/play-icon-512.png", encodePng(master(subject, field, 512), { alpha: true })));
  // the splash: the mark (the subject, as the title shows the logo: on the page's own colour) centred at 28 pixels a pixel, 896 px
  // of 2732 (32.8%, under a third: iOS scales a launch image to fill the phone and crops its sides)
  const S = 28, art54 = scaleNearest(subject, S), side = 2732;
  const splash = over(solid(side, side, INK), art54, (side - art54.w) / 2, (side - art54.h) / 2);
  written.push(await put("store/splash-2732.png", encodePng(splash, { alpha: false })));

  console.log(`mark ${MOTIF} (field ${field}; subject ${st.width}x${st.height} of ${N} px, ${(((st.width * S) / side) * 100).toFixed(1)}% of the splash's width)`);
  for (const w of written) console.log(`  wrote ${w}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
