// V5: comparison sheets composed in headless chromium (no image libraries).
// Usage: node scripts/compare.mjs <baselineDir> <newShotsDir> <refsDir> <outDir>

import { chromium } from "playwright-core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const [BASE, NEW, REFS, OUT] = process.argv.slice(2).map((p) => resolve(p));

async function dataUrl(file) {
  const b = await readFile(file);
  return `data:image/${extname(file) === ".jpg" ? "jpeg" : "png"};base64,${b.toString("base64")}`;
}

// In-page composer: tiles = [{src, x, y, w?, h?, label, smooth}], texts = [{x, y, text, color, size}]
function compose({ W, H, tiles, texts }) {
  return (async () => {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d");
    g.fillStyle = "#050B12";
    g.fillRect(0, 0, W, H);
    for (const t of tiles) {
      const img = new Image();
      img.src = t.src;
      await img.decode();
      g.imageSmoothingEnabled = !!t.smooth;
      g.drawImage(img, t.x, t.y, t.w ?? img.width, t.h ?? img.height);
      g.strokeStyle = "#344958";
      g.lineWidth = 2;
      g.strokeRect(t.x - 1, t.y - 1, (t.w ?? img.width) + 2, (t.h ?? img.height) + 2);
    }
    for (const s of texts) {
      g.fillStyle = s.color ?? "#D0CEB7";
      g.font = `${s.bold ? "bold " : ""}${s.size ?? 22}px monospace`;
      g.fillText(s.text, s.x, s.y);
    }
    return c.toDataURL("image/png");
  })();
}

async function sheet(page, spec, file) {
  const url = await page.evaluate(compose, spec);
  await writeFile(file, Buffer.from(url.split(",")[1], "base64"));
  console.log(`sheet -> ${file}`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu"] });
  const page = await browser.newPage();
  const PAD = 24, HEAD = 64;
  for (const name of ["battle-mid", "build", "title"]) {
    for (const view of ["desk", "phone"]) {
      const a = await dataUrl(join(BASE, `${name}-${view}.png`)), b = await dataUrl(join(NEW, `${name}-${view}.png`));
      const [w, h] = view === "desk" ? [1920, 1080] : [1170, 2532];
      await sheet(page, {
        W: PAD * 3 + w * 2, H: HEAD + h + PAD,
        tiles: [{ src: a, x: PAD, y: HEAD }, { src: b, x: PAD * 2 + w, y: HEAD }],
        texts: [
          { x: PAD, y: 40, text: `0.3.0 (668eac0) · ${name} · ${view}`, size: 30, color: "#7A8F9A", bold: true },
          { x: PAD * 2 + w, y: 40, text: `0.4.0 · ${name} · ${view}`, size: 30, color: "#F38F32", bold: true },
        ],
      }, join(OUT, `${name}-${view}-0.3.0-vs-0.4.0.png`));
    }
  }
  // 0.4.0 next to the reference studios
  const refs = [
    ["BeltBreaker · workshop, game camera (interiors/tour-workshop-play-lit.png)", join(REFS, "BeltBreaker/art/bible/current/interiors/tour-workshop-play-lit.png")],
    ["BeltBreaker · containment combat (docs/images/containment-combat.png)", join(REFS, "BeltBreaker/docs/images/containment-combat.png")],
  ];
  const tiles = [
    { src: await dataUrl(join(NEW, "battle-mid-desk.png")), x: PAD, y: HEAD, w: 960, h: 540 },
    { src: await dataUrl(join(NEW, "build-desk.png")), x: PAD * 2 + 960, y: HEAD, w: 960, h: 540 },
    { src: await dataUrl(refs[0][1]), x: PAD, y: HEAD * 2 + 540, w: 960, h: 540, smooth: true },
    { src: await dataUrl(refs[1][1]), x: PAD * 2 + 960, y: HEAD * 2 + 540, w: 960, h: 540, smooth: true },
    { src: await dataUrl(join(REFS, "Tangora/docs/sprite-corrections-v1/generation/masculine-idle-east.png")), x: PAD, y: HEAD * 3 + 1080, w: 320, h: 320 },
    { src: await dataUrl(join(NEW, "battle-hit-desk.png")), x: PAD * 2 + 320, y: HEAD * 3 + 1080, w: 640, h: 360 },
  ];
  const notes = (await readFile(join(OUT, "NOTES.txt"), "utf8")).split("\n");
  const texts = [
    { x: PAD, y: 44, text: "BeltBattles 0.4.0 · battle (desk 6x)", size: 26, color: "#F38F32", bold: true },
    { x: PAD * 2 + 960, y: 44, text: "BeltBattles 0.4.0 · build (desk 4x)", size: 26, color: "#F38F32", bold: true },
    { x: PAD, y: HEAD + 540 + 44, text: refs[0][0], size: 18, color: "#80E5EF" },
    { x: PAD * 2 + 960, y: HEAD + 540 + 44, text: refs[1][0], size: 18, color: "#80E5EF" },
    { x: PAD, y: HEAD * 2 + 1080 + 44, text: "Tangora · sprite grammar (docs/sprite-corrections-v1/...)  |  0.4.0 · hit frame", size: 20, color: "#80E5EF" },
    ...notes.map((t, i) => ({ x: PAD * 3 + 960, y: HEAD * 3 + 1080 + 26 + i * 27, text: t, size: 19, color: t.startsWith("MATCH") ? "#28FF64" : t.startsWith("GAP") ? "#EF5B4E" : "#D0CEB7" })),
  ];
  await sheet(page, { W: PAD * 3 + 1920, H: HEAD * 3 + 1080 + 360 + PAD * 2 + 60, tiles, texts }, join(OUT, "0.4.0-vs-references.png"));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
