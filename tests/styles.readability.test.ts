// CUSTOM-1 (REQ-BFG-072): the readability test's palette-pair half, on the design study's mock catalogue
// (src/render/styles.ts). One test covers every style of the three surfaces: belt direction (chevron contrast against
// the belt and the floor, and apart from the speed and state colours), tile edges (seam contrast), stat numbers (text
// contrast on the panel) and keyword colours (each against each panel style). Thresholds: src/render/styleContrast.ts
// THRESHOLDS (no style may read worse than today's default; WCAG floors where today clears them). The rendered-pixel
// half (sampling the drawn sprites) is scripts/stylecheck.mjs (CUSTOM-2b): the same checks on the pixels CUSTOMIZE draws
// in the built page, against these THRESHOLDS (tools/styleRefs.ts).
// CUSTOM-3 (REQ-BFG-074): the carrier styles join it: smoke at 50% and fire at 25% against each style's hull fill, the
// board plate's ink rim against it, and "yours" (each style's fill against every faction's default fill, CIE76 delta E),
// on every faction a carrier can belong to. The rendered half reads the same four off CUSTOMIZE's preview carrier.
import { describe, expect, it } from "vitest";
import { BELTS, CARRIERS, DEFAULT_SKIN, FLOORS, PANELS } from "../src/render/styles";
import {
  CARRIER_FACTIONS, KEYWORD_COLOURS, THRESHOLDS, TODAY_CLOSEST_DEFAULTS, carrierContrasts, carrierFill, chevronContrast,
  chevronOnFloors, contrast, edgeContrast, floorTones as floorTonesOf, keywordContrast, keywordMin, numberContrast,
  reportAll, separation, stateSeparation, yoursDistance,
} from "../src/render/styleContrast";
import { C, FACTION } from "../src/render/palette";
import { readFileSync } from "node:fs";
import { SCENE_GROUND, SCENE_THRESHOLDS, TODAY_SEAS, sceneChecks, sceneRows } from "../src/render/sceneContrast"; // FIELD-1
import { SCENE_IDS, displayRng } from "../src/render/motion";
import { LANDS, SEAS, isSea } from "../src/render/backdrop";
import { installRaster, type RasterCanvas } from "./raster.helpers";

describe("CUSTOM-1 style readability (palette pairs)", () => {
  it("the metric: WCAG contrast and CIE76 separation behave", () => {
    expect(contrast(C.white, C.white)).toBeCloseTo(1, 6);
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 6);
    expect(separation(C.red, C.red)).toBe(0);
    expect(separation(C.yellow, C.ice)).toBeGreaterThan(20);
  });

  it("the catalogue: the default plus at least 3 styles per surface, each locked one saying how to earn it", () => {
    for (const [list, def] of [[FLOORS, DEFAULT_SKIN.floor], [BELTS, DEFAULT_SKIN.belt], [PANELS, DEFAULT_SKIN.panel], [CARRIERS, DEFAULT_SKIN.carrier]] as const) {
      expect(list[0].id).toBe(def);
      expect(list.length).toBeGreaterThanOrEqual(4);
      expect(new Set(list.map((s) => s.id)).size).toBe(list.length);
      for (const s of list.slice(1)) {
        // docs/TEXT-STYLE.md: capitals only; drawn as "LOCKED: <HOW>." on one 3x5 line of the CUSTOMIZE row
        expect(s.how).toMatch(/^[A-Z0-9][A-Z0-9 '-]*[A-Z0-9]$/);
        expect(`LOCKED: ${s.how}.`.length).toBeLessThanOrEqual(44);
        expect(s.counter).toBeTruthy();
        expect(s.need).toBeGreaterThan(0);
      }
      expect(list.filter((s) => s.long).length).toBeGreaterThanOrEqual(1);
      expect(list.filter((s) => s.long).length).toBeLessThanOrEqual(2);
    }
  });

  it("tile edges: every floor's weakest seam is no weaker than today's weakest faction deck", () => {
    for (const f of FLOORS) expect(edgeContrast(f), f.id).toBeGreaterThanOrEqual(THRESHOLDS.edge - 1e-9);
  });

  it("belt direction: every belt's chevrons read on their bed and on every floor at least as well as today's", () => {
    for (const b of BELTS) {
      expect(chevronContrast(b), b.id).toBeGreaterThanOrEqual(THRESHOLDS.chevron - 1e-9);
      expect(chevronOnFloors(b), b.id).toBeGreaterThanOrEqual(THRESHOLDS.chevronOnFloor - 1e-9);
    }
    // and no new floor makes today's iron chevrons harder to read than today's decks do
    for (const f of FLOORS) {
      const m = Math.min(...floorTonesOf(f).map((t) => contrast(BELTS[0].chev[1], t[1])));
      expect(m, f.id).toBeGreaterThanOrEqual(THRESHOLDS.chevronOnFloor - 1e-9);
    }
  });

  it("belt state: no belt style borrows the fast, OVERDRIVE or slow chevrons, or the warn or dead rails", () => {
    for (const b of BELTS) {
      const s = stateSeparation(b);
      expect(s.chev, `${b.id} chevrons`).toBeGreaterThanOrEqual(THRESHOLDS.state);
      expect(s.rails, `${b.id} rails`).toBeGreaterThanOrEqual(THRESHOLDS.state);
    }
  });

  it("stat numbers and keyword colours: each against each panel style", () => {
    for (const p of PANELS) {
      expect(numberContrast(p), p.id).toBeGreaterThanOrEqual(THRESHOLDS.number);
      for (const [n, c] of KEYWORD_COLOURS) {
        expect(contrast(c, p.fill), `${p.id}: ${n}`).toBeGreaterThanOrEqual(keywordMin(c) - 1e-9);
        expect(contrast(c, p.fill), `${p.id}: ${n}`).toBeGreaterThanOrEqual(THRESHOLDS.keyword);
      }
      expect(keywordContrast(p).min).toBeGreaterThanOrEqual(THRESHOLDS.keyword);
    }
  });

  it("CUSTOM-3 carriers: smoke, fire and the plate's edge read on every style's fill, on every faction, as well as on today's", () => {
    // the thresholds are today's four default carriers' weakest values
    expect(THRESHOLDS.carrierSmoke).toBeCloseTo(Math.min(...CARRIER_FACTIONS.map((f) => carrierContrasts(FACTION[f].hull2).smoke)), 9);
    expect(THRESHOLDS.carrierSmoke).toBeGreaterThan(1.1); // WEAVER's verdigris, 1.11
    expect(THRESHOLDS.carrierFire).toBeGreaterThan(4.2); // WEAVER's verdigris against yellow, 4.29
    expect(THRESHOLDS.plateEdge).toBeGreaterThan(1.9); // BASTION's granite, 1.91
    for (const s of CARRIERS) for (const f of CARRIER_FACTIONS) {
      const v = carrierContrasts(carrierFill(s, f));
      expect(v.smoke, `${s.id} ${f} smoke`).toBeGreaterThanOrEqual(THRESHOLDS.carrierSmoke - 1e-9);
      expect(v.fire, `${s.id} ${f} fire`).toBeGreaterThanOrEqual(THRESHOLDS.carrierFire - 1e-9);
      expect(v.edge, `${s.id} ${f} plate edge`).toBeGreaterThanOrEqual(THRESHOLDS.plateEdge - 1e-9);
    }
  });

  it("CUSTOM-3 carriers: \"yours\": every style's paint is delta E 20 or more from every faction's default, past today's closest pair", () => {
    expect(TODAY_CLOSEST_DEFAULTS).toBeGreaterThan(19);
    expect(TODAY_CLOSEST_DEFAULTS).toBeLessThan(THRESHOLDS.yours); // blued steel and granite, 19.8
    for (const s of CARRIERS.slice(1)) {
      expect(s.paint, s.id).toBeTruthy();
      for (const f of CARRIER_FACTIONS) expect(separation(s.paint![2], FACTION[f].hull2), `${s.id} vs ${f}`).toBeGreaterThanOrEqual(THRESHOLDS.yours);
      expect(yoursDistance(s).value, s.id).toBeGreaterThanOrEqual(THRESHOLDS.yours);
    }
    // and the styles stand apart from each other (a contact sheet of five different ships)
    for (const a of CARRIERS.slice(1)) for (const b of CARRIERS.slice(1)) if (a.id < b.id) expect(separation(a.paint![2], b.paint![2]), `${a.id} vs ${b.id}`).toBeGreaterThanOrEqual(19);
    // the default is today's hull: no paint of its own
    expect(CARRIERS[0].paint).toBeUndefined();
  });

  it("prints the matrix (evidence for the report)", () => {
    const r2 = (v: number) => Math.round(v * 100) / 100;
    const T = Object.fromEntries(Object.entries(THRESHOLDS).map(([k, v]) => [k, r2(v)]));
    console.log(`THRESHOLDS ${JSON.stringify(T)}`);
    for (const r of reportAll()) console.log(`${r.surface}.${r.id}: ${r.rows.map((x) => `${x.name} ${r2(x.value)}${x.pass ? "" : " FAIL"}`).join(", ")}`);
    for (const b of BELTS) console.log(`belt.${b.id} crest on each floor: ${FLOORS.map((f) => `${f.id} ${r2(Math.min(...floorTonesOf(f).map((t) => contrast(b.chev[1], t[1]))))}`).join(", ")}`);
    for (const p of PANELS) console.log(`panel.${p.id} keywords: ${KEYWORD_COLOURS.map(([n, c]) => `${n} ${r2(contrast(c, p.fill))}`).join(", ")}`);
  });

  it("the report rows all pass (what the catalogue sheet prints)", () => {
    const bad = reportAll().flatMap((r) => r.rows.filter((x) => !x.pass).map((x) => `${r.surface}.${r.id} ${x.name} ${x.value} < ${x.min}`));
    expect(bad).toEqual([]);
  });

  it("cosmetic only: the style modules import no sim value and nothing under src/net or src/core", () => {
    for (const f of ["../src/render/styles.ts", "../src/render/styleContrast.ts"]) {
      const src = readFileSync(new URL(f, import.meta.url), "utf8");
      const imports = [...src.matchAll(/^import\s+(type\s+)?[^;]*from\s+"([^"]+)"/gm)];
      for (const m of imports) {
        if (/\/sim\//.test(m[2])) expect(m[1], `${f}: ${m[2]}`).toBeTruthy();
        expect(m[2], f).not.toMatch(/\/(net|core)\//);
      }
    }
  });
});

// FIELD-1 (REQ-BFG-075): the battle settings join the readability test (src/render/sceneContrast.ts). For every setting,
// against the colours that cover its ground: the board plate's ink rim (WCAG), each carrier style's hull and each
// faction's default hull, the foes (CIE76 delta E), the damage smoke at 50% and fire at 25% (WCAG). The thresholds are
// today's weakest over the three seas (the hulls: over today's four default carriers), as CUSTOM-3 set its carrier
// thresholds: no setting reads worse than a battle reads now. The rendered half reads the drawn battle at WIDE in each
// setting (scripts/stylecheck.mjs).
describe("FIELD-1 the battle settings' readability (REQ-BFG-075)", () => {
  installRaster();
  it("the thresholds are today's weakest over the seas: plate edge 1.00 (EMBER SEA), hull 13.89 (FOUNDRY on OPEN SEA), smoke 2.62 and fire 10.12 (OPEN SEA)", () => {
    const T = SCENE_THRESHOLDS;
    expect([T.edge, T.hull, T.smoke, T.fire].map((v) => Math.round(v * 100) / 100)).toEqual([1, 13.89, 2.62, 10.12]);
    for (const s of TODAY_SEAS) {
      const k = sceneChecks(s);
      expect(k.edge, s).toBeGreaterThanOrEqual(T.edge - 1e-9);
      for (const v of Object.values(k.factions)) expect(v, s).toBeGreaterThanOrEqual(T.hull - 1e-9);
    }
  });

  it("every setting: the plate edge, the five carrier styles, the four factions' defaults, smoke and fire, at or above today's weakest", () => {
    const rows = sceneRows();
    expect(rows.length).toBe(SCENE_IDS.length * 12);
    const r2 = (v: number) => (Math.round(v * 100) / 100).toFixed(2);
    console.log(rows.map((r) => `${r.pass ? "PASS" : "MISS"} ${r.scene} | ${r.check} | ${r2(r.value)} | ${r2(r.min)}`).join("\n"));
    expect(rows.filter((r) => !r.pass).map((r) => `${r.scene} ${r.check} ${r.value} < ${r.min}`)).toEqual([]);
  });

  it("the ground colours are the far layer's: each land setting's far layer is at least 90% those colours (and the seas' only base, deep and swell)", () => {
    const W = 293, H = 633;
    for (const s of SCENE_IDS) {
      if (isSea(s)) {
        expect(SCENE_GROUND[s]).toEqual([SEAS[s].base, SEAS[s].deep, SEAS[s].swell]);
        continue;
      }
      const far = LANDS[s].build(W, H, displayRng(12345), new Uint8Array(H)).layers[0] as unknown as RasterCanvas;
      const G = new Set(SCENE_GROUND[s].map((c) => c.toUpperCase()));
      const n = far.px.filter((p) => p !== null && G.has(p.toUpperCase())).length;
      console.log(`${s}: ${((100 * n) / far.px.length).toFixed(1)}% of the far layer in its ground colours`);
      expect(n / far.px.length, s).toBeGreaterThanOrEqual(0.9);
    }
  });
});
