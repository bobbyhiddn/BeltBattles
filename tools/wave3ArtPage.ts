// Dev page entry (tools/wave3-art.html, 0.8.0 A1 M3): ?view=sheet (default) draws the wave-3 art contact sheet at 1x and
// scales it by ?s=1 or ?s=3 (nearest-neighbour); ?view=phone draws the phone view (two decks holding every wave-3 part at
// the build screen's integer scale on a 390x844 phone, dpr 3, in device pixels). ?tag= labels it. Not in the game build.

import { C } from "../src/render/palette";
import { makeCanvas, rect } from "../src/render/pixel";
import { drawText } from "../src/render/font";
import { PHONE_PW, PHONE_SCALE, SHEET_H, SHEET_W, drawSheet, phoneDecks } from "./wave3ArtSheet";

const q = new URLSearchParams(location.search);
const tag = (q.get("tag") ?? "").toUpperCase();
const out = document.getElementById("sheet") as HTMLCanvasElement;
const og = out.getContext("2d")!;
if (q.get("view") === "phone") {
  // the phone's logical width at the build screen's scale (167 px at 7): each deck is cropped to it, around its hull, and
  // everything (labels included) is drawn at 1 logical px, then scaled by the integer factor, as the game draws
  const [a, b] = phoneDecks();
  const s = PHONE_SCALE;
  const LW = Math.floor(PHONE_PW / s);
  const lines = [
    `PHONE 390X844, DPR 3: SCALE ${s}`,
    "FOUNDRY: TWIN MOULD, PLATE ROLLER, TWIN",
    "GAUGE, PINCER, TWIN LATCH; TWIN TRIGGER",
    "AND SEAM WELDER ON GUN 1, ANVIL ON GUN 2",
  ];
  const lines2 = ["BASTION: ARMOR PRESS (2 STARS), BRACE", "FRAME, STOKER, PLATE BREAKER, SHIELD", "WALL; SPALL CATCHER AND STEAM BREECH"];
  const LH = 6;
  const H = 4 + lines.length * LH + a.height + 4 + lines2.length * LH + b.height + 4;
  const [lc, lg] = makeCanvas(LW, H);
  rect(lg, 0, 0, LW, H, C.ink);
  let y = 2;
  lines.forEach((t, i) => { drawText(lg, t, 2, y, i ? C.bone : C.yellow, { font: "3" }); y += LH; });
  const dx = Math.round((LW - a.width) / 2);
  lg.drawImage(a, dx, y);
  y += a.height + 4;
  lines2.forEach((t) => { drawText(lg, t, 2, y, C.bone, { font: "3" }); y += LH; });
  lg.drawImage(b, dx, y);
  out.width = LW * s;
  out.height = H * s;
  og.imageSmoothingEnabled = false;
  og.drawImage(lc, 0, 0, LW * s, H * s);
  void tag;
} else {
  const s = Math.max(1, Math.min(4, Math.floor(Number(q.get("s") ?? "1")) || 1));
  const [sheet, g] = makeCanvas(SHEET_W, SHEET_H);
  drawSheet(g, tag);
  out.width = SHEET_W * s;
  out.height = SHEET_H * s;
  og.imageSmoothingEnabled = false;
  og.drawImage(sheet, 0, 0, SHEET_W * s, SHEET_H * s);
}
(window as unknown as { __sheetDone: boolean }).__sheetDone = true;
