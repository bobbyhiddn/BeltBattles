// 0.8.0 G1 (BRIEF-wave3-G1; REQ-BFG-022, REQ-BFG-023): wave 3's untested corners. cap's check of P1 made 52 mutants of
// P1's code (output-P1/verify-cap/VERIFIED-P1.md, section E), and 12 of them survived the full suite. Each test here pins
// the rule one of the 12 breaks, and its name starts with that mutant's id (output-G1/kit/vmut.mjs re-runs them all).
// Each rule is shown in a real battle on a deck a player could build: every deck is legal on day 10 with wave 3 in the
// game, the test's + 5000 hull aside. The belt walk and OVERCLOCKER's doubling are also checked as functions. The switch
// stays off: a battle reads the wave-3 parts from ITEMS whatever the switch, so only the legality checks turn wave 3 on.
import { describe, expect, it } from "vitest";
import { Battle, type Payload } from "../src/sim/battle";
import { WIND_START, withWave3 } from "../src/sim/content";
import {
  journeyTiles, matchedRoutes, platedDeck, rigFactoryHits, routeInfo, stokeHits, walkRoute, type Build, type Dir, type TimelineHit,
} from "../src/sim/deck";
import { rotFacing } from "../src/sim/beltside";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { boostable, overclocked } from "../src/sim/overclock";
import { PLATE_CAP } from "../src/sim/races/bastion";
import { pct } from "../src/sim/pct"; // NUM-1 (REQ-BFG-047): the sim's one % rule (n x p%, rounded half up once)
import { SYNC_WINDOW } from "../src/sim/races/foundry";
import { effectAt } from "../src/sim/stars";
import { validateBuild } from "../src/net/validate";
import { newRun } from "../src/game/run";
import { beltPanel } from "../src/screens/build/inspector";
import { K, SEED, barge, events, item, latchDeck, run, withItem, withMod } from "./wave3.helpers";

// ------------------------------------------------------------------------------------------------------------ decks

/** The deck is one a player could own on day 10 with wave 3 in the game (the test's + 5000 hull aside). */
function legal(b: Build, what = ""): void {
  withWave3(() => expect(validateBuild({ ...b, hullBonus: 0 }, 10).errors, what).toEqual([]));
}

/** FURNACE's starting deck, hull + 5000: the Kiln (uid 1) at (4,6), its 6-tile belt up column 4 into the heavy gun's
 *  connector 4 (tiles 0-5 are (4,5) to (4,0)). */
const furnace = (): Build => ({ ...heroStartBuild("furnace", 1), hullBonus: 5000 });

/** FURNACE with a second factory `def` (uid 7) at (6,6) on (6,5), (5,5) and up column 5 into connector 5 (7 tiles): both
 *  belts feed the heavy gun, 13 of the 14 belt tiles. */
function kilnAnd(def: string, stars = 1): Build {
  const b = furnace();
  return {
    ...b, items: [...b.items, item(7, def, 6, 6, 0, stars)],
    routes: [...b.routes, { factory: 7, cells: [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] }],
  };
}

/** The heavy gun merged to 2 stars (FURNACE's free SCRAP CANNON and a bought copy): two gear slots. */
const cannon2 = (b: Build): Build => ({ ...b, turrets: [{ slot: 0, def: "scrapcannon", uid: 90, stars: 2, free: true }] });

/** A rig of `def` at (x, y) with its first arrow facing `dir` (0 north, 1 east, 2 south, 3 west). */
const rig = (uid: number, def: string, x: number, y: number, dir: Dir, stars = 1) => item(uid, def, x, y, rotFacing(def, dir), stars);

/** Each payload that crosses tile `tile` of side 0's route `route` after `from` s: its flat bonus once that tile's hits
 *  are applied, read on the tick it crosses (payloads are AMMO_SPACING apart, so one crosses a tile per tick at most). */
function crossings(b: Build, route: number, tile: number, secs: number, from: number): number[] {
  const seen = new Set<number>(), out: number[] = [];
  run(b, secs, barge(), SEED, (_ev, bt) => {
    for (const a of bt.sides[0].routes[route].ammo) {
      if (a.processed < tile || seen.has(a.p.id)) continue;
      seen.add(a.p.id);
      if (bt.t > from) out.push(a.p.flat);
    }
  });
  return out;
}

/** One load entering side 0's heavy gun: from its belt, or from a HOPPER's store when it drops in. */
interface Entry { tick: number; t: number; p: Payload; route: number; stored: boolean }
interface Chamber {
  entries: Entry[]; // in the order they entered
  pairs: Map<number, number>; // pair events, by tick
  plates: Map<number, number[]>; // plate events' amounts, by tick, in order (SEAM WELDER is these decks' only plating)
  shots: { tick: number; dmg: number; p: Payload }[]; // a COMPOUND shell's packed load is p.compound
}

/** A battle of `b` against the barge for `secs`, logging side 0's gun 0 (each factory feeds one belt in these decks). A
 *  load is logged on the tick it enters the chamber: read off the chamber at the end of the tick, or off the shot when it
 *  closes the window and fires on the tick it enters (the shot's loads entered last: the chamber fires its newest). */
function chamber(b: Build, secs: number): Chamber {
  const bt = new Battle(b, barge(), SEED);
  const routeOf = new Map(b.routes.map((r, i) => [r.factory, i] as const));
  const c: Chamber = { entries: [], pairs: new Map(), plates: new Map(), shots: [] };
  const seen = new Set<Payload>(), stored = new Set<Payload>();
  const enter = (p: Payload) => {
    if (seen.has(p)) return;
    seen.add(p);
    c.entries.push({ tick: bt.ticks, t: bt.t, p, route: routeOf.get(p.factory)!, stored: stored.has(p) });
  };
  while (bt.t < secs && !bt.over) {
    bt.step();
    const tu = bt.sides[0].turrets[0];
    for (const p of tu.stack) enter(p);
    for (const e of bt.drainEvents()) {
      if (e.type === "pair" && e.side === 0) c.pairs.set(bt.ticks, (c.pairs.get(bt.ticks) ?? 0) + 1);
      else if (e.type === "plate" && e.side === 0) c.plates.set(bt.ticks, [...(c.plates.get(bt.ticks) ?? []), e.amount]);
      else if (e.type === "fire" && e.side === 0) {
        const p = bt.projectiles.find((x) => x.id === e.proj)!.payload;
        c.shots.push({ tick: bt.ticks, dmg: e.dmg, p });
        for (const q of [p.compound, p]) if (q) enter(q);
      }
    }
    for (const x of tu.store) stored.add(x.p);
  }
  return c;
}

const sum = (xs: Iterable<number>) => [...xs].reduce((a, b) => a + b, 0);
/** BB_TABLES=1 prints each test's evidence (output-G1/REPORT.md quotes it). */
const note = (line: string) => { if (process.env.BB_TABLES) console.log(`G1 ${line}`); };

// ------------------------------------------------------------------------------------------------------------ E2

describe("E2: a pair is two loads (DESIGN-wave3.md 3.2, the Prime's Q5)", () => {
  const { pair, lone } = effectAt("seamwelder", 1).mod!.seam!;

  it("C-E2-repair: a load that already paired never pairs again: three loads into one gun inside one window, from both intakes, make one pair, not two", () => {
    // the Kiln and a STAMP PRESS keep FURNACE's heavy gun busy: when its chamber opens, the load waiting at each intake
    // enters on one tick (a pair), and the next load reaches its intake AMMO_SPACING later (0.233 s, inside SYNC_WINDOW)
    // while the window (3 loads) still has room. SEAM WELDER makes the gun read pairs and rolls its plating for each load.
    const b = withMod(kilnAnd("press"), 50, "seamwelder");
    legal(b);
    const c = chamber(b, 20);
    const triples: [Entry, Entry, Entry][] = [];
    for (let i = 0; i + 2 < c.entries.length; i++) {
      const [x, y, z] = [c.entries[i], c.entries[i + 1], c.entries[i + 2]];
      if (c.entries[i - 1]?.tick === x.tick || y.tick !== x.tick || x.route === y.route) continue; // two on one tick, both intakes
      if (z.tick === x.tick || c.entries[i + 3]?.tick === z.tick || z.t - x.t > SYNC_WINDOW + 1e-9) continue; // a third, alone, in the window
      if (c.shots.some((s) => s.tick >= x.tick && s.tick <= z.tick)) continue; // one window: the gun fired nothing in between
      triples.push([x, y, z]);
    }
    expect(triples.length, "windows that take a pair and then a third load inside SYNC_WINDOW").toBeGreaterThanOrEqual(3);
    for (const [x, y, z] of triples) {
      const at = `t ${x.t.toFixed(3)}, third load ${(z.t - x.t).toFixed(3)} s later from intake ${z.route}`;
      expect([x.p.paired, y.p.paired, !!z.p.paired], at).toEqual([true, true, false]);
      expect(c.pairs.get(x.tick), at).toBe(1);
      expect(c.pairs.get(z.tick), at).toBeUndefined(); // the third load pairs with neither of them
      expect(c.plates.get(z.tick), at).toEqual([lone]); // so SEAM WELDER rolls it as a lone load
    }
    // over the battle: every pair marks two loads, and no load is in two pairs
    const pairs = sum(c.pairs.values());
    expect(pairs).toBeGreaterThanOrEqual(3);
    expect(c.entries.filter((x) => x.p.paired).length).toBe(2 * pairs);
    note(`E2-repair | ${c.entries.length} loads in 20 s, ${pairs} pairs, ${c.entries.filter((x) => x.p.paired).length} paired loads; ${triples.length} windows take a third load ${triples.map(([x, , z]) => (z.t - x.t).toFixed(3)).join("/")} s after a pair, none paired`);
  });

  it("C-E2-store: a load a HOPPER held in its store pairs when it drops into the chamber, as if it reached its intake then", () => {
    // the heavy gun at 2 stars (two gear slots: SEAM WELDER and HOPPER), kept busy by the Kiln and a STAMP PRESS: while it
    // fires, its store takes loads off its intakes (1 at 2 stars, 2 at 3), and they drop in when its chamber empties
    const deck = (hopper: number) => withMod(withMod(cannon2(kilnAnd("press")), 50, "seamwelder"), 51, "hopper", 0, hopper);
    const c3 = chamber(deck(3), 20), c2 = chamber(deck(2), 40);
    legal(deck(3), "HOPPER ★3");
    legal(deck(2), "HOPPER ★2");
    // HOPPER ★3: two stored loads, one from each intake, drop in on one tick and pair (SEAM WELDER rolls the first as a lone
    // load and the second as a pair); two from one intake never pair
    const drops = new Map<number, Entry[]>();
    for (const x of c3.entries) if (x.stored) drops.set(x.tick, [...(drops.get(x.tick) ?? []), x]);
    const both = [...drops.values()].filter((d) => d.length === 2 && d[0].route !== d[1].route);
    const one = [...drops.values()].filter((d) => d.length === 2 && d[0].route === d[1].route);
    expect(both.length, "drops of a stored load from each intake").toBeGreaterThanOrEqual(2);
    for (const [x, y] of both) {
      const at = `t ${x.t.toFixed(3)}`;
      expect([x.p.paired, y.p.paired], at).toEqual([true, true]);
      expect(c3.pairs.get(x.tick), at).toBe(1);
      expect(c3.plates.get(x.tick), at).toEqual([lone, pair]);
    }
    for (const [x] of one) {
      expect(c3.pairs.get(x.tick), `t ${x.t.toFixed(3)}`).toBeUndefined();
      expect(c3.plates.get(x.tick), `t ${x.t.toFixed(3)}`).toEqual([lone, lone]);
    }
    // HOPPER ★2: a stored load dropped in alone pairs with the next load, when that one comes from the other intake within
    // SYNC_WINDOW
    const next = c2.entries.map((x, i) => [x, c2.entries[i + 1]] as const)
      .filter(([x, y]) => x.stored && y && !y.stored && y.route !== x.route && y.t - x.t <= SYNC_WINDOW + 1e-9);
    expect(next.length, "a dropped load, then a load from the other intake").toBeGreaterThanOrEqual(1);
    for (const [x, y] of next) expect([x.p.paired, y.p.paired], `t ${x.t.toFixed(3)}`).toEqual([true, true]);
    // and every load that enters the chamber, from a belt or from the store, rolls SEAM WELDER's plating once (the hull
    // stays under the cap here, so each roll lands)
    for (const c of [c3, c2]) {
      expect(c.entries.filter((x) => x.stored).length).toBeGreaterThan(3);
      expect(sum([...c.plates.values()].flat())).toBeLessThan(PLATE_CAP);
      expect([...c.plates.values()].flat().length).toBe(c.entries.length);
      expect(c.entries.filter((x) => x.p.paired).length).toBe(2 * sum(c.pairs.values()));
    }
    note(`E2-store | HOPPER ★3, 20 s: ${c3.entries.length} loads (${c3.entries.filter((x) => x.stored).length} from the store), ${both.length} drops of one load from each intake, all paired; ${one.length} drops from one intake, unpaired | HOPPER ★2, 40 s: ${c2.entries.length} loads (${c2.entries.filter((x) => x.stored).length} from the store), ${next.length} dropped loads paired with the next load from the other intake`);
  });
});

// ------------------------------------------------------------------------------------------------------------ E3

describe("E3: rig arrows at factories (STOKER)", () => {
  it("C-E3-press: a STOKER beside an ARMOR PRESS speeds its plating by 1 + stoke, though the gun caps its stamping (oracle a0e94bc69949561f)", () => {
    // the ARMOR PRESS (uid 7) on connector 5 and the Kiln on connector 4 feed one heavy gun, which takes a load a second: the
    // Kiln's 0.8 leave the press no room to stamp faster, so STOKER's cap holds its stamping at its own 1.6 s. Its plating
    // timer puts no payload on a belt, so it keeps the full stoke from the moment the STOKER comes online (1.2 s).
    const log = (b: Build) => {
      const plates: number[] = [], stamps: number[] = [];
      run(b, 21, barge(), SEED, (ev, bt) => {
        for (const e of ev) {
          if (e.type === "plate" && e.side === 0) plates.push(bt.t);
          if (e.type === "produce" && e.side === 0 && e.factory === 7) stamps.push(bt.t);
        }
      });
      return { plates, stamps };
    };
    const plain = kilnAnd("armorpress"), off = log(plain);
    // 0.8.0 B1 M2 (brief 3.3): ARMOR PRESS plates every 3 s (was 4)
    expect(off.plates.map((t) => +t.toFixed(3))).toEqual([3, 6, 9, 12, 15, 18, 21]);
    expect(off.stamps.length).toBeGreaterThan(10);
    for (const [s, k] of [[1, 0.2], [2, 0.44], [3, 0.7]] as const) {
      const b = withItem(plain, item(30, "stoker", 8, 6, 0, s)); // its west arrow points into the press at (7,6)
      legal(b, `STOKER ★${s}`);
      expect(stokeHits(b).map((h) => [h.uid, h.factory])).toEqual([[30, 7]]);
      const on = log(b);
      expect(on.stamps, `★${s}: the press stamps as it did unstoked`).toEqual(off.stamps);
      expect(Math.abs(on.plates[0] - (1.2 + (3 - 1.2) / (1 + k))), `★${s} first plating at ${on.plates[0]}`).toBeLessThan(1.5 / 60);
      on.plates.slice(1).forEach((t, i) => expect(Math.abs(t - on.plates[i] - 3 / (1 + k)), `★${s} plating ${i + 1}`).toBeLessThan(1.5 / 60));
      expect(on.plates.length).toBeGreaterThan(off.plates.length);
      note(`E3-press | STOKER ★${s}: plating at ${on.plates.map((t) => t.toFixed(3)).join(", ")} s (unstoked ${off.plates.map((t) => t.toFixed(0)).join(", ")}); ${on.stamps.length} stamps, the same ticks as unstoked`);
    }
  });

  it("C-E3-guard: with a STOKER on board, another rig whose arrow points into a factory still counts none (the Prime's guard, VERIFIED-D1 Q6)", () => {
    // WEAVER: the STOKER (uid 30) at (6,6) and the other rig (uid 31) at (3,6) both point into the Loom. FURNACE: the STOKER
    // at (8,6) works a STAMP PRESS (uid 7), and the other rig at (3,6) points into the Kiln, which no STOKER works.
    const decks: [string, Build][] = [
      ["weaver", withItem({ ...heroStartBuild("weaver", 1), hullBonus: 5000 }, item(30, "stoker", 6, 6))],
      ["furnace", withItem(kilnAnd("press"), item(30, "stoker", 8, 6))],
    ];
    const stamps = (b: Build) => events(b, 15).filter((x) => x.e.type === "produce" && x.e.side === 0).map((x) => `${(x.e as { factory: number }).factory}@${x.t.toFixed(4)}`);
    for (const [hero, stoked] of decks) {
      const alone = stamps(stoked);
      for (const def of ["whetstone", "temper", "plateroller", "pincer"]) {
        const b = withItem(stoked, rig(31, def, 3, 6, 1)); // facing east into the factory at (4,6)
        const what = `${def} on ${hero}`;
        legal(b, what);
        expect(rigFactoryHits(b).map((h) => h.uid).sort(), what).toEqual([30, 31]);
        expect(stokeHits(b).map((h) => h.uid), what).toEqual([30]);
        const bt = new Battle(b, barge(), SEED);
        expect(bt.sides[0].gates.find((g) => g.uid === 31)!.factoryHits, what).toBeUndefined(); // no factory hits
        expect(bt.sides[0].factories.flatMap((f) => (f.stokers ?? []).map((st) => st.g.uid)), what).toEqual([30]);
        // in a battle: only the STOKER comes online, and every factory stamps exactly as with the STOKER alone
        const ev = events(b, 15);
        expect(ev.filter((x) => x.e.type === "commission" && x.e.side === 0).map((x) => (x.e as { gate: number }).gate), what).toEqual([30]);
        expect(stamps(b), what).toEqual(alone);
      }
      note(`E3-guard | ${hero}: WHETSTONE, TEMPER, PLATE ROLLER and PINCER aimed into a factory beside a STOKER: no factory hits, never online, ${alone.length} stamps in 15 s as with the STOKER alone`);
    }
  });
});

// ------------------------------------------------------------------------------------------------------------ E4

describe("E4: holds (TWIN LATCH)", () => {
  it("C-E4-rip: a held payload that is ripped off its belt frees its latch arrow at once, so the next payload there is held", () => {
    // the latch deck (tests/wave3.helpers latchDeck; press B at 2 stars, so the two presses are no unfused pair) with TWIN
    // LATCH at (4,3), against a FURNACE whose heavy gun carries a GRAPNEL GUN ★2 and a SPOTTER: its shots that land on our
    // belts and rigs rip the two nearest payloads off, held ones too
    const me = withItem(latchDeck(), item(40, "twinlatch", 4, 3));
    me.items = me.items.map((p) => (p.uid === 3 ? { ...p, stars: 2 } : p));
    const foe = withMod(withMod({ ...heroStartBuild("furnace", 101), hullBonus: 5000 }, 150, "grapnel", 0, 2), 151, "spotter", 0);
    legal(me, "us");
    legal(foe, "the foe");
    const bt = new Battle(me, foe, SEED);
    const g = bt.sides[0].gates.find((x) => x.uid === 40)!, l = g.latch!;
    expect(l.same).toBe(true);
    const routes = g.hits.map((h) => bt.sides[0].routes[h.route]), tiles = g.hits.map((h) => h.tile);
    const held: (number | null)[] = [null, null], freed = [false, false], past = [new Set<number>(), new Set<number>()];
    let ripped = 0, heldAgain = 0;
    while (bt.t < 60 && !bt.over) {
      bt.step();
      const at = `t ${bt.t.toFixed(3)}`;
      const rips = bt.drainEvents().flatMap((e) => (e.type === "rip" && e.side === 0 ? [e.payload] : []));
      for (const i of [0, 1]) {
        // a payload that crossed the arrow's tile this tick (transport comes before the shots land): after a rip, it is held
        for (const a of routes[i].ammo) {
          if (a.processed < tiles[i] || past[i].has(a.p.id)) continue;
          past[i].add(a.p.id);
          if (freed[i]) {
            expect(a.hold?.arrow, `${at}: the next payload over arrow ${i}'s tile`).toBe(i);
            freed[i] = false;
            heldAgain++;
          }
        }
        // an arrow only ever holds a payload that is on its belt; the one it held is ripped: it is free on that tick
        const a = l.held[i];
        if (a) expect(routes[i].ammo.includes(a) && a.hold?.arrow === i, `${at}: arrow ${i} holds a payload on its belt`).toBe(true);
        if (held[i] !== null && rips.includes(held[i]!)) {
          expect(a, `${at}: arrow ${i}, its payload ripped`).toBeNull();
          ripped++;
          freed[i] = true;
        }
        held[i] = a?.p.id ?? null;
      }
    }
    expect(ripped, "held payloads ripped in 60 s").toBeGreaterThanOrEqual(3);
    expect(heldAgain).toBeGreaterThanOrEqual(ripped - 1); // the last one's successor may come after the battle ends
    note(`E4-rip | 60 s against GRAPNEL GUN ★2: ${ripped} held payloads ripped, their arrow free on that tick; the next payload over the tile held ${heldAgain} times`);
  });
});

// ------------------------------------------------------------------------------------------------------------ E6

describe("E6: matched belts (TWIN GAUGE)", () => {
  it("C-E6-turret: a belt is matched only by a belt into the same turret; equal belts into different turrets are not (matchedRoutes and the battle)", () => {
    // WEAVER's starting deck: the Loom's belts 1 and 2 have 8 tiles each, but end at gun 0 (connector 1) and gun 2 (connector 8)
    const w = { ...heroStartBuild("weaver", 1), hullBonus: 5000 };
    expect(w.routes.map((_, i) => [journeyTiles(w, i), routeInfo(w, i).turret])).toEqual([[5, 1], [8, 0], [8, 2]]);
    expect(matchedRoutes(w)).toEqual([false, false, false]);
    // NUM-1 (REQ-BFG-047): TWIN GAUGE's plain number read from the data, x10 (were the literals 1 / 2.2 / 3.5; now 10 / 22 / 35)
    for (const s of [1, 2, 3] as const) {
      const flat = effectAt("twingauge", s).gate!.gauge!.flat;
      const b = withItem(w, item(60, "twingauge", 0, 3, 1, s)); // at (0,3), facing east onto belt 1's tile 4, (1,3)
      legal(b, `TWIN GAUGE ★${s}`);
      const th = walkRoute(b, 1).timeline.flatMap((r) => r.hits).find((h) => h.uid === 60)!;
      expect([th.flat, th.matched], `★${s} walk`).toEqual([flat, false]);
      const bt = new Battle(b, barge(), SEED);
      expect(bt.sides[0].gates.find((x) => x.uid === 60)!.hits.map((h) => [h.route, h.tile, !!h.matched]), `★${s}`).toEqual([[1, 4, false]]);
      const flats = crossings(b, 1, 4, 20, 1.2); // the gauge is online from 1.2 s
      expect(flats.length).toBeGreaterThan(5);
      for (const f of flats) expect(f, `★${s} battle`).toBe(flat); // its plain number on every thread slug
      note(`E6-turret | WEAVER's belts 1 and 2 (8 tiles, guns 0 and 2) not matched; TWIN GAUGE ★${s}: walk ${th.flat}, ${flats.length} thread slugs in the battle each ${flat}`);
    }
    // as many tiles into the same turret is a match: FOUNDRY's mirrored belts into gun 0
    const f = heroStartBuild("foundry", 1);
    expect(f.routes.map((_, i) => [journeyTiles(f, i), routeInfo(f, i).turret])).toEqual([[6, 0], [6, 0]]);
    expect(matchedRoutes(f)).toEqual([true, true]);
  });
});

// ------------------------------------------------------------------------------------------------------------ PLATE BREAKER

describe("PLATE BREAKER", () => {
  // stars, the number for a whole plating (10: NUM-1, x10 of 1), the floor. NUM-1 (REQ-BFG-047): read from the data, x10
  // (were the literals [1, 4, 1], [2, 8.8, 2.2], [3, 14, 3.5]; now 40 / 10, 88 / 22, 140 / 35)
  const NUMS = ([1, 2, 3] as const).map((s) => {
    const { flat, floor } = effectAt("platebreaker", s).gate!.breaker!;
    return [s, flat, floor] as const;
  });
  /** FURNACE with PLATE BREAKER (uid 31, shape T) at (3,2): its east arrow on the Kiln belt's tile 3, (4,2). */
  const breaker = (s: number) => withItem(furnace(), item(31, "platebreaker", 3, 2, 0, s));
  /** ... and a PLATE ROLLER (uid 30) at (3,4) facing east onto tile 1, (4,4): 5 plating for each slug (NUM-1: x10 of 0.5),
   *  before the breaker. */
  const rolled = (s: number) => withItem(breaker(s), rig(30, "plateroller", 3, 4, 1));

  it("C-breaker-edge: PLATE BREAKER takes plating only when the hull holds at least 1: with 0 < plating < 1 it adds its floor and takes nothing", () => {
    for (const [s, big, floor] of NUMS) {
      const b = rolled(s);
      legal(b, `★${s}`);
      // each hit of the breaker: the plating it found, the plating it took, and the damage its payload gained
      const hits: { t: number; before: number; took: number; gain: number }[] = [];
      let plate = 0;
      const seen = new Set<number>();
      run(b, 20, barge(), SEED, (ev, bt) => {
        let took = 0, before = plate, hit = false;
        for (const e of ev) {
          if (e.type === "plate" && e.side === 0) {
            if (e.amount < 0) { before = plate; took = -e.amount; }
            plate = e.plate;
          } else if (e.type === "process" && e.side === 0 && e.gate === 31) {
            if (!took) before = plate;
            hit = true;
          }
        }
        for (const a of bt.sides[0].routes[0].ammo) {
          if (a.processed < 3 || seen.has(a.p.id)) continue;
          seen.add(a.p.id);
          if (hit) hits.push({ t: bt.t, before, took, gain: a.p.flat }); // the roller adds no damage: the flat is the breaker's
        }
      });
      // NUM-1 (REQ-BFG-047): PLATE BREAKER takes 10 plating (x10 of 1) and the PLATE ROLLER rolls 5 (x10 of 0.5), so half a
      // plating is 0 < plating < 10 and a whole one 10 or more (were 0 < plating < 1 and 1: [0.5, 0, floor], [1, big])
      const roll = effectAt("plateroller", 1).gate!.plate!;
      const half = hits.filter((h) => h.before > 0 && h.before < 10), whole = hits.filter((h) => h.before >= 10);
      expect(half.length, `★${s}: hits with half a plating on the hull`).toBeGreaterThanOrEqual(4);
      expect(whole.length, `★${s}: hits with 1 plating`).toBeGreaterThanOrEqual(4);
      for (const h of half) expect([h.before, h.took, h.gain], `★${s} t ${h.t.toFixed(3)}`).toEqual([roll, 0, floor]);
      for (const h of whole) expect([h.took, h.gain], `★${s} t ${h.t.toFixed(3)}`).toEqual([10, big]);
      expect(hits.length).toBe(half.length + whole.length);
      note(`breaker-edge | ★${s}: ${hits.length} hits in 20 s: ${half.length} at ${roll} plating (took 0, +${floor}), ${whole.length} at 10 (took 10, +${big}); payloads ${hits.slice(0, 6).map((h) => h.gain).join(", ")} ...`);
    }
  });

  // 0.8.0 B1 M2 (G1's F1, ref/BRIEF-v080-B1.md 3.4, approved there): the walk still counts the big number on a deck that
  // plates its hull, but the battle pays it only on a blow that finds a whole plating, so the build screen's DMG now shows
  // both numbers there: the floor's total, then the big number's ("DMG lo-hi"); a deck that never plates shows the floor
  it("C-walk-breaker: the belt walk counts PLATE BREAKER's floor on a deck that never plates its hull, and its big number on one that does; DMG shows both on a plated deck", () => {
    const hit = (b: Build): TimelineHit => walkRoute(b, 0).timeline.flatMap((r) => r.hits).find((h) => h.uid === 31)!;
    const plain = walkRoute(furnace(), 0).estimate.dmg;
    for (const [s, big, floor] of NUMS) {
      const bare = breaker(s);
      legal(bare, `★${s}`);
      expect(platedDeck(bare)).toBe(false);
      expect([hit(bare).flat, hit(bare).breaker], `★${s}`).toEqual([floor, { flat: big, floor }]);
      expect(walkRoute(bare, 0).estimate.dmg, `★${s}`).toBe(plain + floor); // NUM-1: whole (was toBeCloseTo(plain + floor, 9))
      // the build screen's belt readout reads the walk: DMG with the floor
      const rn = newRun("furnace", 5, "g1-walk");
      rn.build = bare;
      expect(beltPanel(rn, 0)!.headerOnly!.texts[2].split(",")[0], `★${s}`).toBe(`DMG ${(plain + floor).toFixed(1)}`);
      // a deck with any plating source plates its hull: PLATE ROLLER, SHIELD WALL, ARMOR PRESS, SEAM WELDER, or BASTION
      const plated: [string, Build][] = [
        ["plateroller", rolled(s)],
        ["shieldwall", withItem(bare, item(30, "shieldwall", 3, 4))],
        ["armorpress", withItem(kilnAnd("armorpress"), item(31, "platebreaker", 3, 2, 0, s))],
        ["seamwelder", withMod(bare, 50, "seamwelder")],
        ["bastion", withItem({ ...heroStartBuild("bastion", 1), hullBonus: 5000 }, item(31, "platebreaker", 3, 2, 0, s))],
      ];
      for (const [what, b] of plated) {
        legal(b, `${what} ★${s}`);
        expect(platedDeck(b), what).toBe(true);
        expect(hit(b).flat, `${what} ★${s}`).toBe(big);
        // F1 (B1): the belt panel's DMG: the walk with every breaker at its floor, then the walk as counted
        const lo = walkRoute(b, 0, undefined, { unplated: true }).estimate.dmg, hi = walkRoute(b, 0).estimate.dmg;
        expect(hi - lo, `${what} ★${s}`).toBe(big - floor); // NUM-1: whole (was toBeCloseTo(big - floor, 9))
        const rp = newRun(b.hero, 5, "b1-walk");
        rp.build = b;
        expect(beltPanel(rp, 0)!.headerOnly!.texts[2].split(",")[0], `${what} ★${s}`).toBe(`DMG ${lo.toFixed(1)}-${hi.toFixed(1)}`);
      }
      note(`walk-breaker | ★${s}: bare FURNACE walk +${hit(bare).flat}, DMG ${(plain + floor).toFixed(2)} (the belt panel: ${beltPanel(rn, 0)!.headerOnly!.texts[2].split(",")[0]}); with any plating source +${big}`);
    }
  });
});

// ------------------------------------------------------------------------------------------------------------ TWIN TRIGGER

describe("TWIN TRIGGER", () => {
  it("C-trigger-compound: TWIN TRIGGER's bonus applies to a COMPOUND BREECH shell that packs a paired load", () => {
    // the heavy gun at 2 stars with a COMPOUND BREECH, a HOPPER ★3 and TWIN TRIGGER, fed by the Kiln and a SHOT TOWER: a
    // shell packs the top two loads of the chamber, and some pack a paired load under an unpaired one (a stored pair drops
    // in, then a lone load enters). COMPOUND's window ignores the load time, so the deck without TWIN TRIGGER fires the
    // same shells on the same ticks: TWIN TRIGGER multiplies exactly the shells that carry a paired load.
    const base = withMod(withMod(cannon2(kilnAnd("shottower")), 51, "hopper", 0, 3), 52, "compound", 0);
    const o = chamber(base, 40).shots;
    for (const s of [1, 2, 3]) {
      const b = withMod(base, 50, "twintrigger", 0, s);
      legal(b, `★${s}`);
      const w = chamber(b, 40).shots, bonus = effectAt("twintrigger", s).mod!.pairBonus!;
      expect(w.map((x) => x.tick), `★${s}: the same shells`).toEqual(o.map((x) => x.tick));
      const under = w.filter((x) => !x.p.paired && x.p.compound?.paired);
      expect(under.length, `★${s}: shells packing a paired load under an unpaired one`).toBeGreaterThanOrEqual(5);
      w.forEach((x, i) => {
        const paired = !!x.p.paired || !!x.p.compound?.paired;
        // NUM-1 (REQ-BFG-047): TWIN TRIGGER's % rounds half up once (pct), so a shell is whole (was toBeCloseTo(o[i].dmg x
        // (paired ? 1 + bonus : 1), 9))
        expect(x.dmg, `★${s} shell ${i} (paired ${!!x.p.paired}, packs a paired load ${!!x.p.compound?.paired})`).toBe(paired ? pct(o[i].dmg, 100 * (1 + bonus)) : o[i].dmg);
      });
      const mains = w.filter((x) => x.p.paired).length, none = w.length - mains - under.length;
      note(`trigger-compound | ★${s}: ${w.length} shells in 40 s: ${mains} with a paired main load, ${under.length} packing a paired load under an unpaired one (e.g. ${o[w.indexOf(under[0])].dmg.toFixed(3)} -> ${under[0].dmg.toFixed(3)}), ${none} with none: x${1 + bonus} on the ${mains + under.length}`);
    }
  });
});

// ------------------------------------------------------------------------------------------------------------ SPALL CATCHER

describe("SPALL CATCHER", () => {
  it("C-spall-burn: burn that lands on the hull charges SPALL CATCHER, and burn the plating soaks counts twice", () => {
    // a FURNACE whose Kiln belt carries a TEMPER ★3 (4 Burn on each slug) shoots at our FURNACE, which has SPALL CATCHER on its
    // heavy gun and a PLATE ROLLER ★3 plating its hull. Each tick, before the dark wind: the charge is what it was (0 after a
    // shot) plus add x (the hull's loss + twice what the plating soaked) / 40 (NUM-1: was / 4), up to its max, burn ticks
    // included.
    const foe = withItem({ ...heroStartBuild("furnace", 101), hullBonus: 5000 }, rig(150, "temper", 3, 3, 1, 3));
    legal(foe, "the foe");
    for (const s of [1, 2, 3]) {
      const me = withMod(withItem(furnace(), rig(30, "plateroller", 3, 4, 1, 3)), 50, "spallcatcher", 0, s);
      legal(me, `★${s}`);
      const sp = effectAt("spallcatcher", s).mod!.spall!;
      const bt = new Battle(me, foe, SEED);
      const side = bt.sides[0], tu = side.turrets[0];
      let hp = side.hull.hp, soakedSoFar = side.plate.absorbed, charge = 0, burnTicks = 0, soakedBurnTicks = 0;
      while (bt.t < WIND_START - 1 && !bt.over) {
        bt.step();
        const ev = bt.drainEvents();
        const lost = hp - side.hull.hp, soaked = side.plate.absorbed - soakedSoFar;
        const shot = ev.some((e) => e.type === "fire" && e.side === 0), hit = ev.some((e) => e.type === "impact" && e.side === 0);
        const want = Math.min(sp.max, (shot ? 0 : charge) + (sp.add * (lost + 2 * soaked)) / sp.every);
        expect(tu.spallCharge!, `★${s} t ${bt.t.toFixed(3)}: lost ${lost}, soaked ${soaked}, hit ${hit}`).toBeCloseTo(want, 6);
        if (!hit && lost + soaked > 0) { // nothing landed but burn
          burnTicks++;
          if (soaked > 0) soakedBurnTicks++;
        }
        hp = side.hull.hp;
        soakedSoFar = side.plate.absorbed;
        charge = tu.spallCharge!;
      }
      // NUM-1 (REQ-BFG-047): a Burn now lands once a second (3 whole ticks a stack's 3 s), not on every tick, so this battle
      // has 42 burn-only ticks (16 Burn hits x 3, less the 6 due after 24 s), 8 of them soaked, where the base had 1,121 and
      // 172. The floors keep their share of that evidence (were > 300 of 1,121 and > 30 of 172: 300 x 42 / 1121 = 11.2,
      // 30 x 8 / 172 = 1.4)
      expect(burnTicks, `★${s}: ticks when only burn landed`).toBeGreaterThan(11);
      expect(soakedBurnTicks, `★${s}: ... and the plating soaked some`).toBeGreaterThan(1);
      note(`spall-burn | ★${s}: ${Math.round(bt.t * 60)} ticks checked; burn alone landed on ${burnTicks}, the plating soaking some on ${soakedBurnTicks}`);
    }
  });
});

// ------------------------------------------------------------------------------------------------------------ OVERCLOCKER

describe("OVERCLOCKER on wave 3's rigs (overclock.ts)", () => {
  /** An OVERCLOCKER (uid 29, shape II, ★1: once every 4 s) at (3,5), its east arrow on FURNACE's Kiln belt's tile 0. */
  const oc = (b: Build) => withItem(b, item(29, "overclocker", 3, 5, 0));

  it("C-oc-gauge: OVERCLOCKER doubles both of TWIN GAUGE's numbers, the plain one and the matched one", () => {
    for (const s of [1, 2, 3]) {
      const e = effectAt("twingauge", s).gate!;
      expect(boostable(e), `★${s}`).toBe(true);
      expect(overclocked(e).gauge, `★${s}`).toEqual({ flat: 2 * e.gauge!.flat, matched: 2 * e.gauge!.matched });
    }
    // in a battle, its next boostable rig: on FOUNDRY's matched belt the gauge adds 30, or 60 when boosted; on FURNACE's
    // unmatched belt 10, or 20. NUM-1 (REQ-BFG-047): TWIN GAUGE ★1's numbers read from the data, x10 (were the literals 3, 1)
    const g1 = effectAt("twingauge", 1).gate!.gauge!;
    const foundry = withItem(withItem({ ...heroStartBuild("foundry", 1), hullBonus: 5000 }, item(59, "overclocker", 1, 5, 0)), rig(60, "twingauge", 1, 3, 1));
    const furnaceG = withItem(oc(furnace()), rig(60, "twingauge", 3, 3, 1));
    for (const [what, b, booster, plain] of [["foundry", foundry, 59, g1.matched], ["furnace", furnaceG, 29, g1.flat]] as const) {
      legal(b, what);
      expect(new Battle(b, barge(), SEED).sides[0].gates.find((g) => g.uid === 60)!.boostedBy.map((x) => x.booster.uid), what).toEqual([booster]);
      const flats = crossings(b, 0, 2, 20, 1.8); // the gauge, the second rig on its belt, is online from 1.8 s
      expect(new Set(flats), what).toEqual(new Set([plain, 2 * plain]));
      expect(flats.filter((f) => f === 2 * plain).length, what).toBeGreaterThanOrEqual(3);
      note(`oc-gauge | ${what} (${plain === g1.matched ? "matched" : "unmatched"}): payloads past TWIN GAUGE ${flats.join(", ")}`);
    }
  });

  it("C-oc-plate: OVERCLOCKER can boost a plating rig (PLATE ROLLER, SHIELD WALL) and doubles the plating it rolls", () => {
    for (const id of ["plateroller", "shieldwall"]) for (const s of [1, 2, 3]) {
      const e = effectAt(id, s).gate!;
      expect(boostable(e), `${id} ★${s}`).toBe(true);
      expect(overclocked(e).plate, `${id} ★${s}`).toBe(2 * e.plate!);
    }
    // in a battle: the plating rig on the Kiln belt's tile 2 is the OVERCLOCKER's next boostable rig, and each boost rolls
    // twice the plating (the hull stays under the cap in 20 s)
    // NUM-1 (REQ-BFG-047): each rig's ★1 plating read from the data, x10 (were the literals 0.5 and 1; now 5, 10)
    for (const id of ["plateroller", "shieldwall"] as const) {
      const plate = effectAt(id, 1).gate!.plate!;
      const b = withItem(oc(furnace()), rig(30, id, 3, 3, 1)); // at (3,3), facing east onto (4,3)
      legal(b, id);
      expect(new Battle(b, barge(), SEED).sides[0].gates.find((g) => g.uid === 30)!.boostedBy.map((x) => x.booster.uid), id).toEqual([29]);
      const rolls = events(b, 20).filter((x) => x.e.type === "plate" && x.e.side === 0).map((x) => (x.e as { amount: number }).amount);
      expect(new Set(rolls), id).toEqual(new Set([plate, 2 * plate]));
      expect(rolls.filter((r) => r === 2 * plate).length, id).toBeGreaterThanOrEqual(3);
      expect(sum(rolls)).toBeLessThan(PLATE_CAP);
      note(`oc-plate | ${id}: rolls ${rolls.join(", ")}`);
    }
  });
});
