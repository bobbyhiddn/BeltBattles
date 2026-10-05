import { describe, expect, it } from "vitest";
import { ITEMS } from "../src/sim/content";
import { secPer } from "../src/sim/content"; // NUM-2 (REQ-BFG-047): SPEED (30 / speed)
import { effectAt, FUSE_MAX, fusible } from "../src/sim/stars";
import { scaleCore } from "../src/sim/cores";
import { CURRENT_COLOUR, LADDER_SEP, ladderText, levelLines, levelSpans, levelText, nextBlocks, type LevelLine } from "../src/screens/build/levels";
import { faceNext, hasFace, NEXT_LINE_W } from "../src/ui/faces";
import { faceNextBlock } from "../src/screens/build/faceBlocks";
import { fmtCount, fmtDmg, fmtPct, fmtSpeed } from "../src/ui/statFormat";
import { nextStarText, newPerk, type TextOpts } from "../src/ui/abilityText";
import { lineWidth, wrapRich } from "../src/ui/richText";
import { textWidth } from "../src/render/font";
import { GLOSSARY_WRAP_W } from "../src/ui/glossary";

// U2e step 5 (REQ-BFG-070; the operator: "follow the batomon pattern by having an info button that shows more information
// about further levels"): the ⓘ view's LEVELS (src/screens/build/levels.ts). Every expected number comes from the sim's
// value at that star through the formatter the face prints it with (U2a's registry), never a pasted number.

const OPTS: TextOpts[] = [{ k: 1, hero: "furnace" }, { k: 0.55, hero: "weaver" }];
const ladders = (ls: readonly LevelLine[]) => ls.filter((l): l is Extract<LevelLine, { kind: "ladder" }> => l.kind === "ladder").map((l) => l.ladder);
/** The copy counts merge progress said (U2e step 1: none anywhere). */
const COPIES = /TO MERGE|MORE COP(Y|IES)|NEEDS \d MORE/;

describe("U2e step 5: the ⓘ view's LEVELS", () => {
  it("TEMPER: one ladder for its BURN, the current star marked, then NEXT★ (a rig's rule number)", () => {
    const burn = [1, 2, 3].map((s) => `+${fmtCount(effectAt("temper", s).gate!.burn!)}`);
    for (const s of [1, 2, 3]) {
      const ls = levelLines("temper", s)!;
      expect(ladders(ls)).toEqual([{ lead: "{BURN} ", values: burn, tail: "", current: s - 1 }]);
      // in text the current star's value is [marked]; the view draws it yellow, the others in the base colour
      expect(levelText(ls[0])).toBe(`{BURN} ${burn.map((v, i) => (i === s - 1 ? `[${v}]` : v)).join(LADDER_SEP)}`);
      const spans = levelSpans(ls[0]);
      expect(spans.filter((sp) => sp.c === CURRENT_COLOUR).map((sp) => sp.t)).toEqual([burn[s - 1]]);
      const nx = ls.find((l) => l.kind === "next");
      if (s < FUSE_MAX) expect(nx && levelText(nx)).toBe(faceNext("temper", s)!.text);
      else expect(nx).toBeUndefined(); // the top star: nothing to merge into
    }
  });

  it("a turret (SCRAP CANNON): its stat row's numbers that change, SEC after its numbers", () => {
    const t = (s: number) => effectAt("scrapcannon", s).turret!;
    const ls = ladders(levelLines("scrapcannon", 2)!);
    const sec = [1, 2, 3].map((s) => fmtSpeed(secPer(t(s).speed))); // NUM-2 (REQ-BFG-047): 30 / speed (was fireInterval)
    expect(ls[0]).toEqual({ lead: "", values: sec, tail: "{SEC}", current: 1 });
    expect(ladderText(ls[0])).toBe(`${sec.join(LADDER_SEP)}{SEC}`);
    // every ladder is a number that changes with the stars
    for (const l of ls) expect(new Set(l.values).size, ladderText(l)).toBeGreaterThan(1);
  });

  it("a core at the hero's class factor (PRESSURE BREECH, k 0.55) and a factory's second stat row (HOT SWAP's BURN)", () => {
    const per = [1, 2, 3].map((s) => `+${fmtDmg(scaleCore(effectAt("pressure", s).core!, 0.55).perQueued!)}`);
    expect(ladders(levelLines("pressure", 1, { k: 0.55 })!)).toContainEqual({ lead: "{DMG} ", values: per, tail: "", current: 0 });
    const burn = [1, 2, 3].map((s) => fmtCount(effectAt("hotswap", s).factory!.cycle!.find((p) => p.tint === "ember")!.burn!));
    expect(ladders(levelLines("hotswap", 3)!)).toContainEqual({ lead: "{BURN} ", values: burn, tail: "", current: 2 });
    // a number a star brings that the one before lacks reads "-" there (HOT SWAP's SPARK JUMP parts)
    expect(ladders(levelLines("hotswap", 1)!).some((l) => l.values[0] === "-")).toBe(true);
    // SPLITTER's share, a percentage through fmtPct
    const cut = [1, 2, 3].map((s) => fmtPct(effectAt("splitter", s).gate!.split!.mult));
    expect(ladders(levelLines("splitter", 2)!)).toContainEqual({ lead: "{DMG} ", values: cut, tail: "", current: 1 });
  });

  it("each star's perk: its interim clause where it has one, else its name, once", () => {
    const coil = levelLines("coil", 1)!.filter((l) => l.kind === "perk").map((l) => levelText(l));
    expect(coil).toEqual(["★2 SPARK JUMP: {*STUN} HITS 2 PARTS."]); // ★3 keeps SPARK JUMP: it adds nothing new
    const split = levelLines("splitter", 1)!.filter((l) => l.kind === "perk").map((l) => levelText(l));
    expect(split).toEqual(["★2 CLEAN CUT", "★3 PERFECT CUT"]);
  });

  it("a RULES piece shows its legacy next-star sentence; a piece without stars has no LEVELS", () => {
    for (const def of ["assembly", "frostbite", "sabot"]) {
      expect(hasFace(def)).toBe(false);
      const ls = levelLines(def, 1)!;
      expect(ladders(ls), def).toEqual([]);
      const nx = ls.find((l) => l.kind === "next")!;
      const perk = newPerk(def, 2);
      expect(levelText(nx), def).toBe(`${nextStarText(def, 1)}${perk ? ` ★2 ${perk}` : ""}`);
    }
    for (const def of ["kiln", "loom", "crucible", "wardworks", "beltcrate", "plating"]) if (ITEMS[def]) expect(levelLines(def, 1), def).toBeNull();
  });

  it("every fusible piece at every star and k: no copy count; NEXT★ is the face's (one source with nextLine) and fits one line", () => {
    let lines = 0, next = 0;
    for (const def of Object.keys(ITEMS).filter(fusible)) for (const o of OPTS) for (const s of [1, 2, 3]) {
      const ls = levelLines(def, s, o)!;
      for (const l of ls) {
        lines++;
        expect(levelText(l), `${def} ★${s}`).not.toMatch(COPIES);
        // U2e step 5: the NEXT★ fit check moves onto the ⓘ view's lines (never weakened): a face's NEXT★ line, its perk
        // name included, and every ladder is one line of 5x7 within NEXT_LINE_W
        if (l.kind === "ladder" || (l.kind === "next" && hasFace(def))) {
          expect(lineWidth(levelSpans(l), "5"), `${def} ★${s}: ${levelText(l)}`).toBeLessThanOrEqual(NEXT_LINE_W);
        }
      }
      const nb = nextBlocks(def, s, o)[0], fn = hasFace(def) ? faceNextBlock(def, s, o) : null;
      if (fn) expect(nb).toEqual(fn);
      if (nb) next++;
    }
    expect(NEXT_LINE_W).toBe(GLOSSARY_WRAP_W);
    expect(next).toBe(2 * OPTS.length * Object.keys(ITEMS).filter(fusible).length);
    expect(lines).toBeGreaterThan(next);
  });

  it("every LEVELS line fits the view's width on the op view (225 px) and the desk's column (118 px): wrapped, never cut", () => {
    for (const def of Object.keys(ITEMS).filter(fusible)) for (const s of [1, 2, 3]) {
      for (const l of levelLines(def, s)!) for (const w of [225, 118]) {
        for (const ln of wrapRich(levelSpans(l), w, "5")) expect(lineWidth(ln, "5"), `${def} ★${s} at ${w}: ${levelText(l)}`).toBeLessThanOrEqual(w);
      }
    }
    expect(textWidth("NEXT ★2:")).toBeLessThan(118);
  });
});
