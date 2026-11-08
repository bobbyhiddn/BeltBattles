// POLISH-2 (REQ-BFG-085; BRIEF-POLISH2 Q1, POLISH-1's follow-up F-b): THE BELT READOUT COUNTS THE WORDS IT CAN KNOW.
// The belt panel's readout (DMG, BURN ...) comes from the build view's walk (deck.ts walkRoute), which carries no enchantment: a ★3 FIERY IRON WALL read `BURN 0`. Now the readout adds each
// word's part that is a FIXED AMOUNT per hit at build time (src/screens/build/beltWords.ts WORD_TABLE: FIERY's BURN and GROWING's DMG on a rig, a factory and a turret), by the sim's own
// functions (enchantFx.ts rigHitFx, slugMadeFx, shotFx). Pinned here:
//  (a) every counted word x kind x star (x GROWING's counter x day 1 and 6): the readout's change equals the sim's per-hit amount from the sim's functions, and the ENCHANT_NUM formula;
//  (b) every word the readout does not count (and WIDE, BRACED): the numbers are the walk's own, the same as the deck without the word (WIDE on a rig: the walk's own extra arrow);
//  (c) the order inside a belt: a SPLITTER after a GROWING rig shares its DMG; a gate on the belt: the words' amounts are left out (and said); the header strip follows the readout;
//  (d) a deck with no word and no reader reads exactly as the walk says (every rig, every star, two days); the table has an entry for every word x kind;
//  (e) the sim agrees: a battle on a fixed seed, a FIERY rig with no reader on the belt: the slugs the turret loads once the rig is commissioned carry the readout's BURN.
import { afterEach, describe, expect, it } from "vitest";
import { ITEMS } from "../src/sim/content";
import { Battle, type Payload } from "../src/sim/battle";
import { setTurretList, walkRoute, type Build } from "../src/sim/deck";
import { ENCHANT, ENCHANT_DEFS, ENCHANT_IDS, ENCHANT_NUM, enchantKindOf, freeSides, setEnchant, withEnchant, type EnchantId, type EnchantKind } from "../src/sim/enchant";
import { makeEnchantState, rigHitFx, shotFx, slugMadeFx } from "../src/sim/enchantFx";
import { dmgShown } from "../src/sim/hullScale";
import { effectAt } from "../src/sim/stars";
import { fmtDmg } from "../src/ui/statFormat";
import { newRun, type Run } from "../src/game/run";
import { routePanel } from "../src/screens/build/inspector";
import { WORD_TABLE, beltWordFx } from "../src/screens/build/beltWords";
import { barge, bench, benchRigsCheck, factoryBench, SEED } from "./arsenal.bench";

afterEach(() => setEnchant(ENCHANT));

const STARS = [1, 2, 3];
const DAYS = [1, 6];

interface Deck { run: Run; b: Build }
const runOf = (b: Build, day: number): Deck => {
  const run = newRun("furnace", 5, "polish2-words");
  run.day = day;
  run.build = b;
  return { run, b };
};

/** The belt's readout as the panel prints it: its grid cells by label, and the header strip's first text. */
function readout(d: Deck, index = 0): { cells: Record<string, string>; strip: string; lines: string[] } {
  const t = routePanel(d.run, index)!;
  const cells: Record<string, string> = {};
  for (const b of t.body) if (b.role === "grid" && b.cells) for (const [l, v] of b.cells) cells[l] = v;
  return { cells, strip: t.headerOnly?.texts[0] ?? "", lines: t.body.filter((b) => b.role === "note").map((b) => b.text) };
}

/** The walk's own numbers for the deck, as the panel would print them with nothing added. */
function walked(d: Deck, index = 0): { dmg: string; burn: string } {
  const e = walkRoute(d.b, index, undefined, { gates: true }).estimate;
  return { dmg: fmtDmg(dmgShown(e.dmg, d.run.day)), burn: String(e.burn) };
}

/** The sim's per-hit amount of a word on a kind of piece, by the sim's own functions (a fresh state each call). */
function simAmount(kind: EnchantKind, id: EnchantId, stars: number, grow: number): { burn: number; dmg: number } {
  const st = makeEnchantState({ ench: id, grow }, stars)!;
  if (kind === "turret") {
    const fx = shotFx(st, 1000, 10);
    return { burn: fx.burn, dmg: fx.dmg - 1000 };
  }
  const p = { burn: 0, flat: 0, mult: 1 } as unknown as Payload;
  if (kind === "rig") rigHitFx(st, p, 1);
  else slugMadeFx(st, p);
  return { burn: p.burn, dmg: p.flat };
}

/** The ENCHANT_NUM formula the sim's functions are built from (enchantFx.ts header): FIERY burn x stars, GROWING step x grow x stars. */
const formula = (id: EnchantId, stars: number, grow: number): { burn: number; dmg: number } =>
  id === "fiery" ? { burn: ENCHANT_NUM.burn * stars, dmg: 0 } : id === "growing" ? { burn: 0, dmg: ENCHANT_NUM.growingStep * grow * stars } : { burn: 0, dmg: 0 };

/** A deck with WHETSTONE (a plain rig, one hit on tile 1) holding `word`; the Kiln's belt into the heavy turret. */
function rigDeck(stars: number, day: number, ench?: { id: EnchantId; grow?: number }): Deck {
  const b = bench([["whetstone", 4, 4, stars]]);
  benchRigsCheck(b, [["whetstone", 4, 4, stars]]);
  if (ench) Object.assign(b.items.find((p) => p.def === "whetstone")!, { ench: ench.id, ...(ench.grow ? { grow: ench.grow } : {}) });
  return runOf(b, day);
}
/** STAMP PRESS (a plain factory: its grade is its stars) alone on belt 0, holding `word`. */
function factoryDeck(stars: number, day: number, ench?: { id: EnchantId; grow?: number }): Deck {
  const b = factoryBench("press", stars, { only: true });
  if (ench) Object.assign(b.items.find((p) => p.def === "press")!, { ench: ench.id, ...(ench.grow ? { grow: ench.grow } : {}) });
  return runOf(b, day);
}
/** The Kiln's belt into a SCRAP CANNON at `stars` holding `word`. */
function turretDeck(stars: number, day: number, ench?: { id: EnchantId; grow?: number }): Deck {
  const b = bench();
  setTurretList(b, [{ slot: 0, def: "scrapcannon", uid: 90, ...(stars > 1 ? { stars } : {}), ...(ench ? { ench: ench.id, ...(ench.grow ? { grow: ench.grow } : {}) } : {}) }]);
  return runOf(b, day);
}
const DECKS: Record<EnchantKind, (stars: number, day: number, ench?: { id: EnchantId; grow?: number }) => Deck> = { rig: rigDeck, factory: factoryDeck, turret: turretDeck };

describe("POLISH-2 Q1: the word table has an entry for every word x kind, and says what it counts", () => {
  it("every word x kind is decided: a kind the word goes on has a rule, a kind it cannot go on is null; FIERY and GROWING are the counted ones", () => {
    for (const id of ENCHANT_IDS) {
      for (const kind of ["rig", "factory", "turret"] as const) {
        const goes = ENCHANT_DEFS[id].kinds.includes(kind);
        expect(WORD_TABLE[id][kind] !== null, `${id} on a ${kind}`).toBe(goes);
        if (goes) expect(WORD_TABLE[id][kind]!.why.length, `${id} ${kind}: its reason`).toBeGreaterThan(10);
      }
    }
    const counted = ENCHANT_IDS.filter((id) => ENCHANT_DEFS[id].kinds.some((k) => WORD_TABLE[id][k]?.counted));
    expect(counted).toEqual(["fiery", "growing"]);
    for (const id of counted) for (const k of ENCHANT_DEFS[id].kinds) expect(WORD_TABLE[id][k]!.counted, `${id} ${k}`).toBe(true);
  });
});

describe("POLISH-2 Q1: the readout's change equals the sim's per-hit amount, for every counted word x kind x star", () => {
  it("FIERY and GROWING on a rig, a factory and a turret: BURN +n and DMG +n over the same deck without the word, the sim's functions' amount and the formula's, days 1 and 6", () => {
    let n = 0;
    for (const kind of ["rig", "factory", "turret"] as const) {
      for (const id of ["fiery", "growing"] as const) {
        for (const stars of STARS) {
          for (const grow of id === "growing" ? [0, 1, 4] : [0]) {
            for (const day of DAYS) {
              const plain = DECKS[kind](stars, day), worded = DECKS[kind](stars, day, { id, grow });
              const a = simAmount(kind, id, stars, grow), f = formula(id, stars, grow);
              expect(a, `${id} ${kind} ★${stars} grow ${grow}: the sim's functions say the formula's amount`).toEqual(f);
              const p = readout(plain), w = readout(worded), base = walked(plain);
              const label = `${id} on a ${kind} ★${stars} grow ${grow} day ${day}`;
              expect(p.cells.BURN, `${label}: the plain deck reads the walk's`).toBe(base.burn);
              expect(Number(w.cells.BURN) - Number(p.cells.BURN), `${label}: BURN`).toBe(a.burn);
              // the DMG: the walk's, plus the word's, then the day's multiplier (the sim's hit takes D(d) on the whole)
              const e = walkRoute(plain.b, 0, undefined, { gates: true }).estimate;
              expect(w.cells.DMG, `${label}: DMG`).toBe(fmtDmg(dmgShown(e.dmg + a.dmg, day)));
              if (a.dmg === 0) expect(w.cells.DMG, `${label}: no DMG added, the same DMG`).toBe(p.cells.DMG);
              else expect(w.cells.DMG, `${label}: DMG moved`).not.toBe(p.cells.DMG);
              // the header strip follows the readout
              expect(w.strip, label).toBe(`DMG ${w.cells.DMG}, BURN ${w.cells.BURN}, SPD ${w.cells.SPD}, TIME ${w.cells.TIME}`);
              // the word is not a reader and not an uncounted word: no line under the readout
              expect(w.lines, `${label}: nothing left out`).toEqual([]);
              n++;
            }
          }
        }
      }
    }
    expect(n).toBe(3 * (3 * 1 + 3 * 3) * 2);
  });

  it("a word is counted for each hit: two FIERY rigs on one belt add both their BURNs (★2 and ★3: 2 + 3)", () => {
    const b = bench([["whetstone", 4, 4, 2], ["whetstone", 4, 2, 3]]);
    benchRigsCheck(b, [["whetstone", 4, 4, 2], ["whetstone", 4, 2, 3]]);
    for (const p of b.items.filter((q) => q.def === "whetstone")) p.ench = "fiery";
    expect(readout(runOf(b, 1)).cells.BURN).toBe(String(ENCHANT_NUM.burn * (2 + 3)));
  });
});

describe("POLISH-2 Q1: the words the readout does not count leave its numbers as the walk's", () => {
  it("RISING, ECHOING, MASSIVE (turret), SWIFT (factory) and BRACED on every kind they go on, ★1 and ★3: the same numbers as the deck without the word", () => {
    let n = 0;
    for (const kind of ["rig", "factory", "turret"] as const) {
      for (const id of ["rising", "echoing", "massive", "swift", "braced"] as const) {
        if (!ENCHANT_DEFS[id].kinds.includes(kind)) continue;
        for (const stars of [1, 3]) for (const day of DAYS) {
          const plain = readout(DECKS[kind](stars, day)), worded = readout(DECKS[kind](stars, day, { id }));
          expect(worded.cells, `${id} on a ${kind} ★${stars} day ${day}`).toEqual(plain.cells);
          expect(worded.strip, `${id} on a ${kind}`).toBe(plain.strip);
          n++;
        }
      }
    }
    expect(n).toBe(11 * 2 * DAYS.length); // RISING, ECHOING and BRACED on three kinds, MASSIVE on a turret, SWIFT on a factory: 11 word x kind pairs, ★1 and ★3, two days
  });

  it("WIDE: on a rig its added arrow is a hit the walk already counts (the readout is the walk's own); on a factory or a turret it changes nothing on a slug", () => {
    for (const day of DAYS) {
      const free = freeSides(ITEMS.whetstone)[0];
      const rigW = rigDeck(1, day);
      Object.assign(rigW.b.items.find((p) => p.def === "whetstone")!, { ench: "wide", enchDir: free });
      const w = walked(rigW), r = readout(rigW);
      expect([r.cells.DMG, r.cells.BURN]).toEqual([w.dmg, w.burn]);
      for (const kind of ["factory", "turret"] as const) {
        expect(readout(DECKS[kind](1, day, { id: "wide" })).cells, `${kind} day ${day}`).toEqual(readout(DECKS[kind](1, day)).cells);
      }
    }
  });
});

describe("POLISH-2 Q1: the order inside the belt follows the sim's hit, and a gate on the belt leaves the words out", () => {
  it("GROWING on a rig before a SPLITTER: the splitter shares the word's DMG as it shares the rig's own flat (applyHit: rigHitFx, then the split)", () => {
    const mk = (ench?: string): Deck => {
      const b = bench([["whetstone", 4, 4, 1], ["splitter", 4, 3, 1]]);
      benchRigsCheck(b, [["whetstone", 4, 4, 1], ["splitter", 4, 3, 1]]);
      if (ench) Object.assign(b.items.find((p) => p.def === "whetstone")!, { ench, grow: 4 });
      return runOf(b, 1);
    };
    const e = walkRoute(mk().b, 0, undefined, { gates: true }), mult = effectAt("splitter", 1).gate!.split!.mult;
    const grown = ENCHANT_NUM.growingStep * 4; // ★1 whetstone, grow 4
    const share = Math.round(grown * mult);
    expect(readout(mk("growing")).cells.DMG).toBe(fmtDmg(dmgShown(e.estimate.dmg + share, 1)));
    // the order matters: the same word on a rig AFTER the splitter is not shared
    const after = (): Deck => {
      const b = bench([["splitter", 4, 4, 1], ["whetstone", 4, 3, 1]]);
      benchRigsCheck(b, [["splitter", 4, 4, 1], ["whetstone", 4, 3, 1]]);
      Object.assign(b.items.find((p) => p.def === "whetstone")!, { ench: "growing", grow: 4 });
      return runOf(b, 1);
    };
    const ea = walkRoute(after().b, 0, undefined, { gates: true });
    expect(readout(after()).cells.DMG).toBe(fmtDmg(dmgShown(ea.estimate.dmg + grown, 1)));
  });

  it("FIERY's BURN is not shared by a split (a copy keeps the slug's BURN), and a SMELTER/FUSER/SCATTER MILL on the belt leaves the words' amounts out and says so", () => {
    for (const gate of ["fuser", "scattermill", "smelter"]) {
      const b = bench([["whetstone", 4, 4, 1]]);
      benchRigsCheck(b, [["whetstone", 4, 4, 1]]);
      Object.assign(b.items.find((p) => p.def === "whetstone")!, { ench: "fiery" });
      b.items.push({ uid: 40, def: gate, x: 4, y: 5 - 3, stars: 3 });
      const d = runOf(b, 1), r = readout(d), w = walked(d);
      expect([r.cells.DMG, r.cells.BURN], gate).toEqual([w.dmg, w.burn]);
      expect(r.lines, gate).toHaveLength(1);
      expect(r.lines[0], gate).toMatch(/^NOT COUNTED: FIERY/);
      expect(beltWordFx(d.b, 0, walkRoute(d.b, 0, undefined, { gates: true }), 0).left.map((l) => [l.name, l.why]), gate).toEqual([["FIERY", "gate"]]);
    }
  });

  it("the switch off: no word is counted and none is named (a build that carries `ench` fights as if it did not)", () => {
    const d = rigDeck(1, 1, { id: "fiery" });
    withEnchant(() => expect(readout(d).cells.BURN).toBe(String(ENCHANT_NUM.burn)), true);
    withEnchant(() => {
      expect(readout(d).cells.BURN).toBe("0");
      expect(readout(d).lines).toEqual([]);
    }, false);
  });
});

describe("POLISH-2 Q1: a deck with no word and no reader reads exactly as the walk says", () => {
  it("every rig that is not a reader, at ★1-3 and days 1 and 6: the panel's DMG and BURN are the walk's, the strip follows, no line and no extra block", () => {
    const READERS = new Set(Object.keys(ITEMS).filter((id) => ITEMS[id].kind === "gate" && STARS.some((s) => !!effectAt(id, s).gate?.reads)));
    expect(READERS.size).toBe(10);
    let n = 0;
    for (const id of Object.keys(ITEMS)) {
      const d = ITEMS[id];
      if (d.kind !== "gate" || READERS.has(id) || d.gate?.stoke) continue;
      for (const stars of STARS) for (const day of DAYS) {
        const b = bench([[id, 4, 4, stars]]);
        try { benchRigsCheck(b, [[id, 4, 4, stars]]); } catch { continue; } // a shaped rig that lands another arrow: not a one-hit bench
        const deck = runOf(b, day), r = readout(deck), w = walked(deck);
        expect([r.cells.DMG, r.cells.BURN], `${id} ★${stars} day ${day}`).toEqual([w.dmg, w.burn]);
        expect(r.strip.startsWith(`DMG ${w.dmg}, BURN ${w.burn}`), `${id}: the strip`).toBe(true);
        expect(r.lines, `${id}: no line`).toEqual([]);
        const t = routePanel(deck.run, 0)!;
        expect(t.body.some((x) => x.hold || x.fit), `${id}: no extra block`).toBe(false);
        n++;
      }
    }
    expect(n).toBeGreaterThan(100);
  });
});

describe("POLISH-2 Q1: the sim agrees (a battle on a fixed seed, FIERY on a rig, no reader on the belt)", () => {
  it("the slugs the turret loads once the rig works carry the readout's BURN (the first slug passes before the rig is commissioned: prior 0)", () => {
    for (const stars of STARS) {
      const d = rigDeck(stars, 1, { id: "fiery" });
      const want = Number(readout(d).cells.BURN);
      expect(want).toBe(ENCHANT_NUM.burn * stars);
      const bt = new Battle(d.b, barge(), SEED);
      const got: { burn: number; prior: number }[] = [];
      const seen = new Set<number>();
      for (let i = 0; i < 60 * 20 && got.length < 4; i++) {
        bt.step();
        bt.drainEvents();
        for (const p of bt.sides[0].turrets[0]?.stack ?? []) if (!seen.has(p.id)) { seen.add(p.id); got.push({ burn: p.burn, prior: p.prior }); }
      }
      expect(got.length).toBe(4);
      expect(got[0].prior, "slug 1 passed the rig before it was commissioned").toBe(0);
      for (const g of got.filter((q) => q.prior > 0)) expect(g.burn, `★${stars}`).toBe(want);
      expect(got.filter((q) => q.prior > 0).length).toBeGreaterThanOrEqual(3);
    }
  });

  it("a FIERY turret and a FIERY factory add to the slug the same way in the sim (the shot's BURN; the slug's at its making)", () => {
    // turret: the projectile carries p.burn + FIERY's; the readout's BURN is that sum for a slug with none of its own
    for (const stars of STARS) {
      const t = turretDeck(stars, 1, { id: "fiery" });
      expect(readout(t).cells.BURN).toBe(String(ENCHANT_NUM.burn * stars));
      const f = factoryDeck(stars, 1, { id: "fiery" });
      expect(readout(f).cells.BURN).toBe(String(ENCHANT_NUM.burn * stars));
      const bt = new Battle(f.b, barge(), SEED);
      let slugBurn = -1;
      for (let i = 0; i < 60 * 12 && slugBurn < 0; i++) {
        bt.step();
        bt.drainEvents();
        const s = bt.sides[0].turrets[0]?.stack[0];
        if (s) slugBurn = s.burn;
      }
      expect(slugBurn, `factory ★${stars}: the slug the turret loads`).toBe(ENCHANT_NUM.burn * stars);
    }
  });
});
