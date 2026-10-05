// Y6 (release Y; REQ-BFG-070, REQ-BFG-046; DESIGN-Y section 3 row 48 and section 4.1, R1's R2; REVIEW-STARD rulings R-1,
// R-2, point 4 and the VENOM spot-check; BRIEF-Y6): VENOM DRIP lengthens BURN, and POISON leaves the switch-on game, with
// the star switch on (content.ts STAR_RULES, withStarRules), against the same scene with it off where the base differs.
// - The data: VENOM's poison 2/4/7 becomes burnPlus +3/+6/+9 s; no def holds poison with the switch on.
// - The payload (Battle.applyHit, fireCore), on poison's paths: VENOMs on one belt add up, an OVERCLOCKER doubles it,
//   SPLITTER copies keep it, a COMPOUND shell adds both loads'.
// - The impact (Battle.impact): each BURN stack of that hit lasts BURN_TIME + burnPlus, and only then SLOW EMBERS' %
//   applies; ASH KINDLE's start stacks come from no hit and get none; a slug with burnPlus and no BURN adds nothing.
// - The battle: no poison event and the hull's pool stays 0 (the tick is inert with no source); VENOM alone deals nothing.
// - The caches: overclock.ts's WeakMap and stars.ts effectAt hand each switch state its own effect (on, off, on again).
import { describe, expect, it } from "vitest";
import { Battle, type Payload, type SideState, type SimEvent } from "../src/sim/battle";
import { BURN_DPS, BURN_TIME, CELL, ITEMS, withStarRules } from "../src/sim/content";
import type { Build } from "../src/sim/deck";
import { effectAt } from "../src/sim/stars";
import { boostable, chargeable, doubles, overclocked } from "../src/sim/overclock";
import { STARS, on, payload, probe } from "./y3.helpers";
import { barge, bench, SEED } from "./arsenal.bench";

const PLUS = [3, 6, 9] as const; // DESIGN-Y row 48's ladder: the face's numbers, the sim's (no rounding)

/** The barge with a hull no 20 s fight can empty, so every fight below runs its whole length. */
const wall = (): Build => ({ ...barge(), hullBonus: 50000 });

/** Side 0's rigs (the bench's, in uid order: their order on its belt) each hit slug `p` once, every rig online; `setup`
 *  may change the side first. Returns the slug and every copy the hits made (a later hit applies to the copies made so
 *  far, as Battle.applyTile does). */
function hitAll(b: Build, star: boolean, setup: (s: SideState) => void = () => {}, p: Payload = payload()): Payload[] {
  return withStarRules(() => {
    const bt = new Battle(b, barge(), 8), s = bt.sides[0];
    for (const g of s.gates) { g.online = true; g.commissionAt = 0; }
    setup(s);
    let all = [p];
    for (const g of [...s.gates].sort((x, y) => x.uid - y.uid)) {
      const h = g.hits[0], made: Payload[] = [];
      for (const q of all) {
        const copies = probe(bt).applyHit(s, { p: q, s: h.tile * CELL + CELL / 2, processed: h.tile, blocked: false }, h) as { p: Payload }[];
        made.push(...copies.map((c) => c.p));
      }
      all = [...all, ...made];
    }
    return all;
  }, star);
}

type ImpactProbe = { impact(pr: unknown): void; fireCore(s: SideState, tu: unknown, p: Payload, k: number, queued: number): void; projectiles: { payload: Payload; burn?: number }[] };
const HULL = { kind: "hull", ref: -1, cell: -1, x: 60, y: 60, weight: 1 } as const;

/** HOOK CHECK: Battle.impact of slug `p` from side 0 on the foe's bare hull (a projectile as fireCore builds one; `extra`:
 *  its core fields), in a battle of `b` against the barge. Returns the durations of the BURN stacks that hit added. */
function impactOnce(b: Build, star: boolean, p: Payload, extra: Record<string, unknown> = {}): number[] {
  return withStarRules(() => {
    const bt = new Battle(b, barge(), 8), foe = bt.sides[1], before = foe.hull.burns.length;
    (bt as unknown as ImpactProbe).impact({ id: 1, from: 0, turret: 0, payload: p, dmg: 10, t: 0, flight: 0, target: HULL, tx: 60, ty: 60, heavy: false, ...extra });
    return foe.hull.burns.slice(before).map((x) => x.t);
  }, star);
}

const slug = (burn: number, burnPlus?: number): Payload => ({ ...payload(), burn, ...(burnPlus !== undefined ? { burnPlus } : {}) });
const withRunes = (b: Build, ...ids: string[]): Build => ({ ...b, runes: ids.map((id) => ({ id })) });

/** A 20 s fight of `b` against the wall: its poison events, the most poison the foe's pool held (stacks, clock) at any
 *  tick, the BURN it dealt, and the foe's hull at the end. */
function fight(b: Build, star: boolean, secs = 20) {
  return withStarRules(() => {
    const bt = new Battle(b, wall(), SEED), foe = bt.sides[1];
    let poison = 0, stacks = 0, clock = 0;
    while (bt.t < secs && !bt.over) {
      bt.step();
      for (const e of bt.drainEvents() as SimEvent[]) if (e.type === "poison") poison++;
      stacks = Math.max(stacks, foe.hull.poison.stacks);
      clock = Math.max(clock, foe.hull.poison.t);
    }
    return { poison, stacks, clock, burnDealt: bt.sides[0].stats.burnDealt, hp: foe.hull.hp, over: bt.over };
  }, star);
}

describe("Y6 row 48: VENOM DRIP: each slug it hits burns +3/+6/+9 s longer; POISON leaves the switch-on game", () => {
  it("data: on, burnPlus 3/6/9 and no poison (off: poison 2/4/7, no burnPlus); on, no def holds poison at any star", () => {
    expect(on(() => STARS.map((s) => effectAt("venom", s).gate))).toEqual(PLUS.map((n) => ({ burnPlus: n })));
    expect(STARS.map((s) => effectAt("venom", s).gate)).toEqual([2, 4, 7].map((n) => ({ poison: n }))); // REVIEW-STARD's spot-check
    expect(on(() => Object.keys(ITEMS).filter((id) => STARS.some((s) => effectAt(id, s).gate?.poison)))).toEqual([]);
    expect(Object.keys(ITEMS).filter((id) => STARS.some((s) => effectAt(id, s).gate?.poison))).toEqual(["venom"]);
    expect(Object.keys(ITEMS).filter((id) => STARS.some((s) => effectAt(id, s).gate?.burnPlus))).toEqual([]); // off: no source
    // the rest of its def is the base's: a rare rig at 4 G, the alchemist's, no perk names
    expect(on(() => ({ ...ITEMS.venom, gate: undefined, levels: undefined }))).toEqual({ ...ITEMS.venom, gate: undefined, levels: undefined });
    expect(on(() => [ITEMS.venom.levels?.[2]?.perk, ITEMS.venom.levels?.[3]?.perk])).toEqual([undefined, undefined]);
  });

  it("hook: a VENOM hit gives the slug burnPlus +3/+6/+9 and no poison (off: poison 2/4/7 and no burnPlus)", () => {
    for (const s of STARS) {
      const [onP] = hitAll(bench([["venom", 4, 3, s]]), true), [offP] = hitAll(bench([["venom", 4, 3, s]]), false);
      expect([onP.burnPlus, onP.poison, onP.burn, onP.flat], `★${s} on`).toEqual([PLUS[s - 1], undefined, 0, 0]);
      expect([offP.burnPlus, offP.poison], `★${s} off`).toEqual([undefined, [2, 4, 7][s - 1]]);
    }
  });

  it("two VENOMs on one belt add up: ★1 + ★2 = +9 (off: 2 + 4 poison)", () => {
    const b = () => bench([["venom", 4, 4, 1], ["venom", 4, 3, 2]]);
    expect(hitAll(b(), true).map((p) => [p.burnPlus, p.poison])).toEqual([[9, undefined]]);
    expect(hitAll(b(), false).map((p) => [p.burnPlus, p.poison])).toEqual([[undefined, 6]]);
  });

  it("an OVERCLOCKER doubles it: its charge on the VENOM after it gives +6/+12/+18 (off: poison 4/8/14); a doubled hit too", () => {
    for (const s of STARS) {
      const b = () => bench([["overclocker", 4, 4, 1], ["venom", 4, 3, s]]);
      expect(hitAll(b(), true).map((p) => p.burnPlus), `★${s} on`).toEqual([2 * PLUS[s - 1]]);
      expect(hitAll(b(), false).map((p) => [p.burnPlus, p.poison]), `★${s} off`).toEqual([[undefined, 2 * [2, 4, 7][s - 1]]]);
      // ASSEMBLY LINE ★3 HOT START's doubling (GateState.hotUntil), the same helper (overclock.ts overclocked)
      const hot = hitAll(bench([["venom", 4, 3, s]]), true, (side) => { side.gates[0].hotUntil = 1e9; });
      expect(hot.map((p) => p.burnPlus), `★${s} hot`).toEqual([2 * PLUS[s - 1]]);
    }
  });

  it("SPLITTER copies keep it, the VENOM before or after the split (off: the copies keep the poison)", () => {
    const before = hitAll(bench([["venom", 4, 4, 2], ["splitter", 4, 3, 1]]), true);
    expect(before.map((p) => p.burnPlus)).toEqual([6, 6]);
    const after = hitAll(bench([["splitter", 4, 4, 1], ["venom", 4, 3, 2]]), true);
    expect(after.map((p) => p.burnPlus)).toEqual([6, 6]);
    expect(hitAll(bench([["venom", 4, 4, 2], ["splitter", 4, 3, 1]]), false).map((p) => [p.burnPlus, p.poison])).toEqual([[undefined, 4], [undefined, 4]]);
  });

  it("a COMPOUND shell adds both loads' (fireCore): +3 and +6 make +9, and its BURN stacks last BURN_TIME + 9", () => {
    withStarRules(() => {
      const bt = new Battle(bench([], [["compound", 1]]), barge(), 8), s = bt.sides[0], tu = s.turrets[0];
      const pb = bt as unknown as ImpactProbe;
      const p = slug(2, 3);
      p.compound = slug(1, 6);
      pb.fireCore(s, tu, p, 0, 0);
      const pr = pb.projectiles[pb.projectiles.length - 1];
      expect([pr.payload.burnPlus, pr.payload.burn, pr.burn]).toEqual([9, 3, 3]);
      // one load with none: the shell carries the other's
      const lone = slug(1);
      lone.compound = slug(1, 6);
      pb.fireCore(s, tu, lone, 0, 0);
      expect(pb.projectiles[pb.projectiles.length - 1].payload.burnPlus).toBe(6);
    });
    expect(impactOnce(bench(), true, slug(3, 9))).toEqual([BURN_TIME + 9]);
  });

  it("a COMPOUND battle: on a BURN belt through a VENOM ★1, once the VENOM works every shell packs two loads' +3: +6", () => {
    const shells: number[] = [];
    withStarRules(() => {
      const bt = new Battle(bench([["temper", 4, 4, 1], ["venom", 4, 3, 1]], [["compound", 1]]), wall(), SEED);
      while (bt.t < 15 && !bt.over) {
        bt.step();
        bt.drainEvents();
        // from 6 s: the slugs stamped before the VENOM came online (1.2 s + 0.6 s for the rig before it) are long fired
        if (bt.t >= 6) for (const pr of (bt as unknown as ImpactProbe).projectiles) if (pr.payload.compound) shells.push(pr.payload.burnPlus ?? 0);
      }
    });
    expect(shells.length).toBeGreaterThan(0);
    expect(new Set(shells)).toEqual(new Set([6]));
  });

  it("impact: each BURN stack of that hit lasts BURN_TIME + burnPlus (3 s + 3/6/9); no VENOM: BURN_TIME, as before", () => {
    for (const s of STARS) expect(impactOnce(bench(), true, slug(4, PLUS[s - 1])), `★${s}`).toEqual([BURN_TIME + PLUS[s - 1]]);
    expect(impactOnce(bench(), true, slug(4))).toEqual([BURN_TIME]);
    expect(impactOnce(bench(), false, slug(4))).toEqual([BURN_TIME]);
    // a SCATTER pellet's share of the BURN (pr.burn) lasts as long: the payload's seconds
    expect(impactOnce(bench(), true, slug(4, 6), { burn: 2 })).toEqual([BURN_TIME + 6]);
    // DESIGN-Y's example: a TEMPER ★3's 4 BURN deals 120 over BURN_TIME; with VENOM ★1, 240
    expect([4 * BURN_DPS * BURN_TIME, 4 * BURN_DPS * (BURN_TIME + PLUS[0])]).toEqual([120, 240]);
  });

  it("SLOW EMBERS' % applies after: (BURN_TIME + burnPlus) x 1.75, not BURN_TIME x 1.75 + burnPlus", () => {
    const b = withRunes(bench(), "slow_embers");
    expect(withStarRules(() => new Battle(b, barge(), 8).sides[0].rune?.burnTime)).toBe(75);
    for (const s of STARS) expect(impactOnce(b, true, slug(4, PLUS[s - 1])), `★${s}`).toEqual([(BURN_TIME + PLUS[s - 1]) * 1.75]);
    expect(impactOnce(b, true, slug(4))).toEqual([BURN_TIME * 1.75]);
    expect(impactOnce(b, false, slug(4))).toEqual([BURN_TIME * 1.75]);
  });

  it("the runes: EMBER SHOT's BURN on that hit lasts as long (a stack of that hit); ASH KINDLE's start stacks come from no hit: none", () => {
    expect(impactOnce(withRunes(bench(), "ember_shot"), true, slug(2, 6), { runeBurn: 1 })).toEqual([BURN_TIME + 6, BURN_TIME + 6]);
    // ASH KINDLE: the foe's start stacks, on a deck whose belt runs a VENOM ★3: BURN_TIME (x SLOW EMBERS with it)
    const start = (b: Build) => withStarRules(() => new Battle(b, barge(), 8).sides[1].hull.burns.map((x) => x.t));
    expect(start(withRunes(bench([["venom", 4, 3, 3]]), "ash_kindle"))).toEqual([BURN_TIME]);
    expect(start(withRunes(bench([["venom", 4, 3, 3]]), "ash_kindle", "slow_embers"))).toEqual([BURN_TIME * 1.75]);
  });

  it("a slug with burnPlus and no BURN adds nothing: no stack, and the hit's damage as without it", () => {
    for (const s of STARS) expect(impactOnce(bench(), true, slug(0, PLUS[s - 1])), `★${s}`).toEqual([]);
    const hp = (p: Payload) => withStarRules(() => {
      const bt = new Battle(bench(), barge(), 8);
      (bt as unknown as ImpactProbe).impact({ id: 1, from: 0, turret: 0, payload: p, dmg: 37, t: 0, flight: 0, target: HULL, tx: 60, ty: 60, heavy: false });
      return [bt.sides[1].hull.hp, bt.sides[1].hull.poison.stacks];
    });
    expect(hp(slug(0, 9))).toEqual(hp(slug(0)));
  });

  it("battle: on, VENOM ★1-★3 on a BURN belt (TEMPER ★3) emits no poison event and the foe's pool stays 0; its BURN deals more", () => {
    const burnBelt = (s?: number) => bench([["temper", 4, 4, 3], ...(s ? [["venom", 4, 3, s] as [string, number, number, number]] : [])]);
    const none = fight(burnBelt(), true);
    let last = none.burnDealt;
    for (const s of STARS) {
      const f = fight(burnBelt(s), true);
      expect([f.poison, f.stacks, f.clock, f.over], `★${s}`).toEqual([0, 0, 0, false]);
      expect(f.burnDealt, `★${s}: more BURN than the star below`).toBeGreaterThan(last);
      last = f.burnDealt;
    }
    // ★1 lengthens each stack from 3 s to 6 s: at most twice the BURN, less where the fight's end cuts the last stacks
    // (in this 20 s fight 2,080 against 1,200)
    const one = fight(burnBelt(1), true).burnDealt;
    expect(one).toBeLessThanOrEqual(2 * none.burnDealt);
    expect(one).toBeGreaterThan(1.5 * none.burnDealt);
    // off: VENOM poisons (events, a pool), and its BURN is the plain belt's
    const off = fight(burnBelt(3), false);
    expect(off.poison).toBeGreaterThan(0);
    expect(off.stacks).toBeGreaterThan(0);
    expect(off.burnDealt).toBe(fight(burnBelt(), false).burnDealt);
  });

  it("battle: VENOM alone deals nothing on (the foe's hull as with no rig, no poison); off its poison deals damage", () => {
    const alone = fight(bench([["venom", 4, 3, 3]]), true), bare = fight(bench(), true);
    expect([alone.hp, alone.burnDealt, alone.poison, alone.stacks]).toEqual([bare.hp, bare.burnDealt, 0, 0]);
    expect(fight(bench([["venom", 4, 3, 3]]), false).hp).toBeLessThan(fight(bench(), false).hp);
  });

  it("caches: overclock.ts's WeakMap and stars.ts effectAt hand each switch state its own effect (on, off, on again)", () => {
    const read = () => STARS.map((s) => overclocked(effectAt("venom", s).gate!));
    const a = on(read), b = read(), c = on(read);
    expect(a).toEqual(PLUS.map((n) => ({ burnPlus: 2 * n })));
    expect(b).toEqual([4, 8, 14].map((n) => ({ poison: n })));
    expect(c).toEqual(a);
    // boostable and chargeable on (the OVERCLOCKER charges it and doubling changes its number: the rating's chargeGains)
    expect(on(() => STARS.map((s) => { const e = effectAt("venom", s).gate!; return [boostable(e), chargeable(e), doubles(e)]; })))
      .toEqual(STARS.map(() => [true, true, true]));
    expect(STARS.map((s) => boostable(effectAt("venom", s).gate!))).toEqual([true, true, true]); // off: its poison, as before
  });
});
