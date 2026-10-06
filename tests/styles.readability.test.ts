// CUSTOM-1 (REQ-BFG-072): the readability test's palette-pair half, on the design study's mock catalogue
// (src/render/styles.ts). One test covers every style of the three surfaces: belt direction (chevron contrast against
// the belt and the floor, and apart from the speed and state colours), tile edges (seam contrast), stat numbers (text
// contrast on the panel) and keyword colours (each against each panel style). Thresholds: src/render/styleContrast.ts
// THRESHOLDS (no style may read worse than today's default; WCAG floors where today clears them). The rendered-pixel
// half (sampling the drawn sprites) is CUSTOM-2's (REPORT section 6).
import { describe, expect, it } from "vitest";
import { BELTS, DEFAULT_SKIN, FLOORS, PANELS } from "../src/render/styles";
import {
  KEYWORD_COLOURS, THRESHOLDS, chevronContrast, chevronOnFloors, contrast, edgeContrast, floorTones as floorTonesOf,
  keywordContrast, keywordMin, numberContrast, reportAll, separation, stateSeparation,
} from "../src/render/styleContrast";
import { C } from "../src/render/palette";
import { readFileSync } from "node:fs";

describe("CUSTOM-1 style readability (palette pairs)", () => {
  it("the metric: WCAG contrast and CIE76 separation behave", () => {
    expect(contrast(C.white, C.white)).toBeCloseTo(1, 6);
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 6);
    expect(separation(C.red, C.red)).toBe(0);
    expect(separation(C.yellow, C.ice)).toBeGreaterThan(20);
  });

  it("the catalogue: the default plus at least 3 styles per surface, each locked one saying how to earn it", () => {
    for (const [list, def] of [[FLOORS, DEFAULT_SKIN.floor], [BELTS, DEFAULT_SKIN.belt], [PANELS, DEFAULT_SKIN.panel]] as const) {
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
