// TXT-095 (i) (REQ-BFG-070, REQ-BFG-046; BeltBattles 0.9.5, display only; ACCEPT-093 7 (b)): SALVO RACK's ⓘ SHOT tap
// (glossary.ts TAP_NOTES.salvo) says the 3 s fallback its card line and 0.9.3's notes say: "SHOT: FIRES AT A FULL CHAMBER OR
// 3{SEC} AFTER ITS FIRST LOAD. NEXT RELOAD: 60% LONGER." (option A, chosen by the Prime, oracle eca9983506b0133c: the brief's
// long and short forms each take 3 lines of 5x7 at the op band). Its seconds are pinned here to the sim's own salvo rule,
// read off the sim (cores.ts ROUTINES.salvo.ready on the gun battle.ts makeTurret builds), never off SIM (abilityText.ts),
// so a change to the rule (2 x windowTime), to WINDOW_TIME or to a gun's, core's or gear's windowTime turns this red.
import { describe, expect, it } from "vitest";
import { newRun, type Run } from "../src/game/run";
import { buyableModules, classFactor } from "../src/sim/content";
import { setTurretList, turretSlots } from "../src/sim/deck";
import { makeTurret, type TurretState } from "../src/sim/battle";
import { ROUTINES } from "../src/sim/cores";
import { effectAt } from "../src/sim/stars";
import { C } from "../src/render/palette";
import { icons, textWidth } from "../src/render/font";
import { colourize, wrapRich } from "../src/ui/richText";
import { fmtPct, fmtSec } from "../src/ui/statFormat";
import { GLOSSARY_WRAP_W, glossaryText } from "../src/ui/glossary";
import { abilityText } from "../src/ui/abilityText";

const STARS = [1, 2, 3];
/** A FURNACE with gun `def` (★ts) in slot 0, a SALVO RACK (★cs) as its core and `gear` in its hardpoints
 *  (tests/abilityPanels.test.ts's turretRun). */
function salvoRun(def: string, ts: number, cs: number, gear: [string, number][] = []): Run {
  const run = newRun("furnace", 5, "txt095");
  setTurretList(run.build, [{ slot: 0, def, uid: 700, ...(ts > 1 ? { stars: ts } : {}) }]);
  gear.forEach(([g, s], i) => run.build.mods.push({ uid: 710 + i, def: g, turret: 0, ...(s > 1 ? { stars: s } : {}) } as Run["build"]["mods"][number]));
  run.build.mods.push({ uid: 730, def: "salvo", turret: 0, ...(cs > 1 ? { stars: cs } : {}) } as Run["build"]["mods"][number]);
  return run;
}
/** The sim's wait: the least time after its first load at which the battle's SALVO gun, one load in its chamber, fires
 *  (ROUTINES.salvo.ready, bisected to 1e-9 s; never read from SIM). */
function simWait(tu: TurretState): number {
  const load = {} as TurretState["stack"][number];
  const ready = (t: number) => ROUTINES[tu.core.routine].ready({ ...tu, stack: [load], loadTimer: t, fireCd: 0 });
  expect([tu.window > 1, ready(0), ready(60)]).toEqual([true, false, true]); // one load never fills it; it fires in the end
  let lo = 0, hi = 60;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (ready(mid)) hi = mid; else lo = mid; }
  return Math.round(hi * 1e6) / 1e6;
}
/** The 4 guns tests/abilityPanels.test.ts sweeps (a heavy and a light ★1, THUNDERER ★3, HAIL GUN ★3: the most gear). */
const GUNS: [string, number][] = [["scrapcannon", 1], ["dartgun", 1], ["thunderer", 3], ["hailgun", 3]];
const GEAR = buyableModules().filter((d) => d.kind === "mod").map((d) => d.id);

describe("TXT-095 (i): SALVO RACK's SHOT tap says the sim's wait (REQ-BFG-070, REQ-BFG-046)", () => {
  it("the tap's seconds are the sim's: ROUTINES.salvo.ready on makeTurret's gun, every gun, ★, class factor and piece of gear", () => {
    let n = 0;
    const waits = new Set<number>();
    for (const [gun, ts] of GUNS) for (const cs of STARS) for (const gear of [[], ...GEAR.flatMap((g) => STARS.map((s) => [[g, s]]))] as [string, number][][]) {
      const run = salvoRun(gun, ts, cs, gear);
      const tu = makeTurret(run.build, 0, turretSlots(run.build)[0].td!);
      const id = `${gun} ★${ts}, SALVO ★${cs}${gear.length ? `, ${gear[0][0]} ★${gear[0][1]}` : ""}`;
      expect(tu.core.routine, id).toBe("salvo");
      const wait = simWait(tu), k = classFactor(tu.def);
      waits.add(wait);
      // what the tap says, on this run's gun (the k it is drawn with), read back as a number
      const tap = glossaryText("SHOT", { def: "salvo", stars: cs, o: { k } })!;
      const said = /FULL CHAMBER OR (\d+(?:\.\d+)?)\{SEC\} AFTER ITS FIRST LOAD\./.exec(tap);
      expect(said, `${id}: ${tap}`).not.toBeNull();
      expect(Number(said![1]), id).toBe(wait);
      expect(said![1], id).toBe(fmtSec(wait));
      // and the reload, the sim's own reloadMul (cores.ts salvoReload reads tu.core.spec.reloadMul)
      expect(tap, id).toContain(`NEXT RELOAD: ${fmtPct(tu.core.spec.reloadMul! - 1)} LONGER.`);
      n++;
    }
    // one wait on every gun (the tap says one number): 3 s at 0.9.4's rule (2 x WINDOW_TIME 1.5); the sweep's size
    expect([...waits]).toEqual([3]);
    expect(n).toBe(GUNS.length * STARS.length * (1 + GEAR.length * STARS.length));
  });

  it("the tap, word for word (option A), at every star and class factor; 2 lines of 5x7 at the op band; the card line unchanged", () => {
    for (const s of STARS) for (const k of [1, 0.8, 0.75, 0.55, 0.4]) {
      const mul = effectAt("salvo", s).core!.reloadMul!;
      const tap = glossaryText("SHOT", { def: "salvo", stars: s, o: { k } })!;
      expect(tap).toBe(`SHOT: FIRES AT A FULL CHAMBER OR 3{SEC} AFTER ITS FIRST LOAD. NEXT RELOAD: ${fmtPct(mul - 1)} LONGER.`);
      const lines = wrapRich(colourize(icons(tap), C.bone), GLOSSARY_WRAP_W, "5");
      expect(lines.length, `★${s} k${k}`).toBe(2);
      for (const l of lines) expect(textWidth(l.map((sp) => sp.t).join(""), "5")).toBeLessThanOrEqual(GLOSSARY_WRAP_W);
      // the card line (abilityText.ts salvo's second sentence) keeps its exact 0.9.4 text
      expect(abilityText("salvo", s, { k }).sentences[1]).toBe("IT WAITS FOR A FULL CHAMBER, OR 3 SECONDS AFTER ITS FIRST LOAD.");
    }
    expect(glossaryText("SHOT", { def: "salvo", stars: 1 })).toBe("SHOT: FIRES AT A FULL CHAMBER OR 3{SEC} AFTER ITS FIRST LOAD. NEXT RELOAD: 60% LONGER.");
  });
});
