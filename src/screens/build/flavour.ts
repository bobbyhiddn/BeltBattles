// 0.6.2p (item 1): star-aware flavour. ItemDef.desc is a module's 1-star text; a module whose desc quotes a number its
// stars change, or an effect a star replaces, has a template here: the same words carrying that star's numbers, read
// from effectAt at that star (a turret core's absolute numbers x the class factor k, as scaleCore reads them), so the
// flavour never contradicts the ability text. Where a perk changes the mechanic itself (SIFTER, SPOTTER, SORTING ARM ★3,
// POWDER KEG ★3, MIMIC FORGE ★3, LONG HAUL's cap) the template says what that star does.
//
// 0.6.2t (REQ-BFG-032, T7): flavour is player text too. A template returns whole sentences in the desc's own voice, with
// T2's units (2.75 SECONDS, 60% FASTER, 3 TIMES AS FAST; never 3S, 1.6X, DMG or DMG/S) and no hand-made line breaks: the
// panel joins them into one paragraph and the wrap helper (src/ui/richText.ts) breaks it to the panel's width at draw
// time, so the polish's layout variants are gone. A module without a template shows its catalogue desc joined into one
// string (its lines are storage only). Units, speeds and rates come from the glossary (src/ui/abilityText.ts).
// Three templates also correct a desc the UI can't change at its source: CALIBRATION's and ESCAPEMENT's desc quote the
// interval's cut (25%, 10%) where the turret fires 33% and 11% faster, and ESCAPEMENT's, LONGCASE's and CLOCKWORKS'
// quote glued seconds (1.2S, 2S, 4.2S); tests/races.metronome.test.ts pins those race descs, so the UI says it right.

import { AMMO, BURN_TIME, FRAY_BONUS, ITEMS, SHAPE_ARROWS, type ItemDef } from "../../sim/content";
import { PEAK_SHIFT, PENDULUM } from "../../sim/races/data";
import { scaleCore } from "../../sim/cores";
import { effectAt } from "../../sim/stars";
import { n1, onlineIn, peakTiles, percent, rateText, seconds, speedText, times } from "../../ui/abilityText";

const WORDS = ["NONE", "ONE", "TWO", "THREE", "FOUR", "FIVE"];
const word = (n: number): string => WORDS[n] ?? String(n);
const NTH = ["", "", "OTHER", "THIRD", "FOURTH", "FIFTH"];
const nth = (n: number): string => NTH[n] ?? `${n}TH`;

/** One module's flavour at a star: its spec there (effectAt) and the class factor k -> whole sentences. */
type Template = (e: ItemDef, k: number) => string[];

const gate = (e: ItemDef) => e.gate!;
const fac = (e: ItemDef) => e.factory!;
/** A factory's slug damage at its stars: its dies (FactorySpec.base), else its ammo's (as Battle.stamp). */
const slugBase = (e: ItemDef): number => fac(e).base ?? AMMO[fac(e).ammo].base;
const mod = (e: ItemDef) => e.mod!;
const core = (e: ItemDef, k: number) => scaleCore(e.core!, k);

/**
 * The templates, by module. At 1 star each says what its catalogue desc says (tests/flavour.test.ts pins every star),
 * with T2's units; LIMPET WORKS' desc itself was fixed (0b.1: no stall at 1 star). Modules absent here quote no number
 * their stars change, and their desc has no shorthand: it shows at every star.
 */
export const STAR_FLAVOUR: Record<string, Template> = {
  // --- rigs ---
  temper: (e) => [`ADDS ${gate(e).burn} BURN.`, `EACH BURN STACK DEALS 1 DAMAGE A SECOND FOR ${seconds(BURN_TIME)} AFTER THE HIT.`],
  whetstone: (e) => [`+${n1(gate(e).flat!)} DAMAGE.`, "BEFORE A SPLITTER, BOTH COPIES GAIN IT."],
  // 0b.4: "LOCKED" means METRONOME's speed-locked belts only (battle.ts applyHit); a SLAG belt pays no locked bonus
  grease: (e) => [`THE BELT RUNS ${speedText(gate(e).speed!)} FROM ITS HIT.`, `METRONOME'S LOCKED BELTS GAIN +${n1(gate(e).lockedFlat!)} DAMAGE.`],
  brake: (e) => [
    `${gate(e).speed === 0.5 ? "HALF SPEED" : speedText(gate(e).speed!)} FROM ITS HIT.`,
    `METRONOME'S LOCKED BELTS GAIN +${n1(gate(e).lockedFlat!)} DAMAGE INSTEAD.`,
  ],
  // ★2/★3 count at most priorCap earlier hits (0.6.1p), so "EACH HIT" gains its cap
  longhaul: (e) => (gate(e).priorCap === undefined
    ? [`+${n1(gate(e).perPriorGate!)} DAMAGE FOR EACH HIT THE PAYLOAD ALREADY TOOK.`]
    : [`+${n1(gate(e).perPriorGate!)} DAMAGE FOR EACH EARLIER HIT, UP TO ${gate(e).priorCap} HITS.`]),
  splitter: (e) => [`SPLITS A PAYLOAD IN ${word(gate(e).split!.copies)} COPIES AT ${percent(gate(e).split!.mult)}.`, "MORE BELT PRESSURE."],
  overdrive: (e) => [
    `${SHAPE_ARROWS.X.length} ARROWS: THE BELT RUNS ${speedText(gate(e).speed!)} FROM ITS HIT.`,
    `METRONOME'S LOCKED BELTS GAIN +${n1(gate(e).lockedFlat!)} DAMAGE.`,
  ],
  tollbooth: (e) => [`GUARDS ITS BELT FROM THE FIRST ${gate(e).toll} HARASSMENT HITS.`],
  // ★2 POLISH and ★3 FINE MESH sift every mark, not one in order. 0.6.2t: the desc also names SAP, a mark nothing in
  // the game applies yet (battle.ts: "future SAP sources"); player text names only the marks a player can meet
  sifter: (e) => (gate(e).sift === "all"
    ? ["REMOVES CHILL AND SNAG FROM EVERY PASSING PAYLOAD."]
    : ["REMOVES CHILL OR SNAG FROM PASSING PAYLOADS IN ORDER."]),
  surge: (e) => {
    const p = gate(e).pulse!;
    return [`PULSES ${speedText(p.speed)} FOR ${seconds(p.on)} EVERY ${seconds(p.period)}.`, `METRONOME'S LOCKED BELTS GAIN +${n1(gate(e).lockedFlat!)} DAMAGE.`];
  },
  sorting: (e) => {
    const s = gate(e).sort!;
    return [`COPIES EVERY ${nth(s.every)} PAYLOAD${s.copies > 2 ? ` ${times(s.copies - 1)}` : ""} AT FULL STRENGTH.`];
  },
  riveter: (e) => [`EACH PASSING SLUG REPAIRS YOUR HULL BY ${n1(gate(e).repair!)}.`],
  heatjacket: (e) => [`+${n1(gate(e).heat!)} DAMAGE FOR EACH SECOND RIDDEN AFTER THIS RIG.`],
  venom: (e) => [`ADDS ${gate(e).poison} POISON.`, "THE POOL TICKS AND REFRESHES ON HIT."],
  overclocker: (e) => [`DOUBLES THE NEXT RIG ONCE, THEN COOLS FOR ${seconds(gate(e).overclockCooldown!)}.`],
  // ★3 WIDE BLAST: the payloads on every belt beside the keg, not only on the belts its arrows hit (Battle.detonateKeg)
  keg: (e) => {
    const k = gate(e).keg!;
    return [`BLOWS AFTER ${seconds(k.fuse)}: ${k.wide ? "ALL BELTS BESIDE IT" : "PAYLOADS ON ITS BELT"} GAIN +${n1(k.flat)} DAMAGE AND ${k.burn} BURN.`];
  },
  bellows: (e) => [`ADDS BURN FROM RIDE TIME SO FAR, UP TO ${gate(e).burnPerRide!.max} STACKS.`],
  quench: (e) => [`TURNS BURN STACKS INTO +${n1(gate(e).quench!.perBurn)} DAMAGE EACH, UP TO +${n1(gate(e).quench!.max)} DAMAGE.`],
  lodestone: (e) => [`+${n1(gate(e).perStalled!.each)} DAMAGE FOR EACH ENEMY MACHINE STALLED RIGHT NOW.`],
  barbed: (e) => [`HITS ADD ${gate(e).fray} FRAY.`, `LATER HITS DEAL +${n1(FRAY_BONUS)} DAMAGE FOR EACH STACK.`],
  counterweight: (e) => [`+${n1(gate(e).perTile!.each)} DAMAGE FOR EACH BELT TILE ALREADY RIDDEN, UP TO +${n1(gate(e).perTile!.max)} DAMAGE.`],
  // --- factories ---
  // ★2/★3 dies stamp heavier slugs (FactorySpec.base), no longer plain ones
  press: (e) => [
    `STAMPS ${fac(e).base === undefined ? "PLAIN SLUGS" : `${n1(slugBase(e))} DAMAGE SLUGS`} EVERY ${seconds(fac(e).interval)}.`,
    "NEEDS A FREE TURRET INTAKE.",
  ],
  doublestamp: (e) => [
    `STAMPS ${word(fac(e).batch!)} ${fac(e).base === undefined ? "PLAIN SLUGS" : `SLUGS OF ${n1(slugBase(e))} DAMAGE`} EVERY ${seconds(fac(e).interval)}.`,
    "QUEUE PRESSURE.",
  ],
  shottower: (e) => [`DROPS ${fac(e).batch} BUCKSHOT (${n1(slugBase(e))} DAMAGE) EVERY ${seconds(fac(e).interval)}.`, "RIGS HIT EACH ONE."],
  hotswap: (e) => [`ALTERNATES EMBER SLUGS (${fac(e).cycle!.find((p) => p.tint === "ember")?.burn ?? 0} BURN) AND SPARK SLUGS (SHOCK).`],
  slagpot: (e) => [`HEAVY SLAG SLUGS (${n1(slugBase(e))} DAMAGE) THAT IGNORE BELT SPEED RIGS.`],
  // x0.5 comes online in half the time, x0.25 a quarter; ★3's x0 has every rig online at 0 s (the glossary's words)
  assembly: (e) => [`SLOW PLAIN SLUGS, AND ALL YOUR RIGS COME ONLINE ${onlineIn(fac(e).commission!)}.`],
  gantry: (e) => [`ONE PRESS, ${word(fac(e).outputs)} OUTPUTS: FEEDS ${word(fac(e).outputs)} INTAKES BY TURNS.`],
  // the timer runs whatever the harassment does (Battle.produce): "AND EVERY", where the desc said "OR EVERY"
  scrapper: (e) => [`STAMPS SCRAP SLUGS WHEN HARASSMENT HITS THE FOE, AND EVERY ${seconds(fac(e).interval)}.`],
  // ★3 TWIN SIGNET: two outputs, so two more routes of the hero's ammo
  mimic: (e) => (fac(e).outputs > 1
    ? [`STAMPS YOUR HERO'S SIGNATURE AMMO INTO ${word(fac(e).outputs)} MORE ROUTES.`]
    : ["STAMPS YOUR HERO'S SIGNATURE AMMO INTO A SECOND ROUTE."]),
  // 0b.1: a 1-star charge never stalls (round.stall arrives at ★2)
  limpet: (e) => {
    const r = fac(e).round as { delay: number; stall?: number };
    return [`STICKY CHARGES BLOW ${seconds(r.delay)} LATER FOR HULL DAMAGE${r.stall ? " AND A STALL" : ""}.`];
  },
  // --- turret cores (k: the turret's class factor, as scaleCore) ---
  scatter: (e, k) => [`SHOTS BURST INTO ${core(e, k).pellets} PELLETS AT ${percent(core(e, k).share!)}, EACH AIMED ANEW.`],
  rotary: (e, k) => ["FIRES THE OLDEST LOAD FIRST.", `LOADING CLOSES IN ${seconds(core(e, k).windowTime!)}.`],
  pressure: (e, k) => [`+${n1(core(e, k).perQueued!)} DAMAGE FOR EACH PAYLOAD QUEUED AT IT.`, "NEVER JAMS."],
  gatling: (e, k) => {
    const c = core(e, k);
    return ["NEVER WAITS: FIRES EACH LOAD AT ONCE.", `EACH QUICK SHOT TRIMS ${percent(c.step!)} OFF THE RELOAD, DOWN TO ${percent(c.floor!)}.`];
  },
  hullbreaker: (e, k) => ["NEVER HITS MACHINES.", `EVERY HULL HIT DEALS +${percent(core(e, k).hullMul! - 1)}.`],
  // "FLAT" is an engine word: the ability text calls it BONUS DAMAGE and says what it is
  drake: (e, k) => ["TURNS BONUS DAMAGE INTO BURN.", `ITS FIRES BURN FOR ${seconds(core(e, k).burnTime!)}, NOT ${seconds(BURN_TIME)}.`],
  salvo: (e, k) => [`WAITS FOR A FULL CHAMBER, THEN FIRES IT ALL AT +${n1(core(e, k).volleyFlat!)} DAMAGE EACH.`],
  mortar: (e, k) => {
    const c = core(e, k), lob = `LOBS FLY ${times(c.flightMul!)} AS LONG`, share = percent(c.share!);
    return c.splash === 1
      ? [`${lob} AND SPLASH ONE MORE TARGET AT ${share}.`]
      : [`${lob} AND SPLASH ${word(c.splash!)} MORE TARGETS, EACH AT ${share}.`];
  },
  grapnel: (e, k) => (core(e, k).rip === 1
    ? ["BELT HITS RIP THE NEAREST ENEMY SLUG OFF THAT ROUTE."]
    : [`BELT HITS RIP THE ${core(e, k).rip} NEAREST ENEMY SLUGS OFF IT.`]),
  tesla: (e, k) => {
    const c = core(e, k);
    return c.arcs === 1
      ? [`HITS ARC TO THE NEAREST MACHINE FOR ${percent(c.share!)} AND STALL IT FOR ${seconds(c.stall!)}.`]
      : [`HITS ARC TO THE ${c.arcs} NEAREST MACHINES FOR ${percent(c.share!)} AND STALL THEM FOR ${seconds(c.stall!)}.`];
  },
  capacitor: (e, k) => [`IDLE TIME CHARGES THE NEXT SHOT: +${n1(core(e, k).perSecond!)} DAMAGE A SECOND, UP TO ${seconds(core(e, k).maxSeconds!)}.`],
  compound: (e, k) => [`PACKS TWO LOADS INTO ONE SHELL AT ${percent(core(e, k).mult!)} TOTAL DAMAGE.`],
  lance: (e, k) => {
    const n = core(e, k).columns!;
    return [`HITS THE HULL AND EVERY MACHINE IN ${n === 1 ? "ONE DECK COLUMN" : `${n} DECK COLUMNS`}.`];
  },
  // --- turret gear ---
  chamber: (e) => [`TURRET FIRES ${word(mod(e).perShot!)} PAYLOADS EACH SHOT.`, "DROP ON A TURRET."],
  // the interval x0.75 fires 1 / 0.75 = 33% faster (the catalogue desc says 25%, the interval's cut; this shows the rate)
  calibrate: (e) => [`TURRET FIRES ${rateText(mod(e).fireMul!)}.`, "DROP ON A TURRET."],
  flak: (e) => [`INTERCEPTS ${percent(mod(e).intercept!)} OF INCOMING HARASSMENT ROUNDS SIDE-WIDE.`],
  // ★2 FACTORY SPOT rerolls more than once; ★3 EAGLE EYE never aims at bare hull
  spotter: (e) => (mod(e).alwaysMachine
    ? ["TURRET AIMS AT MACHINERY ONLY, NEVER BARE HULL."]
    : (mod(e).rerolls ?? 0) > 1
      ? ["TURRET REROLLS BARE-HULL TARGETS TOWARD MACHINERY."]
      : ["TURRET REROLLS A BARE-HULL TARGET TOWARD MACHINERY."]),
  hopper: (e) => {
    const w = mod(e).window!;
    return [`CHAMBER HOLDS ${w} MORE LOAD${w === 1 ? "" : "S"} AND WAITS ${seconds(mod(e).windowTime!)} LONGER.`];
  },
  ram: (e) => [`THE LAST PAYLOAD OUT OF THE CHAMBER HITS ${percent(mod(e).finisher!)} HARDER.`],
  // the desc's numbers are pinned by tests/races.metronome.test.ts, so T2's units and the rate are fixed here, in the UI
  escapement: (e) => [
    `FIRES ${rateText(mod(e).fireMul!)}.`,
    `PENDULUM PEAK ${seconds(-PEAK_SHIFT.escapement)} EARLIER: ${peakTiles(PENDULUM.peak + PEAK_SHIFT.escapement)} TILES.`,
  ],
  longcase: (e) => [
    `OTHER SLUGS: +${n1(mod(e).longRideFlat!)} DAMAGE AFTER ${seconds(mod(e).longRideMin!)} OF RIDE.`,
    `PENDULUM PEAK ${seconds(PEAK_SHIFT.longcase)} LATER.`,
  ],
  // --- a signature factory whose desc quotes a glued second (METRONOME's; races/data.ts is left as it is) ---
  clockworks: () => ["STAMPS PENDULUM SLUGS.", `THEY PEAK AFTER ${seconds(PENDULUM.peak)} OF RIDE: ${peakTiles(PENDULUM.peak)} TILES.`],
};

/**
 * A module's flavour at `stars` (on a turret of class factor `k`, for a core's absolute numbers): its template's
 * sentences, else its catalogue desc joined into one string. [] for an unknown id.
 */
export function flavour(def: string, stars = 1, k = 1): string[] {
  const d = Object.prototype.hasOwnProperty.call(ITEMS, def) ? ITEMS[def] : undefined;
  if (!d) return [];
  const t = STAR_FLAVOUR[def];
  return t ? t(effectAt(def, stars), k) : [d.desc.join(" ")];
}

/** The flavour as one paragraph (what the panels wrap and draw). */
export function flavourText(def: string, stars = 1, k = 1): string {
  return flavour(def, stars, k).join(" ");
}
