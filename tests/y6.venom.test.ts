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
import { Battle, type Payload, type SideState } from "../src/sim/battle";
import { BURN_DPS, BURN_TIME, CELL, ITEMS } from "../src/sim/content";
import type { Build } from "../src/sim/deck";
import { effectAt } from "../src/sim/stars";
import { boostable, doubles, overclocked } from "../src/sim/overclock";
import { STARS, lines, levels, next, oneLine, payload, probe, px } from "./y3.helpers";
import { barge, bench, SEED } from "./arsenal.bench";
import { faceAt, hasFace, Y6_PIECES } from "../src/ui/faces";
import { fmtSec } from "../src/ui/statFormat"; // WORDS-1: its plain chip's seconds
import { perkInfoOnly } from "../src/screens/build/faceBlocks";
import { shopChip } from "../src/ui/chips";

const PLUS = [3, 6, 9] as const; // DESIGN-Y row 48's ladder: the face's numbers, the sim's (no rounding)
/** Y7b2 (the flip): POISON left the sim (no Payload.poison, no gate poison, no hull pool, no "poison" event), so the checks
 *  that none is there read the old field loosely (undefined). */
const poisonOf = (x: object | undefined): unknown => (x as { poison?: unknown } | undefined)?.poison;

/** The barge with a hull no 20 s fight can empty, so every fight below runs its whole length. */
const wall = (): Build => ({ ...barge(), hullBonus: 50000 });

/** Side 0's rigs (the bench's, in uid order: their order on its belt) each hit slug `p` once, every rig online; `setup`
 *  may change the side first. Returns the slug and every copy the hits made (a later hit applies to the copies made so
 *  far, as Battle.applyTile does). */
function hitAll(b: Build, setup: (s: SideState) => void = () => {}, p: Payload = payload()): Payload[] {
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
}

type ImpactProbe = { impact(pr: unknown): void; fireCore(s: SideState, tu: unknown, p: Payload, k: number, queued: number): void; projectiles: { payload: Payload; burn?: number }[] };
const HULL = { kind: "hull", ref: -1, cell: -1, x: 60, y: 60, weight: 1 } as const;

/** HOOK CHECK: Battle.impact of slug `p` from side 0 on the foe's bare hull (a projectile as fireCore builds one; `extra`:
 *  its core fields), in a battle of `b` against the barge. Returns the durations of the BURN stacks that hit added. */
function impactOnce(b: Build, p: Payload, extra: Record<string, unknown> = {}): number[] {
  const bt = new Battle(b, barge(), 8), foe = bt.sides[1], before = foe.hull.burns.length;
  (bt as unknown as ImpactProbe).impact({ id: 1, from: 0, turret: 0, payload: p, dmg: 10, t: 0, flight: 0, target: HULL, tx: 60, ty: 60, heavy: false, ...extra });
  return foe.hull.burns.slice(before).map((x) => x.t);
}

const slug = (burn: number, burnPlus?: number): Payload => ({ ...payload(), burn, ...(burnPlus !== undefined ? { burnPlus } : {}) });
const withRunes = (b: Build, ...ids: string[]): Build => ({ ...b, runes: ids.map((id) => ({ id })) });

/** A 20 s fight of `b` against the wall: its poison events, the most poison the foe's pool held (stacks, clock) at any
 *  tick, the BURN it dealt, and the foe's hull at the end. */
function fight(b: Build, secs = 20) {
  const bt = new Battle(b, wall(), SEED), foe = bt.sides[1];
  const pool = () => poisonOf(foe.hull) as { stacks: number; t: number } | undefined;
  let poison = 0, stacks = 0, clock = 0;
  while (bt.t < secs && !bt.over) {
    bt.step();
    for (const e of bt.drainEvents() as { type: string }[]) if (e.type === "poison") poison++;
    stacks = Math.max(stacks, pool()?.stacks ?? 0);
    clock = Math.max(clock, pool()?.t ?? 0);
  }
  return { poison, stacks, clock, burnDealt: bt.sides[0].stats.burnDealt, hp: foe.hull.hp, over: bt.over };
}

describe("Y6 row 48: VENOM DRIP: each slug it hits burns +3/+6/+9 s longer; POISON leaves the switch-on game", () => {
  it("data: on, burnPlus 3/6/9 and no poison (off: poison 2/4/7, no burnPlus); on, no def holds poison at any star", () => {
    expect(STARS.map((s) => effectAt("venom", s).gate)).toEqual(PLUS.map((n) => ({ burnPlus: n })));
    expect(Object.keys(ITEMS).filter((id) => STARS.some((s) => poisonOf(effectAt(id, s).gate)))).toEqual([]);
    // no perk names
    expect([ITEMS.venom.levels?.[2]?.perk, ITEMS.venom.levels?.[3]?.perk]).toEqual([undefined, undefined]);
  });

  it("hook: a VENOM hit gives the slug burnPlus +3/+6/+9 and no poison (off: poison 2/4/7 and no burnPlus)", () => {
    for (const s of STARS) {
      const [onP] = hitAll(bench([["venom", 4, 3, s]]));
      expect([onP.burnPlus, poisonOf(onP), onP.burn, onP.flat], `★${s}`).toEqual([PLUS[s - 1], undefined, 0, 0]);
    }
  });

  it("two VENOMs on one belt add up: ★1 + ★2 = +9 (off: 2 + 4 poison)", () => {
    const b = () => bench([["venom", 4, 4, 1], ["venom", 4, 3, 2]]);
    expect(hitAll(b()).map((p) => [p.burnPlus, poisonOf(p)])).toEqual([[9, undefined]]);
  });

  it("an OVERCLOCKER doubles it: its charge on the VENOM after it gives +6/+12/+18 (off: poison 4/8/14); a doubled hit too", () => {
    for (const s of STARS) {
      const b = () => bench([["overclocker", 4, 4, 1], ["venom", 4, 3, s]]);
      expect(hitAll(b()).map((p) => p.burnPlus), `★${s}`).toEqual([2 * PLUS[s - 1]]);
      // ASSEMBLY LINE ★3 HOT START's doubling (GateState.hotUntil), the same helper (overclock.ts overclocked)
      const hot = hitAll(bench([["venom", 4, 3, s]]), (side) => { side.gates[0].hotUntil = 1e9; });
      expect(hot.map((p) => p.burnPlus), `★${s} hot`).toEqual([2 * PLUS[s - 1]]);
    }
  });

  it("SPLITTER copies keep it, the VENOM before or after the split (off: the copies keep the poison)", () => {
    const before = hitAll(bench([["venom", 4, 4, 2], ["splitter", 4, 3, 1]]));
    expect(before.map((p) => p.burnPlus)).toEqual([6, 6]);
    const after = hitAll(bench([["splitter", 4, 4, 1], ["venom", 4, 3, 2]]));
    expect(after.map((p) => p.burnPlus)).toEqual([6, 6]);
  });

  it("a COMPOUND shell adds both loads' (fireCore): +3 and +6 make +9, and its BURN stacks last BURN_TIME + 9", () => {
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
    expect(impactOnce(bench(), slug(3, 9))).toEqual([BURN_TIME + 9]);
  });

  it("a COMPOUND battle: on a BURN belt through a VENOM ★1, once the VENOM works every shell packs two loads' +3: +6", () => {
    const shells: number[] = [];
    const bt = new Battle(bench([["temper", 4, 4, 1], ["venom", 4, 3, 1]], [["compound", 1]]), wall(), SEED);
    while (bt.t < 15 && !bt.over) {
      bt.step();
      bt.drainEvents();
      // from 6 s: the slugs stamped before the VENOM came online (1.2 s + 0.6 s for the rig before it) are long fired
      if (bt.t >= 6) for (const pr of (bt as unknown as ImpactProbe).projectiles) if (pr.payload.compound) shells.push(pr.payload.burnPlus ?? 0);
    }
    expect(shells.length).toBeGreaterThan(0);
    expect(new Set(shells)).toEqual(new Set([6]));
  });

  it("impact: each BURN stack of that hit lasts BURN_TIME + burnPlus (3 s + 3/6/9); no VENOM: BURN_TIME, as before", () => {
    for (const s of STARS) expect(impactOnce(bench(), slug(4, PLUS[s - 1])), `★${s}`).toEqual([BURN_TIME + PLUS[s - 1]]);
    expect(impactOnce(bench(), slug(4))).toEqual([BURN_TIME]);
    // a SCATTER pellet's share of the BURN (pr.burn) lasts as long: the payload's seconds
    expect(impactOnce(bench(), slug(4, 6), { burn: 2 })).toEqual([BURN_TIME + 6]);
    // DESIGN-Y's example: a TEMPER ★3's 4 BURN deals 120 over BURN_TIME; with VENOM ★1, 240
    expect([4 * BURN_DPS * BURN_TIME, 4 * BURN_DPS * (BURN_TIME + PLUS[0])]).toEqual([120, 240]);
  });

  it("SLOW EMBERS' % applies after: (BURN_TIME + burnPlus) x 1.75, not BURN_TIME x 1.75 + burnPlus", () => {
    const b = withRunes(bench(), "slow_embers");
    expect(new Battle(b, barge(), 8).sides[0].rune?.burnTime).toBe(75);
    for (const s of STARS) expect(impactOnce(b, slug(4, PLUS[s - 1])), `★${s}`).toEqual([(BURN_TIME + PLUS[s - 1]) * 1.75]);
    expect(impactOnce(b, slug(4))).toEqual([BURN_TIME * 1.75]);
  });

  it("the runes: EMBER SHOT's BURN on that hit lasts as long (a stack of that hit); ASH KINDLE's start stacks come from no hit: none", () => {
    expect(impactOnce(withRunes(bench(), "ember_shot"), slug(2, 6), { runeBurn: 1 })).toEqual([BURN_TIME + 6, BURN_TIME + 6]);
    // ASH KINDLE: the foe's start stacks, on a deck whose belt runs a VENOM ★3: BURN_TIME (x SLOW EMBERS with it)
    const start = (b: Build) => new Battle(b, barge(), 8).sides[1].hull.burns.map((x) => x.t);
    expect(start(withRunes(bench([["venom", 4, 3, 3]]), "ash_kindle"))).toEqual([BURN_TIME]);
    expect(start(withRunes(bench([["venom", 4, 3, 3]]), "ash_kindle", "slow_embers"))).toEqual([BURN_TIME * 1.75]);
  });

  it("a slug with burnPlus and no BURN adds nothing: no stack, and the hit's damage as without it", () => {
    for (const s of STARS) expect(impactOnce(bench(), slug(0, PLUS[s - 1])), `★${s}`).toEqual([]);
    const hp = (p: Payload) => {
      const bt = new Battle(bench(), barge(), 8);
      (bt as unknown as ImpactProbe).impact({ id: 1, from: 0, turret: 0, payload: p, dmg: 37, t: 0, flight: 0, target: HULL, tx: 60, ty: 60, heavy: false });
      return [bt.sides[1].hull.hp, (poisonOf(bt.sides[1].hull) as { stacks: number } | undefined)?.stacks ?? 0];
    };
    expect(hp(slug(0, 9))).toEqual(hp(slug(0)));
  });

  it("battle: on, VENOM ★1-★3 on a BURN belt (TEMPER ★3) emits no poison event and the foe's pool stays 0; its BURN deals more", () => {
    const burnBelt = (s?: number) => bench([["temper", 4, 4, 3], ...(s ? [["venom", 4, 3, s] as [string, number, number, number]] : [])]);
    const none = fight(burnBelt());
    let last = none.burnDealt;
    for (const s of STARS) {
      const f = fight(burnBelt(s));
      expect([f.poison, f.stacks, f.clock, f.over], `★${s}`).toEqual([0, 0, 0, false]);
      expect(f.burnDealt, `★${s}: more BURN than the star below`).toBeGreaterThan(last);
      last = f.burnDealt;
    }
    // ★1 lengthens each stack from 3 s to 6 s: at most twice the BURN, less where the fight's end cuts the last stacks
    // (in this 20 s fight 2,080 against 1,200)
    const one = fight(burnBelt(1)).burnDealt;
    expect(one).toBeLessThanOrEqual(2 * none.burnDealt);
    expect(one).toBeGreaterThan(1.5 * none.burnDealt);
  });

  it("battle: VENOM alone deals nothing on (the foe's hull as with no rig, no poison); off its poison deals damage", () => {
    const alone = fight(bench([["venom", 4, 3, 3]])), bare = fight(bench());
    expect([alone.hp, alone.burnDealt, alone.poison, alone.stacks]).toEqual([bare.hp, bare.burnDealt, 0, 0]);
  });

  // Y7b2 (the flip): was "caches: overclock.ts's WeakMap and stars.ts effectAt hand each switch state its own effect (on,
  // off, on again)"; the off read ({ poison: 4/8/14 }) and the on-again read left with the switch
  it("overclock.ts: overclocked doubles its burnPlus (+6/+12/+18); it is boostable and doubles", () => {
    const read = () => STARS.map((s) => overclocked(effectAt("venom", s).gate!));
    expect(read()).toEqual(PLUS.map((n) => ({ burnPlus: 2 * n })));
    // boostable on (the OVERCLOCKER charges it and doubling changes its number: the rating's chargeGains). Y7b2 (the flip):
    // was [boostable(e), chargeable(e), doubles(e)] = [true, true, true]; the flip deleted chargeable (every rig takes a charge)
    expect(STARS.map((s) => { const e = effectAt("venom", s).gate!; return [boostable(e), doubles(e)]; }))
      .toEqual(STARS.map(() => [true, true]));
  });
});

describe("Y6 row 48: VENOM DRIP's face and ladder (DESIGN-Y: HIT: ITS [BURN]BURN LASTS +3[SEC]., 133 px; +3/+6/+9[SEC])", () => {
  it("face: one line HIT: ITS {*BURN} LASTS +3/+6/+9{SEC}. (133 px at every star), BURN's reminder; off, no face (its RULES text)", () => {
    expect(Y6_PIECES).toEqual(["venom"]);
    oneLine("venom"); // one line in the band, no clause, no caveat, no perk on the face; every ⓘ line in the band
    expect(lines("venom")).toEqual(PLUS.map((n) => [`HIT: ITS {*BURN} LASTS +${n}{SEC}.`]));
    expect(lines("venom").map((l) => px(l[0]))).toEqual([133, 133, 133]);
    expect(STARS.map((s) => faceAt("venom", s)!.reminders)).toEqual(STARS.map(() => ["EACH {*BURN}: 10 HULL DAMAGE A SEC FOR 3{SEC}."]));
    for (const s of STARS) expect(JSON.stringify(faceAt("venom", s))).not.toMatch(/POISON/);
    expect(hasFace("venom")).toBe(true);
    // no perk names (R-1: nothing to move to the ⓘ view); it is on the switch's list all the same
    expect(perkInfoOnly("venom")).toBe(true);
  });

  it("ⓘ LEVELS: the ladder +3/+6/+9{SEC} (53 px) and NEXT★ (63 px); off, the legacy NEXT STAR: line", () => {
    expect(levels("venom", 1)).toEqual(["[+3]/+6/+9{SEC}", next(2, "+6{SEC}")]);
    expect(levels("venom", 2)).toEqual(["+3/[+6]/+9{SEC}", next(3, "+9{SEC}")]);
    expect(levels("venom", 3)).toEqual(["+3/+6/[+9]{SEC}"]);
    expect([px("+3/+6/+9{SEC}"), px(next(2, "+6{SEC}"))]).toEqual([53, 63]);
  });

  it("the shop card: no chip (its one number is a {SEC}, which the chip rule never shows), so it keeps its card line", () => {
    // WORDS-1 (REQ-BFG-081; READ-1 6.3: the 15 chipless phone cards; TEXT-STYLE 9.3 as ruled 2026-10-10): a plain chip, its
    // BURN icon with its face's own +3 and SEC after it (chips.ts PLAIN_CHIPS; was null)
    expect(shopChip("venom")).toBe(`{BURN}+${fmtSec(ITEMS.venom.gate!.burnPlus!)}{SEC}`);
  });
});
