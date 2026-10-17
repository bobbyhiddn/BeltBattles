// ART-1E (REQ-BFG-098; BRIEF-ART1E step 6) picture tool, not shipped: the cold read's picture. The seven new rigs' icons at 4x
// (the icon is its idle frame 0), each on a card-coloured square and lettered A-G in a shuffled order, with no names: the one
// PNG the three readers see. The shuffle is a seeded permutation (a mulberry32 draw), written next to the picture as the key.
// Build: npx vite build --ssr scripts/art1e/match.ts --outDir <W>/tmp/art1e-match --emptyOutDir --logLevel warn
// Run:   node <W>/tmp/art1e-match/match.js <out.png> <key.json> [seed] [scale]
import { writeFileSync } from "node:fs";
import { C } from "../../src/render/palette";
import { itemIcon } from "../../src/render/sprites";
import { SCALE_ART_IDS } from "../../src/render/scaleArt";
import { Img, R, installDocument, rgb } from "./raster";

installDocument();

const OUT = process.argv[2] ?? "art1e-match.png";
const KEY = process.argv[3] ?? "art1e-match-key.json";
const SEED = Number(process.argv[4] ?? 11);
const S = Number(process.argv[5] ?? 4);

function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
const order = [...SCALE_ART_IDS];
for (let i = order.length - 1; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  [order[i], order[j]] = [order[j], order[i]];
}

// 7 cards in a row: each 12 art px at S, 6 art px of margin round, the letter below
const CELL = 12 * S, PAD = 6 * S, LET = 12 * S;
const W = order.length * (CELL + PAD) + PAD, H = PAD + CELL + LET + PAD;
const img = new Img(W, H, rgb(C.night));
order.forEach((id, i) => {
  const x = PAD + i * (CELL + PAD);
  img.rect(x - 2 * S, PAD - 2 * S, CELL + 4 * S, CELL + 4 * S, rgb(C.navy));
  img.blit(R(itemIcon(id)), x, PAD, S);
  const letter = String.fromCharCode(65 + i);
  const lw = 5 * S * 2; // a 5 px wide glyph at 2x the picture's scale
  img.text(letter, x + Math.floor((CELL - lw) / 2), PAD + CELL + 3 * S, rgb(C.bone), S * 2);
});
writeFileSync(OUT, img.png());
writeFileSync(KEY, JSON.stringify({ seed: SEED, scale: S, letters: Object.fromEntries(order.map((id, i) => [String.fromCharCode(65 + i), id])) }, null, 1));
console.log(`${OUT}: ${W}x${H} px; key ${KEY}: ${order.map((id, i) => `${String.fromCharCode(65 + i)}=${id}`).join(" ")}`);
