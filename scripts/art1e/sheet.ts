// ART-1E (REQ-BFG-098; BRIEF-ART1E step 1) picture tool, not shipped: the sheet of the seven new scaling rigs' own art.
// One row per piece: its name; BEFORE = its stand-in's icon (the live rig it borrowed, SCALE_ART_FROM) at 1x and 2x; AFTER =
// its own icon at 1x and 2x, its 8 idle frames and its active frame at 2x. Each art px is S screen px (default 3), nearest
// neighbour, on a dark ground with a card-coloured square behind every picture (so the cell's edges show).
// Build: npx vite build --ssr scripts/art1e/sheet.ts --outDir <W>/tmp/art1e-sheet --emptyOutDir --logLevel warn
// Run:   node <W>/tmp/art1e-sheet/sheet.js <out.png> [S] [only,ids]
import { writeFileSync } from "node:fs";
import { C } from "../../src/render/palette";
import { gateSprite, itemIcon } from "../../src/render/sprites";
import { Img, R, installDocument, rgb } from "./raster";

installDocument();

const OUT = process.argv[2] ?? "art1e-sheet.png";
const S = Number(process.argv[3] ?? 3);
const ONLY = process.argv[4] ? new Set(process.argv[4].split(",")) : null;

/** [id, name, the stand-in's id] (BRIEF-ART1E section 2; SCALE_ART_FROM at the base). */
const ROWS: [string, string, string][] = [
  ["cindermail", "CINDER MAIL", "plateroller"],
  ["rotgauge", "ROT GAUGE", "heatjacket"],
  ["leechcoil", "LEECH COIL", "riveter"],
  ["crowdpress", "CROWD PRESS", "pincer"],
  ["aegisspike", "AEGIS SPIKE", "braceframe"],
  ["grudgerod", "GRUDGE ROD", "counterweight"],
  ["trophychain", "TROPHY CHAIN", "overclocker"],
];

const ground = rgb(C.night), card = rgb(C.navy), ink = rgb(C.slate4), dim = rgb(C.slate3), hi = rgb(C.fire4);
const rows = ROWS.filter(([id]) => !ONLY || ONLY.has(id));
const LABEL_W = 78, ROW_H = 30, HEAD_H = 20, GAP = 4;
const X_B1 = LABEL_W + 2, X_B2 = X_B1 + 12 + GAP, X_A1 = X_B2 + 24 + 10, X_A2 = X_A1 + 12 + GAP, X_I = X_A2 + 24 + 10;
const X_ACT = X_I + 8 * 26 + 6;
const W = X_ACT + 40, H = HEAD_H + rows.length * ROW_H + 4;
const img = new Img(W * S, H * S, ground);

const cell = (src: ReturnType<typeof R>, x: number, y: number, scale: number) => {
  img.rect(x * S, y * S, src.width * scale * S, src.height * scale * S, card);
  // the picture at 1x or 2x: each art px is `scale` art px wide
  img.blit(src, x * S, y * S, S * scale);
};

img.text("ART-1E: BEFORE (STAND-IN) / AFTER (OWN ART)", 2 * S, 1 * S, hi, S);
img.text("BEFORE", X_B1 * S, 11 * S, dim, S);
img.text("AFTER", X_A1 * S, 11 * S, dim, S);
img.text("IDLE FRAMES 0-7 (2X)", X_I * S, 11 * S, dim, S);
img.text("ACTIVE", X_ACT * S, 11 * S, dim, S);

rows.forEach(([id, name, from], r) => {
  const y = HEAD_H + r * ROW_H + 2;
  img.text(name, 2 * S, (y + 9) * S, ink, S);
  const before = R(itemIcon(from));
  cell(before, X_B1, y + 6, 1);
  cell(before, X_B2, y, 2);
  const after = R(itemIcon(id));
  cell(after, X_A1, y + 6, 1);
  cell(after, X_A2, y, 2);
  for (let f = 0; f < 8; f++) cell(R(gateSprite(id, f, false)), X_I + f * 26, y, 2);
  cell(R(gateSprite(id, 0, true)), X_ACT, y, 2);
});

writeFileSync(OUT, img.png());
console.log(`${OUT}: ${W * S}x${H * S} px, ${rows.length} rows, S=${S}`);
