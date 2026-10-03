// 0.8.0 I1 M3 (REQ-BFG-022 part 2, REQ-BFG-021; output-D1/DESIGN-wave3.md 4.1-4.2, VERIFIED-D1 Q8): the per-run draw in
// the game. src/game/wares.ts draws a run's wares from the run seed alone; run.ts's caravan and eventDefs.ts's road grants
// offer only the wares unlocked by the day; a save without wares plays today's rule. Ported from D1's tests/wave3.test.ts
// (which tests the draw as D1's tool modelled it) onto the game's own runs: the wares are hero-blind and deterministic;
// the active pool and day 1 are in band; 5 steps; every module is reachable; the real caravan and the road grants offer
// only unlocked wares, for six heroes alike. BB_TABLES=1 prints the SMUGGLER's empty-kind table (REPORT.md): the share of
// runs whose kind has no unlocked ware, which the SMUGGLER now offers contraband (0.8.0 B1 M4, oracle aa0494523ab57b7c;
// tests/b1.smuggler.test.ts prints the blocked rate).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { hashSeed } from "../src/core/rng";
import { ITEMS, RUN_DAYS, buyableModules, withWave3, type HeroId } from "../src/sim/content";
import { DRAW, drawWares, quotas, unlocked, unlockDay, waresOk, type Wares } from "../src/game/wares";
import { migrateRun, newRun, rollShop, type Run } from "../src/game/run";
import { EVENTS, SALVAGE_OWNED, UPGRADE, salvagePart, salvagePool, smugglerParts, smugglerPool, swapPart, type EventState } from "../src/game/eventDefs";
import { choicesFor, makeEvent } from "../src/game/events";
import { Rng } from "../src/core/rng";
import { ownSignatureCard, sharedDef, sharedWagons } from "./belts.shared"; // bb-0.8.3 (REQ-BFG-042 D9): REQ-BFG-021 narrowed

const HEROES: HeroId[] = ["furnace", "weaver", "foundry", "bastion", "metronome", "siphon"];
const SEEDS = Array.from({ length: 300 }, (_, i) => 1 + i * 7919);
const days = (w: Wares) => Object.values(w);
/** A ware map's pools: parts unlocked by day 10, by day 1, and the days a step unlocks parts (D1's poolOf). */
const poolOf = (w: Wares) => ({
  active: days(w).filter((u) => u <= RUN_DAYS).length,
  day1: days(w).filter((u) => u <= 1).length,
  steps: [...new Set(days(w).filter((u) => u > 1 && u <= RUN_DAYS))].sort((a, b) => a - b),
});
/** The day-d caravan after r rerolls, rolled on `run` (the stream: seed, day, rerolls). */
function caravan(run: Run, day: number, r: number): string[] {
  run.day = day;
  run.shop = { wagons: [], rerolls: r, discount: 0, free: 0 };
  rollShop(run);
  return run.shop.wagons.flatMap((w) => w.offers.map((o) => o.def));
}

describe("the per-run draw: a run's wares (DESIGN-wave3.md 4.1)", () => {
  it("quotas sum to the total, never exceed a group and follow the sizes (D1's)", () => {
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

  it("newRun draws the wares from the run seed alone: the same for six heroes, deterministic, in catalogue order", () => {
    const order = buyableModules().map((d) => d.id);
    for (const s of SEEDS.slice(0, 40)) {
      const runs = HEROES.map((h) => newRun(h, s, "w"));
      for (const r of runs) expect(r.wares, r.hero).toEqual(runs[0].wares);
      expect(runs[0].wares).toEqual(drawWares(s));
      expect(Object.keys(runs[0].wares!)).toEqual(order.filter((id) => id in runs[0].wares!));
    }
  });

  it("62 wares, a day-1 pool of 17 or more (D1: 30-41), five steps (days 2, 3, 4, 6, 8) in every run; every module reachable", () => {
    const seen = new Set<string>();
    const day1: number[] = [];
    for (const s of SEEDS) {
      const w = drawWares(s), p = poolOf(w);
      expect(p.active, `seed ${s}`).toBe(DRAW.active);
      expect(p.active).toBeGreaterThanOrEqual(55);
      expect(p.active).toBeLessThanOrEqual(70);
      expect(p.day1, `seed ${s}`).toBeGreaterThanOrEqual(17);
      expect(p.steps, `seed ${s}`).toEqual([2, 3, 4, 6, 8]);
      day1.push(p.day1);
      for (const id of Object.keys(w)) seen.add(id);
    }
    expect(seen.size).toBe(buyableModules().length); // 86: every module is a ware in some run (REQ-BFG-022 acceptance 3)
    expect([Math.min(...day1), Math.max(...day1)]).toEqual([expect.any(Number), expect.any(Number)]);
    expect(Math.min(...day1)).toBeGreaterThanOrEqual(30); // D1 section 4.3: never below 30 at 86 modules
  });

  it("the unlock ladder: epics from day 2, the ARCANE DEALER from day 3, legendaries from day 4, late restocks 6 and 8", () => {
    for (const id of buyableModules().map((d) => d.id)) {
      const d = ITEMS[id], u = unlockDay(id, undefined);
      const want = Math.max(d.rarity === "legendary" ? 4 : d.rarity === "epic" ? 2 : 1, d.merchant === "arcane" ? 3 : 1);
      expect(u, id).toBe(want);
    }
    for (const s of SEEDS.slice(0, 60)) {
      const w = drawWares(s);
      const late = Object.entries(w).filter(([id, u]) => u > unlockDay(id, undefined));
      expect(late.length, `seed ${s}`).toBe(DRAW.late);
      for (const [id, u] of late) {
        expect([6, 8], id).toContain(u);
        expect(ITEMS[id].rarity, id).not.toBe("legendary");
        expect(ITEMS[id].merchant, id).not.toBe("arcane");
      }
    }
  });

  it("the draw reads only the run seed and the catalogue: no hero, race or faction in wares.ts or the draw's run.ts and eventDefs.ts code", () => {
    const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const wares = strip(readFileSync("src/game/wares.ts", "utf8"));
    const run = strip(readFileSync("src/game/run.ts", "utf8"));
    const events = strip(readFileSync("src/game/eventDefs.ts", "utf8"));
    const body = (src: string, name: string) => {
      const i = src.search(new RegExp(`(function ${name}\\b|const ${name}\\b)`));
      expect(i, name).toBeGreaterThanOrEqual(0);
      return src.slice(i, src.indexOf("\n}\n", i) > 0 ? src.indexOf("\n}\n", i) : i + 400);
    };
    const parts = [wares, body(run, "stockOf"), body(run, "dayPool"), body(events, "inWares")];
    for (const p of parts) expect(p).not.toMatch(/\bhero\b|\bHEROES\b|\bfaction\b|\brace\b|furnace|weaver|foundry|bastion|metronome|siphon/i);
  });
});

describe("the per-run draw in play: the caravan and the road (DESIGN-wave3.md 4.2)", () => {
  it("the real caravan offers only the run's unlocked wares (and supplies), for six heroes alike", () => {
    for (const s of SEEDS.slice(0, 30)) {
      const shown = HEROES.map((h) => {
        const run = newRun(h, s, "w");
        const out: string[] = [];
        for (let day = 1; day <= RUN_DAYS; day++) for (let r = 0; r < 4; r++) {
          for (const def of caravan(run, day, r)) {
            out.push(`${day}:${sharedDef(def)}`); // bb-0.8.3 (D9, REQ-BFG-021 narrowed): the hero's own card differs by hero
            if (ITEMS[def].kind === "supply" || ownSignatureCard(h, def)) continue; // and it is no ware
            expect(run.wares![def], `seed ${s} day ${day}: ${def}`).toBeLessThanOrEqual(day);
          }
        }
        return out;
      });
      for (const c of shown) expect(c).toEqual(shown[0]); // hero-blind (REQ-BFG-021)
    }
  });

  it("over many caravans every unlocked ware turns up, and no locked one", () => {
    const run = newRun("furnace", 4242, "w");
    for (let day = 1; day <= RUN_DAYS; day++) {
      const offered = new Set<string>();
      // bb-0.8.3 (D9): the hero's own signature card is no ware
      for (let r = 0; r < 300; r++) for (const def of caravan(run, day, r)) if (ITEMS[def].kind !== "supply" && !ownSignatureCard("furnace", def)) offered.add(def);
      const open = Object.keys(run.wares!).filter((id) => run.wares![id] <= day);
      expect([...offered].filter((id) => !open.includes(id)), `day ${day}`).toEqual([]);
      expect(offered.size, `day ${day}`).toBe(open.length);
    }
  });

  it("road grants (SALVAGE, the SMUGGLER, the TRADER's SWAP) come from the run's unlocked wares", () => {
    for (const s of SEEDS.slice(0, 40)) for (const day of [1, 2, 4, 6, 8, 10]) {
      const run = newRun("weaver", s, "w");
      run.day = day;
      const open = (id: string | undefined) => id === undefined || unlocked(run, id, day);
      for (let j = 0; j < 16; j++) {
        const pick = (j + 0.5) / 16;
        expect(open(salvagePart(run, pick)), `salvage seed ${s} day ${day}`).toBe(true);
        // 0.8.0 B1 M4 (REQ-BFG-033, oracle aa0494523ab57b7c): a SMUGGLER part is one of the run's wares in its effect's
        // pool, unlocked whenever that effect has an unlocked ware on the day (else contraband: drawn, ahead of its day)
        smugglerParts(pick, run).forEach((p, i) => {
          if (p === undefined) return;
          const pool = smugglerPool(i === 0 ? "BURN" : "SHOCK");
          expect(pool, `smuggler seed ${s} day ${day}: ${p}`).toContain(p);
          expect(Object.prototype.hasOwnProperty.call(run.wares!, p), `smuggler seed ${s} day ${day}: ${p} is one of the run's wares`).toBe(true);
          expect(open(p) || !pool.some((id) => unlocked(run, id, day)), `smuggler seed ${s} day ${day}: ${p}`).toBe(true);
        });
        for (const good of ["temper", "coil", "splitter", "overdrive", "lance"]) expect(open(swapPart(good, pick, run)), `swap ${good}`).toBe(true);
      }
      // the event's own choices grant what these pick
      const ev: EventState = { day, id: "smuggler", roll: 0.5, pick: 0.3, picked: -1 };
      const [burn, shock] = smugglerParts(0.3, run);
      const ch = EVENTS.smuggler.choices(run, ev);
      expect(ch[0].gain).toEqual(burn ? [{ k: "item", def: burn }] : []);
      expect(ch[1].gain).toEqual(shock ? [{ k: "item", def: shock }] : []);
      expect(ch[0].blocked).toBe(burn ? undefined : "NONE ON OFFER");
      expect(ch[1].blocked).toBe(shock ? undefined : "NONE ON OFFER");
    }
    // the pools themselves are the whole catalogue's, as roadCap.ts and today's rule read them
    expect(salvagePool()).toContain("plateroller");
    expect(UPGRADE.rare.length).toBeGreaterThan(0);
    expect(SALVAGE_OWNED).toBe(0.35);
  });

  it("the SMUGGLER under the draw: how often each kind has no unlocked ware (2,000 runs): those runs are offered contraband; a run that drew none is blocked", () => {
    const burn = smugglerPool("BURN"), shock = smugglerPool("SHOCK");
    const rows: string[] = [];
    const emptyAt: Record<string, number[]> = { BURN: [], SHOCK: [] };
    for (let day = 1; day <= RUN_DAYS; day++) {
      let eb = 0, es = 0, both = 0;
      for (let i = 1; i <= 2000; i++) {
        const w = drawWares(hashSeed("i1-smuggler", i));
        const has = (ids: string[]) => ids.some((id) => w[id] !== undefined && w[id] <= day);
        const b = !has(burn), sh = !has(shock);
        if (b) eb++;
        if (sh) es++;
        if (b && sh) both++;
      }
      emptyAt.BURN.push(eb);
      emptyAt.SHOCK.push(es);
      rows.push(`| ${day} | ${(eb / 20).toFixed(2)}% | ${(es / 20).toFixed(2)}% | ${(both / 20).toFixed(2)}% |`);
    }
    if (process.env.BB_TABLES) console.log(["| day | BURN empty | SHOCK empty | both empty |", "|---|---|---|---|", ...rows].join("\n"));
    // the rate falls as wares unlock and never rises
    for (const k of ["BURN", "SHOCK"]) for (let d = 1; d < RUN_DAYS; d++) expect(emptyAt[k][d], `${k} day ${d + 1}`).toBeLessThanOrEqual(emptyAt[k][d - 1]);
    // a kind the run drew none of (every BURN ware taken out): the event's choice for it is blocked and grants nothing; the
    // other still works (0.8.0 B1 M4: a kind with drawn wares but none unlocked offers contraband, tests/b1.smuggler.test.ts)
    const run = newRun("furnace", 1, "w");
    run.day = 1;
    run.wares = Object.fromEntries(Object.entries(run.wares!).filter(([id]) => !burn.includes(id)));
    const ch = EVENTS.smuggler.choices(run, { day: 1, id: "smuggler", roll: 0.5, pick: 0.4, picked: -1 });
    expect([ch[0].label, ch[0].blocked, ch[0].gain]).toEqual(["BURN", "NONE ON OFFER", []]);
  });
});

describe("a save without wares plays today's rule (DESIGN-wave3.md 4.2: a run in progress never changes)", () => {
  it("an old run (no wares) rolls the caravan the pre-draw game rolled: epics on day 1 and wares outside any draw", () => {
    let epicDay1 = 0, drawnEpicDay1 = 0;
    for (const s of SEEDS.slice(0, 120)) {
      const drawn = newRun("furnace", s, "w");
      const old = migrateRun(JSON.parse(JSON.stringify({ ...drawn, wares: undefined })))!;
      expect(old.wares).toBeUndefined();
      for (let r = 0; r < 3; r++) {
        if (caravan(old, 1, r).some((d) => ITEMS[d].rarity === "epic")) epicDay1++;
        if (caravan(drawn, 1, r).some((d) => ITEMS[d].rarity === "epic")) drawnEpicDay1++;
      }
    }
    expect(epicDay1).toBeGreaterThan(0); // today's rule offers epics from day 1
    expect(drawnEpicDay1).toBe(0); // the draw unlocks them on day 2
  });

  it("a save keeps well-formed wares and drops malformed ones (save v7, no bump)", () => {
    const run = newRun("bastion", 99, "w");
    const back = migrateRun(JSON.parse(JSON.stringify(run)))!;
    expect(back.wares).toEqual(run.wares);
    for (const bad of [[1, 2], { zz: 1 }, { temper: 0 }, { temper: 11 }, { temper: 1.5 }, "x", 7]) {
      const m = migrateRun(JSON.parse(JSON.stringify({ ...run, wares: bad })))!;
      expect(m.wares, JSON.stringify(bad)).toBeUndefined();
      expect(waresOk(bad)).toBe(false);
    }
    expect(waresOk(run.wares)).toBe(true);
  });

  // 0.8.0 I1 M3 (oracle 47ddf8622ecd67d9, item 2a): the live path across a reload
  it("a reload keeps the run's wares exactly, and its caravan and its SALVAGE, SWAP and SMUGGLER cards grant the same parts", () => {
    const gainOf = (c: { gain: { k: string; def?: string }[] } | undefined) => c?.gain.find((q) => q.k === "item")?.def;
    for (const s of SEEDS.slice(0, 40)) for (const day of [1, 3, 6, 9]) {
      const run = newRun(s % 2 ? "foundry" : "furnace", s, "w");
      run.day = day;
      run.gold = 20;
      run.inventory.push({ uid: run.nextUid++, def: "temper" }, { uid: run.nextUid++, def: "whetstone" });
      const before = { caravan: caravan(run, day, 1), cards: [] as (string | undefined)[] };
      for (const [id, i] of [["wreck", 0], ["trader", 1], ["smuggler", 0], ["smuggler", 1]] as const) {
        run.event = makeEvent(s, day, id);
        run.stage = "event";
        before.cards.push(gainOf(choicesFor(run)[i]));
      }
      const loaded = migrateRun(JSON.parse(JSON.stringify(run)))!;
      expect(loaded.wares, `seed ${s}`).toEqual(run.wares);
      expect(caravan(loaded, day, 1)).toEqual(before.caravan);
      const cards: (string | undefined)[] = [];
      for (const [id, i] of [["wreck", 0], ["trader", 1], ["smuggler", 0], ["smuggler", 1]] as const) {
        loaded.event = makeEvent(s, day, id);
        loaded.stage = "event";
        cards.push(gainOf(choicesFor(loaded)[i]));
      }
      expect(cards, `seed ${s} day ${day}`).toEqual(before.cards);
      // 0.8.0 B1 M4 (REQ-BFG-033, oracle aa0494523ab57b7c): the wreck and trader cards unlocked; the two SMUGGLER cards by
      // its rule: one of the run's wares in its effect's pool, unlocked whenever that effect has an unlocked ware that day
      cards.forEach((c, i) => {
        if (!c) return;
        if (i < 2) {
          expect(unlocked(run, c, day), `${c} on day ${day}`).toBe(true);
          return;
        }
        const pool = smugglerPool(i === 2 ? "BURN" : "SHOCK");
        expect(pool, `${c} on day ${day}`).toContain(c);
        expect(Object.prototype.hasOwnProperty.call(run.wares!, c), `${c} is one of the run's wares`).toBe(true);
        expect(unlocked(run, c, day) || !pool.some((id) => unlocked(run, id, day)), `${c} on day ${day}`).toBe(true);
      });
    }
    // malformed wares are dropped on load, and that run then plays today's rule (the old save's caravan)
    const run = newRun("weaver", 31337, "w");
    const broken = migrateRun(JSON.parse(JSON.stringify({ ...run, wares: { temper: "soon" } })))!;
    expect(broken.wares).toBeUndefined();
    const old = migrateRun(JSON.parse(JSON.stringify({ ...run, wares: undefined })))!;
    for (const day of [1, 2, 5]) for (const r of [0, 1]) expect(caravan(broken, day, r)).toEqual(caravan(old, day, r));
  });

  // 0.8.0 I1 M3 (oracle 47ddf8622ecd67d9, item 2b): a held part the run's wares don't hold (a warlord prize can give one)
  it("a held 1-star part outside the run's wares: the familiar slot never echoes it, and it adds no merchant bias", () => {
    let checked = 0;
    for (const s of SEEDS.slice(0, 60)) {
      const run = newRun("furnace", s, "w");
      const outside = buyableModules().find((d) => d.kind !== "turret" && d.merchant !== "arcane" && run.wares![d.id] === undefined);
      if (!outside) continue;
      for (let day = 2; day <= RUN_DAYS; day++) for (const r of [0, 1]) {
        const bare = newRun("furnace", s, "w"), held = newRun("furnace", s, "w");
        held.inventory.push({ uid: held.nextUid++, def: outside.id });
        const a = caravan(bare, day, r), b = caravan(held, day, r);
        expect(b, `seed ${s} day ${day} reroll ${r}: holding ${outside.id}`).toEqual(a);
        expect(held.shop.wagons.map((w) => w.merchant)).toEqual(bare.shop.wagons.map((w) => w.merchant));
        expect(b).not.toContain(outside.id);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it("with wave 3 off for one call the draw reads that catalogue (71 modules), and every run still gets 62 wares", () => {
    withWave3(() => {
      const w = drawWares(17);
      expect(Object.keys(w)).toHaveLength(62);
      expect(Object.keys(w).every((id) => buyableModules().some((d) => d.id === id))).toBe(true);
    }, false);
  });
});
