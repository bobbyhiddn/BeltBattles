// 0.6.2 final balance pass, FB-B (ref/BRIEF-fb-B-mods.md item 2; design: oracle 16085a6430e4cc6a): MANTLET.
// ★2 FULL PLATE was flagged NO EFFECT by the star bench: its freeze and sabot immunities cover the turret itself, and
// those rounds almost never strike a turret. FULL PLATE now also shields the belt tile feeding its turret (intakeGuard
// 1, on every belt into it) and the rigs working that tile (DESIGN §11 P6), against all six stalls it ignores; ★3
// BULWARK SKIRT keeps the last 3 tiles. The player text names the tile.
// NUM-3 (R1's STUN fold, REQ-BFG-046): MANTLET is immune to every STUN source from ★1 (content.ts STUN_CAUSES: the six
// above and LIMPET's stall); ★2's perk is FULL GUARD (was FULL PLATE) and adds the tile shield only. The frost, sabot
// and chain rounds STUN the part they hit through Battle.disrupt (no freeze, no chain segment slow).
// Y7b2 (the flip; release Y, DESIGN-Y row 14): the tile guard is 1 / 2 / 3 tiles from ★1 (intakeGuard; was none, then FULL
// GUARD's 1 and BULWARK SKIRT's 3), and the guarded tiles' rigs no longer share it (battle.ts acceptHarassment): the rig
// test is deleted (switch-off only) and every tile count is re-pinned to 1 / 2 / 3.
import { describe, expect, it } from "vitest";
import { Battle, type SideState, type Target } from "../src/sim/battle";
import { spotForTile } from "../src/sim/beltside";
import { GUARD_SKIRT, STUN_CAUSES, type HarassCause } from "../src/sim/content";
import { hitsOfRig, key, rigHits, rotField, type Build } from "../src/sim/deck";
import type { HarassRound } from "../src/sim/harassment";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { rotFacing } from "../src/sim/beltside";
import { effectAt } from "../src/sim/stars";
import { shieldLine } from "../src/screens/build/inspector";
import { abilityText, gist } from "../src/ui/abilityText"; // 0.6.2rel: the glossary's words (REQ-BFG-032)
import { barge, bench, busy } from "./arsenal.bench";

const STARS = [1, 2, 3];
// NUM-3 (R1's STUN fold): every STUN source (was SIX: shock, static, arc, drag, freeze, sabot; LIMPET's stall joins them)
const STUN: readonly HarassCause[] = STUN_CAUSES;
const K = key;
const st = (s: number) => (s > 1 ? { stars: s } : {});
// NUM-3: the ★1 rounds as the data has them (FROSTBITE 2 s, SABOT 4 s, DRAG CHAIN 1 s)
const ROUND = (def: string) => effectAt(def, 1).factory!.round as HarassRound;
const FROST = ROUND("frostbite"), SABOT = ROUND("sabot"), CHAIN = ROUND("dragchain");

type Sim = { // NUM-3: freeze and slowSegment are gone (the frost and chain rounds STUN through disrupt)
  disrupt(s: SideState, t: Target, secs: number, cause: HarassCause): boolean;
  roundImpact(s: SideState, t: Target, round: unknown, from: number): void;
};
const sim = (bt: Battle) => bt as unknown as Sim;
const target = (s: SideState, kind: Target["kind"], ref: number, cell = -1): Target => {
  const t = s.targets.find((x) => x.kind === kind && x.ref === ref && x.cell === cell);
  if (!t) throw new Error(`no target ${kind}:${ref}:${cell}`);
  return t;
};

/**
 * The busy bench (two belts into turret 0: the Kiln's up column 4, tiles 0-5, and the STAMP PRESS's up column 5, tiles
 * 0-6) with MANTLET at `stars` on turret 0 and rigs beside the Kiln's belt: uid 20 at (3,0) working its intake tile 5,
 * uid 21 at (3,1) working tile 4, uid 22 at (3,3) working tile 2, and uid 23 at (6,0) right beside the press's intake
 * tile but facing away from it (IDLE).
 */
function deck(stars: number): Build {
  const b = busy([["mantlet", stars]]);
  const face = (def: string, dir: number) => rotField(def, rotFacing(def, dir));
  b.items.push(
    { uid: 20, def: "whetstone", x: 3, y: 0, ...face("whetstone", 1) },
    { uid: 21, def: "whetstone", x: 3, y: 1, ...face("whetstone", 1) },
    { uid: 22, def: "whetstone", x: 3, y: 3, ...face("whetstone", 1) },
    { uid: 23, def: "temper", x: 6, y: 0, ...face("temper", 1) },
  );
  return b;
}

describe("FB-B MANTLET: FULL GUARD (NUM-3: was FULL PLATE) shields the belt tile feeding its turret", () => {
  // Y7b2 (the flip): was "...; FULL GUARD 1 shielded tile; BULWARK SKIRT 3 tiles"
  it("the rule: every STUN source from ★1 (NUM-3); 1 / 2 / 3 shielded tiles from ★1 (FULL GUARD 2, BULWARK SKIRT 3)", () => {
    // NUM-3 (R1's STUN fold): was [SIX.slice(0, 4), SIX, SIX] (shock/static/arc/drag, + freeze and sabot at ★2 FULL
    // PLATE); now STUN_CAUSES at every star, and ★2 FULL GUARD adds the shielded tile only
    expect(STARS.map((s) => effectAt("mantlet", s).mod?.immune)).toEqual([[...STUN], [...STUN], [...STUN]]);
    expect(STARS.map((s) => effectAt("mantlet", s).mod?.intakeGuard ?? 0)).toEqual([1, 2, 3]); // Y7b2 (the flip): was [0, 1, 3]
    const b = deck(1);
    const hits = rigHits(b);
    expect([20, 21, 22, 23].map((u) => hitsOfRig(b, u, hits).map((h) => [h.route, h.tile]))).toEqual([[[0, 5]], [[0, 4]], [[0, 2]], []]);
  });

  it("the shield covers the last tile(s) of EVERY belt into the MANTLET turret, and nothing else", () => {
    for (const s of STARS) {
      const bt = new Battle(deck(s), barge(), 3);
      const shielded = bt.sides[0].routes.map((r) => r.guard.map((g) => (g & GUARD_SKIRT ? 1 : 0)));
      const n = [1, 2, 3][s - 1]; // Y7b2 (the flip): was [0, 1, 3]
      expect(shielded, `★${s}`).toEqual([6, 7].map((len) => Array.from({ length: len }, (_, i) => (i >= len - n ? 1 : 0))));
    }
    // a belt into another turret is not shielded: a WEAVER with MANTLET ★2 on turret 1 (column 4) only
    const w: Build = {
      hero: "weaver", beltCap: 30, hullBonus: 0, mods: [{ uid: 30, def: "mantlet", turret: 1, stars: 2 }],
      items: [{ uid: 1, def: "loom", x: 4, y: 6 }],
      routes: [
        { factory: 1, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] },
        { factory: 1, cells: [K(3, 6), K(2, 6), K(1, 6), K(1, 5), K(1, 4), K(1, 3), K(1, 2), K(1, 1), K(1, 0)] },
      ],
    };
    const ws = new Battle(w, barge(), 3).sides[0];
    expect(ws.routes.map((r) => [r.connected, r.turret])).toEqual([[true, 1], [true, 0]]);
    expect(ws.routes.map((r) => r.guard.filter((g) => g & GUARD_SKIRT).length)).toEqual([2, 0]); // Y7b2 (the flip): was [1, 0]
  });

  // Y7b2 (the flip): was "...: the intake tile of either belt ignores them from ★2 (it took them at ★1); tile 4 only from ★3"
  it("every STUN source (NUM-3: was all six stalls): the intake tile of either belt ignores them from ★1; tile 4 from ★2", () => {
    for (const s of STARS) for (const cause of STUN) { // NUM-3: was SIX (LIMPET's stall added)
      const bt = new Battle(deck(s), barge(), 3), me = bt.sides[0];
      for (const [ri, last] of [[0, 5], [1, 6]]) {
        // Y7b2 (the flip): was toBe(s === 1)
        expect(sim(bt).disrupt(me, target(me, "belt", ri, last), 2, cause), `★${s} ${cause}: belt ${ri} intake tile`).toBe(false);
      }
      expect(sim(bt).disrupt(me, target(me, "belt", 0, 4), 2, cause), `★${s} ${cause}: tile 4`).toBe(s === 1); // Y7b2 (the flip): was s < 3
      expect(sim(bt).disrupt(me, target(me, "belt", 0, 2), 2, cause), `★${s} ${cause}: tile 2`).toBe(true);
    }
  });

  // Y7b2 (the flip): was "... on the intake tile STUN it at ★1 and do nothing at ★2 and ★3" (the intake tile is shielded
  // from ★1 now: every star's value was s === 1, now false)
  it("the real rounds: a frost, a sabot and a chain round on the intake tile do nothing at any star", () => {
    for (const s of STARS) {
      const frost = new Battle(deck(s), barge(), 3), fs = frost.sides[0];
      sim(frost).roundImpact(fs, target(fs, "belt", 0, 5), FROST, 1);
      // NUM-3 (R1's STUN fold): was cellFrozen[5] > 0 (a freeze); now the frost round STUNs the tile, and nothing freezes
      expect(fs.routes[0].cellDisrupt[5] > 0, `★${s} frost`).toBe(false); // FLIP-X1 (F4): cellFrozen is deleted
      const sabot = new Battle(deck(s), barge(), 3), ss = sabot.sides[0];
      sim(sabot).roundImpact(ss, target(ss, "belt", 1, 6), SABOT, 1);
      expect(ss.routes[1].cellDisrupt[6] > 0, `★${s} sabot`).toBe(false);
      const chain = new Battle(deck(s), barge(), 3), cs = chain.sides[0];
      sim(chain).roundImpact(cs, target(cs, "belt", 0, 5), CHAIN, 1); // aimed at the Kiln belt's intake tile
      // NUM-3: was [slowSegment's hit, cellSlow[5].t > 0]; now [the STUN accepted (the foe's harassAccepted), the tile
      // STUNned (cellDisrupt[5] > 0)]
      expect([chain.sides[1].harassAccepted === 1, cs.routes[0].cellDisrupt[5] > 0], `★${s} chain`).toEqual([false, false]);
    }
  });

  it("a chain round STUNs only the tile it lands on, upstream or not, and never a shielded tile (NUM-3: was a segment slow that skipped the shielded tiles, as it skips REDLINE tiles)", () => {
    for (const s of STARS) {
      const n = [1, 2, 3][s - 1]; // Y7b2 (the flip): was [0, 1, 3]
      // NUM-3 (R1's STUN fold): was slowSegment(belt 1, tile 2) true slowing the whole press belt (it has no worked tile),
      // 0-6, but its shielded tiles; now a chain round STUNs the one tile it lands on (each tile of the press belt in
      // turn), and a shielded tile refuses it
      for (let tile = 0; tile < 7; tile++) {
        const bt = new Battle(deck(s), barge(), 3), me = bt.sides[0];
        sim(bt).roundImpact(me, target(me, "belt", 1, tile), CHAIN, 1);
        expect(me.routes[1].cellDisrupt.map((c) => (c > 0 ? 1 : 0)), `★${s} tile ${tile}`)
          .toEqual([0, 1, 2, 3, 4, 5, 6].map((i) => (i === tile && tile < 7 - n ? 1 : 0)));
      }
    }
  });

  // Y7b2 (the flip): "rigs beside the belt (P6): shielded when an arrow works a shielded tile; an IDLE rig beside the
  // intake never is" is deleted: the guarded tiles' rigs no longer share the guard (switch-off only; measured: every rig
  // takes every STUN, and a sabot round wrecks the intake tile's rig, at every star)

  // Y7b2 (the flip): was "... a frost round on the intake tile stops the turret's loads at ★1, not at ★2". The intake tile
  // is shielded from ★1 now (measured 2 loads at every star there), so the round lands on tile 4, the tile ★2 adds
  // (measured [0, 2, 2]; no MANTLET 0)
  it("measurably better: a frost round on the tile before the intake stops the turret's loads at ★1, not at ★2", () => {
    const loads = (s: number) => { // the Kiln's belt alone into turret 0, a rig working its intake tile
      const bt = new Battle(bench([["whetstone", 4, 0, 1]], [["mantlet", s]]), barge(), 3), me = bt.sides[0];
      let n = 0;
      while (bt.t < 6) {
        bt.step();
        if (Math.abs(bt.t - 3) < 1e-6) sim(bt).roundImpact(me, target(me, "belt", 0, 4), { kind: "frost", seconds: 2.5, spread: 0 }, 1);
        for (const e of bt.drainEvents()) if (e.type === "load" && e.side === 0 && bt.t > 3.05 && bt.t < 5.5) n++;
      }
      return n;
    };
    const [one, two, three] = STARS.map(loads);
    expect(one, "★1: the frozen tile 4 holds every load").toBe(0);
    expect(two).toBeGreaterThan(one);
    expect(three).toBe(two);
  });

  it("in live fights against the audit's shock foe (11 seeds x 32 s): no stall reaches a shielded tile", () => {
    const foe = (): Build => {
      const b = heroStartBuild("weaver", 500);
      b.hullBonus = 250;
      const spot = spotForTile(b, "coil", 0, 2)!;
      b.items.push({ uid: 800, def: "coil", x: spot.x, y: spot.y, rot: spot.rot });
      return b;
    };
    // Y7b2 (the flip): the stalls on the last, second-last and third-last tile of the turret's belts (was { intake, skirt }:
    // the last tile, and the two before it)
    const stalls = (s: number) => {
      const b = heroStartBuild("furnace", 1);
      b.mods.push({ uid: 902, def: "mantlet", turret: 0, ...st(s) });
      const count = [0, 0, 0];
      for (const seed of [20210924, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
        const bt = new Battle(b, foe(), seed), me = bt.sides[0];
        while (!bt.over && bt.t < 32) {
          bt.step();
          for (const e of bt.drainEvents()) {
            if (e.type !== "disrupt" || e.side !== 0 || e.kind !== "belt") continue;
            const r = me.routes[e.ref];
            if (!r.connected || r.turret !== 0) continue;
            const fromEnd = r.cells.length - e.cell;
            if (fromEnd <= 3) count[fromEnd - 1]++;
          }
        }
      }
      return count;
    };
    const [one, two, three] = STARS.map(stalls);
    // Y7b2 (the flip): ★n shields the last n tiles (was ★1 none, ★2 the intake tile, ★3 the last 3), so ★1's stalled
    // tile, the check that the foe does stall these belts, is the second-last (was the intake tile: one.intake > 0).
    // Measured [0, 2, 9], [0, 0, 9], [0, 0, 0] (no MANTLET [5, 2, 9])
    expect(one[1], "★1: the tile before the intake is stalled").toBeGreaterThan(0);
    expect(one[0], "★1: the intake tile never").toBe(0);
    expect(two[0] + two[1], "★2: its last 2 tiles never").toBe(0); // Y7b2 (the flip): was two.intake (its 1 tile)
    expect(three[0] + three[1] + three[2], "★3: no skirt tile is stalled").toBe(0);
  });

  // Y7b2 (the flip): was "player text: each star line names the STUN immunity and the shielded tile; the turret panel
  // says rigs share it" (the star lines name no rigs now; the turret panel's line below still does, as the words stand)
  it("player text: each star line names the STUN immunity and the shielded tiles; the turret panel's shield line", () => {
    // 0.6.2rel (REQ-BFG-032): the star lines are the glossary's sentences (abilityText) and clauses (gist); the perk's
    // name follows the shield sentence it names
    // NUM-3 (R1's STUN fold; step 1b's words): was "...IGNORES SHOCK, STATIC, ARC AND CHAIN STALLS." at ★1 and "...SHOCK,
    // STATIC, ARC, CHAIN, FROST AND SABOT STALLS." from ★2; now every STUN from ★1, and ★2's perk is FULL GUARD (was FULL
    // PLATE); ★2's gist lost "IGNORES FROST AND SABOT TOO, " (★2 adds no cause any more)
    // Y7b2 (the flip): the tile sentence from ★1, 1 / 2 / 3 tiles, no rigs (was [every], [every, "SO DO THE LAST TILE OF
    // EACH BELT IN, AND THE RIGS WORKING IT."], [every, "SO DO THE LAST 3 TILES OF EACH BELT IN, AND THE RIGS WORKING THEM."])
    // TXT-096 (REVIEW-TXT095 Q2): one opening with the tiles, as its face, so the perk names that sentence (were [every, "SO DOES
    // THE LAST TILE OF EACH BELT IN."] .. and the perks after 1)
    const every = "THE TURRET IGNORES EVERY STUN";
    expect(STARS.map((s) => abilityText("mantlet", s).sentences)).toEqual([
      // POLISH-1 (P3c): ... INTO IT. (the belts that feed the turret; was ... IN., which read as cut off)
      [`${every}, AND SO DOES THE LAST TILE OF EACH BELT INTO IT.`],
      [`${every}, AND SO DO THE LAST 2 TILES OF EACH BELT INTO IT.`],
      [`${every}, AND SO DO THE LAST 3 TILES OF EACH BELT INTO IT.`],
    ]);
    expect([2, 3].map((s) => abilityText("mantlet", s).perk)).toEqual([{ name: "FULL GUARD", stars: 2, after: 0 }, { name: "BULWARK SKIRT", stars: 3, after: 0 }]);
    // NUM-4 (REQ-BFG-047; SUS-B F3): MANTLET's verb is FULL GUARD's, GUARDS / GUARDED: (was SHIELDS / SHIELDED:); the
    // tile counts unchanged
    // Y7b2 (the flip): was "IGNORES EVERY STUN", "GUARDS THE LAST TILE OF EACH BELT IN", "GUARDS THE LAST 3 TILES ..."
    expect(STARS.map((s) => gist("mantlet", s))).toEqual([
      // POLISH-1 (P3c): ... INTO IT (was ... BELT IN)
      "IGNORES EVERY STUN, GUARDS THE LAST TILE OF EACH BELT INTO IT",
      "GUARDS THE LAST 2 TILES OF EACH BELT INTO IT",
      "GUARDS THE LAST 3 TILES OF EACH BELT INTO IT",
    ]);
    // Y7b2 (cap's ruling d4e8184e90c0ed75; the flip): the rig guard left with the switch's off branch, so the turret
    // panel's line names the tiles only (was "GUARDED: THE LAST TILE OF EACH BELT IN, AND THE RIGS WORKING IT." and
    // "GUARDED: THE LAST 3 TILES OF EACH BELT IN, AND THE RIGS WORKING THEM.")
    expect([shieldLine(1), shieldLine(3)]).toEqual([
      // POLISH-1 (P3c): ... INTO IT. (was ... IN.)
      "GUARDED: THE LAST TILE OF EACH BELT INTO IT.",
      "GUARDED: THE LAST 3 TILES OF EACH BELT INTO IT.",
    ]);
  });
});
