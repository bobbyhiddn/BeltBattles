// S6D Goal 3 (REQ-BFG-119): the title's OPTIONS row MY PLAYER ID (id opt-id) and its card (src/screens/linkCards.ts). The operator decided that a player who
// lost every device can quote their own ID, so the game shows it: a readable code made from the player ID (src/net/playerCode.ts), the NAME#TAG other
// players see (src/net/names.ts displayName), and one dim line telling the player to quote the code if they write to us about their data.
// Pinned here: the row's place (LINK A DEVICE, MY PLAYER ID, DELETE MY ONLINE DATA, PRIVACY) and label; that it is on exactly when LINK A DEVICE is on and off
// with the same note otherwise; that its tap opens the card; the card's title, code (the code of identity.playerId, which on a linked device is the player it
// is linked to), the line about what other players see (with a name, with none, the longest name), the dim line and CLOSE; that the code is drawn as big as
// the card holds (the largest scale of the 5x7 face that fits, as the link code is); that the card fits every view the other pins check (desk 1280x800,
// 402x690 @3, 360x640 @2, 844x390 @3, 740x360 @3) in all four session states, with every line inside its card and the draw equal to the layout; that the OPTIONS
// card with its nine rows fits the same views; that the card sends nothing; and that every word is a capital the faces have, with whole sentences.
// The stand-in Game, the recording canvas and the views are the small ones tests/ident1.ui.test.ts and tests/m1.options.test.ts each carry (a test file
// cannot be imported without running it).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { computeView, defaultScale } from "../src/core/io";
import type { Game, Modal } from "../src/game/game";
import { startOnline, stopOnline } from "../src/game/online";
import { setSession } from "../src/game/session";
import type { Identity } from "../src/net/identity";
import { NAME_KEY, displayName, nameTag } from "../src/net/names";
import { playerCode } from "../src/net/playerCode";
import { faceChars, textWidth } from "../src/render/font";
import type { G } from "../src/render/pixel";
import { LinkCard, WORDS, linkAvailability, optionsExtras, seenLine, type Availability, type LinkCardDeps } from "../src/screens/linkCards";
import { TitleScreen, startupSync } from "../src/screens/title";
import { titleScale } from "../src/screens/titleLayout";
import { optionsCard, optionsGeometry } from "../src/ui/hud";
import { UI } from "../src/ui/ui";
import { banned } from "./textRules";

// ------------------------------------------------------------ what drawText was asked to draw (tests/ident1.ui.test.ts's way)
interface Placed { s: string; left: number; w: number; y: number; font: string; scale: number }
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

const store = new Map<string, string>();
const fetchSpy = vi.fn(() => { throw new Error("the MY PLAYER ID card must send nothing"); });
beforeAll(() => {
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k),
    key: () => null, length: 0, clear: () => store.clear(),
  });
  vi.stubGlobal("fetch", fetchSpy);
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  placed.length = 0;
  store.clear();
  store.set(NAME_KEY, "ANNA");
  startupSync.done = false;
  fetchSpy.mockClear();
  // the page's document as the cards read it: the Fullscreen API (C1's row) and a canvas factory (the title's sprites); no body, so no HTML row
  vi.stubGlobal("document", { createElement: () => recCanvas(), fullscreenEnabled: true, fullscreenElement: null, documentElement: {}, exitFullscreen: () => undefined });
});
afterEach(() => {
  stopOnline();
  setSession(null);
});

// ------------------------------------------------------------ the views, and a stand-in Game on a title view
const NOW = 1_790_000_000_000;
const URL_ = "https://ghosts.example";
const idOf = (seed: string): string => createHash("sha256").update(seed).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); // base64url (the tests' type shim for node:crypto knows only base64 and hex)
const ME: Identity = { playerId: idOf("s6d me"), publicKey: new Uint8Array(65), sign: async () => ({ key: "k", sig: "s" }) };
/** A linked device: its own key is K, the player it is linked to is P, and identity.playerId is P (net/identity.ts), the ID its uploads carry. */
const KEY_ID = idOf("s6d linked device key");
const PLAYER_ID = idOf("s6d the player it is linked to");
const LINKED: Identity = { playerId: PLAYER_ID, keyId: KEY_ID, publicKey: new Uint8Array(65), sign: async () => ({ key: "k", sig: "s" }) };

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

interface Stub { game: Game; raw: { modal: Modal | null; t: number }; tv: TV }
function stubGame(tv: TV): Stub {
  const raw = {
    run: null, audio: { mode: 0, play: vi.fn(), unlock() {}, music() {} }, view: tv, W: tv.W, H: tv.H, portrait: tv.portrait, t: 0, ui: new UI(),
    canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: (tv.W * tv.scale) / tv.dpr, height: (tv.H * tv.scale) / tv.dpr }) },
    toast() {}, error() {}, soundButton() {}, cycleSound() {}, transitioning: false, resize() {}, go: vi.fn(), openName: vi.fn(),
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

/** One frame: what `f` draws into a recording canvas, the UI regions it registered, and what drawText was asked for. */
function frame(game: Game, f: (g: G) => void): Placed[] {
  placed.length = 0;
  game.ui.begin();
  f(recCanvas().getContext());
  game.ui.end();
  return [...placed];
}
/** A tap on a UI region by id, as Game.pointerUp makes it. false: no such region or no handler. */
function tap(game: Game, id: string): boolean {
  const r = game.ui.regions.find((x) => x.id === id);
  if (!r || !r.onTap) return false;
  r.onTap();
  return true;
}
const flush = async (): Promise<void> => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

const ON: Availability = { on: true, session: { url: URL_, identity: ME } };
const STATES: [string, Availability][] = [
  ["online", ON],
  ["no session", { on: false, why: WORDS.offNone }],
  ["failed", { on: false, why: WORDS.offFailed }],
  ["loading", { on: false, why: WORDS.offLoading }],
];

/** Link calls that must never be made by the MY PLAYER ID card: any call is a failure. */
function neverDeps(over: Partial<LinkCardDeps> = {}): LinkCardDeps {
  const no = (what: string) => (async () => { throw new Error(`the MY PLAYER ID card called ${what}`); }) as never;
  return { requestLinkCode: no("requestLinkCode"), redeemLinkCode: no("redeemLinkCode"), deleteOnlineData: no("deleteOnlineData"), availability: () => ON, now: () => NOW, ...over };
}

interface Opened { stub: Stub; card: LinkCard }
function open(tv: TV, over: Partial<LinkCardDeps> = {}): Opened {
  const stub = stubGame(tv);
  const card = new LinkCard(stub.game, "id", () => tv.k, neverDeps(over));
  stub.raw.modal = card;
  return { stub, card };
}
const draw = (o: Opened): Placed[] => frame(o.stub.game, (g) => o.card.draw(g));
const texts = (o: Opened): string[] => o.card.info().content.lines.map((l) => l.text);

// ------------------------------------------------------------ the row
describe("S6D: the MY PLAYER ID row", () => {
  it("is labelled MY PLAYER ID, has the id opt-id, and sits between LINK A DEVICE and DELETE MY ONLINE DATA, with PRIVACY last, in every state", () => {
    expect(WORDS.idRow).toBe("MY PLAYER ID");
    expect(WORDS.idTitle).toBe("MY PLAYER ID");
    for (const [state, a] of STATES) {
      const x = optionsExtras(stubGame(titleView(402, 690, 3)).game, () => 1, { availability: () => a });
      expect(x.rows.map((r) => r.id), state).toEqual(["opt-link", "opt-id", "opt-delete", "opt-privacy"]);
      expect(x.rows.map((r) => r.label), state).toEqual(["LINK A DEVICE", "MY PLAYER ID", "DELETE MY ONLINE DATA", "PRIVACY"]);
    }
  });

  it("is on exactly when LINK A DEVICE is on, and off with the same one note line otherwise", () => {
    for (const [state, a] of STATES) {
      const x = optionsExtras(stubGame(titleView(402, 690, 3)).game, () => 1, { availability: () => a });
      const [link, id, del] = x.rows;
      expect(!!id.disabled, state).toBe(!a.on);
      expect(!!id.disabled, `${state}: the same as LINK`).toBe(!!link.disabled);
      expect(!!id.disabled, `${state}: the same as DELETE`).toBe(!!del.disabled);
      expect(x.note, state).toBe(a.on ? undefined : a.why); // one note under the rows, whichever of the three is off
    }
  });

  it("follows the page's own online session: none, loading, failed and active (the real linkAvailability)", async () => {
    const game = stubGame(titleView(402, 690, 3)).game;
    const rowsNow = () => optionsExtras(game, () => 1).rows;
    expect(rowsNow()[1].disabled).toBe(true); // no session at all
    let release!: (id: Identity | null) => void;
    const gate = new Promise<Identity | null>((r) => { release = r; });
    const s = startOnline(URL_, {
      fetchGhost: (async () => { throw new Error("x"); }) as never, submitGhost: (async () => { throw new Error("x"); }) as never,
      identity: () => gate, store: null, now: () => NOW, save: () => undefined,
    });
    expect(rowsNow()[1].disabled, "loading").toBe(true);
    release(ME);
    for (let i = 0; i < 50 && !s.active; i++) await flush();
    expect(linkAvailability().on).toBe(true);
    expect(rowsNow().map((r) => !!r.disabled)).toEqual([false, false, false, false]);
    stopOnline();
    const bad = startOnline(URL_, {
      fetchGhost: (async () => { throw new Error("x"); }) as never, submitGhost: (async () => { throw new Error("x"); }) as never,
      identity: async () => null, store: null, now: () => NOW, save: () => undefined,
    });
    for (let i = 0; i < 50 && !bad.failed; i++) await flush();
    expect(rowsNow().map((r) => !!r.disabled)).toEqual([true, true, true, false]); // failed: LINK, MY PLAYER ID and DELETE off, PRIVACY on
  });

  it("a tap opens the card (a LinkCard at its id step) while on, and does nothing while off", () => {
    for (const [state, a] of STATES) {
      const stub = stubGame(titleView(402, 690, 3));
      const opened: Modal[] = [];
      (stub.game as unknown as { openModal: (m: Modal) => void }).openModal = (m) => void opened.push(m);
      const id = optionsExtras(stub.game, () => 1, { availability: () => a }).rows[1];
      if (a.on) {
        expect(typeof id.onTap, state).toBe("function");
        id.onTap!();
        expect(opened, state).toHaveLength(1);
        expect(opened[0], state).toBeInstanceOf(LinkCard);
        expect((opened[0] as LinkCard).info().step, state).toBe("id");
      } else {
        // a disabled row is drawn off by the OPTIONS card and takes no tap (hud.ts optionsCard); the row's own handler is never reached
        expect(id.disabled, state).toBe(true);
      }
    }
  });

  it("drawn in the OPTIONS card with the title's options (FULLSCREEN too): nine rows, MY PLAYER ID between LINK and DELETE one step apart, on every view and in every state", () => {
    const done = { id: "optdone", label: "DONE", primary: true, onTap: () => undefined };
    for (const [what, cw, ch, dpr] of VIEWS) {
      const tv = titleView(cw, ch, dpr);
      for (const [state, a] of STATES) {
        const at = `${what} ${tv.W}x${tv.H} k ${tv.k.toFixed(2)} ${state}`;
        const stub = stubGame(tv);
        const extras = optionsExtras(stub.game, () => tv.k, { availability: () => a });
        let card = { x: 0, y: 0, w: 0, h: 0 };
        const drawn = frame(stub.game, (g) => { card = optionsCard(stub.game, g, "OPTIONS", [done], () => undefined, tv.k, extras, { fullscreen: true }); });
        const geo = optionsGeometry(tv.W, tv.H, tv.k, 1, extras, true);
        expect(card, at).toEqual(geo.card);
        expect(card.x >= 0 && card.y >= 0 && card.x + card.w <= tv.W && card.y + card.h <= tv.H, `${at}: card ${JSON.stringify(card)} on ${tv.W}x${tv.H}`).toBe(true);
        const ids = stub.game.ui.regions.map((r) => r.id);
        expect(ids, at).toEqual(["optbg", "optcard", "optdone", "opt-rm", "opt-snd", "opt-fs", "opt-name", "opt-link", "opt-id", "opt-delete", "opt-privacy"]); // nine rows
        expect(ids.length - 2, `${at}: nine buttons`).toBe(9);
        const reg = (id: string) => stub.game.ui.regions.find((r) => r.id === id)!;
        expect(reg("opt-id").r.y, at).toBe(reg("opt-link").r.y + geo.step);
        expect(reg("opt-delete").r.y, at).toBe(reg("opt-id").r.y + geo.step);
        expect([reg("opt-id").r.w, reg("opt-id").r.h], at).toEqual([geo.bw, geo.bh]);
        const p = drawn.find((x) => x.s === WORDS.idRow && x.y >= reg("opt-id").r.y && x.y < reg("opt-id").r.y + reg("opt-id").r.h);
        expect(p, `${at}: MY PLAYER ID drawn in its row`).toBeTruthy();
        expect(p!.left >= reg("opt-id").r.x + 2 && p!.left + p!.w <= reg("opt-id").r.x + reg("opt-id").r.w - 2, `${at}: the label inside its button`).toBe(true);
        expect(typeof reg("opt-id").onTap === "function", at).toBe(a.on);
        // the note sits under the last row, inside the card, only while the rows are off
        expect(geo.noteLines.join(" "), at).toBe(a.on ? "" : a.why);
        expect(card.h, at).toBe(18 + 9 * geo.step + 4 + geo.noteLines.length * 7);
      }
    }
  });
});

// ------------------------------------------------------------ the card's content
describe("S6D: the MY PLAYER ID card", () => {
  it("shows the title, the code of the player ID, what other players see, one dim line and CLOSE", () => {
    const o = open(titleView(402, 690, 3), { name: () => "ANNA" });
    const { step, content } = o.card.info();
    expect(step).toBe("id");
    expect(content.title).toBe("MY PLAYER ID");
    expect(content.lines.map((l) => l.text)).toEqual([playerCode(ME.playerId), `OTHER PLAYERS SEE YOU AS ANNA#${nameTag(ME.playerId)}.`, "QUOTE THIS CODE IF YOU WRITE TO US ABOUT YOUR DATA."]);
    expect(content.lines.map((l) => [!!l.big, l.tone])).toEqual([[true, undefined], [false, undefined], [false, "dim"]]); // the code big; the dim line dim
    expect(content.buttons.map((b) => [b.id, b.label, !!b.primary])).toEqual([["id-close", "CLOSE", true]]);
    expect(content.lines[1].text).toBe(`OTHER PLAYERS SEE YOU AS ${displayName("ANNA", ME.playerId)}.`);
    expect(playerCode(ME.playerId)).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
    expect(WORDS.quoteIt).toBe("QUOTE THIS CODE IF YOU WRITE TO US ABOUT YOUR DATA.");
  });

  it("with no name yet it says what other players see then: nothing until the player picks one (a ghost is uploaded only with a name)", () => {
    const o = open(titleView(402, 690, 3), { name: () => null });
    expect(texts(o)).toEqual([playerCode(ME.playerId), WORDS.seenNoName, WORDS.quoteIt]);
    expect(WORDS.seenNoName).toBe("YOU HAVE NO NAME YET. OTHER PLAYERS SEE YOU ONLY AFTER YOU PICK ONE.");
    expect(seenLine(null, ME.playerId)).toBe(WORDS.seenNoName);
  });

  it("reads the name the uploads carry by default (ghostSnapshot.ts currentName: the stored name), live", () => {
    const stub = stubGame(titleView(402, 690, 3));
    const card = new LinkCard(stub.game, "id", () => 1, neverDeps());
    stub.raw.modal = card;
    const line = () => card.info().content.lines[1].text;
    expect(line()).toBe(`OTHER PLAYERS SEE YOU AS ANNA#${nameTag(ME.playerId)}.`); // beforeEach stored ANNA
    store.set(NAME_KEY, "MIRA");
    expect(line()).toBe(`OTHER PLAYERS SEE YOU AS MIRA#${nameTag(ME.playerId)}.`); // a changed name shows on the next frame
    store.delete(NAME_KEY);
    expect(line()).toBe(WORDS.seenNoName);
  });

  it("on a linked device it shows the code (and the tag) of the player it is linked to, which is what its uploads carry, not of its own key", () => {
    const o = open(titleView(402, 690, 3), { name: () => "ANNA", availability: () => ({ on: true, session: { url: URL_, identity: LINKED } }) });
    const t = texts(o);
    expect(t[0]).toBe(playerCode(PLAYER_ID));
    expect(t[0]).not.toBe(playerCode(KEY_ID));
    expect(t[1]).toBe(`OTHER PLAYERS SEE YOU AS ANNA#${nameTag(PLAYER_ID)}.`);
    expect(nameTag(PLAYER_ID)).not.toBe(nameTag(KEY_ID)); // these two IDs happen to have different tags, so the line proves which one it used
    // identity.playerId is read live: the title's NEW RUN refreshes it after a link, and the card follows
    let current = KEY_ID;
    const live: Identity = { ...LINKED, get playerId() { return current; } };
    const p = open(titleView(402, 690, 3), { name: () => "ANNA", availability: () => ({ on: true, session: { url: URL_, identity: live } }) });
    expect(texts(p)[0]).toBe(playerCode(KEY_ID));
    current = PLAYER_ID;
    expect(texts(p)[0]).toBe(playerCode(PLAYER_ID));
  });

  it("if the session goes away under the card it says why (the same line the row's note gives) and offers CLOSE, with no code", () => {
    let on = true;
    const o = open(titleView(402, 690, 3), { availability: () => (on ? ON : { on: false, why: WORDS.offFailed }) });
    expect(texts(o)[0]).toBe(playerCode(ME.playerId));
    on = false;
    expect(texts(o)).toEqual([WORDS.offFailed]);
    expect(o.card.info().content.buttons.map((b) => b.label)).toEqual(["CLOSE"]);
    expect(draw(o).map((p) => p.s)).not.toContain(playerCode(ME.playerId));
  });

  it("CLOSE, Escape and Enter: CLOSE and Escape leave; Enter leaves the card as it is; a tap outside the card or on it changes nothing", () => {
    const o = open(titleView(402, 690, 3));
    draw(o);
    expect(tap(o.stub.game, "linkbg")).toBe(true); // a tap outside the card: its own handler (focus), no close
    expect(tap(o.stub.game, "linkcard")).toBe(true);
    expect(o.stub.raw.modal).toBe(o.card);
    o.card.key("Enter");
    expect(o.stub.raw.modal).toBe(o.card);
    expect(tap(o.stub.game, "id-close")).toBe(true);
    expect(o.stub.raw.modal).toBeNull();
    const p = open(titleView(402, 690, 3));
    p.card.key("Escape");
    expect(p.stub.raw.modal).toBeNull();
  });

  it("sends nothing: no link call, no fetch, however many frames it draws and whatever the player does", () => {
    const o = open(titleView(402, 690, 3));
    for (let i = 0; i < 5; i++) draw(o);
    o.card.key("Enter");
    o.card.key("x");
    tap(o.stub.game, "id-close");
    expect(fetchSpy).not.toHaveBeenCalled();
    // and the same through the row and the real defaults: opening it by the row's tap calls nothing either
    const stub = stubGame(titleView(402, 690, 3));
    const row = optionsExtras(stub.game, () => 1, { availability: () => ON }).rows[1];
    row.onTap!();
    expect(stub.raw.modal).toBeInstanceOf(LinkCard);
    for (let i = 0; i < 3; i++) frame(stub.game, (g) => stub.raw.modal!.draw(g));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------------ the words
describe("S6D: the words of the card", () => {
  it("are capitals in glyphs both faces have, with whole sentences and their full stops, and the % where the name goes is replaced", () => {
    const five = new Set(faceChars("5")), three = new Set(faceChars("3"));
    const all = [WORDS.idRow, WORDS.idTitle, WORDS.seenAs, WORDS.seenNoName, WORDS.quoteIt, WORDS.close, seenLine("ANNA", ME.playerId), seenLine("WWWWWWWWWW", ME.playerId), seenLine("A-1 B-2 C-3", ME.playerId), seenLine(null, ME.playerId), playerCode(ME.playerId)];
    for (const w of all) {
      for (const ch of w) expect(five.has(ch) && three.has(ch), `"${w}": "${ch}" has no glyph in both faces`).toBe(true);
      expect(w, w).toBe(w.toUpperCase());
      expect(w, w).not.toMatch(/·|\n|\s{2}/);
    }
    for (const w of [WORDS.seenAs, WORDS.seenNoName, WORDS.quoteIt, seenLine("ANNA", ME.playerId), seenLine(null, ME.playerId)]) {
      expect(banned(w), w).toEqual([]);
      expect(w, w).toMatch(/\.$/);
    }
    expect(WORDS.seenAs.split("%")).toHaveLength(2); // exactly one place for the name
    for (const name of ["ANNA", "WWWWWWWWWW", "A-1 B-2 C-3"]) expect(seenLine(name, ME.playerId), name).not.toContain("%");
    expect(WORDS.idRow.length).toBeLessThanOrEqual(21); // a label: it must fit the OPTIONS button, which the views test below also checks
    expect(WORDS.idRow).not.toMatch(/\./);
    // the line is a whole sentence, and a name cannot break it: the % is replaced as a function's result, never as a pattern
    expect(seenLine("A$&B", ME.playerId)).toBe(`OTHER PLAYERS SEE YOU AS A$&B#${nameTag(ME.playerId)}.`);
  });
});

// ------------------------------------------------------------ the card on every view
/** A state of the card, checked against its view: on the screen, every line inside the card and clear of its neighbours, the label inside its button, and
 *  the draw is the layout. The code is drawn as big as the card holds: the largest of scales 3, 2 and 1 whose width and outline fit the inner width. */
function checkIdCard(what: string, o: Opened): { scale: number; card: { x: number; y: number; w: number; h: number }; spare: number; code: string } {
  const tv = o.stub.tv;
  const drawn = draw(o);
  const { layout: L, step, content } = o.card.info();
  const at = `${what} [${step}] ${tv.W}x${tv.H} k ${tv.k.toFixed(2)}`;
  const c = L.card;
  expect(step, at).toBe("id");
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
  expect(L.buttons).toHaveLength(1);
  const b = L.buttons[0];
  expect(b.label, at).toBe("CLOSE");
  expect(b.r.x >= c.x && b.r.x + b.r.w <= c.x + c.w && b.r.y >= c.y && b.r.y + b.r.h <= c.y + c.h, `${at}: CLOSE inside the card`).toBe(true);
  expect(b.r.y, `${at}: CLOSE below the text`).toBeGreaterThanOrEqual(last.y + fh(last));
  expect(textWidth(b.label, b.font as "5" | "3"), `${at}: "CLOSE" in its button`).toBeLessThanOrEqual(b.r.w - 6);
  expect(b.r.h, at).toBeGreaterThanOrEqual(19);
  // the draw is the layout
  const want = [...lines.map((l) => l.text), b.label].sort();
  expect(drawn.map((p) => p.s).sort(), `${at}: what is drawn`).toEqual(want);
  for (const l of lines) {
    const p = drawn.find((x) => x.s === l.text)!;
    expect(Math.abs(p.left - (l.x - l.w / 2)) <= 1 && p.w === l.w && p.scale === l.scale && p.font === l.font, `${at}: "${l.text}" is drawn where the layout puts it`).toBe(true);
  }
  // the code is on its own line, the first below the title, drawn big: the largest scale that fits
  const code = L.lines.find((l) => l.tone === "code")!;
  expect(code.text, at).toBe(content.lines[0].text);
  expect(code.font, at).toBe("5");
  const iw = c.w - 16;
  const base = textWidth(code.text);
  const best = [3, 2, 1].find((s) => base * s + 2 * s <= iw) ?? 1;
  expect(code.scale, `${at}: the code at the largest scale that fits (${base} px wide, room ${iw})`).toBe(best);
  expect(L.lines.filter((l) => l.tone === "code"), at).toHaveLength(1);
  return { scale: code.scale, card: c, spare: tv.H - (c.y + c.h), code: code.text };
}

describe("S6D: the MY PLAYER ID card fits every view", () => {
  const NAMES: [string, () => string | null][] = [["ANNA", () => "ANNA"], ["the widest name", () => "WWWWWWWWWW"], ["a name with spaces and hyphens", () => "A-1 B-2 C-3"], ["no name", () => null]];

  for (const [what, cw, ch, dpr] of VIEWS) {
    it(`${what}: with a name, the widest name, hyphens and spaces, no name, a linked device and a session gone, in each of the four session states' views`, () => {
      const tv = titleView(cw, ch, dpr);
      for (const [label, name] of NAMES) {
        for (const identity of [ME, LINKED]) {
          const o = open(tv, { name, availability: () => ({ on: true, session: { url: URL_, identity } }) });
          const r = checkIdCard(`${what} ${label} ${identity === ME ? "own key" : "linked"}`, o);
          expect(r.scale).toBeGreaterThanOrEqual(1);
          o.stub.game.closeModal();
        }
      }
      // the four session states of the title: the card opens from the row only while on, but a session that goes away under it shows the reason, and that fits too
      for (const [state, a] of STATES) {
        const o = open(tv, { name: () => "ANNA", availability: () => a });
        const drawn = draw(o);
        const { layout: L } = o.card.info();
        const c = L.card;
        expect(c.x >= 0 && c.y >= 0 && c.x + c.w <= tv.W && c.y + c.h <= tv.H, `${what} ${state}: card ${JSON.stringify(c)} on the screen`).toBe(true);
        for (const l of L.lines) expect(l.x - l.w / 2 >= c.x + 4 && l.x + l.w / 2 <= c.x + c.w - 4, `${what} ${state}: "${l.text}" inside the card`).toBe(true);
        expect(drawn.map((p) => p.s).includes(playerCode(ME.playerId)), `${what} ${state}`).toBe(a.on);
      }
    });
  }

  it("the code is as big as the card holds: scale 1 on the desk's narrow card, 2 on a phone that gives the card the room, and never above 3", () => {
    const scales = VIEWS.map(([what, cw, ch, dpr]) => [what, checkIdCard(what, open(titleView(cw, ch, dpr), { name: () => "ANNA" })).scale] as const);
    for (const [, s] of scales) expect(s >= 1 && s <= 3).toBe(true);
    // the card is 220 logical px at k = 1 (the desk and the phone on its side), where 19 characters at scale 2 are wider than its 204 px inside
    expect(textWidth("0000-0000-0000-0000") * 2 + 4).toBeGreaterThan(204);
    expect(textWidth("0000-0000-0000-0000") + 2).toBeLessThanOrEqual(204);
    expect(scales.find(([w]) => w.startsWith("desk"))![1]).toBe(1);
  });

  it("the card sits near the top of the screen, centred, at most the width the other cards have (a phone's keyboard leaves it in view)", () => {
    for (const [what, cw, ch, dpr] of VIEWS) {
      const tv = titleView(cw, ch, dpr);
      const { card } = open(tv).card.info().layout;
      expect(card.y, what).toBe(Math.max(4, Math.round(tv.H * 0.08)));
      expect(card.w, what).toBe(Math.min(tv.W - 8, Math.round(220 * tv.k)));
      expect(Math.abs(card.x + card.w / 2 - tv.W / 2), what).toBeLessThanOrEqual(0.5);
    }
  });
});

// ------------------------------------------------------------ the real title
describe("S6D: the title's OPTIONS card opens it", () => {
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
    (s as unknown as { menu: boolean }).menu = true;
    for (let i = 0; i < 3; i++) s.update(1 / 60);
    return { s, stub, tv };
  }
  async function session(identity: Identity | null) {
    const s = startOnline(URL_, {
      fetchGhost: (async () => { throw new Error("x"); }) as never, submitGhost: (async () => { throw new Error("x"); }) as never,
      identity: async () => identity, store: null, now: () => NOW, save: () => undefined,
    });
    for (let i = 0; i < 50 && s.identity === undefined; i++) await flush();
    return s;
  }

  it("with an active session: the row takes a tap, the card shows this player's code and tag, and CLOSE goes back to the title; every view", async () => {
    await session(ME);
    for (const css of [[1280, 800, 1], [402, 690, 3], [360, 640, 2], [844, 390, 3], [740, 360, 3]] as const) {
      const t = titleOf(css);
      const drawn = frame(t.stub.game, (g) => t.s.draw(g));
      expect(drawn.map((p) => p.s), `${css}`).toContain(WORDS.idRow);
      const extra = ["opt-link", "opt-id", "opt-delete", "opt-privacy"];
      expect(t.stub.game.ui.regions.map((r) => r.id).filter((id) => extra.includes(id)), `${css}`).toEqual(extra);
      expect(tap(t.stub.game, "opt-id"), `${css}`).toBe(true);
      const card = t.stub.raw.modal as LinkCard;
      expect(card).toBeInstanceOf(LinkCard);
      expect(card.info().step).toBe("id");
      const shown = frame(t.stub.game, (g) => card.draw(g)).map((p) => p.s);
      expect(shown, `${css}`).toEqual(expect.arrayContaining(["MY PLAYER ID", playerCode(ME.playerId), "CLOSE"]));
      expect(shown.join(" "), `${css}`).toContain(`OTHER PLAYERS SEE YOU AS ANNA#${nameTag(ME.playerId)}.`); // wrapped lines read back whole
      expect(shown.join(" "), `${css}`).toContain("QUOTE THIS CODE IF YOU WRITE TO US ABOUT YOUR DATA.");
      expect(tap(t.stub.game, "id-close")).toBe(true);
      expect(t.stub.raw.modal).toBeNull();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("with no session the row is drawn off with the one note line, and a tap opens nothing", () => {
    const t = titleOf();
    const drawn = frame(t.stub.game, (g) => t.s.draw(g));
    const row = t.stub.game.ui.regions.find((r) => r.id === "opt-id");
    expect(row, "the row is there").toBeTruthy();
    expect(row!.onTap).toBeUndefined();
    expect(drawn.map((p) => p.s)).toContain(WORDS.idRow);
    expect(drawn.map((p) => p.s).join(" ")).toContain(WORDS.offNone);
    expect(tap(t.stub.game, "opt-id")).toBe(false);
    expect(t.stub.raw.modal).toBeNull();
  });
});
