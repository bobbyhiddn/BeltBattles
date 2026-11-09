// 0.6.2s (REQ-BFG-031) step 2: turret slots, the turret kind, intakes, free starting copies and their value.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { GRID, HEROES, ITEMS, RULES_VERSION, TURRET_PRICE, type HeroId } from "../src/sim/content";
import { SPEED_K } from "../src/sim/content"; // NUM-2 (REQ-BFG-047): SPEED, K = 30
import {
  canSellTurret, connectorClaims, gearSlotsOf, hero, hullSlots, installedTurrets, slotIntakes, startingTurrets,
  turretForColumn, turretSellValue, turretSlots, turretValue, turretsCost, TURRET_UID0,
} from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { effectAt, fusible } from "../src/sim/stars";

const ALL: HeroId[] = ["furnace", "weaver", "foundry", "bastion", "metronome", "siphon"];
const EXTRA: Record<HeroId, number> = { furnace: 8, bastion: 0, metronome: 8, weaver: 6, foundry: 4, siphon: 4 };
const STARTERS = ["scrapcannon", "rampart", "dartgun", "spikegun", "carronade", "swivel"];
/** NUM-2 (REQ-BFG-047): the sim's one rounding (src/sim/pct.ts), as the NUM-2 checkers write it. */
const roundHalfUp = (x: number): number => Math.floor(x + 0.5 + 1e-9);
/** NUM-2: a turret's 1-star fire interval before the conversion (tests/fixtures/num2-base-intervals.json, the base). */
const BASE = new Map((JSON.parse(readFileSync(new URL("./fixtures/num2-base-intervals.json", import.meta.url), "utf8")) as
  { rows: { path: string; base: number }[] }).rows.map((r) => [r.path, r.base]));
const baseInterval = (id: string): number => BASE.get(`ITEMS.${id}.turret.fireInterval`)!;

describe("0.6.2s turret slots: the model (S1-S3, S7)", () => {
  it("runs under RULES_VERSION bb-0.8.3 (turret slots came with bb-0.6.2, the 0.6.2 release's bump)", () => {
    expect(RULES_VERSION).toBe("bb-0.15.0") /* BUMP-1H (rules bb-0.14.0 -> bb-0.15.0, the stamped literal): was bb-0.14.0. BUMP-1G (label bb-0.13.0 -> bb-0.14.0, RULES_VERSION): was bb-0.13.0. BUMP-1F (label bb-0.12.0 -> bb-0.13.0, RULES_VERSION): the bump (was bb-0.12.0). BUMP-1E: the bump (was bb-0.11.0). BUMP-1D: the bump (was bb-0.10.0; AZ-BUMP: was bb-0.9.7; Z-BUMP: was bb-0.9.3; Y7b2: was bb-0.9.1; BAL-2: was bb-0.9.0; FLIP-X2: was bb-0.8.7) */;
  });

  it("S1: every hull has its starting slots at today's spans plus exactly one empty extra slot at the brief's col0", () => {
    for (const h of ALL) {
      const slots = hullSlots(h);
      const n = HEROES[h].turrets.length;
      expect(slots.length).toBe(n + 1);
      HEROES[h].turrets.forEach((t, i) => {
        expect(slots[i].col0).toBe(t.col0);
        expect(slots[i].width).toBe(t.width);
        expect(ITEMS[slots[i].start!].kind).toBe("turret");
      });
      expect(slots[n]).toEqual({ col0: EXTRA[h], width: 2 });
      // slots never overlap and stay on the deck
      const cols = new Set<number>();
      for (const s of slots) for (let c = s.col0; c < s.col0 + s.width; c++) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThan(GRID);
        expect(cols.has(c)).toBe(false);
        cols.add(c);
      }
    }
  });

  it("S1-S3: the starting layout resolves to exactly the hero's 0.6.1 turrets (numbers, spans, connectors)", () => {
    for (const h of ALL) {
      const b = heroStartBuild(h);
      expect(b.turrets).toBeUndefined();
      const inst = installedTurrets(b);
      expect(inst.map((s) => s.td)).toEqual(HEROES[h].turrets);
      expect(inst.map((s) => s.slot)).toEqual(HEROES[h].turrets.map((_, i) => i));
      const views = turretSlots(b);
      const extra = views[views.length - 1];
      expect(extra.turret).toBeUndefined();
      expect(extra.intakes).toEqual([]);
      expect(extra.gearSlots).toBe(0);
      // hero(b): the same connectors per slot as today, and no connector under the empty slot
      const hv = hero(b);
      expect(hv.turrets.slice(0, HEROES[h].turrets.length).map((t) => t.connectors)).toEqual(HEROES[h].turrets.map((t) => t.connectors));
      for (let c = 0; c < GRID; c++) expect(turretForColumn(hv, c)).toBe(turretForColumn(HEROES[h], c));
      expect(connectorClaims(b)).toEqual(connectorClaims({ ...b }));
    }
  });

  it("S2: 'inner' takes the column nearer x 4.5 (ties to the lower); it reproduces every starting light turret", () => {
    expect(slotIntakes(0, 2, "inner")).toEqual([1]); // WEAVER 0 -> 1
    expect(slotIntakes(4, 2, "inner")).toEqual([4]); // WEAVER 4 -> 4 (tie)
    expect(slotIntakes(8, 2, "inner")).toEqual([8]); // WEAVER 8 -> 8
    expect(slotIntakes(1, 2, "inner")).toEqual([2]); // SIPHON 1 -> 2
    expect(slotIntakes(7, 2, "inner")).toEqual([7]); // SIPHON 7 -> 7
    expect(slotIntakes(6, 2, "inner")).toEqual([6]); // WEAVER's extra slot
    expect(slotIntakes(4, 2, "both")).toEqual([4, 5]);
    for (const h of ["weaver", "siphon"] as HeroId[]) {
      expect(installedTurrets(heroStartBuild(h)).map((s) => s.intakes)).toEqual(HEROES[h].turrets.map((t) => t.connectors));
    }
  });

  it("S3: six common starting turrets with today's numbers, salvage names, price 6, sold by the GUNSMITH (step 5)", () => {
    // NUM-2 (REQ-BFG-047, N1 2.2): the stored number is the speed, shots per 30 s, roundHalfUp(30 / the interval): 30 / 40 /
    // 55 / 50 / 38 / 43 (was the fireInterval 1.0 / 0.75 / 0.55 / 0.6 / 0.8 / 0.7 s)
    const want: Record<string, [string, number, number, number, string]> = {
      scrapcannon: ["heavy", 30, 3, 0.6, "both"], rampart: ["heavy", 40, 3, 0.65, "both"],
      dartgun: ["light", 55, 2, 0.34, "inner"], spikegun: ["light", 50, 2, 0.34, "inner"],
      carronade: ["medium", 38, 2, 0.45, "both"], swivel: ["adaptable", 43, 3, 0.55, "both"],
    };
    const heroNames = new Set(Object.values(HEROES).map((h) => h.name));
    for (const id of STARTERS) {
      const d = ITEMS[id];
      expect(d.kind).toBe("turret");
      expect(d.rarity).toBe("common");
      expect(d.price).toBe(TURRET_PRICE.common);
      expect(d.merchant).toBe("gunsmith"); // step 5: merchants stock turrets
      const t = d.turret!;
      expect([t.class, t.speed, t.window, t.flight, t.intake]).toEqual(want[id]); // NUM-2: speed (was fireInterval)
      expect(heroNames.has(d.name)).toBe(false);
      expect(Object.values(ITEMS).filter((x) => x.name === d.name).length).toBe(1);
      expect(fusible(id)).toBe(true);
      // S6 star values (step 4c, from the bench: the brief's ★2 window +1 lost to ★1 on real decks): ★2 fires every
      // fireInterval x0.9, ★3 every x0.8, window unchanged
      expect(effectAt(id, 2).turret!.window).toBe(t.window);
      expect(effectAt(id, 3).turret!.window).toBe(t.window);
      // NUM-2 (EQUIVALENT, the stored speed): each star's speed is roundHalfUp(30 / (the 1-star interval x0.9 / x0.8)), the
      // base interval from the fixture (was the stored fireInterval toBeCloseTo(t.fireInterval x0.9 / x0.8, 12))
      expect(effectAt(id, 2).turret!.speed).toBe(roundHalfUp(SPEED_K / (baseInterval(id) * 0.9)));
      expect(effectAt(id, 3).turret!.speed).toBe(roundHalfUp(SPEED_K / (baseInterval(id) * 0.8)));
    }
  });

  it("S4: gear slots by rarity plus one per star; an empty slot has none", () => {
    expect(gearSlotsOf("dartgun")).toBe(1);
    expect(gearSlotsOf("dartgun", 2)).toBe(2);
    expect(gearSlotsOf("dartgun", 3)).toBe(3);
    expect(gearSlotsOf("temper")).toBe(0);
    for (const h of ALL) for (const s of installedTurrets(heroStartBuild(h))) expect(s.gearSlots).toBe(1);
  });

  it("S7/S8: starting copies are free, have uids 90 + slot, and are worth 0; merged with a bought copy, one price", () => {
    expect(startingTurrets("weaver")).toEqual([
      { slot: 0, def: "dartgun", uid: TURRET_UID0, free: true },
      { slot: 1, def: "dartgun", uid: TURRET_UID0 + 1, free: true },
      { slot: 2, def: "dartgun", uid: TURRET_UID0 + 2, free: true },
    ]);
    expect(turretValue({ def: "dartgun", free: true })).toBe(0);
    expect(turretValue({ def: "dartgun", stars: 2, free: true })).toBe(6);
    expect(turretValue({ def: "dartgun", stars: 3, free: true })).toBe(18);
    expect(turretValue({ def: "dartgun" })).toBe(6);
    expect(turretValue({ def: "dartgun", stars: 3 })).toBe(24);
    expect(canSellTurret({ def: "dartgun", free: true })).toBe(false);
    expect(turretSellValue({ def: "dartgun", free: true })).toBe(0);
    expect(turretSellValue({ def: "dartgun", stars: 2, free: true })).toBe(3);
    expect(turretSellValue({ def: "dartgun" })).toBe(3);
    for (const h of ALL) expect(turretsCost(heroStartBuild(h))).toBe(0);
  });

  it("S3 step 4: seven new turrets (rare + epic per class, one legendary), each unlike its class's commons, sold from step 5", () => {
    const NEW: Record<string, [string, string]> = {
      twinneedle: ["light", "rare"], hailgun: ["light", "epic"], deckgun: ["medium", "rare"], railgun: ["medium", "epic"],
      bombard: ["heavy", "rare"], siegegun: ["heavy", "epic"], thunderer: ["heavy", "legendary"],
    };
    const turrets = Object.values(ITEMS).filter((d) => d.kind === "turret");
    expect(turrets.map((d) => d.id).sort()).toEqual([...STARTERS, ...Object.keys(NEW)].sort());
    const heroNames = new Set(Object.values(HEROES).map((h) => h.name));
    const gear = { common: 1, rare: 2, epic: 3, legendary: 4 } as const;
    for (const [id, [cls, rarity]] of Object.entries(NEW)) {
      const d = ITEMS[id], t = d.turret!;
      expect([d.kind, t.class, d.rarity]).toEqual(["turret", cls, rarity]);
      expect(d.price).toBe(TURRET_PRICE[d.rarity]);
      expect(d.merchant).toBe(d.rarity === "legendary" ? "arcane" : "gunsmith"); // step 5: THUNDERER at the ARCANE DEALER
      expect(d.reason && d.reason.length > 10).toBe(true);
      expect(heroNames.has(d.name)).toBe(false);
      expect(Object.values(ITEMS).filter((x) => x.name === d.name).length).toBe(1);
      expect(gearSlotsOf(id)).toBe(gear[d.rarity]);
      expect(gearSlotsOf(id, 3)).toBe(gear[d.rarity] + 2);
      for (const c of turrets.filter((x) => x.rarity === "common" && x.turret!.class === cls)) {
        const u = c.turret!;
        // NUM-2: speed (was fireInterval, undefined on both sides since 4db2ed0)
        const differs = u.speed !== t.speed || u.window !== t.window || u.flight !== t.flight || u.intake !== t.intake;
        expect(differs).toBe(true);
      }
      expect(Object.keys(t).sort()).toEqual(["class", "flight", "intake", "speed", "window"]); // NUM-2: speed (was fireInterval)
      expect(effectAt(id, 2).turret!.window).toBe(t.window);
      // NUM-2 (EQUIVALENT, as S3's): roundHalfUp(30 / (the 1-star interval x0.9 / x0.8)) (was toBeCloseTo(t.fireInterval x0.9 / x0.8, 12))
      expect(effectAt(id, 2).turret!.speed).toBe(roundHalfUp(SPEED_K / (baseInterval(id) * 0.9)));
      expect(effectAt(id, 3).turret!.speed).toBe(roundHalfUp(SPEED_K / (baseInterval(id) * 0.8)));
    }
  });
});
