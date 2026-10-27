// M3 (REQ-BFG-119) Goal 3: the store kit, in one command: the plain offline build, the screenshots of real play for both stores, the masters and the
// feature graphic from store/, and an index.html that shows every file (relative links only, no outside URL, so the folder can be previewed as it is).
//   node scripts/m3/kit.mjs [--out <kit dir>] [--orient portrait|landscape]
// It builds the plain offline build (no ghost server) with the game's own `vite build` into WS/tmp/m3-dist, never into the repo, runs
// scripts/m3/storeshots.mjs on it, copies store/icon-1024.png (Apple), store/play-icon-512.png and store/feature-1024x500.png (Play), writes
// <out>/index.html and removes the build. The screenshots are NOT committed (they go to the kit); the scripts and store/'s files are.
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { args, ROOT, TMP, viteBuild } from "./lib.mjs";

const a = args();
const OUT = resolve(a.out ?? join(ROOT, "..", "output-m3", "kit"));
const DIST = join(TMP, "m3-dist");
const ORIENT = a.orient ?? "portrait";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const CT = { 2: "RGB (24-bit, no alpha)", 6: "RGBA (32-bit)" };

/** [width, height, colour type] from a PNG's IHDR. */
async function ihdr(file) {
  const b = await readFile(file);
  return [b.readUInt32BE(16), b.readUInt32BE(20), b[25]];
}

async function main() {
  viteBuild(DIST, { label: "the plain offline build" });
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const shots = spawnSync(process.execPath, [join(ROOT, "scripts", "m3", "storeshots.mjs"), "--dist", DIST, "--out", OUT, "--orient", ORIENT, "--stores", "apple,apple-6.3,play"], { stdio: "inherit" });
  if (shots.status !== 0) throw new Error("storeshots failed");
  await copyFile(join(ROOT, "store", "icon-1024.png"), join(OUT, "apple", "icon-1024.png"));
  await copyFile(join(ROOT, "store", "play-icon-512.png"), join(OUT, "play", "icon-512.png"));
  await copyFile(join(ROOT, "store", "feature-1024x500.png"), join(OUT, "play", "feature-1024x500.png"));
  const meta = JSON.parse(await readFile(join(OUT, "shots.json"), "utf8"));
  const notes = Object.fromEntries(meta.shots.map((s) => [s.file, s.note]));
  notes["apple/icon-1024.png"] = "the app icon: the orc captain medallion (FURNACE's portrait in a brass rim) on the adaptive icon's blue; the App Store takes it from the build (M2 wires store/icon-1024.png in)";
  notes["play/icon-512.png"] = "Google Play's hi-res icon (32-bit PNG, fully opaque)";
  notes["play/feature-1024x500.png"] = "Google Play's feature graphic: the title's logo over a battle in the sky (drawn by the game's own battle code)";

  const rows = [];
  for (const store of ["apple", "apple-6.3", "play"]) {
    for (const f of (await readdir(join(OUT, store))).filter((n) => n.endsWith(".png")).sort()) {
      const file = `${store}/${f}`;
      const [w, h, ct] = await ihdr(join(OUT, file));
      rows.push({ store, file, name: f, w, h, ct, bytes: (await stat(join(OUT, file))).size, note: notes[file] ?? "" });
    }
  }
  const fmt = (n) => n.toLocaleString("en-US");
  const section = (store, title, intro) => `
  <section>
    <h2>${esc(title)}</h2>
    <p>${intro}</p>
    <div class="grid">
${rows.filter((r) => r.store === store).map((r) => `      <figure>
        <a href="${esc(r.file)}"><img src="${esc(r.file)}" alt="${esc(r.name)}" loading="lazy"></a>
        <figcaption><b>${esc(r.name)}</b><br>${r.w} &times; ${r.h} px &middot; ${esc(CT[r.ct] ?? `colour type ${r.ct}`)} &middot; ${fmt(r.bytes)} bytes<br><span>${esc(r.note)}</span></figcaption>
      </figure>`).join("\n")}
    </div>
  </section>`;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BeltBattles store kit</title>
<style>
  body { margin: 0; padding: 24px; background: #050b12; color: #d0ceb7; font: 15px/1.45 system-ui, sans-serif; }
  h1 { color: #f6cf48; margin: 0 0 4px; } h2 { color: #f38f32; margin: 28px 0 4px; }
  p { max-width: 62em; } table { border-collapse: collapse; margin: 12px 0 24px; width: 100%; max-width: 78em; }
  th, td { border: 1px solid #263745; padding: 4px 8px; text-align: left; vertical-align: top; } th { background: #101b27; color: #80e5ef; }
  .grid { display: flex; flex-wrap: wrap; gap: 18px; align-items: flex-start; }
  figure { margin: 0; max-width: 300px; } figure img { display: block; max-width: 300px; max-height: 520px; border: 1px solid #344958; image-rendering: pixelated; background: #101b27; }
  figure.wide, figure:has(img[alt^="feature"]) { max-width: 640px; } figure:has(img[alt^="feature"]) img { max-width: 640px; }
  figcaption { font-size: 12.5px; margin-top: 4px; } figcaption span { color: #7a8f9a; } a { color: #80e5ef; }
</style>
</head>
<body>
<h1>BeltBattles: the store kit</h1>
<p>Made by scripts/m3 on branch m3-art (REQ-BFG-119). Every picture comes from the game's own drawing code: the screenshots are frames of the plain offline build (no ghost server, so the foes are the game's own stand-in captains), played in a browser served at http://bb.test with every other request refused; the captain's name in that run was ${esc(meta.name)}. Shape: ${esc(ORIENT)}. Each file below opens at its full size.</p>
${section("apple", "App Store Connect (iPhone, 6.9-inch display)", "Upload the screenshots (1 to 10 allowed; these are 1320 &times; 2868, RGB with no alpha). The app icon comes from the build (the 1024 &times; 1024 file is the one M2 puts in the iOS AppIcon set).")}
${section("apple-6.3", "App Store Connect, only if it asks for the 6.3-inch set (an extra)", "The same six moments at 1206 &times; 2622, RGB with no alpha. Apple's screenshot page lists the 6.3-inch class as the required iPhone size and says a larger set is scaled down when the screens look the same; if App Store Connect takes the 6.9-inch set above on its own, ignore this folder.")}
${section("play", "Google Play Console (phone)", "Upload the hi-res icon (512 &times; 512), the feature graphic (1024 &times; 500) and the phone screenshots (2 to 8 allowed; these are 1080 &times; 1920, 24-bit PNG with no alpha, 9:16).")}
  <section>
    <h2>Every file</h2>
    <table>
      <tr><th>Store</th><th>File</th><th>Pixels</th><th>Colour type</th><th>Bytes</th><th>What it shows</th></tr>
${rows.map((r) => `      <tr><td>${r.store === "apple" ? "App Store" : r.store === "apple-6.3" ? "App Store (6.3-inch extra)" : "Google Play"}</td><td><a href="${esc(r.file)}">${esc(r.file)}</a></td><td>${r.w} &times; ${r.h}</td><td>${esc(CT[r.ct] ?? r.ct)}</td><td>${fmt(r.bytes)}</td><td>${esc(r.note)}</td></tr>`).join("\n")}
    </table>
  </section>
</body>
</html>
`;
  await writeFile(join(OUT, "index.html"), html);
  await rm(DIST, { recursive: true, force: true });
  console.log(`kit: ${rows.length} files in ${OUT}, index.html written; the scratch build is removed`);
}
main().catch((e) => { console.error(e); process.exit(1); });
