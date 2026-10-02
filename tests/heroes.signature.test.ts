// 0.8.0 H1 M3 (REQ-BFG-011, REQ-BFG-032): the signature visuals of FOUNDRY and BASTION (docs/RACES.md section 5's OPEN
// list; ref/BRIEF-v080-H1.md section 4, with the Prime's rule 1 of section 10). Display only, and checked as such:
//  - the sim's `fuse` event (FOUNDRY) and its new `plate` event (BASTION's CLANK) fire for those heroes alone, one for
//    each fusion and each plating that lands, and nothing else of the battle changes (played at any speed or skipped,
//    a battle ends as simulate() does);
//  - the result card's rows (FUSED SLUGS, PLATING GAINED, PLATING SPENT) come from the race counters outside SideStats,
//    the same played or skipped; a Furnace or Weaver card has 0.6.2's 7 rows at its 170 px;
//  - the SYNC estimate agrees with the sim: belts it marks in sync fuse their blanks in battle, belts it marks out of
//    sync never do; its inspector line is whole sentences with the real numbers;
//  - Furnace and Weaver decks get none of it (no SYNC, no weld flash, no CLANK, no plating strip, no soak).
import { describe, expect, it } from "vitest";
import { Arena } from "../src/game/arena";
import { Battle, simulate, type Payload, type SideStats, type SimEvent } from "../src/sim/battle";
import { raceLoaded } from "../src/sim/races";
import { heroRefBuild, heroStartBuild } from "../src/sim/heroBuilds";
import { key as K, rotField, type Build } from "../src/sim/deck";
import type { HeroId } from "../src/sim/content";
import { raceReadout, readoutOk } from "../src/game/raceReadout";
import { CARD_ROWS, plated, resultCard, resultRows } from "../src/screens/battleHud";
import { syncOf, syncedTurrets } from "../src/sim/syncEstimate";
import { SYNC_WINDOW } from "../src/sim/races/foundry";
import { PLATE_CAP } from "../src/sim/races/bastion";
import { beltPanel, syncLine } from "../src/screens/build/inspector";
import { cruiserModel } from "../src/render/cruiser";
import { migrateRun, newRun, type DayResult } from "../src/game/run";
import { wrapText } from "../src/ui/richText";
import { textWidth } from "../src/render/font";
import { banned, numbers } from "./textRules";

const clone = (b: Build): Build => JSON.parse(JSON.stringify(b)) as Build;
const FW: HeroId[] = ["furnace", "weaver"];
const FB: HeroId[] = ["foundry", "bastion"];

/** A plain battle (no Arena): its end, and its fuse and plate events checked against the race counters as it goes. */
function plain(a: Build, b: Build, seed: number) {
  const bt = new Battle(clone(a), clone(b), seed);
  const fuse: [number, number] = [0, 0], plate: [number, number] = [0, 0], plates: [number, number] = [0, 0];
  let orderOk = true;
  while (!bt.over && bt.ticks < 60 * 200) {
    bt.step();
    const ev = bt.drainEvents();
    ev.forEach((e, i) => {
      if (e.type === "fuse") fuse[e.side]++;
      if (e.type === "plate") {
        plate[e.side] += e.amount;
        plates[e.side]++;
        const before = ev[i - 1]; // the load it came with, same side and gun
        if (!before || before.type !== "load" || before.side !== e.side || before.turret !== e.turret) orderOk = false;
      }
    });
  }
  const end = [bt.winner, bt.t, bt.ticks, bt.sides[0].hull.hp, bt.sides[1].hull.hp, JSON.stringify(bt.sides[0].stats), JSON.stringify(bt.sides[1].stats)];
  return { bt, fuse, plate, plates, orderOk, end };
}
const endOf = (a: Arena): unknown[] => [a.b.winner, a.b.t, a.b.ticks, a.b.sides[0].hull.hp, a.b.sides[1].hull.hp, JSON.stringify(a.b.sides[0].stats), JSON.stringify(a.b.sides[1].stats)];

/** Pairs across the four heroes (days 1, 5 and 10, mirrors included). */
const PAIRS: [HeroId, HeroId, number][] = [];
for (const d of [1, 5, 10]) {
  for (const a of [...FW, ...FB]) for (const b of [...FW, ...FB]) if (d === 5 || a !== b) PAIRS.push([a, b, d]);
}

describe("the fuse and plate events", () => {
  it("fire for FOUNDRY and BASTION only, one for each fusion and each plating that lands, right after its load", () => {
    let fused = 0, plating = 0;
    for (const [a, b, d] of PAIRS) {
      const r = plain(heroRefBuild(a, d), heroRefBuild(b, d), 40 + d);
      for (const side of [0, 1] as const) {
        const hero = side === 0 ? a : b, race = r.bt.sides[side].race;
        if (hero !== "foundry") expect(r.fuse[side], `${a} v ${b} d${d} side ${side}`).toBe(0);
        if (hero !== "bastion") expect(r.plate[side], `${a} v ${b} d${d} side ${side}`).toBe(0);
        if (FW.includes(hero)) expect(race, `${hero} has no race state facing ${side ? a : b}`).toBeUndefined();
        if (hero === "foundry") {
          expect(r.fuse[side]).toBe(race!.foundry.fusions);
          expect(r.fuse[side], `${a} v ${b} d${d}`).toBeGreaterThan(0);
          fused += r.fuse[side];
        }
        if (hero === "bastion") {
          expect(r.plate[side]).toBeCloseTo(race!.plating.gained, 9);
          expect(r.plates[side], `${a} v ${b} d${d}`).toBeGreaterThan(0);
          plating += r.plate[side];
        }
      }
      expect(r.orderOk, `${a} v ${b} d${d}`).toBe(true);
    }
    expect(fused).toBeGreaterThan(100);
    expect(plating).toBeGreaterThan(100);
  });

  it("a hull at the plating cap plates no further and gets no plate event; below it, the event carries what landed", () => {
    // (in real fights plating is spent about as fast as it lands: the reference decks peak at 4 to 6 of 24)
    const bt = new Battle(heroStartBuild("bastion", 1), heroStartBuild("weaver", 500), 1);
    const s = bt.sides[0], events: SimEvent[] = [];
    const ctx = { t: 0, events, newId: () => 1 };
    const slug = { id: 1, ammo: "bulwark", ride: 0, mult: 1, flat: 0, burn: 0, shock: false, prior: 0, factory: 1, copy: false } as Payload;
    s.race!.plating.plate = PLATE_CAP;
    raceLoaded(ctx, s, s.routes[0], s.turrets[0], slug);
    expect(events).toEqual([]);
    s.race!.plating.plate = PLATE_CAP - 1;
    raceLoaded(ctx, s, s.routes[0], s.turrets[0], slug);
    expect(events).toEqual([{ type: "plate", side: 0, turret: s.turrets[0].index, amount: 1 }]);
    raceLoaded(ctx, s, s.routes[0], s.turrets[0], { ...slug, ammo: "plain" } as Payload);
    expect(events).toHaveLength(1);
  });
});

describe("the Arena: display only", () => {
  const FIGHTS: [HeroId, HeroId, number, number][] = [["foundry", "bastion", 1, 11], ["bastion", "foundry", 5, 12], ["foundry", "furnace", 10, 13], ["weaver", "bastion", 3, 14], ["bastion", "bastion", 7, 15]];

  it("played at any speed or skipped, a FOUNDRY or BASTION battle ends as simulate() does, with one readout", () => {
    for (const [a, b, d, seed] of FIGHTS) {
      const pa = heroRefBuild(a, d), pb = heroRefBuild(b, d);
      const ref = plain(pa, pb, seed);
      const sim = simulate(clone(pa), clone(pb), seed);
      expect([sim.winner, sim.ticks, sim.sides[0].hull.hp, sim.sides[1].hull.hp]).toEqual([ref.bt.winner, ref.bt.ticks, ref.bt.sides[0].hull.hp, ref.bt.sides[1].hull.hp]);
      const want = raceReadout([ref.bt.sides[0], ref.bt.sides[1]]);
      expect(want, `${a} v ${b}`).toBeDefined();
      const skipped = new Arena(clone(pa), clone(pb), seed, null);
      skipped.finish();
      expect(endOf(skipped)).toEqual(ref.end);
      expect(raceReadout([skipped.b.sides[0], skipped.b.sides[1]])).toEqual(want);
      for (const speeds of [[1], [0.5, 1, 2, 4], [4]]) {
        const played = new Arena(clone(pa), clone(pb), seed, null);
        played.quiet = true;
        for (let f = 0; f < 60 * 400 && !played.b.over; f++) {
          played.speed = speeds[Math.floor(f / 240) % speeds.length];
          played.update(1 / 60);
        }
        for (let i = 0; i < 240; i++) played.update(1 / 60, false);
        expect(played.b.over).toBe(true);
        expect(endOf(played), `${a} v ${b} at ${speeds}`).toEqual(ref.end);
        expect(raceReadout([played.b.sides[0], played.b.sides[1]])).toEqual(want);
      }
    }
  });

  it("the weld flash, the CLANK and the plating strip follow the events; the impacts show the plating they soaked", () => {
    const a = new Arena(heroRefBuild("foundry", 5), heroRefBuild("bastion", 5), 21, null);
    a.quiet = true;
    let shown = 0, welds = 0, clanks = 0, chipped = 0;
    const take = a.takeSoak.bind(a);
    a.takeSoak = (side, dmg) => {
      const t = take(side, dmg);
      shown += t;
      return t;
    };
    for (let f = 0; f < 60 * 400 && !a.b.over; f++) {
      for (const e of a.update(1 / 60)) {
        if (e.type === "fuse") {
          welds++;
          expect(a.sfx[0].fuse[e.turret]).toBeGreaterThan(0);
        }
        if (e.type === "plate") {
          clanks++;
          expect(a.sfx[1].clank[e.turret]).toBeGreaterThan(0);
          expect(a.sfx[1].plateShine).toBeGreaterThan(0);
        }
      }
      if (a.sfx[1].plateShown > a.b.sides[1].race!.plating.plate + 1e-9) chipped++;
      expect(a.sfx[1].plateShown).toBeGreaterThanOrEqual(a.b.sides[1].race!.plating.plate - 1e-9);
    }
    const absorbed = a.b.sides[1].race!.plating.absorbed;
    expect(welds).toBe(a.b.sides[0].race!.foundry.fusions);
    expect(clanks).toBeGreaterThan(0);
    expect(chipped, "the strip shows plating just lost").toBeGreaterThan(0);
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThanOrEqual(absorbed + 1e-6);
    expect(plated(a, 1)).toBe(true);
    expect(plated(a, 0)).toBe(false);
  });

  it("a Furnace or Weaver arena never weld-flashes, CLANKs, plates or soaks, and draws no SYNC", () => {
    for (const [a, b, d] of [["furnace", "weaver", 1], ["weaver", "furnace", 5], ["furnace", "furnace", 10], ["weaver", "weaver", 7]] as const) {
      const ar = new Arena(heroRefBuild(a, d), heroRefBuild(b, d), 3, null);
      ar.quiet = true;
      let soak = 0;
      const take = ar.takeSoak.bind(ar);
      ar.takeSoak = (side, dmg) => {
        const t = take(side, dmg);
        soak += t;
        return t;
      };
      for (let f = 0; f < 60 * 400 && !ar.b.over; f++) {
        ar.update(1 / 60);
        for (const s of [0, 1] as const) {
          expect(ar.sfx[s].fuse.every((x) => x === 0) && ar.sfx[s].clank.every((x) => x === 0)).toBe(true);
          expect([ar.sfx[s].plateShown, ar.sfx[s].plateShine]).toEqual([0, 0]);
        }
      }
      expect(soak).toBe(0);
      expect(raceReadout([ar.b.sides[0], ar.b.sides[1]])).toBeUndefined();
      for (const s of [0, 1] as const) {
        expect(plated(ar, s)).toBe(false);
        expect(ar.sfx[s].model.sync).toEqual([]);
      }
    }
  });
});

describe("the result card", () => {
  const s = { damage: 120.4, shots: 30, firstShot: 2.25, idle: 3, turretTime: 30, jams: 1, burnDealt: 17.6, disrupted: 0 } as unknown as SideStats;

  it("FOUNDRY's and BASTION's rows follow 0.6.2's seven; a Furnace or Weaver card keeps the seven", () => {
    const base = resultRows({ player: s, enemy: s, shocks: [1, 2] });
    expect(base).toHaveLength(CARD_ROWS);
    const rows = resultRows({ player: s, enemy: s, shocks: [1, 2], race: { fused: [12, null], plated: [null, 41.6], spent: [null, 39.99] } });
    expect(rows.slice(0, CARD_ROWS)).toEqual(base);
    expect(rows.slice(CARD_ROWS)).toEqual([["FUSED SLUGS", "12", "-"], ["PLATING GAINED", "-", "42"], ["PLATING SPENT", "-", "40"]]);
    expect(resultRows({ player: s, enemy: s, race: { plated: [30, 32], spent: [28, 30] } }).slice(CARD_ROWS).map((r) => r[0])).toEqual(["PLATING GAINED", "PLATING SPENT"]);
  });

  it("the card is 0.6.2's 170 px for seven rows on any screen; race rows add a pitch each, closing up on a short screen", () => {
    for (const H of [120, 180, 216, 422, 1000]) expect(resultCard(CARD_ROWS, H)).toEqual({ h: 170, pitch: 8 });
    expect(resultCard(8, 216)).toEqual({ h: 178, pitch: 8 });
    expect(resultCard(10, 216)).toEqual({ h: 194, pitch: 8 });
    expect(resultCard(10, 198)).toEqual({ h: 194, pitch: 8 });
    expect(resultCard(10, 195).pitch).toBe(7); // 194 doesn't leave 2 px clear on a 195 px screen
    expect(resultCard(10, 187)).toEqual({ h: 183, pitch: 7 });
    expect(resultCard(10, 180)).toEqual({ h: 172, pitch: 6 });
  });

  it("a saved readout round-trips; a malformed one is dropped on load; a Furnace or Weaver result has none", () => {
    const run = newRun("bastion", 3);
    const res = (race: unknown): DayResult => ({ day: 1, outcome: "win", income: 5, time: 20, foe: "X", ghost: false, player: s, enemy: s, ...(race === undefined ? {} : { race }) } as DayResult);
    run.history.push(res({ plated: [42, null], spent: [40, null] }), res({ fused: "x" }), res({ plated: [1, 2, 3] }), res(undefined));
    const back = migrateRun(JSON.parse(JSON.stringify(run)))!;
    expect(back.history.map((h) => h.race)).toEqual([{ plated: [42, null], spent: [40, null] }, undefined, undefined, undefined]);
    expect(readoutOk({ fused: [3, null] })).toBe(true);
    expect(readoutOk({ other: [3, null] })).toBe(false);
    for (const [a, b] of [["furnace", "weaver"], ["weaver", "weaver"]] as const) {
      const bt = simulate(heroStartBuild(a, 1), heroStartBuild(b, 500), 5);
      expect(raceReadout([bt.sides[0], bt.sides[1]])).toBeUndefined();
    }
  });
});

/** FOUNDRY's start deck, and variants of its second belt (gun 1's right intake). */
function foundryDecks(): Record<string, Build> {
  const start = heroStartBuild("foundry", 1);
  const over = clone(start);
  over.items.push({ uid: 777, def: "overdrive", x: 1, y: 3, ...rotField("overdrive", 1) }); // speeds belt 1 only
  const delay = clone(start);
  delay.routes[1].cells = [K(3, 5), K(4, 5), K(5, 5), K(5, 4), K(5, 3), K(4, 3), K(3, 3), K(3, 2), K(3, 1), K(3, 0)]; // +4 tiles: one pour
  const off = clone(start);
  off.routes[1].cells = [K(3, 5), K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(3, 2), K(3, 1), K(3, 0)]; // +2 tiles: half a pour
  return { start, over, delay, off };
}

describe("SYNC", () => {
  it("agrees with the sim: belts marked in sync fuse their blanks in battle, belts marked out of sync never do", () => {
    const d = foundryDecks();
    const want: Record<string, { sync: boolean; pours: number }> = {
      start: { sync: true, pours: 0 }, over: { sync: false, pours: 1 }, delay: { sync: true, pours: 1 }, off: { sync: false, pours: 1 },
    };
    for (const [name, b] of Object.entries(d)) {
      for (const i of [0, 1]) {
        const s = syncOf(b, i)!;
        expect(s.turret).toBe(0);
        expect(s.partners.map((p) => [p.route, p.sync, p.pours]), `${name} belt ${i}`).toEqual([[1 - i, want[name].sync, want[name].pours]]);
      }
      expect(syncedTurrets(b)).toEqual(want[name].sync ? [0] : []);
      for (const seed of [1, 2]) {
        const bt = simulate(clone(b), heroRefBuild("weaver", 1), seed);
        const f = bt.sides[0].race!.foundry;
        if (want[name].sync) expect(f.fusions, `${name}: nearly every pour fuses`).toBeGreaterThanOrEqual(f.blanksLoaded - 1);
        else expect(f.fusions, name).toBe(0);
      }
    }
    expect(syncOf(d.off, 0)!.partners[0].offset).toBeGreaterThan(SYNC_WINDOW);
  });

  it("every FOUNDRY reference deck fuses at gun 1; no Furnace, Weaver or BASTION deck has a SYNC estimate", () => {
    for (let day = 1; day <= 10; day++) {
      expect(syncedTurrets(heroRefBuild("foundry", day)), `foundry d${day}`).toEqual([0]);
      expect(cruiserModel(heroRefBuild("foundry", day)).sync).toEqual([0]);
      for (const h of ["furnace", "weaver", "bastion"] as HeroId[]) {
        const b = heroRefBuild(h, day);
        expect(b.routes.map((_, i) => syncOf(b, i)), `${h} d${day}`).toEqual(b.routes.map(() => null));
        expect(cruiserModel(b).sync).toEqual([]);
      }
    }
    for (const h of [...FW, "bastion"] as HeroId[]) expect(syncedTurrets(heroStartBuild(h, 1))).toEqual([]);
  });

  it("the inspector's SYNC line: whole sentences with the real numbers, kept on the belt's panel", () => {
    const d = foundryDecks();
    expect(syncLine(d.start, 0)).toEqual({ text: "IN SYNC WITH BELT 2: THEIR BLANKS REACH TURRET 1 AT THE SAME MOMENT AND FUSE.", state: "sync" });
    expect(syncLine(d.delay, 1)).toEqual({ text: "IN SYNC WITH BELT 1, ONE POUR APART: THEIR BLANKS REACH TURRET 1 AT THE SAME MOMENT AND FUSE.", state: "sync" });
    expect(syncLine(d.off, 0)).toEqual({
      text: "OUT OF SYNC WITH BELT 2: THEIR BLANKS REACH TURRET 1 0.8 SECONDS APART, MORE THAN 0.25 SECONDS, SO THEY FIRE UNFUSED.", state: "apart",
    });
    expect(numbers(syncLine(d.over, 0)!.text)).toEqual([2, 1, +syncOf(d.over, 0)!.partners[0].offset.toFixed(2), SYNC_WINDOW]);
    const lone = clone(d.start);
    lone.routes[1].cells = [K(3, 5), K(4, 5), K(5, 5), K(6, 5), K(6, 4), K(6, 3), K(6, 2), K(6, 1), K(6, 0)]; // into gun 2
    expect(syncLine(lone, 0)).toEqual({ text: "NO OTHER CRUCIBLE BELT REACHES TURRET 1, SO ITS BLANKS FIRE UNFUSED.", state: "alone" });
    expect(syncLine(lone, 1)?.state).toBe("alone");
    for (const b of [...Object.values(d), lone]) {
      for (const i of [0, 1]) {
        const line = syncLine(b, i)!;
        expect(banned(line.text)).toEqual([]);
        expect(line.text).toMatch(/^[A-Z].*\.$/);
        for (const w of [102, 109, 116, 151]) for (const font of ["5", "3"] as const) {
          for (const l of wrapText(line.text, w, font)) expect(textWidth(l, font), `${w}/${font}: ${l}`).toBeLessThanOrEqual(w);
        }
        const run = newRun("foundry", 3);
        run.build = b;
        const head = beltPanel(run, i)!.head;
        const block = head.find((h) => h.text === line.text);
        expect(block?.keep, line.text).toBe(true);
        expect(head[head.length - 1].text).toMatch(/TILES/); // the tiles line still leads into the timeline
      }
    }
  });

  it("no Furnace or Weaver belt panel gains a SYNC line", () => {
    for (const h of FW) for (const day of [1, 5, 10]) {
      const run = newRun(h, 3);
      run.build = heroRefBuild(h, day);
      for (let i = 0; i < run.build.routes.length; i++) {
        expect(syncLine(run.build, i)).toBeNull();
        expect(beltPanel(run, i)!.head.some((b) => /SYNC/.test(b.text)), `${h} d${day} belt ${i}`).toBe(false);
      }
    }
  });
});
