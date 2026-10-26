// C1 (BRIEF-C1 item 4): a FULLSCREEN on/off choice in the title's OPTIONS card. It uses requestFullscreen on the document element
// and exitFullscreen, follows the browser's own fullscreenchange (Esc leaves fullscreen too), and shows only where
// document.fullscreenEnabled is true: never a dead button. These tests are the module's logic over a fake document; the drawn card is
// c1.screens.test.ts's.
import { afterEach, describe, expect, it, vi } from "vitest";
import { fullscreenAvailable, fullscreenLabel, fullscreenRow, isFullscreen, toggleFullscreen, watchFullscreen, type FullscreenDoc } from "../src/core/fullscreen";
import { eventTarget, makeGame } from "./c1.gameHarness";

afterEach(() => vi.unstubAllGlobals());

/** A fake document the Fullscreen API runs on: requestFullscreen on the document element, exitFullscreen, fullscreenchange. */
function fakeDoc(over: Partial<FullscreenDoc> = {}) {
  const t = eventTarget();
  const calls: string[] = [];
  const doc = {
    fullscreenEnabled: true as boolean | undefined,
    fullscreenElement: null as unknown,
    documentElement: {
      requestFullscreen(): Promise<void> {
        calls.push("request");
        doc.fullscreenElement = doc.documentElement; // the browser then fires fullscreenchange
        return Promise.resolve();
      },
    },
    exitFullscreen(): Promise<void> {
      calls.push("exit");
      doc.fullscreenElement = null;
      return Promise.resolve();
    },
    addEventListener: (type: "fullscreenchange", fn: () => void) => t.addEventListener(type, fn),
    removeEventListener: (type: "fullscreenchange", fn: () => void) => t.removeEventListener(type, fn),
    ...over,
  };
  return { doc: doc as FullscreenDoc & typeof doc, calls, fire: () => t.fire("fullscreenchange"), count: () => t.count("fullscreenchange") };
}

describe("C1 item 4: where the choice shows", () => {
  it("only when document.fullscreenEnabled is true; absent, false or no document: no row, never a dead button", () => {
    expect(fullscreenAvailable(fakeDoc().doc)).toBe(true);
    expect(fullscreenAvailable(fakeDoc({ fullscreenEnabled: false }).doc)).toBe(false);
    expect(fullscreenAvailable(fakeDoc({ fullscreenEnabled: undefined }).doc)).toBe(false); // an iPhone's Safari
    expect(fullscreenAvailable(undefined)).toBe(false);
    expect(fullscreenAvailable()).toBe(false); // node: no document
    expect(fullscreenRow(fakeDoc({ fullscreenEnabled: false }).doc)).toBeNull();
    expect(fullscreenRow(undefined)).toBeNull();
    expect(fullscreenRow()).toBeNull();
    vi.stubGlobal("document", fakeDoc().doc); // the page's own document is the default
    expect(fullscreenRow()).toEqual({ label: "FULLSCREEN: OFF", active: false });
  });

  it("the row reads ON or OFF from the document's fullscreenElement, in the words of REDUCED MOTION: ON and SOUND: OFF", () => {
    const f = fakeDoc();
    expect(fullscreenRow(f.doc)).toEqual({ label: "FULLSCREEN: OFF", active: false });
    f.doc.fullscreenElement = {};
    expect(fullscreenRow(f.doc)).toEqual({ label: "FULLSCREEN: ON", active: true });
    expect(fullscreenLabel(true)).toBe("FULLSCREEN: ON");
    expect(fullscreenLabel(false)).toBe("FULLSCREEN: OFF");
    expect(isFullscreen(f.doc)).toBe(true);
    f.doc.fullscreenElement = null;
    expect(isFullscreen(f.doc)).toBe(false);
    expect(isFullscreen(undefined)).toBe(false);
  });
});

describe("C1 item 4: the toggle", () => {
  it("off: requestFullscreen on the document element; on: exitFullscreen; one call each, from a tap", () => {
    const f = fakeDoc();
    toggleFullscreen(f.doc);
    expect(f.calls).toEqual(["request"]);
    expect(isFullscreen(f.doc)).toBe(true);
    toggleFullscreen(f.doc);
    expect(f.calls).toEqual(["request", "exit"]);
    expect(isFullscreen(f.doc)).toBe(false);
  });

  it("requestFullscreen is called as a method of the document element (its `this`), and exitFullscreen of the document", () => {
    const f = fakeDoc();
    let reqThis: unknown, exitThis: unknown;
    f.doc.documentElement.requestFullscreen = function (this: unknown) { reqThis = this; return Promise.resolve(); };
    f.doc.exitFullscreen = function (this: unknown) { exitThis = this; return Promise.resolve(); };
    toggleFullscreen(f.doc);
    f.doc.fullscreenElement = {};
    toggleFullscreen(f.doc);
    expect(reqThis).toBe(f.doc.documentElement);
    expect(exitThis).toBe(f.doc);
  });

  it("where the browser cannot do it, nothing is called; a refusal (a rejection or a throw) is quiet", async () => {
    const off = fakeDoc({ fullscreenEnabled: false });
    toggleFullscreen(off.doc);
    expect(off.calls).toEqual([]);
    toggleFullscreen(undefined);
    const refuse = fakeDoc();
    refuse.doc.documentElement.requestFullscreen = () => Promise.reject(new Error("not allowed without a gesture"));
    expect(() => toggleFullscreen(refuse.doc)).not.toThrow();
    const throws = fakeDoc();
    throws.doc.documentElement.requestFullscreen = () => { throw new TypeError("not implemented"); };
    expect(() => toggleFullscreen(throws.doc)).not.toThrow();
    throws.doc.fullscreenElement = {};
    throws.doc.exitFullscreen = () => { throw new TypeError("not implemented"); };
    expect(() => toggleFullscreen(throws.doc)).not.toThrow();
    const bare = fakeDoc({ documentElement: undefined, exitFullscreen: undefined });
    expect(() => toggleFullscreen(bare.doc)).not.toThrow(); // an engine with the flag and no methods
    await new Promise((r) => setTimeout(r, 5)); // no unhandled rejection
  });
});

describe("C1 item 4: the label follows fullscreenchange (Esc leaves fullscreen too)", () => {
  it("watchFullscreen tells the state on each fullscreenchange, however it came about; it stops when asked", () => {
    const f = fakeDoc();
    const seen: boolean[] = [];
    const stop = watchFullscreen((on) => seen.push(on), f.doc);
    toggleFullscreen(f.doc);
    f.fire(); // the browser's event after the request
    f.doc.fullscreenElement = null; // Esc, or a browser button: no call of ours
    f.fire();
    expect(seen).toEqual([true, false]);
    expect(fullscreenRow(f.doc)).toEqual({ label: "FULLSCREEN: OFF", active: false }); // the label is in step
    stop();
    expect(f.count()).toBe(0);
    f.fire();
    expect(seen).toEqual([true, false]);
    expect(watchFullscreen(() => seen.push(true), undefined)()).toBeUndefined(); // no document: listens to nothing
  });

  it("the Game re-frames on every fullscreenchange (the window changed size), and its listener is the document's", () => {
    const r = makeGame({ w: 1280, h: 800, dpr: 1 });
    const resize = vi.spyOn(r.game, "resize");
    expect(r.doc.count("fullscreenchange")).toBe(1);
    r.doc.fire("fullscreenchange");
    r.doc.fire("fullscreenchange");
    expect(resize).toHaveBeenCalledTimes(2);
    // entering fullscreen on a desk: the window grows; the resize that follows frames the new size
    r.win.innerWidth = 1920;
    r.win.innerHeight = 1080;
    r.win.fire("resize");
    expect(r.game.view.W * r.game.view.scale).toBeGreaterThan(1280);
  });
});
