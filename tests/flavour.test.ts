import { describe, expect, it } from "vitest";
import { ITEMS, buyableModules } from "../src/sim/content";
import { effectAt } from "../src/sim/stars";
import { newRun } from "../src/game/run";
import { KEPT_FLAVOUR, flavour, flavourText } from "../src/screens/build/flavour";
import { cargoPanel, itemPanel, rigPanel, type PanelText } from "../src/screens/build/inspector";
import { abilityText, hasAbilityText } from "../src/ui/abilityText";
import { textWidth } from "../src/render/font";
import { wrapText } from "../src/ui/richText";
import { STARS, SUPPLIES, banned, numbers, sentencesOf, starsOf } from "./textRules";

// 0.6.2p (item 1): star-aware flavour. 0.6.2t (REQ-BFG-032, T7): flavour is player text too: whole sentences with T2's
// units, wrapped by the one helper at draw time. 0.6.2t2 (F1): the flavour adds something or shows nothing:
// src/screens/build/flavour.ts KEPT_FLAVOUR keeps only what a module's ability sentences don't say (a tip, an
// interaction, a consequence or a line of character, trimmed to that part); every other flavour sentence restated the
// effect or quoted its numbers, and is gone. The table is pinned here; the guard over every panel (no flavour sentence
// quotes the ability text's numbers or repeats one of its sentences) is in tests/abilityPanels.test.ts.

/** The kept table, pinned: the modules that keep a flavour sentence (the same at every star and class factor). */
const KEPT: Record<string, string[]> = {
  press: ["NEEDS A FREE TURRET INTAKE."],
  sabot: ["TELEGRAPHED ROUNDS WRECK RIGS OR STALL OTHER MACHINERY."],
  whetstone: ["BEFORE A SPLITTER, BOTH COPIES GAIN IT."],
  splitter: ["ITS COPIES CAN BACK UP AT THE TURRET AND JAM IT."],
  beltcrate: ["LONGER ROUTES COOK HOTTER PAYLOADS."],
};
/** Everything the catalogue sells: the buyable modules, then each supply. */
const SOLD = [...buyableModules(), ...SUPPLIES];
/** The landscape details column's text widths (layout.ts: LAND_MIN_W to the capped column) and the phone band's. */
const WIDTHS: [number, "5" | "3"][] = [[102, "5"], [109, "5"], [116, "5"], [102, "3"], [109, "3"], [116, "3"], [151, "3"]];

describe("0.6.2t2 F1: the kept-flavour table", () => {
  it("has a row for every module and supply the catalogue sells (each has ability text), and for nothing else", () => {
    expect(SOLD.filter((d) => !hasAbilityText(d.id)).map((d) => d.id)).toEqual([]);
    expect(Object.keys(KEPT_FLAVOUR).sort()).toEqual(SOLD.map((d) => d.id).sort());
  });

  it("pins: five modules keep one sentence each, at every star and class factor; every other module shows none", () => {
    const counts = { moduleStars: 0, withFlavour: 0, sentences: 0 };
    for (const d of SOLD) for (const s of starsOf(d)) {
      counts.moduleStars++;
      for (const k of [1, 0.55]) expect(flavour(d.id, s, k), `${d.id} ★${s} k${k}`).toEqual(KEPT[d.id] ?? []);
      const n = sentencesOf(flavourText(d.id, s)).length;
      counts.sentences += n;
      if (n) counts.withFlavour++;
    }
    // before and after (the REPORT): 881b38f showed 243 flavour sentences, some flavour at all 176 module-stars
    expect(counts).toEqual({ moduleStars: 176, withFlavour: 13, sentences: 13 });
  });

  it("a kept sentence is one whole sentence under T2's rules and quotes no number", () => {
    for (const [def, kept] of Object.entries(KEPT_FLAVOUR)) for (const sentence of kept) {
      expect(sentence, def).toMatch(/^[A-Z][A-Z'-]* [A-Z0-9 ,'-]*[A-Z]\.$/);
      expect(sentencesOf(sentence), def).toEqual([sentence]);
      expect(banned(sentence), `${def}: ${sentence}`).toEqual([]);
      expect(numbers(sentence), `${def}: ${sentence}`).toEqual([]);
    }
  });

  it("the one wrap helper breaks every kept paragraph to each panel width: no line wider than the width", () => {
    for (const d of SOLD) for (const [w, font] of WIDTHS) {
      for (const line of wrapText(flavourText(d.id), w, font)) {
        expect(textWidth(line, font), `${d.id} at ${w} px (${font}): ${line}`).toBeLessThanOrEqual(w);
      }
    }
  });
});

describe("0.6.2t2: a module without ability text keeps its only description", () => {
  it("a hero's signature factory shows its catalogue desc, joined into one string; CLOCKWORKS its own, in T2's units", () => {
    const sigs = Object.values(ITEMS).filter((d) => d.kind === "factory" && !hasAbilityText(d.id));
    expect(sigs.map((d) => d.id)).toEqual(expect.arrayContaining(["kiln", "loom", "clockworks"]));
    for (const d of sigs.filter((x) => x.id !== "clockworks")) expect(flavour(d.id, 1), d.id).toEqual([d.desc.join(" ")]);
    expect(flavour("clockworks")[0]).toBe("STAMPS PENDULUM SLUGS.");
    expect(flavour("clockworks")[1]).toMatch(/^THEY PEAK AFTER \d+(\.\d+)? SECONDS OF RIDE: \d+ TILES\.$/);
    expect(flavour("no-such-module")).toEqual([]);
  });
});

describe("0b.1: LIMPET WORKS promises no stall at 1 star", () => {
  it("not in its catalogue desc nor its flavour (it keeps none); from ★2 its ability text names the stall", () => {
    expect(ITEMS.limpet.desc.join(" ")).toBe("STICKY CHARGES BLOW 3 SECONDS LATER FOR HULL DAMAGE.");
    expect(STARS.map((s) => flavourText("limpet", s))).toEqual(["", "", ""]);
    expect(STARS.map((s) => (effectAt("limpet", s).factory!.round as { stall?: number }).stall ?? 0)).toEqual([0, 1, 1.6]);
    expect(abilityText("limpet", 1).sentences.join(" ")).not.toMatch(/STALL/);
    expect(abilityText("limpet", 2).sentences).toContain("THE BLAST ALSO STALLS THE MACHINE THE CHARGE STUCK TO FOR 1 SECOND.");
  });
});

describe("0.6.2t: the panels show the kept flavour, set apart and dimmer; a module that keeps none shows no flavour block", () => {
  const flav = (t: PanelText) => t.body.filter((b) => b.role === "flavour").map((b) => b.text);

  it("a placed ★3 SPLITTER's rig panel: its kept consequence, and 85% never 60% (0.6.2p's case)", () => {
    const run = newRun("furnace", 5, "flavour");
    run.build.items.push({ uid: 10, def: "splitter", x: 3, y: 3, rot: 1, stars: 3 });
    const rp = rigPanel(run, 10)!;
    expect(flav(rp)).toEqual(["ITS COPIES CAN BACK UP AT THE TURRET AND JAM IT."]);
    expect(rp.body.map((b) => b.text).join(" ")).not.toContain("60%");
  });

  it("a placed ★2 STAMP PRESS keeps its tip; a ★2 SLAG POT, a WEAVER's ★2 PRESSURE BREECH and a ★3 HOPPER show none", () => {
    const run = newRun("furnace", 5, "flavour");
    run.build.items.push({ uid: 19, def: "press", x: 6, y: 6, stars: 2 }, { uid: 20, def: "slagpot", x: 2, y: 6, stars: 2 });
    expect(flav(itemPanel(run, 19)!)).toEqual(["NEEDS A FREE TURRET INTAKE."]);
    expect(flav(itemPanel(run, 20)!)).toEqual([]);
    const w = newRun("weaver", 5, "flavour");
    w.inventory.push({ uid: 21, def: "pressure", stars: 2 }, { uid: 22, def: "hopper", stars: 3 });
    const cp = cargoPanel(w, 21)!;
    expect(flav(cp)).toEqual([]);
    expect(cp.body[0].text).toBe("SHOTS DEAL 1.4 MORE DAMAGE FOR EACH PAYLOAD WAITING, UP TO 5 PAYLOADS.");
    expect(flav(cargoPanel(w, 22)!)).toEqual([]);
  });
});
