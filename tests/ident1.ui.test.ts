// IDENT-1 (REQ-BFG-122): the title's OPTIONS entries LINK A DEVICE and DELETE MY ONLINE DATA, and their cards (src/screens/linkCards.ts).
// Pinned here: every word is plain capitals the font has, passes T2's bans and ends its sentences; every line of the OPTIONS card and of
// every state of both cards fits its card, and the card fits the screen, on the desk (1280x800), the operator's phone (402x690 @3), the
// small phone (360x640 @2) and a phone on its side; the entry's OK is at least 44x44 CSS px; the pause menus' card is exactly what it
// was; the flows run against fake link calls (the real ones are the defaults); with no online session both entries are off with one
// plain line; the game shell's modal slot takes the keys and taps; NEW RUN refreshes the identity first; the profile is read once.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { computeView, defaultScale } from "../src/core/io";
import { Game, type Modal } from "../src/game/game";
import { startOnline, stopOnline } from "../src/game/online";
import { setSession } from "../src/game/session";
import type { Identity } from "../src/net/identity";
import type { deleteOnlineData, redeemLinkCode, requestLinkCode } from "../src/net/linkClient";
import { NAME_KEY } from "../src/net/names";
import { faceChars, textWidth, wrap } from "../src/render/font";
import type { G } from "../src/render/pixel";
import {
  LinkCard, OK_CSS, ROW_CSS, WORDS, checkTyped, failLine, layoutCard, linkAvailability, minutesLeftLine, optionsExtras,
  type Availability, type LinkCardDeps,
} from "../src/screens/linkCards";
import { TitleScreen, refreshIdentity, startupSync } from "../src/screens/title";
import { titleScale } from "../src/screens/titleLayout";
import { NOTE_ROW, optionsCard, optionsGeometry } from "../src/ui/hud";
import { UI } from "../src/ui/ui";
import { CODE_ALPHABET } from "../server/links";
import { banned } from "./textRules";

// ------------------------------------------------------------ what drawText was asked to draw (run1.screens.draw.test.ts's way)
interface Placed {
  s: string;
  left: number;
  w: number;
  y: number;
  font: string;
  scale: number;
}
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
      placed.push({ s: String(a[1]), left, w, y: Math.round(Number(a[3])), font: o.font ?? "5", scale: o.scale ?? 1 });
      return w;
    },
  };
});

// the profile read: the real module, but the title's call is a spy
const syncSpy = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => "skipped" as const));
vi.mock("../src/net/profileSync", async (importOriginal) => {
  const m = await importOriginal<typeof import("../src/net/profileSync")>();
  return { ...m, startupProfileSync: (...a: unknown[]) => syncSpy(...a) };
});

// ------------------------------------------------------------ a recording canvas (text-free: calls only) and a small fake DOM
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

type Handler = (e: Record<string, unknown>) => void;
let focused: FakeEl | null = null;
class FakeEl {
  children: FakeEl[] = [];
  parent: FakeEl | null = null;
  id = "";
  type = "";
  value = "";
  textContent = "";
  maxLength = 0;
  spellcheck = true;
  selectionStart: number | null = null;
  selectionEnd: number | null = null;
  attrs: Record<string, string> = {};
  props = new Map<string, string>();
  style = { setProperty: (k: string, v: string) => void this.props.set(k, v) };
  private listeners: Record<string, Handler[]> = {};
  constructor(readonly tag: string) {}
  setAttribute(k: string, v: string): void { this.attrs[k] = v; }
  appendChild(c: FakeEl): FakeEl { c.parent = this; this.children.push(c); return c; }
  remove(): void {
    if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this);
    this.parent = null;
  }
  addEventListener(t: string, fn: Handler): void { (this.listeners[t] ??= []).push(fn); }
  focus(): void { focused = this; }
  setSelectionRange(): void {}
  /** Fire an event; `stopped` counts stopPropagation calls and `prevented` preventDefault calls. */
  fire(t: string, e: Record<string, unknown> = {}): { stopped: number; prevented: number } {
    const r = { stopped: 0, prevented: 0 };
    for (const fn of this.listeners[t] ?? []) fn({ ...e, preventDefault: () => r.prevented++, stopPropagation: () => r.stopped++ });
    return r;
  }
}
const body = new FakeEl("body");
let restoreDom: () => void = () => undefined;
const store = new Map<string, string>();
beforeAll(() => {
  const doc = globalThis as { document?: unknown };
  const prev = doc.document;
  doc.document = { body, createElement: (tag: string) => (tag === "canvas" ? recCanvas() : new FakeEl(tag)) };
  restoreDom = () => { doc.document = prev; };
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k),
    key: () => null, length: 0, clear: () => store.clear(),
  });
});
afterAll(() => { restoreDom(); vi.unstubAllGlobals(); });
beforeEach(() => {
  placed.length = 0;
  store.clear();
  store.set(NAME_KEY, "ANNA"); // the title's name gate is passed
  body.children = [];
  focused = null;
  syncSpy.mockClear();
  startupSync.done = false;
});
afterEach(() => { stopOnline(); setSession(null); });

// ------------------------------------------------------------ the views and a stand-in Game
const NOW = 1_790_000_000_000;
const URL_ = "https://ghosts.example";
const ME: Identity = { playerId: "A".repeat(43), publicKey: new Uint8Array(65), sign: async () => ({ key: "k", sig: "s" }) };

/** The title's view and its buttons' size factor on a CSS viewport, as the game computes them (TitleScreen.pickScale; intro.title.test.ts). */
function titleView(cssW: number, cssH: number, dpr: number) {
  const v = computeView(cssW, cssH, dpr, (pw, ph, p) => titleScale(pw, ph, p, dpr));
  const pw = Math.floor(cssW * dpr), ph = Math.floor(cssH * dpr);
  const menu = defaultScale(pw, ph, v.portrait);
  return { ...v, menu, k: menu / v.scale, css: v.scale / v.dpr, pw, ph };
}
type TV = ReturnType<typeof titleView>;

/** The job's three views (the desk, the operator's phone, a small phone) and a phone on its side, the shortest screen. */
const VIEWS: [string, number, number, number][] = [
  ["desk 1280x800", 1280, 800, 1], ["op690 402x690 @3", 402, 690, 3], ["small 360x640 @2", 360, 640, 2], ["phone on its side 844x390 @3", 844, 390, 3],
];

interface Stub {
  game: Game;
  raw: { t: number; modal: Modal | null; go: ReturnType<typeof vi.fn>; openName: ReturnType<typeof vi.fn> };
  tv: TV;
}
function stubGame(tv: TV): Stub {
  const raw = {
    run: null, audio: { mode: 0, play: vi.fn(), unlock() {}, music() {} }, view: tv, W: tv.W, H: tv.H, portrait: tv.portrait, t: 0, ui: new UI(),
    canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: (tv.W * tv.scale) / tv.dpr, height: (tv.H * tv.scale) / tv.dpr }) },
    toast() {}, error() {}, soundButton() {}, cycleSound() {}, transitioning: false, resize() {},
    go: vi.fn(), openName: vi.fn(),
    modal: null as Modal | null,
    openModal(m: Modal) {
      if (this.modal) { m.dispose(); return; }
      this.modal = m;
    },
    closeModal() {
      this.modal?.dispose();
      this.modal = null;
    },
  };
  return { game: raw as unknown as Game, raw, tv };
}

/** One frame: the draw into a recording canvas, the UI regions it registered, and what it drew. */
function frame(game: Game, f: (g: G) => void): Placed[] {
  placed.length = 0;
  game.ui.begin();
  f(recCanvas().getContext());
  game.ui.end();
  return [...placed];
}
/** A tap on a UI region by id, as Game.pointerUp makes it (a region with a handler gets it). false: no such region or no handler. */
function tap(game: Game, id: string): boolean {
  const r = game.ui.regions.find((x) => x.id === id);
  if (!r || !r.onTap) return false;
  r.onTap();
  return true;
}
const flush = async (): Promise<void> => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

const ON: Availability = { on: true, session: { url: URL_, identity: ME } };

interface Calls { code: unknown[][]; redeem: unknown[][]; del: unknown[][] }
/** Fake link calls that record what they were asked and answer well; `over` replaces any of them. */
function fakeDeps(over: Partial<LinkCardDeps> = {}): { deps: LinkCardDeps; calls: Calls } {
  const calls: Calls = { code: [], redeem: [], del: [] };
  const deps: LinkCardDeps = {
    requestLinkCode: (async (...a: unknown[]) => { calls.code.push(a); return { ok: true, code: "ABCD-EFGH", expiresAt: NOW + 600_000 }; }) as unknown as typeof requestLinkCode,
    redeemLinkCode: (async (...a: unknown[]) => { calls.redeem.push(a); return { ok: true, player: "P".repeat(43) }; }) as unknown as typeof redeemLinkCode,
    deleteOnlineData: (async (...a: unknown[]) => { calls.del.push(a); return { ok: true }; }) as unknown as typeof deleteOnlineData,
    availability: () => ON, now: () => NOW, ...over,
  };
  return { deps, calls };
}

interface Opened { stub: Stub; card: LinkCard; calls: Calls }
function open(tv: TV, start: "link" | "delete", over: Partial<LinkCardDeps> = {}): Opened {
  const stub = stubGame(tv);
  const { deps, calls } = fakeDeps(over);
  const card = new LinkCard(stub.game, start, () => tv.k, deps);
  stub.raw.modal = card;
  return { stub, card, calls };
}
const draw = (o: Opened): Placed[] => frame(o.stub.game, (g) => o.card.draw(g));
async function press(o: Opened, id: string): Promise<void> {
  draw(o);
  expect(tap(o.stub.game, id), `a button "${id}" with a handler`).toBe(true);
  await flush();
}
const fail = (status?: number) => async () => ({ ok: false as const, ...(status === undefined ? {} : { status }), error: "x" });

// ------------------------------------------------------------ the words
describe("IDENT-1 UI: the words", () => {
  /** Every string the cards and the OPTIONS entries can show. */
  function everyWord(): string[] {
    const out: string[] = Object.values(WORDS);
    for (let n = 1; n <= 10; n++) out.push(minutesLeftLine(n));
    for (const op of ["code", "redeem", "delete"] as const) for (const s of [undefined, 401, 403, 409, 410, 422, 429, 500, 503]) out.push(failLine(op, s));
    for (const t of ["", "ab", "ABCD0123", "ABCD-EFGH"]) {
      const c = checkTyped(t);
      out.push(c.ok ? c.code : c.line);
    }
    return out;
  }

  it("plain capitals in glyphs both faces have; T2's bans and the middle dot stay out; no line break of its own", () => {
    const five = new Set(faceChars("5")), three = new Set(faceChars("3"));
    const words = everyWord();
    expect(words.length).toBeGreaterThan(50);
    for (const w of words) {
      for (const ch of w) {
        expect(five.has(ch) && three.has(ch), `"${w}": "${ch}" has no glyph in both faces`).toBe(true);
      }
      expect(w, w).toBe(w.toUpperCase());
      expect(banned(w), w).toEqual([]);
      expect(w, w).not.toMatch(/·|\n|\s{2}/);
    }
  });

  it("a sentence ends in a full stop (the labels and titles are short words); the lines are whole sentences", () => {
    const labels = ["linkRow", "deleteRow", "privacyRow", "linkTitle", "showCode", "enterCode", "newCode", "deleteTitle", "close", "back", "done", "cancel", "delete", "tryAgain"] as const; // S6: + privacyRow, the PRIVACY row's label
    for (const [key, text] of Object.entries(WORDS)) {
      if ((labels as readonly string[]).includes(key)) {
        expect(text.length, key).toBeLessThanOrEqual(21);
        expect(text, key).not.toMatch(/\./);
      } else {
        expect(text, key).toMatch(/\.$/);
      }
    }
    expect(minutesLeftLine(9)).toBe("9 MINUTES LEFT.");
    expect(minutesLeftLine(2)).toBe("2 MINUTES LEFT.");
    expect(minutesLeftLine(1)).toBe("1 MINUTE LEFT.");
  });

  it("the brief's own lines are there", () => {
    expect(WORDS.useIt).toBe("ENTER IT ON YOUR OTHER DEVICE.");
    expect(WORDS.linked).toBe("DEVICE LINKED. IT STARTS AT YOUR NEXT NEW RUN.");
    expect(WORDS.codeRefused).toBe("THAT CODE DID NOT WORK.");
    expect(WORDS.goes).toContain("ONLINE PROFILE");
    expect(WORDS.goes).toContain("LINKS");
    expect(WORDS.goes).toContain("GHOSTS");
    expect(WORDS.stays).toBe("YOUR PROGRESS ON THIS DEVICE STAYS.");
  });

  it("a refusal's line follows the server's status: 403 the code did not work, 409, 410, 422, 429, no answer, anything else", () => {
    expect(failLine("redeem", 403)).toBe(WORDS.codeRefused);
    expect(failLine("redeem", 409)).toBe(WORDS.linkedAlready);
    expect(failLine("redeem", 410)).toBe(WORDS.playerDeleted);
    expect(failLine("redeem", 422)).toBe(WORDS.clock);
    expect(failLine("redeem", 429)).toBe(WORDS.tooMany);
    expect(failLine("redeem", undefined)).toBe(WORDS.noAnswer);
    expect(failLine("redeem", 500)).toBe(WORDS.serverNo);
    expect(failLine("code", 403)).toBe(WORDS.closed); // linking closed: not "the code did not work"
    expect(failLine("delete", 503)).toBe(WORDS.serverNo);
    expect(new Set([WORDS.codeRefused, WORDS.linkedAlready, WORDS.playerDeleted, WORDS.clock, WORDS.tooMany, WORDS.noAnswer, WORDS.serverNo]).size).toBe(7);
  });

  it("the typed code: upper case, spaces and dashes ignored, 8 of the server's symbols; a typo is told without spending a try", () => {
    expect(checkTyped("abcd efgh")).toEqual({ ok: true, code: "ABCD-EFGH" });
    expect(checkTyped(" ABCD-EFGH ")).toEqual({ ok: true, code: "ABCD-EFGH" });
    expect(checkTyped("abcd-2345")).toEqual({ ok: true, code: "ABCD-2345" });
    expect(checkTyped("")).toEqual({ ok: false, line: WORDS.typeFirst });
    expect(checkTyped(" - ")).toEqual({ ok: false, line: WORDS.typeFirst });
    expect(checkTyped("ABCD")).toEqual({ ok: false, line: WORDS.eightChars });
    expect(checkTyped("ABCDEFGHJ")).toEqual({ ok: false, line: WORDS.eightChars });
    expect(checkTyped("ABCD0123")).toEqual({ ok: false, line: WORDS.neverThese });
    // the client's symbols are the server's (server/links.ts CODE_ALPHABET), so the two never disagree on a typo
    for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") {
      expect(checkTyped(ch.repeat(8)).ok, ch).toBe(CODE_ALPHABET.includes(ch));
    }
    expect(CODE_ALPHABET).toHaveLength(31);
  });
});

// ------------------------------------------------------------ the availability and the OPTIONS card
describe("IDENT-1 UI: the OPTIONS card", () => {
  const extrasFor = (stub: Stub, a: Availability) => optionsExtras(stub.game, () => stub.tv.k, { availability: () => a });
  const done = { id: "optdone", label: "DONE", primary: true, onTap: () => undefined };

  it("online only: no session, a session still loading, and one that failed are off, each with its one line; an active one is on", async () => {
    expect(linkAvailability(null)).toEqual({ on: false, why: WORDS.offNone });
    expect(linkAvailability({ url: URL_, identity: undefined, failed: false })).toEqual({ on: false, why: WORDS.offLoading });
    expect(linkAvailability({ url: URL_, identity: null, failed: true })).toEqual({ on: false, why: WORDS.offFailed });
    expect(linkAvailability({ url: URL_, identity: ME, failed: false })).toEqual({ on: true, session: { url: URL_, identity: ME } });
    // the page's own session (online.ts): none, then loading, then active
    expect(linkAvailability()).toEqual({ on: false, why: WORDS.offNone });
    const gate = deferred<Identity | null>();
    const s = startOnline(URL_, {
      fetchGhost: (async () => { throw new Error("x"); }) as never, submitGhost: (async () => { throw new Error("x"); }) as never,
      identity: () => gate.promise, store: null, now: () => NOW, save: () => undefined,
    });
    expect(linkAvailability()).toEqual({ on: false, why: WORDS.offLoading });
    gate.resolve(ME);
    for (let i = 0; i < 50 && !s.active; i++) await flush();
    expect(s.active).toBe(true);
    expect(linkAvailability()).toEqual({ on: true, session: { url: URL_, identity: ME } });
    stopOnline();
    const bad = startOnline(URL_, {
      fetchGhost: (async () => { throw new Error("x"); }) as never, submitGhost: (async () => { throw new Error("x"); }) as never,
      identity: async () => null, store: null, now: () => NOW, save: () => undefined,
    });
    for (let i = 0; i < 50 && !bad.failed; i++) await flush();
    expect(linkAvailability()).toEqual({ on: false, why: WORDS.offFailed });
  });

  it("on every view: LINK A DEVICE and DELETE MY ONLINE DATA sit below NAME inside the card, their labels fit their buttons, on and off (each reason)", () => {
    for (const [what, cw, ch, dpr] of VIEWS) {
      const tv = titleView(cw, ch, dpr);
      for (const a of [ON, { on: false, why: WORDS.offNone }, { on: false, why: WORDS.offFailed }, { on: false, why: WORDS.offLoading }] as Availability[]) {
        const at = `${what} ${tv.W}x${tv.H} k ${tv.k.toFixed(2)} ${a.on ? "on" : a.why}`;
        const stub = stubGame(tv);
        const extras = extrasFor(stub, a);
        let card = { x: 0, y: 0, w: 0, h: 0 };
        const drawn = frame(stub.game, (g) => { card = optionsCard(stub.game, g, "OPTIONS", [done], () => undefined, tv.k, extras); });
        // the card is on the screen
        expect(card.x >= 0 && card.y >= 0 && card.x + card.w <= tv.W && card.y + card.h <= tv.H, `${at}: card ${JSON.stringify(card)}`).toBe(true);
        const reg = (id: string) => stub.game.ui.regions.find((r) => r.id === id)!;
        const [name, link, del] = [reg("opt-name"), reg("opt-link"), reg("opt-delete")];
        expect(link && del && name, at).toBeTruthy();
        // below NAME, in that order, inside the card, with the options card's own button size
        expect(link.r.y).toBeGreaterThan(name.r.y + name.r.h - 1);
        expect(del.r.y).toBeGreaterThan(link.r.y + link.r.h - 1);
        for (const r of [link.r, del.r]) {
          expect(r.x >= card.x && r.x + r.w <= card.x + card.w && r.y >= card.y && r.y + r.h <= card.y + card.h, `${at}: button inside the card`).toBe(true);
          expect(r.w, at).toBe(name.r.w);
          expect(r.h, at).toBe(name.r.h);
        }
        // the labels fit their buttons (the 3x5 face, as NAME)
        for (const [id, label] of [["opt-link", WORDS.linkRow], ["opt-delete", WORDS.deleteRow]] as const) {
          const p = drawn.find((x) => x.s === label)!;
          expect(p, `${at}: ${label} drawn`).toBeTruthy();
          expect(p.left >= reg(id).r.x + 2 && p.left + p.w <= reg(id).r.x + reg(id).r.w - 2, `${at}: "${label}" ${p.left}..${p.left + p.w} in ${reg(id).r.x}..${reg(id).r.x + reg(id).r.w}`).toBe(true);
        }
        // on: both take a tap; off: neither does, and ONE line says why, in the card
        if (a.on) {
          expect(typeof link.onTap, at).toBe("function");
          expect(typeof del.onTap, at).toBe("function");
          expect(drawn.map((p) => p.s).join("|"), at).not.toMatch(/ONLINE ONLY|CANNOT GO ONLINE|GETTING READY/);
        } else {
          expect(link.onTap, at).toBeUndefined();
          expect(del.onTap, at).toBeUndefined();
          const geo = optionsGeometry(tv.W, tv.H, tv.k, 1, extras);
          expect(geo.noteLines.join(" "), at).toBe(a.why);
          const lines = drawn.filter((p) => geo.noteLines.includes(p.s));
          expect(lines.map((p) => p.s), `${at}: the note drawn once`).toEqual(geo.noteLines);
          for (const p of lines) {
            expect(p.left >= card.x + 4 && p.left + p.w <= card.x + card.w - 4, `${at}: "${p.s}" inside the card`).toBe(true);
            expect(p.y >= del.r.y + del.r.h && p.y + 5 <= card.y + card.h, `${at}: "${p.s}" under the rows`).toBe(true);
          }
          expect(geo.noteLines.length * NOTE_ROW).toBeLessThanOrEqual(card.h);
        }
      }
    }
  });

  it("the pause menus' card is exactly what it was: the same rect, the same rows, and none of the new words", () => {
    for (const [what, cw, ch, dpr] of VIEWS) {
      const tv = titleView(cw, ch, dpr);
      for (const n of [2, 3]) {
        const at = `${what} ${tv.W}x${tv.H} ${n} actions`;
        const stub = stubGame(tv);
        const actions = Array.from({ length: n }, (_, i) => ({ id: `act${i}`, label: `ACT ${i}`, onTap: () => undefined }));
        let card = { x: 0, y: 0, w: 0, h: 0 };
        const drawn = frame(stub.game, (g) => { card = optionsCard(stub.game, g, "PAUSED", actions, () => undefined); });
        // the pre-IDENT-1 formula (names.intro.test.ts's cardH, and hud.ts as it was): rows of 19 + 3, three fixed rows after the actions
        const bw = Math.min(tv.W - 24, 150), h = 18 + (3 + n) * 22 + 4, w = bw + 20;
        expect(card, at).toEqual({ x: Math.round(tv.W / 2 - w / 2), y: Math.round(tv.H / 2 - h / 2), w, h });
        expect(stub.game.ui.regions.map((r) => r.id), at).toEqual(["optbg", "optcard", ...actions.map((a) => a.id), "opt-rm", "opt-snd", "opt-name"]);
        expect(drawn.map((p) => p.s).join("|"), at).not.toMatch(/LINK|DELETE|ONLINE|SERVER|READY/);
        expect(optionsGeometry(tv.W, tv.H, 1, n).card, at).toEqual(card);
      }
    }
  });

  it("the title's card draws the two rows after NAME; the extra rows make it taller and nothing else moves", () => {
    const tv = titleView(402, 690, 3);
    const stub = stubGame(tv);
    const plain = optionsGeometry(tv.W, tv.H, tv.k, 1);
    const withRows = optionsGeometry(tv.W, tv.H, tv.k, 1, optionsExtras(stub.game, () => tv.k, { availability: () => ON }));
    const step = Math.ceil(19 * tv.k - 1e-9) + 3;
    expect(withRows.card.h - plain.card.h).toBe(3 * step); // S6: LINK A DEVICE, DELETE MY ONLINE DATA and PRIVACY (was 2 rows)
    expect(withRows.bw).toBe(plain.bw);
    const off = optionsGeometry(tv.W, tv.H, tv.k, 1, optionsExtras(stub.game, () => tv.k, { availability: () => ({ on: false, why: WORDS.offNone }) }));
    expect(off.card.h - plain.card.h).toBe(3 * step + off.noteLines.length * NOTE_ROW);
  });
});

// ------------------------------------------------------------ the cards
/** A card's state, checked against its view: on the screen, every line inside the card and clear of its neighbours, every label inside its
 *  button, the HTML row a finger's size, and the draw is the layout. */
function checkCard(what: string, o: Opened): void {
  const tv = o.stub.tv;
  const drawn = draw(o);
  const { layout: L, step } = o.card.info();
  const at = `${what} [${step}] ${tv.W}x${tv.H} k ${tv.k.toFixed(2)}`;
  const c = L.card;
  expect(c.x >= 0 && c.y >= 0 && c.x + c.w <= tv.W && c.y + c.h <= tv.H, `${at}: card ${JSON.stringify(c)} on the screen`).toBe(true);
  const fh = (l: { font: string; scale: number }) => (l.font === "5" ? 7 : 5) * l.scale;
  const lines = [L.title, ...L.lines];
  lines.forEach((l, i) => {
    const left = l.x - l.w / 2, right = l.x + l.w / 2;
    expect(left >= c.x + 4 && right <= c.x + c.w - 4, `${at}: "${l.text}" ${left}..${right} inside the card ${c.x}..${c.x + c.w}`).toBe(true);
    expect(l.y >= c.y && l.y + fh(l) <= c.y + c.h, `${at}: "${l.text}" inside the card's height`).toBe(true);
    if (i > 0) expect(l.y, `${at}: "${l.text}" below "${lines[i - 1].text}"`).toBeGreaterThanOrEqual(lines[i - 1].y + fh(lines[i - 1]));
  });
  const last = lines[lines.length - 1];
  const lowest = Math.max(last.y + fh(last), L.row ? L.row.y + L.row.h : 0);
  const rects = L.buttons.map((b) => b.r);
  rects.forEach((r, i) => {
    expect(r.x >= c.x && r.x + r.w <= c.x + c.w && r.y >= c.y && r.y + r.h <= c.y + c.h, `${at}: button inside the card`).toBe(true);
    expect(r.y, `${at}: button below the text`).toBeGreaterThanOrEqual(lowest);
    for (const q of rects.slice(i + 1)) expect(r.x + r.w <= q.x || q.x + q.w <= r.x || r.y + r.h <= q.y || q.y + q.h <= r.y, `${at}: buttons apart`).toBe(true);
  });
  for (const b of L.buttons) {
    expect(textWidth(b.label, b.font as "5" | "3"), `${at}: "${b.label}" in its button`).toBeLessThanOrEqual(b.r.w - 6);
    expect(b.r.h, at).toBeGreaterThanOrEqual(19);
  }
  if (L.row) {
    const r = L.row;
    expect(r.x >= c.x && r.x + r.w <= c.x + c.w && r.y >= c.y && r.y + r.h <= c.y + c.h, `${at}: the entry row inside the card`).toBe(true);
    for (const l of L.lines) expect(l.y + fh(l) <= r.y || l.y >= r.y + r.h, `${at}: "${l.text}" clear of the entry row`).toBe(true);
    expect(r.h * tv.css, `${at}: the row is a finger tall`).toBeGreaterThanOrEqual(ROW_CSS - 1e-9);
    expect(r.w * tv.css, `${at}: room for the input and OK`).toBeGreaterThanOrEqual(OK_CSS + 80);
    expect(ROW_CSS).toBeGreaterThanOrEqual(44);
    expect(OK_CSS).toBeGreaterThanOrEqual(44);
  }
  // the draw is the layout: the same words, at the same places and widths
  const want = [...lines.map((l) => l.text), ...L.buttons.map((b) => b.label)].sort();
  expect(drawn.map((p) => p.s).sort(), `${at}: what is drawn`).toEqual(want);
  for (const l of lines) {
    const p = drawn.find((x) => x.s === l.text)!;
    expect(Math.abs(p.left - (l.x - l.w / 2)) <= 1 && p.w === l.w, `${at}: "${l.text}" is drawn where the layout puts it`).toBe(true);
  }
  // the big code is big
  const code = L.lines.find((l) => l.tone === "code");
  if (code) expect(code.scale, `${at}: the code's size`).toBeGreaterThanOrEqual(2);
}

/** Every state of both cards: how to reach it. */
const SCENARIOS: [string, (tv: TV) => Promise<Opened>][] = [
  ["menu", async (tv) => open(tv, "link")],
  ["asking", async (tv) => { const o = open(tv, "link", { requestLinkCode: (() => new Promise(() => undefined)) as never }); await press(o, "link-show"); return o; }],
  ["code, 10 minutes", async (tv) => { const o = open(tv, "link"); await press(o, "link-show"); return o; }],
  ["code, 9 minutes", async (tv) => { const o = open(tv, "link"); await press(o, "link-show"); o.stub.raw.t += 61; return o; }],
  ["code, 1 minute", async (tv) => { const o = open(tv, "link"); await press(o, "link-show"); o.stub.raw.t += 545; return o; }],
  ["code, expired", async (tv) => { const o = open(tv, "link"); await press(o, "link-show"); o.stub.raw.t += 601; return o; }],
  ...[undefined, 403, 410, 422, 429, 500].map((s): [string, (tv: TV) => Promise<Opened>] => [
    `no code, status ${s}`, async (tv) => { const o = open(tv, "link", { requestLinkCode: fail(s) as never }); await press(o, "link-show"); return o; },
  ]),
  ["entry", async (tv) => { const o = open(tv, "link"); await press(o, "link-enter"); return o; }],
  ...[["", WORDS.typeFirst], ["ab", WORDS.eightChars], ["ABCD0123", WORDS.neverThese]].map(([typed, line]): [string, (tv: TV) => Promise<Opened>] => [
    `entry, typed "${typed}"`, async (tv) => {
      const o = open(tv, "link");
      await press(o, "link-enter");
      o.card.type(typed);
      await o.card.submit();
      const c = o.card.info().content;
      expect(c.below?.map((l) => l.text), "the problem sits under the entry row").toEqual([line]);
      return o;
    },
  ]),
  ["checking", async (tv) => { const o = open(tv, "link", { redeemLinkCode: (() => new Promise(() => undefined)) as never }); await press(o, "link-enter"); o.card.type("abcd efgh"); void o.card.submit(); await flush(); return o; }],
  ...[undefined, 403, 409, 410, 422, 429, 500].map((s): [string, (tv: TV) => Promise<Opened>] => [
    `entry, refused with status ${s}`, async (tv) => { const o = open(tv, "link", { redeemLinkCode: fail(s) as never }); await press(o, "link-enter"); o.card.type("abcd efgh"); await o.card.submit(); return o; },
  ]),
  ["linked", async (tv) => { const o = open(tv, "link"); await press(o, "link-enter"); o.card.type("abcd efgh"); await o.card.submit(); return o; }],
  ["delete: asks once", async (tv) => open(tv, "delete")],
  ["deleting", async (tv) => { const o = open(tv, "delete", { deleteOnlineData: (() => new Promise(() => undefined)) as never }); await press(o, "del-go"); return o; }],
  ["deleted", async (tv) => { const o = open(tv, "delete"); await press(o, "del-go"); return o; }],
  ...[undefined, 410, 422, 500].map((s): [string, (tv: TV) => Promise<Opened>] => [
    `delete failed, status ${s}`, async (tv) => { const o = open(tv, "delete", { deleteOnlineData: fail(s) as never }); await press(o, "del-go"); return o; },
  ]),
];

describe("IDENT-1 UI: every state of both cards fits every view", () => {
  for (const [what, cw, ch, dpr] of VIEWS) {
    it(`${what}: ${SCENARIOS.length} states, each on the screen with every line inside its card and every label inside its button`, async () => {
      const tv = titleView(cw, ch, dpr);
      const seen = new Set<string>();
      for (const [name, make] of SCENARIOS) {
        const o = await make(tv);
        checkCard(`${what} ${name}`, o);
        seen.add(o.card.info().step);
        o.stub.game.closeModal();
      }
      // all eleven states of the two cards were reached
      expect([...seen].sort()).toEqual(["asking", "checking", "code", "codefail", "confirm", "deleted", "deletefail", "deleting", "enter", "linked", "menu"]);
    });
  }

  it("the three views are the job's: the desk 1280x800, the operator's 402x690 @3 and the small 360x640 @2, each with its own scale", () => {
    const [desk, op, small] = [titleView(1280, 800, 1), titleView(402, 690, 3), titleView(360, 640, 2)];
    expect([desk.W, desk.H]).toEqual([640, 400]);
    expect(desk.k).toBe(1);
    expect(op.portrait && small.portrait).toBe(true);
    expect(op.k).toBeGreaterThanOrEqual(1);
    expect(small.k).toBeGreaterThanOrEqual(1);
  });

  it("the cards sit near the top (a phone's keyboard leaves them in view) and are at most the CSS width the desk gives them, within the screen", () => {
    for (const [what, cw, ch, dpr] of VIEWS) {
      const tv = titleView(cw, ch, dpr);
      const { card } = open(tv, "link").card.info().layout;
      expect(card.y, what).toBe(Math.max(4, Math.round(tv.H * 0.08)));
      expect(card.w, what).toBeLessThanOrEqual(tv.W - 8);
      expect(Math.abs(card.x + card.w / 2 - tv.W / 2), what).toBeLessThanOrEqual(0.5); // centred, to the pixel
    }
  });

  it("layoutCard is pure: the same numbers twice, and it widens with k (the CSS width of the desk's card) up to the screen", () => {
    const content = open(titleView(1280, 800, 1), "link").card.info().content;
    expect(layoutCard(content, 640, 400, 1, 2)).toEqual(layoutCard(content, 640, 400, 1, 2));
    expect(layoutCard(content, 640, 400, 1, 2).card.w).toBe(220);
    expect(layoutCard(content, 640, 400, 1.5, 1).card.w).toBe(330);
    expect(layoutCard(content, 240, 400, 1.5, 1).card.w).toBe(232);
    expect(layoutCard(content, 640, 400, 1, 2).font).toBe("3");
    expect(layoutCard(content, 640, 400, 1.25, 2).font).toBe("5");
  });
});

// ------------------------------------------------------------ the flows
describe("IDENT-1 UI: SHOW MY CODE", () => {
  it("asks the server with this session's url and identity, shows the code big with the minutes left and the one line, and counts down", async () => {
    const tv = titleView(402, 690, 3);
    const o = open(tv, "link");
    const menu = draw(o).map((p) => p.s);
    expect(menu).toEqual(expect.arrayContaining([WORDS.linkTitle, WORDS.linkHint, WORDS.showCode, WORDS.enterCode, WORDS.close]));
    await press(o, "link-show");
    expect(o.calls.code).toEqual([[URL_, ME]]);
    const shown = draw(o);
    const code = shown.find((p) => p.s === "ABCD-EFGH")!;
    expect(code, "the code, drawn as XXXX-XXXX").toBeTruthy();
    expect(code.scale).toBeGreaterThanOrEqual(2);
    expect(code.font).toBe("5");
    expect(shown.map((p) => p.s)).toEqual(expect.arrayContaining(["10 MINUTES LEFT.", WORDS.useIt, WORDS.newCode, WORDS.close]));
    o.stub.raw.t += 61;
    expect(draw(o).map((p) => p.s)).toContain("9 MINUTES LEFT.");
    o.stub.raw.t += 480;
    expect(draw(o).map((p) => p.s)).toContain("1 MINUTE LEFT.");
    o.stub.raw.t += 70;
    const gone = draw(o).map((p) => p.s);
    expect(gone).toContain(WORDS.expired);
    expect(gone.join("|")).not.toMatch(/MINUTES? LEFT/);
  });

  it("NEW CODE asks again; a clock that runs ahead or behind never starts the countdown above ten minutes", async () => {
    const o = open(titleView(1280, 800, 1), "link", { requestLinkCode: (async () => ({ ok: true as const, code: "WXYZ-2345", expiresAt: NOW + 3_600_000 })) as never });
    await press(o, "link-show");
    expect(draw(o).map((p) => p.s)).toContain("10 MINUTES LEFT."); // the server's expiry an hour off: capped at the code's life
    await press(o, "link-new");
    expect(draw(o).map((p) => p.s)).toContain("WXYZ-2345");
    const ahead = open(titleView(1280, 800, 1), "link", { now: () => NOW + 4 * 60_000 });
    await press(ahead, "link-show");
    expect(draw(ahead).map((p) => p.s)).toContain("6 MINUTES LEFT."); // a clock 4 minutes ahead shows less, never more
  });

  it("a failure is one plain line by the server's status, with TRY AGAIN; the next try can succeed", async () => {
    let n = 0;
    const o = open(titleView(402, 690, 3), "link", { requestLinkCode: (async () => (n++ === 0 ? { ok: false as const, status: 429, error: "x" } : { ok: true as const, code: "ABCD-EFGH", expiresAt: NOW + 600_000 })) as never });
    await press(o, "link-show");
    const failed = draw(o).map((p) => p.s);
    expect(failed).toContain(WORDS.tooMany);
    expect(failed).toContain(WORDS.tryAgain);
    await press(o, "link-retry");
    expect(draw(o).map((p) => p.s)).toContain("ABCD-EFGH");
  });

  it("with the session gone from under the card, the ask says why and calls nothing", async () => {
    let on = true;
    const o = open(titleView(1280, 800, 1), "link", { availability: () => (on ? ON : { on: false, why: WORDS.offFailed }) });
    draw(o);
    on = false;
    await press(o, "link-show");
    expect(o.calls.code).toHaveLength(0);
    expect(draw(o).map((p) => p.s)).toContain(WORDS.offFailed);
  });

  it("BACK or an answer that comes after the card moved on: the late answer is dropped", async () => {
    const late = deferred<{ ok: true; code: string; expiresAt: number }>();
    const o = open(titleView(1280, 800, 1), "link", { requestLinkCode: (() => late.promise) as never });
    await press(o, "link-show");
    expect(o.card.info().step).toBe("asking");
    o.card.key("Escape"); // one step back: the menu
    expect(o.card.info().step).toBe("menu");
    late.resolve({ ok: true, code: "ABCD-EFGH", expiresAt: NOW + 600_000 });
    await flush();
    expect(o.card.info().step).toBe("menu");
    const late2 = deferred<{ ok: true; code: string; expiresAt: number }>();
    const closed = open(titleView(1280, 800, 1), "link", { requestLinkCode: (() => late2.promise) as never });
    await press(closed, "link-show");
    closed.stub.game.closeModal(); // the card is gone before the answer
    late2.resolve({ ok: true, code: "ABCD-EFGH", expiresAt: NOW + 600_000 });
    await flush();
    expect(closed.card.info().step).toBe("asking"); // disposed: it did not move
  });
});

describe("IDENT-1 UI: ENTER A CODE", () => {
  const entryBox = (): FakeEl | undefined => body.children.find((c) => c.id === "bb-link");

  it("a real HTML input and an OK of at least 44x44 CSS px, placed over the card's row; it goes away with the card", async () => {
    const tv = titleView(360, 640, 2);
    const o = open(tv, "link");
    expect(entryBox()).toBeUndefined();
    await press(o, "link-enter");
    const box = entryBox()!;
    expect(box, "the HTML row").toBeTruthy();
    const [input, ok] = box.children;
    expect([input.tag, input.id, input.type]).toEqual(["input", "bb-link-input", "text"]);
    expect([ok.tag, ok.id, ok.type, ok.textContent]).toEqual(["button", "bb-link-ok", "button", "OK"]);
    expect(input.attrs.autocapitalize).toBe("characters");
    expect(input.attrs.autocomplete).toBe("off");
    expect(input.attrs.spellcheck).toBe("false");
    expect(input.maxLength).toBeGreaterThanOrEqual(9);
    // OK: at least 44 wide and 44 tall in CSS px; the row at least a finger tall, over the canvas panel's row
    expect(Number.parseInt(ok.props.get("min-width")!, 10)).toBeGreaterThanOrEqual(44);
    expect(Number.parseInt(ok.props.get("min-height")!, 10)).toBeGreaterThanOrEqual(44);
    expect(Number.parseInt(ok.props.get("width")!, 10)).toBeGreaterThanOrEqual(44);
    expect(ok.props.get("height")).toBe("100%");
    draw(o); // the row is placed on a frame
    const L = o.card.info().layout;
    expect(L.row).not.toBeNull();
    expect(Number.parseInt(box.props.get("height")!, 10)).toBeGreaterThanOrEqual(48);
    expect(Number.parseInt(box.props.get("width")!, 10)).toBe(Math.round(L.row!.w * tv.css));
    expect(Number.parseInt(box.props.get("left")!, 10)).toBe(Math.round(L.row!.x * tv.css));
    expect(Number.parseInt(box.props.get("top")!, 10)).toBe(Math.round(L.row!.y * tv.css));
    expect(box.props.get("position")).toBe("fixed");
    expect(focused).toBe(input);
    // BACK, and the row is gone
    await press(o, "link-back");
    expect(entryBox()).toBeUndefined();
    await press(o, "link-enter");
    expect(entryBox()).toBeTruthy();
    o.stub.game.closeModal();
    expect(entryBox(), "closing the card removes the row").toBeUndefined();
  });

  it("typing xxxx xxxx and Enter (or OK) redeems the code as XXXX-XXXX with this session's url and identity, and says when the link starts", async () => {
    const o = open(titleView(402, 690, 3), "link");
    await press(o, "link-enter");
    const [input] = entryBox()!.children;
    input.value = "abcd efgh";
    input.fire("input");
    expect(input.value).toBe("ABCD EFGH"); // upper case as typed
    const key = input.fire("keydown", { key: "Enter" });
    expect(key.stopped, "the game's own keys stay out of the code").toBe(1);
    expect(key.prevented).toBe(1);
    await flush();
    expect(o.calls.redeem).toEqual([[URL_, ME, "ABCD-EFGH"]]);
    expect(o.card.info().step).toBe("linked");
    expect(entryBox(), "the row leaves with the entry step").toBeUndefined();
    const shown = draw(o).map((p) => p.s);
    expect(shown).toContain("DEVICE LINKED. IT STARTS AT YOUR NEXT NEW RUN.");
    expect(shown).toContain(WORDS.done);
    await press(o, "link-done");
    expect(o.stub.raw.modal).toBeNull();
    // the OK button does the same as Enter
    const p = open(titleView(402, 690, 3), "link");
    await press(p, "link-enter");
    const [, ok2] = entryBox()!.children;
    p.card.type("wxyz 2345");
    ok2.fire("click");
    await flush();
    expect(p.calls.redeem).toEqual([[URL_, ME, "WXYZ-2345"]]);
  });

  it("a typo is told here and spends no try: nothing is sent for an empty, a short or an impossible code", async () => {
    const o = open(titleView(1280, 800, 1), "link");
    await press(o, "link-enter");
    for (const [typed, line] of [["", WORDS.typeFirst], ["abc", WORDS.eightChars], ["abcd0123", WORDS.neverThese]]) {
      o.card.type(typed);
      await o.card.submit();
      expect(o.calls.redeem, typed).toHaveLength(0);
      expect(o.card.info().step).toBe("enter");
      expect(draw(o).map((p) => p.s), typed).toContain(line);
    }
  });

  it("a refusal shows its one plain line and gives the entry back with what was typed; the next try can succeed", async () => {
    for (const [status, line] of [[403, WORDS.codeRefused], [409, WORDS.linkedAlready], [410, WORDS.playerDeleted], [422, WORDS.clock], [429, WORDS.tooMany], [undefined, WORDS.noAnswer], [500, WORDS.serverNo]] as const) {
      let n = 0;
      const o = open(titleView(402, 690, 3), "link", {
        redeemLinkCode: (async (...a: unknown[]) => { o.calls.redeem.push(a); return n++ === 0 ? { ok: false as const, ...(status === undefined ? {} : { status }), error: "x" } : { ok: true as const, player: "P".repeat(43) }; }) as never,
      });
      await press(o, "link-enter");
      o.card.type("abcd efgh");
      await o.card.submit();
      expect(o.card.info().step, `${status}`).toBe("enter");
      expect(draw(o).map((p) => p.s), `${status}`).toContain(line);
      const input = entryBox()!.children[0];
      expect(input.value, "what was typed is kept").toBe("abcd efgh");
      await o.card.submit();
      expect(o.card.info().step, `${status} then ok`).toBe("linked");
      expect(o.calls.redeem).toHaveLength(2);
      o.stub.game.closeModal();
    }
  });

  it("while it checks, CLOSE leaves; the late answer changes nothing", async () => {
    const late = deferred<{ ok: true; player: string }>();
    const o = open(titleView(402, 690, 3), "link", { redeemLinkCode: (() => late.promise) as never });
    await press(o, "link-enter");
    o.card.type("abcd efgh");
    void o.card.submit();
    await flush();
    expect(o.card.info().step).toBe("checking");
    expect(draw(o).map((p) => p.s)).toContain(WORDS.checking);
    await press(o, "link-close");
    expect(o.stub.raw.modal).toBeNull();
    late.resolve({ ok: true, player: "P".repeat(43) });
    await flush();
    expect(o.card.info().step).toBe("checking");
  });

  it("Escape in the input steps back to the menu; Escape on the menu closes; Enter on the menu does nothing", async () => {
    const o = open(titleView(1280, 800, 1), "link");
    await press(o, "link-enter");
    entryBox()!.children[0].fire("keydown", { key: "Escape" });
    expect(o.card.info().step).toBe("menu");
    o.card.key("Enter");
    expect(o.card.info().step).toBe("menu");
    expect(o.calls.redeem).toHaveLength(0);
    o.card.key("Escape");
    expect(o.stub.raw.modal).toBeNull();
  });

  it("headless (no document): the entry still works from typed text, with no row", async () => {
    const doc = globalThis as { document?: unknown };
    const keep = doc.document;
    doc.document = undefined;
    try {
      const o = open(titleView(1280, 800, 1), "link");
      await press(o, "link-enter");
      expect(o.card.input).toBeNull();
      o.card.type("abcd efgh");
      await o.card.submit();
      expect(o.calls.redeem).toEqual([[URL_, ME, "ABCD-EFGH"]]);
      expect(o.card.info().step).toBe("linked");
    } finally {
      doc.document = keep;
    }
  });
});

describe("IDENT-1 UI: DELETE MY ONLINE DATA", () => {
  it("asks once: what goes and what stays, CANCEL and DELETE; CANCEL deletes nothing", async () => {
    const o = open(titleView(402, 690, 3), "delete");
    const asked = draw(o).map((p) => p.s);
    expect(asked).toEqual(expect.arrayContaining([WORDS.deleteTitle, WORDS.cancel, WORDS.delete]));
    const text = asked.join(" ");
    expect(text).toContain("THIS DELETES YOUR ONLINE PROFILE, YOUR LINKS AND YOUR GHOSTS."); // wrapped lines read back whole
    expect(text).toContain("YOUR PROGRESS ON THIS DEVICE STAYS.");
    await press(o, "del-cancel");
    expect(o.stub.raw.modal).toBeNull();
    expect(o.calls.del).toHaveLength(0);
  });

  it("DELETE calls the server once with this session's url and identity, then reports it", async () => {
    const o = open(titleView(1280, 800, 1), "delete");
    await press(o, "del-go");
    expect(o.calls.del).toEqual([[URL_, ME]]);
    expect(o.card.info().step).toBe("deleted");
    expect(draw(o).map((p) => p.s).join(" ")).toContain("DONE. YOUR NEXT ONLINE GAME STARTS A NEW PLAYER.");
    await press(o, "del-done");
    expect(o.stub.raw.modal).toBeNull();
    expect(o.calls.del).toHaveLength(1);
  });

  it("a failure is one plain line by status, with TRY AGAIN, which asks again", async () => {
    for (const [status, line] of [[undefined, WORDS.noAnswer], [410, WORDS.playerDeleted], [422, WORDS.clock], [500, WORDS.serverNo]] as const) {
      let n = 0;
      const o = open(titleView(402, 690, 3), "delete", {
        deleteOnlineData: (async (...a: unknown[]) => { o.calls.del.push(a); return n++ === 0 ? { ok: false as const, ...(status === undefined ? {} : { status }), error: "x" } : { ok: true as const }; }) as never,
      });
      await press(o, "del-go");
      expect(o.card.info().step, `${status}`).toBe("deletefail");
      expect(draw(o).map((p) => p.s).join(" "), `${status}`).toContain(line);
      await press(o, "del-retry");
      expect(o.card.info().step, `${status} then ok`).toBe("deleted");
      expect(o.calls.del).toHaveLength(2);
    }
  });

  it("with the session gone from under the card, DELETE says why and calls nothing", async () => {
    const o = open(titleView(1280, 800, 1), "delete", { availability: () => ({ on: false, why: WORDS.offNone }) });
    await press(o, "del-go");
    expect(o.calls.del).toHaveLength(0);
    expect(draw(o).map((p) => p.s).join(" ")).toContain(WORDS.offNone);
  });
});

// ------------------------------------------------------------ the game shell's modal slot
describe("IDENT-1 UI: game.ts's modal slot", () => {
  /** A Game with its fields set by hand (its constructor needs a window): the methods under test are the real ones. */
  function shell() {
    const log: string[] = [];
    const screen = {
      key: (k: string) => log.push(`screen.key ${k}`), pressed: () => log.push("screen.pressed"), down: () => log.push("screen.down"),
      move: () => log.push("screen.move"), up: () => log.push("screen.up"), wheel: () => { log.push("screen.wheel"); return true; },
    };
    const game = Object.create(Game.prototype) as Game & Record<string, unknown>;
    Object.assign(game, {
      ui: new UI(), audio: { unlock: () => undefined, play: () => undefined, cycleMode: () => 0, mode: 0 }, screen, wipeDir: 0, pending: null, nameEntry: null, modal: null,
      toastMsg: null, toastLog: [], run: null,
    });
    (game as unknown as { cycleSound(): void }).cycleSound = () => log.push("cycleSound");
    const modal = {
      draw: () => undefined, key: (k: string) => log.push(`modal.key ${k}`), dispose: vi.fn(() => log.push("modal.dispose")),
    };
    return { game, log, modal };
  }

  it("while a modal is up it has every key, every tap and the wheel; the screen under it hears none; closing gives them back", () => {
    const { game, log, modal } = shell();
    game.openModal(modal);
    expect(game.modal).toBe(modal);
    game.key("m");
    game.key("Escape");
    expect(log).toEqual(["modal.key m", "modal.key Escape"]); // not the sound toggle, not the screen
    log.length = 0;
    // its regions take the taps: a full-screen block, as the name screen's
    game.ui.begin();
    game.ui.add({ id: "linkbg", r: { x: 0, y: 0, w: 100, h: 100 }, block: true });
    game.ui.end();
    game.pointerDown(10, 10);
    game.pointerMove(11, 11, true);
    game.pointerUp(10, 10);
    game.pointerExtra(10, 10);
    expect(game.wheel(3)).toBe(false);
    expect(log).toEqual([]); // nothing reached the screen
    game.closeModal();
    expect(game.modal).toBeNull();
    expect(modal.dispose).toHaveBeenCalledTimes(1);
    log.length = 0;
    game.key("m");
    expect(log).toEqual(["cycleSound"]);
    game.pointerMove(5, 5, false);
    expect(log).toContain("screen.move");
    expect(game.wheel(3)).toBe(true);
  });

  it("one at a time: a second modal, or one while the name screen is up, is dropped (disposed, not shown); the name screen waits for a modal", () => {
    const { game, modal } = shell();
    const other = { draw: () => undefined, key: () => undefined, dispose: vi.fn() };
    game.openModal(modal);
    game.openModal(other);
    expect(game.modal).toBe(modal);
    expect(other.dispose).toHaveBeenCalledTimes(1);
    game.openName({ required: false });
    expect(game.nameEntry, "no name screen under a modal").toBeNull();
    game.closeModal();
    const third = { draw: () => undefined, key: () => undefined, dispose: vi.fn() };
    (game as unknown as { nameEntry: unknown }).nameEntry = {}; // a name screen is up
    game.openModal(third);
    expect(game.modal).toBeNull();
    expect(third.dispose).toHaveBeenCalledTimes(1);
  });
});

// ------------------------------------------------------------ the title
describe("IDENT-1 UI: the title", () => {
  function titleOf(css: readonly [number, number, number] = [402, 690, 3]) {
    const tv = titleView(css[0], css[1], css[2]);
    const stub = stubGame(tv);
    const s = new TitleScreen(stub.game);
    // the title's own scale reads window.devicePixelRatio (none in node): give it this view's, for the call
    const w = globalThis as { window?: unknown };
    const prev = w.window;
    w.window = { devicePixelRatio: css[2] };
    try {
      s.pickScale(tv.pw, tv.ph, tv.portrait);
    } finally {
      w.window = prev;
    }
    return { s, stub, tv };
  }
  const drawTitle = (t: ReturnType<typeof titleOf>): Placed[] => frame(t.stub.game, (g) => t.s.draw(g));
  const openMenu = (t: ReturnType<typeof titleOf>) => { (t.s as unknown as { menu: boolean }).menu = true; };
  /** An online session whose identity is `identity` (loaded), on fake deps. */
  async function session(identity: Identity | null) {
    const s = startOnline(URL_, {
      fetchGhost: (async () => { throw new Error("x"); }) as never, submitGhost: (async () => { throw new Error("x"); }) as never,
      identity: async () => identity, store: null, now: () => NOW, save: () => undefined,
    });
    for (let i = 0; i < 50 && s.identity === undefined; i++) await flush();
    return s;
  }
  const fakeId = (log: string[], over: Partial<Identity> = {}): Identity => ({ ...ME, refresh: () => void log.push("refresh"), ...over });

  it("OPTIONS with no session: both entries off with the one line why, drawn once; no card opens", () => {
    const t = titleOf();
    openMenu(t);
    const drawn = drawTitle(t);
    const regions = t.stub.game.ui.regions;
    expect(regions.find((r) => r.id === "opt-link")?.onTap).toBeUndefined();
    expect(regions.find((r) => r.id === "opt-delete")?.onTap).toBeUndefined();
    expect(regions.some((r) => r.id === "opt-link") && regions.some((r) => r.id === "opt-delete")).toBe(true);
    expect(drawn.filter((p) => p.s === WORDS.linkRow || p.s === WORDS.deleteRow)).toHaveLength(2);
    expect(drawn.map((p) => p.s).join(" ")).toContain(WORDS.offNone);
    tap(t.stub.game, "opt-link");
    tap(t.stub.game, "opt-delete");
    expect(t.stub.raw.modal).toBeNull();
  });

  it("OPTIONS with an active session: both entries take taps, no line why; LINK A DEVICE opens the link card, DELETE the delete card", async () => {
    await session(fakeId([]));
    const t = titleOf();
    openMenu(t);
    const drawn = drawTitle(t);
    expect(drawn.map((p) => p.s).join(" ")).not.toMatch(/ONLINE ONLY|CANNOT GO ONLINE|GETTING READY/);
    expect(tap(t.stub.game, "opt-link")).toBe(true);
    expect(t.stub.raw.modal).toBeInstanceOf(LinkCard);
    expect((t.stub.raw.modal as LinkCard).info().step).toBe("menu");
    t.stub.game.closeModal();
    expect(tap(t.stub.game, "opt-delete")).toBe(true);
    expect((t.stub.raw.modal as LinkCard).info().step).toBe("confirm");
    // the card reads the title's k while it is up
    const L = (t.stub.raw.modal as LinkCard).info().layout;
    expect(L.card.w).toBe(Math.min(t.tv.W - 8, Math.round(220 * t.tv.k)));
  });

  it("OPTIONS while the identity loads, and after it failed: off, each with its own line", async () => {
    const gate = deferred<Identity | null>();
    startOnline(URL_, {
      fetchGhost: (async () => { throw new Error("x"); }) as never, submitGhost: (async () => { throw new Error("x"); }) as never,
      identity: () => gate.promise, store: null, now: () => NOW, save: () => undefined,
    });
    const t = titleOf();
    openMenu(t);
    expect(drawTitle(t).map((p) => p.s).join(" ")).toContain(WORDS.offLoading);
    gate.resolve(null);
    await flush();
    await flush();
    expect(drawTitle(t).map((p) => p.s).join(" ")).toContain(WORDS.offFailed);
    expect(t.stub.game.ui.regions.find((r) => r.id === "opt-link")?.onTap).toBeUndefined();
  });

  it("NEW RUN (the button, Enter and the space bar) refreshes the identity first, then goes to the hero screen; CONTINUE does not", async () => {
    const log: string[] = [];
    await session(fakeId(log));
    const t = titleOf();
    t.stub.raw.go.mockImplementation(() => void log.push("go"));
    drawTitle(t);
    expect(tap(t.stub.game, "new")).toBe(true);
    expect(log).toEqual(["refresh", "go"]);
    log.length = 0;
    t.s.key("Enter");
    expect(log).toEqual(["refresh", "go"]);
    log.length = 0;
    t.s.key(" ");
    expect(log).toEqual(["refresh", "go"]);
    log.length = 0;
    t.s.key("h"); // HOW TO PLAY is no new run
    expect(log).toEqual([]);
    // the name gate: with no name stored the first tap opens the name screen and starts nothing
    store.delete(NAME_KEY);
    tap(t.stub.game, "new");
    expect(log).toEqual([]);
    expect(t.stub.raw.openName).toHaveBeenCalledTimes(1);
  });

  it("a refresh that throws, or no session at all, never holds a new run back", async () => {
    const t = titleOf();
    drawTitle(t);
    tap(t.stub.game, "new"); // no session
    expect(t.stub.raw.go).toHaveBeenCalledTimes(1);
    const log: string[] = [];
    await session(fakeId(log, { refresh: () => { throw new Error("boom"); } }));
    drawTitle(t);
    expect(() => refreshIdentity()).not.toThrow();
    tap(t.stub.game, "new");
    expect(t.stub.raw.go).toHaveBeenCalledTimes(2);
    stopOnline();
    await session(ME); // an identity with no refresh at all (a hand-made one)
    expect(() => refreshIdentity()).not.toThrow();
    tap(t.stub.game, "new");
    expect(t.stub.raw.go).toHaveBeenCalledTimes(3);
  });

  it("the profile is read once per page load, as soon as the session has an identity; with no session, never", async () => {
    const t = titleOf();
    for (let i = 0; i < 5; i++) t.s.update(1 / 60);
    expect(syncSpy).not.toHaveBeenCalled(); // offline: nothing at all
    expect(startupSync.done).toBe(false);
    const gate = deferred<Identity | null>();
    const s = startOnline(URL_, {
      fetchGhost: (async () => { throw new Error("x"); }) as never, submitGhost: (async () => { throw new Error("x"); }) as never,
      identity: () => gate.promise, store: null, now: () => NOW, save: () => undefined,
    });
    t.s.update(1 / 60);
    expect(syncSpy).not.toHaveBeenCalled(); // the identity is still loading: look again next frame
    gate.resolve(ME);
    for (let i = 0; i < 50 && !s.active; i++) await flush();
    for (let i = 0; i < 5; i++) t.s.update(1 / 60);
    expect(syncSpy).toHaveBeenCalledTimes(1);
    expect(syncSpy).toHaveBeenCalledWith(URL_, ME);
    // another title screen in the same page load (back from a run): not again
    const t2 = titleOf();
    for (let i = 0; i < 5; i++) t2.s.update(1 / 60);
    expect(syncSpy).toHaveBeenCalledTimes(1);
    expect(startupSync.done).toBe(true);
  });

  it("a session that failed is never synced, and a sync that throws or rejects never disturbs the title", async () => {
    await session(null);
    const t = titleOf();
    for (let i = 0; i < 3; i++) t.s.update(1 / 60);
    expect(syncSpy).not.toHaveBeenCalled();
    stopOnline();
    await session(ME);
    syncSpy.mockImplementationOnce(async () => { throw new Error("rejected"); });
    expect(() => { for (let i = 0; i < 3; i++) t.s.update(1 / 60); }).not.toThrow();
    await flush();
    expect(syncSpy).toHaveBeenCalledTimes(1);
    startupSync.done = false;
    syncSpy.mockImplementationOnce((() => { throw new Error("sync throw"); }) as never);
    expect(() => t.s.update(1 / 60)).not.toThrow();
  });

  it("the title with the card open: the whole title still draws on every view (the OPTIONS card, on and off)", async () => {
    for (const [what, cw, ch, dpr] of VIEWS) {
      for (const on of [false, true]) {
        stopOnline();
        if (on) await session(ME);
        const t = titleOf([cw, ch, dpr]);
        openMenu(t);
        const drawn = drawTitle(t);
        expect(drawn.map((p) => p.s), `${what} ${on}`).toEqual(expect.arrayContaining([WORDS.linkRow, WORDS.deleteRow, "OPTIONS", "DONE"]));
        const card = t.stub.game.ui.regions.find((r) => r.id === "optcard")!.r;
        expect(card.x >= 0 && card.y >= 0 && card.x + card.w <= t.tv.W && card.y + card.h <= t.tv.H, `${what} ${on}: ${JSON.stringify(card)}`).toBe(true);
      }
    }
  });
});

// keep the wrapping helper honest: the note and the card lines wrap with the font's own greedy wrap
describe("IDENT-1 UI: wrapping", () => {
  it("the OPTIONS note wraps to the button width in the 3x5 face, the card's lines to its inner width", () => {
    expect(optionsGeometry(640, 400, 1, 1, { rows: [], note: WORDS.offLoading }).noteLines).toEqual(wrap(WORDS.offLoading, 150, "3"));
    const content = open(titleView(1280, 800, 1), "delete").card.info().content;
    const L = layoutCard(content, 640, 400, 1, 2);
    const goes = L.lines.filter((l) => WORDS.goes.includes(l.text));
    expect(goes.map((l) => l.text).join(" ")).toBe(WORDS.goes);
    for (const l of L.lines) expect(l.w).toBeLessThanOrEqual(220 - 16);
  });
});
