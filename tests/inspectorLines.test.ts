import { describe, expect, it } from "vitest";
import { levelLine, mergeLine, nextLine, portraitButtons, rigPanel, starEffectLine } from "../src/screens/build/inspector";
import { key as K, rotField } from "../src/sim/deck"; // beltside-062c: P11
import { rotFacing } from "../src/sim/beltside"; // beltside-062c: P11
import { textWidth, wrap } from "../src/render/font";
import { newRun, type Run } from "../src/game/run";
import { resolveCore } from "../src/sim/cores";
import { ITEMS, type ItemDef } from "../src/sim/content";
import { fusible, pendingAt } from "../src/sim/stars";

// 0.6.1r (review-061 F5, N2, N4): the inspector's level, NEXT and MERGES WITH lines. Every expected string
// is written out by hand from the catalogue numbers (content.ts), never recomputed with the inspector's code.

/** A run of `hero` holding the given copies of `def` in cargo (stars absent = 1). */
function holding(def: string, stars: number[], hero: "furnace" | "weaver" = "furnace"): Run {
  const run = newRun(hero, 4242);
  run.inventory = stars.map((s, i) => ({ uid: 900 + i, def, ...(s > 1 ? { stars: s } : {}) }));
  return run;
}

describe("F5: a perk whose values are still pending is never named (stubbed modules)", () => {
  const items = ITEMS as Record<string, ItemDef>;
  const stub = (id: string, pending?: Record<string, number>): ItemDef => ({
    id, name: "STUB GATE", kind: "gate", rarity: "common", price: 3, size: 1, desc: ["A TEST GATE."], gate: {},
    levels: { 2: { perk: "PHANTOM", ...(pending ? { pending } : {}) }, 3: { perk: "PHANTOM III" } },
  });

  it("pending: no perk in the level, NEXT or effect lines; once live, the perk shows", () => {
    items.__pendgate = stub("__pendgate", { jump: 1 });
    items.__livegate = stub("__livegate");
    try {
      expect(pendingAt("__pendgate", 2)).toEqual({ jump: 1 });
      expect(pendingAt("__pendgate", 3)).toEqual({ jump: 1 }); // level 2's pending carries to 3 stars
      expect(starEffectLine("__pendgate", 2)).toBe("");
      expect(levelLine("__pendgate", 2)).toBe("★2");
      expect(levelLine("__pendgate", 3)).toBe("★3");
      expect(nextLine(holding("__pendgate", [1]), "__pendgate", 1)).toBe("NEXT ★2 · NEEDS 1 MORE");

      expect(pendingAt("__livegate", 2)).toEqual({});
      expect(starEffectLine("__livegate", 2)).toBe("PHANTOM");
      expect(levelLine("__livegate", 2)).toBe("★2 PHANTOM");
      expect(levelLine("__livegate", 3)).toBe("★3 PHANTOM III");
      expect(nextLine(holding("__livegate", [1]), "__livegate", 1)).toBe("NEXT ★2: PHANTOM · NEEDS 1 MORE");
    } finally {
      delete items.__pendgate;
      delete items.__livegate;
    }
    expect(Object.keys(ITEMS)).not.toContain("__pendgate");
    expect(Object.keys(ITEMS)).not.toContain("__livegate");
  });
});

// 0.6.2p (item 2, the lead's decision): merge progress reads "NEEDS 1 MORE" / "NEEDS 2 MORE"; 0.6.1r N2's "1 MORE COPY" /
// "2 MORE COPIES" read like a perk
describe("N2 / 0.6.2p item 2: merge progress, NEEDS 1 MORE and NEEDS 2 MORE", () => {
  it("TEMPER from 1★ needs 1 copy, from a lone 2★ needs 2", () => {
    expect(nextLine(holding("temper", [1]), "temper", 1)).toBe("NEXT ★2: +4 BURN · NEEDS 1 MORE");
    expect(nextLine(holding("temper", [2]), "temper", 2)).toBe("NEXT ★3: +7 BURN · NEEDS 2 MORE");
  });

  it("every NEXT line ends in NEEDS n MORE, never in MORE COPY or MORE COPIES: every fusible module, 1 and 2 stars", () => {
    let lines = 0;
    for (const d of Object.values(ITEMS)) {
      for (const s of [1, 2]) {
        const line = nextLine(holding(d.id, [s]), d.id, s);
        if (!line) continue;
        expect(line, d.id).toMatch(new RegExp(` · NEEDS ${s === 1 ? 1 : 2} MORE$`));
        expect(line, d.id).not.toMatch(/MORE COP(Y|IES)$/);
        lines++;
      }
    }
    const fus = Object.keys(ITEMS).filter(fusible);
    expect(fus).toHaveLength(58); // 23 rigs, 13 factories, 13 cores and 9 mods at 65a36b7
    expect(lines).toBe(2 * fus.length);
  });
});

describe("N4: a turret core's lines show its headline at that star", () => {
  it("PRESSURE BREECH on FURNACE (heavy, k 1): ★1 -> ★2 and ★2 -> ★3", () => {
    expect(nextLine(holding("pressure", [1]), "pressure", 1)).toBe("NEXT ★2: +2.6 DMG PER QUEUED · NEEDS 1 MORE");
    expect(mergeLine(holding("pressure", [1]), "pressure")).toBe("MERGES WITH YOUR PRESSURE BREECH ★1 → ★2 · +2.6 DMG PER QUEUED");
    expect(levelLine("pressure", 2)).toBe("★2: +2.6 DMG PER QUEUED");
    expect(nextLine(holding("pressure", [2]), "pressure", 2)).toBe("NEXT ★3: +4.2 DMG PER QUEUED · NEEDS 2 MORE");
    expect(mergeLine(holding("pressure", [2, 1]), "pressure")).toBe("MERGES WITH YOUR PRESSURE BREECH ★2 → ★3 · +4.2 DMG PER QUEUED");
  });

  it("on WEAVER (light, k 0.55) the absolute numbers scale like the fitted core's: 2.6 x 0.55 = 1.43, 4.2 x 0.55 = 2.31", () => {
    expect(nextLine(holding("pressure", [1], "weaver"), "pressure", 1)).toBe("NEXT ★2: +1.4 DMG PER QUEUED · NEEDS 1 MORE");
    expect(nextLine(holding("pressure", [2], "weaver"), "pressure", 2)).toBe("NEXT ★3: +2.3 DMG PER QUEUED · NEEDS 2 MORE");
    // the turret panel's source for the same core once fitted: resolveCore's k-scaled spec
    const run = newRun("weaver", 4242);
    run.build.mods.push({ uid: 950, def: "pressure", turret: 0, stars: 2 });
    expect(resolveCore(run.build, 0).spec.perQueued).toBeCloseTo(1.43, 6);
  });

  it("ROTARY BREECH: its stars change the fire rate, then add NEVER JAMS", () => {
    expect(starEffectLine("rotary", 1)).toBe("FIFO LOAD FIRST");
    expect(levelLine("rotary", 2)).toBe("★2 GREASED RACE: FIFO LOAD FIRST · FIRE X0.85");
    expect(levelLine("rotary", 3)).toBe("★3 CLEAN FEED: FIFO LOAD FIRST · FIRE X0.7 · NEVER JAMS");
  });
});

describe("F7 (the Prime's call): portrait action buttons (portraitButtons, pure font metrics)", () => {
  it("in the phone band the buttons never cover the title, the sub-line or the icon, and stay inside", () => {
    type Box = { x: number; y: number; w: number; h: number };
    const hit = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const band: Box = { x: 3, y: 100, w: 161, h: 69 }; // the phone build screen: W 167, info band x 3, w W - 6, h 69
    const cases: [string, string, string[], "top" | "row"][] = [
      ["HEAVY TURRET 1", "FED FROM COLUMN 5+6", ["REMOVE CORE", "REMOVE GEAR"], "row"], // review-061's F7 scenario
      // 0.6.2 BELTSIDE merge: the sub lines read RIG, as the player sees them (wording only; same row/top outcome)
      ["TEMPER", "COMMON RIG · GUNSMITH", ["BUY+MERGE 3G"], "row"],
      ["TEMPER", "COMMON RIG · IN CARGO", ["SELL +2G"], "top"], // sized to its label, it fits beside the texts
      ["BELT ROUTE", "FEEDS TURRET 1", ["REMOVE BELT"], "top"], // fits at the old 64 px width
    ];
    for (const [title, sub, labels, where] of cases) {
      const { rects, shift } = portraitButtons(title, sub, labels, band);
      const texts: Box[] = [
        { x: band.x + 22, y: band.y + 3, w: textWidth(title) + 2, h: 9 }, // the 5x7 title with its 1 px outline
        { x: band.x + 23, y: band.y + 13, w: textWidth(sub, "3"), h: 5 },
        { x: band.x + 4, y: band.y + 4, w: 16, h: 16 }, // the icon box
      ];
      expect(rects).toHaveLength(labels.length);
      for (const q of rects) {
        for (const t of texts) expect(hit(q, t), `${labels.join("+")} vs ${title} / ${sub}`).toBe(false);
        expect(q.x).toBeGreaterThanOrEqual(band.x + 4);
        expect(q.x + q.w).toBeLessThanOrEqual(band.x + band.w - 4);
        expect(q.w).toBeGreaterThanOrEqual(textWidth(labels[rects.indexOf(q)], "3") + 4); // the label fits its button
      }
      if (rects.length === 2) expect(hit(rects[0], rects[1])).toBe(false);
      expect(where === "top" ? rects.every((q) => q.y === band.y + 4) && shift === 0 : rects.every((q) => q.y === band.y + 21) && shift === 12).toBe(true);
    }
  });
});

// 0.6.1c: the six factories' lines, written out by hand from catalogue.json (star1-star3, perk)
describe("0.6.1c: each factory's headline at each star, its perks named, and the phone band's 4 lines", () => {
  const HEAD: Record<string, [string, string, string]> = {
    doublestamp: ["2 X 3 DMG EVERY 2.2S", "2 X 5 DMG EVERY 1.6S", "3 X 5 DMG EVERY 1.6S"],
    shottower: ["3 X 1 DMG EVERY 1.5S", "3 X 2 DMG EVERY 1.35S", "3 X 3 DMG EVERY 1.3S"],
    hotswap: ["EMBER +2 · SPARK 1.6S · 1.5S", "EMBER +4 · SPARK 1.8S+JUMP · 1.3S", "EMBER +7 · SPARK 2.8S+JUMP · 1.1S"],
    slagpot: ["7 DMG SLAG EVERY 2.8S", "12 DMG SLAG EVERY 2.2S", "15 DMG SLAG EVERY 1.75S"],
    // 0.6.2 BELTSIDE merge (0.6.1c): the headline reads RIGS, as the player sees it (wording only; the numbers are 0.6.1c's)
    assembly: ["RIGS ONLINE X0.5 · 1.8S", "RIGS ONLINE X0.25 · 1.5S", "RIGS ONLINE X0 · 1.3S · X2 4S"],
    gantry: ["2 OUTPUTS · 3 DMG EVERY 1.2S", "3 OUTPUTS · 3 DMG EVERY 0.7S", "3 OUTPUTS · 6 DMG EVERY 0.7S"],
  };
  const PERK: Record<string, [string, string]> = { doublestamp: ["", "TRIPLE DIES"], shottower: ["", ""], hotswap: ["", ""], slagpot: ["", ""], assembly: ["", "HOT START"], gantry: ["THIRD ARM", "HEAVY GANTRY"] };

  it("starEffectLine, levelLine and nextLine (STAMP PRESS keeps its 0.6.1p line)", () => {
    expect(starEffectLine("press", 2)).toBe("EVERY 1.1S · 5 DMG SLUGS");
    for (const [def, h] of Object.entries(HEAD)) {
      expect([1, 2, 3].map((s) => starEffectLine(def, s)), def).toEqual(h);
      const [p2, p3] = PERK[def];
      expect(levelLine(def, 2), def).toBe(`★2${p2 ? ` ${p2}` : ""}: ${h[1]}`);
      expect(levelLine(def, 3), def).toBe(`★3${p3 ? ` ${p3}` : ""}: ${h[2]}`);
      expect(nextLine(holding(def, [1]), def, 1), def).toBe(`NEXT ★2${p2 ? ` ${p2}` : ""}: ${h[1]} · NEEDS 1 MORE`);
      expect(nextLine(holding(def, [2]), def, 2), def).toBe(`NEXT ★3${p3 && p3 !== p2 ? ` ${p3}` : ""}: ${h[2]} · NEEDS 2 MORE`);
      expect(mergeLine(holding(def, [1]), def), def).toBe(`MERGES WITH YOUR ${ITEMS[def].name} ★1 → ★2 · ${h[1]}`);
    }
    expect(nextLine(holding("temper", [1]), "temper", 1)).toBe("NEXT ★2: +4 BURN · NEEDS 1 MORE"); // gates unchanged
  });

  it("phone: a factory offer's headline and its MERGES WITH line fit the band's 4 body lines (3x5 face, 151 px)", () => {
    for (const def of Object.keys(HEAD)) {
      for (const owned of [[1], [2, 1]]) {
        const lines = [starEffectLine(def, 1), mergeLine(holding(def, owned), def)!].flatMap((l) => wrap(l, 151, "3"));
        expect(lines.length, `${def} ${owned}: ${lines.join(" / ")}`).toBeLessThanOrEqual(4);
      }
    }
  });
});

// beltside-062c (ref/DESIGN-beltside.md §12 P11): a placed rig's panel (inspector.ts rigPanel) lists its hits (or IDLE),
// its star perk, the NEXT/MERGES line, the turn hint, then the flavour. A short panel drops lines from the end, so on
// a phone the flavour gives way first and the hits last, and merge progress stays in sight.
describe("P11: a rig's panel order, and the phone band", () => {
  const SHORT = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
  const SIDE = [K(6, 5), K(6, 4), K(6, 3), K(6, 2), K(6, 1), K(5, 1), K(5, 0)];
  /** A Furnace with the Kiln's belt up column 4 and a STAMP PRESS belt up column 6; rig `def` (uid 10, ★stars) at (x, y)
   *  with `rot`, and `spare` ★1 copies of it in cargo. */
  function rigRun(def: string, stars: number, x: number, y: number, rot: number, spare: number): Run {
    const run = newRun("furnace", 5, "p11");
    run.inventory = Array.from({ length: spare }, (_, i) => ({ uid: 800 + i, def }));
    run.build = {
      hero: "furnace", mods: [], beltCap: 30, hullBonus: 0,
      items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 7, def: "press", x: 6, y: 6 }, { uid: 10, def, x, y, ...rotField(def, rot), ...(stars > 1 ? { stars } : {}) }],
      routes: [{ factory: 1, cells: [...SHORT] }, { factory: 7, cells: [...SIDE] }],
    };
    return run;
  }
  const text = (run: Run) => rigPanel(run, 10)!.text.map((l) => (typeof l === "string" ? l : l[0]));
  const TURN = "TAP TO TURN (OR R). DRAG TO MOVE.";
  const IDLE = "IDLE: NO ARROW REACHES A BELT. TURN IT OR MOVE IT BESIDE ONE.";

  it("hits (or IDLE), perk, NEXT, turn hint, flavour: written out by hand", () => {
    // a ★2 SPLITTER (T) at (3,3) facing east: one arrow on the Kiln's (4,3), tile 3; one spare copy in cargo.
    // beltside-062-on-061 (0.6.1f, DESIGN §13 P12): the perk and NEXT lines read 0.6.1f's words ("2 X 72%", and a NEXT
    // line naming PERFECT CUT); they were "★2 CLEAN CUT: 2X 72%" and "NEXT ★3: 3X 57% · 1 MORE COPY" (THREE-WAY).
    // 0.6.2p: merge progress reads NEEDS 1 MORE (item 2)
    expect(text(rigRun("splitter", 2, 3, 3, rotFacing("splitter", 1), 1))).toEqual([
      "→ BELT 1 · TILE 3", "★2 CLEAN CUT: 2 X 72%", "NEXT ★3 PERFECT CUT: 2 X 85% · NEEDS 1 MORE", TURN,
      "SPLITS A PAYLOAD IN", "TWO COPIES AT 60%.", "MORE BELT PRESSURE.",
    ]);
    // a ★1 LONG HAUL (II) at (5,3) between both belts: two hits, then NEXT (no perk line at ★1)
    expect(text(rigRun("longhaul", 1, 5, 3, 0, 0))).toEqual([
      "→ BELT 1 · TILE 3", "→ BELT 2 · TILE 3", "NEXT ★2: +4/HIT · MAX 6 HITS · NEEDS 1 MORE", TURN,
      "+2 DAMAGE FOR EACH", "HIT THE PAYLOAD", "ALREADY TOOK.",
    ]);
    // an IDLE ★2 TEMPER: the amber warning leads
    const idle = rigPanel(rigRun("temper", 2, 0, 9, 0, 0), 10)!;
    expect(idle.text[0]).toEqual([IDLE, expect.any(String)]);
    expect(text(rigRun("temper", 2, 0, 9, 0, 0))).toEqual([IDLE, "★2: +4 BURN", "NEXT ★3: +7 BURN · NEEDS 2 MORE", TURN, "ADDS 2 BURN.", "BURN: 1 DMG/S FOR 3S", "PER STACK ON HIT."]);
    expect([idle.sub, idle.idle, idle.labels]).toEqual(["RIG · IDLE", true, ["ROTATE", "TO CARGO"]]);
    // a ★3 X OVERDRIVE at (5,3): no NEXT past ★3, no ROTATE for an X
    const x = rigPanel(rigRun("overdrive", 3, 5, 3, 0, 0), 10)!;
    expect(text(rigRun("overdrive", 3, 5, 3, 0, 0))).toEqual([
      "→ BELT 1 · TILE 3", "→ BELT 2 · TILE 3", "★3 AFTERBURNER: SPEED X5 · +3 FLAT", "FACES EVERY SIDE. DRAG TO MOVE.",
      "4 ARROWS: 3X SPEED", "FROM HIT; LOCKED BELTS", "GAIN +3 DAMAGE.",
    ]);
    expect([x.sub, x.subShort, x.labels]).toEqual(["RIG · 2/4 ARROWS ON BELTS", "RIG · 2/4 HIT", ["TO CARGO"]]);
  });

  // The phone build screen's info band (F7's test above): 161 x 69 px. drawDetails draws a rig's body in the 3x5 face
  // (7 px lines; a rig's 5+ lines never fit the 5x7 face there) from y + 25 + shift, where shift is 12 when the buttons
  // take their own row (portraitButtons, retried with the short sub line), so 4 or 6 body lines show, wrapped at 151 px.
  const BAND = { x: 3, y: 100, w: 161, h: 69 };
  function phone(run: Run): { fit: number; head: number; next: number } {
    const rp = rigPanel(run, 10)!;
    let port = portraitButtons(rp.title, rp.sub, rp.labels, BAND);
    if (port.shift && rp.subShort) {
      const short = portraitButtons(rp.title, rp.subShort, rp.labels, BAND);
      if (!short.shift) port = short;
    }
    const fit = Math.floor((BAND.h - 4 - 25 - port.shift + 2) / 7);
    const rows = rp.text.map((l) => wrap(typeof l === "string" ? l : l[0], BAND.w - 10, "3").length);
    const nextAt = rp.text.findIndex((l) => typeof l === "string" && l.startsWith("NEXT "));
    const turnAt = rp.text.findIndex((l) => l === TURN || l === "FACES EVERY SIDE. DRAG TO MOVE.");
    const upTo = (i: number) => rows.slice(0, i).reduce((a, b) => a + b, 0);
    return { fit, head: upTo(nextAt < 0 ? turnAt : nextAt), next: nextAt < 0 ? -1 : upTo(nextAt + 1) };
  }
  // Measured (beltside-062c): where the perk and NEXT lines both wrap to two lines, the NEXT line doesn't fit the 4-line
  // band whole: its last words ("tail") give way beside a hit; beside the 2-line IDLE warning a ★2 COIL's NEXT line gives
  // way whole ("whole"). A UI follow-up (shorter phone wording for these perk and NEXT lines) is flagged in MERGE-061c.md.
  // Measured again (beltside-062-on-061), with 0.6.1f's NEXT line, which names the perk the next star brings: the five
  // entries above hold as they were, and four more cut their tail (8 more cases, 16 of 96 in all): a ★2 BRAKE's "NEXT ★3
  // RED-HOT SHOE: HALF SPEED · +5 DMG ..." and a ★2 SPLITTER's "NEXT ★3 PERFECT CUT: 2 X 85% ..." now wrap to two lines,
  // so beside the 2-line IDLE warning (an I BRAKE "between both belts" is IDLE too), or below a SPLITTER's two hits,
  // their last words give way. The NEXT line still starts in view in every one of them.
  // 0.6.2p (item 2): "NEEDS 1 MORE" is a letter longer than "1 MORE COPY", so a ★2 LONG HAUL's "NEXT ★3: +7/HIT · MAX 6
  // HITS · NEEDS 1 MORE" (a spare copy in cargo) wraps to two lines as well: its two entries lose their spare0 (18 of 96)
  const KNOWN_PHONE_CUTS = new Map([
    ["coil ★2 1hit", "tail"], ["coil ★2 2hit", "tail"], ["coil ★2 idle", "whole"],
    ["longhaul ★2 2hit", "tail"], ["longhaul ★2 idle", "tail"],
    ["brake ★2 2hit", "tail"], ["brake ★2 idle", "tail"], ["splitter ★2 2hit", "tail"], ["splitter ★2 idle", "tail"],
  ]);

  it("phone: the hits (or IDLE) and the perk always show, the NEXT line whole (or, measured cuts, its start)", () => {
    const LAYOUT: [string, (def: string) => [number, number, number]][] = [
      ["1hit", (def) => [3, 3, rotFacing(def, 1)]], // beside the Kiln's belt, facing it
      ["2hit", () => [5, 3, 0]], // between both belts (an I rig there points at empty deck: IDLE)
      ["idle", () => [0, 9, 0]],
    ];
    let cases = 0;
    for (const def of ["temper", "whetstone", "grease", "brake", "longhaul", "coil", "splitter", "overdrive"]) {
      for (const s of [1, 2, 3]) for (const [lay, at] of LAYOUT) for (const spare of [0, 1]) {
        const [x, y, rot] = at(def);
        const p = phone(rigRun(def, s, x, y, rot, spare));
        const id = `${def} ★${s} ${lay}`;
        expect(p.head, `${id}: hits and perk`).toBeLessThanOrEqual(p.fit);
        if (p.next < 0) continue; // ★3: no NEXT line
        const cut = KNOWN_PHONE_CUTS.get(id) ?? KNOWN_PHONE_CUTS.get(`${id} spare${spare}`);
        if (cut) {
          expect(p.next, `${id}: a known cut`).toBeGreaterThan(p.fit);
          if (cut === "tail") expect(p.head + 1, `${id}: the NEXT line starts in view`).toBeLessThanOrEqual(p.fit);
          else expect(p.head, `${id}: hits and perk fill the band`).toBe(p.fit);
        } else {
          expect(p.next, `${id} spare${spare}: NEXT in view`).toBeLessThanOrEqual(p.fit);
        }
        cases++;
      }
    }
    expect(cases).toBe(8 * 2 * 3 * 2); // ★1 and ★2 have a NEXT line
  });
});

// 0.6.1f: the retuned BRAKE SHOE (HOT SHOE, RED-HOT SHOE) and SPLITTER (PERFECT CUT), written out by hand
describe("shared timing gear inspection", () => {
  it("shows the pendulum shift and the cross-hero effect at every star", () => {
    expect([1, 2, 3].map((s) => starEffectLine("escapement", s))).toEqual([
      "FIRE X0.9 · PEAK -1.2S", "FIRE X0.86 · PEAK -1.2S", "FIRE X0.82 · PEAK -1.2S",
    ]);
    expect([1, 2, 3].map((s) => starEffectLine("longcase", s))).toEqual([
      "+1.5 AFTER 2S · PEAK +1.2S", "+2.5 AFTER 2S · PEAK +1.2S", "+4 AFTER 2S · PEAK +1.2S",
    ]);
  });
});

describe("0.6.1f: BRAKE SHOE and SPLITTER name each merge's perk and value", () => {
  it("BRAKE SHOE: HALF SPEED at every star, +2 / +5 DMG from the heat", () => {
    expect([1, 2, 3].map((s) => starEffectLine("brake", s))).toEqual(["HALF SPEED", "HALF SPEED · +2 DMG", "HALF SPEED · +5 DMG"]);
    expect(levelLine("brake", 2)).toBe("★2 HOT SHOE: HALF SPEED · +2 DMG");
    expect(levelLine("brake", 3)).toBe("★3 RED-HOT SHOE: HALF SPEED · +5 DMG");
    expect(nextLine(holding("brake", [1]), "brake", 1)).toBe("NEXT ★2 HOT SHOE: HALF SPEED · +2 DMG · NEEDS 1 MORE");
    expect(nextLine(holding("brake", [2]), "brake", 2)).toBe("NEXT ★3 RED-HOT SHOE: HALF SPEED · +5 DMG · NEEDS 2 MORE");
    expect(mergeLine(holding("brake", [1]), "brake")).toBe("MERGES WITH YOUR BRAKE SHOE ★1 → ★2 · HALF SPEED · +2 DMG");
    expect(mergeLine(holding("brake", [2, 1]), "brake")).toBe("MERGES WITH YOUR BRAKE SHOE ★2 → ★3 · HALF SPEED · +5 DMG");
  });

  it("SPLITTER: 2 X 60% / 2 X 72% CLEAN CUT / 2 X 85% PERFECT CUT", () => {
    expect([1, 2, 3].map((s) => starEffectLine("splitter", s))).toEqual(["2 X 60%", "2 X 72%", "2 X 85%"]);
    expect(levelLine("splitter", 2)).toBe("★2 CLEAN CUT: 2 X 72%");
    expect(levelLine("splitter", 3)).toBe("★3 PERFECT CUT: 2 X 85%");
    expect(nextLine(holding("splitter", [1]), "splitter", 1)).toBe("NEXT ★2 CLEAN CUT: 2 X 72% · NEEDS 1 MORE");
    expect(nextLine(holding("splitter", [2]), "splitter", 2)).toBe("NEXT ★3 PERFECT CUT: 2 X 85% · NEEDS 2 MORE");
    expect(mergeLine(holding("splitter", [1]), "splitter")).toBe("MERGES WITH YOUR SPLITTER ★1 → ★2 · 2 X 72%");
    expect(mergeLine(holding("splitter", [2, 1]), "splitter")).toBe("MERGES WITH YOUR SPLITTER ★2 → ★3 · 2 X 85%");
  });

  it("the other speed gates keep their lines; a gate's NEXT line names the perk that star brings, once", () => {
    expect([1, 2, 3].map((s) => starEffectLine("grease", s))).toEqual(["SPEED X1.6", "SPEED X2.3", "SPEED X3.1"]);
    expect(starEffectLine("overdrive", 3)).toBe("SPEED X5 · +3 FLAT");
    expect(nextLine(holding("overdrive", [2]), "overdrive", 2)).toBe("NEXT ★3 AFTERBURNER: SPEED X5 · +3 FLAT · NEEDS 2 MORE");
    expect(nextLine(holding("coil", [2]), "coil", 2)).toBe("NEXT ★3: STALL 2.8S · JUMPS TO 1 MORE · NEEDS 2 MORE"); // SPARK JUMP already
  });

  it("phone: the headline and its MERGES WITH line fit the band's 4 body lines (3x5 face, 151 px)", () => {
    for (const def of ["brake", "splitter"]) {
      for (const owned of [[1], [2, 1]]) {
        const lines = [starEffectLine(def, 1), mergeLine(holding(def, owned), def)!].flatMap((l) => wrap(l, 151, "3"));
        expect(lines.length, `${def} ${owned}: ${lines.join(" / ")}`).toBeLessThanOrEqual(4);
      }
    }
  });
});
