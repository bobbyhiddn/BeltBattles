// V5 (0.5.0): comparison sheets composed in headless chromium (no image libraries).
// - battle-mid-{desk,phone}-0.4.1-vs-0.5.0.png: the same battle frame before and after the gap change
// - events-{desk,phone}.png: six different road events at each view
// Usage: node scripts/compare05.mjs <0.4.1 shotsDir> <0.5.0 shotsDir> <outDir>

import { chromium } from "playwright-core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const [OLD, NEW, OUT] = process.argv.slice(2).map((p) => resolve(p));

async function dataUrl(file) {
  return `data:image/png;base64,${(await readFile(file)).toString("base64")}`;
}

// In-page composer: tiles = [{src, x, y, w?, h?}], texts = [{x, y, text, color, size, bold}]
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
      g.imageSmoothingEnabled = false;
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

const EVENTS = [
  ["event", "BONE DICE · gamble (one bet unaffordable)"], ["event-trader", "TINKER'S CART · trader"],
  ["event-dock", "FIELD DOCK · repair (lives full)"], ["event-herald", "WARLORD'S HERALD · bounty/elite"],
  ["event-storm", "DARK WIND FRONT"], ["event-smuggler", "AMMO SMUGGLER · burn/shock"],
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu"] });
  const page = await browser.newPage();
  const PAD = 24, HEAD = 64;
  for (const view of ["desk", "phone"]) {
    const [w, h] = view === "desk" ? [1920, 1080] : [1170, 2532];
    await sheet(page, {
      W: PAD * 3 + w * 2, H: HEAD + h + PAD,
      tiles: [{ src: await dataUrl(join(OLD, `battle-mid-${view}.png`)), x: PAD, y: HEAD }, { src: await dataUrl(join(NEW, `battle-mid-${view}.png`)), x: PAD * 2 + w, y: HEAD }],
      texts: [
        { x: PAD, y: 42, text: `0.4.1 (ff6914a) · battle-mid · ${view} · cruisers ${view === "desk" ? "40 px apart (12.5%)" : "40 px apart (11%)"}`, size: 30, color: "#7A8F9A", bold: true },
        { x: PAD * 2 + w, y: 42, text: `0.5.0 · battle-mid · ${view} · ${view === "desk" ? "gap 104 px (27%)" : "gap 102 px (24%)"}`, size: 30, color: "#F38F32", bold: true },
      ],
    }, join(OUT, `battle-mid-${view}-0.4.1-vs-0.5.0.png`));
  }
  // events sheets: desk 2 x 3 at half size; phone 3 x 2 at a third
  const desk = [], dtexts = [{ x: PAD, y: 42, text: "BeltBattles 0.5.0 · road events · desk (1920x1080, 4x)", size: 30, color: "#F38F32", bold: true }];
  EVENTS.forEach(([name, label], i) => {
    const x = PAD + (i % 2) * (960 + PAD), y = HEAD + Math.floor(i / 2) * (540 + 48);
    desk.push({ file: join(NEW, `${name}-desk.png`), x, y: y + 36, w: 960, h: 540 });
    dtexts.push({ x, y: y + 26, text: label, size: 22, color: "#80E5EF" });
  });
  await sheet(page, { W: PAD * 3 + 1920, H: HEAD + 3 * (540 + 48) + PAD, tiles: await Promise.all(desk.map(async (t) => ({ ...t, src: await dataUrl(t.file) }))), texts: dtexts }, join(OUT, "events-desk.png"));
  const phone = [], ptexts = [{ x: PAD, y: 42, text: "BeltBattles 0.5.0 · road events · phone (390x844 @3)", size: 30, color: "#F38F32", bold: true }];
  EVENTS.forEach(([name, label], i) => {
    const x = PAD + (i % 3) * (585 + PAD), y = HEAD + Math.floor(i / 3) * (1266 + 48);
    phone.push({ file: join(NEW, `${name}-phone.png`), x, y: y + 36, w: 585, h: 1266 });
    ptexts.push({ x, y: y + 26, text: label, size: 20, color: "#80E5EF" });
  });
  await sheet(page, { W: PAD * 4 + 3 * 585, H: HEAD + 2 * (1266 + 48) + PAD, tiles: await Promise.all(phone.map(async (t) => ({ ...t, src: await dataUrl(t.file) }))), texts: ptexts }, join(OUT, "events-phone.png"));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
