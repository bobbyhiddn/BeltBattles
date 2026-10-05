// 0.8.0 B1 M4 (REQ-BFG-033; VERIFIED-I1's call 4, I1 REPORT section 8.4 and open item 4): the SMUGGLER's rule under the
// per-run draw. Each choice is keyed by effect (BURN: TEMPER, BELLOWS, QUENCH TANK; SHOCK: GALVANIC COIL, STATIC BRUSH,
// LODESTONE). A kind with an unlocked ware offers what it always did (the same part for the same pick). A kind with no
// unlocked ware offers one of the run's own drawn wares of that effect that aren't unlocked yet: contraband ahead of its
// day. It is blocked (NONE ON OFFER) only when the run drew none of that effect. The run's wares stay the only source:
// never a module the run did not draw. BB_TABLES=1 prints the blocked rate by day for 2,000 runs, on the seeds of
// tests/wares.test.ts's table (whose "no unlocked ware" columns are now the share of runs offered contraband).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { hashSeed } from "../src/core/rng";
import { RUN_DAYS, type HeroId } from "../src/sim/content";
import { drawWares, unlocked, waresOk, type Wares } from "../src/game/wares";
import { migrateRun, newRun, type Run } from "../src/game/run";
import { EVENTS, smugglerParts, smugglerPool, smugglerStock, type SmugglerKind } from "../src/game/eventDefs";
import { choicesFor, makeEvent, pickChoice } from "../src/game/events";

const KINDS: SmugglerKind[] = ["BURN", "SHOCK"];
const HEROES: HeroId[] = ["furnace", "weaver", "foundry", "bastion", "metronome", "siphon"];
const PICKS = Array.from({ length: 16 }, (_, j) => (j + 0.5) / 16);
const FEW_PICKS = PICKS.filter((_, j) => j % 2 === 0);
/** The run seeds of tests/wares.test.ts's SMUGGLER table (I1 REPORT section 8.4). */
const TABLE_SEEDS = Array.from({ length: 2000 }, (_, i) => hashSeed("i1-smuggler", i + 1));
const SEEDS = TABLE_SEEDS.slice(0, 240);

const has = (w: Wares, id: string): boolean => Object.prototype.hasOwnProperty.call(w, id);
/** The kind's wares unlocked on `day`, and the kind's wares the run drew at all. */
const openOf = (w: Wares, kind: SmugglerKind, day: number): string[] => smugglerPool(kind).filter((id) => has(w, id) && w[id] <= day);
const drawnOf = (w: Wares, kind: SmugglerKind): string[] => smugglerPool(kind).filter((id) => has(w, id));

/** I1's rule (v080-wave3 f4846a1, eventDefs.ts smugglerParts), written out: each kind from its unlocked wares only, BURN
 *  first, SHOCK from what is left of the pick and never BURN's gate while another is there. The reference for "a kind
 *  with an unlocked ware is unchanged". */
function i1Parts(pick: number, run: { wares: Wares; day: number }): [string | undefined, string | undefined] {
  const draw = (arr: string[], u: number): [string | undefined, number] => {
    if (!arr.length) return [undefined, u];
    const x = Math.min(Math.max(u, 0), 1 - Number.EPSILON) * arr.length;
    return [arr[Math.floor(x)], x - Math.floor(x)];
  };
  const [burn, rest] = draw(openOf(run.wares, "BURN", run.day), pick);
  const shock = openOf(run.wares, "SHOCK", run.day);
  const other = shock.filter((id) => id !== burn);
  return [burn, draw(other.length ? other : shock, rest)[0]];
}

/** A real run of `hero` on `day` with `wares` in place of its own. */
function runWith(wares: Wares, day: number, hero: HeroId = "furnace", seed = 11): Run {
  const run = newRun(hero, seed, "b1-smuggler");
  run.wares = { ...wares };
  run.day = day;
  run.gold = 20;
  return run;
}
const smugglerChoices = (run: Run, pick: number) => EVENTS.smuggler.choices(run, { day: run.day, id: "smuggler", roll: 0.5, pick, picked: -1 });

describe("the SMUGGLER's contraband rule (0.8.0 B1 M4, REQ-BFG-033)", () => {
  it("a kind with no unlocked ware offers one of the run's drawn wares of that effect ahead of its day, at its price, and the pick grants it", () => {
    // a run whose only SHOCK ware is a LODESTONE that waits for the day-6 restock, and whose only BURN ware is a TEMPER
    const base = newRun("weaver", 4242, "b1-smuggler").wares!;
    const wares: Wares = Object.fromEntries(Object.entries(base).filter(([id]) => !smugglerPool("BURN").includes(id) && !smugglerPool("SHOCK").includes(id)));
    wares.lodestone = 6;
    wares.temper = 1;
    expect(waresOk(wares)).toBe(true);
    for (let day = 1; day <= RUN_DAYS; day++) {
      const run = runWith(wares, day);
      expect(smugglerStock("SHOCK", run), `day ${day}`).toEqual(["lodestone"]);
      expect(unlocked(run, "lodestone", day), `day ${day}`).toBe(day >= 6);
      for (const pick of PICKS) {
        const ch = smugglerChoices(run, pick);
        expect([ch[0].label, ch[0].blocked, ch[0].gain, ch[0].cost], `day ${day} pick ${pick}`).toEqual(["BURN", undefined, [{ k: "item", def: "temper" }], [{ k: "gold", n: 2 }]]);
        expect([ch[1].label, ch[1].blocked, ch[1].gain, ch[1].cost], `day ${day} pick ${pick}`).toEqual(["SHOCK", undefined, [{ k: "item", def: "lodestone" }], [{ k: "gold", n: 3 }]]);
      }
    }
    // on day 2 the pick pays 3 gold and puts the LODESTONE in cargo, four days before the caravan may sell it
    const run = runWith(wares, 2);
    run.event = makeEvent(run.seed, 2, "smuggler");
    run.stage = "event";
    const gold = run.gold;
    expect(choicesFor(run)[1].blocked).toBeUndefined();
    expect(pickChoice(run, 1)).toMatchObject({ ok: true, deckItem: "lodestone" });
    expect([run.gold, run.inventory.map((i) => i.def)]).toEqual([gold - 3, ["lodestone"]]);
    expect(choicesFor(run)[1].gain).toEqual([{ k: "item", def: "lodestone" }]); // the resolved card still names it
    // with several drawn and none unlocked, every one of them is on offer over the picks, and only they are
    const two: Wares = { ...wares, coil: 8, staticbrush: 6 };
    delete two.lodestone;
    const seen = new Set(PICKS.map((p) => smugglerParts(p, { wares: two, day: 3 })[1]));
    expect([...seen].sort()).toEqual(["coil", "staticbrush"]);
  });

  it("the draw's own runs: every SMUGGLER part is one of the run's wares of its effect, unlocked unless its kind has none unlocked", () => {
    let contraband = 0, open = 0;
    for (const s of SEEDS) {
      const w = drawWares(s);
      for (let day = 1; day <= RUN_DAYS; day++) for (const pick of FEW_PICKS) {
        smugglerParts(pick, { wares: w, day }).forEach((p, i) => {
          const kind = KINDS[i];
          if (p === undefined) return;
          expect(smugglerPool(kind), `seed ${s} day ${day}: ${p}`).toContain(p);
          expect(has(w, p), `seed ${s} day ${day}: ${p} is not one of the run's wares`).toBe(true); // never outside the draw
          if (w[p] <= day) open++;
          else {
            contraband++;
            expect(openOf(w, kind, day), `seed ${s} day ${day}: ${kind} ${p} ahead of its day while one is unlocked`).toEqual([]);
          }
        });
      }
    }
    expect(contraband).toBeGreaterThan(0);
    expect(open).toBeGreaterThan(contraband);
  });

  it("blocked (NONE ON OFFER) only when the run drew none of that effect, on every day and pick; the other kind still works", () => {
    let blocked = 0;
    for (const s of SEEDS.slice(0, 120)) {
      const w = drawWares(s);
      for (const day of [1, 2, 3, 5, 6, 8, 10]) {
        const run = runWith(w, day);
        for (const pick of PICKS.filter((_, j) => j % 4 === 0)) {
          const ch = smugglerChoices(run, pick);
          KINDS.forEach((kind, i) => {
            const none = drawnOf(w, kind).length === 0;
            expect(ch[i].blocked, `seed ${s} day ${day} ${kind}`).toBe(none ? "NONE ON OFFER" : undefined);
            expect(ch[i].gain.length, `seed ${s} day ${day} ${kind}`).toBe(none ? 0 : 1);
            if (none) blocked++;
          });
        }
      }
    }
    expect(blocked).toBeGreaterThan(0); // some of these runs drew no ware of one effect
    // a run that drew no SHOCK ware: SHOCK is blocked on every day, BURN is not
    const w = drawWares(TABLE_SEEDS[7]);
    const noShock: Wares = Object.fromEntries(Object.entries(w).filter(([id]) => !smugglerPool("SHOCK").includes(id)));
    for (let day = 1; day <= RUN_DAYS; day++) for (const pick of PICKS) {
      const ch = smugglerChoices(runWith(noShock, day), pick);
      expect([ch[1].label, ch[1].blocked, ch[1].gain], `day ${day}`).toEqual(["SHOCK", "NONE ON OFFER", []]);
      expect(ch[0].blocked, `day ${day}`).toBeUndefined();
      expect(smugglerPool("BURN")).toContain(ch[0].gain.find((g) => g.k === "item")?.def);
    }
    expect(smugglerStock("SHOCK", { wares: noShock, day: 10 })).toEqual([]);
  });

  it("a kind with an unlocked ware is unchanged: the same part for the same pick as I1's rule, always an unlocked one", () => {
    let kept = 0, both = 0;
    for (const s of SEEDS) {
      const w = drawWares(s);
      for (let day = 1; day <= RUN_DAYS; day++) for (const pick of FEW_PICKS) {
        const now = smugglerParts(pick, { wares: w, day }), was = i1Parts(pick, { wares: w, day });
        KINDS.forEach((kind, i) => {
          if (!openOf(w, kind, day).length) return;
          expect(now[i], `seed ${s} day ${day} pick ${pick} ${kind}`).toBe(was[i]);
          expect(w[now[i]!] <= day, `${now[i]} unlocked on day ${day}`).toBe(true);
          kept++;
        });
        if (openOf(w, "BURN", day).length && openOf(w, "SHOCK", day).length) {
          expect(now).toEqual(was);
          both++;
        }
      }
    }
    expect(both).toBeGreaterThan(kept / 4);
    // a run without wares (a save from before 0.8.0, roadCap.ts's model): the whole pool, as before
    for (const pick of PICKS) {
      expect(smugglerParts(pick, { day: 1 })).toEqual(smugglerParts(pick));
      const [burn, shock] = smugglerParts(pick);
      expect(smugglerPool("BURN")).toContain(burn);
      expect(smugglerPool("SHOCK")).toContain(shock);
    }
    for (const kind of KINDS) expect(smugglerStock(kind)).toEqual(smugglerPool(kind));
  });

  it("deterministic by seed: six heroes alike, the same cards again and after a reload, contraband included", () => {
    let contraband = 0;
    const cardsOf = (run: Run) => choicesFor(run).map((c) => [c.label, c.blocked ?? "", c.gain.map((g) => (g.k === "item" ? g.def : g.k)).join("+")].join(":"));
    for (const s of SEEDS.slice(0, 60)) for (const day of [1, 2, 3, 6]) {
      const cards = HEROES.map((h) => {
        const run = newRun(h, s, "b1-smuggler");
        run.day = day;
        run.gold = 20;
        run.event = makeEvent(s, day, "smuggler");
        run.stage = "event";
        const a = cardsOf(run);
        expect(cardsOf(run)).toEqual(a);
        const loaded = migrateRun(JSON.parse(JSON.stringify(run)))!;
        expect(loaded.wares).toEqual(run.wares);
        loaded.event = makeEvent(s, day, "smuggler");
        loaded.stage = "event";
        expect(cardsOf(loaded), `seed ${s} day ${day} ${h}: after a reload`).toEqual(a);
        for (const c of choicesFor(run)) for (const g of c.gain) if (g.k === "item" && !unlocked(run, g.def, day)) contraband++;
        return a;
      });
      for (const c of cards) expect(c, `seed ${s} day ${day}`).toEqual(cards[0]);
    }
    expect(contraband).toBeGreaterThan(0); // the reloads above include contraband cards
  });

  it("the code reads no hero, race or faction (REQ-BFG-021, as tests/sharedPool.code.test.ts checks the draw functions)", () => {
    const src = readFileSync("src/game/eventDefs.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const name of ["smugglerStock", "drawApart", "smugglerParts"]) {
      const at = src.search(new RegExp(`(function ${name}\\b|const ${name}\\b)`));
      expect(at, name).toBeGreaterThanOrEqual(0);
      const body = src.slice(at, src.indexOf("\n}", at) > 0 ? src.indexOf("\n}", at) : at + 600);
      expect(body, name).not.toMatch(/\b(faction|race|hero|heroes|HEROES|furnace|weaver|foundry|bastion|metronome|siphon)\b/i);
    }
  });
});

describe("the SMUGGLER's blocked rate under the rule (2,000 runs, tests/wares.test.ts's seeds)", () => {
  it("blocked only when the run drew none of that effect: the same share on every day, far under I1's no-unlocked-ware share", () => {
    const n = TABLE_SEEDS.length;
    const pct = (k: number) => `${((100 * k) / n).toFixed(2)}%`;
    const rows: string[] = [];
    const tally = { emptyB: [] as number[], emptyS: [] as number[], blockedB: [] as number[], blockedS: [] as number[] };
    const noneB = TABLE_SEEDS.filter((s) => !drawnOf(drawWares(s), "BURN").length).length;
    const noneS = TABLE_SEEDS.filter((s) => !drawnOf(drawWares(s), "SHOCK").length).length;
    const wares = TABLE_SEEDS.map((s) => drawWares(s));
    for (let day = 1; day <= RUN_DAYS; day++) {
      let eb = 0, es = 0, bb = 0, bs = 0, both = 0;
      wares.forEach((w, i) => {
        const pick = makeEvent(TABLE_SEEDS[i], day, "smuggler").pick; // the event's own pick
        const [burn, shock] = smugglerParts(pick, { wares: w, day });
        if (!openOf(w, "BURN", day).length) eb++;
        if (!openOf(w, "SHOCK", day).length) es++;
        if (!burn) bb++;
        if (!shock) bs++;
        if (!burn && !shock) both++;
      });
      tally.emptyB.push(eb);
      tally.emptyS.push(es);
      tally.blockedB.push(bb);
      tally.blockedS.push(bs);
      rows.push(`| ${day} | ${pct(eb)} | ${pct(bb)} | ${pct(es)} | ${pct(bs)} | ${pct(both)} |`);
    }
    if (process.env.BB_TABLES) {
      console.log([
        "| day | BURN: no unlocked ware (I1: blocked; now contraband) | BURN blocked | SHOCK: no unlocked ware (I1: blocked; now contraband) | SHOCK blocked | both blocked |",
        "|---|---|---|---|---|---|", ...rows,
      ].join("\n"));
    }
    for (let d = 0; d < RUN_DAYS; d++) {
      // blocked = drew none, whatever the day; never more than the kinds with no unlocked ware (I1's blocked share)
      expect([tally.blockedB[d], tally.blockedS[d]], `day ${d + 1}`).toEqual([noneB, noneS]);
      expect(tally.blockedB[d]).toBeLessThanOrEqual(tally.emptyB[d]);
      expect(tally.blockedS[d]).toBeLessThanOrEqual(tally.emptyS[d]);
    }
    // I1 measured SHOCK with no unlocked ware in 17.45% of runs on days 1-2 (BURN 6.65%); these seeds read the same
    // FLIP-X2 (REVIEW-NUM3 answer 2; REQ-BFG-069): the per-run draw reads buyableModules(), so SIFTER's dormancy (-1) and
    // the 3 sustain pieces (+3, held to day 3) redraw every run's wares: SHOCK with no unlocked ware on day 1 349 -> 335
    // (16.75%), BURN 133 (6.65%) as before (SIFTER alone gave [121, 324] at step 1b) (was [133, 349])
    expect([tally.emptyB[0], tally.emptyS[0]]).toEqual([133, 335]);
    // about 2% expected (VERIFIED-I1's call 4): a run drew none of an effect's three rigs
    expect(noneS / n).toBeLessThan(0.04);
    expect(noneB / n).toBeLessThan(0.04);
    expect(noneS + noneB).toBeGreaterThan(0);
  });
});
