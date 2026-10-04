// 0.6.2 step 5 (REQ-BFG-031 turret slots, REQ-BFG-027 belt joins; M1): the stand-in codes carry Build.turrets and
// RouteDef.join. Both codecs, the loader's (src/sim/standInPool.ts encodeStarred / decodeStarredRaw / decodeStarred)
// and the harness's (src/sim/harness/standinCode.ts encodeStarred / decodeStarred), write the same code and read it back
// to the same deck. A deck without the two fields encodes exactly as the pre-step-5 encoder did (a frozen copy below),
// every committed pool code round-trips byte for byte, and a decoded stand-in with turrets and joins survives the
// GhostSnapshot v2 codec (src/net/snapshot.ts) unchanged.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Rng, hashSeed } from "../src/core/rng";
import { GRID, HEROES, ITEMS, RULES_VERSION, type HeroId } from "../src/sim/content";
import {
  cloneBuild, installTurret, key as K, rotOf, setJoin, setTurretList, startingTurrets, turretList, turretSlots,
  type Build, type BuildTurret,
} from "../src/sim/deck";
import { buildCost, unfusedPairs, validateBuild } from "../src/net/validate";
import * as net from "../src/net/snapshot";
import * as loader from "../src/sim/standInPool";
import * as harness from "../src/sim/harness/standinCode";
import { STAND_IN_DATA } from "../src/sim/standInPoolData";
import { STAND_IN_DATA as V11 } from "./fixtures/standInPoolData.v1.1";
import { randomBuild } from "../src/sim/harness/gen";
import { HARNESS_HEROES } from "../src/sim/harness/heroes";
import { playerBuild } from "../src/sim/harness/player";
import { startingBuild } from "../src/sim/ai";
import { starsOf } from "../src/sim/stars";

// ---------------------------------------------------------------- oracles

/** The star-aware encoder exactly as it was before step 5 (62318f4), frozen: a deck without turrets and joins must
 *  encode byte for byte as it did. */
function legacyEncode(b: Build): string {
  const cell = (x: number, y: number) => `${y}${x}`;
  const suf = (p: { stars?: number }) => (starsOf(p) > 1 ? `*${starsOf(p)}` : "");
  const no = new Map<number, number>();
  const items = b.items.map((p, i) => {
    no.set(p.uid, i + 1);
    const rot = rotOf(p);
    return `${p.def}${cell(p.x, p.y)}${rot ? `r${rot}` : ""}${suf(p)}`;
  });
  const routes = b.routes.map((r) => `${no.get(r.factory)}:${r.cells.map((k) => cell(k % GRID, Math.floor(k / GRID))).join("")}`);
  const mods = b.mods.map((m) => `${m.def}${m.turret}${suf(m)}`);
  return `${b.beltCap} ${b.hullBonus}/${items.join(" ")}/${routes.join(" ")}/${mods.join(" ")}`;
}

/** THE normalisation, restated from the grammar (the codecs' header): items get uids 1..n, routes follow their factory,
 *  mods n+1..n+m; a free turret copy of def d takes d's starting uids (TURRET_UID0 + slot) in slot order, every other
 *  turret follows the mods; the turret list goes through setTurretList (slot order, no field for the starting layout). */
function normalise(b: Build): Build {
  const c = cloneBuild(b);
  const no = new Map<number, number>();
  c.items.forEach((p, i) => { no.set(p.uid, i + 1); p.uid = i + 1; });
  for (const r of c.routes) r.factory = no.get(r.factory)!;
  c.mods.forEach((m, j) => { m.uid = c.items.length + j + 1; });
  if (c.turrets) {
    const own = new Map<string, number[]>();
    for (const t of startingTurrets(c.hero)) own.set(t.def, [...(own.get(t.def) ?? []), t.uid]);
    let next = c.items.length + c.mods.length;
    const list: BuildTurret[] = [...c.turrets].sort((x, y) => x.slot - y.slot)
      .map((t) => ({ ...t, uid: (t.free ? own.get(t.def)?.shift() : undefined) ?? ++next }));
    setTurretList(c, list);
  }
  return c;
}

/** validateBuild's verdict with uids masked (the code renumbers them). */
const verdict = (b: Build, day: number) => {
  const v = validateBuild(b, day);
  return { ok: v.ok, errors: v.errors.map((e) => e.replace(/uid \d+/g, "uid #")) };
};

/** Everything M1 asks of one deck: the two codecs write the same code; it decodes (both codecs, the loader's load
 *  boundary too) to normalise(b); it is canonical; validateBuild's verdict is the same; the fields survive. */
function roundTrip(name: string, b: Build, day: number, legal: boolean): string {
  const code = loader.encodeStarred(b);
  expect(harness.encodeStarred(b), `${name}: the two encoders`).toBe(code);
  const raw = loader.decodeStarredRaw(b.hero, code), h = harness.decodeStarred(b.hero, code), load = loader.decodeStarred(b.hero, code);
  expect(JSON.stringify(h), `${name}: the two decoders`).toBe(JSON.stringify(raw));
  expect(JSON.stringify(load), `${name}: the loader's load boundary (nothing to migrate)`).toBe(JSON.stringify(raw));
  expect(raw, `${name}: decode(encode(b)) = b after normalisation`).toEqual(normalise(b));
  expect(loader.encodeStarred(raw), `${name}: canonical`).toBe(code);
  expect(harness.encodeStarred(h), `${name}: canonical (harness)`).toBe(code);
  expect(verdict(raw, day), `${name}: validateBuild's verdict`).toEqual(verdict(b, day));
  expect(verdict(b, day).ok, `${name}: ${validateBuild(b, day).errors.join("; ")}`).toBe(legal);
  expect(buildCost(raw), `${name}: cost`).toEqual(buildCost(b));
  expect(unfusedPairs(raw)).toEqual(unfusedPairs(b));
  // the fields themselves: every installed turret (slot, def, stars, free) and every join
  const t = (x: Build) => turretList(x).map((y) => [y.slot, y.def, starsOf(y), !!y.free].join());
  expect(t(raw), `${name}: turrets`).toEqual(t(b));
  expect(raw.routes.map((r) => r.join), `${name}: joins`).toEqual(b.routes.map((r) => r.join));
  return code;
}

// ---------------------------------------------------------------- fixtures (legal unless named otherwise)

// FURNACE, as tests/joins.turrets.test.ts: the KILN's belt M up column 4 into slot 0 (SCRAP CANNON); a STAMP PRESS
// (uid 2, at 6,6) whose belt P runs up column 8 into the EXTRA slot (slot 1, columns 8-9); a SLAG POT (uid 3, at 8,8)
// whose belt J runs up column 9 and joins P at (8,4); a DOUBLE STAMP (uid 4, at 0,6) whose belt R joins M at (4,4).
const M = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const P = [K(8, 6), K(8, 5), K(8, 4), K(8, 3), K(8, 2), K(8, 1), K(8, 0)];
const J = [K(9, 7), K(9, 6), K(9, 5), K(9, 4)];
const R = [K(2, 6), K(2, 5), K(2, 4), K(3, 4)];
const CRATE = ITEMS.beltcrate.supply!.belt!;
const capFor = (hero: HeroId, cells: number) => HEROES[hero].belt + CRATE * Math.max(0, Math.ceil((cells - HEROES[hero].belt) / CRATE));

function furnace(o: { press?: boolean; slag?: boolean; stamp?: boolean } = {}): Build {
  const items = [{ uid: 1, def: "kiln", x: 4, y: 6 }];
  const routes: Build["routes"] = [{ factory: 1, cells: [...M] }];
  if (o.press) { items.push({ uid: 2, def: "press", x: 6, y: 6 }); routes.push({ factory: 2, cells: [...P] }); }
  if (o.slag) { items.push({ uid: 3, def: "slagpot", x: 8, y: 8 }); routes.push({ factory: 3, cells: [...J] }); }
  if (o.stamp) { items.push({ uid: 4, def: "doublestamp", x: 0, y: 6 }); routes.push({ factory: 4, cells: [...R] }); }
  const cells = routes.reduce((s, r) => s + r.cells.length, 0);
  return { hero: "furnace", items, routes, mods: [], beltCap: capFor("furnace", cells), hullBonus: 0 };
}
const install = (b: Build, uid: number, def: string, slot: number, extra: { stars?: number; free?: boolean } = {}): Build => {
  expect(installTurret(b, { uid, def, ...extra }, slot).ok, `${def} into slot ${slot}`).toBe(true);
  return b;
};
const join = (b: Build, route: number, cell: number): Build => {
  expect(setJoin(b, route, cell), `route ${route} joins ${cell}`).toBeNull();
  return b;
};

describe("M1: the stand-in codes carry turrets and joins (both codecs)", () => {
  it("(a) a bought turret in the empty extra slot", () => {
    const b = install(furnace({ press: true }), 500, "deckgun", 1);
    expect(b.turrets).toEqual([...startingTurrets("furnace"), { slot: 1, def: "deckgun", uid: 500 }]);
    const code = roundTrip("(a) FURNACE DECK GUN in slot 1", b, 3, true);
    expect(code).toBe("14 0/kiln64 press66/1:544434241404 2:68584838281808//scrapcannon0! deckgun1");
    expect(loader.decodeStarredRaw("furnace", code).turrets).toEqual([{ slot: 0, def: "scrapcannon", uid: 90, free: true }, { slot: 1, def: "deckgun", uid: 3 }]);
    // WEAVER: a TWIN NEEDLE into its empty slot 3 (columns 6-7), no belt: an installed, idle turret is legal
    const w = install(startingBuild("weaver", 1), 500, "twinneedle", 3);
    expect(roundTrip("(a) WEAVER TWIN NEEDLE in slot 3", w, 2, true)).toMatch(/\/dartgun0! dartgun1! dartgun2! twinneedle3$/);
    // an epic RAIL GUN (10 g) on day 1 (8 g): both copies are refused alike
    const rail = install(startingBuild("weaver", 1), 500, "railgun", 3);
    expect(roundTrip("(a) over budget", rail, 1, false)).toMatch(/\/dartgun0! dartgun1! dartgun2! railgun3$/);
  });

  it("(b) a swapped starting turret (the starting copy goes to cargo)", () => {
    const b = install(furnace(), 500, "bombard", 0);
    expect(b.turrets).toEqual([{ slot: 0, def: "bombard", uid: 500 }]);
    expect(roundTrip("(b) FURNACE BOMBARD for the SCRAP CANNON", b, 1, true)).toBe("14 0/kiln64/1:544434241404//bombard0");
    const w = install(startingBuild("weaver", 1), 500, "twinneedle", 1);
    expect(roundTrip("(b) WEAVER TWIN NEEDLE for the middle DART GUN", w, 2, true)).toMatch(/\/dartgun0! twinneedle1 dartgun2!$/);
    // the swapped-out starting copy moved into the extra slot keeps being free: "!" in slot 3
    const m = cloneBuild(w);
    setTurretList(m, [...turretList(m), { slot: 3, def: "dartgun", uid: 91, free: true }]);
    expect(roundTrip("(b) the DART GUN moved to slot 3", m, 2, true)).toMatch(/\/dartgun0! twinneedle1 dartgun2! dartgun3!$/);
  });

  it("(c) stars and free copies: a merged starting turret, a starred bought turret, free copies moved between slots", () => {
    const b = furnace();
    setTurretList(b, [{ slot: 0, def: "scrapcannon", uid: 90, stars: 2, free: true }]);
    expect(roundTrip("(c) FURNACE SCRAP CANNON 2 stars (free)", b, 1, true)).toBe("14 0/kiln64/1:544434241404//scrapcannon0*2!");
    const w = startingBuild("weaver", 1);
    // WEAVER: its three free DART GUNs at 2, 1 and 3 stars in slots 2, 1 and 0 (uids out of slot order), a bought
    // 2-star TWIN NEEDLE in slot 3
    setTurretList(w, [
      { slot: 0, def: "dartgun", uid: 92, stars: 3, free: true }, { slot: 1, def: "dartgun", uid: 91, free: true },
      { slot: 2, def: "dartgun", uid: 90, stars: 2, free: true }, { slot: 3, def: "twinneedle", uid: 501, stars: 2 },
    ]);
    const code = roundTrip("(c) WEAVER stars and free copies", w, 10, true);
    expect(code).toMatch(/\/dartgun0\*3! dartgun1! dartgun2\*2! twinneedle3\*2$/);
    // the free copies' uids are normalised to the starting uids in slot order
    expect(loader.decodeStarredRaw("weaver", code).turrets!.map((t) => t.uid)).toEqual([90, 91, 92, w.items.length + w.mods.length + 1]);
    // two free copies of a def FURNACE doesn't start with, and a bought copy beside a free one of the same stars:
    // shape round-trips, validateBuild refuses both copies alike
    const bad = furnace({ press: true });
    setTurretList(bad, [{ slot: 0, def: "scrapcannon", uid: 90, free: true }, { slot: 1, def: "scrapcannon", uid: 500 }]);
    roundTrip("(c) an unfused SCRAP CANNON pair", bad, 10, false);
    const bad2 = furnace({ press: true });
    setTurretList(bad2, [{ slot: 0, def: "scrapcannon", uid: 90, free: true }, { slot: 1, def: "dartgun", uid: 91, free: true }]);
    roundTrip("(c) a free DART GUN on FURNACE", bad2, 10, false);
  });

  it("(d) cores and gear on an installed turret (Build.mods, ModPlacement.turret = the slot)", () => {
    const b = install(furnace({ press: true }), 500, "deckgun", 1);
    b.mods.push({ uid: 501, def: "chamber", turret: 0 }, { uid: 502, def: "rotary", turret: 1 }, { uid: 503, def: "hopper", turret: 1 }, { uid: 504, def: "calibrate", turret: 1, stars: 2 });
    expect(turretSlots(b)[1].gearSlots).toBe(2);
    const code = roundTrip("(d) DECK GUN with a core and two gear", b, 10, true);
    expect(code).toBe("14 0/kiln64 press66/1:544434241404 2:68584838281808/chamber0 rotary1 hopper1 calibrate1*2/scrapcannon0! deckgun1");
    // the turret's uid follows the mods: items 1-2, mods 3-6, the DECK GUN 7
    expect(loader.decodeStarredRaw("furnace", code).turrets![1].uid).toBe(7);
    // gear beyond the gear slots, and gear on the empty extra slot: refused alike
    const over = cloneBuild(b);
    over.mods.push({ uid: 505, def: "mantlet", turret: 1 });
    roundTrip("(d) three gear on a 2-slot turret", over, 10, false);
    const empty = furnace({ press: true });
    empty.mods.push({ uid: 501, def: "hopper", turret: 1 });
    roundTrip("(d) gear on the empty extra slot", empty, 10, false);
  });

  it("(e) one join and two joins (and a stale join, refused alike)", () => {
    const one = install(join(furnace({ press: true, slag: true }), 2, K(8, 4)), 500, "carronade", 1);
    const c1 = roundTrip("(e) one join: J into P", one, 10, true);
    expect(c1).toBe("18 0/kiln64 press66 slagpot88/1:544434241404 2:68584838281808 3:79695949>48//scrapcannon0! carronade1");
    const two = join(furnace({ stamp: true }), 1, K(4, 4)); // R into M: FURNACE's own slot, no turret field
    expect(two.turrets).toBeUndefined();
    expect(roundTrip("(e) one join, starting layout", two, 1, true)).toBe("14 0/kiln64 doublestamp60/1:544434241404 2:62524243>44/");
    const both = install(join(join(furnace({ press: true, slag: true, stamp: true }), 2, K(8, 4)), 3, K(4, 4)), 500, "carronade", 1);
    const c2 = roundTrip("(e) two joins", both, 10, true);
    expect(c2.match(/>\d\d/g)).toEqual([">48", ">44"]);
    const stale = cloneBuild(one);
    stale.routes[2].join = K(0, 0); // no belt there: validateBuild refuses the join, the code keeps it as written
    roundTrip("(e) a join tile off every belt", stale, 10, false);
  });

  it("(f) turrets and joins together: a 2-star starting turret, a bought turret in the extra slot, two joins, gear", () => {
    const b = join(join(furnace({ press: true, slag: true, stamp: true }), 2, K(8, 4)), 3, K(4, 4));
    install(b, 500, "carronade", 1);
    setTurretList(b, turretList(b).map((t) => (t.slot === 0 ? { ...t, stars: 2 } : t)));
    b.mods.push({ uid: 501, def: "hopper", turret: 1 }, { uid: 502, def: "gatling", turret: 0 });
    const code = roundTrip("(f) turrets and joins", b, 10, true);
    expect(code).toBe("22 0/kiln64 press66 slagpot88 doublestamp60/1:544434241404 2:68584838281808 3:79695949>48 4:62524243>44/hopper1 gatling0/scrapcannon0*2! carronade1");
  });

  it("the header examples decode, validate and re-encode to themselves", () => {
    for (const [hero, code, day] of [
      ["furnace", "14 0/kiln64/1:544434241404//scrapcannon0*2!", 1],
      ["furnace", "14 0/kiln64 press66/1:544434241404 2:68584838281808/calibrate0 hopper1/scrapcannon0! deckgun1", 10],
      ["furnace", "18 0/kiln64 press66 slagpot88/1:544434241404 2:68584838281808 3:79695949>48//scrapcannon0! carronade1", 10],
    ] as const) {
      for (const decode of [loader.decodeStarredRaw, harness.decodeStarred]) {
        const b = decode(hero, code);
        expect(validateBuild(b, day).errors, code).toEqual([]);
        expect(loader.encodeStarred(b)).toBe(code);
      }
    }
  });
});

describe("M1: absent fields encode exactly as before, and older codes decode exactly as before", () => {
  it("all 120 committed pool codes: both codecs decode them alike and re-encode them byte for byte (pool v2.1: no turret section, no join)", () => {
    // Pool v2.1 (the full-purse pool, whose header predates --source) holds no turrets and no joins, and the frozen
    // pre-step-5 encoder wrote every code. A caravan-bound pool (the step-5 regen: its header prints --source) may carry
    // both: its codes must still decode alike in both codecs and re-encode byte for byte, a fifth section exactly when
    // the deck carries Build.turrets, and every code without turrets or joins as the frozen encoder writes it.
    // bb-0.8.3 (REQ-BFG-043 D7'; the pool regenerated in BELTS run 5): a pick that bought gold upgrades carries the
    // levels' head word " u<t><f>", which the frozen encoder predates: such a code is the frozen encoder's but that word.
    const legacy = !readFileSync(new URL("../src/sim/standInPoolData.ts", import.meta.url), "utf8").split("\n")[1].includes("--source");
    let n = 0, turreted = 0, joined = 0;
    for (const hero of loader.STAND_IN_POOL_HEROES) {
      for (let day = 1; day <= 10; day++) {
        for (const t of STAND_IN_DATA.pools[hero]![day - 1][1]) {
          const code = t[3];
          const raw = loader.decodeStarredRaw(hero, code), h = harness.decodeStarred(hero, code);
          expect(JSON.stringify(h)).toBe(JSON.stringify(raw));
          expect(JSON.stringify(loader.decodeStarred(hero, code))).toBe(JSON.stringify(raw)); // pool v2.1 on is native
          expect(loader.encodeStarred(raw)).toBe(code);
          expect(harness.encodeStarred(h)).toBe(code);
          const fifth = code.split("/").length === 5, join = raw.routes.some((r) => r.join !== undefined);
          expect(code.split("/").length === 4 || fifth, code).toBe(true);
          expect(raw.turrets !== undefined, code).toBe(fifth);
          if (!fifth && !join) expect(legacyEncode(raw)).toBe(raw.upgrades ? code.replace(/^(\S+ \S+) u[1-4][1-4]\//, "$1/") : code);
          if (fifth) turreted++;
          if (join) joined++;
          n++;
        }
      }
    }
    expect(n).toBe(120);
    if (legacy) expect([turreted, joined]).toEqual([0, 0]); // pool v2.1: every code is the frozen encoder's (above)
  });

  it("decks without turrets or joins encode as the frozen pre-step-5 encoder does: v1.1 decks, random builds of every hero, par-player decks", () => {
    let n = 0;
    const check = (b: Build) => {
      expect(loader.encodeStarred(b)).toBe(legacyEncode(b));
      expect(harness.encodeStarred(b)).toBe(legacyEncode(b));
      n++;
    };
    for (const [hero, days] of Object.entries(V11.pools)) for (const d of days!) for (const t of d[1]) check(loader.decodeStandInRaw(hero as HeroId, t[3]));
    for (const hero of HARNESS_HEROES) for (const day of [1, 4, 7, 10]) for (let i = 0; i < 4; i++) check(randomBuild(hero, day, new Rng(hashSeed("m1-legacy", hero, day, i)), "on"));
    // 0.6.2 CAND-A: the par player also draws joins, so only its decks without turrets and without joins qualify;
    // bb-0.8.3 (REQ-BFG-043 D7'): and it buys gold upgrades (the code's "u<t><f>" head word), so without levels too
    let par = 0;
    for (const hero of ["furnace", "weaver"] as const) for (const day of [1, 5, 10]) for (let s = 1; s <= 12; s++) {
      const b = playerBuild(hero, day, s);
      if (!b.turrets && !b.routes.some((r) => r.join !== undefined) && !b.upgrades) { check(b); par++; }
    }
    expect(par).toBeGreaterThanOrEqual(12);
    expect(n).toBe(120 + 96 + par);
  });

  it("a Build.turrets list that encodes like the starting layout (a WEAVER swap of two free DART GUNs) writes no section and decodes to no field", () => {
    const w = startingBuild("weaver", 1);
    setTurretList(w, [{ slot: 0, def: "dartgun", uid: 91, free: true }, { slot: 1, def: "dartgun", uid: 90, free: true }, { slot: 2, def: "dartgun", uid: 92, free: true }]);
    expect(w.turrets).toBeDefined(); // the uids differ from the start
    const code = loader.encodeStarred(w);
    expect(code).toBe(legacyEncode(w));
    expect(harness.encodeStarred(w)).toBe(code);
    expect(loader.decodeStarredRaw("weaver", code).turrets).toBeUndefined();
    expect(loader.decodeStarredRaw("weaver", code)).toEqual(normalise(w));
    // an explicit starting-layout section (never written by the encoders) decodes to no field too
    expect(loader.decodeStarredRaw("furnace", "14 0/kiln64/1:544434241404//scrapcannon0!").turrets).toBeUndefined();
    // an empty section is a deck with every slot empty
    const bare = loader.decodeStarredRaw("furnace", "14 0/kiln64/1:544434241404//");
    expect(bare.turrets).toEqual([]);
    expect(loader.encodeStarred(bare)).toBe("14 0/kiln64/1:544434241404//");
  });

  it("malformed turret words and joins are refused alike by both decoders; the v1 codec refuses turrets and joins", () => {
    const thrown = (f: () => unknown) => { try { f(); } catch (e) { return (e as Error).message; } return "no error"; };
    const at = (turrets: string) => `14 0/kiln64/1:544434241404/calibrate0/${turrets}`;
    for (const w of ["deckgun", "deckgun1*4", "deckgun1*1", "deckgun1!!", "deckgun1!*2", "kiln1", "calibrate1", "nosuch1", "Deckgun1", "deckgun1 x"]) {
      const want = `stand-in code: bad turret "${w.split(" ").find((x) => !/^deckgun1$/.test(x)) ?? w}"`;
      expect(thrown(() => loader.decodeStarredRaw("furnace", at(w))), w).toBe(want);
      expect(thrown(() => harness.decodeStarred("furnace", at(w))), w).toBe(want);
    }
    for (const r of ["1:544434241404>4", "1:544434241404>445", "1:544434241404>", "1:544434241404>44*2", "1:544434241404j44"]) {
      const code = `14 0/kiln64/${r}/`;
      expect(thrown(() => loader.decodeStarredRaw("furnace", code)), r).toBe(`stand-in code: bad route "${r}"`);
      expect(thrown(() => harness.decodeStarred("furnace", code)), r).toBe(`stand-in code: bad route "${r}"`);
    }
    const six = "14 0/kiln64/1:544434241404//scrapcannon0*2!/x";
    expect(thrown(() => loader.decodeStarredRaw("furnace", six))).toMatch(/more than five sections/);
    expect(thrown(() => harness.decodeStarred("furnace", six))).toMatch(/more than five sections/);
    // the encoders refuse what they can't write
    const b = furnace();
    b.routes[0].join = 100;
    expect(thrown(() => loader.encodeStarred(b))).toBe("stand-in code: route join 100 is not a cell key 0..99");
    expect(thrown(() => harness.encodeStarred(b))).toBe("stand-in code: route join 100 is not a cell key 0..99");
    // v1 (the stars-off audit codec) has no place for either field: it refuses them instead of dropping them
    const v1 = "stand-in code: the v1 code carries no turrets and no belt joins (use encodeStarred / decodeStarred)";
    expect(thrown(() => loader.encodeStandIn(install(furnace(), 500, "bombard", 0)))).toBe(v1);
    expect(thrown(() => loader.encodeStandIn(join(furnace({ stamp: true }), 1, K(4, 4))))).toBe(v1);
    expect(thrown(() => loader.decodeStandInRaw("furnace", "14 0/kiln64/1:544434241404//bombard0"))).toBe(v1);
    expect(thrown(() => loader.decodeStandIn("furnace", "14 0/kiln64 doublestamp60/1:544434241404 2:62524243>44/"))).toBe('stand-in code: bad route "2:62524243>44"');
  });
});

describe("M1: a decoded stand-in with turrets and joins goes through GhostSnapshot v2 unchanged", () => {
  it("src/net/snapshot.ts encode then decode: the same deck, the same stand-in code", () => {
    const b = join(join(furnace({ press: true, slag: true, stamp: true }), 2, K(8, 4)), 3, K(4, 4));
    install(b, 500, "carronade", 1);
    setTurretList(b, turretList(b).map((t) => (t.slot === 0 ? { ...t, stars: 2 } : t)));
    b.mods.push({ uid: 501, def: "hopper", turret: 1 });
    const code = loader.encodeStarred(b);
    const standIn = loader.decodeStarred("furnace", code); // the game's load boundary
    expect(standIn.turrets).toHaveLength(2);
    expect(standIn.routes.filter((r) => r.join !== undefined)).toHaveLength(2);
    const snap: net.GhostSnapshot = { v: 2, rules: RULES_VERSION, hero: "furnace", day: 10, wins: 9, lives: 3, build: standIn, runId: "standin-m1", playerId: "standin", createdAt: 1_790_000_000_000 };
    const text = net.encodeSnapshot(snap);
    const back = net.decodeSnapshot(text);
    expect(back.build).toEqual(standIn);
    expect(net.encodeSnapshot(back)).toBe(text);
    expect(loader.encodeStarred(back.build)).toBe(code);
    expect(validateBuild(back.build, 10).errors).toEqual([]);
    expect(text).toContain('"join":48');
    expect(text).toContain('"turrets":[{"slot":0,"def":"scrapcannon","uid":90,"stars":2,"free":true},{"slot":1,"def":"carronade","uid":6}]');
  });
});
