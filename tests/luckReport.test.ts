// LUCK-062 (REQ-BFG-033 acceptance 3; REQ-BFG-023 parts 1-2): tools/luckReport.ts at small N. The CHASER holds only
// offered parts, pays each reroll and never goes below 0 gold (its daily ledger, checked against the live run); the same
// seeds give the same output; the family table matches content.ts; and `offerable` (the CHASER's reroll gate) matches
// the day gates of the real caravan.
import { describe, expect, it } from "vitest";
import { ITEMS, REROLL_COST, RUN_DAYS, START_GOLD, buyableModules, incomeFor, wave3Live, withWave3, type HeroId } from "../src/sim/content";
import { newRun, rollShop, type Run } from "../src/game/run";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { playerRun } from "../src/sim/harness/player";
import { turretList } from "../src/sim/deck";
import {
  chaserRun, familyTable, luckReport, offerable, ownedDefs, renderMarkdown, runJob, typicalOwned, withPatch, type ChaserOut,
  type ChaserStep,
} from "../tools/luckReport";

const HEROES: HeroId[] = ["furnace", "weaver"];

describe("luck report: the family table", () => {
  it("matches content.ts: every tag appears, every member carries its tag, generalists carry none", () => {
    const t = familyTable();
    const tags = new Set(Object.values(ITEMS).flatMap((d) => d.tags ?? []));
    expect(new Set(t.families.map((f) => f.tag))).toEqual(tags);
    expect(t.families.length).toBe(tags.size);
    // the buyable set is the caravan's stock: content.ts's own buyable catalogue, no supplies, no signature factories
    expect([...t.buyable].sort()).toEqual(buyableModules().map((d) => d.id).sort());
    for (const d of t.buyable) expect(["gate", "factory", "core", "mod", "turret"]).toContain(ITEMS[d].kind);
    for (const h of HEROES) expect(t.buyable).not.toContain(ITEMS[heroStartBuild(h, 1).items[0].def].id);
    for (const f of t.families) {
      for (const m of f.members) expect(ITEMS[m].tags).toContain(f.tag);
      expect(f.members).toEqual(t.buyable.filter((d) => (ITEMS[d].tags ?? []).includes(f.tag)));
      expect(f.flag !== null).toBe(f.members.length < 5 || f.kinds.length < 2);
    }
    for (const g of t.generalists) expect(ITEMS[g].tags ?? []).toEqual([]);
    // every buyable module is in a family or a generalist
    const inFamily = new Set(t.families.flatMap((f) => f.members));
    for (const d of t.buyable) expect(inFamily.has(d) !== t.generalists.includes(d)).toBe(true);
  });
});

describe("luck report: the CHASER", () => {
  it("only holds offered parts, pays each reroll and never goes below 0 gold (its daily ledger)", () => {
    const t = familyTable();
    let rerolls = 0, buys = 0;
    for (const hero of HEROES) for (const f of t.families) for (const seed of [1, 2]) {
      const ledger: ChaserStep[] = [];
      const bought: string[] = [];
      let last: Run | undefined;
      const out = chaserRun(hero, f.members, seed, {
        ledger,
        observe: (run, s) => {
          expect(run.gold).toBe(s.before);
          expect(run.shop.free).toBe(0); // no free rerolls in the par gold model: each reroll is paid
          expect(s.after).toBeGreaterThanOrEqual(0);
          if (s.act === "buy") {
            // an unsold offer of the caravan in front of it, at its price, of a member it doesn't own yet
            expect(run.shop.wagons[s.wagon!].offers[s.slot!]).toEqual({ def: s.def, price: s.price, sold: false });
            expect(f.members).toContain(s.def);
            expect(ownedDefs(run).has(s.def!)).toBe(false);
            bought.push(s.def!);
          }
        },
        end: (run) => (last = run),
      });
      // the ledger: each dawn adds a win's income, each purchase costs its offer price, each reroll REROLL_COST
      let gold = START_GOLD, days = 0;
      for (const s of ledger) {
        expect(s.before).toBe(gold);
        if (s.act === "dawn") {
          days++;
          expect(s.day).toBe(days);
          expect(s.after).toBe(s.day === 1 ? START_GOLD : gold + incomeFor(s.day - 1, true));
        } else if (s.act === "buy") expect(s.after).toBe(gold - s.price!);
        else {
          expect(s.after).toBe(gold - REROLL_COST);
          rerolls++;
        }
        expect(s.after).toBeGreaterThanOrEqual(0);
        gold = s.after;
      }
      expect(days).toBe(RUN_DAYS);
      expect(out.gold).toBe(gold);
      expect(out.rerolls).toBe(ledger.filter((s) => s.act === "reroll").length);
      expect(out.memberGold).toBe(ledger.filter((s) => s.act === "buy").reduce((a, s) => a + s.price!, 0));
      buys += bought.length;
      // what it holds: its starting deck, untouched, and in cargo exactly the parts it bought
      const run = last!;
      expect(JSON.stringify(run.build)).toBe(JSON.stringify(heroStartBuild(hero, 1)));
      expect(run.inventory.map((i) => i.def).sort()).toEqual([...bought].sort());
      // 0.8.0 P1 (family map v2): turrets are family members, so the start deck's turret counts as owned without being bought (FURNACE's SCRAP CANNON in BURST and TWIN, WEAVER's DART GUN in SWARM)
      const start = heroStartBuild(hero, 1);
      const held = new Set([...start.items, ...start.mods, ...turretList(start)].map((x) => x.def));
      expect(out.owned).toBe(f.members.filter((m) => bought.includes(m) || held.has(m)).length);
      expect(out.day === null).toBe(out.owned < f.members.length);
    }
    expect(buys).toBeGreaterThan(0);
    expect(rerolls).toBeGreaterThan(0);
  });

  it("offerable matches the real caravan's day gates (legendaries from day 4, the ARCANE DEALER from day 3)", () => {
    for (let day = 1; day <= 4; day++) {
      const seen = new Set<string>();
      for (let seed = 1; seed <= 1500; seed++) {
        const run = newRun("furnace", seed, "luck-gates");
        run.day = day;
        run.shop.rerolls = 0;
        rollShop(run);
        for (const w of run.shop.wagons) for (const o of w.offers) seen.add(o.def);
      }
      for (const d of seen) expect(offerable(d, day), `${d} on day ${day}`).toBe(true);
      if (day === 3) expect([...seen].some((d) => ITEMS[d].merchant === "arcane")).toBe(true);
      if (day === 4) expect([...seen].some((d) => ITEMS[d].rarity === "legendary")).toBe(true);
    }
  });
});

describe("luck report: the TYPICAL buyer and the whole report", () => {
  it("reads the par player's own run: its day-10 deck is among what it owns", () => {
    for (const hero of HEROES) {
      const owned = typicalOwned(hero, 1);
      expect(owned.length).toBe(RUN_DAYS);
      const deck = playerRun(hero, RUN_DAYS, 1)[RUN_DAYS - 1].build;
      for (const d of [...deck.items, ...deck.mods, ...turretList(deck)].map((x) => x.def)) expect(owned[RUN_DAYS - 1].has(d)).toBe(true);
    }
  });

  it("a what-if change is undone after its runs, and the report's what-ifs leave ITEMS as they were", async () => {
    const before = JSON.stringify(ITEMS);
    const seen = withPatch({ def: "venom", rarity: "legendary", merchant: "arcane" }, () => `${ITEMS.venom.rarity} ${ITEMS.venom.merchant}`);
    expect(seen).toBe("legendary arcane");
    expect(JSON.stringify(ITEMS)).toBe(before);
    // 0.8.0 P1 (family map v2): POISON folded into SWARM, so the what-ifs run on PLATE, five members while wave 3 is off
    // (TOLLBOOTH, SIFTER, RIVETER, FLAK SCREEN, MANTLET), each tried one rarity up and with the ARCANE DEALER as merchant
    // 0.8.0 I1 (oracle 64485b535a06683c): with wave 3 off (wave3: false). Live, PLATE has 14 members and under the per-run
    // draw no family is flagged (the CHASER never completes PLATE), so a live report runs no what-if at all.
    const r = await luckReport({ runs: 2, seed: 1, heroes: ["furnace"], typical: false, families: ["PLATE"], whatif: 2, wave3: false });
    expect(r.whatif?.rows.map((w) => w.tag)).toEqual(["PLATE"]);
    // was 2: VENOM DRIP rare to epic, and the ARCANE DEALER as merchant. FLIP-X2 (REVIEW-NUM3 answer 2; REQ-BFG-069): PLATE
    // with wave 3 off is 7 members now, SIFTER out (dormant) and WARD BELL, MEND PRESS and MENDING LOOM in (the sustain
    // switch on; all three are PLATE), two changes each: 14 (was 10)
    expect(r.whatif?.rows[0].changes.length).toBe(14);
    expect(JSON.stringify(ITEMS)).toBe(before);
  });

  // 0.8.0 I1 (oracle 64485b535a06683c): a worker thread starts with the live switch (WAVE3_LIVE, on), so each job must
  // carry the report's wave3 and honour false too; in this process luckReport has already set the switch, which would
  // hide a job that ignores it. Here the job runs where the switch is live, as in a worker thread.
  it("a job runs with its own switch: wave3: false turns wave 3 off for it where the switch starts live (a worker thread)", () => {
    expect(wave3Live()).toBe(true);
    const plate = withWave3(() => familyTable().families.findIndex((f) => f.tag === "PLATE"), false);
    const job = { id: 0, kind: "chaser" as const, hero: "furnace" as HeroId, seeds: [1], family: plate };
    const off = runJob({ ...job, wave3: false }) as ChaserOut[];
    // PLATE with wave 3 off: TOLLBOOTH, SIFTER, RIVETER, FLAK SCREEN, MANTLET. FLIP-X2 (REVIEW-NUM3 answer 2; REQ-BFG-069):
    // TOLLBOOTH, RIVETER, FLAK SCREEN, MANTLET, WARD BELL, MEND PRESS, MENDING LOOM (SIFTER dormant; the sustain switch on): 7
    // (was 5)
    expect(off[0].missing.length).toBe(7);
    expect(JSON.stringify(off)).toBe(JSON.stringify(withWave3(() => runJob(job), false)));
    expect(wave3Live()).toBe(true); // put back after the job
    const live = runJob(job) as ChaserOut[];
    expect(live[0].missing.length).toBe(familyTable().families.find((f) => f.tag === "PLATE")!.members.length);
    // FLIP-X2 (REVIEW-NUM3 answer 2; REQ-BFG-069): live PLATE is 16, SIFTER out and the 3 sustain pieces in (was 14)
    expect(live[0].missing.length).toBe(16);
  });

  it("the same seeds give the same output", async () => {
    // 0.8.0 P1 (family map v2): three v2 families (were POISON, FRAY and SPEED, folded into SWARM and TEMPO)
    const opts = { runs: 3, seed: 5, heroes: HEROES, families: ["FORGE" as const, "HARASS" as const, "TEMPO" as const] };
    const a = await luckReport(opts), b = await luckReport(opts);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(renderMarkdown(b)).toBe(renderMarkdown(a));
    expect(a.luck.map((h) => h.families.map((f) => f.chaser.rate.n))).toEqual([[3, 3, 3], [3, 3, 3]]);
  });
});
