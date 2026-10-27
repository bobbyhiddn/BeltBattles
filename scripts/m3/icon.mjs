// M3 (REQ-BFG-119) Goal 1: the app icon, drawn by the game's own pixel-art code (scripts/m3/page/motifs.ts, built from src/render).
//   node scripts/m3/icon.mjs --parts <out.png>                  the sheet of the game's own pieces the marks are made of
//   node scripts/m3/icon.mjs --motif <name|all> --out <dir>     a candidate: <dir>/<name>/ holds its 1024 and 512 masters, the
//                                                               54 x 54 art magnified, and its contact sheets (5 sizes x 4 masks x
//                                                               light and dark wallpaper): sheet.png, and small.png (192/96/48 px magnified)
// Run it under `nice -n 19` (it also lowers its own priority). PLAYWRIGHT_BROWSERS_PATH defaults to WS/ms-playwright; nothing is
// downloaded and the page can reach no network (every request but its own files is aborted).
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { args, openArtPage } from "./lib.mjs";
import { encodePng, fromBase64, scaleNearest } from "./img.mjs";
import { contactSheet, master, smallSheet, subjectStats } from "./mark.mjs";

const a = args();

/** One candidate's subject (54 x 54 RGBA) and field colour, as the art page draws them. */
export async function drawMotif(page, name) {
  const s = await page.evaluate((n) => window.m3.subject(n), name);
  return { subject: fromBase64(s.w, s.h, s.rgba), field: s.field };
}

async function main() {
  const art = await openArtPage();
  try {
    if (a.parts) {
      const p = await art.page.evaluate(() => window.m3.parts());
      const img = scaleNearest(fromBase64(p.w, p.h, p.rgba), 3);
      await writeFile(resolve(a.parts), encodePng(img, { alpha: false }));
      console.log(`parts sheet: ${resolve(a.parts)} (${img.w}x${img.h})`);
    }
    if (a.motif) {
      const out = resolve(a.out ?? "icons");
      const list = await art.page.evaluate(() => window.m3.motifs());
      const names = a.motif === "all" ? list.map((m) => m.name) : String(a.motif).split(",");
      for (const name of names) {
        const info = list.find((m) => m.name === name);
        if (!info) throw new Error(`no motif "${name}" (have: ${list.map((m) => m.name).join(", ")})`);
        const { subject, field } = await drawMotif(art.page, name);
        const dir = join(out, name);
        await mkdir(dir, { recursive: true });
        const files = [
          ["art-54x8.png", scaleNearest(master(subject, field, 54), 8), false],
          ["icon-1024.png", master(subject, field, 1024), false],
          ["play-512.png", master(subject, field, 512), true],
          ["sheet.png", contactSheet(subject, field), false],
          ["small.png", smallSheet(subject, field), false],
        ];
        for (const [f, img, alpha] of files) await writeFile(join(dir, f), encodePng(img, { alpha }));
        const st = subjectStats(subject);
        console.log(`${name}: ${info.blurb}\n  field ${field}; subject ${st.width}x${st.height} px at ${st.bbox.join(",")} on the 54 grid, farthest corner ${st.maxR} px from the centre (safe circle 16.5), ${st.partial} partly transparent pixels, centre 61% rule ${st.centre61 ? "met" : "BROKEN"}\n  wrote ${files.map((f) => f[0]).join(", ")} in ${dir}`);
        if (!st.centre61 || st.partial) throw new Error(`${name}: the subject breaks the centre 61% rule or has partly transparent pixels`);
      }
    }
  } finally {
    await art.close();
  }
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
