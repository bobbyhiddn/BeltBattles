// COUNT-1 (REQ-BFG-100; REQ-BFG-053's waiting count): the battle view's counters. Tests only: no sim change.
//  - each value against the sim's own state on a stepped real fight (day 10, FURNACE's par deck 2 v WEAVER's par deck 1,
//    seed 1: tools/count1/pickFights.ts's pick, with a LODESTONE aboard the foe and three jams on your side): BURN's stacks
//    (not its entries), STUN against LODESTONE's own count at every LODESTONE hit, the waiting count against PRESSURE
//    BREECH's own sum at every shot, and C6's colour across each jam (amber at the threshold, red from the jam until the
//    gun fires again);
//  - the status row: its chips' order, POISON's reserved slot (no chip), the shrink from the outer end, no tab when empty,
//    the dim-0 rule from the readers table;
//  - no counter above y 0 or below the screen on any view; every group's target a finger's size;
//  - the words: by key (REQ-BFG-107), and no new string names the soak layer or the block.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Battle, turretAt, type Side, type SimEvent } from "../src/sim/battle";
import { FRAY_MAX, JAM_THRESHOLD, type HeroId } from "../src/sim/content";
import type { Build } from "../src/sim/deck";
import { parRefs } from "../src/sim/harness/par";
import { battleLayout, battleScale, laneLayout } from "../src/game/battleLayout";
import {
  BELT_COUNTS, GUN_COLOUR, JamMemory, READERS, STATUS_CHIPS, STATUS_H, boxW, burnStacks, canJam, gunState, holds, keepOnScreen, readCount,
  shownChips, slugsWaiting, statusTab, stunnedParts, tabBelow, type StatusChip,
} from "../src/game/counters";
import { clipOut, pickGroup, plateKeep, plateTarget, squareAt } from "../src/screens/battleCounters";
import { keywordEntry, keywordRow, waitingText } from "../src/ui/counterText";
import { textWidth } from "../src/render/font";
import { C } from "../src/render/palette";
import { contrast } from "../src/render/styleContrast";
import { tapPx } from "../src/ui/tap";

const ROOT = join(new URL("..", import.meta.url).pathname);
const deck = (hero: HeroId, day: number, i: number): Build => structuredClone(parRefs(hero, day, "field", 4)[i]);

/** The fight: your FURNACE par deck 2 v the foe's WEAVER par deck 1 (a LODESTONE aboard), day 10, seed 1. */
const fight = (): Battle => new Battle(deck("furnace", 10, 1), deck("weaver", 10, 0), 1);

type Priv = { applyHit: (...a: unknown[]) => unknown; fire: (...a: unknown[]) => unknown };

describe("COUNT-1: each counter's value against the sim's own state, on a real fight", () => {
  it("BURN's chip counts stacks (the sum of each entry's dps), and differs from the entries at some tick", () => {
    const bt = fight();
    let ticks = 0, burning = 0, differs = 0;
    while (!bt.over && ticks < 60 * 120) {
      bt.step();
      bt.drainEvents();
      ticks++;
      for (const s of [0, 1] as Side[]) {
        const h = bt.sides[s].hull;
        expect(burnStacks(bt.sides[s])).toBe(h.burns.reduce((n, b) => n + b.dps, 0));
        if (h.burns.length) burning++;
        if (burnStacks(bt.sides[s]) !== h.burns.length) differs++;
        expect(h.fray).toBeLessThanOrEqual(FRAY_MAX);
      }
    }
    expect(burning).toBeGreaterThan(0);
    expect(differs, "stacks and entries part at some tick (0.9.9's dot counted entries)").toBeGreaterThan(0);
  });

  it("STUN equals LODESTONE's own count at every LODESTONE hit (the sim's add / its step)", () => {
    const bt = fight(), pv = bt as unknown as Priv;
    const orig = pv.applyHit.bind(bt);
    let hits = 0, lit = 0;
    pv.applyHit = (s: unknown, am: unknown, h: unknown) => {
      const hit = h as { g: { def: { id: string; gate?: { perStalled?: { each: number } } } } };
      if (hit.g.def.id !== "lodestone") return orig(s, am, h);
      const side = (s as { side: Side }).side, p = (am as { p: { flat: number } }).p;
      const view = stunnedParts(bt.sides[side === 0 ? 1 : 0]);
      const before = p.flat;
      const r = orig(s, am, h);
      const add = p.flat - before, each = hit.g.def.gate!.perStalled!.each;
      if (view === 0) expect(add).toBe(0);
      else expect([view * each, view * 2 * each]).toContain(add);
      hits++;
      if (view > 0) lit++;
      return r;
    };
    let n = 0;
    while (!bt.over && n < 60 * 120) { bt.step(); bt.drainEvents(); n++; }
    expect(hits, "LODESTONE hits compared").toBeGreaterThan(0);
    expect(lit, "hits with a STUN running").toBeGreaterThan(0);
  });

  it("the waiting count equals PRESSURE BREECH's own sum (waiting + chamber + store) at every shot", () => {
    const bt = fight(), pv = bt as unknown as Priv;
    const orig = pv.fire.bind(bt);
    let shots = 0;
    pv.fire = (s: unknown, tu: unknown, p: unknown, k: unknown, queued: unknown, fin: unknown) => {
      // the shot's load has left the chamber (and a COMPOUND BREECH's partner with it) when the sim fires it
      const extra = 1 + ((p as { compound?: unknown }).compound ? 1 : 0);
      expect(queued).toBe(slugsWaiting(tu as Parameters<typeof slugsWaiting>[0]) + extra);
      shots++;
      return orig(s, tu, p, k, queued, fin);
    };
    let n = 0;
    while (!bt.over && n < 60 * 120) { bt.step(); bt.drainEvents(); n++; }
    expect(shots).toBeGreaterThan(10);
  });

  it("C6's colour across a jam: amber at the threshold, red from the jam until that gun fires again", () => {
    const bt = fight(), mem = new JamMemory();
    let jams = 0, held = 0, cleared = 0;
    const open = new Map<string, number>();
    let n = 0;
    while (!bt.over && n < 60 * 120) {
      bt.step();
      const ev: SimEvent[] = bt.drainEvents();
      n++;
      for (const e of ev) {
        if (e.type === "jam") {
          const tu = turretAt(bt.sides[e.side], e.turret)!;
          // the jam rule's own count was at its threshold: amber until the jam itself lands
          expect(tu.waiting).toBeGreaterThanOrEqual(JAM_THRESHOLD);
          expect(canJam(tu)).toBe(true);
          expect(gunState(tu, mem.jammed(e.side, e.turret))).toBe("full");
          jams++;
          open.set(`${e.side}:${e.turret}`, n);
        }
        mem.event(e);
        if (e.type === "jam") expect(gunState(turretAt(bt.sides[e.side], e.turret)!, mem.jammed(e.side, e.turret))).toBe("jam");
        if (e.type === "fire" && open.has(`${e.side}:${e.turret}`)) {
          expect(mem.jammed(e.side, e.turret)).toBe(false);
          if (n > open.get(`${e.side}:${e.turret}`)!) held++;
          open.delete(`${e.side}:${e.turret}`);
          cleared++;
        }
      }
      for (const [k] of open) {
        const [s, t] = k.split(":").map(Number);
        expect(gunState(turretAt(bt.sides[s as Side], t)!, mem.jammed(s as Side, t))).toBe("jam");
      }
    }
    expect(jams, "jams in the fight").toBeGreaterThan(0);
    expect(cleared, "jams ended by a shot").toBeGreaterThan(0);
    expect(held, "red held past the jam's own tick").toBeGreaterThan(0);
  });

  it("a gun that never jams (PRESSURE BREECH: its core's noJam) is never amber, whatever waits at it", () => {
    const tu = { noJam: false, waiting: 9, stack: [], store: [], core: { routine: "pressure", spec: { noJam: true } } } as unknown as Parameters<typeof canJam>[0];
    expect(canJam(tu)).toBe(false);
    expect(gunState(tu, false)).toBe("ok");
    const id = { ...tu, core: { routine: "identity", spec: {} } } as unknown as Parameters<typeof canJam>[0];
    expect(gunState(id, false)).toBe("full");
    expect(gunState({ ...id, waiting: JAM_THRESHOLD - 1 } as typeof id, false)).toBe("ok");
  });
});

describe("COUNT-1: the status row", () => {
  const b = fight();

  it("chips in order BURN, POISON (reserved: no chip), FRAY n/15, STUN; FRAY_MAX imported", () => {
    expect(STATUS_CHIPS.map((c) => c.key)).toEqual(["burn", "poison", "fray", "stun"]);
    expect(STATUS_CHIPS.find((c) => c.key === "poison")!.value(b, 0)).toBeNull();
    expect(STATUS_CHIPS.find((c) => c.key === "fray")!.text(9)).toEqual({ num: "9", tail: `/${FRAY_MAX}` });
    // a fight state with all three: stepped to its first tick with BURN, FRAY and STUN on the foe
    const bt = fight();
    let n = 0, row: ReturnType<typeof shownChips> = [];
    while (!bt.over && n < 60 * 60) {
      bt.step(); bt.drainEvents(); n++;
      row = shownChips(bt, 1).filter((c) => !c.dim);
      if (row.length === 3) break;
    }
    expect(row.map((c) => c.chip.key)).toEqual(["burn", "fray", "stun"]);
  });

  it("a chip at 0 is hidden unless a piece in the fight reads its count (then dimmed)", () => {
    // the foe holds a LODESTONE: it reads YOUR parts stunned, so your STUN chip shows at 0, dimmed; the foe's own STUN
    // has no reader (no LODESTONE or SCRAPPER on your side)
    expect(holds(b.sides[1], READERS.find((r) => r.id === "lodestone")!)).toBe(true);
    expect(readCount(b, 0, "stun")).toBe(true);
    expect(readCount(b, 1, "stun")).toBe(false);
    // at the start (the foe's WEAVER rune has put FRAY on your hull already): your STUN chip at 0, dimmed; none on the foe's
    const fresh = fight();
    expect(shownChips(fresh, 0).find((c) => c.chip.key === "stun")).toEqual({ chip: STATUS_CHIPS.find((c) => c.key === "stun"), n: 0, dim: true });
    expect(shownChips(fresh, 1).find((c) => c.chip.key === "stun")).toBeUndefined();
    expect(shownChips(fresh, 1).every((c) => !c.dim)).toBe(true);
  });

  it("the tab: right-aligned with the plate, 11 px, 4 px in, chips 6 px apart, shrinking from its outer end; none empty", () => {
    const plate = { x: 54, y: 0, w: 132, h: 10 };
    const w5 = (s: string) => textWidth(s, "5");
    const full = statusTab(plate, true, [w5("12"), w5("9/15"), w5("2")])!;
    expect(full.x + full.w).toBe(plate.x + plate.w);
    expect(full.y).toBe(plate.y + plate.h);
    expect(full.h).toBe(STATUS_H);
    expect(full.chips[0].x).toBe(full.x + 4);
    expect(full.chips[1].x - (full.chips[0].x + full.chips[0].w)).toBe(6);
    const two = statusTab(plate, true, [w5("9/15"), w5("2")])!;
    expect(two.x + two.w).toBe(full.x + full.w);
    expect(two.w).toBeLessThan(full.w);
    expect(statusTab(plate, true, [])).toBeNull();
    const above = statusTab({ x: 54, y: 386, w: 132, h: 10 }, false, [w5("3")])!;
    expect(above.y + above.h).toBe(386);
  });

  it("1E adds a chip by adding an entry (the API): the row reads the list and never names a chip", () => {
    const hits: StatusChip = { key: "burn", icon: "!", colour: C.red, numColour: C.red, value: () => 14, text: (n) => ({ num: String(n), tail: "" }), reminder: null, order: 50 };
    const row = shownChips(fight(), 0, [...STATUS_CHIPS, hits]);
    expect(row[row.length - 1].chip).toBe(hits);
  });
});

describe("COUNT-1: on every view: inside the screen, and a finger's target a group", () => {
  const views: [string, number, number, number, boolean][] = [
    ["phone 402x690 @3", 402, 690, 3, true], ["desk 1920x1080", 1920, 1080, 1, false], ["844x390 @3", 844, 390, 3, false],
    ["390x844 @3", 390, 844, 3, true], ["1366x768", 1366, 768, 1, false], ["320x480 @2", 320, 480, 2, true],
  ];
  for (const [name, cw, ch, dpr, portrait] of views) {
    it(`${name}: no status tab above y 0 or below the screen; each plate target >= a finger, clear of the bar`, () => {
      const scale = battleScale(cw * dpr, ch * dpr, portrait);
      const W = Math.floor((cw * dpr) / scale), H = Math.floor((ch * dpr) / scale);
      const L = laneLayout(battleLayout(W, H, portrait));
      const tp = tapPx({ scale, dpr });
      const widths = [textWidth("99", "5"), textWidth("15/15", "5"), textWidth("9", "5")];
      for (const s of [0, 1] as Side[]) {
        const below = tabBelow(L.plates[s], L.hulls[s]);
        const tab = statusTab(L.plates[s], below, widths)!;
        expect(tab.y, `${name} side ${s}`).toBeGreaterThanOrEqual(0);
        expect(tab.y + tab.h).toBeLessThanOrEqual(H);
        expect(tab.x).toBeGreaterThanOrEqual(0);
        expect(below, `the foe's tab hangs under its plate`).toBe(s === 1 ? true : !portrait);
        const base = { x: Math.min(tab.x, L.plates[s].x), y: Math.min(tab.y, L.plates[s].y), w: L.plates[s].w, h: tab.h + L.plates[s].h };
        const t = clipOut(plateTarget(base, below, tp, H), L.bar)!;
        expect(t.h, `${name} side ${s} target height (art px; a finger ${tp})`).toBeGreaterThanOrEqual(Math.min(tp, H));
        expect(t.w).toBeGreaterThanOrEqual(tp);
        expect(t.y).toBeGreaterThanOrEqual(0);
        expect(t.y + t.h).toBeLessThanOrEqual(H);
        // the wind's numbers keep clear of the tab's rows (windKeep's plates)
        const keep = plateKeep(L)[s];
        expect(keep.y <= tab.y && keep.y + keep.h >= tab.y + tab.h).toBe(true);
      }
      // a board box kept on the screen, its anchor off the screen not drawn (CLOSE)
      const w = boxW(textWidth("8 JAM", "3") + 4);
      for (const [ax, ay] of [[2, 1], [W - 1, H - 1], [W / 2, 0]]) {
        const bx = keepOnScreen(ax, ay, ax + 7, ay - 4, w, 9, W, H)!;
        expect(bx.y).toBeGreaterThanOrEqual(0);
        expect(bx.y + bx.h).toBeLessThanOrEqual(H);
        expect(bx.x + bx.w).toBeLessThanOrEqual(W);
        const sq = squareAt(bx, tp, W, H);
        expect(Math.min(sq.w, sq.h)).toBeGreaterThanOrEqual(Math.min(tp, H));
      }
      expect(keepOnScreen(-1, 5, 0, 0, w, 9, W, H)).toBeNull();
      expect(keepOnScreen(5, H, 0, 0, w, 9, W, H)).toBeNull();
    });
  }
});

describe("COUNT-1: overlapping finger targets", () => {
  it("a tap goes to the group whose box is under it, else the nearest box among the targets that hold it", () => {
    const belt = { id: "belt", anchor: { x: 100, y: 100, w: 7, h: 9 }, target: squareAt({ x: 100, y: 100, w: 7, h: 9 }, 27, 241, 414) };
    const gun = { id: "gun", anchor: { x: 104, y: 110, w: 11, h: 9 }, target: squareAt({ x: 104, y: 110, w: 11, h: 9 }, 27, 241, 414) };
    const gs = [belt, gun];
    expect(pickGroup(gs, 103, 104)!.id).toBe("belt"); // on the belt's box, inside the gun's square too
    expect(pickGroup(gs, 108, 113)!.id).toBe("gun");
    expect(pickGroup(gs, 112, 122)!.id).toBe("gun"); // nearer the gun's box
    expect(pickGroup(gs, 96, 98)!.id).toBe("belt");
    expect(pickGroup(gs, 0, 0)).toBeNull();
  });
});

describe("COUNT-1: the words (REQ-BFG-107) and colours", () => {
  it("each reminder is taken by its internal key, and no new string names the soak layer or the block", () => {
    for (const kw of ["BURN", "FRAY", "STUN", "PLATE", "SHIELD"] as const) {
      const row = keywordRow(kw)!, e = keywordEntry(kw, "5")!;
      expect(row.kw).toBe(kw);
      expect(e.word).toBe(row.word);
      expect(e.body).toBe(row.def);
    }
    for (const f of ["src/ui/counterText.ts", "src/game/counters.ts", "src/screens/battleCounters.ts"]) {
      const strings = readFileSync(join(ROOT, f), "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l)).join("\n").match(/"[^"\n]*"|`[^`\n]*`/g) ?? [];
      // the internal keys (faces.ts REMINDER's "PLATE" and "SHIELD", passed to keywordEntry) are no player string
      for (const s of strings) if (f.endsWith("counterText.ts") || !/^"(PLATE|SHIELD)"$/.test(s)) expect(s, `${f}: ${s}`).not.toMatch(/\b(PLATE|PLATES|PLATED|PLATING|SHIELD|SHIELDS)\b/);
    }
  });

  it("C6's text names the jam rule's own number, and a gun that never jams says so", () => {
    expect(waitingText(4, true)).toBe(`SLUGS WAITING AT THIS GUN: 4. AT ${JAM_THRESHOLD} BACKED UP IT JAMS AND SKIPS A SHOT.`);
    expect(waitingText(6, false)).toBe("SLUGS WAITING AT THIS GUN: 6. THIS GUN NEVER JAMS.");
  });

  it("FRAY's number reads at 4.5:1 or more on the counter box's navy (its icon keeps plum4); C5's rule defaults to all", () => {
    expect(contrast(C.plum4, C.navy)).toBeLessThan(4.5);
    expect(contrast(STATUS_CHIPS.find((c) => c.key === "fray")!.numColour, C.navy)).toBeGreaterThanOrEqual(4.5);
    for (const c of STATUS_CHIPS.filter((q) => q.key !== "poison")) expect(contrast(c.numColour, C.navy), c.key).toBeGreaterThanOrEqual(4.5);
    // C6's three states (white, amber, red) and C5's white on the same navy box
    for (const [k, col] of Object.entries(GUN_COLOUR)) expect(contrast(col, C.navy), k).toBeGreaterThanOrEqual(4.5);
    expect(BELT_COUNTS).toBe("all");
  });
});
