// 0.8.0 P1 (BRIEF-wave3-P1 M1; REQ-BFG-022, REQ-BFG-023, REQ-BFG-021): wave 3's 15 modules in content.ts behind one
// switch, family map v2, and the SMUGGLER picking by effect.
// - The switch (content.ts WAVE3_LIVE, off on this branch): every wave-3 entry resolves in ITEMS, but no listing of the
//   catalogue sees it while the switch is off: buyableModules(), itemsSoldBy() (the caravan), the road-event pools, the
//   warlord prizes and the stand-in pool. withWave3 turns it on for one call and puts it back, even on a throw.
//   0.8.0 I1 M2 (REPORT-P1 section 13): the switch is ON. P1's switch-off assertions are flipped into switch-on ones; each
//   still checks both states, the off state now through withWave3(fn, false).
// - The entries are D1's (tools/wave3.ts WAVE3_DESIGN: kind, rarity, price, merchant, shape, v2 tags).
// - Family map v2: every buyable module carries 1-3 of the seven families, exactly D1's map (tools/wave3.ts tagsFor).
// - The SMUGGLER picks the same six rigs as v070-rc, by effect, and no wave-3 rig joins either pool.
import { describe, expect, it } from "vitest";
import {
  ITEMS, MERCHANTS, RARITY_ARROWS, SHAPE_ARROWS, WAVE3_IDS, WAVE3_ITEMS, WAVE3_LIVE, buyableModules, isWave3, itemsSoldBy,
  rigShape, wave3Live, withWave3, type MerchantId, type ModuleTag,
} from "../src/sim/content";
import { SUSTAIN_IDS, isSustain, withSustain } from "../src/sim/content"; // FLIP-X2: the sustain pieces follow wave 3
import { DORMANT_ITEMS } from "../src/sim/races/data";
import { EVENTS, SMUGGLER_EFFECT, UPGRADE, salvagePool, smugglerParts, smugglerPool, swapPart } from "../src/game/eventDefs";
import { newRun, rollShop } from "../src/game/run";
import { hardParts, topParts, warlordDeck } from "../src/game/road";
import { RIVALS, RIVAL_IDS, rivalBuild, rivalDays, standInBuild } from "../src/sim/rivals";
import { warlordBuild } from "../src/sim/ai";
import { standInPool } from "../src/sim/standInPool";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { validateBuild } from "../src/net/validate";
import { effectAt } from "../src/sim/stars";
import { key, type Build } from "../src/sim/deck";
import { familyTable } from "../tools/luckReport";
import { WAVE3_DESIGN, tagsFor } from "../tools/wave3";

const FAMS: ModuleTag[] = ["FORGE", "HARASS", "SWARM", "BURST", "TEMPO", "TWIN", "PLATE"];
const ids = (ds: { id: string }[]) => ds.map((d) => d.id);
const MERCHANT_IDS = Object.keys(MERCHANTS) as MerchantId[];

/** A FURNACE start deck with a PLATE ROLLER beside its kiln belt (legal on day 1 once wave 3 is in the game). */
function rollerDeck(): Build {
  return {
    hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "plateroller", x: 3, y: 3, rot: 1 }],
    routes: [{ factory: 1, cells: [key(4, 5), key(4, 4), key(4, 3), key(4, 2), key(4, 1), key(4, 0)] }],
    mods: [], beltCap: 14, hullBonus: 0,
  };
}

describe("wave 3 behind one switch (content.ts WAVE3_LIVE)", () => {
  // 0.8.0 I1 M2: flipped (the switch is on): every listing sees the 15, after every older entry; off for one call, none
  it("is on (0.8.0 I1): the 15 entries resolve in ITEMS and every listing of the catalogue sees them, after every older entry", () => {
    expect(WAVE3_LIVE).toBe(true);
    expect(wave3Live()).toBe(true);
    expect(WAVE3_IDS).toHaveLength(15);
    for (const id of WAVE3_IDS) {
      expect(Object.prototype.hasOwnProperty.call(ITEMS, id), id).toBe(true);
      expect(ITEMS[id], id).toBe(WAVE3_ITEMS[id]);
      expect(ITEMS[id].id).toBe(id);
      expect(effectAt(id, 3).id).toBe(id);
      expect(isWave3(id)).toBe(true);
      expect(DORMANT_ITEMS.has(id)).toBe(false); // the switch is enumerability, not DORMANT_ITEMS (PLAN-P1.md)
    }
    expect(Object.keys(ITEMS).filter(isWave3)).toEqual([...WAVE3_IDS]);
    // after every older entry. FLIP-X2 (REQ-BFG-069, the sustain switch on): the 3 sustain pieces, newer still, follow wave 3
    // (content.ts: "its place in ITEMS order (after wave 3) never moves"), so wave 3 is the 15 before the last 3 (was the
    // last 15)
    expect(Object.keys(ITEMS).slice(-15 - SUSTAIN_IDS.length, -SUSTAIN_IDS.length)).toEqual([...WAVE3_IDS]);
    expect(Object.keys(ITEMS).slice(-SUSTAIN_IDS.length)).toEqual([...SUSTAIN_IDS]);
    expect(Object.values(ITEMS).filter((d) => isWave3(d.id)).map((d) => d.id)).toEqual([...WAVE3_IDS]);
    expect(JSON.stringify(ITEMS)).toMatch(/plateroller/);
    expect(JSON.stringify(ITEMS)).toMatch(/seamwelder/);
    expect(ids(buyableModules()).filter(isWave3)).toEqual([...WAVE3_IDS]);
    for (const m of MERCHANT_IDS) expect(ids(itemsSoldBy(m)).filter(isWave3), m).toEqual(WAVE3_IDS.filter((id) => ITEMS[id].merchant === m));
    // FLIP-X2 (REVIEW-NUM3 answer 2; REQ-BFG-069): SIFTER dormant (-1), the 3 sustain pieces in (+3): 86 -> 88, and 71 -> 73
    // with wave 3 off
    expect(buyableModules()).toHaveLength(88);
    withWave3(() => {
      expect(Object.keys(ITEMS).filter(isWave3)).toEqual([]);
      expect(ids(buyableModules()).filter(isWave3)).toEqual([]);
      expect(buyableModules()).toHaveLength(73);
    }, false);
  });

  it("withWave3(fn, false) takes all 15 out of the catalogue for one call, the older entries in order, and puts the switch back (also on a throw)", () => {
    // FLIP-X2 (REQ-BFG-069, the sustain switch on): the older entries, then wave 3, then the 3 sustain pieces (newer still);
    // wave 3 off for a call leaves the older entries and the sustain pieces, in order (was [...before, ...WAVE3_IDS])
    const all = Object.keys(ITEMS), before = all.filter((id) => !isWave3(id) && !isSustain(id));
    expect(all).toEqual([...before, ...WAVE3_IDS, ...SUSTAIN_IDS]); // ITEMS order: the older entries first, unchanged
    withWave3(() => {
      expect(wave3Live()).toBe(false);
      expect(Object.keys(ITEMS)).toEqual([...before, ...SUSTAIN_IDS]);
      expect(buyableModules()).toHaveLength(73); // FLIP-X2: 71 - SIFTER + the 3 sustain pieces (was 71)
      expect(ids(buyableModules()).filter(isWave3)).toEqual([]);
      for (const id of WAVE3_IDS) expect(ids(itemsSoldBy(ITEMS[id].merchant!)), id).not.toContain(id);
      withWave3(() => expect(buyableModules()).toHaveLength(88)); // nested: on for one call, back off after (FLIP-X2: was 86)
      expect(buyableModules()).toHaveLength(73);
    }, false);
    expect(wave3Live()).toBe(true);
    expect(Object.keys(ITEMS)).toEqual(all);
    expect(() => withWave3(() => { throw new Error("boom"); }, false)).toThrow("boom");
    expect(wave3Live()).toBe(true);
    expect(buyableModules()).toHaveLength(88); // FLIP-X2: was 86
  });

  it("the upload check takes a wave-3 part with the switch on, and refuses it while the switch is off", () => {
    expect(validateBuild(rollerDeck(), 1)).toEqual({ ok: true, errors: [] });
    const off = withWave3(() => validateBuild(rollerDeck(), 1), false);
    expect(off.ok).toBe(false);
    expect(off.errors).toEqual(["item: uid 2 PLATE ROLLER is not in the game yet"]);
  });
});

describe("the 15 entries are D1's (DESIGN-wave3.md 3.1)", () => {
  it("kind, rarity, price, merchant, rig shape and tags; 8 rigs, 2 factories, 2 cores, 3 mods; arrows by rarity (R2)", () => {
    expect(WAVE3_DESIGN.map((h) => h.id)).toEqual([...WAVE3_IDS]);
    for (const h of WAVE3_DESIGN) {
      const d = ITEMS[h.id];
      expect({ id: d.id, name: d.name, kind: d.kind, rarity: d.rarity, price: d.price, merchant: d.merchant, shape: d.shape, tags: d.tags }, h.id)
        .toEqual({ id: h.id, name: h.name, kind: h.kind, rarity: h.rarity, price: h.price, merchant: h.merchant, shape: h.shape, tags: [...h.tags] });
      expect(d.size).toBe(d.kind === "factory" ? 2 : 1);
      if (d.kind === "gate") expect(SHAPE_ARROWS[rigShape(d)!].length, h.id).toBe(RARITY_ARROWS[d.rarity]);
      for (const s of [2, 3] as const) expect(d.levels?.[s], `${h.id} ★${s}`).toBeDefined(); // every module has 1-3 stars
    }
    const by = (k: string) => WAVE3_IDS.filter((id) => ITEMS[id].kind === k).length;
    expect([by("gate"), by("factory"), by("core"), by("mod"), by("turret")]).toEqual([8, 2, 2, 3, 0]);
    expect(new Set(WAVE3_IDS.map((id) => ITEMS[id].name)).size).toBe(15);
    for (const id of WAVE3_IDS) expect(id).toMatch(/^[a-z]+$/); // the stand-in code's ids
    // the rig sellers (TINKER, ALCHEMIST) take no core (0.6.2m)
    for (const id of WAVE3_IDS) if (ITEMS[id].kind === "core") expect(["tinker", "alchemist"]).not.toContain(ITEMS[id].merchant);
  });

  it("the merchants' stock after wave 3: IRONMONGER +5, TINKER +3, ALCHEMIST +1, GUNSMITH +2, SCRAPPER +2, QUARTERMASTER +1, ARCANE DEALER +1", () => {
    const count = () => Object.fromEntries(MERCHANT_IDS.map((m) => [m, itemsSoldBy(m).filter((d) => d.kind !== "supply").length]));
    const off = withWave3(count, false), on = count(); // 0.8.0 I1 M2: flipped (the switch is on)
    expect(Object.fromEntries(MERCHANT_IDS.map((m) => [m, on[m] - off[m]])))
      .toEqual({ ironmonger: 5, tinker: 3, alchemist: 1, gunsmith: 2, scrapper: 2, quartermaster: 1, arcane: 1 });
    // FLIP-X2 (REQ-BFG-069; REVIEW-NUM3 answer 2): + MEND PRESS (IRONMONGER) and WARD BELL (TINKER); ALCHEMIST + MENDING LOOM
    // - the dormant SIFTER (was ironmonger 13, tinker 13); wave 3's own adds above are unchanged
    expect(on).toEqual({ ironmonger: 14, tinker: 14, alchemist: 9, gunsmith: 27, scrapper: 8, quartermaster: 7, arcane: 9 });
  });
});

describe("family map v2 in content.ts (DESIGN-wave3.md 2.2; VERIFIED-D1 Q1-Q3)", () => {
  it("every buyable module carries 1-3 distinct families, exactly D1's map, with the switch off and on", () => {
    const map = tagsFor("wave3");
    // FLIP-X2 (REQ-BFG-069): D1's map (tools/wave3.ts) is the catalogue D1 designed, which has no sustain piece, so the map
    // check runs in that catalogue, the sustain switch off for the call; SIFTER is dormant (85 / 70, was 86 / 71). The 3
    // sustain pieces' own families (BOTS-X's tags in content.ts) are checked after, with the switch on
    for (const on of [false, true]) withSustain(() => withWave3(() => {
      const all = buyableModules();
      expect(all).toHaveLength(on ? 85 : 70);
      for (const d of all) {
        const t = d.tags ?? [];
        expect(t.length >= 1 && t.length <= 3 && new Set(t).size === t.length, d.id).toBe(true);
        for (const f of t) expect(FAMS).toContain(f);
        expect([...t].sort(), d.id).toEqual([...map[d.id]].sort());
      }
    }, on), false);
    // FLIP-X2: with the switch on (the default now) the buyable modules are D1's and the 3 sustain pieces, each with 1-3
    // distinct families of the seven: WARD BELL and MENDING LOOM PLATE, MEND PRESS PLATE and SWARM
    expect(buyableModules().filter((d) => !(d.id in map)).map((d) => [d.id, d.tags])).toEqual([
      ["wardbell", ["PLATE"]], ["mendpress", ["PLATE", "SWARM"]], ["mendingloom", ["PLATE"]],
    ]);
    // nothing else carries a tag: the signatures and supplies
    for (const d of Object.values(ITEMS)) if (!d.merchant || d.price <= 0 || d.kind === "supply") expect(d.tags, d.id).toBeUndefined();
  });

  it("with wave 3: 7 families of 14-25 members across 4-5 kinds (D1 3.5), read by the luck tool from content.ts", () => {
    const t = familyTable(); // 0.8.0 I1 M2: flipped (the switch is on)
    expect(t.families.map((f) => f.tag).sort()).toEqual([...FAMS].sort());
    expect(t.generalists).toEqual([]);
    const size = Object.fromEntries(t.families.map((f) => [f.tag, f.members.length]));
    // FLIP-X2 (REVIEW-NUM3 answer 2; REQ-BFG-069): SIFTER (FORGE, HARASS, PLATE) out, WARD BELL and MENDING LOOM (PLATE) and
    // MEND PRESS (PLATE, SWARM) in: FORGE 23 -> 22, HARASS 19 -> 18, SWARM 24 -> 25, PLATE 14 -> 16 (still 14-25)
    expect(size).toEqual({ FORGE: 22, HARASS: 18, SWARM: 25, BURST: 25, TEMPO: 23, TWIN: 18, PLATE: 16 });
    for (const f of t.families) expect(f.kinds.length, f.tag).toBeGreaterThanOrEqual(4);
    // with the switch off the same tags read 7 families too (TWIN and PLATE on the older modules: 13 and 5)
    // FLIP-X2: the same moves with wave 3 off: FORGE 19 -> 18, HARASS 18 -> 17, SWARM 20 -> 21, PLATE 5 -> 7
    const off = withWave3(() => familyTable(), false);
    expect(Object.fromEntries(off.families.map((f) => [f.tag, f.members.length])))
      .toEqual({ FORGE: 18, HARASS: 17, SWARM: 21, BURST: 23, TEMPO: 19, TWIN: 13, PLATE: 7 });
  });
});

describe("the SMUGGLER picks by effect (DESIGN-wave3.md 2.5)", () => {
  it("the same six rigs as v070-rc, switch off and on, and no wave-3 rig in either pool", () => {
    for (const on of [false, true]) withWave3(() => {
      expect(smugglerPool("BURN"), `on=${on}`).toEqual(["temper", "bellows", "quench"]);
      expect(smugglerPool("SHOCK"), `on=${on}`).toEqual(["coil", "staticbrush", "lodestone"]);
    }, on);
    for (const id of WAVE3_IDS) {
      const e = ITEMS[id].gate;
      if (!e) continue;
      for (const s of [1, 2, 3]) {
        const g = effectAt(id, s).gate!;
        expect(SMUGGLER_EFFECT.BURN(g) || SMUGGLER_EFFECT.SHOCK(g), `${id} ★${s}`).toBe(false);
      }
    }
  });

  it("its two parts for every pick are the same with the switch on (the event doesn't change)", () => {
    const picks = Array.from({ length: 400 }, (_, i) => (i + 0.5) / 400);
    const off = picks.map((p) => smugglerParts(p).join("+"));
    expect(withWave3(() => picks.map((p) => smugglerParts(p).join("+")))).toEqual(off);
    expect(EVENTS.smuggler.title).toBe("AMMO SMUGGLER");
  });
});

describe("nothing in play sees wave 3 while the switch is off (BRIEF-wave3-P1 section 0)", () => {
  // 0.8.0 I1 M2: flipped (the switch is on): the switch-off half runs under withWave3(fn, false)
  it("no caravan offers a wave-3 part (200 runs, days 1-10, 3 rolls a day); with the switch on, they are offered", () => {
    let seen = 0, onSeen = 0;
    withWave3(() => {
      for (let s = 1; s <= 200; s++) for (const hero of ["furnace", "weaver"] as const) {
        const run = newRun(hero, s, "wave3-off");
        for (let day = 1; day <= 10; day++) for (let r = 0; r < 3; r++) {
          run.day = day;
          run.shop = { wagons: [], rerolls: r, discount: 0, free: 0 };
          rollShop(run);
          for (const w of run.shop.wagons) for (const o of w.offers) if (isWave3(o.def)) seen++;
        }
      }
    }, false);
    {
      for (let s = 1; s <= 50; s++) {
        const run = newRun("furnace", s, "wave3-on");
        for (let day = 1; day <= 10; day++) {
          run.day = day;
          run.shop = { wagons: [], rerolls: 0, discount: 0, free: 0 };
          rollShop(run);
          for (const w of run.shop.wagons) for (const o of w.offers) if (isWave3(o.def)) onSeen++;
        }
      }
    }
    expect(seen).toBe(0);
    expect(onSeen).toBeGreaterThan(0);
  });

  // 0.8.0 I1 M2: flipped (the switch is on): the switch-off half runs under withWave3(fn, false)
  it("the road-event pools (SALVAGE, SMUGGLER, TRADER) hold no wave-3 part; with the switch on, SALVAGE and SWAP take them", () => {
    const pools = () => [salvagePool(), smugglerPool("BURN"), smugglerPool("SHOCK"), ...(["common", "rare", "epic", "legendary"] as const).map((r) => UPGRADE[r])].flat();
    withWave3(() => {
      expect(pools().filter(isWave3)).toEqual([]);
      const swaps = new Set<string>();
      for (const def of ["temper", "coil", "splitter", "overdrive"]) for (let i = 0; i < 200; i++) swaps.add(swapPart(def, (i + 0.5) / 200)!);
      expect([...swaps].filter(isWave3)).toEqual([]);
    }, false);
    expect(salvagePool().filter(isWave3)).toEqual(["plateroller", "twingauge", "pincer"]);
    expect(UPGRADE.rare.filter(isWave3).length).toBeGreaterThan(0);
  });

  // 0.8.0 I1 M3 (oracle 64485b535a06683c): the stand-in pool is regrown through the per-run draw with wave 3 live
  // (VERIFIED-D1 Q8), so its clause ("no stand-in deck holds a wave-3 part") gives way to two checks: the regrown pool
  // holds all 15 wave-3 modules, and with the switch off every pool deck holding one is refused, one "not in the game yet"
  // error per wave-3 part and no other error (the switch causes the refusal). The warlord clauses stay until N1.
  // 0.8.0 N1 (oracle 94b9559fbb7da299 (8)): the warlord clause stays for the 13 captains of BASE (decks and prizes). The six
  // wave-3 captains are built on wave 3 (REQ-BFG-024): every deck they field, road and stand-in, on every day it appears,
  // holds at least one of the 15 wave-3 modules tagged TWIN or PLATE (a tag alone is too loose: the v2 guards carry PLATE
  // too); their prizes may be wave-3 parts and are not pinned.
  const SIX = new Set(["brasswick", "voss", "grimhold", "karsk", "lockjaw", "thistlemail"]);
  it("no warlord prize or warlord deck of the 13 holds a wave-3 part, and every deck of the six holds a wave-3 TWIN or PLATE module; the regrown stand-in pool holds the 12 pinned below, and the switch off refuses each such deck for them alone", () => {
    const parts = (b: Build) => [...b.items.map((p) => p.def), ...b.mods.map((m) => m.def), ...(b.turrets ?? []).map((t) => t.def)];
    const family = (b: Build) => parts(b).filter((d) => isWave3(d) && (ITEMS[d].tags ?? []).some((t) => t === "TWIN" || t === "PLATE"));
    for (const id of RIVAL_IDS) for (const day of rivalDays(id)) {
      if (SIX.has(id)) {
        const decks = RIVALS[id].standInOnly ? [standInBuild(id, day)] : [warlordDeck(id, day), standInBuild(id, day)];
        for (const b of decks) expect(family(b).length, `${id} day ${day}`).toBeGreaterThan(0);
        continue;
      }
      const deck = warlordDeck(id, day);
      expect(parts(deck).filter(isWave3), `${id} day ${day}`).toEqual([]);
      expect([...topParts(deck, 9), ...hardParts(id, deck, day, 4)].filter(isWave3), `${id} day ${day} prize`).toEqual([]);
      expect(parts(rivalBuild(id, day)).filter(isWave3)).toEqual([]);
    }
    expect(RIVAL_IDS.filter((id) => SIX.has(id))).toEqual([...SIX]);
    const inPool = new Set<string>();
    let decks = 0;
    for (const hero of PLAYABLE_HEROES) for (let day = 1; day <= 10; day++) {
      expect(parts(warlordBuild(hero, day)).filter(isWave3)).toEqual([]);
      for (const [i, e] of standInPool(hero, day).entries()) {
        const w3 = [...e.build.items, ...e.build.mods].filter((p) => isWave3(p.def));
        expect(parts(e.build).filter(isWave3), `${hero} day ${day} #${i}`).toEqual(w3.map((p) => p.def)); // no wave-3 turret
        if (!w3.length) continue;
        decks++;
        for (const p of w3) inPool.add(p.def);
        expect(validateBuild(e.build, day), `${hero} day ${day} #${i}, switch on`).toMatchObject({ ok: true, errors: [] });
        expect(withWave3(() => validateBuild(e.build, day), false), `${hero} day ${day} #${i}, switch off`).toEqual({
          ok: false, errors: w3.map((p) => `item: uid ${p.uid} ${ITEMS[p.def].name} is not in the game yet`),
        });
      }
    }
    // bb-0.8.6 (job PACKS run 2; oracle 47d683ef9b959301 (2)): the exact set the pool regrown under the packs holds, 12 of
    // the 15 (was all 15). SHIELD WALL, TWIN LATCH and TWIN TRIGGER no longer reach any stand-in pick (they are still sold
    // in the shops): the par player spends about 23% of its gold on packs by day 5 and 30% by day 10, so fewer part buys
    // reach the picks. No coverage rule: any change to the set turns this red
    expect([...inPool].sort()).toEqual([
      "anvil", "armorpress", "braceframe", "pincer", "platebreaker", "plateroller", "seamwelder", "spallcatcher", "steambreech",
      "stoker", "twingauge", "twinmould",
    ]);
    expect(inPool.has("stoker")).toBe(true);
    expect(decks).toBeGreaterThan(0);
  });
});
