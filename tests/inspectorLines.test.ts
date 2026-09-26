import { describe, expect, it } from "vitest";
import {
  IDLE_HEAD, IDLE_SHORT, IDLE_WARNING, mergeLine, nextLine, offerPanel, planPanel, portraitButtons, rigPanel, visibleLines,
  type PLine,
} from "../src/screens/build/inspector";
import { key as K, rotField, startingTurrets } from "../src/sim/deck"; // beltside-062c: P11; 0.6.2s: startingTurrets
import { rotFacing } from "../src/sim/beltside"; // beltside-062c: P11
import { textWidth } from "../src/render/font";
import { C } from "../src/render/palette";
import { newRun, type Run } from "../src/game/run";
import { resolveCore } from "../src/sim/cores";
import { ITEMS, buyableModules, rigShape, type ItemDef } from "../src/sim/content";
import { fusible, pendingAt } from "../src/sim/stars";
import { buildLayout } from "../src/screens/build/layout";
import { abilityText, gist, livePerk, newPerk, nextStarHeadline, nextStarText } from "../src/ui/abilityText";

// 0.6.1r (review-061 F5, N2, N4) and after: the inspector's ability, next-star, merge-progress and MERGES WITH lines.
// 0.6.2t (REQ-BFG-032): they read as whole sentences from the glossary (src/ui/abilityText.ts): "NEXT STAR: ADDS 4 BURN.",
// "1 MORE COPY TO MERGE.", "MERGES WITH YOUR TEMPER INTO ★2: ADDS 4 BURN." (were "NEXT ★2: +4 BURN · NEEDS 1 MORE" and
// "MERGES WITH YOUR TEMPER ★1 → ★2 · +4 BURN"). Every expected string is written out by hand from the catalogue numbers
// (content.ts), never recomputed with the inspector's or the glossary's code.

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

  it("pending: no perk named at the star, the next star or in the text; once live, the perk shows", () => {
    items.__pendgate = stub("__pendgate", { jump: 1 });
    items.__livegate = stub("__livegate");
    try {
      expect(pendingAt("__pendgate", 2)).toEqual({ jump: 1 });
      expect(pendingAt("__pendgate", 3)).toEqual({ jump: 1 }); // level 2's pending carries to 3 stars
      expect([livePerk("__pendgate", 2), livePerk("__pendgate", 3), newPerk("__pendgate", 2), newPerk("__pendgate", 3)]).toEqual([undefined, undefined, undefined, undefined]);
      // a module the glossary has no entry for shows no ability text and no next-star line (never a made-up one)
      expect([abilityText("__pendgate", 2), nextStarText("__pendgate", 1)]).toEqual([{ sentences: [] }, null]);

      expect(pendingAt("__livegate", 2)).toEqual({});
      expect([livePerk("__livegate", 2), livePerk("__livegate", 3)]).toEqual(["PHANTOM", "PHANTOM III"]);
      expect([newPerk("__livegate", 2), newPerk("__livegate", 3)]).toEqual(["PHANTOM", "PHANTOM III"]);
    } finally {
      delete items.__pendgate;
      delete items.__livegate;
    }
    expect(Object.keys(ITEMS)).not.toContain("__pendgate");
    expect(Object.keys(ITEMS)).not.toContain("__livegate");
  });
});

// 0.6.2t (T5): merge progress is a sentence of its own, "1 MORE COPY TO MERGE." / "2 MORE COPIES TO MERGE." (0.6.2p item 2's
// "NEEDS 1 MORE" / "NEEDS 2 MORE" is gone everywhere)
describe("N2 / T5: merge progress, 1 MORE COPY TO MERGE and 2 MORE COPIES TO MERGE", () => {
  it("TEMPER from 1★ needs 1 copy, from a lone 2★ needs 2", () => {
    expect(nextLine(holding("temper", [1]), "temper", 1)).toBe("NEXT STAR: ADDS 4 BURN. 1 MORE COPY TO MERGE.");
    expect(nextLine(holding("temper", [2]), "temper", 2)).toBe("NEXT STAR: ADDS 7 BURN. 2 MORE COPIES TO MERGE.");
    expect(nextLine(holding("temper", [2, 1]), "temper", 2)).toBe("NEXT STAR: ADDS 7 BURN. 1 MORE COPY TO MERGE.");
  });

  it("every fusible module at 1 and 2 stars: the next-star sentence, then merge progress, never NEEDS n MORE", () => {
    let lines = 0;
    // 0.6.2s (S6/S7): FURNACE's free starting SCRAP CANNON counts toward a merge, so its own count is checked below
    const own = new Set(startingTurrets("furnace").map((t) => t.def));
    for (const d of Object.values(ITEMS)) {
      if (own.has(d.id)) continue;
      for (const s of [1, 2]) {
        const line = nextLine(holding(d.id, [s]), d.id, s);
        if (!line) continue;
        expect(line, d.id).toMatch(/^NEXT STAR: [^·]+\. /);
        expect(line, d.id).toMatch(s === 1 ? / 1 MORE COPY TO MERGE\.$/ : / 2 MORE COPIES TO MERGE\.$/);
        expect(line, d.id).not.toMatch(/NEEDS \d MORE|·/);
        lines++;
      }
    }
    const fus = Object.keys(ITEMS).filter(fusible);
    expect(fus).toHaveLength(71); // 23 rigs, 13 factories, 13 cores and 9 mods at 65a36b7; + 13 turrets (0.6.2s)
    expect(lines).toBe(2 * (fus.length - own.size));
  });

  it("0.6.2s: the hull's free starting turret counts toward a merge (S6, S7)", () => {
    // FURNACE's free ★1 SCRAP CANNON sits in slot 0: one more ★1 merges with it into a ★2, then the two ★2s make ★3
    expect([...new Set(startingTurrets("furnace").map((t) => t.def))]).toEqual(["scrapcannon"]);
    // 0.6.2rel (T5): merge progress is its own sentence after the next star's (the glossary's turret clause)
    expect(nextLine(holding("scrapcannon", [2]), "scrapcannon", 2)).toBe("NEXT STAR: FIRES EVERY 0.8 SECONDS, 3 GEAR SLOTS. 1 MORE COPY TO MERGE.");
    // WEAVER starts with DART GUNs, not a SCRAP CANNON: the usual count
    expect(nextLine(holding("scrapcannon", [2], "weaver"), "scrapcannon", 2)).toMatch(/ 2 MORE COPIES TO MERGE\.$/);
    expect(nextLine(holding("bombard", [2]), "bombard", 2)).toMatch(/ 2 MORE COPIES TO MERGE\.$/);
  });
});

describe("N4: a turret core's lines show that star's numbers at the hero's class factor", () => {
  it("PRESSURE BREECH on FURNACE (heavy, k 1): ★1 -> ★2 and ★2 -> ★3", () => {
    expect(nextLine(holding("pressure", [1]), "pressure", 1)).toBe("NEXT STAR: 2.6 MORE DAMAGE FOR EACH PAYLOAD WAITING. 1 MORE COPY TO MERGE.");
    expect(mergeLine(holding("pressure", [1]), "pressure")).toBe("MERGES WITH YOUR PRESSURE BREECH INTO ★2: 2.6 MORE DAMAGE FOR EACH PAYLOAD WAITING.");
    expect(abilityText("pressure", 2).sentences[0]).toBe("SHOTS DEAL 2.6 MORE DAMAGE FOR EACH PAYLOAD WAITING, UP TO 5 PAYLOADS.");
    expect(nextLine(holding("pressure", [2]), "pressure", 2)).toBe("NEXT STAR: 4.2 MORE DAMAGE FOR EACH PAYLOAD WAITING. 2 MORE COPIES TO MERGE.");
    expect(mergeLine(holding("pressure", [2, 1]), "pressure")).toBe("MERGES WITH YOUR PRESSURE BREECH INTO ★3: 4.2 MORE DAMAGE FOR EACH PAYLOAD WAITING.");
  });

  it("on WEAVER (light, k 0.55) the absolute numbers scale like the fitted core's: 2.6 x 0.55 = 1.43, 4.2 x 0.55 = 2.31", () => {
    expect(nextLine(holding("pressure", [1], "weaver"), "pressure", 1)).toBe("NEXT STAR: 1.4 MORE DAMAGE FOR EACH PAYLOAD WAITING. 1 MORE COPY TO MERGE.");
    expect(nextLine(holding("pressure", [2], "weaver"), "pressure", 2)).toBe("NEXT STAR: 2.3 MORE DAMAGE FOR EACH PAYLOAD WAITING. 2 MORE COPIES TO MERGE.");
    // the turret panel's source for the same core once fitted: resolveCore's k-scaled spec
    const run = newRun("weaver", 4242);
    run.build.mods.push({ uid: 950, def: "pressure", turret: 0, stars: 2 });
    expect(resolveCore(run.build, 0).spec.perQueued).toBeCloseTo(1.43, 6);
  });

  it("ROTARY BREECH: its stars make the turret fire faster, then never jam (the perk named after that sentence)", () => {
    const CHAMBER = "A TURRET FIRES WHEN ITS CHAMBER IS FULL OR ITS LOAD TIME ENDS, 1.5 SECONDS AFTER THE FIRST LOAD.";
    const OPEN = "CUTS THE LOAD TIME TO 0.8 SECONDS AND FIRES THE OLDEST LOAD FIRST.";
    expect(abilityText("rotary", 1)).toEqual({ sentences: [OPEN, CHAMBER] });
    expect(abilityText("rotary", 2)).toEqual({ sentences: [OPEN, "IT FIRES 18% FASTER.", CHAMBER], perk: { name: "GREASED RACE", stars: 2, after: 1 } });
    expect(abilityText("rotary", 3)).toEqual({ sentences: [OPEN, "IT FIRES 43% FASTER AND NEVER JAMS.", CHAMBER], perk: { name: "CLEAN FEED", stars: 3, after: 1 } });
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

// 0.6.1c: the six factories' headlines, written out by hand from catalogue.json (star1-star3, perk); 0.6.2t: the
// glossary's clauses (gist) in words and units (were "2 X 3 DMG EVERY 2.2S" and the like)
describe("0.6.1c: each factory's clause at each star, its perks named, and the phone band", () => {
  const HEAD: Record<string, [string, string, string]> = {
    doublestamp: ["2 SLUGS OF 3 DAMAGE EVERY 2.2 SECONDS", "2 SLUGS OF 5 DAMAGE EVERY 1.6 SECONDS", "3 SLUGS OF 5 DAMAGE EVERY 1.6 SECONDS"],
    shottower: ["1 DAMAGE BUCKSHOT EVERY 1.5 SECONDS", "2 DAMAGE BUCKSHOT EVERY 1.35 SECONDS", "3 DAMAGE BUCKSHOT EVERY 1.3 SECONDS"],
    hotswap: ["2 BURN, SHOCK STALLS A MACHINE FOR 1.6 SECONDS", "4 BURN, SHOCK STALLS 2 MACHINES FOR 1.8 SECONDS", "7 BURN, SHOCK STALLS 2 MACHINES FOR 2.8 SECONDS"],
    slagpot: ["7 DAMAGE SLAG EVERY 2.8 SECONDS", "12 DAMAGE SLAG EVERY 2.2 SECONDS", "15 DAMAGE SLAG EVERY 1.75 SECONDS"],
    assembly: ["RIGS ONLINE IN HALF THE TIME", "RIGS ONLINE IN A QUARTER OF THE TIME", "ALL RIGS ONLINE AT ONCE"],
    gantry: ["FEEDS 2 BELTS", "FEEDS 3 BELTS", "6 DAMAGE SLUGS"],
  };
  const PERK: Record<string, [string, string]> = { doublestamp: ["", "TRIPLE DIES"], shottower: ["", ""], hotswap: ["", ""], slagpot: ["", ""], assembly: ["", "HOT START"], gantry: ["THIRD ARM", "HEAVY GANTRY"] };

  it("gist, the next-star sentence and MERGES WITH (STAMP PRESS keeps its stamp rate and slug damage)", () => {
    expect(gist("press", 2)).toBe("5 DAMAGE SLUGS EVERY 1.1 SECONDS");
    for (const [def, h] of Object.entries(HEAD)) {
      expect([1, 2, 3].map((s) => gist(def, s)), def).toEqual(h);
      const [p2, p3] = PERK[def];
      expect(nextLine(holding(def, [1]), def, 1), def).toBe(`NEXT STAR: ${h[1]}.${p2 ? ` ★2 ${p2}` : ""} 1 MORE COPY TO MERGE.`);
      expect(nextLine(holding(def, [2]), def, 2), def).toBe(`NEXT STAR: ${h[2]}.${p3 && p3 !== p2 ? ` ★3 ${p3}` : ""} 2 MORE COPIES TO MERGE.`);
      expect(mergeLine(holding(def, [1]), def), def).toBe(`MERGES WITH YOUR ${ITEMS[def].name} INTO ★2: ${h[1]}.${p2 ? ` ★2 ${p2}` : ""}`);
    }
    expect(nextLine(holding("temper", [1]), "temper", 1)).toBe("NEXT STAR: ADDS 4 BURN. 1 MORE COPY TO MERGE."); // rigs alike
  });
});
// beltside-062c (ref/DESIGN-beltside.md §12 P11): a placed rig's panel (inspector.ts rigPanel) lists its hits (or IDLE),
// its ability text with the perk after the sentence it names, the next-star line and merge progress, then the flavour and
// the turn hint. 0.6.2t: blocks of whole sentences; on a short band the optional ones give way whole (T6), the kept ones
// (the hits or IDLE, the opening and perk sentences, the next star, merge progress) always show.
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
  const text = (run: Run) => rigPanel(run, 10)!.body.map((b) => (b.perk ? `${b.text} ${b.perk}` : b.text));
  const TURN = "TAP TO TURN (OR R). DRAG TO MOVE.";

  it("hits (or IDLE), the ability text, next star and merge progress, the flavour, the turn hint: written out by hand", () => {
    // a ★2 SPLITTER (T) at (3,3) facing east: one arrow on the Kiln's (4,3), tile 3; one spare copy in cargo
    expect(text(rigRun("splitter", 2, 3, 3, rotFacing("splitter", 1), 1))).toEqual([
      "→ BELT 1, TILE 3", "SPLITS EACH PAYLOAD INTO 2 COPIES AT 72% DAMAGE. ★2 CLEAN CUT", "EACH COPY KEEPS ALL OF THE BURN, POISON AND SHOCK.",
      "NEXT STAR: 2 COPIES AT 85% DAMAGE. ★3 PERFECT CUT", "1 MORE COPY TO MERGE.", "ITS COPIES CAN BACK UP AT THE TURRET AND JAM IT.", TURN,
    ]);
    // a ★1 LONG HAUL (II) at (5,3) between both belts: two hits, no perk at ★1; 0.6.2t2 (F1): no flavour kept
    expect(text(rigRun("longhaul", 1, 5, 3, 0, 0))).toEqual([
      "→ BELT 1, TILE 3", "→ BELT 2, TILE 3", "ADDS 2 DAMAGE FOR EACH EARLIER RIG HIT.", "EVERY RIG HIT ON THE PAYLOAD COUNTS, SPEED RIGS TOO.",
      "NEXT STAR: 4 DAMAGE FOR EACH EARLIER HIT, UP TO 6 HITS.", "1 MORE COPY TO MERGE.", TURN,
    ]);
    // an IDLE ★2 TEMPER: the amber warning leads
    const idle = rigPanel(rigRun("temper", 2, 0, 9, 0, 0), 10)!;
    expect([idle.body[0].role, idle.body[0].text]).toEqual(["warn", IDLE_WARNING]);
    expect(text(rigRun("temper", 2, 0, 9, 0, 0))).toEqual([
      IDLE_WARNING, "ADDS 4 BURN TO EACH PAYLOAD IT HITS.", "EACH BURN DEALS THE ENEMY HULL 1 DAMAGE A SECOND FOR 3 SECONDS.", "NEXT STAR: ADDS 7 BURN.",
      "2 MORE COPIES TO MERGE.", TURN,
    ]);
    expect([idle.sub, idle.subColor, idle.idle, idle.labels]).toEqual(["RIG · IDLE", C.amber, true, ["ROTATE", "TO CARGO"]]);
    // a ★3 X OVERDRIVE at (5,3): no next star past ★3, no ROTATE for an X
    const x = rigPanel(rigRun("overdrive", 3, 5, 3, 0, 0), 10)!;
    expect(text(rigRun("overdrive", 3, 5, 3, 0, 0))).toEqual([
      "→ BELT 1, TILE 3", "→ BELT 2, TILE 3", "MAKES THE BELTS PAST IT 5 TIMES AS FAST AND ADDS 3 DAMAGE TO EACH PAYLOAD. ★3 AFTERBURNER",
      "ENEMY CHAINS AND FROST CAN'T SLOW OR FREEZE THE BELTS PAST IT.", "ON METRONOME'S LOCKED BELTS IT ADDS 11 MORE DAMAGE INSTEAD OF THE SPEED CHANGE.",
      "FACES EVERY SIDE. DRAG TO MOVE.",
    ]);
    expect([x.sub, x.subShort, x.labels]).toEqual(["RIG · 2/4 ARROWS ON BELTS", "RIG · 2/4 HIT", ["TO CARGO"]]);
  });

  it("the phone band's compact forms: the hits on one line or up in the header, tight lines, the next star's headline", () => {
    // a ★2 SPLITTER at (5,2): three arrows on belts (the Kiln's T4, the press belt's T4 and its bend's T6)
    const rp = rigPanel(rigRun("splitter", 2, 5, 2, 0, 0), 10)!;
    expect(rp.body.filter((b) => b.role === "hits").map((b) => b.text)).toEqual(["→ BELT 1, TILE 4", "→ BELT 2, TILE 4", "→ BELT 2, TILE 6"]);
    expect(rp.variants![0].body[0].text).toBe("→ BELT 1 TILE 4, BELT 2 TILES 4 AND 6");
    expect([...new Set(rp.variants!.map((v) => v.sub).filter(Boolean))]).toEqual(["RIG → BELT 1 TILE 4, BELT 2 TILES 4 AND 6", "RIG → BELT 1 T4, BELT 2 T4 AND T6"]);
    // every compact form keeps the opening sentence (CLEAN CUT names it), the next star and merge progress
    for (const v of rp.variants!) expect(v.body.filter((b) => b.keep && b.role !== "hits").map((b) => b.role), `${v.sub}`).toEqual(["ability", "next", "merge"]);
    // an IDLE ★2 GALVANIC COIL: the warning moves up into the header, in amber (the short form where the header is narrow)
    const coil = rigPanel(rigRun("coil", 2, 0, 9, 0, 1), 10)!;
    expect([...new Set(coil.variants!.map((v) => v.sub).filter(Boolean))]).toEqual([IDLE_SHORT, IDLE_HEAD]);
    expect(coil.variants!.filter((v) => v.sub).every((v) => v.subColor === C.amber)).toBe(true);
    // the headline: the next star's first clause, where it has more than one
    expect([nextStarHeadline("coil", 2), nextStarHeadline("surge", 2), nextStarHeadline("brake", 1), nextStarHeadline("overdrive", 1)])
      .toEqual([null, "NEXT STAR: 5 TIMES AS FAST.", null, "NEXT STAR: 4 TIMES AS FAST."]);
  });

  /** The layouts a rig's shape allows on this deck: 1 hit beside the Kiln's belt, 2 hits (II, L, T, X), 3 hits in the
   *  press belt's bend (T, X), IDLE in the far corner. */
  function layouts(def: string): [string, number, number, number, number][] {
    const shape = rigShape(def)!;
    return [
      ["1hit", 3, 3, rotFacing(def, 1), 1],
      ...(shape === "L" ? [["2hit", 5, 2, 3, 2]] : shape === "I" ? [] : [["2hit", 5, 3, 0, 2]]),
      ...(shape === "T" || shape === "X" ? [["3hit", 5, 2, 0, 3]] : []),
      ["idle", 0, 9, 0, 0],
    ] as [string, number, number, number, number][];
  }
  // History: 0.6.2p (item 3) cut none of these 396 cases once its compact texts were in. 0.6.2t's whole sentences are
  // longer, so the phone band (161 x 69) gained compact forms (the hits in the header, a 6 px line pitch); a case may come
  // back here only with a written reason, and its hits and perk must still show and its next-star line start in view.
  const KNOWN_PHONE_CUTS = new Map<string, string>();

  it("phone: every buyable rig's hits (or IDLE), ability text, perk, next star and merge progress show whole", () => {
    const rigs = buyableModules().filter((d) => d.kind === "gate").map((d) => d.id);
    expect(rigs).toHaveLength(23);
    const band = buildLayout(167, 361, true, 5).info;
    let cases = 0, nextCases = 0;
    for (const def of rigs) {
      for (const s of [1, 2, 3]) for (const [lay, x, y, rot, want] of layouts(def)) for (const spare of [0, 1]) {
        const id = `${def} ★${s} ${lay} spare${spare}`;
        const rp = rigPanel(rigRun(def, s, x, y, rot, spare), 10)!;
        expect(rp.idle ? 0 : rp.body.filter((b) => b.role === "hits").length, `${id}: hits`).toBe(want);
        const plan = planPanel(rp, band);
        const drawn = new Set(visibleLines(plan).map((v) => v.line));
        const whole = plan.body.shown.filter((l) => l.b.keep).every((l) => l.lines.every((ln) => drawn.has(ln)));
        cases++;
        if (rp.body.some((b) => b.role === "next")) nextCases++;
        if (KNOWN_PHONE_CUTS.has(id)) continue;
        expect([plan.body.fits, whole], `${id} (variant ${plan.body.variant})`).toEqual([true, true]);
      }
    }
    expect(KNOWN_PHONE_CUTS.size).toBe(0);
    expect([cases, nextCases]).toEqual([396, 264]);
  });

  it("the desktop column keeps the full text in the 5x7 face: the laptop's column (1366x768: text 109 px)", () => {
    const laptop = buildLayout(455, 256, false, 5).info;
    expect(laptop.w - 10).toBe(109);
    const plan = planPanel(rigPanel(rigRun("coil", 2, 5, 2, 3, 0), 10)!, laptop);
    expect([plan.body.fits, plan.body.font]).toEqual([true, "5"]);
    const drawn = visibleLines(plan).map((v) => v.line).filter((l): l is PLine => l !== "rule").map((l) => l.spans.map((sp) => sp.t).join(""));
    expect(drawn.join(" ")).toContain("NEXT STAR: STALLS 2 MACHINES FOR 2.8 SECONDS.");
  });
});

describe("shared timing gear inspection", () => {
  it("shows the fire rate, the pendulum shift and its tiles, and the cross-hero effect at every star", () => {
    expect([1, 2, 3].map((s) => abilityText("escapement", s).sentences)).toEqual([11, 16, 22].map((p) => [
      `THE TURRET FIRES ${p}% FASTER.`, "ON METRONOME, PENDULUM SLUGS FROM THIS TURRET PEAK 1.2 SECONDS EARLIER, AFTER 7 TILES.",
    ]));
    expect([1, 2, 3].map((s) => abilityText("longcase", s).sentences)).toEqual([1.5, 2.5, 4].map((d) => [
      `SHOTS FROM PAYLOADS THAT RODE 2 SECONDS OR MORE DEAL ${d} MORE DAMAGE.`,
      "PENDULUM SLUGS DON'T GET IT; ON METRONOME THEY PEAK 1.2 SECONDS LATER ON THIS TURRET, AFTER 13 TILES.",
    ]));
  });
});

// 0.6.1f: the retuned BRAKE SHOE (HOT SHOE, RED-HOT SHOE) and SPLITTER (PERFECT CUT), written out by hand
describe("0.6.1f: BRAKE SHOE and SPLITTER name each merge's perk and value", () => {
  /** A run holding `owned` copies of `def`, its shop offering one more (a merge on purchase). */
  const offering = (def: string, owned: number[]): Run => {
    const run = holding(def, owned);
    run.gold = 99;
    run.shop.wagons = [{ merchant: ITEMS[def].merchant!, offers: [{ def, price: ITEMS[def].price, sold: false }] }] as Run["shop"]["wagons"];
    return run;
  };

  it("BRAKE SHOE: HALF SPEED at every star, and 2 / 5 DAMAGE from the heat", () => {
    expect([1, 2, 3].map((s) => abilityText("brake", s).sentences[0])).toEqual([
      "SLOWS THE BELT PAST IT TO HALF SPEED.", "SLOWS THE BELT PAST IT TO HALF SPEED AND ADDS 2 DAMAGE TO EACH PAYLOAD.",
      "SLOWS THE BELT PAST IT TO HALF SPEED AND ADDS 5 DAMAGE TO EACH PAYLOAD.",
    ]);
    expect([abilityText("brake", 2).perk, abilityText("brake", 3).perk]).toEqual([{ name: "HOT SHOE", stars: 2, after: 0 }, { name: "RED-HOT SHOE", stars: 3, after: 0 }]);
    expect(nextLine(holding("brake", [1]), "brake", 1)).toBe("NEXT STAR: ADDS 2 DAMAGE. ★2 HOT SHOE 1 MORE COPY TO MERGE.");
    expect(nextLine(holding("brake", [2]), "brake", 2)).toBe("NEXT STAR: ADDS 5 DAMAGE. ★3 RED-HOT SHOE 2 MORE COPIES TO MERGE.");
    expect(mergeLine(holding("brake", [1]), "brake")).toBe("MERGES WITH YOUR BRAKE SHOE INTO ★2: ADDS 2 DAMAGE. ★2 HOT SHOE");
    expect(mergeLine(holding("brake", [2, 1]), "brake")).toBe("MERGES WITH YOUR BRAKE SHOE INTO ★3: ADDS 5 DAMAGE. ★3 RED-HOT SHOE");
  });

  it("SPLITTER: 2 COPIES AT 60% / 72% CLEAN CUT / 85% PERFECT CUT", () => {
    expect([1, 2, 3].map((s) => gist("splitter", s))).toEqual(["2 COPIES AT 60% DAMAGE", "2 COPIES AT 72% DAMAGE", "2 COPIES AT 85% DAMAGE"]);
    expect(nextLine(holding("splitter", [1]), "splitter", 1)).toBe("NEXT STAR: 2 COPIES AT 72% DAMAGE. ★2 CLEAN CUT 1 MORE COPY TO MERGE.");
    expect(nextLine(holding("splitter", [2]), "splitter", 2)).toBe("NEXT STAR: 2 COPIES AT 85% DAMAGE. ★3 PERFECT CUT 2 MORE COPIES TO MERGE.");
    expect(mergeLine(holding("splitter", [1]), "splitter")).toBe("MERGES WITH YOUR SPLITTER INTO ★2: 2 COPIES AT 72% DAMAGE. ★2 CLEAN CUT");
    expect(mergeLine(holding("splitter", [2, 1]), "splitter")).toBe("MERGES WITH YOUR SPLITTER INTO ★3: 2 COPIES AT 85% DAMAGE. ★3 PERFECT CUT");
  });

  it("the other speed rigs read their speed in words; a rig's next-star line names the perk that star brings, once", () => {
    expect([1, 2, 3].map((s) => gist("grease", s))).toEqual(["60% FASTER", "2.3 TIMES AS FAST", "3.1 TIMES AS FAST"]);
    expect(gist("overdrive", 3)).toBe("5 TIMES AS FAST, ADDS 3 DAMAGE");
    expect(nextLine(holding("overdrive", [2]), "overdrive", 2)).toBe("NEXT STAR: 5 TIMES AS FAST, ADDS 3 DAMAGE. ★3 AFTERBURNER 2 MORE COPIES TO MERGE.");
    expect(nextLine(holding("coil", [2]), "coil", 2)).toBe("NEXT STAR: STALLS 2 MACHINES FOR 2.8 SECONDS. 2 MORE COPIES TO MERGE."); // SPARK JUMP already
  });

  it("phone: the offer's opening sentence and its MERGES WITH line show whole on the band (the tap preview)", () => {
    const band = buildLayout(167, 361, true, 5).info;
    for (const def of ["brake", "splitter", "doublestamp", "gantry", "assembly"]) {
      for (const owned of [[1], [2, 1]]) {
        const plan = planPanel(offerPanel(offering(def, owned), 0, 0)!, band);
        const drawn = new Set(visibleLines(plan).map((v) => v.line));
        expect(plan.body.fits, `${def} ${owned}`).toBe(true);
        for (const role of ["ability", "merges"] as const) {
          const ls = plan.body.shown.filter((l) => l.b.role === role && l.b.keep);
          expect(ls.length, `${def} ${owned}: ${role}`).toBeGreaterThan(0);
          expect(ls.every((l) => l.lines.every((ln) => drawn.has(ln))), `${def} ${owned}: ${role}`).toBe(true);
        }
      }
    }
  });
});
