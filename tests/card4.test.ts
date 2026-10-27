// CARD-4 (REQ-BFG-107, REQ-BFG-081, REQ-BFG-004, REQ-BFG-087, REQ-BFG-089): READ-4's fixes on CARD-3's build.
// N: the rename notice reaches only a returning (0.9.8) player, decided once at this build's first run.
// P: on the rune cards only the TAP AGAIN TO TAKE IT bar takes a rune (its target a finger's on touch), never within 350 ms
//    of the card opening, never with the tap that closes a note that opened by itself; finger-tall word targets.
// K, D, S: first-sight notes open beside the hint strip; no note box over a panel's header; the strip over no price.
// T: the words READ-4 found misread.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { newRun } from "../src/game/run";
import { saveRun } from "../src/game/save";
import { emptyProfile, saveProfile } from "../src/game/profile";
import { saveSettings } from "../src/core/settings";
import {
  OLD_STORE_KEYS, PLAYER_IDS, TIPS_KEY, completeNotice, completeSight, completeTip, decidePlayer, renameNoticeDue,
  setTipsForTests,
} from "../src/ui/tips";
import { installRaster, fresh, G as gOf } from "./raster.helpers";
import { RUNES, RUNE_LIST, type RuneDef } from "../src/sim/runes";
import { UI, inside, type Rect } from "../src/ui/ui";
import { TAP_CSS } from "../src/ui/tap";
import { buildLayout, buildScale, phoneBarLift, phoneScreen } from "../src/screens/build/layout";
import { C } from "../src/render/palette"; // PRESENT-2 L: the hint strip's inner colour (night)
import { TAKE_CLOCK, takeGuardPassed } from "../src/ui/runeBar"; // CARD-4 (P2): the guard's wall clock, pinned here
const WALL = TAKE_CLOCK.wall;
import {
  TAKE_GUARD_S, runeBarBand, runeBarRect, runeBarTarget, runeCardH, runeChipTarget, runeHintBand, runeRowFits, runeRowH,
  runeWordBoxOn, runeWordTargets, shiftLayout,
} from "../src/ui/runeBar";
import { PICK_BAR, PICK_DEF, PICK_TAKE, RunePicker, pickLayout } from "../src/screens/runePicker";
import { LC_BAR, LC_TAKE, LastChancePicker } from "../src/screens/lastChancePicker";
import type { Run } from "../src/game/run";

installRaster();

/** A localStorage for the store tests (as tests/card3.test.ts's Mem). */
class Mem {
  private m = new Map<string, string>();
  getItem(k: string): string | null { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string): void { this.m.set(k, String(v)); }
  removeItem(k: string): void { this.m.delete(k); }
  keys(): string[] { return [...this.m.keys()]; }
}
const g = globalThis as unknown as { localStorage?: unknown };
beforeEach(() => { g.localStorage = new Mem(); setTipsForTests("reload"); TAKE_CLOCK.wall = () => 0; });
afterEach(() => { delete g.localStorage; setTipsForTests("reload"); TAKE_CLOCK.wall = WALL; });
/** A page reload: the store read again, then this build's first module (src/ui/firstRun.ts) runs decidePlayer. */
const boot = (): boolean => { setTipsForTests("reload"); return decidePlayer(); };
const stored = (): string[] => JSON.parse((g.localStorage as Mem).getItem(TIPS_KEY) ?? "[]");

describe("CARD-4 (n): the rename notice reaches only a returning 0.9.8 player (REQ-BFG-107; READ-4 10.1)", () => {
  it("the 0.9.8 keys are r098's own names (the profile, the run v7 and v3-v6, the settings, the sound)", () => {
    expect(OLD_STORE_KEYS).toEqual([
      "beltbattles.profile.v1", "beltbattles.run.v7", "beltbattles.run.v6", "beltbattles.run.v5", "beltbattles.run.v4",
      "beltbattles.run.v3", "beltbattles.settings.v1", "beltbattles.sound",
    ]);
    // this build reads and writes the same names (so a 0.9.8 store is the store it would have written)
    const src = (p: string): string => readFileSync(p, "utf8");
    expect(src("src/game/profile.ts")).toContain('PROFILE_KEY = "beltbattles.profile.v1"');
    for (const v of [7, 6, 5, 4, 3]) expect(src("src/game/save.ts")).toContain(`"beltbattles.run.v${v}"`);
    expect(src("src/core/settings.ts")).toContain('const KEY = "beltbattles.settings.v1"');
    expect(src("src/audio/audio.ts")).toContain('localStorage.setItem("beltbattles.sound"');
    expect(PLAYER_IDS).toEqual({ returning: "rename107.returning", fresh: "rename107.new" });
  });

  it("a fresh store is decided new at the first run and stays new after this build writes tips, notes, a run, a profile with runsFinished 1 and settings", () => {
    expect(boot()).toBe(false);
    expect(stored()).toEqual([PLAYER_IDS.fresh]); // decided once, at once
    expect(renameNoticeDue()).toBe(false);
    completeTip("place");
    completeTip("turn");
    completeSight("kw:BURN");
    saveRun(newRun("furnace", 1, "card4-n"));
    const p = emptyProfile();
    p.counters.runs = 1;
    p.counters.runsFinished = 1;
    saveProfile(p);
    saveSettings();
    expect(OLD_STORE_KEYS.filter((k) => (g.localStorage as Mem).getItem(k) !== null).sort()).toEqual(["beltbattles.profile.v1", "beltbattles.run.v7", "beltbattles.settings.v1"]);
    expect(renameNoticeDue()).toBe(false);
    // later sessions read the decision: the keys this build wrote never make the player returning
    for (let i = 0; i < 3; i++) {
      expect(boot()).toBe(false);
      expect(renameNoticeDue()).toBe(false);
    }
    expect(stored()).toEqual(expect.arrayContaining(["place", "turn", "kw:BURN", PLAYER_IDS.fresh]));
    expect(stored()).not.toContain(PLAYER_IDS.returning);
  });

  it("a 0.9.8-shaped store (each key alone) is returning: the notice is due once, then never again, and the decision survives a reload", () => {
    for (const k of OLD_STORE_KEYS) {
      g.localStorage = new Mem();
      (g.localStorage as Mem).setItem(k, k.endsWith("sound") ? "1" : "{}");
      expect(boot(), k).toBe(true);
      expect(stored(), k).toEqual([PLAYER_IDS.returning]);
      expect(renameNoticeDue(), k).toBe(true);
      expect(boot(), `${k}: a reload before the notice`).toBe(true);
      expect(renameNoticeDue(), k).toBe(true);
      completeNotice("rename107");
      expect(renameNoticeDue(), k).toBe(false);
      // the 0.9.8 key gone (a run ended), a reload: still decided, still shown
      (g.localStorage as Mem).removeItem(k);
      expect(boot(), k).toBe(true);
      expect(renameNoticeDue(), `${k}: never again`).toBe(false);
    }
  });

  it("a store with no 0.9.8 key but other BeltBattles keys (a later build's tips, ghosts, a name) is new; with no storage the notice never shows", () => {
    for (const k of [TIPS_KEY, "beltbattles.ghosts.v1", "beltbattles.name.v1", "beltbattles.player.v1", "beltbattles.runs.v1"]) {
      g.localStorage = new Mem();
      (g.localStorage as Mem).setItem(k, k === TIPS_KEY ? '["place"]' : "x");
      expect(boot(), k).toBe(false);
      expect(renameNoticeDue(), k).toBe(false);
    }
    delete g.localStorage;
    expect(boot()).toBe(false);
    expect(renameNoticeDue()).toBe(false);
    // bb.tips("new"): a new player as the first run leaves the store (a reload keeps it new)
    g.localStorage = new Mem();
    (g.localStorage as Mem).setItem("beltbattles.profile.v1", "{}");
    setTipsForTests("new");
    expect(boot()).toBe(false);
    expect(renameNoticeDue()).toBe(false);
  });

  it("the decision runs before anything this build writes: main.ts's first import is src/ui/firstRun.ts, which imports only tips.ts (which imports nothing)", () => {
    const main = readFileSync("src/main.ts", "utf8");
    const imports = main.split("\n").filter((l) => /^import\s/.test(l));
    expect(imports[0]).toMatch(/^import "\.\/ui\/firstRun";/);
    const first = readFileSync("src/ui/firstRun.ts", "utf8");
    expect(first.split("\n").filter((l) => /^import\s/.test(l))).toEqual(['import { decidePlayer } from "./tips";']);
    expect(first).toMatch(/^decidePlayer\(\);$/m);
    expect(readFileSync("src/ui/tips.ts", "utf8").split("\n").filter((l) => /^import\s/.test(l))).toEqual([]);
    // the build screen asks only whether it is due (no profile read: CARD-3's finishedRuns is gone)
    const build = readFileSync("src/screens/build/build.ts", "utf8");
    expect(build).toContain("else if (renameNoticeDue()) {");
    expect(build).not.toMatch(/finishedRuns|loadProfile/);
  });
});

// ---- P ------------------------------------------------------------------------------------------------------------------

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
/** The build screen as the game frames it (tests/card2.test.ts's framed). */
function framed(w: number, h: number, dpr: number, runes = 1, offers = 5) {
  const pw = Math.floor(w * dpr), ph = Math.floor(h * dpr), portrait = ph > pw * 1.05;
  const fake = { run: { build: { runes: Array.from({ length: runes }, () => ({ id: "many_hands" })) } }, refit: false, offers: () => Array.from({ length: offers }) } as unknown as Parameters<typeof runeRowFits>[0];
  let S = buildScale(pw, ph, portrait, dpr);
  while (S > 1 && !runeRowFits(fake, pw, ph, portrait, S, dpr)) S--;
  const isPh = phoneScreen(pw, ph, dpr), phone = portrait && isPh, tap = isPh ? Math.ceil(TAP_CSS / (S / dpr)) : 0;
  const v = { scale: S, dpr }, W = Math.floor(pw / S), H = Math.floor(ph / S);
  const lay = (unit: number) => {
    const row = runeRowH(v, runes), lift = phone ? phoneBarLift(W, H, offers, tap, runeRowH(v, 1)) : 0;
    return shiftLayout(buildLayout(W, H - row, portrait, offers, phone, tap, lift, { scale: S, unit }), row, H);
  };
  const Z = lay(1).cam.z, unit = gcd(S, Z), sub = S / unit;
  return { S, W, H, L: lay(unit), tap, phone, portrait, view: { W, H, scale: S, dpr, portrait, sub } };
}
/** The pinned phone views (tests/card2.test.ts's PHONES) and the desk. */
const PHONES: [string, number, number, number][] = [
  ["op-402x690", 402, 690, 3], ["phone-390x844", 390, 844, 3], ["phone-390x660", 390, 660, 3], ["iphone15pm-430x739", 430, 739, 3], ["land-844x390", 844, 390, 3],
];
const DESK: [string, number, number, number] = ["desk-1920x1080", 1920, 1080, 1];
/** A build screen enough for the pickers (tests/card2.test.ts's screenOf), with the build screen's clock `t`. */
function screenOf(run: Run, w: number, h: number, dpr: number, touch: boolean) {
  const f = framed(w, h, dpr, 0);
  const ui = new UI();
  ui.pointer.kind = touch ? "touch" : "mouse";
  const toasts: string[] = [];
  const s = {
    run, refit: false, touch, L: f.L, t: 0,
    game: { W: f.W, H: f.H, ui, view: f.view, canvas: null, error: (m: string) => toasts.push(m), resize: () => {}, toast: (m: string) => toasts.push(m) },
    touched: () => {}, lcHeartT: Infinity,
  };
  const frame = (p: { draw: (g: ReturnType<typeof gOf>, s: never) => void }) => {
    ui.begin();
    p.draw(gOf(fresh(f.W, f.H)), s as never);
    ui.end();
    return ui;
  };
  /** A press and its release on region `id` as the game routes them (game.ts pointerDown, pointerUp): the screen's
   *  pressed first (BuildScreen.pressed: both pickers hear it), then the region's tap. */
  const press = (p: { pressed: (r: string | null) => void }, id: string, also?: { pressed: (r: string | null) => void }) => {
    also?.pressed(id);
    p.pressed(id);
    const r = ui.regions.find((q) => q.id === id);
    r?.onTap?.();
    return r;
  };
  return { s, f, ui, frame, press, toasts };
}
const held = (run: Run): string[] => (run.build.runes ?? []).map((q) => q.id);
/** The take path ran: a rune held, or (a test's own offer) the build's refusal, NOT ON OFFER (READ-4's P counted it so). */
const took = (run: Run, toasts: readonly string[]): boolean => held(run).length > 0 || toasts.some((t) => t === "NOT ON OFFER" || t.startsWith("RUNE TAKEN"));
const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("CARD-4 (p): on the rune cards only the TAP AGAIN bar takes a rune (REQ-BFG-081, REQ-BFG-004; READ-4 10.2, 10.3)", () => {
  it("P1, P2: the dawn picker on the phone and the desk: the open card's body and words take nothing; the bar's target (a finger's on touch, never under a note) takes, but not within 350 ms of the open", () => {
    for (const [name, w, h, dpr] of [PHONES[0], PHONES[4], DESK]) {
      const touch = dpr > 1;
      setTipsForTests("done");
      const run = newRun("foundry", 5, `card4-p1-${name}`);
      const sc = screenOf(run, w, h, dpr, touch), picker = new RunePicker();
      const tap = touch ? sc.f.tap : 0;
      let ui = sc.frame(picker as never);
      const ids = picker.info(sc.s as never)!.ids, id0 = ids[0];
      sc.s.t = 10;
      sc.press(picker, "runepick-0"); // open
      ui = sc.frame(picker as never);
      const card = ui.regions.find((r) => r.id === "runepick-0")!, bar = ui.regions.find((r) => r.id === PICK_BAR)!;
      expect(card.onTap, `${name}: the open card's body takes nothing`).toBeUndefined();
      expect(bar.r, name).toEqual(picker.info(sc.s as never)!.bar);
      // the bar's target: inside the card, round the drawn bar, a finger tall on touch (the desk: the bar's band, 15 px)
      const drawn = runeBarRect(card.r, PICK_TAKE, tap);
      expect(inside(card.r, bar.r.x, bar.r.y) && inside(card.r, bar.r.x + bar.r.w - 1, bar.r.y + bar.r.h - 1), name).toBe(true);
      expect(bar.r.x <= drawn.x && bar.r.x + bar.r.w >= drawn.x + drawn.w && bar.r.y <= drawn.y && bar.r.y + bar.r.h >= drawn.y + drawn.h, `${name}: holds the drawn bar`).toBe(true);
      if (touch) expect(bar.r.h * (sc.f.S / dpr), `${name}: ${bar.r.h} art px`).toBeGreaterThanOrEqual(TAP_CSS);
      else expect(bar.r.h).toBe(15);
      expect(card.r.h, name).toBe(runeCardH(RUNES[id0], card.r.w, { reminder: true, hint: PICK_TAKE, tap }));
      const words = ui.regions.filter((r) => r.id.startsWith("runepick-w"));
      for (const wr of words) expect(overlaps(wr.r, bar.r), `${name} ${wr.id}`).toBe(false);
      // a body tap off the words: nothing (the game routes it to the card's region, which has no tap)
      expect(ui.hit(card.r.x + card.r.w - 4, card.r.y + 8)?.id, name).toBe("runepick-0");
      // a word's tap: its note, no take; the bar's target is never under the note's box
      if (words.length) {
        sc.press(picker, words[0].id);
        ui = sc.frame(picker as never);
        const box = ui.regions.find((r) => r.id === PICK_DEF)!.r, b2 = ui.regions.find((r) => r.id === PICK_BAR)!.r;
        expect(overlaps(box, b2), `${name}: the bar's target under the box`).toBe(false);
        if (touch) expect(b2.h * (sc.f.S / dpr)).toBeGreaterThanOrEqual(TAP_CSS);
      }
      // P2: the bar inside the guard does nothing; after it, it takes
      for (const dt of [0, 0.12, 0.25, TAKE_GUARD_S - 0.01]) {
        sc.s.t = 10 + dt;
        sc.press(picker, PICK_BAR);
        expect(held(run), `${name}: a take ${dt} s after the open`).toEqual([]);
        ui = sc.frame(picker as never);
      }
      sc.s.t = 10 + TAKE_GUARD_S + 0.01;
      sc.press(picker, PICK_BAR);
      expect(held(run), `${name}: the bar after the guard`).toEqual([id0]);
    }
  });

  it("P2's clocks: either the game's or the wall's past 350 ms passes; a double tap is under both", () => {
    expect([takeGuardPassed(0.34, 349), takeGuardPassed(0.35, 0), takeGuardPassed(0.1, 350), takeGuardPassed(0.2, 200)]).toEqual([false, true, true, false]);
    // the wall's clock alone (a slow frame: the game's clock 0.1 s behind): a bar tap 400 ms after the open takes
    setTipsForTests("done");
    const run = newRun("furnace", 3, "card4-p2-wall");
    const sc = screenOf(run, 402, 690, 3, true), picker = new RunePicker();
    let wall = 1000;
    TAKE_CLOCK.wall = () => wall;
    sc.frame(picker as never);
    sc.press(picker, "runepick-0");
    sc.frame(picker as never);
    sc.s.t = 0.1;
    wall = 1300;
    sc.press(picker, PICK_BAR);
    expect(held(run), "300 ms: ignored").toEqual([]);
    sc.frame(picker as never);
    wall = 1400;
    sc.press(picker, PICK_BAR);
    expect(held(run).length, "400 ms on the wall: taken").toBe(1);
  });

  it("P2: a double tap on a closed card (open, then the same point at once) opens it and stops there, on every card position and on the bar", () => {
    setTipsForTests("done");
    for (const i of [0, 1, 2]) {
      const run = newRun("furnace", 3, `card4-p2-${i}`);
      const sc = screenOf(run, 402, 690, 3, true), picker = new RunePicker();
      let ui = sc.frame(picker as never);
      const c0 = ui.regions.find((r) => r.id === `runepick-${i}`)!.r, cx = c0.x + c0.w / 2, cy = c0.y + c0.h / 2;
      sc.s.t = 5;
      sc.press(picker, ui.hit(cx, cy)!.id);
      expect(picker.open).toBe(i);
      ui = sc.frame(picker as never);
      // the second tap 0.1 s later, on the same point and on the bar
      sc.s.t = 5.1;
      const hit = ui.hit(cx, cy)!;
      sc.press(picker, hit.id);
      sc.press(picker, PICK_BAR);
      expect([picker.open, held(run)], `card ${i}: ${hit.id}`).toEqual([i, []]);
    }
  });

  it("P3: while a note that opened by itself is up, the next tap anywhere (the bar, a word, the chip, another card) only closes it", () => {
    const targets = (ui: UI) => [PICK_BAR, "runepick-chip", "runepick-1", ...ui.regions.filter((r) => r.id.startsWith("runepick-w")).map((r) => r.id)];
    for (const k of [0, 1, 2, 3]) {
      setTipsForTests("sight");
      const run = newRun("foundry", 5, `card4-p3-${k}`);
      const sc = screenOf(run, 402, 690, 3, true), picker = new RunePicker();
      picker.offer = () => ({ day: 1, tier: "common", ids: ["seam_rivets", "twin_salve", "hot_seam"] }) as never;
      sc.frame(picker as never);
      sc.s.t = 1;
      sc.press(picker, "runepick-0");
      expect([picker.word, picker.auto]).toEqual(["PAIR", true]);
      let ui = sc.frame(picker as never);
      const id = targets(ui)[k];
      sc.s.t = 3; // long after the guard
      sc.press(picker, id);
      expect([picker.open, picker.word, picker.note, picker.auto, held(run)], id).toEqual([0, null, false, false, []]);
      ui = sc.frame(picker as never);
      // the next tap does what it does
      expect(took(run, sc.toasts), id).toBe(false);
      if (id === PICK_BAR) {
        sc.press(picker, PICK_BAR);
        expect(took(run, sc.toasts)).toBe(true);
      } else if (id === "runepick-1") {
        sc.press(picker, id);
        expect(picker.open).toBe(1);
      } else if (id === "runepick-chip") {
        sc.press(picker, id);
        expect(picker.note).toBe(true);
      } else {
        sc.press(picker, id);
        expect(picker.word).toBe(id.split(":")[1]);
      }
    }
    // a word the player opened is no note that opened by itself: a tap on the bar after it takes
    setTipsForTests("done");
    const run = newRun("foundry", 5, "card4-p3-own");
    const sc = screenOf(run, 402, 690, 3, true), picker = new RunePicker();
    picker.offer = () => ({ day: 1, tier: "common", ids: ["seam_rivets", "twin_salve", "hot_seam"] }) as never;
    sc.frame(picker as never);
    sc.press(picker, "runepick-0");
    const ui = sc.frame(picker as never);
    sc.press(picker, ui.regions.find((r) => r.id.startsWith("runepick-w"))!.id);
    expect([picker.word, picker.auto]).toEqual(["PAIR", false]);
    sc.frame(picker as never);
    sc.s.t = 2;
    sc.press(picker, PICK_BAR);
    expect(took(run, sc.toasts), "the bar's tap closes the player's own note and takes").toBe(true);
  });

  it("LAST CHANCE's RUNE card: the same rule (body nothing; bar a finger's, after the guard; a self-opened note's next tap only closes it); its PART and HULL cards as before", () => {
    for (const [name, w, h, dpr] of [PHONES[0], DESK]) {
      const touch = dpr > 1;
      for (const tips of ["done", "sight"] as const) {
        setTipsForTests(tips);
        const run = newRun("furnace", 5, `card4-lc-${name}`);
        (run as unknown as { lastChance: { lives: number; day: number } }).lastChance = { lives: 1, day: 3 };
        const sc = screenOf(run, w, h, dpr, touch), lc = new LastChancePicker();
        lc.offer = (x) => { const o = Object.getPrototypeOf(lc).offer.call(lc, x); return o ? { ...o, rune: { ...(o.rune ?? {}), id: "seam_rivets" } } : o; };
        let ui = sc.frame(lc as never);
        expect(ui.regions.some((r) => r.id === LC_BAR), "closed: no bar").toBe(false);
        sc.s.t = 4;
        sc.press(lc, "lcpick-rune", new RunePicker());
        expect([lc.open, lc.word], `${name} ${tips}`).toEqual([0, tips === "sight" ? "PAIR" : null]);
        ui = sc.frame(lc as never);
        const bar = ui.regions.find((r) => r.id === LC_BAR)!, card = ui.regions.find((r) => r.id === "lcpick-rune")!;
        if (touch) expect(bar.r.h * (sc.f.S / dpr)).toBeGreaterThanOrEqual(TAP_CSS);
        for (const wr of ui.regions.filter((r) => r.id.startsWith("lcrune-w"))) expect(overlaps(wr.r, bar.r), wr.id).toBe(false);
        const box = ui.regions.find((r) => r.id === "lcrune-def");
        if (box) expect(overlaps(box.r, bar.r), "never under the box").toBe(false);
        // the body: nothing taken (and a self-opened note closed by it)
        sc.s.t = 6;
        sc.press(lc, "lcpick-rune");
        expect([lc.open, lc.word, held(run).length], `${name} ${tips}: body`).toEqual([0, null, 0]);
        ui = sc.frame(lc as never);
        expect(card.r.h).toBe(ui.regions.find((r) => r.id === "lcpick-rune")!.r.h);
        // the guard: a fresh open, then the bar at once
        sc.press(lc, "lcpick-part");
        sc.frame(lc as never);
        sc.s.t = 8;
        sc.press(lc, "lcpick-rune");
        ui = sc.frame(lc as never);
        if (tips === "sight") expect(lc.word, "the next word not yet seen opens by itself").toBe("SHIELD");
        sc.s.t = 8.2;
        sc.press(lc, LC_BAR);
        expect(held(run), `${name} ${tips}: inside the guard`).toEqual([]);
        sc.s.t = 8.4;
        sc.press(lc, LC_BAR);
        expect(held(run).length, `${name} ${tips}: after the guard (the offer's own rune)`).toBe(1);
      }
    }
    // P3 on LAST CHANCE: a self-opened note's next tap (the bar) only closes it
    setTipsForTests("sight");
    const run = newRun("furnace", 5, "card4-lc-p3");
    (run as unknown as { lastChance: { lives: number; day: number } }).lastChance = { lives: 1, day: 3 };
    const sc = screenOf(run, 402, 690, 3, true), lc = new LastChancePicker();
    lc.offer = (x) => { const o = Object.getPrototypeOf(lc).offer.call(lc, x); return o ? { ...o, rune: { ...(o.rune ?? {}), id: "seam_rivets" } } : o; };
    sc.frame(lc as never);
    sc.press(lc, "lcpick-rune");
    expect([lc.word, lc.auto]).toEqual(["PAIR", true]);
    sc.frame(lc as never);
    sc.s.t = 5;
    sc.press(lc, LC_BAR);
    expect([lc.word, held(run)]).toEqual([null, []]);
    sc.frame(lc as never);
    sc.press(lc, LC_BAR);
    expect(held(run).length).toBe(1);
    // the PART card: open, then its body takes, as before (tests/lc1.ui.test.ts)
    const run2 = newRun("furnace", 5, "card4-lc-part");
    (run2 as unknown as { lastChance: { lives: number; day: number } }).lastChance = { lives: 1, day: 3 };
    const sc2 = screenOf(run2, 402, 690, 3, true), lc2 = new LastChancePicker();
    sc2.frame(lc2 as never);
    const inv0 = run2.inventory.length;
    sc2.press(lc2, "lcpick-part");
    sc2.frame(lc2 as never);
    sc2.press(lc2, "lcpick-part");
    expect(run2.inventory.length).toBe(inv0 + 1);
  });

  it("P4: word targets on every rune's opened card, on the five pinned phones and the desk, both cards: none overlaps another, the bar's target or the chip's; each holds its word's middle; a finger tall where the room allows (the rest listed); the desk's as before", () => {
    const short: string[] = [];
    let n = 0, full = 0;
    for (const [name, w, h, dpr] of [...PHONES, DESK]) {
      const f = framed(w, h, dpr, 0), touch = dpr > 1, tap = touch ? f.tap : 0, css = f.S / dpr;
      const cardW = Math.min(f.W - 8, 300);
      for (const def of Object.values(RUNES) as RuneDef[]) {
        for (const where of ["picker", "lastchance"] as const) {
          const hh = where === "picker" ? runeCardH(def, cardW, { reminder: true, hint: PICK_TAKE, tap }) : runeCardH(def, cardW, { hint: LC_TAKE, tap });
          const card = { x: 4, y: 40, w: cardW, h: hh };
          const take = runeBarTarget(card, where === "picker" ? PICK_TAKE : LC_TAKE, tap), chip = runeChipTarget(card, def, tap);
          const ts = runeWordTargets(card, def, [chip, take], tap);
          const all = runeWordTargets(card, def, [], tap);
          expect(ts.length, `${name} ${where} ${def.id}: every word kept`).toBe(all.length);
          if (touch) expect(take.h * css, `${name} ${where} ${def.id}: the bar`).toBeGreaterThanOrEqual(TAP_CSS);
          ts.forEach((t, i) => {
            n++;
            expect(overlaps(t.r, take) || overlaps(t.r, chip), `${name} ${def.id} ${t.word}`).toBe(false);
            expect(inside(t.r, Math.floor(t.glyph.x + t.glyph.w / 2), Math.floor(t.glyph.y + 3.5)), `${name} ${def.id} ${t.word}: its middle`).toBe(true);
            expect(inside(card, t.r.x, t.r.y) && inside(card, t.r.x + t.r.w - 1, t.r.y + t.r.h - 1)).toBe(true);
            ts.forEach((u, j) => { if (j > i) expect(overlaps(t.r, u.r), `${name} ${def.id}: ${t.word} and ${u.word}`).toBe(false); });
            if (!touch) {
              // the desk keeps its sizes: the line's 9 px pitch, at least 9 wide (split only between words on a line)
              expect(t.r.h, `${def.id} ${t.word}`).toBe(9);
              expect(t.r.y).toBe(t.glyph.y - 1);
              return;
            }
            if (t.r.h >= tap) { full++; return; }
            // why: a word on the line above or below shares the gap between the lines; the chip's or the bar's target;
            // the card's frame
            const nb = ts.find((u) => u !== t && u.glyph.y !== t.glyph.y && Math.abs(u.glyph.y - t.glyph.y) <= 18 && u.r.x < t.r.x + t.r.w && t.r.x < u.r.x + u.r.w);
            const why = nb ? `shares the gap between its line and ${nb.word}'s (${nb.glyph.y < t.glyph.y ? "above" : "below"})`
              : t.r.y + t.r.h === take.y ? "stops at the TAP AGAIN bar's target" : t.r.y === chip.y + chip.h || t.r.y + t.r.h === chip.y ? "stops at the chip's target" : "the card's frame";
            short.push(`${name} ${where} ${def.id} ${t.word}: ${t.r.h} art px = ${(t.r.h * css).toFixed(1)} CSS px (${why})`);
          });
        }
      }
    }
    const kinds = new Map<string, number>();
    for (const s of short) { const k = s.replace(/^.*\((.*?)(?: \(above\)| \(below\))?\)$/, "$1").replace(/ and [A-Z ]+'s/, " and another word's").replace(/[A-Z ]+'s \(/, "("); kinds.set(k, (kinds.get(k) ?? 0) + 1); }
    console.log(`CARD-4 (p4): ${n} word targets on ${PHONES.length} phones and the desk; on the phones ${full} at least TAP_CSS tall, ${short.length} under it:\n${short.join("\n")}`);
    expect(full).toBeGreaterThan(short.length);
  });
});

// ---- K, D, S --------------------------------------------------------------------------------------------------------------
import { buyableModules, ITEMS } from "../src/sim/content";
import { fusible } from "../src/sim/stars";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { key as KEY, rotField, setTurretList, turretSlots, type Placed } from "../src/sim/deck";
import { panelArea, type Sel } from "../src/screens/build/layout";
import { detailsPlan, drawDetails, hintStrip, panelFit } from "../src/screens/build/inspector";
import { defBoxPlace, definitionBox, keywordState, keywordsIdle, panelHead } from "../src/screens/build/keywords";
import { glossaryEntry } from "../src/ui/glossary";
import { tipDone } from "../src/ui/tips";
import type { Ctx } from "../src/screens/build/actions";
import type { DuskFoe } from "../src/game/run";

/** A build screen's panel context (tests/card3.test.ts's panelCtx). */
function panelCtx(run: Run, sel: Sel, f: ReturnType<typeof framed>, touch: boolean) {
  const ctx = { game: { ui: new UI(), t: 0, view: f.view, W: f.W, H: f.H }, run, touch, L: f.L } as unknown as Ctx;
  const area = panelArea(f.L, sel, { touch, hover: false, busy: false }, panelFit(ctx, sel, !!f.L.phone));
  let last: ReturnType<typeof fresh> | null = null; // PRESENT-2 L: the last frame's canvas, to read whether the hint strip was drawn
  const draw = () => {
    const ui = (ctx.game as unknown as { ui: UI }).ui;
    ui.pointer.kind = touch ? "touch" : "mouse";
    Object.assign(ui.pointer, { x: -1, y: -1, down: false });
    ui.begin();
    drawDetails(gOf((last = fresh(f.W, f.H))), ctx, sel, null, area, {} as DuskFoe);
    ui.end();
    return ui;
  };
  /** PRESENT-2 L (cap's ruling 0d0ef2465804aafb): was the strip `s` drawn in the last frame (its inner px is C.night)? A note that hangs at the growth limit may sit where the strip is,
   *  and then the strip is not drawn while it shows. */
  const stripDrawn = (s: Rect): boolean => !!last && last.at(s.x + 1, s.y + 1) === C.night;
  return { ctx, area, draw, d: () => detailsPlan(ctx, sel, null, area)!, stripDrawn };
}
const CARGO: Sel = { kind: "cargo", uid: 900 };
const SHORTB = [KEY(4, 5), KEY(4, 4), KEY(4, 3), KEY(4, 2), KEY(4, 1), KEY(4, 0)];
const rigAt = (uid: number, def: string, x: number, y: number, rot = 0, stars = 1): Placed => ({ uid, def, x, y, ...rotField(def, rot), ...(stars > 1 ? { stars } : {}) });
function furnaceRun(items: Placed[] = []): Run {
  const run = newRun("furnace", 5, "card4-panels");
  run.build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, ...items], routes: [{ factory: 1, cells: [...SHORTB] }], mods: [], beltCap: 40, hullBonus: 0 };
  run.inventory = [];
  run.gold = 2;
  return run;
}
/** Every panel a finger can open (tests/card3.test.ts's allPanels: explain1's 899). */
function allPanels(): { id: string; run: Run; sel: Sel }[] {
  const out: ReturnType<typeof allPanels> = [];
  const OFFER: Sel = { kind: "offer", wagon: 0, slot: 0 };
  for (const d of buyableModules()) {
    const stars = fusible(d.id) ? [1, 2, 3] : [1];
    const o = furnaceRun();
    o.shop.wagons = [{ merchant: d.merchant ?? "ironmonger", offers: [{ def: d.id, price: d.price, sold: false }] }] as Run["shop"]["wagons"];
    out.push({ id: `offer ${d.id}`, run: o, sel: OFFER });
    for (const s of stars) {
      const c = furnaceRun();
      c.inventory = [{ uid: 900, def: d.id, ...(s > 1 ? { stars: s } : {}) }];
      out.push({ id: `cargo ${d.id} ★${s}`, run: c, sel: CARGO });
      if (d.kind === "gate") {
        for (const [x, y, rot] of [[3, 3, 1], [0, 9, 0], [5, 3, 0]] as const) out.push({ id: `${d.id} ★${s} @${x},${y}`, run: furnaceRun([rigAt(10, d.id, x, y, rot, s)]), sel: { kind: "item", uid: 10 } });
      } else if (d.kind === "factory") {
        out.push({ id: `${d.id} ★${s}`, run: furnaceRun([{ uid: 10, def: d.id, x: 0, y: 6, ...(s > 1 ? { stars: s } : {}) }]), sel: { kind: "item", uid: 10 } });
      } else if (d.kind === "mod" || d.kind === "core") {
        for (const hero of ["furnace", "weaver"] as const) {
          const run = newRun(hero, 5, "card4-fit");
          run.build.mods = [{ uid: 950, def: d.id, turret: 0, ...(s > 1 ? { stars: s } : {}) }];
          out.push({ id: `${d.id} ★${s} fitted on ${hero}`, run, sel: { kind: "fitted", uid: 950 } });
        }
      } else if (d.kind === "turret") {
        const run = furnaceRun();
        setTurretList(run.build, [{ slot: 0, def: "scrapcannon", uid: 90 }, { slot: 1, def: d.id, uid: 700, ...(s > 1 ? { stars: s } : {}) }]);
        run.build.mods = [{ uid: 950, def: "pressure", turret: 1 }, { uid: 951, def: "hopper", turret: 1 }];
        out.push({ id: `turret ${d.id} ★${s} with a core and gear`, run, sel: { kind: "turret", index: 1 } });
      }
    }
  }
  for (const hero of PLAYABLE_HEROES) {
    const run = newRun(hero, 5, "card4-start");
    for (const p of run.build.items) out.push({ id: `${hero}'s starting ${p.def}`, run, sel: { kind: "item", uid: p.uid } });
    if (turretSlots(run.build)[0]?.turret) out.push({ id: `${hero}'s starting turret`, run, sel: { kind: "turret", index: 0 } });
    run.build.routes.forEach((_, i) => out.push({ id: `${hero}'s belt ${i + 1}`, run, sel: { kind: "route", index: i } }));
  }
  out.push({ id: "the KILN's belt", run: furnaceRun(), sel: { kind: "route", index: 0 } });
  return out;
}
const ZOOMED: [string, number, number, number][] = PHONES.filter(([n]) => !n.startsWith("land"));
/** What the strip and a box must never cover on the build screen: every shop card (its price), REROLL, the packs. */
const shopRects = (f: ReturnType<typeof framed>): { what: string; r: Rect }[] => [
  ...f.L.cards.map((r, i) => ({ what: `shop card ${i + 1}`, r })), { what: "REROLL", r: f.L.reroll }, ...f.L.packs.map((r, i) => ({ what: `pack ${i + 1}`, r })),
];

describe("CARD-4 (k, d, s): first-sight notes beside the strip; no box over a header; no strip over a price (REQ-BFG-004, REQ-BFG-087)", () => {
  it("S: on the four zoomed phones every panel's hint strip (tips new) sits just under the panel, over no shop card, REROLL, pack, button or the panel", () => {
    let strips = 0;
    const where = new Map<string, number>();
    for (const [name, w, h, dpr] of ZOOMED) {
      const f = framed(w, h, dpr, 1);
      for (const p of allPanels()) {
        setTipsForTests("new");
        const pc = panelCtx(p.run, p.sel, f, true), d = pc.d();
        if (!d?.hint) continue;
        strips++;
        const s = hintStrip(d.hint, d.plan.r, f.H).r;
        expect(s.y, `${name} ${p.id}: just under the panel`).toBe(d.plan.r.y + d.plan.r.h);
        expect(s.y + s.h <= f.H - 2, `${name} ${p.id}: on the screen`).toBe(true);
        for (const q of shopRects(f)) expect(overlaps(s, q.r), `${name} ${p.id}: over ${q.what}`).toBe(false);
        for (const b of d.plan.rects ?? []) expect(overlaps(s, b), `${name} ${p.id}: over a button`).toBe(false);
        expect(overlaps(s, d.plan.r), `${name} ${p.id}: over the panel`).toBe(false);
        // the strip takes no press (CARD-3 C): nothing is registered over it. PRESENT-2 L (cap's ruling 0d0ef2465804aafb): except the note that hangs over where the strip would be
        // (a panel at the growth limit): the strip is not drawn while it shows, so it takes no press either
        const ui = pc.draw();
        expect(ui.regions.filter((q) => overlaps(q.r, s) && q.id !== "details-over" && !(q.id === "kwdef" && !pc.stripDrawn(s))).map((q) => q.id), `${name} ${p.id}`).toEqual([]);
        where.set(name, (where.get(name) ?? 0) + 1);
      }
    }
    console.log(`CARD-4 (s): ${strips} strips, each just under its panel: ${[...where].map(([k, v]) => `${k} ${v}`).join(", ")}`);
    expect(strips).toBeGreaterThan(100);
  });

  it("K: a rig's first panels (the strip up, every first-sight note new) open their first keyword's note beside the strip: SURGE VALVE's EVERY, BRAKE SHOE's SPEED; never two boxes", () => {
    const f = framed(402, 690, 3, 1);
    for (const [def, word] of [["surge", "EVERY"], ["brake", "SPEED"]] as const) {
      for (const sel of ["offer", "placed"] as const) {
        setTipsForTests("new");
        const run = sel === "offer" ? furnaceRun() : furnaceRun([rigAt(10, def, 3, 3, 1)]);
        if (sel === "offer") run.shop.wagons = [{ merchant: "tinker", offers: [{ def, price: ITEMS[def].price, sold: false }] }] as Run["shop"]["wagons"];
        run.gold = 9;
        const pc = panelCtx(run, sel === "offer" ? { kind: "offer", wagon: 0, slot: 0 } : { kind: "item", uid: 10 }, f, true);
        const d = pc.d();
        expect(d.hint, `${def} ${sel}: the strip shows`).not.toBeNull();
        const ui = pc.draw();
        const st = keywordState(pc.ctx) as { word: string | null; rig: boolean };
        expect(st.word, `${def} ${sel}`).toBe(glossaryEntry(word)?.word ?? word);
        const boxes = ui.regions.filter((q) => q.id === "kwdef" || q.id === "kwsight");
        expect(boxes.length, `${def} ${sel}: one box`).toBe(1);
        const strip = hintStrip(d.hint!, d.plan.r, f.H).r;
        // PRESENT-3 H (re-pinned old -> new): a first-run note that was under the strip over the deck's top rows (surge's EVERY on 402x690 with a rune: 2 px) is moved up off the deck and can land on the strip: then the
        // strip is not drawn while the note shows (as at the growth limit, PRESENT-2 L); where the box is off the strip (brake's SPEED) both show as before. Was: the box off the strip, always.
        expect(pc.stripDrawn(strip), `${def} ${sel}: the strip is drawn exactly where the box is off it`).toBe(!overlaps(boxes[0].r, strip));
        for (const hq of panelHead(d.plan)) expect(overlaps(boxes[0].r, hq), `${def} ${sel}: the box off the header`).toBe(false);
        keywordsIdle(pc.ctx);
        expect(tipDone("place")).toBe(false);
      }
    }
  });

  // one test per phone (each draws every panel's every box twice: tips new and done), each given 3 minutes under load
  for (const [name, w, h, dpr] of PHONES) it(`D on ${name}: tips new and done, every keyword's box (a tap's, as a first sight's) misses the panel's header, its own word's row and the strip; the ones that can't fit are listed`, () => {
    let n = 0, below = 0, past = 0, yielded = 0;
    const cant: string[] = [];
    {
      const f = framed(w, h, dpr, 1);
      for (const tips of ["done", "new"] as const) {
        for (const p of allPanels()) {
          setTipsForTests(tips);
          const pc = panelCtx(p.run, p.sel, f, true);
          const ui0 = pc.draw(), d = pc.d();
          if (!d) continue;
          const st0 = keywordState(pc.ctx) as { word: string | null } | undefined;
          if (st0) st0.word = null;
          const ui1 = pc.draw();
          const regs = ui1.regions.filter((q) => /^kw:\d+:/.test(q.id));
          void ui0;
          const words = [...new Set(regs.map((q) => q.id.split(":")[2]))];
          const strip = d.hint ? hintStrip(d.hint, d.plan.r, f.H).r : null;
          const head = panelHead(d.plan);
          for (const wd of words) {
            const st = keywordState(pc.ctx)! as { word: string | null };
            const key = glossaryEntry(wd)?.word ?? wd;
            st.word = key;
            const ui = pc.draw(), def = ui.regions.find((q) => q.id === "kwdef");
            if (!def) { st.word = null; continue; }
            n++;
            const mineBefore = regs.filter((q) => (glossaryEntry(q.id.split(":")[2])?.word ?? q.id.split(":")[2]) === key);
            const mine = ui.regions.filter((q) => /^kw:\d+:/.test(q.id) && (glossaryEntry(q.id.split(":")[2])?.word ?? q.id.split(":")[2]) === key);
            // PRESENT-2 L (cap's ruling 0d0ef2465804aafb): a note that hangs at the growth limit may overlap the strip's place: the strip is not drawn while it shows (pc.stripDrawn)
            const overStrip = !!strip && overlaps(def.r, strip) && pc.stripDrawn(strip);
            if (strip && overlaps(def.r, strip) && !overStrip) yielded++;
            const bad = head.some((q) => overlaps(def.r, q)) || mine.length < mineBefore.length || overStrip;
            if (bad) cant.push(`${name} ${tips} ${p.id} ${wd}: box ${JSON.stringify(def.r)}${head.some((q) => overlaps(def.r, q)) ? " over the header" : ""}${mine.length < mineBefore.length ? " over its own word" : ""}${overStrip ? " over the strip" : ""}`);
            const foot = definitionBox(d.plan.r, d.plan.maxY + 2, Math.round((def.r.h - 3) / 9));
            if (def.r.y > foot.y) below++;
            if (def.r.y + def.r.h > d.plan.r.y + d.plan.r.h) past++;
            st.word = null;
          }
          keywordsIdle(pc.ctx);
        }
      }
    }
    console.log(`CARD-4 (d) ${name}: ${n} boxes (tips new and done); ${below} sit lower than the panel's foot box (under their word's line), ${past} reach past the panel's foot; ${yielded} overlap the strip's place with the strip not drawn (PRESENT-2 L); ${cant.length} can't fit:\n${cant.slice(0, 40).join("\n")}`);
    expect(n).toBeGreaterThan(1000);
    expect(cant.length, cant.slice(0, 5).join("\n")).toBe(0);
  }, 180_000);

  it("defBoxPlace: the foot where clear; else under the word's line; else above it where that misses the header; else under the strip", () => {
    const head = [{ x: 0, y: 100, w: 235, h: 25 }], box = { x: 2, y: 136, w: 231, h: 21 }; // a 2-line box at a 57 px panel's foot
    expect(defBoxPlace(box, [{ glyph: { x: 9, y: 126, w: 20, h: 7 } }], head, null)).toEqual({ box, fits: true });
    // its word on the last line: under the line (past the panel's foot)
    expect(defBoxPlace(box, [{ glyph: { x: 9, y: 144, w: 20, h: 7 } }], head, null).box.y).toBe(153);
    // its word on the first line under the header (SPEED on BRAKE SHOE): under the line, never over the header
    expect(defBoxPlace({ ...box, y: 125 }, [{ glyph: { x: 9, y: 126, w: 20, h: 7 } }], head, null).box.y).toBe(135);
    // a strip under the panel where the box would go: above the line if that misses the header, else under the strip
    const strip = { x: 0, y: 157, w: 235, h: 16 };
    expect(defBoxPlace(box, [{ glyph: { x: 9, y: 144, w: 20, h: 7 } }], head, strip).box.y).toBe(174);
    expect(defBoxPlace({ ...box, h: 12 }, [{ glyph: { x: 9, y: 144, w: 20, h: 7 } }], head, strip).box.y).toBe(144 - 2 - 12);
    // the screen's foot: where nothing fits, as near the line as the screen allows (listed)
    expect(defBoxPlace(box, [{ glyph: { x: 9, y: 144, w: 20, h: 7 } }], head, strip, 180).fits).toBe(false);
  });

  // CARD-4 run 2 (RESTART-RUN2 3 (b); READ-4 F step 7, run 1's tip1 and tip2: the rig sentence's box over shop cards 4 and 5
  // and REROLL): with no room beside a phone's band panel, the rig sentence's first-sight box goes under the panel and its
  // strip, on the deck side
  it("the rig sentence's first-sight box (tips new): on the four zoomed phones under the panel and its strip, over no shop card, REROLL, pack, the panel, the strip, CARGO or FIGHT, and on the screen; beside the panel where there is room (the landscape phone and the desk listed)", () => {
    const cant: string[] = [], seen = new Map<string, number>(), other: string[] = [];
    for (const [name, w, h, dpr] of [...PHONES, DESK]) {
      const f = framed(w, h, dpr, 1), touch = name !== DESK[0];
      for (const p of allPanels()) {
        setTipsForTests("new");
        const pc = panelCtx(p.run, p.sel, f, touch);
        const ui = pc.draw(), d = pc.d();
        const sight = ui.regions.filter((q) => q.id === "kwsight");
        if (!d || !sight.length || !(keywordState(pc.ctx) as { rig?: boolean } | undefined)?.rig) { keywordsIdle(pc.ctx); continue; }
        seen.set(name, (seen.get(name) ?? 0) + 1);
        expect(sight.length + ui.regions.filter((q) => q.id === "kwdef").length, `${name} ${p.id}: one box`).toBe(1);
        const b = sight[0].r, strip = d.hint ? hintStrip(d.hint, d.plan.r, f.H).r : null;
        const bad = [...shopRects(f).filter((q) => overlaps(b, q.r)).map((q) => q.what), ...(overlaps(b, d.plan.r) ? ["the panel"] : []), ...(strip && overlaps(b, strip) ? ["the strip"] : []),
          ...(b.y < 0 || b.y + b.h > f.H ? ["off the screen"] : []), ...(overlaps(b, f.L.fight) ? ["FIGHT"] : []), ...(overlaps(b, f.L.cargo) ? ["CARGO"] : [])];
        const line = `${name} ${p.id}: box ${JSON.stringify(b)}${bad.length ? ` over ${bad.join(", ")}` : ""}`;
        if (ZOOMED.some(([n]) => n === name)) {
          if (bad.length) cant.push(line);
          expect(b.y, `${name} ${p.id}: under the panel and its strip`).toBeGreaterThanOrEqual(Math.max(d.plan.r.y + d.plan.r.h, strip ? strip.y + strip.h : 0));
        } else if (bad.length) other.push(line);
        keywordsIdle(pc.ctx);
      }
    }
    console.log(`CARD-4 run 2 (rig box): ${[...seen].map(([k, v]) => `${k} ${v}`).join(", ")} rig sentence boxes; ${cant.length} on the zoomed phones over a shop card, REROLL, a pack, the panel or the strip; the landscape phone and the desk: ${other.length} such${other.length ? `:\n${other.slice(0, 12).join("\n")}` : ""}`);
    for (const [n] of ZOOMED) expect(seen.get(n) ?? 0, n).toBeGreaterThan(5);
    expect(cant, cant.slice(0, 5).join("\n")).toEqual([]);
  }, 180_000);
});

// ---- T --------------------------------------------------------------------------------------------------------------------
import { phoneGist, shopChip } from "../src/ui/chips";
import { faceLines } from "../src/ui/faces";
import { cardText } from "../src/ui/abilityText";
import { textWidth, icons } from "../src/render/font";
import { BURN_DPS, BURN_TIME, FRAY_BONUS, FRAY_MAX } from "../src/sim/content";
import { FUSE_MAX } from "../src/sim/stars";
import { KEYWORD_WORD, PLAIN_REMINDER, WORD_ONLY, runeKeyword, runeKeywords, runeLine, runeReminder } from "../src/ui/runeText";
import { RUNE_NOTE, RUNE_WORD_NOTE } from "../src/ui/glossary";
import { runeTextLines, runeCardTextW, runeWordText } from "../src/ui/runeBar";
import { lineText } from "../src/ui/richText";

describe("CARD-4 (t): the words READ-4 found misread (REQ-BFG-081, REQ-BFG-089; READ-4 3, 5, 8, 11 item 6)", () => {
  it("BRACE FRAME: TILES IT HITS (its FULL RULE's words) on the face and the desk line, the phone gist READ-4's ITS TILES; the face one 5x7 line on every phone panel", () => {
    const fl = faceLines("braceframe", 1, {})!;
    const plain = (t: string): string => t.replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " "); // as drawn, icons and the font's own word glyphs out
    expect(fl.rules.map((r) => plain(r.text))).toEqual(["STUN ON BELT TILES IT HITS: 50% SHORTER."]); // SHOPCARD-1b (REQ-BFG-081): BELT tiles, no FOE (was "FOE STUN ON TILES IT HITS")
    expect(fl.rules.map((r) => r.text).join(" ")).toMatch(/ON BELT TILES IT HITS: 50% SHORTER\./);
    expect(cardText("braceframe")).toBe("SHORTER STUNS ON TILES IT HITS.");
    // CARD-4 run 3 (cap's call, RESTART-RUN3 2 (a)) changed this pin by design: the phone gist is READ-4's ITS TILES again
    // (READ-4 read it RRR with images; run 2's TILES HIT read PPP); the face and the desk line keep TILES IT HITS
    expect(phoneGist("braceframe", {})).toEqual(["ITS TILES", "{STUN}-50%"]);
    // the sim: Battle.braceCut multiplies an enemy STUN's seconds on a tile its arrows hit by brace.mul (0.5 at ★1)
    expect(ITEMS.braceframe.gate!.brace!.mul).toBe(0.5);
  });

  // CARD-5 (REQ-BFG-111; GISTS-CARD5) changed two of CARD-4's six by design: EXT. CHAMBER's is FIRES 2{SLUG} / A SHOT and
  // TESLA ARC's SHOTS ARC / {STUN}1 now (tests/card5.test.ts pins both, their digits and their fit); the four kept stay here
  it("CARD-4's phone gists that CARD-5 kept name what each piece does, each row A at most 10 capitals, 40 px, no digit; row B the face's chip", () => {
    const want: Record<string, readonly [string, string]> = {
      spotter: ["AIMS AGAIN", "AIM+1"], anvil: ["DMG + YOUR", "{PLATE}+100%"], compound: ["{SLUG}{SLUG} AS ONE", "{DMG}+15%"],
      sorting: ["EACH THIRD", "{SLUG}COPY"],
    };
    for (const [d, g] of Object.entries(want)) {
      expect(phoneGist(d, {}), d).toEqual(g);
      expect(g[1], d).toBe(shopChip(d, {})); // row B: the face's own chip, unchanged
      const a = icons(g[0], "alone");
      expect(textWidth(a, "3"), d).toBeLessThanOrEqual(40);
      expect((g[0].replace(/\{[A-Z*]+\}/g, "").match(/[A-Z]/g) ?? []).length, d).toBeLessThanOrEqual(10);
      expect(/\d/.test(g[0]), d).toBe(false);
    }
    // each true to its face (the face is the sim's numbers): SPOTTER's no-part shots aim again; ANVIL BREECH adds 100% of
    // your SHIELD to its shot's damage; COMPOUND BREECH fires 2 slugs as 1 shot; EXT. CHAMBER fires 2 slugs a shot; TESLA
    // ARC's arc stuns; SORTING ARM copies one slug in 3
    const rule = (d: string): string => faceLines(d, 1, {})!.rules[0].text.replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ");
    expect(rule("spotter")).toBe("SHOTS AIMED AT NO PART AIM AGAIN ONCE.");
    console.log(`CARD-4 (t) faces: ${["anvil", "compound", "chamber", "tesla", "sorting"].map((d) => `${d}: ${JSON.stringify(rule(d))}`).join("; ")}`);
    expect(rule("anvil")).toMatch(/100% OF YOUR/);
    expect(rule("compound")).toMatch(/FIRES 2 ?AS 1 SHOT/);
    expect(rule("chamber")).toMatch(/EACH SHOT FIRES 2/);
    expect(rule("tesla")).toMatch(/ARCS TO 1 PART: ?STUN ?1/);
    expect(rule("sorting")).toMatch(/OF EVERY 3 ?, ONE BECOMES 2/);
    // the three READ-4 left alone kept theirs (their notes carry WARD and PAIR); CARD-5 (GISTS-CARD5) changed WARD BELL's and
    // TWIN TRIGGER's by design, SEAM WELDER keeps {*PAIR}
    expect([phoneGist("wardbell", {})![0], phoneGist("seamwelder", {})![0], phoneGist("twintrigger", {})![0]]).toEqual(["EVERY 4{SEC}", "{*PAIR}", "PAIRED {SLUG}"]);
  });

  it("the hull runes say ALL RUN on the card; MERGED, LOAD and RIG are words with notes on their cards; the chips and their lines as before", () => {
    for (const id of ["iron_skin", "spare_hull"]) {
      expect(runeLine(RUNES[id]), id).toBe(`+${RUNES[id].amount.n} MAX HULL, ALL RUN.`);
      for (const w of [216, 223, 290]) expect(runeTextLines(RUNES[id], w).length, `${id} @${w}`).toBe(1);
      expect([runeKeyword(RUNES[id]), runeReminder(RUNES[id])], id).toEqual(["HULL", PLAIN_REMINDER]);
    }
    const words: Record<string, string[]> = { scrap_halo: ["HULL", "MERGED"], scrap_saint: ["DMG", "MERGED"], toll_road: ["LOAD", "DMG", "RIG"] };
    const chip: Record<string, string> = { scrap_halo: "HULL", scrap_saint: "DMG", toll_road: "DMG" };
    for (const [id, ws] of Object.entries(words)) {
      const def = RUNES[id];
      expect(runeKeywords(def).map((k) => KEYWORD_WORD[k]), id).toEqual(ws);
      expect(runeKeyword(def), `${id}: its chip's word`).toBe(chip[id]);
      expect(runeReminder(def), `${id}: its chip's line`).toBe(RUNE_NOTE[id] ?? PLAIN_REMINDER);
      // the line's words are as before (only a word target is added)
      expect(runeLine(def), id).toBe({ scrap_halo: "+60 HULL PER MERGED (★2/★3) PIECE IN USE.", scrap_saint: `+${def.amount.n}% DMG PER MERGED (★2/★3) PIECE IN USE.`, toll_road: `EACH LOAD: +${def.amount.n}% DMG PER RIG IT PASSED.` }[id]);
      const card = { x: 4, y: 40, w: 233, h: runeCardH(def, 233, { reminder: true, hint: PICK_TAKE }) };
      const ts = runeWordTargets(card, def);
      for (const w of ws.filter((x) => x !== "HULL" && x !== "DMG")) {
        const t = ts.find((q) => q.word === w);
        expect(t, `${id} ${w}: a target`).toBeDefined();
        expect(t!.text, `${id} ${w}`).toBe(RUNE_WORD_NOTE[w]);
      }
    }
    expect(RUNE_WORD_NOTE.MERGED).toBe(`MERGED: A ★${FUSE_MAX - 1} OR ★${FUSE_MAX} PIECE, MADE BY MERGING COPIES.`);
    expect([...WORD_ONLY].sort()).toEqual(["LOAD", "MERGED", "RIG"]);
  });

  it("FRAY's and BURN's word notes carry their glossary rows' numbers (the sim's constants), and every rune card's box holds them whole on every view", () => {
    expect(RUNE_WORD_NOTE.FRAY).toBe(`FRAY: EACH ONE ADDS +${FRAY_BONUS} DAMAGE TO EVERY LATER SHOT ON THE HULL. MAX ${FRAY_MAX}.`);
    expect(RUNE_WORD_NOTE.BURN).toBe(`BURN: EACH ONE DEALS ${BURN_DPS} HULL DAMAGE A SEC FOR ${BURN_TIME} SEC.`);
    expect([FRAY_BONUS, FRAY_MAX, BURN_DPS, BURN_TIME]).toEqual([2, 15, 10, 3]);
    let n = 0;
    for (const [name, w, h, dpr] of [...PHONES, DESK]) {
      const f = framed(w, h, dpr, 0), cardW = Math.min(f.W - 8, 300);
      for (const def of Object.values(RUNES) as RuneDef[]) {
        for (const k of runeKeywords(def)) {
          const t = runeWordText(def, k);
          expect(t.startsWith(`${KEYWORD_WORD[k]}: `), `${def.id} ${k}`).toBe(true);
          const card = { x: 4, y: 40, w: cardW, h: runeCardH(def, cardW, { reminder: true, hint: PICK_TAKE, tap: dpr > 1 ? f.tap : 0 }) };
          const box = runeWordBoxOn(card, def, KEYWORD_WORD[k])!;
          expect(box.y >= card.y + 31 && box.y + box.h <= card.y + card.h, `${name} ${def.id} ${KEYWORD_WORD[k]}: the box in the card`).toBe(true);
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(400);
    void lineText; void runeCardTextW;
  });
});

import { AMMO, HEROES } from "../src/sim/content";
import { PLATE_PER_SLUG } from "../src/sim/races/bastion";
import { RUNE_SOURCE, runeSourceLine } from "../src/ui/runeText";
import { runeNoteLines } from "../src/ui/runeBar";
import { gameWords } from "../src/ui/gameWords";
import { wrapRich } from "../src/ui/richText";

describe("CARD-4 run 3 (i): the rune source lines (REQ-BFG-081; ref/open1 REPORT-OPEN1 sections 4 and 9; RESTART-RUN3 2 (c), cap's words)", () => {
  // OPEN-1 section 4's 16 part-keyed runes by family (ref/open1/REPORT-OPEN1.md, the table's rows), and cap's words
  const OPEN1: Readonly<Record<string, readonly string[]>> = {
    HEAT: ["coal_chute", "heat_sink"],
    FRAY: ["double_knot", "snare_knot", "barbed_silk", "widows_web", "loom_of_woe"],
    PLATE: ["iron_temper", "bulwark_oath"], // the player's SHIELD
    PAIR: ["twin_nails", "molten_bond", "seam_rivets", "hot_seam", "twin_suns", "molten_vows", "twin_salve"],
  };
  const WORDS: Readonly<Record<string, string>> = {
    HEAT: "WORKS WITH A HEAT JACKET OR FURNACE'S KILN.",
    FRAY: "WORKS WITH A BARBED SPOOL OR WEAVER'S LOOM.",
    PLATE: "WORKS WITH A PLATE ROLLER OR BASTION'S WARDWORKS.",
    PAIR: "WORKS WITH A TURRET THAT TAKES IN FROM TWO BELTS.",
  };

  it("one table keyed by rune id holds exactly OPEN-1 section 4's 16 runes, each naming its family's keyword, with cap's words; no other rune has a line", () => {
    const ids = Object.values(OPEN1).flat();
    expect(ids.length).toBe(16);
    expect(Object.keys(RUNE_SOURCE).sort()).toEqual([...ids].sort());
    for (const [fam, list] of Object.entries(OPEN1)) for (const id of list) {
      expect(RUNES[id]?.text, id).toMatch(new RegExp(`\\{\\*?${fam}\\}`));
      expect(runeSourceLine(RUNES[id]), id).toBe(WORDS[fam]);
    }
    for (const def of RUNE_LIST) if (!RUNE_SOURCE[def.id]) expect(runeSourceLine(def), def.id).toBeNull();
  });

  it("each named part and factory gives its family in the sim (the jacket's heat, the spool's fray, the roller's SHIELD gain, each hero's own factory), ten turrets take in from both sides, and the names are the display names", () => {
    const ammo = AMMO as Readonly<Record<string, { rideScale: number; fray: number }>>;
    expect(ITEMS.heatjacket.gate!.heat).toBeGreaterThan(0); // HEAT: +4 a second ridden after it (battle.ts payloadDamage)
    expect(HEROES.furnace.factory).toBe("kiln");
    expect(ammo[ITEMS.kiln.factory!.ammo].rideScale).toBeGreaterThan(0); // the CINDER SLUG heats as it rides
    expect(ITEMS.barbed.gate!.fray).toBeGreaterThan(0); // FRAY: hits add 1
    expect(HEROES.weaver.factory).toBe("loom");
    expect(ammo[ITEMS.loom.factory!.ammo].fray).toBeGreaterThan(0); // THREAD SLUGs fray on hit
    expect(ITEMS.plateroller.gate!.plate).toBeGreaterThan(0); // the SHIELD (internal plate) it rolls on per load
    expect(HEROES.bastion.factory).toBe("wardworks");
    expect(ITEMS.wardworks.factory!.ammo).toBe("bulwark");
    expect(PLATE_PER_SLUG).toBeGreaterThan(0); // each BULWARK SLUG shields the hull as it arrives
    const both = Object.values(ITEMS).filter((d) => d.turret?.intake === "both").map((d) => d.name);
    expect(both.length, both.join(", ")).toBe(10); // so the PAIR line names the kind, not one part
    for (const s of new Set(Object.values(RUNE_SOURCE))) {
      const id = Object.keys(RUNE_SOURCE).find((k) => RUNE_SOURCE[k] === s)!, line = runeSourceLine(RUNES[id])!;
      if (s.twoBelts) continue;
      expect(line).toBe(`WORKS WITH A ${ITEMS[s.part!].name} OR ${HEROES[s.hero!].name}'S ${ITEMS[s.factory!].name}.`);
      expect(HEROES[s.hero!].factory, id).toBe(s.factory);
    }
  });

  it("the line rides the notes only (under the reminder: the room, the note box and the word boxes count it), never the face; never ONLY; the player's words; it fits every view", () => {
    const lines: string[] = [];
    for (const [name, w, h, dpr] of [...PHONES, DESK]) {
      const f = framed(w, h, dpr, 0), cardW = Math.min(f.W - 8, 300), tw = runeCardTextW(cardW);
      let most = 0;
      for (const id of Object.keys(RUNE_SOURCE)) {
        const def = RUNES[id], line = runeSourceLine(def)!;
        const note = runeNoteLines(def, tw).map(lineText), src = wrapRich([{ t: line, c: "#fff" }], tw, "3").map(lineText);
        expect(note.slice(-src.length), `${name} ${id}`).toEqual(src); // under the reminder, on its own lines
        expect(note.slice(0, note.length - src.length).join(" "), `${name} ${id}`).toBe(runeReminder(def));
        expect(runeTextLines(def, tw).map(lineText).join(" "), `${name} ${id}: not on the face`).not.toContain("WORKS WITH");
        expect(runeCardH(def, cardW, { reminder: true }) - runeCardH(def, cardW, {}), `${name} ${id}: the room`).toBe(1 + note.length * 7);
        most = Math.max(most, src.length);
      }
      expect(most, `${name}: at most two 3x5 lines`).toBeLessThanOrEqual(2);
      lines.push(`${name} (card ${cardW} px, text ${tw}): ${most} line${most > 1 ? "s" : ""}`);
    }
    for (const line of new Set(Object.values(RUNE_SOURCE).map((s) => runeSourceLine(RUNES[Object.keys(RUNE_SOURCE).find((k) => RUNE_SOURCE[k] === s)!])!))) {
      expect(line).not.toMatch(/\bONLY\b/);
      expect(gameWords(line), line).toBe(line); // no old word outside a name (NAMES_KEPT: PLATE ROLLER, WARDWORKS)
    }
    console.log(`CARD-4 run 3 (i): the source line's 3x5 lines per view: ${lines.join("; ")}`);
  });
});
