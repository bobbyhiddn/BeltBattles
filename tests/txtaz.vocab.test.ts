// TXT-AZ item 3 (REQ-BFG-070; REVIEW-TXT096 Q5; comments only in src): abilityText.ts's VOCABULARY header, read against the
// code. Each number the header quotes is read here from the constant or the def it names, so a change to one turns this red
// until the header says the new value; and the header's claims about the words (STALL in no sentence, HARASSMENT retired,
// MACHINE the PART row's alias, only a STUN counts) are checked against the sentences, the glossary and the STUN causes.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BURN_DPS, BURN_TIME, DISRUPT_TIME, FRAY_BONUS, FRAY_MAX, ITEMS, JAM_THRESHOLD, STUN_CAUSES, WINDOW_TIME, rateMul,
} from "../src/sim/content";
import { PLATE_CAP } from "../src/sim/races/bastion";
import { SYNC_WINDOW } from "../src/sim/races/foundry";
import { effectAt, fusible } from "../src/sim/stars";
import { SIM, abilityText, hasAbilityText } from "../src/ui/abilityText";
import { glossaryEntry } from "../src/ui/glossary";

const ROOT = new URL("..", import.meta.url).pathname;
const src = readFileSync(join(ROOT, "src/ui/abilityText.ts"), "utf8");
const LABELS = ["DAMAGE", "BURN", "SHOCK", "STALL", "MACHINE", "STUN", "FRAY", "SPEED", "COPIES", "LOADS", "FIRE RATE", "HARASSMENT", "MARKS", "PLATING", "PAIR", "MATCHED", "WORKS FASTER"];
/** The header's rows: a row starts on a line "//   LABEL ..." and runs on over the lines indented under it. */
const rows = (() => {
  const at = src.indexOf("// THE VOCABULARY."), end = src.indexOf("// UNITS", at);
  expect([at > 0, end > at]).toEqual([true, true]);
  const out = new Map<string, string>();
  let cur: string | null = null;
  for (const l of src.slice(at, end).split("\n")) {
    const lab = LABELS.find((w) => l.startsWith(`//   ${w} `));
    if (lab) {
      cur = lab;
      out.set(lab, l.slice(5 + lab.length).trim());
    } else if (cur && /^\/\/ {4,}\S/.test(l)) out.set(cur, `${out.get(cur)} ${l.replace(/^\/\/\s+/, "")}`);
    else cur = null;
  }
  return out;
})();
const row = (w: string): string => {
  expect(rows.get(w), `${w}'s row`).toBeDefined();
  return rows.get(w)!;
};

describe("TXT-AZ item 3: abilityText.ts's VOCABULARY header says what the code does (REQ-BFG-070)", () => {
  it("every row is there, once", () => {
    expect([...rows.keys()]).toEqual(LABELS);
  });

  it("its numbers are the constants' and the defs' (BURN_DPS, BURN_TIME, DISRUPT_TIME, the shockTimes, FRAY, SAP, PLATE_CAP, the rate %, WINDOW_TIME, JAM_THRESHOLD, SYNC_WINDOW)", () => {
    expect(row("BURN")).toContain(`BURN_DPS (${BURN_DPS}) damage a second`);
    expect(row("BURN")).toContain(`BURN_TIME (${BURN_TIME} seconds;`);
    expect(row("SHOCK")).toContain(`DISRUPT_TIME (${DISRUPT_TIME} seconds since NUM-3`);
    const coil = [2, 3].map((s) => effectAt("coil", s).gate!.shockTime);
    const spark = [2, 3].map((s) => effectAt("hotswap", s).factory!.cycle!.find((p) => p.tint === "spark")!.shockTime);
    expect(effectAt("coil", 1).gate!.shockTime).toBeUndefined(); // star 1: DISRUPT_TIME
    expect(row("SHOCK")).toContain(`GALVANIC COIL ${coil[0]} and ${coil[1]} seconds at 2 and 3 stars, HOT SWAP's SPARK slugs ${spark[0]} and ${spark[1]})`);
    expect(row("FRAY")).toContain(`FRAY_BONUS (${FRAY_BONUS}) more damage, up to FRAY_MAX (${FRAY_MAX}) fray`);
    expect(row("MARKS")).toContain(`SIM.sap: ${SIM.sap} less damage`);
    expect(row("PLATING")).toContain(`PLATE_CAP (${PLATE_CAP};`);
    const cal = ITEMS.calibrate.mod!.fireRate!; // CALIBRATION's +33%, the row's example
    expect(row("FIRE RATE")).toContain(`"THE TURRET FIRES ${cal}% FASTER"`);
    expect(row("FIRE RATE")).toContain(`rateMul(${cal}) is ${rateMul(cal)}`);
    expect(row("LOADS")).toContain(`WINDOW_TIME, ${WINDOW_TIME} seconds`);
    expect(row("LOADS")).toContain(`A turret with ${JAM_THRESHOLD} payloads backed up at its intakes JAMS`);
    expect(row("PAIR")).toContain(`within ${SYNC_WINDOW} seconds (SYNC_WINDOW)`);
  });

  it("its words: STALL in no sentence, HARASSMENT retired, MACHINE the PART row's alias, only a STUN counts", () => {
    const said: string[] = [];
    for (const d of Object.values(ITEMS)) if (hasAbilityText(d.id)) for (const s of fusible(d.id) ? [1, 2, 3] : [1]) said.push(...abilityText(d.id, s).sentences);
    expect(said.length).toBeGreaterThan(300);
    expect(said.filter((t) => /\bSTALL(S|ED|ING)?\b/.test(t))).toEqual([]);
    expect(said.filter((t) => /\bHARASS/.test(t))).toEqual([]);
    expect(said.some((t) => /\bMACHINES?\b/.test(t))).toBe(true);
    expect(row("STALL")).toContain("no sentence says it");
    expect(glossaryEntry("HARASSMENT")).toBeUndefined();
    expect(row("HARASSMENT")).toContain("no face or sentence says it");
    expect([glossaryEntry("MACHINE")?.word, glossaryEntry("MACHINES")?.word]).toEqual(["PART", "PART"]);
    expect(row("MACHINE")).toContain("never the hull");
    expect(STUN_CAUSES).toContain("shock");
    for (const c of ["wreck", "rip", "sap"] as const) expect(STUN_CAUSES, c).not.toContain(c);
    expect(row("HARASSMENT")).toContain("only a STUN (STUN_CAUSES) spends a TOLLBOOTH toll or counts for an enemy SCRAPPER");
  });
});
