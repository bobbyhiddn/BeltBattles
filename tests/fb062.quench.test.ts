// 0.6.2 final balance pass, FB-B (ref/BRIEF-fb-B-mods.md item 3; design: oracle 16085a6430e4cc6a): QUENCH TANK.
// Every payload QUENCH hits hardens +1/+2/+3 flat. Burn converts at +3/+5/+7 per stack, up to 4/5/6 stacks; QUENCH
// spends only the stacks it pays for, and stacks past the cap stay Burn. Was: all Burn at +2/+4/+6 per stack, capped
// at +12/+26/+42 damage, so a ★1 QUENCH turned a ★1 TEMPER's 2 Burn (6 damage over 3 s) into +4 (Furnace's audit
// cell: total damage 130 -> 118).
// NUM-1 (REQ-BFG-047): the damage family x10, so the floor is now 10/20/30 and the pay 30/50/70 a stack (stack counts
// unchanged), and a Burn stack deals BURN_DPS (10) once a second for BURN_TIME (the test titles keep FB-B's units).
import { describe, expect, it } from "vitest";
import { Battle, type BeltAmmo, type Payload } from "../src/sim/battle";
import { spotForTile } from "../src/sim/beltside";
import { BURN_DPS, BURN_TIME, ITEMS, TICK, type HeroId } from "../src/sim/content";
import { cloneBuild, rigHits, walkRoute, type Build } from "../src/sim/deck";
import { HARNESS_HEROES } from "../src/sim/harness/heroes";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { overclocked } from "../src/sim/overclock";
import { effectAt } from "../src/sim/stars";
import { hitLabel } from "../src/screens/build/inspector";
import { abilityText, gist } from "../src/ui/abilityText"; // 0.6.2rel: the glossary's words (REQ-BFG-032)
import { wrapText } from "../src/ui/richText";
import { barge, bench, est, run } from "./arsenal.bench";

// NUM-1: flat and perBurn x10 (were 1/2/3 and 3/5/7); stacks unchanged
const RULE: Record<number, { flat: number; perBurn: number; stacks: number }> = {
  1: { flat: 10, perBurn: 30, stacks: 4 },
  2: { flat: 20, perBurn: 50, stacks: 5 },
  3: { flat: 30, perBurn: 70, stacks: 6 },
};
const STARS = [1, 2, 3];
const BURNS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10];

const payload = (burn: number, flat = 0): Payload => ({
  id: 91, ammo: "plain", ride: 0, mult: 1, flat, burn, shock: false, prior: 0, factory: 1, copy: false,
});

/** One arrow of a QUENCH at `stars` (the bench's tile 2) applied to a copy of `p`, exactly as the battle applies it. */
function quenched(stars: number, p: Payload): Payload {
  const bt = new Battle(bench([["quench", 4, 3, stars]]), barge(), 7);
  const s = bt.sides[0];
  s.gates[0].online = true;
  const a: BeltAmmo = { p: { ...p }, s: 30, processed: 2, blocked: false };
  (bt as unknown as { applyHit: (s: unknown, a: BeltAmmo, h: unknown) => BeltAmmo[] }).applyHit(s, a, s.routes[0].gateAt[2][0]);
  return a.p;
}

/** The hull damage one fired payload deals to the barge: its hit, then every Burn tick until its Burn has run out. */
function dealt(p: Payload): number {
  const bt = new Battle(bench(), barge(), 7);
  bt.sides[0].factories[0].timer = 1000;
  const hull = bt.sides[1].hull, hp0 = hull.hp;
  const tu = bt.sides[0].turrets[0];
  tu.stack.push({ ...p });
  tu.phase = "fire";
  bt.step();
  const shot = bt.projectiles[0];
  bt.projectiles = [];
  shot.target = { kind: "hull", ref: -1, cell: -1, x: 60, y: 60, weight: 1 };
  const sim = bt as unknown as { impact: (pr: unknown) => void; hullEffects: (dt: number) => void };
  sim.impact(shot);
  for (let t = 0; t < BURN_TIME + 1; t += TICK) sim.hullEffects(TICK);
  expect(hull.burns).toEqual([]); // every Burn stack has run its course
  return hp0 - hull.hp;
}

describe("FB-B QUENCH TANK: a hardening floor, and Burn converted at least at its own worth", () => {
  it("the rule at 1/2/3 stars: +flat on every payload; up to 4/5/6 Burn spent at +3/+5/+7 each; the rest stays Burn", () => {
    expect(STARS.map((s) => effectAt("quench", s).gate?.quench)).toEqual(STARS.map((s) => RULE[s]));
    for (const s of STARS) for (const k of BURNS) {
      const q = quenched(s, payload(k));
      const spent = Math.min(k, RULE[s].stacks);
      expect([q.flat, q.burn], `★${s} with ${k} Burn`).toEqual([RULE[s].flat + spent * RULE[s].perBurn, k - spent]);
    }
  });

  it("(b) each Burn stack QUENCH spends is worth at least that Burn's own damage, at every star (measured in the battle)", () => {
    // a Burn stack's own damage: NUM-1, BURN_DPS (10) once a second for BURN_TIME, whole (was 1 dmg/s: BURN_TIME)
    const own = (dealt(payload(4)) - dealt(payload(0))) / 4;
    expect(own).toBe(BURN_DPS * BURN_TIME);
    for (const s of STARS) for (const k of BURNS.filter((x) => x > 0)) {
      const q = quenched(s, payload(k));
      const spent = k - q.burn;
      // the quenched payload less its floor, against the same payload with only the Burn QUENCH left on it
      // (NUM-1: every amount here is whole, so the comparisons are exact; were within 1e-6)
      const perStack = (dealt(q) - RULE[s].flat - dealt(payload(q.burn))) / spent;
      expect(perStack, `★${s}, ${k} Burn`).toBeGreaterThanOrEqual(own);
      // so QUENCH never costs damage: even without its floor it deals at least what the unspent Burn would have
      expect(dealt(q) - RULE[s].flat, `★${s}, ${k} Burn`).toBeGreaterThanOrEqual(dealt(payload(k)));
    }
  });

  it("each star step is an upgrade for any Burn count, 0 included", () => {
    for (const k of BURNS) {
      const d = STARS.map((s) => dealt(quenched(s, payload(k))));
      expect(d[0], `${k} Burn: no QUENCH < ★1`).toBeGreaterThan(dealt(payload(k)));
      expect(d[1], `${k} Burn: ★1 < ★2`).toBeGreaterThan(d[0]);
      expect(d[2], `${k} Burn: ★2 < ★3`).toBeGreaterThan(d[1]);
    }
  });

  it("(a) without Burn, QUENCH adds less per arrow than WHETSTONE at the same star (estimate and battle): a Burn payoff", () => {
    const bare = est(bench()).dmg;
    for (const s of STARS) {
      const q = est(bench([["quench", 4, 3, s]])).dmg - bare, w = est(bench([["whetstone", 4, 3, s]])).dmg - bare;
      expect(q, `★${s} estimate`).toBe(RULE[s].flat); // NUM-1: the walk's damage is whole, so exact (was toBeCloseTo(.., 9))
      expect(q, `★${s}: QUENCH < WHETSTONE`).toBeLessThan(w);
      // every payload past the rig in the battle carries exactly the floor (the Kiln's slugs have no Burn)
      const flats = (id: string) => [...new Set(run(bench([[id, 4, 3, s]]), 8).sides[0].routes[0].ammo.filter((a) => a.processed >= 2).map((a) => a.p.flat))];
      expect(flats("quench"), `★${s}`).toEqual([RULE[s].flat]);
      expect(flats("whetstone")[0], `★${s}`).toBeGreaterThan(RULE[s].flat);
      // and over a fight the turret's fired damage ranks bare < QUENCH < WHETSTONE
      const fired = (b: Build) => run(b, 20).sides[0].stats.payloadSum;
      expect(fired(bench([["quench", 4, 3, s]])), `★${s}`).toBeGreaterThan(fired(bench()));
      expect(fired(bench([["quench", 4, 3, s]])), `★${s}`).toBeLessThan(fired(bench([["whetstone", 4, 3, s]])));
    }
  });

  it("the walk (inspector estimate) matches the battle behind a TEMPER, and its timeline names the Burn spent", () => {
    for (const temper of STARS) for (const s of STARS) {
      const b = bench([["temper", 4, 4, temper], ["quench", 4, 3, s]]);
      const burn = effectAt("temper", temper).gate!.burn!, spent = Math.min(burn, RULE[s].stacks);
      const w = walkRoute(b, 0);
      const hit = w.timeline.find((row) => row.hits.some((h) => h.def === "quench"))!.hits.find((h) => h.def === "quench")!;
      expect([hit.flat, hit.quenched, w.estimate.burn], `TEMPER ★${temper}, QUENCH ★${s}`).toEqual([RULE[s].flat + spent * RULE[s].perBurn, spent, burn - spent]);
      // 0.6.2rel: the glossary's hit row (hitText, a free belt), its damage with the word DAMAGE
      expect(hitLabel(hit, "free")).toBe(`QUENCH TANK +${RULE[s].flat + spent * RULE[s].perBurn} DAMAGE (${spent} BURN SPENT)`);
      const past = run(b, 10).sides[0].routes[0].ammo.filter((a) => a.processed >= 2);
      expect(past.length).toBeGreaterThan(0);
      for (const a of past) expect([a.p.flat, a.p.burn], `TEMPER ★${temper}, QUENCH ★${s}`).toEqual([hit.flat, burn - spent]);
    }
    // with no Burn upstream the timeline shows the floor alone
    const bare = walkRoute(bench([["quench", 4, 3, 2]]), 0).timeline[0].hits[0];
    expect(hitLabel(bare, "free")).toBe("QUENCH TANK +20 DAMAGE"); // NUM-1: x10 (was +2)
  });

  it("an overclocked QUENCH doubles its floor and its per-stack pay, over the same stacks", () => {
    expect(overclocked({ quench: RULE[1] })).toEqual({ quench: { flat: 20, perBurn: 60, stacks: 4 } }); // NUM-1: x10 (was 2/6)
  });

  it("player text: the description and every star line state the floor and the conversion in plain words", () => {
    const d = ITEMS.quench;
    // NUM-4 (REQ-BFG-047): the desc still states the floor and the conversion, in words; its +1 and +3 left it
    // because they were the x1 scale (★1 is RULE[1]: +10, 30 a Burn); the Burn cap is the data's (was
    // "+1 DAMAGE TO EVERY PAYLOAD. TURNS UP TO 4 BURN INTO +3 EACH.")
    expect(d.desc.join(" ")).toBe(`MORE DAMAGE TO EVERY PAYLOAD; TURNS UP TO ${RULE[1].stacks} BURN INTO DAMAGE.`);
    expect(d.desc.every((l) => l.length <= 20)).toBe(true);
    // 0.6.2rel (REQ-BFG-032): the star lines are the glossary's opening sentence (abilityText) and clause (gist)
    expect(STARS.map((s) => abilityText("quench", s).sentences[0])).toEqual(STARS.map((s) =>
      `ADDS ${RULE[s].flat} DAMAGE TO EACH PAYLOAD IT HITS, THEN TURNS UP TO ${RULE[s].stacks} OF ITS BURN INTO ${RULE[s].perBurn} MORE DAMAGE EACH.`));
    expect(abilityText("quench", 1).sentences.slice(1, 2)).toEqual(["ANY MORE BURN STAYS ON THE PAYLOAD."]);
    expect(gist("quench", 3)).toBe("ADDS 30 DAMAGE, THEN 70 MORE DAMAGE FOR EACH BURN, UP TO 6 BURN"); // NUM-1: x10 (was 3, 7)
    // the opening sentence, wrapped by the one helper, stays within three lines of the phone band
    for (const s of STARS) expect(wrapText(abilityText("quench", s).sentences[0], 151, "3").length, `★${s} on a phone`).toBeLessThanOrEqual(3);
  });
});

// The shared-pool audit's QUENCH cells (tests/sharedPool.effects.test.ts decks(), rebuilt here): each hero's starting
// deck with a ★1 TEMPER near the start of its first belt, against the same deck plus a ★1 QUENCH downstream of it; an
// unarmed foe, 18 s, seed 20210924. Before FB-B, Furnace's total damage fell 130.1 -> 118.3 (Burn 51.8 -> 0).
const AUDIT_SEED = 20210924;
function rigAt(b: Build, id: string, uid: number, tiles: number[]): number {
  for (const ti of tiles) {
    const spot = spotForTile(b, id, 0, ti);
    if (!spot) continue;
    b.items.push({ uid, def: id, x: spot.x, y: spot.y, rot: spot.rot });
    if ((rigHits(b)[0]?.[ti] ?? []).some((h) => h.uid === uid)) return ti;
    b.items.pop();
  }
  throw new Error(`${b.hero}: no spot for ${id}`);
}
function auditDecks(hero: HeroId): [Build, Build] {
  const before = heroStartBuild(hero, 1);
  const t = rigAt(before, "temper", 900, [1, 2, 0]);
  const after = cloneBuild(before);
  rigAt(after, "quench", 901, before.routes[0].cells.map((_, i) => i).filter((i) => i > t).reverse());
  return [before, after];
}
function quietFoe(): Build {
  const b = heroStartBuild("bastion", 500);
  b.routes = [];
  return b;
}
function fight(b: Build): { damage: number; burn: number } {
  const bt = new Battle(b, quietFoe(), AUDIT_SEED);
  while (!bt.over && bt.t < 18) {
    bt.step();
    bt.events.length = 0;
  }
  return { damage: bt.sides[0].stats.damage, burn: bt.sides[0].stats.burnDealt };
}

describe("FB-B QUENCH TANK: the shared-pool audit cells", () => {
  for (const hero of HARNESS_HEROES) {
    it(`${hero}: a ★1 QUENCH behind a ★1 TEMPER raises total damage (Burn included), not only direct hits`, () => {
      const [before, after] = auditDecks(hero);
      const base = fight(before), bought = fight(after);
      expect(base.burn, `${hero}: the TEMPER's Burn lands without QUENCH`).toBeGreaterThan(0);
      expect(bought.burn, `${hero}: QUENCH ★1 spends a ★1 TEMPER's 2 Burn`).toBe(0);
      expect(bought.damage, `${hero}: total damage`).toBeGreaterThan(base.damage);
      expect(bought.damage - bought.burn, `${hero}: direct damage`).toBeGreaterThan(base.damage - base.burn);
    });
  }
});
