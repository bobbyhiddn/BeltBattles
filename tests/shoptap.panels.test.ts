// shoptap (BeltBattles 0.8.0 phone controls; REQ-BFG-034, REQ-BFG-035, backlog 319): the build screen's panels after a
// touch press (Ctx.touch). A placed part's panel offers SELL wherever the part can be sold (a factory, a rig, a turret, and
// a turret's core and gear in their own "fitted" panels); the signature factory's says it stays aboard; the hints say to
// drag (a touch tap never places); every button is a finger's target, at least TAP_CSS (44) CSS px tall. A mouse press
// keeps every panel exactly as it was (the labels, the hints, the buttons' rects).
import { describe, expect, it } from "vitest";
import { G, fresh, installRaster } from "./raster.helpers";
import { newRun, type Run } from "../src/game/run";
import { ITEMS, buyableModules, rigShape, sellValue } from "../src/sim/content";
import { key as K, rotField, setTurretList, turretSlots, type Placed } from "../src/sim/deck";
import { fusible } from "../src/sim/stars";
import { computeView } from "../src/core/io";
import { UI } from "../src/ui/ui";
import { TAP_CSS } from "../src/ui/tap";
import { buildLayout, buildScale, type Sel } from "../src/screens/build/layout";
import {
  SIGNATURE_ABOARD, TOUCH_TURN, cargoPanel, columnButtonH, columnButtons, detailsPlan, drawDetails, fittedPanel, itemPanel, keptWhole,
  offerPanel, rigPanel, sellLabel, turretPanel,
} from "../src/screens/build/inspector";
import { touchSlotHint, SLOT_HINT } from "../src/screens/build/turretPanel";
import { sellFitted, sellPlaced, storeFitted, type Ctx } from "../src/screens/build/actions";
import type { DuskFoe } from "../src/game/run";

installRaster();

const SHORT = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const rig = (uid: number, def: string, x: number, y: number, rot = 0, stars = 1): Placed => ({ uid, def, x, y, ...rotField(def, rot), ...(stars > 1 ? { stars } : {}) });

/** FURNACE with the KILN's belt, and `items` more. */
function furnace(items: Placed[] = []): Run {
  const run = newRun("furnace", 5, "shoptap-panels");
  run.build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, ...items], routes: [{ factory: 1, cells: [...SHORT] }], mods: [], beltCap: 40, hullBonus: 0 };
  run.inventory = [];
  return run;
}

/** The build screen's view and its panel area on a phone (its own scale), and the portrait band / landscape column.
 *  `dh`: art px added to the view's height (PACKS Q5: the pack row's 33 px, so the band stays 0.8.5's); `scale`: the
 *  view's scale where buildScale no longer picks 0.8.5's. */
function screen(w: number, h: number, dpr: number, dh = 0, scale?: number) {
  // zoom (REQ-BFG-040): the build screen's scale before the phone cap (buildScale without the dpr), so these views keep
  // the band, column and strip they pin (a phone now zooms out: tests/zoom.test.ts)
  const v0 = computeView(w, h, dpr, (pw, ph, portrait) => scale ?? buildScale(pw, ph, portrait));
  const v = { ...v0, H: v0.H + dh };
  return { v, area: buildLayout(v.W, v.H, v.portrait, 5).info, k: v.scale / v.dpr };
}
// PACKS Q5 (oracle 35e8ebc1eda74818): 0.8.5's views plus the pack row's 33 px, so the bands stay 0.8.5's
const PHONE = screen(390, 844, 3, 33); // 167 x 361 at x7, + 33: 167 x 394, the 161 x 69 band
const LAND = screen(844, 390, 3); // 633 x 292 at x4: the left column
// 180 x 320 at x4 (0.8.5's scale; bb-0.8.6's buildScale draws this screen at x3, 240 x 426, a full band), + 33: 180 x 353,
// the header-only strip (174 x 28)
const SMALL = screen(360, 640, 2, 33, 4);

/** A Ctx for the panels: `touch`, and the view the tap targets are measured in; the actions record what they did. */
function ctxOf(run: Run, touch: boolean, v = PHONE.v) {
  const log: string[] = [];
  const noop = () => undefined;
  const fx = { ring: noop, sparkle: noop, sparks: noop, dust: noop, popup: noop };
  const c = {
    run, touch, sel: { kind: "none" } as Sel, L: buildLayout(v.W, v.H, v.portrait, 5),
    game: { ui: new UI(), t: 0, view: v, audio: { play: (s: string) => log.push(`sound:${s}`) }, toast: (m: string) => log.push(`toast:${m}`), error: (m: string) => log.push(`error:${m}`) },
    wfx: fx, ufx: fx, coinPos: () => ({ x: 0, y: 0 }), turretAt: () => -1,
    select(s: Sel) { c.sel = s; }, touched: noop, placed: noop, invalid: (m: string) => log.push(`invalid:${m}`),
  };
  return { ctx: c as unknown as Ctx & { sel: Sel }, log };
}

/** drawDetails for `sel` on a canvas, and the UI regions it registered (the frame's). */
function regions(run: Run, sel: Sel, touch: boolean, s = PHONE) {
  const { ctx } = ctxOf(run, touch, s.v);
  const ui = (ctx.game as unknown as { ui: UI }).ui;
  ui.begin();
  drawDetails(G(fresh(s.v.W, s.v.H)), ctx, sel, null, s.area, {} as DuskFoe);
  ui.end();
  return { regions: ui.regions, plan: detailsPlan(ctx, sel, null, s.area)! };
}

describe("D2 / REQ-BFG-035: SELL on every carrier part's panel (touch); the mouse's panels as they were", () => {
  it("a placed rig: ROTATE, TO CARGO and SELL (an X rig: TO CARGO and SELL); the turn hint for a finger", () => {
    const run = furnace([rig(2, "temper", 3, 3, 1), rig(3, "overdrive", 5, 3)]);
    expect(rigPanel(run, 2, true)!.labels).toEqual(["ROTATE", "TO CARGO", "SELL +1G"]);
    expect(rigPanel(run, 3, true)!.labels).toEqual(["TO CARGO", `SELL +${sellValue("overdrive", 1)}G`]);
    expect(rigPanel(run, 2, true)!.body.at(-1)!.text).toBe(TOUCH_TURN);
    expect(TOUCH_TURN).toBe("TAP IT AGAIN TO TURN IT. DRAG TO MOVE.");
    // the mouse: as 0.8.0
    expect(rigPanel(run, 2)!.labels).toEqual(["ROTATE", "TO CARGO"]);
    expect(rigPanel(run, 2)!.body.at(-1)!.text).toBe("TAP TO TURN (OR R). DRAG TO MOVE.");
    expect(rigPanel(run, 3)!.labels).toEqual(["TO CARGO"]);
  });

  it("every buyable rig and factory, at every star: SELL at its cargo price (sellValue), after TO CARGO", () => {
    let n = 0;
    for (const d of buyableModules().filter((m) => m.kind === "gate" || m.kind === "factory")) {
      for (const s of fusible(d.id) ? [1, 2, 3] : [1]) {
        const run = furnace([d.kind === "gate" ? rig(2, d.id, 3, 3, 0, s) : { uid: 2, def: d.id, x: 0, y: 6, ...(s > 1 ? { stars: s } : {}) }]);
        const t = itemPanel(run, 2, true)!;
        expect(t.labels.slice(-2), `${d.id} ★${s}`).toEqual(["TO CARGO", `SELL +${sellValue(d.id, s)}G`]);
        expect(sellLabel(d.id, s)).toBe(`SELL +${sellValue(d.id, s)}G`);
        expect(itemPanel(run, 2)!.labels, `${d.id} ★${s} (mouse)`).not.toContain(sellLabel(d.id, s));
        n++;
      }
    }
    expect(n).toBeGreaterThan(100);
  });

  it("the signature factory: no SELL and no TO CARGO; on touch its panel says it stays aboard", () => {
    for (const hero of ["furnace", "weaver", "foundry", "bastion"] as const) {
      const run = newRun(hero, 5, "sig");
      const f = run.build.items.find((p) => ITEMS[p.def].kind === "factory")!;
      const touch = itemPanel(run, f.uid, true)!, mouse = itemPanel(run, f.uid)!;
      // bb-0.8.3 (REQ-BFG-043 D11): its one button is the FACTORY upgrade's, with the next level's price (0.8.0: none)
      expect([touch.labels, mouse.labels], hero).toEqual([["UPGRADE 10G"], ["UPGRADE 10G"]]);
      expect(touch.body.find((b) => b.text === SIGNATURE_ABOARD), hero).toMatchObject({ role: "note", keep: true });
      expect(mouse.body.some((b) => b.text === SIGNATURE_ABOARD), hero).toBe(false);
    }
    expect(SIGNATURE_ABOARD).toBe("STAYS ABOARD: THE SIGNATURE FACTORY CAN'T BE SOLD."); // U2c step 5 (REQ-BFG-046; T1 2.2's notice form, LABEL: TEXT.): was "THE SIGNATURE FACTORY STAYS ABOARD. IT CAN'T BE SOLD."
  });

  it("an installed turret offers SELL (a 1-star starting turret can't be sold, and says so); on touch its hint names the tap for its core and gear", () => {
    const run = furnace();
    setTurretList(run.build, [{ slot: 0, def: "scrapcannon", uid: 700, stars: 2 }]);
    run.build.mods = [{ uid: 950, def: "pressure", turret: 0 }, { uid: 951, def: "hopper", turret: 0 }];
    const t = turretPanel(run, 0, true)!;
    expect(t.labels).toEqual(["REMOVE CORE", "REMOVE GEAR", "TO CARGO", expect.stringMatching(/^SELL \+\d+G$/)]);
    expect(t.body.at(-1)!.text).toBe(`TAP IT AGAIN TO READ ITS CORE AND GEAR. ${SLOT_HINT}`);
    expect(turretPanel(run, 0)!.body.at(-1)!.text).toBe(SLOT_HINT);
    expect(touchSlotHint(run.build, 0)).toBe(t.body.at(-1)!.text);
    run.build.mods = [{ uid: 951, def: "hopper", turret: 0 }];
    expect(touchSlotHint(run.build, 0)).toBe(`TAP IT AGAIN TO READ ITS GEAR. ${SLOT_HINT}`);
    run.build.mods = [];
    expect(touchSlotHint(run.build, 0)).toBe(SLOT_HINT);
  });

  it("a fitted core and gear piece: its own panel with its text at its stars, TO CARGO and SELL at its cargo price", () => {
    for (const hero of ["furnace", "weaver"] as const) {
      const run = newRun(hero, 5, "fit");
      run.build.mods = [{ uid: 950, def: "pressure", turret: 0, stars: 2 }, { uid: 951, def: "hopper", turret: 0 }];
      const core = fittedPanel(run, 950)!, gear = fittedPanel(run, 951)!;
      expect([core.title, core.sub, core.labels]).toEqual(["PRESSURE BREECH ★★", "CORE ON TURRET 1", ["TO CARGO", `SELL +${sellValue("pressure", 2)}G`]]);
      expect([gear.title, gear.sub, gear.labels]).toEqual(["HOPPER ★", "GEAR ON TURRET 1", ["TO CARGO", `SELL +${sellValue("hopper", 1)}G`]]);
      // the core's numbers are its turret's (the hero's first gun, as the cargo panel's): the same sentences
      const inCargo = newRun(hero, 5, "fit");
      inCargo.inventory = [{ uid: 950, def: "pressure", stars: 2 }];
      const ab = (t: NonNullable<ReturnType<typeof fittedPanel>>) => t.body.filter((b) => b.role === "ability").map((b) => b.text);
      expect(ab(core), hero).toEqual(ab(cargoPanel(inCargo, 950)!));
      expect(fittedPanel(run, 999)).toBeNull();
    }
  });

  it("the hints: a finger is told to drag (a touch tap never places); the mouse's hints are 0.8.0's", () => {
    let n = 0;
    for (const d of buyableModules()) {
      const run = furnace();
      run.gold = 99;
      run.shop.wagons = [{ merchant: d.merchant ?? "ironmonger", offers: [{ def: d.id, price: d.price, sold: false }] }] as Run["shop"]["wagons"];
      run.inventory = [{ uid: 900, def: d.id }];
      for (const t of [offerPanel(run, 0, 0, true)!, cargoPanel(run, 900, true)!]) {
        const hint = t.body.find((b) => b.role === "hint")!.text;
        expect(hint, d.id).not.toMatch(/\bTAP\b/);
        if (d.kind !== "supply") expect(hint, d.id).toMatch(/\bDRAG\b/);
        n++;
      }
      const mouse = cargoPanel(run, 900)!.body.find((b) => b.role === "hint")!.text;
      if (d.kind !== "turret" && d.kind !== "supply") expect(mouse, d.id).toMatch(/^TAP /);
    }
    expect(n).toBeGreaterThan(150);
  });
});

describe("D2 / REQ-BFG-035: the SELL buttons sell, and nothing else changes", () => {
  it("SELL on a placed rig or factory: gold + its cargo price; the part (and a factory's belts) leave the deck; nothing in cargo", () => {
    const run = furnace([rig(2, "temper", 3, 3, 1, 2), { uid: 5, def: "press", x: 0, y: 6 }]);
    run.build.routes.push({ factory: 5, cells: [K(0, 5), K(0, 4)] });
    run.gold = 10;
    const { ctx } = ctxOf(run, true);
    sellPlaced(ctx, 2);
    expect([run.gold, run.build.items.some((p) => p.uid === 2), run.inventory]).toEqual([10 + sellValue("temper", 2), false, []]);
    sellPlaced(ctx, 5);
    expect([run.gold, run.build.items.map((p) => p.uid), run.build.routes]).toEqual([10 + sellValue("temper", 2) + sellValue("press", 1), [1], [{ factory: 1, cells: SHORT }]]);
    // the signature factory stays aboard
    const { ctx: c2, log } = ctxOf(run, true);
    sellPlaced(c2, 1);
    expect([run.build.items.map((p) => p.uid), log]).toEqual([[1], ["invalid:STAYS ABOARD: THE SIGNATURE FACTORY."]]); // U2c step 5 (REQ-BFG-046; T1 2.2's notice form, LABEL: TEXT.): was "THE SIGNATURE FACTORY STAYS ABOARD"
  });

  it("SELL on a fitted piece: gold + its cargo price, its turret selected; TO CARGO puts it in cargo, selected there", () => {
    const run = furnace();
    run.build.mods = [{ uid: 950, def: "pressure", turret: 0 }, { uid: 951, def: "hopper", turret: 0, stars: 2 }];
    run.gold = 0;
    const { ctx } = ctxOf(run, true);
    sellFitted(ctx, 951);
    expect([run.gold, run.build.mods.map((m) => m.uid), run.inventory, ctx.sel]).toEqual([sellValue("hopper", 2), [950], [], { kind: "turret", index: 0 }]);
    storeFitted(ctx, 950);
    expect([run.build.mods, run.inventory, ctx.sel]).toEqual([[], [{ uid: 950, def: "pressure" }], { kind: "cargo", uid: 950 }]);
  });
});

describe("D5: every button a finger presses is at least 44 CSS px tall (touch); the mouse's buttons as they were", () => {
  /** A deck with every kind of carrier panel: a rig, a factory, a belt, a turret with a core and gear, a fitted piece. */
  function deck(): { run: Run; sels: [string, Sel][] } {
    const run = furnace([rig(2, "temper", 3, 3, 1), { uid: 5, def: "press", x: 0, y: 6 }]);
    run.build.routes.push({ factory: 5, cells: [K(0, 5), K(0, 4)] });
    run.build.mods = [{ uid: 950, def: "pressure", turret: 0 }, { uid: 951, def: "hopper", turret: 0 }];
    run.inventory = [{ uid: 900, def: "temper" }];
    run.gold = 99;
    run.shop.wagons = [{ merchant: "alchemist", offers: [{ def: "temper", price: 3, sold: false }] }] as Run["shop"]["wagons"];
    return {
      run, sels: [
        ["rig", { kind: "item", uid: 2 }], ["factory", { kind: "item", uid: 5 }], ["belt", { kind: "route", index: 0 }],
        ["turret", { kind: "turret", index: 0 }], ["core", { kind: "fitted", uid: 950 }], ["gear", { kind: "fitted", uid: 951 }],
        ["cargo", { kind: "cargo", uid: 900 }], ["offer", { kind: "offer", wagon: 0, slot: 0 }],
      ],
    };
  }
  const BUTTONS = new Set(["rotate", "store", "sellpart", "rmroute", "unfitcore", "unfit", "turretcargo", "turretsell", "storefitted", "sellfitted", "sell", "buy"]);
  const hit = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  it("390x844 (the portrait band), 844x390 (the column), 360x640 (the header-only strip): every target >= 44 CSS px tall, inside its panel, none overlapping", () => {
    let n = 0;
    for (const s of [PHONE, LAND, SMALL]) {
      const { run, sels } = deck();
      for (const [name, sel] of sels) {
        if (s === SMALL && name === "belt") continue; // the strip shows a belt's readout (REMOVE BELT measured below)
        const { regions: rs, plan } = regions(run, sel, true, s);
        const btns = rs.filter((r) => BUTTONS.has(r.id));
        expect(btns.length, `${name} at ${s.v.W}x${s.v.H}`).toBeGreaterThan(0);
        for (const b of btns) {
          expect(b.r.h * s.k, `${name} ${b.id} at ${s.v.W}x${s.v.H}`).toBeGreaterThanOrEqual(TAP_CSS);
          expect(b.r.y).toBeGreaterThanOrEqual(plan.plan.r.y);
          expect(b.r.y + b.r.h).toBeLessThanOrEqual(plan.plan.r.y + plan.plan.r.h);
          for (const o of btns) if (o !== b) expect(hit(b.r, o.r), `${name}: ${b.id} / ${o.id}`).toBe(false);
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(40);
  });

  it("the landscape column: the mouse's buttons stacked as 0.6.1r stacked them; on touch two to a row, each 44 CSS px tall", () => {
    const r = { x: 6, y: 74, w: 128, h: 150 };
    for (let n = 1; n <= 4; n++) {
      // 0.8.0's drawDetails: bottom-up, 16 px each, 3 px apart, full width
      const old = Array.from({ length: n }, (_, i) => ({ x: r.x + 5, y: r.y + r.h - 5 - (n - i) * 16 - (n - 1 - i) * 3, w: r.w - 10, h: 16 }));
      expect(columnButtons(n, r), `${n} buttons`).toEqual(old);
      const t = columnButtons(n, r, 33);
      expect(new Set(t.map((q) => q.y)).size, `${n} buttons on touch`).toBe(Math.ceil(n / 2));
      for (const [i, q] of t.entries()) {
        expect(q.h).toBe(33);
        expect(q.x).toBeGreaterThanOrEqual(r.x + 5);
        expect(q.x + q.w).toBeLessThanOrEqual(r.x + r.w - 5);
        expect(q.y + q.h).toBeLessThanOrEqual(r.y + r.h - 5);
        for (const o of t.slice(i + 1)) expect(hit(q, o)).toBe(false);
      }
      expect(t.at(-1)!.y + t.at(-1)!.h).toBe(r.y + r.h - 5);
    }
  });

  it("REMOVE BELT on the 360x640 strip too", () => {
    const { run } = deck();
    const { regions: rs } = regions(run, { kind: "route", index: 0 }, true, SMALL);
    const rm = rs.find((r) => r.id === "rmroute")!;
    expect(rm.r.h * SMALL.k).toBeGreaterThanOrEqual(TAP_CSS);
  });

  it("the mouse: the buttons' targets are the drawn buttons, 0.8.0's sizes (13 px in the band, 16 in the column)", () => {
    for (const [s, h] of [[PHONE, 13], [LAND, 16]] as const) {
      const { run, sels } = deck();
      for (const [name, sel] of sels) {
        if (name === "core" || name === "gear") continue; // a mouse never picks a fitted piece
        const btns = regions(run, sel, false, s).regions.filter((r) => BUTTONS.has(r.id));
        for (const b of btns) expect(b.r.h, `${name} ${b.id}`).toBe(h);
      }
    }
    expect([columnButtonH(), columnButtonH(0), columnButtonH(33)]).toEqual([16, 16, 33]);
  });

  it("the phone band keeps its text on touch: every placed rig and factory and every fitted piece shows its kept blocks whole, and SELL", () => {
    // where a second button would push the row under the sub line and cut the kept text, TO CARGO gives way (a drag
    // onto the cargo tray does the same); on 390x844 that is exactly these
    const ctxOf = (run: Run): Ctx => ({ game: { ui: new UI(), t: 0, view: PHONE.v }, run, touch: true } as unknown as Ctx);
    const gaveWay: string[] = [];
    let cases = 0;
    const look = (id: string, run: Run, sel: Sel) => {
      const d = detailsPlan(ctxOf(run), sel, null, PHONE.area)!;
      expect(keptWhole(d.plan), `${id} ${JSON.stringify(d.t.labels)}`).toBe(true);
      expect(d.t.labels.at(-1), id).toMatch(/^SELL \+\d+G$/);
      if (!d.t.labels.includes("TO CARGO")) gaveWay.push(id);
      cases++;
    };
    for (const d of buyableModules()) for (const s of [1, 2, 3]) {
      if (d.kind === "gate") {
        for (const [x, y, rot] of [[3, 3, 1], [0, 9, 0], [5, 3, 0]] as const) look(`${d.id} ★${s} @${x},${y}`, furnace([rig(10, d.id, x, y, rot, s)]), { kind: "item", uid: 10 });
      } else if (d.kind === "factory") {
        look(`${d.id} ★${s}`, furnace([{ uid: 10, def: d.id, x: 0, y: 6, ...(s > 1 ? { stars: s } : {}) }]), { kind: "item", uid: 10 });
      } else if (d.kind === "mod" || d.kind === "core") {
        for (const hero of ["furnace", "weaver"] as const) {
          const run = newRun(hero, 5, "fit");
          run.build.mods = [{ uid: 950, def: d.id, turret: 0, ...(s > 1 ? { stars: s } : {}) }];
          look(`${d.id} ★${s} on ${hero}`, run, { kind: "fitted", uid: 950 });
        }
      }
    }
    // U2a (REQ-BFG-046): GRAPNEL GUN, LIMPET WORKS and TESLA ARC draw their new faces, short enough to keep TO CARGO
    // U2b F6: a placed ★2 HOT SWAP and LIMPET WORKS keep their star's interim perk clause (a face never says less than the
    // sim), one kept line more, so on this band TO CARGO gives way there again (their text stays whole); SPOTTER's new
    // face is short enough to keep it
    // U2e steps 1 and 4 (REQ-BFG-070): measured, none (were HOT SWAP ★2, LIMPET WORKS ★2, MANTLET ★2 on both heroes and
    // OVERDRIVE ★2 in three places): with no merge progress, NEXT★ or reminder on the face, every one of these panels keeps
    // TO CARGO beside SELL with its kept text whole (keptWhole above still checks every case)
    expect([...gaveWay].sort()).toEqual([]);
    expect(cases).toBeGreaterThan(300);
    // and the mouse's panels never lose a button
    const m = detailsPlan({ game: { ui: new UI(), t: 0, view: PHONE.v }, run: furnace([rig(10, "overdrive", 3, 3, 0, 2)]) } as unknown as Ctx, { kind: "item", uid: 10 }, null, PHONE.area)!;
    expect(m.t.labels).toEqual(["TO CARGO"]);
  });

  it("the turret panel's four buttons fit the phone band's row on touch, each label inside its button", () => {
    const { run } = deck();
    setTurretList(run.build, [{ slot: 0, def: "scrapcannon", uid: 700, stars: 2 }]); // a ★2 turret sells
    const { plan } = regions(run, { kind: "turret", index: 0 }, true);
    expect(plan.t.labels).toEqual(["REMOVE CORE", "REMOVE GEAR", "TO CARGO", expect.stringMatching(/^SELL \+\d+G$/)]);
    for (const [i, r] of plan.plan.rects!.entries()) expect(r.w, plan.t.labels[i]).toBeGreaterThanOrEqual(24);
    expect(turretSlots(run.build)[0].turret).toBeTruthy();
  });
});
