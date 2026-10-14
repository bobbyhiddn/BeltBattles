// SCALE-2c (REQ-BFG-098, REQ-BFG-106, REQ-BFG-108, REQ-BFG-110; BRIEF-SCALE2c sections 2 and 6, M1): the 12 scaling pieces
// behind SCALE_RIGS (src/sim/scale.ts SCALE_DEFS and SCALE_ITEMS). Switch on through withScaleRigs; the shipped switch stays
// off. Each reader's count and number at ★1-★3 in a fight (the count held fixed before each tick), step 4 (DRAKE NOZZLE never
// converts their DMG), LEECH COIL's HEAL through heal(), CINDER MAIL's PLATE to the cap; off, the 5 reworks are the very
// defs (and fight) they were at M0 and the 7 new ids are absent.
import { describe, expect, it } from "vitest";
import { AMMO, ITEMS, WAVE3_ITEMS, buyableModules, withWave3, type ItemDef, type ReadSpec } from "../src/sim/content";
import { Battle, type Payload, type Projectile, type SideState, type SimEvent } from "../src/sim/battle";
import { SCALE_DEFS, SCALE_IDS, SCALE_ITEMS, SCALE_PIECES, SCALE_RIGS, buildReads, burnStacks, isScalePiece, scaleRules, withScaleRigs } from "../src/sim/scale";
import { effectAt } from "../src/sim/stars";
import { drakeConvert, pressureBonus } from "../src/sim/cores";
import { PLATE_CAP } from "../src/sim/races/bastion";
import { type Build } from "../src/sim/deck";
import { SEED, barge, furnaceBench, item, withItem, withMod } from "./wave3.helpers";

// ---------------------------------------------------------------------------------------------- the table (the brief's)

/** BRIEF-SCALE2c section 2: each piece's name, kind, rarity, price, merchant and its reader line at ★1 / ★2 / ★3. */
const TABLE: Record<string, { name: string; kind: ItemDef["kind"]; rarity: ItemDef["rarity"]; price: number; merchant: string; count?: ReadSpec["count"]; give?: ReadSpec["give"]; per?: number; each: [number, number, number] }> = {
  quench: { name: "KINDLING", kind: "gate", rarity: "rare", price: 4, merchant: "alchemist", count: "foeBurn", give: "dmg", each: [3, 5, 8] },
  pressure: { name: "PRESSURE BREECH", kind: "core", rarity: "common", price: 4, merchant: "gunsmith", each: [12, 26, 42] },
  shieldwall: { name: "IRON WALL", kind: "gate", rarity: "legendary", price: 10, merchant: "ironmonger", count: "ownPlate", give: "dmg", per: 10, each: [5, 11, 17] },
  spallcatcher: { name: "SPALL CATCHER", kind: "mod", rarity: "rare", price: 5, merchant: "quartermaster", count: "hitsTaken", give: "dmg", each: [3, 7, 11] },
  keg: { name: "POWDER KEG", kind: "gate", rarity: "rare", price: 4, merchant: "scrapper", count: "ownHits", give: "dmg", each: [3, 7, 11] },
  cindermail: { name: "CINDER MAIL", kind: "gate", rarity: "rare", price: 5, merchant: "ironmonger", count: "foeBurn", give: "plate", each: [2, 3, 5] },
  rotgauge: { name: "ROT GAUGE", kind: "gate", rarity: "rare", price: 5, merchant: "alchemist", count: "foePoison", give: "dmg", each: [3, 5, 8] },
  leechcoil: { name: "LEECH COIL", kind: "gate", rarity: "rare", price: 5, merchant: "ironmonger", count: "foePoison", give: "heal", each: [4, 5, 6] },
  crowdpress: { name: "CROWD PRESS", kind: "gate", rarity: "common", price: 3, merchant: "tinker", count: "beltSlugs", give: "dmg", each: [3, 7, 11] },
  aegisspike: { name: "AEGIS SPIKE", kind: "gate", rarity: "rare", price: 5, merchant: "tinker", count: "ownShield", give: "dmg", each: [40, 88, 140] },
  grudgerod: { name: "GRUDGE ROD", kind: "gate", rarity: "common", price: 3, merchant: "scrapper", count: "heartsLost", give: "dmg", each: [6, 13, 21] },
  trophychain: { name: "TROPHY CHAIN", kind: "gate", rarity: "epic", price: 7, merchant: "quartermaster", count: "wins", give: "dmg", each: [8, 18, 28] },
};
const REWORKS = ["quench", "pressure", "shieldwall", "spallcatcher", "keg"];
const NEW_IDS = ["cindermail", "rotgauge", "leechcoil", "crowdpress", "aegisspike", "grudgerod", "trophychain"];

// the switch is off at this file's load: the base defs, and ITEMS' key order
const BASE: Record<string, ItemDef> = Object.fromEntries(REWORKS.map((id) => [id, ITEMS[id]]));
const KEYS0 = Object.keys(ITEMS);

// ---------------------------------------------------------------------------------------------- helpers

/** Deck b with rig `def` (★`stars`) at (3, y), turned so it works the bench's tile 5 - y (a T or X rig's arrows depend on
 *  its turn), scaleRules() as now (the new ids exist only with the switch on). */
function aimed(b: Build, uid: number, def: string, y: number, stars = 1): Build {
  for (let rot = 0; rot < 4; rot++) {
    const t = withItem(b, item(uid, def, 3, y, rot, stars));
    const g = new Battle(t, barge(), SEED).sides[0].gates.find((q) => q.uid === uid)!;
    if (g.hits.some((h) => h.route === 0 && h.tile === 5 - y)) return t;
  }
  throw new Error(`no turn aims ${def} at tile ${5 - y}`);
}
/** The slot the bench's belt feeds (the heavy gun). */
const GUN = new Battle(furnaceBench(), barge(), SEED).sides[0].routes[0].turret;
type Proc = Extract<SimEvent, { type: "process" }>;
type Fire = Extract<SimEvent, { type: "fire" }>;
/** Step battle bt for `secs`, calling `before` ahead of each tick (to hold a count fixed) and `on` with each tick's events. */
function stepFor(bt: Battle, secs: number, before?: (bt: Battle) => void, on?: (ev: SimEvent[], bt: Battle) => void): Battle {
  while (bt.t < secs && !bt.over) {
    before?.(bt);
    bt.step();
    on?.(bt.drainEvents(), bt);
  }
  return bt;
}
/** The process events of rig `uid` on side 0 over `secs` of bt. */
function procs(bt: Battle, uid: number, secs: number, before?: (bt: Battle) => void): Proc[] {
  const out: Proc[] = [];
  stepFor(bt, secs, before, (ev) => { for (const e of ev) if (e.type === "process" && e.side === 0 && e.gate === uid) out.push(e); });
  return out;
}
interface Shot { dmg: number; burn: number; p: Payload; flat: number; each?: number }
/** Every side-0 projectile once, as fired. */
function shotsOf(bt: Battle, secs: number): Shot[] {
  const seen = new Set<number>(), shots: Shot[] = [];
  stepFor(bt, secs, undefined, () => {
    for (const pr of bt.projectiles as Projectile[]) {
      if (pr.from !== 0 || seen.has(pr.id)) continue;
      seen.add(pr.id);
      shots.push({ dmg: pr.dmg, burn: pr.burn ?? pr.payload.burn, p: pr.payload, flat: pr.payload.flat, each: pr.payload.each });
    }
  });
  return shots;
}
const foe = (bt: Battle): SideState => bt.sides[1];
const me = (bt: Battle): SideState => bt.sides[0];
/** A short digest of a fight: every event's type, side and amounts, and the end. */
function digest(b: Build, secs = 20): string {
  const bt = new Battle(b, barge(), SEED), parts: string[] = [];
  stepFor(bt, secs, undefined, (ev) => { for (const e of ev) parts.push(JSON.stringify(e)); });
  parts.push(`${bt.t.toFixed(3)} ${bt.sides[0].hull.hp} ${bt.sides[1].hull.hp} ${bt.sides[0].stats.damage}`);
  return parts.join("\n");
}
/** A bench deck holding the 5 reworks (the rigs at tiles 0-2, SPALL CATCHER and PRESSURE BREECH on the gun). */
const reworkDeck = (): Build =>
  withMod(withMod(aimed(aimed(aimed(furnaceBench(), 30, "quench", 5), 31, "keg", 4), 32, "shieldwall", 3), 40, "spallcatcher", GUN), 41, "pressure", GUN);

// ---------------------------------------------------------------------------------------------- the switch off

describe("SCALE-2c: with the switch off, everything is as at M0", () => {
  it("ships off; the 5 reworks are the very base defs, before and after a round trip; the 7 new ids are absent", () => {
    expect(SCALE_RIGS).toBe(false);
    expect(scaleRules()).toBe(false);
    expect(REWORKS.every((id) => id in SCALE_DEFS)).toBe(true);
    expect([...SCALE_IDS]).toEqual(NEW_IDS);
    expect([...SCALE_PIECES]).toEqual([...REWORKS, ...NEW_IDS]);
    expect(BASE.quench.name).toBe("QUENCH TANK");
    expect(BASE.quench.gate?.quench).toBeDefined();
    expect(BASE.pressure.core?.maxCount).toBe(5);
    withScaleRigs(() => expect(ITEMS.quench.name).toBe("KINDLING"));
    for (const id of REWORKS) expect(ITEMS[id]).toBe(BASE[id]);
    for (const id of NEW_IDS) {
      expect(isScalePiece(id)).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(ITEMS, id)).toBe(false);
      expect(buyableModules().some((d) => d.id === id)).toBe(false);
    }
    expect(Object.keys(ITEMS)).toEqual(KEYS0); // the same keys in the same order
    expect(isScalePiece("riveter")).toBe(false); // cap's F4: RIVETER stays as it is
  });

  it("the 5 reworks fight exactly as before a switch round trip (the same events, the same end)", () => {
    const before = digest(reworkDeck());
    withScaleRigs(() => digest(reworkDeck())); // a fight with the switch on in between
    expect(digest(reworkDeck())).toBe(before);
    expect(before).toContain("\"type\":\"fire\"");
  });
});

// ---------------------------------------------------------------------------------------------- the defs, switch on

describe("SCALE-2c: the 12 defs with the switch on", () => {
  it("each piece's name, kind, rarity, price, merchant, size and reader line at ★1-★3 (the brief's table)", () => {
    withScaleRigs(() => {
      for (const [id, t] of Object.entries(TABLE)) {
        const d = ITEMS[id];
        expect([d.id, d.name, d.kind, d.rarity, d.price, d.merchant, d.size, d.foot]).toEqual([id, t.name, t.kind, t.rarity, t.price, t.merchant, 1, undefined]);
        for (const s of [1, 2, 3]) {
          const e = effectAt(id, s);
          if (id === "pressure") {
            expect(e.core!.perQueued).toBe(t.each[s - 1]);
            continue;
          }
          const r = (t.kind === "mod" ? e.mod : e.gate)!.reads!;
          expect(r).toEqual({ count: t.count, each: t.each[s - 1], ...(t.per ? { per: t.per } : {}), give: t.give });
        }
      }
    });
  });

  it("the reworks keep id, rarity, price, merchant, size, shape and tags, and lose their old effect", () => {
    withScaleRigs(() => {
      for (const id of REWORKS) {
        const b = BASE[id], d = ITEMS[id];
        expect([d.rarity, d.price, d.merchant, d.size, d.shape, d.tags]).toEqual([b.rarity, b.price, b.merchant, b.size, b.shape, b.tags]);
        expect(d.desc).toEqual([]);
        for (const s of [1, 2, 3]) {
          const e = effectAt(id, s);
          expect(e.gate?.quench).toBeUndefined(); // QUENCH TANK's spend
          expect(e.gate?.keg).toBeUndefined(); // the keg's fuse
          expect(e.mod?.spall).toBeUndefined(); // SPALL CATCHER's charge
          expect([e.gate?.plate, e.gate?.plated]).toEqual([undefined, undefined]); // IRON WALL's plating and its 120 step
          expect(e.core?.maxCount).toBeUndefined(); // PRESSURE BREECH's MAX 5
        }
      }
      expect(ITEMS.shieldwall.shape).toBe("X");
      expect(effectAt("pressure", 3).core).toEqual({ routine: "pressure", perQueued: 42, noJam: true }); // NEVER JAMS kept
    });
  });

  it("the 7 new ids join ITEMS after every other def, one cell, arrows by rarity, and the catalogue (buyableModules)", () => {
    withScaleRigs(() => {
      const keys = Object.keys(ITEMS);
      expect(keys.slice(-NEW_IDS.length)).toEqual(NEW_IDS);
      expect(keys.slice(0, -NEW_IDS.length)).toEqual(KEYS0);
      for (const id of NEW_IDS) {
        expect(ITEMS[id]).toBe(SCALE_ITEMS[id]);
        expect(ITEMS[id].shape).toBeUndefined(); // content.ts RARITY_SHAPE: common I, rare II, epic T
        expect(ITEMS[id].tags!.length).toBeGreaterThan(0);
        expect(buyableModules().some((d) => d.id === id)).toBe(true);
      }
      expect(buyableModules().length).toBe(withScaleRigs(() => buyableModules().length, false) + 7);
    });
  });

  it("PRESSURE BREECH: its own perQueued term, uncapped (MAX 5 dropped); off, 5 at most", () => {
    const off = effectAt("pressure", 1).core!;
    expect(pressureBonus(off, 9)).toBe(12 * 5);
    withScaleRigs(() => {
      for (const s of [1, 2, 3]) expect(pressureBonus(effectAt("pressure", s).core!, 9)).toBe(TABLE.pressure.each[s - 1] * 9);
    });
  });

  it("a wave-3 toggle keeps IRON WALL's and SPALL CATCHER's switch-on defs while the switch is on", () => {
    withScaleRigs(() => {
      const wall = ITEMS.shieldwall, spall = ITEMS.spallcatcher;
      expect(wall).not.toBe(WAVE3_ITEMS.shieldwall);
      withWave3(() => { expect(ITEMS.shieldwall).toBe(wall); expect(ITEMS.spallcatcher).toBe(spall); }, true);
      expect([ITEMS.shieldwall, ITEMS.spallcatcher]).toEqual([wall, spall]);
    });
    expect(ITEMS.shieldwall).toBe(BASE.shieldwall);
    expect(ITEMS.spallcatcher).toBe(BASE.spallcatcher);
  });
});

// ---------------------------------------------------------------------------------------------- each reader in a fight

describe("SCALE-2c: each reader's count and number at ★1-★3, in a fight (switch on)", () => {
  /** The adds of rig `def` (★s) at tile 3 of the bench over 8 s, `before` holding its count before each tick. */
  const rigAdds = (def: string, s: number, before: (bt: Battle) => void, ctor?: (b: Build) => Battle): Proc[] =>
    withScaleRigs(() => {
      const b = aimed(furnaceBench(), 30, def, 2, s);
      const bt = ctor ? ctor(b) : new Battle(b, barge(), SEED);
      return procs(bt, 30, 8, before);
    });

  it("KINDLING: +3 / +5 / +8 DMG for each BURN on the foe (4 held)", () => {
    for (const s of [1, 2, 3]) {
      const ps = rigAdds("quench", s, (bt) => { foe(bt).hull.burns = [{ dps: 4, t: 50 }]; });
      expect(ps.length).toBeGreaterThan(3);
      for (const p of ps) expect(p.add).toEqual({ amount: TABLE.quench.each[s - 1] * 4, kind: "dmg" });
    }
  });

  it("CINDER MAIL: +2 / +3 / +5 PLATE for each BURN on the foe (4 held), onto your hull", () => {
    for (const s of [1, 2, 3]) {
      const ps = rigAdds("cindermail", s, (bt) => { foe(bt).hull.burns = [{ dps: 4, t: 50 }]; me(bt).plate.plate = 0; });
      expect(ps.length).toBeGreaterThan(3);
      for (const p of ps) expect(p.add).toEqual({ amount: TABLE.cindermail.each[s - 1] * 4, kind: "plate" });
    }
  });

  it("ROT GAUGE: +3 / +5 / +8 DMG for each POISON on the foe (5 held)", () => {
    for (const s of [1, 2, 3]) {
      const ps = rigAdds("rotgauge", s, (bt) => { foe(bt).hull.poison = 5; });
      expect(ps.length).toBeGreaterThan(3);
      for (const p of ps) expect(p.add).toEqual({ amount: TABLE.rotgauge.each[s - 1] * 5, kind: "dmg" });
    }
  });

  it("LEECH COIL: HEAL 4 / 5 / 6 times the foe's POISON (5 held), through heal(): source reads, the rig named", () => {
    for (const s of [1, 2, 3]) {
      const heals: Extract<SimEvent, { type: "heal" }>[] = [];
      const ps = withScaleRigs(() => {
        const bt = new Battle(aimed(furnaceBench(), 30, "leechcoil", 2, s), barge(), SEED), out: Proc[] = [];
        stepFor(bt, 8, (b) => { foe(b).hull.poison = 5; me(b).hull.hp = me(b).hull.max - 2000; }, (ev) => {
          for (const e of ev) {
            if (e.type === "process" && e.side === 0 && e.gate === 30) out.push(e);
            if (e.type === "heal" && e.side === 0) heals.push(e);
          }
        });
        return out;
      });
      expect(ps.length).toBeGreaterThan(3);
      for (const p of ps) expect(p.add).toEqual({ amount: TABLE.leechcoil.each[s - 1] * 5, kind: "heal" });
      expect(heals.length).toBe(ps.length);
      for (const h of heals) expect([h.amount, h.source, h.gate]).toEqual([TABLE.leechcoil.each[s - 1] * 5, "reads", 30]);
    }
  });

  it("CROWD PRESS: +3 / +7 / +11 DMG for each slug on its belt, the hit one too (never below one)", () => {
    for (const s of [1, 2, 3]) {
      const ps = rigAdds("crowdpress", s, () => undefined);
      expect(ps.length).toBeGreaterThan(3);
      for (const p of ps) {
        expect(p.add!.kind).toBe("dmg");
        expect(p.add!.amount % TABLE.crowdpress.each[s - 1]).toBe(0);
        expect(p.add!.amount).toBeGreaterThanOrEqual(TABLE.crowdpress.each[s - 1]);
      }
    }
  });

  it("AEGIS SPIKE: +40 / +88 / +140 DMG for each SHIELD you have (2 held)", () => {
    for (const s of [1, 2, 3]) {
      const ps = rigAdds("aegisspike", s, (bt) => { me(bt).shield = 2; });
      expect(ps.length).toBeGreaterThan(3);
      for (const p of ps) expect(p.add).toEqual({ amount: TABLE.aegisspike.each[s - 1] * 2, kind: "dmg" });
    }
  });

  it("IRON WALL: +5 / +11 / +17 DMG for each whole 10 PLATE you have (239 held is 23)", () => {
    for (const s of [1, 2, 3]) {
      const ps = rigAdds("shieldwall", s, (bt) => { me(bt).plate.plate = 239; });
      expect(ps.length).toBeGreaterThan(3);
      for (const p of ps) expect(p.add).toEqual({ amount: TABLE.shieldwall.each[s - 1] * 23, kind: "dmg" });
    }
  });

  it("POWDER KEG: +3 / +7 / +11 DMG for each of its own hits this fight, this one too (1, 2, 3, ...)", () => {
    for (const s of [1, 2, 3]) {
      const ps = rigAdds("keg", s, () => undefined);
      expect(ps.length).toBeGreaterThan(3);
      ps.forEach((p, i) => expect(p.add).toEqual({ amount: TABLE.keg.each[s - 1] * (i + 1), kind: "dmg" }));
    }
  });

  it("GRUDGE ROD: +6 / +13 / +21 DMG for each heart lost (4); TROPHY CHAIN: +8 / +18 / +28 DMG for each win (3)", () => {
    for (const s of [1, 2, 3]) {
      const g = rigAdds("grudgerod", s, () => undefined, (b) => new Battle(b, barge(), SEED, undefined, undefined, [4, 0]));
      expect(g.length).toBeGreaterThan(3);
      for (const p of g) expect(p.add).toEqual({ amount: TABLE.grudgerod.each[s - 1] * 4, kind: "dmg" });
      const t = rigAdds("trophychain", s, () => undefined, (b) => new Battle(b, barge(), SEED, [3, 0]));
      expect(t.length).toBeGreaterThan(3);
      for (const p of t) expect(p.add).toEqual({ amount: TABLE.trophychain.each[s - 1] * 3, kind: "dmg" });
    }
    withScaleRigs(() => {
      const gb = aimed(furnaceBench(), 30, "grudgerod", 2), tb = aimed(furnaceBench(), 30, "trophychain", 2);
      expect([buildReads(gb, "heartsLost"), buildReads(tb, "wins"), buildReads(gb, "wins")]).toEqual([true, true, false]);
      expect(new Battle(gb, barge(), SEED, [2, 5], undefined, [4, 1]).record.lost).toEqual([4, 1]);
      expect(new Battle(tb, barge(), SEED, [2, 5]).record.wins).toEqual([2, 5]);
    });
  });

  it("SPALL CATCHER (at its gun's SHOT): +3 / +7 / +11 DMG for each hit on you (7 held: the barge never fires)", () => {
    for (const s of [1, 2, 3]) {
      const fires = withScaleRigs(() => {
        const bt = new Battle(withMod(furnaceBench(), 40, "spallcatcher", GUN, s), barge(), SEED), out: Fire[] = [];
        me(bt).hitsTaken = 7;
        stepFor(bt, 10, undefined, (ev) => { for (const e of ev) if (e.type === "fire" && e.side === 0) out.push(e); });
        expect(me(bt).hitsTaken).toBe(7);
        return out;
      });
      expect(fires.length).toBeGreaterThan(3);
      for (const f of fires) expect(f.add).toEqual({ amount: TABLE.spallcatcher.each[s - 1] * 7, kind: "dmg" });
    }
  });

  it("PRESSURE BREECH: each shot's add is its gun's perQueued (x k) times the slugs it counted, with no cap", () => {
    for (const s of [1, 2, 3]) {
      withScaleRigs(() => {
        const bt = new Battle(withMod(furnaceBench(), 40, "pressure", GUN, s), barge(), SEED), adds: number[] = [];
        const tu = me(bt).turrets.find((t) => t.index === GUN)!;
        expect(tu.core.spec.maxCount).toBeUndefined();
        stepFor(bt, 12, undefined, (ev) => { for (const e of ev) if (e.type === "fire" && e.side === 0 && e.add) adds.push(e.add.amount); });
        expect(adds.length).toBeGreaterThan(3);
        for (const a of adds) expect(a % tu.core.spec.perQueued!).toBe(0);
      });
    }
  });
});

// ---------------------------------------------------------------------------------------------- step 4, the cap

describe("SCALE-2c: step 4 (DRAKE NOZZLE never converts a reader's DMG), and PLATE to the cap", () => {
  it("TEMPER, then ★3 KINDLING, then a ★3 DRAKE NOZZLE: the slug keeps KINDLING's DMG as FOR EACH DMG; DRAKE converts none", () => {
    const deck = (kindling: boolean): Build => {
      let b = aimed(furnaceBench(), 30, "temper", 5);
      if (kindling) b = aimed(b, 31, "quench", 3, 3);
      return withMod(b, 40, "drake", GUN, 3);
    };
    const c = effectAt("drake", 3).core!;
    withScaleRigs(() => {
      const shots = shotsOf(new Battle(deck(true), barge(), SEED), 30).filter((x) => x.p.prior === 2);
      expect(shots.length).toBeGreaterThan(3);
      expect(shots.some((x) => (x.each ?? 0) > 0)).toBe(true);
      for (const x of shots) {
        expect(x.flat).toBe(0); // TEMPER and KINDLING add no stat DMG
        expect(drakeConvert(c, x.flat).stacks).toBe(0);
        expect((x.each ?? 0) % 8).toBe(0); // KINDLING ★3's +8 for each foe BURN, all of it FOR EACH DMG
      }
      // over a long fight the foe's BURN is the same with KINDLING as without: no BURN comes of its DMG
      const maxBurn = (b: Build): number => {
        let m = 0;
        stepFor(new Battle(b, barge(), SEED), 40, undefined, (_ev, bt) => { m = Math.max(m, burnStacks(foe(bt).hull)); });
        return m;
      };
      const without = maxBurn(deck(false));
      expect(without).toBeGreaterThan(0);
      expect(maxBurn(deck(true))).toBe(without);
    });
  });

  it("CINDER MAIL ★3 with 200 BURN on the foe: PLATE stops at the cap (PLATE_CAP), and gives only what fits", () => {
    withScaleRigs(() => {
      const bt = new Battle(aimed(furnaceBench(), 30, "cindermail", 2, 3), barge(), SEED), ps: Proc[] = [];
      stepFor(bt, 8, (b) => { foe(b).hull.burns = [{ dps: 200, t: 50 }]; }, (ev) => {
        for (const e of ev) if (e.type === "process" && e.gate === 30 && e.side === 0) ps.push(e);
      });
      expect(ps.length).toBeGreaterThan(2);
      expect(me(bt).plate.plate).toBe(PLATE_CAP);
      expect(ps[0].add).toEqual({ amount: PLATE_CAP, kind: "plate" }); // 1,000 asked, 240 fits
      for (const p of ps.slice(1)) expect(p.add).toBeUndefined(); // full: nothing given, no add
    });
  });

  it("LEECH COIL on a burning hull heals half (rounded down), never past full", () => {
    withScaleRigs(() => {
      const bt = new Battle(aimed(furnaceBench(), 30, "leechcoil", 2), barge(), SEED), heals: number[] = [];
      stepFor(bt, 8, (b) => { foe(b).hull.poison = 5; me(b).hull.burns = [{ dps: 1, t: 50 }]; me(b).hull.hp = me(b).hull.max - 2000; }, (ev) => {
        for (const e of ev) if (e.type === "heal" && e.side === 0 && e.source === "reads") heals.push(e.amount);
      });
      expect(heals.length).toBeGreaterThan(3);
      for (const h of heals) expect(h).toBe(Math.floor((4 * 5) / 2));
      const full = new Battle(aimed(furnaceBench(), 30, "leechcoil", 2), barge(), SEED);
      let healed = 0;
      stepFor(full, 8, (b) => { foe(b).hull.poison = 5; }, (ev) => { for (const e of ev) if (e.type === "heal" && e.side === 0) healed++; });
      expect(healed).toBe(0); // a full hull takes no HEAL
      expect(me(full).hull.hp).toBe(me(full).hull.max);
    });
  });

  it("an AMMO sanity: the bench's slug is plain-damage (no BURN of its own), so the held counts above are the only counts", () => {
    expect(AMMO.cinder.burn ?? 0).toBe(0);
  });
});
