// ENCHANT-2 (REQ-BFG-085; the T6 fix round, cap's ruling 2d9c4479a18adbf5 on the cold read's E2-05): THE DAY'S DAMAGE AMOUNTS IN RISING'S AND GROWING'S LINES.
//   Why: a GROWING WHETSTONE that had grown (counter 3, day 6) read `+70` in its stat row and `+40/+80/+140` in its LEVELS (the day's numbers: D(6) = 2.0, so the
//   whetstone's own +20 is +40 and its grown +15 is +30), but its own line said `AFTER EACH DUSK FIGHT: ITS HIT +5 DMG, FOR THE RUN`, day 1's amount: six readers
//   computed 40 + 3 x 5 = 55 against the row's 70. The sim agrees with the row (the word's flat rides the payload and battle.ts impact() takes D(day) on the whole hit),
//   so on day 6 each dusk fight really adds +10. The same day-1 reading sat in RISING's `+1 DMG MORE THAN THE LAST` (day 8: really x 2.3 a shot).
//   The ruling: on a PART's panel every DMG amount these two words print goes through the day (hullScale.ts dmgShown: step x stars x D(day), rounded down), on your parts and a
//   rival's alike; the word's own CARD (the ENCHANTER's offer, a warlord pick, the shrine's ?, APPLY, LAST CHANCE's detail) is about no piece and keeps day 1's numbers.
//   UI only: no sim change, ENCHANT off byte-identical.
//   ENCHANT-2W (REQ-BFG-085; W3, cap's review of ENCHANT-2): that last clause is superseded for a card drawn DURING A RUN: it passes the run's day (wordFace(id, day), lcWordItem's `day`),
//   so the ENCHANTER's GROWING card on day 6 says +10 as the panel does (tests/enchant2w.days.test.ts). A card drawn with NO run (the text sheet's, a glossary) still keeps day 1's
//   numbers: the card tests below call wordFace and lcWordItem with no day, which is that case.
import { afterEach, describe, expect, it } from "vitest";
import { installRaster } from "./raster.helpers";
import { newRun, type Run } from "../src/game/run";
import { cargoPanel, itemPanel, turretPanel } from "../src/screens/build/inspector";
import { faceText } from "../src/screens/battleScout";
import { infoLevels } from "../src/screens/build/keywords";
import { lcWordItem } from "../src/screens/lastChancePicker";
import { setTurretList, turretSlots, type Build } from "../src/sim/deck";
import { ENCHANT, ENCHANT_IDS, ENCHANT_NUM, enchantKindOf, setEnchant, withEnchant, type EnchantId, type EnchantKind } from "../src/sim/enchant";
import { dmgMulTenths } from "../src/sim/hullScale";
import { gradeOf, starsOf } from "../src/sim/stars";
import { RIVAL_IDS, rivalBuild, rivalDays, standInBuild } from "../src/sim/rivals";
import { ITEMS } from "../src/sim/content";
import { lineText } from "../src/ui/richText";
import { icons } from "../src/render/font";
import { pieceLine, wordFace, wordLine, wordOn } from "../src/ui/enchantFaces";
import { wordLineBlocks } from "../src/screens/build/faceBlocks";

installRaster();
afterEach(() => setEnchant(ENCHANT));
const on = <T>(fn: () => T): T => withEnchant(fn, true);
const KINDS: EnchantKind[] = ["rig", "factory", "turret"];
/** What a damage amount reads on `day`: n x D(day), rounded down (the read-outs' rule, hullScale.ts dmgShown); day 1 or no day: n. */
const onDay = (n: number, day?: number): number => (day === undefined ? n : Math.floor((n * dmgMulTenths(day)) / 10));

/** A furnace run (day `day`) whose deck holds `items` (the KILN first), cargo `cargo` and installed turrets `turrets`. */
function runWith(day: number, items: Build["items"] = [], cargo: Run["inventory"] = [], turrets: Parameters<typeof setTurretList>[1] = []): Run {
  const run = newRun("furnace", 5, "enchant2-dayline");
  run.day = day;
  run.build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, ...items], routes: [], mods: [], beltCap: 40, hullBonus: 0 };
  run.inventory = cargo;
  if (turrets.length) setTurretList(run.build, turrets);
  return run;
}
const bodyTexts = (t: { body: readonly { text: string }[] }): string[] => t.body.map((b) => b.text);

describe("ENCHANT-2 T6 fix round: wordLine / pieceLine take the panel's day for RISING's and GROWING's DMG amounts (cap's ruling 2d9c4479a18adbf5)", () => {
  it("the two examples of the ruling: GROWING at one star on day 6 says +10, RISING at one star on day 8 says +2", () => {
    on(() => {
      expect(wordLine("growing", "rig", 1, 6)).toBe("AFTER EACH DUSK FIGHT: ITS HIT +10 {DMG}, FOR THE RUN.");
      expect(wordLine("rising", "turret", 1, 8)).toBe("EACH SHOT: +2 {DMG} MORE THAN THE LAST. IT STARTS OVER EACH FIGHT.");
      expect(pieceLine("growing", "rig", 1, 6)).toBe("AFTER EACH DUSK FIGHT: ITS HIT +10 {DMG}, FOR THE RUN.");
      expect(pieceLine("rising", "turret", 1, 8)).toBe("EACH SHOT: +2 {DMG} MORE THAN THE LAST. IT STARTS OVER EACH FIGHT.");
    });
  });

  it("every day 1-24, every star, every kind: the amount is step x stars x D(day) rounded down (the stat rows' rule), never under the day-1 amount (D is at least 1.0, so never +0), and the rest of the line is the card's", () => {
    on(() => {
      for (let day = 1; day <= 24; day++) for (const stars of [1, 2, 3]) for (const kind of KINDS) {
        const g = ENCHANT_NUM.growingStep * stars, r = ENCHANT_NUM.risingStep * stars;
        const lg = wordLine("growing", kind, stars, day)!, lr = wordLine("rising", kind, stars, day)!;
        expect(lg, `GROWING ${kind} ★${stars} day ${day}`).toContain(`+${onDay(g, day)} {DMG}, FOR THE RUN`);
        expect(lr, `RISING ${kind} ★${stars} day ${day}`).toContain(`+${onDay(r, day)} {DMG} MORE THAN THE LAST`);
        expect(onDay(g, day), `GROWING ★${stars} day ${day}: not under day 1's`).toBeGreaterThanOrEqual(g);
        expect(onDay(r, day), `RISING ★${stars} day ${day}: not under day 1's`).toBeGreaterThanOrEqual(r);
        // the line is the card's line with ONE number moved: nothing else in the sentence changes
        const card = wordLine("growing", kind, stars)!;
        expect(lg.replace(`+${onDay(g, day)} {DMG}`, `+${g} {DMG}`), `GROWING ${kind} ★${stars} day ${day}`).toBe(card);
        expect(lr.replace(`+${onDay(r, day)} {DMG}`, `+${r} {DMG}`), `RISING ${kind} ★${stars} day ${day}`).toBe(wordLine("rising", kind, stars));
      }
    });
  });

  it("no day, or day 1 (D = 1.0), says day 1's numbers (+5 and +1, times the stars), exactly as before; the other six words' lines ignore the day", () => {
    on(() => {
      for (const stars of [1, 2, 3]) for (const kind of KINDS) {
        for (const id of ENCHANT_IDS) {
          const card = wordLine(id, kind, stars);
          expect(wordLine(id, kind, stars, 1), `${id} ${kind} ★${stars} day 1`).toBe(card);
          expect(pieceLine(id, kind, stars, 1), `${id} ${kind} ★${stars} day 1 (piece)`).toBe(pieceLine(id, kind, stars));
          if (id !== "rising" && id !== "growing") for (const day of [6, 8, 12, 16]) expect(wordLine(id, kind, stars, day), `${id} ${kind} ★${stars} day ${day}`).toBe(card);
        }
        if (wordLine("growing", kind, stars)) expect(wordLine("growing", kind, stars)).toContain(`+${ENCHANT_NUM.growingStep * stars} {DMG}`);
        if (wordLine("rising", kind, stars)) expect(wordLine("rising", kind, stars)).toContain(`+${ENCHANT_NUM.risingStep * stars} {DMG}`);
      }
    });
  });

  it("the word's own CARD, drawn with NO run (no day: the text sheet's; ENCHANT-2W W3: a card drawn in a run passes its day), keeps day 1's numbers (wordFace; LAST CHANCE's detail: lcWordItem): +5 and +1, on every kind", () => {
    on(() => {
      for (const kind of KINDS) {
        const g = wordFace("growing").lines.find((l) => l.kind === kind), r = wordFace("rising").lines.find((l) => l.kind === kind);
        expect(g?.text, `GROWING card, ${kind}`).toContain(`+${ENCHANT_NUM.growingStep} {DMG}`);
        expect(r?.text, `RISING card, ${kind}`).toContain(`+${ENCHANT_NUM.risingStep} {DMG}`);
      }
      const lc = (def: string, id: "growing" | "rising") => lcWordItem(def, id, 400, 1)!.map(lineText).join(" ");
      expect(lc("whetstone", "growing")).toContain("+5 ");
      expect(lc("scrapcannon", "rising")).toContain("+1 ");
    });
  });

  it("the block a part's panel draws (wordLineBlocks) carries the day; with no day it is the card's line", () => {
    on(() => {
      const w = wordOn({ ench: "growing", grow: 3 }, "whetstone", 1)!;
      expect(wordLineBlocks(w, 6)[0].text).toBe(icons("AFTER EACH DUSK FIGHT: ITS HIT +10 {DMG}, FOR THE RUN."));
      expect(wordLineBlocks(w)[0].text).toBe(icons("AFTER EACH DUSK FIGHT: ITS HIT +5 {DMG}, FOR THE RUN."));
    });
  });
});

describe("ENCHANT-2 T6 fix round: E2-05's face, a GROWING WHETSTONE that has grown through three dusk fights, on day 6: the row, the LEVELS and the line agree", () => {
  it("row +70, LEVELS +40/+80/+140 (★1 current), the line +10: the part's own +40 and three grown +10s make the row's +70", () => {
    on(() => {
      const run = runWith(6, [{ uid: 9, def: "whetstone", x: 3, y: 3, ench: "growing", grow: 3 } as Build["items"][number]]);
      const t = itemPanel(run, 9)!;
      const row = t.body.find((b) => b.role === "ability" && b.hue)!;
      expect(row, "the stat row, the grown DMG in the word's colour").toBeDefined();
      const shown = Number(/\+(\d+)/.exec(row.text)![1]);
      expect(shown).toBe(70);
      const line = icons("AFTER EACH DUSK FIGHT: ITS HIT +10 {DMG}, FOR THE RUN.");
      expect(bodyTexts(t), "GROWING's line says the day's step").toContain(line);
      const ladder = infoLevels(run, { kind: "item", uid: 9 }).find((l) => l.kind === "ladder");
      expect(ladder && ladder.kind === "ladder" ? ladder.ladder.values : null, "LEVELS: the part's own +DMG by star, on the day").toEqual(["+40", "+80", "+140"]);
      const own = Number((ladder as { ladder: { values: string[] } }).ladder.values[0].slice(1));
      const step = Number(/\+(\d+) /.exec(line.replace(/[^+\d ]/g, " ").replace(/\s+/g, " "))?.[1] ?? NaN);
      expect(own + 3 * step, "the sum the readers do: own + grown = the row").toBe(shown);
    });
  });

  it("the same piece in cargo and as an INSTALLED turret's face carries the day too: GROWING on a SCRAP CANNON on day 6 says +10; RISING on one on day 8 says +2", () => {
    on(() => {
      const cargo = cargoPanel(runWith(6, [], [{ uid: 900, def: "whetstone", ench: "growing", grow: 3 } as Run["inventory"][number]]), 900)!;
      expect(bodyTexts(cargo)).toContain(icons("AFTER EACH DUSK FIGHT: ITS HIT +10 {DMG}, FOR THE RUN."));
      const g = turretPanel(runWith(6, [], [], [{ slot: 0, def: "scrapcannon", uid: 90, ench: "growing", grow: 3 }]), 0)!;
      expect(bodyTexts(g)).toContain(icons("AFTER EACH DUSK FIGHT: ITS SHOTS +10 {DMG}, FOR THE RUN."));
      const r = turretPanel(runWith(8, [], [], [{ slot: 0, def: "scrapcannon", uid: 90, ench: "rising" }]), 0)!;
      expect(bodyTexts(r)).toContain(icons("EACH SHOT: +2 {DMG} MORE THAN THE LAST. IT STARTS OVER EACH FIGHT."));
      const r1 = turretPanel(runWith(1, [], [], [{ slot: 0, def: "scrapcannon", uid: 90, ench: "rising" }]), 0)!;
      expect(bodyTexts(r1), "day 1 is day 1's number").toContain(icons("EACH SHOT: +1 {DMG} MORE THAN THE LAST. IT STARTS OVER EACH FIGHT."));
    });
  });
});

describe("ENCHANT-2 T6 fix round: a RIVAL's part reads the fight's day too (E2-02's face: SPARKFANG's RISING SCRAP CANNON on day 8 says +2)", () => {
  it("every rival x day 5-16 x warlord deck and dusk stand-in: each worded piece's face carries its line AT THE FIGHT'S DAY (pieceLine with the day), and a RISING piece's line says the day's amount", () => {
    on(() => {
      let faces = 0, rising = 0;
      for (const id of RIVAL_IDS) for (const day of rivalDays(id, 16).filter((d) => d >= 5)) for (const make of [rivalBuild, standInBuild]) {
        const b = make(id, day);
        // each piece holding a word: its selection, def, word and the stars its line reads at (a hero's signature factory reads at its grade, as its panel does)
        const held: { sel: { kind: "item"; uid: number } | { kind: "turret"; index: number }; def: string; word: EnchantId; stars: number }[] = [
          ...b.items.filter((p) => p.ench !== undefined).map((p) => ({ sel: { kind: "item" as const, uid: p.uid }, def: p.def, word: p.ench as EnchantId, stars: gradeOf(b, p) })),
          ...turretSlots(b).flatMap((s, index) => (s.turret?.ench !== undefined ? [{ sel: { kind: "turret" as const, index }, def: s.turret.def, word: s.turret.ench as EnchantId, stars: starsOf(s.turret) }] : [])),
        ];
        for (const h of held) {
          const kind = enchantKindOf(ITEMS[h.def])!, t = faceText(b, h.sel, null, day)!, line = pieceLine(h.word, kind, h.stars, day)!;
          const tag = `${id} day ${day}: ${h.word} on ${h.def} ★${h.stars}`;
          expect(bodyTexts(t), tag).toContain(icons(line));
          if (h.word === "rising") {
            expect(line, tag).toContain(`+${onDay(ENCHANT_NUM.risingStep * h.stars, day)} {DMG} MORE THAN THE LAST`);
            rising++;
          }
          faces++;
        }
      }
      expect(faces, "rival faces checked").toBeGreaterThan(900);
      expect(rising, "rival RISING faces checked").toBeGreaterThan(20);
    });
    on(() => {
      // the picture's own scene: SPARKFANG, day 8, RISING SCRAP CANNON in slot 1 (a heavy turret): +2 a shot
      const b = rivalBuild("sparkfang", 8);
      const at = turretSlots(b).findIndex((s) => s.turret?.def === "scrapcannon" && s.turret.ench === "rising");
      expect(at, "SPARKFANG's day-8 deck holds a RISING SCRAP CANNON").toBeGreaterThanOrEqual(0);
      const t = faceText(b, { kind: "turret", index: at }, null, 8)!;
      expect(bodyTexts(t)).toContain(icons("EACH SHOT: +2 {DMG} MORE THAN THE LAST. IT STARTS OVER EACH FIGHT."));
      const t1 = faceText(b, { kind: "turret", index: at }, null)!; // no day: day 1's, as before
      expect(bodyTexts(t1)).toContain(icons("EACH SHOT: +1 {DMG} MORE THAN THE LAST. IT STARTS OVER EACH FIGHT."));
    });
  });

  it("with ENCHANT off the same piece has no word line at all (a stray word on a deck is not read)", () => {
    const b = on(() => rivalBuild("sparkfang", 8)); // built with ENCHANT on: the deck carries the stray word
    const at = turretSlots(b).findIndex((s) => s.turret?.def === "scrapcannon" && s.turret.ench === "rising");
    // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2) and R5.6, TRIAGE-R34 line 49): was a bare faceText (the switch shipped off, so the read was in the OFF world); ENCHANT is on by default now, so the
    // face is read under withEnchant(fn, false) (the OFF world, synchronously). The deck itself stays the ON-built one: it is the stray word that the OFF read must not show
    expect(at, "the ON-built deck holds the stray RISING SCRAP CANNON").toBeGreaterThanOrEqual(0);
    const t = withEnchant(() => faceText(b, { kind: "turret", index: at }, null, 8)!, false);
    expect(bodyTexts(t).some((x) => x.includes("MORE THAN THE LAST"))).toBe(false);
  });
});
