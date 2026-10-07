// TXT-096 (b)7 (REQ-BFG-070; REVIEW-Y7B2 section 7): levels.ts's "-" paths. A ladder shows "-" at a star where its number
// is not there yet (levels.ts ladders: a stat pair a lower star lacks, a rule key a lower star lacks, and the same in the
// no-shared-template path). No face of today's content reaches them (every stat and key is there at all three stars), but
// any face whose number starts at a later star would, so the paths stay; this reaches all three through levelLines, with
// one real face's ★1 number taken out (faceAt mocked for that one def and star; every other face is the real one).
import { describe, expect, it, vi } from "vitest";
import type { Face } from "../src/ui/faces";
import { levelLines, levelText } from "../src/screens/build/levels"; // vi.mock is hoisted: levels.ts reads the mocked faceAt

/** The face to cut: `def` at `stars` loses what `cut` takes out; none while def is "". */
const drop = vi.hoisted(() => ({ def: "", stars: 0, cut: (f: Face): Face => f }));
vi.mock("../src/ui/faces", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/ui/faces")>();
  return {
    ...real,
    faceAt: (def: string, stars = 1, o = {}) => {
      const f = real.faceAt(def, stars, o);
      return f && def === drop.def && stars === drop.stars ? drop.cut(f) : f;
    },
  };
});
/** The ⓘ LEVELS ladders of `def` at ★1, in text (the current star [marked]). */
const ladders = (def: string): string[] => levelLines(def, 1)!.filter((l) => l.kind === "ladder").map((l) => levelText(l));
/** The ladders with ★1's face cut by `cut`. */
function cutAt1(def: string, cut: (f: Face) => Face): string[] {
  Object.assign(drop, { def, stars: 1, cut });
  try { return ladders(def); } finally { Object.assign(drop, { def: "", stars: 0, cut: (f: Face) => f }); }
}

describe("TXT-096 (b)7: levels.ts's '-' (REQ-BFG-070)", () => {
  it("a stat pair ★1 lacks: STAMP PRESS's {DMG} reads [-] at ★1, its other stars as before", () => {
    const real = ladders("press").find((l) => l.startsWith("{DMG} "))!;
    expect(real).toMatch(/^\{DMG\} \[\d+\]\/\d+\/\d+$/);
    const cut = cutAt1("press", (f) => ({ ...f, stats: f.stats.filter(([ic]) => ic !== "DMG") }));
    expect(cut).toContain(real.replace(/\[\d+\]/, "[-]"));
  });

  it("a rule key ★1 lacks, on a shared template: TEMPER's {BURN} ladder reads [-] at ★1", () => {
    const real = ladders("temper").find((l) => l.startsWith("{BURN} "))!;
    expect(real).toMatch(/^\{BURN\} \[\+\d+\]\/\+\d+\/\+\d+$/);
    const cut = cutAt1("temper", (f) => ({ ...f, nums: f.nums.filter(([k]) => k !== "burn") }));
    expect(cut).toContain(real.replace(/\[\+\d+\]/, "[-]"));
  });

  it("a rule key ★1 lacks, with no shared template: ASSEMBLY LINE's SOONER / AT ONCE ladder reads [-] at ★1", () => {
    const real = ladders("assembly").find((l) => l.includes("AT ONCE"))!;
    expect(real).toBe("[50% SOONER]/75% SOONER/AT ONCE");
    const cut = cutAt1("assembly", (f) => ({ ...f, nums: f.nums.filter(([k]) => k !== "soon") }));
    expect(cut).toContain("[-]/75% SOONER/AT ONCE");
  });
});
