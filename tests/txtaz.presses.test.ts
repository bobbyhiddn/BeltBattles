// TXT-AZ item 2 (REQ-BFG-070; REVIEW-TXT096 Q3, face rule 1; text only, rules bb-0.9.7 unchanged): ARMOR PRESS's and MEND
// PRESS's faces lead with their condition in ASSEMBLY LINE's words, FEEDS A GUN (this replaces cap's answer 5 to SUS-A, which
// kept the belt rule off both faces). The condition is read from the sim side, so a change to it turns this red: battle.ts
// makeSide starts a press's plating or HEAL timer only when one of its belts reaches a gun, so a press whose belt stops short
// of every gun, or that has no belt, gives nothing; fed, it presses or heals every `every` s. Each face is one line of 5x7
// inside the op band (225 px) at every star, its EVERY label still in brass.
import { describe, expect, it } from "vitest";
import { Battle } from "../src/sim/battle";
import { HEROES, ITEMS } from "../src/sim/content";
import { cloneBuild, type Build } from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { effectAt } from "../src/sim/stars";
import { icons, textWidth } from "../src/render/font";
import { PERK_COLOUR } from "../src/ui/richText";
import { faceAt, NEXT_LINE_W, ruleSpans } from "../src/ui/faces";
import { fmtDmg, fmtSec } from "../src/ui/statFormat";

const STARS = [1, 2, 3];
const FOE = heroStartBuild("weaver");
type Feed = "fed" | "short" | "none";
/** FURNACE's start with its Kiln swapped for `def` (★s): its belt into gun 0 ("fed"), cut to its first 2 tiles so it reaches
 *  no gun ("short"), or gone ("none"). */
function pressed(def: string, s: number, feed: Feed): Build {
  const b = cloneBuild(heroStartBuild("furnace"));
  const f = b.items.find((p) => p.def === HEROES[b.hero].factory)!;
  f.def = def;
  if (s > 1) f.stars = s;
  if (feed === "short") b.routes = b.routes.map((r) => (r.factory === f.uid ? { ...r, cells: r.cells.slice(0, 2) } : r));
  if (feed === "none") b.routes = b.routes.filter((r) => r.factory !== f.uid);
  return b;
}
/** What the press gives side 0 in `secs` s of a battle: its timer at the start, its timer's turns (a plating press or a
 *  HEAL each), its HEAL events and the plating side 0 gains (FURNACE's start has no other plating source). */
function gives(def: string, s: number, feed: Feed, secs = 10): { timer: number | undefined; presses: number; heals: number; plate: number } {
  const bt = new Battle(pressed(def, s, feed), FOE, 3);
  const side = bt.sides[0], f = side.factories.find((x) => x.def.id === def)!;
  side.hull.hp -= 1000; // room for a HEAL
  const tm = (): number | undefined => (def === "armorpress" ? f.plateTimer : f.healTimer);
  const timer = tm();
  let presses = 0, heals = 0, plate = 0;
  for (let i = 0; i < secs * 60; i++) {
    const was = tm() ?? 0, p0 = side.plate.plate;
    bt.step();
    for (const e of bt.drainEvents()) if (e.type === "heal" && e.source === "mendpress" && e.side === 0) heals++;
    if ((tm() ?? 0) > was) presses++;
    if (side.plate.plate > p0) plate += side.plate.plate - p0;
  }
  return { timer, presses, heals, plate };
}
/** The face's one rule (markup) of `def` at `s`, with its brass label. */
const rule = (def: string, s: number) => {
  const rs = faceAt(def, s)!.rules;
  expect(rs, `${def} ★${s}`).toHaveLength(1);
  return rs[0];
};

describe("TXT-AZ item 2: the presses' FEEDS A GUN (REQ-BFG-070)", () => {
  it("ARMOR PRESS: fed, it presses its plating every `every` s; with a belt short of every gun, or none, its timer never starts and it gives no plating", () => {
    for (const s of STARS) {
      const p = effectAt("armorpress", s).factory!.plate!;
      const fed = gives("armorpress", s, "fed");
      expect([fed.timer, fed.presses], `★${s} fed`).toEqual([p.every, Math.floor(10 / p.every)]);
      expect(fed.plate, `★${s} fed`).toBeGreaterThan(0);
      for (const feed of ["short", "none"] as const) expect(gives("armorpress", s, feed), `★${s} ${feed}`).toEqual({ timer: undefined, presses: 0, heals: 0, plate: 0 });
      // the face says the condition first, in ASSEMBLY LINE's words, then its timer and plating from the sim's numbers
      const label = `EVERY ${fmtSec(p.every)}{SEC}:`;
      expect(rule("armorpress", s), `★${s}`).toEqual({ text: `FEEDS A GUN: ${label} HULL: +${fmtDmg(p.amount)} {*PLATE}.`, label });
    }
  });

  it("MEND PRESS: fed, it HEALs every `every` s; with a belt short of every gun, or none, its timer never starts and it HEALs nothing", () => {
    for (const s of STARS) {
      const h = effectAt("mendpress", s).factory!.heal!;
      const fed = gives("mendpress", s, "fed");
      expect([fed.timer, fed.presses, fed.heals], `★${s} fed`).toEqual([h.every, Math.floor(10 / h.every), Math.floor(10 / h.every)]);
      for (const feed of ["short", "none"] as const) expect(gives("mendpress", s, feed), `★${s} ${feed}`).toEqual({ timer: undefined, presses: 0, heals: 0, plate: 0 });
      const label = `EVERY ${fmtSec(h.every)}{SEC}:`;
      expect(rule("mendpress", s), `★${s}`).toEqual({ text: `FEEDS A GUN: ${label} HULL: {*HEAL} ${fmtDmg(h.amount)}.`, label });
    }
  });

  it("both say it as ASSEMBLY LINE does (FEEDS A GUN: first), one line inside the op band, the EVERY label in brass where it is drawn", () => {
    let widest = 0, at = "";
    for (const def of ["armorpress", "mendpress"]) for (const s of STARS) {
      const r = rule(def, s);
      expect(r.text.startsWith("FEEDS A GUN: "), `${def} ★${s}`).toBe(true);
      expect(rule("assembly", s).text.startsWith("FEEDS A GUN: "), `assembly ★${s}`).toBe(true);
      const w = textWidth(icons(r.text));
      if (w > widest) { widest = w; at = `${def} ★${s}`; }
      expect(w, `${def} ★${s}: ${r.text}`).toBeLessThanOrEqual(NEXT_LINE_W);
      // the inspector's and the i ladder's drawing (ruleSpans) colours the label in brass after the condition
      const spans = ruleSpans(icons(r.text), icons(r.label!), "#fff");
      expect(spans.filter((x) => x.c === PERK_COLOUR).map((x) => x.t).join(""), `${def} ★${s}`).toBe(icons(r.label!));
    }
    expect(NEXT_LINE_W).toBe(225);
    expect(ITEMS.armorpress.kind === "factory" && ITEMS.mendpress.kind === "factory").toBe(true);
    console.log(`TXT-AZ presses: the widest line ${widest} px of ${NEXT_LINE_W} (${at})`);
  });
});
