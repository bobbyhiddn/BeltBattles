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
import { STAND_IN_POOL_DAYS, standInPool } from "../src/sim/standInPool"; // BUMP-1D: + STAND_IN_POOL_DAYS (the pool holds days 1-16)
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { validateBuild, validateUpload } from "../src/net/validate"; // S8c: + validateUpload (the player mode)
import { RULES_VERSION } from "../src/sim/content"; // S8c: the rules a stand-in travels under (fallback.ts offlineGhost)
import { npcDayRules } from "../src/sim/npcDay"; // S8c: the budget line is left to the player mode only while NPC_DAY is on
import { effectAt } from "../src/sim/stars";
import { key, type Build } from "../src/sim/deck";
import { familyTable } from "../tools/luckReport";
import { WAVE3_DESIGN, tagsFor } from "../tools/wave3";
import { LADDER_DEFS, withLadderFix } from "../src/sim/ladderFix"; // AZ-BUMP (the flip, LADDER_FIX): STOKER's fixed def
import { SHAPES_IDS, isShapesPiece, withShapes } from "../src/sim/shapes"; // SHAPES-1 flip: the three shaped rigs follow sustain
import { GUARD_DEFS, withGuard } from "../src/sim/guard"; // HULL-ON (the flip, GUARD): PLATE ROLLER's guarded def
import { PLAIN_RIG_IDS, isPlainRig, withPlainRigs } from "../src/sim/plainRigs"; // BUMP-1D (the flip, PLAIN_RIGS): the six plain stat rigs, after the sustain pieces in ITEMS
import { SHAPES2_IDS, isShapes2Piece, withShapes2 } from "../src/sim/shapes2"; // BUMP-1D (the flip, SHAPES2): the six more shaped rigs, last in ITEMS
import { SCALE_DEFS, SCALE_IDS, SCALE_RIGS, isScalePiece, withScaleRigs } from "../src/sim/scale"; // BUMP-1E (the flip, SCALE_RIGS): the seven scaling rigs, last of all in ITEMS; IRON WALL and SPALL CATCHER (wave 3's) are reworked

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
      // AZ-BUMP (the flip, LADDER_FIX): with the star-ladder pass on, ITEMS.stoker is its fixed def, a new object built from
      // WAVE3_ITEMS.stoker (ladderFix.ts LADDER_DEFS.stoker: ★3 stoke 0.7 -> 0.85), so STOKER's identity (the very entry, as
      // merged) is read with LADDER_FIX off and its on entry is compared with that fixed def; every other id as before
      if (Object.prototype.hasOwnProperty.call(LADDER_DEFS, id)) {
        // BUMP-1E (the flip): setLadderFix swaps every LADDER_DEFS id, QUENCH TANK's among them (ITEMS.quench), whatever the scaling switch says, so a
        // ladder-off read with the scaling switch ON left ITEMS.quench as the ladder-fixed QUENCH TANK for the rest of the worker while the switch was on
        // (KINDLING's def is in ITEMS only on the switch's own swap): the scaling switch is the OUTERMOST call of the read, off first and back last
        // (was: withLadderFix(() => ITEMS[id], false))
        expect(withScaleRigs(() => withLadderFix(() => ITEMS[id], false), false), id).toBe(WAVE3_ITEMS[id]);
        expect(ITEMS.quench.name, `${id}: the shipped def of QUENCH TANK after the ladder-off read`).toBe("KINDLING"); // BUMP-1E: the read leaves ITEMS as shipped (the scaling switch is on)
        expect(ITEMS[id], id).toEqual(LADDER_DEFS[id](WAVE3_ITEMS[id]));
      } else if (Object.prototype.hasOwnProperty.call(GUARD_DEFS, id)) {
        // HULL-ON (the flip, GUARD): ITEMS.plateroller is its guarded def, a new object built from WAVE3_ITEMS.plateroller
        // (guard.ts GUARD_DEFS.plateroller: gate.plate 5 / 11 / 17 -> 15 / 33 / 51), so its identity (the very entry, as
        // merged) is read with GUARD off and its on entry is compared with that guarded def, as STOKER's above
        expect(withGuard(() => ITEMS[id], false), id).toBe(WAVE3_ITEMS[id]);
        expect(ITEMS[id], id).toEqual(GUARD_DEFS[id](WAVE3_ITEMS[id]));
      } else if (Object.prototype.hasOwnProperty.call(SCALE_DEFS, id)) {
        // BUMP-1E (the flip, SCALE_RIGS on in bb-0.12.0): IRON WALL (shieldwall) and SPALL CATCHER (spallcatcher) are two of the five
        // reworks, so ITEMS[id] is their switch-on def, a new object built from WAVE3_ITEMS[id] (scale.ts SCALE_DEFS: the reader line, no plating
        // and no charge), so their identity (the very entry, as merged) is read with the scaling switch off and the on entry is compared with that
        // def, as STOKER's and PLATE ROLLER's above (was: ITEMS[id] toBe WAVE3_ITEMS[id] with the switch on, red for these two)
        expect(withScaleRigs(() => ITEMS[id], false), id).toBe(WAVE3_ITEMS[id]);
        expect(ITEMS[id], id).toEqual(SCALE_DEFS[id](WAVE3_ITEMS[id]));
      } else expect(ITEMS[id], id).toBe(WAVE3_ITEMS[id]);
      expect(ITEMS[id].id).toBe(id);
      expect(effectAt(id, 3).id).toBe(id);
      expect(isWave3(id)).toBe(true);
      expect(DORMANT_ITEMS.has(id)).toBe(false); // the switch is enumerability, not DORMANT_ITEMS (PLAN-P1.md)
    }
    expect(Object.keys(ITEMS).filter(isWave3)).toEqual([...WAVE3_IDS]);
    // after every older entry. FLIP-X2 (REQ-BFG-069, the sustain switch on): the 3 sustain pieces, newer still, follow wave 3
    // (content.ts: "its place in ITEMS order (after wave 3) never moves"), so wave 3 is the 15 before the last 3 (was the
    // last 15)
    // SHAPES-1 flip: the three shaped rigs join ITEMS after every other def (shapes.ts), so wave 3 is the 15 before the
    // 3 sustain pieces and the 3 rigs (was slice(-15 - SUSTAIN_IDS.length, -SUSTAIN_IDS.length) and slice(-SUSTAIN_IDS.length))
    // BUMP-1D (the flip, PLAIN_RIGS and SHAPES2): the six plain stat rigs and the six more shaped rigs join ITEMS too. The load
    // order is deck.ts's: plainRigs.ts first (right after the sustain pieces), then shapes.ts' three, then shapes2.ts' six, so
    // the tail after wave 3 is the 3 sustain pieces, the 6 plain rigs, the 3 shaped rigs and the 6 more shaped rigs (was the
    // 3 sustain pieces and the 3 rigs)
    // BUMP-1E (the flip, SCALE_RIGS on in bb-0.12.0): the seven scaling rigs join ITEMS after every other def (scale.ts: after SHAPES2's six), so
    // they are the last 7 keys and the tail above is read in the keys before them: `older` is ITEMS without them (was Object.keys(ITEMS) in each
    // of the five slices below)
    const nScale = SCALE_IDS.length, keys = Object.keys(ITEMS), older = keys.slice(0, -nScale);
    expect(SCALE_RIGS).toBe(true);
    expect(keys.slice(-nScale)).toEqual([...SCALE_IDS]);
    const nShaped = SHAPES_IDS.length, nShaped2 = SHAPES2_IDS.length, nPlain = PLAIN_RIG_IDS.length;
    const tail = SUSTAIN_IDS.length + nPlain + nShaped + nShaped2;
    expect(older.slice(-15 - tail, -tail)).toEqual([...WAVE3_IDS]);
    expect(older.slice(-tail, -(nPlain + nShaped + nShaped2))).toEqual([...SUSTAIN_IDS]);
    expect(older.slice(-(nPlain + nShaped + nShaped2), -(nShaped + nShaped2))).toEqual([...PLAIN_RIG_IDS]);
    expect(older.slice(-(nShaped + nShaped2), -nShaped2)).toEqual([...SHAPES_IDS]);
    expect(older.slice(-nShaped2)).toEqual([...SHAPES2_IDS]);
    expect(Object.values(ITEMS).filter((d) => isWave3(d.id)).map((d) => d.id)).toEqual([...WAVE3_IDS]);
    expect(JSON.stringify(ITEMS)).toMatch(/plateroller/);
    expect(JSON.stringify(ITEMS)).toMatch(/seamwelder/);
    expect(ids(buyableModules()).filter(isWave3)).toEqual([...WAVE3_IDS]);
    for (const m of MERCHANT_IDS) expect(ids(itemsSoldBy(m)).filter(isWave3), m).toEqual(WAVE3_IDS.filter((id) => ITEMS[id].merchant === m));
    // FLIP-X2 (REVIEW-NUM3 answer 2; REQ-BFG-069): SIFTER dormant (-1), the 3 sustain pieces in (+3): 86 -> 88, and 71 -> 73
    // with wave 3 off
    // SHAPES-1 flip: + NAIL STRIP, EMBER TROUGH and SPIKE RAIL, the three shaped rigs: 88 -> 91, and 73 -> 76 with wave 3 off
    // BUMP-1D: + the six plain stat rigs and the six more shaped rigs, twelve rigs: 91 -> 103, and 76 -> 88 with wave 3 off
    // BUMP-1E: + the seven scaling rigs (SCALE_IDS: each a rig with a merchant and a price, so stocked): 103 -> 110, and 88 -> 95 with wave 3 off
    expect(buyableModules()).toHaveLength(110);
    withWave3(() => {
      expect(Object.keys(ITEMS).filter(isWave3)).toEqual([]);
      expect(ids(buyableModules()).filter(isWave3)).toEqual([]);
      expect(buyableModules()).toHaveLength(95); // SHAPES-1 flip: + the three shaped rigs (was 73); BUMP-1D: + twelve (was 76); BUMP-1E: + seven (was 88)
    }, false);
  });

  it("withWave3(fn, false) takes all 15 out of the catalogue for one call, the older entries in order, and puts the switch back (also on a throw)", () => {
    // FLIP-X2 (REQ-BFG-069, the sustain switch on): the older entries, then wave 3, then the 3 sustain pieces (newer still);
    // wave 3 off for a call leaves the older entries and the sustain pieces, in order (was [...before, ...WAVE3_IDS])
    // SHAPES-1 flip: the three shaped rigs, newer still, follow the sustain pieces (shapes.ts: after every other def), and
    // stay through wave 3's switch: the older entries, wave 3, sustain, the 3 rigs (was [...before, ...WAVE3_IDS,
    // ...SUSTAIN_IDS], with no rig in `before`); the counts + 3 (was 73 / 88 / 73 / 88)
    // BUMP-1D: the six plain stat rigs (after the sustain pieces) and the six more shaped rigs (last) stay through wave 3's
    // switch too: the older entries, wave 3, sustain, the 6 plain rigs, the 3 rigs, the 6 more rigs (was [...before,
    // ...WAVE3_IDS, ...SUSTAIN_IDS, ...SHAPES_IDS]); the counts + 12 (was 76 / 91 / 76 / 91)
    // BUMP-1E (the flip, SCALE_RIGS on in bb-0.12.0): the seven scaling rigs (scale.ts SCALE_IDS) are the last keys of all, after the six more rigs,
    // and stay through wave 3's switch too: the older entries, wave 3, sustain, the 6 plain rigs, the 3 rigs, the 6 more rigs, the 7 scaling rigs (was
    // [...before, ...WAVE3_IDS, ...SUSTAIN_IDS, ...PLAIN_RIG_IDS, ...SHAPES_IDS, ...SHAPES2_IDS], with the seven inside `before`, ahead of wave 3);
    // the counts + 7 (was 88 / 103 / 88 / 103)
    const all = Object.keys(ITEMS), before = all.filter((id) => !isWave3(id) && !isSustain(id) && !isShapesPiece(id) && !isPlainRig(id) && !isShapes2Piece(id) && !isScalePiece(id));
    expect(all).toEqual([...before, ...WAVE3_IDS, ...SUSTAIN_IDS, ...PLAIN_RIG_IDS, ...SHAPES_IDS, ...SHAPES2_IDS, ...SCALE_IDS]); // ITEMS order: the older entries first, unchanged
    withWave3(() => {
      expect(wave3Live()).toBe(false);
      expect(Object.keys(ITEMS)).toEqual([...before, ...SUSTAIN_IDS, ...PLAIN_RIG_IDS, ...SHAPES_IDS, ...SHAPES2_IDS, ...SCALE_IDS]);
      expect(buyableModules()).toHaveLength(95); // FLIP-X2: 71 - SIFTER + the 3 sustain pieces (was 71); SHAPES-1 flip: + 3 rigs; BUMP-1D: + 12 (was 76); BUMP-1E: + 7 (was 88)
      expect(ids(buyableModules()).filter(isWave3)).toEqual([]);
      for (const id of WAVE3_IDS) expect(ids(itemsSoldBy(ITEMS[id].merchant!)), id).not.toContain(id);
      withWave3(() => expect(buyableModules()).toHaveLength(110)); // nested: on for one call, back off after (FLIP-X2: was 86; BUMP-1D: was 91; BUMP-1E: was 103)
      expect(buyableModules()).toHaveLength(95); // BUMP-1E: was 88
    }, false);
    expect(wave3Live()).toBe(true);
    expect(Object.keys(ITEMS)).toEqual(all);
    expect(() => withWave3(() => { throw new Error("boom"); }, false)).toThrow("boom");
    expect(wave3Live()).toBe(true);
    expect(buyableModules()).toHaveLength(110); // FLIP-X2: was 86; SHAPES-1 flip: + the three shaped rigs (was 88); BUMP-1D: + twelve (was 91); BUMP-1E: + seven (was 103)
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
    // PLAIN-1F (M6; REQ-BFG-107): a display name renamed since D1's table (the key and every other field as D1's): PLATE
    // BREAKER is SHIELD FUEL (the cold read's pick, M8; content.ts platebreaker)
    const RENAMED: Record<string, string> = { platebreaker: "SHIELD FUEL" };
    for (const h of WAVE3_DESIGN) {
      const d = ITEMS[h.id];
      expect({ id: d.id, name: d.name, kind: d.kind, rarity: d.rarity, price: d.price, merchant: d.merchant, shape: d.shape, tags: d.tags }, h.id)
        .toEqual({ id: h.id, name: RENAMED[h.id] ?? h.name, kind: h.kind, rarity: h.rarity, price: h.price, merchant: h.merchant, shape: h.shape, tags: [...h.tags] });
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
    // SHAPES-1 flip: + SPIKE RAIL (TINKER) and NAIL STRIP and EMBER TROUGH (ALCHEMIST), on both sides of wave 3's switch, so
    // the adds above hold (was tinker 14, alchemist 9)
    // BUMP-1D: + the six plain stat rigs and the six more shaped rigs, on both sides of wave 3's switch (the adds above hold):
    // IRONMONGER + SCALE GUARD, ELBOW GUARD (14 -> 16), TINKER + GRINDSTONE (15 -> 16), ALCHEMIST + RASP, BRANDING IRON, CINDER
    // HOOK (11 -> 14), GUNSMITH + SAW BAR (27 -> 28), SCRAPPER + SPARK GAP, JAW CRUSHER (8 -> 10), QUARTERMASTER + BALLAST,
    // PICKAXE (7 -> 9), ARCANE DEALER + SPARK COMB (9 -> 10)
    // BUMP-1E (the flip, SCALE_RIGS on in bb-0.12.0): + the seven scaling rigs (scale.ts SCALE_ITEMS, each with its merchant), on both sides of wave 3's
    // switch (the adds above hold): IRONMONGER + CINDER MAIL, LEECH COIL (16 -> 18), TINKER + CROWD PRESS, AEGIS SPIKE (16 -> 18), ALCHEMIST + ROT
    // GAUGE (14 -> 15), SCRAPPER + GRUDGE ROD (10 -> 11), QUARTERMASTER + TROPHY CHAIN (9 -> 10); GUNSMITH and ARCANE DEALER sell none (28 and 10 as before)
    expect(SCALE_RIGS).toBe(true);
    expect(on).toEqual({ ironmonger: 18, tinker: 18, alchemist: 15, gunsmith: 28, scrapper: 11, quartermaster: 10, arcane: 10 }); // BUMP-1E: was { ironmonger: 16, tinker: 16, alchemist: 14, gunsmith: 28, scrapper: 10, quartermaster: 9, arcane: 10 }
  });
});

describe("family map v2 in content.ts (DESIGN-wave3.md 2.2; VERIFIED-D1 Q1-Q3)", () => {
  it("every buyable module carries 1-3 distinct families, exactly D1's map, with the switch off and on", () => {
    const map = tagsFor("wave3");
    // FLIP-X2 (REQ-BFG-069): D1's map (tools/wave3.ts) is the catalogue D1 designed, which has no sustain piece, so the map
    // check runs in that catalogue, the sustain switch off for the call; SIFTER is dormant (85 / 70, was 86 / 71). The 3
    // sustain pieces' own families (BOTS-X's tags in content.ts) are checked after, with the switch on
    // SHAPES-1 flip: D1's catalogue has no shaped rig either, so the map check also runs with shapes off for the call
    // (withShapes(fn, false)); the three rigs' own families are checked after, with every switch on
    // BUMP-1D: D1's catalogue has none of the twelve rigs PLAIN_RIGS and SHAPES2 add either, so the map check also runs with
    // both off for the call (withPlainRigs(fn, false), withShapes2(fn, false)); their own families are checked after, with every
    // switch on. The nesting puts the switches back in ITEMS order (plain rigs, the three rigs, the six more rigs)
    // BUMP-1E (the flip, SCALE_RIGS on in bb-0.12.0): D1's catalogue has none of the seven scaling rigs either (they are buyable: 77 / 92 counted here
    // with the switch on, D1's 70 / 85 and the seven), so the map check also runs with the scaling switch off for the call (withScaleRigs(fn, false)),
    // the OUTERMOST call of the nest: the seven are the last keys in ITEMS (scale.ts), so it goes off first and comes back last and no key is left
    // behind them (the plain rigs, the three rigs and the six more rigs would end up after the seven, and every seeded draw after it in the worker
    // would differ). Their own families are checked after, with every switch on. Was: withShapes2(() => withShapes(() => withPlainRigs(() =>
    // withSustain(() => withWave3(() => {...}, on), false), false), false), false)
    for (const on of [false, true]) withScaleRigs(() => withShapes2(() => withShapes(() => withPlainRigs(() => withSustain(() => withWave3(() => {
      const all = buyableModules();
      expect(all).toHaveLength(on ? 85 : 70);
      for (const d of all) {
        const t = d.tags ?? [];
        expect(t.length >= 1 && t.length <= 3 && new Set(t).size === t.length, d.id).toBe(true);
        for (const f of t) expect(FAMS).toContain(f);
        expect([...t].sort(), d.id).toEqual([...map[d.id]].sort());
      }
    }, on), false), false), false), false), false);
    // FLIP-X2: with the switch on (the default now) the buyable modules are D1's and the 3 sustain pieces, each with 1-3
    // distinct families of the seven: WARD BELL and MENDING LOOM PLATE, MEND PRESS PLATE and SWARM
    // SHAPES-1 flip: and the three shaped rigs (shapes.ts SHAPES_ITEMS), after them: NAIL STRIP and EMBER TROUGH FORGE,
    // SPIKE RAIL FORGE and BURST (was the 3 sustain pieces alone)
    // BUMP-1D: and the six plain stat rigs (plainRigs.ts PLAIN_DEFS) after the sustain pieces, the six more shaped rigs
    // (shapes2.ts SHAPES2_DEFS) after the three: RASP FORGE, SPARK GAP HARASS, SCALE GUARD PLATE and FORGE, BALLAST PLATE,
    // GRINDSTONE FORGE and BURST, BRANDING IRON FORGE; ELBOW GUARD PLATE, SAW BAR FORGE, SPARK COMB HARASS, CINDER HOOK FORGE,
    // JAW CRUSHER and PICKAXE FORGE and BURST
    // BUMP-1E: and the seven scaling rigs (scale.ts SCALE_ITEMS) last of all, after the six more: CINDER MAIL FORGE and PLATE, ROT GAUGE SWARM and
    // FORGE, LEECH COIL SWARM and PLATE, CROWD PRESS SWARM and FORGE, AEGIS SPIKE PLATE and FORGE, GRUDGE ROD FORGE, TROPHY CHAIN FORGE and BURST
    expect(SCALE_RIGS).toBe(true);
    expect(buyableModules().filter((d) => !(d.id in map)).map((d) => [d.id, d.tags])).toEqual([
      ["wardbell", ["PLATE"]], ["mendpress", ["PLATE", "SWARM"]], ["mendingloom", ["PLATE"]],
      ["rasp", ["FORGE"]], ["sparkgap", ["HARASS"]], ["scaleguard", ["PLATE", "FORGE"]], ["ballast", ["PLATE"]],
      ["grindstone", ["FORGE", "BURST"]], ["brandingiron", ["FORGE"]],
      ["nailstrip", ["FORGE"]], ["embertrough", ["FORGE"]], ["spikerail", ["FORGE", "BURST"]],
      ["elbowguard", ["PLATE"]], ["sawbar", ["FORGE"]], ["sparkcomb", ["HARASS"]], ["cinderhook", ["FORGE"]],
      ["jawcrusher", ["FORGE", "BURST"]], ["pickaxe", ["FORGE", "BURST"]],
      ["cindermail", ["FORGE", "PLATE"]], ["rotgauge", ["SWARM", "FORGE"]], ["leechcoil", ["SWARM", "PLATE"]], ["crowdpress", ["SWARM", "FORGE"]],
      ["aegisspike", ["PLATE", "FORGE"]], ["grudgerod", ["FORGE"]], ["trophychain", ["FORGE", "BURST"]],
    ]);
    for (const id of [...SHAPES_IDS, ...PLAIN_RIG_IDS, ...SHAPES2_IDS, ...SCALE_IDS]) { // BUMP-1E: + SCALE_IDS
      const t = ITEMS[id].tags ?? [];
      expect(t.length >= 1 && t.length <= 3 && new Set(t).size === t.length && t.every((f) => FAMS.includes(f)), id).toBe(true);
    }
    // BUMP-1E: the six defs the scaling switch changes (SCALE_DEFS: VENOM DRIP and the five reworks) keep D1's families with the switch on (the check
    // above runs in D1's world, with the switch off: their tags are the base defs' there): a rework changes the effect, never the shop's family hint
    for (const id of Object.keys(SCALE_DEFS)) expect([...(ITEMS[id].tags ?? [])].sort(), id).toEqual([...map[id]].sort());
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
    // SHAPES-1 flip: + NAIL STRIP, EMBER TROUGH (FORGE) and SPIKE RAIL (FORGE, BURST): FORGE 22 -> 25, BURST 25 -> 26 (one
    // over D1 3.5's 25; was { FORGE: 22, ..., BURST: 25, ... })
    // BUMP-1D: + the six plain stat rigs and the six more shaped rigs (tags in plainRigs.ts and shapes2.ts): FORGE + RASP, SCALE
    // GUARD, GRINDSTONE, BRANDING IRON, SAW BAR, CINDER HOOK, JAW CRUSHER, PICKAXE (25 -> 33), HARASS + SPARK GAP, SPARK COMB
    // (18 -> 20), BURST + GRINDSTONE, JAW CRUSHER, PICKAXE (26 -> 29), PLATE + SCALE GUARD, BALLAST, ELBOW GUARD (16 -> 19);
    // SWARM, TEMPO and TWIN as they were (FORGE and BURST are over D1 3.5's 25; the bound is not asserted, as since SHAPES-1)
    // BUMP-1E (the flip, SCALE_RIGS on in bb-0.12.0): + the seven scaling rigs (tags in scale.ts SCALE_ITEMS): FORGE + CINDER MAIL, ROT GAUGE, CROWD PRESS,
    // AEGIS SPIKE, GRUDGE ROD, TROPHY CHAIN (33 -> 39), SWARM + ROT GAUGE, LEECH COIL, CROWD PRESS (25 -> 28), PLATE + CINDER MAIL, LEECH COIL, AEGIS SPIKE
    // (19 -> 22), BURST + TROPHY CHAIN (29 -> 30); HARASS, TEMPO and TWIN as they were (the seven carry none of those)
    expect(SCALE_RIGS).toBe(true);
    expect(size).toEqual({ FORGE: 39, HARASS: 20, SWARM: 28, BURST: 30, TEMPO: 23, TWIN: 18, PLATE: 22 }); // BUMP-1E: was { FORGE: 33, HARASS: 20, SWARM: 25, BURST: 29, TEMPO: 23, TWIN: 18, PLATE: 19 }
    for (const f of t.families) expect(f.kinds.length, f.tag).toBeGreaterThanOrEqual(4);
    // with the switch off the same tags read 7 families too (TWIN and PLATE on the older modules: 13 and 5)
    // FLIP-X2: the same moves with wave 3 off: FORGE 19 -> 18, HARASS 18 -> 17, SWARM 20 -> 21, PLATE 5 -> 7
    // SHAPES-1 flip: the three rigs stay with wave 3 off: FORGE 18 -> 21, BURST 23 -> 24
    // BUMP-1D: the twelve stay with wave 3 off: FORGE 21 -> 29, HARASS 17 -> 19, BURST 24 -> 27, PLATE 7 -> 10
    // BUMP-1E: the seven stay with wave 3 off too (none is a wave-3 piece): FORGE 29 -> 35, SWARM 21 -> 24, BURST 27 -> 28, PLATE 10 -> 13
    const off = withWave3(() => familyTable(), false);
    expect(Object.fromEntries(off.families.map((f) => [f.tag, f.members.length])))
      .toEqual({ FORGE: 35, HARASS: 19, SWARM: 24, BURST: 28, TEMPO: 19, TWIN: 13, PLATE: 13 }); // BUMP-1E: was { FORGE: 29, HARASS: 19, SWARM: 21, BURST: 27, TEMPO: 19, TWIN: 13, PLATE: 10 }
  });
});

describe("the SMUGGLER picks by effect (DESIGN-wave3.md 2.5)", () => {
  it("the same six rigs as v070-rc, switch off and on, and no wave-3 rig in either pool", () => {
    // SHAPES-1 flip: + EMBER TROUGH (gate { burn: 1 }: SMUGGLER_EFFECT.BURN reads its 1-star burn) on both sides of wave
    // 3's switch, after the six (catalogue order); still no wave-3 rig (was ["temper", "bellows", "quench"])
    // BUMP-1D: + RASP (gate { burn: 1 } from ★1; RASP's BURN is the pool's rule since PLAIN_RIGS is on), before EMBER TROUGH
    // (catalogue order: the six plain rigs come before the three shaped ones); BRANDING IRON and CINDER HOOK burn from ★2
    // only, so not those (was ["temper", "bellows", "quench", "embertrough"])
    // BUMP-1E (the flip, SCALE_RIGS on in bb-0.12.0): QUENCH TANK is KINDLING (scale.ts SCALE_DEFS: a reader of the foe's BURN, gate { reads }, no
    // gate.quench), so the BURN predicate (eventDefs.ts SMUGGLER_EFFECT: burn, burnPerRide or quench) no longer takes 'quench': the BURN pool is the four
    // gates whose effect burns (was ["temper", "bellows", "quench", "rasp", "embertrough"], on both sides of wave 3's switch); 0.9.11's pool, with
    // QUENCH TANK, is read under the scaling switch off (withScaleRigs(fn, false)); SHOCK's three are as before (no SHOCK rig is reworked or new).
    // The same re-pin as tests/roadPools.test.ts
    expect(SCALE_RIGS).toBe(true);
    for (const on of [false, true]) withWave3(() => {
      expect(smugglerPool("BURN"), `on=${on}`).toEqual(["temper", "bellows", "rasp", "embertrough"]); // BUMP-1E: was [..., "quench", ...]
      expect(withScaleRigs(() => smugglerPool("BURN"), false), `on=${on}, the switch off`).toEqual(["temper", "bellows", "quench", "rasp", "embertrough"]); // BUMP-1E: 0.9.11's pool
      expect(smugglerPool("SHOCK"), `on=${on}`).toEqual(["coil", "staticbrush", "lodestone"]);
      expect(withScaleRigs(() => smugglerPool("SHOCK"), false), `on=${on}, the switch off`).toEqual(["coil", "staticbrush", "lodestone"]); // BUMP-1E: as before
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
  }, 120_000); // BUMP-1F (RULING-BUMP1F-R8 R8.1): 120 s for this test, was vitest's 30-s default: it passes alone but times out at 30 s once the host's 1-minute load passes ~15; no body, count or expectation changed

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
  // Y7b2 (the pools): title "the regrown stand-in pool holds the 14 pinned below" -> 13 (the set pinned below holds 13 since
  // BAL-2, and 13 again after the regeneration at 4d772e4)
  // Z-BUMP (the pools): title "the regrown stand-in pool holds the 13 pinned below" -> 12 (SHIELD WALL went out at the
  // regeneration at 2c4ba76; "the 13" before it are BASE's captains and stay)
  // S8c (the pools): title "the regrown stand-in pool holds the 12 pinned below" -> 14 (SHIELD WALL and TWIN LATCH came in
  // at the regeneration at P1 83c039d; "the 13" before it are BASE's captains and stay)
  // BUMP-1D (the pools): title "the regrown stand-in pool holds the 14 pinned below" -> "all 15 (days 1-16)" (the pool regenerated
  // at 8fc5e24 for days 1-16 and read here for every day it holds, was days 1-10; STEAM BREECH reaches a pick again)
  it("no warlord prize or warlord deck of the 13 holds a wave-3 part, and every deck of the six holds a wave-3 TWIN or PLATE module; the regrown stand-in pool (days 1-16) holds all 15 pinned below, and the switch off refuses each such deck for them alone", () => {
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
    // BUMP-1D (the pools): the pool holds days 1-16 (was 1-10), so its decks are read for every day it holds; the warlord decks
    // (ai.ts warlordBuild) are the 10-day run's and are read for days 1-10 as before. Was: day <= 10 for both
    for (const hero of PLAYABLE_HEROES) for (let day = 1; day <= STAND_IN_POOL_DAYS; day++) {
      if (day <= 10) expect(parts(warlordBuild(hero, day)).filter(isWave3)).toEqual([]);
      for (const [i, e] of standInPool(hero, day).entries()) {
        const w3 = [...e.build.items, ...e.build.mods].filter((p) => isWave3(p.def));
        expect(parts(e.build).filter(isWave3), `${hero} day ${day} #${i}`).toEqual(w3.map((p) => p.def)); // no wave-3 turret
        if (!w3.length) continue;
        decks++;
        for (const p of w3) inPool.add(p.def);
        // S8c (the pools): RULING-S8-R5 section 3 item 1 (T1e's form, RULING-S8-R1 item 3).
        // a48010b: with NPC_DAY on, a road-fed deck spends the road's drops too, by design. The regenerated pool's picks are
        // road-fed (P1 83c039d, NPC_DAY on: each tuple's 7th element is its road log), so a deck may cost more than the shop's
        // gold alone, which the strict mode's budget line doesn't count; its drops count through its road log, in the player
        // mode. So each deck is held, switch on, to validateBuild's lines minus at most its ONE budget line (matched by its
        // "budget: " prefix, and only while NPC_DAY is on: off, the strict check stays whole), AND to validateUpload in the
        // player mode with its road log (a stand-in carries no run seed); switch off, its strict lines less at most its one
        // budget line (only for a deck whose budget line was left out above) are the wave-3 lines alone. Was: validateBuild(
        // e.build, day) toMatchObject { ok: true, errors: [] } on, and toEqual { ok: false, errors: <the wave-3 lines> } off
        const strict = validateBuild(e.build, day).errors;
        const budget = npcDayRules() ? strict.filter((x) => x.startsWith("budget: ")) : [];
        expect(budget.length, `${hero} day ${day} #${i}: at most its one budget line`).toBeLessThanOrEqual(1);
        expect(strict.filter((x) => !budget.includes(x)), `${hero} day ${day} #${i}, switch on: every other strict line`).toEqual([]);
        expect(validateUpload(e.build, day, RULES_VERSION, { ...(e.road ? { road: e.road } : {}) }).errors, `${hero} day ${day} #${i}, switch on: the player mode with its road log`).toEqual([]);
        const off = withWave3(() => validateBuild(e.build, day), false);
        const offBudget = budget.length ? off.errors.filter((x) => x.startsWith("budget: ")) : []; // that deck's one budget line
        expect(offBudget.length, `${hero} day ${day} #${i}, switch off: at most its one budget line`).toBeLessThanOrEqual(1);
        expect({ ok: off.ok, errors: off.errors.filter((x) => !offBudget.includes(x)) }, `${hero} day ${day} #${i}, switch off`).toEqual({
          ok: false, errors: w3.map((p) => `item: uid ${p.uid} ${ITEMS[p.def].name} is not in the game yet`),
        });
      }
    }
    // bb-0.8.6 (job PACKS run 2; oracle 47d683ef9b959301 (2)): the exact set the pool regrown under the packs holds, 12 of
    // the 15 (was all 15). SHIELD WALL, TWIN LATCH and TWIN TRIGGER no longer reach any stand-in pick (they are still sold
    // in the shops): the par player spends about 23% of its gold on packs by day 5 and 30% by day 10, so fewer part buys
    // reach the picks. No coverage rule: any change to the set turns this red
    // FLIP-X2 step 4.1 (94e0cbf, the pool regenerated on release X): all 15 again; SHIELD WALL, TWIN LATCH and TWIN TRIGGER
    // reach stand-in picks once more (was the 12 below without them)
    // REDO-X step 2 (4.1, 09ce97c; the pools changed, the regeneration): 14 of the 15; TWIN TRIGGER no longer reaches a
    // stand-in pick on FIX-ABE's offers (it is still sold in the shops) (was all 15)
    // BAL-2 step 5 (4.1, c5e4780; the pools changed, the regeneration): 13 of the 15; SHIELD WALL no longer reaches a
    // stand-in pick on bb-0.9.1 (it is still sold in the shops) (was the 14 with it)
    // Y7b2 (the pools): step 5 (4.1, 4d772e4; the regeneration on bb-0.9.3): 13 of the 15, another 13: STEAM BREECH and
    // TWIN LATCH no longer reach a stand-in pick, SHIELD WALL (IRON WALL) and TWIN TRIGGER reach one again (all four are
    // still sold in the shops) (was "anvil", "armorpress", "braceframe", "pincer", "platebreaker", "plateroller",
    // "seamwelder", "spallcatcher", "steambreech", "stoker", "twingauge", "twinlatch", "twinmould")
    // Z-BUMP (the pools): S6 lane 1 (2c4ba76; the regeneration on bb-0.9.7, the only file it changed): 12 of the 15, the
    // regrown set: SHIELD WALL (IRON WALL) no longer reaches a stand-in pick (it is still sold in the shops); none came in
    // (was the 13 with "shieldwall")
    // S8c (the pools): the stand-in pool regenerated once with every switch on as shipped (P1 83c039d, NPC_DAY on): 14 of
    // the 15, the regrown set: SHIELD WALL (IRON WALL) and TWIN LATCH reach a stand-in pick again; none went out (STEAM
    // BREECH still reaches none; it is still sold in the shops) (was the 12 without "shieldwall" and "twinlatch")
    // BUMP-1D (the pools): the stand-in pool regenerated for days 1-16 (8fc5e24, bb-0.11.0) and read for all 16 days: all 15 of the
    // 15 reach a stand-in pick, STEAM BREECH ("steambreech") among them, which no pool since Y7b2's had; none went out (was the
    // 14 without it). Days 1-10 alone hold 13 of them (not "seamwelder", "twinlatch"); days 11-16 bring those two
    expect([...inPool].sort()).toEqual([
      "anvil", "armorpress", "braceframe", "pincer", "platebreaker", "plateroller", "seamwelder", "shieldwall",
      "spallcatcher", "steambreech", "stoker", "twingauge", "twinlatch", "twinmould", "twintrigger",
    ]);
    expect(inPool.has("stoker")).toBe(true);
    expect(decks).toBeGreaterThan(0);
  }, 120_000); // BUMP-1F (RULING-BUMP1F-R8 R8.1): 120 s for this test, was vitest's 30-s default: it passes alone but times out at 30 s once the host's 1-minute load passes ~15; no body, count or expectation changed
});
