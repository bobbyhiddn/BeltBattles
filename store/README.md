# store/: the art and text the two phone stores ask for (M3, REQ-BFG-119)

Every picture here is drawn by the game's own pixel-art code (src/render) through scripts/m3, on the game's own palette: no outside art, no
image generator. The screenshots are not kept here: `node scripts/m3/kit.mjs` makes them (with this folder's files and an index.html) into a kit folder.

| File | What | Who uses it |
|---|---|---|
| `icon-1024.png` | the app icon, 1024 x 1024, RGB, no alpha channel | the App Store (it comes from the build): M2 puts it in the iOS AppIcon set |
| `play-icon-512.png` | the same icon, 512 x 512, 32-bit RGBA, fully opaque | Google Play's hi-res icon (Play Console) |
| `splash-2732.png` | the mark centred on #050B12, 2732 x 2732, RGB, under a third of the width | M2's iOS launch screen (the Splash image set) |
| `feature-1024x500.png` | the title's logo over a sky battle, 1024 x 500, RGB, no alpha | Google Play's feature graphic (Play Console) |
| `listing/play.md`, `listing/apple.md` | the listing text, en-US, each field with its limit | Play Console and App Store Connect |

The Android launcher PNGs and the adaptive icon's colour (android/app/src/main/res/) come from the same mark.

Commands (run each under `nice -n 19`, from the repo root):

- `node scripts/m3/icon.mjs --motif <captain|bastion|logo|turret> --out <dir>`: a candidate mark's masters and contact sheets.
- `node scripts/m3/android.mjs --motif captain`: the 15 launcher PNGs, the adaptive background colour, `icon-1024.png`, `play-icon-512.png` and `splash-2732.png`.
  To change the mark: run it with another `--motif`, then `npx vitest run tests/m3.android.test.ts tests/m1.android.test.ts`.
- `node scripts/m3/feature.mjs --out store/feature-1024x500.png --scene sky --t 12`: the feature graphic.
- `node scripts/m3/kit.mjs`: the screenshots (the plain offline build, real play, both stores), the masters, and index.html, into ../output-m3/kit.

Checks: tests/m3.android.test.ts (the art and the masters), tests/m3.kit.test.ts (the feature graphic and the scripts) and
tests/m3.listing.test.ts (the text: limits, banned words, and every number against the code).
