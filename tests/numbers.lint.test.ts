// NUM-4 (REQ-BFG-047; N1 2.5 "numbers.lint"): the guard. No toFixed, n1( or n2( in player-text code (src/ui, src/screens,
// src/game, src/render), outside the allow-list below (debug and non-player text, each with its reason); and no digit in a
// face string: every digit on a face comes from a formatter record (statFormat.ts captureFormats), never from a template.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ITEMS, withSustain } from "../src/sim/content";
import { fusible } from "../src/sim/stars";
import { faceLines, hasFace } from "../src/ui/faces";
import { captureFormats } from "../src/ui/statFormat";

const DIRS = ["src/ui", "src/screens", "src/game", "src/render"];
/** file:what, each with its reason. */
const ALLOW: Record<string, string> = {
  // the layout metrics battle.ts hands the shot harness (window.bb), never drawn: gap.css and gap.share
  "src/screens/battle.ts:toFixed": "the shot harness's layout metrics (scripts/metrics.mjs), not player text",
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
  });
}

describe("numbers.lint (NUM-4): no decimal formatting in player-text code", () => {
  it("no toFixed, n1( or n2( in src/ui, src/screens, src/game and src/render (outside the allow-list)", () => {
    const bad: string[] = [];
    let scanned = 0;
    for (const f of DIRS.flatMap(files)) {
      scanned++;
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, "");
        for (const [what, re] of [["toFixed", /\.toFixed\(/], ["n1", /\bn1\(/], ["n2", /\bn2\(/]] as const) {
          if (re.test(code) && !ALLOW[`${f}:${what}`]) bad.push(`${f}:${i + 1}: ${what}: ${line.trim()}`);
        }
      });
    }
    expect(bad).toEqual([]);
    expect(scanned).toBeGreaterThan(50);
  });

  it("the allow-list holds only what is there (a removed site leaves the list)", () => {
    for (const key of Object.keys(ALLOW)) {
      const [f, what] = key.split(":");
      expect(readFileSync(f, "utf8").includes(`.${what}(`), key).toBe(true);
    }
  });

  it("no digit in a face string: every digit on every face at every star is a formatter's", () => {
    let faces = 0;
    withSustain(() => {
      for (const d of Object.values(ITEMS)) {
        if (!hasFace(d.id)) continue;
        for (const s of fusible(d.id) ? [1, 2, 3] : [1]) {
          const { value: fl, records } = captureFormats(() => faceLines(d.id, s, d.kind === "core" ? { k: 1 } : d.id === "mimic" ? { hero: "furnace" } : {})!);
          const printed = records.map((r) => r.printed).sort((a, b) => b.length - a.length);
          for (const t of [fl.stats, fl.stats2, ...fl.rules.map((r) => r.text), fl.clause?.text, ...(fl.caveats ?? [])]) {
            if (!t) continue;
            let rest = t.replace(/★\d/g, ""); // a star badge names a star, not a number
            for (const p of printed) rest = rest.split(p).join("");
            expect(/\d/.test(rest), `${d.id} ★${s}: "${t}"`).toBe(false);
          }
          faces++;
        }
      }
    });
    expect(faces).toBeGreaterThan(150);
  });
});
