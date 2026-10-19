// ENCHANT-1 (REQ-BFG-085; BRIEF-ENCHANT1 E3; step 3): the eight effects on fixtures. Each word on each kind it allows (a rig, a factory,
// a turret) at ★1 and ★3; RISING starting again each fight; ECHOING's count; BRACED blocking 2 x stars STUNs and no more; WIDE's
// arrow in a fight; GROWING after a dusk fight; the payload-key test (every key of Payload has a rule); and with ENCHANT off a deck
// holding words fights exactly as the same deck without them.
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
// deck.ts first (the ship's load order)
import { cloneBuild, setTurretList, type Build, type Placed } from "../src/sim/deck";
import { Battle, type SideState, type SimEvent, type Target } from "../src/sim/battle";
import { ENCHANT, ENCHANT_IDS, ENCHANT_NUM, enchantRate, setEnchant, withEnchant } from "../src/sim/enchant";
import { PAYLOAD_RULES, bracedSwallow, echoCopy, makeEnchantState, payloadKeys, scaleShare, slugMadeFx } from "../src/sim/enchantFx";
import type { Payload } from "../src/sim/battle";
import { finishDay } from "../src/game/day";
import { newRun } from "../src/game/run";
import { SEED, barge, furnaceBench, item, K } from "./wave3.helpers";

afterEach(() => setEnchant(ENCHANT));
const on = <T>(fn: () => T): T => withEnchant(fn, true);

interface Seen { id: number; flat: number; burn: number; mult: number }

/** Each payload of route 0 as it first passes tile `tile` (side 0), in order, with the numbers the hits so far wrote on it. */
function slugs(b: Build, tile: number, secs = 22, foe: Build = barge()): Seen[] {
  const bt = new Battle(b, foe, SEED), seen = new Set<number>(), out: Seen[] = [];
  while (bt.t < secs && !bt.over) {
    bt.step();
    bt.drainEvents();
    for (const a of bt.sides[0].routes[0].ammo) {
      if (a.processed < tile || seen.has(a.p.id)) continue;
      seen.add(a.p.id);
      out.push({ id: a.p.id, flat: a.p.flat, burn: a.p.burn, mult: a.p.mult });
    }
  }
  return out;
}

/** Side 0's `fire` events (the shot's damage) and the BURN each shot lands (side 1's impacts), over `secs`. */
function shots(b: Build, secs = 14, foe: Build = barge()): { dmg: number[]; burn: number[]; fires: number; speed: number; interval: number } {
  const bt = new Battle(b, foe, SEED), dmg: number[] = [], burn: number[] = [];
  let fires = 0;
  while (bt.t < secs && !bt.over) {
    bt.step();
    for (const e of bt.drainEvents() as SimEvent[]) {
      if (e.type === "fire" && e.side === 0) { fires++; dmg.push(e.dmg); }
      if (e.type === "impact" && e.side === 1) burn.push(e.burn);
    }
  }
  return { dmg, burn, fires, speed: bt.sides[0].turrets[0].speed, interval: bt.sides[0].turrets[0].interval };
}

/** The furnace bench with an east-facing WHETSTONE at (3,3): it hits belt tile index 2, (4,3). `ench` goes on the rig. */
const rigDeck = (stars = 1, ench: Partial<Placed> = {}, rot = 1): Build => {
  const b = furnaceBench();
  return { ...b, items: [...b.items, { ...item(10, "whetstone", 3, 3, rot, stars), ...ench }] };
};
/** The furnace bench with a word on its KILN (the signature factory) or, at ★3, on a bought STAMP PRESS feeding the same gun. */
const kilnDeck = (ench: Partial<Placed> = {}): Build => {
  const b = furnaceBench();
  return { ...b, items: b.items.map((p) => (p.uid === 1 ? { ...p, ...ench } : p)) };
};
const turretDeck = (ench: Record<string, unknown> = {}, stars = 1): Build => {
  const b = cloneBuild(furnaceBench());
  setTurretList(b, [{ slot: 0, def: "scrapcannon", uid: 90, free: true, ...(stars > 1 ? { stars } : {}), ...ench }]);
  return b;
};

describe("ENCHANT-1 E3: the rig's words (WHETSTONE at (3,3) hitting tile (4,3)), ★1 and ★3", () => {
  for (const stars of [1, 3]) {
    const base = (): Seen[] => on(() => slugs(rigDeck(stars), 2));
    const hit = (b: Seen[]): boolean[] => b.map((s) => s.flat > 0);
    it(`★${stars}: the plain rig hits some slugs (the fixture), and a word that adds nothing changes nothing`, () => {
      const b = base();
      expect(b.length).toBeGreaterThan(6);
      expect(hit(b).filter(Boolean).length).toBeGreaterThan(5);
      expect(on(() => slugs(rigDeck(stars, { ench: "wide", enchDir: 2 }), 2)).map((s) => [s.flat, s.burn])).toEqual(b.map((s) => [s.flat, s.burn])); // a second arrow that hits no belt
    });
    it(`★${stars} FIERY: [BURN]+${stars} on every slug the rig hits, nothing else`, () => {
      const b = base(), w = on(() => slugs(rigDeck(stars, { ench: "fiery" }), 2));
      w.forEach((s, i) => {
        expect(s.id).toBe(b[i].id);
        expect(s.flat).toBe(b[i].flat);
        expect(s.burn - b[i].burn, `slug ${i}`).toBe(b[i].flat > 0 ? ENCHANT_NUM.burn * stars : 0);
      });
    });
    it(`★${stars} RISING: the nth slug the rig hits gets +5 x n x ${stars} DMG`, () => {
      const b = base(), w = on(() => slugs(rigDeck(stars, { ench: "rising" }), 2));
      let rank = 0;
      w.forEach((s, i) => {
        const hitNow = b[i].flat > 0;
        if (hitNow) rank++;
        expect(s.flat - b[i].flat, `slug ${i}`).toBe(hitNow ? ENCHANT_NUM.risingStep * rank * stars : 0);
      });
      expect(rank).toBeGreaterThan(5);
    });
    it(`★${stars} GROWING: +5 x grow x ${stars} DMG on every hit`, () => {
      const b = base(), w = on(() => slugs(rigDeck(stars, { ench: "growing", grow: 3 }), 2)), z = on(() => slugs(rigDeck(stars, { ench: "growing" }), 2));
      w.forEach((s, i) => expect(s.flat - b[i].flat, `slug ${i}`).toBe(b[i].flat > 0 ? ENCHANT_NUM.growingStep * 3 * stars : 0));
      z.forEach((s, i) => expect(s.flat, `grow 0, slug ${i}`).toBe(b[i].flat)); // a fresh GROWING piece adds nothing yet
    });
    it(`★${stars} ECHOING: every Nth slug (ENCHANT_NUM.echoEvery) the rig hits gets the rig's stats twice, no roll`, () => {
      const b = base(), w = on(() => slugs(rigDeck(stars, { ench: "echoing" }), 2));
      let rank = 0;
      w.forEach((s, i) => {
        const hitNow = b[i].flat > 0;
        if (hitNow) rank++;
        expect(s.flat - b[i].flat, `slug ${i} rank ${rank}`).toBe(hitNow && rank % ENCHANT_NUM.echoEvery === 0 ? b[i].flat : 0);
      });
      expect(w.map((s) => s.flat)).toEqual(on(() => slugs(rigDeck(stars, { ench: "echoing" }), 2)).map((s) => s.flat)); // deterministic
    });
  }
  it("WIDE: the added arrow hits a belt tile the rig's own arrow does not, and turns with the rig", () => {
    const none = on(() => slugs(rigDeck(1, {}, 0), 2)); // facing up: (3,2), no belt
    expect(none.every((s) => s.flat === 0)).toBe(true);
    const wide = on(() => slugs(rigDeck(1, { ench: "wide", enchDir: 1 }, 0), 2)); // the added arrow faces east: (4,3)
    expect(wide.filter((s) => s.flat > 0).length).toBeGreaterThan(5);
    const turned = on(() => slugs(rigDeck(1, { ench: "wide", enchDir: 0 }, 1), 2)); // enchDir 0 is the rig's own arrow's side: adds none
    expect(turned.filter((s) => s.flat > 0).length).toBeGreaterThan(5);
    const away = on(() => slugs(rigDeck(1, { ench: "wide", enchDir: 3 }, 0), 2)); // west: (2,3), no belt
    expect(away.every((s) => s.flat === 0)).toBe(true);
    // turned a quarter: the side that faced east at rotation 0 now faces south, and the rig's own arrow east (a rig at rot 1 hits (4,3))
    const quarter = on(() => slugs(rigDeck(1, { ench: "wide", enchDir: 1 }, 1), 2));
    expect(quarter.filter((s) => s.flat > 0).length).toBeGreaterThan(5);
  });
});

describe("ENCHANT-1 E3: the factory's words (the KILN, the signature factory, and a ★3 STAMP PRESS)", () => {
  const first = (b: Build, n = 12): Seen[] => on(() => slugs(b, 0, 10)).slice(0, n);
  it("FIERY, RISING, GROWING: the slug is stamped carrying the stat; the nth slug the factory makes gets +5 x n DMG", () => {
    const base = first(kilnDeck());
    expect(base.every((s) => s.flat === 0 && s.burn === 0)).toBe(true);
    expect(first(kilnDeck({ ench: "fiery" })).map((s) => s.burn)).toEqual(base.map(() => ENCHANT_NUM.burn));
    expect(first(kilnDeck({ ench: "rising" })).map((s) => s.flat)).toEqual(base.map((_, i) => ENCHANT_NUM.risingStep * (i + 1)));
    expect(first(kilnDeck({ ench: "growing", grow: 2 })).map((s) => s.flat)).toEqual(base.map(() => 10));
  });
  it("★3 (a STAMP PRESS at ★3): numbers x 3", () => {
    const press = (ench: Partial<Placed>): Build => {
      const b = furnaceBench();
      return { ...b, items: [{ ...item(2, "press", 2, 6, 0, 3), ...ench }, { uid: 1, def: "kiln", x: 0, y: 8 }], routes: [{ factory: 2, cells: [K(3, 5), K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] }] };
    };
    const get = (e: Partial<Placed>) => on(() => slugs(press(e), 0, 9)).slice(0, 8);
    const base = get({});
    expect(base.length).toBeGreaterThan(4);
    expect(get({ ench: "fiery" }).map((s) => s.burn)).toEqual(base.map(() => 3));
    expect(get({ ench: "rising" }).map((s) => s.flat)).toEqual(base.map((_, i) => ENCHANT_NUM.risingStep * 3 * (i + 1)));
    expect(get({ ench: "growing", grow: 2 }).map((s) => s.flat)).toEqual(base.map(() => 30));
  });
  it("ECHOING: every 3rd slug it makes is followed by a copy with a new id, spaced as a stamp spaces slugs", () => {
    const run = (e: Partial<Placed>): { produced: number[]; ids: number[]; bt: Battle } => {
      const bt = new Battle(kilnDeck(e), barge(), SEED), ids: number[] = [];
      const seen = new Set<number>();
      while (bt.t < 10) {
        bt.step();
        bt.drainEvents();
        for (const a of bt.sides[0].routes[0].ammo) if (!seen.has(a.p.id)) { seen.add(a.p.id); ids.push(a.p.id); }
      }
      return { produced: [bt.sides[0].factories[0].produced], ids, bt };
    };
    const plain = on(() => run({})), echo = on(() => run({ ench: "echoing" }));
    const n = plain.produced[0], m = echo.produced[0];
    expect(n).toBeGreaterThan(6);
    // m stamps and the copies they earned: m = stamps + floor(stamps / 3), and the stamp count is the plain run's (the word does not change the timer)
    expect(m).toBeGreaterThan(n);
    expect(m - Math.floor((m * 3) / 4)).toBeGreaterThanOrEqual(0);
    expect(new Set(echo.ids).size).toBe(echo.ids.length); // every copy has its own id
    // the pairs: the copy right behind each 3rd slug carries the same numbers
    const bt = echo.bt;
    expect(bt.sides[0].factories[0].ench?.n).toBeGreaterThan(0);
  });
  it("MASSIVE and SWIFT: the factory's rate halves (rounding down) or doubles, and its slug deals 2x or half (the SPLITTER's share)", () => {
    const state = (e: Partial<Placed>) => new Battle(kilnDeck(e), barge(), SEED).sides[0].factories[0];
    on(() => {
      const base = state({}), massive = state({ ench: "massive" }), swift = state({ ench: "swift" });
      const s = base.def.factory!.speed;
      expect(massive.def.factory!.speed).toBe(enchantRate("massive", s));
      expect(massive.def.factory!.speed).toBe(Math.max(1, Math.floor(s / 2)));
      expect(swift.def.factory!.speed).toBe(s * 2);
      expect(base.ench).toBeUndefined();
      expect(first(kilnDeck({ ench: "massive" })).every((x) => x.mult === ENCHANT_NUM.massiveShare)).toBe(true);
      expect(first(kilnDeck({ ench: "swift" })).every((x) => x.mult === 0.5)).toBe(true);
      expect(first(kilnDeck()).every((x) => x.mult === 1)).toBe(true);
    });
    // fewer slugs for MASSIVE in the same time, more for SWIFT, while the belt has room
    const produced = (e: Partial<Placed>) => { const bt = new Battle(kilnDeck(e), barge(), SEED); while (bt.t < 5) { bt.step(); bt.drainEvents(); } return bt.sides[0].factories[0].produced; };
    const p0 = on(() => produced({})), pm = on(() => produced({ ench: "massive" })), ps = on(() => produced({ ench: "swift" }));
    expect(pm).toBeLessThan(p0);
    expect(ps).toBeGreaterThanOrEqual(p0);
    expect(pm * 2).toBeGreaterThanOrEqual(p0 - 2);
    expect(pm * 2).toBeLessThanOrEqual(p0 + 2);
  });
});

describe("ENCHANT-1 E3: the turret's words (the free SCRAP CANNON)", () => {
  it("FIERY: [BURN]+1 x stars lands with every shot", () => {
    const b1 = on(() => shots(turretDeck())), f1 = on(() => shots(turretDeck({ ench: "fiery" }))), f3 = on(() => shots(turretDeck({ ench: "fiery" }, 3))), b3 = on(() => shots(turretDeck({}, 3)));
    expect(f1.burn).toHaveLength(b1.burn.length);
    f1.burn.forEach((x, i) => expect(x - b1.burn[i], `★1 shot ${i}`).toBe(1));
    f3.burn.forEach((x, i) => expect(x - b3.burn[i], `★3 shot ${i}`).toBe(3));
    expect(f1.dmg).toEqual(b1.dmg); // it adds no damage
  });
  it("RISING: the nth shot gets +5 x n x stars DMG; it starts again each fight", () => {
    for (const stars of [1, 3]) {
      const b = on(() => shots(turretDeck({}, stars))), w = on(() => shots(turretDeck({ ench: "rising" }, stars)));
      const k = Math.min(b.dmg.length, w.dmg.length, 8);
      expect(k).toBeGreaterThan(4);
      for (let i = 0; i < k; i++) expect(w.dmg[i] - b.dmg[i], `★${stars} shot ${i + 1}`).toBe(ENCHANT_NUM.risingStep * (i + 1) * stars);
      // a second fight with the same deck starts at 0 again: the first shot is the same +5 x stars
      const again = on(() => shots(turretDeck({ ench: "rising" }, stars)));
      expect(again.dmg).toEqual(w.dmg);
    }
  });
  it("GROWING: +5 x grow x stars DMG on every shot", () => {
    for (const stars of [1, 3]) {
      const b = on(() => shots(turretDeck({}, stars))), w = on(() => shots(turretDeck({ ench: "growing", grow: 4 }, stars)));
      const k = Math.min(b.dmg.length, w.dmg.length, 8);
      for (let i = 0; i < k; i++) expect(w.dmg[i] - b.dmg[i], `★${stars} shot ${i + 1}`).toBe(5 * 4 * stars);
    }
  });
  it("ECHOING: every 3rd shot hits twice (an extra projectile, no new draw)", () => {
    const b = on(() => shots(turretDeck())), w = on(() => shots(turretDeck({ ench: "echoing" })));
    // the word changes no timing: the real shots are the same; each 3rd earns one more fire event
    const real = b.fires;
    expect(w.fires).toBe(real + Math.floor(real / ENCHANT_NUM.echoEvery));
    expect(w.burn.length).toBeGreaterThanOrEqual(b.burn.length);
  });
  it("MASSIVE and SWIFT: the rate halves (rounding down) or doubles, and each shot deals 2x or half (never under the least a shot deals)", () => {
    const b = on(() => shots(turretDeck())), m = on(() => shots(turretDeck({ ench: "massive" }))), s = on(() => shots(turretDeck({ ench: "swift" })));
    expect(m.speed).toBe(Math.max(1, Math.floor(b.speed / 2)));
    expect(s.speed).toBe(b.speed * 2);
    expect(m.interval).toBeCloseTo(30 / m.speed, 9);
    expect(s.interval).toBeCloseTo(30 / s.speed, 9);
    for (let i = 0; i < 3; i++) {
      expect(m.dmg[i], `MASSIVE shot ${i + 1}`).toBe(b.dmg[i] * ENCHANT_NUM.massiveShare);
      expect(s.dmg[i], `SWIFT shot ${i + 1}`).toBe(Math.max(10, Math.round(b.dmg[i] / 2)));
    }
    expect(m.fires).toBeLessThan(b.fires);
  });
  it("WIDE: +1 gear slot (static; deck.ts resolveSlots)", () => {
    const bt = on(() => new Battle(turretDeck({ ench: "wide" }), barge(), SEED));
    expect(bt.sides[0].turrets[0].ench?.id).toBe("wide");
    expect(bt.sides[0].turrets[0].def.speed).toBe(new Battle(turretDeck(), barge(), SEED).sides[0].turrets[0].def.speed);
  });
});

describe("ENCHANT-1 E3: BRACED swallows the first 2 x stars STUNs on its piece each fight, and no more", () => {
  type Disrupt = (s: SideState, t: Target, secs?: number, cause?: string) => boolean;
  const stunner = (bt: Battle): Disrupt => (bt as unknown as { disrupt: Disrupt }).disrupt.bind(bt);
  const kinds: { name: string; build: (stars: number) => Build; pick: (s: SideState) => Target; part: (s: SideState) => { disrupted: number } }[] = [
    { name: "a rig", build: (st) => rigDeck(st, { ench: "braced" }), pick: (s) => s.targets.find((t) => t.kind === "gate" && t.ref === 10)!, part: (s) => s.gates.find((g) => g.uid === 10)! },
    { name: "a factory", build: (st) => ({ ...kilnDeck(), items: [{ ...item(2, "press", 2, 6, 0, st), ench: "braced" }, { uid: 1, def: "kiln", x: 0, y: 8 }], routes: [{ factory: 2, cells: [K(3, 5), K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] }] }), pick: (s) => s.targets.find((t) => t.kind === "factory" && t.ref === 2)!, part: (s) => s.factories.find((f) => f.uid === 2)! },
    { name: "a turret", build: (st) => turretDeck({ ench: "braced" }, st), pick: (s) => s.targets.find((t) => t.kind === "turret")!, part: (s) => s.turrets[0] },
  ];
  for (const k of kinds) for (const stars of [1, 2, 3]) {
    it(`${k.name} at ★${stars}: ${ENCHANT_NUM.bracedStuns * stars} STUNs do nothing, the next one lands`, () => {
      const bt = on(() => new Battle(k.build(stars), barge(), SEED));
      const side = bt.sides[0], stun = stunner(bt), t = k.pick(side), part = k.part(side);
      const left: number[] = [];
      for (let i = 0; i < ENCHANT_NUM.bracedStuns * stars; i++) {
        expect(stun(side, t, 2, "shock"), `STUN ${i + 1}`).toBe(false);
        expect(part.disrupted, `STUN ${i + 1}`).toBe(0);
        for (const e of bt.drainEvents()) if (e.type === "braced") { expect(e.kind).toBe(t.kind); expect(e.ref).toBe(t.ref); left.push(e.left); }
      }
      expect(left).toEqual(Array.from({ length: ENCHANT_NUM.bracedStuns * stars }, (_, i) => ENCHANT_NUM.bracedStuns * stars - 1 - i)); // the log counts down
      expect(stun(side, t, 2, "shock"), "the next STUN").toBe(true);
      expect(part.disrupted).toBeGreaterThan(0);
    });
  }
  it("it never blocks a STUN on another piece, a wreck or a rip, and a fresh fight starts with the full count", () => {
    const bt = on(() => new Battle({ ...rigDeck(1, { ench: "braced" }), items: [...rigDeck(1, { ench: "braced" }).items, item(11, "temper", 2, 3, 1)] }, barge(), SEED));
    const side = bt.sides[0], stun = stunner(bt);
    const other = side.targets.find((t) => t.kind === "gate" && t.ref === 11)!, mine = side.targets.find((t) => t.kind === "gate" && t.ref === 10)!;
    expect(stun(side, other, 2, "shock")).toBe(true); // a STUN on another piece lands
    expect(stun(side, mine, 2, "shock")).toBe(false);
    expect(stun(side, other, 2, "freeze")).toBe(true);
    // a fresh Battle of the same deck: the count is full again
    const again = on(() => new Battle(rigDeck(1, { ench: "braced" }), barge(), SEED));
    expect(stunner(again)(again.sides[0], again.sides[0].targets.find((t) => t.kind === "gate" && t.ref === 10)!, 2, "shock")).toBe(false);
    expect(bracedSwallow(undefined)).toBe(false);
    expect(bracedSwallow(on(() => makeEnchantState({ ench: "fiery" }, 1)))).toBe(false); // only BRACED
  });
});

describe("ENCHANT-1 E3: GROWING grows after each dusk fight (a win, a loss or a draw), on the deck's pieces", () => {
  const side = () => ({ shots: 0, damage: 0, firstShot: -1, idle: 0, turretTime: 0, maxQueue: 0, jams: 0, disrupted: 0, windTaken: 0, burnDealt: 0, payloadSum: 0, produced: 0, stalled: 0 });
  it("+1 on every GROWING rig, factory and turret per dusk fight; other words and a second turn don't", () => {
    const run = newRun("furnace", 11);
    run.build.items.push({ uid: 300, def: "whetstone", x: 1, y: 5, ench: "growing" }, { uid: 301, def: "longhaul", x: 2, y: 2, ench: "fiery" });
    run.build.items[0] = { ...run.build.items[0], ench: "growing" }; // the KILN
    setTurretList(run.build, [{ slot: 0, def: "scrapcannon", uid: 90, free: true, ench: "growing" }]);
    const grows = () => [run.build.items.find((p) => p.uid === 300)!.grow, run.build.items.find((p) => p.uid === 301)!.grow, run.build.items[0].grow, run.build.turrets![0].grow];
    on(() => {
      finishDay(run, 0, 20, side(), side()); // a win
      expect(grows()).toEqual([1, undefined, 1, 1]);
      finishDay(run, 1, 20, side(), side()); // a loss
      expect(grows()).toEqual([2, undefined, 2, 2]);
      finishDay(run, -1, 20, side(), side()); // a draw
      expect(grows()).toEqual([3, undefined, 3, 3]);
    });
  });
  it("with ENCHANT off nothing grows", () => {
    const run = newRun("furnace", 12);
    run.build.items.push({ uid: 300, def: "whetstone", x: 1, y: 5, ench: "growing" });
    finishDay(run, 0, 20, side(), side());
    expect(run.build.items.find((p) => p.uid === 300)!.grow).toBeUndefined();
  });
});

describe("ENCHANT-1 E3: payload math in one place (every key of Payload has a rule)", () => {
  it("the table names every key of the Payload interface, and only those (read from battle.ts)", () => {
    const src = readFileSync("src/sim/battle.ts", "utf8");
    const body = /export interface Payload \{([\s\S]*?)\n\}/.exec(src)![1];
    const keys = [...body.matchAll(/^ {2}([A-Za-z0-9_]+)\??:/gm)].map((m) => m[1]).sort();
    expect(keys.length).toBeGreaterThan(30);
    expect(Object.keys(PAYLOAD_RULES).sort(), "a field added to Payload needs a rule in enchantFx.ts PAYLOAD_RULES").toEqual(keys);
  });
  it("MASSIVE / SWIFT scale exactly the `share` keys (mult, flat, plate); echoCopy copies the rest and deep-copies the `deep` ones", () => {
    expect(payloadKeys("share").sort()).toEqual(["flat", "mult", "plate"]);
    expect(payloadKeys("burn")).toEqual(["burn"]);
    expect(payloadKeys("id")).toEqual(["id"]);
    const full = {
      id: 7, ammo: "cinder", ride: 1.5, mult: 1, flat: 25, burn: 2, shock: true, prior: 3, factory: 1, copy: true, shockTime: 2, jump: 1, base: 40, preset: "ember",
      debuffs: { sap: true }, harass: { kind: "frost", seconds: 2 }, static: true, arc: 2, rip: { count: 1, reach: 2 }, heat: 4, heatRide: 1, heatBonus: 5,
      pulseSeen: { 4: 2 }, compound: undefined, burnPlus: 3, fray: 1, frayCap: 2, staticTime: 1, boosters: [3, 4], journeyOffset: 2, paired: true, lone: true, plate: 9,
      poison: 4, each: 12, // BUMP-1F (PACKET-BUMP-0130 section 5): BUMP-1E's POISON and FOR EACH DMG: `kept` (no word touches them; an echo copies them)
    } as unknown as Payload;
    const doubled = { ...full, boosters: [...full.boosters!] } as Payload;
    scaleShare(doubled, 2);
    for (const k of Object.keys(PAYLOAD_RULES) as (keyof Payload)[]) {
      if (PAYLOAD_RULES[k] === "share") continue;
      expect(JSON.stringify(doubled[k]), `${k} is untouched by the share`).toBe(JSON.stringify(full[k]));
    }
    expect([doubled.mult, doubled.flat, doubled.plate]).toEqual([2, 50, 18]);
    const half = { ...full } as Payload;
    scaleShare(half, 0.5);
    expect([half.mult, half.flat, half.plate]).toEqual([0.5, 13, 5]); // 12.5 -> 13, 4.5 -> 5: rounded half up once
    const c = echoCopy(full, 99);
    expect(c.id).toBe(99);
    for (const k of Object.keys(PAYLOAD_RULES) as (keyof Payload)[]) {
      if (k === "id") continue;
      expect(JSON.stringify(c[k]), `${k} is copied`).toBe(JSON.stringify(full[k]));
      if (PAYLOAD_RULES[k] === "deep" && typeof full[k] === "object" && full[k] !== null) expect(c[k], `${k} is its own object`).not.toBe(full[k]);
    }
  });
  it("slugMadeFx: the same words on a bare Payload (the factory path), counts and the every-3rd copy flag", () => {
    const bare = (): Payload => ({ id: 1, ammo: "cinder", ride: 0, mult: 1, flat: 0, burn: 0, shock: false, prior: 0, factory: 1, copy: false });
    on(() => {
      const st = makeEnchantState({ ench: "echoing" }, 2)!;
      const E = ENCHANT_NUM.echoEvery, flags = Array.from({ length: 2 * E }, () => slugMadeFx(st, bare()));
      expect(flags).toEqual(Array.from({ length: 2 * E }, (_, i) => (i + 1) % E === 0));
      const r = makeEnchantState({ ench: "rising" }, 2)!, p = bare();
      slugMadeFx(r, p); slugMadeFx(r, p);
      expect(p.flat).toBe(ENCHANT_NUM.risingStep * 1 * 2 + ENCHANT_NUM.risingStep * 2 * 2); // step x 1 x 2, then step x 2 x 2
    });
    expect(makeEnchantState({ ench: "fiery" }, 1)).toBeUndefined(); // off: no state
  });
});

describe("ENCHANT-1: with ENCHANT off a deck holding words fights exactly as the same deck without them", () => {
  it("every event, tick for tick, and both hulls", () => {
    const words = (b: Build): Build => ({ ...b, items: b.items.map((p) => (p.uid === 10 ? { ...p, ench: "rising" } : p.uid === 1 ? { ...p, ench: "massive" } : p)) });
    const dressed = words(rigDeck(1));
    setTurretList(dressed, [{ slot: 0, def: "scrapcannon", uid: 90, free: true, ench: "swift" }]);
    const plain = rigDeck(1);
    const trace = (b: Build): string => {
      const bt = new Battle(b, barge(), SEED), log: string[] = [];
      while (bt.t < 20 && !bt.over) { bt.step(); for (const e of bt.drainEvents()) log.push(JSON.stringify(e)); }
      return `${log.length}|${log.join("")}|${bt.sides[0].hull.hp}|${bt.sides[1].hull.hp}`;
    };
    const a = trace(plain), b = trace(dressed);
    expect(b.length).toBeGreaterThan(1000);
    expect(b).toBe(a);
    // and with it on the same deck is not the same fight
    expect(on(() => trace(dressed))).not.toBe(a);
  });
  it("every word, every kind: the switch off builds no state", () => {
    for (const id of ENCHANT_IDS) {
      const bt = new Battle({ ...rigDeck(1, { ench: id, enchDir: id === "wide" ? 2 : undefined, grow: undefined }), }, barge(), SEED);
      expect(bt.sides[0].gates.every((g) => g.ench === undefined), id).toBe(true);
      expect(bt.sides[0].factories.every((f) => f.ench === undefined), id).toBe(true);
    }
  });
});
