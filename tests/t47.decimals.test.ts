// T47 (REQ-BFG-047, whole numbers only). The operator, 2026-10-04: "decimal numbers are a recipe for cognitive load. We
// should be using rounded numbers. Percentages are fine". No text that BELTS (bb-0.8.3) added or rewrote shows a decimal:
// the hero's two upgrade lines, the six signature factories' bodies, gists and cards at every FACTORY level, and the
// GANTRY PRESS's gist, next star and MERGES WITH. A speed-up is said as FASTER, because only the turret's first step is a
// whole percentage. Texts where 0.8.4 already showed the decimal (the bought factories' next-star lines, TWIN MOULD, the
// heroes' ability lines, the CRUCIBLE's blank, window and fusion) keep their numbers until the numbers release.
// UI only: no number of the sim moves (the fingerprint stays identical).
import { describe, expect, it } from "vitest";
import { SIGNATURE_FACTORIES } from "../src/sim/stars";
import { abilityText, cardText, gist, mergesWithText, nextStarText } from "../src/ui/abilityText";
import { factoryNext, levelLine, turretNext, turretSpeedRow, upgradeLabel } from "../src/ui/upgradeText";

const DECIMAL = /\d\.\d/;
const LEVELS = [1, 2, 3, 4];

describe("T47: no decimal in the texts BELTS added (REQ-BFG-047)", () => {
  it("the six signature factories are the ones T47 rewrote", () => {
    expect([...SIGNATURE_FACTORIES].sort()).toEqual(["clockworks", "crucible", "kiln", "loom", "sump", "wardworks"]);
  });

  it("the upgrade lines: the price, the level, the factory's next belts and FASTER", () => {
    const lines: string[] = [];
    for (const l of LEVELS) {
      lines.push(upgradeLabel(l) ?? "", levelLine("factory", l), levelLine("turret", l));
      for (const every of [1, 1.25, 0.45, 0.72, 2.2]) lines.push(turretSpeedRow(every, l), turretNext(every, l) ?? "");
      for (const def of SIGNATURE_FACTORIES) lines.push(factoryNext(def, l) ?? "");
    }
    for (const t of lines) expect(t).not.toMatch(DECIMAL);
    expect(lines.filter((t) => t.includes("FASTER")).length).toBeGreaterThan(0);
  });

  it("the signature factories' bodies, gists and cards at every FACTORY level", () => {
    for (const def of SIGNATURE_FACTORIES) {
      expect(cardText(def), def).not.toMatch(DECIMAL);
      for (const l of LEVELS) {
        const s = abilityText(def, l).sentences;
        // the CRUCIBLE's blank, window and fusion lines are 0.8.4's; the numbers release re-expresses them
        for (const t of def === "crucible" ? s.slice(0, 1) : s) expect(t, `${def} L${l}`).not.toMatch(DECIMAL);
        expect(gist(def, l), `${def} L${l}`).not.toMatch(DECIMAL);
      }
    }
  });

  it("the GANTRY PRESS: its gist at every star, its next star and MERGES WITH into ★2", () => {
    for (const s of [1, 2, 3]) expect(gist("gantry", s), `★${s}`).not.toMatch(DECIMAL);
    expect(nextStarText("gantry", 1)).not.toMatch(DECIMAL);
    expect(mergesWithText("gantry", 2)).not.toMatch(DECIMAL);
  });
});
