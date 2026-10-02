// 0.8.0 H1 M6 (REQ-BFG-026): SC-TOOL --fights' cross-hero rows, winrate-pairing-band and winrate-hero-average, from
// synthetic day files: each pairing's first-hero win rate (draws half, as parseDetail scores them), each hero's mean
// over its pairings, the F/W-only column, and a day file made before 0.8.0 (no points) giving no rows.
import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assemble } from "../tools/scorecard/fights";
import type { Target } from "../tools/scorecard/targets";

const TARGETS: Target[] = [
  { id: "winrate-pairing-band", area: "balance", value: [0.35, 0.65], unit: "win rate" },
  { id: "winrate-hero-average", area: "balance", value: [0.45, 0.55], unit: "win rate" },
];

function dayFile(day: number, pairs: { key: string; pts?: number; n?: number }[]) {
  return {
    day, k: 2, seeds: 1, standinSeeds: 1, label: "t", heroes: ["furnace", "weaver", "foundry"], seconds: 1, battles: 1,
    standins: [{ hero: "furnace", cost: 0, served: 1, captains: ["X"], vs: { furnace: { pts: 1, n: 2 }, weaver: { pts: 1, n: 2 }, foundry: { pts: 1, n: 2 } }, t: [20], pairs: [{ hero: "furnace", m: 0, med: 20 }] }],
    pairs: pairs.map((p) => ({ key: p.key, t: [20, 22], pairs: [{ a: 0, b: 1, med: 21 }], ...(p.pts !== undefined ? { pts: p.pts, n: p.n } : {}) })),
  };
}

const made: string[] = [];
const scratch = (): string => {
  const d = mkdtempSync(join(tmpdir(), "sc-winrate-"));
  made.push(d);
  return d;
};
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

describe("SC-TOOL --fights: the cross-hero win-rate rows (0.8.0 H1 M6)", () => {
  it("each pairing's first-hero rate, each hero's average over its pairings, and the F/W column", () => {
    const out = scratch();
    writeFileSync(join(out, "sc-fights-d1.json"), JSON.stringify(dayFile(1, [
      { key: "furnace-furnace", pts: 4, n: 8 }, { key: "furnace-weaver", pts: 4, n: 8 }, { key: "furnace-foundry", pts: 2, n: 8 },
      { key: "weaver-foundry", pts: 3, n: 8 },
    ])));
    const r = assemble(TARGETS, out);
    const band = r.rows.find((x) => x.id === "winrate-pairing-band")!;
    const avg = r.rows.find((x) => x.id === "winrate-hero-average")!;
    expect(band.measured).toEqual({ min: 0.25, max: 0.5 }); // the mirror is left out
    expect(band.verdict).toBe("MISS");
    expect(band.detail).toEqual([
      { day: 1, h1: "furnace", h2: "weaver", rate: 0.5, n: 8 }, { day: 1, h1: "furnace", h2: "foundry", rate: 0.25, n: 8 },
      { day: 1, h1: "weaver", h2: "foundry", rate: 0.375, n: 8 },
    ]);
    // FOUNDRY: 0.75 vs FURNACE, 0.625 vs WEAVER; FURNACE: 0.5 and 0.25; WEAVER: 0.5 and 0.375
    expect(avg.detail).toEqual([
      { day: 1, hero: "furnace", all: 0.375, fw: 0.5 }, { day: 1, hero: "weaver", all: 0.4375, fw: 0.5 },
      { day: 1, hero: "foundry", all: 0.6875, fw: 0.6875 },
    ]);
    expect(avg.verdict).toBe("MISS");
    expect(r.sections.some((s) => s.title.startsWith("Win rates per hero pairing"))).toBe(true);
  });

  it("a day file made before the win rates were kept gives no win-rate rows", () => {
    const out = scratch();
    writeFileSync(join(out, "sc-fights-d1.json"), JSON.stringify(dayFile(1, [{ key: "furnace-weaver" }])));
    const r = assemble(TARGETS, out);
    expect(r.rows.map((x) => x.id)).not.toContain("winrate-pairing-band");
    expect(r.rows.map((x) => x.id)).toContain("fight-length-median");
  });
});
