// M1 (BRIEF-M1 Goal 5): coverage of the merged OPTIONS card. cap merged C1 into IDENT-1 for the base and resolved their one clash, the
// title's OPTIONS card: optionsCard (src/ui/hud.ts) keeps IDENT-1's 7th parameter `extras` and takes C1's `opts: { fullscreen?: boolean }`
// as the 8th; optionsGeometry has a 6th parameter `fullscreen`; the title passes both. No test covered the title's card with IDENT-1's
// rows AND note AND the FULLSCREEN row together. Pinned here, on the four views tests/ident1.ui.test.ts uses and a phone on its side at
// 740x360 @3 (the tightest): the card is fully on screen; its rows run SOUND, FULLSCREEN, NAME, LINK A DEVICE, DELETE MY ONLINE DATA, one
// step apart and the same size; the note sits under DELETE; the PAUSED and build MENU cards are unchanged (no FULLSCREEN row, no extras).
// It uses the game's own pieces (computeView, titleScale, optionsGeometry, optionsExtras, the real TitleScreen); the stand-in Game and the
// recording canvas are the small ones tests/ident1.ui.test.ts and tests/c1.screens.test.ts each carry (a test file cannot be imported
// without running it).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { computeView, defaultScale } from "../src/core/io";
import { fullscreenLabel } from "../src/core/fullscreen";
import type { Game } from "../src/game/game";
import { startOnline, stopOnline } from "../src/game/online";
import { setSession } from "../src/game/session";
import type { Identity } from "../src/net/identity";
import { NAME_KEY } from "../src/net/names";
import type { G } from "../src/render/pixel";
import { WORDS, optionsExtras, type Availability } from "../src/screens/linkCards";
import { TitleScreen, startupSync } from "../src/screens/title";
import { titleScale } from "../src/screens/titleLayout";
import { NOTE_ROW, optionsCard, optionsGeometry } from "../src/ui/hud";
import { UI } from "../src/ui/ui";

// ------------------------------------------------------------ what drawText was asked to draw (the way ident1.ui.test.ts records it)
interface Placed { s: string; left: number; w: number; y: number }
const placed = vi.hoisted(() => [] as Placed[]);
vi.mock("../src/render/font", async (importOriginal) => {
  const m = await importOriginal<typeof import("../src/render/font")>();
  return {
    ...m,
    drawText: (...a: Parameters<typeof m.drawText>) => {
      const w = m.drawText(...a);
      const o = a[5] ?? {};
      const x = Number(a[2]);
      const left = o.align === "center" ? Math.round(x - w / 2) : o.align === "right" ? Math.round(x - w) : Math.round(x);
      placed.push({ s: String(a[1]), left, w, y: Math.round(Number(a[3])) });
      return w;
    },
  };
});
// the title's profile read is a spy here: nothing in this file goes to a server
vi.mock("../src/net/profileSync", async (importOriginal) => {
  const m = await importOriginal<typeof import("../src/net/profileSync")>();
  return { ...m, startupProfileSync: async () => "skipped" as const };
});

/** A canvas that records nothing but answers every call (text is recorded through drawText above). */
function recCanvas() {
  const c: { width: number; height: number; getContext: () => G } = { width: 0, height: 0, getContext: () => g };
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
      return () => undefined;
    },
    set(t, k, v) {
      if (typeof k === "string") t[k] = v;
      return true;
    },
  }) as unknown as G;
  return c;
}

/** The page's document as the card reads it: the Fullscreen API (C1's row) and a canvas factory (the title's sprites). */
function stubDocument(fullscreenEnabled: boolean | undefined, fullscreenElement: unknown = null): void {
  vi.stubGlobal("document", { createElement: () => recCanvas(), fullscreenEnabled, fullscreenElement, documentElement: {}, exitFullscreen: () => undefined });
}

const store = new Map<string, string>();
beforeAll(() => {
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k),
    key: () => null, length: 0, clear: () => store.clear(),
  });
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  placed.length = 0;
  store.clear();
  store.set(NAME_KEY, "ANNA"); // the name gate is passed, so the NAME row reads NAME: ANNA
  startupSync.done = false;
  stubDocument(true);
});
afterEach(() => {
  stopOnline();
  setSession(null);
});

// ------------------------------------------------------------ the views, and a stand-in Game on a title view
const NOW = 1_790_000_000_000;
const URL_ = "https://ghosts.example";
const ME: Identity = { playerId: "A".repeat(43), publicKey: new Uint8Array(65), sign: async () => ({ key: "k", sig: "s" }) };

/** tests/ident1.ui.test.ts's four views, and the tightest one: a phone on its side, 740x360 at three device pixels per CSS pixel. */
const VIEWS: [string, number, number, number][] = [
  ["desk 1280x800", 1280, 800, 1], ["op690 402x690 @3", 402, 690, 3], ["small 360x640 @2", 360, 640, 2], ["phone on its side 844x390 @3", 844, 390, 3],
  ["phone on its side 740x360 @3", 740, 360, 3],
];

/** The title's view and its buttons' size factor on a CSS viewport, as the game computes them (TitleScreen.pickScale; intro.title.test.ts). */
function titleView(cssW: number, cssH: number, dpr: number) {
  const v = computeView(cssW, cssH, dpr, (pw, ph, p) => titleScale(pw, ph, p, dpr));
  const pw = Math.floor(cssW * dpr), ph = Math.floor(cssH * dpr);
  const menu = defaultScale(pw, ph, v.portrait);
  return { ...v, menu, k: menu / v.scale, css: v.scale / v.dpr, pw, ph };
}
type TV = ReturnType<typeof titleView>;

function stubGame(tv: TV): Game {
  return {
    run: null, audio: { mode: 0, play: () => undefined, unlock() {}, music() {} }, view: tv, W: tv.W, H: tv.H, portrait: tv.portrait, t: 0, ui: new UI(),
    canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: (tv.W * tv.scale) / tv.dpr, height: (tv.H * tv.scale) / tv.dpr }) },
    toast() {}, error() {}, soundButton() {}, cycleSound() {}, transitioning: false, resize() {}, go() {}, openName() {}, modal: null, openModal() {}, closeModal() {},
  } as unknown as Game;
}

/** One frame: what `f` draws into a recording canvas, the UI regions it registered, and what drawText was asked for. */
function frame(game: Game, f: (g: G) => void): Placed[] {
  placed.length = 0;
  game.ui.begin();
  f(recCanvas().getContext());
  game.ui.end();
  return [...placed];
}

const ON: Availability = { on: true, session: { url: URL_, identity: ME } };
const OFF: [string, Availability][] = [["no session", { on: false, why: WORDS.offNone }], ["failed", { on: false, why: WORDS.offFailed }], ["loading", { on: false, why: WORDS.offLoading }]];
const done = { id: "optdone", label: "DONE", primary: true, onTap: () => undefined };
const ROWS = ["opt-rm", "opt-snd", "opt-fs", "opt-name", "opt-link", "opt-delete"] as const;

describe("M1 Goal 5: the views", () => {
  it("are tests/ident1.ui.test.ts's four, in its order, plus the 740x360 @3 phone on its side", () => {
    const text = readFileSync(new URL("./ident1.ui.test.ts", import.meta.url), "utf8");
    const block = text.slice(text.indexOf("const VIEWS: [string, number, number, number][] = ["), text.indexOf("];", text.indexOf("const VIEWS: [string, number, number, number][] = [")));
    const theirs = [...block.matchAll(/\["([^"]+)", (\d+), (\d+), (\d+)\]/g)].map((m) => [m[1], Number(m[2]), Number(m[3]), Number(m[4])]);
    expect(theirs).toHaveLength(4);
    expect(VIEWS.slice(0, 4)).toEqual(theirs);
    expect(VIEWS[4]).toEqual(["phone on its side 740x360 @3", 740, 360, 3]);
  });
});

describe("M1 Goal 5: the title's OPTIONS card with IDENT-1's rows and note AND C1's FULLSCREEN row, on every view", () => {
  it("is fully on screen; its rows run SOUND, FULLSCREEN, NAME, LINK, DELETE, one step apart, the same size, inside the card; and the geometry is the draw", () => {
    for (const [what, cw, ch, dpr] of VIEWS) {
      const tv = titleView(cw, ch, dpr);
      for (const [state, a] of [["online", ON], ...OFF] as [string, Availability][]) {
        const at = `${what} ${tv.W}x${tv.H} k ${tv.k.toFixed(2)} ${state}`;
        const game = stubGame(tv);
        const extras = optionsExtras(game, () => tv.k, { availability: () => a });
        let card = { x: 0, y: 0, w: 0, h: 0 };
        const drawn = frame(game, (g) => { card = optionsCard(game, g, "OPTIONS", [done], () => undefined, tv.k, extras, { fullscreen: true }); });
        // fully on screen
        expect(card.x >= 0 && card.y >= 0 && card.x + card.w <= tv.W && card.y + card.h <= tv.H, `${at}: card ${JSON.stringify(card)} on ${tv.W}x${tv.H}`).toBe(true);
        // the geometry is the one place the card is computed: the drawn card is optionsGeometry's, with the FULLSCREEN row counted
        const geo = optionsGeometry(tv.W, tv.H, tv.k, 1, extras, true);
        expect(card, at).toEqual(geo.card);
        expect(geo.card.h, at).toBe(18 + 7 * geo.step + 4 + geo.noteLines.length * NOTE_ROW); // DONE, REDUCED MOTION, SOUND, FULLSCREEN, NAME, LINK, DELETE
        expect(geo.card.h - optionsGeometry(tv.W, tv.H, tv.k, 1, extras, false).card.h, at).toBe(geo.step); // FULLSCREEN is exactly one row
        // the rows, in order, one step apart, the same size, inside the card
        const ids = game.ui.regions.map((r) => r.id);
        expect(ids, at).toEqual(["optbg", "optcard", "optdone", ...ROWS]);
        const rows = ROWS.map((id) => game.ui.regions.find((r) => r.id === id)!.r);
        const done_ = game.ui.regions.find((r) => r.id === "optdone")!.r;
        expect(done_.y, at).toBe(card.y + 18);
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          expect(r.y, `${at}: ${ROWS[i]} one step below the one before`).toBe(done_.y + (i + 1) * geo.step);
          expect([r.w, r.h], `${at}: ${ROWS[i]} is a button of the card's own size`).toEqual([geo.bw, geo.bh]);
          expect(r.x >= card.x && r.x + r.w <= card.x + card.w && r.y >= card.y && r.y + r.h <= card.y + card.h, `${at}: ${ROWS[i]} inside the card`).toBe(true);
        }
        // SOUND, FULLSCREEN, NAME, LINK, DELETE are the labels drawn in those rows, each inside its button
        const label = (id: (typeof ROWS)[number], text: string | RegExp) => {
          const r = game.ui.regions.find((x) => x.id === id)!.r;
          const p = drawn.find((x) => (typeof text === "string" ? x.s === text : text.test(x.s)) && x.y >= r.y && x.y < r.y + r.h);
          expect(p, `${at}: ${id} draws ${String(text)}`).toBeTruthy();
          expect(p!.left >= r.x + 2 && p!.left + p!.w <= r.x + r.w - 2, `${at}: "${p!.s}" ${p!.left}..${p!.left + p!.w} inside ${r.x}..${r.x + r.w}`).toBe(true);
        };
        label("opt-snd", /^SOUND: /);
        label("opt-fs", fullscreenLabel(false));
        label("opt-name", "NAME: ANNA");
        label("opt-link", WORDS.linkRow);
        label("opt-delete", WORDS.deleteRow);
        // LINK and DELETE take a tap only while an online session is active; FULLSCREEN always does
        const reg = (id: string) => game.ui.regions.find((x) => x.id === id)!;
        expect(typeof reg("opt-fs").onTap, at).toBe("function");
        expect(typeof reg("opt-link").onTap === "function", at).toBe(a.on);
        expect(typeof reg("opt-delete").onTap === "function", at).toBe(a.on);
        // the note: one plain line under DELETE and inside the card, only while the entries are off
        const del = rows[5];
        if (a.on) {
          expect(geo.noteLines, at).toEqual([]);
          expect(drawn.map((p) => p.s).join("|"), at).not.toMatch(/ONLINE ONLY|CANNOT GO ONLINE|GETTING READY/);
        } else {
          expect(geo.noteLines.join(" "), at).toBe(a.why);
          const lines = drawn.filter((p) => geo.noteLines.includes(p.s));
          expect(lines.map((p) => p.s), `${at}: the note drawn once, line by line`).toEqual(geo.noteLines);
          lines.forEach((p, i) => {
            expect(p.y, `${at}: "${p.s}" is line ${i} of the note, one step below DELETE's top and then NOTE_ROW apart`).toBe(del.y + geo.step + i * NOTE_ROW);
            expect(p.y >= del.y + del.h, `${at}: "${p.s}" under DELETE`).toBe(true);
            expect(p.left >= card.x + 4 && p.left + p.w <= card.x + card.w - 4, `${at}: "${p.s}" inside the card`).toBe(true);
            expect(p.y + 5 <= card.y + card.h, `${at}: "${p.s}" above the card's bottom`).toBe(true);
          });
        }
      }
    }
  });

  it("the tightest view, 740x360 @3, has room to spare: the card runs y 89..272 of 360 with one line of note, and the whole card is on screen with the longest note", () => {
    const tv = titleView(740, 360, 3);
    expect([tv.W, tv.H, tv.k]).toEqual([740, 360, 1]);
    const game = stubGame(tv);
    const longest = [WORDS.offNone, WORDS.offFailed, WORDS.offLoading].map((why) => optionsGeometry(tv.W, tv.H, tv.k, 1, optionsExtras(game, () => tv.k, { availability: () => ({ on: false, why }) }), true).card);
    for (const c of longest) expect(c.y >= 0 && c.y + c.h <= tv.H, JSON.stringify(c)).toBe(true);
    expect(Math.max(...longest.map((c) => c.h))).toBe(183); // cap's fit check at the base: 7 rows of 22, the heading and one note line
    expect(longest[0]).toMatchObject({ y: 89, h: 183 });
    expect(Math.min(...longest.map((c) => tv.H - (c.y + c.h)))).toBeGreaterThan(80); // never under the bottom edge: 88 px spare
  });

  it("the FULLSCREEN row follows the browser: ON when something is fullscreen, OFF when not, and no row (and no gap) where the browser cannot do it", () => {
    const tv = titleView(402, 690, 3);
    for (const [fe, label] of [[null, "FULLSCREEN: OFF"], [{}, "FULLSCREEN: ON"]] as const) {
      stubDocument(true, fe);
      const game = stubGame(tv);
      const drawn = frame(game, (g) => optionsCard(game, g, "OPTIONS", [done], () => undefined, tv.k, optionsExtras(game, () => tv.k, { availability: () => ON }), { fullscreen: true }));
      expect(drawn.map((p) => p.s)).toContain(label);
      expect(drawn.map((p) => p.s)).not.toContain(label === "FULLSCREEN: ON" ? "FULLSCREEN: OFF" : "FULLSCREEN: ON");
      expect(typeof game.ui.regions.find((r) => r.id === "opt-fs")?.onTap).toBe("function"); // a tap toggles it (core/fullscreen.ts toggleFullscreen)
    }
    for (const enabled of [false, undefined]) {
      stubDocument(enabled);
      const game = stubGame(tv);
      let card = { x: 0, y: 0, w: 0, h: 0 };
      const extras = optionsExtras(game, () => tv.k, { availability: () => ON });
      const drawn = frame(game, (g) => { card = optionsCard(game, g, "OPTIONS", [done], () => undefined, tv.k, extras, { fullscreen: true }); });
      expect(game.ui.regions.map((r) => r.id)).toEqual(["optbg", "optcard", "optdone", "opt-rm", "opt-snd", "opt-name", "opt-link", "opt-delete"]);
      expect(drawn.map((p) => p.s).join("|")).not.toMatch(/FULLSCREEN/);
      expect(card).toEqual(optionsGeometry(tv.W, tv.H, tv.k, 1, extras, false).card); // IDENT-1's card, exactly
    }
  });
});

describe("M1 Goal 5: the PAUSED and build MENU cards are unchanged", () => {
  it("no FULLSCREEN row and no extras, even where the browser can do fullscreen: the same rect and rows as before IDENT-1 and C1, on every view", () => {
    for (const [what, cw, ch, dpr] of VIEWS) {
      const tv = titleView(cw, ch, dpr);
      for (const n of [2, 3]) {
        const at = `${what} ${tv.W}x${tv.H} ${n} actions`;
        const game = stubGame(tv);
        const actions = Array.from({ length: n }, (_, i) => ({ id: `act${i}`, label: `ACT ${i}`, onTap: () => undefined }));
        let card = { x: 0, y: 0, w: 0, h: 0 };
        const drawn = frame(game, (g) => { card = optionsCard(game, g, "PAUSED", actions, () => undefined); });
        // the pre-IDENT-1 formula: rows of 19 + 3, three fixed rows (REDUCED MOTION, SOUND, NAME) after the actions
        const bw = Math.min(tv.W - 24, 150), h = 18 + (3 + n) * 22 + 4, w = bw + 20;
        expect(card, at).toEqual({ x: Math.round(tv.W / 2 - w / 2), y: Math.round(tv.H / 2 - h / 2), w, h });
        expect(game.ui.regions.map((r) => r.id), at).toEqual(["optbg", "optcard", ...actions.map((x) => x.id), "opt-rm", "opt-snd", "opt-name"]);
        expect(drawn.map((p) => p.s).join("|"), at).not.toMatch(/FULLSCREEN|LINK|DELETE|ONLINE|SERVER|READY/);
        expect(optionsGeometry(tv.W, tv.H, 1, n).card, at).toEqual(card);
      }
    }
  });

  it("the pause menus' call sites pass neither the extras nor the fullscreen option (the source says so)", () => {
    for (const f of ["src/screens/fork/fork.ts", "src/screens/event/event.ts", "src/screens/battle.ts", "src/screens/build/chrome.ts"]) {
      const text = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
      const at = [...text.matchAll(/optionsCard\(/g)].map((m) => m.index!);
      expect(at.length, f).toBeGreaterThan(0);
      for (const i of at) {
        const call = text.slice(i, i + 900); // the PAUSED card's call: its actions, then its close handler
        expect(call, `${f} at ${i}`).toContain('"PAUSED"');
        expect(call, `${f} at ${i}`).not.toMatch(/fullscreen|optionsExtras|extras/);
      }
    }
    // and the title is the only caller that does, with both, in this order: IDENT-1's extras, then C1's option
    const title = readFileSync(new URL("../src/screens/title.ts", import.meta.url), "utf8");
    expect(title).toMatch(/optionsCard\(game, g, "OPTIONS", \[[^\]]*\], \(\) => \{ this\.menu = false; \}, this\.k, optionsExtras\(game, \(\) => this\.k\), \{ fullscreen: true \}\);/);
  });
});

describe("M1 Goal 5: the real title, with its OPTIONS card open", () => {
  async function titleOn(tv: TV, css: readonly [number, number, number]) {
    const game = stubGame(tv);
    const s = new TitleScreen(game);
    // the title's own scale reads window.devicePixelRatio (none in node): give it this view's, for the call
    const w = globalThis as { window?: unknown };
    const prev = w.window;
    w.window = { devicePixelRatio: css[2] };
    try {
      s.pickScale(tv.pw, tv.ph, tv.portrait);
    } finally {
      w.window = prev;
    }
    (s as unknown as { menu: boolean }).menu = true;
    for (let i = 0; i < 3; i++) s.update(1 / 60);
    return { game, s };
  }
  const flush = async (): Promise<void> => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

  it("on every view, with no session and with an active one: the rows run SOUND, FULLSCREEN, NAME, LINK, DELETE inside the card, and the note appears only without a session", async () => {
    for (const [what, cw, ch, dpr] of VIEWS) {
      for (const online of [false, true]) {
        const tv = titleView(cw, ch, dpr);
        stopOnline();
        if (online) {
          const s = startOnline(URL_, {
            fetchGhost: (async () => { throw new Error("x"); }) as never, submitGhost: (async () => { throw new Error("x"); }) as never,
            identity: async () => ME, store: null, now: () => NOW, save: () => undefined,
          });
          for (let i = 0; i < 50 && s.identity === undefined; i++) await flush();
        }
        const { game, s } = await titleOn(tv, [cw, ch, dpr]);
        const at = `${what} ${tv.W}x${tv.H} ${online ? "online" : "offline"}`;
        const drawn = frame(game, (g) => s.draw(g));
        const regions = game.ui.regions;
        const order = regions.filter((r) => (ROWS as readonly string[]).includes(r.id)).map((r) => r.id);
        expect(order, at).toEqual([...ROWS]);
        const card = regions.find((r) => r.id === "optcard")!.r;
        expect(card.x >= 0 && card.y >= 0 && card.x + card.w <= tv.W && card.y + card.h <= tv.H, `${at}: the title's card on the screen`).toBe(true);
        const ys = ROWS.map((id) => regions.find((r) => r.id === id)!.r.y);
        expect(ys.every((y, i) => i === 0 || y > ys[i - 1]), at).toBe(true);
        expect(drawn.map((p) => p.s), at).toContain("FULLSCREEN: OFF");
        expect(drawn.some((p) => p.s === WORDS.offNone), `${at}: the note says there is no session, only without one`).toBe(!online);
        for (const id of ROWS) {
          const r = regions.find((x) => x.id === id)!.r;
          expect(r.x >= card.x && r.x + r.w <= card.x + card.w && r.y >= card.y && r.y + r.h <= card.y + card.h, `${at}: ${id} inside the card`).toBe(true);
        }
      }
    }
  });
});
