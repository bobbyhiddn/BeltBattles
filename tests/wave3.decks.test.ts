// 0.8.0 P1 (BRIEF-wave3-P1 M3: "No star is weaker, so KNOWN_FALLS stays empty"; REQ-BFG-019): the deck-level merge check of
// tests/arsenal.decks.test.ts, for the 15 wave-3 modules. Each module goes into a hero deck that uses it (DESIGN-wave3.md
// 3.3's six-hero lines), at 1, 2 and 3 stars, and fights another hero over 5 seeds. Both sides carry +3000 hull, so every
// fight runs its full 120 s and damage dealt measures what the deck puts out (a won fight's damage is only the foe's hull
// plus overkill). Mean damage dealt must not fall by more than 3% from 1 star to 2 to 3, and the module's own measure
// (plating gained, stall seconds saved, stamps) must not fall at all. There is no allowlist: tests/arsenal.decks.test.ts's
// KNOWN_FALLS stays empty and no wave-3 row needs one. BB_TABLES=1 prints the table and the report-only rows (REPORT.md).
import { describe, expect, it } from "vitest";
import { Battle, type SimEvent } from "../src/sim/battle";
import { spotForTile, stokeSpots } from "../src/sim/beltside";
import { rigHits, type Build } from "../src/sim/deck";
import { rateDeck } from "../src/sim/deckRating";
import { heroRefBuild, heroStartBuild } from "../src/sim/heroBuilds";
import { K, item, latchDeck, withItem, withMod } from "./wave3.helpers";

const SEEDS = [1, 2, 3, 4, 5];
const clone = (b: Build): Build => JSON.parse(JSON.stringify(b)) as Build;

/** A rig of `def` at `stars` working the first fitting tile of `tiles` on belt `route`, at the editor's spot. */
function rig(b: Build, def: string, stars: number, route = 0, tiles: number[] = [2, 3, 1, 4, 0, 5], uid = 70): Build {
  const out = clone(b);
  for (const ti of tiles) {
    const spot = spotForTile(out, def, route, ti);
    if (!spot) continue;
    out.items.push(item(uid, def, spot.x, spot.y, spot.rot, stars));
    if ((rigHits(out)[route]?.[ti] ?? []).some((h) => h.uid === uid)) return out;
    out.items.pop();
  }
  throw new Error(`${b.hero}: no spot for ${def}`);
}

/** A shock-heavy foe for the guards: WEAVER's start deck with a GALVANIC COIL ★3 on its first belt. */
function shocker(): Build {
  const b = rig(heroStartBuild("weaver", 101), "coil", 3, 0, [1, 2, 0, 3], 801);
  b.hullBonus = 200;
  return b;
}

interface Case { id: string; deck: string; foe: string; at: (stars: number) => Build; vs: () => Build; own?: (bt: Battle, ev: SimEvent[]) => number }
interface Row { dmg: number; own: number; wins: number }

const furnaceStart = () => heroStartBuild("furnace", 1);
const weaverStart = () => heroStartBuild("weaver", 101);
const furnaceFoe = () => heroStartBuild("furnace", 101);
const plateGain = (_bt: Battle, ev: SimEvent[]) => ev.reduce((s, e) => s + (e.type === "plate" && e.side === 0 && e.amount > 0 ? e.amount : 0), 0);

export const CASES: Case[] = [
  { id: "plateroller", deck: "FURNACE ref day 6 + roller", foe: "WEAVER ref day 6", at: (s) => rig(heroRefBuild("furnace", 6), "plateroller", s), vs: () => heroRefBuild("weaver", 6), own: plateGain },
  { id: "twingauge", deck: "FOUNDRY start + gauge (matched)", foe: "WEAVER start", at: (s) => rig(heroStartBuild("foundry", 1), "twingauge", s), vs: weaverStart },
  { id: "pincer", deck: "FURNACE start + pincer + whetstone", foe: "WEAVER start",
    at: (s) => withItem(withItem(furnaceStart(), item(70, "pincer", 3, 3, 1, s)), item(71, "whetstone", 5, 3, 3)), vs: weaverStart },
  { id: "braceframe", deck: "WEAVER start + brace", foe: "WEAVER start + coil ★3", at: (s) => rig(heroStartBuild("weaver", 1), "braceframe", s, 1), vs: shocker,
    own: (_bt, ev) => ev.reduce((x, e) => x + (e.type === "brace" && e.side === 0 ? e.saved : 0), 0) },
  { id: "twinlatch", deck: "two presses + latch", foe: "WEAVER start", at: (s) => withItem({ ...latchDeck(), hullBonus: 0 }, item(70, "twinlatch", 4, 3, 0, s)), vs: weaverStart },
  // STOKER on WEAVER's Loom (three light guns with room); its capped rows (FURNACE's Kiln, a shared gun) are below
  { id: "stoker", deck: "WEAVER start + stoker on the Loom", foe: "FURNACE start", at: (s) => stokedLoom(s), vs: furnaceFoe,
    own: (_bt, ev) => ev.filter((e) => e.type === "produce" && e.side === 0).length },
  { id: "platebreaker", deck: "BASTION start + breaker", foe: "FURNACE start", at: (s) => rig(heroStartBuild("bastion", 1), "platebreaker", s), vs: furnaceFoe },
  { id: "shieldwall", deck: "BASTION ref day 6 + shield wall", foe: "FURNACE ref day 6", at: (s) => rig(heroRefBuild("bastion", 6), "shieldwall", s), vs: () => heroRefBuild("furnace", 6), own: plateGain },
  { id: "twinmould", deck: "FURNACE, mould on both connectors", foe: "WEAVER start", at: (s) => mouldFurnace(s), vs: weaverStart },
  { id: "armorpress", deck: "FURNACE start + press on connector 5", foe: "WEAVER start", at: (s) => pressFurnace(s), vs: weaverStart, own: plateGain },
  { id: "anvil", deck: "BASTION start + anvil", foe: "FURNACE start", at: (s) => withMod(heroStartBuild("bastion", 1), 70, "anvil", 0, s), vs: furnaceFoe },
  { id: "steambreech", deck: "BASTION start + steam", foe: "FURNACE start", at: (s) => withMod(heroStartBuild("bastion", 1), 70, "steambreech", 0, s), vs: furnaceFoe },
  { id: "twintrigger", deck: "FOUNDRY start + trigger on gun 1", foe: "WEAVER start", at: (s) => withMod(heroStartBuild("foundry", 1), 70, "twintrigger", 0, s), vs: weaverStart },
  { id: "spallcatcher", deck: "FURNACE start + spall", foe: "WEAVER start", at: (s) => withMod(furnaceStart(), 70, "spallcatcher", 0, s), vs: weaverStart },
  { id: "seamwelder", deck: "FOUNDRY start + seam on gun 1", foe: "WEAVER start", at: (s) => withMod(heroStartBuild("foundry", 1), 70, "seamwelder", 0, s), vs: weaverStart, own: plateGain },
];

/** WEAVER's start deck with a STOKER at the editor's best spot beside the Loom. */
function stokedLoom(stars: number): Build {
  const b = heroStartBuild("weaver", 1);
  const sp = stokeSpots(b, "stoker")[0];
  if (!sp) throw new Error("no STOKER spot beside the Loom");
  return withItem(b, item(70, "stoker", sp.x, sp.y, sp.rot, stars));
}

/** FURNACE's start deck with its Kiln belt drawn to 8 tiles (the hero card's advice: the breech fires every 0.72 s). */
function longKiln(): Build {
  const b = furnaceStart();
  b.routes[0].cells = [K(4, 5), K(3, 5), K(3, 4), K(3, 3), K(3, 2), K(3, 1), K(4, 1), K(4, 0)];
  return b;
}

/** LOCKJAW's layout (DESIGN-wave3.md 5.3): an 8-tile Kiln belt into connector 4 and a TWIN MOULD belt of 8 into 5. */
function lockjaw(): Build {
  return {
    hero: "furnace", items: [{ uid: 1, def: "kiln", x: 2, y: 6 }, { uid: 2, def: "twinmould", x: 6, y: 6 }],
    routes: [
      { factory: 1, cells: [K(2, 5), K(3, 5), K(3, 4), K(3, 3), K(3, 2), K(3, 1), K(4, 1), K(4, 0)] },
      { factory: 2, cells: [K(7, 5), K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] },
    ], mods: [], beltCap: 30, hullBonus: 0,
  };
}

/** STOKER's capped rows (oracle a0e94bc69949561f): each deck with no stoker, then a STOKER at (x, y) at 1-3 stars. */
interface CapRow { id: string; base: () => Build; x: number; y: number; foe: () => Build; rises: boolean }
export const STOKER_ROWS: CapRow[] = [
  // the trap the cap closes: the stoked Kiln outran the heavy gun (1.0 s) from 2 stars and jammed (655 / 776 / 577 / 563)
  { id: "FURNACE start, 6-tile Kiln", base: furnaceStart, x: 6, y: 6, foe: weaverStart, rises: false },
  // the gun has room (0.72 s): the cap never binds, the numbers are the uncapped ones (743 / 874 / 1,044 / 1,228)
  { id: "FURNACE, 8-tile Kiln", base: longKiln, x: 6, y: 6, foe: weaverStart, rises: true },
  // a shared gun that is full (Kiln and mould use 98% of it): the stoke leaves it be, on either factory
  { id: "shared gun, STOKER on the Kiln", base: lockjaw, x: 1, y: 6, foe: weaverStart, rises: false },
  { id: "shared gun, STOKER on the mould", base: lockjaw, x: 8, y: 6, foe: weaverStart, rises: false },
  // a shared gun with room (CALIBRATION ★3): the stoke works within it
  { id: "shared gun with room, STOKER on the mould", base: () => withMod(lockjaw(), 60, "calibrate", 0, 3), x: 8, y: 6, foe: weaverStart, rises: true },
];

/** Mean damage dealt and jams over the seeds (both sides +3000 hull): no stoker, then 1, 2 and 3 stars. */
function capRows(r: CapRow): { dmg: number; jams: number }[] {
  return [0, 1, 2, 3].map((s) => {
    let dmg = 0, jams = 0;
    for (const seed of SEEDS) {
      const b = s ? withItem(r.base(), item(70, "stoker", r.x, r.y, 0, s)) : r.base();
      const bt = new Battle(sturdy(b), sturdy(r.foe()), seed);
      while (!bt.over && bt.ticks < 60 * 200) { bt.step(); bt.events.length = 0; }
      dmg += bt.sides[0].stats.damage;
      jams += bt.sides[0].stats.jams;
    }
    return { dmg: dmg / SEEDS.length, jams: jams / SEEDS.length };
  });
}

/** FURNACE with a TWIN MOULD (uid 70) at (4,6) on both heavy connectors; the Kiln parked off any belt. */
function mouldFurnace(stars: number): Build {
  const b = furnaceStart();
  const kiln = b.items.find((p) => p.def === "kiln")!;
  kiln.x = 0;
  kiln.y = 8;
  b.items.push(item(70, "twinmould", 4, 6, 0, stars));
  b.routes = [
    { factory: 70, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] },
    { factory: 70, cells: [K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] },
  ];
  return b;
}

/** FURNACE's start deck with an ARMOR PRESS (uid 70) at (6,6) on a belt into connector 5. */
function pressFurnace(stars: number): Build {
  const b = furnaceStart();
  b.items.push(item(70, "armorpress", 6, 6, 0, stars));
  b.routes.push({ factory: 70, cells: [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] });
  b.beltCap = Math.max(b.beltCap, b.routes.reduce((n, r) => n + r.cells.length, 0));
  return b;
}

/** Both sides with +3000 hull: the fight runs its full 120 s (the dark wind can't end it). */
const sturdy = (b: Build): Build => ({ ...b, hullBonus: b.hullBonus + 3000 });

export function deckRows(c: Case): Row[] {
  return [1, 2, 3].map((s) => {
    let dmg = 0, own = 0, wins = 0;
    for (const seed of SEEDS) {
      const bt = new Battle(sturdy(c.at(s)), sturdy(c.vs()), seed);
      while (!bt.over && bt.ticks < 60 * 200) {
        bt.step();
        if (c.own) own += c.own(bt, bt.events);
        bt.events.length = 0;
      }
      dmg += bt.sides[0].stats.damage;
      if (bt.winner === 0) wins++;
    }
    return { dmg: dmg / SEEDS.length, own: own / SEEDS.length, wins };
  });
}

const line = (c: Case, r: Row[]) => `${c.id} | ${c.deck} | ${c.foe} | ${r.map((x) => `${x.dmg.toFixed(1)} (${x.wins}W${c.own ? `, own ${x.own.toFixed(1)}` : ""})`).join(" | ")}`;

/** No wave-3 merge step falls (an allowlist, as tests/arsenal.decks.test.ts's KNOWN_FALLS; it must stay empty). */
export const WAVE3_FALLS: { id: string; cause: string }[] = [];

describe("wave 3, deck level: 1 -> 2 -> 3 stars never loses more than 3% of mean damage dealt (5 seeds)", () => {
  for (const c of CASES) {
    it(`${c.id} (${c.deck} vs ${c.foe})`, () => {
      const r = deckRows(c);
      if (process.env.BB_TABLES) console.log(`DECK ${line(c, r)}`);
      expect(r[1].dmg, `${c.id} 1->2`).toBeGreaterThanOrEqual(r[0].dmg * 0.97);
      expect(r[2].dmg, `${c.id} 2->3`).toBeGreaterThanOrEqual(r[1].dmg * 0.97);
      expect(r[2].dmg, `${c.id} 1->3`).toBeGreaterThanOrEqual(r[0].dmg * 0.97);
      if (c.own) expect(r[0].own <= r[1].own && r[1].own <= r[2].own, `${c.id} own measure ${r.map((x) => x.own)}`).toBe(true);
    });
  }

  it("every wave-3 module has a deck row, and no fall is allowed", () => {
    expect(CASES.map((c) => c.id).sort()).toEqual(["anvil", "armorpress", "braceframe", "pincer", "platebreaker", "plateroller", "seamwelder",
      "shieldwall", "spallcatcher", "steambreech", "stoker", "twingauge", "twinlatch", "twinmould", "twintrigger"]);
    expect(WAVE3_FALLS).toEqual([]);
  });

});

describe("STOKER's cap (the Prime's call, oracle a0e94bc69949561f): a stoke never makes a factory outrun its gun", () => {
  for (const r of STOKER_ROWS) {
    it(`${r.id}: no stoker <= 1 star <= 2 stars <= 3 stars, and no more jams than with no stoker`, () => {
      const rows = capRows(r);
      if (process.env.BB_TABLES) console.log(`STOKER ${r.id} | ${rows.map((x, s) => `${s ? `★${s}` : "none"} ${x.dmg.toFixed(1)} (jams ${x.jams})`).join(" | ")}`);
      for (let s = 1; s <= 3; s++) {
        expect(rows[s].dmg, `${r.id} ★${s}`).toBeGreaterThanOrEqual(rows[s - 1].dmg * 0.999);
        expect(rows[s].jams, `${r.id} ★${s} jams`).toBeLessThanOrEqual(rows[0].jams);
      }
      if (r.rises) for (let s = 1; s <= 3; s++) expect(rows[s].dmg, `${r.id} ★${s} rises`).toBeGreaterThan(rows[s - 1].dmg);
    });
  }

  it("FURNACE's 6-tile Kiln: a stoker still pays (1 star above none), and from 2 stars it stamps at the gun's pace (1 s)", () => {
    const rows = capRows(STOKER_ROWS[0]);
    expect(rows[1].dmg).toBeGreaterThan(rows[0].dmg);
    expect(rows[3].dmg).toBeCloseTo(rows[2].dmg, 6);
    const gaps: number[] = [];
    let last = -1;
    const b = withItem(furnaceStart(), item(70, "stoker", 6, 6, 0, 3));
    const bt = new Battle(sturdy(b), sturdy(weaverStart()), 1);
    while (bt.t < 20) {
      bt.step();
      for (const e of bt.drainEvents()) if (e.type === "produce" && e.side === 0) { if (last >= 0 && bt.t > 3) gaps.push(bt.t - last); last = bt.t; }
    }
    for (const g of gaps) expect(g).toBeGreaterThanOrEqual(1 - 1 / 60); // never faster than the heavy gun's 1 s
  });

  it("the par player rates the cap as the battle plays it (deckRating.ts): a capped stoke is worth no more than the gun takes", () => {
    // FURNACE's 6-tile Kiln stamps every 1.25 s into a gun that takes a load a second: 1 star (1.04 s) fits under the cap,
    // 2 and 3 stars (0.87 s, 0.74 s) are both held to the gun's 1 s, so they rate the same; the 8-tile Kiln's gun has room
    // (0.72 s), so there every star rates higher
    const rate = (base: () => Build, s: number) => rateDeck(s ? withItem(base(), item(70, "stoker", 6, 6, 0, s)) : base()).offense;
    const six = [0, 1, 2, 3].map((s) => rate(furnaceStart, s)), eight = [0, 1, 2, 3].map((s) => rate(longKiln, s));
    expect(six[1]).toBeGreaterThan(six[0]);
    expect(six[2]).toBeGreaterThan(six[1]);
    expect(six[3]).toBeCloseTo(six[2], 9);
    for (let s = 1; s <= 3; s++) expect(eight[s], `8-tile ★${s}`).toBeGreaterThan(eight[s - 1]);
  });
});
