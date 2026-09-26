// SC-TOOL --static, the merge rows (merge-2star-multiplier, merge-3star-multiplier, merge-step-cap). Every number is
// read from the game: stars.ts effectAt (the 1-star spec with levels 2 and 3 merged over it, exactly what the sim
// fights with), deck.ts gearSlotsOf (a turret's gear slots per star) and the sim's own defaults for a field a 1-star
// spec leaves out (AMMO[ammo].base for a factory's slug, DISRUPT_TIME for a 1-star Shock). tools/mergeStats.ts counts
// stars at run end with a toy buyer; it measures no ratio, so nothing of it is reused here.
//
// The judgement calls (README "merge rows"): each numeric field is read as an effect before dividing (targets.ts
// EffectKind: a time between events as a rate, a multiplier as its bonus above x1, a cut as the share taken off), and
// each part has one named main effect (MAIN below); a part the table doesn't know takes its first changed number.

import { AMMO, DISRUPT_TIME, ITEMS, buyableModules, type ItemDef } from "../../src/sim/content";
import { gearSlotsOf } from "../../src/sim/deck";
import { effectAt, perkAt } from "../../src/sim/stars";
import { effectOf, effectRatio, valueRatio, type EffectKind } from "./targets";

type Prim = number | string | boolean;
export type Spec = Map<string, Prim>;

function flatten(prefix: string, o: unknown, out: Spec): void {
  if (o === undefined || o === null) return;
  if (typeof o === "number" || typeof o === "string" || typeof o === "boolean") {
    out.set(prefix, o);
    return;
  }
  if (Array.isArray(o)) {
    if (o.every((x) => typeof x !== "object" || x === null)) out.set(prefix, o.join("+"));
    else o.forEach((x, i) => flatten(`${prefix}.${i}`, x, out));
    return;
  }
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) flatten(prefix ? `${prefix}.${k}` : k, v, out);
}

/** A part's fighting numbers at `stars`, flattened ("gate.burn", "factory.round.seconds"), with the sim's defaults for
 *  a field its 1-star spec leaves out, and a turret's gear slots. */
export function specAt(def: string, stars: number): Spec {
  const d: ItemDef = effectAt(def, stars);
  const out: Spec = new Map();
  for (const k of ["gate", "factory", "mod", "core", "turret"] as const) if (d[k]) flatten(k, d[k], out);
  if (d.factory) {
    if (!out.has("factory.base")) out.set("factory.base", AMMO[d.factory.ammo].base); // Payload.base absent: the ammo's
    if (!out.has("factory.batch")) out.set("factory.batch", 1);
    if (!out.has("factory.intervalMul")) out.set("factory.intervalMul", 1);
    (d.factory.cycle ?? []).forEach((p, i) => {
      if (p.shock && !out.has(`factory.cycle.${i}.shockTime`)) out.set(`factory.cycle.${i}.shockTime`, DISRUPT_TIME);
    });
  }
  if (d.gate?.shock && !out.has("gate.shockTime")) out.set("gate.shockTime", DISRUPT_TIME); // 1 star: DISRUPT_TIME
  if (d.core && !out.has("core.intervalMul")) out.set("core.intervalMul", 1);
  if (d.kind === "turret") out.set("gearSlots", gearSlotsOf(def, stars));
  return out;
}

/** How a field turns into an effect (targets.ts EffectKind). Anything not named is an amount. */
export function kindOf(path: string): EffectKind {
  if (path === "factory.commission" || path === "factory.round.mul") return "cut";
  if (path === "factory.intervalMul" || path === "gate.burnPerRide.seconds") return "rate";
  if (/(^|\.)(interval|fireInterval|overclockCooldown|period|every|fuse|flatPerBurn)$/.test(path)) return "rate";
  if (path === "core.intervalMul" || /(^|\.)(fireMul|floor|start|reloadMul|flightMul)$/.test(path)) return "imult";
  if (path === "core.mult" || /(^|\.)(speed|hullMul)$/.test(path)) return "mult";
  return "amount";
}

const num = (s: Spec, p: string): number | undefined => {
  const v = s.get(p);
  return typeof v === "number" ? v : undefined;
};

interface MainDef { label: string; calc: (s: Spec) => number | undefined }

const one = (path: string, label: string): MainDef => ({
  label: `${label} [${path}]`,
  calc: (s) => {
    const v = num(s, path);
    return v === undefined ? undefined : effectOf(kindOf(path), v);
  },
});
const prod = (label: string, f: (g: (p: string) => number) => number): MainDef => ({
  label,
  calc: (s) => {
    let missing = false;
    const g = (p: string) => {
      const v = num(s, p);
      if (v === undefined) missing = true;
      return v ?? NaN;
    };
    const r = f(g);
    return missing ? undefined : r;
  },
});

/** A stamping factory's job: damage stamped per second, its slug's base x slugs per cycle / (interval x intervalMul). */
const DPS = prod("stamped damage per second (base x batch / (interval x intervalMul))",
  (g) => (g("factory.base") * g("factory.batch")) / (g("factory.interval") * g("factory.intervalMul")));

/** Each part's main effect: the number its card leads with, or the one its stars are named for (judgement; README). */
export const MAIN: Record<string, MainDef> = {
  press: DPS, doublestamp: DPS, shottower: DPS, slagpot: DPS, gantry: DPS, mimic: DPS,
  assembly: one("factory.commission", "rig commissioning time saved (1 - x)"),
  hotswap: one("factory.cycle.0.burn", "EMBER slug Burn"),
  scrapper: one("factory.scrapFlat", "scrap slug damage"),
  sabot: one("factory.interval", "rounds per second (1 / interval)"),
  frostbite: one("factory.round.seconds", "freeze seconds"),
  dragchain: one("factory.round.mul", "slow strength (1 - belt speed x)"),
  limpet: one("factory.round.blast", "blast damage"),
  temper: one("gate.burn", "Burn added"),
  whetstone: one("gate.flat", "flat damage"),
  grease: one("gate.speed", "belt speed bonus (x - 1)"),
  brake: one("gate.lockedFlat", "locked-belt damage"),
  longhaul: one("gate.perPriorGate", "damage per earlier hit"),
  coil: one("gate.shockTime", "stall seconds"),
  splitter: prod("damage budget bonus (copies x mult - 1) [gate.split]", (g) => g("gate.split.copies") * g("gate.split.mult") - 1),
  overdrive: one("gate.speed", "belt speed bonus (x - 1)"),
  tollbooth: one("gate.toll", "harassment hits absorbed"),
  sifter: one("gate.sift", "debuffs removed"),
  surge: one("gate.pulse.flat", "damage per pulse ridden"),
  sorting: prod("extra copies per payload ((copies - 1) / every) [gate.sort]", (g) => (g("gate.sort.copies") - 1) / g("gate.sort.every")),
  riveter: one("gate.repair", "hull repaired per slug"),
  heatjacket: one("gate.heat", "damage per second ridden"),
  venom: one("gate.poison", "Poison added"),
  overclocker: one("gate.overclockCooldown", "boosts per second (1 / cooldown)"),
  keg: one("gate.keg.flat", "blast damage"),
  bellows: one("gate.burnPerRide.seconds", "Burn per second ridden (1 / seconds)"),
  quench: one("gate.quench.perBurn", "damage per Burn stack spent"),
  staticbrush: one("gate.staticTime", "stall seconds"),
  lodestone: one("gate.perStalled.each", "damage per stalled machine"),
  barbed: one("gate.fray", "Fray per hit"),
  counterweight: one("gate.perTile.each", "damage per tile ridden"),
  chamber: one("mod.perShot", "payloads per shot"),
  calibrate: one("mod.fireMul", "fire-rate bonus (1 / x - 1)"),
  flak: one("mod.intercept", "share of harassment intercepted"),
  spotter: one("mod.rerolls", "target rerolls"),
  hopper: one("mod.store", "loads stored while firing"),
  mantlet: one("mod.intakeGuard", "intake tiles shielded"),
  ram: one("mod.finisher", "finisher bonus"),
  escapement: one("mod.fireMul", "fire-rate bonus (1 / x - 1)"),
  longcase: one("mod.longRideFlat", "long-ride damage"),
  scatter: prod("shot damage bonus (pellets x share - 1) [core]", (g) => g("core.pellets") * g("core.share") - 1),
  rotary: one("core.intervalMul", "fire-rate bonus (1 / x - 1)"),
  pressure: one("core.perQueued", "damage per queued payload"),
  gatling: one("core.floor", "top fire-rate bonus (1 / floor - 1)"),
  hullbreaker: one("core.hullMul", "hull damage bonus (x - 1)"),
  drake: one("core.addBurn", "Burn stacks per shot"),
  salvo: one("core.volleyFlat", "damage per volley shell"),
  mortar: prod("splash damage (splash x share) [core]", (g) => g("core.splash") * g("core.share")),
  grapnel: one("core.rip", "payloads ripped"),
  tesla: prod("stall machine-seconds per hit (arcs x stall) [core]", (g) => g("core.arcs") * g("core.stall")),
  capacitor: one("core.perSecond", "damage per idle second"),
  compound: one("core.mult", "shell damage bonus (x - 1)"),
  lance: prod("column damage (columns x share) [core]", (g) => g("core.columns") * g("core.share")),
};
const TURRET_MAIN = one("turret.fireInterval", "shots per second (1 / fire interval)");

export interface FieldRatio {
  path: string;
  kind: EffectKind;
  v: [Prim | null, Prim | null, Prim | null]; // at 1, 2, 3 stars
  value: [number | null, number | null]; // plain value ratio at 2 and 3 stars (a time as a rate)
  effect: [number | null, number | null]; // effect ratio at 2 and 3 stars (kindOf)
  step: number | null; // the larger effect step, 2/1 or 3/2
}

export interface PartMerge {
  id: string;
  name: string;
  kind: string;
  rarity: string;
  price: number;
  main: { label: string; auto: boolean; r2: number | null; r3: number | null; step: number | null; words?: string };
  fields: FieldRatio[];
  qualitative: string[]; // star effects that are not a ratio: new fields, words, perks
  steps: { path: string; step: number }[]; // every effect step above x2.0 on any field
}

const stepOf = (r2: number | null, r3: number | null): number | null => {
  const s: number[] = [];
  if (r2 !== null) s.push(r2);
  if (r2 !== null && r3 !== null && r2 !== 0) s.push(r3 / r2);
  else if (r2 === null && r3 !== null) s.push(r3);
  return s.length ? Math.max(...s) : null;
};

/** Every star effect of one buyable part. */
export function partMerge(def: string): PartMerge {
  const d = ITEMS[def];
  const specs = [specAt(def, 1), specAt(def, 2), specAt(def, 3)];
  const paths = [...new Set(specs.flatMap((s) => [...s.keys()]))];
  const fields: FieldRatio[] = [];
  const qualitative: string[] = [];
  const steps: { path: string; step: number }[] = [];
  for (const p of paths) {
    const v = specs.map((s) => (s.has(p) ? s.get(p)! : null)) as [Prim | null, Prim | null, Prim | null];
    if (v[0] === v[1] && v[1] === v[2]) continue; // not star-scaled
    const k = kindOf(p);
    if (typeof v[0] === "number" && typeof v[1] === "number" && typeof v[2] === "number") {
      const value: [number | null, number | null] = [valueRatio(k, v[0], v[1]), valueRatio(k, v[0], v[2])];
      const effect: [number | null, number | null] = [effectRatio(k, v[0], v[1]), effectRatio(k, v[0], v[2])];
      const step = stepOf(effect[0], effect[1]);
      fields.push({ path: p, kind: k, v, value, effect, step });
      if (effect[0] === null) qualitative.push(`${p}: ${v[0]} -> ${v[1]} -> ${v[2]} (no 1-star effect to divide by)`);
      if (step !== null && step > 2 + 1e-9) steps.push({ path: p, step });
    } else {
      qualitative.push(`${p}: ${v.map((x) => (x === null ? "none" : String(x))).join(" -> ")}`);
    }
  }
  for (const s of [2, 3]) {
    const perk = perkAt(def, s), prev = perkAt(def, s - 1);
    if (perk && perk !== prev) qualitative.push(`★${s} perk ${perk}`);
  }
  let def0 = MAIN[def] ?? (d.kind === "turret" ? TURRET_MAIN : undefined);
  let auto = false;
  if (!def0) {
    // not in the table (a part added after this tool): its first number that changes and has a 1-star effect
    const f = fields.find((x) => x.effect[0] !== null);
    if (f) def0 = one(f.path, "auto: first changed number");
    auto = true;
  }
  let main: PartMerge["main"] = { label: def0?.label ?? "auto: no numeric star effect", auto, r2: null, r3: null, step: null };
  if (def0) {
    const e = specs.map((s) => def0!.calc(s));
    const ok = e[0] !== undefined && Number.isFinite(e[0]) && Math.abs(e[0]) > 1e-12;
    const r2 = ok && e[1] !== undefined ? e[1] / e[0]! : null;
    const r3 = ok && e[2] !== undefined ? e[2] / e[0]! : null;
    main = { label: def0.label, auto, r2, r3, step: stepOf(r2, r3) };
    if (!ok) main.words = `no 1-star value: ${e.map((x) => (x === undefined ? "none" : String(Number(x.toFixed(4))))).join(" -> ")}; the star effect is qualitative`;
  }
  return { id: def, name: d.name, kind: d.kind, rarity: d.rarity, price: d.price, main, fields, qualitative, steps };
}

/** Every buyable part (content.ts buyableModules: sold, priced, not a supply, not dormant), in catalogue order. */
export function allPartMerges(): PartMerge[] {
  return buyableModules().map((d) => partMerge(d.id));
}
