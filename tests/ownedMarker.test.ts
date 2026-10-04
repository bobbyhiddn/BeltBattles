import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fresh, G, installRaster } from "./raster.helpers";
import { C } from "../src/render/palette";
import { textWidth } from "../src/render/font";
import { CARD_W } from "../src/screens/build/layout";
import { drawBadge, drawOwnedMarker, OWNED_MARK_H, OWNED_MARK_W } from "../src/screens/build/shop";

// U2f (REQ-BFG-070, REQ-BFG-046; the operator: "The items don't need to say 1 more to merge."): the shop, warlord-pick and
// event cards' "wait" badge (run.ts shopBadge: a copy you own that won't merge yet) was the grey label `+1 ★2`, a copy count.
// It is now the wordless owned marker: two overlapped squares in dim slates on the ⓘ glyph's 5x7 ink square, in the badge's
// corner. These checks pin what it draws (its own pixels), that MERGE ★n and MAX still draw their labels, and that no source
// line draws a `+1 ★` count.

installRaster();

/** The pixels a draw paints on a clear 40x12 canvas, as [x, y, colour]. */
function painted(draw: (g: CanvasRenderingContext2D) => void): [number, number, string][] {
  const c = fresh(40, 12);
  draw(G(c));
  const out: [number, number, string][] = [];
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const p = c.at(x, y); if (p) out.push([x, y, p]); }
  return out;
}

describe("U2f: the owned marker (drawBadge \"wait\")", () => {
  it("is wordless: only its 5x7 corner square, in ink and two dim slates (two overlapped squares), no glyph of text", () => {
    const px = painted((g) => drawBadge(g, 2, 3, CARD_W - 8, { kind: "wait" }, 0));
    // its pixels are drawOwnedMarker's, at the badge's corner
    expect(px).toEqual(painted((g) => drawOwnedMarker(g, 2, 3)));
    for (const [x, y] of px) {
      expect(x >= 2 && x < 2 + OWNED_MARK_W, `x ${x}`).toBe(true);
      expect(y >= 3 && y < 3 + OWNED_MARK_H, `y ${y}`).toBe(true);
    }
    expect(OWNED_MARK_W).toBe(5);
    expect(OWNED_MARK_H).toBe(7);
    expect(new Set(px.map((p) => p[2]))).toEqual(new Set([C.ink, C.slate3, C.slate4]));
    // the two squares: the one behind (slate3) and the one in front over its corner (slate4), each 2x2 drawn, 1 px apart
    const behind = px.filter((p) => p[2] === C.slate3).map(([x, y]) => `${x - 2},${y - 3}`);
    const front = px.filter((p) => p[2] === C.slate4).map(([x, y]) => `${x - 2},${y - 3}`);
    expect(front.sort()).toEqual(["2,3", "2,4", "3,3", "3,4"]);
    expect(behind.sort()).toEqual(["1,2", "1,3", "2,2"]); // its fourth pixel lies under the front copy
    // narrower than the old label's box (textWidth("+1 ★2") + 4): no text is drawn
    expect(OWNED_MARK_W).toBeLessThan(textWidth("+1 ★2", "3") + 4);
  });

  it("MERGE ★2, MERGE ★3 and MAX still draw their labels (unchanged)", () => {
    for (const badge of [{ kind: "merge", toStars: 2 }, { kind: "merge", toStars: 3 }, { kind: "max" }] as const) {
      const px = painted((g) => drawBadge(g, 1, 2, CARD_W - 8, badge, 0));
      const label = badge.kind === "merge" ? `MERGE ★${badge.toStars}` : "MAX";
      const xs = px.map((p) => p[0]);
      expect(Math.max(...xs) - Math.min(...xs) + 1, label).toBe(textWidth(label, "3") + 4);
      expect(px.some((p) => p[2] === C.ink), label).toBe(true);
    }
  });

  it("no source line draws a copy count on a badge (`+1 ★`)", () => {
    const root = fileURLToPath(new URL("../src", import.meta.url));
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith(".ts")) files.push(p); } };
    walk(root);
    for (const f of files) {
      readFileSync(f, "utf8").split("\n").forEach((ln, i) => {
        const code = ln.trim();
        if (code.startsWith("//") || code.startsWith("*") || code.startsWith("/*")) return; // comments may name the old badge
        expect(/["'`]\+1 ★/.test(code), `${f}:${i + 1}: ${code}`).toBe(false);
      });
    }
  });
});
