// HULL-1b (REQ-BFG-078; REVIEW-NPC1 ruling Q2; cap's answer 98fa8a5115ab780f): the drop numbers, with NPC_DAY on. Hard drops
// at ★2 (npcDay.ts DROP_STARS) and its common rigs weigh 5 (DROP_WEIGHTS.hard 2/2/3/5, was 2/2/3/3); the chances stay
// 60/75/90%. The band: on every day 3-10 a Hard win's expected road value is 1.25x-1.6x a Medium win's (tools/dropBand.ts
// prints the table). The star comes from the tier on both sides (the client's cargo copy and the server's budget), never
// from the road entry. Every test that turns NPC_DAY on puts it back.
import { afterEach, describe, expect, it } from "vitest";
import type { SideStats } from "../src/sim/battle";
import { HEROES, ITEMS, RULES_VERSION, type HeroId } from "../src/sim/content";
import type { Build } from "../src/sim/deck";
import {
  DROP_CHANCE, DROP_CLASSES, DROP_STARS, DROP_WEIGHTS, NPC_DAY, dropClass, dropStarsOf, dropTable, expectedDropValue, npcDayRules,
  roadDropValue, setNpcDay, withNpcDay, type DropClass,
} from "../src/sim/npcDay";
import { DIFFICULTIES, MATRIARCH_DAY, warlordPool, type Difficulty } from "../src/sim/rivals";
import { valueOf } from "../src/sim/stars";
import { choicesFor, pickChoice } from "../src/game/events";
import { finishDay, ghostOf } from "../src/game/day";
import { gainModule } from "../src/game/fuse";
import {
  expectedRoadValue, finishWarlord, leaveCaravan, onToTheRoad, pickRoad, rewardGold, topParts, warlordDeck, warlordDrop, warlordDropTable,
} from "../src/game/road";
import { newRun, pendingRune, takeRune, type Run } from "../src/game/run";
import { validateUpload } from "../src/net/validate";
import { heroGateProblem } from "../src/net/rulesGate";
import { dropCardText, dropStarText } from "../src/screens/fork/drops";
import type { GhostSnapshot } from "../src/net/snapshot";

afterEach(() => setNpcDay(false));

const Z: SideStats = { shots: 0, damage: 0, firstShot: 0, idle: 0, turretTime: 0, maxQueue: 0, jams: 0, disrupted: 0, windTaken: 0, burnDealt: 0, payloadSum: 0, produced: 0, stalled: 0 };
const HEROS = (Object.keys(HEROES) as HeroId[]).filter((h) => heroGateProblem(RULES_VERSION, h) === null);
const PLATE = ITEMS.plating.supply!.hull!;
const ofClass = (c: DropClass): string[] => Object.keys(ITEMS).filter((d) => dropClass(d) === c).sort();
const deckOf = (defs: string[]): Pick<Build, "hero" | "items" | "mods" | "turrets"> => ({
  hero: "furnace", items: defs.map((def, i) => ({ uid: i + 1, def, x: 0, y: 0 })), mods: [], turrets: [],
});
/** Every copy of `def` a run holds (cargo, deck items, gear), with its stars. */
const copies = (run: Run, def: string): number[] => [...run.inventory, ...run.build.items, ...run.build.mods].filter((p) => p.def === def).map((p) => p.stars ?? 1);

/** npc1.server.test.ts's honest run: `days` NPC days through the game's rules, snapshotted at the last dusk. */
function honest(hero: HeroId, seed: number, days: number, tier: Difficulty | ((d: number) => Difficulty)): GhostSnapshot {
  setNpcDay(true);
  const run: Run = newRun(hero, seed, `hull1b-${hero}-${seed}`);
  let snap: GhostSnapshot | null = null;
  for (let d = 1; d <= days; d++) {
    const o = pendingRune(run);
    if (o) takeRune(run, o.ids[0]);
    leaveCaravan(run);
    expect(pickRoad(run, typeof tier === "function" ? tier(d) : tier).ok).toBe(true);
    finishWarlord(run, 0, 20);
    onToTheRoad(run);
    const i = choicesFor(run).findIndex((c) => !c.blocked);
    if (i >= 0) pickChoice(run, i);
    onToTheRoad(run);
    leaveCaravan(run);
    snap = ghostOf(run, 1_790_000_000_000, "p-hull1b", null);
    if (d < days) finishDay(run, 0, 30, { ...Z }, { ...Z });
  }
  return snap!;
}
const check = (s: GhostSnapshot) => validateUpload(s.build, s.day, s.rules, { seed: s.seed, ...(s.road ? { road: s.road } : {}) });

describe("HULL-1b the drop numbers (REQ-BFG-078; Q2's levers: ★2 and the tilt)", () => {
  it("the tables: chances 60/75/90 (unchanged), Hard t/e/r/c 2/2/3/5, Easy and Medium 1/1/3/6; Hard drops at ★2; the operator's shape", () => {
    expect(NPC_DAY).toBe(false);
    expect(DROP_CHANCE).toEqual({ easy: 0.6, medium: 0.75, hard: 0.9 });
    expect(DROP_WEIGHTS).toEqual({
      easy: { turret: 1, epic: 1, rare: 3, common: 6 }, medium: { turret: 1, epic: 1, rare: 3, common: 6 }, hard: { turret: 2, epic: 2, rare: 3, common: 5 },
    });
    expect(DROP_STARS).toEqual({ easy: 1, medium: 1, hard: 2 });
    for (const t of DIFFICULTIES) {
      const w = DROP_WEIGHTS[t];
      expect(w.turret, `${t}: turrets and factories never outweigh common rigs`).toBeLessThanOrEqual(w.common);
      for (const c of DROP_CLASSES) expect(w[c], `${t}: common rigs the most often`).toBeLessThanOrEqual(w.common);
    }
  });

  it("THE BAND: on days 3-10 a Hard win is 1.25x-1.6x a Medium win; Medium is richer than Easy; Hard is gold + its drop at ★2", () => {
    withNpcDay(() => {
      for (let day = 3; day <= 10; day++) {
        const h = expectedRoadValue(day, "hard"), m = expectedRoadValue(day, "medium"), e = expectedRoadValue(day, "easy");
        expect(h / m, `day ${day}: Hard/Medium`).toBeGreaterThanOrEqual(1.25);
        expect(h / m, `day ${day}: Hard/Medium`).toBeLessThanOrEqual(1.6);
        expect(m, `day ${day}: Medium > Easy`).toBeGreaterThan(e);
        // the ★2 drop is worth twice its ★1 copy: Hard = gold + 2 x the ★1 expected drop, captain by captain
        const ids = warlordPool("hard");
        const want = ids.reduce((s, id) => {
          const t = warlordDropTable(id, "hard", warlordDeck(id, day));
          return s + rewardGold("hard", day) + 2 * t.lines.reduce((a, l) => a + l.odds * valueOf(l.def, 1), 0);
        }, 0) / ids.length;
        expect(h).toBeCloseTo(want, 9);
      }
      // the Matriarch's part stays at ★1: 5 gold and her legendary part's value
      for (let day = MATRIARCH_DAY; day <= 10; day++) {
        const p = topParts(warlordDeck("matriarch", day), 1)[0];
        expect(expectedRoadValue(day, "matriarch")).toBe(5 + valueOf(p, 1));
      }
    });
  });

  it("the tables carry the star: Hard's ★2 (only when something drops); Easy, Medium and the Matriarch none (★1)", () => {
    const deck = deckOf([ofClass("turret")[0], ofClass("epic")[0], ofClass("rare")[0], ofClass("common")[0], ofClass("common")[1]]);
    const hard = dropTable("hard", deck);
    expect(hard.stars).toBe(2);
    expect(expectedDropValue(hard)).toBeCloseTo(2 * hard.lines.reduce((s, l) => s + l.odds * valueOf(l.def, 1), 0), 12);
    for (const t of ["easy", "medium"] as const) expect("stars" in dropTable(t, deck), t).toBe(false);
    expect(dropTable("hard", deckOf(["plating"]))).toEqual({ chance: 0, lines: [] });
    const queen = warlordDeck("matriarch", MATRIARCH_DAY);
    expect("stars" in warlordDropTable("matriarch", "hard", queen)).toBe(false);
    // the odds follow the new Hard weights: common 5 of 12 shared by its two parts
    const common = hard.lines.filter((l) => l.cls === "common");
    for (const l of common) expect(l.odds).toBeCloseTo((0.9 * 5) / 12 / 2, 12);
  });

  it("the cards say the star: the victory card DROP · TO CARGO · ★2 for Hard, ★1 otherwise; the inspect row and list ★2", () => {
    const def = ofClass("rare")[0];
    expect(dropCardText(def, false, DROP_STARS.hard)!.sub).toBe("DROP · TO CARGO · ★2");
    expect(dropCardText(def, false)!.sub).toBe("DROP · TO CARGO · ★1");
    expect(dropCardText(def, true, 1)!.sub).toBe("LEGENDARY · TO CARGO");
    const deck = deckOf([def, ofClass("common")[0]]);
    expect(dropStarText(dropTable("hard", deck))).toBe(" ★2");
    expect(dropStarText(dropTable("medium", deck))).toBe("");
    expect(dropStarText(dropTable("hard", deckOf(["plating"])))).toBe("");
  });
});

describe("HULL-1b a Hard win's ★2 copy (cargo, the fuse rule, the server)", () => {
  /** Day 1 of a run with the switch on, a `tier` warlord picked: the run, the warlord and the drop its win will give. */
  function fightDay1(hero: HeroId, seed: number, tier: Difficulty) {
    setNpcDay(true);
    const run = newRun(hero, seed, `hull1b-cargo-${seed}`);
    leaveCaravan(run);
    expect(pickRoad(run, tier).ok).toBe(true);
    const w = run.warlord!;
    return { run, drop: warlordDrop(run.seed, run.day, w.id, w.tier, w.build) };
  }

  it("gainModule's stars argument defaults to today's gain exactly; a ★2 gain is a ★2 copy in cargo", () => {
    const a = newRun("furnace", 3), b = newRun("furnace", 3), c = newRun("furnace", 3);
    const def = ofClass("rare").find((d) => copies(a, d).length === 0)!;
    gainModule(a, def);
    gainModule(b, def, undefined, 1);
    expect(b.inventory).toEqual(a.inventory);
    expect(a.inventory[a.inventory.length - 1]).toEqual({ uid: a.nextUid - 1, def });
    gainModule(c, def, undefined, 2);
    expect(c.inventory[c.inventory.length - 1]).toEqual({ uid: c.nextUid - 1, def, stars: 2 });
  });

  it("a Hard win's drop goes to cargo at ★2; with a ★2 twin held it fuses to ★3 by the game's rule; an Easy drop stays ★1", () => {
    let seen = 0;
    for (let seed = 1; seed <= 60 && seen < 3; seed++) {
      const { run, drop } = fightDay1("weaver", seed, "hard");
      if (!drop) continue;
      const before = copies(run, drop);
      finishWarlord(run, 0, 20);
      expect(run.warlords[0].part).toBe(drop);
      const after = copies(run, drop);
      if (!before.includes(2)) expect(after.filter((s) => s === 2).length, `${drop}`).toBe(1 + before.filter((s) => s === 2).length);
      seen++;
    }
    expect(seen).toBe(3);
    // a ★2 twin already in cargo: the ★2 drop fuses with it into ★3
    for (let seed = 1; seed <= 60; seed++) {
      const { run, drop } = fightDay1("furnace", seed, "hard");
      if (!drop) continue;
      run.inventory.push({ uid: run.nextUid++, def: drop, stars: 2 });
      const n2 = copies(run, drop).filter((s) => s === 2).length;
      finishWarlord(run, 0, 20);
      const after = copies(run, drop);
      expect(after.filter((s) => s === 2).length, `${drop}: the two ★2 copies fused`).toBe(n2 - 1);
      expect(after.filter((s) => s === 3).length, `${drop}: into one ★3`).toBeGreaterThanOrEqual(1);
      break;
    }
    // an Easy win's drop: a ★1 copy, as NPC-1 built it
    for (let seed = 1; seed <= 60; seed++) {
      const { run, drop } = fightDay1("furnace", seed, "easy");
      if (!drop || copies(run, drop).length) continue;
      finishWarlord(run, 0, 20);
      expect(copies(run, drop)).toEqual([1]);
      break;
    }
  });

  it("the server: Hard runs with ★2 drops pass the drop check and the budget; the budget counts Hard drops at ★2, Easy and Medium at ★1, the Matriarch's part at ★1", () => {
    let hardDrops = 0;
    for (const hero of HEROS) {
      for (const days of [4, 6]) {
        const s = honest(hero, 300 + days + hero.length, days, "hard");
        expect(check(s).errors, `${hero} d${days}`).toEqual([]);
        for (const e of s.road!) if (e.drop) {
          hardDrops++;
          expect(dropStarsOf(e)).toBe(2);
        }
        expect(roadDropValue(s.road)).toBe(s.road!.reduce((a, e) => a + (e.drop ? valueOf(e.drop, 2) : 0), 0));
      }
    }
    expect(hardDrops).toBeGreaterThan(10);
    for (const tier of ["easy", "medium"] as const) {
      const s = honest("furnace", 410, 5, tier);
      expect(check(s).errors, tier).toEqual([]);
      expect(roadDropValue(s.road)).toBe(s.road!.reduce((a, e) => a + (e.drop ? valueOf(e.drop, 1) : 0), 0));
    }
    const q = honest("furnace", 4040, 9, (d) => (d >= MATRIARCH_DAY ? "hard" : (["easy", "medium", "hard"] as const)[d % 3]));
    const queen = q.road!.find((e) => e.day === MATRIARCH_DAY)!;
    expect(ITEMS[queen.drop!].rarity).toBe("legendary");
    expect(dropStarsOf(queen)).toBe(1);
    expect(check(q).errors).toEqual([]);
  });

  it("the budget at its edge needs the drops at ★2: the line names them, and counted at ★1 the same deck would be over", () => {
    const s = honest("furnace", 77, 6, "hard");
    const value = roadDropValue(s.road), at1 = (s.road ?? []).reduce((a, e) => a + (e.drop ? valueOf(e.drop, 1) : 0), 0);
    expect(value).toBeGreaterThan(at1);
    const at = (k: number): GhostSnapshot => ({ ...s, build: { ...s.build, hullBonus: s.build.hullBonus + k * PLATE } });
    let k = 0;
    while (k < 400 && check(at(k + 1)).ok) k++;
    expect(check(at(k)).ok).toBe(true);
    expect(check(at(k + 1)).errors.join(" ")).toContain(`+ drops ${value}`);
    expect(npcDayRules()).toBe(true);
  });

  it("with the switch off nothing reads the new numbers: a Hard win is 0.9.7's pick of 2, no drop, no ★2 copy", () => {
    setNpcDay(false);
    const run = newRun("furnace", 21, "hull1b-off");
    leaveCaravan(run);
    expect(pickRoad(run, "hard").ok).toBe(true);
    const r = finishWarlord(run, 0, 20)!;
    expect(r.took).toBeNull();
    expect(r.parts.length).toBe(2);
    expect(run.warlord!.reward.chance).toBeUndefined();
  });
});
