// C1 (BRIEF-C1 items 1 and 4): what the screens DRAW. drawText is wrapped (every string a screen draws is recorded, with where, then
// drawn as before) and the screens are drawn on a recording canvas with a stand-in Game (tests/run1.screens.draw.test.ts's way).
//  item 1: the title's one small line OFFLINE: PLAYING AGAINST STAND-INS (only with a ghost server set and the device offline; clear of
//          everything else on the title), the NEXT BATTLE card and the dusk's wait card saying OFFLINE STAND-IN at once.
//  item 4: the title's OPTIONS card's FULLSCREEN: ON / OFF row, in the style of its neighbours, only where the browser can do fullscreen,
//          on no other card; the card still fits every screen.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeView, defaultScale } from "../src/core/io";
import { duskFoe } from "../src/game/day";
import type { Game } from "../src/game/game";
import { newRun } from "../src/game/run";
import { FINDING_GHOST, foeNote, OFFLINE_LINE, SOURCE_OFFLINE, setSession, type Session } from "../src/game/session";
import { textWidth } from "../src/render/font";
import { type G } from "../src/render/pixel";
import { DuskWaitScreen } from "../src/screens/battle";
import { drawFoe } from "../src/screens/build/inspector";
import { TitleScreen } from "../src/screens/title";
import { titleLayout, titleScale } from "../src/screens/titleLayout";
import { optionsCard } from "../src/ui/hud";
import { UI, type Rect } from "../src/ui/ui";

/** Every string drawText was asked to draw, and where (x, y, the width it returned): hoisted, since the mock factory runs before the imports. */
const drawn = vi.hoisted(() => [] as string[]);
const placed = vi.hoisted(() => [] as { s: string; x: number; y: number; w: number }[]);
vi.mock("../src/render/font", async (importOriginal) => {
  const m = await importOriginal<typeof import("../src/render/font")>();
  return {
    ...m,
    drawText: (...a: Parameters<typeof m.drawText>) => {
      const w = m.drawText(...a);
      drawn.push(String(a[1]));
      placed.push({ s: String(a[1]), x: Number(a[2]), y: Number(a[3]), w });
      return w;
    },
  };
});

// ------------------------------------------------------------ a recording canvas (run1.screens.draw.test.ts's)
interface RecCanvas { width: number; height: number; calls: string[]; getContext: () => G }
function recCanvas(): RecCanvas {
  const c: RecCanvas = { width: 0, height: 0, calls: [], getContext: () => g };
  const st: Record<string, unknown> = {
    canvas: c, fillStyle: "#000000", strokeStyle: "#000000", globalAlpha: 1, imageSmoothingEnabled: false, lineWidth: 1,
    globalCompositeOperation: "source-over", font: "10px sans-serif", textAlign: "start", textBaseline: "alphabetic", filter: "none",
  };
  const g = new Proxy(st, {
    get(t, k) {
      if (typeof k !== "string") return undefined;
      if (k in t) return t[k];
      if (k === "getImageData" || k === "createImageData") return (_x: number, _y: number, w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h });
      if (k === "measureText") return () => ({ width: 0 });
      if (k === "createLinearGradient" || k === "createRadialGradient" || k === "createPattern") return () => ({ addColorStop() {} });
      return () => { c.calls.push(k); };
    },
    set(t, k, v) {
      if (typeof k === "string") t[k] = v;
      return true;
    },
  }) as unknown as G;
  return c;
}

/** The fake document: a canvas factory (sprites), and the Fullscreen API as the test sets it. */
const fsCalls = { request: 0, exit: 0 };
function stubDocument(fullscreenEnabled: boolean | undefined, fullscreenElement: unknown = null): void {
  vi.stubGlobal("document", {
    createElement: () => recCanvas(), fullscreenEnabled, fullscreenElement,
    documentElement: { requestFullscreen: () => { fsCalls.request++; return Promise.resolve(); } },
    exitFullscreen: () => { fsCalls.exit++; return Promise.resolve(); },
  });
}

beforeAll(() => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined, removeItem: () => undefined, key: () => null, length: 0, clear: () => undefined });
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  drawn.length = 0;
  placed.length = 0;
  fsCalls.request = fsCalls.exit = 0;
  stubDocument(undefined);
});
afterEach(() => {
  setSession(null);
  vi.stubGlobal("navigator", undefined);
});

/** A ghost server is set (an online session, identity loaded): onlineMode() is true. */
const SESSION: Session = { url: "https://ghosts.example", active: true, failed: false, tick() {}, settle() {}, submitDusk() {}, countRun() {} };
const network = (onLine: boolean | undefined): void => void vi.stubGlobal("navigator", onLine === undefined ? undefined : { onLine });

const VIEWS: [string, number, number, number][] = [
  ["iPhone 390x844 @3", 390, 844, 3], ["iPhone SE 375x667 @2", 375, 667, 2], ["iPhone on its side 844x390 @3", 844, 390, 3],
  ["Android 360x640 @3", 360, 640, 3], ["desk 1440x900 @1", 1440, 900, 1], ["desk 1440x900 @2", 1440, 900, 2], ["Steam Deck 1280x800 @1", 1280, 800, 1],
  ["small 320x480 @2", 320, 480, 2],
];

/** A stand-in Game on a title view (its scale and button factor k as the game computes them). */
function titleGame(w: number, h: number, dpr: number) {
  const view = computeView(w, h, dpr, (pw, ph, p) => titleScale(pw, ph, p, dpr));
  const audio = { mode: 0 } as unknown;
  const game = { run: null, audio, view, W: view.W, H: view.H, portrait: view.portrait, t: 0, ui: new UI(), canvas: recCanvas(), toast() {}, go() {}, error() {}, soundButton() {}, cycleSound() {}, openName() {}, transitioning: false } as unknown as Game;
  const k = defaultScale(Math.floor(w * dpr), Math.floor(h * dpr), view.portrait) / view.scale;
  return { game, view, k };
}

function drawTitle(w = 402, h = 690, dpr = 3, menu = false): { strings: string[]; spots: typeof placed; game: Game; s: TitleScreen } {
  const { game, view } = titleGame(w, h, dpr);
  const s = new TitleScreen(game);
  s.pickScale(Math.floor(w * dpr), Math.floor(h * dpr), view.portrait);
  (s as unknown as { menu: boolean }).menu = menu;
  for (let i = 0; i < 3; i++) s.update(1 / 60);
  drawn.length = 0;
  placed.length = 0;
  game.ui.begin();
  s.draw(recCanvas().getContext());
  game.ui.end();
  return { strings: [...drawn], spots: [...placed], game, s };
}

describe("C1 item 1: the title's offline line", () => {
  it("is drawn once, at the bottom left, only with a ghost server set and the device offline", () => {
    setSession(SESSION);
    network(false);
    const off = drawTitle();
    expect(off.strings.filter((s) => s === OFFLINE_LINE)).toHaveLength(1);
    const at = off.spots.find((p) => p.s === OFFLINE_LINE)!;
    expect([at.x, at.y]).toEqual([4, off.game.H - 8]);
    network(true);
    expect(drawTitle().strings).not.toContain(OFFLINE_LINE); // online: the title is as it was
    network(undefined);
    expect(drawTitle().strings).not.toContain(OFFLINE_LINE); // no navigator
    setSession(null);
    network(false);
    expect(drawTitle().strings).not.toContain(OFFLINE_LINE); // no ghost server (0.6.2's own offline play): nothing to say
    expect(OFFLINE_LINE).toBe("OFFLINE: PLAYING AGAINST STAND-INS");
  });

  it("the line changes with the events' truth at the next frame: offline then online again, no state kept", () => {
    setSession(SESSION);
    network(false);
    expect(drawTitle().strings).toContain(OFFLINE_LINE);
    network(true); // the `online` event: the next draw reads navigator.onLine afresh
    expect(drawTitle().strings).not.toContain(OFFLINE_LINE);
  });

  it("everything else on the title draws exactly the same online and offline (only the one line is added)", () => {
    setSession(SESSION);
    network(true);
    const on = drawTitle().strings;
    network(false);
    const off = drawTitle().strings;
    expect(off.filter((s) => s !== OFFLINE_LINE)).toEqual(on);
    expect(off).toHaveLength(on.length + 1);
  });

  it("fits on every screen: left of the version line, below the command panel and clear of both cruisers", () => {
    const wide = textWidth(OFFLINE_LINE, "3");
    const meets = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    for (const [what, w, h, dpr] of VIEWS) {
      const { view, k } = titleGame(w, h, dpr);
      for (const save of [false, true]) {
        const L = titleLayout(view.W, view.H, view.portrait, save, k);
        const line: Rect = { x: 3, y: view.H - 9, w: wide + 2, h: 7 }; // the 3x5 face with its 1 px outline, at (4, H - 8)
        expect(line.x + line.w + 4, `${what}: left of the version line`).toBeLessThanOrEqual(L.version.x);
        expect(L.panel.y + L.panel.h, `${what}: below the panel`).toBeLessThanOrEqual(line.y);
        for (const hull of L.hulls) expect(meets(line, hull), `${what}: clear of a cruiser`).toBe(false);
        expect(meets(line, L.sound), `${what}: clear of the sound button`).toBe(false);
        expect(line.x + line.w, `${what}: on the screen`).toBeLessThanOrEqual(view.W);
      }
    }
  });
});

describe("C1 item 1: the NEXT BATTLE card and the dusk's wait card say OFFLINE STAND-IN at once", () => {
  const card: Rect = { x: 0, y: 0, w: 200, h: 40 };

  it("the NEXT BATTLE card (inspector.ts drawFoe, the note foeNote gives): online and waiting, FINDING A GHOST...; offline, OFFLINE STAND-IN and the stand-in's name", () => {
    setSession(SESSION);
    const run = newRun("furnace", 99);
    const foe = duskFoe(run, []);
    network(true);
    drawn.length = 0;
    drawFoe(recCanvas().getContext(), foe, card, foeNote(run, foe));
    expect(drawn).toContain(FINDING_GHOST);
    expect(drawn).not.toContain(foe.name); // names no foe yet
    expect(drawn.join("|")).not.toContain(SOURCE_OFFLINE);
    network(false);
    drawn.length = 0;
    drawFoe(recCanvas().getContext(), foe, card, foeNote(run, foe));
    expect(drawn.join("|")).toContain(SOURCE_OFFLINE);
    expect(drawn).toContain(foe.name);
    expect(drawn).not.toContain(FINDING_GHOST);
  });

  it("the dusk's wait card (DuskWaitScreen): FINDING A GHOST... online, OFFLINE STAND-IN offline, never both", () => {
    setSession(SESSION);
    const run = newRun("furnace", 7);
    const game = { run, W: 200, H: 400, go() {} } as unknown as Game;
    const s = new DuskWaitScreen(game);
    network(true);
    drawn.length = 0;
    s.draw(recCanvas().getContext());
    expect(drawn).toContain(FINDING_GHOST);
    expect(drawn).not.toContain(SOURCE_OFFLINE);
    network(false);
    drawn.length = 0;
    s.draw(recCanvas().getContext());
    expect(drawn).toContain(SOURCE_OFFLINE);
    expect(drawn).not.toContain(FINDING_GHOST);
  });
});

// ---------------------------------------------------------------- item 4

/** The OPTIONS card drawn on a title view with `opts`; the regions it registered, by id. */
function drawOptions(w: number, h: number, dpr: number, opts?: { fullscreen?: boolean }, title = "OPTIONS") {
  const { game, view, k } = titleGame(w, h, dpr);
  drawn.length = 0;
  game.ui.begin();
  // M1 (the merge of C1 into IDENT-1): IDENT-1's `extras` (none here) is optionsCard's 7th argument, so C1's `opts` is the 8th
  const card = optionsCard(game, recCanvas().getContext(), title, [{ id: "optdone", label: "DONE", primary: true, onTap() {} }], () => {}, k, undefined, opts);
  game.ui.end();
  const r = (id: string) => game.ui.regions.find((q) => q.id === id);
  return { game, view, k, card, strings: [...drawn], region: r };
}

describe("C1 item 4: the title's OPTIONS card carries a FULLSCREEN row", () => {
  it("where the browser can do fullscreen: FULLSCREEN: OFF (ON in fullscreen), after SOUND and before NAME, a tap toggles it", () => {
    stubDocument(true, null);
    const off = drawOptions(402, 690, 3, { fullscreen: true });
    expect(off.strings).toContain("FULLSCREEN: OFF");
    const fs = off.region("opt-fs")!;
    expect(fs).toBeDefined();
    const y = (id: string) => off.region(id)!.r.y;
    expect([y("optdone"), y("opt-rm"), y("opt-snd"), y("opt-fs"), y("opt-name")].every((v, i, a) => i === 0 || v > a[i - 1])).toBe(true); // in this order
    expect(fs.onTap).toBeTypeOf("function");
    fs.onTap!();
    expect(fsCalls).toEqual({ request: 1, exit: 0 });
    stubDocument(true, {}); // fullscreen now
    const on = drawOptions(402, 690, 3, { fullscreen: true });
    expect(on.strings).toContain("FULLSCREEN: ON");
    expect(on.strings).not.toContain("FULLSCREEN: OFF");
    on.region("opt-fs")!.onTap!();
    expect(fsCalls).toEqual({ request: 1, exit: 1 });
  });

  it("the label follows the browser: Esc leaves fullscreen, the next frame says OFF (read live, no state kept)", () => {
    stubDocument(true, {});
    expect(drawOptions(402, 690, 3, { fullscreen: true }).strings).toContain("FULLSCREEN: ON");
    stubDocument(true, null); // Esc: fullscreenElement is null again
    const after = drawOptions(402, 690, 3, { fullscreen: true }).strings;
    expect(after).toContain("FULLSCREEN: OFF");
    expect(after).not.toContain("FULLSCREEN: ON");
  });

  it("where the browser cannot (fullscreenEnabled false or missing): no row and no region, and the card is exactly the card of 0.9.13", () => {
    const base = drawOptions(402, 690, 3); // no option at all: the card as it was
    for (const enabled of [false, undefined]) {
      stubDocument(enabled);
      const o = drawOptions(402, 690, 3, { fullscreen: true });
      expect(o.region("opt-fs")).toBeUndefined();
      expect(o.strings.join("|")).not.toContain("FULLSCREEN");
      expect(o.card).toEqual(base.card);
      expect(o.strings).toEqual(base.strings);
      expect(o.game.ui.regions.map((q) => [q.id, q.r])).toEqual(base.game.ui.regions.map((q) => [q.id, q.r]));
    }
  });

  it("on no other card: without the option (the PAUSED and build MENU cards pass none) there is no row even where fullscreen works", () => {
    stubDocument(true, null);
    const paused = drawOptions(402, 690, 3, undefined, "PAUSED");
    expect(paused.region("opt-fs")).toBeUndefined();
    expect(paused.strings.join("|")).not.toContain("FULLSCREEN");
    // the call sites: only the title asks for it
    const read = (f: string) => readFileSync(join(new URL("..", import.meta.url).pathname, "src", f), "utf8");
    expect(read("screens/title.ts")).toMatch(/\{ fullscreen: true \}\);/);
    for (const f of ["screens/battle.ts", "screens/event/event.ts", "screens/fork/fork.ts", "screens/build/chrome.ts"]) expect(read(f), f).not.toMatch(/fullscreen/);
  });

  it("the title's own OPTIONS menu draws it (and CLOSE/DONE etc. as before); the row is one more button in the same size and style", () => {
    stubDocument(true, null);
    const t = drawTitle(402, 690, 3, true);
    expect(t.strings).toContain("FULLSCREEN: OFF");
    expect(t.strings).toContain("REDUCED MOTION: OFF");
    expect(t.strings).toContain("SOUND: MUSIC + SFX");
    const by = (id: string) => t.game.ui.regions.find((q) => q.id === id)!.r;
    expect([by("opt-fs").w, by("opt-fs").h]).toEqual([by("opt-snd").w, by("opt-snd").h]); // the same size as SOUND's
    stubDocument(false);
    expect(drawTitle(402, 690, 3, true).strings.join("|")).not.toContain("FULLSCREEN");
  });

  it("the card still fits every screen at the title's scale: inside the view, the new row inside the card, no two buttons overlapping", () => {
    stubDocument(true, null);
    for (const [what, w, h, dpr] of VIEWS) {
      const withRow = drawOptions(w, h, dpr, { fullscreen: true });
      const without = drawOptions(w, h, dpr);
      const { view, card } = withRow;
      expect(card.y, what).toBeGreaterThanOrEqual(0);
      expect(card.y + card.h, what).toBeLessThanOrEqual(view.H);
      expect(card.x, what).toBeGreaterThanOrEqual(0);
      expect(card.x + card.w, what).toBeLessThanOrEqual(view.W);
      // exactly one more button row (bh + 3, bh = ceil(19 k)) taller than the card without it
      const u = (n: number) => Math.ceil(n * withRow.k - 1e-9);
      expect(card.h - without.card.h, what).toBe(u(19) + 3);
      const ids = ["optdone", "opt-rm", "opt-snd", "opt-fs", "opt-name"];
      const rects = ids.map((id) => withRow.region(id)!.r);
      rects.forEach((q, i) => {
        expect(q.x >= card.x && q.y >= card.y && q.x + q.w <= card.x + card.w && q.y + q.h <= card.y + card.h, `${what}: ${ids[i]} inside the card`).toBe(true);
        if (i) expect(q.y, `${what}: ${ids[i]} below ${ids[i - 1]}`).toBeGreaterThanOrEqual(rects[i - 1].y + rects[i - 1].h);
      });
      // the label fits its button
      expect(textWidth("FULLSCREEN: OFF", "3") + 8, what).toBeLessThanOrEqual(rects[3].w);
      expect(defaultScale(Math.floor(w * dpr), Math.floor(h * dpr), view.portrait)).toBeGreaterThan(0);
    }
  });
});
