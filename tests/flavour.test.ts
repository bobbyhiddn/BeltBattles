import { describe, expect, it } from "vitest";
import { ITEMS, buyableModules, classFactor } from "../src/sim/content"; // U2c (U2b's faces): classFactor
import { effectAt } from "../src/sim/stars";
import { startingTurrets } from "../src/sim/deck"; // U2c (U2b's faces): the WEAVER's class factor
import { faceLines } from "../src/ui/faces"; // U2c (U2b's faces)
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
  sabot: ["THE ENEMY SEES EACH ROUND COMING."], // NUM-3: SABOT has a face (U2b F2: never its desc; was the desc's sentence)
  whetstone: ["BEFORE A SPLITTER, BOTH COPIES GAIN IT."],
  splitter: ["ITS COPIES CAN BACK UP AT THE TURRET AND JAM IT."],
  beltcrate: ["LONGER ROUTES COOK HOTTER PAYLOADS."],
  // 0.6.2rel2: two of the 13 turrets keep a comparison their ability text can't make (checked below against the TurretDefs)
  rampart: ["A QUICKER HEAVY GUN WITH A SLOWER SHELL."],
  hailgun: ["THE FASTEST GUN, STAR FOR STAR."],
};
/** Everything the catalogue sells: the buyable modules, then each supply. */
const SOLD = [...buyableModules(), ...SUPPLIES];
/** The landscape details column's text widths (layout.ts: LAND_MIN_W to the capped column) and the phone band's. */
const WIDTHS: [number, "5" | "3"][] = [[102, "5"], [109, "5"], [116, "5"], [102, "3"], [109, "3"], [116, "3"], [151, "3"]];

describe("0.6.2t2 F1: the kept-flavour table", () => {
  it("has a row for every module and supply the catalogue sells (each has ability text), and for nothing else", () => {
    expect(SOLD.filter((d) => !hasAbilityText(d.id)).map((d) => d.id)).toEqual([]);
    expect(Object.keys(KEPT_FLAVOUR).sort()).toEqual(SOLD.map((d) => d.id).sort());
    // 0.6.2rel2 (the 0.6.2 candidate): 23 rigs, 13 factories, 13 cores, 9 gear, 13 turrets and 2 supplies
    // 0.8.0 I1 M2 (REPORT-P1 section 13): wave 3 is live: +8 rigs, +2 factories, +2 cores, +3 gear
    const byKind: Record<string, number> = {};
    for (const d of SOLD) byKind[d.kind] = (byKind[d.kind] ?? 0) + 1;
    expect(byKind).toEqual({ gate: 31, factory: 15, core: 15, mod: 12, turret: 13, supply: 2 });
  });

  it("0.6.2rel2: each turret's kept claim holds against the TurretDefs at every star (and FB-B's four keep nothing)", () => {
    const guns = SOLD.filter((d) => d.kind === "turret");
    const at = (id: string, s: number) => effectAt(id, s).turret!;
    // NUM-2 (REQ-BFG-047, EQUIVALENT): "fires more often" is the greater speed, shots per 30 s (its interval 30 / speed is
    // the shorter); was the shorter fireInterval (toBeLessThan)
    for (const s of STARS) {
      // RAMPART CANNON: the quickest heavy gun at its star, and the slowest shell of any gun
      const heavy = guns.filter((d) => d.id !== "rampart" && at(d.id, s).class === "heavy");
      expect(heavy.length, `★${s}`).toBe(4);
      for (const d of heavy) expect(at("rampart", s).speed, `★${s} ${d.id}`).toBeGreaterThan(at(d.id, s).speed);
      for (const d of guns.filter((x) => x.id !== "rampart")) expect(at("rampart", s).flight, `★${s} ${d.id}`).toBeGreaterThan(at(d.id, s).flight);
      // HAIL GUN: no gun at the same star fires as often
      for (const d of guns.filter((x) => x.id !== "hailgun")) expect(at("hailgun", s).speed, `★${s} ${d.id}`).toBeGreaterThan(at(d.id, s).speed);
    }
    // ...but not across stars: a ★3 DART GUN fires more often than a ★1 HAIL GUN, so the claim names the star (NUM-2: 68 > 67)
    expect(at("dartgun", 3).speed).toBeGreaterThan(at("hailgun", 1).speed);
    for (const id of ["quench", "surge", "hopper", "mantlet"]) expect(KEPT_FLAVOUR[id], id).toEqual([]);
  });

  it("pins: seven modules keep one sentence each, at every star and class factor; every other module shows none", () => {
    const counts = { moduleStars: 0, withFlavour: 0, sentences: 0 };
    for (const d of SOLD) for (const s of starsOf(d)) {
      counts.moduleStars++;
      for (const k of [1, 0.55]) expect(flavour(d.id, s, k), `${d.id} ★${s} k${k}`).toEqual(KEPT[d.id] ?? []);
      const n = sentencesOf(flavourText(d.id, s)).length;
      counts.sentences += n;
      if (n) counts.withFlavour++;
    }
    // before and after (the REPORT): 881b38f showed 243 flavour sentences, some flavour at all 176 module-stars; 0.6.2rel2
    // adds the 13 turrets' 39 module-stars, 6 of them with flavour (RAMPART CANNON and HAIL GUN). 0.8.0 I1 M2: wave 3's
    // 15 modules add 45 module-stars, none with flavour (was 215)
    expect(counts).toEqual({ moduleStars: 260, withFlavour: 19, sentences: 19 });
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
  // bb-0.8.3 (REQ-BFG-042 M4): 0.8.0's "a hero's signature factory shows its catalogue desc, joined into one string;
  // CLOCKWORKS its own, in T2's units": every signature factory has ability text now (it levels up), so like a sold
  // module's its flavour keeps only a tip with no number, or nothing (CLOCKWORKS: its peak is in its ability text)
  it("every hero's signature factory has ability text; its flavour is a tip with no number, or nothing", () => {
    const sigs = Object.values(ITEMS).filter((d) => d.kind === "factory" && !hasAbilityText(d.id));
    expect(sigs.map((d) => d.id)).toEqual([]);
    for (const def of ["kiln", "loom", "crucible", "wardworks", "clockworks", "sump"]) {
      expect(hasAbilityText(def), def).toBe(true);
      for (const t of flavour(def)) expect(t, def).not.toMatch(/\d/);
    }
    expect(flavour("clockworks")).toEqual([]);
    expect(flavour("no-such-module")).toEqual([]);
  });
});

describe("0b.1: LIMPET WORKS promises no stall at 1 star", () => {
  it("not in its catalogue desc nor its flavour (it keeps none); from ★2 its ability text names the stall", () => {
    expect(ITEMS.limpet.desc.join(" ")).toBe("STICKY CHARGES BLOW 3 SECONDS LATER FOR HULL DAMAGE.");
    expect(STARS.map((s) => flavourText("limpet", s))).toEqual(["", "", ""]);
    // NUM-3 step 2 (REQ-BFG-047, N1 2.2): the stall is - / 1 / 2 s, whole seconds (was - / 1 / 1.6); still none at ★1
    expect(STARS.map((s) => (effectAt("limpet", s).factory!.round as { stall?: number }).stall ?? 0)).toEqual([0, 1, 2]);
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
    // U2c (U2b's faces): the panel opens with the core's face rule at the WEAVER's class factor (its first starting
    // turret's, content.ts classFactor): "SHOT: +1.4 {DMG} FOR EACH LOAD WAITING." (faceLines); was the glossary's
    // sentence "SHOTS DEAL 1.4 MORE DAMAGE FOR EACH PAYLOAD WAITING, UP TO 5 PAYLOADS."
    const k = classFactor(effectAt(startingTurrets("weaver")[0].def, 1).turret!);
    expect(cp.body[0].text).toBe(faceLines("pressure", 2, { k })!.rules[0].text);
    expect(flav(cargoPanel(w, 22)!)).toEqual([]);
  });
});
