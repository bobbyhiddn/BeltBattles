// ENCHANT-1 (REQ-BFG-085; BRIEF-ENCHANT1 E3, E4; run 5): the two rules the code reviewers found broken in run 4.
//  1. ECHOING on a factory counts WORKS, not slugs ("every 5th time it works: 1 more slug", the shipped line): a batch (DOUBLE STAMP,
//     SHOT TOWER) and a pour (TWIN MOULD, the CRUCIBLE) are one work; a factory that makes one slug a work counts as before.
//  2. A factory that holds WIDE and feeds more belts than its own outputs keeps WIDE: APPLY refuses another word on it (a turret has its
//     trim, a belt has no cargo), a merge keeps WIDE without a pick, and the merge pick refuses to take the other word.
import { afterEach, describe, expect, it } from "vitest";
import { Battle, type Payload } from "../src/sim/battle";
import { cloneBuild, type Build } from "../src/sim/deck";
import { ENCHANT, ENCHANT_NUM, setEnchant, withEnchant } from "../src/sim/enchant";
import { makeEnchantState, slugMadeFx } from "../src/sim/enchantFx";
import { outputsAt } from "../src/sim/stars";
import { EXTRA_BELT_LEFT, KEPT_WIDE, extraBeltInUse, gainModule, pickMergedWord } from "../src/game/fuse";
import { applyProblem, buyEnchant, enchantChoices } from "../src/game/enchanter";
import { newRun, type Run } from "../src/game/run";
import { SEED, barge, furnaceBench, item, K } from "./wave3.helpers";

afterEach(() => setEnchant(ENCHANT));
const on = <T>(fn: () => T): T => withEnchant(fn, true);
const E = ENCHANT_NUM.echoEvery;

const bare = (): Payload => ({ id: 1, ammo: "plain", ride: 0, mult: 1, flat: 0, burn: 0, shock: false, prior: 0, factory: 1, copy: false });

describe("ENCHANT-1 run 5: ECHOING on a factory counts works (slugMadeFx)", () => {
  it("a batch's waiting slugs are part of its work: only the first slug of the Eth work owes the copy", () => {
    on(() => {
      const st = makeEnchantState({ ench: "echoing" }, 1)!;
      const flags: boolean[] = [];
      for (let w = 1; w <= 2 * E; w++) {
        flags.push(slugMadeFx(st, bare(), w * 2.1, false)); // the work's first slug (batch 2: pending was 0)
        flags.push(slugMadeFx(st, bare(), w * 2.1 + 0.4, true)); // its waiting slug, a few ticks later (pending above 0)
      }
      expect(flags.map((f, i) => (f ? i : -1)).filter((i) => i >= 0)).toEqual([2 * (E - 1), 2 * (2 * E - 1)]); // the first slug of works E and 2E
      expect(st.works).toBe(2 * E);
      expect(st.n).toBe(4 * E); // RISING's count is still slugs
    });
  });
  it("a pour (several slugs on one tick) is one work", () => {
    on(() => {
      const st = makeEnchantState({ ench: "echoing" }, 1)!;
      let owed = 0;
      for (let w = 1; w <= E; w++) for (let k = 0; k < 3; k++) if (slugMadeFx(st, bare(), w * 1.5, false)) owed++; // 3 slugs a pour, one tick
      expect(owed).toBe(1);
      expect(st.works).toBe(E);
    });
  });
  it("a call with no time keeps counting slugs (one slug, one work): the factory that makes one slug a work is unchanged", () => {
    on(() => {
      const st = makeEnchantState({ ench: "echoing" }, 1)!;
      const flags = Array.from({ length: 2 * E }, () => slugMadeFx(st, bare()));
      expect(flags).toEqual(Array.from({ length: 2 * E }, (_, i) => (i + 1) % E === 0));
    });
  });
  it("in a fight: a DOUBLE STAMP (batch 2) earns a copy every Eth WORK, not every Eth slug; a KILN earns the same as before", () => {
    const deck = (def: string, ench?: string): Build => {
      const b = furnaceBench();
      return def === "kiln"
        ? { ...b, items: b.items.map((p) => (p.uid === 1 ? { ...p, ...(ench ? { ench } : {}) } : p)) }
        : { ...b, items: [{ ...item(2, def, 2, 6, 0, 1), ...(ench ? { ench } : {}) }, { uid: 1, def: "kiln", x: 0, y: 8 }], routes: [{ factory: 2, cells: [K(3, 5), K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] }] };
    };
    const fight = (b: Build, secs: number) => {
      const bt = new Battle(b, barge(), SEED);
      while (bt.t < secs && !bt.over) { bt.step(); bt.drainEvents(); }
      const f = bt.sides[0].factories.find((x) => x.uid === (b.items.some((p) => p.uid === 2) ? 2 : 1))!;
      return { produced: f.produced, n: f.ench?.n ?? 0, works: f.ench?.works ?? 0 };
    };
    on(() => {
      const d = fight(deck("doublestamp", "echoing"), 30);
      expect(d.works).toBeGreaterThanOrEqual(2 * E); // enough works for two copies
      expect(d.n).toBeGreaterThanOrEqual(2 * d.works - 1); // a batch of 2: about two slugs a work (the last may still be waiting)
      expect(d.n).toBeLessThanOrEqual(2 * d.works);
      const copies = d.produced - d.n; // slugs put on the belt that no stamp made: the echoes
      expect(copies).toBeLessThanOrEqual(Math.floor(d.works / E));
      expect(copies).toBeGreaterThanOrEqual(Math.floor(d.works / E) - 1); // the last copy may still wait in the mouth
      expect(copies).toBeLessThan(Math.floor(d.n / E)); // counting slugs would have given about twice as many
      const k = fight(deck("kiln", "echoing"), 30);
      expect(k.n).toBe(k.works); // one slug a work
      expect(k.produced - k.n).toBeLessThanOrEqual(Math.floor(k.n / E));
      expect(k.produced - k.n).toBeGreaterThanOrEqual(Math.floor(k.n / E) - 1);
    });
  });
});

// ------------------------------------------------------------------------------------------------------------ WIDE on a factory

/** A furnace run on day 3 with 50 G and a bought DOUBLE STAMP (uid 200, ★1) holding WIDE with `belts` belts; the ENCHANTER sells FIERY. */
function runWith(belts: number, stars = 1): Run {
  const run = newRun("furnace", 5);
  run.day = 3;
  run.gold = 50;
  run.build.items.push({ uid: 200, def: "doublestamp", x: 6, y: 6, ench: "wide", ...(stars > 1 ? { stars } : {}) });
  for (let i = 0; i < belts; i++) run.build.routes.push({ factory: 200, cells: [] }); // only the count of belts matters to the rule
  run.shop.enchanter = { day: 3, offers: [{ ench: "fiery", price: 4, sold: false }, { ench: "rising", price: 4, sold: false }] };
  return run;
}
const word = (run: Run, uid: number) => run.build.items.find((p) => p.uid === uid)?.ench;
const target = { kind: "item", uid: 200 } as const;

describe("ENCHANT-1 run 5: a factory using WIDE's extra belt keeps WIDE", () => {
  const outs = outputsAt("doublestamp", 1); // 2 at ★1

  it("extraBeltInUse: only a WIDE factory with more belts than its own outputs", () => {
    on(() => {
      expect(extraBeltInUse(runWith(outs), 200)).toBe(false); // the slot is free
      expect(extraBeltInUse(runWith(outs + 1), 200)).toBe(true);
      const plain = runWith(outs + 1);
      delete plain.build.items.find((p) => p.uid === 200)!.ench;
      expect(extraBeltInUse(plain, 200)).toBe(false); // no WIDE
      expect(extraBeltInUse(runWith(outs + 1), 1)).toBe(false); // the KILN holds no WIDE
    });
    expect(extraBeltInUse(runWith(outs + 1), 200)).toBe(false); // switch off: nothing sees a word
  });
  it("APPLY: another word is refused with the reason, no gold is taken, the offer stays, the glow is off; the same word and a free slot are not affected", () => {
    on(() => {
      const run = runWith(outs + 1);
      expect(applyProblem(run, target, "fiery")).toBe(EXTRA_BELT_LEFT);
      expect(EXTRA_BELT_LEFT).toBe("TAKE ITS EXTRA BELT OFF FIRST");
      const row = enchantChoices(run, "fiery").find((c) => c.target.kind === "item" && c.target.uid === 200)!;
      expect(row.reason).toBe(EXTRA_BELT_LEFT);
      expect(row.held).toBe("wide");
      const r = buyEnchant(run, 0, target, { replace: true });
      expect(r).toEqual({ ok: false, reason: EXTRA_BELT_LEFT });
      expect(run.gold).toBe(50);
      expect(run.shop.enchanter!.offers[0].sold).toBe(false);
      expect(word(run, 200)).toBe("wide");
      // WIDE again on it is the old answer (ALREADY WIDE), not this one
      expect(applyProblem(run, target, "wide")).toBeNull();
      // the belt taken off: the replace asks, then goes through
      run.build.routes.pop();
      expect(extraBeltInUse(run, 200)).toBe(false);
      expect(applyProblem(run, target, "fiery")).toBeNull();
      expect(buyEnchant(run, 0, target, {})).toMatchObject({ ok: false, needReplace: "wide" });
      expect(buyEnchant(run, 0, target, { replace: true })).toMatchObject({ ok: true, replaced: "wide" });
      expect(word(run, 200)).toBe("fiery");
      expect(run.gold).toBe(46);
    });
  });
  it("a merge keeps WIDE without a pick when its extra belt would be left over at the new stars; the bots' chooser cannot take the other word", () => {
    for (const choose of [undefined, ({ a, b }: { a: { ench?: string }; b: { ench?: string } }) => (b.ench === "fiery" ? b : a)]) {
      on(() => {
        const run = runWith(outputsAt("doublestamp", 3) + 1, 1); // 5 belts; the two merges make ★3, whose own outputs are 4
        run.inventory.push({ uid: 201, def: "doublestamp", stars: 2, ench: "fiery" }); // the new ★1 joins 200 (★2), which then meets 201 (★2)
        const g = gainModule(run, "doublestamp", undefined, 1, choose ? { choose } : undefined);
        expect(g.steps.map((s) => s.stars)).toEqual([2, 3]);
        expect(word(run, 200)).toBe("wide");
        expect(run.enchMerge).toBeUndefined(); // no pick to make
        expect(run.fuseFx).toContain(KEPT_WIDE);
        expect(KEPT_WIDE).toBe("KEPT WIDE: ITS EXTRA BELT IS IN USE");
      });
    }
  });
  it("a merge whose extra belt is free (the stars made room) opens the pick as before, and the pick takes the other word", () => {
    on(() => {
      const run = runWith(outputsAt("doublestamp", 3), 1); // 4 belts at ★3: its own outputs
      run.inventory.push({ uid: 201, def: "doublestamp", stars: 2, ench: "fiery" });
      gainModule(run, "doublestamp");
      expect(run.enchMerge).toMatchObject({ uid: 200, kept: { ench: "wide" }, lost: { ench: "fiery" } });
      expect(pickMergedWord(run, true)).toBe(true);
      expect(word(run, 200)).toBe("fiery");
    });
  });
  it("an open pick refuses the other word once the extra belt is laid, and stays open; keeping WIDE still closes it", () => {
    on(() => {
      const run = runWith(outputsAt("doublestamp", 3), 1);
      run.inventory.push({ uid: 201, def: "doublestamp", stars: 2, ench: "fiery" });
      gainModule(run, "doublestamp");
      expect(run.enchMerge).toBeDefined();
      run.build.routes.push({ factory: 200, cells: [] }); // the player lays the extra belt before answering
      expect(pickMergedWord(run, true)).toBe(false);
      expect(run.enchMerge).toBeDefined(); // still open
      expect(word(run, 200)).toBe("wide");
      expect(pickMergedWord(run, false)).toBe(true);
      expect(run.enchMerge).toBeUndefined();
      expect(word(run, 200)).toBe("wide");
    });
  });
  it("a copy of the deck is not touched by the check (it reads, it never writes)", () => {
    on(() => {
      const run = runWith(outs + 1);
      const before = JSON.stringify(cloneBuild(run.build));
      extraBeltInUse(run, 200);
      applyProblem(run, target, "fiery");
      enchantChoices(run, "fiery");
      expect(JSON.stringify(run.build)).toBe(before);
    });
  });
});
