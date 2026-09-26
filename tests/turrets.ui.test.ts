// 0.6.2s (REQ-BFG-031 S5, S10): the build screen's turret commands and texts, without a canvas. dropTurret and
// friends (screens/build/turretActions.ts) run on a real run through a fake screen context: install from cargo, swap,
// move, store, sell, the free starting turret that can't be sold, and the dead end a swap can leave. The turret
// card's facts and an installed turret's sockets (screens/build/turretPanel.ts) are plain sentences (REQ-BFG-032).
import { describe, expect, it } from "vitest";
import { newRun, type Run } from "../src/game/run";
import { ITEMS } from "../src/sim/content";
import { key as K, setTurretList, turretSlots } from "../src/sim/deck";
import type { Carry, Ctx } from "../src/screens/build/actions";
import type { Sel } from "../src/screens/build/layout";
import { deadEndsAfter, dropTurret, sellTurretAt } from "../src/screens/build/turretActions";
import { deadEndLines, slotNotes, socketLines, turretFacts } from "../src/screens/build/turretPanel";

const CARGO = { x: 100, y: 100, w: 100, h: 20 };
const HULL = { x: 0, y: 0, w: 60, h: 60 };

/** A fake build screen: turret slot i sits at x = 10 i + 5 (y 5); the cargo tray at x 100-200. */
function fakeCtx(run: Run) {
  const log = { toasts: [] as string[], errors: [] as string[], sel: { kind: "none" } as Sel };
  const ctx = {
    game: { toast: (t: string) => log.toasts.push(t), error: (t: string) => log.errors.push(t), audio: { play: () => {} } },
    run,
    L: { cargo: CARGO, hull: HULL, portrait: false },
    wfx: {}, ufx: { popup: () => {} },
    select: (s: Sel) => { log.sel = s; },
    turretAt: (x: number, y: number) => (y >= 0 && y < 10 && x >= 0 && x < 60 && x % 10 < 10 ? Math.floor(x / 10) : -1),
    coinPos: () => ({ x: 0, y: 0 }),
    touched: () => {},
    placed: () => {},
    invalid: (m: string) => log.errors.push(m),
  } as unknown as Ctx;
  return { ctx, log };
}
const at = (slot: number) => ({ x: slot * 10 + 5, y: 5 });
const cargoCarry = (run: Run, uid: number): Carry => ({ src: { from: "cargo", uid }, def: run.inventory.find((i) => i.uid === uid)!.def, uid });
const mountCarry = (run: Run, slot: number): Carry => {
  const t = turretSlots(run.build)[slot].turret!;
  return { src: { from: "mount", index: slot }, def: t.def, uid: t.uid };
};
const defs = (run: Run) => turretSlots(run.build).map((s) => s.turret?.def ?? "-");

describe("0.6.2s build screen: turret commands (S5)", () => {
  it("install from cargo into the empty slot, swap, move between slots, store to cargo, sell", () => {
    const run = newRun("furnace", 11, "ui");
    const { ctx, log } = fakeCtx(run);
    run.inventory.push({ uid: 500, def: "bombard" }, { uid: 501, def: "hailgun" });
    expect(defs(run)).toEqual(["scrapcannon", "-"]);
    // install: BOMBARD onto the empty extra slot 1
    expect(dropTurret(ctx, cargoCarry(run, 500), at(1).x, at(1).y)).toBe(true);
    expect(defs(run)).toEqual(["scrapcannon", "bombard"]);
    expect(log.sel).toEqual({ kind: "turret", index: 1 });
    // swap: HAIL GUN onto slot 1; the BOMBARD goes to cargo
    expect(dropTurret(ctx, cargoCarry(run, 501), at(1).x, at(1).y)).toBe(true);
    expect(defs(run)).toEqual(["scrapcannon", "hailgun"]);
    expect(run.inventory.map((i) => i.def)).toEqual(["bombard"]);
    expect(log.toasts.pop()).toBe("BOMBARD WENT TO CARGO");
    // move: the HAIL GUN from slot 1 onto slot 0 swaps it with the starting SCRAP CANNON
    expect(dropTurret(ctx, mountCarry(run, 1), at(0).x, at(0).y)).toBe(true);
    expect(defs(run)).toEqual(["hailgun", "scrapcannon"]);
    // store: the SCRAP CANNON onto the cargo tray (it keeps its free flag)
    expect(dropTurret(ctx, mountCarry(run, 1), 150, 110)).toBe(true);
    expect(defs(run)).toEqual(["hailgun", "-"]);
    expect(run.inventory.find((i) => i.def === "scrapcannon")).toMatchObject({ free: true });
    // sell the bought HAIL GUN from its slot: epic 10, sell value max(1, floor(10 / 2)) = 5
    const gold = run.gold;
    expect(sellTurretAt(ctx, 0)).toBe(true);
    expect(run.gold - gold).toBe(5);
    expect(defs(run)).toEqual(["-", "-"]);
    // the free 1-star starting turret goes back in, and can't be sold (S7)
    const sc = run.inventory.find((i) => i.def === "scrapcannon")!;
    expect(dropTurret(ctx, cargoCarry(run, sc.uid), at(0).x, at(0).y)).toBe(true);
    expect(sellTurretAt(ctx, 0)).toBe(false);
    expect(log.errors.pop()).toBe("A STARTING TURRET AT 1 STAR CAN'T BE SOLD");
    expect(run.build.turrets).toBeUndefined(); // back to the starting layout: serializes as before (S8)
  });

  it("a drop off every slot and off cargo is refused over the hull, ignored elsewhere", () => {
    const run = newRun("weaver", 3, "ui");
    const { ctx, log } = fakeCtx(run);
    run.inventory.push({ uid: 600, def: "deckgun" });
    expect(dropTurret(ctx, cargoCarry(run, 600), 30, 40)).toBe(false); // over the hull, no slot
    expect(log.errors.pop()).toBe("DROP A TURRET ON A TURRET SLOT");
    expect(dropTurret(ctx, cargoCarry(run, 600), 300, 300)).toBe(false); // nowhere
    expect(log.errors.length).toBe(0);
    expect(run.inventory.map((i) => i.def)).toEqual(["deckgun"]);
  });

  it("a swap that leaves a belt on a column the new turret doesn't take names the belt, the column and why", () => {
    const run = newRun("furnace", 5, "ui");
    const { ctx, log } = fakeCtx(run);
    const b = run.build;
    b.items.push({ uid: 700, def: "press", x: 8, y: 6 });
    b.routes.push({ factory: 700, cells: [5, 4, 3, 2, 1, 0].map((y) => K(9, y)) });
    setTurretList(b, [{ slot: 0, def: "scrapcannon", uid: 90, free: true }, { slot: 1, def: "bombard", uid: 701 }]);
    expect(deadEndsAfter(ctx, [0, 1])).toEqual([]);
    run.inventory.push({ uid: 702, def: "hailgun" }); // inner: column 9 (0-based 8) only
    expect(dropTurret(ctx, cargoCarry(run, 702), at(1).x, at(1).y)).toBe(true);
    expect(deadEndsAfter(ctx, [1])).toEqual([1]);
    expect(log.toasts.pop()).toBe("BELT 2 IS A DEAD END NOW");
    expect(deadEndLines(b, 1)).toEqual([["BELT 2 IS A DEAD END: THIS TURRET TAKES NO BELT ON COLUMN 10. RE-ROUTE IT TO FIGHT.", expect.any(String)]]);
    // the slot emptied: an empty slot takes no belts either
    expect(dropTurret(ctx, mountCarry(run, 1), 150, 110)).toBe(true);
    expect(deadEndLines(b, 1)[0][0]).toBe("BELT 2 IS A DEAD END: AN EMPTY SLOT TAKES NO BELT ON COLUMN 10. RE-ROUTE IT TO FIGHT.");
  });
});

describe("0.6.2s build screen: turret texts (S10, REQ-BFG-032)", () => {
  it("a turret card: fire rate and loads, gear slots, reason, intake, the next star", () => {
    expect(turretFacts("bombard", 1)).toEqual([
      "FIRES EVERY 1 S AND HOLDS 4 LOADS.",
      "2 GEAR SLOTS AND 1 CORE SOCKET.",
      "A HEAVY GUN THAT HOLDS 4 LOADS.",
      "IT TAKES BELTS ON BOTH ITS COLUMNS.",
      "NEXT ★2: IT FIRES EVERY 0.9 S AND HAS 3 GEAR SLOTS. MERGE TWO ★1 COPIES TO GET IT.",
    ]);
    expect(turretFacts("dartgun", 2)[0]).toBe("FIRES EVERY 0.495 S AND HOLDS 2 LOADS.");
    expect(turretFacts("dartgun", 2)).toContain("NEXT ★3: IT FIRES EVERY 0.44 S AND HAS 3 GEAR SLOTS. MERGE TWO ★2 COPIES TO GET IT.");
    expect(turretFacts("thunderer", 3)).toEqual([
      "FIRES EVERY 0.64 S AND HOLDS 4 LOADS.", "6 GEAR SLOTS AND 1 CORE SOCKET.", expect.any(String), "IT TAKES BELTS ON BOTH ITS COLUMNS.",
    ]);
    expect(turretFacts("spikegun", 1)).toContain("IT TAKES A BELT ON ITS INNER COLUMN ONLY.");
    // plain sentences: no dot chains, every line ends with a full stop
    for (const d of Object.values(ITEMS).filter((x) => x.kind === "turret")) for (const s of [1, 2, 3]) {
      for (const ln of turretFacts(d.id, s)) {
        expect(ln, `${d.id} ★${s}`).not.toContain("·");
        expect(ln.endsWith("."), `${d.id} ★${s}: ${ln}`).toBe(true);
      }
    }
  });

  it("an installed turret's core socket and every gear slot, filled or empty (desktop one per line, phone one line)", () => {
    const run = newRun("furnace", 9, "ui");
    const b = run.build;
    setTurretList(b, [{ slot: 0, def: "scrapcannon", uid: 90, free: true }, { slot: 1, def: "siegegun", uid: 800 }]);
    b.mods.push({ uid: 801, def: "chamber", turret: 1, stars: 2 });
    const fx = (d: string, s: number) => `${d.toUpperCase()} AT ${s}`;
    expect(socketLines(b, 1, "KILN BREECH", fx)).toEqual([
      "CORE SOCKET: KILN BREECH", "GEAR SLOT 1: EXT. CHAMBER ★★, CHAMBER AT 2", "GEAR SLOT 2: EMPTY", "GEAR SLOT 3: EMPTY",
    ]);
    expect(socketLines(b, 1, "KILN BREECH", fx, true)).toEqual(["CORE SOCKET: KILN BREECH", "3 GEAR SLOTS: EXT. CHAMBER ★★, 2 EMPTY"]);
    expect(socketLines(b, 0, "KILN BREECH", fx)).toEqual(["CORE SOCKET: KILN BREECH", "GEAR SLOT 1: EMPTY"]);
    expect(slotNotes(b, 0)).toContain("YOUR HULL'S FREE STARTING TURRET. IT CAN'T BE SOLD AT 1 STAR.");
    expect(slotNotes(b, 0)[0]).toBe("IT TAKES BELTS ON COLUMNS 5 AND 6.");
    expect(socketLines(b, 5, "X", fx)).toEqual([]);
  });
});
