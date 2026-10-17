// D1 (BeltBattles 0.8.0, the wave-3 design; REQ-BFG-023, 022, 033): tools/wave3.ts, the hypothetical-offer extension
// of the luck tool. Everything it changes lives in memory and is undone: hypothetical modules leave ITEMS, the draw's
// patch leaves DORMANT_ITEMS. The family map v2 covers every buyable module; the per-run draw is hero-blind, holds
// 62 parts with five unlock steps, and the real caravan offers only its unlocked wares.
import { describe, expect, it } from "vitest";
import { ITEMS, RARITY_ARROWS, SHAPE_ARROWS, buyableModules, itemsSoldBy, rigShape, type HeroId } from "../src/sim/content";
import { withSustain } from "../src/sim/content"; // FLIP-X2: D1's catalogue has no sustain piece (inD1 below)
import { withShapes } from "../src/sim/shapes"; // SHAPES-1 flip: ... and no shaped rig (inD1 below)
import { withPlainRigs } from "../src/sim/plainRigs"; // BUMP-1D: ... and no plain rig (inD1 below)
import { withShapes2 } from "../src/sim/shapes2"; // BUMP-1D: ... and none of the six more shaped rigs (inD1 below)
import { DORMANT_ITEMS } from "../src/sim/races/data";
import { newRun, rollShop, type Run } from "../src/game/run";
import { Rng } from "../src/core/rng";
import { chaserRun, offerable, ownedDefs, runSeed, type ChaserStep } from "../tools/luckReport";
import {
  ADD_WAVE3, DRAW, FAMS_TODAY, FAMS_WAVE3, PROJ, TAGS_TODAY, WAVE3, catalogueCount, chaseOne, counted, familyTableV2,
  install, poolOf, quotas, tagsFor, todayWares, typicalOne, uninstall, wares, withCatalogue, withDraw,
} from "../tools/wave3";
import { NPCS, npcDeck, problems } from "../tools/wave3Npcs";

const HEROES: HeroId[] = ["furnace", "weaver", "foundry", "bastion", "metronome", "siphon"];

/**
 * FLIP-X2 (REQ-BFG-069): D1's variants (tools/wave3.ts: today, wave3, p100) are the catalogues D1 designed, which hold no
 * sustain piece: D1's tag map (TAGS_TODAY, tagsFor) has no row for one, and its counts are D1's. With the sustain switch on
 * (the default now) every variant also counts WARD BELL, MEND PRESS and MENDING LOOM, so D1's checks run in D1's world: the
 * sustain switch off for the call (withSustain(fn, false)). The live catalogue is pinned with the switch on below.
 */
// SHAPES-1 flip: D1's catalogues hold no shaped rig either (no row in D1's maps for NAIL STRIP, EMBER TROUGH or SPIKE RAIL,
// and D1's counts are without them), so D1's world also has shapes off for the call (withShapes(fn, false)); the live
// catalogue is pinned with every switch on below
// BUMP-1D: D1's catalogues hold none of the twelve rigs PLAIN_RIGS and SHAPES2 put in the catalogue (the six plain stat rigs and
// the six more shaped ones; no row in D1's maps, and D1's counts are without them), so D1's world also has both switches off for
// the call (withPlainRigs(fn, false), withShapes2(fn, false)); the live catalogue is pinned with every switch on below. The nesting
// puts the switches back in ITEMS order (the plain rigs, then the three shaped rigs, then the six more: each swap back appends)
const inD1 = <T>(fn: () => T): T => withShapes2(() => withShapes(() => withPlainRigs(() => withSustain(fn, false), false), false), false);

describe("wave3: the catalogue count (REQ-BFG-022 acceptance 1)", () => {
  // 0.8.0 I1 M2 (REPORT-P1 section 13, "D1's 71-module counts"): wave 3 is live, so v070-rc's catalogue is the `today`
  // variant (wave 3 off for one call); the live catalogue counts 86
  it("counts ITEMS without supplies and hero signatures: 71 at v070-rc, 58 without turrets, equal to buyableModules(); 89 live", () => {
    const c = inD1(() => withCatalogue("today", () => catalogueCount())); // FLIP-X2: in D1's world (was 74 with the switch on)
    expect(c.total).toBe(71);
    expect(c.modules).toBe(58);
    expect(c.turrets).toBe(13);
    expect(c.byKind).toEqual({ rig: 23, factory: 13, core: 13, mod: 9, turret: 13 });
    // FLIP-X2 (REVIEW-NUM3 answer 2): SIFTER is dormant (still in ITEMS, no longer stocked), so the count differs from
    // buyableModules() by exactly the dormant set (was sameAsBuyable true)
    expect(c.sameAsBuyable).toBe(false);
    expect(inD1(() => withCatalogue("today", () => counted().filter((id) => !buyableModules().some((d) => d.id === id))))).toEqual([...DORMANT_ITEMS]);
    expect(c.supplies.sort()).toEqual(["beltcrate", "plating"]);
    expect(c.signatures.sort()).toEqual(["clockworks", "crucible", "kiln", "loom", "sump", "wardworks"]);
    const live = catalogueCount();
    // FLIP-X2 (REQ-BFG-069, the sustain switch on): + WARD BELL, MEND PRESS, MENDING LOOM: 86 -> 89 counted, 73 -> 76
    // without turrets; buyableModules() 85 -> 88 (the dormant SIFTER is counted, not stocked: sameAsBuyable stays false)
    // SHAPES-1 flip: + NAIL STRIP, EMBER TROUGH and SPIKE RAIL (rigs): 89 -> 92 counted, 76 -> 79 without turrets,
    // buyableModules() 88 -> 91, rig 31 -> 34 (GANTRY PRESS and ASSEMBLY LINE are reshaped, not added)
    // BUMP-1D: + the six plain stat rigs (PLAIN_RIGS) and the six more shaped rigs (SHAPES2), twelve rigs: 92 -> 104 counted,
    // 79 -> 91 without turrets, buyableModules() 91 -> 103, rig 34 -> 46 (the other kinds as before)
    expect([live.total, live.modules, live.turrets, live.sameAsBuyable]).toEqual([104, 91, 13, false]); // FLIP-X2: SIFTER dormant (was true); BUMP-1D: was [92, 79, 13, false]
    expect(buyableModules().length).toBe(103); // FLIP-X2: 89 counted less the dormant SIFTER (was 85); SHAPES-1 flip: was 88; BUMP-1D: was 91
    expect(live.byKind).toEqual({ rig: 46, factory: 16, core: 15, mod: 14, turret: 13 }); // FLIP-X2: factory 15 -> 16, mod 12 -> 14; SHAPES-1 flip: rig 31 -> 34; BUMP-1D: rig 34 -> 46
    expect(inD1(() => catalogueCount()).total).toBe(86); // FLIP-X2: D1's wave-3 catalogue, the switch off
  });

  // FLIP-X2: in D1's world (the counts are D1's variants'; with the switch on each reads 3 more: 103, 102, 89)
  it("install adds the hypothetical modules and uninstall restores ITEMS exactly", () => inD1(() => {
    const before = JSON.stringify(ITEMS);
    install("p100");
    expect(counted().length).toBe(100);
    expect(buyableModules().length).toBe(99); // FLIP-X2: the dormant SIFTER is counted, not stocked (was 100)
    expect(() => install("wave3")).toThrow();
    uninstall();
    expect(JSON.stringify(ITEMS)).toBe(before);
    withCatalogue("wave3", () => expect(counted().length).toBe(86));
    expect(JSON.stringify(ITEMS)).toBe(before);
    expect(() => withCatalogue("wave3", () => { throw new Error("boom"); })).toThrow("boom");
    expect(JSON.stringify(ITEMS)).toBe(before);
  }));
});

describe("wave3: family map v2", () => {
  it("today: every buyable module carries 1-3 tags, and each of the 5 families has 12+ members across 2+ kinds", () => {
    // 0.8.0 I1 M2: v070-rc's catalogue, wave 3 off. FLIP-X2: in D1's world (inD1: with the switch on the table counts 74 and
    // the 3 sustain pieces, which D1's TAGS_TODAY never tags)
    const t = inD1(() => withCatalogue("today", () => familyTableV2("today")));
    expect(t.buyable.length).toBe(71);
    expect(t.untagged).toEqual([]);
    expect(t.unknown).toEqual([]);
    expect(Object.keys(TAGS_TODAY).sort()).toEqual([...t.buyable].sort());
    for (const id of t.buyable) {
      expect(TAGS_TODAY[id].length).toBeGreaterThanOrEqual(1);
      expect(TAGS_TODAY[id].length).toBeLessThanOrEqual(3);
    }
    expect(t.families.map((f) => f.fam)).toEqual(FAMS_TODAY);
    for (const f of t.families) expect(f.flag, f.fam).toBeNull();
    for (const id of t.buyable) for (const fam of new Set(TAGS_TODAY[id])) expect(TAGS_TODAY[id].filter((x) => x === fam).length).toBe(1);
  });

  it("wave 3 and the 1.0 projection: TWIN and PLATE join, every module tagged 1-3 times, every family 12+ across 2+ kinds", () => {
    // FLIP-X2: in D1's world (inD1: with the switch on each variant counts the 3 sustain pieces too, 89 and 103)
    for (const v of ["wave3", "p100"] as const) inD1(() => withCatalogue(v, () => {
      const t = familyTableV2(v);
      expect(t.buyable.length).toBe(v === "wave3" ? 86 : 100);
      expect(t.untagged).toEqual([]);
      expect(t.unknown).toEqual([]);
      expect(t.families.map((f) => f.fam)).toEqual(FAMS_WAVE3);
      for (const f of t.families) expect(f.flag, `${v} ${f.fam}`).toBeNull();
      const tags = tagsFor(v);
      for (const id of t.buyable) expect(new Set(tags[id]).size === tags[id].length && tags[id].length >= 1 && tags[id].length <= 3, id).toBe(true);
    }));
    // ADD_WAVE3 only adds tags to existing modules, never a tag they already carry
    for (const [id, t] of Object.entries(ADD_WAVE3)) for (const fam of t) expect(TAGS_TODAY[id], id).not.toContain(fam);
  });

  it("every hypothetical module is a valid buyable: new id, kind, a price for its rarity band, a merchant, rig arrows by rarity (R2)", () => {
    const ids = [...WAVE3, ...PROJ].map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(WAVE3.length).toBeGreaterThanOrEqual(14);
    expect(WAVE3.length).toBeLessThanOrEqual(16);
    expect(WAVE3.filter((h) => h.kind === "gate").length * 2).toBeGreaterThanOrEqual(WAVE3.length); // at least half rigs
    withCatalogue("p100", () => {
      for (const h of [...WAVE3, ...PROJ]) {
        const d = ITEMS[h.id];
        expect(Object.prototype.hasOwnProperty.call(ITEMS, h.id)).toBe(true);
        expect(d.merchant).toBe(h.merchant);
        expect(itemsSoldBy(h.merchant).map((x) => x.id)).toContain(h.id);
        expect(d.price).toBeGreaterThan(0);
        if (d.kind === "gate") expect(SHAPE_ARROWS[rigShape(d)!].length, h.id).toBe(RARITY_ARROWS[d.rarity]);
      }
    });
  });
});

describe("wave3: the per-run draw (REQ-BFG-022 part 2)", () => {
  it("quotas sum to the total, never exceed a group and follow the sizes", () => {
    const rng = new Rng(7);
    for (let k = 0; k < 200; k++) {
      const sizes = Array.from({ length: 1 + rng.int(30) }, () => 1 + rng.int(6));
      const sum = sizes.reduce((s, x) => s + x, 0), total = rng.int(sum + 5);
      const q = quotas(sizes, total, rng);
      expect(q.reduce((s, x) => s + x, 0)).toBe(Math.min(total, sum));
      q.forEach((x, i) => {
        expect(x).toBeLessThanOrEqual(sizes[i]);
        expect(Math.abs(x - (sizes[i] * Math.min(total, sum)) / sum)).toBeLessThan(1);
      });
    }
  });

  it("wares: 62 parts, five steps, day 1 at least 17, deterministic and hero-blind; every module reachable", () => {
    for (const v of ["today", "wave3", "p100"] as const) withCatalogue(v, () => {
      const seen = new Set<string>();
      for (let s = 1; s <= 300; s++) {
        const w = wares(s);
        expect(w.size).toBe(Math.min(DRAW.active, counted().length));
        expect([...w.keys()]).toEqual(counted().filter((id) => w.has(id))); // ITEMS order
        const p = poolOf(w);
        expect(p.active).toBe(w.size);
        expect(p.day1).toBeGreaterThanOrEqual(17);
        expect(p.steps).toEqual([2, 3, 4, 6, 8]);
        expect(wares(s)).toEqual(w);
        for (const id of w.keys()) seen.add(id);
      }
      expect(seen.size).toBe(counted().filter((id) => !DORMANT_ITEMS.has(id)).length); // FLIP-X2: every module but the dormant SIFTER
    });
    // the run seed decides, never the hero: each hero's par run seed draws by that seed alone
    for (const h of HEROES) expect(wares(runSeed(h, 3))).toEqual(wares(runSeed(h, 3)));
  });

  it("the real caravan offers only the run's unlocked wares (and supplies), for every hero alike, and the patch is undone", () => {
    const own = DORMANT_ITEMS.has;
    withCatalogue("wave3", () => {
      for (let s = 1; s <= 40; s++) {
        const w = wares(s);
        const caravans = HEROES.map((hero) => {
          const box: { run?: Run } = {};
          const shown: string[] = [];
          withDraw(w, () => box.run?.day ?? 1, () => {
            const run = newRun(hero, s, "t");
            box.run = run;
            for (let day = 1; day <= 10; day++) for (let r = 0; r < 6; r++) {
              run.day = day;
              run.shop = { wagons: [], rerolls: r, discount: 0, free: 0 };
              rollShop(run);
              for (const wg of run.shop.wagons) for (const o of wg.offers) {
                shown.push(`${day}:${o.def}`);
                if (ITEMS[o.def].kind === "supply") continue;
                expect(w.get(o.def), `${o.def} on day ${day}`).toBeLessThanOrEqual(day);
              }
            }
          });
          return shown;
        });
        for (const c of caravans) expect(c).toEqual(caravans[0]); // hero-blind (REQ-BFG-021)
      }
    });
    expect(DORMANT_ITEMS.has).toBe(own);
    expect(Object.prototype.hasOwnProperty.call(DORMANT_ITEMS, "has")).toBe(false);
    // AZ-BUMP (the 1.5-CPU quota, the GATE RULE; no switch): 600 s (was the 30 s default), a host timeout, not the rule.
    // 11.7 s in S1's whole suite, 15.9 s in AZ-BUMP run 4's switch-on shard, 78.5 s and 68.0 s in run 7 (shard s3-1, then
    // alone). Run 7's variants (the tree with ONE switch off, the four at once) read 41.7-44.5 s each: no switch makes it
    // slower
  }, 600_000);

  it("today's rule as a ware map: all 70, the ARCANE DEALER from day 3, legendaries from day 4 (two steps)", () => {
    // 0.8.0 I1 M2: v070-rc's catalogue, wave 3 off. FLIP-X2: in D1's world (inD1: with the switch on the map also holds the
    // 3 sustain pieces, { active: 73, day1: 64, steps: [3, 4] }: tools/wave3.ts's rule doesn't know their day-3 hold)
    const p = inD1(() => withCatalogue("today", () => poolOf(todayWares())));
    // FLIP-X2 (REVIEW-NUM3 answer 2): SIFTER dormant, a day-1 common: 71 -> 70 active, 62 -> 61 on day 1
    expect(p).toEqual({ active: 70, day1: 61, steps: [3, 4] });
  });
});

describe("wave3: the new NPCs (M5, tools/wave3Npcs.ts; REQ-BFG-024, 011)", () => {
  it("at least 2 human (FOUNDRY) and 2 dwarf (BASTION) warlords and 2 new stand-ins, each with a wave-3 family", () => {
    const w = NPCS.filter((n) => n.role === "warlord");
    expect(w.filter((n) => n.hero === "foundry").length).toBeGreaterThanOrEqual(2);
    expect(w.filter((n) => n.hero === "bastion").length).toBeGreaterThanOrEqual(2);
    expect(NPCS.filter((n) => n.role === "standin").length).toBeGreaterThanOrEqual(2);
    for (const n of NPCS) {
      expect(n.families.some((f) => f === "TWIN" || f === "PLATE"), n.id).toBe(true);
      expect(n.role === "warlord" ? n.tier !== null : n.tier === null, n.id).toBe(true);
    }
    expect(new Set(NPCS.map((n) => n.id)).size).toBe(NPCS.length);
  });

  it("every plan is legal on every day: caps of its luck tier, the stand-in budget, caravan days and slots", () => {
    withCatalogue("wave3", () => {
      for (const n of NPCS) expect(problems(n), n.id).toEqual([]);
      // the check bites: one more epic on day 1, or a legendary before day 4, is a problem
      const bad = { ...NPCS[0], buys: [...NPCS[0].buys, { def: "compound", at: 1 }] };
      expect(problems(bad).some((p) => p.includes("first offered"))).toBe(true);
      const rich = { ...NPCS[2], buys: [...NPCS[2].buys, { def: "shieldwall", at: 5 }, { def: "thunderer", at: 5 }] };
      expect(problems(rich).length).toBeGreaterThan(0);
      // cap's D1 check: the stand-in budget (maxGoldByDay) bites on its own, not only through the luck caps
      expect(problems(rich).some((p) => p.includes("budget")), problems(rich).join("; ")).toBe(true);
      // merges: 2 copies are one 2-star part worth both
      const d = npcDeck(NPCS[0], 4, "ordinary");
      expect(d.parts).toContainEqual({ def: "twingauge", stars: 2 });
      expect(d.parts.filter((p) => p.def === "twingauge").length).toBe(1);
      expect(d.value).toBe(3 + 3 + 3 + 7);
    });
  });
});

describe("wave3: the CHASER and the par player under a variant", () => {
  it("chaseOne without the draw is luckReport.ts chaserRun exactly", () => {
    const members = ["temper", "bellows", "quench", "drake", "hotswap"];
    for (const seed of [1, 2, 3]) {
      const c = chaserRun("furnace", members, seed);
      expect(chaseOne("furnace", members, seed, false)).toEqual({ full: c.day !== null, owned: c.owned, rerolls: c.rerolls, inWares: true });
    }
  });

  it("under the draw the CHASER buys only unlocked wares and rerolls only while a missing member is offerable today", () => {
    withCatalogue("wave3", () => {
      const members = familyTableV2("wave3").families.find((f) => f.fam === "PLATE")!.members;
      for (const hero of ["furnace", "bastion"] as HeroId[]) for (let seed = 1; seed <= 12; seed++) {
        const w = wares(runSeed(hero, seed));
        const box: { run?: Run } = {};
        const ledger: ChaserStep[] = [];
        const gate = (def: string, day: number) => { const u = w.get(def); return u !== undefined && u <= day && offerable(def, day); };
        const mine = withDraw(w, () => box.run?.day ?? 1, () => chaserRun(hero, members, seed, {
          ledger, start: (run) => { box.run = run; }, offerable: gate,
          observe: (run, s) => {
            expect(run.day).toBe(s.day);
            if (s.act === "buy") expect(w.get(s.def!)).toBeLessThanOrEqual(s.day);
            // cap's D1 check: a reroll needs a MISSING member that the draw lets the caravan offer today
            if (s.act === "reroll") {
              const own = ownedDefs(run);
              expect(members.some((m) => !own.has(m) && gate(m, s.day)), `${hero} ${seed} reroll on day ${s.day}`).toBe(true);
            }
          },
        }));
        // every reroll had a missing member the caravan could offer that day
        for (const s of ledger.filter((x) => x.act === "reroll")) expect(members.some((m) => gate(m, s.day))).toBe(true);
        const c = chaseOne(hero, members, seed, true);
        // cap's D1 check: chaseOne under the draw is exactly this gated run (the same gate, never a looser one)
        expect({ full: c.full, owned: c.owned, rerolls: c.rerolls }).toEqual({ full: mine.day !== null, owned: mine.owned, rerolls: mine.rerolls });
        expect(c.inWares).toBe(members.every((m) => w.has(m)));
        if (c.full) expect(c.inWares).toBe(true); // a full set needs every member among the run's wares
      }
    });
  });

  it("the par player under a variant and a draw: deterministic, and the day-10 deck's stars", () => {
    const a = withCatalogue("wave3", () => typicalOne("furnace", 5, true));
    const b = withCatalogue("wave3", () => typicalOne("furnace", 5, true));
    expect(a).toEqual(b);
    expect(a.star2).toBeGreaterThanOrEqual(0);
    expect(a.merges).toBeGreaterThanOrEqual(a.star2 + a.star3 > 0 ? 1 : 0);
    // the run under today's rule replays the cached par run exactly
    const t = typicalOne("weaver", 2, false), u = typicalOne("weaver", 2, false);
    expect(t).toEqual(u);
  });
});
