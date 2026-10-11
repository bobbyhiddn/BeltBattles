// HULL-1d (REQ-BFG-079, REQ-BFG-070; BRIEF-HULL1D section 2 (h)): THE READ-OUTS on the day. With HULL_SCALE on, every number a
// player reads before or after a fight shows what lands on that day, as the battle's pops do: a damage amount x D(d) and a
// HEAL / REGEN / PLATE amount (and the PLATE pool's cap) x S(d), each rounded down (hullScale.ts dmgShown, sustShown; the
// expected numbers below come from the module's own dmgMulTenths / sustMulTenths, never a copied table). Read on days 5 and
// 10: a part card's DMG and BURN lines (its face, its sentences, NEXT STAR), a rune's text, the inspector's belt read-out,
// the ⓘ view's level details, the glossary row a tap shows, the HUD's plating cap, the stacked pops (note B) and the desk
// bar's wind slot (ruling Q4). With the switch off, every one reads exactly as today, whatever the day; with it on and no
// day (the title's fight, the hero preview), day 1's. The switch is turned on only through withHullScale / setHullScale,
// and put back after each test.
import { afterEach, describe, expect, it, vi } from "vitest";
import { BURN_DPS, ITEMS, type HeroId } from "../src/sim/content";
import { RUNES } from "../src/sim/runes";
import { FUSE_MAX, fusible } from "../src/sim/stars";
import { Battle } from "../src/sim/battle";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { walkRoute } from "../src/sim/deck";
import { PLATE_CAP, PLATE_PER_SLUG } from "../src/sim/races/bastion";
import { dmgMulTenths, setHullScale, sustMulTenths, withHullScale } from "../src/sim/hullScale";
import { abilityText, cardText, gist, hasAbilityText, nextStarText } from "../src/ui/abilityText";
import { faceAt, faceLines, hasFace } from "../src/ui/faces";
import { shopChip } from "../src/ui/chips";
import { runeLine } from "../src/ui/runeText";
import { glossaryRows, glossaryText } from "../src/ui/glossary";
import { fmtDmg } from "../src/ui/statFormat";
import { levelLines, levelText } from "../src/screens/build/levels";
import { beltPanel } from "../src/screens/build/inspector";
import { barSpeedRow, barWindRoom, platingMax } from "../src/screens/battleHud";
import { battleLayout, DESK_BAR_W, DESK_WIND_W } from "../src/game/battleLayout";
import { Arena } from "../src/game/arena";
import { newRun } from "../src/game/run";
import { Fx, popBox } from "../src/render/fx";
import { textWidth } from "../src/render/font";
import { packTip } from "../src/screens/build/chrome"; // AZ-PREP (REVIEW-HULL1D Q3): the pack tooltip on the run's day

afterEach(() => setHullScale(true)); // the shipped value (AZ-BUMP's flip; was false): a test that reads the switch off sets it off itself

const on = <T>(fn: () => T): T => withHullScale(fn);
/** The day's damage for a day-1 amount: n x D(d), rounded down (the module's own D). */
const D = (n: number, day: number): number => Math.floor((n * dmgMulTenths(day)) / 10);
/** The day's sustain for a day-1 amount: n x S(d), rounded down (the module's own S). */
const S = (n: number, day: number): number => Math.floor((n * sustMulTenths(day)) / 10);
const DAYS = [5, 10];
const TEXT_DEFS = Object.keys(ITEMS).filter((d) => hasAbilityText(d) || hasFace(d));
const starsOf = (def: string): number[] => (fusible(def) ? Array.from({ length: FUSE_MAX }, (_, i) => i + 1) : [1]);
/** Every read-out these tests sweep, for one def at one star with TextOpts `o`. */
const readouts = (def: string, s: number, o: { day?: number }): unknown => ({
  text: abilityText(def, s, o), gist: gist(def, s, o), card: s === 1 ? cardText(def, o) : "", next: nextStarText(def, s, o),
  face: faceLines(def, s, o), chip: s === 1 ? shopChip(def, o) : null, levels: levelLines(def, s, o),
});

describe("HULL-1d: the switch off, or no day: every read-out as today", () => {
  it("every part's text, face, chip and level details read the same on any day with the switch off", () => {
    setHullScale(false); // AZ-BUMP (the flip, HULL_SCALE): this test's switch-off reads (it ships on; the afterEach puts it back)
    let n = 0;
    for (const def of TEXT_DEFS) for (const s of starsOf(def)) {
      const today = readouts(def, s, {});
      for (const day of [1, 5, 10]) expect(readouts(def, s, { day }), `${def} ★${s} day ${day}`).toEqual(today);
      n++;
    }
    expect(n).toBeGreaterThan(100);
  });

  it("with the switch on: no day (the title's fight, the hero preview) and day 1 (D = S = 1) read as today", () => {
    expect(dmgMulTenths(1)).toBe(10);
    expect(sustMulTenths(1)).toBe(10);
    for (const def of TEXT_DEFS) for (const s of starsOf(def)) {
      const today = readouts(def, s, {});
      expect(on(() => readouts(def, s, {})), `${def} ★${s} no day`).toEqual(today);
      expect(on(() => readouts(def, s, { day: 1 })), `${def} ★${s} day 1`).toEqual(today);
    }
  });

  it("every rune's text and the glossary rows read the same with the switch off, whatever the day", () => {
    setHullScale(false); // AZ-BUMP (the flip, HULL_SCALE): this test's switch-off reads (it ships on; the afterEach puts it back)
    for (const r of Object.values(RUNES)) for (const day of [1, 5, 10]) expect(runeLine(r, day), `${r.id} day ${day}`).toBe(runeLine(r));
    for (const day of [1, 5, 10]) expect(glossaryRows(day)).toEqual(glossaryRows());
    // the switch on (HULL-1c's DARK WIND row reads its share): no day and day 1 read the same numbers
    expect(on(() => glossaryRows(1))).toEqual(on(() => glossaryRows()));
  });
});

describe("HULL-1d: a part card's numbers on days 5 and 10 (switch on)", () => {
  it("WHETSTONE: its + DAMAGE x D(d) on its face, its sentence, its gist, its card and NEXT STAR", () => {
    for (const day of DAYS) {
      const f1 = ITEMS.whetstone.gate!.flat!;
      const face = on(() => faceLines("whetstone", 1, { day }))!;
      expect(face.rules[0].text, `day ${day}`).toContain(`+${D(f1, day)}`);
      expect(on(() => abilityText("whetstone", 1, { day })).sentences[0]).toBe(`ADDS ${D(f1, day)} DAMAGE TO EACH PAYLOAD IT HITS.`);
      expect(on(() => cardText("whetstone", { day }))).toBe(`ADDS ${D(f1, day)} DAMAGE.`);
      const next = nextStarText("whetstone", 1)!, nextOn = on(() => nextStarText("whetstone", 1, { day }))!;
      const n2 = Number(/(\d+) DAMAGE/.exec(next)![1]);
      expect(nextOn).toBe(next.replace(`${n2} DAMAGE`, `${D(n2, day)} DAMAGE`));
      expect(D(f1, day)).toBeGreaterThan(f1); // D(5), D(10) > 1
    }
  });

  it("TEMPER: its BURN count stays; BURN's damage a second x D(d) (its sentence and its face's reminder)", () => {
    for (const day of DAYS) {
      const off = abilityText("temper", 1), at = on(() => abilityText("temper", 1, { day }));
      expect(at.sentences[0]).toBe(off.sentences[0]); // "ADDS 2 BURN ...": a count
      expect(at.sentences[1]).toBe(off.sentences[1].replace(` ${BURN_DPS} DAMAGE A SECOND`, ` ${D(BURN_DPS, day)} DAMAGE A SECOND`));
      const rem = on(() => faceLines("temper", 1, { day }))!.reminders.join(" ");
      expect(rem).toContain(` ${D(BURN_DPS, day)} HULL DAMAGE A SEC`);
    }
  });

  it("a factory's DMG stat (STAMP PRESS) x D(d); a HEAL, REGEN and PLATE amount x S(d) (RIVETER, MENDING LOOM, PLATE ROLLER)", () => {
    for (const day of DAYS) {
      const dmg1 = faceAt("press", 1)!.stats.find(([ic]) => ic === "DMG")![1];
      expect(on(() => faceAt("press", 1, { day }))!.stats.find(([ic]) => ic === "DMG")![1]).toBe(fmtDmg(D(Number(dmg1), day)));
      const heal = ITEMS.riveter.gate!.heal!, regen = ITEMS.mendingloom.mod!.regen!, plate = ITEMS.plateroller.gate!.plate!;
      expect(on(() => abilityText("riveter", 1, { day })).sentences[0]).toBe(`HEALS YOUR HULL BY ${S(heal, day)} FOR EACH PAYLOAD IT HITS.`);
      expect(on(() => faceLines("riveter", 1, { day }))!.rules[0].text).toContain(` ${S(heal, day)}`);
      expect(on(() => abilityText("mendingloom", 1, { day })).sentences[0]).toBe(`HEALS YOUR HULL BY ${S(regen, day)} EVERY SECOND.`);
      expect(on(() => abilityText("plateroller", 1, { day })).sentences[0]).toBe(`ROLLS ${S(plate, day)} PLATING ONTO YOUR HULL FOR EACH PAYLOAD IT HITS.`);
      // the PLATE pool's cap (S.plating) and PLATE BREAKER's 10 (a pool unit) on the same S
      expect(on(() => abilityText("plateroller", 1, { day })).sentences[1]).toContain(`UP TO ${S(PLATE_CAP, day)} PLATING`);
      expect(on(() => abilityText("platebreaker", 1, { day })).sentences[0]).toContain(`TAKES ${S(10, day)} PLATING`);
      expect(on(() => abilityText("wardworks", 1, { day })).sentences[2])
        .toContain(`BY ${S(PLATE_PER_SLUG, day)}, UP TO ${S(PLATE_CAP, day)} PLATING`);
    }
  });

  it("AZ-PREP (REVIEW-HULL1D Q3): a pack slot's tooltip (chrome.ts packTip) is the pack's face on the run's day; off, as today", () => {
    setHullScale(false); // AZ-BUMP (the flip, HULL_SCALE): this test's switch-off reads (it ships on; the afterEach puts it back)
    for (const day of DAYS) for (const def of ["plating", "beltcrate"]) expect([on(() => packTip(def, { ...newRun("furnace", 7), day })), packTip(def, { ...newRun("furnace", 7), day })], `${def} day ${day}`).toEqual([on(() => faceLines(def, 1, { day }))!.rules[0].text, faceLines(def, 1)!.rules[0].text]);
  });

  it("the glossary row a tap on a piece shows: BURN's damage a second x D(d), PLATE's MAX x S(d) (the run's day)", () => {
    for (const day of DAYS) {
      const o = { day };
      expect(on(() => glossaryText("BURN", { def: "whetstone", stars: 1, o }))).toContain(`${D(BURN_DPS, day)} HULL DAMAGE`);
      expect(on(() => glossaryText("PLATE", { def: "whetstone", stars: 1, o }))).toContain(`MAX ${S(PLATE_CAP, day)}`);
      expect(on(() => glossaryText("BURN", { def: "whetstone", stars: 1, o: {} }))).toBe(glossaryText("BURN"));
    }
  });
});

describe("HULL-1d: a rune's text on days 5 and 10 (switch on)", () => {
  it("+ DMG x D(d); PLATE, HEAL and REGEN x S(d); IRON HIDE's cut and the counts as on day 1", () => {
    for (const day of DAYS) {
      expect(on(() => runeLine(RUNES.war_edge, day))).toBe(`YOUR SHOTS: +${D(RUNES.war_edge.amount.n, day)} DMG.`);
      expect(on(() => runeLine(RUNES.sharp_scrap, day))).toBe(`EACH TURRET'S FIRST SHOT: +${D(RUNES.sharp_scrap.amount.n, day)} DMG.`);
      expect(on(() => runeLine(RUNES.rivet_hoard, day))).toBe(`START: +${S(RUNES.rivet_hoard.amount.n, day)} PLATE.`);
      expect(on(() => runeLine(RUNES.green_thread, day))).toBe(`YOUR HULL: REGEN ${S(RUNES.green_thread.amount.n, day)}.`);
      expect(on(() => runeLine(RUNES.leech_vow, day))).toBe(`EACH SHOT THAT LANDS: HEAL ${S(RUNES.leech_vow.amount.n, day)}.`);
      for (const id of ["iron_hide", "ash_kindle", "ward_stone", "gun_oil", "coin_purse"]) {
        expect(on(() => runeLine(RUNES[id], day)), id).toBe(runeLine(RUNES[id]));
      }
    }
  });
});

describe("HULL-1d: the inspector and the ⓘ level details on days 5 and 10 (switch on)", () => {
  it("the belt read-out's DMG x D(d) (the walk stays day 1's); BURN (a count) and TIME as before", () => {
    setHullScale(false); // AZ-BUMP (the flip, HULL_SCALE): this test's switch-off reads (it ships on; the afterEach puts it back)
    for (const hero of ["furnace", "weaver", "foundry", "bastion"] as HeroId[]) {
      const run = newRun(hero, 4242);
      const idx = run.build.routes.findIndex((_, i) => beltPanel(run, i)?.headerOnly);
      expect(idx, hero).toBeGreaterThanOrEqual(0);
      const est = walkRoute(run.build, idx).estimate, off = beltPanel(run, idx)!.headerOnly!.texts;
      for (const day of DAYS) {
        run.day = day;
        const at = on(() => beltPanel(run, idx))!.headerOnly!.texts;
        expect(at[2], `${hero} day ${day}`).toBe(off[2].replace(`DMG ${fmtDmg(est.dmg)}`, `DMG ${fmtDmg(D(est.dmg, day))}`));
        expect(beltPanel(run, idx)!.headerOnly!.texts).toEqual(off); // the switch off: as today on any day
      }
    }
  });

  it("the level ladders and NEXT★ (REQ-BFG-070): WHETSTONE's DMG x D(d), RIVETER's HEAL x S(d), star by star", () => {
    const nums = (t: string): number[] => (t.match(/\d+/g) ?? []).map(Number);
    for (const [def, f] of [["whetstone", D], ["riveter", S]] as const) {
      for (const day of DAYS) {
        const off = levelLines(def, 1)!.map((l) => levelText(l)), at = on(() => levelLines(def, 1, { day }))!.map((l) => levelText(l));
        expect(at.length, def).toBe(off.length);
        off.forEach((line, i) => {
          const want = nums(line).map((n) => (/★\d/.test(line) && n <= FUSE_MAX ? n : f(n, day)));
          expect(nums(at[i]), `${def} day ${day}: ${line} -> ${at[i]}`).toEqual(want);
        });
      }
    }
  });
});

describe("HULL-1d: the battle agrees (switch on)", () => {
  const fight = (hero: HeroId, day?: number): Battle => new Battle(heroStartBuild(hero, 1), heroStartBuild("furnace", 101), 7, undefined, day);

  it("the HUD's plating strip reads the pool's cap: PLATE_CAP x S(d) on the day's hull, PLATE_CAP otherwise", () => {
    setHullScale(false); // AZ-BUMP (the flip, HULL_SCALE): this test's switch-off reads (it ships on; the afterEach puts it back)
    for (const day of DAYS) {
      const bt = on(() => fight("bastion", day));
      expect(platingMax(bt.sides[0]), `day ${day}`).toBe(S(PLATE_CAP, day));
      // the PLATE reminder's MAX on that day is the same number
      expect(on(() => faceLines("plateroller", 1, { day }))!.reminders.join(" ")).toContain(`MAX ${S(PLATE_CAP, day)}`);
      expect(platingMax(fight("bastion", day).sides[0])).toBe(PLATE_CAP); // the switch off
    }
    expect(platingMax(on(() => fight("bastion")).sides[0])).toBe(PLATE_CAP); // no day
  });

  it("a bulwark slug's first plating in a day-10 fight is the number WARDWORKS' text says", () => {
    const day = 10, bt = on(() => fight("bastion", day));
    let first = 0;
    while (!bt.over && bt.t < 20 && !first) {
      bt.step();
      for (const e of bt.events) if (e.type === "plate" && e.side === 0 && e.amount > 0 && !first) first = e.amount;
      bt.events.length = 0;
    }
    expect(first).toBe(S(PLATE_PER_SLUG, day));
    expect(on(() => abilityText("wardworks", 1, { day })).sentences[2]).toContain(`BY ${first},`);
  });
});

describe("HULL-1d: two pops in one tick over one hull (REVIEW-HULL1C note B)", () => {
  it("Fx.stackedY: a same-tick pop that would cover another moves up just above it; apart, or older, it stays", () => {
    const fx = new Fx();
    fx.anchor = 1;
    fx.popup(100, 50, "186", "#fff", false, true);
    const y = fx.stackedY(100, 50, "24", false), a = popBox("186", false), b = popBox("24", false);
    expect(y).toBe(50 - b.h);
    expect(y + b.h).toBeLessThanOrEqual(50);
    expect(fx.stackedY(100 + (a.w + b.w) / 2 + 1, 50, "24", false)).toBe(50); // clear in x
    fx.anchor = 0;
    expect(fx.stackedY(100, 50, "24", false)).toBe(50); // the other board
    fx.anchor = 1;
    fx.popup(100, y, "24", "#fff", false, true); // a third stacks above both
    expect(fx.stackedY(100, 50, "9", false)).toBe(y - popBox("9", false).h);
    fx.update(1 / 60);
    expect(fx.stackedY(100, 50, "24", false)).toBe(50); // an older pop: as before
  });

  it("arenaReact stacks its pops on the day's hull only (Battle.scaled): off, or no day, every popup as before", () => {
    setHullScale(false); // AZ-BUMP (the flip, HULL_SCALE): this test's switch-off reads (it ships on; the afterEach puts it back)
    const run =(scaled: boolean, day?: number): boolean[] => {
      const a = (scaled ? on : (f: () => Arena) => f())(() =>
        new Arena(heroStartBuild("furnace", 1), heroStartBuild("weaver", 101), 7, null, undefined, undefined, day));
      a.quiet = true;
      expect(a.b.scaled).toBe(scaled && day !== undefined);
      const spy = vi.spyOn(a.fx, "popup");
      for (let f = 0; f < 60 * 12 && !a.b.over; f++) a.update(1 / 60);
      const stacks = spy.mock.calls.map((c) => c[5] === true);
      spy.mockRestore();
      return stacks;
    };
    const day10 = run(true, 10);
    expect(day10.length).toBeGreaterThan(0);
    expect(day10.every((x) => x)).toBe(true);
    for (const stacks of [run(false, 10), run(true)]) {
      expect(stacks.length).toBeGreaterThan(0);
      expect(stacks.every((x) => !x)).toBe(true);
    }
  });
});

describe("HULL-1d: the desk bar's wind slot (ruling Q4)", () => {
  const DESK = [480, 270] as const; // 1920x1080 at x4

  it("switch on: the desk bar is DESK_WIND_W wider and keeps that room, so WIND 10.3%/S fits whole; its buttons keep their width", () => {
    setHullScale(false); // AZ-BUMP (the flip, HULL_SCALE): this test's switch-off reads (it ships on; the afterEach puts it back)
    const off =battleLayout(DESK[0], DESK[1], false).bar, at = on(() => battleLayout(DESK[0], DESK[1], false)).bar;
    expect(off.w).toBe(DESK_BAR_W);
    expect(at.w).toBe(DESK_BAR_W + DESK_WIND_W);
    const rowOff = barSpeedRow(off, "1:05"), rowOn = barSpeedRow(at, "1:05", true);
    expect(rowOff.windRoom).toBe(0);
    expect(rowOn.windRoom).toBe(DESK_WIND_W);
    expect(rowOn.sw).toBe(rowOff.sw);
    expect(rowOn.first - rowOn.x0).toBeGreaterThanOrEqual(Math.max(38, textWidth("WIND 10.3%/S", "3")));
    expect(rowOff.first - rowOff.x0).toBeLessThan(38); // today: only the clock
  });

  it("the phone bars and the switch off read as today", () => {
    setHullScale(false); // AZ-BUMP (the flip, HULL_SCALE): this test's switch-off reads (it ships on; the afterEach puts it back)
    for (const [W, H] of [[241, 414], [134, 230], [480, 270], [600, 338]] as const) {
      for (const portrait of [true, false]) {
        const off = battleLayout(W, H, portrait), at = on(() => battleLayout(W, H, portrait));
        if (portrait) expect(at, `${W}x${H}`).toEqual(off);
        expect(barWindRoom(off.bar.w)).toBe(off.bar.w > 200 ? 40 : 0);
        expect(barWindRoom(off.bar.w, false)).toBe(barWindRoom(off.bar.w));
      }
    }
    expect(barWindRoom(DESK_BAR_W, true)).toBe(0); // a desk bar the layout did not widen keeps no room
  });
});
