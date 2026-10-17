// ENCHANT-1 (REQ-BFG-085; BRIEF-ENCHANT1 E4, E5, E7; step 7, the build screen): what the player SEES AND TAPS. A real BuildScreen on a stand-in
// Game (a recording canvas, a real UI, localStorage a Map), the 402x690 @3 phone and the 1280x800 desk:
//   - the ENCHANTER's wagon: two word cards (icon and price), inside the screen, clear of every other target, a finger's size on the phone;
//     the regular cards' rectangles are the layout's own with the wagon there or not, and the switch off (or no wagon today) draws the
//     very same frame;
//   - a tap on a word card selects it (its tap panel: the word, ON A RIG / ON A FACTORY / ON A TURRET, the NOTES, APPLY or NEED nG); a second tap opens APPLY;
//   - APPLY: a legal part takes the word and the gold (4 G) goes only then; a refused part says why and nothing changes; a part that holds a word
//     asks REPLACES FIERY first (CANCEL changes nothing); WIDE on a rig asks for a side; a tap outside any part leaves APPLY;
//   - the warlord pick: its strip (two cards, no price, NO THANKS), a free apply, NO THANKS losing the word;
//   - the merge pick: both words as buttons, the second takes the lost word, nothing else is blocked;
//   - the sell confirm: a piece with a word asks first (SELL? FIERY IS LOST), the second press sells, a plain piece sells on one.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeCanvas, fakeDom, type FakeCanvas } from "./pair1.helpers";
import { setTipsForTests } from "../src/ui/tips";
import { viewWithSub } from "../src/game/viewGrid";
import { BuildScreen } from "../src/screens/build/build";
import { buildLayout } from "../src/screens/build/layout";
import { applyState, sellLabelFor } from "../src/screens/build/apply";
import { targetAt } from "../src/screens/build/enchantStrip";
import { bannerRect, pickView, wagonPlace, wagonView, wordCardAt, wordHits } from "../src/screens/build/enchantStrip";
import { detailsPlan } from "../src/screens/build/inspector";
import { UI, inside, type Rect } from "../src/ui/ui";
import { textWidth } from "../src/render/font";
import { TAP_CSS } from "../src/ui/tap";
import { ENCHANT, ENCHANT_DEFS, setEnchant, withEnchant, type EnchantId } from "../src/sim/enchant";
import { newRun, rollShop, type Run } from "../src/game/run";
import { enchantChoices, openWarlordPick, pendingEnchantPick } from "../src/game/enchanter";
import { setPieceWord } from "../src/game/fuse";
import { itemByUid, occupancy, turretSlots } from "../src/sim/deck";
import { ITEMS } from "../src/sim/content";
import { replacesText, sellAskText } from "../src/sim/enchant";
import { wordFace } from "../src/ui/enchantFaces";
import type { Game } from "../src/game/game";

class MapStore {
  m = new Map<string, string>();
  get length(): number { return this.m.size; }
  key(i: number): string | null { return [...this.m.keys()][i] ?? null; }
  getItem(k: string): string | null { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string): void { this.m.set(k, String(v)); }
  removeItem(k: string): void { this.m.delete(k); }
  clear(): void { this.m.clear(); }
}

let restore: () => void = () => undefined;
beforeAll(() => { restore = fakeDom(); });
afterAll(() => restore());
beforeEach(() => {
  vi.stubGlobal("localStorage", new MapStore());
  setTipsForTests("done"); // no first-run hint strip or first-sight box in the way
});
afterEach(() => {
  vi.unstubAllGlobals();
  setEnchant(ENCHANT);
});

const on = <T,>(fn: () => T): T => withEnchant(fn, true);

type Kind = "mouse" | "touch" | "pen";
interface Rig {
  game: Game & { toasts: string[]; errors: string[]; sounds: string[]; ui: UI };
  screen: BuildScreen;
  run: Run;
}

const VIEWS = {
  phone: [402, 690, 3], desk: [1280, 800, 1],
  // the other views the layout is measured on (tests/zoom1.test.ts VIEWS): a taller phone, the iPhone SE class, the small Android, a
  // landscape phone, a portrait tablet and the wide desk
  "phone-844": [390, 844, 3], "bar-667": [375, 667, 2], "small-568": [320, 568, 2], "small-640": [360, 640, 2], "land-844": [844, 390, 3],
  tablet: [768, 1024, 2], "desk-1080": [1920, 1080, 1], "laptop-768": [1366, 768, 1], "max-932": [430, 932, 3],
} as const;

/** The stand-in Game: a real UI, an audio that records, toasts that record, a view the screen frames (game.ts's own fields BuildScreen reads). */
class FakeGame {
  readonly ui = new UI();
  readonly canvas = { style: {} };
  readonly toasts: string[] = [];
  readonly errors: string[] = [];
  readonly sounds: string[] = [];
  readonly toastLog: string[] = [];
  readonly toasting = false;
  readonly t = 0;
  view: ReturnType<typeof viewWithSub>;
  readonly audio = new Proxy({}, { get: (_t, k) => (k === "play" ? (s: string) => { this.sounds.push(s); } : () => undefined) });
  constructor(public run: Run, w: number, h: number, dpr: number) { this.view = viewWithSub(w, h, dpr); }
  get W(): number { return this.view.W; }
  get H(): number { return this.view.H; }
  get portrait(): boolean { return this.view.portrait; }
  toast(t: string): void { this.toasts.push(t); }
  error(t: string): void { this.toasts.push(t); this.errors.push(t); }
  go(): void {}
  soundButton(): void {}
}

/** A BuildScreen on a stand-in Game, as the game frames it (pickScale and pickSub of the screen itself), its caravan rolled in. */
function rig(run: Run, view: keyof typeof VIEWS = "desk"): Rig {
  const [w, h, dpr] = VIEWS[view];
  const fake = new FakeGame(run, w, h, dpr);
  const game = fake as unknown as Rig["game"];
  const screen = new BuildScreen(game);
  fake.view = viewWithSub(w, h, dpr, screen.pickScale.bind(screen), screen.pickSub.bind(screen));
  screen.enter();
  screen.update(3);
  return { game, screen, run };
}

/** One drawn frame (registers the UI regions as the game does); returns the recording canvas. */
function frame(r: Rig): FakeCanvas {
  const c = fakeCanvas();
  r.game.ui.begin();
  r.screen.draw(c.getContext());
  r.game.ui.end();
  return c;
}

/** A frame as a list of strings (equal lists: equal pictures). */
const sig = (c: FakeCanvas): string[] => c.ops.map((o) => (o.op === "fill" ? `f${o.f.x},${o.f.y},${o.f.w},${o.f.h},${o.f.fill},${o.f.alpha}`
  : o.op === "img" ? `i${o.d.x},${o.d.y},${o.d.alpha},${o.d.img.fills.length}` : `t${o.m.join(",")}`));

/** A press and a release at (x, y), routed as game.ts pointerDown / pointerUp route them (a UI region first, else the screen). */
function tap(r: Rig, x: number, y: number, kind: Kind = "mouse"): string | null {
  const ui = r.game.ui;
  ui.pointer.x = x; ui.pointer.y = y; ui.pointer.down = true; ui.pointer.kind = kind; ui.pressed = null;
  const reg = ui.hit(x, y);
  r.screen.pressed(x, y, reg ? reg.id : null);
  if (reg) {
    if (reg.onDown) reg.onDown(x, y); else ui.pressed = reg.id;
  } else r.screen.down(x, y, kind);
  ui.pointer.down = false;
  const id = ui.pressed;
  ui.pressed = null;
  if (id) {
    const q = ui.hit(x, y);
    if (q && q.id === id && q.onTap) q.onTap();
  } else r.screen.up(x, y);
  return reg ? reg.id : null;
}

const centre = (q: Rect): [number, number] => [Math.round(q.x + q.w / 2), Math.round(q.y + q.h / 2)];

/** Press the button `id` of the last frame (draws first, so the regions are the current ones). */
function press(r: Rig, id: string): void {
  frame(r);
  const reg = r.game.ui.regions.find((q) => q.id === id);
  expect(reg, `button ${id}`).toBeTruthy();
  const [x, y] = centre(reg!.r);
  tap(r, x, y, r.game.ui.pointer.kind); // the same pointer as the last press (a finger's panel keeps its SELL)
}

/** The labels of the open details panel. */
const labels = (r: Rig): string[] => detailsPlan(r.screen, r.screen.sel, null, r.screen.panelArea())?.t.labels ?? [];
const panelLines = (r: Rig): string[] => r.screen.panelInfo()?.lines ?? [];

/** A run on an ENCHANTER day with the wagon's two words set, gold to spare, a rig, a factory and a turret on the deck, cargo. */
function dayRun(words: [EnchantId, EnchantId] = ["fiery", "wide"], day = 3, gold = 20): Run {
  return on(() => {
    const run = newRun("furnace", 7);
    run.day = day;
    run.gold = gold;
    run.shop = { wagons: [], rerolls: 0, discount: 0, free: 0 };
    rollShop(run);
    run.runeDay = undefined;
    run.shop.enchanter = { day, offers: words.map((ench) => ({ ench, price: 4, sold: false })) };
    // a free cell for a rig and one for cargo
    const b = run.build, occ = occupancy(b);
    let spot = -1;
    for (let k = 0; k < 100 && spot < 0; k++) if (occ[k].item < 0 && occ[k].route < 0) spot = k;
    b.items.push({ uid: 900, def: "whetstone", x: spot % 10, y: Math.floor(spot / 10) });
    run.inventory.push({ uid: 901, def: "temper" }, { uid: 902, def: "plating_gear" in ITEMS ? "plating_gear" : firstGear() });
    return run;
  });
}

function firstGear(): string {
  return Object.values(ITEMS).find((d) => d.kind === "mod")!.id;
}

/** The screen centre of the placed piece `uid`. */
function itemAt(r: Rig, uid: number): [number, number] {
  const p = itemByUid(r.run.build, uid)!;
  const c = r.screen.tileCentre(p.x, p.y);
  return [Math.round(c.x), Math.round(c.y)];
}

const card = (r: Rig, i: number, pick = false): Rect => (pick ? pickView(r.screen)!.cards[i].hit : wagonView(r.screen)!.cards[i].hit);

// ------------------------------------------------------------------------------------------------------------------ the wagon's place

describe("ENCHANT-1 step 7: the ENCHANTER's wagon on the build screen", () => {
  for (const view of ["desk", "phone"] as const) {
    it(`${view}: two word cards inside the screen, clear of every other target, the phone's a finger's size`, () => {
      on(() => {
        const r = rig(dayRun(), view);
        frame(r);
        const L = r.screen.L, v = wagonView(r.screen)!;
        expect(v).not.toBeNull();
        expect(v.cards.map((c) => c.id)).toEqual(["fiery", "wide"]);
        expect(v.cards.map((c) => c.price)).toEqual([4, 4]);
        const others: [string, Rect][] = [
          ["bar", L.bar], ["reroll", L.reroll], ["info", L.info], ["cargo", L.cargo], ["fight", L.fight], ["hull", L.hull],
          ...L.cards.map((q, i): [string, Rect] => [`card ${i}`, q]), ...L.packs.map((q, i): [string, Rect] => [`pack ${i}`, q]),
          ...(L.foe ? [["foe", L.foe] as [string, Rect]] : []),
        ];
        const ov = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        for (const c of v.cards) {
          for (const q of [c.rect, c.hit]) {
            expect(q.x >= 0 && q.y >= 0 && q.x + q.w <= L.W && q.y + q.h <= L.H, `${view}: on the screen`).toBe(true);
            for (const [name, o] of others) expect(ov(q, o), `${view}: ${c.id} against ${name}`).toBe(false);
          }
        }
        expect(ov(v.cards[0].hit, v.cards[1].hit)).toBe(false);
        // the wagon's tag sits over the first card on the desk (the multi-row phone has none, as it has none for any merchant)
        expect(!!v.tag).toBe(L.tags);
        if (view === "phone") {
          const k = r.game.view.scale / r.game.view.dpr;
          for (const c of v.cards) {
            expect(c.hit.w * k, "tap width").toBeGreaterThanOrEqual(TAP_CSS);
            expect(c.hit.h * k, "tap height").toBeGreaterThanOrEqual(TAP_CSS);
          }
        }
        expect(wordHits(r.screen)).toHaveLength(2);
      });
    });
  }

  it("every view: the wagon has a place (the margin, else a row under the shop or the top of the details column), on the screen, clear of every target, a finger's size on a phone", () => {
    const where: string[] = [];
    for (const view of Object.keys(VIEWS) as (keyof typeof VIEWS)[]) on(() => {
      const r = rig(dayRun(), view);
      frame(r);
      const L = r.screen.L, v = wagonView(r.screen);
      expect(v, `${view}: a wagon`).not.toBeNull();
      const ov = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      const others: [string, Rect][] = [
        ["bar", L.bar], ["reroll", L.reroll], ["info", L.info], ["cargo", L.cargo], ["fight", L.fight],
        ...L.cards.map((q, i): [string, Rect] => [`card ${i}`, q]), ...L.packs.map((q, i): [string, Rect] => [`pack ${i}`, q]),
        ...(L.foe ? [["foe", L.foe] as [string, Rect]] : []),
        ...(r.screen.cornerMenu ?? []).map((q, i): [string, Rect] => [`menu ${i}`, q]),
      ];
      const k = r.game.view.scale / r.game.view.dpr, phone = r.screen.fingerPx > 0;
      for (const c of v!.cards) for (const q of [c.rect, c.hit]) {
        expect(q.x >= 0 && q.y >= 0 && q.x + q.w <= L.W && q.y + q.h <= L.H, `${view}: ${c.id} on the screen ${JSON.stringify(q)} of ${L.W}x${L.H}`).toBe(true);
        for (const [name, o] of others) expect(ov(q, o), `${view}: ${c.id} ${JSON.stringify(q)} against ${name} ${JSON.stringify(o)}`).toBe(false);
        if (phone && q === c.hit) {
          expect(q.w * k, `${view}: tap width`).toBeGreaterThanOrEqual(TAP_CSS - 0.5);
          expect(q.h * k, `${view}: tap height`).toBeGreaterThanOrEqual(TAP_CSS - 0.5);
        }
      }
      expect(ov(v!.cards[0].hit, v!.cards[1].hit), `${view}: the two targets never meet`).toBe(false);
      // the carrier's hull is never under a word card, except on a portrait screen with no band at all (a 3:4 tablet at scale 7: the
      // layout is already at its minimum, 292 rows for 292 needed): there the row of the wagon lies over the top of the carrier
      if (view !== "tablet") expect(ov(v!.cards[0].rect, L.hull) || ov(v!.cards[1].rect, L.hull), `${view}: clear of the hull ${JSON.stringify([v!.cards.map((c) => c.rect), L.hull, L.info, L.wagon])}`).toBe(false);
      // the corner MENU keeps a finger's square on a phone whose bar is shorter than a finger
      if (r.screen.cornerMenu && phone) {
        const m = r.screen.cornerMenu[0];
        expect(m.h * k, `${view}: the corner MENU's target stays a finger tall`).toBeGreaterThanOrEqual(TAP_CSS - 0.5);
      }
      const margin = L.wagon!.shift === 0;
      where.push(`${view}: ${margin ? "margin" : L.portrait ? `row (band ${L.info.h})` : `column (info ${L.info.h})`}`);
      if (view !== "tablet") expect(L.info.h, `${view}: the details area is left`).toBeGreaterThan(20); // (the tablet's band is 0 high with or without the wagon)
    });
    console.log(`ENCHANT-1 wagon places:\n${where.join("\n")}`);
  });

  it("the regular cards are the layout's own with the wagon there, absent or off: the rectangles do not move", () => {
    for (const view of ["desk", "phone"] as const) {
      const a = on(() => { const r = rig(dayRun(), view); frame(r); return JSON.stringify([r.screen.L.cards, r.screen.L.reroll, r.screen.L.packs, r.screen.L.info, r.screen.L.cargo, r.screen.L.fight, r.screen.L.hull]); });
      const b = on(() => { const r = rig(dayRun(["fiery", "wide"], 2), view); frame(r); return JSON.stringify([r.screen.L.cards, r.screen.L.reroll, r.screen.L.packs, r.screen.L.info, r.screen.L.cargo, r.screen.L.fight, r.screen.L.hull]); });
      const off = (() => { const r = rig(dayRun(), view); frame(r); return JSON.stringify([r.screen.L.cards, r.screen.L.reroll, r.screen.L.packs, r.screen.L.info, r.screen.L.cargo, r.screen.L.fight, r.screen.L.hull]); })();
      expect(a, `${view}: wagon day vs no wagon`).toBe(b);
      expect(off, `${view}: switch off`).toBe(a);
    }
    // wagonRects reads the layout and moves none of it
    const L = buildLayout(640, 400, false, 5);
    const before = JSON.stringify(L);
    expect(wagonPlace(L, 2, 0)).not.toBeNull();
    expect(JSON.stringify(L)).toBe(before);
  });

  it("with the switch off, or on a day with no wagon, the very same frame is drawn and no word target exists", () => {
    for (const view of ["desk", "phone"] as const) {
      const run = dayRun(["fiery", "wide"], 2); // day 2: no ENCHANTER (the helper's override removed below)
      delete run.shop.enchanter;
      const frames = [false, true].map((enchant) => withEnchant(() => { const r = rig(run, view); const c = frame(r); expect(wordHits(r.screen)).toEqual([]); expect(wagonView(r.screen)).toBeNull(); return sig(c); }, enchant));
      expect(frames[0], view).toEqual(frames[1]);
      expect(frames[0].length).toBeGreaterThan(100);
    }
  });

  it("the wagon draws: its tag on the desk, a card's icon and 4 for the price, a sold card dim and unpriced", () => {
    on(() => {
      const r = rig(dayRun(), "desk");
      const v = wagonView(r.screen)!;
      const c = frame(r);
      // the frame with the wagon is longer than the same frame without it (two more cards, their tag and their prices)
      const without = JSON.parse(JSON.stringify(r.run.shop.enchanter));
      delete r.run.shop.enchanter;
      const bare = frame(r);
      r.run.shop.enchanter = without;
      expect(sig(c).length).toBeGreaterThan(sig(bare).length + 20);
      expect(v.tag).not.toBeNull();
      r.run.shop.enchanter!.offers[0].sold = true;
      const sold = frame(r);
      expect(sig(sold)).not.toEqual(sig(c));
      expect(wordCardAt(r.screen, ...centre(v.cards[0].hit))).toBeNull(); // a sold card takes no press
      expect(wordCardAt(r.screen, ...centre(v.cards[1].hit))?.i).toBe(1);
    });
  });
});

// ------------------------------------------------------------------------------------------------------------------ the word card's panel

describe("ENCHANT-1 step 7: a word card's tap panel", () => {
  it("a tap selects the card: the word in its colour, one line for each kind, the NOTES on demand, APPLY", () => {
    for (const view of ["desk", "phone"] as const) on(() => {
      const r = rig(dayRun(["massive", "fiery"]), view);
      frame(r);
      tap(r, ...centre(card(r, 0)), view === "phone" ? "touch" : "mouse");
      expect(r.screen.sel).toEqual({ kind: "word", pick: false, i: 0 });
      frame(r);
      const info = r.screen.panelInfo()!;
      expect(info.title).toBe("MASSIVE");
      expect(info.labels).toEqual(["APPLY"]);
      const f = wordFace("massive");
      expect(info.lines.join(" | ")).toContain("NOT ON A RIG");
      expect(info.lines.join(" ")).toContain("ON A FACTORY");
      expect(info.lines.join(" ")).toContain("ON A TURRET");
      expect(f.lines[0].legal).toBe(false);
      expect(info.notes.join(" ")).toContain("ENCHANTED");
      expect(info.notes.length).toBe(f.notes.length);
    });
  });

  it("all eight words: the panel prints each kind's line (no `[...]` markup left: the icons are drawn), NOT ON A RIG where it is true, the NOTES, and a name in the word's colour", () => {
    for (const view of ["desk", "phone"] as const) on(() => {
      for (const [a, b] of [["fiery", "rising"], ["growing", "echoing"], ["massive", "swift"], ["wide", "braced"]] as const) {
        const r = rig(dayRun([a, b]), view);
        for (const [i, id] of [a, b].entries()) {
          r.screen.select({ kind: "word", pick: false, i });
          frame(r);
          const info = r.screen.panelInfo()!, f = wordFace(id);
          expect(info.title, `${view} ${id}`).toBe(ENCHANT_DEFS[id].name);
          const text = info.lines.join(" ");
          expect(text, `${view} ${id}: no markup`).not.toMatch(/[\[\]]/);
          for (const l of f.lines) expect(text, `${view} ${id}: ${l.label}`).toContain(l.label);
          expect(info.notes.length, `${view} ${id}: NOTES`).toBe(f.notes.length);
          expect(f.color).toBe(ENCHANT_DEFS[id].color);
        }
      }
    });
  });

  it("short of gold the button is dim and says NEED nG; a second tap on the card says so and opens nothing", () => {
    on(() => {
      const r = rig(dayRun(["fiery", "wide"], 3, 1), "desk");
      frame(r);
      tap(r, ...centre(card(r, 0)));
      expect(labels(r)).toEqual(["NEED 3G"]);
      tap(r, ...centre(card(r, 0)));
      expect(applyState(r.screen)).toBeNull();
      expect(r.game.errors.at(-1)).toBe("NEED 3 MORE GOLD");
      expect(r.run.gold).toBe(1);
    });
  });
});

// ------------------------------------------------------------------------------------------------------------------ APPLY

describe("ENCHANT-1 step 7: APPLY", () => {
  const open = (r: Rig, i = 0, kind: Kind = "mouse"): void => {
    frame(r);
    tap(r, ...centre(card(r, i)), kind);
    frame(r);
    tap(r, ...centre(card(r, i)), kind);
    frame(r);
  };

  it("a second tap on the selected card opens APPLY (so does the APPLY button); every legal part glows, the refused ones do not", () => {
    on(() => {
      const r = rig(dayRun(["massive", "fiery"]), "desk");
      open(r, 0);
      const st = applyState(r.screen)!;
      expect(st.word).toBe("massive");
      expect(st.line).toBe("TAP A GLOWING PART");
      const rows = enchantChoices(r.run, "massive");
      expect(rows.some((c) => c.reason === null)).toBe(true);
      expect(rows.find((c) => c.target.kind === "item" && c.target.uid === 900)!.reason).toBe("NOT ON A RIG");
      expect(labels(r)).toEqual(["CANCEL"]);
      // the glow draws (the same frame without APPLY has fewer ops)
      const withGlow = sig(frame(r)).length;
      press(r, "applycancel");
      expect(applyState(r.screen)).toBeNull();
      expect(sig(frame(r)).length).toBeLessThan(withGlow);
      // the button opens it too
      press(r, "apply");
      expect(applyState(r.screen)?.word).toBe("massive");
    });
  });

  it("a legal part takes the word and the 4 G goes only then: on a factory (desk) and on a rig (phone, by a finger beside it)", () => {
    for (const [view, kind] of [["desk", "mouse"], ["phone", "touch"]] as const) on(() => {
      const run = dayRun(["fiery", "wide"]);
      const r = rig(run, view);
      open(r, 0, kind);
      const gold = run.gold;
      const [x, y] = itemAt(r, 900);
      const sound = r.game.sounds.length;
      tap(r, x, y, kind);
      expect(itemByUid(run.build, 900)!.ench).toBe("fiery");
      expect(run.gold).toBe(gold - 4);
      expect(run.shop.enchanter!.offers[0].sold).toBe(true);
      expect(applyState(r.screen)).toBeNull(); // APPLY closed
      expect(r.screen.sel).toEqual({ kind: "item", uid: 900 }); // the part shown
      expect(r.game.sounds.slice(sound)).toContain("coin"); // the gold's sound (actions.ts buy())
      expect(r.game.toasts.at(-1)).toBe("FIERY WHETSTONE");
      expect(run.shop.enchanter!.offers[1].sold).toBe(false);
    });
  });

  it("a finger a little off a part still finds it (the nearest part within half a finger of its box), a press past that reaches no part and leaves APPLY", () => {
    on(() => {
      const run = dayRun(["fiery", "wide"]);
      run.build.items = [{ uid: 900, def: "whetstone", x: 5, y: 5 }]; // one rig alone on the deck: nothing else is near it
      run.build.routes = [];
      const r = rig(run, "phone");
      open(r, 0, "touch");
      r.game.ui.pointer.kind = "touch";
      const box = r.screen.itemScreenRect(run.build.items[0]), reach = Math.ceil(r.screen.fingerPx / 2);
      expect(r.screen.fingerPx).toBeGreaterThan(0);
      const cy = box.y + box.h / 2;
      // the part's own box is smaller than a finger on this phone (the reason APPLY reaches beyond it)
      expect(Math.min(box.w, box.h) * (r.game.view.scale / r.game.view.dpr)).toBeLessThan(TAP_CSS);
      const at = (x: number, y: number) => targetAt(r.screen, x, y);
      expect(at(box.x + box.w / 2, cy)).toEqual({ kind: "item", uid: 900 }); // on it
      expect(at(box.x + box.w + reach - 2, cy), "just inside the reach, right").toEqual({ kind: "item", uid: 900 });
      expect(at(box.x - reach + 2, cy), "left").toEqual({ kind: "item", uid: 900 });
      expect(at(box.x + box.w / 2, box.y + box.h + reach - 2), "below").toEqual({ kind: "item", uid: 900 });
      expect(at(box.x + box.w / 2, box.y - reach + 2), "above").toEqual({ kind: "item", uid: 900 });
      expect(at(box.x + box.w + reach + 3, cy), "past the reach: no part").toBeNull();
      // a mouse has no such reach: the same press beside the part lands on nothing
      r.game.ui.pointer.kind = "mouse";
      expect(at(box.x + box.w + reach - 2, cy)).toBeNull();
      r.game.ui.pointer.kind = "touch";
      // a tap inside the reach applies the word; a tap past it leaves APPLY with the gold untouched
      tap(r, Math.round(box.x + box.w + reach - 2), Math.round(cy), "touch");
      expect(itemByUid(run.build, 900)!.ench).toBe("fiery");
      expect(run.gold).toBe(16);
      const r2 = rig(dayRun(["fiery", "wide"]), "phone");
      r2.run.build.items = [{ uid: 900, def: "whetstone", x: 5, y: 5 }];
      r2.run.build.routes = [];
      open(r2, 0, "touch");
      const b2 = r2.screen.itemScreenRect(r2.run.build.items[0]);
      tap(r2, Math.round(b2.x + b2.w + reach + 3), Math.round(b2.y + b2.h / 2), "touch");
      expect(applyState(r2.screen)).toBeNull();
      expect(r2.run.gold).toBe(20);
      expect(itemByUid(r2.run.build, 900)!.ench).toBeUndefined();
    });
  });

  it("a refused part shows its reason (toast and panel line) and nothing changes: MASSIVE on a rig, gear, WIDE on an X rig", () => {
    on(() => {
      const run = dayRun(["massive", "fiery"]);
      const r = rig(run, "desk");
      open(r, 0);
      const before = JSON.stringify([run.gold, run.build, run.inventory, run.shop]);
      tap(r, ...itemAt(r, 900));
      expect(r.game.errors.at(-1)).toBe("NOT ON A RIG");
      expect(applyState(r.screen)?.line).toBe("NOT ON A RIG");
      expect(panelLines(r).join(" ")).toContain("NOT ON A RIG");
      frame(r);
      // gear in cargo: NOT ON GEAR
      const gi = run.inventory.findIndex((i) => i.uid === 902);
      tap(r, ...centre(r.screen.slotRect(gi)));
      expect(r.game.errors.at(-1)).toBe("NOT ON GEAR");
      expect(JSON.stringify([run.gold, run.build, run.inventory, run.shop])).toBe(before);
      expect(applyState(r.screen)).not.toBeNull(); // still open: a refused tap leaves APPLY open to try another part
    });
  });

  it("the other refusals say why: NO FREE SIDE (WIDE on an X rig), NOT ON A CORE, ALREADY FIERY; each changes nothing", () => {
    on(() => {
      const run = dayRun(["wide", "fiery"]);
      const core = Object.values(ITEMS).find((d) => d.kind === "core")!.id;
      run.inventory.push({ uid: 903, def: core });
      run.build.items.push({ uid: 904, def: "overdrive", x: 8, y: 8 }); // an X rig: four arrows, no free side
      const r = rig(run, "desk");
      open(r, 0);
      const before = JSON.stringify([run.gold, run.build, run.inventory, run.shop]);
      tap(r, ...itemAt(r, 904));
      expect(r.game.errors.at(-1)).toBe("NO FREE SIDE");
      tap(r, ...centre(r.screen.slotRect(run.inventory.findIndex((i) => i.uid === 903))));
      // WIDE on a core in cargo: a core takes no word at all
      expect(r.game.errors.at(-1)).toBe("NOT ON A CORE");
      expect(JSON.stringify([run.gold, run.build, run.inventory, run.shop])).toBe(before);
      // the same word again on a piece that holds it
      press(r, "applycancel");
      setPieceWord(run, 900, { ench: "fiery" });
      open(r, 1);
      tap(r, ...itemAt(r, 900));
      expect(r.game.errors.at(-1)).toBe("ALREADY FIERY");
      expect(applyState(r.screen)?.bad).toBe(true);
      expect(run.gold).toBe(20);
      expect(run.shop.enchanter!.offers[1].sold).toBe(false);
    });
  });

  it("a rolling caravan takes no press on the wagon (the cards slide in at the dawn and stay still through a REROLL)", () => {
    on(() => {
      const run = dayRun();
      const r = rig(run, "desk");
      r.screen.caravan.arrive(7); // rolling in
      frame(r);
      expect(wordCardAt(r.screen, ...centre(wagonView(r.screen)!.cards[0].hit))).toBeNull();
      const slid = wagonView(r.screen)!.cards[0].rect.x;
      r.screen.update(3);
      expect(wagonView(r.screen)!.cards[0].rect.x).toBeLessThan(slid); // it has arrived where the margin puts it
      // a REROLL: the regular cards leave and come back, the wagon does not move
      const home = JSON.stringify(wagonView(r.screen)!.cards.map((c) => c.rect));
      r.screen.doReroll();
      r.screen.update(0.2);
      expect(JSON.stringify(wagonView(r.screen)!.cards.map((c) => c.rect))).toBe(home);
      r.screen.update(3);
      expect(JSON.stringify(wagonView(r.screen)!.cards.map((c) => c.rect))).toBe(home);
    });
  });

  it("the switch off: no word card, no APPLY, no sell confirm (a stray `ench` field is ignored), the editor sees every press", () => {
    const run = on(() => dayRun());
    run.inventory.find((i) => i.uid === 901)!.ench = "fiery"; // a save from a build with the switch on, read with it off
    const r = rig(run, "desk"); // the switch is off here
    frame(r);
    expect(wagonView(r.screen)).toBeNull();
    expect(wordCardAt(r.screen, 5, 30)).toBeNull();
    r.screen.select({ kind: "cargo", uid: 901 });
    frame(r);
    expect(sellLabelFor(r.screen, r.screen.sel)).toBeNull();
    const gold = run.gold;
    press(r, "sell");
    expect(run.inventory.some((i) => i.uid === 901)).toBe(false); // sold on the first press
    expect(run.gold).toBeGreaterThan(gold);
    expect(r.screen.applyInfo()).toBeNull();
    expect(r.screen.wordTargets()).toEqual([]);
  });

  it("a part that holds a word asks REPLACES FIERY first; CANCEL leaves everything; the confirm replaces it and takes the gold", () => {
    on(() => {
      const run = dayRun(["wide", "fiery"]);
      setPieceWord(run, 900, { ench: "fiery" });
      const r = rig(run, "desk");
      open(r, 1); // FIERY would be the same word: ALREADY FIERY
      tap(r, ...itemAt(r, 900));
      expect(r.game.errors.at(-1)).toBe("ALREADY FIERY");
      expect(run.gold).toBe(20);
      // WIDE over FIERY: the replace confirm first
      press(r, "applycancel");
      open(r, 0);
      tap(r, ...itemAt(r, 900));
      // WIDE on a rig with several free sides asks which side first
      expect(applyState(r.screen)!.step).toBe("side");
      expect(applyState(r.screen)!.sides!.length).toBeGreaterThan(1);
      const first = applyState(r.screen)!.sides![0];
      expect(labels(r).length).toBe(applyState(r.screen)!.sides!.length + 1); // one button a side, CANCEL
      expect(run.gold).toBe(20);
      press(r, `applyside${first}`);
      expect(applyState(r.screen)!.step).toBe("replace");
      expect(applyState(r.screen)!.line).toBe(replacesText("fiery"));
      expect(labels(r)).toEqual(["REPLACE", "CANCEL"]);
      expect(itemByUid(run.build, 900)!.ench).toBe("fiery");
      expect(run.gold).toBe(20);
      // CANCEL: back to choosing a part, nothing changed, the gold untouched, the offer not sold
      press(r, "applycancel");
      expect(applyState(r.screen)!.step).toBe("choose");
      expect(itemByUid(run.build, 900)!.ench).toBe("fiery");
      expect(run.gold).toBe(20);
      expect(run.shop.enchanter!.offers[0].sold).toBe(false);
      // again, then confirm
      tap(r, ...itemAt(r, 900));
      press(r, `applyside${first}`);
      press(r, "applyreplace");
      const p = itemByUid(run.build, 900)!;
      expect([p.ench, p.enchDir]).toEqual(["wide", first]);
      expect(run.gold).toBe(16);
      expect(run.shop.enchanter!.offers[0].sold).toBe(true);
      expect(applyState(r.screen)).toBeNull();
    });
  });

  it("WIDE on a rig asks for a side: the free sides are the buttons, the arrow turns with the rig (the side shown is enchDir + rotation)", () => {
    on(() => {
      const run = dayRun(["wide", "fiery"]);
      itemByUid(run.build, 900)!.rot = 1;
      const r = rig(run, "desk");
      open(r, 0);
      tap(r, ...itemAt(r, 900));
      const st = applyState(r.screen)!;
      expect(st.step).toBe("side");
      expect(new Set(labels(r).slice(0, -1)).size).toBe(st.sides!.length); // four distinct directions would be a mistake: one a free side
      expect(labels(r).at(-1)).toBe("CANCEL");
      frame(r); // draws the side arrows on the rig without error
      const side = st.sides![0];
      press(r, `applyside${side}`);
      expect(itemByUid(run.build, 900)!.enchDir).toBe(side);
      expect(run.gold).toBe(16);
    });
  });

  it("WIDE on a rig in cargo asks for a side too, in the rig's own words (FRONT, RIGHT, BACK, LEFT); the word and the side stay on the cargo piece", () => {
    on(() => {
      const run = dayRun(["wide", "fiery"]);
      const r = rig(run, "desk");
      open(r, 0);
      const idx = run.inventory.findIndex((i) => i.uid === 901);
      tap(r, ...centre(r.screen.slotRect(idx)));
      const st = applyState(r.screen)!;
      expect(st.step).toBe("side");
      const names = labels(r).slice(0, -1);
      expect(names.length).toBe(st.sides!.length);
      for (const n of names) expect(["FRONT", "RIGHT", "BACK", "LEFT"]).toContain(n);
      press(r, `applyside${st.sides![0]}`);
      const it = run.inventory.find((i) => i.uid === 901)!;
      expect([it.ench, it.enchDir]).toEqual(["wide", st.sides![0]]);
      expect(run.gold).toBe(16);
      expect(r.screen.sel).toEqual({ kind: "cargo", uid: 901 }); // the piece shown, still in cargo
    });
  });

  it("a tap outside any part leaves APPLY with the gold untouched; Escape backs out a step at a time", () => {
    on(() => {
      const run = dayRun(["fiery", "wide"]);
      const r = rig(run, "desk");
      open(r, 0);
      tap(r, 3, r.screen.L.H - 3); // the sea in the corner
      expect(applyState(r.screen)).toBeNull();
      expect(run.gold).toBe(20);
      expect(run.shop.enchanter!.offers[0].sold).toBe(false);
      open(r, 1);
      expect(applyState(r.screen)).not.toBeNull();
      r.screen.key("Escape");
      expect(applyState(r.screen)).toBeNull();
      expect(r.screen.sel.kind).toBe("word"); // the card stays selected
    });
  });

  it("a REROLL leaves the wagon as it is; another selection closes APPLY", () => {
    on(() => {
      const run = dayRun(["fiery", "wide"]);
      const r = rig(run, "desk");
      open(r, 0);
      r.screen.select({ kind: "cargo", uid: 901 });
      expect(applyState(r.screen)).toBeNull();
      const words = JSON.stringify(run.shop.enchanter);
      r.screen.doReroll();
      expect(JSON.stringify(run.shop.enchanter)).toBe(words);
    });
  });
});

// ------------------------------------------------------------------------------------------------------------------ the warlord pick

describe("ENCHANT-1 step 7: the warlord pick (REFIT's strip)", () => {
  function pickRun(): Run {
    return on(() => {
      const run = dayRun(["fiery", "wide"], 6);
      delete run.shop.enchanter;
      run.stage = "refit";
      openWarlordPick(run, { tier: "hard", id: "rival", day: 6 }, true);
      expect(pendingEnchantPick(run)).not.toBeNull();
      return run;
    });
  }

  it("two word cards without a price and NO THANKS, inside the banner, on the desk and the phone (a finger's size)", () => {
    for (const view of ["desk", "phone"] as const) on(() => {
      const run = pickRun();
      const r = rig(run, view);
      frame(r);
      const v = pickView(r.screen)!;
      expect(v.cards.map((c) => c.id)).toEqual(pendingEnchantPick(run)!.words);
      expect(v.cards.every((c) => c.price === null)).toBe(true);
      const b = bannerRect(r.screen.L);
      for (const q of [...v.lay.cards, v.lay.skip]) expect(q.x >= b.x && q.y >= b.y && q.x + q.w <= b.x + b.w && q.y + q.h <= b.y + b.h, `${view}: inside the banner`).toBe(true);
      expect(inside(b, ...centre(v.lay.skip))).toBe(true);
      expect(r.game.ui.regions.some((q) => q.id === "enchskip")).toBe(true);
      expect(wagonView(r.screen)).toBeNull(); // REFIT has no caravan
      if (view === "phone") {
        const k = r.game.view.scale / r.game.view.dpr;
        for (const c of v.cards) expect(c.hit.h * k).toBeGreaterThanOrEqual(TAP_CSS);
        expect(v.lay.skipHit.h * k).toBeGreaterThanOrEqual(TAP_CSS);
      }
      // the tap panel is the word's, free
      tap(r, ...centre(v.cards[0].hit), view === "phone" ? "touch" : "mouse");
      expect(r.screen.sel).toEqual({ kind: "word", pick: true, i: 0 });
      frame(r);
      expect(labels(r)).toEqual(["APPLY"]);
      expect(r.screen.panelInfo()!.sub).toContain("FREE");
    });
  });

  it("tapping a card opens APPLY; a legal part takes the word for nothing and the pick closes; it survives a save and a reload", () => {
    on(() => {
      const run = pickRun();
      const r = rig(run, "desk");
      frame(r);
      const word = pendingEnchantPick(run)!.words[0];
      const kind0 = tap(r, ...centre(card(r, 0, true)));
      expect(kind0).toBe("enchpick0"); // the card is its own region inside the banner
      frame(r);
      tap(r, ...centre(card(r, 0, true)));
      expect(applyState(r.screen)?.word).toBe(word);
      expect(applyState(r.screen)?.price).toBe(0);
      // a reload: the pick is in the run
      const saved = JSON.parse(JSON.stringify(run)) as Run;
      expect(pendingEnchantPick(saved)?.words).toEqual(pendingEnchantPick(run)!.words);
      const gold = run.gold;
      // pick the part it can go on: a factory takes every word
      const fact = run.build.items.find((p) => ITEMS[p.def].kind === "factory")!;
      const c = r.screen.tileCentre(fact.x, fact.y);
      tap(r, Math.round(c.x), Math.round(c.y));
      expect(itemByUid(run.build, fact.uid)!.ench).toBe(word);
      expect(run.gold).toBe(gold);
      expect(pendingEnchantPick(run)).toBeNull();
      expect(pickView(r.screen)).toBeNull();
    });
  });

  it("NO THANKS closes the pick and the word is lost; nothing is added to the build or the cargo", () => {
    on(() => {
      const run = pickRun();
      const r = rig(run, "phone");
      const before = JSON.stringify([run.build, run.inventory, run.gold]);
      press(r, "enchskip");
      expect(pendingEnchantPick(run)).toBeNull();
      expect(JSON.stringify([run.build, run.inventory, run.gold])).toBe(before);
      frame(r);
      expect(pickView(r.screen)).toBeNull();
    });
  });
});

// ------------------------------------------------------------------------------------------------------------------ the merge pick

describe("ENCHANT-1 step 7: the merge pick", () => {
  function mergeRun(): Run {
    return on(() => {
      const run = dayRun(["fiery", "wide"]);
      setPieceWord(run, 900, { ench: "fiery" });
      run.enchMerge = { uid: 900, kept: { ench: "fiery" }, lost: { ench: "rising" } };
      return run;
    });
  }

  it("both words as buttons in their colours; the second takes the lost word; the first keeps the survivor's", () => {
    for (const view of ["desk", "phone"] as const) {
      on(() => {
        const run = mergeRun();
        const r = rig(run, view);
        frame(r);
        const keep = r.game.ui.regions.find((q) => q.id === "mergekeep"), take = r.game.ui.regions.find((q) => q.id === "mergetake");
        expect(keep && take, view).toBeTruthy();
        const ov = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(ov(keep!.r, take!.r)).toBe(false);
        for (const q of [keep!.r, take!.r]) expect(q.x >= 0 && q.y >= 0 && q.x + q.w <= r.screen.L.W && q.y + q.h <= r.screen.L.H, `${view}: on the screen`).toBe(true);
        if (view === "phone") {
          const k = r.game.view.scale / r.game.view.dpr;
          expect(keep!.r.h * k).toBeGreaterThanOrEqual(TAP_CSS);
        }
        press(r, "mergetake");
        expect(run.enchMerge).toBeUndefined();
        expect(itemByUid(run.build, 900)!.ench).toBe("rising");
      });
      on(() => {
        const run = mergeRun();
        const r = rig(run, view);
        press(r, "mergekeep");
        expect(run.enchMerge).toBeUndefined();
        expect(itemByUid(run.build, 900)!.ench).toBe("fiery");
        frame(r);
        expect(r.game.ui.regions.some((q) => q.id === "mergekeep")).toBe(false);
      });
    }
  });

  it("it does not block anything: FIGHT, a selection and a word card still work with the prompt up", () => {
    on(() => {
      const run = mergeRun();
      const r = rig(run, "desk");
      frame(r);
      expect(r.game.ui.regions.some((q) => q.id === "fight")).toBe(true);
      tap(r, ...centre(card(r, 0)));
      expect(r.screen.sel.kind).toBe("word");
      expect(run.enchMerge).toBeDefined(); // untouched by other taps
      expect(r.screen.L.info.y).toBeGreaterThan(buildLayout(r.screen.L.W, r.screen.L.H, false, 5).info.y - 1); // the column starts under the prompt
    });
  });
});

// ------------------------------------------------------------------------------------------------------------------ the sell confirm

describe("ENCHANT-1 step 7: the sell confirm", () => {
  it("cargo: the first press arms (SELL? FIERY IS LOST, nothing sold), the second sells at the same price", () => {
    on(() => {
      const run = dayRun();
      run.inventory.find((i) => i.uid === 901)!.ench = "fiery";
      const r = rig(run, "desk");
      r.screen.select({ kind: "cargo", uid: 901 });
      frame(r);
      expect(labels(r)[0]).toMatch(/^SELL \+\d+G$/);
      const price = labels(r)[0];
      const gold = run.gold;
      press(r, "sell");
      expect(run.inventory.some((i) => i.uid === 901)).toBe(true);
      expect(run.gold).toBe(gold);
      frame(r);
      expect(labels(r)[0]).toBe(sellAskText("fiery"));
      expect(sellLabelFor(r.screen, r.screen.sel)).toBe("SELL? FIERY IS LOST");
      press(r, "sell");
      expect(run.inventory.some((i) => i.uid === 901)).toBe(false);
      expect(run.gold).toBe(gold + Number(price.replace(/\D/g, "")));
    });
  });

  it("on a phone the armed label fits its button (the buttons take the row under the sub line instead of overflowing the top row)", () => {
    for (const view of ["phone", "bar-667", "max-932"] as const) on(() => {
      const run = dayRun();
      run.inventory.find((i) => i.uid === 901)!.ench = "fiery";
      const r = rig(run, view);
      r.game.ui.pointer.kind = "touch";
      r.screen.select({ kind: "cargo", uid: 901 });
      const room = (): { w: number; label: string }[] => {
        const d = detailsPlan(r.screen, r.screen.sel, null, r.screen.panelArea())!;
        return d.t.labels.map((label, i) => ({ label, w: d.plan.rects![i].w }));
      };
      for (const b of room()) expect(textWidth(b.label, "3") + 4, `${view}: ${b.label} before`).toBeLessThanOrEqual(b.w);
      press(r, "sell");
      const armed = room();
      expect(armed[0].label).toBe("SELL? FIERY IS LOST");
      for (const b of armed) expect(textWidth(b.label, "3") + 4, `${view}: ${b.label} armed`).toBeLessThanOrEqual(b.w);
    });
  });

  it("a plain piece sells on one press", () => {
    on(() => {
      const run = dayRun();
      const r = rig(run, "desk");
      r.screen.select({ kind: "cargo", uid: 901 });
      const gold = run.gold;
      press(r, "sell");
      expect(run.inventory.some((i) => i.uid === 901)).toBe(false);
      expect(run.gold).toBeGreaterThan(gold);
    });
  });

  it("the armed state clears when the selection changes and after a few seconds", () => {
    on(() => {
      const run = dayRun();
      run.inventory.find((i) => i.uid === 901)!.ench = "fiery";
      const r = rig(run, "desk");
      r.screen.select({ kind: "cargo", uid: 901 });
      press(r, "sell");
      expect(sellLabelFor(r.screen, r.screen.sel)).not.toBeNull();
      r.screen.select({ kind: "cargo", uid: 902 });
      r.screen.select({ kind: "cargo", uid: 901 });
      expect(sellLabelFor(r.screen, r.screen.sel)).toBeNull();
      press(r, "sell");
      expect(sellLabelFor(r.screen, r.screen.sel)).not.toBeNull();
      r.screen.update(4);
      expect(sellLabelFor(r.screen, r.screen.sel)).toBeNull();
      press(r, "sell"); // arms again, nothing sold
      expect(run.inventory.some((i) => i.uid === 901)).toBe(true);
    });
  });

  it("a placed piece (touch) and an installed turret ask the same way; the signature factory has no SELL", () => {
    on(() => {
      const run = dayRun();
      setPieceWord(run, 900, { ench: "fiery" });
      const r = rig(run, "phone");
      r.game.ui.pointer.kind = "touch"; // a finger: the placed part's panel offers SELL
      r.screen.select({ kind: "item", uid: 900 });
      frame(r);
      expect(labels(r).at(-1)).toMatch(/^SELL \+/);
      const gold = run.gold;
      press(r, "sellpart");
      expect(itemByUid(run.build, 900)).toBeTruthy();
      expect(run.gold).toBe(gold);
      press(r, "sellpart");
      expect(itemByUid(run.build, 900)).toBeUndefined();
      expect(run.gold).toBeGreaterThan(gold);
      // an installed turret: a bought copy in slot 2 (the starting copy at one star can't be sold)
      run.build.turrets = [{ slot: 0, def: "scrapcannon", uid: 90, free: true }, { slot: 1, def: "bombard", uid: 700, ench: "swift" }];
      r.screen.select({ kind: "turret", index: 1 });
      r.game.ui.pointer.kind = "mouse";
      frame(r);
      expect(labels(r).find((l) => l.startsWith("SELL"))).toMatch(/^SELL \+\d+G$/);
      const g2 = run.gold;
      press(r, "turretsell");
      expect(turretSlots(run.build)[1].turret).toBeTruthy(); // not sold
      expect(run.gold).toBe(g2);
      frame(r);
      expect(labels(r).find((l) => l.startsWith("SELL"))).toBe(sellAskText("swift"));
      press(r, "turretsell");
      expect(turretSlots(run.build)[1].turret).toBeUndefined(); // sold on the second press
      expect(run.gold).toBeGreaterThan(g2);
      // a plain installed turret sells on one press
      run.build.turrets = [{ slot: 0, def: "scrapcannon", uid: 90, free: true }, { slot: 1, def: "bombard", uid: 701 }];
      r.screen.select({ kind: "turret", index: 1 });
      const g3 = run.gold;
      press(r, "turretsell");
      expect(turretSlots(run.build)[1].turret).toBeUndefined();
      expect(run.gold).toBeGreaterThan(g3);
    });
  });
});
