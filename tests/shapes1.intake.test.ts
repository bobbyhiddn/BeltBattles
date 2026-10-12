// SHAPES-1 S5b (REQ-BFG-086; cap's ruling, oracle 7f2a91a61910e167): a turret change that puts a turret's row-0 intake
// under a SHAPED piece sends that piece to cargo (the to-cargo path: same uid, stars ride along); a turret always goes in;
// a 1-cell rig on the new intake stays (S5's ruling, point 2); the toast is `NAIL STRIP WENT TO CARGO · TURRET INTAKE`
// (two or more: `2 PARTS WENT TO CARGO · TURRET INTAKE`). With SHAPES off the sweep does nothing.
import { afterEach, describe, expect, it } from "vitest";
import { newRun, installFromCargo, intakeToast, moveInstalled, sweepIntakes, type Run } from "../src/game/run";
import { canPlaceItem, cloneBuild, isIntakeCell, itemByUid, key as K, moveTurret, turretSlots } from "../src/sim/deck";
import { SHAPES, setShapes, withShapes } from "../src/sim/shapes";
import { ITEMS } from "../src/sim/content";
import { effectAt } from "../src/sim/stars";
import { validateBuild, validateUpload } from "../src/net/validate";
import { casualRun } from "../src/sim/harness/casual";
import { installAt } from "../src/screens/build/turretActions";
import type { Ctx } from "../src/screens/build/actions";

afterEach(() => setShapes(SHAPES)); // SHAPES-1 flip: the shipped value (on)

// RUN3-SHAPES1 section 5 (run 4): can a turret's fuse (star-up) or a swap make a new intake cell? A slot's intake columns
// are deck.ts turretDefIn's slotIntakes(slot, effectAt(def, stars).turret.intake); a fuse (fuse.ts setStars) changes only
// an installed turret's stars, and no turret's star row changes its intake (they change its speed), so a star-up keeps
// its intake cells; a swap between slots is moveInstalled, which runs the sweep. So neither needs the sweep; this pins it.
describe("SHAPES-1 S5b: a turret's star-up never makes a new intake cell", () => {
  it("every turret's intake is the same at ★1, ★2 and ★3", () => {
    const turrets = Object.values(ITEMS).filter((d) => d.kind === "turret");
    expect(turrets.length).toBeGreaterThan(10);
    for (const d of turrets) {
      const i1 = effectAt(d.id, 1).turret!.intake;
      for (const s of [2, 3]) expect(effectAt(d.id, s).turret!.intake, `${d.id} ★${s}`).toBe(i1);
    }
  });
});

/** WEAVER's start (slot 3 empty) with a NAIL STRIP (★2) standing up at (7,0)-(7,1) and a RAMPART in cargo. */
function weaver(rig = "nailstrip"): Run {
  const run = newRun("weaver", 2, "shapes1-intake");
  run.build.items.push({ uid: 500, def: rig, x: 7, y: 0, rot: 1, stars: 2 });
  run.inventory = [{ uid: 900, def: "rampart" }];
  return run;
}
const placementErrors = (run: Run) => validateBuild(run.build, 6, "strict").errors.filter((e) => /placement|TURRET INTAKE/.test(e));

describe("SHAPES-1 S5b: the intake sweep", () => {
  it("a RAMPART into WEAVER's empty slot 3 sends the NAIL STRIP on its new intake to cargo, same uid and stars", () => {
    withShapes(() => {
      const run = weaver();
      expect(turretSlots(run.build)[3].turret).toBeFalsy();
      expect(isIntakeCell(run.build, K(7, 0))).toBe(false); // legal when it was placed
      const r = installFromCargo(run, 900, 3);
      expect(r.ok).toBe(true);
      expect(isIntakeCell(run.build, K(7, 0))).toBe(true);
      expect(r.swept).toEqual(["NAIL STRIP"]);
      expect(itemByUid(run.build, 500)).toBeUndefined();
      expect(run.inventory).toContainEqual({ uid: 500, def: "nailstrip", stars: 2 });
      expect(turretSlots(run.build)[3].turret?.def).toBe("rampart"); // a turret always goes in
      expect(placementErrors(run)).toEqual([]);
      expect(validateUpload(run.build, 6).errors.filter((e) => /TURRET INTAKE/.test(e))).toEqual([]);
      expect(intakeToast(r.swept!)).toBe("NAIL STRIP WENT TO CARGO · TURRET INTAKE");
    });
  });

  it("the toast's words: one piece by name, two or more counted, none: no toast", () => {
    expect(intakeToast(["NAIL STRIP"])).toBe("NAIL STRIP WENT TO CARGO · TURRET INTAKE");
    expect(intakeToast(["NAIL STRIP", "SPIKE RAIL"])).toBe("2 PARTS WENT TO CARGO · TURRET INTAKE");
    expect(intakeToast([])).toBeNull();
  });

  it("a move or swap into a slot whose intake holds a shaped piece does the same", () => {
    withShapes(() => {
      const run = newRun("weaver", 2, "shapes1-intake");
      // a row-0 cell that is not an intake now and becomes one when slot 0's turret moves to slot 3
      const after = cloneBuild(run.build);
      moveTurret(after, 0, 3);
      const x = [...Array(10).keys()].find((c) => !isIntakeCell(run.build, K(c, 0)) && isIntakeCell(after, K(c, 0)) && canPlaceItem(run.build, "nailstrip", c, 0, -1, 1).ok);
      expect(x).toBeDefined();
      run.build.items.push({ uid: 501, def: "nailstrip", x: x!, y: 0, rot: 1 });
      const r = moveInstalled(run, 0, 3);
      expect(r.ok && r.swept).toEqual(["NAIL STRIP"]);
      expect(run.inventory.some((i) => i.uid === 501)).toBe(true);
      expect(placementErrors(run)).toEqual([]);
    });
  });

  it("a 1-cell rig on the new intake stays; with SHAPES off the sweep does nothing", () => {
    withShapes(() => {
      const run = weaver("whetstone");
      const r = installFromCargo(run, 900, 3);
      expect(r.ok && r.swept).toBeUndefined();
      expect(itemByUid(run.build, 500)).toBeDefined();
    });
    const off = weaver("whetstone");
    expect(sweepIntakes(off)).toEqual([]);
  });

  it("the build screen's install shows the sweep's toast (yellow, as CUT LOOSE)", () => {
    withShapes(() => {
      const run = weaver();
      const toasts: string[] = [];
      const noop = () => undefined;
      const ctx = {
        run, game: { audio: { play: noop }, toast: (m: string) => toasts.push(m), error: noop },
        L: {}, wfx: {}, ufx: {}, select: noop, turretAt: () => -1, coinPos: () => ({ x: 0, y: 0 }), touched: noop, placed: noop,
        invalid: (m: string) => toasts.push(`invalid:${m}`),
      } as unknown as Ctx;
      expect(installAt(ctx, 900, 3, 0, 0)).toBe(true);
      expect(toasts).toContain("NAIL STRIP WENT TO CARGO · TURRET INTAKE");
    });
  });

  it("casual WEAVER seed 2 (the case found): every deck stays legal (the bot scores installs through the same sweep)", () => {
    withShapes(() => {
      const days = casualRun("weaver", 10, 2);
      // before the sweep this run put RAMPART into slot 3 on day 6, over its NAIL STRIP at (7,0); scoring its installs
      // through installFromCargo (and so the sweep) it now keeps the NAIL STRIP and takes a HAILGUN there on day 9.
      // SHAPES-1 (RUN5-SHAPES1 3, cap's ruling 1.1): EMBER TROUGH 4 -> 5 G moves this casual run's buys, so slot 3 now takes a
      // RAMPART on day 10 (was HAILGUN on days 9-10; measured, run 6); every day still validates with no TURRET INTAKE error
      expect(days.map((d) => turretSlots(d.build)[3]?.turret?.def ?? "-").join(" ")).toBe("- - - - - - - - - rampart");
      for (const d of days) {
        expect(validateBuild(d.build, d.day, "strict").errors.filter((e) => /TURRET INTAKE/.test(e)), `day ${d.day}`).toEqual([]);
        expect(validateUpload(d.build, d.day).errors.filter((e) => /TURRET INTAKE/.test(e)), `day ${d.day}`).toEqual([]);
      }
    });
  }, 300_000);
});
