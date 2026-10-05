// Y1 (release Y, REQ-BFG-070, REQ-BFG-046; T/BRIEF-Y1.md): the twelve display changes, faces only, rules unchanged (the
// rules proofs are in T/output-y1/REPORT.md). Every number comes from sim data through the formatters (TEXT-STYLE 6.3).
import { describe, expect, it } from "vitest";
import { icons, stripIcons, textWidth } from "../src/render/font";
import { AMMO, DISRUPT_TIME, HEROES, ITEMS, type HeroId } from "../src/sim/content";
import { FURNACE_LONG_BELT } from "../src/sim/battle";
import { effectAt, pourAt } from "../src/sim/stars";
import { RUNES } from "../src/sim/runes";
import { SIM } from "../src/ui/abilityText";
import { FACE_SIM, coreStats, faceAt, faceLines, heroFace, NEXT_LINE_W } from "../src/ui/faces";
import { faceBlocks, PERK_INFO_ONLY } from "../src/screens/build/faceBlocks";
import { LADDER_SEP, ladderText, levelLines, levelText } from "../src/screens/build/levels";
import { fmtCount, fmtDmg, fmtPct, fmtSec } from "../src/ui/statFormat";
import { runeLine, runeAmountText } from "../src/ui/runeText";

const STARS = [1, 2, 3];
const line = (def: string, s: number, o = {}): string => stripIcons(faceLines(def, s, o)!.rules[0].text);
const ladders = (def: string, s: number, o = {}): string[] =>
  levelLines(def, s, o)!.flatMap((l) => (l.kind === "ladder" ? [ladderText(l.ladder)] : []));
const perks = (def: string, o = {}): string[] => levelLines(def, 1, o)!.filter((l) => l.kind === "perk").map((l) => levelText(l));
const ladder = (vals: string[]): string => vals.join(LADDER_SEP);
const S = (n: number): string => (n === 1 ? "" : "S");
/** Every face line of `def` at every star: one line of the op band (225 px). */
const fits = (def: string, o = {}) => {
  for (const s of STARS) for (const r of faceLines(def, s, o)!.rules) expect(textWidth(r.text), `${def} ★${s}`).toBeLessThanOrEqual(NEXT_LINE_W);
};

describe("Y1: faces only, rules unchanged", () => {
  it("1-2: GALVANIC COIL and FROSTBITE FOUNDRY say the parts a STUN hits on their line; no perk clause", () => {
    const g = STARS.map((s) => effectAt("coil", s).gate!), coilParts = g.map((x) => 1 + (x.jump ?? 0));
    expect(STARS.map((s) => line("coil", s))).toEqual(g.map((x, i) =>
      `HIT: STUN ${fmtSec(x.shockTime ?? DISRUPT_TIME)} ON ${fmtCount(coilParts[i])} PART${S(coilParts[i])}.`));
    expect(ladders("coil", 1)).toEqual([`{STUN} ${ladder(g.map((x) => fmtSec(x.shockTime ?? DISRUPT_TIME)))}`, `${ladder(coilParts.map(fmtCount))} PARTS`]);
    const r = STARS.map((s) => effectAt("frostbite", s).factory!.round as { seconds: number; spread?: number });
    const frostParts = r.map((x) => 1 + (x.spread ?? 0));
    expect(STARS.map((s) => line("frostbite", s))).toEqual(frostParts.map((n) => `ITS STUN HITS ${fmtCount(n)} PART${S(n)}.`));
    expect(ladders("frostbite", 1)).toEqual(expect.arrayContaining([`{STUN} ${ladder(r.map((x) => fmtSec(x.seconds)))}`, `${ladder(frostParts.map(fmtCount))} PARTS`]));
    for (const def of ["coil", "frostbite"]) for (const s of STARS) expect(faceLines(def, s)!.clause, `${def} ★${s}`).toBeUndefined();
    fits("coil");
    fits("frostbite");
  });

  it("3-5: HULLBREAKER, SALVO RACK and COMPOUND BREECH: one verb with its own amount, SHOT: in brass", () => {
    const c = (def: string, s: number) => effectAt(def, s).core!;
    expect(STARS.map((s) => line("hullbreaker", s))).toEqual(STARS.map((s) => `SHOT: HITS THE HULL FOR +${fmtPct(c("hullbreaker", s).hullMul! - 1)} .`));
    expect(STARS.map((s) => line("salvo", s))).toEqual(STARS.map((s) => `SHOT: FIRES THE CHAMBER AT +${fmtDmg(c("salvo", s).volleyFlat!)}  EACH.`));
    expect(STARS.map((s) => line("compound", s))).toEqual(STARS.map((s) =>
      `SHOT: FUSES ${fmtCount(FACE_SIM.compoundLoads)}  INTO ${fmtCount(FACE_SIM.compoundShells)} AT +${fmtPct(c("compound", s).mult! - 1)} .`));
    for (const def of ["hullbreaker", "salvo", "compound"]) {
      for (const s of STARS) expect(faceLines(def, s)!.rules[0].label, def).toBe("SHOT:");
      fits(def);
    }
    // the ladders are as before (their keys did not move)
    expect(ladders("hullbreaker", 1)).toEqual([`{DMG} ${ladder(STARS.map((s) => `+${fmtPct(c("hullbreaker", s).hullMul! - 1)}`))}`]);
    expect(ladders("salvo", 1)).toEqual([`{DMG} ${ladder(STARS.map((s) => `+${fmtDmg(c("salvo", s).volleyFlat!)}`))}`]);
  });

  it("6-7: MIMIC FORGE on FOUNDRY and TWIN MOULD show their pour as a {SLUG} stat; TWIN MOULD's line names no count", () => {
    const pour = (def: string, s: number, hero?: HeroId) => pourAt(def, s, hero ? HEROES[hero].ammo : undefined);
    expect(STARS.map((s) => faceAt("mimic", s, { hero: "foundry" })!.stats2!.find(([ic]) => ic === "SLUG")?.[1]))
      .toEqual(STARS.map((s) => fmtCount(Math.max(1, pour("mimic", s, "foundry")))));
    expect(ladders("mimic", 1, { hero: "foundry" })).toContain(`{SLUG} ${ladder(STARS.map((s) => fmtCount(Math.max(1, pour("mimic", s, "foundry")))))}`);
    for (const hero of ["furnace", "weaver", "bastion"] as HeroId[]) for (const s of STARS) {
      expect((faceAt("mimic", s, { hero })!.stats2 ?? []).some(([ic]) => ic === "SLUG"), `${hero} ★${s}`).toBe(false);
    }
    expect(STARS.map((s) => line("mimic", s, { hero: "foundry" }))).toEqual(STARS.map(() => "STAMPS YOUR HERO'S SLUGS."));
    expect(STARS.map((s) => faceAt("twinmould", s)!.stats2!.find(([ic]) => ic === "SLUG")?.[1])).toEqual(STARS.map((s) => fmtCount(pour("twinmould", s))));
    expect(ladders("twinmould", 1)).toContain(`{SLUG} ${ladder(STARS.map((s) => fmtCount(pour("twinmould", s))))}`);
    expect(STARS.map((s) => line("twinmould", s))).toEqual(STARS.map(() => "CASTS ITS  ONTO SEPARATE BELTS AT ONCE."));
    fits("twinmould");
  });

  it("8: FURNACE's hero face is two lines, each in the band; its blurb says line 2's words", () => {
    const f = heroFace("furnace")!;
    expect(f.rules.map((r) => stripIcons(r.text))).toEqual([
      `KILN SLUGS HAVE HEAT ${fmtDmg(AMMO[HEROES.furnace.ammo].rideScale!)}.`,
      `GUNS ON ${fmtCount(SIM.furnaceLongTiles)}+ TILE BELTS FIRE ${fmtPct(FURNACE_LONG_BELT / 100)} FASTER.`,
    ]);
    for (const r of f.rules) expect(textWidth(r.text)).toBeLessThanOrEqual(NEXT_LINE_W);
    expect(HEROES.furnace.blurb.join(" ")).toBe(`KILN SLUGS HEAT UP ON LONG BELTS. ${stripIcons(f.rules[1].text)}`);
  });

  it("9-10: TESLA ARC's arc damage is a stat; GATLING SPOOL's spin step is in its LEVELS", () => {
    expect(STARS.map((s) => coreStats("tesla", s))).toEqual(STARS.map((s) => [["DMG", fmtPct(effectAt("tesla", s).core!.share!)]]));
    expect(ladders("tesla", 1)).toContain(`{DMG} ${ladder(STARS.map((s) => fmtPct(effectAt("tesla", s).core!.share!)))}`);
    // every other core keeps no stat row
    for (const d of Object.values(ITEMS)) if (d.kind === "core" && d.id !== "tesla") expect(coreStats(d.id, 1), d.id).toEqual([]);
    const step = STARS.map((s) => `+${fmtPct(effectAt("gatling", s).core!.step!)}`);
    expect(ladders("gatling", 1)).toContain(`${ladder(step)} A QUICK SHOT`);
    for (const s of [1, 2]) {
      const nx = levelLines("gatling", s)!.find((l) => l.kind === "next")!;
      expect(levelText(nx)).toContain(`${step[s]} A QUICK SHOT`);
      expect(textWidth(icons(levelText(nx)))).toBeLessThanOrEqual(NEXT_LINE_W);
    }
  });

  it("11 (ruling R-1): a perk's name shows in the ⓘ LEVELS only, never on the face line", () => {
    expect(PERK_INFO_ONLY).toEqual(["coil", "frostbite", "mimic", "twinmould"]);
    for (const def of PERK_INFO_ONLY) for (const s of STARS) {
      const o = def === "mimic" ? { hero: "foundry" as HeroId } : {};
      const blocks = faceBlocks(def, s, o)!;
      expect(blocks.some((b) => !!b.perk || b.text.includes("★")), `${def} ★${s}`).toBe(false);
    }
    expect(perks("coil")).toEqual(["★2 SPARK JUMP"]);
    expect(perks("frostbite")).toEqual(["★2 HOARFROST"]);
    expect(perks("mimic", { hero: "foundry" })).toEqual(["★3 TWIN SIGNET"]);
    expect(perks("twinmould")).toEqual(["★3 THIRD SPRUE"]);
    // a piece outside the ruling keeps its perk's name after its line (PRESS ★2 HARDENED DIES)
    expect(faceBlocks("press", 2, {})!.some((b) => b.perk === "★2 HARDENED DIES")).toBe(true);
  });

  it("12: the START: label on the five live battle-start runes; the tokens and amounts kept", () => {
    const want: Record<string, string> = {
      rivet_hoard: "START: +{N} {*PLATE}.", grave_plates: "START: +{N} {*PLATE}.",
      loose_thread: "START: THE FOE HAS {N} {*FRAY}.", tangle_wire: "START: THE FOE HAS {N} {*FRAY}.",
      ash_kindle: "START: THE FOE HAS {N} {BURN}.",
    };
    for (const [id, text] of Object.entries(want)) {
      expect(RUNES[id].text, id).toBe(text);
      expect(runeLine(RUNES[id]), id).toContain(runeAmountText(RUNES[id]));
      expect(textWidth(runeLine(RUNES[id])), id).toBeLessThanOrEqual(223); // the phone's rune card
    }
    expect(RUNES.ward_stone.text).toBe("START: +{N} {*SHIELD}."); // the form they follow
  });
});
