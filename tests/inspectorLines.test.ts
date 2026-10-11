import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs"; // U2e step 1
import {
  IDLE_HEAD, IDLE_SHORT, IDLE_WARNING, mergeLine, nextLine, offerPanel, planPanel, portraitButtons, rigPanel, visibleLines,
  type PLine,
} from "../src/screens/build/inspector";
import { cargoPanel } from "../src/screens/build/inspector"; // U2e step 1
import { key as K, rotField, startingTurrets, type Placed } from "../src/sim/deck"; // beltside-062c: P11; 0.6.2s: startingTurrets; 0.8.0 I1: Placed
import { rotFacing } from "../src/sim/beltside"; // beltside-062c: P11
import { ICON, icons, textWidth } from "../src/render/font"; // U2c (U2b's faces): ICON, icons
import { C } from "../src/render/palette";
import { newRun, type Run } from "../src/game/run";
import { resolveCore } from "../src/sim/cores";
import { ITEMS, buyableModules, classFactor, rigShape, type ItemDef } from "../src/sim/content"; // U2c: classFactor
import { effectAt, fusible, outputsAt, pendingAt } from "../src/sim/stars"; // U2c (U2b's faces): effectAt
import { buildLayout } from "../src/screens/build/layout";
import { abilityText, gist, livePerk, newPerk, nextStarHeadline, nextStarText, type TextOpts } from "../src/ui/abilityText";
import { REMINDER, faceLines, faceMerge, faceNext, hasFace } from "../src/ui/faces"; // U2c (U2b's faces): the face kit
import { faceNextBlock } from "../src/screens/build/faceBlocks"; // U2c (U2b's faces)
import { fmtCount, fmtDmg, fmtPct, fmtSec } from "../src/ui/statFormat"; // U2c (U2b's faces): the formatters
import { fmtSpeed } from "../src/ui/statFormat"; // NUM-4 (REQ-BFG-047): a stamp's SPEED as it is (NUM-2: its interval, 30 / speed, via secPer)
import { DISRUPT_TIME, WINDOW_TIME } from "../src/sim/content"; // NUM-3 step 2: HOT SWAP's spark STUN, ROTARY's load time
import { stripIcons } from "../src/render/font"; // Y1: COIL's one line, read as text
import { RIDE_KEEP, withLadderFix } from "../src/sim/ladderFix"; // AZ-BUMP (the flip, LADDER_FIX): OVERDRIVE's ride-keep words, and off

// 0.6.1r (review-061 F5, N2, N4) and after: the inspector's ability, next-star, merge-progress and MERGES WITH lines.
// 0.6.2t (REQ-BFG-032): they read as whole sentences from the glossary (src/ui/abilityText.ts): "NEXT STAR: ADDS 4 BURN.",
// "1 MORE COPY TO MERGE.", "MERGES WITH YOUR TEMPER INTO ★2: ADDS 4 BURN." (were "NEXT ★2: +4 BURN · NEEDS 1 MORE" and
// "MERGES WITH YOUR TEMPER ★1 → ★2 · +4 BURN"). Every expected string is written out by hand from the catalogue numbers
// (content.ts), never recomputed with the inspector's or the glossary's code.
// U2c (U2b's faces): a piece with a face (src/ui/faces.ts) draws its face's lines instead: its rule lines, reminder and
// interim clause, NEXT★ ("NEXT ★2: +2 {BURN}") and MERGES INTO ("MERGES INTO ★2: +2 {BURN}."). Those expectations are
// built through the face kit (faceLines, faceNext, faceNextBlock, faceMerge, REMINDER), or from the sim's value through
// the formatter that prints it (src/ui/statFormat.ts), never from a pasted number.

/** A run of `hero` holding the given copies of `def` in cargo (stars absent = 1). */
function holding(def: string, stars: number[], hero: "furnace" | "weaver" = "furnace"): Run {
  const run = newRun(hero, 4242);
  run.inventory = stars.map((s, i) => ({ uid: 900 + i, def, ...(s > 1 ? { stars: s } : {}) }));
  return run;
}

/** U2c (U2b's faces): the face kit's options as a FURNACE run's panels read them: the class factor of the hero's first
 *  starting turret (content.ts classFactor: heavy, k 1) and the hero (MIMIC FORGE stamps the hero's slugs). */
const FURNACE: TextOpts = { k: classFactor(effectAt(startingTurrets("furnace")[0].def, 1).turret!), hero: "furnace" };

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

// 0.6.2t (T5): merge progress was a sentence of its own, "1 MORE COPY TO MERGE." / "2 MORE COPIES TO MERGE." (0.6.2p item
// 2's "NEEDS 1 MORE" before it). U2e step 1 (REQ-BFG-070; the operator: "The items don't need to say 1 more to merge."):
// it is gone. T5's three tests (TEMPER's counts, every fusible module's count, the free starting turret's count) become
// one: no panel, at any star, draws merge progress (no "TO MERGE", no copy count), and the next-star line (now the ⓘ
// view's) is the NEXT★ block or the NEXT STAR sentence alone.
describe("U2e step 1 (was N2 / T5): no panel draws merge progress", () => {
  it("every fusible piece's cargo, offer and placed or fitted panels at every star, and its next-star line: no copy count", () => {
    const COPIES = /TO MERGE|MORE COP(Y|IES)|NEEDS \d MORE|\bCOPIES? (LEFT|NEEDED)\b/;
    const fus = Object.keys(ITEMS).filter(fusible);
    // 23 rigs, 13 factories, 13 cores and 9 mods at 65a36b7; + 13 turrets (0.6.2s); 0.8.0 I1 M2 (REPORT-P1 section 13):
    // + wave 3's 15 (was 71). FLIP-X2 (REQ-BFG-069, the sustain switch on): + WARD BELL, MEND PRESS and MENDING LOOM (ITEMS
    // lists them now); the dormant SIFTER stays an ITEMS entry, fusible (old decks hold it): 86 -> 89
    expect(fus).toHaveLength(89);
    let panels = 0, lines = 0;
    for (const def of fus) {
      const d = ITEMS[def];
      for (const s of [1, 2, 3]) {
        // a ★s copy (uid 900) and a ★1 copy in cargo, and one more on offer (a merge on purchase below ★3)
        const run = holding(def, [s, 1]);
        run.gold = 99;
        run.shop.wagons = [{ merchant: d.merchant ?? "ironmonger", offers: [{ def, price: d.price, sold: false }] }] as Run["shop"]["wagons"];
        for (const p of [cargoPanel(run, 900), offerPanel(run, 0, 0)]) {
          for (const body of [p!.body, ...(p!.variants ?? []).map((v) => v.body)]) for (const b of body) {
            expect(b.role, `${def} ★${s}`).not.toBe("merge");
            expect(`${b.text} ${b.perk ?? ""} ${b.alt ?? ""}`, `${def} ★${s}`).not.toMatch(COPIES);
          }
          panels++;
        }
        const line = nextLine(run, def, s);
        if (!line) continue;
        // a piece with a face: its NEXT★ block exactly (faceNextBlock at the run's options, the perk that star brings after
        // it); else today's "NEXT STAR: ... ." sentence, and nothing after either
        const nx = faceNextBlock(def, s, FURNACE);
        if (nx) expect(line, def).toBe(`${nx.text}${nx.perk ? ` ${nx.perk}` : ""}`);
        else expect(line, def).toMatch(/^NEXT STAR: [^·]+\.( ★\d [A-Z' -]+)?$/);
        expect(line, def).not.toMatch(COPIES);
        lines++;
      }
    }
    expect(panels).toBe(2 * 3 * fus.length);
    expect(lines).toBe(2 * fus.length); // ★1 and ★2 have a next star; ★3 none
    // and no source the panels draw from holds a copy count's words
    for (const f of ["src/ui/abilityText.ts", "src/ui/faces.ts", "src/screens/build/inspector.ts", "src/screens/build/faceBlocks.ts", "src/screens/build/keywords.ts", "src/screens/build/turretPanel.ts", "src/ui/glossary.ts"]) {
      expect(readFileSync(new URL(`../${f}`, import.meta.url), "utf8"), f).not.toMatch(COPIES);
    }
  });
});

describe("N4: a turret core's lines show that star's numbers at the hero's class factor", () => {
  it("PRESSURE BREECH on FURNACE (heavy, k 1): ★1 -> ★2 and ★2 -> ★3", () => {
    // U2c (U2b's faces): NEXT★ and MERGES INTO show that star's damage per load waiting, "+26 {DMG}" (NUM-1: x10, was
    // "+2.6 {DMG}"; its perQueued, at
    // k 1, through fmtDmg, the face's formatter); were "NEXT STAR: 2.6 MORE DAMAGE FOR EACH PAYLOAD WAITING." and
    // "MERGES WITH YOUR PRESSURE BREECH INTO ★2: 2.6 MORE DAMAGE FOR EACH PAYLOAD WAITING."
    const per = (s: number): string => `+${fmtDmg(effectAt("pressure", s).core!.perQueued!)} ${ICON.DMG}`;
    expect(nextLine(holding("pressure", [1]), "pressure", 1)).toBe(`NEXT ★2: ${per(2)}`);
    expect(mergeLine(holding("pressure", [1]), "pressure")).toBe(`MERGES INTO ★2: ${per(2)}.`);
    // NUM-1 (REQ-BFG-047): x10, the ★2 perQueued through fmtDmg ("26"; was the literal "2.6")
    expect(abilityText("pressure", 2).sentences[0]).toBe(`SHOTS DEAL ${fmtDmg(effectAt("pressure", 2).core!.perQueued!)} MORE DAMAGE FOR EACH PAYLOAD WAITING, UP TO 5 PAYLOADS.`);
    expect(nextLine(holding("pressure", [2]), "pressure", 2)).toBe(`NEXT ★3: ${per(3)}`);
    expect(mergeLine(holding("pressure", [2, 1]), "pressure")).toBe(`MERGES INTO ★3: ${per(3)}.`);
  });

  it("on WEAVER (light, k 0.55) the absolute numbers scale like the fitted core's: 2.6 x 0.55 = 1.43, 4.2 x 0.55 = 2.31", () => {
    // NUM-1 (REQ-BFG-047): x10 and whole at install (cores.ts scaleCore, kp 55): 26 x 0.55 = 14.3 -> 14, 42 x 0.55 = 23.1
    // -> 23, so NEXT★ shows "+14 {DMG}" / "+23 {DMG}" (the title's 1.43 / 2.31 are the pre-NUM-1 numbers)
    // U2c (U2b's faces): NEXT★ shows "+1.4 {DMG}" / "+2.3 {DMG}": the fitted core's k-scaled perQueued at that star
    // (resolveCore, as below) through fmtDmg, the face's formatter; were "NEXT STAR: 1.4 MORE DAMAGE FOR EACH PAYLOAD
    // WAITING." and "NEXT STAR: 2.3 MORE DAMAGE FOR EACH PAYLOAD WAITING."
    const fitted = (stars: number): number => {
      const r = newRun("weaver", 4242);
      r.build.mods.push({ uid: 950, def: "pressure", turret: 0, stars });
      return resolveCore(r.build, 0).spec.perQueued!;
    };
    expect(nextLine(holding("pressure", [1], "weaver"), "pressure", 1)).toBe(`NEXT ★2: +${fmtDmg(fitted(2))} ${ICON.DMG}`);
    expect(nextLine(holding("pressure", [2], "weaver"), "pressure", 2)).toBe(`NEXT ★3: +${fmtDmg(fitted(3))} ${ICON.DMG}`);
    // the turret panel's source for the same core once fitted: resolveCore's k-scaled spec
    const run = newRun("weaver", 4242);
    run.build.mods.push({ uid: 950, def: "pressure", turret: 0, stars: 2 });
    // NUM-1 (REQ-BFG-047): ★2 perQueued x10 (26) and whole at install (cores.ts scaleCore: kp = round(100 x 0.55) = 55,
    // roundHalfUp(26 x 55 / 100) = roundHalfUp(14.3) = 14); was toBeCloseTo(1.43, 6)
    expect(resolveCore(run.build, 0).spec.perQueued).toBe(14);
  });

  // Y7b2 (the flip): retitled, was "ROTARY BREECH: its stars make the turret fire faster, then never jam (the perk named
  // after that sentence)". Its fire rate and no-jam left with the flip (Y4, DESIGN-Y row 37), and with them the perk names
  // GREASED RACE and CLEAN FEED (the words): each star fires a part-full chamber sooner, 50% / 65% / 80%
  it("ROTARY BREECH: each star fires a part-full chamber sooner (no fire rate, no no-jam, no perk name since release Y)", () => {
    // NUM-4 (REQ-BFG-047; N1 2.2): the load window (WINDOW_TIME, 1.5 s) is a hidden timer no whole second can say, so the
    // sentence keeps the rule, not the number: "..., SOON AFTER THE FIRST LOAD." (was "..., 1.5 SECONDS AFTER THE FIRST
    // LOAD."); that the clause is gone is checked below
    // Y7b2 (the flip): S.chamber's sentence left ("A TURRET FIRES WHEN ITS CHAMBER IS FULL OR ITS LOAD TIME ENDS, SOON AFTER
    // THE FIRST LOAD."), so ROTARY's text is its one sentence at every star
    // NUM-3 step 2 (REQ-BFG-047, N1 2.2's LOAD 50% SHORTER): its load time as the whole % it is shorter than WINDOW_TIME,
    // from that star's windowTime (0.75 of 1.5 s) through fmtPct (50%); was the literal CUTS THE LOAD TIME TO 0.8 SECONDS AND
    // FIRES THE OLDEST LOAD FIRST.
    const cut = (s: number): string => fmtPct(1 - effectAt("rotary", s).core!.windowTime! / WINDOW_TIME);
    // Y7b2 (the flip): release Y's sentence (was `ITS LOAD TIME IS ${cut(s)} SHORTER, AND IT FIRES THE OLDEST LOAD FIRST.`)
    const OPEN = (s: number): string => `IT FIRES A PART-FULL CHAMBER ${cut(s)} SOONER, THE OLDEST LOAD FIRST.`;
    // Y7b2 (the flip, the words): were { sentences: [OPEN(1), CHAMBER] }, { sentences: [OPEN(2), "IT FIRES 18% FASTER.",
    // CHAMBER], perk: { name: "GREASED RACE", stars: 2, after: 1 } } and { sentences: [OPEN(3), "IT FIRES 43% FASTER AND NEVER
    // JAMS.", CHAMBER], perk: { name: "CLEAN FEED", stars: 3, after: 1 } }
    expect(abilityText("rotary", 1)).toEqual({ sentences: [OPEN(1)] });
    expect(abilityText("rotary", 2)).toEqual({ sentences: [OPEN(2)] });
    expect(abilityText("rotary", 3)).toEqual({ sentences: [OPEN(3)] });
    // NUM-3 step 2: was LOAD TIME 0.8 SECONDS. Y7b2 (the flip): was `LOAD ${cut(1)} SHORTER`
    expect(gist("rotary", 1)).toBe(`PART-FULL CHAMBERS ${cut(1)} SOONER`);
    // NUM-4 (REQ-BFG-047): the load window's clause is gone at every star: no sentence quotes its seconds (WINDOW_TIME)
    for (const s of [1, 2, 3]) {
      const said = abilityText("rotary", s).sentences.join(" ");
      expect(said, `rotary ★${s}`).not.toMatch(/\bSECONDS?\b/);
      expect(said, `rotary ★${s}`).not.toContain(String(WINDOW_TIME));
    }
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
  // NUM-1 (REQ-BFG-047): the slug damage x10 (catalogue: AMMO plain 30 / shot 10 / slag 70, factory bases 50, 20, 30,
  // 120, 150, 60); was 3 / 5 / 5, 1 / 2 / 3, 7 / 12 / 15 and GANTRY ★3's 6. Burn stacks, counts and times unchanged
  /** NUM-3 step 2: HOT SWAP's spark STUN at a star, from the data (its shockTime, else DISRUPT_TIME), through fmtSec. */
  const spark = (s: number): string => fmtSec(effectAt("hotswap", s).factory!.cycle!.find((p) => p.tint === "spark")!.shockTime ?? DISRUPT_TIME);
  /** NUM-4 (REQ-BFG-047): a factory's stamp SPEED at a star, from the data (effectAt's factory speed) through fmtSpeed. */
  const rateAt = (def: string, s: number): string => fmtSpeed(effectAt(def, s).factory!.speed);
  const HEAD: Record<string, [string, string, string]> = {
    // NUM-2 (REQ-BFG-047): the stamp every 30 / speed s (two decimals): DOUBLE STAMP 14 / 19 / 19 -> 2.14 / 1.58 / 1.58 (was
    // 2.2 / 1.6 / 1.6), SHOT TOWER 20 / 22 / 23 -> 1.5 / 1.36 / 1.3 (was 1.5 / 1.35 / 1.3), SLAG POT 11 / 14 / 17 -> 2.73 /
    // 2.14 / 1.76 (was 2.8 / 2.2 / 1.75)
    // NUM-4 (REQ-BFG-047): the clause quotes the stamp's SPEED itself, "AT RATE n" (abilityText rate(), the RATE number on the
    // face), from the data through fmtSpeed (rateAt: DOUBLE STAMP 14 / 19 / 19, SHOT TOWER 20 / 22 / 23, SLAG POT 11 / 14 /
    // 17); was its interval, 30 / speed: "EVERY 2.14 SECONDS" and the like. The slug damage and batch as before
    doublestamp: [`2 SLUGS OF 30 DAMAGE AT RATE ${rateAt("doublestamp", 1)}`, `2 SLUGS OF 50 DAMAGE AT RATE ${rateAt("doublestamp", 2)}`, `3 SLUGS OF 50 DAMAGE AT RATE ${rateAt("doublestamp", 3)}`],
    shottower: [`10 DAMAGE BUCKSHOT AT RATE ${rateAt("shottower", 1)}`, `20 DAMAGE BUCKSHOT AT RATE ${rateAt("shottower", 2)}`, `30 DAMAGE BUCKSHOT AT RATE ${rateAt("shottower", 3)}`],
    // NUM-3 step 2 (REQ-BFG-047, N1 2.2): the spark's STUN through the data (DISRUPT_TIME 2 at ★1, shockTime 2 / 3) and
    // fmtSec; was the literal 1.6 / 1.8 / 2.8
    // NUM-4 (REQ-BFG-047; REVIEW-NUM3 F2): a stop's one word is STUN, SHOCK STUNS (was SHOCK STALLS); its numbers as before
    // Y7b2 (the flip): HOT SWAP's SPARK JUMP left and its ember BURN is 2 / 5 / 9 (Y2, DESIGN-Y row 12), so every star's
    // shock STUNS A MACHINE (were `4 BURN, SHOCK STUNS 2 MACHINES FOR ${spark(2)} SECONDS` and `7 BURN, SHOCK STUNS 2
    // MACHINES FOR ${spark(3)} SECONDS`)
    hotswap: [`2 BURN, SHOCK STUNS A MACHINE FOR ${spark(1)} SECONDS`, `5 BURN, SHOCK STUNS A MACHINE FOR ${spark(2)} SECONDS`, `9 BURN, SHOCK STUNS A MACHINE FOR ${spark(3)} SECONDS`],
    slagpot: [`70 DAMAGE SLAG AT RATE ${rateAt("slagpot", 1)}`, `120 DAMAGE SLAG AT RATE ${rateAt("slagpot", 2)}`, `150 DAMAGE SLAG AT RATE ${rateAt("slagpot", 3)}`], // NUM-2 and NUM-4: above
    // Y7b2 (the flip): START's words, ONLINE retired (Y3: its rigs start 50% / 75% / 100% sooner; were "RIGS ONLINE IN HALF
    // THE TIME", "RIGS ONLINE IN A QUARTER OF THE TIME" and "ALL RIGS ONLINE AT ONCE")
    assembly: ["RIGS START 50% SOONER", "RIGS START 75% SOONER", "ALL RIGS START AT ONCE"],
    // bb-0.8.3 (REQ-BFG-042 D3, M4): its belts (3 / 4 / 5, were 2 / 3 / 3) close the next-star line, so the clause is
    // FOURTH ARM's stamp (0.8.0: "FEEDS 2 BELTS", "FEEDS 3 BELTS", "6 DAMAGE SLUGS"). T47 (REQ-BFG-047): no seconds, so
    // ★1 says its belts (as 0.8.4 did) and FOURTH ARM says FASTER
    gantry: ["FEEDS 3 BELTS", "FASTER PLAIN SLUGS", "60 DAMAGE SLUGS"], // NUM-1: x10 (was 6)
  };
  // bb-0.8.3 (REQ-BFG-042 D3): GANTRY PRESS ★2 is FOURTH ARM (was THIRD ARM). Y7b2 (the words): ASSEMBLY LINE ★3's HOT
  // START left with its rule (was assembly: ["", "HOT START"])
  const PERK: Record<string, [string, string]> = { doublestamp: ["", "TRIPLE DIES"], shottower: ["", ""], hotswap: ["", ""], slagpot: ["", ""], assembly: ["", ""], gantry: ["FOURTH ARM", "HEAVY GANTRY"] };

  it("gist, the next-star sentence and MERGES WITH (STAMP PRESS keeps its stamp rate and slug damage)", () => {
    // NUM-1 (REQ-BFG-047): x10, STAMP PRESS ★2's factory base through fmtDmg ("50"; was the literal "5")
    // NUM-2 (REQ-BFG-047): and its stamp interval through the data, 30 / speed (★2 speed 27: 1.11; was the literal 1.1)
    // NUM-4 (REQ-BFG-047): the stamp rate the clause quotes is its SPEED, effectAt("press", 2).factory.speed through fmtSpeed,
    // "AT RATE 27" (abilityText rate()); was the interval, 30 / speed, "EVERY 1.11 SECONDS"
    expect(gist("press", 2)).toBe(`${fmtDmg(effectAt("press", 2).factory!.base!)} DAMAGE SLUGS AT RATE ${fmtSpeed(effectAt("press", 2).factory!.speed)}`);
    // NUM-4: a rate the clauses quote is whole (fmtSpeed prints a fraction as it is: no decimal may reach these clauses)
    for (const h of [[gist("press", 2)], ...Object.values(HEAD)]) for (const g of h) expect(g).not.toMatch(/\d\.\d/);
    for (const [def, h] of Object.entries(HEAD)) {
      expect([1, 2, 3].map((s) => gist(def, s)), def).toEqual(h);
      const [p2, p3] = PERK[def];
      // U2c (U2b's faces): a factory with a face (all but ASSEMBLY LINE, a RULES piece that keeps its sentences) draws
      // NEXT★ and MERGES INTO from its face (faceNext, faceMerge: the next star's numbers that differ, as icon pairs, at
      // the run's options), where it drew "NEXT STAR: <its clause>, n BELTS." and "MERGES WITH YOUR <name> INTO ★2: <its
      // clause>, n BELTS."; the perk and merge progress follow as before. Y7b2 (the flip): ASSEMBLY LINE has a face too
      // (release Y's, folded from STAR_FACES), so all six draw their faces' lines
      const face = hasFace(def);
      const next2 = face ? faceNext(def, 1, FURNACE)!.text : `NEXT STAR: ${h[1]}, ${outputsAt(def, 2)} BELTS.`;
      const next3 = face ? faceNext(def, 2, FURNACE)!.text : `NEXT STAR: ${h[2]}, ${outputsAt(def, 3)} BELTS.`;
      const into2 = face ? faceMerge(def, 2, FURNACE)! : `MERGES WITH YOUR ${ITEMS[def].name} INTO ★2: ${h[1]}, ${outputsAt(def, 2)} BELTS.`;
      // bb-0.8.3 (REQ-BFG-042 M4): each line closes with the factory's belt slots at that star
      expect(nextLine(holding(def, [1]), def, 1), def).toBe(`${next2}${p2 ? ` ★2 ${p2}` : ""}`);
      expect(nextLine(holding(def, [2]), def, 2), def).toBe(`${next3}${p3 && p3 !== p2 ? ` ★3 ${p3}` : ""}`);
      expect(mergeLine(holding(def, [1]), def), def).toBe(`${into2}${p2 ? ` ★2 ${p2}` : ""}`);
      // U2c (U2b's faces): M4's belts on a face: its NEXT★ and MERGES INTO lines carry that star's belt slots as the BELT
      // pair (outputsAt through fmtCount), where the sentence closed with "n BELTS."
      if (face) for (const [line, s] of [[next2, 2], [next3, 3], [into2, 2]] as const) expect(line, `${def} ★${s}`).toContain(`${ICON.BELT}${fmtCount(outputsAt(def, s))}`);
    }
    // U2c (U2b's faces): rigs alike: TEMPER's NEXT★ line (faceNext), was "NEXT STAR: ADDS 2 BURN."
    expect(nextLine(holding("temper", [1]), "temper", 1)).toBe(`${faceNext("temper", 1)!.text}`); // rigs alike
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
   *  with `rot`, and `spare` ★1 copies of it in cargo. 0.8.0 I1 (oracle 8f9b367675fb8998): `extra` items (factories with
   *  no belt, for a STOKER's two-factory case). */
  function rigRun(def: string, stars: number, x: number, y: number, rot: number, spare: number, extra: Placed[] = []): Run {
    const run = newRun("furnace", 5, "p11");
    run.inventory = Array.from({ length: spare }, (_, i) => ({ uid: 800 + i, def }));
    run.build = {
      hero: "furnace", mods: [], beltCap: 30, hullBonus: 0,
      items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 7, def: "press", x: 6, y: 6 }, ...extra, { uid: 10, def, x, y, ...rotField(def, rot), ...(stars > 1 ? { stars } : {}) }],
      routes: [{ factory: 1, cells: [...SHORT] }, { factory: 7, cells: [...SIDE] }],
    };
    return run;
  }
  const text = (run: Run) => rigPanel(run, 10)!.body.map((b) => (b.perk ? `${b.text} ${b.perk}` : b.text));
  const TURN = "TAP TO TURN (OR R). DRAG TO MOVE.";

  it("hits (or IDLE), the ability text, next star and merge progress, the flavour, the turn hint: written out by hand", () => {
    // a ★2 SPLITTER (T) at (3,3) facing east: one arrow on the Kiln's (4,3), tile 3; one spare copy in cargo
    // U2c (U2b's faces): its face's one rule line (faceLines) then its perk, and NEXT★ (faceNext) then the next perk; were
    // "SPLITS EACH PAYLOAD INTO 2 COPIES AT 72% DAMAGE. ★2 CLEAN CUT", "EACH COPY KEEPS ALL OF THE BURN, POISON AND
    // SHOCK.", "NEXT STAR: 2 COPIES AT 85% DAMAGE. ★3 PERFECT CUT"; hits, merge progress, flavour and hint as before
    // U2e step 4 (REQ-BFG-070): no NEXT★ on the face (the ⓘ view's LEVELS show it: nextLine below), no merge progress
    // Y7b2 (the words; ruling R-1 for every piece): no perk name after the face line, CLEAN CUT is in the ⓘ LEVELS only (was
    // `${faceLines("splitter", 2)!.rules[0].text} ★2 CLEAN CUT`); the ⓘ view's NEXT★ (nextLine) keeps PERFECT CUT
    expect(text(rigRun("splitter", 2, 3, 3, rotFacing("splitter", 1), 1))).toEqual([
      "→ BELT 1, TILE 3", faceLines("splitter", 2)!.rules[0].text,
      "ITS COPIES CAN BACK UP AT THE TURRET AND JAM IT.", TURN,
    ]);
    expect(nextLine(rigRun("splitter", 2, 3, 3, rotFacing("splitter", 1), 1), "splitter", 2)).toBe(`${faceNext("splitter", 2)!.text} ★3 PERFECT CUT`);
    // a ★1 LONG HAUL (II) at (5,3) between both belts: two hits, no perk at ★1; 0.6.2t2 (F1): no flavour kept
    // U2c (U2b's faces): its face's rule line (faceLines) and NEXT★ (faceNext); were "ADDS 1 DAMAGE FOR EACH EARLIER RIG
    // HIT.", "EVERY RIG HIT ON THE PAYLOAD COUNTS, SPEED RIGS TOO.", "NEXT STAR: 2 DAMAGE FOR EACH EARLIER HIT, UP TO 6 HITS."
    expect(text(rigRun("longhaul", 1, 5, 3, 0, 0))).toEqual([
      "→ BELT 1, TILE 3", "→ BELT 2, TILE 3", faceLines("longhaul", 1)!.rules[0].text, TURN, // U2e: no NEXT★, no merge progress
    ]);
    // an IDLE ★2 TEMPER: the amber warning leads
    const idle = rigPanel(rigRun("temper", 2, 0, 9, 0, 0), 10)!;
    expect([idle.body[0].role, idle.body[0].text]).toEqual(["warn", IDLE_WARNING]);
    // U2c (U2b's faces): its face's rule line (faceLines), BURN's reminder (REMINDER.BURN) and NEXT★ (faceNext); were
    // "ADDS 2 BURN TO EACH PAYLOAD IT HITS.", "EACH BURN DEALS THE ENEMY HULL 1 DAMAGE A SECOND FOR 3 SECONDS.", "NEXT STAR:
    // ADDS 4 BURN."
    // U2e step 4 (REQ-BFG-070): no reminder and no NEXT★ on the face (a tap and the ⓘ view show them), no merge progress
    expect(text(rigRun("temper", 2, 0, 9, 0, 0))).toEqual([IDLE_WARNING, faceLines("temper", 2)!.rules[0].text, TURN]);
    expect(faceLines("temper", 2)!.reminders).toEqual([icons(REMINDER.BURN())]);
    expect([idle.sub, idle.subColor, idle.idle, idle.labels]).toEqual(["RIG · IDLE", C.amber, true, ["ROTATE", "TO CARGO"]]);
    // a ★3 X OVERDRIVE at (5,3): no next star past ★3, no ROTATE for an X
    // U2c (U2b's faces): its face's two rule lines, then its ★3 clause, whose brass label names the perk (faceLines); were
    // "MAKES THE BELTS PAST IT 5 TIMES AS FAST AND ADDS 3 DAMAGE TO EACH PAYLOAD. ★3 AFTERBURNER", "ENEMY CHAINS AND FROST
    // CAN'T SLOW OR FREEZE THE BELTS PAST IT.", "ON METRONOME'S LOCKED BELTS IT ADDS 11 MORE DAMAGE INSTEAD OF THE SPEED
    // CHANGE." (R1 dropped the METRONOME line)
    // Y7b2 (the flip): release Y's OVERDRIVE face is one line, "ITS BELTS RUN 5 TIMES AS FAST." (no flat, no guard, so no
    // ★3 clause; was od.rules[0].text, od.rules[1].text, od.clause!.text), and the words keep its perk's name in the ⓘ view
    // (was expect(od.clause!.label).toBe("★3 AFTERBURNER:"), the perk named by its clause's brass label)
    const x = rigPanel(rigRun("overdrive", 3, 5, 3, 0, 0), 10)!;
    const od = faceLines("overdrive", 3)!;
    // AZ-BUMP (the flip, LADDER_FIX): + its second rule line, ★3's ride-keep "KEEPS 100% OF THE RIDE IT CUTS." (AZ-PREP (g)),
    // so [1, undefined] -> [2, undefined]; with LADDER_FIX off the one line, as before
    expect(text(rigRun("overdrive", 3, 5, 3, 0, 0))).toEqual([
      "→ BELT 1, TILE 3", "→ BELT 2, TILE 3", od.rules[0].text, od.rules[1].text,
      "FACES EVERY SIDE. DRAG TO MOVE.",
    ]);
    expect([od.rules.length, od.rules[1].text, od.clause]).toEqual([2, `KEEPS ${fmtPct(RIDE_KEEP[3])} OF THE RIDE IT CUTS.`, undefined]);
    withLadderFix(() => {
      expect(text(rigRun("overdrive", 3, 5, 3, 0, 0))).toEqual(["→ BELT 1, TILE 3", "→ BELT 2, TILE 3", faceLines("overdrive", 3)!.rules[0].text, "FACES EVERY SIDE. DRAG TO MOVE."]);
      expect([faceLines("overdrive", 3)!.rules.length, faceLines("overdrive", 3)!.clause]).toEqual([1, undefined]);
    }, false);
    expect([x.sub, x.subShort, x.labels]).toEqual(["RIG · 2/4 ARROWS ON BELTS", "RIG · 2/4 HIT", ["TO CARGO"]]);
  });

  it("the phone band's compact forms: the hits on one line or up in the header, tight lines, the next star's headline", () => {
    // a ★2 SPLITTER at (5,2): three arrows on belts (the Kiln's T4, the press belt's T4 and its bend's T6)
    const rp = rigPanel(rigRun("splitter", 2, 5, 2, 0, 0), 10)!;
    expect(rp.body.filter((b) => b.role === "hits").map((b) => b.text)).toEqual(["→ BELT 1, TILE 4", "→ BELT 2, TILE 4", "→ BELT 2, TILE 6"]);
    expect(rp.variants![0].body[0].text).toBe("→ BELT 1 TILE 4, BELT 2 TILES 4 AND 6");
    expect([...new Set(rp.variants!.map((v) => v.sub).filter(Boolean))]).toEqual(["RIG → BELT 1 TILE 4, BELT 2 TILES 4 AND 6", "RIG → BELT 1 T4, BELT 2 T4 AND T6"]);
    // every compact form keeps the opening sentence (CLEAN CUT names it), the next star and merge progress
    for (const v of rp.variants!) expect(v.body.filter((b) => b.keep && b.role !== "hits").map((b) => b.role), `${v.sub}`).toEqual(["ability"]); // U2e steps 1 and 4: no "merge" block, no "next" (the ⓘ view's)
    // an IDLE ★2 GALVANIC COIL: the warning moves up into the header, in amber (the short form where the header is narrow)
    const coil = rigPanel(rigRun("coil", 2, 0, 9, 0, 1), 10)!;
    expect([...new Set(coil.variants!.map((v) => v.sub).filter(Boolean))]).toEqual([IDLE_SHORT, IDLE_HEAD]);
    expect(coil.variants!.filter((v) => v.sub).every((v) => v.subColor === C.amber)).toBe(true);
    // the headline: the next star's first clause, where it has more than one. Y7b2: SURGE VALVE's next star is its damage pulse
    // alone (the flip: no speed; was "NEXT STAR: 5 TIMES AS FAST.") and OVERDRIVE's its speed alone (the words: its gist reads
    // the data, no SAFE FROM CHAINS; was "NEXT STAR: 4 TIMES AS FAST."), one clause each, so none of the four has a headline
    // AZ-BUMP (the flip, LADDER_FIX): OVERDRIVE's null -> "NEXT STAR: 4 TIMES AS FAST.", its ★2 gist has two clauses again
    // ("4 TIMES AS FAST, KEEPS 50% OF THE RIDE": the ride-keep, AZ-PREP (g)), so the headline is the first; with LADDER_FIX off
    // one clause and no headline, as before
    expect([nextStarHeadline("coil", 2), nextStarHeadline("surge", 2), nextStarHeadline("brake", 1), nextStarHeadline("overdrive", 1)])
      .toEqual([null, null, null, "NEXT STAR: 4 TIMES AS FAST."]);
    expect(withLadderFix(() => nextStarHeadline("overdrive", 1), false)).toBeNull();
  });

  /** The layouts a rig's shape allows on this deck: 1 hit beside the Kiln's belt, 2 hits (II, L, T, X), 3 hits in the
   *  press belt's bend (T, X), IDLE in the far corner. 0.8.0 I1 (oracle 8f9b367675fb8998): a STOKER's hits are factories:
   *  1 beside the Kiln (its first stokeSpots spot), 2 between two added foundries (the longest factory names, DRAG CHAIN
   *  FOUNDRY and FROSTBITE FOUNDRY, no belts), IDLE in the far corner. */
  function layouts(def: string): [string, number, number, number, number, Placed[]?][] {
    const shape = rigShape(def)!;
    if (ITEMS[def].gate?.stoke) {
      const foundries: Placed[] = [{ uid: 2, def: "dragchain", x: 0, y: 8 }, { uid: 3, def: "frostbite", x: 3, y: 8 }];
      return [["1hit", 3, 6, 0, 1], ["2hit", 2, 8, 0, 2, foundries], ["idle", 0, 9, 0, 0]];
    }
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
    expect(rigs).toHaveLength(30); // 0.8.0 I1 M2 (REPORT-P1 section 13): + wave 3's 8 rigs (was 23); FLIP-X2: SIFTER dormant, 31 -> 30
    const band = buildLayout(167, 394, true, 5).info; // PACKS Q5: the 161 x 69 band (0.8.5's 167 x 361 plus the pack row)
    let cases = 0, nextCases = 0;
    for (const def of rigs) {
      for (const s of [1, 2, 3]) for (const [lay, x, y, rot, want, extra] of layouts(def)) for (const spare of [0, 1]) {
        const id = `${def} ★${s} ${lay} spare${spare}`;
        const rp = rigPanel(rigRun(def, s, x, y, rot, spare, extra), 10)!;
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
    // 0.8.0 I1 M2: + wave 3's 8 rigs (was [396, 264]); U2e step 4 (REQ-BFG-070): no rig panel draws a next-star line (the ⓘ
    // view's LEVELS hold it), so none of the 534 has one (was 356, the ★1 and ★2 cases)
    expect([cases, nextCases]).toEqual([522, 0]); // FLIP-X2: SIFTER dormant, its 12 rig cases leave (was 534)
  });

  it("the desktop column keeps the full text in the 5x7 face: the laptop's column (1366x768: text 109 px)", () => {
    const laptop = buildLayout(455, 256, false, 5).info;
    expect(laptop.w - 10).toBe(109);
    const plan = planPanel(rigPanel(rigRun("coil", 2, 5, 2, 3, 0), 10)!, laptop);
    expect([plan.body.fits, plan.body.font]).toEqual([true, "5"]);
    const drawn = visibleLines(plan).map((v) => v.line).filter((l): l is PLine => l !== "rule").map((l) => l.spans.map((sp) => sp.t).join(""));
    // U2c (U2b's faces): the next star drawn in full was the face's NEXT★ line (faceNext: "NEXT ★3: {STUN} 2.8"). U2e step 4
    // (REQ-BFG-070): the face draws no NEXT★; the full text in 5x7 is its rule line and its ★2 clause, each whole
    // Y1 (STAR-D row 1, cap's ruling R-1): COIL ★2's SPARK JUMP is its line's part count ("HIT: {*STUN} 2 ON 2 PARTS."), so
    // the full text is that one line, whole, with no clause and no perk name (was: the rule line and the ★2 clause "★2 SPARK
    // JUMP: {*STUN} HITS 2 PARTS.", each whole)
    const fl = faceLines("coil", 2)!;
    expect(drawn.join(" ")).toContain(fl.rules[0].text);
    const g2 = effectAt("coil", 2).gate!;
    expect(stripIcons(fl.rules[0].text)).toBe(`HIT: STUN ${fmtSec(g2.shockTime!)} ON ${fmtCount(1 + g2.jump!)} PARTS.`);
    expect(fl.clause).toBeUndefined();
    expect(drawn.join(" ")).not.toContain("SPARK JUMP");
    expect(drawn.join(" ")).not.toContain("NEXT ★");
  });
});

describe("shared timing gear inspection", () => {
  it("shows the fire rate, the pendulum shift and its tiles, and the cross-hero effect at every star", () => {
    // NUM-4 (REQ-BFG-047; N1 2.2): the peak's shift (races/data.ts PEAK_SHIFT, 1.2 s, no whole second) left both pendulum
    // sentences; the direction and the tiles (as the data gives them, 7 and 13) say where the peak moves (were "... PEAK 1.2
    // SECONDS EARLIER, AFTER 7 TILES." and "... PEAK 1.2 SECONDS LATER ON THIS TURRET, AFTER 13 TILES."); that the clause is
    // gone is checked below
    expect([1, 2, 3].map((s) => abilityText("escapement", s).sentences)).toEqual([11, 16, 22].map((p) => [
      `THE TURRET FIRES ${p}% FASTER.`, "ON METRONOME, PENDULUM SLUGS FROM THIS TURRET PEAK EARLIER, AFTER 7 TILES.",
    ]));
    // NUM-1 (REQ-BFG-047): x10, each star's longRideFlat through fmtDmg (15, 25, 40; was the literals 1.5, 2.5, 4)
    expect([1, 2, 3].map((s) => abilityText("longcase", s).sentences)).toEqual([1, 2, 3].map((s) => fmtDmg(effectAt("longcase", s).mod!.longRideFlat!)).map((d) => [
      `SHOTS FROM PAYLOADS THAT RODE 2 SECONDS OR MORE DEAL ${d} MORE DAMAGE.`,
      "PENDULUM SLUGS DON'T GET IT; ON METRONOME THEY PEAK LATER ON THIS TURRET, AFTER 13 TILES.",
    ]));
    // NUM-4: the shift's seconds are gone from the pendulum sentence at every star
    for (const def of ["escapement", "longcase"]) for (const s of [1, 2, 3]) {
      expect(abilityText(def, s).sentences[1], `${def} ★${s}`).not.toMatch(/\bSECONDS?\b/);
    }
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

  // Y7b2 (the flip): retitled, was "BRAKE SHOE: HALF SPEED at every star, and 2 / 5 DAMAGE from the heat". Its ★2/★3 flats
  // left (Y3, DESIGN-Y row 27): it slows the belt to 50% / 40% / 30% and adds no damage; the perk names HOT SHOE and RED-HOT
  // SHOE left with the flats (the words)
  it("BRAKE SHOE: HALF SPEED, then 40% / 30% SPEED, and no heat or perk name since release Y", () => {
    // NUM-1 (REQ-BFG-047): the heat's damage x10, each star's flat through fmtDmg (20, 50; was the literals 2, 5)
    // Y7b2 (the flip): the speed alone, from the data (were `SLOWS THE BELT PAST IT TO HALF SPEED AND ADDS ${flat(2)} DAMAGE TO
    // EACH PAYLOAD.` and the same with flat(3), flat 20 / 50)
    const speed = (s: number): string => fmtPct(effectAt("brake", s).gate!.speed!);
    expect([1, 2, 3].map((s) => abilityText("brake", s).sentences[0])).toEqual([
      "SLOWS THE BELT PAST IT TO HALF SPEED.", `SLOWS THE BELT PAST IT TO ${speed(2)} SPEED.`, `SLOWS THE BELT PAST IT TO ${speed(3)} SPEED.`,
    ]);
    // Y7b2 (the words): no perk names (were { name: "HOT SHOE", stars: 2, after: 0 } and { name: "RED-HOT SHOE", stars: 3,
    // after: 0 })
    expect([abilityText("brake", 2).perk, abilityText("brake", 3).perk]).toEqual([undefined, undefined]);
    // U2c (U2b's faces): NEXT★ and MERGES INTO show the damage the heat adds at that star, "+20 {DMG}" / "+50 {DMG}"
    // (NUM-1: x10, were "+2 {DMG}" / "+5 {DMG}"; the
    // star's flat through fmtDmg), its perk named after it; were "NEXT STAR: ADDS 2 DAMAGE. ★2 HOT SHOE ..." and
    // "MERGES WITH YOUR BRAKE SHOE INTO ★2: ADDS 2 DAMAGE. ★2 HOT SHOE"
    // Y7b2 (the flip, the words): they show the next star's speed and no perk (were `NEXT ★2: ${heat(2)} ★2 HOT SHOE`,
    // `NEXT ★3: ${heat(3)} ★3 RED-HOT SHOE`, `MERGES INTO ★2: ${heat(2)}. ★2 HOT SHOE` and `MERGES INTO ★3: ${heat(3)}. ★3
    // RED-HOT SHOE`, heat(s) = `+${fmtDmg(flat)} ${ICON.DMG}`)
    expect(nextLine(holding("brake", [1]), "brake", 1)).toBe(`NEXT ★2: ${speed(2)} SPEED`);
    expect(nextLine(holding("brake", [2]), "brake", 2)).toBe(`NEXT ★3: ${speed(3)} SPEED`);
    expect(mergeLine(holding("brake", [1]), "brake")).toBe(`MERGES INTO ★2: ${speed(2)} SPEED.`);
    expect(mergeLine(holding("brake", [2, 1]), "brake")).toBe(`MERGES INTO ★3: ${speed(3)} SPEED.`);
  });

  it("SPLITTER: 2 COPIES AT 60% / 72% CLEAN CUT / 85% PERFECT CUT", () => {
    expect([1, 2, 3].map((s) => gist("splitter", s))).toEqual(["2 COPIES AT 60% DAMAGE", "2 COPIES AT 72% DAMAGE", "2 COPIES AT 85% DAMAGE"]);
    // U2c (U2b's faces): NEXT★ and MERGES INTO show the copies' damage share at that star, "72% {DMG}" / "85% {DMG}" (the
    // star's split mult through fmtPct; the copies stay 2, so the diff leaves them out), its perk named after it; were
    // "NEXT STAR: 2 COPIES AT 72% DAMAGE. ★2 CLEAN CUT ..." and "MERGES WITH YOUR SPLITTER INTO ★2: 2 COPIES AT 72% DAMAGE. ★2 CLEAN CUT"
    const cut = (s: number): string => `${fmtPct(effectAt("splitter", s).gate!.split!.mult)} ${ICON.DMG}`;
    expect(nextLine(holding("splitter", [1]), "splitter", 1)).toBe(`NEXT ★2: ${cut(2)} ★2 CLEAN CUT`);
    expect(nextLine(holding("splitter", [2]), "splitter", 2)).toBe(`NEXT ★3: ${cut(3)} ★3 PERFECT CUT`);
    expect(mergeLine(holding("splitter", [1]), "splitter")).toBe(`MERGES INTO ★2: ${cut(2)}. ★2 CLEAN CUT`);
    expect(mergeLine(holding("splitter", [2, 1]), "splitter")).toBe(`MERGES INTO ★3: ${cut(3)}. ★3 PERFECT CUT`);
  });

  it("the other speed rigs read their speed in words; a rig's next-star line names the perk that star brings, once", () => {
    // NUM-4 (REQ-BFG-047): a speed that is no whole ratio reads as a whole % FASTER (abilityText faster(): never a float ratio),
    // so ★2 and ★3 read their speed's rise from the data through fmtPct, 130% and 210% FASTER (GREASE speed 2.3 and 3.1; were
    // the literals "2.3 TIMES AS FAST" and "3.1 TIMES AS FAST"); ★1 as before. Each % is whole (no decimal)
    const up = (s: number): string => `${fmtPct(effectAt("grease", s).gate!.speed! - 1)} FASTER`;
    for (const s of [2, 3]) expect(up(s), `grease ★${s}`).toMatch(/^\d+% FASTER$/);
    expect([1, 2, 3].map((s) => gist("grease", s))).toEqual(["60% FASTER", up(2), up(3)]);
    // NUM-1 (REQ-BFG-047): x10, OVERDRIVE ★3's flat through fmtDmg ("30"; was the literal "3"). Y7b2 (the flip): ★3's flat
    // left, so its gist is its speed (was `5 TIMES AS FAST, ADDS ${fmtDmg(flat)} DAMAGE`, "..., ADDS 30 DAMAGE")
    // AZ-BUMP (the flip, LADDER_FIX): "5 TIMES AS FAST" -> "5 TIMES AS FAST, KEEPS 100% OF THE RIDE", ★3's ride-keep (AZ-PREP
    // (g)); with LADDER_FIX off its speed alone, as before
    expect(gist("overdrive", 3)).toBe(`5 TIMES AS FAST, KEEPS ${fmtPct(RIDE_KEEP[3])} OF THE RIDE`);
    expect(withLadderFix(() => gist("overdrive", 3), false)).toBe("5 TIMES AS FAST");
    // U2c (U2b's faces): NEXT★ shows the next star's changed numbers, each the ★3 value through its formatter: OVERDRIVE's
    // "5 TIMES" (fmtCount) and "+30 {DMG}" (fmtDmg; NUM-1: x10, was "+3 {DMG}"), then AFTERBURNER once; GALVANIC COIL's "{STUN} 2.8" (fmtSec; its 2 parts
    // are ★2's too, so the diff leaves them out), no perk. Were "NEXT STAR: 5 TIMES AS FAST, ADDS 3 DAMAGE. ★3 AFTERBURNER
    // ..." and "NEXT STAR: STALLS 2 MACHINES FOR 2.8 SECONDS. ..."
    // Y7b2 (the flip): no flat, so the speed alone, then AFTERBURNER once (was `NEXT ★3: ${fmtCount(od3.speed!)} TIMES,
    // +${fmtDmg(od3.flat!)} ${ICON.DMG} ★3 AFTERBURNER`)
    const od3 = effectAt("overdrive", 3).gate!;
    // AZ-BUMP (the flip, LADDER_FIX): + ★3's ride-keep, ", KEEPS 100% RIDE", and AFTERBURNER gives way where it would pass the
    // 225 px band (faces.ts faceNext, U2d F1; REVIEW-AZPREP (g) and Q5: the ⓘ ladder still names it); with LADDER_FIX off the
    // speed alone, then AFTERBURNER, as before
    expect(nextLine(holding("overdrive", [2]), "overdrive", 2)).toBe(`NEXT ★3: ${fmtCount(od3.speed!)} TIMES, KEEPS ${fmtPct(RIDE_KEEP[3])} RIDE`);
    expect(withLadderFix(() => nextLine(holding("overdrive", [2]), "overdrive", 2), false)).toBe(`NEXT ★3: ${fmtCount(od3.speed!)} TIMES ★3 AFTERBURNER`);
    expect(nextLine(holding("coil", [2]), "coil", 2)).toBe(`NEXT ★3: ${ICON.STUN} ${fmtSec(effectAt("coil", 3).gate!.shockTime!)}`); // SPARK JUMP already
  });

  it("phone: the offer's opening sentence shows whole on the band (the tap preview); U2e: no MERGES line, BUY+MERGE says it", () => {
    const band = buildLayout(167, 394, true, 5).info; // PACKS Q5: the 161 x 69 band (0.8.5's 167 x 361 plus the pack row)
    for (const def of ["brake", "splitter", "doublestamp", "gantry", "assembly"]) {
      for (const owned of [[1], [2, 1]]) {
        const run = offering(def, owned), t = offerPanel(run, 0, 0)!;
        const plan = planPanel(t, band);
        const drawn = new Set(visibleLines(plan).map((v) => v.line));
        expect(plan.body.fits, `${def} ${owned}`).toBe(true);
        const ls = plan.body.shown.filter((l) => l.b.role === "ability" && l.b.keep);
        expect(ls.length, `${def} ${owned}: ability`).toBeGreaterThan(0);
        expect(ls.every((l) => l.lines.every((ln) => drawn.has(ln))), `${def} ${owned}: ability`).toBe(true);
        // U2e step 4 (REQ-BFG-070): the MERGES WITH / MERGES INTO line is gone from the face (it showed whole here); the
        // button says the purchase merges, the card's MERGE badge names the star, and the ⓘ view's NEXT★ what it gives
        expect(t.body.some((b) => b.role === "merges"), `${def} ${owned}: no MERGES line`).toBe(false);
        expect(t.labels[0], `${def} ${owned}`).toMatch(/^BUY\+MERGE \d+G$/);
        expect(mergeLine(run, def), `${def} ${owned}`).toMatch(/^MERGES (INTO|WITH)/); // the merge is still there to say
      }
    }
  });
});
