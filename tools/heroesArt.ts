// Dev page entry (tools/heroes-art.html): draws the FOUNDRY/BASTION art contact sheet at 1x and scales it by ?s=1
// (default) or ?s=3 with nearest-neighbour sampling; ?tag= labels it (BEFORE / AFTER). Not part of the game build.

import { makeCanvas } from "../src/render/pixel";
import { SHEET_H, SHEET_W, drawSheet } from "./heroesArtSheet";

const q = new URLSearchParams(location.search);
const s = Math.max(1, Math.min(4, Math.floor(Number(q.get("s") ?? "1")) || 1));
const [sheet, g] = makeCanvas(SHEET_W, SHEET_H);
drawSheet(g, (q.get("tag") ?? "").toUpperCase());
const out = document.getElementById("sheet") as HTMLCanvasElement;
out.width = SHEET_W * s;
out.height = SHEET_H * s;
const og = out.getContext("2d")!;
og.imageSmoothingEnabled = false;
og.drawImage(sheet, 0, 0, SHEET_W * s, SHEET_H * s);
(window as unknown as { __sheetDone: boolean }).__sheetDone = true;
