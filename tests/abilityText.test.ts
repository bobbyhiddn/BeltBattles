import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  AMMO, BURN_TIME, COMMISSION_BASE, COMMISSION_STEP, DISRUPT_TIME, FRAY_BONUS, FRAY_MAX, GEAR_SLOTS, HEROES, ITEMS, WINDOW_TIME,
  type ItemDef,
} from "../src/sim/content";
import { textWidth } from "../src/render/font";
import { C } from "../src/render/palette";
import { KEYWORD_COLOUR, NUMBER_COLOUR, colourize, lineText, lineWidth, wrapRich, type Span } from "../src/ui/richText";
import { CARD_EFFECT_LINES, cardEffectLines, cardEffectWidth, TOOLTIP_TEXT_W, tooltipLines } from "../src/screens/build/shop";
import { wideCardW } from "../src/screens/build/layout";
import { effectAt, fusible, perkAt } from "../src/sim/stars";
import { scaleCore } from "../src/sim/cores";
import {
  SIM, abilityText, cardText, gist, hasAbilityText, mergeProgressText, mergesWithText, nextStarHeadline, nextStarText,
} from "../src/ui/abilityText";
import { MODULES, STARS, SUPPLIES, banned, fasterNum, kOf, numbers, pct, r1, r2, rateNum, starsOf } from "./textRules";

// 0.6.2t (REQ-BFG-032): the ability text of every buyable module (23 rigs, 13 factories, 13 cores, 9 mods) at 1, 2
// and 3 stars, and of each supply: its numbers are that star's real values, it opens with one plain sentence, it uses
// none of T2's shorthand, every entry is a whole sentence, it wraps to the desk column and the phone band, and the next
// star, merge progress, MERGES WITH and shop one-liners read as sentences. The panels, the phone fit (T6, 0b.5), the
// slag and METRONOME readouts (0b.4) and the other carry-overs are in tests/abilityPanels.test.ts.

const SRC = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("the glossary's engine numbers (SIM) are the sim's", () => {
  it("each is quoted from its source; the test fails if one moves", () => {
    const battle = SRC("src/sim/battle.ts"), harass = SRC("src/sim/harassment.ts"), cores = SRC("src/sim/cores.ts");
    expect(battle).toContain(`Math.min(${SIM.poisonMax}, def.hull.poison.stacks + pr.payload.poison)`);
    expect(battle).toContain(`def.hull.poison.t = ${SIM.poisonTime};`);
    expect(battle).toContain(`s.hull.poison.stacks * ${SIM.poisonTick} *`);
    expect(battle).toContain(`this.disrupt(s, t, ${SIM.sabotBelt}, "sabot")`);
    expect(battle).toContain(`t.kind === "factory" ? ${SIM.sabotFactory} : ${SIM.sabotTurret}, "sabot"`);
    expect(battle).toContain(`"sabot" && hit.kind === "hull" ? ${SIM.sabotHull} : 0`);
    expect(battle).toContain(`this.disrupt(s, target, ${SIM.shrapnel}, "sabot")`);
    expect(battle).toContain(`.timer += ${SIM.chainFactory};`);
    expect(battle).toContain(`.fireCd += ${SIM.chainTurret};`);
    expect(battle).toContain(`if (a.p.debuffs?.snag && fixed === undefined) v *= ${SIM.snag};`);
    expect(harass).toContain(`damage * ${SIM.chill}`);
    expect(battle).toContain(`Math.min(${SIM.scrapQueue}, f.triggerQueue + gained)`);
    expect(battle).toContain(`if (count >= ${SIM.lanceMax}) break;`);
    expect(cores).toContain(`tu.loadTimer >= ${SIM.salvoWait} * tu.windowTime`);
    // and the constants the sim exports, as the texts quote them
    expect([BURN_TIME, WINDOW_TIME, COMMISSION_BASE, COMMISSION_STEP, FRAY_BONUS, FRAY_MAX, AMMO.slag.fixedSpeed]).toEqual([3, 1.5, 1.2, 0.6, 0.2, 15, 0.75]);
  });
});

const g = (e: ItemDef) => e.gate!;
const f = (e: ItemDef) => e.factory!;
const m = (e: ItemDef) => e.mod!;
const base = (e: ItemDef) => f(e).base ?? AMMO[f(e).ammo].base;
/** A rate or speed below 1 as the texts quote it: "40% SLOWER", "17% SLOWER" (40, 17); at or above 1 as fasterNum. */
const speedNum = (r: number): number => (r >= 1 ? fasterNum(r) : Math.round((1 - r) * 100));
const round = <T>(e: ItemDef) => f(e).round as unknown as T;
const BURN = [1, BURN_TIME]; // EACH BURN DEALS THE ENEMY HULL 1 DAMAGE A SECOND FOR 3 SECONDS.

/**
 * The audit: the numbers a module's ability text quotes at a star, every sentence in reading order (digits, and ONE to
 * FIVE and TWICE as words), read from that star's spec (effectAt; a core's absolute numbers x k, as scaleCore), the
 * sim's constants, or SIM (checked above). Written out here from the catalogue, never with abilityText.ts.
 */
const NUMBERS: Record<string, (e: ItemDef, k: number, s: number) => number[]> = {
  // rigs
  temper: (e) => [g(e).burn!, ...BURN],
  whetstone: (e) => [g(e).flat!],
  grease: (e) => [fasterNum(g(e).speed!), g(e).lockedFlat!],
  brake: (e) => [...(g(e).flat ? [g(e).flat] : []), g(e).lockedFlat!], // HALF SPEED at every star
  longhaul: (e) => [g(e).perPriorGate!, ...(g(e).priorCap !== undefined ? [g(e).priorCap] : [])],
  coil: (e) => {
    const j = g(e).jump ?? 0, t = g(e).shockTime ?? DISRUPT_TIME;
    return j ? [1 + j, t, j] : [t]; // STALLS 2 MACHINES FOR 1.8 SECONDS. ... THEN THE NEAREST OTHER ONE.
  },
  splitter: (e) => [g(e).split!.copies, pct(g(e).split!.mult)],
  overdrive: (e) => [fasterNum(g(e).speed!), ...(g(e).flat ? [g(e).flat] : []), g(e).lockedFlat!],
  tollbooth: (e) => [g(e).toll!],
  sifter: (e) => (g(e).sift === "all" ? [g(e).siftFlat!, ...(g(e).siftClean ? [g(e).siftClean] : []), 25, 20] : [1, 25, 20]),
  surge: (e) => {
    const p = g(e).pulse!;
    return [fasterNum(p.speed), p.on, p.period, ...(p.flat ? [p.flat] : []), g(e).lockedFlat!];
  },
  sorting: (e) => (g(e).sort!.copies > 2 ? [2] : []), // EVERY THIRD / OTHER PAYLOAD (words), TWICE from ★3
  riveter: (e) => [g(e).repair!],
  heatjacket: (e) => [g(e).heat!, 2], // TWO JACKETS ADD UP.
  venom: (e) => [g(e).poison!, SIM.poisonTick, SIM.poisonMax, SIM.poisonTime],
  overclocker: (e) => [g(e).overclockCooldown!],
  keg: (e) => [g(e).keg!.flat, g(e).keg!.burn, g(e).keg!.fuse, ...BURN],
  bellows: (e) => [1, g(e).burnPerRide!.seconds, g(e).burnPerRide!.max, ...BURN],
  // 0.6.2 FB-B: + flat on every payload, then up to `stacks` of its Burn at perBurn more each (the rest stays Burn)
  quench: (e) => [g(e).quench!.flat, g(e).quench!.stacks, g(e).quench!.perBurn, ...BURN],
  staticbrush: (e) => [g(e).staticTime!],
  lodestone: (e) => [g(e).perStalled!.each, g(e).perStalled!.max],
  barbed: (e) => (g(e).frayCap ? [g(e).fray!, FRAY_MAX + g(e).frayCap, FRAY_BONUS] : [g(e).fray!, FRAY_BONUS, FRAY_MAX]),
  counterweight: (e) => [r1(g(e).perTile!.each), g(e).perTile!.max],
  // factories
  press: (e) => [base(e), f(e).interval],
  doublestamp: (e) => [f(e).batch!, base(e), f(e).interval, 1, 1], // THEY LEAVE ONE BY ONE
  shottower: (e) => [f(e).batch!, base(e), f(e).interval],
  hotswap: (e) => {
    const em = f(e).cycle!.find((p) => p.tint === "ember")!, sp = f(e).cycle!.find((p) => p.tint === "spark")!;
    return [em.burn ?? 0, 1, f(e).interval, ...(sp.jump ? [1 + sp.jump] : []), sp.shockTime ?? DISRUPT_TIME, ...BURN];
  },
  slagpot: (e) => [base(e), f(e).interval, pct(AMMO.slag.fixedSpeed!)],
  assembly: (e) => [...(f(e).hotStart ? [2, f(e).hotStart] : []), base(e), f(e).interval, COMMISSION_BASE, COMMISSION_STEP],
  gantry: (e) => [f(e).outputs, base(e), f(e).interval],
  scrapper: (e) => [f(e).scrapFlat!, 1, f(e).interval, 1, SIM.scrapQueue, ...(f(e).bigHaul ? [2, 1] : [])], // BIG HAUL: 2 SLUGS, NOT 1
  sabot: (e) => [1, f(e).interval, ...(round<{ shrapnel?: boolean }>(e).shrapnel ? [SIM.shrapnel] : []), SIM.sabotBelt, SIM.sabotFactory, SIM.sabotTurret, SIM.sabotHull],
  frostbite: (e) => {
    const r = round<{ seconds: number; spread: number }>(e);
    return [...(r.spread ? [r.spread + 1] : []), r.seconds, ...(r.spread ? [r.spread] : []), 1, f(e).interval, pct(1 - SIM.chill)];
  },
  dragchain: (e) => {
    const r = round<{ mul: number; seconds: number }>(e);
    return [speedNum(r.mul), r.seconds, pct(1 - SIM.snag), 1, f(e).interval, 2, SIM.chainFactory, SIM.chainTurret];
  },
  mimic: (e) => [...((f(e).intervalMul ?? 1) === 1 ? [] : [speedNum(1 / f(e).intervalMul!)]), ...(f(e).outputs > 1 ? [f(e).outputs] : [])],
  limpet: (e) => {
    const r = round<{ delay: number; blast: number; stall?: number }>(e);
    return [r.blast, r.delay, ...(r.stall ? [r.stall] : []), 1, f(e).interval];
  },
  // turret cores (x k)
  scatter: (e, k) => [scaleCore(e.core!, k).pellets!, pct(scaleCore(e.core!, k).share!)],
  rotary: (e, k) => {
    const c = scaleCore(e.core!, k);
    return [c.windowTime!, ...(c.intervalMul ? [rateNum(c.intervalMul)] : []), WINDOW_TIME];
  },
  pressure: (e, k) => [r1(scaleCore(e.core!, k).perQueued!), scaleCore(e.core!, k).maxCount!],
  gatling: (e, k) => {
    const c = scaleCore(e.core!, k);
    return [rateNum(c.floor!), speedNum(1 / c.start!), c.gap!, pct(c.step!)];
  },
  hullbreaker: (e, k) => [pct(scaleCore(e.core!, k).hullMul! - 1)],
  drake: (e, k) => {
    const c = scaleCore(e.core!, k);
    return [1, c.flatPerBurn!, c.addBurn!, c.burnTime!, BURN_TIME, pct(1 - c.flightMul!)];
  },
  salvo: (e, k) => [r1(scaleCore(e.core!, k).volleyFlat!), 2, pct(scaleCore(e.core!, k).reloadMul! - 1)], // OR TWICE ITS LOAD TIME
  mortar: (e, k) => [scaleCore(e.core!, k).splash!, pct(scaleCore(e.core!, k).share!), scaleCore(e.core!, k).flightMul!],
  grapnel: (e, k, s) => {
    const c = scaleCore(e.core!, k);
    return [...(c.rip! > 1 ? [c.rip!] : []), c.reach!, ...(s >= 3 ? [r1(k)] : [])];
  },
  tesla: (e, k) => {
    const c = scaleCore(e.core!, k);
    return [...(c.arcs! > 1 ? [c.arcs!] : []), r2(c.stall!), pct(c.share!)];
  },
  capacitor: (e, k) => [r1(scaleCore(e.core!, k).perSecond!), scaleCore(e.core!, k).maxSeconds!],
  compound: (e, k) => [2, 1, pct(scaleCore(e.core!, k).mult!), scaleCore(e.core!, k).hold!], // PACKS 2 LOADS INTO ONE SHELL
  lance: (e, k) => [scaleCore(e.core!, k).columns!, pct(scaleCore(e.core!, k).share!), SIM.lanceMax],
  // turret gear
  chamber: (e) => [m(e).perShot!, ...(m(e).window ? [m(e).window] : [])],
  calibrate: (e) => [rateNum(m(e).fireMul!)],
  flak: (e) => [pct(m(e).intercept!)],
  spotter: (e) => (m(e).alwaysMachine ? [m(e).factoryWeight!] : m(e).factoryWeight ? [2, 2] : []), // UP TO TWICE, TWICE AS OFTEN
  // 0.6.2 FB-B: ★1's slot and seconds at every star; ★2/★3 store 1/2 loads while the turret fires (ModSpec.store)
  hopper: (e) => [m(e).window!, m(e).windowTime!, ...(m(e).store ? [m(e).store] : []), WINDOW_TIME],
  // 0.6.2 FB-B: ★2 shields THE LAST TILE of each belt in (no digit), ★3 THE LAST 3 TILES
  mantlet: (e) => ((m(e).intakeGuard ?? 0) > 1 ? [m(e).intakeGuard!] : []),
  ram: (e) => [pct(m(e).finisher!)],
  escapement: (e) => [rateNum(m(e).fireMul!), 1.2, 7], // PEAK_SHIFT -1.2 s: 7 tiles (10 by default)
  longcase: (e) => [m(e).longRideMin!, m(e).longRideFlat!, 1.2, 13], // PEAK_SHIFT +1.2 s: 13 tiles
  // supplies
  beltcrate: (e) => [e.supply!.belt!],
  plating: (e) => [e.supply!.hull!],
  // 0.6.2rel: the 13 turrets (REQ-BFG-031): the interval and loads at that star (★2 x0.9, ★3 x0.8 of the 1-star interval,
  // said as the rate against 1 star: 11%, 25% FASTER THAN AT 1 STAR), TWO columns unless it takes the inner one only, its
  // gear slots (the rarity's GEAR_SLOTS + 1 for each star above 1) and 1 core socket, and its shots' flight
  ...Object.fromEntries(MODULES.filter((d) => d.kind === "turret").map((d) => [d.id, (e: ItemDef, _k: number, s: number) => {
    const t = e.turret!, one = ITEMS[d.id].turret!.fireInterval;
    return [r2(t.fireInterval), t.window, ...(s > 1 ? [fasterNum(one / t.fireInterval), 1] : []), ...(t.intake === "inner" ? [] : [2]),
      GEAR_SLOTS[d.rarity] + s - 1, 1, r2(t.flight)];
  }])),
};
/** Every module with ability text: the buyable modules at 1-3 stars, then each supply at its single level. */
const ALL = [...MODULES, ...SUPPLIES];
/** Each (module, star, class factor) case. */
const CASES = ALL.flatMap((d) => starsOf(d).flatMap((s) => kOf(d).map((k) => ({ d, s, k, id: `${d.id} ★${s} k${k}` }))));
/** The landscape details column's text widths (layout.ts: LAND_MIN_W to the capped column; both faces), the phone band's. */
const WIDTHS: [number, "5" | "3"][] = [[102, "5"], [109, "5"], [116, "5"], [102, "3"], [109, "3"], [116, "3"], [151, "3"]];
/** The words a number may end a wrapped line before (the wrap never splits a number from its unit otherwise). */
const FUNCTION_WORDS = new Set(["A", "AN", "THE", "OF", "AT", "TO", "IN", "ON", "FOR", "AND", "OR", "WITH", "INTO", "FROM", "BY"]);

describe("0.6.2t: the table and the real values at each star (T1, T3)", () => {
  it("23 rigs, 13 factories, 13 cores, 9 mods, 13 turrets and 2 supplies; each has ability text and an audit row", () => {
    const by = (kind: string) => MODULES.filter((d) => d.kind === kind).length;
    expect([by("gate"), by("factory"), by("core"), by("mod"), by("turret"), SUPPLIES.length]).toEqual([23, 13, 13, 9, 13, 2]);
    for (const d of ALL) expect(hasAbilityText(d.id), d.id).toBe(true);
    expect(Object.keys(NUMBERS).sort()).toEqual(ALL.map((d) => d.id).sort());
    expect(CASES).toHaveLength((71 + 13) * 3 + 2); // 71 modules (0.6.2rel: the 13 turrets too); cores twice (k 1 and 0.55)
  });

  it("the numbers every sentence quotes are that star's values (effectAt; a core's x k)", () => {
    for (const { d, s, k, id } of CASES) {
      expect(numbers(abilityText(d.id, s, { k }).sentences.join(" ")), id).toEqual(NUMBERS[d.id](effectAt(d.id, s), k, s));
    }
  });

  it("MIMIC FORGE names the hero's own ammo and its rate, from the hero's signature factory", () => {
    for (const hero of ["furnace", "weaver"] as const) for (const s of STARS) {
      const h = HEROES[hero], sig = ITEMS[h.factory].factory!, mul = effectAt("mimic", s).factory!.intervalMul ?? 1;
      const last = abilityText("mimic", s, { hero }).sentences.at(-1)!;
      expect(last, `${hero} ★${s}`).toMatch(new RegExp(`^FOR ${h.name}, THAT IS AN? [A-Z ]+ EVERY `));
      expect(numbers(last), `${hero} ★${s}`).toEqual([r2(sig.interval * mul)]);
    }
  });

  it("the brief's cases, written out", () => {
    const at = (def: string, s: number) => abilityText(def, s);
    expect(at("longhaul", 2).sentences[0]).toBe("ADDS 4 DAMAGE FOR EACH EARLIER RIG HIT, UP TO 6 HITS.");
    expect(at("overclocker", 1).sentences[0]).toBe("DOUBLES THE NEXT RIG'S HIT, THEN RECHARGES FOR 4 SECONDS.");
    expect(at("mimic", 3)).toEqual({
      sentences: ["STAMPS YOUR HERO'S SIGNATURE AMMO 25% FASTER THAN ITS OWN FACTORY AND FEEDS 2 BELTS."],
      perk: { name: "TWIN SIGNET", stars: 3, after: 0 },
    });
    expect(at("scrapper", 3).sentences.slice(0, 3)).toEqual([
      "STAMPS SCRAP SLUGS THAT DEAL 10.5 MORE DAMAGE THAN PLAIN ONES.",
      "IT STAMPS ONE EVERY 2 SECONDS, AND ONE MORE EACH TIME YOUR HARASSMENT LANDS, UP TO 3 WAITING.",
      "A RIG YOUR SABOTS WRECK EARNS 2 SCRAP SLUGS, NOT 1.",
    ]);
    expect(at("scrapper", 3).perk).toEqual({ name: "BIG HAUL", stars: 3, after: 2 });
    expect(at("frostbite", 2).sentences[0]).toBe("STAMPS ROUNDS THAT FREEZE 2 MACHINES FOR 2.75 SECONDS.");
    expect(at("temper", 1).sentences).toEqual(["ADDS 2 BURN TO EACH PAYLOAD IT HITS.", "EACH BURN DEALS THE ENEMY HULL 1 DAMAGE A SECOND FOR 3 SECONDS."]);
  });

  it("0.6.2rel: FB-B's four modules and the turrets, written out", () => {
    const at = (def: string, s: number) => abilityText(def, s);
    expect(at("quench", 1).sentences[0]).toBe("ADDS 1 DAMAGE TO EACH PAYLOAD IT HITS, THEN TURNS UP TO 4 OF ITS BURN INTO 3 MORE DAMAGE EACH.");
    expect(at("surge", 1).sentences[0]).toBe("PULSES ITS BELTS 3 TIMES AS FAST FOR 1 SECOND EVERY 3 SECONDS, EACH PULSE ADDING 1 DAMAGE.");
    expect(at("hopper", 2).sentences[1]).toBe("WHILE THE TURRET FIRES, IT STORES 1 LOAD FROM THE BELT FOR ITS NEXT CHAMBER.");
    expect(at("mantlet", 2).sentences).toEqual([
      "THE TURRET IGNORES SHOCK, STATIC, ARC, CHAIN, FROST AND SABOT STALLS.", "SO DO THE LAST TILE OF EACH BELT IN, AND THE RIGS WORKING IT.",
    ]);
    expect(at("bombard", 2)).toEqual({
      sentences: [
        "A HEAVY TURRET THAT FIRES EVERY 0.9 SECONDS AND HOLDS 4 LOADS.", "IT FIRES 11% FASTER THAN AT 1 STAR.",
        "IT TAKES A BELT ON EACH OF ITS TWO COLUMNS.", "IT HAS 3 GEAR SLOTS AND 1 CORE SOCKET.", "ITS SHOTS LAND 0.6 SECONDS AFTER IT FIRES.",
      ],
    });
    expect(at("hailgun", 1).sentences.slice(0, 2)).toEqual(["A LIGHT TURRET THAT FIRES EVERY 0.45 SECONDS AND HOLDS 3 LOADS.", "IT TAKES A BELT ON ITS INNER COLUMN ONLY."]);
    expect(at("thunderer", 3).sentences[3]).toBe("IT HAS 6 GEAR SLOTS AND 1 CORE SOCKET."); // legendary 4, + 1 for each star above 1
    expect(at("swivel", 1).sentences[0]).toBe("AN ADAPTABLE TURRET THAT FIRES EVERY 0.7 SECONDS AND HOLDS 3 LOADS.");
    expect([cardText("bombard"), nextStarText("bombard", 1)]).toEqual(["FIRES EVERY 1 SECOND.", "NEXT STAR: FIRES EVERY 0.9 SECONDS, 3 GEAR SLOTS."]);
  });
});

describe("0.6.2t: plain whole sentences (T1, T2, T4)", () => {
  it("T1: the text opens with one plain sentence: a capital, words, one full stop at the end", () => {
    for (const { d, s, k, id } of CASES) {
      const first = abilityText(d.id, s, { k }).sentences[0];
      expect(first, id).toMatch(/^[A-Z][A-Z0-9 ,:;'%()★.+-]*\.$/);
      expect(first.split(" ").length, id).toBeGreaterThanOrEqual(3);
      expect(first.slice(0, -1), id).not.toMatch(/\.\s/); // one sentence (a decimal point isn't a stop)
    }
  });

  it("T4: every entry is a whole sentence (a full stop at the end, no line break, no ·); the perk is this star's", () => {
    for (const { d, s, k, id } of CASES) {
      const at = abilityText(d.id, s, { k });
      for (const t of at.sentences) expect(t, id).toMatch(/^[A-Z0-9][^\n·]*\.$/);
      if (at.perk) {
        expect(at.perk.name, id).toBe(perkAt(d.id, s));
        expect(at.perk.stars, id).toBe(s);
        expect(at.perk.after, id).toBeLessThan(at.sentences.length);
      } else expect(s === 1 || !perkAt(d.id, s), id).toBe(true);
    }
  });

  it("T2: no banned shorthand in any ability sentence, clause, next-star, headline, MERGES WITH or card line", () => {
    for (const { d, s, k, id } of CASES) {
      const texts = [
        ...abilityText(d.id, s, { k }).sentences, gist(d.id, s, { k }), nextStarText(d.id, s, { k }) ?? "",
        nextStarHeadline(d.id, s, { k }) ?? "", s > 1 ? mergesWithText(d.id, s, { k }) : "", s === 1 ? cardText(d.id, { k }) : "",
      ];
      for (const t of texts) expect(banned(t), `${id}: ${t}`).toEqual([]);
    }
  });

  it("T4: wrapped by the one helper, every line fits the desk column and the phone band; a number keeps its unit", () => {
    for (const { d, s, k, id } of CASES) {
      const at = abilityText(d.id, s, { k });
      at.sentences.forEach((t, i) => {
        const spans: Span[] = [...colourize(t, C.bone), ...(at.perk?.after === i ? [{ t: " ", c: C.bone }, { t: `★${s} ${at.perk.name}`, c: C.brass3, whole: true }] : [])];
        for (const [w, font] of WIDTHS) {
          const lines = wrapRich(spans, w, font).map(lineText);
          lines.forEach((ln, j) => {
            expect(textWidth(ln, font), `${id} at ${w} (${font}): ${ln}`).toBeLessThanOrEqual(w);
            const next = lines[j + 1]?.split(" ")[0];
            if (next !== undefined && /(^|\s)\(?[+-]?\d+(\.\d+)?%?$/.test(ln)) expect(FUNCTION_WORDS.has(next), `${id}: "${ln}" / "${next}"`).toBe(true);
          });
        }
      });
    }
  });
});

describe("0.6.2t T5: next star, merge progress and MERGES WITH, as sentences", () => {
  it("NEXT STAR: the next star's clause, at every star below the top; none at ★3 or for a supply", () => {
    for (const { d, s, k, id } of CASES) {
      const next = nextStarText(d.id, s, { k });
      if (!fusible(d.id) || s >= 3) expect(next, id).toBeNull();
      else {
        expect(next, id).toBe(`NEXT STAR: ${gist(d.id, s + 1, { k })}.`);
        expect(numbers(next!).every((n) => numbers(abilityText(d.id, s + 1, { k }).sentences.join(" ")).includes(n) || n === s + 1), id).toBe(true);
      }
    }
    expect(nextStarText("gantry", 1)).toBe("NEXT STAR: FEEDS 3 BELTS.");
    expect(nextStarText("temper", 1)).toBe("NEXT STAR: ADDS 4 BURN.");
  });

  it("merge progress and MERGES WITH read as whole sentences", () => {
    expect([mergeProgressText(1), mergeProgressText(2)]).toEqual(["1 MORE COPY TO MERGE.", "2 MORE COPIES TO MERGE."]);
    expect(mergesWithText("temper", 2)).toBe("MERGES WITH YOUR TEMPER INTO ★2: ADDS 4 BURN.");
    expect(mergesWithText("mimic", 3)).toBe("MERGES WITH YOUR MIMIC FORGE INTO ★3: 25% FASTER, FEEDS 2 BELTS.");
  });

  it("no source file still writes the polish's NEEDS n MORE or the old copy count", () => {
    for (const p of ["src/screens/build/inspector.ts", "src/ui/abilityText.ts", "src/screens/build/shop.ts", "src/screens/build/chrome.ts"]) {
      expect(SRC(p), p).not.toMatch(/NEEDS \$\{|NEEDS \d MORE|MORE COPY\b(?! TO MERGE)/);
    }
  });
});

describe("0.6.2t T5: each shop offer's one-line effect", () => {
  it("every buyable module and supply has one: a whole sentence, no shorthand, its numbers from the 1-star text", () => {
    for (const d of ALL) for (const k of kOf(d)) {
      const card = cardText(d.id, { k }), id = `${d.id} k${k}: ${card}`;
      expect(card, id).toMatch(/^[A-Z0-9][^\n·]*\.$/);
      expect(banned(card), id).toEqual([]);
      const pool = numbers(abilityText(d.id, 1, { k }).sentences.join(" "));
      for (const n of numbers(card)) expect(pool, id).toContain(n);
    }
  });

  it("it fits the wide landscape card in two lines at every landscape width (430 to 480), for both class factors", () => {
    for (let W = 430; W <= 480; W++) {
      const w = wideCardW(W, 5);
      for (const d of ALL) for (const k of kOf(d)) {
        const ls = cardEffectLines(cardText(d.id, { k }), w);
        expect(ls.length, `${d.id} at card ${w}`).toBeLessThanOrEqual(CARD_EFFECT_LINES);
        for (const l of ls) expect(lineWidth(l, "3"), `${d.id} at card ${w}: ${lineText(l)}`).toBeLessThanOrEqual(cardEffectWidth(w));
      }
    }
    expect([wideCardW(430, 5), wideCardW(480, 5), wideCardW(480, 3)]).toEqual([69, 70, 70]);
  });

  it("the hover tooltip shows the offer's opening sentence, wrapped by the same helper", () => {
    for (const d of ALL) {
      const first = abilityText(d.id, 1).sentences[0];
      const ls = tooltipLines(first);
      expect(ls.map(lineText).join(" "), d.id).toBe(first);
      for (const l of ls) expect(lineWidth(l, "3"), d.id).toBeLessThanOrEqual(TOOLTIP_TEXT_W);
    }
  });
});

describe("0.6.2t T4: numbers and keywords in their battle colours, the same everywhere", () => {
  it("colourize: numbers white; BURN, SHOCK, FREEZE, POISON, FASTER and SLOWER in their colours; the rest in the base", () => {
    const colourOf = (text: string, word: string, base = C.bone) => colourize(text, base).find((sp) => sp.t === word)?.c;
    expect(colourOf("ADDS 2 BURN TO EACH", "BURN")).toBe(KEYWORD_COLOUR.burn);
    expect(colourOf("ADDS 2 BURN TO EACH", "2")).toBe(NUMBER_COLOUR);
    expect(colourOf("ADDS SHOCK, WHICH", "SHOCK")).toBe(KEYWORD_COLOUR.shock);
    expect(colourOf("ROUNDS THAT FREEZE 2", "FREEZE")).toBe(KEYWORD_COLOUR.freeze);
    expect(colourOf("ADDS 2 POISON TO", "POISON")).toBe(KEYWORD_COLOUR.poison);
    expect(colourOf("MAKES IT 60% FASTER.", "FASTER")).toBe(KEYWORD_COLOUR.faster);
    expect(colourOf("MAKES IT 40% SLOWER.", "SLOWER")).toBe(KEYWORD_COLOUR.slower);
    // a speed phrase takes the speed colour word by word (the spaces between are blank either way)
    for (const w of ["HALF", "SPEED"]) expect(colourOf("SLOWS IT TO HALF SPEED.", w), w).toBe(KEYWORD_COLOUR.slower);
    for (const w of ["TIMES", "AS", "FAST"]) expect(colourOf("RUNS 3 TIMES AS FAST.", w), w).toBe(KEYWORD_COLOUR.faster);
    expect(colourOf("RUNS 3 TIMES AS FAST.", "3")).toBe(NUMBER_COLOUR);
    expect(colourize("ADDS 2 BURN TO EACH", C.steel2).find((sp) => sp.t.includes("TO EACH"))?.c).toBe(C.steel2);
    // the flavour keeps its numbers in its own dim colour; its keywords keep their battle colours
    expect(colourize("ADDS 2 BURN.", C.steel2, C.steel2).map((sp) => sp.c)).toContain(KEYWORD_COLOUR.burn);
    expect(colourize("ADDS 2 BURN.", C.steel2, C.steel2).find((sp) => sp.t.includes("2"))?.c).toBe(C.steel2);
  });
});
