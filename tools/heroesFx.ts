// Dev page entry (tools/heroes-fx.html, 0.8.0 H1 M3): draws the FOUNDRY/BASTION signature-visuals sheet at 1x and scales
// it by ?s=1 (default) or ?s=3 with nearest-neighbour sampling; ?tag= labels it. Not part of the game build.

import { makeCanvas } from "../src/render/pixel";
import { FX_H, FX_W, drawFxSheet } from "./heroesFxSheet";

const q = new URLSearchParams(location.search);
const s = Math.max(1, Math.min(4, Math.floor(Number(q.get("s") ?? "1")) || 1));
const [sheet, g] = makeCanvas(FX_W, FX_H);
drawFxSheet(g, (q.get("tag") ?? "").toUpperCase());
const out = document.getElementById("sheet") as HTMLCanvasElement;
out.width = FX_W * s;
out.height = FX_H * s;
const og = out.getContext("2d")!;
og.imageSmoothingEnabled = false;
og.drawImage(sheet, 0, 0, FX_W * s, FX_H * s);
(window as unknown as { __sheetDone: boolean }).__sheetDone = true;
