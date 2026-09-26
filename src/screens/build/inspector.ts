// Details panel: explains the hovered or selected thing (card, cargo, deck item, belt route,
// turret) with its action button; idle it shows the cruiser card. Landscape uses the left
// column (sized to its content), portrait the strip between the shop and the deck.

import { shopBadge, type DuskFoe, type Run } from "../../game/run";
import { record } from "../../game/day";
import {
  DISRUPT_TIME, HEROES, ITEMS, MERCHANTS, SIGNATURE_CORES, START_LIVES, WINDOW_TIME, classFactor, rigShape,
} from "../../sim/content";
import { AMMO, type FactorySpec, type ItemDef } from "../../sim/content"; // 0.6.1c: factory headlines
import { makeTurret } from "../../sim/battle"; // 0.6.1p: the turret's window as the battle sees it
// beltside-062: BELTSIDE's walk and rig hits replace 0.6.1r's estimateRoute and key (the gate-on-a-belt sub line)
import {
  arrowsOf, beltUsed, connectedRouteCount, defOf, gearFor, hitsOfRig, installedTurrets, itemByUid, routeInfo, routesOf,
  turretSlots, walkRoute, type Build, type TimelineHit,
} from "../../sim/deck";

/** 0.6.2s (REQ-BFG-031 S2): the build's intakes: its installed turrets' belt columns (an empty slot has none). */
const intakeCount = (b: Build): number => turretSlots(b).reduce((n, s) => n + s.intakes.length, 0);
import { resolveCore, scaleCore, type TurretCore } from "../../sim/cores"; // 0.6.1b; 0.6.1r N4: scaleCore
import { C, RARITY_COLOR } from "../../render/palette";
import { rect, type G } from "../../render/pixel";
import { drawText, textWidth, wrap } from "../../render/font";
import { beltIcon, itemIcon } from "../../render/sprites";
import { button, panel, type Rect } from "../../ui/ui";
import { drawPortrait, tag } from "../../ui/captain";
import { buy, deleteRoute, rotate, selectGain, sell, sellPrice, store, unfitCore, unfitMod, type Ctx } from "./actions";
import { effectAt, FUSE_MAX, fusible, outputsAt, pendingAt, perkAt, starsOf, starText } from "../../sim/stars";
import { gainModule, mergePreview } from "../../game/fuse";

/** 0.6.1a: an inspect title with its stars in the 5x7 ★ glyph ("TEMPER ★★"); 1 star shows none. */
const starred = (name: string, stars: number): string => (stars > 1 ? `${name} ${starText(stars)}` : name);
import type { Sel } from "./layout";
import { describe } from "./shop";

/**
 * 0.6.1d: the headline number at `stars`, `effectAt` read out short (ARSENAL.md §8.1, §8.2). 0.6.1p: every applied
 * star perk reads here too. OVERDRIVE's REDLINE/AFTERBURNER guards and MANTLET's freeze/sabot/static/arc/drag
 * immunities act only once wave 2 adds those attacks, so no line promises them (only the perk's name shows).
 */
export function starEffectLine(def: string, stars: number, k = 1): string {
  const e = effectAt(def, stars);
  const gt = e.gate, m = e.mod;
  if (e.core) return coreLine(def, stars, k); // 0.6.1r N4: a core's headline at that star
  if (gt?.poison) return `+${gt.poison} POISON · 6S POOL`;
  if (gt?.overclockCooldown) return `X2 NEXT RIG · ${gt.overclockCooldown}S COOLDOWN`;
  if (gt?.keg) return `BLAST +${gt.keg.flat} · ${gt.keg.burn} BURN · ${gt.keg.fuse}S`;
  if (gt?.burnPerRide) return `+1 BURN/${gt.burnPerRide.seconds}S · MAX ${gt.burnPerRide.max}`;
  if (gt?.quench) return `+${gt.quench.perBurn}/BURN · MAX ${gt.quench.max} · CONSUMES BURN`;
  if (gt?.staticTime) return `STATIC STALL ${gt.staticTime}S`;
  if (gt?.perStalled) return `+${gt.perStalled.each}/STALLED · MAX ${gt.perStalled.max}`;
  if (gt?.fray) return `+${gt.fray} FRAY${gt.frayCap ? ` · CAP +${gt.frayCap}` : ""}`;
  if (gt?.perTile) return `+${gt.perTile.each}/TILE · MAX ${gt.perTile.max}`;
  if (gt?.burn) return `+${gt.burn} BURN`;
  // 0.6.1f BRAKE SHOE: half speed at every star; HOT SHOE and RED-HOT SHOE add friction heat (flat damage)
  if (gt?.speed && gt.speed < 1) return `${gt.speed === 0.5 ? "HALF SPEED" : `SPEED X${gt.speed}`}${gt.flat ? ` · +${gt.flat} DMG` : ""}`;
  if (gt?.speed) return `SPEED X${gt.speed}${gt.flat ? ` · +${gt.flat} FLAT` : ""}`; // OVERDRIVE ★3: + AFTERBURNER's flat
  // beltside-062 (DESIGN §11 P3): a rig's perk in BELTSIDE's words: LONG HAUL counts earlier HITS, up to its cap
  if (gt?.perPriorGate) return `+${gt.perPriorGate}/HIT${gt.priorCap !== undefined ? ` · MAX ${gt.priorCap} HITS` : ""}`;
  if (gt?.split) return `${gt.split.copies} X ${Math.round(gt.split.mult * 100)}%`; // 0.6.1f: "2 X 85%", as "3 X 1 DMG"
  if (gt?.shock) return `STALL ${(gt.shockTime ?? DISRUPT_TIME).toFixed(1)}S${gt.jump ? ` · JUMPS TO ${gt.jump} MORE` : ""}`;
  if (gt?.toll) return `ABSORBS ${gt.toll} HITS${gt.tollFactory ? " · FACTORY TOO" : ""}`;
  if (gt?.sift) return `SIFTS ${gt.sift === "all" ? "ALL" : gt.sift}${gt.siftFlat ? ` · +${gt.siftFlat}/MARK` : ""}${gt.siftClean ? ` · +${gt.siftClean} CLEAN` : ""}`;
  if (gt?.pulse) return `${gt.pulse.speed}X FOR ${gt.pulse.on}S / ${gt.pulse.period}S${gt.pulse.flat ? ` · +${gt.pulse.flat}/PULSE` : ""}`;
  if (gt?.sort) return `${gt.sort.copies} COPIES EVERY ${gt.sort.every}ND`;
  if (gt?.repair) return `REPAIR ${gt.repair}/PASS`;
  if (gt?.heat) return `+${gt.heat} DMG/RIDE SECOND`;
  if (gt?.flat) return `+${gt.flat} FLAT`;
  if (def === "mimic") return `SIGNATURE AMMO X${e.factory?.intervalMul} · ${e.factory?.outputs} OUTPUTS`;
  if (e.factory) return factoryLine(e.factory);
  if (def === "escapement" && m?.fireMul) return `FIRE X${m.fireMul} · PEAK -1.2S`;
  if (def === "longcase" && m?.longRideFlat) return `+${m.longRideFlat} AFTER ${m.longRideMin}S · PEAK +1.2S`;
  if (m?.fireMul) return `FIRE X${m.fireMul}`;
  if (m?.perShot) return `${m.perShot}/SHOT${m.window ? ` · +${m.window} SLOT` : ""}`;
  if (m?.window) return `+${m.window} SLOT${m.window > 1 ? "S" : ""} · +${m.windowTime ?? 0}S${m.noJam ? " · NEVER JAMS" : ""}`; // HOPPER
  if (m?.immune) return `SHOCK-PROOF${m.intakeGuard ? ` · GUARDS LAST ${m.intakeGuard} TILES` : ""}`; // MANTLET (wave 1: shock only)
  if (m?.finisher) return `FINISHER +${Math.round(m.finisher * 100)}%`;
  if (m?.intercept) return `${Math.round(m.intercept * 100)}% INTERCEPT`;
  if (m?.rerolls || m?.alwaysMachine) return m.alwaysMachine ? `ALWAYS MACHINE · FACTORY X${m.factoryWeight}` : `${m.rerolls} REROLL${m.rerolls === 1 ? "" : "S"}${m.factoryWeight ? ` · FACTORY X${m.factoryWeight}` : ""}`;
  const perk = livePerk(def, stars);
  if (perk) return perk;
  return "";
}

/**
 * 0.6.1c: a factory's headline at its stars (catalogue.json "headline"), one phone line each (3x5 face, 151 px).
 * STAMP PRESS keeps 0.6.1p's "EVERY 1.1S · 5 DMG SLUGS" (and the signatures, which never show a level line).
 */
function factoryLine(f: FactorySpec): string {
  const base = f.base ?? AMMO[f.ammo]?.base ?? 0;
  if (f.trigger) return `SCRAP +${f.scrapFlat} · IDLE ${f.interval}S${f.bigHaul ? " · BIG HAUL" : ""}`;
  if (f.round?.kind === "sabot") return `SABOT EVERY ${f.interval}S${f.round.shrapnel ? " · SHRAPNEL" : ""}`;
  if (f.round?.kind === "frost") return `FREEZE ${f.round.seconds}S · SPREAD ${f.round.spread}`;
  if (f.round?.kind === "drag") return `SLOW X${f.round.mul} FOR ${f.round.seconds}S`;
  if (f.round?.kind === "limpet") return `BLAST ${f.round.blast} IN ${f.round.delay}S${f.round.stall ? ` · STALL ${f.round.stall}S` : ""}`;
  if (f.cycle) { // HOT SWAP
    const em = f.cycle.find((p) => p.tint === "ember"), sp = f.cycle.find((p) => p.tint === "spark");
    return `EMBER +${em?.burn ?? 0} · SPARK ${(sp?.shockTime ?? DISRUPT_TIME).toFixed(1)}S${sp?.jump ? "+JUMP" : ""} · ${f.interval}S`;
  }
  // ASSEMBLY LINE (beltside-062c: players read RIG, DESIGN §1 and §12 P10)
  if (f.commission !== undefined) return `RIGS ONLINE X${f.commission} · ${f.interval}S${f.hotStart ? ` · X2 ${f.hotStart}S` : ""}`;
  if (f.batch) return `${f.batch} X ${base} DMG EVERY ${f.interval}S`; // DOUBLE STAMP, SHOT TOWER
  if (AMMO[f.ammo]?.fixedSpeed) return `${base} DMG SLAG EVERY ${f.interval}S`; // SLAG POT
  if (f.outputs > 1) return `${f.outputs} OUTPUTS · ${base} DMG EVERY ${f.interval}S`; // GANTRY PRESS
  return `EVERY ${f.interval}S${f.base !== undefined ? ` · ${f.base} DMG SLUGS` : ""}`;
}

/** 0.6.1c: a bought factory's inspect body leads with its headline at its stars and the MERGES WITH / NEXT line, so
 *  the phone band's 4 body lines (0.6.1r F7) keep both; its desc follows. Every other kind keeps desc first. */
function body(d: ItemDef, stars: number, lines: (string | null)[], hint: string, k = 1): string[] {
  const own = lines.filter((l): l is string => !!l);
  if (d.kind !== "factory" || !fusible(d.id)) return [...d.desc, ...own, hint];
  const head = stars > 1 ? own : [starEffectLine(d.id, stars, k), ...own];
  return [...head, ...d.desc, hint];
}

/** 0.6.1r (review-061 F5): the perk's name, unless the sim doesn't apply its values yet (levels[n].pending), so
 *  the inspector never promises an effect that doesn't exist. 0.6.1p emptied every pending; later waves may not. */
function livePerk(def: string, stars: number): string | undefined {
  return Object.keys(pendingAt(def, stars)).length ? undefined : perkAt(def, stars);
}

/** 0.6.1r (review-061 N4): a turret core's headline at `stars` on a turret of class factor k: the turret panel's
 *  own firing summary (coreShape) over the same k-scaled spec resolveCore builds (effectAt's core, scaleCore by k),
 *  plus what only the fire rate shows there (ROTARY's intervalMul) and a NEVER JAMS a star adds (ROTARY ★3). */
function coreLine(def: string, stars: number, k: number): string {
  const raw = effectAt(def, stars).core!;
  const tc: TurretCore = { def, bought: true, routine: raw.routine, stars, k, spec: scaleCore(raw, k) };
  const base = ITEMS[def].core;
  return [
    coreShape(tc),
    tc.spec.intervalMul ? `FIRE X${tc.spec.intervalMul}` : "",
    tc.spec.noJam && !base?.noJam ? "NEVER JAMS" : "",
  ].filter(Boolean).join(" · ");
}

/** 0.6.1r N4: the class factor a core in this run's cargo or shop would fire at: the hero's turrets (all of one
 *  class today: FURNACE heavy k 1, WEAVER light k 0.55), as resolveCore scales it once fitted. */
function heroK(run: Run): number {
  const td = installedTurrets(run.build)[0]?.td; // 0.6.2s: the first installed turret (the hero's first, at the start)
  return td ? classFactor(td) : 1;
}

/** 0.6.1p (ARSENAL.md §8.2): the current level's numbers with its perk, "★2 CLEAN CUT: 2 X 72%"; null at 1 star (desc says it).
 *  0.6.1r: exported for tests; `k` scales a core's numbers (heroK). */
export function levelLine(def: string, stars: number, k = 1): string | null {
  if (stars <= 1 || !fusible(def)) return null;
  const perk = livePerk(def, stars), eff = starEffectLine(def, stars, k);
  return `★${stars}${perk ? ` ${perk}` : ""}${eff && eff !== perk ? `: ${eff}` : ""}`;
}

/** 0.6.1d (ARSENAL.md §8.1): "MERGES WITH YOUR TEMPER ★1 → ★2 · +4 BURN", live from mergePreview. */
export function mergeLine(run: Run, def: string): string | null {
  const preview = mergePreview(run, def);
  if (!preview) return null;
  const to = preview.toStars, from = to - 1;
  const after = starEffectLine(def, to, heroK(run));
  return `MERGES WITH YOUR ${ITEMS[def].name} ★${from} → ★${to}${after ? ` · ${after}` : ""}`;
}

/** How many more 1★ gains of `def` (bought, dropped, however) it takes to pass `atLeast` stars,
 *  simulated on a cloned run through the real gainModule (no re-implemented fuse math). */
function copiesToNextStar(run: Run, def: string, atLeast: number): number {
  const clone = { ...run, build: JSON.parse(JSON.stringify(run.build)), inventory: run.inventory.map((i) => ({ ...i })), fuseFx: [] } as Run;
  for (let n = 1; n <= 8; n++) {
    const g = gainModule(clone, def);
    if (g.stars > atLeast) return n;
  }
  return 8;
}

/** 0.6.1d (ARSENAL.md §8.2): "NEXT ★3: +7 BURN · 2 MORE COPIES"; null at ★3 or for a non-fusible id.
 *  0.6.1r (review-061 N2): "1 MORE COPY" in the singular. */
export function nextLine(run: Run, def: string, stars: number): string | null {
  if (!fusible(def) || stars >= FUSE_MAX) return null;
  const next = stars + 1;
  const eff = starEffectLine(def, next, heroK(run));
  const copies = copiesToNextStar(run, def, stars);
  // 0.6.1c: a factory's NEXT line names the perk that star brings (TRIPLE DIES, HOT START, THIRD ARM, HEAVY GANTRY).
  // 0.6.1f: so does a gate's (HOT SHOE, RED-HOT SHOE, CLEAN CUT, PERFECT CUT; SPARK JUMP, REDLINE, AFTERBURNER), unless
  // the perk's name is the whole effect line (a gate with no numbers reads "NEXT ★2: PERK" as before)
  const kind = ITEMS[def].kind;
  const brings = (kind === "factory" || kind === "gate") && perkAt(def, next) !== perkAt(def, stars) ? livePerk(def, next) : undefined;
  const perk = brings !== eff ? brings : undefined;
  return `NEXT ★${next}${perk ? ` ${perk}` : ""}${eff ? `: ${eff}` : ""} · ${copies} MORE ${copies === 1 ? "COPY" : "COPIES"}`;
}

interface Action {
  id: string;
  label: string;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onTap: () => void;
}

/** A line of the panel's text: plain (bone), or [text, colour] (0.6.2: warnings and the turret-end readout). */
type Line = string | [string, string];

interface Spec {
  icon: HTMLCanvasElement | null;
  title: string;
  color: string;
  sub: string;
  subColor?: string; // 0.6.2 BELTSIDE: an IDLE rig's sub line warns
  subShort?: string; // 0.6.2 BELTSIDE: the sub line where `sub` doesn't fit (the portrait strip beside two buttons)
  // 0.6.2 BELTSIDE: the sub line (in yellow) when the panel has no room for a single text line (the 360x640 portrait
  // strip is a header only): a belt's turret-end readout, so V4's DMG, BURN, SHOCK, SPD and TIME stay in sight.
  // Variants from the fullest to the tightest: the first that fits is drawn, else the last, cut short at its end
  // (the tightest one lists by importance: DMG, TIME, BURN, SHOCK, SPD, which the chevron tint also shows)
  subTight?: string[];
  text: Line[];
  actions?: Action[]; // 0.6.1b: was a single `action`; the turret case needs REMOVE CORE and REMOVE GEAR
  // 0.6.2 BELTSIDE: when the text overflows its panel, drop text[from..to) from the end and say so with
  // more(n) instead of losing the last lines (a belt's timeline rows give way to its turret-end readout)
  trim?: { from: number; to: number; more: (n: number) => Line };
}

/** 0.6.2 BELTSIDE: the hint for placing a part from the shop (`drag`: it can be dragged there too) or cargo. */
function placeHint(kind: string, drag: boolean): string {
  const how = kind === "mod" || kind === "core" ? "TAP A TURRET TO FIT IT"
    : kind === "gate" ? "TAP A CELL BESIDE A BELT: ITS ARROWS WORK THE BELT TILES THEY POINT AT"
    : "TAP THE DECK TO PLACE IT";
  return drag ? `${how}, OR DRAG IT THERE.` : `${how}.`;
}

const num = (x: number): string => String(+x.toFixed(2));

/** 0.6.2 BELTSIDE (V4): one hit in a belt's timeline: the rig and what it did there (walkRoute). beltside-062:
 *  exported for tests (the LONG HAUL cap, P3). */
export function hitLabel(h: TimelineHit, locked: boolean): string {
  const name = ITEMS[h.def].name;
  if (h.timed) return `${name} ${h.timed}`;
  if (h.poison) return `${name} POISON +${h.poison}`;
  if (h.staticTime) return `${name} STATIC ${h.staticTime}S`;
  if (h.fray) return `${name} FRAY +${h.fray}`;
  if (h.split) return `${name} X${h.split.copies} AT ${Math.round(h.split.mult * 100)}%`;
  // beltside-062 (DESIGN §11 P3): a LONG HAUL ★2/★3 that saw more earlier hits than its cap says so
  if (h.capped !== undefined) return `${name} +${num(h.flat ?? 0)} (MAX ${h.capped} HITS)`;
  if (h.prior !== undefined) return `${name} +${num(h.flat ?? 0)} (${h.prior} HIT${h.prior === 1 ? "" : "S"} BEFORE)`;
  if (h.flat) return `${name} +${num(h.flat)}`;
  if (h.burn) return `${name} BURN +${h.burn}`;
  if (h.shock) return `${name} SHOCK`;
  if (h.speed !== undefined) return `${name} ${num(h.speed)}X${locked ? " (LOCKED)" : h.won ? "" : " (BEATEN)"}`;
  return name;
}

/** beltside-062c: a placed rig's inspector panel, without its icon and button callbacks (spec adds them). */
export interface RigPanel {
  title: string;
  sub: string;
  subShort?: string; // the sub line beside the portrait strip's buttons
  idle: boolean;
  x: boolean; // an X rig: no ROTATE button
  labels: string[]; // the buttons, in order
  text: Line[];
}

/**
 * 0.6.2 BELTSIDE (V4): a placed rig's panel: its hits, or IDLE when none of its arrows lands on a belt. The lines that
 * matter most come first, because a short panel drops the last ones. beltside-062: a ★2/★3 rig's perk (0.6.1r's
 * levelLine) comes right under its hits. beltside-062c (DESIGN §12 P11): hits (or IDLE), perk, NEXT/MERGES, turn hint,
 * then the flavour, so on a phone the flavour gives way first and the hits last and merge progress stays in sight (as
 * 0.6.1c's factory body leads with its headline and NEXT line). Exported for tests; null unless `uid` is a placed rig.
 */
export function rigPanel(run: Run, uid: number): RigPanel | null {
  const p = itemByUid(run.build, uid);
  if (!p) return null;
  const d = defOf(p);
  if (d.kind !== "gate") return null;
  const stars = starsOf(p);
  const hits = hitsOfRig(run.build, p.uid);
  const arrows = arrowsOf(p).length, x = rigShape(d) === "X";
  const idle = hits.length === 0;
  const lvl = levelLine(d.id, stars), next = nextLine(run, d.id, stars);
  const on = new Set(hits.map((h) => h.dir)).size;
  return {
    title: starred(d.name, stars),
    sub: idle ? "RIG · IDLE" : `RIG · ${on}/${arrows} ARROWS ON BELTS`,
    subShort: idle ? undefined : `RIG · ${on}/${arrows} HIT`,
    idle, x,
    labels: [...(x ? [] : ["ROTATE"]), "TO CARGO"],
    text: [
      ...(idle ? [["IDLE: NO ARROW REACHES A BELT. TURN IT OR MOVE IT BESIDE ONE.", C.amber] as Line] : hits.map((h) => `→ BELT ${h.route + 1} · TILE ${h.tile + 1}`)),
      ...(lvl ? [lvl] : []),
      ...(next ? [next] : []),
      x ? "FACES EVERY SIDE. DRAG TO MOVE." : "TAP TO TURN (OR R). DRAG TO MOVE.",
      ...d.desc,
    ],
  };
}

/** 0.6.1b: the core's firing summary rescaled by k ("3 PELLETS x 40%"), or "" for the identity routine
 *  (ARSENAL.md §8.4). `tc.spec` is already k-scaled (resolveCore), so absolute numbers read straight off it. */
function coreShape(tc: TurretCore): string {
  const c = tc.spec;
  switch (tc.routine) {
    case "scatter": return `${c.pellets} PELLETS x ${Math.round((c.share ?? 1) * 100)}%`;
    case "rotary": return `${c.order} LOAD FIRST`;
    case "pressure": return `+${(c.perQueued ?? 0).toFixed(1)} DMG PER QUEUED`;
    case "gatling": return `SPIN ${(c.start ?? 1).toFixed(2)}X TO ${(c.floor ?? 1).toFixed(2)}X`;
    case "hullbreaker": return `HULL ONLY x${(c.hullMul ?? 1).toFixed(2)}`;
    case "drake": return `+${c.addBurn} BURN ${c.burnTime}S`;
    case "salvo": return `FULL VOLLEY +${(c.volleyFlat ?? 0).toFixed(1)} EACH`;
    case "mortar": return `${c.splash} SPLASH X${c.share} · FLIGHT X${c.flightMul}`;
    case "grapnel": return `RIP ${c.rip} WITHIN ${c.reach} TILES`;
    case "tesla": return `${c.arcs} ARCS X${c.share} · STALL ${c.stall}S`;
    case "capacitor": return `+${(c.perSecond ?? 0).toFixed(1)}/IDLE S · MAX ${c.maxSeconds}S`;
    case "compound": return `2 LOADS X${c.mult} · HOLD ${c.hold}S`;
    case "lance": return `${c.columns} COLUMNS X${c.share}`;
    default: return "";
  }
}

function spec(ctx: Ctx, show: Sel, hovering: boolean): Spec | null {
  const { run } = ctx;
  const b = run.build;
  switch (show.kind) {
    case "offer": {
      const o = run.shop.wagons[show.wagon]?.offers[show.slot];
      if (!o) return null;
      const d = ITEMS[o.def];
      const can = !o.sold && run.gold >= o.price;
      const merging = !o.sold && shopBadge(run, o.def)?.kind === "merge";
      const hint = d.kind === "supply" ? "USED THE MOMENT YOU BUY IT." : placeHint(d.kind, true);
      const mLine = merging ? mergeLine(run, o.def) : null;
      return {
        icon: itemIcon(d.id), title: d.name, color: RARITY_COLOR[d.rarity], sub: `${describe(d)} · ${MERCHANTS[run.shop.wagons[show.wagon].merchant].name}`,
        text: body(d, 1, [mLine], hint, heroK(run)), // 0.6.1c: a factory leads with its headline
        actions: hovering ? [] : [{
          id: "buy", label: o.sold ? "SOLD" : d.kind === "supply" ? `BUY+USE ${o.price}G` : merging ? `BUY+MERGE ${o.price}G` : `BUY ${o.price}G`, primary: can, disabled: !can,
          onTap: () => {
            const res = buy(ctx, show.wagon, show.slot);
            if (res.gain) selectGain(ctx, res.gain); // 0.6.1a: after a merge, the survivor
          },
        }],
      };
    }
    case "cargo": {
      const it = run.inventory.find((i) => i.uid === show.uid);
      if (!it) return null;
      const d = ITEMS[it.def];
      const stars = starsOf(it);
      const next = nextLine(run, it.def, stars);
      const lvl = levelLine(it.def, stars, heroK(run)); // 0.6.1p; 0.6.1r N4: a core's numbers at the hero's k
      return {
        icon: itemIcon(d.id), title: starred(d.name, stars), color: RARITY_COLOR[d.rarity], sub: `${describe(d)} · IN CARGO`,
        // beltside-062c: 0.6.1c's body (a factory leads with its headline) with BELTSIDE's placing hint
        text: body(d, stars, [lvl, next], placeHint(d.kind, false), heroK(run)),
        actions: [{ id: "sell", label: `SELL +${sellPrice(d.id, stars)}G`, onTap: () => sell(ctx, it.uid) }],
      };
    }
    case "item": {
      const p = itemByUid(b, show.uid);
      if (!p) return null;
      const d = defOf(p);
      const stars = starsOf(p);
      const sig = d.id === "kiln" || d.id === "loom";
      const next = sig ? null : nextLine(run, d.id, stars);
      const lvl = sig ? null : levelLine(d.id, stars); // 0.6.1p
      if (d.kind === "gate") {
        // 0.6.2 BELTSIDE (V4): a rig's hits, or IDLE when none of its arrows lands on a belt (rigPanel)
        const rp = rigPanel(run, p.uid)!;
        return {
          icon: itemIcon(d.id), title: rp.title, color: RARITY_COLOR[d.rarity], sub: rp.sub, subShort: rp.subShort,
          subColor: rp.idle ? C.amber : undefined, text: rp.text,
          actions: [
            ...(rp.x ? [] : [{ id: "rotate", label: "ROTATE", onTap: () => rotate(ctx, p.uid) }]),
            { id: "store", label: "TO CARGO", onTap: () => store(ctx, p.uid) },
          ],
        };
      }
      // beltside-062c: a placed factory (rigs have their own branch above, so 0.6.1c's "GATE · ON A BELT" sub is
      // gone): 0.6.1c's outputs at its stars (GANTRY PRESS ★2 THIRD ARM feeds 3; = routeCheck.ts, validate.ts) and
      // its body, which leads with the headline and the NEXT line
      return {
        icon: itemIcon(d.id), title: starred(d.name, stars), color: RARITY_COLOR[d.rarity],
        sub: `FACTORY · BELTS ${routesOf(b, p.uid).length}/${outputsAt(d.id, stars) || 1}`,
        text: body(d, stars, [lvl, next], "DRAG OUT OF IT TO LAY BELT."),
        actions: sig ? [] : [{ id: "store", label: "TO CARGO", onTap: () => store(ctx, p.uid) }],
      };
    }
    case "route": {
      if (!b.routes[show.index]) return null;
      const info = routeInfo(b, show.index);
      // 0.6.2 BELTSIDE (V4): the tile-by-tile timeline in R7 order, then the turret-end readout, from one walk
      const w = walkRoute(b, show.index);
      const est = w.estimate;
      const hitCount = w.timeline.reduce((n, row) => n + row.hits.length, 0);
      const head: Line[] = [
        ...(info.connected ? [] : [["ENDS SHORT OF A TURRET INTAKE.", C.amber] as Line]),
        `${info.tiles} TILES · ${hitCount} HIT${hitCount === 1 ? "" : "S"}${hitCount ? " IN ORDER:" : ": NO RIG WORKS THIS BELT"}`,
      ];
      // beltside-062c (DESIGN §12 P8): slag keeps its fixed speed, so on its belt a speed hit reads (LOCKED), as on a
      // METRONOME belt: it changes nothing there, and nothing beat it
      const rows = w.timeline.map((row) => `T${row.tile + 1}: ${row.hits.map((h) => hitLabel(h, w.locked || w.fixed !== undefined)).join(" · ")}`);
      const dmg = `DMG ${est.dmg.toFixed(1)}${est.copies > 1 ? `X${est.copies}` : ""}`, spd = `${num(w.speedEnd)}X`, time = `${est.time.toFixed(1)}S`;
      const tag = (burn: string, shock: string) => [...(est.burn ? [`${burn}${est.burn}`] : []), ...(est.shock ? [shock] : [])];
      return {
        icon: beltIcon(), title: "BELT ROUTE", color: C.white, sub: info.connected ? `FEEDS TURRET ${info.turret + 1}` : "NOT CONNECTED",
        subTight: info.connected
          ? [[dmg, ...tag("BURN ", "SHOCK"), spd, time].join(" · "), [dmg, ...tag("B", "SHK"), spd, time].join(" · "), [dmg, time, ...tag("B", "SHK"), spd].join(" ")]
          : undefined,
        // the turret end, what a payload carries into the gun (DMG, BURN, SHOCK) and how it gets there (SPD,
        // TIME), always stays in sight: on a short panel the last timeline rows give way first
        text: [
          ...head, ...rows,
          [`AT THE GUN: DMG ${est.dmg.toFixed(1)}${est.copies > 1 ? ` X${est.copies}` : ""} · BURN ${est.burn} · ${est.shock ? "SHOCK" : "NO SHOCK"}`, C.yellow],
          [`SPD ${num(w.speedEnd)}X · TIME ${est.time.toFixed(1)}S TO THE GUN`, C.yellow],
        ],
        trim: { from: head.length, to: head.length + rows.length, more: (n) => [`+${n} MORE HIT TILE${n === 1 ? "" : "S"} (NUMBERED ON THE DECK)`, C.slate4] },
        actions: [{ id: "rmroute", label: "REMOVE BELT", danger: true, onTap: () => deleteRoute(ctx, show.index) }],
      };
    }
    case "turret": {
      const td = turretSlots(b)[show.index]?.td; // 0.6.2s: the installed turret (an empty slot has none)
      if (!td) return null;
      const gm = gearFor(b, show.index); // 0.6.1b: gear only; the core has its own socket (coreFor via resolveCore)
      const gear = gm ? ITEMS[gm.def] : null;
      let every = td.fireInterval, per = 1;
      if (gm) {
        const md = effectAt(gm.def, starsOf(gm)).mod; // 0.6.1a: the gear's spec at its stars
        if (md?.fireMul) every *= md.fireMul;
        if (md?.perShot) per = Math.max(per, md.perShot);
      }
      const tc = resolveCore(b, show.index, td); // 0.6.1b: bought core (k-scaled) or the signature core
      if (tc.bought) every *= tc.spec.intervalMul ?? tc.spec.reloadMul ?? 1; // ROTARY / SALVO's static cadence change
      const coreName = tc.bought ? starred(ITEMS[tc.def].name, tc.stars) : (SIGNATURE_CORES[tc.def]?.name ?? "SIGNATURE CORE");
      const shape = coreShape(tc);
      const actions: Action[] = [];
      if (tc.bought) actions.push({ id: "unfitcore", label: "REMOVE CORE", onTap: () => unfitCore(ctx, show.index) });
      if (gear) actions.push({ id: "unfit", label: "REMOVE GEAR", onTap: () => unfitMod(ctx, show.index) });
      // 0.6.1p: the window as the battle sees it (EXT. CHAMBER, HOPPER), and the GATLING clashes (the Prime's call):
      // a GATLING never holds a window, so HOPPER's seconds and FINISHER RAM do nothing there
      const tu = makeTurret(b, show.index, td);
      const plain = tu.window === td.window && tu.windowTime === WINDOW_TIME && !tu.noJam;
      const chamber = plain ? `CHAMBER ${td.window} SLUGS` : `CHAMBER ${tu.window} SLUGS · ${+tu.windowTime.toFixed(2)}S${tu.noJam ? " · NEVER JAMS" : ""}`;
      const gstars = gm ? starsOf(gm) : 1;
      const gearFx = gear ? starEffectLine(gear.id, gstars) : "";
      const clash: string[] = [];
      if (tc.routine === "gatling" && gear?.id === "hopper") clash.push(`GATLING: HOPPER'S +${effectAt("hopper", gstars).mod?.windowTime ?? 0}S DOES NOTHING`);
      if (tc.routine === "gatling" && gear?.id === "ram") clash.push("GATLING: NO WINDOW, SO NO FINISHER");
      return {
        icon: gear ? itemIcon(gear.id) : null, title: `${td.kind.toUpperCase()} TURRET ${show.index + 1}`, color: C.white,
        sub: `FED FROM COLUMN ${td.connectors.map((c) => c + 1).join("+")}`,
        text: [
          `${shape ? `${shape} · ` : ""}FIRES EVERY ${every.toFixed(2)}S${per > 1 ? ` · ${per} PER SHOT` : ""}`,
          chamber,
          `CORE: ${coreName}`, // 0.6.1b: ARSENAL.md §8.4, hidden REMOVE CORE for a signature core
          `GEAR: ${gear ? `${starred(gear.name, gstars)}${gearFx ? ` · ${gearFx}` : ""}` : "EMPTY HARDPOINT"}`,
          ...clash,
        ],
        actions,
      };
    }
    default:
      return null;
  }
}

/** 0.6.2: a panel's title (the 5x7 face, outlined) or sub line (3x5) within `max` px: a title that doesn't fit
 *  steps down to the 3x5 face, and whatever still doesn't fit is cut short with a dot. */
function fitHead(g: G, s: string, x: number, y: number, max: number, color: string, title: boolean): void {
  if (title && textWidth(s) <= max) {
    drawText(g, s, x, y, color, { outline: C.ink });
    return;
  }
  let t = s;
  while (t.length > 1 && textWidth(t, "3") > max) t = `${t.slice(0, -2).trimEnd()}.`;
  drawText(g, t, x, title ? y + 1 : y, color, title ? { font: "3", outline: C.ink } : { font: "3" });
}

/** True when a hovered card or a selection has details to show (otherwise the idle cards). */
export function hasDetails(ctx: Ctx, sel: Sel, hover: { wagon: number; slot: number } | null): boolean {
  const show: Sel = hover ? { kind: "offer", wagon: hover.wagon, slot: hover.slot } : sel;
  return spec(ctx, show, !!hover) !== null;
}

/**
 * 0.6.1r F7 (review-061; the Prime's layout call): in portrait the 1-2 action buttons never cover the panel's
 * title or sub-line. They keep the top-right row when it can hold them right of both texts (at the old even width,
 * else each sized to its label); otherwise they take one row directly under the sub-line (and the icon box), and
 * the body text moves down by that row (`shift`). Returns one rect per label, in action order (the last action
 * sits at the right edge, as before). Exported for tests.
 */
export function portraitButtons(title: string, sub: string, labels: string[], r: Rect): { rects: Rect[]; shift: number } {
  const n = labels.length, gap = 3, h = 13;
  const clear = r.x + 23 + Math.max(textWidth(title) + 2, textWidth(sub, "3")) + 3; // the title's outline, then a gap
  const even = Math.min(64, Math.floor((r.w - 10 - gap * (n - 1)) / n));
  const sized = labels.map((l) => Math.min(even, Math.max(24, textWidth(l, "3") + 10)));
  const place = (ws: number[], right: number, y: number): Rect[] => {
    const out: Rect[] = [];
    let x = right;
    for (let i = ws.length - 1; i >= 0; i--) {
      x -= ws[i];
      out[i] = { x, y, w: ws[i], h };
      x -= gap;
    }
    return out;
  };
  for (const ws of [labels.map(() => even), sized]) {
    const rects = place(ws, r.x + r.w - 4, r.y + 4);
    if (rects[0].x >= clear) return { rects, shift: 0 };
  }
  // the row: y+21..y+33, 1 px under the icon box (y+4..y+19) and 3 px under the sub-line (y+13..y+17). The body
  // text, which began at y+25, starts 3 px under the row (y+37): a 12 px shift keeps 4 lines of the 3x5 face in
  // the 69 px phone band (the turret case's CORE and GEAR lines both still show).
  const w = Math.floor((r.w - 10 - gap * (n - 1)) / n);
  return { rects: place(labels.map(() => w), r.x + r.w - 5, r.y + 21), shift: 12 };
}

/** beltside-062: the least portrait panel height that holds portraitButtons' row (y+21..y+33) inside its frame. */
const PORT_ROW_MIN_H = 36;

/**
 * beltside-062: BELTSIDE's portrait top row, for a strip too short for portraitButtons' second row (the header-only
 * 360x640 portrait, whose sub line carries a belt's compact readout): 1-2 buttons at the top right, one at the even
 * width, two each sized to its label; the title and sub line are cut short left of them (drawDetails, fitHead).
 */
function topRowButtons(labels: string[], r: Rect): Rect[] {
  const n = labels.length, gap = 3, h = 13;
  const even = Math.min(64, Math.floor((r.w - 10 - gap * (n - 1)) / n));
  const out: Rect[] = [];
  let x = r.x + r.w - 4;
  for (let i = n - 1; i >= 0; i--) {
    const w = n > 1 ? Math.min(even, Math.max(34, textWidth(labels[i], "3") + 10)) : even;
    x -= w;
    out[i] = { x, y: r.y + 4, w, h };
    x -= gap;
  }
  return out;
}

export function drawDetails(g: G, ctx: Ctx, sel: Sel, hover: { wagon: number; slot: number } | null, area: Rect, foe: DuskFoe): void {
  if (area.h < 14) return;
  const show: Sel = hover ? { kind: "offer", wagon: hover.wagon, slot: hover.slot } : sel;
  const sp = spec(ctx, show, !!hover);
  const column = area.h >= 70; // landscape column: size to content, button under the text
  if (!sp) return drawIdle(g, ctx.run, area, column, foe);
  const wrapW = area.w - 10;
  const acts = sp.actions ?? []; // 0.6.1b: 0-2 buttons (the turret case: REMOVE CORE, REMOVE GEAR)
  const labels = acts.map((a) => a.label);
  // 0.6.1r F7: the portrait buttons' place (the top row, or a row under the sub-line that moves the body down).
  // beltside-062: where the full sub line sends them to that row but BELTSIDE's short one (Spec.subShort, a rig's
  // "RIG · 2/3 HIT") lets them keep the top row, they keep it and the short sub line is drawn (the head, below), so
  // the body keeps its two lines. A strip too short to hold that row (the header-only 360x640 portrait) keeps
  // BELTSIDE's top row instead, and fitHead cuts the title and sub line short left of it.
  let port = !column && acts.length ? portraitButtons(sp.title, sp.sub, labels, area) : null;
  if (port?.shift && sp.subShort) {
    const short = portraitButtons(sp.title, sp.subShort, labels, area);
    if (!short.shift) port = short;
  }
  if (port?.shift && area.h < PORT_ROW_MIN_H) port = { rects: topRowButtons(labels, area), shift: 0 };
  // 0.6.1r (item 11): a sub-line wider than the desk column ("COMMON TURRET GEAR · QUARTERMASTER") breaks after its
  // last " · " onto a second line at y+19, and the column's body moves down 4 px (the portrait band fits one line)
  const cut = sp.sub.lastIndexOf(" · ");
  const subs = column && cut > 0 && textWidth(sp.sub, "3") > area.w - 27 ? [sp.sub.slice(0, cut + 2), sp.sub.slice(cut + 3)] : [sp.sub];
  const shift = (port?.shift ?? 0) + (subs.length > 1 ? 4 : 0);
  // the description in the 5x7 face when it fits the area (easier to read), else the 3x5 face; 0.6.2: a line
  // may carry its own colour (warnings, the belt's turret-end readout)
  const extra = acts.length ? acts.length * 19 + 3 : 4;
  let font: "5" | "3" = "5", lh = 9;
  const wrapAll = (f: "5" | "3"): [string, string][] => sp.text.flatMap((l) => {
    const [s, c] = typeof l === "string" ? [l, C.bone] : l;
    return wrap(s, wrapW, f).map((w): [string, string] => [w, c]);
  });
  let lines = wrapAll(font);
  if (column ? 27 + shift + lines.length * lh + extra > area.h : lines.length * lh - 2 > area.h - 29 - shift) {
    font = "3";
    lh = 7;
    lines = wrapAll(font);
  }
  const r = column ? { ...area, h: Math.min(area.h, 27 + shift + lines.length * lh + extra) } : area;
  panel(g, r, "dark");
  ctx.game.ui.add({ id: "details", r, block: true });
  rect(g, r.x + 4, r.y + 4, 16, 16, C.ink);
  rect(g, r.x + 5, r.y + 5, 14, 14, C.slate0);
  if (sp.icon) g.drawImage(sp.icon, r.x + 12 - Math.floor(sp.icon.width / 2), r.y + 12 - Math.floor(sp.icon.height / 2));
  // beltside-062: the title and sub line (0.6.1r's subs included) are drawn after the buttons, once headRight is known
  let maxY = r.y + r.h - 4;
  let headRight = r.x + r.w - 4; // 0.6.2: the title and sub line end left of this (the portrait strip's buttons)
  if (acts.length && column) {
    // landscape column: one full-width button per action, stacked bottom-up under the text
    let by = r.y + r.h - 5;
    for (let i = acts.length - 1; i >= 0; i--) {
      by -= 16;
      const a = acts[i];
      button(ctx.game.ui, g, a.id, { x: r.x + 5, y: by, w: r.w - 10, h: 16 }, a.label, { font: "3", primary: a.primary, danger: a.danger, disabled: a.disabled, onTap: a.onTap });
      by -= 3;
    }
    maxY = by;
  } else if (port) {
    // portrait strip: 1-2 buttons where portraitButtons put them (never over the title or the sub-line); on the
    // top row the title and sub line end left of them (0.6.2 headRight)
    const rects = port.rects;
    acts.forEach((a, i) => button(ctx.game.ui, g, a.id, rects[i], a.label, { font: "3", primary: a.primary, danger: a.danger, disabled: a.disabled, onTap: a.onTap }));
    if (!port.shift) headRight = rects[0].x - 3;
  }
  let y = r.y + 25 + shift; // 0.6.1r: the body under F7's button row or the desk's two-line sub
  const fit = Math.max(0, Math.floor((maxY - y + 2) / lh)); // lines with y + lh - 2 <= maxY
  const subMax = headRight - (r.x + 23);
  fitHead(g, sp.title, r.x + 23, r.y + 4, subMax, sp.color, true);
  // 0.6.2 BELTSIDE: a header-only panel shows `subTight` (in yellow, like the readout it stands for) instead, and a
  // sub line too wide beside the portrait buttons shows `subShort`; beltside-062: 0.6.1r's desk break (item 11) too
  const tight = fit === 0 && !!sp.subTight?.length ? sp.subTight : null;
  const subColor = sp.subColor ?? C.slate4;
  if (tight) {
    fitHead(g, tight.find((s) => textWidth(s, "3") <= subMax) ?? tight[tight.length - 1], r.x + 23, r.y + 13, subMax, C.yellow, false);
  } else if (subs.length > 1) {
    subs.forEach((s, i) => fitHead(g, s, r.x + 23, r.y + 13 + i * 6, subMax, subColor, false));
  } else {
    fitHead(g, sp.subShort && textWidth(sp.sub, "3") > subMax ? sp.subShort : sp.sub, r.x + 23, r.y + 13, subMax, subColor, false);
  }
  if (sp.trim && lines.length > fit) {
    // 0.6.2 BELTSIDE: drop trimmable entries from the end of their range (and say how many) until it fits
    const { from, to, more } = sp.trim;
    for (let n = 1; n <= to - from; n++) {
      lines = [...sp.text.slice(0, to - n), more(n), ...sp.text.slice(to)].flatMap((l) => {
        const [s, c] = typeof l === "string" ? [l, C.bone] : l;
        return wrap(s, wrapW, font).map((w): [string, string] => [w, c]);
      });
      if (lines.length <= fit) break;
    }
  }
  for (const [ln, col] of lines) {
    if (y + lh - 2 > maxY) break;
    drawText(g, ln, r.x + 5, y, col, { font });
    y += lh;
  }
}

function drawIdle(g: G, run: Run, area: Rect, column: boolean, foe: DuskFoe): void {
  const h = HEROES[run.hero];
  const b = run.build;
  const used = beltUsed(b), cap = b.beltCap;
  if (!column && area.h < 30) {
    panel(g, area, "dark");
    drawText(g, "NEXT", area.x + 5, area.y + 5, C.slate4, { font: "3" });
    drawText(g, foe.name, area.x + 24, area.y + 4, C.red, { outline: C.ink });
    drawText(g, `${foeClass(foe)} · BELT ${used}/${cap} · W-L ${record(run)}`, area.x + 5, area.y + 14, C.bone, { font: "3" });
    return;
  }
  if (!column) return drawHeroStrip(g, run, area);
  // landscape column: the stats in the 5x7 face when they fit (RUN split into RUN and LIVES)
  const big: [string, string, string][] = [
    ["HULL", String(h.hull + b.hullBonus), C.white],
    ["BELT", `${used}/${cap} TILES`, used >= cap ? C.amber : C.white],
    ["FEEDS", `${connectedRouteCount(b)}/${intakeCount(b)} INTAKES`, connectedRouteCount(b) ? C.lime : C.red],
    ["RUN", `W-L ${record(run)}`, C.white],
    ["LIVES", `${run.lives}/${START_LIVES}`, C.white],
  ];
  const kw = textWidth("FEEDS") + 6;
  if (big.every(([, v]) => 10 + kw + textWidth(v) <= area.w) && 31 + big.length * 10 <= area.h) {
    const r = { ...area, h: 31 + big.length * 10 };
    panel(g, r, "dark");
    drawText(g, h.name, r.x + 5, r.y + 5, C.white, { outline: C.ink });
    drawText(g, h.factionName, r.x + r.w - 5, r.y + 6, C.slate4, { font: "3", align: "right" });
    drawText(g, `PLAYSTYLE: ${h.pattern}`, r.x + 5, r.y + 16, C.yellow, { font: "3" });
    let y = r.y + 27;
    for (const [k, v, c] of big) {
      drawText(g, k, r.x + 5, y, C.slate4);
      drawText(g, v, r.x + 5 + kw, y, c);
      y += 10;
    }
    return;
  }
  const rows: [string, string, string][] = [
    ["HULL", String(h.hull + b.hullBonus), C.white],
    ["BELT", `${used}/${cap} TILES`, used >= cap ? C.amber : C.white],
    ["FEEDS", `${connectedRouteCount(b)}/${intakeCount(b)} INTAKES`, connectedRouteCount(b) ? C.lime : C.red],
    ["RUN", `W-L ${record(run)} · ${run.lives}/${START_LIVES} LIVES`, C.white],
  ];
  const r = column ? { ...area, h: Math.min(area.h, 29 + rows.length * 8) } : area;
  panel(g, r, "dark");
  let y = r.y + 5;
  drawText(g, h.name, r.x + 5, y, C.white, { outline: C.ink });
  drawText(g, h.factionName, r.x + r.w - 5, y + 1, C.slate4, { font: "3", align: "right" });
  y += 11;
  drawText(g, `PLAYSTYLE: ${h.pattern}`, r.x + 5, y, C.yellow, { font: "3" });
  y += 9;
  for (const [k, v, c] of rows) {
    if (y + 7 > r.y + r.h - 2) break;
    drawText(g, k, r.x + 5, y, C.slate4, { font: "3" });
    drawText(g, v, r.x + 34, y, c, { font: "3" });
    y += 8;
  }
}

/** Portrait hero card (strip): name and faction, playstyle, then HULL · BELT · FEEDS and RUN rows. */
function drawHeroStrip(g: G, run: Run, r: Rect): void {
  const h = HEROES[run.hero];
  const b = run.build;
  const used = beltUsed(b), cap = b.beltCap;
  const feeds = connectedRouteCount(b), intakes = intakeCount(b);
  panel(g, r, "dark");
  let y = r.y + 5;
  drawText(g, h.name, r.x + 5, y, C.white, { outline: C.ink });
  drawText(g, h.factionName, r.x + r.w - 5, y + 1, C.slate4, { font: "3", align: "right" });
  y += 11;
  drawText(g, `PLAYSTYLE: ${h.pattern}`, r.x + 5, y, C.yellow, { font: "3" });
  y += 9;
  const stats: [string, string, string][] = [
    ["HULL", String(h.hull + b.hullBonus), C.white],
    ["BELT", `${used}/${cap}`, used >= cap ? C.amber : C.white],
    ["FEEDS", `${feeds}/${intakes}`, feeds ? C.lime : C.red],
  ];
  let x = r.x + 5;
  for (const [k, v, c] of stats) {
    x += drawText(g, k, x, y, C.slate4, { font: "3" }) + 3;
    x += drawText(g, v, x, y, c, { font: "3" }) + 8;
  }
  y += 8;
  if (y + 5 <= r.y + r.h - 3) {
    const x2 = r.x + 5 + drawText(g, "RUN", r.x + 5, y, C.slate4, { font: "3" }) + 3;
    drawText(g, `W-L ${record(run)} · ${run.lives}/${START_LIVES} LIVES`, x2, y, C.white, { font: "3" });
  }
}

/** The opponent's hero and hull (a ghost's hull includes its own plating). */
function foeClass(foe: DuskFoe): string {
  const h = HEROES[foe.hero];
  return `${h.name} · HULL ${h.hull + foe.build.hullBonus}`;
}

/** Next-battle card (tonight's dusk opponent): beside FIGHT in landscape (3 rows); a 2-row strip
 *  in portrait. A pool ghost reads "GHOST · <HERO> · <W>-<L>", a stand-in its warlord name. */
export function drawFoe(g: G, foe: DuskFoe, r: Rect): void {
  panel(g, r, "dark");
  const head = foe.kind === "ghost" ? "NEXT BATTLE · DUSK GHOST" : "NEXT BATTLE · DUSK";
  // 0.6.0b: a stand-in is a rival captain: its portrait, its name and a STAND-IN tag
  const rival = foe.kind === "standin" ? foe.rival : undefined;
  const ps = r.h >= 32 ? 24 : 16;
  if (rival) drawPortrait(g, rival, r.x + 5, r.y + Math.round((r.h - ps) / 2), ps);
  const x0 = rival ? r.x + 5 + ps + 5 : r.x + 5;
  drawText(g, r.h < 32 ? "NEXT BATTLE" : head, x0, r.y + 5, C.slate4, { font: "3" });
  if (r.h < 32) {
    drawText(g, foeClass(foe), r.x + r.w - 5, r.y + 5, C.bone, { font: "3", align: "right" });
    const nw = drawText(g, foe.name, x0, r.y + 13, C.red, { outline: C.ink });
    if (rival) tag(g, "STAND-IN", x0 + nw + 4, r.y + 14, C.slate3);
    return;
  }
  const nw = drawText(g, foe.name, x0, r.y + 13, C.red, { outline: C.ink });
  if (rival) tag(g, "STAND-IN", x0 + nw + 4, r.y + 14, C.slate3);
  drawText(g, foeClass(foe), x0, r.y + 24, C.bone, { font: "3" });
}
