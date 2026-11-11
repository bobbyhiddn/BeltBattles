// ARTB-CODE-1 (REQ-BFG-126, REQ-BFG-127), item D: art direction B's data in the repo. tools/artb/artb-slice.json is the art lane's file; tools/artb/gen.mjs writes
// src/render/artBData.ts from it; `node tools/artb/gen.mjs --check` says whether the two agree. New art later = replace the JSON, run the generator, re-measure the pins:
// every assertion below reads the data, none types a pixel, a digest or a pixel count of a sprite.
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { C } from "../src/render/palette";
import { ART_B_LEGEND, ART_B_SHA256, ART_B_SPRITES, ART_B_WORK } from "../src/render/artBData";

// (paths are the repo root's, where vitest runs; the repo's node shims declare no node:url)
const JSON_FILE = "tools/artb/artb-slice.json";
const GEN = "tools/artb/gen.mjs";
const bytes = readFileSync(JSON_FILE);
const data = JSON.parse(readFileSync(JSON_FILE, "utf8")) as {
  legend: Record<string, string>;
  legendHex: Record<string, string>;
  sprites: Record<string, { w: number; h: number; rows: string[] }>;
  work: Record<string, { work?: [number, number, string][][]; idle?: [number, number, string][][]; flash?: [number, number, string][] }>;
};

/** The brief's list: the sprites the slice holds, with their sizes. */
const RIGS = ["embertrough", "nailstrip", "grease", "ballast", "rasp", "bellows", "sparkgap", "staticbrush", "barbed", "venom"];
const SHAPED = ["embertrough", "nailstrip"];
const EXPECT: Record<string, [number, number]> = {
  ...Object.fromEntries(RIGS.map((id) => [`card/${id}`, [24, 24]])),
  ...Object.fromEntries(RIGS.map((id) => [`board/${id}`, [12, 12]])),
  ...Object.fromEntries(SHAPED.map((id) => [`body/${id}`, [24, 12]])),
  kiln: [24, 24],
  "icon/kiln": [12, 12],
  "portrait/furnace": [32, 32],
};

describe("ARTB-CODE-1 D: the data in the repo and its generator", () => {
  it("node tools/artb/gen.mjs --check exits 0: src/render/artBData.ts is what the JSON generates, and its header names the JSON's sha256", async () => {
    const r = await new Promise<{ code: number | null; out: string }>((resolve, reject) => {
      const p = spawn("node", [GEN, "--check"]);
      let out = "";
      p.stdout?.on("data", (c) => { out += new TextDecoder().decode(c); });
      p.on("exit", (code) => resolve({ code, out }));
      p.on("error", reject);
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain("is what artb-slice.json");
    expect(ART_B_SHA256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(readFileSync("src/render/artBData.ts", "utf8").split("\n")[0]).toContain(ART_B_SHA256);
  });

  it("the generated constants are the JSON's legend, sprites and work, entry for entry", () => {
    expect(ART_B_LEGEND).toEqual(data.legend);
    expect(ART_B_SPRITES).toEqual(data.sprites);
    expect(ART_B_WORK).toEqual(data.work);
  });

  it("every legend name is a key of the palette C and its hex equals legendHex (a mismatch = the art was drawn on another colour: STOP AND ASK)", () => {
    const pal = C as Record<string, string>;
    expect(Object.keys(data.legend).sort()).toEqual(Object.keys(data.legendHex).sort());
    for (const [ch, name] of Object.entries(data.legend)) {
      expect(pal[name], `legend '${ch}' -> ${name}: a key of C`).toBeDefined();
      expect(pal[name].toUpperCase(), `legend '${ch}' -> ${name}: C's hex = legendHex`).toBe(data.legendHex[ch].toUpperCase());
    }
  });

  it("every sprite's rows fit its w and h and use only legend characters (or '.')", () => {
    for (const [name, s] of Object.entries(data.sprites)) {
      expect(s.rows.length, `${name}: ${s.h} rows`).toBe(s.h);
      for (const r of s.rows) {
        expect(r.length, `${name}: a row of ${s.w}`).toBe(s.w);
        for (const ch of r) expect(ch === "." || data.legend[ch] !== undefined, `${name}: '${ch}' is in the legend`).toBe(true);
      }
    }
  });

  it("every working-state pixel lies inside its sprite and uses a legend character (or '.' to clear)", () => {
    for (const [name, w] of Object.entries(data.work)) {
      const s = data.sprites[name];
      expect(s, `work entry ${name} names a sprite`).toBeDefined();
      const lists = [...(w.work ?? []), ...(w.idle ?? []), ...(w.flash ? [w.flash] : [])];
      for (const l of lists) for (const [x, y, ch] of l) {
        expect(x >= 0 && y >= 0 && x < s.w && y < s.h, `${name}: pixel ${x},${y} is inside ${s.w}x${s.h}`).toBe(true);
        expect(ch === "." || data.legend[ch] !== undefined, `${name}: '${ch}' is in the legend`).toBe(true);
      }
    }
  });

  it("the sprite list is exactly the brief's: ten cards (24x24), ten boards (12x12), two bodies (24x12), kiln (24x24), icon/kiln (12x12), portrait/furnace (32x32)", () => {
    expect(Object.keys(data.sprites).sort()).toEqual(Object.keys(EXPECT).sort());
    for (const [name, [w, h]] of Object.entries(EXPECT)) expect([data.sprites[name].w, data.sprites[name].h], name).toEqual([w, h]);
  });

  it("the working-state entries have the brief's shape: a rig two work phases; a body two work phases (and two idle phases if any); KILN four idle phases (the first is the plain sprite) and a flash", () => {
    for (const [name, w] of Object.entries(data.work)) {
      if (name.startsWith("board/")) { expect(Object.keys(w), name).toEqual(["work"]); expect(w.work!.length, name).toBe(2); }
      else if (name.startsWith("body/")) { expect(w.work!.length, name).toBe(2); if (w.idle) { expect(w.idle.length, name).toBe(2); expect(w.idle[0], `${name}: idle phase 0 is the plain sprite`).toEqual([]); } }
      else if (name === "kiln") { expect(w.idle!.length).toBe(4); expect(w.idle![0], "kiln: idle phase 0 is the plain sprite").toEqual([]); expect(w.flash!.length).toBeGreaterThan(0); }
      else throw new Error(`a work entry for ${name}, which the brief does not name`);
    }
    // a work entry only for a board, a body or kiln: no card, no icon, no portrait (they hold still)
    expect(Object.keys(data.work).every((n) => n.startsWith("board/") || n.startsWith("body/") || n === "kiln")).toBe(true);
  });
});
