// 0.6.2p (item 1): star-aware flavour. ItemDef.desc is a module's 1-star text, and the inspector appended it at
// every star, so a ★3 SPLITTER read "★3 PERFECT CUT: 2 X 85%" over "TWO COPIES AT 60%.". A module whose desc quotes a
// number its stars change, or an effect a star replaces, has a template here: the same sentence carrying that star's
// numbers, read from effectAt at that star (a turret core's absolute numbers x the class factor k, as scaleCore and
// the inspector's level line read them), so the flavour never contradicts the level, NEXT or perk line. Where a perk
// changes the mechanic itself (SIFTER, SPOTTER, SORTING ARM ★3, POWDER KEG ★3, MIMIC FORGE ★3, LONG HAUL's cap) the
// template says what that star does and leaves the perk line to give its numbers. UI side only: the catalogue's desc
// (sim/content.ts) keeps its 1-star text, so no catalogue data, pin or fingerprint moves.

import { AMMO, BURN_TIME, FRAY_BONUS, ITEMS, type ItemDef } from "../../sim/content";
import { scaleCore } from "../../sim/cores";
import { effectAt } from "../../sim/stars";
import { wrap } from "../../render/font";

/** The narrowest wrap width a panel gives the flavour in the 5x7 face: the landscape details column at the least
 *  landscape width (layout.ts LAND_MIN_W 430: column 120, panel 112, text 102). */
export const FLAVOUR_MIN_W = 102;

const num = (x: number): string => String(+x.toFixed(2));
/** A core's k-scaled number, rounded as its level line rounds it (inspector.ts coreShape: toFixed(1)). */
const one = (x: number): string => String(+x.toFixed(1));
const pct = (x: number): number => Math.round(x * 100);
const WORDS = ["NONE", "ONE", "TWO", "THREE", "FOUR", "FIVE"];
const word = (n: number): string => WORDS[n] ?? String(n);
const ordinal = (n: number): string => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "TH" : ["TH", "ST", "ND", "RD"][n % 10] ?? "TH"}`;

/** One module's flavour at a star: its spec there (effectAt), the class factor k -> layouts, the fullest first. */
type Template = (e: ItemDef, k: number) => string[][];

const gate = (e: ItemDef) => e.gate!;
const fac = (e: ItemDef) => e.factory!;
/** A factory's slug damage at its stars: its dies (FactorySpec.base), else its ammo's (as Battle.stamp). */
const slugBase = (e: ItemDef): number => fac(e).base ?? AMMO[fac(e).ammo].base;
const mod = (e: ItemDef) => e.mod!;
const core = (e: ItemDef, k: number) => scaleCore(e.core!, k);

/**
 * The templates, by module. Each one's first layout at 1 star is its catalogue desc, word for word (tests/flavour
 * .test.ts), except LIMPET WORKS: its desc promises "A STALL", which a 1-star charge doesn't make (round.stall
 * arrives at ★2). A later layout is a re-flow for a star whose numbers make a line too wide (flavour() picks the
 * first that fits). Modules absent here quote no number their stars change: their desc shows at every star.
 */
export const STAR_FLAVOUR: Record<string, Template> = {
  // --- rigs ---
  temper: (e) => [[`ADDS ${gate(e).burn} BURN.`, "BURN: 1 DMG/S FOR 3S", "PER STACK ON HIT."]],
  whetstone: (e) => [[`+${num(gate(e).flat!)} FLAT DAMAGE.`, "BEFORE A SPLITTER,", "BOTH COPIES GAIN IT."]],
  grease: (e) => [[`BELT RUNS ${num(gate(e).speed!)}X FROM`, "ITS HIT. LOCKED BELTS", `GAIN +${num(gate(e).lockedFlat!)} DAMAGE.`]],
  brake: (e) => [[
    `${gate(e).speed === 0.5 ? "HALF SPEED" : `${num(gate(e).speed!)}X SPEED`} FROM HIT.`, "LOCKED BELTS GAIN",
    `+${num(gate(e).lockedFlat!)} DAMAGE INSTEAD.`,
  ]],
  // ★2/★3 count at most priorCap earlier hits (0.6.1p), so "EACH HIT" gains its cap
  longhaul: (e) => gate(e).priorCap === undefined
    ? [[`+${num(gate(e).perPriorGate!)} DAMAGE FOR EACH`, "HIT THE PAYLOAD", "ALREADY TOOK."]]
    : [[`+${num(gate(e).perPriorGate!)} DAMAGE FOR EACH`, "EARLIER HIT, UP TO", `${gate(e).priorCap} HITS.`]],
  splitter: (e) => [["SPLITS A PAYLOAD IN", `${word(gate(e).split!.copies)} COPIES AT ${pct(gate(e).split!.mult)}%.`, "MORE BELT PRESSURE."]],
  overdrive: (e) => [[`4 ARROWS: ${num(gate(e).speed!)}X SPEED`, "FROM HIT; LOCKED BELTS", `GAIN +${num(gate(e).lockedFlat!)} DAMAGE.`]],
  tollbooth: (e) => [["GUARDS ITS BELT", `FROM THE FIRST ${gate(e).toll}`, "HARASSMENT HITS."]],
  // ★2 POLISH and ★3 FINE MESH sift every mark, not one in order (their +DMG per mark is on the perk line)
  sifter: (e) => gate(e).sift === "all"
    ? [["REMOVES CHILL, SNAG", "AND SAP FROM EVERY", "PASSING PAYLOAD."]]
    : [["REMOVES CHILL, SNAG", "OR SAP FROM PASSING", "PAYLOADS IN ORDER."]],
  surge: (e) => {
    const p = gate(e).pulse!, lf = num(gate(e).lockedFlat!), pulse = `PULSES ${num(p.speed)}X SPEED FOR`;
    return [
      [pulse, `${num(p.on)}S EVERY ${num(p.period)}S. LOCKED`, `BELTS GAIN +${lf} DMG.`],
      [pulse, `${num(p.on)}S EVERY ${num(p.period)}S. LOCKED`, `BELTS: +${lf} DMG.`],
      [pulse, `${num(p.on)}S EVERY ${num(p.period)}S;`, `LOCKED BELT +${lf} DMG.`],
    ];
  },
  sorting: (e) => {
    const s = gate(e).sort!, extra = s.copies - 1;
    return extra === 1
      ? [[`COPIES EVERY ${ordinal(s.every)}`, "PAYLOAD AT FULL", "STRENGTH."]]
      : [[`COPIES EVERY ${ordinal(s.every)}`, `PAYLOAD ${extra === 2 ? "TWICE" : `${extra} TIMES`} AT`, "FULL STRENGTH."]];
  },
  riveter: (e) => [["EACH PASSING SLUG", "REPAIRS YOUR HULL", `BY ${num(gate(e).repair!)}.`]],
  heatjacket: (e) => [[`ADDS +${num(gate(e).heat!)} DAMAGE`, "PER SECOND RIDDEN", "AFTER THIS RIG."]],
  venom: (e) => [[`ADDS ${num(gate(e).poison!)} POISON.`, "POOL TICKS AND", "REFRESHES ON HIT."]],
  overclocker: (e) => {
    const cd = num(gate(e).overclockCooldown!);
    return [
      ["DOUBLES THE NEXT", "BOOSTABLE RIG ONCE,", `THEN COOLS FOR ${cd}S.`],
      ["DOUBLES THE NEXT", "BOOSTABLE RIG ONCE,", `THEN COOLS ${cd}S.`],
    ];
  },
  // ★3 WIDE BLAST: the payloads on every belt beside the keg, not only on the belts its arrows hit (Battle.detonateKeg);
  // "BELTS ... GAIN" as the catalogue's own "LOCKED BELTS GAIN +2 DAMAGE"
  keg: (e) => {
    const k = gate(e).keg!, head = k.wide ? [`BLOWS AT ${num(k.fuse)}S: ALL`, "BELTS BESIDE IT"] : [`BLOWS AT ${num(k.fuse)}S:`, "PAYLOADS ON ITS BELT"];
    return [
      [...head, `GAIN +${num(k.flat)} AND ${k.burn === 1 ? "" : `${k.burn} `}BURN.`],
      [...head, `GAIN +${num(k.flat)}, ${k.burn} BURN.`],
    ];
  },
  bellows: (e) => [["ADDS BURN FROM", "RIDE TIME SO FAR,", `UP TO ${gate(e).burnPerRide!.max} STACKS.`]],
  quench: (e) => [["TURNS BURN STACKS", `INTO +${num(gate(e).quench!.perBurn)} DAMAGE`, `EACH, UP TO +${num(gate(e).quench!.max)}.`]],
  lodestone: (e) => [[`+${num(gate(e).perStalled!.each)} DAMAGE FOR`, "EACH ENEMY MACHINE", "STALLED RIGHT NOW."]],
  barbed: (e) => [[`HITS ADD ${gate(e).fray} FRAY.`, "LATER HITS DEAL", `+${num(FRAY_BONUS)} PER STACK.`]],
  counterweight: (e) => [[`+${num(gate(e).perTile!.each)} DAMAGE PER`, "BELT TILE ALREADY", `RIDDEN, MAX +${num(gate(e).perTile!.max)}.`]],
  // --- factories ---
  press: (e) => [["STAMPS PLAIN SLUGS", `EVERY ${num(fac(e).interval)}S. NEEDS A`, "FREE TURRET INTAKE."]],
  doublestamp: (e) => {
    const b = fac(e).batch!, cycle = `SLUGS PER ${num(fac(e).interval)}S CYCLE.`;
    return [[`STAMPS ${word(b)} PLAIN`, cycle, "QUEUE PRESSURE."], [`STAMPS ${b} PLAIN`, cycle, "QUEUE PRESSURE."]];
  },
  shottower: (e) => [[`DROPS ${fac(e).batch} BUCKSHOT`, `(${num(slugBase(e))} DMG) EVERY ${num(fac(e).interval)}S.`, "RIGS HIT EACH ONE."]],
  hotswap: (e) => [["ALTERNATES EMBER", `SLUGS (${fac(e).cycle!.find((p) => p.tint === "ember")?.burn ?? 0} BURN) AND`, "SPARK SLUGS (SHOCK)."]],
  slagpot: (e) => [
    ["HEAVY SLAG SLUGS", `(${num(slugBase(e))} DMG) THAT IGNORE`, "BELT SPEED RIGS."],
    [`HEAVY ${num(slugBase(e))} DMG SLAG`, "SLUGS THAT IGNORE", "BELT SPEED RIGS."],
  ],
  // x0.5 commissions twice as fast, x0.25 four times; ★3's x0 has every rig online at 0 s
  assembly: (e) => {
    const c = fac(e).commission!;
    return c > 0
      ? [["SLOW PLAIN SLUGS, AND", "ALL YOUR RIGS", `COMMISSION ${num(1 / c)}X FAST.`]]
      : [["SLOW PLAIN SLUGS, AND", "ALL YOUR RIGS", "COME ONLINE AT ONCE."], ["SLOW PLAIN SLUGS, AND", "ALL YOUR RIGS COME", "ONLINE AT ONCE."]];
  },
  gantry: (e) => {
    const o = fac(e).outputs;
    return [
      [`ONE PRESS, ${word(o)}`, `OUTPUTS: FEEDS ${word(o)}`, "INTAKES BY TURNS."],
      [`ONE PRESS, ${word(o)}`, `OUTPUTS: FEEDS ${o}`, "INTAKES BY TURNS."],
    ];
  },
  scrapper: (e) => [["STAMPS SCRAP SLUGS", "WHEN HARASSMENT HITS", `FOE, OR EVERY ${num(fac(e).interval)}S.`]],
  // ★3 TWIN SIGNET: two outputs, so two more routes of the hero's ammo
  mimic: (e) => fac(e).outputs > 1
    ? [["STAMPS YOUR HERO'S", "SIGNATURE AMMO INTO", `${word(fac(e).outputs)} MORE ROUTES.`]]
    : [["STAMPS YOUR HERO'S", "SIGNATURE AMMO INTO", "A SECOND ROUTE."]],
  limpet: (e) => {
    const r = fac(e).round as { delay: number; stall?: number };
    return [["STICKY CHARGES BLOW", `${num(r.delay)}S LATER FOR HULL`, r.stall ? "DAMAGE AND A STALL." : "DAMAGE."]];
  },
  // --- turret cores (k: the turret's class factor, as scaleCore) ---
  scatter: (e, k) => [[`SHOTS BURST INTO ${core(e, k).pellets}`, `PELLETS AT ${pct(core(e, k).share!)}%, EACH`, "AIMED ANEW."]],
  pressure: (e, k) => [[`+${one(core(e, k).perQueued!)} DAMAGE PER`, "PAYLOAD QUEUED AT", "IT. NEVER JAMS."]],
  gatling: (e, k) => {
    const c = core(e, k);
    return [
      ["NEVER WAITS: FIRES", "EACH LOAD AT ONCE.", `EACH QUICK SHOT ${pct(c.step!)}%`, `FASTER, TO ${num(c.floor!)}X.`],
      ["NEVER WAITS: FIRES", "EACH LOAD AT ONCE.", `QUICK SHOTS: ${pct(c.step!)}%`, `FASTER, TO ${num(c.floor!)}X.`],
    ];
  },
  hullbreaker: (e, k) => [["NEVER HITS MACHINES.", "EVERY HULL HIT", `DEALS +${pct(core(e, k).hullMul! - 1)}%.`]],
  drake: (e, k) => [["TURNS FLAT DAMAGE", "INTO BURN. ITS FIRES", `BURN ${num(core(e, k).burnTime!)}S, NOT ${num(BURN_TIME)}.`]],
  salvo: (e, k) => {
    const v = one(core(e, k).volleyFlat!);
    return [["WAITS FOR A FULL", "WINDOW, THEN FIRES", `IT ALL AT +${v} EACH.`], ["WAITS FOR A FULL", "WINDOW, THEN FIRES", `IT ALL, +${v} EACH.`]];
  },
  mortar: (e, k) => {
    const c = core(e, k), lob = `LOB FLIES ${num(c.flightMul!)}X LONG`, share = pct(c.share!);
    return c.splash === 1
      ? [[lob, "AND SPLASHES ONE", `MORE TARGET AT ${share}%.`]]
      : [[lob, `AND SPLASHES ${word(c.splash!)}`, `MORE, EACH AT ${share}%.`], [lob, `AND SPLASHES ${c.splash}`, `MORE, EACH AT ${share}%.`]];
  },
  grapnel: (e, k) => {
    const rip = core(e, k).rip!;
    return rip === 1
      ? [["BELT HITS RIP THE", "NEAREST ENEMY SLUG", "OFF THAT ROUTE."]]
      : [["BELT HITS RIP THE", `${rip} NEAREST ENEMY`, "SLUGS OFF IT."]];
  },
  tesla: (e, k) => {
    const c = core(e, k);
    return c.arcs === 1
      ? [["HITS ARC TO THE", "NEAREST MACHINE FOR", `${pct(c.share!)}% PLUS ${num(c.stall!)}S STALL.`]]
      : [["HITS ARC TO THE", `${c.arcs} NEAREST MACHINES:`, `${pct(c.share!)}% + ${num(c.stall!)}S STALL.`]];
  },
  capacitor: (e, k) => [["IDLE TIME CHARGES", `NEXT SHOT: +${one(core(e, k).perSecond!)} PER`, `SECOND, UP TO ${num(core(e, k).maxSeconds!)}S.`]],
  compound: (e, k) => [["PACKS TWO LOADS", "INTO ONE SHELL AT", `${pct(core(e, k).mult!)}% TOTAL DAMAGE.`]],
  lance: (e, k) => {
    const n = core(e, k).columns!;
    return [["HITS THE HULL AND", "EVERY MACHINE IN", n === 1 ? "ONE DECK COLUMN." : `${n} DECK COLUMNS.`]];
  },
  // --- turret gear ---
  chamber: (e) => {
    const n = mod(e).perShot!;
    return [[`TURRET FIRES ${word(n)}`, "PAYLOADS PER SHOT.", "DROP ON A TURRET."], [`TURRET FIRES ${n}`, "PAYLOADS PER SHOT.", "DROP ON A TURRET."]];
  },
  calibrate: (e) => [[`TURRET FIRES ${pct(1 - mod(e).fireMul!)}%`, "FASTER.", "DROP ON A TURRET."]],
  flak: (e) => [[`INTERCEPTS ${pct(mod(e).intercept!)}% OF`, "INCOMING HARASSMENT", "ROUNDS SIDE-WIDE."]],
  // ★2 FACTORY SPOT rerolls more than once (its count is on the perk line); ★3 EAGLE EYE never aims at bare hull
  spotter: (e) => mod(e).alwaysMachine
    ? [["TURRET AIMS AT", "MACHINERY ONLY,", "NEVER BARE HULL."]]
    : (mod(e).rerolls ?? 0) > 1
      ? [["TURRET REROLLS", "BARE-HULL TARGETS", "TOWARD MACHINERY."]]
      : [["TURRET REROLLS A", "BARE-HULL TARGET", "TOWARD MACHINERY."]],
  hopper: (e) => {
    const w = mod(e).window!, s = num(mod(e).windowTime!);
    return [
      [`CHAMBER HOLDS ${w} MORE`, `LOAD${w === 1 ? "" : "S"}; WINDOWS STAY`, `OPEN ${s}S LONGER.`],
      [`CHAMBER HOLDS ${w} MORE`, `LOAD${w === 1 ? "" : "S"} AND WINDOWS`, `STAY ${s}S LONGER.`],
    ];
  },
  ram: (e) => [["THE LAST PAYLOAD OUT", "OF EACH WINDOW HITS", `${pct(mod(e).finisher!)}% HARDER.`]],
  escapement: (e) => [[`FIRES ${pct(1 - mod(e).fireMul!)}% FASTER.`, "PENDULUM PEAK 1.2S", "EARLIER: 7 TILES."]],
  longcase: (e) => [[`OTHER SLUGS: +${num(mod(e).longRideFlat!)}`, `DMG AFTER ${num(mod(e).longRideMin!)}S RIDE.`, "PENDULUM PEAK +1.2S."]],
};

/** The wrap widths a panel gives the flavour: the landscape details column from LAND_MIN_W up to its cap (colL 136:
 *  panel 128, text 118); the portrait bands are wider (the phone's 151 px). */
export const FLAVOUR_WIDTHS: readonly number[] = Array.from({ length: 118 - FLAVOUR_MIN_W + 1 }, (_, i) => FLAVOUR_MIN_W + i);

/** Rows `lines` wrap to at width `w` in face `f` (drawDetails wraps each text line on its own). */
export function flavourRows(lines: readonly string[], w: number, f: "5" | "3" = "5"): number {
  return lines.reduce((n, l) => n + wrap(l, w, f).length, 0);
}

/** A layout fits in place of the 1-star desc when it has as many lines, each within about 20 characters (or the
 *  desc's own longest), and wraps to no more rows than the desc at any panel width, in either face: no panel grows. */
export function flavourFits(lines: readonly string[], desc: readonly string[]): boolean {
  const chars = Math.max(20, ...desc.map((l) => l.length));
  if (lines.length !== desc.length || lines.some((l) => l.length > chars)) return false;
  return FLAVOUR_WIDTHS.every((w) => (["5", "3"] as const).every((f) => flavourRows(lines, w, f) <= flavourRows(desc, w, f)));
}

const memo = new Map<string, string[]>();

/**
 * A module's flavour at `stars` (on a turret of class factor `k`, for a core's absolute numbers): its template's first
 * layout that fits (flavourFits), else its last; a module without a template shows its desc. [] for an unknown id.
 */
export function flavour(def: string, stars = 1, k = 1): string[] {
  const d = Object.prototype.hasOwnProperty.call(ITEMS, def) ? ITEMS[def] : undefined;
  if (!d) return [];
  const t = STAR_FLAVOUR[def];
  if (!t) return d.desc;
  const key = `${def}*${stars}*${k}`;
  let out = memo.get(key);
  if (!out) {
    const layouts = t(effectAt(def, stars), k);
    out = layouts.find((ls) => flavourFits(ls, d.desc)) ?? layouts[layouts.length - 1];
    memo.set(key, out);
  }
  return out;
}
