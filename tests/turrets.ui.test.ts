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
import { deadEndLines, slotNotes, socketLines, turretFacts, type SocketRow } from "../src/screens/build/turretPanel";
import { gist } from "../src/ui/abilityText"; // 0.6.2rel

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
    // 0.6.2rel: whole sentences (the panel draws them as warnings, in amber); the short form for a short band
    expect(deadEndLines(b, 1)).toEqual(["BELT 2 IS A DEAD END: THIS TURRET TAKES NO BELT ON COLUMN 10. RE-ROUTE IT TO FIGHT."]);
    expect(deadEndLines(b, 1, true)).toEqual(["BELT 2 IS A DEAD END ON COLUMN 10."]);
    // the slot emptied: an empty slot takes no belts either
    expect(dropTurret(ctx, mountCarry(run, 1), 150, 110)).toBe(true);
    expect(deadEndLines(b, 1)[0]).toBe("BELT 2 IS A DEAD END: AN EMPTY SLOT TAKES NO BELT ON COLUMN 10. RE-ROUTE IT TO FIGHT.");
  });
});

describe("0.6.2s build screen: turret texts (S10, REQ-BFG-032)", () => {
  it("a turret card: its class, fire rate and loads, the star's rate, intake, gear slots and core socket, the next star", () => {
    // 0.6.2rel (REQ-BFG-032): the glossary's turret block (abilityText.ts); the seconds as words at most two decimals
    // (0.495 reads 0.49); merge progress is its own sentence on the panel ("1 MORE COPY TO MERGE."), not in the
    // next-star line; the catalogue's reason line isn't shown (it repeats these facts at 1 star)
    // NUM-2 (REQ-BFG-047): the seconds are 30 / speed (the faces keep SEC): ★2 BOMBARD speed 33, 30 / 33 = 0.909 reads 0.91
    // (was 0.9); ★3 THUNDERER speed 47 against ★1 38, 47 / 38 = 1.237: 24% FASTER (was 0.8 / 0.64 = 1.25, 25%)
    expect(turretFacts("bombard", 1)).toEqual([
      "A HEAVY TURRET THAT FIRES EVERY 1 SECOND AND HOLDS 4 LOADS.",
      "IT TAKES A BELT ON EACH OF ITS TWO COLUMNS.",
      "IT HAS 2 GEAR SLOTS AND 1 CORE SOCKET.",
      "ITS SHOTS LAND 0.6 SECONDS AFTER IT FIRES.",
      "NEXT STAR: FIRES EVERY 0.91 SECONDS, 3 GEAR SLOTS.", // NUM-2 (was "0.9 SECONDS")
    ]);
    expect(turretFacts("dartgun", 2).slice(0, 2)).toEqual(["A LIGHT TURRET THAT FIRES EVERY 0.49 SECONDS AND HOLDS 2 LOADS.", "IT FIRES 11% FASTER THAN AT 1 STAR."]);
    expect(turretFacts("dartgun", 2)).toContain("NEXT STAR: FIRES EVERY 0.44 SECONDS, 3 GEAR SLOTS.");
    expect(turretFacts("thunderer", 3)).toEqual([
      "A HEAVY TURRET THAT FIRES EVERY 0.64 SECONDS AND HOLDS 4 LOADS.", "IT FIRES 24% FASTER THAN AT 1 STAR.", // NUM-2 (was 25%)
      "IT TAKES A BELT ON EACH OF ITS TWO COLUMNS.", "IT HAS 6 GEAR SLOTS AND 1 CORE SOCKET.", "ITS SHOTS LAND 0.5 SECONDS AFTER IT FIRES.",
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
    // 0.6.2rel: labelled rows (the panel aligns their values); a gear piece's clause after its name is the glossary's gist
    const rows = (rs: SocketRow[]) => rs.map((r) => `${r.label}: ${r.text}`);
    expect(rows(socketLines(b, 1, "KILN BREECH", fx))).toEqual([
      "CORE: KILN BREECH", "GEAR 1: EXT. CHAMBER ★★: CHAMBER AT 2.", "GEAR 2: EMPTY", "GEAR 3: EMPTY",
    ]);
    // 0.6.2rel2 (nit 2): the empty hardpoints say what they are
    expect(rows(socketLines(b, 1, "KILN BREECH", fx, true))).toEqual(["CORE: KILN BREECH", "GEAR: EXT. CHAMBER ★★ AND 2 EMPTY SLOTS"]);
    expect(rows(socketLines(b, 0, "KILN BREECH", fx))).toEqual(["CORE: KILN BREECH", "GEAR: EMPTY"]);
    expect(socketLines(b, 1, "KILN BREECH", (d, s) => gist(d, s))[1].text).toBe(`EXT. CHAMBER ★★: ${gist("chamber", 2)}.`);
    expect(slotNotes(b, 0)).toContain("STARTING TURRET: YOUR HULL'S FREE ONE, SO IT CAN'T BE SOLD AT ★1."); // U2c step 5 (REQ-BFG-046; T1 2.2's notice form, LABEL: TEXT.): was "IT IS YOUR HULL'S FREE STARTING TURRET, SO IT CAN'T BE SOLD AT 1 STAR."
    expect(slotNotes(b, 0)[0]).toBe("IT TAKES BELTS ON COLUMNS 5 AND 6.");
    expect(socketLines(b, 5, "X", fx)).toEqual([]);
  });
});
